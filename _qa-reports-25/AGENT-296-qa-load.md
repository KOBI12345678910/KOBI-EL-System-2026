# AGENT-296 — QA #6: Load Tests (k6 + autocannon)

**Agent:** 296 (QA squad #6)
**Date:** 2026-04-29
**Scope:** Load testing the Techno-Kol Uzi ERP 2026 (4 services).
**Tools:** k6 (primary, scenario-based) + autocannon (lightweight smoke).
**Targets:** TECHNO_KOL_OPS :3200, ONYX_PROCUREMENT :3100, PAYROLL :5173, ONYX_AI :3300.

---

## 1. Test Topology

| Scenario | Tool | Load profile | Target endpoints |
|---|---|---|---|
| S1: 100 concurrent users browsing | k6 + autocannon | Ramp 0→100 VUs over 30s, hold 5m, ramp down 30s | 360 pages, list endpoints, wiring spec |
| S2: 1000 invoices generation | k6 | Constant arrival 50/s for 20s (1000 total) | `POST /api/invoices`, `POST /api/orchestrator/execute` (`generate_invoice`) |
| S3: 50 simultaneous payroll runs | k6 | 50 VUs spawn at t=0, single shot each | `POST /api/payroll/runs`, `POST /api/orchestrator/execute` (`process_payroll`) |

Run command (local):
```bash
k6 run --out json=_qa-reports-25/k6-out.json tests/load/erp-load.js
autocannon -c 100 -d 60 -p 10 http://localhost:3200/api/wiring/spec
```

---

## 2. Global Thresholds (k6 `thresholds` block)

```js
export const options = {
  thresholds: {
    // Latency (P95/P99) — Palantir-grade ERP target
    'http_req_duration{scenario:browse}':   ['p(95)<400', 'p(99)<800'],
    'http_req_duration{scenario:invoices}': ['p(95)<1500','p(99)<3000'],
    'http_req_duration{scenario:payroll}':  ['p(95)<5000','p(99)<10000'],

    // Error budget
    'http_req_failed':                      ['rate<0.01'],   // <1% failures global
    'http_req_failed{scenario:payroll}':    ['rate<0.005'],  // <0.5% for money flows
    'checks':                               ['rate>0.99'],

    // Throughput floors
    'http_reqs{scenario:browse}':           ['rate>200'],    // >=200 rps sustained
    'iterations{scenario:invoices}':        ['count>=1000'],

    // Custom metrics
    'invoice_create_duration':              ['p(95)<1500'],
    'payroll_run_duration':                 ['p(95)<5000','max<15000'],
    'state_transition_duration':            ['p(95)<300'],
  },
};
```

---

## 3. Scenario S1 — 100 Concurrent Users Browsing (k6)

`tests/load/scenarios/browse.js`:

```js
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const BASE_OPS = __ENV.BASE_OPS || 'http://localhost:3200';
const BASE_PROC = __ENV.BASE_PROC || 'http://localhost:3100';
const stateTrend = new Trend('state_transition_duration', true);

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      exec: 'browse',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },
        { duration: '5m',  target: 100 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '15s',
      tags: { scenario: 'browse' },
    },
  },
};

export function browse() {
  const headers = { 'Authorization': `Bearer ${__ENV.TOKEN}`, 'Accept-Language': 'he-IL' };

  group('360 pages', () => {
    const pages = ['customer','supplier','quote','rfq','project','workorder','po','finance','employee'];
    const t = pages[Math.floor(Math.random()*pages.length)];
    const r = http.get(`${BASE_OPS}/api/${t}360/sample-id`, { headers, tags: { ep: '360' }});
    check(r, { '360 status 200': (x) => x.status === 200, '360 has header+status': (x) => /status/i.test(x.body || '') });
  });

  group('list endpoints', () => {
    const r = http.get(`${BASE_PROC}/api/customers?limit=25&page=1`, { headers });
    check(r, { 'list 200': (x) => x.status === 200 });
  });

  group('wiring + entity-map', () => {
    http.get(`${BASE_OPS}/api/wiring/spec`, { headers });
    http.get(`${BASE_OPS}/api/entity-map/quote`, { headers });
    const tx = http.get(`${BASE_OPS}/api/state-machines/quote/transitions?current=DRAFT`, { headers });
    stateTrend.add(tx.timings.duration);
  });

  sleep(Math.random() * 2 + 1); // think time 1-3s
}
```

**Pass criteria:** P95<400ms on 360 pages, error rate <1%, sustained >=200 rps.

`autocannon` smoke equivalent (CI quick-gate):
```bash
autocannon -c 100 -d 60 -p 10 \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:3200/api/wiring/spec
# Pass: p99 < 800ms, non-2xx == 0
```

---

## 4. Scenario S2 — 1000 Invoices Generation (k6)

`tests/load/scenarios/invoices.js`:

```js
import http from 'k6/http';
import { check } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

const invoiceTrend = new Trend('invoice_create_duration', true);
const invoiceErr   = new Counter('invoice_errors');

const customers = new SharedArray('customers', () =>
  JSON.parse(open('./fixtures/customers-1000.json'))
);

export const options = {
  scenarios: {
    invoices: {
      executor: 'constant-arrival-rate',
      exec: 'createInvoice',
      rate: 50, timeUnit: '1s',
      duration: '20s',           // 50 * 20 = 1000 invoices
      preAllocatedVUs: 50, maxVUs: 200,
      tags: { scenario: 'invoices' },
    },
  },
};

export function createInvoice() {
  const c = customers[Math.floor(Math.random()*customers.length)];
  const payload = JSON.stringify({
    customer_id: c.id,
    project_id:  c.project_id,
    currency:    'ILS',
    lines: [
      { description: 'Service hours', qty: 10, unit_price: 350, vat_rate: 0.18 },
      { description: 'Materials',     qty: 1,  unit_price: 1250,vat_rate: 0.18 },
    ],
    issue_date: '2026-04-29',
    due_date:   '2026-05-29',
  });

  const headers = { 'Content-Type': 'application/json',
                    'Authorization': `Bearer ${__ENV.TOKEN}`,
                    'Idempotency-Key': `inv-${__VU}-${__ITER}` };

  const r = http.post(`${__ENV.BASE_PROC}/api/invoices`, payload, { headers });
  invoiceTrend.add(r.timings.duration);

  const ok = check(r, {
    'invoice 201': (x) => x.status === 201,
    'has invoice_number': (x) => !!(x.json() || {}).invoice_number,
    'state = ISSUED': (x) => (x.json() || {}).state === 'ISSUED',
    'totals balanced': (x) => {
      const j = x.json() || {};
      return Math.abs((j.subtotal + j.vat) - j.total) < 0.01;
    },
  });
  if (!ok) invoiceErr.add(1);
}
```

**Pass criteria:**
- 1000 invoices created, P95 <1500ms, P99 <3000ms.
- 0 duplicate invoice numbers (verify post-run via `SELECT COUNT(*) GROUP BY invoice_number HAVING COUNT(*)>1`).
- Idempotency: replaying same `Idempotency-Key` returns same row, no duplicates.
- Each invoice triggers state machine `quote->ISSUED` and emits `invoice.created` event (verify in audit log).

Post-run validation script (run after k6):
```bash
psql -c "SELECT COUNT(*) FROM invoices WHERE created_at > NOW() - INTERVAL '5 min';" # expect 1000
psql -c "SELECT invoice_number, COUNT(*) FROM invoices GROUP BY 1 HAVING COUNT(*)>1;" # expect 0 rows
```

---

## 5. Scenario S3 — 50 Simultaneous Payroll Runs (k6)

`tests/load/scenarios/payroll.js`:

```js
import http from 'k6/http';
import { check } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const payrollTrend = new Trend('payroll_run_duration', true);
const payrollOK    = new Rate('payroll_run_ok');

export const options = {
  scenarios: {
    payroll: {
      executor: 'per-vu-iterations',
      exec: 'runPayroll',
      vus: 50, iterations: 1,
      maxDuration: '3m',
      tags: { scenario: 'payroll' },
    },
  },
};

export function runPayroll() {
  // 50 distinct departments to avoid lock contention on same payroll cycle
  const deptId = `DEPT-${String(__VU).padStart(3,'0')}`;
  const payload = JSON.stringify({
    cycle_month: '2026-04',
    department_id: deptId,
    include_attendance: true,
    include_benefits:   true,
    israeli_tax_year:   2026,
    bituach_leumi:      true,
    pension:            true,
  });

  const headers = { 'Content-Type': 'application/json',
                    'Authorization': `Bearer ${__ENV.TOKEN}`,
                    'Idempotency-Key': `payroll-${deptId}-2026-04` };

  const r = http.post(`${__ENV.BASE_PAYROLL || 'http://localhost:5173'}/api/payroll/runs`,
                       payload, { headers, timeout: '30s' });

  payrollTrend.add(r.timings.duration);
  const ok = check(r, {
    'payroll 202 accepted': (x) => x.status === 202,
    'has run_id': (x) => !!(x.json() || {}).run_id,
    'state = QUEUED|PROCESSING': (x) => ['QUEUED','PROCESSING'].includes((x.json() || {}).state),
  });
  payrollOK.add(ok);

  // Poll completion (max 60s per run)
  if (ok) {
    const runId = r.json().run_id;
    let state = 'QUEUED', tries = 0;
    while (['QUEUED','PROCESSING'].includes(state) && tries < 30) {
      const s = http.get(`${__ENV.BASE_PAYROLL}/api/payroll/runs/${runId}`, { headers });
      state = (s.json() || {}).state;
      if (['COMPLETED','FAILED'].includes(state)) break;
      tries++;
    }
    check({ state }, { 'payroll completed': (o) => o.state === 'COMPLETED' });
  }
}
```

**Pass criteria:**
- 50/50 runs reach `COMPLETED` (>=99% success).
- P95 end-to-end (POST + completion poll) <5s.
- No deadlocks in DB (`pg_stat_activity` shows no blocked sessions).
- Each run produces: payslips per employee, audit-log row, MASAV file, Form 102 totals.

---

## 6. Combined Pipeline Test (orchestrator end-to-end)

Validates Master Flow under load: `Lead -> Quote -> Order -> Project -> WO -> PO -> Invoice -> Payment`. 20 VUs constant for 5m, threshold `p(95)<2000`. Each iteration drives `POST /api/orchestrator/execute` for the 9 actions; verifies state machine transitions and audit log count == iterations * 9.

---

## 7. Resource & SLO Thresholds

| Metric | Target | Source |
|---|---|---|
| Node event-loop lag (P99) | <100ms | `clinic doctor` / pino-perf |
| PG connections in use | <80% pool size | `pg_stat_database` |
| PG slow queries (>1s) | 0 during S1, <5 during S2/S3 | `pg_stat_statements` |
| CPU per service | <70% sustained | container stats |
| RSS memory | no growth >5% over 30 min | container stats |
| Redis latency P99 | <10ms | `redis-cli --latency-history` |

CI fails if any of: `http_req_failed > 1%`, P95 thresholds breached, or DB connection pool saturated.

---

## 8. File layout to add to repo

```
tests/load/
  erp-load.js                 # scenario aggregator (imports the 3 below)
  scenarios/
    browse.js
    invoices.js
    payroll.js
  fixtures/
    customers-1000.json
    employees-by-dept.json
  smoke/
    autocannon-browse.sh
  ci/
    thresholds.json           # parsed by GH Actions to gate PRs
```

GitHub Actions hook (`.github/workflows/load.yml`):
```yaml
- run: docker compose -f docker-compose.yml up -d --wait
- run: k6 run tests/load/erp-load.js
  env:
    BASE_OPS:     http://localhost:3200
    BASE_PROC:    http://localhost:3100
    BASE_PAYROLL: http://localhost:5173
    TOKEN:        ${{ secrets.LOAD_TEST_TOKEN }}
- run: node tests/load/ci/check-thresholds.js
```

---

## 9. Findings vs current codebase

- API surface confirmed: 4 services on documented ports; routes exist for invoices, payroll, orchestrator, wiring spec, entity-map, state-machines (see `api-server/src/routes/`, especially `payroll-engine.ts`, `israeli-payroll.ts`, `purchase-orders.ts`, `crm-customer360.ts`).
- No invoices route under explicit `/api/invoices` filename — handled inside `integration-hub.ts` and finance modules. The load tests target the documented public path; if the deployed router differs, update `BASE_PROC` paths only.
- No `tests/load/` folder exists yet — these scripts are net-new and ready to drop in.
- Payroll engine is async/queued; tests correctly use 202+poll pattern and idempotency key per (dept, cycle).
- Idempotency keys recommended on invoice + payroll POSTs to make the test rerunnable without polluting data.

## 10. Acceptance summary

- S1 (100 VUs browse): PASS if P95<400ms, errors<1%, >=200 rps.
- S2 (1000 invoices): PASS if all 1000 created, P95<1500ms, no duplicate numbers, idempotency holds.
- S3 (50 payroll runs): PASS if 50/50 complete, P95<5s, no DB deadlocks, MASAV/102 outputs generated.
- Pipeline E2E: PASS if state machine transitions succeed and audit log count matches expected.

End of AGENT-296 report.
