# AGENT-FIX-SEED — Demo Seed Data Applied

**Date:** 2026-04-29
**Agent:** Demo seed builder
**Migration:** `supabase/migrations/00089_demo_seed_data.sql`
**Lines:** 467 (under 500 line cap)
**Idempotent:** Yes — every INSERT uses `ON CONFLICT DO NOTHING` or `NOT EXISTS`.

---

## Scope

Realistic Israeli ERP demo seed for **Techno-Kol Uzi Ltd** (gates / railings /
pergolas) so 360 pages render with live data end-to-end across the Q2C and
P2P flows.

---

## What was seeded

| # | Group                  | Count | Schema / Table                                                |
|---|------------------------|-------|---------------------------------------------------------------|
| 1 | Tenant / Employer      | 1     | `public.tenants` (conditional, DO block) + `workforce.employers` |
| 2 | Customers              | 5     | `commercial.customers` (Hebrew + English, IL ת.ז./ח.פ.)       |
| 3 | Suppliers              | 5     | `procurement.suppliers` (steel, paint, fasteners, electronics, transport) |
| 4 | Material categories    | 3     | `inventory.material_categories` (gates, railings, pergolas)   |
| 5 | Products               | 10    | `inventory.materials` (gates, railings, pergolas with sizes)  |
| 6 | Employees              | 3     | `workforce.employees` (foreman, sales mgr, lead installer + IL ת.ז.) |
| 7 | Quote-to-Cash chain    | 2 each | `commercial.quotes` -> `execution.projects` -> `execution.work_orders` -> `finance.invoices` (with lines) |
| 8 | Procure-to-Pay chain   | 2 each | `procurement.rfqs` -> `procurement.purchase_orders` -> `inventory.inventory_receipts` (GRN) |
| 9 | Bank account           | 1     | `treasury.bank_accounts` (Bank Leumi, Ramat Gan)              |
|10 | Journal entries        | 12    | `finance.gl_transactions` (revenue, expense, VAT 18% input/output) |
|11 | VAT records            | 2     | `finance.vat_records` (period 2026-04, output VAT)            |

---

## Customers (5)

| # | Number          | Name                                              | Type     | ID/Tax     | City     |
|---|-----------------|---------------------------------------------------|----------|------------|----------|
| 1 | CUST-2026-001   | משפחת כהן - וילה הרצליה                          | private  | 123456789  | הרצליה   |
| 2 | CUST-2026-002   | Aviv Construction Ltd                             | business | 512345670  | Tel Aviv |
| 3 | CUST-2026-003   | בית ספר תיכון רעננה                              | public   | 500003003  | רעננה    |
| 4 | CUST-2026-004   | Mediterranean Hotel Group Ltd                     | business | 514004004  | Haifa    |
| 5 | CUST-2026-005   | משפחת לוי - קוטג' מודיעין                        | private  | 987654321  | מודיעין  |

All 9-digit IL IDs are clearly fake fillers (1-2-3 / 5-1-x sequences).

---

## Suppliers (5)

| # | Number          | Name (HE/EN)                | Category       | Tax ID    |
|---|-----------------|-----------------------------|----------------|-----------|
| 1 | SUP-2026-001    | פלדה מתכת ישראל בע"מ       | raw_materials  | 510101001 |
| 2 | SUP-2026-002    | ColorTech Paints Ltd        | finishing      | 512020002 |
| 3 | SUP-2026-003    | מהדקים בורגים בע"מ         | fasteners      | 513030003 |
| 4 | SUP-2026-004    | SmartGate Electronics Ltd   | electronics    | 514040004 |
| 5 | SUP-2026-005    | הובלות גליל בע"מ            | transport      | 515050005 |

---

## Products (10)

Gates (4): sliding 2m, sliding 3m, double-leaf 1.8m, pedestrian.
Railings (3): glass 1m, stainless 1m, aluminum 1.1m.
Pergolas (3): aluminum 3x4m, aluminum 4x6m, louvered 3m.

---

## Q2C chain — full flow

* **Q-2026-0001** (Cohen, ₪14,750 incl VAT) -> **PRJ-2026-0001** ->
  **WO-2026-0001** -> **INV-2026-0001** with two invoice lines (gate + glass railing).
* **Q-2026-0002** (Aviv, ₪56,640 incl VAT) -> **PRJ-2026-0002** ->
  **WO-2026-0002** -> **INV-2026-0002** with three invoice lines
  (pergola 4x6 + louvered 3m + 10m stainless rail).

---

## P2P chain — full flow

* **RFQ-2026-0001** -> **PO-2026-0001** (Steel Israel, ₪21,240) ->
  **GRN-2026-0001** (steel + paint).
* **RFQ-2026-0002** -> **PO-2026-0002** (SmartGate, ₪7,670) ->
  **GRN-2026-0002** (electronics + bolts).

---

## Journal entries (12, all VAT 18%)

For each invoice (output VAT) and PO (input VAT) a balanced double-entry pair
is posted to `finance.gl_transactions`:

| Account | Description       | Type    |
|---------|-------------------|---------|
| 1100    | A/R               | Asset   |
| 1220    | VAT input 18%     | Asset   |
| 2100    | A/P               | Liab.   |
| 2210    | VAT output 18%    | Liab.   |
| 4000    | Revenue           | Income  |
| 5100    | COGS / Expense    | Expense |

Total debits = total credits per source document.

---

## Idempotency notes

* All `ON CONFLICT DO NOTHING` keys reference the natural unique columns
  (`customer_number`, `supplier_number`, `material_code`, `quote_number`, etc.).
* `treasury.bank_accounts` lacks a unique constraint - guarded with
  `WHERE NOT EXISTS` on `(account_number_masked, bank_name)`.
* `finance.vat_records` lacks a unique constraint - guarded with
  `WHERE NOT EXISTS` on `(invoice_id, tax_period, vat_type)`.
* `public.tenants` insert is wrapped in a `DO` block with
  `EXCEPTION WHEN OTHERS THEN RAISE NOTICE` so missing/diverging
  tenants schema does not abort the migration.

---

## Compatibility

* Targets the master schema (`commercial`, `procurement`, `execution`,
  `inventory`, `workforce`, `finance`, `treasury`) defined in
  `00000_master_schema.sql` and `00027_enterprise_30_tables.sql`.
* Does NOT touch the parallel `public.goods_receipts` /
  `public.ap_invoices_full` UUID-based tables from `00085_grn_ap_payment.sql` -
  those use UUIDs and require a `tenants` row + tenant context to satisfy RLS.
  The seed populates the operational graph the bigserial tables expect.

---

## Files

* **Migration:** `supabase/migrations/00089_demo_seed_data.sql` (467 lines)
* **This report:** `_qa-reports-25/AGENT-FIX-SEED-applied.md`

---

## How to apply

```bash
# Local Supabase
supabase db reset           # full rebuild including this seed
# or, against running DB:
supabase db push            # applies pending migrations
```

Re-running is safe — every statement is idempotent.
