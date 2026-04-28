# AGENT-257 — Cross-Service Contracts Audit

**Agent:** 257 — Backend #2
**Scope:** 7 cross-service contracts declared in `onyx-procurement/src/pipeline/wiring-spec.js` (`CROSS_SERVICE_CONTRACTS`)
**Method:** Compare each declared `(action → endpoint)` to the route actually registered in the target service (`server.js` / `index.ts` / `*-routes.js`) and the bridge clients (`ai-bridge.js`, `bridges/ai-bridge.ts`, `bridges/procurement-bridge.ts`).
**Date:** 2026-04-29
**Verdict:** **HARD FAIL** — 4 of 7 contracts have **0% endpoint coverage**; only `ops→procurement` is partially wired. Two of the implemented bridges call paths that are **not in the spec at all** (parallel/competing API surface).

---

## 0. Service Map (canonical)

| Service | Spec port | Actual port | Where routes live |
|---|---|---|---|
| ops | 3200 | `process.env.PORT \|\| 3200` (`techno-kol-ops/src/index.ts:292`) | `techno-kol-ops/src/index.ts` + `routes/*` |
| procurement | 3100 | `server.js` (Express) | `onyx-procurement/server.js` + `src/**/*-routes.js` |
| ai | 3300 | `apiPort ?? 3100` default in `OnyxPlatform.start` (`onyx-ai/src/index.ts:2765`) — bridge expects 3300 | `onyx-ai/src/index.ts` (`APIServer.route`) |
| payroll | 5173 | Vite dev frontend only — **no backend** | payroll API lives inside procurement at `onyx-procurement/src/payroll/payroll-routes.js` |

Drift: AI default port is `3100` in code, but every bridge client (`techno-kol-ops/src/bridges/ai-bridge.ts:78`, `onyx-procurement/src/ai-bridge.js:58`) expects `3300` (or `3200` in the procurement variant — see contract 4). Three different ports for one service.

---

## 1. ops → procurement

Description: OPS asks Procurement for financial operations.

| # | Action | Spec endpoint | Actual endpoint | Status |
|---|---|---|---|---|
| 1 | `create_po` | `POST /api/purchase-orders` | not in `server.js` (only `GET /api/purchase-orders` at `server.js:1198` and `POST /api/purchase-orders/:id/approve\|send` at `:1212/:1267`) | **MISSING** — POST collection root not wired |
| 2 | `create_rfq` | `POST /api/rfq/send` | `server.js:688` `POST /api/rfq/send` | OK |
| 3 | `create_invoice` | `POST /api/invoices` | not registered anywhere in `onyx-procurement/server.js` or `src/**/*-routes.js` | **MISSING** |
| 4 | `get_financials` | `GET /api/analytics/project-financials/:projectId` | only `GET /api/analytics/{savings,spend-by-supplier,spend-by-category}` (`server.js:1603-1632`) | **MISSING** — no `project-financials` route |

Bridge drift (additional, undeclared): `techno-kol-ops/src/bridges/procurement-bridge.ts` exposes `getInvoices() → GET /api/invoices` (`:181`), `getSuppliers() → GET /api/suppliers` (`:190`), `getSupplier() → GET /api/suppliers/:id` (`:195`), `getPurchaseOrders() → GET /api/purchase-orders`. Of those, only `/api/suppliers*` and `GET /api/purchase-orders` exist server-side. `GET /api/invoices` does not exist in procurement.

**Coverage: 1/4 (25%).**

---

## 2. ops → payroll

Description: OPS sends work assignments to Payroll.

| # | Action | Spec endpoint | Actual endpoint | Status |
|---|---|---|---|---|
| 1 | `assign_employee` | `POST /api/payroll/assignments` | grep across whole repo: 0 matches in production code | **MISSING** |
| 2 | `record_attendance` | `POST /api/payroll/attendance` | 0 matches in production code | **MISSING** |
| 3 | `get_employee_costs` | `GET /api/payroll/employee-costs/:projectId` | 0 matches | **MISSING** |

Architectural note: payroll has no standalone backend (Vite frontend only). The actual payroll API lives **inside procurement** at `src/payroll/payroll-routes.js`, registered from `server.js:1556-1557`. That router exposes `employers`, `employees`, `wage-slips`, `wage-slips/compute`, `employees/:id/balances` — none of the 3 endpoints in this contract.

No bridge client exists for `ops→payroll` (no `payroll-bridge.ts` in `techno-kol-ops/src/bridges/`).

**Coverage: 0/3 (0%).**

---

## 3. procurement → ops

Description: Procurement notifies OPS about purchasing updates.

| # | Action | Spec endpoint | Actual endpoint | Status |
|---|---|---|---|---|
| 1 | `po_received` | `POST /api/ops/events` (`{event:'po_received',data:'PurchaseReceipt'}`) | no route matching `/api/ops/events` in `techno-kol-ops/src/index.ts` | **MISSING** |
| 2 | `invoice_issued` | `POST /api/ops/events` (`{event:'invoice_issued',data:'InvoiceSummary'}`) | same — no consumer endpoint | **MISSING** |

Drift: procurement does have `POST /events` consumed by **AI** (`onyx-ai/src/index.ts:2447`), and there is an in-process `eventBus` (`techno-kol-ops/src/index.ts:286,290`) that is never exposed over HTTP. The wiring spec promises a per-target `/api/ops/events` HTTP seam that nobody implemented. No outbound caller in procurement either — there is no `procurement→ops` client analog of `procurement-bridge.ts`.

**Coverage: 0/2 (0%).**

---

## 4. procurement → ai

Description: Procurement sends data to AI for analysis.

| # | Action | Spec endpoint | Actual endpoint | Status |
|---|---|---|---|---|
| 1 | `analyze_spending` | `POST /api/ai/analyze` | AI router has only `/api/status,/api/events,/api/audit,/api/knowledge/*,/api/kill,/api/resume,/api/integrity,/api/notifications/*` (see `onyx-ai/src/index.ts:2334-2690`) | **MISSING** |
| 2 | `forecast_cashflow` | `POST /api/ai/forecast` | no `/api/ai/*` paths exist on AI server | **MISSING** |
| 3 | `detect_anomalies` | `POST /api/ai/anomaly` | same — not registered | **MISSING** |

Bridge drift (parallel surface that **does** exist): `onyx-procurement/src/ai-bridge.js` calls **`POST /evaluate`**, **`POST /events`**, **`GET /budget`**, **`GET /health`**. AI implements all four (`onyx-ai/src/index.ts:2361/2379/2447/2479`). These are real, working contracts — but **none of them appear in `CROSS_SERVICE_CONTRACTS['procurement→ai']`**. The spec and the implementation describe two different APIs.

Port drift: `onyx-procurement/src/ai-bridge.js:58` defaults `DEFAULT_BASE_URL = 'http://localhost:3200'` (with a comment at `onyx-ai/src/index.ts:2278` saying the default was changed from 3100→3200 to match procurement). The other bridge (`techno-kol-ops/src/bridges/ai-bridge.ts:78`) defaults to `3300`. The wiring spec says `3300`. The platform's own `OnyxPlatform.start` defaults to `3100` (`index.ts:2765`). **Four different port answers.**

**Coverage: 0/3 vs spec; 4/4 vs the actual undocumented surface.**

---

## 5. payroll → procurement

Description: Payroll sends cost data to Finance.

| # | Action | Spec endpoint | Actual endpoint | Status |
|---|---|---|---|---|
| 1 | `post_payroll_costs` | `POST /api/gl/transactions` | `src/gl/` contains only `financial-statements.js` and `journal-entry.js` — neither registers an HTTP route | **MISSING** |
| 2 | `create_bank_file` | `POST /api/bank/import-payroll` | `src/bank/bank-routes.js` exposes `accounts, transactions, matches, discrepancies, summary, accounts/:id/import` but **not** `import-payroll` | **MISSING** |

Caller side: payroll is a frontend Vite app — no outbound HTTP client exists to make these calls. The contract is dead on both ends.

**Coverage: 0/2 (0%).**

---

## 6. ai → ops

Description: AI sends alerts and recommendations to OPS.

| # | Action | Spec endpoint | Actual endpoint | Status |
|---|---|---|---|---|
| 1 | `send_alert` | `POST /api/ops/alerts` | `techno-kol-ops/src/index.ts:148` mounts `/api/alerts` (no `/api/ops/` prefix). Router (`routes/alerts.ts`) handles ops-internal CRUD, not AI ingest. | **MISSING (path mismatch)** |
| 2 | `send_recommendation` | `POST /api/ops/recommendations` | no route at this path; nothing in `techno-kol-ops/src/routes/` | **MISSING** |

Caller side: AI has no `ops-bridge` client. The only outbound path observed in AI is `POST /api/notifications/*` → procurement — different contract entirely.

**Coverage: 0/2 (0%).**

---

## 7. ai → procurement

Description: AI sends financial signals to Procurement.

| # | Action | Spec endpoint | Actual endpoint | Status |
|---|---|---|---|---|
| 1 | `risk_signal` | `POST /api/finance/risk-signals` | `src/finance/` contains no `*-routes.js`; grep across repo: 0 matches outside spec/docs | **MISSING** |
| 2 | `price_recommendation` | `POST /api/pricing/recommendations` | `src/pricing/` has `bundle.js`, `discount-rules.js`, `price-optimizer.js` — none register an HTTP route | **MISSING** |

Caller side: same as #6 — AI has no outbound client targeting procurement for these.

**Coverage: 0/2 (0%).**

---

## Summary table

| Contract | Endpoints expected | Found | Coverage |
|---|---|---|---|
| 1. ops→procurement | 4 | 1 | 25% |
| 2. ops→payroll | 3 | 0 | 0% |
| 3. procurement→ops | 2 | 0 | 0% |
| 4. procurement→ai | 3 | 0 (but 4/4 undocumented working) | 0% vs spec |
| 5. payroll→procurement | 2 | 0 | 0% |
| 6. ai→ops | 2 | 0 | 0% |
| 7. ai→procurement | 2 | 0 | 0% |
| **Total** | **18** | **1** | **5.6%** |

---

## Top findings (severity-ordered)

1. **Critical — 17/18 cross-service endpoints unwired.** The wiring spec is aspirational documentation; the bridge layer is a parallel undocumented API. Master Flow stages that depend on cross-service hops (Procurement, Execution, Cash, Closure) cannot complete without manual intervention.
2. **Critical — payroll has no service.** Spec says port 5173 with 9 owned entities; reality is a Vite frontend. Payroll APIs are tenants of procurement (`onyx-procurement/src/payroll/payroll-routes.js`). All `ops→payroll` and `payroll→procurement` calls are misaddressed.
3. **High — AI port is 3-way ambiguous.** `OnyxPlatform.start` default 3100 vs `procurement/ai-bridge.js` default 3200 vs `ops/bridges/ai-bridge.ts` and the wiring spec default 3300. Whichever number is "right", two of three callers will 404.
4. **High — procurement→ai spec describes endpoints (`/api/ai/analyze`, `/api/ai/forecast`, `/api/ai/anomaly`) that nobody implemented; the working surface (`/evaluate`, `/events`, `/budget`, `/health`) is not in the spec.** Document one or kill the other.
5. **High — `procurement→ops` event bus is in-process only.** `eventBus` (`techno-kol-ops/src/index.ts:286,290`) never exposes `POST /api/ops/events` over HTTP. Procurement cannot push `po_received` / `invoice_issued` even if it tried (and no caller exists).
6. **Medium — bridge drift.** `techno-kol-ops/src/bridges/procurement-bridge.ts` calls `GET /api/invoices` which does not exist. `techno-kol-ops/src/bridges/ai-bridge.ts` calls `POST /api/anomaly/detect`, `POST /api/forecast/query`, `GET /api/insights`, `GET /api/quality/score/:type/:id` — none of which are in the wiring spec **or** implemented on AI.
7. **Medium — `ai→ops` path-prefix mismatch.** Spec says `/api/ops/alerts`; ops mounts `/api/alerts`. A search/replace fix, but it would silently 404 today.
8. **Low — POST `/api/purchase-orders` collection-root not wired** despite being the canonical "create PO" verb in the action map (`wiring-spec.js:163`); only `/:id/approve` and `/:id/send` exist.

---

## Files referenced

- `onyx-procurement/src/pipeline/wiring-spec.js` (lines 243-297 — contract definitions)
- `onyx-procurement/server.js` (1838 lines; routes at 559-1717)
- `onyx-procurement/src/ai-bridge.js` (lines 1-100, 205-275 for endpoints)
- `onyx-procurement/src/bank/bank-routes.js`, `payroll/payroll-routes.js`, `vat/vat-routes.js`, `tax/annual-tax-routes.js`
- `techno-kol-ops/src/index.ts` (lines 82-298)
- `techno-kol-ops/src/bridges/ai-bridge.ts`, `bridges/procurement-bridge.ts`
- `onyx-ai/src/index.ts` (`APIServer` class at 2265-2710)
- `payroll-autonomous/src/` (frontend only — no backend)
