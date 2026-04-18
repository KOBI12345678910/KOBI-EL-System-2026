/**
 * ONYX OPS — SLO / SLI tracker with error budgets
 * Agent X-60 · Swarm 3D · Techno-Kol Uzi mega-ERP
 * ----------------------------------------------------------------------
 *
 * Zero-dependency, Google-SRE-flavoured Service Level Objective engine.
 *
 * Definitions (do not confuse!):
 *   SLI  — Service Level Indicator: a *measurement* (e.g. "success rate"),
 *          modelled here as a ratio `good / total` over time-bucketed events.
 *   SLO  — Service Level Objective: a *target* on an SLI over a rolling
 *          window, e.g. "99.9% success over 30 days".
 *   SLA  — Service Level Agreement: the *legal* commitment with
 *          consequences. The tracker does not enforce SLAs; it only
 *          exposes evidence (attainment reports) the legal team can use.
 *   Error budget  — `1 - SLO.target`. The amount of failure allowed in
 *                   the window before the promise is broken.
 *
 * Features delivered:
 *   1.  defineSLI(name, goodFilter, totalFilter)        → sliId
 *   2.  defineSLO(name, sliId, target, window)          → sloId
 *   3.  record(sliId, {good, total, timestamp})         → void
 *   4.  currentBudget(sloId)                            → {consumed_pct, remaining_pct, eta_exhaustion, ...}
 *   5.  burnRate(sloId, windowMs)                       → number    (×budget/hr)
 *   6.  attainment(sloId, period)                       → historical achievement
 *   7.  dashboard()                                     → all SLOs, client-facing summary
 *   8.  alertIfFastBurn(sloId, threshold?)              → fires into alert manager
 *   9.  evaluateMultiBurnAlerts(sloId)                  → Google SRE 1h/6h/3d policy
 *  10.  isDeployFrozen(sloId?)                          → policy hook for CI/CD
 *  11.  Auto budget reset on window advance (transparent — rolling window)
 *  12.  Budget exhaustion prediction (linear extrapolation from recent burn)
 *
 * Alerting recipe (Google SRE multi-window multi-burn-rate):
 *   - Burn  2% of budget in 1h   → PAGE (fast burn)
 *   - Burn  5% of budget in 6h   → PAGE
 *   - Burn 10% of budget in 3d   → TICKET + deploy freeze
 *
 * RULES honoured:
 *   - Zero external deps (pure Node, no require() at all).
 *   - Hebrew bilingual: every SLI/SLO carries both label_he and label_en,
 *     every dashboard entry returns bilingual status strings.
 *   - Never deletes: recorded samples are append-only. The rolling-window
 *     "eviction" is a pointer advance — samples outside the window are
 *     kept in the tail buffer for attainment() historical reports.
 *
 * The tracker is deterministic given an injected clock; tests inject
 * theirs via `opts.now`. Production code can leave it alone.
 *
 * Export shape (see bottom of file):
 *   defineSLI, defineSLO, record, currentBudget, burnRate, attainment,
 *   dashboard, alertIfFastBurn, evaluateMultiBurnAlerts,
 *   onAlert, onBudgetExhaustion, isDeployFrozen, freezePolicy,
 *   seedDefaultSLOs, listSLOs, listSLIs, getSLI, getSLO,
 *   _resetForTests, _setNow, constants
 */

'use strict';

// ════════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════════

const MS = Object.freeze({
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
});

const WINDOWS = Object.freeze({
  '7d': 7 * MS.DAY,
  '14d': 14 * MS.DAY,
  '28d': 28 * MS.DAY,
  '30d': 30 * MS.DAY,
  '90d': 90 * MS.DAY,
});

// Google-SRE multi-burn-rate policy
// (fraction of 30d budget to burn, over the window, to trip).
const BURN_RULES = Object.freeze([
  { id: 'fast_1h',  windowMs: 1 * MS.HOUR,  budgetBurn: 0.02, severity: 'page',   label_he: 'שריפה מהירה 1ש׳',  label_en: 'Fast burn 1h'  },
  { id: 'fast_6h',  windowMs: 6 * MS.HOUR,  budgetBurn: 0.05, severity: 'page',   label_he: 'שריפה מהירה 6ש׳',  label_en: 'Fast burn 6h'  },
  { id: 'slow_3d',  windowMs: 3 * MS.DAY,   budgetBurn: 0.10, severity: 'ticket', label_he: 'שריפה איטית 3ימים', label_en: 'Slow burn 3d' },
]);

// Status tiers keyed off of remaining budget
const STATUS_TIERS = Object.freeze([
  { min: 0.50, key: 'healthy',   label_he: 'תקין',     label_en: 'Healthy'   },
  { min: 0.25, key: 'watch',     label_he: 'במעקב',    label_en: 'Watching'  },
  { min: 0.10, key: 'at_risk',   label_he: 'בסיכון',   label_en: 'At risk'   },
  { min: 0.00, key: 'burning',   label_he: 'בוער',     label_en: 'Burning'   },
  { min: -Infinity, key: 'exhausted', label_he: 'מוצה', label_en: 'Exhausted' },
]);

// ════════════════════════════════════════════════════════════════════
// MODULE STATE
// ════════════════════════════════════════════════════════════════════

/**
 * Each SLI has an append-only list of samples:
 *   { t, good, total }
 * The samples are kept sorted by `t`. We do not drop old samples (RULES:
 * never delete); currentBudget() and burnRate() only *look* inside the
 * rolling window via binary-search start-pointer.
 */
const state = {
  slis: new Map(),          // id → { id, name, label_he, label_en, goodFilter, totalFilter, samples }
  slos: new Map(),          // id → { id, name, sliId, target, windowMs, windowKey, label_he, label_en, createdAt, frozen, meta }
  alerts: [],               // append-only alert history
  alertListeners: [],       // hooks: (alert) → void
  exhaustionListeners: [],  // hooks: (sloId) → void
  seq: { sli: 0, slo: 0, alert: 0 },
  now: null,                // optional injected clock
  freezePolicyEnabled: true,
};

function now() {
  if (typeof state.now === 'function') return state.now();
  return Date.now();
}

// ════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════

function nextId(kind) {
  state.seq[kind] = (state.seq[kind] || 0) + 1;
  const n = String(state.seq[kind]).padStart(4, '0');
  return `${kind.toUpperCase()}-${n}`;
}

function resolveWindow(spec) {
  if (typeof spec === 'number' && Number.isFinite(spec) && spec > 0) {
    return { ms: spec, key: `${spec}ms` };
  }
  if (typeof spec === 'string') {
    const key = spec.trim().toLowerCase();
    if (WINDOWS[key] != null) return { ms: WINDOWS[key], key };
    // Accept Nd / Nh shorthand
    const m = /^(\d+)\s*([dh])$/.exec(key);
    if (m) {
      const n = Number(m[1]);
      const unit = m[2] === 'd' ? MS.DAY : MS.HOUR;
      return { ms: n * unit, key };
    }
  }
  throw new Error(`slo-tracker: unsupported window spec: ${spec}`);
}

function lowerBound(arr, predicate) {
  // Returns index of first element where predicate(el) is true,
  // or arr.length if none. Array is assumed sorted by t ascending.
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (predicate(arr[mid])) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * Aggregates samples in [fromT, toT] (inclusive) into {good, total}.
 * O(log n + k) where k is the window length.
 */
function aggregateRange(sli, fromT, toT) {
  const arr = sli.samples;
  if (arr.length === 0) return { good: 0, total: 0 };
  const start = lowerBound(arr, (s) => s.t >= fromT);
  let good = 0;
  let total = 0;
  for (let i = start; i < arr.length; i++) {
    const s = arr[i];
    if (s.t > toT) break;
    good += s.good;
    total += s.total;
  }
  return { good, total };
}

function statusFromRemaining(remainingFraction) {
  for (const tier of STATUS_TIERS) {
    if (remainingFraction >= tier.min) return tier;
  }
  return STATUS_TIERS[STATUS_TIERS.length - 1];
}

function clamp(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

// ════════════════════════════════════════════════════════════════════
// PUBLIC API — SLI / SLO DEFINITION
// ════════════════════════════════════════════════════════════════════

/**
 * Define a new SLI.
 *   name         — stable identifier (e.g. "api_availability")
 *   goodFilter   — (optional) predicate(event)→bool for pipeline mode
 *   totalFilter  — (optional) predicate(event)→bool for pipeline mode
 *   opts         — { label_he, label_en, description }
 *
 * goodFilter/totalFilter are stored for future event-pipe integration;
 * in the current in-memory path, callers use record(sliId, {good,total}).
 */
function defineSLI(name, goodFilter, totalFilter, opts) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('defineSLI: name required');
  }
  opts = opts || {};
  const id = nextId('sli');
  const sli = {
    id,
    name: name.trim(),
    label_he: opts.label_he || name,
    label_en: opts.label_en || name,
    description: opts.description || '',
    goodFilter: typeof goodFilter === 'function' ? goodFilter : null,
    totalFilter: typeof totalFilter === 'function' ? totalFilter : null,
    samples: [],           // append-only { t, good, total }
    createdAt: now(),
  };
  state.slis.set(id, sli);
  return id;
}

/**
 * Define a new SLO on top of an existing SLI.
 *   name    — stable identifier (e.g. "api_availability_30d")
 *   sliId   — id returned by defineSLI
 *   target  — fraction in [0,1], e.g. 0.999
 *   window  — "7d" | "30d" | "90d" | number (ms)
 *   opts    — { label_he, label_en, description, severity, ownerTeam }
 */
function defineSLO(name, sliId, target, window, opts) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('defineSLO: name required');
  }
  if (!state.slis.has(sliId)) {
    throw new Error(`defineSLO: unknown sliId=${sliId}`);
  }
  if (typeof target !== 'number' || !Number.isFinite(target) || target <= 0 || target >= 1) {
    throw new Error(`defineSLO: target must be in (0,1), got ${target}`);
  }
  const w = resolveWindow(window);
  opts = opts || {};
  const id = nextId('slo');
  const slo = {
    id,
    name: name.trim(),
    sliId,
    target,
    windowMs: w.ms,
    windowKey: w.key,
    label_he: opts.label_he || name,
    label_en: opts.label_en || name,
    description: opts.description || '',
    severity: opts.severity || 'page',
    ownerTeam: opts.ownerTeam || 'sre',
    frozen: false,
    exhaustionSignalled: false,
    createdAt: now(),
    meta: opts.meta || {},
  };
  state.slos.set(id, slo);
  return id;
}

// ════════════════════════════════════════════════════════════════════
// PUBLIC API — RECORDING SAMPLES
// ════════════════════════════════════════════════════════════════════

/**
 * Record a batch of outcomes against an SLI.
 *   sliId    — SLI to record into
 *   sample   — { good, total, timestamp? }
 *
 * `good` must be <= `total`. Samples are kept sorted by `t`.
 * (Common case is strictly-increasing `t`, which is an O(1) append;
 * out-of-order inserts are handled with a linear splice — tests use
 * this to seed historical ranges deterministically.)
 */
function record(sliId, sample) {
  const sli = state.slis.get(sliId);
  if (!sli) throw new Error(`record: unknown sliId=${sliId}`);
  if (!sample || typeof sample !== 'object') {
    throw new Error('record: sample object required');
  }
  const good = Number(sample.good);
  const total = Number(sample.total);
  if (!Number.isFinite(good) || good < 0) throw new Error('record: good must be a non-negative number');
  if (!Number.isFinite(total) || total < 0) throw new Error('record: total must be a non-negative number');
  if (good > total) throw new Error(`record: good(${good}) > total(${total})`);
  const t = Number.isFinite(sample.timestamp) ? Number(sample.timestamp) : now();

  const entry = { t, good, total };
  const arr = sli.samples;
  if (arr.length === 0 || t >= arr[arr.length - 1].t) {
    arr.push(entry);
  } else {
    // Out-of-order: insert at correct position (rare; seeded tests use it).
    const idx = lowerBound(arr, (s) => s.t > t);
    arr.splice(idx, 0, entry);
  }
}

// ════════════════════════════════════════════════════════════════════
// PUBLIC API — BUDGET / BURN MATHS
// ════════════════════════════════════════════════════════════════════

/**
 * Compute current budget state for an SLO.
 * Returns an object with:
 *   consumed_pct       — fraction of budget already spent (0..1+)
 *   remaining_pct      — 1 - consumed_pct (clamped at 0)
 *   eta_exhaustion     — null | timestamp ms | 'already_exhausted'
 *   allowed_bad        — failures allowed in the window at target
 *   observed_bad       — failures seen in the window
 *   good, total        — raw counters for the window
 *   status             — {key, label_he, label_en}
 *   target, windowMs, windowKey
 */
function currentBudget(sloId) {
  const slo = state.slos.get(sloId);
  if (!slo) throw new Error(`currentBudget: unknown sloId=${sloId}`);
  const sli = state.slis.get(slo.sliId);
  if (!sli) throw new Error(`currentBudget: SLI for SLO ${sloId} missing`);

  const t = now();
  const fromT = t - slo.windowMs;
  const agg = aggregateRange(sli, fromT, t);
  const allowedBadFraction = 1 - slo.target;
  const allowedBad = agg.total * allowedBadFraction;
  const observedBad = agg.total - agg.good;
  const consumed = allowedBad > 0 ? observedBad / allowedBad : (observedBad > 0 ? Infinity : 0);
  const remaining = clamp(1 - consumed, 0, 1);
  // Exhausted has priority over the remaining-based tier lookup:
  // once consumed >= 1 we are over budget no matter how tight the clamp is.
  const status = consumed >= 1
    ? STATUS_TIERS[STATUS_TIERS.length - 1]
    : statusFromRemaining(remaining);

  // Exhaustion prediction: take the burn rate over the last hour
  // (or the whole window if less data) and project forward linearly.
  let eta = null;
  if (consumed >= 1) {
    eta = 'already_exhausted';
  } else {
    const lookbackMs = Math.min(MS.HOUR, slo.windowMs);
    const lookFrom = t - lookbackMs;
    const recent = aggregateRange(sli, lookFrom, t);
    const recentBad = recent.total - recent.good;
    if (recentBad > 0 && allowedBad > 0) {
      // failures-per-ms in recent window
      const badPerMs = recentBad / lookbackMs;
      const remainingBudgetBad = (1 - consumed) * allowedBad;
      if (badPerMs > 0) {
        const msToExhaust = remainingBudgetBad / badPerMs;
        // Cap at window end — beyond the window the rolling reset makes
        // prediction meaningless.
        eta = t + Math.min(msToExhaust, slo.windowMs);
      }
    }
  }

  return {
    slo_id: sloId,
    sli_id: sli.id,
    target: slo.target,
    windowMs: slo.windowMs,
    windowKey: slo.windowKey,
    good: agg.good,
    total: agg.total,
    allowed_bad: allowedBad,
    observed_bad: observedBad,
    consumed_pct: consumed,
    remaining_pct: remaining,
    eta_exhaustion: eta,
    status: {
      key: status.key,
      label_he: status.label_he,
      label_en: status.label_en,
    },
  };
}

/**
 * Burn rate = (observed bad / allowed bad) over `windowMs`, normalised
 * by how many of those windows fit into the SLO window.
 *
 * A burn rate of `1.0` means we are consuming budget at the exact rate
 * the SLO expects; `2.0` means twice as fast (i.e. the full budget will
 * be gone in half the SLO window).
 */
function burnRate(sloId, windowMs) {
  const slo = state.slos.get(sloId);
  if (!slo) throw new Error(`burnRate: unknown sloId=${sloId}`);
  const sli = state.slis.get(slo.sliId);
  if (!sli) throw new Error(`burnRate: SLI for SLO ${sloId} missing`);
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error(`burnRate: windowMs must be positive, got ${windowMs}`);
  }
  const t = now();
  const agg = aggregateRange(sli, t - windowMs, t);
  if (agg.total === 0) return 0;
  const failureRate = (agg.total - agg.good) / agg.total;
  const allowedFailureRate = 1 - slo.target;
  if (allowedFailureRate <= 0) {
    return failureRate > 0 ? Infinity : 0;
  }
  return failureRate / allowedFailureRate;
}

// ════════════════════════════════════════════════════════════════════
// PUBLIC API — HISTORICAL ATTAINMENT
// ════════════════════════════════════════════════════════════════════

/**
 * Historical SLO attainment report.
 *   sloId  — the SLO to report on
 *   period — optional { from, to, bucketMs }; defaults to
 *            the last 4× windowMs bucketed by (windowMs/8).
 *
 * Returns:
 *   {
 *     slo_id, target, windowMs,
 *     buckets: [{ from, to, good, total, attainment, met }],
 *     overall: { good, total, attainment, met },
 *     met_buckets, total_buckets,
 *   }
 */
function attainment(sloId, period) {
  const slo = state.slos.get(sloId);
  if (!slo) throw new Error(`attainment: unknown sloId=${sloId}`);
  const sli = state.slis.get(slo.sliId);
  if (!sli) throw new Error(`attainment: SLI for SLO ${sloId} missing`);

  const t = now();
  period = period || {};
  const to = Number.isFinite(period.to) ? period.to : t;
  const defaultFrom = to - 4 * slo.windowMs;
  const from = Number.isFinite(period.from) ? period.from : defaultFrom;
  const bucketMs = Number.isFinite(period.bucketMs) && period.bucketMs > 0
    ? period.bucketMs
    : Math.max(MS.HOUR, Math.floor(slo.windowMs / 8));

  if (to <= from) {
    return {
      slo_id: sloId,
      target: slo.target,
      windowMs: slo.windowMs,
      buckets: [],
      overall: { good: 0, total: 0, attainment: null, met: null },
      met_buckets: 0,
      total_buckets: 0,
    };
  }

  const buckets = [];
  let overallGood = 0;
  let overallTotal = 0;
  let metBuckets = 0;

  for (let cursor = from; cursor < to; cursor += bucketMs) {
    const end = Math.min(cursor + bucketMs, to);
    const agg = aggregateRange(sli, cursor, end - 1);
    const att = agg.total > 0 ? agg.good / agg.total : null;
    const met = att == null ? null : att >= slo.target;
    if (met === true) metBuckets++;
    overallGood += agg.good;
    overallTotal += agg.total;
    buckets.push({
      from: cursor,
      to: end,
      good: agg.good,
      total: agg.total,
      attainment: att,
      met,
    });
  }

  const overallAtt = overallTotal > 0 ? overallGood / overallTotal : null;
  return {
    slo_id: sloId,
    target: slo.target,
    windowMs: slo.windowMs,
    buckets,
    overall: {
      good: overallGood,
      total: overallTotal,
      attainment: overallAtt,
      met: overallAtt == null ? null : overallAtt >= slo.target,
    },
    met_buckets: metBuckets,
    total_buckets: buckets.length,
  };
}

// ════════════════════════════════════════════════════════════════════
// PUBLIC API — ALERTING (MULTI-WINDOW MULTI-BURN)
// ════════════════════════════════════════════════════════════════════

function recordAlert(alert) {
  state.alerts.push(alert);
  for (const fn of state.alertListeners) {
    try { fn(alert); } catch (_e) { /* never propagate listener errors */ }
  }
  return alert;
}

/**
 * Trip a fast-burn alert if the burn rate over the last `windowMs`
 * exceeds `threshold` (multiples-of-budget-per-window).
 *
 * A threshold of `2` means "burning 2× faster than allowed over the
 * lookback window", which is the vanilla Google-SRE "fast burn" signal.
 *
 * Returns the alert object if one was fired, null otherwise.
 */
function alertIfFastBurn(sloId, threshold) {
  const slo = state.slos.get(sloId);
  if (!slo) throw new Error(`alertIfFastBurn: unknown sloId=${sloId}`);
  const thresh = Number.isFinite(threshold) ? threshold : 14.4; // 2% of 30d in 1h
  const rate = burnRate(sloId, MS.HOUR);
  if (rate < thresh) return null;
  const alert = {
    id: nextId('alert'),
    slo_id: sloId,
    rule: 'fast_burn_manual',
    burn_rate: rate,
    threshold: thresh,
    severity: 'page',
    label_he: 'שריפה מהירה מעל סף',
    label_en: 'Fast burn over threshold',
    firedAt: now(),
  };
  return recordAlert(alert);
}

/**
 * Evaluate the full Google SRE multi-burn policy and fire all matching
 * alerts. Returns an array of fired alerts (possibly empty).
 *
 * Rule definitions live in BURN_RULES. Each rule fires when the burn
 * rate over its window would exhaust `budgetBurn` fraction of the 30d
 * budget in that window — i.e. burnRate >= budgetBurn / (windowMs/30d).
 */
function evaluateMultiBurnAlerts(sloId) {
  const slo = state.slos.get(sloId);
  if (!slo) throw new Error(`evaluateMultiBurnAlerts: unknown sloId=${sloId}`);
  const fired = [];
  for (const rule of BURN_RULES) {
    const budgetFraction = rule.windowMs / slo.windowMs;
    // If the rule window is larger than the SLO window, skip (noisy).
    if (budgetFraction > 1) continue;
    const rateNeeded = rule.budgetBurn / budgetFraction;
    const actual = burnRate(sloId, rule.windowMs);
    if (actual >= rateNeeded) {
      const alert = {
        id: nextId('alert'),
        slo_id: sloId,
        rule: rule.id,
        burn_rate: actual,
        threshold: rateNeeded,
        severity: rule.severity,
        label_he: rule.label_he,
        label_en: rule.label_en,
        firedAt: now(),
      };
      fired.push(recordAlert(alert));
      if (rule.severity === 'ticket') {
        // Slow-burn triggers deploy freeze per policy
        if (state.freezePolicyEnabled) slo.frozen = true;
      }
    }
  }
  // Check for full exhaustion → deploy freeze + one-shot listener notification.
  // The listener fires exactly once per SLO until `unfreeze()` / `freezePolicy(false)` resets it.
  const budget = currentBudget(sloId);
  if (budget.consumed_pct >= 1) {
    if (state.freezePolicyEnabled) slo.frozen = true;
    if (!slo.exhaustionSignalled) {
      slo.exhaustionSignalled = true;
      for (const fn of state.exhaustionListeners) {
        try { fn(sloId); } catch (_e) { /* swallow */ }
      }
    }
  }
  return fired;
}

// ════════════════════════════════════════════════════════════════════
// PUBLIC API — DASHBOARD / POLICY / LIFECYCLE
// ════════════════════════════════════════════════════════════════════

/**
 * Client-facing summary of every SLO.
 * Each entry: {id, name, label_he, label_en, target, windowKey,
 *              remaining_pct, consumed_pct, status, frozen, burn_1h, burn_6h}
 */
function dashboard() {
  const rows = [];
  for (const slo of state.slos.values()) {
    let budget;
    let burn1h = 0;
    let burn6h = 0;
    try {
      budget = currentBudget(slo.id);
      burn1h = burnRate(slo.id, MS.HOUR);
      burn6h = burnRate(slo.id, 6 * MS.HOUR);
    } catch (_e) {
      continue;
    }
    rows.push({
      id: slo.id,
      name: slo.name,
      label_he: slo.label_he,
      label_en: slo.label_en,
      target: slo.target,
      windowKey: slo.windowKey,
      remaining_pct: budget.remaining_pct,
      consumed_pct: budget.consumed_pct,
      status: budget.status,
      frozen: slo.frozen,
      burn_1h: burn1h,
      burn_6h: burn6h,
      eta_exhaustion: budget.eta_exhaustion,
    });
  }
  return {
    generatedAt: now(),
    total: rows.length,
    frozen: rows.filter((r) => r.frozen).length,
    healthy: rows.filter((r) => r.status.key === 'healthy').length,
    at_risk: rows.filter((r) => r.status.key === 'at_risk' || r.status.key === 'burning').length,
    exhausted: rows.filter((r) => r.status.key === 'exhausted').length,
    rows,
    title_he: 'סקירת SLO ותקציב שגיאות',
    title_en: 'SLO & Error Budget Overview',
  };
}

/**
 * Policy hook: has any SLO exhausted its budget to the point where
 * deploys should be frozen?
 *
 * Call with no argument for a platform-wide answer.
 * Call with an SLO id to check a specific SLO (useful for per-service
 * deployment pipelines).
 */
function isDeployFrozen(sloId) {
  if (!state.freezePolicyEnabled) return false;
  if (sloId) {
    const slo = state.slos.get(sloId);
    if (!slo) return false;
    return !!slo.frozen;
  }
  for (const slo of state.slos.values()) {
    if (slo.frozen) return true;
  }
  return false;
}

function freezePolicy(enabled) {
  state.freezePolicyEnabled = !!enabled;
  if (!enabled) {
    for (const slo of state.slos.values()) {
      slo.frozen = false;
      slo.exhaustionSignalled = false;
    }
  }
}

function unfreeze(sloId) {
  const slo = state.slos.get(sloId);
  if (!slo) return false;
  slo.frozen = false;
  slo.exhaustionSignalled = false;
  return true;
}

function onAlert(fn) {
  if (typeof fn !== 'function') throw new Error('onAlert: fn required');
  state.alertListeners.push(fn);
  return () => {
    const idx = state.alertListeners.indexOf(fn);
    if (idx >= 0) state.alertListeners.splice(idx, 1);
  };
}

function onBudgetExhaustion(fn) {
  if (typeof fn !== 'function') throw new Error('onBudgetExhaustion: fn required');
  state.exhaustionListeners.push(fn);
  return () => {
    const idx = state.exhaustionListeners.indexOf(fn);
    if (idx >= 0) state.exhaustionListeners.splice(idx, 1);
  };
}

// ════════════════════════════════════════════════════════════════════
// PUBLIC API — INTROSPECTION
// ════════════════════════════════════════════════════════════════════

function listSLIs() {
  const out = [];
  for (const sli of state.slis.values()) {
    out.push({
      id: sli.id,
      name: sli.name,
      label_he: sli.label_he,
      label_en: sli.label_en,
      sampleCount: sli.samples.length,
    });
  }
  return out;
}

function listSLOs() {
  const out = [];
  for (const slo of state.slos.values()) {
    out.push({
      id: slo.id,
      name: slo.name,
      sliId: slo.sliId,
      target: slo.target,
      windowKey: slo.windowKey,
      frozen: slo.frozen,
      label_he: slo.label_he,
      label_en: slo.label_en,
    });
  }
  return out;
}

function getSLI(sliId) { return state.slis.get(sliId) || null; }
function getSLO(sloId) { return state.slos.get(sloId) || null; }
function listAlerts() { return state.alerts.slice(); }

// ════════════════════════════════════════════════════════════════════
// SEED DEFAULT SLOs
// ════════════════════════════════════════════════════════════════════

/**
 * Installs the Techno-Kol Uzi mega-ERP default SLO set.
 * Returns a map: { sliId, sloId } pairs keyed by seed name.
 *
 * Safe to call more than once — each call creates fresh IDs. Callers
 * that need idempotence should _resetForTests() first, or call this
 * once during boot.
 */
function seedDefaultSLOs() {
  const seeds = {};

  seeds.apiAvailability = {
    sliId: defineSLI(
      'api_availability',
      null, null,
      { label_he: 'זמינות ה-API', label_en: 'API availability',
        description: '1 - (5xx / total) of HTTP responses' }
    ),
  };
  seeds.apiAvailability.sloId = defineSLO(
    'api_availability_30d',
    seeds.apiAvailability.sliId,
    0.999,
    '30d',
    { label_he: 'זמינות API 99.9% ל-30 יום', label_en: 'API availability 99.9% over 30d', ownerTeam: 'sre' }
  );

  seeds.apiLatency = {
    sliId: defineSLI(
      'api_latency_p95_under_500ms',
      null, null,
      { label_he: 'השהיית API P95 מתחת ל-500ms', label_en: 'API latency P95 < 500ms',
        description: 'fraction of requests whose p95 bucket is <= 500ms' }
    ),
  };
  seeds.apiLatency.sloId = defineSLO(
    'api_latency_p95_30d',
    seeds.apiLatency.sliId,
    0.99,
    '30d',
    { label_he: 'השהיית API P95 99% ל-30 יום', label_en: 'API latency P95 99% over 30d', ownerTeam: 'sre' }
  );

  seeds.wageSlip = {
    sliId: defineSLI(
      'wage_slip_generation_success',
      null, null,
      { label_he: 'הצלחת הפקת תלוש שכר', label_en: 'Wage slip generation success',
        description: 'ok / total wage slip generations' }
    ),
  };
  seeds.wageSlip.sloId = defineSLO(
    'wage_slip_30d',
    seeds.wageSlip.sliId,
    0.999,
    '30d',
    { label_he: 'הצלחת תלושי שכר 99.9% ל-30 יום', label_en: 'Wage slip success 99.9% over 30d', ownerTeam: 'finance-ops', severity: 'page' }
  );

  seeds.pdfLatency = {
    sliId: defineSLI(
      'pdf_generation_p95_under_3s',
      null, null,
      { label_he: 'הפקת PDF P95 מתחת ל-3 שניות', label_en: 'PDF generation P95 < 3s',
        description: 'fraction of PDF renders whose p95 bucket is <= 3s' }
    ),
  };
  seeds.pdfLatency.sloId = defineSLO(
    'pdf_latency_p95_30d',
    seeds.pdfLatency.sliId,
    0.95,
    '30d',
    { label_he: 'השהיית PDF P95 95% ל-30 יום', label_en: 'PDF latency P95 95% over 30d', ownerTeam: 'sre' }
  );

  seeds.taxExport = {
    sliId: defineSLI(
      'tax_authority_export_success',
      null, null,
      { label_he: 'הצלחת ייצוא לרשות המיסים', label_en: 'Tax authority export success',
        description: 'ok / total submissions to IL Tax Authority' }
    ),
  };
  seeds.taxExport.sloId = defineSLO(
    'tax_export_30d',
    seeds.taxExport.sliId,
    0.99,
    '30d',
    { label_he: 'ייצוא מס 99% ל-30 יום', label_en: 'Tax export 99% over 30d', ownerTeam: 'finance-ops', severity: 'page' }
  );

  seeds.dbLatency = {
    sliId: defineSLI(
      'db_query_p99_under_100ms',
      null, null,
      { label_he: 'שאילתות DB P99 מתחת ל-100ms', label_en: 'DB query P99 < 100ms',
        description: 'fraction of DB queries whose p99 bucket is <= 100ms' }
    ),
  };
  seeds.dbLatency.sloId = defineSLO(
    'db_latency_p99_7d',
    seeds.dbLatency.sliId,
    0.99,
    '7d',
    { label_he: 'השהיית DB P99 99% ל-7 ימים', label_en: 'DB latency P99 99% over 7d', ownerTeam: 'sre' }
  );

  return seeds;
}

// ════════════════════════════════════════════════════════════════════
// TEST / INTERNAL HELPERS
// ════════════════════════════════════════════════════════════════════

function _resetForTests() {
  state.slis.clear();
  state.slos.clear();
  state.alerts.length = 0;
  state.alertListeners.length = 0;
  state.exhaustionListeners.length = 0;
  state.seq.sli = 0;
  state.seq.slo = 0;
  state.seq.alert = 0;
  state.now = null;
  state.freezePolicyEnabled = true;
}

function _setNow(fn) {
  state.now = typeof fn === 'function' ? fn : null;
}

// ════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════

module.exports = {
  // definition
  defineSLI,
  defineSLO,
  // recording
  record,
  // math
  currentBudget,
  burnRate,
  attainment,
  // dashboard / policy
  dashboard,
  alertIfFastBurn,
  evaluateMultiBurnAlerts,
  onAlert,
  onBudgetExhaustion,
  isDeployFrozen,
  freezePolicy,
  unfreeze,
  // introspection
  listSLIs,
  listSLOs,
  getSLI,
  getSLO,
  listAlerts,
  // seeding
  seedDefaultSLOs,
  // constants (exported for tests + host integration)
  MS,
  WINDOWS,
  BURN_RULES,
  STATUS_TIERS,
  // internals
  _resetForTests,
  _setNow,
};
