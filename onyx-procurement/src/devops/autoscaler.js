/**
 * autoscaler.js — Auto-scaling policy engine (HPA-style + predictive + schedule-based)
 * Agent Y-176 — Techno-Kol Uzi mega-ERP — written 2026-04-11
 *
 * Zero external dependencies. Node built-ins only (EventEmitter).
 * Bilingual: every user-facing reason/event name ships with a Hebrew mirror.
 *
 * Guiding principle: "לא מוחקים, רק משדרגים ומגדלים"
 * ---------------------------------------------------
 * The engine NEVER deletes history. Metric samples, decisions, events and
 * scaling actions are appended to monotonic ledgers. Callers may read, aggregate,
 * and slice them, but there is no public `clear`, `reset` or `delete` method.
 * Bounded-window aggregations (e.g. for predictive forecast) are computed by
 * *reading* a tail of the ledger — the underlying arrays remain intact.
 *
 * Three independent policies, combined by `max` (scale-up wins) and cooled
 * down per direction:
 *
 *   1. Reactive   — classic HPA:
 *                     desired = ceil( current × signal / target )
 *                   over CPU %, memory %, and queue depth. The largest of the
 *                   three signals drives the decision.
 *
 *   2. Predictive — simple linear regression (least squares) over the last
 *                   N CPU samples. Projects `horizonMs` into the future and
 *                   pre-scales if the projected load would trip the reactive
 *                   threshold. Never scales DOWN — only acts upward to absorb
 *                   predicted load.
 *
 *   3. Schedule   — Israeli business-hours floor. On weekdays (Sun–Thu in
 *                   Israel, Friday is half-day, Saturday closed) between
 *                   `scheduleStartHour` and `scheduleEndHour`, a minimum
 *                   replica count is enforced. Bank holidays (Yom Kippur,
 *                   Pesach, Rosh Hashanah, Independence Day, …) are honored
 *                   as "closed" — schedule floor drops to `minReplicas`.
 *                   Holidays are fully configurable.
 *
 * The engine aggressively scales UP (short cooldown, can add many replicas at
 * once, bounded by `scaleUpStep`) and conservatively scales DOWN (long
 * cooldown, single-step decrement, bounded by `scaleDownStep`). Hard bounds
 * `minReplicas` / `maxReplicas` are always enforced.
 *
 * Events emitted (EventEmitter API):
 *   - 'metric'       : { timestamp, cpu, memory, queueDepth }
 *   - 'decision'     : { timestamp, replicas, desired, reason, reasonHe, policy }
 *   - 'scale-up'     : { from, to, delta, policy, reason, reasonHe }
 *   - 'scale-down'   : { from, to, delta, policy, reason, reasonHe }
 *   - 'no-change'    : { replicas, reason, reasonHe }
 *   - 'cooldown'     : { direction, remainingMs, reason, reasonHe }
 *   - 'bounds-clamp' : { requested, clamped, bound, reason, reasonHe }
 *   - 'holiday'      : { date, name, nameHe }
 *
 * Public API:
 *   const { AutoScaler, DEFAULTS, ISRAELI_HOLIDAYS_2026 } = require('./autoscaler');
 *   const as = new AutoScaler({ minReplicas: 2, maxReplicas: 20 });
 *   as.on('scale-up', e => console.log(e));
 *   as.recordMetric({ cpu: 82, memory: 70, queueDepth: 120 });
 *   const decision = as.evaluate();          // returns full decision object
 *   const plan     = as.plan({ at: Date.now() + 3600_000 }); // what-if at future time
 *
 * No I/O. All time is injected (`now` option or explicit `at:` parameter) so
 * tests are deterministic.
 */

'use strict';

const { EventEmitter } = require('node:events');

/* ------------------------------------------------------------------ *
 *  Israeli bank holidays — 2026 (civil calendar).                    *
 *  Dates are YYYY-MM-DD in Asia/Jerusalem.                           *
 *  Fully overridable via constructor option `holidays`.              *
 * ------------------------------------------------------------------ */

const ISRAELI_HOLIDAYS_2026 = Object.freeze([
  { date: '2026-03-03', name: 'Purim',              nameHe: 'פורים' },
  { date: '2026-04-02', name: 'Pesach Eve',         nameHe: 'ערב פסח' },
  { date: '2026-04-03', name: 'Pesach I',           nameHe: 'פסח א' },
  { date: '2026-04-09', name: 'Pesach VII',         nameHe: 'שביעי של פסח' },
  { date: '2026-04-21', name: 'Yom HaZikaron',      nameHe: 'יום הזיכרון' },
  { date: '2026-04-22', name: 'Yom HaAtzmaut',      nameHe: 'יום העצמאות' },
  { date: '2026-05-22', name: 'Shavuot Eve',        nameHe: 'ערב שבועות' },
  { date: '2026-05-23', name: 'Shavuot',            nameHe: 'שבועות' },
  { date: '2026-07-23', name: 'Tisha BAv',          nameHe: 'תשעה באב' },
  { date: '2026-09-12', name: 'Rosh Hashanah Eve',  nameHe: 'ערב ראש השנה' },
  { date: '2026-09-13', name: 'Rosh Hashanah I',    nameHe: 'ראש השנה א' },
  { date: '2026-09-14', name: 'Rosh Hashanah II',   nameHe: 'ראש השנה ב' },
  { date: '2026-09-21', name: 'Kol Nidrei',         nameHe: 'כל נדרי' },
  { date: '2026-09-22', name: 'Yom Kippur',         nameHe: 'יום כיפור' },
  { date: '2026-09-26', name: 'Sukkot Eve',         nameHe: 'ערב סוכות' },
  { date: '2026-09-27', name: 'Sukkot I',           nameHe: 'סוכות א' },
  { date: '2026-10-04', name: 'Simchat Torah',      nameHe: 'שמחת תורה' },
]);

/* ------------------------------------------------------------------ *
 *  Defaults                                                          *
 * ------------------------------------------------------------------ */

const DEFAULTS = Object.freeze({
  // Bounds
  minReplicas: 1,
  maxReplicas: 10,
  initialReplicas: 1,

  // Reactive targets (HPA-style)
  targetCpuPct: 70,             // target CPU utilisation
  targetMemoryPct: 75,          // target memory utilisation
  targetQueueDepthPerReplica: 50, // target items-in-queue per replica

  // Step sizes
  scaleUpStep: 5,               // max replicas added in one decision (aggressive)
  scaleDownStep: 1,             // max replicas removed in one decision (conservative)

  // Cooldown periods (ms)
  scaleUpCooldownMs: 30_000,    // short cooldown for scale-up
  scaleDownCooldownMs: 300_000, // long cooldown for scale-down (conservative)

  // Predictive
  predictiveEnabled: true,
  predictiveWindowSize: 10,     // samples used in linear regression
  predictiveHorizonMs: 60_000,  // project 60 s ahead
  predictiveMinSamples: 4,      // need at least 4 points before forecasting

  // Schedule
  scheduleEnabled: true,
  scheduleStartHour: 9,         // 09:00 Israel time
  scheduleEndHour: 18,          // 18:00 Israel time
  scheduleMinReplicas: 3,       // business-hours floor
  // Israel week: Sun-Thu full, Fri half (closed for scaling bumps), Sat closed.
  // JS Date.getDay() in Asia/Jerusalem: Sun=0, Mon=1, ..., Fri=5, Sat=6.
  businessDays: Object.freeze([0, 1, 2, 3, 4]), // Sun-Thu
  holidays: ISRAELI_HOLIDAYS_2026,

  // History retention (soft — we NEVER delete, we just read a tail)
  metricBufferSize: 500,        // soft hint for callers; ledger is unbounded
});

/* ------------------------------------------------------------------ *
 *  Helpers                                                           *
 * ------------------------------------------------------------------ */

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function clampNumber(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

/**
 * Compute a calendar date (YYYY-MM-DD) in Asia/Jerusalem for a given
 * JS Date or epoch milliseconds. Built-in Intl, no external libs.
 */
function toIsraelDateString(date) {
  const d = date instanceof Date ? date : new Date(date);
  // Intl → {year, month, day} in the target TZ
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Extract {hour, dayOfWeek} in Asia/Jerusalem.
 *   dayOfWeek: 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
 */
function toIsraelClock(date) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(d);
  const hourStr = parts.find((p) => p.type === 'hour').value;
  const wd = parts.find((p) => p.type === 'weekday').value;
  // normalise 24 → 0 (midnight)
  const hour = Number(hourStr) % 24;
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hour, dayOfWeek: dayMap[wd] };
}

/**
 * Linear regression (least squares) over an array of {x, y} points.
 * Returns { slope, intercept } or null if degenerate.
 */
function linearRegression(points) {
  const n = points.length;
  if (n < 2) return null;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

/* ------------------------------------------------------------------ *
 *  AutoScaler class                                                  *
 * ------------------------------------------------------------------ */

class AutoScaler extends EventEmitter {
  constructor(options = {}) {
    super();
    const cfg = { ...DEFAULTS, ...options };

    // Validate numeric bounds
    if (!isFiniteNumber(cfg.minReplicas) || cfg.minReplicas < 0) {
      throw new Error('minReplicas must be a non-negative finite number');
    }
    if (!isFiniteNumber(cfg.maxReplicas) || cfg.maxReplicas < cfg.minReplicas) {
      throw new Error('maxReplicas must be >= minReplicas');
    }
    if (cfg.targetCpuPct <= 0 || cfg.targetCpuPct > 100) {
      throw new Error('targetCpuPct must be in (0, 100]');
    }
    if (cfg.targetMemoryPct <= 0 || cfg.targetMemoryPct > 100) {
      throw new Error('targetMemoryPct must be in (0, 100]');
    }

    this.config = Object.freeze(cfg);

    // Internal mutable state
    this.replicas = clampNumber(cfg.initialReplicas, cfg.minReplicas, cfg.maxReplicas);

    // Append-only ledgers (never cleared)
    this.metrics = [];      // { timestamp, cpu, memory, queueDepth }
    this.decisions = [];    // full decision records
    this.actions = [];      // scale-up / scale-down actions
    this.events = [];       // mirror of emitted events (observability)

    // Cooldown watermarks (wall-clock ms)
    this.lastScaleUpAt = 0;
    this.lastScaleDownAt = 0;

    // Injected clock (for deterministic tests)
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
  }

  /* -------- metric ingestion -------- */

  /**
   * Append a metric sample. Required fields: cpu, memory, queueDepth.
   * All three are optional individually but the sample is rejected if
   * none are numeric.
   */
  recordMetric(sample = {}) {
    const timestamp = isFiniteNumber(sample.timestamp) ? sample.timestamp : this.now();
    const cpu = isFiniteNumber(sample.cpu) ? sample.cpu : null;
    const memory = isFiniteNumber(sample.memory) ? sample.memory : null;
    const queueDepth = isFiniteNumber(sample.queueDepth) ? sample.queueDepth : null;

    if (cpu === null && memory === null && queueDepth === null) {
      throw new Error('recordMetric requires at least one numeric signal (cpu|memory|queueDepth)');
    }

    const entry = { timestamp, cpu, memory, queueDepth };
    this.metrics.push(entry);
    this._emit('metric', entry);
    return entry;
  }

  /* -------- policy #1: reactive -------- */

  /**
   * Compute desired replicas from latest metric using HPA formula.
   * Returns { desired, signal, reason, reasonHe } or null if no metric.
   */
  _reactiveDesired() {
    if (this.metrics.length === 0) return null;
    const last = this.metrics[this.metrics.length - 1];
    const current = Math.max(1, this.replicas);
    const { targetCpuPct, targetMemoryPct, targetQueueDepthPerReplica } = this.config;

    const cpuDesired = last.cpu !== null
      ? Math.ceil((current * last.cpu) / targetCpuPct)
      : 0;
    const memDesired = last.memory !== null
      ? Math.ceil((current * last.memory) / targetMemoryPct)
      : 0;
    const qDepthRatio = last.queueDepth !== null
      ? last.queueDepth / targetQueueDepthPerReplica
      : 0;
    const queueDesired = last.queueDepth !== null
      ? Math.max(1, Math.ceil(qDepthRatio))
      : 0;

    // HPA: drive by the largest signal
    let desired = Math.max(cpuDesired, memDesired, queueDesired, 1);
    let driver = 'cpu';
    let driverHe = 'מעבד';
    if (memDesired === desired && memDesired > cpuDesired) { driver = 'memory'; driverHe = 'זיכרון'; }
    if (queueDesired === desired && queueDesired > cpuDesired && queueDesired > memDesired) {
      driver = 'queue'; driverHe = 'תור';
    }

    return {
      desired,
      signal: { cpu: last.cpu, memory: last.memory, queueDepth: last.queueDepth },
      driver,
      reason: `reactive policy driven by ${driver}: cpu=${last.cpu}% mem=${last.memory}% queue=${last.queueDepth}`,
      reasonHe: `מדיניות תגובתית לפי ${driverHe}: מעבד=${last.cpu}% זיכרון=${last.memory}% תור=${last.queueDepth}`,
    };
  }

  /* -------- policy #2: predictive -------- */

  /**
   * Linear-regression forecast of CPU utilisation `horizonMs` ahead.
   * Returns { desired, projectedCpu, reason, reasonHe } or null.
   * Only fires UP — never proposes scale-down.
   */
  _predictiveDesired() {
    const cfg = this.config;
    if (!cfg.predictiveEnabled) return null;
    const window = this.metrics.slice(-cfg.predictiveWindowSize);
    const cpuWindow = window.filter((m) => m.cpu !== null);
    if (cpuWindow.length < cfg.predictiveMinSamples) return null;
    // Normalise timestamps relative to the first sample — epoch-scale x values
    // blow up least-squares FP precision.
    const baseTs = cpuWindow[0].timestamp;
    const cpuPoints = cpuWindow.map((m) => ({ x: m.timestamp - baseTs, y: m.cpu }));

    const reg = linearRegression(cpuPoints);
    if (!reg) return null;

    const lastRelTs = cpuPoints[cpuPoints.length - 1].x;
    const futureX = lastRelTs + cfg.predictiveHorizonMs;
    const projected = reg.slope * futureX + reg.intercept;
    if (!isFiniteNumber(projected)) return null;

    // Only care if projection exceeds target
    if (projected <= cfg.targetCpuPct) return null;

    const current = Math.max(1, this.replicas);
    const desired = Math.ceil((current * projected) / cfg.targetCpuPct);
    if (desired <= current) return null;

    return {
      desired,
      projectedCpu: projected,
      slope: reg.slope,
      reason: `predictive: projected CPU ${projected.toFixed(1)}% in ${cfg.predictiveHorizonMs}ms exceeds target ${cfg.targetCpuPct}%`,
      reasonHe: `חיזוי: צפי מעבד ${projected.toFixed(1)}% בעוד ${cfg.predictiveHorizonMs} מ"ש חורג מהיעד ${cfg.targetCpuPct}%`,
    };
  }

  /* -------- policy #3: schedule -------- */

  /**
   * Is the given instant an Israeli business hour?
   * Returns { isBusiness, isHoliday, holiday?, hour, dayOfWeek }.
   */
  _scheduleInfo(instant) {
    const cfg = this.config;
    const ts = instant ?? this.now();
    const dateStr = toIsraelDateString(ts);
    const clock = toIsraelClock(ts);
    const holiday = cfg.holidays.find((h) => h.date === dateStr) || null;
    const inDay = cfg.businessDays.includes(clock.dayOfWeek);
    const inHour = clock.hour >= cfg.scheduleStartHour && clock.hour < cfg.scheduleEndHour;
    const isBusiness = inDay && inHour && !holiday;
    return { isBusiness, isHoliday: !!holiday, holiday, hour: clock.hour, dayOfWeek: clock.dayOfWeek, dateStr };
  }

  _scheduleDesired(instant) {
    const cfg = this.config;
    if (!cfg.scheduleEnabled) return null;
    const info = this._scheduleInfo(instant);
    if (info.isHoliday) {
      this._emit('holiday', { date: info.dateStr, name: info.holiday.name, nameHe: info.holiday.nameHe });
      return null;
    }
    if (!info.isBusiness) return null;
    return {
      desired: cfg.scheduleMinReplicas,
      reason: `schedule floor during Israeli business hours (${cfg.scheduleStartHour}:00-${cfg.scheduleEndHour}:00)`,
      reasonHe: `רצפת לו"ז בשעות העסקים בישראל (${cfg.scheduleStartHour}:00-${cfg.scheduleEndHour}:00)`,
    };
  }

  /* -------- master evaluation -------- */

  /**
   * Compute and apply a scaling decision right now.
   * Writes to `this.replicas`, appends to ledgers, emits events.
   */
  evaluate() {
    const now = this.now();
    const cfg = this.config;

    const reactive = this._reactiveDesired();
    const predictive = this._predictiveDesired();
    const schedule = this._scheduleDesired(now);

    // Combine: take the MAX of all policies (scale-up wins).
    // Reactive can drive DOWN; predictive/schedule can only raise.
    const reactiveDesired = reactive ? reactive.desired : this.replicas;
    const predictiveDesired = predictive ? predictive.desired : 0;
    const scheduleFloor = schedule ? schedule.desired : 0;

    const combined = Math.max(reactiveDesired, predictiveDesired, scheduleFloor);
    const winningPolicy =
      combined === predictiveDesired && predictive ? 'predictive'
        : combined === scheduleFloor && schedule ? 'schedule'
          : 'reactive';

    // Step-limit the movement (aggressive up, conservative down)
    const from = this.replicas;
    let target = combined;
    if (target > from) {
      target = Math.min(target, from + cfg.scaleUpStep);
    } else if (target < from) {
      target = Math.max(target, from - cfg.scaleDownStep);
    }

    // Clamp to hard bounds
    const preClamp = target;
    target = clampNumber(target, cfg.minReplicas, cfg.maxReplicas);
    if (target !== preClamp) {
      this._emit('bounds-clamp', {
        requested: preClamp,
        clamped: target,
        bound: preClamp > cfg.maxReplicas ? 'max' : 'min',
        reason: `clamped to [${cfg.minReplicas}, ${cfg.maxReplicas}]`,
        reasonHe: `הוגבל לטווח [${cfg.minReplicas}, ${cfg.maxReplicas}]`,
      });
    }

    // Cooldown checks
    const direction = target > from ? 'up' : target < from ? 'down' : 'none';
    if (direction === 'up') {
      const elapsed = now - this.lastScaleUpAt;
      if (elapsed < cfg.scaleUpCooldownMs) {
        const remaining = cfg.scaleUpCooldownMs - elapsed;
        this._emit('cooldown', {
          direction: 'up', remainingMs: remaining,
          reason: `scale-up cooldown active (${remaining}ms left)`,
          reasonHe: `תקופת הצינון להוספה פעילה (${remaining} מ"ש)`,
        });
        return this._recordDecision({
          now, from, desired: combined, target: from, applied: false, policy: winningPolicy,
          reactive, predictive, schedule, direction: 'cooldown-up',
          reason: 'scale-up cooldown', reasonHe: 'צינון הוספה',
        });
      }
    } else if (direction === 'down') {
      const elapsed = now - this.lastScaleDownAt;
      if (elapsed < cfg.scaleDownCooldownMs) {
        const remaining = cfg.scaleDownCooldownMs - elapsed;
        this._emit('cooldown', {
          direction: 'down', remainingMs: remaining,
          reason: `scale-down cooldown active (${remaining}ms left)`,
          reasonHe: `תקופת הצינון להורדה פעילה (${remaining} מ"ש)`,
        });
        return this._recordDecision({
          now, from, desired: combined, target: from, applied: false, policy: winningPolicy,
          reactive, predictive, schedule, direction: 'cooldown-down',
          reason: 'scale-down cooldown', reasonHe: 'צינון הורדה',
        });
      }
    }

    // Apply
    this.replicas = target;
    let reason, reasonHe;
    if (winningPolicy === 'predictive' && predictive) {
      reason = predictive.reason; reasonHe = predictive.reasonHe;
    } else if (winningPolicy === 'schedule' && schedule) {
      reason = schedule.reason; reasonHe = schedule.reasonHe;
    } else if (reactive) {
      reason = reactive.reason; reasonHe = reactive.reasonHe;
    } else {
      reason = 'no metrics yet — holding at initial replicas';
      reasonHe = 'אין מדדים — שומר על כמות העותקים ההתחלתית';
    }

    if (direction === 'up') {
      this.lastScaleUpAt = now;
      const action = { timestamp: now, from, to: target, delta: target - from, policy: winningPolicy, reason, reasonHe };
      this.actions.push(action);
      this._emit('scale-up', action);
    } else if (direction === 'down') {
      this.lastScaleDownAt = now;
      const action = { timestamp: now, from, to: target, delta: target - from, policy: winningPolicy, reason, reasonHe };
      this.actions.push(action);
      this._emit('scale-down', action);
    } else {
      this._emit('no-change', { replicas: target, reason, reasonHe });
    }

    return this._recordDecision({
      now, from, desired: combined, target, applied: true, policy: winningPolicy,
      reactive, predictive, schedule, direction,
      reason, reasonHe,
    });
  }

  /* -------- planning helper -------- */

  /**
   * Non-mutating what-if projection. Does not apply the decision, does not
   * emit events, does not touch cooldowns. Useful for UI "if we were at time
   * T with these metrics, what would we do?" queries.
   */
  plan({ at, metric } = {}) {
    const snapshot = {
      replicas: this.replicas,
      lastScaleUpAt: this.lastScaleUpAt,
      lastScaleDownAt: this.lastScaleDownAt,
      metricsLen: this.metrics.length,
      decisionsLen: this.decisions.length,
      actionsLen: this.actions.length,
      eventsLen: this.events.length,
      origNow: this.now,
    };
    try {
      if (isFiniteNumber(at)) this.now = () => at;
      if (metric) this.recordMetric({ ...metric, timestamp: at ?? metric.timestamp });
      const r = this.evaluate();
      // roll back state
      this.replicas = snapshot.replicas;
      this.lastScaleUpAt = snapshot.lastScaleUpAt;
      this.lastScaleDownAt = snapshot.lastScaleDownAt;
      this.metrics.length = snapshot.metricsLen;
      this.decisions.length = snapshot.decisionsLen;
      this.actions.length = snapshot.actionsLen;
      this.events.length = snapshot.eventsLen;
      return r;
    } finally {
      this.now = snapshot.origNow;
    }
  }

  /* -------- introspection (read-only) -------- */

  getReplicas() { return this.replicas; }
  getConfig() { return this.config; }
  getMetrics() { return this.metrics.slice(); }
  getDecisions() { return this.decisions.slice(); }
  getActions() { return this.actions.slice(); }
  getEvents() { return this.events.slice(); }

  isBusinessHours(at) { return this._scheduleInfo(at).isBusiness; }
  isHoliday(at) { return this._scheduleInfo(at).isHoliday; }

  /**
   * Add a holiday at runtime (append only — we never delete existing ones).
   */
  addHoliday(holiday) {
    if (!holiday || typeof holiday.date !== 'string') {
      throw new Error('holiday.date (YYYY-MM-DD) is required');
    }
    const merged = this.config.holidays.slice();
    merged.push({
      date: holiday.date,
      name: holiday.name || holiday.date,
      nameHe: holiday.nameHe || holiday.name || holiday.date,
    });
    // freeze a new config (original never mutated)
    this.config = Object.freeze({ ...this.config, holidays: Object.freeze(merged) });
    return merged.length;
  }

  /* -------- internals -------- */

  _recordDecision(record) {
    this.decisions.push(record);
    this._emit('decision', {
      timestamp: record.now,
      replicas: record.target,
      desired: record.desired,
      reason: record.reason,
      reasonHe: record.reasonHe,
      policy: record.policy,
      applied: record.applied,
    });
    return record;
  }

  _emit(name, payload) {
    this.events.push({ name, at: this.now(), payload });
    this.emit(name, payload);
  }
}

module.exports = { AutoScaler, DEFAULTS, ISRAELI_HOLIDAYS_2026 };
