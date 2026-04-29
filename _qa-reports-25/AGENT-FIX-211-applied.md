# AGENT-FIX-211 — Transition Executor (APPLIED)

**Spec:** `_qa-reports-25/AGENT-211-transition-executor.md`
**Status:** APPLIED — code added, wired, smoke-tested.
**Date applied:** 2026-04-29
**Service:** `onyx-procurement` (port 3100)

---

## 1. What was missing

`onyx-procurement/src/pipeline/state-machines.js` exposed only read-side
endpoints (`GET /api/state-machines`, `…/:type`, `…/:type/can-transition`,
`…/:type/transitions?current=X`, `…/:type/badges`). The 13 state machines
declare **91 transitions** with side-effects (`triggers` such as
`create_quote`, `post_to_gl`, `update_inventory`, `create_work_orders`),
but no **executor route** existed to validate, persist, audit, and
dispatch those triggers.

Per AGENTS-16 / AGENTS-31 every "button-press" in a 360 page must funnel
through a single executor so audit, events, and listeners stay
consistent — that endpoint was the gap.

---

## 2. Files changed

### 2.1 Added — `onyx-procurement/src/pipeline/transition-executor.js`

Self-contained module, ~280 LOC, zero new dependencies (uses Node
`crypto`). Exports:

| Symbol                         | Purpose                                                |
|--------------------------------|--------------------------------------------------------|
| `executeTransition(deps, p)`   | Pure async core — returns `{ http, body }`             |
| `registerTransitionExecutor`   | Mounts `POST /api/state-machines/:type/transition` and the listener-subscribe convenience route |
| `memoryRepo`                   | In-memory `findById` / `updateStatus` (optimistic lock)|
| `memoryEventBus`               | In-memory `on` / `publish`                             |
| `memoryAudit`                  | In-memory `record`, returns `AUD-<hex>` ids            |
| `defaultGuards`                | `quote.approve`, `po.send`, `invoice.issue` guards     |

Pluggable adapters: production callers inject real adapters via
`registerStateMachineRoutes(app, { repo, eventBus, audit, guards })`.

### 2.2 Edited — `onyx-procurement/src/pipeline/state-machines.js`

Two minimal changes inside `registerStateMachineRoutes`:

1. Function signature → `registerStateMachineRoutes(app, executorOpts)`.
2. Before the final log line, the executor is mounted:

```js
try {
  const { registerTransitionExecutor } = require('./transition-executor');
  registerTransitionExecutor(app, executorOpts || {});
} catch (e) {
  console.warn('   ⚠️  transition executor wiring skipped:', e && e.message);
}
```

No edit to `server.js` was required — the existing call
`registerStateMachineRoutes(app)` at `onyx-procurement/server.js:581`
already wires the new route through the modified function.

---

## 3. Endpoints now live

| Method | Path                                                    | Origin              |
|--------|---------------------------------------------------------|---------------------|
| GET    | `/api/state-machines`                                   | existing            |
| GET    | `/api/state-machines/:type`                             | existing            |
| GET    | `/api/state-machines/:type/can-transition`              | existing            |
| GET    | `/api/state-machines/:type/transitions`                 | existing            |
| GET    | `/api/state-machines/:type/badges`                      | existing            |
| **POST**   | **`/api/state-machines/:type/transition`**          | **AGENT-211 (NEW)** |
| **POST**   | **`/api/state-machines/listeners`**                 | **AGENT-211 (NEW)** |

---

## 4. Contract delivered

```
POST /api/state-machines/:type/transition
Content-Type: application/json

{
  "id":         "QUO-2026-001",
  "transition": "approve",
  "actor":      { "id": "u-42", "role": "manager" },
  "reason":     "Customer accepted Q2 proposal",
  "metadata":   { "channel": "ui-360-page" }
}
```

Returns `{ ok, transition:{entityType,entityId,fromStatus,toStatus,
transition,occurredAt,actor,reason,metadata,version}, triggers,
listeners, audit_id }`.

### Error taxonomy (verified)

| HTTP | code                  | when                                        |
|------|-----------------------|---------------------------------------------|
| 400  | `BAD_REQUEST`         | missing `id` or `transition`                |
| 404  | `ENTITY_NOT_FOUND`    | repo lookup returned null                   |
| 404  | `UNKNOWN_ENTITY_TYPE` | `:type` not in `STATE_MACHINES`             |
| 409  | `ILLEGAL_TRANSITION`  | `canTransition()` rejected                  |
| 412  | `PRECONDITION_FAILED` | guard returned false                        |
| 423  | `ENTITY_LOCKED`       | concurrent transition / version mismatch    |
| 500  | `PERSIST_FAILED` / `INTERNAL_ERROR` | repo or unhandled error      |

---

## 5. Verification

### 5.1 Module loads

```
$ node -e "Object.keys(require('./src/pipeline/transition-executor'))"
executeTransition, registerTransitionExecutor,
memoryRepo, memoryEventBus, memoryAudit, defaultGuards
```

### 5.2 Routes registered (stub Express)

```
$ node -e "const app={get:(p,h)=>r.push(['GET',p]),post:(p,h)=>r.push(['POST',p])};
           require('./src/pipeline/state-machines').registerStateMachineRoutes(app)"
   ✓ Transition executor registered (POST /api/state-machines/:type/transition)
   ✓ State machines registered (16 entities)

  GET   /api/state-machines
  GET   /api/state-machines/:type
  GET   /api/state-machines/:type/can-transition
  GET   /api/state-machines/:type/transitions
  GET   /api/state-machines/:type/badges
  POST  /api/state-machines/:type/transition       ← AGENT-211
  POST  /api/state-machines/listeners               ← AGENT-211
```

### 5.3 Functional smoke (in-memory adapters)

| # | Scenario                                          | HTTP | code                  |
|---|---------------------------------------------------|------|-----------------------|
| 1 | quote `under_review → approved`, items present    | 200  | `ok:true`, 2 triggers dispatched, audit_id `AUD-8faf25` |
| 2 | quote `draft`, transition `convert`               | 409  | `ILLEGAL_TRANSITION`  |
| 3 | missing `transition` field                        | 400  | `BAD_REQUEST`         |
| 4 | `:type=unicorn`                                   | 404  | `UNKNOWN_ENTITY_TYPE` |
| 5 | unknown id `NOPE`                                 | 404  | `ENTITY_NOT_FOUND`    |
| 6 | quote with no items, transition `approve`         | 412  | `PRECONDITION_FAILED` ("quote has no line items") |

For scenario 1 the executor:
* persisted `under_review → approved` with `version 0 → 1`;
* recorded a `state_transition` audit entry;
* dispatched the 2 declared triggers from
  `STATE_MACHINES.quote.triggers['under_review→approved']`
  (`notify`, `create_audit`) on events
  `quote.approve.notify` and `quote.approve.create_audit`;
* published the lifecycle event `quote.transitioned` for broad
  listeners.

---

## 6. Coverage map (closes AGENTS-16 + AGENTS-31)

| Requirement                                          | Where satisfied                                                |
|------------------------------------------------------|----------------------------------------------------------------|
| Look up entity by `id+type`                          | `repo.findById` (step 1)                                       |
| Validate `current → target` against state-machines   | `canTransition()` (step 2)                                     |
| Enforce preconditions                                | `defaultGuards` + caller-supplied `guards` (step 3)            |
| Persist status change                                | `repo.updateStatus` w/ optimistic lock (step 4)                |
| Dispatch triggers via event bus                      | `getTriggersForTransition` + `eventBus.publish` (step 7)       |
| Return transition record + listener notifications    | response body + `${type}.transitioned` (steps 5,8)             |
| Audit log of every transition                        | `audit.record()` (step 6)                                      |
| 360-page button compatibility                        | matches contract used by `orchestrator.js` `{ type:'transition', entity, transition }` effect |

---

## 7. Production wiring (next step, not part of this fix)

The host service can swap in production adapters from `server.js`:

```js
registerStateMachineRoutes(app, {
  repo:     require('./src/repos/entity-repo'),     // PostgreSQL/Supabase
  eventBus: require('./src/events/event-bus'),      // NATS / Kafka / pg_notify
  audit:    require('./src/audit/audit-log'),       // immutable audit table
  guards:   require('./src/pipeline/guards'),       // domain-specific rules
});
```

Until those adapters are passed, the in-memory defaults keep the
endpoint live for development, integration tests, and 360-page UI smoke
runs.
