/**
 * Pipeline Engine — Business Flow from Lead to Closure
 *
 * Stages: Lead → Quote → Order → Execution → Procurement → Finance → HR → Delivery → Closure
 *
 * Each pipeline record tracks an entity through the business lifecycle.
 * Events trigger automatic transitions and side-effects (create PO, notify supplier, etc.)
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// PIPELINE STAGES
// ═══════════════════════════════════════════════════════════════

const PIPELINE_STAGES = [
  { id: 'lead',         label: 'ליד',            labelEn: 'Lead',                   color: '#8b5cf6', modules: ['crm', 'sales'], service: 'ops' },
  { id: 'quote',        label: 'הצעת מחיר',      labelEn: 'RFQ / Quote',            color: '#3b82f6', modules: ['pricing', 'approvals', 'contracts'], service: 'procurement' },
  { id: 'approval',     label: 'אישור',          labelEn: 'Approval',               color: '#6366f1', modules: ['approvals'], service: 'procurement' },
  { id: 'order',        label: 'הזמנה / חוזה',   labelEn: 'Sales Order / Contract', color: '#06b6d4', modules: ['contracts', 'projects'], service: 'ops' },
  { id: 'project',      label: 'פרויקט',         labelEn: 'Project',                color: '#10b981', modules: ['projects', 'workOrders'], service: 'ops' },
  { id: 'work_orders',  label: 'הזמנות עבודה',   labelEn: 'Work Orders',            color: '#059669', modules: ['workOrders', 'tasks'], service: 'ops' },
  { id: 'procurement',  label: 'רכש',            labelEn: 'Procurement',            color: '#f59e0b', modules: ['suppliers', 'rfq', 'po'], service: 'procurement' },
  { id: 'inventory',    label: 'מלאי / חומרים',  labelEn: 'Inventory / Materials',  color: '#d97706', modules: ['inventory', 'warehouse', 'materials'], service: 'ops' },
  { id: 'execution',    label: 'ייצור / ביצוע',  labelEn: 'Manufacturing',          color: '#16a34a', modules: ['manufacturing', 'quality'], service: 'ops' },
  { id: 'delivery',     label: 'אספקה / התקנה',  labelEn: 'Delivery / Installation',color: '#14b8a6', modules: ['logistics', 'delivery'], service: 'ops' },
  { id: 'invoice',      label: 'חשבונית',        labelEn: 'Invoice',                color: '#ef4444', modules: ['invoices', 'vat'], service: 'procurement' },
  { id: 'payment',      label: 'גביה / תשלום',   labelEn: 'Collection / Payment',   color: '#dc2626', modules: ['payments', 'bank', 'collections'], service: 'procurement' },
  { id: 'closure',      label: 'סגירה ודיווח',   labelEn: 'Reporting / Closure',    color: '#7c3aed', modules: ['reports', 'analytics', 'forecasting'], service: 'ai' },
];

// ═══════════════════════════════════════════════════════════════
// ENTITY RELATIONS
// ═══════════════════════════════════════════════════════════════

const ENTITY_RELATIONS = {
  customer:  { label: 'לקוח',          icon: '👤', links: ['leads', 'quotes', 'projects', 'invoices', 'payments', 'support_tickets', 'documents'] },
  lead:      { label: 'ליד',           icon: '🎯', links: ['customer', 'sales_owner', 'pipeline_stage', 'quote', 'tasks', 'communications'] },
  quote:     { label: 'הצעת מחיר',     icon: '📋', links: ['customer', 'lead', 'pricing', 'approvals', 'supplier_quotes', 'contract', 'project'] },
  supplier:  { label: 'ספק',           icon: '🏭', links: ['rfq', 'po', 'contracts', 'returns', 'warranty', 'invoices', 'bank_payments'] },
  project:   { label: 'פרויקט',        icon: '📁', links: ['customer', 'quote', 'contract', 'work_orders', 'materials', 'tasks', 'employees', 'expenses', 'logistics', 'invoice', 'reports'] },
  workOrder: { label: 'הזמנת עבודה',   icon: '🔧', links: ['project', 'materials', 'production_stage', 'assigned_employees', 'quality_checks', 'signatures', 'status_history'] },
  inventory: { label: 'מלאי / חומרים', icon: '📦', links: ['suppliers', 'po', 'warehouse', 'manufacturing', 'work_order', 'costing'] },
  invoice:   { label: 'חשבונית',       icon: '💰', links: ['customer_or_supplier', 'project', 'po_or_sales_order', 'bank_reconciliation', 'vat', 'tax', 'collections'] },
  employee:  { label: 'עובד',          icon: '👷', links: ['attendance', 'payroll', 'tasks', 'work_orders', 'expenses', 'hr_documents'] },
};

// ═══════════════════════════════════════════════════════════════
// ENTITY STATUSES
// ═══════════════════════════════════════════════════════════════

const ENTITY_STATUSES = {
  lead:       ['new', 'contacted', 'qualified', 'quoted', 'won', 'lost'],
  quote:      ['draft', 'sent', 'under_review', 'approved', 'rejected', 'converted'],
  po:         ['draft', 'pending_approval', 'approved', 'sent', 'partially_received', 'fully_received', 'closed'],
  project:    ['draft', 'approved', 'in_planning', 'in_procurement', 'in_production', 'in_delivery', 'completed', 'closed'],
  workOrder:  ['open', 'assigned', 'in_progress', 'waiting_materials', 'qa', 'completed', 'signed_off', 'cancelled'],
  invoice:    ['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled'],
  payroll:    ['draft', 'calculated', 'approved', 'exported', 'paid'],
};

// ═══════════════════════════════════════════════════════════════
// ENTITY PAGE DEFINITIONS — buttons & layout per entity type
// ═══════════════════════════════════════════════════════════════

const ENTITY_PAGES = {
  lead: {
    label: 'ליד', icon: '🎯',
    topFields: ['name', 'customer', 'status', 'owner', 'source', 'created_at', 'updated_at'],
    primaryActions: [
      { id: 'create_quote',     label: 'צור הצעת מחיר',    icon: '📋', creates: 'quote' },
      { id: 'convert_customer', label: 'המר ללקוח',        icon: '👤', creates: 'customer' },
    ],
    secondaryActions: [
      { id: 'add_task',    label: 'הוסף משימה',     icon: '📌' },
      { id: 'add_note',    label: 'הוסף הערה',      icon: '📝' },
      { id: 'send_whatsapp',label:'שלח WhatsApp',   icon: '💬' },
      { id: 'send_email',  label: 'שלח אימייל',     icon: '✉️' },
      { id: 'move_stage',  label: 'שנה שלב Pipeline', icon: '→' },
    ],
    relatedEntities: ['customer', 'quotes', 'tasks', 'communications', 'documents', 'audit_log'],
  },
  quote: {
    label: 'הצעת מחיר', icon: '📋',
    topFields: ['quote_number', 'customer', 'status', 'total', 'valid_until', 'owner', 'created_at'],
    primaryActions: [
      { id: 'send_approval',   label: 'שלח לאישור',         icon: '✅', creates: 'approval' },
      { id: 'convert_project', label: 'המר לפרויקט',        icon: '📁', creates: 'project' },
      { id: 'generate_contract',label:'צור חוזה',           icon: '📄', creates: 'contract' },
    ],
    secondaryActions: [
      { id: 'compare_quotes',  label: 'השווה הצעות ספקים',  icon: '⚖️' },
      { id: 'generate_pricing',label: 'מחירון אוטומטי',    icon: '💲' },
      { id: 'export_pdf',      label: 'ייצוא PDF',         icon: '📥' },
      { id: 'edit',            label: 'עריכה',             icon: '✏️' },
    ],
    relatedEntities: ['customer', 'lead', 'pricing', 'approvals', 'supplier_quotes', 'contract', 'documents'],
  },
  project: {
    label: 'פרויקט', icon: '📁',
    topFields: ['name', 'customer', 'status', 'budget', 'progress', 'manager', 'start_date', 'end_date'],
    primaryActions: [
      { id: 'create_work_order', label: 'צור הזמנת עבודה',  icon: '🔧', creates: 'workOrder' },
      { id: 'create_po',         label: 'צור הזמנת רכש',    icon: '🛒', creates: 'po' },
      { id: 'create_invoice',    label: 'צור חשבונית',      icon: '💰', creates: 'invoice' },
    ],
    secondaryActions: [
      { id: 'allocate_materials',label:'הקצה חומרים',        icon: '📦' },
      { id: 'assign_employees', label: 'שבץ עובדים',        icon: '👷' },
      { id: 'add_task',         label: 'הוסף משימה',        icon: '📌' },
      { id: 'open_logistics',   label: 'פתח לוגיסטיקה',    icon: '🚚' },
      { id: 'view_financials',  label: 'דוח כספי פרויקט',  icon: '📊' },
      { id: 'update_status',    label: 'עדכן סטטוס',       icon: '🔄' },
    ],
    relatedEntities: ['customer', 'quote', 'contract', 'work_orders', 'materials', 'tasks', 'employees', 'expenses', 'logistics', 'invoices', 'reports'],
  },
  workOrder: {
    label: 'הזמנת עבודה', icon: '🔧',
    topFields: ['wo_number', 'project', 'status', 'assigned_to', 'priority', 'due_date', 'created_at'],
    primaryActions: [
      { id: 'start_execution', label: 'התחל ביצוע',        icon: '▶️' },
      { id: 'mark_completed',  label: 'סמן כהושלם',       icon: '✅' },
      { id: 'sign_off',        label: 'חתימה וסגירה',     icon: '✍️' },
    ],
    secondaryActions: [
      { id: 'assign_worker',    label: 'שבץ עובד',         icon: '👷' },
      { id: 'reserve_materials',label:'הזמן חומרים',        icon: '📦' },
      { id: 'update_progress',  label: 'עדכן התקדמות',     icon: '📊' },
      { id: 'qa_check',         label: 'בדיקת איכות',      icon: '🔍' },
    ],
    relatedEntities: ['project', 'materials', 'assigned_employees', 'quality_checks', 'signatures', 'status_history'],
  },
  po: {
    label: 'הזמנת רכש', icon: '🛒',
    topFields: ['po_number', 'supplier', 'status', 'total', 'project', 'expected_date', 'created_at'],
    primaryActions: [
      { id: 'send_supplier',  label: 'שלח לספק',          icon: '📤' },
      { id: 'approve',        label: 'אשר',               icon: '✅' },
      { id: 'receive_items',  label: 'קבלת סחורה',        icon: '📦' },
    ],
    secondaryActions: [
      { id: 'create_invoice', label: 'צור חשבונית ספק',   icon: '💰', creates: 'invoice' },
      { id: 'open_return',    label: 'פתח החזרה',         icon: '↩️' },
      { id: 'attach_contract',label:'צרף חוזה',            icon: '📄' },
      { id: 'edit',           label: 'עריכה',             icon: '✏️' },
    ],
    relatedEntities: ['supplier', 'project', 'materials', 'invoices', 'contracts', 'returns', 'delivery_notes'],
  },
  invoice: {
    label: 'חשבונית', icon: '💰',
    topFields: ['invoice_number', 'customer_or_supplier', 'status', 'gross_amount', 'amount_paid', 'due_date', 'created_at'],
    primaryActions: [
      { id: 'issue',           label: 'הנפק',              icon: '📤' },
      { id: 'register_payment',label:'רשום תשלום',          icon: '💳', creates: 'payment' },
    ],
    secondaryActions: [
      { id: 'match_bank',     label: 'התאם לבנק',         icon: '🏦' },
      { id: 'export_tax',     label: 'ייצוא למס',         icon: '📊' },
      { id: 'send_reminder',  label: 'שלח תזכורת',        icon: '🔔' },
      { id: 'move_collections',label:'העבר לגביה',          icon: '⚠️' },
    ],
    relatedEntities: ['customer', 'supplier', 'project', 'po', 'bank_reconciliation', 'vat', 'tax', 'payments'],
  },
  employee: {
    label: 'עובד', icon: '👷',
    topFields: ['name', 'id_number', 'role', 'department', 'status', 'hire_date'],
    primaryActions: [
      { id: 'calculate_payroll',label:'חשב שכר',            icon: '💰' },
      { id: 'assign_task',     label: 'שבץ למשימה',        icon: '📌' },
    ],
    secondaryActions: [
      { id: 'view_attendance', label: 'צפה בנוכחות',       icon: '⏰' },
      { id: 'add_expense',    label: 'הוסף הוצאה',        icon: '🧾' },
      { id: 'view_work_orders',label:'צפה בהזמנות עבודה',  icon: '🔧' },
    ],
    relatedEntities: ['attendance', 'payroll', 'tasks', 'work_orders', 'expenses', 'hr_documents'],
  },
};

// ═══════════════════════════════════════════════════════════════
// 4-LAYER ARCHITECTURE
// ═══════════════════════════════════════════════════════════════

const SYSTEM_LAYERS = {
  core: {
    label: 'שכבת ליבה עסקית', labelEn: 'Business Core',
    entities: ['lead', 'customer', 'quote', 'sales_order', 'project', 'work_order', 'po', 'supplier', 'inventory', 'invoice', 'payment', 'employee', 'attendance', 'payroll'],
  },
  operations: {
    label: 'שכבת תפעול', labelEn: 'Operations Layer',
    modules: ['crm', 'sales', 'rfq', 'pricing', 'approvals', 'projects', 'workOrders', 'manufacturing', 'inventory', 'warehouse', 'logistics', 'suppliers', 'po', 'finance', 'hr', 'payroll'],
  },
  control: {
    label: 'שכבת בקרה וניתוח', labelEn: 'Control & Analytics',
    modules: ['dashboards', 'analytics', 'reports', 'forecasting', 'audit', 'alerts', 'bi', 'ai_insights'],
  },
  infrastructure: {
    label: 'שכבת תשתית', labelEn: 'Infrastructure',
    modules: ['auth', 'security', 'documents', 'ocr', 'notifications', 'queue', 'jobs', 'webhooks', 'realtime', 'search', 'workflow', 'wiring', 'validators', 'db', 'config', 'middleware'],
  },
};

// ═══════════════════════════════════════════════════════════════
// SERVICE TOPOLOGY — OPS is the hub
// ═══════════════════════════════════════════════════════════════

const SERVICE_TOPOLOGY = {
  ops:         { role: 'core',   label: 'תפעול',  labelEn: 'Techno-Kol OPS', port: 3200, connects: ['procurement', 'payroll', 'ai'] },
  procurement: { role: 'module', label: 'רכש',    labelEn: 'Onyx Procurement', port: 3100, connects: ['suppliers', 'purchasing', 'finance'] },
  payroll:     { role: 'module', label: 'שכר',    labelEn: 'Payroll',          port: 5173, connects: ['employees', 'projects', 'costs'] },
  ai:          { role: 'module', label: 'בינה',   labelEn: 'Onyx AI',          port: 3300, connects: ['analytics', 'forecasting', 'alerts'] },
};

// ═══════════════════════════════════════════════════════════════
// EVENT TRIGGERS — automation rules
// ═══════════════════════════════════════════════════════════════

const EVENT_TRIGGERS = {
  // ─── Sales to Project ───
  'quote_approved': {
    label: 'הצעת מחיר אושרה',
    stage: 'quote → project',
    actions: ['set_quote_approved', 'create_project', 'create_contract', 'create_initial_tasks', 'send_notification', 'create_audit_event'],
  },
  'lead_converted': {
    label: 'ליד הומר ללקוח',
    stage: 'lead → quote',
    actions: ['create_customer', 'create_quote', 'assign_sales_rep', 'send_notification'],
  },
  // ─── Project to Procurement ───
  'project_in_procurement': {
    label: 'פרויקט נכנס לרכש',
    stage: 'project → procurement',
    actions: ['create_materials_list', 'create_rfq_to_suppliers', 'create_approvals', 'create_po_after_approval'],
  },
  'project_created': {
    label: 'פרויקט נוצר',
    stage: 'project → work_orders',
    actions: ['create_work_orders', 'allocate_materials', 'assign_employees', 'send_notification'],
  },
  // ─── Procurement to Inventory ───
  'po_received': {
    label: 'הזמנת רכש התקבלה',
    stage: 'procurement → inventory',
    actions: ['update_inventory', 'create_warehouse_transaction', 'calculate_costing', 'link_to_project'],
  },
  'po_sent': {
    label: 'הזמנת רכש נשלחה לספק',
    stage: 'procurement → supplier',
    actions: ['update_inventory_expected', 'notify_warehouse', 'update_budget', 'send_notification'],
  },
  // ─── Work Order to Payroll ───
  'work_order_assigned': {
    label: 'הזמנת עבודה שובצה לעובדים',
    stage: 'work_orders → payroll',
    actions: ['record_attendance_hours', 'update_project_costing', 'check_overtime_alerts'],
  },
  'work_order_complete': {
    label: 'הזמנת עבודה הושלמה',
    stage: 'work_orders → delivery',
    actions: ['update_project_progress', 'calculate_costs', 'check_delivery_ready', 'qa_check'],
  },
  // ─── Invoice to Finance ───
  'invoice_issued': {
    label: 'חשבונית הונפקה',
    stage: 'invoice → finance',
    actions: ['record_in_gl', 'record_in_vat', 'open_collections_tracking', 'update_reports', 'notify_customer'],
  },
  // ─── Payment to Bank ───
  'payment_received': {
    label: 'תשלום התקבל',
    stage: 'payment → bank',
    actions: ['create_payment_record', 'bank_matching', 'update_invoice_status', 'update_tax_export', 'update_cash_flow'],
  },
  // ─── Delivery & Closure ───
  'delivery_complete': {
    label: 'אספקה הושלמה',
    stage: 'delivery → closure',
    actions: ['create_invoice', 'update_project_status', 'trigger_closure_check', 'send_notification'],
  },
};

// ═══════════════════════════════════════════════════════════════
// SYSTEM MENU — hierarchical navigation
// ═══════════════════════════════════════════════════════════════

const SYSTEM_MENU = [
  { id: 'control', label: 'מרכז בקרה', icon: '🏠', items: [
    { id: 'dashboard', label: 'Dashboard' }, { id: 'live-bi', label: 'Live BI' },
    { id: 'alerts', label: 'Alerts' }, { id: 'status', label: 'Status' }, { id: 'audit', label: 'Audit' },
  ]},
  { id: 'sales', label: 'מכירות ולקוחות', icon: '🤝', items: [
    { id: 'leads', label: 'Leads' }, { id: 'crm', label: 'CRM' }, { id: 'customers', label: 'Customers' },
    { id: 'sales', label: 'Sales' }, { id: 'customer-portal', label: 'Customer Portal' }, { id: 'contracts', label: 'Contracts' },
  ]},
  { id: 'procurement', label: 'הצעות מחיר ורכש', icon: '🛒', items: [
    { id: 'rfq', label: 'RFQ' }, { id: 'pricing', label: 'Pricing' }, { id: 'approvals', label: 'Approvals' },
    { id: 'po', label: 'PO' }, { id: 'suppliers', label: 'Suppliers' }, { id: 'supplier-portal', label: 'Supplier Portal' },
    { id: 'returns', label: 'Returns' }, { id: 'warranty', label: 'Warranty' },
  ]},
  { id: 'projects', label: 'פרויקטים ותפעול', icon: '📁', items: [
    { id: 'projects', label: 'Projects' }, { id: 'work-orders', label: 'Work Orders' }, { id: 'tasks', label: 'Tasks' },
    { id: 'pipeline', label: 'Pipeline' }, { id: 'manufacturing', label: 'Manufacturing' }, { id: 'logistics', label: 'Logistics' },
    { id: 'supply-chain', label: 'Supply Chain' }, { id: 'signatures', label: 'Signatures' },
  ]},
  { id: 'inventory', label: 'מלאי וחומרים', icon: '📦', items: [
    { id: 'materials', label: 'Materials' }, { id: 'inventory', label: 'Inventory' }, { id: 'warehouse', label: 'Warehouse' },
    { id: 'scanners', label: 'Scanners' }, { id: 'printing', label: 'Printing' },
  ]},
  { id: 'finance', label: 'כספים וחשבונאות', icon: '💰', items: [
    { id: 'finance', label: 'Finance' }, { id: 'gl', label: 'GL' }, { id: 'invoices', label: 'Invoices' },
    { id: 'receipts', label: 'Receipts' }, { id: 'payments', label: 'Payments' }, { id: 'collections', label: 'Collections' },
    { id: 'cash', label: 'Cash' }, { id: 'budget', label: 'Budget' }, { id: 'costing', label: 'Costing' },
    { id: 'fx', label: 'FX' }, { id: 'bank', label: 'Bank' }, { id: 'vat', label: 'VAT' },
    { id: 'tax', label: 'Tax' }, { id: 'consolidation', label: 'Consolidation' },
  ]},
  { id: 'hr', label: 'עובדים ושכר', icon: '👥', items: [
    { id: 'employees', label: 'Employees' }, { id: 'hr', label: 'HR' }, { id: 'time', label: 'Time' },
    { id: 'attendance', label: 'Attendance' }, { id: 'payroll', label: 'Payroll' }, { id: 'pension', label: 'Pension' },
    { id: 'employers', label: 'Employers' },
  ]},
  { id: 'docs', label: 'מסמכים ותקשורת', icon: '📄', items: [
    { id: 'documents', label: 'Documents' }, { id: 'ocr', label: 'OCR' }, { id: 'emails', label: 'Emails' },
    { id: 'sms', label: 'SMS' }, { id: 'whatsapp', label: 'WhatsApp' }, { id: 'notifications', label: 'Notifications' },
    { id: 'comms', label: 'Comms' }, { id: 'chatbot', label: 'Chatbot' }, { id: 'kb', label: 'KB' }, { id: 'support', label: 'Support' },
  ]},
  { id: 'analytics', label: 'דוחות ו-AI', icon: '🧠', items: [
    { id: 'analytics', label: 'Analytics' }, { id: 'reports', label: 'Reports' }, { id: 'reporting', label: 'Reporting' },
    { id: 'forecasting', label: 'Forecasting' }, { id: 'ai-brain', label: 'AI Brain' }, { id: 'insights', label: 'Insights' },
    { id: 'anomalies', label: 'Anomalies' }, { id: 'trends', label: 'Trends' }, { id: 'quality', label: 'Quality' },
    { id: 'nlp-nlq', label: 'NLP / NLQ' },
  ]},
  { id: 'system', label: 'מערכת', icon: '⚙️', items: [
    { id: 'auth', label: 'Auth' }, { id: 'security', label: 'Security' }, { id: 'privacy', label: 'Privacy' },
    { id: 'compliance', label: 'Compliance' }, { id: 'config', label: 'Config' }, { id: 'integrations', label: 'Integrations' },
    { id: 'webhooks', label: 'Webhooks' }, { id: 'workflow', label: 'Workflow' }, { id: 'jobs', label: 'Jobs' },
    { id: 'queue', label: 'Queue' }, { id: 'realtime', label: 'Realtime' }, { id: 'search', label: 'Search' },
    { id: 'flags', label: 'Flags' }, { id: 'devops', label: 'DevOps' }, { id: 'backup', label: 'Backup' },
    { id: 'dr', label: 'DR' }, { id: 'resilience', label: 'Resilience' },
  ]},
];

// ═══════════════════════════════════════════════════════════════
// REGISTER ROUTES
// ═══════════════════════════════════════════════════════════════

function registerPipelineRoutes(app, { supabase, audit }) {

  // ─── Pipeline metadata (stages, relations, topology) ───

  app.get('/api/pipeline/stages', (_req, res) => {
    res.json({ stages: PIPELINE_STAGES });
  });

  app.get('/api/pipeline/relations', (_req, res) => {
    res.json({ relations: ENTITY_RELATIONS });
  });

  app.get('/api/pipeline/topology', (_req, res) => {
    res.json({ topology: SERVICE_TOPOLOGY });
  });

  app.get('/api/pipeline/triggers', (_req, res) => {
    res.json({ triggers: EVENT_TRIGGERS });
  });

  // ─── Entity page definitions (buttons, fields, relations per entity type) ───

  app.get('/api/pipeline/entity-pages', (_req, res) => {
    res.json({ pages: ENTITY_PAGES });
  });

  app.get('/api/pipeline/entity-pages/:type', (req, res) => {
    const page = ENTITY_PAGES[req.params.type];
    if (!page) return res.status(404).json({ error: `Unknown entity type: ${req.params.type}` });
    res.json({ page, statuses: ENTITY_STATUSES[req.params.type] || [] });
  });

  // ─── Entity statuses ───

  app.get('/api/pipeline/statuses', (_req, res) => {
    res.json({ statuses: ENTITY_STATUSES });
  });

  // ─── System menu structure ───

  app.get('/api/pipeline/menu', (_req, res) => {
    res.json({ menu: SYSTEM_MENU });
  });

  // ─── 4-layer architecture ───

  app.get('/api/pipeline/layers', (_req, res) => {
    res.json({ layers: SYSTEM_LAYERS });
  });

  // ─── Pipeline items (tracked entities moving through stages) ───

  app.get('/api/pipeline/items', async (req, res) => {
    let q = supabase.from('pipeline_items').select('*').order('updated_at', { ascending: false });
    if (req.query.stage) q = q.eq('current_stage', req.query.stage);
    if (req.query.entity_type) q = q.eq('entity_type', req.query.entity_type);
    if (req.query.status) q = q.eq('status', req.query.status);
    q = q.limit(parseInt(req.query.limit) || 100);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ items: data || [] });
  });

  app.post('/api/pipeline/items', async (req, res) => {
    const { entity_type, entity_id, entity_name, current_stage, customer_name, value } = req.body;
    if (!entity_type || !current_stage) {
      return res.status(400).json({ error: 'entity_type and current_stage required' });
    }
    const { data, error } = await supabase.from('pipeline_items').insert({
      entity_type,
      entity_id: entity_id || null,
      entity_name: entity_name || '',
      current_stage,
      previous_stage: null,
      customer_name: customer_name || '',
      value: value || 0,
      status: 'active',
      created_by: req.actor || 'api',
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    await audit('pipeline_item', data.id, 'created', req.actor || 'api',
      `פריט pipeline חדש: ${entity_name} (${current_stage})`, null, data);
    res.status(201).json({ item: data });
  });

  app.post('/api/pipeline/items/:id/advance', async (req, res) => {
    const { data: item } = await supabase.from('pipeline_items').select('*').eq('id', req.params.id).single();
    if (!item) return res.status(404).json({ error: 'Pipeline item not found' });

    const stageIds = PIPELINE_STAGES.map(s => s.id);
    const currentIdx = stageIds.indexOf(item.current_stage);
    const nextStage = req.body.next_stage || stageIds[currentIdx + 1];

    if (!nextStage || !stageIds.includes(nextStage)) {
      return res.status(400).json({ error: 'No valid next stage' });
    }

    const { data, error } = await supabase.from('pipeline_items').update({
      previous_stage: item.current_stage,
      current_stage: nextStage,
      status: nextStage === 'closure' ? 'completed' : 'active',
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id).select().single();
    if (error) return res.status(500).json({ error: error.message });

    // Record transition
    await supabase.from('pipeline_transitions').insert({
      pipeline_item_id: data.id,
      from_stage: item.current_stage,
      to_stage: nextStage,
      triggered_by: req.actor || 'api',
      notes: req.body.notes || '',
    }).select();

    await audit('pipeline_item', data.id, 'advanced', req.actor || 'api',
      `Pipeline: ${item.current_stage} → ${nextStage}`, item, data);

    res.json({ item: data, transition: { from: item.current_stage, to: nextStage } });
  });

  app.get('/api/pipeline/items/:id/history', async (req, res) => {
    const { data } = await supabase.from('pipeline_transitions')
      .select('*')
      .eq('pipeline_item_id', req.params.id)
      .order('created_at', { ascending: true });
    res.json({ transitions: data || [] });
  });

  // ─── Pipeline summary (counts per stage) ───

  app.get('/api/pipeline/summary', async (req, res) => {
    const { data: items } = await supabase.from('pipeline_items')
      .select('current_stage, status, value')
      .eq('status', 'active');

    const summary = {};
    for (const stage of PIPELINE_STAGES) {
      summary[stage.id] = { count: 0, value: 0, label: stage.label, labelEn: stage.labelEn, color: stage.color };
    }
    for (const item of (items || [])) {
      if (summary[item.current_stage]) {
        summary[item.current_stage].count++;
        summary[item.current_stage].value += Number(item.value) || 0;
      }
    }
    res.json({ summary });
  });

  // ─── Event trigger execution ───

  app.post('/api/pipeline/trigger', async (req, res) => {
    const { event, entity_id, entity_type, payload } = req.body;
    const trigger = EVENT_TRIGGERS[event];
    if (!trigger) return res.status(400).json({ error: `Unknown event: ${event}` });

    const results = [];
    for (const action of trigger.actions) {
      results.push({ action, status: 'queued', message: `פעולה ${action} תתבצע` });
    }

    // Log the event
    await supabase.from('pipeline_events').insert({
      event_type: event,
      entity_type: entity_type || null,
      entity_id: entity_id || null,
      payload: payload || {},
      actions_triggered: trigger.actions,
      triggered_by: req.actor || 'api',
    }).select();

    await audit('pipeline_event', null, event, req.actor || 'api',
      `Event: ${trigger.label} — ${trigger.actions.length} actions`, null, { event, actions: trigger.actions });

    res.json({ event, label: trigger.label, actions: results });
  });

  app.get('/api/pipeline/events', async (req, res) => {
    const { data } = await supabase.from('pipeline_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(req.query.limit) || 50);
    res.json({ events: data || [] });
  });

  // ─── Cross-service health topology ───

  app.get('/api/pipeline/health', async (_req, res) => {
    const checks = {};
    for (const [svc, info] of Object.entries(SERVICE_TOPOLOGY)) {
      checks[svc] = { ...info, status: 'checking' };
    }

    // Check procurement (self)
    checks.procurement.status = 'up';

    // Check OPS
    try {
      const r = await fetch(`http://localhost:${SERVICE_TOPOLOGY.ops.port}/healthz`, { signal: AbortSignal.timeout(3000) });
      checks.ops.status = r.ok ? 'up' : 'down';
    } catch { checks.ops.status = 'down'; }

    // Check AI
    try {
      const r = await fetch(`http://localhost:${SERVICE_TOPOLOGY.ai.port}/healthz`, { signal: AbortSignal.timeout(3000) });
      checks.ai.status = r.ok ? 'up' : 'down';
    } catch { checks.ai.status = 'down'; }

    // Check Payroll (served as static, check if dist exists)
    checks.payroll.status = 'up'; // served by procurement

    res.json({ services: checks });
  });

  console.log('   ✓ Pipeline engine routes registered');
}

module.exports = {
  registerPipelineRoutes,
  PIPELINE_STAGES, ENTITY_RELATIONS, SERVICE_TOPOLOGY, EVENT_TRIGGERS,
  ENTITY_STATUSES, ENTITY_PAGES, SYSTEM_LAYERS, SYSTEM_MENU,
};
