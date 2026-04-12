/**
 * aging.js — AR / AP Aging Reports Engine
 * Agent Y-087 / Swarm 3C / Techno-Kol Uzi Mega-ERP — Wave 2026
 * ---------------------------------------------------------------------------
 *
 * Bilingual (Hebrew / English) aging-reports module covering both
 *   • Accounts Receivable (חייבים / לקוחות)
 *   • Accounts Payable    (ספקים / זכאים)
 *
 * House rule: "לא מוחקים רק משדרגים ומגדלים"
 *   — this module never deletes. write-offs, disputes, resolutions are all
 *     recorded as append-only state transitions. Every record survives for
 *     audit purposes.
 *
 * Zero external dependencies. Pure CommonJS. Deterministic.
 *
 * Features:
 *   1. arAging          — AR aging by customer and bucket, as-of any date
 *   2. apAging          — AP aging by supplier and bucket
 *   3. agingBySupplier  — single-supplier drilldown
 *   4. agingByCustomer  — single-customer drilldown
 *   5. aveDaysToPay     — average time customer X takes to pay us (DSO-ish)
 *   6. aveDaysToBeingPaid — average time we take to pay supplier Y (DPO)
 *   7. disputedItems    — AR/AP items flagged in dispute
 *   8. writeOffs        — bad-debt write-offs ledger
 *   9. concentrationAnalysis — top-10 exposure (AR + AP)
 *  10. trendAnalysis    — compare buckets over N periods
 *  11. bucketMovement   — track rolls from one bucket to next
 *  12. reminderGeneration — bilingual polite / firm / legal letters
 *  13. generateARReport / generateAPReport — bilingual PDF (pure SVG + text)
 *  14. customerStatement — Hebrew statement-of-account
 *
 * Bucket definitions (default):
 *   0-30, 31-60, 61-90, 91-120, 120+
 * Overrideable via constructor or per-call.
 *
 * All amounts are in ILS (₪) unless a `currency` field indicates otherwise.
 *
 * ---------------------------------------------------------------------------
 * Public exports:
 *
 *   class Aging                        — main class
 *   DEFAULT_BUCKETS                    — [0-30, 31-60, 61-90, 91-120, 120+]
 *   REMINDER_TONES                     — polite / firm / legal
 *   STATUS                             — open / paid / disputed / written_off
 *   HEBREW_GLOSSARY                    — full bilingual glossary
 *   daysBetween / bucketFor            — helper primitives (exported for tests)
 *
 * ---------------------------------------------------------------------------
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────

/**
 * Default bucket definitions. Each bucket is a half-open interval:
 *   { min, max, label }   where min <= daysOverdue <= max
 * For 120+ the max is Infinity.
 */
const DEFAULT_BUCKETS = Object.freeze([
  Object.freeze({ min:   0, max:  30, label: '0-30',    he: '0-30 ימים'     }),
  Object.freeze({ min:  31, max:  60, label: '31-60',   he: '31-60 ימים'    }),
  Object.freeze({ min:  61, max:  90, label: '61-90',   he: '61-90 ימים'    }),
  Object.freeze({ min:  91, max: 120, label: '91-120',  he: '91-120 ימים'   }),
  Object.freeze({ min: 121, max: Infinity, label: '120+', he: 'מעל 120 ימים' }),
]);

const REMINDER_TONES = Object.freeze({
  POLITE: 'polite',  // 0-30  or first contact
  FIRM:   'firm',    // 31-90 or second contact
  LEGAL:  'legal',   // 91+   or final contact before collection
});

const STATUS = Object.freeze({
  OPEN:        'open',
  PARTIAL:     'partial',
  PAID:        'paid',
  DISPUTED:    'disputed',
  WRITTEN_OFF: 'written_off',
});

const HEBREW_GLOSSARY = Object.freeze({
  // AR terms
  ar:                   'חייבים',
  customer:             'לקוח',
  customers:            'לקוחות',
  receivable:           'חוב ללקוח',
  receivables:          'חייבים',
  dso:                  'ימי גבייה ממוצעים (DSO)',
  collection:           'גבייה',
  // AP terms
  ap:                   'זכאים',
  supplier:             'ספק',
  suppliers:            'ספקים',
  payable:              'חוב לספק',
  payables:             'זכאים',
  dpo:                  'ימי תשלום ממוצעים (DPO)',
  // generic
  invoice:              'חשבונית',
  amount:               'סכום',
  dueDate:              'תאריך פירעון',
  issueDate:            'תאריך הפקה',
  daysOverdue:          'ימי פיגור',
  bucket:               'שכבה',
  aging:                'יישון',
  agingReport:          'דו"ח יישון',
  arAgingReport:        'דו"ח יישון חייבים',
  apAgingReport:        'דו"ח יישון זכאים',
  currentPeriod:        'תקופה נוכחית',
  previousPeriod:       'תקופה קודמת',
  total:                'סה"כ',
  outstanding:          'פתוח',
  paid:                 'שולם',
  disputed:             'במחלוקת',
  writeOff:             'מחיקה',
  writeOffs:            'מחיקות',
  badDebt:              'חוב אבוד',
  concentration:        'ריכוזיות',
  exposure:             'חשיפה',
  trend:                'מגמה',
  improving:            'משתפרת',
  deteriorating:        'מידרדרת',
  stable:               'יציבה',
  polite:               'מנומסת',
  firm:                 'תקיפה',
  legal:                'משפטית',
  reminder:             'תזכורת',
  statement:            'דו"ח חשבון',
  statementOfAccount:   'דו"ח חשבון לקוח',
  asOf:                 'נכון ליום',
  openingBalance:       'יתרת פתיחה',
  closingBalance:       'יתרת סגירה',
  debit:                'חובה',
  credit:               'זכות',
  balance:              'יתרה',
});

// ─────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────

/**
 * Parse anything date-like (Date, ISO string, timestamp) into a Date.
 * Returns `null` for null / undefined / invalid.
 */
function parseDate(x) {
  if (x === null || x === undefined || x === '') return null;
  if (x instanceof Date) return isNaN(x.getTime()) ? null : x;
  const d = new Date(x);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Whole-day difference between two dates (b - a). DST-safe because it
 * uses UTC midpoints. A positive value means `b` is after `a`.
 */
function daysBetween(a, b) {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return 0;
  const MS = 86_400_000;
  const ua = Date.UTC(da.getUTCFullYear(), da.getUTCMonth(), da.getUTCDate());
  const ub = Date.UTC(db.getUTCFullYear(), db.getUTCMonth(), db.getUTCDate());
  return Math.round((ub - ua) / MS);
}

/** Add N days to a date (non-mutating). */
function addDays(date, n) {
  const d = parseDate(date);
  if (!d) return null;
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

/** ISO date (YYYY-MM-DD) of a Date. */
function isoDate(d) {
  const dt = parseDate(d);
  if (!dt) return '';
  return dt.toISOString().slice(0, 10);
}

/**
 * Return bucket record for a given daysOverdue.
 * Items that are not yet due (daysOverdue < 0) are still placed in the
 * "0-30" bucket because the bucket's semantic is "0..30 from due" not
 * "0..30 past due". Tests pin this explicitly.
 */
function bucketFor(daysOverdue, buckets) {
  const bk = buckets || DEFAULT_BUCKETS;
  const d = daysOverdue < 0 ? 0 : daysOverdue;
  for (const b of bk) {
    if (d >= b.min && d <= b.max) return b;
  }
  return bk[bk.length - 1]; // fallback to last bucket
}

/** Format an ILS amount for display. */
function fmtILS(n) {
  const v = Number(n) || 0;
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  const s = abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return sign + '₪' + s;
}

/** Clamp a number. */
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number(n) || 0));
}

/** Safe sum. */
function sum(xs, pick) {
  let t = 0;
  for (const x of xs) t += Number(pick ? pick(x) : x) || 0;
  return t;
}

/** Average (or 0 if empty). */
function avg(xs, pick) {
  if (!xs || xs.length === 0) return 0;
  return sum(xs, pick) / xs.length;
}

/** Deep freeze (shallow-recursive). */
function deepFreeze(o) {
  if (o === null || typeof o !== 'object' || Object.isFrozen(o)) return o;
  for (const k of Object.keys(o)) deepFreeze(o[k]);
  return Object.freeze(o);
}

/** Build a new empty bucket-summary record. */
function emptyBucketSummary(buckets) {
  const bk = buckets || DEFAULT_BUCKETS;
  const result = {};
  for (const b of bk) {
    result[b.label] = { count: 0, total: 0 };
  }
  return result;
}

/** Simple, deterministic SVG bar chart — pure string output. */
function svgBarChart({ title, labels, values, width, height }) {
  const W = width || 640;
  const H = height || 240;
  const padL = 60;
  const padR = 20;
  const padT = 30;
  const padB = 50;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = labels.length;
  const barW = Math.max(1, Math.floor((plotW / Math.max(1, n)) - 8));
  const maxV = Math.max(1, ...values.map(v => Number(v) || 0));
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
  parts.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  parts.push(`<text x="${W / 2}" y="20" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="bold">${escapeXml(title || '')}</text>`);
  // axes
  parts.push(`<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" stroke="#000" stroke-width="1"/>`);
  parts.push(`<line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="#000" stroke-width="1"/>`);
  for (let i = 0; i < n; i++) {
    const v = Number(values[i]) || 0;
    const h = Math.round((v / maxV) * plotH);
    const x = padL + 4 + i * (plotW / n);
    const y = H - padB - h;
    const fill = '#4a90e2';
    parts.push(`<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${fill}" stroke="#1c5191" stroke-width="1"/>`);
    parts.push(`<text x="${x + barW / 2}" y="${H - padB + 14}" text-anchor="middle" font-family="sans-serif" font-size="10">${escapeXml(labels[i])}</text>`);
    parts.push(`<text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-family="sans-serif" font-size="10">${escapeXml(String(v))}</text>`);
  }
  parts.push('</svg>');
  return parts.join('');
}

/** Minimal XML/HTML escaper. */
function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─────────────────────────────────────────────────────────────────────────
// Main class
// ─────────────────────────────────────────────────────────────────────────

/**
 * Aging — AR / AP aging engine.
 *
 * Stateful store is passed in via constructor options (for integration
 * with the wider ERP), otherwise it maintains its own in-memory store
 * for isolated unit tests.
 *
 *   opts.arInvoices        — seed AR invoices
 *   opts.apInvoices        — seed AP invoices
 *   opts.payments          — seed payments (AR + AP)
 *   opts.disputes          — seed dispute records
 *   opts.writeOffs         — seed write-off ledger
 *   opts.customers         — seed customer master
 *   opts.suppliers         — seed supplier master
 *   opts.buckets           — override DEFAULT_BUCKETS
 *   opts.asOfDefault       — default as-of date (else today)
 */
class Aging {
  constructor(opts = {}) {
    this.buckets = opts.buckets ? Object.freeze(opts.buckets.map(b => Object.freeze({ ...b }))) : DEFAULT_BUCKETS;
    this.asOfDefault = opts.asOfDefault ? parseDate(opts.asOfDefault) : null;

    /** @type {Map<string, object>} */
    this.arInvoices = new Map();
    /** @type {Map<string, object>} */
    this.apInvoices = new Map();
    /** @type {Array<object>} */
    this.payments = [];
    /** @type {Map<string, object>} */
    this.disputes = new Map();
    /** @type {Array<object>} */
    this.writeOffsLog = [];
    /** @type {Map<string, object>} */
    this.customers = new Map();
    /** @type {Map<string, object>} */
    this.suppliers = new Map();
    /** @type {Array<object>} */
    this.snapshots = []; // bucket snapshots over time, for trend & movement

    if (opts.customers) for (const c of opts.customers) this.addCustomer(c);
    if (opts.suppliers) for (const s of opts.suppliers) this.addSupplier(s);
    if (opts.arInvoices) for (const inv of opts.arInvoices) this.addARInvoice(inv);
    if (opts.apInvoices) for (const inv of opts.apInvoices) this.addAPInvoice(inv);
    if (opts.payments) for (const p of opts.payments) this.recordPayment(p);
    if (opts.disputes) for (const d of opts.disputes) this.flagDispute(d);
    if (opts.writeOffs) for (const w of opts.writeOffs) this.writeOff(w);
  }

  // ────── mutators (append-only) ─────────────────────────────────────────

  /** Add or upgrade a customer. Existing customers are updated, never deleted. */
  addCustomer(c) {
    if (!c || !c.id) throw new Error('customer.id required');
    const prev = this.customers.get(c.id) || {};
    this.customers.set(c.id, { ...prev, ...c });
    return this.customers.get(c.id);
  }

  /** Add or upgrade a supplier. */
  addSupplier(s) {
    if (!s || !s.id) throw new Error('supplier.id required');
    const prev = this.suppliers.get(s.id) || {};
    this.suppliers.set(s.id, { ...prev, ...s });
    return this.suppliers.get(s.id);
  }

  /** Add an AR invoice. Existing ids are upgraded (never removed). */
  addARInvoice(inv) {
    if (!inv || !inv.id) throw new Error('AR invoice.id required');
    if (inv.customerId == null) throw new Error('AR invoice.customerId required');
    const record = {
      id:          String(inv.id),
      customerId:  String(inv.customerId),
      issueDate:   inv.issueDate || inv.date || null,
      dueDate:     inv.dueDate || null,
      amount:      Number(inv.amount) || 0,
      currency:    inv.currency || 'ILS',
      status:      inv.status || STATUS.OPEN,
      reference:   inv.reference || null,
      notes:       inv.notes || '',
    };
    const prev = this.arInvoices.get(record.id) || {};
    this.arInvoices.set(record.id, { ...prev, ...record });
    return this.arInvoices.get(record.id);
  }

  /** Add an AP invoice. */
  addAPInvoice(inv) {
    if (!inv || !inv.id) throw new Error('AP invoice.id required');
    if (inv.supplierId == null) throw new Error('AP invoice.supplierId required');
    const record = {
      id:          String(inv.id),
      supplierId:  String(inv.supplierId),
      issueDate:   inv.issueDate || inv.date || null,
      dueDate:     inv.dueDate || null,
      amount:      Number(inv.amount) || 0,
      currency:    inv.currency || 'ILS',
      status:      inv.status || STATUS.OPEN,
      reference:   inv.reference || null,
      notes:       inv.notes || '',
    };
    const prev = this.apInvoices.get(record.id) || {};
    this.apInvoices.set(record.id, { ...prev, ...record });
    return this.apInvoices.get(record.id);
  }

  /**
   * Record a payment (AR receipt or AP disbursement).
   *   { type: 'AR'|'AP', invoiceId, amount, date }
   * Payments are append-only. If a payment fully covers the invoice, the
   * invoice is marked PAID (but the record stays forever).
   */
  recordPayment(p) {
    if (!p || !p.type || !p.invoiceId) throw new Error('payment.type + invoiceId required');
    const record = {
      type:       String(p.type).toUpperCase(),
      invoiceId:  String(p.invoiceId),
      amount:     Number(p.amount) || 0,
      date:       p.date || null,
      method:     p.method || 'unknown',
      reference:  p.reference || null,
    };
    this.payments.push(record);
    // update invoice status
    const bucket = record.type === 'AR' ? this.arInvoices : this.apInvoices;
    const inv = bucket.get(record.invoiceId);
    if (inv) {
      const outstanding = this._outstanding(inv);
      if (outstanding <= 0.001) inv.status = STATUS.PAID;
      else if (outstanding < inv.amount) inv.status = STATUS.PARTIAL;
    }
    return record;
  }

  /** Flag a dispute — { type, invoiceId, reason, flaggedBy, flaggedAt } */
  flagDispute(d) {
    if (!d || !d.invoiceId) throw new Error('dispute.invoiceId required');
    const record = {
      type:       String(d.type || 'AR').toUpperCase(),
      invoiceId:  String(d.invoiceId),
      reason:     d.reason || '',
      flaggedBy:  d.flaggedBy || 'system',
      flaggedAt:  d.flaggedAt || null,
      resolvedAt: d.resolvedAt || null,
      resolution: d.resolution || null,
    };
    this.disputes.set(record.invoiceId, record);
    // mark invoice disputed (but do not lose any prior status)
    const bucket = record.type === 'AR' ? this.arInvoices : this.apInvoices;
    const inv = bucket.get(record.invoiceId);
    if (inv) inv.status = STATUS.DISPUTED;
    return record;
  }

  /** Resolve a dispute; the record is NEVER deleted, it's stamped. */
  resolveDispute(invoiceId, resolution) {
    const d = this.disputes.get(String(invoiceId));
    if (!d) return null;
    d.resolvedAt = resolution?.at || new Date().toISOString();
    d.resolution = resolution?.note || '';
    // move invoice back to OPEN if nothing else (outstanding > 0)
    const inv = this.arInvoices.get(String(invoiceId)) || this.apInvoices.get(String(invoiceId));
    if (inv && this._outstanding(inv) > 0.001) inv.status = STATUS.OPEN;
    return d;
  }

  /** Write off a bad debt. Append-only. */
  writeOff(w) {
    if (!w || !w.invoiceId) throw new Error('writeOff.invoiceId required');
    const record = {
      type:       String(w.type || 'AR').toUpperCase(),
      invoiceId:  String(w.invoiceId),
      amount:     Number(w.amount) || 0,
      reason:     w.reason || '',
      approvedBy: w.approvedBy || '',
      date:       w.date || null,
    };
    this.writeOffsLog.push(record);
    const bucket = record.type === 'AR' ? this.arInvoices : this.apInvoices;
    const inv = bucket.get(record.invoiceId);
    if (inv) inv.status = STATUS.WRITTEN_OFF;
    return record;
  }

  /** Save a snapshot (for trend and movement analyses). */
  captureSnapshot({ asOfDate, note }) {
    const asOf = parseDate(asOfDate) || new Date();
    const ar = this.arAging({ asOfDate: asOf });
    const ap = this.apAging(asOf);
    const snap = {
      asOf: isoDate(asOf),
      note: note || '',
      arTotals: ar.totals,
      apTotals: ap.totals,
      arItems: ar.items.map(it => ({ id: it.id, customerId: it.customerId, bucket: it.bucket, outstanding: it.outstanding })),
      apItems: ap.items.map(it => ({ id: it.id, supplierId: it.supplierId, bucket: it.bucket, outstanding: it.outstanding })),
    };
    this.snapshots.push(snap);
    return snap;
  }

  // ────── private helpers ────────────────────────────────────────────────

  /**
   * Compute outstanding for `inv`, optionally as-of a specific date.
   * If `asOf` is omitted the computation uses all payments ever recorded
   * (live view). If `asOf` is provided, only payments whose date is
   * on or before `asOf` are subtracted — this is what arAging/apAging
   * use so that historical snapshots are accurate.
   */
  _outstanding(inv, asOf) {
    if (!inv) return 0;
    // write-off is only recognized after it occurred
    if (inv.status === STATUS.WRITTEN_OFF && !asOf) return 0;
    const type = inv.customerId ? 'AR' : 'AP';
    const cut = asOf ? parseDate(asOf) : null;
    let paid = 0;
    for (const p of this.payments) {
      if (p.type !== type || p.invoiceId !== inv.id) continue;
      if (cut) {
        const pd = parseDate(p.date);
        if (!pd || pd > cut) continue;
      }
      paid += p.amount;
    }
    // Also deduct write-offs (append-only ledger) — but only if as-of is
    // at-or-after the write-off date.
    if (cut) {
      for (const w of this.writeOffsLog) {
        if (w.type !== type || w.invoiceId !== inv.id) continue;
        const wd = parseDate(w.date);
        if (!wd || wd > cut) continue;
        paid += w.amount;
      }
    } else if (inv.status === STATUS.WRITTEN_OFF) {
      return 0;
    }
    return Math.max(0, (inv.amount || 0) - paid);
  }

  _asOf(asOfDate) {
    return parseDate(asOfDate) || this.asOfDefault || new Date();
  }

  _isWithinPeriod(date, period) {
    if (!period) return true;
    const d = parseDate(date);
    if (!d) return false;
    const from = parseDate(period.from);
    const to   = parseDate(period.to);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }

  _rowForInvoice(inv, asOf, side) {
    const outstanding = this._outstanding(inv, asOf);
    const daysOverdue = inv.dueDate ? daysBetween(inv.dueDate, asOf) : 0;
    const bkt = bucketFor(daysOverdue, this.buckets);
    const masterId = side === 'AR' ? inv.customerId : inv.supplierId;
    const masterMap = side === 'AR' ? this.customers : this.suppliers;
    const master = masterMap.get(masterId) || { id: masterId, name: masterId };
    return {
      id:          inv.id,
      customerId:  side === 'AR' ? inv.customerId : undefined,
      supplierId:  side === 'AP' ? inv.supplierId : undefined,
      partyName:   master.name || masterId,
      issueDate:   inv.issueDate,
      dueDate:     inv.dueDate,
      amount:      inv.amount,
      currency:    inv.currency,
      status:      inv.status,
      outstanding,
      daysOverdue,
      bucket:      bkt.label,
      bucketHe:    bkt.he,
    };
  }

  /**
   * True if an invoice "existed" at the given as-of date, meaning its
   * issue date is on or before as-of. Invoices with no issueDate are
   * assumed to exist forever (caller responsibility).
   */
  _existedAt(inv, asOf) {
    if (!inv.issueDate) return true;
    const d = parseDate(inv.issueDate);
    const a = parseDate(asOf);
    if (!d || !a) return true;
    return d <= a;
  }

  // ────── required API ───────────────────────────────────────────────────

  /**
   * AR Aging — receivables aging.
   *
   *   arAging({ asOfDate, buckets })
   *
   * Returns { asOf, buckets, items, byCustomer, totals }.
   */
  arAging({ asOfDate, buckets } = {}) {
    const asOf = this._asOf(asOfDate);
    const bk = buckets || this.buckets;
    const items = [];
    const byCustomer = new Map();
    const bucketSummary = emptyBucketSummary(bk);

    for (const inv of this.arInvoices.values()) {
      if (!this._existedAt(inv, asOf)) continue;
      const row = this._rowForInvoice(inv, asOf, 'AR');
      if (row.outstanding <= 0) continue;
      items.push(row);
      // by customer
      if (!byCustomer.has(row.customerId)) {
        byCustomer.set(row.customerId, {
          customerId: row.customerId,
          name:       row.partyName,
          total:      0,
          buckets:    emptyBucketSummary(bk),
          items:      [],
        });
      }
      const entry = byCustomer.get(row.customerId);
      entry.total += row.outstanding;
      entry.buckets[row.bucket].count += 1;
      entry.buckets[row.bucket].total += row.outstanding;
      entry.items.push(row);
      // global buckets
      bucketSummary[row.bucket].count += 1;
      bucketSummary[row.bucket].total += row.outstanding;
    }

    const totals = {
      count:   items.length,
      total:   sum(items, it => it.outstanding),
      buckets: bucketSummary,
    };

    return {
      asOf: isoDate(asOf),
      buckets: bk.map(b => ({ ...b })),
      items,
      byCustomer: Array.from(byCustomer.values()),
      totals,
    };
  }

  /**
   * AP Aging — payables aging.
   *
   *   apAging(asOfDate)
   */
  apAging(asOfDate) {
    const asOf = this._asOf(asOfDate);
    const bk = this.buckets;
    const items = [];
    const bySupplier = new Map();
    const bucketSummary = emptyBucketSummary(bk);

    for (const inv of this.apInvoices.values()) {
      if (!this._existedAt(inv, asOf)) continue;
      const row = this._rowForInvoice(inv, asOf, 'AP');
      if (row.outstanding <= 0) continue;
      items.push(row);
      if (!bySupplier.has(row.supplierId)) {
        bySupplier.set(row.supplierId, {
          supplierId: row.supplierId,
          name:       row.partyName,
          total:      0,
          buckets:    emptyBucketSummary(bk),
          items:      [],
        });
      }
      const entry = bySupplier.get(row.supplierId);
      entry.total += row.outstanding;
      entry.buckets[row.bucket].count += 1;
      entry.buckets[row.bucket].total += row.outstanding;
      entry.items.push(row);
      bucketSummary[row.bucket].count += 1;
      bucketSummary[row.bucket].total += row.outstanding;
    }

    const totals = {
      count:   items.length,
      total:   sum(items, it => it.outstanding),
      buckets: bucketSummary,
    };

    return {
      asOf: isoDate(asOf),
      buckets: bk.map(b => ({ ...b })),
      items,
      bySupplier: Array.from(bySupplier.values()),
      totals,
    };
  }

  /**
   * agingBySupplier(supplierId, period) — one supplier drilldown.
   * period = { from, to } (optional) — filters by issueDate.
   */
  agingBySupplier(supplierId, period) {
    const asOf = this._asOf(period?.asOf);
    const sid = String(supplierId);
    const items = [];
    const bucketSummary = emptyBucketSummary(this.buckets);
    for (const inv of this.apInvoices.values()) {
      if (inv.supplierId !== sid) continue;
      if (period && !this._isWithinPeriod(inv.issueDate, period)) continue;
      const row = this._rowForInvoice(inv, asOf, 'AP');
      items.push(row);
      if (row.outstanding > 0 && inv.status !== STATUS.PAID && inv.status !== STATUS.WRITTEN_OFF) {
        bucketSummary[row.bucket].count += 1;
        bucketSummary[row.bucket].total += row.outstanding;
      }
    }
    const supplier = this.suppliers.get(sid) || { id: sid, name: sid };
    return {
      supplier,
      asOf: isoDate(asOf),
      items,
      buckets: bucketSummary,
      totalOutstanding: sum(items.filter(i => i.status === STATUS.OPEN || i.status === STATUS.PARTIAL || i.status === STATUS.DISPUTED), it => it.outstanding),
    };
  }

  /** agingByCustomer(customerId, period) — one customer drilldown. */
  agingByCustomer(customerId, period) {
    const asOf = this._asOf(period?.asOf);
    const cid = String(customerId);
    const items = [];
    const bucketSummary = emptyBucketSummary(this.buckets);
    for (const inv of this.arInvoices.values()) {
      if (inv.customerId !== cid) continue;
      if (period && !this._isWithinPeriod(inv.issueDate, period)) continue;
      const row = this._rowForInvoice(inv, asOf, 'AR');
      items.push(row);
      if (row.outstanding > 0 && inv.status !== STATUS.PAID && inv.status !== STATUS.WRITTEN_OFF) {
        bucketSummary[row.bucket].count += 1;
        bucketSummary[row.bucket].total += row.outstanding;
      }
    }
    const customer = this.customers.get(cid) || { id: cid, name: cid };
    return {
      customer,
      asOf: isoDate(asOf),
      items,
      buckets: bucketSummary,
      totalOutstanding: sum(items.filter(i => i.status === STATUS.OPEN || i.status === STATUS.PARTIAL || i.status === STATUS.DISPUTED), it => it.outstanding),
    };
  }

  /**
   * aveDaysToPay({ customerId, period }) — average days a customer takes.
   * Returns avgDays (number) + sample.
   * Also exposed as DSO for that customer for the given period.
   */
  aveDaysToPay({ customerId, period } = {}) {
    const cid = customerId != null ? String(customerId) : null;
    const samples = [];
    for (const p of this.payments) {
      if (p.type !== 'AR') continue;
      const inv = this.arInvoices.get(p.invoiceId);
      if (!inv) continue;
      if (cid && inv.customerId !== cid) continue;
      if (period && !this._isWithinPeriod(p.date, period)) continue;
      if (!inv.issueDate || !p.date) continue;
      const days = daysBetween(inv.issueDate, p.date);
      samples.push({ invoiceId: inv.id, customerId: inv.customerId, days });
    }
    return {
      customerId: cid,
      avgDays: Math.round(avg(samples, s => s.days) * 100) / 100,
      sampleSize: samples.length,
      samples,
    };
  }

  /**
   * aveDaysToBeingPaid({ supplierId, period }) — our DPO for a supplier.
   * (Measures how many days elapse between the supplier's invoice issueDate
   *  and our actual payment date.)
   */
  aveDaysToBeingPaid({ supplierId, period } = {}) {
    const sid = supplierId != null ? String(supplierId) : null;
    const samples = [];
    for (const p of this.payments) {
      if (p.type !== 'AP') continue;
      const inv = this.apInvoices.get(p.invoiceId);
      if (!inv) continue;
      if (sid && inv.supplierId !== sid) continue;
      if (period && !this._isWithinPeriod(p.date, period)) continue;
      if (!inv.issueDate || !p.date) continue;
      const days = daysBetween(inv.issueDate, p.date);
      samples.push({ invoiceId: inv.id, supplierId: inv.supplierId, days });
    }
    return {
      supplierId: sid,
      avgDays: Math.round(avg(samples, s => s.days) * 100) / 100,
      sampleSize: samples.length,
      samples,
    };
  }

  /**
   * disputedItems(period) — AR + AP items currently or historically in dispute.
   */
  disputedItems(period) {
    const results = { ar: [], ap: [] };
    for (const d of this.disputes.values()) {
      if (period && !this._isWithinPeriod(d.flaggedAt, period)) continue;
      const side = d.type === 'AP' ? 'ap' : 'ar';
      const bucket = side === 'ar' ? this.arInvoices : this.apInvoices;
      const inv = bucket.get(d.invoiceId);
      results[side].push({
        invoiceId: d.invoiceId,
        reason:    d.reason,
        flaggedBy: d.flaggedBy,
        flaggedAt: d.flaggedAt,
        resolvedAt: d.resolvedAt,
        resolution: d.resolution,
        amount:    inv ? inv.amount : 0,
        outstanding: inv ? this._outstanding(inv) : 0,
        partyId:   inv ? (inv.customerId || inv.supplierId) : null,
      });
    }
    return results;
  }

  /**
   * writeOffs(period) — bad-debt write-offs filtered by period.
   */
  writeOffs(period) {
    const list = this.writeOffsLog.filter(w => !period || this._isWithinPeriod(w.date, period));
    return {
      count:  list.length,
      total:  sum(list, w => w.amount),
      items:  list,
    };
  }

  /**
   * concentrationAnalysis() — top-10 customer exposure + top-10 supplier exposure.
   * (Helpful for risk reports / lending covenants.)
   */
  concentrationAnalysis() {
    const ar = this.arAging();
    const ap = this.apAging();
    const topCustomers = ar.byCustomer
      .map(c => ({ customerId: c.customerId, name: c.name, total: c.total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
    const topSuppliers = ap.bySupplier
      .map(s => ({ supplierId: s.supplierId, name: s.name, total: s.total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
    const totalAR = ar.totals.total;
    const totalAP = ap.totals.total;
    for (const t of topCustomers) t.pctOfAR = totalAR > 0 ? Math.round((t.total / totalAR) * 10000) / 100 : 0;
    for (const t of topSuppliers) t.pctOfAP = totalAP > 0 ? Math.round((t.total / totalAP) * 10000) / 100 : 0;
    return {
      topCustomers,
      topSuppliers,
      totalAR,
      totalAP,
      topCustomerShare: topCustomers.length ? Math.round((sum(topCustomers, t => t.total) / Math.max(1, totalAR)) * 10000) / 100 : 0,
      topSupplierShare: topSuppliers.length ? Math.round((sum(topSuppliers, t => t.total) / Math.max(1, totalAP)) * 10000) / 100 : 0,
    };
  }

  /**
   * trendAnalysis(periods) — given N period snapshots (or N past dates),
   * compare bucket totals and classify direction.
   *
   * periods = array of {asOfDate, label?} — or omitted to use self.snapshots.
   */
  trendAnalysis(periods) {
    const snaps = [];
    if (periods && periods.length) {
      for (const p of periods) {
        const asOf = parseDate(p.asOfDate) || new Date();
        const ar = this.arAging({ asOfDate: asOf });
        const ap = this.apAging(asOf);
        snaps.push({
          asOf: isoDate(asOf),
          label: p.label || isoDate(asOf),
          arTotals: ar.totals,
          apTotals: ap.totals,
        });
      }
    } else {
      for (const s of this.snapshots) {
        snaps.push({
          asOf: s.asOf,
          label: s.note || s.asOf,
          arTotals: s.arTotals,
          apTotals: s.apTotals,
        });
      }
    }

    const trends = [];
    for (let i = 1; i < snaps.length; i++) {
      const prev = snaps[i - 1];
      const curr = snaps[i];
      const arDelta = curr.arTotals.total - prev.arTotals.total;
      const apDelta = curr.apTotals.total - prev.apTotals.total;
      const arOldPct = this._oldBucketsPct(curr.arTotals);
      const arOldPctPrev = this._oldBucketsPct(prev.arTotals);
      // improving = more money in younger buckets => old pct falls
      const arDirection = (arOldPct < arOldPctPrev - 0.5) ? 'improving'
                        : (arOldPct > arOldPctPrev + 0.5) ? 'deteriorating'
                        : 'stable';
      const apOldPct = this._oldBucketsPct(curr.apTotals);
      const apOldPctPrev = this._oldBucketsPct(prev.apTotals);
      const apDirection = (apOldPct < apOldPctPrev - 0.5) ? 'improving'
                        : (apOldPct > apOldPctPrev + 0.5) ? 'deteriorating'
                        : 'stable';
      trends.push({
        from: prev.label,
        to:   curr.label,
        arDelta,
        apDelta,
        arOldPct,
        apOldPct,
        arDirection,
        apDirection,
      });
    }
    return { snapshots: snaps, trends };
  }

  _oldBucketsPct(totals) {
    // % of outstanding in buckets ≥ 61 days overdue
    if (!totals || totals.total === 0) return 0;
    let old = 0;
    for (const b of this.buckets) {
      if (b.min >= 61) {
        old += totals.buckets[b.label]?.total || 0;
      }
    }
    return Math.round((old / totals.total) * 10000) / 100;
  }

  /**
   * bucketMovement({ period }) — compare two snapshots (start vs end of period)
   * and return which items moved from one bucket to another.
   *
   * period = {from, to}
   */
  bucketMovement({ period } = {}) {
    const from = parseDate(period?.from) || addDays(new Date(), -30);
    const to   = parseDate(period?.to) || new Date();
    const start = this.arAging({ asOfDate: from });
    const end   = this.arAging({ asOfDate: to });
    const startMap = new Map(start.items.map(it => [it.id, it]));
    const endMap = new Map(end.items.map(it => [it.id, it]));

    const moved = [];
    const worsened = [];
    const improved = [];
    const newcomers = [];
    const cleared = [];

    for (const [id, endRow] of endMap.entries()) {
      const startRow = startMap.get(id);
      if (!startRow) {
        newcomers.push(endRow);
        continue;
      }
      if (startRow.bucket !== endRow.bucket) {
        const m = {
          id,
          customerId: endRow.customerId,
          fromBucket: startRow.bucket,
          toBucket:   endRow.bucket,
          amount:     endRow.outstanding,
        };
        moved.push(m);
        const fromIdx = this.buckets.findIndex(b => b.label === startRow.bucket);
        const toIdx = this.buckets.findIndex(b => b.label === endRow.bucket);
        if (toIdx > fromIdx) worsened.push(m);
        else if (toIdx < fromIdx) improved.push(m);
      }
    }
    for (const [id, startRow] of startMap.entries()) {
      if (!endMap.has(id)) cleared.push(startRow);
    }

    return {
      period: { from: isoDate(from), to: isoDate(to) },
      moved,
      worsened,
      improved,
      newcomers,
      cleared,
    };
  }

  /**
   * reminderGeneration({ customerId, bucket, language })
   *
   *   language: 'he' | 'en' | 'bi' (default 'bi' returns both)
   *   bucket:   label string (e.g. '61-90') — picks tone automatically
   *
   * Returns { tone, language, subject_he, subject_en, body_he, body_en }.
   *
   * Tones map to buckets as follows:
   *   0-30  -> polite
   *   31-60 -> polite
   *   61-90 -> firm
   *   91-120 -> firm
   *   120+  -> legal
   */
  reminderGeneration({ customerId, bucket, language } = {}) {
    const lang = language || 'bi';
    const cid = customerId != null ? String(customerId) : null;
    const customer = cid ? this.customers.get(cid) : null;
    const customerName = customer?.name || cid || '';
    const customerNameHe = customer?.nameHe || customerName;

    const tone = Aging.toneForBucket(bucket);

    // Collect outstanding items for this customer (for body detail)
    const ag = cid ? this.agingByCustomer(cid, null) : null;
    const outstanding = ag
      ? ag.items.filter(it => it.status === STATUS.OPEN || it.status === STATUS.PARTIAL || it.status === STATUS.DISPUTED)
      : [];
    const total = sum(outstanding, it => it.outstanding);

    const lines_he = [];
    const lines_en = [];
    let subject_he, subject_en;

    if (tone === REMINDER_TONES.POLITE) {
      subject_he = `תזכורת ידידותית — ${customerNameHe}`;
      subject_en = `Friendly reminder — ${customerName}`;
      lines_he.push(`שלום רב,`, ``, `ברצוננו להזכיר כי קיימות חשבוניות פתוחות בחשבונכם בסך כולל של ${fmtILS(total)}.`, `נודה לכם מאוד על הסדרת התשלום בהקדם האפשרי.`, ``);
      lines_en.push(`Dear ${customerName || 'Customer'},`, ``, `This is a friendly reminder that your account has outstanding invoices totaling ${fmtILS(total)}.`, `We would greatly appreciate settlement at your earliest convenience.`, ``);
    } else if (tone === REMINDER_TONES.FIRM) {
      subject_he = `דרישה לתשלום — ${customerNameHe}`;
      subject_en = `Payment demand — ${customerName}`;
      lines_he.push(`לכבוד ${customerNameHe},`, ``, `חשבונכם מצוי באיחור. יתרת החוב הפתוחה עומדת על ${fmtILS(total)}.`, `אנא הסדירו את מלוא התשלום תוך 7 ימים מתאריך קבלת מכתב זה.`, `במידה והתשלום בוצע, אנא התעלמו ממכתב זה.`, ``);
      lines_en.push(`To ${customerName || 'Customer'},`, ``, `Your account is past due. The total outstanding balance is ${fmtILS(total)}.`, `Please remit full payment within 7 days of receipt of this letter.`, `If payment has already been made, kindly disregard this notice.`, ``);
    } else { // LEGAL
      subject_he = `הודעה לפני נקיטת הליכים משפטיים — ${customerNameHe}`;
      subject_en = `Notice before legal proceedings — ${customerName}`;
      lines_he.push(`לכבוד ${customerNameHe},`, ``, `על אף פניותינו הקודמות, חשבונכם נותר בלתי משולם. יתרת החוב הנוכחית: ${fmtILS(total)}.`, `זוהי הודעה סופית לפני נקיטת הליכים משפטיים, לרבות פנייה להוצאה לפועל בהתאם לחוק ההוצאה לפועל, תשכ"ז-1967.`, `היה ולא יתקבל תשלום תוך 14 ימים, ננקוט בכל האמצעים העומדים לרשותנו על פי דין.`, ``);
      lines_en.push(`To ${customerName || 'Customer'},`, ``, `Despite our previous notices, your account remains unpaid. Current outstanding balance: ${fmtILS(total)}.`, `This is a final notice before legal action, including referral to the Israeli Execution Office pursuant to the Execution Law, 5727-1967.`, `If payment is not received within 14 days, we will pursue all legal remedies available to us.`, ``);
    }

    // Invoice table
    if (outstanding.length) {
      lines_he.push(`פירוט חשבוניות:`);
      lines_en.push(`Outstanding invoices:`);
      for (const it of outstanding) {
        lines_he.push(`  • חשבונית ${it.id} | פירעון ${it.dueDate || '-'} | פיגור ${Math.max(0, it.daysOverdue)} ימים | סכום ${fmtILS(it.outstanding)}`);
        lines_en.push(`  • Invoice ${it.id} | Due ${it.dueDate || '-'} | ${Math.max(0, it.daysOverdue)} days overdue | ${fmtILS(it.outstanding)}`);
      }
      lines_he.push(``);
      lines_en.push(``);
    }
    lines_he.push(`בכבוד רב,`);
    lines_en.push(`Sincerely,`);
    lines_he.push(`מחלקת גבייה`);
    lines_en.push(`Accounts Receivable Department`);

    const body_he = lines_he.join('\n');
    const body_en = lines_en.join('\n');

    const result = {
      customerId: cid,
      tone,
      bucket,
      language: lang,
      subject_he,
      subject_en,
      body_he,
      body_en,
      total,
      items: outstanding.length,
    };
    if (lang === 'he') { result.subject = subject_he; result.body = body_he; }
    else if (lang === 'en') { result.subject = subject_en; result.body = body_en; }
    else { // bilingual — HE first, EN second
      result.subject = `${subject_he}  /  ${subject_en}`;
      result.body = `${body_he}\n\n────────────────────────\n\n${body_en}`;
    }
    return result;
  }

  /** Classify bucket label → reminder tone. */
  static toneForBucket(bucket) {
    const label = String(bucket || '').trim();
    if (label === '0-30' || label === '31-60') return REMINDER_TONES.POLITE;
    if (label === '61-90' || label === '91-120') return REMINDER_TONES.FIRM;
    if (label === '120+') return REMINDER_TONES.LEGAL;
    // numeric fallback
    const n = parseInt(label, 10);
    if (!isNaN(n)) {
      if (n <= 60) return REMINDER_TONES.POLITE;
      if (n <= 120) return REMINDER_TONES.FIRM;
      return REMINDER_TONES.LEGAL;
    }
    return REMINDER_TONES.POLITE;
  }

  /**
   * generateARReport(period) — bilingual "PDF" report as SVG + text blob.
   *
   * Because this module is zero-deps, we don't emit binary PDF here; we
   * produce a structured object that a downstream PDF writer can consume.
   * The `svg` field holds the rendered chart. The `text` field holds
   * the bilingual report body ready for paper/email.
   */
  generateARReport(period) {
    const asOf = parseDate(period?.asOf) || new Date();
    const ar = this.arAging({ asOfDate: asOf });
    const concentration = this.concentrationAnalysis();
    const disputed = this.disputedItems(period);
    const labels = ar.buckets.map(b => b.label);
    const values = ar.buckets.map(b => ar.totals.buckets[b.label]?.total || 0);
    const svg = svgBarChart({
      title: 'AR Aging / יישון חייבים',
      labels,
      values,
      width: 640,
      height: 260,
    });

    const lines_he = [];
    const lines_en = [];
    lines_he.push(`דו"ח יישון חייבים`);
    lines_en.push(`Accounts Receivable Aging Report`);
    lines_he.push(`נכון ליום: ${ar.asOf}`);
    lines_en.push(`As of: ${ar.asOf}`);
    lines_he.push(`סה"כ חוב פתוח: ${fmtILS(ar.totals.total)}  (${ar.totals.count} פריטים)`);
    lines_en.push(`Total outstanding: ${fmtILS(ar.totals.total)}  (${ar.totals.count} items)`);
    lines_he.push(``);
    lines_en.push(``);
    lines_he.push(`פירוט לפי שכבה:`);
    lines_en.push(`Breakdown by bucket:`);
    for (const b of ar.buckets) {
      const s = ar.totals.buckets[b.label] || { count: 0, total: 0 };
      lines_he.push(`  ${b.he}: ${fmtILS(s.total)} (${s.count})`);
      lines_en.push(`  ${b.label}: ${fmtILS(s.total)} (${s.count})`);
    }
    lines_he.push(``);
    lines_en.push(``);
    lines_he.push(`ריכוזיות — 10 הלקוחות הגדולים:`);
    lines_en.push(`Concentration — Top 10 customers:`);
    for (const c of concentration.topCustomers) {
      lines_he.push(`  • ${c.name}: ${fmtILS(c.total)} (${c.pctOfAR}%)`);
      lines_en.push(`  • ${c.name}: ${fmtILS(c.total)} (${c.pctOfAR}%)`);
    }
    if (disputed.ar.length) {
      lines_he.push(``, `פריטים במחלוקת: ${disputed.ar.length}`);
      lines_en.push(``, `Items in dispute: ${disputed.ar.length}`);
    }

    return {
      asOf: ar.asOf,
      totals: ar.totals,
      buckets: ar.buckets,
      byCustomer: ar.byCustomer,
      svg,
      text_he: lines_he.join('\n'),
      text_en: lines_en.join('\n'),
      text: `${lines_he.join('\n')}\n\n────────────────────────\n\n${lines_en.join('\n')}`,
    };
  }

  /** Companion AP report. */
  generateAPReport(period) {
    const asOf = parseDate(period?.asOf) || new Date();
    const ap = this.apAging(asOf);
    const concentration = this.concentrationAnalysis();
    const disputed = this.disputedItems(period);
    const labels = ap.buckets.map(b => b.label);
    const values = ap.buckets.map(b => ap.totals.buckets[b.label]?.total || 0);
    const svg = svgBarChart({
      title: 'AP Aging / יישון זכאים',
      labels,
      values,
      width: 640,
      height: 260,
    });

    const lines_he = [];
    const lines_en = [];
    lines_he.push(`דו"ח יישון זכאים`);
    lines_en.push(`Accounts Payable Aging Report`);
    lines_he.push(`נכון ליום: ${ap.asOf}`);
    lines_en.push(`As of: ${ap.asOf}`);
    lines_he.push(`סה"כ חוב פתוח: ${fmtILS(ap.totals.total)}  (${ap.totals.count} פריטים)`);
    lines_en.push(`Total outstanding: ${fmtILS(ap.totals.total)}  (${ap.totals.count} items)`);
    lines_he.push(``);
    lines_en.push(``);
    lines_he.push(`פירוט לפי שכבה:`);
    lines_en.push(`Breakdown by bucket:`);
    for (const b of ap.buckets) {
      const s = ap.totals.buckets[b.label] || { count: 0, total: 0 };
      lines_he.push(`  ${b.he}: ${fmtILS(s.total)} (${s.count})`);
      lines_en.push(`  ${b.label}: ${fmtILS(s.total)} (${s.count})`);
    }
    lines_he.push(``);
    lines_en.push(``);
    lines_he.push(`ריכוזיות — 10 הספקים הגדולים:`);
    lines_en.push(`Concentration — Top 10 suppliers:`);
    for (const s of concentration.topSuppliers) {
      lines_he.push(`  • ${s.name}: ${fmtILS(s.total)} (${s.pctOfAP}%)`);
      lines_en.push(`  • ${s.name}: ${fmtILS(s.total)} (${s.pctOfAP}%)`);
    }
    if (disputed.ap.length) {
      lines_he.push(``, `פריטים במחלוקת: ${disputed.ap.length}`);
      lines_en.push(``, `Items in dispute: ${disputed.ap.length}`);
    }

    return {
      asOf: ap.asOf,
      totals: ap.totals,
      buckets: ap.buckets,
      bySupplier: ap.bySupplier,
      svg,
      text_he: lines_he.join('\n'),
      text_en: lines_en.join('\n'),
      text: `${lines_he.join('\n')}\n\n────────────────────────\n\n${lines_en.join('\n')}`,
    };
  }

  /**
   * customerStatement(customerId, period) — Hebrew statement of account.
   * Shows opening balance, every invoice issued in the period, every
   * payment applied, every dispute flagged, and closing balance.
   */
  customerStatement(customerId, period) {
    const cid = String(customerId);
    const customer = this.customers.get(cid) || { id: cid, name: cid };
    const from = parseDate(period?.from);
    const to   = parseDate(period?.to) || new Date();

    // Transactions touching this customer
    const transactions = [];
    for (const inv of this.arInvoices.values()) {
      if (inv.customerId !== cid) continue;
      const iDate = parseDate(inv.issueDate);
      if (from && iDate && iDate < from) continue;
      if (to && iDate && iDate > to) continue;
      transactions.push({
        date:   inv.issueDate,
        type:   'invoice',
        typeHe: 'חשבונית',
        ref:    inv.id,
        debit:  inv.amount,
        credit: 0,
        note:   inv.notes || '',
      });
    }
    for (const p of this.payments) {
      if (p.type !== 'AR') continue;
      const inv = this.arInvoices.get(p.invoiceId);
      if (!inv || inv.customerId !== cid) continue;
      const pDate = parseDate(p.date);
      if (from && pDate && pDate < from) continue;
      if (to && pDate && pDate > to) continue;
      transactions.push({
        date:   p.date,
        type:   'payment',
        typeHe: 'תשלום',
        ref:    p.reference || p.invoiceId,
        debit:  0,
        credit: p.amount,
        note:   `שויך לחשבונית ${inv.id}`,
      });
    }
    for (const w of this.writeOffsLog) {
      if (w.type !== 'AR') continue;
      const inv = this.arInvoices.get(w.invoiceId);
      if (!inv || inv.customerId !== cid) continue;
      const wDate = parseDate(w.date);
      if (from && wDate && wDate < from) continue;
      if (to && wDate && wDate > to) continue;
      transactions.push({
        date:   w.date,
        type:   'write_off',
        typeHe: 'מחיקת חוב',
        ref:    w.invoiceId,
        debit:  0,
        credit: w.amount,
        note:   w.reason || '',
      });
    }

    transactions.sort((a, b) => {
      const ax = parseDate(a.date)?.getTime() || 0;
      const bx = parseDate(b.date)?.getTime() || 0;
      return ax - bx;
    });

    // Opening balance: sum of all AR invoices before `from`, minus payments before `from`
    let opening = 0;
    if (from) {
      for (const inv of this.arInvoices.values()) {
        if (inv.customerId !== cid) continue;
        const d = parseDate(inv.issueDate);
        if (d && d < from) opening += inv.amount;
      }
      for (const p of this.payments) {
        if (p.type !== 'AR') continue;
        const inv = this.arInvoices.get(p.invoiceId);
        if (!inv || inv.customerId !== cid) continue;
        const d = parseDate(p.date);
        if (d && d < from) opening -= p.amount;
      }
    }

    let running = opening;
    const rows = [];
    for (const t of transactions) {
      running += (t.debit || 0) - (t.credit || 0);
      rows.push({ ...t, balance: Math.round(running * 100) / 100 });
    }
    const closing = Math.round(running * 100) / 100;

    // Render bilingual text (Hebrew-first because this is the primary product)
    const lines = [];
    lines.push(`דו"ח חשבון לקוח / Statement of Account`);
    lines.push(`לקוח: ${customer.name} (${customer.id})`);
    lines.push(`תקופה: ${from ? isoDate(from) : 'מתחילה'} עד ${isoDate(to)}`);
    lines.push(``);
    lines.push(`יתרת פתיחה / Opening balance: ${fmtILS(opening)}`);
    lines.push(``);
    lines.push(`תאריך      | סוג        | אסמכתה   | חובה        | זכות        | יתרה`);
    lines.push(`------------|-----------|----------|-------------|-------------|-------------`);
    for (const r of rows) {
      lines.push(
        `${(r.date || '').slice(0, 10).padEnd(11)}| ` +
        `${r.typeHe.padEnd(10)}| ` +
        `${String(r.ref || '').padEnd(9)}| ` +
        `${r.debit ? fmtILS(r.debit).padEnd(12) : ''.padEnd(12)}| ` +
        `${r.credit ? fmtILS(r.credit).padEnd(12) : ''.padEnd(12)}| ` +
        `${fmtILS(r.balance)}`
      );
    }
    lines.push(``);
    lines.push(`יתרת סגירה / Closing balance: ${fmtILS(closing)}`);

    return {
      customer,
      period: { from: from ? isoDate(from) : null, to: isoDate(to) },
      opening,
      closing,
      rows,
      text: lines.join('\n'),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────

module.exports = {
  Aging,
  DEFAULT_BUCKETS,
  REMINDER_TONES,
  STATUS,
  HEBREW_GLOSSARY,
  daysBetween,
  addDays,
  isoDate,
  parseDate,
  bucketFor,
  fmtILS,
  svgBarChart,
};
