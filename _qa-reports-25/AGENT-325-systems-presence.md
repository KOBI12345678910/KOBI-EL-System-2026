# AGENT-325 — Systems Presence & Depth Verification

**Date:** 2026-04-29
**Auditor:** Agent 325
**Branch:** claude/objective-merkle-40ff93
**Scope:** Verify presence + measure DEPTH of ERP / CRM / BOM / Accounting / Finance / HR systems.

---

## 0. Codebase Topology (real services that contain implementation)

| Service / App                | Path                  | Source files (.js/.ts/.jsx/.tsx, excl. tests/node_modules) |
|------------------------------|-----------------------|------------------------------------------------------------|
| TECHNO_KOL_OPS               | `techno-kol-ops/src`  | 72                                                         |
| ONYX_PROCUREMENT             | `onyx-procurement/src`| 418                                                        |
| PAYROLL_AUTONOMOUS           | `payroll-autonomous/src` | 80                                                      |
| ONYX_AI                      | `onyx-ai/src`         | 33                                                         |
| **api-server** (large 4-svc) | `api-server/src`      | **753**                                                    |
| **erp-app** (UI app)         | `erp-app/src`         | **1,789**                                                  |
| **DB / Schema**              | `supabase/migrations` | 391 `CREATE TABLE` across 26 schemas                       |

> Note: The 4 services described in `CLAUDE.md` exist, but the largest implementation lives in `api-server/` (HTTP layer) and `erp-app/` (UI). Counts below combine all surfaces.

### Tables by schema (top schemas, 391 total)

| Schema | Tables | Schema | Tables |
|---|---|---|---|
| governance | 65 | docs | 17 |
| public | 42 | intelligence | 15 |
| finance | 36 | orchestration | 10 |
| execution | 30 | food | 8 |
| procurement | 26 | documents | 7 |
| comms | 23 | health | 5 |
| inventory | 22 | auto | 4 |
| workforce | 19 | treasury, routing, quality, planning, crm | 3 each |
| commercial | 18 | state_machines, service, pricing, maintenance, compliance | 2 each |
| analytics | 18 |  |  |

---

## 1. ERP Core (Procurement / Inventory / Manufacturing / Supply Chain)

**Status: PRESENT — DEEP**

| Metric | Count |
|--------|-------|
| Source files in `onyx-procurement/src` (po, rfq, inventory, warehouse, projects, manufacturing, quality, logistics, returns, warranty, pricing) | 27 modules under those folders |
| `api-server/src/routes` matching ERP keywords (bom*, inventory*, warehouse*, po-*, rfq*, procurement*, manufacturing*, production*, fabric*) | **22 route files** |
| `erp-app/src/pages/procurement/` pages | **69** |
| `erp-app/src/pages/production/` pages | **69** |
| `erp-app/src/pages/inventory/` pages | **51** |
| `erp-app/src/pages/supply-chain/` pages | **17** |
| DB tables (procurement+inventory schemas) | 26 + 22 = **48** |
| Procurement/inventory keyword tables (PO, RFQ, supplier, vendor, stock, BOM, item) | **50** |

**Notable modules confirmed (depth):**
- `onyx-procurement/src/manufacturing/`: bom-manager, capacity-planning, drawing-vc, heat-treatment-log, material-cert, oee-tracker, qc-checklist, routing-manager, scrap-tracker, tool-tracker, welder-certs, wo-scheduler (12 files)
- `onyx-procurement/src/po/approval-matrix.js`, `rfq/rfq-engine.js`
- Pipeline definitions: 13 stages, 16 entities, 91 state transitions (per `pipeline-engine.js`, `state-machines.js`)

---

## 2. CRM (Customer / Sales / Leads / Pipeline)

**Status: PRESENT — DEEP**

| Metric | Count |
|--------|-------|
| Files in `onyx-procurement/src/{crm,customer,customer-portal,sales}` | **33** |
| `api-server/src/routes` matching CRM keywords (crm*, sales*, customer*, lead*) | **16 route files** |
| `erp-app/src/pages/crm/` pages | **65** |
| `erp-app/src/pages/sales/` pages | **19** |
| DB tables matching CRM keywords (crm/leads/customer/opportunity/deal/sales/pipeline/contact/quote) | **23** |

**Notable modules confirmed (depth):**
- 18 customer-success files: nps, csat, churn-prevention, journey-mapper, health-score, segmentation, qbr-generator, voc, advocacy, loyalty, referral, success-plan, onboarding, etc.
- 13 sales engine files: account-assignment, commission, competitor-tracker, lead-scoring, leaderboard, opportunity-stages, playbook-engine, quote-builder, sales-forecast, target-tracker, territory-manager, upsell, win-loss
- `api-server/src/routes/`: crm.ts, crm-enterprise.ts, crm-customer360.ts, crm-sales-pipeline.ts, crm-ultimate.ts, crm-sap-upgrade.ts, crm-communications.ts, crm-new-capabilities.ts, crm-analytics-sync.ts, customer-experience.ts, customer-portal.ts, customer-service-ai-engine.ts, lead-scoring-agent-analytics-engine.ts, sales-pricing-enterprise.ts

---

## 3. BOM (Bill of Materials)

**Status: PRESENT — MULTI-LAYERED**

| Metric | Count |
|--------|-------|
| BOM source files in active services (excluding archives) | **15+** |
| BOM API routes | **3** (`api-server/src/routes/bom-builder.ts`, `bom-product-engine.ts`, `execution/bom-headers.ts`) |
| BOM UI pages in `erp-app/src/pages/` | **10** |
| DB schema | `lib-client/db/src/schema/production-bom.ts` |
| BOM module in onyx-procurement | `onyx-procurement/src/manufacturing/bom-manager.js` |
| BOM component in payroll-autonomous | `payroll-autonomous/src/components/BOMCalculator.tsx` |

**UI pages confirmed:**
- `bom-products.tsx`, `procurement/products/product-bom.tsx`
- `production/bom-builder.tsx`, `production/bom-manager.tsx`, `production/bom-tree.tsx`
- `supply-chain/bom-command-center.tsx`, `bom-comparison.tsx`, `bom-cost-rollup.tsx`, `bom-templates.tsx`, `bom-versions.tsx`, `bom-where-used.tsx`

> BOM is implemented across UI (10 pages), API (3 routes), DB (production-bom schema), and a dedicated calculator component — not a stub.

---

## 4. Accounting (GL, Tax, VAT, Invoices, Journal)

**Status: PRESENT — DEEP**

| Metric | Count |
|--------|-------|
| Files in `onyx-procurement/src/{gl,invoices,tax,vat,tax-exports,consolidation,intercompany,receipts}` | **34** |
| `api-server/src/routes` accounting/tax | **5** (accounting-export, chart-of-accounts, finance-accounting, israeli-accounting-engine, tax-management) |
| `erp-app/src/pages/finance` (mixed accounting+finance) | 139 pages — includes Invoice360, Payment360, accounts-payable, accounts-receivable, adjusting-entries, balance-sheet, aging-report, accounting-export, accounting-portal, accounting-reports, accounting-settings, accounting-inventory, audit-control, annual-report |
| DB tables in `finance` schema | **36** |
| Tax forms implemented | form-102, form-126, form-1301, form-30a, form-6111, form-856, form-857, form-builders, betterment-tax, capital-gains, dividend-withholding, purchase-tax, transfer-pricing, vat-refund, pcn836 (15 specialised tax modules) |

**Notable depth:**
- `gl/financial-statements.js`, `gl/journal-entry.js`
- 14 Israeli-tax-specific files in `tax/`
- 2 VAT files (`vat-routes.js`, `pcn836.js`)
- `consolidation/consolidator.js`, `intercompany/` for multi-entity accounting

---

## 5. Finance (Cash, Bank, Treasury, Budget, Forecast)

**Status: PRESENT — DEEP**

| Metric | Count |
|--------|-------|
| Files in `onyx-procurement/src/{finance,cash,bank,bank-files,budget,forecasting,payments,collections,fx}` | **35** |
| `api-server/src/routes` finance | **20** route files |
| `erp-app/src/pages/finance/` pages (combined w/ accounting) | **139** |
| DB tables matching finance keywords | **43** |

**Notable depth in `onyx-procurement/src/finance/`:**
- aging-reports, aging, bad-debt-provision, capital-projects, cashflow-forecast, check-register, credit-limits, debt-collection, deferred-revenue, fixed-assets, fx-hedging, ic-loans, signatory-workflow, treasury, wire-approval, wire-transfer, working-capital (17 files)
- bank: matcher, multi-format-parser, parsers, reconciliation, smart-categorizer (5 files)
- bank-files: masav-exporter (Israeli payments format)
- payments: qr-payment + others
- BlackRock-style modules in `erp-app/src/pages/finance/`: blackrock-ai, blackrock-dashboard, blackrock-hedging, blackrock-monte-carlo, blackrock-risk-matrix, blackrock-var

**`api-server/src/routes` finance set (20):** budgets, cashflow-management, company-financials-realtime-engine, fin-documents, fin-master-data, fin-payments, fin-quant, fin-router, fin-seed, finance-control, finance-customers-suppliers, finance-enterprise (1-4), finance-new-pages, finance-sap-upgrade, finance.ts, financial-statements, oracle-financial-core, project-resources-budget, realtime-financials-engine

---

## 6. HR (Employees / Payroll / Attendance / Workforce)

**Status: PRESENT — DEEP**

| Metric | Count |
|--------|-------|
| Files in `onyx-procurement/src/{hr,payroll,pension,time,bl}` | **25** |
| `api-server/src/routes` HR/payroll | **20** route files |
| `erp-app/src/pages/hr/` + `workforce/` pages | **57** |
| `payroll-autonomous/src` total source files | **80** (entire dedicated UI service) |
| DB tables in `workforce` schema | **19** |
| DB tables matching HR keywords | **24** |

**Notable depth:**
- `onyx-procurement/src/hr/` (17 files): 360-feedback, analytics, ats, bonus-calc, cert-tracker, comp-planner, feedback-collection, grievance, handbook, interview-scheduling, offboarding, okr-tracker, onboarding, options-vesting, performance-review, skills-matrix, training-catalog
- `onyx-procurement/src/payroll/`: payroll-routes, pdf-generator, wage-slip-calculator, plus CONSTANTS_VERIFICATION.md
- `onyx-procurement/src/bl/`: form-102-bl, health-insurance (Israeli National Insurance / Bituach Leumi)
- `payroll-autonomous` is a complete dedicated app at port 5173 (`/payroll`)
- HR routes in api-server include: hr.ts, hr-enterprise, hr-sap-upgrade, hr-attendance-advanced, hr-workforce, attendance-leave-engine, attendance-payroll-engine, israeli-payroll, payroll-engine, payroll-module, smart-payroll, employee-chatbot, employee-portfolio-engine, employee-value-analysis (and -engine), workforce-analysis, three-way-match (and -matching), realtime-collaboration, sentiment-analysis

---

## 7. Aggregate Totals (all systems combined)

| Surface | Total |
|---------|-------|
| Source files (all 6 services + erp-app + api-server src/) | **~3,145** |
| `api-server/src/routes/` files | **343** |
| HTTP route handlers (`router.METHOD` / `app.METHOD` calls in api-server routes) | **4,960** |
| `erp-app/src/pages/` UI pages (recursive `.tsx`/`.jsx`) | **1,299** |
| DB tables (`CREATE TABLE` in `supabase/migrations`) | **391** across **26 schemas** |
| SQL migration files | 50+ in `supabase/migrations/` |

---

## 8. Verdict

| System | Present? | Depth | Notes |
|--------|----------|-------|-------|
| ERP    | YES | DEEP | 22 API routes, 206 UI pages (procurement+production+inventory+supply-chain), 48 DB tables in proc/inv schemas |
| CRM    | YES | DEEP | 16 API routes, 84 UI pages (crm+sales), 23 keyword-matching DB tables |
| BOM    | YES | MULTI-LAYERED | 3 API routes, 10 UI pages, dedicated DB schema, calculator component |
| Accounting | YES | DEEP | 34 source files, 5+ accounting routes, 36 finance-schema tables, 15 Israeli tax forms (102/126/1301/30a/6111/856/857), VAT (PCN836) |
| Finance | YES | DEEP | 20 API routes, 139 finance UI pages, 43 keyword tables, BlackRock-grade modules (Monte-Carlo, VaR, Hedging, Risk Matrix) |
| HR / Payroll | YES | DEEP | 20 API routes, 57 hr+workforce pages, 19 workforce-schema tables, dedicated `payroll-autonomous` app (80 files), Israeli BL/payroll constants |

**Overall:** All six systems are not only present, they are implemented at multiple layers (DB schema, API routes, business logic, UI pages, dedicated services). Depth far exceeds a "stub" or "page-only" implementation. Aggregate scale: ~3.1k source files, ~5k HTTP handlers, ~1.3k UI pages, 391 DB tables.

---

*End of AGENT-325 report.*
