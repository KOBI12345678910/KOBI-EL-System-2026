/**
 * Marketing Attribution Model — מודל ייחוס שיווקי
 * Agent Y-192 — Techno-Kol Uzi mega-ERP / onyx-procurement
 * Date: 2026-04-11
 *
 * Zero-dependency, pure-JavaScript, fully deterministic marketing attribution
 * engine. Given one or more customer journeys (ordered arrays of touchpoints
 * leading to a conversion), it computes credit-per-channel and revenue
 * attribution under six industry-standard models:
 *
 *   1. First-Touch   — כל הקרדיט לנקודת המגע הראשונה
 *   2. Last-Touch    — כל הקרדיט לנקודת המגע האחרונה
 *   3. Linear        — חלוקה שווה בין כל נקודות המגע
 *   4. Time-Decay    — דעיכה אקספוננציאלית לטובת נקודות מגע קרובות להמרה
 *   5. Position      — U-Shaped: 40% ראשונה, 40% אחרונה, 20% אמצע
 *   6. Markov        — שרשרת מרקוב עם removal-effect
 *
 * ─── Design principles ─────────────────────────────────────────────────────
 *   * Node built-ins only — no npm dependencies, safe to bundle anywhere.
 *   * Pure deterministic math — no Math.random, no Date.now, no I/O.
 *   * Read-only inputs — "לעולם לא מוחקים" — the engine never mutates the
 *     journey arrays handed to it.
 *   * Bilingual output — every channel carries both an English key and a
 *     Hebrew label; reports are rendered in two languages.
 *   * Numerical stability — credits are normalised so every model yields
 *     exactly 1.0 of credit per journey (within a tiny epsilon).
 *
 * ─── Touchpoint schema ─────────────────────────────────────────────────────
 *   {
 *     channel:    'google_ads' | 'facebook' | 'email' | 'organic' | ...
 *     timestamp:  ISO-8601 string OR milliseconds
 *     cost?:      number      (optional — used by ROI helpers)
 *     meta?:      object      (free-form; never inspected by the engine)
 *   }
 *
 * ─── Journey schema ────────────────────────────────────────────────────────
 *   {
 *     id:          string
 *     touchpoints: Touchpoint[]      // chronological order, length >= 0
 *     converted:   boolean           // true if the journey ended in a sale
 *     revenue:     number            // monetary value of the conversion
 *   }
 *
 * ─── Public API ────────────────────────────────────────────────────────────
 *   new AttributionModel(options?)
 *     .firstTouch(journey)
 *     .lastTouch(journey)
 *     .linear(journey)
 *     .timeDecay(journey, { halfLifeDays? })
 *     .positionBased(journey, { firstWeight?, lastWeight? })
 *     .markov(journeys, { order? })
 *     .attributeRevenue(journey, modelName)
 *     .compareModels(journey)
 *     .compareModelsAcrossJourneys(journeys)
 *     .generateReport(journeys, { locale? })
 *
 * ─── Rule: never delete ────────────────────────────────────────────────────
 * This module exposes analytic functions only. It does not write, update,
 * or delete any persistent record. Callers decide what to do with credit.
 */

'use strict';

// ─── constants ────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Epsilon used when comparing floating-point credit sums. */
const CREDIT_EPSILON = 1e-9;

/**
 * Catalogue of the channels that Techno-Kol Uzi tracks by default.
 * Callers may pass unknown channels — the engine will still work, falling
 * back to the channel key as its own Hebrew label.
 */
const CHANNEL_LABELS = Object.freeze({
  google_ads:       { en: 'Google Ads',          he: 'מודעות גוגל' },
  facebook:         { en: 'Facebook',             he: 'פייסבוק' },
  instagram:        { en: 'Instagram',            he: 'אינסטגרם' },
  linkedin:         { en: 'LinkedIn',             he: 'לינקדאין' },
  tiktok:           { en: 'TikTok',               he: 'טיקטוק' },
  email:            { en: 'Email Campaign',       he: 'קמפיין דוא"ל' },
  newsletter:       { en: 'Newsletter',           he: 'ניוזלטר' },
  organic:          { en: 'Organic Search',       he: 'חיפוש אורגני' },
  direct:           { en: 'Direct',               he: 'ישיר' },
  referral:         { en: 'Referral',             he: 'הפניה' },
  affiliate:        { en: 'Affiliate',            he: 'שותפים' },
  display:          { en: 'Display Ads',          he: 'באנרים' },
  youtube:          { en: 'YouTube',              he: 'יוטיוב' },
  whatsapp:         { en: 'WhatsApp',             he: 'ווטסאפ' },
  sms:              { en: 'SMS',                  he: 'הודעת טקסט' },
  print:            { en: 'Print Media',          he: 'עיתונות' },
  radio:            { en: 'Radio',                he: 'רדיו' },
  tv:               { en: 'Television',           he: 'טלוויזיה' },
  billboard:        { en: 'Billboard',            he: 'שלט חוצות' },
  trade_show:       { en: 'Trade Show',           he: 'תערוכה' },
  webinar:          { en: 'Webinar',              he: 'וובינר' },
  podcast:          { en: 'Podcast',              he: 'פודקאסט' },
});

/** Names accepted by `attributeRevenue` and related helpers. */
const MODEL_NAMES = Object.freeze([
  'first_touch',
  'last_touch',
  'linear',
  'time_decay',
  'position',
  'markov',
]);

/** Hebrew display labels for each model — used by `generateReport`. */
const MODEL_LABELS = Object.freeze({
  first_touch:  { en: 'First Touch',         he: 'מגע ראשון' },
  last_touch:   { en: 'Last Touch',          he: 'מגע אחרון' },
  linear:       { en: 'Linear',              he: 'ליניארי' },
  time_decay:   { en: 'Time Decay',          he: 'דעיכת זמן' },
  position:     { en: 'Position (U-Shaped)', he: 'מבוסס-מיקום (צורת U)' },
  markov:       { en: 'Markov Chain',        he: 'שרשרת מרקוב' },
});

// ─── small helpers ────────────────────────────────────────────────────────

function isFiniteNumber(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

function isNonNegative(x) {
  return isFiniteNumber(x) && x >= 0;
}

function toMillis(t) {
  if (t === null || t === undefined) return null;
  if (typeof t === 'number') return Number.isFinite(t) ? t : null;
  if (t instanceof Date) return t.getTime();
  if (typeof t === 'string') {
    const v = Date.parse(t);
    return Number.isNaN(v) ? null : v;
  }
  return null;
}

function assertJourney(journey, fnName) {
  if (!journey || typeof journey !== 'object') {
    throw new TypeError(`${fnName}: journey must be an object`);
  }
  if (!Array.isArray(journey.touchpoints)) {
    throw new TypeError(`${fnName}: journey.touchpoints must be an array`);
  }
}

function cloneTouchpoint(tp) {
  return {
    channel: String(tp.channel || 'unknown'),
    timestamp: tp.timestamp === undefined ? null : tp.timestamp,
    cost: isNonNegative(tp.cost) ? tp.cost : 0,
    meta: tp.meta && typeof tp.meta === 'object' ? { ...tp.meta } : {},
  };
}

function sanitiseTouchpoints(touchpoints) {
  const out = [];
  for (let i = 0; i < touchpoints.length; i++) {
    const raw = touchpoints[i];
    if (!raw || typeof raw !== 'object') continue;
    const tp = cloneTouchpoint(raw);
    out.push(tp);
  }
  return out;
}

function emptyCredits() {
  return Object.create(null);
}

function addCredit(bag, channel, amount) {
  if (!isFiniteNumber(amount) || amount === 0) return;
  bag[channel] = (bag[channel] || 0) + amount;
}

function sumCredits(bag) {
  let s = 0;
  for (const k of Object.keys(bag)) s += bag[k];
  return s;
}

function normaliseCredits(bag) {
  const total = sumCredits(bag);
  if (total <= 0) return bag;
  const out = emptyCredits();
  for (const k of Object.keys(bag)) out[k] = bag[k] / total;
  return out;
}

function roundTo(x, decimals) {
  const f = Math.pow(10, decimals);
  return Math.round(x * f) / f;
}

function channelLabel(channel) {
  return CHANNEL_LABELS[channel] || { en: channel, he: channel };
}

// ─── Attribution Model class ──────────────────────────────────────────────

class AttributionModel {
  /**
   * @param {object} [options]
   * @param {number} [options.halfLifeDays=7]      default time-decay half-life
   * @param {number} [options.positionFirst=0.40]  credit to first touch (U)
   * @param {number} [options.positionLast=0.40]   credit to last touch (U)
   * @param {number} [options.markovOrder=1]       only order 1 supported
   */
  constructor(options) {
    const o = options || {};
    this.halfLifeDays = isNonNegative(o.halfLifeDays) ? o.halfLifeDays : 7;
    this.positionFirst = isNonNegative(o.positionFirst) ? o.positionFirst : 0.40;
    this.positionLast  = isNonNegative(o.positionLast)  ? o.positionLast  : 0.40;
    if (this.positionFirst + this.positionLast > 1) {
      this.positionFirst = 0.40;
      this.positionLast = 0.40;
    }
    this.markovOrder = o.markovOrder === 2 ? 2 : 1; // stub for future higher-order
  }

  // ─── 1. First-Touch — מגע ראשון ────────────────────────────────────────

  /**
   * 100% of credit to the first touchpoint.
   * @param {object} journey
   * @returns {object} credit map { channel: 0..1 }
   */
  firstTouch(journey) {
    assertJourney(journey, 'firstTouch');
    const tps = sanitiseTouchpoints(journey.touchpoints);
    const credits = emptyCredits();
    if (tps.length === 0) return credits;
    addCredit(credits, tps[0].channel, 1);
    return credits;
  }

  // ─── 2. Last-Touch — מגע אחרון ────────────────────────────────────────

  /**
   * 100% of credit to the last touchpoint.
   * @param {object} journey
   * @returns {object} credit map { channel: 0..1 }
   */
  lastTouch(journey) {
    assertJourney(journey, 'lastTouch');
    const tps = sanitiseTouchpoints(journey.touchpoints);
    const credits = emptyCredits();
    if (tps.length === 0) return credits;
    addCredit(credits, tps[tps.length - 1].channel, 1);
    return credits;
  }

  // ─── 3. Linear — ליניארי ──────────────────────────────────────────────

  /**
   * Split credit evenly across all touchpoints. Duplicate channels stack.
   * @param {object} journey
   * @returns {object} credit map { channel: 0..1 }
   */
  linear(journey) {
    assertJourney(journey, 'linear');
    const tps = sanitiseTouchpoints(journey.touchpoints);
    const credits = emptyCredits();
    if (tps.length === 0) return credits;
    const each = 1 / tps.length;
    for (const tp of tps) addCredit(credits, tp.channel, each);
    return credits;
  }

  // ─── 4. Time-Decay — דעיכת זמן ───────────────────────────────────────

  /**
   * Exponential half-life decay: credit_i ∝ 2^(-Δdays / halfLife) where
   * Δdays is the distance in days between touchpoint i and the conversion
   * (i.e., the last touchpoint). Touchpoints with missing timestamps
   * contribute using their ordinal position (older = smaller weight).
   *
   * @param {object} journey
   * @param {object} [opts]
   * @param {number} [opts.halfLifeDays]
   * @returns {object} credit map { channel: 0..1 }
   */
  timeDecay(journey, opts) {
    assertJourney(journey, 'timeDecay');
    const halfLife = opts && isNonNegative(opts.halfLifeDays)
      ? opts.halfLifeDays
      : this.halfLifeDays;
    const tps = sanitiseTouchpoints(journey.touchpoints);
    const credits = emptyCredits();
    if (tps.length === 0) return credits;
    if (tps.length === 1) {
      addCredit(credits, tps[0].channel, 1);
      return credits;
    }

    // Anchor = last touchpoint's timestamp (conversion time).
    const last = tps[tps.length - 1];
    const anchor = toMillis(last.timestamp);
    const weights = new Array(tps.length);
    let totalWeight = 0;

    for (let i = 0; i < tps.length; i++) {
      let deltaDays;
      const t = toMillis(tps[i].timestamp);
      if (anchor !== null && t !== null) {
        deltaDays = Math.max(0, (anchor - t) / MS_PER_DAY);
      } else {
        // Fallback: ordinal distance from the last touchpoint.
        deltaDays = (tps.length - 1 - i);
      }
      // 2^(-delta / halfLife)
      const w = halfLife > 0
        ? Math.pow(2, -deltaDays / halfLife)
        : (i === tps.length - 1 ? 1 : 0);
      weights[i] = w;
      totalWeight += w;
    }

    if (totalWeight <= 0) {
      // Degenerate — fall back to last-touch.
      addCredit(credits, last.channel, 1);
      return credits;
    }

    for (let i = 0; i < tps.length; i++) {
      addCredit(credits, tps[i].channel, weights[i] / totalWeight);
    }
    return credits;
  }

  // ─── 5. Position — U-Shaped ──────────────────────────────────────────

  /**
   * Position-based (U-shaped): first touch gets `positionFirst`, last touch
   * gets `positionLast`, the remaining credit is split evenly across the
   * middle touchpoints.
   *
   *   * 1 touch   → 100% to that touch
   *   * 2 touches → positionFirst to first, positionLast to last (re-normalised
   *                 if they don't sum to 1)
   *   * 3+ touches→ positionFirst, (1 - first - last)/middle each, positionLast
   *
   * @param {object} journey
   * @param {object} [opts]
   * @param {number} [opts.firstWeight]
   * @param {number} [opts.lastWeight]
   * @returns {object} credit map
   */
  positionBased(journey, opts) {
    assertJourney(journey, 'positionBased');
    const firstW = opts && isNonNegative(opts.firstWeight)
      ? opts.firstWeight
      : this.positionFirst;
    const lastW = opts && isNonNegative(opts.lastWeight)
      ? opts.lastWeight
      : this.positionLast;
    const tps = sanitiseTouchpoints(journey.touchpoints);
    const credits = emptyCredits();
    const n = tps.length;
    if (n === 0) return credits;
    if (n === 1) {
      addCredit(credits, tps[0].channel, 1);
      return credits;
    }
    if (n === 2) {
      const sum = firstW + lastW;
      if (sum <= 0) {
        addCredit(credits, tps[0].channel, 0.5);
        addCredit(credits, tps[1].channel, 0.5);
      } else {
        addCredit(credits, tps[0].channel, firstW / sum);
        addCredit(credits, tps[1].channel, lastW / sum);
      }
      return credits;
    }
    const firstTotal = firstW;
    const lastTotal  = lastW;
    let middleTotal = 1 - firstTotal - lastTotal;
    if (middleTotal < 0) middleTotal = 0;
    const middleCount = n - 2;
    const perMiddle = middleCount > 0 ? middleTotal / middleCount : 0;

    addCredit(credits, tps[0].channel, firstTotal);
    for (let i = 1; i < n - 1; i++) addCredit(credits, tps[i].channel, perMiddle);
    addCredit(credits, tps[n - 1].channel, lastTotal);

    // Safety normalise in case custom weights overflow.
    const total = sumCredits(credits);
    if (Math.abs(total - 1) > CREDIT_EPSILON && total > 0) {
      return normaliseCredits(credits);
    }
    return credits;
  }

  // ─── 6. Markov Chain with removal effect ────────────────────────────

  /**
   * First-order Markov chain removal-effect attribution.
   *
   *   1. Build a transition matrix from `start` → channels → ... → channels →
   *      { `converted`, `null` } using all supplied journeys.
   *   2. Compute baseline conversion probability P(conv).
   *   3. For each channel c, remove it from the graph (redirect its outgoing
   *      mass to `null`) and compute P_{-c}(conv).
   *   4. removal_effect(c) = 1 - P_{-c}(conv) / P(conv).
   *   5. Credit per channel = removal_effect(c) / Σ removal_effect.
   *
   * Converted and non-converted journeys are both respected — non-converted
   * sequences sink into a `null` absorbing state. A converted sequence sinks
   * into a `converted` absorbing state.
   *
   * @param {Array<object>} journeys
   * @returns {object} credit map normalised to Σ = 1 across all channels
   */
  markov(journeys) {
    if (!Array.isArray(journeys)) {
      throw new TypeError('markov: journeys must be an array');
    }
    const START = '__start__';
    const CONVERTED = '__converted__';
    const NULL_STATE = '__null__';

    const states = new Set();
    states.add(START);
    states.add(CONVERTED);
    states.add(NULL_STATE);

    // transitions[from][to] = count
    const transitions = Object.create(null);
    function bump(from, to) {
      if (!transitions[from]) transitions[from] = Object.create(null);
      transitions[from][to] = (transitions[from][to] || 0) + 1;
    }

    for (const j of journeys) {
      if (!j || !Array.isArray(j.touchpoints)) continue;
      const tps = sanitiseTouchpoints(j.touchpoints);
      if (tps.length === 0) continue;
      const sink = j.converted === true ? CONVERTED : NULL_STATE;
      bump(START, tps[0].channel);
      states.add(tps[0].channel);
      for (let i = 0; i < tps.length - 1; i++) {
        bump(tps[i].channel, tps[i + 1].channel);
        states.add(tps[i + 1].channel);
      }
      bump(tps[tps.length - 1].channel, sink);
    }

    // Convert counts → probabilities.
    const probs = Object.create(null);
    for (const from of Object.keys(transitions)) {
      let total = 0;
      for (const to of Object.keys(transitions[from])) total += transitions[from][to];
      probs[from] = Object.create(null);
      if (total === 0) continue;
      for (const to of Object.keys(transitions[from])) {
        probs[from][to] = transitions[from][to] / total;
      }
    }

    // Baseline conversion probability: iteratively propagate mass from START
    // until it settles in absorbing states.
    const baseline = computeAbsorption(probs, START, CONVERTED, NULL_STATE);

    const channelList = [];
    for (const s of states) {
      if (s === START || s === CONVERTED || s === NULL_STATE) continue;
      channelList.push(s);
    }

    const removalEffects = Object.create(null);
    for (const c of channelList) {
      // Clone probs with channel c removed (all outgoing mass → NULL).
      const stripped = cloneProbs(probs);
      if (stripped[c]) {
        stripped[c] = Object.create(null);
        stripped[c][NULL_STATE] = 1;
      }
      // Also redirect any transitions that LAND on c to NULL.
      for (const from of Object.keys(stripped)) {
        if (stripped[from][c] !== undefined) {
          const lost = stripped[from][c];
          delete stripped[from][c];
          stripped[from][NULL_STATE] = (stripped[from][NULL_STATE] || 0) + lost;
        }
      }
      const p = computeAbsorption(stripped, START, CONVERTED, NULL_STATE);
      if (baseline <= 0) {
        removalEffects[c] = 0;
      } else {
        removalEffects[c] = Math.max(0, 1 - (p / baseline));
      }
    }

    // Normalise removal effects to a credit distribution.
    const credits = emptyCredits();
    let totalEffect = 0;
    for (const c of channelList) totalEffect += removalEffects[c];
    if (totalEffect <= 0) {
      // Degenerate — fall back to uniform split across observed channels.
      const n = channelList.length;
      if (n > 0) {
        const each = 1 / n;
        for (const c of channelList) addCredit(credits, c, each);
      }
      return credits;
    }
    for (const c of channelList) {
      addCredit(credits, c, removalEffects[c] / totalEffect);
    }
    return credits;
  }

  // ─── Revenue attribution ────────────────────────────────────────────

  /**
   * Multiply a credit distribution by journey.revenue.
   * For `markov`, the model must be run across many journeys first; to keep
   * the single-journey helper useful, we fall back to the linear model when
   * markov credits would otherwise be undefined for a single journey.
   *
   * @param {object} journey
   * @param {string} modelName
   * @returns {object} map { channel: dollar amount attributed }
   */
  attributeRevenue(journey, modelName) {
    assertJourney(journey, 'attributeRevenue');
    const revenue = isNonNegative(journey.revenue) ? journey.revenue : 0;
    const credits = this._creditsFor(journey, modelName);
    const out = emptyCredits();
    for (const k of Object.keys(credits)) {
      out[k] = credits[k] * revenue;
    }
    return out;
  }

  _creditsFor(journey, modelName) {
    switch (modelName) {
      case 'first_touch':  return this.firstTouch(journey);
      case 'last_touch':   return this.lastTouch(journey);
      case 'linear':       return this.linear(journey);
      case 'time_decay':   return this.timeDecay(journey);
      case 'position':     return this.positionBased(journey);
      case 'markov':       return this.markov([journey]);
      default:
        throw new Error(`attributeRevenue: unknown model "${modelName}"`);
    }
  }

  // ─── Comparison helpers ─────────────────────────────────────────────

  /**
   * Run every model against a single journey and return a dictionary of
   * credits keyed by model name.
   *
   *   { first_touch: {...}, last_touch: {...}, linear: {...},
   *     time_decay: {...}, position: {...}, markov: {...} }
   */
  compareModels(journey) {
    assertJourney(journey, 'compareModels');
    return {
      first_touch: this.firstTouch(journey),
      last_touch:  this.lastTouch(journey),
      linear:      this.linear(journey),
      time_decay:  this.timeDecay(journey),
      position:    this.positionBased(journey),
      markov:      this.markov([journey]),
    };
  }

  /**
   * Aggregate every model across an entire set of journeys, returning a
   * nested map { modelName: { channel: total_revenue_attributed } }.
   * Converted journeys only contribute revenue.
   */
  compareModelsAcrossJourneys(journeys) {
    if (!Array.isArray(journeys)) {
      throw new TypeError('compareModelsAcrossJourneys: journeys must be an array');
    }
    const result = Object.create(null);
    for (const m of MODEL_NAMES) result[m] = emptyCredits();

    // Aggregate per-journey for every model except markov (which is a joint
    // model across the whole corpus — credit comes from removal effects).
    for (const j of journeys) {
      if (!j || !Array.isArray(j.touchpoints)) continue;
      if (j.converted !== true) continue;
      const revenue = isNonNegative(j.revenue) ? j.revenue : 0;
      for (const m of ['first_touch', 'last_touch', 'linear', 'time_decay', 'position']) {
        const c = this._creditsFor(j, m);
        for (const ch of Object.keys(c)) addCredit(result[m], ch, c[ch] * revenue);
      }
    }

    // Markov: compute joint removal-effect distribution, then scale by the
    // total revenue of converted journeys.
    const markovDist = this.markov(journeys);
    let totalRevenue = 0;
    for (const j of journeys) {
      if (j && j.converted === true && isNonNegative(j.revenue)) totalRevenue += j.revenue;
    }
    for (const ch of Object.keys(markovDist)) {
      addCredit(result.markov, ch, markovDist[ch] * totalRevenue);
    }

    return result;
  }

  // ─── Report generation ──────────────────────────────────────────────

  /**
   * Render a bilingual plain-text report summarising every model against
   * the supplied journeys.
   *
   * @param {Array<object>} journeys
   * @param {object} [opts]
   * @param {'he'|'en'|'both'} [opts.locale='both']
   * @returns {string}
   */
  generateReport(journeys, opts) {
    if (!Array.isArray(journeys)) {
      throw new TypeError('generateReport: journeys must be an array');
    }
    const locale = (opts && opts.locale) || 'both';
    const comparison = this.compareModelsAcrossJourneys(journeys);
    const allChannels = new Set();
    for (const m of MODEL_NAMES) {
      for (const ch of Object.keys(comparison[m])) allChannels.add(ch);
    }
    const channels = Array.from(allChannels).sort();

    const lines = [];
    const hdr = locale === 'en'
      ? 'Marketing Attribution Report'
      : locale === 'he'
        ? 'דו"ח ייחוס שיווקי'
        : 'Marketing Attribution Report — דו"ח ייחוס שיווקי';
    lines.push('═'.repeat(70));
    lines.push(hdr);
    lines.push('Agent Y-192 — Techno-Kol Uzi mega-ERP');
    lines.push('═'.repeat(70));
    lines.push('');

    // Totals
    let totalJourneys = 0;
    let convertedJourneys = 0;
    let totalRevenue = 0;
    for (const j of journeys) {
      if (!j) continue;
      totalJourneys++;
      if (j.converted === true) {
        convertedJourneys++;
        if (isNonNegative(j.revenue)) totalRevenue += j.revenue;
      }
    }
    const convRate = totalJourneys > 0 ? (convertedJourneys / totalJourneys) : 0;
    if (locale !== 'en') {
      lines.push(`סה"כ מסעות לקוח: ${totalJourneys}`);
      lines.push(`מסעות שהומרו לעסקה: ${convertedJourneys}`);
      lines.push(`שיעור המרה: ${(convRate * 100).toFixed(2)}%`);
      lines.push(`הכנסה כוללת: ₪${totalRevenue.toFixed(2)}`);
      lines.push('');
    }
    if (locale !== 'he') {
      lines.push(`Total journeys: ${totalJourneys}`);
      lines.push(`Converted journeys: ${convertedJourneys}`);
      lines.push(`Conversion rate: ${(convRate * 100).toFixed(2)}%`);
      lines.push(`Total revenue: $${totalRevenue.toFixed(2)}`);
      lines.push('');
    }

    // Per-model blocks
    for (const m of MODEL_NAMES) {
      lines.push('─'.repeat(70));
      const ml = MODEL_LABELS[m];
      if (locale === 'en') lines.push(`${ml.en}`);
      else if (locale === 'he') lines.push(`${ml.he}`);
      else lines.push(`${ml.en} — ${ml.he}`);
      lines.push('─'.repeat(70));
      const rows = [];
      let modelTotal = 0;
      for (const ch of channels) {
        const amt = comparison[m][ch] || 0;
        if (amt > 0) {
          rows.push({ channel: ch, amount: amt });
          modelTotal += amt;
        }
      }
      rows.sort((a, b) => b.amount - a.amount);
      if (rows.length === 0) {
        lines.push(locale === 'he' ? '  (אין נתונים)' : '  (no data)');
      } else {
        for (const r of rows) {
          const lbl = channelLabel(r.channel);
          const pct = modelTotal > 0 ? (r.amount / modelTotal) * 100 : 0;
          if (locale === 'en') {
            lines.push(`  ${padRight(lbl.en, 22)} $${pad(r.amount.toFixed(2), 12)}  (${pct.toFixed(1)}%)`);
          } else if (locale === 'he') {
            lines.push(`  ${padRight(lbl.he, 22)} ₪${pad(r.amount.toFixed(2), 12)}  (${pct.toFixed(1)}%)`);
          } else {
            lines.push(`  ${padRight(lbl.en, 18)} / ${padRight(lbl.he, 18)} ₪${pad(r.amount.toFixed(2), 12)}  (${pct.toFixed(1)}%)`);
          }
        }
      }
      lines.push('');
    }

    lines.push('═'.repeat(70));
    if (locale !== 'en') lines.push('סוף הדו"ח');
    if (locale !== 'he') lines.push('End of report');
    lines.push('═'.repeat(70));
    return lines.join('\n');
  }
}

// ─── helpers used by markov() ─────────────────────────────────────────

function cloneProbs(probs) {
  const out = Object.create(null);
  for (const from of Object.keys(probs)) {
    out[from] = Object.create(null);
    for (const to of Object.keys(probs[from])) {
      out[from][to] = probs[from][to];
    }
  }
  return out;
}

/**
 * Compute absorption probability from `start` to `converted` in a Markov
 * chain with two absorbing states (`converted` and `nullState`). Uses a
 * bounded power-iteration — deterministic, no matrix inversion, purely
 * Node-built-in.
 *
 * @param {object} probs     transition probabilities
 * @param {string} start
 * @param {string} converted
 * @param {string} nullState
 * @returns {number}
 */
function computeAbsorption(probs, start, converted, nullState) {
  // Current mass distribution.
  const state = Object.create(null);
  state[start] = 1;
  let absorbedConverted = 0;
  let absorbedNull = 0;
  const MAX_ITERS = 200;
  for (let iter = 0; iter < MAX_ITERS; iter++) {
    const next = Object.create(null);
    let transitioned = 0;
    for (const from of Object.keys(state)) {
      const mass = state[from];
      if (mass <= 0) continue;
      if (from === converted) { absorbedConverted += mass; continue; }
      if (from === nullState) { absorbedNull      += mass; continue; }
      const row = probs[from];
      if (!row) {
        absorbedNull += mass;
        continue;
      }
      for (const to of Object.keys(row)) {
        const p = row[to];
        const add = mass * p;
        if (to === converted) { absorbedConverted += add; continue; }
        if (to === nullState) { absorbedNull      += add; continue; }
        next[to] = (next[to] || 0) + add;
        transitioned += add;
      }
    }
    if (transitioned < 1e-12) break;
    // Replace state with next (only non-absorbed mass remains).
    for (const k of Object.keys(state)) delete state[k];
    for (const k of Object.keys(next)) state[k] = next[k];
  }
  return absorbedConverted;
}

// ─── string padding helpers (used by generateReport) ───────────────────

function padRight(s, width) {
  s = String(s);
  if (s.length >= width) return s;
  return s + ' '.repeat(width - s.length);
}

function pad(s, width) {
  s = String(s);
  if (s.length >= width) return s;
  return ' '.repeat(width - s.length) + s;
}

// ─── exports ─────────────────────────────────────────────────────────────

module.exports = {
  AttributionModel,
  CHANNEL_LABELS,
  MODEL_NAMES,
  MODEL_LABELS,
  // internals — exposed for tests only
  __internal__: {
    computeAbsorption,
    cloneProbs,
    sanitiseTouchpoints,
    normaliseCredits,
    sumCredits,
    channelLabel,
    CREDIT_EPSILON,
  },
};
