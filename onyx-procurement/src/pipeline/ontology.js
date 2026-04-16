/**
 * Ontology Layer — Palantir-style Object Graph for Techno-Kol Uzi ERP 2026
 *
 * 5 Layers:
 *  1. ONTOLOGY — Object types, link types, property types
 *  2. OPERATIONAL WORKFLOWS — Process definitions
 *  3. APPLICATIONS — 360 pages, dashboards, control rooms
 *  4. SIGNALS & INTELLIGENCE — Anomalies, forecasts, recommendations
 *  5. GOVERNANCE — Permissions, audit, validation, approval chains
 *
 * This is the Single Source of Truth for the entire object model.
 * Every page, every button, every API derives from this ontology.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// LAYER 1: ONTOLOGY — Object Types
// ═══════════════════════════════════════════════════════════════

const OBJECT_TYPES = {
  // ─── Commercial ───
  lead:            { layer: 'commercial',  label: 'ליד',           labelEn: 'Lead',            icon: '🎯', service: 'ops',         color: '#8b5cf6' },
  customer:        { layer: 'commercial',  label: 'לקוח',          labelEn: 'Customer',        icon: '👤', service: 'ops',         color: '#6366f1' },
  sales_opportunity:{ layer: 'commercial', label: 'הזדמנות מכירה', labelEn: 'Opportunity',     icon: '💎', service: 'ops',         color: '#7c3aed' },

  // ─── Procurement ───
  supplier:        { layer: 'procurement', label: 'ספק',           labelEn: 'Supplier',        icon: '🏭', service: 'procurement', color: '#f59e0b' },
  quote:           { layer: 'procurement', label: 'הצעת מחיר',     labelEn: 'Quote',           icon: '📋', service: 'procurement', color: '#3b82f6' },
  rfq:             { layer: 'procurement', label: 'בקשת הצעה',     labelEn: 'RFQ',             icon: '📨', service: 'procurement', color: '#0ea5e9' },
  supplier_quote:  { layer: 'procurement', label: 'הצעת ספק',      labelEn: 'Supplier Quote',  icon: '📄', service: 'procurement', color: '#0284c7' },
  po:              { layer: 'procurement', label: 'הזמנת רכש',     labelEn: 'Purchase Order',  icon: '🛒', service: 'procurement', color: '#d97706' },
  approval:        { layer: 'procurement', label: 'אישור',         labelEn: 'Approval',        icon: '✅', service: 'procurement', color: '#16a34a' },
  contract:        { layer: 'procurement', label: 'חוזה',          labelEn: 'Contract',        icon: '📑', service: 'procurement', color: '#475569' },

  // ─── Operations ───
  project:         { layer: 'operations',  label: 'פרויקט',        labelEn: 'Project',         icon: '📁', service: 'ops',         color: '#10b981' },
  work_order:      { layer: 'operations',  label: 'הזמנת עבודה',   labelEn: 'Work Order',      icon: '🔧', service: 'ops',         color: '#059669' },
  task:            { layer: 'operations',  label: 'משימה',         labelEn: 'Task',            icon: '📌', service: 'ops',         color: '#64748b' },
  logistics_order: { layer: 'operations',  label: 'הזמנת לוגיסטיקה',labelEn: 'Logistics Order', icon: '🚚', service: 'ops',         color: '#14b8a6' },
  quality_check:   { layer: 'operations',  label: 'בדיקת איכות',   labelEn: 'Quality Check',   icon: '🔍', service: 'ops',         color: '#0d9488' },
  signature:       { layer: 'operations',  label: 'חתימה',         labelEn: 'Signature',       icon: '✍️', service: 'ops',         color: '#334155' },

  // ─── Inventory ───
  material:        { layer: 'inventory',   label: 'חומר',          labelEn: 'Material',        icon: '📦', service: 'ops',         color: '#ca8a04' },
  inventory:       { layer: 'inventory',   label: 'מלאי',          labelEn: 'Inventory',       icon: '🏗️', service: 'ops',         color: '#a16207' },
  warehouse:       { layer: 'inventory',   label: 'מחסן',          labelEn: 'Warehouse',       icon: '🏭', service: 'ops',         color: '#92400e' },

  // ─── Finance ───
  invoice:         { layer: 'finance',     label: 'חשבונית',       labelEn: 'Invoice',         icon: '💰', service: 'procurement', color: '#ef4444' },
  payment:         { layer: 'finance',     label: 'תשלום',         labelEn: 'Payment',         icon: '💳', service: 'procurement', color: '#dc2626' },
  receipt:         { layer: 'finance',     label: 'קבלה',          labelEn: 'Receipt',         icon: '🧾', service: 'procurement', color: '#b91c1c' },
  bank_match:      { layer: 'finance',     label: 'התאמת בנק',     labelEn: 'Bank Match',      icon: '🏦', service: 'procurement', color: '#991b1b' },
  gl_transaction:  { layer: 'finance',     label: 'תנועה חשבונאית',labelEn: 'GL Transaction',  icon: '📊', service: 'procurement', color: '#7f1d1d' },
  vat_record:      { layer: 'finance',     label: 'רשומת מע"מ',    labelEn: 'VAT Record',      icon: '📑', service: 'procurement', color: '#881337' },
  expense:         { layer: 'finance',     label: 'הוצאה',         labelEn: 'Expense',         icon: '🧾', service: 'procurement', color: '#be123c' },
  collection_case: { layer: 'finance',     label: 'תיק גביה',     labelEn: 'Collection Case', icon: '⚠️', service: 'procurement', color: '#e11d48' },

  // ─── HR & Payroll ───
  employee:        { layer: 'hr',          label: 'עובד',          labelEn: 'Employee',        icon: '👷', service: 'payroll',     color: '#ec4899' },
  employer:        { layer: 'hr',          label: 'מעסיק',         labelEn: 'Employer',        icon: '🏢', service: 'payroll',     color: '#db2777' },
  attendance:      { layer: 'hr',          label: 'נוכחות',        labelEn: 'Attendance',      icon: '⏰', service: 'payroll',     color: '#be185d' },
  payroll:         { layer: 'hr',          label: 'שכר',           labelEn: 'Payroll',         icon: '💰', service: 'payroll',     color: '#9d174d' },
  wage_slip:       { layer: 'hr',          label: 'תלוש שכר',     labelEn: 'Wage Slip',       icon: '📄', service: 'payroll',     color: '#831843' },
  pension_record:  { layer: 'hr',          label: 'פנסיה',         labelEn: 'Pension',         icon: '🏦', service: 'payroll',     color: '#701a75' },

  // ─── Intelligence ───
  ai_insight:      { layer: 'intelligence',label: 'תובנת AI',      labelEn: 'AI Insight',      icon: '🧠', service: 'ai',          color: '#7c3aed' },
  anomaly_case:    { layer: 'intelligence',label: 'חריגה',          labelEn: 'Anomaly',         icon: '🚨', service: 'ai',          color: '#dc2626' },
  forecast:        { layer: 'intelligence',label: 'תחזית',          labelEn: 'Forecast',        icon: '📈', service: 'ai',          color: '#2563eb' },
  recommendation:  { layer: 'intelligence',label: 'המלצה',          labelEn: 'Recommendation',  icon: '💡', service: 'ai',          color: '#7c3aed' },

  // ─── Governance ───
  document:        { layer: 'governance',  label: 'מסמך',          labelEn: 'Document',        icon: '📄', service: 'procurement', color: '#64748b' },
  alert:           { layer: 'governance',  label: 'התראה',         labelEn: 'Alert',           icon: '🚨', service: 'ai',          color: '#ef4444' },
  audit_entry:     { layer: 'governance',  label: 'רשומת ביקורת',  labelEn: 'Audit Entry',     icon: '📋', service: 'procurement', color: '#475569' },
};

// ═══════════════════════════════════════════════════════════════
// LINK TYPES — How objects connect
// ═══════════════════════════════════════════════════════════════

const LINK_TYPES = {
  // Commercial
  'lead→customer':          { label: 'המרה',         verb: 'converted_to' },
  'lead→quote':             { label: 'הצעה מליד',    verb: 'quoted_from' },
  'customer→quote':         { label: 'הצעה ללקוח',   verb: 'quoted_for' },
  'customer→project':       { label: 'פרויקט ללקוח', verb: 'project_for' },
  'customer→invoice':       { label: 'חשבונית ללקוח',verb: 'invoiced_to' },
  'customer→contract':      { label: 'חוזה עם לקוח', verb: 'contracted_with' },

  // Procurement
  'quote→project':          { label: 'המרה לפרויקט', verb: 'converted_to_project' },
  'quote→contract':         { label: 'חוזה מהצעה',   verb: 'contract_from' },
  'rfq→supplier':           { label: 'נשלח לספק',    verb: 'sent_to' },
  'rfq→supplier_quote':     { label: 'הצעת ספק',     verb: 'received_quote' },
  'rfq→po':                 { label: 'הזמנה מ-RFQ',  verb: 'converted_to_po' },
  'supplier→po':            { label: 'הזמנה מספק',   verb: 'ordered_from' },
  'supplier→invoice':       { label: 'חשבונית מספק', verb: 'invoiced_by' },
  'po→inventory':           { label: 'קבלה למלאי',   verb: 'received_into' },
  'po→project':             { label: 'רכש לפרויקט',  verb: 'procured_for' },

  // Operations
  'project→work_order':     { label: 'הזמנת עבודה',  verb: 'has_work_order' },
  'project→po':             { label: 'רכש לפרויקט',  verb: 'has_purchase_order' },
  'project→task':           { label: 'משימה',        verb: 'has_task' },
  'project→invoice':        { label: 'חשבונית',      verb: 'has_invoice' },
  'project→employee':       { label: 'שיבוץ',        verb: 'assigned_to' },
  'work_order→employee':    { label: 'שיבוץ לעובד',  verb: 'assigned_worker' },
  'work_order→material':    { label: 'חומר נדרש',    verb: 'requires_material' },
  'work_order→quality_check':{ label: 'בדיקת איכות', verb: 'checked_by' },
  'work_order→signature':   { label: 'חתימה',        verb: 'signed_off_by' },

  // Finance
  'invoice→payment':        { label: 'תשלום',        verb: 'paid_by' },
  'invoice→vat_record':     { label: 'רשומת מע"מ',   verb: 'posted_vat' },
  'payment→bank_match':     { label: 'התאמת בנק',    verb: 'matched_to' },

  // HR
  'employee→attendance':    { label: 'נוכחות',       verb: 'attended' },
  'employee→payroll':       { label: 'שכר',          verb: 'paid_salary' },
  'employee→work_order':    { label: 'שובץ',         verb: 'assigned_to_wo' },
  'attendance→payroll':     { label: 'לחישוב שכר',   verb: 'feeds_into' },

  // Intelligence
  'project→forecast':       { label: 'תחזית',        verb: 'forecasted' },
  'project→anomaly_case':   { label: 'חריגה',        verb: 'anomaly_detected' },
  'invoice→anomaly_case':   { label: 'חריגה כספית',  verb: 'financial_anomaly' },

  // Governance (polymorphic)
  'any→document':           { label: 'מסמך מצורף',   verb: 'has_document' },
  'any→audit_entry':        { label: 'רשומת ביקורת', verb: 'audited' },
  'any→alert':              { label: 'התראה',        verb: 'has_alert' },
  'any→task':               { label: 'משימה',        verb: 'has_task' },
};

// ═══════════════════════════════════════════════════════════════
// ACTION TYPES — What can be done to objects
// ═══════════════════════════════════════════════════════════════

const ACTION_TYPES = {
  create:      { label: 'יצירה',    labelEn: 'Create',    icon: '➕', auditable: true },
  update:      { label: 'עדכון',    labelEn: 'Update',    icon: '✏️', auditable: true },
  delete:      { label: 'מחיקה',    labelEn: 'Delete',    icon: '🗑️', auditable: true },
  transition:  { label: 'מעבר',     labelEn: 'Transition',icon: '→',  auditable: true },
  approve:     { label: 'אישור',    labelEn: 'Approve',   icon: '✅', auditable: true, requires_permission: true },
  reject:      { label: 'דחייה',    labelEn: 'Reject',    icon: '❌', auditable: true, requires_permission: true },
  convert:     { label: 'המרה',     labelEn: 'Convert',   icon: '🔄', auditable: true },
  issue:       { label: 'הנפקה',    labelEn: 'Issue',     icon: '📤', auditable: true },
  send:        { label: 'שליחה',    labelEn: 'Send',      icon: '📨', auditable: true },
  receive:     { label: 'קבלה',     labelEn: 'Receive',   icon: '📦', auditable: true },
  pay:         { label: 'תשלום',    labelEn: 'Pay',       icon: '💳', auditable: true },
  reconcile:   { label: 'התאמה',    labelEn: 'Reconcile', icon: '🏦', auditable: true },
  assign:      { label: 'שיבוץ',    labelEn: 'Assign',    icon: '👷', auditable: true },
  sign:        { label: 'חתימה',    labelEn: 'Sign',      icon: '✍️', auditable: true },
  close:       { label: 'סגירה',    labelEn: 'Close',     icon: '🔒', auditable: true },
  archive:     { label: 'ארכיון',   labelEn: 'Archive',   icon: '📁', auditable: true },
  export:      { label: 'ייצוא',    labelEn: 'Export',    icon: '📥', auditable: false },
  notify:      { label: 'התראה',    labelEn: 'Notify',    icon: '🔔', auditable: false },
};

// ═══════════════════════════════════════════════════════════════
// LAYER 4: SIGNAL DEFINITIONS — Auto-generated alerts
// ═══════════════════════════════════════════════════════════════

const SIGNAL_RULES = [
  { id: 'project_over_budget',       entity: 'project',    severity: 'high',   condition: 'actual_cost > budget * 1.05',                     label: 'חריגת תקציב פרויקט' },
  { id: 'missing_material_for_wo',   entity: 'work_order', severity: 'high',   condition: 'required_material_unreserved == true',             label: 'חוסר חומרים להזמנת עבודה' },
  { id: 'po_overdue_delivery',       entity: 'po',         severity: 'medium', condition: 'expected_delivery < now AND not_fully_received',   label: 'איחור באספקת הזמנת רכש' },
  { id: 'invoice_overdue',           entity: 'invoice',    severity: 'high',   condition: 'due_date < now AND balance > 0',                  label: 'חשבונית באיחור' },
  { id: 'payroll_anomaly',           entity: 'payroll',    severity: 'high',   condition: 'ai_anomaly_score > threshold',                    label: 'חריגה בשכר' },
  { id: 'cashflow_drop',             entity: 'cashflow',   severity: 'high',   condition: 'ai_cashflow_drop > configured_threshold',         label: 'ירידה חריגה בתזרים' },
  { id: 'supplier_late_delivery',    entity: 'supplier',   severity: 'medium', condition: 'on_time_rate < 0.8',                              label: 'ספק עם אחוז איחורים גבוה' },
  { id: 'attendance_missing',        entity: 'employee',   severity: 'medium', condition: 'expected_attendance AND no_record',                label: 'נוכחות חסרה' },
  { id: 'quote_expiring',            entity: 'quote',      severity: 'low',    condition: 'valid_until < now + 3days AND status == sent',     label: 'הצעת מחיר עומדת לפוג' },
  { id: 'work_order_overdue',        entity: 'work_order', severity: 'medium', condition: 'due_date < now AND status != signed_off',          label: 'הזמנת עבודה באיחור' },
];

// ═══════════════════════════════════════════════════════════════
// LAYER 5: PERMISSION MODEL
// ═══════════════════════════════════════════════════════════════

const PERMISSION_ROLES = {
  super_admin:          { access: '*', label: 'מנהל על' },
  finance_manager:      { access: ['finance', 'invoices', 'payments', 'gl', 'vat', 'tax', 'bank', 'collections', 'reports', 'expenses', 'budget', 'costing'], label: 'מנהל כספים' },
  procurement_manager:  { access: ['rfq', 'po', 'suppliers', 'contracts', 'returns', 'warranty', 'pricing', 'approvals'], label: 'מנהל רכש' },
  ops_manager:          { access: ['projects', 'work_orders', 'materials', 'logistics', 'tasks', 'reports', 'alerts', 'leads', 'customers'], label: 'מנהל תפעול' },
  payroll_manager:      { access: ['payroll', 'attendance', 'employees', 'employers', 'wage_slips', 'pension'], label: 'מנהל שכר' },
  hr_manager:           { access: ['employees', 'hr', 'attendance', 'documents'], label: 'מנהל HR' },
  sales_manager:        { access: ['leads', 'customers', 'quotes', 'contracts', 'sales', 'crm'], label: 'מנהל מכירות' },
  project_manager:      { access: ['projects', 'work_orders', 'tasks', 'materials', 'employees', 'expenses', 'reports'], label: 'מנהל פרויקטים' },
  warehouse_manager:    { access: ['inventory', 'warehouse', 'materials', 'scanners', 'logistics'], label: 'מנהל מחסן' },
  field_worker:         { access: ['assigned_work_orders', 'attendance_self', 'tasks_self'], label: 'עובד שטח' },
  accountant:           { access: ['invoices', 'payments', 'vat', 'tax', 'bank', 'gl', 'reports'], label: 'רואה חשבון' },
  viewer:               { access: ['reports', 'dashboards'], label: 'צפייה בלבד' },
  supplier_portal_user: { access: ['supplier_portal'], label: 'משתמש פורטל ספק' },
  customer_portal_user: { access: ['customer_portal'], label: 'משתמש פורטל לקוח' },
};

// ═══════════════════════════════════════════════════════════════
// LAYER 3: APPLICATION DEFINITIONS — Control Rooms & Dashboards
// ═══════════════════════════════════════════════════════════════

const CONTROL_ROOMS = {
  executive: {
    label: 'מגדל בקרה ניהולי', labelEn: 'Executive Control Tower', icon: '🏛️',
    purpose: 'מרכז שליטה ניהולי עליון בסגנון Palantir',
    sources: ['projects', 'invoices', 'payments', 'payroll', 'alerts', 'ai_insights'],
    widgets: ['revenue_overview', 'open_projects', 'procurement_bottlenecks', 'overdue_collections', 'cashflow_risk', 'payroll_risk', 'material_shortage_alerts', 'anomaly_feed', 'ai_recommendations', 'system_health'],
    actions: ['drill_into_project', 'drill_into_supplier', 'drill_into_cashflow', 'open_alert', 'assign_task', 'export_executive_report'],
  },
  operations: {
    label: 'חדר בקרה תפעול', labelEn: 'Operations Control Room', icon: '🔧',
    purpose: 'מרכז שליטה תפעולי',
    sources: ['projects', 'work_orders', 'tasks', 'logistics', 'materials', 'workforce'],
    widgets: ['active_work_orders', 'delayed_work_orders', 'project_progress_heatmap', 'workforce_assignment_board', 'logistics_queue', 'material_shortages', 'execution_alerts'],
    actions: ['open_project360', 'open_workorder360', 'assign_team', 'reserve_materials', 'escalate_issue'],
  },
  finance: {
    label: 'חדר בקרה פיננסי', labelEn: 'Finance Control Room', icon: '💰',
    purpose: 'מרכז שליטה פיננסי',
    sources: ['invoices', 'payments', 'bank', 'vat', 'tax', 'budget', 'cashflow', 'collections'],
    widgets: ['ar_summary', 'ap_summary', 'bank_reconciliation_status', 'vat_status', 'annual_tax_status', 'budget_vs_actual', 'cashflow_curve', 'collections_queue'],
    actions: ['issue_invoice', 'register_payment', 'reconcile_bank', 'export_tax', 'open_collection_case'],
  },
  procurement: {
    label: 'חדר בקרה רכש', labelEn: 'Procurement Control Room', icon: '🛒',
    purpose: 'מרכז שליטה רכש',
    sources: ['rfq', 'po', 'suppliers', 'receipts', 'returns', 'approvals'],
    widgets: ['pending_rfq', 'supplier_quote_comparison', 'pending_approvals', 'overdue_pos', 'receiving_today', 'supplier_risk', 'procurement_savings_opportunities'],
    actions: ['create_rfq', 'compare_quotes', 'approve_po', 'receive_items', 'open_supplier360'],
  },
  workforce: {
    label: 'חדר בקרה כח אדם', labelEn: 'Workforce Control Room', icon: '👥',
    purpose: 'מרכז שליטה כח אדם ושכר',
    sources: ['employees', 'attendance', 'payroll', 'expenses', 'assignments'],
    widgets: ['active_employees', 'attendance_missing', 'overtime_alerts', 'payroll_pending', 'reimbursable_expenses', 'workforce_assignment_map'],
    actions: ['add_attendance', 'calculate_payroll', 'assign_work_order', 'reimburse_expense'],
  },
  ai: {
    label: 'חדר בקרה AI', labelEn: 'AI Control Room', icon: '🧠',
    purpose: 'מרכז תובנות והמלצות AI',
    sources: ['anomaly_cases', 'forecasts', 'trends', 'quality_scores', 'recommendations', 'risk_signals'],
    widgets: ['anomaly_stream', 'forecast_panels', 'trend_panels', 'quality_scores', 'decision_recommendations', 'cross_service_risks'],
    actions: ['acknowledge_insight', 'create_task_from_insight', 'apply_recommendation', 'export_ai_report'],
  },
};

// ═══════════════════════════════════════════════════════════════
// ONTOLOGY GRAPH — Build live connection graph
// ═══════════════════════════════════════════════════════════════

function buildOntologyGraph() {
  const nodes = Object.entries(OBJECT_TYPES).map(([id, obj]) => ({
    id, ...obj, linkCount: Object.keys(LINK_TYPES).filter(k => k.startsWith(id + '→') || k.endsWith('→' + id)).length,
  }));

  const edges = Object.entries(LINK_TYPES).map(([key, link]) => {
    const [from, to] = key.split('→');
    return { from, to, ...link };
  });

  const layers = {};
  for (const [id, obj] of Object.entries(OBJECT_TYPES)) {
    if (!layers[obj.layer]) layers[obj.layer] = [];
    layers[obj.layer].push(id);
  }

  return { nodes, edges, layers, stats: { objects: nodes.length, links: edges.length, layers: Object.keys(layers).length } };
}

// ═══════════════════════════════════════════════════════════════
// REGISTER ROUTES
// ═══════════════════════════════════════════════════════════════

function registerOntologyRoutes(app) {

  // Full ontology
  app.get('/api/ontology', (_req, res) => {
    res.json({
      objectTypes: OBJECT_TYPES,
      linkTypes: LINK_TYPES,
      actionTypes: ACTION_TYPES,
      signalRules: SIGNAL_RULES,
      permissions: PERMISSION_ROLES,
      controlRooms: CONTROL_ROOMS,
    });
  });

  // Object graph
  app.get('/api/ontology/graph', (_req, res) => {
    res.json(buildOntologyGraph());
  });

  // Object types by layer
  app.get('/api/ontology/layers', (_req, res) => {
    const layers = {};
    for (const [id, obj] of Object.entries(OBJECT_TYPES)) {
      if (!layers[obj.layer]) layers[obj.layer] = { objects: [], count: 0 };
      layers[obj.layer].objects.push({ id, ...obj });
      layers[obj.layer].count++;
    }
    res.json({ layers });
  });

  // Links for a specific object type
  app.get('/api/ontology/links/:type', (req, res) => {
    const type = req.params.type;
    const outgoing = Object.entries(LINK_TYPES).filter(([k]) => k.startsWith(type + '→')).map(([k, v]) => ({ target: k.split('→')[1], ...v }));
    const incoming = Object.entries(LINK_TYPES).filter(([k]) => k.endsWith('→' + type)).map(([k, v]) => ({ source: k.split('→')[0], ...v }));
    const polymorphic = Object.entries(LINK_TYPES).filter(([k]) => k.startsWith('any→')).map(([k, v]) => ({ target: k.split('→')[1], ...v }));
    res.json({ type, outgoing, incoming, polymorphic });
  });

  // Signal rules
  app.get('/api/ontology/signals', (_req, res) => {
    res.json({ signals: SIGNAL_RULES });
  });

  // Permissions
  app.get('/api/ontology/permissions', (_req, res) => {
    res.json({ roles: PERMISSION_ROLES });
  });

  // Permissions for a role
  app.get('/api/ontology/permissions/:role', (req, res) => {
    const role = PERMISSION_ROLES[req.params.role];
    if (!role) return res.status(404).json({ error: `Unknown role: ${req.params.role}` });
    res.json({ role: req.params.role, ...role });
  });

  // Control rooms
  app.get('/api/ontology/control-rooms', (_req, res) => {
    res.json({ controlRooms: CONTROL_ROOMS });
  });

  console.log('   ✓ Ontology registered (' + Object.keys(OBJECT_TYPES).length + ' objects, ' + Object.keys(LINK_TYPES).length + ' links, ' + SIGNAL_RULES.length + ' signals)');
}

module.exports = {
  OBJECT_TYPES, LINK_TYPES, ACTION_TYPES, SIGNAL_RULES,
  PERMISSION_ROLES, CONTROL_ROOMS,
  buildOntologyGraph, registerOntologyRoutes,
};
