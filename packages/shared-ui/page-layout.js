'use strict';

/**
 * @module shared-ui/page-layout
 * @description Standard page layout definitions for Techno-Kol Uzi ERP 2026.
 *
 * Every page in the system follows one of four layout patterns:
 *   - DETAIL_360  -- Entity detail pages (Customer360, Supplier360, etc.)
 *   - CONTROL_ROOM -- Operational control rooms (Pipeline, Finance, etc.)
 *   - LIST_PAGE    -- Entity list/grid pages
 *   - DASHBOARD    -- KPI/chart dashboards
 *
 * This module also defines the tab structures for all 9 Master 360 Pages.
 *
 * No Dead Pages Rule: Every page must answer:
 *   1. Where am I?
 *   2. What is this?
 *   3. Current status?
 *   4. What can I do?
 *   5. Next step?
 *   6. Related records?
 *
 * @example
 *   const { PAGE_LAYOUT, PAGE_TABS } = require('@techno-kol/shared-ui/page-layout');
 *   const layout = PAGE_LAYOUT.DETAIL_360;
 *   const tabs = PAGE_TABS.Customer360;
 */

/* ═══════════════════════════════════════════════════════════════
 *  PAGE LAYOUT PATTERNS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Standard page layout section definitions.
 * Each layout declares which sections appear and in what order.
 *
 * @readonly
 * @type {Readonly<Object>}
 */
const PAGE_LAYOUT = Object.freeze({

  /**
   * 360 Detail Page -- used for entity drill-down.
   * Sections: header, action_bar, summary_band, main_tabs, side_panel, bottom_feed.
   */
  DETAIL_360: Object.freeze({
    id:       'detail_360',
    name:     'Entity 360 Detail',
    nameHe:   'דף 360 ישות',
    sections: Object.freeze(['header', 'action_bar', 'summary_band', 'main_tabs', 'side_panel', 'bottom_feed']),
    description: 'Full entity detail page with header, action bar, summary KPIs, tabbed content, side panel, and audit feed.',
  }),

  /**
   * Control Room -- operational command center.
   * Sections: header, kpi_strip, widget_grid, action_shortcuts.
   */
  CONTROL_ROOM: Object.freeze({
    id:       'control_room',
    name:     'Control Room',
    nameHe:   'חדר בקרה',
    sections: Object.freeze(['header', 'kpi_strip', 'widget_grid', 'action_shortcuts']),
    description: 'Command center layout with KPI strip at top, configurable widget grid, and quick action shortcuts.',
  }),

  /**
   * List Page -- entity list with filters and table.
   * Sections: header, filters, table, pagination.
   */
  LIST_PAGE: Object.freeze({
    id:       'list_page',
    name:     'List Page',
    nameHe:   'דף רשימה',
    sections: Object.freeze(['header', 'filters', 'table', 'pagination']),
    description: 'Filterable entity list with sortable table and pagination controls.',
  }),

  /**
   * Dashboard -- KPI cards and chart grid.
   * Sections: header, kpi_cards, chart_grid, recent_activity.
   */
  DASHBOARD: Object.freeze({
    id:       'dashboard',
    name:     'Dashboard',
    nameHe:   'דאשבורד',
    sections: Object.freeze(['header', 'kpi_cards', 'chart_grid', 'recent_activity']),
    description: 'Executive dashboard with KPI summary cards, chart visualizations, and recent activity stream.',
  }),
});

/* ═══════════════════════════════════════════════════════════════
 *  SECTION DEFINITIONS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Detailed section contracts that describe what each section contains.
 * @readonly
 * @type {Readonly<Object>}
 */
const SECTION_DEFS = Object.freeze({

  header: Object.freeze({
    id: 'header',
    name: 'Page Header',
    nameHe: 'כותרת דף',
    contains: Object.freeze(['breadcrumb', 'entity_icon', 'entity_name', 'entity_id', 'status_badge', 'owner_avatar']),
  }),

  action_bar: Object.freeze({
    id: 'action_bar',
    name: 'Action Bar',
    nameHe: 'סרגל פעולות',
    contains: Object.freeze(['primary_action_button', 'secondary_actions_dropdown', 'state_transition_buttons', 'export_button']),
  }),

  summary_band: Object.freeze({
    id: 'summary_band',
    name: 'Summary Band',
    nameHe: 'רצועת סיכום',
    contains: Object.freeze(['kpi_card_1', 'kpi_card_2', 'kpi_card_3', 'kpi_card_4', 'kpi_card_5']),
    description: 'Row of 3-5 summary KPI cards at the top of a 360 page.',
  }),

  main_tabs: Object.freeze({
    id: 'main_tabs',
    name: 'Main Tabs',
    nameHe: 'טאבים ראשיים',
    contains: Object.freeze(['tab_content_area']),
    description: 'Tabbed content area -- tabs defined per entity in PAGE_TABS.',
  }),

  side_panel: Object.freeze({
    id: 'side_panel',
    name: 'Side Panel',
    nameHe: 'פאנל צד',
    contains: Object.freeze(['next_best_action', 'quick_links', 'related_entities', 'recent_documents']),
  }),

  bottom_feed: Object.freeze({
    id: 'bottom_feed',
    name: 'Bottom Feed',
    nameHe: 'פיד תחתון',
    contains: Object.freeze(['audit_log', 'comments', 'state_history']),
  }),

  kpi_strip: Object.freeze({
    id: 'kpi_strip',
    name: 'KPI Strip',
    nameHe: 'רצועת KPI',
    contains: Object.freeze(['kpi_tiles']),
  }),

  widget_grid: Object.freeze({
    id: 'widget_grid',
    name: 'Widget Grid',
    nameHe: 'רשת ווידג\'טים',
    contains: Object.freeze(['configurable_widgets']),
  }),

  action_shortcuts: Object.freeze({
    id: 'action_shortcuts',
    name: 'Action Shortcuts',
    nameHe: 'קיצורי פעולות',
    contains: Object.freeze(['quick_action_buttons']),
  }),

  filters: Object.freeze({
    id: 'filters',
    name: 'Filters',
    nameHe: 'סינונים',
    contains: Object.freeze(['search_box', 'status_filter', 'date_range', 'owner_filter', 'custom_filters']),
  }),

  table: Object.freeze({
    id: 'table',
    name: 'Data Table',
    nameHe: 'טבלת נתונים',
    contains: Object.freeze(['sortable_columns', 'row_actions', 'bulk_actions', 'inline_status_badge']),
  }),

  pagination: Object.freeze({
    id: 'pagination',
    name: 'Pagination',
    nameHe: 'עימוד',
    contains: Object.freeze(['page_controls', 'page_size_selector', 'total_count']),
  }),

  kpi_cards: Object.freeze({
    id: 'kpi_cards',
    name: 'KPI Cards',
    nameHe: 'כרטיסי KPI',
    contains: Object.freeze(['metric_cards_with_trends']),
  }),

  chart_grid: Object.freeze({
    id: 'chart_grid',
    name: 'Chart Grid',
    nameHe: 'רשת גרפים',
    contains: Object.freeze(['configurable_charts']),
  }),

  recent_activity: Object.freeze({
    id: 'recent_activity',
    name: 'Recent Activity',
    nameHe: 'פעילות אחרונה',
    contains: Object.freeze(['activity_stream', 'timeline']),
  }),
});

/* ═══════════════════════════════════════════════════════════════
 *  PAGE TABS — 9 MASTER 360 PAGES
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Helper to create a frozen tab definition.
 * @param {string} id
 * @param {string} label    - English label.
 * @param {string} labelHe  - Hebrew label.
 * @param {string} icon
 * @param {string[]} content - Content sections within the tab.
 * @returns {Readonly<Object>}
 */
function _tab(id, label, labelHe, icon, content) {
  return Object.freeze({ id: id, label: label, labelHe: labelHe, icon: icon, content: Object.freeze(content) });
}

/**
 * Tab definitions for each of the 9 Master 360 Pages.
 * @readonly
 * @type {Readonly<Object>}
 */
const PAGE_TABS = Object.freeze({

  /* ── Customer360 ─────────────────────────────────────────── */
  Customer360: Object.freeze([
    _tab('overview',      'Overview',      'סקירה',         '📊', ['summary_kpis', 'revenue_chart', 'open_balance', 'credit_limit']),
    _tab('quotes',        'Quotes',        'הצעות מחיר',    '📋', ['quotes_table', 'quote_stats']),
    _tab('projects',      'Projects',      'פרויקטים',      '📁', ['projects_table', 'project_timeline']),
    _tab('invoices',      'Invoices',      'חשבוניות',      '💰', ['invoices_table', 'payment_history', 'aging_chart']),
    _tab('payments',      'Payments',      'תשלומים',       '💳', ['payments_table', 'cashflow_chart']),
    _tab('contracts',     'Contracts',     'חוזים',         '📄', ['contracts_table', 'contract_timeline']),
    _tab('communications','Communications','תקשורת',        '💬', ['emails', 'messages', 'calls', 'notes']),
    _tab('documents',     'Documents',     'מסמכים',        '📎', ['documents_table', 'upload_area']),
    _tab('audit',         'Audit Log',     'יומן ביקורת',   '📜', ['audit_log_feed', 'state_history']),
  ]),

  /* ── Supplier360 ─────────────────────────────────────────── */
  Supplier360: Object.freeze([
    _tab('overview',     'Overview',     'סקירה',          '📊', ['summary_kpis', 'spend_chart', 'performance_score', 'delivery_metrics']),
    _tab('rfqs',         'RFQs',         'בקשות הצעה',     '📨', ['rfqs_table', 'rfq_response_rate']),
    _tab('pos',          'Purchase Orders','הזמנות רכש',   '🛒', ['pos_table', 'delivery_tracking']),
    _tab('invoices',     'Invoices',     'חשבוניות',       '💰', ['invoices_table', 'payment_schedule']),
    _tab('contracts',    'Contracts',    'חוזים',          '📄', ['contracts_table']),
    _tab('returns',      'Returns',      'החזרות',         '↩️', ['returns_table', 'warranty_claims']),
    _tab('performance',  'Performance',  'ביצועים',        '📈', ['score_breakdown', 'delivery_on_time', 'quality_metrics', 'price_competitiveness']),
    _tab('documents',    'Documents',    'מסמכים',         '📎', ['documents_table', 'certificates', 'upload_area']),
    _tab('audit',        'Audit Log',    'יומן ביקורת',    '📜', ['audit_log_feed', 'state_history']),
  ]),

  /* ── Quote360 ────────────────────────────────────────────── */
  Quote360: Object.freeze([
    _tab('overview',   'Overview',    'סקירה',          '📊', ['quote_summary', 'customer_info', 'validity_period', 'margin_analysis']),
    _tab('lines',      'Line Items',  'שורות פריטים',   '📝', ['line_items_table', 'totals_breakdown', 'discount_applied']),
    _tab('pricing',    'Pricing',     'תמחור',          '💲', ['pricing_breakdown', 'margin_calculator', 'competitor_comparison']),
    _tab('approvals',  'Approvals',   'אישורים',        '✅', ['approval_chain', 'approval_history']),
    _tab('related',    'Related',     'קשורים',         '🔗', ['lead_link', 'customer_link', 'project_link', 'contract_link']),
    _tab('documents',  'Documents',   'מסמכים',         '📎', ['documents_table', 'pdf_preview', 'upload_area']),
    _tab('audit',      'Audit Log',   'יומן ביקורת',    '📜', ['audit_log_feed', 'state_history']),
  ]),

  /* ── RFQ360 ──────────────────────────────────────────────── */
  RFQ360: Object.freeze([
    _tab('overview',     'Overview',        'סקירה',          '📊', ['rfq_summary', 'deadline_countdown', 'response_progress']),
    _tab('items',        'Items',           'פריטים',         '📝', ['rfq_items_table', 'specifications']),
    _tab('suppliers',    'Suppliers',       'ספקים',          '🏭', ['invited_suppliers', 'response_status']),
    _tab('comparison',   'Quote Comparison','השוואת הצעות',    '⚖️', ['comparison_matrix', 'price_analysis', 'delivery_analysis', 'recommendation']),
    _tab('approvals',    'Approvals',       'אישורים',        '✅', ['approval_chain', 'approval_history']),
    _tab('documents',    'Documents',       'מסמכים',         '📎', ['documents_table', 'upload_area']),
    _tab('audit',        'Audit Log',       'יומן ביקורת',    '📜', ['audit_log_feed', 'state_history']),
  ]),

  /* ── Project360 ──────────────────────────────────────────── */
  Project360: Object.freeze([
    _tab('overview',    'Overview',       'סקירה',           '📊', ['project_summary', 'progress_chart', 'budget_vs_actual', 'timeline_gantt']),
    _tab('work_orders', 'Work Orders',    'הזמנות עבודה',    '🔧', ['work_orders_table', 'wo_progress_chart']),
    _tab('procurement', 'Procurement',    'רכש',             '🛒', ['pos_table', 'materials_status', 'delivery_tracking']),
    _tab('team',        'Team',           'צוות',            '👷', ['assigned_employees', 'role_allocation', 'workload_chart']),
    _tab('tasks',       'Tasks',          'משימות',          '📌', ['tasks_kanban', 'tasks_table']),
    _tab('financials',  'Financials',     'כספים',           '💰', ['budget_breakdown', 'invoices_table', 'payments_table', 'expense_table', 'profitability']),
    _tab('logistics',   'Logistics',      'לוגיסטיקה',      '🚚', ['delivery_schedule', 'shipments_table']),
    _tab('documents',   'Documents',      'מסמכים',          '📎', ['documents_table', 'upload_area']),
    _tab('alerts',      'Alerts',         'התראות',          '🚨', ['active_alerts', 'alert_history']),
    _tab('audit',       'Audit Log',      'יומן ביקורת',     '📜', ['audit_log_feed', 'state_history']),
  ]),

  /* ── WorkOrder360 ────────────────────────────────────────── */
  WorkOrder360: Object.freeze([
    _tab('overview',    'Overview',    'סקירה',          '📊', ['wo_summary', 'progress_bar', 'assigned_workers', 'due_date_countdown']),
    _tab('materials',   'Materials',   'חומרים',         '📦', ['material_reservations', 'consumption_log', 'shortage_alerts']),
    _tab('team',        'Team',        'צוות',           '👷', ['assigned_workers_table', 'attendance_log', 'hours_summary']),
    _tab('tasks',       'Tasks',       'משימות',         '📌', ['subtasks_table', 'checklist']),
    _tab('quality',     'Quality',     'איכות',          '🔍', ['quality_checks_table', 'defect_log', 'photos']),
    _tab('expenses',    'Expenses',    'הוצאות',         '🧾', ['expenses_table', 'cost_summary']),
    _tab('signatures',  'Signatures',  'חתימות',         '✍️', ['signature_log', 'digital_signatures']),
    _tab('documents',   'Documents',   'מסמכים',         '📎', ['documents_table', 'upload_area']),
    _tab('audit',       'Audit Log',   'יומן ביקורת',    '📜', ['audit_log_feed', 'state_history']),
  ]),

  /* ── PO360 ───────────────────────────────────────────────── */
  PO360: Object.freeze([
    _tab('overview',   'Overview',     'סקירה',          '📊', ['po_summary', 'supplier_info', 'delivery_status', 'amount_breakdown']),
    _tab('lines',      'Line Items',   'שורות פריטים',   '📝', ['line_items_table', 'totals']),
    _tab('receiving',  'Receiving',    'קבלת סחורה',     '📦', ['receipts_table', 'receiving_progress', 'discrepancy_log']),
    _tab('invoices',   'Invoices',     'חשבוניות',       '💰', ['matched_invoices', 'three_way_match']),
    _tab('approvals',  'Approvals',    'אישורים',        '✅', ['approval_chain', 'approval_history']),
    _tab('returns',    'Returns',      'החזרות',         '↩️', ['returns_table', 'warranty_claims']),
    _tab('costing',    'Costing',      'עלויות',         '💲', ['cost_allocation', 'project_link', 'budget_impact']),
    _tab('documents',  'Documents',    'מסמכים',         '📎', ['documents_table', 'upload_area']),
    _tab('audit',      'Audit Log',    'יומן ביקורת',    '📜', ['audit_log_feed', 'state_history']),
  ]),

  /* ── Finance360 ──────────────────────────────────────────── */
  Finance360: Object.freeze([
    _tab('overview',    'Overview',      'סקירה',          '📊', ['cash_position', 'revenue_chart', 'expense_chart', 'profit_loss']),
    _tab('receivables', 'Receivables',   'חייבים',         '💰', ['ar_aging', 'open_invoices', 'collection_queue']),
    _tab('payables',    'Payables',      'זכאים',          '🧾', ['ap_aging', 'pending_payments', 'payment_schedule']),
    _tab('bank',        'Bank',          'בנק',            '🏦', ['bank_balances', 'reconciliation_status', 'recent_transactions']),
    _tab('tax',         'Tax & VAT',     'מס ומע"מ',       '📊', ['vat_summary', 'tax_calendar', 'filing_status']),
    _tab('cashflow',    'Cash Flow',     'תזרים',          '💹', ['cashflow_forecast', 'cashflow_chart', 'scenarios']),
    _tab('budgets',     'Budgets',       'תקציבים',        '📋', ['budget_vs_actual', 'department_breakdown']),
    _tab('reports',     'Reports',       'דוחות',          '📈', ['pl_statement', 'balance_sheet', 'trial_balance']),
    _tab('audit',       'Audit Log',     'יומן ביקורת',    '📜', ['audit_log_feed', 'journal_entries']),
  ]),

  /* ── Employee360 ─────────────────────────────────────────── */
  Employee360: Object.freeze([
    _tab('overview',    'Overview',      'סקירה',          '📊', ['employee_summary', 'current_assignment', 'contract_info']),
    _tab('attendance',  'Attendance',    'נוכחות',         '⏰', ['monthly_attendance', 'daily_log', 'overtime_summary', 'leave_balance']),
    _tab('payroll',     'Payroll',       'שכר',            '💰', ['salary_history', 'current_payslip', 'tax_deductions', 'benefits']),
    _tab('assignments', 'Assignments',   'שיבוצים',        '🔧', ['work_orders_table', 'projects_table', 'tasks_table']),
    _tab('expenses',    'Expenses',      'הוצאות',         '🧾', ['expense_claims', 'reimbursements']),
    _tab('hr',          'HR Profile',    'פרופיל HR',      '👤', ['personal_info', 'emergency_contacts', 'certifications', 'training']),
    _tab('pension',     'Pension',       'פנסיה',          '🏦', ['pension_fund', 'employer_contributions', 'employee_contributions']),
    _tab('documents',   'Documents',     'מסמכים',         '📎', ['contracts', 'id_documents', 'certificates', 'upload_area']),
    _tab('audit',       'Audit Log',     'יומן ביקורת',    '📜', ['audit_log_feed', 'state_history']),
  ]),
});

/* ═══════════════════════════════════════════════════════════════
 *  HELPER: RESOLVE PAGE CONFIG
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Map from 360 page name to its entity type for cross-referencing.
 * @readonly
 * @type {Readonly<Object>}
 */
const PAGE_ENTITY_MAP = Object.freeze({
  Customer360:  'Customer',
  Supplier360:  'Supplier',
  Quote360:     'Quote',
  RFQ360:       'RFQ',
  Project360:   'Project',
  WorkOrder360: 'WorkOrder',
  PO360:        'PurchaseOrder',
  Finance360:   null, // Finance360 is cross-entity
  Employee360:  'Employee',
});

/**
 * Get the full page configuration for a given 360 page.
 *
 * @param {string} pageName - One of: Customer360, Supplier360, Quote360, etc.
 * @returns {Object|null} `{ layout, tabs, entityType }` or null if not found.
 *
 * @example
 *   const config = getPageConfig('Project360');
 *   // => { layout: PAGE_LAYOUT.DETAIL_360, tabs: [...], entityType: 'Project' }
 */
function getPageConfig(pageName) {
  var tabs = PAGE_TABS[pageName];
  if (!tabs) { return null; }
  return {
    layout:     PAGE_LAYOUT.DETAIL_360,
    tabs:       tabs,
    entityType: PAGE_ENTITY_MAP[pageName] || null,
    pageName:   pageName,
  };
}

/**
 * List all available 360 page names.
 * @returns {string[]}
 */
function getAllPageNames() {
  return Object.keys(PAGE_TABS);
}

/* ═══════════════════════════════════════════════════════════════
 *  EXPORTS
 * ═══════════════════════════════════════════════════════════════ */

module.exports = {
  PAGE_LAYOUT:     PAGE_LAYOUT,
  SECTION_DEFS:    SECTION_DEFS,
  PAGE_TABS:       PAGE_TABS,
  PAGE_ENTITY_MAP: PAGE_ENTITY_MAP,
  getPageConfig:   getPageConfig,
  getAllPageNames:  getAllPageNames,
};
