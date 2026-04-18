# Invisible Menu Items — Full Forensic Scan
Generated: 2026-04-18T09:26:08.739500Z
Repository: C:\Users\kobi\Projects\techno-kol-uzi-2026

## Executive Summary

- **total_invisible_items**: 779
  - **MODEL** (DB tables): 101 invisible / 187 user-facing tables
  - **ENGINE** (API route groups): 223 / 328 total
  - **PAGE** (React page components): 455 / 1164 total
  - **EDGE-FUNCTION**: 45 Supabase functions, all are back-end handlers with no direct menu entry
  - **REPORT**: 14 of 20 registry reports invisible (70%)
  - **DASHBOARD**: 10 of 10 registry dashboards lack exact canonical-name menu entry
  - **WORKFLOW**: 5 of 5 pipeline flows have no menu entry
  - **STATE MACHINE**: 13 of 13 state machines have no configurable menu page

- **by_priority** (DB tables): high=47, medium=36, low=18
- **menu_currently_has**: 1,271 unique routes across 291 top-level URL prefixes (7 menu migrations)
- **coverage_percentage**:
  - DB tables with menu presence: **46%** (86/187)
  - API engines with menu presence: **32%** (105/328)
  - Pages wired to menu: **61%** (709/1164)

## The Answer

The Techno-Kol Uzi ERP 2026 menu exposes about **46% of DB tables**, **32% of API engines**, and **61% of React pages**. Roughly **779 concrete artifacts** exist in the codebase with no corresponding navigation entry. The biggest gaps are:

1. **Line-item children** of parent entities (quote_lines, purchase_order_lines, rfq_items, invoice_lines, payroll_entries, work_order_tasks, project_phases) — these feed the 360 pages but have no standalone management views.
2. **Finance sub-ledgers** (dunning, collections, reconciliation exceptions, tax_records, vat_records, consolidation_entries, budget/cashflow entries).
3. **223 API engine modules** without UI — including 36+ AI/automation engines (ai-autonomous-agent, digital-twin, process-mining, knowledge-graph, predictive-analytics-engine, risk-monte-carlo-engine, whatsapp-ai-engine, vector-search, etc.).
4. **Governance tables** (permissions, role_permissions, object_permissions, integration_connections, escalation_rules, saved_filters) — admin surfaces almost entirely missing.
5. **Analytics schema (0% coverage)** — the whole dashboard_definitions / kpi_snapshots / user_dashboard_boards layer has no management page.
6. **Docs/Documents schemas (12–17%)** — OCR, classification, extraction, signature, version history all invisible.

## Top-level Menu Category Coverage (top 20 prefixes)

| Rank | Prefix | Routes | Note |
|-----:|--------|-------:|------|
| 1 | `/finance` | 60 | good coverage but 42% of finance tables still invisible |
| 2 | `/procurement` | 52 | solid; supplier_invoices/rfq_items/approval_steps missing |
| 3 | `/hr` | 47 | workforce 59% covered; payroll_runs/entries missing |
| 4 | `/documents` | 40 | docs schema only 12% covered |
| 5 | `/production` | 38 | 31 production pages invisible |
| 6 | `/ai-engine` | 36 | most AI engine .ts files have no UI entry |
| 7 | `/inventory` | 33 | 50% of inventory tables invisible |
| 8 | `/projects` | 29 | phases/cost_plans/task_dependencies missing |
| 9 | `/sales` | 27 | quote_lines/revisions/approval_rules missing |
| 10 | `/reports` | 25 | 14 of 20 registry reports not in menu |
| 11 | `/fabrication` | 25 |  |
| 12 | `/logistics` | 23 |  |
| 13 | `/installation` | 22 |  |
| 14 | `/crm` | 20 | 46 CRM pages missing menu entry |
| 15 | `/pricing` | 19 | pricing.calculations invisible |
| 16 | `/customer` | 18 |  |
| 17 | `/ops` | 18 |  |
| 18 | `/supply-chain` | 17 |  |
| 19 | `/integrations` | 17 | integration_connections/sync_logs invisible |
| 20 | `/quality` | 16 | defects/inspection_runs invisible |

## Domain Coverage Report (15 key domains)

### 1. Dashboards / Analytics
**Domain:** `analytics`  
**Note:** All 10 registry dashboards appear under various menu paths (/dashboard, /hr/hr-dashboard, /fin/fin-dashboard) but the catalog itself (which dashboards exist, who owns them, permissions) has no management page. The entire `analytics` schema is invisible.

**Invisible items:**
- `analytics.dashboard_definitions`
- `analytics.dashboard_boards`
- `analytics.dashboard_widgets`
- `analytics.dashboard_board_widgets`
- `analytics.user_dashboard_boards`
- `analytics.kpi_snapshots`

### 2. CRM / Commercial
**Domain:** `commercial`  
**Note:** Parent entities covered. Line-level editing, quote versioning, approval-rule configuration, portal-account admin, pricing-snapshot audit missing.

**Invisible items:**
- `commercial.quote_lines`
- `commercial.quote_revisions`
- `commercial.quote_approval_rules`
- `commercial.customer_contacts`
- `commercial.customer_portal_accounts`
- `commercial.pricing_snapshots`
- `commercial.crm_activities`

### 3. Sales / Quotes
**Domain:** `sales`  
**Note:** Line items editor, revision history viewer, approval rule configuration screens are invisible.

**Invisible items:**
- `commercial.quote_lines`
- `commercial.quote_revisions`
- `commercial.quote_approval_rules`

### 4. Procurement
**Domain:** `procurement`  
**Note:** Supplier invoice book, RFQ item grid, supplier-quote comparison, approval-step audit, contract milestones all invisible.

**Invisible items:**
- `procurement.purchase_order_lines`
- `procurement.rfq_items`
- `procurement.supplier_quotes`
- `procurement.supplier_quote_lines`
- `procurement.supplier_invoices`
- `procurement.approval_steps`
- `procurement.contract_milestones`
- `procurement.rfq_comparison_snapshots`

### 5. Inventory / Warehouse
**Domain:** `inventory`  
**Note:** Movement log, goods-receipt journal, issue journal, transfer console, reservation manager, lot traceability, shortage dashboard — all missing as list pages.

**Invisible items:**
- `inventory.inventory_movements`
- `inventory.inventory_receipts`
- `inventory.inventory_issues`
- `inventory.inventory_transfers`
- `inventory.inventory_reservations`
- `inventory.material_lots`
- `inventory.material_request_lines`
- `inventory.shortage_snapshots`
- `inventory.stock_count_lines`

### 6. Execution / Projects / Work Orders
**Domain:** `execution`  
**Note:** WO sub-task grid, QA checklist manager, project phase editor, task-dependency Gantt, delivery-event timeline, installation-event log — all missing.

**Invisible items:**
- `execution.work_order_tasks`
- `execution.work_order_qa_checklists`
- `execution.work_order_qa_items`
- `execution.project_phases`
- `execution.project_cost_plans`
- `execution.task_dependencies`
- `execution.task_attachments`
- `execution.task_comments`
- `execution.delivery_events`
- `execution.installation_events`
- `execution.alerts`

### 7. Finance / Treasury / GL
**Domain:** `finance`  
**Note:** Collections console, dunning builder, consolidation entries, payment-allocation explorer, reconciliation-exception queue, tax/VAT record ledgers — all invisible. Menu has /finance/collections-dashboard but no list/detail.

**Invisible items:**
- `finance.budget_entries`
- `finance.cashflow_entries`
- `finance.collection_actions`
- `finance.collection_cases`
- `finance.consolidation_entries`
- `finance.costing_entries`
- `finance.dunning_campaigns`
- `finance.dunning_steps`
- `finance.invoice_lines`
- `finance.payment_allocations`
- `finance.reconciliation_exceptions`
- `finance.reminder_schedules`
- `finance.tax_records`
- `finance.vat_records`

### 8. Workforce / Payroll
**Domain:** `workforce`  
**Note:** Payroll run viewer, per-employee pay-component editor, leave-request inbox, assignments Gantt, exception queue all invisible.

**Invisible items:**
- `workforce.payroll_runs`
- `workforce.payroll_entries`
- `workforce.payroll_exceptions`
- `workforce.payroll_export_batches`
- `workforce.leave_requests`
- `workforce.workforce_assignments`
- `workforce.employee_pay_components`

### 9. Documents / DMS / OCR
**Domain:** `docs + documents`  
**Note:** 12 of 14 docs/documents tables have no list/detail page. OCR results browser, signature request queue, version history, extraction runs console all invisible.

**Invisible items:**
- `docs.attachments`
- `docs.document_classifications`
- `docs.document_signature_requests`
- `docs.document_versions`
- `docs.ocr_results`
- `docs.print_jobs`
- `docs.scan_sessions`
- `documents.classification_runs`
- `documents.entity_extractions`
- `documents.extraction_runs`
- `documents.ocr_runs`
- `documents.document_relations`

### 10. Analytics / KPIs / Reports
**Domain:** `analytics`  
**Note:** Entire schema (6 tables) has 0% menu coverage by canonical name. KPI definition catalog, dashboard board admin missing.

**Invisible items:**
- `analytics.dashboard_board_widgets`
- `analytics.dashboard_boards`
- `analytics.dashboard_definitions`
- `analytics.dashboard_widgets`
- `analytics.kpi_snapshots`
- `analytics.user_dashboard_boards`

### 11. Intelligence / AI
**Domain:** `intelligence`  
**Note:** Broad AI coverage via /ai-engine/* but feedback-loop tables invisible. 36+ AI engine .ts files have no UI entry.

**Invisible items:**
- `intelligence.anomaly_feedback`
- `intelligence.recommendation_feedback`

### 12. Governance / Security
**Domain:** `governance`  
**Note:** Permissions matrix, role-permission mapping, object ACL admin, saved filters library, config entry editor, escalation rules, integration-connection manager — all invisible.

**Invisible items:**
- `governance.permissions`
- `governance.role_permissions`
- `governance.object_permissions`
- `governance.users_profile`
- `governance.saved_filters`
- `governance.config_entries`
- `governance.alert_subscriptions`
- `governance.escalation_rules`
- `governance.integration_connections`
- `governance.integration_sync_logs`

### 13. Communications
**Domain:** `comms`  
**Note:** Unified threads view, per-channel message archives, support-ticket list, SLA dashboard all missing.

**Invisible items:**
- `comms.comms_threads`
- `comms.email_messages`
- `comms.sms_messages`
- `comms.whatsapp_messages`
- `comms.support_tickets`
- `comms.support_sla_tracking`

### 14. Orchestration / Workflow
**Domain:** `orchestration`  
**Note:** Workflow catalog, job-queue monitor, step-definitions editor invisible. Menu has /workflow/engine generic page only.

**Invisible items:**
- `orchestration.workflow_definitions`
- `orchestration.job_queue`
- `orchestration.workflow_steps`

### 15. Quality / Service
**Domain:** `quality + service`  
**Note:** Defect log, inspection-run history, ticket-comment thread views invisible.

**Invisible items:**
- `quality.defects`
- `quality.inspection_runs`
- `service.ticket_comments`

## Type-Based Lists

### A. Invisible MODELS (DB tables) — high priority first

Total: **101** tables invisible after excluding 43 internal/plumbing tables.

| Table | Schema | Priority | Suggested Route | Suggested Category |
|-------|--------|---------|-----------------|--------------------|
| `commercial.customer_contacts` | `commercial` | high | `/customer-contacts` | מכירות ולקוחות |
| `commercial.customer_portal_accounts` | `commercial` | high | `/customer-portal-accounts` | מכירות ולקוחות |
| `commercial.quote_approval_rules` | `commercial` | high | `/quote-approval-rules` | מכירות ולקוחות |
| `commercial.quote_lines` | `commercial` | high | `/quote-lines` | מכירות ולקוחות |
| `commercial.quote_revisions` | `commercial` | high | `/quote-revisions` | מכירות ולקוחות |
| `comms.support_sla_tracking` | `comms` | high | `/support-sla-tracking` | תקשורת |
| `comms.support_tickets` | `comms` | high | `/support-tickets` | תקשורת |
| `execution.delivery_events` | `execution` | high | `/delivery-events` | פרויקטים וביצוע |
| `execution.installation_events` | `execution` | high | `/installation-events` | פרויקטים וביצוע |
| `execution.project_cost_plans` | `execution` | high | `/project-cost-plans` | פרויקטים וביצוע |
| `execution.project_phases` | `execution` | high | `/project-phases` | פרויקטים וביצוע |
| `execution.task_dependencies` | `execution` | high | `/task-dependencies` | פרויקטים וביצוע |
| `execution.work_order_qa_checklists` | `execution` | high | `/work-order-qa-checklists` | פרויקטים וביצוע |
| `execution.work_order_qa_items` | `execution` | high | `/work-order-qa-items` | פרויקטים וביצוע |
| `execution.work_order_tasks` | `execution` | high | `/work-order-tasks` | פרויקטים וביצוע |
| `finance.budget_entries` | `finance` | high | `/budget-entries` | כספים |
| `finance.cashflow_entries` | `finance` | high | `/cashflow-entries` | כספים |
| `finance.collection_actions` | `finance` | high | `/collection-actions` | כספים |
| `finance.collection_cases` | `finance` | high | `/collection-cases` | כספים |
| `finance.dunning_campaigns` | `finance` | high | `/dunning-campaigns` | כספים |
| `finance.invoice_lines` | `finance` | high | `/invoice-lines` | כספים |
| `finance.payment_allocations` | `finance` | high | `/payment-allocations` | כספים |
| `finance.tax_records` | `finance` | high | `/tax-records` | כספים |
| `finance.vat_records` | `finance` | high | `/vat-records` | כספים |
| `inventory.inventory_issues` | `inventory` | high | `/inventory-issues` | מלאי |
| `inventory.inventory_movements` | `inventory` | high | `/inventory-movements` | מלאי |
| `inventory.inventory_receipts` | `inventory` | high | `/inventory-receipts` | מלאי |
| `inventory.inventory_reservations` | `inventory` | high | `/inventory-reservations` | מלאי |
| `inventory.inventory_transfers` | `inventory` | high | `/inventory-transfers` | מלאי |
| `inventory.material_lots` | `inventory` | high | `/material-lots` | מלאי |
| `inventory.material_request_lines` | `inventory` | high | `/material-request-lines` | מלאי |
| `inventory.shortage_snapshots` | `inventory` | high | `/shortage-snapshots` | מלאי |
| `procurement.approval_steps` | `procurement` | high | `/approval-steps` | רכש |
| `procurement.contract_milestones` | `procurement` | high | `/contract-milestones` | רכש |
| `procurement.purchase_order_lines` | `procurement` | high | `/purchase-order-lines` | רכש |
| `procurement.rfq_items` | `procurement` | high | `/rfq-items` | רכש |
| `procurement.supplier_invoices` | `procurement` | high | `/supplier-invoices` | רכש |
| `procurement.supplier_quote_lines` | `procurement` | high | `/supplier-quote-lines` | רכש |
| `procurement.supplier_quotes` | `procurement` | high | `/supplier-quotes` | רכש |
| `quality.defects` | `quality` | high | `/defects` | איכות |
| `quality.inspection_runs` | `quality` | high | `/inspection-runs` | איכות |
| `service.ticket_comments` | `service` | high | `/ticket-comments` | שירות |
| `workforce.employee_pay_components` | `workforce` | high | `/employee-pay-components` | כח אדם |
| `workforce.leave_requests` | `workforce` | high | `/leave-requests` | כח אדם |
| `workforce.payroll_entries` | `workforce` | high | `/payroll-entries` | כח אדם |
| `workforce.payroll_runs` | `workforce` | high | `/payroll-runs` | כח אדם |
| `workforce.workforce_assignments` | `workforce` | high | `/workforce-assignments` | כח אדם |
| `analytics.dashboard_definitions` | `analytics` | medium | `/dashboard-definitions` | דוחות ודשבורדים |
| `analytics.kpi_snapshots` | `analytics` | medium | `/kpi-snapshots` | דוחות ודשבורדים |
| `commercial.crm_activities` | `commercial` | medium | `/crm-activities` | מכירות ולקוחות |
| `commercial.pricing_snapshots` | `commercial` | medium | `/pricing-snapshots` | מכירות ולקוחות |
| `comms.comms_threads` | `comms` | medium | `/comms-threads` | תקשורת |
| `comms.email_messages` | `comms` | medium | `/email-messages` | תקשורת |
| `comms.sms_messages` | `comms` | medium | `/sms-messages` | תקשורת |
| `comms.whatsapp_messages` | `comms` | medium | `/whatsapp-messages` | תקשורת |
| `docs.attachments` | `docs` | medium | `/attachments` | מסמכים |
| `docs.document_classifications` | `docs` | medium | `/document-classifications` | מסמכים |
| `docs.document_signature_requests` | `docs` | medium | `/document-signature-requests` | מסמכים |
| `docs.document_versions` | `docs` | medium | `/document-versions` | מסמכים |
| `docs.ocr_results` | `docs` | medium | `/ocr-results` | מסמכים |
| `docs.print_jobs` | `docs` | medium | `/print-jobs` | מסמכים |
| `docs.scan_sessions` | `docs` | medium | `/scan-sessions` | מסמכים |
| `documents.classification_runs` | `documents` | medium | `/classification-runs` | מסמכים |
| `documents.document_relations` | `documents` | medium | `/document-relations` | מסמכים |
| `documents.entity_extractions` | `documents` | medium | `/entity-extractions` | מסמכים |
| `documents.extraction_runs` | `documents` | medium | `/extraction-runs` | מסמכים |
| `documents.ocr_runs` | `documents` | medium | `/ocr-runs` | מסמכים |
| `execution.alerts` | `execution` | medium | `/alerts` | פרויקטים וביצוע |
| `execution.task_attachments` | `execution` | medium | `/task-attachments` | פרויקטים וביצוע |
| `execution.task_comments` | `execution` | medium | `/task-comments` | פרויקטים וביצוע |
| `finance.consolidation_entries` | `finance` | medium | `/consolidation-entries` | כספים |
| `finance.costing_entries` | `finance` | medium | `/costing-entries` | כספים |
| `finance.dunning_steps` | `finance` | medium | `/dunning-steps` | כספים |
| `finance.reconciliation_exceptions` | `finance` | medium | `/reconciliation-exceptions` | כספים |
| `finance.reminder_schedules` | `finance` | medium | `/reminder-schedules` | כספים |
| `intelligence.anomaly_feedback` | `intelligence` | medium | `/anomaly-feedback` | AI |
| `intelligence.recommendation_feedback` | `intelligence` | medium | `/recommendation-feedback` | AI |
| `orchestration.workflow_definitions` | `orchestration` | medium | `/workflow-definitions` | אוטומציה |
| `planning.capacity_slots` | `planning` | medium | `/capacity-slots` | תכנון |
| `pricing.calculations` | `pricing` | medium | `/calculations` | תמחור |
| `procurement.rfq_comparison_snapshots` | `procurement` | medium | `/rfq-comparison-snapshots` | רכש |
| `workforce.payroll_exceptions` | `workforce` | medium | `/payroll-exceptions` | כח אדם |
| `workforce.payroll_export_batches` | `workforce` | medium | `/payroll-export-batches` | כח אדם |
| `analytics.dashboard_board_widgets` | `analytics` | low | `/dashboard-board-widgets` | דוחות ודשבורדים |
| `analytics.dashboard_boards` | `analytics` | low | `/dashboard-boards` | דוחות ודשבורדים |
| `analytics.dashboard_widgets` | `analytics` | low | `/dashboard-widgets` | דוחות ודשבורדים |
| `analytics.user_dashboard_boards` | `analytics` | low | `/user-dashboard-boards` | דוחות ודשבורדים |
| `crm.lead_activities` | `crm` | low | `/lead-activities` | מכירות ולקוחות |
| `governance.alert_subscriptions` | `governance` | low | `/alert-subscriptions` | ניהול והרשאות |
| `governance.config_entries` | `governance` | low | `/config-entries` | ניהול והרשאות |
| `governance.escalation_rules` | `governance` | low | `/escalation-rules` | ניהול והרשאות |
| `governance.integration_connections` | `governance` | low | `/integration-connections` | ניהול והרשאות |
| `governance.integration_sync_logs` | `governance` | low | `/integration-sync-logs` | ניהול והרשאות |
| `governance.object_permissions` | `governance` | low | `/object-permissions` | ניהול והרשאות |
| `governance.permissions` | `governance` | low | `/permissions` | ניהול והרשאות |
| `governance.role_permissions` | `governance` | low | `/role-permissions` | ניהול והרשאות |
| `governance.saved_filters` | `governance` | low | `/saved-filters` | ניהול והרשאות |
| `governance.users_profile` | `governance` | low | `/users-profile` | ניהול והרשאות |
| `inventory.stock_count_lines` | `inventory` | low | `/stock-count-lines` | מלאי |
| `orchestration.job_queue` | `orchestration` | low | `/job-queue` | אוטומציה |
| `orchestration.workflow_steps` | `orchestration` | low | `/workflow-steps` | אוטומציה |

### B. Invisible ENGINES (API route groups)

Total: **223** of 328 route files have no menu entry matching their basename.

**High-value missing** (core business operations):

- `api-server/src/routes/ap-enterprise.ts` → suggest `/ap-enterprise`
- `api-server/src/routes/ar-enterprise.ts` → suggest `/ar-enterprise`
- `api-server/src/routes/audit-log.ts` → suggest `/audit-log`
- `api-server/src/routes/budgets.ts` → suggest `/budgets`
- `api-server/src/routes/ceo-control-tower.ts` → suggest `/ceo-control-tower`
- `api-server/src/routes/chart-of-accounts.ts` → suggest `/chart-of-accounts`
- `api-server/src/routes/cmms.ts` → suggest `/cmms`
- `api-server/src/routes/compliance-certificates.ts` → suggest `/compliance-certificates`
- `api-server/src/routes/customs-clearances.ts` → suggest `/customs-clearances`
- `api-server/src/routes/exchange-rates.ts` → suggest `/exchange-rates`
- `api-server/src/routes/executive-control.ts` → suggest `/executive-control`
- `api-server/src/routes/executive-war-room.ts` → suggest `/executive-war-room`
- `api-server/src/routes/fabrication-catalog.ts` → suggest `/fabrication-catalog`
- `api-server/src/routes/fabrication-logistics.ts` → suggest `/fabrication-logistics`
- `api-server/src/routes/fabrication-production.ts` → suggest `/fabrication-production`
- `api-server/src/routes/fleet-logistics.ts` → suggest `/fleet-logistics`
- `api-server/src/routes/goods-receipts.ts` → suggest `/goods-receipts`
- `api-server/src/routes/hr-attendance-advanced.ts` → suggest `/hr-attendance-advanced`
- `api-server/src/routes/hr-enterprise.ts` → suggest `/hr-enterprise`
- `api-server/src/routes/hr-workforce.ts` → suggest `/hr-workforce`
- `api-server/src/routes/import-cost-calculations.ts` → suggest `/import-cost-calculations`
- `api-server/src/routes/import-management-engine.ts` → suggest `/import-management-engine`
- `api-server/src/routes/import-orders.ts` → suggest `/import-orders`
- `api-server/src/routes/installations-module.ts` → suggest `/installations-module`
- `api-server/src/routes/installer-management-engine.ts` → suggest `/installer-management-engine`
- `api-server/src/routes/inventory-management.ts` → suggest `/inventory-management`
- `api-server/src/routes/inventory-warehouse.ts` → suggest `/inventory-warehouse`
- `api-server/src/routes/investment-portfolio.ts` → suggest `/investment-portfolio`
- `api-server/src/routes/israeli-accounting-engine.ts` → suggest `/israeli-accounting-engine`
- `api-server/src/routes/israeli-business-integrations.ts` → suggest `/israeli-business-integrations`
- `api-server/src/routes/israeli-payroll.ts` → suggest `/israeli-payroll`
- `api-server/src/routes/letters-of-credit.ts` → suggest `/letters-of-credit`
- `api-server/src/routes/live-ops.ts` → suggest `/live-ops`
- `api-server/src/routes/maintenance-enterprise.ts` → suggest `/maintenance-enterprise`
- `api-server/src/routes/measurement-approval-engine.ts` → suggest `/measurement-approval-engine`
- `api-server/src/routes/measurement-engineer-engine.ts` → suggest `/measurement-engineer-engine`
- `api-server/src/routes/mfa.ts` → suggest `/mfa`
- `api-server/src/routes/oracle-financial-core.ts` → suggest `/oracle-financial-core`
- `api-server/src/routes/payroll-module.ts` → suggest `/payroll-module`
- `api-server/src/routes/price-history.ts` → suggest `/price-history`
- `api-server/src/routes/price-quotes.ts` → suggest `/price-quotes`
- `api-server/src/routes/project-analyses.ts` → suggest `/project-analyses`
- `api-server/src/routes/project-costing-engine.ts` → suggest `/project-costing-engine`
- `api-server/src/routes/project-resources-budget.ts` → suggest `/project-resources-budget`
- `api-server/src/routes/project-risks-timesheets.ts` → suggest `/project-risks-timesheets`
- `api-server/src/routes/purchase-requests.ts` → suggest `/purchase-requests`
- `api-server/src/routes/purchase-returns.ts` → suggest `/purchase-returns`
- `api-server/src/routes/purchase_orders.ts` → suggest `/purchase-orders`
- `api-server/src/routes/qms.ts` → suggest `/qms`
- `api-server/src/routes/qms-inspection.ts` → suggest `/qms-inspection`
- `api-server/src/routes/quality-control-engine.ts` → suggest `/quality-control-engine`
- `api-server/src/routes/quality-management.ts` → suggest `/quality-management`
- `api-server/src/routes/raw-materials.ts` → suggest `/raw-materials`
- `api-server/src/routes/recruitment.ts` → suggest `/recruitment`
- `api-server/src/routes/reports-center.ts` → suggest `/reports-center`
- `api-server/src/routes/risk-management-center.ts` → suggest `/risk-management-center`
- `api-server/src/routes/risk-monte-carlo-engine.ts` → suggest `/risk-monte-carlo-engine`
- `api-server/src/routes/security-compliance.ts` → suggest `/security-compliance`
- `api-server/src/routes/session-admin.ts` → suggest `/session-admin`
- `api-server/src/routes/sessions.ts` → suggest `/sessions`
- `api-server/src/routes/shipment-tracking.ts` → suggest `/shipment-tracking`
- `api-server/src/routes/shipping-freight.ts` → suggest `/shipping-freight`
- `api-server/src/routes/sso.ts` → suggest `/sso`
- `api-server/src/routes/stock_counts.ts` → suggest `/stock-counts`
- `api-server/src/routes/stock_movements.ts` → suggest `/stock-movements`
- `api-server/src/routes/supplier-communications.ts` → suggest `/supplier-communications`
- `api-server/src/routes/supplier-contracts.ts` → suggest `/supplier-contracts`
- `api-server/src/routes/supplier-evaluations.ts` → suggest `/supplier-evaluations`
- `api-server/src/routes/supplier-intelligence.ts` → suggest `/supplier-intelligence`
- `api-server/src/routes/tax-management.ts` → suggest `/tax-management`
- `api-server/src/routes/warehouse-intelligence.ts` → suggest `/warehouse-intelligence`
- `api-server/src/routes/wms-core.ts` → suggest `/wms-core`
- `api-server/src/routes/wms-operations.ts` → suggest `/wms-operations`

**Invisible AI/automation engines**:

- `api-server/src/routes/ai-agents-system.ts`
- `api-server/src/routes/ai-api-keys.ts`
- `api-server/src/routes/ai-autonomous-agent.ts`
- `api-server/src/routes/ai-business-automation.ts`
- `api-server/src/routes/ai-data-flow.ts`
- `api-server/src/routes/ai-document-intelligence-engine.ts`
- `api-server/src/routes/ai-document-processor.ts`
- `api-server/src/routes/ai-engine-routes.ts`
- `api-server/src/routes/ai-gaps.ts`
- `api-server/src/routes/ai-models.ts`
- `api-server/src/routes/ai-operations.ts`
- `api-server/src/routes/ai-permissions.ts`
- `api-server/src/routes/ai-prompt-templates.ts`
- `api-server/src/routes/ai-providers.ts`
- `api-server/src/routes/ai-queries.ts`
- `api-server/src/routes/ai-recommendations.ts`
- `api-server/src/routes/ai-responses.ts`
- `api-server/src/routes/ai-search-enhance.ts`
- `api-server/src/routes/ai-smart-alerts.ts`
- `api-server/src/routes/ai-usage-logs.ts`
- `api-server/src/routes/commission-calculator-engine.ts`
- `api-server/src/routes/company-financials-realtime-engine.ts`
- `api-server/src/routes/contractor-payment-decision.ts`
- `api-server/src/routes/contractor-payment-engine.ts`
- `api-server/src/routes/customer-service-ai-engine.ts`
- `api-server/src/routes/data-flow-automations.ts`
- `api-server/src/routes/data-flow-system.ts`
- `api-server/src/routes/data-platform-core.ts`
- `api-server/src/routes/field-agent-analytics-engine.ts`
- `api-server/src/routes/lead-scoring-agent-analytics-engine.ts`
- `api-server/src/routes/live-ops.ts`
- `api-server/src/routes/marketing-automation-engine.ts`
- `api-server/src/routes/multimodal.ts`
- `api-server/src/routes/n8n-integrations.ts`
- `api-server/src/routes/pdf-generator-engine.ts`
- `api-server/src/routes/predictive-analytics-engine.ts`
- `api-server/src/routes/realtime-financials-engine.ts`
- `api-server/src/routes/realtime-platform.ts`
- `api-server/src/routes/techno-kol-uzi-ai-engine.ts`
- `api-server/src/routes/vector-search.ts`
- `api-server/src/routes/whatsapp-ai-engine.ts`
- `api-server/src/routes/whatsapp-business-engine.ts`

**All 223 invisible engines (alphabetical):**

```
admin-cron-triggers
ai-agents-system
ai-api-keys
ai-autonomous-agent
ai-business-automation
ai-data-flow
ai-document-intelligence-engine
ai-document-processor
ai-engine-routes
ai-gaps
ai-models
ai-operations
ai-permissions
ai-prompt-templates
ai-providers
ai-queries
ai-recommendations
ai-responses
ai-search-enhance
ai-smart-alerts
ai-usage-logs
analytics-engine
ap-enterprise
ar-enterprise
asset-tools-management
attendance-leave-engine
attendance-payroll-engine
audit-log
bi-adhoc-query
bi-comparative-analytics
bi-dashboards
bi-export
bi-scheduled-reports
bom-product-engine
budgets
builder-seed
business-analytics
calendar
ceo-control-tower
chat
cmms
commission-calculator-engine
communication-marketing-engine
company-financials-realtime-engine
compliance-certificates
contract-analytics
contract-lifecycle
contractor-payment-decision
contractor-payment-engine
cpq-engine
crm-analytics-sync
crm-communications
crm-customer360
crm-enterprise
crm-new-capabilities
crm-sales-pipeline
crm-sap-upgrade
crm-seed
crm-ultimate
customer-service-ai-engine
customs-clearances
dashboard-kpi
dashboard-stats
data-flow-automations
data-flow-system
data-import-export
data-platform-core
dedicated-entity-routes
delivery-returns
digital-contracts-engine
digital-contracts-signatures-engine
dms
edi
employee-portfolio-engine
employee-value-engine
entity-crud-registry
escalation
exchange-rates
executive-control
executive-war-room
external-api
external-portal
fabrication-catalog
fabrication-logistics
fabrication-production
factory-seed
field-agent-analytics-engine
field-measurements
fin-documents
fin-master-data
fin-payments
fin-quant
fin-router
fin-seed
finance-accounting
finance-control
finance-customers-suppliers
finance-enterprise
finance-enterprise2
finance-enterprise3
finance-enterprise4
finance-new-pages
finance-sap-upgrade
fleet-logistics
generic-crud
goods-receipts
goods_receipts
health
hr-attendance-advanced
hr-enterprise
hr-sap-upgrade
hr-workforce
hse
hse-routes
import-cost-calculations
import-management-engine
import-orders
installations-module
installer-management-engine
inventory-management
inventory-warehouse
investment-portfolio
israeli-accounting-engine
israeli-business-integrations
israeli-business-integrations-new
israeli-payroll
lead-scoring-agent-analytics-engine
letters-of-credit
live-ops
locations
logistics-tracking-pod-rma
maintenance-enterprise
marketing-automation-engine
marketing-enterprise
marketing-module
marketing-sync
measurement-approval-engine
measurement-engineer-engine
mfa
missing-entities
mobile-field-ops
module-path-aliases
multimodal
n8n-integrations
notifications-hub
openapi
oracle-financial-core
payroll-module
pdf-generator-engine
predictive-analytics-engine
price-history
price-quotes
pricing-enterprise
procurement-analysis
procurement-rfq
procurement-sap-upgrade
product-dev-enterprise
product-quote-engine
production-enterprise
production-enterprise2
production-gaps
production-product-dev
production-sap-upgrade
project-analyses
project-costing-engine
project-pm-extended
project-resources-budget
project-risks-timesheets
projects-module
projects-sap-upgrade
purchase-requests
purchase-returns
purchase_order_items
purchase_orders
purchase_requests
push-notifications
qms
qms-inspection
quality-control-engine
quality-management
raw_materials
realtime-financials-engine
realtime-platform
recruitment
reports-center
risk-management-center
risk-monte-carlo-engine
route-aliases
sales-pricing-enterprise
saved-places
security-compliance
server-health
session-admin
sessions
share
shipment-tracking
shipping-freight
sso
stock_counts
stock_movements
storage
strategy-growth-engine
strategy-module
supplier-communications
supplier-contracts
supplier-details
supplier-evaluations
supplier-intelligence
supplier-intelligence-new
supplier-notification-trigger
supply-chain-lifecycle-engine
system-data-reset
system-settings-upgrade
task-challenges
tax-management
techno-kol-uzi-ai-engine
vector-search
warehouse-intelligence
whatsapp-ai-engine
whatsapp-business-engine
wms-core
wms-operations
workforce-analysis
```

### C. Invisible PAGES (React components)

Total: **455** page files under `erp-app/src/pages/` have no matching menu route.

| Folder | Count |
|--------|------:|
| `finance` | 85 |
| `crm` | 46 |
| `modules` | 46 |
| `<root>` | 41 |
| `builder` | 34 |
| `settings` | 34 |
| `production` | 31 |
| `hr` | 21 |
| `executive` | 15 |
| `marketing` | 13 |
| `ai-engine` | 10 |
| `projects` | 10 |
| `ai` | 9 |
| `reports` | 9 |
| `pricing` | 6 |
| `documents` | 5 |
| `fabrication` | 5 |
| `inventory` | 5 |
| `product-dev` | 5 |
| `sales` | 5 |
| `installations` | 4 |
| `safety` | 3 |
| `import` | 2 |
| `portal` | 2 |
| `procurement` | 2 |
| `calendar` | 1 |
| `chat` | 1 |
| `meetings` | 1 |
| `platform` | 1 |
| `strategy` | 1 |
| `system` | 1 |
| `workforce` | 1 |

**Full list by folder:**

#### `finance/` (85 pages)

- `erp-app/src/pages/finance/accounting-inventory.tsx`
- `erp-app/src/pages/finance/accounting-portal.tsx`
- `erp-app/src/pages/finance/accounting-reports.tsx`
- `erp-app/src/pages/finance/accounting-settings.tsx`
- `erp-app/src/pages/finance/adjusting-entries.tsx`
- `erp-app/src/pages/finance/analytical-reports.tsx`
- `erp-app/src/pages/finance/analytical-reports-page.tsx`
- `erp-app/src/pages/finance/audit-control.tsx`
- `erp-app/src/pages/finance/balance-sheet.tsx`
- `erp-app/src/pages/finance/bank-reconciliation.tsx`
- `erp-app/src/pages/finance/blackrock-ai.tsx`
- `erp-app/src/pages/finance/blackrock-dashboard.tsx`
- `erp-app/src/pages/finance/blackrock-hedging.tsx`
- `erp-app/src/pages/finance/blackrock-monte-carlo.tsx`
- `erp-app/src/pages/finance/blackrock-risk-matrix.tsx`
- `erp-app/src/pages/finance/blackrock-var.tsx`
- `erp-app/src/pages/finance/budget-departments.tsx`
- `erp-app/src/pages/finance/budgets.tsx`
- `erp-app/src/pages/finance/cash-flow.tsx`
- `erp-app/src/pages/finance/change-tracking.tsx`
- `erp-app/src/pages/finance/consolidated-reports.tsx`
- `erp-app/src/pages/finance/credit-card-processing.tsx`
- `erp-app/src/pages/finance/credit-notes.tsx`
- `erp-app/src/pages/finance/currencies-management.tsx`
- `erp-app/src/pages/finance/customer-aging-page.tsx`
- `erp-app/src/pages/finance/customers/invoices.tsx`
- `erp-app/src/pages/finance/customers/payments.tsx`
- `erp-app/src/pages/finance/customers/products.tsx`
- `erp-app/src/pages/finance/customers/refunds.tsx`
- `erp-app/src/pages/finance/debit-notes.tsx`
- `erp-app/src/pages/finance/debtors-balances.tsx`
- `erp-app/src/pages/finance/deferred-expenses.tsx`
- `erp-app/src/pages/finance/entity-ledger.tsx`
- `erp-app/src/pages/finance/entity-ledger-page.tsx`
- `erp-app/src/pages/finance/executive-summary-page.tsx`
- `erp-app/src/pages/finance/expense-breakdown.tsx`
- `erp-app/src/pages/finance/expense-claims.tsx`
- `erp-app/src/pages/finance/expense-files.tsx`
- `erp-app/src/pages/finance/expense-filing.tsx`
- `erp-app/src/pages/finance/expense-items.tsx`
- `erp-app/src/pages/finance/expense-reports.tsx`
- `erp-app/src/pages/finance/expense-upload.tsx`
- `erp-app/src/pages/finance/expenses.tsx`
- `erp-app/src/pages/finance/finance-dashboard.tsx`
- `erp-app/src/pages/finance/financial-reports.tsx`
- `erp-app/src/pages/finance/financial-reports-page.tsx`
- `erp-app/src/pages/finance/financial-transactions.tsx`
- `erp-app/src/pages/finance/fiscal-report-page.tsx`
- `erp-app/src/pages/finance/income.tsx`
- `erp-app/src/pages/finance/income-expenses-report.tsx`
- `erp-app/src/pages/finance/invoice-analysis-page.tsx`
- `erp-app/src/pages/finance/invoices.tsx`
- `erp-app/src/pages/finance/journal.tsx`
- `erp-app/src/pages/finance/journal-report.tsx`
- `erp-app/src/pages/finance/loan-analysis.tsx`
- `erp-app/src/pages/finance/management-reporting.tsx`
- `erp-app/src/pages/finance/operational-profit.tsx`
- `erp-app/src/pages/finance/payment-anomalies.tsx`
- `erp-app/src/pages/finance/payment-reminders.tsx`
- `erp-app/src/pages/finance/payment-terms.tsx`
- `erp-app/src/pages/finance/payments.tsx`
- `erp-app/src/pages/finance/period-close.tsx`
- `erp-app/src/pages/finance/petty-cash.tsx`
- `erp-app/src/pages/finance/profit-centers.tsx`
- `erp-app/src/pages/finance/profit-loss-page.tsx`
- `erp-app/src/pages/finance/project-profitability.tsx`
- `erp-app/src/pages/finance/projects.tsx`
- `erp-app/src/pages/finance/receipts.tsx`
- `erp-app/src/pages/finance/registrations.tsx`
- `erp-app/src/pages/finance/reports.tsx`
- `erp-app/src/pages/finance/revenue-tracking.tsx`
- `erp-app/src/pages/finance/revenues-page.tsx`
- `erp-app/src/pages/finance/standing-orders.tsx`
- `erp-app/src/pages/finance/supplier-aging.tsx`
- `erp-app/src/pages/finance/supplier-aging-page.tsx`
- `erp-app/src/pages/finance/supplier-cost-analysis.tsx`
- `erp-app/src/pages/finance/suppliers/credit-notes.tsx`
- `erp-app/src/pages/finance/suppliers/invoices.tsx`
- `erp-app/src/pages/finance/suppliers/payments.tsx`
- `erp-app/src/pages/finance/suppliers/products.tsx`
- `erp-app/src/pages/finance/tax-management.tsx`
- `erp-app/src/pages/finance/treasury-management.tsx`
- `erp-app/src/pages/finance/trial-balance-page.tsx`
- `erp-app/src/pages/finance/vat-report-page.tsx`
- `erp-app/src/pages/finance/working-files.tsx`

#### `crm/` (46 pages)

- `erp-app/src/pages/crm/advanced-search.tsx`
- `erp-app/src/pages/crm/agent-control-tower.tsx`
- `erp-app/src/pages/crm/ai-insights.tsx`
- `erp-app/src/pages/crm/ai/anomaly.tsx`
- `erp-app/src/pages/crm/ai/lead-scoring.tsx`
- `erp-app/src/pages/crm/ai/next-action.tsx`
- `erp-app/src/pages/crm/ai/predictive.tsx`
- `erp-app/src/pages/crm/analytics/cohort.tsx`
- `erp-app/src/pages/crm/analytics/custom-reports.tsx`
- `erp-app/src/pages/crm/analytics/filters.tsx`
- `erp-app/src/pages/crm/analytics/trends.tsx`
- `erp-app/src/pages/crm/campaign-analytics.tsx`
- `erp-app/src/pages/crm/collaboration.tsx`
- `erp-app/src/pages/crm/collections.tsx`
- `erp-app/src/pages/crm/commission-management.tsx`
- `erp-app/src/pages/crm/contract-management.tsx`
- `erp-app/src/pages/crm/contractor-decision.tsx`
- `erp-app/src/pages/crm/crm-activities.tsx`
- `erp-app/src/pages/crm/crm-automations.tsx`
- `erp-app/src/pages/crm/crm-messaging.tsx`
- `erp-app/src/pages/crm/crm-ultimate-dashboard.tsx`
- `erp-app/src/pages/crm/daily-profitability.tsx`
- `erp-app/src/pages/crm/dynamic-pricing.tsx`
- `erp-app/src/pages/crm/email-sync.tsx`
- `erp-app/src/pages/crm/field-agents.tsx`
- `erp-app/src/pages/crm/integrations/cloud.tsx`
- `erp-app/src/pages/crm/integrations/mobile.tsx`
- `erp-app/src/pages/crm/integrations/rest-api.tsx`
- `erp-app/src/pages/crm/integrations/webhooks.tsx`
- `erp-app/src/pages/crm/lead-profile.tsx`
- `erp-app/src/pages/crm/lead-quality.tsx`
- `erp-app/src/pages/crm/leads-management.tsx`
- `erp-app/src/pages/crm/leads-ultimate.tsx`
- `erp-app/src/pages/crm/predictive-analytics.tsx`
- `erp-app/src/pages/crm/realtime-feed.tsx`
- `erp-app/src/pages/crm/realtime/feeds.tsx`
- `erp-app/src/pages/crm/realtime/notifications.tsx`
- `erp-app/src/pages/crm/realtime/sync.tsx`
- `erp-app/src/pages/crm/realtime/triggers.tsx`
- `erp-app/src/pages/crm/security/audit.tsx`
- `erp-app/src/pages/crm/security/encryption.tsx`
- `erp-app/src/pages/crm/security/row-security.tsx`
- `erp-app/src/pages/crm/security/sso.tsx`
- `erp-app/src/pages/crm/sla-management.tsx`
- `erp-app/src/pages/crm/smart-routing.tsx`
- `erp-app/src/pages/crm/whatsapp-sms.tsx`

#### `modules/` (46 pages)

- `erp-app/src/pages/modules/ai-document-processor.tsx`
- `erp-app/src/pages/modules/ai-settings.tsx`
- `erp-app/src/pages/modules/asset-management.tsx`
- `erp-app/src/pages/modules/budget-tracking.tsx`
- `erp-app/src/pages/modules/claude-chat.tsx`
- `erp-app/src/pages/modules/compliance-certificates.tsx`
- `erp-app/src/pages/modules/customs-clearance.tsx`
- `erp-app/src/pages/modules/data-sender.tsx`
- `erp-app/src/pages/modules/document-control.tsx`
- `erp-app/src/pages/modules/documents.tsx`
- `erp-app/src/pages/modules/exchange-rates.tsx`
- `erp-app/src/pages/modules/foreign-suppliers.tsx`
- `erp-app/src/pages/modules/goods-receipt.tsx`
- `erp-app/src/pages/modules/hi-tech-dashboard.tsx`
- `erp-app/src/pages/modules/import-cost-calculator.tsx`
- `erp-app/src/pages/modules/import-dashboard.tsx`
- `erp-app/src/pages/modules/import-orders.tsx`
- `erp-app/src/pages/modules/inventory-management.tsx`
- `erp-app/src/pages/modules/letters-of-credit.tsx`
- `erp-app/src/pages/modules/maintenance-management.tsx`
- `erp-app/src/pages/modules/media-library.tsx`
- `erp-app/src/pages/modules/price-comparison.tsx`
- `erp-app/src/pages/modules/price-history.tsx`
- `erp-app/src/pages/modules/price-quotes.tsx`
- `erp-app/src/pages/modules/procurement-ai.tsx`
- `erp-app/src/pages/modules/procurement-competitors.tsx`
- `erp-app/src/pages/modules/procurement-dashboard.tsx`
- `erp-app/src/pages/modules/procurement-profitability.tsx`
- `erp-app/src/pages/modules/procurement-risk-hedging.tsx`
- `erp-app/src/pages/modules/product-catalog.tsx`
- `erp-app/src/pages/modules/project-analyses.tsx`
- `erp-app/src/pages/modules/project-analysis-detail.tsx`
- `erp-app/src/pages/modules/purchase-approvals.tsx`
- `erp-app/src/pages/modules/purchase-orders.tsx`
- `erp-app/src/pages/modules/purchase-requests.tsx`
- `erp-app/src/pages/modules/purchase-returns.tsx`
- `erp-app/src/pages/modules/quality-control.tsx`
- `erp-app/src/pages/modules/raw-materials.tsx`
- `erp-app/src/pages/modules/safety-management.tsx`
- `erp-app/src/pages/modules/shipment-tracking.tsx`
- `erp-app/src/pages/modules/supplier-card.tsx`
- `erp-app/src/pages/modules/supplier-communications.tsx`
- `erp-app/src/pages/modules/supplier-contracts.tsx`
- `erp-app/src/pages/modules/supplier-evaluations.tsx`
- `erp-app/src/pages/modules/suppliers.tsx`
- `erp-app/src/pages/modules/work-orders.tsx`

#### `<root>/` (41 pages)

- `erp-app/src/pages/ApiHub.tsx`
- `erp-app/src/pages/IntegrationHub.tsx`
- `erp-app/src/pages/ai-builder.tsx`
- `erp-app/src/pages/alert-terminal.tsx`
- `erp-app/src/pages/analytics-engine.tsx`
- `erp-app/src/pages/api-keys.tsx`
- `erp-app/src/pages/audit-log.tsx`
- `erp-app/src/pages/bom-products.tsx`
- `erp-app/src/pages/company-financials.tsx`
- `erp-app/src/pages/customer-service.tsx`
- `erp-app/src/pages/document-builder.tsx`
- `erp-app/src/pages/forbidden.tsx`
- `erp-app/src/pages/forgot-password.tsx`
- `erp-app/src/pages/goods-receipt.tsx`
- `erp-app/src/pages/import-management.tsx`
- `erp-app/src/pages/integration-builder.tsx`
- `erp-app/src/pages/integration-settings.tsx`
- `erp-app/src/pages/integrations-hub.tsx`
- `erp-app/src/pages/integrations-hub-data.tsx`
- `erp-app/src/pages/kimi-task-challenges.tsx`
- `erp-app/src/pages/lead-scoring.tsx`
- `erp-app/src/pages/login.tsx`
- `erp-app/src/pages/menu-builder.tsx`
- `erp-app/src/pages/models.tsx`
- `erp-app/src/pages/module-view.tsx`
- `erp-app/src/pages/notification-preferences.tsx`
- `erp-app/src/pages/notification-routing.tsx`
- `erp-app/src/pages/operations-control-center.tsx`
- `erp-app/src/pages/permissions.tsx`
- `erp-app/src/pages/prompt-templates.tsx`
- `erp-app/src/pages/providers.tsx`
- `erp-app/src/pages/purchase-orders.tsx`
- `erp-app/src/pages/purchase-requests.tsx`
- `erp-app/src/pages/queries.tsx`
- `erp-app/src/pages/raw-materials.tsx`
- `erp-app/src/pages/report-builder.tsx`
- `erp-app/src/pages/reset-password.tsx`
- `erp-app/src/pages/responses.tsx`
- `erp-app/src/pages/risk-management.tsx`
- `erp-app/src/pages/usage-logs.tsx`
- `erp-app/src/pages/whatsapp-ai.tsx`

#### `builder/` (34 pages)

- `erp-app/src/pages/builder/actions-builder.tsx`
- `erp-app/src/pages/builder/automation-builder.tsx`
- `erp-app/src/pages/builder/automation-dashboard.tsx`
- `erp-app/src/pages/builder/builder-dashboard.tsx`
- `erp-app/src/pages/builder/builder-section.tsx`
- `erp-app/src/pages/builder/buttons-builder.tsx`
- `erp-app/src/pages/builder/calendar-view.tsx`
- `erp-app/src/pages/builder/categories-builder.tsx`
- `erp-app/src/pages/builder/context-builder.tsx`
- `erp-app/src/pages/builder/dashboard-builder.tsx`
- `erp-app/src/pages/builder/detail-page-builder.tsx`
- `erp-app/src/pages/builder/dynamic-data-view.tsx`
- `erp-app/src/pages/builder/dynamic-detail-page.tsx`
- `erp-app/src/pages/builder/dynamic-form-renderer.tsx`
- `erp-app/src/pages/builder/entity-buttons-tab.tsx`
- `erp-app/src/pages/builder/entity-editor.tsx`
- `erp-app/src/pages/builder/form-builder.tsx`
- `erp-app/src/pages/builder/form-field-components.tsx`
- `erp-app/src/pages/builder/inline-child-grid.tsx`
- `erp-app/src/pages/builder/kanban-view.tsx`
- `erp-app/src/pages/builder/module-editor.tsx`
- `erp-app/src/pages/builder/module-version-history.tsx`
- `erp-app/src/pages/builder/permissions-builder.tsx`
- `erp-app/src/pages/builder/status-builder.tsx`
- `erp-app/src/pages/builder/sub-tables-builder.tsx`
- `erp-app/src/pages/builder/summary-cards-view.tsx`
- `erp-app/src/pages/builder/template-builder.tsx`
- `erp-app/src/pages/builder/tool-builder.tsx`
- `erp-app/src/pages/builder/validation-builder.tsx`
- `erp-app/src/pages/builder/versioning-builder.tsx`
- `erp-app/src/pages/builder/view-builder.tsx`
- `erp-app/src/pages/builder/visual-workflow-builder.tsx`
- `erp-app/src/pages/builder/widget-builder.tsx`
- `erp-app/src/pages/builder/workflow-builder.tsx`

#### `settings/` (34 pages)

- `erp-app/src/pages/settings/backups.tsx`
- `erp-app/src/pages/settings/departments.tsx`
- `erp-app/src/pages/settings/import-export.tsx`
- `erp-app/src/pages/settings/roles.tsx`
- `erp-app/src/pages/settings/sections/access-requests.tsx`
- `erp-app/src/pages/settings/sections/advanced-analytics.tsx`
- `erp-app/src/pages/settings/sections/api-connections.tsx`
- `erp-app/src/pages/settings/sections/audit-log.tsx`
- `erp-app/src/pages/settings/sections/automation.tsx`
- `erp-app/src/pages/settings/sections/communication-integrations.tsx`
- `erp-app/src/pages/settings/sections/company-profile.tsx`
- `erp-app/src/pages/settings/sections/escalation-channels.tsx`
- `erp-app/src/pages/settings/sections/feature-flags.tsx`
- `erp-app/src/pages/settings/sections/field-level-security.tsx`
- `erp-app/src/pages/settings/sections/general-settings.tsx`
- `erp-app/src/pages/settings/sections/import-export.tsx`
- `erp-app/src/pages/settings/sections/integration-hub.tsx`
- `erp-app/src/pages/settings/sections/integrations.tsx`
- `erp-app/src/pages/settings/sections/languages-settings.tsx`
- `erp-app/src/pages/settings/sections/modules-fields.tsx`
- `erp-app/src/pages/settings/sections/n8n-integrations.tsx`
- `erp-app/src/pages/settings/sections/onboarding-center.tsx`
- `erp-app/src/pages/settings/sections/payment-services.tsx`
- `erp-app/src/pages/settings/sections/plugins.tsx`
- `erp-app/src/pages/settings/sections/record-sharing.tsx`
- `erp-app/src/pages/settings/sections/security-settings.tsx`
- `erp-app/src/pages/settings/sections/system-settings.tsx`
- `erp-app/src/pages/settings/sections/team-collaboration.tsx`
- `erp-app/src/pages/settings/sections/template-management.tsx`
- `erp-app/src/pages/settings/sections/user-management.tsx`
- `erp-app/src/pages/settings/sections/user-profile.tsx`
- `erp-app/src/pages/settings/settings-hub.tsx`
- `erp-app/src/pages/settings/triggers.tsx`
- `erp-app/src/pages/settings/webhooks.tsx`

#### `production/` (31 pages)

- `erp-app/src/pages/production/batch-serial-tracking.tsx`
- `erp-app/src/pages/production/bom-manager.tsx`
- `erp-app/src/pages/production/bom-tree.tsx`
- `erp-app/src/pages/production/capacity-planning.tsx`
- `erp-app/src/pages/production/cmms-dashboard.tsx`
- `erp-app/src/pages/production/corrective-actions.tsx`
- `erp-app/src/pages/production/cost-report.tsx`
- `erp-app/src/pages/production/efficiency-report.tsx`
- `erp-app/src/pages/production/equipment-management.tsx`
- `erp-app/src/pages/production/field-measurements-page.tsx`
- `erp-app/src/pages/production/installations-list.tsx`
- `erp-app/src/pages/production/installers.tsx`
- `erp-app/src/pages/production/machine-maintenance.tsx`
- `erp-app/src/pages/production/ncr-reports.tsx`
- `erp-app/src/pages/production/output-report.tsx`
- `erp-app/src/pages/production/product-design.tsx`
- `erp-app/src/pages/production/product-testing.tsx`
- `erp-app/src/pages/production/production-dashboard.tsx`
- `erp-app/src/pages/production/production-gantt.tsx`
- `erp-app/src/pages/production/production-lines.tsx`
- `erp-app/src/pages/production/production-reports.tsx`
- `erp-app/src/pages/production/production-work-orders.tsx`
- `erp-app/src/pages/production/prototypes.tsx`
- `erp-app/src/pages/production/qc-inspections.tsx`
- `erp-app/src/pages/production/quality-checklists.tsx`
- `erp-app/src/pages/production/quality-control-ent.tsx`
- `erp-app/src/pages/production/safety-management.tsx`
- `erp-app/src/pages/production/scada-system.tsx`
- `erp-app/src/pages/production/tool-management.tsx`
- `erp-app/src/pages/production/waste-report.tsx`
- `erp-app/src/pages/production/work-instructions-ent.tsx`

#### `hr/` (21 pages)

- `erp-app/src/pages/hr/benefits.tsx`
- `erp-app/src/pages/hr/bonuses.tsx`
- `erp-app/src/pages/hr/contractor-contracts.tsx`
- `erp-app/src/pages/hr/contractor-insurance.tsx`
- `erp-app/src/pages/hr/contractor-payments.tsx`
- `erp-app/src/pages/hr/employee-goals.tsx`
- `erp-app/src/pages/hr/employee-portfolio.tsx`
- `erp-app/src/pages/hr/employer-cost.tsx`
- `erp-app/src/pages/hr/expense-claims.tsx`
- `erp-app/src/pages/hr/health-safety.tsx`
- `erp-app/src/pages/hr/hr-meetings.tsx`
- `erp-app/src/pages/hr/interviews.tsx`
- `erp-app/src/pages/hr/leave-management.tsx`
- `erp-app/src/pages/hr/open-positions.tsx`
- `erp-app/src/pages/hr/payroll.tsx`
- `erp-app/src/pages/hr/payroll-center.tsx`
- `erp-app/src/pages/hr/payslips.tsx`
- `erp-app/src/pages/hr/performance-reviews.tsx`
- `erp-app/src/pages/hr/policies.tsx`
- `erp-app/src/pages/hr/recruitment.tsx`
- `erp-app/src/pages/hr/training.tsx`

#### `executive/` (15 pages)

- `erp-app/src/pages/executive/ceo-dashboard.tsx`
- `erp-app/src/pages/executive/company-health.tsx`
- `erp-app/src/pages/executive/data-flow-dashboard.tsx`
- `erp-app/src/pages/executive/delayed-projects.tsx`
- `erp-app/src/pages/executive/executive-kpi-board.tsx`
- `erp-app/src/pages/executive/financial-risk.tsx`
- `erp-app/src/pages/executive/live-alerts-center.tsx`
- `erp-app/src/pages/executive/live-ops.tsx`
- `erp-app/src/pages/executive/operational-bottlenecks.tsx`
- `erp-app/src/pages/executive/order-lifecycle.tsx`
- `erp-app/src/pages/executive/procurement-risk.tsx`
- `erp-app/src/pages/executive/production-efficiency.tsx`
- `erp-app/src/pages/executive/profitability-dashboard.tsx`
- `erp-app/src/pages/executive/war-room.tsx`
- `erp-app/src/pages/executive/workforce-status.tsx`

#### `marketing/` (13 pages)

- `erp-app/src/pages/marketing/campaigns.tsx`
- `erp-app/src/pages/marketing/campaigns-page.tsx`
- `erp-app/src/pages/marketing/content-calendar.tsx`
- `erp-app/src/pages/marketing/content-calendar-page.tsx`
- `erp-app/src/pages/marketing/email-campaigns-page.tsx`
- `erp-app/src/pages/marketing/email-marketing.tsx`
- `erp-app/src/pages/marketing/marketing-analytics.tsx`
- `erp-app/src/pages/marketing/marketing-budget.tsx`
- `erp-app/src/pages/marketing/marketing-budget-page.tsx`
- `erp-app/src/pages/marketing/marketing-hub.tsx`
- `erp-app/src/pages/marketing/marketing-integrations.tsx`
- `erp-app/src/pages/marketing/social-media.tsx`
- `erp-app/src/pages/marketing/social-media-page.tsx`

#### `ai-engine/` (10 pages)

- `erp-app/src/pages/ai-engine/SuperAgentPage.tsx`
- `erp-app/src/pages/ai-engine/action-result-card.tsx`
- `erp-app/src/pages/ai-engine/ai-chatbot-settings.tsx`
- `erp-app/src/pages/ai-engine/call-nlp-analysis.tsx`
- `erp-app/src/pages/ai-engine/cross-module-transactions.tsx`
- `erp-app/src/pages/ai-engine/kimi-terminal.tsx`
- `erp-app/src/pages/ai-engine/kobi-ide.tsx`
- `erp-app/src/pages/ai-engine/kobi-terminal.tsx`
- `erp-app/src/pages/ai-engine/lead-scoring.tsx`
- `erp-app/src/pages/ai-engine/render-content-with-charts.tsx`

#### `projects/` (10 pages)

- `erp-app/src/pages/projects/milestones-page.tsx`
- `erp-app/src/pages/projects/project-tasks-page.tsx`
- `erp-app/src/pages/projects/real-estate/contractors.tsx`
- `erp-app/src/pages/projects/real-estate/kiryati10.tsx`
- `erp-app/src/pages/projects/real-estate/permits.tsx`
- `erp-app/src/pages/projects/real-estate/units.tsx`
- `erp-app/src/pages/projects/resources-page.tsx`
- `erp-app/src/pages/projects/risk-register-page.tsx`
- `erp-app/src/pages/projects/subcontractors.tsx`
- `erp-app/src/pages/projects/timesheets-page.tsx`

#### `ai/` (9 pages)

- `erp-app/src/pages/ai/ai-anomaly-detection.tsx`
- `erp-app/src/pages/ai/ai-customer-service-pro.tsx`
- `erp-app/src/pages/ai/ai-executive-insights.tsx`
- `erp-app/src/pages/ai/ai-follow-up.tsx`
- `erp-app/src/pages/ai/ai-lead-scoring.tsx`
- `erp-app/src/pages/ai/ai-procurement-optimizer.tsx`
- `erp-app/src/pages/ai/ai-production-insights.tsx`
- `erp-app/src/pages/ai/ai-quotation-assistant.tsx`
- `erp-app/src/pages/ai/ai-sales-assistant.tsx`

#### `reports/` (9 pages)

- `erp-app/src/pages/reports/financial/analytics.tsx`
- `erp-app/src/pages/reports/financial/customer-aging.tsx`
- `erp-app/src/pages/reports/financial/customer-vendor-ledger.tsx`
- `erp-app/src/pages/reports/financial/executive-summary.tsx`
- `erp-app/src/pages/reports/financial/fiscal-report.tsx`
- `erp-app/src/pages/reports/financial/invoice-analysis.tsx`
- `erp-app/src/pages/reports/financial/vat-report.tsx`
- `erp-app/src/pages/reports/financial/vendor-aging.tsx`
- `erp-app/src/pages/reports/funnel-analysis.tsx`

#### `pricing/` (6 pages)

- `erp-app/src/pages/pricing/collection-management.tsx`
- `erp-app/src/pages/pricing/collections-manager.tsx`
- `erp-app/src/pages/pricing/cost-calculations.tsx`
- `erp-app/src/pages/pricing/cost-calculator.tsx`
- `erp-app/src/pages/pricing/price-lists-ent.tsx`
- `erp-app/src/pages/pricing/price-lists-manager.tsx`

#### `documents/` (5 pages)

- `erp-app/src/pages/documents/checklists.tsx`
- `erp-app/src/pages/documents/company-report.tsx`
- `erp-app/src/pages/documents/contracts.tsx`
- `erp-app/src/pages/documents/quality-docs.tsx`
- `erp-app/src/pages/documents/system-spec.tsx`

#### `fabrication/` (5 pages)

- `erp-app/src/pages/fabrication/accessories.tsx`
- `erp-app/src/pages/fabrication/finishes-colors.tsx`
- `erp-app/src/pages/fabrication/glass-catalog.tsx`
- `erp-app/src/pages/fabrication/profiles.tsx`
- `erp-app/src/pages/fabrication/systems.tsx`

#### `inventory/` (5 pages)

- `erp-app/src/pages/inventory/finished-goods-stock.tsx`
- `erp-app/src/pages/inventory/raw-material-stock.tsx`
- `erp-app/src/pages/inventory/stock-counts.tsx`
- `erp-app/src/pages/inventory/stock-movements.tsx`
- `erp-app/src/pages/inventory/warehouses.tsx`

#### `product-dev/` (5 pages)

- `erp-app/src/pages/product-dev/feature-requests.tsx`
- `erp-app/src/pages/product-dev/product-roadmap.tsx`
- `erp-app/src/pages/product-dev/qa-testing.tsx`
- `erp-app/src/pages/product-dev/rd-projects.tsx`
- `erp-app/src/pages/product-dev/roadmap.tsx`

#### `sales/` (5 pages)

- `erp-app/src/pages/sales/ai-customer-service.tsx`
- `erp-app/src/pages/sales/crm-pipeline.tsx`
- `erp-app/src/pages/sales/customer-management.tsx`
- `erp-app/src/pages/sales/customer-portal.tsx`
- `erp-app/src/pages/sales/customer-service.tsx`

#### `installations/` (4 pages)

- `erp-app/src/pages/installations/assets.tsx`
- `erp-app/src/pages/installations/calendar.tsx`
- `erp-app/src/pages/installations/facilities.tsx`
- `erp-app/src/pages/installations/work.tsx`

#### `safety/` (3 pages)

- `erp-app/src/pages/safety/accident-reports.tsx`
- `erp-app/src/pages/safety/procedures.tsx`
- `erp-app/src/pages/safety/training.tsx`

#### `import/` (2 pages)

- `erp-app/src/pages/import/import-cost-calculator.tsx`
- `erp-app/src/pages/import/import-insurance.tsx`

#### `portal/` (2 pages)

- `erp-app/src/pages/portal/portal-login.tsx`
- `erp-app/src/pages/portal/portal-management.tsx`

#### `procurement/` (2 pages)

- `erp-app/src/pages/procurement/stock-counts.tsx`
- `erp-app/src/pages/procurement/stock-movements.tsx`

#### `calendar/` (1 pages)

- `erp-app/src/pages/calendar/user-calendar.tsx`

#### `chat/` (1 pages)

- `erp-app/src/pages/chat/chat-page.tsx`

#### `meetings/` (1 pages)

- `erp-app/src/pages/meetings/meetings-calendar.tsx`

#### `platform/` (1 pages)

- `erp-app/src/pages/platform/data-flow-automations.tsx`

#### `strategy/` (1 pages)

- `erp-app/src/pages/strategy/planning.tsx`

#### `system/` (1 pages)

- `erp-app/src/pages/system/audit-log.tsx`

#### `workforce/` (1 pages)

- `erp-app/src/pages/workforce/workforce-analysis.tsx`

### D. Invisible EDGE FUNCTIONS

All **45** Supabase edge functions under `supabase/functions/` are back-end handlers. None appear as menu entries. They represent **capabilities** — the menu should expose buttons/pages that trigger them.

| Edge Function | Suggested Trigger Page |
|---------------|------------------------|
| `acknowledge-notification` | /notifications |
| `approve-attendance` | /hr/attendance (action button) |
| `approve-po` | /po-360 (action) |
| `approve-quote` | /quote-360 (action) |
| `assign-inbox-item` | /universal-inbox |
| `change-project-state` | /project-360 (state transition) |
| `claim-job` | /jobs (worker dashboard) |
| `classify-document` | /documents/classification |
| `complete-job` | /jobs (worker action) |
| `convert-quote-to-project` | /quote-360 (action) |
| `create-customer` | /customers (quick-add) |
| `create-inbox-item` | /universal-inbox |
| `create-notification` | internal |
| `create-project` | /projects (new) |
| `create-supplier` | /suppliers (new) |
| `create-work-order` | /work-orders (new) |
| `dispatch-domain-events` | /system/event-bus (admin) |
| `enqueue-job` | /ops/jobs (admin) |
| `extract-document-fields` | /documents/extraction |
| `fail-job` | /jobs (admin) |
| `generate-knowledge-card` | /ai/knowledge |
| `get-customer-360` | /customer-360 |
| `get-employee-360` | /employee-360 |
| `get-project-360` | /project-360 |
| `get-route-menu-permission-sync-status` | /system/route-menu-sync (admin) |
| `issue-invoice` | /invoices (action) |
| `process-workflow-step` | /workflow/runs (admin) |
| `receive-po` | /goods-receipt (action) |
| `refresh-read-models` | /system/read-models (admin) |
| `register-payment` | /payments (action) |
| `reject-quote` | /quote-360 (action) |
| `reopen-inbox-item` | /universal-inbox |
| `reopen-notification` | /notifications |
| `replay-dlq` | /system/dlq (admin) |
| `requeue-agent-job` | /ai/agent-jobs (admin) |
| `resolve-inbox-item` | /universal-inbox |
| `resolve-notification` | /notifications |
| `restart-agent` | /ai/agents (admin) |
| `retry-stuck-jobs` | /system/jobs (admin) |
| `run-route-menu-permission-sync` | /system/route-menu-sync (admin) |
| `save-kpi-definition` | /analytics/kpis |
| `send-quote` | /quote-360 (action) |
| `send-rfq` | /rfq-360 (action) |
| `start-workflow-run` | /workflow/runs (admin) |
| `submit-attendance` | /hr/attendance |

### E. Invisible WORKFLOWS

From `onyx-procurement/src/pipeline/workflow-flows.js`:

| Flow ID | Steps | Suggested Route | Category | Priority |
|---------|-------|-----------------|----------|----------|
| `sales_to_project` | Lead → Quote → Approval → Order → Project | `/flows/sales-to-project` | מכירות | high |
| `project_to_procurement` | Project → Work Orders → RFQ → PO | `/flows/project-to-procurement` | פרויקטים | high |
| `procurement_to_execution` | PO → Receipt → Issue → Execute | `/flows/procurement-to-execution` | רכש | high |
| `execution_to_cash` | Execute → Deliver → Invoice → Collect | `/flows/execution-to-cash` | כספים | high |
| `employee_to_payroll` | Hire → Attendance → Payroll → Slip | `/flows/employee-to-payroll` | כח אדם | high |

**State Machines** (`onyx-procurement/src/pipeline/state-machines.js`):

None of the 13 state machines have a configurable menu page. Transition explorers use the API `/api/state-machines/:type/transitions` but no UI exposes them.

- `state_machine: lead` → suggest `/state-machines/lead`
- `state_machine: quote` → suggest `/state-machines/quote`
- `state_machine: rfq` → suggest `/state-machines/rfq`
- `state_machine: po` → suggest `/state-machines/po`
- `state_machine: project` → suggest `/state-machines/project`
- `state_machine: work_order` → suggest `/state-machines/work-order`
- `state_machine: invoice` → suggest `/state-machines/invoice`
- `state_machine: employee` → suggest `/state-machines/employee`
- `state_machine: attendance` → suggest `/state-machines/attendance`
- `state_machine: leave` → suggest `/state-machines/leave`
- `state_machine: timesheet` → suggest `/state-machines/timesheet`
- `state_machine: task` → suggest `/state-machines/task`
- `state_machine: shift` → suggest `/state-machines/shift`

### F. Invisible REPORTS (from `_master-registry/reports_registry.json`)

14 of 20 registry reports are invisible by canonical name.

| Report | Domain | In Menu? | Suggested Route | Priority |
|--------|--------|:--------:|-----------------|----------|
| `project_profitability_report` | projects | N | `/reports/project-profitability` | high |
| `aging_report` | finance | Y | `-` | - |
| `pnl` | finance | Y | `-` | - |
| `balance_sheet` | finance | Y | `-` | - |
| `cash_flow` | finance | Y | `-` | - |
| `vat_report_pcn836` | finance | N | `/reports/vat-pcn836` | high |
| `production_kpi` | production | N | `/reports/production-kpi` | high |
| `sales_pipeline` | sales | N | `/reports/sales-pipeline` | high |
| `procurement_savings` | procurement | N | `/reports/procurement-savings` | medium |
| `inventory_turnover` | inventory | N | `/reports/inventory-turnover` | high |
| `payroll_summary` | hr_workforce | N | `/reports/payroll-summary` | high |
| `attendance_report` | hr | N | `/reports/attendance` | high |
| `service_sla` | service | N | `/reports/service-sla` | medium |
| `customer_360` | crm | Y | `-` | - |
| `supplier_scorecard` | procurement | Y | `-` | - |
| `overdue_projects_report` | projects | N | `/reports/overdue-projects` | high |
| `bank_reconciliation` | finance | Y | `-` | - |
| `stock_reorder_suggestions` | inventory | N | `/reports/stock-reorder` | medium |
| `installation_completion` | installation | N | `/reports/installation-completion` | medium |
| `audit_log_review` | governance | N | `/reports/audit-review` | medium |

### G. Invisible DASHBOARDS (from `_master-registry/dashboards_registry.json`)

None of the 10 canonical dashboard names have a direct menu entry by registry name. Equivalents exist (e.g., `/hr/hr-dashboard` ≈ `dashboard_workforce`), but the registry-to-menu mapping is informal — there is no catalog page.

| Registry Dashboard | Existing near-match | Suggested canonical route |
|--------------------|--------------------|----------------------------|
| `dashboard_executive` | /executive, /ops/master-dashboard | `/dashboards/executive` |
| `dashboard_operations` | /ops/master-dashboard | `/dashboards/operations` |
| `dashboard_procurement` | no dedicated route | `/dashboards/procurement` |
| `dashboard_workforce` | /hr/hr-dashboard | `/dashboards/workforce` |
| `dashboard_ai` | /ai-engine/ai-agents-dashboard | `/dashboards/ai` |
| `dashboard_finance` | /fin/fin-dashboard, /finance/collections-dashboard | `/dashboards/finance` |
| `dashboard_service` | /customer-service/service-dashboard | `/dashboards/service` |
| `dashboard_projects` | no canonical route | `/dashboards/projects` |
| `dashboard_production` | no canonical route | `/dashboards/production` |
| `dashboard_sales` | /crm/crm-dashboard | `/dashboards/sales` |

### H. Invisible CAPABILITIES (AI, tax forms, integrations)

**Israeli tax forms** — all covered in menu:
- Form 102 → `/form-102`, `/tax/form-102`, `/tax-exports/form-102-xml`
- Form 126 → `/form-126`, `/tax/form-126`, `/tax-exports/form-126-xml`
- Form 1301 → `/form-1301`, `/tax/form-1301`, `/tax-exports/form-1301-xml`
- Form 1320 → `/tax-exports/form-1320-xml`
- Form 30A → `/form-30a`, `/tax/form-30a`
- Form 6111 → `/form-6111`, `/tax/form-6111`
- Form 857 → `/tax/form-857`, `/tax-exports/form-857-xml`
- PCN836 → `/vat/pcn836`

**Invisible AI/automation capabilities** (engines without UI):

- `ai-autonomous-agent` — autonomous agent runtime control
- `ai-business-automation` — no-code automation builder
- `ai-data-flow` — data flow designer
- `ai-document-intelligence-engine` — document AI results viewer
- `ai-search-enhance` — AI-enhanced search config
- `ai-smart-alerts` — smart alerts inbox
- `anomaly-detection` — anomaly history timeline
- `communication-marketing-engine` — omnichannel campaign
- `company-financials-realtime-engine` — realtime financials stream
- `contractor-payment-engine` — contractor pay decisions log
- `customer-service-ai-engine` — AI CS co-pilot
- `data-fabric` — data fabric topology viewer
- `data-flow-automations` — data-flow automation console
- `digital-twin` — digital twin studio
- `employee-portfolio-engine` — employee portfolio view
- `employee-value-engine` — employee value analytics
- `field-agent-analytics-engine` — field agent analytics
- `iot-sensor-hub` — IoT sensor registry + live view
- `knowledge-graph` — knowledge graph explorer
- `lead-scoring-agent-analytics-engine` — lead-scoring AI dashboard
- `marketing-automation-engine` — marketing automation flows
- `metric-dictionary` — metric dictionary UI
- `n8n-integrations` — n8n workflow list
- `multimodal` — multimodal AI intake
- `nl-query` — NL query assistant
- `predictive-analytics-engine` — predictive scenarios
- `process-mining` — process mining visualizer
- `realtime-financials-engine` — realtime financials
- `realtime-platform` — realtime platform status
- `risk-monte-carlo-engine` — Monte-Carlo scenario runner
- `sentiment-analysis` — sentiment trend page
- `strategy-growth-engine` — strategy & growth engine
- `supply-chain-lifecycle-engine` — supply-chain lifecycle viewer
- `vector-search` — vector search console
- `warehouse-intelligence` — warehouse intelligence dashboard
- `whatsapp-ai-engine` — WhatsApp AI agent console
- `whatsapp-business-engine` — WhatsApp Business admin
- `techno-kol-uzi-ai-engine` — brand-specific AI console
- `executive-war-room` — executive war room
- `ceo-control-tower` — CEO control tower
- `live-ops` — live ops board
- `optimization-lab` — optimization lab

## Top 50 Priority Adds

Sorted by business impact. These are the first 50 invisible items a user should see in the menu.

| # | Item | Type | Evidence | Priority | Suggested Route |
|--:|------|------|----------|----------|-----------------|
| 1 | Quote Lines editor | MODEL | `commercial.quote_lines` | high | `/quotes/:id/lines` |
| 2 | Quote Revisions history | MODEL | `commercial.quote_revisions` | high | `/quotes/:id/revisions` |
| 3 | Quote Approval Rules admin | MODEL | `commercial.quote_approval_rules` | high | `/sales/approval-rules` |
| 4 | Customer Contacts list | MODEL | `commercial.customer_contacts` | high | `/customers/:id/contacts` |
| 5 | Customer Portal Accounts admin | MODEL | `commercial.customer_portal_accounts` | high | `/customers/portal-accounts` |
| 6 | PO Lines editor | MODEL | `procurement.purchase_order_lines` | high | `/pos/:id/lines` |
| 7 | RFQ Items grid | MODEL | `procurement.rfq_items` | high | `/rfqs/:id/items` |
| 8 | Supplier Invoices book | MODEL | `procurement.supplier_invoices` | high | `/procurement/supplier-invoices` |
| 9 | Supplier Quote comparison | MODEL | `procurement.supplier_quotes` | high | `/rfqs/:id/compare` |
| 10 | Procurement Approval Steps | MODEL | `procurement.approval_steps` | high | `/procurement/approvals` |
| 11 | Contract Milestones | MODEL | `procurement.contract_milestones` | high | `/contracts/:id/milestones` |
| 12 | Inventory Movements journal | MODEL | `inventory.inventory_movements` | high | `/inventory/movements` |
| 13 | Inventory Receipts | MODEL | `inventory.inventory_receipts` | high | `/inventory/receipts` |
| 14 | Inventory Issues | MODEL | `inventory.inventory_issues` | high | `/inventory/issues` |
| 15 | Inventory Transfers | MODEL | `inventory.inventory_transfers` | high | `/inventory/transfers` |
| 16 | Inventory Reservations | MODEL | `inventory.inventory_reservations` | high | `/inventory/reservations` |
| 17 | Material Lots (traceability) | MODEL | `inventory.material_lots` | high | `/inventory/lots` |
| 18 | Material Request lines | MODEL | `inventory.material_request_lines` | high | `/material-requests/:id/lines` |
| 19 | Shortage Snapshots | MODEL | `inventory.shortage_snapshots` | high | `/inventory/shortages` |
| 20 | Work-Order Tasks | MODEL | `execution.work_order_tasks` | high | `/work-orders/:id/tasks` |
| 21 | WO QA Checklists | MODEL | `execution.work_order_qa_checklists` | high | `/work-orders/:id/qa` |
| 22 | Project Phases editor | MODEL | `execution.project_phases` | high | `/projects/:id/phases` |
| 23 | Project Cost Plans | MODEL | `execution.project_cost_plans` | high | `/projects/:id/cost-plan` |
| 24 | Task Dependencies (Gantt) | MODEL | `execution.task_dependencies` | high | `/projects/:id/gantt` |
| 25 | Delivery Events timeline | MODEL | `execution.delivery_events` | high | `/projects/:id/deliveries` |
| 26 | Installation Events | MODEL | `execution.installation_events` | high | `/installation/events` |
| 27 | Invoice Lines | MODEL | `finance.invoice_lines` | high | `/invoices/:id/lines` |
| 28 | Payment Allocations | MODEL | `finance.payment_allocations` | high | `/payments/:id/allocations` |
| 29 | Collections console | MODEL | `finance.collection_cases` | high | `/finance/collections` |
| 30 | Dunning Campaigns | MODEL | `finance.dunning_campaigns` | high | `/finance/dunning` |
| 31 | Reconciliation Exceptions queue | MODEL | `finance.reconciliation_exceptions` | high | `/finance/reconciliation-exceptions` |
| 32 | Budget Entries | MODEL | `finance.budget_entries` | high | `/finance/budgets/entries` |
| 33 | Cashflow Entries | MODEL | `finance.cashflow_entries` | high | `/finance/cashflow/entries` |
| 34 | Tax Records book | MODEL | `finance.tax_records` | high | `/tax/records` |
| 35 | VAT Records book | MODEL | `finance.vat_records` | high | `/tax/vat-records` |
| 36 | Payroll Runs viewer | MODEL | `workforce.payroll_runs` | high | `/payroll/runs` |
| 37 | Payroll Entries | MODEL | `workforce.payroll_entries` | high | `/payroll/entries` |
| 38 | Payroll Exceptions queue | MODEL | `workforce.payroll_exceptions` | high | `/payroll/exceptions` |
| 39 | Leave Requests inbox | MODEL | `workforce.leave_requests` | high | `/hr/leave-requests` |
| 40 | Employee Pay Components | MODEL | `workforce.employee_pay_components` | high | `/employees/:id/pay-components` |
| 41 | Workforce Assignments | MODEL | `workforce.workforce_assignments` | high | `/workforce/assignments` |
| 42 | Permissions matrix | MODEL | `governance.permissions` | high | `/admin/permissions` |
| 43 | Object Permissions ACL | MODEL | `governance.object_permissions` | high | `/admin/object-acl` |
| 44 | Integration Connections admin | MODEL | `governance.integration_connections` | high | `/integrations/connections` |
| 45 | Escalation Rules | MODEL | `governance.escalation_rules` | high | `/admin/escalation-rules` |
| 46 | Defects log | MODEL | `quality.defects` | high | `/quality/defects` |
| 47 | Inspection Runs | MODEL | `quality.inspection_runs` | high | `/quality/inspections` |
| 48 | Support Tickets list | MODEL | `comms.support_tickets` | high | `/support/tickets` |
| 49 | KPI Snapshots explorer | MODEL | `analytics.kpi_snapshots` | medium | `/analytics/kpi-snapshots` |
| 50 | Dashboard Definitions catalog | MODEL | `analytics.dashboard_definitions` | medium | `/admin/dashboards` |

## Appendix A: Menu routes parsed (per migration)

- `00017_app_menu.sql`: 12 unique route literals
- `00034_app_menu_complete.sql`: 127 unique route literals
- `00035_app_menu_FULL.sql`: 418 unique route literals
- `00036_remove_realestate_and_add_missing.sql`: 285 unique route literals
- `00038_merged_sources_menu_additions.sql`: 381 unique route literals
- `00039_final_merge_menu_additions.sql`: 61 unique route literals
- `00040_system_360_fixes.sql`: 57 unique route literals
- **TOTAL UNIQUE across all 7 files:** 1,271

## Appendix B: Tables by schema — menu coverage

| Schema | Total | Visible | Invisible | Coverage |
|--------|------:|--------:|----------:|---------:|
| `analytics` | 6 | 0 | 6 | 0% |
| `commercial` | 11 | 4 | 7 | 36% |
| `comms` | 9 | 3 | 6 | 33% |
| `compliance` | 2 | 2 | 0 | 100% |
| `crm` | 3 | 2 | 1 | 67% |
| `docs` | 8 | 1 | 7 | 12% |
| `documents` | 6 | 1 | 5 | 17% |
| `execution` | 19 | 8 | 11 | 42% |
| `finance` | 24 | 10 | 14 | 42% |
| `governance` | 14 | 4 | 10 | 29% |
| `intelligence` | 11 | 9 | 2 | 82% |
| `inventory` | 18 | 9 | 9 | 50% |
| `maintenance` | 2 | 2 | 0 | 100% |
| `orchestration` | 5 | 2 | 3 | 40% |
| `planning` | 3 | 2 | 1 | 67% |
| `pricing` | 2 | 1 | 1 | 50% |
| `procurement` | 19 | 11 | 8 | 58% |
| `quality` | 3 | 1 | 2 | 33% |
| `service` | 2 | 1 | 1 | 50% |
| `treasury` | 3 | 3 | 0 | 100% |
| `workforce` | 17 | 10 | 7 | 59% |

**Zero-coverage schemas:** `analytics` (0%).  
**Near-zero (<=35%):** `docs` (12%), `documents` (17%), `governance` (29%), `comms` (33%), `commercial` (36%).  
**Low (<=50%):** `orchestration` (40%), `execution` (42%), `finance` (42%), `inventory` (50%), `pricing` (50%), `service` (50%).

## Appendix C: Pipeline Entity Map coverage (16 entities)

From `onyx-procurement/src/pipeline/entity-map.js`:

| Entity | 360 Page | List Page | Notes |
|--------|----------|-----------|-------|
| `lead` | Y | `/leads` | good |
| `customer` | Y /customer-360 | `/customers` | good |
| `supplier` | Y /supplier-360 | `/suppliers` | good |
| `quote` | Y /quote-360 | `/quotes` | missing line editor, revisions, approval-rules |
| `rfq` | Y /rfq-360 | `/rfqs` | missing items grid, comparison |
| `po` | Y /po-360 | `/pos` | missing lines editor |
| `project` | Y /project-360 | `/projects` | missing phases, cost-plans, task dependencies |
| `work_order` | Y /work-order-360 | `/work-orders` | missing tasks, QA checklists |
| `invoice` | Y /finance-360 | `/invoices` | missing lines, allocations |
| `employee` | Y /employee-360 | `/employees` | missing pay-components editor |
| `contract` | N | `/contracts` | no contract-360, milestones invisible |
| `material` | N | `/materials` | no material-360, lots invisible |
| `payment` | N | `/payments` | no payment-360, allocations invisible |
| `task` | N | `/tasks` | no task-360, dependencies invisible |
| `document` | Y | `/documents` | version-history, signature-queue invisible |
| `alert` | N | `/alert-terminal (orphan page)` | no alert-360 |

**Entities missing 360:** `contract`, `material`, `payment`, `task`, `alert`.
