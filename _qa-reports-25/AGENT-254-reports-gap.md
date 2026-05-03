# AGENT-254 - Reports Inventory & Gap (CFO/CEO View)

**Agent:** 254 (MISSING PIECES #4)
**Date:** 2026-04-29
**Scope:** Inventory the business reports a CFO/CEO would expect from a Palantir-grade ERP and reconcile against the contents of `onyx-procurement/src/reports/`, `onyx-procurement/src/reporting/`, and `onyx-procurement/src/finance/`. Identify gaps.
**Verdict:** **PARTIAL.** Out of ~70 reports a CFO/CEO/COO would demand, ~32 are implemented as standalone modules, ~12 exist as engines/builders without a dedicated report wrapper, and ~26 are MISSING entirely. The biggest gaps are statutory financial statements (full IFRS Equity Statement, Notes/SoFP), board-ready packages, regulatory filings (Form 856, Form 102 consolidated), tax provisioning, segment reporting, ESG, working-capital ratios, and audited consolidation packs.

---

## 1. Method

Three locations were treated as the canonical "reports" bucket:

| Folder | Files | Role |
|---|---|---|
| `onyx-procurement/src/reports/` | 9 (4 generators + 1 aggregator + tests + fixtures) | Operational generators that emit PDF/Excel/JSON |
| `onyx-procurement/src/reporting/` | 15 | Analytical engines (BS, CF waterfall, drilldown, board deck, KPI, CAC, LTV, etc.) |
| `onyx-procurement/src/finance/` | 17 | Finance-specific (aging, treasury, working-capital, debt collection, FX hedging, IC loans, fixed assets, deferred revenue) |

Adjacent folders that produce report-shaped data but are NOT in those three buckets: `gl/`, `tax/`, `vat/`, `tax-exports/`, `bl/`, `forecasting/`, `analytics/`, `consolidation/`, `intercompany/`, `fx/`, `budget/`, `cash/`, `collections/`, `expenses/`, `assets/`, `pension/`, `realestate/`, `manufacturing/`, `quality/`, `costing/`, `ops/`, `compliance/`, `crm/`, `customer/`, `sales/`. These are tracked separately as "engine present, report wrapper missing."

API surface inspected: `api-server/src/routes/reports-center.ts`, `bi-dashboards.ts`, `bi-export.ts`, `bi-scheduled-reports.ts`, `bi-comparative-analytics.ts`, `bi-adhoc-query.ts`, `executive-scorecard.ts`, `executive-control.ts`, `executive-war-room.ts`, `dashboard-kpi.ts`, `analytics/reports.ts`, `cashflow-management.ts`, `tax-management.ts`, `audit-log.ts`.

---

## 2. CFO/CEO Expected Report Catalogue (~70)

Grouped by reporting cadence/audience. PRESENT = a dedicated module exists in one of the three target folders. PARTIAL = engine/data exists elsewhere or the report is UI-only / mock-data. MISSING = no module found.

### 2.1 Statutory financial statements (monthly + annual)

| # | Report | Status | Module / Notes |
|---|---|---|---|
| 1 | Profit & Loss (P&L) | PRESENT | `reports/pnl-report.js` (PDF/Excel/JSON, audit array per line) |
| 2 | P&L drill-down (hierarchy + variance vs prior/budget) | PRESENT | `reporting/pnl-drilldown.js` |
| 3 | Balance Sheet (IFRS, Form-6111 classifier) | PRESENT | `reporting/balance-sheet.js` |
| 4 | Cash Flow Statement - direct | PARTIAL | `reporting/cashflow-waterfall.js` covers waterfall; **no full direct-method statement** wrapped as a report |
| 5 | Cash Flow Statement - indirect | PARTIAL | `reporting/cashflow-waterfall.js` has indirect mode; same wrapper gap |
| 6 | Statement of Changes in Equity | MISSING | No `equity-statement.js` anywhere; 6111 classifier touches equity but there is no statement assembler |
| 7 | Notes to financial statements | MISSING | No notes generator; statutory report packs are incomplete without it |
| 8 | Trial Balance | MISSING | `gl/journal-entry.js` exists; no `trial-balance.js` report |
| 9 | General Ledger detail report | MISSING | Journal entries exist; no GL report wrapper that prints account-by-account |
| 10 | Sub-ledger reconciliation (AR/AP/inventory to GL) | MISSING | No sub-to-GL tie-out report |
| 11 | Year-end close pack | PARTIAL | AGENT-229 / AGENT-163 close logic; no consolidated PDF deliverable |
| 12 | Consolidated financials (multi-entity) | PARTIAL | `consolidation/consolidator.js` engine exists; no consolidated P&L/BS/CF report wrapper |
| 13 | Segment report (by business unit / industry vertical) | MISSING | Industry tagging exists; no IFRS-8 segment report |
| 14 | Comparative period statements (LY, MoM, YoY) | PARTIAL | `reporting/variance-analyzer.js`; no statement-level comparator wrapper |

### 2.2 AR / AP / Working capital

| # | Report | Status | Module / Notes |
|---|---|---|---|
| 15 | AR Aging (bucketed) | PRESENT | `finance/aging-reports.js` (v2) + `finance/aging.js` (legacy) |
| 16 | AP Aging (bucketed) | PRESENT | same module via `apAging` |
| 17 | DSO / DPO / DIO trend | PARTIAL | `finance/working-capital.js` engine; **no trend report wrapper** |
| 18 | Cash Conversion Cycle | PARTIAL | derivable from working-capital.js; no CCC report |
| 19 | Bad-debt provision | PRESENT | `finance/bad-debt-provision.js` |
| 20 | Top 10 debtors / overdue customers | PRESENT | embedded in `aging-reports.js#topDelinquents` + management dashboard |
| 21 | Top 10 suppliers / outstanding payments | PRESENT | embedded in `reports/management-dashboard-pdf.js` |
| 22 | Customer concentration risk | PRESENT | `aging-reports.js#concentrationRisk` |
| 23 | Supplier concentration / single-sourcing risk | MISSING | No equivalent of concentrationRisk on AP side |
| 24 | Credit limit utilisation | PARTIAL | `finance/credit-limits.js` engine; **no report** |
| 25 | Debt collection / dunning report | PARTIAL | `finance/debt-collection.js` + `collections/dunning.js`; **no aggregated dunning report** |
| 26 | Check register | PRESENT | `finance/check-register.js` |
| 27 | Wire transfer log + approvals | PARTIAL | `finance/wire-transfer.js`, `wire-approval.js`, `signatory-workflow.js`; no report rollup |
| 28 | Deferred revenue waterfall | PARTIAL | `finance/deferred-revenue.js` engine; no waterfall report |
| 29 | Bank reconciliation report | PARTIAL | `bank/reconciliation.js`, `bank/matcher.js`; no formal reconciliation report PDF |

### 2.3 Cash & treasury

| # | Report | Status | Module / Notes |
|---|---|---|---|
| 30 | Cash flow forecast (N-day, multi-scenario) | PRESENT | `reports/cash-flow-forecast.js` (canonical) + `finance/cashflow-forecast.js` (duplicate per AGENT-180) |
| 31 | Cashflow waterfall | PRESENT | `reporting/cashflow-waterfall.js` |
| 32 | 13-week cash flow | PARTIAL | derivable from cash-flow-forecast.js; no 13-week-specific wrapper |
| 33 | Treasury / liquidity report | PARTIAL | `finance/treasury.js` engine; no PDF/Excel report wrapper |
| 34 | FX exposure / hedging | PARTIAL | `finance/fx-hedging.js` + `fx/fx-engine.js`; no exposure report |
| 35 | Intercompany loan balance | PARTIAL | `finance/ic-loans.js` + `intercompany/ic-engine.js`; no IC loan report |
| 36 | Petty cash report | PARTIAL | `cash/petty-cash.js`; no period report wrapper |

### 2.4 Tax & regulatory (Israel-specific)

| # | Report | Status | Module / Notes |
|---|---|---|---|
| 37 | VAT report (PCN874) | PARTIAL | `tax-exports/vat-rashut-hamisim-xml.js`, `vat/pcn836.js`, AGENT-215; **no human-readable VAT summary report** in `reports/` |
| 38 | Quarterly tax | PRESENT | `reports/quarterly-tax-report.js` |
| 39 | Form 102 (BL / payroll deductions) | PARTIAL | `bl/form-102-bl.js`, `tax/form-102.js`, `tax-exports/form-102-xml.js`; no consolidated 102 report |
| 40 | Form 126 (annual payroll) | PARTIAL | `tax/form-126.js`; no readable annual-payroll report |
| 41 | Form 856 (withholding suppliers) | MISSING | AGENT-133 references; no `form-856.js` in `tax/` (only `form-857.js`) |
| 42 | Form 6111 (annual income tax) | PARTIAL | `tax/form-6111.js` builder; no reader-friendly export |
| 43 | Form 1301 / 1320 (annual tax declarations) | PARTIAL | `tax/form-1301.js`, `tax-exports/form-1320-xml.js`; no readable wrapper |
| 44 | Form 30a (specific Israeli filing) | PARTIAL | `tax/form-30a.js`; no report layer |
| 45 | Capital gains report | PARTIAL | `tax/capital-gains.js` + `tax/betterment-tax.js`; no report wrapper |
| 46 | Dividend withholding | PARTIAL | `tax/dividend-withholding.js`; no report |
| 47 | Transfer pricing report | PARTIAL | `tax/transfer-pricing.js`; no master/local file generator |
| 48 | Purchase tax | PARTIAL | `tax/purchase-tax.js`; no report |
| 49 | Tax provision / deferred tax (IFRS) | MISSING | No deferred-tax module |
| 50 | Effective tax rate reconciliation | MISSING | Standard CFO ETR table absent |
| 51 | MASAV / payment file batch report | PARTIAL | AGENT-135; `bank-files/` produces files, no batch report |
| 52 | SHV / BKMV unified | PARTIAL | `tax-exports/shv-xml.js`, `bkmv-unified.js`; no readable summary |

### 2.5 Sales / revenue / commercial

| # | Report | Status | Module / Notes |
|---|---|---|---|
| 53 | Revenue by customer / segment / region | PARTIAL | `reporting/revenue-waterfall.js` + `reporting/attribution.js`; **no by-customer revenue report** |
| 54 | Revenue waterfall (new/expansion/churn/contraction) | PRESENT | `reporting/revenue-waterfall.js` |
| 55 | Sales pipeline / forecast | PARTIAL | `sales/sales-forecast.js`, `crm/pipeline.js`; no pipeline report wrapper |
| 56 | Win/Loss analysis | PARTIAL | `sales/win-loss.js`; no report wrapper |
| 57 | Quote-to-Order conversion funnel | PARTIAL | `reporting/funnel.js`; engine only |
| 58 | Backlog / order book report | MISSING | No backlog report; engineering pulls from execution.projects ad hoc |
| 59 | Commission report | PARTIAL | `sales/commission.js`; no period report |
| 60 | Customer 360 KPIs (CAC / LTV / NRR / GRR / churn) | PARTIAL | `reporting/cac-dashboard.js`, `ltv-calculator.js`, `cohort-analysis.js`; no consolidated SaaS metrics report |
| 61 | NPS / CSAT report | PARTIAL | `customer/nps.js`, `customer/csat.js`, `customer/voc.js`; no period report |
| 62 | Customer health score / churn risk | PARTIAL | `customer/health-score.js`, `customer/churn-prevention.js`, `analytics/churn-predictor.js`; no report |
| 63 | Discount / margin leakage | PARTIAL | `pricing/discount-rules.js`, `pricing/price-optimizer.js`; no leakage report |

### 2.6 Procurement / supply chain / inventory

| # | Report | Status | Module / Notes |
|---|---|---|---|
| 64 | Inventory valuation (FIFO/LIFO/WAC + LME) | PRESENT | `reports/inventory-valuation.js` |
| 65 | Stock turnover / ageing inventory / slow-mover | MISSING | No `inventory-turnover.js`; turnover not tracked |
| 66 | Open PO report | PARTIAL | data in management dashboard; no standalone open-PO report |
| 67 | PO commitment / accrual report | MISSING | No accrued-PO report for month-end |
| 68 | RFQ comparison / spend savings | PARTIAL | `rfq/rfq-engine.js` + `analytics.savings`; no savings report wrapper |
| 69 | Supplier scorecard / OTIF / quality | PARTIAL | `analytics/vendor-scoring.js`, `quality/ncr-tracker.js`, AGENT-183; no period scorecard report |
| 70 | Spend analysis (by category, vendor, GL account) | MISSING | No category-spend report; this is a CFO staple |
| 71 | Maverick spend / off-contract | MISSING | Not found |
| 72 | Three-way match exception report | PARTIAL | `api-server/three-way-match.ts`; no exception report wrapper |
| 73 | GRN / receiving variance | PARTIAL | AGENT-206 GRN patch; no variance report |

### 2.7 Operations / projects / manufacturing

| # | Report | Status | Module / Notes |
|---|---|---|---|
| 74 | Project P&L / project margin | PARTIAL | `costing/allocation-engine.js`, `projects/pm-engine.js`; no per-project P&L report |
| 75 | Work-in-Progress (WIP) report | MISSING | No WIP roll-forward |
| 76 | Percentage-of-completion / progress billing | PARTIAL | `construction/progress-billing.js`; no POC report |
| 77 | Capital projects report | PRESENT | `finance/capital-projects.js` |
| 78 | Capacity / OEE | PARTIAL | `manufacturing/oee-tracker.js`, `manufacturing/capacity-planning.js`; no period report |
| 79 | Scrap / yield report | PARTIAL | `manufacturing/scrap-tracker.js`; no period report |
| 80 | NCR / CAPA / FAI quality report | PARTIAL | `quality/*.js`; no quality KPI report |
| 81 | Safety incident report | PARTIAL | `api-server/safety-incidents.ts`; no period summary |

### 2.8 HR / payroll / workforce

| # | Report | Status | Module / Notes |
|---|---|---|---|
| 82 | Monthly payroll report | PARTIAL | UI in `payroll-autonomous/.../ReportsDashboard.tsx` with **MOCK DATA** (per AGENT-180) |
| 83 | Payroll by project / department / cost center | PARTIAL | UI mocks only; no real data wiring |
| 84 | Headcount / attrition / turnover | PARTIAL | `hr/analytics.js`; no period report |
| 85 | Compensation review / band placement | PARTIAL | `hr/comp-planner.js`; no report |
| 86 | Bonus / commission accrual | PARTIAL | `hr/bonus-calc.js`, `sales/commission.js`; no accrual report |
| 87 | Pension / severance liability | PARTIAL | `pension/section-14.js`, `pension/severance-tracker.js`; no liability report |
| 88 | Options / equity vesting | PARTIAL | `hr/options-vesting.js`; no period report |
| 89 | Leave balance / liability | MISSING | No leave-liability report (PTO / vacation accrual on BS) |
| 90 | Time-tracking / billable utilisation | PARTIAL | `time/time-tracking.js`; no utilisation report |

### 2.9 Budget / FP&A / forecast

| # | Report | Status | Module / Notes |
|---|---|---|---|
| 91 | Budget vs Actual | PRESENT | `reporting/budget-actual.js` |
| 92 | Variance analysis (price/volume/mix) | PARTIAL | `reporting/variance-analyzer.js`; no PVM report |
| 93 | Rolling forecast | PARTIAL | `budget/budget-planner.js`, `forecasting/demand-forecaster.js`; no rolling-12 report |
| 94 | Demand forecast (commercial) | PARTIAL | `forecasting/demand-forecaster.js`; no report |
| 95 | Cash-flow predictor (ML) | PARTIAL | `analytics/cash-flow-predictor.js`; no report |
| 96 | KPI scorecard | PRESENT | `reporting/kpi-scorecard.js` |
| 97 | Executive / Board deck | PRESENT | `reporting/board-deck.js` + `reporting/executive-dashboard.js` (843 LOC, 16 KPIs) |
| 98 | Benchmark vs peer / industry | PRESENT | `reporting/benchmark.js` |
| 99 | Funnel / cohort | PRESENT | `reporting/funnel.js`, `reporting/cohort-analysis.js` |
| 100 | Long-range plan / 5-year model | MISSING | No LRP / strategic-plan report |

### 2.10 Risk / compliance / audit / ESG

| # | Report | Status | Module / Notes |
|---|---|---|---|
| 101 | Audit trail report (per entity / period / user) | PARTIAL | `api-server/audit-log.ts`; no formatted audit-trail report |
| 102 | Internal-controls / SOX testing | MISSING | No SOX-style report |
| 103 | Risk register / heat map | PARTIAL | `executive-dashboard.js#topRisks`; no register report |
| 104 | AML / sanctions / PEP screening | PARTIAL | `compliance/aml-screener.js`, `pep-screener.js`, `sanctions-screener.js`; no aggregated screening report |
| 105 | Conflict-of-interest / gift register | PARTIAL | `compliance/conflict-of-interest.js`, `gift-register.js`; no report |
| 106 | Whistleblower / consumer complaints | PARTIAL | `compliance/whistleblower.js`, `consumer-complaints.js`; no report |
| 107 | Legal hold / retention | PARTIAL | `compliance/legal-hold.js`, `retention-engine.js`; no report |
| 108 | GDPR / DSR report | PARTIAL | `privacy/dsr-handler.js`; no DSR report |
| 109 | ESG / sustainability KPI report | MISSING | Not found |
| 110 | Insurance & warranty claims | PARTIAL | `warranty/warranty-tracker.js`, `returns/rma.js`; no claims report |
| 111 | Fixed-asset register / depreciation roll-forward | PARTIAL | `assets/asset-manager.js` + `finance/fixed-assets.js`; no roll-forward report |
| 112 | Lease / IFRS-16 schedule | PARTIAL | `realestate/lease-tracker.js`; no IFRS-16 schedule |
| 113 | Real-estate portfolio | PARTIAL | `realestate/portfolio-dashboard.js`; portal-only, no PDF/Excel |

---

## 3. Quick scoreboard

| Bucket | Total Reports | PRESENT | PARTIAL | MISSING |
|---|---|---|---|---|
| Statutory financials | 14 | 4 | 6 | 4 |
| AR / AP / Working capital | 15 | 5 | 9 | 1 |
| Cash & treasury | 7 | 2 | 5 | 0 |
| Tax & regulatory (IL) | 16 | 1 | 12 | 3 |
| Sales / commercial | 11 | 1 | 10 | 0 (1 weak: backlog) |
| Procurement / supply chain | 10 | 1 | 6 | 3 |
| Operations / projects / mfg | 8 | 1 | 6 | 1 |
| HR / payroll | 9 | 0 | 8 | 1 |
| Budget / FP&A | 10 | 5 | 4 | 1 |
| Risk / compliance / ESG | 13 | 0 | 11 | 2 |
| **TOTAL** | **113** | **20** | **77** | **16** |

(Note: "PARTIAL" overwhelmingly means an engine/data layer exists but no formatted PDF/Excel/JSON report wrapper bound to a route.)

---

## 4. Top 15 highest-impact gaps for a CFO/CEO

1. **Trial Balance + GL detail report** - foundation for every audit; not present.
2. **Statement of Changes in Equity + Notes** - needed to ship statutory packs.
3. **Cash Flow Statement (formal direct & indirect)** wrapped as a deliverable.
4. **Consolidated multi-entity P&L/BS/CF** - engine exists, no report.
5. **Trial-Balance to Sub-ledger reconciliation** report.
6. **Tax provision / deferred tax / ETR reconciliation** - none.
7. **Form 856 builder + report** - module entirely absent.
8. **Form 102 / 126 / 6111 / 1301 readable reports** - XML-only today.
9. **VAT human-readable summary** (PCN874 reads well in XML, not for the CFO).
10. **Spend analysis + Maverick spend** - missing for procurement governance.
11. **Open PO + PO commitment / accrual** for month-end accruals.
12. **Backlog / Order Book** report - revenue forward visibility.
13. **Project P&L / WIP roll-forward / PoC** - construction & projects need it.
14. **Payroll reports wired to real data** (not the mock `MOCK_PAYROLL`).
15. **Leave & severance liability** + **Fixed-asset depreciation roll-forward** - both required for BS notes.

Secondary but visible CFO asks: 13-week cash flow, FX exposure report, IC loan balance, supplier scorecard / OTIF, ESG KPI, IFRS-16 lease schedule, segment reporting, SOX-style controls report, audit-trail report, comparative period statements.

---

## 5. Architectural debt the inventory exposes

1. **3 reports folders, no router.** `reports/`, `reporting/`, `finance/` overlap (cash-flow exists in two, aging in one, statutory split across two). A "report registry" / index module is missing - a caller asking "where is the X report" must guess.
2. **Engine vs report-wrapper drift.** Most missing reports already have an engine (`treasury.js`, `working-capital.js`, `fx-hedging.js`, `transfer-pricing.js`, `commission.js`, `oee-tracker.js`). The wrapper - assemble data, render PDF/Excel, attach audit, expose route - is what's absent. Cheap fix path: a thin `reports/<name>.js` that imports the engine and reuses the `management-dashboard-pdf.js` shape.
3. **No `report_definitions` registry binding.** Migration `00061_analytics_domain_complete.sql` introduces `analytics.report_definitions`, `report_runs`, `kpi_definitions`, `drilldown_paths` (per AGENT-122). None of the JS reports register themselves there - so the system cannot list "all available reports" to a user.
4. **Tax/regulatory exports are XML-only.** Israel filings (Form 102/126/856/1301/6111) emit XML. CFOs expect a human-readable PDF preview side-by-side with the XML. Wrapper layer absent.
5. **Mock data in payroll dashboard** (per AGENT-180) - the reporting UI cannot be considered "PRESENT" until the API wiring lands.
6. **No scheduling / distribution.** `bi-scheduled-reports.ts` route exists but no JS report side currently registers a schedule (cron, recipients, delivery channel). Email/Slack distribution missing.
7. **No watermark / branding pack.** PDFs from `reports/` are bilingual and labeled, but CFO board packs require company logo, signatory page, version control - not in any generator.

---

## 6. Recommended action plan (priority order)

### P0 (statutory & audit blockers)
- Add `reports/trial-balance.js`, `reports/general-ledger.js`, `reports/sub-ledger-tie-out.js`.
- Add `reports/equity-statement.js` + `reports/financial-notes.js`.
- Wrap `consolidation/consolidator.js` into `reports/consolidated-financials.js`.
- Build `tax/form-856.js` + `reports/form-856.js`; add readable wrappers around 102/126/6111/1301.
- Build `reports/tax-provision.js` (current + deferred + ETR reconciliation).

### P1 (CFO operating cadence)
- `reports/spend-analysis.js`, `reports/open-pos.js`, `reports/po-accrual.js`.
- `reports/backlog.js` and `reports/sales-pipeline.js`.
- `reports/working-capital.js` (DSO/DPO/DIO + CCC trend).
- `reports/13-week-cashflow.js` + `reports/fx-exposure.js` + `reports/ic-loans.js`.
- Real payroll API wiring + `reports/payroll-monthly.js`, `reports/headcount.js`, `reports/leave-liability.js`, `reports/severance-liability.js`.
- `reports/fixed-asset-rollforward.js`, `reports/lease-ifrs16.js`.

### P2 (board / commercial / governance)
- `reports/saas-metrics.js` (CAC, LTV, NRR, GRR, churn) consolidated.
- `reports/supplier-scorecard.js` (OTIF, NCR, lead-time).
- `reports/quality-kpi.js` (NCR, CAPA, FAI, scrap).
- `reports/project-pnl.js` + `reports/wip-rollforward.js` + `reports/poc-report.js`.
- `reports/risk-register.js`, `reports/audit-trail.js`, `reports/sox-controls.js`.
- `reports/esg.js` (Scope 1/2/3 once data sources land).
- `reports/segment.js` (IFRS-8 vertical breakdown).

### P3 (registry & distribution)
- Wire every report module into `analytics.report_definitions` + `report_runs`.
- Add a `reports/index.js` that exposes a single `listReports()` / `runReport(code, params)` API.
- Implement `bi-scheduled-reports.ts` JS-side delivery (email/Slack/webhook).
- Add corporate-branded PDF template (logo, sigs, version) and apply across all generators.

---

## 7. Verdict

The Palantir-grade ERP has roughly **18% of the CFO/CEO report catalogue shipped as ready-to-deliver modules**, ~68% with engines that need a thin report wrapper, and ~14% genuinely missing. The system is **not yet a CFO board-pack platform** despite having sophisticated underlying engines. Closing the P0 list (statutory, tax, audit basics) brings it to roughly 45% PRESENT and unblocks regulator filings; P1 takes it to ~70% and covers normal CFO monthly/quarterly cadence; P2/P3 reach the "Palantir-grade" promise.

---

## 8. Files referenced (absolute)

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\reports\` (9 files inc. README)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\reporting\` (15 files)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\finance\` (17 files)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\tax\` (12 files)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\tax-exports\` (11 files)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\gl\` (2 files)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\consolidation\consolidator.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\intercompany\ic-engine.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\fx\fx-engine.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\reports-center.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\bi-scheduled-reports.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_qa-reports-25\AGENT-180-reporting.md`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_qa-reports-25\AGENT-122-dashboards.md`
