import { By, WebDriver } from 'selenium-webdriver'
import { Solver } from '@2captcha/captcha-solver'

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

const CF_PHRASES = [
  'just a moment',
  'checking your browser',
  'attention required',
  'enable javascript and cookies',
  'performing security verification',
]

// These mean a hard IP block — no amount of waiting or solving helps
const CF_HARD_BLOCK_PHRASES = [
  'sorry, you have been blocked',
  'access denied',
]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getSolver(): Solver | null {
  const key = process.env.TWOCAPTCHA_API_KEY
  if (!key) return null
  return new Solver(key)
}

async function dismissInFrame(driver: WebDriver): Promise<boolean> {
  // Pass 1: known framework selectors
  for (const selector of FRAMEWORK_SELECTORS) {
    try {
      const el = await driver.findElement(By.css(selector))
      await el.click()
      await sleep(1000)
      return true
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
          return true
        }
      } catch { /* stale or hidden element */ }
    }
  } catch { /* ignore */ }

  return false
}

export async function dismissCookieBanners(driver: WebDriver): Promise<void> {
  // Try main document first
  if (await dismissInFrame(driver)) return

  // Some EU sites render the consent dialog inside an iframe
  try {
    const frames = await driver.findElements(By.css('iframe'))
    for (const frame of frames) {
      try {
        await driver.switchTo().frame(frame)
        const dismissed = await dismissInFrame(driver)
        await driver.switchTo().defaultContent()
        if (dismissed) return
      } catch {
        // iframe not accessible (cross-origin or stale) — switch back and try next
        try { await driver.switchTo().defaultContent() } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}

// Returns true if the page is a hard CF IP block (no widget, no waiting helps)
export async function isHardBlocked(driver: WebDriver): Promise<boolean> {
  try {
    const bodyText = (await driver.findElement(By.tagName('body')).getText()).toLowerCase()
    return CF_HARD_BLOCK_PHRASES.some((p) => bodyText.includes(p))
  } catch {
    return false
  }
}

// Detects whether a captcha/challenge is present and unsolved.
// `checkWidgets` — false when called after token injection (widgets stay in DOM even after solve).
export async function detectCaptcha(
  driver: WebDriver,
  { checkWidgets = true }: { checkWidgets?: boolean } = {}
): Promise<boolean> {
  // Check body text for CF JS challenge phrases (always active)
  try {
    const bodyText = (await driver.findElement(By.tagName('body')).getText()).toLowerCase()
    if (CF_PHRASES.some((p) => bodyText.includes(p))) return true
  } catch { /* ignore */ }

  if (!checkWidgets) return false

  // Check iframes for Turnstile, hCaptcha, reCAPTCHA
  try {
    const frames = await driver.findElements(By.css('iframe'))
    for (const frame of frames) {
      try {
        const src = (await frame.getAttribute('src')) ?? ''
        if (
          src.includes('challenges.cloudflare.com') ||
          src.includes('turnstile') ||
          src.includes('hcaptcha.com') ||
          (src.includes('recaptcha') && (src.includes('bframe') || src.includes('anchor')))
        ) {
          return true
        }
      } catch { /* stale element */ }
    }
  } catch { /* ignore */ }

  // Check DOM for captcha widgets
  const CAPTCHA_SELECTORS = [
    '.cf-turnstile',
    '.g-recaptcha',
    '.h-captcha',
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

// Attempt to solve whatever captcha is on the page via 2captcha.
// Returns true if a token was injected (optimistic — the widget stays in DOM after solving).
async function solveCaptchaWith2Captcha(
  driver: WebDriver,
  pageUrl: string
): Promise<boolean> {
  const solver = getSolver()
  if (!solver) return false

  // --- Cloudflare Turnstile ---
  const turnstileKey = await driver.executeScript<string | null>(
    `return document.querySelector('.cf-turnstile, [class*="cf-turnstile"]')?.dataset?.sitekey ?? null`
  )
  if (turnstileKey) {
    try {
      const res = await solver.cloudflareTurnstile({ pageurl: pageUrl, sitekey: turnstileKey })
      await driver.executeScript(
        `const t = arguments[0];
         const r = document.querySelector('[name="cf-turnstile-response"]');
         if (r) { r.value = t; r.dispatchEvent(new Event('change', { bubbles: true })); }
         const w = document.querySelector('.cf-turnstile, [class*="cf-turnstile"]');
         const cb = w?.dataset?.callback;
         if (cb && window[cb]) { window[cb](t); }
         // Dispatch custom event some sites listen for
         document.dispatchEvent(new CustomEvent('cf-turnstile-callback', { detail: t }));`,
        res.data
      )
      await sleep(3000)
      // Widgets stay in DOM after solve — only re-check body text (CF phrase gone = success)
      if (!(await detectCaptcha(driver, { checkWidgets: false }))) return true
    } catch { /* solving failed — try next type */ }
  }

  // --- Google reCAPTCHA v2 (visible only — invisible/v3 are skipped, not solvable via this flow) ---
  const recaptchaEl = await driver.executeScript<{ sitekey: string | null; invisible: boolean } | null>(
    `const el = document.querySelector('.g-recaptcha');
     if (!el) return null;
     return { sitekey: el.dataset.sitekey ?? null, invisible: el.dataset.size === 'invisible' };`
  )
  if (recaptchaEl?.sitekey && !recaptchaEl.invisible) {
    try {
      const res = await solver.recaptcha({ pageurl: pageUrl, googlekey: recaptchaEl.sitekey })
      await driver.executeScript(
        `const t = arguments[0];
         const el = document.getElementById('g-recaptcha-response');
         if (el) { el.innerHTML = t; el.dispatchEvent(new Event('change', { bubbles: true })); }
         try {
           const key = Object.keys(___grecaptcha_cfg.clients)[0];
           const client = ___grecaptcha_cfg.clients[key];
           for (const v of Object.values(client)) {
             if (v && typeof v === 'object' && typeof v.callback === 'function') {
               v.callback(t); break;
             }
           }
         } catch(e) {}`,
        res.data
      )
      await sleep(3000)
      if (!(await detectCaptcha(driver, { checkWidgets: false }))) return true
    } catch { /* solving failed — try next type */ }
  }

  // --- hCaptcha ---
  const hcaptchaKey = await driver.executeScript<string | null>(
    `return document.querySelector('.h-captcha')?.dataset?.sitekey ?? null`
  )
  if (hcaptchaKey) {
    try {
      const res = await solver.hcaptcha({ pageurl: pageUrl, sitekey: hcaptchaKey })
      await driver.executeScript(
        `const t = arguments[0];
         const r = document.querySelector('[name="h-captcha-response"]');
         if (r) { r.value = t; r.dispatchEvent(new Event('change', { bubbles: true })); }
         const gr = document.querySelector('[name="g-recaptcha-response"]');
         if (gr) { gr.value = t; gr.dispatchEvent(new Event('change', { bubbles: true })); }
         const el = document.querySelector('.h-captcha');
         const cb = el?.dataset?.callback;
         if (cb && window[cb]) window[cb](t);`,
        res.data
      )
      await sleep(3000)
      if (!(await detectCaptcha(driver, { checkWidgets: false }))) return true
    } catch { /* solving failed */ }
  }

  return false
}

export async function runChallenges(
  driver: WebDriver
): Promise<{ captchaRequired: boolean }> {
  await dismissCookieBanners(driver)

  // Fast path: no captcha at all
  if (!(await detectCaptcha(driver))) return { captchaRequired: false }

  // Hard IP block — waiting or solving never helps, fail immediately
  if (await isHardBlocked(driver)) return { captchaRequired: true }

  // CF JS-only challenge (no widget/sitekey) — auto-resolves in a few seconds, just wait
  const hasWidget = await driver.executeScript<boolean>(
    `return !!(document.querySelector('.cf-turnstile, .g-recaptcha, .h-captcha, [data-sitekey]'))`
  )
  if (!hasWidget) {
    // Wait up to 10s for the JS challenge to clear itself
    for (let i = 0; i < 5; i++) {
      await sleep(2000)
      if (!(await detectCaptcha(driver, { checkWidgets: false }))) return { captchaRequired: false }
    }
    // Still blocked after waiting — genuinely blocked
    return { captchaRequired: true }
  }

  // Widget present — attempt 2captcha solve
  const pageUrl = await driver.getCurrentUrl()
  const solved = await solveCaptchaWith2Captcha(driver, pageUrl)
  if (solved) return { captchaRequired: false }

  // Unsolvable (no API key, balance empty, or unknown captcha type)
  return { captchaRequired: true }
}
