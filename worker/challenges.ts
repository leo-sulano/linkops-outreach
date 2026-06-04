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
