# ONYX Queues — Background Job System

Zero-dependency, file-backed job queue for ONYX. Implemented from scratch in
`src/queue/` — **no BullMQ, no Redis, no bee-queue**.

> **Scope**: dev / single-host / small-scale only. This is **not** a
> replacement for Redis + BullMQ in production. There is no clustering, no
> cross-host locking, and no fan-out. For multi-host or high-throughput
> workloads, swap in Redis/BullMQ behind the same `Queue` / `Worker` API.
>
> When to keep using this:
> - local dev
> - single-VM deployments (<= a few thousand jobs/day)
> - background work that tolerates at-least-once delivery
>
> When to replace with Redis/BullMQ:
> - more than one worker host
> - hundreds of thousands of jobs/day
> - strict cross-host ordering requirements

## Architecture

```
data/queue/
  pdf-generation.jsonl          ← append-only event log
  pdf-generation.state.json     ← compacted state snapshot
  pdf-generation.lock           ← O_EXCL lock file
  pdf-generation.dead.jsonl     ← dead letter queue
```

Each queue is a single in-memory map rebuilt from the event log on startup.
Mutations are `withLock()`-serialised via an `O_EXCL` lock file; stale locks
(> 60s) are automatically reaped.

Every 200 ops the log is compacted into `state.json` and truncated.

### Job lifecycle

```
add()  → pending → claim() → processing → ack()       → completed
                                         → fail()     → pending (retry) or dead
                                         → visibility → pending (re-delivered)
```

Jobs carry:

| field         | meaning                                                |
| ------------- | ------------------------------------------------------ |
| `id`          | unique id                                              |
| `type`        | handler key, e.g. `wage-slip`                          |
| `payload`     | arbitrary JSON                                         |
| `priority`    | `high` (0), `normal` (1), `low` (2)                    |
| `status`      | `pending` / `processing` / `completed` / `dead`        |
| `createdAt`   | enqueue ts                                             |
| `runAt`       | earliest run ts — used by delayed jobs and backoff     |
| `visibleUntil`| when invisibility window ends                          |
| `attempts`    | number of times claimed                                |
| `maxAttempts` | after this many failures -> dead letter queue          |
| `lastError`   | short error string from the most recent failure       |

## Registered queues

These are the canonical queues defined in `src/queue/worker.js`
(`QUEUE_TYPES`). The HTTP API and CLI only accept these names.

| queue               | visibility | max attempts | purpose                                            |
| ------------------- | ---------- | ------------ | -------------------------------------------------- |
| `pdf-generation`    | 2 min      | 3            | wage slips, invoices, reports                      |
| `email-sending`     | 1 min      | 5            | transactional email                                |
| `bank-matching`     | 5 min      | 3            | match bank transactions after upload               |
| `legacy-import`     | 30 min     | 2            | long-running CSV/XLS legacy imports                |
| `report-generation` | 10 min     | 2            | heavy aggregation reports                          |
| `webhook-delivery`  | 30 sec     | 5            | external webhook callbacks                         |
| `file-cleanup`      | 1 min      | 3            | purge old files                                    |

To add a new queue, extend `QUEUE_TYPES` in `src/queue/worker.js`.

## Usage — producer side

```js
const { openQueue } = require('./src/queue/queue');

const q = openQueue('pdf-generation');
q.add('wage-slip', { employeeId: 42, month: '2026-04' }, { priority: 'high' });
q.add('invoice',  { invoiceId: 99 }, { delay: 60_000 });   // 60s in future
```

## Usage — worker side

```js
const { Worker } = require('./src/queue/worker');

const w = new Worker('pdf-generation', { concurrency: 2, jobTimeoutMs: 60_000 });

w.register('wage-slip', async (payload, ctx) => {
  ctx.log.info?.({ jobId: ctx.jobId }, 'generating wage slip');
  await generateWageSlipPdf(payload.employeeId, payload.month);
});

w.register('invoice', async (payload) => {
  await generateInvoicePdf(payload.invoiceId);
});

w.start();

process.on('SIGTERM', () => w.stop());
```

The handler receives `(payload, ctx)` where `ctx = { jobId, type, attempts,
queueName, log }`. Throwing marks the job as failed — the worker will retry
up to `maxAttempts` with exponential backoff, then move it to the dead
letter queue.

## CLI

Start a worker as a separate process:

```bash
node scripts/queue-worker.js pdf-generation
node scripts/queue-worker.js email-sending --concurrency=4
node scripts/queue-worker.js bank-matching --timeout=300000
node scripts/queue-worker.js file-cleanup --once   # drain and exit
```

The CLI will auto-load handlers from `src/queue/handlers/<queue-name>.js` if
present. If no handler file exists it falls back to a log-only stub so jobs
can be observed before real handlers are wired.

Graceful shutdown: send SIGINT or SIGTERM — the CLI waits for in-flight jobs
to finish before exiting.

## HTTP API

Mount in `server.js`:

```js
const queueRoutes = require('./src/queue/routes');
app.use('/api/queue', queueRoutes);
```

| method   | path                                        | purpose                           |
| -------- | ------------------------------------------- | --------------------------------- |
| `GET`    | `/api/queue/:name/stats`                    | counts by status                  |
| `GET`    | `/api/queue/:name/jobs?status=failed`       | list jobs, filter by status       |
| `POST`   | `/api/queue/:name/retry-all`                | re-queue failed + dead jobs       |
| `POST`   | `/api/queue/:name/add`                      | enqueue (dev helper)              |
| `DELETE` | `/api/queue/:name/dead-letter?confirm=true` | clear DLQ (confirm required)      |

Example:

```bash
curl http://localhost:3000/api/queue/pdf-generation/stats
# { "queue":"pdf-generation","stats":{"pending":3,"processing":1,"completed":120,"dead":0,"total":124} }

curl -X POST http://localhost:3000/api/queue/email-sending/retry-all
# { "queue":"email-sending","retried":2 }
```

### Never-delete rule

Rule #1 of ONYX: **we don't delete**. The `DELETE /dead-letter` route
requires `?confirm=true` (or `body.confirm=true`). Even when confirmed, the
existing `.dead.jsonl` is **renamed** to `.dead.jsonl.<timestamp>` — the
original jobs stay on disk for auditing. The in-memory dead entries are
dropped so the dashboard shows `dead: 0`.

If you need a true purge, delete the archive files manually after an
auditor sign-off.

## Failure handling

- **handler throws** → `queue.fail(id, err.message)` → either re-queued with
  backoff `2^attempts` seconds (max 5 min) or dead-lettered.
- **handler hangs** → per-job timeout (`jobTimeoutMs`) rejects the promise,
  handled the same as `throw`.
- **worker crashes mid-job** → visibility timeout expires, next `claim()`
  re-delivers the job (incrementing `attempts`).
- **corrupt state.json** → queue falls back to the append-only log; an
  `error` event is emitted so ops can capture it in `src/ops/error-tracker`.

## Testing

```bash
# all queue tests
node --test src/queue/queue.test.js src/queue/worker.test.js
```

Tests cover:

- FIFO + priority ordering
- delayed jobs / visibility timeout re-delivery
- max-attempts → dead letter queue
- replay across fresh Queue instances
- compact() snapshot + log truncation
- worker timeout + retry + concurrency + graceful shutdown
- never-delete rule on `clearDeadLetter`

## Observability

The queue emits events you can hook into the existing ONYX telemetry stack:

```js
q.on('added',       (job)    => metrics.queueAdded.inc({ queue: q.name, type: job.type }));
q.on('completed',   (job)    => metrics.queueCompleted.inc({ queue: q.name }));
q.on('failed',      (job)    => metrics.queueFailed.inc({ queue: q.name }));
q.on('dead',        (job)    => errorTracker.captureException(new Error(job.lastError), { job }));
w.on('job:started',  ({job}) => logger.info({ jobId: job.id, type: job.type }, 'job start'));
w.on('job:completed',({job,elapsed}) => logger.info({ jobId: job.id, elapsedMs: elapsed }, 'job ok'));
```

## Operational notes

- **Backups**: include `data/queue/` in your `scripts/backup.js` rotation.
  The append-only `.jsonl` + `.state.json` pair is rsync-friendly.
- **Disk usage**: compaction keeps things bounded, but dead letter
  archives (`*.dead.jsonl.<ts>`) accumulate. Rotate via `file-cleanup`.
- **Clock skew**: `runAt` / `visibleUntil` are local `Date.now()`. If the
  host clock jumps, in-flight jobs may be re-delivered early.
- **At-least-once semantics**: crash between handler success and `ack()`
  causes the job to re-run. Handlers must be idempotent.

## Migration path to Redis/BullMQ

If you outgrow the file-backed queue:

1. Keep the same `Queue` and `Worker` public API shape.
2. Create `src/queue/queue.redis.js` that implements `add/claim/ack/fail/
   list/stats/retryAll/clearDeadLetter` on top of BullMQ.
3. Add an env flag `ONYX_QUEUE_BACKEND=redis|file` and switch in
   `openQueue()`.
4. Handlers and producers stay unchanged.
