const COMPANY_PATTERNS = [
  /(?:owned\s+(?:and\s+)?operated|published|managed|operated)\s+by\s+(.+?)(?:\s*\.?$)/im,
  /©\s*\d{0,4}\s+([A-Z][^.]+?)\s*\.?\s+(?:all\s+)?rights/i,
  /Copyright\s+©?\s*\d{0,4}\s+([A-Z][^.]+)/i,
]

export function extractCompanyName(text: string): string | null {
  for (const pattern of COMPANY_PATTERNS) {
    const match = text.match(pattern)
    if (match?.[1]) {
      let company = match[1].trim()
      // Remove trailing punctuation (period or comma)
      company = company.replace(/[.,]+$/, '')
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
  return companyLinks.sort((a, b) => b.length - a.length)[0]
}
