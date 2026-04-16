/**
 * System Wiring Spec — Techno-Kol Uzi ERP 2026
 *
 * This is the master blueprint that connects:
 *  - Service ownership
 *  - Entity relationships (parent/child/polymorphic)
 *  - Canonical routes (list/detail/action)
 *  - Page contracts (tabs, buttons per page)
 *  - Action→API mappings
 *  - Cross-service API contracts
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// 1) SERVICE OWNERSHIP MAP
// ═══════════════════════════════════════════════════════════════

const SERVICE_OWNERSHIP = {
  ops: {
    role: 'operational_core', label: 'Techno-Kol OPS', port: 3200,
    entities: ['lead', 'customer', 'project', 'work_order', 'task', 'material_request', 'logistics_order', 'employee_assignment', 'alert', 'report', 'pipeline_stage'],
    responsibilities: ['commercial_to_operational_conversion', 'project_execution', 'work_tracking', 'task_management', 'field_operations', 'operational_alerts'],
  },
  procurement: {
    role: 'finance_procurement_backbone', label: 'Onyx Procurement', port: 3100,
    entities: ['rfq', 'supplier', 'supplier_quote', 'po', 'approval', 'contract', 'inventory_receipt', 'supplier_invoice', 'invoice', 'payment', 'receipt', 'vat_record', 'tax_record', 'bank_match', 'cashflow_entry', 'budget_entry', 'costing_entry', 'gl_transaction', 'collection_case', 'expense', 'return', 'warranty_case', 'document'],
    responsibilities: ['procurement_flow', 'supplier_management', 'approvals', 'accounts_payable', 'accounts_receivable', 'tax_and_vat', 'bank_reconciliation', 'financial_posting'],
  },
  payroll: {
    role: 'workforce_and_salary_engine', label: 'Payroll Autonomous', port: 5173,
    entities: ['employee', 'employer', 'attendance', 'payroll', 'wage_slip', 'pension_record', 'employee_expense', 'hr_profile', 'support_ticket'],
    responsibilities: ['time_tracking', 'payroll_calculation', 'pension', 'workforce_records', 'employee_portals'],
  },
  ai: {
    role: 'intelligence_and_automation_layer', label: 'Onyx AI', port: 3300,
    entities: ['ai_insight', 'forecast_model', 'anomaly_case', 'quality_score', 'trend_signal', 'decision_recommendation'],
    responsibilities: ['anomaly_detection', 'forecasting', 'recommendations', 'risk_detection', 'cross_service_signals'],
  },
};

// ═══════════════════════════════════════════════════════════════
// 2) ENTITY RELATIONSHIP SPEC
// ═══════════════════════════════════════════════════════════════

const ENTITY_RELATIONSHIPS = {
  lead:       { belongs_to: ['customer?', 'pipeline_stage', 'sales_owner?'], has_many: ['task', 'message', 'document', 'audit_log'], can_create: ['quote', 'customer'] },
  customer:   { has_many: ['lead', 'quote', 'contract', 'project', 'invoice', 'payment', 'collection_case', 'document', 'message', 'support_ticket'], has_one: ['customer_portal?'] },
  supplier:   { has_many: ['rfq', 'supplier_quote', 'po', 'supplier_invoice', 'payment', 'contract', 'return', 'warranty_case', 'document', 'performance_score'], has_one: ['supplier_portal?'] },
  quote:      { belongs_to: ['lead?', 'customer'], has_many: ['quote_line', 'approval', 'document', 'audit_log'], has_one: ['pricing_snapshot', 'contract?', 'project?'], can_create: ['approval', 'project', 'contract'] },
  rfq:        { belongs_to: ['project?', 'material_request?'], has_many: ['rfq_item', 'rfq_supplier_invite', 'supplier_quote', 'approval', 'document'], can_create: ['po'] },
  po:         { belongs_to: ['supplier', 'rfq?', 'project?'], has_many: ['po_line', 'inventory_receipt', 'supplier_invoice', 'return', 'warranty_case', 'document', 'audit_log'], has_one: ['approval_status', 'costing_impact'] },
  contract:   { belongs_to: ['customer?', 'supplier?', 'quote?', 'po?', 'project?'], has_many: ['signature', 'document', 'audit_log'] },
  project:    { belongs_to: ['customer', 'quote?', 'contract?', 'project_owner?'], has_many: ['work_order', 'po', 'material_request', 'inventory_reservation', 'employee_assignment', 'task', 'expense', 'logistics_order', 'invoice', 'payment', 'alert', 'report', 'document', 'audit_log'] },
  work_order: { belongs_to: ['project'], has_many: ['work_order_task', 'employee_assignment', 'attendance', 'material_request', 'inventory_reservation', 'quality_check', 'signature', 'expense', 'audit_log'] },
  material:   { belongs_to: ['category?', 'preferred_supplier?'], has_many: ['inventory_transaction', 'po', 'material_request', 'work_order_consumption', 'barcode_scan', 'costing_entry'] },
  inventory:  { belongs_to: ['material', 'warehouse'], has_many: ['inventory_receipt', 'inventory_issue', 'inventory_transfer', 'inventory_reservation', 'stock_count'] },
  warehouse:  { has_many: ['inventory', 'inventory_receipt', 'inventory_issue', 'logistics_order', 'barcode_scan'] },
  employee:   { belongs_to: ['employer'], has_many: ['attendance', 'payroll', 'wage_slip', 'pension_record', 'employee_expense', 'employee_assignment', 'work_order', 'task', 'document', 'audit_log'] },
  attendance: { belongs_to: ['employee', 'work_order?', 'project?'], has_many: ['alert?', 'audit_log'] },
  payroll:    { belongs_to: ['employee', 'employer'], has_many: ['wage_slip', 'pension_record', 'tax_export', 'bank_file', 'audit_log'] },
  invoice:    { belongs_to: ['customer?', 'supplier?', 'project?', 'po?'], has_many: ['payment', 'vat_record', 'tax_record', 'bank_match', 'collection_case', 'document', 'audit_log'] },
  payment:    { belongs_to: ['invoice', 'customer?', 'supplier?'], has_one: ['bank_match?', 'gl_transaction'], has_many: ['audit_log'] },
  task:       { belongs_to: ['lead?', 'customer?', 'project?', 'work_order?', 'employee?'], has_many: ['message', 'audit_log'] },
  document:   { polymorphic_parent: ['customer', 'supplier', 'quote', 'rfq', 'po', 'contract', 'project', 'work_order', 'invoice', 'employee'], has_many: ['ocr_result?', 'signature?', 'audit_log'] },
  alert:      { polymorphic_parent: ['project', 'work_order', 'po', 'attendance', 'payroll', 'cashflow_entry', 'forecast_model', 'anomaly_case'], has_many: ['task?', 'message?', 'audit_log'] },
};

// ═══════════════════════════════════════════════════════════════
// 3) CANONICAL ROUTES
// ═══════════════════════════════════════════════════════════════

const CANONICAL_ROUTES = {
  customers:      { list: '/customers', new: '/customers/new', detail: '/customers/:id', edit: '/customers/:id/edit', portal: '/customers/:id/portal' },
  suppliers:      { list: '/suppliers', new: '/suppliers/new', detail: '/suppliers/:id', edit: '/suppliers/:id/edit', portal: '/suppliers/:id/portal' },
  leads:          { list: '/leads', new: '/leads/new', detail: '/leads/:id', edit: '/leads/:id/edit', create_quote: '/leads/:id/create-quote', move_stage: '/leads/:id/move-stage' },
  quotes:         { list: '/quotes', new: '/quotes/new', detail: '/quotes/:id', edit: '/quotes/:id/edit', approve: '/quotes/:id/approve', convert: '/quotes/:id/convert-to-project', export: '/quotes/:id/export' },
  rfq:            { list: '/rfq', new: '/rfq/new', detail: '/rfq/:id', edit: '/rfq/:id/edit', send: '/rfq/:id/send', compare: '/rfq/:id/compare', approve: '/rfq/:id/approve', convert: '/rfq/:id/convert-to-po' },
  po:             { list: '/po', new: '/po/new', detail: '/po/:id', edit: '/po/:id/edit', approve: '/po/:id/approve', send: '/po/:id/send', receive: '/po/:id/receive', close: '/po/:id/close' },
  projects:       { list: '/projects', new: '/projects/new', detail: '/projects/:id', edit: '/projects/:id/edit', status: '/projects/:id/change-status', create_wo: '/projects/:id/create-work-order', create_po: '/projects/:id/create-po', create_inv: '/projects/:id/create-invoice' },
  work_orders:    { list: '/work-orders', new: '/work-orders/new', detail: '/work-orders/:id', edit: '/work-orders/:id/edit', assign: '/work-orders/:id/assign', qa: '/work-orders/:id/qa', signoff: '/work-orders/:id/signoff' },
  invoices:       { list: '/invoices', new: '/invoices/new', detail: '/invoices/:id', edit: '/invoices/:id/edit', issue: '/invoices/:id/issue', pay: '/invoices/:id/register-payment', collections: '/invoices/:id/collections' },
  payments:       { list: '/payments', new: '/payments/new', detail: '/payments/:id', reconcile: '/payments/:id/reconcile' },
  employees:      { list: '/employees', new: '/employees/new', detail: '/employees/:id', edit: '/employees/:id/edit', attendance: '/employees/:id/attendance', payroll: '/employees/:id/payroll', expenses: '/employees/:id/expenses' },
  payroll:        { list: '/payroll', run: '/payroll/run', detail: '/payroll/:id', approve: '/payroll/:id/approve', export: '/payroll/:id/export' },
  inventory:      { list: '/inventory', detail: '/inventory/:id', receive: '/inventory/receive', issue: '/inventory/issue', reserve: '/inventory/reserve', count: '/inventory/count' },
  materials:      { list: '/materials', new: '/materials/new', detail: '/materials/:id', edit: '/materials/:id/edit' },
  documents:      { list: '/documents', upload: '/documents/upload', detail: '/documents/:id', ocr: '/documents/:id/ocr', sign: '/documents/:id/sign' },
  contracts:      { list: '/contracts', new: '/contracts/new', detail: '/contracts/:id', sign: '/contracts/:id/sign' },
  tasks:          { list: '/tasks', new: '/tasks/new', detail: '/tasks/:id', edit: '/tasks/:id/edit' },
  finance:        { dashboard: '/finance', bank: '/bank', vat: '/vat', tax: '/annual-tax', collections: '/collections', cash: '/cash', budget: '/budget' },
  ai:             { anomaly: '/ai/anomaly', forecast: '/ai/forecast', insights: '/ai/insights', quality: '/ai/quality', trends: '/ai/trends', nlq: '/ai/nlq' },
};

// ═══════════════════════════════════════════════════════════════
// 4) PAGE CONTRACTS — REQUIRED TABS PER 360 PAGE
// ═══════════════════════════════════════════════════════════════

const PAGE_CONTRACTS = {
  customer360: {
    tabs: ['overview', 'leads', 'quotes', 'projects', 'invoices', 'payments', 'collections', 'communications', 'documents', 'support', 'audit_log'],
    widgets: ['customer_summary_card', 'open_balance_card', 'active_projects_card', 'recent_activity_feed', 'overdue_invoices_card'],
    primary_actions: ['create_quote', 'create_project', 'issue_invoice'],
    secondary_actions: ['add_document', 'send_message', 'open_portal'],
  },
  supplier360: {
    tabs: ['overview', 'rfq', 'supplier_quotes', 'purchase_orders', 'supplier_invoices', 'payments', 'returns', 'warranty', 'contracts', 'scorecard', 'documents', 'audit_log'],
    widgets: ['supplier_summary_card', 'open_po_card', 'delivery_performance_card', 'defect_rate_card', 'overdue_supplier_invoice_card'],
    primary_actions: ['create_rfq', 'create_po', 'register_supplier_invoice', 'create_return'],
    secondary_actions: ['add_contract', 'view_portal', 'view_score', 'add_document'],
  },
  quote360: {
    tabs: ['overview', 'line_items', 'pricing', 'taxes', 'approvals', 'attachments', 'customer_link', 'audit_log'],
    widgets: ['quote_total_card', 'margin_card', 'approval_status_card', 'conversion_status_card'],
    primary_actions: ['send_quote', 'approve_quote', 'convert_to_project'],
    secondary_actions: ['export_pdf', 'duplicate_quote'],
  },
  rfq360: {
    tabs: ['overview', 'requested_items', 'suppliers', 'supplier_quotes', 'comparison', 'approvals', 'attachments', 'audit_log'],
    widgets: ['rfq_summary_card', 'supplier_response_rate_card', 'savings_potential_card', 'approval_status_card'],
    primary_actions: ['send_rfq', 'compare_quotes', 'approve_rfq', 'convert_to_po'],
    secondary_actions: ['add_supplier', 'attach_document', 'export_comparison'],
  },
  project360: {
    tabs: ['overview', 'timeline', 'work_orders', 'procurement', 'materials', 'inventory', 'employees', 'tasks', 'expenses', 'logistics', 'invoices', 'payments', 'reports', 'alerts', 'documents', 'audit_log'],
    widgets: ['project_summary_card', 'status_timeline', 'budget_vs_actual_card', 'procurement_status_card', 'execution_progress_card', 'invoice_status_card', 'alerts_card'],
    primary_actions: ['create_work_order', 'create_po', 'allocate_materials', 'assign_employees', 'add_task', 'add_expense', 'create_invoice', 'close_project'],
    secondary_actions: ['open_logistics', 'upload_document', 'change_status'],
  },
  workOrder360: {
    tabs: ['overview', 'execution', 'team', 'attendance', 'materials', 'reservations', 'quality', 'signatures', 'expenses', 'alerts', 'documents', 'audit_log'],
    widgets: ['workorder_summary_card', 'progress_card', 'assigned_team_card', 'reserved_materials_card', 'qa_status_card'],
    primary_actions: ['assign_worker', 'reserve_materials', 'start_work', 'update_progress', 'run_qa', 'complete_work', 'signoff'],
    secondary_actions: ['add_progress_note', 'add_signature', 'log_issue'],
  },
  po360: {
    tabs: ['overview', 'line_items', 'supplier', 'receiving', 'supplier_invoice', 'project_link', 'costing', 'returns', 'warranty', 'documents', 'audit_log'],
    widgets: ['po_summary_card', 'receiving_progress_card', 'supplier_status_card', 'costing_impact_card', 'approval_status_card'],
    primary_actions: ['approve_po', 'send_po', 'receive_items', 'register_supplier_invoice', 'close_po'],
    secondary_actions: ['create_return', 'attach_contract'],
  },
  finance360: {
    tabs: ['invoices', 'payments', 'collections', 'bank_matching', 'vat', 'tax', 'cashflow', 'budget', 'gl', 'costing', 'exports', 'audit_log'],
    widgets: ['ar_summary_card', 'ap_summary_card', 'overdue_summary_card', 'cashflow_card', 'reconciliation_card', 'vat_liability_card'],
    primary_actions: ['issue_invoice', 'register_payment', 'reconcile_bank', 'export_tax', 'open_collection_case'],
    secondary_actions: ['send_collection_notice'],
  },
  employee360: {
    tabs: ['overview', 'attendance', 'payroll', 'wage_slips', 'pension', 'expenses', 'assignments', 'work_orders', 'hr_documents', 'alerts', 'audit_log'],
    widgets: ['employee_summary_card', 'attendance_summary_card', 'payroll_status_card', 'open_expenses_card', 'active_assignments_card'],
    primary_actions: ['add_attendance', 'assign_work_order', 'calculate_payroll'],
    secondary_actions: ['add_expense', 'upload_document'],
  },
};

// ═══════════════════════════════════════════════════════════════
// 5) ACTION → API MAPPING
// ═══════════════════════════════════════════════════════════════

const ACTION_API_MAP = {
  // Lead actions
  'lead.create_quote':        { method: 'POST', path: '/api/quotes',           body: { fromLead: ':leadId' } },
  'lead.convert_to_customer': { method: 'POST', path: '/api/customers',        body: { fromLead: ':leadId' } },
  'lead.qualify':             { method: 'PATCH',path: '/api/leads/:id/status', body: { status: 'qualified' } },
  'lead.mark_lost':           { method: 'PATCH',path: '/api/leads/:id/status', body: { status: 'lost' } },

  // Quote actions
  'quote.send':               { method: 'POST', path: '/api/quotes/:id/send' },
  'quote.approve':            { method: 'POST', path: '/api/quotes/:id/approve' },
  'quote.convert_to_project': { method: 'POST', path: '/api/quotes/:id/convert-to-project' },
  'quote.generate_contract':  { method: 'POST', path: '/api/contracts',        body: { fromQuote: ':quoteId' } },
  'quote.export_pdf':         { method: 'GET',  path: '/api/quotes/:id/export', download: true },

  // RFQ actions
  'rfq.send_to_suppliers':    { method: 'POST', path: '/api/rfq/:id/send' },
  'rfq.compare_quotes':       { method: 'GET',  path: '/api/rfq/:id/compare' },
  'rfq.approve':              { method: 'POST', path: '/api/rfq/:id/decide' },
  'rfq.convert_to_po':        { method: 'POST', path: '/api/purchase-orders',  body: { fromRfq: ':rfqId' } },

  // PO actions
  'po.approve':               { method: 'POST', path: '/api/purchase-orders/:id/approve' },
  'po.send_to_supplier':      { method: 'POST', path: '/api/purchase-orders/:id/send' },
  'po.receive_items':         { method: 'POST', path: '/api/purchase-orders/:id/receive' },
  'po.create_invoice':        { method: 'POST', path: '/api/invoices',         body: { fromPO: ':poId', direction: 'input' } },
  'po.open_return':           { method: 'POST', path: '/api/returns',          body: { fromPO: ':poId' } },
  'po.close':                 { method: 'POST', path: '/api/purchase-orders/:id/close' },

  // Project actions
  'project.create_work_order':{ method: 'POST', path: '/api/work-orders',      body: { projectId: ':projectId' } },
  'project.create_po':        { method: 'POST', path: '/api/purchase-orders',  body: { projectId: ':projectId' } },
  'project.create_invoice':   { method: 'POST', path: '/api/invoices',         body: { fromProject: ':projectId', direction: 'output' } },
  'project.allocate_materials':{ method: 'POST',path: '/api/inventory/reserve', body: { projectId: ':projectId' } },
  'project.assign_employees': { method: 'POST', path: '/api/employee-assignments', body: { projectId: ':projectId' } },
  'project.change_status':    { method: 'PATCH',path: '/api/projects/:id/status' },
  'project.close':            { method: 'POST', path: '/api/projects/:id/close' },

  // Work Order actions
  'work_order.assign_worker': { method: 'POST', path: '/api/employee-assignments', body: { workOrderId: ':woId' } },
  'work_order.reserve_materials':{ method:'POST',path: '/api/inventory/reserve', body: { workOrderId: ':woId' } },
  'work_order.start':         { method: 'PATCH',path: '/api/work-orders/:id/status', body: { status: 'in_progress' } },
  'work_order.qa_check':      { method: 'POST', path: '/api/quality-checks',   body: { workOrderId: ':woId' } },
  'work_order.complete':      { method: 'PATCH',path: '/api/work-orders/:id/status', body: { status: 'done' } },
  'work_order.signoff':       { method: 'POST', path: '/api/signatures',       body: { workOrderId: ':woId' } },

  // Invoice actions
  'invoice.issue':            { method: 'POST', path: '/api/invoices/:id/issue' },
  'invoice.send':             { method: 'POST', path: '/api/invoices/:id/send' },
  'invoice.register_payment': { method: 'POST', path: '/api/payments',         body: { invoiceId: ':invoiceId' } },
  'invoice.match_bank':       { method: 'POST', path: '/api/bank/matches',     body: { invoiceId: ':invoiceId' } },
  'invoice.export_tax':       { method: 'GET',  path: '/api/tax-exports/:id',  download: true },
  'invoice.send_reminder':    { method: 'POST', path: '/api/notifications',    body: { template: 'payment_reminder', invoiceId: ':invoiceId' } },
  'invoice.move_collections': { method: 'POST', path: '/api/collections',      body: { invoiceId: ':invoiceId' } },

  // Employee actions
  'employee.assign_workorder':{ method: 'POST', path: '/api/employee-assignments', body: { employeeId: ':employeeId' } },
  'employee.add_attendance':  { method: 'POST', path: '/api/attendance',       body: { employeeId: ':employeeId' } },
  'employee.calculate_payroll':{ method:'POST', path: '/api/payroll/compute',  body: { employeeId: ':employeeId' } },
  'employee.add_expense':     { method: 'POST', path: '/api/expenses',         body: { employeeId: ':employeeId' } },

  // Supplier actions
  'supplier.send_rfq':        { method: 'POST', path: '/api/rfq/send',        body: { supplierId: ':supplierId' } },
  'supplier.create_po':       { method: 'POST', path: '/api/purchase-orders',  body: { supplierId: ':supplierId' } },
  'supplier.register_invoice':{ method: 'POST', path: '/api/invoices',         body: { supplierId: ':supplierId', direction: 'input' } },
  'supplier.open_return':     { method: 'POST', path: '/api/returns',          body: { supplierId: ':supplierId' } },

  // Customer actions
  'customer.create_quote':    { method: 'POST', path: '/api/quotes',           body: { customerId: ':customerId' } },
  'customer.create_project':  { method: 'POST', path: '/api/projects',         body: { customerId: ':customerId' } },
  'customer.issue_invoice':   { method: 'POST', path: '/api/invoices',         body: { customerId: ':customerId', direction: 'output' } },
  'customer.open_support':    { method: 'POST', path: '/api/support-tickets',  body: { customerId: ':customerId' } },

  // Universal actions
  'any.add_task':             { method: 'POST', path: '/api/tasks',            body: { parentType: ':entityType', parentId: ':entityId' } },
  'any.add_document':         { method: 'POST', path: '/api/documents/upload', body: { parentType: ':entityType', parentId: ':entityId' } },
  'any.add_note':             { method: 'POST', path: '/api/notes',            body: { parentType: ':entityType', parentId: ':entityId' } },
  'any.send_notification':    { method: 'POST', path: '/api/notifications',    body: { parentType: ':entityType', parentId: ':entityId' } },
};

// ═══════════════════════════════════════════════════════════════
// 6) CROSS-SERVICE API CONTRACTS
// ═══════════════════════════════════════════════════════════════

const CROSS_SERVICE_CONTRACTS = {
  'ops→procurement': {
    description: 'OPS asks Procurement for financial operations',
    calls: [
      { action: 'create_po',      endpoint: 'POST /api/purchase-orders',   payload: 'ProjectPO' },
      { action: 'create_rfq',     endpoint: 'POST /api/rfq/send',         payload: 'MaterialRFQ' },
      { action: 'create_invoice', endpoint: 'POST /api/invoices',          payload: 'ProjectInvoice' },
      { action: 'get_financials', endpoint: 'GET  /api/analytics/project-financials/:projectId', payload: null },
    ],
  },
  'ops→payroll': {
    description: 'OPS sends work assignments to Payroll',
    calls: [
      { action: 'assign_employee',    endpoint: 'POST /api/payroll/assignments',     payload: 'EmployeeAssignment' },
      { action: 'record_attendance',  endpoint: 'POST /api/payroll/attendance',       payload: 'AttendanceRecord' },
      { action: 'get_employee_costs', endpoint: 'GET  /api/payroll/employee-costs/:projectId', payload: null },
    ],
  },
  'procurement→ops': {
    description: 'Procurement notifies OPS about purchasing updates',
    calls: [
      { action: 'po_received',     endpoint: 'POST /api/ops/events', payload: { event: 'po_received', data: 'PurchaseReceipt' } },
      { action: 'invoice_issued',  endpoint: 'POST /api/ops/events', payload: { event: 'invoice_issued', data: 'InvoiceSummary' } },
    ],
  },
  'procurement→ai': {
    description: 'Procurement sends data to AI for analysis',
    calls: [
      { action: 'analyze_spending',  endpoint: 'POST /api/ai/analyze',      payload: 'SpendingData' },
      { action: 'forecast_cashflow', endpoint: 'POST /api/ai/forecast',     payload: 'CashflowData' },
      { action: 'detect_anomalies',  endpoint: 'POST /api/ai/anomaly',      payload: 'TransactionBatch' },
    ],
  },
  'payroll→procurement': {
    description: 'Payroll sends cost data to Finance',
    calls: [
      { action: 'post_payroll_costs', endpoint: 'POST /api/gl/transactions',       payload: 'PayrollCostBatch' },
      { action: 'create_bank_file',   endpoint: 'POST /api/bank/import-payroll',    payload: 'BankPayrollFile' },
    ],
  },
  'ai→ops': {
    description: 'AI sends alerts and recommendations to OPS',
    calls: [
      { action: 'send_alert',         endpoint: 'POST /api/ops/alerts',           payload: 'AIAlert' },
      { action: 'send_recommendation',endpoint: 'POST /api/ops/recommendations', payload: 'AIRecommendation' },
    ],
  },
  'ai→procurement': {
    description: 'AI sends financial signals to Procurement',
    calls: [
      { action: 'risk_signal',       endpoint: 'POST /api/finance/risk-signals',  payload: 'RiskSignal' },
      { action: 'price_recommendation',endpoint:'POST /api/pricing/recommendations', payload: 'PriceRecommendation' },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════
// REGISTER ROUTES
// ═══════════════════════════════════════════════════════════════

function registerWiringRoutes(app) {
  app.get('/api/wiring/ownership',     (_req, res) => res.json({ services: SERVICE_OWNERSHIP }));
  app.get('/api/wiring/relationships', (_req, res) => res.json({ relationships: ENTITY_RELATIONSHIPS }));
  app.get('/api/wiring/routes',        (_req, res) => res.json({ routes: CANONICAL_ROUTES }));
  app.get('/api/wiring/page-contracts',(_req, res) => res.json({ pages: PAGE_CONTRACTS }));
  app.get('/api/wiring/action-map',    (_req, res) => res.json({ actions: ACTION_API_MAP }));
  app.get('/api/wiring/contracts',     (_req, res) => res.json({ contracts: CROSS_SERVICE_CONTRACTS }));

  // Full spec in one call
  app.get('/api/wiring/spec', (_req, res) => {
    res.json({
      system: 'Techno-Kol Uzi ERP 2026',
      architecture: 'modular-enterprise-erp',
      operating_mode: 'event-driven-ssot',
      services: SERVICE_OWNERSHIP,
      relationships: ENTITY_RELATIONSHIPS,
      routes: CANONICAL_ROUTES,
      pages: PAGE_CONTRACTS,
      actions: ACTION_API_MAP,
      contracts: CROSS_SERVICE_CONTRACTS,
    });
  });

  console.log('   ✓ Wiring spec routes registered');
}

module.exports = {
  SERVICE_OWNERSHIP, ENTITY_RELATIONSHIPS, CANONICAL_ROUTES,
  PAGE_CONTRACTS, ACTION_API_MAP, CROSS_SERVICE_CONTRACTS,
  registerWiringRoutes,
};
