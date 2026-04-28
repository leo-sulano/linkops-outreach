# Multi-Sender Outreach — Design Spec
**Date:** 2026-04-28  
**Status:** Approved

---

## Overview

Upgrade the LinkOps outreach system to support multiple Gmail sender accounts with round-robin rotation, per-sender daily limits, health tracking, and a dashboard management UI.

**Current state:** Single hardcoded Gmail service account (`outreach@yourcompany.com`) with no rotation, no limits, no tracking.

**Target state:** N sender accounts (Gmail service account or OAuth), automatically rotated round-robin, daily limits enforced per sender per local day, every send logged, senders manageable via dashboard UI.

---

## Constraints & Decisions

- **Gmail only** — all senders are Gmail accounts (service account JSON or OAuth tokens)
- **Supabase is the primary DB** — no Prisma changes needed
- **Credentials in DB** — `credential_json` stored as `jsonb` in Supabase; never returned in API GET responses
- **Daily reset** — per sender's configured timezone, at local midnight
- **Round-robin** — ordered by `last_used_at ASC` (least recently used wins)

---

## Section 1: Data Model

### Table: `senders`

```sql
CREATE TABLE senders (
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
```

**`credential_json` shape by type:**
- `service_account`: the full Google service account key JSON blob
- `oauth`: `{ "access_token": "...", "refresh_token": "...", "expiry": "ISO-timestamp" }`

### Table: `sender_daily_stats`

```sql
CREATE TABLE sender_daily_stats (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   uuid NOT NULL REFERENCES senders(id) ON DELETE CASCADE,
  date        date NOT NULL,
  sent_count  integer NOT NULL DEFAULT 0,
  UNIQUE (sender_id, date)
);
```

`date` is stored in the sender's local timezone (converted at write time).

### Table: `outreach_logs`

```sql
CREATE TABLE outreach_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id      uuid NOT NULL REFERENCES senders(id) ON DELETE CASCADE,
  contact_domain text,
  contact_email  text,
  subject        text,
  status         text NOT NULL CHECK (status IN ('sent', 'failed')),
  error          text,
  sent_at        timestamptz NOT NULL DEFAULT now()
);
```

### Existing table: `contacts`

No schema change. The existing `email_account` column is populated with the chosen sender's email address when outreach is dispatched.

---

## Section 2: Rotation & Sending Logic

### `lib/senders/rotate.ts`

Exports `pickSender(): Promise<Sender>`.

```
1. SELECT all senders WHERE status = 'active'
2. For each sender, look up sent_count in sender_daily_stats for today
   (today = current date in sender's timezone)
3. Filter out senders where sent_count >= daily_limit
4. Sort remaining by last_used_at ASC (nulls first — never-used senders go first)
5. Return the first sender
6. If list is empty → throw NoAvailableSenderError
```

### `lib/senders/send.ts`

Exports `sendOutreach(contact, subject, body): Promise<void>`.

```
1. pickSender() → sender
2. buildGmailClient(sender) → gmail (from lib/senders/gmail.ts)
3. gmail.send(to: contact.email, subject, body, from: sender.email)
4. On SUCCESS:
   a. Upsert sender_daily_stats: sent_count += 1  (INSERT ... ON CONFLICT DO UPDATE)
   b. UPDATE senders SET last_used_at = now() WHERE id = sender.id
   c. INSERT outreach_logs (status: 'sent')
   d. UPDATE contacts SET email_account = sender.email WHERE domain = contact.domain
   e. Sync email_account back to Google Sheet column 19
   f. UPDATE contact status → 'outreach_sent'
5. On FAILURE:
   a. INSERT outreach_logs (status: 'failed', error: message)
   b. If error is auth-related → UPDATE senders SET status = 'error', last_error = message
   c. Re-throw error
```

### `lib/senders/gmail.ts`

Exports `buildGmailClient(sender: Sender): GoogleApis.Gmail`.

- For `service_account`: uses `google.auth.GoogleAuth` with the JSON blob (same pattern as current `lib/integrations/gmail.ts`)
- For `oauth`: uses `google.auth.OAuth2` with stored access/refresh tokens; auto-refreshes if expired and writes new `access_token` + `expiry` back to `credential_json`

### `lib/senders/errors.ts`

```typescript
export class NoAvailableSenderError extends Error {}
export class SenderAuthError extends Error {}
```

---

## Section 3: API Routes

All routes require server-side only (no client credential exposure).

### `pages/api/senders/index.ts`

**GET** — returns all senders, `credential_json` omitted:
```json
[{ "id", "name", "email", "credential_type", "daily_limit", "timezone", "status", "last_error", "last_used_at", "created_at" }]
```

**POST** — create sender, accepts full `credential_json` in body.

### `pages/api/senders/[id].ts`

**PUT** — update any field including `credential_json`.  
**DELETE** — hard delete sender + cascades to stats and logs.

### `pages/api/senders/stats.ts`

**GET** — returns today's stats + recent logs per sender:
```json
[{
  "sender_id", "email", "name",
  "sent_today": 23,
  "daily_limit": 50,
  "recent_logs": [{ "contact_email", "subject", "status", "sent_at" }]
}]
```

### Updated: `pages/api/paul/send-outreach.ts`

Replace hardcoded Gmail call with `sendOutreach()` from `lib/senders/send.ts`. Email generation (OpenAI/Claude) and contact lookup remain unchanged.

---

## Section 4: Dashboard UI

### New page: `pages/dashboard/senders.tsx`

**Sender table columns:** Name | Email | Type | Daily Limit | Sent Today | Status | Actions

- **Add Sender** button → modal with fields: Name, Email, Type (Service Account only in v1 — OAuth is a follow-on), Credential (JSON paste textarea), Daily Limit, Timezone
- **Status toggle** — click active/inactive inline, calls PUT `/api/senders/[id]`
- **Error badge** — if `status = 'error'`, red badge with `last_error` in tooltip
- **Sent Today** — from `/api/senders/stats`, resets at sender's local midnight
- **Delete** — confirm dialog, then DELETE `/api/senders/[id]`

### Updated: `components/dashboard/ContactTable.tsx` + `ContactTableRow.tsx`

New **Sender** column added to all stages except `start-outreach`. Displays sender email as a small monospace badge. Shows `—` until outreach is dispatched.

### Updated: `components/dashboard/Sidebar.tsx`

New **Senders** item added under the Tools section. Badge shows count of active senders.

---

## Section 5: Error Handling

| Scenario | Behaviour |
|---|---|
| All senders at daily limit | `NoAvailableSenderError` → API returns 503 with message |
| Auth failure on send | Sender marked `status = 'error'`, log written, error re-thrown |
| OAuth token expired | Auto-refresh attempted; if refresh fails → sender marked `error` |
| No senders configured | Same as all at limit — 503 |
| Partial failure mid-batch | Each contact send is independent; failures logged, others continue |

---

## Section 6: File Structure

```
lib/senders/
  rotate.ts        — pickSender()
  send.ts          — sendOutreach()
  gmail.ts         — buildGmailClient()
  errors.ts        — NoAvailableSenderError, SenderAuthError
  types.ts         — Sender, SenderDailyStats, OutreachLog interfaces

pages/api/senders/
  index.ts         — GET list, POST create
  [id].ts          — PUT update, DELETE
  stats.ts         — GET today's stats + recent logs

pages/dashboard/
  senders.tsx      — Sender management page

components/dashboard/
  SenderTable.tsx  — Sender list table
  AddSenderModal.tsx — Add/edit sender form modal
```

---

## Out of Scope

- SendGrid / SMTP support (Gmail only)
- Per-contact sender assignment override (automatic only)
- Email open/click tracking
- Sender warm-up scheduling
