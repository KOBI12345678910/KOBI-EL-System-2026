# ONYX — Scheduled Jobs Framework

Agent-77 module. Zero external dependencies (no `node-cron`, no `cron-parser`, no `bull`). A pure Node implementation of a cron-style scheduler, a job registry, a process worker, four admin endpoints, and append-only persistence to `data/job-runs.jsonl`.

The framework is **purely additive**. Importing any of its files has zero side effects. Nothing in this framework deletes anything on disk — the author's rule is "we never delete". The weekly `clean-old-logs` job only **renames** stale log files to `*.archived-<timestamp>`.

---

## Files

| File | Role |
|---|---|
| `src/jobs/scheduler.js`      | Cron parser, next-run calculator, per-minute ticker, job runner (retries/timeouts/overlap/pause/resume/catch-up). |
| `src/jobs/persistence.js`    | Append-only JSONL writer + last-run reader for catch-up on restart. |
| `src/jobs/jobs-registry.js`  | Registry API (`registerJob`) and 12 `DEFAULT_JOBS` with handlers. |
| `src/jobs/jobs-runner.js`    | `bootstrap()`, Express route registration, `runAsWorker()` for `node src/jobs/jobs-runner.js`. |
| `src/jobs/scheduler.test.js` | `node --test` unit tests. |
| `data/job-runs.jsonl`        | Created lazily on first run. One JSON object per line. |

---

## Cron expression syntax

Standard 5-field POSIX cron:

```
 ┌───────────── minute       (0-59)
 │ ┌─────────── hour         (0-23)
 │ │ ┌───────── day of month (1-31)
 │ │ │ ┌─────── month        (1-12)
 │ │ │ │ ┌───── day of week  (0-6, Sunday=0; 7 is also accepted for Sunday)
 │ │ │ │ │
 * * * * *
```

Supported per field:

| Form | Meaning |
|---|---|
| `*` | any value |
| `a,b,c` | explicit list |
| `a-b` | inclusive range |
| `*/n` | every *n* starting from the field's min |
| `a-b/n` | stepped range |

POSIX DOM/DOW semantics are honoured: when **both** day-of-month and day-of-week are restricted, a match in **either** counts (so `0 8 1 * 0` fires on the 1st of every month **and** on every Sunday).

---

## Registering a job

```js
const { bootstrap } = require('./src/jobs/jobs-runner');

const runner = bootstrap({ logger: require('./src/logger').logger });

// Add a custom job (in addition to DEFAULT_JOBS, which are registered
// automatically unless you pass { registerDefaults: false }).
runner.scheduler.register({
  id: 'my-custom-job',
  cron: '*/15 * * * *',
  handler: async (ctx) => {
    ctx.logger.info({ jobId: ctx.id, attempt: ctx.attempt }, 'running');
    // ...
  },
  timeout: 2 * 60 * 1000,   // 2 minutes, rejects with "job timed out after Nms"
  retries: 3,                // total attempts = 1 + retries
  retryDelayMs: 30_000,      // delay between attempts
  onFailure: 'notify-admin', // symbolic hook name passed to bootstrap onFailure
  jitterMs: 10_000,          // per-job jitter override
  runMissedOnStartup: true,  // default; set false to skip catch-up
});
```

**Handler contract** — the handler receives a `ctx` object:

```js
{
  id: 'my-custom-job',
  scheduledAt: <Date>,      // wall-clock at start of this run
  attempt: 1,                // 1-indexed, increments for each retry
  logger: { info, warn, error, debug },
}
```

If the handler returns a rejected Promise or throws, the scheduler treats it as a failure, retries up to `retries`, and then:
- marks `lastStatus: 'failure'`
- appends a failure record to `data/job-runs.jsonl`
- calls the global `onFailure` hook if one was passed to `bootstrap()`

---

## Default jobs

The `DEFAULT_JOBS` catalog in `jobs-registry.js` covers the 12 required operational cadences:

| id | cron | Purpose |
|---|---|---|
| `daily-backup`             | `0 2 * * *`          | Spawn `scripts/backup.js` (Agent-59) for the full Supabase dump. |
| `monthly-vat-reminder`     | `0 9 10 * *`         | Write a VAT-submission reminder (day 10 of each month). |
| `monthly-wage-slip`        | `0 9 25 * *`         | Reminder to run payroll and emit wage slips (day 25). |
| `quarterly-tax-report`     | `0 8 1 1,4,7,10 *`   | Jan 1 / Apr 1 / Jul 1 / Oct 1, 08:00 — quarterly tax report. |
| `annual-tax-reminder`      | `0 8 1 1 *`          | Jan 1, 08:00 — annual filing reminder. |
| `overdue-invoices-alert`   | `0 9 * * *`          | Daily 09:00 — invoices past due. |
| `low-cash-alert`           | `0 8 * * *`          | Daily 08:00 — cash runway below threshold. |
| `health-check`             | `*/5 * * * *`        | Every 5 minutes — writes `data/health/heartbeat.jsonl`. |
| `metrics-aggregation`      | `0 * * * *`          | Hourly — rolls up `process.memoryUsage()`, uptime. |
| `clean-old-logs`           | `0 3 * * 0`          | Sunday 03:00 — **archives** (renames) logs older than 90 days. |
| `token-refresh`            | `0 */12 * * *`       | Every 12 hours — refresh external API tokens. |
| `cache-warm`               | `0 6 * * *`          | Daily 06:00 — pre-hit heavy dashboards listed in `ONYX_CACHE_WARM_URLS`. |

All reminders are written as JSON lines under `data/reminders/<kind>.jsonl`. Downstream notification pipelines (email, WhatsApp, SMS) can read these files without any coupling to the scheduler.

---

## Admin HTTP endpoints

Mount on your Express app via:

```js
const { bootstrap, registerAdminRoutes } = require('./src/jobs/jobs-runner');
const runner = bootstrap({ logger });
registerAdminRoutes(app, runner);
// DO NOT call runner.scheduler.start() here unless this process is the
// designated job worker — otherwise multiple API instances will race.
```

| Method | Path                               | Response |
|---|---|---|
| `GET`  | `/api/admin/jobs`                  | `{ ok, count, jobs: [...] }` — every registered job with status. |
| `GET`  | `/api/admin/jobs/:id`              | `{ ok, job, history, persistenceFile }` — details + last 100 runs from jsonl. |
| `POST` | `/api/admin/jobs/:id/run-now`      | Fires the handler immediately (manual, bypasses cron). |
| `POST` | `/api/admin/jobs/:id/pause`        | Stops future scheduled ticks until resumed. |
| `POST` | `/api/admin/jobs/:id/resume`       | Re-enables ticks and recomputes `nextRunAt`. |

All endpoints return 404 when the job id is unknown. A 500 response signals an internal scheduler or filesystem error — the request body still contains `{ ok:false, error }`.

**Auth**: the existing API-key middleware in `server.js` already applies to `/api/*` paths, so these endpoints are automatically protected.

---

## Running the worker

### Embedded in the API process (simple deployments)

```js
// server.js
const { bootstrap, registerAdminRoutes } = require('./src/jobs/jobs-runner');
const runner = bootstrap({ logger });
registerAdminRoutes(app, runner);

if (process.env.ONYX_JOBS_INLINE === '1') {
  runner.scheduler.start();
}
```

### As a standalone worker (recommended)

```bash
node src/jobs/jobs-runner.js
```

When run as a script (`require.main === module`), `runAsWorker()` registers default jobs, starts the scheduler, wires `SIGINT`/`SIGTERM` to `stop()`, and streams structured JSON logs to stdout.

---

## Persistence & catch-up

Every run appends one JSON line to `data/job-runs.jsonl`:

```
{"jobId":"daily-backup","at":"2026-04-11T02:00:03.142Z","status":"success","durationMs":18341,"error":null,"mode":"scheduled"}
```

Fields:

| field | meaning |
|---|---|
| `jobId`     | the registered id |
| `at`        | ISO timestamp at the end of the run |
| `status`    | `success` / `failure` / `skipped` |
| `durationMs`| elapsed wall-clock of the attempt chain |
| `error`     | message of the last attempt that failed (or `null`) |
| `mode`      | `scheduled` / `manual` / `catchup` |

**Catch-up on restart.** When the scheduler starts, it asks persistence for `readLastRuns()` — a map from `jobId` to the most recent **successful** run. For each registered job:

1. It computes the most recent scheduled tick strictly before `now()`.
2. If either the job has never run successfully, or that last success is earlier than the most recent scheduled tick, it fires exactly **one** catch-up run with `mode: 'catchup'`.
3. A job may opt out via `runMissedOnStartup: false` in its definition.

Only one catch-up per restart — the framework does not try to "replay" every missed tick across a long outage.

---

## Jitter

The global jitter (passed as `bootstrap({ jitterMs: 10_000 })`, default 10 s) adds a random delay `[0, jitterMs)` before each scheduled run, so jobs clustered on the same minute fan out across the host. A per-job override is available via `jitterMs` in the job definition.

Manual (`run-now`) and catch-up runs are never jittered.

---

## Overlap safety

If a previous invocation is still running when the next scheduled tick arrives, the new tick is marked `skipped` with `error: 'previous run still in progress'` and the `overlapped` counter increments. The currently running attempt is never cancelled.

---

## Retries and timeouts

- `timeout` — if set, the handler's promise is raced against a timer; on timeout the run rejects with `job timed out after Nms` and the retry policy applies.
- `retries` — additional attempts on top of the first. Total attempts = `1 + retries`.
- `retryDelayMs` — straight delay between attempts (no backoff by default; override per job).

---

## Tests

```bash
node --test src/jobs/scheduler.test.js
```

Covered:

- cron parsing: wildcard, list, range, stepped range, day-of-week normalisation, DOM/DOW OR semantics, bounds, error paths
- `computeNextRun` for daily / quarterly / weekly / every-N-minutes expressions
- `register`, `list`, `get`, `pause`, `resume`, validation errors
- `runNow` success, retry-then-success, retry-exhaustion, timeout, overlap skip
- Persistence write + read + missing-file behaviour
- Catch-up: fires once when the last success is stale; suppressed by `runMissedOnStartup: false`
- Admin routes: all 5 endpoints mount on a fake Express app and respond correctly

---

## Non-goals (intentional)

- **Distributed coordination.** Running multiple worker processes will cause duplicate fires. If you scale the API horizontally, run the worker exactly once (dedicated process, PM2 `instances: 1`, or a separate container).
- **DST cleverness.** A minute that repeats or is skipped during a DST transition is accepted as-is. Persistence de-dupes catch-up.
- **Deletion.** Nothing in this framework deletes files. `clean-old-logs` renames; `data/job-runs.jsonl` is append-only.
- **Seconds granularity.** Cron is minute-based; sub-minute jobs are out of scope.

---

## Environment variables

| Var | Default | Meaning |
|---|---|---|
| `ONYX_JOB_RUNS_FILE`    | `<cwd>/data/job-runs.jsonl`            | Override the persistence file path. |
| `ONYX_JOB_RUNS_DIR`     | `<cwd>/data`                            | Override only the directory. |
| `ONYX_DATA_DIR`         | `<cwd>/data`                            | Reminder files live under `<dir>/reminders/`. |
| `ONYX_CACHE_WARM_URLS`  | *(empty)*                               | CSV of URLs hit by `cache-warm`. |
| `ONYX_JOBS_DEBUG`       | *(unset)*                               | When truthy, default logger emits `debug` lines. |
| `ONYX_JOBS_INLINE`      | *(unset)*                               | Set to `1` to let the API process start the scheduler inline. |
