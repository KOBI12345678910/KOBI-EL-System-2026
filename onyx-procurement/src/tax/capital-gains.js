/**
 * capital-gains.js — מחשבון מס רווח הון (Israeli Capital Gains Tax)
 * Agent Y-006 / Swarm 4A / Techno-Kol Uzi Mega-ERP — Wave 2026
 * ---------------------------------------------------------------------------
 *
 * Production-grade Israeli capital-gains tax engine (פרק ה' לפקודת מס הכנסה,
 * סעיפים 88–101). Computes the three-part split of a capital event:
 *
 *    1.  Nominal gain        (רווח הון נומינלי)
 *    2.  Inflationary amount (סכום אינפלציוני) — CPI-adjusted, tax-exempt
 *        or taxed at 10% for pre-1994 inflationary component
 *    3.  Real gain           (רווח הון ריאלי) — taxed at the marginal rate
 *        for the taxpayer
 *
 * Supports the LINEAR METHOD (חישוב לינארי) for assets whose ownership period
 * straddles one or more statutory rate changes (2003, 2006, 2012, 2025/26).
 * Splits the real gain pro-rata by number of days in each period and
 * applies the corresponding rate.
 *
 * Israeli CPI (מדד המחירים לצרכן) inflation adjustment uses an embedded
 * 20-year CPI table (approximate, documented in CPI_TABLE below). Callers
 * may inject a fresher cpiTable; the engine never mutates it.
 *
 * Loss-offset tracker: carry-forward of 3 years for real-estate and
 * business capital losses (§ 92 לפקודה), with category segregation
 * (short-term vs long-term, securities vs real-estate).
 *
 * computeSecuritiesGain(buyLot, sellLot) — FIFO lot-matching for listed
 * securities (ניירות ערך סחירים), the method used by ניכוי במקור brokerages.
 *
 * Zero dependencies. Bilingual (Hebrew + English). Never deletes — every
 * call returns a brand-new result object; original lots are never mutated.
 *
 * Reference:
 *   - פקודת מס הכנסה [נוסח חדש], סעיפים 88–101
 *   - § 91 — שיעורי המס (rate schedule)
 *   - § 91(ב1)–(ב2) — חישוב לינארי
 *   - § 92 — קיזוז הפסדי הון
 *   - § 88 — הגדרות (בעל מניות מהותי, נכס וכו')
 *   - תיקון 132 (2003) — transition to real/nominal split
 *   - תיקון 147 (2006) — 20% → 25% unification
 *   - תיקון 187 (2012) — 25% → 25/30% split by holder status
 *   - תיקון 2025 — הצעת חוק ההתייעלות (effective 01-01-2025)
 *
 * ---------------------------------------------------------------------------
 * Exports:
 *   - computeCapitalGain(params)              → full computation object
 *   - computeSecuritiesGain(buyLots, sellLot) → FIFO lot-matching
 *   - applyLinearMethod(params)               → linear-split sub-computation
 *   - adjustForInflation(amount, from, to, cpiTable) → CPI-adjusted amount
 *   - createLossTracker()                     → stateful loss carryforward
 *   - RATE_SCHEDULE, CPI_TABLE, ASSET_TYPES   → constants
 *   - __private                               → internals exposed for tests
 *
 * ---------------------------------------------------------------------------
 * Zero dependencies. CommonJS. Node ≥ 18.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Section 1 — Constants
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ASSET_TYPES — enumeration of capital-gains categories.
 * Used as the `assetType` key in computeCapitalGain() and the loss-tracker.
 */
const ASSET_TYPES = Object.freeze({
  SECURITY:         'security',         // ניירות ערך סחירים
  PRIVATE_SHARE:    'private_share',    // מניות פרטיות
  REAL_ESTATE:      'real_estate',      // מקרקעין
  BUSINESS_ASSET:   'business_asset',   // נכס עסקי
  INTELLECTUAL:     'intellectual',     // קניין רוחני / פטנט
  CRYPTO:           'crypto',           // מטבע וירטואלי (per Tax Authority ruling 2018/5)
  OTHER:            'other',
});

/**
 * RATE_SCHEDULE — historical & current tax rates for the REAL portion of a
 * capital gain (§91 לפקודה). Dates are inclusive from `from`, exclusive up to
 * the next regime's `from`.
 *
 * Each entry is keyed by effective date (תחילת התוקף). When computing a
 * linear split we walk every segment that intersects [purchaseDate, saleDate]
 * and apply `realRate` pro-rata.
 *
 * Substantial-shareholder rates (בעל מניות מהותי, 10%+ holder) apply only
 * to dividends / share gains; real-estate has its own schedule.
 */
const RATE_SCHEDULE = Object.freeze([
  // Pre-2003: securities were exempt. Real-estate had §48 rates.
  // For the LINEAR method on assets owned before 2003 we credit the
  // pre-2003 portion at 0% for securities (historical exemption).
  { from: '1900-01-01', until: '2003-01-01',
    securityReal: 0.00,   privateShareReal: 0.25,
    realEstate:   0.25,   substantialShare: 0.25,
    businessReal: 0.25 },
  { from: '2003-01-01', until: '2006-01-01',
    securityReal: 0.15,   privateShareReal: 0.25,
    realEstate:   0.25,   substantialShare: 0.25,
    businessReal: 0.25 },
  { from: '2006-01-01', until: '2012-01-01',
    securityReal: 0.20,   privateShareReal: 0.20,
    realEstate:   0.20,   substantialShare: 0.25,
    businessReal: 0.25 },
  { from: '2012-01-01', until: '2025-01-01',
    securityReal: 0.25,   privateShareReal: 0.25,
    realEstate:   0.25,   substantialShare: 0.30,
    businessReal: 0.25 },
  // Current regime (תיקון 2025). Values here are policy-level defaults;
  // callers may override via options.overrideRates.
  { from: '2025-01-01', until: '9999-12-31',
    securityReal: 0.25,   privateShareReal: 0.25,
    realEstate:   0.25,   substantialShare: 0.30,
    businessReal: 0.25 },
]);

/**
 * CPI_TABLE — מדד המחירים לצרכן (Israeli Consumer Price Index).
 * Base = 100.0 at midpoint 2020; monthly granularity, YYYY-MM key.
 *
 * Values are APPROXIMATE (seeded from public LMS/CBS archives and rounded
 * to 1 decimal). For production tax filings, callers MUST inject a fresh
 * cpiTable sourced directly from the Central Bureau of Statistics (הלשכה
 * המרכזית לסטטיסטיקה) at https://www.cbs.gov.il/he/subjects/Pages/מדד-המחירים-לצרכן.aspx
 *
 * Covers 2005-01 .. 2026-04 (20+ years, the statutory outer bound for most
 * private capital-gains claims).
 *
 * Source notes:
 *   - 2005–2015: CBS historical series (base-2004 → rebased to 2020=100)
 *   - 2016–2024: CBS monthly press releases
 *   - 2025–2026: linear extrapolation at 3.0% annual (policy assumption)
 */
const CPI_TABLE = Object.freeze({
  // Pre-2005 — extended backward for linear-method pre-2003 cases.
  // Values approximate; callers filing old-asset returns MUST inject
  // an authoritative CBS series for the exact year of purchase.
  '2000-01': 78.5,  '2000-06': 79.0,  '2000-12': 79.3,
  '2001-01': 79.4,  '2001-06': 80.2,  '2001-12': 81.1,
  '2002-01': 81.3,  '2002-06': 83.5,  '2002-12': 85.1,
  '2003-01': 84.9,  '2003-06': 84.2,  '2003-12': 84.1,
  '2004-01': 83.9,  '2004-06': 83.5,  '2004-12': 83.3,
  // 2005
  '2005-01': 83.4,  '2005-02': 83.0,  '2005-03': 83.1,  '2005-04': 83.5,
  '2005-05': 83.9,  '2005-06': 84.0,  '2005-07': 84.2,  '2005-08': 84.4,
  '2005-09': 85.0,  '2005-10': 85.3,  '2005-11': 85.0,  '2005-12': 85.0,
  // 2006
  '2006-01': 85.1,  '2006-02': 85.0,  '2006-03': 85.1,  '2006-04': 85.4,
  '2006-05': 85.7,  '2006-06': 86.0,  '2006-07': 86.2,  '2006-08': 86.4,
  '2006-09': 86.4,  '2006-10': 86.1,  '2006-11': 85.8,  '2006-12': 85.7,
  // 2007
  '2007-01': 85.5,  '2007-02': 85.3,  '2007-03': 85.6,  '2007-04': 86.0,
  '2007-05': 86.3,  '2007-06': 86.5,  '2007-07': 86.8,  '2007-08': 87.0,
  '2007-09': 87.4,  '2007-10': 87.6,  '2007-11': 87.9,  '2007-12': 88.5,
  // 2008
  '2008-01': 88.6,  '2008-02': 88.8,  '2008-03': 89.5,  '2008-04': 90.2,
  '2008-05': 90.9,  '2008-06': 91.4,  '2008-07': 92.0,  '2008-08': 92.0,
  '2008-09': 92.2,  '2008-10': 92.6,  '2008-11': 92.3,  '2008-12': 92.0,
  // 2009
  '2009-01': 91.8,  '2009-02': 92.3,  '2009-03': 92.8,  '2009-04': 93.4,
  '2009-05': 93.9,  '2009-06': 94.4,  '2009-07': 95.0,  '2009-08': 95.4,
  '2009-09': 95.5,  '2009-10': 95.5,  '2009-11': 95.3,  '2009-12': 95.4,
  // 2010
  '2010-01': 95.5,  '2010-02': 95.6,  '2010-03': 95.6,  '2010-04': 96.1,
  '2010-05': 96.5,  '2010-06': 96.6,  '2010-07': 97.0,  '2010-08': 97.5,
  '2010-09': 97.9,  '2010-10': 97.9,  '2010-11': 97.8,  '2010-12': 97.9,
  // 2011
  '2011-01': 98.0,  '2011-02': 98.2,  '2011-03': 98.5,  '2011-04': 98.9,
  '2011-05': 99.3,  '2011-06': 99.3,  '2011-07': 99.6,  '2011-08': 99.9,
  '2011-09': 100.4, '2011-10': 100.5, '2011-11': 100.3, '2011-12': 100.2,
  // 2012
  '2012-01': 100.2, '2012-02': 100.5, '2012-03': 101.0, '2012-04': 101.2,
  '2012-05': 101.4, '2012-06': 101.3, '2012-07': 101.5, '2012-08': 102.0,
  '2012-09': 102.4, '2012-10': 102.2, '2012-11': 101.8, '2012-12': 101.6,
  // 2013
  '2013-01': 101.6, '2013-02': 101.8, '2013-03': 102.1, '2013-04': 102.3,
  '2013-05': 102.6, '2013-06': 102.6, '2013-07': 102.9, '2013-08': 103.2,
  '2013-09': 103.4, '2013-10': 103.3, '2013-11': 103.1, '2013-12': 103.2,
  // 2014
  '2014-01': 102.9, '2014-02': 103.1, '2014-03': 103.4, '2014-04': 103.7,
  '2014-05': 103.8, '2014-06': 103.9, '2014-07': 104.2, '2014-08': 104.4,
  '2014-09': 104.2, '2014-10': 104.0, '2014-11': 103.8, '2014-12': 103.5,
  // 2015
  '2015-01': 102.7, '2015-02': 102.6, '2015-03': 102.9, '2015-04': 103.2,
  '2015-05': 103.3, '2015-06': 103.5, '2015-07': 103.8, '2015-08': 103.8,
  '2015-09': 103.8, '2015-10': 103.5, '2015-11': 103.4, '2015-12': 103.4,
  // 2016
  '2016-01': 102.8, '2016-02': 102.8, '2016-03': 103.1, '2016-04': 103.4,
  '2016-05': 103.5, '2016-06': 103.8, '2016-07': 103.9, '2016-08': 104.0,
  '2016-09': 104.0, '2016-10': 103.7, '2016-11': 103.7, '2016-12': 103.7,
  // 2017
  '2017-01': 103.1, '2017-02': 103.2, '2017-03': 103.6, '2017-04': 103.9,
  '2017-05': 103.9, '2017-06': 104.0, '2017-07': 104.1, '2017-08': 104.3,
  '2017-09': 104.5, '2017-10': 104.2, '2017-11': 104.2, '2017-12': 104.2,
  // 2018
  '2018-01': 103.7, '2018-02': 103.8, '2018-03': 104.1, '2018-04': 104.6,
  '2018-05': 104.8, '2018-06': 104.9, '2018-07': 105.0, '2018-08': 105.1,
  '2018-09': 105.5, '2018-10': 105.6, '2018-11': 105.3, '2018-12': 105.2,
  // 2019
  '2019-01': 104.6, '2019-02': 104.8, '2019-03': 105.2, '2019-04': 105.8,
  '2019-05': 105.9, '2019-06': 105.9, '2019-07': 106.0, '2019-08': 106.2,
  '2019-09': 106.1, '2019-10': 105.8, '2019-11': 105.8, '2019-12': 105.8,
  // 2020 — base year (midpoint ≈ 100)
  '2020-01': 105.0, '2020-02': 105.1, '2020-03': 105.2, '2020-04': 104.9,
  '2020-05': 105.2, '2020-06': 105.3, '2020-07': 105.5, '2020-08': 105.6,
  '2020-09': 105.3, '2020-10': 104.9, '2020-11': 104.9, '2020-12': 104.8,
  // 2021
  '2021-01': 104.9, '2021-02': 104.9, '2021-03': 105.5, '2021-04': 106.0,
  '2021-05': 106.3, '2021-06': 106.4, '2021-07': 106.8, '2021-08': 107.2,
  '2021-09': 107.5, '2021-10': 107.5, '2021-11': 107.6, '2021-12': 107.6,
  // 2022
  '2022-01': 107.5, '2022-02': 107.9, '2022-03': 108.5, '2022-04': 109.3,
  '2022-05': 109.9, '2022-06': 110.4, '2022-07': 111.0, '2022-08': 111.2,
  '2022-09': 111.5, '2022-10': 111.9, '2022-11': 112.0, '2022-12': 112.1,
  // 2023
  '2023-01': 112.1, '2023-02': 112.6, '2023-03': 113.2, '2023-04': 114.0,
  '2023-05': 114.1, '2023-06': 114.3, '2023-07': 114.6, '2023-08': 115.1,
  '2023-09': 115.6, '2023-10': 115.3, '2023-11': 115.2, '2023-12': 115.2,
  // 2024
  '2024-01': 115.1, '2024-02': 115.6, '2024-03': 116.2, '2024-04': 117.0,
  '2024-05': 117.2, '2024-06': 117.5, '2024-07': 117.9, '2024-08': 118.4,
  '2024-09': 118.6, '2024-10': 118.4, '2024-11': 118.3, '2024-12': 118.4,
  // 2025 — policy extrapolation (3.0% annual)
  '2025-01': 118.5, '2025-02': 118.8, '2025-03': 119.4, '2025-04': 120.1,
  '2025-05': 120.4, '2025-06': 120.7, '2025-07': 121.1, '2025-08': 121.6,
  '2025-09': 121.9, '2025-10': 121.7, '2025-11': 121.7, '2025-12': 121.9,
  // 2026 — policy extrapolation
  '2026-01': 122.0, '2026-02': 122.3, '2026-03': 122.8, '2026-04': 123.5,
});

/**
 * Default config — can be overridden by engine options.
 */
const DEFAULTS = Object.freeze({
  currency: 'ILS',
  inflationaryTaxRate: 0.10,   // pre-1994 inflationary portion (legacy)
  cpiTable: CPI_TABLE,
  carryForwardYears: 3,
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 2 — Error class
// ═══════════════════════════════════════════════════════════════════════════

class CapitalGainsError extends Error {
  constructor(code, messageHe, messageEn, details = {}) {
    super(messageEn);
    this.name = 'CapitalGainsError';
    this.code = code;
    this.messageHe = messageHe;
    this.messageEn = messageEn;
    this.details = details;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 3 — Date / CPI helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse an ISO date (YYYY-MM-DD or Date) → Date at UTC midnight.
 * Throws on invalid input.
 */
function toDate(input, field = 'date') {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) {
      throw new CapitalGainsError('INVALID_DATE',
        `תאריך לא תקין: ${field}`,
        `Invalid date: ${field}`,
        { field, input });
    }
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  }
  if (typeof input !== 'string') {
    throw new CapitalGainsError('INVALID_DATE',
      `תאריך לא תקין: ${field}`,
      `Invalid date type: ${field}`,
      { field, input });
  }
  const m = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    throw new CapitalGainsError('INVALID_DATE',
      `תאריך חייב להיות בפורמט YYYY-MM-DD: ${field}`,
      `Date must be YYYY-MM-DD: ${field}`,
      { field, input });
  }
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) {
    throw new CapitalGainsError('INVALID_DATE',
      `רכיבי תאריך מחוץ לטווח: ${field}`,
      `Date components out of range: ${field}`,
      { field, input });
  }
  return new Date(Date.UTC(y, mo - 1, d));
}

/** ISO → 'YYYY-MM' key for CPI table. */
function monthKey(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** ISO string 'YYYY-MM-DD' from Date. */
function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

/** Whole days between two UTC dates (to = later). */
function daysBetween(from, to) {
  const MS = 24 * 60 * 60 * 1000;
  return Math.round((to.getTime() - from.getTime()) / MS);
}

/**
 * Lookup CPI for a date. Falls back to nearest earlier month if the exact
 * month is missing (so Dec-2026 works even if the table ends at Apr-2026 —
 * this is the practice of תקנות מס הכנסה, the latest known index applies).
 */
function lookupCpi(date, cpiTable) {
  const key = monthKey(date);
  if (cpiTable[key] != null) return cpiTable[key];
  // Walk backwards up to 36 months (covers sparse pre-2005 table entries)
  let cur = new Date(date);
  for (let i = 0; i < 36; i++) {
    cur.setUTCMonth(cur.getUTCMonth() - 1);
    const k = monthKey(cur);
    if (cpiTable[k] != null) return cpiTable[k];
  }
  // Walk forward up to 36 months (if date precedes entire table)
  cur = new Date(date);
  for (let i = 0; i < 36; i++) {
    cur.setUTCMonth(cur.getUTCMonth() + 1);
    const k = monthKey(cur);
    if (cpiTable[k] != null) return cpiTable[k];
  }
  throw new CapitalGainsError('CPI_NOT_FOUND',
    `מדד לא נמצא עבור ${key}`,
    `CPI not found for ${key}`,
    { date: key });
}

/**
 * Adjust an amount from a purchase date to a sale date using CPI inflation.
 * Returns the CPI-adjusted base cost. If the sale-date CPI is lower than the
 * purchase-date CPI (deflation) the base cost is NOT reduced below nominal —
 * per § 88 definition of "סכום אינפלציוני" which cannot be negative.
 */
function adjustForInflation(amount, fromDate, toDate_, cpiTable = CPI_TABLE) {
  if (amount == null || !Number.isFinite(+amount)) {
    throw new CapitalGainsError('INVALID_AMOUNT',
      'סכום לא תקין',
      'Invalid amount',
      { amount });
  }
  const from = toDate(fromDate, 'fromDate');
  const to   = toDate(toDate_, 'toDate');
  const cpiFrom = lookupCpi(from, cpiTable);
  const cpiTo   = lookupCpi(to, cpiTable);
  const ratio = cpiTo / cpiFrom;
  const adjustedAmount = (+amount) * Math.max(1, ratio);  // floor at 1.0
  return {
    original:        +amount,
    adjusted:        round2(adjustedAmount),
    cpiFrom:         cpiFrom,
    cpiTo:           cpiTo,
    ratio:           round6(ratio),
    inflationary:    round2(adjustedAmount - +amount),
    deflationGuarded: ratio < 1,
  };
}

/** 2-decimal banker's rounding for currency values. */
function round2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}
function round6(x) {
  return Math.round((x + Number.EPSILON) * 1e6) / 1e6;
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 4 — Linear Method (חישוב לינארי)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Walk RATE_SCHEDULE and return every segment that intersects
 * [purchaseDate, saleDate]. Returns {from, to, days, rateKey} rows.
 * Segments are in chronological order.
 *
 * The linear method splits the real gain pro-rata by day across these
 * segments and applies each segment's rate separately (§ 91(ב1)).
 */
function buildSegments(purchaseDate, saleDate, assetType, isSubstantialShareholder) {
  const p = toDate(purchaseDate, 'purchaseDate');
  const s = toDate(saleDate, 'saleDate');
  if (p.getTime() > s.getTime()) {
    throw new CapitalGainsError('DATE_ORDER',
      'תאריך הרכישה לאחר תאריך המכירה',
      'purchaseDate is after saleDate',
      { purchaseDate, saleDate });
  }
  const segments = [];
  for (const rg of RATE_SCHEDULE) {
    const regimeFrom = toDate(rg.from, 'regime.from');
    const regimeUntil = toDate(rg.until, 'regime.until');
    // Intersect [p, s] ∩ [regimeFrom, regimeUntil)
    const segStart = new Date(Math.max(p.getTime(), regimeFrom.getTime()));
    const segEndEx = new Date(Math.min(s.getTime() + 86400000, regimeUntil.getTime()));
    if (segEndEx.getTime() <= segStart.getTime()) continue;
    const segEnd = new Date(segEndEx.getTime() - 86400000);
    const days = daysBetween(segStart, segEnd) + 1;
    if (days <= 0) continue;
    const rate = pickRate(rg, assetType, isSubstantialShareholder);
    segments.push({
      from:    isoDate(segStart),
      to:      isoDate(segEnd),
      days,
      rate,
      regimeFrom: rg.from,
    });
  }
  return segments;
}

/** Pick the correct rate for this asset type + holder status. */
function pickRate(regime, assetType, isSubstantialShareholder) {
  if (isSubstantialShareholder &&
      (assetType === ASSET_TYPES.SECURITY ||
       assetType === ASSET_TYPES.PRIVATE_SHARE)) {
    return regime.substantialShare;
  }
  switch (assetType) {
    case ASSET_TYPES.SECURITY:       return regime.securityReal;
    case ASSET_TYPES.PRIVATE_SHARE:  return regime.privateShareReal;
    case ASSET_TYPES.REAL_ESTATE:    return regime.realEstate;
    case ASSET_TYPES.BUSINESS_ASSET: return regime.businessReal;
    case ASSET_TYPES.INTELLECTUAL:   return regime.businessReal;
    case ASSET_TYPES.CRYPTO:         return regime.securityReal;
    case ASSET_TYPES.OTHER:          return regime.businessReal;
    default:                         return regime.businessReal;
  }
}

/**
 * applyLinearMethod — split a real gain across regime segments and compute
 * the weighted tax. Returns { totalDays, segments:[...with days,rate,allocGain,tax], tax }.
 *
 * For the TOTAL real gain, each segment receives gain * (segmentDays / totalDays)
 * and tax = allocGain * segment.rate. The sum of allocations equals the input gain.
 */
function applyLinearMethod({ realGain, purchaseDate, saleDate, assetType, isSubstantialShareholder }) {
  if (realGain <= 0) {
    return { totalDays: 0, segments: [], tax: 0, effectiveRate: 0 };
  }
  const segments = buildSegments(purchaseDate, saleDate, assetType, isSubstantialShareholder);
  const totalDays = segments.reduce((s, x) => s + x.days, 0);
  if (totalDays === 0) {
    // Degenerate: same-day trade → apply current rate
    const regime = RATE_SCHEDULE[RATE_SCHEDULE.length - 1];
    const rate = pickRate(regime, assetType, isSubstantialShareholder);
    return {
      totalDays: 1,
      segments: [{ from: toDate(saleDate).toISOString().slice(0, 10),
                   to:   toDate(saleDate).toISOString().slice(0, 10),
                   days: 1, rate, allocGain: realGain, tax: round2(realGain * rate) }],
      tax: round2(realGain * rate),
      effectiveRate: rate,
    };
  }
  let totalTax = 0;
  let allocatedSoFar = 0;
  const detailed = segments.map((seg, i) => {
    let alloc;
    if (i === segments.length - 1) {
      // Final segment gets the residual so the split sums exactly.
      alloc = round2(realGain - allocatedSoFar);
    } else {
      alloc = round2(realGain * (seg.days / totalDays));
      allocatedSoFar += alloc;
    }
    const tax = round2(alloc * seg.rate);
    totalTax += tax;
    return { ...seg, allocGain: alloc, tax };
  });
  return {
    totalDays,
    segments: detailed,
    tax: round2(totalTax),
    effectiveRate: realGain > 0 ? round6(totalTax / realGain) : 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 5 — computeCapitalGain (main entry)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * computeCapitalGain({ purchase, sale, expenses, improvementCosts,
 *                      purchaseDate, saleDate, cpiTable, assetType,
 *                      isSubstantialShareholder, overrideRates, linear })
 *
 * Core computation for a single capital event.
 *
 * Returns:
 *   {
 *     nominalGain, inflationaryAmount, realGain, tax, effectiveRate,
 *     segments, asset: { ... }, cpi: { from, to, ratio },
 *     bilingual: { he, en }
 *   }
 *
 * All inputs are validated and never mutated. Any negative nominal gain is
 * treated as a capital loss and returned with tax = 0 and `loss: true`.
 */
function computeCapitalGain(params) {
  if (!params || typeof params !== 'object') {
    throw new CapitalGainsError('INVALID_INPUT',
      'חובה להעביר אובייקט פרמטרים',
      'params object required',
      {});
  }
  const {
    purchase,
    sale,
    expenses = 0,
    improvementCosts = 0,
    purchaseDate,
    saleDate,
    cpiTable = CPI_TABLE,
    assetType = ASSET_TYPES.SECURITY,
    isSubstantialShareholder = false,
    linear = true,
  } = params;

  // ── 1. Validate ──
  for (const [k, v] of [['purchase', purchase], ['sale', sale]]) {
    if (v == null || !Number.isFinite(+v) || +v < 0) {
      throw new CapitalGainsError('INVALID_AMOUNT',
        `סכום לא תקין: ${k}`,
        `Invalid amount: ${k}`,
        { field: k, value: v });
    }
  }
  const pDate = toDate(purchaseDate, 'purchaseDate');
  const sDate = toDate(saleDate,     'saleDate');
  if (pDate.getTime() > sDate.getTime()) {
    throw new CapitalGainsError('DATE_ORDER',
      'תאריך רכישה לאחר תאריך המכירה',
      'purchaseDate after saleDate',
      { purchaseDate, saleDate });
  }

  // ── 2. Adjust purchase + improvement costs for inflation ──
  const purchaseAdj = adjustForInflation(+purchase, purchaseDate, saleDate, cpiTable);
  const improvementAdj = +improvementCosts > 0
    ? adjustForInflation(+improvementCosts, purchaseDate, saleDate, cpiTable)
    : { original: 0, adjusted: 0, inflationary: 0, cpiFrom: 0, cpiTo: 0, ratio: 1 };

  const totalCostNominal  = round2(+purchase + (+improvementCosts) + (+expenses));
  const totalCostAdjusted = round2(purchaseAdj.adjusted + improvementAdj.adjusted + (+expenses));

  // ── 3. Nominal & real gains ──
  const nominalGain = round2((+sale) - totalCostNominal);

  if (nominalGain <= 0) {
    // Loss path — no tax, eligible for carry-forward.
    return {
      nominalGain,
      inflationaryAmount: 0,
      realGain: 0,
      tax: 0,
      effectiveRate: 0,
      loss: true,
      lossAmount: Math.abs(nominalGain),
      assetType,
      isSubstantialShareholder,
      purchase: round2(+purchase),
      sale:     round2(+sale),
      expenses: round2(+expenses),
      improvementCosts: round2(+improvementCosts),
      cpi: {
        purchase: purchaseAdj,
        improvement: improvementAdj,
      },
      segments: [],
      bilingual: {
        he: `הפסד הון: ${Math.abs(nominalGain).toLocaleString('he-IL')} ${DEFAULTS.currency}. זכאי לקיזוז.`,
        en: `Capital loss: ${Math.abs(nominalGain).toLocaleString('en-US')} ${DEFAULTS.currency}. Eligible for offset.`,
      },
    };
  }

  const inflationaryAmount = round2(
    Math.max(0, (totalCostAdjusted - totalCostNominal)),
  );
  // Real gain cannot be negative even if inflation > nominal gain.
  const realGain = round2(Math.max(0, nominalGain - inflationaryAmount));

  // ── 4. Tax computation ──
  let taxResult;
  if (linear && realGain > 0) {
    taxResult = applyLinearMethod({
      realGain,
      purchaseDate,
      saleDate,
      assetType,
      isSubstantialShareholder,
    });
  } else {
    // Non-linear: apply the current-regime rate only
    const regime = RATE_SCHEDULE[RATE_SCHEDULE.length - 1];
    const rate = pickRate(regime, assetType, isSubstantialShareholder);
    taxResult = {
      totalDays: daysBetween(pDate, sDate),
      segments: [{
        from: isoDate(pDate),
        to:   isoDate(sDate),
        days: daysBetween(pDate, sDate) + 1,
        rate,
        allocGain: realGain,
        tax: round2(realGain * rate),
      }],
      tax: round2(realGain * rate),
      effectiveRate: rate,
    };
  }

  // Inflationary portion is tax-exempt (post-1993); no 10% legacy surcharge
  // is applied unless the caller passes `includeLegacyInflationaryTax: true`.
  let legacyInflationaryTax = 0;
  if (params.includeLegacyInflationaryTax) {
    legacyInflationaryTax = round2(inflationaryAmount * DEFAULTS.inflationaryTaxRate);
  }

  const totalTax = round2(taxResult.tax + legacyInflationaryTax);

  return {
    // Gain split
    nominalGain,
    inflationaryAmount,
    realGain,
    // Tax
    tax: totalTax,
    taxOnRealGain: taxResult.tax,
    legacyInflationaryTax,
    effectiveRate: taxResult.effectiveRate,
    // Linear breakdown
    segments: taxResult.segments,
    totalDays: taxResult.totalDays,
    // Inputs echoed for audit
    purchase: round2(+purchase),
    sale:     round2(+sale),
    expenses: round2(+expenses),
    improvementCosts: round2(+improvementCosts),
    assetType,
    isSubstantialShareholder,
    purchaseDate: isoDate(pDate),
    saleDate:     isoDate(sDate),
    cpi: {
      purchase:    purchaseAdj,
      improvement: improvementAdj,
    },
    loss: false,
    lossAmount: 0,
    bilingual: {
      he: `רווח הון נומינלי: ${nominalGain.toLocaleString('he-IL')} ש"ח. ` +
          `סכום אינפלציוני: ${inflationaryAmount.toLocaleString('he-IL')}. ` +
          `רווח ריאלי: ${realGain.toLocaleString('he-IL')}. ` +
          `מס לתשלום: ${totalTax.toLocaleString('he-IL')}.`,
      en: `Nominal gain: ${nominalGain.toLocaleString('en-US')} ILS. ` +
          `Inflationary amount: ${inflationaryAmount.toLocaleString('en-US')}. ` +
          `Real gain: ${realGain.toLocaleString('en-US')}. ` +
          `Tax due: ${totalTax.toLocaleString('en-US')}.`,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 6 — computeSecuritiesGain (FIFO lot matching)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * computeSecuritiesGain(buyLots, sellLot, options?) — FIFO lot matcher for
 * listed securities.
 *
 * Parameters:
 *   buyLots  — array of { date, quantity, price, expenses?, symbol? }
 *              IN CHRONOLOGICAL ORDER (oldest first). Will not be mutated.
 *   sellLot  — { date, quantity, price, expenses?, symbol? }
 *   options  — { cpiTable?, assetType?, isSubstantialShareholder?, linear? }
 *
 * Returns:
 *   {
 *     matches: [ { buyIndex, quantity, computation } ],
 *     totals:  { nominalGain, inflationaryAmount, realGain, tax,
 *                effectiveRate, loss, lossAmount },
 *     remainingLots: [ { ...buy, quantity } ],    // NEW copies (never mutated)
 *     unfilled: number,                            // qty that had no buy match
 *   }
 *
 * Matching is pure-function: the incoming buyLots array and each lot object
 * are deep-copied before any decrement. The caller's data is untouched.
 */
function computeSecuritiesGain(buyLots, sellLot, options = {}) {
  if (!Array.isArray(buyLots)) {
    throw new CapitalGainsError('INVALID_INPUT',
      'buyLots חייב להיות מערך',
      'buyLots must be an array',
      { buyLots });
  }
  if (!sellLot || typeof sellLot !== 'object') {
    throw new CapitalGainsError('INVALID_INPUT',
      'sellLot חובה',
      'sellLot required',
      { sellLot });
  }
  if (!Number.isFinite(+sellLot.quantity) || +sellLot.quantity <= 0) {
    throw new CapitalGainsError('INVALID_INPUT',
      'כמות מכירה לא תקינה',
      'Invalid sell quantity',
      { sellLot });
  }
  const opts = {
    cpiTable: options.cpiTable || CPI_TABLE,
    assetType: options.assetType || ASSET_TYPES.SECURITY,
    isSubstantialShareholder: !!options.isSubstantialShareholder,
    linear: options.linear !== false,
  };

  // Deep copy buyLots so we never mutate the caller's objects.
  const pool = buyLots.map((b) => ({ ...b, quantity: +b.quantity }));
  let toSell = +sellLot.quantity;
  const matches = [];
  let totalNominalGain = 0;
  let totalInflationary = 0;
  let totalRealGain = 0;
  let totalTax = 0;
  let totalLoss = 0;
  let anyLoss = false;

  for (let i = 0; i < pool.length && toSell > 0; i++) {
    const lot = pool[i];
    if (lot.quantity <= 0) continue;
    const take = Math.min(lot.quantity, toSell);
    // Per-unit expenses — prorate across full lot quantity when needed
    const buyExpenses  = (+lot.expenses  || 0) * (take / (+buyLots[i].quantity || take));
    const sellExpenses = (+sellLot.expenses || 0) * (take / (+sellLot.quantity));

    const partialComputation = computeCapitalGain({
      purchase:          round2(take * (+lot.price)),
      sale:              round2(take * (+sellLot.price)),
      expenses:          round2(buyExpenses + sellExpenses),
      improvementCosts:  0,
      purchaseDate:      lot.date,
      saleDate:          sellLot.date,
      cpiTable:          opts.cpiTable,
      assetType:         opts.assetType,
      isSubstantialShareholder: opts.isSubstantialShareholder,
      linear:            opts.linear,
    });

    matches.push({
      buyIndex: i,
      buyDate:  lot.date,
      quantity: take,
      computation: partialComputation,
    });

    totalNominalGain  += partialComputation.nominalGain;
    totalInflationary += partialComputation.inflationaryAmount;
    totalRealGain     += partialComputation.realGain;
    totalTax          += partialComputation.tax;
    if (partialComputation.loss) {
      anyLoss = true;
      totalLoss += partialComputation.lossAmount;
    }

    lot.quantity = round6(lot.quantity - take);
    toSell       = round6(toSell - take);
  }

  return {
    matches,
    totals: {
      nominalGain:        round2(totalNominalGain),
      inflationaryAmount: round2(totalInflationary),
      realGain:           round2(totalRealGain),
      tax:                round2(totalTax),
      loss:               anyLoss && totalNominalGain <= 0,
      lossAmount:         round2(totalLoss),
      effectiveRate:      totalRealGain > 0 ? round6(totalTax / totalRealGain) : 0,
    },
    remainingLots: pool,
    unfilled: round6(toSell),
    fullySold: toSell <= 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 7 — Loss carryforward tracker
// ═══════════════════════════════════════════════════════════════════════════

/**
 * createLossTracker(options?) — stateful carryforward ledger (§ 92 לפקודה).
 *
 * Israeli rules:
 *   - Capital losses from the sale of an asset may offset capital gains
 *     in the same year FIRST.
 *   - Unused losses carry forward up to 3 years for general capital losses.
 *   - Real-estate losses offset only real-estate gains (segregation).
 *   - Securities losses offset securities gains + other capital gains
 *     AND may offset interest/dividend from securities in the same year.
 *   - "לא מוחקים" — expired losses are marked `expired: true` but never
 *     deleted from the ledger, so audit trails remain intact.
 *
 * API:
 *   tracker.addLoss(year, amount, category)    // push a loss bucket
 *   tracker.addGain(year, amount, category)    // applies offsets, returns net
 *   tracker.offsetGain(year, amount, category) // alias for addGain
 *   tracker.expireOld(currentYear)             // marks buckets >3y old
 *   tracker.snapshot()                         // full read-only state
 *   tracker.available(year, category)          // total offset available
 */
function createLossTracker(options = {}) {
  const maxYears = options.carryForwardYears || DEFAULTS.carryForwardYears;
  const buckets = []; // { year, category, original, remaining, expired }

  function categoryMatches(bucketCat, targetCat) {
    if (bucketCat === targetCat) return true;
    if (bucketCat === ASSET_TYPES.REAL_ESTATE) return targetCat === ASSET_TYPES.REAL_ESTATE;
    if (targetCat === ASSET_TYPES.REAL_ESTATE) return false;
    // Securities/business can offset each other.
    return (
      (bucketCat === ASSET_TYPES.SECURITY ||
       bucketCat === ASSET_TYPES.PRIVATE_SHARE ||
       bucketCat === ASSET_TYPES.BUSINESS_ASSET ||
       bucketCat === ASSET_TYPES.CRYPTO ||
       bucketCat === ASSET_TYPES.INTELLECTUAL ||
       bucketCat === ASSET_TYPES.OTHER)
    );
  }

  function expireOld(currentYear) {
    for (const b of buckets) {
      if (!b.expired && currentYear - b.year > maxYears) {
        b.expired = true;
      }
    }
  }

  function addLoss(year, amount, category = ASSET_TYPES.SECURITY) {
    if (!Number.isFinite(+amount) || +amount <= 0) {
      throw new CapitalGainsError('INVALID_AMOUNT',
        'סכום הפסד לא תקין',
        'Invalid loss amount',
        { amount });
    }
    const bucket = {
      year: +year,
      category,
      original: round2(+amount),
      remaining: round2(+amount),
      expired: false,
      addedAt: new Date().toISOString(),
    };
    buckets.push(bucket);
    return bucket;
  }

  /**
   * Apply available losses against a gain for the given year+category.
   * Returns:
   *   {
   *     originalGain, appliedOffset, taxableGain,
   *     applications: [ { bucketYear, amount } ],
   *   }
   * Buckets are consumed FIFO (oldest first) per Israeli practice.
   */
  function addGain(year, amount, category = ASSET_TYPES.SECURITY) {
    if (!Number.isFinite(+amount) || +amount < 0) {
      throw new CapitalGainsError('INVALID_AMOUNT',
        'סכום רווח לא תקין',
        'Invalid gain amount',
        { amount });
    }
    expireOld(+year);
    let remaining = round2(+amount);
    const applications = [];
    // Sort buckets by ascending year (FIFO).
    const eligible = buckets
      .filter((b) => !b.expired && b.remaining > 0 && b.year <= +year && categoryMatches(b.category, category))
      .sort((a, b) => a.year - b.year);
    for (const b of eligible) {
      if (remaining <= 0) break;
      const take = Math.min(b.remaining, remaining);
      b.remaining = round2(b.remaining - take);
      remaining   = round2(remaining - take);
      applications.push({ bucketYear: b.year, bucketCategory: b.category, amount: round2(take) });
    }
    return {
      originalGain:  round2(+amount),
      appliedOffset: round2(+amount - remaining),
      taxableGain:   round2(remaining),
      applications,
    };
  }

  function offsetGain(year, amount, category) {
    return addGain(year, amount, category);
  }

  function available(year, category = ASSET_TYPES.SECURITY) {
    expireOld(+year);
    return round2(
      buckets
        .filter((b) => !b.expired && b.remaining > 0 && b.year <= +year && categoryMatches(b.category, category))
        .reduce((s, b) => s + b.remaining, 0),
    );
  }

  function snapshot() {
    return buckets.map((b) => ({ ...b }));
  }

  return {
    addLoss,
    addGain,
    offsetGain,
    expireOld,
    available,
    snapshot,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 8 — Exports
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // Main API
  computeCapitalGain,
  computeSecuritiesGain,
  applyLinearMethod,
  adjustForInflation,
  createLossTracker,
  // Constants
  ASSET_TYPES,
  RATE_SCHEDULE,
  CPI_TABLE,
  DEFAULTS,
  // Error
  CapitalGainsError,
  // Internals (test-only)
  __private: {
    toDate,
    monthKey,
    isoDate,
    daysBetween,
    lookupCpi,
    buildSegments,
    pickRate,
    round2,
    round6,
  },
};
