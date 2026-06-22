# AI Research Enrichment — Design Spec
**Date:** 2026-06-19

## Overview

Add a Gemini-powered research step that runs on every scraped lead, after the existing AI extraction pass, to validate and enrich the scraped data before it is written to the database. The research step uses Gemini 2.0 Flash with built-in Google Search grounding to query multiple external public sources, cross-references findings, and only overwrites scraped fields when 2 or more independent sources agree. When no corroboration is found, the scraped value is preserved unchanged.

The existing `aiExtract()` step (gpt-4o-mini) is unchanged. Gemini is used only for the new research step — its free tier covers up to 1,500 grounding requests/day at no cost.

---

## Problem

The current pipeline (`scraper` → `aiExtract` → DB write) extracts data only from what Selenium can scrape off the website itself. If a site buries its legal name, has no contact page, or uses a brand name that differs from the registered entity, the data is either missing or inaccurate. There is no external validation step — whatever the scraper finds goes straight to the database.

---

## Architecture

### New file: `worker/ai-research.ts`

A single exported function:

```ts
export async function aiResearch(
  domain: string,
  scraped: AIExtractResult
): Promise<Partial<AIExtractResult>>
```

- **Input:** the domain and the `AIExtractResult` already produced by `aiExtract()` (used as hints for the model)
- **Output:** a partial `AIExtractResult` containing only fields corroborated by 2+ sources — unverified fields are omitted (left as `undefined`/absent)
- **Model:** `gemini-2.0-flash` via Google Generative AI SDK (`@google/generative-ai`) with `tools: [{ googleSearch: {} }]` — Google Search grounding is built-in and free up to 1,500 requests/day

### Changes to `worker/index.ts`

After `aiExtract()` succeeds (or `regexExtract()` fires as fallback), call `aiResearch()` and merge:

```
scraped = aiExtract() or regexExtract()
research = await aiResearch(domain, scraped)
final = { ...scraped, ...research }   // research wins only where it returns a value
```

The final merged object is what gets written to `lead_contacts` and synced to the sheet.

---

## Research Step Detail

### Prompt strategy

The model is given:
- The domain name
- The scraped values as "preliminary findings to verify" (not authoritative)
- Instructions to search for:
  1. Domain registrant / Whois ownership
  2. Legal company name from Google, company registries (Companies House, OpenCorporates, etc.)
  3. LinkedIn company page and any listed founders/executives
  4. Any other public record that corroborates or contradicts the scraped data

For each field (`company_name`, `contact_name`, `contact_role`, `company_email`, `company_linkedin`, `contact_linkedin`), the model must list the sources it found the value in. It returns a value for a field **only if it appears in 2 or more independent sources** — two results from the same domain (e.g., two pages on the company's own site) do not count as independent. Otherwise it returns `null` for that field.

Classification fields (`company_type`, `accepts_guest_posts`, `has_advertise_page`) are not part of the research step — they are set by `aiExtract()` and never overwritten.

### Output schema

```ts
{
  company_name: string | null,
  contact_name: string | null,
  contact_role: string | null,
  company_email: string | null,
  company_linkedin: string | null,
  contact_linkedin: string | null,
  sources: {
    [field: string]: string[]   // list of source URLs/names that corroborated
  }
}
```

Null fields are excluded from the merge — the scraped value is kept.

---

## Merge Logic

| Scraped value | Research value | Final value |
|---------------|----------------|-------------|
| "Acme Blog"   | "Acme Ltd"     | "Acme Ltd" (research wins — corroborated) |
| "Acme Blog"   | null           | "Acme Blog" (scraper kept) |
| null          | "Acme Ltd"     | "Acme Ltd" (research fills gap) |
| null          | null           | null |

---

## Error Handling

- If `aiResearch()` throws (API error, rate limit, timeout): log a warning, return `{}` (empty), proceed with scraped data only — no job status change
- If the Gemini call succeeds but returns no corroborated fields: merge produces no changes, scraped data written as-is
- Research failures never block the job from completing
- If the free tier daily limit (1,500 requests) is exceeded, Gemini returns a quota error — treated as a silent failure, scraped data used as-is

---

## What Does NOT Change

- Scraping logic (`scraper.ts`, `challenges.ts`, `linkedin.ts`) — untouched
- AI extraction (`ai-extract.ts`, `enrichment.ts`) — untouched
- Job status states (`completed`, `needs_review`, `failed`) — untouched
- DB schema — no new columns needed; `sources` is used internally only (not persisted)

---

## Success Criteria

- Every lead goes through the research step before DB write
- Fields backed by 2+ external sources overwrite scraped values
- Fields with no corroboration leave scraped values unchanged
- Research failures are silent (warning log only) — pipeline never stalls
- No change to job throughput beyond the added latency of the Gemini search grounding call (~3–8s per domain)
- Cost: $0 for up to 1,500 leads/day on Gemini free tier; token cost only (~$0.0003/lead) above that
