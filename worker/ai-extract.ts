import OpenAI from 'openai'
import {
  extractCompanyName,
  extractMailtoEmail,
  extractEmail,
  extractLinkedInCompany,
  extractLinkedInPerson,
  extractContactFromSiteText,
} from '../lib/leads/enrichment'

export interface AIExtractResult {
  company_name: string | null
  company_email: string | null
  contact_name: string | null
  contact_role: string | null
  company_linkedin: string | null
  contact_linkedin: string | null
  company_type: string | null
  accepts_guest_posts: boolean
  has_advertise_page: boolean
}

const SYSTEM_PROMPT = `You are a web data extraction assistant. Given scraped website text and links, extract business contact information.

Return ONLY valid JSON matching this exact schema — no extra keys, no markdown:
{
  "company_name": string or null,
  "company_email": string or null,
  "contact_name": string or null,
  "contact_role": string or null,
  "company_linkedin": string or null,
  "contact_linkedin": string or null,
  "company_type": "blog" | "affiliate" | "media" | "brand" | "review" | "forum" | "other" | null,
  "accepts_guest_posts": boolean,
  "has_advertise_page": boolean
}

Rules:
- company_email: extract even if written as "name [at] domain [dot] com" format
- company_linkedin: must be a full linkedin.com/company/ URL, or null
- contact_linkedin: must be a full linkedin.com/in/ URL, or null
- accepts_guest_posts: true if site mentions write-for-us, guest post, submit article, or contribute pages
- has_advertise_page: true if site mentions advertise, partner, sponsor, or media kit pages
- company_type: blog=personal/editorial, affiliate=product reviews with affiliate links, media=news/magazine, brand=company product site, review=comparison/review site, forum=community discussion
- Return null for any field you cannot determine with confidence`

function truncate(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : text.slice(0, maxChars) + '...[truncated]'
}

function linkedInLinks(links: string[]): string[] {
  return links.filter((l) => /linkedin\.com\/(company|in)\//i.test(l)).slice(0, 10)
}

function mailtoLinks(html: string): string[] {
  return (html.match(/href="mailto:([^"]+)"/gi) ?? []).slice(0, 10)
}

function extractHtmlMetadata(html: string): string {
  const parts: string[] = []
  const ogSiteName = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']{2,60})["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']{2,60})["'][^>]+property=["']og:site_name["']/i)
  if (ogSiteName?.[1]) parts.push(`og:site_name: ${ogSiteName[1].trim()}`)

  const title = html.match(/<title[^>]*>([^<]{2,80})<\/title>/i)
  if (title?.[1]) parts.push(`page title: ${title[1].trim()}`)

  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = scriptRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1])
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        if (['Organization', 'Corporation', 'LocalBusiness'].includes(item?.['@type']) && item.name) {
          parts.push(`JSON-LD organization name: ${item.name}`)
          break
        }
      }
    } catch { /* skip malformed */ }
  }

  return parts.length > 0 ? parts.join('\n') : ''
}

let client: OpenAI | null = null

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set')
    client = new OpenAI({ apiKey })
  }
  return client
}

export async function aiExtract(
  html: string,
  text: string,
  contactText: string,
  links: string[]
): Promise<AIExtractResult> {
  const sections: string[] = []

  const htmlMeta = extractHtmlMetadata(html)
  if (htmlMeta) {
    sections.push(`=== HTML METADATA ===\n${htmlMeta}`)
  }

  if (contactText.trim()) {
    sections.push(`=== CONTACT/ABOUT PAGES ===\n${truncate(contactText, 3000)}`)
  }

  const mainText = (contactText.length > 0 ? text.replace(contactText, '') : text).trim()
  if (mainText) {
    sections.push(`=== MAIN SITE TEXT ===\n${truncate(mainText, 2000)}`)
  }

  const li = linkedInLinks(links)
  if (li.length > 0) {
    sections.push(`=== LINKEDIN LINKS ===\n${li.join('\n')}`)
  }

  const ml = mailtoLinks(html)
  if (ml.length > 0) {
    sections.push(`=== MAILTO LINKS ===\n${ml.join('\n')}`)
  }

  if (sections.length === 0) {
    throw new Error('No extractable content — skipping AI call')
  }

  const response = await getClient().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: sections.join('\n\n') },
    ],
    temperature: 0,
    response_format: { type: 'json_object' },
  })

  const raw = response.choices[0]?.message?.content ?? '{}'
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = {}
  }

  return {
    company_name: parsed.company_name ?? null,
    company_email: parsed.company_email ?? null,
    contact_name: parsed.contact_name ?? null,
    contact_role: parsed.contact_role ?? null,
    company_linkedin: parsed.company_linkedin ?? null,
    contact_linkedin: parsed.contact_linkedin ?? null,
    company_type: parsed.company_type ?? null,
    accepts_guest_posts: Boolean(parsed.accepts_guest_posts),
    has_advertise_page: Boolean(parsed.has_advertise_page),
  }
}

export function regexExtract(
  html: string,
  text: string,
  contactText: string,
  links: string[]
): AIExtractResult {
  const siteContact = extractContactFromSiteText(contactText)
  return {
    company_name: extractCompanyName(text, html),
    company_email: extractMailtoEmail(html) ?? extractEmail(text, contactText),
    contact_name: siteContact.name,
    contact_role: siteContact.role,
    company_linkedin: extractLinkedInCompany(links),
    contact_linkedin: extractLinkedInPerson(links),
    company_type: null,
    accepts_guest_posts: false,
    has_advertise_page: false,
  }
}
