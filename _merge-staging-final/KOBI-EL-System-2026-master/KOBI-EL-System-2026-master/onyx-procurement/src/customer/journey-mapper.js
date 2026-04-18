/**
 * Customer Journey Mapper — ממפה מסע לקוח
 * Agent Y-102 — Swarm Customer — Techno-Kol Uzi Mega-ERP 2026
 * Date: 2026-04-11
 *
 * Zero-dependency pure Node.js module that tracks customers through any
 * number of configurable lifecycle journeys (Awareness → Consideration →
 * Purchase → Onboarding → Adoption → Expansion → Advocacy is the seed).
 *
 * The mapper is:
 *   - deterministic: same inputs → same outputs (no Math.random, no Date.now
 *     outside an injectable clock).
 *   - bilingual: every stage, trigger, and SVG label carries Hebrew + English.
 *   - append-only: events are never removed, stages are never deleted, and
 *     journeys never lose historical data. Upgrades go through
 *     `upgradeJourney()` which creates a new version and supersedes the old
 *     one, keeping the previous definition fully queryable.
 *   - zero deps: only `node:*` modules (and none at runtime, really).
 *
 * ─── Rule upheld: "לעולם לא מוחקים — רק משדרגים ומגדלים" ────────────────
 *
 * No event or journey stage is ever deleted. Corrections are applied by
 * recording a new event or publishing a new journey version.
 *
 * ─── Public API (class `JourneyMapper`) ────────────────────────────────────
 *
 *   defineJourney({id, name_he, name_en, stages[]})
 *   upgradeJourney(id, patch)                 — never-delete upgrade
 *   getJourney(id)                            — current version (read-only)
 *   listJourneys()                            — all current versions
 *
 *   recordEvent({customerId, eventType, timestamp, properties})
 *   getEvents(customerId, journeyId?)         — chronological
 *
 *   currentStage(customerId, journeyId)       — latest stage + entered_at
 *   journeyDuration(customerId, journeyId)    — total ms in journey
 *   stageTimes(customerId, journeyId)         — ms per stage (Map-like)
 *
 *   abandonment({journeyId, period})          — per stage dropped counts
 *   conversionFunnel(journeyId)               — stage-to-stage %
 *   heatmapEvents({journeyId, period})        — event frequency matrix
 *   anomalyDetection({customerId, journeyId}) — skip / backtrack / stall list
 *   compareCohorts({cohortA, cohortB})        — side-by-side metrics
 *   predictNextStage(customerId, journeyId)   — likelihood per next stage
 *   interventionPoints(journeyId)             — stalls ranked by severity
 *   generateJourneyMap(journeyId)             — bilingual SVG string
 *   npsPerStage(journeyId)                    — NPS grouped by stage
 *
 * ─── Exports ───────────────────────────────────────────────────────────────
 *   JourneyMapper                        — main class
 *   STANDARD_JOURNEY                     — seed "Customer Lifecycle" journey
 *   STANDARD_STAGES                      — array of 7 stage definitions
 *   EVENT_TYPES                          — catalog of known event types
 *   TRIGGERS                             — catalog of stage-entry triggers
 *   LABELS                               — bilingual label dictionary
 *   createMemoryStore                    — in-memory append-only store
 *   ms / seconds / minutes / hours / days — duration helpers
 */

'use strict';

// ─── duration helpers ─────────────────────────────────────────────────────
const MS = 1;
const SEC = 1000 * MS;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function ms(n) { return n * MS; }
function seconds(n) { return n * SEC; }
function minutes(n) { return n * MIN; }
function hours(n) { return n * HOUR; }
function days(n) { return n * DAY; }

// ─── bilingual labels ─────────────────────────────────────────────────────
const LABELS = Object.freeze({
  headers: {
    journey: { he: 'מסע לקוח', en: 'Customer Journey' },
    stage: { he: 'שלב', en: 'Stage' },
    duration: { he: 'משך', en: 'Duration' },
    conversion: { he: 'המרה', en: 'Conversion' },
    abandonment: { he: 'נטישה', en: 'Abandonment' },
    heatmap: { he: 'מפת חום', en: 'Heatmap' },
    anomaly: { he: 'חריגה', en: 'Anomaly' },
    nps: { he: 'NPS', en: 'NPS' },
  },
  anomalies: {
    skip: { he: 'דילוג על שלב', en: 'stage skipped' },
    backtrack: { he: 'חזרה לשלב קודם', en: 'backtracked to earlier stage' },
    stall: { he: 'תקיעה בשלב', en: 'stalled in stage' },
    duplicate: { he: 'אירוע כפול', en: 'duplicate event' },
  },
  legend: {
    customers: { he: 'לקוחות', en: 'customers' },
    events: { he: 'אירועים', en: 'events' },
    dropped: { he: 'עזבו', en: 'dropped' },
    stalled: { he: 'תקועים', en: 'stalled' },
    converted: { he: 'המירו', en: 'converted' },
  },
});

// ─── standard stages / standard journey seed ─────────────────────────────
const STANDARD_STAGES = Object.freeze([
  {
    id: 'awareness',
    name_he: 'מודעות',
    name_en: 'Awareness',
    triggers: Object.freeze(['website_visit', 'ad_click', 'content_view', 'referral']),
    expectedDuration: days(14),
    successMetrics: Object.freeze({
      min_events: 1,
      conversion_target: 0.35,
      advance_to: 'consideration',
    }),
  },
  {
    id: 'consideration',
    name_he: 'שקילה',
    name_en: 'Consideration',
    triggers: Object.freeze(['product_view', 'quote_request', 'demo_booked', 'comparison']),
    expectedDuration: days(21),
    successMetrics: Object.freeze({
      min_events: 2,
      conversion_target: 0.30,
      advance_to: 'purchase',
    }),
  },
  {
    id: 'purchase',
    name_he: 'רכישה',
    name_en: 'Purchase',
    triggers: Object.freeze(['order_placed', 'contract_signed', 'payment_received']),
    expectedDuration: days(3),
    successMetrics: Object.freeze({
      min_events: 1,
      conversion_target: 0.95,
      advance_to: 'onboarding',
    }),
  },
  {
    id: 'onboarding',
    name_he: 'קליטה',
    name_en: 'Onboarding',
    triggers: Object.freeze(['welcome_email_opened', 'first_login', 'training_completed']),
    expectedDuration: days(14),
    successMetrics: Object.freeze({
      min_events: 2,
      conversion_target: 0.80,
      advance_to: 'adoption',
    }),
  },
  {
    id: 'adoption',
    name_he: 'אימוץ',
    name_en: 'Adoption',
    triggers: Object.freeze(['feature_used', 'weekly_active', 'support_ticket']),
    expectedDuration: days(60),
    successMetrics: Object.freeze({
      min_events: 5,
      conversion_target: 0.50,
      advance_to: 'expansion',
    }),
  },
  {
    id: 'expansion',
    name_he: 'הרחבה',
    name_en: 'Expansion',
    triggers: Object.freeze(['upsell_accepted', 'seat_added', 'upgrade_plan']),
    expectedDuration: days(180),
    successMetrics: Object.freeze({
      min_events: 1,
      conversion_target: 0.25,
      advance_to: 'advocacy',
    }),
  },
  {
    id: 'advocacy',
    name_he: 'שגרירות',
    name_en: 'Advocacy',
    triggers: Object.freeze(['referral_sent', 'review_posted', 'case_study', 'nps_promoter']),
    expectedDuration: days(365),
    successMetrics: Object.freeze({
      min_events: 1,
      conversion_target: 1.0,
      advance_to: null,
    }),
  },
]);

const STANDARD_JOURNEY = Object.freeze({
  id: 'customer_lifecycle',
  name_he: 'מחזור חיי לקוח',
  name_en: 'Customer Lifecycle',
  stages: STANDARD_STAGES,
});

// ─── event / trigger catalog ──────────────────────────────────────────────
const EVENT_TYPES = Object.freeze({
  website_visit: { stage: 'awareness', weight: 1 },
  ad_click: { stage: 'awareness', weight: 2 },
  content_view: { stage: 'awareness', weight: 1 },
  referral: { stage: 'awareness', weight: 3 },

  product_view: { stage: 'consideration', weight: 2 },
  quote_request: { stage: 'consideration', weight: 5 },
  demo_booked: { stage: 'consideration', weight: 7 },
  comparison: { stage: 'consideration', weight: 3 },

  order_placed: { stage: 'purchase', weight: 10 },
  contract_signed: { stage: 'purchase', weight: 10 },
  payment_received: { stage: 'purchase', weight: 10 },

  welcome_email_opened: { stage: 'onboarding', weight: 1 },
  first_login: { stage: 'onboarding', weight: 3 },
  training_completed: { stage: 'onboarding', weight: 5 },

  feature_used: { stage: 'adoption', weight: 2 },
  weekly_active: { stage: 'adoption', weight: 1 },
  support_ticket: { stage: 'adoption', weight: 1 },

  upsell_accepted: { stage: 'expansion', weight: 8 },
  seat_added: { stage: 'expansion', weight: 4 },
  upgrade_plan: { stage: 'expansion', weight: 6 },

  referral_sent: { stage: 'advocacy', weight: 6 },
  review_posted: { stage: 'advocacy', weight: 4 },
  case_study: { stage: 'advocacy', weight: 9 },
  nps_promoter: { stage: 'advocacy', weight: 5 },

  nps_response: { stage: null, weight: 0 }, // stage-agnostic NPS feedback
});

const TRIGGERS = Object.freeze(
  Object.keys(EVENT_TYPES).filter((k) => EVENT_TYPES[k].stage !== null),
);

// ─── in-memory append-only store ──────────────────────────────────────────
function createMemoryStore() {
  const events = []; // {customerId, eventType, ts, properties}
  const journeys = new Map(); // id → { versions:[] , currentIndex }
  return {
    addEvent(ev) { events.push(Object.freeze(ev)); return events.length - 1; },
    allEvents() { return events.slice(); },
    eventsFor(customerId) {
      return events.filter((e) => e.customerId === customerId);
    },
    putJourney(id, def) {
      if (!journeys.has(id)) journeys.set(id, { versions: [], currentIndex: -1 });
      const bucket = journeys.get(id);
      bucket.versions.push(Object.freeze(def));
      bucket.currentIndex = bucket.versions.length - 1;
    },
    getJourney(id) {
      const bucket = journeys.get(id);
      if (!bucket) return null;
      return bucket.versions[bucket.currentIndex];
    },
    allVersions(id) {
      const bucket = journeys.get(id);
      return bucket ? bucket.versions.slice() : [];
    },
    listJourneyIds() { return Array.from(journeys.keys()); },
  };
}

// ─── pure helpers ─────────────────────────────────────────────────────────
function toTs(t) {
  if (t instanceof Date) return t.getTime();
  if (typeof t === 'number') return t;
  if (typeof t === 'string') {
    const n = Date.parse(t);
    if (Number.isNaN(n)) throw new Error(`invalid timestamp: ${t}`);
    return n;
  }
  throw new Error(`invalid timestamp type: ${typeof t}`);
}

function assertNonEmptyString(v, name) {
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

function freezeDeep(obj) {
  if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) return obj;
  for (const k of Object.keys(obj)) freezeDeep(obj[k]);
  return Object.freeze(obj);
}

function xmlEscape(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    c === '&' ? '&amp;' :
    c === '<' ? '&lt;' :
    c === '>' ? '&gt;' :
    c === '"' ? '&quot;' :
                '&apos;'
  ));
}

function round1(n) { return Math.round(n * 10) / 10; }
function pct(num, den) {
  if (!den || den === 0) return 0;
  return Math.round((num / den) * 1000) / 10; // one decimal
}

// ─── main class ───────────────────────────────────────────────────────────
class JourneyMapper {
  constructor({ now, store, seedStandardJourney = true } = {}) {
    this._now = typeof now === 'function' ? now : () => new Date();
    this._store = store || createMemoryStore();
    if (seedStandardJourney) {
      this.defineJourney(STANDARD_JOURNEY);
    }
  }

  // ── journey definition ────────────────────────────────────────────────
  defineJourney(def) {
    if (!def || typeof def !== 'object') throw new Error('journey def required');
    assertNonEmptyString(def.id, 'journey.id');
    assertNonEmptyString(def.name_he, 'journey.name_he');
    assertNonEmptyString(def.name_en, 'journey.name_en');
    if (!Array.isArray(def.stages) || def.stages.length === 0) {
      throw new Error('journey.stages must be a non-empty array');
    }

    const seen = new Set();
    const stages = def.stages.map((s, i) => {
      assertNonEmptyString(s.id, `stages[${i}].id`);
      if (seen.has(s.id)) throw new Error(`duplicate stage id: ${s.id}`);
      seen.add(s.id);
      assertNonEmptyString(s.name_he, `stages[${i}].name_he`);
      assertNonEmptyString(s.name_en, `stages[${i}].name_en`);
      const triggers = Array.isArray(s.triggers) ? s.triggers.slice() : [];
      const expectedDuration = Number(s.expectedDuration) > 0 ? Number(s.expectedDuration) : null;
      const successMetrics = s.successMetrics && typeof s.successMetrics === 'object'
        ? { ...s.successMetrics }
        : {};
      return Object.freeze({
        id: s.id,
        name_he: s.name_he,
        name_en: s.name_en,
        triggers: Object.freeze(triggers),
        expectedDuration,
        successMetrics: Object.freeze(successMetrics),
        index: i,
      });
    });

    const record = Object.freeze({
      id: def.id,
      name_he: def.name_he,
      name_en: def.name_en,
      stages: Object.freeze(stages),
      version: 1 + this._store.allVersions(def.id).length,
      createdAt: this._now().toISOString(),
    });

    this._store.putJourney(def.id, record);
    return record;
  }

  upgradeJourney(id, patch) {
    const current = this._store.getJourney(id);
    if (!current) throw new Error(`unknown journey: ${id}`);
    // merge stages by id — patch may add new stages but never removes any.
    const stageMap = new Map(current.stages.map((s) => [s.id, { ...s }]));
    if (patch && Array.isArray(patch.stages)) {
      for (const p of patch.stages) {
        assertNonEmptyString(p.id, 'patch.stage.id');
        const existing = stageMap.get(p.id);
        if (existing) {
          stageMap.set(p.id, { ...existing, ...p });
        } else {
          stageMap.set(p.id, p);
        }
      }
    }
    const merged = {
      id,
      name_he: (patch && patch.name_he) || current.name_he,
      name_en: (patch && patch.name_en) || current.name_en,
      stages: Array.from(stageMap.values()),
    };
    return this.defineJourney(merged);
  }

  getJourney(id) { return this._store.getJourney(id); }
  listJourneys() {
    return this._store.listJourneyIds().map((id) => this._store.getJourney(id));
  }

  // ── event ingestion ───────────────────────────────────────────────────
  recordEvent({ customerId, eventType, timestamp, properties } = {}) {
    assertNonEmptyString(customerId, 'customerId');
    assertNonEmptyString(eventType, 'eventType');
    const ts = timestamp == null ? this._now().getTime() : toTs(timestamp);
    const props = properties && typeof properties === 'object' ? { ...properties } : {};
    const stageHint =
      props.stage ||
      (EVENT_TYPES[eventType] && EVENT_TYPES[eventType].stage) ||
      null;

    const ev = {
      customerId,
      eventType,
      ts,
      timestamp: new Date(ts).toISOString(),
      stage: stageHint,
      journeyId: props.journeyId || 'customer_lifecycle',
      properties: freezeDeep(props),
    };
    this._store.addEvent(ev);
    return ev;
  }

  getEvents(customerId, journeyId) {
    const all = customerId
      ? this._store.eventsFor(customerId)
      : this._store.allEvents();
    const filtered = journeyId ? all.filter((e) => e.journeyId === journeyId) : all.slice();
    return filtered.sort((a, b) => a.ts - b.ts);
  }

  // ── stage resolution ──────────────────────────────────────────────────
  _resolveStageOfEvent(event, journey) {
    if (!journey) return null;
    if (event.stage && journey.stages.find((s) => s.id === event.stage)) {
      return event.stage;
    }
    // fallback: find by trigger membership
    for (const s of journey.stages) {
      if (s.triggers.includes(event.eventType)) return s.id;
    }
    return null;
  }

  _stageSequence(customerId, journeyId) {
    const journey = this._store.getJourney(journeyId);
    if (!journey) return { journey: null, entries: [] };
    const events = this.getEvents(customerId, journeyId);
    const entries = [];
    let lastStage = null;
    for (const ev of events) {
      const sid = this._resolveStageOfEvent(ev, journey);
      if (!sid) continue;
      if (sid !== lastStage) {
        entries.push({ stageId: sid, enteredAt: ev.ts, eventType: ev.eventType });
        lastStage = sid;
      }
    }
    return { journey, entries, events };
  }

  currentStage(customerId, journeyId) {
    const { journey, entries } = this._stageSequence(customerId, journeyId);
    if (!journey || entries.length === 0) return null;
    const last = entries[entries.length - 1];
    const stage = journey.stages.find((s) => s.id === last.stageId);
    return {
      journeyId,
      stageId: stage.id,
      name_he: stage.name_he,
      name_en: stage.name_en,
      enteredAt: new Date(last.enteredAt).toISOString(),
      enteredFromEvent: last.eventType,
    };
  }

  journeyDuration(customerId, journeyId) {
    const { journey, entries } = this._stageSequence(customerId, journeyId);
    if (!journey || entries.length === 0) return 0;
    const first = entries[0].enteredAt;
    const last = this._now().getTime();
    return Math.max(0, last - first);
  }

  stageTimes(customerId, journeyId) {
    const { journey, entries } = this._stageSequence(customerId, journeyId);
    const out = {};
    if (!journey || entries.length === 0) return out;
    const nowMs = this._now().getTime();
    for (let i = 0; i < entries.length; i++) {
      const start = entries[i].enteredAt;
      const end = i + 1 < entries.length ? entries[i + 1].enteredAt : nowMs;
      const dur = Math.max(0, end - start);
      out[entries[i].stageId] = (out[entries[i].stageId] || 0) + dur;
    }
    return out;
  }

  // ── funnel / abandonment / cohort metrics ─────────────────────────────
  _allCustomerIds(journeyId) {
    const set = new Set();
    const events = this._store.allEvents();
    for (const e of events) {
      if (!journeyId || e.journeyId === journeyId) set.add(e.customerId);
    }
    return Array.from(set);
  }

  conversionFunnel(journeyId) {
    const journey = this._store.getJourney(journeyId);
    if (!journey) throw new Error(`unknown journey: ${journeyId}`);
    const customers = this._allCustomerIds(journeyId);
    const counts = new Array(journey.stages.length).fill(0);
    for (const c of customers) {
      const { entries } = this._stageSequence(c, journeyId);
      const reached = new Set(entries.map((e) => e.stageId));
      journey.stages.forEach((s, i) => {
        if (reached.has(s.id)) counts[i] += 1;
      });
    }
    const rows = journey.stages.map((s, i) => ({
      stageId: s.id,
      name_he: s.name_he,
      name_en: s.name_en,
      reached: counts[i],
      fromPrev: i === 0 ? null : pct(counts[i], counts[i - 1] || 0),
      fromTop: pct(counts[i], counts[0] || 0),
    }));
    return {
      journeyId,
      totalCustomers: customers.length,
      stages: rows,
    };
  }

  abandonment({ journeyId, period } = {}) {
    const journey = this._store.getJourney(journeyId);
    if (!journey) throw new Error(`unknown journey: ${journeyId}`);
    const [from, to] = normalizePeriod(period);
    const customers = this._allCustomerIds(journeyId);
    const stageDrops = {};
    journey.stages.forEach((s) => { stageDrops[s.id] = 0; });
    const terminal = journey.stages[journey.stages.length - 1].id;

    const nowMs = this._now().getTime();
    for (const c of customers) {
      const { entries } = this._stageSequence(c, journeyId);
      if (entries.length === 0) continue;
      const last = entries[entries.length - 1];
      if (last.stageId === terminal) continue;
      const lastEventTs = entries[entries.length - 1].enteredAt;
      if (lastEventTs < from || lastEventTs > to) continue;

      const stageDef = journey.stages.find((s) => s.id === last.stageId);
      const expected = stageDef.expectedDuration || days(30);
      if (nowMs - lastEventTs > expected * 2) {
        stageDrops[last.stageId] += 1;
      }
    }
    return {
      journeyId,
      period: { from: new Date(from).toISOString(), to: new Date(to).toISOString() },
      stages: journey.stages.map((s) => ({
        stageId: s.id,
        name_he: s.name_he,
        name_en: s.name_en,
        dropped: stageDrops[s.id],
      })),
      total: Object.values(stageDrops).reduce((a, b) => a + b, 0),
    };
  }

  heatmapEvents({ journeyId, period } = {}) {
    const journey = this._store.getJourney(journeyId);
    if (!journey) throw new Error(`unknown journey: ${journeyId}`);
    const [from, to] = normalizePeriod(period);
    const rows = new Map();
    for (const s of journey.stages) rows.set(s.id, {});
    const events = this._store.allEvents();
    for (const e of events) {
      if (e.journeyId !== journeyId) continue;
      if (e.ts < from || e.ts > to) continue;
      const sid = this._resolveStageOfEvent(e, journey);
      if (!sid) continue;
      const bucket = rows.get(sid);
      bucket[e.eventType] = (bucket[e.eventType] || 0) + 1;
    }
    const matrix = journey.stages.map((s) => ({
      stageId: s.id,
      name_he: s.name_he,
      name_en: s.name_en,
      events: rows.get(s.id),
      total: Object.values(rows.get(s.id)).reduce((a, b) => a + b, 0),
    }));
    return {
      journeyId,
      period: { from: new Date(from).toISOString(), to: new Date(to).toISOString() },
      matrix,
    };
  }

  anomalyDetection({ customerId, journeyId } = {}) {
    const journey = this._store.getJourney(journeyId);
    if (!journey) throw new Error(`unknown journey: ${journeyId}`);
    const { entries } = this._stageSequence(customerId, journeyId);
    const anomalies = [];
    const order = new Map(journey.stages.map((s, i) => [s.id, i]));
    for (let i = 1; i < entries.length; i++) {
      const prev = order.get(entries[i - 1].stageId);
      const cur = order.get(entries[i].stageId);
      if (cur < prev) {
        anomalies.push({
          type: 'backtrack',
          label_he: LABELS.anomalies.backtrack.he,
          label_en: LABELS.anomalies.backtrack.en,
          from: entries[i - 1].stageId,
          to: entries[i].stageId,
          at: new Date(entries[i].enteredAt).toISOString(),
        });
      } else if (cur - prev > 1) {
        anomalies.push({
          type: 'skip',
          label_he: LABELS.anomalies.skip.he,
          label_en: LABELS.anomalies.skip.en,
          from: entries[i - 1].stageId,
          to: entries[i].stageId,
          skipped: journey.stages.slice(prev + 1, cur).map((s) => s.id),
          at: new Date(entries[i].enteredAt).toISOString(),
        });
      }
    }
    // stall on last stage
    if (entries.length > 0) {
      const last = entries[entries.length - 1];
      const stageDef = journey.stages.find((s) => s.id === last.stageId);
      const nowMs = this._now().getTime();
      const elapsed = nowMs - last.enteredAt;
      const expected = stageDef.expectedDuration || days(30);
      if (stageDef.id !== journey.stages[journey.stages.length - 1].id && elapsed > expected * 2) {
        anomalies.push({
          type: 'stall',
          label_he: LABELS.anomalies.stall.he,
          label_en: LABELS.anomalies.stall.en,
          stageId: last.stageId,
          elapsed,
          expected,
          at: new Date(last.enteredAt).toISOString(),
        });
      }
    }
    return { customerId, journeyId, anomalies };
  }

  compareCohorts({ cohortA, cohortB } = {}) {
    if (!cohortA || !cohortB) throw new Error('cohortA and cohortB required');
    const summarize = (cohort) => {
      const list = Array.isArray(cohort.customerIds) ? cohort.customerIds : [];
      const journeyId = cohort.journeyId || 'customer_lifecycle';
      const journey = this._store.getJourney(journeyId);
      if (!journey) throw new Error(`unknown journey: ${journeyId}`);
      const stageCounts = {};
      journey.stages.forEach((s) => { stageCounts[s.id] = 0; });
      let totalDuration = 0;
      let reachedLast = 0;
      for (const c of list) {
        const { entries } = this._stageSequence(c, journeyId);
        for (const e of entries) stageCounts[e.stageId] += 1;
        totalDuration += this.journeyDuration(c, journeyId);
        if (
          entries.length > 0 &&
          entries[entries.length - 1].stageId ===
            journey.stages[journey.stages.length - 1].id
        ) reachedLast += 1;
      }
      return {
        label: cohort.label || 'cohort',
        size: list.length,
        avgDuration: list.length ? Math.round(totalDuration / list.length) : 0,
        completion: pct(reachedLast, list.length),
        stageCounts,
      };
    };
    const a = summarize(cohortA);
    const b = summarize(cohortB);
    return {
      cohortA: a,
      cohortB: b,
      delta: {
        size: b.size - a.size,
        avgDuration: b.avgDuration - a.avgDuration,
        completion: round1(b.completion - a.completion),
      },
    };
  }

  predictNextStage(customerId, journeyId) {
    const journey = this._store.getJourney(journeyId);
    if (!journey) throw new Error(`unknown journey: ${journeyId}`);
    const { entries } = this._stageSequence(customerId, journeyId);
    if (entries.length === 0) {
      return { nextStageId: journey.stages[0].id, confidence: 0, basis: 'no_events' };
    }
    const current = entries[entries.length - 1].stageId;
    const idx = journey.stages.findIndex((s) => s.id === current);
    if (idx === -1 || idx === journey.stages.length - 1) {
      return { nextStageId: null, confidence: 0, basis: 'terminal' };
    }
    // look at every other customer who reached `current` — what fraction advanced
    // and to which stage.
    const customers = this._allCustomerIds(journeyId).filter((c) => c !== customerId);
    let reached = 0;
    const nextCounts = {};
    for (const c of customers) {
      const { entries: e2 } = this._stageSequence(c, journeyId);
      for (let i = 0; i < e2.length; i++) {
        if (e2[i].stageId === current) {
          reached += 1;
          if (i + 1 < e2.length) {
            const nxt = e2[i + 1].stageId;
            nextCounts[nxt] = (nextCounts[nxt] || 0) + 1;
          }
          break;
        }
      }
    }
    let best = journey.stages[idx + 1].id;
    let bestCount = 0;
    for (const k of Object.keys(nextCounts)) {
      if (nextCounts[k] > bestCount) { best = k; bestCount = nextCounts[k]; }
    }
    const confidence = reached === 0 ? 0 : Math.round((bestCount / reached) * 100) / 100;
    return {
      nextStageId: best,
      confidence,
      basis: reached === 0 ? 'default_next' : `${reached}_peer_trajectories`,
      candidates: nextCounts,
    };
  }

  interventionPoints(journeyId) {
    const journey = this._store.getJourney(journeyId);
    if (!journey) throw new Error(`unknown journey: ${journeyId}`);
    const customers = this._allCustomerIds(journeyId);
    const stalls = {};
    journey.stages.forEach((s) => { stalls[s.id] = { count: 0, total_elapsed: 0 }; });
    const nowMs = this._now().getTime();
    for (const c of customers) {
      const { entries } = this._stageSequence(c, journeyId);
      if (entries.length === 0) continue;
      const last = entries[entries.length - 1];
      const stageDef = journey.stages.find((s) => s.id === last.stageId);
      const expected = stageDef.expectedDuration || days(30);
      const elapsed = nowMs - last.enteredAt;
      if (elapsed > expected * 1.5 && last.stageId !== journey.stages[journey.stages.length - 1].id) {
        stalls[last.stageId].count += 1;
        stalls[last.stageId].total_elapsed += elapsed;
      }
    }
    const list = journey.stages
      .filter((s) => stalls[s.id].count > 0)
      .map((s) => ({
        stageId: s.id,
        name_he: s.name_he,
        name_en: s.name_en,
        stalled_count: stalls[s.id].count,
        avg_elapsed: Math.round(stalls[s.id].total_elapsed / stalls[s.id].count),
        severity: stalls[s.id].count >= 5 ? 'high'
          : stalls[s.id].count >= 2 ? 'medium' : 'low',
      }))
      .sort((a, b) => b.stalled_count - a.stalled_count);
    return { journeyId, interventions: list };
  }

  npsPerStage(journeyId) {
    const journey = this._store.getJourney(journeyId);
    if (!journey) throw new Error(`unknown journey: ${journeyId}`);
    const accum = {};
    journey.stages.forEach((s) => {
      accum[s.id] = { promoters: 0, passives: 0, detractors: 0, total: 0, sum: 0 };
    });
    // Find NPS response events. For each customer, attribute the response to
    // whichever stage the customer was in at the time of the response.
    const events = this._store.allEvents().filter(
      (e) => e.journeyId === journeyId && e.eventType === 'nps_response',
    );
    for (const ev of events) {
      const score = Number((ev.properties && ev.properties.score) || NaN);
      if (!Number.isFinite(score)) continue;
      const stageId = this._stageAtTime(ev.customerId, journeyId, ev.ts) || journey.stages[0].id;
      if (!accum[stageId]) continue;
      accum[stageId].total += 1;
      accum[stageId].sum += score;
      if (score >= 9) accum[stageId].promoters += 1;
      else if (score >= 7) accum[stageId].passives += 1;
      else accum[stageId].detractors += 1;
    }
    return {
      journeyId,
      stages: journey.stages.map((s) => {
        const a = accum[s.id];
        const nps = a.total === 0 ? null
          : Math.round(((a.promoters - a.detractors) / a.total) * 100);
        const avg = a.total === 0 ? null : round1(a.sum / a.total);
        return {
          stageId: s.id,
          name_he: s.name_he,
          name_en: s.name_en,
          responses: a.total,
          promoters: a.promoters,
          passives: a.passives,
          detractors: a.detractors,
          nps,
          avgScore: avg,
        };
      }),
    };
  }

  _stageAtTime(customerId, journeyId, ts) {
    const { entries } = this._stageSequence(customerId, journeyId);
    let current = null;
    for (const e of entries) {
      if (e.enteredAt <= ts) current = e.stageId;
      else break;
    }
    return current;
  }

  // ── SVG generation ────────────────────────────────────────────────────
  generateJourneyMap(journeyId) {
    const journey = this._store.getJourney(journeyId);
    if (!journey) throw new Error(`unknown journey: ${journeyId}`);
    const funnel = this.conversionFunnel(journeyId);
    const stages = funnel.stages;
    const n = stages.length;

    const boxW = 160;
    const boxH = 90;
    const gapX = 50;
    const padL = 40;
    const padT = 120;
    const width = padL * 2 + n * boxW + (n - 1) * gapX;
    const height = padT + boxH + 160;

    const parts = [];
    parts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Arial, Helvetica, sans-serif">`,
    );
    parts.push('<defs>');
    parts.push('<linearGradient id="stageFill" x1="0%" y1="0%" x2="0%" y2="100%">');
    parts.push('<stop offset="0%" stop-color="#e3f2fd"/>');
    parts.push('<stop offset="100%" stop-color="#bbdefb"/>');
    parts.push('</linearGradient>');
    parts.push('<marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">');
    parts.push('<path d="M 0 0 L 10 5 L 0 10 z" fill="#1976d2"/>');
    parts.push('</marker>');
    parts.push('</defs>');

    // title bilingual
    parts.push(
      `<text x="${width / 2}" y="32" text-anchor="middle" font-size="22" font-weight="bold" fill="#0d47a1">${xmlEscape(journey.name_en)} — ${xmlEscape(journey.name_he)}</text>`,
    );
    parts.push(
      `<text x="${width / 2}" y="58" text-anchor="middle" font-size="14" fill="#555">${xmlEscape(LABELS.headers.journey.en)} / ${xmlEscape(LABELS.headers.journey.he)}  |  ${funnel.totalCustomers} ${xmlEscape(LABELS.legend.customers.en)} / ${xmlEscape(LABELS.legend.customers.he)}</text>`,
    );
    parts.push(
      `<text x="${width / 2}" y="82" text-anchor="middle" font-size="12" fill="#777">v${journey.version} — ${xmlEscape(journey.createdAt)}</text>`,
    );

    // draw each stage box
    for (let i = 0; i < n; i++) {
      const s = stages[i];
      const x = padL + i * (boxW + gapX);
      const y = padT;
      parts.push(
        `<rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="10" ry="10" fill="url(#stageFill)" stroke="#1976d2" stroke-width="2"/>`,
      );
      parts.push(
        `<text x="${x + boxW / 2}" y="${y + 28}" text-anchor="middle" font-size="15" font-weight="bold" fill="#0d47a1">${xmlEscape(s.name_en)}</text>`,
      );
      parts.push(
        `<text x="${x + boxW / 2}" y="${y + 48}" text-anchor="middle" font-size="15" font-weight="bold" fill="#0d47a1" direction="rtl">${xmlEscape(s.name_he)}</text>`,
      );
      parts.push(
        `<text x="${x + boxW / 2}" y="${y + 70}" text-anchor="middle" font-size="12" fill="#333">${s.reached} ${xmlEscape(LABELS.legend.customers.en)}</text>`,
      );
      // index / dot
      parts.push(
        `<circle cx="${x + 18}" cy="${y + 18}" r="12" fill="#1976d2"/>`,
      );
      parts.push(
        `<text x="${x + 18}" y="${y + 22}" text-anchor="middle" font-size="12" font-weight="bold" fill="#fff">${i + 1}</text>`,
      );

      // arrow + conversion label between stages
      if (i < n - 1) {
        const x1 = x + boxW;
        const x2 = x + boxW + gapX;
        const midY = y + boxH / 2;
        parts.push(
          `<line x1="${x1}" y1="${midY}" x2="${x2}" y2="${midY}" stroke="#1976d2" stroke-width="2" marker-end="url(#arrow)"/>`,
        );
        const nextPct = stages[i + 1] && stages[i + 1].fromPrev != null ? stages[i + 1].fromPrev : 0;
        parts.push(
          `<text x="${(x1 + x2) / 2}" y="${midY - 8}" text-anchor="middle" font-size="11" fill="#1976d2" font-weight="bold">${nextPct}%</text>`,
        );
      }

      // fromTop label under box
      parts.push(
        `<text x="${x + boxW / 2}" y="${y + boxH + 20}" text-anchor="middle" font-size="11" fill="#555">${s.fromTop}% ${xmlEscape(LABELS.legend.converted.en)}</text>`,
      );
      parts.push(
        `<text x="${x + boxW / 2}" y="${y + boxH + 36}" text-anchor="middle" font-size="11" fill="#555" direction="rtl">${s.fromTop}% ${xmlEscape(LABELS.legend.converted.he)}</text>`,
      );
    }

    // footer legend
    const fy = padT + boxH + 80;
    parts.push(
      `<text x="${padL}" y="${fy}" font-size="12" fill="#333">${xmlEscape(LABELS.headers.conversion.en)} / ${xmlEscape(LABELS.headers.conversion.he)}</text>`,
    );
    parts.push(
      `<text x="${padL}" y="${fy + 20}" font-size="11" fill="#777">Generated ${this._now().toISOString()} · Techno-Kol Uzi Mega-ERP · Journey Mapper AG-Y102</text>`,
    );

    parts.push('</svg>');
    return parts.join('');
  }
}

// ─── helper: period normalization ─────────────────────────────────────────
function normalizePeriod(period) {
  if (!period) return [0, Number.MAX_SAFE_INTEGER];
  const from = period.from != null ? toTs(period.from) : 0;
  const to = period.to != null ? toTs(period.to) : Number.MAX_SAFE_INTEGER;
  return [from, to];
}

module.exports = {
  JourneyMapper,
  STANDARD_JOURNEY,
  STANDARD_STAGES,
  EVENT_TYPES,
  TRIGGERS,
  LABELS,
  createMemoryStore,
  ms,
  seconds,
  minutes,
  hours,
  days,
};
