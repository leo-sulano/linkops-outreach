// --- Company name extraction (priority order) ---
// 1. og:site_name meta tag
// 2. JSON-LD Organization name
// 3. Copyright footer text (single-line only)

function extractOgSiteName(html: string): string | null {
  const m = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']{2,80})["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']{2,80})["'][^>]+property=["']og:site_name["']/i)
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
          ['Organization', 'Corporation', 'LocalBusiness', 'WebSite'].includes(item['@type']) &&
          typeof item.name === 'string' &&
          item.name.length >= 2 &&
          item.name.length <= 80
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

const COPYRIGHT_PATTERNS = [
  /(?:owned|operated|published|managed)\s+by\s+([^\n.]{2,80}?)(?:\s*[.|]|$)/im,
  /©\s*\d{0,4}\s+([A-Z][^\n.]{1,79}?)\s*\.?\s+(?:all\s+)?rights/i,
  /Copyright\s+©?\s*\d{0,4}\s+([A-Z][^\n.]{1,79})/i,
]

function extractCopyrightName(text: string): string | null {
  for (const pattern of COPYRIGHT_PATTERNS) {
    const m = text.match(pattern)
    if (m?.[1]) {
      const company = m[1].trim().replace(/[.,|]+$/, '')
      if (company.length >= 2 && company.length <= 80 && !company.includes('\n')) {
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
  // Hard guarantee: return only the first non-empty line, trimmed
  const firstLine = raw.split(/\r?\n/)[0].trim().replace(/[.,|]+$/, '')
  return firstLine.length >= 2 && firstLine.length <= 80 ? firstLine : null
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
  return companyLinks.sort((a, b) => slugLength(b) - slugLength(a))[0]
}
