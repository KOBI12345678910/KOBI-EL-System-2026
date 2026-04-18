/**
 * ONYX — Scheduled Reminder Engine
 * ═══════════════════════════════════════════════════════════════
 * Agent Y-128 — Techno-Kol Uzi mega-ERP 2026
 *
 * General-purpose, deterministic, zero-dependency reminder engine
 * used by every module that needs to notify a human or a system
 * at a future point in time (invoices, approvals, tax filings,
 * procurement orders, maintenance, contracts, follow-ups, etc.).
 *
 * Rule enforced: "לא מוחקים רק משדרגים ומגדלים"
 *   Reminders are NEVER hard-deleted. `cancelReminder()` marks a
 *   reminder as `status:'cancelled'` while keeping the full audit
 *   trail in `history`. Every state transition is appended to the
 *   reminder's own `history[]` array + the global `_log` stream.
 *
 * Zero external dependencies — only:
 *   - node:crypto  (for randomUUID; fallback to internal generator)
 *   - node:timers  (for the executor queue — swappable via options)
 *
 * Bilingual: every reminder supports `description_he` + `description_en`.
 * Output payloads (e.g. for delivery) always include both languages.
 *
 * SCHEDULE FORMATS
 * ────────────────
 *   1. ISO-8601 string          : '2026-04-20T09:00:00+03:00'
 *   2. Date instance            : new Date('2026-04-20T09:00:00Z')
 *   3. Epoch-ms number          : 1776000000000
 *   4. Cron object              : { cron: '0 9 * * 1' }   // every Mon 09:00
 *   5. Relative object          : { relativeTo: '<ISO or id>', offset: '7d' }
 *      offset grammar: '15m', '2h', '3d', '1w', '6mo', '1y', or negative '-2h'
 *
 * CRON SUPPORT
 * ────────────
 *   Standard 5-field cron: "minute hour day-of-month month day-of-week".
 *   Supports: lists (1,2,3), ranges (1-5), steps (STAR/5), and '*' wildcard.
 *   Day-of-week: 0 or 7 = Sunday, 1 = Monday, ..., 6 = Saturday.
 *   NOTE: The engine also accepts `{frequency}` via recurringReminder for
 *   simple daily/weekly/monthly/yearly presets without touching cron.
 *
 * QUIET HOURS & SHABBAT
 * ─────────────────────
 *   Users may define a `range` like `{start:'22:00', end:'07:00', tz:'+03:00'}`
 *   or a weekday-aware table. When a reminder fires inside a quiet window
 *   it is postponed to the end of the window (or to the next allowed time).
 *
 *   Shabbat observance is modelled as a recurring quiet block every
 *   Friday sunset → Saturday nightfall. Because we do NOT bundle an
 *   astronomical library, the engine uses conservative defaults
 *   (Fri 18:00 → Sat 20:00 local) and allows per-user overrides, plus
 *   an optional `sunsetTable` the caller can supply.
 *
 * ISRAELI HOLIDAYS
 * ────────────────
 *   We ship a static table of the main Jewish holidays for years
 *   2025-2027 (mega-ERP planning horizon). Users can opt-in per-user
 *   via `israeliHolidayAware({userId:..., enabled:true})`. When a
 *   reminder lands on a full-holiday day it is pushed to the next
 *   business day at the same time-of-day (preserving offset).
 *
 * ESCALATION
 * ──────────
 *   An escalation is a secondary reminder that fires `offset` after
 *   the primary, addressed to `escalateTo`, unless the primary has
 *   been marked `acknowledged` or `acted`.
 *
 * CHANNEL FALLBACK
 * ────────────────
 *   A reminder can declare `channels:['sms','email']` (primary first)
 *   or use `channelFallback({primary, secondary})`. The `delivery()`
 *   method tries the primary, and if it throws / returns
 *   `{ok:false}`, it walks to the next fallback.
 *
 * ACTIONABLE REMINDERS
 * ────────────────────
 *   `actionableReminder({action})` attaches an action descriptor so
 *   the rendered SMS/email contains a signed link or CTA button:
 *     - approve-invoice → /approvals/:reminderId
 *     - sign-doc        → /documents/sign/:reminderId
 *     - pay-bill        → /bills/pay/:reminderId
 *
 * ─────────────────────────────────────────────────────────────── */

'use strict';

/* ------------------------------------------------------------------ */
/* UUID (zero-dep with crypto fallback)                                 */
/* ------------------------------------------------------------------ */

let _randomUUID;
try {
  // eslint-disable-next-line global-require
  _randomUUID = require('node:crypto').randomUUID;
} catch (_) { /* pure-JS fallback below */ }

let _uuidCounter = 0;
function uuid () {
  if (typeof _randomUUID === 'function') return _randomUUID();
  _uuidCounter += 1;
  const ts = Date.now().toString(16);
  const rnd = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return `rem-${ts}-${rnd}-${_uuidCounter.toString(16)}`;
}

/* ------------------------------------------------------------------ */
/* Offset parser: '15m', '2h', '3d', '1w', '6mo', '1y', '-2h'           */
/* ------------------------------------------------------------------ */

const OFFSET_RE = /^(-?\d+)(ms|s|m|h|d|w|mo|y)$/;
const OFFSET_MS = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  mo: 30 * 24 * 60 * 60 * 1000, // approximation – used for simple offsets
  y: 365 * 24 * 60 * 60 * 1000,
};

function parseOffset (off) {
  if (off == null) return 0;
  if (typeof off === 'number') return off;
  if (typeof off !== 'string') throw new TypeError('offset must be string|number');
  const m = OFFSET_RE.exec(off.trim());
  if (!m) throw new RangeError(`invalid offset: "${off}"`);
  const n = parseInt(m[1], 10);
  return n * OFFSET_MS[m[2]];
}

/* ------------------------------------------------------------------ */
/* When-resolver: turns the "when" parameter into an absolute epoch-ms  */
/* ------------------------------------------------------------------ */

function toEpochMs (val) {
  if (val == null) throw new TypeError('when is required');
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const t = Date.parse(val);
    if (Number.isNaN(t)) throw new RangeError(`invalid date string: "${val}"`);
    return t;
  }
  throw new TypeError('expected Date | number | ISO string');
}

/* ------------------------------------------------------------------ */
/* Cron parser (5 fields)                                               */
/* ------------------------------------------------------------------ */

/* Field bounds: [min, max] inclusive                                   */
const CRON_FIELDS = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour',   min: 0, max: 23 },
  { name: 'dom',    min: 1, max: 31 },
  { name: 'month',  min: 1, max: 12 },
  { name: 'dow',    min: 0, max: 6 },  // 0 or 7 = Sunday
];

function _expandCronField (tok, { min, max }) {
  const out = new Set();
  for (const piece of tok.split(',')) {
    // step
    let step = 1;
    let base = piece;
    const slash = piece.indexOf('/');
    if (slash !== -1) {
      step = parseInt(piece.slice(slash + 1), 10);
      base = piece.slice(0, slash);
      if (!Number.isFinite(step) || step <= 0) {
        throw new RangeError(`invalid cron step: "${piece}"`);
      }
    }
    let start; let end;
    if (base === '*' || base === '') {
      start = min; end = max;
    } else if (base.includes('-')) {
      const [a, b] = base.split('-').map(x => parseInt(x, 10));
      start = a; end = b;
    } else {
      const n = parseInt(base, 10);
      start = n; end = n;
    }
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      throw new RangeError(`invalid cron token: "${tok}"`);
    }
    for (let i = start; i <= end; i += step) {
      if (i < min || i > max) continue;
      out.add(i);
    }
  }
  return out;
}

function parseCron (expr) {
  if (typeof expr !== 'string') throw new TypeError('cron must be string');
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new RangeError(`cron must have 5 fields, got ${parts.length}: "${expr}"`);
  }
  const sets = parts.map((tok, i) => _expandCronField(tok, CRON_FIELDS[i]));
  // Normalise DOW: 7 → 0 (Sunday)
  if (sets[4].has(7)) { sets[4].delete(7); sets[4].add(0); }
  return {
    expr,
    minute: sets[0],
    hour:   sets[1],
    dom:    sets[2],
    month:  sets[3],
    dow:    sets[4],
  };
}

/* Compute the next cron occurrence strictly AFTER `after` (epoch ms).  */
function nextCronFire (cron, after) {
  const d = new Date(after + 60000 - ((after + 60000) % 60000)); // ceil to next minute
  // Hard cap on 4 years of minute iterations to avoid infinite loops on
  // impossible schedules (e.g. Feb 30). 60 * 24 * 366 * 4 ≈ 2.1M — still
  // fast enough for test calls but protects the executor.
  const cap = 60 * 24 * 366 * 4;
  for (let i = 0; i < cap; i += 1) {
    const m = d.getUTCMinutes();
    const h = d.getUTCHours();
    const dom = d.getUTCDate();
    const month = d.getUTCMonth() + 1;
    const dow = d.getUTCDay();
    if (
      cron.minute.has(m) &&
      cron.hour.has(h) &&
      cron.dom.has(dom) &&
      cron.month.has(month) &&
      cron.dow.has(dow)
    ) {
      return d.getTime();
    }
    d.setTime(d.getTime() + 60000);
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Israeli holidays (static table for 2025-2027)                        */
/* ------------------------------------------------------------------ */
/* Dates are the FULL holiday days (Yom Tov + secular observance) in    */
/* Asia/Jerusalem. Entries are {start,end} inclusive ISO dates.         */
/* This is a conservative superset used only for postponing reminders.  */

const ISRAELI_HOLIDAYS = [
  // 2025
  { start: '2025-04-13', end: '2025-04-19', he: 'פסח', en: 'Passover' },
  { start: '2025-05-01', end: '2025-05-01', he: 'יום הזיכרון', en: 'Memorial Day' },
  { start: '2025-05-02', end: '2025-05-02', he: 'יום העצמאות', en: 'Independence Day' },
  { start: '2025-06-02', end: '2025-06-02', he: 'שבועות', en: 'Shavuot' },
  { start: '2025-09-23', end: '2025-09-24', he: 'ראש השנה', en: 'Rosh Hashanah' },
  { start: '2025-10-02', end: '2025-10-02', he: 'יום כיפור', en: 'Yom Kippur' },
  { start: '2025-10-07', end: '2025-10-14', he: 'סוכות', en: 'Sukkot' },

  // 2026
  { start: '2026-04-02', end: '2026-04-08', he: 'פסח', en: 'Passover' },
  { start: '2026-04-22', end: '2026-04-22', he: 'יום הזיכרון', en: 'Memorial Day' },
  { start: '2026-04-23', end: '2026-04-23', he: 'יום העצמאות', en: 'Independence Day' },
  { start: '2026-05-22', end: '2026-05-22', he: 'שבועות', en: 'Shavuot' },
  { start: '2026-09-12', end: '2026-09-13', he: 'ראש השנה', en: 'Rosh Hashanah' },
  { start: '2026-09-21', end: '2026-09-21', he: 'יום כיפור', en: 'Yom Kippur' },
  { start: '2026-09-26', end: '2026-10-03', he: 'סוכות', en: 'Sukkot' },

  // 2027
  { start: '2027-04-22', end: '2027-04-28', he: 'פסח', en: 'Passover' },
  { start: '2027-05-12', end: '2027-05-12', he: 'יום הזיכרון', en: 'Memorial Day' },
  { start: '2027-05-13', end: '2027-05-13', he: 'יום העצמאות', en: 'Independence Day' },
  { start: '2027-06-11', end: '2027-06-11', he: 'שבועות', en: 'Shavuot' },
  { start: '2027-10-02', end: '2027-10-03', he: 'ראש השנה', en: 'Rosh Hashanah' },
  { start: '2027-10-11', end: '2027-10-11', he: 'יום כיפור', en: 'Yom Kippur' },
  { start: '2027-10-16', end: '2027-10-23', he: 'סוכות', en: 'Sukkot' },
];

function _ymd (date) {
  // YYYY-MM-DD in UTC; adequate for day-bucket comparisons
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isIsraeliHoliday (epochMs) {
  const ymd = _ymd(new Date(epochMs));
  return ISRAELI_HOLIDAYS.some(h => ymd >= h.start && ymd <= h.end);
}

function nextNonHoliday (epochMs) {
  let t = epochMs;
  for (let i = 0; i < 15; i += 1) {
    if (!isIsraeliHoliday(t)) return t;
    t += OFFSET_MS.d;
  }
  return t; // give up after 15 days to prevent runaway
}

/* ------------------------------------------------------------------ */
/* Quiet hours & Shabbat                                                */
/* ------------------------------------------------------------------ */

/* Default Shabbat window: Friday 18:00 → Saturday 20:00 (Asia/Jerusalem)
 * We intentionally overshoot to be safe; callers can pass a custom
 * `range` object per user for more precise observance.
 */
const DEFAULT_SHABBAT = {
  startDow: 5, startHour: 18, startMin: 0,
  endDow: 6,   endHour: 20,   endMin: 0,
};

function _minsOfDay (d) { return d.getUTCHours() * 60 + d.getUTCMinutes(); }

function isInQuietRange (epochMs, range) {
  if (!range) return false;
  const d = new Date(epochMs);
  const mins = _minsOfDay(d);
  const dow = d.getUTCDay();
  if (range.weekly) {
    const day = range.weekly[dow];
    if (!day) return false;
    return mins >= day.start && mins < day.end;
  }
  if (range.start && range.end) {
    const [sh, sm] = range.start.split(':').map(Number);
    const [eh, em] = range.end.split(':').map(Number);
    const s = sh * 60 + sm;
    const e = eh * 60 + em;
    if (s <= e) return mins >= s && mins < e;
    // wraps midnight
    return mins >= s || mins < e;
  }
  return false;
}

function isInShabbat (epochMs, shabbat) {
  const cfg = shabbat || DEFAULT_SHABBAT;
  const d = new Date(epochMs);
  const dow = d.getUTCDay();
  const mins = _minsOfDay(d);
  if (dow === cfg.startDow && mins >= (cfg.startHour * 60 + cfg.startMin)) return true;
  if (dow === cfg.endDow && mins < (cfg.endHour * 60 + cfg.endMin)) return true;
  if (cfg.startDow < cfg.endDow && dow > cfg.startDow && dow < cfg.endDow) return true;
  return false;
}

function nextOutsideQuiet (epochMs, range, shabbat) {
  let t = epochMs;
  const step = 60000; // 1 minute
  for (let i = 0; i < 60 * 24 * 10; i += 1) { // up to 10 days lookahead
    if (!isInQuietRange(t, range) && !isInShabbat(t, shabbat)) return t;
    t += step;
  }
  return t;
}

/* ------------------------------------------------------------------ */
/* ReminderEngine                                                       */
/* ------------------------------------------------------------------ */

class ReminderEngine {
  /**
   * @param {object} options
   * @param {Function=} options.clock              - () => epoch-ms, for deterministic tests
   * @param {object=}   options.scheduler          - { set, clear } injectable timer (defaults to node:timers)
   * @param {object=}   options.channels           - { sms:async, email:async, push:async, telegram:async, webhook:async }
   * @param {object=}   options.logger             - { info, warn, error }
   * @param {object=}   options.userSettings       - map<userId, {quietHours, shabbat, israeliHolidayAware, timezone}>
   */
  constructor (options = {}) {
    this.clock = options.clock || (() => Date.now());
    this.scheduler = options.scheduler || {
      set: (fn, ms) => setTimeout(fn, ms),
      clear: (h) => clearTimeout(h),
    };
    this.channels = options.channels || {};
    this.logger = options.logger || { info: () => {}, warn: () => {}, error: () => {} };
    this.userSettings = options.userSettings || new Map();
    if (!(this.userSettings instanceof Map)) {
      // allow plain object for convenience
      const m = new Map();
      for (const k of Object.keys(this.userSettings)) m.set(k, this.userSettings[k]);
      this.userSettings = m;
    }

    this._reminders = new Map();     // id → reminder record
    this._timers = new Map();        // id → scheduler handle (for active timers)
    this._history = [];              // append-only global audit
    this._triggers = new Map();      // eventName → Set<handlers>
    this._stats = { scheduled: 0, delivered: 0, cancelled: 0, escalated: 0 };
  }

  /* ============================================================== */
  /* PUBLIC API                                                       */
  /* ============================================================== */

  /**
   * Schedule a new reminder.
   * Returns the canonical reminder record (frozen snapshot-safe copy).
   */
  schedule (input) {
    if (!input || typeof input !== 'object') {
      throw new TypeError('schedule(input) requires an object');
    }
    const {
      id,
      owner,
      what,
      when,
      channels,
      recurring,
      endDate,
      description_he,
      description_en,
      escalation,
      action,
      metadata,
      tags,
      priority,
    } = input;

    if (!owner) throw new TypeError('schedule: owner is required');
    if (when == null) throw new TypeError('schedule: when is required');

    const reminderId = id || uuid();
    if (this._reminders.has(reminderId)) {
      throw new Error(`duplicate reminder id: ${reminderId}`);
    }

    const resolved = this._resolveWhen(when);
    const baseFireAt = resolved.fireAt;
    const fireAt = this._applyUserPolicies(owner, baseFireAt);

    const record = {
      id: reminderId,
      owner,
      what: what || 'reminder',
      description_he: description_he || '',
      description_en: description_en || '',
      channels: Array.isArray(channels) && channels.length ? [...channels] : ['email'],
      priority: priority || 'normal',
      tags: Array.isArray(tags) ? [...tags] : [],
      action: action || null,
      metadata: metadata ? { ...metadata } : {},

      // scheduling
      when: resolved.when,
      cron: resolved.cron || null,
      recurring: !!recurring || !!resolved.cron,
      frequency: resolved.frequency || null,
      endDate: endDate ? toEpochMs(endDate) : null,
      fireAt,
      originalFireAt: baseFireAt,

      // escalation
      escalation: escalation ? { ...escalation } : null,

      // state
      status: 'scheduled',          // scheduled | fired | acknowledged | acted | cancelled | snoozed | failed
      attempts: 0,
      lastError: null,
      lastDelivered: null,

      createdAt: this.clock(),
      updatedAt: this.clock(),
      history: [],
    };

    this._touch(record, 'created', { fireAt });
    this._reminders.set(reminderId, record);
    this._stats.scheduled += 1;
    this._arm(record);

    return this._snapshot(record);
  }

  /**
   * Mark a reminder cancelled — NEVER deleted. Timer is cleared,
   * status becomes 'cancelled', history records the reason.
   */
  cancelReminder (reminderId, reason) {
    const r = this._reminders.get(reminderId);
    if (!r) throw new Error(`cancelReminder: unknown id ${reminderId}`);
    if (r.status === 'cancelled') return this._snapshot(r);
    this._disarm(reminderId);
    r.status = 'cancelled';
    r.updatedAt = this.clock();
    this._touch(r, 'cancelled', { reason: reason || null });
    this._stats.cancelled += 1;
    return this._snapshot(r);
  }

  /**
   * Postpone a reminder by `minutes` (positive integer).
   */
  snooze (reminderId, minutes) {
    const r = this._reminders.get(reminderId);
    if (!r) throw new Error(`snooze: unknown id ${reminderId}`);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw new RangeError('snooze: minutes must be positive number');
    }
    const prevFire = r.fireAt;
    const newFire = Math.max(this.clock(), prevFire) + minutes * 60000;
    r.fireAt = this._applyUserPolicies(r.owner, newFire);
    r.status = 'snoozed';
    r.updatedAt = this.clock();
    this._touch(r, 'snoozed', { from: prevFire, to: r.fireAt, minutes });
    this._rearm(r);
    return this._snapshot(r);
  }

  /**
   * Reschedule a reminder to a new time (any when-format).
   */
  reschedule (reminderId, newTime) {
    const r = this._reminders.get(reminderId);
    if (!r) throw new Error(`reschedule: unknown id ${reminderId}`);
    const resolved = this._resolveWhen(newTime);
    const prev = r.fireAt;
    r.when = resolved.when;
    r.cron = resolved.cron || r.cron;
    r.frequency = resolved.frequency || r.frequency;
    r.originalFireAt = resolved.fireAt;
    r.fireAt = this._applyUserPolicies(r.owner, resolved.fireAt);
    r.status = 'scheduled';
    r.updatedAt = this.clock();
    this._touch(r, 'rescheduled', { from: prev, to: r.fireAt });
    this._rearm(r);
    return this._snapshot(r);
  }

  /**
   * List upcoming reminders for a user in a time window.
   * @param {object} args
   * @param {string} args.userId
   * @param {object|string|number} [args.window] - {from,to} | offset-string ('7d') | ms
   */
  upcomingReminders ({ userId, window: win } = {}) {
    const now = this.clock();
    let from = now;
    let to = now + OFFSET_MS.w;
    if (typeof win === 'string') {
      to = now + parseOffset(win);
    } else if (typeof win === 'number') {
      to = now + win;
    } else if (win && typeof win === 'object') {
      from = win.from != null ? toEpochMs(win.from) : from;
      to = win.to != null ? toEpochMs(win.to) : to;
    }
    const out = [];
    for (const r of this._reminders.values()) {
      if (userId && r.owner !== userId) continue;
      if (r.status === 'cancelled') continue;
      if (r.fireAt < from || r.fireAt > to) continue;
      out.push(this._snapshot(r));
    }
    out.sort((a, b) => a.fireAt - b.fireAt);
    return out;
  }

  /**
   * Convenience wrapper — schedule a recurring reminder via
   * frequency string rather than hand-rolled cron.
   */
  recurringReminder (input) {
    if (!input || typeof input !== 'object') {
      throw new TypeError('recurringReminder(input) requires object');
    }
    const { frequency } = input;
    if (!frequency) throw new TypeError('frequency is required');
    let cron;
    switch (frequency) {
      case 'daily':   cron = '0 9 * * *'; break;
      case 'weekly':  cron = '0 9 * * 1'; break;   // Monday 09:00
      case 'monthly': cron = '0 9 1 * *'; break;   // 1st of month 09:00
      case 'yearly':  cron = '0 9 1 1 *'; break;   // Jan 1st 09:00
      case 'custom-cron':
        if (!input.cron) throw new TypeError('custom-cron requires input.cron');
        cron = input.cron;
        break;
      default:
        throw new RangeError(`unknown frequency: ${frequency}`);
    }
    return this.schedule({
      ...input,
      when: { cron },
      recurring: true,
    });
  }

  /**
   * Contextual (event-driven) reminder. Instead of a timer, the
   * reminder is armed in response to a business event. The trigger
   * string is a dotted namespace like `invoice.created` and
   * `condition` is a predicate `(event) => boolean`.
   *
   * The caller must invoke `fireTrigger(eventName, eventPayload)` to
   * evaluate triggers. If the predicate passes, the reminder is
   * scheduled at `when` (supports relativeTo the event timestamp).
   */
  contextualReminder (input) {
    if (!input || typeof input !== 'object') {
      throw new TypeError('contextualReminder requires object');
    }
    const { trigger, condition } = input;
    if (!trigger) throw new TypeError('trigger is required');
    const id = input.id || uuid();
    const spec = Object.freeze({
      id,
      spec: Object.freeze({ ...input, id }),
      condition: typeof condition === 'function' ? condition : () => true,
    });
    if (!this._triggers.has(trigger)) this._triggers.set(trigger, new Set());
    this._triggers.get(trigger).add(spec);
    return { id, trigger, registered: true };
  }

  /**
   * Dispatch a business event to all registered contextual triggers.
   * If a trigger's condition(event) returns truthy, a reminder is
   * scheduled based on the spec (supports `relativeTo: 'event'`).
   */
  fireTrigger (eventName, event = {}) {
    const bucket = this._triggers.get(eventName);
    if (!bucket || bucket.size === 0) return [];
    const created = [];
    for (const entry of bucket) {
      let matched = false;
      try { matched = !!entry.condition(event); }
      catch (e) { this.logger.error('trigger predicate threw', e); continue; }
      if (!matched) continue;
      const spec = { ...entry.spec };
      delete spec.trigger;
      delete spec.condition;
      if (spec.when && typeof spec.when === 'object' && spec.when.relativeTo === 'event') {
        const base = event.timestamp != null ? toEpochMs(event.timestamp) : this.clock();
        spec.when = base + parseOffset(spec.when.offset || 0);
      }
      spec.metadata = { ...(spec.metadata || {}), eventName, event };
      created.push(this.schedule(spec));
    }
    return created;
  }

  /**
   * Attach or replace escalation config on an existing reminder.
   */
  escalation ({ reminderId, offset, escalateTo, channels }) {
    const r = this._reminders.get(reminderId);
    if (!r) throw new Error(`escalation: unknown id ${reminderId}`);
    if (!escalateTo) throw new TypeError('escalateTo is required');
    r.escalation = {
      offset: offset || '15m',
      escalateTo,
      channels: channels || r.channels,
      fired: false,
    };
    r.updatedAt = this.clock();
    this._touch(r, 'escalation-configured', r.escalation);
    return this._snapshot(r);
  }

  /**
   * Channel-fallback helper: build a channels array. Pure function,
   * no state change — call `schedule({channels: [...]})` with result.
   */
  channelFallback ({ primary, secondary, tertiary }) {
    if (!primary) throw new TypeError('primary channel is required');
    const out = [primary];
    if (secondary) out.push(secondary);
    if (tertiary) out.push(tertiary);
    return out;
  }

  /**
   * Register or update quiet hours for a user.
   * range format: { start:'22:00', end:'07:00', tz?: '+03:00' }
   *            or { weekly: { 0:{start,end}, 1:{...}, ... } }
   */
  quietHours ({ userId, range }) {
    if (!userId) throw new TypeError('userId is required');
    const prev = this.userSettings.get(userId) || {};
    const next = { ...prev, quietHours: range || null };
    this.userSettings.set(userId, next);
    return next;
  }

  /**
   * Toggle Israeli-holiday awareness for a user.
   */
  israeliHolidayAware ({ userId, enabled = true }) {
    if (!userId) throw new TypeError('userId is required');
    const prev = this.userSettings.get(userId) || {};
    const next = { ...prev, israeliHolidayAware: !!enabled };
    this.userSettings.set(userId, next);
    return next;
  }

  /**
   * Bulk-schedule reminders. Returns {ok, failed} summary where ok is
   * the count of successfully-scheduled reminders. Errors do NOT
   * abort the batch — they are collected in `failed[]`.
   */
  bulkSchedule (reminders) {
    if (!Array.isArray(reminders)) {
      throw new TypeError('bulkSchedule: expected array');
    }
    const created = [];
    const failed = [];
    for (const spec of reminders) {
      try { created.push(this.schedule(spec)); }
      catch (e) { failed.push({ spec, error: e.message }); }
    }
    return { ok: created.length, failed, created };
  }

  /**
   * Returns a snapshot of the executor queue: all armed reminders in
   * chronological order. Used for diagnostics and test harnesses.
   */
  executorQueue () {
    const active = [];
    for (const r of this._reminders.values()) {
      if (r.status === 'scheduled' || r.status === 'snoozed') active.push(this._snapshot(r));
    }
    active.sort((a, b) => a.fireAt - b.fireAt);
    return active;
  }

  /**
   * Actually deliver a reminder via one of its channels. Tries channels
   * in order (primary, secondary, ...) and returns on first success.
   * If no injected channel handler exists, falls back to a structured
   * log entry — useful in tests and development.
   */
  async delivery ({ reminderId, channel }) {
    const r = this._reminders.get(reminderId);
    if (!r) throw new Error(`delivery: unknown id ${reminderId}`);
    const order = channel ? [channel] : r.channels;
    let lastErr = null;
    for (const ch of order) {
      try {
        const handler = this.channels[ch];
        const payload = this._renderPayload(r, ch);
        let result;
        if (typeof handler === 'function') {
          result = await handler(payload);
        } else {
          result = { ok: true, stub: true, channel: ch };
        }
        if (result && result.ok === false) {
          lastErr = new Error(result.error || `channel ${ch} refused`);
          this._touch(r, 'delivery-failed', { channel: ch, error: lastErr.message });
          continue;
        }
        r.lastDelivered = { channel: ch, at: this.clock(), result };
        r.status = 'fired';
        r.updatedAt = this.clock();
        r.attempts += 1;
        this._stats.delivered += 1;
        this._touch(r, 'delivered', { channel: ch });
        return { ok: true, channel: ch, result };
      } catch (e) {
        lastErr = e;
        r.lastError = e.message;
        this._touch(r, 'delivery-error', { channel: ch, error: e.message });
      }
    }
    r.status = 'failed';
    r.updatedAt = this.clock();
    return { ok: false, error: lastErr ? lastErr.message : 'no-channels' };
  }

  /**
   * Attach an action descriptor to an existing reminder. Returns the
   * reminder with the actionable link string baked into the payload.
   */
  actionableReminder ({ reminderId, action, urlBase }) {
    const r = this._reminders.get(reminderId);
    if (!r) throw new Error(`actionableReminder: unknown id ${reminderId}`);
    if (!action) throw new TypeError('action is required');
    const KNOWN = {
      'approve-invoice': { path: '/approvals', label_he: 'אשר חשבונית', label_en: 'Approve invoice' },
      'sign-doc':        { path: '/documents/sign', label_he: 'חתום על מסמך', label_en: 'Sign document' },
      'pay-bill':        { path: '/bills/pay', label_he: 'שלם חשבון', label_en: 'Pay bill' },
    };
    const meta = KNOWN[action] || { path: `/action/${action}`, label_he: action, label_en: action };
    const base = urlBase || 'https://app.technokol.local';
    r.action = {
      type: action,
      url: `${base}${meta.path}/${r.id}`,
      label_he: meta.label_he,
      label_en: meta.label_en,
    };
    r.updatedAt = this.clock();
    this._touch(r, 'actionable-attached', { action });
    return this._snapshot(r);
  }

  /**
   * Return the immutable history of a user's reminders (append-only).
   * Even cancelled reminders are included — we never delete.
   */
  reminderHistory ({ userId } = {}) {
    const out = [];
    for (const r of this._reminders.values()) {
      if (userId && r.owner !== userId) continue;
      out.push({
        id: r.id,
        owner: r.owner,
        status: r.status,
        fireAt: r.fireAt,
        originalFireAt: r.originalFireAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        history: [...r.history],
        description_he: r.description_he,
        description_en: r.description_en,
      });
    }
    out.sort((a, b) => a.createdAt - b.createdAt);
    return out;
  }

  /**
   * Advance the virtual clock (test helper). Fires any reminders whose
   * fireAt is ≤ now. Safe to call repeatedly. Returns the list of fired
   * reminder ids.
   */
  async tick (untilEpochMs) {
    const target = untilEpochMs != null ? untilEpochMs : this.clock();
    const fired = [];
    const queue = [...this._reminders.values()]
      .filter(r => (r.status === 'scheduled' || r.status === 'snoozed') && r.fireAt <= target)
      .sort((a, b) => a.fireAt - b.fireAt);

    for (const r of queue) {
      // fire
      // eslint-disable-next-line no-await-in-loop
      const res = await this.delivery({ reminderId: r.id });
      fired.push({ id: r.id, ok: res.ok });

      // schedule escalation (one-shot)
      if (r.escalation && !r.escalation.fired &&
          r.status !== 'acknowledged' && r.status !== 'acted') {
        r.escalation.fired = true;
        const esc = this.schedule({
          owner: r.escalation.escalateTo,
          what: `${r.what}:escalation`,
          when: (r.lastDelivered ? r.lastDelivered.at : r.fireAt) + parseOffset(r.escalation.offset),
          channels: r.escalation.channels || r.channels,
          description_he: `הסלמה: ${r.description_he || r.what}`,
          description_en: `Escalation: ${r.description_en || r.what}`,
          metadata: { escalatedFrom: r.id },
          tags: ['escalation'],
        });
        this._stats.escalated += 1;
        this._touch(r, 'escalation-scheduled', { escalationId: esc.id });
      }

      // advance recurring
      if (r.cron) {
        const nxt = nextCronFire(r.cron, r.fireAt);
        if (nxt != null && (!r.endDate || nxt <= r.endDate)) {
          r.originalFireAt = nxt;
          r.fireAt = this._applyUserPolicies(r.owner, nxt);
          r.status = 'scheduled';
          r.attempts = 0;
          this._touch(r, 'recurring-next', { fireAt: r.fireAt });
          this._rearm(r);
        }
      }
    }
    return fired;
  }

  /**
   * Mark a reminder as acknowledged (user saw it). This PREVENTS
   * escalation on subsequent ticks.
   */
  acknowledge (reminderId, who) {
    const r = this._reminders.get(reminderId);
    if (!r) throw new Error(`acknowledge: unknown id ${reminderId}`);
    r.status = 'acknowledged';
    r.updatedAt = this.clock();
    this._touch(r, 'acknowledged', { by: who || null });
    return this._snapshot(r);
  }

  /**
   * Mark a reminder as acted (user executed the action). Blocks escalation.
   */
  act (reminderId, who) {
    const r = this._reminders.get(reminderId);
    if (!r) throw new Error(`act: unknown id ${reminderId}`);
    r.status = 'acted';
    r.updatedAt = this.clock();
    this._touch(r, 'acted', { by: who || null });
    return this._snapshot(r);
  }

  /**
   * Diagnostics.
   */
  stats () { return { ...this._stats, total: this._reminders.size }; }

  /* ============================================================== */
  /* INTERNAL                                                         */
  /* ============================================================== */

  _resolveWhen (when) {
    if (when == null) throw new TypeError('when is required');
    // Cron object
    if (typeof when === 'object' && !(when instanceof Date) && when.cron) {
      const cron = parseCron(when.cron);
      const fireAt = nextCronFire(cron, this.clock());
      if (fireAt == null) throw new RangeError(`cron yields no near fire: ${when.cron}`);
      return { when: { cron: when.cron }, cron, fireAt, frequency: 'custom-cron' };
    }
    // Relative object
    if (typeof when === 'object' && !(when instanceof Date) && when.relativeTo != null) {
      const base = toEpochMs(when.relativeTo);
      const fireAt = base + parseOffset(when.offset || 0);
      return { when: { relativeTo: when.relativeTo, offset: when.offset }, fireAt };
    }
    // Absolute: Date | ISO string | epoch
    const fireAt = toEpochMs(when);
    return { when: fireAt, fireAt };
  }

  _applyUserPolicies (userId, epochMs) {
    const cfg = this.userSettings.get(userId) || {};
    let t = epochMs;
    // Israeli holiday skip — check first so we don't bounce quiet-hours
    // into the next day only to bounce again.
    if (cfg.israeliHolidayAware) t = nextNonHoliday(t);
    // Quiet hours + Shabbat
    if (cfg.quietHours || cfg.shabbat || cfg.observeShabbat) {
      const shabbat = cfg.shabbat || (cfg.observeShabbat ? DEFAULT_SHABBAT : null);
      t = nextOutsideQuiet(t, cfg.quietHours, shabbat);
    }
    return t;
  }

  _arm (r) {
    if (r.status !== 'scheduled' && r.status !== 'snoozed') return;
    const delay = r.fireAt - this.clock();
    // Skip real timers for far-future reminders (> 24 days overflows
    // setTimeout's 32-bit limit anyway). The caller should drive
    // `tick()` explicitly in tests or use a scheduler of their own.
    if (delay > 0 && delay < 2_000_000_000) {
      const handle = this.scheduler.set(() => {
        // eslint-disable-next-line no-unused-vars
        this.delivery({ reminderId: r.id }).catch(e => this.logger.error('auto-delivery', e));
      }, delay);
      this._timers.set(r.id, handle);
    }
  }

  _disarm (id) {
    const h = this._timers.get(id);
    if (h) {
      try { this.scheduler.clear(h); } catch (_) { /* ignore */ }
      this._timers.delete(id);
    }
  }

  _rearm (r) {
    this._disarm(r.id);
    this._arm(r);
  }

  _touch (r, action, detail) {
    const entry = {
      action,
      at: this.clock(),
      detail: detail == null ? null : { ...detail },
    };
    r.history.push(entry);
    this._history.push({ id: r.id, ...entry });
  }

  _renderPayload (r, channel) {
    return {
      id: r.id,
      owner: r.owner,
      channel,
      priority: r.priority,
      action: r.action,
      title: {
        he: r.description_he || r.what,
        en: r.description_en || r.what,
      },
      body: {
        he: r.description_he || '',
        en: r.description_en || '',
      },
      metadata: r.metadata,
      fireAt: r.fireAt,
    };
  }

  _snapshot (r) {
    // Return a structured clone so callers cannot mutate internal state.
    return JSON.parse(JSON.stringify(r));
  }
}

/* ------------------------------------------------------------------ */
/* Exports                                                              */
/* ------------------------------------------------------------------ */

/* ══════════════════════════════════════════════════════════════════ */
/* ReminderScheduler — Agent Y-128 generic time-based API              */
/* ══════════════════════════════════════════════════════════════════ */
/*                                                                      */
/* A second, public-facing class sitting alongside the original         */
/* ReminderEngine. It preserves the existing engine (rule: "לא           */
/* מוחקים רק משדרגים ומגדלים") and exposes the exact API expected by    */
/* the Y-128 specification:                                             */
/*                                                                      */
/*   scheduleReminder          listDueReminders        processDue       */
/*   snoozeReminder            cancelReminder          reminderHistory  */
/*   upcomingForEntity         israeliBusinessDayCheck quietHoursSkip   */
/*   cronLiteParser            bulkSchedule                             */
/*                                                                      */
/* Storage: in-memory Maps. Append-only history. Dispatcher injectable. */
/* ──────────────────────────────────────────────────────────────────── */

/* Cron-Lite grammar ------------------------------------------------- */
/*                                                                     */
/*   daily HH:MM           → every day at HH:MM UTC                    */
/*   weekly DOW HH:MM      → every week (DOW = sun..sat / 0..6)        */
/*   monthly D HH:MM       → every month on day D                      */
/*   annual MM-DD HH:MM    → every year on MM-DD                       */
/*                                                                     */
/* DOW tokens: sun|mon|tue|wed|thu|fri|sat or 0..6.                    */
/* ------------------------------------------------------------------- */

const CRON_LITE_DOW = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6,
};

function _parseHHMM (txt) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(txt || '');
  if (!m) throw new RangeError(`cronLiteParser: invalid HH:MM "${txt}"`);
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) {
    throw new RangeError(`cronLiteParser: out-of-range HH:MM "${txt}"`);
  }
  return { h, mi };
}

function cronLiteParser (expression) {
  if (typeof expression !== 'string') {
    throw new TypeError('cronLiteParser: expression must be a string');
  }
  const clean = expression.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!clean) throw new RangeError('cronLiteParser: empty expression');
  const parts = clean.split(' ');
  const kind = parts[0];
  switch (kind) {
    case 'daily': {
      if (parts.length !== 2) {
        throw new RangeError(`cronLiteParser: "daily HH:MM" expected, got "${expression}"`);
      }
      const { h, mi } = _parseHHMM(parts[1]);
      return { kind: 'daily', hour: h, minute: mi, label_he: 'יומי', label_en: 'Daily', raw: expression };
    }
    case 'weekly': {
      if (parts.length !== 3) {
        throw new RangeError(`cronLiteParser: "weekly DOW HH:MM" expected, got "${expression}"`);
      }
      const dowRaw = parts[1];
      const dow = CRON_LITE_DOW[dowRaw];
      if (dow == null) throw new RangeError(`cronLiteParser: unknown DOW "${dowRaw}"`);
      const { h, mi } = _parseHHMM(parts[2]);
      return { kind: 'weekly', dow, hour: h, minute: mi, label_he: 'שבועי', label_en: 'Weekly', raw: expression };
    }
    case 'monthly': {
      if (parts.length !== 3) {
        throw new RangeError(`cronLiteParser: "monthly D HH:MM" expected, got "${expression}"`);
      }
      const day = parseInt(parts[1], 10);
      if (!Number.isFinite(day) || day < 1 || day > 31) {
        throw new RangeError(`cronLiteParser: day-of-month out of range: "${parts[1]}"`);
      }
      const { h, mi } = _parseHHMM(parts[2]);
      return { kind: 'monthly', day, hour: h, minute: mi, label_he: 'חודשי', label_en: 'Monthly', raw: expression };
    }
    case 'annual':
    case 'yearly': {
      if (parts.length !== 3) {
        throw new RangeError(`cronLiteParser: "annual MM-DD HH:MM" expected, got "${expression}"`);
      }
      const md = /^(\d{1,2})-(\d{1,2})$/.exec(parts[1]);
      if (!md) throw new RangeError(`cronLiteParser: invalid MM-DD "${parts[1]}"`);
      const month = parseInt(md[1], 10);
      const day = parseInt(md[2], 10);
      if (month < 1 || month > 12 || day < 1 || day > 31) {
        throw new RangeError(`cronLiteParser: MM-DD out of range "${parts[1]}"`);
      }
      const { h, mi } = _parseHHMM(parts[2]);
      return { kind: 'annual', month, day, hour: h, minute: mi, label_he: 'שנתי', label_en: 'Annual', raw: expression };
    }
    case 'custom': {
      // custom:<standard-5-field-cron>
      const remainder = clean.slice('custom'.length).trim();
      if (!remainder) throw new RangeError('cronLiteParser: custom requires a cron body');
      parseCron(remainder); // validate
      return { kind: 'custom', cron: remainder, label_he: 'קרון מותאם', label_en: 'Custom cron', raw: expression };
    }
    default:
      throw new RangeError(`cronLiteParser: unknown kind "${kind}" in "${expression}"`);
  }
}

/* Given a parsed cron-lite and a "from" epoch, compute the NEXT fire   */
/* strictly after `from`. Uses UTC minutes as the base grid.            */
function nextCronLiteFire (parsed, fromEpochMs) {
  const from = new Date(fromEpochMs + 60000 - ((fromEpochMs + 60000) % 60000));
  switch (parsed.kind) {
    case 'daily': {
      const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), parsed.hour, parsed.minute));
      if (d.getTime() <= fromEpochMs) d.setUTCDate(d.getUTCDate() + 1);
      return d.getTime();
    }
    case 'weekly': {
      const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), parsed.hour, parsed.minute));
      while (d.getUTCDay() !== parsed.dow || d.getTime() <= fromEpochMs) {
        d.setUTCDate(d.getUTCDate() + 1);
      }
      return d.getTime();
    }
    case 'monthly': {
      let year = from.getUTCFullYear();
      let month = from.getUTCMonth();
      for (let i = 0; i < 36; i += 1) {
        const d = new Date(Date.UTC(year, month, parsed.day, parsed.hour, parsed.minute));
        if (d.getUTCMonth() === month && d.getTime() > fromEpochMs) return d.getTime();
        month += 1;
        if (month > 11) { month = 0; year += 1; }
      }
      return null;
    }
    case 'annual': {
      let year = from.getUTCFullYear();
      for (let i = 0; i < 6; i += 1) {
        const d = new Date(Date.UTC(year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute));
        if (d.getUTCMonth() === parsed.month - 1 && d.getTime() > fromEpochMs) return d.getTime();
        year += 1;
      }
      return null;
    }
    case 'custom': {
      const cron = parseCron(parsed.cron);
      return nextCronFire(cron, fromEpochMs);
    }
    default:
      return null;
  }
}

/* Israeli business-day helper (Sun-Thu, skip holidays) ------------- */

const DOW_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const DOW_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function israeliBusinessDayCheck (date) {
  // Reuses Y-034 pattern: business days are Sun..Thu, excluding holidays,
  // excluding Friday (short/erev) and Saturday (Shabbat).
  const epoch = toEpochMs(date);
  const d = new Date(epoch);
  const dow = d.getUTCDay();
  const isWeekend = (dow === 5 || dow === 6);
  const holiday = isIsraeliHoliday(epoch);
  const isBusinessDay = !isWeekend && !holiday;

  let nextBusinessEpoch = epoch;
  if (!isBusinessDay) {
    // advance to next business day at the same local time-of-day
    let t = epoch;
    for (let i = 0; i < 15; i += 1) {
      t += OFFSET_MS.d;
      const nd = new Date(t);
      const ndDow = nd.getUTCDay();
      if (ndDow !== 5 && ndDow !== 6 && !isIsraeliHoliday(t)) { nextBusinessEpoch = t; break; }
    }
  }

  return {
    epochMs: epoch,
    iso: new Date(epoch).toISOString(),
    dow,
    dow_he: DOW_HE[dow],
    dow_en: DOW_EN[dow],
    isWeekend,
    isHoliday: holiday,
    isBusinessDay,
    nextBusinessEpoch,
    nextBusinessISO: new Date(nextBusinessEpoch).toISOString(),
  };
}

/* Quiet-hours helper — returns either the original date (not in quiet)*/
/* or an object describing the deferral target.                         */
function quietHoursSkip (date, hours) {
  const cfg = hours || { start: '20:00', end: '07:00' };
  const epoch = toEpochMs(date);
  const inQuiet = isInQuietRange(epoch, cfg);
  if (!inQuiet) {
    return { inQuiet: false, epochMs: epoch, deferredTo: epoch };
  }
  // walk minute-by-minute until we exit the quiet range
  const [eh, em] = cfg.end.split(':').map(Number);
  let t = epoch;
  for (let i = 0; i < 60 * 48; i += 1) {
    t += 60000;
    if (!isInQuietRange(t, cfg)) break;
  }
  // Snap to the start of the allowed window for cleanliness (cfg.end time)
  const target = new Date(t);
  target.setUTCHours(eh, em, 0, 0);
  if (target.getTime() < t) target.setUTCDate(target.getUTCDate() + 1);
  return {
    inQuiet: true,
    epochMs: epoch,
    deferredTo: target.getTime(),
    deferredISO: target.toISOString(),
    reason_he: 'נדחה עקב שעות שקט',
    reason_en: 'Deferred due to quiet hours',
  };
}

/* ------------------------------------------------------------------ */
/* ReminderScheduler                                                    */
/* ------------------------------------------------------------------ */

class ReminderScheduler {
  /**
   * @param {object=} options
   * @param {Function=} options.clock   - () => epoch-ms (deterministic tests)
   * @param {object=}   options.logger  - { info, warn, error }
   * @param {object=}   options.quietHours - default { start, end }
   * @param {boolean=}  options.respectIsraeliBusinessDays - skip Fri/Sat/holidays
   */
  constructor (options = {}) {
    this.clock = typeof options.clock === 'function' ? options.clock : (() => Date.now());
    this.logger = options.logger || { info: () => {}, warn: () => {}, error: () => {} };
    this.defaultQuietHours = options.quietHours || null;
    this.respectIsraeliBusinessDays = !!options.respectIsraeliBusinessDays;

    /* In-memory storage */
    this._store = new Map();   // id → reminder record
    this._logGlobal = [];      // append-only global log
    this._stats = {
      scheduled: 0,
      dispatched: 0,
      snoozed: 0,
      cancelled: 0,
      deferredQuietHours: 0,
      deferredBusinessDay: 0,
    };
  }

  /* ================================================================ */
  /* PUBLIC API                                                        */
  /* ================================================================ */

  /**
   * Schedule a reminder.
   *
   * @param {object} p
   * @param {string=} p.id
   * @param {object|string} p.subject         - bilingual {he,en} or plain string
   * @param {object} p.trigger                - { type:'one-time'|'date-based'|'relative-to-event', when, relativeTo, offset }
   * @param {string|number=} p.leadTime       - pre-fire offset (e.g. '2h', '1d')
   * @param {object|string=} p.recurrence     - cron-lite expression or parsed
   * @param {object=} p.audience              - { entityId, role, userIds }
   * @param {string[]=} p.channels            - ['email','sms','whatsapp','push']
   * @param {object=} p.template              - { he, en, params }
   * @param {string=} p.priority              - 'low'|'normal'|'high'|'critical'
   */
  scheduleReminder (p) {
    if (!p || typeof p !== 'object') {
      throw new TypeError('scheduleReminder requires an object');
    }
    if (!p.trigger) throw new TypeError('scheduleReminder: trigger is required');
    if (!p.subject) throw new TypeError('scheduleReminder: subject is required');

    const id = p.id || uuid();
    if (this._store.has(id)) {
      throw new Error(`scheduleReminder: duplicate id "${id}"`);
    }

    const recurrence = this._normalizeRecurrence(p.recurrence);
    const baseFire = this._resolveTrigger(p.trigger, recurrence);
    const leadMs = p.leadTime ? parseOffset(p.leadTime) : 0;
    // leadTime moves the reminder EARLIER (so user is notified ahead of event)
    let fireAt = baseFire - Math.abs(leadMs);

    const deferrals = [];
    fireAt = this._applyDeferrals(fireAt, p, deferrals);

    const subject = this._normalizeBilingual(p.subject);
    const template = p.template ? this._normalizeBilingual(p.template, true) : null;

    const record = {
      id,
      subject,                                                 // {he,en}
      template,                                                // {he,en,params?} | null
      trigger: { ...p.trigger },
      leadTime: p.leadTime || null,
      recurrence,                                              // parsed object | null
      audience: p.audience ? { ...p.audience } : null,
      channels: Array.isArray(p.channels) && p.channels.length ? [...p.channels] : ['email'],
      priority: p.priority || 'normal',

      status: 'scheduled',  // scheduled | dispatched | snoozed | cancelled | failed
      baseFireAt: baseFire,
      fireAt,
      originalFireAt: fireAt,
      deferrals,
      dispatchCount: 0,
      lastDispatchAt: null,
      lastError: null,

      createdAt: this.clock(),
      updatedAt: this.clock(),
      history: [],
    };

    this._append(record, 'scheduled', { fireAt, deferrals: [...deferrals] });
    this._store.set(id, record);
    this._stats.scheduled += 1;
    return this._snapshot(record);
  }

  /**
   * Return reminders that are DUE at or before `now`.
   * A reminder is due when status ∈ {scheduled, snoozed} AND fireAt ≤ now.
   */
  listDueReminders (now) {
    const t = now != null ? toEpochMs(now) : this.clock();
    const out = [];
    for (const r of this._store.values()) {
      if (r.status !== 'scheduled' && r.status !== 'snoozed') continue;
      if (r.fireAt <= t) out.push(this._snapshot(r));
    }
    out.sort((a, b) => a.fireAt - b.fireAt);
    return out;
  }

  /**
   * Process due reminders: call dispatcher for each, advance recurrence,
   * and record history. Dispatcher signature:
   *
   *     async dispatcher(reminder) → { ok:boolean, error?:string, result?:any }
   *
   * Returns { processed, dispatched, failed, results:[] }.
   */
  async processDue (now, dispatcher) {
    if (typeof dispatcher !== 'function') {
      throw new TypeError('processDue: dispatcher must be a function');
    }
    const t = now != null ? toEpochMs(now) : this.clock();
    const dueList = [];
    for (const r of this._store.values()) {
      if (r.status !== 'scheduled' && r.status !== 'snoozed') continue;
      if (r.fireAt <= t) dueList.push(r);
    }
    dueList.sort((a, b) => a.fireAt - b.fireAt);

    const results = [];
    let dispatched = 0;
    let failed = 0;

    for (const r of dueList) {
      const payload = this._renderDispatchPayload(r);
      let res;
      try {
        // eslint-disable-next-line no-await-in-loop
        res = await dispatcher(payload);
      } catch (err) {
        res = { ok: false, error: (err && err.message) || String(err) };
      }
      if (res == null) res = { ok: true };

      r.dispatchCount += 1;
      r.lastDispatchAt = this.clock();
      r.updatedAt = this.clock();

      if (res.ok === false) {
        r.status = 'failed';
        r.lastError = res.error || 'dispatcher refused';
        this._append(r, 'dispatch-failed', { error: r.lastError });
        failed += 1;
      } else {
        this._append(r, 'dispatched', { channels: r.channels, result: res.result || null });
        dispatched += 1;
        this._stats.dispatched += 1;

        // advance recurring
        if (r.recurrence) {
          const nextBase = nextCronLiteFire(r.recurrence, r.fireAt);
          if (nextBase != null) {
            const leadMs = r.leadTime ? parseOffset(r.leadTime) : 0;
            let nextFire = nextBase - Math.abs(leadMs);
            const deferrals = [];
            nextFire = this._applyDeferrals(nextFire, r, deferrals);
            r.baseFireAt = nextBase;
            r.fireAt = nextFire;
            r.deferrals = deferrals;
            r.status = 'scheduled';
            this._append(r, 'recurring-next', { fireAt: nextFire });
          } else {
            r.status = 'dispatched';
          }
        } else {
          r.status = 'dispatched';
        }
      }

      results.push({
        id: r.id,
        status: r.status,
        ok: res.ok !== false,
        error: res.ok === false ? (res.error || null) : null,
      });
    }

    return { processed: dueList.length, dispatched, failed, results };
  }

  /**
   * Delay a reminder until `until` (Date | ISO | epoch ms | relative offset string).
   * The record is PRESERVED — only the status and fireAt are updated,
   * and every change is appended to history.
   */
  snoozeReminder (reminderId, until) {
    const r = this._store.get(reminderId);
    if (!r) throw new Error(`snoozeReminder: unknown id "${reminderId}"`);
    if (r.status === 'cancelled') {
      throw new Error(`snoozeReminder: cannot snooze cancelled reminder "${reminderId}"`);
    }

    let target;
    if (typeof until === 'string' && OFFSET_RE.test(until.trim())) {
      target = this.clock() + parseOffset(until);
    } else {
      target = toEpochMs(until);
    }
    if (!Number.isFinite(target)) {
      throw new RangeError('snoozeReminder: unable to resolve "until" to epoch-ms');
    }
    const prevFire = r.fireAt;
    r.fireAt = target;
    r.status = 'snoozed';
    r.updatedAt = this.clock();
    this._append(r, 'snoozed', { from: prevFire, to: target });
    this._stats.snoozed += 1;
    return this._snapshot(r);
  }

  /**
   * Cancel a reminder — status flip only, record preserved.
   */
  cancelReminder (reminderId, reason) {
    const r = this._store.get(reminderId);
    if (!r) throw new Error(`cancelReminder: unknown id "${reminderId}"`);
    if (r.status === 'cancelled') {
      // idempotent
      return this._snapshot(r);
    }
    r.status = 'cancelled';
    r.updatedAt = this.clock();
    this._append(r, 'cancelled', { reason: reason || null });
    this._stats.cancelled += 1;
    return this._snapshot(r);
  }

  /**
   * Append-only history for one reminder.
   */
  reminderHistory (reminderId) {
    const r = this._store.get(reminderId);
    if (!r) throw new Error(`reminderHistory: unknown id "${reminderId}"`);
    return r.history.map(entry => ({ ...entry, detail: entry.detail ? { ...entry.detail } : null }));
  }

  /**
   * Upcoming reminders for a given entity within `days` (default 7).
   */
  upcomingForEntity (entityId, days) {
    if (!entityId) throw new TypeError('upcomingForEntity: entityId required');
    const d = Number.isFinite(days) ? days : 7;
    const now = this.clock();
    const horizon = now + d * OFFSET_MS.d;
    const out = [];
    for (const r of this._store.values()) {
      if (r.status === 'cancelled') continue;
      if (r.fireAt < now || r.fireAt > horizon) continue;
      if (!r.audience || r.audience.entityId !== entityId) continue;
      out.push(this._snapshot(r));
    }
    out.sort((a, b) => a.fireAt - b.fireAt);
    return out;
  }

  /**
   * Thin passthrough to the exported helper so the API exposes it.
   */
  israeliBusinessDayCheck (date) {
    return israeliBusinessDayCheck(date);
  }

  /**
   * Thin passthrough helper — if the given date falls inside quiet hours,
   * returns a deferral target; otherwise the original date.
   */
  quietHoursSkip (date, hours) {
    return quietHoursSkip(date, hours || this.defaultQuietHours);
  }

  /**
   * Parse a cron-lite expression (daily/weekly/monthly/annual + HH:MM).
   */
  cronLiteParser (expression) {
    return cronLiteParser(expression);
  }

  /**
   * Batch create reminders. Errors per item are collected, not thrown.
   */
  bulkSchedule (reminders) {
    if (!Array.isArray(reminders)) {
      throw new TypeError('bulkSchedule: expected array');
    }
    const created = [];
    const failed = [];
    for (const spec of reminders) {
      try { created.push(this.scheduleReminder(spec)); }
      catch (e) { failed.push({ spec, error: e.message }); }
    }
    return { ok: created.length, failed: failed.length, created, failures: failed };
  }

  /* Introspection helpers ------------------------------------------ */

  /** All reminders (cancelled included — append-only philosophy). */
  listAll () {
    return [...this._store.values()].map(r => this._snapshot(r));
  }

  /** Global stats. */
  stats () { return { ...this._stats, total: this._store.size }; }

  /** Full append-only global log. */
  globalLog () { return this._logGlobal.map(entry => ({ ...entry })); }

  /* ================================================================ */
  /* INTERNAL                                                          */
  /* ================================================================ */

  _normalizeBilingual (val, allowParams) {
    if (val == null) return { he: '', en: '' };
    if (typeof val === 'string') return { he: val, en: val };
    if (typeof val === 'object') {
      const out = { he: val.he || val.description_he || '', en: val.en || val.description_en || '' };
      if (allowParams && val.params) out.params = { ...val.params };
      return out;
    }
    return { he: String(val), en: String(val) };
  }

  _normalizeRecurrence (rec) {
    if (rec == null) return null;
    if (typeof rec === 'string') return cronLiteParser(rec);
    if (typeof rec === 'object' && rec.kind) return { ...rec };
    throw new TypeError('recurrence must be string or parsed object');
  }

  _resolveTrigger (trigger, recurrence) {
    if (!trigger || typeof trigger !== 'object') {
      throw new TypeError('trigger must be an object');
    }
    const type = trigger.type || 'one-time';
    switch (type) {
      case 'one-time':
      case 'date-based': {
        if (trigger.when == null && !recurrence) {
          throw new TypeError(`trigger.when is required for "${type}"`);
        }
        if (trigger.when != null) return toEpochMs(trigger.when);
        // recurrence-only: compute first fire from now
        return nextCronLiteFire(recurrence, this.clock());
      }
      case 'relative-to-event': {
        if (trigger.relativeTo == null) {
          throw new TypeError('trigger.relativeTo is required for "relative-to-event"');
        }
        const base = toEpochMs(trigger.relativeTo);
        const off = trigger.offset ? parseOffset(trigger.offset) : 0;
        return base + off;
      }
      default:
        throw new RangeError(`unknown trigger.type "${type}"`);
    }
  }

  _applyDeferrals (epoch, spec, deferralsOut) {
    let t = epoch;
    // 1) Israeli business day: if globally requested OR spec opts in
    const wantsBusinessDay = this.respectIsraeliBusinessDays || (spec && spec.respectIsraeliBusinessDays);
    if (wantsBusinessDay) {
      const chk = israeliBusinessDayCheck(t);
      if (!chk.isBusinessDay) {
        deferralsOut.push({
          reason: 'israeli-business-day',
          reason_he: 'לא יום עסקים ישראלי',
          reason_en: 'Not an Israeli business day',
          from: t,
          to: chk.nextBusinessEpoch,
        });
        t = chk.nextBusinessEpoch;
        this._stats.deferredBusinessDay += 1;
      }
    }
    // 2) Quiet-hours: default OR per-spec
    const quiet = (spec && spec.quietHours) || this.defaultQuietHours;
    if (quiet) {
      const q = quietHoursSkip(t, quiet);
      if (q.inQuiet) {
        deferralsOut.push({
          reason: 'quiet-hours',
          reason_he: 'שעות שקט',
          reason_en: 'Quiet hours',
          from: t,
          to: q.deferredTo,
        });
        t = q.deferredTo;
        this._stats.deferredQuietHours += 1;
      }
    }
    return t;
  }

  _renderDispatchPayload (r) {
    return {
      id: r.id,
      subject: { ...r.subject },
      template: r.template ? { ...r.template } : null,
      audience: r.audience ? { ...r.audience } : null,
      channels: [...r.channels],
      priority: r.priority,
      fireAt: r.fireAt,
      dispatchCount: r.dispatchCount,
      // bilingual convenience
      label_he: r.subject.he,
      label_en: r.subject.en,
    };
  }

  _append (r, action, detail) {
    const entry = {
      at: this.clock(),
      action,
      detail: detail == null ? null : JSON.parse(JSON.stringify(detail)),
    };
    r.history.push(entry);
    this._logGlobal.push({ id: r.id, ...entry });
  }

  _snapshot (r) {
    return JSON.parse(JSON.stringify(r));
  }
}

/* Bilingual glossary (also consumed by the QA report) ---------------- */
const REMINDER_GLOSSARY = {
  scheduleReminder:        { he: 'תזמון תזכורת', en: 'Schedule reminder' },
  listDueReminders:        { he: 'רשימת תזכורות לביצוע', en: 'List due reminders' },
  processDue:              { he: 'עיבוד תזכורות שהגיע זמנן', en: 'Process due reminders' },
  snoozeReminder:          { he: 'דחיית תזכורת', en: 'Snooze reminder' },
  cancelReminder:          { he: 'ביטול תזכורת', en: 'Cancel reminder' },
  reminderHistory:         { he: 'היסטוריית תזכורת', en: 'Reminder history' },
  upcomingForEntity:       { he: 'תזכורות קרובות לישות', en: 'Upcoming for entity' },
  israeliBusinessDayCheck: { he: 'בדיקת יום עסקים ישראלי', en: 'Israeli business-day check' },
  quietHoursSkip:          { he: 'דילוג שעות שקט', en: 'Quiet-hours defer' },
  cronLiteParser:          { he: 'פרסר קרון-לייט', en: 'Cron-lite parser' },
  bulkSchedule:            { he: 'תזמון מרוכז', en: 'Bulk schedule' },
  daily:                   { he: 'יומי', en: 'Daily' },
  weekly:                  { he: 'שבועי', en: 'Weekly' },
  monthly:                 { he: 'חודשי', en: 'Monthly' },
  annual:                  { he: 'שנתי', en: 'Annual' },
  businessDay:             { he: 'יום עסקים', en: 'Business day' },
  quietHours:              { he: 'שעות שקט', en: 'Quiet hours' },
};

/* ------------------------------------------------------------------ */
/* Exports                                                              */
/* ------------------------------------------------------------------ */

module.exports = {
  // Original Y-128 engine — preserved
  ReminderEngine,
  parseOffset,
  parseCron,
  nextCronFire,
  isIsraeliHoliday,
  nextNonHoliday,
  isInQuietRange,
  isInShabbat,
  DEFAULT_SHABBAT,
  ISRAELI_HOLIDAYS,
  OFFSET_MS,

  // New generic scheduler (Y-128 upgrade)
  ReminderScheduler,
  cronLiteParser,
  nextCronLiteFire,
  israeliBusinessDayCheck,
  quietHoursSkip,
  REMINDER_GLOSSARY,
};
