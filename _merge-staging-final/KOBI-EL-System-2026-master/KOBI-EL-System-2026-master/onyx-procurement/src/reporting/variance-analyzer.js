/**
 * Variance Analyzer — Classic Managerial Accounting Decomposition
 * Agent Y-185 — Kobi's mega-ERP for Techno-Kol Uzi.
 *
 * Zero dependencies. Pure JavaScript math. Node built-ins only.
 * No HTTP, no I/O, no randomness — fully deterministic. Runs on Node 16+,
 * Electron, or inside a browser bundle. Every function is pure and never
 * mutates its inputs.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * WHAT THIS MODULE DOES
 * ═════════════════════════════════════════════════════════════════════════
 *
 * Given a pair of "actual" and "budget" (or "standard") figures, it
 * decomposes the total variance into the classical four-layer cake that
 * every managerial-accounting textbook teaches:
 *
 *    1.  Sales / Revenue variance
 *          price variance    = (priceA  − priceB)  × unitsA
 *          volume variance   = (unitsA  − unitsB)  × priceB
 *
 *    2.  Sales mix variance (multi-product version of volume variance)
 *          quantity variance = (totalUnitsA − totalUnitsB) × budgetAvgPrice
 *          mix variance      = Σ (actualMix − budgetMix) × unitsA × priceB
 *
 *    3.  Direct labor variance
 *          rate variance        = (rateA  − rateB)  × hoursA
 *          efficiency variance  = (hoursA − hoursB) × rateB
 *
 *    4.  Direct material variance
 *          material price var   = (costA  − costB)  × qtyA
 *          material usage var   = (qtyA   − qtyB)   × costB
 *
 * Each component is returned with:
 *   - amount                — signed number (positive = over-budget cost /
 *                                           under-budget revenue)
 *   - favorable             — boolean, true if the sign helps the P&L
 *   - flag                  — 'F' (Favorable) | 'U' (Unfavorable) | '—'
 *   - explanation_he        — Hebrew narrative of what drove the variance
 *   - explanation_en        — English narrative of the same
 *   - label_he / label_en   — short bilingual component names
 *
 * ═════════════════════════════════════════════════════════════════════════
 * SIGN CONVENTIONS  (very important — read this before touching the math)
 * ═════════════════════════════════════════════════════════════════════════
 *
 * Managerial accounting uses two incompatible sign rules — one for revenue
 * items, one for cost items — and students mix them up all the time. We
 * pick the one convention every component is written against and stick
 * with it religiously:
 *
 *     amount = actual − budget
 *
 * That is: a POSITIVE number means the actual figure came in HIGHER than
 * budget. Whether that is favorable or unfavorable then depends on what
 * KIND of figure we are measuring:
 *
 *     Revenue / price / volume / mix (a "good" KPI, bigger is better)
 *         favorable   when amount > 0
 *         unfavorable when amount < 0
 *
 *     Cost / rate / efficiency / usage / material (a "bad" KPI, smaller is better)
 *         favorable   when amount < 0
 *         unfavorable when amount > 0
 *
 * The flavor is carried by each component object so callers can render
 * the right colour without having to re-derive the rule.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * PUBLIC API
 * ═════════════════════════════════════════════════════════════════════════
 *
 *   const analyzer = new VarianceAnalyzer();
 *
 *   analyzer.decompose(actual, budget, inputs)
 *       → { total, components: {...}, bilingualReport: {...} }
 *
 *   analyzer.priceVariance({ unitsA, priceA, priceB })
 *       → component object (revenue flavor)
 *
 *   analyzer.volumeVariance({ unitsA, unitsB, priceB })
 *       → component object (revenue flavor)
 *
 *   analyzer.mixVariance({ lines })
 *       → component object (revenue flavor)
 *       // lines = [{ sku, unitsA, unitsB, priceB }, ...]
 *
 *   analyzer.laborRateVariance({ hoursA, rateA, rateB })
 *       → component object (cost flavor)
 *
 *   analyzer.laborEfficiencyVariance({ hoursA, hoursB, rateB })
 *       → component object (cost flavor)
 *
 *   analyzer.materialPriceVariance({ qtyA, costA, costB })
 *       → component object (cost flavor)
 *
 *   analyzer.materialUsageVariance({ qtyA, qtyB, costB })
 *       → component object (cost flavor)
 *
 *   analyzer.flag(component)
 *       → 'F' | 'U' | '—'
 *
 *   analyzer.buildReport(decomposition, opts?)
 *       → bilingual { he, en, lines } text report
 *
 * ═════════════════════════════════════════════════════════════════════════
 * HEBREW LABELS
 * ═════════════════════════════════════════════════════════════════════════
 *
 *   סטייה מתוכנית       — total variance vs. plan
 *   סטיית מחיר           — price variance
 *   סטיית כמות           — volume / quantity variance
 *   סטיית תמהיל          — mix variance
 *   סטיית תעריף          — labor rate variance
 *   סטיית יעילות         — labor efficiency variance
 *   סטיית מחיר חומרים    — material price variance
 *   סטיית שימוש חומרים   — material usage variance
 *   חיובי / שלילי        — favorable / unfavorable
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// 0. CONSTANTS, LABELS
// ═══════════════════════════════════════════════════════════════════════════

const EPS = 1e-12;

/**
 * Bilingual short labels for every component key. Any new component must
 * add an entry here AND in COMPONENT_FLAVORS below.
 */
const LABELS = Object.freeze({
  total: {
    he: 'סטייה מתוכנית',
    en: 'Total variance vs. plan',
  },
  price: {
    he: 'סטיית מחיר',
    en: 'Price variance',
  },
  volume: {
    he: 'סטיית כמות',
    en: 'Volume variance',
  },
  mix: {
    he: 'סטיית תמהיל',
    en: 'Mix variance',
  },
  quantity: {
    he: 'סטיית כמות כוללת',
    en: 'Quantity variance',
  },
  labor_rate: {
    he: 'סטיית תעריף עבודה',
    en: 'Labor rate variance',
  },
  labor_efficiency: {
    he: 'סטיית יעילות עבודה',
    en: 'Labor efficiency variance',
  },
  material_price: {
    he: 'סטיית מחיר חומרים',
    en: 'Material price variance',
  },
  material_usage: {
    he: 'סטיית שימוש חומרים',
    en: 'Material usage variance',
  },
});

/**
 * Which side of the P&L each component sits on.
 *   'revenue' — higher is better; positive variance is favorable.
 *   'cost'    — lower  is better; positive variance is unfavorable.
 * Used by flag() and by the favorable/unfavorable booleans on each
 * component object.
 */
const COMPONENT_FLAVORS = Object.freeze({
  price: 'revenue',
  volume: 'revenue',
  mix: 'revenue',
  quantity: 'revenue',
  labor_rate: 'cost',
  labor_efficiency: 'cost',
  material_price: 'cost',
  material_usage: 'cost',
});

const FAVORABLE_FLAG = 'F';
const UNFAVORABLE_FLAG = 'U';
const NEUTRAL_FLAG = '—';

// ═══════════════════════════════════════════════════════════════════════════
// 1. SMALL UTILITIES (validation, math helpers, formatting)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Assert x is a finite number. Throws a TypeError that names the field so
 * caller stack traces point to the exact culprit — variance math is very
 * unforgiving of stray NaN / undefined inputs.
 */
function assertFinite(x, name) {
  if (typeof x !== 'number' || !Number.isFinite(x)) {
    throw new TypeError(
      `${name} must be a finite number (got ${x === null ? 'null' : typeof x})`
    );
  }
}

function assertNonNegative(x, name) {
  assertFinite(x, name);
  if (x < 0) {
    throw new RangeError(`${name} must be >= 0 (got ${x})`);
  }
}

/**
 * Round half-away-from-zero to N decimals. Rolling our own because Math.round
 * rounds half-to-positive-infinity, which makes -0.5 round to 0 instead of -1
 * and quietly corrupts net variance totals when they are symmetric around 0.
 */
function round(x, decimals) {
  if (!Number.isFinite(x)) return x;
  const k = Math.pow(10, decimals | 0);
  return Math.sign(x) * Math.round(Math.abs(x) * k) / k;
}

/**
 * Format a signed amount for a Hebrew or English narrative line.
 * We deliberately NEVER localise the decimal separator — the output is a
 * pure ASCII number so it round-trips through CSV, JSON, Excel and all the
 * Israeli accounting apps that do not understand locale-aware formatting.
 */
function formatAmount(x) {
  if (!Number.isFinite(x)) return String(x);
  const r = round(x, 2);
  const s = r.toFixed(2);
  return s;
}

/**
 * Safe percent of a base. Returns Infinity if base is ~0, so the narrative
 * text can gracefully say "חריגה של ∞%" rather than a NaN. Not used when
 * base is negative — callers always pass |base|.
 */
function safePct(numer, base) {
  if (Math.abs(base) < EPS) return Number.POSITIVE_INFINITY;
  return (numer / base) * 100;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. CORE — COMPONENT CONSTRUCTOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a single variance component object. This is the only place where
 * the favorable / unfavorable rule is applied, so the logic is in ONE spot
 * and every caller gets the same treatment.
 *
 * @param  {string}  key       — one of the keys in LABELS / COMPONENT_FLAVORS
 * @param  {number}  amount    — signed number (actual − budget convention)
 * @param  {string}  driverHe  — short Hebrew reason clause (e.g. "מחיר עלה ב-5%")
 * @param  {string}  driverEn  — matching English reason clause
 * @return {object}
 */
function makeComponent(key, amount, driverHe, driverEn, extras) {
  assertFinite(amount, `${key}.amount`);
  const flavor = COMPONENT_FLAVORS[key];
  if (!flavor) throw new Error(`Unknown variance component: ${key}`);

  // Apply the sign convention documented at the top of the file.
  let favorable;
  if (Math.abs(amount) < EPS) {
    favorable = null; // exactly on budget — neither good nor bad
  } else if (flavor === 'revenue') {
    favorable = amount > 0;
  } else {
    // flavor === 'cost'
    favorable = amount < 0;
  }

  let flag;
  if (favorable === null) flag = NEUTRAL_FLAG;
  else if (favorable) flag = FAVORABLE_FLAG;
  else flag = UNFAVORABLE_FLAG;

  const label = LABELS[key];
  const amountR = round(amount, 2);

  // Build a one-sentence bilingual explanation. We pick the verb based on
  // flavor (revenue → "תרמה" / "גרעה", cost → "ייקרה" / "חסכה") so the text
  // reads naturally in both languages regardless of the sign.
  const flagTextHe = favorable === null
    ? 'ללא השפעה'
    : favorable
      ? 'חיובי'
      : 'שלילי';
  const flagTextEn = favorable === null
    ? 'neutral'
    : favorable
      ? 'favorable'
      : 'unfavorable';

  const explanationHe =
    `${label.he}: ${formatAmount(amountR)} (${flagTextHe}) — ${driverHe}`;
  const explanationEn =
    `${label.en}: ${formatAmount(amountR)} (${flagTextEn}) — ${driverEn}`;

  const comp = {
    key,
    label_he: label.he,
    label_en: label.en,
    amount: amountR,
    favorable,
    flag,
    flavor,
    explanation_he: explanationHe,
    explanation_en: explanationEn,
  };

  // Attach any extras (e.g. per-line mix breakdown) as non-enumerable
  // sidecar properties so JSON.stringify of the component stays compact
  // but interactive debugging / UI panels can still read the detail.
  if (extras && typeof extras === 'object') {
    for (const k of Object.keys(extras)) {
      Object.defineProperty(comp, k, {
        value: extras[k],
        enumerable: false,
        writable: false,
        configurable: false,
      });
    }
  }

  return Object.freeze(comp);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. THE CLASS
// ═══════════════════════════════════════════════════════════════════════════

class VarianceAnalyzer {
  constructor(opts = {}) {
    // Optional: caller can supply a rounding precision (decimals) used by
    // buildReport and all component amounts. Defaults to 2 (currency-cents).
    this.decimals = Number.isInteger(opts.decimals) && opts.decimals >= 0
      ? opts.decimals
      : 2;
  }

  // ───────────────────────── 3.1 Revenue / Sales ──────────────────────────

  /**
   * Price variance = (priceA − priceB) × unitsA
   *
   * Holds volume at actual and flexes price. Used on the revenue side.
   * A positive number means actual price was higher than budget — which is
   * favorable for revenue.
   */
  priceVariance({ unitsA, priceA, priceB }) {
    assertNonNegative(unitsA, 'unitsA');
    assertFinite(priceA, 'priceA');
    assertFinite(priceB, 'priceB');

    const delta = priceA - priceB;
    const amount = delta * unitsA;
    const pct = safePct(delta, Math.abs(priceB));

    const driverHe = Math.abs(delta) < EPS
      ? 'המחיר בפועל זהה לתקציב'
      : delta > 0
        ? `המחיר בפועל גבוה מהתקציב ב-${formatAmount(delta)} (${formatAmount(pct)}%)`
        : `המחיר בפועל נמוך מהתקציב ב-${formatAmount(-delta)} (${formatAmount(-pct)}%)`;
    const driverEn = Math.abs(delta) < EPS
      ? 'actual price matches budget'
      : delta > 0
        ? `actual price exceeds budget by ${formatAmount(delta)} (${formatAmount(pct)}%)`
        : `actual price below budget by ${formatAmount(-delta)} (${formatAmount(-pct)}%)`;

    return makeComponent('price', amount, driverHe, driverEn);
  }

  /**
   * Volume variance = (unitsA − unitsB) × priceB
   *
   * Holds price at budget and flexes volume. Positive = sold more units,
   * which is favorable for revenue.
   */
  volumeVariance({ unitsA, unitsB, priceB }) {
    assertNonNegative(unitsA, 'unitsA');
    assertNonNegative(unitsB, 'unitsB');
    assertFinite(priceB, 'priceB');

    const delta = unitsA - unitsB;
    const amount = delta * priceB;
    const pct = safePct(delta, Math.abs(unitsB));

    const driverHe = Math.abs(delta) < EPS
      ? 'הכמות בפועל זהה לתקציב'
      : delta > 0
        ? `נמכרו ${formatAmount(delta)} יחידות מעבר לתקציב (${formatAmount(pct)}%)`
        : `נמכרו ${formatAmount(-delta)} יחידות פחות מהתקציב (${formatAmount(-pct)}%)`;
    const driverEn = Math.abs(delta) < EPS
      ? 'actual volume matches budget'
      : delta > 0
        ? `${formatAmount(delta)} units sold above budget (${formatAmount(pct)}%)`
        : `${formatAmount(-delta)} units sold below budget (${formatAmount(-pct)}%)`;

    return makeComponent('volume', amount, driverHe, driverEn);
  }

  /**
   * Mix variance across multiple SKUs.
   *
   * Classical formula (contribution-margin version, using priceB as a
   * stand-in for unit margin — the caller can pass margin instead of price):
   *
   *   mix_i = (actualMix_i − budgetMix_i) × totalActualUnits × priceB_i
   *
   * where mix_i = share of SKU i in total units. The mix variance is the
   * portion of the total volume variance that is explained by a DIFFERENT
   * blend of products, holding total units constant. It answers the
   * question "did we sell more of the wrong thing?".
   *
   * lines = [{ sku, unitsA, unitsB, priceB }, ...]
   *
   * Returns a single summed component. Per-line contribution is available
   * on the `.lines` sidecar property (non-enumerable so it does not pollute
   * JSON output, but still reachable for debugging).
   */
  mixVariance({ lines }) {
    if (!Array.isArray(lines) || lines.length === 0) {
      throw new TypeError('lines must be a non-empty array');
    }

    let totalUnitsA = 0;
    let totalUnitsB = 0;
    for (const ln of lines) {
      assertNonNegative(ln.unitsA, `line[${ln.sku}].unitsA`);
      assertNonNegative(ln.unitsB, `line[${ln.sku}].unitsB`);
      assertFinite(ln.priceB, `line[${ln.sku}].priceB`);
      totalUnitsA += ln.unitsA;
      totalUnitsB += ln.unitsB;
    }

    if (totalUnitsA < EPS && totalUnitsB < EPS) {
      throw new RangeError('total units (actual + budget) cannot both be zero');
    }

    const perLine = [];
    let amount = 0;
    for (const ln of lines) {
      const actualMix = totalUnitsA < EPS ? 0 : ln.unitsA / totalUnitsA;
      const budgetMix = totalUnitsB < EPS ? 0 : ln.unitsB / totalUnitsB;
      const mixDelta = actualMix - budgetMix;
      // Per-line contribution: ΔMix × totalActualUnits × budgetPrice.
      // This is the textbook "sales mix variance" formula from Horngren.
      const contribution = mixDelta * totalUnitsA * ln.priceB;
      perLine.push({
        sku: ln.sku,
        actualMix: round(actualMix, 6),
        budgetMix: round(budgetMix, 6),
        mixDelta: round(mixDelta, 6),
        contribution: round(contribution, 2),
      });
      amount += contribution;
    }

    const driverHe = Math.abs(amount) < EPS
      ? 'תמהיל המוצרים זהה לתקציב'
      : amount > 0
        ? `תמהיל מוצרים טוב יותר — יותר יחידות מרווחיות נמכרו`
        : `תמהיל מוצרים חלש יותר — יותר יחידות מרווחיות נמוכות נמכרו`;
    const driverEn = Math.abs(amount) < EPS
      ? 'product mix matches budget'
      : amount > 0
        ? 'richer product mix — sold more of the high-margin SKUs'
        : 'leaner product mix — sold more of the low-margin SKUs';

    const comp = makeComponent('mix', amount, driverHe, driverEn, {
      // Attach per-line breakdown as a non-enumerable sidecar. Exposed via
      // the extras channel on makeComponent so the component itself can
      // still be frozen in ONE pass without fighting Object.defineProperty.
      lines: Object.freeze(perLine),
    });
    return comp;
  }

  /**
   * Pure quantity variance (the "no-mix" portion of a multi-line volume
   * variance). Formula:
   *
   *   quantity = (totalUnitsA − totalUnitsB) × budgetAvgPrice
   *
   * where budgetAvgPrice = Σ(unitsB × priceB) / Σ(unitsB). Use this when
   * the caller wants the TWO pieces (quantity + mix) rather than one lump
   * volume variance.
   */
  quantityVariance({ lines }) {
    if (!Array.isArray(lines) || lines.length === 0) {
      throw new TypeError('lines must be a non-empty array');
    }

    let totalUnitsA = 0;
    let totalUnitsB = 0;
    let budgetRevenue = 0;
    for (const ln of lines) {
      assertNonNegative(ln.unitsA, `line[${ln.sku}].unitsA`);
      assertNonNegative(ln.unitsB, `line[${ln.sku}].unitsB`);
      assertFinite(ln.priceB, `line[${ln.sku}].priceB`);
      totalUnitsA += ln.unitsA;
      totalUnitsB += ln.unitsB;
      budgetRevenue += ln.unitsB * ln.priceB;
    }
    if (totalUnitsB < EPS) {
      throw new RangeError('total budget units cannot be zero');
    }
    const budgetAvgPrice = budgetRevenue / totalUnitsB;
    const delta = totalUnitsA - totalUnitsB;
    const amount = delta * budgetAvgPrice;

    const driverHe = Math.abs(delta) < EPS
      ? 'הכמות הכוללת זהה לתקציב'
      : delta > 0
        ? `הכמות הכוללת גבוהה מהתקציב ב-${formatAmount(delta)} יחידות`
        : `הכמות הכוללת נמוכה מהתקציב ב-${formatAmount(-delta)} יחידות`;
    const driverEn = Math.abs(delta) < EPS
      ? 'total quantity matches budget'
      : delta > 0
        ? `${formatAmount(delta)} total units above budget`
        : `${formatAmount(-delta)} total units below budget`;

    return makeComponent('quantity', amount, driverHe, driverEn);
  }

  // ───────────────────────── 3.2 Direct labor ─────────────────────────────

  /**
   * Labor rate variance = (rateA − rateB) × hoursA
   *
   * Positive means actual wage rate was higher than standard — unfavorable
   * on the cost side. Used by HR when analysing overtime creep, shift-
   * differentials, or grade-mix drift.
   */
  laborRateVariance({ hoursA, rateA, rateB }) {
    assertNonNegative(hoursA, 'hoursA');
    assertFinite(rateA, 'rateA');
    assertFinite(rateB, 'rateB');

    const delta = rateA - rateB;
    const amount = delta * hoursA;
    const pct = safePct(delta, Math.abs(rateB));

    const driverHe = Math.abs(delta) < EPS
      ? 'התעריף בפועל זהה לסטנדרט'
      : delta > 0
        ? `תעריף העבודה בפועל גבוה מהסטנדרט ב-${formatAmount(delta)} לשעה (${formatAmount(pct)}%)`
        : `תעריף העבודה בפועל נמוך מהסטנדרט ב-${formatAmount(-delta)} לשעה (${formatAmount(-pct)}%)`;
    const driverEn = Math.abs(delta) < EPS
      ? 'actual wage rate matches standard'
      : delta > 0
        ? `actual wage rate ${formatAmount(delta)}/hr above standard (${formatAmount(pct)}%)`
        : `actual wage rate ${formatAmount(-delta)}/hr below standard (${formatAmount(-pct)}%)`;

    return makeComponent('labor_rate', amount, driverHe, driverEn);
  }

  /**
   * Labor efficiency variance = (hoursA − hoursB) × rateB
   *
   * Positive means we needed more hours than standard to produce the same
   * output — unfavorable. This is the classic "time-and-motion" variance.
   */
  laborEfficiencyVariance({ hoursA, hoursB, rateB }) {
    assertNonNegative(hoursA, 'hoursA');
    assertNonNegative(hoursB, 'hoursB');
    assertFinite(rateB, 'rateB');

    const delta = hoursA - hoursB;
    const amount = delta * rateB;
    const pct = safePct(delta, Math.abs(hoursB));

    const driverHe = Math.abs(delta) < EPS
      ? 'מספר שעות העבודה זהה לסטנדרט'
      : delta > 0
        ? `נדרשו ${formatAmount(delta)} שעות נוספות מעבר לסטנדרט (${formatAmount(pct)}%)`
        : `נחסכו ${formatAmount(-delta)} שעות מול הסטנדרט (${formatAmount(-pct)}%)`;
    const driverEn = Math.abs(delta) < EPS
      ? 'labor hours match standard'
      : delta > 0
        ? `${formatAmount(delta)} extra hours vs. standard (${formatAmount(pct)}%)`
        : `${formatAmount(-delta)} hours saved vs. standard (${formatAmount(-pct)}%)`;

    return makeComponent('labor_efficiency', amount, driverHe, driverEn);
  }

  // ─────────────────────── 3.3 Direct materials ──────────────────────────

  /**
   * Material price variance = (costA − costB) × qtyA
   *
   * Positive means the vendor charged more per unit than the standard —
   * unfavorable. Purchasing department's KPI.
   */
  materialPriceVariance({ qtyA, costA, costB }) {
    assertNonNegative(qtyA, 'qtyA');
    assertFinite(costA, 'costA');
    assertFinite(costB, 'costB');

    const delta = costA - costB;
    const amount = delta * qtyA;
    const pct = safePct(delta, Math.abs(costB));

    const driverHe = Math.abs(delta) < EPS
      ? 'מחיר החומרים בפועל זהה לסטנדרט'
      : delta > 0
        ? `מחיר החומר בפועל גבוה מהסטנדרט ב-${formatAmount(delta)} ליחידה (${formatAmount(pct)}%)`
        : `מחיר החומר בפועל נמוך מהסטנדרט ב-${formatAmount(-delta)} ליחידה (${formatAmount(-pct)}%)`;
    const driverEn = Math.abs(delta) < EPS
      ? 'actual material cost matches standard'
      : delta > 0
        ? `actual cost ${formatAmount(delta)}/unit above standard (${formatAmount(pct)}%)`
        : `actual cost ${formatAmount(-delta)}/unit below standard (${formatAmount(-pct)}%)`;

    return makeComponent('material_price', amount, driverHe, driverEn);
  }

  /**
   * Material usage (a.k.a. quantity) variance = (qtyA − qtyB) × costB
   *
   * Positive means production consumed more raw material than standard —
   * unfavorable. Operations / production supervisor's KPI.
   */
  materialUsageVariance({ qtyA, qtyB, costB }) {
    assertNonNegative(qtyA, 'qtyA');
    assertNonNegative(qtyB, 'qtyB');
    assertFinite(costB, 'costB');

    const delta = qtyA - qtyB;
    const amount = delta * costB;
    const pct = safePct(delta, Math.abs(qtyB));

    const driverHe = Math.abs(delta) < EPS
      ? 'צריכת החומר זהה לסטנדרט'
      : delta > 0
        ? `נצרכו ${formatAmount(delta)} יחידות חומר מעבר לסטנדרט (${formatAmount(pct)}%)`
        : `נחסכו ${formatAmount(-delta)} יחידות חומר מול הסטנדרט (${formatAmount(-pct)}%)`;
    const driverEn = Math.abs(delta) < EPS
      ? 'material usage matches standard'
      : delta > 0
        ? `${formatAmount(delta)} extra units consumed (${formatAmount(pct)}%)`
        : `${formatAmount(-delta)} units saved (${formatAmount(-pct)}%)`;

    return makeComponent('material_usage', amount, driverHe, driverEn);
  }

  // ───────────────────────── 3.4 Aggregator ─────────────────────────────

  /**
   * Top-level decomposition. Accepts a flat inputs object so callers can
   * pass whatever they have and the analyzer fills in the components it
   * can compute. Any component missing its required inputs is simply
   * skipped — we never throw because (say) the caller did not supply
   * labor data when they only care about the sales variance.
   *
   * @param  {number} actual  — total actual figure (revenue, cost, whatever
   *                             the caller tracks as the north-star number)
   * @param  {number} budget  — matching budget / standard figure
   * @param  {object} inputs  — per-component inputs, all optional:
   *    { unitsA, unitsB, priceA, priceB,
   *      hoursA, hoursB, rateA,  rateB,
   *      qtyA,   qtyB,   costA,  costB,
   *      lines } // for mix/quantity
   *
   * @return {object}
   *    {
   *      total: { amount, favorable, flag, explanation_he, explanation_en },
   *      components: {
   *        price?, volume?, mix?, quantity?,
   *        labor_rate?, labor_efficiency?,
   *        material_price?, material_usage?
   *      },
   *      explained,   // sum of component amounts
   *      unexplained, // total − explained  (rounding / other drivers)
   *      bilingualReport: { he: string[], en: string[] }
   *    }
   */
  decompose(actual, budget, inputs = {}) {
    assertFinite(actual, 'actual');
    assertFinite(budget, 'budget');

    // Total variance uses the "actual − budget" convention. For the flavor
    // we let the caller signal via opts.flavor: if budget/actual are a cost
    // (e.g. total cost of goods sold), the sign should flip. Default is
    // revenue because that is the most common top-line use case.
    const totalAmount = actual - budget;
    const totalFlavor = inputs.flavor === 'cost' ? 'cost' : 'revenue';
    const totalFavorable =
      Math.abs(totalAmount) < EPS
        ? null
        : totalFlavor === 'revenue'
          ? totalAmount > 0
          : totalAmount < 0;
    const totalFlag =
      totalFavorable === null
        ? NEUTRAL_FLAG
        : totalFavorable
          ? FAVORABLE_FLAG
          : UNFAVORABLE_FLAG;

    const components = {};

    // 1. Sales price & volume (requires units + prices)
    if (
      Number.isFinite(inputs.unitsA) &&
      Number.isFinite(inputs.priceA) &&
      Number.isFinite(inputs.priceB)
    ) {
      components.price = this.priceVariance({
        unitsA: inputs.unitsA,
        priceA: inputs.priceA,
        priceB: inputs.priceB,
      });
    }
    if (
      Number.isFinite(inputs.unitsA) &&
      Number.isFinite(inputs.unitsB) &&
      Number.isFinite(inputs.priceB)
    ) {
      components.volume = this.volumeVariance({
        unitsA: inputs.unitsA,
        unitsB: inputs.unitsB,
        priceB: inputs.priceB,
      });
    }

    // 2. Mix & quantity (requires multi-line input)
    if (Array.isArray(inputs.lines) && inputs.lines.length > 0) {
      components.mix = this.mixVariance({ lines: inputs.lines });
      components.quantity = this.quantityVariance({ lines: inputs.lines });
    }

    // 3. Direct labor
    if (
      Number.isFinite(inputs.hoursA) &&
      Number.isFinite(inputs.rateA) &&
      Number.isFinite(inputs.rateB)
    ) {
      components.labor_rate = this.laborRateVariance({
        hoursA: inputs.hoursA,
        rateA: inputs.rateA,
        rateB: inputs.rateB,
      });
    }
    if (
      Number.isFinite(inputs.hoursA) &&
      Number.isFinite(inputs.hoursB) &&
      Number.isFinite(inputs.rateB)
    ) {
      components.labor_efficiency = this.laborEfficiencyVariance({
        hoursA: inputs.hoursA,
        hoursB: inputs.hoursB,
        rateB: inputs.rateB,
      });
    }

    // 4. Direct materials
    if (
      Number.isFinite(inputs.qtyA) &&
      Number.isFinite(inputs.costA) &&
      Number.isFinite(inputs.costB)
    ) {
      components.material_price = this.materialPriceVariance({
        qtyA: inputs.qtyA,
        costA: inputs.costA,
        costB: inputs.costB,
      });
    }
    if (
      Number.isFinite(inputs.qtyA) &&
      Number.isFinite(inputs.qtyB) &&
      Number.isFinite(inputs.costB)
    ) {
      components.material_usage = this.materialUsageVariance({
        qtyA: inputs.qtyA,
        qtyB: inputs.qtyB,
        costB: inputs.costB,
      });
    }

    // Sum of the components we could compute. For a clean single-product
    // price+volume decomposition this equals the total exactly (classical
    // algebraic identity). For mixed bags (revenue + labor + material in
    // one call) the components are NOT additive across flavors, so we
    // sum per-flavor and report both.
    let revenueExplained = 0;
    let costExplained = 0;
    // Only the "price + volume" pair forms the textbook identity. Mix and
    // quantity are an alternative decomposition of the SAME volume piece,
    // so adding all four would double-count the volume movement. We pick
    // price+volume by default and expose mix+quantity as sidecars.
    if (components.price) revenueExplained += components.price.amount;
    if (components.volume) revenueExplained += components.volume.amount;
    if (components.labor_rate) costExplained += components.labor_rate.amount;
    if (components.labor_efficiency) costExplained += components.labor_efficiency.amount;
    if (components.material_price) costExplained += components.material_price.amount;
    if (components.material_usage) costExplained += components.material_usage.amount;

    const explained = round(revenueExplained - costExplained, this.decimals);
    const unexplained = round(totalAmount - explained, this.decimals);

    const result = {
      total: {
        amount: round(totalAmount, this.decimals),
        favorable: totalFavorable,
        flag: totalFlag,
        flavor: totalFlavor,
        label_he: LABELS.total.he,
        label_en: LABELS.total.en,
        explanation_he: `${LABELS.total.he}: ${formatAmount(totalAmount)} (${
          totalFavorable === null ? 'ללא השפעה' : totalFavorable ? 'חיובי' : 'שלילי'
        })`,
        explanation_en: `${LABELS.total.en}: ${formatAmount(totalAmount)} (${
          totalFavorable === null ? 'neutral' : totalFavorable ? 'favorable' : 'unfavorable'
        })`,
      },
      components,
      explained,
      unexplained,
      revenueExplained: round(revenueExplained, this.decimals),
      costExplained: round(costExplained, this.decimals),
    };

    result.bilingualReport = this.buildReport(result);
    return result;
  }

  // ─────────────────────── 3.5 Flag + report helpers ────────────────────

  /**
   * Return the F / U / — flag for a component or raw amount.
   * Convenience wrapper for UI layers that already have a component object.
   */
  flag(compOrAmount, flavor) {
    if (compOrAmount && typeof compOrAmount === 'object' && 'flag' in compOrAmount) {
      return compOrAmount.flag;
    }
    // numeric + flavor form
    assertFinite(compOrAmount, 'amount');
    if (Math.abs(compOrAmount) < EPS) return NEUTRAL_FLAG;
    const f = flavor || 'revenue';
    if (f === 'revenue') return compOrAmount > 0 ? FAVORABLE_FLAG : UNFAVORABLE_FLAG;
    return compOrAmount < 0 ? FAVORABLE_FLAG : UNFAVORABLE_FLAG;
  }

  /**
   * Build a bilingual text report. Returns an object:
   *
   *   {
   *     he: 'multi-line Hebrew text',
   *     en: 'multi-line English text',
   *     lines: [{ key, he, en, amount, flag }, ...]
   *   }
   *
   * The `lines` array is the source of truth — callers that render tables
   * should use it directly instead of parsing the joined strings.
   */
  buildReport(decomp, opts = {}) {
    const lines = [];
    // Header = the total line
    lines.push({
      key: 'total',
      he: decomp.total.explanation_he,
      en: decomp.total.explanation_en,
      amount: decomp.total.amount,
      flag: decomp.total.flag,
    });

    // Deterministic order so diffs against golden files stay clean.
    const order = [
      'price',
      'volume',
      'mix',
      'quantity',
      'labor_rate',
      'labor_efficiency',
      'material_price',
      'material_usage',
    ];

    for (const key of order) {
      const c = decomp.components[key];
      if (!c) continue;
      lines.push({
        key,
        he: c.explanation_he,
        en: c.explanation_en,
        amount: c.amount,
        flag: c.flag,
      });
    }

    // Footer — show unexplained residual if non-trivial.
    if (Math.abs(decomp.unexplained) > EPS) {
      lines.push({
        key: 'unexplained',
        he: `יתרה בלתי מוסברת: ${formatAmount(decomp.unexplained)}`,
        en: `Unexplained residual: ${formatAmount(decomp.unexplained)}`,
        amount: decomp.unexplained,
        flag: NEUTRAL_FLAG,
      });
    }

    const joiner = opts.joiner || '\n';
    return {
      he: lines.map((l) => l.he).join(joiner),
      en: lines.map((l) => l.en).join(joiner),
      lines,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. EXPORTS (CommonJS + named)
// ═══════════════════════════════════════════════════════════════════════════

module.exports = VarianceAnalyzer;
module.exports.VarianceAnalyzer = VarianceAnalyzer;
module.exports.LABELS = LABELS;
module.exports.COMPONENT_FLAVORS = COMPONENT_FLAVORS;
module.exports.FAVORABLE_FLAG = FAVORABLE_FLAG;
module.exports.UNFAVORABLE_FLAG = UNFAVORABLE_FLAG;
module.exports.NEUTRAL_FLAG = NEUTRAL_FLAG;
// Internal helpers also exposed for test coverage — these are not part of
// the stable public API but they save the test file from having to
// re-implement the same math.
module.exports._internals = Object.freeze({
  round,
  formatAmount,
  safePct,
  makeComponent,
  assertFinite,
  assertNonNegative,
});
