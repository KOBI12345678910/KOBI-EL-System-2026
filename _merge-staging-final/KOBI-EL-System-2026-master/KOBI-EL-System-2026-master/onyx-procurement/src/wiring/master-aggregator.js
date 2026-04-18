'use strict';

/**
 * master-aggregator.js  —  Agent Y-196
 * --------------------------------------------------------------
 * Techno-Kol Uzi mega-ERP · Master Wiring Aggregator
 *
 * מה זה / What this is:
 *   A pure composition-root that discovers, topologically orders,
 *   instantiates, health-checks and shuts down every registered
 *   module across:
 *     - onyx-ai
 *     - onyx-procurement
 *     - payroll-autonomous
 *     - techno-kol-ops
 *
 *   ≡ No actual imports ≡ — modules register themselves via the
 *   `registerModule({id, factory, dependencies, scope, meta})`
 *   API. The aggregator is pure logic: cycle detection, topo sort,
 *   dep-injection, parallel-ready lifecycle management.
 *
 * עברית:
 *   רכיב שורש-חיבור (Composition Root) שמגלה, ממיין טופולוגית,
 *   מאתחל, בודק בריאות ומכבה כל מודול רשום בכל ארבע התת-מערכות.
 *   ללא Imports ישירים — כל מודול רושם את עצמו עם פקטורי ותלויות.
 *
 * Principles:
 *   1. לא מוחקים רק משדרגים ומגדלים — additive only.
 *   2. Node built-ins only (node:events). No npm dependencies.
 *   3. Bilingual registry — every module owns `{ name: { he, en } }`.
 *   4. Deterministic topo sort (Kahn) with cycle reporting.
 *   5. buildAll / healthCheckAll / shutdown mirror Hexagonal roots.
 *   6. Reverse-order shutdown for safe teardown.
 *
 * Reference shutdown order example:
 *   build order  → [db, cache, auth, billing, api]
 *   teardown     → [api, billing, auth, cache, db]
 */

const { EventEmitter } = require('node:events');

// ──────────────────────────────────────────────────────────────
// Known scopes (enum-like, readonly)
// ──────────────────────────────────────────────────────────────

const SCOPES = Object.freeze({
  ONYX_AI: 'onyx-ai',
  ONYX_PROCUREMENT: 'onyx-procurement',
  PAYROLL_AUTONOMOUS: 'payroll-autonomous',
  TECHNO_KOL_OPS: 'techno-kol-ops',
});

const KNOWN_SCOPES = Object.freeze(Object.values(SCOPES));

// ──────────────────────────────────────────────────────────────
// Lifecycle states
// ──────────────────────────────────────────────────────────────

const STATE = Object.freeze({
  REGISTERED: 'registered',
  BUILDING: 'building',
  BUILT: 'built',
  HEALTHY: 'healthy',
  UNHEALTHY: 'unhealthy',
  SHUTTING_DOWN: 'shutting_down',
  STOPPED: 'stopped',
  FAILED: 'failed',
});

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function assertBilingual(value, path) {
  if (!isPlainObject(value)) {
    throw new TypeError(`${path}: expected { he, en } object`);
  }
  if (!isNonEmptyString(value.he)) {
    throw new TypeError(`${path}.he: expected non-empty Hebrew string`);
  }
  if (!isNonEmptyString(value.en)) {
    throw new TypeError(`${path}.en: expected non-empty English string`);
  }
}

function freezeCopy(obj) {
  return Object.freeze(JSON.parse(JSON.stringify(obj)));
}

// ──────────────────────────────────────────────────────────────
// Main class
// ──────────────────────────────────────────────────────────────

/**
 * MasterAggregator — composition root.
 *
 * Emits events:
 *   'module:registered' (entry)
 *   'module:built'      ({ id, instance })
 *   'module:failed'     ({ id, error, phase })
 *   'module:healthy'    ({ id, details })
 *   'module:unhealthy'  ({ id, details })
 *   'module:stopped'    ({ id })
 *   'build:complete'    ({ order })
 *   'shutdown:complete' ({ order })
 */
class MasterAggregator extends EventEmitter {
  constructor(opts = {}) {
    super();
    const options = isPlainObject(opts) ? opts : {};
    this._strictScopes = options.strictScopes !== false;
    this._logger = options.logger || null;
    this._registry = new Map();      // id -> entry
    this._instances = new Map();     // id -> built instance
    this._buildOrder = [];           // deterministic order once built
    this._state = 'idle';            // 'idle' | 'built' | 'stopped'
    this._health = new Map();        // id -> last health record
  }

  // ──────────────────────────────────────────────────────
  // Registration
  // ──────────────────────────────────────────────────────

  /**
   * Register a module.
   * @param {Object} spec
   * @param {string} spec.id                 Unique identifier.
   * @param {Function} spec.factory          (ctx, deps) => instance | Promise<instance>
   * @param {string[]} [spec.dependencies]   IDs of prerequisites.
   * @param {string} [spec.scope]            Owning sub-system.
   * @param {{he: string, en: string}} [spec.name]        Bilingual title.
   * @param {{he: string, en: string}} [spec.description] Bilingual description.
   * @param {Function} [spec.healthCheck]    (instance, ctx) => {ok, details?}
   * @param {Function} [spec.shutdown]       (instance, ctx) => void | Promise<void>
   * @param {Object}   [spec.meta]           Free-form metadata.
   */
  registerModule(spec) {
    if (!isPlainObject(spec)) {
      throw new TypeError('registerModule: spec must be an object');
    }
    const {
      id,
      factory,
      dependencies = [],
      scope,
      name,
      description,
      healthCheck,
      shutdown,
      meta = {},
    } = spec;

    if (!isNonEmptyString(id)) {
      throw new TypeError('registerModule: id must be a non-empty string');
    }
    if (typeof factory !== 'function') {
      throw new TypeError(`registerModule(${id}): factory must be a function`);
    }
    if (!Array.isArray(dependencies)) {
      throw new TypeError(`registerModule(${id}): dependencies must be an array`);
    }
    for (const dep of dependencies) {
      if (!isNonEmptyString(dep)) {
        throw new TypeError(`registerModule(${id}): each dependency must be a non-empty string`);
      }
      if (dep === id) {
        throw new RangeError(`registerModule(${id}): a module may not depend on itself`);
      }
    }
    if (this._registry.has(id)) {
      throw new RangeError(`registerModule: duplicate id "${id}"`);
    }
    if (scope !== undefined) {
      if (!isNonEmptyString(scope)) {
        throw new TypeError(`registerModule(${id}): scope must be a string`);
      }
      if (this._strictScopes && !KNOWN_SCOPES.includes(scope)) {
        throw new RangeError(
          `registerModule(${id}): unknown scope "${scope}". ` +
          `Known: ${KNOWN_SCOPES.join(', ')}`,
        );
      }
    }
    if (name !== undefined) assertBilingual(name, `registerModule(${id}).name`);
    if (description !== undefined) assertBilingual(description, `registerModule(${id}).description`);
    if (healthCheck !== undefined && typeof healthCheck !== 'function') {
      throw new TypeError(`registerModule(${id}): healthCheck must be a function`);
    }
    if (shutdown !== undefined && typeof shutdown !== 'function') {
      throw new TypeError(`registerModule(${id}): shutdown must be a function`);
    }
    if (!isPlainObject(meta)) {
      throw new TypeError(`registerModule(${id}): meta must be an object`);
    }

    const entry = {
      id,
      factory,
      dependencies: Object.freeze([...dependencies]),
      scope: scope || null,
      name: name ? Object.freeze({ he: name.he, en: name.en }) : {
        he: id,
        en: id,
      },
      description: description
        ? Object.freeze({ he: description.he, en: description.en })
        : null,
      healthCheck: healthCheck || null,
      shutdown: shutdown || null,
      meta: freezeCopy(meta),
      state: STATE.REGISTERED,
      registeredAt: Date.now(),
    };

    this._registry.set(id, entry);
    this._state = 'idle';
    this._buildOrder = [];
    this.emit('module:registered', { id, scope: entry.scope });
    return this;
  }

  /**
   * Bulk register.
   * @param {Array<Object>} specs
   */
  registerAll(specs) {
    if (!Array.isArray(specs)) {
      throw new TypeError('registerAll: specs must be an array');
    }
    for (const s of specs) this.registerModule(s);
    return this;
  }

  // ──────────────────────────────────────────────────────
  // Introspection
  // ──────────────────────────────────────────────────────

  hasModule(id) { return this._registry.has(id); }
  moduleCount() { return this._registry.size; }
  listIds()     { return [...this._registry.keys()]; }

  /**
   * Bilingual registry snapshot.
   * @returns {{he: Array, en: Array, byId: Object, byScope: Object}}
   */
  bilingualRegistry() {
    const he = [];
    const en = [];
    const byId = {};
    const byScope = {};
    for (const entry of this._registry.values()) {
      he.push({
        id: entry.id,
        שם: entry.name.he,
        תחום: entry.scope || 'גלובלי',
        תלויות: [...entry.dependencies],
      });
      en.push({
        id: entry.id,
        name: entry.name.en,
        scope: entry.scope || 'global',
        dependencies: [...entry.dependencies],
      });
      byId[entry.id] = {
        scope: entry.scope,
        name: entry.name,
        description: entry.description,
        dependencies: [...entry.dependencies],
      };
      const scopeKey = entry.scope || 'global';
      if (!byScope[scopeKey]) byScope[scopeKey] = [];
      byScope[scopeKey].push(entry.id);
    }
    return { he, en, byId, byScope };
  }

  // ──────────────────────────────────────────────────────
  // Graph resolution (Kahn's algorithm)
  // ──────────────────────────────────────────────────────

  /**
   * Resolve the dependency graph into a deterministic topological order.
   * Detects and reports cycles and missing dependencies.
   * @returns {{ order: string[], cycles: string[][], missing: Array<{from: string, to: string}> }}
   */
  resolveGraph() {
    const ids = [...this._registry.keys()].sort(); // deterministic
    const indeg = new Map();
    const adj = new Map();            // dep -> [dependents]
    const missing = [];

    for (const id of ids) {
      indeg.set(id, 0);
      adj.set(id, []);
    }
    for (const id of ids) {
      const entry = this._registry.get(id);
      for (const dep of entry.dependencies) {
        if (!this._registry.has(dep)) {
          missing.push({ from: id, to: dep });
          continue;
        }
        adj.get(dep).push(id);
        indeg.set(id, indeg.get(id) + 1);
      }
    }

    // Kahn — take alphabetically smallest ready node each step for determinism
    const order = [];
    const ready = ids.filter((id) => indeg.get(id) === 0).sort();
    while (ready.length > 0) {
      const id = ready.shift();
      order.push(id);
      for (const next of adj.get(id)) {
        indeg.set(next, indeg.get(next) - 1);
        if (indeg.get(next) === 0) {
          // Insert sorted for determinism
          let i = 0;
          while (i < ready.length && ready[i] < next) i++;
          ready.splice(i, 0, next);
        }
      }
    }

    // Remaining nodes ⇒ part of one or more cycles
    const remaining = ids.filter((id) => !order.includes(id) &&
      !missing.some((m) => m.from === id && !this._registry.has(m.to)));
    const cycles = remaining.length > 0 ? this._extractCycles(remaining) : [];

    return { order, cycles, missing };
  }

  /**
   * Extract cycles via Tarjan-style SCC over the leftover sub-graph.
   * @private
   */
  _extractCycles(remainingIds) {
    const inSet = new Set(remainingIds);
    const adj = new Map();
    for (const id of remainingIds) {
      adj.set(id, this._registry.get(id).dependencies.filter((d) => inSet.has(d)));
    }

    let index = 0;
    const indices = new Map();
    const lowlink = new Map();
    const stack = [];
    const onStack = new Set();
    const sccs = [];

    const strongconnect = (v) => {
      indices.set(v, index);
      lowlink.set(v, index);
      index += 1;
      stack.push(v);
      onStack.add(v);
      for (const w of adj.get(v)) {
        if (!indices.has(w)) {
          strongconnect(w);
          lowlink.set(v, Math.min(lowlink.get(v), lowlink.get(w)));
        } else if (onStack.has(w)) {
          lowlink.set(v, Math.min(lowlink.get(v), indices.get(w)));
        }
      }
      if (lowlink.get(v) === indices.get(v)) {
        const comp = [];
        while (true) {
          const w = stack.pop();
          onStack.delete(w);
          comp.push(w);
          if (w === v) break;
        }
        // Keep SCCs with ≥2 nodes OR a self-loop (already refused at register time,
        // but still defensive).
        if (comp.length > 1) sccs.push(comp.sort());
      }
    };

    for (const v of remainingIds) {
      if (!indices.has(v)) strongconnect(v);
    }
    // Sort cycles for determinism
    sccs.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    return sccs;
  }

  // ──────────────────────────────────────────────────────
  // Build lifecycle
  // ──────────────────────────────────────────────────────

  /**
   * Instantiate every module in topo order. Earlier deps are passed into
   * the factory of each module under the second argument `deps`.
   * @param {Object} ctx Shared context forwarded to every factory.
   * @returns {Promise<Map<string, *>>}
   */
  async buildAll(ctx = {}) {
    const { order, cycles, missing } = this.resolveGraph();
    if (missing.length > 0) {
      const desc = missing.map((m) => `${m.from} -> ${m.to}`).join(', ');
      throw new Error(`MasterAggregator.buildAll: missing dependencies: ${desc}`);
    }
    if (cycles.length > 0) {
      const desc = cycles.map((c) => c.join(' -> ') + ' -> ' + c[0]).join(' | ');
      const err = new Error(`MasterAggregator.buildAll: cycle detected: ${desc}`);
      err.cycles = cycles;
      throw err;
    }

    // Fresh build: clear any previous instances (never deletes registrations)
    this._instances.clear();
    this._buildOrder = [];
    this._health.clear();

    for (const id of order) {
      const entry = this._registry.get(id);
      entry.state = STATE.BUILDING;
      try {
        const depInstances = {};
        for (const depId of entry.dependencies) {
          depInstances[depId] = this._instances.get(depId);
        }
        const result = await entry.factory(ctx, depInstances);
        this._instances.set(id, result);
        entry.state = STATE.BUILT;
        this._buildOrder.push(id);
        this.emit('module:built', { id, instance: result });
      } catch (err) {
        entry.state = STATE.FAILED;
        this.emit('module:failed', { id, error: err, phase: 'build' });
        const wrapped = new Error(
          `MasterAggregator.buildAll: factory of "${id}" threw: ${err.message}`,
        );
        wrapped.cause = err;
        wrapped.moduleId = id;
        throw wrapped;
      }
    }

    this._state = 'built';
    this.emit('build:complete', { order: [...this._buildOrder] });
    return this._instances;
  }

  getInstance(id) {
    if (!this._instances.has(id)) {
      throw new RangeError(`MasterAggregator.getInstance: "${id}" has not been built`);
    }
    return this._instances.get(id);
  }

  getBuildOrder() {
    return [...this._buildOrder];
  }

  // ──────────────────────────────────────────────────────
  // Health
  // ──────────────────────────────────────────────────────

  /**
   * Run every module's `healthCheck(instance, ctx)`.
   * Missing health checks default to `{ok: true, details: {skipped: true}}`.
   * @returns {Promise<{ok: boolean, results: Array}>}
   */
  async healthCheckAll(ctx = {}) {
    if (this._state !== 'built') {
      throw new Error('MasterAggregator.healthCheckAll: call buildAll() first');
    }
    const results = [];
    let okAll = true;
    for (const id of this._buildOrder) {
      const entry = this._registry.get(id);
      const instance = this._instances.get(id);
      let record;
      if (!entry.healthCheck) {
        record = { id, ok: true, skipped: true, details: null };
      } else {
        try {
          const out = await entry.healthCheck(instance, ctx);
          if (!isPlainObject(out)) {
            record = { id, ok: false, error: 'healthCheck did not return an object' };
          } else {
            record = {
              id,
              ok: out.ok !== false,
              skipped: false,
              details: out.details || null,
            };
          }
        } catch (err) {
          record = { id, ok: false, error: err.message || String(err) };
        }
      }
      entry.state = record.ok ? STATE.HEALTHY : STATE.UNHEALTHY;
      this._health.set(id, record);
      this.emit(record.ok ? 'module:healthy' : 'module:unhealthy', {
        id,
        details: record,
      });
      if (!record.ok) okAll = false;
      results.push(record);
    }
    return { ok: okAll, results };
  }

  getHealth(id) {
    return this._health.get(id) || null;
  }

  // ──────────────────────────────────────────────────────
  // Shutdown (reverse order)
  // ──────────────────────────────────────────────────────

  /**
   * Tear down every built module in the reverse of build order.
   * Errors are collected; every module gets a chance to stop.
   * @param {Object} ctx
   * @returns {Promise<{ok: boolean, errors: Array, order: string[]}>}
   */
  async shutdown(ctx = {}) {
    if (this._buildOrder.length === 0) {
      return { ok: true, errors: [], order: [] };
    }
    const reverse = [...this._buildOrder].reverse();
    const errors = [];
    for (const id of reverse) {
      const entry = this._registry.get(id);
      entry.state = STATE.SHUTTING_DOWN;
      const instance = this._instances.get(id);
      if (entry.shutdown) {
        try {
          await entry.shutdown(instance, ctx);
        } catch (err) {
          errors.push({ id, error: err.message || String(err) });
          this.emit('module:failed', { id, error: err, phase: 'shutdown' });
        }
      }
      entry.state = STATE.STOPPED;
      this.emit('module:stopped', { id });
    }
    this._instances.clear();
    const done = [...reverse];
    this._buildOrder = [];
    this._state = 'stopped';
    this.emit('shutdown:complete', { order: done });
    return { ok: errors.length === 0, errors, order: done };
  }

  // ──────────────────────────────────────────────────────
  // Bilingual summary report
  // ──────────────────────────────────────────────────────

  /**
   * Render a bilingual human-readable summary string (HE + EN).
   */
  renderBilingualReport() {
    const reg = this.bilingualRegistry();
    const graph = this._registry.size > 0 ? this.resolveGraph() : { order: [], cycles: [], missing: [] };
    const lines = [];
    lines.push('── Master Aggregator · שורש חיבור ראשי ──');
    lines.push(`HE: סך הכל מודולים רשומים: ${this._registry.size}`);
    lines.push(`EN: Total registered modules: ${this._registry.size}`);
    lines.push(`HE: סדר בנייה (Topo): ${graph.order.join(' → ') || '—'}`);
    lines.push(`EN: Build order (topo): ${graph.order.join(' → ') || '—'}`);
    if (graph.cycles.length > 0) {
      lines.push(`HE: זוהו מעגלים: ${graph.cycles.length}`);
      lines.push(`EN: Cycles detected: ${graph.cycles.length}`);
    }
    if (graph.missing.length > 0) {
      lines.push(`HE: תלויות חסרות: ${graph.missing.length}`);
      lines.push(`EN: Missing dependencies: ${graph.missing.length}`);
    }
    for (const scope of Object.keys(reg.byScope).sort()) {
      lines.push(`  · ${scope}: ${reg.byScope[scope].length} module(s)`);
    }
    return lines.join('\n');
  }
}

// ──────────────────────────────────────────────────────────────
// Factory (tree-shake-friendly alternative to `new`)
// ──────────────────────────────────────────────────────────────

function createAggregator(opts) {
  return new MasterAggregator(opts);
}

// ──────────────────────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────────────────────

module.exports = {
  MasterAggregator,
  createAggregator,
  SCOPES,
  KNOWN_SCOPES,
  STATE,
};
