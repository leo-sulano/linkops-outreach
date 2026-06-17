# AI Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the regex extraction chain in the scraping worker with a GPT-4o-mini call that extracts all contact fields in one shot, with regex as a silent fallback.

**Architecture:** After `scrapeDomain()` returns `{ html, text, contactText, links }`, a new `aiExtract()` function sends cleaned text + filtered links to GPT-4o-mini and returns a structured object matching the existing `lead_contacts` schema. If the AI call fails for any reason, `regexExtract()` (wrapping the existing enrichment functions) runs instead. The worker then uses the result to build the contact record as before.

**Tech Stack:** OpenAI Node SDK (`openai`), GPT-4o-mini, existing Selenium worker, TypeScript, Supabase

## Global Constraints

- Worker runs with `ts-node` inside `worker/` — dependencies must be installed in `worker/package.json`, not root
- Env vars are loaded from `../.env.local` (one level up from worker/)
- New env var required: `OPENAI_API_KEY` — must be added to `.env.local`
- `response_format: { type: 'json_object' }` must be used to guarantee parseable output
- Temperature must be `0` for deterministic extraction
- Regex fallback must be silent (warn log only, no throw) — one failed AI call must not kill a scrape job
- `company_type` field must now be populated (it was always `null` before)

---

### Task 1: Install OpenAI SDK + create `worker/ai-extract.ts`

**Files:**
- Modify: `worker/package.json` — add `openai` dependency
- Create: `worker/ai-extract.ts` — AI extraction + regex fallback

**Interfaces:**
- Produces: `aiExtract(html, text, contactText, links): Promise<AIExtractResult>`
- Produces: `regexExtract(html, text, contactText, links): AIExtractResult`
- Produces: `interface AIExtractResult` — consumed by Task 2

- [ ] **Step 1: Add OPENAI_API_KEY to `.env.local`**

Open `.env.local` (root of project) and add:
```
OPENAI_API_KEY=sk-your-key-here
```

- [ ] **Step 2: Install openai in worker**

```bash
cd worker
npm install openai
```

Expected: `package.json` now shows `"openai": "^4.x.x"` under dependencies.

- [ ] **Step 3: Create `worker/ai-extract.ts`**

```typescript
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

  if (contactText.trim()) {
    sections.push(`=== CONTACT/ABOUT PAGES ===\n${truncate(contactText, 3000)}`)
  }

  const mainText = text.replace(contactText, '').trim()
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
  const parsed = JSON.parse(raw)

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
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd worker
npx ts-node --transpile-only -e "import('./ai-extract').then(() => console.log('OK'))"
```

Expected output: `OK`

- [ ] **Step 5: Commit**

```bash
cd worker && npm install openai
git add worker/package.json worker/package-lock.json worker/ai-extract.ts
git commit -m "feat: add GPT-4o-mini extraction module with regex fallback"
```

---

### Task 2: Wire AI extraction into `worker/index.ts`

**Files:**
- Modify: `worker/index.ts` — swap regex calls for `aiExtract()` / `regexExtract()`

**Interfaces:**
- Consumes: `aiExtract`, `regexExtract`, `AIExtractResult` from `./ai-extract`

- [ ] **Step 1: Replace the import line in `worker/index.ts`**

Remove this line (line 7):
```typescript
import { extractCompanyName, extractMailtoEmail, extractEmail, extractLinkedInCompany, extractLinkedInPerson, extractContactFromSiteText } from '../lib/leads/enrichment'
```

Replace with:
```typescript
import { aiExtract, regexExtract, AIExtractResult } from './ai-extract'
```

- [ ] **Step 2: Replace extraction block in `processJob()` in `worker/index.ts`**

Find this block (starts around line 100):
```typescript
    const company_name = extractCompanyName(text, html)
    // mailto: links from HTML source first (avoids tracker/JS addresses); fall back to rendered body text
    const company_email = extractMailtoEmail(html) ?? extractEmail(text, contactText)
    const company_linkedin = extractLinkedInCompany(links)
    const person_linkedin_from_site = extractLinkedInPerson(links)

    // Step 1: Try to extract name/role from the site's own About/Team pages (fast, no rate limits)
    const siteContact = extractContactFromSiteText(contactText)
    let contact_name: string | null = siteContact.name
    let contact_role: string | null = siteContact.role
    let contact_linkedin: string | null = null

    if (company_linkedin) {
      if (!contact_name) {
        // Site text didn't yield a name — fall back to LinkedIn scraping
        const li = await discoverLinkedInContact(company_linkedin)
        contact_name = li.contact_name
        contact_role = li.contact_role
        contact_linkedin = li.contact_linkedin ?? person_linkedin_from_site
      } else {
        // Name found on site; use any personal LinkedIn link found on the site
        contact_linkedin = person_linkedin_from_site
      }
    } else if (person_linkedin_from_site) {
      contact_linkedin = person_linkedin_from_site
    }
```

Replace with:
```typescript
    // AI extraction — regex fallback fires silently if AI call fails
    let extracted: AIExtractResult
    try {
      extracted = await aiExtract(html, text, contactText, links)
      console.log(`[worker] ${job.domain} → AI extraction OK`)
    } catch (err: any) {
      console.warn(`[worker] ${job.domain} → AI failed, using regex fallback: ${err.message}`)
      extracted = regexExtract(html, text, contactText, links)
    }

    const company_name = extracted.company_name
    const company_email = extracted.company_email
    const company_linkedin = extracted.company_linkedin
    const company_type = extracted.company_type
    let contact_name = extracted.contact_name
    let contact_role = extracted.contact_role
    let contact_linkedin = extracted.contact_linkedin

    // LinkedIn scraping fallback: AI found a company page but no contact name
    if (company_linkedin && !contact_name) {
      const li = await discoverLinkedInContact(company_linkedin)
      contact_name = li.contact_name
      contact_role = li.contact_role
      contact_linkedin = li.contact_linkedin ?? extracted.contact_linkedin
    }
```

- [ ] **Step 3: Update the contact object to use `company_type`**

Find (around line 133):
```typescript
    const contact = {
      domain: job.domain,
      vertical: lead?.vertical ?? null,
      company_type: null,
```

Replace with:
```typescript
    const contact = {
      domain: job.domain,
      vertical: lead?.vertical ?? null,
      company_type,
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd worker
npx ts-node --transpile-only index.ts &
sleep 3 && kill %1
```

Expected: Worker starts printing `[worker] Starting poll loop` with no TypeScript errors.

- [ ] **Step 5: Test against one real domain manually**

Temporarily add to `.env.local` if not already set:
```
OPENAI_API_KEY=sk-your-key-here
```

Run the worker and queue one domain from the dashboard. Check the logs for:
```
[worker] Processing example.com (attempt 1)
[worker] example.com → AI extraction OK
[worker] example.com → completed | Data Collected: Done
```

Check Supabase `lead_contacts` table — `company_type` column should now be populated (not null).

- [ ] **Step 6: Commit**

```bash
git add worker/index.ts
git commit -m "feat: wire GPT-4o-mini extraction into scraping worker"
```
