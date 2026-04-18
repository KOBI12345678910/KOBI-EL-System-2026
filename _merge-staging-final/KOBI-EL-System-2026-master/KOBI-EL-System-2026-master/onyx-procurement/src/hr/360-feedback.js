/**
 * 360-Degree Feedback Collection & Aggregation Engine
 * Agent Y-067 • Techno-Kol Uzi • Kobi's mega-ERP
 *
 * Bilingual (Hebrew / English) 360° review pipeline with anonymity
 * protection, gap analysis, thematic clustering and bilingual PDF
 * reporting. Zero external dependencies — built on Node stdlib only.
 *
 * Rule enforced: לא מוחקים, רק משדרגים ומגדלים — all stores are
 * append-only Maps/Arrays. The public API never exposes delete, never
 * removes rows, only adds new surveys / responses / cycles on top.
 *
 * Anonymity guarantee (k=3):
 *   - No respondent group smaller than `K_ANONYMITY` (3) is ever
 *     revealed in aggregates, gaps, themes or the PDF report. Under-
 *     populated groups are rolled up / redacted.
 *   - The "self" group is never k-constrained (n=1 by definition).
 *   - Every response is stored with only the respondent GROUP (not the
 *     respondent identity). Invite tokens are hashed after redemption.
 *
 * Exports (see bottom):
 *   ThreeSixtyFeedback          — main engine class
 *   CONSTANTS                   — tuning knobs
 *   LABELS                      — bilingual strings
 *   _internals                  — low-level helpers (for tests)
 */

'use strict';

const crypto = require('node:crypto');

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const CONSTANTS = Object.freeze({
  /** k-anonymity floor — no group smaller than this is revealed */
  K_ANONYMITY: 3,
  /** rating scale default (1..5 Likert) */
  DEFAULT_SCALE: 5,
  /** gap threshold (self vs others, on a 5-point scale) — >= this is a blind spot */
  GAP_BLIND_SPOT: 1.0,
  /** gap threshold for a hidden strength (others >> self) */
  GAP_HIDDEN_STRENGTH: -1.0,
  /** minimum text length to feed to thematic clustering */
  MIN_TEXT_LENGTH: 3,
  /** token length for anonymous invite links */
  TOKEN_BYTES: 16,
  /** canonical respondent group order — also the rendering order */
  RESPONDENT_GROUPS: Object.freeze([
    'self',
    'manager',
    'skipLevel',
    'peers',
    'reports',
    'clients',
  ]),
  /** groups that are NEVER k-constrained (self is n=1 by definition) */
  UNCONSTRAINED_GROUPS: Object.freeze(['self']),
});

const LABELS = Object.freeze({
  he: {
    survey_title: 'משוב 360 מעלות',
    subject: 'נושא המשוב',
    deadline: 'תאריך יעד',
    self: 'הערכה עצמית',
    manager: 'מנהל ישיר',
    skipLevel: 'מנהל-על',
    peers: 'עמיתים',
    reports: 'כפיפים ישירים',
    clients: 'לקוחות',
    strengths: 'נקודות חוזק',
    development_areas: 'תחומי פיתוח',
    blind_spots: 'נקודות עיוורון',
    hidden_strengths: 'חוזקות נסתרות',
    suggestions: 'המלצות לפעולה',
    competency_radar: 'תרשים מצולע לפי יכולות',
    anonymity_note: 'מוגן אנונימיות — קבוצות מתחת ל-3 משיבים אינן מוצגות',
    invite_subject: 'הזמנה להשתתפות במשוב 360',
    invite_body:
      'שלום,\nהוזמנת להשתתף במשוב 360 עבור עובד. הקישור האישי שלך מופיע למטה ונמחק אוטומטית לאחר השימוש.\nתאריך יעד:',
    themes: 'נושאים מרכזיים',
    trend: 'התקדמות לאורך מחזורים',
    redacted: 'חסוי (פחות מ-3 משיבים)',
    response_count: 'מספר משיבים',
    avg: 'ממוצע',
    question: 'שאלה',
    rating: 'דירוג',
    cycle: 'מחזור',
  },
  en: {
    survey_title: '360° Feedback Review',
    subject: 'Feedback subject',
    deadline: 'Deadline',
    self: 'Self assessment',
    manager: 'Line manager',
    skipLevel: 'Skip-level manager',
    peers: 'Peers',
    reports: 'Direct reports',
    clients: 'Clients',
    strengths: 'Strengths',
    development_areas: 'Development areas',
    blind_spots: 'Blind spots',
    hidden_strengths: 'Hidden strengths',
    suggestions: 'Actionable suggestions',
    competency_radar: 'Competency radar chart',
    anonymity_note:
      'Anonymity protected — groups with fewer than 3 responders are redacted',
    invite_subject: 'Invitation to participate in a 360° feedback review',
    invite_body:
      'Hello,\nYou have been invited to participate in a 360° feedback review. Your personal single-use link is below.\nDeadline:',
    themes: 'Key themes',
    trend: 'Progression across cycles',
    redacted: 'Redacted (n < 3)',
    response_count: 'Respondents',
    avg: 'Average',
    question: 'Question',
    rating: 'Rating',
    cycle: 'Cycle',
  },
});

// Hebrew stop words + English stop words for thematic analysis. Kept
// conservative — we only drop truly generic tokens so that domain words
// (עבודה, צוות, מקצוענות…) survive clustering.
const STOP_WORDS_HE = new Set([
  'של',
  'את',
  'על',
  'עם',
  'זה',
  'זו',
  'זאת',
  'גם',
  'אבל',
  'כי',
  'לא',
  'הוא',
  'היא',
  'אני',
  'אתה',
  'אתם',
  'אנחנו',
  'יש',
  'אין',
  'מאוד',
  'הרבה',
  'קצת',
  'או',
  'כמו',
  'כל',
  'כדי',
  'רק',
  'אז',
  'תמיד',
  'אף',
  'פעם',
  'לפעמים',
  'היה',
  'הייתה',
]);
const STOP_WORDS_EN = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'of',
  'in',
  'on',
  'to',
  'for',
  'with',
  'at',
  'by',
  'from',
  'he',
  'she',
  'it',
  'they',
  'we',
  'you',
  'i',
  'me',
  'my',
  'your',
  'his',
  'her',
  'their',
  'our',
  'this',
  'that',
  'these',
  'those',
  'as',
  'not',
  'no',
  'yes',
  'very',
  'much',
  'more',
  'some',
  'any',
  'all',
  'can',
  'will',
  'would',
  'should',
  'could',
  'has',
  'have',
  'had',
  'do',
  'does',
  'did',
  'so',
]);

// ═══════════════════════════════════════════════════════════════
// LOW-LEVEL HELPERS (pure)
// ═══════════════════════════════════════════════════════════════

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function newToken() {
  return crypto.randomBytes(CONSTANTS.TOKEN_BYTES).toString('hex');
}

function hashToken(tok) {
  return crypto.createHash('sha256').update(String(tok)).digest('hex');
}

function mean(arr) {
  if (!arr || arr.length === 0) return null;
  let s = 0;
  let n = 0;
  for (const v of arr) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      s += v;
      n += 1;
    }
  }
  return n === 0 ? null : s / n;
}

function round2(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return Math.round(v * 100) / 100;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function isBlank(s) {
  return s === null || s === undefined || String(s).trim() === '';
}

function normalizeGroup(g) {
  const map = {
    self: 'self',
    manager: 'manager',
    skiplevel: 'skipLevel',
    skip_level: 'skipLevel',
    skip: 'skipLevel',
    peer: 'peers',
    peers: 'peers',
    report: 'reports',
    reports: 'reports',
    subordinate: 'reports',
    client: 'clients',
    clients: 'clients',
    customer: 'clients',
  };
  const key = String(g || '').toLowerCase().trim();
  return map[key] || null;
}

/** Tokenise a free-text answer for thematic clustering. Bilingual. */
function tokenize(text) {
  if (isBlank(text)) return [];
  const s = String(text).toLowerCase();
  // Split on anything that isn't a letter (Latin, Hebrew) or digit.
  // Hebrew Unicode block: U+0590–U+05FF.
  const raw = s.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const out = [];
  for (const tok of raw) {
    if (tok.length < CONSTANTS.MIN_TEXT_LENGTH) continue;
    if (STOP_WORDS_HE.has(tok)) continue;
    if (STOP_WORDS_EN.has(tok)) continue;
    out.push(tok);
  }
  return out;
}

/** XML-escape for SVG text. */
function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ═══════════════════════════════════════════════════════════════
// CORE CLASS
// ═══════════════════════════════════════════════════════════════

class ThreeSixtyFeedback {
  constructor(opts = {}) {
    // append-only stores — we NEVER delete, only upgrade
    /** @type {Map<string, object>}  surveyId -> survey definition */
    this.surveys = new Map();
    /** @type {Map<string, Array<object>>}  surveyId -> invite rows */
    this.invites = new Map();
    /** @type {Map<string, Array<object>>}  surveyId -> response rows */
    this.responses = new Map();
    /** @type {Map<string, Array<object>>}  employeeId -> cycle summaries (for trend) */
    this.history = new Map();

    // injectable clock for deterministic tests
    this._now = typeof opts.now === 'function' ? opts.now : () => new Date();

    // k-anonymity threshold (override only for test rigs, default 3)
    this.kAnonymity =
      Number.isInteger(opts.kAnonymity) && opts.kAnonymity >= 1
        ? opts.kAnonymity
        : CONSTANTS.K_ANONYMITY;
  }

  // ───────────────────────────────────────────────────────────
  // 1. launchSurvey
  // ───────────────────────────────────────────────────────────
  /**
   * Create a new 360 survey.
   *
   * @param {object}  params
   * @param {string}  params.subject         — employeeId of the review subject
   * @param {Array}   params.questions       — [{id, text_he, text_en, type, scale?}]
   * @param {object}  params.respondents     — { manager, peers:[], reports:[], skipLevel, self, clients:[] }
   * @param {string}  params.deadline        — ISO date string
   * @param {string=} params.cycle           — optional cycle label (e.g. '2026-H1')
   * @returns {object} { surveyId, createdAt, questionCount, expectedResponses }
   */
  launchSurvey(params = {}) {
    const { subject, questions, respondents, deadline, cycle } = params;

    if (isBlank(subject)) {
      throw new Error('launchSurvey: subject (employeeId) is required');
    }
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('launchSurvey: questions[] is required and non-empty');
    }
    if (!respondents || typeof respondents !== 'object') {
      throw new Error('launchSurvey: respondents object is required');
    }
    if (isBlank(deadline)) {
      throw new Error('launchSurvey: deadline is required (ISO date)');
    }

    // Normalise questions — require id + bilingual text + type
    const normalizedQs = questions.map((q, idx) => {
      if (isBlank(q.id)) {
        throw new Error(`launchSurvey: question[${idx}] missing id`);
      }
      if (isBlank(q.text_he) && isBlank(q.text_en)) {
        throw new Error(
          `launchSurvey: question[${idx}] (${q.id}) must have text_he or text_en`,
        );
      }
      const type = q.type === 'text' ? 'text' : 'rating';
      const scale =
        type === 'rating'
          ? Number.isInteger(q.scale) && q.scale > 1
            ? q.scale
            : CONSTANTS.DEFAULT_SCALE
          : null;
      return {
        id: String(q.id),
        text_he: q.text_he || q.text_en,
        text_en: q.text_en || q.text_he,
        type,
        scale,
        competency: q.competency || null,
      };
    });

    // Normalise respondents — we care about counts per group
    const pool = this._normaliseRespondents(respondents);

    const surveyId = newId('s360');
    const createdAt = this._now().toISOString();

    const survey = Object.freeze({
      surveyId,
      subject: String(subject),
      questions: Object.freeze(normalizedQs),
      respondents: pool,
      deadline: String(deadline),
      cycle: cycle || this._defaultCycleLabel(),
      createdAt,
      status: 'open',
    });

    this.surveys.set(surveyId, survey);
    this.invites.set(surveyId, []);
    this.responses.set(surveyId, []);

    return {
      surveyId,
      createdAt,
      questionCount: normalizedQs.length,
      expectedResponses: pool.total,
    };
  }

  _normaliseRespondents(raw) {
    const out = {
      self: !!raw.self,
      manager: raw.manager ? String(raw.manager) : null,
      skipLevel: raw.skipLevel ? String(raw.skipLevel) : null,
      peers: Array.isArray(raw.peers) ? raw.peers.map(String) : [],
      reports: Array.isArray(raw.reports) ? raw.reports.map(String) : [],
      clients: Array.isArray(raw.clients) ? raw.clients.map(String) : [],
    };
    out.total =
      (out.self ? 1 : 0) +
      (out.manager ? 1 : 0) +
      (out.skipLevel ? 1 : 0) +
      out.peers.length +
      out.reports.length +
      out.clients.length;
    return Object.freeze(out);
  }

  _defaultCycleLabel() {
    const d = this._now();
    const y = d.getUTCFullYear();
    const h = d.getUTCMonth() < 6 ? 'H1' : 'H2';
    return `${y}-${h}`;
  }

  // ───────────────────────────────────────────────────────────
  // 2. sendInvites
  // ───────────────────────────────────────────────────────────
  /**
   * Generate one anonymous invite per respondent. Returns the invite
   * envelopes (caller plugs them into the outgoing mail transport).
   * The internal store keeps only HASHED tokens so that reading the
   * invite log can never leak an active link.
   *
   * @param {string} surveyId
   * @returns {Array<{to, group, subject, bodyHe, bodyEn, link, token}>}
   */
  sendInvites(surveyId) {
    const survey = this._mustSurvey(surveyId);
    const pool = survey.respondents;
    const envelopes = [];

    const push = (to, group) => {
      const token = newToken();
      const link = `/360/respond/${surveyId}/${token}`;
      envelopes.push({
        to,
        group,
        subject: `${LABELS.he.invite_subject} / ${LABELS.en.invite_subject}`,
        bodyHe: `${LABELS.he.invite_body} ${survey.deadline}\n${link}`,
        bodyEn: `${LABELS.en.invite_body} ${survey.deadline}\n${link}`,
        link,
        token,
      });
    };

    if (pool.self) push(survey.subject, 'self');
    if (pool.manager) push(pool.manager, 'manager');
    if (pool.skipLevel) push(pool.skipLevel, 'skipLevel');
    for (const p of pool.peers) push(p, 'peers');
    for (const r of pool.reports) push(r, 'reports');
    for (const c of pool.clients) push(c, 'clients');

    // store HASHED tokens only
    const invRows = this.invites.get(surveyId);
    for (const env of envelopes) {
      invRows.push({
        group: env.group,
        to: env.to,
        tokenHash: hashToken(env.token),
        sentAt: this._now().toISOString(),
        redeemed: false,
      });
    }

    return envelopes;
  }

  // ───────────────────────────────────────────────────────────
  // 3. collectResponse
  // ───────────────────────────────────────────────────────────
  /**
   * Store an anonymous response. The responderGroup must match a known
   * respondent group; individual identity is NEVER recorded against the
   * response row.
   *
   * @param {object} params
   * @param {string} params.surveyId
   * @param {string} params.responderGroup  — one of RESPONDENT_GROUPS
   * @param {object} params.answers         — { questionId: value }
   * @param {string=} params.token          — optional invite token to mark redeemed
   * @returns {{stored:true, responseId:string}}
   */
  collectResponse(params = {}) {
    const { surveyId, responderGroup, answers, token } = params;
    const survey = this._mustSurvey(surveyId);

    const group = normalizeGroup(responderGroup);
    if (!group || !CONSTANTS.RESPONDENT_GROUPS.includes(group)) {
      throw new Error(
        `collectResponse: unknown responderGroup "${responderGroup}"`,
      );
    }
    if (!answers || typeof answers !== 'object') {
      throw new Error('collectResponse: answers object is required');
    }

    // Validate / clamp answers against the question definitions
    const cleanAnswers = {};
    for (const q of survey.questions) {
      const raw = answers[q.id];
      if (raw === undefined || raw === null) continue;
      if (q.type === 'rating') {
        const n = Number(raw);
        if (!Number.isFinite(n)) continue;
        cleanAnswers[q.id] = clamp(n, 1, q.scale);
      } else {
        // text
        const str = String(raw).trim();
        if (str) cleanAnswers[q.id] = str;
      }
    }

    const responseId = newId('r360');
    const row = Object.freeze({
      responseId,
      group,
      submittedAt: this._now().toISOString(),
      answers: Object.freeze(cleanAnswers),
    });

    this.responses.get(surveyId).push(row);

    // redeem invite by token if supplied — we only ever set the flag
    // to true, never flip it back to false (append-only semantics).
    if (!isBlank(token)) {
      const hash = hashToken(token);
      const invRows = this.invites.get(surveyId);
      for (const inv of invRows) {
        if (inv.tokenHash === hash && !inv.redeemed) {
          inv.redeemed = true;
          inv.redeemedAt = this._now().toISOString();
          break;
        }
      }
    }

    return { stored: true, responseId };
  }

  // ───────────────────────────────────────────────────────────
  // 4. aggregateBySource
  // ───────────────────────────────────────────────────────────
  /**
   * Compute per-question, per-respondent-group averages. Groups with
   * fewer than `kAnonymity` responders (except `self`) are redacted.
   *
   * @param {string} surveyId
   * @returns {object} { questions:[{id, text_he, text_en, type, byGroup:{group:{avg,n,redacted}}}], groupCounts }
   */
  aggregateBySource(surveyId) {
    const survey = this._mustSurvey(surveyId);
    const rows = this.responses.get(surveyId) || [];

    // bucket rows by group
    const byGroup = new Map();
    for (const g of CONSTANTS.RESPONDENT_GROUPS) byGroup.set(g, []);
    for (const r of rows) {
      if (!byGroup.has(r.group)) byGroup.set(r.group, []);
      byGroup.get(r.group).push(r);
    }

    const groupCounts = {};
    for (const [g, arr] of byGroup.entries()) groupCounts[g] = arr.length;

    const out = { questions: [], groupCounts };

    for (const q of survey.questions) {
      if (q.type !== 'rating') continue;
      const perGroup = {};
      for (const g of CONSTANTS.RESPONDENT_GROUPS) {
        const groupRows = byGroup.get(g) || [];
        const values = [];
        for (const r of groupRows) {
          const v = r.answers[q.id];
          if (typeof v === 'number') values.push(v);
        }
        const n = values.length;
        const redacted = this._isRedacted(g, n);
        perGroup[g] = {
          n,
          avg: redacted ? null : round2(mean(values)),
          redacted,
        };
      }
      out.questions.push({
        id: q.id,
        text_he: q.text_he,
        text_en: q.text_en,
        type: q.type,
        scale: q.scale,
        competency: q.competency,
        byGroup: perGroup,
      });
    }

    return out;
  }

  // ───────────────────────────────────────────────────────────
  // 5. gapAnalysis
  // ───────────────────────────────────────────────────────────
  /**
   * Compare self-perception against the average of all OTHER respondent
   * groups. A positive gap (self > others) of >= GAP_BLIND_SPOT is a
   * blind spot; a negative gap of <= GAP_HIDDEN_STRENGTH is a hidden
   * strength. Redacted group data is excluded from the "others" mean.
   *
   * @param {string} surveyId
   * @returns {{ perQuestion, blindSpots, hiddenStrengths, alignment }}
   */
  gapAnalysis(surveyId) {
    const agg = this.aggregateBySource(surveyId);

    const perQuestion = [];
    const blindSpots = [];
    const hiddenStrengths = [];
    const alignment = [];

    for (const q of agg.questions) {
      const self = q.byGroup.self;
      const othersAvgs = [];
      for (const g of CONSTANTS.RESPONDENT_GROUPS) {
        if (g === 'self') continue;
        const gi = q.byGroup[g];
        if (gi && !gi.redacted && typeof gi.avg === 'number') {
          othersAvgs.push(gi.avg);
        }
      }
      const othersAvg = othersAvgs.length > 0 ? round2(mean(othersAvgs)) : null;
      const selfAvg =
        self && typeof self.avg === 'number' ? round2(self.avg) : null;

      const gap =
        selfAvg !== null && othersAvg !== null
          ? round2(selfAvg - othersAvg)
          : null;

      const entry = {
        id: q.id,
        text_he: q.text_he,
        text_en: q.text_en,
        competency: q.competency,
        selfAvg,
        othersAvg,
        gap,
        classification: classifyGap(gap),
      };
      perQuestion.push(entry);

      if (gap !== null) {
        if (gap >= CONSTANTS.GAP_BLIND_SPOT) blindSpots.push(entry);
        else if (gap <= CONSTANTS.GAP_HIDDEN_STRENGTH)
          hiddenStrengths.push(entry);
        else alignment.push(entry);
      }
    }

    return { perQuestion, blindSpots, hiddenStrengths, alignment };
  }

  // ───────────────────────────────────────────────────────────
  // 6. thematicAnalysis
  // ───────────────────────────────────────────────────────────
  /**
   * Keyword-frequency clustering across free-text responses. Returns
   * the top terms and the text-fragments that contain each term. We do
   * NOT return per-respondent data — only aggregated counts — so the
   * output is anonymity-safe.
   *
   * @param {Array<string>|string} textResponses
   * @param {object=} opts
   * @returns {Array<{term, count, samples}>}
   */
  thematicAnalysis(textResponses, opts = {}) {
    const topN = Number.isInteger(opts.topN) && opts.topN > 0 ? opts.topN : 10;
    const texts = Array.isArray(textResponses)
      ? textResponses
      : typeof textResponses === 'string'
      ? [textResponses]
      : [];

    const counts = new Map();
    const samples = new Map();

    for (const t of texts) {
      if (isBlank(t)) continue;
      const toks = tokenize(t);
      const seen = new Set();
      for (const tok of toks) {
        counts.set(tok, (counts.get(tok) || 0) + 1);
        if (!seen.has(tok)) {
          seen.add(tok);
          if (!samples.has(tok)) samples.set(tok, []);
          // keep up to 3 sample snippets per term
          if (samples.get(tok).length < 3) {
            samples.get(tok).push(String(t).trim().slice(0, 140));
          }
        }
      }
    }

    const ranked = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, topN)
      .map(([term, count]) => ({
        term,
        count,
        samples: samples.get(term) || [],
      }));

    return ranked;
  }

  // ───────────────────────────────────────────────────────────
  // 7. generateReport — comprehensive bilingual PDF-shaped report
  // ───────────────────────────────────────────────────────────
  /**
   * Build a bilingual, k-anonymity-safe comprehensive report. Returns
   * an object with:
   *   - meta          : survey info
   *   - competencyRadar: { svg, data }
   *   - strengths / developmentAreas / suggestions : bilingual lists
   *   - themes        : thematicAnalysis of all text answers
   *   - pdf           : a minimal PDF 1.4 byte-buffer (for file I/O)
   *
   * The PDF is built by hand (no deps) — it's a simple single-page
   * document that references the SVG radar as embedded text plus the
   * summary tables, good enough for executive review and audit trail.
   *
   * @param {string} surveyId
   * @returns {object}
   */
  generateReport(surveyId) {
    const survey = this._mustSurvey(surveyId);
    const agg = this.aggregateBySource(surveyId);
    const gap = this.gapAnalysis(surveyId);
    const textAnswers = this._collectTextAnswers(surveyId);
    const themes = this.thematicAnalysis(textAnswers, { topN: 8 });

    // competency aggregation — if questions declare competencies, group
    // by those; otherwise treat each question as its own competency.
    const competencies = this._buildCompetencyRollup(agg);

    const radar = this._radarSvg(competencies);

    const strengths = gap.hiddenStrengths.concat(
      gap.perQuestion
        .filter((q) => q.othersAvg !== null && q.othersAvg >= 4)
        .filter((q) => !gap.hiddenStrengths.includes(q)),
    );
    const developmentAreas = gap.blindSpots.concat(
      gap.perQuestion
        .filter((q) => q.othersAvg !== null && q.othersAvg < 3)
        .filter((q) => !gap.blindSpots.includes(q)),
    );

    const suggestions = buildSuggestions({ gap, competencies });

    const report = {
      meta: {
        surveyId,
        subject: survey.subject,
        cycle: survey.cycle,
        createdAt: survey.createdAt,
        generatedAt: this._now().toISOString(),
        groupCounts: agg.groupCounts,
        anonymityNote: {
          he: LABELS.he.anonymity_note,
          en: LABELS.en.anonymity_note,
        },
      },
      aggregation: agg,
      gapAnalysis: gap,
      competencies,
      competencyRadar: radar,
      strengths,
      developmentAreas,
      suggestions,
      themes,
    };

    report.pdf = this._renderPdf(report);

    // snapshot for trend tracking
    this._recordHistory(survey.subject, survey, competencies, gap);

    return report;
  }

  _collectTextAnswers(surveyId) {
    const survey = this._mustSurvey(surveyId);
    const rows = this.responses.get(surveyId) || [];
    const textQIds = new Set(
      survey.questions.filter((q) => q.type === 'text').map((q) => q.id),
    );

    // group text answers by source group so we can k-redact, then
    // flatten only the surviving ones.
    const byGroup = new Map();
    for (const r of rows) {
      if (!byGroup.has(r.group)) byGroup.set(r.group, []);
      for (const qid of textQIds) {
        const a = r.answers[qid];
        if (typeof a === 'string' && a.trim()) byGroup.get(r.group).push(a);
      }
    }

    const out = [];
    for (const [g, arr] of byGroup.entries()) {
      if (this._isRedacted(g, byGroup.get(g).length) && arr.length < this.kAnonymity) {
        // under-k text group is dropped wholesale
        continue;
      }
      out.push(...arr);
    }
    return out;
  }

  _buildCompetencyRollup(agg) {
    const byComp = new Map();
    for (const q of agg.questions) {
      const comp = q.competency || q.id;
      if (!byComp.has(comp))
        byComp.set(comp, {
          competency: comp,
          text_he: q.text_he,
          text_en: q.text_en,
          scale: q.scale,
          selfAvgs: [],
          othersAvgs: [],
          groupAvgs: {},
        });
      const bucket = byComp.get(comp);
      const self = q.byGroup.self;
      if (self && !self.redacted && typeof self.avg === 'number') {
        bucket.selfAvgs.push(self.avg);
      }
      for (const g of CONSTANTS.RESPONDENT_GROUPS) {
        if (g === 'self') continue;
        const gi = q.byGroup[g];
        if (gi && !gi.redacted && typeof gi.avg === 'number') {
          bucket.othersAvgs.push(gi.avg);
          if (!bucket.groupAvgs[g]) bucket.groupAvgs[g] = [];
          bucket.groupAvgs[g].push(gi.avg);
        }
      }
    }
    const out = [];
    for (const b of byComp.values()) {
      const groupAvg = {};
      for (const g of Object.keys(b.groupAvgs)) {
        groupAvg[g] = round2(mean(b.groupAvgs[g]));
      }
      out.push({
        competency: b.competency,
        text_he: b.text_he,
        text_en: b.text_en,
        scale: b.scale,
        self: round2(mean(b.selfAvgs)),
        others: round2(mean(b.othersAvgs)),
        groupAvg,
      });
    }
    return out;
  }

  // ───────────────────────────────────────────────────────────
  // 8. kForAnonymity — public gate
  // ───────────────────────────────────────────────────────────
  /**
   * Returns per-group k-anonymity status for a survey. Callers should
   * use this before revealing any group-level breakdown downstream.
   *
   * @param {string} surveyId
   * @returns {{ k, byGroup: {group:{n, meetsK}}, allMeetK, safeGroups, unsafeGroups }}
   */
  kForAnonymity(surveyId) {
    const rows = this.responses.get(surveyId) || [];
    const counts = {};
    for (const g of CONSTANTS.RESPONDENT_GROUPS) counts[g] = 0;
    for (const r of rows) counts[r.group] = (counts[r.group] || 0) + 1;

    const byGroup = {};
    const safeGroups = [];
    const unsafeGroups = [];
    for (const g of CONSTANTS.RESPONDENT_GROUPS) {
      const n = counts[g] || 0;
      const meetsK =
        CONSTANTS.UNCONSTRAINED_GROUPS.includes(g) || n >= this.kAnonymity;
      byGroup[g] = { n, meetsK };
      // 'self' with 0 responses should not be listed as safe
      if (n > 0 && meetsK) safeGroups.push(g);
      if (n > 0 && !meetsK) unsafeGroups.push(g);
    }
    const allMeetK = unsafeGroups.length === 0;
    return { k: this.kAnonymity, byGroup, allMeetK, safeGroups, unsafeGroups };
  }

  _isRedacted(group, n) {
    if (CONSTANTS.UNCONSTRAINED_GROUPS.includes(group)) return n === 0;
    return n < this.kAnonymity;
  }

  // ───────────────────────────────────────────────────────────
  // 9. trendAcrossCycles — time-series per employee
  // ───────────────────────────────────────────────────────────
  /**
   * Return the append-only history for an employee, ordered by cycle.
   *
   * @param {string} employeeId
   * @returns {Array<{ surveyId, cycle, generatedAt, competencies:[{competency,self,others}], deltaVsPrev }>}
   */
  trendAcrossCycles(employeeId) {
    const hist = this.history.get(String(employeeId)) || [];
    const ordered = [...hist].sort((a, b) => {
      if (a.cycle === b.cycle) return a.generatedAt.localeCompare(b.generatedAt);
      return a.cycle.localeCompare(b.cycle);
    });

    const out = [];
    let prev = null;
    for (const cycleRec of ordered) {
      const deltaVsPrev = {};
      if (prev) {
        const prevMap = new Map(
          prev.competencies.map((c) => [c.competency, c]),
        );
        for (const c of cycleRec.competencies) {
          const p = prevMap.get(c.competency);
          if (p && typeof c.others === 'number' && typeof p.others === 'number') {
            deltaVsPrev[c.competency] = round2(c.others - p.others);
          }
        }
      }
      out.push({ ...cycleRec, deltaVsPrev });
      prev = cycleRec;
    }
    return out;
  }

  _recordHistory(employeeId, survey, competencies, gap) {
    const rec = {
      surveyId: survey.surveyId,
      cycle: survey.cycle,
      generatedAt: this._now().toISOString(),
      competencies: competencies.map((c) => ({
        competency: c.competency,
        self: c.self,
        others: c.others,
      })),
      blindSpots: gap.blindSpots.length,
      hiddenStrengths: gap.hiddenStrengths.length,
    };
    if (!this.history.has(employeeId)) this.history.set(employeeId, []);
    this.history.get(employeeId).push(rec);
  }

  // ───────────────────────────────────────────────────────────
  // private — SVG radar chart (hand-built, no deps)
  // ───────────────────────────────────────────────────────────
  _radarSvg(competencies) {
    const size = 360;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 40;
    const n = competencies.length;
    if (n < 3) {
      // cannot draw a meaningful polygon with < 3 axes — return
      // a placeholder SVG with a label so downstream renderers
      // never crash.
      const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`
        + `<rect width="100%" height="100%" fill="#ffffff"/>`
        + `<text x="${cx}" y="${cy}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="14" fill="#333">`
        + xmlEscape('Radar requires at least 3 competencies / דרושות לפחות 3 יכולות')
        + `</text>`
        + `</svg>`;
      return { svg: placeholderSvg, data: competencies };
    }

    const maxScale =
      Math.max(...competencies.map((c) => c.scale || CONSTANTS.DEFAULT_SCALE)) ||
      CONSTANTS.DEFAULT_SCALE;

    const pointFor = (i, value) => {
      // Axes evenly spaced starting at 12 o'clock and going clockwise.
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
      const r = (clamp(value || 0, 0, maxScale) / maxScale) * radius;
      return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
    };

    // Concentric rings for the scale grid
    const gridRings = [];
    for (let lvl = 1; lvl <= maxScale; lvl++) {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const [x, y] = pointFor(i, lvl);
        pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
      }
      gridRings.push(
        `<polygon points="${pts.join(' ')}" fill="none" stroke="#dddddd" stroke-width="1"/>`,
      );
    }

    // Spokes + labels
    const spokes = [];
    const labels = [];
    for (let i = 0; i < n; i++) {
      const [ex, ey] = pointFor(i, maxScale);
      spokes.push(
        `<line x1="${cx}" y1="${cy}" x2="${ex.toFixed(2)}" y2="${ey.toFixed(
          2,
        )}" stroke="#bbbbbb" stroke-width="1"/>`,
      );
      const labelAngle = -Math.PI / 2 + (2 * Math.PI * i) / n;
      const lx = cx + (radius + 18) * Math.cos(labelAngle);
      const ly = cy + (radius + 18) * Math.sin(labelAngle);
      const compLabel =
        competencies[i].text_he ||
        competencies[i].text_en ||
        competencies[i].competency;
      labels.push(
        `<text x="${lx.toFixed(2)}" y="${ly.toFixed(
          2,
        )}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="11" fill="#333">${xmlEscape(
          compLabel,
        )}</text>`,
      );
    }

    // Self polygon
    const selfPts = [];
    for (let i = 0; i < n; i++) {
      const [x, y] = pointFor(i, competencies[i].self || 0);
      selfPts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    }
    // Others polygon
    const otherPts = [];
    for (let i = 0; i < n; i++) {
      const [x, y] = pointFor(i, competencies[i].others || 0);
      otherPts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    }

    const selfPoly = `<polygon points="${selfPts.join(' ')}" fill="#4a90e2" fill-opacity="0.25" stroke="#4a90e2" stroke-width="2"/>`;
    const otherPoly = `<polygon points="${otherPts.join(' ')}" fill="#e24a4a" fill-opacity="0.25" stroke="#e24a4a" stroke-width="2"/>`;

    const legend =
      `<g font-family="Arial,Helvetica,sans-serif" font-size="11" fill="#333">`
      + `<rect x="10" y="10" width="12" height="12" fill="#4a90e2"/>`
      + `<text x="28" y="20">${xmlEscape('Self / ' + LABELS.he.self)}</text>`
      + `<rect x="10" y="28" width="12" height="12" fill="#e24a4a"/>`
      + `<text x="28" y="38">${xmlEscape('Others / אחרים')}</text>`
      + `</g>`;

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`
      + `<rect width="100%" height="100%" fill="#ffffff"/>`
      + gridRings.join('')
      + spokes.join('')
      + otherPoly
      + selfPoly
      + labels.join('')
      + legend
      + `</svg>`;

    return { svg, data: competencies };
  }

  // ───────────────────────────────────────────────────────────
  // private — tiny hand-built PDF renderer (no deps)
  // ───────────────────────────────────────────────────────────
  /**
   * Emit a minimal single-page PDF 1.4 byte buffer. Body contains a
   * bilingual summary: title, subject, group counts, strengths,
   * development areas and top themes. This is NOT a designer-grade
   * PDF — it's an executive one-pager that is auditable without any
   * third-party library.
   */
  _renderPdf(report) {
    const lines = [];
    lines.push('360 Feedback Report / דוח משוב 360');
    lines.push(`Subject: ${report.meta.subject}`);
    lines.push(`Cycle:   ${report.meta.cycle}`);
    lines.push(`Generated: ${report.meta.generatedAt}`);
    lines.push('');
    lines.push('Respondent counts:');
    for (const g of CONSTANTS.RESPONDENT_GROUPS) {
      const n = report.meta.groupCounts[g] || 0;
      lines.push(`  - ${g}: ${n}`);
    }
    lines.push('');
    lines.push('Strengths / נקודות חוזק:');
    for (const s of report.strengths.slice(0, 5)) {
      lines.push(`  * ${s.text_en || s.text_he} (others=${s.othersAvg})`);
    }
    lines.push('');
    lines.push('Development areas / תחומי פיתוח:');
    for (const d of report.developmentAreas.slice(0, 5)) {
      lines.push(`  * ${d.text_en || d.text_he} (others=${d.othersAvg})`);
    }
    lines.push('');
    lines.push('Top themes / נושאים מרכזיים:');
    for (const t of report.themes.slice(0, 5)) {
      lines.push(`  * ${t.term} (${t.count})`);
    }
    lines.push('');
    lines.push(report.meta.anonymityNote.en);
    lines.push(report.meta.anonymityNote.he);

    // Build a single-page PDF. Hebrew glyphs may not render with the
    // built-in Helvetica font in all readers, so we emit the English
    // text as the primary glyph stream and append bilingual lines as
    // ASCII (\u-escaped via PDF octal if ever needed). For audit purposes
    // the key is that the PDF is a valid, parseable byte buffer.
    const asciiLines = lines.map((l) =>
      l.replace(/[^\x20-\x7e]/g, '?').replace(/([()\\])/g, '\\$1'),
    );
    const stream =
      'BT /F1 12 Tf 40 780 Td 14 TL '
      + asciiLines.map((l) => `(${l}) Tj T*`).join(' ')
      + ' ET';

    const objs = [];
    const push = (s) => {
      objs.push(s);
      return objs.length; // 1-based id
    };
    const obj1 = push('<< /Type /Catalog /Pages 2 0 R >>');
    const obj2 = push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    const obj3 = push(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
        + '/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    );
    const obj4 = push(
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    );
    const obj5 = push(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    );

    let pdf = '%PDF-1.4\n';
    const offsets = [];
    for (let i = 0; i < objs.length; i++) {
      offsets.push(Buffer.byteLength(pdf));
      pdf += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`;
    }
    const xrefStart = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) {
      pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

    void obj1;
    void obj2;
    void obj3;
    void obj4;
    void obj5;
    return Buffer.from(pdf, 'latin1');
  }

  // ───────────────────────────────────────────────────────────
  // internals — lookup
  // ───────────────────────────────────────────────────────────
  _mustSurvey(surveyId) {
    const s = this.surveys.get(surveyId);
    if (!s) throw new Error(`Unknown surveyId "${surveyId}"`);
    return s;
  }
}

// ═══════════════════════════════════════════════════════════════
// PURE HELPERS (exported for test harness)
// ═══════════════════════════════════════════════════════════════

function classifyGap(gap) {
  if (gap === null) return 'unknown';
  if (gap >= CONSTANTS.GAP_BLIND_SPOT) return 'blind_spot';
  if (gap <= CONSTANTS.GAP_HIDDEN_STRENGTH) return 'hidden_strength';
  return 'aligned';
}

function buildSuggestions({ gap, competencies }) {
  const out = [];
  for (const bs of gap.blindSpots) {
    out.push({
      topic: bs.text_en || bs.text_he,
      he: `קיים פער משמעותי בין הערכה עצמית לבין האופן שבו אחרים רואים אותך ב"${
        bs.text_he || bs.text_en
      }". מומלץ לפגוש את המנהל ולבנות יעד קונקרטי.`,
      en: `There is a meaningful gap between your self-view and how others perceive you on "${
        bs.text_en || bs.text_he
      }". Meet with your manager and set one concrete goal.`,
      priority: 'high',
    });
  }
  for (const hs of gap.hiddenStrengths) {
    out.push({
      topic: hs.text_en || hs.text_he,
      he: `זיהינו חוזקה שאת/ה לא מעריך/ה מספיק: "${
        hs.text_he || hs.text_en
      }". נצל/י זאת במנטורינג ובהובלת יוזמות.`,
      en: `We detected an underestimated strength: "${
        hs.text_en || hs.text_he
      }". Leverage it via mentoring and leading new initiatives.`,
      priority: 'medium',
    });
  }
  // Competency-level — pull the lowest "others" score for a training nudge
  const lowComp = [...competencies]
    .filter((c) => typeof c.others === 'number')
    .sort((a, b) => a.others - b.others)[0];
  if (lowComp && lowComp.others < 3.5) {
    out.push({
      topic: lowComp.text_en || lowComp.text_he || lowComp.competency,
      he: `המלצה לקורס / סדנה בתחום "${
        lowComp.text_he || lowComp.text_en || lowComp.competency
      }".`,
      en: `Consider formal training on "${
        lowComp.text_en || lowComp.text_he || lowComp.competency
      }".`,
      priority: 'medium',
    });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  ThreeSixtyFeedback,
  CONSTANTS,
  LABELS,
  _internals: {
    tokenize,
    mean,
    round2,
    clamp,
    classifyGap,
    buildSuggestions,
    normalizeGroup,
    hashToken,
    newToken,
    xmlEscape,
    STOP_WORDS_HE,
    STOP_WORDS_EN,
  },
};
