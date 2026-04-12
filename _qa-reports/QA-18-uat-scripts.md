---
id: QA-18 — UAT scripts
title: User-Acceptance-Test scripts — Techno-Kol Uzi ERP
agent: QA-18 — UAT Agent
date: 2026-04-11
companion_to: QA-18-uat.md, QA-18-business-gaps.md
audience: Business users at Techno-Kol Uzi (Moshe, Rivka, Dana, Kobi) + a release engineer
how_to_use: >
  Each script is a linear checklist. Each step has EXPECTED (what
  should happen) and ACTUAL (where you write what you saw). When an
  ACTUAL diverges, mark the step FAIL and cite the BG-NN blocker from
  QA-18-business-gaps.md that explains it.
status_legend: PASS | FAIL | BLOCKED (cannot start because a prior step failed) | N/A
---

# QA-18 — UAT scripts

All scripts start from a clean test database seeded with:

- 1 legal entity "טכנו-קול עוזי בע"מ", ח.פ 514236790
- 1 supplier "מתכת מקס", 1 supplier "סטיל פרו"
- 2 employees — "יובל וולף" (hourly welder, 52₪/h), "שרה כהן" (monthly clerk, 11,000₪/mo)
- 1 client "בונה דרום בע"מ"
- 1 property "דירת רמת-גן 001" owned by the real-estate arm
- 1 bank account (Leumi 10-804-12345)

Run the scripts in order. Do not skip unless the script says so.

---

## Script UAT-S1 — Purchase-to-Pay, happy path

**User**: Moshe (warehouse / purchasing manager)
**Goal**: Order 200 meters of ברזל 12 מ"מ, receive them, pay "מתכת מקס".

| # | Action | Expected | Blocker ref | Status |
|---|---|---|---|---|
| S1.01 | Create a Purchase Request "200 מ' ברזל 12 מ"מ לפרויקט TK-PROJ-2026-07" | `purchase_requests` row + `purchase_request_items` row, status `draft` | — | |
| S1.02 | Send RFQ to "מתכת מקס", "סטיל פרו" via WhatsApp | 2 rows in `rfq_recipients`, status `sent` | — | |
| S1.03 | Record a reply from "מתכת מקס" — 45₪/m × 200 = 9,000₪ + 17% VAT | `supplier_quotes` row, `vat_amount=1530`, `total_with_vat=10530` | — | |
| S1.04 | Record a reply from "סטיל פרו" — 42₪/m × 200 = 8,400₪ + VAT | another `supplier_quotes` row | — | |
| S1.05 | Compare & choose "סטיל פרו" | `procurement_decisions` row with `selected_supplier_name='סטיל פרו'`, savings 600₪ | — | |
| S1.06 | Create PO from the decision, 8,400₪ subtotal | `purchase_orders` row, status `draft` | — | |
| S1.07 | Ask Kobi to approve the PO (> 5,000₪ should require 2nd approver per policy) | Workflow blocks PO at `pending_approval` until Kobi signs. System refuses to set `status='approved'` without `approved_by='kobi'`. | BG-03 | EXPECTED FAIL |
| S1.08 | Force-approve as a workaround (do NOT do this in production) | PO reaches `approved` | — | |
| S1.09 | Send PO to "סטיל פרו" | `purchase_orders.sent_at` set, status `sent` | — | |
| S1.10 | "סטיל פרו" confirms delivery for next Monday | `status='confirmed'` | — | |
| S1.11 | Goods arrive. Record a Goods Receipt Note with `received_qty=200 m` linked to this PO | `goods_receipts` row linked to `purchase_orders.id` | BG-01 | EXPECTED FAIL |
| S1.12 | Receive supplier invoice (סטיל פרו — ח.פ 513000099, invoice 2026-0456, net 8,400, VAT 1,428, gross 9,828) | `supplier_invoices` row linked to PO + GRN | BG-04 | EXPECTED FAIL |
| S1.13 | Run 3-way match: PO (200 m, 8,400₪) ↔ GRN (200 m) ↔ invoice (200 m, 8,400₪) | Match status `ok`, invoice may be posted | BG-02 | EXPECTED FAIL |
| S1.14 | Post invoice to AP with due date = invoice_date + 30 | Journal entry posted: Dr Inventory 8,400 / Dr VAT Input 1,428 / Cr AP "סטיל פרו" 9,828 | BG-10 | EXPECTED FAIL |
| S1.15 | Run a payment run on the due date; export Masav file for Leumi | Masav UTF8-2400 file downloads, `payment_run_items` marked `exported` | BG-05 | EXPECTED FAIL |
| S1.16 | Import next bank statement, auto-match the outgoing 9,828₪ to the supplier invoice | `bank_transactions.matched_to_type='supplier_invoice'`, invoice status `paid` | BG-04 (no supplier_invoices table to match to) | EXPECTED FAIL |
| S1.17 | VAT input line appears in the current `vat_period` | `tax_invoices` row with `direction='input'`, `vat_period_id=current`, feeds `taxable_purchases` + `vat_on_purchases` | partial — works only if clerk manually re-keys the invoice as a `tax_invoice` (BG-04) | DEGRADED |

**Expected outcome**: Script fails at **S1.07** (no approval matrix) but a
junior can force-approve. It then fails hard at **S1.11-S1.16** because
GRN / supplier_invoice / 3-way match / payment run / matching do not
exist. Moshe cannot close the loop inside the system.

---

## Script UAT-S2 — Hourly employee, monthly payroll

**User**: Rivka (payroll clerk)
**Goal**: Process יובל וולף's April 2026 wage slip from raw clock-ins.

April 2026 working days: 20. Standard hours per day: 8.6. Expected total: 172 regular.
Assume יובל actually worked: 22 days × 9.5 hours = 209 clock-hours with 22 × 0.5h lunches = 198 paid.
Of those, 172 are regular. 26 are overtime: 14 × 1.25, 8 × 1.50, 4 × 1.75.

| # | Action | Expected | Blocker ref | Status |
|---|---|---|---|---|
| S2.01 | יובל punches in at 07:00 on 2026-04-01 | `attendance_events` row: `employee_id, ts, type='in', gps` | BG-06 | EXPECTED FAIL |
| S2.02 | יובל punches out for lunch at 12:30 | `attendance_events` row: `type='break_start'` | BG-06 | EXPECTED FAIL |
| S2.03 | יובל punches in from lunch at 13:00 | `attendance_events` row: `type='break_end'` | BG-06 | EXPECTED FAIL |
| S2.04 | יובל punches out at 17:00 | `attendance_events` row: `type='out'` | BG-06 | EXPECTED FAIL |
| S2.05 | Daily hours auto-computed: 9.5 clock − 0.5 break = 9.0 paid | `attendance_daily.paid_hours=9.0` | BG-06 | EXPECTED FAIL |
| S2.06 | Repeat for 22 working days | 22 daily rows | BG-06 | EXPECTED FAIL |
| S2.07 | Supervisor locks April timesheet for יובל | `attendance_daily.approved_by`, `locked_at` set; further edits blocked | BG-06 | EXPECTED FAIL |
| S2.08 | Rivka triggers `POST /api/payroll/wage-slips/compute` for יובל, period=2026-04 | Calculator reads locked attendance, buckets 172 regular + 14×125 + 8×150 + 4×175, computes gross | BG-06 (no attendance→calculator bridge) | EXPECTED FAIL |
| S2.09 | Workaround: manually hand a JSON `timesheet={ hours_regular:172, hours_overtime_125:14, hours_overtime_150:8, hours_overtime_175:4 }` to the calculator | Gross = 172×52 + 14×65 + 8×78 + 4×91 = 8944 + 910 + 624 + 364 = 10,842 | code path works | EXPECTED PASS |
| S2.10 | Compute returns gross 10,842, מס הכנסה ~X, בל"א employee ~X, בריאות employee ~X, pension employee 6%, net ~Y | Deductions follow `CONSTANTS_2026` in `wage-slip-calculator.js` | — | |
| S2.11 | Approve the slip | `wage_slips.status='approved'`, `approved_by` set | — | |
| S2.12 | Issue PDF | PDF with all § 24 fields (hours, OT buckets, deductions, employer contribs, vacation/sick balance, YTD) | — | |
| S2.13 | Email slip to יובל at his registered address | SMTP send, `emailed_at` set | BG-14 | EXPECTED FAIL |
| S2.14 | Pay יובל via Masav | Masav UTF8-2400 file row for employee | BG-05 | EXPECTED FAIL |
| S2.15 | File Form 102 for April (withholding + בל"א) | Form 102 draft built from all April slips, XML/text exported | BG-07 | EXPECTED FAIL |

**Expected outcome**: The calculator itself (steps S2.09-S2.12) works
and respects Israeli 2026 constants. Everything **around** the
calculator — clock-in, supervisor approval, delivery, payment, Form
102 — is missing or unhooked. Rivka must continue to type hours
manually, email PDFs manually, pay via bank website manually, and file
Form 102 at the בטל"א portal manually.

---

## Script UAT-S3 — Monthly VAT close (dual-monthly period)

**User**: Dana (bookkeeper)
**Goal**: Close the 2026-03-04 two-monthly VAT period and submit PCN836.

| # | Action | Expected | Blocker ref | Status |
|---|---|---|---|---|
| S3.01 | Open period via `POST /api/vat/periods` with period_start=2026-03-01, period_end=2026-04-30, label="2026-03-04" | row in `vat_periods`, status `open` | — | |
| S3.02 | Assign all March-April invoices to the period (output + input) | `tax_invoices.vat_period_id` set | — | |
| S3.03 | Verify every outgoing invoice ≥ 25,000₪ has `allocation_number` and `allocation_verified=true` | All large invoices have a valid allocation | BG-09 | EXPECTED FAIL — no enforcement, values will be `NULL`/`false` |
| S3.04 | Call `GET /api/vat/periods/:id` to recompute totals | Response has taxable_sales, vat_on_sales, taxable_purchases, vat_on_purchases, net_vat_payable | — | |
| S3.05 | Close period via `POST /api/vat/periods/:id/close` | `status='closing'` then `submitted` after file build | — | |
| S3.06 | Build PCN836 via `POST /api/vat/periods/:id/submit` | Fixed-width Windows-1255 file under `data/pcn836/`, archived, record in `vat_submissions` | — | |
| S3.07 | Open the PCN836 file and validate structure against the spec | A / B / C / D / Z records with correct widths | — | |
| S3.08 | Upload the file to שמ"ת portal manually | Manual step — out of scope. No automation. | — | N/A |
| S3.09 | Pay VAT liability via bank | Manual — no payment run | BG-05 | EXPECTED FAIL |
| S3.10 | Try to edit a `tax_invoice` in the submitted period | Must be blocked | BG-11 | EXPECTED FAIL — update succeeds silently |

**Expected outcome**: The VAT module does its core job (compute +
encode PCN836), but the two legal-grade guarantees — allocation number
enforcement (BG-09) and post-submit immutability (BG-11) — are
missing.

---

## Script UAT-S4 — Month-end close (April 2026)

**User**: Dana (bookkeeper)
**Goal**: Close April 2026: reconcile bank, post accruals, run P&L, lock.

| # | Action | Expected | Blocker ref | Status |
|---|---|---|---|---|
| S4.01 | Import Leumi April CSV via `POST /api/bank/statements/import` | `bank_statements` row + ~N `bank_transactions` rows, `source_format='csv'` | — | |
| S4.02 | Run auto-match against customer payments, supplier invoices, payroll, tax | Each bank tx either matched or flagged in `reconciliation_discrepancies` | — PARTIAL (supplier_invoices table is missing, BG-04) | EXPECTED FAIL |
| S4.03 | For each unmatched tx, manually link or categorize | `reconciliation_matches` rows approved | — | |
| S4.04 | Post accrual for unpaid April electricity bill (500₪) | Journal entry: Dr Utilities 500 / Cr Accrued liabilities 500, period=2026-04 | BG-10 | EXPECTED FAIL |
| S4.05 | Post payroll accrual for unpaid March overtime (1,200₪) | similar JE | BG-10 | EXPECTED FAIL |
| S4.06 | Run Trial Balance | Report balanced debits = credits by account | BG-10 | EXPECTED FAIL |
| S4.07 | Run P&L for April | Revenue, COGS, OpEx, EBIT, Net Profit | `financials.ts` produces a cash-flow-ish summary only, not a GAAP P&L | DEGRADED |
| S4.08 | Run Balance Sheet as of 2026-04-30 | Assets = Liabilities + Equity | BG-10 | EXPECTED FAIL |
| S4.09 | Have Kobi sign off on April | `accounting_periods.reviewed_by`, `approved_by`, `closed_at` | BG-10 (no periods table) | EXPECTED FAIL |
| S4.10 | Lock April — no more entries | Trigger blocks INSERT / UPDATE into April | BG-11 | EXPECTED FAIL |

**Expected outcome**: The only step that passes cleanly is S4.01 (bank
import). Everything downstream is missing because the general ledger
does not exist. Month-end close is impossible inside the system today.

---

## Script UAT-S5 — Year-end & Form 1320 (FY 2025)

**User**: Dana (bookkeeper) + Kobi (signatory)
**Goal**: Produce draft Form 1320 for FY 2025.

| # | Action | Expected | Blocker ref | Status |
|---|---|---|---|---|
| S5.01 | Ensure all 12 months of 2025 are closed and locked (re-run UAT-S4 12 times) | — | BG-10/11 | BLOCKED |
| S5.02 | Book year-end depreciation on welding robot (cost 120,000₪, 7y linear) | JE: Dr Depreciation 17,143 / Cr Accum. Dep. 17,143 | BG-15 | EXPECTED FAIL |
| S5.03 | Revalue inventory as of 2025-12-31 | Inventory valuation posted | BG-15 | EXPECTED FAIL |
| S5.04 | Build Form 1320 via annual-tax routes | JSON payload with all 7 sections (identification, revenue, COGS, opex, profit, assets, metadata) | `buildForm1320` works but reads raw invoices, not GL | DEGRADED |
| S5.05 | Build Form 6111 | payload aggregated by `chart_of_accounts.form_6111_line` | `buildForm6111` exists but chart_of_accounts has no seed and no JE data | EXPECTED FAIL |
| S5.06 | Build Form 126 (annual withholding) | Form 126 draft | BG-08 | EXPECTED FAIL |
| S5.07 | Build Form 856 (annual receipt) | Form 856 draft | BG-08 | EXPECTED FAIL |
| S5.08 | Print all forms as PDF, accountant reviews, Kobi signs | `pdf_path` set, `status='reviewed'`, `status='submitted'` | — | |
| S5.09 | Submit manually at Rashut HaMisim, record `authority_reference` | — | — | |

**Expected outcome**: Form 1320 can be _drafted_ but based on raw
invoice tables rather than an audited GL. The accountant will still
have to rebuild the whole thing in Hashavshevet or similar before
filing. Yearly close is effectively outside the system.

---

## Script UAT-S6 — Real-estate arm: sign a new lease, issue 12 rent invoices

**User**: Kobi (owner, real-estate arm)
**Goal**: Sign a 12-month lease on דירת רמת-גן 001 and auto-issue rent invoices.

| # | Action | Expected | Blocker ref | Status |
|---|---|---|---|---|
| S6.01 | Open property "דירת רמת-גן 001" | `properties` row exists in `techno-kol-ops` | — | |
| S6.02 | Create a lease: tenant "דני ישראלי, ת.ז 012345678", 7,500₪/mo, start 2026-05-01, end 2027-04-30, CPI-linked yearly, 22,500₪ security deposit | `re_lease` row | BG-12 | EXPECTED FAIL — no re_lease table |
| S6.03 | System auto-generates 12 monthly rent invoices | `re_rent_invoice` rows × 12 | BG-12 | EXPECTED FAIL |
| S6.04 | Each rent invoice gets an Israeli Tax Authority allocation number (if > threshold) | `allocation_number` populated | BG-09 | EXPECTED FAIL |
| S6.05 | Monthly cron issues next month's invoice on the 25th | cron fires | BG-12 | EXPECTED FAIL |
| S6.06 | Tenant pays via bank transfer 7,500₪ on 2026-05-03 | Bank import matches to `re_rent_invoice`, `re_rent_receipt` row created | BG-12 | EXPECTED FAIL |
| S6.07 | Kobi views consolidated P&L: metal works revenue + rental income side by side | One report | BG-12 + BG-10 + BG-13 | EXPECTED FAIL |
| S6.08 | CPI-adjust the rent on anniversary (2027-05-01) | New invoice uses indexed amount; `re_cpi_index` lookup | BG-12 | EXPECTED FAIL |
| S6.09 | Record ארנונה payment for 2026 Q2 | `re_arnona_payment` row | BG-12 | EXPECTED FAIL |
| S6.10 | Record ועד בית | `re_vaad_bayit` row | BG-12 | EXPECTED FAIL |

**Expected outcome**: Nothing in this script runs. The real-estate arm
is unserviced.

---

## Script UAT-S7 — Cross-cutting controls

| # | Action | Expected | Blocker ref | Status |
|---|---|---|---|---|
| S7.01 | Create two users: `moshe` (role=purchasing), `rivka` (role=payroll) | Users + role rows | BG-16 | EXPECTED FAIL |
| S7.02 | As `moshe`, try `GET /api/payroll/wage-slips` | 403 Forbidden | BG-16 | EXPECTED FAIL |
| S7.03 | As `rivka`, try `PATCH /api/tax/invoices/:id` | 403 Forbidden | BG-16 | EXPECTED FAIL |
| S7.04 | As `moshe`, try to approve his own 50,000₪ PO | Blocked because approval matrix requires second approver above 20,000₪ | BG-03 | EXPECTED FAIL |
| S7.05 | As an admin, edit a `tax_invoice` in a submitted VAT period | Blocked | BG-11 | EXPECTED FAIL |
| S7.06 | As a developer, raw SQL `UPDATE wage_slips SET net_pay=99999 WHERE id=1` | Blocked by RLS + audit log entry | BG-16 | EXPECTED FAIL |

---

## Roll-up dashboard (fill during run)

| Script | PASS | FAIL | BLOCKED | DEGRADED | Go/No-Go |
|---|---|---|---|---|---|
| UAT-S1 (P2P) | ~6 | ~10 | — | 1 | NO-GO |
| UAT-S2 (payroll) | ~4 | ~8 | — | 0 | NO-GO |
| UAT-S3 (VAT) | ~6 | ~4 | — | 0 | NO-GO (legal) |
| UAT-S4 (month-end) | 1 | ~9 | — | 1 | NO-GO |
| UAT-S5 (year-end) | 0 | ~8 | 1 | 1 | NO-GO |
| UAT-S6 (real-estate) | 1 | 9 | — | 0 | NO-GO |
| UAT-S7 (RBAC / locks) | 0 | 6 | — | 0 | NO-GO |

**Final Go/No-Go**: **NO-GO**. Re-run after BG-01 through BG-12 are
addressed.

---

## Instructions for running these scripts

1. Read `QA-18-uat.md` for context before starting.
2. Seed the test DB as described at the top of this doc.
3. Run each script in order, in one sitting, writing ACTUAL results
   inside the table.
4. When a step fails, cite the **BG-NN** that explains it (from
   `QA-18-business-gaps.md`). Do not try to "fix" ad hoc.
5. When you finish, sum PASS/FAIL/BLOCKED/DEGRADED per script into the
   roll-up dashboard at the bottom.
6. Share the filled doc with Kobi and the accountant before go-live.
7. Do not delete anything — this file and its siblings are the audit
   record of the UAT round.
