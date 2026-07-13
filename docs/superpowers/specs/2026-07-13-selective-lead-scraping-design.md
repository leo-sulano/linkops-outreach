# Selective Lead Scraping — Design

## Problem

The "New Leads" grid on the Leads Overview page (`pages/leads/index.tsx`) lists every affiliate domain that hasn't been scraped yet — whether it's never been queued (`unprocessed`), sitting in the queue (`paused`/`pending`), actively running (`processing`), or needs attention (`needs_review`/`failed`).

"Start Scraping" is all-or-nothing: it flips every `paused` job to `pending`, so the worker eventually processes the entire queue. There's no way to scrape just a handful of specific domains without starting (or having already queued) everything else.

## Goal

Let the user check off specific domains in the New Leads grid and scrape only those, leaving everything else untouched. This is additive to the existing global Start/Stop Scraping controls, which keep working as-is.

## Behavior

- Checking a domain and clicking "Start Selected":
  - If the domain has no job row yet (`unprocessed`) → a new job is created directly as `pending`.
  - If the domain's job is `paused`, `failed`, or `needs_review` → it's flipped to `pending`.
  - If the domain's job is already `pending` or `processing` → left alone (no-op; it's already queued/running).
- Unselected domains are never touched by this action.
- Domains with status `processing` or `completed` are not selectable (no checkbox) — nothing meaningful to do for them.
- Selection persists while paginating through the grid; it resets on a full page reload (client-side state only, nothing persisted server-side).
- The global "Start Scraping" / "Stop Scraping" buttons are unchanged and continue to operate on all jobs.

## Backend

### New endpoint: `pages/api/leads/start-selected.ts`

`POST { domains: string[] }`, auth via `requireApiKey` (same pattern as other `leads` endpoints).

Validates `domains` is a non-empty string array, calls `startSelectedDomains(domains)`, returns `{ resumed, queued }`.

### New repository function: `lib/leads/repository.ts`

```ts
export async function startSelectedDomains(
  domains: string[]
): Promise<{ resumed: number; queued: number }>
```

Logic:
1. Fetch existing `lead_jobs` rows (`domain`, `status`) for the given domains.
2. Partition:
   - `toResume` = domains whose job status is `paused`, `failed`, or `needs_review`.
   - `toQueue` = domains with no job row at all.
   - Everything else (`pending`, `processing`) is skipped.
3. `toResume` → `UPDATE lead_jobs SET status = 'pending', started_at = null WHERE domain IN (...)`.
4. `toQueue` → generate a fresh `runId` (`randomUUID()`) and reuse the existing `insertPendingJobs(runId, toQueue, 'pending')` helper.
5. Return `{ resumed: toResume.length, queued: toQueue.length }`.

This doesn't touch `worker-control.ts` or `isScrapingPaused()` — it's a narrow, additive write path. The worker itself already picks up any `pending` job regardless of how it got there, so no worker changes are needed.

## Frontend

### `components/leads/NewLeadsTable.tsx`

- Add local state: `selected: Set<string>` (domain names).
- `LeadCard` becomes selection-aware:
  - New props: `selectable: boolean`, `isSelected: boolean`, `onToggle: () => void`.
  - `selectable` is `true` for every status except `processing` and `completed`.
  - When `selectable`, render a checkbox in the top-left of the card (overlaying/beside the globe icon).
  - When `isSelected`, apply a highlighted ring/border (e.g. `ring-2 ring-blue-500`) so selection is visually obvious.
- Header row changes:
  - A small "select all eligible on this page" checkbox — toggles selection for every `selectable` card currently rendered on the visible page.
  - When `selected.size > 0`: show a "Clear" text button (empties the selection) and a **"Start Selected (N)"** button, styled consistently with the existing "Process New Leads" button, placed alongside it.
  - "Start Selected" calls a new `onStartSelected(domains: string[]) => Promise<void>` prop with `Array.from(selected)`, shows a loading state on the button while in flight, and clears `selected` on success.

### `pages/leads/index.tsx`

- Add `startSelected(domains: string[])` handler:
  - `POST /api/leads/start-selected` with `{ domains }`.
  - On success, set a status message (e.g. `✓ 2 queued, 1 resumed.`), then `fetchActiveJobs()` and `fetchLeads()` to refresh state.
  - On failure, set an error message, matching the existing handler patterns (`handleProcessLeads`, `startScraping`).
- Pass `onStartSelected={startSelected}` to `<NewLeadsTable>`.

## Edge Cases

- A selected domain transitions to `processing` between render and the click (e.g. picked up by an unrelated global start) — the backend simply no-ops it since its status is no longer `paused`/`failed`/`needs_review`/missing.
- Domains selected on page 1 remain selected when the user navigates to page 2, so "Start Selected (N)" can span multiple pages before being clicked.
- If the user clicks "Start Selected" with zero domains checked, the button is disabled (mirrors existing `disabled` button patterns in this page).
- Interaction with global "Stop Scraping": no special handling needed — a job started via selection is a normal `pending`/`processing` row, so a subsequent global stop pauses it exactly like any other job.

## Out of Scope

- No changes to the worker process itself.
- No "select all across all pages" bulk action beyond per-page select-all — out of scope for this iteration.
- No persistence of selection across a full page reload.

## Testing

Manual verification (no existing automated test coverage for this page):
1. Select 2-3 domains across different statuses (unprocessed, paused, failed if present).
2. Click "Start Selected" and confirm only those flip to `pending`/`processing` in the grid, while unselected domains are unchanged.
3. Confirm a previously-`unprocessed` selected domain gets a `lead_jobs` row created.
4. Confirm global "Start Scraping" / "Stop Scraping" still operate on the full queue unaffected by this change.
