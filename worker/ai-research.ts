import OpenAI from 'openai'
import { AIExtractResult } from './ai-extract'
import { isValidBusinessEmail } from '../lib/leads/enrichment'

function buildPrompt(domain: string, scraped: AIExtractResult): string {
  const hints = [
    `company_name: ${scraped.company_name ?? 'unknown'}`,
    `contact_name: ${scraped.contact_name ?? 'unknown'}`,
    `contact_role: ${scraped.contact_role ?? 'unknown'}`,
    `company_email: ${scraped.company_email ?? 'unknown'}`,
    `company_linkedin: ${scraped.company_linkedin ?? 'unknown'}`,
    `contact_linkedin: ${scraped.contact_linkedin ?? 'unknown'}`,
  ].join('\n')

  return `Research the website "${domain}" to identify its legal company name and key decision makers.

Preliminary findings from scraping the site (may be inaccurate or incomplete):
${hints}

Use web search to verify and enrich these findings:
1. Who owns or operates ${domain}? (check Whois, domain records, Google)
2. What is the registered legal company name? (check company registries, LinkedIn, official records)
3. Who is the founder, CEO, or owner? (check LinkedIn, About pages, press mentions)
4. Is there a public business email or LinkedIn profile for the company or its decision maker?

Be efficient: use as few searches as necessary. Prefer a single search that's likely to confirm multiple fields at once (e.g. a company registry or LinkedIn page often shows the legal name and a decision maker together) over separate searches per field. Stop searching as soon as a field meets the 2-source corroboration bar below — do not keep searching for additional confirmation once that bar is met.

IMPORTANT RULE: For each field, return a value ONLY if you found it corroborated in 2 or more INDEPENDENT sources. Sources must have different domain origins — for example, LinkedIn + Companies House is valid; two pages on ${domain} itself is NOT independent.

IMPORTANT RULE: contact_name, contact_role, and contact_linkedin must all identify the SAME single individual — do not combine a name found in one source with a LinkedIn profile found via an unrelated search. If you cannot confirm the LinkedIn profile belongs to the specific person named in contact_name, return contact_linkedin as null rather than a different person's profile.

Return ONLY this JSON object. No markdown, no explanation, no extra keys:
{
  "company_name": string or null,
  "contact_name": string or null,
  "contact_role": string or null,
  "company_email": string or null,
  "company_linkedin": string or null,
  "contact_linkedin": string or null
}`
}

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/)
  return match ? match[0] : '{}'
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

const RESEARCH_TIMEOUT_MS = 20_000

export async function aiResearch(
  domain: string,
  scraped: AIExtractResult
): Promise<Partial<AIExtractResult>> {
  const completion = await Promise.race([
    getClient().chat.completions.create({
      // Dedicated search model — gpt-4o-mini's search-enabled variant was deprecated
      // 2026-07-23. This is the cheaper of the two current web-search-capable models
      // (the other, gpt-6-astra, runs 8-66x more per token for the same job).
      // "low" keeps the per-search token cost down; corroboration comes from requiring
      // 2+ independent sources in the prompt, not from pulling deep page content.
      model: 'gpt-5-search-api',
      web_search_options: { search_context_size: 'low' },
      messages: [{ role: 'user', content: buildPrompt(domain, scraped) }],
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Web research timed out')), RESEARCH_TIMEOUT_MS)
    ),
  ])
  const text = completion.choices[0]?.message?.content ?? ''

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(extractJson(text))
  } catch {
    parsed = {}
  }

  const out: Partial<AIExtractResult> = {}
  if (typeof parsed.company_name === 'string' && parsed.company_name) out.company_name = parsed.company_name
  if (typeof parsed.contact_name === 'string' && parsed.contact_name) out.contact_name = parsed.contact_name
  if (typeof parsed.contact_role === 'string' && parsed.contact_role) out.contact_role = parsed.contact_role
  if (typeof parsed.company_email === 'string' && isValidBusinessEmail(parsed.company_email)) out.company_email = parsed.company_email
  if (typeof parsed.company_linkedin === 'string' && parsed.company_linkedin) out.company_linkedin = parsed.company_linkedin
  if (typeof parsed.contact_linkedin === 'string' && parsed.contact_linkedin) out.contact_linkedin = parsed.contact_linkedin

  return out
}
