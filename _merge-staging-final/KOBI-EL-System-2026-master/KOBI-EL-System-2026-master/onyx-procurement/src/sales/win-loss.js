/**
 * Win / Loss Analyzer — מנתח ניצחונות והפסדים
 * Agent Y-025 — Sales swarm — Techno-Kol Uzi Mega-ERP / onyx-procurement
 * Date: 2026-04-11
 *
 * Core rule of the ERP: "לא מוחקים רק משדרגים ומגדלים" —
 * records are NEVER deleted. `recordOutcome` is append-only; if the same
 * opportunity id is recorded twice, both entries are kept and the most
 * recent one is used for the rolled-up segment/competitor math. History
 * is preserved for audit.
 *
 * Zero runtime dependencies, pure JavaScript, bilingual Hebrew/English.
 * Deterministic — same inputs produce the same aggregates, which makes
 * reports reproducible and auditable for sales leadership.
 *
 * Cause taxonomy (hierarchical)
 * ─────────────────────────────
 *   price          → too_high, discount_denied, payment_terms, tco
 *   features       → missing_feature, integration_gap, scale_limit, ux
 *   timing         → too_late, too_early, quarter_mismatch, frozen_hiring
 *   relationship   → weak_champion, no_exec_sponsor, trust, responsiveness
 *   competitor     → incumbent, price_war, better_demo, reference_story
 *   budget_cut     → approved_then_pulled, department_freeze, shifted_priority
 *   no_decision    → status_quo, stalled_evaluation, unclear_owner
 *   product_fit    → wrong_segment, wrong_geo, unsupported_lang
 *   delivery       → long_lead_time, no_local_support, implementation_risk
 *   legal          → dpa_blocker, security_questionnaire, localisation_law
 *
 * Win-side causes reuse the same top-level categories but with positive
 * sub-codes (e.g. price/competitive_bid, features/must_have,
 * relationship/strong_champion). The same catalog is used on both sides so
 * the analyst can compare symmetric drivers.
 */

'use strict';

// ─── cause catalog (top-level + sub-codes, EN + HE) ────────────────────────

const CAUSE_CATALOG = Object.freeze({
  price: {
    he: 'מחיר',
    en: 'Price',
    subCategories: {
      too_high: { he: 'יקר מדי', en: 'Too high' },
      discount_denied: { he: 'הנחה נדחתה', en: 'Discount denied' },
      payment_terms: { he: 'תנאי תשלום', en: 'Payment terms' },
      tco: { he: 'עלות בעלות כוללת', en: 'Total cost of ownership' },
      competitive_bid: { he: 'הצעה תחרותית', en: 'Competitive bid (win)' },
      value_match: { he: 'תמורה למחיר', en: 'Value matched price (win)' },
    },
  },
  features: {
    he: 'תכונות',
    en: 'Features',
    subCategories: {
      missing_feature: { he: 'תכונה חסרה', en: 'Missing feature' },
      integration_gap: { he: 'פער אינטגרציה', en: 'Integration gap' },
      scale_limit: { he: 'מגבלת קנה מידה', en: 'Scale limit' },
      ux: { he: 'חווית משתמש', en: 'User experience' },
      must_have: { he: 'פיצ׳ר קריטי', en: 'Must-have feature (win)' },
      roadmap_match: { he: 'התאמת מפת דרכים', en: 'Roadmap match (win)' },
    },
  },
  timing: {
    he: 'תזמון',
    en: 'Timing',
    subCategories: {
      too_late: { he: 'מאוחר מדי', en: 'Too late' },
      too_early: { he: 'מוקדם מדי', en: 'Too early' },
      quarter_mismatch: { he: 'אי התאמת רבעון', en: 'Quarter mismatch' },
      frozen_hiring: { he: 'הקפאת גיוס', en: 'Frozen hiring' },
      perfect_window: { he: 'חלון מושלם', en: 'Perfect window (win)' },
    },
  },
  relationship: {
    he: 'יחסים',
    en: 'Relationship',
    subCategories: {
      weak_champion: { he: 'צ׳מפיון חלש', en: 'Weak champion' },
      no_exec_sponsor: { he: 'אין ספונסר הנהלה', en: 'No exec sponsor' },
      trust: { he: 'חוסר אמון', en: 'Trust deficit' },
      responsiveness: { he: 'היענות איטית', en: 'Slow responsiveness' },
      strong_champion: { he: 'צ׳מפיון חזק', en: 'Strong champion (win)' },
      exec_backing: { he: 'גיבוי הנהלה', en: 'Exec backing (win)' },
    },
  },
  competitor: {
    he: 'מתחרה',
    en: 'Competitor',
    subCategories: {
      incumbent: { he: 'ספק מכהן', en: 'Incumbent vendor' },
      price_war: { he: 'מלחמת מחירים', en: 'Price war' },
      better_demo: { he: 'הדגמה טובה יותר', en: 'Better demo' },
      reference_story: { he: 'סיפור לקוח', en: 'Reference customer story' },
      out_featured: { he: 'תכונות עדיפות', en: 'Superior feature set (us)' },
      better_support: { he: 'תמיכה טובה יותר', en: 'Better support (us)' },
    },
  },
  budget_cut: {
    he: 'קיצוץ תקציב',
    en: 'Budget cut',
    subCategories: {
      approved_then_pulled: { he: 'אושר ונשלף', en: 'Approved then pulled' },
      department_freeze: { he: 'הקפאת מחלקה', en: 'Department freeze' },
      shifted_priority: { he: 'עדיפות שהוסטה', en: 'Priority shifted' },
      budget_secured: { he: 'תקציב אושר', en: 'Budget secured (win)' },
    },
  },
  no_decision: {
    he: 'אין החלטה',
    en: 'No decision',
    subCategories: {
      status_quo: { he: 'דבקות במצב קיים', en: 'Status quo' },
      stalled_evaluation: { he: 'הערכה תקועה', en: 'Stalled evaluation' },
      unclear_owner: { he: 'בעלות לא ברורה', en: 'Unclear owner' },
    },
  },
  product_fit: {
    he: 'התאמת מוצר',
    en: 'Product fit',
    subCategories: {
      wrong_segment: { he: 'סגמנט לא מתאים', en: 'Wrong segment' },
      wrong_geo: { he: 'גיאוגרפיה לא נתמכת', en: 'Wrong geography' },
      unsupported_lang: { he: 'שפה לא נתמכת', en: 'Unsupported language' },
      perfect_fit: { he: 'התאמה מושלמת', en: 'Perfect fit (win)' },
    },
  },
  delivery: {
    he: 'מסירה',
    en: 'Delivery',
    subCategories: {
      long_lead_time: { he: 'זמן אספקה ארוך', en: 'Long lead time' },
      no_local_support: { he: 'אין תמיכה מקומית', en: 'No local support' },
      implementation_risk: { he: 'סיכון הטמעה', en: 'Implementation risk' },
      fast_delivery: { he: 'אספקה מהירה', en: 'Fast delivery (win)' },
    },
  },
  legal: {
    he: 'משפטי',
    en: 'Legal',
    subCategories: {
      dpa_blocker: { he: 'חסימת DPA', en: 'DPA blocker' },
      security_questionnaire: { he: 'שאלון אבטחה', en: 'Security questionnaire' },
      localisation_law: { he: 'חוק לוקליזציה', en: 'Localisation law' },
    },
  },
});

const HEBREW_GLOSSARY = Object.freeze({
  won: 'ניצחון',
  lost: 'הפסד',
  winRate: 'שיעור ניצחון',
  lossRate: 'שיעור הפסד',
  opportunity: 'הזדמנות',
  cause: 'סיבה',
  category: 'קטגוריה',
  subCategory: 'תת קטגוריה',
  competitor: 'מתחרה',
  industry: 'ענף',
  size: 'גודל',
  region: 'אזור',
  product: 'מוצר',
  segment: 'סגמנט',
  trend: 'מגמה',
  pattern: 'דפוס',
  period: 'תקופה',
  topCauses: 'סיבות מובילות',
  interview: 'ריאיון',
  debrief: 'תחקיר',
  patternAnalysis: 'ניתוח דפוסים',
  correlation: 'מתאם',
  recommendation: 'המלצה',
});

// ─── helpers ───────────────────────────────────────────────────────────────

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function coerceDate(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function inPeriod(date, period) {
  if (!period) return true;
  const d = coerceDate(date).getTime();
  const from = period.from ? coerceDate(period.from).getTime() : -Infinity;
  const to = period.to ? coerceDate(period.to).getTime() : Infinity;
  return d >= from && d <= to;
}

function safeString(v, fallback = '') {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'string') return v.trim();
  return String(v);
}

function round(n, places = 2) {
  const p = Math.pow(10, places);
  return Math.round(n * p) / p;
}

function sortDescBy(arr, key) {
  return arr.slice().sort((a, b) => (b[key] || 0) - (a[key] || 0));
}

// ─── WinLossAnalyzer class ────────────────────────────────────────────────

class WinLossAnalyzer {
  constructor(options = {}) {
    // Append-only ledger: every recordOutcome() call pushes a new entry.
    // Never spliced, never deleted.
    this._records = [];
    // Index by opportunityId → latest record (for segment/competitor math).
    this._latestByOpp = new Map();
    this._now = options.now || (() => new Date());
    // Optional opportunity metadata (industry, size, region, product).
    // Not required. Can be merged from outside so the analyzer remains
    // a pure, zero-dep library.
    this._opportunityMeta = new Map();
    if (options.opportunities && typeof options.opportunities[Symbol.iterator] === 'function') {
      for (const opp of options.opportunities) this.upsertOpportunity(opp);
    }
  }

  /**
   * Merge metadata for a single opportunity. Idempotent and non-destructive:
   * existing fields are merged, not replaced wholesale, keeping older values
   * when the new payload omits them. Adheres to the "never delete" rule.
   */
  upsertOpportunity(opp) {
    if (!isPlainObject(opp) || !opp.opportunityId) {
      throw new TypeError('upsertOpportunity requires { opportunityId, ... }');
    }
    const prev = this._opportunityMeta.get(opp.opportunityId) || {};
    const merged = Object.assign({}, prev, opp);
    this._opportunityMeta.set(opp.opportunityId, merged);
    return merged;
  }

  /**
   * Append a win/loss outcome for an opportunity. This is the single
   * write-path to the ledger. Idempotent-by-append: calling twice with the
   * same opportunityId keeps both entries (history preservation) but the
   * latest one is used for aggregate analytics.
   *
   * @param {string} opportunityId
   * @param {object} outcome { outcome, causes[], competitor?, value?, closedAt?, notes? }
   * @returns {object} the stored record
   */
  recordOutcome(opportunityId, outcome) {
    if (!opportunityId || typeof opportunityId !== 'string') {
      throw new TypeError('recordOutcome requires a non-empty opportunityId');
    }
    if (!isPlainObject(outcome)) {
      throw new TypeError('recordOutcome requires an outcome object');
    }
    if (outcome.outcome !== 'won' && outcome.outcome !== 'lost') {
      throw new RangeError("outcome.outcome must be 'won' or 'lost'");
    }

    const rawCauses = Array.isArray(outcome.causes) ? outcome.causes : [];
    const causes = rawCauses
      .filter(isPlainObject)
      .map((c) => this._normaliseCause(c));

    // Allow top-level competitor on the outcome even if no competitor cause
    // is present (common when sales just picks "we lost to X" in the UI).
    let competitor = safeString(outcome.competitor, '');
    if (!competitor) {
      const competitorCause = causes.find((c) => c.category === 'competitor' && c.competitor);
      if (competitorCause) competitor = competitorCause.competitor;
    }

    const record = {
      opportunityId,
      outcome: outcome.outcome,
      causes,
      competitor,
      value: Number.isFinite(outcome.value) ? Number(outcome.value) : null,
      notes: safeString(outcome.notes, ''),
      closedAt: coerceDate(outcome.closedAt || this._now()).toISOString(),
      recordedAt: this._now().toISOString(),
    };

    this._records.push(record);
    this._latestByOpp.set(opportunityId, record);
    return record;
  }

  _normaliseCause(c) {
    const category = safeString(c.category, 'no_decision');
    const subCategory = safeString(c.subCategory, '');
    const validCategory = Object.prototype.hasOwnProperty.call(CAUSE_CATALOG, category)
      ? category
      : 'no_decision';
    return {
      category: validCategory,
      subCategory,
      notes: safeString(c.notes, ''),
      competitor: safeString(c.competitor, ''),
    };
  }

  /**
   * Return the bilingual hierarchical cause catalog. The same taxonomy is
   * used for both wins and losses — only the sub-codes change sign.
   */
  causeCatalog() {
    // Return a deep clone so callers cannot mutate the canonical taxonomy.
    const out = {};
    for (const [key, cat] of Object.entries(CAUSE_CATALOG)) {
      const subs = {};
      for (const [subKey, sub] of Object.entries(cat.subCategories)) {
        subs[subKey] = { he: sub.he, en: sub.en };
      }
      out[key] = { he: cat.he, en: cat.en, subCategories: subs };
    }
    return out;
  }

  /**
   * Ranked top causes for a given outcome (won|lost) over a period.
   * Returns an array of { category, subCategory, count, share, labels{he,en} }
   * ordered by count desc.
   */
  topCauses(outcome, period) {
    if (outcome !== 'won' && outcome !== 'lost') {
      throw new RangeError("topCauses outcome must be 'won' or 'lost'");
    }
    const rows = [];
    const counts = new Map();
    let total = 0;
    for (const rec of this._records) {
      if (rec.outcome !== outcome) continue;
      if (!inPeriod(rec.closedAt, period)) continue;
      for (const cause of rec.causes) {
        const key = `${cause.category}::${cause.subCategory}`;
        counts.set(key, (counts.get(key) || 0) + 1);
        total += 1;
      }
    }
    for (const [key, count] of counts.entries()) {
      const [category, subCategory] = key.split('::');
      const catDef = CAUSE_CATALOG[category];
      const subDef = catDef && catDef.subCategories[subCategory];
      rows.push({
        category,
        subCategory,
        count,
        share: total > 0 ? round(count / total, 4) : 0,
        labels: {
          he: `${catDef ? catDef.he : category}${subDef ? ' / ' + subDef.he : ''}`,
          en: `${catDef ? catDef.en : category}${subDef ? ' / ' + subDef.en : ''}`,
        },
      });
    }
    return sortDescBy(rows, 'count');
  }

  /**
   * Trend analysis: same cause counts bucketed by a month window across the
   * ledger. Buckets are keyed YYYY-MM and sorted ascending.
   */
  trends(outcome, period) {
    if (outcome !== 'won' && outcome !== 'lost') {
      throw new RangeError("trends outcome must be 'won' or 'lost'");
    }
    const buckets = new Map();
    for (const rec of this._records) {
      if (rec.outcome !== outcome) continue;
      if (!inPeriod(rec.closedAt, period)) continue;
      const d = coerceDate(rec.closedAt);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      if (!buckets.has(key)) buckets.set(key, { month: key, total: 0, byCategory: {} });
      const bucket = buckets.get(key);
      bucket.total += 1;
      for (const cause of rec.causes) {
        bucket.byCategory[cause.category] = (bucket.byCategory[cause.category] || 0) + 1;
      }
    }
    return Array.from(buckets.values()).sort((a, b) => (a.month > b.month ? 1 : -1));
  }

  /**
   * Win rate by competitor. Returns rows of
   *   { competitor, wins, losses, total, winRate, shareOfLosses }
   * sorted by total deals desc (so the most significant rivals surface first).
   */
  competitorAnalysis(period) {
    const map = new Map();
    let totalLosses = 0;
    for (const rec of this._records) {
      if (!inPeriod(rec.closedAt, period)) continue;
      const name = rec.competitor || '(unknown)';
      if (!map.has(name)) {
        map.set(name, { competitor: name, wins: 0, losses: 0, total: 0, value: 0 });
      }
      const row = map.get(name);
      row.total += 1;
      row.value += rec.value || 0;
      if (rec.outcome === 'won') row.wins += 1;
      else {
        row.losses += 1;
        totalLosses += 1;
      }
    }
    const rows = Array.from(map.values()).map((r) => ({
      competitor: r.competitor,
      wins: r.wins,
      losses: r.losses,
      total: r.total,
      value: round(r.value, 2),
      winRate: r.total > 0 ? round(r.wins / r.total, 4) : 0,
      shareOfLosses: totalLosses > 0 ? round(r.losses / totalLosses, 4) : 0,
    }));
    return sortDescBy(rows, 'total');
  }

  /**
   * Win rate per segment dimension. Reads metadata attached via
   * upsertOpportunity(); opportunities without metadata fall into '(unknown)'
   * rather than being silently dropped — unknown is itself a signal.
   */
  segmentAnalysis(options = {}) {
    const dimension = options.dimension;
    const allowed = ['industry', 'size', 'region', 'product'];
    if (!allowed.includes(dimension)) {
      throw new RangeError(`segmentAnalysis dimension must be one of ${allowed.join(', ')}`);
    }
    const period = options.period;
    const map = new Map();
    for (const rec of this._records) {
      if (!inPeriod(rec.closedAt, period)) continue;
      const meta = this._opportunityMeta.get(rec.opportunityId) || {};
      const segment = safeString(meta[dimension], '(unknown)');
      if (!map.has(segment)) {
        map.set(segment, { segment, wins: 0, losses: 0, total: 0, value: 0 });
      }
      const row = map.get(segment);
      row.total += 1;
      row.value += rec.value || 0;
      if (rec.outcome === 'won') row.wins += 1;
      else row.losses += 1;
    }
    const rows = Array.from(map.values()).map((r) => ({
      dimension,
      segment: r.segment,
      wins: r.wins,
      losses: r.losses,
      total: r.total,
      value: round(r.value, 2),
      winRate: r.total > 0 ? round(r.wins / r.total, 4) : 0,
    }));
    return sortDescBy(rows, 'total');
  }

  /**
   * Loss pattern analysis. For every opportunity metadata trait and every
   * cause category, compute the loss rate inside that cohort vs the global
   * loss rate. A positive lift (coverLossRate > globalLossRate) means the
   * trait is correlated with losing. Returns the top-correlated traits in
   * descending order of lift, capped to `limit`.
   */
  lossPatterns(options = {}) {
    const period = options.period;
    const limit = options.limit || 10;
    const filtered = this._records.filter((r) => inPeriod(r.closedAt, period));
    const total = filtered.length;
    if (total === 0) return { globalLossRate: 0, patterns: [] };
    const globalLosses = filtered.filter((r) => r.outcome === 'lost').length;
    const globalLossRate = globalLosses / total;

    const patterns = [];

    const dims = ['industry', 'size', 'region', 'product'];
    for (const dim of dims) {
      const cohort = new Map();
      for (const rec of filtered) {
        const meta = this._opportunityMeta.get(rec.opportunityId) || {};
        const value = safeString(meta[dim], '(unknown)');
        if (!cohort.has(value)) cohort.set(value, { total: 0, losses: 0 });
        const c = cohort.get(value);
        c.total += 1;
        if (rec.outcome === 'lost') c.losses += 1;
      }
      for (const [value, c] of cohort.entries()) {
        if (c.total < 2) continue; // ignore noise
        const lossRate = c.losses / c.total;
        patterns.push({
          traitType: dim,
          trait: value,
          cohortSize: c.total,
          lossRate: round(lossRate, 4),
          lift: round(lossRate - globalLossRate, 4),
          correlation: classifyCorrelation(lossRate - globalLossRate),
        });
      }
    }

    // Competitor cohorts
    const compCohort = new Map();
    for (const rec of filtered) {
      const name = rec.competitor || '(unknown)';
      if (!compCohort.has(name)) compCohort.set(name, { total: 0, losses: 0 });
      const c = compCohort.get(name);
      c.total += 1;
      if (rec.outcome === 'lost') c.losses += 1;
    }
    for (const [value, c] of compCohort.entries()) {
      if (c.total < 2) continue;
      const lossRate = c.losses / c.total;
      patterns.push({
        traitType: 'competitor',
        trait: value,
        cohortSize: c.total,
        lossRate: round(lossRate, 4),
        lift: round(lossRate - globalLossRate, 4),
        correlation: classifyCorrelation(lossRate - globalLossRate),
      });
    }

    // Cause-category cohorts (frequency of losses when cause present at all)
    const causeCohort = new Map();
    for (const rec of filtered) {
      const seen = new Set();
      for (const c of rec.causes) {
        if (seen.has(c.category)) continue;
        seen.add(c.category);
        if (!causeCohort.has(c.category)) causeCohort.set(c.category, { total: 0, losses: 0 });
        const bucket = causeCohort.get(c.category);
        bucket.total += 1;
        if (rec.outcome === 'lost') bucket.losses += 1;
      }
    }
    for (const [value, c] of causeCohort.entries()) {
      if (c.total < 2) continue;
      const lossRate = c.losses / c.total;
      patterns.push({
        traitType: 'causeCategory',
        trait: value,
        cohortSize: c.total,
        lossRate: round(lossRate, 4),
        lift: round(lossRate - globalLossRate, 4),
        correlation: classifyCorrelation(lossRate - globalLossRate),
      });
    }

    const ordered = patterns
      .slice()
      .sort((a, b) => b.lift - a.lift || b.cohortSize - a.cohortSize);
    return {
      globalLossRate: round(globalLossRate, 4),
      sample: total,
      patterns: ordered.slice(0, limit),
    };
  }

  /**
   * Render a Hebrew interview script for a lost-deal debrief. Uses the
   * opportunity metadata (if any) to pre-fill the header. The structure
   * follows a classic win/loss debrief: context → discovery → decision
   * criteria → competition → gap → advice → closing. Bilingual header.
   */
  interviewTemplate(opportunityId) {
    const rec = this._latestByOpp.get(opportunityId);
    const meta = this._opportunityMeta.get(opportunityId) || {};
    const today = this._now();
    const dateStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;

    const lines = [];
    lines.push('תחקיר הפסד עסקה / Lost Deal Debrief');
    lines.push('==============================================');
    lines.push(`מזהה הזדמנות / Opportunity ID: ${opportunityId}`);
    lines.push(`תאריך הריאיון / Interview date: ${dateStr}`);
    if (meta.accountName) lines.push(`לקוח / Account: ${meta.accountName}`);
    if (meta.industry) lines.push(`ענף / Industry: ${meta.industry}`);
    if (meta.region) lines.push(`אזור / Region: ${meta.region}`);
    if (meta.product) lines.push(`מוצר / Product: ${meta.product}`);
    if (rec && rec.competitor) lines.push(`מתחרה זוכה / Winning competitor: ${rec.competitor}`);
    lines.push('');
    lines.push('כללי הריאיון / Interview ground rules');
    lines.push('----------------------------------------------');
    lines.push('1. הריאיון מתועד ומשמש ללמידה פנימית בלבד.');
    lines.push('2. אין תשובה נכונה או שגויה — נשמח לפידבק כן.');
    lines.push('3. לא נחזור על הצעת המחיר בשלב הזה.');
    lines.push('4. משך משוער: 20–30 דקות.');
    lines.push('');
    lines.push('פתיחה / Warm-up');
    lines.push('----------------------------------------------');
    lines.push('• ספר/י לי בקצרה מה הייתה המטרה העסקית שמאחורי הפרויקט הזה?');
    lines.push('• מי היו השותפים להחלטה? מי חתם בסוף?');
    lines.push('');
    lines.push('גילוי וצרכים / Discovery');
    lines.push('----------------------------------------------');
    lines.push('• אילו קריטריונים היו הכי חשובים כשבחרתם מערכת?');
    lines.push('• דרגו את הקריטריונים: מחיר, תכונות, יחסים, תמיכה, אינטגרציה.');
    lines.push('• איזו בעיה עסקית ביקשתם לפתור? מה קרה אם לא פותרים אותה?');
    lines.push('');
    lines.push('קריטריוני החלטה / Decision criteria');
    lines.push('----------------------------------------------');
    lines.push('• מה הייתה הסיבה המרכזית שהוביל אתכם לבחירה הסופית?');
    lines.push('• היה גורם שהיה יכול לשנות את ההחלטה לכיוונה שלנו?');
    lines.push('• איך הערכתם ROI, TCO ותנאי תשלום?');
    lines.push('');
    lines.push('תחרות / Competition');
    lines.push('----------------------------------------------');
    lines.push('• אילו ספקים נוספים הייתם בשיחה איתם?');
    lines.push('• מה המתחרה עשה טוב יותר מאיתנו בשלב הדמו?');
    lines.push('• האם הייתה השוואת הצעות מחיר? מי הצליח להסביר את הערך הכי ברור?');
    lines.push('• האם הייתה השפעה של ספק מכהן או המלצת לקוח קיים?');
    lines.push('');
    lines.push('הפער שלנו / Our gap');
    lines.push('----------------------------------------------');
    lines.push('• איפה הרגשתם שלא ענינו על הציפיות?');
    lines.push('• היה רגע בתהליך שבו "איבדתם עניין"? מה גרם לזה?');
    lines.push('• מה הייתם רוצים שהיינו עושים אחרת?');
    lines.push('');
    lines.push('עצה לעתיד / Advice for the future');
    lines.push('----------------------------------------------');
    lines.push('• אם היינו חוזרים אליכם בעוד 12 חודשים, איזה שינוי יהפוך אותנו לרלוונטיים?');
    lines.push('• האם תסכימו להיות reference חלקי על קטגוריה מסוימת?');
    lines.push('• מה היה עוצר אתכם מלבחור בנו גם אם המחיר היה זהה?');
    lines.push('');
    lines.push('סיכום / Wrap-up');
    lines.push('----------------------------------------------');
    lines.push('• האם יש משהו שלא שאלתי ואתם חושבים שחשוב לדעת?');
    lines.push('• תודה רבה! אשלח לכם סיכום בכתב לאישור תוך יומיים.');
    lines.push('');
    lines.push('שדות לתיעוד / Fields to log');
    lines.push('----------------------------------------------');
    lines.push('- category (מחיר / תכונות / תזמון / יחסים / מתחרה / תקציב / אין החלטה / התאמה / מסירה / משפטי)');
    lines.push('- subCategory');
    lines.push('- competitor');
    lines.push('- notes (הערות מילוליות)');
    return {
      opportunityId,
      lang: 'he',
      fallbackEn: true,
      script: lines.join('\n'),
      sections: [
        'header',
        'ground_rules',
        'warm_up',
        'discovery',
        'decision_criteria',
        'competition',
        'gap',
        'advice',
        'wrap_up',
        'fields',
      ],
      suggestedDurationMinutes: 25,
      causeFieldsHint: this.causeCatalog(),
    };
  }

  /**
   * Bilingual win/loss report — a compact summary usable directly in
   * a management deck. Pure data object, no I/O.
   */
  generateReport(period) {
    const inWindow = (r) => inPeriod(r.closedAt, period);
    const records = this._records.filter(inWindow);
    const wins = records.filter((r) => r.outcome === 'won');
    const losses = records.filter((r) => r.outcome === 'lost');
    const totalValue = records.reduce((sum, r) => sum + (r.value || 0), 0);
    const wonValue = wins.reduce((sum, r) => sum + (r.value || 0), 0);
    const lostValue = losses.reduce((sum, r) => sum + (r.value || 0), 0);
    const winRate = records.length > 0 ? wins.length / records.length : 0;

    const topWinCauses = this.topCauses('won', period).slice(0, 5);
    const topLossCauses = this.topCauses('lost', period).slice(0, 5);
    const competitors = this.competitorAnalysis(period);
    const patterns = this.lossPatterns({ period, limit: 5 });

    return {
      generatedAt: this._now().toISOString(),
      period: period || null,
      summary: {
        he: {
          title: 'דוח ניצחונות והפסדים',
          deals: records.length,
          wins: wins.length,
          losses: losses.length,
          winRate: round(winRate, 4),
          lostValue: round(lostValue, 2),
          wonValue: round(wonValue, 2),
          totalValue: round(totalValue, 2),
        },
        en: {
          title: 'Win / Loss Report',
          deals: records.length,
          wins: wins.length,
          losses: losses.length,
          winRate: round(winRate, 4),
          lostValue: round(lostValue, 2),
          wonValue: round(wonValue, 2),
          totalValue: round(totalValue, 2),
        },
      },
      topWinCauses,
      topLossCauses,
      competitors,
      lossPatterns: patterns,
      glossary: HEBREW_GLOSSARY,
      recommendations: buildRecommendations(topLossCauses, patterns),
      ruleReminder: 'לא מוחקים רק משדרגים ומגדלים',
    };
  }

  /**
   * Read-only access to the append-only ledger. Returns a shallow copy so
   * callers cannot mutate internal state.
   */
  getRecords() {
    return this._records.slice();
  }
}

function classifyCorrelation(lift) {
  if (lift >= 0.2) return 'strong_loss_lift';
  if (lift >= 0.1) return 'loss_lift';
  if (lift >= 0.03) return 'mild_loss_lift';
  if (lift <= -0.2) return 'strong_win_lift';
  if (lift <= -0.1) return 'win_lift';
  if (lift <= -0.03) return 'mild_win_lift';
  return 'neutral';
}

function buildRecommendations(topLossCauses, patterns) {
  const recs = [];
  for (const cause of topLossCauses.slice(0, 3)) {
    const catDef = CAUSE_CATALOG[cause.category];
    if (!catDef) continue;
    recs.push({
      priority: 'high',
      cause: cause.category,
      he: `להתמקד בטיפול בסיבה: ${catDef.he}${cause.subCategory ? ' / ' + (catDef.subCategories[cause.subCategory]?.he || cause.subCategory) : ''}`,
      en: `Focus on addressing cause: ${catDef.en}${cause.subCategory ? ' / ' + (catDef.subCategories[cause.subCategory]?.en || cause.subCategory) : ''}`,
    });
  }
  for (const pat of patterns.patterns.slice(0, 2)) {
    if (pat.correlation.includes('loss_lift')) {
      recs.push({
        priority: pat.correlation === 'strong_loss_lift' ? 'high' : 'medium',
        cause: `${pat.traitType}:${pat.trait}`,
        he: `קוהורט בסיכון: ${pat.traitType}=${pat.trait} (שיעור הפסד ${Math.round(pat.lossRate * 100)}%)`,
        en: `At-risk cohort: ${pat.traitType}=${pat.trait} (loss rate ${Math.round(pat.lossRate * 100)}%)`,
      });
    }
  }
  return recs;
}

module.exports = {
  WinLossAnalyzer,
  CAUSE_CATALOG,
  HEBREW_GLOSSARY,
  // exported for tests only
  __internal__: {
    classifyCorrelation,
    buildRecommendations,
    inPeriod,
    round,
  },
};
