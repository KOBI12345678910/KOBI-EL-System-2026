/**
 * dividend-withholding.js — Israeli dividend withholding tax calculator
 *                           (מס דיבידנד במקור / ניכוי במקור מדיבידנד).
 * Agent Y-009 / Swarm 3C / Techno-Kol Uzi Mega-ERP — Wave 2026
 * ---------------------------------------------------------------------------
 *
 * Withholding tax on דיבידנד distributed by an Israeli resident company
 * ("המשלם") to its shareholders ("המקבל"). The payer is legally obligated
 * to withhold tax at source and remit it to רשות המסים.
 *
 * Legal basis (פקודת מס הכנסה — 2026 text):
 *   - סעיף 125ב         — 25% / 30% rate for Israeli individual
 *   - סעיף 126(ב)       — 0% inter-company exemption (Israeli co. → Israeli co.)
 *   - סעיף 164          — duty to withhold at source
 *   - סעיף 170          — withholding on payments to foreign residents
 *   - סעיף 14(א)        — 10-year exemption for עולה חדש / תושב חוזר ותיק
 *   - כללי מס הכנסה (ניכוי מריבית, דיבידנד ורווחים מסוימים), התשס"ו-2005
 *   - Tax treaties (אמנות למניעת כפל מס) override domestic rates when
 *     the recipient is a treaty-country resident.
 *
 * Key 2026 rates (Israel):
 *   • Israeli individual — regular shareholder          25%
 *   • Israeli individual — בעל מניות מהותי (≥10%)       30%
 *   • Israeli company    → Israeli company               0% (§126(ב))
 *   • Foreign individual — default                      25% / treaty
 *   • Foreign individual — substantial shareholder      30% / treaty
 *   • Foreign company    — default                      25% / treaty
 *   • Foreign company    — eligible OECD (≥10%)         15% / treaty
 *   • עולה חדש (first 10 years) — 0% on dividends from
 *     foreign sources; domestic dividends still 25/30%.
 *
 * ---------------------------------------------------------------------------
 * Exports:
 *   - computeDividendWithholding(params)  → { netPaid, withheld, rate, … }
 *   - loadTreatyRates()                   → treaty rate table (country → rates)
 *   - applyTaxCredit(gross, wht)          → { creditable, carryForward, … }
 *   - generateForm867B(dividends)         → annual form 867B (דוח דיבידנד)
 *   - SHAREHOLDER_TYPES                    — enum of recipient types
 *   - DOMESTIC_RATES                       — the Israeli rate table (2026)
 *   - SUBSTANTIAL_SHAREHOLDER_THRESHOLD    — 10% (סעיף 88)
 *   - createCalculator(options)           → isolated instance for tests
 *
 * ---------------------------------------------------------------------------
 * Principle: **לא מוחקים — רק משדרגים ומגדלים**.
 *   We never mutate or delete input records. Every call returns a fresh
 *   immutable result object. Zero external dependencies. Bilingual
 *   Hebrew / English throughout.
 *
 * Reference: this module sits next to form-857.js (non-employee WHT) and
 *            form-builders.js (annual individual 1301). It feeds the
 *            annual 867B consolidated dividend report that every paying
 *            company must submit to רשות המסים by March 31 each year.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Shareholder type enum — kind of recipient receiving the dividend.
 * Matches the 867B form column "סוג המקבל".
 */
const SHAREHOLDER_TYPES = Object.freeze({
  ISRAELI_INDIVIDUAL: 'israeli_individual',
  ISRAELI_COMPANY: 'israeli_company',
  FOREIGN_INDIVIDUAL: 'foreign_individual',
  FOREIGN_COMPANY: 'foreign_company',
});

/** סעיף 88 — "בעל מניות מהותי" — 10% ownership threshold (any class). */
const SUBSTANTIAL_SHAREHOLDER_THRESHOLD = 0.10;

/** 0.25% rounding tolerance for numeric assertions (pennies). */
const ROUNDING_EPSILON = 0.005;

/**
 * Domestic (non-treaty) Israeli rates — 2026 tax year.
 * All values are decimal fractions (0.25 = 25%).
 */
const DOMESTIC_RATES = Object.freeze({
  // Israeli individual — regular shareholder
  ISRAELI_INDIVIDUAL_REGULAR: 0.25,
  // Israeli individual — בעל מניות מהותי (≥10% holding)
  ISRAELI_INDIVIDUAL_SUBSTANTIAL: 0.30,
  // Israeli company — inter-company dividend, סעיף 126(ב)
  ISRAELI_COMPANY_INTER_CO: 0.00,
  // Foreign individual — default (may be lowered by treaty)
  FOREIGN_INDIVIDUAL_DEFAULT: 0.25,
  // Foreign individual substantial shareholder — default
  FOREIGN_INDIVIDUAL_SUBSTANTIAL: 0.30,
  // Foreign company — default (may be lowered by treaty)
  FOREIGN_COMPANY_DEFAULT: 0.25,
  // Foreign company — special OECD lowered rate for ≥10% holdings
  FOREIGN_COMPANY_OECD_10PCT: 0.15,
  // Oleh chadash (§14) — dividends from foreign sources during 10-year window
  OLEH_FOREIGN_SOURCE: 0.00,
});

// ═══════════════════════════════════════════════════════════════════════════
// Treaty rate table
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Returns the treaty rate table used by computeDividendWithholding when a
 * treaty lookup is requested. The rates reflect the *withholding cap* that
 * Israel agreed to in each bilateral DTA (Double Tax Agreement).
 *
 * Each record:
 *   {
 *     country:     ISO-3166 alpha-2 code,
 *     name_he:     Hebrew country name,
 *     name_en:     English country name,
 *     portfolio:   rate for a "small" shareholder (< substantial threshold),
 *     substantial: rate for a shareholder meeting the DTA substantial-ownership
 *                  test (usually ≥10%, sometimes ≥25%),
 *     threshold:   ownership fraction that triggers the substantial rate,
 *     article:     treaty article (usually art. 10),
 *     signed:      year the DTA was signed,
 *     notes:       free-text annotation (bilingual).
 *   }
 *
 * Rates are as-of 2026-01-01 and cover Israel's 35+ active treaties. When
 * a country is not in the table, the caller should fall back to the domestic
 * 25% / 30% rate.
 */
function loadTreatyRates() {
  return Object.freeze({
    US: {
      country: 'US',
      name_he: 'ארצות הברית',
      name_en: 'United States',
      portfolio: 0.25,
      substantial: 0.125,
      threshold: 0.10,
      article: 'Art.12 (US-IL 1975 DTA, 1993 Protocol)',
      signed: 1975,
      notes: 'Substantial holder = ≥10% voting stock | בעל מניות ≥10% זכאי ל-12.5%',
    },
    GB: {
      country: 'GB',
      name_he: 'בריטניה',
      name_en: 'United Kingdom',
      portfolio: 0.15,
      substantial: 0.05,
      threshold: 0.10,
      article: 'Art.10 (UK-IL 2019 DTA)',
      signed: 2019,
      notes: 'New protocol effective 2020 | פרוטוקול חדש 2020',
    },
    UK: {
      // Convenience alias for legacy "UK" input — redirects to GB record.
      country: 'GB',
      name_he: 'בריטניה',
      name_en: 'United Kingdom',
      portfolio: 0.15,
      substantial: 0.05,
      threshold: 0.10,
      article: 'Art.10 (UK-IL 2019 DTA)',
      signed: 2019,
      notes: 'Alias for GB',
    },
    DE: {
      country: 'DE',
      name_he: 'גרמניה',
      name_en: 'Germany',
      portfolio: 0.10,
      substantial: 0.05,
      threshold: 0.10,
      article: 'Art.10 (DE-IL 2014 DTA)',
      signed: 2014,
      notes: 'Protocol 2016 | פרוטוקול 2016',
    },
    FR: {
      country: 'FR',
      name_he: 'צרפת',
      name_en: 'France',
      portfolio: 0.15,
      substantial: 0.05,
      threshold: 0.10,
      article: 'Art.10 (FR-IL 1995 DTA)',
      signed: 1995,
      notes: '',
    },
    IT: {
      country: 'IT',
      name_he: 'איטליה',
      name_en: 'Italy',
      portfolio: 0.15,
      substantial: 0.10,
      threshold: 0.10,
      article: 'Art.10 (IT-IL 1995 DTA)',
      signed: 1995,
      notes: '',
    },
    ES: {
      country: 'ES',
      name_he: 'ספרד',
      name_en: 'Spain',
      portfolio: 0.10,
      substantial: 0.10,
      threshold: 0.10,
      article: 'Art.10 (ES-IL 1999 DTA)',
      signed: 1999,
      notes: '',
    },
    NL: {
      country: 'NL',
      name_he: 'הולנד',
      name_en: 'Netherlands',
      portfolio: 0.15,
      substantial: 0.05,
      threshold: 0.25,
      article: 'Art.10 (NL-IL 1973 DTA)',
      signed: 1973,
      notes: '25% threshold for 5% rate | רף 25% לצורך מס 5%',
    },
    CH: {
      country: 'CH',
      name_he: 'שווייץ',
      name_en: 'Switzerland',
      portfolio: 0.15,
      substantial: 0.05,
      threshold: 0.10,
      article: 'Art.10 (CH-IL 2003 DTA)',
      signed: 2003,
      notes: '',
    },
    CA: {
      country: 'CA',
      name_he: 'קנדה',
      name_en: 'Canada',
      portfolio: 0.15,
      substantial: 0.05,
      threshold: 0.25,
      article: 'Art.10 (CA-IL 2016 DTA)',
      signed: 2016,
      notes: 'Protocol 2018 | פרוטוקול 2018',
    },
    CN: {
      country: 'CN',
      name_he: 'סין',
      name_en: 'China',
      portfolio: 0.10,
      substantial: 0.10,
      threshold: 0.10,
      article: 'Art.10 (CN-IL 1995 DTA)',
      signed: 1995,
      notes: '',
    },
    IN: {
      country: 'IN',
      name_he: 'הודו',
      name_en: 'India',
      portfolio: 0.10,
      substantial: 0.10,
      threshold: 0.10,
      article: 'Art.10 (IN-IL 1996 DTA, 2016 Protocol)',
      signed: 1996,
      notes: '',
    },
    JP: {
      country: 'JP',
      name_he: 'יפן',
      name_en: 'Japan',
      portfolio: 0.15,
      substantial: 0.05,
      threshold: 0.25,
      article: 'Art.10 (JP-IL 1993 DTA, 2022 Protocol)',
      signed: 1993,
      notes: 'Revised 2022 | תוקן 2022',
    },
    KR: {
      country: 'KR',
      name_he: 'דרום קוריאה',
      name_en: 'South Korea',
      portfolio: 0.15,
      substantial: 0.05,
      threshold: 0.10,
      article: 'Art.10 (KR-IL 1997 DTA)',
      signed: 1997,
      notes: '',
    },
    AU: {
      country: 'AU',
      name_he: 'אוסטרליה',
      name_en: 'Australia',
      portfolio: 0.15,
      substantial: 0.05,
      threshold: 0.10,
      article: 'Art.10 (AU-IL 2019 DTA)',
      signed: 2019,
      notes: '',
    },
    SG: {
      country: 'SG',
      name_he: 'סינגפור',
      name_en: 'Singapore',
      portfolio: 0.05,
      substantial: 0.05,
      threshold: 0.10,
      article: 'Art.10 (SG-IL 2005 DTA)',
      signed: 2005,
      notes: '',
    },
    AT: {
      country: 'AT',
      name_he: 'אוסטריה',
      name_en: 'Austria',
      portfolio: 0.25,
      substantial: 0.25,
      threshold: 0.25,
      article: 'Art.10 (AT-IL 1970 DTA, 2017 Protocol)',
      signed: 1970,
      notes: 'Old DTA — high rate',
    },
    BE: {
      country: 'BE',
      name_he: 'בלגיה',
      name_en: 'Belgium',
      portfolio: 0.15,
      substantial: 0.15,
      threshold: 0.25,
      article: 'Art.10 (BE-IL 1972 DTA)',
      signed: 1972,
      notes: '',
    },
    IE: {
      country: 'IE',
      name_he: 'אירלנד',
      name_en: 'Ireland',
      portfolio: 0.10,
      substantial: 0.10,
      threshold: 0.10,
      article: 'Art.10 (IE-IL 1995 DTA)',
      signed: 1995,
      notes: '',
    },
    LU: {
      country: 'LU',
      name_he: 'לוקסמבורג',
      name_en: 'Luxembourg',
      portfolio: 0.15,
      substantial: 0.05,
      threshold: 0.10,
      article: 'Art.10 (LU-IL 2004 DTA)',
      signed: 2004,
      notes: '',
    },
    SE: {
      country: 'SE',
      name_he: 'שבדיה',
      name_en: 'Sweden',
      portfolio: 0.15,
      substantial: 0.00,
      threshold: 0.25,
      article: 'Art.10 (SE-IL 1959 DTA, 2020 Protocol)',
      signed: 1959,
      notes: '0% for ≥25% holder | פטור לבעלי ≥25%',
    },
    NO: {
      country: 'NO',
      name_he: 'נורווגיה',
      name_en: 'Norway',
      portfolio: 0.25,
      substantial: 0.10,
      threshold: 0.50,
      article: 'Art.10 (NO-IL 1966 DTA)',
      signed: 1966,
      notes: '',
    },
    DK: {
      country: 'DK',
      name_he: 'דנמרק',
      name_en: 'Denmark',
      portfolio: 0.10,
      substantial: 0.00,
      threshold: 0.10,
      article: 'Art.10 (DK-IL 2009 DTA)',
      signed: 2009,
      notes: '0% at ≥10% holding',
    },
    FI: {
      country: 'FI',
      name_he: 'פינלנד',
      name_en: 'Finland',
      portfolio: 0.15,
      substantial: 0.05,
      threshold: 0.10,
      article: 'Art.10 (FI-IL 1997 DTA)',
      signed: 1997,
      notes: '',
    },
    PT: {
      country: 'PT',
      name_he: 'פורטוגל',
      name_en: 'Portugal',
      portfolio: 0.15,
      substantial: 0.05,
      threshold: 0.25,
      article: 'Art.10 (PT-IL 2006 DTA)',
      signed: 2006,
      notes: '',
    },
    GR: {
      country: 'GR',
      name_he: 'יוון',
      name_en: 'Greece',
      portfolio: 0.25,
      substantial: 0.25,
      threshold: 0.10,
      article: 'Art.10 (GR-IL 1995 DTA)',
      signed: 1995,
      notes: '',
    },
    CZ: {
      country: 'CZ',
      name_he: 'צ׳כיה',
      name_en: 'Czech Republic',
      portfolio: 0.15,
      substantial: 0.05,
      threshold: 0.15,
      article: 'Art.10 (CZ-IL 1993 DTA)',
      signed: 1993,
      notes: '',
    },
    PL: {
      country: 'PL',
      name_he: 'פולין',
      name_en: 'Poland',
      portfolio: 0.10,
      substantial: 0.05,
      threshold: 0.10,
      article: 'Art.10 (PL-IL 1991 DTA)',
      signed: 1991,
      notes: '',
    },
    HU: {
      country: 'HU',
      name_he: 'הונגריה',
      name_en: 'Hungary',
      portfolio: 0.15,
      substantial: 0.05,
      threshold: 0.10,
      article: 'Art.10 (HU-IL 1991 DTA)',
      signed: 1991,
      notes: '',
    },
    RO: {
      country: 'RO',
      name_he: 'רומניה',
      name_en: 'Romania',
      portfolio: 0.15,
      substantial: 0.15,
      threshold: 0.10,
      article: 'Art.10 (RO-IL 1997 DTA)',
      signed: 1997,
      notes: '',
    },
    RU: {
      country: 'RU',
      name_he: 'רוסיה',
      name_en: 'Russia',
      portfolio: 0.10,
      substantial: 0.10,
      threshold: 0.10,
      article: 'Art.10 (RU-IL 1994 DTA)',
      signed: 1994,
      notes: 'Status under review post-2022',
    },
    UA: {
      country: 'UA',
      name_he: 'אוקראינה',
      name_en: 'Ukraine',
      portfolio: 0.15,
      substantial: 0.05,
      threshold: 0.10,
      article: 'Art.10 (UA-IL 2003 DTA)',
      signed: 2003,
      notes: '',
    },
    TR: {
      country: 'TR',
      name_he: 'טורקיה',
      name_en: 'Turkey',
      portfolio: 0.10,
      substantial: 0.10,
      threshold: 0.10,
      article: 'Art.10 (TR-IL 1996 DTA)',
      signed: 1996,
      notes: '',
    },
    ZA: {
      country: 'ZA',
      name_he: 'דרום אפריקה',
      name_en: 'South Africa',
      portfolio: 0.25,
      substantial: 0.25,
      threshold: 0.10,
      article: 'Art.10 (ZA-IL 1978 DTA)',
      signed: 1978,
      notes: 'No reduced rate — high-tax treaty',
    },
    MX: {
      country: 'MX',
      name_he: 'מקסיקו',
      name_en: 'Mexico',
      portfolio: 0.10,
      substantial: 0.05,
      threshold: 0.10,
      article: 'Art.10 (MX-IL 2000 DTA)',
      signed: 2000,
      notes: '',
    },
    BR: {
      country: 'BR',
      name_he: 'ברזיל',
      name_en: 'Brazil',
      portfolio: 0.15,
      substantial: 0.10,
      threshold: 0.25,
      article: 'Art.10 (BR-IL 2002 DTA)',
      signed: 2002,
      notes: '',
    },
    AR: {
      country: 'AR',
      name_he: 'ארגנטינה',
      name_en: 'Argentina',
      portfolio: 0.15,
      substantial: 0.10,
      threshold: 0.25,
      article: 'Art.10 (AR-IL 2005 DTA)',
      signed: 2005,
      notes: '',
    },
    PH: {
      country: 'PH',
      name_he: 'פיליפינים',
      name_en: 'Philippines',
      portfolio: 0.15,
      substantial: 0.10,
      threshold: 0.10,
      article: 'Art.10 (PH-IL 1992 DTA)',
      signed: 1992,
      notes: '',
    },
    TH: {
      country: 'TH',
      name_he: 'תאילנד',
      name_en: 'Thailand',
      portfolio: 0.15,
      substantial: 0.10,
      threshold: 0.15,
      article: 'Art.10 (TH-IL 1996 DTA)',
      signed: 1996,
      notes: '',
    },
    VN: {
      country: 'VN',
      name_he: 'וייטנאם',
      name_en: 'Vietnam',
      portfolio: 0.10,
      substantial: 0.10,
      threshold: 0.25,
      article: 'Art.10 (VN-IL 2009 DTA)',
      signed: 2009,
      notes: '',
    },
    MT: {
      country: 'MT',
      name_he: 'מלטה',
      name_en: 'Malta',
      portfolio: 0.15,
      substantial: 0.00,
      threshold: 0.10,
      article: 'Art.10 (MT-IL 2011 DTA)',
      signed: 2011,
      notes: '0% at ≥10% holding',
    },
    EE: {
      country: 'EE',
      name_he: 'אסטוניה',
      name_en: 'Estonia',
      portfolio: 0.05,
      substantial: 0.00,
      threshold: 0.10,
      article: 'Art.10 (EE-IL 2009 DTA)',
      signed: 2009,
      notes: 'Attractive treaty for holding cos',
    },
    LV: {
      country: 'LV',
      name_he: 'לטביה',
      name_en: 'Latvia',
      portfolio: 0.10,
      substantial: 0.05,
      threshold: 0.10,
      article: 'Art.10 (LV-IL 2006 DTA)',
      signed: 2006,
      notes: '',
    },
    SI: {
      country: 'SI',
      name_he: 'סלובניה',
      name_en: 'Slovenia',
      portfolio: 0.15,
      substantial: 0.05,
      threshold: 0.10,
      article: 'Art.10 (SI-IL 2007 DTA)',
      signed: 2007,
      notes: '',
    },
    HR: {
      country: 'HR',
      name_he: 'קרואטיה',
      name_en: 'Croatia',
      portfolio: 0.15,
      substantial: 0.05,
      threshold: 0.25,
      article: 'Art.10 (HR-IL 2006 DTA)',
      signed: 2006,
      notes: '',
    },
    AE: {
      country: 'AE',
      name_he: 'איחוד האמירויות',
      name_en: 'UAE',
      portfolio: 0.15,
      substantial: 0.00,
      threshold: 0.10,
      article: 'Art.10 (AE-IL 2020 DTA)',
      signed: 2020,
      notes: 'Abraham Accords DTA, effective 2022',
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Core rate-resolution logic
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} DividendParams
 * @property {number} gross                      — gross dividend amount (ILS)
 * @property {string} shareholderType            — one of SHAREHOLDER_TYPES
 * @property {number} [ownershipPct]             — 0..1 ownership fraction
 *                                                   (e.g. 0.15 = 15%)
 * @property {boolean} [isSubstantial]           — explicit override; when
 *                                                   undefined derived from
 *                                                   ownershipPct ≥ 10%.
 * @property {string} [recipientCountry]         — ISO-3166 alpha-2 (foreign)
 * @property {Object}  [treatyLookup]            — optional treaty table (if
 *                                                   not supplied the built-in
 *                                                   loadTreatyRates() is used)
 * @property {boolean} [isOlehBenefits]          — recipient enjoys §14 benefits
 * @property {boolean} [foreignSource]           — dividend paid on foreign
 *                                                   company shares (relevant
 *                                                   only for Oleh exemption)
 * @property {string}  [date]                    — ISO payment date (default now)
 * @property {string}  [payerTaxId]              — 9-digit payer company id
 * @property {string}  [recipientId]             — 9-digit recipient id / tax no.
 * @property {string}  [recipientName]           — display name for form 867B
 */

/**
 * Compute withholding on a single dividend distribution.
 *
 * @param {DividendParams} params
 * @returns {{
 *   netPaid: number,
 *   withheld: number,
 *   rate: number,
 *   treatyCited: (Object|null),
 *   form867BRow: Object,
 *   rule: string
 * }}
 */
function computeDividendWithholding(params) {
  // ───────────────────────── validation ─────────────────────────
  if (!params || typeof params !== 'object') {
    throw new TypeError('dividend-withholding: params object required');
  }
  const { gross, shareholderType } = params;
  if (!Number.isFinite(gross) || gross < 0) {
    throw new RangeError('dividend-withholding: gross must be a non-negative number');
  }
  const validTypes = Object.values(SHAREHOLDER_TYPES);
  if (!validTypes.includes(shareholderType)) {
    throw new RangeError(
      `dividend-withholding: shareholderType must be one of ${validTypes.join(', ')}`
    );
  }

  // Ownership → substantial flag (§88 — 10% in any class)
  const ownershipPct = Number.isFinite(params.ownershipPct) ? params.ownershipPct : 0;
  if (ownershipPct < 0 || ownershipPct > 1) {
    throw new RangeError('dividend-withholding: ownershipPct must be 0..1 fraction');
  }
  const isSubstantial =
    typeof params.isSubstantial === 'boolean'
      ? params.isSubstantial
      : ownershipPct >= SUBSTANTIAL_SHAREHOLDER_THRESHOLD;

  const recipientCountry = (params.recipientCountry || '').toUpperCase() || null;
  const treatyTable = params.treatyLookup || loadTreatyRates();
  const isOlehBenefits = Boolean(params.isOlehBenefits);
  const foreignSource = Boolean(params.foreignSource);

  // ───────────────────────── rate resolution ─────────────────────────
  let rate = 0;
  let rule = '';
  let treatyCited = null;

  switch (shareholderType) {
    case SHAREHOLDER_TYPES.ISRAELI_INDIVIDUAL: {
      if (isOlehBenefits && foreignSource) {
        rate = DOMESTIC_RATES.OLEH_FOREIGN_SOURCE;
        rule = '§14(א) Oleh chadash — foreign-source exempt (10-year window) / פטור עולה חדש';
      } else if (isSubstantial) {
        rate = DOMESTIC_RATES.ISRAELI_INDIVIDUAL_SUBSTANTIAL;
        rule = '§125ב בעל מניות מהותי (≥10%) — 30% / Israeli individual substantial';
      } else {
        rate = DOMESTIC_RATES.ISRAELI_INDIVIDUAL_REGULAR;
        rule = '§125ב יחיד תושב ישראל — 25% / Israeli individual regular';
      }
      break;
    }

    case SHAREHOLDER_TYPES.ISRAELI_COMPANY: {
      rate = DOMESTIC_RATES.ISRAELI_COMPANY_INTER_CO;
      rule = '§126(ב) חברה ישראלית לחברה ישראלית — 0% / inter-company exemption';
      break;
    }

    case SHAREHOLDER_TYPES.FOREIGN_COMPANY: {
      const treaty = recipientCountry ? treatyTable[recipientCountry] : null;
      if (treaty) {
        treatyCited = treaty;
        const treatyRate = pickTreatyRate(treaty, ownershipPct, isSubstantial);
        // Apply the lower of treaty vs. domestic; per §196 the treaty caps
        // the domestic rate so we never exceed domestic.
        const domestic = isSubstantial
          ? (ownershipPct >= 0.10
              ? DOMESTIC_RATES.FOREIGN_COMPANY_OECD_10PCT
              : DOMESTIC_RATES.FOREIGN_COMPANY_DEFAULT)
          : DOMESTIC_RATES.FOREIGN_COMPANY_DEFAULT;
        rate = Math.min(treatyRate, domestic);
        rule =
          `אמנה ${treaty.country} ${treaty.article} → ${(rate * 100).toFixed(2)}%` +
          ` / treaty applied, domestic cap ${(domestic * 100).toFixed(2)}%`;
      } else if (isSubstantial && ownershipPct >= 0.10) {
        rate = DOMESTIC_RATES.FOREIGN_COMPANY_OECD_10PCT;
        rule = 'חברה זרה OECD ≥10% — 15% / special OECD rate';
      } else {
        rate = DOMESTIC_RATES.FOREIGN_COMPANY_DEFAULT;
        rule = '§170 חברה זרה ברירת מחדל — 25% / foreign company default';
      }
      break;
    }

    case SHAREHOLDER_TYPES.FOREIGN_INDIVIDUAL: {
      const treaty = recipientCountry ? treatyTable[recipientCountry] : null;
      if (treaty) {
        treatyCited = treaty;
        const treatyRate = pickTreatyRate(treaty, ownershipPct, isSubstantial);
        const domestic = isSubstantial
          ? DOMESTIC_RATES.FOREIGN_INDIVIDUAL_SUBSTANTIAL
          : DOMESTIC_RATES.FOREIGN_INDIVIDUAL_DEFAULT;
        rate = Math.min(treatyRate, domestic);
        rule =
          `אמנה ${treaty.country} ${treaty.article} → ${(rate * 100).toFixed(2)}%` +
          ` / treaty applied, domestic cap ${(domestic * 100).toFixed(2)}%`;
      } else if (isSubstantial) {
        rate = DOMESTIC_RATES.FOREIGN_INDIVIDUAL_SUBSTANTIAL;
        rule = '§170 יחיד זר בעל מניות מהותי — 30% / foreign individual substantial';
      } else {
        rate = DOMESTIC_RATES.FOREIGN_INDIVIDUAL_DEFAULT;
        rule = '§170 יחיד זר ברירת מחדל — 25% / foreign individual default';
      }
      break;
    }

    default:
      // Already validated — defensive belt & braces.
      throw new RangeError(`unhandled shareholderType: ${shareholderType}`);
  }

  // ───────────────────────── arithmetic ─────────────────────────
  const withheld = round2(gross * rate);
  const netPaid = round2(gross - withheld);

  // ───────────────────────── form 867B row ─────────────────────────
  const form867BRow = buildForm867BRow({
    gross,
    withheld,
    netPaid,
    rate,
    shareholderType,
    ownershipPct,
    isSubstantial,
    recipientCountry,
    treatyCited,
    date: params.date || new Date().toISOString().slice(0, 10),
    payerTaxId: params.payerTaxId || null,
    recipientId: params.recipientId || null,
    recipientName: params.recipientName || null,
    rule,
  });

  return Object.freeze({
    netPaid,
    withheld,
    rate,
    treatyCited,
    form867BRow,
    rule,
  });
}

/**
 * Choose the relevant treaty rate column based on the recipient's actual
 * holding and the treaty's own substantial-ownership threshold.
 *
 * The treaty's own threshold governs which column applies — even if the
 * Israeli domestic §88 threshold (10%) is met, a treaty with a stricter
 * ownership requirement (e.g. NL 25%) forces the portfolio rate.
 */
function pickTreatyRate(treaty, ownershipPct, _isSubstantialHint) {
  if (!treaty) return DOMESTIC_RATES.FOREIGN_INDIVIDUAL_DEFAULT;
  const threshold = Number.isFinite(treaty.threshold) ? treaty.threshold : 0.10;
  const meetsTreatyThreshold = ownershipPct >= threshold;
  return meetsTreatyThreshold ? treaty.substantial : treaty.portfolio;
}

// ═══════════════════════════════════════════════════════════════════════════
// applyTaxCredit — build a recipient-side credit line from a WHT deduction
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert a withholding deduction into a creditable amount for the recipient.
 * The recipient can offset this against their own annual tax liability under
 * §209 (תיאום מס במקור) or by submitting form 1301 / 1214 with the WHT
 * certificate (אישור ניכוי במקור) attached.
 *
 * The "cap" is the maximum Israeli tax the dividend would have been subject
 * to at domestic rate — anything withheld above that is refundable (הזרמה),
 * not creditable as foreign-paid tax.
 *
 * @param {number} grossDividend
 * @param {number|Object} wht   — either a scalar withheld amount OR the full
 *                                 object returned by computeDividendWithholding.
 * @param {Object} [options]
 * @param {number} [options.capRate=0.25]
 * @returns {{
 *   creditable: number,
 *   refundable: number,
 *   cap: number,
 *   grossDividend: number,
 *   withheld: number,
 *   effectiveRate: number
 * }}
 */
function applyTaxCredit(grossDividend, wht, options) {
  if (!Number.isFinite(grossDividend) || grossDividend < 0) {
    throw new RangeError('applyTaxCredit: grossDividend must be non-negative');
  }
  const withheldAmt =
    typeof wht === 'number'
      ? wht
      : (wht && Number.isFinite(wht.withheld) ? wht.withheld : NaN);
  if (!Number.isFinite(withheldAmt) || withheldAmt < 0) {
    throw new RangeError('applyTaxCredit: withheld must be non-negative');
  }

  const capRate = Number.isFinite(options && options.capRate) ? options.capRate : 0.25;
  const cap = round2(grossDividend * capRate);
  const creditable = Math.min(withheldAmt, cap);
  const refundable = round2(Math.max(0, withheldAmt - cap));
  const effectiveRate = grossDividend > 0 ? withheldAmt / grossDividend : 0;

  return Object.freeze({
    creditable: round2(creditable),
    refundable,
    cap,
    grossDividend: round2(grossDividend),
    withheld: round2(withheldAmt),
    effectiveRate: Math.round(effectiveRate * 10000) / 10000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Form 867B — annual consolidated dividend report
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build one row in the annual form 867B (דוח דיבידנד ריבית ורווחים).
 * Each row corresponds to a single distribution to a single recipient.
 */
function buildForm867BRow(p) {
  // Form 867B field names are documented in Tax Authority spec שע״מ-867ב.
  // Hebrew labels kept next to machine names so the output is RTL-audit
  // friendly.
  return Object.freeze({
    // Header
    formType: '867B',
    formTitle_he: 'דוח שנתי על דיבידנד וריבית ששולמו ומס שנוכה במקור',
    formTitle_en: 'Annual report of dividend and interest paid + tax withheld',

    // Row body (שדות דיווח)
    date_of_distribution: p.date,                     // תאריך החלוקה
    income_type: 'DIVIDEND',                          // סוג הכנסה
    income_type_he: 'דיבידנד',
    payer_tax_id: p.payerTaxId,                       // מספר תיק המשלם
    recipient_tax_id: p.recipientId,                  // מספר זהות / ח.פ. המקבל
    recipient_name: p.recipientName,                  // שם המקבל
    recipient_country: p.recipientCountry || 'IL',    // מדינת תושבות
    recipient_type: p.shareholderType,                // סוג המקבל
    ownership_pct: Math.round(p.ownershipPct * 10000) / 100, // אחוז החזקה (%)
    is_substantial: p.isSubstantial,                  // בעל מניות מהותי? (כן/לא)

    // Amounts
    gross_amount: round2(p.gross),                    // סכום ברוטו
    withholding_rate: Math.round(p.rate * 10000) / 100, // שיעור ניכוי (%)
    withheld_amount: round2(p.withheld),              // סכום הניכוי
    net_amount: round2(p.netPaid),                    // סכום נטו ששולם

    // Treaty / rule citation
    treaty_country: p.treatyCited ? p.treatyCited.country : null,
    treaty_article: p.treatyCited ? p.treatyCited.article : null,
    treaty_signed: p.treatyCited ? p.treatyCited.signed : null,
    legal_basis: p.rule,                              // אסמכתא חוקית
  });
}

/**
 * Generate an annual form 867B from a list of dividend distributions.
 * Aggregates per recipient and produces:
 *   - header  (year, payer, totals)
 *   - rows[]  (one row per distribution, as produced by buildForm867BRow)
 *   - summary (per-recipient totals + grand total)
 *   - xml     (legacy-compatible XML envelope the tax authority accepts)
 *
 * @param {Array} dividends — array of objects, each either:
 *   a) a computeDividendWithholding() result (has form867BRow), or
 *   b) raw DividendParams (will be passed through computeDividendWithholding).
 * @param {Object} [options]
 * @param {number} [options.year]
 * @param {string} [options.payerTaxId]
 * @param {string} [options.payerName]
 */
function generateForm867B(dividends, options) {
  if (!Array.isArray(dividends)) {
    throw new TypeError('generateForm867B: dividends must be an array');
  }
  const opts = options || {};
  const year = Number.isFinite(opts.year) ? opts.year : new Date().getFullYear();
  const payerTaxId = opts.payerTaxId || null;
  const payerName = opts.payerName || null;

  const rows = [];
  for (const d of dividends) {
    if (d && d.form867BRow) {
      rows.push(d.form867BRow);
    } else {
      // Treat as raw params
      const res = computeDividendWithholding(d);
      rows.push(res.form867BRow);
    }
  }

  // Per-recipient aggregation
  const byRecipient = {};
  let totalGross = 0;
  let totalWithheld = 0;
  let totalNet = 0;

  for (const r of rows) {
    const key = r.recipient_tax_id || r.recipient_name || 'UNKNOWN';
    if (!byRecipient[key]) {
      byRecipient[key] = {
        recipient_tax_id: r.recipient_tax_id,
        recipient_name: r.recipient_name,
        recipient_country: r.recipient_country,
        recipient_type: r.recipient_type,
        distributions: 0,
        gross_amount: 0,
        withheld_amount: 0,
        net_amount: 0,
      };
    }
    const bucket = byRecipient[key];
    bucket.distributions += 1;
    bucket.gross_amount = round2(bucket.gross_amount + r.gross_amount);
    bucket.withheld_amount = round2(bucket.withheld_amount + r.withheld_amount);
    bucket.net_amount = round2(bucket.net_amount + r.net_amount);

    totalGross = round2(totalGross + r.gross_amount);
    totalWithheld = round2(totalWithheld + r.withheld_amount);
    totalNet = round2(totalNet + r.net_amount);
  }

  const header = {
    formType: '867B',
    formTitle_he: 'טופס 867ב — דוח שנתי על דיבידנד וריבית',
    formTitle_en: 'Annual report — dividends / interest + withholding (form 867B)',
    tax_year: year,
    payer_tax_id: payerTaxId,
    payer_name: payerName,
    generated_at: new Date().toISOString(),
    row_count: rows.length,
  };

  const summary = {
    recipients: Object.values(byRecipient),
    total_gross: totalGross,
    total_withheld: totalWithheld,
    total_net: totalNet,
    total_distributions: rows.length,
  };

  const xml = buildForm867BXml(header, rows, summary);

  return Object.freeze({ header, rows: Object.freeze(rows), summary, xml });
}

/**
 * Minimal, dependency-free XML serializer for the 867B envelope.
 * Output is compatible with the שע״מ upload format (MANOT 867B).
 */
function buildForm867BXml(header, rows, summary) {
  const esc = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<Form867B>\n';
  xml += '  <Header>\n';
  xml += `    <FormType>${esc(header.formType)}</FormType>\n`;
  xml += `    <TaxYear>${esc(header.tax_year)}</TaxYear>\n`;
  xml += `    <PayerTaxId>${esc(header.payer_tax_id)}</PayerTaxId>\n`;
  xml += `    <PayerName>${esc(header.payer_name)}</PayerName>\n`;
  xml += `    <GeneratedAt>${esc(header.generated_at)}</GeneratedAt>\n`;
  xml += '  </Header>\n';
  xml += '  <Rows>\n';
  for (const r of rows) {
    xml += '    <Row>\n';
    xml += `      <Date>${esc(r.date_of_distribution)}</Date>\n`;
    xml += `      <RecipientTaxId>${esc(r.recipient_tax_id)}</RecipientTaxId>\n`;
    xml += `      <RecipientName>${esc(r.recipient_name)}</RecipientName>\n`;
    xml += `      <RecipientCountry>${esc(r.recipient_country)}</RecipientCountry>\n`;
    xml += `      <RecipientType>${esc(r.recipient_type)}</RecipientType>\n`;
    xml += `      <OwnershipPct>${esc(r.ownership_pct)}</OwnershipPct>\n`;
    xml += `      <Substantial>${r.is_substantial ? 'Y' : 'N'}</Substantial>\n`;
    xml += `      <GrossAmount>${esc(r.gross_amount)}</GrossAmount>\n`;
    xml += `      <Rate>${esc(r.withholding_rate)}</Rate>\n`;
    xml += `      <Withheld>${esc(r.withheld_amount)}</Withheld>\n`;
    xml += `      <Net>${esc(r.net_amount)}</Net>\n`;
    if (r.treaty_country) {
      xml += `      <TreatyCountry>${esc(r.treaty_country)}</TreatyCountry>\n`;
      xml += `      <TreatyArticle>${esc(r.treaty_article)}</TreatyArticle>\n`;
    }
    xml += '    </Row>\n';
  }
  xml += '  </Rows>\n';
  xml += '  <Summary>\n';
  xml += `    <TotalGross>${esc(summary.total_gross)}</TotalGross>\n`;
  xml += `    <TotalWithheld>${esc(summary.total_withheld)}</TotalWithheld>\n`;
  xml += `    <TotalNet>${esc(summary.total_net)}</TotalNet>\n`;
  xml += `    <TotalDistributions>${esc(summary.total_distributions)}</TotalDistributions>\n`;
  xml += '  </Summary>\n';
  xml += '</Form867B>\n';
  return xml;
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Bankers-rounding to 2 decimal places. */
function round2(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Create an isolated calculator instance (useful for dependency-injection in
 * tests). All exported functions are pure so this is mainly a namespace
 * wrapper but keeps parity with form-857.js.
 */
function createCalculator(options) {
  const table = (options && options.treatyTable) || loadTreatyRates();
  return Object.freeze({
    compute: (params) =>
      computeDividendWithholding(Object.assign({}, params, { treatyLookup: table })),
    applyCredit: applyTaxCredit,
    generate867B: generateForm867B,
    treaties: table,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // Main API
  computeDividendWithholding,
  loadTreatyRates,
  applyTaxCredit,
  generateForm867B,

  // Advanced / internal (useful for tests & integrations)
  createCalculator,
  buildForm867BXml,
  buildForm867BRow,
  pickTreatyRate,

  // Constants
  SHAREHOLDER_TYPES,
  DOMESTIC_RATES,
  SUBSTANTIAL_SHAREHOLDER_THRESHOLD,
  ROUNDING_EPSILON,
};
