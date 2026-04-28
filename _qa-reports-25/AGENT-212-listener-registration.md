# AGENT-212 — Orchestrator Listener Registration

**Worktree:** `objective-merkle-40ff93`
**Date:** 2026-04-29
**Owner:** Agent 212 (follow-up to Agents 16 / 79)

## 1. Findings

`onyx-procurement/src/pipeline/orchestrator.js` declares **12 listeners** across 8 actions, but **none** are registered with the in-process `EventBus` (`onyx-procurement/src/wiring/event-bus.js`). The orchestrator only echoes the listener names back inside the HTTP response (`listeners_notified: orch.listeners`) — no `bus.subscribe()` calls are made. Result: every event flagged as `ai.*` / `ops.*` / `procurement.*` is emitted but silently dropped.

### 1.1 The 12 Listeners (extracted from `orchestrator.js`)

| # | Listener Key                              | Trigger Event                  | Source Action                  | Line |
|---|-------------------------------------------|--------------------------------|--------------------------------|------|
| 1 | `ai.margin_and_risk_review`               | `quote.approved`               | `quote.approve`                | 59   |
| 2 | `ai.generate_project_risk_baseline`       | `project.created_from_quote`   | `quote.convert_to_project`     | 76   |
| 3 | `procurement.prepare_procurement_context` | `project.created_from_quote`   | `quote.convert_to_project`     | 76   |
| 4 | `ai.assess_supplier_risk`                 | `po.created`                   | `project.create_po`            | 103  |
| 5 | `ops.try_allocate_received_stock`         | `inventory.received_from_po`   | `po.receive_items`             | 147  |
| 6 | `ai.check_delivery_anomalies`             | `inventory.received_from_po`   | `po.receive_items`             | 147  |
| 7 | `ai.update_cashflow_forecast`             | `invoice.issued`               | `invoice.issue`                | 187  |
| 8 | `ops.show_project_finance_update`         | `invoice.issued`               | `invoice.issue`                | 187  |
| 9 | `ai.detect_collection_risk_change`        | `payment.registered`           | `invoice.register_payment`     | 200  |
| 10| `procurement.consume_labor_cost`          | `attendance.approved`          | `attendance.approve`           | 225  |
| 11| `procurement.post_labor_cost`             | `payroll.calculated`           | `payroll.calculate`            | 239  |
| 12| `ai.detect_payroll_anomalies`             | `payroll.calculated`           | `payroll.calculate`            | 239  |

### 1.2 Gaps

- **Orchestrator** (`executeOrchestration`) returns `listeners_notified` but never calls `bus.publish` for the events nor `bus.subscribe` for the listeners.
- **Domain events** (`domain-events.js`) registers only **5 cross-service consumers** (`commercial.quote.approved`, `procurement.po.approved`, `procurement.po.created`, `finance.payment.registered`, wildcard `procurement.**`). None of the 12 orchestrator listeners are present.
- The orchestrator emits **short-form** event names (`quote.approved`, `po.created`, `payment.registered`) while domain-events uses **dotted** prefixes (`commercial.quote.approved`, `procurement.po.created`). Bridge required.

## 2. Solution: Unified Listener Registration Module

Create `onyx-procurement/src/wiring/orchestrator-listeners.js`. It performs three jobs:

1. **Registers the 12 short-form orchestrator events** as bilingual types on the EventBus.
2. **Subscribes 12 listener handlers** with stable IDs and priorities (AI = -20, ops/procurement = +10).
3. **Bridges the orchestrator's `events`** to `bus.publishWithAck` so subscribers actually run.

### 2.1 File: `onyx-procurement/src/wiring/orchestrator-listeners.js`

```javascript
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
```

### 2.2 Wire-up in `domain-events.js`

In `_registerCrossServiceConsumers(log)` (or `initDomainEvents` right after), add:

```javascript
// Inside initDomainEvents, after _registerCrossServiceConsumers(log):
const { registerOrchestratorListeners } = require('./orchestrator-listeners');
registerOrchestratorListeners({ bus, services: opts.services || {}, logger: log });
```

### 2.3 Wire-up in `orchestrator.js`

After `executeOrchestration` builds `result`, push events through the bus:

```javascript
// At top of orchestrator.js
const { publishOrchestratorEvents } = require('../wiring/orchestrator-listeners');
const { getEventBus } = require('../wiring/domain-events');

// Inside executeOrchestration, just before `return { ok: true, ... }`:
const bus = getEventBus();
result.event_dispatch = await publishOrchestratorEvents({
  bus,
  actionResult: result,
  correlationId: context.correlationId,
});
```

## 3. Verification Checklist

- [ ] `bus.stats.subscribers` increases by 12 after `initDomainEvents()`.
- [ ] `POST /api/orchestrator/execute { action: 'quote.approve' }` produces a `bus.auditLog` row with `kind: 'publish'` and `eventType: 'quote.approved'`.
- [ ] `bus.auditLog` contains a matching `kind: 'subscribe'` row with `subId: 'ai.margin_and_risk_review'`.
- [ ] All 12 listener IDs appear in the `tokens[]` array returned by `registerOrchestratorListeners`.
- [ ] `missing` array is empty (every orchestrator-declared listener has a handler).
- [ ] Failing handlers land in `bus.deadLetterQueue` rather than crashing the request.

## 4. Files Touched

| File | Action |
|------|--------|
| `onyx-procurement/src/wiring/orchestrator-listeners.js` | **NEW** — module above |
| `onyx-procurement/src/wiring/domain-events.js` | Edit `initDomainEvents` to call `registerOrchestratorListeners` |
| `onyx-procurement/src/pipeline/orchestrator.js` | Edit `executeOrchestration` to call `publishOrchestratorEvents` |

## 5. Notes

- All 12 listeners are subscribed with `async: true`, so `publishWithAck` awaits them and surfaces failures via `summary.failures`.
- AI listeners use negative priority (-20) so operational/procurement reactions (priority 10) finish first; this matches the "fast path then enrichment" pattern.
- Stub services let the registration succeed even before the AI/ops modules are wired — handlers log to debug and never throw.
- The cross-check step (`missing`) is a safety net: if the orchestrator gains a new listener key, this module logs the gap until a handler is added.
- Reuses the existing append-only audit + DLQ semantics in `event-bus.js`; no new persistence path is introduced.
