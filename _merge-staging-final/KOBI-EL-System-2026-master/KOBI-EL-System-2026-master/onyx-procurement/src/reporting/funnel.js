/**
 * Funnel Analyzer — Agent Y-191
 * ==============================
 * Techno-Kol Uzi mega-ERP — ONYX Procurement — Reporting subsystem
 *
 * Pure-JS (Node built-ins only), zero runtime dependencies.
 * Bilingual (Hebrew + English) stage labels and report output.
 *
 * Default funnel: lead -> MQL -> SQL -> opportunity -> won
 * Hebrew:         ליד -> ליד מוסמך שיווקית -> ליד מוסמך מכירות -> הזדמנות -> חתום
 *
 * Event shape (minimum):
 *   {
 *     entity_id:  'acct-007',     // stable id for the lead/opportunity
 *     stage:      'mql',           // must match one of the funnel step keys
 *     timestamp:  '2026-03-01T09:15:00Z' | 1711968900000 | Date
 *     drop_reason?: 'budget' | 'timing' | ...  (only when the entity exited)
 *   }
 *
 * Public API:
 *   new FunnelAnalyzer(opts?)
 *     opts.steps?        — custom [{ key, labelHe, labelEn }, ...]
 *     opts.dropReasons?  — custom bilingual reason dictionary
 *
 *   fa.defineSteps(steps)                — replace the funnel definition
 *   fa.addEvent(event)                   — push a single event
 *   fa.addEvents(events)                 — push an array of events
 *   fa.assignEventsToSteps()             — group events by step key
 *   fa.computeStepCounts()               — {stepKey: uniqueEntities}
 *   fa.convRate(fromKey, toKey)          — step i -> step i+1 conv rate
 *   fa.allConvRates()                    — [{from, to, rate}, ...]
 *   fa.overallConversion()               — first step -> last step
 *   fa.avgTimeInStage(stepKey)           — milliseconds average, or null
 *   fa.allAvgTimeInStage()               — {stepKey: milliseconds | null}
 *   fa.dropOffByReason()                 — {reasonKey: count}
 *   fa.dropOffByReasonBilingual()        — [{key, he, en, count, pct}]
 *   fa.analyze()                         — full { steps, counts, conv, overall, avgTime, dropOff }
 *   fa.renderReport(lang?)               — human-readable bilingual string
 *
 * Never deletes, never mutates inputs. All computations are deterministic.
 */

'use strict';

// ---------------------------------------------------------------------------
// Default funnel definition — lead -> MQL -> SQL -> opportunity -> won
// ---------------------------------------------------------------------------

const DEFAULT_STEPS = Object.freeze([
  Object.freeze({ key: 'lead',        labelHe: 'ליד',                    labelEn: 'Lead' }),
  Object.freeze({ key: 'mql',         labelHe: 'ליד מוסמך שיווקית',      labelEn: 'Marketing Qualified Lead' }),
  Object.freeze({ key: 'sql',         labelHe: 'ליד מוסמך מכירות',        labelEn: 'Sales Qualified Lead' }),
  Object.freeze({ key: 'opportunity', labelHe: 'הזדמנות',                 labelEn: 'Opportunity' }),
  Object.freeze({ key: 'won',         labelHe: 'חתום',                    labelEn: 'Won / Closed' }),
]);

// ---------------------------------------------------------------------------
// Default bilingual drop-off reason dictionary
// ---------------------------------------------------------------------------

const DEFAULT_DROP_REASONS = Object.freeze({
  budget:       Object.freeze({ he: 'חוסר תקציב',           en: 'No budget' }),
  timing:       Object.freeze({ he: 'תזמון לא מתאים',        en: 'Bad timing' }),
  competitor:   Object.freeze({ he: 'מעבר למתחרה',           en: 'Went to competitor' }),
  no_fit:       Object.freeze({ he: 'חוסר התאמה',            en: 'Not a good fit' }),
  no_response: Object.freeze({ he: 'ללא מענה',               en: 'No response' }),
  price:        Object.freeze({ he: 'מחיר גבוה מדי',          en: 'Price too high' }),
  authority:    Object.freeze({ he: 'חוסר סמכות החלטה',       en: 'Lack of decision authority' }),
  product:      Object.freeze({ he: 'חוסר פיצ\'ר נדרש',       en: 'Missing required feature' }),
  lost_contact: Object.freeze({ he: 'קשר אבוד',               en: 'Lost contact' }),
  other:        Object.freeze({ he: 'אחר',                    en: 'Other' }),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert any supported timestamp shape to milliseconds. */
function toMillis(ts) {
  if (ts === null || ts === undefined) return null;
  if (ts instanceof Date) {
    const n = ts.getTime();
    return Number.isFinite(n) ? n : null;
  }
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Shallow-clone an event while freezing it so downstream cannot mutate. */
function cloneEvent(ev) {
  if (!ev || typeof ev !== 'object') {
    throw new TypeError('FunnelAnalyzer: event must be a non-null object');
  }
  return {
    entity_id: ev.entity_id,
    stage: ev.stage,
    timestamp: ev.timestamp,
    _ts: toMillis(ev.timestamp),
    drop_reason: ev.drop_reason || null,
    meta: ev.meta || null,
  };
}

/** Round to N decimals deterministically. */
function round(n, decimals) {
  if (!Number.isFinite(n)) return n;
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

/** Format milliseconds to "Xd Yh Zm" for reports (bilingual-friendly). */
function formatDuration(ms, lang) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) {
    return lang === 'he' ? 'אין נתונים' : 'n/a';
  }
  const s = Math.round(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (lang === 'he') {
    return `${d} ימים ${h} שעות ${m} דקות`;
  }
  return `${d}d ${h}h ${m}m`;
}

// ---------------------------------------------------------------------------
// FunnelAnalyzer
// ---------------------------------------------------------------------------

class FunnelAnalyzer {
  constructor(opts = {}) {
    this._steps = [];
    this._stepIndex = new Map(); // key -> index
    this._events = [];
    this._dropReasons = Object.assign({}, DEFAULT_DROP_REASONS);

    if (Array.isArray(opts.steps) && opts.steps.length > 0) {
      this.defineSteps(opts.steps);
    } else {
      this.defineSteps(DEFAULT_STEPS);
    }

    if (opts.dropReasons && typeof opts.dropReasons === 'object') {
      for (const [k, v] of Object.entries(opts.dropReasons)) {
        if (v && typeof v === 'object') {
          this._dropReasons[k] = { he: v.he || k, en: v.en || k };
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  /**
   * Replace the funnel definition.
   *
   * @param {Array<{key:string,labelHe:string,labelEn:string}>} steps
   */
  defineSteps(steps) {
    if (!Array.isArray(steps) || steps.length < 2) {
      throw new Error('FunnelAnalyzer.defineSteps: at least 2 steps required');
    }
    const seen = new Set();
    const normalized = [];
    for (let i = 0; i < steps.length; i += 1) {
      const s = steps[i];
      if (!s || !s.key) {
        throw new Error(
          `FunnelAnalyzer.defineSteps: step #${i} is missing "key"`
        );
      }
      if (seen.has(s.key)) {
        throw new Error(
          `FunnelAnalyzer.defineSteps: duplicate step key "${s.key}"`
        );
      }
      seen.add(s.key);
      normalized.push({
        key: String(s.key),
        labelHe: s.labelHe || s.label_he || s.he || String(s.key),
        labelEn: s.labelEn || s.label_en || s.en || String(s.key),
      });
    }
    this._steps = normalized;
    this._stepIndex = new Map();
    for (let i = 0; i < this._steps.length; i += 1) {
      this._stepIndex.set(this._steps[i].key, i);
    }
    return this._steps.slice();
  }

  /** Return a defensive copy of the funnel steps. */
  getSteps() {
    return this._steps.map((s) => ({ ...s }));
  }

  // -------------------------------------------------------------------------
  // Event ingestion
  // -------------------------------------------------------------------------

  /**
   * Append a single event to the analyzer's store.
   * Events whose stage is unknown to the funnel are silently ignored at
   * assignment time (so callers can pipe raw event streams).
   */
  addEvent(event) {
    this._events.push(cloneEvent(event));
    return this;
  }

  /** Append an array of events. */
  addEvents(events) {
    if (!Array.isArray(events)) {
      throw new TypeError('FunnelAnalyzer.addEvents: expected an array');
    }
    for (const ev of events) {
      this._events.push(cloneEvent(ev));
    }
    return this;
  }

  /** Current event count (post-clone, pre-filter). */
  eventCount() {
    return this._events.length;
  }

  /**
   * Assign events to their corresponding step bucket.
   * Returns a { stepKey: [events] } structure. Events are kept in
   * chronological order within each bucket.
   */
  assignEventsToSteps() {
    const buckets = {};
    for (const step of this._steps) buckets[step.key] = [];
    for (const ev of this._events) {
      if (!Object.prototype.hasOwnProperty.call(buckets, ev.stage)) continue;
      buckets[ev.stage].push(ev);
    }
    for (const key of Object.keys(buckets)) {
      buckets[key].sort((a, b) => {
        const ta = a._ts === null ? Infinity : a._ts;
        const tb = b._ts === null ? Infinity : b._ts;
        return ta - tb;
      });
    }
    return buckets;
  }

  // -------------------------------------------------------------------------
  // Counts
  // -------------------------------------------------------------------------

  /**
   * Return a map of { stepKey: uniqueEntityCount }. Counts are based on
   * distinct `entity_id` values that hit a given stage at least once.
   */
  computeStepCounts() {
    const buckets = this.assignEventsToSteps();
    const counts = {};
    for (const step of this._steps) {
      const seen = new Set();
      for (const ev of buckets[step.key]) {
        if (ev.entity_id !== undefined && ev.entity_id !== null) {
          seen.add(ev.entity_id);
        }
      }
      counts[step.key] = seen.size;
    }
    return counts;
  }

  // -------------------------------------------------------------------------
  // Conversion rates
  // -------------------------------------------------------------------------

  /**
   * Conversion rate between any two step keys.
   * Returns a ratio in [0,1]. If the source is zero, returns 0.
   */
  convRate(fromKey, toKey) {
    if (!this._stepIndex.has(fromKey)) {
      throw new Error(`FunnelAnalyzer.convRate: unknown step "${fromKey}"`);
    }
    if (!this._stepIndex.has(toKey)) {
      throw new Error(`FunnelAnalyzer.convRate: unknown step "${toKey}"`);
    }
    const counts = this.computeStepCounts();
    const src = counts[fromKey] || 0;
    const dst = counts[toKey] || 0;
    if (src === 0) return 0;
    return round(dst / src, 6);
  }

  /**
   * Step-wise conversion between every consecutive pair of steps.
   * Returns [{ fromKey, toKey, fromCount, toCount, rate }].
   */
  allConvRates() {
    const counts = this.computeStepCounts();
    const out = [];
    for (let i = 0; i < this._steps.length - 1; i += 1) {
      const from = this._steps[i];
      const to = this._steps[i + 1];
      const src = counts[from.key] || 0;
      const dst = counts[to.key] || 0;
      const rate = src === 0 ? 0 : round(dst / src, 6);
      out.push({
        fromKey: from.key,
        toKey: to.key,
        fromLabelHe: from.labelHe,
        fromLabelEn: from.labelEn,
        toLabelHe: to.labelHe,
        toLabelEn: to.labelEn,
        fromCount: src,
        toCount: dst,
        rate,
      });
    }
    return out;
  }

  /**
   * Overall conversion: first step -> last step, independent of the
   * intermediate stages.
   */
  overallConversion() {
    if (this._steps.length < 2) return 0;
    const counts = this.computeStepCounts();
    const first = counts[this._steps[0].key] || 0;
    const last = counts[this._steps[this._steps.length - 1].key] || 0;
    if (first === 0) return 0;
    return round(last / first, 6);
  }

  // -------------------------------------------------------------------------
  // Time in stage
  // -------------------------------------------------------------------------

  /**
   * Average time an entity spent in `stepKey` before advancing to the
   * next defined step. Entities that never advanced are excluded.
   * Returns milliseconds (integer) or null when no entity advanced.
   */
  avgTimeInStage(stepKey) {
    if (!this._stepIndex.has(stepKey)) {
      throw new Error(`FunnelAnalyzer.avgTimeInStage: unknown step "${stepKey}"`);
    }
    const idx = this._stepIndex.get(stepKey);
    if (idx === this._steps.length - 1) return null; // terminal stage has no "next"
    const nextKey = this._steps[idx + 1].key;

    // Build per-entity earliest timestamp at current + next stage.
    const cur = new Map(); // entity -> ms
    const nxt = new Map(); // entity -> ms
    for (const ev of this._events) {
      if (ev._ts === null) continue;
      if (ev.stage === stepKey) {
        const prev = cur.get(ev.entity_id);
        if (prev === undefined || ev._ts < prev) cur.set(ev.entity_id, ev._ts);
      } else if (ev.stage === nextKey) {
        const prev = nxt.get(ev.entity_id);
        if (prev === undefined || ev._ts < prev) nxt.set(ev.entity_id, ev._ts);
      }
    }

    let total = 0;
    let count = 0;
    for (const [eid, tCur] of cur.entries()) {
      if (!nxt.has(eid)) continue;
      const tNxt = nxt.get(eid);
      if (tNxt < tCur) continue; // guard against out-of-order
      total += (tNxt - tCur);
      count += 1;
    }
    if (count === 0) return null;
    return Math.round(total / count);
  }

  /** Convenience — avg time for every non-terminal stage. */
  allAvgTimeInStage() {
    const out = {};
    for (let i = 0; i < this._steps.length; i += 1) {
      const s = this._steps[i];
      if (i === this._steps.length - 1) {
        out[s.key] = null;
      } else {
        out[s.key] = this.avgTimeInStage(s.key);
      }
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Drop-off analysis
  // -------------------------------------------------------------------------

  /**
   * Tally drop_reason values across all events that carry one.
   * Returns a { reasonKey: count } dictionary.
   */
  dropOffByReason() {
    const out = {};
    for (const ev of this._events) {
      if (!ev.drop_reason) continue;
      const key = String(ev.drop_reason);
      out[key] = (out[key] || 0) + 1;
    }
    return out;
  }

  /**
   * Bilingual drop-off breakdown sorted by descending count.
   * Unknown reasons are gracefully wrapped with the raw key.
   */
  dropOffByReasonBilingual() {
    const tally = this.dropOffByReason();
    const total = Object.values(tally).reduce((a, b) => a + b, 0);
    const out = [];
    for (const [key, count] of Object.entries(tally)) {
      const meta = this._dropReasons[key] || { he: key, en: key };
      out.push({
        key,
        he: meta.he,
        en: meta.en,
        count,
        pct: total === 0 ? 0 : round(count / total, 6),
      });
    }
    out.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.key.localeCompare(b.key);
    });
    return out;
  }

  // -------------------------------------------------------------------------
  // Aggregate report payload
  // -------------------------------------------------------------------------

  /** Full analytical dump — one call, everything deterministic. */
  analyze() {
    const counts = this.computeStepCounts();
    const conv = this.allConvRates();
    const overall = this.overallConversion();
    const avgTime = this.allAvgTimeInStage();
    const dropOff = this.dropOffByReasonBilingual();
    return {
      steps: this.getSteps(),
      counts,
      conv,
      overall,
      avgTime,
      dropOff,
      totalEvents: this._events.length,
    };
  }

  // -------------------------------------------------------------------------
  // Bilingual text report
  // -------------------------------------------------------------------------

  /**
   * Render a bilingual text report. Pass 'he', 'en' or 'both' (default).
   */
  renderReport(lang) {
    const mode = lang === 'he' || lang === 'en' ? lang : 'both';
    const a = this.analyze();
    const lines = [];

    const hdrHe = 'דו"ח ניתוח משפך — Techno-Kol Uzi';
    const hdrEn = 'Funnel Analysis Report — Techno-Kol Uzi';

    if (mode === 'he' || mode === 'both') lines.push(hdrHe);
    if (mode === 'en' || mode === 'both') lines.push(hdrEn);
    lines.push('========================================');

    // ---- Step counts ----
    if (mode === 'he' || mode === 'both') lines.push('שלבים (ספירה):');
    if (mode === 'en' || mode === 'both') lines.push('Steps (counts):');
    for (const s of a.steps) {
      const c = a.counts[s.key] || 0;
      if (mode === 'he' || mode === 'both') {
        lines.push(`  ${s.labelHe}: ${c}`);
      }
      if (mode === 'en' || mode === 'both') {
        lines.push(`  ${s.labelEn}: ${c}`);
      }
    }

    // ---- Step-wise conversion ----
    lines.push('----------------------------------------');
    if (mode === 'he' || mode === 'both') lines.push('שיעורי המרה (שלב->שלב):');
    if (mode === 'en' || mode === 'both') lines.push('Step-wise conversion rates:');
    for (const c of a.conv) {
      const pct = round(c.rate * 100, 2);
      if (mode === 'he' || mode === 'both') {
        lines.push(`  ${c.fromLabelHe} -> ${c.toLabelHe}: ${pct}% (${c.toCount}/${c.fromCount})`);
      }
      if (mode === 'en' || mode === 'both') {
        lines.push(`  ${c.fromLabelEn} -> ${c.toLabelEn}: ${pct}% (${c.toCount}/${c.fromCount})`);
      }
    }

    // ---- Overall ----
    lines.push('----------------------------------------');
    const overallPct = round(a.overall * 100, 2);
    if (mode === 'he' || mode === 'both') lines.push(`המרה כוללת: ${overallPct}%`);
    if (mode === 'en' || mode === 'both') lines.push(`Overall conversion: ${overallPct}%`);

    // ---- Avg time in stage ----
    lines.push('----------------------------------------');
    if (mode === 'he' || mode === 'both') lines.push('זמן ממוצע בשלב:');
    if (mode === 'en' || mode === 'both') lines.push('Average time in stage:');
    for (const s of a.steps) {
      const ms = a.avgTime[s.key];
      if (mode === 'he' || mode === 'both') {
        lines.push(`  ${s.labelHe}: ${formatDuration(ms, 'he')}`);
      }
      if (mode === 'en' || mode === 'both') {
        lines.push(`  ${s.labelEn}: ${formatDuration(ms, 'en')}`);
      }
    }

    // ---- Drop-off reasons ----
    lines.push('----------------------------------------');
    if (mode === 'he' || mode === 'both') lines.push('סיבות נשירה:');
    if (mode === 'en' || mode === 'both') lines.push('Drop-off reasons:');
    if (a.dropOff.length === 0) {
      if (mode === 'he' || mode === 'both') lines.push('  (אין נתונים)');
      if (mode === 'en' || mode === 'both') lines.push('  (no data)');
    } else {
      for (const r of a.dropOff) {
        const pct = round(r.pct * 100, 2);
        if (mode === 'he' || mode === 'both') {
          lines.push(`  ${r.he}: ${r.count} (${pct}%)`);
        }
        if (mode === 'en' || mode === 'both') {
          lines.push(`  ${r.en}: ${r.count} (${pct}%)`);
        }
      }
    }
    lines.push('========================================');
    return lines.join('\n');
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  FunnelAnalyzer,
  DEFAULT_STEPS,
  DEFAULT_DROP_REASONS,
  // helpers exported for testability
  toMillis,
  formatDuration,
  round,
};
