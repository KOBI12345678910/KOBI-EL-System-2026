# AGENT-185 — Intercompany Audit (חברות בנות)

**Agent:** 185
**Date:** 2026-04-29
**Reference:** `_qa-reports/AG-X41-intercompany.md`
**Scope:** Intercompany engine, transfer pricing, eliminations, consolidation
**Verdict:** GREEN engine + UI/API; YELLOW consolidator (6/24 failing); ORANGE security

---

## 0. Executive Summary

| Layer                  | File                                                       | LOC   | Status |
|------------------------|------------------------------------------------------------|-------|--------|
| IC Engine (X-41)       | `onyx-procurement/src/intercompany/ic-engine.js`           | 1,444 | GREEN — 26/26 tests pass |
| Consolidator (X-42)    | `onyx-procurement/src/consolidation/consolidator.js`       | 1,468 | YELLOW — 18/24 tests pass (6 fail: AR/AP offset, goodwill, NCI, FV, FX/CTA, regression) |
| Transfer Pricing (Y-010)| `onyx-procurement/src/tax/transfer-pricing.js`            | 1,408 | GREEN — 40/40 tests pass |
| IC Loans (Y-085)       | `onyx-procurement/src/finance/ic-loans.js`                 | 1,307 | GREEN — 38/38 tests pass |
| API routes             | `api-server/src/routes/intercompany.ts`                    |   309 | ORANGE — SQL injection risk |
| UI page                | `erp-app/src/pages/finance/intercompany.tsx`               |   450 | GREEN — 5 tabs, RTL, bilingual |

Total: 6,386 LOC across 6 files. Routes mounted at `/api/intercompany/*` (api-server `routes/index.ts:476-477`); UI at `/finance/intercompany` (erp-app `App.tsx:1600`).

---

## 1. IC Engine — Reference Module (X-41) — GREEN

`onyx-procurement/src/intercompany/ic-engine.js` matches the AG-X41 spec exactly. Public API verified:

- **Entities (5 types):** parent, subsidiary, branch, joint_venture, associate — all bilingual labels.
- **Transactions (11 types):** sale_goods, sale_service, management_fee, loan_principal, loan_interest, rent, royalty, cost_sharing, dividend, capital_injection, reimbursement.
- **Auto-mirror:** every `recordICTransaction` produces a primary (`side='from'`) and a counterparty mirror (`side='to'`, `mirrorOf=primary.id`) — wired at lines 707-720.
- **Reconciliation codes:** `REC_UNMATCHED`, `REC_DIRECTION`, `REC_AMOUNT`, `REC_CCY` — orphan-mirror detection at lines 875-893.
- **Non-destructive reversals:** `reverseTransaction` creates an opposite-signed entry; original + mirror flagged `reversed` (lines 756-784).
- **§85A TP engine:** 10 issue codes (TP_LOW_MARKUP, TP_NO_COST, TP_LOAN_LOW/HIGH/NO_RATE, TP_RENT_OFF, TP_NO_MARKET_RENT, TP_NO_KEY, TP_NO_DOCS, TP_UNKNOWN_TYPE) with deductibility flip at line 600-608.
- **Thresholds (§85A defaults):** master file 150M ILS, CbCR 3.4B ILS, loan band 3.5%-6.5%, services markup 5%, LVA 5%, TNMM 2-10%, doc response 60d.
- **FX:** date-keyed store (`USD-ILS-YYYY-MM-DD`), exact-then-latest-prior fallback, then inverse, then `IC_NO_FX` throw (lines 372-411).
- **Eliminations:** 9 account-pair mappings (4000/5000 Rev/COGS, 4100/6100 Mgmt, 4200/6200 Rent, 4300/6300 Int, 1500/1200 Loans, 4400/3100 Div, 4500/6500 Royalty, 4600/6600 Recharge, 3200/3000 Investment).
- **Year-end confirmation:** bilingual letters per pair with balance + reconciliation summary (lines 1262-1312).

**Tests:** `node --test test/payroll/ic-engine.test.js` — 26 pass / 0 fail in 1.16s. Matches the manifest in AG-X41 §8.

---

## 2. Consolidator (X-42) — YELLOW: 6 Test Failures

`onyx-procurement/src/consolidation/consolidator.js` implements IAS 21 translation, full/equity/cost methods, NCI, goodwill, 10 elimination types (`IC_AR_AP`, `IC_SALES_COGS`, `IC_UNREALIZED_PROFIT`, `IC_INVESTMENT_EQUITY`, `IC_INTEREST`, `IC_MGMT_FEE`, `FX_TRANSLATION`, `GOODWILL_RECOGNITION`, `FV_ADJUSTMENT`, `NCI_ALLOCATION`).

**Test result:** `node --test test/payroll/consolidator.test.js` — 18 pass / 6 fail / 4.24s.

Failing tests:
1. `consolidate — IC AR/AP fully offsets`
2. `consolidate — investment eliminated against sub equity, goodwill recognized`
3. `consolidate — NCI recognized at non-controlling share`
4. `consolidate — fair value uplifts reduce goodwill, add FV adjustment lines`
5. `consolidate — USD sub with FX translation produces CTA, balanced`
6. `consolidate — full-stack regression: FX + IC AR/AP + IC Sales + NCI + goodwill`

Common symptom: `verifyEquality(pack.consolidatedTB).balanced === false`. Sample delta from regression test: `debitCreditDelta: -1312.5, balanceSheetDelta: -1312.5` (NCI/goodwill plug not landing on the balanced side). Engine is a downstream consumer of X-41 — TB rebalance logic in `eliminateInvestmentAndComputeGoodwill` (lines 766+) is producing one-sided plugs.

---

## 3. Transfer Pricing (Y-010) — GREEN

`onyx-procurement/src/tax/transfer-pricing.js` covers OECD/IL tri-tier (Master File, Local File, CbCR XML v2.0), `computeArmLength` for all 5 OECD methods (CUP/RPM/Cost-Plus/TNMM/PSM), `checkThreshold` (€750M consolidated prior-year), `generateForm1385` (Israeli ITA declaration). Tests: 40/40 pass.

---

## 4. IC Loans (Y-085) — GREEN

`onyx-procurement/src/finance/ic-loans.js` adds loan-specific layer atop X-41: 5 rate types (fixed, floating, prime+X, libor+X, sofr+X), 7 statuses, ACT/365 + 30/360 + ACT/360 day-count, thin-cap check, WHT 25% with treaty relief, FX revaluation, arm's-length comparable yields memo, bilingual loan agreement template, consolidation-elimination mirror entries. Tests: 38/38 pass.

---

## 5. API Routes — ORANGE: SQL Injection

`api-server/src/routes/intercompany.ts` (309 LOC) exposes:

- `GET/POST/PUT/DELETE /intercompany/entities` (+ list, by-id)
- `GET/POST/PUT/DELETE /intercompany/transactions` (+ `/stats`)
- `GET/POST/PUT/DELETE /intercompany/settlements` (+ `/:id/process` posts settlement, marks linked tx settled)
- `GET/POST/PUT/DELETE /intercompany/pricing-rules`
- `GET /intercompany/eliminations` (pending tx)
- `POST /intercompany/eliminations/process` (bulk-flag eliminated)
- `GET /intercompany/consolidation-report?periodFrom=&periodTo=` (summary, byEntity, byType)

Tables auto-create on boot (`ensureTables()`): `intercompany_entities`, `intercompany_transactions`, `intercompany_settlements`, `transfer_pricing_rules`.

**Critical issue — SQL string concatenation throughout.** Every handler builds raw SQL via the `s()` and `n()` helpers (lines 23-24) and `q()` calls `db.execute(sql.raw(query))`. Quote-escaping in `s()` is a single `replace(/'/g, "''")` — no parameterization, no allowlist on column names, no validation on `transactionIds` array (line 275: `transactionIds.join(",")` injected raw into `IN (${ids})`), no validation on `periodFrom`/`periodTo` query params (lines 284-285: directly interpolated into date literals). Drizzle is imported but only used as a raw-SQL pipe. **High-severity SQLi exposure** — needs migration to parameterized `sql\`...\`` template tags.

The IC engine schema in this REST layer also **does not match the rich engine model** — TS layer has only 7 transaction types (`sale, purchase, service, loan, dividend, royalty, management_fee`), no §85A compliance fields, no auto-mirror, no FX translation, no transfer-pricing evaluation on insert. The Node engine (X-41) and the SQL routes are two parallel implementations.

---

## 6. UI — GREEN

`erp-app/src/pages/finance/intercompany.tsx` (450 LOC) — 5 tabs (entities, transactions, settlements, pricing, consolidation), RTL Hebrew, bilingual labels, CRUD modal, sortable tables, stats KPI cards (total / volume / pending settlement / pending elimination), search filter, settlement processor button. Lazy-loaded at `App.tsx:886`, route `/finance/intercompany` at `App.tsx:1600`. No 360-page contract for `Subsidiary360` per CLAUDE.md "9 Master 360 Pages" — IC entity page is functional CRUD only, missing the standard 360 layout (header+status, primary actions, related records, audit log, next recommended action).

---

## 7. Findings vs AG-X41 Reference

| AG-X41 promise                                                | Verified |
|---------------------------------------------------------------|----------|
| 11 transaction types with bilingual labels                    | YES |
| 5 entity types + circular-ownership rejection                 | YES (line 320) |
| §85A 10-issue-code TP evaluation                              | YES (lines 434-610) |
| Auto-mirror primary + counterparty                            | YES (lines 707-720) |
| Non-destructive reversals                                     | YES (lines 756-784) |
| Reconciliation 4 codes                                         | YES (lines 822-893) |
| Eliminations 9 account-pair mappings                          | YES (lines 970-1039) |
| FX rate fallback (exact -> prior -> inverse -> throw)         | YES |
| §85A thresholds + override                                     | YES |
| Year-end bilingual confirmation letters                        | YES |
| 26 unit tests pass                                            | YES (verified locally) |

---

## 8. Open Items / Recommendations

1. **Fix consolidator NCI/goodwill plug logic** — 6 failing tests in `test/payroll/consolidator.test.js`. Balance-sheet plug is dropping ~1,312.5 units in the regression scenario.
2. **Parameterize all SQL** in `api-server/src/routes/intercompany.ts` — replace `q()`+`s()`/`n()` helpers with Drizzle template tags or parameterized prepared statements. Currently SQLi-vulnerable on every endpoint.
3. **Bridge engine and DB layer** — the rich Node engine (X-41) and the SQL CRUD routes don't share a model. Either persist X-41 transactions into `intercompany_transactions` or wrap the route layer to delegate to the engine for §85A checks, mirror posting, FX, and elimination generation.
4. **Wire `transferPricingReport()` into the API** — currently no `/intercompany/transfer-pricing-report` endpoint surfaces the §85A obligation matrix.
5. **Wire `yearEndConfirmation()` to notifications** per AG-X41 §11 — auto-send 31 December.
6. **Bank of Israel FX cron** (`src/jobs/ic-fx-sync.js`) — still TBD per AG-X41 §11.
7. **Add Subsidiary360 page** per CLAUDE.md "No Dead Pages Rule" — current IC page is functional CRUD, not a 360.
8. **Reconcile UI tx types with engine enum** — UI lists 7, engine has 11 (rent, cost_sharing, capital_injection, reimbursement, loan_principal/interest split missing).

---

## 9. Files Audited (absolute paths)

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\intercompany\ic-engine.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\consolidation\consolidator.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\tax\transfer-pricing.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\finance\ic-loans.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\test\payroll\ic-engine.test.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\test\payroll\consolidator.test.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\test\tax\transfer-pricing.test.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\test\finance\ic-loans.test.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\intercompany.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\finance\intercompany.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_qa-reports\AG-X41-intercompany.md` (reference)

— Agent **185**, ERP 2026 audit pass.
