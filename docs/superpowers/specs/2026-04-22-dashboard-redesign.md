# Dashboard Redesign Specification

**Date:** 2026-04-22  
**Project:** LinkOps  
**Scope:** Full dashboard redesign to match reference design (linkops.html) with real data structure from Manual Outreach Excel.xlsx

---

## Overview

Rebuild the LinkOps dashboard from a basic hardcoded layout into a professional, feature-rich interface that:
- Displays real business metrics (domains, pricing, confirmations)
- Shows contact data with collapsible detail rows
- Supports full CRUD operations on contacts
- Matches the design aesthetic of the linkops.html reference
- Uses React component architecture for maintainability

---

## Data Structure

The dashboard works with 23 columns from the Excel file:

**Core Fields:**
- Domain, Niche, Status, Email Account, Currency
- Price from Backlinker (EUR)

**Contact Information:**
- Email 1, Name
- Email 2, Name
- Email 3, Name

**Pricing:**
- Standard Price (EUR)
- Gambling Price (EUR)
- Negotiated Price (Gambling)

**Preferences:**
- Accept Casino (boolean)
- Accept Betting (boolean)
- Sponsored (boolean)
- Link Term

**Timeline & Notes:**
- Date Confirmed
- Reply (yes/no/pending)
- Notes
- Content Guidelines

---

## Layout Architecture

### Overall Structure
```
┌─────────────────────────────────┐
│          Top Bar                │
│  (Title, Run Paul, Refresh)     │
├──────────┬──────────────────────┤
│          │                      │
│ Sidebar  │   Stats Cards (4)    │
│          │                      │
│          ├──────────────────────┤
│          │                      │
│          │  Contact Table       │
│          │  (Collapsible Rows)  │
│          │                      │
└──────────┴──────────────────────┘
```

### Sidebar (Fixed, 230px)
- **Logo section** — LinkOps branding
- **Paul AI Status** — Green indicator with "Paul is Active" text and blinking dot animation
- **Navigation** — Menu items:
  - Domains (with count badge)
  - Pending Confirmations (with count)
  - Confirmed (with count)
  - Settings
- **Sync Button** — Manual refresh with animated sync indicator
- **Footer** — "Last synced" timestamp

### Top Bar
- **Left:** Page title ("Domains") + subtitle ("Manage your outreach contacts")
- **Right:** Action buttons
  - "🚀 Run Paul" (primary blue button)
  - "🔄 Refresh" (secondary gray button)

### Stats Cards (4-column grid)
1. **Total Domains** — Count of all rows in contacts
2. **Average Price (EUR)** — Mean of Standard Price column
3. **Confirmed Deals** — Count where Date Confirmed is not null
4. **Casino-Friendly** — Count where Accept Casino = true

Each card shows:
- Label (small, uppercase)
- Large number (bold)
- Optional trend indicator

### Contact Table (Main Content)

**Collapsed View (default for each row):**

| Domain | Niche | Status | Email 1 | Standard Price | Gambling Price | Date Confirmed |
|--------|-------|--------|---------|----------------|----------------|----------------|
| example.com | Business | Pending | john@example.com | €250 | €350 | — |

**Columns shown in collapsed view:**
- Domain (text)
- Niche (text)
- Status (badge with color coding)
- Email 1 (text, email format)
- Standard Price (EUR)
- Gambling Price (EUR)
- Date Confirmed (date or "—")

**Expanded View (click row to reveal):**

A detail panel expands below the row showing organized sections:

**Contact Section:**
- Email 1 + Name
- Email 2 + Name
- Email 3 + Name
- Email Account

**Pricing Section:**
- Standard Price (EUR)
- Gambling Price (EUR)
- Negotiated Price (Gambling)
- Currency
- Price from Backlinker (EUR)

**Preferences Section:**
- Accept Casino (checkbox)
- Accept Betting (checkbox)
- Sponsored (checkbox)
- Link Term

**Confirmation & Status Section:**
- Date Confirmed (date picker when editing)
- Reply (dropdown: Yes / No / Pending)
- Status (dropdown: Pending / Confirmed / No Deal / etc.)

**Notes Section:**
- Content Guidelines (text area)
- Notes (text area)

---

## Styling

### Color Palette (Reference: linkops.html)
- **Background:** #07090e (dark navy)
- **Panel/Card:** #0c0f16 (slightly lighter)
- **Borders:** rgba(255,255,255,0.08)
- **Text (primary):** #dde2f0 (light gray-blue)
- **Text (secondary):** #7880a0 (muted blue)
- **Accent (Paul):** #6ee7b7 (teal/emerald)
- **Status badges:**
  - Pending: #38bdf8 (light blue)
  - Confirmed: #34d399 (green)
  - No Deal: #f87171 (red)
  - Negotiation: #a78bfa (purple)

### Implementation
- Use **Tailwind CSS** for styling (matches existing project)
- Follow reference design spacing and typography
- Status badges use color-coded backgrounds with white text

---

## Component Structure

### File Organization
```
pages/dashboard/
├── index.tsx                 (Main page, state management)
│
components/dashboard/
├── Sidebar.tsx              (Left sidebar)
├── TopBar.tsx               (Header with title and buttons)
├── StatsCard.tsx            (Reusable stat card)
├── ContactTable.tsx         (Table with collapsible rows)
├── ContactTableRow.tsx      (Single row, collapsed)
├── ExpandedRowDetail.tsx    (Expanded detail panel)
└── types.ts                 (TypeScript interfaces)
```

### Key Components

**Dashboard (pages/dashboard/index.tsx)**
- State: contacts array (mock initially, wire real API later)
- State: expandedRowId (track which row is expanded)
- Calculate stats from contacts
- Render sidebar + main area
- Handle CRUD callbacks

**Sidebar**
- Display Paul status with animation
- Show nav badges (calculate counts from contacts)
- Sync button

**TopBar**
- Title and subtitle
- Run Paul button (calls API or triggers state change)
- Refresh button (refetch contacts)

**StatsCard**
- Props: label, value, trend (optional)
- Reusable for all 4 stat cards

**ContactTable**
- Props: contacts array, onEdit, onDelete, onExpand
- Maps contacts to rows
- Renders ContactTableRow for each
- Passes expandedRowId to highlight current

**ContactTableRow**
- Props: contact, isExpanded, onClick
- Shows collapsed view (7 columns)
- Shows badge for status
- Click to toggle expansion

**ExpandedRowDetail**
- Props: contact, onSave, onDelete
- Renders 4 sections (Contact, Pricing, Preferences, Notes)
- Inline editing (click field to edit)
- Save/Cancel buttons

---

## Data Flow

### Initial Load
1. Dashboard loads with **mock data** (10-15 sample contacts)
2. Stats calculated from mock data
3. Table displays collapsed rows

### User Interactions
1. **Click row** → expandedRowId updates → ExpandedRowDetail renders
2. **Click field in expanded view** → Edit mode (input appears)
3. **Edit price/status/notes** → State updates → Save button appears
4. **Click Save** → Callback to Dashboard → State updates
5. **Click Delete** → Confirmation → Contact removed from state
6. **Click Refresh** → Simulated API call (console log for now)

### Future: Wire Real API
- Replace mock data with `fetch('/api/contacts')`
- Edit callbacks become PATCH requests to `/api/contacts/[id]`
- Delete callbacks become DELETE requests
- Refresh becomes refetch from API
- No component changes needed

---

## CRUD Operations

### Create
- Not in initial scope (add new contact manually to state)
- Future: Add form to create new domain entry

### Read
- Display all contacts in table
- Expand row to see full details
- Stats cards calculate derived data (averages, counts)

### Update
- **Inline edit:** Click any field in expanded view to edit
- **Editable fields:** All except Domain (unique key)
- **Status dropdown:** Change with validation
- **Date picker:** For Date Confirmed field
- **Save/Cancel:** Buttons to confirm or discard changes

### Delete
- Red X button in expanded row
- Confirmation dialog: "Delete domain example.com?"
- Remove from state on confirm

---

## Status Badge Colors

| Status | Color | Background |
|--------|-------|------------|
| Pending | #38bdf8 (Blue) | rgba(56,189,248,0.1) |
| Confirmed | #34d399 (Green) | rgba(52,211,153,0.1) |
| No Deal | #f87171 (Red) | rgba(248,113,113,0.1) |
| Negotiation | #a78bfa (Purple) | rgba(167,139,250,0.1) |
| Follow-up | #fbbf24 (Yellow) | rgba(251,191,36,0.1) |

---

## Implementation Notes

### Mock Data
Start with hardcoded array of ~10 sample contacts matching Excel structure:
```typescript
const mockContacts = [
  {
    domain: "example.com",
    niche: "Business",
    priceFromBacklinker: 250,
    email1: "john@example.com",
    name1: "John Doe",
    email2: "jane@example.com",
    name2: "Jane Doe",
    email3: null,
    name3: null,
    status: "pending",
    emailAccount: "outreach@linkops.com",
    currency: "EUR",
    standardPrice: 250,
    gamblingPrice: 350,
    negotiatedPrice: 225,
    acceptCasino: true,
    acceptBetting: false,
    sponsored: false,
    linkTerm: "6 months",
    dateConfirmed: null,
    notes: "Good domain authority",
    contentGuidelines: "Professional tone, 500 words min",
    reply: "pending"
  },
  // ... more entries
]
```

### Styling Approach
- Use Tailwind utility classes
- Create custom CSS for complex animations (blinking dot, expand/collapse)
- Keep component files focused (one responsibility each)

### Animations
- Sidebar Paul indicator: Blinking dot (CSS animation)
- Row expand/collapse: Smooth height transition
- Edit mode: Fade in/out input fields

---

## Success Criteria

✅ Dashboard loads with mock data  
✅ All 4 stats cards display correct calculated values  
✅ Contact table shows collapsed rows with 7 key columns  
✅ Click row to expand shows all 23 fields in organized sections  
✅ Inline edit works (click field, make changes, save)  
✅ Delete removes contact from table  
✅ Status badges color-coded correctly  
✅ Sidebar shows Paul status and nav badges  
✅ Run Paul and Refresh buttons clickable (log action)  
✅ Matches design aesthetic from linkops.html  
✅ Code is component-based, no monolithic file  

---

## Future Enhancements (Not in Scope)

- Wire real API for data (phase 2)
- Create new contact form
- Filter/search by domain or niche
- Bulk actions (select multiple, export to Excel)
- Charts/analytics (pipeline by status, price distribution)
- Mobile responsive version
- Dark/light mode toggle

---

## Dependencies

- React 18+ (already in project)
- TypeScript (already in project)
- Tailwind CSS (already in project)
- Next.js 14 (already in project)

No new dependencies needed.

---

## Timeline Estimate

- **Component structure setup:** 30 min
- **Sidebar component:** 20 min
- **TopBar + StatsCards:** 20 min
- **ContactTable (collapsed view):** 30 min
- **ExpandedRowDetail (expanded view):** 40 min
- **Edit/Delete functionality:** 20 min
- **Styling & polish:** 40 min
- **Testing & bug fixes:** 30 min

**Total:** ~3-4 hours for complete implementation
