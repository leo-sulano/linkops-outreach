// --- Company name extraction (priority order) ---
// 1. og:site_name meta tag
// 2. JSON-LD Organization/Corporation/LocalBusiness name
// 3. Privacy Policy opening statement
// 4. Copyright footer text (single-line only)

const MAX_COMPANY_NAME_LEN = 50

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

// Words that indicate the string is a sentence, not a company name
const SENTENCE_WORDS = /\b(?:is|are|was|were|has|have|had|been|their|they|them|about|which|who)\b/i

function looksLikeCompanyName(s: string): boolean {
  if (s.trim().split(/\s+/).length > 7) return false
  if (SENTENCE_WORDS.test(s)) return false
  return true
}

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

// Common opening-line patterns in Privacy Policy / Terms pages
const PRIVACY_POLICY_PATTERNS: RegExp[] = [
  // [Company Name] ("we", "us", or "our") — most common PP opening
  /([A-Z][A-Za-z0-9\s,.'&+!-]{1,48}?)\s+\(["']?(?:the\s+)?(?:[Cc]ompan[y]|[Ww]e[,"'])/,
  // Privacy Policy for/of [Company Name]
  /[Pp]rivacy\s+[Pp]olicy\s+(?:for|of)\s+([A-Z][A-Za-z0-9\s,.'&+!-]{2,48}?)(?:\.|,|\n|$)/m,
  // [Company Name] Privacy Policy (line start — site title format)
  /^([A-Z][A-Za-z0-9\s,.'&+!-]{2,48}?)\s+Privacy\s+Policy/m,
  // This Privacy Policy applies to/describes [Company Name]
  /[Pp]rivacy\s+[Pp]olicy\s+(?:applies\s+to|describes|governs)\s+([A-Z][A-Za-z0-9\s,.'&+!-]{2,48}?)(?:\.|,|\n|$)/m,
]

function extractPrivacyPolicyName(text: string): string | null {
  for (const pattern of PRIVACY_POLICY_PATTERNS) {
    const m = text.match(pattern)
    if (m?.[1]) {
      const name = m[1].trim().replace(/[.,]+$/, '').trim()
      if (
        name.length >= 2 &&
        name.length <= MAX_COMPANY_NAME_LEN &&
        !name.includes('@') &&
        !DISCLAIMER_STARTS.test(name) &&
        looksLikeCompanyName(name)
      ) return name
    }
  }
  return null
}

// html = homepage source, text = all pages body text combined
export function extractCompanyName(text: string, html = ''): string | null {
  const raw = extractOgSiteName(html)
    ?? extractJsonLdName(html)
    ?? extractPrivacyPolicyName(text)
    ?? extractCopyrightName(text)
  if (!raw) return null
  // Hard guarantee: first non-empty line only, trimmed, no embedded emails
  const firstLine = raw.split(/\r?\n/)[0].trim().replace(/[.,|]+$/, '').trim()
  if (firstLine.length < 2 || firstLine.length > MAX_COMPANY_NAME_LEN) return null
  if (firstLine.includes('@')) return null
  if (DISCLAIMER_STARTS.test(firstLine)) return null
  if (!looksLikeCompanyName(firstLine)) return null
  return firstLine
}

// Generic/departmental prefixes — kept as last-resort fallback per SOP
const GENERIC_PREFIXES = [
  'info@', 'contact@', 'support@', 'hello@', 'admin@',
  'team@', 'sales@', 'press@', 'media@', 'advertise@',
  'partnerships@', 'enquiries@', 'enquiry@', 'webmaster@',
]
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

function isGenericEmail(email: string): boolean {
  return GENERIC_PREFIXES.some((p) => email.toLowerCase().startsWith(p))
}

// Extract email address from a mailto: href — stops before query params / hash fragments
function parseMailtoHref(raw: string): string {
  return raw.split(/[?# ]/)[0]
}

// Scan HTML source for mailto: links.
// Priority: personal/non-generic → any generic (last resort).
export function extractMailtoEmail(html: string): string | null {
  const mailtoPattern = /href="mailto:([^"]+)"/gi
  let match: RegExpExecArray | null
  const allMailtos: string[] = []
  while ((match = mailtoPattern.exec(html)) !== null) {
    allMailtos.push(parseMailtoHref(match[1]))
  }
  if (allMailtos.length === 0) return null
  return allMailtos.find((a) => !isGenericEmail(a)) ?? allMailtos[0]
}

// Title keywords used to identify a decision-maker line in page text
const DECISION_MAKER_TITLES =
  /\b(?:founder|co-?founder|owner|ceo|chief\s+executive|editor[- ]in[- ]chief|president|managing\s+director|publisher|operator)\b/i

// Scan plain text (rendered body) for email addresses.
// Priority: email on a decision-maker line → non-generic → generic (last resort).
export function extractEmail(text: string): string | null {
  const allEmails = text.match(EMAIL_REGEX) ?? []
  if (allEmails.length === 0) return null

  // 1. Email on the same line as a decision-maker title
  for (const line of text.split(/\r?\n/)) {
    if (DECISION_MAKER_TITLES.test(line)) {
      const m = line.match(EMAIL_REGEX)
      if (m?.[0]) return m[0]
    }
  }

  // 2. Non-generic (personal-looking) email
  const personal = allEmails.find((e) => !isGenericEmail(e))
  if (personal) return personal

  // 3. Generic email as last resort
  return allEmails[0]
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
