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

  const service = new ServiceBuilder().setStdio('ignore')
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
          if (captchaRequired) {
            return { html: '', text: '', links: [], captchaRequired: true }
          }
          homepageHtml = await driver.getPageSource()
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
