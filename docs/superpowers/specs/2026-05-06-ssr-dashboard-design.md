# SSR Dashboard — Instant Load Design

> **Project:** LinkOps — AI-powered link insertion outreach automation
> **Date:** 2026-05-06
> **Status:** Design approved, ready for implementation planning

---

## Overview

Replace the client-side Supabase fetch on mount with `getServerSideProps` that pulls directly from Google Sheets on every page visit. The browser receives a fully-rendered page with all contact data already populated — no "Loading..." state, no client-side fetch on mount. The Supabase cache is kept in sync as a side-effect of every visit.

---

## Section 1: Data Flow

```
Browser request
      │
      ▼
getServerSideProps (server-side, before HTML is sent)
      │
      ├─► fetchContactsFromSheet(sheetId, sheetTab)
      │         └─ on success: upsertSheetContacts(contacts) [awaited]
      │         └─ on failure: getSheetContacts() [Supabase cache fallback]
      │
      └─► returns { props: { initialContacts: contacts } }
                │
                ▼
         Page renders with data already in place
         Browser receives complete HTML — no loading state
```

**Google Sheets API failure fallback:** If `fetchContactsFromSheet` throws, `getServerSideProps` catches the error, calls `getSheetContacts()` from Supabase, and returns those contacts instead. The page still loads with cached data. No error page shown.

---

## Section 2: Component Changes

### `pages/dashboard/index.tsx`

**Add `getServerSideProps`:**

```typescript
import { fetchContactsFromSheet } from '@/lib/integrations/sheets'
import { upsertSheetContacts, getSheetContacts } from '@/lib/integrations/supabase'

export async function getServerSideProps() {
  const sheetId = process.env.GOOGLE_SHEET_ID || ''
  const sheetTab = process.env.GOOGLE_SHEET_TAB || 'Sheet1'
  try {
    const contacts = await fetchContactsFromSheet(sheetId, sheetTab)
    await upsertSheetContacts(contacts)
    return { props: { initialContacts: contacts } }
  } catch {
    const contacts = await getSheetContacts()
    return { props: { initialContacts: contacts } }
  }
}
```

**Update component signature:**
```typescript
export default function DashboardPage({ initialContacts }: { initialContacts: Contact[] }) {
```

**Update initial state:**
```typescript
const [contacts, setContacts] = useState<Contact[]>(initialContacts)
```

**Remove mount effect:**
```typescript
// DELETE this block:
useEffect(() => {
  loadFromSupabase();
}, []);
```

`isLoading` starts `false`. The heading never shows "Loading..." on initial visit.

### What stays unchanged

- `loadFromSupabase` function — still used by `onRefresh` callbacks in `SendCampaignModal` and `SendFollowupModal`
- `syncFromSheet` function — still used by the "Sync Sheet" button for mid-session manual refresh
- All modal wiring, nav counts, filtering — unchanged

---

## Files Changed

| File | Change |
|---|---|
| `pages/dashboard/index.tsx` | Add `getServerSideProps`; accept `initialContacts` prop; init state with it; remove mount `useEffect` |

---

## Success Criteria

1. Visiting the dashboard shows all contacts immediately — no "Loading..." heading
2. Nav list counts are correct on first render (no flash of empty state)
3. If Google Sheets API is unavailable, the page still loads with Supabase cached data
4. Sending a campaign or follow-up still refreshes the dashboard (modal `onRefresh` callbacks work)
5. "Sync Sheet" button still works for mid-session refresh
