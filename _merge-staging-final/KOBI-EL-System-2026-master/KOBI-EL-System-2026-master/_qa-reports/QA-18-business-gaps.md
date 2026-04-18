---
id: QA-18 — business gaps
title: Business gaps preventing daily operations at Techno-Kol Uzi
agent: QA-18 — UAT Agent
date: 2026-04-11
companion_to: QA-18-uat.md
---

# QA-18 — Business gaps that block the working day

This is the short list a department head would hand to the owner
after a two-hour walkthrough. Each row is one thing a real person at
Techno-Kol cannot do today because the system does not support it.

Severity is business-first:

- **BLOCKER** — the job literally cannot be done inside the system.
- **HIGH** — possible to limp along with Excel/WhatsApp, but legal
  exposure or unscalable at 30-50 employees / month-end.
- **MEDIUM** — painful but survivable.

## Bug format per row

```
ID            : BG-NN
Severity      : BLOCKER | HIGH | MEDIUM
Role affected : who feels the pain
Process       : P1 Purchase-to-Pay | P2 Payroll | P3 VAT | P4 Month-end | P5 Year-end | P6 Real-estate
Title         : one-line summary
What happens  : what the user tries to do
What fails    : where the system gives up
Evidence      : file path proving the gap
Impact        : money / legal / time cost
Fix hint      : smallest plausible fix
```

---

## BG-01 — No Goods Receipt (GRN) that links to a PO

- **Severity**: BLOCKER
- **Role affected**: Moshe (warehouse / purchasing)
- **Process**: P1 Purchase-to-Pay
- **Title**: Cannot record that steel delivered matches which PO
- **What happens**: Delivery of 2 tons of ברזל 12 מ"מ from "מתכת מקס" arrives at the factory. Moshe tries to find a "Receive Goods" screen linked to PO TK-PO-2026-0041.
- **What fails**: No `goods_receipts` table in `onyx-procurement`. `techno-kol-ops` has `material_movements` with `type='receive'` but it is keyed to `work_orders.id`, not `purchase_orders.id`. The two databases do not share IDs.
- **Evidence**: `onyx-procurement\supabase\migrations\001-supabase-schema.sql` (no GRN); `techno-kol-ops\src\db\schema.sql:154` (wrong FK).
- **Impact**: Warehouse has no audit trail of partial deliveries, no over/short detection, no way to prove to Rashut HaMisim that invoice matches physical goods.
- **Fix hint**: Create `goods_receipts(po_id, received_at, received_by, total_qty)` + `goods_receipt_lines(po_line_id, qty_received, qty_accepted, qty_rejected)`.

## BG-02 — No 3-way match (PO ↔ GRN ↔ Invoice)

- **Severity**: BLOCKER
- **Role affected**: Moshe + Dana (bookkeeper)
- **Process**: P1
- **Title**: Cannot detect overbilling, double-billing, or billing without delivery
- **What happens**: Dana receives an invoice from "מתכת מקס" for 2 tons but the delivery note says 1.8 tons. She wants the system to block payment until reconciled.
- **What fails**: No service. Grep `3-way | three.way | goods_receipt` returns zero in `onyx-procurement`. Tax invoices have no `grn_id` or `po_id` foreign key to a physical delivery.
- **Evidence**: same as BG-01, plus `004-vat-module.sql:85-136` shows `tax_invoices` with `source_type` free text ("purchase_order") and no FK.
- **Impact**: Standard finance fraud vector. At 400+ monthly POs this produces 6-figure annual leakage.
- **Fix hint**: After BG-01 lands, add `supplier_invoices(po_id, grn_id, ...)` + match service that returns `ok | qty_diff | price_diff | missing_grn`.

## BG-03 — No purchase-order approval matrix

- **Severity**: BLOCKER
- **Role affected**: Kobi (owner), any department head
- **Process**: P1
- **Title**: Any user can approve any amount
- **What happens**: Kobi wants "nothing above 20k NIS without my signature".
- **What fails**: `purchase_orders.status` has a `pending_approval` value (`001-supabase-schema.sql:211`) but no `approval_rules` table, no amount threshold, no role, no second approver, no notification, no chained workflow. A junior with `api-key` auth can PATCH `status='approved'` directly.
- **Evidence**: Grep `approval_rule | approver | limit_amount` in `onyx-procurement\supabase` returns zero hits.
- **Impact**: Legal (internal control), fraud risk, compliance with our own `COMPLIANCE_CHECKLIST.md`.
- **Fix hint**: `approval_rules(entity_type, min_amount, approver_role, step_order)` + `approval_events(entity_type, entity_id, step, approver_id, decided_at, decision)`.

## BG-04 — No supplier invoices / accounts payable

- **Severity**: BLOCKER
- **Role affected**: Dana (bookkeeper)
- **Process**: P1, P3, P4
- **Title**: The AP module does not exist
- **What happens**: After a delivery, Dana wants to book "אני חייב ל-מתכת מקס 25,000₪ עד 30 לחודש".
- **What fails**: No `supplier_invoices` table, no `accounts_payable` view, no aging report. Bank reconciliation migration references `supplier_payment` as a match target (`006-bank-reconciliation.sql:82`) but nothing writes to such a table — it will silently fail to match.
- **Evidence**: `006-bank-reconciliation.sql:82,100` vs absence in `001|004|005`.
- **Impact**: Dana cannot see who we owe, when, or how much. Cash forecasting is impossible. Vendors get paid late → trust damaged → late delivery → production delay.
- **Fix hint**: `supplier_invoices(id, po_id, grn_id, invoice_number, net, vat, gross, due_date, status, paid_at)` + `v_ap_aging` view.

## BG-05 — No payment run / Masav export

- **Severity**: BLOCKER
- **Role affected**: Dana (bookkeeper), Rivka (payroll)
- **Process**: P1 (pay vendors), P2 (pay salaries)
- **Title**: Paying vendors and employees is still manual bank typing
- **What happens**: Dana wants one click to pay 12 suppliers this week; Rivka wants one click to pay 35 salaries.
- **What fails**: No `payment_runs` table, no Masav UTF8-2400 generator, no SEPA/mt103 alternative, no bank API integration.
- **Evidence**: Grep `masav | UTF8.*2400 | payment_run` in `onyx-procurement\src` returns zero hits.
- **Impact**: 2-3 hours per week of manual typing + typo risk + no control over who authorized each payment.
- **Fix hint**: `payment_runs(run_id, date, total, status)` + `payment_run_items(run_id, target_type, target_id, amount, account)` + Masav exporter per bank code.

## BG-06 — No clock-in → timesheet → wage-slip pipeline

- **Severity**: BLOCKER
- **Role affected**: Rivka (payroll clerk), every hourly employee
- **Process**: P2
- **Title**: Wage-slip calculator is a calculator, not a payroll run
- **What happens**: A welder punches in at 07:00, takes 45 minutes lunch, punches out at 17:30, repeats for 22 days. Rivka wants one click to generate his April wage slip.
- **What fails**: `attendance` is a one-row-per-day table with no breaks, no multi-punch, no supervisor approval, no link to wage slips. `wage-slip-calculator.js:115` accepts a PRE-BUILT `timesheet` JSON object with `hours_regular`, `hours_overtime_125/150/175/200` already bucketed. Nothing bridges attendance to that shape.
- **Evidence**: `techno-kol-ops\src\db\schema.sql:64-75` vs `onyx-procurement\src\payroll\wage-slip-calculator.js:115`.
- **Impact**: Rivka still computes overtime with a calculator on paper. 30-50 employees × 22 working days = 660-1100 manual entries per month. Legal risk per Wage Protection § 24 — employer has no immutable evidence of hours when challenged.
- **Fix hint**: `attendance_events(employee_id, ts, type=in|out|break_start|break_end, gps, supervisor_signed)` + aggregator service that produces the shape `wage-slip-calculator` already expects.

## BG-07 — No Form 102 (monthly withholding report)

- **Severity**: BLOCKER
- **Role affected**: Rivka (payroll clerk)
- **Process**: P2
- **Title**: Cannot submit monthly withholding to רשויות
- **What happens**: After running April payroll Rivka wants to produce Form 102 (ניכויים + בטל"א) and file it by the 15th of May.
- **What fails**: Not implemented. `annual_tax_reports.form_type` enum does not even include `102`.
- **Evidence**: `005-annual-tax-module.sql:169`.
- **Impact**: Legal. Late filing penalty ~2000₪/month. Kobi currently pays the accountant extra to do it outside the system.
- **Fix hint**: `buildForm102({ fiscalMonth, employer, wageSlips }) → { mas_hahnasa, bl_employee, bl_employer, bri_employee, bri_employer }` + XML/text exporter.

## BG-08 — No Form 126 / Form 856 builder

- **Severity**: HIGH
- **Role affected**: Rivka, Dana, accountant
- **Process**: P5 year-end
- **Title**: Year-end withholding reconciliation forms not built
- **What happens**: At year end Rivka wants Form 126 (annual withholding) and Form 856 (financial services reports) as drafts.
- **What fails**: Schema enum allows `126` and `856` (`005-annual-tax-module.sql:169`) but `src\tax\form-builders.js` only implements 1301, 1320, 6111, 30A.
- **Evidence**: Cross-check above.
- **Impact**: Must rebuild in accountant's system every year.
- **Fix hint**: Two more `buildFormXXX` functions modelled on `buildForm1320`.

## BG-09 — No Israeli Tax Authority allocation-number API integration

- **Severity**: BLOCKER (legal)
- **Role affected**: Sales / finance
- **Process**: P3
- **Title**: Invoice Reform 2024 is not enforced
- **What happens**: Techno-Kol issues a 35,000₪ invoice to a developer. Per Invoice Reform 2024 the invoice must carry a מספר הקצאה obtained live from Rashut HaMisim before the buyer can claim VAT input.
- **What fails**: `tax_invoices.allocation_number` column exists and `allocation_verified BOOLEAN DEFAULT FALSE` (`004-vat-module.sql:119`), but no code ever calls the ITA API, no enforcement on invoice issue, nothing stops an illegal invoice from being printed.
- **Evidence**: Grep `request_allocation | rashut.*misim | ita.taxes.gov.il` in `onyx-procurement\src` returns zero hits.
- **Impact**: Legal. Buyer cannot claim VAT input on our invoice → buyer refuses to pay → downstream cashflow hole. Penalty for issuing invoice without allocation.
- **Fix hint**: `POST /api/vat/request-allocation` calling the ITA endpoint, plus a DB check constraint that blocks `gross_amount >= THRESHOLD` from going to `status='issued'` without `allocation_verified=true`.

## BG-10 — No general ledger / journal entries

- **Severity**: BLOCKER
- **Role affected**: Dana (bookkeeper), accountant, auditor
- **Process**: P3, P4, P5
- **Title**: There is no double-entry bookkeeping
- **What happens**: Dana wants to post "חייבים 10,000₪ מע"מ לזכות תוצאות, זכות חובות ל-23,400₪ לחובת חייבים" and get a trial balance.
- **What fails**: No `journal_entries`, no `journal_entry_lines`, no `general_ledger`, no `trial_balance` view. `chart_of_accounts` exists (`005-annual-tax-module.sql:192`) but has no seed and nothing posts to it.
- **Evidence**: Same file, schema inspection confirms.
- **Impact**: Every tax report (VAT, 1320, 6111) is computed directly from raw invoice tables, bypassing a ledger. This is not an ERP. The system cannot produce a trial balance, cannot lock a period, cannot honor 7-year retention without freezing invoice editing.
- **Fix hint**: Add `journal_entries(id, date, period_id, created_by, approved_by, description, reference_type, reference_id)` + `journal_lines(entry_id, account_id, debit, credit)` + constraint `SUM(debit)=SUM(credit)`. Wire every invoice post, payroll post, VAT compute through a posting service.

## BG-11 — No accounting-period lock

- **Severity**: BLOCKER
- **Role affected**: Auditor, accountant
- **Process**: P4, P5
- **Title**: Submitted periods remain editable
- **What happens**: Dana submits April VAT and on May 10th someone edits a `tax_invoice` with `invoice_date='2026-04-15'`. The submitted PCN836 no longer matches the database.
- **What fails**: `vat_periods.status='submitted'` exists but no trigger blocks edits on child `tax_invoices`.
- **Evidence**: `004-vat-module.sql:38-77` — status column but no trigger / RLS.
- **Impact**: Fatal for Israeli audit. Every reopened period needs a formal amendment track.
- **Fix hint**: Postgres trigger `BEFORE UPDATE ON tax_invoices` that raises if `vat_period_id` is in a `submitted|accepted` period, unless an `amendment_ticket_id` is passed.

## BG-12 — No real-estate module at all

- **Severity**: BLOCKER for the real-estate arm
- **Role affected**: Kobi (owner)
- **Process**: P6
- **Title**: The system does not know Kobi owns apartments
- **What happens**: Kobi signs a new lease for an apartment in רמת גן at 7,500₪/month, CPI-linked, 12-month term. He wants the system to generate 12 rent invoices with automatic CPI updates and reconcile incoming bank transfers.
- **What fails**: `techno-kol-ops\supabase\migrations\001-operations-core.sql` has `properties` + `contracts(contract_type='lease_out')` as a static register. No `rent_invoice`, no `rent_receipt`, no CPI index table, no auto-issue cron, no arnona tracker.
- **Evidence**: `QA-AGENT-144-REAL-ESTATE.md` explicitly says "**No real estate module currently exists**" as a forward-looking blueprint only.
- **Impact**: Half the business is outside the ERP. Kobi runs it in WhatsApp + Excel.
- **Fix hint**: Ship `re_lease`, `re_rent_schedule`, `re_rent_invoice`, `re_cpi_index`, `re_rent_receipt`, `re_arnona`, `re_vaad_bayit` in a new `modules/real-estate/` area, consolidated with `onyx-procurement`.

## BG-13 — Two disconnected databases, no single source of truth

- **Severity**: HIGH
- **Role affected**: Everyone
- **Process**: cross-cutting
- **Title**: `onyx-procurement` (Supabase) and `techno-kol-ops` (direct pg) do not share schemas or IDs
- **What happens**: A supplier "מתכת מקס" is stored in `onyx-procurement.suppliers` (UUID) AND `techno-kol-ops.suppliers` (different UUID). An employee has one row for payroll (`onyx-procurement.employees` INTEGER PK) and another for attendance (`techno-kol-ops.employees` UUID PK).
- **What fails**: Two separate schemas. No ID mapping table. No cross-reference view.
- **Evidence**: compare `onyx-procurement\supabase\migrations\007-payroll-wage-slip.sql:41` vs `techno-kol-ops\src\db\schema.sql:45`.
- **Impact**: Data duplication, impossible consolidation reports, impossible GL posting (Process 4).
- **Fix hint**: Pick one database (Supabase is richer for tax). Port `techno-kol-ops` schema into the same migrations chain. Add `entity_type='employee'|'supplier'` staging table during transition.

## BG-14 — Wage slips not delivered to employees

- **Severity**: HIGH
- **Role affected**: Rivka, every employee
- **Process**: P2
- **Title**: No SMTP / employee portal to actually deliver the PDF
- **What happens**: Rivka generates a signed wage-slip PDF and presses "email".
- **What fails**: `wage_slips.emailed_at`, `viewed_by_employee_at` columns exist (`007-payroll-wage-slip.sql:164-165`) but no SMTP / SES / Resend / SendGrid integration is wired in `onyx-procurement\src\payroll\*`, and no employee portal login flow.
- **Evidence**: file inspection.
- **Impact**: Legal (Wage Protection § 24 requires the employer to provide the slip) + scale — emailing 35 PDFs manually wastes an afternoon.
- **Fix hint**: Wire Resend or AWS SES; add `POST /api/payroll/wage-slips/:id/email` that actually sends and writes `emailed_at`.

## BG-15 — No CPI index, no depreciation schedule, no fixed-asset register

- **Severity**: HIGH
- **Role affected**: Accountant at year-end
- **Process**: P5
- **Title**: Year-end adjustments have nowhere to live
- **What happens**: Year-end. Accountant needs to book depreciation on the welding robot (7-year linear, 15% residual), CPI-adjust shekel-denominated receivables, revalue inventory.
- **What fails**: No `fixed_assets`, no `depreciation_schedule`, no `cpi_index`, no `inventory_valuation`.
- **Evidence**: schema inspection.
- **Impact**: All of year-end still happens in the accountant's software.
- **Fix hint**: Minimal: `fixed_assets(id, name, category, cost, purchase_date, useful_life_years, method, residual)` + nightly `depreciation_postings` into the GL (after BG-10).

## BG-16 — No role-based access control on finance-sensitive endpoints

- **Severity**: HIGH
- **Role affected**: Kobi (owner)
- **Process**: cross-cutting
- **Title**: Any API key can read or mutate payroll, tax invoices, contracts
- **What happens**: Kobi wants "Moshe sees RFQs and POs; Rivka sees payroll only; Dana sees everything; nobody except me approves > 20k".
- **What fails**: Auth mode is `api_key`. No RBAC, no row-level security. QA-12 RBAC matrix is unfilled.
- **Evidence**: `_qa-reports\QA-12-rbac.md` + `server.js` helmet+cors but no route guards.
- **Impact**: Privacy law (Israeli Privacy Protection Law 1981) — ID numbers, salaries, contracts all readable. Plus internal control failure.
- **Fix hint**: JWT/session + `role` claim + per-route middleware, RLS policies on `wage_slips`, `employees`, `tax_invoices`, `contracts`.

---

## Tally

| Severity | Count | Business process |
|---|---|---|
| BLOCKER | 11 | P1 (3), P2 (2), P3 (1), P4 (1), P5 (0), P6 (1), cross (3) |
| HIGH | 5 | P2 (1), P5 (1), cross (3) |
| MEDIUM | 0 | |
| TOTAL | 16 | |

**Go/No-Go: NO-GO**. Minimum to re-attempt UAT is BG-01 through BG-12
(all blockers).
