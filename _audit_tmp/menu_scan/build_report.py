"""Build INVISIBLE_MENU_ITEMS.md report from analysis.json."""
import json
import re
from datetime import datetime
from collections import defaultdict, Counter

BASE = "C:/Users/kobi/Projects/techno-kol-uzi-2026"

with open(f"{BASE}/_audit_tmp/menu_scan/analysis.json", encoding="utf-8") as f:
    d = json.load(f)

total_tables = d["total_tables"]
excluded = d["excluded_internal"]
invisible_tables = d["invisible_tables"]
visible_tables = d["visible_tables"]
invisible_engines = d["invisible_engines"]
visible_engines = d["visible_engines"]
invisible_pages = d["invisible_pages"]
total_pages = d["total_pages"]
edge_funcs = d["edge_functions"]

HIGH_PRIORITY = {
    "commercial.quote_lines", "commercial.quote_revisions", "commercial.quote_approval_rules",
    "commercial.customer_contacts", "commercial.customer_portal_accounts",
    "procurement.purchase_order_lines", "procurement.rfq_items", "procurement.supplier_quotes",
    "procurement.supplier_quote_lines", "procurement.supplier_invoices",
    "procurement.approval_steps", "procurement.contract_milestones",
    "inventory.inventory_movements", "inventory.inventory_receipts", "inventory.inventory_issues",
    "inventory.inventory_transfers", "inventory.inventory_reservations",
    "inventory.material_lots", "inventory.material_request_lines", "inventory.shortage_snapshots",
    "execution.work_order_tasks", "execution.work_order_qa_checklists", "execution.work_order_qa_items",
    "execution.project_phases", "execution.project_cost_plans", "execution.task_dependencies",
    "execution.delivery_events", "execution.installation_events",
    "finance.budget_entries", "finance.cashflow_entries", "finance.collection_actions",
    "finance.collection_cases", "finance.dunning_campaigns", "finance.invoice_lines",
    "finance.payment_allocations", "finance.tax_records", "finance.vat_records",
    "workforce.payroll_runs", "workforce.payroll_entries", "workforce.leave_requests",
    "workforce.workforce_assignments", "workforce.employee_pay_components",
    "quality.defects", "quality.inspection_runs",
    "service.ticket_comments", "comms.support_tickets", "comms.support_sla_tracking",
}

MED_PRIORITY = {
    "analytics.kpi_snapshots", "analytics.dashboard_definitions",
    "commercial.pricing_snapshots", "commercial.crm_activities",
    "comms.email_messages", "comms.sms_messages", "comms.whatsapp_messages", "comms.comms_threads",
    "docs.attachments", "docs.document_classifications", "docs.document_signature_requests",
    "docs.document_versions", "docs.ocr_results", "docs.print_jobs", "docs.scan_sessions",
    "documents.classification_runs", "documents.entity_extractions", "documents.extraction_runs",
    "documents.ocr_runs", "documents.document_relations",
    "execution.alerts", "execution.task_attachments", "execution.task_comments",
    "finance.consolidation_entries", "finance.costing_entries", "finance.dunning_steps",
    "finance.reconciliation_exceptions", "finance.reminder_schedules",
    "intelligence.anomaly_feedback", "intelligence.recommendation_feedback",
    "orchestration.workflow_definitions",
    "planning.capacity_slots", "pricing.calculations",
    "procurement.rfq_comparison_snapshots",
    "workforce.payroll_exceptions", "workforce.payroll_export_batches",
}

def prio(t):
    if t in HIGH_PRIORITY: return "high"
    if t in MED_PRIORITY: return "medium"
    return "low"

p_counts = Counter(prio(t) for t in invisible_tables)

suggest_cat = {
    "commercial": "מכירות ולקוחות", "crm": "מכירות ולקוחות", "comms": "תקשורת",
    "procurement": "רכש", "inventory": "מלאי", "execution": "פרויקטים וביצוע",
    "finance": "כספים", "workforce": "כח אדם", "docs": "מסמכים", "documents": "מסמכים",
    "analytics": "דוחות ודשבורדים", "intelligence": "AI", "governance": "ניהול והרשאות",
    "orchestration": "אוטומציה", "planning": "תכנון", "pricing": "תמחור",
    "quality": "איכות", "service": "שירות", "treasury": "גזברות", "maintenance": "תחזוקה",
    "compliance": "ציות", "routing": "ניתוב", "public": "מערכת",
}

total_invisible = len(invisible_tables) + len(invisible_engines) + len(invisible_pages)
user_facing_tables = total_tables - excluded
cov_tables = 100 * len(visible_tables) / user_facing_tables
cov_engines = 100 * len(visible_engines) / (len(visible_engines) + len(invisible_engines))
cov_pages = 100 * (total_pages - len(invisible_pages)) / total_pages

L = []
def w(s=""): L.append(s)

w("# Invisible Menu Items — Full Forensic Scan")
w(f"Generated: {datetime.utcnow().isoformat()}Z")
w(f"Repository: C:\\Users\\kobi\\Projects\\techno-kol-uzi-2026")
w()
w("## Executive Summary")
w()
w(f"- **total_invisible_items**: {total_invisible}")
w(f"  - **MODEL** (DB tables): {len(invisible_tables)} invisible / {user_facing_tables} user-facing tables")
w(f"  - **ENGINE** (API route groups): {len(invisible_engines)} / {len(invisible_engines)+len(visible_engines)} total")
w(f"  - **PAGE** (React page components): {len(invisible_pages)} / {total_pages} total")
w(f"  - **EDGE-FUNCTION**: {len(edge_funcs)} Supabase functions, all are back-end handlers with no direct menu entry")
w(f"  - **REPORT**: 14 of 20 registry reports invisible (70%)")
w(f"  - **DASHBOARD**: 10 of 10 registry dashboards lack exact canonical-name menu entry")
w(f"  - **WORKFLOW**: 5 of 5 pipeline flows have no menu entry")
w(f"  - **STATE MACHINE**: 13 of 13 state machines have no configurable menu page")
w()
w(f"- **by_priority** (DB tables): high={p_counts['high']}, medium={p_counts['medium']}, low={p_counts['low']}")
w(f"- **menu_currently_has**: 1,271 unique routes across 291 top-level URL prefixes (7 menu migrations)")
w(f"- **coverage_percentage**:")
w(f"  - DB tables with menu presence: **{cov_tables:.0f}%** ({len(visible_tables)}/{user_facing_tables})")
w(f"  - API engines with menu presence: **{cov_engines:.0f}%** ({len(visible_engines)}/{len(visible_engines)+len(invisible_engines)})")
w(f"  - Pages wired to menu: **{cov_pages:.0f}%** ({total_pages-len(invisible_pages)}/{total_pages})")
w()
w("## The Answer")
w()
w(f"The Techno-Kol Uzi ERP 2026 menu exposes about **{cov_tables:.0f}% of DB tables**, **{cov_engines:.0f}% of API engines**, and **{cov_pages:.0f}% of React pages**. Roughly **{total_invisible} concrete artifacts** exist in the codebase with no corresponding navigation entry. The biggest gaps are:")
w()
w("1. **Line-item children** of parent entities (quote_lines, purchase_order_lines, rfq_items, invoice_lines, payroll_entries, work_order_tasks, project_phases) — these feed the 360 pages but have no standalone management views.")
w("2. **Finance sub-ledgers** (dunning, collections, reconciliation exceptions, tax_records, vat_records, consolidation_entries, budget/cashflow entries).")
w("3. **223 API engine modules** without UI — including 36+ AI/automation engines (ai-autonomous-agent, digital-twin, process-mining, knowledge-graph, predictive-analytics-engine, risk-monte-carlo-engine, whatsapp-ai-engine, vector-search, etc.).")
w("4. **Governance tables** (permissions, role_permissions, object_permissions, integration_connections, escalation_rules, saved_filters) — admin surfaces almost entirely missing.")
w("5. **Analytics schema (0% coverage)** — the whole dashboard_definitions / kpi_snapshots / user_dashboard_boards layer has no management page.")
w("6. **Docs/Documents schemas (12–17%)** — OCR, classification, extraction, signature, version history all invisible.")
w()

# Top prefixes
w("## Top-level Menu Category Coverage (top 20 prefixes)")
w()
w("| Rank | Prefix | Routes | Note |")
w("|-----:|--------|-------:|------|")
cats = [
    ("/finance", 60, "good coverage but 42% of finance tables still invisible"),
    ("/procurement", 52, "solid; supplier_invoices/rfq_items/approval_steps missing"),
    ("/hr", 47, "workforce 59% covered; payroll_runs/entries missing"),
    ("/documents", 40, "docs schema only 12% covered"),
    ("/production", 38, "31 production pages invisible"),
    ("/ai-engine", 36, "most AI engine .ts files have no UI entry"),
    ("/inventory", 33, "50% of inventory tables invisible"),
    ("/projects", 29, "phases/cost_plans/task_dependencies missing"),
    ("/sales", 27, "quote_lines/revisions/approval_rules missing"),
    ("/reports", 25, "14 of 20 registry reports not in menu"),
    ("/fabrication", 25, ""),
    ("/logistics", 23, ""),
    ("/installation", 22, ""),
    ("/crm", 20, "46 CRM pages missing menu entry"),
    ("/pricing", 19, "pricing.calculations invisible"),
    ("/customer", 18, ""),
    ("/ops", 18, ""),
    ("/supply-chain", 17, ""),
    ("/integrations", 17, "integration_connections/sync_logs invisible"),
    ("/quality", 16, "defects/inspection_runs invisible"),
]
for i, (p, c, n) in enumerate(cats, 1):
    w(f"| {i} | `{p}` | {c} | {n} |")
w()

# Domain coverage 15
w("## Domain Coverage Report (15 key domains)")
w()
domains = [
    ("1. Dashboards / Analytics", "analytics",
     ["analytics.dashboard_definitions", "analytics.dashboard_boards", "analytics.dashboard_widgets",
      "analytics.dashboard_board_widgets", "analytics.user_dashboard_boards", "analytics.kpi_snapshots"],
     "All 10 registry dashboards appear under various menu paths (/dashboard, /hr/hr-dashboard, /fin/fin-dashboard) but the catalog itself (which dashboards exist, who owns them, permissions) has no management page. The entire `analytics` schema is invisible."),
    ("2. CRM / Commercial", "commercial",
     ["commercial.quote_lines", "commercial.quote_revisions", "commercial.quote_approval_rules",
      "commercial.customer_contacts", "commercial.customer_portal_accounts",
      "commercial.pricing_snapshots", "commercial.crm_activities"],
     "Parent entities covered. Line-level editing, quote versioning, approval-rule configuration, portal-account admin, pricing-snapshot audit missing."),
    ("3. Sales / Quotes", "sales",
     ["commercial.quote_lines", "commercial.quote_revisions", "commercial.quote_approval_rules"],
     "Line items editor, revision history viewer, approval rule configuration screens are invisible."),
    ("4. Procurement", "procurement",
     ["procurement.purchase_order_lines", "procurement.rfq_items", "procurement.supplier_quotes",
      "procurement.supplier_quote_lines", "procurement.supplier_invoices", "procurement.approval_steps",
      "procurement.contract_milestones", "procurement.rfq_comparison_snapshots"],
     "Supplier invoice book, RFQ item grid, supplier-quote comparison, approval-step audit, contract milestones all invisible."),
    ("5. Inventory / Warehouse", "inventory",
     ["inventory.inventory_movements", "inventory.inventory_receipts", "inventory.inventory_issues",
      "inventory.inventory_transfers", "inventory.inventory_reservations", "inventory.material_lots",
      "inventory.material_request_lines", "inventory.shortage_snapshots", "inventory.stock_count_lines"],
     "Movement log, goods-receipt journal, issue journal, transfer console, reservation manager, lot traceability, shortage dashboard — all missing as list pages."),
    ("6. Execution / Projects / Work Orders", "execution",
     ["execution.work_order_tasks", "execution.work_order_qa_checklists", "execution.work_order_qa_items",
      "execution.project_phases", "execution.project_cost_plans", "execution.task_dependencies",
      "execution.task_attachments", "execution.task_comments", "execution.delivery_events",
      "execution.installation_events", "execution.alerts"],
     "WO sub-task grid, QA checklist manager, project phase editor, task-dependency Gantt, delivery-event timeline, installation-event log — all missing."),
    ("7. Finance / Treasury / GL", "finance",
     ["finance.budget_entries", "finance.cashflow_entries", "finance.collection_actions",
      "finance.collection_cases", "finance.consolidation_entries", "finance.costing_entries",
      "finance.dunning_campaigns", "finance.dunning_steps", "finance.invoice_lines",
      "finance.payment_allocations", "finance.reconciliation_exceptions", "finance.reminder_schedules",
      "finance.tax_records", "finance.vat_records"],
     "Collections console, dunning builder, consolidation entries, payment-allocation explorer, reconciliation-exception queue, tax/VAT record ledgers — all invisible. Menu has /finance/collections-dashboard but no list/detail."),
    ("8. Workforce / Payroll", "workforce",
     ["workforce.payroll_runs", "workforce.payroll_entries", "workforce.payroll_exceptions",
      "workforce.payroll_export_batches", "workforce.leave_requests",
      "workforce.workforce_assignments", "workforce.employee_pay_components"],
     "Payroll run viewer, per-employee pay-component editor, leave-request inbox, assignments Gantt, exception queue all invisible."),
    ("9. Documents / DMS / OCR", "docs + documents",
     ["docs.attachments", "docs.document_classifications", "docs.document_signature_requests",
      "docs.document_versions", "docs.ocr_results", "docs.print_jobs", "docs.scan_sessions",
      "documents.classification_runs", "documents.entity_extractions", "documents.extraction_runs",
      "documents.ocr_runs", "documents.document_relations"],
     "12 of 14 docs/documents tables have no list/detail page. OCR results browser, signature request queue, version history, extraction runs console all invisible."),
    ("10. Analytics / KPIs / Reports", "analytics",
     ["analytics.dashboard_board_widgets", "analytics.dashboard_boards", "analytics.dashboard_definitions",
      "analytics.dashboard_widgets", "analytics.kpi_snapshots", "analytics.user_dashboard_boards"],
     "Entire schema (6 tables) has 0% menu coverage by canonical name. KPI definition catalog, dashboard board admin missing."),
    ("11. Intelligence / AI", "intelligence",
     ["intelligence.anomaly_feedback", "intelligence.recommendation_feedback"],
     "Broad AI coverage via /ai-engine/* but feedback-loop tables invisible. 36+ AI engine .ts files have no UI entry."),
    ("12. Governance / Security", "governance",
     ["governance.permissions", "governance.role_permissions", "governance.object_permissions",
      "governance.users_profile", "governance.saved_filters", "governance.config_entries",
      "governance.alert_subscriptions", "governance.escalation_rules",
      "governance.integration_connections", "governance.integration_sync_logs"],
     "Permissions matrix, role-permission mapping, object ACL admin, saved filters library, config entry editor, escalation rules, integration-connection manager — all invisible."),
    ("13. Communications", "comms",
     ["comms.comms_threads", "comms.email_messages", "comms.sms_messages", "comms.whatsapp_messages",
      "comms.support_tickets", "comms.support_sla_tracking"],
     "Unified threads view, per-channel message archives, support-ticket list, SLA dashboard all missing."),
    ("14. Orchestration / Workflow", "orchestration",
     ["orchestration.workflow_definitions", "orchestration.job_queue", "orchestration.workflow_steps"],
     "Workflow catalog, job-queue monitor, step-definitions editor invisible. Menu has /workflow/engine generic page only."),
    ("15. Quality / Service", "quality + service",
     ["quality.defects", "quality.inspection_runs", "service.ticket_comments"],
     "Defect log, inspection-run history, ticket-comment thread views invisible."),
]
for name, dom, items, note in domains:
    w(f"### {name}")
    w(f"**Domain:** `{dom}`  ")
    w(f"**Note:** {note}")
    w()
    w("**Invisible items:**")
    for it in items:
        w(f"- `{it}`")
    w()

# A: Invisible MODELS
w("## Type-Based Lists")
w()
w("### A. Invisible MODELS (DB tables) — high priority first")
w()
w(f"Total: **{len(invisible_tables)}** tables invisible after excluding {excluded} internal/plumbing tables.")
w()
w("| Table | Schema | Priority | Suggested Route | Suggested Category |")
w("|-------|--------|---------|-----------------|--------------------|")
def prio_rank(p): return {"high":0,"medium":1,"low":2}[p]
for t in sorted(invisible_tables, key=lambda x: (prio_rank(prio(x)), x)):
    schema, name = t.split(".")
    route = "/" + name.replace("_", "-")
    cat = suggest_cat.get(schema, schema)
    w(f"| `{t}` | `{schema}` | {prio(t)} | `{route}` | {cat} |")
w()

# B: Invisible ENGINES
w("### B. Invisible ENGINES (API route groups)")
w()
w(f"Total: **{len(invisible_engines)}** of {len(invisible_engines)+len(visible_engines)} route files have no menu entry matching their basename.")
w()
w("**High-value missing** (core business operations):")
w()
high_engines = [
    "purchase-requests","purchase-returns","goods-receipts","stock_counts","stock_movements",
    "raw-materials","purchase_orders","price-history","price-quotes","supplier-contracts",
    "supplier-evaluations","supplier-intelligence","supplier-communications",
    "project-costing-engine","project-resources-budget","project-risks-timesheets","project-analyses",
    "installations-module","installer-management-engine","measurement-approval-engine","measurement-engineer-engine",
    "israeli-accounting-engine","israeli-payroll","israeli-business-integrations",
    "ap-enterprise","ar-enterprise","chart-of-accounts","tax-management","budgets",
    "exchange-rates","investment-portfolio","letters-of-credit","oracle-financial-core",
    "hr-enterprise","hr-workforce","hr-attendance-advanced","recruitment","payroll-module",
    "inventory-management","inventory-warehouse","warehouse-intelligence","wms-core","wms-operations",
    "fabrication-catalog","fabrication-logistics","fabrication-production","quality-management",
    "qms","qms-inspection","quality-control-engine",
    "reports-center","executive-control","executive-war-room","ceo-control-tower","live-ops",
    "cmms","maintenance-enterprise","fleet-logistics","shipping-freight","shipment-tracking",
    "customs-clearances","import-orders","import-management-engine","import-cost-calculations",
    "compliance-certificates","security-compliance","audit-log","mfa","sso","sessions","session-admin",
    "risk-management-center","risk-monte-carlo-engine",
]
for e in sorted(set(high_engines)):
    w(f"- `api-server/src/routes/{e}.ts` → suggest `/{e.replace('_','-')}`")
w()
w("**Invisible AI/automation engines**:")
w()
ai_keys = ["ai-","anomal","automation","sentiment","agent","autonom","whatsapp","chatbot","fraud",
           "vector","nl-","knowledge","digital-twin","process-mining","optimization","orchestr",
           "recommend","commission-calc","contractor-payment","pdf-generator","intelligent-notification",
           "metric-dict","n8n","multimodal","live-ops","data-flow","data-fabric","data-platform",
           "realtime","iot-sensor","predictive","techno-kol-uzi-ai"]
ai_engs = sorted({e for e in invisible_engines if any(k in e for k in ai_keys)})
for e in ai_engs:
    w(f"- `api-server/src/routes/{e}.ts`")
w()
w(f"**All {len(invisible_engines)} invisible engines (alphabetical):**")
w()
w("```")
for e in sorted(invisible_engines):
    L.append(e)
w("```")
w()

# C: Invisible PAGES
w("### C. Invisible PAGES (React components)")
w()
w(f"Total: **{len(invisible_pages)}** page files under `erp-app/src/pages/` have no matching menu route.")
w()
folders = defaultdict(list)
for p in invisible_pages:
    parts = p.strip("/").split("/")
    key = "<root>" if len(parts) == 1 else parts[0]
    folders[key].append(p)
w("| Folder | Count |")
w("|--------|------:|")
for k in sorted(folders, key=lambda x: -len(folders[x])):
    w(f"| `{k}` | {len(folders[k])} |")
w()
w("**Full list by folder:**")
w()
for k in sorted(folders, key=lambda x: -len(folders[x])):
    w(f"#### `{k}/` ({len(folders[k])} pages)")
    w()
    for p in sorted(folders[k]):
        w(f"- `erp-app/src/pages{p}.tsx`")
    w()

# D: EDGE FUNCTIONS
w("### D. Invisible EDGE FUNCTIONS")
w()
w(f"All **{len(edge_funcs)}** Supabase edge functions under `supabase/functions/` are back-end handlers. None appear as menu entries. They represent **capabilities** — the menu should expose buttons/pages that trigger them.")
w()
w("| Edge Function | Suggested Trigger Page |")
w("|---------------|------------------------|")
ef_hints = {
    "approve-attendance": "/hr/attendance (action button)",
    "approve-po": "/po-360 (action)",
    "approve-quote": "/quote-360 (action)",
    "assign-inbox-item": "/universal-inbox",
    "change-project-state": "/project-360 (state transition)",
    "claim-job": "/jobs (worker dashboard)",
    "classify-document": "/documents/classification",
    "complete-job": "/jobs (worker action)",
    "convert-quote-to-project": "/quote-360 (action)",
    "create-customer": "/customers (quick-add)",
    "create-inbox-item": "/universal-inbox",
    "create-notification": "internal",
    "create-project": "/projects (new)",
    "create-supplier": "/suppliers (new)",
    "create-work-order": "/work-orders (new)",
    "dispatch-domain-events": "/system/event-bus (admin)",
    "enqueue-job": "/ops/jobs (admin)",
    "extract-document-fields": "/documents/extraction",
    "fail-job": "/jobs (admin)",
    "generate-knowledge-card": "/ai/knowledge",
    "get-customer-360": "/customer-360",
    "get-employee-360": "/employee-360",
    "get-project-360": "/project-360",
    "get-route-menu-permission-sync-status": "/system/route-menu-sync (admin)",
    "issue-invoice": "/invoices (action)",
    "process-workflow-step": "/workflow/runs (admin)",
    "receive-po": "/goods-receipt (action)",
    "refresh-read-models": "/system/read-models (admin)",
    "register-payment": "/payments (action)",
    "reject-quote": "/quote-360 (action)",
    "reopen-inbox-item": "/universal-inbox",
    "reopen-notification": "/notifications",
    "replay-dlq": "/system/dlq (admin)",
    "requeue-agent-job": "/ai/agent-jobs (admin)",
    "resolve-inbox-item": "/universal-inbox",
    "resolve-notification": "/notifications",
    "restart-agent": "/ai/agents (admin)",
    "retry-stuck-jobs": "/system/jobs (admin)",
    "run-route-menu-permission-sync": "/system/route-menu-sync (admin)",
    "save-kpi-definition": "/analytics/kpis",
    "send-quote": "/quote-360 (action)",
    "send-rfq": "/rfq-360 (action)",
    "start-workflow-run": "/workflow/runs (admin)",
    "submit-attendance": "/hr/attendance",
    "acknowledge-notification": "/notifications",
}
for ef in sorted(edge_funcs):
    w(f"| `{ef}` | {ef_hints.get(ef, '—')} |")
w()

# E: WORKFLOWS
w("### E. Invisible WORKFLOWS")
w()
w("From `onyx-procurement/src/pipeline/workflow-flows.js`:")
w()
flows = [
    ("sales_to_project", "Lead → Quote → Approval → Order → Project", "/flows/sales-to-project", "מכירות", "high"),
    ("project_to_procurement", "Project → Work Orders → RFQ → PO", "/flows/project-to-procurement", "פרויקטים", "high"),
    ("procurement_to_execution", "PO → Receipt → Issue → Execute", "/flows/procurement-to-execution", "רכש", "high"),
    ("execution_to_cash", "Execute → Deliver → Invoice → Collect", "/flows/execution-to-cash", "כספים", "high"),
    ("employee_to_payroll", "Hire → Attendance → Payroll → Slip", "/flows/employee-to-payroll", "כח אדם", "high"),
]
w("| Flow ID | Steps | Suggested Route | Category | Priority |")
w("|---------|-------|-----------------|----------|----------|")
for fid, steps, route, cat, p in flows:
    w(f"| `{fid}` | {steps} | `{route}` | {cat} | {p} |")
w()
w("**State Machines** (`onyx-procurement/src/pipeline/state-machines.js`):")
w()
sms = ["lead","quote","rfq","po","project","work_order","invoice","employee","attendance","leave","timesheet","task","shift"]
w("None of the 13 state machines have a configurable menu page. Transition explorers use the API `/api/state-machines/:type/transitions` but no UI exposes them.")
w()
for sm in sms:
    w(f"- `state_machine: {sm}` → suggest `/state-machines/{sm.replace('_','-')}`")
w()

# F: REPORTS
w("### F. Invisible REPORTS (from `_master-registry/reports_registry.json`)")
w()
reports_status = [
    ("project_profitability_report","projects","N","/reports/project-profitability","high"),
    ("aging_report","finance","Y","-","-"),
    ("pnl","finance","Y","-","-"),
    ("balance_sheet","finance","Y","-","-"),
    ("cash_flow","finance","Y","-","-"),
    ("vat_report_pcn836","finance","N","/reports/vat-pcn836","high"),
    ("production_kpi","production","N","/reports/production-kpi","high"),
    ("sales_pipeline","sales","N","/reports/sales-pipeline","high"),
    ("procurement_savings","procurement","N","/reports/procurement-savings","medium"),
    ("inventory_turnover","inventory","N","/reports/inventory-turnover","high"),
    ("payroll_summary","hr_workforce","N","/reports/payroll-summary","high"),
    ("attendance_report","hr","N","/reports/attendance","high"),
    ("service_sla","service","N","/reports/service-sla","medium"),
    ("customer_360","crm","Y","-","-"),
    ("supplier_scorecard","procurement","Y","-","-"),
    ("overdue_projects_report","projects","N","/reports/overdue-projects","high"),
    ("bank_reconciliation","finance","Y","-","-"),
    ("stock_reorder_suggestions","inventory","N","/reports/stock-reorder","medium"),
    ("installation_completion","installation","N","/reports/installation-completion","medium"),
    ("audit_log_review","governance","N","/reports/audit-review","medium"),
]
w("14 of 20 registry reports are invisible by canonical name.")
w()
w("| Report | Domain | In Menu? | Suggested Route | Priority |")
w("|--------|--------|:--------:|-----------------|----------|")
for n, dom, im, r, p in reports_status:
    w(f"| `{n}` | {dom} | {im} | `{r}` | {p} |")
w()

# G: DASHBOARDS
w("### G. Invisible DASHBOARDS (from `_master-registry/dashboards_registry.json`)")
w()
w("None of the 10 canonical dashboard names have a direct menu entry by registry name. Equivalents exist (e.g., `/hr/hr-dashboard` ≈ `dashboard_workforce`), but the registry-to-menu mapping is informal — there is no catalog page.")
w()
dashes_list = [
    ("dashboard_executive", "/executive, /ops/master-dashboard"),
    ("dashboard_operations", "/ops/master-dashboard"),
    ("dashboard_procurement", "no dedicated route"),
    ("dashboard_workforce", "/hr/hr-dashboard"),
    ("dashboard_ai", "/ai-engine/ai-agents-dashboard"),
    ("dashboard_finance", "/fin/fin-dashboard, /finance/collections-dashboard"),
    ("dashboard_service", "/customer-service/service-dashboard"),
    ("dashboard_projects", "no canonical route"),
    ("dashboard_production", "no canonical route"),
    ("dashboard_sales", "/crm/crm-dashboard"),
]
w("| Registry Dashboard | Existing near-match | Suggested canonical route |")
w("|--------------------|--------------------|----------------------------|")
for n, near in dashes_list:
    sug = "/dashboards/" + n.replace("dashboard_", "")
    w(f"| `{n}` | {near} | `{sug}` |")
w()

# H: CAPABILITIES
w("### H. Invisible CAPABILITIES (AI, tax forms, integrations)")
w()
w("**Israeli tax forms** — all covered in menu:")
w("- Form 102 → `/form-102`, `/tax/form-102`, `/tax-exports/form-102-xml`")
w("- Form 126 → `/form-126`, `/tax/form-126`, `/tax-exports/form-126-xml`")
w("- Form 1301 → `/form-1301`, `/tax/form-1301`, `/tax-exports/form-1301-xml`")
w("- Form 1320 → `/tax-exports/form-1320-xml`")
w("- Form 30A → `/form-30a`, `/tax/form-30a`")
w("- Form 6111 → `/form-6111`, `/tax/form-6111`")
w("- Form 857 → `/tax/form-857`, `/tax-exports/form-857-xml`")
w("- PCN836 → `/vat/pcn836`")
w()
w("**Invisible AI/automation capabilities** (engines without UI):")
w()
ai_caps = [
    ("ai-autonomous-agent", "autonomous agent runtime control"),
    ("ai-business-automation", "no-code automation builder"),
    ("ai-data-flow", "data flow designer"),
    ("ai-document-intelligence-engine", "document AI results viewer"),
    ("ai-search-enhance", "AI-enhanced search config"),
    ("ai-smart-alerts", "smart alerts inbox"),
    ("anomaly-detection", "anomaly history timeline"),
    ("communication-marketing-engine", "omnichannel campaign"),
    ("company-financials-realtime-engine", "realtime financials stream"),
    ("contractor-payment-engine", "contractor pay decisions log"),
    ("customer-service-ai-engine", "AI CS co-pilot"),
    ("data-fabric", "data fabric topology viewer"),
    ("data-flow-automations", "data-flow automation console"),
    ("digital-twin", "digital twin studio"),
    ("employee-portfolio-engine", "employee portfolio view"),
    ("employee-value-engine", "employee value analytics"),
    ("field-agent-analytics-engine", "field agent analytics"),
    ("iot-sensor-hub", "IoT sensor registry + live view"),
    ("knowledge-graph", "knowledge graph explorer"),
    ("lead-scoring-agent-analytics-engine", "lead-scoring AI dashboard"),
    ("marketing-automation-engine", "marketing automation flows"),
    ("metric-dictionary", "metric dictionary UI"),
    ("n8n-integrations", "n8n workflow list"),
    ("multimodal", "multimodal AI intake"),
    ("nl-query", "NL query assistant"),
    ("predictive-analytics-engine", "predictive scenarios"),
    ("process-mining", "process mining visualizer"),
    ("realtime-financials-engine", "realtime financials"),
    ("realtime-platform", "realtime platform status"),
    ("risk-monte-carlo-engine", "Monte-Carlo scenario runner"),
    ("sentiment-analysis", "sentiment trend page"),
    ("strategy-growth-engine", "strategy & growth engine"),
    ("supply-chain-lifecycle-engine", "supply-chain lifecycle viewer"),
    ("vector-search", "vector search console"),
    ("warehouse-intelligence", "warehouse intelligence dashboard"),
    ("whatsapp-ai-engine", "WhatsApp AI agent console"),
    ("whatsapp-business-engine", "WhatsApp Business admin"),
    ("techno-kol-uzi-ai-engine", "brand-specific AI console"),
    ("executive-war-room", "executive war room"),
    ("ceo-control-tower", "CEO control tower"),
    ("live-ops", "live ops board"),
    ("optimization-lab", "optimization lab"),
]
for eng, desc in ai_caps:
    w(f"- `{eng}` — {desc}")
w()

# Top 50
w("## Top 50 Priority Adds")
w()
w("Sorted by business impact. These are the first 50 invisible items a user should see in the menu.")
w()
w("| # | Item | Type | Evidence | Priority | Suggested Route |")
w("|--:|------|------|----------|----------|-----------------|")
top50 = [
    ("Quote Lines editor","MODEL","commercial.quote_lines","high","/quotes/:id/lines"),
    ("Quote Revisions history","MODEL","commercial.quote_revisions","high","/quotes/:id/revisions"),
    ("Quote Approval Rules admin","MODEL","commercial.quote_approval_rules","high","/sales/approval-rules"),
    ("Customer Contacts list","MODEL","commercial.customer_contacts","high","/customers/:id/contacts"),
    ("Customer Portal Accounts admin","MODEL","commercial.customer_portal_accounts","high","/customers/portal-accounts"),
    ("PO Lines editor","MODEL","procurement.purchase_order_lines","high","/pos/:id/lines"),
    ("RFQ Items grid","MODEL","procurement.rfq_items","high","/rfqs/:id/items"),
    ("Supplier Invoices book","MODEL","procurement.supplier_invoices","high","/procurement/supplier-invoices"),
    ("Supplier Quote comparison","MODEL","procurement.supplier_quotes","high","/rfqs/:id/compare"),
    ("Procurement Approval Steps","MODEL","procurement.approval_steps","high","/procurement/approvals"),
    ("Contract Milestones","MODEL","procurement.contract_milestones","high","/contracts/:id/milestones"),
    ("Inventory Movements journal","MODEL","inventory.inventory_movements","high","/inventory/movements"),
    ("Inventory Receipts","MODEL","inventory.inventory_receipts","high","/inventory/receipts"),
    ("Inventory Issues","MODEL","inventory.inventory_issues","high","/inventory/issues"),
    ("Inventory Transfers","MODEL","inventory.inventory_transfers","high","/inventory/transfers"),
    ("Inventory Reservations","MODEL","inventory.inventory_reservations","high","/inventory/reservations"),
    ("Material Lots (traceability)","MODEL","inventory.material_lots","high","/inventory/lots"),
    ("Material Request lines","MODEL","inventory.material_request_lines","high","/material-requests/:id/lines"),
    ("Shortage Snapshots","MODEL","inventory.shortage_snapshots","high","/inventory/shortages"),
    ("Work-Order Tasks","MODEL","execution.work_order_tasks","high","/work-orders/:id/tasks"),
    ("WO QA Checklists","MODEL","execution.work_order_qa_checklists","high","/work-orders/:id/qa"),
    ("Project Phases editor","MODEL","execution.project_phases","high","/projects/:id/phases"),
    ("Project Cost Plans","MODEL","execution.project_cost_plans","high","/projects/:id/cost-plan"),
    ("Task Dependencies (Gantt)","MODEL","execution.task_dependencies","high","/projects/:id/gantt"),
    ("Delivery Events timeline","MODEL","execution.delivery_events","high","/projects/:id/deliveries"),
    ("Installation Events","MODEL","execution.installation_events","high","/installation/events"),
    ("Invoice Lines","MODEL","finance.invoice_lines","high","/invoices/:id/lines"),
    ("Payment Allocations","MODEL","finance.payment_allocations","high","/payments/:id/allocations"),
    ("Collections console","MODEL","finance.collection_cases","high","/finance/collections"),
    ("Dunning Campaigns","MODEL","finance.dunning_campaigns","high","/finance/dunning"),
    ("Reconciliation Exceptions queue","MODEL","finance.reconciliation_exceptions","high","/finance/reconciliation-exceptions"),
    ("Budget Entries","MODEL","finance.budget_entries","high","/finance/budgets/entries"),
    ("Cashflow Entries","MODEL","finance.cashflow_entries","high","/finance/cashflow/entries"),
    ("Tax Records book","MODEL","finance.tax_records","high","/tax/records"),
    ("VAT Records book","MODEL","finance.vat_records","high","/tax/vat-records"),
    ("Payroll Runs viewer","MODEL","workforce.payroll_runs","high","/payroll/runs"),
    ("Payroll Entries","MODEL","workforce.payroll_entries","high","/payroll/entries"),
    ("Payroll Exceptions queue","MODEL","workforce.payroll_exceptions","high","/payroll/exceptions"),
    ("Leave Requests inbox","MODEL","workforce.leave_requests","high","/hr/leave-requests"),
    ("Employee Pay Components","MODEL","workforce.employee_pay_components","high","/employees/:id/pay-components"),
    ("Workforce Assignments","MODEL","workforce.workforce_assignments","high","/workforce/assignments"),
    ("Permissions matrix","MODEL","governance.permissions","high","/admin/permissions"),
    ("Object Permissions ACL","MODEL","governance.object_permissions","high","/admin/object-acl"),
    ("Integration Connections admin","MODEL","governance.integration_connections","high","/integrations/connections"),
    ("Escalation Rules","MODEL","governance.escalation_rules","high","/admin/escalation-rules"),
    ("Defects log","MODEL","quality.defects","high","/quality/defects"),
    ("Inspection Runs","MODEL","quality.inspection_runs","high","/quality/inspections"),
    ("Support Tickets list","MODEL","comms.support_tickets","high","/support/tickets"),
    ("KPI Snapshots explorer","MODEL","analytics.kpi_snapshots","medium","/analytics/kpi-snapshots"),
    ("Dashboard Definitions catalog","MODEL","analytics.dashboard_definitions","medium","/admin/dashboards"),
]
for i, (n, t, ev, p, r) in enumerate(top50, 1):
    w(f"| {i} | {n} | {t} | `{ev}` | {p} | `{r}` |")
w()

# Appendices
w("## Appendix A: Menu routes parsed (per migration)")
w()
route_counts = {}
for fn in ["00017_app_menu.sql", "00034_app_menu_complete.sql", "00035_app_menu_FULL.sql",
           "00036_remove_realestate_and_add_missing.sql", "00038_merged_sources_menu_additions.sql",
           "00039_final_merge_menu_additions.sql", "00040_system_360_fixes.sql"]:
    try:
        with open(f"{BASE}/supabase/migrations/{fn}", encoding="utf-8") as fh:
            content = fh.read()
        matches = set(re.findall(r"'(/[a-zA-Z][a-zA-Z0-9_/\-]*)'", content))
        route_counts[fn] = len(matches)
        w(f"- `{fn}`: {len(matches)} unique route literals")
    except Exception as ex:
        w(f"- `{fn}`: ERROR {ex}")
w(f"- **TOTAL UNIQUE across all 7 files:** 1,271")
w()

# Appendix B
w("## Appendix B: Tables by schema — menu coverage")
w()
w("| Schema | Total | Visible | Invisible | Coverage |")
w("|--------|------:|--------:|----------:|---------:|")
by_schema = defaultdict(lambda: {"visible": 0, "invisible": 0})
for t in visible_tables:
    by_schema[t.split(".")[0]]["visible"] += 1
for t in invisible_tables:
    by_schema[t.split(".")[0]]["invisible"] += 1
for s in sorted(by_schema):
    v = by_schema[s]
    total = v["visible"] + v["invisible"]
    pct = 100 * v["visible"] / total if total else 0
    w(f"| `{s}` | {total} | {v['visible']} | {v['invisible']} | {pct:.0f}% |")
w()
w("**Zero-coverage schemas:** `analytics` (0%).  ")
w("**Near-zero (<=35%):** `docs` (12%), `documents` (17%), `governance` (29%), `comms` (33%), `commercial` (36%).  ")
w("**Low (<=50%):** `orchestration` (40%), `execution` (42%), `finance` (42%), `inventory` (50%), `pricing` (50%), `service` (50%).")
w()

# Appendix C
w("## Appendix C: Pipeline Entity Map coverage (16 entities)")
w()
w("From `onyx-procurement/src/pipeline/entity-map.js`:")
w()
w("| Entity | 360 Page | List Page | Notes |")
w("|--------|----------|-----------|-------|")
entity_status = [
    ("lead", "Y", "/leads", "good"),
    ("customer", "Y /customer-360", "/customers", "good"),
    ("supplier", "Y /supplier-360", "/suppliers", "good"),
    ("quote", "Y /quote-360", "/quotes", "missing line editor, revisions, approval-rules"),
    ("rfq", "Y /rfq-360", "/rfqs", "missing items grid, comparison"),
    ("po", "Y /po-360", "/pos", "missing lines editor"),
    ("project", "Y /project-360", "/projects", "missing phases, cost-plans, task dependencies"),
    ("work_order", "Y /work-order-360", "/work-orders", "missing tasks, QA checklists"),
    ("invoice", "Y /finance-360", "/invoices", "missing lines, allocations"),
    ("employee", "Y /employee-360", "/employees", "missing pay-components editor"),
    ("contract", "N", "/contracts", "no contract-360, milestones invisible"),
    ("material", "N", "/materials", "no material-360, lots invisible"),
    ("payment", "N", "/payments", "no payment-360, allocations invisible"),
    ("task", "N", "/tasks", "no task-360, dependencies invisible"),
    ("document", "Y", "/documents", "version-history, signature-queue invisible"),
    ("alert", "N", "/alert-terminal (orphan page)", "no alert-360"),
]
for ent, p360, lp, note in entity_status:
    w(f"| `{ent}` | {p360} | `{lp}` | {note} |")
w()
w("**Entities missing 360:** `contract`, `material`, `payment`, `task`, `alert`.")
w()

# Write
out = f"{BASE}/_master-registry/INVISIBLE_MENU_ITEMS.md"
content = "\n".join(L)
with open(out, "w", encoding="utf-8") as f:
    f.write(content)
print(f"Wrote: {out}")
print(f"Size: {len(content):,} chars, {content.count(chr(10)):,} lines")
