/**
 * Net Promoter Score (NPS) Survey System  |  מערכת סקרי NPS
 * =============================================================
 *
 * Agent Y-092  |  Techno-Kol Uzi mega-ERP
 * Date: 2026-04-11
 *
 * End-to-end Net Promoter Score subsystem. Creates bilingual
 * surveys, dispatches them over multiple channels (email / SMS /
 * in-app / WhatsApp), records 0-10 responses plus verbatim
 * comments, classifies each respondent as a Promoter (9-10),
 * Passive (7-8) or Detractor (0-6), and reports period NPS using
 * the canonical formula:
 *
 *     NPS = %Promoters − %Detractors
 *
 * Results are returned as an integer in the range [-100, +100].
 *
 * Detractors are fed through a closed-loop recovery workflow:
 * the system creates an immediate follow-up task with a 48-hour
 * SLA, tracks the outcome, and surfaces it in the executive
 * dashboard.
 *
 * Zero dependencies. Pure in-memory, deterministic, append-only.
 * Every label, question and reason is bilingual (Hebrew + English).
 *
 * -------------------------------------------------------------
 * HARD RULE: NEVER DELETE — only upgrade / grow
 * לא מוחקים רק משדרגים ומגדלים
 * -------------------------------------------------------------
 *
 *   - Surveys are versioned: re-defining an id bumps version,
 *     previous revisions stay readable via getSurveyHistory().
 *   - Responses are append-only. There is no `deleteResponse()`.
 *     A respondent may re-submit, but the original response stays
 *     in history and is marked `superseded: true`.
 *   - Closed-loop follow-up records are append-only. An outcome
 *     is added as a new entry; the original trigger is preserved.
 *
 * -------------------------------------------------------------
 * DOMAIN MODEL
 * -------------------------------------------------------------
 *
 *   Survey {
 *     id, version,
 *     name_he, name_en,
 *     audience,                             // free-form segment tag
 *     schedule: { type, params },           // e.g. monthly, post-delivery
 *     channels: string[],                   // email / sms / in-app / whatsapp
 *     trigger: 'transactional'|'relationship'|'event',
 *     question_he, question_en,             // standard 0-10 NPS question
 *     created_at, updated_at
 *   }
 *
 *   Dispatch {
 *     id, survey_id, customer_id, channel,
 *     sent_at, rendered_he, rendered_en
 *   }
 *
 *   Response {
 *     id, survey_id, customer_id,
 *     score,                                // 0..10 integer
 *     bucket: 'promoter'|'passive'|'detractor',
 *     comment, date, superseded,
 *     segment?                              // denormalized for segmentNPS
 *   }
 *
 *   ClosedLoopCase {
 *     id, detractor_id, response_id,
 *     opened_at, due_at,                    // due_at = opened_at + 48h
 *     status: 'open'|'contacted'|'resolved'|'breached',
 *     events: [                             // append-only history
 *       { at, type, by, note_he, note_en, outcome? }
 *     ]
 *   }
 *
 * -------------------------------------------------------------
 * PUBLIC API
 * -------------------------------------------------------------
 *
 *   createSurvey({name_he, name_en, audience, schedule,
 *                 channels, trigger, id?})         → Survey
 *   getSurvey(id, version?)                        → Survey
 *   getSurveyHistory(id)                           → Survey[]
 *   listSurveys()                                  → Survey[]
 *
 *   sendSurvey({customerId, surveyId, channel})    → Dispatch
 *
 *   recordResponse({surveyId, customerId, score,
 *                   comment, date, segment?})      → Response
 *   listResponses(filter?)                         → Response[]
 *
 *   computeNPS({survey, period})                   → NPSReport
 *   segmentNPS({segment, period})                  → NPSReport
 *   trendOverTime(surveyId, options?)              → TrendReport
 *
 *   verbatimAnalysis(comments)                     → ThemeReport
 *
 *   closedLoop({detractorId, responseId?, by?})    → ClosedLoopCase
 *   followupTracking(customerId)                   → FollowupReport
 *   recordFollowupOutcome({caseId, status, ...})   → ClosedLoopCase
 *
 *   benchmarkIndustry({industry})                  → Benchmark
 *   executiveDashboard(period)                     → Dashboard
 *
 * =============================================================
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// Constants — buckets, SLA, channels, triggers
// ─────────────────────────────────────────────────────────────

const BUCKETS = Object.freeze({
  promoter:  { min: 9, max: 10, he: 'ממליצים',      en: 'Promoters'  },
  passive:   { min: 7, max: 8,  he: 'נייטרליים',     en: 'Passives'   },
  detractor: { min: 0, max: 6,  he: 'ממעיטים',      en: 'Detractors' },
});

const CHANNELS = Object.freeze({
  email:    { he: 'אימייל',   en: 'Email'    },
  sms:      { he: 'SMS',      en: 'SMS'      },
  'in-app': { he: 'באפליקציה', en: 'In-app'  },
  whatsapp: { he: 'ווטסאפ',   en: 'WhatsApp' },
});

const TRIGGERS = Object.freeze({
  transactional: { he: 'טרנזקציוני', en: 'Transactional' },
  relationship:  { he: 'מערכתי',     en: 'Relationship'  },
  event:         { he: 'אירועי',      en: 'Event-driven'  },
});

// Closed-loop SLA — 48 hours from first detractor flag.
const CLOSED_LOOP_SLA_HOURS = 48;
const CLOSED_LOOP_SLA_MS    = CLOSED_LOOP_SLA_HOURS * 60 * 60 * 1000;

const CASE_STATUS = Object.freeze({
  open:      { he: 'פתוח',       en: 'Open'      },
  contacted: { he: 'נוצר קשר',   en: 'Contacted' },
  resolved:  { he: 'נסגר',       en: 'Resolved'  },
  breached:  { he: 'חריגת SLA', en: 'Breached'  },
});

// Standard bilingual NPS question (Reichheld's original wording).
const DEFAULT_QUESTION = Object.freeze({
  he: 'עד כמה סביר שתמליץ/י עלינו לחבר או עמית? (0 = בשום אופן לא, 10 = בהחלט כן)',
  en: 'How likely is it that you would recommend us to a friend or colleague? (0 = not at all, 10 = extremely likely)',
});

// Industry benchmarks — published & widely used reference values
// for Techno-Kol Uzi's core industries. Kept bilingual.
// Source mix: Bain & Co, ClearlyRated, Retently 2025 benchmarks.
const INDUSTRY_BENCHMARKS = Object.freeze({
  'metal-fab': {
    he: 'ייצור מתכת / מתכת בהזמנה',
    en: 'Metal fabrication / custom metal',
    low: 20, avg: 38, good: 55, excellent: 70,
  },
  'b2b-manufacturing': {
    he: 'ייצור B2B',
    en: 'B2B Manufacturing',
    low: 23, avg: 41, good: 58, excellent: 72,
  },
  'b2b-services': {
    he: 'שירותים לעסקים',
    en: 'B2B Services',
    low: 25, avg: 45, good: 60, excellent: 75,
  },
  'construction': {
    he: 'בנייה',
    en: 'Construction',
    low: 18, avg: 35, good: 52, excellent: 68,
  },
  'logistics': {
    he: 'לוגיסטיקה',
    en: 'Logistics',
    low: 15, avg: 30, good: 48, excellent: 65,
  },
  'default': {
    he: 'ממוצע תעשייתי',
    en: 'Industry average',
    low: 20, avg: 40, good: 55, excellent: 70,
  },
});

// Verbatim analysis lexicon — zero-dependency bilingual
// keyword → theme mapping with lightweight sentiment tagging.
// Extendable: later agents append themes / keywords, never delete.
const VERBATIM_LEXICON = Object.freeze({
  themes: {
    quality: {
      he: 'איכות',
      en: 'Quality',
      keywords_he: ['איכות', 'איכותי', 'בלאי', 'פגם', 'פגום', 'חריק', 'שבור', 'עמיד'],
      keywords_en: ['quality', 'defect', 'broken', 'durable', 'lasting', 'flaw'],
    },
    price: {
      he: 'מחיר',
      en: 'Price',
      keywords_he: ['מחיר', 'יקר', 'זול', 'עלות', 'תמחור', 'הנחה'],
      keywords_en: ['price', 'expensive', 'cheap', 'cost', 'pricing', 'discount'],
    },
    delivery: {
      he: 'אספקה',
      en: 'Delivery',
      keywords_he: ['אספקה', 'משלוח', 'איחור', 'מהיר', 'זמן', 'מאחר', 'דחוף'],
      keywords_en: ['delivery', 'shipping', 'late', 'fast', 'on time', 'delayed'],
    },
    service: {
      he: 'שירות',
      en: 'Service',
      keywords_he: ['שירות', 'נציג', 'מענה', 'יחס', 'סבלני', 'גס', 'אדיב'],
      keywords_en: ['service', 'support', 'agent', 'rep', 'rude', 'helpful', 'polite'],
    },
    technical: {
      he: 'טכני',
      en: 'Technical',
      keywords_he: ['טכני', 'הנדסה', 'חישוב', 'שרטוט', 'סיבולת', 'סובלנות'],
      keywords_en: ['technical', 'engineering', 'tolerance', 'drawing', 'calc'],
    },
    communication: {
      he: 'תקשורת',
      en: 'Communication',
      keywords_he: ['תקשורת', 'עדכון', 'מייל', 'טלפון', 'חזר', 'לא ענה'],
      keywords_en: ['communication', 'update', 'email', 'phone', 'response', 'ignored'],
    },
  },
  positive_he: ['מעולה', 'מצוין', 'נהדר', 'מרוצה', 'ממליץ', 'שמח', 'תודה', 'אוהב', 'מדהים', 'טוב', 'מהיר'],
  positive_en: ['excellent', 'great', 'amazing', 'love', 'perfect', 'best', 'awesome', 'good', 'fast', 'helpful'],
  negative_he: ['גרוע', 'אכזבה', 'מאכזב', 'רע', 'איטי', 'לא', 'אף פעם', 'בעיה', 'טעות', 'כועס', 'גס', 'מאחר', 'איחור'],
  negative_en: ['bad', 'terrible', 'poor', 'slow', 'never', 'worst', 'angry', 'disappointed', 'problem', 'error', 'late', 'rude', 'delay', 'expensive'],
});

// ─────────────────────────────────────────────────────────────
// Internal helpers — pure, seam-able
// ─────────────────────────────────────────────────────────────

function _now() {
  return new Date();
}

function _iso(d) {
  return (d instanceof Date ? d : new Date(d)).toISOString();
}

function _assert(cond, msgHe, msgEn) {
  if (!cond) {
    const err = new Error(`${msgEn} | ${msgHe}`);
    err.bilingual = { he: msgHe, en: msgEn };
    throw err;
  }
}

function _clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function _classify(score) {
  if (score >= 9) return 'promoter';
  if (score >= 7) return 'passive';
  return 'detractor';
}

function _inPeriod(iso, period) {
  if (!period) return true;
  const t = new Date(iso).getTime();
  if (period.from && t < new Date(period.from).getTime()) return false;
  if (period.to   && t > new Date(period.to).getTime())   return false;
  return true;
}

function _pct(n, d) {
  if (!d) return 0;
  return (n / d) * 100;
}

function _round(n, p = 1) {
  const k = Math.pow(10, p);
  return Math.round(n * k) / k;
}

function _plainLower(s) {
  return String(s || '').toLowerCase();
}

// ─────────────────────────────────────────────────────────────
// NPS System — main class
// ─────────────────────────────────────────────────────────────

class NPSSystem {
  constructor(options = {}) {
    /** @type {Map<string, Array<object>>} surveyId → version history */
    this._surveys = new Map();
    /** @type {Map<string, object>} dispatchId → Dispatch */
    this._dispatches = new Map();
    /** @type {Array<object>} append-only Response log */
    this._responses = [];
    /** @type {Map<string, object>} caseId → ClosedLoopCase */
    this._cases = new Map();
    /** @type {Map<string, string>} customerId → segment */
    this._segments = new Map();

    this._seq = { survey: 0, dispatch: 0, response: 0, case: 0 };
    this._industryBenchmarks = _clone(INDUSTRY_BENCHMARKS);

    if (options.seed !== false) {
      this._seed();
    }
  }

  // ────────────────────────────────────────────────────
  //  Seed (optional) — one default relationship survey
  // ────────────────────────────────────────────────────

  _seed() {
    this.createSurvey({
      id: 'nps-annual-relationship',
      name_he: 'סקר NPS שנתי — לקוחות',
      name_en: 'Annual Relationship NPS',
      audience: 'all-customers',
      schedule: { type: 'annual', params: { month: 1 } },
      channels: ['email', 'in-app'],
      trigger: 'relationship',
    });
  }

  // ────────────────────────────────────────────────────
  //  Survey definition (versioned, never delete)
  // ────────────────────────────────────────────────────

  createSurvey(def) {
    _assert(def && typeof def === 'object',
      'הגדרה חייבת להיות אובייקט', 'definition must be an object');
    _assert(typeof def.name_he === 'string' && def.name_he.length > 0,
      'חסר שם עברי', 'name_he is required');
    _assert(typeof def.name_en === 'string' && def.name_en.length > 0,
      'missing name_en', 'name_en is required');
    _assert(typeof def.audience === 'string' && def.audience.length > 0,
      'חסר קהל יעד', 'audience is required');
    _assert(def.schedule && typeof def.schedule === 'object',
      'חסר לוח זמנים', 'schedule is required');
    _assert(Array.isArray(def.channels) && def.channels.length > 0,
      'חסרים ערוצים', 'channels array is required');
    for (const ch of def.channels) {
      _assert(CHANNELS[ch],
        `ערוץ לא חוקי: ${ch}`, `invalid channel: ${ch}`);
    }
    _assert(typeof def.trigger === 'string' && TRIGGERS[def.trigger],
      `טריגר לא חוקי: ${def.trigger}`, `invalid trigger: ${def.trigger}`);

    const id = def.id || `survey-${++this._seq.survey}`;
    const prev = this._surveys.get(id) || [];
    const version = prev.length + 1;

    const survey = {
      id,
      version,
      name_he: def.name_he,
      name_en: def.name_en,
      audience: def.audience,
      schedule: _clone(def.schedule),
      channels: [...def.channels],
      trigger: def.trigger,
      question_he: def.question_he || DEFAULT_QUESTION.he,
      question_en: def.question_en || DEFAULT_QUESTION.en,
      created_at: prev[0]?.created_at || _iso(_now()),
      updated_at: _iso(_now()),
    };

    prev.push(Object.freeze(survey));
    this._surveys.set(id, prev);
    return _clone(survey);
  }

  getSurvey(id, version) {
    const history = this._surveys.get(id);
    if (!history || history.length === 0) return null;
    if (version == null) return _clone(history[history.length - 1]);
    const v = history.find((s) => s.version === version);
    return v ? _clone(v) : null;
  }

  getSurveyHistory(id) {
    const history = this._surveys.get(id) || [];
    return history.map(_clone);
  }

  listSurveys() {
    const out = [];
    for (const history of this._surveys.values()) {
      out.push(_clone(history[history.length - 1]));
    }
    return out;
  }

  // ────────────────────────────────────────────────────
  //  Dispatch — render bilingual question onto a channel
  // ────────────────────────────────────────────────────

  sendSurvey({ customerId, surveyId, channel } = {}) {
    _assert(typeof customerId === 'string' && customerId.length > 0,
      'חסר מזהה לקוח', 'customerId required');
    _assert(typeof surveyId === 'string' && surveyId.length > 0,
      'חסר מזהה סקר', 'surveyId required');
    _assert(CHANNELS[channel],
      `ערוץ לא חוקי: ${channel}`, `invalid channel: ${channel}`);

    const survey = this.getSurvey(surveyId);
    _assert(survey, 'סקר לא נמצא', `survey not found: ${surveyId}`);
    _assert(survey.channels.includes(channel),
      `הערוץ ${channel} אינו מוגדר לסקר זה`,
      `channel ${channel} not configured for this survey`);

    const id = `disp-${++this._seq.dispatch}`;
    const dispatch = Object.freeze({
      id,
      survey_id: surveyId,
      survey_version: survey.version,
      customer_id: customerId,
      channel,
      sent_at: _iso(_now()),
      rendered_he: survey.question_he,
      rendered_en: survey.question_en,
      channel_label_he: CHANNELS[channel].he,
      channel_label_en: CHANNELS[channel].en,
    });
    this._dispatches.set(id, dispatch);
    return _clone(dispatch);
  }

  // ────────────────────────────────────────────────────
  //  Record a response (append-only; re-submit → supersede)
  // ────────────────────────────────────────────────────

  recordResponse({ surveyId, customerId, score, comment, date, segment } = {}) {
    _assert(typeof surveyId === 'string' && surveyId.length > 0,
      'חסר מזהה סקר', 'surveyId required');
    _assert(typeof customerId === 'string' && customerId.length > 0,
      'חסר מזהה לקוח', 'customerId required');
    _assert(Number.isInteger(score) && score >= 0 && score <= 10,
      'הציון חייב להיות שלם בטווח 0-10',
      'score must be an integer in the range 0-10');
    _assert(this.getSurvey(surveyId),
      'סקר לא נמצא', `survey not found: ${surveyId}`);

    // Supersede any previous live response from this customer to this survey.
    for (const r of this._responses) {
      if (r.survey_id === surveyId && r.customer_id === customerId && !r.superseded) {
        r.superseded = true;
        r.superseded_at = _iso(_now());
      }
    }

    if (segment) this._segments.set(customerId, segment);

    const id = `resp-${++this._seq.response}`;
    const when = date ? _iso(date) : _iso(_now());
    const bucket = _classify(score);
    const response = {
      id,
      survey_id: surveyId,
      customer_id: customerId,
      score,
      bucket,
      comment: comment || '',
      date: when,
      segment: segment || this._segments.get(customerId) || null,
      superseded: false,
    };
    this._responses.push(response);

    // Detractor → fire closed-loop workflow automatically.
    if (bucket === 'detractor') {
      this.closedLoop({
        detractorId: customerId,
        responseId: id,
        by: 'system',
      });
    }

    return _clone(response);
  }

  listResponses(filter = {}) {
    return this._responses
      .filter((r) => !r.superseded || filter.includeSuperseded)
      .filter((r) => !filter.surveyId  || r.survey_id === filter.surveyId)
      .filter((r) => !filter.customerId || r.customer_id === filter.customerId)
      .filter((r) => _inPeriod(r.date, filter.period))
      .map(_clone);
  }

  // ────────────────────────────────────────────────────
  //  Core formula — computeNPS
  // ────────────────────────────────────────────────────

  computeNPS({ survey, period } = {}) {
    const surveyId = typeof survey === 'object' && survey ? survey.id : survey;
    const responses = this._responses.filter((r) => {
      if (r.superseded) return false;
      if (surveyId && r.survey_id !== surveyId) return false;
      if (!_inPeriod(r.date, period)) return false;
      return true;
    });

    const total = responses.length;
    let promoters = 0, passives = 0, detractors = 0;
    for (const r of responses) {
      if (r.bucket === 'promoter')  promoters++;
      else if (r.bucket === 'passive') passives++;
      else detractors++;
    }

    const pctP = _pct(promoters, total);
    const pctD = _pct(detractors, total);
    const nps  = total > 0 ? Math.round(pctP - pctD) : 0;

    return {
      survey_id: surveyId || null,
      period: period || null,
      total_responses: total,
      promoters,
      passives,
      detractors,
      pct_promoters:  _round(pctP),
      pct_passives:   _round(_pct(passives, total)),
      pct_detractors: _round(pctD),
      nps,
      formula_he: 'NPS = %ממליצים − %ממעיטים',
      formula_en: 'NPS = %Promoters − %Detractors',
    };
  }

  // ────────────────────────────────────────────────────
  //  NPS by customer segment
  // ────────────────────────────────────────────────────

  segmentNPS({ segment, period } = {}) {
    _assert(typeof segment === 'string' && segment.length > 0,
      'חסר שם סגמנט', 'segment required');

    const responses = this._responses.filter((r) => {
      if (r.superseded) return false;
      if (r.segment !== segment) return false;
      if (!_inPeriod(r.date, period)) return false;
      return true;
    });

    const total = responses.length;
    let promoters = 0, passives = 0, detractors = 0;
    for (const r of responses) {
      if (r.bucket === 'promoter') promoters++;
      else if (r.bucket === 'passive') passives++;
      else detractors++;
    }

    const nps = total > 0
      ? Math.round(_pct(promoters, total) - _pct(detractors, total))
      : 0;

    return {
      segment,
      period: period || null,
      total_responses: total,
      promoters,
      passives,
      detractors,
      nps,
      label_he: `NPS לסגמנט ${segment}`,
      label_en: `NPS for segment ${segment}`,
    };
  }

  // ────────────────────────────────────────────────────
  //  Trend over time — period-over-period NPS
  // ────────────────────────────────────────────────────

  trendOverTime(surveyId, options = {}) {
    _assert(typeof surveyId === 'string' && surveyId.length > 0,
      'חסר מזהה סקר', 'surveyId required');
    const bucketBy = options.bucket || 'month'; // month | quarter | year

    const buckets = new Map();
    for (const r of this._responses) {
      if (r.superseded) continue;
      if (r.survey_id !== surveyId) continue;
      const key = _bucketKey(r.date, bucketBy);
      let b = buckets.get(key);
      if (!b) {
        b = { period: key, promoters: 0, passives: 0, detractors: 0, total: 0 };
        buckets.set(key, b);
      }
      b.total++;
      if (r.bucket === 'promoter') b.promoters++;
      else if (r.bucket === 'passive') b.passives++;
      else b.detractors++;
    }

    const points = Array.from(buckets.values())
      .sort((a, b) => a.period.localeCompare(b.period))
      .map((b) => ({
        period: b.period,
        total_responses: b.total,
        promoters: b.promoters,
        passives: b.passives,
        detractors: b.detractors,
        nps: b.total > 0
          ? Math.round(_pct(b.promoters, b.total) - _pct(b.detractors, b.total))
          : 0,
      }));

    // Period-over-period delta.
    for (let i = 1; i < points.length; i++) {
      points[i].delta = points[i].nps - points[i - 1].nps;
      points[i].direction = points[i].delta > 0
        ? { he: 'עלייה',   en: 'up'   }
        : points[i].delta < 0
          ? { he: 'ירידה',  en: 'down' }
          : { he: 'ללא שינוי', en: 'flat' };
    }
    if (points.length > 0) {
      points[0].delta = 0;
      points[0].direction = { he: 'ללא שינוי', en: 'flat' };
    }

    return {
      survey_id: surveyId,
      bucket: bucketBy,
      points,
      label_he: 'מגמת NPS לאורך זמן',
      label_en: 'NPS trend over time',
    };
  }

  // ────────────────────────────────────────────────────
  //  Verbatim analysis — keyword themes + sentiment lite
  // ────────────────────────────────────────────────────

  verbatimAnalysis(comments) {
    _assert(Array.isArray(comments),
      'התגובות חייבות להיות מערך', 'comments must be an array');

    const themeHits = {};
    for (const key of Object.keys(VERBATIM_LEXICON.themes)) {
      themeHits[key] = {
        theme: key,
        label_he: VERBATIM_LEXICON.themes[key].he,
        label_en: VERBATIM_LEXICON.themes[key].en,
        count: 0,
        positive: 0,
        negative: 0,
        samples: [],
      };
    }

    let sumPositive = 0, sumNegative = 0, analysed = 0;

    for (const raw of comments) {
      const text = _plainLower(raw);
      if (!text) continue;
      analysed++;
      const sentiment = _sentimentLite(text);
      if (sentiment > 0) sumPositive++;
      else if (sentiment < 0) sumNegative++;

      for (const [key, def] of Object.entries(VERBATIM_LEXICON.themes)) {
        const hit =
          def.keywords_he.some((kw) => text.includes(kw)) ||
          def.keywords_en.some((kw) => text.includes(kw.toLowerCase()));
        if (hit) {
          themeHits[key].count++;
          if (sentiment > 0) themeHits[key].positive++;
          if (sentiment < 0) themeHits[key].negative++;
          if (themeHits[key].samples.length < 3) {
            themeHits[key].samples.push(String(raw));
          }
        }
      }
    }

    const themes = Object.values(themeHits)
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count);

    return {
      analysed,
      themes,
      sentiment: {
        positive: sumPositive,
        negative: sumNegative,
        neutral:  analysed - sumPositive - sumNegative,
        score:    analysed ? _round((sumPositive - sumNegative) / analysed, 2) : 0,
      },
      label_he: 'ניתוח תגובות מילוליות',
      label_en: 'Verbatim comment analysis',
    };
  }

  // ────────────────────────────────────────────────────
  //  Closed-loop workflow (48h SLA)
  // ────────────────────────────────────────────────────

  closedLoop({ detractorId, responseId, by } = {}) {
    _assert(typeof detractorId === 'string' && detractorId.length > 0,
      'חסר מזהה ממעיט', 'detractorId required');

    const existing = Array.from(this._cases.values()).find(
      (c) => c.detractor_id === detractorId && c.status === 'open',
    );
    if (existing) {
      // Do not duplicate — but log the additional trigger.
      existing.events.push({
        at: _iso(_now()),
        type: 'retrigger',
        by: by || 'system',
        note_he: 'ממעיט זוהה שוב — שומר על המקרה הפתוח',
        note_en: 'Detractor re-flagged — keeping existing open case',
        response_id: responseId || null,
      });
      return _clone(existing);
    }

    const id = `case-${++this._seq.case}`;
    const openedAt = _now();
    const due = new Date(openedAt.getTime() + CLOSED_LOOP_SLA_MS);

    const kase = {
      id,
      detractor_id: detractorId,
      response_id: responseId || null,
      opened_at: _iso(openedAt),
      due_at: _iso(due),
      sla_hours: CLOSED_LOOP_SLA_HOURS,
      status: 'open',
      events: [
        {
          at: _iso(openedAt),
          type: 'opened',
          by: by || 'system',
          note_he: `פנייה חוזרת תיפתח תוך ${CLOSED_LOOP_SLA_HOURS} שעות`,
          note_en: `Follow-up must occur within ${CLOSED_LOOP_SLA_HOURS} hours`,
        },
      ],
      workflow: {
        steps_he: [
          '1) נציג אחראי לוקח בעלות',
          '2) שיחת טלפון תוך 48 שעות',
          '3) תיעוד הסיבה והפעולה המתקנת',
          '4) סגירה עם אישור הלקוח',
        ],
        steps_en: [
          '1) Assign owner',
          '2) Phone call within 48 hours',
          '3) Log root cause + corrective action',
          '4) Close with customer confirmation',
        ],
      },
    };
    this._cases.set(id, kase);
    return _clone(kase);
  }

  recordFollowupOutcome({ caseId, status, outcome_he, outcome_en, by } = {}) {
    _assert(typeof caseId === 'string' && caseId.length > 0,
      'חסר מזהה מקרה', 'caseId required');
    _assert(CASE_STATUS[status],
      `סטטוס לא חוקי: ${status}`, `invalid status: ${status}`);
    const kase = this._cases.get(caseId);
    _assert(kase, 'מקרה לא נמצא', `case not found: ${caseId}`);

    kase.status = status;
    kase.events.push({
      at: _iso(_now()),
      type: 'outcome',
      by: by || 'system',
      note_he: outcome_he || '',
      note_en: outcome_en || '',
    });
    if (status === 'resolved' || status === 'contacted') {
      kase.closed_at = _iso(_now());
    }
    return _clone(kase);
  }

  followupTracking(customerId) {
    _assert(typeof customerId === 'string' && customerId.length > 0,
      'חסר מזהה לקוח', 'customerId required');

    const now = _now().getTime();
    const cases = Array.from(this._cases.values())
      .filter((c) => c.detractor_id === customerId)
      .map((c) => {
        const due = new Date(c.due_at).getTime();
        const overdue = c.status === 'open' && now > due;
        return {
          ..._clone(c),
          overdue,
          hours_remaining: c.status === 'open'
            ? Math.max(0, (due - now) / (60 * 60 * 1000))
            : 0,
        };
      });

    const contacted = cases.filter(
      (c) => c.status === 'contacted' || c.status === 'resolved',
    ).length;
    const open = cases.filter((c) => c.status === 'open').length;
    const breached = cases.filter((c) => c.overdue || c.status === 'breached').length;

    return {
      customer_id: customerId,
      cases,
      total: cases.length,
      contacted,
      open,
      breached,
      label_he: 'מעקב חזרה למתלוננים',
      label_en: 'Detractor follow-up tracking',
    };
  }

  // ────────────────────────────────────────────────────
  //  Industry benchmarks
  // ────────────────────────────────────────────────────

  benchmarkIndustry({ industry } = {}) {
    const key = typeof industry === 'string' ? industry.toLowerCase() : 'default';
    const b = this._industryBenchmarks[key] || this._industryBenchmarks['default'];
    return {
      industry: key,
      label_he: b.he,
      label_en: b.en,
      thresholds: {
        low:       b.low,
        average:   b.avg,
        good:      b.good,
        excellent: b.excellent,
      },
      notes_he: 'ציוני ייחוס מבוססים על פרסומים של Bain, ClearlyRated ו-Retently 2025.',
      notes_en: 'Reference values derived from Bain, ClearlyRated and Retently 2025 benchmarks.',
    };
  }

  // ────────────────────────────────────────────────────
  //  Executive dashboard
  // ────────────────────────────────────────────────────

  executiveDashboard(period) {
    const overall = this.computeNPS({ period });
    const segments = new Map();
    for (const r of this._responses) {
      if (r.superseded) continue;
      if (!_inPeriod(r.date, period)) continue;
      if (!r.segment) continue;
      segments.set(r.segment, true);
    }
    const segmentReports = Array.from(segments.keys()).map((seg) =>
      this.segmentNPS({ segment: seg, period }),
    );

    // Top 3 surveys by volume in period.
    const bySurvey = new Map();
    for (const r of this._responses) {
      if (r.superseded) continue;
      if (!_inPeriod(r.date, period)) continue;
      bySurvey.set(r.survey_id, (bySurvey.get(r.survey_id) || 0) + 1);
    }
    const topSurveys = Array.from(bySurvey.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => this.computeNPS({ survey: id, period }));

    // Closed-loop health
    const cases = Array.from(this._cases.values());
    const now = _now().getTime();
    const openCases      = cases.filter((c) => c.status === 'open').length;
    const breachedCases  = cases.filter(
      (c) => c.status === 'breached' ||
             (c.status === 'open' && now > new Date(c.due_at).getTime()),
    ).length;
    const resolvedCases  = cases.filter((c) => c.status === 'resolved').length;
    const contactedCases = cases.filter((c) => c.status === 'contacted').length;

    // Verbatim themes in period
    const comments = this._responses
      .filter((r) => !r.superseded && _inPeriod(r.date, period))
      .map((r) => r.comment)
      .filter(Boolean);
    const themes = this.verbatimAnalysis(comments);

    return {
      period: period || null,
      headline: {
        nps:          overall.nps,
        label_he:     `ציון NPS הוא ${overall.nps}`,
        label_en:     `NPS score is ${overall.nps}`,
        total:        overall.total_responses,
        promoters:    overall.promoters,
        passives:     overall.passives,
        detractors:   overall.detractors,
      },
      segments: segmentReports,
      top_surveys: topSurveys,
      closed_loop: {
        total:     cases.length,
        open:      openCases,
        contacted: contactedCases,
        resolved:  resolvedCases,
        breached:  breachedCases,
        sla_hours: CLOSED_LOOP_SLA_HOURS,
      },
      themes,
      labels: {
        he: {
          title:       'לוח בקרה מנהלים — NPS',
          nps:         'ציון NPS',
          segments:    'לפי סגמנט',
          closed_loop: 'לולאה סגורה — ממעיטים',
          themes:      'נושאים שעלו בתגובות',
        },
        en: {
          title:       'Executive dashboard — NPS',
          nps:         'NPS score',
          segments:    'By segment',
          closed_loop: 'Closed loop — detractors',
          themes:      'Verbatim themes',
        },
      },
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Module-level helpers (pure)
// ─────────────────────────────────────────────────────────────

function _bucketKey(iso, bucket) {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  if (bucket === 'year')    return String(y);
  if (bucket === 'quarter') return `${y}-Q${Math.ceil(m / 3)}`;
  // month (default)
  return `${y}-${String(m).padStart(2, '0')}`;
}

function _sentimentLite(text) {
  let pos = 0, neg = 0;
  for (const w of VERBATIM_LEXICON.positive_he) if (text.includes(w)) pos++;
  for (const w of VERBATIM_LEXICON.positive_en) if (text.includes(w)) pos++;
  for (const w of VERBATIM_LEXICON.negative_he) if (text.includes(w)) neg++;
  for (const w of VERBATIM_LEXICON.negative_en) if (text.includes(w)) neg++;
  if (pos > neg) return 1;
  if (neg > pos) return -1;
  return 0;
}

// ─────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────

module.exports = {
  NPSSystem,
  BUCKETS,
  CHANNELS,
  TRIGGERS,
  CASE_STATUS,
  DEFAULT_QUESTION,
  INDUSTRY_BENCHMARKS,
  VERBATIM_LEXICON,
  CLOSED_LOOP_SLA_HOURS,
  // exported for tests
  _classify,
  _bucketKey,
  _sentimentLite,
};
