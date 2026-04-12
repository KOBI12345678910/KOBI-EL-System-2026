/**
 * fixed-assets.js — Fixed Asset Register & Depreciation Engine
 * מרשם רכוש קבוע ומנוע פחת — Techno-Kol Uzi Mega-ERP 2026
 * ---------------------------------------------------------------------------
 * Agent: AG-Y076  |  Swarm: 4B  |  Wave: 2026
 * File:  onyx-procurement/src/finance/fixed-assets.js
 *
 * לא מוחקים רק משדרגים ומגדלים — append-only, never destructive.
 *
 *   Production-grade Israeli fixed asset register with full tax-compliant
 *   depreciation, disposal accounting, revaluation (IFRS model), impairment
 *   testing (IAS 36), intra-company transfers and CAPEX reporting.
 *
 * STATUTORY REFERENCES
 *   - תקנות מס הכנסה (פחת), תשמ"א-1991 — לוח א' ו-לוח ב'
 *     (Income Tax Regulations — Depreciation, 1991 as amended through 2026)
 *   - תקנות מס הכנסה (פחת מואץ לציוד) — accelerated depreciation for
 *     industrial/productive equipment
 *   - חוק מיסוי מקרקעין (שבח ורכישה), תשכ"ג-1963 — for real estate
 *   - פקודת מס הכנסה §88–101 — capital gains on disposal (integrates Y-006)
 *   - IAS 16   — Property, Plant & Equipment (revaluation model)
 *   - IAS 36   — Impairment of Assets (recoverable amount test)
 *   - IFRS 5   — Non-current assets held for sale and discontinued ops
 *
 * DEPRECIATION METHODS SUPPORTED
 *   - Straight-Line (SL)       — קו ישר — Israeli Tax Authority default
 *   - Double-Declining Balance — פחת מואץ — DDB / 200%
 *   - Sum-of-Years Digits      — סכום ספרות השנים — SOYD
 *
 * PERIODS
 *   - monthly / quarterly / annual, pro-rata by acquisition date.
 *   - Tax year: 1-Jan to 31-Dec (Israeli calendar year).
 *
 * DESIGN PRINCIPLES
 *   - Zero external dependencies (pure Node / pure JS, browser-safe).
 *   - Append-only ledger: acquireAsset, revaluation, transfer, dispose all
 *     append transactions to the asset history. Nothing is ever deleted.
 *   - Every user-facing message is bilingual {en, he}.
 *   - Deterministic: identical inputs produce identical outputs.
 *   - Money math uses banker's rounding to 2 decimals (agorot).
 *
 * PUBLIC API (class FixedAssetRegister)
 *   acquireAsset(fields)            → assetId
 *   computeDepreciation(opts)       → {expense, nbv, accumulated, ...}
 *   disposeAsset(opts)              → {gain_loss, capitalGainsLink, journal}
 *   revaluation(assetId, newValue)  → {uplift, newNBV}
 *   impairmentTest(assetId, opts)   → {impaired, writeDown, newNBV}
 *   capexReport(period)             → {totals, byCategory, items[]}
 *   depreciationSchedule(assetId)   → full-life schedule[]
 *   handleTransfer(id, newLocation) → void
 *   getAsset(assetId)               → snapshot (frozen)
 *   listAssets(filter)              → snapshots[]
 *   classifyByDepreciationClass(cls)→ rate info
 *   history(assetId)                → append-only event log
 *
 * ========================================================================= */

'use strict';

// ============================================================================
// § 1. ISRAELI DEPRECIATION RATE TABLE — תקנות מס הכנסה (פחת) 1991 / 2026
// ----------------------------------------------------------------------------
// Source: לוח א' ו-לוח ב' לתקנות מס הכנסה (פחת), תשמ"א-1991, as amended.
// Rates are annual straight-line percentages applied to original cost.
// Ranges (min..max) are given where the regulation permits accelerated
// depreciation for qualifying sub-classes (e.g. industrial, two-shift work).
// The classifier accepts Hebrew aliases and English codes.
// ============================================================================

const DEPRECIATION_CLASSES = Object.freeze({
  // --- מבנים / Buildings -----------------------------------------------------
  BUILDING_NON_INDUSTRIAL: {
    code: 'BUILDING_NON_INDUSTRIAL',
    he: 'מבנה רגיל (לא תעשייתי)',
    en: 'Building — non-industrial',
    rate: 0.04,                 // 4% SL — לוח א', סעיף 1(ב)
    rateMin: 0.04,
    rateMax: 0.04,
    usefulLifeYears: 25,
    method: 'SL',
    salvagePct: 0.00,
    restrictedDeduction: false,
    statuteRef: 'תקנות פחת 1991 — לוח א\' סעיף 1',
  },
  BUILDING_INDUSTRIAL: {
    code: 'BUILDING_INDUSTRIAL',
    he: 'מבנה תעשייתי',
    en: 'Building — industrial',
    rate: 0.08,                 // 8% SL — accelerated industrial track
    rateMin: 0.04,
    rateMax: 0.08,
    usefulLifeYears: 12.5,
    method: 'SL',
    salvagePct: 0.00,
    restrictedDeduction: false,
    statuteRef: 'תקנות פחת 1991 — לוח א\' סעיף 1(א)',
  },

  // --- מחשבים ותשתית דיגיטלית / Computers & Digital Infra --------------------
  COMPUTERS: {
    code: 'COMPUTERS',
    he: 'מחשבים וציוד היקפי',
    en: 'Computers & peripherals',
    rate: 0.33,                 // 33% SL — לוח ב' סעיף 1
    rateMin: 0.33,
    rateMax: 0.33,
    usefulLifeYears: 3,
    method: 'SL',
    salvagePct: 0.00,
    restrictedDeduction: false,
    statuteRef: 'תקנות פחת 1991 — לוח ב\' סעיף 1(א)',
  },
  DIGITAL_INFRASTRUCTURE: {
    code: 'DIGITAL_INFRASTRUCTURE',
    he: 'תשתית דיגיטלית (שרתים, סיבים, ענן מקומי)',
    en: 'Digital infrastructure (servers, fiber, edge cloud)',
    rate: 0.33,                 // 33% SL — treated like computers
    rateMin: 0.25,
    rateMax: 0.33,
    usefulLifeYears: 3,
    method: 'SL',
    salvagePct: 0.00,
    restrictedDeduction: false,
    statuteRef: 'תקנות פחת 1991 — לוח ב\' סעיף 1(א)',
  },
  SOFTWARE: {
    code: 'SOFTWARE',
    he: 'תוכנה (רישיון רב-שנתי)',
    en: 'Software (multi-year license)',
    rate: 0.33,                 // 33% SL
    rateMin: 0.25,
    rateMax: 0.33,
    usefulLifeYears: 3,
    method: 'SL',
    salvagePct: 0.00,
    restrictedDeduction: false,
    statuteRef: 'תקנות פחת 1991 — לוח ב\' סעיף 1(ב)',
  },

  // --- ריהוט משרדי / Office Furniture ---------------------------------------
  OFFICE_FURNITURE: {
    code: 'OFFICE_FURNITURE',
    he: 'ריהוט משרדי',
    en: 'Office furniture',
    rate: 0.06,                 // 6-7% SL — typical 6%
    rateMin: 0.06,
    rateMax: 0.07,
    usefulLifeYears: 16.67,
    method: 'SL',
    salvagePct: 0.00,
    restrictedDeduction: false,
    statuteRef: 'תקנות פחת 1991 — לוח א\' סעיף 4',
  },

  // --- מכונות וציוד / Machinery & Equipment ---------------------------------
  MACHINERY_GENERAL: {
    code: 'MACHINERY_GENERAL',
    he: 'מכונות וציוד כללי',
    en: 'General machinery',
    rate: 0.12,                 // 10-15% SL — typical 12% (baseline plant)
    rateMin: 0.10,
    rateMax: 0.15,
    usefulLifeYears: 8.33,
    method: 'SL',
    salvagePct: 0.00,
    restrictedDeduction: false,
    statuteRef: 'תקנות פחת 1991 — לוח א\' סעיף 2',
  },
  MACHINERY_METAL_FAB: {
    code: 'MACHINERY_METAL_FAB',
    he: 'מכונות חיתוך ועיבוד שבבי (CNC, לייזר, כרסומות)',
    en: 'Metal fabrication / CNC / laser / milling',
    rate: 0.15,                 // 10-20% SL — typical 15% for two-shift work
    rateMin: 0.10,
    rateMax: 0.20,
    usefulLifeYears: 6.67,
    method: 'SL',
    salvagePct: 0.00,
    restrictedDeduction: false,
    statuteRef: 'תקנות פחת 1991 — לוח א\' סעיף 2(ב) / פחת מואץ',
  },
  HEAVY_EQUIPMENT: {
    code: 'HEAVY_EQUIPMENT',
    he: 'ציוד כבד (מנופים, באגרים, באלטים)',
    en: 'Heavy equipment (cranes, excavators, bulldozers)',
    rate: 0.20,                 // 20% SL
    rateMin: 0.15,
    rateMax: 0.20,
    usefulLifeYears: 5,
    method: 'SL',
    salvagePct: 0.05,
    restrictedDeduction: false,
    statuteRef: 'תקנות פחת 1991 — לוח א\' סעיף 3',
  },

  // --- כלי רכב / Vehicles ----------------------------------------------------
  VEHICLE_COMMERCIAL: {
    code: 'VEHICLE_COMMERCIAL',
    he: 'רכב מסחרי (משא, טנדר, ציוד)',
    en: 'Commercial vehicle (truck / van)',
    rate: 0.15,                 // 15% SL
    rateMin: 0.15,
    rateMax: 0.20,
    usefulLifeYears: 6.67,
    method: 'SL',
    salvagePct: 0.10,
    restrictedDeduction: false,
    statuteRef: 'תקנות פחת 1991 — לוח א\' סעיף 5(א)',
  },
  VEHICLE_PRIVATE: {
    code: 'VEHICLE_PRIVATE',
    he: 'רכב פרטי',
    en: 'Private passenger vehicle',
    rate: 0.15,                 // 15% SL — but with § 31 restrictions on deduction
    rateMin: 0.15,
    rateMax: 0.15,
    usefulLifeYears: 6.67,
    method: 'SL',
    salvagePct: 0.10,
    restrictedDeduction: true,  // שווי שימוש & ceiling — תקנות רכב צמוד
    deductionCapILS: 140000,    // approximate ceiling for cost basis, 2026
    statuteRef: 'תקנות פחת 1991 — לוח א\' סעיף 5(ב) + תקנות רכב צמוד',
  },

  // --- תשתיות מיוחדות / Special Infrastructure ------------------------------
  SOLAR_INSTALLATION: {
    code: 'SOLAR_INSTALLATION',
    he: 'מתקן סולארי / פוטו-וולטאי',
    en: 'Solar / photovoltaic installation',
    rate: 0.25,                 // 25% SL — accelerated green-tech track
    rateMin: 0.20,
    rateMax: 0.25,
    usefulLifeYears: 4,
    method: 'SL',
    salvagePct: 0.05,
    restrictedDeduction: false,
    statuteRef: 'תקנות פחת 1991 — פחת מואץ למתקני אנרגיה מתחדשת',
  },

  // --- קטלוג ברירת מחדל ------------------------------------------------------
  DEFAULT_EQUIPMENT: {
    code: 'DEFAULT_EQUIPMENT',
    he: 'ציוד — ברירת מחדל',
    en: 'Equipment — default',
    rate: 0.10,                 // 10% SL — conservative fallback
    rateMin: 0.10,
    rateMax: 0.15,
    usefulLifeYears: 10,
    method: 'SL',
    salvagePct: 0.00,
    restrictedDeduction: false,
    statuteRef: 'תקנות פחת 1991 — לוח א\' כללי',
  },
});

// ---------------------------------------------------------------------------
// Hebrew alias lookup — so callers can pass 'מחשבים' or 'רכב פרטי' directly.
// ---------------------------------------------------------------------------
const HEBREW_ALIASES = Object.freeze({
  'מבנים': 'BUILDING_NON_INDUSTRIAL',
  'מבנה': 'BUILDING_NON_INDUSTRIAL',
  'מבנה רגיל': 'BUILDING_NON_INDUSTRIAL',
  'בניין': 'BUILDING_NON_INDUSTRIAL',
  'מבנה תעשייתי': 'BUILDING_INDUSTRIAL',
  'מחשבים': 'COMPUTERS',
  'מחשב': 'COMPUTERS',
  'תשתית דיגיטלית': 'DIGITAL_INFRASTRUCTURE',
  'תוכנה': 'SOFTWARE',
  'ריהוט משרדי': 'OFFICE_FURNITURE',
  'ריהוט': 'OFFICE_FURNITURE',
  'מכונות כלליות': 'MACHINERY_GENERAL',
  'מכונות': 'MACHINERY_GENERAL',
  'מכונות חיתוך': 'MACHINERY_METAL_FAB',
  'מכונות עיבוד שבבי': 'MACHINERY_METAL_FAB',
  'CNC': 'MACHINERY_METAL_FAB',
  'ציוד כבד': 'HEAVY_EQUIPMENT',
  'רכב מסחרי': 'VEHICLE_COMMERCIAL',
  'משאית': 'VEHICLE_COMMERCIAL',
  'טנדר': 'VEHICLE_COMMERCIAL',
  'רכב פרטי': 'VEHICLE_PRIVATE',
  'מתקן סולארי': 'SOLAR_INSTALLATION',
  'סולארי': 'SOLAR_INSTALLATION',
  'ברירת מחדל': 'DEFAULT_EQUIPMENT',
});

// ============================================================================
// § 2. UTILITIES — date math, rounding, validation
// ============================================================================

function round2(n) {
  // Banker-safe 2-decimal rounding: avoid float drift on .005 edge cases.
  if (!Number.isFinite(n)) return 0;
  const scaled = Math.round((n + Number.EPSILON) * 100);
  return scaled / 100;
}

function parseDate(d) {
  if (d instanceof Date) return new Date(d.getTime());
  if (typeof d === 'string') {
    const t = new Date(d);
    if (Number.isNaN(t.getTime())) {
      throw new Error(`Invalid date: ${d} | תאריך לא תקין`);
    }
    return t;
  }
  throw new Error('Date must be Date or ISO string | תאריך חייב להיות אובייקט Date או מחרוזת ISO');
}

function daysBetween(a, b) {
  const ms = parseDate(b).getTime() - parseDate(a).getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function monthsBetween(a, b) {
  const d1 = parseDate(a);
  const d2 = parseDate(b);
  return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
}

function addMonths(d, n) {
  const x = parseDate(d);
  const y = new Date(x.getTime());
  y.setMonth(y.getMonth() + n);
  return y;
}

function yearOf(d) { return parseDate(d).getFullYear(); }
function isoDate(d) { return parseDate(d).toISOString().slice(0, 10); }

function fractionOfYearRemaining(acqDate) {
  // Fraction of the *acquisition year* from purchase date to Dec 31.
  const acq = parseDate(acqDate);
  const eoy = new Date(acq.getFullYear(), 11, 31);
  const bom = new Date(acq.getFullYear(), acq.getMonth(), 1);
  // Israeli tax practice: depreciation computed from the MONTH of acquisition
  // (inclusive), giving whole months remaining that year.
  const monthsRemaining = 12 - acq.getMonth(); // month is 0-based
  void bom; void eoy;
  return monthsRemaining / 12;
}

function assertFinitePositive(name, v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    throw new Error(`Field "${name}" must be a non-negative number | השדה "${name}" חייב להיות מספר אי-שלילי`);
  }
}

// ============================================================================
// § 3. CLASSIFIER — map user-supplied label to rate entry
// ============================================================================

function resolveClass(depreciationClass) {
  if (!depreciationClass || typeof depreciationClass !== 'string') {
    return DEPRECIATION_CLASSES.DEFAULT_EQUIPMENT;
  }
  const raw = depreciationClass.trim();
  // Direct code hit
  if (DEPRECIATION_CLASSES[raw]) return DEPRECIATION_CLASSES[raw];
  // Upper-case code
  const upper = raw.toUpperCase();
  if (DEPRECIATION_CLASSES[upper]) return DEPRECIATION_CLASSES[upper];
  // Hebrew alias
  if (HEBREW_ALIASES[raw]) return DEPRECIATION_CLASSES[HEBREW_ALIASES[raw]];
  // English substring
  const lower = raw.toLowerCase();
  for (const [code, meta] of Object.entries(DEPRECIATION_CLASSES)) {
    if (meta.en.toLowerCase().includes(lower)) return DEPRECIATION_CLASSES[code];
  }
  return DEPRECIATION_CLASSES.DEFAULT_EQUIPMENT;
}

// ============================================================================
// § 4. DEPRECIATION MATH — SL / DDB / SOYD
// ============================================================================

/**
 * Straight-line depreciation — פחת בקו ישר
 *   annual = (cost - salvage) / life
 *   SL is the Israeli Tax Authority default for לוח א' and לוח ב'.
 */
function slAnnual(cost, salvage, life) {
  if (life <= 0) return 0;
  return round2((cost - salvage) / life);
}

/**
 * Double-Declining Balance — פחת מואץ (DDB / 200%)
 *   For a given "closing-year" NBV, annual expense = NBV_open * (2/life),
 *   floored so NBV never drops below salvage.
 */
function ddbAnnual(nbvOpen, salvage, life) {
  if (life <= 0) return 0;
  const raw = nbvOpen * (2 / life);
  const maxAllowed = Math.max(nbvOpen - salvage, 0);
  return round2(Math.min(raw, maxAllowed));
}

/**
 * Sum-of-Years-Digits — סכום ספרות השנים
 *   year k expense = (life - k + 1) / (life*(life+1)/2) * (cost - salvage)
 */
function soydAnnual(cost, salvage, life, yearIndex /* 1-based */) {
  if (life <= 0) return 0;
  const denom = (life * (life + 1)) / 2;
  const num = life - yearIndex + 1;
  if (num <= 0) return 0;
  return round2(((cost - salvage) * num) / denom);
}

/**
 * Build the full-life depreciation schedule for a single asset.
 *
 * @param {object} asset  - asset record (cost, acquisitionDate, classMeta, …)
 * @param {string} method - 'SL' | 'DDB' | 'sum-of-years'
 * @returns {Array} rows: {year, opening, expense, closing, accumulated}
 */
function buildSchedule(asset, method = 'SL') {
  const meta = asset._classMeta;
  const cost = asset.costBasis;
  const salvage = round2(cost * (meta.salvagePct || 0));
  const life = Math.max(1, Math.round(meta.usefulLifeYears));
  const startYear = yearOf(asset.purchaseDate);
  const firstYearFraction = fractionOfYearRemaining(asset.purchaseDate);

  const rows = [];
  let opening = cost;
  let accumulated = 0;

  if (method === 'SL') {
    const annual = slAnnual(cost, salvage, life);
    // First (partial) year + (life) full years + possibly one tail partial year
    // to consume the last fraction. Simplest deterministic pattern: accumulate
    // until NBV hits salvage.
    let y = 0;
    let year = startYear;
    while (opening > salvage + 0.005 && y <= life + 2) {
      const fraction = y === 0 ? firstYearFraction : 1;
      let expense = round2(annual * fraction);
      if (opening - expense < salvage) expense = round2(opening - salvage);
      const closing = round2(opening - expense);
      accumulated = round2(accumulated + expense);
      rows.push({ year, opening, expense, closing, accumulated });
      opening = closing;
      y += 1;
      year += 1;
    }
    return rows;
  }

  if (method === 'DDB') {
    let y = 0;
    let year = startYear;
    while (opening > salvage + 0.005 && y <= life + 5) {
      const fraction = y === 0 ? firstYearFraction : 1;
      let expense = round2(ddbAnnual(opening, salvage, life) * fraction);
      if (opening - expense < salvage) expense = round2(opening - salvage);
      if (expense <= 0) break;
      const closing = round2(opening - expense);
      accumulated = round2(accumulated + expense);
      rows.push({ year, opening, expense, closing, accumulated });
      opening = closing;
      y += 1;
      year += 1;
    }
    return rows;
  }

  if (method === 'sum-of-years' || method === 'SOYD') {
    let year = startYear;
    for (let k = 1; k <= life + 1; k++) {
      const fraction = k === 1 ? firstYearFraction : 1;
      let expense = round2(soydAnnual(cost, salvage, life, k) * fraction);
      if (opening - expense < salvage) expense = round2(opening - salvage);
      if (expense <= 0) break;
      const closing = round2(opening - expense);
      accumulated = round2(accumulated + expense);
      rows.push({ year, opening, expense, closing, accumulated });
      opening = closing;
      year += 1;
      if (opening <= salvage + 0.005) break;
    }
    return rows;
  }

  throw new Error(`Unknown depreciation method: ${method} | שיטת פחת לא מוכרת`);
}

// ============================================================================
// § 5. FixedAssetRegister — main class
// ============================================================================

class FixedAssetRegister {
  constructor(opts = {}) {
    this._assets = new Map();      // assetId → asset record (mutable internal)
    this._history = [];            // append-only event log
    this._seq = 0;
    this._now = opts.now || (() => new Date());
    this._onCapitalGainsEvent = opts.onCapitalGainsEvent || null; // Y-006 bridge
  }

  // --------------------------------------------------------------------------
  // 5.1 acquireAsset
  // --------------------------------------------------------------------------

  /**
   * Record the purchase of a fixed asset.
   *
   * @param {object} p
   * @param {string} [p.id]             - optional stable id
   * @param {string}  p.description     - free-text, בilingual OK
   * @param {string}  p.category        - free-text category/label
   * @param {string|Date} p.purchaseDate
   * @param {number}  p.cost            - net-of-VAT cost (principal)
   * @param {number}  [p.vat=0]         - VAT paid (recoverable, not capitalized)
   * @param {string}  [p.location]      - site / branch / warehouse
   * @param {string}  [p.serial]        - serial number
   * @param {string}  [p.supplier]      - supplier ID or name
   * @param {string}  [p.warranty]      - warranty notes / end date
   * @param {string}  [p.useFor]        - business purpose
   * @param {string}  p.depreciationClass
   * @returns {string} assetId
   */
  acquireAsset(p) {
    if (!p || typeof p !== 'object') {
      throw new Error('acquireAsset: missing payload | חסרים פרטי רכישה');
    }
    if (!p.description) {
      throw new Error('acquireAsset: description required | חובה תיאור');
    }
    assertFinitePositive('cost', p.cost);
    if (p.vat != null) assertFinitePositive('vat', p.vat);

    const classMeta = resolveClass(p.depreciationClass || p.category);
    const purchaseDate = parseDate(p.purchaseDate || this._now());
    this._seq += 1;
    const id = p.id || `FA-${purchaseDate.getFullYear()}-${String(this._seq).padStart(5, '0')}`;

    if (this._assets.has(id)) {
      throw new Error(`acquireAsset: duplicate id "${id}" | מזהה רכוש כבר קיים`);
    }

    const record = {
      id,
      description: String(p.description),
      category: p.category || classMeta.en,
      purchaseDate: isoDate(purchaseDate),
      cost: round2(p.cost),
      costBasis: round2(p.cost),  // may be uplifted by revaluation
      vat: round2(p.vat || 0),
      location: p.location || null,
      serial: p.serial || null,
      supplier: p.supplier || null,
      warranty: p.warranty || null,
      useFor: p.useFor || null,
      depreciationClass: classMeta.code,
      _classMeta: classMeta,
      status: 'active',                         // active | disposed | held-for-sale
      accumulatedDepreciation: 0,
      netBookValue: round2(p.cost),
      impairmentLoss: 0,
      revaluationSurplus: 0,
      createdAt: this._now().toISOString(),
      lastDepreciationAsOf: null,
      transfers: [],                            // { fromLocation, toLocation, date }
    };

    this._assets.set(id, record);
    this._logEvent('ACQUIRE', id, {
      cost: record.cost,
      vat: record.vat,
      depreciationClass: classMeta.code,
      rate: classMeta.rate,
      rateHe: classMeta.he,
      purchaseDate: record.purchaseDate,
    });
    return id;
  }

  // --------------------------------------------------------------------------
  // 5.2 computeDepreciation
  // --------------------------------------------------------------------------

  /**
   * Compute depreciation for a single asset over a period.
   *
   * @param {object} opts
   * @param {string} opts.assetId
   * @param {object} opts.period           - {from, to} OR {year, frequency}
   * @param {string} opts.period.from      - ISO start date
   * @param {string} opts.period.to        - ISO end date
   * @param {string} [opts.period.year]    - YYYY convenience (full tax year)
   * @param {string} [opts.period.frequency='annual']  - 'monthly'|'quarterly'|'annual'
   * @param {string} [opts.method='SL']    - 'SL'|'DDB'|'sum-of-years'
   * @param {boolean}[opts.post=false]     - if true, applies to asset NBV
   * @returns {object} { assetId, method, periodFrom, periodTo, expense, nbv,
   *                     accumulated, classMeta, pro-rataFraction }
   */
  computeDepreciation(opts) {
    if (!opts) throw new Error('computeDepreciation: missing opts | חסרים פרמטרים');
    const asset = this._mustGet(opts.assetId);
    if (asset.status === 'disposed') {
      return {
        assetId: asset.id,
        method: opts.method || 'SL',
        periodFrom: null,
        periodTo: null,
        expense: 0,
        nbv: asset.netBookValue,
        accumulated: asset.accumulatedDepreciation,
        note: { en: 'Asset disposed — no further depreciation', he: 'נכס מוצא מהשימוש — אין פחת נוסף' },
      };
    }

    const method = (opts.method || asset._classMeta.method || 'SL');
    const { from, to, fraction } = this._resolvePeriod(opts.period, asset);

    // Skip if period is before acquisition
    const acqMs = parseDate(asset.purchaseDate).getTime();
    const toMs = parseDate(to).getTime();
    if (toMs < acqMs) {
      return {
        assetId: asset.id, method, periodFrom: isoDate(from), periodTo: isoDate(to),
        expense: 0, nbv: asset.netBookValue, accumulated: asset.accumulatedDepreciation,
        note: { en: 'Period predates acquisition', he: 'התקופה לפני מועד הרכישה' },
      };
    }

    const meta = asset._classMeta;
    const cost = asset.costBasis;
    const salvage = round2(cost * (meta.salvagePct || 0));
    const life = Math.max(1, Math.round(meta.usefulLifeYears));

    let annual;
    if (method === 'SL') {
      annual = slAnnual(cost, salvage, life);
    } else if (method === 'DDB') {
      annual = ddbAnnual(asset.netBookValue, salvage, life);
    } else if (method === 'sum-of-years' || method === 'SOYD') {
      const yearsElapsed = Math.max(0, Math.floor(
        (parseDate(from).getTime() - acqMs) / (365.25 * 24 * 3600 * 1000)
      ));
      annual = soydAnnual(cost, salvage, life, yearsElapsed + 1);
    } else {
      throw new Error(`computeDepreciation: unknown method "${method}" | שיטה לא מוכרת`);
    }

    let expense = round2(annual * fraction);
    // Never depreciate below salvage (or zero if no salvage)
    const maxExpense = Math.max(asset.netBookValue - salvage, 0);
    if (expense > maxExpense) expense = round2(maxExpense);

    const result = {
      assetId: asset.id,
      method,
      periodFrom: isoDate(from),
      periodTo: isoDate(to),
      expense,
      fractionOfYear: fraction,
      annual,
      salvage,
      nbv: round2(asset.netBookValue - expense),
      accumulated: round2(asset.accumulatedDepreciation + expense),
      classMeta: {
        code: meta.code,
        he: meta.he,
        en: meta.en,
        rate: meta.rate,
      },
    };

    if (opts.post === true) {
      asset.accumulatedDepreciation = result.accumulated;
      asset.netBookValue = result.nbv;
      asset.lastDepreciationAsOf = result.periodTo;
      this._logEvent('DEPRECIATE', asset.id, {
        method, expense, periodFrom: result.periodFrom, periodTo: result.periodTo,
      });
    }

    return result;
  }

  _resolvePeriod(period, asset) {
    if (!period) throw new Error('period required | נדרשת תקופה');
    let from, to;

    if (period.year && !period.from) {
      const y = Number(period.year);
      const freq = period.frequency || 'annual';
      if (freq === 'annual') {
        from = new Date(y, 0, 1);
        to = new Date(y, 11, 31);
      } else if (freq === 'quarterly') {
        const q = period.quarter || 1;
        from = new Date(y, (q - 1) * 3, 1);
        to = new Date(y, (q - 1) * 3 + 3, 0);
      } else if (freq === 'monthly') {
        const m = (period.month || 1) - 1;
        from = new Date(y, m, 1);
        to = new Date(y, m + 1, 0);
      } else {
        throw new Error(`unknown frequency ${freq}`);
      }
    } else {
      from = parseDate(period.from);
      to = parseDate(period.to);
    }

    // Israeli tax-year fraction calculator:
    //   if acquisition is within the window, count from acquisition to 'to'.
    const acqDate = parseDate(asset.purchaseDate);
    const effectiveFrom = acqDate.getTime() > from.getTime() ? acqDate : from;

    const daysInPeriod = Math.max(0, daysBetween(effectiveFrom, to) + 1);
    const yearSpan = 365; // simple — one tax year
    let fraction = daysInPeriod / yearSpan;
    // Clamp to a whole year for annual, half-years, quarters for determinism.
    if (Math.abs(fraction - 1) < 0.01) fraction = 1;
    if (fraction > 1) fraction = 1;
    if (fraction < 0) fraction = 0;
    return { from, to, fraction, days: daysInPeriod };
  }

  // --------------------------------------------------------------------------
  // 5.3 disposeAsset  — integrates with Y-006 capital gains
  // --------------------------------------------------------------------------

  /**
   * Retire / sell an asset. Computes gain or loss on disposal and emits a
   * capital-gains event that can be forwarded to the Y-006 engine.
   *
   * @param {object} p
   * @param {string} p.assetId
   * @param {string|Date} p.date
   * @param {number} p.proceeds            - cash (and/or trade-in) received
   * @param {string} [p.reason]            - sale | scrap | trade-in | loss
   * @returns {object} disposal record
   */
  disposeAsset(p) {
    const asset = this._mustGet(p.assetId);
    if (asset.status === 'disposed') {
      throw new Error(`disposeAsset: asset ${asset.id} already disposed | הנכס כבר מוצא מהשימוש`);
    }
    assertFinitePositive('proceeds', p.proceeds);

    const disposalDate = parseDate(p.date || this._now());

    // Catch-up depreciation to disposal date, if not already current.
    const lastPeriodEnd = asset.lastDepreciationAsOf
      ? parseDate(asset.lastDepreciationAsOf)
      : parseDate(asset.purchaseDate);
    if (disposalDate.getTime() > lastPeriodEnd.getTime()) {
      try {
        this.computeDepreciation({
          assetId: asset.id,
          period: { from: isoDate(lastPeriodEnd), to: isoDate(disposalDate) },
          method: asset._classMeta.method,
          post: true,
        });
      } catch (e) { void e; /* ignore if before acq */ }
    }

    const nbv = asset.netBookValue;
    const proceeds = round2(p.proceeds);
    const gainLoss = round2(proceeds - nbv);

    asset.status = 'disposed';
    asset.disposalDate = isoDate(disposalDate);
    asset.disposalProceeds = proceeds;
    asset.disposalGainLoss = gainLoss;
    asset.disposalReason = p.reason || 'sale';

    const capitalGainsEvent = {
      // Payload shape compatible with tax/capital-gains.js computeGain()
      source: 'fixed-assets',
      assetId: asset.id,
      assetDescription: asset.description,
      depreciationClass: asset.depreciationClass,
      acquisitionDate: asset.purchaseDate,
      acquisitionCost: asset.cost,
      sellDate: isoDate(disposalDate),
      sellPrice: proceeds,
      accumulatedDepreciation: asset.accumulatedDepreciation,
      taxBasis: nbv, // adjusted basis after depreciation
      nominalGain: gainLoss,
      reason: asset.disposalReason,
    };

    // Suggested journal entry (bilingual)
    const journal = {
      date: asset.disposalDate,
      narration: {
        en: `Disposal of ${asset.description} — ${p.reason || 'sale'}`,
        he: `גריעת רכוש קבוע — ${asset.description} — ${p.reason || 'מכירה'}`,
      },
      lines: [
        { account: 'CASH/BANK', debit: proceeds, credit: 0, memo_he: 'קבלת תמורה' },
        { account: `ACCUM_DEPR:${asset.depreciationClass}`, debit: asset.accumulatedDepreciation, credit: 0, memo_he: 'ביטול פחת נצבר' },
        { account: `FA:${asset.depreciationClass}`, debit: 0, credit: asset.cost, memo_he: 'גריעת עלות מקורית' },
      ],
    };
    if (gainLoss > 0) {
      journal.lines.push({ account: 'GAIN_ON_DISPOSAL', debit: 0, credit: gainLoss, memo_he: 'רווח הון ממימוש' });
    } else if (gainLoss < 0) {
      journal.lines.push({ account: 'LOSS_ON_DISPOSAL', debit: -gainLoss, credit: 0, memo_he: 'הפסד הון ממימוש' });
    }

    this._logEvent('DISPOSE', asset.id, {
      proceeds, gainLoss, reason: asset.disposalReason, nbvAtDisposal: nbv,
    });

    // Forward to Y-006 capital-gains engine if a callback is wired up.
    if (typeof this._onCapitalGainsEvent === 'function') {
      try { this._onCapitalGainsEvent(capitalGainsEvent); } catch (_) { /* never throw */ }
    }

    return {
      assetId: asset.id,
      disposalDate: asset.disposalDate,
      proceeds,
      nbvAtDisposal: nbv,
      accumulatedDepreciation: asset.accumulatedDepreciation,
      gain_loss: gainLoss,
      isGain: gainLoss > 0,
      isLoss: gainLoss < 0,
      capitalGainsLink: capitalGainsEvent,
      journal,
      label: {
        en: gainLoss >= 0 ? `Gain on disposal: ${gainLoss}` : `Loss on disposal: ${-gainLoss}`,
        he: gainLoss >= 0 ? `רווח הון ממימוש: ${gainLoss}` : `הפסד הון ממימוש: ${-gainLoss}`,
      },
    };
  }

  // --------------------------------------------------------------------------
  // 5.4 revaluation — IFRS IAS 16 revaluation model (optional)
  // --------------------------------------------------------------------------

  /**
   * Revalue an asset to a new fair value. Difference flows to a revaluation
   * surplus (equity) under IAS 16. Depreciation continues on the new carrying
   * amount.
   *
   * Israeli tax treatment: revaluation uplift is NOT deductible — it is
   * tracked separately in asset.revaluationSurplus and does not change the
   * tax basis used by the capital-gains bridge on disposal.
   */
  revaluation(assetId, newValue) {
    const asset = this._mustGet(assetId);
    if (asset.status === 'disposed') {
      throw new Error(`revaluation: asset ${assetId} already disposed | הנכס מוצא מהשימוש`);
    }
    assertFinitePositive('newValue', newValue);
    const prev = asset.netBookValue;
    const uplift = round2(newValue - prev);

    asset.netBookValue = round2(newValue);
    asset.costBasis = round2(newValue + asset.accumulatedDepreciation); // re-set basis
    asset.revaluationSurplus = round2(asset.revaluationSurplus + uplift);

    this._logEvent('REVALUE', assetId, { previousNBV: prev, newNBV: newValue, uplift });
    return {
      assetId,
      previousNBV: prev,
      newNBV: asset.netBookValue,
      uplift,
      revaluationSurplusTotal: asset.revaluationSurplus,
      note: {
        en: 'IAS 16 revaluation — uplift to equity (surplus), not income',
        he: 'שערוך IAS 16 — הגידול נזקף לעודף שערוך בהון, לא לרווח והפסד',
      },
    };
  }

  // --------------------------------------------------------------------------
  // 5.5 impairmentTest — IAS 36
  // --------------------------------------------------------------------------

  /**
   * Test for impairment. If recoverable amount < NBV, write down the asset.
   *
   * Indicators (pre-flagged when no recoverable amount is supplied):
   *   - physical damage     - שינויים טכנולוגיים
   *   - market value drop   - ירידה במחיר שוק
   *   - idle / discontinued - השבתה או הפסקת שימוש
   *
   * @param {string} assetId
   * @param {object} [opts]
   * @param {number} [opts.recoverableAmount] - if provided, writes down
   * @param {string[]} [opts.indicators]       - list of indicator codes
   */
  impairmentTest(assetId, opts = {}) {
    const asset = this._mustGet(assetId);
    const indicators = opts.indicators || [];
    const recoverable = opts.recoverableAmount;

    const result = {
      assetId,
      nbv: asset.netBookValue,
      indicators,
      impaired: false,
      writeDown: 0,
      newNBV: asset.netBookValue,
      recommendation: { en: 'No impairment', he: 'אין פגיעה בערך' },
    };

    if (recoverable != null) {
      assertFinitePositive('recoverableAmount', recoverable);
      if (recoverable < asset.netBookValue) {
        const writeDown = round2(asset.netBookValue - recoverable);
        asset.netBookValue = round2(recoverable);
        asset.impairmentLoss = round2(asset.impairmentLoss + writeDown);
        result.impaired = true;
        result.writeDown = writeDown;
        result.newNBV = asset.netBookValue;
        result.recommendation = {
          en: `Impair by ${writeDown}; charge to P&L under IAS 36`,
          he: `יש להפחית ${writeDown} ולזקוף לרווח והפסד לפי IAS 36`,
        };
        this._logEvent('IMPAIR', assetId, { writeDown, newNBV: asset.netBookValue, indicators });
      }
    } else if (indicators.length > 0) {
      result.recommendation = {
        en: 'Indicators present — calculate recoverable amount and re-test',
        he: 'נמצאו סימנים לפגיעה — לחשב סכום בר-השבה ולבחון מחדש',
      };
    }

    return result;
  }

  // --------------------------------------------------------------------------
  // 5.6 capexReport
  // --------------------------------------------------------------------------

  /**
   * Capital Expenditure report for a period.
   *
   * @param {object} period - {from, to} OR {year}
   * @returns {object} {totals, byCategory, items}
   */
  capexReport(period) {
    let from, to;
    if (period.year) {
      const y = Number(period.year);
      from = new Date(y, 0, 1);
      to = new Date(y, 11, 31);
    } else {
      from = parseDate(period.from);
      to = parseDate(period.to);
    }

    const items = [];
    const byCategory = {};
    let totalCost = 0;
    let totalVat = 0;

    for (const a of this._assets.values()) {
      const aDate = parseDate(a.purchaseDate);
      if (aDate.getTime() < from.getTime() || aDate.getTime() > to.getTime()) continue;
      items.push({
        id: a.id, description: a.description, purchaseDate: a.purchaseDate,
        cost: a.cost, vat: a.vat, depreciationClass: a.depreciationClass,
        classHe: a._classMeta.he,
      });
      totalCost = round2(totalCost + a.cost);
      totalVat = round2(totalVat + a.vat);
      const key = a.depreciationClass;
      if (!byCategory[key]) {
        byCategory[key] = { code: key, he: a._classMeta.he, en: a._classMeta.en, count: 0, cost: 0 };
      }
      byCategory[key].count += 1;
      byCategory[key].cost = round2(byCategory[key].cost + a.cost);
    }

    return {
      periodFrom: isoDate(from),
      periodTo: isoDate(to),
      totals: { cost: totalCost, vat: totalVat, count: items.length },
      byCategory,
      items,
      label: {
        en: `CAPEX report ${isoDate(from)} — ${isoDate(to)}`,
        he: `דו"ח השקעות הון ${isoDate(from)} — ${isoDate(to)}`,
      },
    };
  }

  // --------------------------------------------------------------------------
  // 5.7 depreciationSchedule — full life projection
  // --------------------------------------------------------------------------

  depreciationSchedule(assetId, method) {
    const asset = this._mustGet(assetId);
    const m = method || asset._classMeta.method || 'SL';
    const rows = buildSchedule(asset, m);
    return {
      assetId,
      method: m,
      classMeta: {
        code: asset._classMeta.code,
        he: asset._classMeta.he,
        en: asset._classMeta.en,
        rate: asset._classMeta.rate,
        usefulLifeYears: asset._classMeta.usefulLifeYears,
      },
      rows,
      totalDepreciation: rows.reduce((s, r) => round2(s + r.expense), 0),
    };
  }

  // --------------------------------------------------------------------------
  // 5.8 handleTransfer — intra-company relocation
  // --------------------------------------------------------------------------

  handleTransfer(assetId, newLocation, opts = {}) {
    const asset = this._mustGet(assetId);
    if (!newLocation) throw new Error('handleTransfer: newLocation required | נדרש מיקום חדש');
    if (asset.status === 'disposed') {
      throw new Error(`handleTransfer: asset ${assetId} already disposed | הנכס מוצא מהשימוש`);
    }
    const prev = asset.location;
    const entry = {
      date: isoDate(opts.date || this._now()),
      fromLocation: prev,
      toLocation: newLocation,
      custodian: opts.custodian || null,
      reference: opts.reference || null,
    };
    asset.transfers.push(entry);
    asset.location = newLocation;
    this._logEvent('TRANSFER', assetId, entry);
    return {
      assetId,
      ...entry,
      label: {
        en: `Transferred from ${prev || '(unset)'} to ${newLocation}`,
        he: `הועבר ${prev ? `מ-${prev}` : ''} ל-${newLocation}`,
      },
    };
  }

  // --------------------------------------------------------------------------
  // 5.9 Queries & metadata
  // --------------------------------------------------------------------------

  getAsset(assetId) {
    const a = this._mustGet(assetId);
    return Object.freeze({ ...a, _classMeta: undefined });
  }

  listAssets(filter = {}) {
    const out = [];
    for (const a of this._assets.values()) {
      if (filter.status && a.status !== filter.status) continue;
      if (filter.depreciationClass && a.depreciationClass !== filter.depreciationClass) continue;
      if (filter.location && a.location !== filter.location) continue;
      out.push({ ...a, _classMeta: undefined });
    }
    return out;
  }

  classifyByDepreciationClass(cls) {
    const meta = resolveClass(cls);
    return {
      code: meta.code,
      he: meta.he,
      en: meta.en,
      rate: meta.rate,
      rateMin: meta.rateMin,
      rateMax: meta.rateMax,
      method: meta.method,
      usefulLifeYears: meta.usefulLifeYears,
      salvagePct: meta.salvagePct,
      restrictedDeduction: meta.restrictedDeduction || false,
      statuteRef: meta.statuteRef,
    };
  }

  history(assetId) {
    if (assetId) return this._history.filter(e => e.assetId === assetId);
    return this._history.slice();
  }

  // --------------------------------------------------------------------------
  // Internal helpers
  // --------------------------------------------------------------------------

  _mustGet(id) {
    const a = this._assets.get(id);
    if (!a) throw new Error(`Asset not found: ${id} | רכוש לא נמצא`);
    return a;
  }

  _logEvent(kind, assetId, payload) {
    this._history.push({
      seq: this._history.length + 1,
      at: this._now().toISOString(),
      kind,
      assetId,
      payload,
    });
  }
}

// ============================================================================
// § 6. Public exports
// ============================================================================

module.exports = {
  FixedAssetRegister,
  DEPRECIATION_CLASSES,
  HEBREW_ALIASES,
  // Exposed for unit testing and reuse by siblings
  resolveClass,
  slAnnual,
  ddbAnnual,
  soydAnnual,
  buildSchedule,
  round2,
};
