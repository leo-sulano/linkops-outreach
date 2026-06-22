# AI Research Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Gemini 2.0 Flash research step that runs after `aiExtract()` on every lead, validates scraped data against external public sources, and overwrites fields only when 2+ independent sources agree.

**Architecture:** A new `worker/ai-research.ts` exports a single `aiResearch(domain, scraped)` function that calls Gemini 2.0 Flash with Google Search grounding. `worker/index.ts` calls it after extraction and merges the result — research wins where it returns a value, scraped data is kept where research returns nothing.

**Tech Stack:** `@google/generative-ai` (Google AI SDK for JS), `gemini-2.0-flash`, Google Search grounding tool, TypeScript, ts-node

## Global Constraints

- `GEMINI_API_KEY` must be set in `.env.local` — worker already loads this file via `dotenv`
- Model: `gemini-2.0-flash` — do not use flash-exp or pro variants
- Classification fields (`company_type`, `accepts_guest_posts`, `has_advertise_page`) are never touched by the research step
- Research failures must be silent — a thrown error must never fail the job
- Free tier limit: 1,500 grounding requests/day — quota errors are treated as silent failures

---

### Task 1: Install `@google/generative-ai` in the worker package

**Files:**
- Modify: `worker/package.json`

**Interfaces:**
- Produces: `@google/generative-ai` available as an import in all worker `.ts` files

- [ ] **Step 1: Install the package**

Run from the `worker/` directory:
```bash
cd worker && npm install @google/generative-ai
```

Expected output: `added N packages` with no errors.

- [ ] **Step 2: Verify the package is in package.json**

Open `worker/package.json` and confirm `"@google/generative-ai"` appears under `"dependencies"` with a version like `^0.x.x` or `^1.x.x`.

- [ ] **Step 3: Verify the import resolves**

Create a throwaway file `worker/_test-import.ts`:
```ts
import { GoogleGenerativeAI } from '@google/generative-ai'
console.log('import ok', typeof GoogleGenerativeAI)
```

Run:
```bash
cd worker && npx ts-node --transpile-only _test-import.ts
```

Expected: `import ok function`

- [ ] **Step 4: Delete the throwaway file**

```bash
rm worker/_test-import.ts
```

- [ ] **Step 5: Commit**

```bash
cd worker && git add package.json package-lock.json && git commit -m "chore: add @google/generative-ai to worker dependencies"
```

---

### Task 2: Create `worker/ai-research.ts`

**Files:**
- Create: `worker/ai-research.ts`
- Create: `worker/test-ai-research.ts` (manual integration test, not committed)

**Interfaces:**
- Consumes: `AIExtractResult` from `./ai-extract`
- Produces:
  ```ts
  export async function aiResearch(
    domain: string,
    scraped: AIExtractResult
  ): Promise<Partial<AIExtractResult>>
  ```
  Returns an object containing only the fields Gemini could corroborate from 2+ independent sources. Fields not corroborated are absent (not null) so the merge in `index.ts` uses the spread operator correctly.

- [ ] **Step 1: Create `worker/ai-research.ts`**

```ts
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
    tools: [{ googleSearch: {} }],
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
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd worker && npx ts-node --transpile-only -e "require('./ai-research')"
```

Expected: no output, no errors. (The module loads but doesn't execute anything.)

- [ ] **Step 3: Create a manual integration test script**

Create `worker/test-ai-research.ts` (do NOT commit this file):

```ts
import * as dotenv from 'dotenv'
dotenv.config({ path: '../.env.local' })

import { aiResearch } from './ai-research'

const fakeScrape = {
  company_name: null,
  company_email: null,
  contact_name: null,
  contact_role: null,
  company_linkedin: null,
  contact_linkedin: null,
  company_type: null,
  accepts_guest_posts: false,
  has_advertise_page: false,
}

async function main() {
  const domain = process.argv[2] ?? 'investopedia.com'
  console.log(`Testing aiResearch for: ${domain}`)
  const result = await aiResearch(domain, fakeScrape)
  console.log('Research result:', JSON.stringify(result, null, 2))
}

main().catch(console.error)
```

- [ ] **Step 4: Run the integration test against a known domain**

```bash
cd worker && npx ts-node --transpile-only test-ai-research.ts investopedia.com
```

Expected: a JSON object printed to console. `company_name` should be `"Dotdash Meredith"` or similar (the known owner). Fields that couldn't be corroborated from 2+ sources should be absent or null.

If you see `GEMINI_API_KEY is not set`: confirm `GEMINI_API_KEY` is in `.env.local` one directory up.

If you see a quota error: the free tier daily limit was hit — wait until tomorrow or check usage at aistudio.google.com.

- [ ] **Step 5: Delete the test script**

```bash
rm worker/test-ai-research.ts
```

- [ ] **Step 6: Commit**

```bash
git add worker/ai-research.ts && git commit -m "feat: add Gemini research enrichment step (ai-research.ts)"
```

---

### Task 3: Wire `aiResearch()` into `worker/index.ts`

**Files:**
- Modify: `worker/index.ts:1-10` (add import)
- Modify: `worker/index.ts:109-135` (add research call + merge after extraction block)

**Interfaces:**
- Consumes: `aiResearch(domain, scraped)` → `Promise<Partial<AIExtractResult>>` from `./ai-research`
- Consumes: `AIExtractResult` already in scope from `./ai-extract`

- [ ] **Step 1: Add the import to `worker/index.ts`**

At the top of `worker/index.ts`, after the existing imports, add:

```ts
import { aiResearch } from './ai-research'
```

The full imports block should now look like:
```ts
import * as dotenv from 'dotenv'
dotenv.config({ path: '../.env.local' })

import { createClient } from '@supabase/supabase-js'
import { scrapeDomain } from './scraper'
import { discoverLinkedInContact } from './linkedin'
import { aiExtract, regexExtract, AIExtractResult } from './ai-extract'
import { aiResearch } from './ai-research'
import { updateSingleContactInSheet, markLeadDataCollected } from '../lib/leads/sheets-service'
import { extractLinkedInPerson } from '../lib/leads/enrichment'
```

- [ ] **Step 2: Add the research + merge block after the extraction block**

Find this block in `processJob()` (around line 109–117):

```ts
    // AI extraction — regex fallback fires silently if AI call fails
    let extracted: AIExtractResult
    try {
      extracted = await aiExtract(html, text, contactText, links)
      console.log(`[worker] ${job.domain} → AI extraction OK`)
    } catch (err: any) {
      console.warn(`[worker] ${job.domain} → AI failed, using regex fallback: ${err.message}`)
      extracted = regexExtract(html, text, contactText, links)
    }
```

Replace it with:

```ts
    // AI extraction — regex fallback fires silently if AI call fails
    let extracted: AIExtractResult
    try {
      extracted = await aiExtract(html, text, contactText, links)
      console.log(`[worker] ${job.domain} → AI extraction OK`)
    } catch (err: any) {
      console.warn(`[worker] ${job.domain} → AI failed, using regex fallback: ${err.message}`)
      extracted = regexExtract(html, text, contactText, links)
    }

    // Gemini research — validates and enriches extracted data via Google Search grounding.
    // Only overwrites a field when 2+ independent external sources agree.
    // Failures are silent: scraped data is used as-is.
    let researched: Partial<AIExtractResult> = {}
    try {
      researched = await aiResearch(job.domain, extracted)
      console.log(`[worker] ${job.domain} → Gemini research OK`)
    } catch (err: any) {
      console.warn(`[worker] ${job.domain} → Gemini research failed, using scraped data: ${err.message}`)
    }
    const merged: AIExtractResult = { ...extracted, ...researched } as AIExtractResult
```

- [ ] **Step 3: Replace all `extracted.` references with `merged.` below the merge block**

Find these lines immediately after the block above (around line 119–126):

```ts
    const company_name = extracted.company_name
    const company_email = extracted.company_email
    const company_linkedin = extracted.company_linkedin
    const company_type = extracted.company_type
    let contact_name = extracted.contact_name
    let contact_role = extracted.contact_role
    let contact_linkedin = extracted.contact_linkedin
```

Replace with:

```ts
    const company_name = merged.company_name
    const company_email = merged.company_email
    const company_linkedin = merged.company_linkedin
    const company_type = merged.company_type
    let contact_name = merged.contact_name
    let contact_role = merged.contact_role
    let contact_linkedin = merged.contact_linkedin
```

Also find the LinkedIn personal fallback a few lines later:

```ts
    if (!contact_linkedin) {
      contact_linkedin = extractLinkedInPerson(links)
    }
```

This line is correct as-is — no change needed.

- [ ] **Step 4: Verify the file compiles**

```bash
cd worker && npx ts-node --transpile-only -e "require('./index')" 2>&1 | head -5
```

Expected: the worker starts its poll loop (you'll see `[worker] Starting poll loop`) — Ctrl+C to stop. No TypeScript errors.

- [ ] **Step 5: Run the worker against one real job to confirm the research step fires**

Start the worker:
```bash
cd worker && npm start
```

Queue one pending job (via the dashboard or `queue-leads.ts`), then watch the logs. You should see:
```
[worker] Processing example.com (attempt 1)
[worker] example.com → AI extraction OK
[worker] example.com → Gemini research OK
[worker] example.com → completed | Data Collected: Done
```

If Gemini research fails silently you'll see:
```
[worker] example.com → Gemini research failed, using scraped data: <reason>
```
The job still completes — this is expected behavior when the API is unavailable.

- [ ] **Step 6: Commit**

```bash
git add worker/index.ts && git commit -m "feat: wire Gemini research enrichment into worker pipeline"
```
