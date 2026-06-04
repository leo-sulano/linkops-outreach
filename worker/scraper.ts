import { Builder, Browser, By, WebDriver } from 'selenium-webdriver'
import { Options } from 'selenium-webdriver/chrome'

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
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1280,800',
    '--disable-blink-features=AutomationControlled',
    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  )
  options.excludeSwitches('enable-automation')
  options.setUserPreferences({ 'credentials_enable_service': false })

  const driver: WebDriver = await new Builder()
    .forBrowser(Browser.CHROME)
    .setChromeOptions(options)
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
