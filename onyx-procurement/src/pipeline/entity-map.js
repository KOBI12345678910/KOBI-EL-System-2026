/**
 * Entity Map — Complete Entity Definitions for Techno-Kol Uzi ERP 2026
 *
 * This is the single source of truth for all entity types, their relations,
 * statuses, next-steps, page layouts, and buttons.
 *
 * Every screen in the system derives from this map.
 */

'use strict';

const ENTITY_MAP = {

  // ═══════════════════════════════════════════════════════════
  // LEAD
  // ═══════════════════════════════════════════════════════════
  lead: {
    label: 'ליד', labelEn: 'Lead', icon: '🎯', service: 'ops',
    purpose: 'ליד ראשוני שנכנס למערכת',
    links: ['customer', 'crm_activity', 'quote', 'task', 'message', 'sales_opportunity'],
    statuses: ['new', 'contacted', 'qualified', 'quoted', 'won', 'lost'],
    nextSteps: [
      { id: 'qualify',            label: 'סווג ליד',           icon: '✅', targetStatus: 'qualified' },
      { id: 'create_quote',       label: 'צור הצעת מחיר',     icon: '📋', creates: 'quote' },
      { id: 'convert_to_customer',label: 'המר ללקוח',          icon: '👤', creates: 'customer', targetStatus: 'won' },
      { id: 'mark_lost',          label: 'סמן כאבוד',         icon: '❌', targetStatus: 'lost' },
    ],
    actions: [
      { id: 'add_task',     label: 'הוסף משימה',    icon: '📌' },
      { id: 'add_note',     label: 'הוסף הערה',     icon: '📝' },
      { id: 'send_whatsapp',label: 'שלח WhatsApp',  icon: '💬' },
      { id: 'send_sms',     label: 'שלח SMS',       icon: '📱' },
      { id: 'send_email',   label: 'שלח אימייל',    icon: '✉️' },
      { id: 'move_stage',   label: 'שנה שלב',       icon: '→' },
    ],
    topFields: ['name', 'customer', 'status', 'owner', 'source', 'value', 'created_at', 'updated_at'],
    relatedSections: ['tasks', 'communications', 'documents', 'audit_log'],
  },

  // ═══════════════════════════════════════════════════════════
  // CUSTOMER
  // ═══════════════════════════════════════════════════════════
  customer: {
    label: 'לקוח', labelEn: 'Customer', icon: '👤', service: 'ops',
    purpose: 'ישות לקוח מרכזית',
    links: ['lead', 'quote', 'contract', 'project', 'invoice', 'payment', 'collection', 'customer_portal', 'document', 'support_ticket', 'message'],
    statuses: ['prospect', 'active', 'vip', 'inactive', 'blocked'],
    nextSteps: [
      { id: 'create_quote',   label: 'צור הצעת מחיר',  icon: '📋', creates: 'quote' },
      { id: 'create_project', label: 'צור פרויקט',     icon: '📁', creates: 'project' },
      { id: 'issue_invoice',  label: 'הנפק חשבונית',   icon: '💰', creates: 'invoice' },
      { id: 'open_support',   label: 'פתח כרטיס תמיכה',icon: '🎫', creates: 'support_ticket' },
    ],
    actions: [
      { id: 'edit',          label: 'עריכה',           icon: '✏️' },
      { id: 'add_document',  label: 'הוסף מסמך',       icon: '📄' },
      { id: 'add_note',      label: 'הוסף הערה',       icon: '📝' },
      { id: 'send_message',  label: 'שלח הודעה',       icon: '💬' },
      { id: 'view_portal',   label: 'פורטל לקוח',      icon: '🌐' },
    ],
    topFields: ['name', 'id_number', 'phone', 'email', 'status', 'total_revenue', 'open_balance', 'created_at'],
    relatedSections: ['leads', 'quotes', 'projects', 'invoices', 'payments', 'support_tickets', 'documents', 'communications', 'audit_log'],
  },

  // ═══════════════════════════════════════════════════════════
  // SUPPLIER
  // ═══════════════════════════════════════════════════════════
  supplier: {
    label: 'ספק', labelEn: 'Supplier', icon: '🏭', service: 'procurement',
    purpose: 'ישות ספק מרכזית',
    links: ['rfq', 'supplier_quote', 'po', 'supplier_invoice', 'payment', 'contract', 'return', 'warranty', 'supplier_portal', 'document', 'performance_score'],
    statuses: ['active', 'preferred', 'probation', 'blocked', 'inactive'],
    nextSteps: [
      { id: 'send_rfq',                label: 'שלח בקשת הצעה',       icon: '📋', creates: 'rfq' },
      { id: 'create_po',               label: 'צור הזמנת רכש',       icon: '🛒', creates: 'po' },
      { id: 'register_supplier_invoice',label: 'רשום חשבונית ספק',    icon: '💰', creates: 'supplier_invoice' },
      { id: 'open_return',             label: 'פתח החזרה',           icon: '↩️', creates: 'return' },
    ],
    actions: [
      { id: 'edit',            label: 'עריכה',            icon: '✏️' },
      { id: 'view_portal',     label: 'פורטל ספק',        icon: '🌐' },
      { id: 'view_score',      label: 'ציון ביצועים',     icon: '📊' },
      { id: 'add_contract',    label: 'צרף חוזה',         icon: '📄' },
      { id: 'add_document',    label: 'הוסף מסמך',        icon: '📎' },
    ],
    topFields: ['name', 'contact_person', 'phone', 'email', 'status', 'overall_score', 'total_spent', 'total_orders', 'created_at'],
    relatedSections: ['rfqs', 'pos', 'invoices', 'payments', 'contracts', 'returns', 'warranties', 'documents', 'performance', 'audit_log'],
  },

  // ═══════════════════════════════════════════════════════════
  // QUOTE
  // ═══════════════════════════════════════════════════════════
  quote: {
    label: 'הצעת מחיר', labelEn: 'Quote', icon: '📋', service: 'procurement',
    purpose: 'הצעת מחיר ללקוח',
    links: ['lead', 'customer', 'pricing', 'approval', 'contract', 'project', 'document', 'tax_export'],
    statuses: ['draft', 'sent', 'under_review', 'approved', 'rejected', 'converted'],
    nextSteps: [
      { id: 'send',               label: 'שלח ללקוח',          icon: '📤', targetStatus: 'sent' },
      { id: 'approve',            label: 'אשר',               icon: '✅', targetStatus: 'approved' },
      { id: 'convert_to_project', label: 'המר לפרויקט',       icon: '📁', creates: 'project', targetStatus: 'converted' },
      { id: 'reject',             label: 'דחה',               icon: '❌', targetStatus: 'rejected' },
    ],
    actions: [
      { id: 'edit',             label: 'עריכה',              icon: '✏️' },
      { id: 'compare_quotes',   label: 'השווה הצעות',        icon: '⚖️' },
      { id: 'generate_pricing', label: 'מחירון אוטומטי',    icon: '💲' },
      { id: 'generate_contract',label: 'צור חוזה',           icon: '📄', creates: 'contract' },
      { id: 'export_pdf',       label: 'ייצוא PDF',          icon: '📥' },
      { id: 'send_approval',    label: 'שלח לאישור',         icon: '🔒' },
    ],
    topFields: ['quote_number', 'customer', 'status', 'total', 'vat', 'valid_until', 'owner', 'created_at'],
    relatedSections: ['customer', 'lead', 'pricing_lines', 'approvals', 'contracts', 'documents', 'audit_log'],
  },

  // ═══════════════════════════════════════════════════════════
  // RFQ
  // ═══════════════════════════════════════════════════════════
  rfq: {
    label: 'בקשת הצעת מחיר', labelEn: 'RFQ', icon: '📨', service: 'procurement',
    purpose: 'בקשת הצעת מחיר מספקים',
    links: ['supplier', 'pricing', 'approval', 'supplier_quote', 'po', 'document'],
    statuses: ['draft', 'sent', 'quotes_received', 'under_comparison', 'approved', 'rejected', 'converted_to_po', 'cancelled'],
    nextSteps: [
      { id: 'send_to_suppliers',label: 'שלח לספקים',         icon: '📤', targetStatus: 'sent' },
      { id: 'compare_quotes',  label: 'השווה הצעות',        icon: '⚖️' },
      { id: 'approve',         label: 'אשר בחירה',          icon: '✅', targetStatus: 'decided' },
      { id: 'convert_to_po',   label: 'צור הזמנת רכש',      icon: '🛒', creates: 'po' },
    ],
    actions: [
      { id: 'edit',           label: 'עריכה',              icon: '✏️' },
      { id: 'add_supplier',   label: 'הוסף ספק',           icon: '🏭' },
      { id: 'add_document',   label: 'הוסף מסמך',          icon: '📎' },
    ],
    topFields: ['rfq_number', 'title', 'status', 'suppliers_count', 'quotes_count', 'deadline', 'created_at'],
    relatedSections: ['suppliers', 'supplier_quotes', 'approvals', 'pos', 'documents', 'audit_log'],
  },

  // ═══════════════════════════════════════════════════════════
  // PURCHASE ORDER
  // ═══════════════════════════════════════════════════════════
  po: {
    label: 'הזמנת רכש', labelEn: 'Purchase Order', icon: '🛒', service: 'procurement',
    purpose: 'הזמנת רכש מספק',
    links: ['supplier', 'rfq', 'approval', 'inventory_receipt', 'supplier_invoice', 'return', 'warranty', 'project', 'costing'],
    statuses: ['draft', 'pending_approval', 'approved', 'sent', 'partially_received', 'fully_received', 'closed'],
    nextSteps: [
      { id: 'approve',         label: 'אשר',                icon: '✅', targetStatus: 'approved' },
      { id: 'send_to_supplier',label: 'שלח לספק',           icon: '📤', targetStatus: 'sent' },
      { id: 'receive_items',   label: 'קבלת סחורה',         icon: '📦', creates: 'inventory_receipt' },
      { id: 'close',           label: 'סגור הזמנה',         icon: '🔒', targetStatus: 'closed' },
    ],
    actions: [
      { id: 'edit',             label: 'עריכה',             icon: '✏️' },
      { id: 'create_invoice',   label: 'צור חשבונית ספק',  icon: '💰', creates: 'supplier_invoice' },
      { id: 'open_return',      label: 'פתח החזרה',        icon: '↩️', creates: 'return' },
      { id: 'attach_contract',  label: 'צרף חוזה',         icon: '📄' },
      { id: 'export_pdf',       label: 'ייצוא PDF',        icon: '📥' },
    ],
    topFields: ['po_number', 'supplier', 'status', 'total', 'project', 'expected_date', 'received_date', 'created_at'],
    relatedSections: ['supplier', 'rfq', 'items', 'approvals', 'receipts', 'invoices', 'returns', 'documents', 'audit_log'],
  },

  // ═══════════════════════════════════════════════════════════
  // PROJECT
  // ═══════════════════════════════════════════════════════════
  project: {
    label: 'פרויקט', labelEn: 'Project', icon: '📁', service: 'ops',
    purpose: 'יחידת הביצוע המרכזית',
    links: ['customer', 'quote', 'contract', 'work_order', 'po', 'inventory_reservation', 'material_request', 'expense', 'employee_assignment', 'task', 'logistics_order', 'invoice', 'payment', 'report', 'forecast', 'document', 'alert', 'audit_log'],
    statuses: ['draft', 'approved', 'in_planning', 'in_procurement', 'in_production', 'in_delivery', 'completed', 'closed'],
    nextSteps: [
      { id: 'start_planning',    label: 'התחל תכנון',         icon: '📐', targetStatus: 'in_planning' },
      { id: 'start_procurement', label: 'התחל רכש',           icon: '🛒', targetStatus: 'in_procurement' },
      { id: 'start_production',  label: 'התחל ייצור',         icon: '🏗️', targetStatus: 'in_production' },
      { id: 'start_delivery',    label: 'התחל אספקה',         icon: '🚚', targetStatus: 'in_delivery' },
      { id: 'complete',          label: 'סמן כהושלם',         icon: '✅', targetStatus: 'completed' },
      { id: 'close',             label: 'סגור פרויקט',        icon: '🔒', targetStatus: 'closed' },
    ],
    actions: [
      { id: 'create_work_order', label: 'צור הזמנת עבודה',   icon: '🔧', creates: 'work_order' },
      { id: 'create_po',         label: 'צור הזמנת רכש',     icon: '🛒', creates: 'po' },
      { id: 'create_invoice',    label: 'צור חשבונית',       icon: '💰', creates: 'invoice' },
      { id: 'allocate_materials',label: 'הקצה חומרים',       icon: '📦' },
      { id: 'assign_employees',  label: 'שבץ עובדים',        icon: '👷' },
      { id: 'add_task',          label: 'הוסף משימה',        icon: '📌' },
      { id: 'open_logistics',    label: 'פתח לוגיסטיקה',    icon: '🚚' },
      { id: 'view_financials',   label: 'דוח כספי',          icon: '📊' },
    ],
    topFields: ['name', 'customer', 'status', 'budget', 'actual_cost', 'progress', 'manager', 'start_date', 'end_date'],
    relatedSections: ['customer', 'quote', 'contract', 'work_orders', 'pos', 'materials', 'tasks', 'employees', 'expenses', 'logistics', 'invoices', 'payments', 'reports', 'documents', 'alerts', 'audit_log'],
  },

  // ═══════════════════════════════════════════════════════════
  // WORK ORDER
  // ═══════════════════════════════════════════════════════════
  work_order: {
    label: 'הזמנת עבודה', labelEn: 'Work Order', icon: '🔧', service: 'ops',
    purpose: 'יחידת עבודה תפעולית',
    links: ['project', 'material_request', 'inventory_reservation', 'employee_assignment', 'attendance', 'task', 'quality_check', 'signature', 'expense'],
    statuses: ['open', 'assigned', 'in_progress', 'waiting_materials', 'qa', 'completed', 'signed_off', 'cancelled'],
    nextSteps: [
      { id: 'assign',    label: 'שבץ עובדים',         icon: '👷', targetStatus: 'assigned' },
      { id: 'start',     label: 'התחל ביצוע',         icon: '▶️', targetStatus: 'in_progress' },
      { id: 'qa',        label: 'בדיקת איכות',        icon: '🔍', targetStatus: 'qa_check' },
      { id: 'complete',  label: 'סמן כהושלם',         icon: '✅', targetStatus: 'done' },
      { id: 'signoff',   label: 'חתימה וסגירה',       icon: '✍️', targetStatus: 'signed_off' },
    ],
    actions: [
      { id: 'assign_worker',     label: 'שבץ עובד',          icon: '👷' },
      { id: 'reserve_materials', label: 'הזמן חומרים',       icon: '📦' },
      { id: 'update_progress',   label: 'עדכן התקדמות',      icon: '📊' },
      { id: 'add_expense',       label: 'הוסף הוצאה',        icon: '🧾' },
      { id: 'add_document',      label: 'הוסף מסמך',         icon: '📎' },
    ],
    topFields: ['wo_number', 'project', 'status', 'assigned_to', 'priority', 'progress', 'due_date', 'created_at'],
    relatedSections: ['project', 'materials', 'employees', 'tasks', 'quality_checks', 'signatures', 'expenses', 'documents', 'status_history', 'audit_log'],
  },

  // ═══════════════════════════════════════════════════════════
  // INVOICE
  // ═══════════════════════════════════════════════════════════
  invoice: {
    label: 'חשבונית', labelEn: 'Invoice', icon: '💰', service: 'procurement',
    purpose: 'חשבונית ללקוח או מספק',
    links: ['customer', 'supplier', 'project', 'po', 'payment', 'collection', 'vat', 'tax', 'bank_match', 'document'],
    statuses: ['draft', 'issued', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled'],
    nextSteps: [
      { id: 'issue',             label: 'הנפק',               icon: '📤', targetStatus: 'issued' },
      { id: 'send',              label: 'שלח ללקוח',          icon: '✉️', targetStatus: 'sent' },
      { id: 'register_payment',  label: 'רשום תשלום',         icon: '💳', creates: 'payment' },
      { id: 'mark_overdue',      label: 'סמן כחריגה',         icon: '⚠️', targetStatus: 'overdue' },
      { id: 'cancel',            label: 'בטל',                icon: '❌', targetStatus: 'cancelled' },
    ],
    actions: [
      { id: 'edit',              label: 'עריכה',              icon: '✏️' },
      { id: 'match_bank',        label: 'התאם לבנק',          icon: '🏦' },
      { id: 'export_tax',        label: 'ייצוא למס',          icon: '📊' },
      { id: 'send_reminder',     label: 'שלח תזכורת',         icon: '🔔' },
      { id: 'move_collections',  label: 'העבר לגביה',         icon: '⚠️' },
      { id: 'export_pdf',        label: 'ייצוא PDF',          icon: '📥' },
    ],
    topFields: ['invoice_number', 'customer_or_supplier', 'direction', 'status', 'net_amount', 'vat_amount', 'gross_amount', 'amount_paid', 'amount_outstanding', 'due_date', 'created_at'],
    relatedSections: ['customer', 'supplier', 'project', 'po', 'line_items', 'payments', 'bank_matches', 'vat_period', 'documents', 'audit_log'],
  },

  // ═══════════════════════════════════════════════════════════
  // EMPLOYEE
  // ═══════════════════════════════════════════════════════════
  employee: {
    label: 'עובד', labelEn: 'Employee', icon: '👷', service: 'payroll',
    purpose: 'ישות עובד',
    links: ['hr_profile', 'attendance', 'payroll', 'pension', 'expense', 'work_order', 'project', 'task', 'employer', 'document'],
    statuses: ['active', 'on_leave', 'suspended', 'terminated'],
    nextSteps: [
      { id: 'assign_to_work',     label: 'שבץ לעבודה',        icon: '🔧' },
      { id: 'track_time',         label: 'רשום שעות',         icon: '⏰' },
      { id: 'calculate_payroll',  label: 'חשב שכר',           icon: '💰' },
      { id: 'reimburse_expense',  label: 'החזר הוצאה',        icon: '🧾' },
    ],
    actions: [
      { id: 'edit',               label: 'עריכה',             icon: '✏️' },
      { id: 'view_attendance',    label: 'צפה בנוכחות',       icon: '⏰' },
      { id: 'add_expense',        label: 'הוסף הוצאה',        icon: '🧾' },
      { id: 'view_work_orders',   label: 'הזמנות עבודה',     icon: '🔧' },
      { id: 'view_payslips',      label: 'תלושי שכר',         icon: '📄' },
      { id: 'add_document',       label: 'הוסף מסמך',         icon: '📎' },
    ],
    topFields: ['name', 'id_number', 'role', 'department', 'status', 'employer', 'hire_date', 'phone', 'email'],
    relatedSections: ['attendance', 'payroll', 'payslips', 'tasks', 'work_orders', 'projects', 'expenses', 'pension', 'documents', 'audit_log'],
  },

  // ═══════════════════════════════════════════════════════════
  // SUPPORTING ENTITIES
  // ═══════════════════════════════════════════════════════════

  contract: {
    label: 'חוזה', labelEn: 'Contract', icon: '📄', service: 'procurement',
    purpose: 'מסמך התקשרות',
    links: ['customer', 'supplier', 'quote', 'project', 'po', 'signature', 'document'],
    statuses: ['draft', 'pending_signature', 'active', 'expired', 'terminated'],
    nextSteps: [
      { id: 'sign',               label: 'חתימה',             icon: '✍️', targetStatus: 'active' },
      { id: 'activate',           label: 'הפעל',              icon: '✅', targetStatus: 'active' },
      { id: 'attach_to_project',  label: 'צרף לפרויקט',       icon: '📁' },
    ],
    actions: [{ id: 'edit', label: 'עריכה', icon: '✏️' }, { id: 'export_pdf', label: 'ייצוא PDF', icon: '📥' }],
    topFields: ['contract_number', 'customer_or_supplier', 'status', 'value', 'start_date', 'end_date', 'created_at'],
    relatedSections: ['customer', 'supplier', 'quote', 'project', 'signatures', 'documents', 'audit_log'],
  },

  material: {
    label: 'חומר', labelEn: 'Material', icon: '📦', service: 'ops',
    purpose: 'פריט חומר / רכיב',
    links: ['supplier', 'inventory', 'warehouse', 'po', 'material_request', 'work_order', 'costing', 'barcode_scan'],
    statuses: ['active', 'discontinued', 'out_of_stock'],
    nextSteps: [
      { id: 'purchase',  label: 'הזמן',          icon: '🛒', creates: 'po' },
      { id: 'receive',   label: 'קבל',           icon: '📦' },
      { id: 'reserve',   label: 'הקצה',          icon: '🔒' },
      { id: 'consume',   label: 'צרוך',          icon: '✂️' },
      { id: 'restock',   label: 'מלא מחדש',      icon: '🔄' },
    ],
    actions: [{ id: 'edit', label: 'עריכה', icon: '✏️' }, { id: 'scan_barcode', label: 'סרוק ברקוד', icon: '📷' }],
    topFields: ['name', 'sku', 'category', 'status', 'quantity_on_hand', 'unit_cost', 'supplier', 'warehouse'],
    relatedSections: ['inventory_transactions', 'pos', 'work_orders', 'suppliers', 'costing', 'audit_log'],
  },

  payment: {
    label: 'תשלום', labelEn: 'Payment', icon: '💳', service: 'procurement',
    purpose: 'תשלום או קבלת תשלום',
    links: ['invoice', 'customer', 'supplier', 'bank_match', 'cashflow', 'gl', 'vat', 'tax'],
    statuses: ['pending', 'posted', 'reconciled', 'returned'],
    nextSteps: [
      { id: 'post',       label: 'רשום',           icon: '✅', targetStatus: 'posted' },
      { id: 'reconcile',  label: 'התאם לבנק',      icon: '🏦', targetStatus: 'reconciled' },
      { id: 'allocate',   label: 'שייך לחשבונית', icon: '🔗' },
    ],
    actions: [{ id: 'edit', label: 'עריכה', icon: '✏️' }, { id: 'export', label: 'ייצוא', icon: '📥' }],
    topFields: ['payment_number', 'customer_or_supplier', 'amount', 'method', 'status', 'invoice', 'payment_date'],
    relatedSections: ['invoice', 'bank_match', 'gl_entries', 'documents', 'audit_log'],
  },

  task: {
    label: 'משימה', labelEn: 'Task', icon: '📌', service: 'ops',
    purpose: 'משימה תפעולית / ניהולית',
    links: ['lead', 'customer', 'project', 'work_order', 'employee', 'alert', 'message'],
    statuses: ['todo', 'in_progress', 'blocked', 'done', 'cancelled'],
    nextSteps: [
      { id: 'assign',    label: 'שבץ',            icon: '👷', targetStatus: 'todo' },
      { id: 'start',     label: 'התחל',           icon: '▶️', targetStatus: 'in_progress' },
      { id: 'complete',  label: 'סיים',           icon: '✅', targetStatus: 'done' },
      { id: 'escalate',  label: 'העלה דרג',       icon: '🚨' },
    ],
    actions: [{ id: 'edit', label: 'עריכה', icon: '✏️' }, { id: 'add_note', label: 'הוסף הערה', icon: '📝' }],
    topFields: ['title', 'assignee', 'status', 'priority', 'parent_entity', 'due_date', 'created_at'],
    relatedSections: ['parent_entity', 'assignee', 'notes', 'documents', 'audit_log'],
  },

  document: {
    label: 'מסמך', labelEn: 'Document', icon: '📄', service: 'procurement',
    purpose: 'מסמך מערכת',
    links: ['customer', 'supplier', 'quote', 'contract', 'po', 'project', 'invoice', 'employee', 'ocr', 'signature'],
    statuses: ['uploaded', 'classified', 'signed', 'archived'],
    nextSteps: [
      { id: 'upload',   label: 'העלה',           icon: '📤' },
      { id: 'classify', label: 'סווג',           icon: '🏷️', targetStatus: 'classified' },
      { id: 'sign',     label: 'חתום',           icon: '✍️', targetStatus: 'signed' },
      { id: 'archive',  label: 'ארכב',           icon: '📁', targetStatus: 'archived' },
    ],
    actions: [{ id: 'ocr_scan', label: 'סרוק OCR', icon: '🔍' }, { id: 'download', label: 'הורד', icon: '📥' }],
    topFields: ['name', 'type', 'status', 'parent_entity', 'uploaded_by', 'created_at'],
    relatedSections: ['parent_entity', 'ocr_results', 'signatures', 'audit_log'],
  },

  alert: {
    label: 'התראה', labelEn: 'Alert', icon: '🚨', service: 'ai',
    purpose: 'חריגה / התראה',
    links: ['project', 'po', 'attendance', 'payroll', 'cashflow', 'ai_insight'],
    statuses: ['new', 'acknowledged', 'assigned', 'resolved', 'dismissed'],
    nextSteps: [
      { id: 'acknowledge', label: 'אשר קבלה',     icon: '👁️', targetStatus: 'acknowledged' },
      { id: 'assign',      label: 'שבץ לטיפול',   icon: '👷', targetStatus: 'assigned' },
      { id: 'resolve',     label: 'פתור',          icon: '✅', targetStatus: 'resolved' },
    ],
    actions: [{ id: 'add_note', label: 'הוסף הערה', icon: '📝' }, { id: 'dismiss', label: 'בטל', icon: '❌' }],
    topFields: ['title', 'severity', 'status', 'source', 'parent_entity', 'assigned_to', 'created_at'],
    relatedSections: ['parent_entity', 'related_alerts', 'notes', 'audit_log'],
  },
};

// ═══════════════════════════════════════════════════════════════
// REGISTER ENTITY MAP ROUTES
// ═══════════════════════════════════════════════════════════════

function registerEntityMapRoutes(app) {

  // Full entity map
  app.get('/api/entity-map', (_req, res) => {
    res.json({ entities: ENTITY_MAP });
  });

  // Single entity definition
  app.get('/api/entity-map/:type', (req, res) => {
    const entity = ENTITY_MAP[req.params.type];
    if (!entity) return res.status(404).json({ error: `Unknown entity: ${req.params.type}` });
    res.json({ entity });
  });

  // Entity types list
  app.get('/api/entity-map-types', (_req, res) => {
    const types = Object.entries(ENTITY_MAP).map(([id, e]) => ({
      id, label: e.label, labelEn: e.labelEn, icon: e.icon, service: e.service,
      statusCount: e.statuses.length, linkCount: e.links.length,
    }));
    res.json({ types });
  });

  console.log('   ✓ Entity map routes registered (' + Object.keys(ENTITY_MAP).length + ' entities)');
}

module.exports = { ENTITY_MAP, registerEntityMapRoutes };
