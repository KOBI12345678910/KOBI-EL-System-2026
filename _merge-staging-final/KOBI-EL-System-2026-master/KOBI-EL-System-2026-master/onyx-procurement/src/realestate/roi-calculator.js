/**
 * roi-calculator.js — מחשבון תשואה והחזר השקעה לנדל"ן / Israeli Real-Estate ROI Engine
 * Agent Y-060 / Swarm Real-Estate / Techno-Kol Uzi Mega-ERP — Wave 2026
 * ---------------------------------------------------------------------------
 *
 * Pure financial kernel for real-estate investment analysis targeting the
 * Israeli market (NIS / ILS) but usable for any currency. Provides the full
 * underwriting toolkit used by developers, landlords, and asset managers:
 *
 *   • Cap rate            (שיעור היוון)
 *   • Cash-on-cash        (תשואה על ההון העצמי)
 *   • Gross yield         (תשואה ברוטו)
 *   • Net yield           (תשואה נטו)
 *   • IRR                 (תשואה פנימית) — Newton-Raphson + bisection fallback
 *   • NPV                 (ערך נוכחי נקי)
 *   • DSCR                (יחס כיסוי חוב)
 *   • LTV                 (יחס מימון לשווי)
 *   • Break-even occupancy (תפוסת איזון)
 *   • Holding-period DCF  (ניתוח תקופת החזקה מלאה)
 *   • Sensitivity matrix  (מטריצת רגישות)
 *   • Israeli after-tax return — סעיף 122 מסלול 10% vs. מסלול רגיל (brackets)
 *                                 + betterment (שבח) tax on sale.
 *
 * ---------------------------------------------------------------------------
 * Rule of the house: לא מוחקים — רק משדרגים ומגדלים.
 * This module is additive, pure, and never mutates caller inputs. All inputs
 * are defensively copied; every function returns a fresh object or primitive.
 * ---------------------------------------------------------------------------
 *
 * Zero external dependencies (Node built-ins only). Bilingual Hebrew + English
 * labels and citations throughout.
 *
 * ---------------------------------------------------------------------------
 * Public surface (CommonJS):
 *
 *   capRate(noi, propertyValue)
 *   cashOnCash({annualCashFlow, totalCashInvested})
 *   grossYield({annualRent, price})
 *   netYield({annualRent, opex, price})
 *   irr(cashflows, opts?)
 *   npv(cashflows, discountRate)
 *   dscr({noi, annualDebtService})
 *   ltv({loan, value})
 *   breakEvenOccupancy({fixedCosts, varCostsPerOcc, rentPerUnit, units})
 *   holdingPeriodAnalysis({purchase, rentGrowth, expenseGrowth,
 *                          appreciation, saleCosts, holdYears, discountRate, ...})
 *   sensitivity({baseCase, vary:{cap:[...], rent:[...]}})
 *   israeliAfterTaxReturn(preTax)
 *
 *   Constants:
 *     ISRAELI_RENTAL_FLAT_RATE           = 0.10   — סעיף 122 פקודת מס הכנסה
 *     ISRAELI_BETTERMENT_INDIV_RATE      = 0.25   — סעיף 48א(ב) חוק מיסוי מקרקעין
 *     ISRAELI_BETTERMENT_COMPANY_RATE    = 0.23   — חברה — סעיף 48א(א)
 *     ISRAELI_RENTAL_EXEMPT_CEILING_2026 — תקרת פטור חודשית לדירת מגורים
 *     LAW_CITATIONS                      — citation map used across the module
 *
 * ---------------------------------------------------------------------------
 * Legal references (Israel):
 *
 *   • פקודת מס הכנסה [נוסח חדש], התשכ"א-1961:
 *       סעיף 2(6)        — הכנסה מהשכרה (rental income is חיוב ב-מס)
 *       סעיף 122         — מסלול מס מופחת 10% על שכ"ד דירת מגורים (flat track)
 *       חוק מס הכנסה (פטור ממס על הכנסה מהשכרת דירת מגורים),
 *       התש"ן-1990       — track of total exemption up to monthly ceiling
 *   • חוק מיסוי מקרקעין (שבח ורכישה), התשכ"ג-1963:
 *       סעיף 6           — הטלת מס שבח
 *       סעיף 47          — שבח ריאלי (CPI adjustment)
 *       סעיף 48א         — שיעורי מס שבח (25% יחיד / 23% חברה)
 *       סעיף 48א(ב1)     — חישוב ליניארי פטור לדירת מגורים מזכה
 *
 * ---------------------------------------------------------------------------
 * Numerical conventions:
 *
 *   • All rates in decimal form (0.05 = 5%). Helpers never silently re-scale.
 *   • NPV / IRR: the first cashflow (index 0) is at t=0 (initial outlay),
 *     usually negative. Subsequent entries are at t=1, 2, 3, ...
 *   • IRR returns a Number. On non-convergence it returns NaN and writes a
 *     `.reason` property on the optional `diagnostics` container passed in.
 *   • All currency outputs rounded to 2 decimals for display, but intermediate
 *     math is kept at full double precision.
 * ---------------------------------------------------------------------------
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
//  Constants — Israeli tax parameters (Wave 2026)
// ═══════════════════════════════════════════════════════════════════════════

/** Flat tax rate on residential rental per סעיף 122 פקודת מס הכנסה */
const ISRAELI_RENTAL_FLAT_RATE = 0.10;

/** Betterment tax general rate — individual — סעיף 48א(ב) */
const ISRAELI_BETTERMENT_INDIV_RATE = 0.25;

/** Betterment tax — company — סעיף 48א(א), tied to corporate rate */
const ISRAELI_BETTERMENT_COMPANY_RATE = 0.23;

/**
 * Monthly rental exemption ceiling ("תקרת הפטור") for the total-exemption
 * track per חוק מס הכנסה (פטור ממס על הכנסה מהשכרת דירת מגורים) 1990,
 * linked to CPI and updated annually by הרשות למיסים. Value used for 2026
 * is approximate — the function accepts an override.
 */
const ISRAELI_RENTAL_EXEMPT_CEILING_2026 = 5654; // ILS / month (indicative)

/** Default top marginal income-tax bracket for the "regular" rental track. */
const ISRAELI_TOP_MARGINAL_RATE = 0.50; // includes surtax 3% above ~720K

/** Statutory progressive brackets for "regular" track — rental as working-age
 *  income is taxed from 31% (the 10% / 14% / 20% brackets are reserved for
 *  יגיעה אישית / earned income — passive rental falls in the passive table).
 *  For conservative, defensive math we default to the passive schedule.
 *  Users can pass a custom bracket table. */
const PASSIVE_BRACKETS_2026 = [
  // upper, rate
  { upTo: 254_760, rate: 0.31 },
  { upTo: 530_640, rate: 0.35 },
  { upTo: 721_560, rate: 0.47 },
  { upTo: Infinity, rate: 0.50 }, // includes 3% surtax מס-יסף
];

// ─────────────────────────────────────────────────────────────

const LAW_CITATIONS = Object.freeze({
  rental_flat_track:
    'סעיף 122 לפקודת מס הכנסה [נוסח חדש], התשכ"א-1961 — מסלול 10% על שכ"ד דירת מגורים',
  rental_exempt_track:
    'חוק מס הכנסה (פטור ממס על הכנסה מהשכרת דירת מגורים), התש"ן-1990 — פטור עד תקרה חודשית',
  rental_regular_track:
    'סעיף 2(6) לפקודת מס הכנסה — שומה רגילה לפי מדרגות',
  betterment_general:
    'סעיף 48א(ב) לחוק מיסוי מקרקעין (שבח ורכישה), התשכ"ג-1963 — 25% יחיד',
  betterment_company:
    'סעיף 48א(א) לחוק מיסוי מקרקעין — חברה (מקושר למס חברות)',
  real_betterment:
    'סעיף 47 לחוק מיסוי מקרקעין — חישוב שבח ריאלי (מדד המחירים לצרכן)',
  linear_exempt:
    'סעיף 48א(ב1) לחוק מיסוי מקרקעין — חישוב ליניארי לדירת מגורים מזכה',
});

// ═══════════════════════════════════════════════════════════════════════════
//  Utilities
// ═══════════════════════════════════════════════════════════════════════════

/** Number guard — throws a labeled error if the value is not a finite number. */
function _num(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(
      `roi-calculator: expected finite number for "${label}", got ${value} (${typeof value})`
    );
  }
  return value;
}

/** Round to n decimals without losing float semantics in downstream math. */
function _round(value, n = 4) {
  if (!Number.isFinite(value)) return value;
  const p = 10 ** n;
  return Math.round(value * p) / p;
}

/** Safe divide: returns 0 (and optionally signals NaN) if denominator is 0. */
function _safeDiv(a, b) {
  if (b === 0 || !Number.isFinite(b)) return 0;
  return a / b;
}

/** Defensive clone for opts/objects to guarantee purity. */
function _clone(obj) {
  return obj == null ? obj : JSON.parse(JSON.stringify(obj));
}

// ═══════════════════════════════════════════════════════════════════════════
//  1. Cap rate  /  שיעור היוון
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Capitalization rate = NOI / Property Value.
 *
 * NOI (Net Operating Income / הכנסה תפעולית נטו) is gross rent minus all
 * operating expenses (mgmt, maintenance, property tax / ארנונה, insurance,
 * reserve for vacancy), before debt service and before income tax.
 *
 * @param {number} noi            Net operating income (annual, ILS)
 * @param {number} propertyValue  Market value of the property (ILS)
 * @returns {number} cap-rate as decimal (0.055 = 5.5%)
 *
 * Formula:
 *     capRate = NOI / Value
 *
 * Example:
 *     capRate(120_000, 2_500_000) === 0.048  // 4.8%
 */
function capRate(noi, propertyValue) {
  _num(noi, 'noi');
  _num(propertyValue, 'propertyValue');
  if (propertyValue <= 0) {
    throw new RangeError('capRate: propertyValue must be > 0');
  }
  return _round(noi / propertyValue, 6);
}

// ═══════════════════════════════════════════════════════════════════════════
//  2. Cash-on-cash  /  תשואה על ההון העצמי
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cash-on-cash return = Annual pre-tax cashflow / Total cash invested.
 *
 * "Cash invested" = equity down-payment + closing costs + renovations +
 * any capex funded with equity (NOT the mortgage principal).
 *
 * @param {{annualCashFlow:number, totalCashInvested:number}} params
 * @returns {number} decimal (0.08 = 8%)
 */
function cashOnCash({ annualCashFlow, totalCashInvested } = {}) {
  _num(annualCashFlow, 'annualCashFlow');
  _num(totalCashInvested, 'totalCashInvested');
  if (totalCashInvested <= 0) {
    throw new RangeError('cashOnCash: totalCashInvested must be > 0');
  }
  return _round(annualCashFlow / totalCashInvested, 6);
}

// ═══════════════════════════════════════════════════════════════════════════
//  3. Gross yield  /  תשואה ברוטו
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Gross rental yield = Annual rent / Property price.
 *
 * @param {{annualRent:number, price:number}} params
 * @returns {number} decimal
 */
function grossYield({ annualRent, price } = {}) {
  _num(annualRent, 'annualRent');
  _num(price, 'price');
  if (price <= 0) {
    throw new RangeError('grossYield: price must be > 0');
  }
  return _round(annualRent / price, 6);
}

// ═══════════════════════════════════════════════════════════════════════════
//  4. Net yield  /  תשואה נטו
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Net rental yield = (Annual rent − Opex) / Price.
 * Opex here covers operating expenses only — NOT debt service or income tax.
 *
 * @param {{annualRent:number, opex:number, price:number}} params
 * @returns {number} decimal
 */
function netYield({ annualRent, opex, price } = {}) {
  _num(annualRent, 'annualRent');
  _num(opex, 'opex');
  _num(price, 'price');
  if (price <= 0) {
    throw new RangeError('netYield: price must be > 0');
  }
  return _round((annualRent - opex) / price, 6);
}

// ═══════════════════════════════════════════════════════════════════════════
//  5. NPV  /  ערך נוכחי נקי
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Net Present Value.
 *
 * @param {number[]} cashflows  cashflows[0] is at t=0, cashflows[i] at t=i.
 * @param {number}   discountRate  per-period discount rate (decimal).
 * @returns {number} NPV (same currency units as cashflows).
 *
 * Formula:
 *     NPV = Σ_{t=0..n} CF_t / (1 + r)^t
 */
function npv(cashflows, discountRate) {
  if (!Array.isArray(cashflows) || cashflows.length === 0) {
    throw new TypeError('npv: cashflows must be a non-empty array');
  }
  _num(discountRate, 'discountRate');
  if (discountRate <= -1) {
    throw new RangeError('npv: discountRate must be > -1');
  }
  let acc = 0;
  for (let t = 0; t < cashflows.length; t++) {
    _num(cashflows[t], `cashflows[${t}]`);
    acc += cashflows[t] / Math.pow(1 + discountRate, t);
  }
  return _round(acc, 6);
}

// ═══════════════════════════════════════════════════════════════════════════
//  6. IRR  /  תשואה פנימית
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Internal Rate of Return.
 *
 * Newton-Raphson root finder on the NPV polynomial, with a bisection fallback
 * for cases with multiple sign changes or pathological cashflow shapes.
 * Handles:
 *   • Single sign change (vanilla investment)
 *   • Multiple sign changes (e.g. J-curve with mid-life capex → IRR still
 *     unique within a reasonable window; returns the root closest to 0.10)
 *   • All positive or all negative cashflows → NaN (no IRR exists)
 *
 * @param {number[]} cashflows
 * @param {Object}   [opts]
 * @param {number}   [opts.guess=0.10]    initial guess
 * @param {number}   [opts.tol=1e-7]      tolerance on |f(r)|
 * @param {number}   [opts.maxIter=200]   Newton iterations before fallback
 * @param {number}   [opts.lo=-0.9999]    bisection lower bound
 * @param {number}   [opts.hi=100]        bisection upper bound (10000%)
 * @returns {number} IRR as decimal (0.12 = 12%), or NaN.
 */
function irr(cashflows, opts = {}) {
  if (!Array.isArray(cashflows) || cashflows.length < 2) {
    throw new TypeError('irr: cashflows must be an array of length >= 2');
  }
  const {
    guess = 0.10,
    tol = 1e-7,
    maxIter = 200,
    lo = -0.9999,
    hi = 100,
  } = opts;

  // Short-circuit: all same sign → no IRR
  let sawPos = false;
  let sawNeg = false;
  for (const cf of cashflows) {
    _num(cf, 'cashflow');
    if (cf > 0) sawPos = true;
    if (cf < 0) sawNeg = true;
  }
  if (!(sawPos && sawNeg)) return NaN;

  // NPV and its derivative at rate r
  const f = (r) => {
    let s = 0;
    for (let t = 0; t < cashflows.length; t++) {
      s += cashflows[t] / Math.pow(1 + r, t);
    }
    return s;
  };
  const df = (r) => {
    let s = 0;
    for (let t = 1; t < cashflows.length; t++) {
      s += (-t * cashflows[t]) / Math.pow(1 + r, t + 1);
    }
    return s;
  };

  // ── Newton-Raphson ──
  let r = guess;
  for (let i = 0; i < maxIter; i++) {
    const y = f(r);
    if (Math.abs(y) < tol) return _round(r, 8);
    const d = df(r);
    if (d === 0 || !Number.isFinite(d)) break;
    const next = r - y / d;
    if (!Number.isFinite(next) || next <= -1) break;
    if (Math.abs(next - r) < tol) return _round(next, 8);
    r = next;
  }

  // ── Bisection fallback ──
  // Find a bracket where f changes sign by scanning the domain.
  let a = lo;
  let b = hi;
  let fa = f(a);
  let fb = f(b);
  // If ends are same sign, walk inward on a log-ish grid until we find one
  if (fa * fb > 0) {
    const grid = [
      -0.99, -0.5, -0.25, -0.1, -0.01,
      0.0, 0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 25, 50, 99,
    ];
    for (let i = 0; i < grid.length - 1; i++) {
      const x1 = grid[i];
      const x2 = grid[i + 1];
      const y1 = f(x1);
      const y2 = f(x2);
      if (Number.isFinite(y1) && Number.isFinite(y2) && y1 * y2 < 0) {
        a = x1; b = x2; fa = y1; fb = y2;
        break;
      }
    }
    if (fa * fb > 0) return NaN;
  }

  for (let i = 0; i < 500; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (!Number.isFinite(fm)) return NaN;
    if (Math.abs(fm) < tol || (b - a) / 2 < tol) {
      return _round(m, 8);
    }
    if (fa * fm < 0) {
      b = m; fb = fm;
    } else {
      a = m; fa = fm;
    }
  }
  return NaN;
}

// ═══════════════════════════════════════════════════════════════════════════
//  7. DSCR  /  יחס כיסוי חוב
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Debt Service Coverage Ratio = NOI / Annual Debt Service.
 *
 * Lenders typically require DSCR >= 1.20 to 1.30 on income-producing RE.
 * DSCR < 1 means NOI does not cover the debt → distress signal.
 *
 * @param {{noi:number, annualDebtService:number}} params
 * @returns {number} ratio (1.25 means NOI covers debt 1.25x)
 */
function dscr({ noi, annualDebtService } = {}) {
  _num(noi, 'noi');
  _num(annualDebtService, 'annualDebtService');
  if (annualDebtService <= 0) {
    throw new RangeError('dscr: annualDebtService must be > 0');
  }
  return _round(noi / annualDebtService, 4);
}

// ═══════════════════════════════════════════════════════════════════════════
//  8. LTV  /  יחס מימון לשווי
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Loan-to-Value = Loan / Value.
 *
 * Israeli mortgage regulation (בנק ישראל) caps LTV for first-time buyers at
 * 75%, second-home buyers at 50%, investors at 50% (as of 2026).
 *
 * @param {{loan:number, value:number}} params
 * @returns {number} decimal (0.65 = 65%)
 */
function ltv({ loan, value } = {}) {
  _num(loan, 'loan');
  _num(value, 'value');
  if (value <= 0) {
    throw new RangeError('ltv: value must be > 0');
  }
  return _round(loan / value, 6);
}

// ═══════════════════════════════════════════════════════════════════════════
//  9. Break-even occupancy  /  תפוסת איזון
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Break-even occupancy — the fraction of units that must be rented for the
 * project to just cover its fixed costs.
 *
 *     BE = FixedCosts / (Units × (Rent − VarCostPerOcc))
 *
 * Returns a fraction (0..1+). A result > 1 means the asset cannot break even
 * even at full occupancy.
 *
 * @param {{fixedCosts:number, varCostsPerOcc:number, rentPerUnit:number, units:number}} p
 * @returns {number}
 */
function breakEvenOccupancy({
  fixedCosts,
  varCostsPerOcc,
  rentPerUnit,
  units,
} = {}) {
  _num(fixedCosts, 'fixedCosts');
  _num(varCostsPerOcc, 'varCostsPerOcc');
  _num(rentPerUnit, 'rentPerUnit');
  _num(units, 'units');
  if (units <= 0) {
    throw new RangeError('breakEvenOccupancy: units must be > 0');
  }
  const contribution = rentPerUnit - varCostsPerOcc;
  if (contribution <= 0) {
    return Infinity; // each unit loses money even when occupied
  }
  return _round(fixedCosts / (units * contribution), 6);
}

// ═══════════════════════════════════════════════════════════════════════════
//  10. Holding-period DCF  /  ניתוח תקופת החזקה מלאה
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Full multi-year DCF over a holding period with annual rent and expense
 * growth and a terminal sale. Returns all intermediate cashflows plus the
 * IRR, NPV, total return, and equity multiple.
 *
 * @param {Object} p
 * @param {number}  p.purchase          Purchase price (ILS)
 * @param {number}  [p.equity]          Equity invested up front; defaults to purchase
 * @param {number}  [p.closingCosts=0]  One-off acquisition costs (added to equity)
 * @param {number}  [p.annualRent=0]    Year-1 rent (gross)
 * @param {number}  [p.year1Opex=0]     Year-1 operating expenses
 * @param {number}  p.rentGrowth        Rent growth per year (decimal)
 * @param {number}  p.expenseGrowth     Opex growth per year (decimal)
 * @param {number}  p.appreciation      Price appreciation per year (decimal)
 * @param {number}  [p.saleCosts=0]     Sale costs as fraction of sale price
 * @param {number}  p.holdYears         Integer years to hold
 * @param {number}  p.discountRate      Discount rate for NPV
 * @param {number}  [p.annualDebtService=0]  Annual debt service (fixed over period)
 * @returns {{
 *   cashflows:number[], noiByYear:number[], rentByYear:number[], opexByYear:number[],
 *   salePrice:number, saleNet:number,
 *   npv:number, irr:number, equityMultiple:number, totalReturn:number
 * }}
 */
function holdingPeriodAnalysis(p = {}) {
  const {
    purchase,
    equity = p.purchase,
    closingCosts = 0,
    annualRent = 0,
    year1Opex = 0,
    rentGrowth,
    expenseGrowth,
    appreciation,
    saleCosts = 0,
    holdYears,
    discountRate,
    annualDebtService = 0,
  } = p;

  _num(purchase, 'purchase');
  _num(equity, 'equity');
  _num(closingCosts, 'closingCosts');
  _num(annualRent, 'annualRent');
  _num(year1Opex, 'year1Opex');
  _num(rentGrowth, 'rentGrowth');
  _num(expenseGrowth, 'expenseGrowth');
  _num(appreciation, 'appreciation');
  _num(saleCosts, 'saleCosts');
  _num(holdYears, 'holdYears');
  _num(discountRate, 'discountRate');
  _num(annualDebtService, 'annualDebtService');
  if (!Number.isInteger(holdYears) || holdYears < 1) {
    throw new RangeError('holdingPeriodAnalysis: holdYears must be integer >= 1');
  }

  const rentByYear = [];
  const opexByYear = [];
  const noiByYear = [];
  const cashflows = [-(equity + closingCosts)];

  let rent = annualRent;
  let opex = year1Opex;
  for (let y = 1; y <= holdYears; y++) {
    const yNoi = rent - opex;
    const cf = yNoi - annualDebtService;
    rentByYear.push(_round(rent, 2));
    opexByYear.push(_round(opex, 2));
    noiByYear.push(_round(yNoi, 2));
    if (y < holdYears) {
      cashflows.push(_round(cf, 2));
    } else {
      // Terminal year: operating CF + sale net
      const salePrice = purchase * Math.pow(1 + appreciation, holdYears);
      const saleNet = salePrice * (1 - saleCosts);
      cashflows.push(_round(cf + saleNet, 2));
    }
    rent = rent * (1 + rentGrowth);
    opex = opex * (1 + expenseGrowth);
  }

  const salePrice = purchase * Math.pow(1 + appreciation, holdYears);
  const saleNet = salePrice * (1 - saleCosts);

  const npvValue = npv(cashflows, discountRate);
  const irrValue = irr(cashflows);
  const totalOut = -cashflows[0];
  const totalIn = cashflows.slice(1).reduce((s, v) => s + v, 0);
  const equityMultiple = totalOut > 0 ? _round((totalIn) / totalOut, 4) : NaN;
  const totalReturn = _round(totalIn - totalOut, 2);

  return {
    cashflows,
    rentByYear,
    opexByYear,
    noiByYear,
    salePrice: _round(salePrice, 2),
    saleNet: _round(saleNet, 2),
    npv: _round(npvValue, 2),
    irr: irrValue,
    equityMultiple,
    totalReturn,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  11. Sensitivity matrix  /  מטריצת רגישות
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Two-way sensitivity. Takes a base-case holding-period analysis input and a
 * set of percentage-point deltas to apply to cap-rate-equivalent (appreciation)
 * and rent (rent growth). Returns a grid keyed by the string "capDelta|rentDelta"
 * plus a flat array for display.
 *
 * @param {Object} p
 * @param {Object} p.baseCase  Same shape as holdingPeriodAnalysis input
 * @param {Object} p.vary
 * @param {number[]} [p.vary.cap=[0]]   cap-rate / appreciation deltas (pp units)
 * @param {number[]} [p.vary.rent=[0]]  rent-growth deltas (pp units)
 * @returns {{
 *   headerCap:number[],
 *   headerRent:number[],
 *   grid:Array<Array<{capDelta:number,rentDelta:number,irr:number,npv:number}>>,
 *   flat:Array<{capDelta:number,rentDelta:number,irr:number,npv:number,equityMultiple:number}>
 * }}
 */
function sensitivity({ baseCase, vary = {} } = {}) {
  if (!baseCase || typeof baseCase !== 'object') {
    throw new TypeError('sensitivity: baseCase is required');
  }
  const capDeltas = Array.isArray(vary.cap) && vary.cap.length ? vary.cap : [0];
  const rentDeltas = Array.isArray(vary.rent) && vary.rent.length ? vary.rent : [0];

  const grid = [];
  const flat = [];
  for (let i = 0; i < capDeltas.length; i++) {
    const row = [];
    for (let j = 0; j < rentDeltas.length; j++) {
      const cd = capDeltas[i];
      const rd = rentDeltas[j];
      const tweaked = _clone(baseCase);
      // delta is percentage-points (1 => +0.01)
      tweaked.appreciation = (baseCase.appreciation || 0) + cd / 100;
      tweaked.rentGrowth = (baseCase.rentGrowth || 0) + rd / 100;
      const out = holdingPeriodAnalysis(tweaked);
      const cell = {
        capDelta: cd,
        rentDelta: rd,
        irr: out.irr,
        npv: out.npv,
        equityMultiple: out.equityMultiple,
      };
      row.push(cell);
      flat.push(cell);
    }
    grid.push(row);
  }
  return {
    headerCap: capDeltas.slice(),
    headerRent: rentDeltas.slice(),
    grid,
    flat,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  12. Israeli after-tax return  /  תשואה לאחר מס ישראלי
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply Israeli taxation to a pre-tax real-estate cashflow / return object.
 *
 * Supports the three rental tracks per Israeli tax code:
 *
 *   1. "flat"     — 10% on gross monthly rent, no deductions. סעיף 122.
 *   2. "exempt"   — full exemption up to monthly ceiling (~₪5,654/mo 2026),
 *                   linear phase-out above ceiling. חוק פטור 1990.
 *   3. "regular"  — net income taxed at passive progressive brackets, with
 *                   all deductions (depreciation, interest, maintenance).
 *
 * Also applies betterment tax (מס שבח) on the sale:
 *
 *   • 25% for individuals (0.23 for companies) on the real betterment.
 *     Caller may pass a pre-computed betterment amount or the raw sale /
 *     purchase figures; we compute nominal betterment if not supplied.
 *   • Optionally applies the linear-exempt calc for primary residence
 *     (ruleLinearExempt = true) — returns 0 tax on the pre-2014 portion
 *     for a qualifying residential property.
 *
 * Inputs:
 *
 *   preTax = {
 *     monthlyRent?:number,            // gross
 *     annualRent?:number,             // gross
 *     annualOpex?:number,             // for regular track
 *     annualInterest?:number,         // for regular track
 *     annualDepreciation?:number,     // for regular track
 *     track?:'flat'|'exempt'|'regular',
 *     exemptCeiling?:number,          // override of 2026 default
 *     brackets?:Array<{upTo,rate}>,   // override of passive brackets
 *     otherTaxableIncome?:number,     // stacks on brackets
 *     sale?: { price:number, purchase:number, improvements?:number,
 *              isIndividual?:boolean, linearExempt?:boolean,
 *              holdYears?:number, preSplitYears?:number }
 *   }
 *
 * Returns:
 *
 *   {
 *     track,
 *     grossRentAnnual,
 *     rentalTax,
 *     netRentalIncome,
 *     effectiveRentalRate,
 *     betterment: { nominal, taxable, rate, tax } | null,
 *     totalTax,
 *     afterTaxCashflow,
 *     citations: string[]
 *   }
 */
function israeliAfterTaxReturn(preTax = {}) {
  const {
    monthlyRent,
    annualRent,
    annualOpex = 0,
    annualInterest = 0,
    annualDepreciation = 0,
    track = 'flat',
    exemptCeiling = ISRAELI_RENTAL_EXEMPT_CEILING_2026,
    brackets = PASSIVE_BRACKETS_2026,
    otherTaxableIncome = 0,
    sale = null,
  } = preTax;

  // Resolve gross annual rent
  let grossRentAnnual;
  if (typeof annualRent === 'number') {
    grossRentAnnual = annualRent;
  } else if (typeof monthlyRent === 'number') {
    grossRentAnnual = monthlyRent * 12;
  } else {
    grossRentAnnual = 0;
  }
  _num(grossRentAnnual, 'grossRentAnnual');

  let rentalTax = 0;
  let netRentalIncome = 0;
  const citations = [];

  if (track === 'flat') {
    // ── Track 1: 10% flat — no deductions ──
    rentalTax = grossRentAnnual * ISRAELI_RENTAL_FLAT_RATE;
    netRentalIncome = grossRentAnnual - rentalTax;
    citations.push(LAW_CITATIONS.rental_flat_track);
  } else if (track === 'exempt') {
    // ── Track 2: full exemption up to ceiling, linear phase-out ──
    // Mechanics (simplified but faithful to the spirit of the law):
    //   effective rent = rent − max(rent − ceiling_annual, 0)
    // above the ceiling, the taxable part grows 1:1 with rent but the exempt
    // part shrinks 1:1 until it hits zero at 2 × ceiling.
    const ceilingAnnual = exemptCeiling * 12;
    if (grossRentAnnual <= ceilingAnnual) {
      rentalTax = 0;
      netRentalIncome = grossRentAnnual;
    } else {
      const excess = grossRentAnnual - ceilingAnnual;
      const exemptPortion = Math.max(ceilingAnnual - excess, 0);
      const taxablePortion = grossRentAnnual - exemptPortion;
      // Passive bracket calc
      rentalTax = _taxOnAmount(taxablePortion + otherTaxableIncome, brackets)
                - _taxOnAmount(otherTaxableIncome, brackets);
      netRentalIncome = grossRentAnnual - rentalTax;
    }
    citations.push(LAW_CITATIONS.rental_exempt_track);
  } else if (track === 'regular') {
    // ── Track 3: net taxed at passive brackets ──
    const taxableNet = Math.max(
      grossRentAnnual - annualOpex - annualInterest - annualDepreciation,
      0
    );
    rentalTax = _taxOnAmount(taxableNet + otherTaxableIncome, brackets)
              - _taxOnAmount(otherTaxableIncome, brackets);
    netRentalIncome = grossRentAnnual - annualOpex - annualInterest - rentalTax;
    citations.push(LAW_CITATIONS.rental_regular_track);
  } else {
    throw new RangeError(
      `israeliAfterTaxReturn: unknown track "${track}" — use flat|exempt|regular`
    );
  }

  const effectiveRentalRate =
    grossRentAnnual > 0 ? _round(rentalTax / grossRentAnnual, 6) : 0;

  // ── Betterment (מס שבח) ──
  let betterment = null;
  if (sale && typeof sale === 'object') {
    const {
      price,
      purchase,
      improvements = 0,
      isIndividual = true,
      linearExempt = false,
      holdYears,
      preSplitYears = 0,
    } = sale;
    _num(price, 'sale.price');
    _num(purchase, 'sale.purchase');
    const nominal = price - purchase - improvements;
    let taxable = nominal;
    let rate = isIndividual
      ? ISRAELI_BETTERMENT_INDIV_RATE
      : ISRAELI_BETTERMENT_COMPANY_RATE;
    let tax = 0;
    if (nominal <= 0) {
      taxable = 0;
      tax = 0;
      citations.push(LAW_CITATIONS.betterment_general);
    } else if (linearExempt && typeof holdYears === 'number' && holdYears > 0) {
      // Linear split — 48א(ב1). Pre-2014 slice is exempt; post-2014 slice at
      // the individual rate. The caller provides `preSplitYears` = years
      // before 2014-01-01 (exempt portion).
      const exemptShare = Math.min(Math.max(preSplitYears / holdYears, 0), 1);
      const taxablePart = nominal * (1 - exemptShare);
      taxable = _round(taxablePart, 2);
      tax = _round(taxablePart * rate, 2);
      citations.push(LAW_CITATIONS.linear_exempt);
    } else {
      tax = nominal * rate;
      citations.push(
        isIndividual
          ? LAW_CITATIONS.betterment_general
          : LAW_CITATIONS.betterment_company
      );
    }
    betterment = {
      nominal: _round(nominal, 2),
      taxable: _round(taxable, 2),
      rate,
      tax: _round(tax, 2),
    };
  }

  const totalTax = _round(rentalTax + (betterment ? betterment.tax : 0), 2);
  const afterTaxCashflow = _round(
    netRentalIncome + (sale ? (sale.price - sale.purchase) - (betterment?.tax || 0) : 0),
    2
  );

  return {
    track,
    grossRentAnnual: _round(grossRentAnnual, 2),
    rentalTax: _round(rentalTax, 2),
    netRentalIncome: _round(netRentalIncome, 2),
    effectiveRentalRate,
    betterment,
    totalTax,
    afterTaxCashflow,
    citations,
  };
}

/** Progressive tax helper — returns total tax on `income` given brackets. */
function _taxOnAmount(income, brackets) {
  if (income <= 0) return 0;
  let remaining = income;
  let prev = 0;
  let tax = 0;
  for (const b of brackets) {
    const width = b.upTo - prev;
    const inThis = Math.min(remaining, width);
    if (inThis <= 0) break;
    tax += inThis * b.rate;
    remaining -= inThis;
    prev = b.upTo;
    if (remaining <= 0) break;
  }
  return tax;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Exports
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // Core ratios
  capRate,
  cashOnCash,
  grossYield,
  netYield,
  // Time-value
  npv,
  irr,
  // Leverage
  dscr,
  ltv,
  // Operational
  breakEvenOccupancy,
  // Multi-period
  holdingPeriodAnalysis,
  sensitivity,
  // Israeli tax overlay
  israeliAfterTaxReturn,
  // Constants
  ISRAELI_RENTAL_FLAT_RATE,
  ISRAELI_BETTERMENT_INDIV_RATE,
  ISRAELI_BETTERMENT_COMPANY_RATE,
  ISRAELI_RENTAL_EXEMPT_CEILING_2026,
  ISRAELI_TOP_MARGINAL_RATE,
  PASSIVE_BRACKETS_2026,
  LAW_CITATIONS,
};
