# AGENT-158 — Test Suite Audit

Date: 2026-04-29
Scope: All `test/`, `tests/`, `__tests__/` directories outside `node_modules` and `_merge-incoming/_audit_tmp/_master-registry/_delivery` archives.

## 1. Inventory

| Location | Files | Type |
|---|---:|---|
| `/test/` (root) | 27 | Hand-rolled Node test harness (`*.test.js`) |
| `/onyx-procurement/test/` | 316 | `node --test` (built-in) |
| `/onyx-procurement/src/**/*.test.js` (inline) | 28 | Jest (declared) / `node --test` mix |
| `/onyx-procurement/tests/e2e/` | 5 | Playwright |
| `/onyx-ai/test/` | 18 | `node --test` + `ts-node/register` |
| `/payroll-autonomous/src/**/*.test.{ts,jsx,js}` | 8 | Vitest + React Testing Library |
| `/payroll-autonomous/test/` | 1 | smoke |
| `/payroll-autonomous/tests/e2e/` | 5 | Playwright |
| `/techno-kol-ops/src/**/*.test.js` | 2 | unspecified harness |
| `/techno-kol-ops/client/src/test/` | 2 | Vitest (`*.test.tsx`/`*.test.ts`) |
| `/techno-kol-ops/client/tests/e2e/` | 6 | Playwright |
| `/techno-kol-ops/test/smoke.test.js` | 1 | smoke |
| `/api-server/src/__tests__/` | 8 | Vitest (5 unit / 3 integration) |
| `/AI-Task-Manager/artifacts/api-server/src/__tests__/` | 8 | Vitest (mirror of `/api-server`) |
| `/nexus_engine/test/smoke-test.js` | 1 | smoke |

Total project test files (excluding archives/duplicates): ~426.
Combined LOC across root `test/` + `onyx-procurement/test|src` test files: ~198,000 lines.

## 2. Frameworks Present

| Framework | Where | Driver |
|---|---|---|
| **`node:test`** (Node ≥ 20 built-in) | `onyx-ai/test`, `onyx-procurement/test`, root `test/` | `node --test` and `ts-node/register` for TS |
| **Jest 29** | `onyx-procurement` (devDep) | `npm test` — `jest --testPathPattern='tests/.*\.test\.js$'` (note: matches `tests/` not `test/` — see findings) |
| **Vitest 1.6** | `payroll-autonomous`, `api-server`, `techno-kol-ops/client` | `vitest run`; coverage via `@vitest/coverage-v8` (config in `api-server/vitest.config.ts`) |
| **Playwright** | `onyx-procurement`, `payroll-autonomous`, `techno-kol-ops/client` | E2E with three viewport projects (1920/1280/375), Hebrew/RTL locale |
| **React Testing Library** | `payroll-autonomous`, `techno-kol-ops/client` | jsdom env |
| **Hand-rolled harness** | root `test/` (27 files) | `assertEq` + counters, zero deps, runnable on plain Node |

## 3. Test-Script Wiring (package.json)

| Service | `test` script | Status |
|---|---|---|
| Root monorepo | `npm test --workspaces --if-present` | OK fan-out |
| `onyx-procurement` | `jest --testPathPattern='tests/.*\.test\.js$'` | **BROKEN — pattern targets `tests/` but 316 unit files live in `test/`. Jest devDep installed, but tests are written for `node:test`. The `test:node` script (`node --test test/**/*.test.js`) is the working path.** |
| `onyx-ai` | `echo "tests coming soon" && exit 0` | **18 real tests exist on disk; never executed by `npm test`.** |
| `payroll-autonomous` | `vitest run` / `test:e2e: playwright test` | OK |
| `techno-kol-ops` | (no `test` script) | **No runner wired despite tests existing in client + src.** |
| `api-server` | (Vitest configured, script not surveyed in this pass) | Vitest config present with coverage thresholds |

## 4. What's Actually Tested (by surface)

### onyx-procurement (`test/` 316 files)
Top folders by file count:
- `payroll/` 51 — allocation engine, MASAV exporter, payment-run, FX, journal entry, time tracking, supplier portal, RFQ, KB, PM, deposit slip, contract, expense, asset, approval matrix, dep-health, SLO/synthetic monitor, sync-queue, logger…
- `customer/` 18 — CSAT, NPS, churn, advocacy, loyalty, journey, segmentation, success-plan, QBR, voc, onboarding, comm-log
- `finance/` 17, `hr/` 16, `reporting/` 15, `devops/` 15 (autoscaler, blue-green, chaos, A/B, feature flags), `comms/` 15, `realestate/` 13, `sales/` 12, `manufacturing/` 12, `tax/` 11, `docs/` 10, `api/` 10
- `compliance/` 9 (AML, sanctions, PEP, whistleblower, legal-hold, gift register, conflict-of-interest, retention, consumer complaints)
- `integration/` 8, `e2e/` 7, `privacy/` 6, `security/` 3, `regression/` 5, `unit/` 5
- Israel-specific: `bl/form-102-bl.test.js`, `bl/health-insurance.test.js`, top-level `pcn836`, `vat-routes`, `annual-tax-routes`, `wage-slip-calculator`, `quarterly-tax-report`
- Infra: `backup/`, `dr/`, `chaos/`, `bench/`, `load/`, `stress/`, `profiler/`, `flags/`, `experiments/`, `coverage/`, `contract/` (with fixtures)

### onyx-procurement inline (`src/**/*.test.js` — 28 files)
Mostly co-located unit tests for: ai-bridge, bank multi-format-parser, db query-analyzer, csv/legacy imports, scheduler, notifications, invoice-OCR, error-tracker, QR payments, IPP/thermal/ZPL printing, queue+worker, four reports (cash-flow, inventory valuation, mgmt dashboard PDF, P&L), resilience (circuit-breaker, DLQ, retry), barcode scanner, SMS/WhatsApp/email templates, tax-exports, webhook-sender.

### onyx-ai (`test/` — 18 files, ~1.4k LOC for top 3)
- Platform lifecycle (`platform.test.ts` 408 lines) — start/shutdown, governor, knowledge graph, /api/status, /api/events, /api/audit, /api/integrity, /api/knowledge/*, /api/kill, /api/resume, /api/agent/:id/suspend
- `event-store.test.ts` 577 lines, `policies.test.ts` 449 lines
- ML toolkit: `classification`, `clustering`, `drift-detector`, `feature-importance`, `recommender`
- Stats: `correlation`, `outlier-explainer`
- Domain modules: `anomaly`, `forecast/comparator`, `insights/auto-insights`, `nlp/hebrew`, `nlq/nlq-engine`, `quality/data-quality`, `seasonality`, `trends/trend-detector`

### Root `/test/` (27 files)
- `payroll/` (25): MASAV, deposit slip, allocation engine, contract manager, approval matrix, FX, KB, PM, RFQ, journal entry, expense manager, asset manager, sync-queue, supplier-portal, time-tracking, logger, payment-run, petty-cash, slo-tracker, synthetic-monitor, dep-health, form-857, crm-pipeline
- `manufacturing/wo-scheduler.test.js`
- `realestate/tenant-portal.test.js`, `sales/commission.test.js`, `deploy/manifest-generator.test.js`
- All run on a hand-rolled assertion harness (`assertEq`, results array). Likely older sibling of `onyx-procurement/test/payroll/*`.

### Playwright E2E (16 specs across 3 services)
- onyx-procurement (5): `mega-index`, `vat-dashboard`, `bank-dashboard`, `annual-tax-dashboard`, `api-contract` — booted via `tests/e2e/static-server.js` (no DB needed).
- payroll-autonomous (5): `compute-wage-slip`, `dashboard`, `employees`, `employers`, `navigation`
- techno-kol-ops/client (6): `accessibility`, `navigation`, `ops-dashboard`, `responsive`, `rtl-hebrew`, `tickets`
- All configured for `he-IL` locale + `Asia/Jerusalem` TZ across desktop-1920 / laptop-1280 / mobile-375 viewports.

### api-server / AI-Task-Manager (Vitest with coverage)
- Unit (5): auth, inventory-service, invoice-calculations, payroll-engine, permission-engine
- Integration (3): auth-flow, financial-flow, work-order-lifecycle
- Coverage thresholds enforced (lines 80 / functions 80 / branches 70 / statements 80) on `services/**`, `lib/auth.ts`, `lib/permission-engine.ts`, `lib/audit-middleware.ts`.
- AI-Task-Manager `artifacts/api-server` is a byte-identical mirror of `api-server` — counted once in totals to avoid double-billing.

## 5. Coverage

- **Only `api-server`/AI-Task-Manager artifacts have coverage configured** (Vitest v8 provider, 80/80/70/80 thresholds, lcov+html reports).
- **No coverage tooling** wired for `onyx-procurement`, `onyx-ai`, root `test/`, `techno-kol-ops`, or `payroll-autonomous`.
- No `coverage/` output dirs found in tree.

## 6. Findings & Risks

1. **`onyx-ai` test script is a no-op** — `npm test` prints "tests coming soon" while 18 real test files exist. Fix: replace with `node --test --require ts-node/register test/**/*.test.ts`.
2. **`onyx-procurement` test script is mis-pointed** — Jest pattern targets `tests/` (Playwright dir, 5 files) instead of `test/` (316 files). Tests are written against `node:test`, not Jest. Fix: switch primary `test` script to `test:node` (`node --test test/**/*.test.js`) and reserve a separate `test:e2e` for Playwright.
3. **`techno-kol-ops` lacks any `test` script** despite having unit tests (`jwt-helper`, `env`, `smoke`) plus Vitest + Playwright client suites.
4. **Two harnesses for the same payroll surface** — root `/test/payroll/` (25 files, hand-rolled) and `onyx-procurement/test/payroll/` (51 files, `node:test`). Risk of drift; consolidate.
5. **No coverage gates** outside `api-server`. With ~426 test files and ~198k LOC, absence of coverage measurement leaves the floor invisible.
6. **No CI invocation surveyed in this audit** — `_qa-reports-25/AGENT-167-ci-workflows.md` exists; cross-reference recommended.
7. **Mixed test conventions in `onyx-procurement/src/**.test.js`** — files written for `node:test` but Jest is the declared runner; under current scripts neither runs them.
8. **Duplicate suites in archives** — `_merge-incoming/`, `_merge-staging-final/`, `imported-from-github/`, `imported-from-replit/` contain copies of E2E and unit tests; excluded from this audit but pollute global searches.

## 7. Files of Interest

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-ai\package.json` (line 14, broken `test` script)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\package.json` (line 9, mis-pointed Jest pattern)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\playwright.config.js` (3-viewport, he-IL setup)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\vitest.config.ts` (only coverage thresholds in tree)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-ai\test\platform.test.ts` (most thorough lifecycle test in repo)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\test\payroll\allocation-engine.test.js` (representative hand-rolled harness)

## 8. Summary

The repository has an unusually large hand-written test corpus (~426 files, ~198k LOC) targeting payroll, procurement, AI, compliance, finance, and Israeli-tax domains in depth, plus 16 Playwright specs covering RTL/Hebrew across three viewports. **The blocker is wiring, not coverage of intent.** Two of four services (`onyx-ai`, `onyx-procurement`) cannot execute their own tests via `npm test` due to script bugs; `techno-kol-ops` has no script at all. Only `api-server` has measured coverage. Fixing the four `test`-script lines and standardizing on `node --test` for the legacy suites + Vitest where already configured would unlock the existing test surface immediately.
