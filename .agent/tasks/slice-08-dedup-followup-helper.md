---
slice: 08
title: Deduplicate isDueForFollowup helper function
priority: LOW
effort: XS
status: pending
parallel-with: 04, 05, 06, 07
---

# Slice 08 — Deduplicate isDueForFollowup

## Problem

Identical function defined in two places:
- `pages/dashboard/index.tsx` line 41
- `components/dashboard/ContactTableRow.tsx` line 11

Any change to the logic must be made in both files. They will drift.

## Fix

1. Create `lib/utils/followup.ts`:
```ts
import type { Contact } from '@/components/dashboard/types'

export function isDueForFollowup(contact: Contact): boolean {
  if (contact.status !== 'outreach_sent' || !contact.outreachDate) return false
  const daysSince = (Date.now() - new Date(contact.outreachDate).getTime()) / (1000 * 60 * 60 * 24)
  return daysSince >= 2
}
```

2. In `pages/dashboard/index.tsx` — remove the local definition, import from util.
3. In `components/dashboard/ContactTableRow.tsx` — remove the local definition, import from util.

## Files to Change

- `lib/utils/followup.ts` (new)
- `pages/dashboard/index.tsx` line 41–45 (remove + add import)
- `components/dashboard/ContactTableRow.tsx` lines 11–15 (remove + add import)
