# All Contacts Modal Design

**Date:** 2026-04-29  
**Status:** Approved

## Summary

Make the "All Contacts" sidebar badge clickable. Clicking it opens a full-screen modal overlay showing all contacts in the same table view as the main dashboard.

## Problem

The "All Contacts" badge in the sidebar currently displays a total count of all synced contacts (from Google Sheets via Supabase) but has no click action. Users cannot view the actual contact list from it.

## Design

### Trigger

The "All Contacts" item in `components/dashboard/Sidebar.tsx` becomes clickable. The existing `navItem` click handler is extended to emit an `onAllContactsClick` callback when the `all` stage is selected.

### Modal Behavior

- Opens as a full-screen overlay (~95% width and height) centered over the dashboard
- Header: "All Contacts" title + total count (e.g. "1,000 contacts") + X close button
- Body: existing `ContactTable` with all contacts passed in, using the `all` stage column set
- Clicking a contact row opens the existing `EditContactModal` (no changes needed)
- Close: X button or Escape key dismisses the modal

### Data Flow

No new data fetching. The dashboard already holds all contacts in state. The modal receives them as a prop directly.

### Components

| Component | Action |
|-----------|--------|
| `components/dashboard/AllContactsModal.tsx` | New — ~50-line wrapper modal |
| `components/dashboard/Sidebar.tsx` | Add `onAllContactsClick` prop + call it |
| `pages/dashboard/index.tsx` | Add `showAllContacts` boolean state, pass data and handler to modal |
| `ContactTable`, `ContactTableRow`, `EditContactModal` | No changes |

## Out of Scope

- Search or filtering within the modal
- Pagination (uses existing table scroll)
- New data fetching or API changes
