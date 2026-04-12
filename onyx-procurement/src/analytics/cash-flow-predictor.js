/**
 * Predictive Cash-Flow Analytics — אנליטיקה חיזוית לתזרים מזומנים
 * Agent X-04 — Techno-Kol Uzi ERP / Swarm 3 — 2026-04-11
 *
 * A zero-dependency, pure-JS probabilistic cash-flow predictor. Complements
 * the deterministic src/reports/cash-flow-forecast.js by producing:
 *   • 30 / 60 / 90 day daily-granular forecasts with P10/P50/P90 bands
 *   • Monte Carlo simulation (default 1000 iterations) over client
 *     payment-timing and AR collection risk
 *   • Seasonal index (day-of-week × day-of-month × month-of-year)
 *   • Client-payment-date estimation based on historical avg days-to-pay
 *   • Israeli-specific outflow timings:
 *        – Payroll on the 25th of the month
 *        – National Insurance / Income Tax on the 15th (monthly)
 *        – VAT bi-monthly (15th of odd-numbered months Feb/Apr/Jun/…)
 *   • Jewish-holiday friction (פסח, ראש השנה, יום כיפור, סוכות) that dampens
 *     collection activity in the days around the holiday
 *   • End-of-quarter collection push (last 5 business days of Q1/Q2/Q3/Q4)
 *   • Back-testing (MAPE / RMSE) against historical daily balances
 *
 * Inputs (all optional — module degrades gracefully to empty arrays):
 *   opts = {
 *     asOf:            Date|string  forecast start (default: now)
 *     horizon:         30|60|90     main horizon (default: 90)
 *     horizons:        number[]     additional horizons to compute (default: [30,60,90])
 *     iterations:      number       Monte Carlo iterations (default: 1000)
 *     seed:            number       deterministic PRNG seed (default: 1)
 *     openingBalance:  number       starting cash position
 *     historical:      [{date, inflow, outflow, balance}]  last 365 days
 *     openInvoices:    [{id, client_id, amount, issued_at, due_date}]  AR
 *     clientHistory:   { [client_id]: { avg_days_to_pay, std_dev_days, payments:[{days}] } }
 *     scheduledBills:  [{id, amount, due_date, kind}]  AP already booked
 *     recurringExpenses: [{kind, amount, frequency, day_of_month, start_date, end_date}]
 *     payroll:         [{amount, month?, day?}]  defaults to 25th of each month
 *     taxes:           [{kind, amount, due_date}]  optional override of Israeli defaults
 *     taxProfile:      { ni_monthly, income_tax_monthly, vat_bimonthly }  used to synthesize
 *                        tax events when explicit `taxes` not provided
 *   }
 *
 * Exports:
 *   • predictCashFlow(opts)
 *        → { daily_forecast: { '30': [...], '60': [...], '90': [...] },
 *            alerts:[], confidence_bands, assumptions, backtest, summary, seasonal_index }
 *   • estimateClientPaymentDate(invoice, clientHistory)
 *        → { expected_date, confidence, p10_date, p50_date, p90_date,
 *            avg_days_to_pay, std_dev_days, n_samples }
 *   • identifyLiquidityRisk(forecast) → [{date, probability, median_balance, risk_level}]
 *   • backtestModel(historical) → { mape, rmse, n_points, skipped, coverage_p10_p90 }
 *
 * Zero dependencies. Pure math. Deterministic under fixed seed. Bilingual labels.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// 1. CONSTANTS
// ═══════════════════════════════════════════════════════════════

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Default Monte Carlo tuning
const DEFAULT_ITERATIONS = 1000;
const DEFAULT_HORIZONS = [30, 60, 90];
const DEFAULT_HORIZON = 90;

// Client payment behavior defaults (used when client_id has no history)
const DEFAULT_AVG_DAYS_TO_PAY = 30;      // Israeli B2B "שוטף+30" baseline
const DEFAULT_STDDEV_DAYS = 10;
const DEFAULT_DEFAULT_RISK = 0.03;       // 3% of invoices flip to bad debt

// End-of-quarter "collection push" adjustment (invoices arrive slightly earlier)
const EOQ_PUSH_DAYS_EARLY = 3;
const EOQ_PUSH_WINDOW_DAYS = 5;          // last 5 business days of quarter

// Holiday dampening — collections slow around major Jewish holidays.
// Multiplier < 1 means fewer collections land that day; overflow shifts later.
const HOLIDAY_DAMPEN_FACTOR = 0.4;       // receive 40% of otherwise-expected inflow
const HOLIDAY_WINDOW_BEFORE_DAYS = 2;
const HOLIDAY_WINDOW_AFTER_DAYS = 2;

// Israeli payment timings (overridable per-tenant via opts.taxProfile)
const ISRAELI_PAYROLL_DAY = 25;          // ה-25 לחודש — תשלום משכורת
const ISRAELI_NI_TAX_DAY = 15;           // ה-15 לחודש — ביטוח לאומי + מס הכנסה
const ISRAELI_VAT_DAY = 15;              // ה-15 של פברואר/אפריל/… דיווח דו־חודשי

// Seasonal index smoothing
const SEASONAL_MIN_SAMPLES = 3;          // below this, fall back to 1.0
const SEASONAL_BLEND_ALPHA = 0.6;        // blend weight between DoW/DoM

// Backtest skipped-day threshold (cannot compute MAPE on ~0 actuals)
const BACKTEST_ZERO_FLOOR = 1.0;

// Hebrew / English bilingual labels used in alerts and assumptions
const LABELS = {
  negative_balance:   'Predicted negative balance / צפויה יתרה שלילית',
  critical_low:       'Critical low-point / נקודת שפל קריטית',
  high_risk_day:      'High-risk day / יום בסיכון גבוה',
  moderate_risk_day:  'Moderate-risk day / יום בסיכון מתון',
  monte_carlo_note:   'Monte Carlo simulation / הדמיית מונטה קרלו',
  seasonal_note:      'Seasonal index from historical data / מדד עונתי מהיסטוריה',
  israeli_timings:    'Israeli payment timings applied / לוח תשלומים ישראלי',
  holiday_dampening:  'Holiday collection dampening / האטת גבייה סביב חגים',
  eoq_push:           'End-of-quarter collection push / דחיפת גבייה בסוף רבעון',
  no_history:         'No historical data — using heuristic priors / ללא היסטוריה — אומדן',
};

// ═══════════════════════════════════════════════════════════════
// 2. DETERMINISTIC PRNG (mulberry32)
//    Required for reproducible Monte Carlo without any deps.
// ═══════════════════════════════════════════════════════════════

function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box–Muller standard-normal sample from a uniform [0,1) rand()
function randn(rand) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ═══════════════════════════════════════════════════════════════
// 3. DATE HELPERS (no dependencies)
// ═══════════════════════════════════════════════════════════════

function toDate(d) {
  if (d instanceof Date) return new Date(d.getTime());
  if (typeof d === 'string' || typeof d === 'number') return new Date(d);
  return new Date();
}

function startOfDay(d) {
  const dt = toDate(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function addDays(d, n) {
  const dt = toDate(d);
  dt.setDate(dt.getDate() + Math.floor(n));
  return dt;
}

function daysBetween(a, b) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / MS_PER_DAY);
}

function isoDate(d) {
  const dt = toDate(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function money(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function isBusinessDay(d) {
  // Israel: Sun–Thu are working days; Fri/Sat are weekend
  const day = toDate(d).getDay();
  return day >= 0 && day <= 4;
}

function endOfMonth(year, monthIdx) {
  return new Date(year, monthIdx + 1, 0);
}

function lastBusinessDayOfMonth(year, monthIdx) {
  const d = endOfMonth(year, monthIdx);
  while (!isBusinessDay(d)) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

function shiftToBusinessDay(d) {
  const dt = startOfDay(d);
  while (!isBusinessDay(dt)) dt.setDate(dt.getDate() + 1);
  return dt;
}

// ═══════════════════════════════════════════════════════════════
// 4. JEWISH HOLIDAY CALENDAR (approx. Gregorian windows)
//    Pure math (no @hebcal/anything). We hard-code the major holidays'
//    approximate Gregorian ranges for the relevant civil years. The
//    predictor only needs "which days have reduced collection activity"
//    — exact Hebrew-date conversion is out of scope.
// ═══════════════════════════════════════════════════════════════

const JEWISH_HOLIDAY_WINDOWS = {
  // Each entry: { name_en, name_he, start: 'MM-DD', end: 'MM-DD', year }
  2025: [
    { name_en: 'Pesach',       name_he: 'פסח',         start: '2025-04-12', end: '2025-04-20' },
    { name_en: 'Shavuot',      name_he: 'שבועות',      start: '2025-06-01', end: '2025-06-03' },
    { name_en: 'Rosh Hashana', name_he: 'ראש השנה',    start: '2025-09-22', end: '2025-09-24' },
    { name_en: 'Yom Kippur',   name_he: 'יום כיפור',   start: '2025-10-01', end: '2025-10-02' },
    { name_en: 'Sukkot',       name_he: 'סוכות',       start: '2025-10-06', end: '2025-10-13' },
  ],
  2026: [
    { name_en: 'Pesach',       name_he: 'פסח',         start: '2026-04-01', end: '2026-04-09' },
    { name_en: 'Shavuot',      name_he: 'שבועות',      start: '2026-05-21', end: '2026-05-23' },
    { name_en: 'Rosh Hashana', name_he: 'ראש השנה',    start: '2026-09-11', end: '2026-09-13' },
    { name_en: 'Yom Kippur',   name_he: 'יום כיפור',   start: '2026-09-20', end: '2026-09-21' },
    { name_en: 'Sukkot',       name_he: 'סוכות',       start: '2026-09-25', end: '2026-10-02' },
  ],
  2027: [
    { name_en: 'Pesach',       name_he: 'פסח',         start: '2027-04-21', end: '2027-04-29' },
    { name_en: 'Shavuot',      name_he: 'שבועות',      start: '2027-06-10', end: '2027-06-12' },
    { name_en: 'Rosh Hashana', name_he: 'ראש השנה',    start: '2027-10-01', end: '2027-10-03' },
    { name_en: 'Yom Kippur',   name_he: 'יום כיפור',   start: '2027-10-10', end: '2027-10-11' },
    { name_en: 'Sukkot',       name_he: 'סוכות',       start: '2027-10-15', end: '2027-10-22' },
  ],
};

/**
 * Returns a holiday descriptor if `date` falls within a holiday's
 * friction window (holiday window ± HOLIDAY_WINDOW_BEFORE/AFTER_DAYS).
 */
function holidayForDate(date) {
  const dt = startOfDay(date);
  const year = dt.getFullYear();
  const neighbors = [
    ...(JEWISH_HOLIDAY_WINDOWS[year - 1] || []),
    ...(JEWISH_HOLIDAY_WINDOWS[year] || []),
    ...(JEWISH_HOLIDAY_WINDOWS[year + 1] || []),
  ];
  for (const h of neighbors) {
    const start = addDays(toDate(h.start), -HOLIDAY_WINDOW_BEFORE_DAYS);
    const end = addDays(toDate(h.end), HOLIDAY_WINDOW_AFTER_DAYS);
    if (dt >= start && dt <= end) return h;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// 5. SEASONAL INDEX
//    Builds a multiplier-per-day based on last-N-days of historical
//    net cash flow. Uses day-of-week, day-of-month and month-of-year.
// ═══════════════════════════════════════════════════════════════

function buildSeasonalIndex(historical) {
  const dow = Array(7).fill(0).map(() => ({ sum: 0, n: 0 }));
  const dom = Array(32).fill(0).map(() => ({ sum: 0, n: 0 })); // 1..31
  const moy = Array(12).fill(0).map(() => ({ sum: 0, n: 0 }));
  let overallSum = 0;
  let overallN = 0;

  for (const row of historical || []) {
    const d = toDate(row.date);
    if (Number.isNaN(d.getTime())) continue;
    const net = Number(row.inflow || 0) - Number(row.outflow || 0);
    dow[d.getDay()].sum += net;
    dow[d.getDay()].n += 1;
    dom[d.getDate()].sum += net;
    dom[d.getDate()].n += 1;
    moy[d.getMonth()].sum += net;
    moy[d.getMonth()].n += 1;
    overallSum += net;
    overallN += 1;
  }

  const overallAvg = overallN > 0 ? overallSum / overallN : 0;

  function avg(bucket) {
    return bucket.n >= SEASONAL_MIN_SAMPLES ? bucket.sum / bucket.n : overallAvg;
  }

  function ratio(bucket) {
    if (overallAvg === 0) return 1.0;
    const a = avg(bucket);
    // Cap extreme ratios to [0.3, 2.5] to avoid runaway seasonal amplification
    const r = a / overallAvg;
    if (!Number.isFinite(r)) return 1.0;
    return Math.max(0.3, Math.min(2.5, r));
  }

  return {
    overall_avg: overallAvg,
    n_samples: overallN,
    dow: dow.map(ratio),
    dom: dom.map(ratio),
    moy: moy.map(ratio),
    factorFor(date) {
      if (overallN < SEASONAL_MIN_SAMPLES) return 1.0;
      const d = toDate(date);
      const rDow = this.dow[d.getDay()] || 1.0;
      const rDom = this.dom[d.getDate()] || 1.0;
      const rMoy = this.moy[d.getMonth()] || 1.0;
      // Blend — DoW has the strongest signal in B2B cash flow
      return SEASONAL_BLEND_ALPHA * rDow + (1 - SEASONAL_BLEND_ALPHA) * ((rDom + rMoy) / 2);
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// 6. CLIENT PAYMENT HISTORY
// ═══════════════════════════════════════════════════════════════

function clientPaymentStats(clientHistory, clientId) {
  const entry = clientHistory && clientHistory[clientId];
  if (!entry) {
    return {
      avg_days_to_pay: DEFAULT_AVG_DAYS_TO_PAY,
      std_dev_days: DEFAULT_STDDEV_DAYS,
      default_risk: DEFAULT_DEFAULT_RISK,
      n_samples: 0,
      source: 'default',
    };
  }
  let avg = Number(entry.avg_days_to_pay);
  let std = Number(entry.std_dev_days);
  let nSamples = Number(entry.n_samples || (entry.payments ? entry.payments.length : 0)) || 0;

  if ((!Number.isFinite(avg) || !Number.isFinite(std)) && Array.isArray(entry.payments) && entry.payments.length > 0) {
    const days = entry.payments
      .map((p) => Number(p.days))
      .filter((x) => Number.isFinite(x));
    if (days.length > 0) {
      avg = days.reduce((s, x) => s + x, 0) / days.length;
      const variance = days.reduce((s, x) => s + (x - avg) * (x - avg), 0) / days.length;
      std = Math.sqrt(variance);
      nSamples = days.length;
    }
  }

  if (!Number.isFinite(avg)) avg = DEFAULT_AVG_DAYS_TO_PAY;
  if (!Number.isFinite(std) || std < 0) std = DEFAULT_STDDEV_DAYS;

  return {
    avg_days_to_pay: avg,
    std_dev_days: std,
    default_risk: Number.isFinite(entry.default_risk) ? entry.default_risk : DEFAULT_DEFAULT_RISK,
    n_samples: nSamples,
    source: nSamples >= SEASONAL_MIN_SAMPLES ? 'history' : 'low_sample',
  };
}

/**
 * estimateClientPaymentDate(invoice, clientHistory)
 * Returns expected payment date plus P10/P50/P90 bounds, with a confidence score
 * derived from sample size and coefficient of variation.
 */
function estimateClientPaymentDate(invoice, clientHistory) {
  if (!invoice) throw new Error('estimateClientPaymentDate: invoice is required');
  const issued = toDate(invoice.issued_at || invoice.invoice_date || invoice.due_date || new Date());
  const stats = clientPaymentStats(clientHistory || {}, invoice.client_id);

  // Use issued_at + avg_days_to_pay as the best point estimate, but anchor to
  // the invoice's own due_date when the history is sparse.
  let expected;
  if (stats.source === 'history') {
    expected = addDays(issued, stats.avg_days_to_pay);
  } else if (invoice.due_date) {
    expected = addDays(toDate(invoice.due_date), 0);
  } else {
    expected = addDays(issued, DEFAULT_AVG_DAYS_TO_PAY);
  }

  // Normal-approximation bounds (~P10/P50/P90 corresponds to ±1.2816·σ)
  const z = 1.2816;
  const p10 = addDays(expected, -z * stats.std_dev_days);
  const p50 = expected;
  const p90 = addDays(expected, z * stats.std_dev_days);

  // Confidence: bounded [0.2, 0.95] from sample size, penalised by CV
  const sampleTerm = 1 - Math.exp(-stats.n_samples / 12);
  const cv = stats.avg_days_to_pay > 0 ? stats.std_dev_days / stats.avg_days_to_pay : 1;
  const cvTerm = 1 / (1 + cv);
  let confidence = 0.2 + 0.75 * sampleTerm * cvTerm;
  if (!Number.isFinite(confidence)) confidence = 0.2;
  confidence = Math.max(0.2, Math.min(0.95, confidence));

  return {
    expected_date: isoDate(expected),
    p10_date: isoDate(p10),
    p50_date: isoDate(p50),
    p90_date: isoDate(p90),
    confidence: Math.round(confidence * 1000) / 1000,
    avg_days_to_pay: Math.round(stats.avg_days_to_pay * 100) / 100,
    std_dev_days: Math.round(stats.std_dev_days * 100) / 100,
    default_risk: stats.default_risk,
    n_samples: stats.n_samples,
    source: stats.source,
  };
}

// ═══════════════════════════════════════════════════════════════
// 7. END-OF-QUARTER "COLLECTION PUSH"
//    Clients traditionally rush to close receivables before Q-end to
//    meet their own reporting targets. We shift AR expected dates
//    earlier by EOQ_PUSH_DAYS_EARLY when the invoice would otherwise
//    fall in the last EOQ_PUSH_WINDOW_DAYS of the quarter.
// ═══════════════════════════════════════════════════════════════

function isEndOfQuarterWindow(date) {
  const d = toDate(date);
  const month = d.getMonth(); // 0..11
  // End of Q1=Mar(2), Q2=Jun(5), Q3=Sep(8), Q4=Dec(11)
  if (![2, 5, 8, 11].includes(month)) return false;
  const eomDay = new Date(d.getFullYear(), month + 1, 0).getDate();
  const inWindow = d.getDate() >= eomDay - EOQ_PUSH_WINDOW_DAYS + 1;
  return inWindow;
}

function applyEndOfQuarterPush(date) {
  if (!isEndOfQuarterWindow(date)) return date;
  return addDays(date, -EOQ_PUSH_DAYS_EARLY);
}

// ═══════════════════════════════════════════════════════════════
// 8. ISRAELI OUTFLOW SCHEDULE GENERATION
// ═══════════════════════════════════════════════════════════════

function generateIsraeliOutflows(opts, asOf, horizonEnd) {
  const events = [];
  const { payroll, taxes, taxProfile, recurringExpenses, scheduledBills } = opts || {};

  // ── Payroll (25th of each month) ─────────────────────────
  if (Array.isArray(payroll) && payroll.length > 0) {
    for (const p of payroll) {
      const amt = Number(p.amount || 0);
      if (!amt) continue;
      // Walk each month in horizon
      let cursor = new Date(asOf.getFullYear(), asOf.getMonth(), ISRAELI_PAYROLL_DAY);
      while (cursor <= horizonEnd) {
        if (cursor >= asOf) {
          events.push({
            date: shiftToBusinessDay(cursor),
            amount: -amt,
            kind: 'payroll',
            label: 'Payroll / משכורת',
            source: 'israeli_schedule',
          });
        }
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, ISRAELI_PAYROLL_DAY);
      }
    }
  }

  // ── Taxes (explicit list) ────────────────────────────────
  if (Array.isArray(taxes) && taxes.length > 0) {
    for (const t of taxes) {
      events.push({
        date: startOfDay(t.due_date),
        amount: -Number(t.amount || 0),
        kind: t.kind || 'tax',
        label: `${t.kind || 'tax'} / מס`,
        source: 'israeli_schedule',
      });
    }
  } else if (taxProfile) {
    // Synthesize from profile: NI + income tax monthly (15th),
    // VAT bi-monthly (Feb/Apr/Jun/Aug/Oct/Dec 15th).
    let cursor = new Date(asOf.getFullYear(), asOf.getMonth(), ISRAELI_NI_TAX_DAY);
    while (cursor <= horizonEnd) {
      if (cursor >= asOf) {
        if (Number(taxProfile.ni_monthly) > 0) {
          events.push({
            date: shiftToBusinessDay(cursor),
            amount: -Number(taxProfile.ni_monthly),
            kind: 'national_insurance',
            label: 'Bituach Leumi / ביטוח לאומי',
            source: 'israeli_schedule',
          });
        }
        if (Number(taxProfile.income_tax_monthly) > 0) {
          events.push({
            date: shiftToBusinessDay(cursor),
            amount: -Number(taxProfile.income_tax_monthly),
            kind: 'income_tax',
            label: 'Income Tax / מס הכנסה',
            source: 'israeli_schedule',
          });
        }
        // VAT: bi-monthly report, paid on 15th of every even month
        // (Feb=1, Apr=3, Jun=5, Aug=7, Oct=9, Dec=11 — 0-indexed)
        if (Number(taxProfile.vat_bimonthly) > 0 && cursor.getMonth() % 2 === 1) {
          events.push({
            date: shiftToBusinessDay(new Date(cursor.getFullYear(), cursor.getMonth(), ISRAELI_VAT_DAY)),
            amount: -Number(taxProfile.vat_bimonthly),
            kind: 'vat',
            label: 'VAT / מע״מ',
            source: 'israeli_schedule',
          });
        }
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, ISRAELI_NI_TAX_DAY);
    }
  }

  // ── Recurring expenses ───────────────────────────────────
  if (Array.isArray(recurringExpenses)) {
    for (const rx of recurringExpenses) {
      const amt = Number(rx.amount || 0);
      if (!amt) continue;
      const freq = String(rx.frequency || 'monthly').toLowerCase();
      const dom = Number(rx.day_of_month || 1);
      const start = rx.start_date ? toDate(rx.start_date) : asOf;
      const end = rx.end_date ? toDate(rx.end_date) : horizonEnd;
      let cursor = new Date(asOf.getFullYear(), asOf.getMonth(), dom);
      while (cursor <= horizonEnd && cursor <= end) {
        if (cursor >= asOf && cursor >= start) {
          events.push({
            date: shiftToBusinessDay(cursor),
            amount: -amt,
            kind: rx.kind || 'recurring_expense',
            label: `${rx.kind || 'recurring'} / הוצאה קבועה`,
            source: 'recurring',
          });
        }
        if (freq === 'weekly') cursor = addDays(cursor, 7);
        else if (freq === 'biweekly') cursor = addDays(cursor, 14);
        else if (freq === 'quarterly')
          cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 3, dom);
        else if (freq === 'annual' || freq === 'yearly')
          cursor = new Date(cursor.getFullYear() + 1, cursor.getMonth(), dom);
        else
          cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, dom);
      }
    }
  }

  // ── Scheduled bills (explicit AP) ────────────────────────
  if (Array.isArray(scheduledBills)) {
    for (const b of scheduledBills) {
      const d = startOfDay(b.due_date || b.date);
      if (d >= asOf && d <= horizonEnd) {
        events.push({
          date: d,
          amount: -Number(b.amount || 0),
          kind: b.kind || 'ap_bill',
          label: b.label || `AP ${b.id || ''}`,
          source: 'scheduled_bills',
        });
      }
    }
  }

  return events;
}

// ═══════════════════════════════════════════════════════════════
// 9. MONTE CARLO SIMULATION
// ═══════════════════════════════════════════════════════════════

/**
 * Runs N iterations of probabilistic daily cash-flow.
 *
 * For each AR invoice:
 *   • with probability default_risk the invoice never arrives
 *   • else the payment day is sampled from N(avg_days_to_pay, std_dev_days)
 *   • day is clamped to the horizon and shifted for EOQ / holiday friction
 *
 * Deterministic outflow events (payroll, taxes, bills, recurring) are fixed.
 * Seasonal index biases AR timings slightly on high/low days.
 *
 * Returns per-day percentile bands.
 */
function runMonteCarlo({
  iterations,
  seed,
  asOf,
  horizon,
  openingBalance,
  openInvoices,
  clientHistory,
  deterministicOutflows,
  seasonal,
}) {
  const rand = mulberry32(seed);
  const days = horizon;

  // Pre-compute AR invoice parameters (speeds up inner loop)
  const invoices = (openInvoices || []).map((inv) => {
    const stats = clientPaymentStats(clientHistory, inv.client_id);
    const issued = toDate(inv.issued_at || inv.invoice_date || inv.due_date || asOf);
    return {
      id: inv.id,
      amount: Number(inv.amount || 0),
      client_id: inv.client_id,
      issued_at: issued,
      mean_day: daysBetween(asOf, addDays(issued, stats.avg_days_to_pay)),
      std: stats.std_dev_days,
      default_risk: stats.default_risk,
    };
  });

  // Pre-bucket deterministic outflows by day offset
  const outflowByDay = new Array(days).fill(0);
  for (const ev of deterministicOutflows || []) {
    const offset = daysBetween(asOf, ev.date);
    if (offset >= 0 && offset < days) {
      outflowByDay[offset] += Math.abs(Number(ev.amount || 0));
    }
  }

  // Allocate a flat iterations×days buffer for closing balances
  const sims = new Array(iterations);

  for (let it = 0; it < iterations; it++) {
    const inflow = new Array(days).fill(0);

    // Sample each invoice
    for (const inv of invoices) {
      if (inv.default_risk > 0 && rand() < inv.default_risk) continue;
      // Sample days-to-pay
      let sampledDay = inv.mean_day + randn(rand) * inv.std;
      sampledDay = Math.round(sampledDay);
      // EOQ push
      const candidateDate = addDays(asOf, sampledDay);
      if (isEndOfQuarterWindow(candidateDate)) sampledDay -= EOQ_PUSH_DAYS_EARLY;
      // Holiday dampening: if invoice would land in a holiday window,
      // with HOLIDAY_DAMPEN_FACTOR probability it actually lands,
      // otherwise push to first business day after window.
      const finalCandidate = addDays(asOf, sampledDay);
      if (holidayForDate(finalCandidate)) {
        if (rand() >= HOLIDAY_DAMPEN_FACTOR) {
          // Push past holiday: find next business day outside window
          let probe = sampledDay + 1;
          let guard = 0;
          while (guard++ < 30) {
            const pd = addDays(asOf, probe);
            if (!holidayForDate(pd) && isBusinessDay(pd)) break;
            probe += 1;
          }
          sampledDay = probe;
        }
      }
      // Weekend shift (Israel: Sun-Thu)
      if (!isBusinessDay(addDays(asOf, sampledDay))) sampledDay += 1;
      // Clamp
      if (sampledDay >= 0 && sampledDay < days) {
        inflow[sampledDay] += inv.amount;
      }
    }

    // Seasonal reweighting (small nudge around 1.0)
    if (seasonal && seasonal.n_samples >= SEASONAL_MIN_SAMPLES) {
      for (let i = 0; i < days; i++) {
        const factor = seasonal.factorFor(addDays(asOf, i));
        inflow[i] = inflow[i] * (0.75 + 0.25 * factor);
      }
    }

    // Build running balance
    const closing = new Array(days);
    let running = openingBalance;
    for (let i = 0; i < days; i++) {
      running = running + inflow[i] - outflowByDay[i];
      closing[i] = running;
    }
    sims[it] = closing;
  }

  // Compute P10/P50/P90 per day
  const bands = new Array(days);
  for (let i = 0; i < days; i++) {
    const col = new Array(iterations);
    for (let it = 0; it < iterations; it++) col[it] = sims[it][i];
    col.sort((a, b) => a - b);
    const p10 = col[Math.floor(iterations * 0.10)];
    const p50 = col[Math.floor(iterations * 0.50)];
    const p90 = col[Math.floor(iterations * 0.90)];
    // Probability of negative = fraction of simulations < 0
    let neg = 0;
    for (let it = 0; it < iterations; it++) if (sims[it][i] < 0) neg++;
    bands[i] = {
      day_offset: i,
      date: isoDate(addDays(asOf, i)),
      p10: money(p10),
      p50: money(p50),
      p90: money(p90),
      prob_negative: Math.round((neg / iterations) * 10000) / 10000,
      expected_outflow: money(outflowByDay[i]),
    };
  }

  return bands;
}

// ═══════════════════════════════════════════════════════════════
// 10. PUBLIC API — predictCashFlow
// ═══════════════════════════════════════════════════════════════

function predictCashFlow(opts = {}) {
  const asOf = startOfDay(opts.asOf || new Date());
  const iterations = Math.max(50, Math.floor(Number(opts.iterations || DEFAULT_ITERATIONS)));
  const seed = Number(opts.seed || 1);
  const openingBalance = Number(opts.openingBalance || 0);
  const horizons = Array.isArray(opts.horizons) && opts.horizons.length > 0
    ? opts.horizons.slice()
    : DEFAULT_HORIZONS.slice();
  if (opts.horizon && !horizons.includes(opts.horizon)) horizons.push(Number(opts.horizon));
  const mainHorizon = Math.max(...horizons, DEFAULT_HORIZON);

  // Build seasonal index from historical data
  const seasonal = buildSeasonalIndex(opts.historical || []);

  // Generate deterministic Israeli-schedule outflows over the full horizon
  const horizonEnd = addDays(asOf, mainHorizon);
  const deterministicOutflows = generateIsraeliOutflows(opts, asOf, horizonEnd);

  // Run Monte Carlo once for the largest horizon, slice per-horizon after.
  const bandsMain = runMonteCarlo({
    iterations,
    seed,
    asOf,
    horizon: mainHorizon,
    openingBalance,
    openInvoices: opts.openInvoices || [],
    clientHistory: opts.clientHistory || {},
    deterministicOutflows,
    seasonal,
  });

  // Per-horizon slices (strict — sorted so 30 comes before 60, etc.)
  const sortedHorizons = horizons.slice().sort((a, b) => a - b);
  const daily_forecast = {};
  const confidence_bands = {};
  for (const h of sortedHorizons) {
    const slice = bandsMain.slice(0, h);
    daily_forecast[String(h)] = slice.map((b) => ({
      date: b.date,
      day_offset: b.day_offset,
      p10: b.p10,
      p50: b.p50,
      p90: b.p90,
      prob_negative: b.prob_negative,
      expected_outflow: b.expected_outflow,
    }));
    // Compact confidence summary
    const p10s = slice.map((b) => b.p10);
    const p50s = slice.map((b) => b.p50);
    const p90s = slice.map((b) => b.p90);
    confidence_bands[String(h)] = {
      horizon_days: h,
      min_p10: money(Math.min(...p10s)),
      min_p50: money(Math.min(...p50s)),
      min_p90: money(Math.min(...p90s)),
      final_p10: slice.length ? slice[slice.length - 1].p10 : openingBalance,
      final_p50: slice.length ? slice[slice.length - 1].p50 : openingBalance,
      final_p90: slice.length ? slice[slice.length - 1].p90 : openingBalance,
      worst_day: slice.reduce(
        (acc, b) => (acc === null || b.p10 < acc.p10 ? b : acc),
        null
      ),
      worst_prob_negative: Math.max(...slice.map((b) => b.prob_negative), 0),
    };
  }

  // Alerts — days whose P50 or P10 goes negative
  const alerts = identifyLiquidityRisk({ daily_forecast });

  // Assumptions list (for audit trail)
  const assumptions = [
    `${LABELS.monte_carlo_note} — iterations=${iterations}, seed=${seed}`,
    `${LABELS.seasonal_note} — n_samples=${seasonal.n_samples}`,
    `${LABELS.israeli_timings}: payroll=${ISRAELI_PAYROLL_DAY}, NI/tax=${ISRAELI_NI_TAX_DAY}, VAT=bi-monthly`,
    `${LABELS.holiday_dampening} — factor=${HOLIDAY_DAMPEN_FACTOR}`,
    `${LABELS.eoq_push} — ${EOQ_PUSH_DAYS_EARLY}d earlier in last ${EOQ_PUSH_WINDOW_DAYS} business days`,
    `Default risk=${DEFAULT_DEFAULT_RISK}, default avg days-to-pay=${DEFAULT_AVG_DAYS_TO_PAY}, σ=${DEFAULT_STDDEV_DAYS}`,
    `Opening balance=${openingBalance}, open invoices=${(opts.openInvoices || []).length}, scheduled bills=${(opts.scheduledBills || []).length}`,
  ];
  if (!opts.historical || opts.historical.length === 0) {
    assumptions.push(LABELS.no_history);
  }

  // Backtest — if historical data provided, run model against it
  let backtest = null;
  if (Array.isArray(opts.historical) && opts.historical.length >= 14) {
    backtest = backtestModel(opts.historical);
  }

  // Summary (compact)
  const summary = {
    as_of: isoDate(asOf),
    opening_balance: money(openingBalance),
    iterations,
    horizons: sortedHorizons,
    main_horizon: mainHorizon,
    total_open_invoices: (opts.openInvoices || []).length,
    total_scheduled_bills: (opts.scheduledBills || []).length,
    total_deterministic_outflows: deterministicOutflows.length,
    worst_prob_negative_90d: confidence_bands[String(Math.max(...sortedHorizons))]?.worst_prob_negative || 0,
  };

  return {
    generated_at: new Date().toISOString(),
    daily_forecast,
    alerts,
    confidence_bands,
    assumptions,
    backtest,
    summary,
    seasonal_index: {
      n_samples: seasonal.n_samples,
      dow: seasonal.dow,
      dom: seasonal.dom,
      moy: seasonal.moy,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// 11. PUBLIC API — identifyLiquidityRisk
// ═══════════════════════════════════════════════════════════════

/**
 * Scans a forecast (or per-horizon daily_forecast map) and returns
 * days where probability of negative balance exceeds thresholds.
 *
 * Thresholds:
 *   • CRITICAL  if p10 < 0 AND prob_negative >= 0.5
 *   • HIGH      if p10 < 0 AND prob_negative >= 0.25
 *   • MEDIUM    if p10 < 0 AND prob_negative >= 0.10
 */
function identifyLiquidityRisk(forecast) {
  if (!forecast) return [];
  // Accept either { daily_forecast: { '30': [...], ... } } or an array of bands
  let bands = [];
  if (Array.isArray(forecast)) {
    bands = forecast;
  } else if (forecast.daily_forecast) {
    // Use the longest available horizon as the canonical band list
    const keys = Object.keys(forecast.daily_forecast).map(Number).sort((a, b) => b - a);
    bands = forecast.daily_forecast[String(keys[0])] || [];
  } else if (forecast.confidence_bands) {
    // Already per-horizon only — cannot drill into days
    return [];
  }

  const alerts = [];
  for (const b of bands) {
    const p10 = Number(b.p10);
    const p50 = Number(b.p50);
    const prob = Number(b.prob_negative || 0);
    let level = null;
    if (p10 < 0 && prob >= 0.5) level = 'CRITICAL';
    else if (p10 < 0 && prob >= 0.25) level = 'HIGH';
    else if (p10 < 0 && prob >= 0.10) level = 'MEDIUM';
    else if (p50 < 0) level = 'HIGH';
    if (level) {
      alerts.push({
        severity: level,
        code: level === 'CRITICAL' ? 'LIQUIDITY_CRITICAL' : 'LIQUIDITY_WARNING',
        message: `${LABELS[level === 'CRITICAL' ? 'critical_low' : level === 'HIGH' ? 'high_risk_day' : 'moderate_risk_day']} — ${b.date} (P[neg]=${(prob * 100).toFixed(1)}%)`,
        date: b.date,
        day_offset: b.day_offset,
        p10,
        p50,
        prob_negative: prob,
      });
    }
  }
  return alerts;
}

// ═══════════════════════════════════════════════════════════════
// 12. PUBLIC API — backtestModel
// ═══════════════════════════════════════════════════════════════

/**
 * Walk the historical series forward in a rolling-origin fashion:
 *   • For each day i from 14 to N-1, use days [0..i-1] as training
 *     and predict day i's net flow using the seasonal index alone.
 *   • Compute MAPE and RMSE against actuals.
 *   • Compute coverage_p10_p90 using ± naive 1-sigma band from
 *     historical residuals.
 *
 * This is intentionally simple: the Monte Carlo layer is not back-tested
 * (would require historical AR/AP snapshots) but the seasonal baseline is.
 */
function backtestModel(historical) {
  const rows = (historical || [])
    .filter((r) => r && r.date)
    .map((r) => ({
      date: toDate(r.date),
      net: Number(r.inflow || 0) - Number(r.outflow || 0),
      inflow: Number(r.inflow || 0),
      outflow: Number(r.outflow || 0),
    }))
    .sort((a, b) => a.date - b.date);

  if (rows.length < 14) {
    return {
      mape: null,
      rmse: null,
      n_points: rows.length,
      skipped: 0,
      coverage_p10_p90: null,
      note: 'insufficient history (need ≥14 rows)',
    };
  }

  // Rolling back-test
  let sumAbsPct = 0;
  let sumSq = 0;
  let n = 0;
  let skipped = 0;
  let coveredBand = 0;

  const residuals = [];

  for (let i = 14; i < rows.length; i++) {
    const train = rows.slice(0, i);
    const seasonal = buildSeasonalIndex(
      train.map((r) => ({ date: r.date, inflow: r.inflow, outflow: r.outflow }))
    );
    const avg = seasonal.overall_avg;
    const predicted = avg * seasonal.factorFor(rows[i].date);
    const actual = rows[i].net;

    const residual = actual - predicted;
    residuals.push(residual);

    if (Math.abs(actual) < BACKTEST_ZERO_FLOOR) {
      skipped += 1;
      continue;
    }
    const pctErr = Math.abs((actual - predicted) / actual);
    sumAbsPct += pctErr;
    sumSq += residual * residual;
    n += 1;
  }

  const mape = n > 0 ? sumAbsPct / n : null;
  const rmse = n > 0 ? Math.sqrt(sumSq / n) : null;

  // Coverage: how many actuals fell inside predicted ±1σ band
  if (residuals.length > 0) {
    const mean = residuals.reduce((s, x) => s + x, 0) / residuals.length;
    const variance = residuals.reduce((s, x) => s + (x - mean) * (x - mean), 0) / residuals.length;
    const sigma = Math.sqrt(variance);
    for (let i = 0; i < residuals.length; i++) {
      if (Math.abs(residuals[i] - mean) <= 1.2816 * sigma) coveredBand += 1;
    }
  }
  const coverage = residuals.length > 0 ? coveredBand / residuals.length : null;

  return {
    mape: mape !== null ? Math.round(mape * 10000) / 10000 : null,
    rmse: rmse !== null ? Math.round(rmse * 100) / 100 : null,
    n_points: n,
    skipped,
    coverage_p10_p90: coverage !== null ? Math.round(coverage * 1000) / 1000 : null,
    total_rows: rows.length,
  };
}

// ═══════════════════════════════════════════════════════════════
// 13. EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  // public
  predictCashFlow,
  estimateClientPaymentDate,
  identifyLiquidityRisk,
  backtestModel,
  // exposed for unit tests / advanced callers
  _internals: {
    mulberry32,
    randn,
    buildSeasonalIndex,
    clientPaymentStats,
    holidayForDate,
    generateIsraeliOutflows,
    runMonteCarlo,
    isBusinessDay,
    shiftToBusinessDay,
    isEndOfQuarterWindow,
    applyEndOfQuarterPush,
    addDays,
    daysBetween,
    isoDate,
    startOfDay,
    JEWISH_HOLIDAY_WINDOWS,
    DEFAULT_AVG_DAYS_TO_PAY,
    DEFAULT_STDDEV_DAYS,
    DEFAULT_DEFAULT_RISK,
    ISRAELI_PAYROLL_DAY,
    ISRAELI_NI_TAX_DAY,
    ISRAELI_VAT_DAY,
    HOLIDAY_DAMPEN_FACTOR,
    EOQ_PUSH_DAYS_EARLY,
    LABELS,
  },
};
