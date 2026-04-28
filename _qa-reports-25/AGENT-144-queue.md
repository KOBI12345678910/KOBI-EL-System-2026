# AGENT-144 — Background Jobs / Queue Audit

**Scope**: Find every queue / scheduler / worker, score concurrency, retry, dead-letter, observability.
**Verdict**: **YELLOW** — solid in-house engine, but the canonical queue is **not yet wired** into production code paths and observability is **declared, not connected**.

---

## 1. Queue technologies in use

| Technology     | Where                                                                                          | Role           |
| -------------- | ---------------------------------------------------------------------------------------------- | -------------- |
| Custom file-backed queue (`Queue` / `Worker`) | `onyx-procurement/src/queue/{queue,worker,routes}.js` + `scripts/queue-worker.js` | **Canonical** ERP queue |
| BullMQ (`^5.20.0` / `^5.74.1`)                | `_merge-incoming/.../lib/queue/`, `imported-from-github/.../api-server`, `omega/server`        | Imported, not active in `onyx-procurement` |
| Custom in-memory queue (TS)                   | `onyx-ai/agents/src/tools/queueSystemTool.ts` (mirrored in `AI-Task-Manager/.../kobi-agent`)   | Generates BullMQ scaffolding for end-users; not run inside the platform |
| FIFO retry queue                              | `onyx-procurement/src/notifications/notification-queue.js`                                    | Notifications, separate impl |
| File-backed DLQ                               | `onyx-procurement/src/resilience/dead-letter-queue.js`                                        | Generic retry-failed store |
| In-process priority queue                     | `onyx-procurement/src/printing/print-queue.js`                                                | IPP/ZPL print jobs |
| Email retry queue (in-proc)                   | `onyx-procurement/src/emails/send-email.js` (`new Queue(...)` line 574)                       | Per-sender |

> No Agenda, no Bee-Queue, no Kue, no node-cron / node-schedule. Periodicity is hand-rolled via `setInterval` in 13 ops/profiler files.

---

## 2. Canonical engine — `onyx-procurement/src/queue/`

### Architecture (`queue.js`)

* Append-only `data/queue/<name>.jsonl` event log + periodic compaction → `state.json` every 200 ops.
* Per-queue O_EXCL lock file (`<name>.lock`) with stale-lock sweep at 60 s.
* Job lifecycle: `pending → processing → completed / failed → dead`.
* **Priorities**: `high(0) | normal(1) | low(2)`.
* **Visibility timeout** with auto-redelivery on expiry (lines 302-313).
* **Exponential backoff** on `fail()`: `2^attempts` s, capped 5 min (line 364).
* **Dead-letter** `<name>.dead.jsonl`, append-only; `clearDeadLetter` archives via rename.
* **At-least-once** semantics, idempotency required by handlers.

### Worker (`worker.js`)

* `concurrency` (default 1), `pollMs` (500), `jobTimeoutMs` (60 s).
* Per-job `_withTimeout` wrapper rejects on timeout (lines 179-190).
* Graceful shutdown: `stop()` blocks new claims and awaits in-flight jobs (`await Promise.race([...activeJobs])`).
* Emits `started / stopped / job:started / job:completed / job:failed`.
* `QUEUE_TYPES` registry (lines 213-221) pre-tunes 7 named queues:

| queue              | visibility | maxAttempts |
| ------------------ | ---------- | ----------- |
| `pdf-generation`   | 120 s      | 3           |
| `email-sending`    | 60 s       | 5           |
| `bank-matching`    | 300 s      | 3           |
| `legacy-import`    | 1800 s     | 2           |
| `report-generation`| 600 s      | 2           |
| `webhook-delivery` | 30 s       | 5           |
| `file-cleanup`     | 60 s       | 3           |

### CLI runner (`scripts/queue-worker.js`)

* `--concurrency`, `--timeout`, `--poll`, `--once` (drain-and-exit) flags.
* Auto-loads handlers from `src/queue/handlers/<queue>.js` if present, else falls back to a logging stub.
* Wires SIGINT/SIGTERM to graceful shutdown.

### HTTP routes (`routes.js`)

`GET /:name/stats`, `GET /:name/jobs`, `POST /:name/retry-all`, `POST /:name/add`, `DELETE /:name/dead-letter` — guarded by allowlist against `QUEUE_TYPES`.

---

## 3. Critical gaps (P0 / P1)

| Severity | Finding                                                                                                                              | Evidence |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| **P0**   | **No handler files exist.** `src/queue/handlers/` directory is empty — every queue would run the log-only `__default__` stub.        | Glob `src/queue/handlers/**/*.js` → 0 files |
| **P0**   | **Queue routes never mounted.** `server.js` does **not** `require('./src/queue/routes')` — `/api/queue/*` is unreachable.            | Grep `queueRoutes` in `server.js` → 0 hits |
| **P0**   | **Production callers don't enqueue.** `openQueue(` / `q.add(` are referenced only in `queue.js`, `routes.js`, `worker.js` and tests. No domain code (PDFs, emails, bank-match, webhooks, payroll) routes through this engine. | Grep `openQueue\(` outside `src/queue/` → 0 |
| **P0**   | **Metrics never wired.** `prom-metrics.js` defines `erp_queue_size` (line 750) but nothing emits to it. Docs show event hooks (`q.on('added', ...)` lines 203-209 of `QUEUES.md`) — they are illustration only, no callsite implements them. | Grep `queueAdded\|queueCompleted\|queueFailed` → 0 |
| **P1**   | **`sleepSync` busy-wait** in lock retry (`queue.js` line 84-88) blocks event loop up to 100 ms per retry. Under contention this is a hotspot. | `while (Date.now() < end) {}` |
| **P1**   | **Cross-host hazard.** Engine is single-host by design (file lock, in-memory map). README states this clearly, but there is no env-flag swap to BullMQ as the migration path promises (`ONYX_QUEUE_BACKEND=redis\|file` is documented but not implemented). | `Grep ONYX_QUEUE_BACKEND` → 0 |
| **P1**   | **Multiple parallel queue impls.** Notifications, printing, emails each ship their own retry/DLQ logic. Drift risk: backoff schedules differ (notifications: 1s/5s/30s/2m/10m/1h vs queue.js: `2^attempts s`). | `notification-queue.js` lines 33-42 |
| **P1**   | **Workers are not declared in process model.** No `npm run worker:*` script, no `Procfile`, no PM2/systemd unit found. Workers must be launched manually via `node scripts/queue-worker.js`. | `package.json` scripts → no worker entries |
| **P2**   | **No rate-limiting / job dedup** (no idempotency key support). `q.add()` accepts duplicate logical jobs without coalescing. | `add()` lines 268-291 |
| **P2**   | **`stats()` is O(n) over all jobs in memory** including `completed` rows; no TTL / archival of completed jobs. | `queue.js` lines 388-401 |
| **P2**   | **No QueueEvents / cross-process pub-sub.** Events only fire in the producing process — UI dashboards in another process will not see them. | EventEmitter is local to instance |
| **P2**   | **BullMQ lib (`@workspace/queue`) imports are lazy and never reach the runtime** — `lib/queue/src/index.ts` lives in `_merge-incoming/` and is not consumed by `onyx-procurement` or `onyx-ai`. | Grep for `@workspace/queue` → only in vm-task-runner |

---

## 4. AI / TS surface (`onyx-ai/agents/src/tools/queueSystemTool.ts`)

A **demo / scaffolding generator** — `generateBullMQSetup()` writes BullMQ files into a target project. The internal queue (lines 20-65) is a Map+setTimeout toy with `priority`, `attempts`, `maxAttempts` — fine as a tool, but it is not the platform's queue. Identical file mirrored in `AI-Task-Manager/artifacts/kobi-agent`.

---

## 5. Recommendations

1. **Create `src/queue/handlers/` files** for the 7 registered queues (or remove the registrations). Today every claimed job hits the stub.
2. **Mount `queueRoutes`** in `server.js`: `app.use('/api/queue', require('./src/queue/routes'))`.
3. **Wire metrics**: in `openQueue()` attach `q.on('added' | 'completed' | 'failed' | 'dead')` handlers that increment `erp_queue_size` / new counters in `prom-metrics.js`. Same for the worker timing histograms.
4. **Add `npm run worker:<name>`** scripts and a supervisor manifest (PM2 / systemd / Docker) so workers start on boot.
5. **Implement the `ONYX_QUEUE_BACKEND=redis|file` switch** per the doc. Use the existing BullMQ lib in `_merge-incoming/.../lib/queue` as the Redis driver; keep producer/consumer API stable.
6. **Replace `sleepSync` busy-wait** with `setImmediate`-based async lock acquire, and cap retries to keep the event loop responsive.
7. **Consolidate** notification/email/print retry logic onto the canonical engine to retire 3 parallel impls.
8. **Add idempotency keys** (optional `opts.dedupeKey` mapped to job id) to make handlers safer under at-least-once semantics.

---

## 6. Files of interest (absolute paths)

* `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\queue\queue.js`
* `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\queue\worker.js`
* `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\queue\routes.js`
* `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\scripts\queue-worker.js`
* `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\docs\QUEUES.md`
* `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\notifications\notification-queue.js`
* `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\resilience\dead-letter-queue.js`
* `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\emails\send-email.js` (line 574)
* `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\printing\print-queue.js`
* `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-ai\agents\src\tools\queueSystemTool.ts`
* `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_merge-incoming\techno-uzi-erp\Techno-Uzi-Erp\lib\queue\src\index.ts` (BullMQ driver — unused)
* `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\ops\prom-metrics.js` (line 750 — `erp_queue_size` placeholder)
