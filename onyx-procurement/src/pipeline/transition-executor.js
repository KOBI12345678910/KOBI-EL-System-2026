// onyx-procurement/src/pipeline/transition-executor.js
//
// AGENT-211 — State-Machine Transition Executor
//
// Provides POST /api/state-machines/:type/transition — the executor that
// actually mutates an entity's status, fires declarative triggers from
// state-machines.js, notifies listeners, and records an audit entry.
//
// Per AGENTS-16/31, every "button-press" in a 360 page must funnel
// through this single endpoint so audit, events, and listeners stay
// consistent.
//
// Pluggable adapters: in-memory defaults are wired by default. Production
// callers inject real adapters via registerTransitionExecutor(app, opts):
//   { repo, eventBus, audit, guards }
'use strict';

const crypto = require('crypto');
const {
  STATE_MACHINES,
  canTransition,
  getTriggersForTransition,
} = require('./state-machines');

// ─── 1. Pluggable adapters ──────────────────────────────────────────
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

// ─── 2. Core executor ───────────────────────────────────────────────
async function executeTransition(deps, params) {
  const { repo, eventBus, audit, guards } = deps;
  const { type, id, transition, actor, reason, metadata, expectedVersion } = params;

  // (0) Input validation
  if (!type || !id || !transition) {
    return {
      http: 400,
      body: {
        ok: false,
        code: 'BAD_REQUEST',
        message: 'type, id, transition are required',
      },
    };
  }
  if (!STATE_MACHINES[type]) {
    return {
      http: 404,
      body: {
        ok: false,
        code: 'UNKNOWN_ENTITY_TYPE',
        message: `No state machine for "${type}"`,
      },
    };
  }

  // (1) Lookup
  const entity = await repo.findById(type, id);
  if (!entity) {
    return {
      http: 404,
      body: {
        ok: false,
        code: 'ENTITY_NOT_FOUND',
        message: `${type} ${id} not found`,
      },
    };
  }
  const fromStatus = entity.status;

  // (2) State-machine validation
  const check = canTransition(type, fromStatus, transition);
  if (!check.allowed) {
    return {
      http: 409,
      body: {
        ok: false,
        code: 'ILLEGAL_TRANSITION',
        message: check.reason,
        fromStatus,
        transition,
      },
    };
  }
  const toStatus = check.nextStatus;

  // (3) Custom precondition guard (canTransition + business rule)
  const guardKey = `${type}.${transition}`;
  const guard = guards[guardKey];
  if (guard) {
    const g = await guard(entity, params);
    if (!g.ok) {
      return {
        http: 412,
        body: {
          ok: false,
          code: 'PRECONDITION_FAILED',
          message: g.reason,
          guard: guardKey,
        },
      };
    }
  }

  // (4) Persist (optimistic-lock on version)
  let updated;
  try {
    updated = await repo.updateStatus(type, id, fromStatus, toStatus, expectedVersion);
  } catch (err) {
    const code = String(err.message) === 'ENTITY_LOCKED' ? 'ENTITY_LOCKED' : 'PERSIST_FAILED';
    return {
      http: code === 'ENTITY_LOCKED' ? 423 : 500,
      body: { ok: false, code, message: String(err.message || err) },
    };
  }

  // (5) Build canonical transition record
  const occurredAt = new Date().toISOString();
  const record = {
    entityType: type,
    entityId: id,
    fromStatus,
    toStatus,
    transition,
    occurredAt,
    actor: actor || null,
    reason: reason || null,
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

// ─── 3. Express route registration ──────────────────────────────────
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
        ok: false,
        code: 'INTERNAL_ERROR',
        message: String(err.message || err),
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
  memoryRepo,
  memoryEventBus,
  memoryAudit,
  defaultGuards,
};
