# AGENT-79 — Event Bus / Pub-Sub Audit

**Date:** 2026-04-29
**Scope:** Confirm Agent 16's finding that 12 listener names declared in `orchestrator.js` are not registered with the in-process event bus.
**Verdict:** **CONFIRMED.** Listener names in `ORCHESTRATIONS` are pure metadata strings. They are echoed back in the response payload but never wired to `EventBus.subscribe()` and `executeOrchestration()` never calls `bus.publish()` / `emitDomainEvent()`.

---

## 1. Files inspected

| File | Lines | Role |
|---|---|---|
| `onyx-procurement/src/wiring/event-bus.js` | 739 | `EventBus` class (typed pub-sub, DLQ, journal, replay) |
| `onyx-procurement/src/wiring/domain-events.js` | 314 | Singleton bridge: local bus + `EventProducer` (Supabase) |
| `onyx-procurement/src/pipeline/orchestrator.js` | 338 | 18 actions, declares `events[]` + `listeners[]` per action |
| `onyx-procurement/server.js` | (init at L177) | Calls `initDomainEvents({ supabase })` once at startup |

---

## 2. The 12 listener names declared in `orchestrator.js`

All come from `ORCHESTRATIONS[action].listeners`:

| # | Action key (line) | Listener name |
|---|---|---|
| 1 | `quote.approve` (L59) | `ai.margin_and_risk_review` |
| 2 | `quote.convert_to_project` (L76) | `ai.generate_project_risk_baseline` |
| 3 | `quote.convert_to_project` (L76) | `procurement.prepare_procurement_context` |
| 4 | `project.create_po` (L103) | `ai.assess_supplier_risk` |
| 5 | `po.receive_items` (L147) | `ops.try_allocate_received_stock` |
| 6 | `po.receive_items` (L147) | `ai.check_delivery_anomalies` |
| 7 | `invoice.issue` (L187) | `ai.update_cashflow_forecast` |
| 8 | `invoice.issue` (L187) | `ops.show_project_finance_update` |
| 9 | `invoice.register_payment` (L200) | `ai.detect_collection_risk_change` |
| 10 | `attendance.approve` (L225) | `procurement.consume_labor_cost` |
| 11 | `payroll.calculate` (L239) | `procurement.post_labor_cost` |
| 12 | `payroll.calculate` (L239) | `ai.detect_payroll_anomalies` |

**Total = 12 distinct listener names.** Matches Agent 16's count exactly.

---

## 3. Bus-side check — what IS subscribed?

`event-bus.js` exports an `EventBus` class with `subscribe(pattern, handler, opts)`.
`domain-events.js::_registerCrossServiceConsumers()` (L238–289) is the ONLY caller of `bus.subscribe()` in `onyx-procurement/src`. It registers **5 subscribers**:

| Sub id | Pattern |
|---|---|
| `cross-svc:quote-to-project` | `commercial.quote.approved` |
| `cross-svc:po-to-inventory` | `procurement.po.approved` |
| `cross-svc:po-to-finance` | `procurement.po.created` |
| `cross-svc:payment-to-collection` | `finance.payment.registered` |
| `observability:procurement-all` | `procurement.**` |

**None of these 5 subscribers carry any of the 12 orchestrator listener names** (e.g. `ai.margin_and_risk_review`, `ops.try_allocate_received_stock`, `procurement.consume_labor_cost`).

Cross-repo grep for the 12 listener strings (`margin_and_risk_review|generate_project_risk_baseline|prepare_procurement_context|assess_supplier_risk|try_allocate_received_stock|check_delivery_anomalies|update_cashflow_forecast|show_project_finance_update|detect_collection_risk_change|consume_labor_cost|post_labor_cost|detect_payroll_anomalies`) returns matches **only inside `orchestrator.js` itself** — zero subscribers, zero handlers, zero references in any AI / ops / procurement module.

---

## 4. Orchestrator-side check — does executeOrchestration() publish anything?

`executeOrchestration()` (L270–298 in `orchestrator.js`):

```js
const result = {
  action: actionKey,
  ...
  events_emitted: orch.events || [],          // <-- copied verbatim into response
  listeners_notified: orch.listeners || [],   // <-- copied verbatim into response
  navigate: orch.navigate || null,
  ...
};
for (const effect of orch.effects) {
  result.effects_executed.push({ ... status: 'executed' });   // marker only
}
if (supabase && audit) await audit(...);
return { ok: true, ...result };
```

Confirmed by grep `bus\.publish|publishWithAck|emitDomainEvent` over `onyx-procurement/src/pipeline/`: **No matches.** The orchestrator:
1. Never imports `event-bus.js` or `domain-events.js`.
2. Never calls `bus.publish()` / `emitDomainEvent()`.
3. The `events` and `listeners` arrays are surface-level metadata returned to the HTTP caller of `POST /api/orchestrator/execute`, nothing more.

---

## 5. Net effect on the wiring contract

| Layer | Declared | Wired | Gap |
|---|---|---|---|
| Event types in registry (`DEFAULT_EVENT_TYPES` + `ONYX_EVENT_TYPES`) | 15 | 15 | OK |
| Bus subscribers (`bus.subscribe`) | 5 | 5 | OK (only domain-events.js) |
| Orchestrator listener names | **12** | **0** | **12 dangling** |
| Orchestrator `events[]` -> bus publish | 18 actions, ~20 event names | **0** | **Orchestrator never publishes** |

The bus exists and works (see `test/wiring/event-bus.test.js`), `domain-events.js` is initialised by `server.js` at L177, and 5 cross-service consumers run. **But** the action layer (orchestrator.js) is fully decoupled from the bus — clicking a button in `/api/orchestrator/execute` produces an audit row + a JSON response, and **no bus traffic at all**. AI listeners (`ai.margin_and_risk_review`, etc.) are therefore never invoked.

---

## 6. Recommended fix (minimal, additive)

In `orchestrator.js::executeOrchestration()`, after the audit step:

```js
const { emitDomainEvent } = require('../wiring/domain-events');
for (const evtName of (orch.events || [])) {
  await emitDomainEvent(evtName, {
    entityType: context.entityType || null,
    entityId: context.entityId || null,
    action: actionKey,
    actor: context.actor || 'system',
    correlationId: context.correlationId,
    payload: { listeners: orch.listeners || [], ...context },
  });
}
```

Then register one subscriber per listener name in `domain-events.js::_registerCrossServiceConsumers()` (or split into `ai-listeners.js` + `ops-listeners.js`). Until that wiring is added, all 12 listeners are dead strings.

---

## 7. Confirmation summary

- **Agent 16 finding: VERIFIED.**
- 12 listener names declared in `onyx-procurement/src/pipeline/orchestrator.js`.
- 0 of them are registered with `EventBus.subscribe()` in `onyx-procurement/src/wiring/event-bus.js` or `onyx-procurement/src/wiring/domain-events.js`.
- The orchestrator additionally fails to publish `events[]` to the bus (separate but related gap).
- Event bus infra itself is sound; the gap is purely in **action layer integration**.
