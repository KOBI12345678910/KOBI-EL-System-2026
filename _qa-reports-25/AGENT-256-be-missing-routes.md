# AGENT-256 — Backend Missing Routes (FE → BE Gap)

**Agent:** 256 (Backend #1)
**Date:** 2026-04-29
**Scope:** All 9 Master 360 pages (Customer, Supplier, Quote, RFQ, Project, WorkOrder, PO, Finance, Employee) + 5 business workflows (Sales→Project, Project→Procurement, Procurement→Execution, Execution→Cash, Employee→Payroll) + universal entity actions.

## Method

Compared FE call sites and the canonical `ACTION_API_MAP` in `onyx-procurement/src/pipeline/wiring-spec.js` (55 action→API mappings + 7 cross-service contracts) against the actual routes registered by `app.<verb>(...)` in `onyx-procurement/server.js` and the 33 route modules under `onyx-procurement/src/**`.

**Sources:**
- FE (TSX): `onyx-procurement/src/features/{customers,suppliers,quotes,projects,workOrders,finance}/*360.tsx`, `erp-app/src/pages/workforce/Employee360.tsx`, `techno-kol-ops/client/src/features/procurement/{PO360,RFQ360}.tsx`, `erp-app/src/pages/**/*.tsx`
- Canonical contracts: `onyx-procurement/src/pipeline/wiring-spec.js` (`ACTION_API_MAP`, `CROSS_SERVICE_CONTRACTS`, `PAGE_CONTRACTS`)
- BE routes: `onyx-procurement/server.js` + 33 route files matched by `app\.(get|post|put|patch|delete)`

**Existing BE coverage (sample, ~150 routes registered):** `/api/customers (GET,POST,PUT,DELETE)`, `/api/projects (GET,POST,PUT,PATCH,DELETE)`, `/api/customer-invoices`, `/api/customer-payments`, `/api/quotes (POST)`, `/api/rfq/send`, `/api/rfq/:id/decide`, `/api/purchase-orders/:id/approve|send`, `/api/bank/*`, `/api/payroll/*`, `/api/vat/*`, `/api/orchestrator/execute`, `/api/wiring/*`, `/api/state-machines/*`, `/api/pipeline/*`.

Priority key: **P0** = blocks a 360 page or core workflow; **P1** = blocks a primary action / cross-service contract; **P2** = nice-to-have / universal.

---

## 1. 360 PAGE LOADERS (P0 — blocks page render)

| METHOD path | called from | purpose | priority |
|---|---|---|---|
| GET /api/customers/:id/360 | `Customer360.tsx:176` | Aggregate customer + contacts + quotes + projects + invoices + documents + insights + audit | P0 |
| GET /api/suppliers/:id/360 | `Supplier360.tsx:113`, `erp-app/.../suppliers/*` | Supplier + contacts + scorecards + open POs + RFQ invites | P0 |
| GET /api/quotes/:id/360 | `Quote360.tsx:99` | Quote + line_items + revisions + audit | P0 |
| GET /api/projects/:id/360 | `Project360.tsx:183` | Project + cost_plan + risks + blockers + work_orders + tasks + invoices + alerts + insights | P0 |
| GET /api/work-orders/:id/360 | `WorkOrder360.tsx:95` | WO + qa_checklists + assignments + reservations + alerts | P0 |
| GET /api/employees/:id/360 | `erp-app/.../Employee360.tsx:186` | Employee + attendance + wage_slips + assignments + expenses | P0 |
| GET /api/finance/control-room | `Finance360.tsx:80` | summary + overdue_invoices + unreconciled_payments + reconciliation_exceptions | P0 |
| GET /api/control-tower/executive | `ExecutiveControlTower.tsx:114` | summary + open_alerts + recommendations + project_risks + collection_risks | P0 |
| GET /api/po/:id/360 | `techno-kol-ops/.../PO360.tsx` (uses RPC `get_po_360_fast` instead — but per page-contract) | PO + lines + receipts + supplier_invoice + returns + documents + audit | P0 |
| GET /api/rfq/:id/360 | `RFQ360` page contract | RFQ + items + suppliers + supplier_quotes + comparison + approvals | P0 |

> Notes: BE has list/detail (`/api/customers/:id`, `/api/projects` GET) but no `/360` aggregator endpoints. Finance360 expects `/api/finance/control-room`; the only "control-room" routes implemented are `/api/control-room/{executive,finance,treasury,…}` — naming mismatch.

---

## 2. QUOTE WORKFLOW (P0)

| METHOD path | called from | purpose | priority |
|---|---|---|---|
| POST /api/quotes/:id/send | `wiring-spec ACTION_API_MAP['quote.send']`, sales→project flow step 2 | Send quote to customer (state Draft→Sent) | P0 |
| POST /api/quotes/:id/approve | `wiring-spec quote.approve`, expected by Quote360 (currently `/api/quotes/approve?quote_id=`) | Approve quote (Sent/UnderReview → Approved) | P0 |
| POST /api/quotes/:id/reject | `Quote360.tsx:115` calls `/api/quotes/reject` (no :id) | Reject quote with reason | P0 |
| POST /api/quotes/:id/convert-to-project | `wiring-spec quote.convert_to_project`; FE calls `/api/quotes/convert-to-project` (no :id) | Convert approved quote → project, copy items, link contract | P0 |
| GET /api/quotes/:id/export | `wiring-spec quote.export_pdf`, Quote360 secondary action | Generate quote PDF download | P1 |
| GET /api/quotes (list) | quote list page (canonical route `/quotes`) | List quotes with filters/pagination | P0 |
| GET /api/quotes/:id | quote detail | Single quote header (separate from /360) | P1 |
| PATCH /api/quotes/:id | quote edit page | Edit quote header / lines | P1 |
| POST /api/quotes/:id/duplicate | `quote360 secondary_actions.duplicate_quote` | Clone existing quote into new draft | P2 |

---

## 3. RFQ WORKFLOW (P0)

| METHOD path | called from | purpose | priority |
|---|---|---|---|
| POST /api/rfq/:id/send | `wiring-spec rfq.send_to_suppliers` | Send RFQ to selected suppliers | P0 |
| GET /api/rfq/:id/compare | `wiring-spec rfq.compare_quotes` | Comparison table of supplier responses | P0 |
| POST /api/rfq/:id/approve | `wiring-spec rfq.approve` (BE has `/api/rfq/:id/decide` — naming mismatch) | Approve RFQ winning supplier | P0 |
| POST /api/rfq/:id/convert-to-po | `wiring-spec rfq.convert_to_po` (FE expects POST `/api/purchase-orders` w/ `fromRfq`) | Create PO from approved RFQ | P0 |
| GET /api/rfq/:id/export-comparison | `rfq360 secondary_actions.export_comparison` | Export comparison sheet (XLSX/PDF) | P1 |
| POST /api/rfq | `rfq360.new` | Create new RFQ draft | P0 |
| PATCH /api/rfq/:id | `rfq360.edit` | Update RFQ draft items / suppliers | P1 |

---

## 4. PURCHASE ORDER WORKFLOW (P0)

| METHOD path | called from | purpose | priority |
|---|---|---|---|
| POST /api/purchase-orders | `wiring-spec rfq.convert_to_po`, `project.create_po`, `supplier.create_po` (BE has only the approve/send sub-routes; no top-level POST) | Create PO (from RFQ / project / supplier) | P0 |
| POST /api/purchase-orders/:id/receive | `wiring-spec po.receive_items`; po360 primary action `receive_items` | Record goods receipt → inventory | P0 |
| POST /api/purchase-orders/:id/close | `wiring-spec po.close`, po360 primary action `close_po` | Close PO (final state) | P0 |
| POST /api/returns | `wiring-spec po.open_return`, supplier360 primary `create_return` | Open supplier return | P1 |
| PATCH /api/purchase-orders/:id | po360.edit | Edit PO before send | P1 |

---

## 5. PROJECT WORKFLOW (P0)

| METHOD path | called from | purpose | priority |
|---|---|---|---|
| POST /api/projects/:id/create-invoice | `Project360.tsx:216`, `wiring-spec project.create_invoice`, page primary action | Create customer invoice from project | P0 |
| POST /api/projects/:id/change-state | `Project360.tsx:230` (also `wiring-spec project.change_status` PATCH `/api/projects/:id/status`) | Change project state (state machine transition) | P0 |
| POST /api/projects/:id/close | `wiring-spec project.close`, project360 primary `close_project` | Close project (terminal) | P0 |
| POST /api/inventory/reserve | `wiring-spec project.allocate_materials` & `work_order.reserve_materials` | Reserve materials for project / WO | P0 |
| POST /api/employee-assignments | `wiring-spec project.assign_employees` & `work_order.assign_worker` & `employee.assign_workorder` | Assign employee to project / WO | P0 |

---

## 6. WORK ORDER WORKFLOW (P0)

| METHOD path | called from | purpose | priority |
|---|---|---|---|
| POST /api/work-orders | `Project360.tsx:198`, `wiring-spec project.create_work_order` | Create work order (from project) | P0 |
| POST /api/work-orders/:id/complete | `WorkOrder360.tsx:102` (FE) / `wiring-spec work_order.complete` PATCH `/api/work-orders/:id/status` | Complete work order | P0 |
| PATCH /api/work-orders/:id/status | `wiring-spec work_order.start` & `work_order.complete` | State machine transitions for WO | P0 |
| POST /api/quality-checks | `wiring-spec work_order.qa_check`, wo360 primary `run_qa` | Create QA checklist run | P1 |
| POST /api/signatures | `wiring-spec work_order.signoff`, wo360 primary `signoff` | Capture signoff signature | P1 |
| GET /api/work-orders | wo list page | List WOs with filters | P1 |
| PATCH /api/work-orders/:id | wo edit page | Edit WO before start | P1 |

---

## 7. INVOICE / CASH WORKFLOW (P0)

| METHOD path | called from | purpose | priority |
|---|---|---|---|
| POST /api/invoices | `Customer360.tsx:233`, `wiring-spec customer.issue_invoice` / `po.create_invoice` / `project.create_invoice` / `supplier.register_invoice` (BE has `/api/customer-invoices` only — naming mismatch + supplier direction not covered) | Create invoice (input/output direction) | P0 |
| GET /api/invoices | invoice list page (canonical `/invoices`) | List invoices | P0 |
| GET /api/invoices/:id | invoice detail | Single invoice | P0 |
| POST /api/invoices/:id/issue | `wiring-spec invoice.issue` | Issue (Draft→Issued) | P0 |
| POST /api/invoices/:id/send | `wiring-spec invoice.send` | Email invoice to customer | P1 |
| POST /api/payments | `wiring-spec invoice.register_payment` (BE has `/api/customer-payments` only) | Register payment against invoice | P0 |
| GET /api/payments | payments list page | List payments | P1 |
| POST /api/collections | `wiring-spec invoice.move_collections`, finance360 primary `open_collection_case` | Open collections case | P1 |
| GET /api/tax-exports/:id | `wiring-spec invoice.export_tax`, finance360 primary `export_tax` | Download single tax-export bundle | P1 |

---

## 8. EMPLOYEE / PAYROLL (P0)

| METHOD path | called from | purpose | priority |
|---|---|---|---|
| GET /api/employees | employee list page | List employees | P0 |
| GET /api/employees/:id | employee detail | Single employee header | P1 |
| POST /api/employees | new employee form | Create employee | P1 |
| PATCH /api/employees/:id | employee edit | Update employee | P1 |
| POST /api/attendance | `wiring-spec employee.add_attendance`, employee360 primary | Record attendance | P0 |
| POST /api/attendance/:id/approve | `erp-app/.../attendance` calls this | Approve attendance row | P1 |
| POST /api/expenses | `wiring-spec employee.add_expense` | Record expense | P1 |
| POST /api/payroll/compute | `wiring-spec employee.calculate_payroll` (BE has `/api/payroll/wage-slips/compute`, different shape) | Compute payroll for employee/period | P0 |
| POST /api/payroll/run | `erp-app/.../payroll.tsx`, `smart-payroll.tsx` | Trigger payroll batch run | P0 |
| POST /api/payroll/assignments | `wiring-spec ops→payroll.assign_employee` | OPS posts work assignments to Payroll | P0 |
| POST /api/payroll/attendance | `wiring-spec ops→payroll.record_attendance` | OPS posts attendance batch | P0 |
| GET /api/payroll/employee-costs/:projectId | `wiring-spec ops→payroll.get_employee_costs` | Payroll returns per-project labor cost | P1 |

---

## 9. CUSTOMER / SUPPLIER / LEAD (P1)

| METHOD path | called from | purpose | priority |
|---|---|---|---|
| GET /api/leads | leads list page (canonical `/leads`) | List leads | P1 |
| POST /api/leads | new lead | Create lead | P1 |
| GET /api/leads/:id | lead detail | Single lead | P1 |
| PATCH /api/leads/:id/status | `wiring-spec lead.qualify` & `lead.mark_lost` | Move lead through pipeline | P0 |
| POST /api/customers | `wiring-spec lead.convert_to_customer` (BE has top-level POST customer but no `fromLead` semantics) | Convert lead to customer | P1 |
| POST /api/suppliers/:id/block | `erp-app/.../suppliers` | Block supplier | P1 |
| POST /api/contracts | `wiring-spec quote.generate_contract` | Generate contract from quote | P1 |
| POST /api/support-tickets | `wiring-spec customer.open_support`, customer360 secondary | Open support ticket from customer | P2 |

---

## 10. CROSS-SERVICE CONTRACTS (P1)

| METHOD path | called from | purpose | priority |
|---|---|---|---|
| GET /api/analytics/project-financials/:projectId | `CROSS_SERVICE_CONTRACTS['ops→procurement'].get_financials` | Procurement returns financials per project | P1 |
| POST /api/ops/events | `procurement→ops` (po_received / invoice_issued events) | OPS event ingest from Procurement | P1 |
| POST /api/ops/alerts | `ai→ops.send_alert` | OPS alert ingest from AI | P1 |
| POST /api/ops/recommendations | `ai→ops.send_recommendation` | OPS recommendation ingest from AI | P1 |
| POST /api/ai/analyze | `procurement→ai.analyze_spending` | AI spending analysis | P1 |
| POST /api/ai/forecast | `procurement→ai.forecast_cashflow` | AI cashflow forecast | P1 |
| POST /api/ai/anomaly | `procurement→ai.detect_anomalies` | AI anomaly detection | P1 |
| POST /api/finance/risk-signals | `ai→procurement.risk_signal` | Push risk signal into Finance | P1 |
| POST /api/pricing/recommendations | `ai→procurement.price_recommendation` | Push pricing recommendation | P1 |
| POST /api/gl/transactions | `payroll→procurement.post_payroll_costs` | Post payroll cost batch to GL | P0 |
| POST /api/bank/import-payroll | `payroll→procurement.create_bank_file` | Send payroll bank file | P1 |

---

## 11. UNIVERSAL ENTITY ACTIONS (P1)

| METHOD path | called from | purpose | priority |
|---|---|---|---|
| POST /api/tasks | `wiring-spec any.add_task`, project360 primary `add_task` | Add task on any parent entity | P1 |
| GET /api/tasks | tasks list page | List tasks | P1 |
| GET /api/tasks/:id, PATCH /api/tasks/:id | task detail / edit | CRUD task | P2 |
| POST /api/documents/upload | `wiring-spec any.add_document`, all 360 secondary `upload_document` | Upload doc with polymorphic parent | P0 |
| GET /api/documents | document list | List documents (canonical `/documents`) | P1 |
| GET /api/documents/:id | doc detail | Single doc | P2 |
| POST /api/documents/:id/sign | `canonical_routes.documents.sign` | Sign document | P2 |
| POST /api/notes | `wiring-spec any.add_note` | Add note to entity | P2 |
| POST /api/notifications | `wiring-spec any.send_notification` & `invoice.send_reminder` | Send notification (template) | P1 |

---

## 12. INVENTORY / MATERIALS (P1)

| METHOD path | called from | purpose | priority |
|---|---|---|---|
| GET /api/inventory | canonical `/inventory` | List inventory | P1 |
| POST /api/inventory/receive | canonical `/inventory/receive` | Receive stock | P1 |
| POST /api/inventory/issue | canonical `/inventory/issue` | Issue stock | P1 |
| POST /api/inventory/count | canonical `/inventory/count` | Stock count | P2 |
| GET /api/materials, POST/PATCH /api/materials | canonical material routes | CRUD materials | P1 |

---

## 13. WORKFLOW / FLOWS API (P1)

| METHOD path | called from | purpose | priority |
|---|---|---|---|
| GET /api/workflows | flows browser UI | List 5 business flows (BE has `/api/workflows` and `/api/workflows/:id` already — VERIFY filter parity per flow id like `sales_to_project`) | P1 verify |
| POST /api/workflows/:id/run | flow execution UI | Kick off a flow with starting entity | P1 |

---

## Key Naming Mismatches (ACTIONABLE — fix BE OR FE alignment)

1. **`/api/quotes/approve?quote_id=`** (FE) vs **`/api/quotes/:id/approve`** (canonical). FE Quote360.tsx:109 uses query-string form. Reconcile to RESTful `:id`.
2. **`/api/quotes/reject`** (FE Quote360:115, body `{quote_id}`) vs canonical not defined — define `/api/quotes/:id/reject`.
3. **`/api/quotes/convert-to-project`** (FE Quote360:126) vs canonical **`/api/quotes/:id/convert-to-project`**.
4. **`/api/rfq/:id/decide`** (BE existing) vs **`/api/rfq/:id/approve`** (`ACTION_API_MAP['rfq.approve']`).
5. **`/api/customer-invoices`** + **`/api/customer-payments`** (BE existing) vs unified **`/api/invoices`** + **`/api/payments`** (canonical, polymorphic by direction). Either alias or migrate.
6. **`/api/finance/control-room`** (FE Finance360:80) vs **`/api/control-room/finance`** (BE existing). Add alias.
7. **`/api/control-tower/executive`** (FE ExecutiveControlTower:114) vs **`/api/control-room/executive`** (BE existing). Add alias.
8. **`/api/payroll/wage-slips/compute`** (BE existing) vs **`/api/payroll/compute`** (canonical action `employee.calculate_payroll`).
9. **`/api/projects/:id/change-state`** (FE Project360:230) vs canonical **PATCH `/api/projects/:id/status`**. Pick one.
10. **`/api/work-orders/:id/complete`** (FE WorkOrder360:102) vs canonical **PATCH `/api/work-orders/:id/status` body=`{status:'done'}`**.

---

## Summary Counts

- **P0 (blocks 360 page or core workflow): 38 routes**
- **P1 (blocks primary actions / cross-service): 38 routes**
- **P2 (universal / nice-to-have): 9 routes**
- **Total missing: ~85 routes**
- **Naming mismatches to reconcile: 10**

## Top Build Order (P0, recommended sequence)

1. The 9 `/360` aggregator endpoints (one per master entity) — unblocks every 360 page.
2. `POST /api/invoices` (polymorphic — customer/supplier/project direction) + `GET /api/invoices` + `POST /api/payments` — unblocks Customer360, Project360, Finance360 actions.
3. `POST /api/work-orders` + `PATCH /api/work-orders/:id/status` — unblocks Project→Execution flow.
4. `POST /api/purchase-orders` (top-level create with `fromRfq`/`projectId`/`supplierId`) + `/api/purchase-orders/:id/receive` + `/close` — unblocks PO360 + Procurement→Execution.
5. Quote workflow: `:id/send`, `:id/approve` (RESTful), `:id/reject`, `:id/convert-to-project` — unblocks Quote360 + Sales→Project.
6. RFQ workflow: `:id/send`, `:id/compare`, `:id/approve` (alias of `decide`), `:id/convert-to-po`.
7. Employee/Payroll: `POST /api/attendance`, `POST /api/payroll/compute`, `POST /api/payroll/assignments`, `POST /api/employee-assignments`.
8. Universal: `POST /api/documents/upload`, `POST /api/tasks`, `POST /api/notifications`.
9. Cross-service: `POST /api/ops/events`, `POST /api/gl/transactions`, `GET /api/analytics/project-financials/:projectId`.
