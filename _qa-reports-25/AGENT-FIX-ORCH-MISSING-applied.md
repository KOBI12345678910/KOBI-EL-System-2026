# AGENT-FIX-ORCH-MISSING — Applied

**Date:** 2026-04-29
**Scope:** Close 6 silently-failing 360 button paths surfaced by the Master Flow E2E audit.

## What changed

### `onyx-procurement/src/pipeline/orchestrator.js`
Added 6 new actions following the existing schema (key, label_he, entity_type, preconditions, effects, events, listeners, navigate). Existing 20 ORCHESTRATIONS untouched.

| Key | entity_type | preconditions | events |
|---|---|---|---|
| `order.create` | sales_order | entity_exists, status_in:['confirmed'] | sales_order.converted_to_project |
| `order.cancel` | sales_order | entity_exists, status_in:['draft','confirmed'] | sales_order.cancelled |
| `project.create_rfq` | project | entity_exists, status_in:['in_planning','in_procurement'] | rfq.created_from_project |
| `delivery.confirm` | delivery | entity_exists, status_in:['in_transit','pending'] | delivery.confirmed |
| `delivery.issue_invoice` | delivery | entity_exists, status_in:['delivered'] | invoice.issued_from_delivery |
| `project.close` | project | entity_exists, status_in:['completed','in_delivery'], all_invoices_paid | project.closed |

### `onyx-procurement/src/pipeline/state-machines.js`
Added the missing `delivery` state machine (pending → in_transit → delivered → invoiced; failed/cancelled finals) with triggers and Hebrew badges. The other 4 transitions were already present and were just confirmed:
- `sales_order: confirmed → cancelled` (transition `cancel`) — already existed
- `sales_order: confirmed → in_production` (transition `start_production`) — already existed
- `project: completed → closed` (transition `close`) — already existed
- `invoice: draft → issued` (transition `issue`) — already existed

## Verification

```
$ node --check onyx-procurement/src/pipeline/orchestrator.js
$ node --check onyx-procurement/src/pipeline/state-machines.js
SYNTAX_OK

$ node -e "..."
missing: 0 []
total actions: 26
delivery state machine present: true
delivery: in_transit->delivered: {"allowed":true,"nextStatus":"delivered"}
delivery: pending->delivered:    {"allowed":true,"nextStatus":"delivered"}
sales_order: confirmed->cancelled:    {"allowed":true,"nextStatus":"cancelled"}
sales_order: confirmed->in_production:{"allowed":true,"nextStatus":"in_production"}
project: completed->closed:           {"allowed":true,"nextStatus":"closed"}
invoice: draft->issued:               {"allowed":true,"nextStatus":"issued"}
```

## Smoke verdict

**PASS.** All 6 required keys present, total ORCHESTRATIONS = 26 (was 20, +6), delivery state machine wired, all 5 confirmed/added transitions allowed by `canTransition`. The 360 buttons that previously returned 400 from `POST /api/orchestrator/execute` now resolve to a registered orchestration with a runnable state-machine transition.

## Diff size
- orchestrator.js: +106 LOC
- state-machines.js: +43 LOC
- Total: 149 LOC added (within 250 budget).
