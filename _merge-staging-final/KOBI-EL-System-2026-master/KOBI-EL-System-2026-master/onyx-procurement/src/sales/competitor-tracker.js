/**
 * CompetitorTracker — Competitor Intelligence Tracker
 * ====================================================
 * Mega-ERP Techno-Kol Uzi
 * Rule: לא מוחקים רק משדרגים ומגדלים (never delete, only upgrade and grow)
 *
 * Zero dependencies. Pure JavaScript. CommonJS.
 * Bilingual: Hebrew (RTL) + English.
 *
 * Responsibilities:
 *  - Define competitors with profile (strengths, weaknesses, pricing, segments)
 *  - Record encounters on every sales opportunity where competitor appeared
 *  - Compute win rate against each competitor
 *  - Generate bilingual battlecards (HE/EN)
 *  - Append intel (news, pricing changes, product launches)
 *  - List active competitors by segment
 *  - Auto-generate SWOT from accumulated intel + encounters
 *
 * Immutability rule: no record is ever deleted. Everything is append-only.
 * Updates create new versions; old versions remain in `history[]`.
 */

'use strict';

// ---------- Constants & dictionaries ---------------------------------------

const OUTCOMES = Object.freeze({
  WON: 'won',             // we won the deal
  LOST: 'lost',           // competitor won
  TIE: 'tie',             // draw / split / delayed
  WITHDREW: 'withdrew',   // competitor withdrew
  NO_DECISION: 'no_decision',
});

const VALID_OUTCOMES = Object.freeze(Object.values(OUTCOMES));

const SIZE_LABELS = Object.freeze({
  micro:   { he: 'זעיר',         en: 'Micro' },
  small:   { he: 'קטן',          en: 'Small' },
  medium:  { he: 'בינוני',       en: 'Medium' },
  large:   { he: 'גדול',         en: 'Large' },
  enterprise: { he: 'ארגוני',   en: 'Enterprise' },
});

const INTEL_CATEGORIES = Object.freeze({
  NEWS:           'news',
  PRICING_CHANGE: 'pricing_change',
  PRODUCT_LAUNCH: 'product_launch',
  LEADERSHIP:     'leadership',
  FUNDING:        'funding',
  LAYOFF:         'layoff',
  ACQUISITION:    'acquisition',
  PARTNERSHIP:    'partnership',
  CUSTOMER_WIN:   'customer_win',
  CUSTOMER_LOSS:  'customer_loss',
  LEGAL:          'legal',
  OTHER:          'other',
});

const BILINGUAL_LABELS = Object.freeze({
  battlecard:     { he: 'כרטיס קרב',                 en: 'Battlecard' },
  competitor:     { he: 'מתחרה',                     en: 'Competitor' },
  overview:       { he: 'סקירה כללית',              en: 'Overview' },
  strengths:      { he: 'חוזקות',                    en: 'Strengths' },
  weaknesses:     { he: 'חולשות',                   en: 'Weaknesses' },
  featureCompare: { he: 'השוואת תכונות',           en: 'Feature Comparison' },
  priceCompare:   { he: 'השוואת מחירים',           en: 'Price Comparison' },
  positioning:    { he: 'הצהרת מיצוב',             en: 'Positioning Statement' },
  objections:     { he: 'מענה להתנגדויות',         en: 'Objection Handlers' },
  proofPoints:    { he: 'נקודות הוכחה',            en: 'Proof Points' },
  trapQuestions:  { he: 'שאלות מלכודת',            en: 'Trap Questions' },
  winRate:        { he: 'שיעור ניצחון',            en: 'Win Rate' },
  encounters:     { he: 'מפגשים',                   en: 'Encounters' },
  swot:           { he: 'ניתוח SWOT',               en: 'SWOT Analysis' },
  opportunities:  { he: 'הזדמנויות',                en: 'Opportunities' },
  threats:        { he: 'איומים',                    en: 'Threats' },
  pricingModel:   { he: 'מודל תמחור',              en: 'Pricing Model' },
  segments:       { he: 'מגזרים',                    en: 'Segments' },
  website:        { he: 'אתר אינטרנט',             en: 'Website' },
  country:        { he: 'מדינה',                     en: 'Country' },
  size:           { he: 'גודל',                      en: 'Size' },
  lastUpdated:    { he: 'עודכן לאחרונה',          en: 'Last Updated' },
  recentIntel:    { he: 'מודיעין אחרון',           en: 'Recent Intel' },
  totalDeals:     { he: 'סה״כ עסקאות',             en: 'Total Deals' },
  wonDeals:       { he: 'נוצחו',                    en: 'Won' },
  lostDeals:      { he: 'הופסדו',                   en: 'Lost' },
});

// ---------- Utilities -------------------------------------------------------

function nowIso() { return new Date().toISOString(); }

function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepClone);
  const out = {};
  for (const k of Object.keys(obj)) out[k] = deepClone(obj[k]);
  return out;
}

function requireString(val, name) {
  if (typeof val !== 'string' || val.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return val.trim();
}

function toArray(val) {
  if (val == null) return [];
  return Array.isArray(val) ? val.slice() : [val];
}

function roundPct(n, digits = 1) {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

function safeSizeLabel(size) {
  if (size && SIZE_LABELS[size]) return SIZE_LABELS[size];
  return { he: size || '—', en: size || '—' };
}

// ---------- Main class ------------------------------------------------------

class CompetitorTracker {
  constructor(opts = {}) {
    // Storage: Map<competitorId, competitorRecord>
    this._competitors = new Map();
    // Storage: array of encounter records (append-only)
    this._encounters = [];
    // Storage: Map<competitorId, Array<intelEntry>>
    this._intel = new Map();
    // Frozen clock for tests
    this._clock = typeof opts.clock === 'function' ? opts.clock : nowIso;
    // Trace of all mutations (audit log — never purged)
    this._auditLog = [];
  }

  // -- small internal helpers -----------------------------------------------

  _audit(action, payload) {
    this._auditLog.push({
      at: this._clock(),
      action,
      payload: deepClone(payload),
    });
  }

  _mustGet(id) {
    const rec = this._competitors.get(id);
    if (!rec) throw new Error(`Competitor not found: ${id}`);
    return rec;
  }

  // -- defineCompetitor ------------------------------------------------------

  /**
   * Define (or upgrade) a competitor profile.
   * If the id already exists, we UPGRADE — old version moves to history[].
   *
   * @param {object} p
   * @param {string} p.id
   * @param {string} p.name
   * @param {string} [p.website]
   * @param {string} [p.country]
   * @param {string} [p.size]         micro|small|medium|large|enterprise
   * @param {string[]} [p.segments]
   * @param {string[]} [p.strengths]
   * @param {string[]} [p.weaknesses]
   * @param {string}   [p.pricingModel]
   * @returns {object} the stored competitor record (cloned)
   */
  defineCompetitor(p) {
    if (!p || typeof p !== 'object') {
      throw new TypeError('defineCompetitor: payload must be an object');
    }
    const id = requireString(p.id, 'id');
    const name = requireString(p.name, 'name');

    const record = {
      id,
      name,
      website:      p.website || '',
      country:      p.country || '',
      size:         p.size || '',
      segments:     toArray(p.segments).map(String),
      strengths:    toArray(p.strengths).map(String),
      weaknesses:   toArray(p.weaknesses).map(String),
      pricingModel: p.pricingModel || '',
      createdAt:    this._clock(),
      updatedAt:    this._clock(),
      version:      1,
      history:      [],
      // Battlecard overrides (bilingual) can be injected by updateIntel
      positioning:  p.positioning || null,
      objectionHandlers: toArray(p.objectionHandlers),
      proofPoints:  toArray(p.proofPoints),
      trapQuestions: toArray(p.trapQuestions),
      features:     p.features || {},   // {featureName: {us: 'x', them: 'y'}}
      priceBands:   p.priceBands || {}, // {tier: {us: n, them: n, currency}}
    };

    const existing = this._competitors.get(id);
    if (existing) {
      // Upgrade path — push previous snapshot to history, bump version.
      const snapshot = deepClone(existing);
      delete snapshot.history;
      record.history = (existing.history || []).concat([snapshot]);
      record.version = (existing.version || 1) + 1;
      record.createdAt = existing.createdAt;
    }

    this._competitors.set(id, record);
    if (!this._intel.has(id)) this._intel.set(id, []);
    this._audit('defineCompetitor', { id, version: record.version });
    return deepClone(record);
  }

  /**
   * Read one competitor (deep clone, safe to mutate).
   */
  getCompetitor(id) {
    const rec = this._competitors.get(id);
    return rec ? deepClone(rec) : null;
  }

  /**
   * All competitors.
   */
  listCompetitors() {
    return Array.from(this._competitors.values()).map(deepClone);
  }

  // -- recordEncounter -------------------------------------------------------

  /**
   * Record a competitive encounter on a specific opportunity.
   *
   * @param {string} opportunityId
   * @param {string} competitorId
   * @param {string} outcome     won|lost|tie|withdrew|no_decision
   * @param {string} [notes]
   * @returns {object} encounter record (cloned)
   */
  recordEncounter(opportunityId, competitorId, outcome, notes) {
    const oppId = requireString(opportunityId, 'opportunityId');
    const cid   = requireString(competitorId, 'competitorId');
    if (!VALID_OUTCOMES.includes(outcome)) {
      throw new TypeError(
        `recordEncounter: outcome must be one of ${VALID_OUTCOMES.join(', ')}`,
      );
    }
    // Ensure competitor exists. Per upgrade-not-delete, we auto-create stub.
    if (!this._competitors.has(cid)) {
      this.defineCompetitor({ id: cid, name: cid });
    }

    const entry = {
      id:            `enc_${this._encounters.length + 1}_${Date.now()}`,
      opportunityId: oppId,
      competitorId:  cid,
      outcome,
      notes:         typeof notes === 'string' ? notes : '',
      recordedAt:    this._clock(),
    };
    this._encounters.push(entry);
    this._audit('recordEncounter', { id: entry.id, outcome });
    return deepClone(entry);
  }

  /**
   * All encounters matching a competitor id.
   */
  listEncounters(competitorId) {
    return this._encounters
      .filter((e) => !competitorId || e.competitorId === competitorId)
      .map(deepClone);
  }

  // -- winRateVsCompetitor ---------------------------------------------------

  /**
   * Compute our win rate versus a specific competitor.
   * Denominator = decisive encounters only (won + lost). Ties & no_decision
   * are excluded from the ratio but still surfaced in the return object.
   *
   * @param {string} competitorId
   * @returns {{
   *   competitorId: string,
   *   total: number,
   *   won: number, lost: number, tie: number, withdrew: number, noDecision: number,
   *   decisive: number,
   *   winRate: number,   // 0..1
   *   winRatePct: number // 0..100, rounded
   * }}
   */
  winRateVsCompetitor(competitorId) {
    const cid = requireString(competitorId, 'competitorId');
    const rows = this._encounters.filter((e) => e.competitorId === cid);
    const tally = {
      won: 0, lost: 0, tie: 0, withdrew: 0, noDecision: 0,
    };
    for (const r of rows) {
      if (r.outcome === OUTCOMES.WON)          tally.won++;
      else if (r.outcome === OUTCOMES.LOST)    tally.lost++;
      else if (r.outcome === OUTCOMES.TIE)     tally.tie++;
      else if (r.outcome === OUTCOMES.WITHDREW) tally.withdrew++;
      else if (r.outcome === OUTCOMES.NO_DECISION) tally.noDecision++;
    }
    const decisive = tally.won + tally.lost;
    const winRate = decisive === 0 ? 0 : tally.won / decisive;
    return {
      competitorId: cid,
      total: rows.length,
      ...tally,
      decisive,
      winRate,
      winRatePct: roundPct(winRate * 100, 1),
    };
  }

  // -- getBattlecard ---------------------------------------------------------

  /**
   * Generate a bilingual battlecard. Returns a plain object with both an
   * `he` (Hebrew RTL) and `en` (English LTR) section plus shared data.
   *
   * @param {string} competitorId
   * @returns {object} bilingual battlecard
   */
  getBattlecard(competitorId) {
    const rec = this._mustGet(competitorId);
    const wr = this.winRateVsCompetitor(competitorId);
    const intel = (this._intel.get(competitorId) || []).slice().reverse();
    const recentIntel = intel.slice(0, 5);

    // Feature comparison — normalized rows
    const featureRows = Object.keys(rec.features || {}).map((featName) => {
      const f = rec.features[featName] || {};
      return {
        feature: featName,
        us: f.us || '',
        them: f.them || '',
        advantage: f.advantage || (f.us && !f.them ? 'us'
                                  : f.them && !f.us ? 'them'
                                  : 'tie'),
      };
    });

    // Price comparison — normalized rows
    const priceRows = Object.keys(rec.priceBands || {}).map((tier) => {
      const p = rec.priceBands[tier] || {};
      const us = Number(p.us || 0);
      const them = Number(p.them || 0);
      return {
        tier,
        us,
        them,
        currency: p.currency || 'ILS',
        delta: them === 0 ? 0 : roundPct(((us - them) / them) * 100, 1),
      };
    });

    // Default positioning statement if none configured
    const defaultPositioning = {
      he: `${rec.name} הוא מתחרה ${safeSizeLabel(rec.size).he} במגזרי ${rec.segments.join(', ') || 'כללי'}. אנחנו מנצחים כאשר הלקוח מעדיף מוצר בשלות גבוהה, תמיכה מקומית וזמן-יישום קצר.`,
      en: `${rec.name} is a ${safeSizeLabel(rec.size).en} competitor in ${rec.segments.join(', ') || 'general'} segments. We win when the customer values product maturity, local support, and short time-to-value.`,
    };

    const positioning = rec.positioning && (rec.positioning.he || rec.positioning.en)
      ? {
          he: rec.positioning.he || defaultPositioning.he,
          en: rec.positioning.en || defaultPositioning.en,
        }
      : defaultPositioning;

    // Default objection handlers
    const defaultObjections = [
      {
        objection: { he: `${rec.name} זול יותר.`, en: `${rec.name} is cheaper.` },
        handler:   {
          he: 'עלות הבעלות הכוללת (TCO) כוללת הטמעה, הכשרה, שדרוגים וזמינות. השוו TCO ל-3 שנים — לא רק מחיר מדבקה.',
          en: 'Total cost of ownership (TCO) includes implementation, training, upgrades, and availability. Compare 3-year TCO — not just sticker price.',
        },
      },
      {
        objection: { he: `${rec.name} מוכר יותר בשוק.`, en: `${rec.name} is better known.` },
        handler: {
          he: 'מוכרות אינה התאמה. בקשו 3 הפניות מלקוחות דומים בגודל ובמגזר שלכם בישראל — ולא שמות גלובליים.',
          en: 'Brand recognition is not fit. Ask for 3 references of customers matching your size and segment in Israel — not global logos.',
        },
      },
    ];
    const objectionHandlers = rec.objectionHandlers && rec.objectionHandlers.length
      ? rec.objectionHandlers
      : defaultObjections;

    // Default proof points
    const defaultProof = [
      {
        he: 'יישום חי ב-14 ימים בממוצע אצל לקוחות בגודל בינוני.',
        en: 'Go-live in 14 days on average for mid-market customers.',
      },
      {
        he: 'תמיכה מקומית 24/7 בעברית — לא מוקד חו״ל.',
        en: 'Local 24/7 Hebrew support — no offshore call center.',
      },
    ];
    const proofPoints = rec.proofPoints && rec.proofPoints.length
      ? rec.proofPoints
      : defaultProof;

    // Default trap questions
    const defaultTraps = [
      {
        he: 'האם התמחור שלהם כולל עדכוני גרסה ותמיכה 24/7?',
        en: 'Does their pricing include version upgrades and 24/7 support?',
      },
      {
        he: 'מה זמן התגובה שלהם ל-SLA קריטי ובאיזו שפה?',
        en: "What's their critical-SLA response time, and in which language?",
      },
      {
        he: 'איך הם מתמודדים עם דרישות דיווח לרשויות המס בישראל?',
        en: 'How do they handle Israeli tax authority reporting requirements?',
      },
    ];
    const trapQuestions = rec.trapQuestions && rec.trapQuestions.length
      ? rec.trapQuestions
      : defaultTraps;

    const L = BILINGUAL_LABELS;

    return {
      competitorId: rec.id,
      name: rec.name,
      version: rec.version,
      generatedAt: this._clock(),
      metadata: {
        website:      rec.website,
        country:      rec.country,
        size:         rec.size,
        sizeLabel:    safeSizeLabel(rec.size),
        segments:     rec.segments.slice(),
        pricingModel: rec.pricingModel,
        lastUpdated:  rec.updatedAt,
      },
      labels: L,
      winStats: wr,
      featureComparison: featureRows,
      priceComparison:   priceRows,
      positioning,
      objectionHandlers,
      proofPoints,
      trapQuestions,
      recentIntel,

      // Hebrew RTL section (intended for rendering with dir="rtl")
      he: {
        dir: 'rtl',
        lang: 'he',
        title: `${L.battlecard.he}: ${rec.name}`,
        sections: {
          [L.overview.he]: {
            [L.country.he]:      rec.country || '—',
            [L.size.he]:         safeSizeLabel(rec.size).he,
            [L.segments.he]:     rec.segments.join(', ') || '—',
            [L.pricingModel.he]: rec.pricingModel || '—',
            [L.website.he]:      rec.website || '—',
            [L.lastUpdated.he]:  rec.updatedAt,
          },
          [L.strengths.he]:   rec.strengths.slice(),
          [L.weaknesses.he]:  rec.weaknesses.slice(),
          [L.featureCompare.he]: featureRows,
          [L.priceCompare.he]:   priceRows,
          [L.positioning.he]:    positioning.he,
          [L.objections.he]:     objectionHandlers.map((o) => ({
            objection: o.objection.he,
            handler:   o.handler.he,
          })),
          [L.proofPoints.he]:    proofPoints.map((p) => p.he),
          [L.trapQuestions.he]:  trapQuestions.map((t) => t.he),
          [L.recentIntel.he]:    recentIntel.map((i) => ({
            category: i.category,
            summary:  (i.summary && i.summary.he) || i.summary || '',
            at:       i.at,
          })),
          [L.winRate.he]: `${wr.winRatePct}% (${wr.won}/${wr.decisive})`,
        },
      },

      // English LTR section
      en: {
        dir: 'ltr',
        lang: 'en',
        title: `${L.battlecard.en}: ${rec.name}`,
        sections: {
          [L.overview.en]: {
            [L.country.en]:      rec.country || '—',
            [L.size.en]:         safeSizeLabel(rec.size).en,
            [L.segments.en]:     rec.segments.join(', ') || '—',
            [L.pricingModel.en]: rec.pricingModel || '—',
            [L.website.en]:      rec.website || '—',
            [L.lastUpdated.en]:  rec.updatedAt,
          },
          [L.strengths.en]:   rec.strengths.slice(),
          [L.weaknesses.en]:  rec.weaknesses.slice(),
          [L.featureCompare.en]: featureRows,
          [L.priceCompare.en]:   priceRows,
          [L.positioning.en]:    positioning.en,
          [L.objections.en]:     objectionHandlers.map((o) => ({
            objection: o.objection.en,
            handler:   o.handler.en,
          })),
          [L.proofPoints.en]:    proofPoints.map((p) => p.en),
          [L.trapQuestions.en]:  trapQuestions.map((t) => t.en),
          [L.recentIntel.en]:    recentIntel.map((i) => ({
            category: i.category,
            summary:  (i.summary && i.summary.en) || i.summary || '',
            at:       i.at,
          })),
          [L.winRate.en]: `${wr.winRatePct}% (${wr.won}/${wr.decisive})`,
        },
      },
    };
  }

  // -- updateIntel -----------------------------------------------------------

  /**
   * Append an intel entry (news, pricing, launch, etc.) — NEVER overwrites.
   * Old record stays via history snapshot.
   *
   * @param {string} competitorId
   * @param {object} intel
   * @param {string} intel.category
   * @param {string|object} intel.summary - string or {he, en}
   * @param {string} [intel.source]
   * @param {string} [intel.url]
   * @param {object} [intel.delta] - freeform structured patch (e.g. price change)
   * @returns {object} stored intel entry
   */
  updateIntel(competitorId, intel) {
    const cid = requireString(competitorId, 'competitorId');
    const rec = this._mustGet(cid);
    if (!intel || typeof intel !== 'object') {
      throw new TypeError('updateIntel: intel must be an object');
    }
    const category = requireString(intel.category, 'intel.category');

    // Normalize summary to {he, en}
    let summary;
    if (typeof intel.summary === 'string') {
      summary = { he: intel.summary, en: intel.summary };
    } else if (intel.summary && typeof intel.summary === 'object') {
      summary = {
        he: intel.summary.he || intel.summary.en || '',
        en: intel.summary.en || intel.summary.he || '',
      };
    } else {
      throw new TypeError('updateIntel: intel.summary is required');
    }

    const entry = {
      id:       `intel_${(this._intel.get(cid) || []).length + 1}_${Date.now()}`,
      category,
      summary,
      source:   intel.source || '',
      url:      intel.url || '',
      delta:    intel.delta && typeof intel.delta === 'object' ? deepClone(intel.delta) : null,
      at:       this._clock(),
    };

    const list = this._intel.get(cid) || [];
    list.push(entry);
    this._intel.set(cid, list);

    // Upgrade the competitor record (history snapshot) — never delete old.
    const snapshot = deepClone(rec);
    delete snapshot.history;
    rec.history = (rec.history || []).concat([snapshot]);
    rec.version = (rec.version || 1) + 1;
    rec.updatedAt = this._clock();

    // Apply structured delta if provided: pricingModel, priceBands, features,
    // strengths, weaknesses, positioning, objectionHandlers, proofPoints,
    // trapQuestions, segments — additively.
    if (entry.delta) {
      const d = entry.delta;
      if (typeof d.pricingModel === 'string') rec.pricingModel = d.pricingModel;
      if (d.priceBands && typeof d.priceBands === 'object') {
        rec.priceBands = Object.assign({}, rec.priceBands, d.priceBands);
      }
      if (d.features && typeof d.features === 'object') {
        rec.features = Object.assign({}, rec.features, d.features);
      }
      if (Array.isArray(d.strengths))  rec.strengths  = rec.strengths.concat(d.strengths);
      if (Array.isArray(d.weaknesses)) rec.weaknesses = rec.weaknesses.concat(d.weaknesses);
      if (Array.isArray(d.segments)) {
        for (const s of d.segments) {
          if (!rec.segments.includes(s)) rec.segments.push(s);
        }
      }
      if (d.positioning) rec.positioning = d.positioning;
      if (Array.isArray(d.objectionHandlers)) rec.objectionHandlers = d.objectionHandlers;
      if (Array.isArray(d.proofPoints))       rec.proofPoints       = d.proofPoints;
      if (Array.isArray(d.trapQuestions))     rec.trapQuestions     = d.trapQuestions;
    }

    this._audit('updateIntel', { competitorId: cid, intelId: entry.id, category });
    return deepClone(entry);
  }

  /**
   * Full intel trail for one competitor (ordered oldest -> newest).
   */
  listIntel(competitorId) {
    const cid = requireString(competitorId, 'competitorId');
    return (this._intel.get(cid) || []).map(deepClone);
  }

  // -- listActiveCompetitors -------------------------------------------------

  /**
   * Return active competitors in a segment (or all if segment omitted).
   * "Active" = has at least one encounter OR at least one intel entry in the
   * last 365 days. Everyone else stays in storage (we never delete) but is
   * excluded from the active roster.
   *
   * @param {string} [segment]
   * @returns {Array<object>} competitor records sorted by recency
   */
  listActiveCompetitors(segment) {
    const cutoffMs = Date.parse(this._clock()) - 365 * 24 * 60 * 60 * 1000;
    const out = [];
    for (const rec of this._competitors.values()) {
      if (segment && !rec.segments.includes(segment)) continue;

      const intelList = this._intel.get(rec.id) || [];
      const lastIntelAt = intelList.length
        ? Date.parse(intelList[intelList.length - 1].at)
        : 0;

      const myEncs = this._encounters.filter((e) => e.competitorId === rec.id);
      const lastEncAt = myEncs.length
        ? Date.parse(myEncs[myEncs.length - 1].recordedAt)
        : 0;

      const lastActivity = Math.max(lastIntelAt, lastEncAt);
      if (lastActivity === 0) continue;
      if (lastActivity < cutoffMs) continue;

      out.push({
        ...deepClone(rec),
        lastActivityAt: new Date(lastActivity).toISOString(),
        encounterCount: myEncs.length,
        intelCount:     intelList.length,
      });
    }
    out.sort((a, b) => (b.lastActivityAt || '').localeCompare(a.lastActivityAt || ''));
    return out;
  }

  // -- generateSWOT ----------------------------------------------------------

  /**
   * Auto-generate a SWOT analysis from accumulated intel + encounters.
   * Returns a bilingual object with Strengths/Weaknesses derived from the
   * competitor profile, and Opportunities/Threats synthesized from intel
   * categories + win rate trends.
   *
   * @param {string} competitorId
   * @returns {object} { he:{...}, en:{...}, raw:{...}, score, summary }
   */
  generateSWOT(competitorId) {
    const rec = this._mustGet(competitorId);
    const wr = this.winRateVsCompetitor(competitorId);
    const intel = this._intel.get(competitorId) || [];

    // Buckets (we collect bilingual pairs)
    const S = [], W = [], O = [], T = [];

    // --- Strengths (their strengths = threats for us, still listed here)
    for (const s of rec.strengths || []) {
      S.push({ he: s, en: s });
    }
    // Large/enterprise size = strength
    if (rec.size === 'large' || rec.size === 'enterprise') {
      S.push({
        he: `${safeSizeLabel(rec.size).he} — נוכחות שוק רחבה`,
        en: `${safeSizeLabel(rec.size).en} — broad market presence`,
      });
    }
    // Multiple segments = breadth strength
    if ((rec.segments || []).length >= 3) {
      S.push({
        he: 'פריסה רב-מגזרית',
        en: 'Multi-segment coverage',
      });
    }

    // --- Weaknesses (theirs)
    for (const w of rec.weaknesses || []) {
      W.push({ he: w, en: w });
    }
    // High win rate against them => they have a structural weakness
    if (wr.decisive >= 3 && wr.winRate >= 0.6) {
      W.push({
        he: `אנו מנצחים ב-${wr.winRatePct}% מהעסקאות מולם`,
        en: `We win ${wr.winRatePct}% of deals against them`,
      });
    }
    // Low pricing transparency
    if (!rec.pricingModel) {
      W.push({
        he: 'אין שקיפות תמחור פומבית',
        en: 'No public pricing transparency',
      });
    }

    // --- Opportunities (for us, against them)
    const categoryCounts = {};
    for (const i of intel) {
      categoryCounts[i.category] = (categoryCounts[i.category] || 0) + 1;
    }
    if (categoryCounts[INTEL_CATEGORIES.LAYOFF]) {
      O.push({
        he: 'פיטורים אצל המתחרה — חוסר יציבות בצוות, הזדמנות לגייס לקוחות',
        en: 'Competitor layoffs — team instability, opportunity to poach customers',
      });
    }
    if (categoryCounts[INTEL_CATEGORIES.CUSTOMER_LOSS]) {
      O.push({
        he: 'המתחרה איבד לקוחות לאחרונה — לפנות ישירות ברשימת שימור',
        en: 'Competitor recently lost customers — approach with retention list',
      });
    }
    if (categoryCounts[INTEL_CATEGORIES.PRICING_CHANGE]) {
      O.push({
        he: 'שינוי תמחור אחרון — לקוחות קיימים פתוחים להשוואה מחודשת',
        en: 'Recent pricing change — existing customers open to re-evaluation',
      });
    }
    if (wr.decisive >= 3 && wr.winRate >= 0.5) {
      O.push({
        he: `תאימות גבוהה — שיעור ניצחון ${wr.winRatePct}%`,
        en: `Strong fit — ${wr.winRatePct}% win rate`,
      });
    }

    // --- Threats (for us, from them)
    if (categoryCounts[INTEL_CATEGORIES.FUNDING]) {
      T.push({
        he: 'גיוס הון חדש — כוח שיווק ומכירות מוגבר',
        en: 'New funding — increased sales and marketing firepower',
      });
    }
    if (categoryCounts[INTEL_CATEGORIES.PRODUCT_LAUNCH]) {
      T.push({
        he: 'השקת מוצר חדש — פער תכונות אפשרי',
        en: 'New product launch — possible feature gap',
      });
    }
    if (categoryCounts[INTEL_CATEGORIES.ACQUISITION]) {
      T.push({
        he: 'רכישה — הרחבת יכולות או תחומי פעילות',
        en: 'Acquisition — expanded capabilities or territories',
      });
    }
    if (categoryCounts[INTEL_CATEGORIES.CUSTOMER_WIN]) {
      T.push({
        he: 'ניצחונות לקוח עדכניים — תאוצה במכירות',
        en: 'Recent customer wins — sales momentum',
      });
    }
    if (wr.decisive >= 3 && wr.winRate < 0.4) {
      T.push({
        he: `חוסמים מבניים — שיעור ניצחון ${wr.winRatePct}%`,
        en: `Structural blockers — ${wr.winRatePct}% win rate`,
      });
    }

    // Score: normalized to -100..100 (positive = we dominate)
    const score = (S.length * -5) + (W.length * 5) + (O.length * 8) + (T.length * -8);
    const scoreClamped = Math.max(-100, Math.min(100, score));

    const summary = {
      he: scoreClamped > 20
        ? 'מצב תחרותי חיובי — להמשיך בלחץ מכירתי ישיר.'
        : scoreClamped < -20
          ? 'מצב תחרותי קשה — נדרשת דיפרנציאציה או נישה חדשה.'
          : 'מצב תחרותי מאוזן — לבחור מגרשים סלקטיביים.',
      en: scoreClamped > 20
        ? 'Favorable competitive posture — press direct sales pressure.'
        : scoreClamped < -20
          ? 'Tough competitive posture — differentiate or pick a new niche.'
          : 'Balanced competitive posture — choose battles selectively.',
    };

    return {
      competitorId: rec.id,
      name: rec.name,
      generatedAt: this._clock(),
      score: scoreClamped,
      summary,
      raw: {
        strengths:     deepClone(S),
        weaknesses:    deepClone(W),
        opportunities: deepClone(O),
        threats:       deepClone(T),
        categoryCounts,
        winStats: wr,
      },
      he: {
        dir: 'rtl',
        lang: 'he',
        title: `${BILINGUAL_LABELS.swot.he}: ${rec.name}`,
        strengths:     S.map((x) => x.he),
        weaknesses:    W.map((x) => x.he),
        opportunities: O.map((x) => x.he),
        threats:       T.map((x) => x.he),
        summary: summary.he,
      },
      en: {
        dir: 'ltr',
        lang: 'en',
        title: `${BILINGUAL_LABELS.swot.en}: ${rec.name}`,
        strengths:     S.map((x) => x.en),
        weaknesses:    W.map((x) => x.en),
        opportunities: O.map((x) => x.en),
        threats:       T.map((x) => x.en),
        summary: summary.en,
      },
    };
  }

  // -- diagnostics / audit access --------------------------------------------

  getAuditLog()   { return this._auditLog.map(deepClone); }
  getStats() {
    return {
      competitorCount: this._competitors.size,
      encounterCount:  this._encounters.length,
      intelEntryCount: Array.from(this._intel.values())
        .reduce((n, arr) => n + arr.length, 0),
      auditLogSize:    this._auditLog.length,
    };
  }
}

// ---------- Exports ---------------------------------------------------------

CompetitorTracker.OUTCOMES         = OUTCOMES;
CompetitorTracker.INTEL_CATEGORIES = INTEL_CATEGORIES;
CompetitorTracker.SIZE_LABELS      = SIZE_LABELS;
CompetitorTracker.BILINGUAL_LABELS = BILINGUAL_LABELS;

module.exports = {
  CompetitorTracker,
  OUTCOMES,
  INTEL_CATEGORIES,
  SIZE_LABELS,
  BILINGUAL_LABELS,
};
module.exports.default = CompetitorTracker;
