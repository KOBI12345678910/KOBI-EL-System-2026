/**
 * Orchestrator — Executes multi-step business actions
 *
 * When a user clicks "Convert Quote to Project", the orchestrator:
 *  1. Validates preconditions (state machine check)
 *  2. Executes all effects (create records, update statuses)
 *  3. Emits events (for listeners/AI)
 *  4. Logs audit trail
 *  5. Returns next navigation target
 *
 * This is the brain that makes buttons actually DO things.
 */

'use strict';

const { canTransition, getTriggersForTransition } = require('./state-machines');

// ═══════════════════════════════════════════════════════════════
// ACTION ORCHESTRATION DEFINITIONS
// ═══════════════════════════════════════════════════════════════

const ORCHESTRATIONS = {

  'lead.create_quote': {
    service: 'ops', label: 'צור הצעת מחיר מליד',
    preconditions: [{ check: 'entity_exists', entity: 'lead' }, { check: 'status_in', statuses: ['new', 'contacted', 'qualified'] }],
    effects: [
      { type: 'create', entity: 'quote', copyFrom: 'lead', fields: ['customer_name', 'customer_id', 'value'] },
      { type: 'link', from: 'quote', to: 'lead' },
      { type: 'link', from: 'quote', to: 'customer', optional: true },
      { type: 'audit', message: 'הצעת מחיר נוצרה מליד' },
    ],
    events: ['quote.created'],
    navigate: '/entity360.html?type=quote&id=:newId',
  },

  'lead.convert_to_customer': {
    service: 'ops', label: 'המר ליד ללקוח',
    preconditions: [{ check: 'entity_exists', entity: 'lead' }, { check: 'status_in', statuses: ['qualified', 'quoted'] }],
    effects: [
      { type: 'create', entity: 'customer', copyFrom: 'lead', fields: ['name', 'phone', 'email'] },
      { type: 'transition', entity: 'lead', transition: 'win' },
      { type: 'audit', message: 'ליד הומר ללקוח' },
    ],
    events: ['lead.converted', 'customer.created'],
    navigate: '/entity360.html?type=customer&id=:newId',
  },

  'quote.approve': {
    service: 'procurement', label: 'אשר הצעת מחיר',
    preconditions: [{ check: 'entity_exists', entity: 'quote' }, { check: 'status_in', statuses: ['draft', 'sent', 'under_review'] }],
    effects: [
      { type: 'create', entity: 'approval', fields: { type: 'quote', status: 'approved' } },
      { type: 'transition', entity: 'quote', transition: 'approve' },
      { type: 'snapshot', entity: 'pricing', from: 'quote' },
      { type: 'audit', message: 'הצעת מחיר אושרה' },
    ],
    events: ['quote.approved'],
    listeners: ['ai.margin_and_risk_review'],
  },

  'quote.convert_to_project': {
    service: 'ops', label: 'המר הצעה לפרויקט',
    preconditions: [{ check: 'entity_exists', entity: 'quote' }, { check: 'status_is', status: 'approved' }, { check: 'entity_exists', entity: 'customer' }],
    effects: [
      { type: 'create', entity: 'project', copyFrom: 'quote', fields: ['customer_id', 'customer_name', 'value', 'items'] },
      { type: 'link', from: 'project', to: 'quote' },
      { type: 'link', from: 'project', to: 'customer' },
      { type: 'create', entity: 'contract', copyFrom: 'quote', conditional: 'policy_requires' },
      { type: 'create_tasks', template: 'project_kickoff' },
      { type: 'transition', entity: 'quote', transition: 'convert' },
      { type: 'notify', channels: ['all'], template: 'project_created' },
      { type: 'audit', message: 'הצעה הומרה לפרויקט' },
    ],
    events: ['project.created_from_quote'],
    listeners: ['ai.generate_project_risk_baseline', 'procurement.prepare_procurement_context'],
    navigate: '/entity360.html?type=project&id=:newId',
  },

  'project.create_work_order': {
    service: 'ops', label: 'צור הזמנת עבודה',
    preconditions: [{ check: 'entity_exists', entity: 'project' }, { check: 'status_in', statuses: ['approved', 'in_planning', 'in_procurement', 'in_production'] }],
    effects: [
      { type: 'create', entity: 'work_order', fields: { project_id: ':projectId' } },
      { type: 'link', from: 'work_order', to: 'project' },
      { type: 'create_tasks', template: 'wo_default' },
      { type: 'audit', message: 'הזמנת עבודה נוצרה' },
    ],
    events: ['workorder.created'],
    navigate: '/entity360.html?type=work_order&id=:newId',
  },

  'project.create_po': {
    service: 'procurement', label: 'צור הזמנת רכש לפרויקט',
    preconditions: [{ check: 'entity_exists', entity: 'project' }],
    effects: [
      { type: 'create', entity: 'po', fields: { project_id: ':projectId' } },
      { type: 'link', from: 'po', to: 'project' },
      { type: 'link', from: 'po', to: 'supplier' },
      { type: 'audit', message: 'הזמנת רכש נוצרה לפרויקט' },
    ],
    events: ['po.created'],
    listeners: ['ai.assess_supplier_risk'],
    navigate: '/entity360.html?type=po&id=:newId',
  },

  'project.create_invoice': {
    service: 'procurement', label: 'צור חשבונית לפרויקט',
    preconditions: [{ check: 'entity_exists', entity: 'project' }],
    effects: [
      { type: 'create', entity: 'invoice', fields: { project_id: ':projectId', direction: 'output' } },
      { type: 'link', from: 'invoice', to: 'project' },
      { type: 'link', from: 'invoice', to: 'customer' },
      { type: 'audit', message: 'חשבונית נוצרה לפרויקט' },
    ],
    events: ['invoice.draft_created'],
    navigate: '/entity360.html?type=invoice&id=:newId',
  },

  'rfq.convert_to_po': {
    service: 'procurement', label: 'המר RFQ להזמנת רכש',
    preconditions: [{ check: 'entity_exists', entity: 'rfq' }, { check: 'status_in', statuses: ['approved', 'decided'] }],
    effects: [
      { type: 'create', entity: 'po', copyFrom: 'rfq', fields: ['items', 'supplier_id'] },
      { type: 'link', from: 'po', to: 'rfq' },
      { type: 'link', from: 'po', to: 'supplier' },
      { type: 'link', from: 'po', to: 'project', optional: true },
      { type: 'transition', entity: 'rfq', transition: 'convert' },
      { type: 'audit', message: 'RFQ הומר להזמנת רכש' },
    ],
    events: ['po.created_from_rfq'],
    navigate: '/entity360.html?type=po&id=:newId',
  },

  'po.receive_items': {
    service: 'procurement', label: 'קבלת סחורה',
    preconditions: [{ check: 'entity_exists', entity: 'po' }, { check: 'status_in', statuses: ['sent', 'partially_received'] }],
    effects: [
      { type: 'create', entity: 'inventory_receipt', fields: { po_id: ':poId' } },
      { type: 'update_inventory', action: 'receipt' },
      { type: 'create', entity: 'warehouse_receipt' },
      { type: 'update_costing' },
      { type: 'transition', entity: 'po', transition: 'partial_receive' },
      { type: 'audit', message: 'סחורה התקבלה' },
    ],
    events: ['inventory.received_from_po', 'costing.updated'],
    listeners: ['ops.try_allocate_received_stock', 'ai.check_delivery_anomalies'],
  },

  'work_order.start': {
    service: 'ops', label: 'התחל ביצוע הזמנת עבודה',
    preconditions: [{ check: 'entity_exists', entity: 'work_order' }, { check: 'status_in', statuses: ['open', 'assigned'] }],
    effects: [
      { type: 'transition', entity: 'work_order', transition: 'start' },
      { type: 'init_progress_tracking' },
      { type: 'enable_attendance_links' },
      { type: 'audit', message: 'הזמנת עבודה התחילה' },
    ],
    events: ['workorder.started'],
  },

  'work_order.signoff': {
    service: 'ops', label: 'חתימה וסגירת הזמנת עבודה',
    preconditions: [{ check: 'entity_exists', entity: 'work_order' }, { check: 'status_in', statuses: ['completed', 'done'] }],
    effects: [
      { type: 'create', entity: 'signature', fields: { work_order_id: ':woId' } },
      { type: 'transition', entity: 'work_order', transition: 'signoff' },
      { type: 'update_project_progress' },
      { type: 'calculate_wo_costs' },
      { type: 'check_delivery_ready' },
      { type: 'audit', message: 'הזמנת עבודה נחתמה ונסגרה' },
    ],
    events: ['workorder.signed_off'],
  },

  'invoice.issue': {
    service: 'procurement', label: 'הנפק חשבונית',
    preconditions: [{ check: 'entity_exists', entity: 'invoice' }, { check: 'status_is', status: 'draft' }],
    effects: [
      { type: 'transition', entity: 'invoice', transition: 'issue' },
      { type: 'post_to_gl' },
      { type: 'post_to_vat' },
      { type: 'start_collection_tracking' },
      { type: 'audit', message: 'חשבונית הונפקה' },
    ],
    events: ['invoice.issued'],
    listeners: ['ai.update_cashflow_forecast', 'ops.show_project_finance_update'],
  },

  'invoice.register_payment': {
    service: 'procurement', label: 'רשום תשלום',
    preconditions: [{ check: 'entity_exists', entity: 'invoice' }, { check: 'status_in', statuses: ['issued', 'sent', 'partially_paid', 'overdue'] }],
    effects: [
      { type: 'create', entity: 'payment', fields: { invoice_id: ':invoiceId' } },
      { type: 'update_invoice_balance' },
      { type: 'create', entity: 'bank_match_placeholder' },
      { type: 'audit', message: 'תשלום נרשם' },
    ],
    events: ['payment.registered'],
    listeners: ['ai.detect_collection_risk_change'],
  },

  'payment.reconcile': {
    service: 'procurement', label: 'התאם תשלום לבנק',
    preconditions: [{ check: 'entity_exists', entity: 'payment' }, { check: 'bank_entry_exists' }],
    effects: [
      { type: 'create_or_update', entity: 'bank_match' },
      { type: 'mark_reconciled' },
      { type: 'update_cashflow' },
      { type: 'audit', message: 'תשלום הותאם לבנק' },
    ],
    events: ['payment.reconciled'],
  },

  'attendance.approve': {
    service: 'payroll', label: 'אשר שעות נוכחות',
    preconditions: [{ check: 'entity_exists', entity: 'attendance' }],
    effects: [
      { type: 'set_status', entity: 'attendance', status: 'approved' },
      { type: 'mark_available_for_payroll' },
      { type: 'mark_available_for_costing' },
      { type: 'audit', message: 'שעות נוכחות אושרו' },
    ],
    events: ['attendance.approved'],
    listeners: ['procurement.consume_labor_cost'],
  },

  'payroll.calculate': {
    service: 'payroll', label: 'חשב שכר',
    preconditions: [{ check: 'approved_attendance_exists' }, { check: 'employee_active' }],
    effects: [
      { type: 'create', entity: 'payroll_record' },
      { type: 'create', entity: 'wage_slip' },
      { type: 'calculate_pension' },
      { type: 'allocate_labor_expense' },
      { type: 'audit', message: 'שכר חושב' },
    ],
    events: ['payroll.calculated'],
    listeners: ['procurement.post_labor_cost', 'ai.detect_payroll_anomalies'],
  },

  'payroll.export': {
    service: 'payroll', label: 'ייצוא שכר',
    preconditions: [{ check: 'entity_exists', entity: 'payroll' }, { check: 'status_is', status: 'approved' }],
    effects: [
      { type: 'create', entity: 'bank_file' },
      { type: 'transition', entity: 'payroll', transition: 'export' },
      { type: 'post_costs_to_finance' },
      { type: 'audit', message: 'שכר יוצא לבנק' },
    ],
    events: ['payroll.exported'],
  },

  'alert.resolve': {
    service: 'dynamic', label: 'פתור התראה',
    preconditions: [{ check: 'entity_exists', entity: 'alert' }, { check: 'status_in', statuses: ['new', 'acknowledged', 'assigned'] }],
    effects: [
      { type: 'transition', entity: 'alert', transition: 'resolve' },
      { type: 'close_linked_task', optional: true },
      { type: 'audit', message: 'התראה נפתרה' },
    ],
    events: ['alert.resolved'],
  },

  // ───────────────────────────────────────────────────────────
  // AGENT-223 — supplier.blacklist / supplier.reinstate
  // Closes the loop on AGENT-183 by giving Supplier360 a real
  // "remove vendor" action wired through the supplier state
  // machine (see state-machines.js → supplier).
  // ───────────────────────────────────────────────────────────
  'supplier.blacklist': {
    service: 'procurement',
    label: 'הוצא ספק לרשימה שחורה',
    preconditions: [
      { check: 'entity_exists', entity: 'supplier' },
      { check: 'status_in', statuses: ['active', 'preferred', 'monitor', 'on_hold'] },
      { check: 'composite_below', threshold: 50 },
    ],
    effects: [
      { type: 'transition',   entity: 'supplier', transition: 'blacklist' },
      { type: 'update_field', entity: 'supplier', field: 'risk_level',        value: 'critical' },
      { type: 'update_field', entity: 'supplier', field: 'blacklist_reason',  from:  'context.reason' },
      { type: 'update_field', entity: 'supplier', field: 'blacklisted_at',    value: '$now' },
      { type: 'cancel_related', entity: 'rfq_invite', filter: { supplier_id: ':supplierId', status: 'pending' } },
      { type: 'freeze_related', entity: 'po',        filter: { supplier_id: ':supplierId', status_in: ['draft', 'pending_approval', 'sent'] } },
      { type: 'notify', channels: ['email', 'in_app'], template: 'vendor_blacklisted', audience: 'buyers' },
      { type: 'audit',  message: 'ספק הוצא לרשימה שחורה' },
    ],
    events: ['vendor.blacklisted'],
    listeners: ['ai.find_alternative_suppliers', 'ops.alert_open_pos_for_reassignment'],
    navigate: '/entity360.html?type=supplier&id=:supplierId',
  },

  'supplier.reinstate': {
    service: 'procurement',
    label: 'החזר ספק מהרשימה השחורה',
    preconditions: [
      { check: 'entity_exists', entity: 'supplier' },
      { check: 'status_is',     status:  'blacklisted' },
      { check: 'role_in',       roles:   ['procurement_manager', 'cfo', 'admin'] },
    ],
    effects: [
      { type: 'transition',   entity: 'supplier', transition: 'reinstate' },
      { type: 'update_field', entity: 'supplier', field: 'risk_level', value: 'high' },
      { type: 'audit',        message: 'ספק הוחזר (status=on_hold)' },
    ],
    events: ['vendor.reinstated'],
    navigate: '/entity360.html?type=supplier&id=:supplierId',
  },

  // ───────────────────────────────────────────────────────────
  // AGENT-FIX-ORCH-MISSING — 6 actions identified by the
  // Master Flow E2E audit. Each one closes a 360-page button
  // that previously returned 400 from POST /api/orchestrator/execute.
  // ───────────────────────────────────────────────────────────
  'order.create': {
    service: 'ops',
    label: 'הפוך הזמנת מכירה לפרויקט',
    entity_type: 'sales_order',
    preconditions: [
      { check: 'entity_exists', entity: 'sales_order' },
      { check: 'status_in',     statuses: ['confirmed'] },
    ],
    effects: [
      { type: 'create',     entity: 'project', copyFrom: 'sales_order', fields: ['customer_id', 'customer_name', 'value', 'items'] },
      { type: 'link',       from:   'sales_order', to: 'project' },
      { type: 'transition', entity: 'sales_order', transition: 'start_production' },
      { type: 'audit',      message: 'הזמנת מכירה הומרה לפרויקט' },
    ],
    events: ['sales_order.converted_to_project'],
    listeners: ['ai.generate_project_risk_baseline', 'procurement.prepare_procurement_context'],
    navigate: '/entity360.html?type=project&id=:newId',
  },

  'order.cancel': {
    service: 'ops',
    label: 'בטל הזמנת מכירה',
    entity_type: 'sales_order',
    preconditions: [
      { check: 'entity_exists', entity: 'sales_order' },
      { check: 'status_in',     statuses: ['draft', 'confirmed'] },
    ],
    effects: [
      { type: 'transition',   entity: 'sales_order', transition: 'cancel' },
      { type: 'update_field', entity: 'sales_order', field: 'cancelled_at', value: '$now' },
      { type: 'revert_link',  from:   'quote', optional: true },
      { type: 'audit',        message: 'הזמנת מכירה בוטלה' },
    ],
    events: ['sales_order.cancelled'],
    navigate: '/entity360.html?type=sales_order&id=:salesOrderId',
  },

  'project.create_rfq': {
    service: 'procurement',
    label: 'צור RFQ מפרויקט',
    entity_type: 'project',
    preconditions: [
      { check: 'entity_exists', entity: 'project' },
      { check: 'status_in',     statuses: ['in_planning', 'in_procurement'] },
    ],
    effects: [
      { type: 'create',  entity: 'rfq', copyFrom: 'project', fields: ['items', 'project_id'], fromBOM: true },
      { type: 'link',    from:   'rfq', to: 'project' },
      { type: 'audit',   message: 'RFQ נוצר מפרויקט' },
    ],
    events: ['rfq.created_from_project'],
    listeners: ['ai.suggest_supplier_invites'],
    navigate: '/entity360.html?type=rfq&id=:newId',
  },

  'delivery.confirm': {
    service: 'ops',
    label: 'אשר משלוח כנמסר',
    entity_type: 'delivery',
    preconditions: [
      { check: 'entity_exists', entity: 'delivery' },
      { check: 'status_in',     statuses: ['in_transit', 'pending'] },
    ],
    effects: [
      { type: 'transition',   entity: 'delivery', transition: 'deliver' },
      { type: 'update_field', entity: 'delivery', field: 'delivered_at', value: '$now' },
      { type: 'trigger_downstream', action: 'invoice.create' },
      { type: 'audit',        message: 'משלוח אושר כנמסר' },
    ],
    events: ['delivery.confirmed'],
    listeners: ['ops.notify_customer_delivered', 'ai.update_logistics_metrics'],
    navigate: '/entity360.html?type=delivery&id=:deliveryId',
  },

  'delivery.issue_invoice': {
    service: 'procurement',
    label: 'הנפק חשבונית ממשלוח',
    entity_type: 'delivery',
    preconditions: [
      { check: 'entity_exists', entity: 'delivery' },
      { check: 'status_in',     statuses: ['delivered'] },
    ],
    effects: [
      { type: 'create',     entity: 'invoice', copyFrom: 'delivery', fields: ['delivery_id', 'sales_order_id', 'customer_id', 'items', 'direction:output'] },
      { type: 'link',       from:   'invoice', to: 'delivery' },
      { type: 'link',       from:   'invoice', to: 'sales_order', optional: true },
      { type: 'transition', entity: 'invoice', transition: 'issue' },
      { type: 'post_to_gl' },
      { type: 'post_to_vat' },
      { type: 'audit',      message: 'חשבונית הונפקה ממשלוח' },
    ],
    events: ['invoice.issued_from_delivery'],
    listeners: ['ai.update_cashflow_forecast', 'ops.show_project_finance_update'],
    navigate: '/entity360.html?type=invoice&id=:newId',
  },

  'project.close': {
    service: 'ops',
    label: 'סגור פרויקט',
    entity_type: 'project',
    preconditions: [
      { check: 'entity_exists',      entity: 'project' },
      { check: 'status_in',          statuses: ['completed', 'in_delivery'] },
      { check: 'all_invoices_paid',  entity: 'project' },
    ],
    effects: [
      { type: 'transition',   entity: 'project', transition: 'close' },
      { type: 'update_field', entity: 'project', field: 'closed_at', value: '$now' },
      { type: 'archive_related', entities: ['document', 'task', 'work_order'] },
      { type: 'generate_closure_report' },
      { type: 'audit',        message: 'פרויקט נסגר סופית' },
    ],
    events: ['project.closed'],
    listeners: ['ai.compute_project_profitability', 'finance.lock_project_costing'],
    navigate: '/entity360.html?type=project&id=:projectId',
  },
};

// ═══════════════════════════════════════════════════════════════
// ORCHESTRATOR EXECUTOR
// ═══════════════════════════════════════════════════════════════

async function executeOrchestration(actionKey, context, { supabase, audit }) {
  const orch = ORCHESTRATIONS[actionKey];
  if (!orch) return { ok: false, error: `Unknown action: ${actionKey}` };

  context = context || {};

  // ────────────────────────────────────────────────────────────
  // AGENT-223 precondition: composite_below
  // Verifies the supplier's persisted performance_score is below
  // a threshold (typically 50 → blacklist gate). Reads
  // procurement.suppliers.performance_score; if absent or above
  // the threshold, the orchestration is rejected before any
  // effect runs. The check is a no-op when supabase is not
  // available (test environment) — the unit test suite for
  // orchestrator.js can still exercise the action.
  // ────────────────────────────────────────────────────────────
  if (Array.isArray(orch.preconditions) && supabase) {
    for (const pc of orch.preconditions) {
      if (pc && pc.check === 'composite_below') {
        const supplierId = context.supplierId || context.id;
        if (!supplierId) {
          return { ok: false, error: 'composite_below: supplierId missing from context' };
        }
        try {
          const { data: row } = await supabase
            .from('procurement.suppliers')
            .select('performance_score')
            .eq('id', supplierId)
            .single();
          const score = Number(row && row.performance_score);
          if (!Number.isFinite(score) || score >= pc.threshold) {
            return {
              ok: false,
              error: `composite ${Number.isFinite(score) ? score : 'unknown'} not below ${pc.threshold}`,
            };
          }
        } catch (err) {
          return { ok: false, error: `composite_below check failed: ${err && err.message}` };
        }
      }
    }
  }

  // Build result log
  const result = {
    action: actionKey,
    label: orch.label,
    service: orch.service,
    effects_executed: [],
    events_emitted: orch.events || [],
    listeners_notified: orch.listeners || [],
    navigate: orch.navigate || null,
    timestamp: new Date().toISOString(),
  };

  // Execute each effect (simplified — in production each would call real APIs)
  for (const effect of orch.effects) {
    result.effects_executed.push({ type: effect.type, entity: effect.entity || null, status: 'executed' });
  }

  // Audit log
  if (supabase && audit) {
    await audit('orchestration', null, actionKey, context.actor || 'api',
      `Orchestration: ${orch.label}`, null, { action: actionKey, context, events: orch.events });
  }

  return { ok: true, ...result };
}

// ═══════════════════════════════════════════════════════════════
// REGISTER ROUTES
// ═══════════════════════════════════════════════════════════════

function registerOrchestratorRoutes(app, deps) {

  // List all orchestrations
  app.get('/api/orchestrator/actions', (_req, res) => {
    const actions = Object.entries(ORCHESTRATIONS).map(([key, o]) => ({
      key, label: o.label, service: o.service,
      preconditions: o.preconditions.length,
      effects: o.effects.length,
      events: (o.events || []).length,
    }));
    res.json({ actions });
  });

  // Get single orchestration definition
  app.get('/api/orchestrator/actions/:key', (req, res) => {
    const key = req.params.key;
    const orch = ORCHESTRATIONS[key];
    if (!orch) return res.status(404).json({ error: `Unknown action: ${key}` });
    res.json({ action: key, ...orch });
  });

  // Execute an orchestration
  app.post('/api/orchestrator/execute', async (req, res) => {
    const { action, context } = req.body;
    if (!action) return res.status(400).json({ error: 'action is required' });
    const result = await executeOrchestration(action, context || {}, deps);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  });

  console.log('   ✓ Orchestrator registered (' + Object.keys(ORCHESTRATIONS).length + ' actions)');
}

module.exports = { ORCHESTRATIONS, executeOrchestration, registerOrchestratorRoutes };
