# Inventory Permission Matrix (Mega Batch 00049/00050)

Generated: 2026-04-18
Scope: 18 inventory models — RLS baseline + RBAC mapping.

## 1. Role inventory

| role_code | label_he | domain scope |
|---|---|---|
| `inventory_viewer` | צופה במלאי | read-only across all 18 models |
| `warehouse_operator` | עובד מחסן | receipts/issues/transfers create; post on own docs; barcode scans |
| `warehouse_supervisor` | מנהל משמרת מחסן | post receipts/issues/transfers; reconcile small variances |
| `warehouse_manager` | מנהל מחסן | CRUD warehouses, reorder rules, full stock count lifecycle |
| `inventory_planner` | מתכנן מלאי | reorder rules, manufacturing batches, material requests approval |
| `procurement_manager` | מנהל רכש | trigger reorder rules, convert to RFQ/PO |
| `production_manager` | מנהל ייצור | manufacturing batches: consume materials, issue for WO |
| `project_manager` | מנהל פרויקט | create material requests, reservations per project |
| `compliance_officer` | קצין ציות | lot traceability, expiry audit |
| `super_admin` | מנהל מערכת | all DELETE + config |

## 2. Matrix

| Model | Viewer | WH-Op | WH-Sup | WH-Mgr | Planner | Proc-Mgr | Prod-Mgr | Proj-Mgr | Compliance | SuperAdmin |
|---|---|---|---|---|---|---|---|---|---|---|
| materials | R | R | R | CRUD | R+U | R | R | R | R | CRUD+DEL |
| material_categories | R | R | R | CRUD | R | R | R | R | R | CRUD+DEL |
| material_lots | R | R+U(qty) | CRUD | CRUD | R | R | R+U(consume) | R | R+U(flag) | CRUD+DEL |
| material_requests | R | R | R+U | CRUD | approve | R | R | CRUD+submit | R | CRUD+DEL |
| material_request_lines | R | R | R+U | CRUD | R+U | R | R | CRUD | R | CRUD+DEL |
| inventory | R | R | R+U(adjust small) | CRUD | R | R | R | R | R | CRUD+DEL |
| inventory_movements | R | R+C(pending) | post/reverse | post/reverse | R | R | post(consume) | R | R | CRUD+DEL |
| inventory_receipts | R | R+C | R+U+post | CRUD+post | R | R | R | R | R | CRUD+DEL |
| inventory_issues | R | R+C | R+U+post | CRUD+post | R | R | R+C+post | R+C | R | CRUD+DEL |
| inventory_transfers | R | R+C | R+U+execute | CRUD+execute | R | R | R | R | R | CRUD+DEL |
| inventory_reservations | R | R+C | R+U+release | CRUD | R | R | R | CRUD+release | R | CRUD+DEL |
| warehouses | R | R | R | CRUD | R | R | R | R | R | CRUD+DEL |
| barcode_scans | R | CRUD | CRUD | CRUD | R | R | CRUD | CRUD | R | CRUD+DEL |
| manufacturing_batches | R | R | R+U | R+U | R+U | R | CRUD+consume | R | R | CRUD+DEL |
| reorder_rules | R | R | R | CRUD | CRUD+trigger | trigger+R | R | R | R | CRUD+DEL |
| shortage_snapshots | R | R | R | R+C | CRUD | R | R | R | R | CRUD+DEL |
| stock_counts | R | R+C(line) | R+U(count) | CRUD+reconcile+close | R | R | R | R | R | CRUD+DEL |
| stock_count_lines | R | R+C | R+U | CRUD | R | R | R | R | R | CRUD+DEL |

Legend: R=read, C=create, U=update, D=soft-delete, CRUD=all mutations, DEL=hard delete.

## 3. RLS (row-level security) — baseline policies

Applied in 00049 Part F to all 18 tables:

- `inv_<tbl>_authenticated_read` — any authenticated user can SELECT
- `inv_<tbl>_warehouse_staff_write` — authenticated INSERT
- `inv_<tbl>_warehouse_staff_update` — authenticated UPDATE (USING + WITH CHECK)
- `inv_<tbl>_admin_delete` — authenticated DELETE (tightened in app layer to super_admin)

RBAC enforcement runs in the API layer (`authMiddleware` → role claims → route guard). DB-level RLS provides defense-in-depth for authenticated read + deny-by-default for anonymous.

## 4. Status transitions gated by role

- **material_request**: draft→submitted (any holder) → approved (planner/manager) → fulfilled (warehouse_manager) / rejected (planner/manager)
- **inventory_receipt / issue / transfer**: pending → posted/executed (warehouse_supervisor or higher)
- **stock_count**: planned → in_progress → counted → reconciled (warehouse_manager) → closed (warehouse_manager)
- **reorder_rule**: active ↔ paused (planner) / disabled (warehouse_manager)

## 5. Audit trail

Audit triggers on: `materials`, `inventory_movements`, `stock_counts`, `material_lots` (traceability set, part E of 00049).

## 6. Cross-domain links

- `inventory_receipts.po_id` → `procurement.purchase_orders` (procurement permission carries over)
- `material_requests.project_id` → `execution.projects`
- `material_requests.work_order_id` → `execution.work_orders`
- `inventory_reservations.project_id` → project manager scope

## 7. Business endpoints by role

| endpoint | minimum role |
|---|---|
| `POST /inventory/receipts/:id/post` | warehouse_supervisor |
| `POST /inventory/issues/:id/post` | warehouse_supervisor |
| `POST /inventory/transfers/:id/execute` | warehouse_supervisor |
| `POST /inventory/reservations` (availability check) | warehouse_operator |
| `POST /stock-counts/:id/reconcile` | warehouse_manager |
| `GET /material-lots/:id/traceability` | inventory_viewer |
| `POST /reorder-rules/trigger` | inventory_planner |
| `POST /material-requests/:id/approve` | inventory_planner |
| `POST /material-requests/:id/fulfill` | warehouse_manager |
| `POST /barcode-scans` | warehouse_operator |
| `POST /manufacturing-batches/:id/consume-materials` | production_manager |
