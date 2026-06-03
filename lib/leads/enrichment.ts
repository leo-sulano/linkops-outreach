// [^\n] prevents captures from crossing line boundaries (avoids grabbing nav/body text)
const COMPANY_PATTERNS = [
  /(?:owned\s+(?:and\s+)?operated|published|managed|operated)\s+by\s+([^\n.]+?)(?:\s*\.?\s*$)/im,
  /©\s*\d{0,4}\s+([A-Z][^\n.]+?)\s*\.?\s+(?:all\s+)?rights/i,
  /Copyright\s+©?\s*\d{0,4}\s+([A-Z][^\n.]{2,80})/i,
]

export function extractCompanyName(text: string): string | null {
  for (const pattern of COMPANY_PATTERNS) {
    const match = text.match(pattern)
    if (match?.[1]) {
      let company = match[1].trim()
      company = company.replace(/[.,|]+$/, '').trim()
      // Discard if result is suspiciously long or looks like nav text
      if (company.length > 80 || company.includes('\n')) continue
      return company
    }
  }
  return null
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
