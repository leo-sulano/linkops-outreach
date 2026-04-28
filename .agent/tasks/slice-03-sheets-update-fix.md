---
slice: 03
title: Fix updateContactInSheet data loss — overwriting row with nulls
priority: HIGH
effort: S
status: pending
---

# Slice 03 — Sheets Update Data Loss Fix

## Problem

`updateContactInSheet` in `lib/integrations/sheets.ts` (line 206–218) builds a 42-column array where unchanged columns are `null`, then sends a `values.update` across the full row range `A:AP`.

Google Sheets API treats `null` as "clear this cell". Saving only a status change wipes all other data in that row — prices, emails, notes, everything.

## Fix

Replace the full-row update with `batchUpdate` targeting only the specific cells that changed.

### New implementation for the update block (lines 206–222):

```ts
function colIndexToLetter(col: number): string {
  if (col < 26) return String.fromCharCode(65 + col)
  return 'A' + String.fromCharCode(65 + col - 26)
}

// Replace the rowValues array + values.update block with:
const data = Object.entries(colUpdates).map(([col, val]) => ({
  range: `'${tabName}'!${colIndexToLetter(Number(col))}${rowIndex + 1}`,
  values: [[val ?? '']],
}))

await sheets.spreadsheets.values.batchUpdate({
  spreadsheetId: sheetId,
  requestBody: {
    valueInputOption: 'RAW',
    data,
  },
})
```

Remove the old `TOTAL_COLS`, `rowValues`, and `values.update` block entirely.

## Files to Change

- `lib/integrations/sheets.ts` — replace lines 208–222, add `colIndexToLetter` helper above `updateContactInSheet`

## Verification

Update a single field (e.g. status) on a contact. All other fields in the sheet row must remain unchanged.
