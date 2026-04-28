# Codebase Audit — 2026-04-28

## Scope

Full audit of all source files. Triggered after Google Sheets sync was broken in production.

---

## CRITICAL — Security Exploits

### 1. All API endpoints are unauthenticated (slice-02)
Every route is publicly accessible. No auth checks anywhere.

| Endpoint | Risk |
|---|---|
| `POST /api/save-contact` | Overwrite any sheet row |
| `GET /api/sync-sheets` | Dump all contacts |
| `POST /api/paul/send-outreach` | Trigger bulk email sends |
| `GET/POST /api/senders` | Add sender with attacker credentials |
| `PUT/DELETE /api/senders/[id]` | Delete or hijack senders |
| `POST /api/paul/qualify` | Open |
| `POST /api/paul/generate-outreach` | Open |

### 2. Timing attack on webhook signature verification (slice-05)
`lib/integrations/gmail.ts:162` uses `===` string comparison instead of `crypto.timingSafeEqual()`.

### 3. Sender credentials stored unencrypted
`credential_json` (full Google service account JSON) inserted into Supabase `senders` table as plain text.

---

## HIGH — Functional Bugs

### 4. Supabase env var mismatch — all Paul/Sender endpoints crash (slice-01)
`lib/integrations/supabase.ts` reads `SUPABASE_URL` + `SUPABASE_KEY`.
`.env.local` / Vercel only have `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
All server-side Supabase calls throw at runtime.

### 5. DATA LOSS: updateContactInSheet overwrites entire row with nulls (slice-03)
`lib/integrations/sheets.ts:208–218` fills a 42-col array with `null` for unchanged columns,
then sends `values.update` across the full row. Sheets API treats `null` as "clear cell".
Saving one field wipes all other data in that row.

### 6. Tab name not quoted in updateContactInSheet (slice-04)
`updateContactInSheet` uses `${tabName}!A:AP` (unquoted).
`fetchContactsFromSheet` correctly uses `'${tabName}'!A:AP` (quoted).
Will break if tab name has spaces.

### 7. send-outreach reads from Prisma, not Google Sheets (no slice — architectural)
`pages/api/paul/send-outreach.ts` calls `prisma.prospect.findMany()`.
Prisma DB is empty. Endpoint always finds 0 contacts and reports `sent: 0`.

### 8. Hardcoded placeholder from_email (slice-07)
`pages/api/paul/generate-outreach.ts:77`: `from_email: 'outreach@yourcompany.com'`
All Supabase message logs have wrong sender address.

---

## MEDIUM — Inconsistencies

### 9. Two Supabase client files (slice-06 partial)
- `lib/supabase.ts` — uses public env vars, never imported anywhere (dead)
- `lib/integrations/supabase.ts` — used by all server code but has wrong env var names

### 10. Two Prisma client files (slice-06)
- `prisma.ts` (root) — dead, never imported
- `lib/prisma.ts` — the real one

### 11. Two Gmail systems that don't connect
- `lib/integrations/gmail.ts` — reads `GMAIL_SERVICE_ACCOUNT` env blob (nothing sets this)
- `lib/senders/gmail.ts` — reads per-sender creds from Supabase (the real system)
`lib/integrations/gmail.ts` is dead for production use.

### 12. No rate limiting
`/api/sync-sheets` and `/api/paul/send-outreach` hit external APIs with no throttle.
Repeated calls will exhaust Google Sheets and Gmail API quotas.

---

## LOW — Minor Issues

### 13. Health endpoint leaks server uptime
`pages/api/health.ts:10` returns `process.uptime()`. Minor info disclosure.

### 14. Silent sync failure in dashboard (slice-09)
`syncContactsFromSheet` only logs errors to console. User sees empty table with no feedback.

### 15. isDueForFollowup defined twice (slice-08)
Identical function in `pages/dashboard/index.tsx:41` and `components/dashboard/ContactTableRow.tsx:11`.

---

## Priority Fix Order

| # | Slice | Impact |
|---|-------|--------|
| 1 | slice-01 | Unbreaks all Paul/Sender endpoints |
| 2 | slice-02 | Closes open attack surface |
| 3 | slice-03 | Prevents data loss on contact save |
| 4 | slice-04 | Tab name quoting consistency |
| 5 | slice-05 | Timing attack hardening |
| 6 | slice-06 | Dead code removal |
| 7 | slice-07 | Fix from_email placeholder |
| 8 | slice-08 | Dedup helper function |
| 9 | slice-09 | Visible error state on sync failure |
