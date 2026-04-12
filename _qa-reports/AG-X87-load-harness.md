# AG-X87 — Load Harness (zero-dep k6/vegeta-style)

**Agent:** X87
**Date:** 2026-04-11
**Scope:** HTTP load testing framework for Techno-Kol Uzi Mega-ERP
**Status:** Delivered
**Rule:** לא מוחקים רק משדרגים ומגדלים

---

## Summary

Delivered a self-contained HTTP load harness built **only** on Node core
modules (`http`, `https`, `url`, `perf_hooks`, `worker_threads`, `fs`,
`events`). Zero external dependencies — `package.json` is untouched.

The harness is a k6/vegeta-style library (`require()`-able class
`LoadTester`) plus five pre-built scenarios that target the hottest ERP
paths (invoice list, invoice create, payroll run, VAT report, dashboard
home). It produces bilingual HTML reports with embedded inline-SVG charts
that reuse the Palantir dark palette from `AG-99-bi-dashboard.md` so the
visual language is consistent across the ERP.

**Files created** (no existing file was modified or deleted)

- `onyx-procurement/src/load/load-harness.js` — main library, ~1,050 LOC
- `onyx-procurement/test/load/scenarios/invoice-list.js`
- `onyx-procurement/test/load/scenarios/invoice-create.js`
- `onyx-procurement/test/load/scenarios/payroll-run.js`
- `onyx-procurement/test/load/scenarios/vat-report.js`
- `onyx-procurement/test/load/scenarios/dashboard-home.js`
- `onyx-procurement/test/load/load-harness.test.js` — 40 unit + integration tests
- `_qa-reports/AG-X87-load-harness.md` — this report

**Test status:** 40/40 passing (`node --test test/load/load-harness.test.js`)

```
ℹ tests 40
ℹ pass 40
ℹ fail 0
ℹ duration_ms 4416
```

---

## Why another load harness?

The repo already contains `test/load/qa-15-lib.js` — a tight, scenario-
focused runner owned by QA-15. AG-X87 is its larger sibling: a **library**,
not a one-shot runner.

| Dimension | `qa-15-lib.js` | `src/load/load-harness.js` |
|---|---|---|
| Target consumer | QA-15 scenarios | Any team (backend, UI, release eng) |
| Runner model | worker pool + rate limiter | Multi-stage + worker_threads or coroutines |
| Threshold syntax | Simple object `{p95_ms, p99_ms, err_rate}` | k6-compatible string DSL `p(95)<500` |
| Metrics | p50/p95/p99 + err rate | All 12 k6 metrics (duration, waiting, connecting, sending, receiving, failed, data_sent/received, vus, vus_max, iterations, http_reqs) |
| Stages | Fixed 2-phase | Free-form `[{duration,target},...]` |
| Reports | Console + JSON | JSON + JUnit + HTML (bilingual, embedded SVG) |
| External deps | 0 | 0 |

Both live in the tree — neither deletes nor supersedes the other.

---

## Public API

```js
const { LoadTester } = require('./src/load/load-harness');

// 1. Construct with a base URL
const lt = new LoadTester({
  baseUrl: 'http://localhost:3100',
  defaultHeaders: { 'X-API-Key': 'test-api-key' },
  runner: 'coroutines',   // or 'workers'
});

// 2. Register scenarios
lt.addScenario({
  name:   'list-invoices',
  url:    '/api/invoices?limit=50',
  method: 'GET',
  headers: { 'Accept': 'application/json' },
  body:   null,
  weight: 5,
});

// 3a. Classic 3-phase run
const report = await lt.run({
  vus:      20,
  duration: 30_000,
  rampUp:    5_000,
  rampDown:  5_000,
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1500'],
    http_req_failed:   'rate<0.01',
  },
});

// 3b. Or multi-stage (k6-compatible)
await lt.runStages([
  { duration: 10_000, target: 20 },   // ramp to 20 VUs over 10s
  { duration: 30_000, target: 20 },   // steady at 20 for 30s
  { duration:  5_000, target: 50 },   // spike to 50
  { duration: 10_000, target:  0 },   // drain
]);

// 4. Evaluate thresholds independently of run()
const tResults = lt.checkThresholds({ http_req_duration: 'avg<200' });

// 5. Export artifacts
lt.exportJSON('./out/report.json');
lt.exportJUnit('./out/junit.xml');
lt.exportHTML('./out/report.html');
```

Events emitted (via `EventEmitter`):

- `request` — per HTTP call `{ scenario, result }`
- `warn`    — soft warnings (e.g., worker_threads fallback)
- `end`     — full report object on run completion

---

## Metric definitions

All 12 k6-compatible metrics are captured. Names + Hebrew glossary at the
bottom of this doc.

| Metric | Kind | Definition |
|---|---|---|
| `http_reqs` | counter | Total HTTP requests dispatched |
| `http_req_duration` | trend (ms) | Full request wallclock: `connect + send + wait + receive` |
| `http_req_waiting` | trend (ms) | Time-to-first-byte (server think time) |
| `http_req_connecting` | trend (ms) | TCP connection setup time |
| `http_req_sending` | trend (ms) | Time spent uploading the request body |
| `http_req_receiving` | trend (ms) | Time spent downloading the response body |
| `http_req_failed` | rate | Fraction of requests with `ok === false` |
| `data_sent` | counter (bytes) | Total request body bytes uploaded |
| `data_received` | counter (bytes) | Total response body bytes downloaded |
| `vus` | gauge | Current in-flight virtual users |
| `vus_max` | gauge | Peak `vus` observed |
| `iterations` | counter | Total scenario loop iterations |

Per-trend stats exposed in the report:
`count, min, max, avg, med (=p50), p50, p90, p95, p99`.

---

## Threshold syntax (k6 subset)

```
<aggregate> <operator> <numeric-target>
```

### Aggregates

| Form | Meaning | Valid on |
|---|---|---|
| `p(N)` | Nearest-rank Nth percentile (N integer 0..100) | trend |
| `avg`  | Arithmetic mean                                | trend |
| `min`  | Minimum sample                                 | trend |
| `max`  | Maximum sample                                 | trend |
| `med`  | Median (= p50)                                 | trend |
| `rate` | Fraction of truthy samples                     | rate |
| `count` | Total sample count / counter value             | any |
| `value` | Raw scalar                                     | gauge / counter |

### Operators

`<`, `>`, `<=`, `>=`, `==`, `!=`

### Examples

```js
thresholds: {
  http_req_duration: [
    'p(95)<500',       // 95th percentile below 500ms
    'p(99)<1500',      // 99th percentile below 1.5s
    'avg<200',         // mean below 200ms
    'max<10000',       // no request over 10s
  ],
  http_req_failed: 'rate<0.01',     // < 1% failure rate
  iterations:      'count>100',     // at least 100 iterations
  vus_max:         'value>=10',     // peak reached at least 10 VUs
}
```

A threshold can be a single string **or** an array of strings. Each entry
becomes a `<testcase>` in the JUnit export.

### Evaluation semantics

`checkThresholds()` returns:

```js
{
  http_req_duration: [
    { ok: true,  actual: 245.3, target: 500,  op: '<', aggregate: 'p95', raw: 'p(95)<500' },
    { ok: false, actual: 612.1, target: 500,  op: '<', aggregate: 'p99', raw: 'p(99)<500' },
  ],
  http_req_failed: [
    { ok: true,  actual: 0.004, target: 0.01, op: '<', aggregate: 'rate', raw: 'rate<0.01' },
  ],
}
```

`report.passed === true` iff every threshold entry has `ok === true`.

---

## Scenario format

```js
{
  name:    'list-invoices',           // required, unique
  url:     '/api/invoices',           // required, relative or absolute
  method:  'GET',                     // default 'GET'
  headers: { 'X-API-Key': '...' },    // merged over defaultHeaders
  body:    { ... } | 'string' | null, // JSON-stringified if object
  weight:  5,                         // relative weight; default 1
  timeout: 30000,                     // ms; default 30000
  expect:  [200, 304],                // OK status codes; default 2xx/3xx
}
```

Weights are relative — a scenario with `weight: 3` runs 3× as often as
`weight: 1` in a mixed-workload run.

---

## Pre-built scenarios

All five live in `test/load/scenarios/*.js` and export a factory
function taking an optional `opts` override:

| File | Weight | Method | Path | Purpose |
|---|---|---|---|---|
| `dashboard-home.js`  | 6 | GET  | `/api/dashboard/home` | KPI landing page (hottest read) |
| `invoice-list.js`    | 5 | GET  | `/api/invoices`       | Paginated invoice listing |
| `vat-report.js`      | 2 | GET  | `/api/vat/report?period=…` | 874 VAT file |
| `invoice-create.js`  | 1 | POST | `/api/invoices`       | New supplier invoice (write path) |
| `payroll-run.js`     | 1 | POST | `/api/payroll/run`    | Monthly payroll calc (`dry_run: true` default) |

Usage:

```js
const lt = new LoadTester({ baseUrl: 'http://localhost:3100' });
lt.addScenario(require('./test/load/scenarios/dashboard-home')());
lt.addScenario(require('./test/load/scenarios/invoice-list')());
lt.addScenario(require('./test/load/scenarios/invoice-create')({ apiKey: 'prod-key' }));
lt.addScenario(require('./test/load/scenarios/vat-report')({ period: '2026-03' }));
lt.addScenario(require('./test/load/scenarios/payroll-run')());
```

`payroll-run.js` defaults to `dry_run: true` so a load run **never**
commits real payroll data. `invoice-create.js` generates a unique
`invoice_number` per call and never calls DELETE — the rule
"לא מוחקים רק משדרגים ומגדלים" holds end-to-end.

---

## Runner modes

### 1. Coroutines (default)

Pure async — no worker_threads. Each "virtual user" is an async loop on
the main thread's event loop. Dispatches requests via core `http(s)`,
awaits responses, yields via `setImmediate` between iterations so
bookkeeping runs. Best for network-bound scenarios where the bottleneck
is socket wait time, which is ~95% of real load tests.

### 2. worker_threads

Set `runner: 'workers'` to spin one OS thread per VU. The worker source
is inlined as a string (`new Worker(src, { eval: true })`) so the harness
stays a single-file library — no auxiliary `.js` files to ship. Each worker
re-implements a narrow `httpRequest` function and posts per-request
results back via `parentPort`. The main thread folds them into the
metrics collector. If `worker_threads` isn't available (e.g., old Node),
the harness emits a `warn` event and falls back to coroutines silently.

Choose `workers` when scenarios do non-trivial CPU work (e.g., JSON parse
or body generation). Otherwise `coroutines` is faster and lighter.

---

## Stage transitions

`runStages(stages[])` replaces `run()` for multi-stage shapes (spike,
soak, stair-step). Each stage has `{ duration, target }` where `target`
is the VU level to **reach by the end** of this stage. The harness
linearly interpolates between stage targets, sampling at 100ms intervals.

```
stage.fromVus         = previous stage target (or 0 for the first stage)
stage.toVus           = stage.target
vus(t) within stage   = round(fromVus + (toVus - fromVus) * t / duration)
```

At each sample tick the harness:

1. Starts new slots to bring `currentActive` up to `vus(t)`
2. Flags excess slots for shutdown to bring it down
3. Records a `{ t_ms, vus }` point into the timeline array
4. Updates the `vus` gauge and `vus_max`

Slot loops that receive a shutdown flag drain their in-flight request,
emit a final stats record, and exit. The harness waits for all loops
to drain before computing the final report — so "ramp down" gives a
truthful tail-latency picture, not a truncated one.

Timeline data is sampled at 100ms cadence and embedded verbatim in the
JSON and HTML exports.

---

## Exporters

### `exportJSON(path)`

Writes the full report object — metrics, thresholds, scenarios, VUs
timeline, wallclock timestamps. Parent directories are created via
`fs.mkdirSync(..., {recursive:true})` so any `path` works on a clean
checkout.

### `exportJUnit(path)`

Writes a JUnit XML file where each threshold expression is a `<testcase>`
under a `<testsuite name="LoadTester">`. Failed thresholds include a
`<failure type="threshold" message="..."/>` child with `actual op target`.
CI systems (GitHub Actions, Jenkins, GitLab) render these natively.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="OnyxLoadHarness" tests="3" failures="1">
  <testsuite name="LoadTester" tests="3" failures="1" time="30.042" timestamp="2026-04-11T09:12:34.567Z">
    <testcase classname="load" name="http_req_duration p(95)<500" time="30.042"/>
    <testcase classname="load" name="http_req_duration p(99)<1500" time="30.042">
      <failure type="threshold" message="actual=1847.3 &lt; target=1500  → FAIL"/>
    </testcase>
    <testcase classname="load" name="http_req_failed rate<0.01" time="30.042"/>
  </testsuite>
</testsuites>
```

### `exportHTML(path)`

Writes a **self-contained** HTML report with embedded `<style>` and
inline `<svg>` charts — no external CSS, no CDN fonts, no JavaScript.
Safe to email, archive, or open directly from disk.

The report reuses the `BI_THEME` palette from
`payroll-autonomous/src/components/BIDashboard.jsx`
(`#0b0d10 / #13171c / #4a9eff`) for visual consistency with the rest of
the ERP. Hebrew titles are first-class, English subtitles follow. The
root `<html dir="rtl" lang="he">`.

---

## HTML report sample

Layout (top → bottom):

```
┌──────────────────────────────────────────────────────────────┐
│ דו"ח עומס · Load Test Report            [PASS · עבר]         │
│ Techno-Kol Uzi Mega-ERP · Load Harness Agent X87 · 2026-04-11 │
├──────────────────────────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                          │
│ │ reqs │ │ rps  │ │ err  │ │ p95  │   (KPI grid — 8 cards)   │
│ │ 2,451│ │ 82.3 │ │ 0.2% │ │ 248ms│                          │
│ └──────┘ └──────┘ └──────┘ └──────┘                          │
├──────────────────────────────┬───────────────────────────────┤
│ משתמשים וירטואליים לאורך זמן │ התפלגות השהיה                │
│ Virtual Users Timeline       │ Latency distribution          │
│                              │                               │
│    ┌─────────────┐           │   █                           │
│   ╱               ╲          │   █                           │
│  ╱                 ╲         │   █   █   █   █               │
│ ╱  ramp hold drain  ╲        │   █   █   █   █   █   █       │
│────────────────────────      │  min avg p50 p90 p95 p99 max  │
│ (inline-SVG line chart)      │ (inline-SVG bar chart)        │
├──────────────────────────────┴───────────────────────────────┤
│ ספי קבלה · Thresholds                                        │
│  Metric              Expression         Actual       Verdict │
│  http_req_duration   p(95)<500          248.1        PASS ✓  │
│  http_req_duration   p(99)<1500         612.9        PASS ✓  │
│  http_req_failed     rate<0.01          0.002        PASS ✓  │
├──────────────────────────────────────────────────────────────┤
│ תרחישים · Scenarios                                          │
│  Name              Request                         Weight    │
│  dashboard-home    GET /api/dashboard/home         6         │
│  invoice-list      GET /api/invoices?limit=50      5         │
│  vat-report        GET /api/vat/report?period=...  2         │
│  invoice-create    POST /api/invoices              1         │
│  payroll-run       POST /api/payroll/run           1         │
├──────────────────────────────────────────────────────────────┤
│ מדדים מפורטים · Detailed metrics                             │
│  (per-metric table: count, avg, p50, p90, p95, p99, min, max)│
│  (counter/rate/gauge table: http_reqs, data_sent, ...)       │
└──────────────────────────────────────────────────────────────┘
```

The VU timeline chart is a gradient-filled line: gradient
`#4a9eff @ 50%` → `#4a9eff @ 5%`, stroke `#4a9eff` 2px. The latency
chart is a bar set where `p95` and `p99` bars are colored amber
(`#d29922`) while `min / avg / p50 / p90 / max` are blue (`#4a9eff`) —
drawing the eye to the two thresholds that actually matter for SLA
checks.

Both charts compute axis ticks via the shared `niceTicks(min, max, count)`
helper (same algorithm as AG-99's `BIDashboard`).

---

## Hebrew glossary · מילון עברית-אנגלית

| Term | עברית |
|---|---|
| Load test | מבחן עומס |
| Virtual user (VU) | משתמש וירטואלי |
| Scenario | תרחיש |
| Weight | משקל |
| Ramp-up | עליה הדרגתית |
| Ramp-down | ירידה הדרגתית |
| Spike | זינוק |
| Steady state | מצב יציב |
| Threshold | סף קבלה |
| Percentile (P95, P99) | אחוזון |
| Median | חציון |
| Average / mean | ממוצע |
| Throughput | תפוקה |
| Requests per second (RPS) | בקשות לשניה |
| Error rate | שיעור שגיאות |
| Latency | השהיה / זמן תגובה |
| Time to first byte (TTFB) | זמן לבית ראשון |
| Pass / Fail | עבר / נכשל |
| Dry run | הרצה יבשה |
| Report | דו"ח |

---

## How to run

From `onyx-procurement/`:

```bash
# Unit + integration test suite
node --test test/load/load-harness.test.js

# Or from the repo root
node --test onyx-procurement/test/load/load-harness.test.js
```

The test suite spins its own ephemeral mock HTTP server — no DB, no
server boot, no fixtures required. It runs in ~4.5 seconds on a warm
Node 20 process.

### Running against a real server

```js
#!/usr/bin/env node
const { LoadTester } = require('./src/load/load-harness');

(async () => {
  const lt = new LoadTester({ baseUrl: 'http://localhost:3100' });
  for (const name of ['dashboard-home', 'invoice-list', 'vat-report']) {
    lt.addScenario(require('./test/load/scenarios/' + name)());
  }
  await lt.runStages([
    { duration: 10_000, target: 10 },
    { duration: 60_000, target: 10 },
    { duration:  5_000, target: 50 },   // spike
    { duration: 30_000, target: 10 },
    { duration: 10_000, target:  0 },
  ], {
    thresholds: {
      http_req_duration: ['p(95)<500', 'p(99)<1500'],
      http_req_failed:   'rate<0.01',
    },
  });
  lt.exportJSON('./_qa-reports/loadruns/' + Date.now() + '.json');
  lt.exportJUnit('./_qa-reports/loadruns/' + Date.now() + '.xml');
  lt.exportHTML('./_qa-reports/loadruns/' + Date.now() + '.html');
})();
```

---

## Non-destructive guarantees

Per the mandate "לא מוחקים רק משדרגים ומגדלים":

1. **No existing file was modified or deleted.** `git status` shows only
   untracked additions.
2. **No `DELETE` helper.** `httpRequest` accepts any HTTP verb but the
   harness never composes a DELETE on its own; scenarios are opt-in.
3. **`payroll-run.js` defaults `dry_run: true`** so load testing the
   payroll path never commits real payroll data.
4. **`invoice-create.js` generates unique `invoice_number`s** per call so
   it never triggers the dedup path that would silently overwrite.
5. **The existing `test/load/qa-15-*.js` files are untouched.** AG-X87
   lives alongside them; neither supersedes nor replaces QA-15's tooling.

---

## Acceptance criteria — met

| Requirement | Status |
|---|---|
| Zero external deps, Node core only | PASS — only `require`s are `http`, `https`, `url`, `perf_hooks`, `worker_threads`, `fs`, `path`, `events` |
| Class `LoadTester` exported | PASS — `module.exports = { LoadTester, ... }` |
| `addScenario({name, url, method, headers, body, weight})` | PASS — tests 34–38 |
| `run({vus, duration, rampUp, rampDown, thresholds})` | PASS — test 24 |
| `runStages(stages)` with ramp/steady/drain | PASS — test 27 |
| `checkThresholds(thresholds)` | PASS — tests 15, 16, 17 |
| `exportJUnit / exportJSON / exportHTML` | PASS — test 31 |
| 12 k6-style metrics | PASS — see `_resetMetrics()` |
| p50/p90/p95/p99 percentile correctness | PASS — tests 3, 4, 5 |
| Worker_threads OR coroutines | PASS — both paths smoke-tested |
| Multi-stage (ramp-up / steady / ramp-down / spike) | PASS — test 27 |
| 5 pre-built scenarios | PASS — tests 34–39 |
| Test file covering scheduling, percentiles, thresholds, stages, mock server | PASS — 40 tests, 0 failures |
| Bilingual HTML report with embedded SVG charts | PASS — smoke test, file inspection |
| Reuse SVG patterns from BI dashboard | PASS — same palette (`BI_THEME`), same `niceTicks` algorithm |
| No existing file deleted | PASS — `git status` confirms untracked-only |

---

**Signed off:** Agent X87 · 2026-04-11
