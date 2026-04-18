# Procurement Mega Batch — Evidence Log

Generated: 2026-04-18
Scope: 18 procurement models — DB ALTERs + menu + Zod + API + pages.
Mirrors patterns from `commercial_evidence_log.md` + `00043_commercial_domain_complete.sql` + `00044_commercial_menu_wiring.sql`.

## 1. Auth middleware
- `api-server/src/middleware/auth.ts:44` — `authMiddleware(req,res,next)` (JWT from cookie or Bearer Authorization header).
- `api-server/src/middleware/auth.ts:26` — `generateToken`, `generateRefreshToken`.
- `req.userId: number | undefined` (line 18 augmentation).
- Route convention: mounts without per-route middleware in `routes/index.ts`; individual routers export default `Router()`.
- Existing suppliers router at `api-server/src/routes/suppliers.ts` is a plain Express CRUD against a public `suppliers` table (NOT `procurement.suppliers`) — we build the NEW `procurement/*` routes against the canonical `procurement.*` schema.

## 2. DB client convention
- `@workspace/db` exposes `pool` (node-postgres `Pool`) — `pool.query(text, params)`.
- All `procurement.*` tables use `bigserial` PK + `bigint` FKs.
- `governance.users_profile(id)` → user FK.
- `governance.set_updated_at()` → shared updated_at trigger function.
- `governance.generate_public_id()` → default `public_id uuid`.
- Existing update triggers seen in 00000 at lines 2131-2140 for suppliers, rfqs, purchase_orders.

## 3. Procurement schema — existing tables (from 00000_master_schema.sql)

| Table | Key Columns | Line |
|---|---|---|
| `procurement.suppliers` | id, public_id, supplier_number, legal_name, display_name, supplier_category, tax_id, phone, email, website, address_line_1/2, city, region, postal_code, country, primary_contact_*, payment_terms, delivery_terms, preferred_currency, status, risk_level, performance_score, preferred_supplier, internal_notes, audit, deleted_at | 537 |
| `procurement.rfqs` | id, public_id, rfq_number, project_id, material_request_id, requested_date, response_deadline, comparison_status, approval_status, state, winning_supplier_id, internal_notes, audit | 572 |
| `procurement.rfq_items` (canonical rfq_lines) | id, rfq_id, line_number, material_id, requested_code, description, quantity, unit_of_measure, target_delivery_date, technical_spec, audit | 591 |
| `procurement.rfq_supplier_invites` | id, rfq_id, supplier_id, invited_at, response_status, responded_at, notes | 607 |
| `procurement.supplier_quotes` | id, public_id, rfq_id, supplier_id, quote_reference, quote_date, valid_until, subtotal, vat_total, grand_total, currency, delivery_days_estimate, payment_terms, quality_score, selected, state, notes, audit | 618 |
| `procurement.supplier_quote_lines` (canonical rfq_bids) | id, supplier_quote_id, rfq_item_id, line_number, material_id, description, quantity, unit_price, line_subtotal, vat_percent, vat_amount, line_total, delivery_days, notes, audit | 640 |
| `procurement.approvals` (canonical procurement_approvals) | id, public_id, entity_type, entity_id, approval_type, requested_by_user_id, assigned_approver_user_id, state, requested_at, acted_at, decision, comments, approval_policy_code, audit | 659 |
| `procurement.contracts` | id, public_id, contract_number, contract_type, customer_id, supplier_id, quote_id, po_id, project_id, effective_date, expiry_date, contract_value, currency, state, signed_at, audit | 677 |
| `procurement.purchase_orders` | id, public_id, po_number, supplier_id, project_id, rfq_id, contract_id, order_date, expected_delivery_date, currency, subtotal, discount_total, vat_total, grand_total, approval_status, receiving_status, payment_status, state, delivery_address, internal_notes, supplier_notes, audit | 697 |
| `procurement.purchase_order_lines` (canonical po_lines) | id, po_id, line_number, material_id, supplier_quote_line_id, description, quantity_ordered, quantity_received, quantity_open, unit_of_measure, unit_price, discount_percent, line_subtotal, vat_percent, vat_amount, line_total, delivery_date, audit | 725 |
| `procurement.supplier_invoices` | id, public_id, supplier_invoice_number, supplier_id, po_id, invoice_date, due_date, subtotal, vat_total, grand_total, currency, state, matched_po, approved_for_payment, audit | 748 |
| `procurement.returns` | id, public_id, return_number, supplier_id, po_id, reason_code, return_date, state, notes, audit | 767 |
| `procurement.warranty_cases` | id, public_id, warranty_number, supplier_id, customer_id, po_id, project_id, issue_date, description, state, resolution_notes, resolved_at, audit | 781 |
| `procurement.supplier_portal_accounts` | id, public_id, supplier_id, ... | 1790 |

## 4. MISSING tables — to CREATE in 00047

Per D014 / `_master-registry/domains/procurement.md`:
- `procurement.supplier_contacts` — supplier contact book (multi-contact per supplier)
- `procurement.goods_receipts` — PO receipt headers
- `procurement.goods_receipt_lines` — GR line items
- `procurement.three_way_matches` — PO vs GR vs Invoice reconciliation
- `procurement.approval_steps` — multi-tier approval step sequence
- `procurement.supplier_evaluations` — scorecards
- `procurement.subcontractors` — subcontractor registry
- `procurement.po_receipts` — alias view mapping onto goods_receipts

## 5. Status lifecycles (from D014)
- `rfq.state` : draft → sent → responded → awarded → cancelled
- `purchase_order.state` : draft → pending_approval → approved → submitted → partially_received → fully_received → invoiced → paid → closed
- `three_way_match.state` : pending → matched → discrepancy → resolved
- `supplier_invoice.state` : draft → received → matched → approved → paid → closed
- `contract.state` : draft → active → expiring → expired → renewed → cancelled

## 6. Approval tiers baseline (to seed into `approval_steps`)
- tier1: amounts ≤ 10,000 ILS — operator
- tier2: 10,001 – 50,000 ILS — manager
- tier3: 50,001 – 250,000 ILS — director
- tier4: > 250,000 ILS — executive (CFO/CEO)

## 7. Zod convention
- `lib-client/api-zod/src/commercial/lead-sources.ts` shows pattern: const arrays, `z.enum`, `CreateXSchema`, `UpdateXSchema` = `.partial()`, `ReadXSchema` with full row shape, `ListXQuerySchema` with `q`, `limit`, `offset`, `order_by`, `order_dir`.
- Exports `{ Create, Update, Read, Query, + channel/type enums }`.

## 8. Express router pattern (from `api-server/src/routes/suppliers.ts`)
- `Router()` → `router.get/post/put/delete`.
- `pool.query(sql, params)` with positional `$1, $2`.
- Response shapes: plain JSON, 404 `{ error: 'לא נמצא' }`, 400 `{ message }`.
- Mounted in `api-server/src/routes/index.ts` via `router.use(suppliersRouter)` (~L149).
- Aggregator pattern for sub-folders: `router.use('/supplier-intelligence', supplierIntelligenceRouter)` (~L841).

## 9. Page pattern (from `erp-app/src/pages/sales/opportunities.tsx`, `erp-app/src/pages/commercial/*`)
- Imports: `@tanstack/react-query`, `authFetch` from `@/lib/utils`, shadcn/ui components (`Card`, `Button`, `Input`, `Table`, `Dialog`), `lucide-react`, `useLocation` from `wouter`.
- `dir="rtl"` on root, Hebrew labels, pagination, search box, status badges, row actions, permission guards via `useHasPermission` or `usePermissions` hook.

## 10. App.tsx additions
- 2602 lines, already has lazy loaders for 629 routes. Append-only: add NEW lazy imports for 14 procurement 360/pages at the end of lazy block, add NEW `<Route path="..." component={...} />` inside the main `<Switch>`.
- Existing `./pages/procurement/*` holds 40+ legacy pages (po-approvals, procurement-analytics, suppliers-management, rfq-management, three-way-matching, vendor-evaluation, etc.) — we DO NOT touch those. New pages go under `./pages/procurement/v2/` to avoid name collisions.

## 11. Menu wiring (from 00044)
- Category lookup by `public.app_menu.id`.
- Guard with `if not exists (select 1 from public.app_menu where route = '...')` per INSERT.
- We create/locate category "רכש וספקים" by name (if not present, fall back to catch-all parent id = 3 based on 00041 categorization).
- Reset sequence at end.

## 12. RLS convention
- RLS deliberately added in separate dedicated migrations (00001 / 00005 / 00014 / 00019).
- For this build, we enable RLS on NEW tables only, and attach 3 baseline policies per table (authenticated SELECT, UPDATE/INSERT via permission function, DELETE by super_admin only).

## 13. Final status
Evidence gathering complete — proceeding to 00047 + 00048 + Zod + API + pages + ledger.
