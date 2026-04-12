/**
 * Cohort Analysis — ניתוח קוהורט לקוחות
 * Agent Y-190 — Techno-Kol Uzi ERP / onyx-procurement
 * Date: 2026-04-11
 *
 * Zero-dependency pure-JavaScript engine that turns a flat customer+orders
 * feed into a classic cohort analysis: retention curves, revenue curves,
 * order-count curves, heatmap data, cumulative vs period retention, and
 * average revenue per cohort. The output is shaped for the BI dashboard's
 * heatmap component (rows = acquisition cohort, columns = months since
 * acquisition) and carries bilingual (Hebrew / English) headers so the UI
 * can render it in either direction without re-keying the data.
 *
 * ─── House rule — לא מוחקים רק משדרגים ומגדלים ─────────────────────────────
 * The engine NEVER mutates its inputs and NEVER removes historical cohorts.
 * `buildCohort` always returns a fresh, deep-frozen result object; previous
 * builds are not touched. There is no `deleteCohort` method and there will
 * not be one.
 *
 * ─── Inputs ────────────────────────────────────────────────────────────────
 * `customers` is an array of plain objects. Each customer must carry:
 *   {
 *     id:               string | number,           // stable customer id
 *     acquiredAt:       string | Date,             // first-purchase date
 *     orders: [
 *       { date: string | Date, revenue: number, id?: string | number },
 *       ...
 *     ],
 *   }
 * `acquiredAt` may be omitted if the customer has at least one order — in
 * that case the earliest order date is used as the acquisition date. This
 * is the "first-touch" convention used by virtually every cohort engine.
 *
 * ─── Metrics ───────────────────────────────────────────────────────────────
 *   'retention' — % of the cohort that placed ≥1 order in the period.
 *   'revenue'   — total revenue (ILS) booked by the cohort in the period.
 *   'orders'    — count of orders the cohort placed in the period.
 *
 * Call `buildCohort(customers, { metric: 'retention' })` etc. to get the
 * full heatmap payload. The payload is the same shape across metrics so
 * the same renderer in the dashboard can draw all three without branching.
 *
 * ─── Month boundaries ─────────────────────────────────────────────────────
 * Israeli ERPs run on the Gregorian calendar for business reporting, so the
 * bucket key is `YYYY-MM` (UTC). Hebrew month *labels* are additionally
 * supplied as a pre-computed bilingual array — the UI can pick either the
 * Gregorian key for sorting or the Hebrew label for display. We never mix
 * the two on the same axis.
 *
 * ─── Zero dependencies ────────────────────────────────────────────────────
 * Node built-ins only. No `require()` of third-party packages, no network
 * I/O, no randomness, no timezone surprises. Identical inputs always
 * produce the identical heatmap so tests are reproducible and audits are
 * a diff.
 */

'use strict';

// ─── constants ────────────────────────────────────────────────────────────

/** Supported metrics. Exported so the caller can validate against them. */
const COHORT_METRICS = Object.freeze(['retention', 'revenue', 'orders']);

/** Hebrew month names — index 0 = January, matches `Date#getUTCMonth()`. */
const HEBREW_MONTHS = Object.freeze([
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
]);

/** English month names — aligned to `HEBREW_MONTHS`. */
const ENGLISH_MONTHS = Object.freeze([
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]);

/** Bilingual header strings used on the heatmap payload. */
const HEADERS = Object.freeze({
  retention: Object.freeze({ he: 'שימור (%)', en: 'Retention (%)' }),
  revenue: Object.freeze({ he: 'הכנסות (₪)', en: 'Revenue (ILS)' }),
  orders: Object.freeze({ he: 'הזמנות', en: 'Orders' }),
  cohort: Object.freeze({ he: 'קוהורט רכישה', en: 'Acquisition Cohort' }),
  monthsSince: Object.freeze({ he: 'חודשים מאז רכישה', en: 'Months Since Acquisition' }),
  size: Object.freeze({ he: 'גודל קוהורט', en: 'Cohort Size' }),
  avgRevenue: Object.freeze({ he: 'ממוצע הכנסות ללקוח (₪)', en: 'Avg Revenue per Customer (ILS)' }),
  cumulative: Object.freeze({ he: 'שימור מצטבר', en: 'Cumulative Retention' }),
  period: Object.freeze({ he: 'שימור לתקופה', en: 'Period Retention' }),
});

/** Bilingual glossary — exposed for the UI to bind to the same strings. */
const GLOSSARY = Object.freeze({
  cohort: Object.freeze({ he: 'קוהורט', en: 'Cohort' }),
  acquisition: Object.freeze({ he: 'רכישת לקוח', en: 'Acquisition' }),
  retention: Object.freeze({ he: 'שימור', en: 'Retention' }),
  revenue: Object.freeze({ he: 'הכנסות', en: 'Revenue' }),
  orders: Object.freeze({ he: 'הזמנות', en: 'Orders' }),
  period: Object.freeze({ he: 'תקופה', en: 'Period' }),
  cumulative: Object.freeze({ he: 'מצטבר', en: 'Cumulative' }),
  heatmap: Object.freeze({ he: 'מפת חום', en: 'Heatmap' }),
  monthsSince: Object.freeze({ he: 'חודשים מאז רכישה', en: 'Months Since Acquisition' }),
});

// ─── helpers ──────────────────────────────────────────────────────────────

/** Coerce a Date|string|number into a Date or throw. */
function toDate(value, ctx) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new TypeError(`${ctx}: invalid Date`);
    }
    return new Date(value.getTime());
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new TypeError(`${ctx}: cannot parse ${JSON.stringify(value)}`);
    }
    return d;
  }
  throw new TypeError(`${ctx}: expected Date|string|number, got ${typeof value}`);
}

/** `YYYY-MM` bucket key in UTC. */
function monthKey(d) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${m < 10 ? '0' : ''}${m}`;
}

/** Return the integer number of calendar months between two dates (UTC). */
function monthsBetween(from, to) {
  const y = to.getUTCFullYear() - from.getUTCFullYear();
  const m = to.getUTCMonth() - from.getUTCMonth();
  return y * 12 + m;
}

/** Format a bilingual month label from a `YYYY-MM` key. */
function labelForMonthKey(key) {
  const [y, m] = key.split('-').map((x) => parseInt(x, 10));
  const idx = m - 1;
  return Object.freeze({
    he: `${HEBREW_MONTHS[idx]} ${y}`,
    en: `${ENGLISH_MONTHS[idx]} ${y}`,
  });
}

/** Round to a given number of decimals — returns 0 for non-finite. */
function round(value, decimals = 2) {
  if (!Number.isFinite(value)) return 0;
  const m = Math.pow(10, decimals);
  return Math.round(value * m) / m;
}

/** Deep-freeze helper — freezes arrays and plain objects recursively. */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const k of Object.keys(value)) {
    const v = value[k];
    if (v !== null && (typeof v === 'object' || Array.isArray(v))) {
      deepFreeze(v);
    }
  }
  return value;
}

/** Validate that a customer record is shaped correctly. */
function normaliseCustomer(raw, index) {
  if (raw === null || typeof raw !== 'object') {
    throw new TypeError(`customers[${index}]: expected object`);
  }
  if (raw.id === undefined || raw.id === null || raw.id === '') {
    throw new TypeError(`customers[${index}]: missing id`);
  }
  const rawOrders = Array.isArray(raw.orders) ? raw.orders : [];
  const orders = rawOrders.map((o, j) => {
    if (o === null || typeof o !== 'object') {
      throw new TypeError(`customers[${index}].orders[${j}]: expected object`);
    }
    const date = toDate(o.date, `customers[${index}].orders[${j}].date`);
    const revenueRaw = o.revenue;
    const revenue = revenueRaw === undefined || revenueRaw === null ? 0 : Number(revenueRaw);
    if (!Number.isFinite(revenue)) {
      throw new TypeError(`customers[${index}].orders[${j}].revenue: not a finite number`);
    }
    return { date, revenue, id: o.id !== undefined ? o.id : null };
  });
  let acquiredAt;
  if (raw.acquiredAt !== undefined && raw.acquiredAt !== null) {
    acquiredAt = toDate(raw.acquiredAt, `customers[${index}].acquiredAt`);
  } else if (orders.length > 0) {
    acquiredAt = new Date(Math.min(...orders.map((o) => o.date.getTime())));
  } else {
    throw new TypeError(
      `customers[${index}]: either acquiredAt or at least one order is required`,
    );
  }
  return { id: raw.id, acquiredAt, orders };
}

/** Monotonically advance `YYYY-MM` keys from `start` for `count` months. */
function monthRange(startKey, count) {
  const [y0, m0] = startKey.split('-').map((x) => parseInt(x, 10));
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const total = (y0 - 1) * 12 + (m0 - 1) + i;
    const y = Math.floor(total / 12) + 1;
    const m = (total % 12) + 1;
    out.push(`${y}-${m < 10 ? '0' : ''}${m}`);
  }
  return out;
}

// ─── class ────────────────────────────────────────────────────────────────

/**
 * CohortAnalysis — builds retention / revenue / order cohort heatmaps from
 * a flat customer+orders feed.
 *
 * The class is deliberately stateless with respect to the input data — each
 * call to `buildCohort` normalises the inputs fresh, so the same instance
 * can be reused across many builds without leaking data between them.
 */
class CohortAnalysis {
  /**
   * @param {object} [opts]
   * @param {Date}   [opts.now]         — clock override for tests (default: new Date()).
   * @param {number} [opts.maxMonths]   — cap on months-since-acquisition columns (default: 24).
   */
  constructor(opts = {}) {
    const now = opts.now !== undefined ? toDate(opts.now, 'opts.now') : new Date();
    const maxMonths =
      opts.maxMonths !== undefined ? Math.max(1, Math.floor(Number(opts.maxMonths))) : 24;
    Object.defineProperty(this, '_now', { value: now, writable: false });
    Object.defineProperty(this, '_maxMonths', { value: maxMonths, writable: false });
    Object.freeze(this);
  }

  /**
   * Bucket customers into monthly acquisition cohorts.
   *
   * @param {Array} customers
   * @returns {object} { byKey: { 'YYYY-MM': [customers…] }, keys: [] }
   */
  monthlyBuckets(customers) {
    if (!Array.isArray(customers)) {
      throw new TypeError('monthlyBuckets: customers must be an array');
    }
    const byKey = {};
    customers.forEach((raw, i) => {
      const c = normaliseCustomer(raw, i);
      const key = monthKey(c.acquiredAt);
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(c);
    });
    const keys = Object.keys(byKey).sort();
    return { byKey, keys };
  }

  /**
   * Build the full cohort heatmap payload.
   *
   * @param {Array} customers
   * @param {object} [opts]
   * @param {'retention'|'revenue'|'orders'} [opts.metric='retention']
   * @param {number} [opts.maxMonths]  — override the instance-level cap.
   * @param {boolean} [opts.hebrewLabels=true] — emit Hebrew month labels.
   * @returns {object} deep-frozen heatmap payload
   */
  buildCohort(customers, opts = {}) {
    const metric = opts.metric !== undefined ? opts.metric : 'retention';
    if (!COHORT_METRICS.includes(metric)) {
      throw new TypeError(
        `buildCohort: unknown metric ${JSON.stringify(metric)}; ` +
          `expected one of ${COHORT_METRICS.join(', ')}`,
      );
    }
    const maxMonths =
      opts.maxMonths !== undefined
        ? Math.max(1, Math.floor(Number(opts.maxMonths)))
        : this._maxMonths;
    const hebrewLabels = opts.hebrewLabels !== false;

    const { byKey, keys: cohortKeys } = this.monthlyBuckets(customers);

    // Column count: always `maxMonths` when there is data, or 0 when empty.
    // Future months (beyond "now") are still emitted as placeholders so every
    // cohort row is the same length and the heatmap grid is uniform — that's
    // how real BI cohort dashboards render it, and it lets the UI compare
    // young cohorts against old cohorts without special-casing the tail.
    const colCount = cohortKeys.length === 0 ? 0 : maxMonths;

    // Build rows
    const rows = cohortKeys.map((cohortKey) => {
      const members = byKey[cohortKey];
      const cohortSize = members.length;
      const periodRetention = new Array(colCount).fill(0);
      const cumulativeRetention = new Array(colCount).fill(0);
      const revenueByMonth = new Array(colCount).fill(0);
      const ordersByMonth = new Array(colCount).fill(0);
      const cumulativeCustomers = new Array(colCount).fill(0);
      const cumulativeActive = new Set();

      for (let m = 0; m < colCount; m += 1) {
        const active = new Set();
        for (const member of members) {
          let memberMonthRevenue = 0;
          let memberMonthOrders = 0;
          for (const order of member.orders) {
            // Only orders at-or-after acquisition, bucketed by months-since-acquired.
            if (order.date.getTime() < member.acquiredAt.getTime()) continue;
            const sinceAcq = monthsBetween(member.acquiredAt, order.date);
            if (sinceAcq === m) {
              memberMonthRevenue += order.revenue;
              memberMonthOrders += 1;
            }
          }
          if (memberMonthOrders > 0) {
            active.add(member.id);
            cumulativeActive.add(member.id);
          }
          revenueByMonth[m] += memberMonthRevenue;
          ordersByMonth[m] += memberMonthOrders;
        }
        periodRetention[m] =
          cohortSize > 0 ? round((active.size / cohortSize) * 100, 2) : 0;
        cumulativeCustomers[m] = cumulativeActive.size;
        cumulativeRetention[m] =
          cohortSize > 0 ? round((cumulativeActive.size / cohortSize) * 100, 2) : 0;
      }

      // Metric selection for the heatmap `cells` — the renderer uses this.
      let cells;
      if (metric === 'retention') {
        cells = periodRetention.slice();
      } else if (metric === 'revenue') {
        cells = revenueByMonth.map((v) => round(v, 2));
      } else {
        cells = ordersByMonth.slice();
      }

      const totalRevenue = round(
        revenueByMonth.reduce((acc, v) => acc + v, 0),
        2,
      );
      const avgRevenuePerCustomer =
        cohortSize > 0 ? round(totalRevenue / cohortSize, 2) : 0;

      return {
        cohort: cohortKey,
        label: labelForMonthKey(cohortKey),
        size: cohortSize,
        cells,
        period_retention_pct: periodRetention,
        cumulative_retention_pct: cumulativeRetention,
        revenue_by_month_ils: revenueByMonth.map((v) => round(v, 2)),
        orders_by_month: ordersByMonth.slice(),
        total_revenue_ils: totalRevenue,
        avg_revenue_per_customer_ils: avgRevenuePerCustomer,
      };
    });

    const columnKeys =
      cohortKeys.length === 0 ? [] : monthRange(cohortKeys[0], colCount);
    const columns = columnKeys.map((key, i) => ({
      month_index: i,
      key,
      label_gregorian: labelForMonthKey(key),
      label_hebrew_month: hebrewLabels
        ? Object.freeze({
            he: HEBREW_MONTHS[parseInt(key.slice(5, 7), 10) - 1],
            en: ENGLISH_MONTHS[parseInt(key.slice(5, 7), 10) - 1],
          })
        : null,
    }));

    // Heatmap shape: rows × cols, row-major. This matches what most
    // dashboard heatmap components expect (d3, echarts, plotly — all of
    // them accept `data[r][c]` or a flat `{row, col, value}` triplet list).
    const heatmap = Object.freeze({
      metric,
      header_metric: HEADERS[metric],
      header_rows: HEADERS.cohort,
      header_cols: HEADERS.monthsSince,
      rows_total: rows.length,
      cols_total: colCount,
      rows: rows.map((r) =>
        Object.freeze({
          cohort: r.cohort,
          label: r.label,
          size: r.size,
          cells: Object.freeze(r.cells.slice()),
        }),
      ),
      cells_flat: Object.freeze(
        (() => {
          const flat = [];
          rows.forEach((r, rIdx) => {
            r.cells.forEach((v, cIdx) => {
              flat.push(
                Object.freeze({
                  row: rIdx,
                  col: cIdx,
                  cohort: r.cohort,
                  month_index: cIdx,
                  value: v,
                }),
              );
            });
          });
          return flat;
        })(),
      ),
    });

    // Aggregate summary — populated whenever the inputs are non-empty.
    const totalCustomers = rows.reduce((acc, r) => acc + r.size, 0);
    const totalRevenue = round(
      rows.reduce((acc, r) => acc + r.total_revenue_ils, 0),
      2,
    );
    const avgRevenuePerCohort =
      rows.length > 0 ? round(totalRevenue / rows.length, 2) : 0;
    const avgRevenuePerCustomer =
      totalCustomers > 0 ? round(totalRevenue / totalCustomers, 2) : 0;

    // Build cohort-indexed detail table — one row per cohort, bilingual
    // labels, both period and cumulative retention curves, revenue curve.
    const cohortDetails = rows.map((r) =>
      Object.freeze({
        cohort: r.cohort,
        label: r.label,
        size: r.size,
        period_retention_pct: Object.freeze(r.period_retention_pct.slice()),
        cumulative_retention_pct: Object.freeze(r.cumulative_retention_pct.slice()),
        revenue_by_month_ils: Object.freeze(r.revenue_by_month_ils.slice()),
        orders_by_month: Object.freeze(r.orders_by_month.slice()),
        total_revenue_ils: r.total_revenue_ils,
        avg_revenue_per_customer_ils: r.avg_revenue_per_customer_ils,
      }),
    );

    const payload = {
      metric,
      generated_at: this._now.toISOString(),
      headers: HEADERS,
      columns,
      heatmap,
      cohorts: cohortDetails,
      summary: {
        cohorts_count: rows.length,
        total_customers: totalCustomers,
        total_revenue_ils: totalRevenue,
        avg_revenue_per_cohort_ils: avgRevenuePerCohort,
        avg_revenue_per_customer_ils: avgRevenuePerCustomer,
      },
    };
    return deepFreeze(payload);
  }

  /**
   * Return just the heatmap data shape — a thin wrapper over buildCohort
   * for callers who only need `rows × cols` and nothing else.
   *
   * @param {Array} customers
   * @param {object} [opts] — same options as buildCohort.
   * @returns {object}  deep-frozen heatmap
   */
  heatmap(customers, opts = {}) {
    return this.buildCohort(customers, opts).heatmap;
  }

  /**
   * Return the average revenue per customer for each cohort.
   *
   * @param {Array} customers
   * @returns {Array} deep-frozen list of { cohort, label, size, avg_revenue_per_customer_ils }
   */
  avgRevenuePerCohort(customers) {
    const built = this.buildCohort(customers, { metric: 'revenue' });
    return deepFreeze(
      built.cohorts.map((c) => ({
        cohort: c.cohort,
        label: c.label,
        size: c.size,
        avg_revenue_per_customer_ils: c.avg_revenue_per_customer_ils,
      })),
    );
  }

  /**
   * Return the cumulative retention curve for a single cohort.
   *
   * @param {Array} customers
   * @param {string} cohortKey  — e.g. '2026-01'
   * @returns {object} { cohort, label, size, period_pct, cumulative_pct }
   */
  retentionCurve(customers, cohortKey) {
    const built = this.buildCohort(customers, { metric: 'retention' });
    const row = built.cohorts.find((c) => c.cohort === cohortKey);
    if (!row) {
      throw new RangeError(
        `retentionCurve: cohort ${JSON.stringify(cohortKey)} not found`,
      );
    }
    return deepFreeze({
      cohort: row.cohort,
      label: row.label,
      size: row.size,
      period_pct: row.period_retention_pct.slice(),
      cumulative_pct: row.cumulative_retention_pct.slice(),
    });
  }

  /**
   * Return the revenue curve for a single cohort.
   *
   * @param {Array} customers
   * @param {string} cohortKey
   * @returns {object} { cohort, label, size, revenue_by_month_ils, total_revenue_ils }
   */
  revenueCurve(customers, cohortKey) {
    const built = this.buildCohort(customers, { metric: 'revenue' });
    const row = built.cohorts.find((c) => c.cohort === cohortKey);
    if (!row) {
      throw new RangeError(
        `revenueCurve: cohort ${JSON.stringify(cohortKey)} not found`,
      );
    }
    return deepFreeze({
      cohort: row.cohort,
      label: row.label,
      size: row.size,
      revenue_by_month_ils: row.revenue_by_month_ils.slice(),
      total_revenue_ils: row.total_revenue_ils,
    });
  }
}

// ─── exports ──────────────────────────────────────────────────────────────

module.exports = {
  CohortAnalysis,
  COHORT_METRICS,
  HEBREW_MONTHS,
  ENGLISH_MONTHS,
  HEADERS,
  GLOSSARY,
  // Helpers exposed for tests and advanced callers.
  monthKey,
  monthsBetween,
  labelForMonthKey,
  monthRange,
};
