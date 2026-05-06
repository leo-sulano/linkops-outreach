# Contact Lifecycle Sync Design

> **Project:** LinkOps — AI-powered link insertion outreach automation
> **Date:** 2026-05-06
> **Status:** Design approved, ready for implementation planning

---

## Overview

This feature makes the dashboard navigation list counts and the Google Sheet status column stay in sync at every stage of the outreach pipeline. Every action that advances a contact's stage writes to both Google Sheet and the Supabase cache in the same API call (dual-write). The dashboard reloads from Supabase after each action.

**Approach:** Direct dual-write — every stage transition writes to Google Sheet and Supabase cache together. Manual Sync reconciles any drift from Sheet-side edits.

---

## Section 1: Status Lifecycle & Sheet Mapping

| Stage | Trigger | Sheet value | Dashboard list |
|---|---|---|---|
| Start Outreach | Contact in sheet with no action | `Pending` | Start Outreach |
| Outreach Sent | Campaign sent from dashboard | `Sent 1st` | Outreach Sent |
| Send Follow-up | 2 working days, no reply (manual sheet edit or sync) | `Sent 2nd` | Send Follow-up |
| Response Received | Gmail webhook detects reply | `Response` | Response Received |
| Under Negotiation | "Start Negotiation" button on contact row | `Negotiation` | Under Negotiation |
| Negotiated | "Mark as Negotiated" button on contact row | `Negotiated` | Negotiated |
| Approved / Payment Sent / Live | Existing manual edit flow (unchanged) | (unchanged) | (unchanged) |

### Sheet mapping changes (`lib/integrations/sheets.ts`)

**Inbound `mapStatus`** — add:
```
'response': 'response_received'
```

**Outbound `STATUS_TO_SHEET`** — change:
```
response_received: 'Response'   // was 'Confirmed'
```

---

## Section 2: Campaign Send → Outreach Sent (fix)

**Problem:** `send-campaign.ts` updates the Sheet but not the Supabase cache, so dashboard nav counts stay stale until manual sync.

**Fix:** After each email is successfully sent, call both:
- `updateContactInSheet(sheetId, rowIndex, { status: 'outreach_sent' }, sheetTab)` (existing) — uses `parseInt(contact.id, 10) - 1`
- `updateSheetContact(parseInt(contact.id, 10), { ...contact, status: 'outreach_sent' })` (new addition) — uses `parseInt(contact.id, 10)` without the `-1`, because `sheet_contacts.row_index` matches `contact.id` directly

**Note:** The existing `rowIndex` variable in `send-campaign.ts` (`parseInt(contact.id, 10) - 1`) is only correct for the Sheet write. The Supabase cache write must use `parseInt(contact.id, 10)` (no `-1`).

The dashboard already calls `loadFromSupabase` via `onRefresh` when the Send Campaign modal closes — no dashboard changes needed.

**Files changed:**
- `pages/api/paul/send-campaign.ts` — add `updateSheetContact` call after successful send

---

## Section 3: Send Follow-up Flow (new)

A dedicated follow-up send flow mirroring the campaign flow, targeting `send_followup` contacts only.

### New API: `/api/paul/send-followup.ts`

- Same structure as `send-campaign.ts`
- Filters contacts where `status === 'send_followup'` (not `start_outreach`)
- Uses a follow-up email template (separate from the initial outreach template)
- After each successful send: dual-write Sheet (`Sent 2nd`) and Supabase cache (`send_followup`)
- Contact status stays `send_followup` — the send confirms it was actioned, it doesn't advance the stage
- Returns same response shape as `send-campaign.ts`

### New component: `SendFollowupModal`

- Mirrors `SendCampaignModal`: pick senders, emails per sender, send button
- Labeled "Send Follow-up"
- On success, calls `onRefresh` → `loadFromSupabase`

### UI placement

- "Send Follow-up" button added to `TopBar` alongside "Send Campaign"
- Shows a badge with `navCounts.sendFollowup` count when > 0

**Files created/changed:**
- `pages/api/paul/send-followup.ts` (new)
- `components/dashboard/SendFollowupModal.tsx` (new)
- `components/dashboard/TopBar.tsx` — add Send Follow-up button
- `pages/dashboard/index.tsx` — wire `showSendFollowup` state and modal

---

## Section 4: Response Detection via Gmail Webhook

**Current state:** `/api/webhooks/gmail` logs the inbound message to `messages` table but does not update contact status.

**What gets added:**

1. Extract the sender's email address from the incoming reply
2. Look up the contact in Supabase `sheet_contacts` by matching `data->>'email'` against the reply's `from` address — requires a new helper `getSheetContactByEmail(email)` that queries `SELECT row_index, data FROM sheet_contacts WHERE data->>'email' = $1 LIMIT 1` and returns `{ rowIndex: number, contact: Contact } | null`
3. If found:
   - Update Supabase cache: `updateSheetContact(rowIndex, { ...contact, status: 'response_received' })`
   - Update Sheet: `updateContactInSheet(sheetId, rowIndex, { status: 'response_received' }, sheetTab)` → writes `Response` to the sheet
4. Dashboard picks up the change on next load or manual Sync (no live push)

**Constraint:** Only catches replies to emails sent via the registered sender accounts through the Gmail webhook. Replies to other threads are updated manually via the Sheet.

**Files changed:**
- `pages/api/webhooks/gmail.ts` — add contact lookup and dual-write after message is logged

---

## Section 5: Manual Stage Transitions

Contacts in "Response Received" and "Under Negotiation" need action buttons to advance their stage. No new API endpoints — `save-contact.ts` already handles bidirectional writes.

### Buttons to add

**In "Response Received" stage view → each contact row:**
- Button: **"Start Negotiation"**
- Action: calls `handleUpdateContact({ ...contact, status: 'under_negotiation' })`
- `save-contact.ts` writes `Negotiation` to Sheet + `under_negotiation` to Supabase cache

**In "Under Negotiation" stage view → each contact row:**
- Button: **"Mark as Negotiated"**
- Action: calls `handleUpdateContact({ ...contact, status: 'negotiated' })`
- `save-contact.ts` writes `Negotiated` to Sheet + `negotiated` to Supabase cache

**Files changed:**
- `components/dashboard/ContactTableRow.tsx` — add stage-conditional action buttons
- `components/dashboard/ExpandedRowDetail.tsx` — add same buttons in expanded view

---

## Files Summary

| File | Change type |
|---|---|
| `lib/integrations/sheets.ts` | Modify — add `'response'` to `mapStatus`, change `STATUS_TO_SHEET.response_received` to `'Response'` |
| `pages/api/paul/send-campaign.ts` | Modify — add `updateSheetContact` call after successful send |
| `pages/api/paul/send-followup.ts` | Create — dedicated follow-up send endpoint |
| `lib/integrations/supabase.ts` | Modify — add `getSheetContactByEmail(email)` helper |
| `pages/api/webhooks/gmail.ts` | Modify — add contact lookup and dual-write on reply |
| `components/dashboard/SendFollowupModal.tsx` | Create — follow-up send modal |
| `components/dashboard/TopBar.tsx` | Modify — add Send Follow-up button with badge |
| `pages/dashboard/index.tsx` | Modify — wire `showSendFollowup` state and modal |
| `components/dashboard/ContactTableRow.tsx` | Modify — add stage-conditional action buttons |
| `components/dashboard/ExpandedRowDetail.tsx` | Modify — add same action buttons in expanded view |

---

## Success Criteria

1. After a campaign is sent, dashboard nav counts reflect `outreach_sent` immediately (no manual sync required)
2. Contacts in Google Sheet with status "Sent 2nd" appear in the "Send Follow-up" list on dashboard
3. Sending a follow-up from the dashboard updates Sheet to "Sent 2nd" and Supabase cache
4. When a contact replies, Gmail webhook sets Sheet status to "Response" and moves contact to "Response Received" in dashboard
5. "Start Negotiation" button on a contact row sets Sheet to "Negotiation" and moves contact to "Under Negotiation"
6. "Mark as Negotiated" button sets Sheet to "Negotiated" and moves contact to "Negotiated"
7. All nav list counts in the Sidebar always match the Google Sheet statuses after any action
