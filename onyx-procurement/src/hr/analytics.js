/**
 * HR Analytics Dashboard — Zero-Dependency People Metrics Engine
 * Agent X-12 • Techno-Kol Uzi • Swarm 3 • Kobi's mega-ERP
 *
 * Computes a full set of workforce KPIs from raw employee / payroll /
 * absence / recruiting records. 100% pure functions, no I/O, no deps.
 *
 * Hebrew/English bilingual labels.
 * Israeli labor-law compliant (חוק שוויון הזדמנויות, חוק הגנת הפרטיות,
 * חוק דמי מחלה, חוק חופשה שנתית, חוק עבודת נשים, חוק פיצויי פיטורים).
 *
 * Privacy-aware:
 *   - Aggregations never expose individuals.
 *   - Diversity groups under MIN_GROUP_SIZE collapse into 'other'.
 *   - Gender / age are aggregate-only per Israeli equal-opportunity law.
 *
 * Exported (see bottom):
 *   headcountReport(employees, period)
 *   turnoverAnalysis(events, period)
 *   timeToHire(recruitingRecords, period)
 *   timeToProductivity(employees, period)
 *   costPerHire(recruitingSpend, hires, period)
 *   totalComp(employee, period)
 *   overtimeCostRatio(payrolls, period)
 *   absenceRate(absences, workdays, period)
 *   tenureHistogram(employees, asOf)
 *   diversityDashboard(employees)
 *   trainingHours(trainingRecords, employees, period)
 *   payEquityAudit(employees)
 *   retentionRisk(employee, context)
 *   severance(employee, exitDate)
 *   form106(employee, year)
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS — Israeli labor law 2026
// ═══════════════════════════════════════════════════════════════

const PRIVACY = {
  /** never expose a diversity bucket with fewer than this many employees */
  MIN_GROUP_SIZE: 5,
  /** never publish a pay-gap bucket with fewer than this many employees per side */
  MIN_EQUITY_GROUP: 3,
};

const ISRAELI_LABOR = {
  /** חוק פיצויי פיטורים — 1 month salary per year of service */
  SEVERANCE_MONTHS_PER_YEAR: 1,
  /** חוק דמי מחלה — eligibility threshold */
  SICK_PAY_ELIGIBILITY_DAYS: 365,
  /** חוק עבודת נשים — maternity leave weeks (paid by ביטוח לאומי) */
  MATERNITY_LEAVE_WEEKS: 26,
  /** חוק עבודת נשים — max extension for medical reasons (unpaid) */
  MATERNITY_EXTENSION_MAX_WEEKS: 6,
  /** חוק חיילים משוחררים — reserve duty (מילואים) never counts as turnover */
  RESERVE_DUTY_EXCLUDED_FROM_TURNOVER: true,
  /** typical onboarding period for "time to productivity" — 90 days */
  PRODUCTIVITY_THRESHOLD_DAYS: 90,
  /** 52-week rolling window for YTD / rolling calculations */
  ROLLING_WINDOW_DAYS: 365,
};

const DEFAULT_PERIOD = {
  YEAR_DAYS: 365,
  MONTH_DAYS: 30,
  WEEK_DAYS: 7,
};

// Bilingual labels — always rendered as { he, en } to let the UI choose direction
const LABELS = {
  HEADCOUNT: { he: 'מצבת כוח אדם', en: 'Headcount' },
  TURNOVER: { he: 'תחלופת עובדים', en: 'Turnover' },
  VOLUNTARY: { he: 'עזיבה וולונטרית', en: 'Voluntary' },
  INVOLUNTARY: { he: 'פיטורין', en: 'Involuntary' },
  RESERVE_DUTY: { he: 'מילואים', en: 'Reserve duty' },
  MATERNITY: { he: 'חופשת לידה', en: 'Maternity leave' },
  SICK: { he: 'מחלה', en: 'Sick leave' },
  VACATION: { he: 'חופשה', en: 'Vacation' },
  UNPAID: { he: 'חופשה ללא תשלום', en: 'Unpaid leave' },
  SEVERANCE: { he: 'פיצויי פיטורים', en: 'Severance' },
  TRAINING: { he: 'הדרכות', en: 'Training' },
  PENSION: { he: 'פנסיה', en: 'Pension' },
};

// ═══════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════

/** Round to 2 decimals (currency-safe). */
function round2(n) {
  if (!isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Round to 4 decimals (for rates). */
function round4(n) {
  if (!isFinite(n)) return 0;
  return Math.round(n * 10000) / 10000;
}

/** Safe division — returns 0 on divide-by-zero. */
function safeDiv(a, b) {
  if (!b || b === 0) return 0;
  return a / b;
}

/** Parse an ISO-ish string or Date into a Date (UTC-safe). */
function toDate(v) {
  if (v instanceof Date) return new Date(v.getTime());
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/** Days between two dates (positive integer, inclusive). */
function daysBetween(start, end) {
  const s = toDate(start);
  const e = toDate(end);
  if (!s || !e) return 0;
  const ms = e.getTime() - s.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

/** First day of month for a given date. */
function startOfMonth(d) {
  const x = toDate(d);
  if (!x) return null;
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1));
}

/** Return true if `d` is within [start, end] inclusive. */
function inPeriod(d, start, end) {
  const x = toDate(d);
  const s = toDate(start);
  const e = toDate(end);
  if (!x) return false;
  if (s && x < s) return false;
  if (e && x > e) return false;
  return true;
}

/** Mean of a numeric array. */
function mean(arr) {
  if (!arr || arr.length === 0) return 0;
  let sum = 0;
  for (const v of arr) sum += Number(v) || 0;
  return sum / arr.length;
}

/** Population standard deviation. */
function stddev(arr) {
  if (!arr || arr.length < 2) return 0;
  const m = mean(arr);
  let sq = 0;
  for (const v of arr) sq += Math.pow((Number(v) || 0) - m, 2);
  return Math.sqrt(sq / arr.length);
}

/** Group an array into a Map<key, T[]> given a key function. */
function groupBy(arr, keyFn) {
  const m = new Map();
  for (const item of arr || []) {
    const k = keyFn(item) ?? 'unknown';
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(item);
  }
  return m;
}

/** Convert a Map<string,T> into a sorted plain object. */
function mapToObject(m) {
  const out = {};
  const keys = Array.from(m.keys()).sort();
  for (const k of keys) out[k] = m.get(k);
  return out;
}

/** Normalize a period input → {start, end}. Accepts {start,end} or {year} or {year,month}. */
function normalizePeriod(period) {
  const now = new Date();
  if (!period) {
    return {
      start: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)),
      end: now,
    };
  }
  if (period.start && period.end) {
    return { start: toDate(period.start), end: toDate(period.end) };
  }
  if (typeof period.year === 'number' && typeof period.month === 'number') {
    const s = new Date(Date.UTC(period.year, period.month - 1, 1));
    const e = new Date(Date.UTC(period.year, period.month, 0, 23, 59, 59));
    return { start: s, end: e };
  }
  if (typeof period.year === 'number') {
    const s = new Date(Date.UTC(period.year, 0, 1));
    const e = new Date(Date.UTC(period.year, 11, 31, 23, 59, 59));
    return { start: s, end: e };
  }
  return { start: toDate(period.start), end: toDate(period.end) };
}

/** True if an employee was active at a given date. */
function isActiveAt(employee, date) {
  if (!employee) return false;
  const d = toDate(date);
  const start = toDate(employee.hire_date);
  if (!start || (d && d < start)) return false;
  const end = toDate(employee.termination_date);
  if (end && d && d > end) return false;
  return true;
}

// ═══════════════════════════════════════════════════════════════
// 1. HEADCOUNT
// ═══════════════════════════════════════════════════════════════

/**
 * @param {Array} employees - [{id, hire_date, termination_date?, department, role, employment_type}]
 * @param {Object} period   - {start, end} or {year} or {year, month}
 * @returns {Object} {total, by_department, by_role, by_employment_type, trend:[{month,count}]}
 */
function headcountReport(employees, period) {
  const list = Array.isArray(employees) ? employees : [];
  const { start, end } = normalizePeriod(period);
  const asOf = end || new Date();

  const active = list.filter((e) => isActiveAt(e, asOf));

  const byDept = {};
  const byRole = {};
  const byType = {};

  for (const e of active) {
    const dept = e.department || 'unknown';
    const role = e.role || 'unknown';
    const type = e.employment_type || 'full_time';
    byDept[dept] = (byDept[dept] || 0) + 1;
    byRole[role] = (byRole[role] || 0) + 1;
    byType[type] = (byType[type] || 0) + 1;
  }

  // Monthly trend from `start` → `end`
  const trend = [];
  if (start && end) {
    let cursor = startOfMonth(start);
    const stopAt = startOfMonth(end);
    let safety = 0;
    while (cursor && stopAt && cursor <= stopAt && safety++ < 240) {
      // end-of-month snapshot
      const eom = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0, 23, 59, 59)
      );
      const snap = list.filter((e) => isActiveAt(e, eom)).length;
      trend.push({
        month: cursor.toISOString().slice(0, 7), // YYYY-MM
        count: snap,
      });
      cursor = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1)
      );
    }
  }

  return {
    label: LABELS.HEADCOUNT,
    as_of: asOf.toISOString(),
    total: active.length,
    by_department: byDept,
    by_role: byRole,
    by_employment_type: byType,
    trend,
  };
}

// ═══════════════════════════════════════════════════════════════
// 2. TURNOVER
// ═══════════════════════════════════════════════════════════════

/**
 * Turnover rate per standard formula:
 *   rate = separations_in_period / avg_headcount_in_period
 *
 * Reserve duty (מילואים) returns / absences NEVER count as turnover.
 * Maternity returns NEVER count as turnover.
 *
 * @param {Object} input - {employees, separations}
 *   employees  = full employee list (active + terminated) — for avg headcount
 *   separations = [{employee_id, date, reason, voluntary:boolean, type}]
 * @param {Object} period
 * @returns {Object} {rate, voluntary, involuntary, rolling_12m, monthly, ytd, by_reason}
 */
function turnoverAnalysis(input, period) {
  const employees = (input && input.employees) || [];
  const seps = (input && input.separations) || [];
  const { start, end } = normalizePeriod(period);

  // exclude reserve duty "separations" (they are never terminations)
  const realSeps = seps.filter((s) => {
    const reason = String(s.reason || '').toLowerCase();
    const type = String(s.type || '').toLowerCase();
    if (type === 'reserve_duty' || type === 'miluim' || reason.includes('מילואים')) {
      return false;
    }
    return true;
  });

  const inWindow = realSeps.filter((s) => inPeriod(s.date, start, end));

  // average headcount = (start_headcount + end_headcount) / 2
  const startHC = employees.filter((e) => isActiveAt(e, start)).length;
  const endHC = employees.filter((e) => isActiveAt(e, end)).length;
  const avgHC = (startHC + endHC) / 2;

  const voluntaryCount = inWindow.filter((s) => s.voluntary === true).length;
  const involuntaryCount = inWindow.filter((s) => s.voluntary === false).length;

  const byReason = {};
  for (const s of inWindow) {
    const r = s.reason || 'unspecified';
    byReason[r] = (byReason[r] || 0) + 1;
  }

  // Monthly breakdown
  const monthly = {};
  for (const s of inWindow) {
    const d = toDate(s.date);
    if (!d) continue;
    const key = d.toISOString().slice(0, 7);
    monthly[key] = (monthly[key] || 0) + 1;
  }

  // YTD — from Jan 1 of end.year → end
  const ytdStart = new Date(Date.UTC((end || new Date()).getUTCFullYear(), 0, 1));
  const ytdSeps = realSeps.filter((s) => inPeriod(s.date, ytdStart, end)).length;
  const ytdStartHC = employees.filter((e) => isActiveAt(e, ytdStart)).length;
  const ytdEndHC = employees.filter((e) => isActiveAt(e, end)).length;
  const ytdAvgHC = (ytdStartHC + ytdEndHC) / 2;

  // Rolling 12 months — from end-365 → end
  const rollingStart = new Date(
    (end || new Date()).getTime() - ISRAELI_LABOR.ROLLING_WINDOW_DAYS * 86400000
  );
  const rollingSeps = realSeps.filter((s) => inPeriod(s.date, rollingStart, end)).length;
  const rollStartHC = employees.filter((e) => isActiveAt(e, rollingStart)).length;
  const rollEndHC = employees.filter((e) => isActiveAt(e, end)).length;
  const rollAvgHC = (rollStartHC + rollEndHC) / 2;

  return {
    label: LABELS.TURNOVER,
    period: { start: start && start.toISOString(), end: end && end.toISOString() },
    rate: round4(safeDiv(inWindow.length, avgHC)),
    separations: inWindow.length,
    voluntary: voluntaryCount,
    involuntary: involuntaryCount,
    avg_headcount: round2(avgHC),
    ytd: {
      rate: round4(safeDiv(ytdSeps, ytdAvgHC)),
      separations: ytdSeps,
      avg_headcount: round2(ytdAvgHC),
    },
    rolling_12m: {
      rate: round4(safeDiv(rollingSeps, rollAvgHC)),
      separations: rollingSeps,
      avg_headcount: round2(rollAvgHC),
    },
    monthly,
    by_reason: byReason,
    reserve_duty_excluded: true, // sanity flag — never counts in turnover
  };
}

// ═══════════════════════════════════════════════════════════════
// 3. TIME-TO-HIRE
// ═══════════════════════════════════════════════════════════════

/**
 * Time from requisition_open → offer_accepted (in days), per recruiting record.
 * Returns {avg, median, p90, count, by_department}.
 */
function timeToHire(records, period) {
  const rows = Array.isArray(records) ? records : [];
  const { start, end } = normalizePeriod(period);

  const windowed = rows.filter((r) => inPeriod(r.offer_accepted_at || r.hired_at, start, end));

  const durations = [];
  const byDept = {};

  for (const r of windowed) {
    const open = toDate(r.requisition_open_at || r.posted_at);
    const hired = toDate(r.offer_accepted_at || r.hired_at);
    if (!open || !hired) continue;
    const d = daysBetween(open, hired);
    durations.push(d);
    const dept = r.department || 'unknown';
    if (!byDept[dept]) byDept[dept] = [];
    byDept[dept].push(d);
  }

  const sorted = durations.slice().sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const p90Idx = Math.max(0, Math.floor(sorted.length * 0.9) - 1);
  const p90 = sorted.length ? sorted[p90Idx] : 0;

  const byDeptAvg = {};
  for (const [k, v] of Object.entries(byDept)) {
    byDeptAvg[k] = round2(mean(v));
  }

  return {
    count: durations.length,
    avg_days: round2(mean(durations)),
    median_days: median,
    p90_days: p90,
    by_department: byDeptAvg,
  };
}

// ═══════════════════════════════════════════════════════════════
// 4. TIME-TO-PRODUCTIVITY
// ═══════════════════════════════════════════════════════════════

/**
 * Days from hire → productivity milestone.
 * `productivity_reached_at` is set by managers; if absent we use
 * `productivity_score >= threshold` or default 90-day assumption.
 */
function timeToProductivity(employees, period) {
  const list = Array.isArray(employees) ? employees : [];
  const { start, end } = normalizePeriod(period);

  const windowed = list.filter((e) => inPeriod(e.hire_date, start, end));

  const durations = [];
  for (const e of windowed) {
    const hired = toDate(e.hire_date);
    if (!hired) continue;
    let reached = toDate(e.productivity_reached_at);
    if (!reached && typeof e.productivity_score === 'number' && e.productivity_score >= 0.8) {
      reached = new Date(hired.getTime() + ISRAELI_LABOR.PRODUCTIVITY_THRESHOLD_DAYS * 86400000);
    }
    if (!reached) continue;
    durations.push(daysBetween(hired, reached));
  }

  return {
    count: durations.length,
    avg_days: round2(mean(durations)),
    median_days: durations.length
      ? durations.slice().sort((a, b) => a - b)[Math.floor(durations.length / 2)]
      : 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// 5. COST PER HIRE
// ═══════════════════════════════════════════════════════════════

/**
 * Cost per hire = total recruiting spend / # hires.
 * recruitingSpend: {job_board_fees, agency_fees, referral_bonuses, internal_cost}
 */
function costPerHire(recruitingSpend, hires, period) {
  const s = recruitingSpend || {};
  const total =
    (s.job_board_fees || 0) +
    (s.agency_fees || 0) +
    (s.referral_bonuses || 0) +
    (s.internal_cost || 0) +
    (s.advertising || 0) +
    (s.assessments || 0);

  const { start, end } = normalizePeriod(period);
  const list = Array.isArray(hires) ? hires : [];
  const windowed = list.filter((h) => inPeriod(h.hire_date, start, end));

  return {
    total_spend: round2(total),
    hires: windowed.length,
    cost_per_hire: round2(safeDiv(total, windowed.length)),
    breakdown: {
      job_board_fees: round2(s.job_board_fees || 0),
      agency_fees: round2(s.agency_fees || 0),
      referral_bonuses: round2(s.referral_bonuses || 0),
      internal_cost: round2(s.internal_cost || 0),
      advertising: round2(s.advertising || 0),
      assessments: round2(s.assessments || 0),
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// 6. TOTAL COMPENSATION (per employee, per period)
// ═══════════════════════════════════════════════════════════════

/**
 * Detailed comp cost breakdown for a single employee across a period.
 *
 * @param {Object} employee - full record with payroll_history[], benefits{}
 * @param {Object} period   - {start, end}
 * @returns {Object} {gross, overtime, pension_employer, severance_employer,
 *                    bituach_leumi_employer, study_fund_employer, benefits,
 *                    total_employer_cost, employee_take_home_est}
 */
function totalComp(employee, period) {
  if (!employee) {
    return {
      gross: 0,
      overtime: 0,
      pension_employer: 0,
      severance_employer: 0,
      bituach_leumi_employer: 0,
      study_fund_employer: 0,
      benefits: 0,
      total_employer_cost: 0,
    };
  }

  const { start, end } = normalizePeriod(period);
  const payrolls = Array.isArray(employee.payroll_history)
    ? employee.payroll_history.filter((p) => inPeriod(p.period || p.date, start, end))
    : [];

  let gross = 0;
  let overtime = 0;
  let pensionEmployer = 0;
  let severanceEmployer = 0;
  let bituachEmployer = 0;
  let studyFundEmployer = 0;

  for (const p of payrolls) {
    gross += Number(p.gross || 0);
    overtime += Number(p.overtime || 0);
    pensionEmployer += Number(p.pension_employer || 0);
    severanceEmployer += Number(p.severance_employer || 0);
    bituachEmployer += Number(p.bituach_leumi_employer || 0);
    studyFundEmployer += Number(p.study_fund_employer || 0);
  }

  const benefits =
    (employee.benefits && Number(employee.benefits.annual_value)) || 0;
  // prorate benefits across the period
  const days = daysBetween(start, end) || DEFAULT_PERIOD.YEAR_DAYS;
  const proratedBenefits = (benefits * days) / DEFAULT_PERIOD.YEAR_DAYS;

  const totalEmployerCost =
    gross +
    pensionEmployer +
    severanceEmployer +
    bituachEmployer +
    studyFundEmployer +
    proratedBenefits;

  return {
    employee_id: employee.id,
    period: { start: start && start.toISOString(), end: end && end.toISOString() },
    gross: round2(gross),
    overtime: round2(overtime),
    pension_employer: round2(pensionEmployer),
    severance_employer: round2(severanceEmployer),
    bituach_leumi_employer: round2(bituachEmployer),
    study_fund_employer: round2(studyFundEmployer),
    benefits: round2(proratedBenefits),
    total_employer_cost: round2(totalEmployerCost),
  };
}

// ═══════════════════════════════════════════════════════════════
// 7. OVERTIME COST RATIO
// ═══════════════════════════════════════════════════════════════

/**
 * Overtime cost as % of base wage across a population of payroll rows.
 */
function overtimeCostRatio(payrolls, period) {
  const rows = Array.isArray(payrolls) ? payrolls : [];
  const { start, end } = normalizePeriod(period);
  const windowed = rows.filter((p) => inPeriod(p.period || p.date, start, end));

  let base = 0;
  let ot = 0;
  for (const p of windowed) {
    base += Number(p.base || p.gross || 0);
    ot += Number(p.overtime || 0);
  }

  return {
    base: round2(base),
    overtime: round2(ot),
    ratio: round4(safeDiv(ot, base)),
    payrolls_evaluated: windowed.length,
  };
}

// ═══════════════════════════════════════════════════════════════
// 8. ABSENCE RATE
// ═══════════════════════════════════════════════════════════════

/**
 * Absence categories: sick / vacation / unpaid / maternity / reserve_duty.
 * Maternity leave and reserve duty are reported SEPARATELY (legally
 * protected — never factor into "absence rate" KPIs by default).
 *
 * @param {Array} absences  - [{employee_id, date, days, type}]
 * @param {Number} workdays - total available work-days in period (scalar)
 */
function absenceRate(absences, workdays, period) {
  const list = Array.isArray(absences) ? absences : [];
  const { start, end } = normalizePeriod(period);
  const windowed = list.filter((a) => inPeriod(a.date, start, end));

  const buckets = {
    sick: 0,
    vacation: 0,
    unpaid: 0,
    maternity: 0,
    reserve_duty: 0,
    other: 0,
  };

  for (const a of windowed) {
    const type = String(a.type || '').toLowerCase();
    const days = Number(a.days || 1);
    if (type === 'sick' || type === 'מחלה') buckets.sick += days;
    else if (type === 'vacation' || type === 'חופשה') buckets.vacation += days;
    else if (type === 'unpaid' || type === 'חלת') buckets.unpaid += days;
    else if (type === 'maternity' || type === 'לידה') buckets.maternity += days;
    else if (type === 'reserve_duty' || type === 'miluim' || type === 'מילואים')
      buckets.reserve_duty += days;
    else buckets.other += days;
  }

  // "rate" = (sick + vacation + unpaid + other) / workdays
  // Maternity + reserve duty are excluded by default (legally protected).
  const countedAbsences =
    buckets.sick + buckets.vacation + buckets.unpaid + buckets.other;

  const wd = Number(workdays) || 0;

  return {
    period: { start: start && start.toISOString(), end: end && end.toISOString() },
    workdays: wd,
    days_absent_counted: countedAbsences,
    rate: round4(safeDiv(countedAbsences, wd)),
    buckets: {
      sick: { days: buckets.sick, rate: round4(safeDiv(buckets.sick, wd)) },
      vacation: { days: buckets.vacation, rate: round4(safeDiv(buckets.vacation, wd)) },
      unpaid: { days: buckets.unpaid, rate: round4(safeDiv(buckets.unpaid, wd)) },
      maternity: { days: buckets.maternity }, // reported but not in rate
      reserve_duty: { days: buckets.reserve_duty }, // reported but not in rate
      other: { days: buckets.other, rate: round4(safeDiv(buckets.other, wd)) },
    },
    notes: {
      maternity: LABELS.MATERNITY,
      reserve_duty: LABELS.RESERVE_DUTY,
      excluded_from_rate: ['maternity', 'reserve_duty'],
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// 9. TENURE HISTOGRAM
// ═══════════════════════════════════════════════════════════════

/**
 * Distribution of employees by years-of-service buckets.
 * Default buckets: <1y, 1-2y, 2-5y, 5-10y, 10+y.
 */
function tenureHistogram(employees, asOf) {
  const list = Array.isArray(employees) ? employees : [];
  const date = toDate(asOf) || new Date();

  const buckets = {
    '<1y': 0,
    '1-2y': 0,
    '2-5y': 0,
    '5-10y': 0,
    '10+y': 0,
  };

  let totalYears = 0;
  let counted = 0;

  for (const e of list) {
    if (!isActiveAt(e, date)) continue;
    const hired = toDate(e.hire_date);
    if (!hired) continue;
    const years = daysBetween(hired, date) / DEFAULT_PERIOD.YEAR_DAYS;
    totalYears += years;
    counted++;
    if (years < 1) buckets['<1y']++;
    else if (years < 2) buckets['1-2y']++;
    else if (years < 5) buckets['2-5y']++;
    else if (years < 10) buckets['5-10y']++;
    else buckets['10+y']++;
  }

  return {
    as_of: date.toISOString(),
    total: counted,
    buckets,
    avg_tenure_years: round2(safeDiv(totalYears, counted)),
  };
}

// ═══════════════════════════════════════════════════════════════
// 10. DIVERSITY DASHBOARD
//  — Aggregate only. Israeli equal-opportunity law compliant.
// ═══════════════════════════════════════════════════════════════

/**
 * Aggregate-only diversity metrics. Groups smaller than
 * PRIVACY.MIN_GROUP_SIZE are collapsed into 'other' to protect identity.
 *
 * NEVER expose individual PII — only counts.
 *
 * @returns {Object} {total, gender, age_buckets, compliant, notes}
 */
function diversityDashboard(employees) {
  const list = Array.isArray(employees) ? employees : [];
  const active = list.filter((e) => isActiveAt(e, new Date()));
  const total = active.length;

  const genderCounts = {};
  const ageBuckets = { '<25': 0, '25-34': 0, '35-44': 0, '45-54': 0, '55+': 0 };
  const tenureBuckets = { '<2y': 0, '2-5y': 0, '5-10y': 0, '10+y': 0 };
  const deptCounts = {};

  const now = new Date();
  for (const e of active) {
    const g = e.gender || 'unspecified';
    genderCounts[g] = (genderCounts[g] || 0) + 1;

    const bd = toDate(e.birth_date);
    if (bd) {
      const age = Math.floor(daysBetween(bd, now) / DEFAULT_PERIOD.YEAR_DAYS);
      if (age < 25) ageBuckets['<25']++;
      else if (age < 35) ageBuckets['25-34']++;
      else if (age < 45) ageBuckets['35-44']++;
      else if (age < 55) ageBuckets['45-54']++;
      else ageBuckets['55+']++;
    }

    const hired = toDate(e.hire_date);
    if (hired) {
      const years = daysBetween(hired, now) / DEFAULT_PERIOD.YEAR_DAYS;
      if (years < 2) tenureBuckets['<2y']++;
      else if (years < 5) tenureBuckets['2-5y']++;
      else if (years < 10) tenureBuckets['5-10y']++;
      else tenureBuckets['10+y']++;
    }

    const d = e.department || 'unknown';
    deptCounts[d] = (deptCounts[d] || 0) + 1;
  }

  // Privacy collapse: any bucket with < MIN_GROUP_SIZE → merge into 'other'
  function collapseSmallGroups(obj) {
    const out = { other: 0 };
    for (const [k, v] of Object.entries(obj)) {
      if (v < PRIVACY.MIN_GROUP_SIZE && k !== 'other') {
        out.other += v;
      } else {
        out[k] = v;
      }
    }
    if (out.other === 0) delete out.other;
    return out;
  }

  return {
    total,
    gender: collapseSmallGroups(genderCounts),
    age_buckets: collapseSmallGroups(ageBuckets),
    tenure_buckets: collapseSmallGroups(tenureBuckets),
    by_department: collapseSmallGroups(deptCounts),
    compliant_with: ['חוק שוויון הזדמנויות בעבודה', 'חוק הגנת הפרטיות'],
    notes: {
      en:
        'All metrics are aggregate counts. Groups smaller than ' +
        PRIVACY.MIN_GROUP_SIZE +
        ' are collapsed into "other" to protect individual identity.',
      he:
        'כל המדדים הם ספירות מצטברות. קבוצות הקטנות מ-' +
        PRIVACY.MIN_GROUP_SIZE +
        ' עובדים מאוחדות תחת "אחר" לשמירה על זהות הפרט.',
    },
    individual_pii_exposed: false,
  };
}

// ═══════════════════════════════════════════════════════════════
// 11. TRAINING HOURS
// ═══════════════════════════════════════════════════════════════

/**
 * Training hours per employee within a period.
 * @param {Array} records - [{employee_id, date, hours, topic}]
 * @param {Array} employees
 * @param {Object} period
 */
function trainingHours(records, employees, period) {
  const rows = Array.isArray(records) ? records : [];
  const people = Array.isArray(employees) ? employees : [];
  const { start, end } = normalizePeriod(period);

  const windowed = rows.filter((r) => inPeriod(r.date, start, end));
  const perEmployee = {};
  let total = 0;
  for (const r of windowed) {
    const id = r.employee_id || 'unknown';
    perEmployee[id] = (perEmployee[id] || 0) + Number(r.hours || 0);
    total += Number(r.hours || 0);
  }

  const activeCount = people.filter((e) => isActiveAt(e, end)).length || 1;

  return {
    label: LABELS.TRAINING,
    total_hours: round2(total),
    avg_hours_per_employee: round2(total / activeCount),
    records_count: windowed.length,
    by_topic: (function () {
      const byT = {};
      for (const r of windowed) {
        const t = r.topic || 'unspecified';
        byT[t] = (byT[t] || 0) + Number(r.hours || 0);
      }
      return byT;
    })(),
  };
}

// ═══════════════════════════════════════════════════════════════
// 12. PAY EQUITY AUDIT
//  — Statistical gap analysis after controlling for tenure
// ═══════════════════════════════════════════════════════════════

/**
 * Pay-gap analysis by role, comparing groups (e.g. male vs female)
 * after a simple tenure-based normalization:
 *
 *   norm_salary = salary / (1 + tenure_years * TENURE_FACTOR)
 *
 * Groups smaller than PRIVACY.MIN_EQUITY_GROUP on either side are
 * suppressed (returned with `suppressed: true` and no numbers).
 *
 * Statistical significance uses Welch's t-test approximation
 * (|t| >= 2 → "significant").
 *
 * @param {Array} employees  - requires salary, gender, role, hire_date
 * @returns {Object} {by_role:[{role, gap_pct, significant, suppressed?}], overall}
 */
function payEquityAudit(employees) {
  const list = Array.isArray(employees) ? employees : [];
  const active = list.filter((e) => isActiveAt(e, new Date()));
  const now = new Date();
  const TENURE_FACTOR = 0.03; // +3% per year assumption for normalization

  // Group by role
  const byRole = groupBy(active, (e) => e.role || 'unknown');
  const results = [];

  for (const [role, people] of byRole.entries()) {
    const groupA = []; // e.g. male
    const groupB = []; // e.g. female
    for (const e of people) {
      const salary = Number(e.base_salary || 0);
      const hired = toDate(e.hire_date);
      if (!salary || !hired) continue;
      const years = daysBetween(hired, now) / DEFAULT_PERIOD.YEAR_DAYS;
      const norm = salary / (1 + years * TENURE_FACTOR);
      if (e.gender === 'male' || e.gender === 'M' || e.gender === 'ז') groupA.push(norm);
      else if (e.gender === 'female' || e.gender === 'F' || e.gender === 'נ') groupB.push(norm);
    }

    if (
      groupA.length < PRIVACY.MIN_EQUITY_GROUP ||
      groupB.length < PRIVACY.MIN_EQUITY_GROUP
    ) {
      results.push({
        role,
        suppressed: true,
        reason: 'group size below privacy threshold',
      });
      continue;
    }

    const meanA = mean(groupA);
    const meanB = mean(groupB);
    const sdA = stddev(groupA);
    const sdB = stddev(groupB);

    // Welch's t approximation
    const seA = sdA / Math.sqrt(groupA.length);
    const seB = sdB / Math.sqrt(groupB.length);
    const se = Math.sqrt(seA * seA + seB * seB);
    const t = se ? (meanA - meanB) / se : 0;

    const gapPct = meanA ? (meanA - meanB) / meanA : 0;

    results.push({
      role,
      group_a_count: groupA.length,
      group_b_count: groupB.length,
      mean_a: round2(meanA),
      mean_b: round2(meanB),
      gap_pct: round4(gapPct),
      t_statistic: round4(t),
      significant: Math.abs(t) >= 2,
    });
  }

  // Overall gap (all roles pooled, privacy-compliant only)
  const aAll = [];
  const bAll = [];
  for (const r of results) {
    if (r.suppressed) continue;
    if (r.mean_a) aAll.push(r.mean_a);
    if (r.mean_b) bAll.push(r.mean_b);
  }
  const overallGap = aAll.length && bAll.length ? (mean(aAll) - mean(bAll)) / mean(aAll) : 0;

  return {
    by_role: results,
    overall_gap_pct: round4(overallGap),
    compliant_with: ['חוק שכר שווה לעובדת ולעובד'],
    notes: {
      he: 'קבוצות קטנות מ-' + PRIVACY.MIN_EQUITY_GROUP + ' מוסוות לשמירה על פרטיות.',
      en:
        'Groups smaller than ' +
        PRIVACY.MIN_EQUITY_GROUP +
        ' are suppressed for privacy.',
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// 13. RETENTION RISK (per employee)
// ═══════════════════════════════════════════════════════════════

/**
 * Heuristic retention-risk score for a single employee.
 * Pure rule-based — no ML, no external deps.
 *
 * Factors (each contributes up to a max points):
 *   - tenure < 1y                      +15
 *   - tenure 1-2y                       +10
 *   - salary below role median         up to +25
 *   - overtime ratio > 30%             +15
 *   - absence rate > 10%               +10
 *   - no promotion in 3+ years         +15
 *   - training hours < 10 / year       +10
 *   - performance_score < 3 of 5       +15
 *   - known flight-risk signals        +15
 *
 * Total clamped to 0..100.
 *
 * @param {Object} employee
 * @param {Object} context - {role_median_salary, avg_overtime_ratio}
 * @returns {Object} {risk_score, band, factors, suggested_interventions}
 */
function retentionRisk(employee, context) {
  if (!employee) return { risk_score: 0, band: 'unknown', factors: [], suggested_interventions: [] };
  const ctx = context || {};
  const now = new Date();
  const factors = [];
  const interventions = [];
  let score = 0;

  const hired = toDate(employee.hire_date);
  const tenureYears = hired ? daysBetween(hired, now) / DEFAULT_PERIOD.YEAR_DAYS : 0;

  if (tenureYears < 1) {
    score += 15;
    factors.push({ key: 'short_tenure', points: 15, detail: '<1y' });
    interventions.push({ he: 'מנטור ליווי ל-90 יום', en: '90-day mentor' });
  } else if (tenureYears < 2) {
    score += 10;
    factors.push({ key: 'early_career', points: 10, detail: '1-2y' });
  }

  const roleMedian = Number(ctx.role_median_salary || 0);
  const salary = Number(employee.base_salary || 0);
  if (roleMedian && salary && salary < roleMedian) {
    const gap = (roleMedian - salary) / roleMedian;
    const pts = Math.min(25, Math.round(gap * 100));
    if (pts > 0) {
      score += pts;
      factors.push({ key: 'salary_below_median', points: pts, detail: `gap ${round4(gap)}` });
      interventions.push({ he: 'בדיקת שכר מול שוק', en: 'Salary benchmark review' });
    }
  }

  const otRatio = Number(employee.overtime_ratio || 0);
  if (otRatio > 0.3) {
    score += 15;
    factors.push({ key: 'high_overtime', points: 15, detail: round4(otRatio) });
    interventions.push({ he: 'איזון עומסים', en: 'Workload rebalancing' });
  }

  const absenceRt = Number(employee.absence_rate || 0);
  if (absenceRt > 0.1) {
    score += 10;
    factors.push({ key: 'high_absence', points: 10, detail: round4(absenceRt) });
  }

  const lastPromo = toDate(employee.last_promotion_at);
  if (lastPromo && daysBetween(lastPromo, now) > 3 * DEFAULT_PERIOD.YEAR_DAYS) {
    score += 15;
    factors.push({ key: 'no_promotion_3y', points: 15 });
    interventions.push({ he: 'שיחת קריירה', en: 'Career conversation' });
  } else if (!lastPromo && tenureYears > 3) {
    score += 15;
    factors.push({ key: 'no_promotion_ever', points: 15 });
    interventions.push({ he: 'שיחת קריירה', en: 'Career conversation' });
  }

  const trainHrs = Number(employee.training_hours_annual || 0);
  if (trainHrs < 10) {
    score += 10;
    factors.push({ key: 'low_training', points: 10, detail: trainHrs });
    interventions.push({ he: 'תוכנית הדרכה', en: 'Training plan' });
  }

  const perf = Number(employee.performance_score || 0);
  if (perf > 0 && perf < 3) {
    score += 15;
    factors.push({ key: 'low_performance', points: 15, detail: perf });
    interventions.push({ he: 'תוכנית שיפור ביצועים (PIP)', en: 'Performance improvement plan' });
  }

  if (employee.flight_risk_signal === true) {
    score += 15;
    factors.push({ key: 'flight_risk_signal', points: 15 });
    interventions.push({ he: 'שיחת שימור דחופה', en: 'Urgent retention conversation' });
  }

  const clamped = Math.max(0, Math.min(100, score));
  const band = clamped >= 70 ? 'high' : clamped >= 40 ? 'medium' : 'low';

  return {
    employee_id: employee.id,
    risk_score: clamped,
    band,
    factors,
    suggested_interventions: interventions,
  };
}

// ═══════════════════════════════════════════════════════════════
// ISRAELI-SPECIFIC: SEVERANCE (pitzuim) CALCULATION
// ═══════════════════════════════════════════════════════════════

/**
 * חוק פיצויי פיטורים — 1 last-month salary per year of service.
 * Partial years are pro-rated.
 *
 * @param {Object} employee - {hire_date, base_salary}
 * @param {Date|string} exitDate
 */
function severance(employee, exitDate) {
  if (!employee) return { amount: 0, years: 0, monthly_base: 0 };
  const hired = toDate(employee.hire_date);
  const exit = toDate(exitDate) || new Date();
  if (!hired || exit < hired) return { amount: 0, years: 0, monthly_base: 0 };

  const years = daysBetween(hired, exit) / DEFAULT_PERIOD.YEAR_DAYS;
  const monthly = Number(employee.base_salary || 0);
  const amount = monthly * years * ISRAELI_LABOR.SEVERANCE_MONTHS_PER_YEAR;

  return {
    label: LABELS.SEVERANCE,
    employee_id: employee.id,
    hire_date: hired.toISOString(),
    exit_date: exit.toISOString(),
    years: round2(years),
    monthly_base: round2(monthly),
    amount: round2(amount),
    law: 'חוק פיצויי פיטורים, תשכ״ג-1963',
  };
}

// ═══════════════════════════════════════════════════════════════
// ISRAELI-SPECIFIC: 106 FORM DATA (YTD comp summary)
// ═══════════════════════════════════════════════════════════════

/**
 * Produces the aggregate numbers that feed a Tofes 106 (טופס 106) form:
 * YTD gross, tax withheld, bituach leumi, health, pension (employee),
 * and study-fund employee contributions.
 *
 * This function is data-only — it never writes to disk.
 *
 * @param {Object} employee
 * @param {Number} year
 */
function form106(employee, year) {
  if (!employee) return null;
  const y = Number(year) || new Date().getUTCFullYear();
  const start = new Date(Date.UTC(y, 0, 1));
  const end = new Date(Date.UTC(y, 11, 31, 23, 59, 59));

  const rows = Array.isArray(employee.payroll_history)
    ? employee.payroll_history.filter((p) => inPeriod(p.period || p.date, start, end))
    : [];

  let gross = 0;
  let incomeTax = 0;
  let bituachEmployee = 0;
  let healthEmployee = 0;
  let pensionEmployee = 0;
  let studyFundEmployee = 0;

  for (const r of rows) {
    gross += Number(r.gross || 0);
    incomeTax += Number(r.income_tax || 0);
    bituachEmployee += Number(r.bituach_leumi_employee || 0);
    healthEmployee += Number(r.health_tax_employee || 0);
    pensionEmployee += Number(r.pension_employee || 0);
    studyFundEmployee += Number(r.study_fund_employee || 0);
  }

  const net =
    gross - incomeTax - bituachEmployee - healthEmployee - pensionEmployee - studyFundEmployee;

  return {
    form: '106',
    year: y,
    employee_id: employee.id,
    employee_tz: employee.teudat_zehut || null,
    totals: {
      gross_ytd: round2(gross),
      income_tax_withheld: round2(incomeTax),
      bituach_leumi_employee: round2(bituachEmployee),
      health_tax_employee: round2(healthEmployee),
      pension_employee: round2(pensionEmployee),
      study_fund_employee: round2(studyFundEmployee),
      net_ytd: round2(net),
    },
    payroll_rows_count: rows.length,
  };
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  // constants
  PRIVACY,
  ISRAELI_LABOR,
  LABELS,
  DEFAULT_PERIOD,

  // core reports
  headcountReport,
  turnoverAnalysis,
  timeToHire,
  timeToProductivity,
  costPerHire,
  totalComp,
  overtimeCostRatio,
  absenceRate,
  tenureHistogram,
  diversityDashboard,
  trainingHours,
  payEquityAudit,
  retentionRisk,

  // Israeli-specific
  severance,
  form106,

  // low-level helpers (exported for testing & composition)
  _internals: {
    round2,
    round4,
    safeDiv,
    toDate,
    daysBetween,
    inPeriod,
    isActiveAt,
    mean,
    stddev,
    groupBy,
    mapToObject,
    normalizePeriod,
    startOfMonth,
  },
};
