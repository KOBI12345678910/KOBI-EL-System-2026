/**
 * Domain Model — Full Object Definitions for Techno-Kol Uzi ERP 2026
 *
 * This is the CANONICAL field-level spec for every entity.
 * Every DB table, API response, form, and validation derives from here.
 *
 * Each object defines:
 *  - key_fields (schema)
 *  - belongs_to / has_many / has_one (relationships)
 *  - actions (what can be done)
 *  - states (lifecycle)
 */

'use strict';

const DOMAIN_MODEL = {

  // ═══════════════════════════════════════════════════════════
  // COMMERCIAL OBJECTS
  // ═══════════════════════════════════════════════════════════

  lead: {
    object_type: 'commercial', label: 'ליד', labelEn: 'Lead', icon: '🎯',
    primary_key: 'lead_id',
    key_fields: ['lead_number', 'full_name', 'phone', 'email', 'source', 'interest_type', 'stage', 'assigned_to', 'estimated_value', 'notes', 'created_at', 'updated_at'],
    belongs_to: { customer: { optional: true, note: 'until_converted' }, user: { as: 'sales_owner', optional: true }, pipeline_stage: { optional: true } },
    has_many: ['crm_activity', 'task', 'message_thread', 'document', 'audit_log', 'opportunity'],
    actions: ['qualify', 'disqualify', 'create_quote', 'convert_to_customer', 'assign_owner', 'move_pipeline_stage', 'add_note', 'send_message'],
    states: ['new', 'contacted', 'qualified', 'quoted', 'won', 'lost'],
  },

  customer: {
    object_type: 'commercial', label: 'לקוח', labelEn: 'Customer', icon: '👤',
    primary_key: 'customer_id',
    key_fields: ['customer_number', 'legal_name', 'display_name', 'phone', 'email', 'address', 'customer_type', 'tax_id', 'status', 'assigned_account_manager', 'credit_limit', 'current_balance', 'created_at', 'updated_at'],
    belongs_to: { user: { as: 'account_manager', optional: true } },
    has_many: ['lead', 'quote', 'contract', 'project', 'invoice', 'payment', 'collection_case', 'document', 'support_ticket', 'message_thread'],
    has_one: { customer_portal_account: { optional: true } },
    actions: ['create_quote', 'create_project', 'issue_invoice', 'open_portal', 'send_message', 'attach_document', 'open_support_case'],
    states: ['active', 'inactive', 'blocked', 'archived'],
  },

  // ═══════════════════════════════════════════════════════════
  // PROCUREMENT OBJECTS
  // ═══════════════════════════════════════════════════════════

  supplier: {
    object_type: 'procurement', label: 'ספק', labelEn: 'Supplier', icon: '🏭',
    primary_key: 'supplier_id',
    key_fields: ['supplier_number', 'legal_name', 'contact_name', 'phone', 'email', 'address', 'tax_id', 'supplier_category', 'payment_terms', 'delivery_terms', 'preferred_currency', 'status', 'risk_level', 'performance_score', 'created_at', 'updated_at'],
    has_many: ['rfq', 'supplier_quote', 'po', 'supplier_invoice', 'payment', 'contract', 'return', 'warranty_case', 'document'],
    has_one: { supplier_portal_account: { optional: true } },
    actions: ['create_rfq', 'create_po', 'register_supplier_invoice', 'create_return', 'attach_contract', 'score_supplier', 'block_supplier'],
    states: ['active', 'review', 'blocked', 'archived'],
  },

  quote: {
    object_type: 'commercial', label: 'הצעת מחיר', labelEn: 'Quote', icon: '📋',
    primary_key: 'quote_id',
    key_fields: ['quote_number', 'customer_id', 'lead_id', 'valid_until', 'subtotal', 'discount_total', 'vat_total', 'grand_total', 'margin_estimate', 'currency', 'pricing_snapshot_id', 'approval_status', 'state', 'created_at', 'updated_at'],
    belongs_to: { customer: {}, lead: { optional: true } },
    has_many: ['quote_line', 'approval', 'document', 'audit_log'],
    has_one: { contract: { optional: true }, project: { optional: true, note: 'after_conversion' } },
    actions: ['send_quote', 'revise_quote', 'request_approval', 'approve_quote', 'reject_quote', 'export_pdf', 'duplicate_quote', 'convert_to_project'],
    states: ['draft', 'sent', 'under_review', 'approved', 'rejected', 'converted_to_project'],
  },

  rfq: {
    object_type: 'procurement', label: 'בקשת הצעת מחיר', labelEn: 'RFQ', icon: '📨',
    primary_key: 'rfq_id',
    key_fields: ['rfq_number', 'project_id', 'material_request_id', 'requested_date', 'response_deadline', 'comparison_status', 'approval_status', 'state', 'created_at', 'updated_at'],
    belongs_to: { project: { optional: true }, material_request: { optional: true } },
    has_many: ['rfq_item', 'rfq_supplier_invite', 'supplier_quote', 'approval', 'document'],
    actions: ['add_supplier', 'send_rfq', 'compare_quotes', 'approve_rfq', 'reject_rfq', 'select_winning_supplier', 'convert_to_po'],
    states: ['draft', 'sent', 'quotes_received', 'under_comparison', 'approved', 'rejected', 'converted_to_po'],
  },

  po: {
    object_type: 'procurement', label: 'הזמנת רכש', labelEn: 'Purchase Order', icon: '🛒',
    primary_key: 'po_id',
    key_fields: ['po_number', 'supplier_id', 'project_id', 'rfq_id', 'order_date', 'expected_delivery_date', 'currency', 'subtotal', 'vat_total', 'grand_total', 'approval_status', 'receiving_status', 'payment_status', 'state', 'created_at', 'updated_at'],
    belongs_to: { supplier: {}, rfq: { optional: true }, project: { optional: true } },
    has_many: ['po_line', 'inventory_receipt', 'supplier_invoice', 'return', 'warranty_case', 'document', 'audit_log'],
    actions: ['request_approval', 'approve_po', 'send_to_supplier', 'receive_items', 'register_supplier_invoice', 'create_return', 'close_po'],
    states: ['draft', 'pending_approval', 'approved', 'sent_to_supplier', 'partially_received', 'fully_received', 'closed', 'cancelled'],
  },

  contract: {
    object_type: 'shared', label: 'חוזה', labelEn: 'Contract', icon: '📑',
    primary_key: 'contract_id',
    key_fields: ['contract_number', 'contract_type', 'customer_id', 'supplier_id', 'effective_date', 'expiry_date', 'contract_value', 'state', 'created_at', 'updated_at'],
    belongs_to: { customer: { optional: true }, supplier: { optional: true }, quote: { optional: true }, po: { optional: true }, project: { optional: true } },
    has_many: ['signature', 'document', 'audit_log'],
    actions: ['upload_contract', 'sign_contract', 'activate_contract', 'terminate_contract', 'renew_contract'],
    states: ['draft', 'pending_signature', 'active', 'suspended', 'expired', 'terminated'],
  },

  // ═══════════════════════════════════════════════════════════
  // EXECUTION OBJECTS
  // ═══════════════════════════════════════════════════════════

  project: {
    object_type: 'execution', label: 'פרויקט', labelEn: 'Project', icon: '📁',
    primary_key: 'project_id',
    key_fields: ['project_number', 'project_name', 'customer_id', 'quote_id', 'contract_id', 'project_type', 'location', 'owner_id', 'budget_amount', 'actual_cost', 'billed_amount', 'collected_amount', 'progress_percent', 'priority', 'planned_start_date', 'planned_end_date', 'actual_start_date', 'actual_end_date', 'state', 'created_at', 'updated_at'],
    belongs_to: { customer: {}, quote: { optional: true }, contract: { optional: true }, user: { as: 'project_owner', optional: true } },
    has_many: ['project_phase', 'project_milestone', 'work_order', 'po', 'material_request', 'inventory_reservation', 'workforce_assignment', 'task', 'expense', 'logistics_order', 'invoice', 'payment', 'alert', 'report', 'forecast_model', 'document', 'audit_log'],
    actions: ['start_planning', 'create_work_order', 'create_po', 'request_materials', 'assign_employees', 'add_task', 'add_expense', 'create_invoice', 'open_delivery', 'close_project', 'cancel_project'],
    states: ['draft', 'approved', 'in_planning', 'in_procurement', 'in_execution', 'in_delivery', 'completed', 'closed', 'cancelled'],
  },

  work_order: {
    object_type: 'execution', label: 'הזמנת עבודה', labelEn: 'Work Order', icon: '🔧',
    primary_key: 'workorder_id',
    key_fields: ['workorder_number', 'project_id', 'title', 'location', 'assigned_team', 'required_start_date', 'required_end_date', 'progress_percent', 'quality_status', 'signature_status', 'state', 'created_at', 'updated_at'],
    belongs_to: { project: {} },
    has_many: ['work_order_task', 'workforce_assignment', 'attendance', 'material_request', 'inventory_reservation', 'quality_check', 'signature', 'expense', 'alert', 'document', 'audit_log'],
    actions: ['assign_team', 'reserve_materials', 'start_work', 'pause_work', 'update_progress', 'run_quality_check', 'complete_work', 'sign_off'],
    states: ['open', 'assigned', 'waiting_materials', 'in_progress', 'qa', 'completed', 'signed_off', 'cancelled'],
  },

  task: {
    object_type: 'execution', label: 'משימה', labelEn: 'Task', icon: '📌',
    primary_key: 'task_id',
    key_fields: ['task_number', 'title', 'description', 'priority', 'due_date', 'assignee_id', 'linked_object_type', 'linked_object_id', 'state', 'created_at', 'updated_at'],
    belongs_to: { employee: { as: 'assignee', optional: true } },
    has_many: ['message_thread', 'audit_log', 'document'],
    actions: ['assign_task', 'start_task', 'complete_task', 'escalate_task', 'link_document'],
    states: ['open', 'assigned', 'in_progress', 'blocked', 'completed', 'cancelled'],
  },

  // ═══════════════════════════════════════════════════════════
  // INVENTORY OBJECTS
  // ═══════════════════════════════════════════════════════════

  material: {
    object_type: 'inventory', label: 'חומר', labelEn: 'Material', icon: '📦',
    primary_key: 'material_id',
    key_fields: ['material_code', 'name', 'description', 'category', 'unit_of_measure', 'preferred_supplier_id', 'standard_cost', 'reorder_point', 'safety_stock', 'barcode', 'active', 'created_at', 'updated_at'],
    belongs_to: { supplier: { as: 'preferred_supplier', optional: true } },
    has_many: ['inventory', 'po', 'material_request', 'inventory_receipt', 'inventory_issue', 'inventory_reservation', 'costing_entry', 'barcode_scan'],
    actions: ['create_po', 'reserve_stock', 'issue_stock', 'receive_stock', 'count_stock', 'update_standard_cost'],
    states: ['active', 'inactive', 'obsolete'],
  },

  inventory: {
    object_type: 'inventory', label: 'מלאי', labelEn: 'Inventory', icon: '🏗️',
    primary_key: 'inventory_id',
    key_fields: ['material_id', 'warehouse_id', 'on_hand_qty', 'reserved_qty', 'available_qty', 'average_cost', 'last_counted_at', 'last_movement_at', 'created_at', 'updated_at'],
    belongs_to: { material: {}, warehouse: {} },
    has_many: ['inventory_receipt', 'inventory_issue', 'inventory_transfer', 'inventory_reservation', 'stock_count', 'audit_log'],
    actions: ['receive', 'issue', 'reserve', 'transfer', 'recount', 'adjust'],
    states: ['active', 'locked', 'archived'],
  },

  warehouse: {
    object_type: 'inventory', label: 'מחסן', labelEn: 'Warehouse', icon: '🏭',
    primary_key: 'warehouse_id',
    key_fields: ['warehouse_code', 'name', 'location', 'manager_id', 'type', 'active', 'created_at', 'updated_at'],
    has_many: ['inventory', 'inventory_receipt', 'inventory_issue', 'inventory_transfer', 'logistics_order', 'barcode_scan', 'print_job'],
    actions: ['receive_goods', 'dispatch_goods', 'transfer_stock', 'run_count', 'print_labels'],
    states: ['active', 'inactive', 'closed'],
  },

  // ═══════════════════════════════════════════════════════════
  // FINANCE OBJECTS
  // ═══════════════════════════════════════════════════════════

  invoice: {
    object_type: 'finance', label: 'חשבונית', labelEn: 'Invoice', icon: '💰',
    primary_key: 'invoice_id',
    key_fields: ['invoice_number', 'invoice_type', 'customer_id', 'supplier_id', 'project_id', 'po_id', 'issue_date', 'due_date', 'subtotal', 'vat_total', 'grand_total', 'paid_total', 'balance_due', 'state', 'created_at', 'updated_at'],
    belongs_to: { customer: { optional: true }, supplier: { optional: true }, project: { optional: true }, po: { optional: true } },
    has_many: ['invoice_line', 'payment', 'vat_record', 'tax_record', 'bank_match', 'collection_case', 'document', 'audit_log'],
    actions: ['issue_invoice', 'send_invoice', 'register_payment', 'open_collection_case', 'export_tax', 'cancel_invoice'],
    states: ['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled'],
  },

  payment: {
    object_type: 'finance', label: 'תשלום', labelEn: 'Payment', icon: '💳',
    primary_key: 'payment_id',
    key_fields: ['payment_number', 'invoice_id', 'customer_id', 'supplier_id', 'payment_date', 'payment_method', 'amount', 'currency', 'bank_match_status', 'gl_status', 'state', 'created_at', 'updated_at'],
    belongs_to: { invoice: {}, customer: { optional: true }, supplier: { optional: true } },
    has_many: ['audit_log'],
    has_one: { bank_match: { optional: true }, gl_transaction: { optional: true } },
    actions: ['post_payment', 'reconcile_payment', 'allocate_payment', 'reverse_payment'],
    states: ['draft', 'posted', 'reconciled', 'reversed'],
  },

  expense: {
    object_type: 'finance', label: 'הוצאה', labelEn: 'Expense', icon: '🧾',
    primary_key: 'expense_id',
    key_fields: ['expense_number', 'employee_id', 'project_id', 'category', 'amount', 'currency', 'expense_date', 'approval_status', 'reimbursement_status', 'created_at', 'updated_at'],
    belongs_to: { employee: { optional: true }, project: { optional: true } },
    has_many: ['document', 'approval', 'audit_log'],
    actions: ['submit_expense', 'approve_expense', 'reimburse_expense', 'reject_expense'],
    states: ['draft', 'submitted', 'approved', 'rejected', 'reimbursed'],
  },

  // ═══════════════════════════════════════════════════════════
  // WORKFORCE OBJECTS
  // ═══════════════════════════════════════════════════════════

  employee: {
    object_type: 'workforce', label: 'עובד', labelEn: 'Employee', icon: '👷',
    primary_key: 'employee_id',
    key_fields: ['employee_number', 'full_name', 'phone', 'email', 'employer_id', 'role_title', 'department', 'hourly_rate', 'status', 'start_date', 'end_date', 'created_at', 'updated_at'],
    belongs_to: { employer: {} },
    has_many: ['attendance', 'payroll', 'wage_slip', 'pension_record', 'employee_expense', 'workforce_assignment', 'work_order', 'task', 'document', 'audit_log'],
    has_one: { hr_profile: {} },
    actions: ['assign_work_order', 'add_attendance', 'calculate_payroll', 'add_expense', 'upload_document', 'activate_employee', 'terminate_employee'],
    states: ['active', 'leave', 'suspended', 'terminated'],
  },

  attendance: {
    object_type: 'workforce', label: 'נוכחות', labelEn: 'Attendance', icon: '⏰',
    primary_key: 'attendance_id',
    key_fields: ['employee_id', 'project_id', 'workorder_id', 'work_date', 'start_time', 'end_time', 'regular_hours', 'overtime_hours', 'approval_status', 'source', 'created_at', 'updated_at'],
    belongs_to: { employee: {}, project: { optional: true }, work_order: { optional: true } },
    has_many: ['audit_log'],
    actions: ['submit_attendance', 'approve_attendance', 'reject_attendance', 'export_to_payroll'],
    states: ['draft', 'submitted', 'approved', 'rejected', 'exported_to_payroll'],
  },

  payroll: {
    object_type: 'workforce', label: 'שכר', labelEn: 'Payroll', icon: '💰',
    primary_key: 'payroll_id',
    key_fields: ['payroll_run_number', 'employee_id', 'employer_id', 'payroll_period', 'gross_pay', 'deductions', 'net_pay', 'pension_total', 'export_status', 'payment_status', 'state', 'created_at', 'updated_at'],
    belongs_to: { employee: {}, employer: {} },
    has_many: ['wage_slip', 'pension_record', 'tax_export', 'bank_file', 'audit_log'],
    actions: ['calculate_payroll', 'approve_payroll', 'export_payroll', 'mark_paid', 'cancel_payroll'],
    states: ['draft', 'calculated', 'approved', 'exported', 'paid', 'cancelled'],
  },

  // ═══════════════════════════════════════════════════════════
  // GOVERNANCE OBJECTS
  // ═══════════════════════════════════════════════════════════

  document: {
    object_type: 'documents', label: 'מסמך', labelEn: 'Document', icon: '📄',
    primary_key: 'document_id',
    key_fields: ['document_number', 'filename', 'file_type', 'document_type', 'parent_object_type', 'parent_object_id', 'classification_status', 'ocr_status', 'signature_status', 'created_at', 'updated_at'],
    has_many: ['ocr_result', 'attachment', 'signature', 'audit_log'],
    actions: ['upload_document', 'classify_document', 'run_ocr', 'sign_document', 'archive_document'],
    states: ['uploaded', 'classified', 'ocr_processed', 'signed', 'archived'],
  },

  alert: {
    object_type: 'governance', label: 'התראה', labelEn: 'Alert', icon: '🚨',
    primary_key: 'alert_id',
    key_fields: ['alert_number', 'category', 'severity', 'parent_object_type', 'parent_object_id', 'title', 'description', 'assigned_to', 'state', 'created_at', 'updated_at'],
    has_many: ['task', 'audit_log'],
    actions: ['acknowledge_alert', 'assign_alert', 'resolve_alert', 'reopen_alert'],
    states: ['open', 'acknowledged', 'resolved', 'closed'],
  },

  ai_insight: {
    object_type: 'intelligence', label: 'תובנת AI', labelEn: 'AI Insight', icon: '🧠',
    primary_key: 'insight_id',
    key_fields: ['insight_number', 'parent_object_type', 'parent_object_id', 'category', 'confidence_score', 'severity', 'recommendation_text', 'recommended_action', 'consumed_status', 'created_at', 'updated_at'],
    actions: ['acknowledge_insight', 'create_task_from_insight', 'apply_recommendation', 'dismiss_insight'],
    states: ['new', 'viewed', 'actioned', 'dismissed'],
  },

  audit_log: {
    object_type: 'governance', label: 'רשומת ביקורת', labelEn: 'Audit Log', icon: '📋',
    primary_key: 'audit_id',
    key_fields: ['entity_type', 'entity_id', 'action_name', 'old_values', 'new_values', 'performed_by', 'source_service', 'source_page', 'correlation_id', 'performed_at'],
    immutable: true,
  },
};

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function getObjectsByType(type) {
  return Object.entries(DOMAIN_MODEL).filter(([, v]) => v.object_type === type).map(([k, v]) => ({ id: k, ...v }));
}

function getObjectSchema(objectId) {
  return DOMAIN_MODEL[objectId] || null;
}

function getAllFieldsFor(objectId) {
  const obj = DOMAIN_MODEL[objectId];
  if (!obj) return null;
  return {
    primary_key: obj.primary_key,
    fields: obj.key_fields,
    relations: {
      belongs_to: obj.belongs_to || {},
      has_many: obj.has_many || [],
      has_one: obj.has_one || {},
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// REGISTER ROUTES
// ═══════════════════════════════════════════════════════════════

function registerDomainModelRoutes(app) {

  app.get('/api/domain-model', (_req, res) => {
    res.json({ model: DOMAIN_MODEL });
  });

  app.get('/api/domain-model/:type', (req, res) => {
    const obj = DOMAIN_MODEL[req.params.type];
    if (!obj) return res.status(404).json({ error: `Unknown object: ${req.params.type}` });
    res.json({ object: { id: req.params.type, ...obj } });
  });

  app.get('/api/domain-model/:type/schema', (req, res) => {
    const schema = getAllFieldsFor(req.params.type);
    if (!schema) return res.status(404).json({ error: `Unknown object: ${req.params.type}` });
    res.json(schema);
  });

  app.get('/api/domain-model-families', (_req, res) => {
    const families = {};
    for (const [id, obj] of Object.entries(DOMAIN_MODEL)) {
      const type = obj.object_type;
      if (!families[type]) families[type] = [];
      families[type].push({ id, label: obj.label, labelEn: obj.labelEn, icon: obj.icon, fields: obj.key_fields?.length || 0, states: obj.states?.length || 0 });
    }
    res.json({ families });
  });

  console.log('   ✓ Domain model registered (' + Object.keys(DOMAIN_MODEL).length + ' objects, ' +
    Object.values(DOMAIN_MODEL).reduce((s, o) => s + (o.key_fields?.length || 0), 0) + ' fields)');
}

module.exports = { DOMAIN_MODEL, getObjectsByType, getObjectSchema, getAllFieldsFor, registerDomainModelRoutes };
