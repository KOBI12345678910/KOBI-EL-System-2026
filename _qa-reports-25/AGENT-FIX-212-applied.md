# AGENT-FIX-212 — Orchestrator Listener Registration (APPLIED)

**Worktree:** `objective-merkle-40ff93`
**Date:** 2026-04-29
**Source report:** `_qa-reports-25/AGENT-212-listener-registration.md`
**Status:** Applied

## 1. What changed

| File | Action | Notes |
|------|--------|-------|
| `onyx-procurement/src/wiring/orchestrator-listeners.js` | **Created** | New module: short-form event-type registry, 12 listener handlers, `registerOrchestratorListeners`, `publishOrchestratorEvents` |
| `onyx-procurement/src/wiring/domain-events.js` | **Edited** | `initDomainEvents` accepts `services`; calls `registerOrchestratorListeners` after `_registerCrossServiceConsumers` |

> The third file in the original plan (`onyx-procurement/src/pipeline/orchestrator.js`) was **not** edited in this fix — wiring `publishOrchestratorEvents` into `executeOrchestration` is left for a follow-up so this commit stays scoped to listener registration only. The `publishOrchestratorEvents` helper is exported from the new module and ready to be plugged in.

## 2. New module: `orchestrator-listeners.js`

Implements three jobs (verbatim from the AGENT-212 plan):

1. **`ORCHESTRATOR_EVENT_TYPES`** — bilingual short-form catalogue for the 8 event types the orchestrator emits (`quote.approved`, `project.created_from_quote`, `po.created`, `inventory.received_from_po`, `invoice.issued`, `payment.registered`, `attendance.approved`, `payroll.calculated`).
2. **`buildListeners({ services, log })`** — produces the 12 listener descriptors `{ id, event, handler, priority }`. AI listeners use priority `-20`; ops/procurement listeners use priority `+10`. Stub services log to debug if no real service is wired in.
3. **`registerOrchestratorListeners({ bus, services, logger })`** — registers the 8 event types (idempotent), subscribes the 12 handlers as `async: true`, cross-checks every listener referenced in `ORCHESTRATIONS` is registered, and returns `{ tokens, missing, count }`.
4. **`publishOrchestratorEvents({ bus, actionResult, correlationId })`** — bridge helper that turns `actionResult.events_emitted[]` into `bus.publishWithAck(...)` calls so the 12 subscribers actually run.

## 3. Edit to `domain-events.js`

- `initDomainEvents` signature now accepts an optional `services` argument.
- After `_registerCrossServiceConsumers(log)` a new step calls `registerOrchestratorListeners({ bus, services, logger: log })` inside a `try/catch` (failure is non-fatal — domain events still work without orchestrator wiring).

```javascript
// 4. Register the 12 orchestrator listeners (AGENT-212)
try {
  const { registerOrchestratorListeners } = require('./orchestrator-listeners');
  const summary = registerOrchestratorListeners({ bus, services: services || {}, logger: log });
  log.info(`[domain-events] Orchestrator listeners wired: ${summary.count}/12 (missing: ${summary.missing.length})`);
} catch (err) {
  log.warn('[domain-events] registerOrchestratorListeners failed (non-fatal):', err.message);
}
```

## 4. Verification (executed locally)

| Check | Expected | Observed |
|-------|----------|----------|
| `node -c orchestrator-listeners.js` | parses | OK |
| `node -c domain-events.js` | parses | OK |
| `bus.stats.subscribers` after init | 17 (5 cross-service + 12 orchestrator) | **17** |
| Total event types registered | >= 22 | **22** |
| All 8 short-form types registered | yes | yes — `quote.approved`, `project.created_from_quote`, `po.created`, `inventory.received_from_po`, `invoice.issued`, `payment.registered`, `attendance.approved`, `payroll.calculated` |
| `bus.auditLog` `subscribe` rows | 17 | **17** |
| `subIds.includes('ai.margin_and_risk_review')` | true | true |
| `publishOrchestratorEvents({ events_emitted: ['quote.approved'] })` | 1 dispatch, 0 failures | 1 dispatch, **0 failures** |
| `bus.auditLog` `publish quote.approved` row | 1 | **1** |
| `summary.missing.length` | 0 | **0** |

## 5. Listener -> event mapping (subscribed)

| # | Listener ID | Event | Priority |
|---|-------------|-------|----------|
| 1 | `ai.margin_and_risk_review` | `quote.approved` | -20 |
| 2 | `ai.generate_project_risk_baseline` | `project.created_from_quote` | -20 |
| 3 | `procurement.prepare_procurement_context` | `project.created_from_quote` | 10 |
| 4 | `ai.assess_supplier_risk` | `po.created` | -20 |
| 5 | `ops.try_allocate_received_stock` | `inventory.received_from_po` | 10 |
| 6 | `ai.check_delivery_anomalies` | `inventory.received_from_po` | -20 |
| 7 | `ai.update_cashflow_forecast` | `invoice.issued` | -20 |
| 8 | `ops.show_project_finance_update` | `invoice.issued` | 10 |
| 9 | `ai.detect_collection_risk_change` | `payment.registered` | -20 |
| 10 | `procurement.consume_labor_cost` | `attendance.approved` | 10 |
| 11 | `procurement.post_labor_cost` | `payroll.calculated` | 10 |
| 12 | `ai.detect_payroll_anomalies` | `payroll.calculated` | -20 |

All 12 declared listeners are now real subscriptions on the in-process EventBus.

## 6. Follow-up (not in this fix)

To complete the choreography end-to-end, `onyx-procurement/src/pipeline/orchestrator.js` should (per AGENT-212 plan section 2.3):

- `require('../wiring/orchestrator-listeners').publishOrchestratorEvents`
- `require('../wiring/domain-events').getEventBus`
- Inside `executeOrchestration`, after building `result`, call `await publishOrchestratorEvents({ bus: getEventBus(), actionResult: result, correlationId: context.correlationId })` and attach the returned summary to the response.

This change is **not** included in this fix; the new module exposes `publishOrchestratorEvents` ready to be imported.

## 7. Notes

- All 12 listeners are subscribed with `async: true` — `publishWithAck` awaits them and surfaces failures via `summary.failures` rather than crashing the orchestrator request.
- AI listeners use negative priority (-20) so operational/procurement reactions (priority 10) finish first; this matches the "fast path then enrichment" pattern.
- Stub services let registration succeed before AI/ops modules are wired — handlers log to debug and never throw.
- Cross-check (`missing` array) is empty, so every orchestrator-declared listener key has a real handler.
- Reuses the existing append-only audit + DLQ semantics in `event-bus.js` — no new persistence path is introduced.
