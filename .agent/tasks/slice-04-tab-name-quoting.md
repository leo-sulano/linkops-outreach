---
slice: 04
title: Quote tab name in updateContactInSheet range string
priority: HIGH
effort: XS
status: pending
parallel-with: 05, 06, 07, 08
---

# Slice 04 — Tab Name Quoting Consistency

## Problem

`fetchContactsFromSheet` quotes the tab name (line 114):
```ts
range: `'${actualTabName}'!A:AP`
```

`updateContactInSheet` does NOT quote it (line 215):
```ts
const range = `${tabName}!A${rowIndex + 1}:AP${rowIndex + 1}`
```

If the tab name has a space, the update call throws a 400 from the Sheets API.

Note: This fix will be superseded by slice-03 which rewrites the range logic entirely. Only apply this fix if slice-03 is NOT being executed simultaneously.

## Fix

In `lib/integrations/sheets.ts` line 215, change:
```ts
const range = `${tabName}!A${rowIndex + 1}:AP${rowIndex + 1}`
```
to:
```ts
const range = `'${tabName}'!A${rowIndex + 1}:AP${rowIndex + 1}`
```

## Files to Change

- `lib/integrations/sheets.ts` line 215
