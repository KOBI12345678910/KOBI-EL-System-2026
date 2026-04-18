/**
 * Internal Employee Feedback Collection Engine
 * Agent Y-134 • Techno-Kol Uzi • Kobi's mega-ERP
 *
 * Lightweight pulse surveys, suggestion box and team retros.
 * Distinct from Y-067 (360° feedback) — this module is about
 * fast-cycle employee voice: weekly pulses, open suggestion
 * submissions, and sprint retrospectives. Zero external deps,
 * Node stdlib only, Hebrew RTL + bilingual labels.
 *
 * Rule enforced: לא מוחקים, רק משדרגים ומגדלים.
 *   - All stores are append-only Maps/Arrays.
 *   - Reviews, votes, retro items, suggestion status changes
 *     never overwrite prior state — we push a new revision on
 *     top and expose the latest view via derived getters.
 *
 * Anonymity guarantee (k=3):
 *   - anonymous pulse responses only store a deterministic salted
 *     hash — no `employeeId` is persisted on the response row.
 *   - `aggregatePulse` and `listSuggestions` refuse to expose
 *     any cohort smaller than K_ANONYMITY when the survey/channel
 *     was launched in anonymous mode.
 *   - `anonymityGuard()` is a self-audit hook returning violations.
 *
 * Exports (see bottom):
 *   FeedbackCollection   — main engine class
 *   CONSTANTS            — tuning knobs
 *   LABELS               — bilingual strings
 *   _internals           — low-level helpers (for tests)
 */

'use strict';

const crypto = require('node:crypto');

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const CONSTANTS = Object.freeze({
  /** k-anonymity floor — no anonymous cohort smaller than this is revealed */
  K_ANONYMITY: 3,
  /** max questions allowed on a pulse survey */
  MAX_PULSE_QUESTIONS: 5,
  /** default TTL for pulse surveys in days */
  DEFAULT_PULSE_TTL_DAYS: 7,
  /** default Likert scale for pulse */
  DEFAULT_SCALE: 5,
  /** HMAC salt length */
  SALT_BYTES: 16,
  /** suggestion statuses — ordered, append-only transitions */
  SUGGESTION_STATUSES: Object.freeze([
    'submitted',
    'under-review',
    'accepted',
    'declined',
    'deferred',
  ]),
  /** valid retro categories */
  RETRO_CATEGORIES: Object.freeze(['start', 'stop', 'continue', 'action']),
  /** valid retro states */
  RETRO_STATES: Object.freeze(['open', 'closed']),
  /** default escalation threshold — below this score triggers alert */
  DEFAULT_ESCALATION_SCORE: 3,
  /** default % of low responses that fires escalation */
  DEFAULT_ESCALATION_PCT: 0.4,
});

const LABELS = Object.freeze({
  he: {
    pulse_title: 'סקר דופק',
    pulse_question: 'שאלה',
    pulse_response: 'תגובה',
    pulse_average: 'ממוצע',
    pulse_distribution: 'התפלגות',
    pulse_trend: 'מגמה מול הסקר הקודם',
    suggestion_box: 'תיבת הצעות',
    suggestion_title: 'כותרת ההצעה',
    suggestion_description: 'תיאור',
    suggestion_category: 'קטגוריה',
    suggestion_priority: 'עדיפות',
    suggestion_votes: 'הצבעות',
    suggestion_status: 'סטטוס',
    status_submitted: 'התקבלה',
    status_under_review: 'בבדיקה',
    status_accepted: 'אושרה',
    status_declined: 'נדחתה',
    status_deferred: 'נדחתה להמשך',
    retro_session: 'רטרו צוות',
    retro_start: 'להתחיל',
    retro_stop: 'להפסיק',
    retro_continue: 'להמשיך',
    retro_action: 'משימה',
    retro_closed: 'רטרו סגור',
    retro_history: 'היסטוריית רטרו',
    sentiment_positive: 'חיובי',
    sentiment_negative: 'שלילי',
    sentiment_neutral: 'נייטרלי',
    anonymous: 'אנונימי',
    anonymity_note:
      'מוגן אנונימיות — קבוצות מתחת ל-3 משיבים אינן מוצגות',
    escalation_alert: 'התראת הסלמה ל-HR',
    vote_up: 'בעד',
    vote_down: 'נגד',
    team: 'צוות',
    sprint: 'ספרינט/תקופה',
    moderator: 'מנחה',
  },
  en: {
    pulse_title: 'Pulse Survey',
    pulse_question: 'Question',
    pulse_response: 'Response',
    pulse_average: 'Average',
    pulse_distribution: 'Distribution',
    pulse_trend: 'Trend vs. prior survey',
    suggestion_box: 'Suggestion Box',
    suggestion_title: 'Suggestion title',
    suggestion_description: 'Description',
    suggestion_category: 'Category',
    suggestion_priority: 'Priority',
    suggestion_votes: 'Votes',
    suggestion_status: 'Status',
    status_submitted: 'Submitted',
    status_under_review: 'Under review',
    status_accepted: 'Accepted',
    status_declined: 'Declined',
    status_deferred: 'Deferred',
    retro_session: 'Team Retro',
    retro_start: 'Start',
    retro_stop: 'Stop',
    retro_continue: 'Continue',
    retro_action: 'Action item',
    retro_closed: 'Retro closed',
    retro_history: 'Retro history',
    sentiment_positive: 'Positive',
    sentiment_negative: 'Negative',
    sentiment_neutral: 'Neutral',
    anonymous: 'Anonymous',
    anonymity_note:
      'Anonymity protected — cohorts smaller than 3 are never revealed',
    escalation_alert: 'HR escalation alert',
    vote_up: 'Upvote',
    vote_down: 'Downvote',
    team: 'Team',
    sprint: 'Sprint/Period',
    moderator: 'Moderator',
  },
});

// ═══════════════════════════════════════════════════════════════
// Sentiment lexicon — simple keyword-based classifier
// ═══════════════════════════════════════════════════════════════

const SENTIMENT_LEXICON = Object.freeze({
  positive: Object.freeze([
    // Hebrew
    'טוב', 'מצוין', 'נהדר', 'מעולה', 'אוהב', 'שמח', 'תודה',
    'חיובי', 'מרוצה', 'מדהים', 'שיפור', 'עבודה טובה', 'כיף',
    // English
    'good', 'great', 'excellent', 'amazing', 'love', 'happy',
    'thanks', 'positive', 'awesome', 'wonderful', 'improvement',
    'fantastic', 'win', 'wins', 'success', 'helpful',
  ]),
  negative: Object.freeze([
    // Hebrew
    'רע', 'גרוע', 'נורא', 'מתוסכל', 'כועס', 'בעיה', 'תקלה',
    'שלילי', 'לא מרוצה', 'איטי', 'קשה', 'כישלון', 'עומס',
    // English
    'bad', 'terrible', 'awful', 'frustrated', 'angry', 'problem',
    'issue', 'negative', 'slow', 'hard', 'failure', 'blocked',
    'stuck', 'broken', 'overload', 'burnout',
  ]),
});

// ═══════════════════════════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════════════════════════

/** Deterministic hash for anonymous identity (salted, one-way). */
function hashIdentity(id, salt) {
  return crypto
    .createHmac('sha256', salt)
    .update(String(id))
    .digest('hex')
    .slice(0, 24);
}

function genId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function nowIso() {
  return new Date().toISOString();
}

function average(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function distribution(nums, scale) {
  const out = {};
  for (let i = 1; i <= scale; i += 1) out[i] = 0;
  for (const n of nums) {
    if (typeof n === 'number' && n >= 1 && n <= scale) {
      out[n] = (out[n] || 0) + 1;
    }
  }
  return out;
}

function classifyText(text) {
  if (!text || typeof text !== 'string') return 'neutral';
  const lower = text.toLowerCase();
  let pos = 0;
  let neg = 0;
  for (const w of SENTIMENT_LEXICON.positive) {
    if (lower.includes(w)) pos += 1;
  }
  for (const w of SENTIMENT_LEXICON.negative) {
    if (lower.includes(w)) neg += 1;
  }
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}

// ═══════════════════════════════════════════════════════════════
// FeedbackCollection — main class
// ═══════════════════════════════════════════════════════════════

class FeedbackCollection {
  constructor(opts = {}) {
    // append-only stores
    this.surveys = new Map();           // surveyId → survey def
    this.responses = new Map();         // surveyId → response[]
    this.suggestions = new Map();       // suggestionId → suggestion
    this.suggestionVotes = new Map();   // suggestionId → Map(voterHash → vote)
    this.suggestionReviews = new Map(); // suggestionId → review[]
    this.retros = new Map();            // retroId → retro def
    this.retroItems = new Map();        // retroId → item[]
    this.retroByTeam = new Map();       // teamId → retroId[]
    this.escalations = [];              // append-only escalation log
    this.tasks = [];                    // tasks converted from retro actions

    // tunables
    this.salt = opts.salt
      || crypto.randomBytes(CONSTANTS.SALT_BYTES).toString('hex');
    this.clock = typeof opts.clock === 'function' ? opts.clock : nowIso;

    // survey order for trend detection
    this.surveyOrder = [];
  }

  // ─────────────────────────────────────────────────────────────
  // Pulse surveys
  // ─────────────────────────────────────────────────────────────

  launchPulseSurvey({
    id,
    questions,
    audienceFilter,
    anonymous = false,
    ttlDays = CONSTANTS.DEFAULT_PULSE_TTL_DAYS,
  }) {
    if (!id) throw new Error('pulse.id required');
    if (this.surveys.has(id)) {
      throw new Error(`pulse.id "${id}" already exists (append-only)`);
    }
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('pulse.questions must be a non-empty array');
    }
    if (questions.length > CONSTANTS.MAX_PULSE_QUESTIONS) {
      throw new Error(
        `pulse supports max ${CONSTANTS.MAX_PULSE_QUESTIONS} questions`,
      );
    }
    for (const q of questions) {
      if (!q || !q.id) throw new Error('each pulse question needs id');
      if (!q.type) throw new Error(`question "${q.id}" missing type`);
    }

    const launchedAt = this.clock();
    const survey = {
      id,
      questions: questions.map((q) => ({
        ...q,
        scale: q.scale || CONSTANTS.DEFAULT_SCALE,
      })),
      audienceFilter: audienceFilter || null,
      anonymous: Boolean(anonymous),
      ttlDays,
      launchedAt,
      expiresAt: new Date(
        new Date(launchedAt).getTime() + ttlDays * 86400000,
      ).toISOString(),
    };
    this.surveys.set(id, survey);
    this.responses.set(id, []);
    this.surveyOrder.push(id);
    return survey;
  }

  submitResponse({ surveyId, employeeId, answers, timestamp }) {
    const survey = this.surveys.get(surveyId);
    if (!survey) throw new Error(`unknown survey "${surveyId}"`);
    if (!answers || typeof answers !== 'object') {
      throw new Error('answers object required');
    }
    // validate every answer maps to a defined question
    const qById = new Map(survey.questions.map((q) => [q.id, q]));
    for (const qid of Object.keys(answers)) {
      if (!qById.has(qid)) {
        throw new Error(`unknown question "${qid}" on survey "${surveyId}"`);
      }
    }

    const row = {
      surveyId,
      answers: { ...answers },
      timestamp: timestamp || this.clock(),
    };
    if (survey.anonymous) {
      // never store raw employeeId on anonymous pulses
      row.anonymousHash = employeeId
        ? hashIdentity(employeeId, this.salt + ':' + surveyId)
        : hashIdentity(crypto.randomBytes(8).toString('hex'), this.salt);
    } else {
      row.employeeId = employeeId || null;
    }
    this.responses.get(surveyId).push(row);
    return row;
  }

  aggregatePulse(surveyId) {
    const survey = this.surveys.get(surveyId);
    if (!survey) throw new Error(`unknown survey "${surveyId}"`);
    const rows = this.responses.get(surveyId) || [];
    const n = rows.length;

    // anonymity gate: refuse to reveal small anonymous cohorts
    const redacted =
      survey.anonymous && n > 0 && n < CONSTANTS.K_ANONYMITY;

    const perQ = {};
    for (const q of survey.questions) {
      const values = rows
        .map((r) => r.answers[q.id])
        .filter((v) => typeof v === 'number');
      const textValues = rows
        .map((r) => r.answers[q.id])
        .filter((v) => typeof v === 'string');
      perQ[q.id] = {
        type: q.type,
        count: values.length + textValues.length,
        average: redacted ? null : (values.length ? average(values) : null),
        distribution: redacted
          ? null
          : (values.length ? distribution(values, q.scale) : null),
        textSamples: redacted ? null : textValues.slice(0, 10),
      };
    }

    // overall numeric average across all numeric answers
    const allNums = [];
    for (const r of rows) {
      for (const q of survey.questions) {
        const v = r.answers[q.id];
        if (typeof v === 'number') allNums.push(v);
      }
    }
    const overall = redacted ? null : (allNums.length ? average(allNums) : null);

    // trend vs previous survey with the same id-prefix
    const trend = this._trendFor(surveyId, overall);

    return {
      surveyId,
      responses: n,
      anonymous: survey.anonymous,
      redacted,
      overallAverage: overall,
      perQuestion: perQ,
      trend,
    };
  }

  _trendFor(surveyId, overall) {
    if (overall == null) return null;
    const idx = this.surveyOrder.indexOf(surveyId);
    if (idx <= 0) return { previous: null, delta: null };
    // walk backwards to find a prior survey sharing the same family prefix
    const family = surveyId.replace(/[-_]?\d+$/, '');
    for (let i = idx - 1; i >= 0; i -= 1) {
      const prev = this.surveyOrder[i];
      const prevFamily = prev.replace(/[-_]?\d+$/, '');
      if (prevFamily === family) {
        const prevAgg = this.aggregatePulse(prev);
        if (prevAgg.overallAverage != null) {
          return {
            previous: prev,
            previousAverage: prevAgg.overallAverage,
            delta: overall - prevAgg.overallAverage,
          };
        }
      }
    }
    return { previous: null, delta: null };
  }

  // ─────────────────────────────────────────────────────────────
  // Suggestion box
  // ─────────────────────────────────────────────────────────────

  submitSuggestion({
    category,
    title,
    description,
    anonymous = false,
    priority,
    submitterId,
  }) {
    if (!title) throw new Error('suggestion.title required');
    if (!category) throw new Error('suggestion.category required');
    const id = genId('sug');
    const suggestion = {
      id,
      category,
      title,
      description: description || '',
      anonymous: Boolean(anonymous),
      priority: priority || 'normal',
      submitterId: anonymous ? null : (submitterId || null),
      submitterHash: anonymous && submitterId
        ? hashIdentity(submitterId, this.salt + ':sug')
        : null,
      status: 'submitted',
      createdAt: this.clock(),
    };
    this.suggestions.set(id, suggestion);
    this.suggestionVotes.set(id, new Map());
    this.suggestionReviews.set(id, []);
    return suggestion;
  }

  voteOnSuggestion({ suggestionId, voterId, vote }) {
    const sug = this.suggestions.get(suggestionId);
    if (!sug) throw new Error(`unknown suggestion "${suggestionId}"`);
    if (!voterId) throw new Error('voterId required');
    if (vote !== 'up' && vote !== 'down') {
      throw new Error('vote must be "up" or "down"');
    }
    const votes = this.suggestionVotes.get(suggestionId);
    const key = hashIdentity(voterId, this.salt + ':vote');
    if (votes.has(key)) {
      throw new Error(`voter already voted on suggestion "${suggestionId}"`);
    }
    votes.set(key, { vote, at: this.clock() });
    return {
      suggestionId,
      tally: this._voteTally(suggestionId),
    };
  }

  _voteTally(suggestionId) {
    const votes = this.suggestionVotes.get(suggestionId);
    if (!votes) return { up: 0, down: 0, score: 0 };
    let up = 0;
    let down = 0;
    for (const v of votes.values()) {
      if (v.vote === 'up') up += 1;
      else if (v.vote === 'down') down += 1;
    }
    return { up, down, score: up - down };
  }

  listSuggestions({ status, category, minVotes } = {}) {
    const out = [];
    for (const sug of this.suggestions.values()) {
      if (status && sug.status !== status) continue;
      if (category && sug.category !== category) continue;
      const tally = this._voteTally(sug.id);
      if (typeof minVotes === 'number' && tally.score < minVotes) continue;
      out.push({ ...sug, tally });
    }
    // newest first by createdAt
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return out;
  }

  reviewSuggestion({ suggestionId, reviewerId, decision, comment }) {
    const sug = this.suggestions.get(suggestionId);
    if (!sug) throw new Error(`unknown suggestion "${suggestionId}"`);
    const valid = ['accepted', 'under-review', 'declined', 'deferred'];
    if (!valid.includes(decision)) {
      throw new Error(`decision must be one of ${valid.join('|')}`);
    }
    const rec = {
      id: genId('rev'),
      suggestionId,
      reviewerId: reviewerId || null,
      decision,
      comment: comment || '',
      at: this.clock(),
    };
    this.suggestionReviews.get(suggestionId).push(rec);
    // status moves forward but prior history is kept append-only
    sug.status = decision;
    sug.lastReviewedAt = rec.at;
    return rec;
  }

  suggestionHistory(suggestionId) {
    const sug = this.suggestions.get(suggestionId);
    if (!sug) throw new Error(`unknown suggestion "${suggestionId}"`);
    return (this.suggestionReviews.get(suggestionId) || []).slice();
  }

  // ─────────────────────────────────────────────────────────────
  // Retros
  // ─────────────────────────────────────────────────────────────

  startRetroSession({ teamId, sprintOrPeriod, moderator }) {
    if (!teamId) throw new Error('teamId required');
    if (!sprintOrPeriod) throw new Error('sprintOrPeriod required');
    const id = genId('retro');
    const retro = {
      id,
      teamId,
      sprintOrPeriod,
      moderator: moderator || null,
      state: 'open',
      startedAt: this.clock(),
      closedAt: null,
    };
    this.retros.set(id, retro);
    this.retroItems.set(id, []);
    const bucket = this.retroByTeam.get(teamId) || [];
    bucket.push(id);
    this.retroByTeam.set(teamId, bucket);
    return retro;
  }

  addRetroItem({ retroId, category, content, author, anonymous = false }) {
    const retro = this.retros.get(retroId);
    if (!retro) throw new Error(`unknown retro "${retroId}"`);
    if (retro.state !== 'open') {
      throw new Error(`retro "${retroId}" is closed`);
    }
    if (!CONSTANTS.RETRO_CATEGORIES.includes(category)) {
      throw new Error(
        `category must be one of ${CONSTANTS.RETRO_CATEGORIES.join('|')}`,
      );
    }
    if (!content || typeof content !== 'string') {
      throw new Error('content required');
    }
    const item = {
      id: genId('item'),
      retroId,
      category,
      content,
      anonymous: Boolean(anonymous),
      author: anonymous ? null : (author || null),
      authorHash: anonymous && author
        ? hashIdentity(author, this.salt + ':retro:' + retroId)
        : null,
      at: this.clock(),
    };
    this.retroItems.get(retroId).push(item);
    return item;
  }

  closeRetro(retroId) {
    const retro = this.retros.get(retroId);
    if (!retro) throw new Error(`unknown retro "${retroId}"`);
    if (retro.state === 'closed') {
      return { retro, newTasks: [] };
    }
    retro.state = 'closed';
    retro.closedAt = this.clock();
    const items = this.retroItems.get(retroId) || [];
    const newTasks = [];
    for (const it of items) {
      if (it.category === 'action') {
        const task = {
          id: genId('task'),
          source: 'retro',
          retroId,
          teamId: retro.teamId,
          title: it.content,
          createdAt: this.clock(),
          status: 'open',
        };
        this.tasks.push(task);
        newTasks.push(task);
      }
    }
    return { retro, newTasks };
  }

  retroHistory(teamId) {
    const ids = this.retroByTeam.get(teamId) || [];
    return ids.map((id) => ({
      retro: this.retros.get(id),
      items: (this.retroItems.get(id) || []).slice(),
    }));
  }

  // ─────────────────────────────────────────────────────────────
  // Analytics
  // ─────────────────────────────────────────────────────────────

  sentimentAnalysis(surveyId) {
    const survey = this.surveys.get(surveyId);
    if (!survey) throw new Error(`unknown survey "${surveyId}"`);
    const rows = this.responses.get(surveyId) || [];
    const counts = { positive: 0, negative: 0, neutral: 0 };
    const samples = { positive: [], negative: [], neutral: [] };
    for (const r of rows) {
      for (const q of survey.questions) {
        const v = r.answers[q.id];
        if (typeof v === 'string' && v.trim()) {
          const label = classifyText(v);
          counts[label] += 1;
          if (samples[label].length < 5) samples[label].push(v);
        }
      }
    }
    const total = counts.positive + counts.negative + counts.neutral;
    return {
      surveyId,
      counts,
      total,
      ratios: total === 0
        ? { positive: 0, negative: 0, neutral: 0 }
        : {
            positive: counts.positive / total,
            negative: counts.negative / total,
            neutral: counts.neutral / total,
          },
      samples,
    };
  }

  triggerEscalation({
    surveyId,
    threshold = CONSTANTS.DEFAULT_ESCALATION_SCORE,
    pctThreshold = CONSTANTS.DEFAULT_ESCALATION_PCT,
  } = {}) {
    const candidates = surveyId
      ? [surveyId]
      : Array.from(this.surveys.keys());
    const alerts = [];
    for (const sid of candidates) {
      const survey = this.surveys.get(sid);
      if (!survey) continue;
      const rows = this.responses.get(sid) || [];
      const nums = [];
      for (const r of rows) {
        for (const q of survey.questions) {
          const v = r.answers[q.id];
          if (typeof v === 'number') nums.push(v);
        }
      }
      if (nums.length === 0) continue;
      const lowCount = nums.filter((n) => n < threshold).length;
      const pct = lowCount / nums.length;
      if (pct >= pctThreshold) {
        const alert = {
          id: genId('alert'),
          surveyId: sid,
          threshold,
          pctThreshold,
          lowCount,
          totalAnswers: nums.length,
          pctLow: pct,
          at: this.clock(),
          target: 'HR',
          message_he:
            `סקר "${sid}": ${lowCount}/${nums.length} תשובות נמוכות מסף ${threshold} — דורש טיפול HR`,
          message_en:
            `Survey "${sid}": ${lowCount}/${nums.length} responses below threshold ${threshold} — HR action required`,
        };
        this.escalations.push(alert);
        alerts.push(alert);
      }
    }
    return alerts;
  }

  // ─────────────────────────────────────────────────────────────
  // Anonymity self-audit
  // ─────────────────────────────────────────────────────────────

  anonymityGuard() {
    const violations = [];

    // 1. anonymous surveys must never carry employeeId on responses
    for (const [sid, rows] of this.responses.entries()) {
      const survey = this.surveys.get(sid);
      if (!survey || !survey.anonymous) continue;
      for (const r of rows) {
        if (r.employeeId) {
          violations.push({
            kind: 'anon-leak-employeeId',
            surveyId: sid,
            detail: 'employeeId persisted on anonymous response',
          });
        }
        if (!r.anonymousHash) {
          violations.push({
            kind: 'anon-missing-hash',
            surveyId: sid,
            detail: 'anonymous response has no hash',
          });
        }
      }
      // 2. k-anonymity on anonymous surveys
      if (rows.length > 0 && rows.length < CONSTANTS.K_ANONYMITY) {
        violations.push({
          kind: 'k-anonymity-risk',
          surveyId: sid,
          count: rows.length,
          k: CONSTANTS.K_ANONYMITY,
          detail:
            `anonymous survey has ${rows.length} responses, below k=${CONSTANTS.K_ANONYMITY}; aggregate will be redacted`,
        });
      }
    }

    // 3. anonymous suggestions must not leak submitterId
    for (const sug of this.suggestions.values()) {
      if (sug.anonymous && sug.submitterId) {
        violations.push({
          kind: 'anon-leak-suggestion',
          suggestionId: sug.id,
          detail: 'submitterId persisted on anonymous suggestion',
        });
      }
    }

    // 4. anonymous retro items must not leak author
    for (const [rid, items] of this.retroItems.entries()) {
      for (const it of items) {
        if (it.anonymous && it.author) {
          violations.push({
            kind: 'anon-leak-retro',
            retroId: rid,
            itemId: it.id,
            detail: 'author persisted on anonymous retro item',
          });
        }
      }
    }

    return {
      ok: violations.length === 0,
      k: CONSTANTS.K_ANONYMITY,
      violations,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════

module.exports = {
  FeedbackCollection,
  CONSTANTS,
  LABELS,
  _internals: {
    hashIdentity,
    genId,
    average,
    distribution,
    classifyText,
    SENTIMENT_LEXICON,
  },
};
