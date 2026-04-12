# ONYX Ops

Low-level ops primitives for ONYX Procurement. Every module in this
directory is **zero-dependency** — stdlib only — so it can be loaded at
boot, runs in air-gapped deployments, and survives supply-chain incidents.

- [`metrics.js`](#prometheus-metrics) — Prometheus text exporter
- [`error-tracker.js`](#error-tracking) — Sentry-compatible error tracker

---

## Prometheus Metrics

Zero-dependency, `prom-client`-compatible text exporter for the ONYX
Procurement API. Implemented from scratch in `metrics.js` — **no npm
dependency is required**. Drop-in wiring lives in `server.js` behind a
`try { ... } catch {}` guard so a metrics failure can never take the API
offline.

## Endpoint

```
GET /metrics
Content-Type: text/plain; version=0.0.4; charset=utf-8
```

Produces the standard Prometheus text exposition format with `# HELP`,
`# TYPE`, and samples for every registered metric. Intended to be scraped
by Prometheus, Grafana Agent, VictoriaMetrics, or any compatible scraper.

The `/metrics` endpoint is excluded from its own measurements to avoid
polluting HTTP counters with scrape traffic.

## Metrics exposed

| Name | Type | Labels | Meaning |
|---|---|---|---|
| `http_requests_total` | counter | `method`, `route`, `status` | Total HTTP requests handled by the Express app. `route` is the matched route template (e.g. `/api/suppliers/:id`) to keep cardinality bounded. |
| `http_request_duration_seconds` | histogram | `method`, `route` | Request latency in seconds. Buckets: `0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10`. |
| `db_query_duration_seconds` | histogram | `op` | Database query latency in seconds. Buckets: `0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10`. Callers record with `metrics.dbQueryDuration.observe({ op: 'select' }, seconds)`. |
| `payroll_slips_generated_total` | counter | `status` | Count of payroll slips generated. `status` is typically `ok`, `error`, or a domain-specific outcome code. |
| `vat_exports_total` | counter | `period` | Count of VAT export files produced, labelled by reporting period (e.g. `2026-01`, `2026-Q1`). |
| `process_uptime_seconds` | gauge | - | Process uptime, computed at scrape time from `process.uptime()`. |
| `process_resident_memory_bytes` | gauge | - | Resident set size of the Node.js process at scrape time, from `process.memoryUsage().rss`. |

## Wiring (server.js)

The wiring block at the bottom of `server.js` is intentionally defensive:

```js
try {
  const { metricsMiddleware, metricsHandler } = require('./src/ops/metrics');
  app.use(metricsMiddleware);
  app.get('/metrics', metricsHandler);
} catch (e) {
  console.warn('⚠️  ops/metrics wiring skipped:', e && e.message);
}
```

- The middleware runs for every request, hooks `res.on('finish')`, and
  records `http_requests_total` + `http_request_duration_seconds`.
- `GET /metrics` renders the full registry as Prometheus text.
- The `try/catch` guarantees that a missing/bad `metrics.js` cannot
  prevent the API from booting.

## Instrumenting domain events

```js
const { metrics } = require('./src/ops/metrics');

// Payroll slip generated
metrics.payrollSlipsGenerated.inc({ status: 'ok' });
metrics.payrollSlipsGenerated.inc({ status: 'error' });

// VAT export produced
metrics.vatExports.inc({ period: '2026-Q1' });

// Database query timing
const end = metrics.dbQueryDuration.startTimer({ op: 'select' });
// ... await db.query(...)
end();
```

## Prometheus scrape example

Add to `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: onyx-procurement
    metrics_path: /metrics
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:3100']
        labels:
          service: onyx-procurement
          env: production
```

Quick sanity check from the shell:

```bash
curl -s http://localhost:3100/metrics | head -40
```

You should see blocks like:

```
# HELP http_requests_total Total number of HTTP requests handled, labelled by method, route, and status code.
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/api/status",status="200"} 3
# HELP http_request_duration_seconds HTTP request latency in seconds, labelled by method and route.
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="GET",route="/api/status",le="0.01"} 2
http_request_duration_seconds_bucket{method="GET",route="/api/status",le="0.05"} 3
...
http_request_duration_seconds_bucket{method="GET",route="/api/status",le="+Inf"} 3
http_request_duration_seconds_sum{method="GET",route="/api/status"} 0.0421
http_request_duration_seconds_count{method="GET",route="/api/status"} 3
# HELP process_uptime_seconds Process uptime in seconds since start.
# TYPE process_uptime_seconds gauge
process_uptime_seconds 42.19
# HELP process_resident_memory_bytes Resident set size (RSS) of the Node.js process, in bytes.
# TYPE process_resident_memory_bytes gauge
process_resident_memory_bytes 68493312
```

## Notes

- **Zero npm deps** — everything is hand-rolled on top of Node built-ins
  (`process.hrtime.bigint`, `process.memoryUsage`, `process.uptime`).
- **Label cardinality** — the middleware uses `req.route.path` when
  available, falling back to the URL with the query string stripped.
  Avoid passing user-supplied strings as label values.
- **Never blocks the request** — every call inside the middleware is
  wrapped in a try/catch; metric failures are silently swallowed.

---

## Error Tracking

`error-tracker.js` is a Sentry-compatible interface with **zero external
dependencies**. Captures exceptions and structured messages, scrubs PII,
and persists JSONL events to `onyx-procurement/logs/errors.jsonl` with
size-based rotation.

### Why not Sentry?

- ONYX runs in air-gapped / local-first deployments (construction sites,
  field offices) where outbound egress is not guaranteed.
- Zero third-party code on the error path means the tracker keeps working
  even during supply-chain incidents.
- JSONL is trivially `grep`-able and can be replayed into Sentry, Datadog,
  or Grafana Loki later via a thin exporter.

### API

```js
const tracker = require('./src/ops/error-tracker');

tracker.init({
  dsn: process.env.SENTRY_DSN || null,    // accepted for API parity, currently unused
  release: 'onyx@1.1.0',
  environment: process.env.NODE_ENV,
  maxBufferBytes: 5_000_000,              // upper bound on dedup cache memory
});

// Exceptions — deduped by message + top stack frame
try {
  doThing();
} catch (err) {
  tracker.captureException(err, { tags: { component: 'rfq' } });
}

// Structured messages
tracker.captureMessage('payment timeout', 'warning', {
  tags: { provider: 'isracard' },
});

// Per-request state (stored in AsyncLocalStorage)
tracker.setUser({ id: 'u-123' });        // email/ip are accepted but NEVER persisted
tracker.setTag('tenant', 'techno-kol-uzi');
tracker.setContext('runtime', { node: process.version });

// Express middleware — register LAST, after all routes
app.use(tracker.errorHandler());
```

### Deduplication

`captureException` computes `sha1(err.message + '|' + stack.split('\n')[1])`
and skips persistence for repeat fingerprints. A fingerprint cache is
kept in memory and capped by `maxBufferBytes`; the oldest half is
evicted once the cap is hit.

### PII scrubbing

Before any event is written to disk, the following field names are
replaced with `[REDACTED]` **recursively** in `tags`, `contexts`, and
nested objects (case-insensitive, underscores/hyphens normalized):

- `password`
- `token`
- `api_key` / `apikey`
- `credit_card` / `creditcard`
- `national_id` / `nationalid` (Israeli תעודת זהות)
- `tax_file` / `taxfile` (תיק ניכויים)

The `user` object passed via `setUser` is additionally stripped to only
`{ id }` before persistence — `email` and `ip` are silently dropped.

### Event shape

Each line in `logs/errors.jsonl` is a single JSON object:

```json
{
  "timestamp": "2026-04-11T09:00:00.000Z",
  "level": "error",
  "message": "ECONNREFUSED supabase.co",
  "stack": "Error: ECONNREFUSED supabase.co\n    at Socket.onError (/app/server.js:412:14)\n    at ...",
  "fingerprint": "3b1a8c4d2e9f...",
  "tags": { "component": "rfq", "method": "POST", "path": "/api/rfq/send", "status": 500 },
  "contexts": { "http": { "method": "POST", "url": "/api/rfq/send", "ua": "curl/8.4" } },
  "user": { "id": "u-123" },
  "release": "onyx@1.1.0",
  "environment": "production",
  "request_id": "req-5f9d2a1c"
}
```

### Rotation

- Rotates when `errors.jsonl` exceeds **10 MB**
- Keeps rotations at `.1`, `.2`, `.3`, `.4`, `.5`
- `.5` is dropped on the next rotation
- Rotation is checked on every write; failures are swallowed

### Wiring (server.js)

```js
try {
  const errorTracker = require('./src/ops/error-tracker');
  errorTracker.init({
    dsn: process.env.SENTRY_DSN || null,
    release: process.env.RELEASE || 'onyx@' + require('./package.json').version,
    environment: process.env.NODE_ENV || 'development',
    maxBufferBytes: 5_000_000,
  });
  app.use(errorTracker.requestScopeMiddleware());
  // ... routes ...
  app.use(errorTracker.errorHandler()); // must be LAST, after all routes
} catch (e) {
  console.warn('ops/error-tracker wiring skipped:', e && e.message);
}
```

### Tests

```bash
node --test onyx-procurement/src/ops/error-tracker.test.js
```

Covers: deduplication, PII scrubbing, rotation + retention cap,
Express middleware, safe-by-default write failures, tag/context merging,
`setUser` PII strip.

### Safety guarantees

- **Never throws.** All filesystem/serialization errors are caught and
  logged to `console.error` with the `[error-tracker]` prefix.
- **Zero deps.** Only `fs`, `path`, `crypto`, `async_hooks` from stdlib.
- **Bounded memory.** Fingerprint cache is capped by `maxBufferBytes`.
- **No network.** The module never opens a socket — DSN is accepted for
  API parity only.
