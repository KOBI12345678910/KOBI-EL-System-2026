# DOMAIN — inventory

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Canonical schema | `inventory` |
| Evidence | `B-E013` `B-E015` `B-E016` DISCOVERY §B §D |

## 1. domain_checklist

### expected_models (18)
materials, material_categories, material_lots (canonical for batch_lots), material_requests, material_request_lines, inventory, inventory_movements (canonical for stock_movements), inventory_receipts, inventory_issues, inventory_transfers, inventory_reservations, barcode_scans, manufacturing_batches, reorder_rules, shortage_snapshots, stock_counts, stock_count_lines, warehouses

### required_pages
MaterialsList, Material360, MaterialCategoriesAdmin, WarehousesList, WarehouseDetail, InventoryBalancesPage (per warehouse × SKU), MovementsJournal (all movements), ReceiptsList, IssuesList, TransfersList, ReservationsList or dialog, StockCountsList, StockCountDetail, ReorderRulesAdmin, ShortagesDashboard, BarcodeScannerPage (mobile-app)

### required_forms
NewMaterial, EditMaterial, NewMaterialRequest, ApproveMaterialRequest, NewReceipt, NewIssue, NewTransfer, NewReservation, NewStockCount, StockCountLineEditor, NewReorderRule, BarcodeInputForm

### required_routes
`/materials`, `/material/:id`, `/material-categories`, `/warehouses`, `/warehouse/:id`, `/inventory/balances`, `/inventory/movements`, `/inventory/receipts`, `/inventory/issues`, `/inventory/transfers`, `/inventory/reservations`, `/inventory/stock-counts`, `/inventory/reorder-rules`, `/inventory/shortages`, `/barcode`

### required_reports
inventory_valuation_report, stock_aging_report, stockout_risk_report, shortage_alert_report, stock_count_variance_report

### required_dashboards
InventoryHealthDashboard, ShortageRadar, WarehouseUtilization

### required_flows
- receipt → put-away → movement state machine
- reorder rule alert → RFQ trigger flow
- stock-count → adjustment flow

### critical_relations
- materials *—1 material_categories; materials 1—* material_lots
- warehouses 1—* inventory; inventory *—1 materials
- inventory_movements represents receipts/issues/transfers as types
- material_requests 1—* material_request_lines → PO lines link
- reorder_rules → auto-RFQ trigger
- stock_counts 1—* stock_count_lines

### completion_gate
- inventory_movements needs **journal page**
- material_lots needs traceability surface
- inventory_reservations must be exposed OR internal_only decision
- reorder_rules + shortage_snapshots need UI / alert decision

## 2. DISCOVERY

| layer | count |
|---|---:|
| DB tables inventory.* | 17 |
| Registry models | 1 full + 17 partial |
| API routers | 19 |
| Pages | 33 |
| Menu entries | 33 |
| Dashboards | 1 connected |
| Reports | 0 connected + 1 hidden |

## 3. GAPS

| class | items |
|---|---|
| **planned_locked** | stock_balances (alias→inventory), items (alias→materials) |
| **ghost tables (built_not_exposed)** | barcode_scans, inventory_issues, inventory_receipts, inventory_transfers, inventory_reservations, manufacturing_batches, material_lots, material_request_lines, reorder_rules, shortage_snapshots, stock_count_lines |
| **canonical aliases** | stock_movements→inventory_movements; batch_lots→material_lots; items→materials |
| **broken** | Movements Journal page missing; Reservations decision pending |

## 4. ACTIONS

| action | items |
|---|---|
| recover_now | build MovementsJournal page; decide reservations exposure |
| build_now | reorder-rule alerts surface, shortage dashboard wiring |
| internal_only | barcode_scans (mobile log), manufacturing_batches (tied to production) |
| postpone | — |
| remove_from_registry | N/A |

## 5. DEPLOYMENT

0/17 tables verified; 0 layers committed.

## 6. COVERAGE

| metric | value |
|---|---|
| completion_percent | 38 |
| business_readiness | partial |
| gate_status | blocked — movements journal + reservations decision missing |
| red rows | 8 |
