/**
 * FlagDistributor — Feature Flag Distribution Engine
 * ────────────────────────────────────────────────────────────
 * Agent Y-168 — Techno-Kol Uzi Mega-ERP — 2026-04-11
 *
 * A server-side feature-flag DISTRIBUTION engine with:
 *   • Consistent hashing (MurmurHash3 32-bit, pure JS)
 *   • Percentage rollout (0..100) with sticky buckets per user
 *   • Targeting rules: userId, email domain, segment, country, tenantId
 *   • Kill switch that overrides every other rule
 *   • Flag-depends-on-flag prerequisite chains
 *   • Bilingual audit log of every evaluation decision (he + en)
 *
 * Rule of the house:
 *   "לא מוחקים רק משדרגים ומגדלים" — no deletions, only upgrades.
 *
 * Design notes:
 *   - Zero external dependencies. Node core only.
 *   - Different from X-97 (config manager) and X-98 (feature flags):
 *     X-97 manages config KV pairs. X-98 defines flags with FNV-1a + rule
 *     trees. Y-168 is the *distribution layer* that evaluates a rollout
 *     decision for a specific (flag, user) pair using MurmurHash3 and
 *     targeting rules, with a streaming bilingual audit log.
 *   - evaluate() returns { enabled, variant, reason, bucket, ... } and
 *     records an audit entry whose `message_he` + `message_en` explain
 *     exactly which rule fired.
 *   - Audit log is in-memory ring + optional pluggable sink. Never throws.
 *
 * Public API:
 *   const { FlagDistributor, murmurHash3_32, bucketOf } =
 *     require('./src/devops/flag-distributor');
 *
 *   const fd = new FlagDistributor();
 *   fd.register({
 *     key: 'new-checkout',
 *     enabled: true,
 *     killSwitch: false,
 *     rollout: 25,               // 25 % of users
 *     variants: ['A', 'B'],
 *     targeting: {
 *       userIds:      ['u-1', 'u-2'],
 *       emailDomains: ['tko.co.il'],
 *       segments:     ['beta'],
 *       countries:    ['IL', 'US'],
 *       tenantIds:    ['tenant-7']
 *     },
 *     dependsOn: ['core-enabled'],
 *     description_he: 'תשלום חדש',
 *     description_en: 'New checkout',
 *   });
 *
 *   fd.evaluate('new-checkout', {
 *     userId:  'u-42',
 *     email:   'uzi@tko.co.il',
 *     segment: 'beta',
 *     country: 'IL',
 *     tenantId:'tenant-7'
 *   });
 *   // → { enabled, variant, reason, bucket, rollout, killed, audit }
 */

'use strict';

// ──────────────────────────────────────────────────────────────
// 1.  MurmurHash3 (32-bit) — pure JS, deterministic, zero deps
// ──────────────────────────────────────────────────────────────

/**
 * Multiply two 32-bit integers safely in JS float64 land.
 * Based on the classic Java/C reference implementation.
 */
function _imul32(a, b) {
  // Use Math.imul when available (Node always has it).
  /* istanbul ignore else */
  if (typeof Math.imul === 'function') {
    return Math.imul(a, b);
  }
  /* istanbul ignore next */
  const ah = (a >>> 16) & 0xffff;
  /* istanbul ignore next */
  const al = a & 0xffff;
  /* istanbul ignore next */
  const bh = (b >>> 16) & 0xffff;
  /* istanbul ignore next */
  const bl = b & 0xffff;
  /* istanbul ignore next */
  return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0)) | 0;
}

/**
 * MurmurHash3 32-bit, non-cryptographic, deterministic hash.
 * @param {string} key  - input string (UTF-8 bytes)
 * @param {number} seed - 32-bit unsigned seed (default 0)
 * @returns {number}   - 32-bit unsigned integer
 */
function murmurHash3_32(key, seed) {
  if (key === null || key === undefined) key = '';
  if (typeof key !== 'string') key = String(key);
  if (typeof seed !== 'number' || !Number.isFinite(seed)) seed = 0;
  seed = seed >>> 0;

  // Encode to UTF-8 bytes so non-ASCII (Hebrew!) hashes stably across runtimes.
  const bytes = Buffer.from(key, 'utf8');
  const len = bytes.length;
  const nblocks = Math.floor(len / 4);

  let h1 = seed;
  const c1 = 0xcc9e2d51 | 0;
  const c2 = 0x1b873593 | 0;

  // Body — consume 4-byte blocks.
  for (let i = 0; i < nblocks; i++) {
    const i4 = i * 4;
    let k1 =
      (bytes[i4]) |
      (bytes[i4 + 1] << 8) |
      (bytes[i4 + 2] << 16) |
      (bytes[i4 + 3] << 24);

    k1 = _imul32(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = _imul32(k1, c2);

    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1 = (_imul32(h1, 5) + 0xe6546b64) | 0;
  }

  // Tail.
  let k1 = 0;
  const tail = nblocks * 4;
  switch (len & 3) {
    /* eslint-disable no-fallthrough */
    case 3: k1 ^= bytes[tail + 2] << 16;
    case 2: k1 ^= bytes[tail + 1] << 8;
    case 1:
      k1 ^= bytes[tail];
      k1 = _imul32(k1, c1);
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = _imul32(k1, c2);
      h1 ^= k1;
    /* eslint-enable no-fallthrough */
  }

  // Finalizer — fmix32.
  h1 ^= len;
  h1 ^= h1 >>> 16;
  h1 = _imul32(h1, 0x85ebca6b | 0);
  h1 ^= h1 >>> 13;
  h1 = _imul32(h1, 0xc2b2ae35 | 0);
  h1 ^= h1 >>> 16;

  return h1 >>> 0;
}

/**
 * Sticky bucket in [0, 10000) — four-digit precision so we can support
 * rollouts down to 0.01 %. We salt by flagKey so the same user lands in
 * a *different* bucket on every flag (no cross-flag correlation).
 */
function bucketOf(flagKey, userKey, seed) {
  const salted = String(flagKey) + '::' + String(userKey);
  return murmurHash3_32(salted, seed || 0) % 10000;
}

// ──────────────────────────────────────────────────────────────
// 2.  Helpers
// ──────────────────────────────────────────────────────────────

function _clone(obj) {
  if (obj === null || obj === undefined) return obj;
  // Structured clone of plain data — JSON is fine here (no Dates, no funcs).
  return JSON.parse(JSON.stringify(obj));
}

function _nowIso(clock) {
  const d = typeof clock === 'function' ? clock() : new Date();
  return (d instanceof Date ? d : new Date(d)).toISOString();
}

function _extractDomain(email) {
  if (typeof email !== 'string') return null;
  const at = email.lastIndexOf('@');
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

function _userKey(userContext) {
  if (!userContext || typeof userContext !== 'object') return 'anonymous';
  return (
    userContext.userId ||
    userContext.email ||
    userContext.tenantId ||
    'anonymous'
  );
}

function _arrayOrEmpty(v) {
  return Array.isArray(v) ? v : [];
}

// Bilingual reason → {he, en} string pair.
const REASONS = {
  'killed':               { he: 'מתג כיבוי חירום פעיל',       en: 'kill switch engaged' },
  'not-registered':       { he: 'דגל לא רשום במערכת',          en: 'flag not registered' },
  'disabled-global':      { he: 'דגל כבוי גלובלית',            en: 'flag globally disabled' },
  'dependency-missing':   { he: 'תלות חסרה במערכת',            en: 'dependency not registered' },
  'dependency-off':       { he: 'תלות מוקדמת לא מופעלת',       en: 'prerequisite flag is off' },
  'target-user':          { he: 'משתמש ברשימת מיקוד',          en: 'user in explicit target list' },
  'target-email-domain':  { he: 'דומיין אימייל ממוקד',         en: 'email domain matched target' },
  'target-segment':       { he: 'פלח משתמשים ממוקד',          en: 'segment matched target' },
  'target-country':       { he: 'מדינה ממוקדת',                en: 'country matched target' },
  'target-tenant':        { he: 'ארגון לקוח ממוקד',            en: 'tenant matched target' },
  'target-excluded':      { he: 'משתמש לא עומד ברשימת מיקוד',  en: 'user failed required target filter' },
  'rollout-in':           { he: 'משתמש נכלל בדלי הפריסה',      en: 'user bucket within rollout' },
  'rollout-out':          { he: 'משתמש מחוץ לדלי הפריסה',      en: 'user bucket outside rollout' },
  'rollout-100':          { he: 'פריסה מלאה — 100%',           en: 'full rollout — 100%' },
  'rollout-0':            { he: 'פריסה בטלה — 0%',             en: 'rollout zero — 0%' },
  'default-on':           { he: 'ברירת מחדל: מופעל',            en: 'default on' },
  'default-off':          { he: 'ברירת מחדל: כבוי',             en: 'default off' },
  'error':                { he: 'שגיאת הערכה — נפל לברירת מחדל',en: 'evaluation error — fell back' },
};

function _reasonPair(code, extra) {
  const base = REASONS[code] || { he: code, en: code };
  if (!extra) return { code, he: base.he, en: base.en };
  return {
    code,
    he: base.he + ' — ' + extra,
    en: base.en + ' — ' + extra,
  };
}

// ──────────────────────────────────────────────────────────────
// 3.  FlagDistributor class
// ──────────────────────────────────────────────────────────────

class FlagDistributor {
  /**
   * @param {object} opts
   * @param {number}   [opts.hashSeed=0]       - murmur seed
   * @param {number}   [opts.auditRingSize=500]- max in-memory audit entries
   * @param {function} [opts.clock]            - injectable Date source for tests
   * @param {function} [opts.auditSink]        - (entry) => void, optional
   */
  constructor(opts) {
    opts = opts || {};
    this.hashSeed = (typeof opts.hashSeed === 'number') ? (opts.hashSeed >>> 0) : 0;
    this.auditRingSize = Math.max(1, opts.auditRingSize || 500);
    this.clock = (typeof opts.clock === 'function') ? opts.clock : null;
    this.auditSink = (typeof opts.auditSink === 'function') ? opts.auditSink : null;

    /** @type {Map<string, object>} */
    this.flags = new Map();
    /** @type {Array<object>} */
    this.auditLog = [];
    this.evalCount = 0;
  }

  // ── 3.1 Flag registration / upgrade ──────────────────────────

  /**
   * Register a new flag OR non-destructively upgrade an existing one.
   * Never deletes.
   *
   * @param {object} spec
   * @param {string} spec.key                - flag identifier
   * @param {boolean}[spec.enabled=true]     - global on/off (default-on)
   * @param {boolean}[spec.killSwitch=false] - emergency off — overrides ALL
   * @param {number} [spec.rollout=100]      - 0..100 percent rollout
   * @param {string[]}[spec.variants]        - variant pool (A/B/C...)
   * @param {object} [spec.targeting]        - {userIds, emailDomains, segments, countries, tenantIds}
   * @param {string[]}[spec.dependsOn]       - other flags that must be enabled
   * @param {string} [spec.description_he]
   * @param {string} [spec.description_en]
   * @param {string} [spec.owner]
   */
  register(spec) {
    if (!spec || typeof spec !== 'object') {
      throw new TypeError('FlagDistributor.register: spec must be an object');
    }
    if (!spec.key || typeof spec.key !== 'string') {
      throw new TypeError('FlagDistributor.register: spec.key required');
    }

    const prev = this.flags.get(spec.key) || null;
    const now = _nowIso(this.clock);

    const merged = {
      key:             spec.key,
      enabled:         spec.enabled === false ? false : true,
      killSwitch:      spec.killSwitch === true,
      rollout:         _clampRollout(spec.rollout, prev ? prev.rollout : 100),
      variants:        _arrayOrEmpty(spec.variants).slice(),
      targeting: {
        userIds:       _arrayOrEmpty(spec.targeting && spec.targeting.userIds),
        emailDomains:  _arrayOrEmpty(spec.targeting && spec.targeting.emailDomains).map(function (d) { return String(d).toLowerCase(); }),
        segments:      _arrayOrEmpty(spec.targeting && spec.targeting.segments),
        countries:     _arrayOrEmpty(spec.targeting && spec.targeting.countries).map(function (c) { return String(c).toUpperCase(); }),
        tenantIds:     _arrayOrEmpty(spec.targeting && spec.targeting.tenantIds),
      },
      dependsOn:       _arrayOrEmpty(spec.dependsOn).slice(),
      description_he:  spec.description_he || (prev && prev.description_he) || '',
      description_en:  spec.description_en || (prev && prev.description_en) || '',
      owner:           spec.owner || (prev && prev.owner) || 'system',
      version:         prev ? (prev.version + 1) : 1,
      createdAt:       prev ? prev.createdAt : now,
      updatedAt:       now,
    };

    this.flags.set(spec.key, merged);
    this._audit({
      ts:       now,
      event:    prev ? 'upgrade' : 'register',
      flagKey:  spec.key,
      version:  merged.version,
      before:   prev ? _clone(prev) : null,
      after:    _clone(merged),
      message_he: prev
        ? ('דגל ' + spec.key + ' שודרג לגרסה ' + merged.version)
        : ('דגל ' + spec.key + ' נרשם בגרסה 1'),
      message_en: prev
        ? ('flag ' + spec.key + ' upgraded to version ' + merged.version)
        : ('flag ' + spec.key + ' registered at version 1'),
    });
    return _clone(merged);
  }

  /**
   * Toggle the kill switch on/off — never deletes the flag.
   */
  setKillSwitch(flagKey, on, actor) {
    const f = this.flags.get(flagKey);
    if (!f) {
      throw new Error('FlagDistributor.setKillSwitch: unknown flag ' + flagKey);
    }
    const prev = _clone(f);
    f.killSwitch = !!on;
    f.version += 1;
    f.updatedAt = _nowIso(this.clock);
    this._audit({
      ts:       f.updatedAt,
      event:    'kill-switch',
      flagKey:  flagKey,
      actor:    actor || 'system',
      before:   prev,
      after:    _clone(f),
      message_he: on
        ? ('מתג כיבוי חירום הופעל עבור ' + flagKey)
        : ('מתג כיבוי חירום כובה עבור ' + flagKey),
      message_en: on
        ? ('kill switch engaged for ' + flagKey)
        : ('kill switch released for ' + flagKey),
    });
    return _clone(f);
  }

  /**
   * Update rollout percentage without touching other fields.
   */
  setRollout(flagKey, percent, actor) {
    const f = this.flags.get(flagKey);
    if (!f) {
      throw new Error('FlagDistributor.setRollout: unknown flag ' + flagKey);
    }
    const prev = _clone(f);
    f.rollout = _clampRollout(percent, f.rollout);
    f.version += 1;
    f.updatedAt = _nowIso(this.clock);
    this._audit({
      ts:       f.updatedAt,
      event:    'rollout',
      flagKey:  flagKey,
      actor:    actor || 'system',
      before:   prev,
      after:    _clone(f),
      message_he: 'אחוז הפריסה עודכן ל-' + f.rollout + '% עבור ' + flagKey,
      message_en: 'rollout updated to ' + f.rollout + '% for ' + flagKey,
    });
    return _clone(f);
  }

  /** Returns a defensive copy of the flag — or undefined. */
  getFlag(flagKey) {
    const f = this.flags.get(flagKey);
    return f ? _clone(f) : undefined;
  }

  /** List every registered flag (defensive copy). */
  listFlags() {
    const out = [];
    for (const f of this.flags.values()) out.push(_clone(f));
    return out;
  }

  // ── 3.2 Evaluation ───────────────────────────────────────────

  /**
   * Evaluate a flag for a user. Never throws.
   *
   * @param {string} flagKey
   * @param {object} userContext - { userId, email, segment, country, tenantId }
   * @returns {{
   *   enabled:  boolean,
   *   variant:  string|null,
   *   reason:   { code:string, he:string, en:string },
   *   bucket:   number,
   *   rollout:  number,
   *   killed:   boolean,
   *   flagKey:  string,
   *   version:  number|null,
   *   evaluatedAt: string
   * }}
   */
  evaluate(flagKey, userContext) {
    const ts = _nowIso(this.clock);
    const ctx = (userContext && typeof userContext === 'object') ? userContext : {};
    const result = {
      flagKey:     flagKey,
      enabled:     false,
      variant:     null,
      reason:      null,
      bucket:      -1,
      rollout:     0,
      killed:      false,
      version:     null,
      evaluatedAt: ts,
    };

    try {
      const flag = this.flags.get(flagKey);
      if (!flag) {
        result.reason = _reasonPair('not-registered', flagKey);
        this._recordDecision(result, ctx);
        return result;
      }
      result.version = flag.version;
      result.rollout = flag.rollout;

      // (1) Kill switch overrides everything.
      if (flag.killSwitch) {
        result.killed = true;
        result.reason = _reasonPair('killed', flagKey);
        this._recordDecision(result, ctx);
        return result;
      }

      // (2) Global enabled gate.
      if (flag.enabled === false) {
        result.reason = _reasonPair('disabled-global', flagKey);
        this._recordDecision(result, ctx);
        return result;
      }

      // (3) Prerequisite flags must also be enabled.
      for (let i = 0; i < flag.dependsOn.length; i++) {
        const depKey = flag.dependsOn[i];
        const dep = this.flags.get(depKey);
        if (!dep) {
          result.reason = _reasonPair('dependency-missing', depKey);
          this._recordDecision(result, ctx);
          return result;
        }
        // Recurse with the same context — cheap, flags trees are shallow.
        const depResult = this.evaluate(depKey, ctx);
        if (!depResult.enabled) {
          result.reason = _reasonPair('dependency-off', depKey);
          this._recordDecision(result, ctx);
          return result;
        }
      }

      // (4) Targeting — any matching rule short-circuits to ENABLED.
      const t = flag.targeting;
      const hasExplicitTargets =
        t.userIds.length +
        t.emailDomains.length +
        t.segments.length +
        t.countries.length +
        t.tenantIds.length > 0;

      if (t.userIds.length && ctx.userId && t.userIds.indexOf(ctx.userId) >= 0) {
        result.enabled = true;
        result.reason = _reasonPair('target-user', ctx.userId);
        result.bucket = bucketOf(flagKey, _userKey(ctx), this.hashSeed);
        result.variant = _pickVariant(flag.variants, result.bucket);
        this._recordDecision(result, ctx);
        return result;
      }

      const domain = _extractDomain(ctx.email);
      if (t.emailDomains.length && domain && t.emailDomains.indexOf(domain) >= 0) {
        result.enabled = true;
        result.reason = _reasonPair('target-email-domain', domain);
        result.bucket = bucketOf(flagKey, _userKey(ctx), this.hashSeed);
        result.variant = _pickVariant(flag.variants, result.bucket);
        this._recordDecision(result, ctx);
        return result;
      }

      if (t.segments.length && ctx.segment && t.segments.indexOf(ctx.segment) >= 0) {
        result.enabled = true;
        result.reason = _reasonPair('target-segment', ctx.segment);
        result.bucket = bucketOf(flagKey, _userKey(ctx), this.hashSeed);
        result.variant = _pickVariant(flag.variants, result.bucket);
        this._recordDecision(result, ctx);
        return result;
      }

      const country = ctx.country ? String(ctx.country).toUpperCase() : null;
      if (t.countries.length && country && t.countries.indexOf(country) >= 0) {
        result.enabled = true;
        result.reason = _reasonPair('target-country', country);
        result.bucket = bucketOf(flagKey, _userKey(ctx), this.hashSeed);
        result.variant = _pickVariant(flag.variants, result.bucket);
        this._recordDecision(result, ctx);
        return result;
      }

      if (t.tenantIds.length && ctx.tenantId && t.tenantIds.indexOf(ctx.tenantId) >= 0) {
        result.enabled = true;
        result.reason = _reasonPair('target-tenant', ctx.tenantId);
        result.bucket = bucketOf(flagKey, _userKey(ctx), this.hashSeed);
        result.variant = _pickVariant(flag.variants, result.bucket);
        this._recordDecision(result, ctx);
        return result;
      }

      // If targeting exists AND the user matched *no* rule, fall through to
      // rollout — targeting expands the rollout audience, it does not replace
      // it. This matches the semantics of X-98 / industry norm.

      // (5) Rollout bucket check.
      const userK = _userKey(ctx);
      const bucket = bucketOf(flagKey, userK, this.hashSeed);
      result.bucket = bucket;

      if (flag.rollout >= 100) {
        result.enabled = true;
        result.reason = _reasonPair('rollout-100', flagKey);
        result.variant = _pickVariant(flag.variants, bucket);
        this._recordDecision(result, ctx);
        return result;
      }

      if (flag.rollout <= 0) {
        // Rollout is zero. If there was explicit targeting and we got here,
        // the user simply didn't match any target AND rollout is zero.
        result.enabled = false;
        result.reason = hasExplicitTargets
          ? _reasonPair('target-excluded', flagKey)
          : _reasonPair('rollout-0', flagKey);
        this._recordDecision(result, ctx);
        return result;
      }

      // bucket is 0..9999 (0.01% precision), compare to percent*100.
      const threshold = Math.round(flag.rollout * 100);
      if (bucket < threshold) {
        result.enabled = true;
        result.reason = _reasonPair('rollout-in', bucket + '/' + threshold);
        result.variant = _pickVariant(flag.variants, bucket);
      } else {
        result.enabled = false;
        result.reason = _reasonPair('rollout-out', bucket + '/' + threshold);
      }
      this._recordDecision(result, ctx);
      return result;
    } catch (err) {
      // Never throw out of evaluate — feature flags must degrade gracefully.
      result.enabled = false;
      result.reason = _reasonPair('error', err && err.message);
      this._recordDecision(result, ctx);
      return result;
    }
  }

  /**
   * Short-hand boolean check.
   */
  isEnabled(flagKey, userContext) {
    return this.evaluate(flagKey, userContext).enabled === true;
  }

  // ── 3.3 Audit log access ─────────────────────────────────────

  /**
   * Return the most recent N audit entries (defensive copies).
   * @param {number} [n]
   */
  getAuditLog(n) {
    const total = this.auditLog.length;
    if (typeof n !== 'number' || n <= 0 || n >= total) {
      return this.auditLog.map(_clone);
    }
    return this.auditLog.slice(total - n).map(_clone);
  }

  /** Total evaluations performed since construction. */
  getStats() {
    return {
      evalCount:    this.evalCount,
      auditSize:    this.auditLog.length,
      flagCount:    this.flags.size,
      hashSeed:     this.hashSeed,
    };
  }

  // ── 3.4 Internal ─────────────────────────────────────────────

  _audit(entry) {
    this.auditLog.push(entry);
    // Ring trim — drop oldest when over the ring size. (Keeps admin events
    // + evaluations together; production will typically pipe to a sink.)
    while (this.auditLog.length > this.auditRingSize) {
      this.auditLog.shift();
    }
    if (this.auditSink) {
      try { this.auditSink(_clone(entry)); } catch (_e) { /* never throw */ }
    }
  }

  _recordDecision(result, ctx) {
    this.evalCount += 1;
    const userK = _userKey(ctx);
    const reason = result.reason || _reasonPair('default-off');
    this._audit({
      ts:         result.evaluatedAt,
      event:      'evaluate',
      flagKey:    result.flagKey,
      version:    result.version,
      user:       userK,
      enabled:    result.enabled,
      variant:    result.variant,
      bucket:     result.bucket,
      rollout:    result.rollout,
      killed:     result.killed,
      reasonCode: reason.code,
      message_he:
        (result.enabled ? 'דגל ' + result.flagKey + ' הופעל למשתמש ' + userK + ' — ' : 'דגל ' + result.flagKey + ' לא הופעל למשתמש ' + userK + ' — ') +
        reason.he,
      message_en:
        (result.enabled ? 'flag ' + result.flagKey + ' enabled for user ' + userK + ' — ' : 'flag ' + result.flagKey + ' disabled for user ' + userK + ' — ') +
        reason.en,
    });
  }
}

// ──────────────────────────────────────────────────────────────
// 4.  Pure helpers exported for tests & reuse
// ──────────────────────────────────────────────────────────────

function _clampRollout(v, fallback) {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return (typeof fallback === 'number') ? fallback : 100;
  }
  if (v < 0)   return 0;
  if (v > 100) return 100;
  return v;
}

/**
 * Deterministic variant pick — each user always gets the same variant.
 * Returns null if variants is empty.
 */
function _pickVariant(variants, bucket) {
  if (!Array.isArray(variants) || variants.length === 0) return null;
  const idx = ((bucket % variants.length) + variants.length) % variants.length;
  return variants[idx];
}

// ──────────────────────────────────────────────────────────────
// 5.  Exports
// ──────────────────────────────────────────────────────────────

module.exports = {
  FlagDistributor,
  murmurHash3_32,
  bucketOf,
  // Exposed for unit-testing internals:
  _pickVariant,
  _clampRollout,
  _extractDomain,
  REASONS,
};
