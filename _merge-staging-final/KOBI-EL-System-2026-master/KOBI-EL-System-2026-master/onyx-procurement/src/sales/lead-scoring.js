/**
 * Lead Scoring Engine — BANT + Behavioral
 * Techno-Kol Uzi mega-ERP / Agent Y023
 *
 * Rule: "לא מוחקים, רק משדרגים ומגדלים"
 *   — we never drop an old lead, we re-score, decay, and enrich.
 *
 * Zero dependencies. Pure JavaScript. No ML libraries, no HTTP calls,
 * no file I/O. Everything is deterministic and offline-friendly.
 *
 * The `LeadScorer` class implements a transparent, explainable scoring
 * model built around the classic BANT framework (Budget / Authority /
 * Need / Timeline) plus six behavioral signals:
 *
 *   - email opens
 *   - link clicks
 *   - page visits
 *   - form fills
 *   - webinar attendance
 *   - content downloads
 *
 * The default model is plug-and-play: construct `new LeadScorer()` and
 * you immediately have a working 0..100 scorer with a bilingual
 * Hebrew / English explanation per factor. You can also call
 * `defineModel()` to register a fully custom set of factors.
 *
 * Lead-shape expected by the default factors:
 *
 *   {
 *     id:             'lead-0001',
 *     company: {
 *       name:         'ACME Steel Ltd',
 *       annualRevenue: 12_000_000,   // NIS
 *       employees:    42,
 *     },
 *     contact: {
 *       name:         'Dana Cohen',
 *       title:        'CFO',
 *       decisionPower: 'decision-maker',   // or 'influencer' | 'end-user'
 *     },
 *     inquiry: {
 *       type:         'demo-request',      // enum, see DEFAULTS
 *       painStated:   true,
 *       urgency:      'this-quarter',      // enum, see DEFAULTS
 *     },
 *     behavior: {
 *       emailOpens:        12,
 *       linkClicks:         4,
 *       pageVisits:         9,
 *       formFills:          2,
 *       webinarAttendance:  1,
 *       contentDownloads:   3,
 *       lastActivityAt:    '2026-04-05',   // ISO
 *     },
 *     createdAt: '2026-03-01',
 *   }
 *
 * `scoreLead(lead)` returns:
 *
 *   {
 *     total:       72,                     // 0..100
 *     class:       'Warm',                 // Hot/Warm/Cool/Cold
 *     breakdown:   [
 *       { name, type, weight, rawScore, weightedScore, max },
 *       ...
 *     ],
 *     metadata:    { scoredAt, modelVersion },
 *   }
 *
 * `explainScore(lead)` returns the same + bilingual strings per factor.
 *
 * `classify(score)` is a pure lookup (Hot/Warm/Cool/Cold boundaries).
 *
 * `trainFromHistory(wonLeads, lostLeads)` performs logistic regression
 * via gradient descent to re-weight the factors from actual historical
 * win/loss. This never DELETES factors — only adjusts weights (per
 * the Techno-Kol rule: "לא מוחקים, רק משדרגים ומגדלים").
 *
 * `ageDecay(lead, halfLifeDays)` returns a new lead object whose
 * behavioral signals have been decayed by an exponential half-life
 * against `lastActivityAt` (default 30 days). The original lead is
 * never mutated.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// 0. CONSTANTS, THRESHOLDS AND ENUM TABLES
// ═══════════════════════════════════════════════════════════════════════════

const MODEL_VERSION = 'Y023.2.0';

/**
 * Classification boundaries.
 * Hot   >= 80
 * Warm  >= 50 and < 80
 * Cool  >= 30 and < 50
 * Cold  < 30
 */
const CLASS_THRESHOLDS = Object.freeze({
  hot:  80,
  warm: 50,
  cool: 30,
});

/**
 * Bilingual glossary — every factor, every class, every pain point gets a
 * deterministic Hebrew + English label. Keeps the explain layer consistent.
 */
const GLOSSARY = Object.freeze({
  classes: {
    Hot:  { he: 'חם', en: 'Hot' },
    Warm: { he: 'פושר', en: 'Warm' },
    Cool: { he: 'צונן', en: 'Cool' },
    Cold: { he: 'קר', en: 'Cold' },
  },
  factors: {
    budget:    { he: 'תקציב', en: 'Budget' },
    authority: { he: 'סמכות', en: 'Authority' },
    need:      { he: 'צורך',  en: 'Need' },
    timeline:  { he: 'זמן',   en: 'Timeline' },
    emailOpens:        { he: 'פתיחות דוא״ל',        en: 'Email opens' },
    linkClicks:        { he: 'הקלקות על קישורים',    en: 'Link clicks' },
    pageVisits:        { he: 'ביקורים בעמודים',       en: 'Page visits' },
    formFills:         { he: 'מילוי טפסים',          en: 'Form fills' },
    webinarAttendance: { he: 'השתתפות בוובינר',      en: 'Webinar attendance' },
    contentDownloads:  { he: 'הורדות תוכן',          en: 'Content downloads' },
  },
});

/**
 * Decision power → score (0..1). A decision-maker beats an influencer
 * which beats an end-user. Unknown defaults to 0.3.
 */
const DECISION_POWER = Object.freeze({
  'decision-maker': 1.0,
  'influencer':     0.6,
  'end-user':       0.3,
  'unknown':        0.2,
});

/**
 * Title regexes grouped into seniority bands. We score the *highest*
 * matching band. Hebrew and English variants both map to the same band.
 *
 * Note: `\b` word-boundary assertions don't work on Hebrew letters in
 * JavaScript regex. We use lookbehind/lookahead on non-letter characters
 * (or string start/end) so Hebrew strings like "סמנכ״ל כספים" still match.
 */
const TITLE_BANDS = Object.freeze([
  {
    band: 'c-suite',
    score: 1.0,
    re: /(?:^|[^A-Za-z\u0590-\u05FF])(ceo|cfo|coo|cto|cio|cmo|cpo|cro|founder|owner|president|chief|מנכ[״"']?ל|סמנכ[״"']?ל|בעלי?ם|נשיא)(?=[^A-Za-z\u0590-\u05FF]|$)/i,
  },
  {
    band: 'vp',
    score: 0.85,
    re: /(?:^|[^A-Za-z\u0590-\u05FF])(vp|vice\s*president|head\s+of|סגן|סגנית|ראש\s+אגף|ראש\s+תחום)(?=[^A-Za-z\u0590-\u05FF]|$)/i,
  },
  {
    band: 'director',
    score: 0.70,
    re: /(?:^|[^A-Za-z\u0590-\u05FF])(director|מנהל\s+מחלקה|מנהל\s+אגף|דירקטור)(?=[^A-Za-z\u0590-\u05FF]|$)/i,
  },
  {
    band: 'manager',
    score: 0.50,
    re: /(?:^|[^A-Za-z\u0590-\u05FF])(manager|lead|team\s+lead|מנהל|מנהלת|ראש\s+צוות)(?=[^A-Za-z\u0590-\u05FF]|$)/i,
  },
  {
    band: 'ic',
    score: 0.25,
    re: /(?:^|[^A-Za-z\u0590-\u05FF])(engineer|analyst|specialist|coordinator|מתכנת|מהנדס|אנליסט|רכזת?)(?=[^A-Za-z\u0590-\u05FF]|$)/i,
  },
]);

/**
 * Inquiry type → raw need score (0..1). The stronger the stated intent,
 * the higher the score.
 */
const INQUIRY_SCORES = Object.freeze({
  'demo-request':      0.90,
  'pricing-request':   0.85,
  'rfp':               0.92,
  'trial-signup':      0.80,
  'support':           0.30,
  'content-download':  0.40,
  'general-inquiry':   0.20,
  'newsletter':        0.10,
  'unknown':           0.15,
});

/**
 * Urgency phrase → score (0..1). Hebrew/English synonyms mapped to the
 * same bucket.
 */
const URGENCY_SCORES = Object.freeze({
  'immediate':    1.0,
  'this-month':   0.9,
  'this-quarter': 0.75,
  'this-year':    0.5,
  'next-year':    0.25,
  'no-timeline':  0.1,
  'unknown':      0.15,
});

/**
 * Revenue bands for the Budget factor (in NIS). Picked for a B2B
 * Israeli mid-market ERP:
 *   < 1M NIS     → micro (0.20)
 *   1M..5M      → small (0.45)
 *   5M..20M     → mid (0.70)
 *   20M..100M   → large (0.90)
 *   >= 100M     → enterprise (1.00)
 */
const REVENUE_BANDS = Object.freeze([
  { upper: 1_000_000,    score: 0.20 },
  { upper: 5_000_000,    score: 0.45 },
  { upper: 20_000_000,   score: 0.70 },
  { upper: 100_000_000,  score: 0.90 },
  { upper: Infinity,     score: 1.00 },
]);

/**
 * Headcount bands for the Budget factor (employees).
 *   <= 10        → micro (0.20)
 *   11..50       → small (0.45)
 *   51..200      → mid (0.70)
 *   201..1000    → large (0.90)
 *   > 1000       → enterprise (1.00)
 */
const HEADCOUNT_BANDS = Object.freeze([
  { upper: 10,    score: 0.20 },
  { upper: 50,    score: 0.45 },
  { upper: 200,   score: 0.70 },
  { upper: 1000,  score: 0.90 },
  { upper: Infinity, score: 1.00 },
]);

/**
 * Saturation ceilings for behavioral counters. More than X of a given
 * signal produces a 1.0 normalized score (no infinite growth).
 */
const BEHAVIORAL_CEILINGS = Object.freeze({
  emailOpens:        20,
  linkClicks:        15,
  pageVisits:        25,
  formFills:          5,
  webinarAttendance:  3,
  contentDownloads:   8,
});

/**
 * Default factor weights (sum = 1.0).
 *  BANT carries 60%, behavioral carries 40%.
 */
const DEFAULT_WEIGHTS = Object.freeze({
  budget:    0.18,
  authority: 0.16,
  need:      0.14,
  timeline:  0.12,
  emailOpens:        0.05,
  linkClicks:        0.07,
  pageVisits:        0.05,
  formFills:         0.10,
  webinarAttendance: 0.07,
  contentDownloads:  0.06,
});

// Logistic regression defaults for trainFromHistory().
const TRAIN_DEFAULTS = Object.freeze({
  learningRate:    0.1,
  maxIterations:   500,
  convergenceEps:  1e-6,
  l2Regularization: 0.01,
  minWeight:        0.01,  // never zero out a factor — rule: "לא מוחקים"
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. PURE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** Safe numeric coercion — returns 0 for NaN / null / undefined. */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Clamp a number into [lo, hi]. */
function clamp(x, lo, hi) {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

/** Round to N decimals. */
function round(x, digits = 2) {
  const f = Math.pow(10, digits);
  return Math.round(x * f) / f;
}

/** Map a value into a banded score table. */
function bandScore(value, bands) {
  const v = num(value);
  for (let i = 0; i < bands.length; i++) {
    if (v <= bands[i].upper) return bands[i].score;
  }
  return bands[bands.length - 1].score;
}

/** Sigmoid for logistic regression. */
function sigmoid(z) {
  // numerically-stable variant
  if (z >= 0) {
    const e = Math.exp(-z);
    return 1 / (1 + e);
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

/** Days between two ISO-ish dates (floored). 0 if either missing. */
function daysBetween(aISO, bISO) {
  if (!aISO || !bISO) return 0;
  const a = Date.parse(aISO);
  const b = Date.parse(bISO);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

/** Deep-clone a JSON-safe object without structuredClone (keep Node 16 happy). */
function cloneLead(lead) {
  return JSON.parse(JSON.stringify(lead || {}));
}

/** Normalize an enum-ish string — lowercase + collapse whitespace + trim. */
function normEnum(s) {
  return String(s || '').toLowerCase().trim().replace(/\s+/g, '-');
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. DEFAULT BANT + BEHAVIORAL SCORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Budget: combination of annual revenue and employee count. Each feeds
 * a banded score; we take the *max* of the two (a 5-person company
 * with 20M NIS revenue is still a serious budget-holder).
 */
function scoreBudget(lead) {
  const rev = num(lead && lead.company && lead.company.annualRevenue);
  const emp = num(lead && lead.company && lead.company.employees);
  const rScore = bandScore(rev, REVENUE_BANDS);
  const eScore = bandScore(emp, HEADCOUNT_BANDS);
  // weighted blend: revenue slightly dominates (0.6 / 0.4) then max-boost
  const blended = 0.6 * rScore + 0.4 * eScore;
  return clamp(Math.max(blended, Math.min(rScore, eScore)), 0, 1);
}

/**
 * Authority: title regex bands × decision-power self-reporting.
 *
 * Final score = max(titleBand, decisionPower) * 0.7
 *             + min(titleBand, decisionPower) * 0.3
 * This rewards a VP (title) who claims to be a decision-maker,
 * and is lenient on a decision-maker with an ambiguous title.
 */
function scoreAuthority(lead) {
  const title = (lead && lead.contact && lead.contact.title) || '';
  let titleScore = 0.1;
  for (const band of TITLE_BANDS) {
    if (band.re.test(title)) {
      titleScore = Math.max(titleScore, band.score);
    }
  }
  const powerKey = normEnum(lead && lead.contact && lead.contact.decisionPower);
  const powerScore = DECISION_POWER[powerKey] != null
    ? DECISION_POWER[powerKey]
    : DECISION_POWER.unknown;
  const hi = Math.max(titleScore, powerScore);
  const lo = Math.min(titleScore, powerScore);
  return clamp(0.7 * hi + 0.3 * lo, 0, 1);
}

/**
 * Need: inquiry type score, optionally boosted when the lead states
 * pain explicitly. Pain closes 30% of the remaining gap to 1.0, so
 * even an already-high base (e.g. 0.9) moves up a bit.
 */
function scoreNeed(lead) {
  const type = normEnum(lead && lead.inquiry && lead.inquiry.type);
  const base = INQUIRY_SCORES[type] != null
    ? INQUIRY_SCORES[type]
    : INQUIRY_SCORES.unknown;
  const hasPain = !!(lead && lead.inquiry && lead.inquiry.painStated === true);
  const boosted = hasPain ? base + (1 - base) * 0.30 : base;
  return clamp(boosted, 0, 1);
}

/** Timeline: plain urgency enum lookup. */
function scoreTimeline(lead) {
  const u = normEnum(lead && lead.inquiry && lead.inquiry.urgency);
  return URGENCY_SCORES[u] != null ? URGENCY_SCORES[u] : URGENCY_SCORES.unknown;
}

/**
 * Behavioral scorer factory — returns a scoreFn that reads a single
 * counter from lead.behavior and normalizes against its saturation
 * ceiling. Produces diminishing-returns curves so clicking 200 times
 * is not 10x clicking 20 times.
 *
 * Formula: 1 - exp(-count / ceiling)  — reaches ~0.63 at ceiling,
 * ~0.86 at 2×ceiling, ~0.95 at 3×ceiling.
 */
function makeBehavioralFn(key) {
  const ceiling = BEHAVIORAL_CEILINGS[key] || 10;
  return function scoreBehavior(lead) {
    const count = num(lead && lead.behavior && lead.behavior[key]);
    if (count <= 0) return 0;
    return clamp(1 - Math.exp(-count / ceiling), 0, 1);
  };
}

/**
 * Build the default factor list — 10 factors, weights summing to 1.0.
 */
function buildDefaultFactors() {
  return [
    {
      name: 'budget',
      type: 'firmographic',
      weight: DEFAULT_WEIGHTS.budget,
      scoreFn: scoreBudget,
      bant: 'B',
    },
    {
      name: 'authority',
      type: 'demographic',
      weight: DEFAULT_WEIGHTS.authority,
      scoreFn: scoreAuthority,
      bant: 'A',
    },
    {
      name: 'need',
      type: 'firmographic',
      weight: DEFAULT_WEIGHTS.need,
      scoreFn: scoreNeed,
      bant: 'N',
    },
    {
      name: 'timeline',
      type: 'firmographic',
      weight: DEFAULT_WEIGHTS.timeline,
      scoreFn: scoreTimeline,
      bant: 'T',
    },
    {
      name: 'emailOpens',
      type: 'behavioral',
      weight: DEFAULT_WEIGHTS.emailOpens,
      scoreFn: makeBehavioralFn('emailOpens'),
    },
    {
      name: 'linkClicks',
      type: 'behavioral',
      weight: DEFAULT_WEIGHTS.linkClicks,
      scoreFn: makeBehavioralFn('linkClicks'),
    },
    {
      name: 'pageVisits',
      type: 'behavioral',
      weight: DEFAULT_WEIGHTS.pageVisits,
      scoreFn: makeBehavioralFn('pageVisits'),
    },
    {
      name: 'formFills',
      type: 'behavioral',
      weight: DEFAULT_WEIGHTS.formFills,
      scoreFn: makeBehavioralFn('formFills'),
    },
    {
      name: 'webinarAttendance',
      type: 'behavioral',
      weight: DEFAULT_WEIGHTS.webinarAttendance,
      scoreFn: makeBehavioralFn('webinarAttendance'),
    },
    {
      name: 'contentDownloads',
      type: 'behavioral',
      weight: DEFAULT_WEIGHTS.contentDownloads,
      scoreFn: makeBehavioralFn('contentDownloads'),
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. LEAD SCORER CLASS
// ═══════════════════════════════════════════════════════════════════════════

class LeadScorer {
  /**
   * Construct a scorer. By default it loads the BANT + behavioral model.
   * Pass `{factors:[...]}` to start with a custom model.
   */
  constructor(options) {
    this.modelVersion = MODEL_VERSION;
    this.factors = buildDefaultFactors();
    this.trainingLog = [];
    if (options && Array.isArray(options.factors)) {
      this.defineModel({ factors: options.factors });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 3.1  defineModel — register a custom set of factors
  // ─────────────────────────────────────────────────────────────

  /**
   * Replace the current factor set with a user-supplied one.
   * Each factor MUST have: {name, weight, type, scoreFn}.
   * Weights are automatically normalized to sum to 1.0 so callers
   * can pass raw weights without worrying about totals.
   *
   * Rule "לא מוחקים": we do not discard the old model — the previous
   * factor list is pushed into trainingLog for audit.
   */
  defineModel(def) {
    if (!def || !Array.isArray(def.factors) || def.factors.length === 0) {
      throw new Error('LeadScorer.defineModel: factors[] is required');
    }
    const seen = new Set();
    const validated = def.factors.map((f, i) => {
      if (!f || typeof f !== 'object') {
        throw new Error(`LeadScorer.defineModel: factor[${i}] is not an object`);
      }
      if (!f.name || typeof f.name !== 'string') {
        throw new Error(`LeadScorer.defineModel: factor[${i}].name missing`);
      }
      if (seen.has(f.name)) {
        throw new Error(`LeadScorer.defineModel: duplicate factor name '${f.name}'`);
      }
      seen.add(f.name);
      if (typeof f.scoreFn !== 'function') {
        throw new Error(`LeadScorer.defineModel: factor '${f.name}'.scoreFn must be a function`);
      }
      const type = f.type;
      if (type !== 'demographic' && type !== 'firmographic' && type !== 'behavioral') {
        throw new Error(
          `LeadScorer.defineModel: factor '${f.name}'.type must be demographic|firmographic|behavioral`
        );
      }
      const weight = num(f.weight);
      if (weight < 0) {
        throw new Error(`LeadScorer.defineModel: factor '${f.name}'.weight must be >= 0`);
      }
      return {
        name:    f.name,
        type:    type,
        weight:  weight,
        scoreFn: f.scoreFn,
        bant:    f.bant || null,
      };
    });
    // Normalize weights so they sum to 1.0.
    const total = validated.reduce((s, f) => s + f.weight, 0);
    if (total <= 0) {
      throw new Error('LeadScorer.defineModel: at least one factor must have weight > 0');
    }
    for (const f of validated) f.weight = f.weight / total;

    // Audit: keep the prior model in the training log. Never delete.
    this.trainingLog.push({
      event:    'defineModel',
      at:       new Date().toISOString(),
      previous: this.factors.map((p) => ({ name: p.name, weight: p.weight })),
      next:     validated.map((p) => ({ name: p.name, weight: p.weight })),
    });

    this.factors = validated;
    return this;
  }

  // ─────────────────────────────────────────────────────────────
  // 3.2  scoreLead — returns 0..100 + per-factor breakdown
  // ─────────────────────────────────────────────────────────────

  scoreLead(lead) {
    const breakdown = [];
    let total = 0;
    for (const f of this.factors) {
      let raw;
      try {
        raw = clamp(num(f.scoreFn(lead)), 0, 1);
      } catch (err) {
        raw = 0;
      }
      const weighted = raw * f.weight * 100;
      total += weighted;
      breakdown.push({
        name:          f.name,
        type:          f.type,
        bant:          f.bant || null,
        weight:        round(f.weight, 4),
        rawScore:      round(raw, 4),
        weightedScore: round(weighted, 2),
        max:           round(f.weight * 100, 2),
      });
    }
    const totalRounded = round(clamp(total, 0, 100), 2);
    return {
      total:    totalRounded,
      class:    this.classify(totalRounded),
      breakdown,
      metadata: {
        scoredAt:     new Date().toISOString(),
        modelVersion: this.modelVersion,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 3.3  explainScore — bilingual per-factor commentary
  // ─────────────────────────────────────────────────────────────

  explainScore(lead) {
    const result = this.scoreLead(lead);
    result.explanation = result.breakdown.map((row) => {
      const label = GLOSSARY.factors[row.name] || { he: row.name, en: row.name };
      const pct = row.max > 0 ? Math.round((row.weightedScore / row.max) * 100) : 0;
      const he = `${label.he}: ${row.weightedScore} מתוך ${row.max} נקודות `
               + `(${pct}%, משקל ${Math.round(row.weight * 100)}%).`;
      const en = `${label.en}: ${row.weightedScore} of ${row.max} points `
               + `(${pct}%, weight ${Math.round(row.weight * 100)}%).`;
      return {
        name: row.name,
        he,
        en,
      };
    });
    const cls = GLOSSARY.classes[result.class];
    result.summary = {
      he: `סה"כ ${result.total}/100 — הליד מסווג כ${cls.he}.`,
      en: `Total ${result.total}/100 — lead classified as ${cls.en}.`,
    };
    return result;
  }

  // ─────────────────────────────────────────────────────────────
  // 3.4  classify — boundary lookup
  // ─────────────────────────────────────────────────────────────

  classify(score) {
    const s = num(score);
    if (s >= CLASS_THRESHOLDS.hot)  return 'Hot';
    if (s >= CLASS_THRESHOLDS.warm) return 'Warm';
    if (s >= CLASS_THRESHOLDS.cool) return 'Cool';
    return 'Cold';
  }

  // ─────────────────────────────────────────────────────────────
  // 3.5  trainFromHistory — logistic regression by gradient descent
  // ─────────────────────────────────────────────────────────────

  /**
   * Adjust factor weights given historical won/lost leads.
   *
   *   won   — array of leads that ultimately converted (label = 1)
   *   lost  — array of leads that did not convert    (label = 0)
   *
   * Algorithm:
   *   1. Build a feature matrix X where each row is [f1(lead), f2(lead), ...]
   *      over the current factor list. Features are already in [0, 1].
   *   2. Train a logistic regression via gradient descent with L2 reg.
   *      (No bias term — the scoring output is 0..100 scaled by weights.)
   *   3. Convert the learned coefficients β into non-negative weights:
   *         w_i = max(minWeight, |β_i|)
   *      — rule "לא מוחקים": never zero out a factor, clamp at minWeight.
   *   4. Normalize so Σ w_i = 1.0 and install them on this.factors.
   *   5. Log the before/after in trainingLog for audit.
   *
   * Returns a diagnostics object with loss history, iterations, and
   * whether convergence was reached.
   */
  trainFromHistory(won, lost, opts) {
    const o = Object.assign({}, TRAIN_DEFAULTS, opts || {});
    const wonArr = Array.isArray(won) ? won : [];
    const lostArr = Array.isArray(lost) ? lost : [];
    if (wonArr.length === 0 || lostArr.length === 0) {
      throw new Error('LeadScorer.trainFromHistory: need at least one won and one lost lead');
    }

    const n = this.factors.length;
    // 1. Build labeled dataset
    const samples = [];
    for (const lead of wonArr) samples.push({ x: this._featurize(lead), y: 1 });
    for (const lead of lostArr) samples.push({ x: this._featurize(lead), y: 0 });
    const m = samples.length;

    // 2. Initialize β from current weights (warm start)
    const beta = this.factors.map((f) => f.weight);

    // 3. Gradient descent with L2 reg
    const lossHistory = [];
    let prevLoss = Infinity;
    let iterations = 0;
    let converged = false;
    for (let it = 0; it < o.maxIterations; it++) {
      iterations = it + 1;
      // Forward pass + gradient
      const grad = new Array(n).fill(0);
      let loss = 0;
      for (const s of samples) {
        let z = 0;
        for (let j = 0; j < n; j++) z += beta[j] * s.x[j];
        const p = sigmoid(z);
        // binary cross-entropy (clamped for numeric safety)
        const pc = clamp(p, 1e-9, 1 - 1e-9);
        loss += -(s.y * Math.log(pc) + (1 - s.y) * Math.log(1 - pc));
        const err = p - s.y;
        for (let j = 0; j < n; j++) grad[j] += err * s.x[j];
      }
      loss /= m;
      // L2 regularization
      for (let j = 0; j < n; j++) {
        loss += 0.5 * o.l2Regularization * beta[j] * beta[j];
        grad[j] = grad[j] / m + o.l2Regularization * beta[j];
      }
      lossHistory.push(loss);
      // Update
      for (let j = 0; j < n; j++) beta[j] -= o.learningRate * grad[j];
      if (Math.abs(prevLoss - loss) < o.convergenceEps) {
        converged = true;
        break;
      }
      prevLoss = loss;
    }

    // 4. Convert β to weights. Never delete: clamp at minWeight.
    const rawWeights = beta.map((b) => Math.max(o.minWeight, Math.abs(b)));
    const sum = rawWeights.reduce((a, b) => a + b, 0);
    const newWeights = rawWeights.map((w) => w / sum);

    // 5. Apply + audit
    const previous = this.factors.map((f) => ({ name: f.name, weight: f.weight }));
    for (let i = 0; i < n; i++) this.factors[i].weight = newWeights[i];
    const next = this.factors.map((f) => ({ name: f.name, weight: f.weight }));
    this.trainingLog.push({
      event:       'trainFromHistory',
      at:          new Date().toISOString(),
      samples:     m,
      wonCount:    wonArr.length,
      lostCount:   lostArr.length,
      iterations,
      converged,
      finalLoss:   lossHistory[lossHistory.length - 1],
      previous,
      next,
    });

    return {
      iterations,
      converged,
      finalLoss:   lossHistory[lossHistory.length - 1],
      lossHistory,
      coefficients: beta.slice(),
      weights:     next,
    };
  }

  /**
   * Run all current factors against a lead and return [score1, score2, ...].
   * Used internally by training.
   */
  _featurize(lead) {
    const row = new Array(this.factors.length);
    for (let i = 0; i < this.factors.length; i++) {
      let v = 0;
      try {
        v = clamp(num(this.factors[i].scoreFn(lead)), 0, 1);
      } catch (_) {
        v = 0;
      }
      row[i] = v;
    }
    return row;
  }

  // ─────────────────────────────────────────────────────────────
  // 3.6  ageDecay — exponential half-life on behavioral counters
  // ─────────────────────────────────────────────────────────────

  /**
   * Returns a shallow-decayed copy of `lead`. All behavioral counters
   * are multiplied by 0.5 ^ (age / halfLifeDays) where age is days
   * since lead.behavior.lastActivityAt (or lead.createdAt) up to "now"
   * (or `opts.asOf`). Non-behavioral fields are untouched.
   *
   * The original lead is NEVER mutated — keeping with the "לא מוחקים"
   * rule, aged leads are new objects and the old one can live on.
   */
  ageDecay(lead, halfLifeDays, opts) {
    const half = num(halfLifeDays) > 0 ? num(halfLifeDays) : 30;
    const clone = cloneLead(lead);
    if (!clone.behavior || typeof clone.behavior !== 'object') return clone;
    const asOf = (opts && opts.asOf) || new Date().toISOString();
    const anchor = clone.behavior.lastActivityAt || clone.createdAt || asOf;
    const age = daysBetween(anchor, asOf);
    if (age <= 0) return clone;
    const factor = Math.pow(0.5, age / half);
    for (const k of Object.keys(BEHAVIORAL_CEILINGS)) {
      if (typeof clone.behavior[k] === 'number') {
        // Keep a fraction of the counter. No rounding — tests will
        // compare with tolerance.
        clone.behavior[k] = clone.behavior[k] * factor;
      }
    }
    clone.behavior._decayFactor = factor;
    clone.behavior._decayedAt   = asOf;
    clone.behavior._decayAgeDays = age;
    return clone;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. UPGRADE LAYER (Y023.2.0) — Multi-Model Store + Event Log + Bands
// ═══════════════════════════════════════════════════════════════════════════
//
// Rule: "לא מוחקים רק משדרגים ומגדלים" — the original BANT engine above is
// preserved as-is. The upgrade layer adds a parallel "model registry"
// indexed by id, an append-only event log, and band-distribution / explain
// helpers that target leads by their string id (the original API still
// works on raw lead objects). Both APIs co-exist on the same LeadScorer
// instance — nothing has been removed.
//
// New dimensions registered by the dimension-rule layer:
//   industry_fit         — enum
//   company_size         — numeric (banded)
//   job_title            — enum
//   budget_range         — numeric (banded)
//   timeline             — enum
//   engagement_recency   — numeric (days, inverse)
//   email_engagement     — event-derived
//   website_activity     — event-derived
//   content_consumption  — event-derived
//   pricing_interest     — event-derived
//
// New event types:
//   email_opened          (+1)
//   link_clicked          (+2)
//   demo_booked           (+10)
//   website_visit         (+1)
//   content_downloaded    (+3)
//   pricing_page_visited  (+5)
//   unsubscribed          (-15)

/**
 * Three-band classification (hot/warm/cold) used by the upgrade-layer
 * scoring model. Distinct from CLASS_THRESHOLDS (which keeps the original
 * 4-band Hot/Warm/Cool/Cold scheme alive — לא מוחקים).
 */
const BAND_THRESHOLDS_DEFAULT = Object.freeze({
  hot:  80,
  warm: 50,
  cold: 20,
});

/**
 * Bilingual labels for the new band scheme + the new dimensions.
 */
const BAND_GLOSSARY = Object.freeze({
  hot:  { he: 'חם',  en: 'Hot' },
  warm: { he: 'פושר', en: 'Warm' },
  cold: { he: 'קר',  en: 'Cold' },
});

const DIMENSION_GLOSSARY = Object.freeze({
  industry_fit:        { he: 'התאמת תעשייה',         en: 'Industry fit' },
  company_size:        { he: 'גודל חברה',            en: 'Company size' },
  job_title:           { he: 'תפקיד',                en: 'Job title' },
  budget_range:        { he: 'טווח תקציב',           en: 'Budget range' },
  timeline:            { he: 'לוח זמנים',            en: 'Timeline' },
  engagement_recency:  { he: 'מידת רעננות הקשר',     en: 'Engagement recency' },
  email_engagement:    { he: 'מעורבות בדוא״ל',       en: 'Email engagement' },
  website_activity:    { he: 'פעילות באתר',          en: 'Website activity' },
  content_consumption: { he: 'צריכת תוכן',           en: 'Content consumption' },
  pricing_interest:    { he: 'עניין במחיר',          en: 'Pricing interest' },
});

/**
 * Score deltas applied by recordEvent() for known event types.
 * Negative values are allowed (unsubscribed pushes the score DOWN, but
 * we never delete the event — append-only log per the rule).
 */
const EVENT_SCORE_DELTAS = Object.freeze({
  email_opened:         1,
  link_clicked:         2,
  demo_booked:         10,
  website_visit:        1,
  content_downloaded:   3,
  pricing_page_visited: 5,
  unsubscribed:       -15,
});

/**
 * Which dimensions each event type contributes to. A demo booking is
 * primarily timeline + pricing intent; pricing visits feed pricing_interest;
 * downloads feed content_consumption; etc.
 */
const EVENT_DIMENSION_MAP = Object.freeze({
  email_opened:         ['email_engagement'],
  link_clicked:         ['email_engagement', 'website_activity'],
  demo_booked:          ['timeline', 'pricing_interest'],
  website_visit:        ['website_activity'],
  content_downloaded:   ['content_consumption'],
  pricing_page_visited: ['pricing_interest'],
  unsubscribed:         ['email_engagement'],
});

/**
 * Decay base — exponential 0.9^(days/30). Per the spec, a lead that has
 * been silent for 30 days keeps 90% of its behavioural score; 60 days → 81%;
 * 90 days → 72.9%; etc. This is GENTLER than the BANT half-life decay
 * above (which uses 0.5^(days/half)) because the upgrade layer scores at
 * the dimension level, not at raw counter level.
 */
const DECAY_BASE = 0.9;
const DECAY_WINDOW_DAYS = 30;

/**
 * Normalise a band token. Accepts 'hot' / 'Hot' / 'HOT' / 'חם'.
 */
function normBand(s) {
  const t = String(s || '').toLowerCase().trim();
  if (t === 'חם')  return 'hot';
  if (t === 'פושר') return 'warm';
  if (t === 'קר')  return 'cold';
  return t;
}

/**
 * Default dimension rule evaluator. A "dimension" in the upgrade layer is
 * a {key, weight, rule:{type, ...}} object. Rule types:
 *
 *   numeric  — { type:'numeric', bands:[{upper, score}] | min, max }
 *              applied to lead.demographic[key] or lead[key].
 *   enum     — { type:'enum', map:{value:score, ...} }
 *   boolean  — { type:'boolean', whenTrue, whenFalse }
 *   event    — { type:'event', events:[type, ...], cap }
 *              sums recorded events of the listed types for this lead and
 *              normalises against `cap` (default 10).
 *
 * The function returns a [0..1] raw dimension score.
 */
function evaluateDimensionRule(dim, lead, eventLog) {
  if (!dim || !dim.rule) return 0;
  const r = dim.rule;
  const k = dim.key;
  // Pull the value from a few common locations.
  const demo = (lead && (lead.demographic || lead.demographics)) || {};
  const beh  = (lead && lead.behavior) || {};
  const flat = lead || {};
  const value = (k in demo) ? demo[k]
              : (k in beh)  ? beh[k]
              : flat[k];

  switch (r.type) {
    case 'numeric': {
      const v = num(value);
      if (Array.isArray(r.bands) && r.bands.length > 0) {
        return clamp(bandScore(v, r.bands), 0, 1);
      }
      const min = num(r.min);
      const max = num(r.max) || 1;
      if (max === min) return 0;
      return clamp((v - min) / (max - min), 0, 1);
    }
    case 'enum': {
      const key = normEnum(value);
      if (r.map && key in r.map) return clamp(num(r.map[key]), 0, 1);
      // Allow case-sensitive fallback for non-ASCII keys (Hebrew industry names).
      if (r.map && value != null && String(value) in r.map) {
        return clamp(num(r.map[String(value)]), 0, 1);
      }
      return 0;
    }
    case 'boolean': {
      const truthy = !!value;
      const yes = r.whenTrue != null ? num(r.whenTrue) : 1;
      const no  = r.whenFalse != null ? num(r.whenFalse) : 0;
      return clamp(truthy ? yes : no, 0, 1);
    }
    case 'event': {
      if (!Array.isArray(eventLog) || eventLog.length === 0) return 0;
      const types = Array.isArray(r.events) ? new Set(r.events) : new Set();
      const cap = num(r.cap) > 0 ? num(r.cap) : 10;
      let sum = 0;
      for (const ev of eventLog) {
        if (types.has(ev.type)) sum += num(ev.value || 1);
      }
      // Saturating curve so 100 events doesn't dwarf 10.
      return clamp(1 - Math.exp(-sum / cap), 0, 1);
    }
    default:
      return 0;
  }
}

/**
 * Build the default 10-dimension model from the spec list. Used when a
 * caller asks for `getDefaultDimensionModel()` or when the bridge needs a
 * starter blueprint.
 */
function getDefaultDimensionModel() {
  return {
    id: 'default-y023-v2',
    dimensions: [
      {
        key: 'industry_fit',
        weight: 0.10,
        rule: {
          type: 'enum',
          map: {
            'manufacturing':   1.0,
            'construction':    0.95,
            'real-estate':     0.9,
            'logistics':       0.85,
            'retail':          0.7,
            'services':        0.6,
            'education':       0.4,
            'government':      0.5,
            'other':           0.3,
          },
        },
      },
      {
        key: 'company_size',
        weight: 0.12,
        rule: {
          type: 'numeric',
          bands: [
            { upper: 10,    score: 0.20 },
            { upper: 50,    score: 0.50 },
            { upper: 200,   score: 0.75 },
            { upper: 1000,  score: 0.90 },
            { upper: Infinity, score: 1.00 },
          ],
        },
      },
      {
        key: 'job_title',
        weight: 0.10,
        rule: {
          type: 'enum',
          map: {
            'ceo': 1.0, 'cfo': 1.0, 'coo': 1.0, 'cto': 1.0,
            'vp': 0.85, 'director': 0.7, 'manager': 0.5,
            'analyst': 0.3, 'student': 0.1, 'unknown': 0.2,
          },
        },
      },
      {
        key: 'budget_range',
        weight: 0.13,
        rule: {
          type: 'numeric',
          bands: [
            { upper: 10_000,    score: 0.10 },
            { upper: 50_000,    score: 0.35 },
            { upper: 250_000,   score: 0.65 },
            { upper: 1_000_000, score: 0.85 },
            { upper: Infinity,  score: 1.00 },
          ],
        },
      },
      {
        key: 'timeline',
        weight: 0.10,
        rule: {
          type: 'enum',
          map: {
            'immediate':    1.0,
            'this-month':   0.9,
            'this-quarter': 0.75,
            'this-year':    0.5,
            'next-year':    0.25,
            'no-timeline':  0.1,
          },
        },
      },
      {
        key: 'engagement_recency',
        weight: 0.10,
        rule: {
          type: 'numeric',
          bands: [
            { upper: 7,    score: 1.00 },
            { upper: 30,   score: 0.80 },
            { upper: 60,   score: 0.50 },
            { upper: 120,  score: 0.25 },
            { upper: Infinity, score: 0.05 },
          ],
        },
      },
      {
        key: 'email_engagement',
        weight: 0.08,
        rule: { type: 'event', events: ['email_opened', 'link_clicked'], cap: 8 },
      },
      {
        key: 'website_activity',
        weight: 0.09,
        rule: { type: 'event', events: ['website_visit', 'link_clicked'], cap: 10 },
      },
      {
        key: 'content_consumption',
        weight: 0.08,
        rule: { type: 'event', events: ['content_downloaded'], cap: 5 },
      },
      {
        key: 'pricing_interest',
        weight: 0.10,
        rule: { type: 'event', events: ['pricing_page_visited', 'demo_booked'], cap: 4 },
      },
    ],
    thresholds: { hot: 80, warm: 50, cold: 20 },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// 4.1  Extend LeadScorer with the upgrade-layer methods.
//      We do NOT replace any existing method — these are additive.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Lazy initialiser for the upgrade-layer state. Called by every new method
 * so existing code paths (constructor, defineModel, scoreLead, etc.) keep
 * working unmodified for callers that never touch the new API.
 */
LeadScorer.prototype._ensureUpgradeState = function _ensureUpgradeState() {
  if (!this._models)        this._models        = new Map();
  if (!this._leads)         this._leads         = new Map();
  if (!this._eventLog)      this._eventLog      = [];          // append-only
  if (!this._scoreSnapshots) this._scoreSnapshots = new Map(); // leadId -> [{at, score, band, modelId}]
  if (!this._activeModelId) this._activeModelId = null;
};

/**
 * Register (or upgrade) a scoring model in the multi-model registry.
 *
 *   {
 *     id: 'enterprise-q2',
 *     dimensions: [
 *       { key:'industry_fit',  weight:0.15, rule:{type:'enum',  map:{...}} },
 *       { key:'company_size',  weight:0.10, rule:{type:'numeric', bands:[...]} },
 *       ...
 *     ],
 *     thresholds: { hot:80, warm:50, cold:20 }
 *   }
 *
 * Per the rule "לא מוחקים", redefining an existing id KEEPS the previous
 * version in `previousVersions[]` on the model record.
 */
LeadScorer.prototype.defineScoringModel = function defineScoringModel(def) {
  this._ensureUpgradeState();
  if (!def || typeof def !== 'object') {
    throw new Error('LeadScorer.defineScoringModel: definition object required');
  }
  if (!def.id || typeof def.id !== 'string') {
    throw new Error('LeadScorer.defineScoringModel: id (string) required');
  }
  if (!Array.isArray(def.dimensions) || def.dimensions.length === 0) {
    throw new Error('LeadScorer.defineScoringModel: dimensions[] required');
  }
  // Validate each dimension shape.
  const seen = new Set();
  const cleaned = def.dimensions.map((d, i) => {
    if (!d || !d.key || typeof d.key !== 'string') {
      throw new Error(`LeadScorer.defineScoringModel: dim[${i}].key missing`);
    }
    if (seen.has(d.key)) {
      throw new Error(`LeadScorer.defineScoringModel: duplicate key '${d.key}'`);
    }
    seen.add(d.key);
    const w = num(d.weight);
    if (w < 0) throw new Error(`LeadScorer.defineScoringModel: dim '${d.key}' weight < 0`);
    if (!d.rule || typeof d.rule !== 'object') {
      throw new Error(`LeadScorer.defineScoringModel: dim '${d.key}' rule missing`);
    }
    const t = d.rule.type;
    if (t !== 'numeric' && t !== 'enum' && t !== 'boolean' && t !== 'event') {
      throw new Error(
        `LeadScorer.defineScoringModel: dim '${d.key}' rule.type must be numeric|enum|boolean|event`
      );
    }
    return {
      key:    d.key,
      weight: w,
      rule:   JSON.parse(JSON.stringify(d.rule)),
    };
  });
  // Normalise weights to sum to 1.
  const total = cleaned.reduce((s, x) => s + x.weight, 0);
  if (total <= 0) {
    throw new Error('LeadScorer.defineScoringModel: at least one dimension needs weight > 0');
  }
  for (const c of cleaned) c.weight = c.weight / total;

  const thresholds = Object.assign({}, BAND_THRESHOLDS_DEFAULT, def.thresholds || {});

  const previous = this._models.get(def.id);
  const record = {
    id:           def.id,
    dimensions:   cleaned,
    thresholds,
    createdAt:    (previous && previous.createdAt) || new Date().toISOString(),
    updatedAt:    new Date().toISOString(),
    version:      previous ? previous.version + 1 : 1,
    previousVersions: previous
      ? previous.previousVersions.concat([{
          version:    previous.version,
          dimensions: previous.dimensions,
          thresholds: previous.thresholds,
          updatedAt:  previous.updatedAt,
        }])
      : [],
  };
  this._models.set(def.id, record);
  if (!this._activeModelId) this._activeModelId = def.id;
  return record;
};

/**
 * Polymorphic scoring entry-point.
 *   - scoreLead(leadObject)            → original BANT engine (unchanged)
 *   - scoreLead(leadObject, modelId)   → upgrade-layer dimension model
 *   - scoreLead(leadId, modelId)       → fetches lead from registry
 *
 * Returns:
 *   - original {total, class, breakdown, metadata} when no modelId given
 *   - upgrade  {score, band, breakdown, modelId, leadId, asOf} when modelId given
 */
const _origScoreLead = LeadScorer.prototype.scoreLead;
LeadScorer.prototype.scoreLead = function scoreLead(leadOrId, modelId) {
  // Backwards-compat: no modelId → original engine.
  if (modelId == null) {
    return _origScoreLead.call(this, leadOrId);
  }
  this._ensureUpgradeState();
  const model = this._models.get(modelId);
  if (!model) {
    throw new Error(`LeadScorer.scoreLead: unknown modelId '${modelId}'`);
  }
  // Resolve lead by id or accept inline object.
  let lead, leadId;
  if (typeof leadOrId === 'string') {
    leadId = leadOrId;
    lead   = this._leads.get(leadId) || { id: leadId };
  } else if (leadOrId && typeof leadOrId === 'object') {
    lead   = leadOrId;
    leadId = lead.id || null;
    if (leadId && !this._leads.has(leadId)) this._leads.set(leadId, lead);
  } else {
    throw new Error('LeadScorer.scoreLead: lead or leadId required');
  }
  const leadEvents = leadId
    ? this._eventLog.filter((e) => e.leadId === leadId)
    : [];

  let total = 0;
  const breakdown = [];
  for (const dim of model.dimensions) {
    let raw = 0;
    try {
      raw = clamp(num(evaluateDimensionRule(dim, lead, leadEvents)), 0, 1);
    } catch (_) {
      raw = 0;
    }
    const max = dim.weight * 100;
    const weighted = raw * max;
    total += weighted;
    const label = DIMENSION_GLOSSARY[dim.key] || { he: dim.key, en: dim.key };
    breakdown.push({
      key:           dim.key,
      labelHe:       label.he,
      labelEn:       label.en,
      ruleType:      dim.rule.type,
      weight:        round(dim.weight, 4),
      rawScore:      round(raw, 4),
      weightedScore: round(weighted, 2),
      max:           round(max, 2),
    });
  }
  const score = round(clamp(total, 0, 100), 2);
  const band  = this._classifyBand(score, model.thresholds);
  const result = {
    score,
    band,
    breakdown,
    modelId: model.id,
    leadId,
    asOf: new Date().toISOString(),
  };
  // Snapshot for trends / bandDistribution.
  if (leadId) {
    if (!this._scoreSnapshots.has(leadId)) this._scoreSnapshots.set(leadId, []);
    this._scoreSnapshots.get(leadId).push({
      at:      result.asOf,
      score,
      band,
      modelId: model.id,
    });
  }
  return result;
};

/** Three-band classification given a numeric score. */
LeadScorer.prototype._classifyBand = function _classifyBand(score, thresholds) {
  const t = thresholds || BAND_THRESHOLDS_DEFAULT;
  const s = num(score);
  if (s >= t.hot)  return 'hot';
  if (s >= t.warm) return 'warm';
  if (s >= t.cold) return 'cold';
  return 'cold';
};

/**
 * Append an engagement event to the immutable event log AND store the lead
 * if it isn't already known.
 *
 *   recordEvent({ leadId, type, value, timestamp })
 *
 * `value` defaults to the EVENT_SCORE_DELTAS table entry. `timestamp`
 * defaults to now.
 *
 * Returns the recorded event record (with assigned `at` and `delta`).
 */
LeadScorer.prototype.recordEvent = function recordEvent(ev) {
  this._ensureUpgradeState();
  if (!ev || typeof ev !== 'object') {
    throw new Error('LeadScorer.recordEvent: event object required');
  }
  if (!ev.leadId || typeof ev.leadId !== 'string') {
    throw new Error('LeadScorer.recordEvent: leadId required');
  }
  if (!ev.type || typeof ev.type !== 'string') {
    throw new Error('LeadScorer.recordEvent: type required');
  }
  const known = ev.type in EVENT_SCORE_DELTAS;
  const delta = ev.value != null ? num(ev.value) : (known ? EVENT_SCORE_DELTAS[ev.type] : 1);
  const at = ev.timestamp || new Date().toISOString();
  const record = Object.freeze({
    leadId:    ev.leadId,
    type:      ev.type,
    value:     delta,
    delta,
    at,
    dimensions: EVENT_DIMENSION_MAP[ev.type] || [],
    seq:       this._eventLog.length + 1,
  });
  this._eventLog.push(record);          // append-only
  if (!this._leads.has(ev.leadId)) {
    this._leads.set(ev.leadId, { id: ev.leadId });
  }
  return record;
};

/**
 * Apply exponential decay to the most recent scoreSnapshot of `leadId`.
 *
 *   factor = 0.9 ^ (daysSinceEngagement / 30)
 *
 * Returns the decayed score (a number) AND pushes a derived snapshot
 * marked `decayed:true` so the trend line is intact.
 *
 * Per the rule "לא מוחקים", the original snapshot is left untouched.
 */
LeadScorer.prototype.decayScore = function decayScore(leadId, daysSinceEngagement) {
  this._ensureUpgradeState();
  const list = this._scoreSnapshots.get(leadId);
  if (!list || list.length === 0) {
    return { decayedScore: 0, factor: 0, original: 0, leadId };
  }
  const days = Math.max(0, num(daysSinceEngagement));
  const factor = Math.pow(DECAY_BASE, days / DECAY_WINDOW_DAYS);
  // Find the latest non-decayed snapshot to decay from.
  let base = null;
  for (let i = list.length - 1; i >= 0; i--) {
    if (!list[i].decayed) { base = list[i]; break; }
  }
  if (!base) base = list[list.length - 1];
  const decayedScore = round(clamp(base.score * factor, 0, 100), 2);
  const newSnap = {
    at:        new Date().toISOString(),
    score:     decayedScore,
    band:      this._classifyBand(
      decayedScore,
      (this._models.get(base.modelId) || {}).thresholds || BAND_THRESHOLDS_DEFAULT
    ),
    modelId:   base.modelId,
    decayed:   true,
    factor:    round(factor, 6),
    fromScore: base.score,
    days,
  };
  list.push(newSnap);
  return {
    leadId,
    decayedScore,
    factor:   round(factor, 6),
    original: base.score,
    band:     newSnap.band,
    days,
  };
};

/**
 * Re-calibrate dimension weights of the active model based on closed/lost
 * deal lists. Each deal must carry a `leadId` so we can pull its event log
 * and rerun every dimension as a feature.
 *
 *   recalibrate({ closedDeals:[{leadId, lead?}], lostDeals:[{leadId, lead?}], modelId? })
 *
 * Algorithm:
 *   1. For each deal, compute the per-dimension raw score against its lead.
 *   2. For each dimension compute the mean raw score in won vs lost.
 *   3. correlation_i = mean_won_i - mean_lost_i  (in [-1, 1])
 *   4. new_weight_i = max(minWeight, oldWeight_i * (1 + correlation_i))
 *   5. Normalise so Σ = 1.
 *
 * Per the rule "לא מוחקים", we never zero out a dimension — minWeight = 0.01.
 * The previous weight vector is retained on the model record.
 */
LeadScorer.prototype.recalibrate = function recalibrate(payload) {
  this._ensureUpgradeState();
  if (!payload || typeof payload !== 'object') {
    throw new Error('LeadScorer.recalibrate: payload required');
  }
  const closed = Array.isArray(payload.closedDeals) ? payload.closedDeals : [];
  const lost   = Array.isArray(payload.lostDeals)   ? payload.lostDeals   : [];
  if (closed.length === 0 || lost.length === 0) {
    throw new Error('LeadScorer.recalibrate: need at least one closed and one lost deal');
  }
  const modelId = payload.modelId || this._activeModelId;
  if (!modelId) throw new Error('LeadScorer.recalibrate: no active model — call defineScoringModel first');
  const model = this._models.get(modelId);
  if (!model) throw new Error(`LeadScorer.recalibrate: unknown modelId '${modelId}'`);

  const featuriseDeal = (deal) => {
    let lead = deal.lead;
    if (!lead && deal.leadId) lead = this._leads.get(deal.leadId);
    if (!lead) lead = { id: deal.leadId || null };
    const leadEvents = deal.leadId
      ? this._eventLog.filter((e) => e.leadId === deal.leadId)
      : [];
    return model.dimensions.map((d) =>
      clamp(num(evaluateDimensionRule(d, lead, leadEvents)), 0, 1)
    );
  };

  const wonRows  = closed.map(featuriseDeal);
  const lostRows = lost.map(featuriseDeal);

  const meanWon  = new Array(model.dimensions.length).fill(0);
  const meanLost = new Array(model.dimensions.length).fill(0);
  for (const row of wonRows)  for (let i = 0; i < row.length; i++) meanWon[i]  += row[i];
  for (const row of lostRows) for (let i = 0; i < row.length; i++) meanLost[i] += row[i];
  for (let i = 0; i < meanWon.length; i++) meanWon[i]  /= Math.max(1, wonRows.length);
  for (let i = 0; i < meanLost.length; i++) meanLost[i] /= Math.max(1, lostRows.length);

  const correlation = meanWon.map((w, i) => clamp(w - meanLost[i], -1, 1));

  const minWeight = 0.01;
  const previousWeights = model.dimensions.map((d) => d.weight);
  const raw = model.dimensions.map((d, i) =>
    Math.max(minWeight, d.weight * (1 + correlation[i]))
  );
  const sum = raw.reduce((a, b) => a + b, 0);
  const next = raw.map((w) => w / sum);
  for (let i = 0; i < model.dimensions.length; i++) {
    model.dimensions[i].weight = next[i];
  }
  // Audit: keep previous in the model history.
  model.previousVersions.push({
    version:    model.version,
    dimensions: model.dimensions.map((d, i) => ({ key: d.key, weight: previousWeights[i] })),
    thresholds: model.thresholds,
    updatedAt:  model.updatedAt,
    note:       'pre-recalibrate',
  });
  model.version  += 1;
  model.updatedAt = new Date().toISOString();

  return {
    modelId,
    iterations: 1,
    correlation,
    previousWeights,
    nextWeights: next,
    wonCount:   closed.length,
    lostCount:  lost.length,
  };
};

/**
 * Polymorphic explain. Original signature explainScore(leadObject) is
 * preserved (it returns the BANT bilingual explanation). New signature
 * explainScore(leadId, modelId?) returns the upgrade-layer breakdown.
 */
const _origExplainScore = LeadScorer.prototype.explainScore;
LeadScorer.prototype.explainScore = function explainScore(leadOrId, modelId) {
  // Original API: an object → BANT engine.
  if (leadOrId && typeof leadOrId === 'object' && modelId == null) {
    return _origExplainScore.call(this, leadOrId);
  }
  this._ensureUpgradeState();
  const id = typeof leadOrId === 'string' ? leadOrId : (leadOrId && leadOrId.id);
  if (!id) throw new Error('LeadScorer.explainScore: leadId required');
  const useModel = modelId || this._activeModelId;
  if (!useModel) throw new Error('LeadScorer.explainScore: no active model');
  const result = this.scoreLead(id, useModel);
  // Bilingual reasons sorted by contribution descending.
  const reasons = result.breakdown
    .slice()
    .sort((a, b) => b.weightedScore - a.weightedScore)
    .map((row) => ({
      key: row.key,
      he:  `${row.labelHe}: ${row.weightedScore} מתוך ${row.max} נקודות `
         + `(${Math.round((row.rawScore || 0) * 100)}%, משקל ${Math.round(row.weight * 100)}%).`,
      en:  `${row.labelEn}: ${row.weightedScore} of ${row.max} points `
         + `(${Math.round((row.rawScore || 0) * 100)}%, weight ${Math.round(row.weight * 100)}%).`,
    }));
  const bandLabel = BAND_GLOSSARY[result.band] || { he: result.band, en: result.band };
  return {
    leadId:  id,
    modelId: useModel,
    score:   result.score,
    band:    result.band,
    bandLabelHe: bandLabel.he,
    bandLabelEn: bandLabel.en,
    breakdown: result.breakdown,
    reasons,
    summary: {
      he: `סה"כ ${result.score}/100 — הליד מסווג כ${bandLabel.he}.`,
      en: `Total ${result.score}/100 — lead classified as ${bandLabel.en}.`,
    },
  };
};

/**
 * Count of hot/warm/cold leads across all snapshots, optionally filtered to
 * a time window.
 *
 *   bandDistribution()                    — all snapshots ever
 *   bandDistribution({sinceISO, untilISO}) — restrict to a window
 *   bandDistribution({days: N})            — last N days from "now"
 *
 * Each lead contributes its LATEST snapshot in the window (so a lead that
 * moved hot→warm only counts once, in the warm bucket).
 */
LeadScorer.prototype.bandDistribution = function bandDistribution(period) {
  this._ensureUpgradeState();
  const now = new Date();
  let sinceMs = -Infinity;
  let untilMs = Infinity;
  if (period && typeof period === 'object') {
    if (period.sinceISO) sinceMs = Date.parse(period.sinceISO);
    if (period.untilISO) untilMs = Date.parse(period.untilISO);
    if (period.days != null) {
      const d = num(period.days);
      sinceMs = now.getTime() - d * 86_400_000;
    }
  }
  const counts = { hot: 0, warm: 0, cold: 0, total: 0 };
  for (const [leadId, snaps] of this._scoreSnapshots.entries()) {
    let latest = null;
    for (const s of snaps) {
      const t = Date.parse(s.at);
      if (!Number.isFinite(t)) continue;
      if (t < sinceMs || t > untilMs) continue;
      if (!latest || t > Date.parse(latest.at)) latest = s;
    }
    if (latest) {
      const b = normBand(latest.band);
      if (b === 'hot' || b === 'warm' || b === 'cold') {
        counts[b] += 1;
        counts.total += 1;
      }
    }
  }
  return counts;
};

/**
 * Aggregate which dimensions drive a given band the most. We average the
 * raw score of each dimension across leads currently classified in `band`.
 *
 * Returns an array sorted by mean rawScore descending:
 *
 *   [{ key, labelHe, labelEn, meanRawScore, leadCount }, ...]
 */
LeadScorer.prototype.topReasons = function topReasons(band) {
  this._ensureUpgradeState();
  const target = normBand(band);
  const acc = new Map();   // key → { sum, n, label }
  for (const [leadId, snaps] of this._scoreSnapshots.entries()) {
    if (snaps.length === 0) continue;
    // Find latest non-decayed snapshot for this lead.
    let latest = null;
    for (let i = snaps.length - 1; i >= 0; i--) {
      if (!snaps[i].decayed) { latest = snaps[i]; break; }
    }
    if (!latest) latest = snaps[snaps.length - 1];
    if (normBand(latest.band) !== target) continue;
    // Re-score against the model so we can read the breakdown.
    const model = this._models.get(latest.modelId);
    if (!model) continue;
    let result;
    try {
      result = this.scoreLead(leadId, model.id);
    } catch (_) {
      continue;
    }
    for (const row of result.breakdown) {
      if (!acc.has(row.key)) {
        acc.set(row.key, {
          key:     row.key,
          labelHe: row.labelHe,
          labelEn: row.labelEn,
          sum:     0,
          n:       0,
        });
      }
      const slot = acc.get(row.key);
      slot.sum += row.rawScore;
      slot.n   += 1;
    }
  }
  const out = [];
  for (const v of acc.values()) {
    out.push({
      key:          v.key,
      labelHe:      v.labelHe,
      labelEn:      v.labelEn,
      meanRawScore: round(v.sum / Math.max(1, v.n), 4),
      leadCount:    v.n,
    });
  }
  out.sort((a, b) => b.meanRawScore - a.meanRawScore);
  return out;
};

/**
 * Blended score = 0.5 * demographic + 0.5 * behavioral, where:
 *   - demographic part = sum of weighted scores for non-event dimensions
 *   - behavioral part  = sum of weighted scores for event dimensions
 * Each part is renormalised to [0..100] before blending so a lead with no
 * event log can still produce a sensible total.
 *
 *   blendedScore(leadId, modelId?) → { leadId, modelId, demographic,
 *                                      behavioral, blended, band }
 */
LeadScorer.prototype.blendedScore = function blendedScore(leadId, modelId) {
  this._ensureUpgradeState();
  const useModel = modelId || this._activeModelId;
  if (!useModel) throw new Error('LeadScorer.blendedScore: no active model');
  const model = this._models.get(useModel);
  if (!model) throw new Error(`LeadScorer.blendedScore: unknown modelId '${useModel}'`);
  const result = this.scoreLead(leadId, useModel);
  let demoMax = 0, demoGot = 0, behMax = 0, behGot = 0;
  for (const row of result.breakdown) {
    if (row.ruleType === 'event') {
      behMax += row.max;
      behGot += row.weightedScore;
    } else {
      demoMax += row.max;
      demoGot += row.weightedScore;
    }
  }
  const demoPct = demoMax > 0 ? (demoGot / demoMax) * 100 : 0;
  const behPct  = behMax  > 0 ? (behGot  / behMax)  * 100 : 0;
  // 50/50 blend, fall back to whichever is present if one side is empty.
  let blended;
  if (demoMax > 0 && behMax > 0) {
    blended = 0.5 * demoPct + 0.5 * behPct;
  } else if (demoMax > 0) {
    blended = demoPct;
  } else {
    blended = behPct;
  }
  blended = round(clamp(blended, 0, 100), 2);
  return {
    leadId,
    modelId:     useModel,
    demographic: round(demoPct, 2),
    behavioral:  round(behPct, 2),
    blended,
    rawScore:    result.score,
    band:        this._classifyBand(blended, model.thresholds),
  };
};

/**
 * Convenience: register an inline lead object so future scoreLead(id, model)
 * calls have something to work with. Returns the stored lead.
 */
LeadScorer.prototype.upsertLead = function upsertLead(lead) {
  this._ensureUpgradeState();
  if (!lead || !lead.id) throw new Error('LeadScorer.upsertLead: lead.id required');
  this._leads.set(lead.id, lead);
  return lead;
};

/** Read-only view of every event recorded for a given lead. */
LeadScorer.prototype.getLeadEvents = function getLeadEvents(leadId) {
  this._ensureUpgradeState();
  return this._eventLog.filter((e) => e.leadId === leadId);
};

/** Read-only view of every snapshot for a given lead (decayed and live). */
LeadScorer.prototype.getLeadSnapshots = function getLeadSnapshots(leadId) {
  this._ensureUpgradeState();
  return (this._scoreSnapshots.get(leadId) || []).slice();
};

// ═══════════════════════════════════════════════════════════════════════════
// 5. EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  LeadScorer,
  // re-exports for tests and downstream callers
  MODEL_VERSION,
  CLASS_THRESHOLDS,
  GLOSSARY,
  DECISION_POWER,
  TITLE_BANDS,
  INQUIRY_SCORES,
  URGENCY_SCORES,
  REVENUE_BANDS,
  HEADCOUNT_BANDS,
  BEHAVIORAL_CEILINGS,
  DEFAULT_WEIGHTS,
  TRAIN_DEFAULTS,
  scoreBudget,
  scoreAuthority,
  scoreNeed,
  scoreTimeline,
  makeBehavioralFn,
  buildDefaultFactors,
  sigmoid,
  bandScore,
  clamp,
  round,
  num,
  daysBetween,
  cloneLead,
  normEnum,
  // upgrade layer (Y023.2.0)
  BAND_THRESHOLDS_DEFAULT,
  BAND_GLOSSARY,
  DIMENSION_GLOSSARY,
  EVENT_SCORE_DELTAS,
  EVENT_DIMENSION_MAP,
  DECAY_BASE,
  DECAY_WINDOW_DAYS,
  evaluateDimensionRule,
  getDefaultDimensionModel,
  normBand,
};
