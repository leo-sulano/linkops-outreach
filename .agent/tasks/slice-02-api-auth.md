---
slice: 02
title: Add API key authentication to all write/sensitive endpoints
priority: CRITICAL
effort: M
status: pending
depends-on: slice-01
---

# Slice 02 — API Authentication

## Problem

Every API endpoint is publicly accessible. No authentication exists. Attackers can:
- Dump all contacts via `/api/sync-sheets`
- Overwrite sheet rows via `/api/save-contact`
- Trigger bulk email sends via `/api/paul/send-outreach`
- Add/delete senders via `/api/senders`

## Fix

Implement a simple API key check via a shared middleware helper.

### 1. Create `lib/api-auth.ts`

```ts
import type { NextApiRequest, NextApiResponse } from 'next'

export function requireApiKey(req: NextApiRequest, res: NextApiResponse): boolean {
  const apiKey = process.env.API_SECRET_KEY
  if (!apiKey) return true // skip auth if key not configured (dev mode)
  const provided = req.headers['x-api-key'] || req.query['api_key']
  if (provided !== apiKey) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  return true
}
```

### 2. Apply to sensitive endpoints

Add at the top of each handler, before business logic:
```ts
if (!requireApiKey(req, res)) return
```

Endpoints to protect:
- `pages/api/sync-sheets.ts`
- `pages/api/save-contact.ts`
- `pages/api/paul/send-outreach.ts`
- `pages/api/paul/qualify.ts`
- `pages/api/paul/generate-outreach.ts`
- `pages/api/senders/index.ts`
- `pages/api/senders/[id].ts`
- `pages/api/webhooks/gmail.ts`

Leave `pages/api/health.ts` and `pages/api/contacts.ts` unprotected.

### 3. Add env var

Add to `.env.local` and Vercel:
```
API_SECRET_KEY="<generate a random 32-char string>"
```

### 4. Update dashboard fetch calls

The dashboard calls `/api/sync-sheets` and `/api/save-contact` directly. Update these to pass the key via header. Since the key will be in `NEXT_PUBLIC_API_SECRET_KEY` for client-side use:

```ts
fetch('/api/sync-sheets', {
  headers: { 'x-api-key': process.env.NEXT_PUBLIC_API_SECRET_KEY || '' }
})
```

## Files to Change

- `lib/api-auth.ts` (new)
- `pages/api/sync-sheets.ts`
- `pages/api/save-contact.ts`
- `pages/api/paul/send-outreach.ts`
- `pages/api/paul/qualify.ts`
- `pages/api/paul/generate-outreach.ts`
- `pages/api/senders/index.ts`
- `pages/api/senders/[id].ts`
- `pages/api/webhooks/gmail.ts`
- `pages/dashboard/index.tsx` (add header to fetch calls)
- `.env.local` (add API_SECRET_KEY + NEXT_PUBLIC_API_SECRET_KEY)
