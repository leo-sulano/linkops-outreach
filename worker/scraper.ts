import { Builder, Browser, By, WebDriver } from 'selenium-webdriver'
import { Options } from 'selenium-webdriver/chrome'
import { dismissCookieBanners, runChallenges, detectCaptcha } from './challenges'
import { extractCompanyName, extractMailtoEmail, extractEmail, extractLinkedInCompany, extractLinkedInPerson, extractContactFromSiteText } from '../lib/leads/enrichment'

// Always-visit paths (checked on every domain)
const STATIC_SUBPAGES = [
  '',
  // Contact
  '/contact',
  '/contact-us',
  // About / Company
  '/about',
  '/about-us',
  // Team / People
  '/team',
  '/our-team',
  '/people',
  // Advertise / Partner / Affiliate
  '/advertise',
  '/advertise-with-us',
  '/partners',
  '/affiliates',
  '/affiliate-program',
  // Legal (EU imprint often has full company info + email)
  '/impressum',
  '/imprint',
  // Privacy (company name extraction)
  '/privacy',
  '/privacy-policy',
  // Terms
  '/terms',
  '/terms-and-conditions',
]

// Keywords used to discover additional same-domain pages from homepage links
const DISCOVERY_KEYWORDS = [
  'contact', 'about', 'team', 'people', 'founder',
  'advertise', 'partner', 'affiliate',
  'impressum', 'imprint', 'privacy',
]

const MAX_DISCOVERED_PAGES = 3
const PAGE_TIMEOUT_MS = 15_000
const NAV_DELAY_MS = 800
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

// Paths most likely to contain high-value contact emails — text from these is surfaced first
const CONTACT_PAGE_PATHS = new Set([
  '/contact', '/contact-us', '/contacts', '/get-in-touch', '/reach-us', '/connect',
  '/about', '/about-us', '/about-the-company', '/our-company', '/company', '/who-we-are', '/our-story',
  '/team', '/our-team', '/the-team', '/meet-the-team', '/people', '/staff',
  '/leadership', '/management', '/executives', '/founders',
  '/advertise', '/advertise-with-us', '/advertising',
  '/partners', '/partnership', '/partnerships',
  '/affiliates', '/affiliate', '/affiliate-program',
  '/work-with-us', '/collaborate',
])

export interface ScrapeResult {
  html: string
  text: string
  contactText: string
  links: string[]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Exit early when we have email + company name + at least one of (LinkedIn or contact name).
// Pages are visited in priority order so this fires as soon as the data is complete.
function hasEnoughData(
  html: string,
  textChunks: string[],
  contactTextChunks: string[],
  links: Set<string>
): boolean {
  const text = textChunks.join('\n\n')
  const contactText = contactTextChunks.join('\n\n')
  const linkArr = Array.from(links)
  const email = extractMailtoEmail(html) ?? extractEmail(text, contactText)
  const name = extractCompanyName(text, html)
  if (!email || !name) return false
  const linkedin = extractLinkedInCompany(linkArr) ?? extractLinkedInPerson(linkArr)
  const contactName = extractContactFromSiteText(contactText).name
  return !!(linkedin || contactName)
}

export async function scrapeDomain(
  domain: string,
  onPageVisit?: (path: string) => Promise<void> | void,
): Promise<ScrapeResult & { captchaRequired?: boolean }> {
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
    '--disable-images',
    '--blink-settings=imagesEnabled=false',
    '--disable-extensions',
    '--disable-plugins',
    '--js-flags=--max-old-space-size=256',
    '--memory-pressure-off',
    '--single-process',
  )
  options.excludeSwitches('enable-automation', 'enable-logging')
  options.setUserPreferences({
    'credentials_enable_service': false,
    'profile.password_manager_enabled': false,
  })

  let driver: WebDriver | null = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      driver = await new Builder()
        .forBrowser(Browser.CHROME)
        .setChromeOptions(options)
        .build()
      break
    } catch (err: any) {
      if (attempt === 3) throw err
      await sleep(2_000 * attempt)
    }
  }
  if (!driver) throw new Error('Failed to build WebDriver after 3 attempts')

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
  const contactPageText: string[] = []
  const allLinks = new Set<string>()

  try {
    const baseUrl = `https://${domain}`

    // Collect homepage links then build full page list
    let discoveredPaths: string[] = []

    const visitPage = async (url: string, isHomepage: boolean) => {
      try {
        const path = isHomepage ? '/' : (new URL(url).pathname || '/')
        await onPageVisit?.(path)
      } catch { /* non-critical */ }
      await driver.get(url)

      // Detect Chrome error pages (DNS failure, connection refused, etc.)
      const currentUrl = await driver.getCurrentUrl()
      if (currentUrl.startsWith('chrome-error://') || currentUrl.startsWith('about:neterror')) {
        throw new Error(`net::ERR_SITE_UNREACHABLE: ${url}`)
      }

      if (isHomepage) {
        const { captchaRequired } = await runChallenges(driver)
        if (captchaRequired) return 'captcha'
        homepageHtml = await driver.getPageSource()
      } else {
        await dismissCookieBanners(driver)
        if (await detectCaptcha(driver, { checkWidgets: false })) return 'captcha_skip'
      }

      const body = await driver.findElement(By.tagName('body'))
      const bodyText = await body.getText()
      allText.push(bodyText)

      // Track text from high-value contact/about pages for priority email extraction
      try {
        const path = new URL(url).pathname.replace(/\/$/, '').toLowerCase()
        if (CONTACT_PAGE_PATHS.has(path)) contactPageText.push(bodyText)
      } catch { /* invalid url — skip */ }

      const anchors = await driver.findElements(By.tagName('a'))
      for (const anchor of anchors) {
        try {
          const href = await anchor.getAttribute('href')
          if (href) allLinks.add(href)
        } catch { /* stale element */ }
      }

      await sleep(NAV_DELAY_MS)
      return 'ok'
    }

    // --- Homepage ---
    try {
      const result = await visitPage(baseUrl, true)
      if (result === 'captcha') return { html: '', text: '', contactText: '', links: [], captchaRequired: true }

      // Discover same-domain links matching keywords
      const sameDomain = Array.from(allLinks).filter((href) => {
        try {
          const u = new URL(href)
          if (!u.hostname.includes(domain.replace(/^www\./, ''))) return false
          const path = u.pathname.toLowerCase()
          return DISCOVERY_KEYWORDS.some((kw) => path.includes(kw))
        } catch { return false }
      })

      const staticSet = new Set(STATIC_SUBPAGES.map((p) => `${baseUrl}${p}`))
      const seen = new Set<string>([baseUrl])
      let count = 0

      for (const href of sameDomain) {
        if (count >= MAX_DISCOVERED_PAGES) break
        try {
          const u = new URL(href)
          const normalized = `${u.origin}${u.pathname}`.replace(/\/$/, '')
          if (!seen.has(normalized) && !staticSet.has(normalized)) {
            discoveredPaths.push(normalized)
            seen.add(normalized)
            count++
          }
        } catch { /* invalid url */ }
      }
    } catch (e: any) {
      if (e?.message?.includes('net::')) throw e // site unreachable — propagate to caller
      /* homepage failed */
    }

    // --- Static subpages (skip homepage already done) ---
    for (const subpath of STATIC_SUBPAGES.slice(1)) {
      if (hasEnoughData(homepageHtml, allText, contactPageText, allLinks)) break
      try {
        await visitPage(`${baseUrl}${subpath}`, false)
      } catch { /* page not found or timeout — skip */ }
    }

    // --- Discovered pages ---
    for (const url of discoveredPaths) {
      if (hasEnoughData(homepageHtml, allText, contactPageText, allLinks)) break
      try {
        await visitPage(url, false)
      } catch { /* skip */ }
    }
  } finally {
    await driver!.quit()
  }

  return {
    html: homepageHtml,
    text: allText.join('\n\n'),
    contactText: contactPageText.join('\n\n'),
    links: Array.from(allLinks),
  }
}
