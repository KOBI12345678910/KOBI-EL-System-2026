/**
 * Feature Flag System
 * Agent-X98 — Techno-Kol Uzi Mega-ERP
 *
 * Rule: לא מוחקים רק משדרגים ומגדלים (we never delete, only upgrade and grow).
 *
 * Zero external dependencies. Bilingual (Hebrew + English) flag descriptions.
 * Non-destructive — flags can only be added, toggled, or superseded.
 * Audit trail is append-only JSONL on every mutation.
 *
 * Public API (class FeatureFlags):
 *   defineFlag({name, type, default, rules, rolloutPercent, startDate, endDate,
 *               description, description_he})
 *   isEnabled(flagName, context)          -> boolean
 *   evaluate(flagName, context, trace)    -> {enabled, reason, traces?}
 *   setFlag(name, value, actor)           -> audit-logged
 *   getFlag(name)                         -> flag definition (deep copy)
 *   listFlags()                           -> flag[]
 *   bucketUser(userId, flagName)          -> 0..99 (sticky, FNV-1a based)
 *   exportState()                         -> {flags, meta}
 *   importState(state)                    -> merges; never deletes existing flags
 *   express()                             -> middleware; attaches req.flags
 *
 * Flag types:
 *   'boolean'   — on/off everywhere (default)
 *   'rollout'   — percentage rollout 0..100 (sticky per-user)
 *   'user-list' — allowlist via rules.attributes.userId in [...]
 *   'attribute' — AND/OR tree on context attributes
 *   'schedule'  — gated by startDate / endDate window
 *
 * Rule tree example:
 *   { all: [
 *       { attr: 'role', op: 'eq', val: 'admin' },
 *       { any: [
 *           { attr: 'country', op: 'in', val: ['IL','US'] },
 *           { attr: 'tier',    op: 'gte', val: 3 }
 *       ] }
 *   ] }
 *
 * Operators: eq, ne, in, nin, gt, gte, lt, lte, contains, regex, exists
 *
 * Audit log file (append-only, JSONL):
 *   data/flag-audit.jsonl
 *
 * Each audit entry:
 *   { ts, event, name, actor, before, after, reason }
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// FNV-1a 32-bit — zero-dep sticky hash
// ---------------------------------------------------------------------------

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * FNV-1a 32-bit hash → unsigned integer.
 * Stable, fast, dependency-free. Used for sticky user bucketing.
 */
function fnv1a32(str) {
  let hash = FNV_OFFSET;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i) & 0xff;
    // 32-bit multiply trick (avoids floating precision loss)
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash >>> 0;
}

// ---------------------------------------------------------------------------
// Rule tree evaluation
// ---------------------------------------------------------------------------

const OPERATORS = {
  eq:       (a, b) => a === b,
  ne:       (a, b) => a !== b,
  in:       (a, b) => Array.isArray(b) && b.indexOf(a) !== -1,
  nin:      (a, b) => Array.isArray(b) && b.indexOf(a) === -1,
  gt:       (a, b) => typeof a === 'number' && typeof b === 'number' && a > b,
  gte:      (a, b) => typeof a === 'number' && typeof b === 'number' && a >= b,
  lt:       (a, b) => typeof a === 'number' && typeof b === 'number' && a < b,
  lte:      (a, b) => typeof a === 'number' && typeof b === 'number' && a <= b,
  contains: (a, b) => typeof a === 'string' && typeof b === 'string' && a.indexOf(b) !== -1,
  regex:    (a, b) => {
    if (typeof a !== 'string') return false;
    try { return new RegExp(b).test(a); } catch (_) { return false; }
  },
  exists:   (a)    => a !== undefined && a !== null,
};

/**
 * Read a dotted path from an object. Safe for missing intermediate keys.
 *   readAttr({user:{id:1}}, 'user.id') → 1
 */
function readAttr(ctx, attr) {
  if (ctx == null || !attr) return undefined;
  // Top-level shortcut — also support context.attributes.xxx
  if (attr in ctx) return ctx[attr];
  if (ctx.attributes && attr in ctx.attributes) return ctx.attributes[attr];
  const parts = String(attr).split('.');
  let cur = ctx;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

/**
 * Evaluate a rule node. Supports AND (`all`), OR (`any`), NOT (`not`),
 * and leaf `{ attr, op, val }`. Returns { ok, trace } so we can debug.
 */
function evalRule(node, ctx, traceList) {
  if (node == null || typeof node !== 'object') {
    traceList && traceList.push({ node, ok: true, note: 'no rule → ok' });
    return true;
  }
  if (Array.isArray(node.all)) {
    for (const child of node.all) {
      const ok = evalRule(child, ctx, traceList);
      if (!ok) return false;
    }
    return true;
  }
  if (Array.isArray(node.any)) {
    for (const child of node.any) {
      const ok = evalRule(child, ctx, traceList);
      if (ok) return true;
    }
    return node.any.length === 0;
  }
  if (node.not) {
    return !evalRule(node.not, ctx, traceList);
  }
  if (node.attr && node.op) {
    const op = OPERATORS[node.op];
    const actual = readAttr(ctx, node.attr);
    const ok = op ? !!op(actual, node.val) : false;
    traceList && traceList.push({
      attr: node.attr, op: node.op, val: node.val, actual, ok,
    });
    return ok;
  }
  traceList && traceList.push({ node, ok: true, note: 'unknown node → default ok' });
  return true;
}

// ---------------------------------------------------------------------------
// FeatureFlags class
// ---------------------------------------------------------------------------

class FeatureFlags {
  /**
   * @param {object} [opts]
   * @param {string} [opts.auditFile] path to JSONL audit log
   * @param {boolean} [opts.persistAudit=true] whether to write to disk
   * @param {function} [opts.clock] injected now() for tests
   */
  constructor(opts = {}) {
    this.flags = new Map();
    this.auditFile = opts.auditFile || path.join(process.cwd(), 'data', 'flag-audit.jsonl');
    this.persistAudit = opts.persistAudit !== false;
    this.clock = typeof opts.clock === 'function' ? opts.clock : () => new Date();
    this.auditMemory = []; // in-memory ring, also handy for tests
    this._ensureAuditDir();
  }

  _ensureAuditDir() {
    if (!this.persistAudit) return;
    try {
      const dir = path.dirname(this.auditFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      // Non-fatal: audit dir creation failed; writes will fall back to memory.
      this.persistAudit = false;
    }
  }

  _audit(event, name, actor, before, after, reason) {
    const entry = {
      ts: this.clock().toISOString(),
      event,
      name,
      actor: actor || 'system',
      before,
      after,
      reason: reason || null,
    };
    this.auditMemory.push(entry);
    if (this.persistAudit) {
      try {
        fs.appendFileSync(this.auditFile, JSON.stringify(entry) + '\n', 'utf8');
      } catch (e) {
        // Swallow — audit failure must never break the app.
      }
    }
    return entry;
  }

  /**
   * Register a new flag. If the flag already exists, this is treated as an
   * UPGRADE (never a replacement). Old default is preserved in audit trail.
   *
   * @param {object} def
   * @param {string} def.name                     unique flag key
   * @param {'boolean'|'rollout'|'user-list'|'attribute'|'schedule'} [def.type='boolean']
   * @param {boolean} [def.default=false]
   * @param {object}  [def.rules]                 rule tree
   * @param {number}  [def.rolloutPercent]        0..100
   * @param {string|Date} [def.startDate]
   * @param {string|Date} [def.endDate]
   * @param {string}  [def.description]           English description
   * @param {string}  [def.description_he]        Hebrew description
   * @param {string}  [def.owner]
   * @param {string}  [def.actor='system']
   */
  defineFlag(def) {
    if (!def || typeof def !== 'object' || !def.name) {
      throw new Error('defineFlag: name is required');
    }
    const existing = this.flags.get(def.name);
    const upgraded = {
      name: def.name,
      type: def.type || (def.rolloutPercent != null ? 'rollout'
                        : def.rules ? 'attribute'
                        : (def.startDate || def.endDate) ? 'schedule'
                        : 'boolean'),
      default: typeof def.default === 'boolean' ? def.default : false,
      rules: def.rules || null,
      rolloutPercent: typeof def.rolloutPercent === 'number'
        ? Math.max(0, Math.min(100, def.rolloutPercent))
        : null,
      startDate: def.startDate ? new Date(def.startDate).toISOString() : null,
      endDate:   def.endDate   ? new Date(def.endDate).toISOString()   : null,
      description:    def.description    || (existing && existing.description)    || '',
      description_he: def.description_he || (existing && existing.description_he) || '',
      owner: def.owner || (existing && existing.owner) || 'unknown',
      createdAt: existing ? existing.createdAt : this.clock().toISOString(),
      updatedAt: this.clock().toISOString(),
      version:   existing ? (existing.version || 1) + 1 : 1,
    };
    // Non-destructive rule — upgrades only
    if (existing) {
      this._audit('upgrade', def.name, def.actor, existing, upgraded, 'defineFlag upgrade');
    } else {
      this._audit('define', def.name, def.actor, null, upgraded, 'defineFlag');
    }
    this.flags.set(def.name, upgraded);
    return this.getFlag(def.name);
  }

  /**
   * Toggle a boolean flag's default, or set a scalar value.
   * The old value is preserved in the audit log.
   */
  setFlag(name, value, actor) {
    const existing = this.flags.get(name);
    if (!existing) {
      throw new Error(`setFlag: unknown flag "${name}"`);
    }
    const before = JSON.parse(JSON.stringify(existing));
    if (typeof value === 'boolean') {
      existing.default = value;
    } else if (value && typeof value === 'object') {
      // Allow partial updates: rules / rolloutPercent / dates
      if (value.rules !== undefined)           existing.rules = value.rules;
      if (value.rolloutPercent !== undefined)  existing.rolloutPercent =
        Math.max(0, Math.min(100, Number(value.rolloutPercent)));
      if (value.startDate !== undefined)       existing.startDate =
        value.startDate ? new Date(value.startDate).toISOString() : null;
      if (value.endDate !== undefined)         existing.endDate =
        value.endDate ? new Date(value.endDate).toISOString() : null;
      if (typeof value.default === 'boolean')  existing.default = value.default;
      if (typeof value.description === 'string')    existing.description = value.description;
      if (typeof value.description_he === 'string') existing.description_he = value.description_he;
    } else {
      throw new Error(`setFlag: value must be boolean or object, got ${typeof value}`);
    }
    existing.updatedAt = this.clock().toISOString();
    existing.version = (existing.version || 1) + 1;
    this._audit('set', name, actor, before, JSON.parse(JSON.stringify(existing)), 'setFlag');
    return this.getFlag(name);
  }

  /** Deep copy of a single flag (safe to mutate by caller). */
  getFlag(name) {
    const f = this.flags.get(name);
    return f ? JSON.parse(JSON.stringify(f)) : null;
  }

  /** Deep copy of all flags as an array. */
  listFlags() {
    return Array.from(this.flags.values()).map((f) => JSON.parse(JSON.stringify(f)));
  }

  /**
   * Sticky user bucketing 0..99.
   * Salt with flagName so same userId lands in different buckets per-flag.
   */
  bucketUser(userId, flagName) {
    if (userId == null) return 0;
    const h = fnv1a32(`${flagName || ''}::${userId}`);
    return h % 100;
  }

  /**
   * Detailed evaluation — returns { enabled, reason, traces? }.
   * @param {string}  flagName
   * @param {object}  context  { userId, role, attributes, ... }
   * @param {boolean} [trace]  include trace array for debugging
   */
  evaluate(flagName, context, trace) {
    const flag = this.flags.get(flagName);
    const traces = trace ? [] : null;
    if (!flag) {
      return { enabled: false, reason: 'unknown-flag', flag: flagName, traces };
    }
    const ctx = context || {};

    // 1. Schedule window check
    const now = this.clock();
    if (flag.startDate && now < new Date(flag.startDate)) {
      return { enabled: false, reason: 'before-start-date', flag: flagName, traces };
    }
    if (flag.endDate && now > new Date(flag.endDate)) {
      return { enabled: false, reason: 'after-end-date', flag: flagName, traces };
    }

    // 2. Rule tree — when present, rules are a HARD gate
    if (flag.rules) {
      const ok = evalRule(flag.rules, ctx, traces);
      if (!ok) {
        return { enabled: false, reason: 'rules-failed', flag: flagName, traces };
      }
    }

    // 3. Rollout percentage — sticky by userId
    if (typeof flag.rolloutPercent === 'number') {
      if (flag.rolloutPercent >= 100) {
        return { enabled: true, reason: 'rollout-100', flag: flagName, traces };
      }
      if (flag.rolloutPercent <= 0) {
        // Fall through to default only if no rules gate — otherwise rules passing + 0 = still off
        return { enabled: !!flag.default && !flag.rules, reason: 'rollout-0', flag: flagName, traces };
      }
      const bucket = this.bucketUser(ctx.userId, flagName);
      const inRollout = bucket < flag.rolloutPercent;
      return {
        enabled: inRollout,
        reason: inRollout ? 'rollout-in' : 'rollout-out',
        bucket,
        percent: flag.rolloutPercent,
        flag: flagName,
        traces,
      };
    }

    // 4. Rules passed and no rollout → rules-pass overrides default
    if (flag.rules) {
      return { enabled: true, reason: 'rules-pass', flag: flagName, traces };
    }

    // 5. Fall back to default
    return { enabled: !!flag.default, reason: 'default', flag: flagName, traces };
  }

  /** Boolean convenience wrapper. */
  isEnabled(flagName, context) {
    return this.evaluate(flagName, context, false).enabled;
  }

  /** Export entire state as a plain JSON-safe object. */
  exportState() {
    return {
      version: 1,
      exportedAt: this.clock().toISOString(),
      flags: this.listFlags(),
    };
  }

  /**
   * Merge a previously-exported state. NON-DESTRUCTIVE: existing flags are
   * upgraded (higher version wins), missing flags are added, no flag is
   * ever deleted.
   */
  importState(state) {
    if (!state || !Array.isArray(state.flags)) {
      throw new Error('importState: invalid state');
    }
    const imported = [];
    for (const incoming of state.flags) {
      if (!incoming || !incoming.name) continue;
      const existing = this.flags.get(incoming.name);
      if (!existing || (incoming.version || 1) > (existing.version || 1)) {
        // Use defineFlag semantics for audit + upgrade tracking
        this.defineFlag(Object.assign({}, incoming, { actor: 'import' }));
        imported.push(incoming.name);
      }
    }
    return { imported, total: state.flags.length };
  }

  /**
   * Express middleware. Attaches `req.flags` with:
   *   - isEnabled(name)
   *   - evaluate(name, trace?)
   *   - list()
   * Context is derived from req.user (id, role) and req.query/req.headers.
   */
  express() {
    const self = this;
    return function featureFlagsMiddleware(req, _res, next) {
      const user = req.user || {};
      const baseCtx = {
        userId:     user.id || user.userId || req.headers['x-user-id'] || null,
        role:       user.role || req.headers['x-user-role'] || null,
        attributes: Object.assign({}, user.attributes || {}, req.query || {}),
      };
      req.flags = {
        isEnabled(name, extra) {
          return self.isEnabled(name, Object.assign({}, baseCtx, extra || {}));
        },
        evaluate(name, trace, extra) {
          return self.evaluate(name, Object.assign({}, baseCtx, extra || {}), trace);
        },
        list() { return self.listFlags(); },
        context: baseCtx,
      };
      if (typeof next === 'function') next();
    };
  }

  /** For tests: read the audit memory ring (defensive copy). */
  _getAuditMemory() {
    return this.auditMemory.slice();
  }
}

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

module.exports = {
  FeatureFlags,
  // exposed helpers for unit tests / advanced callers
  fnv1a32,
  evalRule,
  readAttr,
  OPERATORS,
};
