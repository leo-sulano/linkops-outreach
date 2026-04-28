---
date: 2026-04-28
session: Google Sheets sync fix + full codebase audit
status: audit complete, fixes pending
---

# Session Handoff — 2026-04-28

## What Was Done This Session

1. **Root cause found**: Google Sheet was not syncing to live site because `GOOGLE_CREDENTIALS_JSON`, `GOOGLE_SHEET_ID`, and `GOOGLE_SHEET_TAB` were only in `.env.local` (git-ignored) and never added to Vercel.
2. **Approach switched**: Replaced single JSON blob env var with two clean vars: `GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY`. Updated `lib/integrations/sheets.ts` accordingly. Committed and pushed.
3. **Verified working**: Local test confirmed `/api/sync-sheets` returns contacts from the sheet.
4. **Full audit completed**: All source files read and analyzed. See `docs/audit/2026-04-28-codebase-audit.md` for full findings.

## Current Architecture

```
Google Sheet ──► /api/sync-sheets ──► lib/integrations/sheets.ts (googleapis)
                                           ↕ GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY

Dashboard (pages/dashboard/index.tsx)
  ├── Syncs on mount + manual refresh via /api/sync-sheets
  ├── Saves edits via /api/save-contact → updateContactInSheet
  └── All state is in-memory (no DB write on the dashboard path)

Supabase (lib/integrations/supabase.ts)
  └── Used by Paul AI endpoints (qualify, generate-outreach) and senders
  └── BROKEN: reads SUPABASE_URL/SUPABASE_KEY but .env.local has NEXT_PUBLIC_SUPABASE_URL/ANON_KEY

Senders (lib/senders/)
  └── Round-robin Gmail sender pool stored in Supabase `senders` table
  └── Credentials stored per-sender as credential_json column

Paul AI (pages/api/paul/)
  └── qualify.ts, generate-outreach.ts, send-outreach.ts
  └── send-outreach.ts reads from PRISMA (disconnected — Prisma DB is empty)
```

## Open Work (Slice Files in .agent/tasks/)

| Slice | File | Priority | Status |
|-------|------|----------|--------|
| 01 | slice-01-supabase-env-fix.md | CRITICAL | pending |
| 02 | slice-02-api-auth.md | CRITICAL | pending |
| 03 | slice-03-sheets-update-fix.md | HIGH | pending |
| 04 | slice-04-tab-name-quoting.md | HIGH | pending |
| 05 | slice-05-webhook-timing-attack.md | MEDIUM | pending |
| 06 | slice-06-dead-code-cleanup.md | MEDIUM | pending |
| 07 | slice-07-generate-outreach-from-email.md | MEDIUM | pending |
| 08 | slice-08-dedup-followup-helper.md | LOW | pending |
| 09 | slice-09-dashboard-error-state.md | LOW | pending |

## Env Vars Required (Vercel + .env.local)

| Var | Purpose | Status |
|-----|---------|--------|
| `GOOGLE_CLIENT_EMAIL` | Sheets auth | ✅ Set |
| `GOOGLE_PRIVATE_KEY` | Sheets auth | ✅ Set |
| `GOOGLE_SHEET_ID` | Target spreadsheet | ✅ Set |
| `GOOGLE_SHEET_TAB` | Tab name (default Sheet1) | ✅ Set |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase client (public) | ✅ In .env.local |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) | ✅ In .env.local |
| `SUPABASE_URL` | Supabase server-side | ❌ Missing — blocks Paul/Senders |
| `SUPABASE_KEY` | Supabase server-side | ❌ Missing — blocks Paul/Senders |
| `DATABASE_URL` | Prisma (placeholder) | ⚠️ Placeholder only |

## Key Files Changed This Session

- `lib/integrations/sheets.ts` — switched from `GOOGLE_CREDENTIALS_JSON` to `GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY`
- `.env.local` — updated to new env var format
