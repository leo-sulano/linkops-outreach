# Send Campaign Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Send Campaign" modal that sends outreach emails to unreached contacts with user-controlled sender selection and per-sender email limits.

**Architecture:** New `POST /api/paul/send-campaign` endpoint handles all contact distribution and sending server-side. A new `SendCampaignModal` React component (idle → sending → done states) calls this endpoint. A `sendOutreachWithSender` helper is added to `lib/senders/send.ts` to bypass auto-rotation when a specific sender is provided.

**Tech Stack:** Next.js API routes, TypeScript, React, Supabase, Gmail API (googleapis), Tailwind CSS, Jest + ts-jest

---

## File Map

| File | Action |
|------|--------|
| `lib/senders/send.ts` | Add `sendOutreachWithSender` function |
| `pages/api/paul/send-campaign.ts` | New API endpoint |
| `components/dashboard/SendCampaignModal.tsx` | New modal component |
| `components/dashboard/TopBar.tsx` | Add `onSendCampaign` prop + button |
| `pages/dashboard/index.tsx` | Wire `showSendCampaign` state + modal |
| `pages/dashboard/senders.tsx` | Add button + modal state |
| `tests/unit/senders/send.test.ts` | Unit test for `sendOutreachWithSender` |
| `tests/unit/api/send-campaign.test.ts` | Unit test for API handler validation |

---

## Task 1: Add `sendOutreachWithSender` to `lib/senders/send.ts`

**Files:**
- Modify: `lib/senders/send.ts`
- Create: `tests/unit/senders/send.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/senders/send.test.ts`:

```typescript
import { sendOutreachWithSender } from '../../../lib/senders/send'
import type { Contact } from '../../../components/dashboard/types'
import type { SenderWithCount } from '../../../lib/senders/rotate'

jest.mock('../../../lib/integrations/supabase', () => ({
  getSupabaseClient: jest.fn(),
}))
jest.mock('../../../lib/senders/gmail', () => ({
  buildGmailClient: jest.fn(),
  sendWithClient: jest.fn(),
}))
jest.mock('../../../lib/integrations/sheets', () => ({
  updateContactInSheet: jest.fn(),
}))
jest.mock('../../../lib/senders/rotate', () => ({
  getLocalDate: jest.fn(() => '2026-05-05'),
}))

const { getSupabaseClient } = require('../../../lib/integrations/supabase')
const { buildGmailClient, sendWithClient } = require('../../../lib/senders/gmail')
const { updateContactInSheet } = require('../../../lib/integrations/sheets')

const mockSender: SenderWithCount = {
  id: 'sender-1',
  name: 'Test Sender',
  email: 'sender@example.com',
  credential_type: 'service_account',
  credential_json: { client_email: 'sa@p.iam.gserviceaccount.com', private_key: 'key' } as any,
  daily_limit: 50,
  timezone: 'UTC',
  status: 'active',
  last_error: null,
  last_used_at: null,
  created_at: '2026-01-01',
  sent_today: 5,
}

const mockContact: Contact = {
  id: '2',
  domain: 'example.com',
  website: 'https://example.com',
  niche: 'tech',
  contact: 'John',
  email: 'john@example.com',
  status: 'start_outreach',
  linkType: 'guest_post',
  notes: '',
}

function makeMockSupabase() {
  const builder: any = {}
  builder.insert = jest.fn().mockResolvedValue({ error: null })
  builder.update = jest.fn().mockReturnValue(builder)
  builder.eq = jest.fn().mockResolvedValue({ error: null })
  const client = {
    from: jest.fn().mockReturnValue(builder),
    rpc: jest.fn().mockResolvedValue({ error: null }),
  }
  return { client, builder }
}

describe('sendOutreachWithSender', () => {
  beforeEach(() => {
    process.env.GOOGLE_SHEET_ID = 'sheet-123'
    buildGmailClient.mockReturnValue({})
    sendWithClient.mockResolvedValue('msg-id-123')
    updateContactInSheet.mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('sends email using the provided sender and returns sender_email + message_id', async () => {
    const { client } = makeMockSupabase()
    getSupabaseClient.mockReturnValue(client)

    const result = await sendOutreachWithSender(mockSender, mockContact, 'Subject', 'Body')

    expect(result.sender_email).toBe('sender@example.com')
    expect(result.message_id).toBe('msg-id-123')
    expect(buildGmailClient).toHaveBeenCalledWith(mockSender)
    expect(sendWithClient).toHaveBeenCalledWith(
      {},
      'john@example.com',
      'Subject',
      'Body',
      'sender@example.com'
    )
  })

  it('logs failure and rethrows when send fails', async () => {
    const { client, builder } = makeMockSupabase()
    getSupabaseClient.mockReturnValue(client)
    sendWithClient.mockRejectedValue(new Error('Gmail auth failed'))

    await expect(
      sendOutreachWithSender(mockSender, mockContact, 'Subject', 'Body')
    ).rejects.toThrow('Gmail auth failed')

    expect(builder.insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ status: 'failed', error: 'Gmail auth failed' }),
      ])
    )
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx jest tests/unit/senders/send.test.ts --no-coverage
```

Expected: FAIL — `sendOutreachWithSender is not a function`

- [ ] **Step 3: Implement `sendOutreachWithSender` in `lib/senders/send.ts`**

Append this export to the bottom of the existing file (after the closing brace of `sendOutreach`):

```typescript
export async function sendOutreachWithSender(
  sender: SenderWithCount,
  contact: Contact,
  subject: string,
  body: string
): Promise<{ sender_email: string; message_id: string }> {
  const client = getSupabaseClient()
  let messageId: string

  try {
    const gmail = buildGmailClient(sender)
    messageId = await sendWithClient(gmail, contact.email, subject, body, sender.email)
  } catch (err: any) {
    await client.from('outreach_logs').insert([{
      sender_id: sender.id,
      contact_domain: contact.domain,
      contact_email: contact.email,
      subject,
      status: 'failed',
      error: err.message,
    }])

    const isAuthError = err instanceof SenderAuthError || /unauthenticated|invalid_grant|unauthorized/i.test(err.message ?? '')
    if (isAuthError) {
      await client
        .from('senders')
        .update({ status: 'error', last_error: err.message })
        .eq('id', sender.id)
    }

    throw err
  }

  const today = getLocalDate(sender.timezone)

  await client.rpc('increment_sender_daily_count', {
    p_sender_id: sender.id,
    p_date: today,
  })

  await client
    .from('senders')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', sender.id)

  await client.from('outreach_logs').insert([{
    sender_id: sender.id,
    contact_domain: contact.domain,
    contact_email: contact.email,
    subject,
    status: 'sent',
  }])

  await client
    .from('contacts')
    .update({ email_account: sender.email })
    .eq('domain', contact.domain)

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

Also add this import at the top of `lib/senders/send.ts` (after the existing imports):

```typescript
import type { SenderWithCount } from './rotate'
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npx jest tests/unit/senders/send.test.ts --no-coverage
```

Expected: PASS — 2 tests pass

- [ ] **Step 5: Commit**

```bash
git add lib/senders/send.ts tests/unit/senders/send.test.ts
git commit -m "feat: add sendOutreachWithSender for explicit sender targeting"
```

---

## Task 2: Create `pages/api/paul/send-campaign.ts`

**Files:**
- Create: `pages/api/paul/send-campaign.ts`
- Create: `tests/unit/api/send-campaign.test.ts`

- [ ] **Step 1: Write the failing validation test**

Create `tests/unit/api/send-campaign.test.ts`:

```typescript
import handler from '../../../pages/api/paul/send-campaign'
import type { NextApiRequest, NextApiResponse } from 'next'

jest.mock('../../../lib/integrations/sheets', () => ({
  fetchContactsFromSheet: jest.fn().mockResolvedValue([]),
  updateContactInSheet: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../../../lib/integrations/supabase', () => ({
  getSupabaseClient: jest.fn(),
}))
jest.mock('../../../lib/senders/send', () => ({
  sendOutreachWithSender: jest.fn(),
}))
jest.mock('../../../lib/mocks/paulResponses', () => ({
  getMockSubject: jest.fn(() => 'Subject'),
  getMockBody: jest.fn(() => 'Body'),
}))
jest.mock('../../../lib/crypto', () => ({
  decryptCredential: jest.fn((c) => c),
}))
jest.mock('../../../lib/senders/rotate', () => ({
  getLocalDate: jest.fn(() => '2026-05-05'),
}))
jest.mock('../../../lib/api-auth', () => ({
  requireApiKey: jest.fn(() => true),
}))

function makeReqRes(body: object, method = 'POST') {
  const req = { method, body, headers: {} } as unknown as NextApiRequest
  const json = jest.fn()
  const status = jest.fn().mockReturnValue({ json })
  const res = { status, json } as unknown as NextApiResponse
  return { req, res, json, status }
}

describe('POST /api/paul/send-campaign', () => {
  beforeEach(() => {
    process.env.GOOGLE_SHEET_ID = 'sheet-123'
    jest.clearAllMocks()
  })

  it('returns 405 for non-POST methods', async () => {
    const { req, res, status, json } = makeReqRes({}, 'GET')
    await handler(req, res)
    expect(status).toHaveBeenCalledWith(405)
    expect(json).toHaveBeenCalledWith({ error: 'Method not allowed' })
  })

  it('returns 400 when senderIds is missing', async () => {
    const { req, res, status, json } = makeReqRes({ emailsPerSender: 10 })
    await handler(req, res)
    expect(status).toHaveBeenCalledWith(400)
  })

  it('returns 400 when emailsPerSender is missing', async () => {
    const { req, res, status, json } = makeReqRes({ senderIds: 'all' })
    await handler(req, res)
    expect(status).toHaveBeenCalledWith(400)
  })

  it('returns 400 when emailsPerSender is less than 1', async () => {
    const { req, res, status, json } = makeReqRes({ senderIds: 'all', emailsPerSender: 0 })
    await handler(req, res)
    expect(status).toHaveBeenCalledWith(400)
  })

  it('returns 200 with sent:0 when no start_outreach contacts exist', async () => {
    const { fetchContactsFromSheet } = require('../../../lib/integrations/sheets')
    fetchContactsFromSheet.mockResolvedValue([])

    const { getSupabaseClient } = require('../../../lib/integrations/supabase')
    const builder: any = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockResolvedValue({ data: [], error: null }) }
    getSupabaseClient.mockReturnValue({ from: jest.fn().mockReturnValue(builder) })

    const { req, res, status, json } = makeReqRes({ senderIds: 'all', emailsPerSender: 10 })
    await handler(req, res)
    expect(status).toHaveBeenCalledWith(200)
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ sent: 0 }))
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx jest tests/unit/api/send-campaign.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../../../pages/api/paul/send-campaign'`

- [ ] **Step 3: Create `pages/api/paul/send-campaign.ts`**

```typescript
import type { NextApiRequest, NextApiResponse } from 'next'
import { fetchContactsFromSheet, updateContactInSheet } from '@/lib/integrations/sheets'
import { getMockSubject, getMockBody } from '@/lib/mocks/paulResponses'
import { sendOutreachWithSender } from '@/lib/senders/send'
import { requireApiKey } from '@/lib/api-auth'
import { getSupabaseClient } from '@/lib/integrations/supabase'
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

  if (!senderIds || !emailsPerSender || typeof emailsPerSender !== 'number' || emailsPerSender < 1) {
    return res.status(400).json({ error: 'senderIds and emailsPerSender (positive number) are required' })
  }

  const sheetId = process.env.GOOGLE_SHEET_ID
  const sheetTab = process.env.GOOGLE_SHEET_TAB || 'Sheet1'

  if (!sheetId) {
    return res.status(500).json({ error: 'GOOGLE_SHEET_ID not configured' })
  }

  try {
    const allContacts = await fetchContactsFromSheet(sheetId, sheetTab)
    const contacts = allContacts.filter((c) => c.status === 'start_outreach' && c.email)

    if (contacts.length === 0) {
      return res.status(200).json({ success: true, message: 'No contacts ready for outreach', sent: 0, total: 0, results: [] })
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
      const batch = contacts.slice(i * emailsPerSender, (i + 1) * emailsPerSender)
      const senderResult: SenderResult = { sender: sender.email, sent: 0, errors: [] }

      for (const contact of batch) {
        totalAttempted++
        try {
          const subject = getMockSubject('standard', contact.domain, contact.niche, contact.contact)
          const body = getMockBody('standard', contact.domain, contact.niche, contact.contact)

          await sendOutreachWithSender(sender, contact, subject, body)

          const rowIndex = parseInt(contact.id, 10) - 1
          await updateContactInSheet(sheetId, rowIndex, { status: 'outreach_sent' }, sheetTab)

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
    console.error('send-campaign error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npx jest tests/unit/api/send-campaign.test.ts --no-coverage
```

Expected: PASS — 5 tests pass

- [ ] **Step 5: Run all tests to check for regressions**

```bash
npx jest --no-coverage
```

Expected: all existing tests still pass

- [ ] **Step 6: Commit**

```bash
git add pages/api/paul/send-campaign.ts tests/unit/api/send-campaign.test.ts
git commit -m "feat: add send-campaign API endpoint with sender selection and per-sender limits"
```

---

## Task 3: Create `SendCampaignModal` component

**Files:**
- Create: `components/dashboard/SendCampaignModal.tsx`

- [ ] **Step 1: Create the component**

Create `components/dashboard/SendCampaignModal.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { X, Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import type { SenderWithStats } from '@/lib/senders/types'

interface CampaignResult {
  sender: string
  sent: number
  errors: string[]
}

interface CampaignResponse {
  sent: number
  total: number
  results: CampaignResult[]
}

interface SendCampaignModalProps {
  onClose: () => void
  onRefresh: () => void
}

type ModalState = 'idle' | 'sending' | 'done'

const API_HEADERS = { 'x-api-key': process.env.NEXT_PUBLIC_API_SECRET_KEY || '' }

export function SendCampaignModal({ onClose, onRefresh }: SendCampaignModalProps) {
  const [modalState, setModalState] = useState<ModalState>('idle')
  const [useAllSenders, setUseAllSenders] = useState(true)
  const [senders, setSenders] = useState<SenderWithStats[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [emailsPerSender, setEmailsPerSender] = useState(10)
  const [results, setResults] = useState<CampaignResponse | null>(null)
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
      const res = await fetch('/api/paul/send-campaign', {
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
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-bold text-slate-100">Send Campaign</h2>
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
                  Campaign sent — {results.sent} of {results.total} emails delivered
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

              {/* Sender toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setUseAllSenders((v) => !v)}
                  disabled={modalState === 'sending'}
                  className="flex items-center gap-3 cursor-pointer disabled:opacity-50"
                >
                  <div
                    className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${
                      useAllSenders ? 'bg-emerald-500' : 'bg-slate-600'
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        useAllSenders ? 'translate-x-5' : 'translate-x-1'
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

              {/* Emails per sender */}
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

              {/* Summary line */}
              <p className="text-xs text-slate-500">
                Will send up to{' '}
                <span className="text-slate-300 font-bold">{activeSenderCount * emailsPerSender}</span> emails across{' '}
                <span className="text-slate-300 font-bold">{activeSenderCount}</span>{' '}
                sender{activeSenderCount !== 1 ? 's' : ''}
              </p>

              {/* Send button */}
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                {modalState === 'sending' ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Sending campaign…
                  </>
                ) : (
                  <>
                    <Send size={15} />
                    Send Campaign
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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors related to the new file

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/SendCampaignModal.tsx
git commit -m "feat: add SendCampaignModal component with idle/sending/done states"
```

---

## Task 4: Update `TopBar` with "Send Campaign" button

**Files:**
- Modify: `components/dashboard/TopBar.tsx`

- [ ] **Step 1: Update the component**

Replace the entire contents of `components/dashboard/TopBar.tsx` with:

```tsx
import { RefreshCw, Loader2, Send } from 'lucide-react';

interface TopBarProps {
  onRefresh: () => void;
  isLoading?: boolean;
  onSendCampaign: () => void;
}

export function TopBar({ onRefresh, isLoading = false, onSendCampaign }: TopBarProps) {
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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: error on `pages/dashboard/index.tsx` — `onSendCampaign` prop missing (this is intentional; we fix it in Task 5)

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/TopBar.tsx
git commit -m "feat: add Send Campaign button to TopBar"
```

---

## Task 5: Wire `SendCampaignModal` into the dashboard

**Files:**
- Modify: `pages/dashboard/index.tsx`

- [ ] **Step 1: Update the dashboard page**

In `pages/dashboard/index.tsx`, make these three changes:

**1. Add the import** (after the `AllContactsModal` import on line 11):
```tsx
import { SendCampaignModal } from '@/components/dashboard/SendCampaignModal';
```

**2. Add the state** (after the `showAllContacts` state on line 49):
```tsx
const [showSendCampaign, setShowSendCampaign] = useState(false);
```

**3. Pass `onSendCampaign` to `TopBar`** — replace the existing `<TopBar .../>` (lines 172–175) with:
```tsx
<TopBar
  onRefresh={syncFromSheet}
  isLoading={isSyncing}
  onSendCampaign={() => setShowSendCampaign(true)}
/>
```

**4. Add the modal** — after the closing `}` of the `AllContactsModal` block (after line 228), add:
```tsx
{showSendCampaign && (
  <SendCampaignModal
    onClose={() => setShowSendCampaign(false)}
    onRefresh={loadFromSupabase}
  />
)}
```

- [ ] **Step 2: Verify TypeScript compiles with no errors**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add pages/dashboard/index.tsx
git commit -m "feat: wire SendCampaignModal into dashboard with refresh on close"
```

---

## Task 6: Wire `SendCampaignModal` into the Senders page

**Files:**
- Modify: `pages/dashboard/senders.tsx`

- [ ] **Step 1: Add import and state**

In `pages/dashboard/senders.tsx`:

**1. Add the import** at the top with the other imports (after line 8, `import type { SenderWithStats, SenderPublic } from '@/lib/senders/types'`):
```tsx
import { SendCampaignModal } from '@/components/dashboard/SendCampaignModal'
import { Send } from 'lucide-react'
```

Note: `lucide-react` is already imported on line 5 (`import { Plus, RefreshCw } from 'lucide-react'`). Add `Send` to the existing import instead of adding a second one:

Replace line 5:
```tsx
import { Plus, RefreshCw, Send } from 'lucide-react'
```

And add only:
```tsx
import { SendCampaignModal } from '@/components/dashboard/SendCampaignModal'
```

**2. Add state** (after the `editing` state on line 14):
```tsx
const [showSendCampaign, setShowSendCampaign] = useState(false)
```

- [ ] **Step 2: Add the button to the header**

In `pages/dashboard/senders.tsx`, find the `<div className="flex items-center gap-3">` block in the header (around line 92). Add the "Send Campaign" button before the existing "Add Sender" button:

Replace:
```tsx
<div className="flex items-center gap-3">
  <button
    onClick={loadSenders}
```

With:
```tsx
<div className="flex items-center gap-3">
  <button
    onClick={() => setShowSendCampaign(true)}
    className="flex items-center gap-2 px-4 py-2 border border-emerald-500/50 text-emerald-400 font-bold rounded-lg hover:bg-emerald-500/10 transition-colors text-sm"
  >
    <Send size={16} />
    Send Campaign
  </button>
  <button
    onClick={loadSenders}
```

- [ ] **Step 3: Add the modal**

In `pages/dashboard/senders.tsx`, find the `<AddSenderModal .../>` block near the bottom (around line 170). Add the `SendCampaignModal` right after it:

```tsx
{showSendCampaign && (
  <SendCampaignModal
    onClose={() => setShowSendCampaign(false)}
    onRefresh={loadSenders}
  />
)}
```

- [ ] **Step 4: Verify TypeScript compiles with no errors**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Run all tests**

```bash
npx jest --no-coverage
```

Expected: all tests pass

- [ ] **Step 6: Final commit**

```bash
git add pages/dashboard/senders.tsx
git commit -m "feat: wire SendCampaignModal into Senders page"
```

---

## Manual Verification Checklist

After all tasks are complete, verify in the browser:

- [ ] Dashboard TopBar shows "Send Campaign" button (outline emerald, to the left of Sync Sheet)
- [ ] Senders page header shows "Send Campaign" button (left of Add Sender)
- [ ] Clicking either button opens the modal
- [ ] Modal shows "Use all active senders" toggle (on by default)
- [ ] Toggling off reveals the sender checkbox list with name, email, sent/limit
- [ ] Emails per sender input accepts positive integers, rejects 0
- [ ] Summary line updates as sender selection or count changes
- [ ] Send Campaign button is disabled when 0 senders selected
- [ ] Pressing Escape closes the modal (when not sending)
- [ ] On submit, inputs disable and spinner appears
- [ ] On success, results table shows per-sender sent count and errors
- [ ] "Close" dismisses the modal without refreshing
- [ ] "Close & Refresh" dismisses and triggers a data reload
