# Send Campaign Modal Design

**Date:** 2026-05-05
**Status:** Approved

## Summary

Add a "Send Campaign" feature that lets users send outreach emails to all unreached contacts (`start_outreach` status from Google Sheets), with full control over which senders to use and how many emails each sender sends. Accessible via a modal triggered from both the dashboard TopBar and the Senders page header.

## Problem

The existing `send-outreach` endpoint auto-picks a sender via round-robin and hard-codes a 5-email cap. There is no way to control which sender accounts are used or how many emails each one sends per run.

## Design

### API — `POST /api/paul/send-campaign`

New dedicated endpoint. Does not modify the existing `send-outreach` endpoint.

**Request body:**
```json
{
  "senderIds": ["uuid-1", "uuid-2"],
  "emailsPerSender": 10
}
```
- `senderIds` — array of sender UUIDs. Pass `"all"` (string) to use all active senders.
- `emailsPerSender` — positive integer, max emails each sender will send in this run.

**Server logic:**
1. Fetch all contacts from Google Sheets, filter for `status === 'start_outreach'` and non-empty email.
2. Resolve senders — if `"all"`, load all `active` senders from Supabase; otherwise load the specified IDs (must all be `active`).
3. Distribute contacts sequentially: sender 1 gets slice `[0, emailsPerSender)`, sender 2 gets `[emailsPerSender, 2×emailsPerSender)`, etc. Total cap = `emailsPerSender × senderCount`.
4. For each contact, call `sendOutreachWithSender(sender, contact, subject, body)` — a new variant of `sendOutreach` that bypasses `pickSender()` and uses the provided sender directly.
5. On success per contact: increment daily count, update `last_used_at`, write `outreach_logs`, update contact status to `outreach_sent` in Google Sheets.
6. On failure per contact: write failure log, continue to next contact (do not abort batch).

**Response:**
```json
{
  "sent": 18,
  "total": 20,
  "results": [
    { "sender": "sender1@gmail.com", "sent": 10, "errors": [] },
    { "sender": "sender2@gmail.com", "sent": 8, "errors": ["contact@x.com: auth failed"] }
  ]
}
```

### Library — `lib/senders/send.ts`

Add `sendOutreachWithSender(sender, contact, subject, body)` alongside the existing `sendOutreach`. Identical logic except it accepts a `SenderWithCount` directly instead of calling `pickSender()`. The existing `sendOutreach` function is unchanged.

### Modal UI — `SendCampaignModal`

Three internal states: `idle`, `sending`, `done`.

**Idle:**
- Toggle: "Use all active senders" (default: on)
- When toggled off: checkbox list of active senders, each row showing name, email, daily limit, sent today
- Number input: "Emails per sender" (default: 10, min: 1)
- Summary line: *"Will send up to N emails across M senders"*
- "Send Campaign" primary button (disabled if no senders selected or count < 1)
- Senders list loaded on modal open via existing `GET /api/senders/stats`

**Sending:**
- Spinner replaces button, all inputs disabled
- Label: *"Sending campaign…"*

**Done:**
- Header: *"Campaign sent — X of Y emails delivered"*
- Per-sender breakdown table: Sender | Sent | Errors
- Errors shown in a red expandable section if any exist
- Two buttons: "Close" and "Close & Refresh"

### Components

| Component / File | Action |
|-----------------|--------|
| `pages/api/paul/send-campaign.ts` | New API endpoint |
| `lib/senders/send.ts` | Add `sendOutreachWithSender` function |
| `components/dashboard/SendCampaignModal.tsx` | New modal component |
| `components/dashboard/TopBar.tsx` | Add "Send Campaign" button + `onSendCampaign` prop |
| `pages/dashboard/index.tsx` | Add `showSendCampaign` state, wire modal + refresh |
| `pages/dashboard/senders.tsx` | Add "Send Campaign" button + modal state |

### Placement

- **Dashboard TopBar:** outline-style "Send Campaign" button placed next to the existing Sync button
- **Senders page header:** same button next to "Add Sender"

### Data Flow

1. Modal mounts → `GET /api/senders/stats` loads active senders for the checkbox list
2. User configures and submits → `POST /api/paul/send-campaign`
3. Results render in modal
4. "Close & Refresh" → calls `loadFromSupabase()` (dashboard) or `loadSenders()` (senders page) then closes modal

## Out of Scope

- Scheduling or queuing campaigns for later
- Per-sender custom email count (all selected senders share one `emailsPerSender` value)
- Pausing or cancelling an in-progress send
- New database tables or schema changes
