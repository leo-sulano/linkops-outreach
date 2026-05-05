# Campaign Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional campaign name field to the Send Campaign modal, pass it to the API, and log each campaign to a new Supabase `campaigns` table.

**Architecture:** Three isolated changes — a Supabase table (manual SQL), an API update that accepts `campaignName` and inserts to `campaigns` after sending, and a frontend update that adds the input and shows the name in the done screen.

**Tech Stack:** Next.js 14, TypeScript, Supabase JS v2, React, Jest + ts-jest

---

### Task 1: Create the Supabase `campaigns` table

**Files:**
- No code files — manual SQL run in Supabase dashboard

- [ ] **Step 1: Run this SQL in the Supabase SQL editor**

```sql
create table campaigns (
  id         uuid primary key default gen_random_uuid(),
  name       text,
  sent       integer not null,
  total      integer not null,
  results    jsonb not null,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 2: Verify the table exists**

In the Supabase Table Editor, confirm `campaigns` appears with columns: `id`, `name`, `sent`, `total`, `results`, `created_at`.

---

### Task 2: Update the API to accept and log campaign name

**Files:**
- Modify: `pages/api/paul/send-campaign.ts`
- Modify: `tests/unit/api/send-campaign.test.ts`

- [ ] **Step 1: Add failing tests for campaignName handling**

Open `tests/unit/api/send-campaign.test.ts`. Add these two tests inside the existing `describe` block, after the last test:

```typescript
  it('calls supabase insert with campaignName when contacts exist and emails send', async () => {
    const { fetchContactsFromSheet, updateContactInSheet } = require('../../../lib/integrations/sheets')
    fetchContactsFromSheet.mockResolvedValue([
      { id: '1', email: 'a@x.com', status: 'start_outreach', domain: 'x.com', niche: 'tech', contact: 'Alice' },
    ])
    updateContactInSheet.mockResolvedValue(undefined)

    const { sendOutreachWithSender } = require('../../../lib/senders/send')
    sendOutreachWithSender.mockResolvedValue(undefined)

    const insertMock = jest.fn().mockResolvedValue({ error: null })
    const statBuilder: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { sent_count: 0 }, error: null }),
    }
    const fromMock = jest.fn((table: string) => {
      if (table === 'campaigns') return { insert: insertMock }
      if (table === 'sender_daily_stats') return statBuilder
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [{ id: 's1', email: 'sender@x.com', status: 'active', daily_limit: 50, timezone: 'UTC', credential_json: '{}' }],
          error: null,
        }),
        in: jest.fn().mockResolvedValue({
          data: [{ id: 's1', email: 'sender@x.com', status: 'active', daily_limit: 50, timezone: 'UTC', credential_json: '{}' }],
          error: null,
        }),
      }
    })
    const { getSupabaseClient } = require('../../../lib/integrations/supabase')
    getSupabaseClient.mockReturnValue({ from: fromMock })

    const { req, res, json } = makeReqRes({ senderIds: 'all', emailsPerSender: 10, campaignName: 'May Batch 1' })
    await handler(req, res)

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'May Batch 1', sent: expect.any(Number), total: expect.any(Number) })
    )
  })

  it('calls supabase insert with null name when campaignName is omitted', async () => {
    const { fetchContactsFromSheet, updateContactInSheet } = require('../../../lib/integrations/sheets')
    fetchContactsFromSheet.mockResolvedValue([
      { id: '2', email: 'b@x.com', status: 'start_outreach', domain: 'x.com', niche: 'tech', contact: 'Bob' },
    ])
    updateContactInSheet.mockResolvedValue(undefined)

    const { sendOutreachWithSender } = require('../../../lib/senders/send')
    sendOutreachWithSender.mockResolvedValue(undefined)

    const insertMock = jest.fn().mockResolvedValue({ error: null })
    const statBuilder: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { sent_count: 0 }, error: null }),
    }
    const fromMock = jest.fn((table: string) => {
      if (table === 'campaigns') return { insert: insertMock }
      if (table === 'sender_daily_stats') return statBuilder
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [{ id: 's2', email: 'sender2@x.com', status: 'active', daily_limit: 50, timezone: 'UTC', credential_json: '{}' }],
          error: null,
        }),
        in: jest.fn().mockResolvedValue({
          data: [{ id: 's2', email: 'sender2@x.com', status: 'active', daily_limit: 50, timezone: 'UTC', credential_json: '{}' }],
          error: null,
        }),
      }
    })
    const { getSupabaseClient } = require('../../../lib/integrations/supabase')
    getSupabaseClient.mockReturnValue({ from: fromMock })

    const { req, res } = makeReqRes({ senderIds: 'all', emailsPerSender: 10 })
    await handler(req, res)

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: null })
    )
  })
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/unit/api/send-campaign.test.ts --no-coverage
```

Expected: the two new tests FAIL (insert is never called).

- [ ] **Step 3: Update the API handler**

Replace `pages/api/paul/send-campaign.ts` with:

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

  const { senderIds, emailsPerSender, campaignName } = req.body

  if (!senderIds || (senderIds !== 'all' && !Array.isArray(senderIds)) || !emailsPerSender || typeof emailsPerSender !== 'number' || emailsPerSender < 1) {
    return res.status(400).json({ error: 'senderIds must be "all" or an array of IDs, and emailsPerSender must be a positive number' })
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
      const remaining = Math.max(0, sender.daily_limit - sender.sent_today)
      const limit = Math.min(emailsPerSender, remaining)
      const batch = contacts.slice(i * emailsPerSender, i * emailsPerSender + limit)
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

    // Log campaign to Supabase (fire-and-forget — failure does not affect response)
    supabase
      .from('campaigns')
      .insert({
        name: campaignName && typeof campaignName === 'string' && campaignName.trim() ? campaignName.trim() : null,
        sent: totalSent,
        total: totalAttempted,
        results,
      })
      .then(({ error }) => {
        if (error) console.error('campaigns insert error:', error.message)
      })

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

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest tests/unit/api/send-campaign.test.ts --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add pages/api/paul/send-campaign.ts tests/unit/api/send-campaign.test.ts
git commit -m "feat: accept campaignName in send-campaign API and log to campaigns table"
```

---

### Task 3: Update the modal with campaign name input and done screen

**Files:**
- Modify: `components/dashboard/SendCampaignModal.tsx`

- [ ] **Step 1: Add `campaignName` state and input**

In `SendCampaignModal.tsx`, add `campaignName` state after the existing state declarations (around line 33):

```typescript
const [campaignName, setCampaignName] = useState('')
```

Add the input field inside the idle/sending form, before the sender toggle section (before the `{/* Sender toggle */}` comment, around line 181):

```tsx
{/* Campaign name */}
<div>
  <label className="block text-sm text-slate-400 mb-1.5 font-medium">
    Campaign name <span className="text-slate-600">(optional)</span>
  </label>
  <input
    type="text"
    placeholder="e.g. May Batch 1"
    value={campaignName}
    onChange={(e) => setCampaignName(e.target.value)}
    disabled={modalState === 'sending'}
    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50 placeholder:text-slate-600"
  />
</div>
```

- [ ] **Step 2: Pass campaignName in the POST body**

In the `handleSend` function, update the `fetch` body (around line 76):

```typescript
body: JSON.stringify({ senderIds, emailsPerSender, campaignName: campaignName.trim() || undefined }),
```

- [ ] **Step 3: Show campaign name in done screen**

Replace the done screen summary paragraph (around line 127–130):

```tsx
<div className="flex items-center gap-3">
  <CheckCircle2 size={20} className="text-emerald-400 flex-shrink-0" />
  <p className="text-slate-100 font-bold">
    {campaignName.trim()
      ? `Campaign sent — "${campaignName.trim()}" — ${results.sent} of ${results.total} emails delivered`
      : `Campaign sent — ${results.sent} of ${results.total} emails delivered`}
  </p>
</div>
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/SendCampaignModal.tsx
git commit -m "feat: add optional campaign name input to SendCampaignModal"
```
