---
slice: 01
title: Fix Supabase env var mismatch
priority: CRITICAL
effort: XS
status: pending
blocks: slice-02 (auth), all Paul/Sender endpoints
---

# Slice 01 — Supabase Env Var Fix

## Problem

`lib/integrations/supabase.ts` reads `process.env.SUPABASE_URL` and `process.env.SUPABASE_KEY`.
`.env.local` and Vercel only have `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Result: every server-side call to `getSupabaseClient()` throws at runtime. Affects:
- `GET/POST /api/senders`
- `PUT/DELETE /api/senders/[id]`
- `POST /api/paul/qualify`
- `POST /api/paul/generate-outreach`
- `POST /api/paul/send-outreach`
- `POST /api/webhooks/gmail`

## Fix

In `lib/integrations/supabase.ts`, update the env var names:

```ts
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Update the error message accordingly.

## Files to Change

- `lib/integrations/supabase.ts` lines 13–14

## Verification

After fix, `GET /api/senders` should return `[]` (empty array) instead of 500.
