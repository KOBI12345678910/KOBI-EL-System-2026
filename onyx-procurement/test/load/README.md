# test/load — lightweight API load test

Zero-dependency load-test suite for `onyx-procurement`.

Uses **only** Node.js built-ins (`http`, `https`, `url`, `perf_hooks`).
No k6, no autocannon, no wrk — just `node test/load/api-load.js`.

Matches the style of the rest of `test/` (see `test/README.md`): no
third-party runner, `node:test`-adjacent, runs on a stock Node >= 18
(the repo's hard requirement is Node >= 20).

---

## What it does

Runs five scenarios serially against a target base URL:

| # | Scenario                          | Method | Path                                 | Total | Concurrency |
|---|-----------------------------------|--------|--------------------------------------|-------|-------------|
| 1 | `healthz`                         | GET    | `/healthz`                           |  500  |     50      |
| 2 | `suppliers-list`                  | GET    | `/api/suppliers`                     |  200  |     20      |
| 3 | `invoices-list`                   | GET    | `/api/invoices?limit=50`             |  200  |     20      |
| 4 | `payroll-wage-slip-compute`       | POST   | `/api/payroll/wage-slips/compute`    |  100  |     10      |
| 5 | `vat-summary`                     | GET    | `/api/vat/summary?year=2026&month=3` |  100  |     10      |

Scenarios 2–5 attach an `X-API-Key` header if `LOAD_TEST_API_KEY` is set.

The POST fixture for `wage-slips/compute` mirrors `baseTimesheet` +
`basePeriod` from `test/payroll-routes.test.js`, so the server can
actually service it (employee_id 10, 182 regular hours, period 2026-03).

For each scenario the script reports:

- `total` — completed requests
- `ok` / `failed` — 2xx/3xx vs 4xx/5xx/transport errors
- `p50`, `p95`, `p99`, `max` — latency distribution (ms, nearest-rank)
- `rps` — throughput (total / wall-clock seconds)
- status-code histogram and the first few error reasons

---

## Thresholds

The script exits non-zero if **any** scenario breaches either threshold:

- `p95 > 1500 ms`
- `failure rate > 1%`

Exit codes:

| Code | Meaning                                                       |
|------|---------------------------------------------------------------|
|  0   | All scenarios passed both thresholds                          |
|  1   | At least one scenario breached a threshold                    |
|  2   | Configuration error (bad URL, nothing to run, fatal crash)    |

This makes it safe to drop straight into a CI pipeline:

```bash
node test/load/api-load.js || exit 1
```

---

## Running it

Start the onyx-procurement server first (anywhere), then:

```bash
# Defaults: base=http://localhost:3100, no API key
node test/load/api-load.js

# Typical local run
LOAD_TEST_BASE_URL=http://localhost:3100 \
LOAD_TEST_API_KEY=dev-key \
  node test/load/api-load.js

# Run a single scenario (comma-separated list)
LOAD_TEST_ONLY=healthz node test/load/api-load.js
LOAD_TEST_ONLY=suppliers-list,invoices-list node test/load/api-load.js

# Tighter per-request timeout (default 10_000 ms)
LOAD_TEST_TIMEOUT_MS=3000 node test/load/api-load.js
```

### Environment variables

| Variable                | Default                   | Purpose                                       |
|-------------------------|---------------------------|-----------------------------------------------|
| `LOAD_TEST_BASE_URL`    | `http://localhost:3100`   | Target base URL                               |
| `LOAD_TEST_API_KEY`     | *(empty)*                 | Value for `X-API-Key` on protected routes     |
| `LOAD_TEST_TIMEOUT_MS`  | `10000`                   | Per-request timeout (ms)                      |
| `LOAD_TEST_ONLY`        | *(all)*                   | Comma-separated scenario names to run         |

Scenario names accepted by `LOAD_TEST_ONLY`:

```
healthz
suppliers-list
invoices-list
payroll-wage-slip-compute
vat-summary
```

---

## Interpreting the output

Sample output (truncated, numbers will differ):

```
════════════════════════════════════════════════════════════════════════
 onyx-procurement — lightweight API load test
════════════════════════════════════════════════════════════════════════
 base URL   : http://localhost:3100
 api key    : (set, 8 chars)
 timeout    : 10000 ms
 thresholds : p95 <= 1500 ms, fail-rate <= 1.0%
 scenarios  : healthz, suppliers-list, invoices-list, payroll-wage-slip-compute, vat-summary
════════════════════════════════════════════════════════════════════════

▶ healthz  (GET /healthz)  conc=50
────────────────────────────────────────────────────────────
  total=500   ok=500   failed=0     fail-rate=0.00%  rps=1842.3
  p50=6.2ms     p95=18.4ms    p99=31.7ms    max=47.9ms  wall=271.4ms
  status     200:500
  verdict    p95:OK   failures:OK   => PASSED

▶ suppliers-list  (GET /api/suppliers)  conc=20
────────────────────────────────────────────────────────────
  total=200   ok=200   failed=0     fail-rate=0.00%  rps=312.7
  p50=42.1ms    p95=118.9ms   p99=187.3ms   max=214.6ms wall=640.2ms
  status     200:200
  verdict    p95:OK   failures:OK   => PASSED

▶ invoices-list  (GET /api/invoices?limit=50)  conc=20
────────────────────────────────────────────────────────────
  total=200   ok=200   failed=0     fail-rate=0.00%  rps=248.1
  p50=58.4ms    p95=186.2ms   p99=241.0ms   max=298.7ms wall=806.1ms
  status     200:200
  verdict    p95:OK   failures:OK   => PASSED

▶ payroll-wage-slip-compute  (POST /api/payroll/wage-slips/compute)  conc=10
────────────────────────────────────────────────────────────
  total=100   ok=100   failed=0     fail-rate=0.00%  rps=94.6
  p50=82.1ms    p95=214.7ms   p99=296.3ms   max=341.2ms wall=1.06s
  status     200:100
  verdict    p95:OK   failures:OK   => PASSED

▶ vat-summary  (GET /api/vat/summary?year=2026&month=3)  conc=10
────────────────────────────────────────────────────────────
  total=100   ok=100   failed=0     fail-rate=0.00%  rps=128.4
  p50=61.8ms    p95=162.4ms   p99=210.9ms   max=248.0ms wall=778.6ms
  status     200:100
  verdict    p95:OK   failures:OK   => PASSED

════════════════════════════════════════════════════════════════════════
 SUMMARY
════════════════════════════════════════════════════════════════════════
  scenario                    total   fail%   p95       rps     verdict
  ────────────────────────────────────────────────────────────────────
  healthz                     500     0.00    18.4ms    1842.3  PASS
  suppliers-list              200     0.00    118.9ms   312.7   PASS
  invoices-list               200     0.00    186.2ms   248.1   PASS
  payroll-wage-slip-compute   100     0.00    214.7ms   94.6    PASS
  vat-summary                 100     0.00    162.4ms   128.4   PASS
════════════════════════════════════════════════════════════════════════

[OK] all scenarios within thresholds
```

### Reading the numbers

- **`p95`** is the load-test's main SLO signal — 95% of requests finished
  in under that time. Compare it against the 1500 ms threshold.
- **`p50`** is the *typical* user experience. If p50 is already high, the
  service is slow even under light contention.
- **`p99`/`max`** expose tail latency. A healthy service has `p99 < 2× p95`;
  if `max` is an order of magnitude larger than `p99`, look for GC
  pauses, cold starts, or a noisy downstream (Supabase, PDF gen, etc.).
- **`rps`** is *effective* throughput at that concurrency — it is
  `total / wall-clock`, not an open-loop rate. Compare scenarios with the
  same concurrency to spot relative regressions.
- **`fail-rate`** counts anything ≥400 or a transport error as failed.
  5xx on protected routes often means you forgot `LOAD_TEST_API_KEY`.
- **`status` histogram** is your first debugging stop — a wall of 401s is
  a missing API key, 429s are rate limits kicking in, 503s are a
  restarting or unhealthy upstream.

### Common failure modes

| Symptom                                  | Likely cause                                   |
|------------------------------------------|------------------------------------------------|
| `status  401:N` on every scenario ≥2     | `LOAD_TEST_API_KEY` not set or wrong           |
| `req:ECONNREFUSED` on every scenario     | Server not running / wrong port in base URL    |
| `req:timeout` under healthz only         | Event-loop blocked; something runs sync on /healthz |
| p95 fine, p99 huge                       | GC or cold-start tail — rerun, watch logs      |
| fail-rate creeps up as concurrency rises | Downstream (DB, PDF) saturating — not the API  |
| 429s after ~50 requests                  | Rate limiter in front of the API               |

---

## Adding a new scenario

`api-load.js` keeps scenarios in one array at the top. To add one,
append an object with `name`, `method`, `path`, `total`, `concurrency`,
`needsKey`, and (for POST/PUT) `body`:

```js
{
  name: 'expenses-list',
  method: 'GET',
  path: '/api/expenses?year=2026',
  total: 200,
  concurrency: 20,
  needsKey: true,
},
```

Keep totals modest (≤1000) so the whole suite finishes in under a minute
on a laptop. This is a smoke-level load test, not a capacity benchmark —
for the latter, use a dedicated tool (k6, wrk2) against a dedicated env.

---

## Why another test file instead of k6?

- **Zero install.** Runs on any dev machine that already has Node.
- **No CI secrets** for a package registry or k6 binary.
- **Same repo conventions** as the rest of `test/` — `node:test` below,
  `http` + `perf_hooks` here.
- **Fast feedback.** The whole suite runs in a handful of seconds against
  a local server. It's designed to catch regressions, not replace a
  capacity test.

If you outgrow it, the fixtures and scenarios port cleanly to k6.
