import { Builder, Browser, By, WebDriver } from 'selenium-webdriver'
import { Options, ServiceBuilder } from 'selenium-webdriver/chrome'

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
  html: string   // raw HTML of homepage (for og:site_name / JSON-LD extraction)
  text: string
  links: string[]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Click accept/allow on cookie banners and human verification checkboxes
async function handlePageInteractions(driver: WebDriver): Promise<void> {
  const acceptTexts = [
    'allow all', 'accept all', 'accept cookies', 'agree to all',
    'i agree', 'agree', 'ok', 'got it', 'allow cookies', 'allow selection',
    'accept', 'continue', 'confirm', 'consent', 'i accept', 'yes',
    'i am human', "i'm human", 'verify you are human', 'proceed',
  ]

  try {
    // 1. Click cookie/consent buttons
    const buttons = await driver.findElements(By.css('button, a[role="button"], input[type="button"], input[type="submit"]'))
    for (const btn of buttons) {
      try {
        const text = (await btn.getText()).toLowerCase().trim()
          || ((await btn.getAttribute('value')) ?? '').toLowerCase().trim()
          || ((await btn.getAttribute('aria-label')) ?? '').toLowerCase().trim()
        if (acceptTexts.some((t) => text === t || text.startsWith(t))) {
          await btn.click()
          await sleep(1000)
          break
        }
      } catch { /* stale or hidden */ }
    }
  } catch { /* ignore */ }

  try {
    // 2. Click Cloudflare Turnstile / "I am human" checkboxes inside iframes
    const frames = await driver.findElements(By.css('iframe'))
    for (const frame of frames) {
      try {
        const src = (await frame.getAttribute('src')) ?? ''
        if (src.includes('cloudflare') || src.includes('turnstile') || src.includes('challenge') || src.includes('captcha')) {
          await driver.switchTo().frame(frame)
          const checkbox = await driver.findElements(By.css('input[type="checkbox"], .cf-turnstile, [id*="challenge"]'))
          for (const cb of checkbox) {
            try { await cb.click(); await sleep(1500) } catch { /* ignore */ }
          }
          await driver.switchTo().defaultContent()
          await sleep(2000)
          break
        }
      } catch {
        try { await driver.switchTo().defaultContent() } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}

function isBlocked(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    lower.includes('sorry, you have been blocked') ||
    lower.includes('performing security verification') ||
    lower.includes('enable javascript and cookies') ||
    lower.includes('attention required! | cloudflare') ||
    lower.includes('just a moment') ||
    lower.includes('checking your browser')
  )
}

export async function scrapeDomain(domain: string): Promise<ScrapeResult & { blocked?: boolean }> {
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

  const service = new ServiceBuilder().suppressOutput(true).build()
  const driver: WebDriver = await new Builder()
    .forBrowser(Browser.CHROME)
    .setChromeOptions(options)
    .setChromeService(service)
    .build()

  await driver.manage().setTimeouts({ pageLoad: PAGE_TIMEOUT_MS, implicit: 5_000 })

  // Hide webdriver flag to bypass basic bot detection
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

        // Dismiss cookie/GDPR banners and handle human verification
        await handlePageInteractions(driver)

        // Capture full HTML of the homepage only (needed for og/JSON-LD extraction)
        if (subpath === '') {
          homepageHtml = await driver.getPageSource()
        }

        const body = await driver.findElement(By.tagName('body'))
        const bodyText = await body.getText()

        // Detect Cloudflare / bot protection block on homepage — stop immediately
        if (subpath === '' && isBlocked(bodyText)) {
          return { html: homepageHtml, text: '', links: [], blocked: true }
        }

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
