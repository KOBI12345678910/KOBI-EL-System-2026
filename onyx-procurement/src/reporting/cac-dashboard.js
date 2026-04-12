/**
 * CAC Dashboard — Customer Acquisition Cost analytics module
 * לוח מחוונים לעלות רכישת לקוח
 *
 * Agent: Y-194
 * Project: Techno-Kol Uzi mega-ERP (onyx-procurement)
 * Date: 2026-04-11
 *
 * PURPOSE
 * -------
 * Compute Customer Acquisition Cost (CAC) metrics across the company's
 * marketing and sales activity. The class is framework-agnostic and runs
 * purely on the Node built-ins (`assert` / `node:test` style) — no
 * third-party dependencies, no database driver baked in, no HTTP client.
 * Data is injected by the caller (Supabase, CSV, fixture, whatever).
 *
 * FORMULAS
 * --------
 *   Blended CAC     = (paid spend + organic investment) / customers acquired
 *                     עלות רכישה משולבת
 *   Paid CAC        = paid spend / customers from paid channels
 *                     עלות רכישה בתשלום
 *   Organic CAC     = organic investment / customers from organic channels
 *                     עלות רכישה אורגנית
 *   Channel CAC     = spend in channel / customers from channel
 *                     עלות רכישה לפי ערוץ
 *   Segment CAC     = spend attributed to segment / customers in segment
 *                     עלות רכישה לפי מגזר
 *   Payback period  = CAC / (avg gross profit per customer per month)
 *                     תקופת החזר
 *
 * BILINGUALITY
 * ------------
 * Every public return value carries both `he` (Hebrew) and `en` (English)
 * labels so the consuming UI can render right-to-left or left-to-right
 * without re-translation. Numeric values are rounded to 2 decimals via
 * the shared `r2()` helper. Currency is assumed to be ILS unless the
 * caller specifies otherwise via `options.currency`.
 *
 * CONVENTIONS
 * -----------
 * - "never delete": this file is additive; it does not touch existing
 *   reports or the database.
 * - "Node built-ins only": the file imports nothing.
 * - "bilingual": every label, every error message, every summary key.
 *
 * USAGE
 * -----
 *     const { CACDashboard } = require('./cac-dashboard.js');
 *     const dash = new CACDashboard({
 *       customers:   [...],   // { id, acquiredAt, channel, segment, monthlyGrossProfit }
 *       marketing:   [...],   // { date, channel, segment, lineItem, amount, type: 'paid'|'organic' }
 *     });
 *     const blended = dash.blendedCAC({ start: '2026-01-01', end: '2026-03-31' });
 *     const byChan  = dash.byChannel({ start: '2026-01-01', end: '2026-03-31' });
 *     const payback = dash.paybackPeriod({ start: '2026-01-01', end: '2026-03-31' });
 *
 * All methods are pure: given the same inputs they return the same output.
 * No hidden state, no I/O, no global singletons.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// NUMERIC HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** Round to 2 decimals — avoids binary float drift on currency math. */
function r2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

/** Round to 4 decimals — used for ratios / payback months. */
function r4(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 10000) / 10000;
}

/** Safe sum of numeric values. Non-numeric entries treated as 0. */
function sum(values) {
  if (!Array.isArray(values)) return 0;
  let total = 0;
  for (let i = 0; i < values.length; i += 1) {
    const v = Number(values[i]);
    if (Number.isFinite(v)) total += v;
  }
  return r2(total);
}

/** Safe divide. Returns null when the denominator is zero / non-finite. */
function safeDiv(numerator, denominator) {
  const a = Number(numerator);
  const b = Number(denominator);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return a / b;
}

/** Normalize a date-like value to a YYYY-MM-DD string (UTC). */
function toISODate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Count complete months between two ISO dates inclusive, floor 1. */
function monthsInPeriod(startISO, endISO) {
  if (!startISO || !endISO) return 1;
  const s = new Date(startISO);
  const e = new Date(endISO);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 1;
  const months =
    (e.getUTCFullYear() - s.getUTCFullYear()) * 12 +
    (e.getUTCMonth() - s.getUTCMonth()) +
    1;
  return months > 0 ? months : 1;
}

/** Month key YYYY-MM for trend bucketing. */
function monthKey(iso) {
  const s = toISODate(iso);
  if (!s) return null;
  return s.slice(0, 7);
}

// ═══════════════════════════════════════════════════════════════════════════
// BILINGUAL LABEL DICTIONARY
// ═══════════════════════════════════════════════════════════════════════════

const LABELS = {
  blendedCAC: { he: 'עלות רכישת לקוח משולבת', en: 'Blended CAC' },
  paidCAC: { he: 'עלות רכישת לקוח בתשלום', en: 'Paid CAC' },
  organicCAC: { he: 'עלות רכישת לקוח אורגנית', en: 'Organic CAC' },
  byChannel: { he: 'לפי ערוץ', en: 'By Channel' },
  bySegment: { he: 'לפי מגזר', en: 'By Segment' },
  paybackPeriod: { he: 'תקופת החזר (חודשים)', en: 'Payback Period (months)' },
  trend: { he: 'מגמה חודשית', en: 'Monthly Trend' },
  byLineItem: { he: 'לפי סעיף שיווק', en: 'By Marketing Line Item' },
  customersAcquired: { he: 'לקוחות שנרכשו', en: 'Customers Acquired' },
  totalSpend: { he: 'סך הוצאה שיווקית', en: 'Total Marketing Spend' },
  paidSpend: { he: 'הוצאה בתשלום', en: 'Paid Spend' },
  organicSpend: { he: 'השקעה אורגנית', en: 'Organic Investment' },
  grossProfitPerMonth: {
    he: 'רווח גולמי ממוצע לחודש',
    en: 'Avg Gross Profit per Customer per Month',
  },
  period: { he: 'תקופה', en: 'Period' },
  channel: { he: 'ערוץ', en: 'Channel' },
  segment: { he: 'מגזר', en: 'Segment' },
  lineItem: { he: 'סעיף', en: 'Line Item' },
  month: { he: 'חודש', en: 'Month' },
  value: { he: 'ערך', en: 'Value' },
  count: { he: 'כמות', en: 'Count' },
  unknown: { he: 'לא ידוע', en: 'Unknown' },
  noCustomers: { he: 'אין לקוחות שנרכשו', en: 'No customers acquired' },
  noData: { he: 'אין נתונים', en: 'No data' },
  infinite: { he: 'בלתי מוגדר', en: 'Undefined' },
};

/** Bilingual helper: returns `{ he, en }` or defaults. */
function label(key) {
  return LABELS[key] || { he: key, en: key };
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT CHANNEL TAXONOMY
// ═══════════════════════════════════════════════════════════════════════════

/** Default paid channels — anything else is treated as organic. */
const DEFAULT_PAID_CHANNELS = new Set([
  'google_ads',
  'facebook_ads',
  'instagram_ads',
  'linkedin_ads',
  'tiktok_ads',
  'youtube_ads',
  'taboola',
  'outbrain',
  'affiliates',
  'display',
  'programmatic',
  'sponsored',
  'paid_search',
  'paid_social',
]);

const DEFAULT_ORGANIC_CHANNELS = new Set([
  'seo',
  'organic_search',
  'organic_social',
  'direct',
  'referral',
  'email',
  'newsletter',
  'blog',
  'community',
  'word_of_mouth',
  'wom',
]);

/** Marketing line items typical of an Israeli mega-ERP marketing budget. */
const DEFAULT_LINE_ITEMS = {
  google_ads: { he: 'קמפיין גוגל אדס', en: 'Google Ads campaign' },
  facebook_ads: { he: 'קמפיין פייסבוק', en: 'Facebook campaign' },
  seo: { he: 'קידום אורגני (SEO)', en: 'SEO retainer' },
  content: { he: 'הפקת תוכן', en: 'Content production' },
  events: { he: 'אירועים ותערוכות', en: 'Events & trade shows' },
  pr: { he: 'יחסי ציבור', en: 'PR' },
  influencer: { he: 'משפיענים', en: 'Influencer marketing' },
  email_tooling: { he: 'כלי דיוור', en: 'Email tooling' },
  crm_tooling: { he: 'כלי CRM', en: 'CRM tooling' },
  salaries_marketing: {
    he: 'שכר צוות שיווק',
    en: 'Marketing team salaries',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// PERIOD RESOLVER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Accept either:
 *   - { start: '2026-01-01', end: '2026-03-31' }
 *   - { year: 2026, month: 4 }
 *   - { year: 2026, quarter: 2 }
 *   - { year: 2026 }
 *   - { ytd: true }  (year-to-date, anchored to `today`)
 *   - undefined → last 12 months ending today
 */
function resolvePeriod(period, today) {
  const anchor = today instanceof Date ? today : new Date();
  // Use today-as-given so tests can be deterministic.
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth(); // 0-indexed

  if (!period) {
    const end = new Date(Date.UTC(y, m + 1, 0));
    const start = new Date(Date.UTC(y - 1, m + 1, 1));
    return { start: toISODate(start), end: toISODate(end) };
  }

  if (period.start && period.end) {
    return {
      start: toISODate(period.start),
      end: toISODate(period.end),
    };
  }

  if (period.ytd) {
    return {
      start: toISODate(new Date(Date.UTC(y, 0, 1))),
      end: toISODate(anchor),
    };
  }

  if (period.year && period.month) {
    const mm = Number(period.month);
    const start = new Date(Date.UTC(period.year, mm - 1, 1));
    const end = new Date(Date.UTC(period.year, mm, 0));
    return { start: toISODate(start), end: toISODate(end) };
  }

  if (period.year && period.quarter) {
    const q = Number(period.quarter);
    const startMonth = (q - 1) * 3;
    const start = new Date(Date.UTC(period.year, startMonth, 1));
    const end = new Date(Date.UTC(period.year, startMonth + 3, 0));
    return { start: toISODate(start), end: toISODate(end) };
  }

  if (period.year) {
    const start = new Date(Date.UTC(period.year, 0, 1));
    const end = new Date(Date.UTC(period.year, 11, 31));
    return { start: toISODate(start), end: toISODate(end) };
  }

  // Fallback: single-day period on `today`.
  return { start: toISODate(anchor), end: toISODate(anchor) };
}

function withinPeriod(iso, start, end) {
  const s = toISODate(iso);
  if (!s) return false;
  return s >= start && s <= end;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLASSIFIER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Decide whether a channel is paid or organic.
 * - If the marketing row carries `type: 'paid' | 'organic'`, honor it.
 * - Otherwise consult the default sets.
 * - Unknown channels default to `organic` (conservative — don't over-credit
 *   paid spend; it inflates paid CAC which is the safer direction).
 */
function classifyChannel(row, paidSet, organicSet) {
  if (row && (row.type === 'paid' || row.type === 'organic')) return row.type;
  const ch = row && row.channel ? String(row.channel).toLowerCase() : '';
  if (paidSet.has(ch)) return 'paid';
  if (organicSet.has(ch)) return 'organic';
  return 'organic';
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CACDashboard — injectable analytics over customers & marketing rows.
 *
 * Constructor options:
 *   customers:  Array<{
 *     id:                 string,
 *     acquiredAt:         string | Date,   // acquisition date
 *     channel:            string,          // attribution channel
 *     segment:            string,          // SMB / enterprise / etc.
 *     monthlyGrossProfit: number,          // ILS per month
 *   }>
 *   marketing:  Array<{
 *     date:      string | Date,
 *     channel:   string,
 *     segment:   string,                   // optional
 *     lineItem:  string,                   // optional
 *     amount:    number,                   // ILS
 *     type:      'paid' | 'organic',       // optional override
 *   }>
 *   options:    { paidChannels?, organicChannels?, currency?, today? }
 */
class CACDashboard {
  constructor({ customers = [], marketing = [], options = {} } = {}) {
    if (!Array.isArray(customers)) {
      throw new TypeError(
        '[CACDashboard] customers must be an array / customers חייב להיות מערך',
      );
    }
    if (!Array.isArray(marketing)) {
      throw new TypeError(
        '[CACDashboard] marketing must be an array / marketing חייב להיות מערך',
      );
    }

    this.customers = customers;
    this.marketing = marketing;
    this.currency = options.currency || 'ILS';
    this.today = options.today || null;

    // Allow callers to extend or replace the default taxonomies.
    this.paidChannels = new Set(
      (options.paidChannels || Array.from(DEFAULT_PAID_CHANNELS)).map(
        (c) => String(c).toLowerCase(),
      ),
    );
    this.organicChannels = new Set(
      (options.organicChannels || Array.from(DEFAULT_ORGANIC_CHANNELS)).map(
        (c) => String(c).toLowerCase(),
      ),
    );
  }

  // ─── internal helpers ────────────────────────────────────────────────────

  _filterCustomers(period) {
    const { start, end } = resolvePeriod(period, this.today);
    return this.customers.filter((c) => withinPeriod(c.acquiredAt, start, end));
  }

  _filterMarketing(period) {
    const { start, end } = resolvePeriod(period, this.today);
    return this.marketing.filter((m) => withinPeriod(m.date, start, end));
  }

  /** Resolve + return the canonical period so callers can echo it back. */
  _period(period) {
    return resolvePeriod(period, this.today);
  }

  _classify(row) {
    return classifyChannel(row, this.paidChannels, this.organicChannels);
  }

  // ─── 1. blendedCAC ───────────────────────────────────────────────────────

  /**
   * Blended CAC = total marketing spend / total customers in period.
   * עלות רכישת לקוח משולבת.
   */
  blendedCAC(period) {
    const p = this._period(period);
    const customers = this._filterCustomers(period);
    const marketing = this._filterMarketing(period);

    const totalSpend = sum(marketing.map((m) => m.amount));
    const paidSpend = sum(
      marketing.filter((m) => this._classify(m) === 'paid').map((m) => m.amount),
    );
    const organicSpend = r2(totalSpend - paidSpend);
    const count = customers.length;

    const cacRaw = safeDiv(totalSpend, count);
    return {
      label: label('blendedCAC'),
      period: p,
      currency: this.currency,
      customersAcquired: count,
      totalSpend,
      paidSpend,
      organicSpend,
      cac: cacRaw === null ? null : r2(cacRaw),
      note:
        count === 0
          ? label('noCustomers')
          : { he: 'חושב בהצלחה', en: 'Computed' },
    };
  }

  // ─── 2. paidCAC ──────────────────────────────────────────────────────────

  paidCAC(period) {
    const p = this._period(period);
    const customers = this._filterCustomers(period);
    const marketing = this._filterMarketing(period);

    const paidRows = marketing.filter((m) => this._classify(m) === 'paid');
    const paidCustomers = customers.filter(
      (c) => !this.organicChannels.has(String(c.channel || '').toLowerCase()),
    );

    const paidSpend = sum(paidRows.map((m) => m.amount));
    const count = paidCustomers.length;
    const cacRaw = safeDiv(paidSpend, count);

    return {
      label: label('paidCAC'),
      period: p,
      currency: this.currency,
      customersAcquired: count,
      paidSpend,
      cac: cacRaw === null ? null : r2(cacRaw),
    };
  }

  // ─── 3. organicCAC ───────────────────────────────────────────────────────

  organicCAC(period) {
    const p = this._period(period);
    const customers = this._filterCustomers(period);
    const marketing = this._filterMarketing(period);

    const organicRows = marketing.filter(
      (m) => this._classify(m) === 'organic',
    );
    const organicCustomers = customers.filter((c) =>
      this.organicChannels.has(String(c.channel || '').toLowerCase()),
    );

    const organicSpend = sum(organicRows.map((m) => m.amount));
    const count = organicCustomers.length;
    const cacRaw = safeDiv(organicSpend, count);

    return {
      label: label('organicCAC'),
      period: p,
      currency: this.currency,
      customersAcquired: count,
      organicSpend,
      cac: cacRaw === null ? null : r2(cacRaw),
    };
  }

  // ─── 4. byChannel ────────────────────────────────────────────────────────

  /**
   * Channel-level breakdown.
   * Returns `{ label, period, rows: [{channel, type, spend, customers, cac}]}`
   * sorted by descending spend. Channel == 'unknown' catches anything without
   * an attribution.
   */
  byChannel(period) {
    const p = this._period(period);
    const customers = this._filterCustomers(period);
    const marketing = this._filterMarketing(period);

    const byChan = new Map();
    const ensure = (ch) => {
      const key = ch || 'unknown';
      if (!byChan.has(key)) {
        byChan.set(key, {
          channel: key,
          type: this.paidChannels.has(key)
            ? 'paid'
            : this.organicChannels.has(key)
              ? 'organic'
              : 'organic',
          spend: 0,
          customers: 0,
        });
      }
      return byChan.get(key);
    };

    for (const m of marketing) {
      const key = String(m.channel || 'unknown').toLowerCase();
      const row = ensure(key);
      row.spend = r2(row.spend + (Number(m.amount) || 0));
      if (row.type !== this._classify(m)) {
        row.type = this._classify(m);
      }
    }

    for (const c of customers) {
      const key = String(c.channel || 'unknown').toLowerCase();
      const row = ensure(key);
      row.customers += 1;
    }

    const rows = Array.from(byChan.values())
      .map((r) => {
        const cacRaw = safeDiv(r.spend, r.customers);
        return {
          ...r,
          cac: cacRaw === null ? null : r2(cacRaw),
          labelHe:
            r.channel === 'unknown' ? LABELS.unknown.he : r.channel,
          labelEn:
            r.channel === 'unknown' ? LABELS.unknown.en : r.channel,
        };
      })
      .sort((a, b) => b.spend - a.spend);

    return {
      label: label('byChannel'),
      period: p,
      currency: this.currency,
      rows,
    };
  }

  // ─── 5. bySegment ────────────────────────────────────────────────────────

  /**
   * Segment-level breakdown. Segments are free-form strings supplied by the
   * caller (e.g. `smb`, `mid_market`, `enterprise`, `israeli_gov`).
   * Marketing rows without an explicit segment are distributed proportionally
   * across segments using the customer-count distribution in the period.
   */
  bySegment(period) {
    const p = this._period(period);
    const customers = this._filterCustomers(period);
    const marketing = this._filterMarketing(period);

    // First pass: tally customers per segment (used for allocation).
    const segCounts = new Map();
    for (const c of customers) {
      const s = String(c.segment || 'unknown').toLowerCase();
      segCounts.set(s, (segCounts.get(s) || 0) + 1);
    }
    const totalCustomers = customers.length;

    // Second pass: explicit-segment spend goes directly; unsegmented spend
    // is allocated proportionally to customer counts.
    const directSpend = new Map();
    let unallocated = 0;
    for (const m of marketing) {
      const amt = Number(m.amount) || 0;
      if (m.segment) {
        const s = String(m.segment).toLowerCase();
        directSpend.set(s, r2((directSpend.get(s) || 0) + amt));
      } else {
        unallocated += amt;
      }
    }

    // Build the final row set combining direct + allocated.
    const segments = new Set([
      ...segCounts.keys(),
      ...directSpend.keys(),
    ]);
    const rows = Array.from(segments).map((s) => {
      const direct = directSpend.get(s) || 0;
      const share =
        totalCustomers > 0 ? (segCounts.get(s) || 0) / totalCustomers : 0;
      const allocated = r2(unallocated * share);
      const spend = r2(direct + allocated);
      const count = segCounts.get(s) || 0;
      const cacRaw = safeDiv(spend, count);
      return {
        segment: s,
        customers: count,
        spend,
        cac: cacRaw === null ? null : r2(cacRaw),
      };
    });

    rows.sort((a, b) => b.spend - a.spend);

    return {
      label: label('bySegment'),
      period: p,
      currency: this.currency,
      unallocatedSpend: r2(unallocated),
      rows,
    };
  }

  // ─── 6. paybackPeriod ────────────────────────────────────────────────────

  /**
   * Payback period (months) = CAC / (avg gross profit per customer per month).
   * תקופת ההחזר בחודשים.
   *
   * Returns:
   *   - blended payback
   *   - per-channel payback
   *   - per-segment payback
   */
  paybackPeriod(period) {
    const p = this._period(period);
    const customers = this._filterCustomers(period);
    const blended = this.blendedCAC(period);

    const grossProfits = customers
      .map((c) => Number(c.monthlyGrossProfit) || 0)
      .filter((v) => Number.isFinite(v));
    const avgGP =
      grossProfits.length === 0
        ? 0
        : r2(grossProfits.reduce((a, b) => a + b, 0) / grossProfits.length);

    const blendedPayback =
      blended.cac === null || avgGP === 0
        ? null
        : r4(blended.cac / avgGP);

    // Per channel
    const byCh = this.byChannel(period);
    const byChanRows = byCh.rows.map((r) => {
      const chanCustomers = customers.filter(
        (c) => String(c.channel || 'unknown').toLowerCase() === r.channel,
      );
      const gp = chanCustomers.length
        ? chanCustomers.reduce(
            (acc, c) => acc + (Number(c.monthlyGrossProfit) || 0),
            0,
          ) / chanCustomers.length
        : 0;
      const paybackRaw =
        r.cac === null || gp === 0 ? null : r.cac / gp;
      return {
        channel: r.channel,
        cac: r.cac,
        avgMonthlyGrossProfit: r2(gp),
        paybackMonths: paybackRaw === null ? null : r4(paybackRaw),
      };
    });

    // Per segment
    const bySeg = this.bySegment(period);
    const bySegRows = bySeg.rows.map((r) => {
      const segCustomers = customers.filter(
        (c) => String(c.segment || 'unknown').toLowerCase() === r.segment,
      );
      const gp = segCustomers.length
        ? segCustomers.reduce(
            (acc, c) => acc + (Number(c.monthlyGrossProfit) || 0),
            0,
          ) / segCustomers.length
        : 0;
      const paybackRaw =
        r.cac === null || gp === 0 ? null : r.cac / gp;
      return {
        segment: r.segment,
        cac: r.cac,
        avgMonthlyGrossProfit: r2(gp),
        paybackMonths: paybackRaw === null ? null : r4(paybackRaw),
      };
    });

    return {
      label: label('paybackPeriod'),
      period: p,
      currency: this.currency,
      blended: {
        cac: blended.cac,
        avgMonthlyGrossProfit: avgGP,
        paybackMonths: blendedPayback,
      },
      byChannel: byChanRows,
      bySegment: bySegRows,
    };
  }

  // ─── 7. trend (monthly) ──────────────────────────────────────────────────

  /**
   * Month-by-month trend of blended CAC inside the period.
   * Rows: { month: 'YYYY-MM', spend, customers, cac }.
   */
  trend(period) {
    const p = this._period(period);
    const customers = this._filterCustomers(period);
    const marketing = this._filterMarketing(period);

    const months = new Map();
    const ensure = (k) => {
      if (!months.has(k)) {
        months.set(k, { month: k, spend: 0, customers: 0 });
      }
      return months.get(k);
    };

    // Pre-populate the month buckets so zero-activity months still appear.
    const startD = new Date(p.start);
    const endD = new Date(p.end);
    let cur = new Date(Date.UTC(startD.getUTCFullYear(), startD.getUTCMonth(), 1));
    while (cur <= endD) {
      ensure(cur.toISOString().slice(0, 7));
      cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    }

    for (const m of marketing) {
      const k = monthKey(m.date);
      if (!k) continue;
      const row = ensure(k);
      row.spend = r2(row.spend + (Number(m.amount) || 0));
    }

    for (const c of customers) {
      const k = monthKey(c.acquiredAt);
      if (!k) continue;
      const row = ensure(k);
      row.customers += 1;
    }

    const rows = Array.from(months.values())
      .map((r) => {
        const cacRaw = safeDiv(r.spend, r.customers);
        return {
          ...r,
          cac: cacRaw === null ? null : r2(cacRaw),
        };
      })
      .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));

    return {
      label: label('trend'),
      period: p,
      currency: this.currency,
      rows,
    };
  }

  // ─── 8. byLineItem ───────────────────────────────────────────────────────

  /**
   * Breakdown by marketing-spend line item (e.g. google_ads, events, content).
   * Customers are proportionally attributed to line items via the line item's
   * share of total spend — a common CFO-grade approximation when per-touchpoint
   * attribution isn't available.
   */
  byLineItem(period) {
    const p = this._period(period);
    const customers = this._filterCustomers(period);
    const marketing = this._filterMarketing(period);

    const totalSpend = sum(marketing.map((m) => m.amount));
    const totalCustomers = customers.length;

    const itemSpend = new Map();
    for (const m of marketing) {
      const key = String(m.lineItem || m.channel || 'unknown').toLowerCase();
      itemSpend.set(
        key,
        r2((itemSpend.get(key) || 0) + (Number(m.amount) || 0)),
      );
    }

    const rows = Array.from(itemSpend.entries())
      .map(([lineItem, spend]) => {
        const share = totalSpend > 0 ? spend / totalSpend : 0;
        const attributedCustomers = r2(totalCustomers * share);
        const cacRaw = safeDiv(spend, attributedCustomers);
        return {
          lineItem,
          labelHe: (DEFAULT_LINE_ITEMS[lineItem] || { he: lineItem }).he,
          labelEn: (DEFAULT_LINE_ITEMS[lineItem] || { en: lineItem }).en,
          spend,
          share: r4(share),
          attributedCustomers,
          cac: cacRaw === null ? null : r2(cacRaw),
        };
      })
      .sort((a, b) => b.spend - a.spend);

    return {
      label: label('byLineItem'),
      period: p,
      currency: this.currency,
      totalSpend,
      totalCustomers,
      rows,
    };
  }

  // ─── 9. summary (everything at once) ─────────────────────────────────────

  /**
   * One-shot summary — useful for the dashboard API endpoint. Returns every
   * metric in a single object keyed by bilingual labels.
   */
  summary(period) {
    const p = this._period(period);
    const months = monthsInPeriod(p.start, p.end);
    return {
      period: p,
      months,
      currency: this.currency,
      blended: this.blendedCAC(period),
      paid: this.paidCAC(period),
      organic: this.organicCAC(period),
      byChannel: this.byChannel(period),
      bySegment: this.bySegment(period),
      byLineItem: this.byLineItem(period),
      trend: this.trend(period),
      payback: this.paybackPeriod(period),
      labels: LABELS,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  CACDashboard,
  // helpers — exported for unit tests and external reuse
  r2,
  r4,
  sum,
  safeDiv,
  toISODate,
  monthsInPeriod,
  monthKey,
  resolvePeriod,
  classifyChannel,
  LABELS,
  DEFAULT_PAID_CHANNELS,
  DEFAULT_ORGANIC_CHANNELS,
  DEFAULT_LINE_ITEMS,
};
