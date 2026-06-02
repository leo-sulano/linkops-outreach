# Leads Research Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Selenium-powered lead research platform that reads affiliate domains from a Google Sheet, scrapes company info using Selenium + regex, and displays enriched contacts in a new `/leads` section of the existing dashboard.

**Architecture:** Supabase `lead_jobs` table serves as a durable job queue. Next.js API writes pending jobs (grouped by `run_id`); the Selenium worker (separate Node.js service in `worker/`) polls for them, scrapes each domain, and writes enriched contacts to Supabase + Google Sheets. The dashboard polls `/api/leads/job-status?runId=...` every 3s for live per-domain progress.

**Tech Stack:** Next.js 14 (Pages Router), TypeScript, Tailwind CSS, Supabase PostgreSQL (`@supabase/supabase-js`), Selenium WebDriver (`selenium-webdriver`), Google Sheets API (`googleapis`), `ts-jest` for tests.

---

## File Map

**New files:**
- `prisma/migrations/20260602_leads_schema.sql`
- `lib/leads/repository.ts`
- `lib/leads/enrichment.ts`
- `lib/leads/sheets-service.ts`
- `pages/api/leads/process.ts`
- `pages/api/leads/job-status.ts`
- `pages/api/leads/contacts.ts`
- `pages/api/leads/sync-sheet.ts`
- `components/leads/StatsCards.tsx`
- `components/leads/JobStatusRow.tsx`
- `components/leads/ProcessingModal.tsx`
- `components/leads/NewLeadsTable.tsx`
- `components/leads/ContactsTable.tsx`
- `components/leads/OutreachTable.tsx`
- `pages/leads/index.tsx`
- `pages/leads/new-leads.tsx`
- `pages/leads/contacts.tsx`
- `pages/leads/outreach-ready.tsx`
- `tests/leads/enrichment.test.ts`
- `worker/package.json`
- `worker/tsconfig.json`
- `worker/scraper.ts`
- `worker/linkedin.ts`
- `worker/index.ts`

**Modified files:**
- `components/dashboard/Sidebar.tsx` — add Leads nav section

---

## Task 1: Database Migration

**Files:**
- Create: `prisma/migrations/20260602_leads_schema.sql`

- [ ] **Step 1: Write the SQL migration**

Create `prisma/migrations/20260602_leads_schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS leads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_found  DATE,
  vertical    TEXT,
  query       TEXT,
  domain      TEXT UNIQUE NOT NULL,
  url         TEXT,
  title       TEXT,
  type        TEXT NOT NULL DEFAULT 'Unknown',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_contacts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain            TEXT UNIQUE NOT NULL,
  vertical          TEXT,
  company_type      TEXT,
  company_name      TEXT,
  company_email     TEXT,
  company_linkedin  TEXT,
  contact_name      TEXT,
  contact_role      TEXT,
  contact_linkedin  TEXT,
  new_lead          BOOLEAN NOT NULL DEFAULT TRUE,
  emailed           BOOLEAN NOT NULL DEFAULT FALSE,
  contacted         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID NOT NULL,
  domain        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','processing','completed','needs_review','failed')),
  retry_count   INT NOT NULL DEFAULT 0,
  error_log     TEXT,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_jobs_status_idx ON lead_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS lead_jobs_run_id_idx ON lead_jobs (run_id);

CREATE OR REPLACE FUNCTION update_lead_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lead_contacts_updated_at
  BEFORE UPDATE ON lead_contacts
  FOR EACH ROW EXECUTE FUNCTION update_lead_contacts_updated_at();
```

- [ ] **Step 2: Run migration in Supabase**

Open Supabase Dashboard → SQL Editor → paste the file contents above → Run.
Verify `leads`, `lead_contacts`, and `lead_jobs` appear in the Table Editor.

- [ ] **Step 3: Commit**

```bash
rtk git add prisma/migrations/20260602_leads_schema.sql
rtk git commit -m "feat: add leads/lead_contacts/lead_jobs schema migration"
```

---

## Task 2: Repository Layer

**Files:**
- Create: `lib/leads/repository.ts`

- [ ] **Step 1: Create `lib/leads/repository.ts`**

```typescript
import { getSupabaseAdminClient } from '@/lib/integrations/supabase'

export interface Lead {
  id: string
  date_found: string | null
  vertical: string | null
  query: string | null
  domain: string
  url: string | null
  title: string | null
  type: string
  created_at: string
}

export interface LeadContact {
  id: string
  domain: string
  vertical: string | null
  company_type: string | null
  company_name: string | null
  company_email: string | null
  company_linkedin: string | null
  contact_name: string | null
  contact_role: string | null
  contact_linkedin: string | null
  new_lead: boolean
  emailed: boolean
  contacted: boolean
  created_at: string
  updated_at: string
}

export interface LeadJob {
  id: string
  run_id: string
  domain: string
  status: 'pending' | 'processing' | 'completed' | 'needs_review' | 'failed'
  retry_count: number
  error_log: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface LeadStats {
  totalLeads: number
  totalContacts: number
  newLeads: number
  affiliates: number
  needsReview: number
  outreachReady: number
}

export async function upsertLeads(leads: Omit<Lead, 'id' | 'created_at'>[]): Promise<void> {
  const sb = getSupabaseAdminClient()
  const { error } = await sb.from('leads').upsert(leads, { onConflict: 'domain' })
  if (error) throw new Error(`upsertLeads: ${error.message}`)
}

export async function getExistingContactDomains(): Promise<Set<string>> {
  const sb = getSupabaseAdminClient()
  const { data, error } = await sb.from('lead_contacts').select('domain')
  if (error) throw new Error(`getExistingContactDomains: ${error.message}`)
  return new Set((data ?? []).map((r) => r.domain))
}

export async function insertPendingJobs(runId: string, domains: string[]): Promise<void> {
  const sb = getSupabaseAdminClient()
  const rows = domains.map((domain) => ({ run_id: runId, domain, status: 'pending' }))
  const { error } = await sb.from('lead_jobs').insert(rows)
  if (error) throw new Error(`insertPendingJobs: ${error.message}`)
}

export async function upsertContact(
  contact: Omit<LeadContact, 'id' | 'created_at' | 'updated_at'>
): Promise<void> {
  const sb = getSupabaseAdminClient()
  const { error } = await sb.from('lead_contacts').upsert(contact, { onConflict: 'domain' })
  if (error) throw new Error(`upsertContact: ${error.message}`)
}

export async function getJobsByRunId(runId: string): Promise<LeadJob[]> {
  const sb = getSupabaseAdminClient()
  const { data, error } = await sb
    .from('lead_jobs')
    .select('*')
    .eq('run_id', runId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`getJobsByRunId: ${error.message}`)
  return (data ?? []) as LeadJob[]
}

export async function getContacts(params: {
  search?: string
  vertical?: string
  page?: number
  perPage?: number
}): Promise<{ contacts: LeadContact[]; total: number }> {
  const sb = getSupabaseAdminClient()
  const { search, vertical, page = 1, perPage = 50 } = params
  const from = (page - 1) * perPage
  const to = from + perPage - 1

  let query = sb.from('lead_contacts').select('*', { count: 'exact' })
  if (search) {
    query = query.or(
      `domain.ilike.%${search}%,company_name.ilike.%${search}%,company_email.ilike.%${search}%,contact_name.ilike.%${search}%`
    )
  }
  if (vertical) query = query.eq('vertical', vertical)

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw new Error(`getContacts: ${error.message}`)
  return { contacts: (data ?? []) as LeadContact[], total: count ?? 0 }
}

export async function getOutreachReady(): Promise<LeadContact[]> {
  const sb = getSupabaseAdminClient()
  const { data, error } = await sb
    .from('lead_contacts')
    .select('*')
    .not('company_name', 'is', null)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`getOutreachReady: ${error.message}`)
  return (data ?? []) as LeadContact[]
}

export async function getLeadStats(): Promise<LeadStats> {
  const sb = getSupabaseAdminClient()
  const [
    { count: totalLeads },
    { count: totalContacts },
    { count: newLeads },
    { count: affiliates },
    { count: needsReview },
    { count: outreachReady },
  ] = await Promise.all([
    sb.from('leads').select('*', { count: 'exact', head: true }),
    sb.from('lead_contacts').select('*', { count: 'exact', head: true }),
    sb.from('lead_contacts').select('*', { count: 'exact', head: true }).eq('new_lead', true),
    sb.from('leads').select('*', { count: 'exact', head: true }).eq('type', 'Affiliate'),
    sb.from('lead_jobs').select('*', { count: 'exact', head: true }).eq('status', 'needs_review'),
    sb
      .from('lead_contacts')
      .select('*', { count: 'exact', head: true })
      .not('company_name', 'is', null),
  ])
  return {
    totalLeads: totalLeads ?? 0,
    totalContacts: totalContacts ?? 0,
    newLeads: newLeads ?? 0,
    affiliates: affiliates ?? 0,
    needsReview: needsReview ?? 0,
    outreachReady: outreachReady ?? 0,
  }
}

export async function getNewLeads(): Promise<
  { domain: string; vertical: string | null; status: string }[]
> {
  const sb = getSupabaseAdminClient()
  const { data: affiliates } = await sb
    .from('leads')
    .select('domain, vertical')
    .eq('type', 'Affiliate')
  if (!affiliates) return []

  const existing = await getExistingContactDomains()
  const newDomains = affiliates.filter((a) => !existing.has(a.domain))
  if (newDomains.length === 0) return []

  const { data: jobs } = await sb
    .from('lead_jobs')
    .select('domain, status')
    .in(
      'domain',
      newDomains.map((d) => d.domain)
    )

  const jobMap = new Map((jobs ?? []).map((j) => [j.domain, j.status]))

  return newDomains.map((a) => ({
    domain: a.domain,
    vertical: a.vertical,
    status: jobMap.get(a.domain) ?? 'unprocessed',
  }))
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add lib/leads/repository.ts
rtk git commit -m "feat: add leads repository layer"
```

---

## Task 3: Enrichment Logic + Tests

**Files:**
- Create: `lib/leads/enrichment.ts`
- Create: `tests/leads/enrichment.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/leads/enrichment.test.ts`:

```typescript
import {
  extractCompanyName,
  extractEmail,
  extractLinkedInCompany,
} from '@/lib/leads/enrichment'

describe('extractCompanyName', () => {
  it('extracts owned and operated by pattern', () => {
    const text = 'This site is owned and operated by Gentoo Media Ltd.'
    expect(extractCompanyName(text)).toBe('Gentoo Media Ltd')
  })

  it('extracts copyright symbol pattern', () => {
    const text = '© 2024 Catena Media Ltd. All rights reserved.'
    expect(extractCompanyName(text)).toBe('Catena Media Ltd')
  })

  it('extracts published by pattern', () => {
    const text = 'Published by Black Dog Corporation'
    expect(extractCompanyName(text)).toBe('Black Dog Corporation')
  })

  it('extracts operated by pattern', () => {
    const text = 'Operated by Gambling.com Group Limited'
    expect(extractCompanyName(text)).toBe('Gambling.com Group Limited')
  })

  it('returns null when no pattern matches', () => {
    expect(extractCompanyName('This site has no ownership info.')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractCompanyName('')).toBeNull()
  })
})

describe('extractEmail', () => {
  it('extracts preferred mailto link first', () => {
    const html = '<a href="mailto:info@example.com">Contact</a>'
    expect(extractEmail(html)).toBe('info@example.com')
  })

  it('prefers contact@ over generic emails', () => {
    const html = 'Email us at contact@example.com or admin@example.com'
    expect(extractEmail(html)).toBe('contact@example.com')
  })

  it('falls back to any email in text', () => {
    const html = 'Reach us at team@example.com'
    expect(extractEmail(html)).toBe('team@example.com')
  })

  it('returns null when no email found', () => {
    expect(extractEmail('<p>No contact info here</p>')).toBeNull()
  })
})

describe('extractLinkedInCompany', () => {
  it('extracts linkedin company URL', () => {
    const links = [
      'https://twitter.com/example',
      'https://www.linkedin.com/company/example-media/',
      'https://facebook.com/example',
    ]
    expect(extractLinkedInCompany(links)).toBe(
      'https://www.linkedin.com/company/example-media/'
    )
  })

  it('prefers longer slug', () => {
    const links = [
      'https://linkedin.com/company/abc',
      'https://linkedin.com/company/abc-media-group',
    ]
    expect(extractLinkedInCompany(links)).toBe(
      'https://linkedin.com/company/abc-media-group'
    )
  })

  it('returns null when no company LinkedIn found', () => {
    expect(extractLinkedInCompany(['https://linkedin.com/in/johndoe'])).toBeNull()
  })

  it('returns null for empty array', () => {
    expect(extractLinkedInCompany([])).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
rtk npx jest tests/leads/enrichment.test.ts --no-coverage
```

Expected: `Cannot find module '@/lib/leads/enrichment'`

- [ ] **Step 3: Create `lib/leads/enrichment.ts`**

```typescript
const COMPANY_PATTERNS = [
  /(?:owned\s+(?:and\s+)?operated|published|managed|operated)\s+by\s+([A-Z][^\n.]{2,60})/i,
  /©\s*\d{0,4}\s*([A-Z][A-Za-z\s&.,'-]{2,60}(?:Ltd|LLC|Inc|GmbH|BV|SL|AB|Media|Group|Digital|Solutions|Corporation|Company|Co\b)[A-Za-z\s.,'-]{0,20})/i,
  /Copyright\s+©?\s*\d{0,4}\s*([A-Z][^\n.]{2,60})/i,
]

export function extractCompanyName(text: string): string | null {
  for (const pattern of COMPANY_PATTERNS) {
    const match = text.match(pattern)
    if (match?.[1]) {
      return match[1].trim().replace(/[.,]+$/, '')
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
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
rtk npx jest tests/leads/enrichment.test.ts --no-coverage
```

Expected: `3 test suites, 12 tests passed`

- [ ] **Step 5: Commit**

```bash
rtk git add lib/leads/enrichment.ts tests/leads/enrichment.test.ts
rtk git commit -m "feat: add enrichment extraction logic with tests"
```

---

## Task 4: Sheets Service

**Files:**
- Create: `lib/leads/sheets-service.ts`

- [ ] **Step 1: Create `lib/leads/sheets-service.ts`**

```typescript
import { google } from 'googleapis'

let sheetsClient: ReturnType<typeof google.sheets> | null = null

function getSheetsClient() {
  if (!sheetsClient) {
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
    const privateKey = process.env.GOOGLE_PRIVATE_KEY
    if (!clientEmail || !privateKey) {
      throw new Error('Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY')
    }
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
    sheetsClient = google.sheets({ version: 'v4', auth })
  }
  return sheetsClient
}

export interface SheetLead {
  date_found: string | null
  vertical: string | null
  query: string | null
  domain: string
  url: string | null
  title: string | null
  type: string
}

export interface SheetContact {
  domain: string
  vertical: string | null
  company_type: string | null
  company_name: string | null
  company_email: string | null
  company_linkedin: string | null
  contact_name: string | null
  contact_role: string | null
  contact_linkedin: string | null
}

// Columns: date_found(A) vertical(B) query(C) domain(D) url(E) title(F) type(G)
export async function readLeadsSheet(
  spreadsheetId: string,
  tab: string
): Promise<SheetLead[]> {
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A2:G`,
  })
  const rows = res.data.values ?? []
  return rows
    .filter((row) => row.length > 0 && row[3])
    .map((row) => ({
      date_found: row[0] || null,
      vertical: row[1] || null,
      query: row[2] || null,
      domain: String(row[3])
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, ''),
      url: row[4] || null,
      title: row[5] || null,
      type: row[6] || 'Unknown',
    }))
}

// Columns: domain(A) vertical(B) company_type(C) company_name(D) company_email(E)
//          company_linkedin(F) contact_name(G) contact_role(H) contact_linkedin(I)
//          new_lead(J) emailed(K) contacted(L)
export async function appendContactsToSheet(
  spreadsheetId: string,
  tab: string,
  contacts: SheetContact[]
): Promise<void> {
  if (contacts.length === 0) return
  const sheets = getSheetsClient()
  const values = contacts.map((c) => [
    c.domain,
    c.vertical ?? '',
    c.company_type ?? '',
    c.company_name ?? '',
    c.company_email ?? '',
    c.company_linkedin ?? '',
    c.contact_name ?? '',
    c.contact_role ?? '',
    c.contact_linkedin ?? '',
    'TRUE',
    'FALSE',
    'FALSE',
  ])
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values },
  })
}
```

- [ ] **Step 2: Add env vars to `.env.local`**

Add these lines to `.env.local` if not present:
```
GOOGLE_LEADS_SHEET_TAB=Leads
GOOGLE_CONTACTS_SHEET_TAB=Contacts
```

- [ ] **Step 3: Commit**

```bash
rtk git add lib/leads/sheets-service.ts
rtk git commit -m "feat: add leads sheets service"
```

---

## Task 5: Process API Route

**Files:**
- Create: `pages/api/leads/process.ts`

- [ ] **Step 1: Create `pages/api/leads/process.ts`**

```typescript
import { NextApiRequest, NextApiResponse } from 'next'
import { randomUUID } from 'crypto'
import { requireApiKey } from '@/lib/api-auth'
import { readLeadsSheet } from '@/lib/leads/sheets-service'
import {
  upsertLeads,
  getExistingContactDomains,
  insertPendingJobs,
} from '@/lib/leads/repository'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireApiKey(req, res)) return

  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID!
    const leadsTab = process.env.GOOGLE_LEADS_SHEET_TAB || 'Leads'

    const sheetLeads = await readLeadsSheet(spreadsheetId, leadsTab)
    const affiliates = sheetLeads.filter((l) => l.type === 'Affiliate')
    await upsertLeads(affiliates)

    const existing = await getExistingContactDomains()
    const newDomains = affiliates
      .map((l) => l.domain)
      .filter((d) => !existing.has(d))

    if (newDomains.length === 0) {
      return res.status(200).json({
        runId: null,
        queued: 0,
        message: 'No new affiliate domains to process',
      })
    }

    const runId = randomUUID()
    await insertPendingJobs(runId, newDomains)

    return res.status(200).json({ runId, queued: newDomains.length })
  } catch (err: any) {
    console.error('[leads/process]', err)
    return res.status(500).json({ error: err.message ?? 'Internal server error' })
  }
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add pages/api/leads/process.ts
rtk git commit -m "feat: add leads process API route"
```

---

## Task 6: Job Status API Route

**Files:**
- Create: `pages/api/leads/job-status.ts`

- [ ] **Step 1: Create `pages/api/leads/job-status.ts`**

```typescript
import { NextApiRequest, NextApiResponse } from 'next'
import { requireApiKey } from '@/lib/api-auth'
import { getJobsByRunId } from '@/lib/leads/repository'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireApiKey(req, res)) return

  const { runId } = req.query
  if (!runId || typeof runId !== 'string') {
    return res.status(400).json({ error: 'runId query param required' })
  }

  try {
    const jobs = await getJobsByRunId(runId)
    return res.status(200).json({ jobs })
  } catch (err: any) {
    console.error('[leads/job-status]', err)
    return res.status(500).json({ error: err.message ?? 'Internal server error' })
  }
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add pages/api/leads/job-status.ts
rtk git commit -m "feat: add job-status API route"
```

---

## Task 7: Contacts + Stats API Route

**Files:**
- Create: `pages/api/leads/contacts.ts`

- [ ] **Step 1: Create `pages/api/leads/contacts.ts`**

```typescript
import { NextApiRequest, NextApiResponse } from 'next'
import { requireApiKey } from '@/lib/api-auth'
import {
  getContacts,
  getLeadStats,
  getNewLeads,
  getOutreachReady,
} from '@/lib/leads/repository'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireApiKey(req, res)) return

  const { view, search, vertical, page, perPage } = req.query

  try {
    if (view === 'stats') {
      return res.status(200).json(await getLeadStats())
    }
    if (view === 'new-leads') {
      return res.status(200).json({ leads: await getNewLeads() })
    }
    if (view === 'outreach-ready') {
      return res.status(200).json({ contacts: await getOutreachReady() })
    }

    const result = await getContacts({
      search: typeof search === 'string' ? search : undefined,
      vertical: typeof vertical === 'string' ? vertical : undefined,
      page: page ? parseInt(page as string, 10) : 1,
      perPage: perPage ? parseInt(perPage as string, 10) : 50,
    })
    return res.status(200).json(result)
  } catch (err: any) {
    console.error('[leads/contacts]', err)
    return res.status(500).json({ error: err.message ?? 'Internal server error' })
  }
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add pages/api/leads/contacts.ts
rtk git commit -m "feat: add leads contacts API route"
```

---

## Task 8: Sync Sheet API Route

**Files:**
- Create: `pages/api/leads/sync-sheet.ts`

- [ ] **Step 1: Create `pages/api/leads/sync-sheet.ts`**

```typescript
import { NextApiRequest, NextApiResponse } from 'next'
import { requireApiKey } from '@/lib/api-auth'
import { getContacts } from '@/lib/leads/repository'
import { appendContactsToSheet } from '@/lib/leads/sheets-service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireApiKey(req, res)) return

  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID!
    const contactsTab = process.env.GOOGLE_CONTACTS_SHEET_TAB || 'Contacts'
    const { contacts } = await getContacts({ perPage: 10000 })
    await appendContactsToSheet(spreadsheetId, contactsTab, contacts)
    return res.status(200).json({ synced: contacts.length })
  } catch (err: any) {
    console.error('[leads/sync-sheet]', err)
    return res.status(500).json({ error: err.message ?? 'Internal server error' })
  }
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add pages/api/leads/sync-sheet.ts
rtk git commit -m "feat: add sync-sheet API route"
```

---

## Task 9: Worker Setup

**Files:**
- Create: `worker/package.json`
- Create: `worker/tsconfig.json`

- [ ] **Step 1: Create `worker/package.json`**

```json
{
  "name": "linkops-worker",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "ts-node -r tsconfig-paths/register index.ts",
    "build": "tsc"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.103.0",
    "dotenv": "^17.4.1",
    "googleapis": "^171.4.0",
    "selenium-webdriver": "^4.20.0"
  },
  "devDependencies": {
    "@types/node": "^25.6.0",
    "@types/selenium-webdriver": "^4.1.26",
    "ts-node": "^10.9.2",
    "tsconfig-paths": "^4.2.0",
    "typescript": "^5.3.3"
  }
}
```

- [ ] **Step 2: Create `worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "outDir": "./dist",
    "rootDir": ".",
    "baseUrl": ".",
    "paths": {
      "@/*": ["../*"]
    }
  },
  "include": ["*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Install worker dependencies**

```bash
cd worker && npm install
```

Expected: `node_modules/selenium-webdriver` present in `worker/node_modules/`

- [ ] **Step 4: Verify ChromeDriver is available on the worker machine**

```bash
chromedriver --version
```

If missing: `npm install -g chromedriver` on the machine that will run the worker.

- [ ] **Step 5: Commit**

```bash
cd ..
rtk git add worker/package.json worker/tsconfig.json worker/package-lock.json
rtk git commit -m "feat: add worker package setup"
```

---

## Task 10: Scraper

**Files:**
- Create: `worker/scraper.ts`

- [ ] **Step 1: Create `worker/scraper.ts`**

```typescript
import { Builder, Browser, By, WebDriver } from 'selenium-webdriver'
import { Options } from 'selenium-webdriver/chrome'

const SUBPAGES = [
  '',
  '/about',
  '/about-us',
  '/contact',
  '/privacy',
  '/privacy-policy',
  '/terms',
  '/terms-and-conditions',
]

const PAGE_TIMEOUT_MS = 15_000
const NAV_DELAY_MS = 2_000

export interface ScrapeResult {
  text: string
  links: string[]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function scrapeDomain(domain: string): Promise<ScrapeResult> {
  const options = new Options()
  options.addArguments(
    '--headless',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--window-size=1280,800',
    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  )

  const driver: WebDriver = await new Builder()
    .forBrowser(Browser.CHROME)
    .setChromeOptions(options)
    .build()

  await driver.manage().setTimeouts({ pageLoad: PAGE_TIMEOUT_MS, implicit: 5_000 })

  const allText: string[] = []
  const allLinks = new Set<string>()

  try {
    const baseUrl = `https://${domain}`

    for (const subpath of SUBPAGES) {
      try {
        await driver.get(`${baseUrl}${subpath}`)
        const body = await driver.findElement(By.tagName('body'))
        allText.push(await body.getText())

        const anchors = await driver.findElements(By.tagName('a'))
        for (const anchor of anchors) {
          try {
            const href = await anchor.getAttribute('href')
            if (href) allLinks.add(href)
          } catch {
            // stale element — skip
          }
        }

        await sleep(NAV_DELAY_MS)
      } catch {
        // page not found or timeout — skip this subpage
      }
    }
  } finally {
    await driver.quit()
  }

  return { text: allText.join('\n\n'), links: Array.from(allLinks) }
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add worker/scraper.ts
rtk git commit -m "feat: add Selenium scraper"
```

---

## Task 11: LinkedIn Scraper

**Files:**
- Create: `worker/linkedin.ts`

- [ ] **Step 1: Create `worker/linkedin.ts`**

```typescript
import { Builder, Browser, By, WebDriver } from 'selenium-webdriver'
import { Options } from 'selenium-webdriver/chrome'

export interface LinkedInContact {
  contact_name: string | null
  contact_role: string | null
  contact_linkedin: string | null
}

const ROLE_PATTERN =
  /\b(Founder|Co-Founder|CEO|Chief Executive|Owner|Managing Director)\b/i
const NAME_PATTERN = /^[A-Z][a-z]+ [A-Z][a-z]+/

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function discoverLinkedInContact(
  linkedInUrl: string
): Promise<LinkedInContact> {
  const empty: LinkedInContact = {
    contact_name: null,
    contact_role: null,
    contact_linkedin: null,
  }

  let driver: WebDriver | null = null
  try {
    const options = new Options()
    options.addArguments(
      '--headless',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,800',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    )

    driver = await new Builder()
      .forBrowser(Browser.CHROME)
      .setChromeOptions(options)
      .build()

    await driver.manage().setTimeouts({ pageLoad: 15_000, implicit: 5_000 })
    await driver.get(linkedInUrl)
    await sleep(3_000)

    // Bail if redirected to login wall
    const currentUrl = await driver.getCurrentUrl()
    if (currentUrl.includes('/login') || currentUrl.includes('/checkpoint')) {
      return empty
    }

    const bodyText = await driver.findElement(By.tagName('body')).getText()
    const lines = bodyText.split('\n').map((l) => l.trim()).filter(Boolean)

    for (let i = 0; i < lines.length; i++) {
      const roleMatch = lines[i].match(ROLE_PATTERN)
      if (!roleMatch) continue

      const candidates = [lines[i - 2], lines[i - 1], lines[i + 1], lines[i + 2]]
      const name = candidates.find((c) => c && NAME_PATTERN.test(c))
      if (!name) continue

      // Look for their /in/ profile link near their name
      let profileUrl: string | null = null
      const anchors = await driver.findElements(By.tagName('a'))
      for (const anchor of anchors) {
        try {
          const href = await anchor.getAttribute('href')
          const text = await anchor.getText()
          if (
            href?.includes('linkedin.com/in/') &&
            text.includes(name.split(' ')[0])
          ) {
            profileUrl = href
            break
          }
        } catch {
          // stale — skip
        }
      }

      return {
        contact_name: name,
        contact_role: roleMatch[1],
        contact_linkedin: profileUrl,
      }
    }

    return empty
  } catch {
    return empty
  } finally {
    try {
      await driver?.quit()
    } catch {
      // ignore
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add worker/linkedin.ts
rtk git commit -m "feat: add LinkedIn contact discovery"
```

---

## Task 12: Worker Poll Loop

**Files:**
- Create: `worker/index.ts`

- [ ] **Step 1: Create `worker/index.ts`**

```typescript
import * as dotenv from 'dotenv'
dotenv.config({ path: '../.env.local' })

import { createClient } from '@supabase/supabase-js'
import { scrapeDomain } from './scraper'
import { discoverLinkedInContact } from './linkedin'
import { extractCompanyName, extractEmail, extractLinkedInCompany } from '../lib/leads/enrichment'
import { appendContactsToSheet } from '../lib/leads/sheets-service'

const POLL_INTERVAL_MS = 5_000
const DOMAIN_DELAY_MS = 5_000
const MAX_RETRIES = 3

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function claimPendingJob() {
  const sb = getSupabase()
  const { data } = await sb
    .from('lead_jobs')
    .select('*')
    .eq('status', 'pending')
    .lt('retry_count', MAX_RETRIES)
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  if (!data) return null

  const { error } = await sb
    .from('lead_jobs')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', data.id)
    .eq('status', 'pending') // optimistic lock

  return error ? null : data
}

async function processJob(job: {
  id: string
  domain: string
  retry_count: number
}) {
  const sb = getSupabase()
  console.log(`[worker] Processing ${job.domain} (attempt ${job.retry_count + 1})`)

  try {
    const { text, links } = await scrapeDomain(job.domain)
    const company_name = extractCompanyName(text)
    const company_email = extractEmail(text)
    const company_linkedin = extractLinkedInCompany(links)

    let contact_name: string | null = null
    let contact_role: string | null = null
    let contact_linkedin: string | null = null

    if (company_linkedin) {
      const li = await discoverLinkedInContact(company_linkedin)
      contact_name = li.contact_name
      contact_role = li.contact_role
      contact_linkedin = li.contact_linkedin
    }

    const { data: lead } = await sb
      .from('leads')
      .select('vertical')
      .eq('domain', job.domain)
      .single()

    const contact = {
      domain: job.domain,
      vertical: lead?.vertical ?? null,
      company_type: null,
      company_name,
      company_email,
      company_linkedin,
      contact_name,
      contact_role,
      contact_linkedin,
      new_lead: true,
      emailed: false,
      contacted: false,
    }

    await sb.from('lead_contacts').upsert(contact, { onConflict: 'domain' })

    await appendContactsToSheet(
      process.env.GOOGLE_SHEET_ID!,
      process.env.GOOGLE_CONTACTS_SHEET_TAB || 'Contacts',
      [contact]
    )

    const finalStatus = company_name ? 'completed' : 'needs_review'
    await sb
      .from('lead_jobs')
      .update({ status: finalStatus, completed_at: new Date().toISOString() })
      .eq('id', job.id)

    console.log(`[worker] ${job.domain} → ${finalStatus}`)
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    console.error(`[worker] ${job.domain} failed: ${msg}`)

    const newRetry = job.retry_count + 1
    await sb
      .from('lead_jobs')
      .update({
        status: newRetry >= MAX_RETRIES ? 'failed' : 'pending',
        retry_count: newRetry,
        error_log: msg,
      })
      .eq('id', job.id)
  }
}

async function pollLoop() {
  console.log('[worker] Starting poll loop...')
  while (true) {
    const job = await claimPendingJob()
    if (job) {
      await processJob(job)
      await sleep(DOMAIN_DELAY_MS)
    } else {
      await sleep(POLL_INTERVAL_MS)
    }
  }
}

pollLoop().catch((err) => {
  console.error('[worker] Fatal:', err)
  process.exit(1)
})
```

- [ ] **Step 2: Commit**

```bash
rtk git add worker/index.ts
rtk git commit -m "feat: add worker poll loop"
```

---

## Task 13: StatsCards + JobStatusRow Components

**Files:**
- Create: `components/leads/StatsCards.tsx`
- Create: `components/leads/JobStatusRow.tsx`

- [ ] **Step 1: Create `components/leads/StatsCards.tsx`**

```typescript
import { LeadStats } from '@/lib/leads/repository'

const CARDS: { key: keyof LeadStats; label: string }[] = [
  { key: 'totalLeads', label: 'Total Leads' },
  { key: 'totalContacts', label: 'Total Contacts' },
  { key: 'newLeads', label: 'New Leads' },
  { key: 'affiliates', label: 'Affiliates' },
  { key: 'needsReview', label: 'Needs Review' },
  { key: 'outreachReady', label: 'Outreach Ready' },
]

export function StatsCards({ stats }: { stats: LeadStats }) {
  return (
    <div className="grid grid-cols-2 gap-4 mb-8 sm:grid-cols-3 xl:grid-cols-6">
      {CARDS.map(({ key, label }) => (
        <div key={key} className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <p className="text-xs text-slate-400 mb-1">{label}</p>
          <p className="text-2xl font-bold text-slate-100">{stats[key]}</p>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create `components/leads/JobStatusRow.tsx`**

```typescript
export type JobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'needs_review'
  | 'failed'
  | 'unprocessed'

const STATUS_STYLES: Record<JobStatus, string> = {
  pending: 'bg-slate-500/10 text-slate-400 border border-slate-500/20',
  processing: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  completed: 'bg-green-500/10 text-green-400 border border-green-500/20',
  needs_review: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  failed: 'bg-red-500/10 text-red-400 border border-red-500/20',
  unprocessed: 'bg-slate-500/10 text-slate-500 border border-slate-600/20',
}

const STATUS_LABELS: Record<JobStatus, string> = {
  pending: 'Pending',
  processing: 'Processing…',
  completed: 'Completed',
  needs_review: 'Needs Review',
  failed: 'Failed',
  unprocessed: 'Unprocessed',
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[status]}`}
    >
      {status === 'processing' && (
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
      )}
      {STATUS_LABELS[status]}
    </span>
  )
}

export function JobStatusRow({ domain, status }: { domain: string; status: JobStatus }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-slate-800/50">
      <span className="text-sm text-slate-300 font-mono truncate mr-4">{domain}</span>
      <JobStatusBadge status={status} />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
rtk git add components/leads/StatsCards.tsx components/leads/JobStatusRow.tsx
rtk git commit -m "feat: add StatsCards and JobStatusRow components"
```

---

## Task 14: ProcessingModal Component

**Files:**
- Create: `components/leads/ProcessingModal.tsx`

- [ ] **Step 1: Create `components/leads/ProcessingModal.tsx`**

```typescript
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { JobStatusRow, JobStatus } from './JobStatusRow'

interface Job {
  id: string
  domain: string
  status: JobStatus
}

const API_HEADERS = { 'x-api-key': process.env.NEXT_PUBLIC_API_SECRET_KEY || '' }

export function ProcessingModal({
  runId,
  onComplete,
}: {
  runId: string
  onComplete: () => void
}) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [done, setDone] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const completed = jobs.filter((j) =>
    ['completed', 'needs_review', 'failed'].includes(j.status)
  ).length
  const total = jobs.length
  const allFinished = total > 0 && completed === total
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/leads/job-status?runId=${runId}`, {
          headers: API_HEADERS,
        })
        if (!res.ok) return
        const data = await res.json()
        setJobs(data.jobs ?? [])
      } catch {
        // ignore transient errors
      }
    }

    poll()
    intervalRef.current = setInterval(poll, 3_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [runId])

  useEffect(() => {
    if (allFinished && !done) {
      setDone(true)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [allFinished, done])

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="text-base font-semibold text-slate-100">Processing Leads</h2>
          {done && (
            <button
              onClick={onComplete}
              className="text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="px-5 py-4 border-b border-slate-700">
          <div className="flex justify-between text-xs text-slate-400 mb-2">
            <span>
              {completed} / {total} domains
            </span>
            <span>{progressPct}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Job list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-0.5">
          {jobs.length === 0 ? (
            <p className="text-slate-500 text-sm py-4 text-center">
              Waiting for worker to pick up jobs…
            </p>
          ) : (
            jobs.map((job) => (
              <JobStatusRow key={job.id} domain={job.domain} status={job.status} />
            ))
          )}
        </div>

        {/* Footer */}
        {done && (
          <div className="px-5 py-4 border-t border-slate-700">
            <button
              onClick={onComplete}
              className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add components/leads/ProcessingModal.tsx
rtk git commit -m "feat: add ProcessingModal component"
```

---

## Task 15: NewLeadsTable Component

**Files:**
- Create: `components/leads/NewLeadsTable.tsx`

- [ ] **Step 1: Create `components/leads/NewLeadsTable.tsx`**

```typescript
import { JobStatusBadge, JobStatus } from './JobStatusRow'

interface NewLead {
  domain: string
  vertical: string | null
  status: string
}

export function NewLeadsTable({
  leads,
  isProcessing,
  onProcess,
}: {
  leads: NewLead[]
  isProcessing: boolean
  onProcess: () => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-100">
          New Leads ({leads.length})
        </h2>
        <button
          onClick={onProcess}
          disabled={isProcessing || leads.length === 0}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {isProcessing ? 'Processing…' : 'Process New Leads'}
        </button>
      </div>

      {leads.length === 0 ? (
        <p className="text-slate-500 text-sm">No new affiliate domains to process.</p>
      ) : (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <div className="grid grid-cols-3 px-4 py-2 border-b border-slate-700 text-xs font-medium text-slate-400 uppercase tracking-wider">
            <span>Domain</span>
            <span>Vertical</span>
            <span className="text-right">Status</span>
          </div>
          <div className="divide-y divide-slate-800">
            {leads.map((lead) => (
              <div
                key={lead.domain}
                className="grid grid-cols-3 items-center px-4 py-2.5 hover:bg-slate-800/50"
              >
                <span className="text-sm font-mono text-slate-200">{lead.domain}</span>
                <span className="text-sm text-slate-400">{lead.vertical ?? '—'}</span>
                <div className="flex justify-end">
                  <JobStatusBadge status={(lead.status as JobStatus) || 'unprocessed'} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add components/leads/NewLeadsTable.tsx
rtk git commit -m "feat: add NewLeadsTable component"
```

---

## Task 16: ContactsTable Component

**Files:**
- Create: `components/leads/ContactsTable.tsx`

- [ ] **Step 1: Create `components/leads/ContactsTable.tsx`**

```typescript
import { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { LeadContact } from '@/lib/leads/repository'

type SortKey = keyof Pick<
  LeadContact,
  'domain' | 'company_name' | 'company_email' | 'contact_name' | 'contact_role' | 'vertical'
>

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'domain', label: 'Domain' },
  { key: 'company_name', label: 'Company Name' },
  { key: 'company_email', label: 'Email' },
  { key: 'contact_name', label: 'Contact Name' },
  { key: 'contact_role', label: 'Role' },
  { key: 'vertical', label: 'Vertical' },
]

export function ContactsTable({
  contacts,
  total,
  page,
  perPage,
  search,
  vertical,
  onSearch,
  onVertical,
  onPage,
}: {
  contacts: LeadContact[]
  total: number
  page: number
  perPage: number
  search: string
  vertical: string
  onSearch: (v: string) => void
  onVertical: (v: string) => void
  onPage: (p: number) => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>('domain')
  const [sortAsc, setSortAsc] = useState(true)

  const verticals = useMemo(() => {
    const s = new Set(contacts.map((c) => c.vertical).filter(Boolean) as string[])
    return Array.from(s).sort()
  }, [contacts])

  const sorted = useMemo(() => {
    return [...contacts].sort((a, b) => {
      const av = (a[sortKey] ?? '') as string
      const bv = (b[sortKey] ?? '') as string
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }, [contacts, sortKey, sortAsc])

  const totalPages = Math.ceil(total / perPage)

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortAsc((p) => !p)
    else { setSortKey(key); setSortAsc(true) }
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search domain, company, email…"
          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-500"
        />
        <select
          value={vertical}
          onChange={(e) => onVertical(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-500"
        >
          <option value="">All Verticals</option>
          {verticals.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
        <div className="grid grid-cols-6 px-4 py-2 border-b border-slate-700 text-xs font-medium text-slate-400 uppercase tracking-wider">
          {COLUMNS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleSort(key)}
              className="flex items-center gap-1 hover:text-slate-200 transition-colors text-left"
            >
              {label}
              {sortKey === key ? (
                sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />
              ) : null}
            </button>
          ))}
        </div>

        <div className="divide-y divide-slate-800">
          {sorted.length === 0 ? (
            <p className="text-slate-500 text-sm px-4 py-6 text-center">No contacts found.</p>
          ) : (
            sorted.map((c) => (
              <div
                key={c.id}
                className="grid grid-cols-6 items-center px-4 py-2.5 hover:bg-slate-800/50 text-sm"
              >
                <span className="font-mono text-slate-200 truncate">{c.domain}</span>
                <span className="text-slate-300 truncate">{c.company_name ?? '—'}</span>
                <span className="text-slate-400 truncate">{c.company_email ?? '—'}</span>
                <span className="text-slate-300 truncate">{c.contact_name ?? '—'}</span>
                <span className="text-slate-400 truncate">{c.contact_role ?? '—'}</span>
                <span className="text-slate-500 truncate">{c.vertical ?? '—'}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-400">
          <span>
            {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onPage(page - 1)}
              disabled={page === 1}
              className="px-3 py-1 rounded-md border border-slate-700 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => onPage(page + 1)}
              disabled={page === totalPages}
              className="px-3 py-1 rounded-md border border-slate-700 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add components/leads/ContactsTable.tsx
rtk git commit -m "feat: add ContactsTable component"
```

---

## Task 17: OutreachTable Component

**Files:**
- Create: `components/leads/OutreachTable.tsx`

- [ ] **Step 1: Create `components/leads/OutreachTable.tsx`**

```typescript
import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { LeadContact } from '@/lib/leads/repository'

function CopyButton({ value }: { value: string | null }) {
  const [copied, setCopied] = useState(false)
  if (!value) return <span className="text-slate-600 text-xs">—</span>

  function handleCopy() {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2_000)
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors text-xs"
    >
      <span className="truncate max-w-[160px]">{value}</span>
      {copied ? (
        <Check size={12} className="text-green-400 shrink-0" />
      ) : (
        <Copy size={12} className="shrink-0" />
      )}
    </button>
  )
}

function CopyAllButton({ contact }: { contact: LeadContact }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    const row = [
      contact.domain,
      contact.company_name,
      contact.company_email,
      contact.company_linkedin,
      contact.contact_name,
      contact.contact_role,
      contact.contact_linkedin,
    ]
      .map((v) => v ?? '')
      .join('\t')
    navigator.clipboard.writeText(row)
    setCopied(true)
    setTimeout(() => setCopied(false), 2_000)
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-slate-500 hover:text-slate-300 transition-colors text-xs px-2 py-0.5 rounded border border-slate-700 hover:border-slate-500"
    >
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy Row'}
    </button>
  )
}

export function OutreachTable({ contacts }: { contacts: LeadContact[] }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-100">
          Outreach Ready ({contacts.length})
        </h2>
      </div>

      {contacts.length === 0 ? (
        <p className="text-slate-500 text-sm">
          No outreach-ready contacts yet. Process new leads to populate this list.
        </p>
      ) : (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 px-4 py-2 border-b border-slate-700 text-xs font-medium text-slate-400 uppercase tracking-wider">
            <span>Domain</span>
            <span>Company</span>
            <span>Email</span>
            <span>Company LinkedIn</span>
            <span>Contact</span>
            <span>Role</span>
            <span className="text-right">Copy</span>
          </div>
          <div className="divide-y divide-slate-800">
            {contacts.map((c) => (
              <div
                key={c.id}
                className="grid grid-cols-7 items-center px-4 py-2.5 hover:bg-slate-800/50 text-sm"
              >
                <span className="font-mono text-slate-200 truncate">{c.domain}</span>
                <span className="text-slate-300 truncate">{c.company_name ?? '—'}</span>
                <CopyButton value={c.company_email} />
                <CopyButton value={c.company_linkedin} />
                <span className="text-slate-300 truncate">{c.contact_name ?? '—'}</span>
                <span className="text-slate-400 truncate">{c.contact_role ?? '—'}</span>
                <div className="flex justify-end">
                  <CopyAllButton contact={c} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add components/leads/OutreachTable.tsx
rtk git commit -m "feat: add OutreachTable component"
```

---

## Task 18: Leads Dashboard Pages

**Files:**
- Create: `pages/leads/index.tsx`
- Create: `pages/leads/new-leads.tsx`
- Create: `pages/leads/contacts.tsx`
- Create: `pages/leads/outreach-ready.tsx`

- [ ] **Step 1: Create `pages/leads/index.tsx`**

```typescript
import { GetServerSideProps } from 'next'
import { StatsCards } from '@/components/leads/StatsCards'
import { LeadStats, getLeadStats } from '@/lib/leads/repository'

export const getServerSideProps: GetServerSideProps = async () => {
  try {
    const stats = await getLeadStats()
    return { props: { stats } }
  } catch {
    return {
      props: {
        stats: {
          totalLeads: 0,
          totalContacts: 0,
          newLeads: 0,
          affiliates: 0,
          needsReview: 0,
          outreachReady: 0,
        },
      },
    }
  }
}

export default function LeadsOverviewPage({ stats }: { stats: LeadStats }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <h1 className="text-2xl font-bold text-slate-100 mb-6">Leads Overview</h1>
      <StatsCards stats={stats} />
    </div>
  )
}
```

- [ ] **Step 2: Create `pages/leads/new-leads.tsx`**

```typescript
import { useState } from 'react'
import { GetServerSideProps } from 'next'
import { NewLeadsTable } from '@/components/leads/NewLeadsTable'
import { ProcessingModal } from '@/components/leads/ProcessingModal'
import { getNewLeads } from '@/lib/leads/repository'

const API_HEADERS = {
  'x-api-key': process.env.NEXT_PUBLIC_API_SECRET_KEY || '',
  'Content-Type': 'application/json',
}

interface NewLead {
  domain: string
  vertical: string | null
  status: string
}

export const getServerSideProps: GetServerSideProps = async () => {
  try {
    const leads = await getNewLeads()
    return { props: { initialLeads: leads } }
  } catch {
    return { props: { initialLeads: [] } }
  }
}

export default function NewLeadsPage({
  initialLeads,
}: {
  initialLeads: NewLead[]
}) {
  const [leads, setLeads] = useState<NewLead[]>(initialLeads)
  const [isProcessing, setIsProcessing] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleProcess() {
    setIsProcessing(true)
    setError(null)
    try {
      const res = await fetch('/api/leads/process', {
        method: 'POST',
        headers: API_HEADERS,
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`)
        setIsProcessing(false)
        return
      }
      if (data.runId) {
        setRunId(data.runId)
      } else {
        setError(data.message ?? 'No new leads to process')
        setIsProcessing(false)
      }
    } catch {
      setError('Failed to start processing')
      setIsProcessing(false)
    }
  }

  async function handleModalComplete() {
    setRunId(null)
    setIsProcessing(false)
    // Refresh the list
    try {
      const res = await fetch('/api/leads/contacts?view=new-leads', {
        headers: { 'x-api-key': process.env.NEXT_PUBLIC_API_SECRET_KEY || '' },
      })
      const data = await res.json()
      setLeads(data.leads ?? [])
    } catch {
      // ignore
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <h1 className="text-2xl font-bold text-slate-100 mb-6">New Leads</h1>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      <NewLeadsTable
        leads={leads}
        isProcessing={isProcessing}
        onProcess={handleProcess}
      />

      {runId && (
        <ProcessingModal runId={runId} onComplete={handleModalComplete} />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create `pages/leads/contacts.tsx`**

```typescript
import { useState, useEffect } from 'react'
import { ContactsTable } from '@/components/leads/ContactsTable'
import { LeadContact } from '@/lib/leads/repository'

const API_KEY = process.env.NEXT_PUBLIC_API_SECRET_KEY || ''

export default function ContactsPage() {
  const [contacts, setContacts] = useState<LeadContact[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [vertical, setVertical] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (vertical) params.set('vertical', vertical)
    params.set('page', String(page))
    params.set('perPage', '50')

    setLoading(true)
    fetch(`/api/leads/contacts?${params}`, { headers: { 'x-api-key': API_KEY } })
      .then((r) => r.json())
      .then((data) => {
        setContacts(data.contacts ?? [])
        setTotal(data.total ?? 0)
        setError(null)
      })
      .catch(() => setError('Failed to load contacts'))
      .finally(() => setLoading(false))
  }, [search, vertical, page])

  // Reset to page 1 when filters change
  function handleSearch(v: string) { setSearch(v); setPage(1) }
  function handleVertical(v: string) { setVertical(v); setPage(1) }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <h1 className="text-2xl font-bold text-slate-100 mb-6">Contacts</h1>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : (
        <ContactsTable
          contacts={contacts}
          total={total}
          page={page}
          perPage={50}
          search={search}
          vertical={vertical}
          onSearch={handleSearch}
          onVertical={handleVertical}
          onPage={setPage}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create `pages/leads/outreach-ready.tsx`**

```typescript
import { GetServerSideProps } from 'next'
import { OutreachTable } from '@/components/leads/OutreachTable'
import { LeadContact, getOutreachReady } from '@/lib/leads/repository'

export const getServerSideProps: GetServerSideProps = async () => {
  try {
    const contacts = await getOutreachReady()
    return { props: { contacts } }
  } catch {
    return { props: { contacts: [] } }
  }
}

export default function OutreachReadyPage({
  contacts,
}: {
  contacts: LeadContact[]
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <h1 className="text-2xl font-bold text-slate-100 mb-6">Outreach Ready</h1>
      <OutreachTable contacts={contacts} />
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
rtk git add pages/leads/index.tsx pages/leads/new-leads.tsx pages/leads/contacts.tsx pages/leads/outreach-ready.tsx
rtk git commit -m "feat: add leads dashboard pages"
```

---

## Task 19: Sidebar Update

**Files:**
- Modify: `components/dashboard/Sidebar.tsx`

- [ ] **Step 1: Read current Sidebar.tsx**

Read [components/dashboard/Sidebar.tsx](components/dashboard/Sidebar.tsx) to find the exact line where `toolsItems` is rendered, so the Leads section can be inserted above it.

- [ ] **Step 2: Add Leads nav imports**

The existing import in `Sidebar.tsx` already has `LayoutGrid, Mail, SendHorizontal, Reply, MessageSquare, Scale, Handshake, CheckCircle, CreditCard, Globe, Link, Inbox, FileText, Users`. Add `Search`, `Users2`, `Zap`, `BarChart2` to that same import block:

```typescript
import {
  LayoutGrid,
  Mail,
  SendHorizontal,
  Reply,
  MessageSquare,
  Scale,
  Handshake,
  CheckCircle,
  CreditCard,
  Globe,
  Link,
  Inbox,
  FileText,
  Users,
  Search,
  Users2,
  Zap,
  BarChart2,
} from 'lucide-react';
```

- [ ] **Step 3: Add Leads section**

Inside the `Sidebar` component, add this `leadsItems` array after `toolsItems`:

```typescript
const leadsItems = [
  { label: 'Overview', href: '/leads', icon: BarChart2 },
  { label: 'New Leads', href: '/leads/new-leads', icon: Search },
  { label: 'Contacts', href: '/leads/contacts', icon: Users2 },
  { label: 'Outreach Ready', href: '/leads/outreach-ready', icon: Zap },
];
```

- [ ] **Step 4: Render Leads section in the sidebar JSX**

Find the section that renders `toolsItems` (it has a heading like "Tools") and add the Leads section directly above it:

```tsx
{/* Leads Research */}
<div className="px-3 py-2">
  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 px-2">
    Leads
  </p>
  {leadsItems.map((item) => (
    <a
      key={item.href}
      href={item.href}
      className="flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
    >
      <item.icon size={15} />
      {item.label}
    </a>
  ))}
</div>
```

- [ ] **Step 5: Run type-check**

```bash
rtk npx tsc --noEmit
```

Expected: no errors (or only pre-existing errors unrelated to Sidebar)

- [ ] **Step 6: Commit**

```bash
rtk git add components/dashboard/Sidebar.tsx
rtk git commit -m "feat: add Leads nav section to Sidebar"
```

---

## Task 20: Smoke Test End-to-End

- [ ] **Step 1: Start the dev server**

```bash
rtk npm run dev
```

- [ ] **Step 2: Verify Leads nav appears**

Open `http://localhost:3000/dashboard`. Confirm the "Leads" section is visible in the sidebar with Overview, New Leads, Contacts, Outreach Ready links.

- [ ] **Step 3: Verify stats page loads**

Navigate to `http://localhost:3000/leads`. Confirm 6 stat cards appear (all zeroes is fine — tables are empty).

- [ ] **Step 4: Verify new-leads page loads**

Navigate to `http://localhost:3000/leads/new-leads`. Confirm the "Process New Leads" button is visible.

- [ ] **Step 5: Add a test row to your Leads sheet**

In your Google Sheet, add a row to the Leads tab with `type = Affiliate` and a test domain (e.g. `testdomain.com`).

- [ ] **Step 6: Click Process New Leads**

Click the button. Confirm the `ProcessingModal` opens and shows 1 domain in `pending` status.

- [ ] **Step 7: Start the worker**

In a separate terminal:

```bash
cd worker && npm start
```

Expected output:
```
[worker] Starting poll loop...
[worker] Processing testdomain.com (attempt 1)
[worker] testdomain.com → completed (or needs_review)
```

- [ ] **Step 8: Confirm modal progress updates**

The dashboard should update the domain row from `pending` → `processing` → `completed` or `needs_review` as the worker runs.

- [ ] **Step 9: Check Contacts page**

Navigate to `http://localhost:3000/leads/contacts`. Confirm `testdomain.com` appears with whatever data was extracted.

- [ ] **Step 10: Check Outreach Ready page**

If `company_name` was extracted, `testdomain.com` should appear at `http://localhost:3000/leads/outreach-ready` with copy buttons.

- [ ] **Step 11: Run full test suite**

```bash
rtk npx jest --no-coverage
```

Expected: all tests pass

- [ ] **Step 12: Commit**

```bash
rtk git add .
rtk git commit -m "feat: leads research dashboard — complete implementation"
```
