# Agent-X52 — Prometheus /metrics Exporter

**Swarm:** 3 — Techno-Kol Uzi ERP (Kobi mega-ERP)
**Date:** 2026-04-11
**Agent:** X-52
**Status:** PASS — 32/32 tests green on first run

---

## 1. Scope / ייעוד

Deliver a zero-dependency, RFC-compliant Prometheus text-exposition
(`version=0.0.4`) metrics exporter that can be mounted on the ERP's Express
app at `GET /metrics`. The existing `src/ops/metrics.js` remained untouched
per the never-delete rule; this new module (`src/ops/prom-metrics.js`) sits
alongside it as a richer, factory-based API.

This report documents:

- file layout + module boundaries,
- metric-type coverage (5 / 5),
- default process metrics + Node.js runtime metrics,
- ERP-specific seed metrics,
- Express middleware surface,
- test strategy + results.

## 2. Files delivered / קבצים שנוצרו

| Path | Purpose |
| ---- | ------- |
| `onyx-procurement/src/ops/prom-metrics.js` | The exporter (single file, 0 deps) |
| `onyx-procurement/test/payroll/prom-metrics.test.js` | 32 unit tests, `node --test` |
| `onyx-procurement/_qa-reports/AG-X52-prom-metrics.md` | This report |

**Zero deletions.** `src/ops/metrics.js` is preserved — both modules coexist.

## 3. Architecture / ארכיטקטורה

```
prom-metrics.js
├── helpers: escapeHelp, escapeLabelValue, canonicalLabelKey,
│            renderLabelBlock, formatValue, validateMetricName,
│            validateLabelNames
├── class Metric         (base)
├── class Counter        (monotonic, throws on negative / NaN / Infinity)
├── class Gauge          (set / inc / dec, supports negatives, optional
│                         collectFn for live samples)
├── class Histogram      (observe, startTimer → endFn, bucket + sum + count)
├── class Summary        (observe, quantile interpolation, ring-buffer
│                         capped at 1000 observations)
├── class Info           (labels-only, value always 1)
├── class Registry       (register / unregister / counter / gauge /
│                         histogram / summary / info / collect /
│                         contentType / clear)
├── createRegistry()
├── collectDefaultMetrics(registry)
├── registerErpMetrics(registry)
└── metricsEndpoint(registry) → (req,res) handler
```

### Design choices

1. **Canonical label keys** use an ASCII unit-separator (`\x1f`) between
   `name=value` pairs so different stringifications never collide (e.g.
   `{a: '1,b=2'}` vs `{a: '1', b: '2'}`).
2. **Argument order is flexible** — both `inc(value, labels)` and
   `inc({labels})` are accepted, so the API stays natural regardless of
   whether the caller has labels.
3. **Timers use `process.hrtime.bigint()`** — nanosecond precision, no
   dependency on `perf_hooks` (zero-dep).
4. **Default metrics use live collect callbacks** so the registry is
   evaluated at scrape time; CPU/RSS numbers are fresh every hit.
5. **Histograms emit cumulative `_bucket{le="..."}` lines** in ascending
   order, then `le="+Inf"`, then `_sum`, then `_count` — exactly per spec.
6. **Summaries interpolate quantiles** across a sorted copy of the
   observation window (max 1000 samples, ring-drop oldest). Good enough
   for ERP latencies without committing to a full CKMS implementation.
7. **`process_open_fds` is best-effort**: Linux (`/proc/self/fd`) gets
   the real count, other platforms report `0` so scrapes never fail.
8. **Event-loop lag is self-sampled**: each `collect()` call schedules a
   `setImmediate` lag probe and publishes the previous reading.

## 4. Metric-type coverage / כיסוי סוגי מטריקות

| Type | Class | API | Status |
| ---- | ----- | --- | ------ |
| Counter | `Counter` | `inc(value?, labels?) / reset() / get()` | OK |
| Gauge | `Gauge` | `set / inc / dec / get / reset` | OK |
| Histogram | `Histogram` | `observe / startTimer / reset` | OK |
| Summary | `Summary` | `observe / reset` | OK |
| Info | `Info` | `set(labels)` | OK |

All five types are exported from the module and registered through the
`Registry.counter/gauge/histogram/summary/info` factory methods.

## 5. Default process metrics / מטריקות ברירת מחדל

Registered by `collectDefaultMetrics(registry)`:

- `process_cpu_user_seconds_total` (counter, live-sampled from `process.cpuUsage().user`)
- `process_cpu_system_seconds_total` (counter, live-sampled)
- `process_resident_memory_bytes` (gauge, RSS from `process.memoryUsage()`)
- `process_heap_bytes` (gauge, `heapUsed`)
- `process_open_fds` (gauge, Linux-only real count, otherwise 0)
- `process_start_time_seconds` (gauge, unix epoch seconds of process start)
- `nodejs_eventloop_lag_seconds` (gauge, self-sampled `setImmediate` probe)
- `nodejs_active_handles` (gauge, `process._getActiveHandles().length`)
- `nodejs_active_requests` (gauge, `process._getActiveRequests().length`)

All implemented with zero external deps — only `node:process` (and optional
`node:fs` for `/proc/self/fd` on Linux).

## 6. ERP seed metrics / מטריקות ייעודיות ל-ERP

Registered by `registerErpMetrics(registry)`:

| Name | Type | Labels |
| ---- | ---- | ------ |
| `erp_http_requests_total` | counter | method, route, status |
| `erp_http_request_duration_seconds` | histogram | method, route |
| `erp_invoices_created_total` | counter | — |
| `erp_wage_slips_generated_total` | counter | — |
| `erp_db_query_duration_seconds` | histogram | operation, table |
| `erp_queue_size` | gauge | queue |
| `erp_cache_hits_total` | counter | — |
| `erp_cache_misses_total` | counter | — |

Returned as an object for direct wiring into application code:

```js
const registry = createRegistry();
collectDefaultMetrics(registry);
const erp = registerErpMetrics(registry);
app.get('/metrics', metricsEndpoint(registry));

// later…
erp.invoicesCreatedTotal.inc();
erp.wageSlipsGeneratedTotal.inc(5);
erp.queueSize.set(3, { queue: 'email' });
```

## 7. Express middleware / תוכנת ביניים

`metricsEndpoint(registry)` returns a pure `(req, res) → void` handler.
It is framework-agnostic — it uses `res.setHeader` / `res.status` /
`res.send` when available (Express), and falls back to `res.statusCode` /
`res.end` (native `http`) so tests can use a plain mock-res. The content
type is `text/plain; version=0.0.4; charset=utf-8`.

Errors during render are caught and served as a `500` with a
Prometheus-parseable comment body, so a broken metric can never crash the
request path.

## 8. Tests / בדיקות

`test/payroll/prom-metrics.test.js` — **32 tests, 100% pass**.

Coverage groups:

1. Registry factory + content type (2)
2. Counter API — inc, labels, negative rejection, NaN/Infinity rejection,
   reset, render (6)
3. Gauge API — set / inc / dec, negatives, labels (3)
4. Histogram — bucket population, labelled buckets, `startTimer` (3)
5. Summary — quantile estimates, quantile range validation (2)
6. Info metric (1)
7. Registry — duplicate-register rejection, text newline-termination,
   invalid metric/label names (4)
8. Default process metrics registration + rendering (1)
9. ERP seed metrics — presence + increment round-trip + cache counters (4)
10. `metricsEndpoint` — happy path + missing registry (2)
11. Label escaping (quote / backslash / newline) (1)
12. Internal: `canonicalLabelKey` stability + `DEFAULT_BUCKETS` ordering (2)
13. Full round-trip: default + ERP + custom, newline terminator (1)

### Run output

```
$ node --test test/payroll/prom-metrics.test.js
…
ℹ tests 32
ℹ suites 0
ℹ pass 32
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 155.523
```

## 9. Compliance checklist / רשימת תאימות

- [x] RFC-compliant Prometheus text format v0.0.4
- [x] `# HELP` and `# TYPE` lines emitted before every metric family
- [x] Label values escape `\\`, `\n`, `\"`
- [x] Histogram emits ascending `_bucket{le}`, then `+Inf`, then `_sum`, `_count`
- [x] Summary emits per-quantile samples + `_sum` + `_count`
- [x] Counters reject negative + NaN + Infinity
- [x] Metric / label name validation against Prometheus regex
- [x] Output terminates with a newline (so appends are safe)
- [x] Content-Type header is `text/plain; version=0.0.4; charset=utf-8`
- [x] Zero external dependencies (only `node:process`, `node:fs` optional)
- [x] Existing `src/ops/metrics.js` preserved — no deletions
- [x] Hebrew bilingual comments in source + this report
- [x] 20+ tests delivered → **32 tests delivered**
- [x] All tests pass

## 10. Follow-ups / ניסוי הקשחה (optional)

- Wire the new registry through `server.js` in parallel to the legacy
  registry (A/B during migration).
- Add a Grafana dashboard JSON under `ops/grafana/` that maps all
  `erp_*` series to RED/USE panels.
- Upgrade `Summary` to CKMS if/when we observe >1000 samples per window
  in production (currently ring-drop is acceptable for ERP workloads).
- Consider a `*_created` timestamp gauge alongside each counter for
  stale-series detection in alerting rules.

---

**Result: PASS.** 32/32 tests green, zero deps, never-delete respected,
Hebrew bilingual, production-ready.
