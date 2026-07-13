# Selective Lead Scraping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user check off specific domains in the "New Leads" grid on the Leads Overview page and scrape only those, without disturbing the existing global Start/Stop Scraping behavior.

**Architecture:** A new repository function (`startSelectedDomains`) partitions selected domains into "resume" (existing `paused`/`failed`/`needs_review` jobs flipped to `pending`) and "queue" (domains with no job row yet, inserted directly as `pending`). A thin API route exposes this, and the New Leads grid gains per-card checkboxes plus a "Start Selected" action that calls it.

**Tech Stack:** Next.js API routes, Supabase (via `@supabase/supabase-js`), React (function components + hooks), Tailwind CSS, Jest + ts-jest for backend unit tests.

## Global Constraints

- All new API routes must call `requireApiKey(req, res)` before doing any work, matching every existing `pages/api/leads/*.ts` route.
- `lead_jobs.status` is constrained to the existing enum: `'pending' | 'processing' | 'completed' | 'needs_review' | 'failed' | 'paused'` — do not introduce new status values.
- No new npm dependencies. React Testing Library is not installed and this plan does not add it — frontend/component changes are verified manually in the browser, not with automated tests (this matches the existing codebase: no `.tsx` component in this repo has automated tests today).
- Backend logic (the new repository function) gets a Jest unit test, following the mocking pattern already used in `tests/unit/integrations/supabase.test.ts`.

---

### Task 1: `startSelectedDomains` repository function

**Files:**
- Modify: `lib/leads/repository.ts` (add `randomUUID` import at top, add function at end)
- Test: Create `tests/leads/repository.test.ts`

**Interfaces:**
- Consumes: `getSupabaseAdminClient()` from `@/lib/integrations/supabase` (already imported in this file); `insertPendingJobs(runId: string, domains: string[], status: 'pending' | 'paused')` (already defined in this file, line 118).
- Produces: `startSelectedDomains(domains: string[]): Promise<{ resumed: number; queued: number }>` — consumed by Task 2's API route.

- [ ] **Step 1: Write the failing test**

Create `tests/leads/repository.test.ts`:

```ts
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

let mockExistingJobsData: { domain: string; status: string }[] = []
const mockUpdateIn = jest.fn().mockResolvedValue({ error: null })
const mockInsert = jest.fn().mockResolvedValue({ error: null })

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        in: jest.fn().mockImplementation(() =>
          Promise.resolve({ data: mockExistingJobsData, error: null })
        ),
      })),
      update: jest.fn(() => ({
        in: mockUpdateIn,
      })),
      insert: mockInsert,
    })),
  })),
}))

import { startSelectedDomains } from '@/lib/leads/repository'

describe('startSelectedDomains', () => {
  beforeEach(() => {
    mockExistingJobsData = []
    mockUpdateIn.mockClear()
    mockInsert.mockClear()
  })

  it('queues domains that have no existing job row', async () => {
    mockExistingJobsData = []
    const result = await startSelectedDomains(['new1.com', 'new2.com'])
    expect(result).toEqual({ resumed: 0, queued: 2 })
    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({ domain: 'new1.com', status: 'pending' }),
      expect.objectContaining({ domain: 'new2.com', status: 'pending' }),
    ])
    expect(mockUpdateIn).not.toHaveBeenCalled()
  })

  it('resumes paused, failed, and needs_review domains, and skips pending/processing', async () => {
    mockExistingJobsData = [
      { domain: 'paused.com', status: 'paused' },
      { domain: 'failed.com', status: 'failed' },
      { domain: 'review.com', status: 'needs_review' },
      { domain: 'pending.com', status: 'pending' },
      { domain: 'processing.com', status: 'processing' },
    ]
    const result = await startSelectedDomains([
      'paused.com',
      'failed.com',
      'review.com',
      'pending.com',
      'processing.com',
    ])
    expect(result).toEqual({ resumed: 3, queued: 0 })
    expect(mockUpdateIn).toHaveBeenCalledWith('domain', ['paused.com', 'failed.com', 'review.com'])
    expect(mockInsert).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/leads/repository.test.ts`
Expected: FAIL — `startSelectedDomains` is not exported from `lib/leads/repository.ts`.

- [ ] **Step 3: Write minimal implementation**

At the top of `lib/leads/repository.ts`, change the import line:

```ts
import { getSupabaseAdminClient } from '@/lib/integrations/supabase'
```

to:

```ts
import { randomUUID } from 'crypto'
import { getSupabaseAdminClient } from '@/lib/integrations/supabase'
```

Append this function at the end of `lib/leads/repository.ts` (after `getNewLeads`):

```ts
const RESUMABLE_STATUSES = new Set(['paused', 'failed', 'needs_review'])

// Resumes already-queued (paused/failed/needs_review) domains and queues brand-new
// ones as pending. Domains already pending/processing are left untouched.
export async function startSelectedDomains(
  domains: string[]
): Promise<{ resumed: number; queued: number }> {
  const sb = getSupabaseAdminClient()

  const { data: existingJobs, error: fetchErr } = await sb
    .from('lead_jobs')
    .select('domain, status')
    .in('domain', domains)
  if (fetchErr) throw new Error(`startSelectedDomains fetch: ${fetchErr.message}`)

  const jobStatusMap = new Map((existingJobs ?? []).map((j: any) => [j.domain, j.status]))

  const toResume = domains.filter((d) => RESUMABLE_STATUSES.has(jobStatusMap.get(d) ?? ''))
  const toQueue = domains.filter((d) => !jobStatusMap.has(d))

  if (toResume.length > 0) {
    const { error: resumeErr } = await sb
      .from('lead_jobs')
      .update({ status: 'pending', started_at: null })
      .in('domain', toResume)
    if (resumeErr) throw new Error(`startSelectedDomains resume: ${resumeErr.message}`)
  }

  if (toQueue.length > 0) {
    await insertPendingJobs(randomUUID(), toQueue, 'pending')
  }

  return { resumed: toResume.length, queued: toQueue.length }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/leads/repository.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/leads/repository.ts tests/leads/repository.test.ts
git commit -m "feat: add startSelectedDomains repository function"
```

---

### Task 2: `start-selected` API route

**Files:**
- Create: `pages/api/leads/start-selected.ts`

**Interfaces:**
- Consumes: `requireApiKey(req, res)` from `@/lib/api-auth`; `startSelectedDomains(domains: string[])` from Task 1.
- Produces: `POST /api/leads/start-selected` accepting `{ domains: string[] }`, returning `{ resumed: number; queued: number }` on success — consumed by Task 4's frontend handler.

- [ ] **Step 1: Create the route file**

Create `pages/api/leads/start-selected.ts`:

```ts
import { NextApiRequest, NextApiResponse } from 'next'
import { requireApiKey } from '@/lib/api-auth'
import { startSelectedDomains } from '@/lib/leads/repository'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireApiKey(req, res)) return

  const { domains } = req.body as { domains?: unknown }
  if (
    !Array.isArray(domains) ||
    domains.length === 0 ||
    !domains.every((d) => typeof d === 'string')
  ) {
    return res.status(400).json({ error: 'domains must be a non-empty array of strings' })
  }

  try {
    const { resumed, queued } = await startSelectedDomains(domains)
    return res.status(200).json({ resumed, queued })
  } catch (err: any) {
    console.error('[leads/start-selected]', err)
    return res.status(500).json({ error: err.message ?? 'Internal server error' })
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: No new errors introduced by this file.

- [ ] **Step 3: Commit**

```bash
git add pages/api/leads/start-selected.ts
git commit -m "feat: add start-selected API route"
```

---

### Task 3: Selectable `LeadCard` + selection UI in `NewLeadsTable`

**Files:**
- Modify: `components/leads/NewLeadsTable.tsx`

**Interfaces:**
- Consumes: none new (pure UI state).
- Produces: `NewLeadsTable` now accepts an additional required prop `onStartSelected: (domains: string[]) => Promise<void>` — consumed by Task 4's page component.

- [ ] **Step 1: Add selectable-status set and update imports**

In `components/leads/NewLeadsTable.tsx`, change the top import line:

```ts
import { RefreshCw, ChevronLeft, ChevronRight, Globe } from 'lucide-react'
```

to:

```ts
import { RefreshCw, ChevronLeft, ChevronRight, Globe, Square, CheckSquare } from 'lucide-react'
```

Add this constant right after the `STATUS_ORDER` block (after line 21, before `VERTICAL_STYLES`):

```ts
const SELECTABLE_STATUSES = new Set(['unprocessed', 'paused', 'pending', 'needs_review', 'failed'])
```

- [ ] **Step 2: Make `LeadCard` selection-aware**

Replace the entire `LeadCard` function with:

```tsx
function LeadCard({
  lead,
  selected,
  onToggle,
}: {
  lead: NewLead
  selected: boolean
  onToggle: () => void
}) {
  const host = lead.domain.trim().replace(/^www\./, '')
  const isActive = lead.status === 'processing'
  const selectable = SELECTABLE_STATUSES.has(lead.status)

  return (
    <div
      className={`group relative bg-slate-900 border rounded-2xl p-4 flex flex-col gap-3 transition-all duration-200 cursor-default ${
        selected
          ? 'border-blue-500 ring-2 ring-blue-500/50 bg-slate-800/80'
          : isActive
          ? 'border-blue-500/60 bg-slate-800/80'
          : 'border-slate-800 hover:border-slate-600 hover:bg-slate-800/60'
      }`}
      style={isActive ? { animation: 'breathe 2.4s ease-in-out infinite' } : {}}
    >
      {selectable && (
        <button
          onClick={onToggle}
          aria-label={selected ? 'Deselect domain' : 'Select domain'}
          className="absolute top-3 right-3 text-slate-500 hover:text-blue-400 transition-colors"
        >
          {selected ? (
            <CheckSquare className="w-4 h-4 text-blue-400" />
          ) : (
            <Square className="w-4 h-4" />
          )}
        </button>
      )}

      {/* Top row: globe icon + domain */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 shrink-0 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center group-hover:border-slate-600 transition-colors">
          <Globe
            className={`w-3.5 h-3.5 transition-colors ${isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-400'}`}
            style={isActive ? { animation: 'spin-slow 2.8s linear infinite' } : {}}
          />
        </div>
        <p className="text-sm font-semibold text-slate-200 truncate whitespace-nowrap leading-snug pr-5">{host}</p>
      </div>

      {/* Bottom: vertical left, status right */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-800">
        <VerticalTag vertical={lead.vertical} />
        <StatusIndicator status={lead.status} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add selection state and handlers to `NewLeadsTable`**

Replace the `NewLeadsTable` function signature and its opening state block:

```tsx
export function NewLeadsTable({
  leads,
  isProcessing,
  onProcess,
}: {
  leads: NewLead[]
  isProcessing: boolean
  onProcess: () => void
}) {
  const [page, setPage] = useState(0)
```

with:

```tsx
export function NewLeadsTable({
  leads,
  isProcessing,
  onProcess,
  onStartSelected,
}: {
  leads: NewLead[]
  isProcessing: boolean
  onProcess: () => void
  onStartSelected: (domains: string[]) => Promise<void>
}) {
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isStarting, setIsStarting] = useState(false)
```

Immediately after the existing `pageLeads` line (`const pageLeads = sorted.slice(...)`), add:

```tsx
  const pageSelectableDomains = pageLeads
    .filter((l) => SELECTABLE_STATUSES.has(l.status))
    .map((l) => l.domain)
  const allPageSelected =
    pageSelectableDomains.length > 0 && pageSelectableDomains.every((d) => selected.has(d))

  function toggleDomain(domain: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(domain)) next.delete(domain)
      else next.add(domain)
      return next
    })
  }

  function toggleSelectAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allPageSelected) {
        pageSelectableDomains.forEach((d) => next.delete(d))
      } else {
        pageSelectableDomains.forEach((d) => next.add(d))
      }
      return next
    })
  }

  async function handleStartSelected() {
    setIsStarting(true)
    try {
      await onStartSelected(Array.from(selected))
      setSelected(new Set())
    } finally {
      setIsStarting(false)
    }
  }
```

- [ ] **Step 4: Add selection controls to the header and wire `LeadCard`**

Replace the header `<div className="flex items-center justify-between mb-5">...</div>` block with:

```tsx
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-100">New Leads</h2>
          <p className="text-xs text-slate-500 mt-0.5">{sorted.length} domains to process</p>
        </div>
        <div className="flex items-center gap-3">
          {pageSelectableDomains.length > 0 && (
            <button
              onClick={toggleSelectAllOnPage}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              {allPageSelected ? (
                <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
              Select all on page
            </button>
          )}

          {selected.size > 0 && (
            <>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                Clear ({selected.size})
              </button>
              <button
                onClick={handleStartSelected}
                disabled={isStarting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isStarting ? 'animate-spin' : ''}`} />
                {isStarting ? 'Starting…' : `Start Selected (${selected.size})`}
              </button>
            </>
          )}

          <button
            onClick={onProcess}
            disabled={isProcessing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
            {isProcessing ? 'Processing…' : 'Process New Leads'}
          </button>
        </div>
      </div>
```

Then update the card-rendering map to pass the new props:

```tsx
            {pageLeads.map((lead) => (
              <LeadCard
                key={lead.domain}
                lead={lead}
                selected={selected.has(lead.domain)}
                onToggle={() => toggleDomain(lead.domain)}
              />
            ))}
```

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: Fails only on `pages/leads/index.tsx` (missing `onStartSelected` prop — fixed in Task 4), no other errors. If Task 4 hasn't been done yet, this is expected; proceed to Task 4 before committing.

- [ ] **Step 6: Commit** (after Task 4 makes the type-check pass — see Task 4 Step 3)

---

### Task 4: Wire `startSelected` handler into the Leads Overview page

**Files:**
- Modify: `pages/leads/index.tsx`

**Interfaces:**
- Consumes: `NewLeadsTable` now requires `onStartSelected` prop (Task 3); `POST /api/leads/start-selected` (Task 2).
- Produces: none (top-level page).

- [ ] **Step 1: Add the `startSelected` handler**

In `pages/leads/index.tsx`, immediately after the `stopScraping` function (after its closing `}` around line 202), add:

```tsx
  async function startSelected(domains: string[]) {
    setMessage(null)
    try {
      const res = await fetch('/api/leads/start-selected', {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify({ domains }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage(`Failed to start selected domains: ${data.error ?? res.statusText}`)
        return
      }
      const parts: string[] = []
      if (data.queued > 0) parts.push(`${data.queued} queued`)
      if (data.resumed > 0) parts.push(`${data.resumed} resumed`)
      setMessage(
        parts.length > 0
          ? `✓ ${parts.join(', ')}.`
          : 'Selected domains are already queued or running.'
      )
      fetchActiveJobs()
      fetchLeads()
    } catch {
      setMessage('Failed to start selected domains.')
    }
  }
```

- [ ] **Step 2: Pass the handler to `NewLeadsTable`**

Change:

```tsx
      <div className="mt-6">
        <NewLeadsTable
          leads={mergedLeads}
          isProcessing={isProcessing}
          onProcess={handleProcessLeads}
        />
      </div>
```

to:

```tsx
      <div className="mt-6">
        <NewLeadsTable
          leads={mergedLeads}
          isProcessing={isProcessing}
          onProcess={handleProcessLeads}
          onStartSelected={startSelected}
        />
      </div>
```

- [ ] **Step 3: Type-check and commit**

Run: `npm run type-check`
Expected: PASS, no errors.

```bash
git add components/leads/NewLeadsTable.tsx pages/leads/index.tsx
git commit -m "feat: add selective lead scraping UI"
```

---

### Task 5: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite and type-check**

Run: `npx jest`
Expected: All tests pass, including the new `tests/leads/repository.test.ts`.

Run: `npm run type-check`
Expected: No errors.

- [ ] **Step 2: Start the dev server**

Run: `npm run dev`
Open: `http://localhost:3000/leads`

- [ ] **Step 3: Verify selection UI**

- Confirm a checkbox (square icon) appears on cards with status `paused`/`unprocessed`/`needs_review`/`failed`, and does **not** appear on any `processing` or `completed` cards.
- Click 2-3 checkboxes on different domains; confirm each selected card gets a blue ring and the header shows "Clear (N)" and "Start Selected (N)" with the correct count.
- Navigate to page 2 (if more than 24 new leads exist) and confirm the page-1 selections are still counted in "Start Selected (N)".

- [ ] **Step 4: Verify selective start behavior**

- Note the domains you selected and their current status in Supabase (`lead_jobs` table) or via the UI.
- Click "Start Selected (N)".
- Confirm the status message shows a correct queued/resumed breakdown (e.g. "✓ 1 queued, 2 resumed.").
- Confirm only the selected domains transition toward `pending`/`processing` (refresh the page or watch the live status dot) while all unselected domains remain in their prior state (e.g. still `paused`).
- Confirm the selection is cleared after the action completes.

- [ ] **Step 5: Verify global controls are unaffected**

- Click the existing "Stop Scraping" button and confirm it still pauses everything (pending + processing), not just the previously-selected subset.
- Click "Start Scraping" and confirm it still resumes all paused jobs, matching its pre-existing behavior.
