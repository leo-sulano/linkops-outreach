---
slice: 09
title: Add visible error state to dashboard sync
priority: LOW
effort: S
status: pending
---

# Slice 09 — Dashboard Sync Error State

## Problem

`syncContactsFromSheet` in `pages/dashboard/index.tsx` (lines 141–143) catches errors and only logs to console. The user sees an empty table with no indication that the sync failed. Silent failures are hard to debug in production.

## Fix

1. Add an `error` state to the dashboard:
```ts
const [syncError, setSyncError] = useState<string | null>(null)
```

2. In `syncContactsFromSheet`, set the error on failure:
```ts
catch (error) {
  console.error('Failed to sync from Sheet:', error)
  setSyncError('Failed to load contacts. Check your Google Sheet connection.')
}
```

Clear it on success:
```ts
setSyncError(null)
setContacts(data.contacts)
```

3. Render an error banner above the table:
```tsx
{syncError && (
  <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
    {syncError}
  </div>
)}
```

## Files to Change

- `pages/dashboard/index.tsx`
