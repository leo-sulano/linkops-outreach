# Multi-Sender Outreach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single hardcoded Gmail sender with a round-robin multi-sender system, with per-sender daily limits, outreach logging, and a dashboard management UI.

**Architecture:** Three new Supabase tables (`senders`, `sender_daily_stats`, `outreach_logs`) back a `lib/senders/` module that picks the least-recently-used available sender, dispatches via Gmail API, and logs the result. A new `/dashboard/senders` page lets you manage sender accounts. A `Sender` column appears in the contact table showing which account sent each email.

**Tech Stack:** Next.js 14, Supabase (PostgreSQL), Google Gmail API via `googleapis`, TypeScript, Tailwind CSS, Lucide React icons.

---

## File Map

**New files:**
```
lib/senders/types.ts              — Sender, SenderDailyStat, OutreachLog interfaces
lib/senders/errors.ts             — NoAvailableSenderError, SenderAuthError
lib/senders/gmail.ts              — buildGmailClient(), sendWithClient()
lib/senders/rotate.ts             — getLocalDate(), pickSender()
lib/senders/send.ts               — sendOutreach()
pages/api/senders/index.ts        — GET list, POST create
pages/api/senders/[id].ts         — PUT update, DELETE remove
pages/api/senders/stats.ts        — GET today stats + recent logs
pages/dashboard/senders.tsx       — Sender management page
components/dashboard/AddSenderModal.tsx  — Add/edit modal form
components/dashboard/SenderTable.tsx     — Sender list table
```

**Modified files:**
```
components/dashboard/types.ts            — add senderEmail?: string to Contact
lib/integrations/sheets.ts               — map col 19 ↔ senderEmail
pages/api/paul/send-outreach.ts          — wire in sendOutreach()
components/dashboard/Sidebar.tsx         — add Senders link under Tools
components/dashboard/ContactTable.tsx    — add Sender column header
components/dashboard/ContactTableRow.tsx — add Sender column cell
```

---

## Task 1: Supabase SQL — Create tables and increment function

**Files:**
- Run in Supabase SQL editor (no code file)

- [ ] **Step 1: Open Supabase SQL editor**

Go to your Supabase project → SQL Editor → New query.

- [ ] **Step 2: Run the migration SQL**

```sql
-- Senders
CREATE TABLE IF NOT EXISTS senders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  email            text NOT NULL UNIQUE,
  credential_type  text NOT NULL CHECK (credential_type IN ('service_account', 'oauth')),
  credential_json  jsonb NOT NULL,
  daily_limit      integer NOT NULL DEFAULT 50,
  timezone         text NOT NULL DEFAULT 'Europe/London',
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  last_error       text,
  last_used_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Daily send counts per sender
CREATE TABLE IF NOT EXISTS sender_daily_stats (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   uuid NOT NULL REFERENCES senders(id) ON DELETE CASCADE,
  date        date NOT NULL,
  sent_count  integer NOT NULL DEFAULT 0,
  UNIQUE (sender_id, date)
);

-- Per-send audit log
CREATE TABLE IF NOT EXISTS outreach_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id      uuid NOT NULL REFERENCES senders(id) ON DELETE CASCADE,
  contact_domain text,
  contact_email  text,
  subject        text,
  status         text NOT NULL CHECK (status IN ('sent', 'failed')),
  error          text,
  sent_at        timestamptz NOT NULL DEFAULT now()
);

-- Atomic increment for daily stats (avoids race conditions)
CREATE OR REPLACE FUNCTION increment_sender_daily_count(p_sender_id uuid, p_date date)
RETURNS void AS $$
BEGIN
  INSERT INTO sender_daily_stats (sender_id, date, sent_count)
  VALUES (p_sender_id, p_date, 1)
  ON CONFLICT (sender_id, date)
  DO UPDATE SET sent_count = sender_daily_stats.sent_count + 1;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 3: Verify tables exist**

Run in SQL editor:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('senders', 'sender_daily_stats', 'outreach_logs');
```
Expected: 3 rows returned.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: add Supabase migration SQL for multi-sender tables"
```

---

## Task 2: Sender types and errors

**Files:**
- Create: `lib/senders/types.ts`
- Create: `lib/senders/errors.ts`

- [ ] **Step 1: Create `lib/senders/types.ts`**

```typescript
export type CredentialType = 'service_account' | 'oauth'
export type SenderStatus = 'active' | 'inactive' | 'error'
export type LogStatus = 'sent' | 'failed'

export interface ServiceAccountCredential {
  type: string
  project_id: string
  private_key_id: string
  private_key: string
  client_email: string
  client_id: string
  auth_uri: string
  token_uri: string
  [key: string]: any
}

export interface Sender {
  id: string
  name: string
  email: string
  credential_type: CredentialType
  credential_json: ServiceAccountCredential
  daily_limit: number
  timezone: string
  status: SenderStatus
  last_error: string | null
  last_used_at: string | null
  created_at: string
}

export interface SenderPublic extends Omit<Sender, 'credential_json'> {
  // credential_json is stripped before sending to any client
}

export interface SenderDailyStat {
  id: string
  sender_id: string
  date: string
  sent_count: number
}

export interface OutreachLog {
  id: string
  sender_id: string
  contact_domain: string | null
  contact_email: string | null
  subject: string | null
  status: LogStatus
  error: string | null
  sent_at: string
}

export interface SenderWithStats extends SenderPublic {
  sent_today: number
  recent_logs: Pick<OutreachLog, 'contact_email' | 'subject' | 'status' | 'sent_at' | 'error'>[]
}
```

- [ ] **Step 2: Create `lib/senders/errors.ts`**

```typescript
export class NoAvailableSenderError extends Error {
  constructor() {
    super('No sender available — all senders are at their daily limit or inactive')
    this.name = 'NoAvailableSenderError'
  }
}

export class SenderAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SenderAuthError'
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/senders/types.ts lib/senders/errors.ts
git commit -m "feat: add sender types and error classes"
```

---

## Task 3: Gmail client factory

**Files:**
- Create: `lib/senders/gmail.ts`

- [ ] **Step 1: Create `lib/senders/gmail.ts`**

```typescript
import { google } from 'googleapis'
import type { Sender } from './types'
import { SenderAuthError } from './errors'

export function buildGmailClient(sender: Sender) {
  if (sender.credential_type !== 'service_account') {
    throw new SenderAuthError(`Credential type '${sender.credential_type}' is not supported yet`)
  }

  const creds = sender.credential_json

  if (!creds.client_email || !creds.private_key) {
    throw new SenderAuthError(`Invalid service account JSON for sender: ${sender.email}`)
  }

  // JWT auth with impersonation: sends AS the sender's Gmail address
  const auth = new google.auth.JWT(
    creds.client_email,
    undefined,
    creds.private_key,
    ['https://www.googleapis.com/auth/gmail.send'],
    sender.email
  )

  return google.gmail({ version: 'v1', auth })
}

export async function sendWithClient(
  gmail: ReturnType<typeof google.gmail>,
  to: string,
  subject: string,
  body: string,
  fromEmail: string
): Promise<string> {
  const raw = [
    `From: ${fromEmail}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    '',
    body,
  ].join('\n')

  const encoded = Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded },
  })

  return response.data.id || ''
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/senders/gmail.ts
git commit -m "feat: add Gmail client factory for per-sender auth"
```

---

## Task 4: Round-robin sender rotation

**Files:**
- Create: `lib/senders/rotate.ts`

- [ ] **Step 1: Create `lib/senders/rotate.ts`**

```typescript
import { getSupabaseClient } from '@/lib/integrations/supabase'
import type { Sender } from './types'
import { NoAvailableSenderError } from './errors'

// Returns YYYY-MM-DD in the given IANA timezone
export function getLocalDate(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
}

export interface SenderWithCount extends Sender {
  sent_today: number
}

export async function pickSender(): Promise<SenderWithCount> {
  const client = getSupabaseClient()

  // Load active senders ordered by last_used_at ASC (nulls first = never-used goes first)
  const { data: senders, error } = await client
    .from('senders')
    .select('*')
    .eq('status', 'active')
    .order('last_used_at', { ascending: true, nullsFirst: true })

  if (error) throw new Error(`Failed to load senders: ${error.message}`)
  if (!senders || senders.length === 0) throw new NoAvailableSenderError()

  // Fetch today's sent_count for each sender (in their own timezone)
  const withCounts: SenderWithCount[] = await Promise.all(
    (senders as Sender[]).map(async (sender) => {
      const today = getLocalDate(sender.timezone)
      const { data: stat } = await client
        .from('sender_daily_stats')
        .select('sent_count')
        .eq('sender_id', sender.id)
        .eq('date', today)
        .maybeSingle()
      return { ...sender, sent_today: stat?.sent_count ?? 0 }
    })
  )

  const eligible = withCounts.filter((s) => s.sent_today < s.daily_limit)
  if (eligible.length === 0) throw new NoAvailableSenderError()

  return eligible[0] // already sorted by last_used_at ASC
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/senders/rotate.ts
git commit -m "feat: add round-robin sender rotation with daily limit checks"
```

---

## Task 5: Outreach dispatch — sendOutreach()

**Files:**
- Create: `lib/senders/send.ts`

- [ ] **Step 1: Create `lib/senders/send.ts`**

```typescript
import { getSupabaseClient } from '@/lib/integrations/supabase'
import { buildGmailClient, sendWithClient } from './gmail'
import { pickSender, getLocalDate } from './rotate'
import { SenderAuthError } from './errors'
import { updateContactInSheet } from '@/lib/integrations/sheets'
import type { Contact } from '@/components/dashboard/types'

export async function sendOutreach(
  contact: Contact,
  subject: string,
  body: string
): Promise<{ sender_email: string; message_id: string }> {
  const sender = await pickSender()
  const client = getSupabaseClient()

  let messageId: string

  try {
    const gmail = buildGmailClient(sender)
    messageId = await sendWithClient(gmail, contact.email, subject, body, sender.email)
  } catch (err: any) {
    // Log failure
    await client.from('outreach_logs').insert([{
      sender_id: sender.id,
      contact_domain: contact.domain,
      contact_email: contact.email,
      subject,
      status: 'failed',
      error: err.message,
    }])

    // If it's an auth error, mark the sender as broken
    const isAuthError = err instanceof SenderAuthError || /unauthenticated|invalid_grant|unauthorized/i.test(err.message ?? '')
    if (isAuthError) {
      await client
        .from('senders')
        .update({ status: 'error', last_error: err.message })
        .eq('id', sender.id)
    }

    throw err
  }

  // ── Success path ──────────────────────────────────────────────

  const today = getLocalDate(sender.timezone)

  // Atomic increment of daily count via Postgres function
  await client.rpc('increment_sender_daily_count', {
    p_sender_id: sender.id,
    p_date: today,
  })

  // Update last_used_at for round-robin ordering
  await client
    .from('senders')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', sender.id)

  // Write audit log
  await client.from('outreach_logs').insert([{
    sender_id: sender.id,
    contact_domain: contact.domain,
    contact_email: contact.email,
    subject,
    status: 'sent',
  }])

  // Assign sender email to the contact in Supabase contacts table
  await client
    .from('contacts')
    .update({ email_account: sender.email })
    .eq('domain', contact.domain)

  // Assign sender email to the contact in Google Sheet (col 19, best-effort)
  const sheetId = process.env.GOOGLE_SHEET_ID
  const sheetTab = process.env.GOOGLE_SHEET_TAB || 'Sheet1'
  if (sheetId) {
    try {
      const rowIndex = parseInt(contact.id, 10) - 1
      await updateContactInSheet(sheetId, rowIndex, { senderEmail: sender.email }, sheetTab)
    } catch (sheetErr) {
      console.warn('Could not write sender to Sheet (non-fatal):', sheetErr)
    }
  }

  return { sender_email: sender.email, message_id: messageId }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/senders/send.ts
git commit -m "feat: add sendOutreach with round-robin dispatch, logging, and sender assignment"
```

---

## Task 6: API — list and create senders

**Files:**
- Create: `pages/api/senders/index.ts`

- [ ] **Step 1: Create `pages/api/senders/index.ts`**

```typescript
import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseClient } from '@/lib/integrations/supabase'

const PUBLIC_COLUMNS = 'id, name, email, credential_type, daily_limit, timezone, status, last_error, last_used_at, created_at'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const client = getSupabaseClient()

  if (req.method === 'GET') {
    const { data, error } = await client
      .from('senders')
      .select(PUBLIC_COLUMNS)
      .order('created_at', { ascending: true })

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const { name, email, credential_type, credential_json, daily_limit, timezone } = req.body

    if (!name || !email || !credential_type || !credential_json) {
      return res.status(400).json({ error: 'name, email, credential_type, credential_json are required' })
    }

    if (credential_type !== 'service_account' && credential_type !== 'oauth') {
      return res.status(400).json({ error: 'credential_type must be service_account or oauth' })
    }

    const { data, error } = await client
      .from('senders')
      .insert([{
        name,
        email,
        credential_type,
        credential_json,
        daily_limit: daily_limit ?? 50,
        timezone: timezone ?? 'Europe/London',
      }])
      .select(PUBLIC_COLUMNS)
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
```

- [ ] **Step 2: Verify GET (run after dev server is up)**

```bash
curl http://localhost:3001/api/senders
```
Expected: `[]` (empty array, no senders yet).

- [ ] **Step 3: Commit**

```bash
git add pages/api/senders/index.ts
git commit -m "feat: add senders API — GET list and POST create"
```

---

## Task 7: API — update and delete sender

**Files:**
- Create: `pages/api/senders/[id].ts`

- [ ] **Step 1: Create `pages/api/senders/[id].ts`**

```typescript
import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseClient } from '@/lib/integrations/supabase'

const PUBLIC_COLUMNS = 'id, name, email, credential_type, daily_limit, timezone, status, last_error, last_used_at, created_at'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid id' })

  const client = getSupabaseClient()

  if (req.method === 'PUT') {
    const { name, email, credential_type, credential_json, daily_limit, timezone, status } = req.body
    const updates: Record<string, any> = {}

    if (name !== undefined)            updates.name = name
    if (email !== undefined)           updates.email = email
    if (credential_type !== undefined) updates.credential_type = credential_type
    if (credential_json !== undefined) updates.credential_json = credential_json
    if (daily_limit !== undefined)     updates.daily_limit = daily_limit
    if (timezone !== undefined)        updates.timezone = timezone
    if (status !== undefined) {
      updates.status = status
      if (status === 'active') updates.last_error = null // clear error on re-activate
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' })
    }

    const { data, error } = await client
      .from('senders')
      .update(updates)
      .eq('id', id)
      .select(PUBLIC_COLUMNS)
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'DELETE') {
    const { error } = await client.from('senders').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
```

- [ ] **Step 2: Commit**

```bash
git add "pages/api/senders/[id].ts"
git commit -m "feat: add senders API — PUT update and DELETE"
```

---

## Task 8: API — sender stats

**Files:**
- Create: `pages/api/senders/stats.ts`

- [ ] **Step 1: Create `pages/api/senders/stats.ts`**

```typescript
import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseClient } from '@/lib/integrations/supabase'

function getLocalDate(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const client = getSupabaseClient()

  const { data: senders, error } = await client
    .from('senders')
    .select('id, name, email, daily_limit, timezone, status, last_error')
    .order('created_at', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })

  const stats = await Promise.all(
    (senders || []).map(async (sender: any) => {
      const today = getLocalDate(sender.timezone)

      const { data: stat } = await client
        .from('sender_daily_stats')
        .select('sent_count')
        .eq('sender_id', sender.id)
        .eq('date', today)
        .maybeSingle()

      const { data: logs } = await client
        .from('outreach_logs')
        .select('contact_email, subject, status, sent_at, error')
        .eq('sender_id', sender.id)
        .order('sent_at', { ascending: false })
        .limit(10)

      return {
        id: sender.id,          // must match SenderPublic.id for UI delete/edit/toggle
        name: sender.name,
        email: sender.email,
        daily_limit: sender.daily_limit,
        status: sender.status,
        last_error: sender.last_error,
        sent_today: stat?.sent_count ?? 0,
        recent_logs: logs ?? [],
      }
    })
  )

  return res.status(200).json(stats)
}
```

- [ ] **Step 2: Commit**

```bash
git add pages/api/senders/stats.ts
git commit -m "feat: add senders stats API — daily counts and recent logs"
```

---

## Task 9: Add senderEmail to Contact type and sheet mapping

**Files:**
- Modify: `components/dashboard/types.ts`
- Modify: `lib/integrations/sheets.ts`

- [ ] **Step 1: Add `senderEmail` to Contact interface in `components/dashboard/types.ts`**

Find the `paymentStatus` line and add `senderEmail` after it:

```typescript
  paymentStatus?: 'unpaid' | 'invoiced' | 'paid';
  senderEmail?: string;
```

- [ ] **Step 2: Add EMAIL_ACCOUNT to COL constants in `lib/integrations/sheets.ts`**

Find the COL constant block and add:
```typescript
  EMAIL_ACCOUNT: 19,
```

So the full COL object becomes:
```typescript
const COL = {
  NAME: 0,
  DR: 1,
  MAJOR_NICHE: 7,
  EMAIL_1: 10,
  NAME_1: 11,
  STATUS: 17,
  EMAIL_ACCOUNT: 19,
  LINK_TERM: 30,
  DATE_CONFIRMED: 31,
  NOTES: 32,
  CONTENT_GUIDELINES: 33,
  STANDARD_COST: 34,
} as const
```

- [ ] **Step 3: Map col 19 → senderEmail when reading in `fetchContactsFromSheet`**

Find the return object inside the `.map()` call and add after `contentGuideline`:
```typescript
          senderEmail: str(COL.EMAIL_ACCOUNT) || undefined,
```

- [ ] **Step 4: Map senderEmail → col 19 when writing in `updateContactInSheet`**

Find the `colUpdates` section and add:
```typescript
    if (updates.senderEmail !== undefined)      colUpdates[COL.EMAIL_ACCOUNT] = updates.senderEmail
```

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/types.ts lib/integrations/sheets.ts
git commit -m "feat: add senderEmail field to Contact type and sheet column 19 mapping"
```

---

## Task 10: Wire sendOutreach into the send-outreach API route

**Files:**
- Modify: `pages/api/paul/send-outreach.ts`

- [ ] **Step 1: Replace the current route content**

The current route only generates email text via Claude but never actually sends. Replace it entirely:

```typescript
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '@/lib/prisma'
import { generateOutreachEmail } from '@/lib/claude'
import { sendOutreach } from '@/lib/senders/send'
import type { Contact } from '@/components/dashboard/types'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const contacts = await prisma.prospect.findMany({
      where: { status: 'OUTREACH_SENT' },
      take: 5,
    })

    if (contacts.length === 0) {
      return res.status(200).json({ success: true, message: 'No contacts to send outreach to', sent: 0 })
    }

    let sent = 0
    const errors: string[] = []

    for (const prospect of contacts) {
      try {
        const emailBody = await generateOutreachEmail(
          prospect.name,
          prospect.email,
          prospect.websiteCategory || 'their-website.com'
        )

        const subject = `Link placement opportunity — ${prospect.websiteCategory || 'your site'}`

        // Build a minimal Contact shape for sendOutreach
        const contact: Contact = {
          id: String(prospect.id),
          domain: prospect.websiteCategory || prospect.email.split('@')[1] || '',
          website: '',
          niche: prospect.websiteCategory || '',
          contact: prospect.name,
          email: prospect.email,
          status: 'outreach_sent',
          linkType: '',
          notes: '',
        }

        await sendOutreach(contact, subject, emailBody)
        sent++
      } catch (err: any) {
        console.error(`Failed to send to ${prospect.email}:`, err.message)
        errors.push(`${prospect.email}: ${err.message}`)
      }
    }

    return res.status(200).json({
      success: true,
      sent,
      total: contacts.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('send-outreach error:', error)
    if (error.name === 'NoAvailableSenderError') {
      return res.status(503).json({ error: error.message })
    }
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add pages/api/paul/send-outreach.ts
git commit -m "feat: wire sendOutreach into send-outreach API route"
```

---

## Task 11: AddSenderModal component

**Files:**
- Create: `components/dashboard/AddSenderModal.tsx`

- [ ] **Step 1: Create `components/dashboard/AddSenderModal.tsx`**

```typescript
import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import type { SenderPublic } from '@/lib/senders/types'

interface AddSenderModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: any) => Promise<void>
  editing?: SenderPublic | null
}

const TIMEZONES = [
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Australia/Sydney',
]

export function AddSenderModal({ isOpen, onClose, onSave, editing }: AddSenderModalProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [credentialJson, setCredentialJson] = useState('')
  const [dailyLimit, setDailyLimit] = useState(50)
  const [timezone, setTimezone] = useState('Europe/London')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (editing) {
      setName(editing.name)
      setEmail(editing.email)
      setDailyLimit(editing.daily_limit)
      setTimezone(editing.timezone)
      setCredentialJson('') // never pre-fill credentials
    } else {
      setName('')
      setEmail('')
      setCredentialJson('')
      setDailyLimit(50)
      setTimezone('Europe/London')
    }
    setError(null)
  }, [editing, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!editing && !credentialJson.trim()) {
      setError('Service account JSON is required')
      return
    }

    let parsedJson: any = undefined
    if (credentialJson.trim()) {
      try {
        parsedJson = JSON.parse(credentialJson.trim())
      } catch {
        setError('Invalid JSON — paste the full service account key file contents')
        return
      }
    }

    setSaving(true)
    try {
      const payload: any = { name, email, daily_limit: dailyLimit, timezone }
      if (parsedJson) {
        payload.credential_type = 'service_account'
        payload.credential_json = parsedJson
      }
      await onSave(payload)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to save sender')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-sm font-bold text-slate-100 uppercase tracking-widest">
            {editing ? 'Edit Sender' : 'Add Sender'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-mono text-slate-500 mb-1">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Leo Outreach 1"
              className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-500 mb-1">Gmail Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="sender@yourdomain.com"
              className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-slate-500 mb-1">Daily Limit</label>
              <input
                type="number"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(Number(e.target.value))}
                min={1}
                max={500}
                required
                className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-500 mb-1">Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-500 mb-1">
              Service Account JSON {editing && <span className="text-slate-600">(leave blank to keep existing)</span>}
            </label>
            <textarea
              value={credentialJson}
              onChange={(e) => setCredentialJson(e.target.value)}
              rows={6}
              placeholder='Paste your Google service account key JSON here...'
              className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-xs text-slate-100 font-mono placeholder-slate-500 resize-none"
            />
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-500 disabled:opacity-50 transition-colors text-sm"
            >
              {saving ? 'Saving…' : editing ? 'Update Sender' : 'Add Sender'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 text-slate-100 font-bold rounded-lg hover:bg-slate-600 transition-colors text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/AddSenderModal.tsx
git commit -m "feat: add AddSenderModal component"
```

---

## Task 12: SenderTable component

**Files:**
- Create: `components/dashboard/SenderTable.tsx`

- [ ] **Step 1: Create `components/dashboard/SenderTable.tsx`**

```typescript
import { Pencil, Trash2, ToggleLeft, ToggleRight, AlertCircle } from 'lucide-react'
import type { SenderWithStats } from '@/lib/senders/types'

interface SenderTableProps {
  senders: SenderWithStats[]
  onEdit: (sender: SenderWithStats) => void
  onDelete: (id: string) => void
  onToggleStatus: (id: string, currentStatus: string) => void
}

function StatusBadge({ sender }: { sender: SenderWithStats }) {
  const colors = {
    active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    inactive: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    error: 'bg-red-500/10 text-red-400 border-red-500/20',
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono border ${colors[sender.status]}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${sender.status === 'active' ? 'bg-emerald-400 animate-pulse' : sender.status === 'error' ? 'bg-red-400' : 'bg-slate-400'}`} />
        {sender.status}
      </span>
      {sender.status === 'error' && sender.last_error && (
        <span title={sender.last_error} className="cursor-help text-red-400">
          <AlertCircle size={13} />
        </span>
      )}
    </div>
  )
}

export function SenderTable({ senders, onEdit, onDelete, onToggleStatus }: SenderTableProps) {
  if (senders.length === 0) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-10 text-center text-slate-400 text-sm">
        No senders configured. Add your first sender to start rotating outreach.
      </div>
    )
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-x-auto">
      <table className="w-full min-w-max">
        <thead>
          <tr className="bg-slate-900/50 border-b border-slate-700">
            {['Name', 'Email', 'Type', 'Daily Limit', 'Sent Today', 'Status', 'Actions'].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700">
          {senders.map((sender) => (
            <tr key={sender.id} className="hover:bg-slate-800/50 transition-colors">
              <td className="px-4 py-3 text-sm font-semibold text-slate-100">{sender.name}</td>
              <td className="px-4 py-3 text-sm font-mono text-slate-300">{sender.email}</td>
              <td className="px-4 py-3 text-sm text-slate-400">
                <span className="px-2 py-0.5 bg-slate-700 rounded text-xs font-mono">
                  {sender.credential_type === 'service_account' ? 'Service Account' : 'OAuth'}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-slate-300">{sender.daily_limit}</td>
              <td className="px-4 py-3 text-sm">
                <span className={`font-mono font-bold ${sender.sent_today >= sender.daily_limit ? 'text-red-400' : 'text-emerald-400'}`}>
                  {sender.sent_today}
                </span>
                <span className="text-slate-500 text-xs"> / {sender.daily_limit}</span>
              </td>
              <td className="px-4 py-3">
                <StatusBadge sender={sender} />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onToggleStatus(sender.id, sender.status)}
                    title={sender.status === 'active' ? 'Deactivate' : 'Activate'}
                    className="text-slate-400 hover:text-slate-100 transition-colors"
                  >
                    {sender.status === 'active'
                      ? <ToggleRight size={18} className="text-emerald-400" />
                      : <ToggleLeft size={18} />
                    }
                  </button>
                  <button
                    onClick={() => onEdit(sender)}
                    title="Edit"
                    className="text-slate-400 hover:text-blue-400 transition-colors"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete sender "${sender.name}"? This also deletes all logs for this sender.`)) {
                        onDelete(sender.id)
                      }
                    }}
                    title="Delete"
                    className="text-slate-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/SenderTable.tsx
git commit -m "feat: add SenderTable component with status toggle and actions"
```

---

## Task 13: Senders dashboard page

**Files:**
- Create: `pages/dashboard/senders.tsx`

- [ ] **Step 1: Create `pages/dashboard/senders.tsx`**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { SenderTable } from '@/components/dashboard/SenderTable'
import { AddSenderModal } from '@/components/dashboard/AddSenderModal'
import type { SenderWithStats, SenderPublic } from '@/lib/senders/types'

export default function SendersPage() {
  const [senders, setSenders] = useState<SenderWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<SenderPublic | null>(null)

  const loadSenders = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/senders/stats')
      const data = await res.json()
      setSenders(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to load senders:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSenders() }, [])

  const handleSave = async (payload: any) => {
    if (editing) {
      const res = await fetch(`/api/senders/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update sender')
      }
    } else {
      const res = await fetch('/api/senders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create sender')
      }
    }
    await loadSenders()
    setEditing(null)
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/senders/${id}`, { method: 'DELETE' })
    await loadSenders()
  }

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const next = currentStatus === 'active' ? 'inactive' : 'active'
    await fetch(`/api/senders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    await loadSenders()
  }

  const activeSenders = senders.filter((s) => s.status === 'active')
  const totalSentToday = senders.reduce((sum, s) => sum + s.sent_today, 0)
  const totalLimit = senders.reduce((sum, s) => sum + s.daily_limit, 0)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <a href="/dashboard" className="text-xs font-mono text-slate-500 hover:text-slate-300 transition-colors mb-2 block">
              ← Back to Dashboard
            </a>
            <h1 className="text-2xl font-black text-slate-100 tracking-tight">
              Sender <span className="text-emerald-400">Accounts</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Manage Gmail sender accounts for outreach rotation
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadSenders}
              disabled={loading}
              className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => { setEditing(null); setModalOpen(true) }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-500 transition-colors text-sm"
            >
              <Plus size={16} />
              Add Sender
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Active Senders', value: activeSenders.length },
            { label: 'Sent Today (all)', value: totalSentToday },
            { label: 'Daily Capacity', value: totalLimit },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-4">
              <div className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-1">{label}</div>
              <div className="text-2xl font-black text-slate-100">{value}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <SenderTable
          senders={senders}
          onEdit={(sender) => { setEditing(sender as SenderPublic); setModalOpen(true) }}
          onDelete={handleDelete}
          onToggleStatus={handleToggleStatus}
        />

        {/* Recent logs section */}
        {senders.some((s) => s.recent_logs.length > 0) && (
          <div className="mt-8">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest mb-4">Recent Send Logs</h2>
            <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-900/50 border-b border-slate-700">
                    {['Sender', 'To', 'Subject', 'Status', 'Time'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {senders.flatMap((s) =>
                    s.recent_logs.map((log, i) => (
                      <tr key={`${s.sender_id}-${i}`} className="hover:bg-slate-800/50">
                        <td className="px-4 py-2 text-xs font-mono text-slate-400">{s.email}</td>
                        <td className="px-4 py-2 text-xs text-slate-300">{log.contact_email || '—'}</td>
                        <td className="px-4 py-2 text-xs text-slate-300 max-w-xs truncate">{log.subject || '—'}</td>
                        <td className="px-4 py-2">
                          <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${log.status === 'sent' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-500">
                          {new Date(log.sent_at).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <AddSenderModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSave}
        editing={editing}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add pages/dashboard/senders.tsx
git commit -m "feat: add senders management dashboard page"
```

---

## Task 14: Add Senders link to Sidebar

**Files:**
- Modify: `components/dashboard/Sidebar.tsx`

- [ ] **Step 1: Add Users icon import**

Find the existing imports from `lucide-react` and add `Users`:

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
} from 'lucide-react';
```

- [ ] **Step 2: Replace the toolsItems array to include Senders with an href**

Find the `toolsItems` array and replace it:

```typescript
  const toolsItems = [
    { label: 'Senders', href: '/dashboard/senders', icon: Users },
    { label: 'Link Tracker', href: '#', icon: Link },
    { label: 'Inbox Monitor', href: '#', icon: Inbox },
    { label: 'Outreach Templates', href: '#', icon: FileText },
  ];
```

- [ ] **Step 3: Update the tools nav render to use item.href**

Find the tools section `<a>` tags and change `href="#"` to `href={item.href}`:

```tsx
            {toolsItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
              >
                <item.icon size={16} className="flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
              </a>
            ))}
```

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/Sidebar.tsx
git commit -m "feat: add Senders link to sidebar Tools section"
```

---

## Task 15: Add Sender column to contact table

**Files:**
- Modify: `components/dashboard/ContactTable.tsx`
- Modify: `components/dashboard/ContactTableRow.tsx`

- [ ] **Step 1: Add Sender column header in `ContactTable.tsx`**

In the `stage !== 'start-outreach' && stage !== 'send-followup'` header block, add after the Link Type `<th>`:

```tsx
                {stage !== 'negotiated' && (
                  <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">Sender</th>
                )}
```

The full updated block becomes:

```tsx
            {stage !== 'start-outreach' && stage !== 'send-followup' && (
              <>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">Website</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">Price</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">TAT</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">Link Type</th>
                {stage === 'negotiated' && (
                  <>
                    <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">Notes</th>
                    <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">Content Guideline</th>
                  </>
                )}
                {stage !== 'negotiated' && (
                  <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">Sender</th>
                )}
              </>
            )}
```

- [ ] **Step 2: Update colSpan for negotiated stage in `ContactTable.tsx`**

The negotiated stage now has 12 columns (Domain, DR, Niche, Email, Website, Contact, Status, Price, TAT, Link Type, Notes, Content Guideline). All other stages that aren't start-outreach or send-followup gain 1 extra column (Sender), so they go from 10 → 11.

Find and update:
```typescript
colSpan={stage === 'start-outreach' ? 4 : stage === 'send-followup' ? 7 : stage === 'negotiated' ? 12 : 11}
```

- [ ] **Step 3: Add Sender cell in `ContactTableRow.tsx`**

In the `stage !== 'start-outreach' && stage !== 'send-followup'` block, after the Link Type `<td>` and after the negotiated extra columns, add:

```tsx
          {stage !== 'negotiated' && (
            <td className="px-4 py-3 text-sm">
              {contact.senderEmail ? (
                <span className="inline-flex px-2 py-0.5 rounded text-xs font-mono bg-slate-700 text-slate-300">
                  {contact.senderEmail}
                </span>
              ) : (
                <span className="text-slate-600">—</span>
              )}
            </td>
          )}
```

The full updated non-start-outreach/non-send-followup block becomes:

```tsx
      {stage !== 'start-outreach' && stage !== 'send-followup' && (
        <>
          <td className="px-4 py-3 text-sm text-slate-300">
            {contact.website ? (
              <a
                href={contact.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
                onClick={(e) => e.stopPropagation()}
              >
                {contact.website}
              </a>
            ) : '—'}
          </td>
          <td className="px-4 py-3 text-sm text-slate-300">{contact.contact || '—'}</td>
          <td className="px-4 py-3 text-sm">
            <span className={`inline-flex px-3 py-1 rounded-full text-xs font-mono ${STATUS_COLORS[contact.status]}`}>
              {STATUS_LABELS[contact.status]}
            </span>
          </td>
          <td className="px-4 py-3 text-sm font-semibold text-slate-100">
            {contact.price ? `€${contact.price}` : '—'}
          </td>
          <td className="px-4 py-3 text-sm text-slate-300">{contact.tat || '—'}</td>
          <td className="px-4 py-3 text-sm text-slate-300">{contact.linkType || '—'}</td>
          {stage === 'negotiated' && (
            <>
              <td className="px-4 py-3 text-sm text-slate-300 max-w-xs">
                <span className="line-clamp-2">{contact.notes || '—'}</span>
              </td>
              <td className="px-4 py-3 text-sm text-slate-300 max-w-xs">
                <span className="line-clamp-2">{contact.contentGuideline || '—'}</span>
              </td>
            </>
          )}
          {stage !== 'negotiated' && (
            <td className="px-4 py-3 text-sm">
              {contact.senderEmail ? (
                <span className="inline-flex px-2 py-0.5 rounded text-xs font-mono bg-slate-700 text-slate-300">
                  {contact.senderEmail}
                </span>
              ) : (
                <span className="text-slate-600">—</span>
              )}
            </td>
          )}
        </>
      )}
```

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/ContactTable.tsx components/dashboard/ContactTableRow.tsx
git commit -m "feat: add Sender column to contact table"
```

---

## Task 16: End-to-end smoke test

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Expected: Server starts on `http://localhost:3001` with no TypeScript errors.

- [ ] **Step 2: Verify senders page loads**

Open `http://localhost:3001/dashboard/senders` in the browser.

Expected: Page renders with "No senders configured" empty state and an "Add Sender" button.

- [ ] **Step 3: Add a test sender via the UI**

Click "Add Sender". Fill in:
- Name: `Test Sender`
- Email: your Gmail address
- Paste your service account JSON from `google-creds.json`
- Daily Limit: `50`
- Timezone: your local timezone

Click "Add Sender". Expected: sender appears in the table with status `active`, Sent Today `0 / 50`.

- [ ] **Step 4: Verify the stats API**

```bash
curl http://localhost:3001/api/senders/stats
```

Expected: JSON array with one object containing `sent_today: 0` and `recent_logs: []`.

- [ ] **Step 5: Verify Sender column appears in contact table**

Open `http://localhost:3001/dashboard`. Navigate to "Outreach Sent" stage.

Expected: A "Sender" column appears at the end. All rows show `—` for sender (no outreach dispatched yet).

- [ ] **Step 6: Verify Senders link in sidebar**

Expected: "Senders" item visible in the Tools section of the sidebar. Clicking it navigates to `/dashboard/senders`.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: complete multi-sender outreach system"
```
