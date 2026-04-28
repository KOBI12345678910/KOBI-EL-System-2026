# AGENT-247 — DB BUILD #2: GRN / AP-Invoice / Payment DDL

**Agent**: 247 (DB BUILD #2)
**Date**: 2026-04-29
**Source finding**: Agent 160 — GRN, AP-invoice and Payment tables are absent from `supabase/migrations/`. Originals exist only at `onyx-procurement/db/migrations/0003-0005`.
**Deliverable**: `supabase/migrations/00085_grn_ap_payment.sql`

---

## 1. Scope

Migrate the AP backbone (Procurement -> Cash flow tail) into the supabase/ schema with full tenant isolation, RLS, FK indexes and GL posting. Seven tables, all in the `public` schema:

| # | Table | Purpose |
|---|-------|---------|
| 1 | `goods_receipts` | GRN headers (vendor delivery confirmations against PO) |
| 2 | `grn_lines` | GRN line items (per-PO-line received / accepted / rejected qty) |
| 3 | `ap_invoices_full` | Supplier invoices with 3-way-match status + withholding |
| 4 | `ap_invoice_lines` | Line items with GL coding (account / cost-center / project) |
| 5 | `payments` | Supplier disbursement headers (multi-method, multi-currency) |
| 6 | `payment_allocations` | N:M payment <-> invoice allocations |
| 7 | `withholding_certificates` | IL niku-bemakor cert tracking per supplier |

---

## 2. Source migrations consolidated

The new file fuses and modernises three legacy migrations from `onyx-procurement/db/migrations/`:

- **0003_purchase_orders.sql** — referenced for PO line shape (`po_line_id` FK on GRN lines and AP-invoice lines)
- **0004_invoices_and_payments.sql** — pattern for `invoices` -> `payments` + `recalc_invoice_paid()` trigger
- **0005_audit_trail.sql** — generic `audit_events` already covered by `00073_rls_hardening.sql`; not duplicated

Differences from the legacy 0004:

| Legacy 0004 | New 00085 |
|-------------|-----------|
| `invoices` (single table, customer ambiguous) | `ap_invoices_full` (vendor-only, distinct from AR) |
| Single-row payment per invoice | `payments` + `payment_allocations` N:M |
| No tenant_id | `tenant_id UUID NOT NULL` on every table |
| No GL posting | `post_ap_invoice_to_gl()` + `post_payment_to_gl()` |
| No withholding | `withholding_certificates` + `withholding_amount` cols |
| `paid_amount` recalc only | `paid_amount` + `balance_due` + status auto-flip |

---

## 3. Tenant safety

- Every table has `tenant_id UUID NOT NULL`.
- FK to `public.tenants(id) ON DELETE CASCADE` is added inside a `DO ... EXCEPTION` block that no-ops if `public.tenants` is absent (per the convention of `00072_tenant_id_columns_and_indexes.sql`).
- All seven tables: RLS enabled with two policies (`SELECT` + `ALL`), both predicated on `tenant_id = governance.current_tenant_id()`.
- Service-role escape policies are inherited from the global pattern in `00073_rls_hardening.sql` and not redefined here.

A defensive shim creates `governance.current_tenant_id()` from `current_setting('app.current_tenant_id')` if migration 00073 has not yet run, so this file is independent.

---

## 4. FK indexes (every FK column)

Total 36 indexes created. Highlights:

```
idx_grn_tenant, idx_grn_po, idx_grn_supplier, idx_grn_warehouse, idx_grn_project,
  idx_grn_status, idx_grn_receipt_date, idx_grn_received_by      -- 8 on goods_receipts
idx_grnl_tenant, idx_grnl_grn, idx_grnl_po_line, idx_grnl_item,
  idx_grnl_location                                              -- 5 on grn_lines
idx_apinv_tenant, idx_apinv_supplier, idx_apinv_po, idx_apinv_grn,
  idx_apinv_status, idx_apinv_match, idx_apinv_due, idx_apinv_issued,
  idx_apinv_approved                                             -- 9 on ap_invoices_full
idx_apinvl_tenant, idx_apinvl_invoice, idx_apinvl_po_line,
  idx_apinvl_grn_line, idx_apinvl_item, idx_apinvl_gl_acct,
  idx_apinvl_cc, idx_apinvl_project                              -- 8 on ap_invoice_lines
idx_pmt_tenant, idx_pmt_supplier, idx_pmt_bank, idx_pmt_paid_at,
  idx_pmt_status, idx_pmt_method                                 -- 6 on payments
idx_alloc_tenant, idx_alloc_payment, idx_alloc_invoice           -- 3 on payment_allocations
idx_wht_tenant, idx_wht_supplier, idx_wht_validity, idx_wht_active -- 4 on withholding_certificates
```

---

## 5. GL posting triggers (double-entry)

### 5.1 `post_ap_invoice_to_gl()`
- Fires `BEFORE UPDATE OF status` on `ap_invoices_full` when `status` transitions to `approved` or `matched` AND `posted_to_gl = FALSE`.
- Inserts one header row in `gl_journal_entries` (source_type `ap_invoice`).
- Inserts two lines: DR AP-Expense, CR AP-Control, both for `total_ils`.
- Sets `posted_to_gl = TRUE` and `gl_journal_id` on the row.

### 5.2 `post_payment_to_gl()`
- Fires `BEFORE UPDATE OF status` on `payments` when `status` transitions to `cleared`.
- Inserts header in `gl_journal_entries` (source_type `payment`).
- Two lines: DR AP-Control, CR Bank, both for `amount_ils`.
- Marks the payment as posted.

Both triggers no-op gracefully (return without error) if `gl_journal_entries` is absent — uses an `information_schema.tables` guard. This makes the migration safe to run before or after the GL domain migrations.

### 5.3 `recalc_ap_invoice_paid()`
- Fires `AFTER INSERT/UPDATE/DELETE` on `payment_allocations`.
- Recomputes `paid_amount = SUM(allocated_amount_ils)` and `balance_due = total - paid_amount`.
- Auto-flips status: `paid` when fully settled, `partial_paid` when partial.

---

## 6. State machines (CHECK constraints)

| Table | Field | Allowed states |
|-------|-------|----------------|
| `goods_receipts.status` | 8 | `draft`, `received`, `partial`, `inspected`, `accepted`, `rejected`, `closed`, `posted` |
| `goods_receipts.inspection_status` | 4 | `pending`, `passed`, `failed`, `partial` |
| `ap_invoices_full.status` | 9 | `draft`, `pending`, `approved`, `matched`, `partial_paid`, `paid`, `overdue`, `disputed`, `cancelled` |
| `ap_invoices_full.match_status` | 4 | `unmatched`, `two_way`, `three_way`, `exception` |
| `payments.status` | 6 | `pending`, `processing`, `cleared`, `rejected`, `reversed`, `cancelled` |
| `payments.method` | 6 | `bank_transfer`, `check`, `cash`, `credit_card`, `wire`, `ach` |
| `withholding_certificates.certificate_type` | 4 | `standard`, `full_exemption`, `partial_exemption`, `expired` |

---

## 7. Integrity / business-rule checks

```sql
-- goods_receipts
chk_grn_total_nonneg               total_value >= 0
uq_grn_tenant_number               (tenant_id, grn_number)

-- grn_lines
chk_grnl_qty_pos                   quantity_received > 0
chk_grnl_split                     accepted + rejected <= received
uq_grn_line                        (grn_id, line_no)

-- ap_invoices_full
chk_apinv_total_nonneg             total >= 0
chk_apinv_paid_nonneg              paid_amount >= 0
chk_apinv_paid_le                  paid_amount <= total + 0.01  -- FX rounding tolerance
uq_apinv_tenant_supplier_number    (tenant_id, supplier_id, invoice_number)

-- ap_invoice_lines
chk_apinvl_qty_pos                 quantity > 0
uq_apinvl                          (ap_invoice_id, line_no)

-- payments
chk_pmt_amount_pos                 amount > 0
uq_pmt_tenant_number               (tenant_id, payment_number)

-- payment_allocations
chk_alloc_pos                      allocated_amount > 0
uq_alloc_pmt_inv                   (payment_id, ap_invoice_id)  -- prevent double-alloc

-- withholding_certificates
chk_wht_valid_range                valid_to >= valid_from
chk_wht_rates                      both rates in [0, 100]
uq_wht_tenant_supplier_cert        (tenant_id, supplier_id, certificate_number)
```

---

## 8. Idempotency

- All `CREATE TABLE` use `IF NOT EXISTS`.
- All `CREATE INDEX` use `IF NOT EXISTS`.
- All `ADD CONSTRAINT` are wrapped in `DO ... EXCEPTION WHEN duplicate_object`.
- All `CREATE POLICY` are preceded by `DROP POLICY IF EXISTS`.
- All `CREATE TRIGGER` are preceded by `DROP TRIGGER IF EXISTS`.
- Functions use `CREATE OR REPLACE`.

Re-running the migration is a complete no-op.

---

## 9. Pipeline alignment (CLAUDE.md Master Flow)

The seven tables close gaps in stages 7 -> 12 of the 13-stage Master Flow:

```
... Procurement -> Inventory -> Execution -> Delivery -> Invoice -> Payment -> Closure
                                              (goods_receipts) (ap_invoices_full + lines) (payments + allocations) (gl_journal_entries via triggers)
```

Specifically wires:
- **Procurement -> Invoice**: `ap_invoices_full.po_id` + `grn_id` + `match_status` -> 3-way match (PO / GRN / Invoice).
- **Invoice -> Payment**: `payment_allocations` resolves the N:M, supports partial payments and credit notes.
- **Payment -> Closure**: GL trigger posts double-entry the moment a payment clears.
- **Compliance**: `withholding_certificates` tracks IL niku-bemakor; `withholding_amount` flows from invoice -> payment -> GL.

---

## 10. Compatibility notes

- **Schema**: all in `public` (matches the existing `gl_journal_entries`, `gl_journal_lines`, `ar_invoices`, `proc_*` namespacing).
- **vs `procurement.goods_receipts` (00047)**: that table lives in the `procurement` schema with `bigserial` PKs and supplier-side metadata. The new `public.goods_receipts` is the system-wide GRN ledger with UUID PKs and tenant_id FK. They coexist; a future view can union them if needed.
- **vs `public.invoices` (legacy)**: that table is currently AR/AP-mixed. New AP rows go to `ap_invoices_full`. Legacy `invoices` retained read-only.

---

## 11. Verification queries (run post-migration)

```sql
-- 1. All 7 tables exist
SELECT tablename FROM pg_tables WHERE schemaname='public'
  AND tablename IN ('goods_receipts','grn_lines','ap_invoices_full',
                    'ap_invoice_lines','payments','payment_allocations',
                    'withholding_certificates')
ORDER BY tablename;
-- expect: 7 rows

-- 2. RLS enabled on all 7
SELECT relname, relrowsecurity FROM pg_class
 WHERE relname IN ('goods_receipts','grn_lines','ap_invoices_full',
                   'ap_invoice_lines','payments','payment_allocations',
                   'withholding_certificates');
-- expect: relrowsecurity = true on all rows

-- 3. tenant_id NOT NULL on all 7
SELECT table_name, column_name, is_nullable FROM information_schema.columns
 WHERE table_schema='public' AND column_name='tenant_id'
   AND table_name IN ('goods_receipts','grn_lines','ap_invoices_full',
                      'ap_invoice_lines','payments','payment_allocations',
                      'withholding_certificates');
-- expect: is_nullable = NO on all 7

-- 4. GL triggers exist
SELECT tgname FROM pg_trigger
 WHERE tgname IN ('trg_apinv_post_gl','trg_pmt_post_gl','trg_alloc_recalc');
-- expect: 3 rows

-- 5. Index count >= 36
SELECT count(*) FROM pg_indexes WHERE schemaname='public'
   AND tablename IN ('goods_receipts','grn_lines','ap_invoices_full',
                     'ap_invoice_lines','payments','payment_allocations',
                     'withholding_certificates');
-- expect: >= 36 + 7 PK indexes
```

---

## 12. Files

| Path | Lines | Purpose |
|------|------|---------|
| `supabase/migrations/00085_grn_ap_payment.sql` | 608 | The migration |
| `_qa-reports-25/AGENT-247-grn-ap-payment-ddl.md` | this file | Audit trail |

## 13. Status

**COMPLETE**. Migration is idempotent, tenant-safe, RLS-enabled, FK-indexed, with double-entry GL posting triggers. Ready for `supabase db push`.
