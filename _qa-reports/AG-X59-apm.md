# AG-X59 — Application Performance Monitoring (APM)

**Agent:** X-59
**System:** Techno-Kol Uzi mega-ERP — Swarm 3D
**Date:** 2026-04-11
**Module:** `onyx-procurement/src/ops/apm.js`
**Test file:** `onyx-procurement/test/payroll/apm.test.js`
**Status:** PASS — 41/41 tests green
**Runtime:** ~153 ms (Node built-in test runner)
**Dependencies:** ZERO — stdlib only (`perf_hooks`, `os`, `process`, `events`)

---

## Mission

Build a zero-dependency Application Performance Monitor for the ONYX
Procurement platform that captures latency, throughput, and runtime health
across 10 measurement surfaces, aggregates them over rolling windows with
quantile distributions, and feeds Prometheus (X-52) + log store (X-54)
without ever breaking the host application.

Bilingual (he/en), never deletes existing code, never throws from the hot
path.

---

## Measurements implemented (10 / 10)

| # | Measurement | Recorder | Storage |
|---|---|---|---|
| 1 | HTTP request latency (route-level) | `recordRequest({route, method, duration, status})` | `requests` ring |
| 2 | DB query time (per table / op) | `recordQuery({operation, table, duration, rows})` | `queries` ring |
| 3 | External API call time (per endpoint) | `recordExternalCall({host, duration, status})` | `externals` ring |
| 4 | Cache hit/miss ratio | `recordCacheAccess({key, hit})` | `cache` ring |
| 5 | Queue wait + processing time | `recordQueue({queue, wait, process})` | `queueWait` + `queueProc` rings |
| 6 | Background job duration | `recordJob({name, duration, success})` | `jobs` ring |
| 7 | Memory delta per request (heap) | `recordMemoryDelta({route, delta})` (auto via middleware) | `memDelta` ring |
| 8 | Event loop lag | `recordEventLoopLag(ms)` + auto sampler | `eventLoop` ring |
| 9 | GC pressure | Auto via `PerformanceObserver({entryTypes:['gc']})` | `gcPause` ring + kind counters |
| 10 | CPU profiling (sample-based) | Auto via `process.cpuUsage()` delta sampler | `cpuSamples` ring |

All recorders are wrapped in `try { ... } catch { /* swallow */ }` — they
never throw from the hot path, enforced by the `recorders never throw
when given garbage input` test case.

---

## Aggregation

### Rolling windows
`WINDOWS = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '1d': 86_400_000 }`

`getMetrics(windowArg)` accepts either:
- a named alias (`'1m'`, `'5m'`, ...)
- a raw `ms` number
- or nothing (defaults to `5m`)

### Quantiles
`quantileSorted(sortedValues, q)` — linear interpolation between ranks.
Returns P50, P75, P90, P95, P99 per measurement group.

### Apdex
`apdex(window, t?) → { score, total, satisfied, tolerating, frustrated, t }`
- satisfied: `d <= t`
- tolerating: `t < d <= 4t`
- frustrated: `d > 4t` **or** any request with status >= 500
- score: `(s + tol/2) / total`, rounded to 4 decimal places
- default `t = 500 ms`, overridable per call and per Apm instance
- empty window returns `{ score: 1, total: 0 }` (vacuously satisfied)

### Throughput + error rate
Computed inside `getMetrics()` on the filtered request window:
- `throughput_per_sec = count / (window_ms / 1000)`
- `error_rate = error_count / count`

### Top-N
- `topSlowRoutes(limit, window)` — grouped by `METHOD route`, sorted by p95 desc
- `topSlowQueries(limit, window)` — grouped by `operation:table`, sorted by p95 desc

Each result item contains `count`, `mean`, `p95`, `p99`, `total_ms`.

### Health score
`healthScore() → { score, status, label_he, label_en, components }`

Weighted blend (out of 100):
- **25** — request p95 vs 1 s target
- **25** — error rate vs 10 % target
- **20** — apdex score (5m)
- **15** — event-loop lag p95 vs 100 ms target
- **10** — cache hit ratio
- **5** — GC pause p95 vs 100 ms target

Thresholds:
- `>= 80` → `healthy` / `תקין`
- `>= 50` → `degraded` / `ירידת ביצועים`
- `<  50` → `critical` / `קריטי`

---

## Exports

```
createApm(opts) → Apm
  opts: { lang, apdexT, ringCap, eventLoopSampleMs, cpuSampleMs }

apm.recordRequest({route, method, duration, status, error?, ts?})
apm.recordQuery({operation, table, duration, rows?, ts?})
apm.recordExternalCall({host, duration, status, error?, ts?})
apm.recordCacheAccess({key, hit, ts?})
apm.recordQueue({queue, wait, process, ts?})
apm.recordJob({name, duration, success, ts?})
apm.recordMemoryDelta({route, delta, ts?})
apm.recordEventLoopLag(ms)
apm.recordGcPause(ms, kind)
apm.recordCpuSample(microsDelta)

apm.getMetrics(window?)
apm.topSlowRoutes(limit, window)
apm.topSlowQueries(limit, window)
apm.apdex(window, t?)
apm.healthScore()
apm.snapshot()
apm.reset()

// Runtime monitors
apm.start()   // enables event-loop, CPU, and GC samplers
apm.stop()

// Integrations
apm.useProm(registry)     // X-52 — prom-client-compatible
apm.useLogStore(store)    // X-54 — any {append|record|write}(entry)

// Express middleware
apm.apmMiddleware() → (req, res, next) => ...

// DB wrapper
apm.wrapQuery(originalQuery, { table? }) → timed driver
```

---

## Integration surface

### X-52 (Prometheus metrics.js)

`apm.useProm(require('./src/ops/metrics'))` will automatically forward:
- HTTP latency → `httpRequestDurationSeconds.observe({method, route}, seconds)`
- HTTP counts → `httpRequestsTotal.inc({method, route, status})`
- DB latency → `dbQueryDurationSeconds.observe({op}, seconds)`

Works with both the X-52 shape (`{ metrics: {...} }`) and a raw `{metrics}` object.

### X-54 (log store)

`apm.useLogStore(store)` accepts any object with an `append(entry)`,
`record(entry)`, or `write(entry)` method. APM emits:

```json
{
  "ts": "2026-04-11T09:00:00.000Z",
  "source": "apm",
  "kind": "http",
  "payload": { "route": "/api/rfq", "method": "POST", "status": 201, "duration": 120 }
}
```

Kinds emitted: `http`, `db`, `ext`, `job`.

**Failure isolation:** both integration sinks are wrapped in try/catch —
a sink that throws cannot break `recordRequest` (verified by test case
*useProm / useLogStore sinks that throw do not break recorders*).

---

## Bilingual labels (he/en)

Health statuses and summary labels return both Hebrew and English:

| Key | en | he |
|---|---|---|
| healthy | healthy | תקין |
| degraded | degraded | ירידת ביצועים |
| critical | critical | קריטי |
| apdex_excellent / good / fair / poor | ... | מצוין / טוב / סביר / חלש |
| route / query / errors / throughput | ... | נתיב / שאילתא / שגיאות / תפוקה |
| cpu / event_loop / gc_pause | ... | מעבד / השהיית לולאה / השהיית איסוף זבל |

Unknown keys return the key itself (safe fallback).

---

## Bounded memory

Every measurement uses a `RingBuffer` with a fixed capacity
(default 4096; configurable via `ringCap`). Once full, the oldest entries
are overwritten on the next write. Counters (cumulative totals) are kept
separately in `apm.counters`, so long-running dashboards can still show
lifetime stats.

Verified by *ring buffer capacity is respected across many requests*:
pushing 200 requests into a `ringCap: 32` instance leaves exactly 32 in
the ring while `counters.requests_total === 200`.

---

## Test matrix (41 cases, 10 groups)

| Group | Tests | Coverage |
|---|---|---|
| 1. Factory + instance | 2 | defaults + custom opts |
| 2. Quantile + summarize | 3 | edges, interpolation, empty |
| 3. RingBuffer | 2 | wrap-around, time-window filter |
| 4. recordRequest + throughput + error rate | 2 | counters, error rate, req/sec |
| 5. Apdex | 4 | mix, empty, 5xx=frustrated, per-call t override |
| 6. DB measurements | 2 | per-table aggregation, top slow queries |
| 7. External calls | 1 | error counts per host |
| 8. Cache hit ratio | 1 | hit_ratio + miss_ratio math |
| 9. Queue wait + process | 1 | dual latency tracking |
| 10. Background jobs | 1 | failures + failure_rate |
| 11. Top slow routes | 1 | p95 sort + method prefix |
| 12. Health score | 2 | healthy + critical paths, Hebrew labels |
| 13. wrapQuery | 3 | Promise success, Promise reject, callback |
| 14. SQL parser | 1 | SELECT, INSERT, UPDATE, DELETE, WITH/JOIN |
| 15. Bilingual labels | 1 | Hebrew + English + fallback |
| 16. Integration hooks (X-52 + X-54) | 2 | fake prom registry + log store |
| 17. Express middleware | 1 | EventEmitter-based res.finish flow |
| 18. Runtime signal recorders | 1 | memory/event loop/gc/cpu all flow |
| 19. Window resolution | 1 | every alias + raw ms + bogus fallback |
| 20. Never-throw | 1 | null/undefined/garbage inputs |
| 21. Reset + snapshot | 2 | state clear + snapshot shape |
| 22. Bounded memory | 1 | ringCap enforcement |
| 23. start/stop | 1 | runtime monitor lifecycle |
| 24. Time-window isolation | 1 | old samples excluded from tight window |
| 25. Top-N limits | 2 | route + query limit honoured |
| 26. Integration failure isolation | 1 | throwing sinks do not break recorders |

**Total:** 41 tests, all passing.

---

## Test run

```
node --test onyx-procurement/test/payroll/apm.test.js

ℹ tests 41
ℹ pass 41
ℹ fail 0
ℹ duration_ms 152.82
```

---

## Safety guarantees

- **Zero npm dependencies.** Only Node stdlib (`perf_hooks`, `os`,
  `process`, `events`).
- **Never throws from the hot path.** Every public recorder wraps its
  body in `try { ... } catch { /* swallow */ }`.
- **Never blocks request handling.** The Express middleware attaches to
  `res.on('finish', ...)` and does all work after the response is sent.
- **Bounded memory.** Every ring buffer is capacity-bounded.
- **Timers are unref'd.** Runtime monitors (`start()`) never hold the
  event loop open — the Node process can exit cleanly even with APM
  running.
- **Integration sinks are failure-isolated.** X-52 / X-54 sinks that
  throw are swallowed without touching the measurement.
- **Graceful degrade on older Node.** GC observer uses
  `PerformanceObserver` feature-detection; missing support is a no-op.

---

## Files delivered

| Path | Purpose | Lines |
|---|---|---|
| `onyx-procurement/src/ops/apm.js` | APM module | ~730 |
| `onyx-procurement/test/payroll/apm.test.js` | Test suite | ~500 |
| `_qa-reports/AG-X59-apm.md` | This report | — |

All three files are new. No existing code was deleted or modified.

---

**AG-X59 — DELIVERED.**
