import { Builder, Browser, By, WebDriver } from 'selenium-webdriver'
import { Options } from 'selenium-webdriver/chrome'

export interface LinkedInContact {
  contact_name: string | null
  contact_role: string | null
  contact_linkedin: string | null
}

const ROLE_PATTERN =
  /\b(Founder|Co-Founder|CEO|Chief Executive|Owner|Managing Director)\b/i
const NAME_PATTERN = /^[A-Z][a-z]+ [A-Z][a-z]+/

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function discoverLinkedInContact(
  linkedInUrl: string
): Promise<LinkedInContact> {
  const empty: LinkedInContact = {
    contact_name: null,
    contact_role: null,
    contact_linkedin: null,
  }

  let driver: WebDriver | null = null
  try {
    const options = new Options()
    options.addArguments(
      '--headless',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,800',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    )

    driver = await new Builder()
      .forBrowser(Browser.CHROME)
      .setChromeOptions(options)
      .build()

    await driver.manage().setTimeouts({ pageLoad: 15_000, implicit: 5_000 })
    await driver.get(linkedInUrl)
    await sleep(3_000)

    // Bail if redirected to login wall
    const currentUrl = await driver.getCurrentUrl()
    if (currentUrl.includes('/login') || currentUrl.includes('/checkpoint')) {
      return empty
    }

    const bodyText = await driver.findElement(By.tagName('body')).getText()
    const lines = bodyText.split('\n').map((l) => l.trim()).filter(Boolean)

    for (let i = 0; i < lines.length; i++) {
      const roleMatch = lines[i].match(ROLE_PATTERN)
      if (!roleMatch) continue

      const candidates = [lines[i - 2], lines[i - 1], lines[i + 1], lines[i + 2]]
      const name = candidates.find((c) => c && NAME_PATTERN.test(c))
      if (!name) continue

      // Look for their /in/ profile link near their name
      let profileUrl: string | null = null
      const anchors = await driver.findElements(By.tagName('a'))
      for (const anchor of anchors) {
        try {
          const href = await anchor.getAttribute('href')
          const text = await anchor.getText()
          if (
            href?.includes('linkedin.com/in/') &&
            text.includes(name.split(' ')[0])
          ) {
            profileUrl = href
            break
          }
        } catch {
          // stale — skip
        }
      }

      return {
        contact_name: name,
        contact_role: roleMatch[1],
        contact_linkedin: profileUrl,
      }
    }

    return empty
  } catch {
    return empty
  } finally {
    try {
      await driver?.quit()
    } catch {
      // ignore
    }
  }
}
