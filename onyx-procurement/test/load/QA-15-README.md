# QA-15 — Load Test Suite

**Owner:** QA-15 (Load Agent)
**Scope:** Onyx Procurement ERP (`onyx-procurement/`)
**Runtime:** Pure Node.js (no external dependencies — `node:http`, `node:https`, `node:url`, `node:perf_hooks` only).

---

## What is in this folder?

```
test/load/
├── qa-15-lib.js                 Shared harness: request() / createStats() / runConcurrent() / runRateLimited()
├── qa-15-payroll-day.js         Scenario 1 — Payroll Day (500 users, 50 conc, 5 min)
├── qa-15-vat-submission.js      Scenario 2 — VAT PCN836 (100 users, 100 conc, 3 min)
├── qa-15-bank-reconciliation.js Scenario 3 — Bank Reconciliation (20 users, 10k rows, 4 min)
├── qa-15-dashboard-rush.js      Scenario 4 — Dashboard Rush (1000 users, 200 conc, 1 min)
├── qa-15-mixed-workload.js      Scenario 5 — Mixed Workload 70/20/10 (100 conc, 3 min)
├── qa-15-spike.js               Scenario 6 — Spike (10→500→10 rps, 60+30+60 s)
├── qa-15-soak.js                Scenario 7 — Soak (50 rps, 30 min, drift-detection)
├── qa-15-runner.js              Master runner — executes all scenarios sequentially
└── QA-15-README.md              This file
```

> These files DO NOT run on `require`. Importing a scenario gives you
> `{ scenarioName, run, THRESHOLDS }` and nothing happens until you call `run()`.

---

## Prerequisites

1. **Onyx server must already be running** somewhere reachable. The runner does
   not spawn it — it only hits HTTP endpoints. Local default is
   `http://localhost:3000`.
2. **Test fixtures should be seeded** (recommended, not strictly required):
   - one VAT period id: `QA15_VAT_PERIOD_1`
   - one bank account id: `QA15_BANK_ACC`
   - one employer id: `QA15_PAYROLL_DAY`
   - three employees: `QA15_EMP_1 / _2 / _3`
   - All records tagged with `qa15_load_test: true` so teardown is trivial
     (`DELETE ... WHERE qa15_load_test = true`).

   If fixtures are missing, the scenarios still run — the server will return
   400/404 on writes and those are counted as errors. You will get an honest
   "this endpoint refuses synthetic data" signal instead of a false pass.

3. **API key** must be exported so the `X-API-Key` header can be set:

   ```bash
   export QA15_BASE_URL=http://localhost:3000
   export QA15_API_KEY=<one of the keys in server .env API_KEYS>
   ```

---

## How to run

### All scenarios, full duration (~48 min total)

```bash
cd onyx-procurement
node test/load/qa-15-runner.js
```

### Smoke run (all scenarios, durations ÷10, ~5 min)

```bash
node test/load/qa-15-runner.js --quick
```

### One scenario only

```bash
node test/load/qa-15-runner.js --only=dashboard-rush
```

### Skip the two long ones (payroll + soak)

```bash
node test/load/qa-15-runner.js --skip=soak-test,payroll-day
```

### Emit JSON for CI parsing

```bash
node test/load/qa-15-runner.js --json > qa-15.report.json
```

### Programmatic use (from another test file)

```js
const payroll = require('./test/load/qa-15-payroll-day');
const report = await payroll.run('http://localhost:3000', 'my-key', {
  duration: 60_000,
  concurrency: 10,
});
console.log(report.stats.verdict, report.stats.latency.p95);
```

---

## How to read the output

Each scenario prints a block like:

```
════════════════════════════════════════════════════════════════════════
SCENARIO: payroll-day  [GO]
════════════════════════════════════════════════════════════════════════
Duration:    300.1s
Calls:       14832  (49.4 rps)
Errors:      17  (0.11%)
Bytes:       42334112
Latency (ms):
  min=11  mean=412
  p50=290  p95=1420  p99=2870  max=4600
Thresholds:
  p95 <= 2500ms, p99 <= 5000ms, err <= 1.00%
By tag:
  employees.list: calls=3708 err=0 (0.00%) mean=95ms
  wageslip.compute: calls=3708 err=4 (0.11%) mean=540ms
  wageslip.save: calls=3708 err=13 (0.35%) mean=720ms
  wageslip.list: calls=3708 err=0 (0.00%) mean=290ms
════════════════════════════════════════════════════════════════════════
```

Key fields:

- **VERDICT**: `GO` or `NO-GO`. This is the only number that matters at the SLA gate.
- **Calls / rps**: total HTTP calls and achieved requests/sec.
- **Errors / Error %**: transport failures + non-2xx. Target `≤ 1%`.
- **Latency percentiles**: `p95` is the Acceptance master metric.
- **By tag**: per-endpoint breakdown — this is where you pinpoint which call
  is dragging the whole scenario down.

And at the end, the runner prints a combined table:

```
SCENARIO                VERDICT   CALLS     ERR%      p95 ms    p99 ms
--------------------------------------------------------------------------
payroll-day             GO        14832     0.11%     1420      2870
vat-submission          NO-GO     6100      2.30%     10300     25000
...
OVERALL: NO-GO
```

---

## Acceptance Thresholds

The global pass/fail rule, unless a scenario has stricter or looser custom thresholds documented in its header:

| Metric      | Limit      |
|-------------|------------|
| **p95 latency** | ≤ **1500 ms** |
| **p99 latency** | ≤ **3000 ms** |
| **Error rate**  | ≤ **1%**      |

### Per-scenario overrides

| Scenario              | p95 limit | p99 limit | Error limit | Reason                                           |
|-----------------------|-----------|-----------|-------------|--------------------------------------------------|
| payroll-day           | 2500 ms   | 5000 ms   | 1%          | PDF generation is inherently slow                |
| vat-submission        | 8000 ms   | 20000 ms  | 2%          | PCN836 is ~50MB; 100 parallel requests is harsh  |
| bank-reconciliation   | 5000 ms   | 12000 ms  | 1%          | 10k-row import + matcher on every iteration      |
| dashboard-rush        | 1500 ms   | 3000 ms   | 1%          | Default — this is the hot-path test              |
| mixed-workload        | 1500 ms   | 3500 ms   | 1%          | Default — representative of normal Tuesday       |
| spike-test            | per-phase | per-phase | per-phase   | baseline/recovery tight, spike relaxed to 10%    |
| soak-test             | 1500 ms   | 3000 ms   | 1%          | + drift limit: max(p95) ≤ 1.30 × min(p95)        |

### The spike test has a special rule

A spike test must pass **baseline AND recovery**. The spike phase itself is
allowed up to 10% error and 5s p95 — a healthy system degrades gracefully under
a 50× load burst, that is expected. What is NOT acceptable is being unable to
recover cleanly once traffic drops back to baseline.

### The soak test has a drift rule

Per-window p95 latency across the 30-minute run must not grow more than 30%
from its starting point. A steady 10% creep from window 1 to window 6 is the
classic signature of an unbounded in-memory cache or a connection leak.

---

## Exit codes

| Code | Meaning                                              |
|------|------------------------------------------------------|
| 0    | Every scenario returned GO                           |
| 1    | At least one scenario returned NO-GO                 |
| 2    | Runner preflight failed (base url wrong, auth broken, etc.) |

Use exit code 1 as the CI fail signal. Exit code 2 means your test setup is
broken, not your system under test.

---

## What these scenarios DO NOT test

- They do not test correctness. A scenario that returns the wrong number
  very quickly still gets a GO. Use the Jest unit/integration suites for correctness.
- They do not test authentication strength, input sanitisation, or CSRF — see
  `QA-AGENT-30-PENTEST-PLAN.md` and `QA-AGENT-42-CSRF.md`.
- They do not exercise the WhatsApp webhook. The webhook rate-limit pool is
  separate and needs its own scenario (not in QA-15 scope).
- They do not test database-only queries. That is QA-71 (DB perf).
- They do not start or stop the server. Boot/shutdown is QA-17 (Migration Safety).

---

## Safety notes (READ BEFORE RUNNING AGAINST A SHARED ENV)

- **Never point a payroll/bank/VAT scenario at production.** They issue writes.
  The writes are flagged with `qa15_load_test: true` so teardown is possible,
  but there is no "dry-run" toggle — use a staging DB.
- **dashboard-rush, soak, mixed-workload (reads-only portion)** are safe for
  any environment you have permission to hit.
- **spike-test hits /api/status and /healthz**; those are idempotent.
- **vat-submission hits PCN836 read-only** — no writes, but it IS heavy.
  Running it against prod will make the DB breathe fast for 3 minutes.

---

## Extending

Adding a new scenario? Follow this template:

1. Copy `qa-15-dashboard-rush.js` and rename.
2. Update `scenarioName`, `THRESHOLDS`, and the `run(...)` body.
3. Register it in `qa-15-runner.js` → `SCENARIOS` array (end of list to
   preserve existing ordering).
4. Document it in this README's table.
5. Keep the contract: `run(baseUrl, apiKey, opts)` → `buildReport(...)` result.

---

## See also

- `_qa-reports/QA-15-load-plan.md` — the plan document with performance expectations
- `QA-AGENT-14-LOAD-N1.md` — prior load test guidance (QA-14)
- `test/load/README.md` — existing pre-QA-15 load scripts (not touched)
