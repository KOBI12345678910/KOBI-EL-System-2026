# DATA MODEL — Techno-Kol Uzi Mega ERP

Author: Agent-35
Date: 2026-04-11
Source: `onyx-procurement/supabase/migrations/001..007-*.sql`, `techno-kol-ops/supabase/migrations/001-operations-core.sql`, `techno-kol-ops/src/db/schema.sql`
Primary store: Supabase-hosted Postgres 15+.

Conventions across the whole ERP:
- Money: `NUMERIC(14,2)` (max ₪999,999,999,999.99). Enforced by migration 003 (F-05 fix).
- Time: `TIMESTAMPTZ DEFAULT NOW()`.
- PKs: `UUID DEFAULT gen_random_uuid()` in onyx-procurement core + techno-kol-ops; `SERIAL`/`BIGSERIAL` in Wave 1.5 modules (vat/tax/bank/payroll) for PCN836-friendly integer keys.
- Hebrew comments and status strings are intentional — the DB is the legal record.

---

## 1. PROCUREMENT (migration 001)

### `suppliers` — ספקים
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | `gen_random_uuid()` |
| name | TEXT NOT NULL | legal supplier name |
| contact_person | TEXT NOT NULL | |
| phone / email / whatsapp | TEXT | |
| address | TEXT | |
| country | TEXT DEFAULT 'ישראל' | |
| preferred_channel | TEXT CHECK ∈ {whatsapp,email,sms} | default whatsapp |
| default_payment_terms | TEXT | default 'שוטף + 30' |
| avg_delivery_days | INTEGER DEFAULT 7 | |
| distance_km | NUMERIC | for freight cost model |
| rating / delivery_reliability / quality_score | NUMERIC 1..10 | |
| overall_score | NUMERIC DEFAULT 70 | recalculated by `calculate_supplier_score()` trigger |
| total_orders / total_spent | INTEGER / NUMERIC(14,2) | running stats |
| avg_response_time_hours | NUMERIC | from WhatsApp round-trip |
| on_time_delivery_rate | NUMERIC DEFAULT 100 | |
| total_negotiated_savings | NUMERIC(14,2) | |
| last_order_date | TIMESTAMPTZ | |
| risk_score | NUMERIC DEFAULT 30 | |
| active | BOOLEAN DEFAULT TRUE | soft-delete; never hard-delete |
| notes / tags[] | TEXT / TEXT[] | |
| created_at / updated_at | TIMESTAMPTZ | triggered |

### `supplier_products` — מוצרי ספקים
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| supplier_id | UUID NOT NULL FK → suppliers(id) ON DELETE CASCADE | **L11**: cascade violates "never delete"; keep restricted in practice |
| category / name / description / sku | TEXT | |
| current_price | NUMERIC(14,2) | |
| currency | TEXT DEFAULT 'ILS' | |
| unit | TEXT NOT NULL | |
| min_order_qty | NUMERIC | |
| lead_time_days | INTEGER | |
| created_at / updated_at | TIMESTAMPTZ | |

Indexes: `idx_supplier_products_category`, `idx_supplier_products_supplier`.

### `price_history`
Tracks every quote/invoice price per supplier_id × product_key. Source ∈ {quote, invoice, market, negotiated}. Used by the autonomous engine to flag price drift.

### `purchase_requests` / `purchase_request_items`
PR header + lines. Statuses: `draft → rfq_sent → quotes_received → decided → ordered → delivered | cancelled`.

### `rfqs` / `rfq_recipients`
Parent RFQ and the fan-out list. `rfq_recipients.status` ∈ {sent, delivered, viewed, quoted, declined, no_response}. `response_deadline` + `auto_close_on_deadline` govern the cron that flips status to `closed`.

### `supplier_quotes` / `quote_line_items`
Supplier replies. `source` ∈ {manual, whatsapp_reply, email_reply, api}. `total_price`, `vat_amount`, `total_with_vat`, `delivery_fee` all `NUMERIC(14,2)`. `valid_for_days` for expiry gating.

### `purchase_orders` / `po_line_items`
The authorised order. Status chain: `draft → pending_approval → approved → sent → confirmed → shipped → delivered → inspected → closed | cancelled | disputed`. Keeps `original_price`, `negotiated_savings`, `quality_score`, tracking_number/carrier. `source` ∈ {manual, rfq, auction, auto_reorder, predictive, bundle} — useful for attributing wins to the autonomous engine.

### `procurement_decisions`
Immutable record of an RFQ → supplier selection. Stores `selected_total_cost`, `highest_cost`, `savings_amount/percent`, the full `reasoning JSONB`, `decision_method` (default `weighted_score`), `quotes_compared`.

### `subcontractors` / `subcontractor_pricing` / `subcontractor_decisions`
Real-estate arm — dual-pricing (`percentage_rate` vs `price_per_sqm`) → decision row with `selected_pricing_method ∈ {percentage, per_sqm}` and the cheaper vs alternative cost gap.

Indexes summary (procurement):
- `idx_po_supplier`, `idx_po_status`, `idx_po_project` on `purchase_orders`.
- `idx_rfq_recipients_rfq`, `idx_rfq_recipients_supplier`.
- `idx_price_history_supplier`, `idx_price_history_product`.
- `idx_pr_items_request`, `idx_quote_lines_quote`, `idx_po_lines_po`.

---

## 2. VAT MODULE (migration 004, B-09)

### `company_tax_profile`
Single-row-per-legal-entity tax identity. `company_id` (ח.פ), `vat_file_number` (תיק מע"מ), `tax_file_number` (תיק ניכויים), `authorized_dealer BOOLEAN` (עוסק מורשה), `reporting_frequency ∈ {monthly, bi_monthly}`, `accounting_method ∈ {accrual, cash}`, `fiscal_year_end_month`.

### `vat_periods`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| period_start / period_end | DATE NOT NULL | CHECK end ≥ start |
| period_label | TEXT NOT NULL | e.g. "2026-04" |
| status | TEXT | `open → closing → submitted → accepted | rejected → amended` |
| taxable_sales / zero_rate_sales / exempt_sales / vat_on_sales | NUMERIC(14,2) | outputs — עסקאות |
| taxable_purchases / vat_on_purchases / asset_purchases / vat_on_assets | NUMERIC(14,2) | inputs — תשומות |
| net_vat_payable | NUMERIC(14,2) | positive=pay, negative=refund |
| is_refund | BOOLEAN | |
| submitted_at | TIMESTAMPTZ | |
| submission_reference | TEXT | אישור שמ"ת |
| pcn836_payload | JSONB | raw PCN836 record body |
| pcn836_file_path | TEXT | disk archive |
| prepared_by / reviewed_by | TEXT | |
| locked_at | TIMESTAMPTZ | flips when period closes |

UNIQUE(period_start, period_end). Indexes on `period_label`, `status`.

### `tax_invoices`
Both output (issued) and input (received). Key columns: `invoice_type ∈ {issued, received, credit_note, debit_note}`, `direction ∈ {output, input}`, `invoice_number + counterparty_id + invoice_type UNIQUE`, `net_amount / vat_rate (default 0.17) / vat_amount / gross_amount NUMERIC(14,2)`, `allocation_number + allocation_verified` (Invoice Reform 2024), `vat_period_id FK → vat_periods(id)`, `source_type ∈ {purchase_order, manual, bank_import}` + `source_id`, `status ∈ {recorded, verified, disputed, voided, amended}`.

Indexes: `idx_tax_invoices_period`, `idx_tax_invoices_date`, `idx_tax_invoices_direction`, `idx_tax_invoices_counterparty`, partial `idx_tax_invoices_allocation WHERE allocation_number IS NOT NULL`.

### `vat_submissions`
Audit trail of every transmission to רשות המסים. `submission_type ∈ {initial, amendment, correction}`, `submission_method ∈ {shamat, paper, api}`, full `pcn836_header JSONB`, `pcn836_records JSONB`, `pcn836_total_records`, `pcn836_file_checksum`, `pcn836_file_path`, `authority_reference`, `authority_response JSONB`, `status ∈ {submitted, accepted, rejected, under_review, corrected}`.

View: `v_current_vat_period` joins open `vat_periods` with outputs & inputs from `tax_invoices` (direction output/input, excluding voided) and computes running totals.

---

## 3. ANNUAL TAX (migration 005, B-10)

### `projects`
| Column | Notes |
|---|---|
| id SERIAL PK, `project_code UNIQUE` | |
| name, client_id, client_name, client_tax_id, address | |
| `project_type ∈ {construction, fabrication, installation, real_estate, service, other}` | |
| `status ∈ {planning, active, on_hold, completed, cancelled, archived}` | |
| contract_value, estimated_cost, actual_cost — NUMERIC(14,2) | |
| start_date, end_date | |
| completion_percent NUMERIC(5,2) 0..100 | |
| fiscal_year INTEGER | |
| `revenue_recognition ∈ {completed_contract, percentage_of_completion}` | |

Indexes on `status`, `fiscal_year`, `client_id`.

### `customers`
Tax-ready customer register. `tax_id UNIQUE`, `tax_id_type ∈ {company, individual, nonprofit, partnership, foreign}`, `payment_terms_days`, `credit_limit`, `is_related_party BOOLEAN` (for related-party reporting on Form 1320).

### `customer_invoices`
| Column | Notes |
|---|---|
| id SERIAL PK, `invoice_number UNIQUE` | |
| invoice_date, due_date | |
| customer_id FK → customers(id) | |
| customer_name, customer_tax_id | denormalised for legal immutability |
| project_id FK → projects(id) | |
| net_amount, vat_rate (default 0.17), vat_amount, gross_amount — NUMERIC(14,2) | |
| allocation_number / allocation_status ∈ {pending, verified, invalid, exempt} | Invoice Reform 2024 |
| amount_paid, amount_outstanding | NUMERIC(14,2) |
| status ∈ {draft, issued, partial, paid, overdue, voided, disputed} | |
| linked_tax_invoice_id FK → tax_invoices(id) | cross-link into VAT |
| pdf_path | |

### `customer_payments`
`receipt_number UNIQUE`, `payment_method ∈ {bank_transfer, check, cash, credit_card, standing_order, wire, other}`, check fields (number/bank/branch/account/value_date), `reference_number` (bank tx id), `invoice_ids INTEGER[]` (array — a single receipt can clear multiple invoices), `reconciled` flag, `reconciled_at / reconciled_by`.

### `fiscal_years`
One row per year. `status ∈ {open, closing, closed, audited, submitted}`. Rollups: `total_revenue`, `total_cogs`, `gross_profit`, `total_expenses`, `net_profit_before_tax`, `income_tax`, `net_profit_after_tax`.

### `annual_tax_reports`
Drafts of the Israel tax forms. `form_type ∈ {1301, 1320, 6111, 30a, 126, 856, 867}`, `status ∈ {draft, prepared, reviewed, submitted, accepted, amended}`, `payload JSONB` (full form data), `computed_totals JSONB`, `authority_reference`, `pdf_path`, `xml_path`. UNIQUE(fiscal_year, form_type).

### `chart_of_accounts`
`account_code UNIQUE`, `account_type ∈ {asset, liability, equity, revenue, expense, cogs}`, `parent_id` self-FK, and crucially `form_6111_line` + `form_1320_line` so that the ledger rolls up directly to regulatory line numbers.

---

## 4. BANK RECONCILIATION (migration 006, B-11)

### `bank_accounts`
`bank_code` is the Israeli bank number (10 Leumi, 11 Discount, 12 Poalim, 13 Igud, 14 Otsar, 17 Mercantile, 20 Mizrahi-Tfahot, 31 Beinleumi). UNIQUE(bank_code, branch_number, account_number). `purpose ∈ {operating, payroll, tax, reserves}`, `is_primary`, `currency`, `current_balance`, `available_balance`, `last_statement_date`.

### `bank_statements`
One row per imported file. `source_format ∈ {csv, mt940, camt053, ofx, excel, manual, api}`, `source_file_path`, `source_file_checksum`, `opening_balance`, `closing_balance`, `transaction_count`, `status ∈ {imported, reconciling, reconciled, discrepancy, archived}`. UNIQUE(bank_account_id, period_start, period_end).

### `bank_transactions`
| Column | Notes |
|---|---|
| id BIGSERIAL PK | high-volume table |
| bank_account_id FK, bank_statement_id FK | |
| transaction_date, value_date | |
| description, long_description, counterparty_name, counterparty_account, reference_number | |
| amount NUMERIC(14,2) | sign convention: + = credit (in), − = debit (out) |
| balance_after | NUMERIC(14,2) |
| `transaction_type ∈ {transfer, check, cash_deposit, cash_withdrawal, fee, interest, standing_order, direct_debit, card, loan, fx, other}` | |
| reconciled BOOLEAN DEFAULT FALSE | |
| reconciled_at / reconciled_by | |
| `matched_to_type ∈ {customer_payment, supplier_payment, payroll, tax, manual, unmatched}` | |
| matched_to_id TEXT | FK discipline is per-type |
| match_confidence NUMERIC(3,2) 0..1 | |
| raw_data JSONB | full raw row for audit |

Indexes: composite `(bank_account_id, transaction_date)`, `(bank_statement_id)`, partial `reconciled WHERE NOT reconciled`, composite `(matched_to_type, matched_to_id)`.

### `reconciliation_matches`
Many-to-many. `target_type ∈ {customer_invoice, customer_payment, supplier_payment, purchase_order, payroll, tax_payment, manual}`, `match_type ∈ {exact, partial, manual, auto, suggested}`, `confidence 0..1`, `match_criteria JSONB` (`{amount_diff, date_diff, name_similarity}`), `approved / approved_by / approved_at`, `rejected / rejected_reason`. UNIQUE(bank_transaction_id, target_type, target_id).

### `reconciliation_discrepancies`
Fallout bucket. `discrepancy_type ∈ {unmatched_bank_tx, unmatched_ledger, amount_mismatch, date_mismatch, missing_statement, duplicate_entry}`, `severity ∈ {low, medium, high, critical}`, `status ∈ {open, investigating, resolved, escalated, written_off}`.

View: `v_unreconciled_summary` per bank_account with count + sum + oldest_unreconciled_date.

---

## 5. PAYROLL / WAGE SLIPS (migration 007, B-08)

### `employers`
`company_id UNIQUE` (ח.פ), `tax_file_number` (תיק ניכויים), `vat_file_number`, `bituach_leumi_number` (מספר מעסיק).

### `employees`
UNIQUE(employer_id, employee_number) and UNIQUE(employer_id, national_id). `employment_type ∈ {monthly, hourly, daily, freelance, foreign, youth, trainee}`, `work_percentage NUMERIC(5,2)`, `base_salary NUMERIC(14,2)`, `hours_per_month DEFAULT 182` (42h/week × 4.33), pension/study fund identifiers, `tax_credits NUMERIC(5,2) DEFAULT 2.25` (נקודות זיכוי for Israeli residents). `full_name` is a `GENERATED ALWAYS AS` column.

Index: `idx_employees_employer(employer_id, is_active)`.

### `wage_slips`
The legally-critical table. One row per employee per month; UNIQUE(employee_id, period_year, period_month). **Frozen snapshot columns** — employer_legal_name, employer_company_id, employer_tax_file, employee_number, employee_name, employee_national_id, position, department — are denormalised so the slip stays legally valid even if the parent rows change.

Hours: `hours_regular`, `hours_overtime_125 / _150 / _175 / _200`, `hours_absence`, `hours_vacation`, `hours_sick`, `hours_reserve` (מילואים) — all `NUMERIC(7,2)`.

Earnings (all `NUMERIC(14,2) DEFAULT 0`): `base_pay, overtime_pay, vacation_pay, sick_pay, holiday_pay, bonuses, commissions, allowances_meal/_travel/_clothing/_phone, other_earnings, gross_pay`.

Deductions: `income_tax, bituach_leumi, health_tax, pension_employee, study_fund_employee, severance_employee, loans, garnishments, other_deductions, total_deductions` (all NUMERIC(14,2)).

Net: `net_pay NUMERIC(14,2)`. **CHECK constraint**: `net_pay = gross_pay − total_deductions`.

Employer contributions: `pension_employer, study_fund_employer, severance_employer, bituach_leumi_employer, health_tax_employer`.

Balances (legally required on every slip per Amendment 24): `vacation_balance, sick_balance, study_fund_balance, severance_balance`.

YTD: `ytd_gross, ytd_income_tax, ytd_bituach_leumi, ytd_pension`.

Status: `draft → computed → approved → issued → paid → voided | amended`. `amendment_of INTEGER REFERENCES wage_slips(id)` supports self-referential amendment chains. `pdf_path / pdf_generated_at / emailed_at / viewed_by_employee_at` close the loop.

Indexes: `(employee_id, period_year DESC, period_month DESC)`, `(employer_id, period_year, period_month)`, `(status)`.

### `employee_balances`
`snapshot_date` + employee_id UNIQUE. `vacation_days_balance` and `sick_days_balance` are `GENERATED ALWAYS AS (earned − used) STORED`. Also carries study_fund_balance, pension_balance, severance_balance.

### `payroll_audit_log`
BIGSERIAL PK. Captures `event_type`, `wage_slip_id`, `employee_id`, `actor`, `actor_role`, `ip_address INET`, `user_agent`, `details JSONB`, `before_state JSONB`, `after_state JSONB`. Indexed by `(wage_slip_id, created_at DESC)`, `(employee_id, created_at DESC)`, `(created_at DESC)` — three indexes because this is the primary HR forensic table.

---

## 6. SYSTEM TABLES

### `audit_log` (migration 001)
Universal mutation ledger. `id UUID`, `entity_type TEXT NOT NULL`, `entity_id UUID`, `action TEXT NOT NULL`, `actor TEXT NOT NULL`, `detail TEXT`, `previous_value JSONB`, `new_value JSONB`, `created_at TIMESTAMPTZ`. Indexes: `(entity_type, entity_id)`, `(created_at DESC)`.

### `system_events`
Lower-severity event stream for observability — WhatsApp webhooks, RFQ fan-out, schedule misses. `type / severity ∈ {info, warning, error, critical} / source / message / data JSONB / acknowledged`.

### `notifications`
Outbound notification ledger — `recipient / channel / title / message / severity / sent / delivered / acknowledged`. Used to deduplicate resends.

### `schema_migrations` (migration 003)
`version PK, name, applied_at, applied_by DEFAULT CURRENT_USER, checksum, execution_ms, rolled_back BOOLEAN, notes`. Index `(applied_at DESC)`. Every migration file ends with a self-insert `ON CONFLICT DO UPDATE SET applied_at = NOW()` so re-running is safe.

---

## 7. Indexes Summary (cheat sheet)

| Table | Index | Purpose |
|---|---|---|
| suppliers | n/a (PK + view `supplier_dashboard`) | small table |
| supplier_products | `(category)`, `(supplier_id)` | category search |
| price_history | `(supplier_id)`, `(product_key)` | trend lookup |
| purchase_request_items | `(request_id)` | PR expansion |
| rfq_recipients | `(rfq_id)`, `(supplier_id)` | fan-out |
| supplier_quotes | `(rfq_id)`, `(supplier_id)` | compare |
| quote_line_items | `(quote_id)` | |
| purchase_orders | `(supplier_id)`, `(status)`, `(project_id)` | dashboards |
| po_line_items | `(po_id)` | |
| audit_log | `(entity_type, entity_id)`, `(created_at DESC)` | forensic |
| system_events | `(type)`, `(severity)` | ops |
| notifications | `(recipient)`, `(sent)` | dedupe |
| vat_periods | `(period_label)`, `(status)` | period picker |
| tax_invoices | `(vat_period_id)`, `(invoice_date)`, `(direction, status)`, `(counterparty_id)`, partial `(allocation_number)` | period close |
| vat_submissions | `(vat_period_id)`, `(status)` | audit |
| projects | `(status)`, `(fiscal_year)`, `(client_id)` | |
| customers | `(tax_id)` | |
| customer_invoices | `(customer_id)`, `(project_id)`, `(status)`, `(invoice_date)` | AR |
| customer_payments | `(payment_date)`, `(customer_id)`, `(payment_method)` | receipts |
| annual_tax_reports | `(fiscal_year)`, `(form_type)` | |
| bank_accounts | `(active)` | |
| bank_statements | `(bank_account_id, period_start)` | |
| bank_transactions | `(bank_account_id, transaction_date)`, `(bank_statement_id)`, partial `reconciled WHERE NOT reconciled`, `(matched_to_type, matched_to_id)` | recon |
| reconciliation_matches | `(bank_transaction_id)`, `(target_type, target_id)` | |
| reconciliation_discrepancies | `(bank_account_id, status)` | |
| employees | `(employer_id, is_active)` | |
| wage_slips | `(employee_id, period_year DESC, period_month DESC)`, `(employer_id, period_year, period_month)`, `(status)` | |
| employee_balances | UNIQUE `(employee_id, snapshot_date)` | |
| payroll_audit_log | `(wage_slip_id, created_at DESC)`, `(employee_id, created_at DESC)`, `(created_at DESC)` | |
| schema_migrations | `(applied_at DESC)` | |

---

## 8. Money Precision Note

Every money-bearing column is `NUMERIC(14,2)`:
- Integer part: 12 digits ⇒ ₪999,999,999,999 (≈ ₪1 trillion)
- Fractional: 2 digits ⇒ 1 agora precision
- No `REAL`, no `DOUBLE PRECISION`, no JavaScript `Number` arithmetic before the value is persisted. The payroll calculator uses integer-agora math internally and rounds to 2 decimals only at the final writeback.
- Migration `003-migration-tracking-and-precision.sql` retroactively alters every pre-existing money column (`suppliers.total_spent`, `supplier_products.unit_price`, `supplier_quotes.subtotal/total_price/vat_amount/total_with_vat/delivery_fee`, `quote_line_items.unit_price/total_price`, `purchase_orders.subtotal/delivery_fee/vat_amount/total/original_price/negotiated_savings`, `po_line_items.unit_price/total_price`, `procurement_decisions.selected_total_cost/highest_cost/savings_amount`, `subcontractor_decisions.project_value/selected_cost/alternative_cost/savings_amount`, `subcontractor_pricing.percentage_rate/price_per_sqm/minimum_price`).
- CHECK constraint on `wage_slips`: `net_pay = gross_pay − total_deductions`. Any rounding drift fails the insert — caught before the slip is legally issued.
- `vat_rate` is `NUMERIC(5,4)` so 0.1700 is exact for the 17% Israel rate.
- `fx_rate` on `tax_invoices` is `NUMERIC(10,6)` for multi-currency edge cases (foreign suppliers).

---

## 9. Notes on Foreign-Key Integrity

- Wave 1.5 modules (vat/tax/bank/payroll) use `INTEGER/SERIAL` FKs while the core procurement tables use `UUID`. This is a deliberate split so PCN836 and Form-6111 payloads stay human-readable — the Israel Tax Authority expects numeric IDs in fixed-width files, not 36-character UUIDs.
- Cross-module links that cross the UUID/INTEGER boundary are done via soft references (`source_type + source_id TEXT`) rather than hard FKs. This is the case for `tax_invoices.source_type ∈ {purchase_order, …} + source_id TEXT` and `bank_transactions.matched_to_type + matched_to_id TEXT`.
- Within each module, all relationships are hard FKs with `ON DELETE RESTRICT` or `ON DELETE CASCADE` — migration 001 uses CASCADE in several places (see limitation L11 in ARCHITECTURE.md § 6).
