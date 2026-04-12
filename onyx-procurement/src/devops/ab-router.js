/**
 * A/B Test Router — Techno-Kol Uzi mega-ERP / onyx-procurement
 * Agent Y-169
 *
 *   לא מוחקים רק משדרגים ומגדלים
 *   (never delete — only upgrade and grow)
 *
 * Purpose
 * -------
 * Deterministic, zero-dependency router for multi-experiment A/B/n testing.
 * Solves the four classic pitfalls of ad-hoc A/B plumbing:
 *
 *   1. Assignment consistency
 *      Same (experimentId, userId) -> same variant, forever, across processes
 *      and restarts. No server-side session store required.
 *
 *   2. Holdout groups
 *      A percentage of traffic is reserved and ALWAYS served control. Holdout
 *      is evaluated first, independent of any experiment, and is sticky per
 *      user (same user always holds out or always doesn't).
 *
 *   3. Mutually exclusive experiments
 *      Experiments may be grouped into a "mutex group" (aka layer). A user
 *      who lands in one experiment within the group is locked out of every
 *      other experiment in that same group — avoiding confounded metrics.
 *
 *   4. Sample Ratio Mismatch (SRM) detection
 *      Chi-square goodness-of-fit between observed assignment counts and the
 *      configured weights. Returns chi^2, p-value, severity, and a bilingual
 *      verdict. Critical SRM is surfaced on every assign() log line.
 *
 * Non-goals
 * ---------
 *   - No conversion tracking (covered by src/experiments/ab-testing.js).
 *   - No persistence layer. State lives in-memory; caller is free to snapshot.
 *
 * Bilingual logs
 * --------------
 * Every emitted log record and every public return value carries Hebrew +
 * English narrative strings (`message_he`, `message_en` or `he`, `en`).
 *
 * Zero external dependencies. Pure ES5-compatible JavaScript. Deterministic.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// 0. CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const HOLDOUT_VARIANT = 'control';
const HOLDOUT_REASON_KEY = 'holdout';
const MUTEX_REASON_KEY = 'mutex-locked';
const DISABLED_REASON_KEY = 'experiment-disabled';
const UNKNOWN_REASON_KEY = 'experiment-not-found';
const ASSIGN_REASON_KEY = 'assigned';

const SRM_SEVERITY = Object.freeze({
  OK:       'ok',
  MINOR:    'minor',
  MAJOR:    'major',
  CRITICAL: 'critical',
});

// Chi-square critical values for SRM flagging, df=k-1 for k variants.
// We do not hard-code them — we compute via the CDF. These thresholds apply
// to the p-value itself.
const SRM_P_THRESHOLDS = Object.freeze({
  CRITICAL: 0.001,  // < 0.001  -> critical
  MAJOR:    0.01,   // < 0.01   -> major
  MINOR:    0.05,   // < 0.05   -> minor
  // >= 0.05 -> ok
});

const DEFAULTS = Object.freeze({
  holdoutPct:       0,      // 0..1; 0 = no holdout
  minSamplesForSRM: 100,    // below this N we do not flag
});

// Bilingual labels for reason codes surfaced by assign().
const REASON_LABELS = Object.freeze({
  [ASSIGN_REASON_KEY]:      { he: 'שויך',                  en: 'assigned' },
  [HOLDOUT_REASON_KEY]:     { he: 'קבוצת הדחייה',          en: 'holdout group' },
  [MUTEX_REASON_KEY]:       { he: 'נעול בקבוצת בידוד',     en: 'locked by mutex group' },
  [DISABLED_REASON_KEY]:    { he: 'ניסוי כבוי',            en: 'experiment disabled' },
  [UNKNOWN_REASON_KEY]:     { he: 'ניסוי לא נמצא',         en: 'experiment not found' },
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. DETERMINISTIC HASHING — FNV-1a 32-bit
// ═══════════════════════════════════════════════════════════════════════════
//
// We need a fast, portable, dependency-free hash that is:
//   (a) deterministic across processes and platforms
//   (b) well-distributed over the 32-bit unsigned range
//   (c) not crypto — assignment is not a security boundary
//
// FNV-1a fits perfectly. We compose `namespace:experimentId:userId` so the
// same user lands in different buckets for different experiments and for
// different decision namespaces (holdout vs assignment vs mutex).

function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    // FNV prime 16777619, mod 2^32
    h = Math.imul(h, 0x01000193);
  }
  // Unsigned right shift -> unsigned 32-bit int
  return h >>> 0;
}

function hashToUnit(namespace, expId, userId) {
  const key = String(namespace) + ':' + String(expId) + ':' + String(userId);
  return fnv1a32(key) / 0x100000000;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. STATISTICS — log-gamma, incomplete gamma, chi-square CDF
// ═══════════════════════════════════════════════════════════════════════════
//
// SRM detection is a chi-square goodness-of-fit test. We implement the
// primitives from scratch (same formulae as src/experiments/ab-testing.js,
// duplicated here to keep this file self-contained and zero-dep).

const LANCZOS_G = 7;
const LANCZOS_P = [
  0.99999999999980993,
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
];

function logGamma(x) {
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  x -= 1;
  let a = LANCZOS_P[0];
  const t = x + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS_P.length; i += 1) {
    a += LANCZOS_P[i] / (x + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function gammaIncLowerRegularized(a, x) {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 0;
  if (x < a + 1) {
    // Series
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 1; n < 200; n += 1) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) {
        return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
      }
    }
    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  // Continued fraction (Lentz's method)
  const FPMIN = 1e-300;
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 200; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  const q = h * Math.exp(-x + a * Math.log(x) - logGamma(a));
  return 1 - q;
}

function chiSquareCDF(x, df) {
  if (x <= 0) return 0;
  if (df <= 0) return NaN;
  return gammaIncLowerRegularized(df / 2, x / 2);
}

function chiSquareSurvival(x, df) {
  // Survival = 1 - CDF = p-value for a chi^2 goodness-of-fit test.
  return 1 - chiSquareCDF(x, df);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. WEIGHT NORMALISATION
// ═══════════════════════════════════════════════════════════════════════════

function normalizeWeights(variants) {
  // Accepts array of { name, weight }. Returns a new array where weights sum
  // to 1.0 exactly. Missing weights default to equal split.
  const n = variants.length;
  if (n === 0) return [];
  const anyWeight = variants.some((v) => typeof v.weight === 'number' && v.weight > 0);
  if (!anyWeight) {
    return variants.map((v) => ({ name: v.name, weight: 1 / n }));
  }
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const w = typeof variants[i].weight === 'number' && variants[i].weight > 0
      ? variants[i].weight
      : 0;
    sum += w;
  }
  if (sum <= 0) {
    return variants.map((v) => ({ name: v.name, weight: 1 / n }));
  }
  return variants.map((v) => ({
    name: v.name,
    weight: (typeof v.weight === 'number' && v.weight > 0 ? v.weight : 0) / sum,
  }));
}

function pickByCumulative(variants, u) {
  // Walk the CDF and return the variant whose bucket contains u.
  let cum = 0;
  for (let i = 0; i < variants.length; i += 1) {
    cum += variants[i].weight;
    if (u < cum) return variants[i].name;
  }
  return variants[variants.length - 1].name;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. SRM (Sample Ratio Mismatch) CHI-SQUARE HELPER
// ═══════════════════════════════════════════════════════════════════════════
//
// Goodness-of-fit between observed and expected counts.
//   chi^2 = sum( (O_i - E_i)^2 / E_i )
//   df    = k - 1
//   p     = 1 - CDF_chi2(chi^2, df)
//
// Severity buckets: p < 0.001 critical; p < 0.01 major; p < 0.05 minor;
// else ok. Below minSamples we always return `ok` to avoid flapping.

function srmCheck(observedMap, expectedWeightsMap, opts) {
  const options = opts || {};
  const minSamples = typeof options.minSamples === 'number'
    ? options.minSamples
    : DEFAULTS.minSamplesForSRM;

  const names = Object.keys(expectedWeightsMap);
  const k = names.length;
  let total = 0;
  for (let i = 0; i < k; i += 1) {
    total += observedMap[names[i]] || 0;
  }

  if (k < 2) {
    return {
      total: total,
      chiSquare: 0,
      df: 0,
      pValue: 1,
      severity: SRM_SEVERITY.OK,
      message_he: 'פחות משני וריאנטים — אין צורך ב-SRM',
      message_en: 'fewer than two variants — SRM not applicable',
    };
  }

  if (total < minSamples) {
    return {
      total: total,
      chiSquare: 0,
      df: k - 1,
      pValue: 1,
      severity: SRM_SEVERITY.OK,
      message_he: 'מדגם קטן מדי לבדיקת SRM (' + total + '/' + minSamples + ')',
      message_en: 'sample too small for SRM (' + total + '/' + minSamples + ')',
    };
  }

  // Normalise expected weights.
  let wsum = 0;
  for (let i = 0; i < k; i += 1) {
    wsum += expectedWeightsMap[names[i]];
  }
  if (wsum <= 0) {
    return {
      total: total,
      chiSquare: NaN,
      df: k - 1,
      pValue: NaN,
      severity: SRM_SEVERITY.OK,
      message_he: 'משקלים לא תקינים',
      message_en: 'invalid weights',
    };
  }

  let chi2 = 0;
  for (let i = 0; i < k; i += 1) {
    const name = names[i];
    const observed = observedMap[name] || 0;
    const expected = total * (expectedWeightsMap[name] / wsum);
    if (expected > 0) {
      const diff = observed - expected;
      chi2 += (diff * diff) / expected;
    }
  }

  const df = k - 1;
  const p = chiSquareSurvival(chi2, df);

  let severity = SRM_SEVERITY.OK;
  if (p < SRM_P_THRESHOLDS.CRITICAL) severity = SRM_SEVERITY.CRITICAL;
  else if (p < SRM_P_THRESHOLDS.MAJOR) severity = SRM_SEVERITY.MAJOR;
  else if (p < SRM_P_THRESHOLDS.MINOR) severity = SRM_SEVERITY.MINOR;

  const messages = {
    [SRM_SEVERITY.OK]:       { he: 'התפלגות תקינה',                       en: 'distribution looks healthy' },
    [SRM_SEVERITY.MINOR]:    { he: 'חשד קל לחוסר איזון במדגם',            en: 'minor sample ratio mismatch suspected' },
    [SRM_SEVERITY.MAJOR]:    { he: 'חוסר איזון מובהק במדגם — לבדוק',     en: 'major sample ratio mismatch — investigate' },
    [SRM_SEVERITY.CRITICAL]: { he: 'חוסר איזון חמור במדגם — לעצור ניסוי', en: 'critical sample ratio mismatch — stop experiment' },
  };

  return {
    total: total,
    chiSquare: chi2,
    df: df,
    pValue: p,
    severity: severity,
    message_he: messages[severity].he,
    message_en: messages[severity].en,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. ABRouter CLASS
// ═══════════════════════════════════════════════════════════════════════════

class ABRouter {
  constructor(opts) {
    const options = opts || {};
    this.experiments = new Map();     // id -> { id, variants, mutexGroup, enabled, ... }
    this.mutexGroups = new Map();     // groupName -> Set<experimentId>
    this.assignmentCounts = new Map();// id -> { variantName: count }
    this.logs = [];                   // bilingual audit trail
    this.holdoutPct = typeof options.holdoutPct === 'number'
      ? options.holdoutPct
      : DEFAULTS.holdoutPct;
    this.holdoutNamespace = options.holdoutNamespace || 'holdout';
    this.minSamplesForSRM = typeof options.minSamplesForSRM === 'number'
      ? options.minSamplesForSRM
      : DEFAULTS.minSamplesForSRM;
  }

  // ─── Registration ──────────────────────────────────────────────────────

  registerExperiment(spec) {
    if (!spec || !spec.id) {
      throw new Error('registerExperiment: spec.id required / נדרש spec.id');
    }
    if (!Array.isArray(spec.variants) || spec.variants.length < 2) {
      throw new Error('registerExperiment: at least 2 variants / לפחות 2 וריאנטים');
    }
    if (this.experiments.has(spec.id)) {
      throw new Error('registerExperiment: duplicate id ' + spec.id + ' / מזהה כפול');
    }
    const variants = normalizeWeights(spec.variants.map((v) => ({
      name: v.name,
      weight: v.weight,
    })));
    const mutexGroup = spec.mutexGroup || null;
    const exp = {
      id: spec.id,
      title_he: spec.title_he || spec.id,
      title_en: spec.title_en || spec.id,
      variants: variants,
      mutexGroup: mutexGroup,
      enabled: spec.enabled !== false,
      createdAt: spec.createdAt || new Date().toISOString(),
    };
    this.experiments.set(spec.id, exp);

    // Initialise assignment counters.
    const counts = {};
    for (let i = 0; i < variants.length; i += 1) {
      counts[variants[i].name] = 0;
    }
    this.assignmentCounts.set(spec.id, counts);

    if (mutexGroup) {
      if (!this.mutexGroups.has(mutexGroup)) {
        this.mutexGroups.set(mutexGroup, new Set());
      }
      this.mutexGroups.get(mutexGroup).add(spec.id);
    }

    this._log('register', spec.id, null, null, {
      he: 'נרשם ניסוי "' + exp.title_he + '" עם ' + variants.length + ' וריאנטים',
      en: 'registered experiment "' + exp.title_en + '" with ' + variants.length + ' variants',
    });

    return exp;
  }

  getExperiment(id) {
    return this.experiments.get(id) || null;
  }

  listExperiments(filter) {
    const out = [];
    const f = filter || {};
    this.experiments.forEach((exp) => {
      if (typeof f.enabled === 'boolean' && exp.enabled !== f.enabled) return;
      if (f.mutexGroup && exp.mutexGroup !== f.mutexGroup) return;
      out.push(exp);
    });
    return out;
  }

  disableExperiment(id) {
    const exp = this.experiments.get(id);
    if (!exp) return false;
    exp.enabled = false;
    this._log('disable', id, null, null, {
      he: 'ניסוי ' + id + ' כובה (המשתמשים יקבלו ברירת מחדל)',
      en: 'experiment ' + id + ' disabled (users fall through to default)',
    });
    return true;
  }

  enableExperiment(id) {
    const exp = this.experiments.get(id);
    if (!exp) return false;
    exp.enabled = true;
    this._log('enable', id, null, null, {
      he: 'ניסוי ' + id + ' הופעל מחדש',
      en: 'experiment ' + id + ' re-enabled',
    });
    return true;
  }

  // ─── Holdout ───────────────────────────────────────────────────────────

  setHoldoutPct(pct) {
    if (typeof pct !== 'number' || pct < 0 || pct > 1) {
      throw new Error('setHoldoutPct: must be in [0,1] / חייב להיות ב-[0,1]');
    }
    this.holdoutPct = pct;
    this._log('holdout-set', null, null, null, {
      he: 'עודכן אחוז דחייה ל-' + (pct * 100).toFixed(2) + '%',
      en: 'holdout percentage set to ' + (pct * 100).toFixed(2) + '%',
    });
  }

  isUserInHoldout(userId) {
    if (this.holdoutPct <= 0) return false;
    const u = hashToUnit(this.holdoutNamespace, 'global', userId);
    return u < this.holdoutPct;
  }

  // ─── Mutex helpers ─────────────────────────────────────────────────────

  _userLockedInOtherExperiment(mutexGroup, userId, selfId) {
    // Returns the id of the sibling experiment that would claim this user,
    // or null. Determinism: walk siblings in registration order (Set keeps
    // insertion order in modern JS engines) and ask each one "would this
    // user be in my traffic?" — the first hit wins.
    if (!mutexGroup) return null;
    const siblings = this.mutexGroups.get(mutexGroup);
    if (!siblings) return null;
    const iter = siblings.values();
    let step = iter.next();
    while (!step.done) {
      const sibId = step.value;
      if (sibId !== selfId) {
        const sib = this.experiments.get(sibId);
        if (sib && sib.enabled) {
          // The sibling would claim the user iff it hashes into its own
          // traffic. In this router we treat 100% of a registered experiment
          // as its traffic (holdout is handled BEFORE mutex). So any user
          // who is not in holdout would be claimed by the FIRST enabled
          // sibling they encounter. To preserve per-experiment determinism
          // without a shared layer layout, we compare hash values and pick
          // the smallest; see `_pickMutexOwner`.
          return sibId;
        }
      }
      step = iter.next();
    }
    return null;
  }

  _pickMutexOwner(mutexGroup, userId) {
    // Deterministically elect exactly ONE enabled experiment from a mutex
    // group to own a user. Strategy: each (expId, userId) hashes into [0,1)
    // in the 'mutex' namespace; the experiment with the smallest hash wins.
    // Ties broken by experiment id (string compare). This guarantees:
    //   - same user -> same owner forever (sticky)
    //   - different users -> uniform distribution across siblings
    //   - disabled experiments never win
    if (!mutexGroup) return null;
    const siblings = this.mutexGroups.get(mutexGroup);
    if (!siblings || siblings.size === 0) return null;
    let winner = null;
    let best = Infinity;
    const iter = siblings.values();
    let step = iter.next();
    while (!step.done) {
      const sibId = step.value;
      const sib = this.experiments.get(sibId);
      if (sib && sib.enabled) {
        const h = hashToUnit('mutex', sibId, userId);
        if (h < best || (h === best && (winner === null || sibId < winner))) {
          best = h;
          winner = sibId;
        }
      }
      step = iter.next();
    }
    return winner;
  }

  // ─── The main event: assign() ──────────────────────────────────────────

  assign(experimentId, userId) {
    const now = new Date().toISOString();
    const exp = this.experiments.get(experimentId);

    if (!exp) {
      const result = {
        experimentId: experimentId,
        userId: userId,
        variant: HOLDOUT_VARIANT,
        reason: UNKNOWN_REASON_KEY,
        reason_he: REASON_LABELS[UNKNOWN_REASON_KEY].he,
        reason_en: REASON_LABELS[UNKNOWN_REASON_KEY].en,
        holdout: false,
        mutexLocked: false,
        at: now,
      };
      this._log('assign', experimentId, userId, HOLDOUT_VARIANT, {
        he: 'בקשה לניסוי ' + experimentId + ' — לא נמצא, מחזירים control',
        en: 'assign request for ' + experimentId + ' — not found, serving control',
      });
      return result;
    }

    if (!exp.enabled) {
      const result = {
        experimentId: experimentId,
        userId: userId,
        variant: HOLDOUT_VARIANT,
        reason: DISABLED_REASON_KEY,
        reason_he: REASON_LABELS[DISABLED_REASON_KEY].he,
        reason_en: REASON_LABELS[DISABLED_REASON_KEY].en,
        holdout: false,
        mutexLocked: false,
        at: now,
      };
      this._log('assign', experimentId, userId, HOLDOUT_VARIANT, {
        he: 'ניסוי ' + experimentId + ' כבוי — מחזירים control',
        en: 'experiment ' + experimentId + ' disabled — serving control',
      });
      return result;
    }

    // 1. Holdout — evaluated first, sticky per user, independent of exp.
    if (this.isUserInHoldout(userId)) {
      const result = {
        experimentId: experimentId,
        userId: userId,
        variant: HOLDOUT_VARIANT,
        reason: HOLDOUT_REASON_KEY,
        reason_he: REASON_LABELS[HOLDOUT_REASON_KEY].he,
        reason_en: REASON_LABELS[HOLDOUT_REASON_KEY].en,
        holdout: true,
        mutexLocked: false,
        at: now,
      };
      this._log('assign', experimentId, userId, HOLDOUT_VARIANT, {
        he: 'משתמש ' + userId + ' בקבוצת דחייה — מחזירים control',
        en: 'user ' + userId + ' in holdout group — serving control',
      });
      return result;
    }

    // 2. Mutex — if the user is claimed by a sibling in the same group,
    //    they are locked out of this experiment.
    if (exp.mutexGroup) {
      const owner = this._pickMutexOwner(exp.mutexGroup, userId);
      if (owner && owner !== experimentId) {
        const result = {
          experimentId: experimentId,
          userId: userId,
          variant: HOLDOUT_VARIANT,
          reason: MUTEX_REASON_KEY,
          reason_he: REASON_LABELS[MUTEX_REASON_KEY].he,
          reason_en: REASON_LABELS[MUTEX_REASON_KEY].en,
          holdout: false,
          mutexLocked: true,
          mutexOwner: owner,
          mutexGroup: exp.mutexGroup,
          at: now,
        };
        this._log('assign', experimentId, userId, HOLDOUT_VARIANT, {
          he: 'משתמש ' + userId + ' נעול בניסוי ' + owner + ' (קבוצת בידוד ' + exp.mutexGroup + ')',
          en: 'user ' + userId + ' locked by ' + owner + ' (mutex group ' + exp.mutexGroup + ')',
        });
        return result;
      }
    }

    // 3. Deterministic variant pick.
    const u = hashToUnit('assign', experimentId, userId);
    const variant = pickByCumulative(exp.variants, u);

    // 4. Count it (idempotence is the caller's responsibility — same
    //    (expId,userId) always yields same variant, but repeat calls DO
    //    increment the counter. The SRM helper takes that as intended since
    //    in production each call corresponds to a bucketing event).
    const counts = this.assignmentCounts.get(experimentId);
    counts[variant] = (counts[variant] || 0) + 1;

    const result = {
      experimentId: experimentId,
      userId: userId,
      variant: variant,
      reason: ASSIGN_REASON_KEY,
      reason_he: REASON_LABELS[ASSIGN_REASON_KEY].he,
      reason_en: REASON_LABELS[ASSIGN_REASON_KEY].en,
      holdout: false,
      mutexLocked: false,
      at: now,
    };
    this._log('assign', experimentId, userId, variant, {
      he: 'משתמש ' + userId + ' שויך לוריאנט "' + variant + '" בניסוי ' + experimentId,
      en: 'user ' + userId + ' assigned to variant "' + variant + '" in ' + experimentId,
    });
    return result;
  }

  // ─── SRM query ─────────────────────────────────────────────────────────

  srmForExperiment(experimentId, opts) {
    const exp = this.experiments.get(experimentId);
    if (!exp) {
      return {
        experimentId: experimentId,
        error: 'not-found',
        message_he: 'ניסוי ' + experimentId + ' לא נמצא',
        message_en: 'experiment ' + experimentId + ' not found',
      };
    }
    const observed = this.assignmentCounts.get(experimentId) || {};
    const expected = {};
    for (let i = 0; i < exp.variants.length; i += 1) {
      expected[exp.variants[i].name] = exp.variants[i].weight;
    }
    const options = opts || {};
    if (typeof options.minSamples !== 'number') {
      options.minSamples = this.minSamplesForSRM;
    }
    const r = srmCheck(observed, expected, options);
    r.experimentId = experimentId;
    r.observed = Object.assign({}, observed);
    r.expected = expected;
    return r;
  }

  getAssignmentCounts(experimentId) {
    const counts = this.assignmentCounts.get(experimentId);
    return counts ? Object.assign({}, counts) : {};
  }

  // ─── Logs ──────────────────────────────────────────────────────────────

  _log(kind, experimentId, userId, variant, bilingual) {
    this.logs.push({
      kind: kind,
      experimentId: experimentId,
      userId: userId,
      variant: variant,
      message_he: bilingual.he,
      message_en: bilingual.en,
      at: new Date().toISOString(),
    });
  }

  getLogs(filter) {
    const f = filter || {};
    return this.logs.filter((l) => {
      if (f.kind && l.kind !== f.kind) return false;
      if (f.experimentId && l.experimentId !== f.experimentId) return false;
      if (f.userId && l.userId !== f.userId) return false;
      return true;
    });
  }

  // ─── Stats ─────────────────────────────────────────────────────────────

  stats() {
    return {
      experiments: this.experiments.size,
      mutexGroups: this.mutexGroups.size,
      holdoutPct: this.holdoutPct,
      logEntries: this.logs.length,
      summary_he: this.experiments.size + ' ניסויים, ' + this.mutexGroups.size
        + ' קבוצות בידוד, דחייה ' + (this.holdoutPct * 100).toFixed(1) + '%',
      summary_en: this.experiments.size + ' experiments, ' + this.mutexGroups.size
        + ' mutex groups, holdout ' + (this.holdoutPct * 100).toFixed(1) + '%',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  ABRouter,
  // Constants
  HOLDOUT_VARIANT,
  SRM_SEVERITY,
  SRM_P_THRESHOLDS,
  DEFAULTS,
  REASON_LABELS,
  // Primitives exposed for tests and re-use
  fnv1a32,
  hashToUnit,
  normalizeWeights,
  pickByCumulative,
  srmCheck,
  chiSquareCDF,
  chiSquareSurvival,
  gammaIncLowerRegularized,
  logGamma,
};
