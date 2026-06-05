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
  /^(?:our|the\s|a\s|its\s|an\s|federally|those|any|all\s|many|some|no\s|tribal|recognized|gambling|gaming|this\s|that\s)/i

const COPYRIGHT_PATTERNS: RegExp[] = [
  // "© 2024 Acme Corp. All rights reserved"
  /©\s*(?:\d{4}\s*[-–]?\s*\d{0,4}\s+)?([A-Z][^\n.@|]{1,58}?)\s*\.?\s+(?:all\s+)?rights/i,
  // "Copyright 2024 Acme Corp"
  /Copyright\s+©?\s*(?:\d{4}\s*[-–]?\s*\d{0,4}\s+)?([A-Z][^\n.@|]{1,58})/i,
  // "Operated by Acme Corp" — tight: must start with capital, stops at disclaimer words
  /(?:owned|operated|published|managed)\s+by\s+(?!\s*(?:our|the\s|a\s|its\s|federally|tribal)\b)([A-Z][^\n.@|]{1,58}?)(?:\s*[|.]|$)/im,
]

function extractCopyrightName(text: string): string | null {
  for (const pattern of COPYRIGHT_PATTERNS) {
    const m = text.match(pattern)
    if (m?.[1]) {
      const company = m[1].trim().replace(/[.,|]+$/, '').trim()
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

export function extractEmail(html: string): string | null {
  // 1. mailto with preferred prefix
  const mailtoPattern = /href="mailto:([^"]+)"/gi
  let match: RegExpExecArray | null
  while ((match = mailtoPattern.exec(html)) !== null) {
    if (PREFERRED_PREFIXES.some((p) => match![1].toLowerCase().startsWith(p))) {
      return match[1]
    }
  }
  // 2. Any mailto link
  const anyMailto = /href="mailto:([^"]+)"/i.exec(html)
  if (anyMailto) return anyMailto[1]
  // 3. Preferred prefix in plain text
  const allEmails = html.match(EMAIL_REGEX) ?? []
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
  function slugLength(url: string): number {
    try {
      return new URL(url).pathname.length
    } catch {
      return url.split('?')[0].length
    }
  }
  // Prefer shortest (canonical root URL, not /about/ sub-paths or tracked URLs)
  return companyLinks.sort((a, b) => slugLength(a) - slugLength(b))[0]
}

// Extract the first personal LinkedIn profile (/in/) found on the site.
// Used as a fallback when no company page is available.
export function extractLinkedInPerson(links: string[]): string | null {
  const personLinks = links.filter((l) => /linkedin\.com\/in\/[^/?]+/i.test(l))
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
