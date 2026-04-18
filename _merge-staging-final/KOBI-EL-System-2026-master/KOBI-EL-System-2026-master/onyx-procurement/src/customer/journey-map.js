/**
 * Customer Journey Map — מנוע מיפוי מסע לקוח
 * Agent Y-102 — Swarm Customer — Techno-Kol Uzi Mega-ERP 2026
 * Date: 2026-04-11
 *
 * Zero-dependency pure Node.js module that maps customer touchpoints across
 * the nine standard lifecycle stages and computes friction/delight scores,
 * stage conversion, dwell time, moments of truth, persona patterns, and
 * drop-off analysis — all in bilingual Hebrew (RTL) + English.
 *
 * ─── Rule upheld: "לא מוחקים רק משדרגים ומגדלים" ─────────────────────────
 *
 * Interactions are append-only. Stage and touchpoint definitions can be
 * upgraded (superseded with version+1) but never removed. The previous
 * revision remains queryable via the `_history` array so historical
 * reports keep the exact definitions they were recorded against.
 *
 * ─── Public API (class `JourneyMap`) ──────────────────────────────────────
 *
 *   defineStage({id, name_he, name_en, description, order})
 *   defineTouchpoint({id, stageId, channel, name_he, name_en, owner, sla})
 *   recordInteraction({customerId, touchpointId, timestamp,
 *                       outcome, sentiment, notes})
 *
 *   journeyFor(customerId)            — ordered timeline of interactions
 *   frictionScore(touchpointId, period)
 *   delightScore(touchpointId, period)
 *   stageConversion(period)           — % stage → next
 *   timeInStage(customerId, stageId)  — dwell time (ms)
 *   momentsOfTruth()                  — ranked touchpoints by |delight−friction|
 *   generateMap()                     — bilingual SVG string
 *   personas({segmentId})             — aggregate per segment
 *   dropoffAnalysis(period)           — where customers drop out
 *
 * ─── Scoring formulas ─────────────────────────────────────────────────────
 *
 *   friction(tp, period) =
 *       w_abandon   * abandonmentRate
 *     + w_negative  * negativeSentimentRate
 *     + w_sla       * slaBreachRate
 *   (weights: 0.4 / 0.35 / 0.25, result clamped 0..1)
 *
 *   delight(tp, period) =
 *       w_positive  * positiveSentimentRate
 *     + w_convert   * conversionRate
 *     + w_repeat    * repeatEngagementRate
 *   (weights: 0.4 / 0.35 / 0.25, result clamped 0..1)
 *
 *   momentOfTruthImpact = volume * max(delight, friction)
 *   A touchpoint ranks high when it has BOTH volume AND a strong emotional
 *   signal in either direction (make-or-break moments).
 *
 * ─── Channels (10) ────────────────────────────────────────────────────────
 *   website, email, phone, sms, in-person, portal, sales-rep, support,
 *   social, event
 *
 * ─── Stages (9) ───────────────────────────────────────────────────────────
 *   awareness, consideration, evaluation, purchase, onboarding,
 *   adoption, retention, expansion, advocacy
 */

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────

const STANDARD_STAGES = Object.freeze([
  { id: 'awareness',     name_he: 'מודעות',        name_en: 'Awareness',     order: 1 },
  { id: 'consideration', name_he: 'שקילה',         name_en: 'Consideration', order: 2 },
  { id: 'evaluation',    name_he: 'הערכה',         name_en: 'Evaluation',    order: 3 },
  { id: 'purchase',      name_he: 'רכישה',         name_en: 'Purchase',      order: 4 },
  { id: 'onboarding',    name_he: 'קליטה',         name_en: 'Onboarding',    order: 5 },
  { id: 'adoption',      name_he: 'אימוץ',         name_en: 'Adoption',      order: 6 },
  { id: 'retention',     name_he: 'שימור',         name_en: 'Retention',     order: 7 },
  { id: 'expansion',     name_he: 'הרחבה',         name_en: 'Expansion',     order: 8 },
  { id: 'advocacy',      name_he: 'המלצה',         name_en: 'Advocacy',      order: 9 },
]);

const CHANNELS = Object.freeze([
  'website', 'email', 'phone', 'sms', 'in-person',
  'portal', 'sales-rep', 'support', 'social', 'event',
]);

const CHANNEL_LABELS = Object.freeze({
  'website':   { he: 'אתר',          en: 'Website'    },
  'email':     { he: 'דוא"ל',        en: 'Email'      },
  'phone':     { he: 'טלפון',        en: 'Phone'      },
  'sms':       { he: 'הודעה (SMS)',  en: 'SMS'        },
  'in-person': { he: 'פנים אל פנים', en: 'In-Person'  },
  'portal':    { he: 'פורטל',        en: 'Portal'     },
  'sales-rep': { he: 'נציג מכירות',  en: 'Sales Rep'  },
  'support':   { he: 'תמיכה',        en: 'Support'    },
  'social':    { he: 'רשתות חברתיות',en: 'Social'     },
  'event':     { he: 'אירוע',        en: 'Event'      },
});

const OUTCOMES = Object.freeze([
  'success', 'abandoned', 'converted', 'escalated',
  'repeat', 'no-response', 'pending',
]);

const SENTIMENTS = Object.freeze(['positive', 'neutral', 'negative']);

const FRICTION_WEIGHTS = Object.freeze({ abandon: 0.40, negative: 0.35, sla: 0.25 });
const DELIGHT_WEIGHTS  = Object.freeze({ positive: 0.40, convert: 0.35, repeat: 0.25 });

// ─── Helpers ──────────────────────────────────────────────────────────────

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function round(n, digits = 3) {
  const p = Math.pow(10, digits);
  return Math.round(n * p) / p;
}

function inPeriod(ts, period) {
  if (!period) return true;
  const from = period.from != null ? period.from : -Infinity;
  const to   = period.to   != null ? period.to   :  Infinity;
  return ts >= from && ts <= to;
}

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function assertNonEmptyString(v, field) {
  if (typeof v !== 'string' || v.length === 0) {
    throw new TypeError('journey-map: field "' + field + '" must be a non-empty string');
  }
}

// ─── Class ────────────────────────────────────────────────────────────────

class JourneyMap {
  constructor(options) {
    const opts = options || {};
    this._now = typeof opts.now === 'function' ? opts.now : Date.now;

    // definitions (in-memory Maps)
    this._stages = new Map();       // id -> {id, name_he, name_en, description, order, version, createdAt}
    this._touchpoints = new Map();  // id -> {id, stageId, channel, name_he, name_en, owner, sla, version, createdAt}

    // append-only
    this._interactions = [];        // full append-only log
    this._byCustomer = new Map();   // customerId -> [indices into _interactions]
    this._byTouchpoint = new Map(); // touchpointId -> [indices]

    // segments / personas — customer metadata (upgradable, never deleted)
    this._segments = new Map();     // customerId -> Set<segmentId>

    // never-delete history — every definition revision is retained
    this._history = [];             // [{type, id, snapshot, at}]

    // seed the 9 standard stages so the engine is usable out-of-the-box
    if (opts.seed !== false) {
      for (const s of STANDARD_STAGES) {
        this.defineStage({
          id: s.id,
          name_he: s.name_he,
          name_en: s.name_en,
          description: 'Standard stage — ' + s.name_en,
          order: s.order,
        });
      }
    }
  }

  // ─── Stage definition ──────────────────────────────────────────────────

  defineStage(def) {
    if (def == null || typeof def !== 'object') {
      throw new TypeError('journey-map: defineStage requires an object');
    }
    assertNonEmptyString(def.id, 'id');
    assertNonEmptyString(def.name_he, 'name_he');
    assertNonEmptyString(def.name_en, 'name_en');
    if (typeof def.order !== 'number' || !Number.isFinite(def.order)) {
      throw new TypeError('journey-map: defineStage.order must be a finite number');
    }
    const existing = this._stages.get(def.id);
    const version = existing ? existing.version + 1 : 1;
    if (existing) {
      this._history.push({ type: 'stage', id: def.id, snapshot: existing, at: this._now() });
    }
    const stage = {
      id: def.id,
      name_he: def.name_he,
      name_en: def.name_en,
      description: def.description || '',
      order: def.order,
      version: version,
      createdAt: this._now(),
    };
    this._stages.set(def.id, stage);
    return Object.freeze(Object.assign({}, stage));
  }

  getStage(id) {
    const s = this._stages.get(id);
    return s ? Object.freeze(Object.assign({}, s)) : null;
  }

  listStages() {
    return Array.from(this._stages.values())
      .sort(function (a, b) { return a.order - b.order; })
      .map(function (s) { return Object.freeze(Object.assign({}, s)); });
  }

  // ─── Touchpoint definition ─────────────────────────────────────────────

  defineTouchpoint(def) {
    if (def == null || typeof def !== 'object') {
      throw new TypeError('journey-map: defineTouchpoint requires an object');
    }
    assertNonEmptyString(def.id, 'id');
    assertNonEmptyString(def.stageId, 'stageId');
    assertNonEmptyString(def.channel, 'channel');
    assertNonEmptyString(def.name_he, 'name_he');
    assertNonEmptyString(def.name_en, 'name_en');

    if (!this._stages.has(def.stageId)) {
      throw new Error('journey-map: unknown stageId "' + def.stageId + '"');
    }
    if (CHANNELS.indexOf(def.channel) === -1) {
      throw new Error('journey-map: unknown channel "' + def.channel +
        '" — allowed: ' + CHANNELS.join(', '));
    }

    const existing = this._touchpoints.get(def.id);
    const version = existing ? existing.version + 1 : 1;
    if (existing) {
      this._history.push({ type: 'touchpoint', id: def.id, snapshot: existing, at: this._now() });
    }
    const tp = {
      id: def.id,
      stageId: def.stageId,
      channel: def.channel,
      name_he: def.name_he,
      name_en: def.name_en,
      owner: def.owner || '',
      sla: (typeof def.sla === 'number' && Number.isFinite(def.sla)) ? def.sla : null, // ms
      version: version,
      createdAt: this._now(),
    };
    this._touchpoints.set(def.id, tp);
    return Object.freeze(Object.assign({}, tp));
  }

  getTouchpoint(id) {
    const t = this._touchpoints.get(id);
    return t ? Object.freeze(Object.assign({}, t)) : null;
  }

  listTouchpoints(stageId) {
    let arr = Array.from(this._touchpoints.values());
    if (stageId) arr = arr.filter(function (t) { return t.stageId === stageId; });
    return arr.map(function (t) { return Object.freeze(Object.assign({}, t)); });
  }

  // ─── Segments / personas ──────────────────────────────────────────────

  tagCustomer(customerId, segmentId) {
    assertNonEmptyString(customerId, 'customerId');
    assertNonEmptyString(segmentId, 'segmentId');
    let set = this._segments.get(customerId);
    if (!set) { set = new Set(); this._segments.set(customerId, set); }
    set.add(segmentId);
  }

  // ─── Append-only interaction log ──────────────────────────────────────

  recordInteraction(evt) {
    if (evt == null || typeof evt !== 'object') {
      throw new TypeError('journey-map: recordInteraction requires an object');
    }
    assertNonEmptyString(evt.customerId, 'customerId');
    assertNonEmptyString(evt.touchpointId, 'touchpointId');
    const tp = this._touchpoints.get(evt.touchpointId);
    if (!tp) {
      throw new Error('journey-map: unknown touchpointId "' + evt.touchpointId + '"');
    }
    const ts = typeof evt.timestamp === 'number' ? evt.timestamp : this._now();
    const outcome = evt.outcome || 'pending';
    if (OUTCOMES.indexOf(outcome) === -1) {
      throw new Error('journey-map: unknown outcome "' + outcome +
        '" — allowed: ' + OUTCOMES.join(', '));
    }
    const sentiment = evt.sentiment || 'neutral';
    if (SENTIMENTS.indexOf(sentiment) === -1) {
      throw new Error('journey-map: unknown sentiment "' + sentiment +
        '" — allowed: ' + SENTIMENTS.join(', '));
    }

    const rec = Object.freeze({
      customerId: evt.customerId,
      touchpointId: evt.touchpointId,
      stageId: tp.stageId,
      channel: tp.channel,
      timestamp: ts,
      outcome: outcome,
      sentiment: sentiment,
      notes: evt.notes || '',
      durationMs: (typeof evt.durationMs === 'number' && Number.isFinite(evt.durationMs))
        ? evt.durationMs : null,
      seq: this._interactions.length,  // append-only, immutable
    });

    const idx = this._interactions.push(rec) - 1;
    let byCust = this._byCustomer.get(evt.customerId);
    if (!byCust) { byCust = []; this._byCustomer.set(evt.customerId, byCust); }
    byCust.push(idx);

    let byTp = this._byTouchpoint.get(evt.touchpointId);
    if (!byTp) { byTp = []; this._byTouchpoint.set(evt.touchpointId, byTp); }
    byTp.push(idx);

    return rec;
  }

  // ─── Queries ──────────────────────────────────────────────────────────

  journeyFor(customerId) {
    const idxs = this._byCustomer.get(customerId) || [];
    const self = this;
    const arr = idxs.map(function (i) { return self._interactions[i]; });
    // ordered by timestamp ascending, then seq for deterministic tie-break
    return arr.slice().sort(function (a, b) {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      return a.seq - b.seq;
    });
  }

  _interactionsForTouchpoint(touchpointId, period) {
    const idxs = this._byTouchpoint.get(touchpointId) || [];
    const self = this;
    const out = [];
    for (let i = 0; i < idxs.length; i++) {
      const rec = self._interactions[idxs[i]];
      if (inPeriod(rec.timestamp, period)) out.push(rec);
    }
    return out;
  }

  frictionScore(touchpointId, period) {
    if (!this._touchpoints.has(touchpointId)) {
      throw new Error('journey-map: unknown touchpointId "' + touchpointId + '"');
    }
    const tp = this._touchpoints.get(touchpointId);
    const recs = this._interactionsForTouchpoint(touchpointId, period);
    const total = recs.length;

    if (total === 0) {
      return Object.freeze({
        touchpointId: touchpointId,
        volume: 0,
        abandonmentRate: 0,
        negativeSentimentRate: 0,
        slaBreachRate: 0,
        score: 0,
      });
    }

    let abandoned = 0, negative = 0, slaBreach = 0;
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i];
      if (r.outcome === 'abandoned' || r.outcome === 'no-response') abandoned++;
      if (r.sentiment === 'negative') negative++;
      if (tp.sla != null && r.durationMs != null && r.durationMs > tp.sla) slaBreach++;
    }

    const aR = abandoned / total;
    const nR = negative / total;
    const sR = slaBreach / total;

    const score = clamp01(
      FRICTION_WEIGHTS.abandon  * aR +
      FRICTION_WEIGHTS.negative * nR +
      FRICTION_WEIGHTS.sla      * sR
    );

    return Object.freeze({
      touchpointId: touchpointId,
      volume: total,
      abandonmentRate: round(aR),
      negativeSentimentRate: round(nR),
      slaBreachRate: round(sR),
      score: round(score),
    });
  }

  delightScore(touchpointId, period) {
    if (!this._touchpoints.has(touchpointId)) {
      throw new Error('journey-map: unknown touchpointId "' + touchpointId + '"');
    }
    const recs = this._interactionsForTouchpoint(touchpointId, period);
    const total = recs.length;

    if (total === 0) {
      return Object.freeze({
        touchpointId: touchpointId,
        volume: 0,
        positiveSentimentRate: 0,
        conversionRate: 0,
        repeatEngagementRate: 0,
        score: 0,
      });
    }

    let positive = 0, converted = 0;
    const seenCustomers = new Map(); // customerId -> count
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i];
      if (r.sentiment === 'positive') positive++;
      if (r.outcome === 'converted' || r.outcome === 'success') converted++;
      seenCustomers.set(r.customerId, (seenCustomers.get(r.customerId) || 0) + 1);
    }
    let repeat = 0;
    seenCustomers.forEach(function (count) { if (count > 1) repeat += count; });

    const pR = positive / total;
    const cR = converted / total;
    const rR = repeat / total;

    const score = clamp01(
      DELIGHT_WEIGHTS.positive * pR +
      DELIGHT_WEIGHTS.convert  * cR +
      DELIGHT_WEIGHTS.repeat   * rR
    );

    return Object.freeze({
      touchpointId: touchpointId,
      volume: total,
      positiveSentimentRate: round(pR),
      conversionRate: round(cR),
      repeatEngagementRate: round(rR),
      score: round(score),
    });
  }

  stageConversion(period) {
    // for each customer compute the set of stages they reached; then for each
    // stage pair (n → n+1) compute (#reached_next / #reached_this)
    const stagesOrdered = this.listStages();
    const byOrder = new Map();
    for (let i = 0; i < stagesOrdered.length; i++) byOrder.set(stagesOrdered[i].id, stagesOrdered[i].order);
    const reachCount = new Map();
    for (let i = 0; i < stagesOrdered.length; i++) reachCount.set(stagesOrdered[i].id, 0);

    const byCustomer = this._byCustomer;
    const interactions = this._interactions;
    byCustomer.forEach(function (idxs) {
      const reached = new Set();
      for (let j = 0; j < idxs.length; j++) {
        const rec = interactions[idxs[j]];
        if (!inPeriod(rec.timestamp, period)) continue;
        reached.add(rec.stageId);
      }
      reached.forEach(function (sid) {
        reachCount.set(sid, (reachCount.get(sid) || 0) + 1);
      });
    });

    const result = [];
    for (let i = 0; i < stagesOrdered.length - 1; i++) {
      const from = stagesOrdered[i];
      const to = stagesOrdered[i + 1];
      const a = reachCount.get(from.id) || 0;
      const b = reachCount.get(to.id) || 0;
      const rate = a === 0 ? 0 : b / a;
      result.push(Object.freeze({
        from: from.id,
        from_he: from.name_he,
        from_en: from.name_en,
        to: to.id,
        to_he: to.name_he,
        to_en: to.name_en,
        reachedFrom: a,
        reachedTo: b,
        rate: round(clamp01(rate)),
      }));
    }
    return result;
  }

  timeInStage(customerId, stageId) {
    const journey = this.journeyFor(customerId);
    if (journey.length === 0) return 0;
    // dwell = (last interaction in stage) - (first interaction in stage)
    // if the customer left the stage, we use (first interaction of NEXT stage) - (first in stage)
    const byOrder = new Map();
    const stages = this.listStages();
    for (let i = 0; i < stages.length; i++) byOrder.set(stages[i].id, stages[i].order);
    const targetOrder = byOrder.get(stageId);
    if (targetOrder == null) return 0;

    let firstIn = null;
    let lastIn = null;
    let firstAfter = null;
    for (let i = 0; i < journey.length; i++) {
      const rec = journey[i];
      const o = byOrder.get(rec.stageId);
      if (o == null) continue;
      if (rec.stageId === stageId) {
        if (firstIn == null) firstIn = rec.timestamp;
        lastIn = rec.timestamp;
      } else if (o > targetOrder && firstIn != null && firstAfter == null) {
        firstAfter = rec.timestamp;
        break;
      }
    }
    if (firstIn == null) return 0;
    if (firstAfter != null) return firstAfter - firstIn;
    return lastIn - firstIn;
  }

  momentsOfTruth() {
    // rank touchpoints by impact = volume * max(delight, friction)
    // a moment of truth is a make-or-break step: high traffic AND strong
    // signal in either direction.
    const ids = Array.from(this._touchpoints.keys());
    const self = this;
    const rows = ids.map(function (id) {
      const tp = self._touchpoints.get(id);
      const f = self.frictionScore(id);
      const d = self.delightScore(id);
      const vol = f.volume;
      const magnitude = Math.max(d.score, f.score);
      const polarity = Math.abs(d.score - f.score);
      const impact = vol * magnitude;
      return Object.freeze({
        touchpointId: id,
        name_he: tp.name_he,
        name_en: tp.name_en,
        stageId: tp.stageId,
        channel: tp.channel,
        volume: vol,
        friction: f.score,
        delight: d.score,
        polarity: round(polarity),
        magnitude: round(magnitude),
        impact: round(impact),
      });
    });
    rows.sort(function (a, b) {
      if (b.impact !== a.impact) return b.impact - a.impact;
      if (b.volume !== a.volume) return b.volume - a.volume;
      return a.touchpointId < b.touchpointId ? -1 : 1;
    });
    return rows;
  }

  generateMap() {
    // Bilingual SVG — RTL Hebrew + English labels
    // Layout: 9 stage columns left→right (in RTL reading order we still draw
    // LTR physically and rely on direction="rtl" on text elements for Hebrew).
    const stages = this.listStages();
    const width = 200 + stages.length * 140;
    const height = 520;
    const colX = function (i) { return 120 + i * 140; };
    const stageY = 110;

    const parts = [];
    parts.push('<?xml version="1.0" encoding="UTF-8"?>');
    parts.push(
      '<svg xmlns="http://www.w3.org/2000/svg" ' +
      'viewBox="0 0 ' + width + ' ' + height + '" ' +
      'width="' + width + '" height="' + height + '" ' +
      'direction="rtl" lang="he">'
    );
    parts.push('<title>Customer Journey Map — מפת מסע לקוח</title>');
    parts.push('<desc>Bilingual journey map — Agent Y-102 — Techno-Kol Uzi 2026</desc>');

    // Styles
    parts.push('<defs><style>');
    parts.push('.stage-label-he{font-family:Arial,sans-serif;font-size:14px;font-weight:700;direction:rtl;}');
    parts.push('.stage-label-en{font-family:Arial,sans-serif;font-size:11px;fill:#555;direction:ltr;}');
    parts.push('.tp-label-he{font-family:Arial,sans-serif;font-size:10px;direction:rtl;}');
    parts.push('.tp-label-en{font-family:Arial,sans-serif;font-size:9px;fill:#666;direction:ltr;}');
    parts.push('.legend{font-family:Arial,sans-serif;font-size:11px;}');
    parts.push('</style></defs>');

    // Title
    parts.push('<text x="' + (width / 2) + '" y="30" text-anchor="middle" ' +
      'class="stage-label-he">מפת מסע לקוח — Techno-Kol Uzi</text>');
    parts.push('<text x="' + (width / 2) + '" y="50" text-anchor="middle" ' +
      'class="stage-label-en">Customer Journey Map — 9 stages × 10 channels</text>');

    // Connecting line between stages
    parts.push('<line x1="' + colX(0) + '" y1="' + stageY + '" x2="' +
      colX(stages.length - 1) + '" y2="' + stageY + '" ' +
      'stroke="#cccccc" stroke-width="2" stroke-dasharray="6,4"/>');

    // Stage nodes
    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      const x = colX(i);
      parts.push('<circle cx="' + x + '" cy="' + stageY + '" r="16" fill="#2b6cb0" stroke="#ffffff" stroke-width="2"/>');
      parts.push('<text x="' + x + '" y="' + (stageY + 4) + '" text-anchor="middle" fill="#ffffff" font-size="11" font-weight="700">' + s.order + '</text>');
      parts.push('<text x="' + x + '" y="' + (stageY + 38) + '" text-anchor="middle" class="stage-label-he">' + xmlEscape(s.name_he) + '</text>');
      parts.push('<text x="' + x + '" y="' + (stageY + 54) + '" text-anchor="middle" class="stage-label-en">' + xmlEscape(s.name_en) + '</text>');
    }

    // Touchpoint dots — per stage, stacked downward, colored by delight/friction
    const self = this;
    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      const tps = this.listTouchpoints(s.id);
      for (let j = 0; j < tps.length; j++) {
        const tp = tps[j];
        const f = self.frictionScore(tp.id);
        const d = self.delightScore(tp.id);
        const delta = d.score - f.score; // [-1..1]
        // red for friction, green for delight, grey for no data
        let color = '#9ca3af';
        if (f.volume > 0) {
          if (delta > 0.05) color = '#16a34a';
          else if (delta < -0.05) color = '#dc2626';
          else color = '#d97706';
        }
        const tx = colX(i);
        const ty = stageY + 90 + j * 42;
        parts.push('<circle cx="' + tx + '" cy="' + ty + '" r="10" fill="' + color +
          '" stroke="#ffffff" stroke-width="2">' +
          '<title>' + xmlEscape(tp.name_he) + ' / ' + xmlEscape(tp.name_en) +
          ' — friction=' + f.score + ' delight=' + d.score + '</title></circle>');
        parts.push('<text x="' + tx + '" y="' + (ty + 20) + '" text-anchor="middle" class="tp-label-he">' + xmlEscape(tp.name_he) + '</text>');
        parts.push('<text x="' + tx + '" y="' + (ty + 32) + '" text-anchor="middle" class="tp-label-en">' + xmlEscape(tp.name_en) + '</text>');
      }
    }

    // Legend
    const legendY = height - 50;
    parts.push('<g class="legend">');
    parts.push('<circle cx="40" cy="' + legendY + '" r="8" fill="#16a34a"/><text x="54" y="' + (legendY + 4) + '">עונג / Delight</text>');
    parts.push('<circle cx="180" cy="' + legendY + '" r="8" fill="#dc2626"/><text x="194" y="' + (legendY + 4) + '">חיכוך / Friction</text>');
    parts.push('<circle cx="320" cy="' + legendY + '" r="8" fill="#d97706"/><text x="334" y="' + (legendY + 4) + '">ניטרלי / Neutral</text>');
    parts.push('<circle cx="460" cy="' + legendY + '" r="8" fill="#9ca3af"/><text x="474" y="' + (legendY + 4) + '">אין נתונים / No data</text>');
    parts.push('</g>');

    parts.push('</svg>');
    return parts.join('\n');
  }

  personas(query) {
    const segmentId = (query && query.segmentId) || null;
    // collect customerIds in segment (or all if no segment)
    const customerIds = [];
    const segments = this._segments;
    this._byCustomer.forEach(function (_idxs, cid) {
      if (segmentId == null) { customerIds.push(cid); return; }
      const set = segments.get(cid);
      if (set && set.has(segmentId)) customerIds.push(cid);
    });

    const stageReach = new Map();
    const channelUse = new Map();
    const sentiments = { positive: 0, neutral: 0, negative: 0 };
    let totalInteractions = 0;
    const perCustomerCount = [];

    const self = this;
    for (let i = 0; i < customerIds.length; i++) {
      const cid = customerIds[i];
      const journey = self.journeyFor(cid);
      perCustomerCount.push(journey.length);
      totalInteractions += journey.length;
      const reached = new Set();
      for (let j = 0; j < journey.length; j++) {
        const r = journey[j];
        reached.add(r.stageId);
        channelUse.set(r.channel, (channelUse.get(r.channel) || 0) + 1);
        sentiments[r.sentiment]++;
      }
      reached.forEach(function (sid) {
        stageReach.set(sid, (stageReach.get(sid) || 0) + 1);
      });
    }

    const stages = this.listStages();
    const stageReachArr = stages.map(function (s) {
      return {
        stageId: s.id,
        name_he: s.name_he,
        name_en: s.name_en,
        reached: stageReach.get(s.id) || 0,
        reachRate: customerIds.length === 0 ? 0 : round((stageReach.get(s.id) || 0) / customerIds.length),
      };
    });

    const channelArr = [];
    channelUse.forEach(function (v, k) {
      channelArr.push({
        channel: k,
        name_he: CHANNEL_LABELS[k] ? CHANNEL_LABELS[k].he : k,
        name_en: CHANNEL_LABELS[k] ? CHANNEL_LABELS[k].en : k,
        interactions: v,
      });
    });
    channelArr.sort(function (a, b) { return b.interactions - a.interactions; });

    const avgInter = customerIds.length === 0 ? 0 : round(totalInteractions / customerIds.length);

    return Object.freeze({
      segmentId: segmentId,
      customerCount: customerIds.length,
      totalInteractions: totalInteractions,
      avgInteractionsPerCustomer: avgInter,
      stageReach: stageReachArr,
      topChannels: channelArr,
      sentimentMix: Object.freeze({
        positive: sentiments.positive,
        neutral: sentiments.neutral,
        negative: sentiments.negative,
      }),
    });
  }

  dropoffAnalysis(period) {
    const stages = this.listStages();
    // a drop-off at stage N = customer reached N but not N+1 nor any later stage
    const byOrder = new Map();
    for (let i = 0; i < stages.length; i++) byOrder.set(stages[i].id, stages[i].order);
    const dropCounts = new Map();
    const reachCounts = new Map();
    for (let i = 0; i < stages.length; i++) {
      dropCounts.set(stages[i].id, 0);
      reachCounts.set(stages[i].id, 0);
    }

    const interactions = this._interactions;
    this._byCustomer.forEach(function (idxs) {
      let maxOrder = 0;
      let maxStageId = null;
      const reachedOrders = new Set();
      for (let j = 0; j < idxs.length; j++) {
        const rec = interactions[idxs[j]];
        if (!inPeriod(rec.timestamp, period)) continue;
        const o = byOrder.get(rec.stageId);
        if (o == null) continue;
        reachedOrders.add(rec.stageId);
        if (o > maxOrder) { maxOrder = o; maxStageId = rec.stageId; }
      }
      reachedOrders.forEach(function (sid) {
        reachCounts.set(sid, (reachCounts.get(sid) || 0) + 1);
      });
      if (maxStageId != null && maxOrder < stages.length) {
        dropCounts.set(maxStageId, (dropCounts.get(maxStageId) || 0) + 1);
      }
    });

    const rows = stages.map(function (s) {
      const reached = reachCounts.get(s.id) || 0;
      const dropped = dropCounts.get(s.id) || 0;
      return Object.freeze({
        stageId: s.id,
        name_he: s.name_he,
        name_en: s.name_en,
        order: s.order,
        reached: reached,
        dropped: dropped,
        dropoffRate: reached === 0 ? 0 : round(dropped / reached),
      });
    });
    // do not count the final (advocacy) stage drop-offs as a bad thing — still report it
    return rows;
  }

  // ─── Introspection for tests / debug ──────────────────────────────────

  _allInteractions() {
    // defensive copy — append-only invariant
    return this._interactions.slice();
  }

  _historySize() {
    return this._history.length;
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────

module.exports = {
  JourneyMap: JourneyMap,
  STANDARD_STAGES: STANDARD_STAGES,
  CHANNELS: CHANNELS,
  CHANNEL_LABELS: CHANNEL_LABELS,
  OUTCOMES: OUTCOMES,
  SENTIMENTS: SENTIMENTS,
  FRICTION_WEIGHTS: FRICTION_WEIGHTS,
  DELIGHT_WEIGHTS: DELIGHT_WEIGHTS,
};
