# Captcha Challenge Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract cookie/banner dismissal, Cloudflare Turnstile handling, and CAPTCHA detection into `worker/challenges.ts`, and replace the `blocked` flag with `captchaRequired` throughout.

**Architecture:** A new `challenges.ts` module exposes four functions (`dismissCookieBanners`, `handleTurnstile`, `detectCaptcha`, `runChallenges`) called by `scraper.ts`. The `blocked?: boolean` return field is renamed to `captchaRequired?: boolean`. `index.ts` updates its branch accordingly.

**Tech Stack:** TypeScript, selenium-webdriver 4.44.0

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `worker/challenges.ts` | All challenge/banner/captcha logic |
| Modify | `worker/scraper.ts` | Remove inline challenge code, wire in challenges.ts, rename return field |
| Modify | `worker/index.ts` | Rename `blocked` → `captchaRequired`, update log/sheet message |

---

## Task 1: Create `worker/challenges.ts`

**Files:**
- Create: `worker/challenges.ts`

- [ ] **Step 1: Create the file with all four functions**

```typescript
import { By, WebDriver } from 'selenium-webdriver'

const ACCEPT_TEXTS = [
  'allow all', 'accept all', 'accept cookies', 'agree to all',
  'i agree', 'agree', 'ok', 'got it', 'allow cookies', 'allow selection',
  'accept', 'continue', 'confirm', 'consent', 'i accept', 'yes',
  'i am human', "i'm human", 'verify you are human', 'proceed',
]

const FRAMEWORK_SELECTORS = [
  '#onetrust-accept-btn-handler',
  '#CybotCookiebotDialogBodyButtonAccept',
  '.cc-accept',
  '[data-testid="cookie-accept"]',
  '#truste-consent-button',
  'button[id*="accept"]',
  'button[id*="cookie"]',
]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function dismissCookieBanners(driver: WebDriver): Promise<void> {
  // Pass 1: known framework selectors
  for (const selector of FRAMEWORK_SELECTORS) {
    try {
      const el = await driver.findElement(By.css(selector))
      await el.click()
      await sleep(1000)
      return
    } catch { /* not found — try next */ }
  }

  // Pass 2: text scan
  try {
    const buttons = await driver.findElements(
      By.css('button, a[role="button"], input[type="button"], input[type="submit"]')
    )
    for (const btn of buttons) {
      try {
        const text = (
          (await btn.getText()).toLowerCase().trim() ||
          ((await btn.getAttribute('value')) ?? '').toLowerCase().trim() ||
          ((await btn.getAttribute('aria-label')) ?? '').toLowerCase().trim()
        )
        if (ACCEPT_TEXTS.some((t) => text === t || text.startsWith(t))) {
          await btn.click()
          await sleep(1000)
          return
        }
      } catch { /* stale or hidden element */ }
    }
  } catch { /* ignore */ }
}

export async function handleTurnstile(driver: WebDriver): Promise<void> {
  try {
    const frames = await driver.findElements(By.css('iframe'))
    for (const frame of frames) {
      try {
        const src = (await frame.getAttribute('src')) ?? ''
        if (
          src.includes('cloudflare') ||
          src.includes('turnstile') ||
          src.includes('challenge')
        ) {
          await driver.switchTo().frame(frame)
          const targets = await driver.findElements(
            By.css('input[type="checkbox"], .cf-turnstile-part, [id*="challenge"]')
          )
          for (const el of targets) {
            try { await el.click() } catch { /* ignore */ }
          }
          await driver.switchTo().defaultContent()
          await sleep(3000)
          return
        }
      } catch {
        try { await driver.switchTo().defaultContent() } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}

export async function detectCaptcha(driver: WebDriver): Promise<boolean> {
  // Check body text for CF JS challenge phrases
  try {
    const bodyText = (await driver.findElement(By.tagName('body')).getText()).toLowerCase()
    const CF_PHRASES = [
      'just a moment',
      'checking your browser',
      'attention required',
      'enable javascript and cookies',
      'performing security verification',
      'sorry, you have been blocked',
    ]
    if (CF_PHRASES.some((p) => bodyText.includes(p))) return true
  } catch { /* ignore */ }

  // Check iframes for unresolved Turnstile, hCaptcha, reCAPTCHA
  try {
    const frames = await driver.findElements(By.css('iframe'))
    for (const frame of frames) {
      try {
        const src = (await frame.getAttribute('src')) ?? ''
        if (
          src.includes('cloudflare') ||
          src.includes('turnstile') ||
          src.includes('challenge') ||
          src.includes('hcaptcha.com') ||
          (src.includes('recaptcha') && (src.includes('bframe') || src.includes('anchor')))
        ) {
          return true
        }
      } catch { /* stale element */ }
    }
  } catch { /* ignore */ }

  // Check DOM for puzzle/captcha widgets
  const CAPTCHA_SELECTORS = [
    '.g-recaptcha',
    '#hcaptcha',
    '[data-sitekey]',
    '.captcha-solver',
  ]
  for (const selector of CAPTCHA_SELECTORS) {
    try {
      await driver.findElement(By.css(selector))
      return true
    } catch { /* not found */ }
  }

  return false
}

export async function runChallenges(
  driver: WebDriver
): Promise<{ captchaRequired: boolean }> {
  await dismissCookieBanners(driver)
  await handleTurnstile(driver)
  const captchaRequired = await detectCaptcha(driver)
  return { captchaRequired }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd worker && npx tsc --noEmit
```

Expected: no errors on `challenges.ts`

- [ ] **Step 3: Commit**

```bash
cd worker
git add challenges.ts
git commit -m "feat: add challenges.ts — cookie banners, Turnstile, captcha detection"
```

---

## Task 2: Update `worker/scraper.ts`

**Files:**
- Modify: `worker/scraper.ts`

- [ ] **Step 1: Replace the import block and remove inline functions**

Replace the top of the file. The new version removes the `acceptTexts` constant, the `handlePageInteractions` function, and the `isBlocked` function, and adds the import from `challenges.ts`.

Full new file:

```typescript
import { Builder, Browser, By, WebDriver } from 'selenium-webdriver'
import { Options, ServiceBuilder } from 'selenium-webdriver/chrome'
import { dismissCookieBanners, runChallenges } from './challenges'

const SUBPAGES = [
  '',
  '/about',
  '/about-us',
  '/contact',
  '/privacy',
  '/privacy-policy',
  '/terms',
  '/terms-and-conditions',
]

const PAGE_TIMEOUT_MS = 15_000
const NAV_DELAY_MS = 2_000

export interface ScrapeResult {
  html: string
  text: string
  links: string[]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function scrapeDomain(domain: string): Promise<ScrapeResult & { captchaRequired?: boolean }> {
  const options = new Options()
  options.addArguments(
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1280,800',
    '--disable-blink-features=AutomationControlled',
    '--log-level=3',
    '--silent',
    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  )
  options.excludeSwitches('enable-automation', 'enable-logging')
  options.setUserPreferences({ 'credentials_enable_service': false })

  const service = new ServiceBuilder().setStdio('ignore').build()
  const driver: WebDriver = await new Builder()
    .forBrowser(Browser.CHROME)
    .setChromeOptions(options)
    .setChromeService(service)
    .build()

  await driver.manage().setTimeouts({ pageLoad: PAGE_TIMEOUT_MS, implicit: 5_000 })

  await driver.executeScript(
    `Object.defineProperty(navigator, 'webdriver', {get: () => undefined})`
  )

  let homepageHtml = ''
  const allText: string[] = []
  const allLinks = new Set<string>()

  try {
    const baseUrl = `https://${domain}`

    for (const subpath of SUBPAGES) {
      try {
        await driver.get(`${baseUrl}${subpath}`)

        if (subpath === '') {
          // Full challenge handling on homepage — abort if captcha detected
          const { captchaRequired } = await runChallenges(driver)
          homepageHtml = await driver.getPageSource()
          if (captchaRequired) {
            return { html: homepageHtml, text: '', links: [], captchaRequired: true }
          }
        } else {
          // Subpages: dismiss banners only
          await dismissCookieBanners(driver)
        }

        const body = await driver.findElement(By.tagName('body'))
        const bodyText = await body.getText()
        allText.push(bodyText)

        const anchors = await driver.findElements(By.tagName('a'))
        for (const anchor of anchors) {
          try {
            const href = await anchor.getAttribute('href')
            if (href) allLinks.add(href)
          } catch {
            // stale element — skip
          }
        }

        await sleep(NAV_DELAY_MS)
      } catch {
        // page not found or timeout — skip this subpage
      }
    }
  } finally {
    await driver.quit()
  }

  return { html: homepageHtml, text: allText.join('\n\n'), links: Array.from(allLinks) }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd worker && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd worker
git add scraper.ts
git commit -m "feat: wire challenges.ts into scraper — replace blocked with captchaRequired"
```

---

## Task 3: Update `worker/index.ts`

**Files:**
- Modify: `worker/index.ts`

- [ ] **Step 1: Rename `blocked` to `captchaRequired` and update messages**

Find this block in `processJob` (lines 76–88):

```typescript
    const { html, text, links, blocked } = await scrapeDomain(job.domain)

    if (blocked) {
      await markLeadDataCollected(
        process.env.GOOGLE_SHEET_ID!,
        process.env.GOOGLE_LEADS_SHEET_TAB || 'Leads',
        job.domain,
        'Blocked by Cloudflare'
      )
      await sb.from('lead_jobs').update({ status: 'needs_review', completed_at: new Date().toISOString() }).eq('id', job.id)
      console.log(`[worker] ${job.domain} → blocked by Cloudflare`)
      return
    }
```

Replace with:

```typescript
    const { html, text, links, captchaRequired } = await scrapeDomain(job.domain)

    if (captchaRequired) {
      await markLeadDataCollected(
        process.env.GOOGLE_SHEET_ID!,
        process.env.GOOGLE_LEADS_SHEET_TAB || 'Leads',
        job.domain,
        'Captcha Required'
      )
      await sb.from('lead_jobs').update({ status: 'needs_review', completed_at: new Date().toISOString() }).eq('id', job.id)
      console.log(`[worker] ${job.domain} → captcha required`)
      return
    }
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd worker && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add worker/index.ts
git commit -m "feat: rename blocked → captchaRequired, update sheet message to Captcha Required"
```

---

## Verification

- [ ] **Start the worker and process one domain known to have a cookie banner** — confirm it scrapes successfully (banner dismissed, data extracted)
- [ ] **Process one domain known to be Cloudflare-protected** — confirm it logs `captcha required` and the Google Sheet shows `Captcha Required`
