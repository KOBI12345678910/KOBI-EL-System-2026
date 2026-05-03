'use strict';

/**
 * Orchestrator Listener Registration
 * Bridges the 12 listeners declared in src/pipeline/orchestrator.js to the
 * in-process EventBus exposed by src/wiring/event-bus.js + domain-events.js.
 *
 * Without this module the orchestrator's `listeners: [...]` arrays are
 * informational only — handlers never run. Calling registerOrchestratorListeners
 * makes the choreography real.
 */

const { ORCHESTRATIONS } = require('../pipeline/orchestrator');

// ── 1. Bilingual event-type catalogue (short-form, matches orchestrator.events) ──
const ORCHESTRATOR_EVENT_TYPES = {
  'quote.approved':              { owner: 'ops',         labels: { he: 'הצעת מחיר אושרה',     en: 'Quote approved' },              shape: ['quoteId', 'approverId'] },
  'project.created_from_quote':  { owner: 'ops',         labels: { he: 'פרויקט נוצר מהצעה',   en: 'Project created from quote' },  shape: ['projectId', 'quoteId', 'customerId'] },
  'po.created':                  { owner: 'procurement', labels: { he: 'הזמנת רכש נוצרה',     en: 'PO created' },                   shape: ['poId', 'projectId', 'supplierId'] },
  'inventory.received_from_po':  { owner: 'procurement', labels: { he: 'מלאי התקבל מהזמנה',   en: 'Inventory received from PO' },   shape: ['poId', 'receiptId', 'lines'] },
  'invoice.issued':              { owner: 'finance',     labels: { he: 'חשבונית הונפקה',      en: 'Invoice issued' },               shape: ['invoiceId', 'amount', 'projectId'] },
  'payment.registered':          { owner: 'finance',     labels: { he: 'תשלום נרשם',          en: 'Payment registered' },           shape: ['paymentId', 'invoiceId', 'amount'] },
  'attendance.approved':         { owner: 'payroll',     labels: { he: 'נוכחות אושרה',        en: 'Attendance approved' },          shape: ['attendanceId', 'employeeId', 'hours'] },
  'payroll.calculated':          { owner: 'payroll',     labels: { he: 'שכר חושב',            en: 'Payroll calculated' },           shape: ['runId', 'employeeCount', 'totalGross'] },
};

// ── 2. The 12 listeners — each is { id, event, handler, priority } ──
function buildListeners({ services, log }) {
  const ai = (services && services.ai)               || { call: async (k, p) => log.debug(`[ai-stub:${k}]`, p) };
  const ops = (services && services.ops)             || { call: async (k, p) => log.debug(`[ops-stub:${k}]`, p) };
  const procurement = (services && services.procurement) || { call: async (k, p) => log.debug(`[proc-stub:${k}]`, p) };

  return [
    { id: 'ai.margin_and_risk_review',                event: 'quote.approved',
      priority: -20,
      handler: async (e) => ai.call('margin_and_risk_review', e.payload) },

    { id: 'ai.generate_project_risk_baseline',        event: 'project.created_from_quote',
      priority: -20,
      handler: async (e) => ai.call('generate_project_risk_baseline', e.payload) },

    { id: 'procurement.prepare_procurement_context',  event: 'project.created_from_quote',
      priority: 10,
      handler: async (e) => procurement.call('prepare_procurement_context', e.payload) },

    { id: 'ai.assess_supplier_risk',                  event: 'po.created',
      priority: -20,
      handler: async (e) => ai.call('assess_supplier_risk', e.payload) },

    { id: 'ops.try_allocate_received_stock',          event: 'inventory.received_from_po',
      priority: 10,
      handler: async (e) => ops.call('try_allocate_received_stock', e.payload) },

    { id: 'ai.check_delivery_anomalies',              event: 'inventory.received_from_po',
      priority: -20,
      handler: async (e) => ai.call('check_delivery_anomalies', e.payload) },

    { id: 'ai.update_cashflow_forecast',              event: 'invoice.issued',
      priority: -20,
      handler: async (e) => ai.call('update_cashflow_forecast', e.payload) },

    { id: 'ops.show_project_finance_update',          event: 'invoice.issued',
      priority: 10,
      handler: async (e) => ops.call('show_project_finance_update', e.payload) },

    { id: 'ai.detect_collection_risk_change',         event: 'payment.registered',
      priority: -20,
      handler: async (e) => ai.call('detect_collection_risk_change', e.payload) },

    { id: 'procurement.consume_labor_cost',           event: 'attendance.approved',
      priority: 10,
      handler: async (e) => procurement.call('consume_labor_cost', e.payload) },

    { id: 'procurement.post_labor_cost',              event: 'payroll.calculated',
      priority: 10,
      handler: async (e) => procurement.call('post_labor_cost', e.payload) },

    { id: 'ai.detect_payroll_anomalies',              event: 'payroll.calculated',
      priority: -20,
      handler: async (e) => ai.call('detect_payroll_anomalies', e.payload) },
  ];
}

// ── 3. Registration entry point ──
function registerOrchestratorListeners({ bus, services = {}, logger } = {}) {
  if (!bus) throw new Error('registerOrchestratorListeners: bus is required');
  const log = logger || console;

  // 3.1 Register short-form event types (idempotent — re-registering same spec is no-op)
  let typesRegistered = 0;
  for (const [type, spec] of Object.entries(ORCHESTRATOR_EVENT_TYPES)) {
    try { bus.registerEventType(type, spec); typesRegistered += 1; }
    catch (err) { log.warn(`[orch-listeners] type "${type}" register failed: ${err.message}`); }
  }

  // 3.2 Subscribe the 12 handlers as ASYNC so publishWithAck awaits them
  const tokens = [];
  const listeners = buildListeners({ services, log });
  for (const l of listeners) {
    const tok = bus.subscribe(l.event, l.handler,
      { id: l.id, async: true, priority: l.priority });
    tokens.push({ id: l.id, event: l.event, token: tok });
  }

  // 3.3 Cross-check: every listener referenced in ORCHESTRATIONS must be registered
  const declared = new Set();
  for (const orch of Object.values(ORCHESTRATIONS)) {
    for (const lid of (orch.listeners || [])) declared.add(lid);
  }
  const registered = new Set(listeners.map((l) => l.id));
  const missing = [...declared].filter((id) => !registered.has(id));
  if (missing.length) {
    log.warn(`[orch-listeners] ${missing.length} declared but unregistered: ${missing.join(', ')}`);
  }

  log.info(`[orch-listeners] registered ${tokens.length}/12 listeners across ${typesRegistered} event types`);
  return { tokens, missing, count: tokens.length };
}

// ── 4. Bridge orchestrator.execute -> bus.publishWithAck ──
async function publishOrchestratorEvents({ bus, actionResult, correlationId }) {
  if (!bus || !actionResult || !Array.isArray(actionResult.events_emitted)) return [];
  const out = [];
  for (const eventType of actionResult.events_emitted) {
    const summary = await bus.publishWithAck({
      type: eventType,
      payload: { action: actionResult.action, service: actionResult.service },
      source: 'orchestrator',
      correlationId,
    });
    out.push(summary);
  }
  return out;
}

module.exports = {
  registerOrchestratorListeners,
  publishOrchestratorEvents,
  ORCHESTRATOR_EVENT_TYPES,
};
