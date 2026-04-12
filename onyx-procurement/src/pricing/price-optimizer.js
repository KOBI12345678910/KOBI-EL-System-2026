/**
 * Dynamic Price Optimizer — Metal Fabrication Pricing Engine
 * Agent X-07 — Swarm 3 — Kobi's mega-ERP for Techno-Kol Uzi
 *
 * ---------------------------------------------------------------
 *  A deterministic, fully-documented, zero-dependency pricing
 *  engine for an Israeli metal-fabrication shop (Techno-Kol Uzi).
 *
 *  Input:  a product (BOM + labor + category), a customer (tier,
 *          history), and a pricing context (urgency, payment terms,
 *          FX, season, market benchmarks).
 *  Output: a transparent pricing decision with every adjustment
 *          broken out, both in Hebrew (RTL) and English, together
 *          with a confidence score.
 *
 *  Algorithm (executed in strict order so explanations stay
 *  chronological):
 *    1.  Cost-plus baseline  (materials + labor + overhead × margin)
 *    2.  Market adjustment   (competitor benchmarks — user-supplied)
 *    3.  Customer tier       (VIP −5%, regular, small +5%)
 *    4.  Volume tier         (quantity breaks)
 *    5.  Seasonal index      (metal prices fluctuate across the year)
 *    6.  Urgency surcharge   (rush orders +15%)
 *    7.  Payment terms       (cash −2%, net-30, net-60 +2%)
 *    8.  Churn-risk tuning   (loyal → protect margin, at-risk → discount)
 *    9.  FX conversion       (USD/EUR contracts)
 *    10. VAT inclusion       (Israeli 18% default — can be overridden)
 *
 *  Exports:
 *    optimizePrice(product, customer, context)
 *    bulkRepricing(products, options)
 *    whatIf(product, scenarios)
 *    getPriceHistory(productId)
 *    recordPriceQuote(record)        — used by history store
 *    CONSTANTS                       — all tunable tables (exported for tests)
 *
 *  Design rules:
 *    - NEVER deletes data: the history store is append-only.
 *    - Zero external dependencies (pure Node / CommonJS).
 *    - Bilingual explanations (he / en) for UI and audit trail.
 *    - All monetary math uses integer agorot (שקל ÷ 100) internally
 *      to avoid floating-point drift, then converts back to ₪.
 *    - Every adjustment returns a {code, label_he, label_en, delta,
 *      percent, basis, reason} record so the UI can render a full
 *      breakdown without re-running the math.
 *
 *  Run tests:
 *    node --test test/payroll/price-optimizer.test.js
 * ---------------------------------------------------------------
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// 1. CONSTANTS — editable tables (Israeli metal-fab context, 2026)
// ═══════════════════════════════════════════════════════════════

const CONSTANTS = Object.freeze({
  // Israeli standard VAT rate (as of 2025 — confirmed unchanged 2026)
  VAT_RATE: 0.18,

  // Supported currencies (ISO-4217) with display symbols
  CURRENCIES: Object.freeze({
    ILS: { symbol: '₪', decimals: 2, name_he: 'שקל חדש',      name_en: 'Israeli Shekel' },
    USD: { symbol: '$', decimals: 2, name_he: 'דולר אמריקאי',   name_en: 'US Dollar' },
    EUR: { symbol: '€', decimals: 2, name_he: 'יורו',           name_en: 'Euro' },
  }),

  // Default FX rates — should be overridden by context.fxRates.
  // These are sane fallbacks so the engine never crashes.
  DEFAULT_FX: Object.freeze({
    ILS: 1.0,
    USD: 3.70,  // 1 USD = 3.70 ILS
    EUR: 4.00,  // 1 EUR = 4.00 ILS
  }),

  // Raw-material price index (₪ per kg, indicative; can be overridden)
  RAW_MATERIALS: Object.freeze({
    COLD_ROLLED_STEEL: { code: 'CRS', name_he: 'פלדה מגולגלת קרה', name_en: 'Cold-rolled steel', pricePerKg: 4.80 },
    GALVANIZED_STEEL:  { code: 'GLV', name_he: 'פלדה מגולוונת',    name_en: 'Galvanized steel',  pricePerKg: 5.60 },
    STAINLESS_304:     { code: 'SS304', name_he: 'נירוסטה 304',     name_en: 'Stainless 304',     pricePerKg: 18.50 },
    STAINLESS_316:     { code: 'SS316', name_he: 'נירוסטה 316',     name_en: 'Stainless 316',     pricePerKg: 26.00 },
    ALUMINUM_6061:     { code: 'AL6061', name_he: 'אלומיניום 6061', name_en: 'Aluminum 6061',     pricePerKg: 22.00 },
  }),

  // Labor rates (₪ per minute) for each processing stage
  LABOR_RATES: Object.freeze({
    CUTTING:   { name_he: 'חיתוך',  name_en: 'Cutting',   perMinute: 2.10 },
    BENDING:   { name_he: 'כיפוף',   name_en: 'Bending',   perMinute: 2.40 },
    WELDING:   { name_he: 'ריתוך',   name_en: 'Welding',   perMinute: 3.20 },
    PAINTING:  { name_he: 'צביעה',   name_en: 'Painting',  perMinute: 1.80 },
    ASSEMBLY:  { name_he: 'הרכבה',   name_en: 'Assembly',  perMinute: 2.50 },
  }),

  // Fixed overhead multiplier (on direct cost) — covers rent,
  // electricity, admin, machine depreciation, consumables.
  OVERHEAD_RATE: 0.22,

  // Standard margins by product category
  CATEGORY_MARGINS: Object.freeze({
    STRUCTURAL: { margin: 0.25, name_he: 'מוצר מבני',     name_en: 'Structural' },
    PRECISION:  { margin: 0.40, name_he: 'עבודה מדויקת', name_en: 'Precision' },
    CUSTOM:     { margin: 0.50, name_he: 'עבודה מיוחדת', name_en: 'Custom' },
  }),

  // Customer tiers
  CUSTOMER_TIERS: Object.freeze({
    VIP:     { adjust: -0.05, name_he: 'לקוח VIP',   name_en: 'VIP customer' },
    REGULAR: { adjust:  0.00, name_he: 'לקוח רגיל',  name_en: 'Regular customer' },
    SMALL:   { adjust:  0.05, name_he: 'לקוח קטן',   name_en: 'Small customer' },
  }),

  // Volume quantity breaks (ascending). Applied by finding the
  // highest break whose `minQty` ≤ requested quantity.
  VOLUME_BREAKS: Object.freeze([
    { minQty:   1, discount: 0.00 },
    { minQty:  10, discount: 0.02 },
    { minQty:  50, discount: 0.05 },
    { minQty: 100, discount: 0.08 },
    { minQty: 500, discount: 0.12 },
    { minQty:1000, discount: 0.15 },
  ]),

  // Seasonal demand index keyed by month (1-12). 1.00 = neutral.
  // Q1 construction surge, summer slowdown, Q4 rally.
  SEASONAL_INDEX: Object.freeze({
    1:  1.03,   2:  1.04,   3:  1.05,   //  Q1 — construction kickoff
    4:  1.02,   5:  1.00,   6:  0.98,
    7:  0.96,   8:  0.95,   9:  0.99,   //  Summer dip
    10: 1.02,  11: 1.04,   12: 1.05,    //  Year-end closeout
  }),

  // Urgency levels
  URGENCY: Object.freeze({
    STANDARD: { surcharge: 0.00, name_he: 'זמן אספקה רגיל',  name_en: 'Standard lead time' },
    EXPRESS:  { surcharge: 0.08, name_he: 'זמן אספקה מוזמן', name_en: 'Express lead time' },
    RUSH:     { surcharge: 0.15, name_he: 'הזמנה דחופה',     name_en: 'Rush order' },
  }),

  // Payment terms
  PAYMENT_TERMS: Object.freeze({
    CASH:    { adjust: -0.02, name_he: 'מזומן',           name_en: 'Cash' },
    NET_30:  { adjust:  0.00, name_he: 'שוטף +30',        name_en: 'Net-30' },
    NET_60:  { adjust:  0.02, name_he: 'שוטף +60',        name_en: 'Net-60' },
    NET_90:  { adjust:  0.035, name_he: 'שוטף +90',       name_en: 'Net-90' },
  }),

  // Churn-risk buckets
  CHURN_RISK: Object.freeze({
    LOYAL:    { adjust:  0.00, name_he: 'לקוח נאמן',         name_en: 'Loyal — protect margin' },
    NEUTRAL:  { adjust:  0.00, name_he: 'סיכון ניטרלי',      name_en: 'Neutral' },
    AT_RISK:  { adjust: -0.04, name_he: 'סיכון נטישה',       name_en: 'At risk — defensive discount' },
    LOST:     { adjust: -0.07, name_he: 'לקוח אבוד',         name_en: 'Win-back discount' },
  }),

  // Local Israeli competitors that we benchmark against
  COMPETITORS_IL: Object.freeze(['איילון', 'דיסאל', 'פעל גיא']),
});

// ═══════════════════════════════════════════════════════════════
// 2. INTERNAL STORES (append-only — NEVER deleted per house rules)
// ═══════════════════════════════════════════════════════════════

/** Append-only price-quote history, keyed by productId. */
const _priceHistory = new Map();

// ═══════════════════════════════════════════════════════════════
// 3. PRECISION HELPERS (integer agorot to avoid float drift)
// ═══════════════════════════════════════════════════════════════

/** Round a number to 2 decimals using banker-free half-up. */
function round2(n) {
  if (!isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Convert shekel to agorot (integer). */
function toAgorot(shekel) {
  if (!isFinite(shekel)) return 0;
  return Math.round(shekel * 100);
}

/** Convert agorot back to shekel. */
function fromAgorot(agorot) {
  return agorot / 100;
}

/** Clamp a number into [lo, hi]. */
function clamp(n, lo, hi) {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

/** Safe, typed number coercion (returns 0 for garbage). */
function num(v, fallback) {
  const f = (fallback === undefined) ? 0 : fallback;
  if (v === null || v === undefined) return f;
  const n = Number(v);
  return isFinite(n) ? n : f;
}

/** Flatten a percentage into a signed delta on an integer base. */
function pctOf(baseAgorot, percent) {
  return Math.round(baseAgorot * percent);
}

// ═══════════════════════════════════════════════════════════════
// 4. COST-PLUS BASELINE (step 1)
// ═══════════════════════════════════════════════════════════════

/**
 * Compute the raw manufacturing cost of a product.
 *
 * A product is expected to look like:
 *   {
 *     id:        'SKU-123',
 *     name_he:   'מסגרת פלדה',
 *     name_en:   'Steel frame',
 *     category:  'STRUCTURAL' | 'PRECISION' | 'CUSTOM',
 *     materials: [
 *       { kind: 'COLD_ROLLED_STEEL', kg: 12.5 },
 *       { kind: 'STAINLESS_304',     kg: 1.2  },
 *     ],
 *     labor: [
 *       { stage: 'CUTTING', minutes: 15 },
 *       { stage: 'WELDING', minutes: 30 },
 *     ],
 *     // optional: raw overrides, if caller already knows their cost
 *     materialsCostOverride: 0,
 *     laborCostOverride:     0,
 *     overheadOverride:      0,
 *   }
 */
function calculateCostPlus(product) {
  if (!product || typeof product !== 'object') {
    throw new TypeError('price-optimizer: product must be an object');
  }

  // Materials ────────────────────────────────────────────────
  let materialsAg = 0;
  const materialLines = [];
  if (Array.isArray(product.materials)) {
    for (const m of product.materials) {
      const def = CONSTANTS.RAW_MATERIALS[m.kind];
      if (!def) {
        // Unknown material kind → attempt inline pricePerKg
        const inlinePrice = num(m.pricePerKg, 0);
        const kg = num(m.kg, 0);
        const line = toAgorot(inlinePrice * kg);
        materialsAg += line;
        materialLines.push({
          kind: m.kind || 'UNKNOWN',
          kg,
          pricePerKg: inlinePrice,
          lineTotal: fromAgorot(line),
        });
        continue;
      }
      const kg = num(m.kg, 0);
      const line = toAgorot(def.pricePerKg * kg);
      materialsAg += line;
      materialLines.push({
        kind: def.code,
        kg,
        pricePerKg: def.pricePerKg,
        lineTotal: fromAgorot(line),
      });
    }
  }
  if (num(product.materialsCostOverride, 0) > 0) {
    materialsAg = toAgorot(product.materialsCostOverride);
  }

  // Labor ────────────────────────────────────────────────────
  let laborAg = 0;
  const laborLines = [];
  if (Array.isArray(product.labor)) {
    for (const l of product.labor) {
      const rate = CONSTANTS.LABOR_RATES[l.stage];
      if (!rate) {
        const inline = num(l.ratePerMinute, 0);
        const mins = num(l.minutes, 0);
        const line = toAgorot(inline * mins);
        laborAg += line;
        laborLines.push({ stage: l.stage || 'UNKNOWN', minutes: mins, ratePerMinute: inline, lineTotal: fromAgorot(line) });
        continue;
      }
      const mins = num(l.minutes, 0);
      const line = toAgorot(rate.perMinute * mins);
      laborAg += line;
      laborLines.push({ stage: l.stage, minutes: mins, ratePerMinute: rate.perMinute, lineTotal: fromAgorot(line) });
    }
  }
  if (num(product.laborCostOverride, 0) > 0) {
    laborAg = toAgorot(product.laborCostOverride);
  }

  // Overhead ─────────────────────────────────────────────────
  const directAg = materialsAg + laborAg;
  let overheadAg = pctOf(directAg, CONSTANTS.OVERHEAD_RATE);
  if (num(product.overheadOverride, 0) > 0) {
    overheadAg = toAgorot(product.overheadOverride);
  }

  // Margin by category ───────────────────────────────────────
  const category = product.category || 'STRUCTURAL';
  const catCfg = CONSTANTS.CATEGORY_MARGINS[category]
              || CONSTANTS.CATEGORY_MARGINS.STRUCTURAL;
  const marginRate = num(product.marginOverride, catCfg.margin);

  // cost before margin = direct + overhead
  const costAg = directAg + overheadAg;
  // baseline price = cost × (1 + margin)
  const baselineAg = costAg + pctOf(costAg, marginRate);

  return {
    materials:     fromAgorot(materialsAg),
    labor:         fromAgorot(laborAg),
    overhead:      fromAgorot(overheadAg),
    cost:          fromAgorot(costAg),
    marginRate,
    marginAmount:  fromAgorot(pctOf(costAg, marginRate)),
    baseline:      fromAgorot(baselineAg),
    category,
    categoryLabel: { he: catCfg.name_he, en: catCfg.name_en },
    materialLines,
    laborLines,
    _internal:     { baselineAg, costAg, directAg, materialsAg, laborAg, overheadAg },
  };
}

// ═══════════════════════════════════════════════════════════════
// 5. ADJUSTMENT HELPERS — each returns one breakdown record
// ═══════════════════════════════════════════════════════════════

function makeAdjustment(code, percent, baseAg, label_he, label_en, reason) {
  const deltaAg = pctOf(baseAg, percent);
  return {
    code,
    label_he,
    label_en,
    percent,
    delta: fromAgorot(deltaAg),
    deltaAg,
    basis: fromAgorot(baseAg),
    reason: reason || '',
  };
}

function applyMarketBenchmark(baseAg, benchmarks) {
  // benchmarks = { competitorAvg, name_he?, name_en? }
  // Rule: if our baseline is more than ±8% off the competitor avg,
  // soft-nudge 40% toward the market. Never move further away.
  if (!benchmarks || !isFinite(benchmarks.competitorAvg) || benchmarks.competitorAvg <= 0) {
    return makeAdjustment(
      'MARKET',
      0,
      baseAg,
      'אין מידע על מתחרים',
      'No competitor data',
      'benchmark not provided',
    );
  }
  const baseShekel = fromAgorot(baseAg);
  const diffPct = (benchmarks.competitorAvg - baseShekel) / baseShekel;
  const nudge = Math.abs(diffPct) > 0.08 ? diffPct * 0.40 : 0;
  const reason = `competitor avg ${round2(benchmarks.competitorAvg)} vs baseline ${round2(baseShekel)} (diff ${(diffPct * 100).toFixed(1)}%)`;
  return makeAdjustment(
    'MARKET',
    nudge,
    baseAg,
    'התאמה לשוק המקומי',
    'Local market alignment',
    reason,
  );
}

function applyCustomerTier(baseAg, customer) {
  const tier = (customer && customer.tier) || 'REGULAR';
  const cfg = CONSTANTS.CUSTOMER_TIERS[tier] || CONSTANTS.CUSTOMER_TIERS.REGULAR;
  return makeAdjustment(
    'TIER_' + tier,
    cfg.adjust,
    baseAg,
    cfg.name_he,
    cfg.name_en,
    'customer tier policy',
  );
}

function applyVolume(baseAg, quantity) {
  const qty = Math.max(1, Math.floor(num(quantity, 1)));
  // walk breaks ascending; keep the largest that still ≤ qty
  let chosen = CONSTANTS.VOLUME_BREAKS[0];
  for (const br of CONSTANTS.VOLUME_BREAKS) {
    if (qty >= br.minQty) chosen = br;
  }
  // Normalize -0 → 0 so strict equality tests are stable
  const pct = chosen.discount === 0 ? 0 : -chosen.discount;
  return makeAdjustment(
    'VOLUME',
    pct,                        // discounts are negative
    baseAg,
    `מדרגת כמות ${chosen.minQty}+`,
    `Volume tier ${chosen.minQty}+`,
    `quantity = ${qty}`,
  );
}

function applySeason(baseAg, month) {
  const m = clamp(Math.floor(num(month, new Date().getMonth() + 1)), 1, 12);
  const idx = CONSTANTS.SEASONAL_INDEX[m];
  // Convert the index ±1.00 into a signed percent
  const delta = idx - 1.00;
  return makeAdjustment(
    'SEASON',
    delta,
    baseAg,
    `מדד עונתי לחודש ${m}`,
    `Seasonal index month ${m}`,
    `index = ${idx}`,
  );
}

function applyUrgency(baseAg, urgency) {
  const key = urgency || 'STANDARD';
  const cfg = CONSTANTS.URGENCY[key] || CONSTANTS.URGENCY.STANDARD;
  return makeAdjustment(
    'URGENCY_' + key,
    cfg.surcharge,
    baseAg,
    cfg.name_he,
    cfg.name_en,
    'lead-time policy',
  );
}

function applyPaymentTerms(baseAg, terms) {
  const key = terms || 'NET_30';
  const cfg = CONSTANTS.PAYMENT_TERMS[key] || CONSTANTS.PAYMENT_TERMS.NET_30;
  return makeAdjustment(
    'PAY_' + key,
    cfg.adjust,
    baseAg,
    cfg.name_he,
    cfg.name_en,
    'payment-term financing cost',
  );
}

function applyChurnRisk(baseAg, customer) {
  const risk = (customer && customer.churnRisk) || 'NEUTRAL';
  const cfg = CONSTANTS.CHURN_RISK[risk] || CONSTANTS.CHURN_RISK.NEUTRAL;
  return makeAdjustment(
    'CHURN_' + risk,
    cfg.adjust,
    baseAg,
    cfg.name_he,
    cfg.name_en,
    'customer retention policy',
  );
}

function convertCurrency(amountIls, targetCurrency, fxRates) {
  const code = (targetCurrency || 'ILS').toUpperCase();
  const rate = num(
    (fxRates && fxRates[code]) || CONSTANTS.DEFAULT_FX[code],
    CONSTANTS.DEFAULT_FX.ILS,
  );
  if (code === 'ILS' || rate <= 0) return { amount: amountIls, rate: 1, code: 'ILS' };
  return {
    amount: round2(amountIls / rate),
    rate,
    code,
  };
}

function applyVat(amount, includeVat, vatRate) {
  const rate = isFinite(vatRate) ? vatRate : CONSTANTS.VAT_RATE;
  if (!includeVat) {
    return { net: round2(amount), vat: 0, gross: round2(amount), rate };
  }
  const vat = round2(amount * rate);
  return {
    net:   round2(amount),
    vat,
    gross: round2(amount + vat),
    rate,
  };
}

// ═══════════════════════════════════════════════════════════════
// 6. CONFIDENCE SCORING
// ═══════════════════════════════════════════════════════════════

/**
 * Confidence is a 0..1 score reflecting how much data the engine
 * had when it priced. We never hide uncertainty: a low score tells
 * the sales rep to manually confirm.
 */
function computeConfidence(product, customer, context) {
  let score = 1.0;
  if (!product.materials || product.materials.length === 0) score -= 0.20;
  if (!product.labor     || product.labor.length     === 0) score -= 0.15;
  if (!product.category)                                     score -= 0.05;
  if (!customer || !customer.id)                             score -= 0.10;
  if (!context || !context.benchmarks)                       score -= 0.10;
  if (!context || !context.fxRates)                          score -= 0.05;
  if (!context || !context.month)                            score -= 0.05;
  return round2(clamp(score, 0, 1));
}

// ═══════════════════════════════════════════════════════════════
// 7. BILINGUAL EXPLANATIONS
// ═══════════════════════════════════════════════════════════════

function buildExplanation(base, adjustments, finalAmount, currency) {
  const lines_he = [];
  const lines_en = [];
  const sym = (CONSTANTS.CURRENCIES[currency] && CONSTANTS.CURRENCIES[currency].symbol) || '₪';

  lines_he.push(`מחיר בסיס (עלות + שולי רווח): ${round2(base)} ${sym}`);
  lines_en.push(`Baseline (cost + margin): ${round2(base)} ${sym}`);

  for (const a of adjustments) {
    const pctTxt = (a.percent * 100).toFixed(1);
    const sign = a.delta >= 0 ? '+' : '';
    lines_he.push(`• ${a.label_he}: ${sign}${round2(a.delta)} ${sym} (${sign}${pctTxt}%)`);
    lines_en.push(`• ${a.label_en}: ${sign}${round2(a.delta)} ${sym} (${sign}${pctTxt}%)`);
  }

  lines_he.push(`מחיר סופי: ${round2(finalAmount)} ${sym}`);
  lines_en.push(`Final price: ${round2(finalAmount)} ${sym}`);

  return {
    he: lines_he.join('\n'),
    en: lines_en.join('\n'),
  };
}

// ═══════════════════════════════════════════════════════════════
// 8. PUBLIC API — optimizePrice
// ═══════════════════════════════════════════════════════════════

/**
 * Main entry-point. Applies the 10-step algorithm and returns a
 * fully auditable pricing decision.
 */
function optimizePrice(product, customer, context) {
  if (!product) throw new TypeError('optimizePrice: product is required');
  const ctx = context || {};
  const cust = customer || {};

  // Step 1 — cost-plus baseline -------------------------------
  const baselineData = calculateCostPlus(product);
  let currentAg = baselineData._internal.baselineAg;
  const baselineAg = currentAg;

  const adjustments = [];

  // Step 2 — market alignment ---------------------------------
  const adjMarket = applyMarketBenchmark(currentAg, ctx.benchmarks);
  adjustments.push(adjMarket);
  currentAg += adjMarket.deltaAg;

  // Step 3 — customer tier ------------------------------------
  const adjTier = applyCustomerTier(currentAg, cust);
  adjustments.push(adjTier);
  currentAg += adjTier.deltaAg;

  // Step 4 — volume break -------------------------------------
  const qty = num(ctx.quantity, 1);
  const adjVol = applyVolume(currentAg, qty);
  adjustments.push(adjVol);
  currentAg += adjVol.deltaAg;

  // Step 5 — seasonal index -----------------------------------
  const adjSeason = applySeason(currentAg, ctx.month);
  adjustments.push(adjSeason);
  currentAg += adjSeason.deltaAg;

  // Step 6 — urgency surcharge --------------------------------
  const adjUrgency = applyUrgency(currentAg, ctx.urgency);
  adjustments.push(adjUrgency);
  currentAg += adjUrgency.deltaAg;

  // Step 7 — payment terms ------------------------------------
  const adjPay = applyPaymentTerms(currentAg, ctx.paymentTerms);
  adjustments.push(adjPay);
  currentAg += adjPay.deltaAg;

  // Step 8 — churn-risk ---------------------------------------
  const adjChurn = applyChurnRisk(currentAg, cust);
  adjustments.push(adjChurn);
  currentAg += adjChurn.deltaAg;

  // Never ship a negative quote — floor at zero
  if (currentAg < 0) currentAg = 0;

  // The unit price in ILS, net of VAT, before quantity scaling
  const unitIls = fromAgorot(currentAg);

  // Total for the requested quantity
  const totalIls = round2(unitIls * qty);

  // Step 9 — FX conversion ------------------------------------
  const targetCcy = (ctx.currency || 'ILS').toUpperCase();
  const fx = convertCurrency(totalIls, targetCcy, ctx.fxRates);

  // Step 10 — VAT ---------------------------------------------
  const vatInclude = ctx.includeVat !== false; // default on
  const vat = applyVat(fx.amount, vatInclude, ctx.vatRate);

  // Confidence ------------------------------------------------
  const confidence = computeConfidence(product, cust, ctx);

  // Explanations ----------------------------------------------
  const explanation = buildExplanation(
    baselineData.baseline,
    adjustments,
    unitIls,
    'ILS',
  );

  const decision = {
    productId:   product.id || null,
    productName: { he: product.name_he || '', en: product.name_en || '' },
    quantity:    qty,

    baseline:    baselineData,   // includes materials/labor breakdown
    base:        baselineData.baseline,
    adjustments,

    unit: {
      ils: round2(unitIls),
      target: { amount: round2(unitIls / (fx.rate || 1) * (targetCcy === 'ILS' ? 1 : 1)), code: targetCcy },
    },

    total: {
      net:   round2(fx.amount),
      vat:   vat.vat,
      gross: vat.gross,
      currency: fx.code,
      fxRate:   fx.rate,
      vatRate:  vat.rate,
      vatIncluded: vatInclude,
    },

    final:      vat.gross,
    currency:   fx.code,

    confidence,

    explanation_he: explanation.he,
    explanation_en: explanation.en,

    generatedAt: new Date().toISOString(),
  };

  // Append to history (never delete)
  _recordInternal(product.id, decision);

  return decision;
}

// ═══════════════════════════════════════════════════════════════
// 9. BULK REPRICING
// ═══════════════════════════════════════════════════════════════

/**
 * bulkRepricing(products, options)
 *   products : [{ product, customer, context }, …]
 *   options  : { analyzeMargin:true }
 *
 * Returns an array of decisions plus aggregate margin analysis.
 */
function bulkRepricing(items, options) {
  if (!Array.isArray(items)) {
    throw new TypeError('bulkRepricing: first arg must be an array');
  }
  const opts = options || {};
  const results = [];

  let totalCost = 0;
  let totalRevenue = 0;

  for (const it of items) {
    try {
      const d = optimizePrice(it.product, it.customer, it.context);
      const cost = d.baseline.cost * (d.quantity || 1);
      const rev  = d.total.net;
      const marginAmount = rev - cost;
      const marginPct = cost > 0 ? (marginAmount / cost) : 0;
      results.push({
        ok: true,
        decision: d,
        marginAnalysis: {
          cost:         round2(cost),
          revenue:      round2(rev),
          marginAmount: round2(marginAmount),
          marginPct:    round2(marginPct),
        },
      });
      totalCost += cost;
      totalRevenue += rev;
    } catch (err) {
      results.push({
        ok: false,
        error: err && err.message ? err.message : String(err),
        input: it,
      });
    }
  }

  return {
    items: results,
    summary: {
      count:         results.length,
      successes:     results.filter(r => r.ok).length,
      failures:      results.filter(r => !r.ok).length,
      totalCost:     round2(totalCost),
      totalRevenue:  round2(totalRevenue),
      totalMargin:   round2(totalRevenue - totalCost),
      blendedMarginPct: totalCost > 0 ? round2((totalRevenue - totalCost) / totalCost) : 0,
    },
    options: opts,
  };
}

// ═══════════════════════════════════════════════════════════════
// 10. WHAT-IF ANALYSIS
// ═══════════════════════════════════════════════════════════════

/**
 * whatIf(product, scenarios)
 *   Run the same product through many contexts so the sales team
 *   can compare outcomes before quoting.
 *
 *   scenarios = [{ label, customer, context }, …]
 *
 * Result carries the delta vs. the first scenario so the UI can
 * highlight the best option.
 */
function whatIf(product, scenarios) {
  if (!product) throw new TypeError('whatIf: product is required');
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    throw new TypeError('whatIf: scenarios must be a non-empty array');
  }

  const outcomes = scenarios.map((s, i) => {
    const d = optimizePrice(product, s.customer, s.context);
    return {
      index:    i,
      label:    s.label || `Scenario ${i + 1}`,
      decision: d,
      final:    d.final,
      currency: d.currency,
    };
  });

  const baseline = outcomes[0];
  for (const o of outcomes) {
    o.deltaVsBaseline        = round2(o.final - baseline.final);
    o.deltaVsBaselinePercent = baseline.final > 0 ? round2((o.final - baseline.final) / baseline.final) : 0;
  }

  // best = lowest margin-preserving price for the customer → max revenue
  // Here "best" = highest `final` because that's revenue for Techno-Kol.
  let best = outcomes[0];
  for (const o of outcomes) if (o.final > best.final) best = o;

  let worst = outcomes[0];
  for (const o of outcomes) if (o.final < worst.final) worst = o;

  return {
    productId: product.id || null,
    count:     outcomes.length,
    baseline:  { label: baseline.label, final: baseline.final },
    best:      { label: best.label,     final: best.final,     index: best.index },
    worst:     { label: worst.label,    final: worst.final,    index: worst.index },
    outcomes,
  };
}

// ═══════════════════════════════════════════════════════════════
// 11. PRICE HISTORY  (append-only — rule: never delete)
// ═══════════════════════════════════════════════════════════════

function _recordInternal(productId, decision) {
  if (!productId) return;
  if (!_priceHistory.has(productId)) _priceHistory.set(productId, []);
  _priceHistory.get(productId).push({
    at:       decision.generatedAt,
    baseline: decision.base,
    final:    decision.final,
    currency: decision.currency,
    qty:      decision.quantity,
  });
}

/**
 * Public API to record an external quote (e.g. rolled back from
 * a purchase order) into the history timeline. Still append-only.
 */
function recordPriceQuote(record) {
  if (!record || !record.productId) {
    throw new TypeError('recordPriceQuote: productId is required');
  }
  if (!_priceHistory.has(record.productId)) _priceHistory.set(record.productId, []);
  _priceHistory.get(record.productId).push({
    at:       record.at || new Date().toISOString(),
    baseline: num(record.baseline, 0),
    final:    num(record.final, 0),
    currency: record.currency || 'ILS',
    qty:      num(record.qty, 1),
    note:     record.note || '',
    source:   record.source || 'manual',
  });
  return true;
}

/**
 * Return an immutable copy of the price history for a product,
 * plus a simple trend calculation: first→last percent change.
 */
function getPriceHistory(productId) {
  if (!productId) return { productId: null, count: 0, history: [], trend: null };
  const list = _priceHistory.get(productId) || [];
  const history = list.map(h => Object.assign({}, h));
  let trend = null;
  if (history.length >= 2) {
    const first = history[0];
    const last  = history[history.length - 1];
    const abs = round2(last.final - first.final);
    const pct = first.final > 0 ? round2((last.final - first.final) / first.final) : 0;
    trend = {
      firstPrice: first.final,
      lastPrice:  last.final,
      absoluteDelta: abs,
      percentDelta:  pct,
      direction: abs > 0 ? 'up' : (abs < 0 ? 'down' : 'flat'),
      observations: history.length,
    };
  }
  return { productId, count: history.length, history, trend };
}

// ═══════════════════════════════════════════════════════════════
// 12. EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  // public API
  optimizePrice,
  bulkRepricing,
  whatIf,
  getPriceHistory,
  recordPriceQuote,

  // tunable tables (read-only; frozen)
  CONSTANTS,

  // internals exported ONLY so the test harness can exercise them
  _internal: {
    calculateCostPlus,
    applyMarketBenchmark,
    applyCustomerTier,
    applyVolume,
    applySeason,
    applyUrgency,
    applyPaymentTerms,
    applyChurnRisk,
    convertCurrency,
    applyVat,
    computeConfidence,
    round2,
    toAgorot,
    fromAgorot,
    clamp,
    num,
    pctOf,
  },
};
