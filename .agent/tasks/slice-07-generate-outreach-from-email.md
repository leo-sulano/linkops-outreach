---
slice: 07
title: Fix hardcoded placeholder from_email in generate-outreach
priority: MEDIUM
effort: XS
status: pending
parallel-with: 04, 05, 06, 08
---

# Slice 07 — Fix Hardcoded from_email

## Problem

`pages/api/paul/generate-outreach.ts` line 77:
```ts
from_email: 'outreach@yourcompany.com',
```

Every outbound message logged to Supabase has a fake sender address. This corrupts audit logs and reply tracking.

## Fix

Read the sender from the contact's `email_account` field, or fall back to a configurable env var:

```ts
from_email: contact.email_account || process.env.DEFAULT_OUTREACH_EMAIL || 'outreach@linkops.io',
```

Also add `DEFAULT_OUTREACH_EMAIL` to `.env.local` with the actual sending address.

## Files to Change

- `pages/api/paul/generate-outreach.ts` line 77
- `.env.local` (add `DEFAULT_OUTREACH_EMAIL`)
