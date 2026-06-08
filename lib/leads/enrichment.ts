// --- Company name extraction (priority order) ---
// 1. og:site_name meta tag
// 2. JSON-LD Organization/Corporation/LocalBusiness name
// 3. Copyright footer text (single-line only)

const MAX_COMPANY_NAME_LEN = 60

function extractOgSiteName(html: string): string | null {
  const m = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']{2,60})["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']{2,60})["'][^>]+property=["']og:site_name["']/i)
  return m?.[1]?.trim() ?? null
}

function extractJsonLdName(html: string): string | null {
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = scriptRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1])
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        if (
          item?.['@type'] &&
          // Exclude WebSite — its name is often a tagline, not a legal entity
          ['Organization', 'Corporation', 'LocalBusiness'].includes(item['@type']) &&
          typeof item.name === 'string' &&
          item.name.length >= 2 &&
          item.name.length <= MAX_COMPANY_NAME_LEN
        ) {
          return item.name.trim()
        }
      }
    } catch {
      // malformed JSON — skip
    }
  }
  return null
}

// Words that typically begin legal disclaimers, not company names
const DISCLAIMER_STARTS =
  /^(?:our|the\s|a\s|its\s|an\s|federally|those|any|all\s|many|some|no\s|tribal|recognized|this\s|that\s)/i

const COPYRIGHT_PATTERNS: RegExp[] = [
  // "© 2024 Acme Corp. All rights reserved"
  /©\s*(?:\d{4}\s*[-–]?\s*\d{0,4}\s+)?([A-Z][^\n.@|]{1,58}?)\s*\.?\s+(?:all\s+)?rights/i,
  // "Copyright 2024 Acme Corp" — lazy so it stops at the first non-name word
  /Copyright\s+©?\s*(?:\d{4}\s*[-–]?\s*\d{0,4}\s+)?([A-Z][^\n.@|]{1,58}?)(?:\s*[.|]|(?=\s+(?:all\s+rights?|reserved))|[\r\n]|$)/i,
  // "Operated by Acme Corp" — dot-letter sequences (e.g. Gambling.com) are allowed in company names;
  // sentence-ending dot (followed by space or end) terminates the match but mid-word dot does not
  /(?:owned|operated|published|managed)\s+by\s+(?!\s*(?:our|the\s|a\s|its\s|federally|tribal)\b)([A-Z](?:[^\n.@|]|\.[a-zA-Z]){1,58}?)(?:\s*[|]|\.(?=\s|$)|\s*$)/im,
]

// Trailing rights boilerplate that pattern 2 may still over-capture on unusual footer formatting
const TRAILING_BOILERPLATE = /\s+(?:all\s+rights?\s+reserved|rights?\s+reserved|reserved|all\s+rights?)\.?\s*$/i

function extractCopyrightName(text: string): string | null {
  for (const pattern of COPYRIGHT_PATTERNS) {
    const m = text.match(pattern)
    if (m?.[1]) {
      const company = m[1].trim()
        .replace(TRAILING_BOILERPLATE, '')
        .replace(/[.,|]+$/, '')
        .trim()
      if (
        company.length >= 2 &&
        company.length <= MAX_COMPANY_NAME_LEN &&
        !company.includes('\n') &&
        !company.includes('@') &&
        !DISCLAIMER_STARTS.test(company)
      ) {
        return company
      }
    }
  }
  return null
}

// html = homepage source, text = all pages body text combined
export function extractCompanyName(text: string, html = ''): string | null {
  const raw = extractOgSiteName(html)
    ?? extractJsonLdName(html)
    ?? extractCopyrightName(text)
  if (!raw) return null
  // Hard guarantee: first non-empty line only, trimmed, no embedded emails
  const firstLine = raw.split(/\r?\n/)[0].trim().replace(/[.,|]+$/, '').trim()
  if (firstLine.length < 2 || firstLine.length > MAX_COMPANY_NAME_LEN) return null
  if (firstLine.includes('@')) return null
  if (DISCLAIMER_STARTS.test(firstLine)) return null
  return firstLine
}

const PREFERRED_PREFIXES = ['info@', 'contact@', 'support@', 'hello@', 'admin@']
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

// Extract email address from a mailto: href — stops before query params / hash fragments
function parseMailtoHref(raw: string): string {
  return raw.split(/[?# ]/)[0]
}

// Scan HTML source for mailto: links only (paths 1-2).
// Does NOT fall back to raw regex — use extractEmail(text) for that.
export function extractMailtoEmail(html: string): string | null {
  const mailtoPattern = /href="mailto:([^"]+)"/gi
  let match: RegExpExecArray | null
  // 1. mailto with preferred prefix
  while ((match = mailtoPattern.exec(html)) !== null) {
    const addr = parseMailtoHref(match[1])
    if (PREFERRED_PREFIXES.some((p) => addr.toLowerCase().startsWith(p))) {
      return addr
    }
  }
  // 2. Any mailto link
  const anyMailto = /href="mailto:([^"]+)"/i.exec(html)
  if (anyMailto) return parseMailtoHref(anyMailto[1])
  return null
}

// Scan plain text (rendered body) for email addresses via regex.
// Should be called with stripped body text, not raw HTML, to avoid matching
// tracker / analytics addresses embedded in script tags.
export function extractEmail(text: string): string | null {
  const allEmails = text.match(EMAIL_REGEX) ?? []
  // 3. Preferred prefix in plain text
  const preferred = allEmails.find((e) =>
    PREFERRED_PREFIXES.some((p) => e.toLowerCase().startsWith(p))
  )
  if (preferred) return preferred
  // 4. First email in text
  return allEmails[0] ?? null
}

export function extractLinkedInCompany(links: string[]): string | null {
  const companyLinks = links.filter((l) => /linkedin\.com\/company\//i.test(l))
  if (companyLinks.length === 0) return null

  function isRootPage(url: string): boolean {
    try {
      return /^\/company\/[^/]+\/?$/.test(new URL(url).pathname)
    } catch {
      return false
    }
  }

  function slugLength(url: string): number {
    try {
      return new URL(url).pathname.length
    } catch {
      return url.split('?')[0].length
    }
  }

  // Prefer root company pages over sub-paths (/about, /people, etc.),
  // then pick the longest slug (most descriptive company name).
  const roots = companyLinks.filter(isRootPage)
  const candidates = roots.length > 0 ? roots : companyLinks
  return candidates.sort((a, b) => slugLength(b) - slugLength(a))[0]
}

// LinkedIn's own navigation paths — not personal profiles
const LINKEDIN_SYSTEM_SLUGS = /\/in\/(?:feed|messaging|search|notifications|jobs|mynetwork|learning|posts?|following|followers|company-search)\b/i

// Extract the first personal LinkedIn profile (/in/) found on the site.
// Used as a fallback when no company page is available.
export function extractLinkedInPerson(links: string[]): string | null {
  const personLinks = links.filter(
    (l) => /linkedin\.com\/in\/[^/?]+/i.test(l) && !LINKEDIN_SYSTEM_SLUGS.test(l)
  )
  if (personLinks.length === 0) return null
  function slugLength(url: string): number {
    try {
      return new URL(url).pathname.length
    } catch {
      return url.split('?')[0].length
    }
  }
  return personLinks.sort((a, b) => slugLength(a) - slugLength(b))[0]
}
