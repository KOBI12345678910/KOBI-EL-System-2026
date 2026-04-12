# QA-15 — Load Test Plan

**Agent:** QA-15 (Load Agent)
**System under test:** Onyx Procurement ERP (`onyx-procurement/`)
**Harness:** Pure Node.js, zero dependencies
**Run strategy:** Sequential via `node test/load/qa-15-runner.js`
**Status:** Scripts prepared — NOT executed yet (per charter: plan only)

---

## 1. Objectives

1. Verify the Onyx ERP holds under the seven operational load shapes that match Techno-Kol's actual usage.
2. Surface tail-latency regressions before they reach production payroll / VAT submission deadlines.
3. Provide a pass/fail signal (`GO` / `NO-GO`) usable as a CI gate.
4. Leave behind reproducible scripts that a future QA engineer can run without reading a manual.

---

## 2. Endpoint map (what we hit and why)

Derived from `server.js` and `src/*/routes.js`.

| Area | Endpoints exercised | Source file |
|------|---------------------|-------------|
| Platform      | `GET /healthz`, `GET /livez`, `GET /readyz`, `GET /api/status`, `GET /api/health`, `GET /metrics` | `server.js` |
| Procurement   | `GET/POST /api/suppliers`, `GET/POST /api/purchase-requests`, `GET /api/purchase-orders`, `GET /api/rfqs` | `server.js` |
| Analytics     | `GET /api/analytics/savings`, `GET /api/analytics/spend-by-supplier`, `GET /api/analytics/spend-by-category`, `GET /api/audit` | `server.js` |
| Payroll       | `GET /api/payroll/employees`, `POST /api/payroll/wage-slips/compute`, `POST /api/payroll/wage-slips`, `GET /api/payroll/wage-slips`, `GET /api/payroll/wage-slips/:id/pdf` | `src/payroll/payroll-routes.js` |
| VAT           | `GET /api/vat/periods`, `GET /api/vat/periods/:id`, `GET /api/vat/periods/:id/pcn836` | `src/vat/vat-routes.js` |
| Bank          | `GET /api/bank/accounts`, `POST /api/bank/accounts/:id/import`, `POST /api/bank/accounts/:id/auto-reconcile`, `POST /api/bank/matches`, `GET /api/bank/summary` | `src/bank/bank-routes.js` |
| Tax (annual)  | (read-only smoke only via mixed-workload bucket) | `src/tax/annual-tax-routes.js` |

Endpoints **excluded** from the plan:

- `POST /webhook/whatsapp` — separate HMAC-verified pool, out of scope here.
- `POST /api/rfq/:id/decide`, `POST /api/purchase-orders/:id/approve/send` — multi-step workflows that mutate business state; we do not destabilise real procurement flows.
- `POST /api/vat/periods/:id/submit`, `POST /api/vat/periods/:id/close` — real Tax Authority side effects.

---

## 3. Scenario Catalogue

Each scenario is a standalone file under `test/load/qa-15-*.js`. All export
`{ scenarioName, run(baseUrl, apiKey, opts), THRESHOLDS }`. The runner calls
them in the order below.

### Scenario 1 — `payroll-day`

| Field | Value |
|---|---|
| **Goal** | Prove 500 employees' payroll can be processed on the 1st of the month |
| **Users (logical)** | 500 |
| **Concurrency** | 50 |
| **Duration** | 5 min |
| **Request path** | `employees.list → wageslip.compute → wageslip.save → wageslip.list` |
| **Expected RPS** | ~40–60 |
| **Calls / run** | ~14,000 |
| **Expected p95** | ≤ 2500 ms |
| **Expected p99** | ≤ 5000 ms |
| **Error ceiling** | ≤ 1% |
| **Risk surfaces** | `wage-slip-calculator` CPU, `pdf-generator` I/O, DB pool |
| **Safety** | Synthetic employer `QA15_PAYROLL_DAY`; `qa15_load_test` flag on all writes |
| **File** | `test/load/qa-15-payroll-day.js` |

### Scenario 2 — `vat-submission`

| Field | Value |
|---|---|
| **Goal** | Prove PCN836 (~50 MB report) survives 100 parallel requests at VAT deadline |
| **Users (logical)** | 100 |
| **Concurrency** | 100 |
| **Duration** | 3 min |
| **Request path** | `vat.periods.list → vat.period.read → pcn836.generate` |
| **Expected RPS** | ~5–15 (heavy) |
| **Calls / run** | ~1,500–4,500 |
| **Expected p95** | ≤ 8000 ms |
| **Expected p99** | ≤ 20000 ms |
| **Error ceiling** | ≤ 2% |
| **Risk surfaces** | `src/vat/pcn836.js` CSV builder memory footprint, response streaming, DB pool exhaustion |
| **Safety** | Read-only; never calls `/submit` or `/close` |
| **File** | `test/load/qa-15-vat-submission.js` |

### Scenario 3 — `bank-reconciliation`

| Field | Value |
|---|---|
| **Goal** | Prove 20 bookkeepers can each import a 10k-row statement and auto-reconcile |
| **Users (logical)** | 20 |
| **Concurrency** | 20 |
| **Duration** | 4 min |
| **Request path** | `accounts.list → statement.import (10k rows) → auto-reconcile → summary` |
| **Expected RPS** | ~3–8 |
| **Calls / run** | ~800–2,000 |
| **Expected p95** | ≤ 5000 ms |
| **Expected p99** | ≤ 12000 ms |
| **Error ceiling** | ≤ 1% |
| **Risk surfaces** | `src/bank/parsers.js`, `src/bank/matcher.js` (watch for O(n²)), transaction log growth |
| **Safety** | Synthetic bank account `QA15_BANK_ACC`; `qa15_load_test` flag on payloads |
| **File** | `test/load/qa-15-bank-reconciliation.js` |

### Scenario 4 — `dashboard-rush`

| Field | Value |
|---|---|
| **Goal** | Prove the dashboard survives the 09:00 morning hammer of 1000 users |
| **Users (logical)** | 1000 |
| **Concurrency** | 200 |
| **Duration** | 1 min |
| **Request path** | probe `GET /api/dashboard/summary` → fallback `GET /api/status` |
| **Expected RPS** | ~180–250 |
| **Calls / run** | ~10,000–15,000 |
| **Expected p95** | ≤ 1500 ms |
| **Expected p99** | ≤ 3000 ms |
| **Error ceiling** | ≤ 1% |
| **Risk surfaces** | Middleware stack (helmet + cors + auth + rate-limit), dashboard aggregate query plan |
| **Safety** | Read-only; no writes of any kind |
| **File** | `test/load/qa-15-dashboard-rush.js` |

> **Note:** There is no dedicated `/api/dashboard/summary` endpoint in the current codebase — the scenario auto-detects this at runtime and falls through to `/api/status`, which is the existing Onyx aggregator. When/if a dedicated endpoint is added, no script change is needed.

### Scenario 5 — `mixed-workload`

| Field | Value |
|---|---|
| **Goal** | Representative production mix (70% reads / 20% writes / 10% expensive reports) |
| **Concurrency** | 100 |
| **Duration** | 3 min |
| **Request buckets** | See `qa-15-mixed-workload.js` header comment (10 bucket replicated for ratio) |
| **Expected RPS** | ~60–120 |
| **Calls / run** | ~12,000–20,000 |
| **Expected p95** | ≤ 1500 ms |
| **Expected p99** | ≤ 3500 ms |
| **Error ceiling** | ≤ 1% |
| **Risk surfaces** | Everything — this is the trust-it scenario for "does it run on a normal Tuesday" |
| **Safety** | Writes are against `qa15_load_test` flagged suppliers and dry-run bank matches |
| **File** | `test/load/qa-15-mixed-workload.js` |

### Scenario 6 — `spike-test`

| Field | Value |
|---|---|
| **Goal** | Graceful degradation and clean recovery from a 50× traffic surge |
| **Phase 1 (baseline)** | 10 rps × 60 s |
| **Phase 2 (spike)** | 500 rps × 30 s |
| **Phase 3 (recovery)** | 10 rps × 60 s |
| **Expected p95 (baseline)** | ≤ 1500 ms |
| **Expected p95 (spike)** | ≤ 5000 ms |
| **Expected p95 (recovery)** | ≤ 1500 ms |
| **Error ceiling (baseline)** | ≤ 1% |
| **Error ceiling (spike)** | ≤ 10% |
| **Error ceiling (recovery)** | ≤ 1% |
| **Pass rule** | `baseline PASS` AND `recovery PASS` (spike itself cannot fail the verdict) |
| **Risk surfaces** | Rate-limiter false-positives, connection-pool exhaustion, event-loop stalls, inability to recover without restart |
| **Safety** | Read-only (`/api/status`, `/healthz`) |
| **File** | `test/load/qa-15-spike.js` |

### Scenario 7 — `soak-test`

| Field | Value |
|---|---|
| **Goal** | Detect memory leaks and performance drift over a 30-minute steady run |
| **Target RPS** | 50 |
| **Duration** | 30 min |
| **Window size** | 5 min × 6 windows |
| **Endpoints** | `GET /api/status`, `GET /api/suppliers?limit=20`, `GET /api/purchase-orders?limit=10` |
| **Expected p95 (per window)** | ≤ 1500 ms |
| **Error ceiling** | ≤ 1% per window |
| **Drift rule** | `max(p95 across windows) ≤ 1.30 × min(p95 across windows)` |
| **Risk surfaces** | Unbounded in-memory caches, connection leaks, autovacuum starvation, GC pause accumulation |
| **Safety** | 100% read-only; `SIGINT` handler exits cleanly with partial report |
| **File** | `test/load/qa-15-soak.js` |

---

## 4. Acceptance thresholds (summary table)

| Scenario              | p95 limit | p99 limit | Err limit | Special rule                          |
|-----------------------|-----------|-----------|-----------|---------------------------------------|
| payroll-day           | 2500 ms   | 5000 ms   | 1%        |                                       |
| vat-submission        | 8000 ms   | 20000 ms  | 2%        |                                       |
| bank-reconciliation   | 5000 ms   | 12000 ms  | 1%        |                                       |
| dashboard-rush        | 1500 ms   | 3000 ms   | 1%        | global master threshold               |
| mixed-workload        | 1500 ms   | 3500 ms   | 1%        |                                       |
| spike-test            | per-phase | per-phase | per-phase | baseline+recovery must PASS           |
| soak-test             | 1500 ms   | 3000 ms   | 1%        | max(p95) ≤ 1.30 × min(p95) drift      |

**Global master thresholds (per QA-15 charter):** `p95 < 1500 ms`, `errors < 1%`.
Scenarios with relaxed limits explicitly document WHY in their file header.

---

## 5. Total expected run time

| Phase                | Time     |
|----------------------|----------|
| preflight            | ~1 s     |
| payroll-day          | ~5 min   |
| vat-submission       | ~3 min   |
| bank-reconciliation  | ~4 min   |
| dashboard-rush       | ~1 min   |
| mixed-workload       | ~3 min   |
| spike-test           | ~2.5 min |
| soak-test            | ~30 min  |
| **Full sequence**    | **~48 min** |
| **Quick mode (÷10)** | **~5 min**  |

---

## 6. Prerequisites

1. Onyx server reachable and booted. Default `http://localhost:3000`.
2. A valid API key matching `API_KEYS` in the server `.env`.
3. Seeded test fixtures (see `QA-15-README.md § Prerequisites`). Optional but
   recommended; without them, write endpoints will return 400/404 and get
   counted as errors, surfacing an honest "endpoint refuses synthetic data"
   signal rather than a false pass.
4. Run from within `onyx-procurement/`:
   ```bash
   QA15_BASE_URL=http://localhost:3000 QA15_API_KEY=... \
     node test/load/qa-15-runner.js
   ```

---

## 7. Output artefacts

Running the runner produces **stdout only** — it does not write to disk. Use
shell redirection to capture:

```bash
node test/load/qa-15-runner.js --json > _qa-reports/qa-15-run-$(date +%F).log 2>&1
```

Each scenario block contains: verdict, total calls, error rate, bytes,
min/mean/p50/p95/p99/max latency, threshold list, per-tag breakdown. The
final summary is a 6-column table plus an `OVERALL` line.

---

## 8. Go / No-Go Rules

- **Individual scenario:** `GO` iff all thresholds are satisfied (per-scenario rules apply).
- **Spike scenario:** `GO` iff baseline + recovery phases both pass.
- **Soak scenario:** `GO` iff every window passes AND drift ratio ≤ 1.30.
- **Combined suite:** `GO` iff every scenario in the run is `GO`.

Exit codes: `0 = all GO`, `1 = at least one NO-GO`, `2 = preflight/runner error`.

---

## 9. Known risks and mitigations

| Risk | Mitigation |
|---|---|
| Tests hit production by accident | README forbids it explicitly; payload flag `qa15_load_test: true` makes teardown trivial |
| Long runs interrupted | soak scenario handles `SIGINT` and returns a partial report; runner catches per-scenario errors and keeps going |
| Server unreachable | preflight probes `/healthz` before anything heavy; exits 2 with clear message if it fails |
| Port contention from prior runs | each request uses a fresh socket (no agent keepAlive), so no stale-socket surprises |
| Dashboard endpoint missing | dashboard-rush auto-detects and falls back to `/api/status` |
| Fixtures missing | scenarios log endpoint errors into their stats; reports show `errorBuckets` so you can tell the difference between "system is slow" and "my test data is missing" |

---

## 10. NOT in scope for QA-15

See `QA-15-README.md § What these scenarios DO NOT test`. Key exclusions:

- Correctness (use Jest unit/integration suites)
- Authentication / CSRF / input sanitisation (QA-30, QA-42)
- WhatsApp webhook load (separate rate-limit pool)
- Database-only performance (QA-71)
- Cold-start / boot / migration timing (QA-17)

---

## 11. Deliverables

| Deliverable | Path |
|---|---|
| Shared harness          | `test/load/qa-15-lib.js` |
| Scenario 1 — Payroll    | `test/load/qa-15-payroll-day.js` |
| Scenario 2 — VAT        | `test/load/qa-15-vat-submission.js` |
| Scenario 3 — Bank       | `test/load/qa-15-bank-reconciliation.js` |
| Scenario 4 — Dashboard  | `test/load/qa-15-dashboard-rush.js` |
| Scenario 5 — Mixed      | `test/load/qa-15-mixed-workload.js` |
| Scenario 6 — Spike      | `test/load/qa-15-spike.js` |
| Scenario 7 — Soak       | `test/load/qa-15-soak.js` |
| Runner                  | `test/load/qa-15-runner.js` |
| README                  | `test/load/QA-15-README.md` |
| This plan               | `_qa-reports/QA-15-load-plan.md` |

---

## 12. Go / No-Go — current status

| Check | Status |
|---|---|
| All seven scenarios written | YES |
| Shared harness written | YES |
| Runner written | YES |
| README + plan written | YES |
| Scripts executed against running server | **NO** — per charter, plan-only step |
| Ready to run on demand | **YES** |

**QA-15 VERDICT (plan phase):** `GO` to proceed to execution phase.
Execution is blocked on (a) a running Onyx server and (b) seeded test fixtures.
When those are ready, run `node test/load/qa-15-runner.js --quick` first to
smoke-validate, then the full sequence.

---

**End of QA-15 Load Plan.**
