# Design: Permanent Fix for Scraping Worker Getting Stuck

**Date:** 2026-06-23  
**Status:** Approved  
**Files affected:** `worker/scraper.ts`, `worker/index.ts`

---

## Problem

The scraping worker periodically gets stuck for hours without making progress. Four root causes were identified:

| # | Root Cause | Symptom |
|---|-----------|---------|
| 1 | `isDriverError` infinite requeue loop | Driver init failure requeues job with no retry penalty → loops forever |
| 2 | `Promise.race` timeout doesn't kill Chrome | Chrome stays alive after timeout fires; processes accumulate and starve new jobs |
| 3 | `Builder.build()` has no timeout | Selenium Manager can hang indefinitely downloading ChromeDriver |
| 4 | No self-healing mechanism | Worker stuck state requires manual intervention to resolve |

Cause #1 was already patched (driver errors now count toward the retry budget). This spec covers causes #2, #3, and #4.

---

## Solution: Approach A — AbortSignal + Build Timeout + Watchdog

### Why this approach

- Surgical: changes confined to two existing files, no new files or dependencies
- Leverages PM2's existing `autorestart: true` for the watchdog recovery
- Doesn't add global state beyond a single module-level timestamp

---

## Design

### 1. `worker/scraper.ts` — AbortSignal + Build Timeout

#### Signature change

```typescript
export async function scrapeDomain(
  domain: string,
  onPageVisit?: (path: string) => Promise<void> | void,
  signal?: AbortSignal,          // NEW
): Promise<ScrapeResult & { captchaRequired?: boolean }>
```

#### Build timeout (fixes cause #3)

Each `Builder.build()` attempt is wrapped in `Promise.race` with a 30-second timer:

```typescript
driver = await Promise.race([
  new Builder().forBrowser(Browser.CHROME).setChromeOptions(options).build(),
  new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error('unable to obtain browser driver: build timed out after 30s')),
      30_000
    )
  ),
])
```

The error message prefix `"unable to obtain browser driver"` ensures the existing `isDriverError` handler in `worker/index.ts` catches it and counts it against the retry budget.

#### Abort handler (fixes cause #2)

Registered immediately after a driver is successfully built:

```typescript
const abortHandler = () => { driver?.quit().catch(() => {}) }
signal?.addEventListener('abort', abortHandler, { once: true })
```

When the abort signal fires, `driver.quit()` is called immediately — Chrome is killed right then.

#### Fast exit from loops

Each page-visit loop checks `signal?.aborted` at the top of each iteration:

```typescript
for (const subpath of STATIC_SUBPAGES.slice(1)) {
  if (signal?.aborted || hasEnoughData(...)) break
  // ...
}
```

`visitPage` also checks the signal before navigating:

```typescript
const visitPage = async (url: string, isHomepage: boolean) => {
  if (signal?.aborted) throw new Error('Job timed out')
  // ...
}
```

#### Propagate abort as error

After the loops, if the signal was aborted, throw so the caller knows this wasn't normal completion:

```typescript
if (signal?.aborted) throw new Error('Job timed out')
return { html: homepageHtml, ... }
```

#### Cleanup in finally

```typescript
} finally {
  signal?.removeEventListener('abort', abortHandler)
  await driver!.quit().catch(() => {})   // safe no-op if already quit
}
```

---

### 2. `worker/index.ts` — Timeout in `processJob` + Watchdog

#### Timeout ownership moves into `processJob` (fixes cause #2)

`processJob` creates its own `AbortController` and 5-minute timer:

```typescript
const controller = new AbortController()
const timeoutId = setTimeout(() => controller.abort(), JOB_TIMEOUT_MS)
```

The signal is passed to `scrapeDomain`. The catch block checks `controller.signal.aborted` first:

```typescript
} catch (err: any) {
  if (controller.signal.aborted) {
    // handle timeout: update DB to pending/failed, return
    return
  }
  // existing error handling below
} finally {
  clearTimeout(timeoutId)
}
```

The `withTimeout` helper function is deleted — its logic now lives inside `processJob`.

#### `pollLoop` simplification

```typescript
await Promise.all(
  jobs.map((job) => processJob(job).catch((err) => {
    console.error(`[worker] ${job.domain} unhandled error: ${err?.message ?? err}`)
  }))
)
```

#### In-process watchdog (fixes cause #4)

Module-level tracking variable:

```typescript
let lastJobTerminatedAt = Date.now()
```

Updated inside `processJob` whenever any job reaches a terminal state (completed, failed, needs_review, or timed-out-to-failed).

Reset in `pollLoop` when no pending jobs exist (avoids false triggers during idle periods):

```typescript
if (jobs.length === 0) {
  lastJobTerminatedAt = Date.now()
  await sleep(POLL_INTERVAL_MS)
  continue
}
```

Checked each poll iteration when jobs are present:

```typescript
const WATCHDOG_MS = 30 * 60 * 1_000  // 30 min
if (Date.now() - lastJobTerminatedAt > WATCHDOG_MS) {
  console.error('[worker] No job completed in 30 min — exiting for PM2 restart')
  process.exit(1)
}
```

`process.exit(1)` triggers PM2's `autorestart: true`, restarting the worker within 5 seconds (per `restart_delay: 5000`). The lock file is cleaned up via the existing `process.on('exit', removeLock)` handler in `start.js`.

---

## Error Handling

- `driver.quit()` calls in the abort handler and finally block always use `.catch(() => {})` — a quit failure must never crash the worker.
- The `abortHandler` is removed from the signal listener in `finally` to prevent memory leaks.
- The build timeout error message matches the `isDriverError` pattern so retry budget is consumed correctly (max 3 attempts before the job fails permanently).

---

## What Is NOT Changed

- `CONCURRENCY`, `MAX_RETRIES`, `JOB_TIMEOUT_MS`, `STUCK_JOB_THRESHOLD_MS` — unchanged
- `resetStuckJobs` — unchanged (still runs every 12 iterations as a secondary safety net)
- `claimPendingJobs` — unchanged
- PM2 config — unchanged (`autorestart: true` already handles the watchdog restart)
- The public return type of `scrapeDomain` — unchanged

---

## Success Criteria

- A Chrome hang no longer causes the worker to spin for hours — the 5-min abort kills Chrome and the job is requeued/failed within that window
- Selenium Manager hangs fail within 30 seconds per attempt, within 5 minutes total (3 attempts)
- If the worker somehow gets stuck despite all guards, PM2 restarts it within 30 minutes + 5 seconds automatically
- No manual intervention required for any of these failure modes
