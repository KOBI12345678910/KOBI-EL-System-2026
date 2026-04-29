/**
 * State Machines — Every entity has a defined state machine.
 *
 * Rules:
 *  - Only allowed transitions can happen
 *  - Each transition can trigger side-effects (automations)
 *  - Every transition is audited
 */

'use strict';

const STATE_MACHINES = {

  lead: {
    initial: 'new',
    states: {
      new:        { transitions: { contact: 'contacted', qualify: 'qualified', lose: 'lost' } },
      contacted:  { transitions: { qualify: 'qualified', lose: 'lost' } },
      qualified:  { transitions: { quote: 'quoted', lose: 'lost' } },
      quoted:     { transitions: { win: 'won', lose: 'lost' } },
      won:        { transitions: {}, final: true },
      lost:       { transitions: {}, final: true },
    },
    triggers: {
      'new→contacted':    [],
      'contacted→qualified': [],
      'qualified→quoted': [{ action: 'create_quote', params: { copyFrom: 'lead' } }],
      'quoted→won':       [{ action: 'create_customer', params: { copyFrom: 'lead' } }, { action: 'notify', params: { channel: 'all', template: 'lead_won' } }],
    },
  },

  quote: {
    initial: 'draft',
    states: {
      draft:        { transitions: { send: 'sent', reject: 'rejected' } },
      sent:         { transitions: { review: 'under_review', approve: 'approved', reject: 'rejected' } },
      under_review: { transitions: { approve: 'approved', reject: 'rejected' } },
      approved:     { transitions: { convert: 'converted' } },
      rejected:     { transitions: { revise: 'draft' } },
      converted:    { transitions: {}, final: true },
      deleted:      { transitions: {}, final: true },
    },
    triggers: {
      'under_review→approved': [{ action: 'notify', params: { template: 'quote_approved' } }, { action: 'create_audit', params: { type: 'quote_approval' } }],
      'approved→converted': [
        { action: 'create_project', params: { copyFrom: 'quote', includeItems: true } },
        { action: 'create_contract', params: { copyFrom: 'quote', status: 'draft' } },
        { action: 'create_tasks', params: { template: 'project_kickoff' } },
        { action: 'notify', params: { channel: 'all', template: 'project_created' } },
        { action: 'create_audit', params: { type: 'quote_to_project' } },
      ],
    },
  },

  // ─────────────────────────────────────────────────────────────
  // sales_order — added per AGENT-159 / AGENT-246. Entity exists in
  // commercial.sales_orders (migration 00043) and now in 00084 with
  // DB-layer guard trigger. Statuses align with status check
  // constraint AND state_machines.transitions seed in 00084.
  // ─────────────────────────────────────────────────────────────
  sales_order: {
    initial: 'draft',
    states: {
      draft:         { transitions: { confirm: 'confirmed', cancel: 'cancelled' } },
      confirmed:     { transitions: { start_production: 'in_production', invoice_direct: 'invoiced', cancel: 'cancelled' } },
      in_production: { transitions: { ship: 'shipped', cancel: 'cancelled' } },
      shipped:       { transitions: { deliver: 'delivered' } },
      delivered:     { transitions: { invoice: 'invoiced' } },
      invoiced:      { transitions: { close: 'closed' } },
      closed:        { transitions: {}, final: true },
      cancelled:     { transitions: {}, final: true },
    },
    triggers: {
      'draft→confirmed': [
        { action: 'reserve_inventory', params: {} },
        { action: 'create_draft_invoice', params: { target: 'accounts_receivable' } },
        { action: 'notify_customer', params: { template: 'order_confirmed' } },
      ],
      'confirmed→in_production': [
        { action: 'create_work_orders', params: { fromOrder: true } },
        { action: 'link_to_project', params: {} },
      ],
      'in_production→shipped': [
        { action: 'create_logistics_order', params: {} },
        { action: 'decrement_inventory', params: { type: 'shipment' } },
      ],
      'shipped→delivered': [
        { action: 'capture_pod', params: {} },
        { action: 'notify_customer', params: { template: 'order_delivered' } },
      ],
      'delivered→invoiced': [
        { action: 'issue_invoice', params: { copyFrom: 'sales_order' } },
        { action: 'post_to_gl', params: {} },
      ],
      'confirmed→invoiced': [
        { action: 'issue_invoice', params: { copyFrom: 'sales_order' } },
      ],
      'invoiced→closed': [
        { action: 'reconcile_payment', params: {} },
        { action: 'create_audit', params: { type: 'order_closure' } },
      ],
      'confirmed→cancelled': [
        { action: 'release_inventory', params: {} },
        { action: 'void_draft_invoice', params: {} },
      ],
      'in_production→cancelled': [
        { action: 'cancel_work_orders', params: {} },
        { action: 'release_inventory', params: {} },
      ],
    },
    badges: {
      draft:         { he: 'טיוטה',         en: 'Draft',         tone: 'neutral', icon: 'FileText' },
      confirmed:     { he: 'מאושר',         en: 'Confirmed',     tone: 'info',    icon: 'CheckCircle2' },
      in_production: { he: 'בייצור',        en: 'In Production', tone: 'warning', icon: 'Factory' },
      shipped:       { he: 'נשלח',          en: 'Shipped',       tone: 'info',    icon: 'Truck' },
      delivered:     { he: 'נמסר',          en: 'Delivered',     tone: 'success', icon: 'PackageCheck' },
      invoiced:      { he: 'חשבונית הופקה', en: 'Invoiced',      tone: 'success', icon: 'Receipt' },
      closed:        { he: 'סגור',          en: 'Closed',        tone: 'muted',   icon: 'Lock' },
      cancelled:     { he: 'בוטל',          en: 'Cancelled',     tone: 'danger',  icon: 'XCircle' },
    },
  },

  rfq: {
    initial: 'draft',
    states: {
      draft:             { transitions: { send: 'sent', reject: 'rejected' } },
      sent:              { transitions: { receive: 'quotes_received', reject: 'rejected' } },
      quotes_received:   { transitions: { compare: 'under_comparison', reject: 'rejected' } },
      under_comparison:  { transitions: { approve: 'approved', reject: 'rejected' } },
      approved:          { transitions: { convert: 'converted_to_po' } },
      rejected:          { transitions: {}, final: true },
      converted_to_po:   { transitions: {}, final: true },
    },
    triggers: {
      'under_comparison→approved': [{ action: 'create_comparison', params: {} }, { action: 'create_approval', params: { type: 'rfq_decision' } }],
      'approved→converted_to_po': [
        { action: 'create_po', params: { copyFrom: 'rfq', supplier: 'winner' } },
        { action: 'link_to_project', params: {} },
        { action: 'notify', params: { template: 'po_created_from_rfq' } },
      ],
    },
  },

  po: {
    initial: 'draft',
    states: {
      draft:              { transitions: { submit: 'pending_approval', cancel: 'cancelled' } },
      pending_approval:   { transitions: { approve: 'approved', reject: 'draft', cancel: 'cancelled' } },
      approved:           { transitions: { send: 'sent' } },
      sent:               { transitions: { partial_receive: 'partially_received', full_receive: 'fully_received' } },
      partially_received: { transitions: { full_receive: 'fully_received' } },
      fully_received:     { transitions: { close: 'closed' } },
      closed:             { transitions: {}, final: true },
      cancelled:          { transitions: {}, final: true },
    },
    triggers: {
      'approved→sent': [{ action: 'notify_supplier', params: { template: 'po_sent' } }, { action: 'update_budget', params: { type: 'committed' } }],
      'sent→partially_received': [
        { action: 'update_inventory', params: { type: 'receipt' } },
        { action: 'create_warehouse_receipt', params: {} },
        { action: 'update_costing', params: {} },
      ],
      'sent→fully_received': [
        { action: 'update_inventory', params: { type: 'receipt' } },
        { action: 'create_warehouse_receipt', params: {} },
        { action: 'update_costing', params: {} },
        { action: 'link_to_project', params: {} },
      ],
    },
  },

  project: {
    initial: 'draft',
    states: {
      draft:           { transitions: { approve: 'approved', cancel: 'cancelled' } },
      approved:        { transitions: { plan: 'in_planning', procure: 'in_procurement' } },
      in_planning:     { transitions: { procure: 'in_procurement', execute: 'in_execution' } },
      in_procurement:  { transitions: { execute: 'in_execution' } },
      in_execution:    { transitions: { deliver: 'in_delivery', complete: 'completed' } },
      in_delivery:     { transitions: { complete: 'completed' } },
      completed:       { transitions: { close: 'closed' } },
      closed:          { transitions: {}, final: true },
      cancelled:       { transitions: {}, final: true },
    },
    triggers: {
      'approved→in_planning': [
        { action: 'create_tasks', params: { template: 'planning_checklist' } },
        { action: 'assign_manager', params: {} },
      ],
      'in_planning→in_procurement': [
        { action: 'create_material_requests', params: { fromBOM: true } },
        { action: 'create_rfq', params: { fromMaterialRequests: true } },
        { action: 'create_approvals', params: { type: 'procurement' } },
      ],
      'in_procurement→in_execution': [
        { action: 'create_work_orders', params: { fromProject: true } },
        { action: 'reserve_inventory', params: {} },
        { action: 'assign_employees', params: {} },
      ],
      'in_execution→in_delivery': [
        { action: 'create_logistics_order', params: {} },
        { action: 'notify', params: { template: 'ready_for_delivery' } },
      ],
      'in_delivery→completed': [
        { action: 'create_invoice', params: { fromProject: true } },
        { action: 'update_project_financials', params: {} },
        { action: 'notify', params: { template: 'project_completed' } },
      ],
      'completed→closed': [
        { action: 'generate_closure_report', params: {} },
        { action: 'archive_documents', params: {} },
        { action: 'create_audit', params: { type: 'project_closure' } },
      ],
    },
  },

  work_order: {
    initial: 'open',
    states: {
      open:              { transitions: { assign: 'assigned', cancel: 'cancelled' } },
      assigned:          { transitions: { wait_material: 'waiting_materials', start: 'in_progress' } },
      waiting_materials: { transitions: { assign: 'assigned', start: 'in_progress' } },
      in_progress:       { transitions: { qa: 'qa', complete: 'completed' } },
      qa:                { transitions: { complete: 'completed', fail: 'in_progress' } },
      completed:         { transitions: { signoff: 'signed_off' } },
      signed_off:        { transitions: {}, final: true },
      cancelled:         { transitions: {}, final: true },
    },
    triggers: {
      'open→assigned': [{ action: 'notify_employee', params: { template: 'wo_assigned' } }, { action: 'start_attendance_tracking', params: {} }],
      'in_progress→qa': [{ action: 'create_quality_check', params: {} }],
      'completed→signed_off': [
        { action: 'create_signature', params: {} },
        { action: 'update_project_progress', params: {} },
        { action: 'calculate_wo_costs', params: {} },
        { action: 'check_delivery_ready', params: {} },
      ],
    },
  },

  invoice: {
    initial: 'draft',
    states: {
      draft:          { transitions: { issue: 'issued', cancel: 'cancelled' } },
      issued:         { transitions: { send: 'sent' } },
      sent:           { transitions: { partial_pay: 'partially_paid', full_pay: 'paid', overdue: 'overdue' } },
      partially_paid: { transitions: { full_pay: 'paid', overdue: 'overdue' } },
      paid:           { transitions: {}, final: true },
      overdue:        { transitions: { partial_pay: 'partially_paid', full_pay: 'paid', collect: 'in_collection' } },
      in_collection:  { transitions: { full_pay: 'paid' } },
      cancelled:      { transitions: {}, final: true },
    },
    triggers: {
      'draft→issued': [
        { action: 'post_to_gl', params: {} },
        { action: 'post_to_vat', params: {} },
        { action: 'start_collection_tracking', params: {} },
      ],
      'issued→sent': [{ action: 'notify_customer', params: { template: 'invoice_sent' } }],
      'sent→paid': [
        { action: 'create_payment_record', params: {} },
        { action: 'bank_matching', params: {} },
        { action: 'update_cashflow', params: {} },
        { action: 'update_tax_export', params: {} },
      ],
      'overdue→in_collection': [{ action: 'notify_customer', params: { template: 'collection_notice' } }, { action: 'create_alert', params: { severity: 'high' } }],
    },
  },

  employee: {
    initial: 'active',
    states: {
      active:     { transitions: { leave: 'on_leave', suspend: 'suspended', terminate: 'terminated' } },
      on_leave:   { transitions: { return: 'active', terminate: 'terminated' } },
      suspended:  { transitions: { reinstate: 'active', terminate: 'terminated' } },
      terminated: { transitions: {}, final: true },
    },
    triggers: {},
  },

  attendance: {
    initial: 'draft',
    states: {
      draft:               { transitions: { submit: 'submitted' } },
      submitted:           { transitions: { approve: 'approved', reject: 'rejected' } },
      approved:            { transitions: { export: 'exported_to_payroll' } },
      rejected:            { transitions: { revise: 'draft' } },
      exported_to_payroll: { transitions: {}, final: true },
    },
    triggers: {
      'submitted→approved': [{ action: 'mark_available_for_payroll', params: {} }, { action: 'mark_available_for_costing', params: {} }],
      'approved→exported_to_payroll': [{ action: 'link_to_payroll', params: {} }],
    },
  },

  payroll: {
    initial: 'draft',
    states: {
      draft:      { transitions: { calculate: 'calculated', cancel: 'cancelled' } },
      calculated: { transitions: { approve: 'approved', recalculate: 'draft' } },
      approved:   { transitions: { export: 'exported', pay: 'paid' } },
      exported:   { transitions: { pay: 'paid' } },
      paid:       { transitions: {}, final: true },
      cancelled:  { transitions: {}, final: true },
    },
    triggers: {
      'draft→calculated': [{ action: 'create_wage_slips', params: {} }, { action: 'calculate_pension', params: {} }],
      'approved→exported': [{ action: 'create_bank_file', params: {} }],
      'exported→paid': [{ action: 'post_costs_to_finance', params: {} }, { action: 'update_project_costing', params: {} }],
    },
  },

  contract: {
    initial: 'draft',
    states: {
      draft:             { transitions: { send_for_sign: 'pending_signature' } },
      pending_signature: { transitions: { sign: 'active', reject: 'draft' } },
      active:            { transitions: { expire: 'expired', terminate: 'terminated' } },
      expired:           { transitions: { renew: 'draft' } },
      terminated:        { transitions: {}, final: true },
    },
    triggers: {
      'pending_signature→active': [{ action: 'create_signature', params: {} }, { action: 'notify', params: { template: 'contract_signed' } }],
    },
  },

  task: {
    initial: 'todo',
    states: {
      todo:        { transitions: { start: 'in_progress', cancel: 'cancelled' } },
      in_progress: { transitions: { block: 'blocked', complete: 'done' } },
      blocked:     { transitions: { unblock: 'in_progress', escalate: 'escalated' } },
      escalated:   { transitions: { resolve: 'in_progress' } },
      done:        { transitions: {}, final: true },
      cancelled:   { transitions: {}, final: true },
    },
    triggers: {},
  },

  payment: {
    initial: 'draft',
    states: {
      draft:      { transitions: { post: 'posted', reverse: 'reversed' } },
      posted:     { transitions: { reconcile: 'reconciled', reverse: 'reversed' } },
      reconciled: { transitions: {}, final: true },
      reversed:   { transitions: {}, final: true },
    },
    triggers: {
      'draft→posted': [{ action: 'post_to_gl', params: {} }],
      'posted→reconciled': [{ action: 'update_cashflow', params: {} }, { action: 'close_matching_alerts', params: {} }],
    },
  },

  document: {
    initial: 'uploaded',
    states: {
      uploaded:   { transitions: { classify: 'classified' } },
      classified: { transitions: { sign: 'signed', archive: 'archived' } },
      signed:     { transitions: { archive: 'archived' } },
      archived:   { transitions: {}, final: true },
    },
    triggers: {},
  },

  alert: {
    initial: 'new',
    states: {
      new:          { transitions: { ack: 'acknowledged', dismiss: 'dismissed' } },
      acknowledged: { transitions: { assign: 'assigned' } },
      assigned:     { transitions: { resolve: 'resolved' } },
      resolved:     { transitions: {}, final: true },
      dismissed:    { transitions: {}, final: true },
    },
    triggers: {},
  },

  // ─────────────────────────────────────────────────────────────
  // supplier — added per AGENT-223 (closes the loop on AGENT-183).
  // States align with procurement.suppliers.status_check after
  // migration 00092_vendor_score_history.sql:
  //   active, preferred, monitor, on_hold, blacklisted, inactive,
  //   pending_review.
  // pending_review and inactive have no outbound transitions
  // defined here because they are managed by other flows
  // (onboarding + off-boarding). All blacklist transitions are
  // ALSO guarded at the DB layer by trg_guard_rfq_supplier and
  // trg_guard_po_supplier (00092 migration).
  // ─────────────────────────────────────────────────────────────
  supplier: {
    initial: 'active',
    states: {
      active:      { transitions: { monitor: 'monitor', hold: 'on_hold', blacklist: 'blacklisted' } },
      preferred:   { transitions: { monitor: 'monitor', hold: 'on_hold', blacklist: 'blacklisted' } },
      monitor:     { transitions: { restore: 'active', hold: 'on_hold', blacklist: 'blacklisted' } },
      on_hold:     { transitions: { restore: 'active', blacklist: 'blacklisted' } },
      blacklisted: { transitions: { reinstate: 'on_hold' } },
      inactive:    { transitions: { restore: 'active' } },
    },
    triggers: {
      'active→blacklisted': [
        { action: 'cancel_open_rfq_invites', params: {} },
        { action: 'freeze_open_pos',         params: {} },
        { action: 'notify_buyers',           params: { template: 'vendor_blacklisted' } },
      ],
      'preferred→blacklisted': [
        { action: 'cancel_open_rfq_invites', params: {} },
        { action: 'freeze_open_pos',         params: {} },
        { action: 'notify_buyers',           params: { template: 'vendor_blacklisted' } },
      ],
      'monitor→blacklisted': [
        { action: 'cancel_open_rfq_invites', params: {} },
        { action: 'freeze_open_pos',         params: {} },
      ],
      'on_hold→blacklisted': [
        { action: 'cancel_open_rfq_invites', params: {} },
        { action: 'freeze_open_pos',         params: {} },
      ],
      'blacklisted→on_hold': [
        { action: 'create_audit', params: { type: 'vendor_reinstated' } },
      ],
    },
    badges: {
      active:         { he: 'פעיל',          en: 'Active',      tone: 'success', icon: 'CheckCircle2' },
      preferred:      { he: 'ספק מועדף',     en: 'Preferred',   tone: 'success', icon: 'Star' },
      monitor:        { he: 'בניטור',        en: 'Monitor',     tone: 'warning', icon: 'Eye' },
      on_hold:        { he: 'מוקפא',         en: 'On Hold',     tone: 'warning', icon: 'PauseCircle' },
      blacklisted:    { he: 'ברשימה שחורה',  en: 'Blacklisted', tone: 'danger',  icon: 'Ban' },
      inactive:       { he: 'לא פעיל',       en: 'Inactive',    tone: 'muted',   icon: 'Archive' },
      pending_review: { he: 'בבדיקה',        en: 'Pending',     tone: 'info',    icon: 'Clock' },
    },
  },
};

// ═══════════════════════════════════════════════════════════════
// STATE MACHINE EXECUTOR
// ═══════════════════════════════════════════════════════════════

function canTransition(entityType, currentStatus, transitionName) {
  const machine = STATE_MACHINES[entityType];
  if (!machine) return { allowed: false, reason: `Unknown entity type: ${entityType}` };
  const state = machine.states[currentStatus];
  if (!state) return { allowed: false, reason: `Unknown status: ${currentStatus}` };
  const nextStatus = state.transitions[transitionName];
  if (!nextStatus) return { allowed: false, reason: `Transition "${transitionName}" not allowed from "${currentStatus}"` };
  return { allowed: true, nextStatus };
}

function getAvailableTransitions(entityType, currentStatus) {
  const machine = STATE_MACHINES[entityType];
  if (!machine || !machine.states[currentStatus]) return [];
  return Object.entries(machine.states[currentStatus].transitions).map(([name, target]) => ({ name, target }));
}

function getTriggersForTransition(entityType, fromStatus, toStatus) {
  const machine = STATE_MACHINES[entityType];
  if (!machine) return [];
  const key = `${fromStatus}→${toStatus}`;
  return machine.triggers[key] || [];
}

function getBadge(entityType, status) {
  const machine = STATE_MACHINES[entityType];
  if (!machine || !machine.badges) return null;
  return machine.badges[status] || null;
}

// ═══════════════════════════════════════════════════════════════
// REGISTER ROUTES
// ═══════════════════════════════════════════════════════════════

function registerStateMachineRoutes(app, executorOpts) {

  // Get all state machines
  app.get('/api/state-machines', (_req, res) => {
    res.json({ machines: STATE_MACHINES });
  });

  // Get machine for entity type
  app.get('/api/state-machines/:type', (req, res) => {
    const machine = STATE_MACHINES[req.params.type];
    if (!machine) return res.status(404).json({ error: `Unknown entity: ${req.params.type}` });
    res.json({ machine });
  });

  // Check if transition is valid
  app.get('/api/state-machines/:type/can-transition', (req, res) => {
    const { current, transition } = req.query;
    if (!current || !transition) return res.status(400).json({ error: 'current and transition query params required' });
    res.json(canTransition(req.params.type, current, transition));
  });

  // Get available transitions from current status
  app.get('/api/state-machines/:type/transitions', (req, res) => {
    const { current } = req.query;
    if (!current) return res.status(400).json({ error: 'current query param required' });
    res.json({ transitions: getAvailableTransitions(req.params.type, current) });
  });

  // Get UI badge mapping for a status (or all if no status param)
  app.get('/api/state-machines/:type/badges', (req, res) => {
    const machine = STATE_MACHINES[req.params.type];
    if (!machine) return res.status(404).json({ error: `Unknown entity: ${req.params.type}` });
    if (req.query.status) return res.json({ badge: getBadge(req.params.type, req.query.status) });
    res.json({ badges: machine.badges || {} });
  });

  // AGENT-211 — POST /api/state-machines/:type/transition
  // Mount the transition executor so 360-page button-presses funnel
  // through a single audited/event-emitting endpoint.
  try {
    const { registerTransitionExecutor } = require('./transition-executor');
    registerTransitionExecutor(app, executorOpts || {});
  } catch (e) {
    console.warn('   ⚠️  transition executor wiring skipped:', e && e.message);
  }

  console.log('   ✓ State machines registered (' + Object.keys(STATE_MACHINES).length + ' entities)');
}

module.exports = { STATE_MACHINES, canTransition, getAvailableTransitions, getTriggersForTransition, getBadge, registerStateMachineRoutes };
