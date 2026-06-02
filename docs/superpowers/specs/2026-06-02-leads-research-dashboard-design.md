# Leads Research Dashboard — Design Spec

**Date:** 2026-06-02
**Status:** Approved

---

## Overview

A production-ready lead research platform that automates affiliate lead enrichment.
Reads new affiliate domains from a Google Sheets "Leads" tab, scrapes each domain with Selenium to extract company name, email, and LinkedIn, then writes enriched records to a "Contacts" tab and a Supabase `contacts` table.

No AI APIs. All extraction uses Selenium, regex, and HTML parsing.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (Pages Router), TypeScript, Tailwind CSS |
| Backend | Next.js API Routes |
| Database | Supabase PostgreSQL |
| Automation | Selenium WebDriver + ChromeDriver (separate Node.js worker) |
| Integrations | Google Sheets API |
| Hosting | Frontend → Vercel; Worker → separate Node.js service (Railway / Render / VPS) |

---

## Architecture

```
Google Sheets (Leads tab)
        ↓
  Next.js API (/api/leads/process)
        ↓  writes pending jobs
  Supabase: lead_jobs table
        ↓  polls every 5s
  Selenium Worker (Node.js service)
        ↓  writes enriched data
  Supabase: leads + contacts tables
        ↑  polls for status
  Next.js Dashboard (Pages Router)
        ↑  reads/displays
  Supabase: leads + contacts tables
```

### Flow when "Process New Leads" is clicked

1. API reads the Leads sheet — filters `type = Affiliate`
2. Compares domains against existing `contacts` table — skips duplicates
3. Inserts new domains as `pending` rows into `lead_jobs`
4. Returns immediately (no waiting)
5. Selenium worker polls `lead_jobs` for `pending` rows every 5s
6. Claims a job (`status = processing`), scrapes the domain, writes to `contacts`
7. Marks job `completed`, `needs_review`, or `failed`
8. Dashboard polls `/api/leads/job-status` every 3s to show live per-domain progress

---

## Database Schema

### `leads` table

```sql
id          uuid primary key
date_found  date
vertical    text
query       text
domain      text unique
url         text
title       text
type        text        -- 'Affiliate' | 'Operator' | 'Unknown'
created_at  timestamptz default now()
```

### `contacts` table

```sql
id                  uuid primary key
domain              text unique
vertical            text
company_type        text
company_name        text
company_email       text
company_linkedin    text
contact_name        text
contact_role        text
contact_linkedin    text
new_lead            boolean default true
emailed             boolean default false
contacted           boolean default false
created_at          timestamptz default now()
updated_at          timestamptz default now()
```

### `lead_jobs` table

```sql
id            uuid primary key
domain        text
status        text   -- 'pending' | 'processing' | 'completed' | 'needs_review' | 'failed'
retry_count   int default 0
error_log     text
started_at    timestamptz
completed_at  timestamptz
created_at    timestamptz default now()
```

### Status rules

| Status | Meaning |
|---|---|
| `pending` | Queued, not yet started |
| `processing` | Worker has claimed this job |
| `completed` | Enriched record written to `contacts` and Contacts sheet |
| `needs_review` | Scraping succeeded but `company_name` is empty |
| `failed` | Errored after 3 retries; `error_log` stores last error |

---

## Folder Structure

```
pages/
  leads/
    index.tsx             ← Overview (stats cards)
    new-leads.tsx         ← Unprocessed domains + "Process New Leads" button
    contacts.tsx          ← Enriched contacts (search / sort / filter / paginate)
    outreach-ready.tsx    ← Affiliates with company_name, copy-to-clipboard

  api/
    leads/
      process.ts          ← Trigger: read Leads sheet → insert lead_jobs
      job-status.ts       ← Poll: return per-domain status from lead_jobs
      contacts.ts         ← GET contacts (search, filter, paginate)
      sync-sheet.ts       ← Write completed contacts back to Contacts sheet

components/
  leads/
    StatsCards.tsx        ← 6 metric cards
    NewLeadsTable.tsx     ← Domain / Vertical / Status rows
    ContactsTable.tsx     ← Full enriched contacts with search/sort
    OutreachTable.tsx     ← Outreach-ready rows + copy buttons
    ProcessingModal.tsx   ← Live progress overlay during job run
    JobStatusRow.tsx      ← Per-domain status badge + progress

lib/
  leads/
    repository.ts         ← All Supabase queries (leads, contacts, lead_jobs)
    enrichment.ts         ← Extract company name / email / LinkedIn from raw HTML
    sheets-service.ts     ← Read Leads sheet, write Contacts sheet

worker/
  index.ts                ← Poll loop — claims jobs, calls scraper
  scraper.ts              ← Selenium: visit domain + subpages, collect text/links
  linkedin.ts             ← Attempt LinkedIn company page parse
  enrichment.ts           ← Shared extraction logic (mirrors lib/leads/enrichment.ts)
  package.json            ← Standalone — includes selenium-webdriver

prisma/
  migrations/
    XXXX_leads_schema.sql ← leads + contacts + lead_jobs tables
```

---

## Selenium Scraping Workflow

### Pages visited per domain (failures skipped silently)

```
https://domain.com
https://domain.com/about
https://domain.com/about-us
https://domain.com/contact
https://domain.com/privacy
https://domain.com/privacy-policy
https://domain.com/terms
https://domain.com/terms-and-conditions
```

All page text and all `<a href>` links collected into a single corpus before extraction.

### Rate limiting

- 1 domain at a time (sequential)
- 2-second delay between page navigations within a domain
- 5-second delay between domains
- Per-domain timeout: 60 seconds

### Retry logic

- Max 3 attempts per domain
- On failure: increment `retry_count`, write to `error_log`, re-queue as `pending`
- After 3 failures: mark `failed`, stop retrying

---

## Enrichment Logic

### Company name (regex over combined page text, first match wins)

```
/(?:owned\s+(?:and\s+)?operated|published|managed|operated)\s+by\s+([A-Z][^\n\.]{2,60})/i
/©\s*\d{0,4}\s*([A-Z][A-Za-z\s&.,'-]{2,60}(?:Ltd|LLC|Inc|GmbH|BV|SL|AB|Media|Group|Digital|Solutions)?)/i
/Copyright\s+©?\s*\d{0,4}\s*([A-Z][^\n\.]{2,60})/i
```

No match → `company_name` left null → job status = `needs_review`.

### Email (priority order)

1. `mailto:` links matching `info@|contact@|support@|hello@|admin@`
2. Any `mailto:` link on the contact page
3. Regex `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}` from page text (contact page first, then footer)

### LinkedIn company page

1. Scan all `<a href>` links for `linkedin.com/company/`
2. If multiple found, prefer the longest slug (most specific)
3. Result → `company_linkedin`

### Contact discovery (best-effort)

1. Visit `company_linkedin` URL with Selenium
2. Parse visible HTML for roles: `Founder`, `Co-Founder`, `CEO`, `Owner`, `Managing Director`
3. If found alongside a name → `contact_name`, `contact_role`, `contact_linkedin`
4. Any exception (403, login redirect, timeout) → leave fields blank, continue

---

## Dashboard UI

### Navigation

New "Leads" group added to existing `Sidebar.tsx`:

```
Leads
  ├── Overview
  ├── New Leads
  ├── Contacts
  └── Outreach Ready
```

### Overview (`/leads`)

Six stat cards using existing `StatsCard` style:

| Card | Query |
|---|---|
| Total Leads | `leads` count |
| Total Contacts | `contacts` count |
| New Leads | `contacts` where `new_lead = true` |
| Affiliates | `leads` where `type = Affiliate` |
| Needs Review | `lead_jobs` where `status = needs_review` |
| Outreach Ready | `contacts` where `company_name IS NOT NULL` |

### New Leads (`/leads/new-leads`)

- Table: Domain / Vertical / Status badge
- "Process New Leads" button in top bar
- While processing: `ProcessingModal` overlay with per-domain live status (polls every 3s)
- Each row: `JobStatusRow` — pending → processing (spinner) → completed / needs_review / failed

### Contacts (`/leads/contacts`)

- Columns: Domain / Company Name / Email / LinkedIn / Contact Name / Contact Role
- Client-side search across all text fields
- Sort by any column (click header)
- Filter by vertical
- Pagination: 50 per page

### Outreach Ready (`/leads/outreach-ready`)

- Same columns as Contacts, filtered to `company_name IS NOT NULL`
- Copy-to-clipboard button per field (email, LinkedIn, contact LinkedIn)
- "Copy All" button copies full row as tab-separated text

### Processing Modal

- Progress bar (completed / total)
- Scrollable per-domain status list
- "Running X / Y domains" label
- Dismissible only after all jobs finish
- Polls `/api/leads/job-status` every 3 seconds

---

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/leads/process` | POST | Read Leads sheet, insert `pending` lead_jobs for new affiliates |
| `/api/leads/job-status` | GET | Return all lead_jobs for a run (by run_id or latest) |
| `/api/leads/contacts` | GET | Paginated contacts with search/filter params |
| `/api/leads/sync-sheet` | POST | Write completed contacts to Contacts sheet tab |

---

## Worker Service

Standalone Node.js process in `worker/` with its own `package.json`.

### Poll loop (`worker/index.ts`)

```
while (true) {
  claim one pending job from lead_jobs
  if none → sleep 5s → continue
  scrape domain (scraper.ts)
  run enrichment (enrichment.ts)
  try linkedin contact discovery (linkedin.ts)
  write result to contacts table
  update lead_job status
  append to Contacts sheet (via sheets API)
  sleep 5s
}
```

### Environment variables (shared with Next.js via `.env`)

```
SUPABASE_URL
SUPABASE_SERVICE_KEY
GOOGLE_SHEET_ID
GOOGLE_SERVICE_ACCOUNT_JSON
```

---

## Google Sheets Integration

### Reads from Leads tab

Columns: `date_found`, `vertical`, `query`, `domain`, `url`, `title`, `type`
Filter: `type = Affiliate`

### Appends to Contacts tab

Columns written per new record:
`domain`, `vertical`, `company_type`, `company_name`, `company_email`, `company_linkedin`, `contact_name`, `contact_role`, `contact_linkedin`, `new_lead=TRUE`, `emailed=FALSE`, `contacted=FALSE`

Extends existing `lib/integrations/sheets.ts`.

---

## Error Handling

- All Selenium operations wrapped in try/catch; page-level failures skip that page, domain-level failures trigger retry
- API routes return structured `{ error, details }` on failure
- Worker logs per-domain errors to `lead_jobs.error_log`
- Duplicate domains silently skipped (checked before inserting `lead_jobs`)
