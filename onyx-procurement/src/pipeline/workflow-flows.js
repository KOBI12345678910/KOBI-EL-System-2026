/**
 * Workflow Flows — Complete Business Process Definitions
 *
 * 5 core flows that drive the entire ERP:
 * 1. Sales → Project (Lead to Project creation)
 * 2. Project → Procurement (Materials, RFQ, PO)
 * 3. Procurement → Execution (Inventory, WorkOrders, Manufacturing)
 * 4. Execution → Cash (Invoice, Payment, Bank)
 * 5. Employee → Payroll (Attendance, Calculation, Export)
 */

'use strict';

const WORKFLOW_FLOWS = {

  // ═══════════════════════════════════════════════════════════
  // FLOW 1: Sales → Project
  // ═══════════════════════════════════════════════════════════
  sales_to_project: {
    label: 'מכירה → פרויקט', labelEn: 'Sales to Project',
    icon: '🤝', color: '#8b5cf6',
    steps: [
      { step: 1, entity: 'lead', action: 'qualify', label: 'סווג ליד',
        results: ['update_stage_to_qualified', 'optionally_create_customer'] },
      { step: 2, entity: 'lead', action: 'create_quote', label: 'צור הצעת מחיר',
        results: ['create_quote_record', 'link_to_customer', 'link_to_lead'] },
      { step: 3, entity: 'quote', action: 'approve', label: 'אשר הצעה',
        results: ['approval_record_created', 'quote_status_approved'] },
      { step: 4, entity: 'quote', action: 'convert_to_project', label: 'המר לפרויקט',
        results: ['create_project', 'copy_customer_data', 'copy_quote_items', 'attach_contract', 'create_initial_tasks', 'notify_ops_team', 'log_audit_event'] },
      { step: 5, entity: 'project', action: 'start_planning', label: 'התחל תכנון',
        results: ['create_work_breakdown', 'define_material_requirements', 'assign_owner'] },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // FLOW 2: Project → Procurement
  // ═══════════════════════════════════════════════════════════
  project_to_procurement: {
    label: 'פרויקט → רכש', labelEn: 'Project to Procurement',
    icon: '🛒', color: '#f59e0b',
    steps: [
      { step: 1, entity: 'project', action: 'request_materials', label: 'בקש חומרים',
        results: ['create_material_requests', 'estimate_costing_gap'] },
      { step: 2, entity: 'material_request', action: 'create_rfq', label: 'צור RFQ',
        results: ['create_rfq_records', 'attach_requested_items', 'select_suppliers'] },
      { step: 3, entity: 'rfq', action: 'compare_and_approve', label: 'השווה ואשר',
        results: ['supplier_comparison_table', 'approval_created', 'winning_supplier_selected'] },
      { step: 4, entity: 'rfq', action: 'convert_to_po', label: 'צור הזמנת רכש',
        results: ['create_purchase_order', 'link_to_project', 'link_to_supplier'] },
      { step: 5, entity: 'po', action: 'send_and_receive', label: 'שלח וקבל',
        results: ['po_sent', 'inventory_receipt_on_delivery', 'update_project_costing'] },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // FLOW 3: Procurement → Execution
  // ═══════════════════════════════════════════════════════════
  procurement_to_execution: {
    label: 'רכש → ביצוע', labelEn: 'Procurement to Execution',
    icon: '🏗️', color: '#10b981',
    steps: [
      { step: 1, entity: 'po', action: 'receive_items', label: 'קבלת סחורה',
        results: ['inventory_updated', 'warehouse_receipt_created', 'costing_updated'] },
      { step: 2, entity: 'inventory', action: 'reserve_for_project', label: 'הקצה לפרויקט',
        results: ['stock_reserved', 'linked_to_workorder'] },
      { step: 3, entity: 'work_order', action: 'start_execution', label: 'התחל ביצוע',
        results: ['team_assigned', 'material_consumption_started', 'attendance_tracking_started'] },
      { step: 4, entity: 'work_order', action: 'complete', label: 'סיים',
        results: ['quality_check_required', 'signoff_required', 'update_project_progress'] },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // FLOW 4: Execution → Cash
  // ═══════════════════════════════════════════════════════════
  execution_to_cash: {
    label: 'ביצוע → כסף', labelEn: 'Execution to Cash',
    icon: '💰', color: '#ef4444',
    steps: [
      { step: 1, entity: 'project', action: 'mark_billable', label: 'סמן לחיוב',
        results: ['create_invoice_draft'] },
      { step: 2, entity: 'invoice', action: 'issue', label: 'הנפק חשבונית',
        results: ['post_to_gl', 'post_to_vat', 'attach_to_customer', 'start_collection_tracking'] },
      { step: 3, entity: 'payment', action: 'register', label: 'רשום תשלום',
        results: ['match_to_invoice', 'update_invoice_status', 'update_cashflow', 'create_bank_match_record'] },
      { step: 4, entity: 'bank_match', action: 'reconcile', label: 'התאם בנק',
        results: ['bank_status_reconciled', 'finance_dashboard_updated'] },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // FLOW 5: Employee → Payroll
  // ═══════════════════════════════════════════════════════════
  employee_to_payroll: {
    label: 'עובד → שכר', labelEn: 'Employee to Payroll',
    icon: '👷', color: '#ec4899',
    steps: [
      { step: 1, entity: 'employee', action: 'attend_work', label: 'רשום נוכחות',
        results: ['attendance_record_created', 'link_to_workorder', 'link_to_project'] },
      { step: 2, entity: 'attendance', action: 'approve', label: 'אשר שעות',
        results: ['locked_for_payroll', 'available_for_costing'] },
      { step: 3, entity: 'payroll', action: 'calculate', label: 'חשב שכר',
        results: ['wage_slip_created', 'pension_calculated', 'expense_allocations_created'] },
      { step: 4, entity: 'payroll', action: 'approve_and_export', label: 'אשר וייצא',
        results: ['bank_file_created', 'payroll_status_approved', 'cost_posted_to_finance'] },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════
// REGISTER WORKFLOW ROUTES
// ═══════════════════════════════════════════════════════════════

function registerWorkflowRoutes(app) {
  app.get('/api/workflows', (_req, res) => {
    res.json({ flows: WORKFLOW_FLOWS });
  });

  app.get('/api/workflows/:id', (req, res) => {
    const flow = WORKFLOW_FLOWS[req.params.id];
    if (!flow) return res.status(404).json({ error: `Unknown flow: ${req.params.id}` });
    res.json({ flow });
  });

  console.log('   ✓ Workflow flows registered (' + Object.keys(WORKFLOW_FLOWS).length + ' flows)');
}

module.exports = { WORKFLOW_FLOWS, registerWorkflowRoutes };
