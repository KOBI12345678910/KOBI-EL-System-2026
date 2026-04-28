# AGENT-198 — Test Coverage Gap Analysis

**Date:** 2026-04-29
**Worktree:** objective-merkle-40ff93
**Method:** Static heuristics (no runnable coverage tool wired). Source-vs-test ratio across the 4 services (TECHNO_KOL_OPS, ONYX_PROCUREMENT, PAYROLL_AUTONOMOUS, ONYX_AI), per-domain comparison, and inspection of P0 critical paths defined in `CLAUDE.md`.

---

## 1. Headline Numbers

| Service | Source files | Test files | Ratio | Test runner wired? |
|---|---:|---:|---:|---|
| onyx-procurement | 436 | 351 | 0.81 | Jest, but `npm test` only runs `tests/*.test.js` (2 files) |
| payroll-autonomous | 88 | 14 | 0.16 | Vitest + Playwright |
| techno-kol-ops | 74 | 11 | 0.15 | None — `package.json` has NO `test` script |
| onyx-ai | 33 | 18 | 0.55 | `test = echo "tests coming soon" && exit 0` (18 test files orphaned) |
| **TOTAL** | **600** | **394** | **0.66** | Most tests are dark — never executed by CI |

> **Coverage tooling status:** No `nyc`, `c8`, `--coverage`, `istanbul`, or coverage threshold config in any service. No `coverage` npm script anywhere in the monorepo. There is an `onyx-procurement/test/coverage/` directory but it contains test files, not coverage reports.

---

## 2. Critical Findings — Test Runners Misconfigured

### 2a. onyx-procurement: ~349 of 351 tests are orphaned
`onyx-procurement/package.json`:
```
"test": "jest --testPathPattern='tests/.*\\.test\\.js$'"
```
The path pattern matches only `onyx-procurement/tests/` (2 files: `health.test.js`, `suppliers.test.js`). All ~340 tests under `onyx-procurement/test/**` and ~30 colocated `src/**/*.test.js` are **never executed by `npm test`**. The auxiliary `test:node` script exists but is not wired into root `npm test --workspaces`.

### 2b. onyx-ai: 18 test files exist, npm test is a stub
```
"test": "echo \"tests coming soon\" && exit 0"
```
Files like `event-store.test.ts`, `policies.test.ts`, `nlq-engine.test.ts`, `drift-detector.test.ts`, `hebrew.test.ts` exist but have no runner. No `jest`/`vitest`/`mocha` in deps.

### 2c. techno-kol-ops: no test script at all
Root `npm test --workspaces --if-present` silently skips it. Tests under `client/tests/e2e/` (Playwright) and `src/auth/jwt-helper.test.js` etc. are never run by `npm test`.

### 2d. payroll-autonomous: only frontend tests
Vitest is wired but only ~8 unit/component tests + 5 Playwright e2e specs cover 88 source files. No tests for routes, hooks, or admin permission console (`RouteMenuPermissionSyncConsole.tsx`).

---

## 3. Untested Critical Paths (P0)

### 3a. Pipeline / System Spine — 0% direct tests
Per `CLAUDE.md` the 6 modules in `onyx-procurement/src/pipeline/` are the "system definitions". None has a direct unit test:

| File | LOC | Test |
|---|---:|---|
| `pipeline-engine.js` | 567 | none |
| `state-machines.js` | 372 | none (13 machines, 91 transitions untested) |
| `entity-map.js` | 402 | none (16 entities untested) |
| `orchestrator.js` | 337 | none (18 actions untested) |
| `wiring-spec.js` | 333 | none (55 action→API mappings untested) |
| `workflow-flows.js` | 129 | none (5 business flows untested) |
| `domain-model.js` | 335 | none |
| `ontology.js` | 344 | none |
| `state-enforcement.js` | 115 | none |

`grep "state-machines" onyx-procurement/test` → no matches. Same for pipeline-engine, orchestrator, entity-map, wiring-spec, workflow-flows.

### 3b. Auth & RBAC — effectively untested
- `onyx-procurement/src/auth/rbac.js` (849 LOC) — **no rbac.test.js next to it**. The only RBAC test, `test/payroll/rbac.test.js`, is a payroll-scoped subset, not full role/permission matrix.
- `onyx-procurement/src/auth/totp.js` (481 LOC) — no test.
- `onyx-procurement/src/middleware/*.js` — 0 tests; auth middleware is the request-time enforcer of RBAC.
- One integration test (`integration/qa-03-auth-matrix.test.js`) covers HTTP role checks but does not exercise the underlying `rbac.js` decision logic.
- `techno-kol-ops/src/auth/jwt-helper.test.js` exists but is never invoked (no test script).

### 3c. Financial Calculations — partial
Tested: `tax/*` (12 tax forms), `finance/*` (17 reports), `wage-slip-calculator`, `pcn836`, `vat-routes`, `bank-matcher`.
**Untested (high financial impact):**
- `src/po/approval-matrix.js` (1,119 LOC — PO approval thresholds, the money gate) — no test
- `src/projects/pm-engine.js` (971 LOC — project margin/cost) — no test
- `src/inventory/optimizer.js` (692 LOC — stock valuation) — no test
- `src/budget/*`, `src/forecasting/*`, `src/intercompany/*`, `src/consolidation/*`, `src/costing/*`, `src/contracts/*` — 0 tests each
- `src/gl/*` (general ledger, 2 files) — 0 tests
- `src/invoices/invoice-pdf-generator.js` has a test, but no invoice-domain calculation test (rounding, currency, VAT)
- `src/vat/*` source — 0 unit tests (only routes)
- `src/validators/*` (5 files) — 0 tests
- `src/analytics/*` (4 files) — 0 tests

### 3d. State Machines — 91 transitions, no transition-table test
Per CLAUDE.md: "13 state machines with 91 transitions and trigger side-effects". `state-machines.js` defines them; no test enumerates valid transitions, rejects invalid ones, or verifies side-effect dispatch.

---

## 4. Per-Domain Test Coverage Map (onyx-procurement/src/)

Counts: source files (excl. tests) and tests under `onyx-procurement/test/<domain>/`.

**Well covered** (test count >= source count): `customer` 18/18, `hr` 16/17, `finance` 17/17, `reporting` 15/15, `devops` 15/15, `comms` 15/15, `realestate` 13/14, `sales` 12/13, `manufacturing` 12/13, `docs` 10/10, `compliance` 9/9, `privacy` 6/6, `security` 3/3, `quality` 3/3.

**Gap zones** (significant src, low/no test):
- `pipeline` 9/0 — system spine
- `cli` 19/1 — operational tooling
- `printing` 10/0 (3 colocated, 0 in test/)
- `tax-exports` 9/0
- `notifications` 7/0
- `bank` 6/0 (in test/) (1 colocated)
- `webhooks` 5/0 (1 colocated)
- `validators` 5/0
- `resilience` 5/0 (3 colocated, 0 in test/)
- `payments` 4/0 (1 colocated)
- `analytics` 4/0
- `imports` 4/0 (2 colocated)
- `vat` 2/0 (only route-level test exists)

---

## 5. Recommendations (priority-ordered)

**P0 — Unblock test execution this sprint**
1. Fix `onyx-procurement/package.json` `test` script: change pattern to `(test|tests|src)/.*\\.test\\.js$` so the existing 349 tests actually run.
2. Add real Vitest/Jest config + script to `onyx-ai/package.json` (replace stub) and to `techno-kol-ops/package.json` (add script).
3. Add `coverage` script per service (`jest --coverage` / `vitest run --coverage` with `c8`) and CI gate at e.g. 70% for changed files.

**P1 — Cover the spine**
4. Unit-test all 9 `pipeline/*.js` modules. Target: every state machine transition (allowed + rejected), every orchestrator action precondition, every entity action mapping.
5. Add `auth/rbac.test.js` and `auth/totp.test.js` covering full role x permission matrix and TOTP edge cases (skew, replay, lockout).
6. Add tests for middleware (auth, tenant, rate-limit, csrf if present).

**P2 — Cover the money**
7. Tests for `po/approval-matrix.js` (threshold boundaries, multi-step routing), `projects/pm-engine.js` (margin, EVM), `inventory/optimizer.js` (FIFO/LIFO/avg cost), `gl/*`, `budget`, `consolidation`, `intercompany` elimination, `costing`.
8. `validators/*` and `vat/` source-level tests (not just routes).

**P3 — Tooling**
9. Adopt `c8` (works for both ESM/CJS Node and TS via tsx) with `coverage-v8` reporter, enforce per-file thresholds for pipeline/auth/finance directories at 90%.
10. Wire root `npm test` to fail fast on any workspace exit code != 0; today most workspaces are silent.

---

## 6. Bottom Line

Apparent ratio is 0.66 tests-per-source, suggesting acceptable coverage. **In reality, executable coverage is near zero**: only 2 tests run by default in onyx-procurement, 18 tests are orphaned in onyx-ai, techno-kol-ops has no test script, and the pipeline/auth/RBAC/middleware/state-machine layers — the modules CLAUDE.md identifies as the system's foundation — have **no direct tests at all**. The codebase has invested in writing tests but not in running them. First fix is plumbing, second is the P0 spine.
