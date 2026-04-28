---
slice: 06
title: Delete dead/duplicate files
priority: MEDIUM
effort: XS
status: pending
parallel-with: 04, 05, 07, 08
---

# Slice 06 — Dead Code Cleanup

## Problem

Three files exist that are never imported and cause confusion:

| File | Why Dead |
|------|----------|
| `prisma.ts` (root) | Duplicate of `lib/prisma.ts`. Nothing imports root version. |
| `supabase.ts` (root) | Duplicate leftover. Nothing imports it. |
| `lib/supabase.ts` | Uses `NEXT_PUBLIC_*` vars but is never imported. All server code uses `lib/integrations/supabase.ts`. |

## Fix

Delete all three files:
```
prisma.ts
supabase.ts
lib/supabase.ts
```

## Verification

Run `grep -r "from.*['\"]../supabase['\"]" --include="*.ts" --include="*.tsx"` and `grep -r "from.*['\"]./supabase['\"]"` — should return no results.

Run `grep -r "from.*['\"]../prisma['\"]" --include="*.ts"` at root — should only find `lib/prisma.ts` imports.
