# Procurement Permission Matrix (Mega Batch 00047/00048)

Generated: 2026-04-18
Scope: 18 procurement models — RLS baseline + RBAC mapping.

## 1. Role inventory

| role_code | label_he | domain scope |
|---|---|---|
| `procurement_viewer` | צופה ברכש | read-only across all 18 models |
| `procurement_operator` | סוכן רכש | CRUD on RFQ/PO draft, goods_receipts create, contacts |
| `procurement_manager` | מנהל רכש | approvals tier1/tier2, awards, evaluations |
| `procurement_director` | סמנכ"ל רכש | approvals tier3, contract approvals, subcontractor blacklist |
| `ap_operator` | זנב הנה"ח | supplier_invoices create, match |
| `ap_manager` | מנהל זנב | invoice approvals tier1-2 |
| `finance_director` | סמנכ״ל כספים | invoice tier3, three-way-match escalations |
| `cfo` | מנכ"ל כספים | tier4 unlimited + any override |
| `compliance_officer` | קצין ציות | subcontractor risk, license monitoring |
| `super_admin` | מנהל מערכת | all DELETE + config (approval_steps) |

## 2. Matrix

| Model | Viewer | Operator | Manager | Director | AP-Op | AP-Mgr | FIN-Dir | CFO | Compliance | SuperAdmin |
|---|---|---|---|---|---|---|---|---|---|---|
| suppliers | R | R+U | R+U+C | R+U+C+D* | R | R | R | R | R+U | CRUD+DEL |
| supplier_contacts | R | CRUD | CRUD | CRUD | R | R | R | R | R | CRUD+DEL |
| rfqs | R | R+C+U(draft) | CRUD+send+award | CRUD+send+award | — | — | — | R | — | CRUD+DEL |
| rfq_lines | R | CRUD(draft) | CRUD | CRUD | — | — | — | — | — | CRUD+DEL |
| rfq_bids | R | R+C | CRUD+award | CRUD+award | — | — | — | — | — | CRUD+DEL |
| purchase_orders | R | C+U(draft) | U+approve(tier1-2) | approve(tier3)+U | R | R | approve(tier3) | approve(tier4)+any | — | CRUD+DEL |
| po_lines | R | CRUD(draft) | CRUD | CRUD | — | — | — | — | — | CRUD+DEL |
| po_receipts | R | R | R | R | R | R | R | R | — | CRUD+DEL |
| goods_receipts | R | CRUD | CRUD | CRUD | R | R | R | R | — | CRUD+DEL |
| goods_receipt_lines | R | CRUD | CRUD | CRUD | R | R | R | R | — | CRUD+DEL |
| three_way_matches | R | R+resolve(≤5K) | R+resolve+approve | R+resolve+approve | R | R+resolve | approve(>5K) | approve+override | — | CRUD+DEL |
| approval_steps | R | — | — | R | — | — | R | R | — | CRUD (config) |
| approvals | R | R+request | decide(tier1-2) | decide(tier3) | R+request | decide(tier1-2) | decide(tier3) | decide(tier4)+any | — | CRUD+DEL |
| procurement_approvals | (alias of approvals) — same matrix |
| contracts | R | R+C(draft) | R+U | approve(≤250K)+U | R | R | R | approve(>250K) | R+flag | CRUD+DEL |
| supplier_evaluations | R | R+C | CRUD+submit | CRUD+approve | — | — | — | — | R+U | CRUD+DEL |
| subcontractors | R | R+C | R+U+C | CRUD+blacklist | — | — | — | — | CRUD+blacklist | CRUD+DEL |
| supplier_invoices | R | R+C (suggest payment) | R+U+match | match+approve | CRUD | CRUD+approve(tier1-2) | approve(tier3) | approve(tier4)+override | — | CRUD+DEL |

Legend: R=read, C=create, U=update, D=soft-delete, CRUD=all mutations, DEL=hard delete, * = with super_admin second approval.

## 3. RLS (row-level security) — baseline policies

Applied to 7 NEW tables in 00047 Part E:

- `<tbl>_select_authenticated` — any authenticated user can SELECT
- `<tbl>_write_authenticated` — any authenticated user can INSERT/UPDATE (app-layer RBAC enforced on mutations)
- `<tbl>_delete_admin` — DELETE only via `service_role` or JWT claim `is_super_admin = true`

Tables: `supplier_contacts`, `goods_receipts`, `goods_receipt_lines`, `three_way_matches`, `approval_steps`, `supplier_evaluations`, `subcontractors`.

Existing tables (`suppliers`, `rfqs`, `purchase_orders`, `contracts`, `supplier_invoices`, `approvals`, `rfq_items`, `rfq_supplier_invites`, `supplier_quotes`, `supplier_quote_lines`, `purchase_order_lines`) retain their pre-existing RLS from 00001/00005/00014/00019.

## 4. Approval tier seed (from 00047 PART D)

| policy_code | tier | amount band (ILS) | role |
|---|---|---|---|
| standard_po_ils | 1 | 0–10K | procurement_operator |
| standard_po_ils | 2 | 10,001–50K | procurement_manager |
| standard_po_ils | 3 | 50,001–250K | procurement_director |
| standard_po_ils | 4 | >250K | cfo (2 approvers) |
| standard_invoice_ils | 1-4 | same bands | ap_operator / ap_manager / finance_director / cfo |
| standard_contract_ils | 1 | ≤50K | procurement_manager |
| standard_contract_ils | 2 | 50–250K | procurement_director |
| standard_contract_ils | 3 | >250K | cfo (2 approvers) |
| rfq_award | 1 | any | procurement_manager |
| twm_discrepancy | 1 | ≤5K variance | procurement_manager |
| twm_discrepancy | 2 | >5K variance | finance_director |

## 5. Business endpoints — required role

| endpoint | method | role |
|---|---|---|
| POST /rfqs/:id/send | POST | procurement_operator+ |
| POST /rfqs/:id/award/:bidId | POST | procurement_manager+ |
| POST /purchase-orders/:id/approve | POST | tier-based from approval_steps |
| POST /purchase-orders/:id/submit | POST | procurement_manager+ |
| POST /goods-receipts (with TWM trigger) | POST | procurement_operator+ |
| POST /three-way-matches/:id/resolve | POST | procurement_manager+ (≤5K) / finance_director (>5K) |
| POST /supplier-invoices/:id/approve | POST | tier-based; override_match requires cfo |
| POST /approvals/:id/decide | POST | assigned approver or higher |

## 6. Hebrew role labels (for UI)

| role_code | שם בעברית |
|---|---|
| procurement_viewer | צופה ברכש |
| procurement_operator | סוכן רכש |
| procurement_manager | מנהל רכש |
| procurement_director | סמנכ״ל רכש |
| ap_operator | פקיד זנב |
| ap_manager | מנהל זנב |
| finance_director | סמנכ״ל כספים |
| cfo | מנכ״ל כספים |
| compliance_officer | קצין ציות |
| super_admin | מנהל מערכת |
