# Worker Stuck Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permanently prevent the scraping worker from spinning for hours by killing Chrome on timeout, adding a build timeout, and adding a self-healing watchdog that triggers a PM2 restart.

**Architecture:** Pass an `AbortSignal` into `scrapeDomain` so the active Chrome driver is force-quit the moment the 5-minute job timeout fires. Wrap `Builder.build()` in a 30-second per-attempt timeout. Move timeout ownership from the poll loop into `processJob`. Add a module-level watchdog that calls `process.exit(1)` (triggering PM2 autorestart) if no job terminates for 30 minutes while a job is in processing state.

**Tech Stack:** TypeScript, Selenium WebDriver 4.x, Supabase, PM2

## Global Constraints

- No new npm dependencies — use only what is already in `worker/package.json`
- `AbortSignal` is a Node.js built-in — no import needed
- `driver.quit()` must always be called with `.catch(() => {})` — a quit failure must never crash the worker
- Error message for build timeout must include `"unable to obtain browser driver"` so the existing `isDriverError` handler catches it
- `JOB_TIMEOUT_MS = 5 * 60 * 1_000` and `MAX_RETRIES = 3` remain unchanged
- `WATCHDOG_MS = 30 * 60 * 1_000` (30 minutes)
- All edits stay inside `worker/scraper.ts` and `worker/index.ts`

---

### Task 1: Add AbortSignal + Build Timeout to `scrapeDomain`

**Files:**
- Modify: `worker/scraper.ts`

**Interfaces:**
- Produces: `scrapeDomain(domain, onPageVisit?, signal?)` — third parameter is optional `AbortSignal`; consumers that don't pass it get identical behaviour

---

- [ ] **Step 1: Add `signal` parameter to the function signature**

In `worker/scraper.ts`, change line 190–193 from:

```typescript
export async function scrapeDomain(
  domain: string,
  onPageVisit?: (path: string) => Promise<void> | void,
): Promise<ScrapeResult & { captchaRequired?: boolean }> {
```

To:

```typescript
export async function scrapeDomain(
  domain: string,
  onPageVisit?: (path: string) => Promise<void> | void,
  signal?: AbortSignal,
): Promise<ScrapeResult & { captchaRequired?: boolean }> {
```

---

- [ ] **Step 2: Wrap `Builder.build()` in a 30-second timeout**

In `worker/scraper.ts`, change the retry loop (lines 219–230) from:

```typescript
  let driver: WebDriver | null = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      driver = await new Builder()
        .forBrowser(Browser.CHROME)
        .setChromeOptions(options)
        .build()
      break
    } catch (err: any) {
      if (attempt === 3) throw err
      await sleep(2_000 * attempt)
    }
  }
  if (!driver) throw new Error('Failed to build WebDriver after 3 attempts')
```

To:

```typescript
  let driver: WebDriver | null = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (signal?.aborted) throw new Error('Job timed out')
    try {
      driver = await Promise.race([
        new Builder().forBrowser(Browser.CHROME).setChromeOptions(options).build(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('unable to obtain browser driver: build timed out after 30s')),
            30_000
          )
        ),
      ])
      break
    } catch (err: any) {
      if (attempt === 3) throw err
      await sleep(2_000 * attempt)
    }
  }
  if (!driver) throw new Error('Failed to build WebDriver after 3 attempts')
```

---

- [ ] **Step 3: Register abort handler immediately after driver is built**

In `worker/scraper.ts`, insert two lines immediately after `if (!driver) throw new Error(...)` (before `await driver.manage().setTimeouts(...)`):

```typescript
  const abortHandler = () => { driver?.quit().catch(() => {}) }
  signal?.addEventListener('abort', abortHandler, { once: true })
```

---

- [ ] **Step 4: Check signal at the start of `visitPage`**

In `worker/scraper.ts`, inside the `visitPage` inner function, add a signal check as the very first line (before the `try { const path = ...` block):

```typescript
    const visitPage = async (url: string, isHomepage: boolean) => {
      if (signal?.aborted) throw new Error('Job timed out')
      try {
        const path = isHomepage ? '/' : (new URL(url).pathname || '/')
        await onPageVisit?.(path)
      } catch { /* non-critical */ }
      // ... rest unchanged
```

---

- [ ] **Step 5: Add signal check to the static-subpages loop**

In `worker/scraper.ts`, change the static-subpages loop condition from:

```typescript
    for (const subpath of STATIC_SUBPAGES.slice(1)) {
      if (hasEnoughData(homepageHtml, allText, contactPageText, allLinks)) break
```

To:

```typescript
    for (const subpath of STATIC_SUBPAGES.slice(1)) {
      if (signal?.aborted || hasEnoughData(homepageHtml, allText, contactPageText, allLinks)) break
```

---

- [ ] **Step 6: Add signal check to the discovered-pages loop**

In `worker/scraper.ts`, change the discovered-pages loop condition from:

```typescript
    for (const url of discoveredPaths) {
      if (hasEnoughData(homepageHtml, allText, contactPageText, allLinks)) break
```

To:

```typescript
    for (const url of discoveredPaths) {
      if (signal?.aborted || hasEnoughData(homepageHtml, allText, contactPageText, allLinks)) break
```

---

- [ ] **Step 7: Propagate abort as an error after the loops**

In `worker/scraper.ts`, insert a guard immediately before the final `return` statement (after the discovered-pages loop, still inside the outer `try` block):

```typescript
    if (signal?.aborted) throw new Error('Job timed out')
```

So the end of the `try` block reads:

```typescript
    // --- Discovered pages ---
    for (const url of discoveredPaths) {
      if (signal?.aborted || hasEnoughData(homepageHtml, allText, contactPageText, allLinks)) break
      try {
        await visitPage(url, false)
      } catch { /* skip */ }
    }
  } finally {
    signal?.removeEventListener('abort', abortHandler)
    await driver!.quit().catch(() => {})
  }

  if (signal?.aborted) throw new Error('Job timed out')

  return {
    html: homepageHtml,
    text: allText.join('\n\n'),
    contactText: contactPageText.join('\n\n'),
    links: Array.from(allLinks),
  }
```

---

- [ ] **Step 8: Update the `finally` block to clean up the abort listener and use safe quit**

In `worker/scraper.ts`, change the `finally` block from:

```typescript
  } finally {
    await driver!.quit()
  }
```

To:

```typescript
  } finally {
    signal?.removeEventListener('abort', abortHandler)
    await driver!.quit().catch(() => {})
  }
```

---

- [ ] **Step 9: Verify the TypeScript compiles**

```bash
cd worker && npx tsc --noEmit
```

Expected: no errors. Fix any type errors before continuing.

---

- [ ] **Step 10: Commit**

```bash
rtk git add worker/scraper.ts
rtk git commit -m "fix: add AbortSignal and build timeout to scrapeDomain"
```

---

### Task 2: Move Timeout into `processJob` + Add Watchdog

**Files:**
- Modify: `worker/index.ts`

**Interfaces:**
- Consumes: `scrapeDomain(domain, onPageVisit, signal)` from Task 1 — passes `controller.signal` as third arg
- The `withTimeout` function is deleted in this task

---

- [ ] **Step 1: Add module-level watchdog variables**

In `worker/index.ts`, after the existing constants (`POLL_INTERVAL_MS`, `DOMAIN_DELAY_MS`, etc.) and before `getSupabase()`, add:

```typescript
const WATCHDOG_MS = 30 * 60 * 1_000
let lastJobTerminatedAt = Date.now()
```

---

- [ ] **Step 2: Delete the `withTimeout` function**

Remove the entire `withTimeout` function from `worker/index.ts` (currently lines 280–287):

```typescript
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Job timed out after ${ms / 1000}s: ${label}`)), ms)
    ),
  ])
}
```

---

- [ ] **Step 3: Add AbortController + timeout to `processJob`**

In `worker/index.ts`, replace the opening of `processJob` from:

```typescript
async function processJob(job: {
  id: string
  domain: string
  retry_count: number
}) {
  const sb = getSupabase()
  console.log(`[worker] Processing ${job.domain} (attempt ${job.retry_count + 1})`)

  try {
```

To:

```typescript
async function processJob(job: {
  id: string
  domain: string
  retry_count: number
}) {
  const sb = getSupabase()
  console.log(`[worker] Processing ${job.domain} (attempt ${job.retry_count + 1})`)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), JOB_TIMEOUT_MS)

  try {
```

---

- [ ] **Step 4: Pass `controller.signal` to `scrapeDomain`**

In `worker/index.ts`, inside `processJob`'s `try` block, change the `scrapeDomain` call from:

```typescript
    const { html, text, contactText, links, captchaRequired } = await scrapeDomain(
      job.domain,
      async (path) => {
        await sb.from('lead_jobs').update({ current_page: path }).eq('id', job.id)
      },
    )
```

To:

```typescript
    const { html, text, contactText, links, captchaRequired } = await scrapeDomain(
      job.domain,
      async (path) => {
        await sb.from('lead_jobs').update({ current_page: path }).eq('id', job.id)
      },
      controller.signal,
    )
```

---

- [ ] **Step 5: Handle abort at the top of the `catch` block**

In `worker/index.ts`, at the very start of `processJob`'s `catch` block, insert the abort handler before any existing error handling:

```typescript
  } catch (err: any) {
    if (controller.signal.aborted) {
      const msg = `Job timed out after ${JOB_TIMEOUT_MS / 1000}s: ${job.domain}`
      console.error(`[worker] ${job.domain} timed out`)
      const newRetry = job.retry_count + 1
      const isLastRetry = newRetry >= MAX_RETRIES
      await sb
        .from('lead_jobs')
        .update({
          status: isLastRetry ? 'failed' : 'pending',
          retry_count: newRetry,
          error_log: msg,
          started_at: null,
        })
        .eq('id', job.id)
        .eq('status', 'processing')
      return
    }

    const msg = err?.message ?? String(err)
    // ... rest of existing catch body unchanged ...
```

---

- [ ] **Step 6: Add `finally` block to `processJob` to clear timeout and update watchdog**

In `worker/index.ts`, close `processJob` with a `finally` block that clears the timeout and updates `lastJobTerminatedAt`:

```typescript
  } finally {
    clearTimeout(timeoutId)
    lastJobTerminatedAt = Date.now()
  }
}
```

The full end of the function should look like:

```typescript
    // ... existing catch body (isDriverError, retry handling, etc.) ...
  } finally {
    clearTimeout(timeoutId)
    lastJobTerminatedAt = Date.now()
  }
}
```

---

- [ ] **Step 7: Simplify `pollLoop` — remove `withTimeout` wrapper**

In `worker/index.ts`, inside `pollLoop`, replace the `await Promise.all(jobs.map(...withTimeout...))` block with:

```typescript
      await Promise.all(
        jobs.map((job) =>
          processJob(job).catch((err) => {
            console.error(`[worker] ${job.domain} unhandled error: ${err?.message ?? err}`)
          })
        )
      )
```

---

- [ ] **Step 8: Add watchdog check to the idle branch of `pollLoop`**

In `worker/index.ts`, inside `pollLoop`, update the `else` branch (no pending jobs) to include the watchdog:

```typescript
    } else {
      if (Date.now() - lastJobTerminatedAt > WATCHDOG_MS) {
        const sbWd = getSupabase()
        const { count } = await sbWd
          .from('lead_jobs')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'processing')
        if ((count ?? 0) > 0) {
          console.error('[worker] No job terminated in 30 min with active processing job — exiting for PM2 restart')
          process.exit(1)
        }
        lastJobTerminatedAt = Date.now()  // truly idle — reset so we don't query DB every poll
      }
      await sleep(POLL_INTERVAL_MS)
    }
```

---

- [ ] **Step 9: Verify the TypeScript compiles**

```bash
cd worker && npx tsc --noEmit
```

Expected: no errors. Fix any type errors before continuing.

---

- [ ] **Step 10: Verify `pollLoop` structure is intact**

Read the full `pollLoop` function and confirm it follows this structure:

```
while (true) {
  loopIteration++
  sendHeartbeat()
  if (loopIteration % 12 === 0) resetStuckJobs()

  const jobs = claimPendingJobs(CONCURRENCY)

  if (jobs.length > 0) {
    Promise.all(jobs.map(job => processJob(job).catch(...)))
    sleep(DOMAIN_DELAY_MS)
  } else {
    [watchdog check]
    sleep(POLL_INTERVAL_MS)
  }
}
```

---

- [ ] **Step 11: Commit**

```bash
rtk git add worker/index.ts
rtk git commit -m "fix: move job timeout into processJob with AbortSignal, add 30-min watchdog"
```

---

### Task 3: Manual Verification

**Files:** None (read-only verification)

---

- [ ] **Step 1: Confirm the build timeout error is caught by `isDriverError`**

In `worker/index.ts`, verify that `isDriverError` check reads:

```typescript
const isDriverError = msg.toLowerCase().includes('unable to obtain browser driver')
```

And confirm the build timeout error message (from Task 1, Step 2) starts with:

```
'unable to obtain browser driver: build timed out after 30s'
```

These must match — `.toLowerCase().includes('unable to obtain browser driver')` must be `true` for the build timeout error.

---

- [ ] **Step 2: Confirm `abortHandler` is in scope in the `finally` block**

In `worker/scraper.ts`, trace the scope:

- `abortHandler` is declared with `const` at function body scope (outside the `try` block)
- The `finally` block is at the same function body scope
- Therefore `signal?.removeEventListener('abort', abortHandler)` in `finally` resolves correctly ✓

---

- [ ] **Step 3: Confirm PM2 config will restart on `process.exit(1)`**

Read `worker/ecosystem.config.js` and confirm:

```js
autorestart: true,
max_restarts: 10,
restart_delay: 5000,
```

`autorestart: true` means PM2 restarts on any non-zero exit code. `process.exit(1)` in the watchdog triggers this within 5 seconds. ✓

---

- [ ] **Step 4: Smoke-test the worker start**

Stop the current PM2 instance, then restart:

```bash
pm2 stop lead-worker
pm2 start worker/ecosystem.config.js
pm2 logs lead-worker --lines 20
```

Expected: `[worker] Starting poll loop (concurrency: 1)...` and heartbeat lines, no TypeScript errors.

---

- [ ] **Step 5: Commit verification note**

```bash
rtk git commit --allow-empty -m "chore: verified worker stuck fix — build timeout, abort signal, watchdog all confirmed"
```
