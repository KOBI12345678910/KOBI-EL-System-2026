/**
 * aging-reports.js — AR / AP Aging Reports Engine (v2)
 * Agent Y-087 / Techno-Kol Uzi Mega-ERP — Wave 2026
 * ---------------------------------------------------------------------------
 *
 * Bilingual (Hebrew / English) aging reports for:
 *   • Accounts Receivable — חייבים / לקוחות פתוחים
 *   • Accounts Payable    — ספקים / זכאים פתוחים
 *
 * House rule: "לא מוחקים רק משדרגים ומגדלים"
 *   This is the v2 engine that SUPPLEMENTS the legacy aging.js. The legacy
 *   module remains untouched and callable — this file adds a leaner, purely
 *   functional class `AgingReports` with the canonical KPIs (DSO, DPO,
 *   concentration risk, variance) and a deterministic CSV/PDF payload
 *   generator for the new dashboard. No records are ever deleted; write-offs
 *   and alerts are appended to the output, never pruned from the input.
 *
 * Zero external dependencies. Pure CommonJS. Deterministic. Stateless.
 *
 * Public API:
 *
 *   class AgingReports
 *     arAging(invoices, asOfDate, { buckets })
 *     apAging(bills, asOfDate, { buckets })
 *     dsoCalculation({ invoices, period, revenue })
 *     dpoCalculation({ bills, period, cogs })
 *     customerAging(customerId, invoices, asOf, { buckets })
 *     vendorAging(vendorId, bills, asOf, { buckets })
 *     topDelinquents(invoices, limit, asOf)
 *     exportCSV(report)
 *     exportPDF(report)
 *     variance(currentReport, priorReport)
 *     alerts({ threshold, bucket }, report)
 *     concentrationRisk(invoices)
 *
 *   DEFAULT_BUCKETS_V2        — [0-30, 31-60, 61-90, 91-180, 180+]
 *   HEBREW_GLOSSARY_V2        — bilingual glossary for this module
 *   daysBetween, bucketFor    — pure helpers exported for tests
 *
 * Input schema (invoices / bills share the same shape):
 *   {
 *     id         : string,               // document id
 *     customerId : string,               // or vendorId on AP
 *     vendorId?  : string,               // AP-only alias
 *     amount     : number,               // gross amount
 *     dueDate    : string | Date,        // ISO date or Date obj
 *     issueDate  : string | Date,
 *     paidDate?  : string | Date | null, // null/undefined ⇒ still open
 *     currency?  : string                // default 'ILS'
 *   }
 *
 * Output is always a plain serializable object: every function returns an
 * object that is safe to JSON.stringify().
 *
 * ---------------------------------------------------------------------------
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────

/**
 * v2 default buckets: 0-30 / 31-60 / 61-90 / 91-180 / 180+.
 * Each bucket is a half-open interval [min, max] in integer days overdue.
 * The sentinel `Infinity` represents the 180+ open-ended tail.
 */
const DEFAULT_BUCKETS_V2 = Object.freeze([
  Object.freeze({ min: 0,   max: 30,       label: '0-30',   labelHe: '0-30 ימים'   }),
  Object.freeze({ min: 31,  max: 60,       label: '31-60',  labelHe: '31-60 ימים'  }),
  Object.freeze({ min: 61,  max: 90,       label: '61-90',  labelHe: '61-90 ימים'  }),
  Object.freeze({ min: 91,  max: 180,      label: '91-180', labelHe: '91-180 ימים' }),
  Object.freeze({ min: 181, max: Infinity, label: '180+',   labelHe: 'מעל 180 ימים' }),
]);

/**
 * Bilingual glossary — exported for UI and tests.
 */
const HEBREW_GLOSSARY_V2 = Object.freeze({
  accountsReceivable:  { he: 'חשבונות חייבים (לקוחות)',       en: 'Accounts Receivable' },
  accountsPayable:     { he: 'חשבונות זכאים (ספקים)',          en: 'Accounts Payable' },
  aging:               { he: 'דוח גיול',                        en: 'Aging Report' },
  bucket:              { he: 'דלי גיול',                        en: 'Aging Bucket' },
  dueDate:             { he: 'תאריך פירעון',                    en: 'Due Date' },
  issueDate:           { he: 'תאריך הנפקה',                     en: 'Issue Date' },
  paidDate:            { he: 'תאריך תשלום',                     en: 'Paid Date' },
  daysOverdue:         { he: 'ימי פיגור',                       en: 'Days Overdue' },
  totalOutstanding:    { he: 'סך יתרה פתוחה',                   en: 'Total Outstanding' },
  dso:                 { he: 'ימי גבייה ממוצעים (DSO)',         en: 'Days Sales Outstanding' },
  dpo:                 { he: 'ימי תשלום ממוצעים (DPO)',         en: 'Days Payable Outstanding' },
  concentrationRisk:   { he: 'סיכון ריכוזיות',                  en: 'Concentration Risk' },
  topDelinquents:      { he: 'חובות גדולים בפיגור',             en: 'Top Delinquents' },
  variance:            { he: 'פערים בין תקופות',                en: 'Period Variance' },
  alert:               { he: 'התראה',                           en: 'Alert' },
  threshold:           { he: 'סף',                               en: 'Threshold' },
  currency:            { he: 'מטבע',                             en: 'Currency' },
  customerId:          { he: 'מזהה לקוח',                       en: 'Customer ID' },
  vendorId:            { he: 'מזהה ספק',                        en: 'Vendor ID' },
  asOfDate:            { he: 'נכון לתאריך',                     en: 'As-Of Date' },
  current:             { he: 'שוטף',                             en: 'Current' },
  pastDue:             { he: 'פיגור',                             en: 'Past Due' },
  overdue30:           { he: 'פיגור מעל 30 יום',                en: 'Overdue 30+' },
  overdue60:           { he: 'פיגור מעל 60 יום',                en: 'Overdue 60+' },
  overdue90:           { he: 'פיגור מעל 90 יום',                en: 'Overdue 90+' },
});

// Status codes. No record is ever deleted — only transitioned.
const STATUS_V2 = Object.freeze({
  OPEN:        'open',
  PAID:        'paid',
  WRITTEN_OFF: 'written_off',
});

// ─────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Convert anything date-like into a midnight-UTC Date. Pure, deterministic.
 * Strings are parsed as ISO. Invalid input throws.
 */
function toDate(x) {
  if (x instanceof Date) return new Date(Date.UTC(
    x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()
  ));
  if (typeof x === 'string' || typeof x === 'number') {
    const d = new Date(x);
    if (Number.isNaN(d.getTime())) throw new TypeError(`Invalid date: ${x}`);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  throw new TypeError(`Unsupported date type: ${typeof x}`);
}

/**
 * Integer days between two dates (a - b). Negative if a is before b.
 */
function daysBetween(a, b) {
  const MS = 86400000;
  return Math.round((toDate(a).getTime() - toDate(b).getTime()) / MS);
}

/**
 * Resolve the bucket an integer `daysOverdue` value falls into.
 * Negative overdue (not yet due) is assigned to the first bucket (0-30 current).
 */
function bucketFor(daysOverdue, buckets) {
  const bs = buckets || DEFAULT_BUCKETS_V2;
  const d = Math.max(0, Math.floor(daysOverdue));
  for (const b of bs) {
    if (d >= b.min && d <= b.max) return b;
  }
  return bs[bs.length - 1];
}

/**
 * Round to 2 decimals using banker-neutral half-up. Keeps CSV totals stable.
 */
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Is this invoice/bill still open on the given as-of date?
 *   — Open if paidDate is null/undefined OR paidDate > asOf.
 */
function isOpenOn(doc, asOf) {
  if (!doc.paidDate) return true;
  return toDate(doc.paidDate).getTime() > toDate(asOf).getTime();
}

/**
 * Compute a normalized bucket map object with zeroes for every bucket.
 */
function zeroBucketMap(buckets) {
  const bs = buckets || DEFAULT_BUCKETS_V2;
  const out = {};
  for (const b of bs) {
    out[b.label] = { count: 0, amount: 0, labelHe: b.labelHe };
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Class AgingReports — stateless pure functions wrapped in a class
// ─────────────────────────────────────────────────────────────────────────

class AgingReports {
  constructor(opts = {}) {
    // Default buckets are frozen, but the user may override per-instance.
    this.defaultBuckets = Object.freeze(
      Array.isArray(opts.buckets) && opts.buckets.length
        ? opts.buckets.map(b => Object.freeze({ ...b }))
        : DEFAULT_BUCKETS_V2
    );
    this.defaultCurrency = opts.currency || 'ILS';
  }

  // ───────────────────────────────────────────────────────────────────
  // arAging — build a bilingual AR aging report
  // ───────────────────────────────────────────────────────────────────
  /**
   * @param {Array}  invoices
   * @param {Date|string} asOfDate
   * @param {Object} [options]
   * @param {Array}  [options.buckets]
   * @returns {Object} report
   */
  arAging(invoices, asOfDate, options = {}) {
    if (!Array.isArray(invoices)) {
      throw new TypeError('arAging: invoices must be an array');
    }
    const asOf = toDate(asOfDate);
    const buckets = options.buckets || this.defaultBuckets;

    const byBucket = zeroBucketMap(buckets);
    const byCustomer = {};
    let totalOpen = 0;
    let totalDocs = 0;

    for (const inv of invoices) {
      if (!isOpenOn(inv, asOf)) continue;

      const daysOverdue = daysBetween(asOf, inv.dueDate);
      const bucket = bucketFor(daysOverdue, buckets);
      const amount = Number(inv.amount) || 0;

      byBucket[bucket.label].count += 1;
      byBucket[bucket.label].amount = round2(byBucket[bucket.label].amount + amount);

      const custKey = inv.customerId || 'UNKNOWN';
      if (!byCustomer[custKey]) {
        byCustomer[custKey] = { total: 0, count: 0, buckets: zeroBucketMap(buckets) };
      }
      byCustomer[custKey].total = round2(byCustomer[custKey].total + amount);
      byCustomer[custKey].count += 1;
      byCustomer[custKey].buckets[bucket.label].count += 1;
      byCustomer[custKey].buckets[bucket.label].amount = round2(
        byCustomer[custKey].buckets[bucket.label].amount + amount
      );

      totalOpen = round2(totalOpen + amount);
      totalDocs += 1;
    }

    return {
      type: 'AR',
      typeHe: HEBREW_GLOSSARY_V2.accountsReceivable.he,
      asOf: asOf.toISOString().slice(0, 10),
      currency: this.defaultCurrency,
      buckets: buckets.map(b => ({ label: b.label, labelHe: b.labelHe, min: b.min, max: b.max })),
      byBucket,
      byCustomer,
      totals: { count: totalDocs, amount: totalOpen },
    };
  }

  // ───────────────────────────────────────────────────────────────────
  // apAging — mirror of arAging for payables
  // ───────────────────────────────────────────────────────────────────
  apAging(bills, asOfDate, options = {}) {
    if (!Array.isArray(bills)) {
      throw new TypeError('apAging: bills must be an array');
    }
    const asOf = toDate(asOfDate);
    const buckets = options.buckets || this.defaultBuckets;

    const byBucket = zeroBucketMap(buckets);
    const byVendor = {};
    let totalOpen = 0;
    let totalDocs = 0;

    for (const bill of bills) {
      if (!isOpenOn(bill, asOf)) continue;

      const daysOverdue = daysBetween(asOf, bill.dueDate);
      const bucket = bucketFor(daysOverdue, buckets);
      const amount = Number(bill.amount) || 0;

      byBucket[bucket.label].count += 1;
      byBucket[bucket.label].amount = round2(byBucket[bucket.label].amount + amount);

      const vendKey = bill.vendorId || bill.customerId || 'UNKNOWN';
      if (!byVendor[vendKey]) {
        byVendor[vendKey] = { total: 0, count: 0, buckets: zeroBucketMap(buckets) };
      }
      byVendor[vendKey].total = round2(byVendor[vendKey].total + amount);
      byVendor[vendKey].count += 1;
      byVendor[vendKey].buckets[bucket.label].count += 1;
      byVendor[vendKey].buckets[bucket.label].amount = round2(
        byVendor[vendKey].buckets[bucket.label].amount + amount
      );

      totalOpen = round2(totalOpen + amount);
      totalDocs += 1;
    }

    return {
      type: 'AP',
      typeHe: HEBREW_GLOSSARY_V2.accountsPayable.he,
      asOf: asOf.toISOString().slice(0, 10),
      currency: this.defaultCurrency,
      buckets: buckets.map(b => ({ label: b.label, labelHe: b.labelHe, min: b.min, max: b.max })),
      byBucket,
      byVendor,
      totals: { count: totalDocs, amount: totalOpen },
    };
  }

  // ───────────────────────────────────────────────────────────────────
  // dsoCalculation — Days Sales Outstanding
  //
  //   DSO = ( Σ openAR / revenue ) * period
  //   openAR is the sum of receivables still open at the end of the period
  //   period is in days (typically 30, 90, 365)
  // ───────────────────────────────────────────────────────────────────
  dsoCalculation({ invoices, period, revenue }) {
    if (!Array.isArray(invoices)) {
      throw new TypeError('dsoCalculation: invoices must be an array');
    }
    const p = Number(period);
    const rev = Number(revenue);
    if (!Number.isFinite(p) || p <= 0) {
      throw new RangeError('dsoCalculation: period must be a positive number');
    }
    if (!Number.isFinite(rev) || rev <= 0) {
      return { dso: 0, openAR: 0, revenue: rev || 0, period: p, note: 'zero_revenue' };
    }

    let openAR = 0;
    for (const inv of invoices) {
      if (!inv.paidDate) {
        openAR += Number(inv.amount) || 0;
      }
    }
    const dso = round2((openAR / rev) * p);
    return { dso, openAR: round2(openAR), revenue: round2(rev), period: p };
  }

  // ───────────────────────────────────────────────────────────────────
  // dpoCalculation — Days Payable Outstanding
  //   DPO = ( Σ openAP / cogs ) * period
  // ───────────────────────────────────────────────────────────────────
  dpoCalculation({ bills, period, cogs }) {
    if (!Array.isArray(bills)) {
      throw new TypeError('dpoCalculation: bills must be an array');
    }
    const p = Number(period);
    const c = Number(cogs);
    if (!Number.isFinite(p) || p <= 0) {
      throw new RangeError('dpoCalculation: period must be a positive number');
    }
    if (!Number.isFinite(c) || c <= 0) {
      return { dpo: 0, openAP: 0, cogs: c || 0, period: p, note: 'zero_cogs' };
    }

    let openAP = 0;
    for (const bill of bills) {
      if (!bill.paidDate) {
        openAP += Number(bill.amount) || 0;
      }
    }
    const dpo = round2((openAP / c) * p);
    return { dpo, openAP: round2(openAP), cogs: round2(c), period: p };
  }

  // ───────────────────────────────────────────────────────────────────
  // customerAging — per-customer drill-down
  // ───────────────────────────────────────────────────────────────────
  customerAging(customerId, invoices, asOf, options = {}) {
    if (!customerId) throw new TypeError('customerAging: customerId required');
    const buckets = options.buckets || this.defaultBuckets;
    const asOfDate = toDate(asOf);
    const byBucket = zeroBucketMap(buckets);
    const items = [];
    let total = 0;

    for (const inv of invoices) {
      if (inv.customerId !== customerId) continue;
      if (!isOpenOn(inv, asOfDate)) continue;

      const daysOverdue = daysBetween(asOfDate, inv.dueDate);
      const bucket = bucketFor(daysOverdue, buckets);
      const amount = Number(inv.amount) || 0;

      byBucket[bucket.label].count += 1;
      byBucket[bucket.label].amount = round2(byBucket[bucket.label].amount + amount);

      items.push({
        id: inv.id,
        amount: round2(amount),
        dueDate: toDate(inv.dueDate).toISOString().slice(0, 10),
        issueDate: toDate(inv.issueDate).toISOString().slice(0, 10),
        daysOverdue,
        bucket: bucket.label,
        bucketHe: bucket.labelHe,
        currency: inv.currency || this.defaultCurrency,
      });
      total = round2(total + amount);
    }

    // Deterministic order: oldest first (largest daysOverdue first).
    items.sort((a, b) => b.daysOverdue - a.daysOverdue || a.id.localeCompare(b.id));

    return {
      customerId,
      asOf: asOfDate.toISOString().slice(0, 10),
      total,
      count: items.length,
      byBucket,
      items,
    };
  }

  // ───────────────────────────────────────────────────────────────────
  // vendorAging — per-vendor drill-down
  // ───────────────────────────────────────────────────────────────────
  vendorAging(vendorId, bills, asOf, options = {}) {
    if (!vendorId) throw new TypeError('vendorAging: vendorId required');
    const buckets = options.buckets || this.defaultBuckets;
    const asOfDate = toDate(asOf);
    const byBucket = zeroBucketMap(buckets);
    const items = [];
    let total = 0;

    for (const bill of bills) {
      const key = bill.vendorId || bill.customerId;
      if (key !== vendorId) continue;
      if (!isOpenOn(bill, asOfDate)) continue;

      const daysOverdue = daysBetween(asOfDate, bill.dueDate);
      const bucket = bucketFor(daysOverdue, buckets);
      const amount = Number(bill.amount) || 0;

      byBucket[bucket.label].count += 1;
      byBucket[bucket.label].amount = round2(byBucket[bucket.label].amount + amount);

      items.push({
        id: bill.id,
        amount: round2(amount),
        dueDate: toDate(bill.dueDate).toISOString().slice(0, 10),
        issueDate: toDate(bill.issueDate).toISOString().slice(0, 10),
        daysOverdue,
        bucket: bucket.label,
        bucketHe: bucket.labelHe,
        currency: bill.currency || this.defaultCurrency,
      });
      total = round2(total + amount);
    }

    items.sort((a, b) => b.daysOverdue - a.daysOverdue || a.id.localeCompare(b.id));

    return {
      vendorId,
      asOf: asOfDate.toISOString().slice(0, 10),
      total,
      count: items.length,
      byBucket,
      items,
    };
  }

  // ───────────────────────────────────────────────────────────────────
  // topDelinquents — largest overdue amounts, descending
  // ───────────────────────────────────────────────────────────────────
  topDelinquents(invoices, limit = 10, asOf = new Date()) {
    if (!Array.isArray(invoices)) {
      throw new TypeError('topDelinquents: invoices must be an array');
    }
    const cap = Math.max(1, Math.floor(Number(limit) || 10));
    const asOfDate = toDate(asOf);
    const rows = [];

    for (const inv of invoices) {
      if (!isOpenOn(inv, asOfDate)) continue;
      const daysOverdue = daysBetween(asOfDate, inv.dueDate);
      if (daysOverdue <= 0) continue; // only overdue

      rows.push({
        id: inv.id,
        customerId: inv.customerId,
        amount: round2(Number(inv.amount) || 0),
        daysOverdue,
        dueDate: toDate(inv.dueDate).toISOString().slice(0, 10),
        currency: inv.currency || this.defaultCurrency,
      });
    }

    // Sort by amount desc, then daysOverdue desc (tie-breaker), then id.
    rows.sort((a, b) =>
      b.amount - a.amount ||
      b.daysOverdue - a.daysOverdue ||
      a.id.localeCompare(b.id)
    );

    return rows.slice(0, cap);
  }

  // ───────────────────────────────────────────────────────────────────
  // exportCSV — bilingual headers, deterministic row order
  // ───────────────────────────────────────────────────────────────────
  exportCSV(report) {
    if (!report || typeof report !== 'object') {
      throw new TypeError('exportCSV: report required');
    }

    const esc = (v) => {
      const s = v == null ? '' : String(v);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const lines = [];

    // Bilingual header row 1: English / Hebrew
    const bucketHeadersEn = (report.buckets || []).map(b => b.label);
    const bucketHeadersHe = (report.buckets || []).map(b => b.labelHe);
    const partyLabel = report.type === 'AP'
      ? { en: 'Vendor ID', he: HEBREW_GLOSSARY_V2.vendorId.he }
      : { en: 'Customer ID', he: HEBREW_GLOSSARY_V2.customerId.he };

    lines.push(
      [partyLabel.en, 'Total', 'Count', ...bucketHeadersEn].map(esc).join(',')
    );
    lines.push(
      [partyLabel.he, 'סך יתרה', 'כמות', ...bucketHeadersHe].map(esc).join(',')
    );

    const partyMap = report.byCustomer || report.byVendor || {};
    const partyKeys = Object.keys(partyMap).sort();

    for (const key of partyKeys) {
      const party = partyMap[key];
      const bucketAmounts = (report.buckets || []).map(b => round2(party.buckets[b.label].amount));
      lines.push([
        key,
        round2(party.total),
        party.count,
        ...bucketAmounts,
      ].map(esc).join(','));
    }

    // Totals footer
    const totalRow = (report.buckets || []).map(b =>
      round2((report.byBucket && report.byBucket[b.label] && report.byBucket[b.label].amount) || 0)
    );
    lines.push([
      'TOTAL / סה״כ',
      round2((report.totals && report.totals.amount) || 0),
      (report.totals && report.totals.count) || 0,
      ...totalRow,
    ].map(esc).join(','));

    return lines.join('\n') + '\n';
  }

  // ───────────────────────────────────────────────────────────────────
  // exportPDF — structured payload for a downstream PDF renderer
  // ───────────────────────────────────────────────────────────────────
  exportPDF(report) {
    if (!report || typeof report !== 'object') {
      throw new TypeError('exportPDF: report required');
    }

    const partyMap = report.byCustomer || report.byVendor || {};
    const partyKeys = Object.keys(partyMap).sort();

    const rows = partyKeys.map(key => ({
      id: key,
      total: round2(partyMap[key].total),
      count: partyMap[key].count,
      buckets: (report.buckets || []).map(b => ({
        label: b.label,
        labelHe: b.labelHe,
        amount: round2(partyMap[key].buckets[b.label].amount),
        count: partyMap[key].buckets[b.label].count,
      })),
    }));

    return {
      meta: {
        title: report.type === 'AP' ? 'דוח גיול ספקים / AP Aging' : 'דוח גיול לקוחות / AR Aging',
        asOf: report.asOf,
        currency: report.currency,
        direction: 'rtl',
        generatedAt: new Date().toISOString(),
      },
      header: {
        en: [
          report.type === 'AP' ? 'Vendor' : 'Customer',
          'Total',
          'Count',
          ...(report.buckets || []).map(b => b.label),
        ],
        he: [
          report.type === 'AP' ? 'ספק' : 'לקוח',
          'סך יתרה',
          'כמות',
          ...(report.buckets || []).map(b => b.labelHe),
        ],
      },
      rows,
      summary: {
        totalAmount: round2((report.totals && report.totals.amount) || 0),
        totalCount:  (report.totals && report.totals.count) || 0,
        byBucket: (report.buckets || []).map(b => ({
          label: b.label,
          labelHe: b.labelHe,
          amount: round2((report.byBucket && report.byBucket[b.label] && report.byBucket[b.label].amount) || 0),
          count:  (report.byBucket && report.byBucket[b.label] && report.byBucket[b.label].count) || 0,
        })),
      },
    };
  }

  // ───────────────────────────────────────────────────────────────────
  // variance — diff two reports (current vs prior) per bucket + total
  // ───────────────────────────────────────────────────────────────────
  variance(currentReport, priorReport) {
    if (!currentReport || !priorReport) {
      throw new TypeError('variance: both reports required');
    }

    const pct = (a, b) => {
      if (!b) return a === 0 ? 0 : Infinity;
      return round2(((a - b) / Math.abs(b)) * 100);
    };

    const bucketLabels = (currentReport.buckets || []).map(b => b.label);
    const byBucket = {};

    for (const label of bucketLabels) {
      const cur = (currentReport.byBucket && currentReport.byBucket[label]) || { amount: 0, count: 0 };
      const pri = (priorReport.byBucket  && priorReport.byBucket[label])  || { amount: 0, count: 0 };
      const delta = round2(cur.amount - pri.amount);
      byBucket[label] = {
        current: round2(cur.amount),
        prior:   round2(pri.amount),
        delta,
        deltaPct: pct(cur.amount, pri.amount),
        direction: delta > 0 ? 'worsened' : delta < 0 ? 'improved' : 'stable',
      };
    }

    const curTotal = round2((currentReport.totals && currentReport.totals.amount) || 0);
    const priTotal = round2((priorReport.totals  && priorReport.totals.amount)  || 0);
    const totalDelta = round2(curTotal - priTotal);

    return {
      type: currentReport.type || 'AR',
      asOfCurrent: currentReport.asOf,
      asOfPrior:   priorReport.asOf,
      byBucket,
      totals: {
        current:  curTotal,
        prior:    priTotal,
        delta:    totalDelta,
        deltaPct: pct(curTotal, priTotal),
        direction: totalDelta > 0 ? 'worsened' : totalDelta < 0 ? 'improved' : 'stable',
      },
    };
  }

  // ───────────────────────────────────────────────────────────────────
  // alerts — flag bucket concentration above a threshold (in currency)
  // ───────────────────────────────────────────────────────────────────
  alerts(opts = {}, report = null) {
    const threshold = Number(opts.threshold) || 0;
    const bucketLabel = opts.bucket;

    if (!report) {
      // With no report passed, return a config echo so callers can compose.
      return {
        config: { threshold, bucket: bucketLabel || 'ANY' },
        triggered: [],
      };
    }

    const triggered = [];
    const bucketLabels = bucketLabel
      ? [bucketLabel]
      : Object.keys(report.byBucket || {});

    for (const label of bucketLabels) {
      const entry = report.byBucket && report.byBucket[label];
      if (!entry) continue;
      if (entry.amount >= threshold) {
        triggered.push({
          bucket: label,
          labelHe: entry.labelHe,
          amount: round2(entry.amount),
          count: entry.count,
          threshold,
          severity: entry.amount >= threshold * 2 ? 'critical' : 'warning',
          messageHe: `חריגה בדלי ${entry.labelHe}: ${round2(entry.amount)} ${report.currency || 'ILS'}`,
          messageEn: `Concentration in bucket ${label}: ${round2(entry.amount)} ${report.currency || 'ILS'}`,
        });
      }
    }

    return {
      asOf: report.asOf,
      config: { threshold, bucket: bucketLabel || 'ANY' },
      triggered,
      anyTriggered: triggered.length > 0,
    };
  }

  // ───────────────────────────────────────────────────────────────────
  // concentrationRisk — top-10 customer AR share
  // ───────────────────────────────────────────────────────────────────
  concentrationRisk(invoices) {
    if (!Array.isArray(invoices)) {
      throw new TypeError('concentrationRisk: invoices must be an array');
    }

    const byCustomer = {};
    let grandTotal = 0;

    for (const inv of invoices) {
      if (inv.paidDate) continue;
      const key = inv.customerId || 'UNKNOWN';
      const amt = Number(inv.amount) || 0;
      byCustomer[key] = round2((byCustomer[key] || 0) + amt);
      grandTotal = round2(grandTotal + amt);
    }

    const sorted = Object.keys(byCustomer)
      .map(k => ({
        customerId: k,
        amount: byCustomer[k],
        sharePct: grandTotal > 0 ? round2((byCustomer[k] / grandTotal) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount || a.customerId.localeCompare(b.customerId));

    const top10 = sorted.slice(0, 10);
    const top10Total = round2(top10.reduce((s, r) => s + r.amount, 0));
    const top10Share = grandTotal > 0
      ? round2((top10Total / grandTotal) * 100)
      : 0;

    // HHI concentration index (sum of squared shares). Higher ⇒ more concentrated.
    const hhi = round2(sorted.reduce((s, r) => s + r.sharePct * r.sharePct, 0));

    return {
      grandTotal,
      customerCount: sorted.length,
      top10,
      top10Total,
      top10SharePct: top10Share,
      hhi,
      risk: top10Share >= 80 ? 'high' : top10Share >= 50 ? 'medium' : 'low',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────

module.exports = {
  AgingReports,
  DEFAULT_BUCKETS_V2,
  HEBREW_GLOSSARY_V2,
  STATUS_V2,
  // exported helpers for tests
  daysBetween,
  bucketFor,
  toDate,
  round2,
  isOpenOn,
  zeroBucketMap,
};
