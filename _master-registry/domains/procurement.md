# DOMAIN — procurement

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Canonical schema | `procurement` |
| Evidence | `B-E013` `B-E015` DISCOVERY §A §B |

## 1. domain_checklist

### expected_models (18)
suppliers, supplier_contacts, rfqs, rfq_lines(alias→rfq_items), rfq_bids(alias→supplier_quote_lines), purchase_orders, po_lines(alias→purchase_order_lines), po_receipts(alias→goods_receipts), goods_receipts, goods_receipt_lines, three_way_matches, approval_steps, approvals, contracts, supplier_evaluations, subcontractors, supplier_invoices, procurement_approvals(alias→approvals)

### required_pages
SuppliersList, Supplier360, RFQList, RFQ360, PurchaseOrdersList, PO360, GoodsReceiptsList, GR360, ContractsList, ContractDetail, ThreeWayMatchQueue, SupplierInvoicesList, SupplierEvaluationDashboard

### required_forms
NewSupplier, NewRFQ, RFQLinesEditor, InviteSuppliersDialog, NewPO, POLinesEditor, NewGR, RunThreeWayMatch, NewContract, NewApproval, ApprovalDecisionForm, LogSupplierInvoice

### required_routes
`/suppliers`, `/supplier/:id`, `/rfqs`, `/rfq/:id`, `/purchase-orders`, `/purchase-order/:id`, `/goods-receipts`, `/goods-receipt/:id`, `/contracts`, `/contract/:id`, `/approvals`, `/three-way-match`, `/supplier-invoices`

### required_reports
supplier_spend_report, supplier_scorecard_report, po_cycle_time_report, contract_renewal_report, three_way_match_exception_report, supplier_invoice_aging_report

### required_dashboards
ProcurementControlRoom, SupplierScorecardDashboard, SpendByCategoryDashboard, ContractRenewalDashboard

### required_flows
- procure_to_pay (flow_4)
- RFQ → quote comparison → PO → GR → supplier_invoice → payment
- three_way_match workflow

### critical_relations
- suppliers 1—* supplier_contacts; suppliers 1—* rfqs; suppliers 1—* purchase_orders; suppliers 1—* contracts; suppliers 1—* supplier_scorecards
- rfqs 1—* rfq_items; rfqs 1—* rfq_supplier_invites; rfqs 1—* supplier_quotes; supplier_quotes 1—* supplier_quote_lines
- purchase_orders 1—* purchase_order_lines; purchase_orders 1—* goods_receipts; purchase_orders 1—* supplier_invoices
- contracts 1—* contract_milestones
- approvals 1—* approval_steps

### completion_gate
- PO needs `purchase_order_lines` surface
- RFQ needs `rfq_items` editor
- three_way_matches needs a real queue (currently missing)
- supplier_invoices needs API + page + permissions

## 2. DISCOVERY

| layer | count |
|---|---:|
| DB tables procurement.* | 20 |
| Registry models | 3 full + 15 partial |
| API routers | 24 |
| Pages | 52 |
| Menu entries | 47 |
| Dashboards | 1 full + 2 partial |
| Reports | 1 full + 2 hidden |
| Flows | 1 (procure_to_pay) |

## 3. GAPS

| class | items |
|---|---|
| **planned_locked** | supplier_price_lists, purchase_requests, three_way_matches(alias/canonical), supplier_evaluations, subcontractors |
| **wrong-schema** | approvals (registry says sales → canonical procurement) |
| **ghost tables** | approval_steps, contract_milestones, rfq_comparison_snapshots, rfq_supplier_invites, supplier_scorecards, warranty_cases, supplier_invoices, supplier_portal_accounts |
| **broken** | PO360 missing lines surface; RFQ360 missing editor |

## 4. ACTIONS

| action | items |
|---|---|
| recover_now | fix approvals registry; expose po_lines + rfq_items editors |
| build_now (Phase 7) | purchase_requests, supplier_price_lists, three_way_match queue, supplier_evaluations |
| internal_only | rfq_comparison_snapshots (analytic), rfq_supplier_invites (embedded) |
| postpone | supplier_portal (Phase 14) |
| remove_from_registry | N/A per ZERO LOSS |

## 5. DEPLOYMENT

0/20 tables verified; 0 layers committed — pending.

## 6. COVERAGE

| metric | value |
|---|---|
| completion_percent | 55 |
| business_readiness | partial |
| gate_status | blocked — supplier_invoices chain + three_way_match queue missing |
| red rows | 6 |
