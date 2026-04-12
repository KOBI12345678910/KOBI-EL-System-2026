# SMOKE TESTS — ONYX Procurement

Agent 50 — End of Wave 1. Zero-dependency smoke test harness for a running ONYX API server.

> Rule: **לא מוחקים** (no deletions). The harness only reads, creates a
> fixture supplier row, and PATCHes that same row. It never issues DELETE
> requests against any endpoint, never removes log files, and never truncates
> state.

---

## TL;DR

```bash
# assumes onyx server is already running on localhost:3100
npm run smoke

# with explicit URL + api-key
BASE_URL=https://staging.onyx.example.com API_KEY=xxx npm run smoke

# run smoke against all 4 KOBI EL projects in parallel
node scripts/smoke-all.js
```

Exit code `0` means every check passed; `1` means at least one failed. A
JSON summary is always written to `logs/smoke-results.json` (and
`logs/smoke-all-results.json` for the fan-out).

---

## Files

| Path | Purpose |
|------|---------|
| `scripts/smoke-test.js` | Happy-path smoke harness against a single running server |
| `scripts/smoke-all.js`  | Runs `smoke-test.js` against the 4 main KOBI EL projects in parallel |
| `logs/smoke-results.json`     | Per-run JSON summary written by `smoke-test.js` |
| `logs/smoke-all-results.json` | Aggregate JSON summary written by `smoke-all.js` |

Both scripts use **only** Node's native `http` / `https` / `fs` / `path` /
`child_process` / `url` modules. No external npm dependencies.

Node version: **>= 18** (required for `URL` constructor, `req.setTimeout`,
and stable stream semantics).

---

## What it checks

`smoke-test.js` runs the following checks **in order**, with a shared
context (the supplier id created in step 4 is reused in steps 5–6):

| # | Method | Path | Assertion |
|---|--------|------|-----------|
| 1 | GET  | `/healthz` | status 200 + `{ok:true}` |
| 2 | GET  | `/readyz`  | status 200 |
| 3 | GET  | `/api/suppliers` | status 200 + array body |
| 4 | POST | `/api/suppliers` | status 201/200 + `{id}` — fixture supplier is captured in context |
| 5 | GET  | `/api/suppliers/:id` | status 200 (uses captured id) |
| 6 | PATCH | `/api/suppliers/:id` | status 200 (uses captured id) |
| 7 | GET  | `/api/invoices` | status 200 |
| 8 | GET  | `/api/vat/summary?year=2026&month=3` | status 200 |
| 9 | POST | `/api/payroll/wage-slips/compute` | status 200 + `net_pay > 0` — payroll fixture posted |
| 10 | GET | `/api/bank/transactions` | status 200 |
| 11 | GET | `/api/annual-tax/summary?year=2025` | status 200 |

Each check:

- Returns **pass/fail** plus an elapsed time in milliseconds.
- Retries up to `SMOKE_RETRIES` times (default **3**) on failure, waiting
  `SMOKE_DELAY` ms (default **500**) between attempts.
- Aborts the individual HTTP request after `SMOKE_TIMEOUT` ms (default
  **5000**) to prevent a slow endpoint from blocking the entire run.
- Supplies `X-API-Key: $API_KEY` automatically when `API_KEY` is set.

The supplier fixture is timestamped so reruns never collide:

```js
{
  name:   `Smoke Test Supplier <timestamp>`,
  email:  `smoke+<timestamp>@example.test`,
  phone:  '+972-50-0000000',
  category: 'hardware',
  tax_id: '000000000',
  payment_terms: 'net_30',
  notes: 'Created by smoke-test.js — safe to keep, never deleted.',
}
```

The wage-slip fixture:

```js
{
  employee_id: 'smoke-emp-0001',
  year: 2026, month: 3,
  base_salary: 12000,
  hours_worked: 186,
  overtime_hours: 0,
  bonuses: 0,
  tax_credits: 2.25,
  dependents: 0,
}
```

---

## Environment variables

### `smoke-test.js`

| Variable | Default | Purpose |
|----------|---------|---------|
| `BASE_URL`      | `http://localhost:3100` | Target server base URL |
| `API_KEY`       | _(empty)_ | Sent as `X-API-Key` header on every request |
| `SMOKE_TIMEOUT` | `5000`    | Per-request timeout (ms) |
| `SMOKE_RETRIES` | `3`       | Retry count for a failing check |
| `SMOKE_DELAY`   | `500`     | Delay between retries (ms) |
| `SMOKE_QUIET`   | `0`       | Set to `1` to suppress per-request log lines |
| `NO_COLOR`      | _(unset)_ | Set to `1` to disable ANSI colors |

### `smoke-all.js` (fan-out across 4 projects)

| Variable | Default | Purpose |
|----------|---------|---------|
| `ONYX_BASE_URL`    | `http://localhost:3100` | `onyx-procurement` target |
| `ONYX_API_KEY`     | _(empty)_ | API key for onyx |
| `PAYROLL_BASE_URL` | `http://localhost:3200` | `payroll-autonomous` target |
| `PAYROLL_API_KEY`  | _(empty)_ | API key for payroll |
| `TECHNO_BASE_URL`  | `http://localhost:3300` | `techno-kol-ops` target |
| `TECHNO_API_KEY`   | _(empty)_ | API key for techno-kol-ops |
| `AI_BASE_URL`      | `http://localhost:3400` | `onyx-ai` target |
| `AI_API_KEY`       | _(empty)_ | API key for onyx-ai |
| `SMOKE_TIMEOUT` / `SMOKE_RETRIES` / `SMOKE_DELAY` | inherited | Passed through to each child |

`smoke-all.js` prefers a sibling project's own `scripts/smoke-test.js` if
one exists; otherwise it falls back to running this project's harness with
the sibling's `BASE_URL`, letting the shared tax/payroll/VAT surface be
exercised in all 4 services.

---

## Output format

### Terminal (ANSI colored)

```
════════════════════════════════════════════════════════════
  ONYX SMOKE TEST — http://localhost:3100
  timeout=5000ms  retries=3  delay=500ms  apiKey=yes
════════════════════════════════════════════════════════════

  ✓ GET /healthz (12ms, try 1/3)
  ✓ GET /readyz (41ms, try 1/3)
  ✓ GET /api/suppliers (18ms, try 1/3)
  ✓ POST /api/suppliers (34ms, try 1/3)
  ✓ GET /api/suppliers/:id (9ms, try 1/3)
  ✓ PATCH /api/suppliers/:id (22ms, try 1/3)
  ✓ GET /api/invoices (11ms, try 1/3)
  ✓ GET /api/vat/summary (15ms, try 1/3)
  ✓ POST /api/payroll/wage-slips/compute (47ms, try 1/3)
  ✓ GET /api/bank/transactions (13ms, try 1/3)
  ✓ GET /api/annual-tax/summary (14ms, try 1/3)

────────────────────────────────────────────────────────────
Summary: 11 passed, 0 failed, 11 total  (236ms)
────────────────────────────────────────────────────────────

  JSON summary → /path/to/onyx-procurement/logs/smoke-results.json
```

Failing checks show a red `✗` with the underlying error and the elapsed
time; retries are rendered as yellow `…` lines.

### JSON — `logs/smoke-results.json`

```jsonc
{
  "project": "onyx-procurement",
  "base_url": "http://localhost:3100",
  "started_at": "2026-04-11T09:00:00.000Z",
  "finished_at": "2026-04-11T09:00:00.236Z",
  "duration_ms": 236,
  "total": 11,
  "passed": 11,
  "failed": 0,
  "config": {
    "timeout_ms": 5000,
    "retries": 3,
    "retry_delay_ms": 500,
    "api_key_sent": true
  },
  "results": [
    { "name": "GET /healthz", "status": "pass", "attempt": 1, "duration_ms": 12, "detail": { "uptime": 3.4 } },
    { "name": "GET /readyz",  "status": "pass", "attempt": 1, "duration_ms": 41, "detail": { "ready": true } }
    /* … */
  ]
}
```

### JSON — `logs/smoke-all-results.json` (fan-out)

```jsonc
{
  "started_at": "2026-04-11T09:00:00.000Z",
  "finished_at": "2026-04-11T09:00:05.500Z",
  "duration_ms": 5500,
  "total_projects": 4,
  "passed_projects": 4,
  "failed_projects": 0,
  "projects": [
    {
      "slug": "onyx-procurement",
      "label": "ONYX Procurement",
      "base_url": "http://localhost:3100",
      "exit_code": 0,
      "duration_ms": 250,
      "fallback": false,
      "error": null,
      "child_summary": { /* the child's logs/smoke-results.json */ }
    }
    /* … onyx-ai, payroll-autonomous, techno-kol-ops */
  ]
}
```

---

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Every check (or every child) passed |
| `1` | At least one check/child failed, or a fatal unhandled error |

This matches the convention expected by CI systems and `npm run smoke`.

---

## CI integration

```yaml
# .github/workflows/smoke.yml (example)
- name: Boot server
  run: node server.js &
- name: Wait for /healthz
  run: |
    for i in {1..30}; do
      curl -fsS http://localhost:3100/healthz && break
      sleep 1
    done
- name: Run smoke tests
  env:
    BASE_URL: http://localhost:3100
    API_KEY:  ${{ secrets.ONYX_API_KEY }}
  run: npm run smoke
- name: Upload smoke JSON
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: smoke-results
    path: logs/smoke-results.json
```

---

## Adding a new check

1. Write an `async` function in `smoke-test.js`:
   ```js
   async function checkSomething() {
     const res = await request('GET', `${BASE_URL}/api/something`);
     assert(res.status === 200, `expected 200, got ${res.status}`);
     return { detail: { /* anything useful */ } };
   }
   ```
2. Append `['GET /api/something', checkSomething]` to the `CHECKS` array.
3. Use the shared `context` object to pass state between checks (e.g. an
   id created in an earlier POST step).

Checks should always:

- Throw with a descriptive message on failure (`assert(cond, msg)` helper).
- Avoid destructive operations — **no DELETE**, no truncation, no writes
  outside of the fixture rows documented above.
- Respect the `TIMEOUT_MS` envelope (5s by default).

---

## Troubleshooting

- **`ECONNREFUSED`** — the server isn't running on `BASE_URL`. Start it
  with `npm start` (or `node server.js`) and wait for `/healthz` to
  respond before rerunning.
- **`401 Unauthorized`** on `/api/*` — set `API_KEY=…` to match one of the
  values in `API_KEYS` on the server side.
- **`timeout_5000ms`** — the endpoint is slower than the 5s envelope.
  Raise it temporarily with `SMOKE_TIMEOUT=15000 npm run smoke`.
- **Check fails only on `logs/` write** — the `logs/` directory will be
  auto-created; verify the process has write permission on the project
  root if the warning persists.
- **`smoke-all.js` reports `[fallback]`** — a sibling project doesn't yet
  have its own `scripts/smoke-test.js`, so this harness was reused against
  its `BASE_URL`. Checks that assume ONYX-specific routes may not apply.

---

## Related

- `scripts/smoke-test.js` — the single-server harness (this document's subject)
- `scripts/smoke-all.js` — parallel fan-out runner
- `package.json` — declares `"smoke": "node scripts/smoke-test.js"`
- `server.js` — defines `/healthz`, `/readyz`, and the API surface being probed
- `QA-AGENT-*.md` — broader QA agent reports in this directory
