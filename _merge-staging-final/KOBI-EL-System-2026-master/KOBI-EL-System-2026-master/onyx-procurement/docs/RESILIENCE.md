# Resilience Toolkit

> ONYX Procurement — `src/resilience/*`
> Agent-79 — zero-dependency resilience primitives.

This document covers the five resilience utilities you can wrap around any
fragile operation (network calls, DB queries, webhook deliveries, SMS
dispatch, the MFH gateway, …). Each module is pure Node (no `npm install`
required) and is unit-tested via `node --test`.

| Module | Purpose | File |
|---|---|---|
| `retry` | Higher-order function adding retry + backoff to any async fn | `src/resilience/retry.js` |
| `circuit-breaker` | CLOSED/OPEN/HALF_OPEN state machine around a dependency | `src/resilience/circuit-breaker.js` |
| `dead-letter-queue` | File-backed DLQ with admin API & audit trail | `src/resilience/dead-letter-queue.js` |
| `idempotency-key` | Express middleware caching responses by `Idempotency-Key` | `src/resilience/idempotency-key.js` |
| `timeout-wrapper` | `withTimeout(promise, ms, errorMsg)` with abort support | `src/resilience/timeout-wrapper.js` |

Everything below assumes Node >= 20 (AbortController, `node:test` built-in).

---

## 1. `retry` — configurable retry wrapper

```js
const { retry } = require('./src/resilience/retry');

const callUpstream = retry(
  async (payload) => {
    const res = await fetch('https://api.upstream/invoice', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  },
  {
    maxAttempts: 5,
    backoff: 'exponential',   // 'exponential' | 'linear' | 'fixed'
    initialDelayMs: 1_000,
    maxDelayMs: 60_000,
    jitter: true,             // full-jitter, AWS-style
    retryOn: (err) => !(err.status >= 400 && err.status < 500), // skip 4xx
    onRetry: (attempt, err, delay) =>
      logger.warn({ attempt, delay, err: err.message }, 'retrying upstream'),
  },
);

const result = await callUpstream({ invoiceId: 42 });
```

### Backoff formulas

| Strategy | Attempt `n` delay |
|---|---|
| `fixed` | `initialDelayMs` |
| `linear` | `initialDelayMs × n` |
| `exponential` | `initialDelayMs × 2^(n-1)` |

All strategies are capped by `maxDelayMs`. When `jitter: true`, the final
delay is a uniform random value in `[0, computedDelay]` (full-jitter).

### Default `retryOn`

When omitted, the wrapper retries everything **except** responses/errors
with `err.status` (or `err.statusCode`) in `[400, 500)`. This matches the
common convention of treating 4xx as a caller problem and 5xx / network
errors / timeouts as transient.

### Cancellation

Pass an `AbortSignal` via `opts.signal` to cancel the retry loop between
attempts — useful in graceful-shutdown hooks:

```js
const ac = new AbortController();
process.on('SIGTERM', () => ac.abort());

await retry(upstreamCall, { signal: ac.signal, ...opts })(payload);
```

---

## 2. `circuit-breaker` — fail fast on broken dependencies

```js
const { CircuitBreaker, CircuitOpenError } =
  require('./src/resilience/circuit-breaker');

const mfhBreaker = new CircuitBreaker({
  name: 'mfh-gateway',
  failureThreshold: 5,          // 5 failures
  windowMs: 30_000,             // in a 30s rolling window → OPEN
  timeoutMs: 60_000,            // stay OPEN for 60s, then HALF_OPEN
  successThreshold: 2,          // 2 probes pass → CLOSED
  onStateChange: (from, to) =>
    logger.warn({ from, to }, 'mfh breaker state changed'),
});

try {
  const result = await mfhBreaker.execute(() => submitPcn836(doc));
} catch (err) {
  if (err instanceof CircuitOpenError) {
    // Short-circuit path — surface a 503 to the client, push to DLQ, etc.
    throw new Error('MFH temporarily unavailable — try again later');
  }
  throw err;
}
```

### State machine

```
           failures >= threshold in window
   CLOSED ──────────────────────────────────▶ OPEN
     ▲                                         │
     │ successes >= successThreshold           │ timeoutMs elapsed
     │                                         ▼
     └────────────────── HALF_OPEN  ◀──────────┘
                          (one probe at a time)
```

Any failure while in `HALF_OPEN` immediately re-opens the breaker and
resets the success counter, so a flaky upstream cannot sneak through.

`halfOpenMaxConcurrent` (default `1`) caps how many probes may run
simultaneously during recovery; overflow requests short-circuit with
`CircuitOpenError` just like an `OPEN` state.

### Introspection

```js
mfhBreaker.snapshot();
// {
//   name: 'mfh-gateway',
//   state: 'CLOSED',
//   failureCount: 2,
//   openedAt: null,
//   halfOpenInFlight: 0,
//   halfOpenSuccesses: 0
// }
```

---

## 3. `dead-letter-queue` — file-backed DLQ with admin API

Any operation that fails after all retries should be persisted to a DLQ so
a human operator (or replay cron) can inspect & retry it. The store is a
plain JSONL file under `data/dlq/<queue>.jsonl`, plus a tombstone file and
an audit log.

```js
const {
  createDeadLetterQueue,
  registerAdminRoutes,
} = require('./src/resilience/dead-letter-queue');

const emailDLQ = createDeadLetterQueue('email');

try {
  await sendWithRetry(email);
} catch (err) {
  emailDLQ.add({
    operation: 'send-email',
    inputs: email,
    error: err,
    attempts: 5,
  });
}

// Mount admin routes on the Express app:
registerAdminRoutes(app, {
  auth: requireAdmin,            // your existing auth middleware
  replayRunner: async (entry) => {
    if (entry.operation === 'send-email') return sendEmail(entry.inputs);
    if (entry.operation === 'pcn836-post') return submitPcn836(entry.inputs);
    throw new Error(`unknown operation ${entry.operation}`);
  },
});
```

### Admin endpoints

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/api/admin/dlq/:queue` | List active entries (use `?includeDeleted=1` to see tombstoned) |
| `POST` | `/api/admin/dlq/:queue/replay/:id` | Re-execute via the configured `replayRunner` |
| `DELETE` | `/api/admin/dlq/:queue/:id` | Tombstone an entry; writes audit log with `actor` + `reason` |

### Storage layout

```
data/dlq/
├─ <queue>.jsonl          # append-only entries
├─ <queue>.tombstones     # one id per line — never-destructive deletes
└─ <queue>.audit.jsonl    # one JSON per admin action (remove/replay)
```

Each DLQ row looks like:

```json
{
  "id": "a3f8...",
  "operation": "send-email",
  "inputs": { "to": "a@b", "subject": "..." },
  "error": { "name": "Error", "message": "SMTP 550", "stack": "...", "status": null },
  "attempts": 5,
  "enqueuedAt": "2026-04-11T09:12:03.112Z",
  "lastUpdatedAt": "2026-04-11T09:12:03.112Z",
  "deleted": false
}
```

> **Scale note** — the JSONL store is O(n) on every read. It is intended
> for operational dead-letters (tens to low-thousands of rows). If a queue
> grows beyond that, swap `DeadLetterQueue` for a persistent backend
> (Redis Streams, Postgres) behind the same interface — the admin routes
> will continue to work untouched.

---

## 4. `idempotency-key` — response-caching middleware

Clients send `Idempotency-Key: <unique-string>` on mutating requests.
The middleware caches the final response for 24h and replays it on
duplicates so the handler never runs twice for the same submission.

```js
const { idempotencyMiddleware } = require('./src/resilience/idempotency-key');

app.use(idempotencyMiddleware({
  ttlMs: 24 * 60 * 60 * 1000,            // 24h cache
  methods: ['POST', 'PUT', 'PATCH'],     // which verbs opt-in
  required: false,                       // true = 400 if header missing
}));
```

### Semantics

| Condition | Status | Behavior |
|---|---|---|
| Header missing (and `required: false`) | — | Passed through, no caching |
| Header missing (and `required: true`) | `400` | Error body, handler not called |
| Key new → handler succeeds (2xx) | handler status | Response cached for `ttlMs` |
| Key new → handler returns 4xx | handler status | Response cached |
| Key new → handler returns 5xx | handler status | **NOT** cached, caller may retry |
| Duplicate with **same** body hash | cached status | Replayed, sets `Idempotent-Replay: true` |
| Duplicate with **different** body | `409` | Conflict |
| Duplicate while original in-flight | `425` | Too Early |

The body hash is SHA-256 of the JSON-serialized request body (or the
raw string / Buffer), so differing payloads under the same key fail
loudly instead of silently returning stale responses.

> **Single-process only.** The cache lives in a `Map` inside the process.
> For multi-instance deployments, back it with Redis using the same
> get/set shape; the middleware already guards against races with an
> in-flight "pending" marker.

---

## 5. `timeout-wrapper` — bound any promise

```js
const { withTimeout, TimeoutError } =
  require('./src/resilience/timeout-wrapper');

// Flavor 1: plain promise
try {
  const result = await withTimeout(somePromise, 5_000, 'query took too long');
} catch (err) {
  if (err instanceof TimeoutError) { /* ... */ }
}

// Flavor 2 (preferred): factory receives an AbortSignal so the
// underlying work is actually cancelled when the timer fires.
const body = await withTimeout(
  (signal) => fetch('https://slow.example', { signal }),
  2_000,
  'upstream fetch timed out',
);
```

`TimeoutError` has:

```js
err.name        // 'TimeoutError'
err.code        // 'ETIMEDOUT'
err.timeoutMs   // number — configured budget
err.isTimeout   // true
```

Best-effort cancellation also checks `target.cancel()`, `target.abort()`,
and `target.controller.abort()` on the resolved value, to cover older
libraries that don't speak `AbortSignal` yet.

---

## Combining the primitives

The typical ONYX upstream integration chains all five:

```js
const { retry } = require('./src/resilience/retry');
const { withTimeout } = require('./src/resilience/timeout-wrapper');
const { CircuitBreaker, CircuitOpenError } =
  require('./src/resilience/circuit-breaker');
const { createDeadLetterQueue } = require('./src/resilience/dead-letter-queue');

const cb = new CircuitBreaker({ name: 'mfh', failureThreshold: 5, windowMs: 30_000 });
const dlq = createDeadLetterQueue('mfh-submissions');

async function submitSafely(doc) {
  const attempt = retry(
    () => cb.execute(() =>
      withTimeout((signal) => submitPcn836(doc, { signal }), 10_000,
        'PCN836 submit timed out'),
    ),
    { maxAttempts: 5, backoff: 'exponential', initialDelayMs: 1_000, jitter: true },
  );
  try {
    return await attempt();
  } catch (err) {
    if (err instanceof CircuitOpenError) throw err; // surface 503 upstream
    dlq.add({
      operation: 'pcn836-post',
      inputs: doc,
      error: err,
      attempts: 5,
    });
    throw err;
  }
}
```

Layer order (inside → outside): **timeout → circuit breaker → retry → DLQ**.
That order guarantees each retry attempt has its own timeout budget, the
breaker opens when the upstream is genuinely down, and only definitively
failed work lands in the dead-letter queue.

---

## Running the tests

```bash
# full resilience pack
node --test src/resilience/retry.test.js
node --test src/resilience/circuit-breaker.test.js
node --test src/resilience/dead-letter-queue.test.js
```

All three suites are fully hermetic:
- `retry.test.js` uses tiny delays (1ms) so the whole suite finishes in
  well under a second.
- `circuit-breaker.test.js` injects a fake `now()` for deterministic
  state-transition tests.
- `dead-letter-queue.test.js` writes into per-test `os.tmpdir()` folders
  so the real `data/dlq/` directory is never touched.

---

## Design notes

- **Zero deps.** Every module uses only Node built-ins (`fs`, `path`,
  `crypto`, `events`, `node:test`). No runtime install required.
- **Process-local state.** The DLQ is file-backed (safe across restarts),
  but the circuit breaker and idempotency cache live in-memory. For
  multi-instance deployments, shard by host or replace with a shared
  store (Redis).
- **Observability hooks.** Every module exposes a callback surface
  (`onRetry`, `onStateChange`, `onHit`, audit log) so ONYX's pino logger
  can tap in without coupling the resilience code to a specific logger.
- **No deletions, ever.** DLQ "removes" write a tombstone — the original
  row stays on disk for compliance and forensic replay.
