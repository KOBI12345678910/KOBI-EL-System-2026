/**
 * valuation.js — Israeli Property Valuation Engine (מנוע הערכת שווי נדל"ן)
 * Agent Y-052 / Swarm 3C / Techno-Kol Uzi Mega-ERP — Wave 2026
 * ---------------------------------------------------------------------------
 *
 * Multi-method Israeli real-estate valuation engine.
 *
 *   House rule: לא מוחקים רק משדרגים ומגדלים
 *     — this module never deletes, never mutates caller data, additive only.
 *
 * Methods (שיטות הערכה):
 *   1. comparable — גישת ההשוואה (sales comparison, adjusted comparables)
 *   2. income     — גישת ההכנסות (DCF / cap-rate / NOI capitalization)
 *   3. cost       — גישת העלות   (land value + replacement cost − depreciation)
 *   4. residual   — גישת השייר   (GDV − construction − profit − finance) for
 *                                 development / redevelopment sites
 *
 * Israeli specifics baked in (גורמים ישראליים):
 *   • tabu legal status                           → דיוק בבעלות, רישום בטאבו
 *   • preserved tenant (דייר מוגן)                → heavy value reduction
 *   • building-committee disputes (ועד בית)       → moderate reduction
 *   • TAMA 38 potential (תמ"א 38/1, 38/2)          → upward adjustment
 *   • Pinui-Binui (פינוי בינוי) potential          → upward adjustment
 *   • Bank-of-Israel base rate influence on cap  → live injection via BOI stub
 *   • Neighborhood index (Madlan-style / מדלן)   → city+neighborhood multiplier
 *   • Gush/Helka lookup from רשות המסים — עסקאות → comparables fetch stub
 *
 * Zero external dependencies. All functions are pure.
 * Bilingual (Hebrew + English) labels and notes throughout.
 *
 * ---------------------------------------------------------------------------
 * Exports:
 *
 *   PropertyValuator                → main class with all methods
 *   ADJUSTMENT_WEIGHTS              → default adjustment coefficients
 *   ISRAELI_FACTORS                 → tabu / דייר מוגן / ועד בית / תמ"א 38 tables
 *   NEIGHBORHOOD_INDEX_BASE         → Madlan-style city baseline multipliers
 *   BANK_OF_ISRAEL_DEFAULT_RATE     → 2026 default BOI base rate
 *   CAP_RATE_BY_TYPE                → default cap rates per property type
 *   DEPRECIATION_TABLES             → age-based depreciation curves
 *   VALUATION_METHOD_LABELS         → bilingual labels for UI
 *
 * ---------------------------------------------------------------------------
 * Data shapes (JSDoc):
 *
 * @typedef {Object} Property
 * @property {string} [id]              Property identifier
 * @property {string} [address]         Full address (Hebrew or English)
 * @property {string} [city]            עיר — e.g. "תל אביב", "חיפה"
 * @property {string} [neighborhood]    שכונה — e.g. "פלורנטין"
 * @property {string|number} [gush]     גוש — block number
 * @property {string|number} [helka]    חלקה — parcel number
 * @property {string|number} [subHelka] תת-חלקה — sub-parcel
 * @property {string} [propertyType]    apartment | house | commercial | land | office | retail | industrial
 * @property {number} [sizeSqm]         שטח במ"ר
 * @property {number} [builtSizeSqm]    שטח בנוי במ"ר (for land)
 * @property {number} [rooms]           מספר חדרים
 * @property {number} [floor]           קומה
 * @property {number} [totalFloors]     סה"כ קומות בבניין
 * @property {number} [yearBuilt]       שנת בנייה
 * @property {string} [condition]       new | renovated | good | average | poor | very_poor
 * @property {boolean} [hasElevator]    מעלית
 * @property {boolean} [hasParking]     חניה
 * @property {boolean} [hasBalcony]     מרפסת
 * @property {boolean} [hasSafeRoom]    ממ"ד
 * @property {boolean} [hasStorage]     מחסן
 * @property {string} [tabuStatus]      clean | mortgaged | liens | shared | unregistered | defective
 * @property {boolean} [hasPreservedTenant] דייר מוגן
 * @property {boolean} [hasCommitteeDispute] סכסוך ועד בית
 * @property {Object} [tama38]          {phase1?: boolean, phase2?: boolean, signed?: boolean, permitIssued?: boolean}
 * @property {Object} [pinuiBinui]      {eligible?: boolean, approved?: boolean}
 *
 * @typedef {Object} ComparableSale
 * @property {number} salePrice         מחיר עסקה
 * @property {string} [saleDate]        ISO date
 * @property {number} sizeSqm
 * @property {number} [yearBuilt]
 * @property {string} [condition]
 * @property {number} [distanceKm]      distance from subject
 * @property {string} [neighborhood]
 * @property {number} [rooms]
 * @property {number} [floor]
 * @property {boolean} [hasElevator]
 * @property {boolean} [hasParking]
 *
 * @typedef {Object} ValuationResult
 * @property {number} low               Lower bound estimate (ILS)
 * @property {number} likely            Most-likely estimate (ILS)
 * @property {number} high              Upper bound estimate (ILS)
 * @property {string} method            Method key used
 * @property {Array} notes              Bilingual notes with {he, en, impact}
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

/**
 * Default adjustment coefficients used by the comparable method.
 * Each is applied as a percent adjustment per unit of difference.
 */
const ADJUSTMENT_WEIGHTS = Object.freeze({
  /** Percent adjustment per 1 square meter of size difference */
  sizePerSqm: 0.004, // 0.4% per sqm diff (diminishing) — used via diminishing fn
  /** Absolute ILS / sqm penalty applied by weighting the comparable's price/sqm */
  sizeMode: 'pricePerSqm', // 'pricePerSqm' | 'percentTotal'
  /** Age — percent penalty per year difference (newer = positive) */
  agePerYear: 0.005, // 0.5% per year
  /** Age cap — beyond N years further depreciation slows (diminishing) */
  ageCapYears: 40,
  /** Condition — lookup table from condition label to multiplier */
  condition: Object.freeze({
    new: 1.08,
    renovated: 1.05,
    good: 1.0,
    average: 0.95,
    poor: 0.88,
    very_poor: 0.75,
  }),
  /** Location (distance) penalty — percent per km (capped) */
  distancePerKm: 0.015, // 1.5% per km
  distanceCapKm: 6,
  /** Floor — percent bonus per floor above ground (apartments) */
  floorPerLevel: 0.005, // 0.5% per floor
  floorCapLevels: 10,
  /** Amenity bumps */
  elevator: 0.03,
  parking: 0.04,
  balcony: 0.02,
  safeRoom: 0.025, // ממ"ד
  storage: 0.01,
  /** Max cumulative adjustment per comparable to keep sanity */
  maxAdjustmentAbs: 0.5,
});

/**
 * Israeli-specific value factors.
 * `factor` is multiplied onto the base valuation.
 * `rangeSpread` widens the low/high uncertainty band (fraction).
 */
const ISRAELI_FACTORS = Object.freeze({
  /** Tabu (טאבו) — legal registration status */
  tabu: Object.freeze({
    clean: { factor: 1.0, rangeSpread: 0.0, he: 'רישום נקי בטאבו', en: 'Clean tabu registration' },
    mortgaged: { factor: 0.99, rangeSpread: 0.01, he: 'משכנתא רשומה — ניתן לפירעון', en: 'Registered mortgage — repayable' },
    liens: { factor: 0.93, rangeSpread: 0.04, he: 'עיקולים / שעבודים', en: 'Liens / encumbrances' },
    shared: { factor: 0.92, rangeSpread: 0.03, he: 'בעלות משותפת (מושאע)', en: 'Shared ownership (mushaa)' },
    unregistered: { factor: 0.85, rangeSpread: 0.06, he: 'לא רשום בטאבו (רמ"י / חברה משכנת)', en: 'Not registered at tabu (RMI / managing company)' },
    defective: { factor: 0.70, rangeSpread: 0.10, he: 'רישום פגום — דורש תיקון', en: 'Defective registration — requires correction' },
  }),
  /** דייר מוגן — preserved tenant, governed by חוק הגנת הדייר */
  preservedTenant: Object.freeze({
    present: {
      factor: 0.55, // severe: vacant possession value drops ~40-50%
      rangeSpread: 0.10,
      he: 'דייר מוגן בנכס — הפחתה משמעותית בשווי (40%-50%)',
      en: 'Preserved tenant present — significant value reduction (40%-50%)',
    },
    absent: { factor: 1.0, rangeSpread: 0.0, he: 'ללא דיירות מוגנת', en: 'No preserved tenancy' },
  }),
  /** ועד בית — building committee disputes */
  committeeDispute: Object.freeze({
    present: {
      factor: 0.97,
      rangeSpread: 0.03,
      he: 'סכסוך ועד בית פעיל — הפחתה מתונה',
      en: 'Active building-committee dispute — moderate reduction',
    },
    absent: { factor: 1.0, rangeSpread: 0.0, he: 'ועד בית תקין', en: 'Building committee normal' },
  }),
  /** תמ"א 38 — National Master Plan 38 (earthquake reinforcement / rebuild) */
  tama38: Object.freeze({
    none: { factor: 1.0, rangeSpread: 0.0, he: 'ללא פוטנציאל תמ"א 38', en: 'No TAMA 38 potential' },
    phase1Potential: {
      factor: 1.05,
      rangeSpread: 0.03,
      he: 'פוטנציאל תמ"א 38/1 (חיזוק)',
      en: 'TAMA 38/1 potential (strengthening)',
    },
    phase1Signed: {
      factor: 1.10,
      rangeSpread: 0.04,
      he: 'תמ"א 38/1 חתום מול יזם',
      en: 'TAMA 38/1 signed with developer',
    },
    phase1PermitIssued: {
      factor: 1.15,
      rangeSpread: 0.05,
      he: 'תמ"א 38/1 היתר בנייה הוצא',
      en: 'TAMA 38/1 building permit issued',
    },
    phase2Potential: {
      factor: 1.15,
      rangeSpread: 0.05,
      he: 'פוטנציאל תמ"א 38/2 (הריסה ובנייה מחדש)',
      en: 'TAMA 38/2 potential (demolish & rebuild)',
    },
    phase2Signed: {
      factor: 1.22,
      rangeSpread: 0.06,
      he: 'תמ"א 38/2 חתום מול יזם',
      en: 'TAMA 38/2 signed with developer',
    },
    phase2PermitIssued: {
      factor: 1.30,
      rangeSpread: 0.07,
      he: 'תמ"א 38/2 היתר בנייה הוצא',
      en: 'TAMA 38/2 building permit issued',
    },
  }),
  /** פינוי בינוי — evacuation-reconstruction program */
  pinuiBinui: Object.freeze({
    none: { factor: 1.0, rangeSpread: 0.0, he: 'ללא פוטנציאל פינוי בינוי', en: 'No Pinui-Binui potential' },
    eligible: {
      factor: 1.10,
      rangeSpread: 0.05,
      he: 'זכאי לפינוי בינוי',
      en: 'Eligible for Pinui-Binui',
    },
    approved: {
      factor: 1.20,
      rangeSpread: 0.06,
      he: 'מתחם פינוי בינוי מאושר',
      en: 'Approved Pinui-Binui compound',
    },
  }),
});

/**
 * Default cap rates per property type (Israel, baseline — before BOI adjustment).
 * Expressed as annual NOI / value.
 */
const CAP_RATE_BY_TYPE = Object.freeze({
  apartment: 0.035, // residential apartment (Tel Aviv baseline)
  house: 0.034,
  office: 0.065,
  retail: 0.070,
  industrial: 0.075,
  commercial: 0.068,
  logistics: 0.072,
  hotel: 0.080,
  land: 0.045,
  default: 0.055,
});

/**
 * Age-based depreciation curves (straight-line with cap).
 * Returns useful-life years and annual depreciation fraction.
 */
const DEPRECIATION_TABLES = Object.freeze({
  apartment: { usefulLife: 80, annual: 1 / 80, minValueFactor: 0.30 },
  house: { usefulLife: 70, annual: 1 / 70, minValueFactor: 0.25 },
  office: { usefulLife: 50, annual: 1 / 50, minValueFactor: 0.25 },
  retail: { usefulLife: 50, annual: 1 / 50, minValueFactor: 0.25 },
  industrial: { usefulLife: 40, annual: 1 / 40, minValueFactor: 0.20 },
  commercial: { usefulLife: 50, annual: 1 / 50, minValueFactor: 0.25 },
  default: { usefulLife: 60, annual: 1 / 60, minValueFactor: 0.25 },
});

/**
 * Madlan-style neighborhood base index (relative to Israel-wide 1.0).
 * Multiplier applied on top of the raw valuation to reflect micro-location.
 * In production this would be fetched from Madlan or the MOH price index.
 */
const NEIGHBORHOOD_INDEX_BASE = Object.freeze({
  // Tel Aviv
  'תל אביב|רמת אביב': 1.45,
  'תל אביב|צפון הישן': 1.55,
  'תל אביב|לב תל אביב': 1.60,
  'תל אביב|פלורנטין': 1.35,
  'תל אביב|נווה צדק': 1.65,
  'תל אביב|יפו': 1.20,
  'תל אביב|רמת החייל': 1.30,
  'תל אביב|default': 1.40,
  // Jerusalem
  'ירושלים|רחביה': 1.40,
  'ירושלים|טלביה': 1.45,
  'ירושלים|בקעה': 1.25,
  'ירושלים|קטמון': 1.20,
  'ירושלים|רמות': 0.85,
  'ירושלים|גילה': 0.80,
  'ירושלים|default': 1.05,
  // Haifa
  'חיפה|כרמל': 1.00,
  'חיפה|דניה': 1.05,
  'חיפה|הדר': 0.75,
  'חיפה|default': 0.85,
  // Sharon / Central
  'רעננה|default': 1.25,
  'הרצליה|default': 1.35,
  'הרצליה|הרצליה פיתוח': 1.80,
  'רמת גן|default': 1.15,
  'גבעתיים|default': 1.20,
  'כפר סבא|default': 1.10,
  'פתח תקווה|default': 1.00,
  'ראשון לציון|default': 0.95,
  'חולון|default': 0.95,
  'בת ים|default': 0.85,
  // Periphery
  'באר שבע|default': 0.60,
  'אשדוד|default': 0.75,
  'אשקלון|default': 0.70,
  'נתניה|default': 0.90,
  'עפולה|default': 0.55,
  'דימונה|default': 0.45,
  'בית שמש|default': 0.75,
  default: 1.00,
});

/**
 * Bank-of-Israel default base rate snapshot for 2026.
 * Value is a fraction (e.g. 0.045 = 4.5%). Used as fallback when no live feed.
 */
const BANK_OF_ISRAEL_DEFAULT_RATE = 0.045;

const VALUATION_METHOD_LABELS = Object.freeze({
  comparable: { he: 'גישת ההשוואה', en: 'Sales comparison' },
  income: { he: 'גישת ההכנסות', en: 'Income capitalization' },
  cost: { he: 'גישת העלות', en: 'Cost approach' },
  residual: { he: 'גישת השייר', en: 'Residual method' },
});

// ═══════════════════════════════════════════════════════════════
// Helpers — internal
// ═══════════════════════════════════════════════════════════════

const round2 = (n) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const round0 = (n) => Math.round(Number.isFinite(n) ? n : 0);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function parseIsoDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function yearsBetween(fromIso, toIso) {
  const a = parseIsoDate(fromIso);
  const b = parseIsoDate(toIso);
  if (!a || !b) return 0;
  return (b.getTime() - a.getTime()) / (365.25 * 86400 * 1000);
}

function currentYear(refIso) {
  if (refIso) {
    const d = parseIsoDate(refIso);
    if (d) return d.getFullYear();
  }
  return new Date().getFullYear();
}

function conditionMultiplier(cond) {
  if (!cond) return 1.0;
  const key = String(cond).toLowerCase().trim().replace(/[\s-]/g, '_');
  return ADJUSTMENT_WEIGHTS.condition[key] ?? 1.0;
}

function depreciationKey(type) {
  const k = (type || 'default').toLowerCase();
  return DEPRECIATION_TABLES[k] ? k : 'default';
}

function capRateKey(type) {
  const k = (type || 'default').toLowerCase();
  return CAP_RATE_BY_TYPE[k] !== undefined ? k : 'default';
}

/**
 * Reason/note helper — returns bilingual note object for the result array.
 */
function note(he, en, impact = 0) {
  return { he: String(he), en: String(en), impact: round2(impact) };
}

// ═══════════════════════════════════════════════════════════════
// PropertyValuator class
// ═══════════════════════════════════════════════════════════════

class PropertyValuator {
  /**
   * @param {Object} [options]
   * @param {number} [options.boiRate]              Override Bank-of-Israel base rate
   * @param {Object} [options.neighborhoodIndex]    Override neighborhood index map
   * @param {Function} [options.comparablesFetcher] Async function (gush, helka, radius) => ComparableSale[]
   * @param {number} [options.asOfYear]             Override valuation year (defaults to current)
   */
  constructor(options = {}) {
    this.options = Object.freeze({
      boiRate: Number.isFinite(options.boiRate) ? options.boiRate : BANK_OF_ISRAEL_DEFAULT_RATE,
      neighborhoodIndex: options.neighborhoodIndex || NEIGHBORHOOD_INDEX_BASE,
      comparablesFetcher: options.comparablesFetcher || null,
      asOfYear: options.asOfYear || null,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Top-level dispatcher
  // ─────────────────────────────────────────────────────────────
  /**
   * Top-level dispatcher.
   * @param {Property} property
   * @param {Object} opts
   * @param {'comparable'|'income'|'cost'|'residual'} opts.method
   * @param {Object} [opts.inputs]  Method-specific inputs
   * @returns {ValuationResult}
   */
  valuate(property, { method, inputs } = {}) {
    if (!property || typeof property !== 'object') {
      throw new TypeError('valuate: property is required');
    }
    if (!method) {
      throw new TypeError('valuate: method is required (comparable|income|cost|residual)');
    }
    const inp = inputs || {};
    let base;
    switch (method) {
      case 'comparable':
        base = this.comparableMethod({
          subject: property,
          comparables: inp.comparables || [],
          adjustments: inp.adjustments || null,
        });
        break;
      case 'income':
        base = this.incomeMethod({
          rentalIncome: inp.rentalIncome,
          operatingExpenses: inp.operatingExpenses,
          capRate: inp.capRate,
          vacancy: inp.vacancy,
          growthRate: inp.growthRate,
          discountRate: inp.discountRate,
          holdYears: inp.holdYears,
          propertyType: property.propertyType,
        });
        break;
      case 'cost':
        base = this.costMethod({
          landValue: inp.landValue,
          replacementCost: inp.replacementCost,
          depreciation: inp.depreciation,
          yearBuilt: property.yearBuilt,
          propertyType: property.propertyType,
          condition: property.condition,
          asOfYear: this.options.asOfYear,
        });
        break;
      case 'residual':
        base = this.residualMethod({
          gdv: inp.gdv,
          constructionCost: inp.constructionCost,
          profit: inp.profit,
          finance: inp.finance,
          softCosts: inp.softCosts,
          contingency: inp.contingency,
        });
        break;
      default:
        throw new TypeError(`valuate: unknown method "${method}"`);
    }

    // Apply Israeli-specific modifiers uniformly across all methods.
    const adjusted = this._applyIsraeliFactors(base, property);

    return {
      low: round0(adjusted.low),
      likely: round0(adjusted.likely),
      high: round0(adjusted.high),
      method,
      methodLabel: VALUATION_METHOD_LABELS[method],
      notes: adjusted.notes,
      breakdown: base.breakdown,
      meta: {
        engine: 'onyx-procurement/realestate/valuation',
        version: '1.0.0',
        currency: 'ILS',
        computedAt: new Date().toISOString(),
        asOfYear: this.options.asOfYear || new Date().getFullYear(),
        boiRate: this.options.boiRate,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 1. Comparable method — sales comparison
  // ─────────────────────────────────────────────────────────────
  /**
   * Sales-comparison / comparables approach.
   * @param {Object} params
   * @param {Property} params.subject
   * @param {ComparableSale[]} params.comparables
   * @param {Object} [params.adjustments]  Override adjustment weights
   * @returns {{ low:number, likely:number, high:number, method:string, notes:Array, breakdown:Object }}
   */
  comparableMethod({ subject, comparables, adjustments }) {
    if (!subject || typeof subject !== 'object') {
      throw new TypeError('comparableMethod: subject required');
    }
    if (!Array.isArray(comparables)) {
      throw new TypeError('comparableMethod: comparables must be an array');
    }
    const weights = { ...ADJUSTMENT_WEIGHTS, ...(adjustments || {}) };
    const notes = [];
    const breakdown = { comparablesAnalyzed: [], weights };

    if (comparables.length === 0) {
      notes.push(note(
        'אין עסקאות השוואה זמינות — לא ניתן להעריך בשיטה זו',
        'No comparables available — cannot value with this method',
        0,
      ));
      return {
        low: 0,
        likely: 0,
        high: 0,
        method: 'comparable',
        notes,
        breakdown,
      };
    }

    const subjYear = currentYear();
    const adjusted = [];
    for (let i = 0; i < comparables.length; i++) {
      const c = comparables[i];
      if (!c || !Number.isFinite(c.salePrice) || c.salePrice <= 0) continue;
      if (!Number.isFinite(c.sizeSqm) || c.sizeSqm <= 0) continue;

      // Base: price-per-sqm of the comparable applied to subject's size.
      const compPricePerSqm = c.salePrice / c.sizeSqm;
      let adjustedPricePerSqm = compPricePerSqm;
      const appliedAdjustments = [];

      // 1) Age adjustment
      if (Number.isFinite(c.yearBuilt) && Number.isFinite(subject.yearBuilt)) {
        const ageDiff = subject.yearBuilt - c.yearBuilt; // positive => subject is newer
        const effectiveDiff = clamp(ageDiff, -weights.ageCapYears, weights.ageCapYears);
        const ageAdj = effectiveDiff * weights.agePerYear;
        adjustedPricePerSqm *= 1 + ageAdj;
        appliedAdjustments.push({
          type: 'age',
          diff: ageDiff,
          pct: round2(ageAdj * 100),
          he: `התאמת גיל: ${ageDiff} שנים`,
          en: `Age adjustment: ${ageDiff} years`,
        });
      }

      // 2) Condition adjustment — subject vs comparable multiplier ratio
      const subjCondMult = conditionMultiplier(subject.condition);
      const compCondMult = conditionMultiplier(c.condition);
      if (compCondMult !== 0) {
        const condAdj = subjCondMult / compCondMult - 1;
        adjustedPricePerSqm *= 1 + condAdj;
        appliedAdjustments.push({
          type: 'condition',
          pct: round2(condAdj * 100),
          he: `התאמת מצב פיזי`,
          en: `Condition adjustment`,
        });
      }

      // 3) Location (distance) adjustment
      if (Number.isFinite(c.distanceKm) && c.distanceKm > 0) {
        const d = Math.min(c.distanceKm, weights.distanceCapKm);
        const locAdj = -(d * weights.distancePerKm);
        adjustedPricePerSqm *= 1 + locAdj;
        appliedAdjustments.push({
          type: 'location',
          diff: c.distanceKm,
          pct: round2(locAdj * 100),
          he: `התאמת מרחק: ${c.distanceKm} ק"מ`,
          en: `Location adjustment: ${c.distanceKm} km`,
        });
      }

      // 4) Floor adjustment (apartments)
      if (Number.isFinite(subject.floor) && Number.isFinite(c.floor)) {
        const floorDiff = clamp(subject.floor - c.floor, -weights.floorCapLevels, weights.floorCapLevels);
        const floorAdj = floorDiff * weights.floorPerLevel;
        adjustedPricePerSqm *= 1 + floorAdj;
        appliedAdjustments.push({
          type: 'floor',
          diff: floorDiff,
          pct: round2(floorAdj * 100),
          he: `התאמת קומה: ${floorDiff}`,
          en: `Floor adjustment: ${floorDiff}`,
        });
      }

      // 5) Amenity bumps
      const amenitiesAdj = (
        (subject.hasElevator === true && c.hasElevator === false ? weights.elevator : 0) +
        (subject.hasElevator === false && c.hasElevator === true ? -weights.elevator : 0) +
        (subject.hasParking === true && c.hasParking === false ? weights.parking : 0) +
        (subject.hasParking === false && c.hasParking === true ? -weights.parking : 0) +
        (subject.hasBalcony === true && c.hasBalcony === false ? weights.balcony : 0) +
        (subject.hasBalcony === false && c.hasBalcony === true ? -weights.balcony : 0) +
        (subject.hasSafeRoom === true && c.hasSafeRoom === false ? weights.safeRoom : 0) +
        (subject.hasSafeRoom === false && c.hasSafeRoom === true ? -weights.safeRoom : 0) +
        (subject.hasStorage === true && c.hasStorage === false ? weights.storage : 0) +
        (subject.hasStorage === false && c.hasStorage === true ? -weights.storage : 0)
      );
      if (amenitiesAdj !== 0) {
        adjustedPricePerSqm *= 1 + amenitiesAdj;
        appliedAdjustments.push({
          type: 'amenities',
          pct: round2(amenitiesAdj * 100),
          he: `התאמת שדרוגים`,
          en: `Amenities adjustment`,
        });
      }

      // Total adjustment sanity clamp vs baseline pricePerSqm
      const totalPct = adjustedPricePerSqm / compPricePerSqm - 1;
      if (Math.abs(totalPct) > weights.maxAdjustmentAbs) {
        const capped = compPricePerSqm * (1 + Math.sign(totalPct) * weights.maxAdjustmentAbs);
        adjustedPricePerSqm = capped;
        appliedAdjustments.push({
          type: 'cap',
          pct: round2(weights.maxAdjustmentAbs * 100 * Math.sign(totalPct)),
          he: 'תקרת התאמה הופעלה',
          en: 'Adjustment cap applied',
        });
      }

      adjusted.push({
        compIndex: i,
        compPricePerSqm: round2(compPricePerSqm),
        adjustedPricePerSqm: round2(adjustedPricePerSqm),
        appliedAdjustments,
      });
      breakdown.comparablesAnalyzed.push({
        compIndex: i,
        compPricePerSqm: round2(compPricePerSqm),
        adjustedPricePerSqm: round2(adjustedPricePerSqm),
        appliedAdjustments,
      });
    }

    if (adjusted.length === 0) {
      notes.push(note(
        'כל עסקאות ההשוואה נפסלו (חוסר נתונים)',
        'All comparables rejected (incomplete data)',
        0,
      ));
      return { low: 0, likely: 0, high: 0, method: 'comparable', notes, breakdown };
    }

    // Subject size required
    const subjectSize = Number.isFinite(subject.sizeSqm) && subject.sizeSqm > 0
      ? subject.sizeSqm
      : null;
    if (!subjectSize) {
      notes.push(note('חסר שטח לנכס הנישום', 'Subject size is missing', 0));
      return { low: 0, likely: 0, high: 0, method: 'comparable', notes, breakdown };
    }

    const prices = adjusted.map((a) => a.adjustedPricePerSqm);
    const sortedPrices = [...prices].sort((a, b) => a - b);
    const median = sortedPrices[Math.floor(sortedPrices.length / 2)];
    const mean = sortedPrices.reduce((s, v) => s + v, 0) / sortedPrices.length;
    // Likely: weighted between mean and median to resist outliers
    const likelyPricePerSqm = 0.5 * mean + 0.5 * median;
    const low = sortedPrices[0] * subjectSize;
    const high = sortedPrices[sortedPrices.length - 1] * subjectSize;
    const likely = likelyPricePerSqm * subjectSize;

    notes.push(note(
      `נותחו ${adjusted.length} עסקאות השוואה, חציון מחיר/מ"ר: ${round0(median)} ₪`,
      `Analyzed ${adjusted.length} comparables, median price/sqm: ${round0(median)} ILS`,
      0,
    ));

    breakdown.subjectSize = subjectSize;
    breakdown.pricePerSqm = {
      min: round2(sortedPrices[0]),
      max: round2(sortedPrices[sortedPrices.length - 1]),
      median: round2(median),
      mean: round2(mean),
      likely: round2(likelyPricePerSqm),
    };

    return {
      low,
      likely,
      high,
      method: 'comparable',
      notes,
      breakdown,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 2. Income method — DCF / cap rate
  // ─────────────────────────────────────────────────────────────
  /**
   * Income-capitalization / DCF approach.
   *
   * Two parallel paths:
   *   • Direct cap: V = NOI / capRate
   *   • 10-year DCF with terminal cap
   *
   * The "likely" is the direct cap; low/high come from the DCF with shocks
   * on cap rate and growth assumptions (±100bp and ±50bp respectively).
   *
   * @param {Object} params
   * @param {number} params.rentalIncome    annual gross rent ILS
   * @param {number} [params.operatingExpenses]  annual operating expenses ILS
   * @param {number} [params.capRate]       cap rate (fraction); if omitted, auto-detected
   * @param {number} [params.vacancy]       vacancy + collection loss (fraction of gross)
   * @param {number} [params.growthRate]    annual rent growth (fraction), default 2%
   * @param {number} [params.discountRate]  WACC for DCF (fraction), default capRate + 150bp
   * @param {number} [params.holdYears]     DCF hold period, default 10
   * @param {string} [params.propertyType]
   */
  incomeMethod({
    rentalIncome,
    operatingExpenses = 0,
    capRate,
    vacancy = 0.05,
    growthRate = 0.02,
    discountRate,
    holdYears = 10,
    propertyType = 'default',
  }) {
    if (!Number.isFinite(rentalIncome) || rentalIncome <= 0) {
      throw new TypeError('incomeMethod: rentalIncome must be a positive number');
    }
    if (operatingExpenses < 0 || !Number.isFinite(operatingExpenses)) {
      operatingExpenses = 0;
    }
    const vac = clamp(Number.isFinite(vacancy) ? vacancy : 0.05, 0, 0.6);
    const gRate = Number.isFinite(growthRate) ? growthRate : 0.02;
    const years = Number.isFinite(holdYears) && holdYears > 0 ? Math.floor(holdYears) : 10;

    const effectiveGross = rentalIncome * (1 - vac);
    const noi = effectiveGross - operatingExpenses;

    const autoCap = this.getBoiAdjustedCapRate(propertyType);
    const cap = Number.isFinite(capRate) && capRate > 0 ? capRate : autoCap;
    const disc = Number.isFinite(discountRate) && discountRate > 0
      ? discountRate
      : cap + 0.015; // default risk premium = 150 bp above cap

    const notes = [];
    notes.push(note(
      `הכנסה שנתית נטו (NOI): ${round0(noi)} ₪`,
      `Annual NOI: ${round0(noi)} ILS`,
      0,
    ));
    notes.push(note(
      `שיעור היוון בשימוש: ${(cap * 100).toFixed(2)}%`,
      `Cap rate used: ${(cap * 100).toFixed(2)}%`,
      0,
    ));

    // Direct cap — "likely" anchor
    const directCap = noi / cap;

    // DCF — forward NOI with growth, terminal value = NOI_{N+1} / cap
    let pvSum = 0;
    let cfYear = noi;
    const cashFlows = [];
    for (let y = 1; y <= years; y++) {
      cfYear *= 1 + gRate;
      const pv = cfYear / Math.pow(1 + disc, y);
      pvSum += pv;
      cashFlows.push({ year: y, noi: round0(cfYear), pv: round0(pv) });
    }
    const terminalNoi = cfYear * (1 + gRate);
    const terminalValue = terminalNoi / cap;
    const terminalPv = terminalValue / Math.pow(1 + disc, years);
    const dcfValue = pvSum + terminalPv;

    // Sensitivity shocks
    const capLow = Math.max(0.001, cap - 0.01);
    const capHigh = cap + 0.01;
    const lowValue = Math.min(noi / capHigh, dcfValue * 0.9);
    const highValue = Math.max(noi / capLow, dcfValue * 1.1);

    // Likely: weighted blend of direct cap and DCF
    const likely = 0.6 * directCap + 0.4 * dcfValue;

    notes.push(note(
      `גישת היוון ישיר: ${round0(directCap)} ₪`,
      `Direct-cap value: ${round0(directCap)} ILS`,
      directCap,
    ));
    notes.push(note(
      `גישת DCF ל-${years} שנים: ${round0(dcfValue)} ₪`,
      `DCF value (${years}y hold): ${round0(dcfValue)} ILS`,
      dcfValue,
    ));

    return {
      low: lowValue,
      likely,
      high: highValue,
      method: 'income',
      notes,
      breakdown: {
        effectiveGross: round0(effectiveGross),
        noi: round0(noi),
        capRate: cap,
        discountRate: disc,
        directCap: round0(directCap),
        dcfValue: round0(dcfValue),
        terminalNoi: round0(terminalNoi),
        terminalValue: round0(terminalValue),
        cashFlows,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 3. Cost method — land + replacement cost − depreciation
  // ─────────────────────────────────────────────────────────────
  /**
   * Cost approach.
   *
   *   V = landValue + (replacementCost − depreciation)
   *
   * If `depreciation` is not provided but `yearBuilt` is, the engine
   * applies an age-based straight-line depreciation using
   * `DEPRECIATION_TABLES` and applies an additional condition multiplier.
   *
   * @param {Object} params
   * @param {number} params.landValue
   * @param {number} params.replacementCost
   * @param {number|Object} [params.depreciation]  either absolute ILS or {fraction, type, ...}
   * @param {number} [params.yearBuilt]
   * @param {string} [params.propertyType]
   * @param {string} [params.condition]
   * @param {number} [params.asOfYear]
   */
  costMethod({
    landValue,
    replacementCost,
    depreciation,
    yearBuilt,
    propertyType,
    condition,
    asOfYear,
  }) {
    if (!Number.isFinite(landValue) || landValue < 0) {
      throw new TypeError('costMethod: landValue must be a non-negative number');
    }
    if (!Number.isFinite(replacementCost) || replacementCost < 0) {
      throw new TypeError('costMethod: replacementCost must be a non-negative number');
    }

    const notes = [];
    const key = depreciationKey(propertyType);
    const table = DEPRECIATION_TABLES[key];
    const refYear = asOfYear || currentYear();

    let depAmount;
    let depFraction;
    let reason;
    if (Number.isFinite(depreciation)) {
      depAmount = depreciation;
      depFraction = replacementCost > 0 ? depreciation / replacementCost : 0;
      reason = 'provided';
    } else if (depreciation && typeof depreciation === 'object' && Number.isFinite(depreciation.fraction)) {
      depFraction = clamp(depreciation.fraction, 0, 1);
      depAmount = replacementCost * depFraction;
      reason = 'fraction';
    } else if (Number.isFinite(yearBuilt)) {
      const age = Math.max(0, refYear - yearBuilt);
      const linearFraction = Math.min(age * table.annual, 1 - table.minValueFactor);
      const condMult = conditionMultiplier(condition);
      // worse condition accelerates depreciation, better condition decelerates
      const condAdjustedFraction = clamp(linearFraction * (2 - condMult), 0, 1 - table.minValueFactor);
      depFraction = condAdjustedFraction;
      depAmount = replacementCost * depFraction;
      reason = `age ${age}y, useful life ${table.usefulLife}y, condition ${condition || 'default'}`;
    } else {
      depAmount = 0;
      depFraction = 0;
      reason = 'not provided';
    }

    notes.push(note(
      `פחת מבנה: ${(depFraction * 100).toFixed(1)}% (${round0(depAmount)} ₪), ${reason}`,
      `Depreciation: ${(depFraction * 100).toFixed(1)}% (${round0(depAmount)} ILS), ${reason}`,
      -depAmount,
    ));

    const depreciatedBuilding = Math.max(0, replacementCost - depAmount);
    const likely = landValue + depreciatedBuilding;

    // Uncertainty band — ±10% around likely (cost method is the widest)
    const low = likely * 0.90;
    const high = likely * 1.10;

    return {
      low,
      likely,
      high,
      method: 'cost',
      notes,
      breakdown: {
        landValue: round0(landValue),
        replacementCost: round0(replacementCost),
        depreciationAmount: round0(depAmount),
        depreciationFraction: round2(depFraction),
        depreciatedBuilding: round0(depreciatedBuilding),
        usefulLife: table.usefulLife,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 4. Residual method — for development sites
  // ─────────────────────────────────────────────────────────────
  /**
   * Residual approach — backs out land value for development sites.
   *
   *   Residual = GDV − constructionCost − softCosts − contingency
   *                  − profit − finance
   *
   * Inputs accept absolute ILS or fractions relative to GDV.
   *
   * @param {Object} params
   * @param {number} params.gdv                  Gross development value (ILS)
   * @param {number} params.constructionCost     Construction cost (ILS) OR fraction of GDV
   * @param {number|Object} [params.profit]      Required developer profit (fraction of GDV or object)
   * @param {number|Object} [params.finance]     Finance cost (fraction of GDV or object)
   * @param {number|Object} [params.softCosts]   Design, permits, consultants
   * @param {number|Object} [params.contingency]
   */
  residualMethod({ gdv, constructionCost, profit, finance, softCosts, contingency }) {
    if (!Number.isFinite(gdv) || gdv <= 0) {
      throw new TypeError('residualMethod: gdv must be a positive number');
    }
    if (!Number.isFinite(constructionCost) || constructionCost < 0) {
      throw new TypeError('residualMethod: constructionCost must be a non-negative number');
    }

    // Helpers to resolve either absolute ILS or fraction of GDV.
    const resolve = (val, defaultFraction) => {
      if (val === undefined || val === null) {
        return { amount: gdv * defaultFraction, fraction: defaultFraction, source: 'default' };
      }
      if (Number.isFinite(val)) {
        // Heuristic: if <= 1, treat as fraction; else absolute.
        if (val <= 1) {
          return { amount: gdv * val, fraction: val, source: 'fraction' };
        }
        return { amount: val, fraction: val / gdv, source: 'absolute' };
      }
      if (typeof val === 'object') {
        if (Number.isFinite(val.amount)) {
          return { amount: val.amount, fraction: val.amount / gdv, source: 'absolute' };
        }
        if (Number.isFinite(val.fraction)) {
          return { amount: gdv * val.fraction, fraction: val.fraction, source: 'fraction' };
        }
      }
      return { amount: gdv * defaultFraction, fraction: defaultFraction, source: 'default' };
    };

    // Construction cost can also be absolute (in which case constructionCost > 1 by a lot).
    let constructionAmt = constructionCost;
    if (constructionCost <= 1) {
      constructionAmt = gdv * constructionCost;
    }
    const profitR = resolve(profit, 0.17); // 17% typical developer profit
    const financeR = resolve(finance, 0.05); // 5% financing cost
    const softR = resolve(softCosts, 0.08); // 8% soft costs (design, permits, VAT on services)
    const contR = resolve(contingency, 0.05); // 5% contingency

    const totalCosts = constructionAmt + softR.amount + contR.amount + profitR.amount + financeR.amount;
    const residual = gdv - totalCosts;

    const notes = [];
    notes.push(note(
      `ערך פיתוח גולמי (GDV): ${round0(gdv)} ₪`,
      `Gross development value: ${round0(gdv)} ILS`,
      0,
    ));
    notes.push(note(
      `עלות בנייה: ${round0(constructionAmt)} ₪`,
      `Construction cost: ${round0(constructionAmt)} ILS`,
      -constructionAmt,
    ));
    notes.push(note(
      `רווח יזם נדרש: ${(profitR.fraction * 100).toFixed(1)}% (${round0(profitR.amount)} ₪)`,
      `Developer profit required: ${(profitR.fraction * 100).toFixed(1)}% (${round0(profitR.amount)} ILS)`,
      -profitR.amount,
    ));
    notes.push(note(
      `מימון: ${(financeR.fraction * 100).toFixed(1)}% (${round0(financeR.amount)} ₪)`,
      `Finance: ${(financeR.fraction * 100).toFixed(1)}% (${round0(financeR.amount)} ILS)`,
      -financeR.amount,
    ));

    if (residual <= 0) {
      notes.push(note(
        'שייר שלילי — הפרויקט אינו כדאי על בסיס ההנחות שניתנו',
        'Negative residual — project is not viable on given assumptions',
        0,
      ));
    }

    // Uncertainty from GDV ±5% and construction ±10%
    const lowResidual = (gdv * 0.95) - (constructionAmt * 1.10 + softR.amount + contR.amount + profitR.amount + financeR.amount);
    const highResidual = (gdv * 1.05) - (constructionAmt * 0.90 + softR.amount + contR.amount + profitR.amount + financeR.amount);

    return {
      low: Math.max(0, lowResidual),
      likely: Math.max(0, residual),
      high: Math.max(0, highResidual),
      method: 'residual',
      notes,
      breakdown: {
        gdv: round0(gdv),
        constructionCost: round0(constructionAmt),
        softCosts: round0(softR.amount),
        contingency: round0(contR.amount),
        profit: round0(profitR.amount),
        finance: round0(financeR.amount),
        totalCosts: round0(totalCosts),
        residual: round0(residual),
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Israeli-factor application — shared across all methods
  // ─────────────────────────────────────────────────────────────
  /**
   * Apply Israeli-specific factors (tabu, preserved tenant, committee
   * disputes, TAMA 38, Pinui-Binui, neighborhood index) to a base result.
   * @param {Object} base  Base result from a method
   * @param {Property} property
   * @returns {{ low:number, likely:number, high:number, notes:Array }}
   */
  _applyIsraeliFactors(base, property) {
    let likely = base.likely;
    let low = base.low;
    let high = base.high;
    const notes = [...(base.notes || [])];

    // Neighborhood index (Madlan-style)
    if (property.city) {
      const idx = this.neighborhoodIndex(property.city, property.neighborhood);
      if (idx !== 1.0 && idx > 0) {
        likely *= idx;
        low *= idx;
        high *= idx;
        notes.push(note(
          `מדד שכונה: ${idx.toFixed(2)} (${property.neighborhood || property.city})`,
          `Neighborhood index: ${idx.toFixed(2)} (${property.neighborhood || property.city})`,
          0,
        ));
      }
    }

    // Tabu
    const tabuKey = property.tabuStatus || 'clean';
    const tabu = ISRAELI_FACTORS.tabu[tabuKey] || ISRAELI_FACTORS.tabu.clean;
    if (tabu.factor !== 1.0) {
      likely *= tabu.factor;
      // widen the band
      low *= tabu.factor * (1 - tabu.rangeSpread);
      high *= tabu.factor * (1 + tabu.rangeSpread);
      notes.push(note(tabu.he, tabu.en, (tabu.factor - 1) * base.likely));
    }

    // Preserved tenant
    if (property.hasPreservedTenant === true) {
      const t = ISRAELI_FACTORS.preservedTenant.present;
      likely *= t.factor;
      low *= t.factor * (1 - t.rangeSpread);
      high *= t.factor * (1 + t.rangeSpread);
      notes.push(note(t.he, t.en, (t.factor - 1) * base.likely));
    }

    // Committee dispute
    if (property.hasCommitteeDispute === true) {
      const c = ISRAELI_FACTORS.committeeDispute.present;
      likely *= c.factor;
      low *= c.factor * (1 - c.rangeSpread);
      high *= c.factor * (1 + c.rangeSpread);
      notes.push(note(c.he, c.en, (c.factor - 1) * base.likely));
    }

    // TAMA 38 potential
    if (property.tama38 && typeof property.tama38 === 'object') {
      const tama = this._resolveTama38(property.tama38);
      if (tama && tama.factor !== 1.0) {
        likely *= tama.factor;
        low *= tama.factor * (1 - tama.rangeSpread);
        high *= tama.factor * (1 + tama.rangeSpread);
        notes.push(note(tama.he, tama.en, (tama.factor - 1) * base.likely));
      }
    }

    // Pinui-Binui potential
    if (property.pinuiBinui && typeof property.pinuiBinui === 'object') {
      let pb = null;
      if (property.pinuiBinui.approved) pb = ISRAELI_FACTORS.pinuiBinui.approved;
      else if (property.pinuiBinui.eligible) pb = ISRAELI_FACTORS.pinuiBinui.eligible;
      if (pb && pb.factor !== 1.0) {
        likely *= pb.factor;
        low *= pb.factor * (1 - pb.rangeSpread);
        high *= pb.factor * (1 + pb.rangeSpread);
        notes.push(note(pb.he, pb.en, (pb.factor - 1) * base.likely));
      }
    }

    // Ensure ordering
    if (low > likely) low = likely * 0.95;
    if (high < likely) high = likely * 1.05;

    return { low, likely, high, notes };
  }

  _resolveTama38(tama) {
    if (!tama) return null;
    // Precedence: permit > signed > potential, phase 2 > phase 1
    if (tama.phase2 === true) {
      if (tama.permitIssued) return ISRAELI_FACTORS.tama38.phase2PermitIssued;
      if (tama.signed) return ISRAELI_FACTORS.tama38.phase2Signed;
      return ISRAELI_FACTORS.tama38.phase2Potential;
    }
    if (tama.phase1 === true) {
      if (tama.permitIssued) return ISRAELI_FACTORS.tama38.phase1PermitIssued;
      if (tama.signed) return ISRAELI_FACTORS.tama38.phase1Signed;
      return ISRAELI_FACTORS.tama38.phase1Potential;
    }
    return ISRAELI_FACTORS.tama38.none;
  }

  // ─────────────────────────────────────────────────────────────
  // Comparables fetch — stub for רשות המסים — מחירי עסקאות
  // ─────────────────────────────────────────────────────────────
  /**
   * Fetch comparable sales for a parcel from the Israeli Tax Authority's
   * "Real Estate Sales Prices" database (רשות המסים — מחירי עסקאות נדל"ן).
   *
   * This is a stub — in production this is wired to the official open-data
   * endpoint. When an injected `comparablesFetcher` is provided via the
   * constructor options, it is used instead.
   *
   * @param {string|number} gush    גוש
   * @param {string|number} helka   חלקה
   * @param {number} [radiusKm]     Search radius in km (default 1)
   * @returns {Promise<ComparableSale[]>}
   */
  async fetchComparables(gush, helka, radiusKm = 1) {
    if (gush === undefined || helka === undefined) {
      throw new TypeError('fetchComparables: gush and helka are required');
    }
    if (typeof this.options.comparablesFetcher === 'function') {
      const result = await this.options.comparablesFetcher(gush, helka, radiusKm);
      return Array.isArray(result) ? result : [];
    }
    // Stub — empty result with a descriptive note attached as property.
    const stub = [];
    stub._source = 'stub:rashut-hamisim:nadlan';
    stub._note = {
      he: 'גישה חיה לרשות המסים אינה מחוברת — הזרק comparablesFetcher דרך constructor',
      en: 'Live access to the Israel Tax Authority is not wired — inject comparablesFetcher via constructor',
    };
    stub._query = { gush, helka, radiusKm };
    return stub;
  }

  // ─────────────────────────────────────────────────────────────
  // Bank of Israel rate influence
  // ─────────────────────────────────────────────────────────────
  /**
   * Return the Bank of Israel base rate that this valuator is using.
   * In production this wraps a live feed; stubbed to the default here.
   * @returns {number}
   */
  getMsyOPIRate() {
    return this.options.boiRate;
  }

  /**
   * Return a cap rate for a property type, adjusted by the spread between
   * current BOI rate and the long-run average (3.5% assumed).
   * @param {string} [propertyType]
   * @returns {number}
   */
  getBoiAdjustedCapRate(propertyType = 'default') {
    const baseline = CAP_RATE_BY_TYPE[capRateKey(propertyType)];
    const boi = this.options.boiRate;
    const longRun = 0.035; // assumed 3.5% long-run BOI base
    const spread = boi - longRun;
    // Cap rates move ~0.5 to 0.7 beta vs the base rate.
    const beta = 0.6;
    return Math.max(0.02, baseline + spread * beta);
  }

  // ─────────────────────────────────────────────────────────────
  // Neighborhood index — Madlan-style
  // ─────────────────────────────────────────────────────────────
  /**
   * Return a neighborhood multiplier for (city, neighborhood).
   * Falls back in order:
   *   1. exact "city|neighborhood"
   *   2. "city|default"
   *   3. global default 1.0
   *
   * @param {string} city
   * @param {string} [neighborhood]
   * @returns {number}
   */
  neighborhoodIndex(city, neighborhood) {
    if (!city) return 1.0;
    const map = this.options.neighborhoodIndex;
    const c = String(city).trim();
    const n = neighborhood ? String(neighborhood).trim() : '';
    if (n && Object.prototype.hasOwnProperty.call(map, `${c}|${n}`)) {
      return map[`${c}|${n}`];
    }
    if (Object.prototype.hasOwnProperty.call(map, `${c}|default`)) {
      return map[`${c}|default`];
    }
    return map.default || 1.0;
  }
}

// ═══════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════

module.exports = {
  PropertyValuator,
  ADJUSTMENT_WEIGHTS,
  ISRAELI_FACTORS,
  NEIGHBORHOOD_INDEX_BASE,
  BANK_OF_ISRAEL_DEFAULT_RATE,
  CAP_RATE_BY_TYPE,
  DEPRECIATION_TABLES,
  VALUATION_METHOD_LABELS,
  _internals: {
    round0,
    round2,
    clamp,
    parseIsoDate,
    yearsBetween,
    currentYear,
    conditionMultiplier,
    depreciationKey,
    capRateKey,
  },
};
