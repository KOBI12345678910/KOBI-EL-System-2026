/**
 * CSAT — Customer Satisfaction Tracker (Transactional Surveys)
 * Agent Y-093 / Techno-Kol Uzi mega-ERP 2026
 *
 * Rule: "לא מוחקים רק משדרגים ומגדלים"
 *   — responses are never deleted, only superseded/upgraded.
 *
 * Zero dependencies. Pure JavaScript (Node.js). No file I/O, no HTTP,
 * no timers, no external DB. Everything is deterministic and
 * offline-friendly.
 *
 * Overview
 * ────────
 * CSAT measures customer satisfaction for a specific interaction
 * (transaction-based), unlike NPS which is relationship-based.
 *
 * Industry formula (5-star / 1-5 scale):
 *   CSAT% = (count of ratings >= satisfactionThreshold) / total * 100
 *   Default threshold = 4 (i.e. 4 or 5 out of 5 is "satisfied").
 *
 * Benchmarks (industry rule of thumb):
 *   < 70%   — poor     (נמוך)
 *   70-80%  — fair     (סביר)
 *   80-90%  — good     (טוב)
 *   >= 90%  — excellent (מצוין)
 *
 * A rating of 4/5 is considered "good" and 5/5 is "excellent".
 *
 * Customer Effort Score (CES):
 *   CES asks "how easy was it to interact with us?" on a 1..7 scale.
 *   CES_score = average(effortRating). Lower is better.
 *   Simple normalized form: CES_100 = ((7 - avg) / 6) * 100.
 *
 * Public API
 * ──────────
 *   new CSATTracker(options?)
 *     Constructs an in-memory tracker. Optional `options` may override
 *     `satisfactionThreshold` (default 4), `maxRating` (default 5) and
 *     `clock` (used only by `triggerSurvey`, defaults to a deterministic
 *     counter so tests are fully reproducible).
 *
 *   .triggerSurvey({ event, customerId, triggerData })
 *     Creates a new survey invitation bound to a business event. Returns
 *     { surveyId, format, questions, expectedQuestions, sentAt }.
 *     Supported events:
 *       - 'ticket-closed'       (support ticket resolved)
 *       - 'order-delivered'     (purchase order delivered)
 *       - 'project-completed'   (construction/consulting project done)
 *       - 'install-completed'   (on-site installation done)
 *
 *   .surveyFormat({ type })
 *     Returns a declarative UI description for one of:
 *       - '5-star'         (stars — emoji/SVG)
 *       - '1-5-scale'      (numeric 1..5)
 *       - 'thumbs'         (thumbs up/down → 5 or 1)
 *       - 'emoji'          (1..5 face emojis)
 *       - 'detailed-matrix' (overall + N aspects)
 *
 *   .recordResponse({ surveyId, customerId, rating, feedback,
 *                     specificAspects, effortRating, touchpoint,
 *                     product, channel, agent, region, submittedAt })
 *     Records a response. `rating` MUST be in 1..maxRating. Returns the
 *     stored response (immutable snapshot).
 *
 *   .computeCSAT({ period, filter })
 *     Returns {
 *       total, satisfied, neutral, dissatisfied,
 *       csat,                     // 0..100 %
 *       average,                  // mean rating
 *       satisfactionThreshold,    // the threshold used
 *       band,                     // 'poor'|'fair'|'good'|'excellent'
 *     }
 *     `period` is { from?, to? } (ISO strings or Date). `filter` is an
 *     object whose keys must match the response (event, product, channel,
 *     agent, region, customerId, touchpoint).
 *
 *   .ces({ period, filter })
 *     Returns { count, average, cesNormalized, easy, hard }.
 *
 *   .segmentByTouchpoint(period)
 *     Returns { byProduct, byChannel, byAgent, byRegion, byEvent }
 *     where every value is a map segment -> computeCSAT result.
 *
 *   .driverAnalysis({ period, filter })
 *     Returns { aspects: [{ aspect, count, avg, correlation, rank }] }
 *     — Pearson correlation of each detailed aspect rating with the
 *     overall rating. Positive correlation ~ "driver of satisfaction".
 *
 *   .actionableInsights()
 *     AI-lite pattern detector. Scans recent low-score responses
 *     (ratings <= 2), groups them by keyword (from feedback) × segment,
 *     and returns { patterns: [{ segment, keyword, count, examples }] }.
 *
 *   .alertLowSatisfaction({ threshold })
 *     Returns { alerts: [ { surveyId, customerId, rating, at, severity } ] }
 *     for every response at-or-below the given threshold (default 2).
 *
 *   .linkToNPS(customerId)
 *     Compares a customer's CSAT history with their NPS record (loaded
 *     via `setNPS`). Returns { csatAverage, nps, gap, alignment }.
 *     Alignment buckets: 'aligned' | 'csat-higher' | 'nps-higher'.
 *
 *   .reportingDashboard(period)
 *     Bilingual (he + en) dashboard payload ready for the UI layer.
 *
 *   .setNPS(customerId, npsScore)
 *     Test/integration helper: attaches an NPS (0..10) for a customer.
 *
 *   .responses
 *     Read-only view (copy) of all stored responses.
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════════ */
/*  0. CONSTANTS — events, survey types, bands, glossary                  */
/* ═══════════════════════════════════════════════════════════════════════ */

const MODULE_VERSION = 'Y093.1.0';

const EVENT_TICKET_CLOSED      = 'ticket-closed';
const EVENT_ORDER_DELIVERED    = 'order-delivered';
const EVENT_PROJECT_COMPLETED  = 'project-completed';
const EVENT_INSTALL_COMPLETED  = 'install-completed';

const EVENTS = Object.freeze([
  EVENT_TICKET_CLOSED,
  EVENT_ORDER_DELIVERED,
  EVENT_PROJECT_COMPLETED,
  EVENT_INSTALL_COMPLETED,
]);

const FORMAT_FIVE_STAR        = '5-star';
const FORMAT_ONE_TO_FIVE      = '1-5-scale';
const FORMAT_THUMBS           = 'thumbs';
const FORMAT_EMOJI            = 'emoji';
const FORMAT_DETAILED_MATRIX  = 'detailed-matrix';

const FORMATS = Object.freeze([
  FORMAT_FIVE_STAR,
  FORMAT_ONE_TO_FIVE,
  FORMAT_THUMBS,
  FORMAT_EMOJI,
  FORMAT_DETAILED_MATRIX,
]);

const DEFAULT_FORMAT_FOR_EVENT = Object.freeze({
  [EVENT_TICKET_CLOSED]:      FORMAT_EMOJI,
  [EVENT_ORDER_DELIVERED]:    FORMAT_FIVE_STAR,
  [EVENT_PROJECT_COMPLETED]:  FORMAT_DETAILED_MATRIX,
  [EVENT_INSTALL_COMPLETED]:  FORMAT_DETAILED_MATRIX,
});

const BAND_POOR      = 'poor';
const BAND_FAIR      = 'fair';
const BAND_GOOD      = 'good';
const BAND_EXCELLENT = 'excellent';

const BAND_LABELS_HE = Object.freeze({
  [BAND_POOR]:      'נמוך',
  [BAND_FAIR]:      'סביר',
  [BAND_GOOD]:      'טוב',
  [BAND_EXCELLENT]: 'מצוין',
});

const BAND_LABELS_EN = Object.freeze({
  [BAND_POOR]:      'Poor',
  [BAND_FAIR]:      'Fair',
  [BAND_GOOD]:      'Good',
  [BAND_EXCELLENT]: 'Excellent',
});

const EVENT_LABELS_HE = Object.freeze({
  [EVENT_TICKET_CLOSED]:     'סגירת קריאת שירות',
  [EVENT_ORDER_DELIVERED]:   'משלוח הזמנה',
  [EVENT_PROJECT_COMPLETED]: 'סיום פרויקט',
  [EVENT_INSTALL_COMPLETED]: 'סיום התקנה',
});

const EVENT_LABELS_EN = Object.freeze({
  [EVENT_TICKET_CLOSED]:     'Ticket Closed',
  [EVENT_ORDER_DELIVERED]:   'Order Delivered',
  [EVENT_PROJECT_COMPLETED]: 'Project Completed',
  [EVENT_INSTALL_COMPLETED]: 'Install Completed',
});

/**
 * Bilingual glossary — every concept gets an explicit he/en label so the
 * UI layer never has to guess.
 */
const GLOSSARY = Object.freeze({
  csat:        { he: 'שביעות רצון לקוח', en: 'Customer Satisfaction (CSAT)' },
  ces:         { he: 'מדד המאמץ של הלקוח', en: 'Customer Effort Score (CES)' },
  nps:         { he: 'ציון נאמנות לקוחות', en: 'Net Promoter Score (NPS)' },
  survey:      { he: 'סקר',               en: 'Survey' },
  rating:      { he: 'דירוג',             en: 'Rating' },
  feedback:    { he: 'משוב מילולי',       en: 'Verbal feedback' },
  aspect:      { he: 'היבט',              en: 'Aspect' },
  touchpoint:  { he: 'נקודת מגע',         en: 'Touchpoint' },
  product:     { he: 'מוצר',              en: 'Product' },
  channel:     { he: 'ערוץ',              en: 'Channel' },
  agent:       { he: 'נציג',              en: 'Agent' },
  region:      { he: 'אזור',              en: 'Region' },
  driver:      { he: 'גורם מניע',         en: 'Driver' },
  satisfied:   { he: 'מרוצים',            en: 'Satisfied' },
  neutral:     { he: 'ניטרליים',          en: 'Neutral' },
  dissatisfied:{ he: 'לא מרוצים',         en: 'Dissatisfied' },
  low:         { he: 'דירוג נמוך',        en: 'Low rating' },
  high:        { he: 'דירוג גבוה',        en: 'High rating' },
  alert:       { he: 'התראה',             en: 'Alert' },
  threshold:   { he: 'סף',                en: 'Threshold' },
  pattern:     { he: 'תבנית',             en: 'Pattern' },
  insight:     { he: 'תובנה',             en: 'Insight' },
  easy:        { he: 'קל',                en: 'Easy' },
  hard:        { he: 'קשה',               en: 'Hard' },
  aligned:     { he: 'מיושר',             en: 'Aligned' },
});

/**
 * Benchmarks for the industry band lookup.
 */
const CSAT_BAND_THRESHOLDS = Object.freeze({
  [BAND_EXCELLENT]: 90,
  [BAND_GOOD]:      80,
  [BAND_FAIR]:      70,
  // anything below 70 → poor
});

/**
 * Default satisfaction thresholds — ratings >= this value are counted
 * as "satisfied" in the CSAT calculation. Anchored to maxRating so the
 * tracker also works for 1..7 or 1..10 scales.
 */
const DEFAULT_SATISFACTION_THRESHOLD_BY_MAX = Object.freeze({
  5: 4,
  7: 5,
  10: 7,
});

/**
 * Default bundle of detailed aspects captured per event. The list is
 * always included in the 'detailed-matrix' format; other formats use it
 * only as optional context so `driverAnalysis` has material to chew on.
 */
const DEFAULT_ASPECTS_BY_EVENT = Object.freeze({
  [EVENT_TICKET_CLOSED]: [
    'response-time', 'resolution-quality', 'agent-knowledge', 'ease-of-contact',
  ],
  [EVENT_ORDER_DELIVERED]: [
    'on-time', 'packaging', 'product-quality', 'accuracy',
  ],
  [EVENT_PROJECT_COMPLETED]: [
    'on-time', 'on-budget', 'quality', 'communication', 'safety',
  ],
  [EVENT_INSTALL_COMPLETED]: [
    'tidiness', 'technician-professionalism', 'functionality', 'scheduling',
  ],
});

const ASPECT_LABELS_HE = Object.freeze({
  'response-time':           'זמן תגובה',
  'resolution-quality':      'איכות הפתרון',
  'agent-knowledge':         'ידע הנציג',
  'ease-of-contact':         'נוחות הפנייה',
  'on-time':                 'עמידה בזמנים',
  'packaging':               'אריזה',
  'product-quality':         'איכות המוצר',
  'accuracy':                'דיוק ההזמנה',
  'on-budget':               'עמידה בתקציב',
  'quality':                 'איכות',
  'communication':           'תקשורת',
  'safety':                  'בטיחות',
  'tidiness':                'ניקיון וסדר',
  'technician-professionalism': 'מקצועיות הטכנאי',
  'functionality':           'תפקוד המערכת',
  'scheduling':              'תיאום מועדים',
});

const ASPECT_LABELS_EN = Object.freeze({
  'response-time':           'Response Time',
  'resolution-quality':      'Resolution Quality',
  'agent-knowledge':         'Agent Knowledge',
  'ease-of-contact':         'Ease of Contact',
  'on-time':                 'On Time',
  'packaging':               'Packaging',
  'product-quality':         'Product Quality',
  'accuracy':                'Order Accuracy',
  'on-budget':               'On Budget',
  'quality':                 'Quality',
  'communication':           'Communication',
  'safety':                  'Safety',
  'tidiness':                'Tidiness',
  'technician-professionalism': 'Technician Professionalism',
  'functionality':           'Functionality',
  'scheduling':              'Scheduling',
});

const LOW_RATING_CAP = 2;

/* ═══════════════════════════════════════════════════════════════════════ */
/*  1. HELPERS                                                             */
/* ═══════════════════════════════════════════════════════════════════════ */

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function clampRating(rating, max) {
  if (!isFiniteNumber(rating)) return null;
  const r = Math.round(rating);
  if (r < 1 || r > max) return null;
  return r;
}

function toDate(value) {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inPeriod(response, period) {
  if (!period) return true;
  const at = toDate(response.submittedAt);
  if (!at) return false;
  const from = toDate(period.from);
  const to = toDate(period.to);
  if (from && at < from) return false;
  if (to && at > to) return false;
  return true;
}

function matchesFilter(response, filter) {
  if (!filter || typeof filter !== 'object') return true;
  for (const key of Object.keys(filter)) {
    const want = filter[key];
    if (want == null) continue;
    if (response[key] !== want) return false;
  }
  return true;
}

function roundTo(value, digits = 2) {
  if (!isFiniteNumber(value)) return 0;
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function bandFromCSAT(csat) {
  if (csat >= CSAT_BAND_THRESHOLDS[BAND_EXCELLENT]) return BAND_EXCELLENT;
  if (csat >= CSAT_BAND_THRESHOLDS[BAND_GOOD])      return BAND_GOOD;
  if (csat >= CSAT_BAND_THRESHOLDS[BAND_FAIR])      return BAND_FAIR;
  return BAND_POOR;
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0;
  for (let i = 0; i < n; i += 1) { sumX += xs[i]; sumY += ys[i]; }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num  += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return 0;
  return num / Math.sqrt(denX * denY);
}

/**
 * Tokenize feedback for the AI-lite pattern detector.
 * - lowercases (safe for Hebrew because JS toLowerCase is a no-op on Hebrew)
 * - splits on whitespace and punctuation
 * - drops very short tokens and a small stop-word set (bilingual)
 */
const STOP_WORDS = new Set([
  // english
  'the', 'and', 'for', 'was', 'with', 'that', 'this', 'not', 'but', 'very',
  'had', 'has', 'have', 'were', 'are', 'you', 'our', 'from', 'they', 'been',
  'into', 'about', 'just', 'too', 'all', 'any', 'out', 'did', 'get',
  // hebrew common particles
  'של', 'את', 'על', 'לא', 'זה', 'הוא', 'היא', 'הם', 'הן', 'כי', 'גם',
  'כל', 'אני', 'אנחנו', 'היה', 'כמו', 'יש', 'אין', 'עם', 'לי', 'לנו',
]);

function tokenize(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

/* ═══════════════════════════════════════════════════════════════════════ */
/*  2. CSATTracker class                                                   */
/* ═══════════════════════════════════════════════════════════════════════ */

class CSATTracker {
  constructor(options = {}) {
    const max = isFiniteNumber(options.maxRating) ? options.maxRating : 5;
    if (max < 2) throw new Error('maxRating must be at least 2');

    this.maxRating = max;
    this.satisfactionThreshold =
      isFiniteNumber(options.satisfactionThreshold)
        ? options.satisfactionThreshold
        : (DEFAULT_SATISFACTION_THRESHOLD_BY_MAX[max] || Math.ceil(max * 0.8));

    // Dissatisfaction threshold: rating <= this is "dissatisfied".
    this.dissatisfactionThreshold =
      isFiniteNumber(options.dissatisfactionThreshold)
        ? options.dissatisfactionThreshold
        : LOW_RATING_CAP;

    // Deterministic counter-based "clock" so triggerSurvey is testable
    // without real time. Consumers can pass a function returning Date-ish.
    this._counter = 0;
    this._clock = typeof options.clock === 'function'
      ? options.clock
      : () => {
          this._counter += 1;
          return new Date(Date.UTC(2026, 0, 1) + this._counter * 1000);
        };

    this._surveys = new Map();         // surveyId -> survey envelope
    this._responses = [];              // append-only array
    this._npsByCustomer = new Map();   // customerId -> { score, at }
    this._alertLog = [];               // append-only alert stream

    Object.defineProperty(this, 'responses', {
      enumerable: true,
      get: () => this._responses.slice(),
    });
  }

  /* ------------------------------------------------------------------ */
  /*  2.1 triggerSurvey                                                  */
  /* ------------------------------------------------------------------ */

  triggerSurvey({ event, customerId, triggerData } = {}) {
    if (!EVENTS.includes(event)) {
      throw new Error(`Unknown event: ${event}. Allowed: ${EVENTS.join(', ')}`);
    }
    if (!customerId) {
      throw new Error('triggerSurvey requires customerId');
    }

    const sentAt = this._clock();
    const id = this._nextSurveyId(event, customerId, sentAt);
    const formatType = DEFAULT_FORMAT_FOR_EVENT[event];
    const aspects = DEFAULT_ASPECTS_BY_EVENT[event] || [];
    const format = this.surveyFormat({ type: formatType });

    const envelope = Object.freeze({
      surveyId: id,
      event,
      customerId,
      triggerData: triggerData ? { ...triggerData } : {},
      format,
      aspects: aspects.slice(),
      sentAt: sentAt instanceof Date ? sentAt.toISOString() : String(sentAt),
      questions: this._questionsForEvent(event, aspects),
      label: {
        he: EVENT_LABELS_HE[event],
        en: EVENT_LABELS_EN[event],
      },
    });

    this._surveys.set(id, envelope);
    return envelope;
  }

  /* ------------------------------------------------------------------ */
  /*  2.2 surveyFormat                                                   */
  /* ------------------------------------------------------------------ */

  surveyFormat({ type } = {}) {
    if (!FORMATS.includes(type)) {
      throw new Error(`Unknown survey format: ${type}. Allowed: ${FORMATS.join(', ')}`);
    }
    switch (type) {
      case FORMAT_FIVE_STAR:
        return Object.freeze({
          type,
          scale: { min: 1, max: 5 },
          values: [1, 2, 3, 4, 5],
          icons: ['★', '★★', '★★★', '★★★★', '★★★★★'],
          label: { he: 'חמישה כוכבים', en: 'Five stars' },
        });
      case FORMAT_ONE_TO_FIVE:
        return Object.freeze({
          type,
          scale: { min: 1, max: 5 },
          values: [1, 2, 3, 4, 5],
          label: { he: 'סולם 1 עד 5', en: '1-5 scale' },
        });
      case FORMAT_THUMBS:
        return Object.freeze({
          type,
          scale: { min: 1, max: 5 },
          values: [1, 5],                 // thumb down -> 1, thumb up -> 5
          icons: ['👎', '👍'],
          label: { he: 'אגודל', en: 'Thumbs' },
        });
      case FORMAT_EMOJI:
        return Object.freeze({
          type,
          scale: { min: 1, max: 5 },
          values: [1, 2, 3, 4, 5],
          icons: ['😡', '😟', '😐', '🙂', '😍'],
          label: { he: 'אימוג\'י', en: 'Emoji' },
        });
      case FORMAT_DETAILED_MATRIX:
        return Object.freeze({
          type,
          scale: { min: 1, max: 5 },
          values: [1, 2, 3, 4, 5],
          hasAspects: true,
          label: { he: 'מטריצה מפורטת', en: 'Detailed matrix' },
        });
      /* istanbul ignore next — unreachable */
      default:
        throw new Error(`Unhandled format: ${type}`);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  2.3 recordResponse                                                 */
  /* ------------------------------------------------------------------ */

  recordResponse(input = {}) {
    const {
      surveyId,
      customerId,
      rating,
      feedback,
      specificAspects,
      effortRating,
      touchpoint,
      product,
      channel,
      agent,
      region,
      submittedAt,
    } = input;

    if (!surveyId) throw new Error('recordResponse requires surveyId');
    if (!customerId) throw new Error('recordResponse requires customerId');

    const r = clampRating(rating, this.maxRating);
    if (r == null) {
      throw new Error(
        `rating must be a number in 1..${this.maxRating}, got ${rating}`
      );
    }

    const survey = this._surveys.get(surveyId) || null;
    const event = survey ? survey.event : (input.event || null);

    // Normalize aspects: allow either a flat {aspect: rating} map or an
    // array of {aspect, rating}. Keep only ratings in the valid range.
    const aspectsMap = {};
    if (specificAspects) {
      if (Array.isArray(specificAspects)) {
        for (const item of specificAspects) {
          if (!item || !item.aspect) continue;
          const ar = clampRating(item.rating, this.maxRating);
          if (ar != null) aspectsMap[item.aspect] = ar;
        }
      } else if (typeof specificAspects === 'object') {
        for (const k of Object.keys(specificAspects)) {
          const ar = clampRating(specificAspects[k], this.maxRating);
          if (ar != null) aspectsMap[k] = ar;
        }
      }
    }

    const submitted = toDate(submittedAt) || this._clock();
    const response = Object.freeze({
      surveyId,
      customerId,
      event,
      rating: r,
      feedback: typeof feedback === 'string' ? feedback : '',
      specificAspects: Object.freeze(aspectsMap),
      effortRating: isFiniteNumber(effortRating) ? effortRating : null,
      touchpoint: touchpoint || (survey ? survey.event : null),
      product: product || null,
      channel: channel || null,
      agent: agent || null,
      region: region || null,
      submittedAt: submitted instanceof Date ? submitted.toISOString() : String(submitted),
      // Internal: reference to the superseded previous response (if any)
      // — we NEVER delete, we only add a new row.
      supersedes: this._findLatestForSurvey(surveyId),
      version: this._countResponsesForSurvey(surveyId) + 1,
    });

    this._responses.push(response);

    if (response.rating <= this.dissatisfactionThreshold) {
      this._alertLog.push(Object.freeze({
        surveyId,
        customerId,
        rating: response.rating,
        at: response.submittedAt,
        severity: response.rating === 1 ? 'critical' : 'high',
      }));
    }

    return response;
  }

  /* ------------------------------------------------------------------ */
  /*  2.4 computeCSAT                                                    */
  /* ------------------------------------------------------------------ */

  computeCSAT({ period, filter } = {}) {
    const rows = this._filterResponses(period, filter);
    const total = rows.length;

    if (total === 0) {
      return Object.freeze({
        total: 0,
        satisfied: 0,
        neutral: 0,
        dissatisfied: 0,
        csat: 0,
        average: 0,
        satisfactionThreshold: this.satisfactionThreshold,
        maxRating: this.maxRating,
        band: BAND_POOR,
      });
    }

    let satisfied = 0;
    let dissatisfied = 0;
    let sum = 0;
    for (const r of rows) {
      sum += r.rating;
      if (r.rating >= this.satisfactionThreshold) satisfied += 1;
      else if (r.rating <= this.dissatisfactionThreshold) dissatisfied += 1;
    }
    const neutral = total - satisfied - dissatisfied;
    const csat = (satisfied / total) * 100;
    const average = sum / total;

    return Object.freeze({
      total,
      satisfied,
      neutral,
      dissatisfied,
      csat: roundTo(csat, 2),
      average: roundTo(average, 3),
      satisfactionThreshold: this.satisfactionThreshold,
      maxRating: this.maxRating,
      band: bandFromCSAT(csat),
    });
  }

  /* ------------------------------------------------------------------ */
  /*  2.5 ces — Customer Effort Score                                    */
  /* ------------------------------------------------------------------ */

  ces({ period, filter } = {}) {
    const rows = this._filterResponses(period, filter)
      .filter((r) => isFiniteNumber(r.effortRating));

    const count = rows.length;
    if (count === 0) {
      return Object.freeze({
        count: 0, average: 0, cesNormalized: 0, easy: 0, hard: 0,
        scaleMax: 7,
      });
    }

    let sum = 0, easy = 0, hard = 0;
    for (const r of rows) {
      sum += r.effortRating;
      if (r.effortRating >= 5) easy += 1;
      else if (r.effortRating <= 3) hard += 1;
    }
    const avg = sum / count;
    // Normalized 0..100 — higher is easier (better).
    const normalized = ((avg - 1) / 6) * 100;

    return Object.freeze({
      count,
      average: roundTo(avg, 3),
      cesNormalized: roundTo(normalized, 2),
      easy,
      hard,
      scaleMax: 7,
    });
  }

  /* ------------------------------------------------------------------ */
  /*  2.6 segmentByTouchpoint                                            */
  /* ------------------------------------------------------------------ */

  segmentByTouchpoint(period) {
    const rows = this._filterResponses(period, null);
    const byProduct = {};
    const byChannel = {};
    const byAgent = {};
    const byRegion = {};
    const byEvent = {};

    for (const r of rows) {
      if (r.product) (byProduct[r.product] = byProduct[r.product] || []).push(r);
      if (r.channel) (byChannel[r.channel] = byChannel[r.channel] || []).push(r);
      if (r.agent)   (byAgent[r.agent]     = byAgent[r.agent]     || []).push(r);
      if (r.region)  (byRegion[r.region]   = byRegion[r.region]   || []).push(r);
      if (r.event)   (byEvent[r.event]     = byEvent[r.event]     || []).push(r);
    }

    const toSummary = (map) => {
      const out = {};
      for (const key of Object.keys(map)) {
        out[key] = this._summarize(map[key]);
      }
      return out;
    };

    return Object.freeze({
      byProduct: Object.freeze(toSummary(byProduct)),
      byChannel: Object.freeze(toSummary(byChannel)),
      byAgent:   Object.freeze(toSummary(byAgent)),
      byRegion:  Object.freeze(toSummary(byRegion)),
      byEvent:   Object.freeze(toSummary(byEvent)),
    });
  }

  /* ------------------------------------------------------------------ */
  /*  2.7 driverAnalysis                                                 */
  /* ------------------------------------------------------------------ */

  driverAnalysis({ period, filter } = {}) {
    const rows = this._filterResponses(period, filter);
    const aspectBuckets = new Map();    // aspect -> { xs, ys }

    for (const r of rows) {
      const aspects = r.specificAspects || {};
      for (const key of Object.keys(aspects)) {
        const bucket = aspectBuckets.get(key) || { xs: [], ys: [] };
        bucket.xs.push(aspects[key]);   // aspect rating
        bucket.ys.push(r.rating);       // overall rating
        aspectBuckets.set(key, bucket);
      }
    }

    const aspects = [];
    for (const [aspect, bucket] of aspectBuckets.entries()) {
      const count = bucket.xs.length;
      const avg = count > 0
        ? bucket.xs.reduce((a, b) => a + b, 0) / count
        : 0;
      const correlation = pearson(bucket.xs, bucket.ys);
      aspects.push({
        aspect,
        label: {
          he: ASPECT_LABELS_HE[aspect] || aspect,
          en: ASPECT_LABELS_EN[aspect] || aspect,
        },
        count,
        avg: roundTo(avg, 3),
        correlation: roundTo(correlation, 4),
      });
    }

    // Rank by correlation desc — strongest positive drivers first.
    aspects.sort((a, b) => b.correlation - a.correlation);
    for (let i = 0; i < aspects.length; i += 1) {
      aspects[i].rank = i + 1;
    }
    return Object.freeze({ aspects });
  }

  /* ------------------------------------------------------------------ */
  /*  2.8 actionableInsights                                             */
  /* ------------------------------------------------------------------ */

  actionableInsights() {
    const low = this._responses
      .filter((r) => r.rating <= this.dissatisfactionThreshold);

    if (low.length === 0) {
      return Object.freeze({ patterns: [], totalLow: 0 });
    }

    // Group by keyword × segment (agent/product/channel preferred)
    const counts = new Map();
    for (const r of low) {
      const segments = [];
      if (r.agent)   segments.push(['agent',   r.agent]);
      if (r.product) segments.push(['product', r.product]);
      if (r.channel) segments.push(['channel', r.channel]);
      if (r.region)  segments.push(['region',  r.region]);
      if (segments.length === 0) segments.push(['overall', 'overall']);

      const keywords = tokenize(r.feedback);
      if (keywords.length === 0) keywords.push('__no_feedback__');

      for (const [dim, seg] of segments) {
        for (const kw of keywords) {
          const key = `${dim}|${seg}|${kw}`;
          const bucket = counts.get(key) || {
            dimension: dim,
            segment: seg,
            keyword: kw,
            count: 0,
            examples: [],
          };
          bucket.count += 1;
          if (bucket.examples.length < 3) {
            bucket.examples.push({
              surveyId: r.surveyId,
              customerId: r.customerId,
              rating: r.rating,
            });
          }
          counts.set(key, bucket);
        }
      }
    }

    const patterns = Array.from(counts.values())
      .filter((p) => p.count >= 2 && p.keyword !== '__no_feedback__')
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.keyword.localeCompare(b.keyword);
      });

    return Object.freeze({
      patterns: patterns.slice(0, 10),
      totalLow: low.length,
    });
  }

  /* ------------------------------------------------------------------ */
  /*  2.9 alertLowSatisfaction                                           */
  /* ------------------------------------------------------------------ */

  alertLowSatisfaction({ threshold } = {}) {
    const limit = isFiniteNumber(threshold) ? threshold : LOW_RATING_CAP;
    const alerts = this._responses
      .filter((r) => r.rating <= limit)
      .map((r) => Object.freeze({
        surveyId: r.surveyId,
        customerId: r.customerId,
        rating: r.rating,
        event: r.event,
        at: r.submittedAt,
        severity: r.rating === 1 ? 'critical' : 'high',
        feedback: r.feedback || '',
      }));

    return Object.freeze({
      threshold: limit,
      count: alerts.length,
      alerts,
    });
  }

  /* ------------------------------------------------------------------ */
  /*  2.10 linkToNPS                                                     */
  /* ------------------------------------------------------------------ */

  setNPS(customerId, npsScore, at) {
    if (!customerId) throw new Error('setNPS requires customerId');
    const score = isFiniteNumber(npsScore) ? npsScore : null;
    if (score == null || score < 0 || score > 10) {
      throw new Error('NPS score must be in 0..10');
    }
    this._npsByCustomer.set(customerId, {
      score,
      at: toDate(at) || this._clock(),
    });
  }

  linkToNPS(customerId) {
    const mine = this._responses.filter((r) => r.customerId === customerId);
    const npsRec = this._npsByCustomer.get(customerId) || null;

    if (mine.length === 0 && !npsRec) {
      return Object.freeze({
        customerId,
        csatAverage: 0,
        csatCount: 0,
        nps: null,
        csatNormalized: 0,
        npsNormalized: 0,
        gap: 0,
        alignment: 'unknown',
      });
    }

    const sum = mine.reduce((a, r) => a + r.rating, 0);
    const avg = mine.length > 0 ? sum / mine.length : 0;
    // Normalize CSAT avg to 0..100 using the scale max.
    const csatNorm = mine.length > 0
      ? ((avg - 1) / (this.maxRating - 1)) * 100
      : 0;
    // Normalize NPS 0..10 to 0..100.
    const npsNorm = npsRec ? (npsRec.score / 10) * 100 : 0;
    const gap = roundTo(csatNorm - npsNorm, 2);

    let alignment;
    if (!npsRec || mine.length === 0) {
      alignment = 'unknown';
    } else if (Math.abs(gap) <= 10) {
      alignment = 'aligned';
    } else if (gap > 10) {
      alignment = 'csat-higher';
    } else {
      alignment = 'nps-higher';
    }

    return Object.freeze({
      customerId,
      csatAverage: roundTo(avg, 3),
      csatCount: mine.length,
      nps: npsRec ? npsRec.score : null,
      csatNormalized: roundTo(csatNorm, 2),
      npsNormalized: roundTo(npsNorm, 2),
      gap,
      alignment,
    });
  }

  /* ------------------------------------------------------------------ */
  /*  2.11 reportingDashboard (bilingual)                                */
  /* ------------------------------------------------------------------ */

  reportingDashboard(period) {
    const overall = this.computeCSAT({ period });
    const cesData = this.ces({ period });
    const segments = this.segmentByTouchpoint(period);
    const drivers = this.driverAnalysis({ period });
    const insights = this.actionableInsights();
    const alerts = this.alertLowSatisfaction({ threshold: this.dissatisfactionThreshold });

    return Object.freeze({
      moduleVersion: MODULE_VERSION,
      period: period || null,
      overall,
      ces: cesData,
      segments,
      drivers,
      insights,
      alerts,
      labels: {
        he: {
          title:       'לוח שביעות רצון לקוחות',
          csat:        GLOSSARY.csat.he,
          ces:         GLOSSARY.ces.he,
          totalResponses: 'סך כל התגובות',
          satisfied:   GLOSSARY.satisfied.he,
          neutral:     GLOSSARY.neutral.he,
          dissatisfied:GLOSSARY.dissatisfied.he,
          segments:    'ניתוח פילוחים',
          drivers:     'ניתוח גורמים מניעים',
          insights:    'תובנות פעולה',
          alerts:      'התראות דירוג נמוך',
          band:        BAND_LABELS_HE[overall.band],
        },
        en: {
          title:       'Customer Satisfaction Dashboard',
          csat:        GLOSSARY.csat.en,
          ces:         GLOSSARY.ces.en,
          totalResponses: 'Total responses',
          satisfied:   GLOSSARY.satisfied.en,
          neutral:     GLOSSARY.neutral.en,
          dissatisfied:GLOSSARY.dissatisfied.en,
          segments:    'Segment analysis',
          drivers:     'Driver analysis',
          insights:    'Actionable insights',
          alerts:      'Low-rating alerts',
          band:        BAND_LABELS_EN[overall.band],
        },
      },
    });
  }

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  Private helpers                                                    */
  /* ═══════════════════════════════════════════════════════════════════ */

  _nextSurveyId(event, customerId, sentAt) {
    const prefix = 'SRV';
    const seq = this._surveys.size + 1;
    const epoch = sentAt instanceof Date ? sentAt.getTime() : Date.now();
    return `${prefix}-${event}-${customerId}-${epoch}-${seq}`;
  }

  _questionsForEvent(event, aspects) {
    const primary = {
      id: 'overall',
      text: {
        he: `עד כמה אתם מרוצים מ${EVENT_LABELS_HE[event]}?`,
        en: `How satisfied are you with the ${EVENT_LABELS_EN[event]}?`,
      },
      required: true,
    };
    const follow = aspects.map((a) => ({
      id: `aspect:${a}`,
      text: {
        he: ASPECT_LABELS_HE[a] || a,
        en: ASPECT_LABELS_EN[a] || a,
      },
      required: false,
    }));
    const effort = {
      id: 'effort',
      text: {
        he: 'עד כמה היה קל לסגור את הפנייה?',
        en: 'How easy was it to get your issue handled?',
      },
      required: false,
      scale: { min: 1, max: 7 },
    };
    const verbal = {
      id: 'feedback',
      text: { he: 'הערות נוספות', en: 'Additional feedback' },
      required: false,
      type: 'free-text',
    };
    return [primary, ...follow, effort, verbal];
  }

  _filterResponses(period, filter) {
    return this._responses.filter(
      (r) => inPeriod(r, period) && matchesFilter(r, filter)
    );
  }

  _summarize(rows) {
    if (rows.length === 0) return this.computeCSAT({});

    let satisfied = 0, dissatisfied = 0, sum = 0;
    for (const r of rows) {
      sum += r.rating;
      if (r.rating >= this.satisfactionThreshold) satisfied += 1;
      else if (r.rating <= this.dissatisfactionThreshold) dissatisfied += 1;
    }
    const total = rows.length;
    const neutral = total - satisfied - dissatisfied;
    const csat = (satisfied / total) * 100;
    const avg = sum / total;
    return Object.freeze({
      total,
      satisfied,
      neutral,
      dissatisfied,
      csat: roundTo(csat, 2),
      average: roundTo(avg, 3),
      satisfactionThreshold: this.satisfactionThreshold,
      maxRating: this.maxRating,
      band: bandFromCSAT(csat),
    });
  }

  _findLatestForSurvey(surveyId) {
    for (let i = this._responses.length - 1; i >= 0; i -= 1) {
      if (this._responses[i].surveyId === surveyId) {
        return this._responses[i];
      }
    }
    return null;
  }

  _countResponsesForSurvey(surveyId) {
    let n = 0;
    for (const r of this._responses) if (r.surveyId === surveyId) n += 1;
    return n;
  }
}

/* ═══════════════════════════════════════════════════════════════════════ */
/*  3. Exports                                                             */
/* ═══════════════════════════════════════════════════════════════════════ */

module.exports = {
  CSATTracker,

  // Enums / constants
  EVENTS,
  FORMATS,
  EVENT_TICKET_CLOSED,
  EVENT_ORDER_DELIVERED,
  EVENT_PROJECT_COMPLETED,
  EVENT_INSTALL_COMPLETED,
  FORMAT_FIVE_STAR,
  FORMAT_ONE_TO_FIVE,
  FORMAT_THUMBS,
  FORMAT_EMOJI,
  FORMAT_DETAILED_MATRIX,

  // Bands
  BAND_POOR,
  BAND_FAIR,
  BAND_GOOD,
  BAND_EXCELLENT,
  BAND_LABELS_HE,
  BAND_LABELS_EN,

  // Glossary + labels (exported so the UI layer can reuse them)
  GLOSSARY,
  EVENT_LABELS_HE,
  EVENT_LABELS_EN,
  ASPECT_LABELS_HE,
  ASPECT_LABELS_EN,
  DEFAULT_ASPECTS_BY_EVENT,
  CSAT_BAND_THRESHOLDS,

  // Low-level helpers — exposed primarily for testing & reuse
  bandFromCSAT,
  pearson,
  tokenize,

  MODULE_VERSION,
};
