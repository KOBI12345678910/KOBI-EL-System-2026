---
id: QA-18
title: UAT — User Acceptance Testing (Techno-Kol Uzi ERP)
agent: QA-18 — UAT Agent
date: 2026-04-11
scope: End-to-end walkthrough from the real-world business user POV
verdict: NO-GO FOR PRODUCTION
author_notes: >
  No code is deleted. Each finding cites file paths that were inspected
  live. Severity is business-first (can a real user do a real day of work?),
  not technical nitpick.
---

# QA-18 — UAT for Techno-Kol Uzi ERP

## Methodology

Played the part of four real users inside Techno-Kol Uzi and tried to
walk each process end-to-end using only what the system actually ships:

1. **Moshe, warehouse + purchasing manager** — orders steel profiles from
   "מתכת מקס", receives the goods, approves the invoice, pays the vendor.
2. **Rivka, HR + payroll clerk** — registers hours for a welder, runs
   the monthly payroll batch, issues signed wage slips, submits to
   בטל"א.
3. **Dana, bookkeeper** — closes the VAT period, files PCN836 to
   שמ"ת, closes the month, ties the bank, files Form 1320 at year end.
4. **Kobi, owner (real-estate arm)** — signs a new lease for an apartment
   in רמת גן, issues monthly rent receipts, tracks ארנונה, ends the
   year with a consolidated P&L that mixes the factory and the property
   portfolio.

For every process I answered three business questions:

- **Coverage** — can the user finish the process without leaving the
  system (Excel, WhatsApp, a paper folder)?
- **Controls** — does the system stop the user from doing something that
  would violate Israeli law (Wage Protection 24, Invoice Reform 2024,
  חוק מע"מ)?
- **Audit** — would a מבקר (auditor) accept the trail the system leaves
  behind?

Severity legend (business-first):

| Tag | Meaning |
|---|---|
| BLOCKER | User cannot do the job at all today. Must fix before go-live. |
| HIGH | User can limp along with Excel, but legally exposed or manual work unacceptable at scale. |
| MEDIUM | Works for one user on a good day, painful at 30-50 employees / month-end. |
| LOW | Annoying but not business-critical. |
| NICE-TO-HAVE | Quality of life / future. |

---

## Process 1 — Purchase-to-Pay (רכש → תשלום)

### Expected steps (Israeli manufacturer SOP)

1. Internal requisition (דרישה פנימית)
2. Request-for-quote (RFQ / ריבוי הצעות)
3. Receive quotes
4. Create Purchase Order (PO / הזמנת רכש)
5. PO approval (multi-level by amount)
6. Goods Receipt Note (GRN / תעודת קבלה)
7. Supplier invoice intake
8. 3-way match (PO ↔ GRN ↔ invoice)
9. Post to AP / Chart of accounts
10. Payment run + bank reconciliation
11. Record as expense (VAT input + Form 1320 line)

### What the system actually ships

| Step | Coverage | Evidence | Status |
|---|---|---|---|
| 1. דרישה פנימית | PARTIAL | `purchase_requests` + `purchase_request_items` exist — `onyx-procurement\supabase\migrations\001-supabase-schema.sql:82-110`. | OK |
| 2. RFQ | YES | `rfqs`, `rfq_recipients` tables + WhatsApp fan-out — `001-supabase-schema.sql:114-146`. | OK |
| 3. Quotes | YES | `supplier_quotes` + `quote_line_items` — `001-supabase-schema.sql:149-188`. | OK |
| 4. PO | YES | `purchase_orders` + `po_line_items` — `001-supabase-schema.sql:192-254`. | OK |
| 5. PO approval | BROKEN | Status `pending_approval` exists (`001-supabase-schema.sql:211`) but there is NO approval-rule table: no approver role, no amount limit, no second approver on high-value POs. A junior can set `status='approved'` directly. | BLOCKER |
| 6. GRN | BROKEN | No `goods_receipts` / `grn` table anywhere in `onyx-procurement`. `techno-kol-ops` has `material_movements` with a `receive` type (`techno-kol-ops\src\db\schema.sql:154`) but it has no link to `purchase_orders.id` — only to legacy `work_orders.id`. Cannot prove which PO a delivery belongs to. | BLOCKER |
| 7. Supplier invoice intake | BROKEN | `tax_invoices` supports direction=`input` (`004-vat-module.sql:87`) but there is NO `supplier_invoices` header with a `po_id` foreign key. Bank reconciliation migration (`006-bank-reconciliation.sql:82`) REFERENCES "supplier_payment" / "supplier_invoice" as match targets, yet neither table is created. Bank match will silently fail. | BLOCKER |
| 8. 3-way match | MISSING | No table, no service, no test, no UI. Grep `3-way | GRN | goods_receipt` in `onyx-procurement` returns zero hits. | BLOCKER |
| 9. Post to AP | MISSING | No `accounts_payable` table, no `journal_entries`, no `general_ledger`. Form 1320 builder (`src\tax\form-builders.js:83`) pulls totals from `customerInvoices` + `taxInvoices` directly — there is no double-entry ledger underneath. | BLOCKER |
| 10. Payment run | MISSING | No `payment_run`, no `payment_batch`, no bank-file export (Masav / UTF8-2400 / mt940 out). `bank_transactions` imports only. | BLOCKER |
| 11. Expense + VAT input | PARTIAL | `tax_invoices` with `direction='input'` will feed the VAT period, BUT because step 7 is missing the user must key each invoice twice: once under the PO concept and once as a raw tax_invoice. No link, no consistency check. | HIGH |

### Business verdict — Process 1

**BLOCKER — the P2P chain is cut in half.** A real warehouse manager
cannot post today that "this delivery matches this PO and this invoice,
please cut a payment". The system knows about POs and knows about
tax_invoices, but nothing bridges them. Finance is forced back to Excel
the moment a box of steel comes through the door. Multi-level approval
is also non-existent: anyone with a login can stamp a 500k PO "approved"
with no second signature, which alone fails SOX-style internal control
and our own `COMPLIANCE_CHECKLIST.md`.

---

## Process 2 — Employee Work Day → Wage Slip → Bitu'ach Le'umi

### Expected steps

1. Employee clocks in (physical clock / mobile / supervisor)
2. Clock out / lunch break deducted
3. Overtime auto-calculated (125 / 150 / 175 / 200)
4. Supervisor approval of timesheet
5. Payroll clerk runs monthly computation
6. Wage slip issued (PDF, all 9 Section-24 fields)
7. Slip emailed to employee / portal
8. Bank transfer via Masav
9. Monthly Form 102 (ניכוי בטל"א + מס)
10. Annual Form 126 / 856

### What the system actually ships

| Step | Coverage | Evidence | Status |
|---|---|---|---|
| 1. Clock in | PARTIAL | `techno-kol-ops` has basic `attendance(employee_id, date, check_in, check_out, location, hours_worked)` (`techno-kol-ops\src\db\schema.sql:64-75`). One row per day — no multi-punch, no breaks, no geolocation proof. Route `techno-kol-ops\src\routes\attendance.ts:47` is one POST that overwrites the day. | HIGH |
| 2. Break / lunch | MISSING | Schema has no break columns. Wage-slip calculator (`wage-slip-calculator.js:115`) reads `hours_regular`, `hours_overtime_125/150/175/200` from a `timesheet` object that has to be handed in already computed. | HIGH |
| 3. Overtime calculation | CODE ONLY | Constants for 125/150/175/200 exist (`wage-slip-calculator.js:77-84`) but there is NO service that reads raw clock-ins from `attendance` and produces overtime buckets. A human still computes the breakdown and hands it to the wage slip endpoint. | BLOCKER |
| 4. Supervisor approval | MISSING | `attendance` table has no `approved_by`, no `approval_status`, no "locked_at". Supervisor has nothing to sign. | HIGH |
| 5. Monthly compute | YES | `POST /api/payroll/wage-slips/compute` + `wage-slip-calculator.js` implement Israeli 2026 constants correctly (brackets, בטל"א, בריאות, פנסיה, השתלמות, סף, יסף). Good work. | OK |
| 6. Wage slip PDF | YES | `pdf-generator.js` exists, wage_slips table enforces every Wage Protection § 24 field (hours regular+OT, all deductions, employer contributions, vacation/sick balances, YTD) — `007-payroll-wage-slip.sql:99-180`. Legally defendable. | OK |
| 7. Email slip | PARTIAL | `wage_slips.emailed_at`, `viewed_by_employee_at` columns exist but I found no SMTP / SES integration in `onyx-procurement\src\payroll\*` and no employee portal for login-and-download. Slip will not actually reach the employee. | HIGH |
| 8. Masav bank file | MISSING | No `masav_export`, no UTF8-2400 generator. Payroll will run, but paying 30-50 employees still requires manual bank typing. | BLOCKER |
| 9. Form 102 (monthly) | MISSING | Grep `form_102 | form102 | ניכוי.*לאומי` — zero hits in `onyx-procurement\src`. Every month Rivka cannot file the withholding report from inside the ERP. | BLOCKER |
| 10. Form 126 / 856 (annual) | PARTIAL | `annual_tax_reports.form_type` CHECK allows `126` and `856` (`005-annual-tax-module.sql:169`) — but `src\tax\form-builders.js` only implements 1301, 1320, 6111, 30A. Builders for 126 and 856 are TODO. | HIGH |

### Business verdict — Process 2

**BLOCKER — the system computes a correct slip but there is no pipe
between the time-clock and the slip, and no pipe between the slip and
the money/authorities.** Rivka still has to:

- Collect hours manually and type them into a JSON timesheet.
- Email or WhatsApp slips to every employee manually.
- Log into בטל"א portal and re-type Form 102.
- Log into the bank website and pay every salary manually.

At 30-50 employees this is impossible. Also — Wage Protection Law
§ 24 requires the **employer** to prove hours; if an employee disputes
their overtime, the system has no supervisor-signed, immutable record.

---

## Process 3 — Monthly / Bi-Monthly VAT (מע"מ)

### Expected steps

1. Collect all output invoices (sales) for the period
2. Collect all input invoices (purchases)
3. Verify each invoice >= 25k NIS has a מספר הקצאה (Invoice Reform 2024)
4. Compute total VAT collected (מס עסקאות)
5. Compute total VAT paid (מס תשומות)
6. Compute מע"מ לתשלום
7. Generate PCN836 file
8. Upload to שמ"ת
9. Pay מע"מ via bank transfer
10. Lock the period

### What the system actually ships

| Step | Coverage | Evidence | Status |
|---|---|---|---|
| 1. Output invoices | YES | `customer_invoices` + `tax_invoices direction='output'` — `005-annual-tax-module.sql:72`, `004-vat-module.sql:87`. | OK |
| 2. Input invoices | PARTIAL | `tax_invoices direction='input'` exists. BUT without a `supplier_invoices` header feeding it, manual double-entry is forced on the clerk (see Process 1). | HIGH |
| 3. Allocation number check | BROKEN | Columns `allocation_number`, `allocation_verified` exist (`004-vat-module.sql:119`) BUT there is no call to the Israeli Tax Authority API to request an allocation for outgoing invoices ≥ 25k NIS. From 2025 onward you cannot legally issue that invoice. | BLOCKER |
| 4-6. Compute totals | YES | `GET /api/vat/periods/:id` recomputes totals from `tax_invoices` — `src\vat\vat-routes.js:83-100`. Verified formula uses net+vat consistently. | OK |
| 7. PCN836 build | YES | `buildPcn836File`, fixed-width Windows-1255 encoding, headers A/B/C/D/Z, `fmtAmount`, `fmtDate`, `fmtPeriod` — `src\vat\pcn836.js`. Uses a simplified spec, flagged as such in the header comment. | OK |
| 8. Upload to שמ"ת | MISSING | No automation — user downloads file and uploads manually. Acceptable short term, but there is also no status poll-back. | MEDIUM |
| 9. Pay VAT | MISSING | No payment module at all. | HIGH |
| 10. Lock period | YES | `vat_periods.status` transitions to `submitted` / `accepted`, `locked_at` column — `004-vat-module.sql:71`. | OK |

### Business verdict — Process 3

**HIGH RISK, not quite a blocker.** PCN836 generation is real and
matches the spec. However, the 2024 Invoice Reform gate (allocation
number required ≥ threshold) is not enforced — Dana can issue an
illegal invoice and the system will happily include it in PCN836. This
is an Israeli-tax-authority-visible violation.

---

## Process 4 — Month-End Close

### Expected steps

1. Sync all bank accounts (operating, payroll, tax)
2. Match every bank transaction to an AR or AP record
3. Post accrual JEs (hadgamot)
4. Run Trial Balance (מאזן בוחן)
5. Run P&L (רווח והפסד) / Balance Sheet
6. Accountant review + sign
7. Lock period

### What the system actually ships

| Step | Coverage | Evidence | Status |
|---|---|---|---|
| 1. Bank import | YES | `bank_statements` supports `csv`, `mt940`, `camt053`, `ofx`, `excel`, `manual`, `api` — `006-bank-reconciliation.sql:47`. `src\bank\parsers.js`, `src\bank\matcher.js` exist. | OK |
| 2. Auto-match | PARTIAL | `bank_transactions.matched_to_type` + `reconciliation_matches` — `006-bank-reconciliation.sql:78-117`. BUT match targets include `supplier_payment` and `supplier_invoice` which are not real tables (see Process 1). Partial match loop is structurally broken. | HIGH |
| 3. Accrual JEs | MISSING | **No `journal_entries` table anywhere.** Grep confirms only `unmatched_ledger` as a string literal. There is no double-entry bookkeeping engine. Form 1320 builder pulls numbers directly from invoices rather than from a GL. | BLOCKER |
| 4. Trial Balance | MISSING | Cannot exist without a GL. | BLOCKER |
| 5. P&L / Balance Sheet | PARTIAL | `techno-kol-ops\src\routes\financials.ts` gives a one-table `SELECT SUM(...)` summary straight off `financial_transactions`. This is a cash flow summary, not a GAAP P&L. | HIGH |
| 6. Accountant review | MISSING | No "prepared_by → reviewed_by → approved_by" workflow on month-end close. | HIGH |
| 7. Lock period | MISSING | No `accounting_periods` table with a `closed_at` / `locked_by`. | BLOCKER |

### Business verdict — Process 4

**BLOCKER — there is no general ledger.** Kobi cannot close a month in
any Israeli audit-defensible way. Every tax report that is generated
(VAT, 1320, 6111) is computed directly from invoice tables bypassing a
GL. This means:

- Post-hoc changes to invoices silently re-rate past tax reports.
- There is no concept of "period locked — no more entries".
- Trial balance cannot be reconstructed.
- The system cannot honor the 7-year retention that Rashut HaMisim
  requires unless the invoice tables are never touched. Anti-pattern.

---

## Process 5 — Year-End Close + Form 1320

### Expected steps

1. Close all 12 monthly periods
2. Book year-end adjustments (depreciation, reserves, severance revaluation)
3. Produce balance sheet + P&L + cash flow statement
4. Build Form 1320 (corporate annual return)
5. Build Form 6111 (financial statement schema)
6. Build Form 126 / 856 (withholding reconciliation)
7. Accountant signs
8. Submit to Rashut HaMisim
9. Archive everything for 7 years

### What the system actually ships

| Step | Coverage | Evidence | Status |
|---|---|---|---|
| 1. Close 12 months | BLOCKED | No month-close (Process 4). | BLOCKER |
| 2. YE adjustments | MISSING | No `year_end_adjustments`, no depreciation schedule. | BLOCKER |
| 3. P&L + BS + CF | PARTIAL | P&L yes via `financials.ts`, BS has asset categories in form-builders but populated from `tax_invoices` rather than from a GL. Cash flow statement is absent. | HIGH |
| 4. Form 1320 | YES | `buildForm1320` implemented — `src\tax\form-builders.js:25-110`. Structure looks right (company ID, revenue, COGS, operating expenses, profit, assets, metadata). | OK |
| 5. Form 6111 | YES | `buildForm6111` implemented — same file, line 114+. Maps `chart_of_accounts.form_6111_line` to aggregated balances. BUT `chart_of_accounts` has no seed data and no `journal_entries` to aggregate. Empty form. | HIGH |
| 6. Forms 126 / 856 | MISSING | Builders not implemented even though schema allows it. | HIGH |
| 7. Accountant sign | MISSING | `annual_tax_reports` has `status='reviewed'` in the enum, but there is no UI flow to get to it. | MEDIUM |
| 8. Submit | MISSING | Same PCN836 situation — manual file upload. | MEDIUM |
| 9. Archive | PARTIAL | `pdf_path`, `xml_path` columns exist. Actual retention policy + immutability (WORM / object lock) is not configured. | HIGH |

### Business verdict — Process 5

**BLOCKER for year-end.** Form 1320 has a builder but no trustworthy
data underneath. Until Process 4 has a real GL, Kobi literally cannot
produce a defensible annual return from this system — he would have to
rebuild it in the accountant's software (Hashavshevet / Priority /
Rivhit) anyway.

---

## Bonus Process 6 — Real-Estate Arm (נדל"ן)

Kobi explicitly runs a real-estate portfolio alongside the metal works.

| Step | Coverage | Evidence | Status |
|---|---|---|---|
| Property register | PARTIAL | `techno-kol-ops\supabase\migrations\001-operations-core.sql:138` — `properties` table with type, status, acquisition_cost, market_value, monthly_rent. A register, not a workflow. | MEDIUM |
| Lease (חוזה שכירות) | PARTIAL | `contracts` table with `contract_type='lease_out' | 'lease_in'` — same file, line 213. No rent schedule, no auto rent invoice, no CPI indexing (מדד), no security deposit. | HIGH |
| Rent invoice + receipt | MISSING | No `rent_invoices`, no `rent_receipts`, no monthly auto-issue cron. | BLOCKER |
| ארנונה (municipal) | MISSING | No `municipal_tax`, no `vaad_bayit`. | HIGH |
| מס רכוש / מס שבח | MISSING | No module for real-estate-specific taxes. | HIGH |
| Consolidated P&L (factory + real estate) | MISSING | Two databases, two schemas, no consolidation view. Kobi has to spreadsheet it. | BLOCKER |
| Form 1320 for the holding entity | PARTIAL | Same 1320 builder would be called — but it has no concept of "rental income line" vs "operating income line" per Rashut HaMisim classification. | HIGH |

### Business verdict — Process 6

**BLOCKER for the real-estate arm.** The system effectively does not
know that Kobi owns apartments. `onyx-procurement` has no real-estate
tables at all; `techno-kol-ops` has a static asset register. Neither
produces a rent invoice, neither indexes to the CPI, neither knows when
ארנונה is due. `QA-AGENT-144-REAL-ESTATE.md` explicitly admits "**No
real estate module currently exists**". This half of the business is
unserviced.

---

## Cross-cutting findings

### A. No general ledger = no ERP

The single biggest gap. `journal_entries` / `general_ledger` / 
`trial_balance` do not exist anywhere. All "financial" tables are either
cash-flow-style `financial_transactions` or invoice registers. Every
tax report is a `SELECT SUM()` off invoices. This is not an ERP yet; it
is a procurement + payroll engine bolted to a VAT encoder.

### B. Missing Israeli tax API integration

- Invoice Reform 2024 allocation number → no call to `https://ita.taxes.gov.il/...`.
- שמ"ת upload → manual.
- בטל"א Form 102 → not built.
- Masav salary payment → not built.

Each of these is **required** by law or by operational reality.

### C. No multi-level approval

Wave 1.5 compliance doc and our own `COMPLIANCE_CHECKLIST.md` both
demand separation of duties. The only approval column is a free-text
`approved_by` on `purchase_orders`. No amount threshold, no "second
approver above 20k NIS", no "CFO on POs above 100k".

### D. No attendance→payroll bridge

Techno-kol-ops has a single-row-per-day `attendance` table with no
breaks, no multi-punch, no supervisor approval, no link to wage slips.
Wage-slip calculator takes a pre-built JSON timesheet. Human labor
fills the gap every month.

### E. No real-estate module in the main ERP

See Process 6 + `QA-AGENT-144-REAL-ESTATE.md` which is honest about
this.

### F. No immutability / period lock

There is nothing preventing a developer or an admin from editing a
`tax_invoice` that belongs to a `submitted` VAT period. For Israeli
audit this is fatal.

### G. Two disconnected databases

`onyx-procurement` (Supabase) for tax/payroll/procurement, 
`techno-kol-ops` (direct pg) for work-orders/attendance/materials. They
do not share schemas, IDs, or users. A PO lives in one DB, a GRN
attempt in the other, a wage slip in a third. Consolidation is manual.

---

## Go / No-Go verdict

**NO-GO for production as an ERP for Techno-Kol Uzi.**

The system can serve today as:

- A procurement + RFQ + quote comparison tool (Process 1 steps 1-4).
- A wage-slip calculator that respects Israeli 2026 constants
  (Process 2 steps 5-6).
- A VAT period encoder that generates a valid PCN836 draft (Process 3
  steps 4-7).

It cannot yet serve as:

- A p2p (purchase-to-pay) system — no GRN, no 3-way match, no AP, no
  payment run.
- A payroll operations system — no clock-in→slip pipeline, no Masav,
  no Form 102.
- A month-end close system — no GL, no period lock, no trial balance.
- A year-end close system — Form 1320 builder exists but has no GL to
  pull from.
- A real-estate management system — at all.

### Minimum must-fix list to re-run UAT (ordered by business priority)

1. Build `journal_entries` + `general_ledger` + period-lock table.
   Every existing module (VAT, payroll, 1320) must post into the GL
   instead of computing off invoices. (BLOCKER, Process 4+5)
2. Build `goods_receipts` linked to `purchase_orders` + `supplier_invoices`
   linked to both. Wire the 3-way match service. (BLOCKER, Process 1)
3. Build `approval_rules` with amount thresholds + second approver.
   (BLOCKER, Process 1)
4. Wire `attendance → timesheet aggregator → wage_slip.compute`. Add
   supervisor approval + immutability on locked timesheet. (BLOCKER,
   Process 2)
5. Build Form 102 (monthly withholding) and Masav UTF8-2400 exporter.
   (BLOCKER, Process 2)
6. Integrate Israeli Tax Authority allocation-number API for invoice
   reform 2024. (BLOCKER, Process 3)
7. Build a real-estate module: `re_property`, `re_lease`, `re_rent_invoice`,
   `re_rent_receipt`, `re_arnona`, CPI indexing, auto-issue cron.
   (BLOCKER, Process 6)
8. Consolidate `techno-kol-ops` + `onyx-procurement` into a single
   database with shared user, supplier, project, and chart-of-accounts
   tables. (HIGH, cross-cutting)

Until items 1-4 land, the user will still be running half the company
in Excel and WhatsApp. A paid ERP that only raises RFQs and prints
wage slips does not earn its license at Techno-Kol Uzi.

---

## Appendix — Files inspected

- `onyx-procurement\supabase\migrations\001-supabase-schema.sql` — base procurement schema
- `onyx-procurement\supabase\migrations\004-vat-module.sql` — VAT + PCN836
- `onyx-procurement\supabase\migrations\005-annual-tax-module.sql` — projects, customer invoices, fiscal years, 1320/6111/30a
- `onyx-procurement\supabase\migrations\006-bank-reconciliation.sql` — bank accounts, statements, matches
- `onyx-procurement\supabase\migrations\007-payroll-wage-slip.sql` — employers, employees, wage_slips
- `onyx-procurement\src\vat\pcn836.js` — fixed-width encoder
- `onyx-procurement\src\vat\vat-routes.js` — period lifecycle
- `onyx-procurement\src\payroll\wage-slip-calculator.js` — 2026 Israeli constants
- `onyx-procurement\src\payroll\payroll-routes.js` — CRUD + compute
- `onyx-procurement\src\tax\form-builders.js` — Form 1320 / 1301 / 6111 / 30a
- `onyx-procurement\src\tax\annual-tax-routes.js` — annual tax endpoints
- `onyx-procurement\src\bank\matcher.js`, `parsers.js`, `bank-routes.js`
- `techno-kol-ops\supabase\migrations\001-operations-core.sql` — jobs, properties, contracts
- `techno-kol-ops\src\db\schema.sql` — clients, suppliers, employees, attendance, work_orders, material_items, material_movements, financial_transactions
- `techno-kol-ops\src\routes\attendance.ts` — attendance CRUD
- `techno-kol-ops\src\routes\financials.ts` — "P&L" summary
- `onyx-procurement\QA-AGENT-144-REAL-ESTATE.md` — admits real-estate absence
