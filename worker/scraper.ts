import { Builder, Browser, By, WebDriver } from 'selenium-webdriver'
import { Options, ServiceBuilder } from 'selenium-webdriver/chrome'
import { dismissCookieBanners, runChallenges, detectCaptcha } from './challenges'

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
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// Injected before any page JS via Page.addScriptToEvaluateOnNewDocument.
// Patches the properties Cloudflare and other bot-detectors probe first.
const STEALTH_SCRIPT = `
  (() => {
    // 1. webdriver flag — most basic check
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

    // 2. window.chrome — CF checks existence + runtime.id
    if (!window.chrome) {
      window.chrome = {
        app: { isInstalled: false, getDetails: () => null, getIsInstalled: () => false, runningState: () => 'cannot_run' },
        csi: () => {},
        loadTimes: () => {},
        runtime: {
          id: undefined,
          connect: () => { throw new Error('Extension context not available'); },
          sendMessage: () => { throw new Error('Extension context not available'); },
        },
      };
    }

    // 3. navigator.plugins — headless has 0, real Chrome has 3
    try {
      const pluginData = [
        { name: 'Chrome PDF Plugin',  filename: 'internal-pdf-viewer',          description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer',  filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client',      filename: 'internal-nacl-plugin',          description: '' },
      ];
      const arr = pluginData.map(({ name, filename, description }) => {
        const p = Object.create(Plugin.prototype);
        Object.defineProperties(p, {
          name:        { value: name,        enumerable: true },
          filename:    { value: filename,    enumerable: true },
          description: { value: description, enumerable: true },
          length:      { value: 0 },
        });
        return p;
      });
      const pa = Object.create(PluginArray.prototype);
      arr.forEach((p, i) => Object.defineProperty(pa, i, { value: p, enumerable: true }));
      Object.defineProperties(pa, {
        length:    { value: arr.length },
        item:      { value: (i) => pa[i] ?? null },
        namedItem: { value: (n) => arr.find(p => p.name === n) ?? null },
        refresh:   { value: () => {} },
      });
      Object.defineProperty(navigator, 'plugins', { get: () => pa });

      // navigator.mimeTypes — mirrors the two PDF plugin entries
      const mimeData = [
        { type: 'application/x-google-chrome-pdf', description: 'Portable Document Format', suffixes: 'pdf' },
        { type: 'application/pdf',                  description: '',                          suffixes: 'pdf' },
      ];
      const ma = Object.create(MimeTypeArray.prototype);
      mimeData.forEach(({ type, description, suffixes }, i) => {
        const m = Object.create(MimeType.prototype);
        Object.defineProperties(m, {
          type:        { value: type,        enumerable: true },
          description: { value: description, enumerable: true },
          suffixes:    { value: suffixes,    enumerable: true },
        });
        Object.defineProperty(ma, i,    { value: m, enumerable: true });
        Object.defineProperty(ma, type, { value: m });
      });
      Object.defineProperties(ma, {
        length:    { value: mimeData.length },
        item:      { value: (i) => ma[i] ?? null },
        namedItem: { value: (n) => ma[n] ?? null },
      });
      Object.defineProperty(navigator, 'mimeTypes', { get: () => ma });
    } catch (_) {}

    // 4. vendor + languages
    try { Object.defineProperty(navigator, 'vendor', { get: () => 'Google Inc.' }); } catch (_) {}
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

    // 5. Permissions — notifications should be 'default', not 'denied'
    try {
      const _orig = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = (params) =>
        params.name === 'notifications'
          ? Promise.resolve(Object.assign(Object.create(PermissionStatus.prototype), { state: 'default', onchange: null }))
          : _orig(params);
    } catch (_) {}

    // 6. Hardware concurrency + device memory
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    try { Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 }); } catch (_) {}

    // 7. navigator.connection — undefined in headless
    try {
      if (!navigator.connection) {
        Object.defineProperty(navigator, 'connection', {
          get: () => ({ downlink: 10, effectiveType: '4g', rtt: 50, saveData: false }),
        });
      }
    } catch (_) {}
  })();
`

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
    '--window-size=1920,1080',
    '--disable-blink-features=AutomationControlled',
    '--lang=en-US,en',
    '--log-level=3',
    '--silent',
  )
  options.excludeSwitches('enable-automation', 'enable-logging')
  options.setUserPreferences({
    'credentials_enable_service': false,
    'profile.password_manager_enabled': false,
  })

  const service = new ServiceBuilder().setStdio('ignore')
  const driver: WebDriver = await new Builder()
    .forBrowser(Browser.CHROME)
    .setChromeOptions(options)
    .setChromeService(service)
    .build()

  await driver.manage().setTimeouts({ pageLoad: PAGE_TIMEOUT_MS, implicit: 5_000 })

  // Set UA with full platform/language context for all network requests
  await (driver as any).sendDevToolsCommand('Network.setUserAgentOverride', {
    userAgent: USER_AGENT,
    platform: 'Win32',
    acceptLanguage: 'en-US,en;q=0.9',
  })
  // Inject stealth patches before any page script executes
  await (driver as any).sendDevToolsCommand('Page.addScriptToEvaluateOnNewDocument', {
    source: STEALTH_SCRIPT,
  })

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
          // Subpages: dismiss banners, then skip if it's a CF challenge page
          await dismissCookieBanners(driver)
          if (await detectCaptcha(driver, { checkWidgets: false })) continue
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
