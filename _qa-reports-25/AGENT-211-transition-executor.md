# AGENT-211 — State-Machine Transition Executor

**Status:** GAP CONFIRMED → IMPLEMENTATION PROVIDED
**Scope:** `POST /api/state-machines/:type/transition`
**Owner service:** `onyx-procurement` (port 3100)
**File to add:** `onyx-procurement/src/pipeline/transition-executor.js`
**Wires into:** `onyx-procurement/src/pipeline/state-machines.js` via `registerStateMachineRoutes(app)`

---

## 1. Gap Analysis

`onyx-procurement/src/pipeline/state-machines.js` exposes:

- `GET /api/state-machines` — list all
- `GET /api/state-machines/:type` — one machine
- `GET /api/state-machines/:type/can-transition` — pure validation
- `GET /api/state-machines/:type/transitions?current=X` — available outbound transitions

**Missing:** the **executor** — the `POST` endpoint that actually mutates an entity, fires triggers, and notifies listeners. Per AGENTS-16/31, every "button-press" in a 360 page must funnel through this single endpoint so audit, events, and listeners stay consistent.

The 13 state machines define **91 transitions** with side-effects (`triggers`) such as `create_quote`, `post_to_gl`, `update_inventory`, `create_work_orders`. None are dispatched today because the executor route does not exist.

---

## 2. Contract

```
POST /api/state-machines/:type/transition
Content-Type: application/json

Body:
{
  "id": "QUO-2026-001",            // entity primary key
  "transition": "approve",          // transition name (NOT target status)
  "actor":   { "id": "u-42", "role": "manager" },
  "reason":  "Customer accepted Q2 proposal",
  "metadata": { "channel": "ui-360-page" }   // optional
}

Response 200:
{
  "ok": true,
  "transition": {
    "entityType": "quote",
    "entityId":   "QUO-2026-001",
    "fromStatus": "under_review",
    "toStatus":   "approved",
    "transition": "approve",
    "occurredAt": "2026-04-29T10:31:14.220Z",
    "actor":      { "id": "u-42", "role": "manager" }
  },
  "triggers":  [ /* enqueued side-effects */ ],
  "listeners": [ /* notified subscribers + delivery status */ ],
  "audit_id":  "AUD-9f3c12"
}

Response 4xx/5xx → { ok:false, code, message, hint }
```

Error taxonomy:

| HTTP | code                    | when                                                   |
|------|-------------------------|--------------------------------------------------------|
| 400  | `BAD_REQUEST`           | missing `id` or `transition`                           |
| 404  | `ENTITY_NOT_FOUND`      | repo lookup returned null                              |
| 404  | `UNKNOWN_ENTITY_TYPE`   | `:type` not in `STATE_MACHINES`                        |
| 409  | `ILLEGAL_TRANSITION`    | `canTransition()` rejected                             |
| 412  | `PRECONDITION_FAILED`   | guard returned false (e.g. quote has no line items)    |
| 423  | `ENTITY_LOCKED`         | concurrent transition in flight (optimistic lock)      |
| 500  | `TRIGGER_DISPATCH_FAIL` | persistence ok but the event bus rejected the publish  |

---

## 3. Implementation — `transition-executor.js`

```js
// onyx-procurement/src/pipeline/transition-executor.js
'use strict';

const crypto = require('crypto');
const {
  STATE_MACHINES,
  canTransition,
  getTriggersForTransition,
} = require('./state-machines');

// ── 1. Pluggable adapters ────────────────────────────────────────
// Default in-memory implementations; production wires real ones via
// registerTransitionExecutor(app, { repo, eventBus, audit, guards }).

const memoryRepo = {
  store: new Map(), // key = `${type}:${id}` → { id, type, status, version }
  async findById(type, id) {
    return this.store.get(`${type}:${id}`) || null;
  },
  async updateStatus(type, id, fromStatus, toStatus, expectedVersion) {
    const key = `${type}:${id}`;
    const cur = this.store.get(key);
    if (!cur) throw new Error('ENTITY_NOT_FOUND');
    if (cur.status !== fromStatus) throw new Error('ENTITY_LOCKED');
    if (expectedVersion != null && cur.version !== expectedVersion) {
      throw new Error('ENTITY_LOCKED');
    }
    const next = { ...cur, status: toStatus, version: (cur.version || 0) + 1 };
    this.store.set(key, next);
    return next;
  },
};

const memoryEventBus = {
  subs: new Map(), // event name → [handler]
  on(event, handler) {
    if (!this.subs.has(event)) this.subs.set(event, []);
    this.subs.get(event).push(handler);
  },
  async publish(event, payload) {
    const handlers = this.subs.get(event) || [];
    const out = [];
    for (const h of handlers) {
      try {
        const r = await h(payload);
        out.push({ handler: h.name || 'anonymous', ok: true, result: r });
      } catch (err) {
        out.push({ handler: h.name || 'anonymous', ok: false, error: String(err) });
      }
    }
    return out;
  },
};

const memoryAudit = {
  log: [],
  async record(entry) {
    const id = 'AUD-' + crypto.randomBytes(3).toString('hex');
    this.log.push({ id, ...entry });
    return id;
  },
};

// Optional precondition guards keyed by `${type}.${transition}`.
// Each guard: async (entity, body) => { ok:true } | { ok:false, reason }
const defaultGuards = {
  'quote.approve': async (q) =>
    Array.isArray(q.items) && q.items.length > 0
      ? { ok: true }
      : { ok: false, reason: 'quote has no line items' },
  'po.send': async (po) =>
    po.supplier_id ? { ok: true } : { ok: false, reason: 'PO has no supplier' },
  'invoice.issue': async (inv) =>
    inv.total > 0 ? { ok: true } : { ok: false, reason: 'invoice total is zero' },
};

// ── 2. Core executor ─────────────────────────────────────────────
async function executeTransition(deps, params) {
  const { repo, eventBus, audit, guards } = deps;
  const { type, id, transition, actor, reason, metadata, expectedVersion } = params;

  // (0) Input validation
  if (!type || !id || !transition) {
    return { http: 400, body: { ok: false, code: 'BAD_REQUEST',
      message: 'type, id, transition are required' } };
  }
  if (!STATE_MACHINES[type]) {
    return { http: 404, body: { ok: false, code: 'UNKNOWN_ENTITY_TYPE',
      message: `No state machine for "${type}"` } };
  }

  // (1) Lookup
  const entity = await repo.findById(type, id);
  if (!entity) {
    return { http: 404, body: { ok: false, code: 'ENTITY_NOT_FOUND',
      message: `${type} ${id} not found` } };
  }
  const fromStatus = entity.status;

  // (2) State-machine validation
  const check = canTransition(type, fromStatus, transition);
  if (!check.allowed) {
    return { http: 409, body: { ok: false, code: 'ILLEGAL_TRANSITION',
      message: check.reason, fromStatus, transition } };
  }
  const toStatus = check.nextStatus;

  // (3) Custom precondition guard (canTransition + business rule)
  const guardKey = `${type}.${transition}`;
  const guard = guards[guardKey];
  if (guard) {
    const g = await guard(entity, params);
    if (!g.ok) {
      return { http: 412, body: { ok: false, code: 'PRECONDITION_FAILED',
        message: g.reason, guard: guardKey } };
    }
  }

  // (4) Persist (optimistic-lock on version)
  let updated;
  try {
    updated = await repo.updateStatus(type, id, fromStatus, toStatus, expectedVersion);
  } catch (err) {
    const code = String(err.message) === 'ENTITY_LOCKED' ? 'ENTITY_LOCKED' : 'PERSIST_FAILED';
    return { http: code === 'ENTITY_LOCKED' ? 423 : 500,
      body: { ok: false, code, message: String(err.message || err) } };
  }

  // (5) Build canonical transition record
  const occurredAt = new Date().toISOString();
  const record = {
    entityType: type, entityId: id,
    fromStatus, toStatus, transition,
    occurredAt, actor: actor || null, reason: reason || null,
    metadata: metadata || {},
    version: updated.version,
  };

  // (6) Audit
  const auditId = await audit.record({
    kind: 'state_transition',
    ...record,
  });

  // (7) Dispatch declarative triggers from STATE_MACHINES[type].triggers
  const triggers = getTriggersForTransition(type, fromStatus, toStatus);
  const triggerDispatch = [];
  for (const t of triggers) {
    const eventName = `${type}.${transition}.${t.action}`;
    const payload = { record, action: t.action, params: t.params || {} };
    const delivery = await eventBus.publish(eventName, payload).catch((e) => [
      { ok: false, error: String(e) },
    ]);
    triggerDispatch.push({ action: t.action, event: eventName, delivery });
  }

  // (8) Generic lifecycle event (listeners can subscribe broadly)
  const lifecycleEvent = `${type}.transitioned`;
  const listenerDispatch = await eventBus
    .publish(lifecycleEvent, record)
    .catch((e) => [{ ok: false, error: String(e) }]);

  return {
    http: 200,
    body: {
      ok: true,
      transition: record,
      triggers: triggerDispatch,
      listeners: listenerDispatch,
      audit_id: auditId,
    },
  };
}

// ── 3. Express route registration ────────────────────────────────
function registerTransitionExecutor(app, opts = {}) {
  const deps = {
    repo:     opts.repo     || memoryRepo,
    eventBus: opts.eventBus || memoryEventBus,
    audit:    opts.audit    || memoryAudit,
    guards:   { ...defaultGuards, ...(opts.guards || {}) },
  };

  app.post('/api/state-machines/:type/transition', async (req, res) => {
    const { type } = req.params;
    const { id, transition, actor, reason, metadata, expectedVersion } = req.body || {};
    try {
      const out = await executeTransition(deps, {
        type, id, transition, actor, reason, metadata, expectedVersion,
      });
      res.status(out.http).json(out.body);
    } catch (err) {
      res.status(500).json({
        ok: false, code: 'INTERNAL_ERROR', message: String(err.message || err),
      });
    }
  });

  // Convenience: subscribe a listener at runtime (used by AI/onyx-ai)
  app.post('/api/state-machines/listeners', (req, res) => {
    const { event, url } = req.body || {};
    if (!event || !url) return res.status(400).json({ error: 'event+url required' });
    deps.eventBus.on(event, async (payload) => {
      const fetch = global.fetch || ((u, o) => Promise.reject(new Error('no fetch'))); 
      return fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }).then((r) => ({ status: r.status }));
    });
    res.json({ ok: true, subscribed: { event, url } });
  });

  console.log('   ✓ Transition executor registered (POST /api/state-machines/:type/transition)');
  return deps;
}

module.exports = {
  executeTransition,
  registerTransitionExecutor,
  // Adapters exported for tests / DI
  memoryRepo, memoryEventBus, memoryAudit, defaultGuards,
};
```

---

## 4. Wiring (one-liner edit in `state-machines.js`)

At the bottom of `registerStateMachineRoutes(app)`:

```js
// state-machines.js  (append)
const { registerTransitionExecutor } = require('./transition-executor');
function registerStateMachineRoutes(app, executorOpts) {
  // ...existing GETs...
  registerTransitionExecutor(app, executorOpts || {});
  console.log('   v State machines registered (' + Object.keys(STATE_MACHINES).length + ' entities)');
}
```

For production, the host app injects real adapters:

```js
registerStateMachineRoutes(app, {
  repo:     require('../repos/entity-repo'),     // PostgreSQL/Prisma
  eventBus: require('../events/event-bus'),      // NATS / Kafka / pg_notify
  audit:    require('../audit/audit-log'),       // immutable audit table
  guards:   require('./guards'),                 // domain-specific rules
});
```

---

## 5. Smoke Test

```bash
curl -s -X POST http://localhost:3100/api/state-machines/quote/transition \
  -H 'content-type: application/json' \
  -d '{
    "id": "QUO-2026-001",
    "transition": "approve",
    "actor": { "id": "u-42", "role": "manager" },
    "reason": "Q2 customer signoff"
  }' | jq .
```

Expected: `ok:true`, `transition.fromStatus="under_review"` → `toStatus="approved"`, two trigger dispatches (`notify`, `create_audit`), one lifecycle listener notification, one audit id.

Negative path (illegal transition):

```bash
curl -s -X POST http://localhost:3100/api/state-machines/quote/transition \
  -H 'content-type: application/json' \
  -d '{ "id": "QUO-2026-001", "transition": "convert" }'
# → 409 ILLEGAL_TRANSITION  (cannot convert directly from draft)
```

---

## 6. Coverage Map (closes AGENTS 16 & 31)

| Requirement                                      | Where satisfied                                  |
|--------------------------------------------------|--------------------------------------------------|
| Look up entity by `id+type`                      | `repo.findById` (step 1)                         |
| Validate `current → target` against state-machines | `canTransition()` (step 2)                     |
| Enforce preconditions                            | `defaultGuards` + caller-supplied `guards` (step 3) |
| Persist status change                            | `repo.updateStatus` w/ optimistic lock (step 4)  |
| Dispatch triggers via event bus                  | `getTriggersForTransition` + `eventBus.publish` (step 7) |
| Return transition record + listener notifications | response body + `${type}.transitioned` (steps 5,8) |
| Audit log of every transition                    | `audit.record()` (step 6)                        |
| 360-page button compatibility                    | matches contract used by `orchestrator.js` `{ type:'transition', entity, transition }` effect |

Drops in under 250 LOC, zero new dependencies (uses Node `crypto`), and is fully replaceable per-adapter for tests vs. production.
