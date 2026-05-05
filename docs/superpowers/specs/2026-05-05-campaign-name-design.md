# Campaign Name Feature — Design Spec

**Date:** 2026-05-05
**Status:** Approved

## Overview

Add an optional campaign name field to the Send Campaign modal. The name is stored alongside campaign results in a new Supabase `campaigns` table, providing an audit log of past campaigns without blocking the send flow.

## Frontend — SendCampaignModal

- Add an optional text input labeled **"Campaign name"** at the top of the idle form, above the sender toggle.
- Placeholder text: `e.g. May Batch 1`
- No validation — field is optional. Send button remains enabled regardless.
- State: `campaignName: string` (default `''`).
- The value is included in the POST body as `campaignName` alongside `senderIds` and `emailsPerSender`.
- On the done screen, if a name was provided, show it in the summary line:
  - With name: `Campaign sent — "May Batch 1" — 42 of 50 emails delivered`
  - Without name: `Campaign sent — 42 of 50 emails delivered` (existing behavior)

## API — `/api/paul/send-campaign`

- Accept optional `campaignName?: string` from `req.body`.
- No validation change — it's ignored if absent.
- After the send loop completes, insert one row into the `campaigns` Supabase table.
- The insert is fire-and-forget (non-blocking failure): if the insert fails, the API still returns the send results successfully. Log the error to console.

## Supabase — `campaigns` table

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

- `name` is nullable (covers unnamed campaigns).
- `results` stores the per-sender breakdown array (same shape as the API response `results` field).
- No RLS required — table is write-only from the server using the service role key.
- Table must be created manually in Supabase before deployment.

## Data Flow

```
User fills modal (optional name) → POST /api/paul/send-campaign
  { senderIds, emailsPerSender, campaignName? }
    → send emails
    → insert row into campaigns table (fire-and-forget)
    → return { sent, total, results }
Modal done screen shows name if present
```

## Out of Scope

- No campaigns history UI (table exists for future use).
- No campaign name in email subject/body.
- No name uniqueness enforcement.
