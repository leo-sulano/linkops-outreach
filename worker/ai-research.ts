import { GoogleGenerativeAI } from '@google/generative-ai'
import { AIExtractResult } from './ai-extract'

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

IMPORTANT RULE: For each field, return a value ONLY if you found it corroborated in 2 or more INDEPENDENT sources. Sources must have different domain origins — for example, LinkedIn + Companies House is valid; two pages on ${domain} itself is NOT independent.

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

let genAI: GoogleGenerativeAI | null = null

function getClient(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set')
    genAI = new GoogleGenerativeAI(apiKey)
  }
  return genAI
}

export async function aiResearch(
  domain: string,
  scraped: AIExtractResult
): Promise<Partial<AIExtractResult>> {
  const model = getClient().getGenerativeModel({
    model: 'gemini-2.0-flash',
    tools: [{ googleSearchRetrieval: {} }],
  })

  const result = await model.generateContent(buildPrompt(domain, scraped))
  const text = result.response.text()

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
  if (typeof parsed.company_email === 'string' && parsed.company_email) out.company_email = parsed.company_email
  if (typeof parsed.company_linkedin === 'string' && parsed.company_linkedin) out.company_linkedin = parsed.company_linkedin
  if (typeof parsed.contact_linkedin === 'string' && parsed.contact_linkedin) out.contact_linkedin = parsed.contact_linkedin

  return out
}
