# LinkOps Worker — EC2 Deployment Runbook

Deployment, update, and housekeeping guide for the `linkops-worker` process (the lead-scraping
worker in `worker/`), which runs on the `scraper-leo` EC2 instance — **shared** with the
Forums Dashboard project. This doc covers the LinkOps side only; for the box's other tenant,
see that project's `docs/ec2-scraper-runbook.md`.

---

## Why this box, and why it's safe to share

Deployed 2026-08-14. `scraper-leo` already existed as a scraping box for Forums Dashboard, was
already running 24/7, and had spare capacity — so instead of paying for and standing up a second
EC2 instance, LinkOps' worker was added as a second, fully isolated tenant on the same box.

This is a deliberate cost/risk tradeoff, revisited below in [When to reconsider](#when-to-reconsider-a-dedicated-box).
It works because:

- **LinkOps' actual load is low** — expected ~2-3 scrape runs a month, one domain at a time
  (`CONCURRENCY = 1` in `worker/index.ts`), not continuous high-volume scraping.
- **Nothing is shared at the file level** — see [Isolation](#isolation-from-forums-dashboard) below.
- **A time-based guard prevents the one collision risk that actually matters** — see
  [Co-tenancy guard](#co-tenancy-guard).

---

## Instance details

Same physical box as Forums Dashboard — see that project's runbook for the authoritative table.
Summary relevant to LinkOps:

| Field | Value |
|---|---|
| Instance name | scraper-leo |
| Public IP | 54.179.186.205 (changes on stop/start — see Forums Dashboard runbook's Elastic IP section) |
| Region | ap-southeast-1 (Singapore) |
| Type | **t2.small** — 1 vCPU (burstable/T2, not dedicated), 2 GiB RAM (1.9 GiB usable), 8 GB root EBS volume |
| OS | Amazon Linux 2023 |
| Key file | `C:\Users\Leo\OneDrive\Documents\leoscraper\leoscraper.pem` |
| Cost | ~$0.023/hour (t2.small on-demand, ap-southeast-1) — shared with Forums Dashboard, no marginal cost added |

**t2.small is burstable, not dedicated** — worth understanding before debugging odd slowness.
Baseline CPU is ~20% of one core; the instance earns "CPU credits" while idle and spends them
under load. Sustained load from *either* project draws down the same shared credit balance —
if it's ever exhausted, both processes get throttled, not crashed, which can look like
unexplained slowness rather than an obvious failure.

---

## Connecting

```bash
ssh -i "C:\Users\Leo\OneDrive\Documents\leoscraper\leoscraper.pem" ec2-user@54.179.186.205
```

This is the exact same key and host as Forums Dashboard's runbook — one SSH credential, one
`ec2-user` account, shared by both projects' deploy workflows. If the IP has changed (happens on
every stop/start), get the current one from AWS Console → EC2 → Instances → `scraper-leo`.

---

## Isolation from Forums Dashboard

Everything LinkOps needs lives under one directory, touching nothing that belongs to the other
project:

```
~/linkops-worker/
├── .env.local              # LinkOps' own Supabase/Sheets/OpenAI/Gemini/2captcha creds
├── package.json            # only dependency: googleapis (for lib/leads/* resolution — see below)
├── node_modules/
├── lib/leads/
│   ├── sheets-service.ts
│   └── enrichment.ts
└── worker/
    ├── index.ts, scraper.ts, challenges.ts, linkedin.ts, ai-extract.ts, ai-research.ts
    ├── package.json         # full worker dependency list
    └── node_modules/
```

Never touched by this deployment: Forums Dashboard's `~/*.py`, `~/.env`, its crontab, or
`status_server.py`. Confirmed after initial deploy — crontab, running process PID, and `.env`
checksum all matched pre-deployment state.

**Why two `node_modules` / two `package.json`?** `worker/index.ts` imports from `../lib/leads/`
via a relative path (same as it does locally). Node's module resolution walks *up* from
`lib/leads/sheets-service.ts` looking for `node_modules` — it never finds `worker/node_modules`
because that's a sibling, not an ancestor. So `googleapis` (the one dependency `lib/leads/`
needs) is installed a second time at `~/linkops-worker/` itself. This mirrors the local repo's
actual layout, just without the rest of the Next.js app.

**Process isolation**: LinkOps runs as its own PM2 process, `linkops-worker`, in the same PM2
daemon Forums Dashboard's tooling doesn't use (their Python processes run via cron + `nohup`,
not PM2) — so there's no shared PM2 config to conflict over either.

---

## Co-tenancy guard

`scraper-leo` has a documented history of crashing under **concurrent Chrome load** (Forums
Dashboard's runbook, "Task 128") — which is exactly the risk two independent scrapers on one
box reintroduces. `worker/index.ts` has a built-in guard for this:

```
LINKOPS_AVOID_CRON_WINDOW=00:55-01:35   # set in EC2's .env.local only, unset locally
```

While the current UTC time falls in this window, `claimPendingJobs()` returns immediately
without claiming new jobs — see `inAvoidWindow()` in `worker/index.ts`. This covers Forums
Dashboard's two heaviest cron jobs (weekly all-platform run + daily brand-removal check, both
`~01:00 UTC`).

**What this does *not* cover** (know these before assuming the two projects can never collide):
- A LinkOps job already running when the window starts (allowed to finish — up to 5 min by
  `JOB_TIMEOUT_MS`).
- Forums Dashboard's manual "Check Status" dashboard button, which can trigger
  `status_server.py` → Chrome at any time, not just via cron.
- Any one-off manual script run on either side.

Given LinkOps' actual usage (a few runs a month), the residual collision probability is low —
this guard exists to cut it further, not to make collision impossible.

---

## Updating the worker code

**There is no git checkout on the box, and no CI/CD.** The deployed code is a plain file copy —
updating it means editing locally, then re-uploading by hand. This is how the environment issues
(`googleapis` resolution, `ws`/WebSocket polyfill for Node 20) surfaced during initial deploy:
things only ts-node compiles/resolves at runtime, which a local edit alone can't catch.

**Standard update flow**, from the local repo root:

```bash
KEY="/c/Users/Leo/OneDrive/Documents/leoscraper/leoscraper.pem"
HOST="ec2-user@54.179.186.205"

# 1. Copy whichever files changed
scp -i "$KEY" worker/index.ts "$HOST":~/linkops-worker/worker/index.ts
# (repeat per changed file — worker/*.ts, worker/package.json, or lib/leads/*.ts)

# 2. If package.json changed, reinstall
ssh -i "$KEY" "$HOST" 'cd ~/linkops-worker/worker && npm install'

# 3. Restart — ts-node reads the .ts file fresh on process start; there's no
#    hot-reload, so the old code keeps running until this happens
ssh -i "$KEY" "$HOST" 'pm2 restart linkops-worker'

# 4. Always check logs after — a bad deploy fails at import time and
#    crash-loops silently unless you look
ssh -i "$KEY" "$HOST" 'sleep 8 && pm2 logs linkops-worker --lines 20 --nostream'
```

If `.env.local` needs updating (rotated API key, new config), the same pattern applies — edit a
local copy, `scp` it to `~/linkops-worker/.env.local`, `chmod 600`, restart. **Do not** edit
`~/.env` on the box — that's Forums Dashboard's file, a different filename by design specifically
to avoid this collision.

---

## Monitoring & logs

```bash
pm2 status linkops-worker                        # online/stopped, restart count, uptime
pm2 logs linkops-worker --lines 50 --nostream     # recent output + errors
pm2 describe linkops-worker                       # full detail incl. restart count
```

A healthy worker logs `[worker] Starting poll loop (concurrency: 1)...` on boot and stays quiet
between jobs (it polls Supabase every 5s but only logs on state changes). Frequent unexplained
restarts (`↺` column in `pm2 status`) mean something is crashing at import/startup — check
`pm2 logs` for a stack trace before assuming it's transient.

Persistence: the worker restarts automatically after a reboot via a registered systemd service
(`pm2-ec2-user`, `systemctl is-enabled pm2-ec2-user` → `enabled`), which replays whatever
`pm2 save` last captured. **Run `pm2 save` after any change to which processes should run** —
`pm2 restart` alone doesn't update what survives a reboot.

---

## Housekeeping

### Storage is fine to clean whenever it looks tight — here's what actually accumulates

Current usage: **~59% of the 8GB root volume**, mostly static (LinkOps' `node_modules` across
both directories is ~513MB, a one-time cost that doesn't grow with usage). What *does* grow, and
how it's handled:

| Source | Growth pattern | Already handled? |
|---|---|---|
| Chrome temp profiles (`/tmp/com.google.Chrome.*`) | One per scrape, both projects, only cleaned on a graceful exit | **Yes, automatically** — `~/cleanup_tmp.sh` (Forums Dashboard's existing cron, daily 15:30 UTC) sweeps anything older than 24h by pattern, not by owning project. LinkOps' leftovers get swept by the same job for free. |
| PM2 logs (`~/.pm2/logs/linkops-worker-*.log`) | Grows with every restart + log line, uncapped by default | **Yes, now** — `pm2-logrotate` module installed 2026-08-14 (10MB max size, 7 rotations retained, compressed, daily). Wasn't there before this deploy; Forums Dashboard's `logrotate.d` config only covers `~/*.log`, not `~/.pm2/logs/`. |
| `node_modules` (both LinkOps dirs) | Static — only grows if `package.json` gains a dependency | No action needed unless deliberately adding a dependency |
| dnf cache, general `/tmp` cruft | Shared OS-level housekeeping | Covered by Forums Dashboard's existing weekly `dnf clean all` cron |

**Given ~2-3 runs/month, none of this is likely to become urgent** — but if disk ever does look
tight, cleaning the box is safe and reversible:

```bash
df -h /                                        # check usage
du -sh ~/linkops-worker/* ~/*.py /tmp/* 2>/dev/null | sort -rh | head -20   # find what's big
~/cleanup_tmp.sh                               # force a Chrome-tmp sweep now (normally daily)
pm2 flush linkops-worker                       # clear PM2 logs immediately (normally auto, weekly-ish)
sudo dnf clean all                             # clear dnf metadata cache
```

None of these touch Forums Dashboard's actual data or running processes — all pure cleanup.

### When to reconsider a dedicated box

Revisit this shared setup (i.e., give LinkOps its own instance) if any of these change:
- Run frequency goes from ~2-3x/month to daily/continuous
- The avoidance-window guard starts visibly mattering (check for
  `[worker] Entering cron-avoidance window` log lines correlating with missed/delayed jobs)
- Either project starts seeing unexplained slowness that lines up with the other's activity
  (possible T2 CPU-credit exhaustion — check `CPUCreditBalance` in CloudWatch if this is suspected)
- Disk usage climbs past ~80% and isn't explained by the table above

---

## Troubleshooting

**Worker won't start / crash-loops immediately after a code update**
```bash
pm2 logs linkops-worker --lines 30 --nostream
```
Import-time errors (module not found, syntax error) crash the whole process before the poll loop
even starts, and PM2 auto-restarts it — so a bad deploy shows up as a fast, repeating restart
count, not a clean stopped state. Check the top of the error log, not just the latest lines.

**"Cannot find module 'googleapis'"** — the root `~/linkops-worker/node_modules` install is
missing or was wiped. Re-run `npm install` in `~/linkops-worker/` (not `~/linkops-worker/worker/`
— see [Isolation](#isolation-from-forums-dashboard) for why there are two).

**"Node.js 20 detected without native WebSocket support"** — should not recur (fixed by the `ws`
polyfill in `worker/index.ts`), but if it does, confirm `ws` is present in
`worker/node_modules/ws` and that `package.json` still lists it as a dependency.

**Worker seems to skip jobs at certain times of day** — check whether it's inside
`LINKOPS_AVOID_CRON_WINDOW` (`00:55-01:35` UTC by design). Not a bug.

**Public IP changed after a stop/start** — LinkOps doesn't hardcode the IP anywhere (unlike
Forums Dashboard's `EC2_STATUS_URL` Supabase secret), so no LinkOps-side config needs updating —
just use the new IP for SSH/SCP going forward.
