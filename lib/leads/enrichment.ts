// --- Company name extraction (priority order) ---
// 1. og:site_name meta tag
// 2. JSON-LD Organization/Corporation/LocalBusiness name
// 3. Privacy Policy opening statement
// 4. Copyright footer text (single-line only)
// 5. <title> tag first segment

const MAX_COMPANY_NAME_LEN = 50

// Strip keyword-stuffed suffixes: "Acme Corp | Best Reviews 2024" → "Acme Corp"
function cleanTagName(raw: string): string {
  return raw.split(/\s*[|–—\-:]\s*/)[0].trim()
}

function extractOgSiteName(html: string): string | null {
  const m = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']{2,60})["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']{2,60})["'][^>]+property=["']og:site_name["']/i)
  if (!m?.[1]) return null
  return cleanTagName(m[1]) || null
}

function extractTitleName(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]{2,80})<\/title>/i)
  if (!m?.[1]) return null
  const cleaned = cleanTagName(m[1].trim())
  if (cleaned.length >= 2 && cleaned.length <= MAX_COMPANY_NAME_LEN) return cleaned
  return null
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
  // sentence-ending dot (followed by space or end) terminates the match but mid-word dot does not.
  // Explicitly excludes "Powered/Designed/Built by" (hosting platforms / web agencies, not the site owner)
  /(?:owned|operated|published|managed)\s+by\s+(?!\s*(?:our|the\s|a\s|its\s|federally|tribal)\b)([A-Z](?:[^\n.@|]|\.[a-zA-Z]){1,58}?)(?:\s*[|]|\.(?=\s|$)|\s*$)/im,
]

// Trailing rights boilerplate that pattern 2 may still over-capture on unusual footer formatting
const TRAILING_BOILERPLATE = /\s+(?:all\s+rights?\s+reserved|rights?\s+reserved|reserved|all\s+rights?)\.?\s*$/i

// Vendor/agency attribution lines — the site owner did NOT write this, so skip it
const VENDOR_ATTRIBUTION = /^(?:powered|designed|built|developed|created|hosted)\s+by\b/i

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
        !DISCLAIMER_STARTS.test(company) &&
        !VENDOR_ATTRIBUTION.test(company)
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
    ?? extractTitleName(html)
  if (!raw) return null
  // Hard guarantee: first non-empty line only, trimmed, no embedded emails
  const firstLine = raw.split(/\r?\n/)[0].trim().replace(/[.,|]+$/, '').trim()
  if (firstLine.length < 2 || firstLine.length > MAX_COMPANY_NAME_LEN) return null
  if (firstLine.includes('@')) return null
  if (DISCLAIMER_STARTS.test(firstLine)) return null
  if (!looksLikeCompanyName(firstLine)) return null
  return firstLine
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

// Tier 2 — outreach-relevant department emails (valuable for lead gen)
const OUTREACH_PREFIXES = [
  'partners@', 'partner@', 'affiliates@', 'affiliate@', 'partnerships@',
  'marketing@', 'advertise@', 'advertising@', 'ads@',
  'sales@', 'business@', 'biz@', 'press@', 'media@',
  'editorial@', 'sponsor@', 'sponsorship@', 'collab@', 'collaborate@',
]

// Tier 3 — low-value generic / customer-service emails (last resort)
const GENERIC_CS_PREFIXES = [
  'info@', 'contact@', 'support@', 'hello@', 'admin@',
  'team@', 'enquiries@', 'enquiry@', 'webmaster@',
  'noreply@', 'no-reply@', 'help@', 'service@', 'feedback@',
]

type EmailTier = 'personal' | 'outreach' | 'generic'

function classifyEmail(email: string): EmailTier {
  const lower = email.toLowerCase()
  if (OUTREACH_PREFIXES.some((p) => lower.startsWith(p))) return 'outreach'
  if (GENERIC_CS_PREFIXES.some((p) => lower.startsWith(p))) return 'generic'
  return 'personal'
}

// Extract email address from a mailto: href — stops before query params / hash fragments
function parseMailtoHref(raw: string): string {
  return raw.split(/[?# ]/)[0]
}

// Scan HTML source for mailto: links.
// Priority: personal → outreach-dept → generic (last resort).
export function extractMailtoEmail(html: string): string | null {
  const mailtoPattern = /href="mailto:([^"]+)"/gi
  let match: RegExpExecArray | null
  const allMailtos: string[] = []
  while ((match = mailtoPattern.exec(html)) !== null) {
    allMailtos.push(parseMailtoHref(match[1]))
  }
  if (allMailtos.length === 0) return null
  return allMailtos.find((e) => classifyEmail(e) === 'personal')
    ?? allMailtos.find((e) => classifyEmail(e) === 'outreach')
    ?? allMailtos[0]
}

// Title keywords used to identify a decision-maker line in page text
const DECISION_MAKER_TITLES =
  /\b(?:founder|co-?founder|owner|ceo|chief\s+executive|editor[- ]in[- ]chief|president|managing\s+director|publisher|operator)\b/i

function findEmailInText(src: string, tier: EmailTier | 'dm'): string | null {
  if (tier === 'dm') {
    for (const line of src.split(/\r?\n/)) {
      if (DECISION_MAKER_TITLES.test(line)) {
        const m = line.match(EMAIL_REGEX)
        if (m?.[0]) return m[0]
      }
    }
    return null
  }
  return (src.match(EMAIL_REGEX) ?? []).find((e) => classifyEmail(e) === tier) ?? null
}

// Scan plain text for email addresses.
// contactText (from /contact, /about, /team pages) is checked at each tier before full text.
// Priority: decision-maker line → personal → outreach-dept → generic.
export function extractEmail(text: string, contactText = ''): string | null {
  const sources = contactText ? [contactText, text] : [text]

  for (const tier of ['dm', 'personal', 'outreach'] as const) {
    for (const src of sources) {
      const found = findEmailInText(src, tier)
      if (found) return found
    }
  }

  // Generic last resort — check contact pages first, then all text
  for (const src of sources) {
    const found = (src.match(EMAIL_REGEX) ?? []).find((e) => classifyEmail(e) === 'generic')
    if (found) return found
  }

  return null
}

export function extractLinkedInCompany(links: string[]): string | null {
  const companyLinks = links.filter(
    (l) => /linkedin\.com\/company\//i.test(l) && !LINKEDIN_SHARE_PATTERNS.test(l)
  )
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

// Social share buttons — not actual profiles
const LINKEDIN_SHARE_PATTERNS = /\/shareArticle|\/sharing\/|[?&]mini=true/i

// LinkedIn's own navigation paths — not personal profiles
const LINKEDIN_SYSTEM_SLUGS = /\/in\/(?:feed|messaging|search|notifications|jobs|mynetwork|learning|posts?|following|followers|company-search)\b/i

// Extract the first personal LinkedIn profile (/in/) found on the site.
// Used as a fallback when no company page is available.
export function extractLinkedInPerson(links: string[]): string | null {
  const personLinks = links.filter(
    (l) =>
      /linkedin\.com\/in\/[^/?]+/i.test(l) &&
      !LINKEDIN_SYSTEM_SLUGS.test(l) &&
      !LINKEDIN_SHARE_PATTERNS.test(l)
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

// --- Contact person extraction from site text (About / Team pages) ---
// Tried before hitting LinkedIn directly to avoid rate limits / anti-bot blocks.

// Full executive title captured as the role value
const EXEC_TITLE_RE =
  /\b((?:co-?)?founder|owner|ceo|chief\s+executive(?:\s+officer)?|editor[- ]in[- ]chief|president|managing\s+director|publisher|operator|executive\s+director|director\s+general)\b/i

// 2–3 consecutive title-case words — common person name shape
const PERSON_NAME_RE = /\b([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){1,2})\b/

// Words that appear in UI labels and company/page headings but never in real person names
const NAME_BLOCKLIST_WORDS = new Set([
  'Contact', 'About', 'Privacy', 'Terms', 'Policy', 'Cookie', 'Notice',
  'Service', 'Services', 'Agreement', 'Rights', 'Reserved', 'Copyright',
  'Team', 'Meet', 'More', 'Here', 'Sign', 'Login', 'Register', 'Subscribe',
  'Management', 'Solutions', 'Group', 'Media', 'Digital', 'Technologies',
  'Marketing', 'Network', 'Agency', 'Platform', 'Studio', 'Global',
  'International', 'Limited', 'Inc', 'Ltd', 'Corp', 'LLC',
])

// Returns false for UI phrases, company-sounding strings, and other non-name matches
function looksLikePersonName(candidate: string): boolean {
  const words = candidate.trim().split(/\s+/)
  if (words.some((w) => NAME_BLOCKLIST_WORDS.has(w))) return false
  // Reject if any word is all-caps (acronym / abbreviation, not a name)
  if (words.some((w) => w.length > 2 && w === w.toUpperCase())) return false
  return true
}

export function extractContactFromSiteText(text: string): { name: string | null; role: string | null } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const titleMatch = line.match(EXEC_TITLE_RE)
    if (!titleMatch) continue
    const role = titleMatch[1]

    // Same line: "John Smith, CEO" / "CEO – John Smith" / "John Smith | Founder"
    const withoutTitle = line.replace(EXEC_TITLE_RE, '').replace(/[,|–—\-:]\s*/g, ' ').trim()
    const nameOnLine = withoutTitle.match(PERSON_NAME_RE)
    if (nameOnLine && looksLikePersonName(nameOnLine[1])) return { name: nameOnLine[1], role }

    // Adjacent line: name is the line directly above or below the title line
    for (const j of [i - 1, i + 1]) {
      const adj = lines[j]
      if (!adj || EXEC_TITLE_RE.test(adj)) continue
      const nameAdj = adj.match(PERSON_NAME_RE)
      if (nameAdj && looksLikePersonName(nameAdj[1])) return { name: nameAdj[1], role }
    }
  }

  return { name: null, role: null }
}
