/**
 * onyx-procurement/src/wiring/tenant-config.js
 * ─────────────────────────────────────────────────────────────────────
 * TenantConfigMerger — multi-tenant configuration merger for the
 * Techno-Kol Uzi mega-ERP. Merges three levels of configuration —
 *
 *   global  → tenant/org → user
 *
 * — with strict precedence rules, schema validation, type coercion,
 * locked-field enforcement (org can lock; user cannot override), a
 * bilingual append-only audit trail, and a rich diff view.
 *
 * Agent:   Y-199 Multi-tenant Config Merger
 * Swarm:   Wiring / Foundations
 * Project: Techno-Kol Uzi mega-ERP
 * Date:    2026-04-11
 *
 * RULES
 *   - Zero external dependencies — Node 20+ built-ins only (`crypto`).
 *   - "לא מוחקים רק משדרגים ומגדלים" — merges are append-only; no key
 *     deletion, only overlay. History never shrinks.
 *   - Bilingual audit trail: every override carries both `note.he`
 *     and `note.en` messages auto-composed from the path + layer.
 *   - Locked fields: an org layer may set `__locked__: ['key.path', ...]`
 *     (or the convenience notation `{ value, locked: true }`) and user
 *     layers cannot override those keys. The attempted override is NOT
 *     silently dropped — it is recorded in the audit trail as
 *     `lock.rejected` so the caller can surface the denial to the UI.
 *   - Schema validation runs AFTER merge. Unknown keys are preserved
 *     (we never delete) but flagged as `warn.unknown-key` entries.
 *   - Type coercion is best-effort and lossless: string "42" → 42 for
 *     number schema; "true"/"false"/"1"/"0"/"yes"/"no" → boolean;
 *     ISO-date string → Date; JSON-like string → object for object
 *     schema. Coercion failures fall back to the original value and
 *     are recorded in `coerce.failed`.
 *
 * Public API
 *   const { TenantConfigMerger } = require('./tenant-config');
 *   const merger = new TenantConfigMerger({ schema });
 *   const result = merger.merge(globalCfg, orgCfg, userCfg);
 *   // result = { effective, audit, diff, locked, warnings, errors }
 *   merger.diff(globalCfg, result.effective);  // standalone diff
 *   merger.validate(result.effective);         // standalone validation
 *   merger.history();                          // append-only audit log
 *
 * ─────────────────────────────────────────────────────────────────────
 */

'use strict';

const crypto = require('node:crypto');

// ───────────────────────────────────────────────────────────────────
//  Constants & bilingual glossary
// ───────────────────────────────────────────────────────────────────

const LAYERS = Object.freeze({
  GLOBAL: 'global',
  ORG: 'org',
  USER: 'user',
});

const LAYER_PRECEDENCE = Object.freeze([LAYERS.GLOBAL, LAYERS.ORG, LAYERS.USER]);

const LAYER_NAMES = Object.freeze({
  [LAYERS.GLOBAL]: { he: 'גלובלי', en: 'global' },
  [LAYERS.ORG]:    { he: 'ארגון',  en: 'organization' },
  [LAYERS.USER]:   { he: 'משתמש',  en: 'user' },
});

const ACTIONS = Object.freeze({
  SET:            'set',            // new key introduced by this layer
  OVERRIDE:       'override',       // key overridden by higher layer
  KEEP:           'keep',           // inherited unchanged
  LOCK_APPLIED:   'lock.applied',   // org locked this key
  LOCK_REJECTED:  'lock.rejected',  // user tried to override locked key
  COERCED:        'coerce.ok',      // value coerced to schema type
  COERCE_FAILED:  'coerce.failed',  // coercion failed, fallback kept
  UNKNOWN_KEY:    'warn.unknown-key',
  SCHEMA_ERROR:   'schema.error',
  SCHEMA_DEFAULT: 'schema.default', // default filled from schema
});

const ERR = {
  BAD_LAYER: (l) => ({
    he: `שכבת תצורה לא חוקית: "${l}". ציפינו ל-global | org | user.`,
    en: `Invalid config layer: "${l}". Expected global | org | user.`,
  }),
  BAD_INPUT: (which) => ({
    he: `קלט תצורה לא תקין בשכבה ${which} — חייב להיות אובייקט או undefined.`,
    en: `Invalid config input at layer ${which} — must be an object or undefined.`,
  }),
  SCHEMA_REQUIRED: (p) => ({
    he: `שדה חובה חסר: "${p}".`,
    en: `Required field missing: "${p}".`,
  }),
  SCHEMA_TYPE: (p, expected, actual) => ({
    he: `סוג שגוי בשדה "${p}": ציפינו ל-${expected}, קיבלנו ${actual}.`,
    en: `Wrong type at "${p}": expected ${expected}, got ${actual}.`,
  }),
  SCHEMA_MIN: (p, min, v) => ({
    he: `ערך נמוך מדי בשדה "${p}": המינימום הוא ${min}, התקבל ${v}.`,
    en: `Value below minimum at "${p}": min=${min}, got ${v}.`,
  }),
  SCHEMA_MAX: (p, max, v) => ({
    he: `ערך גבוה מדי בשדה "${p}": המקסימום הוא ${max}, התקבל ${v}.`,
    en: `Value above maximum at "${p}": max=${max}, got ${v}.`,
  }),
  SCHEMA_ENUM: (p, allowed, v) => ({
    he: `ערך מחוץ לרשימה המותרת בשדה "${p}": מותר [${allowed.join(', ')}], התקבל ${v}.`,
    en: `Value not in enum at "${p}": allowed [${allowed.join(', ')}], got ${v}.`,
  }),
  SCHEMA_PATTERN: (p, pattern) => ({
    he: `הערך בשדה "${p}" אינו תואם לתבנית ${pattern}.`,
    en: `Value at "${p}" does not match pattern ${pattern}.`,
  }),
};

// ───────────────────────────────────────────────────────────────────
//  Small utilities (no external deps)
// ───────────────────────────────────────────────────────────────────

function isPlainObject(v) {
  if (v === null || typeof v !== 'object') return false;
  if (Array.isArray(v)) return false;
  if (v instanceof Date) return false;
  if (v instanceof RegExp) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function deepClone(v) {
  if (v === null || typeof v !== 'object') return v;
  if (v instanceof Date) return new Date(v.getTime());
  if (Array.isArray(v)) return v.map(deepClone);
  const out = {};
  for (const k of Object.keys(v)) out[k] = deepClone(v[k]);
  return out;
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (v instanceof Date) return 'date';
  if (v instanceof RegExp) return 'regexp';
  return typeof v;
}

function equalDeep(a, b) {
  if (a === b) return true;
  if (typeOf(a) !== typeOf(b)) return false;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!equalDeep(a[i], b[i])) return false;
    return true;
  }
  if (isPlainObject(a)) {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.length !== kb.length) return false;
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return false;
      if (!equalDeep(a[ka[i]], b[ka[i]])) return false;
    }
    return true;
  }
  return false;
}

function getPath(obj, pathParts) {
  let cur = obj;
  for (const k of pathParts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[k];
  }
  return cur;
}

function setPath(obj, pathParts, value) {
  let cur = obj;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const k = pathParts[i];
    if (!isPlainObject(cur[k])) cur[k] = {};
    cur = cur[k];
  }
  cur[pathParts[pathParts.length - 1]] = value;
}

function splitPath(p) {
  return String(p).split('.').filter((s) => s.length > 0);
}

function flatten(obj, prefix = '', out = {}) {
  if (!isPlainObject(obj)) {
    if (prefix) out[prefix] = obj;
    return out;
  }
  for (const k of Object.keys(obj)) {
    const next = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (isPlainObject(v)) flatten(v, next, out);
    else out[next] = v;
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────
//  Locked-field extraction
//   Org layers declare locks in one of two ways:
//     1) Convenience:  settings: { theme: { value: 'dark', locked: true } }
//     2) Explicit:     settings: { __locked__: ['theme'] }
//   Both forms are normalised into a flat set of dotted paths.
// ───────────────────────────────────────────────────────────────────

function extractLocks(obj, prefix = '', set = new Set()) {
  if (!isPlainObject(obj)) return set;
  if (Array.isArray(obj.__locked__)) {
    for (const p of obj.__locked__) {
      if (typeof p === 'string' && p.length > 0) {
        set.add(prefix ? `${prefix}.${p}` : p);
      }
    }
  }
  for (const k of Object.keys(obj)) {
    if (k === '__locked__') continue;
    const v = obj[k];
    const next = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v) && v.locked === true && 'value' in v) {
      set.add(next);
    } else if (isPlainObject(v)) {
      extractLocks(v, next, set);
    }
  }
  return set;
}

/**
 * Strip convenience-locked wrappers ({value, locked}) and remove
 * the bookkeeping `__locked__` arrays so the resulting object is a
 * clean plain-value tree suitable for merging / validation.
 */
function normaliseLayer(obj) {
  if (!isPlainObject(obj)) return {};
  const out = {};
  for (const k of Object.keys(obj)) {
    if (k === '__locked__') continue;
    const v = obj[k];
    if (isPlainObject(v) && 'locked' in v && 'value' in v && v.locked === true) {
      out[k] = deepClone(v.value);
    } else if (isPlainObject(v)) {
      out[k] = normaliseLayer(v);
    } else {
      out[k] = deepClone(v);
    }
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────
//  Type coercion
//   Returns { ok, value, reason? } — on failure the original value is
//   preserved so "coerce.failed" can be recorded without data loss.
// ───────────────────────────────────────────────────────────────────

function coerce(value, type) {
  if (value === undefined || value === null) {
    return { ok: true, value };
  }
  const from = typeOf(value);
  if (from === type) return { ok: true, value };

  switch (type) {
    case 'number': {
      if (from === 'string') {
        const trimmed = value.trim();
        if (trimmed === '') return { ok: false, value, reason: 'empty-string' };
        const n = Number(trimmed);
        if (Number.isFinite(n)) return { ok: true, value: n };
        return { ok: false, value, reason: 'not-a-number' };
      }
      if (from === 'boolean') return { ok: true, value: value ? 1 : 0 };
      return { ok: false, value, reason: `cannot-coerce-${from}-to-number` };
    }
    case 'integer': {
      const numResult = coerce(value, 'number');
      if (!numResult.ok) return numResult;
      const n = numResult.value;
      if (!Number.isInteger(n)) return { ok: false, value, reason: 'not-integer' };
      return { ok: true, value: n };
    }
    case 'boolean': {
      if (from === 'string') {
        const s = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'on', 'y', 'כן', 'אמת'].includes(s)) {
          return { ok: true, value: true };
        }
        if (['false', '0', 'no', 'off', 'n', 'לא', 'שקר'].includes(s)) {
          return { ok: true, value: false };
        }
        return { ok: false, value, reason: 'unrecognised-boolean-string' };
      }
      if (from === 'number') return { ok: true, value: value !== 0 };
      return { ok: false, value, reason: `cannot-coerce-${from}-to-boolean` };
    }
    case 'string': {
      if (from === 'number' || from === 'boolean') {
        return { ok: true, value: String(value) };
      }
      if (from === 'date') return { ok: true, value: value.toISOString() };
      return { ok: false, value, reason: `cannot-coerce-${from}-to-string` };
    }
    case 'date': {
      if (from === 'string' || from === 'number') {
        const d = new Date(value);
        if (!Number.isNaN(d.getTime())) return { ok: true, value: d };
        return { ok: false, value, reason: 'invalid-date' };
      }
      return { ok: false, value, reason: `cannot-coerce-${from}-to-date` };
    }
    case 'array': {
      if (from === 'string') {
        const s = value.trim();
        if (s.startsWith('[') && s.endsWith(']')) {
          try {
            const parsed = JSON.parse(s);
            if (Array.isArray(parsed)) return { ok: true, value: parsed };
          } catch (_) {
            // fall through
          }
        }
        // CSV fallback
        if (s.length > 0) {
          return { ok: true, value: s.split(',').map((x) => x.trim()) };
        }
        return { ok: true, value: [] };
      }
      return { ok: false, value, reason: `cannot-coerce-${from}-to-array` };
    }
    case 'object': {
      if (from === 'string') {
        const s = value.trim();
        if (s.startsWith('{') && s.endsWith('}')) {
          try {
            const parsed = JSON.parse(s);
            if (isPlainObject(parsed)) return { ok: true, value: parsed };
          } catch (_) {
            // fall through
          }
        }
        return { ok: false, value, reason: 'not-json-object' };
      }
      return { ok: false, value, reason: `cannot-coerce-${from}-to-object` };
    }
    default:
      return { ok: false, value, reason: `unknown-target-type-${type}` };
  }
}

// ───────────────────────────────────────────────────────────────────
//  Schema validation
//   schema shape:  { 'server.port': { type, required, default, min,
//                    max, enum, pattern, secret } }
// ───────────────────────────────────────────────────────────────────

function checkOne(path, rule, value) {
  const errors = [];
  if (value === undefined || value === null) {
    if (rule.required) errors.push(ERR.SCHEMA_REQUIRED(path));
    return errors;
  }
  if (rule.type) {
    const actual = typeOf(value);
    const expected = rule.type;
    const sameInteger = expected === 'integer' && actual === 'number' && Number.isInteger(value);
    if (actual !== expected && !sameInteger) {
      errors.push(ERR.SCHEMA_TYPE(path, expected, actual));
      return errors;
    }
  }
  if (typeof rule.min === 'number' && typeof value === 'number' && value < rule.min) {
    errors.push(ERR.SCHEMA_MIN(path, rule.min, value));
  }
  if (typeof rule.max === 'number' && typeof value === 'number' && value > rule.max) {
    errors.push(ERR.SCHEMA_MAX(path, rule.max, value));
  }
  if (typeof rule.min === 'number' && typeof value === 'string' && value.length < rule.min) {
    errors.push(ERR.SCHEMA_MIN(`${path}.length`, rule.min, value.length));
  }
  if (typeof rule.max === 'number' && typeof value === 'string' && value.length > rule.max) {
    errors.push(ERR.SCHEMA_MAX(`${path}.length`, rule.max, value.length));
  }
  if (Array.isArray(rule.enum) && !rule.enum.includes(value)) {
    errors.push(ERR.SCHEMA_ENUM(path, rule.enum, value));
  }
  if (rule.pattern) {
    const re = rule.pattern instanceof RegExp ? rule.pattern : new RegExp(rule.pattern);
    if (typeof value === 'string' && !re.test(value)) {
      errors.push(ERR.SCHEMA_PATTERN(path, re.toString()));
    }
  }
  return errors;
}

// ───────────────────────────────────────────────────────────────────
//  TenantConfigMerger
// ───────────────────────────────────────────────────────────────────

class TenantConfigMerger {
  /**
   * @param {Object} [opts]
   * @param {Object} [opts.schema]   dotted-path rule map
   * @param {Function} [opts.now]    injectable clock for tests
   * @param {boolean} [opts.strict]  throw on any schema error (default false)
   */
  constructor(opts = {}) {
    this.schema = opts.schema || {};
    this.now = typeof opts.now === 'function' ? opts.now : () => Date.now();
    this.strict = opts.strict === true;
    this._history = []; // append-only global audit trail across merges
  }

  /**
   * Merge three layers into an effective configuration.
   * Precedence: user > org > global.
   *
   * @param {Object} globalCfg
   * @param {Object} orgCfg
   * @param {Object} userCfg
   * @returns {{
   *   effective: Object,
   *   audit: Array,
   *   diff: Object,
   *   locked: Array<string>,
   *   warnings: Array,
   *   errors: Array,
   *   snapshotId: string
   * }}
   */
  merge(globalCfg, orgCfg, userCfg) {
    // ─── input normalisation & validation ────────────────────────
    const layersRaw = [
      [LAYERS.GLOBAL, globalCfg],
      [LAYERS.ORG, orgCfg],
      [LAYERS.USER, userCfg],
    ];
    for (const [name, layer] of layersRaw) {
      if (layer !== undefined && layer !== null && !isPlainObject(layer)) {
        throw new Error(ERR.BAD_INPUT(name).en);
      }
    }

    const globalNorm = normaliseLayer(globalCfg || {});
    const orgNorm    = normaliseLayer(orgCfg || {});
    const userNorm   = normaliseLayer(userCfg || {});

    // ─── lock extraction (only org may declare locks) ────────────
    const lockedPaths = extractLocks(orgCfg || {});

    // ─── per-merge audit accumulator ─────────────────────────────
    const audit = [];
    const warnings = [];
    const errors = [];
    const ts = this.now();

    // Helper to append + record
    const record = (action, path, opts = {}) => {
      const name = LAYER_NAMES[opts.layer] || { he: '—', en: '—' };
      const from = opts.fromLayer ? LAYER_NAMES[opts.fromLayer] : null;
      const he = this._composeHe(action, path, name, from, opts);
      const en = this._composeEn(action, path, name, from, opts);
      const entry = {
        at: ts,
        action,
        path,
        layer: opts.layer,
        fromLayer: opts.fromLayer || null,
        previousValue: 'previousValue' in opts ? opts.previousValue : undefined,
        newValue: 'newValue' in opts ? opts.newValue : undefined,
        reason: opts.reason,
        note: { he, en },
      };
      audit.push(entry);
      this._history.push(entry);
      if (action.startsWith('warn.')) warnings.push(entry);
      if (action === ACTIONS.LOCK_REJECTED || action === ACTIONS.SCHEMA_ERROR) {
        warnings.push(entry);
      }
      return entry;
    };

    // ─── three-layer overlay (global → org → user) ───────────────
    // Start by collecting ALL known paths across the three layers.
    const flatGlobal = flatten(globalNorm);
    const flatOrg    = flatten(orgNorm);
    const flatUser   = flatten(userNorm);

    const allPaths = new Set([
      ...Object.keys(flatGlobal),
      ...Object.keys(flatOrg),
      ...Object.keys(flatUser),
    ]);

    const effectiveFlat = {};
    const winnerLayer = {};   // path → layer that wrote the final value

    for (const path of allPaths) {
      const hasG = path in flatGlobal;
      const hasO = path in flatOrg;
      const hasU = path in flatUser;
      const isLocked = lockedPaths.has(path);

      // 1) Start at global
      if (hasG) {
        effectiveFlat[path] = flatGlobal[path];
        winnerLayer[path] = LAYERS.GLOBAL;
        record(ACTIONS.SET, path, {
          layer: LAYERS.GLOBAL,
          newValue: flatGlobal[path],
        });
      }

      // 2) Overlay org
      if (hasO) {
        const prev = effectiveFlat[path];
        if (hasG && equalDeep(prev, flatOrg[path])) {
          // no-op overlay, still record keep for traceability
          record(ACTIONS.KEEP, path, {
            layer: LAYERS.ORG,
            newValue: flatOrg[path],
          });
        } else {
          effectiveFlat[path] = flatOrg[path];
          const wasLayer = winnerLayer[path] || null;
          winnerLayer[path] = LAYERS.ORG;
          record(hasG ? ACTIONS.OVERRIDE : ACTIONS.SET, path, {
            layer: LAYERS.ORG,
            fromLayer: wasLayer,
            previousValue: prev,
            newValue: flatOrg[path],
          });
        }
      }

      // 3) Announce lock (if any, and if user tried to override OR not)
      if (isLocked) {
        record(ACTIONS.LOCK_APPLIED, path, {
          layer: LAYERS.ORG,
          newValue: effectiveFlat[path],
        });
      }

      // 4) Overlay user (subject to lock)
      if (hasU) {
        if (isLocked) {
          record(ACTIONS.LOCK_REJECTED, path, {
            layer: LAYERS.USER,
            fromLayer: LAYERS.ORG,
            previousValue: effectiveFlat[path],
            newValue: flatUser[path],
            reason: 'org-locked',
          });
        } else {
          const prev = effectiveFlat[path];
          if ((hasG || hasO) && equalDeep(prev, flatUser[path])) {
            record(ACTIONS.KEEP, path, {
              layer: LAYERS.USER,
              newValue: flatUser[path],
            });
          } else {
            effectiveFlat[path] = flatUser[path];
            const wasLayer = winnerLayer[path] || null;
            winnerLayer[path] = LAYERS.USER;
            record(hasG || hasO ? ACTIONS.OVERRIDE : ACTIONS.SET, path, {
              layer: LAYERS.USER,
              fromLayer: wasLayer,
              previousValue: prev,
              newValue: flatUser[path],
            });
          }
        }
      }
    }

    // ─── schema defaults (for paths absent from all layers) ──────
    for (const path of Object.keys(this.schema)) {
      if (!(path in effectiveFlat) && 'default' in this.schema[path]) {
        effectiveFlat[path] = deepClone(this.schema[path].default);
        winnerLayer[path] = 'schema';
        record(ACTIONS.SCHEMA_DEFAULT, path, {
          layer: LAYERS.GLOBAL,
          newValue: effectiveFlat[path],
          reason: 'schema-default',
        });
      }
    }

    // ─── type coercion ───────────────────────────────────────────
    for (const path of Object.keys(effectiveFlat)) {
      const rule = this.schema[path];
      if (!rule || !rule.type) continue;
      const current = effectiveFlat[path];
      const res = coerce(current, rule.type);
      if (res.ok && res.value !== current) {
        effectiveFlat[path] = res.value;
        record(ACTIONS.COERCED, path, {
          layer: winnerLayer[path] || LAYERS.GLOBAL,
          previousValue: current,
          newValue: res.value,
          reason: `coerced-to-${rule.type}`,
        });
      } else if (!res.ok && typeOf(current) !== rule.type) {
        record(ACTIONS.COERCE_FAILED, path, {
          layer: winnerLayer[path] || LAYERS.GLOBAL,
          previousValue: current,
          newValue: current,
          reason: res.reason,
        });
      }
    }

    // ─── validation ──────────────────────────────────────────────
    for (const path of Object.keys(this.schema)) {
      const rule = this.schema[path];
      const errs = checkOne(path, rule, effectiveFlat[path]);
      for (const e of errs) {
        const entry = record(ACTIONS.SCHEMA_ERROR, path, {
          layer: winnerLayer[path] || LAYERS.GLOBAL,
          newValue: effectiveFlat[path],
          reason: e.en,
        });
        entry.error = e; // bilingual object
        errors.push(entry);
      }
    }

    // ─── unknown-key warnings (never deleted) ────────────────────
    if (Object.keys(this.schema).length > 0) {
      for (const path of Object.keys(effectiveFlat)) {
        if (!(path in this.schema)) {
          record(ACTIONS.UNKNOWN_KEY, path, {
            layer: winnerLayer[path] || LAYERS.GLOBAL,
            newValue: effectiveFlat[path],
            reason: 'not-in-schema',
          });
        }
      }
    }

    if (this.strict && errors.length > 0) {
      const err = new Error(
        `TenantConfigMerger: ${errors.length} schema error(s) in strict mode.`,
      );
      err.errors = errors;
      throw err;
    }

    // ─── rebuild nested effective object ─────────────────────────
    const effective = {};
    for (const path of Object.keys(effectiveFlat)) {
      setPath(effective, splitPath(path), effectiveFlat[path]);
    }

    // ─── diff: effective vs each source ──────────────────────────
    const diff = {
      vsGlobal: this.diff(globalNorm, effective),
      vsOrg:    this.diff(orgNorm, effective),
      vsUser:   this.diff(userNorm, effective),
    };

    // ─── snapshot id (content hash for caching / integrity) ──────
    const snapshotId = crypto
      .createHash('sha256')
      .update(JSON.stringify({ effectiveFlat, locked: [...lockedPaths].sort() }))
      .digest('hex')
      .slice(0, 16);

    return {
      effective,
      audit,
      diff,
      locked: [...lockedPaths].sort(),
      warnings,
      errors,
      snapshotId,
      winnerLayer,
    };
  }

  // ─── standalone diff view ──────────────────────────────────────
  //
  // Returns { added, removed, changed, unchanged } where:
  //   added      — keys present in `next` but missing from `prev`
  //   removed    — keys present in `prev` but missing from `next`
  //                (never deleted by the merger — this is purely a view)
  //   changed    — keys present in both but with different values
  //   unchanged  — keys present in both with equal values
  //
  diff(prev, next) {
    const pFlat = flatten(normaliseLayer(prev || {}));
    const nFlat = flatten(normaliseLayer(next || {}));
    const out = { added: {}, removed: {}, changed: {}, unchanged: {} };
    const all = new Set([...Object.keys(pFlat), ...Object.keys(nFlat)]);
    for (const path of all) {
      const inP = path in pFlat;
      const inN = path in nFlat;
      if (!inP && inN) {
        out.added[path] = nFlat[path];
      } else if (inP && !inN) {
        out.removed[path] = pFlat[path];
      } else if (equalDeep(pFlat[path], nFlat[path])) {
        out.unchanged[path] = pFlat[path];
      } else {
        out.changed[path] = { from: pFlat[path], to: nFlat[path] };
      }
    }
    return out;
  }

  // ─── standalone validation ─────────────────────────────────────
  validate(cfg) {
    const flat = flatten(normaliseLayer(cfg || {}));
    const errors = [];
    for (const path of Object.keys(this.schema)) {
      const errs = checkOne(path, this.schema[path], flat[path]);
      for (const e of errs) errors.push({ path, error: e });
    }
    return { ok: errors.length === 0, errors };
  }

  // ─── append-only history accessor ──────────────────────────────
  history() {
    // Return a shallow copy so callers cannot mutate the log.
    return this._history.slice();
  }

  // ─── bilingual note composition ────────────────────────────────
  _composeHe(action, path, layerName, fromLayer, opts) {
    switch (action) {
      case ACTIONS.SET:
        return `שכבה "${layerName.he}" הגדירה את "${path}".`;
      case ACTIONS.OVERRIDE:
        return `שכבה "${layerName.he}" דרסה את "${path}" (קודם: ${fromLayer ? fromLayer.he : '—'}).`;
      case ACTIONS.KEEP:
        return `שכבה "${layerName.he}" השאירה את "${path}" ללא שינוי.`;
      case ACTIONS.LOCK_APPLIED:
        return `הארגון נעל את השדה "${path}" — משתמשים לא יוכלו לדרוס.`;
      case ACTIONS.LOCK_REJECTED:
        return `ניסיון דריסה על "${path}" על-ידי משתמש נדחה (שדה נעול על-ידי הארגון).`;
      case ACTIONS.COERCED:
        return `השדה "${path}" הומר אוטומטית לסוג הנכון (${opts.reason || ''}).`;
      case ACTIONS.COERCE_FAILED:
        return `המרת סוג כשלה עבור "${path}" — הערך המקורי נשמר (${opts.reason || ''}).`;
      case ACTIONS.UNKNOWN_KEY:
        return `אזהרה: השדה "${path}" אינו מוגדר בסכמה — נשמר אך לא מאומת.`;
      case ACTIONS.SCHEMA_ERROR:
        return `שגיאת סכמה ב-"${path}": ${opts.reason || 'לא תקין'}.`;
      case ACTIONS.SCHEMA_DEFAULT:
        return `השדה "${path}" מולא מערך ברירת-מחדל של הסכמה.`;
      default:
        return `פעולה "${action}" על "${path}" בשכבה "${layerName.he}".`;
    }
  }

  _composeEn(action, path, layerName, fromLayer, opts) {
    switch (action) {
      case ACTIONS.SET:
        return `Layer "${layerName.en}" set "${path}".`;
      case ACTIONS.OVERRIDE:
        return `Layer "${layerName.en}" overrode "${path}" (was: ${fromLayer ? fromLayer.en : '—'}).`;
      case ACTIONS.KEEP:
        return `Layer "${layerName.en}" kept "${path}" unchanged.`;
      case ACTIONS.LOCK_APPLIED:
        return `Organization locked "${path}" — users cannot override.`;
      case ACTIONS.LOCK_REJECTED:
        return `User override on "${path}" rejected (field locked by organization).`;
      case ACTIONS.COERCED:
        return `Field "${path}" auto-coerced (${opts.reason || ''}).`;
      case ACTIONS.COERCE_FAILED:
        return `Type coercion failed for "${path}" — original kept (${opts.reason || ''}).`;
      case ACTIONS.UNKNOWN_KEY:
        return `Warning: field "${path}" not in schema — preserved but unvalidated.`;
      case ACTIONS.SCHEMA_ERROR:
        return `Schema error at "${path}": ${opts.reason || 'invalid'}.`;
      case ACTIONS.SCHEMA_DEFAULT:
        return `Field "${path}" populated from schema default.`;
      default:
        return `Action "${action}" on "${path}" at layer "${layerName.en}".`;
    }
  }
}

module.exports = {
  TenantConfigMerger,
  LAYERS,
  LAYER_PRECEDENCE,
  LAYER_NAMES,
  ACTIONS,
  // Exposed for unit-testability of the helper pipeline
  _internals: {
    isPlainObject,
    deepClone,
    equalDeep,
    flatten,
    coerce,
    extractLocks,
    normaliseLayer,
    checkOne,
    typeOf,
  },
};
