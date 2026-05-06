# Contact Lifecycle Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep dashboard nav list counts and Google Sheet status column in sync at every outreach pipeline stage via dual-write (Sheet + Supabase cache) on every status change.

**Architecture:** Every action that changes a contact's stage writes to Google Sheet and the Supabase `sheet_contacts` cache in the same API call. The dashboard reloads from Supabase after each action. `deriveStatus` is updated to trust the stored `status` field for sheet-sourced pipeline stages, so counts reflect what the Sheet says rather than date arithmetic.

**Tech Stack:** Next.js API routes, Supabase (sheet_contacts JSONB cache), Google Sheets API (googleapis), existing `sendOutreachWithSender`, `updateSheetContact`, `updateContactInSheet` helpers.

---

## Files Map

| File | Action | Responsibility |
|---|---|---|
| `lib/utils/deriveStatus.ts` | Modify | Add `outreach_sent`, `send_followup`, `response_received` to MANUAL_STAGES so sheet-sourced statuses are respected |
| `lib/integrations/sheets.ts` | Modify | Add `'response'` to inbound map; change `response_received` outbound value to `'Response'` |
| `lib/mocks/paulResponses.ts` | Modify | Add `FOLLOWUP_TEMPLATES`, `getMockFollowupSubject`, `getMockFollowupBody` |
| `pages/api/paul/send-campaign.ts` | Modify | Fix off-by-one row index bug; add Supabase cache write after each successful send |
| `lib/integrations/supabase.ts` | Modify | Add `getSheetContactByEmail(email)` helper |
| `pages/api/webhooks/gmail.ts` | Modify | After message logged, look up contact by from-email and dual-write `response_received` |
| `pages/api/paul/send-followup.ts` | Create | Follow-up send endpoint targeting `send_followup` contacts |
| `components/dashboard/SendFollowupModal.tsx` | Create | Modal mirroring `SendCampaignModal`, calls `/api/paul/send-followup` |
| `components/dashboard/TopBar.tsx` | Modify | Add Send Follow-up button with count badge |
| `pages/dashboard/index.tsx` | Modify | Add `showSendFollowup` state; pass `followupCount` to TopBar; mount modal |
| `components/dashboard/EditContactModal.tsx` | Modify | Add "Start Negotiation" and "Mark as Negotiated" quick-action buttons to footer |

---

## Task 1: Fix Status Lifecycle — deriveStatus + Sheet Mapping

**Root cause:** `deriveStatus` only respects the stored `status` field for 5 "manual" stages. Contacts loaded from the sheet with status "Sent 1st", "Sent 2nd", or "Response" have `outreachDate: undefined` (the sheet parser never sets it), so `deriveStatus` falls back to `start_outreach` for all of them — making sidebar counts wrong.

**Fix:** Add `outreach_sent`, `send_followup`, and `response_received` to `MANUAL_STAGES` so the stored status from the sheet is respected directly. Also fix the sheet inbound/outbound map for `response_received`.

**Files:**
- Modify: `lib/utils/deriveStatus.ts`
- Modify: `lib/integrations/sheets.ts`

- [ ] **Step 1: Expand MANUAL_STAGES in deriveStatus.ts**

In `lib/utils/deriveStatus.ts`, replace:

```typescript
const MANUAL_STAGES: PipelineStatus[] = [
  'under_negotiation',
  'negotiated',
  'approved',
  'payment_sent',
  'live',
]
```

with:

```typescript
const MANUAL_STAGES: PipelineStatus[] = [
  'outreach_sent',
  'send_followup',
  'response_received',
  'under_negotiation',
  'negotiated',
  'approved',
  'payment_sent',
  'live',
]
```

The full updated file should be:

```typescript
import type { Contact, PipelineStatus } from '@/components/dashboard/types'

const MANUAL_STAGES: PipelineStatus[] = [
  'outreach_sent',
  'send_followup',
  'response_received',
  'under_negotiation',
  'negotiated',
  'approved',
  'payment_sent',
  'live',
]

export function deriveStatus(contact: Contact): PipelineStatus {
  if (MANUAL_STAGES.includes(contact.status)) return contact.status

  if (contact.responseDate) return 'response_received'
  if (!contact.outreachDate) return 'start_outreach'

  const daysSince =
    (Date.now() - new Date(contact.outreachDate).getTime()) / (1000 * 60 * 60 * 24)

  return daysSince >= 2 ? 'send_followup' : 'outreach_sent'
}

export const MANUAL_PIPELINE_STAGES = MANUAL_STAGES
```

- [ ] **Step 2: Fix sheet status mapping in sheets.ts**

In `lib/integrations/sheets.ts`, inside the `mapStatus` function body, add `'response': 'response_received'` after the `'responded'` line:

```typescript
const mapStatus = (raw: string): PipelineStatus => {
  const status = raw?.toLowerCase().trim() || ''
  const statusMap: Record<string, PipelineStatus> = {
    'pending': 'start_outreach',
    'info collected': 'start_outreach',
    'qa fail': 'start_outreach',
    'qa failed': 'start_outreach',
    'sent 1st': 'outreach_sent',
    'sent 2nd': 'send_followup',
    'follow_up': 'send_followup',
    'follow up': 'send_followup',
    'response': 'response_received',
    'confirmed': 'response_received',
    'responded': 'response_received',
    'negotiation': 'under_negotiation',
    'under negotiation': 'under_negotiation',
    'negotiated': 'negotiated',
    'approved': 'approved',
    'no_deal': 'start_outreach',
    'no deal': 'start_outreach',
    'payment sent': 'payment_sent',
    'live': 'live',
  }
  return statusMap[status] || 'start_outreach'
}
```

Also in `lib/integrations/sheets.ts`, in the `STATUS_TO_SHEET` object, change `response_received` from `'Confirmed'` to `'Response'`:

```typescript
const STATUS_TO_SHEET: Record<string, string> = {
  start_outreach:    'Pending',
  outreach_sent:     'Sent 1st',
  send_followup:     'Sent 2nd',
  response_received: 'Response',
  under_negotiation: 'Negotiation',
  negotiated:        'Negotiated',
  approved:          'Approved',
  payment_sent:      'Payment Sent',
  live:              'Live',
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/utils/deriveStatus.ts lib/integrations/sheets.ts
git commit -m "fix: respect sheet-sourced statuses in deriveStatus; map response_received to 'Response' in sheet"
```

---

## Task 2: Add Follow-up Email Templates

**Files:**
- Modify: `lib/mocks/paulResponses.ts`

- [ ] **Step 1: Add follow-up templates and export functions**

At the end of `lib/mocks/paulResponses.ts`, append:

```typescript
export const FOLLOWUP_TEMPLATES = {
  subject: [
    'Following up — link partnership for {domain}',
    'Quick follow-up: {niche} collaboration',
    'Still interested? — {domain} partnership',
    'Just checking in re: our {niche} proposal',
  ],
  body: [
    `Hi {publisherName},

I wanted to follow up on my previous email about a link partnership for {domain}.

We'd love to collaborate if you're open to it — even a quick yes or no would be appreciated.

Best regards`,

    `Hello {publisherName},

Following up on my earlier outreach regarding a potential {niche} partnership with {domain}.

Is this something you'd be interested in exploring?

Best regards`,
  ],
};

export function getMockFollowupSubject(domain: string, niche: string, publisherName?: string): string {
  const template = FOLLOWUP_TEMPLATES.subject[Math.floor(Math.random() * FOLLOWUP_TEMPLATES.subject.length)];
  return template
    .replace(/\{domain\}/g, domain)
    .replace(/\{niche\}/g, niche)
    .replace(/\{publisherName\}/g, publisherName || 'there');
}

export function getMockFollowupBody(domain: string, niche: string, publisherName?: string): string {
  const template = FOLLOWUP_TEMPLATES.body[Math.floor(Math.random() * FOLLOWUP_TEMPLATES.body.length)];
  return template
    .replace(/\{domain\}/g, domain)
    .replace(/\{niche\}/g, niche)
    .replace(/\{publisherName\}/g, publisherName || 'there');
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/mocks/paulResponses.ts
git commit -m "feat: add follow-up email templates"
```

---

## Task 3: Fix send-campaign.ts — Dual-Write After Send

**Problem 1:** `send-campaign.ts` uses `rowIndex = parseInt(contact.id, 10) - 1` for the Sheet write. Since `contact.id` equals the 1-based sheet row number (e.g., `"2"` for the first data row), subtracting 1 targets row 1 (the header). The `save-contact.ts` endpoint correctly uses `parseInt(id)` without the subtraction — match that pattern.

**Problem 2:** After a successful send, only the Sheet is updated. The Supabase `sheet_contacts` cache is not updated, so dashboard counts stay stale until manual sync.

**Files:**
- Modify: `pages/api/paul/send-campaign.ts`

- [ ] **Step 1: Update imports to include updateSheetContact**

In `pages/api/paul/send-campaign.ts`, find:

```typescript
import { getSupabaseClient } from '@/lib/integrations/supabase'
```

Replace with:

```typescript
import { getSupabaseClient, updateSheetContact } from '@/lib/integrations/supabase'
```

- [ ] **Step 2: Fix rowIndex and add Supabase cache write**

In `pages/api/paul/send-campaign.ts`, inside the inner `for (const contact of batch)` loop, find:

```typescript
          const rowIndex = parseInt(contact.id, 10) - 1
          await updateContactInSheet(sheetId, rowIndex, { status: 'outreach_sent' }, sheetTab)
```

Replace with:

```typescript
          const supabaseRowIndex = parseInt(contact.id, 10)
          await updateContactInSheet(sheetId, supabaseRowIndex, { status: 'outreach_sent' }, sheetTab)
          updateSheetContact(supabaseRowIndex, { ...contact, status: 'outreach_sent' })
            .catch(err => console.error('Supabase cache update failed for', contact.domain, err.message))
```

The `updateSheetContact` call is intentionally not awaited — the Sheet write is the critical path, the cache write is best-effort.

- [ ] **Step 3: Commit**

```bash
git add pages/api/paul/send-campaign.ts
git commit -m "fix: dual-write supabase cache after campaign send; fix off-by-one sheet row index"
```

---

## Task 4: Add getSheetContactByEmail Helper

The Gmail webhook needs to look up a contact by email address and get both the contact data and its `row_index` to perform the dual-write. The existing helpers don't support this lookup.

**Files:**
- Modify: `lib/integrations/supabase.ts`

- [ ] **Step 1: Add the helper at the end of supabase.ts**

Append to `lib/integrations/supabase.ts`:

```typescript
export async function getSheetContactByEmail(
  email: string
): Promise<{ rowIndex: number; contact: SheetContact } | null> {
  if (!email) return null
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('sheet_contacts')
    .select('row_index, data')
    .eq('data->>email', email)
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('getSheetContactByEmail error:', error.message)
    return null
  }
  if (!data) return null
  return { rowIndex: (data as any).row_index, contact: (data as any).data as SheetContact }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/integrations/supabase.ts
git commit -m "feat: add getSheetContactByEmail helper for webhook contact lookup"
```

---

## Task 5: Wire Gmail Webhook to Update Contact Status

**Current state:** The webhook logs the inbound message to `messages` table but never updates the contact's pipeline status. After this task, a reply will trigger dual-writes setting the contact to `response_received` in both Supabase cache and Google Sheet.

**Files:**
- Modify: `pages/api/webhooks/gmail.ts`

- [ ] **Step 1: Update imports**

In `pages/api/webhooks/gmail.ts`, replace:

```typescript
import { createMessage, getContact } from '@/lib/integrations/supabase'
```

with:

```typescript
import { createMessage, getContact, getSheetContactByEmail, updateSheetContact } from '@/lib/integrations/supabase'
import { updateContactInSheet } from '@/lib/integrations/sheets'
```

- [ ] **Step 2: Add dual-write after the existing createMessage block**

In `pages/api/webhooks/gmail.ts`, find:

```typescript
    if (contact) {
      await createMessage({
        contact_id: contact.id,
        direction: 'inbound',
        from_email: emailMessage.from,
        to_email: emailMessage.to,
        subject: emailMessage.subject,
        body: emailMessage.body,
        gmail_message_id: emailMessage.id,
        sent_at: new Date().toISOString(),
      })
    }

    return res.status(200).json({
```

Replace with:

```typescript
    if (contact) {
      await createMessage({
        contact_id: contact.id,
        direction: 'inbound',
        from_email: emailMessage.from,
        to_email: emailMessage.to,
        subject: emailMessage.subject,
        body: emailMessage.body,
        gmail_message_id: emailMessage.id,
        sent_at: new Date().toISOString(),
      })
    }

    const sheetRecord = await getSheetContactByEmail(senderEmail)
    if (sheetRecord) {
      const { rowIndex, contact: sheetContact } = sheetRecord
      const updated = { ...sheetContact, status: 'response_received' as const }
      const sheetId = process.env.GOOGLE_SHEET_ID
      const sheetTab = process.env.GOOGLE_SHEET_TAB || 'Sheet1'
      await Promise.all([
        updateSheetContact(rowIndex, updated),
        sheetId
          ? updateContactInSheet(sheetId, rowIndex, { status: 'response_received' }, sheetTab)
          : Promise.resolve(),
      ])
    }

    return res.status(200).json({
```

- [ ] **Step 3: Commit**

```bash
git add pages/api/webhooks/gmail.ts
git commit -m "feat: webhook dual-writes response_received status on reply"
```

---

## Task 6: Create send-followup API Endpoint

Mirrors `send-campaign.ts` but targets `send_followup` contacts and uses follow-up templates. Status stays `send_followup` after sending (contact is still awaiting a response — the follow-up was just sent).

**Files:**
- Create: `pages/api/paul/send-followup.ts`

- [ ] **Step 1: Create the file with the following content**

```typescript
import type { NextApiRequest, NextApiResponse } from 'next'
import { fetchContactsFromSheet, updateContactInSheet } from '@/lib/integrations/sheets'
import { getMockFollowupSubject, getMockFollowupBody } from '@/lib/mocks/paulResponses'
import { sendOutreachWithSender } from '@/lib/senders/send'
import { requireApiKey } from '@/lib/api-auth'
import { getSupabaseClient, updateSheetContact } from '@/lib/integrations/supabase'
import { decryptCredential } from '@/lib/crypto'
import { getLocalDate } from '@/lib/senders/rotate'
import type { Sender } from '@/lib/senders/types'
import type { SenderWithCount } from '@/lib/senders/rotate'

interface SenderResult {
  sender: string
  sent: number
  errors: string[]
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!requireApiKey(req, res)) return

  const { senderIds, emailsPerSender } = req.body

  if (
    !senderIds ||
    (senderIds !== 'all' && !Array.isArray(senderIds)) ||
    !emailsPerSender ||
    typeof emailsPerSender !== 'number' ||
    emailsPerSender < 1
  ) {
    return res.status(400).json({
      error: 'senderIds must be "all" or an array of IDs, and emailsPerSender must be a positive number',
    })
  }

  const sheetId = process.env.GOOGLE_SHEET_ID
  const sheetTab = process.env.GOOGLE_SHEET_TAB || 'Sheet1'

  if (!sheetId) {
    return res.status(500).json({ error: 'GOOGLE_SHEET_ID not configured' })
  }

  try {
    const allContacts = await fetchContactsFromSheet(sheetId, sheetTab)
    const contacts = allContacts.filter((c) => c.status === 'send_followup' && c.email)

    if (contacts.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No contacts ready for follow-up',
        sent: 0,
        total: 0,
        results: [],
      })
    }

    const supabase = getSupabaseClient()
    let sendersQuery = supabase.from('senders').select('*').eq('status', 'active')
    if (senderIds !== 'all') {
      sendersQuery = (sendersQuery as any).in('id', senderIds)
    }
    const { data: rawSenders, error: senderError } = await sendersQuery
    if (senderError) return res.status(500).json({ error: (senderError as any).message })
    if (!rawSenders || (rawSenders as any[]).length === 0) {
      return res.status(400).json({ error: 'No active senders found' })
    }

    const senders: SenderWithCount[] = await Promise.all(
      (rawSenders as Sender[]).map(async (s) => {
        const today = getLocalDate(s.timezone)
        const { data: stat } = await supabase
          .from('sender_daily_stats')
          .select('sent_count')
          .eq('sender_id', s.id)
          .eq('date', today)
          .maybeSingle()
        return {
          ...s,
          credential_json: decryptCredential(s.credential_json),
          sent_today: (stat as any)?.sent_count ?? 0,
        }
      })
    )

    let totalSent = 0
    let totalAttempted = 0
    const results: SenderResult[] = []

    for (let i = 0; i < senders.length; i++) {
      const sender = senders[i]
      const remaining = Math.max(0, sender.daily_limit - sender.sent_today)
      const limit = Math.min(emailsPerSender, remaining)
      const batch = contacts.slice(i * emailsPerSender, i * emailsPerSender + limit)
      const senderResult: SenderResult = { sender: sender.email, sent: 0, errors: [] }

      for (const contact of batch) {
        totalAttempted++
        try {
          const subject = getMockFollowupSubject(contact.domain, contact.niche, contact.contact)
          const body = getMockFollowupBody(contact.domain, contact.niche, contact.contact)

          await sendOutreachWithSender(sender, contact, subject, body)

          const supabaseRowIndex = parseInt(contact.id, 10)
          await updateContactInSheet(sheetId, supabaseRowIndex, { status: 'send_followup' }, sheetTab)
          updateSheetContact(supabaseRowIndex, { ...contact, status: 'send_followup' })
            .catch(err => console.error('Supabase cache update failed for', contact.domain, err.message))

          senderResult.sent++
          totalSent++
        } catch (err: any) {
          senderResult.errors.push(`${contact.email}: ${err.message}`)
        }
      }

      results.push(senderResult)
    }

    return res.status(200).json({
      success: true,
      sent: totalSent,
      total: totalAttempted,
      results,
    })
  } catch (error: any) {
    console.error('send-followup error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add pages/api/paul/send-followup.ts
git commit -m "feat: add send-followup API endpoint"
```

---

## Task 7: Create SendFollowupModal Component

Mirrors `SendCampaignModal` exactly — same sender picker, same emails-per-sender input — but calls `/api/paul/send-followup` and uses amber color scheme to visually distinguish it from the initial campaign.

**Files:**
- Create: `components/dashboard/SendFollowupModal.tsx`

- [ ] **Step 1: Create the file with the following content**

```typescript
import { useState, useEffect } from 'react'
import { X, Reply, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import type { SenderWithStats } from '@/lib/senders/types'

interface FollowupResult {
  sender: string
  sent: number
  errors: string[]
}

interface FollowupResponse {
  sent: number
  total: number
  results: FollowupResult[]
}

interface SendFollowupModalProps {
  followupCount: number
  onClose: () => void
  onRefresh: () => void
}

type ModalState = 'idle' | 'sending' | 'done'

const API_HEADERS = { 'x-api-key': process.env.NEXT_PUBLIC_API_SECRET_KEY || '' }

export function SendFollowupModal({ followupCount, onClose, onRefresh }: SendFollowupModalProps) {
  const [modalState, setModalState] = useState<ModalState>('idle')
  const [useAllSenders, setUseAllSenders] = useState(true)
  const [senders, setSenders] = useState<SenderWithStats[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [emailsPerSender, setEmailsPerSender] = useState(10)
  const [results, setResults] = useState<FollowupResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalState !== 'sending') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [modalState, onClose])

  useEffect(() => {
    fetch('/api/senders/stats', { headers: API_HEADERS })
      .then((r) => r.json())
      .then((data) => {
        const active: SenderWithStats[] = Array.isArray(data)
          ? data.filter((s: SenderWithStats) => s.status === 'active')
          : []
        setSenders(active)
        setSelectedIds(new Set(active.map((s) => s.id)))
      })
      .catch(() => setError('Failed to load senders'))
  }, [])

  const activeSenderCount = useAllSenders ? senders.length : selectedIds.size
  const canSend = activeSenderCount > 0 && emailsPerSender >= 1 && modalState === 'idle'

  const toggleSender = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSend = async () => {
    setModalState('sending')
    setError(null)
    try {
      const senderIds = useAllSenders ? 'all' : Array.from(selectedIds)
      const res = await fetch('/api/paul/send-followup', {
        method: 'POST',
        headers: { ...API_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderIds, emailsPerSender }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || `Error ${res.status}`)
        setModalState('idle')
        return
      }
      setResults(data)
      setModalState('done')
    } catch {
      setError('Network error. Please try again.')
      setModalState('idle')
    }
  }

  const handleCloseAndRefresh = () => {
    onRefresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70"
        onClick={modalState !== 'sending' ? onClose : undefined}
      />
      <div
        className="relative z-10 w-[480px] bg-slate-900 border border-slate-700 rounded-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Send Follow-up</h2>
            <p className="text-xs font-mono text-slate-500 mt-0.5">
              {followupCount} contact{followupCount !== 1 ? 's' : ''} awaiting follow-up
            </p>
          </div>
          {modalState !== 'sending' && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="p-6 flex flex-col gap-5">
          {modalState === 'done' && results ? (
            <>
              <div className="flex items-center gap-3">
                <CheckCircle2 size={20} className="text-emerald-400 flex-shrink-0" />
                <p className="text-slate-100 font-bold">
                  Follow-ups sent — {results.sent} of {results.total} emails delivered
                </p>
              </div>

              <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      {['Sender', 'Sent', 'Errors'].map((h) => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-mono uppercase tracking-widest text-slate-500">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {results.results.map((r) => (
                      <tr key={r.sender}>
                        <td className="px-4 py-2 text-xs font-mono text-slate-300 truncate max-w-[180px]">{r.sender}</td>
                        <td className="px-4 py-2 text-xs text-slate-300">{r.sent}</td>
                        <td className="px-4 py-2 text-xs text-red-400">
                          {r.errors.length > 0 ? r.errors.join('; ') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 transition-colors text-sm font-bold"
                >
                  Close
                </button>
                <button
                  onClick={handleCloseAndRefresh}
                  className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-colors text-sm font-bold"
                >
                  Close & Refresh
                </button>
              </div>
            </>
          ) : (
            <>
              {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  {error}
                </div>
              )}

              <div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={useAllSenders}
                  onClick={() => setUseAllSenders((v) => !v)}
                  disabled={modalState === 'sending'}
                  className="flex items-center gap-3 cursor-pointer disabled:opacity-50"
                >
                  <div
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 ${
                      useAllSenders ? 'bg-emerald-500' : 'bg-slate-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                        useAllSenders ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </div>
                  <span className="text-sm text-slate-300 font-medium">Use all active senders</span>
                </button>
              </div>

              {!useAllSenders && (
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
                  {senders.length === 0 && (
                    <p className="text-xs text-slate-500 py-2">No active senders found.</p>
                  )}
                  {senders.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-slate-800 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s.id)}
                        onChange={() => toggleSender(s.id)}
                        disabled={modalState === 'sending'}
                        className="accent-emerald-500 w-4 h-4 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-200 font-medium truncate">{s.name}</div>
                        <div className="text-xs text-slate-500 font-mono truncate">{s.email}</div>
                      </div>
                      <div className="text-xs text-slate-500 flex-shrink-0 font-mono">
                        {s.sent_today}/{s.daily_limit}
                      </div>
                    </label>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-sm text-slate-400 mb-1.5 font-medium">
                  Emails per sender
                </label>
                <input
                  type="number"
                  min={1}
                  value={emailsPerSender}
                  onChange={(e) => setEmailsPerSender(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={modalState === 'sending'}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                />
              </div>

              <p className="text-xs text-slate-500">
                Will send up to{' '}
                <span className="text-slate-300 font-bold">{activeSenderCount * emailsPerSender}</span> follow-ups across{' '}
                <span className="text-slate-300 font-bold">{activeSenderCount}</span>{' '}
                sender{activeSenderCount !== 1 ? 's' : ''}
              </p>

              <button
                onClick={handleSend}
                disabled={!canSend}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 text-white font-bold rounded-lg hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                {modalState === 'sending' ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Sending follow-ups…
                  </>
                ) : (
                  <>
                    <Reply size={15} />
                    Send Follow-ups
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/SendFollowupModal.tsx
git commit -m "feat: add SendFollowupModal component"
```

---

## Task 8: Update TopBar + Wire Dashboard

**Files:**
- Modify: `components/dashboard/TopBar.tsx`
- Modify: `pages/dashboard/index.tsx`

- [ ] **Step 1: Replace TopBar with updated version**

Replace the entire contents of `components/dashboard/TopBar.tsx` with:

```typescript
import { RefreshCw, Loader2, Send, Reply } from 'lucide-react';

interface TopBarProps {
  onRefresh: () => void;
  isLoading?: boolean;
  onSendCampaign: () => void;
  onSendFollowup: () => void;
  followupCount?: number;
}

export function TopBar({ onRefresh, isLoading = false, onSendCampaign, onSendFollowup, followupCount = 0 }: TopBarProps) {
  return (
    <div className="bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between flex-shrink-0">
      <div className="min-w-0">
        <h1 className="text-xl font-black text-slate-100 tracking-tight">
          Domains
        </h1>
        <p className="text-xs font-mono text-slate-500 mt-1">
          Manage your outreach contacts
        </p>
      </div>

      <div className="flex gap-3 flex-shrink-0">
        {followupCount > 0 && (
          <button
            onClick={onSendFollowup}
            className="relative flex items-center gap-2 px-4 py-2 border border-amber-500/50 text-amber-400 font-bold rounded-lg hover:bg-amber-500/10 transition-colors text-sm"
          >
            <Reply size={15} />
            Send Follow-up
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-amber-500 text-black text-[10px] font-black px-1">
              {followupCount}
            </span>
          </button>
        )}
        <button
          onClick={onSendCampaign}
          className="flex items-center gap-2 px-4 py-2 border border-emerald-500/50 text-emerald-400 font-bold rounded-lg hover:bg-emerald-500/10 transition-colors text-sm"
        >
          <Send size={15} />
          Send Campaign
        </button>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-slate-100 font-bold rounded-lg hover:bg-slate-600 disabled:bg-slate-600 disabled:opacity-60 transition-colors text-sm"
        >
          {isLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          {isLoading ? 'Syncing...' : 'Sync Sheet'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add import in dashboard/index.tsx**

In `pages/dashboard/index.tsx`, add to the import block at the top:

```typescript
import { SendFollowupModal } from '@/components/dashboard/SendFollowupModal';
```

- [ ] **Step 3: Add showSendFollowup state**

In `pages/dashboard/index.tsx`, after the line:

```typescript
  const [showSendCampaign, setShowSendCampaign] = useState(false);
```

Add:

```typescript
  const [showSendFollowup, setShowSendFollowup] = useState(false);
```

- [ ] **Step 4: Update TopBar JSX**

In `pages/dashboard/index.tsx`, replace the `<TopBar>` JSX:

```typescript
        <TopBar
          onRefresh={syncFromSheet}
          isLoading={isSyncing}
          onSendCampaign={() => setShowSendCampaign(true)}
        />
```

with:

```typescript
        <TopBar
          onRefresh={syncFromSheet}
          isLoading={isSyncing}
          onSendCampaign={() => setShowSendCampaign(true)}
          onSendFollowup={() => setShowSendFollowup(true)}
          followupCount={navCounts.sendFollowup}
        />
```

- [ ] **Step 5: Mount SendFollowupModal**

In `pages/dashboard/index.tsx`, after the `{showSendCampaign && (...)}` block, add:

```typescript
      {showSendFollowup && (
        <SendFollowupModal
          followupCount={navCounts.sendFollowup}
          onClose={() => setShowSendFollowup(false)}
          onRefresh={loadFromSupabase}
        />
      )}
```

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/TopBar.tsx pages/dashboard/index.tsx
git commit -m "feat: add Send Follow-up button to TopBar; wire SendFollowupModal in dashboard"
```

---

## Task 9: Add Stage Transition Buttons to EditContactModal

`EditContactModal` is the contact detail modal opened on row click. It already has a "Save Changes" button that calls `onSave` → `handleUpdateContact` → `save-contact.ts` (dual-write). Add two quick-action buttons to its footer:

- **"Start Negotiation"** — shown when `effectiveStatus === 'response_received'`, saves `{ status: 'under_negotiation' }`
- **"Mark as Negotiated"** — shown when `effectiveStatus === 'under_negotiation'`, saves `{ status: 'negotiated' }`

Both reuse the existing `handleSave` pattern and call `onClose` when done.

**Files:**
- Modify: `components/dashboard/EditContactModal.tsx`

- [ ] **Step 1: Replace the Footer section**

In `components/dashboard/EditContactModal.tsx`, find the `{/* Footer */}` section:

```typescript
        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-700 flex-shrink-0">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-500 disabled:opacity-60 transition-colors text-sm"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button onClick={onClose} className="px-4 py-2 bg-slate-700 text-slate-100 font-bold rounded-lg hover:bg-slate-600 transition-colors text-sm">
            Cancel
          </button>
          <button onClick={handleDelete} className="px-4 py-2 bg-red-600/20 text-red-400 font-bold rounded-lg hover:bg-red-600/30 transition-colors text-sm border border-red-500/20 ml-auto">
            Delete
          </button>
        </div>
```

Replace with:

```typescript
        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-700 flex-shrink-0 flex-wrap">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-500 disabled:opacity-60 transition-colors text-sm"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button onClick={onClose} className="px-4 py-2 bg-slate-700 text-slate-100 font-bold rounded-lg hover:bg-slate-600 transition-colors text-sm">
            Cancel
          </button>
          {effectiveStatus === 'response_received' && (
            <button
              disabled={saving}
              onClick={async () => {
                setSaving(true)
                await onSave({ ...edited, status: 'under_negotiation' })
                setSaving(false)
                onClose()
              }}
              className="px-4 py-2 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-500 disabled:opacity-60 transition-colors text-sm"
            >
              Start Negotiation
            </button>
          )}
          {effectiveStatus === 'under_negotiation' && (
            <button
              disabled={saving}
              onClick={async () => {
                setSaving(true)
                await onSave({ ...edited, status: 'negotiated' })
                setSaving(false)
                onClose()
              }}
              className="px-4 py-2 bg-teal-600 text-white font-bold rounded-lg hover:bg-teal-500 disabled:opacity-60 transition-colors text-sm"
            >
              Mark as Negotiated
            </button>
          )}
          <button onClick={handleDelete} className="px-4 py-2 bg-red-600/20 text-red-400 font-bold rounded-lg hover:bg-red-600/30 transition-colors text-sm border border-red-500/20 ml-auto">
            Delete
          </button>
        </div>
```

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/EditContactModal.tsx
git commit -m "feat: add Start Negotiation and Mark as Negotiated buttons to contact modal"
```

---

## Completion Checklist

- [ ] `deriveStatus` respects `outreach_sent`, `send_followup`, `response_received` from stored status
- [ ] Sheet maps "Response" inbound and writes "Response" outbound for `response_received`
- [ ] Campaign send dual-writes Sheet + Supabase; dashboard auto-refreshes after modal closes
- [ ] Gmail webhook dual-writes `response_received` on reply
- [ ] `/api/paul/send-followup` targets `send_followup` contacts, uses follow-up templates, dual-writes
- [ ] "Send Follow-up" button appears in TopBar with count badge when follow-up contacts exist
- [ ] `SendFollowupModal` opens, sends, and refreshes dashboard on close
- [ ] "Start Negotiation" button visible in contact modal for `response_received` contacts
- [ ] "Mark as Negotiated" button visible in contact modal for `under_negotiation` contacts
