/**
 * Real Estate Portfolio Dashboard — Aggregation Engine
 * Mega-ERP Techno-Kol Uzi 2026
 *
 * Agent Y-059 — aggregates all properties in the portfolio into a single
 * decision-grade view: value, equity, debt, rent roll, cash-flow, NOI,
 * cash-on-cash, concentration risk (HHI), debt amortization, vacancy
 * timeline, CapEx, and disposition math.
 *
 * Rule of the house: לא מוחקים רק משדרגים ומגדלים —
 * this file is additive. New capabilities extend the exports; existing
 * functions are never removed.
 *
 * Zero external dependencies. Pure functions. Node >= 18.
 *
 * Public API:
 *   aggregatePortfolio({ownerId})           — portfolio-wide totals
 *   performanceByProperty(period)           — ranked list (month / quarter / ytd)
 *   concentrationRisk()                     — HHI by city / type / tenant
 *   debtSchedule()                          — amortization per mortgage
 *   vacancyTimeline()                       — vacancy % per month
 *   capex()                                 — capital expenditures per property
 *   disposition({propertyId, projectedPrice, costs}) — net sale proceeds after IL tax
 *
 * Data shape (passed in via factory or setPortfolio()):
 *
 *   property = {
 *     id,
 *     ownerId,
 *     name_he, name_en,
 *     city, propertyType: 'apartment'|'commercial'|'office'|'retail'|'industrial'|'land',
 *     block, parcel,                       // גוש / חלקה
 *     purchaseDate, purchasePrice,
 *     currentValue,                        // last appraisal
 *     mortgages: [{
 *       id, bank, principal, balance, rate, termMonths, startDate, paymentMonthly
 *     }],
 *     units: [{
 *       id, sqm, tenant: {id, name} | null, monthlyRent, leaseStart, leaseEnd, vacant: bool
 *     }],
 *     monthlyExpenses: { management, maintenance, insurance, propertyTax, utilities, other },
 *     capex: [{ date, amount, category, description }],
 *     vacancyHistory: [{ yearMonth: '2026-01', vacancyPct: 0.05 }]
 *   }
 *
 * All amounts are ILS unless noted. Dates are ISO strings (YYYY-MM-DD).
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════
// Constants — Israeli tax & property defaults for disposition math
// ═══════════════════════════════════════════════════════════════════════

const TAX_CONSTANTS_2026 = Object.freeze({
  BETTERMENT_INDIVIDUAL: 0.25,                     // מס שבח יחיד
  BETTERMENT_COMPANY: 0.23,                        // מס שבח חברה
  BETTERMENT_LINEAR_BOUND: '2014-01-01',           // תיקון 76
  VAT: 0.18,                                       // מע"מ 2026
  BROKER_COMMISSION_DEFAULT: 0.02,                 // 2% עמלת תיווך
  LEGAL_FEES_DEFAULT: 0.005,                       // 0.5% שכר טרחה עו"ד
  CAPITAL_GAINS_REPORTING_DAYS: 40,                // סעיף 73
  DEFAULT_CAP_RATE: 0.055,                         // typical IL residential cap
});

const HEBREW_LABELS = Object.freeze({
  totalValue:       'שווי כולל',
  totalEquity:      'הון עצמי',
  totalDebt:        'חוב כולל',
  rentRoll:         'הכנסות שכירות חודשיות',
  monthlyExpenses:  'הוצאות חודשיות',
  noi:              'הכנסה נטו תפעולית',
  cashFlow:         'תזרים מזומנים',
  cashOnCash:       'תשואה על הון עצמי',
  capRate:          'תשואת היוון',
  occupancy:        'תפוסה',
  vacancy:          'אחוז פנויות',
  ltv:              'יחס מינוף',
  concentration:    'ריכוזיות',
  hhi:              'מדד הרפינדהל-הירשמן',
  properties:       'נכסים',
  mortgage:         'משכנתא',
  amortization:     'לוח סילוקין',
  disposition:      'מכירה / מימוש',
  netProceeds:      'תקבול נטו',
  betterment:       'מס שבח',
});

const ENGLISH_LABELS = Object.freeze({
  totalValue:       'Total Value',
  totalEquity:      'Total Equity',
  totalDebt:        'Total Debt',
  rentRoll:         'Monthly Rent Roll',
  monthlyExpenses:  'Monthly Expenses',
  noi:              'Net Operating Income',
  cashFlow:         'Cash Flow',
  cashOnCash:       'Cash-on-Cash Return',
  capRate:          'Cap Rate',
  occupancy:        'Occupancy',
  vacancy:          'Vacancy %',
  ltv:              'Loan to Value',
  concentration:    'Concentration',
  hhi:              'Herfindahl-Hirschman Index',
  properties:       'Properties',
  mortgage:         'Mortgage',
  amortization:     'Amortization Schedule',
  disposition:      'Disposition',
  netProceeds:      'Net Proceeds',
  betterment:       'Betterment Tax',
});

// ═══════════════════════════════════════════════════════════════════════
// In-memory portfolio store — replaced by DB adapter in production
// ═══════════════════════════════════════════════════════════════════════

let _portfolio = [];

/**
 * Inject the portfolio array (DB adapter, seed data, or test fixture).
 * Non-destructive — caller always passes the full list; we never mutate it.
 */
function setPortfolio(properties) {
  if (!Array.isArray(properties)) {
    throw new Error('setPortfolio: properties must be an array');
  }
  _portfolio = properties.map((p) => Object.freeze({ ...p }));
  return _portfolio.length;
}

function getPortfolio() {
  return _portfolio.slice();
}

// ═══════════════════════════════════════════════════════════════════════
// Utility helpers — pure, deterministic
// ═══════════════════════════════════════════════════════════════════════

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function round4(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

function sum(arr, fn) {
  let s = 0;
  for (const x of arr) s += Number(fn ? fn(x) : x) || 0;
  return s;
}

function parseDate(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function monthsBetween(a, b) {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return 0;
  return (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth());
}

function daysBetween(a, b) {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

/**
 * Sum all monthlyExpenses categories of a property (handles missing fields).
 */
function propertyMonthlyExpenses(p) {
  const e = p.monthlyExpenses || {};
  return round2(
    (e.management || 0) +
    (e.maintenance || 0) +
    (e.insurance || 0) +
    (e.propertyTax || 0) +
    (e.utilities || 0) +
    (e.other || 0),
  );
}

/**
 * Sum only the rent of units that are currently leased (non-vacant).
 */
function propertyRentRoll(p) {
  const units = Array.isArray(p.units) ? p.units : [];
  return round2(sum(units.filter((u) => !u.vacant), (u) => u.monthlyRent));
}

/**
 * Total potential (gross-possible) rent — assumes all units occupied.
 */
function propertyPotentialRent(p) {
  const units = Array.isArray(p.units) ? p.units : [];
  return round2(sum(units, (u) => u.monthlyRent));
}

/**
 * Sum of outstanding mortgage balances for a single property.
 */
function propertyDebt(p) {
  const mortgages = Array.isArray(p.mortgages) ? p.mortgages : [];
  return round2(sum(mortgages, (m) => m.balance));
}

/**
 * Sum of monthly debt service (principal + interest) for a single property.
 */
function propertyMonthlyDebtService(p) {
  const mortgages = Array.isArray(p.mortgages) ? p.mortgages : [];
  return round2(sum(mortgages, (m) => m.paymentMonthly));
}

/**
 * Occupancy percent for a single property — 1.0 = fully occupied.
 */
function propertyOccupancy(p) {
  const units = Array.isArray(p.units) ? p.units : [];
  if (!units.length) return 0;
  const occupied = units.filter((u) => !u.vacant).length;
  return round4(occupied / units.length);
}

// ═══════════════════════════════════════════════════════════════════════
// aggregatePortfolio({ownerId})
// Portfolio-wide KPIs — the headline numbers.
// ═══════════════════════════════════════════════════════════════════════

function aggregatePortfolio(params = {}) {
  const { ownerId } = params;
  const props = ownerId
    ? _portfolio.filter((p) => p.ownerId === ownerId)
    : _portfolio.slice();

  const totalValue = round2(sum(props, (p) => p.currentValue));
  const totalDebt = round2(sum(props, propertyDebt));
  const totalEquity = round2(totalValue - totalDebt);

  const monthlyRentRoll = round2(sum(props, propertyRentRoll));
  const potentialRent = round2(sum(props, propertyPotentialRent));
  const monthlyExpenses = round2(sum(props, propertyMonthlyExpenses));
  const monthlyDebtService = round2(sum(props, propertyMonthlyDebtService));

  // NOI = rent roll − operating expenses (debt service excluded)
  const monthlyNOI = round2(monthlyRentRoll - monthlyExpenses);
  const annualNOI = round2(monthlyNOI * 12);

  // Cash flow = NOI − debt service
  const monthlyCashFlow = round2(monthlyNOI - monthlyDebtService);
  const annualCashFlow = round2(monthlyCashFlow * 12);

  // Cash-on-cash = annual cash flow / equity invested
  const cashOnCash = totalEquity > 0 ? round4(annualCashFlow / totalEquity) : 0;

  // Cap rate = annual NOI / total value
  const capRate = totalValue > 0 ? round4(annualNOI / totalValue) : 0;

  // LTV = debt / value
  const ltv = totalValue > 0 ? round4(totalDebt / totalValue) : 0;

  // Occupancy = leased-unit-rent / potential-rent (rent-weighted)
  const occupancy = potentialRent > 0 ? round4(monthlyRentRoll / potentialRent) : 0;
  const vacancyPct = round4(1 - occupancy);

  // Unit count
  const totalUnits = sum(props, (p) => (Array.isArray(p.units) ? p.units.length : 0));
  const occupiedUnits = sum(
    props,
    (p) => (Array.isArray(p.units) ? p.units.filter((u) => !u.vacant).length : 0),
  );

  return {
    ownerId: ownerId || null,
    propertyCount: props.length,
    unitCount: totalUnits,
    occupiedUnitCount: occupiedUnits,
    totalValue,
    totalDebt,
    totalEquity,
    ltv,
    monthlyRentRoll,
    potentialRent,
    monthlyExpenses,
    monthlyDebtService,
    monthlyNOI,
    annualNOI,
    monthlyCashFlow,
    annualCashFlow,
    cashOnCash,
    capRate,
    occupancy,
    vacancyPct,
    labels: { he: HEBREW_LABELS, en: ENGLISH_LABELS },
    meta: {
      engine: 'portfolio-dashboard',
      version: '1.0.0',
      currency: 'ILS',
      computedAt: new Date().toISOString(),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
// performanceByProperty(period)
// Ranked list of each property's performance — sorted by NOI desc.
// ═══════════════════════════════════════════════════════════════════════

function performanceByProperty(period = 'month') {
  const multiplier = period === 'ytd' ? 12 : period === 'quarter' ? 3 : 1;

  const rows = _portfolio.map((p) => {
    const rent = propertyRentRoll(p);
    const potential = propertyPotentialRent(p);
    const expenses = propertyMonthlyExpenses(p);
    const debtService = propertyMonthlyDebtService(p);
    const noi = round2(rent - expenses);
    const cashFlow = round2(noi - debtService);
    const value = Number(p.currentValue) || 0;
    const debt = propertyDebt(p);
    const equity = round2(value - debt);
    const capRate = value > 0 ? round4((noi * 12) / value) : 0;
    const cashOnCash = equity > 0 ? round4((cashFlow * 12) / equity) : 0;
    const occupancy = potential > 0 ? round4(rent / potential) : propertyOccupancy(p);

    return {
      id: p.id,
      name_he: p.name_he,
      name_en: p.name_en,
      city: p.city,
      propertyType: p.propertyType,
      value,
      equity,
      debt,
      rentRoll: round2(rent * multiplier),
      expenses: round2(expenses * multiplier),
      noi: round2(noi * multiplier),
      cashFlow: round2(cashFlow * multiplier),
      capRate,
      cashOnCash,
      occupancy,
      period,
    };
  });

  rows.sort((a, b) => b.noi - a.noi);
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

// ═══════════════════════════════════════════════════════════════════════
// concentrationRisk()
// HHI = Σ (share_i)² over 0..10_000
//   • < 1500 = unconcentrated
//   • 1500-2500 = moderate
//   • > 2500 = high concentration
// Computed separately by city, property type, and tenant (by rent share).
// ═══════════════════════════════════════════════════════════════════════

function concentrationRisk() {
  const totalValue = sum(_portfolio, (p) => p.currentValue);
  const totalRent = sum(_portfolio, propertyRentRoll);

  // ─── by city (value-weighted) ─────────────────────────────────
  const byCityValue = {};
  for (const p of _portfolio) {
    const key = p.city || 'לא ידוע';
    byCityValue[key] = (byCityValue[key] || 0) + (Number(p.currentValue) || 0);
  }
  const cityBuckets = Object.entries(byCityValue)
    .map(([city, value]) => ({
      key: city,
      value: round2(value),
      share: totalValue > 0 ? round4(value / totalValue) : 0,
    }))
    .sort((a, b) => b.value - a.value);
  const cityHHI = Math.round(sum(cityBuckets, (b) => Math.pow(b.share * 100, 2)));

  // ─── by property type (value-weighted) ────────────────────────
  const byTypeValue = {};
  for (const p of _portfolio) {
    const key = p.propertyType || 'other';
    byTypeValue[key] = (byTypeValue[key] || 0) + (Number(p.currentValue) || 0);
  }
  const typeBuckets = Object.entries(byTypeValue)
    .map(([type, value]) => ({
      key: type,
      value: round2(value),
      share: totalValue > 0 ? round4(value / totalValue) : 0,
    }))
    .sort((a, b) => b.value - a.value);
  const typeHHI = Math.round(sum(typeBuckets, (b) => Math.pow(b.share * 100, 2)));

  // ─── by tenant (rent-weighted) ───────────────────────────────
  const byTenantRent = {};
  for (const p of _portfolio) {
    const units = Array.isArray(p.units) ? p.units : [];
    for (const u of units) {
      if (u.vacant || !u.tenant) continue;
      const key = u.tenant.name || u.tenant.id || 'לא ידוע';
      byTenantRent[key] = (byTenantRent[key] || 0) + (Number(u.monthlyRent) || 0);
    }
  }
  const tenantBuckets = Object.entries(byTenantRent)
    .map(([tenant, rent]) => ({
      key: tenant,
      rent: round2(rent),
      share: totalRent > 0 ? round4(rent / totalRent) : 0,
    }))
    .sort((a, b) => b.rent - a.rent);
  const tenantHHI = Math.round(sum(tenantBuckets, (b) => Math.pow(b.share * 100, 2)));

  function classify(hhi) {
    if (hhi < 1500) return { level: 'low', he: 'ריכוזיות נמוכה', en: 'Low concentration' };
    if (hhi < 2500) return { level: 'moderate', he: 'ריכוזיות בינונית', en: 'Moderate concentration' };
    return { level: 'high', he: 'ריכוזיות גבוהה', en: 'High concentration' };
  }

  return {
    byCity: {
      buckets: cityBuckets,
      hhi: cityHHI,
      classification: classify(cityHHI),
    },
    byType: {
      buckets: typeBuckets,
      hhi: typeHHI,
      classification: classify(typeHHI),
    },
    byTenant: {
      buckets: tenantBuckets,
      hhi: tenantHHI,
      classification: classify(tenantHHI),
    },
    formula: {
      he: 'HHI = Σ (חלק_i × 100)² ,  תחום [0, 10,000]',
      en: 'HHI = Σ (share_i × 100)² ,  range [0, 10,000]',
      thresholds: { low: 1500, high: 2500 },
    },
    meta: {
      engine: 'portfolio-dashboard',
      version: '1.0.0',
      computedAt: new Date().toISOString(),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
// debtSchedule() — amortization for every mortgage across the portfolio
// Standard fixed-rate amortization formula:
//   payment = P × (r × (1+r)^n) / ((1+r)^n − 1)
// Where r = monthly rate, n = remaining months, P = balance.
// ═══════════════════════════════════════════════════════════════════════

function amortize(balance, annualRate, termMonths, paymentMonthly) {
  const monthlyRate = (Number(annualRate) || 0) / 12;
  const n = Math.max(1, Math.floor(Number(termMonths) || 0));
  let payment = Number(paymentMonthly);
  if (!payment || payment <= 0) {
    // derive payment if not supplied
    if (monthlyRate === 0) {
      payment = balance / n;
    } else {
      const f = Math.pow(1 + monthlyRate, n);
      payment = (balance * (monthlyRate * f)) / (f - 1);
    }
  }

  const rows = [];
  let remaining = Number(balance) || 0;
  let totalInterest = 0;
  let totalPrincipal = 0;

  for (let i = 1; i <= n; i++) {
    const interest = round2(remaining * monthlyRate);
    let principal = round2(payment - interest);
    if (principal > remaining) principal = remaining;
    remaining = round2(remaining - principal);
    totalInterest = round2(totalInterest + interest);
    totalPrincipal = round2(totalPrincipal + principal);
    rows.push({
      month: i,
      payment: round2(principal + interest),
      principal,
      interest,
      balance: remaining,
    });
    if (remaining <= 0) break;
  }

  return {
    payment: round2(payment),
    totalInterest,
    totalPrincipal,
    months: rows.length,
    rows,
  };
}

function debtSchedule() {
  const mortgages = [];
  for (const p of _portfolio) {
    const list = Array.isArray(p.mortgages) ? p.mortgages : [];
    for (const m of list) {
      const am = amortize(m.balance, m.rate, m.termMonths, m.paymentMonthly);
      mortgages.push({
        propertyId: p.id,
        propertyName_he: p.name_he,
        propertyName_en: p.name_en,
        mortgageId: m.id,
        bank: m.bank,
        principal: round2(m.principal),
        balance: round2(m.balance),
        rate: m.rate,
        termMonths: m.termMonths,
        startDate: m.startDate,
        paymentMonthly: am.payment,
        totalInterest: am.totalInterest,
        totalPrincipal: am.totalPrincipal,
        schedule: am.rows,
      });
    }
  }

  const totals = {
    count: mortgages.length,
    totalBalance: round2(sum(mortgages, (m) => m.balance)),
    totalMonthlyPayment: round2(sum(mortgages, (m) => m.paymentMonthly)),
    totalInterestRemaining: round2(sum(mortgages, (m) => m.totalInterest)),
    weightedAvgRate:
      mortgages.length && sum(mortgages, (m) => m.balance) > 0
        ? round4(
          sum(mortgages, (m) => m.balance * m.rate) /
          sum(mortgages, (m) => m.balance),
        )
        : 0,
  };

  return { mortgages, totals };
}

// ═══════════════════════════════════════════════════════════════════════
// vacancyTimeline() — portfolio-weighted monthly vacancy %
// Combines each property's vacancyHistory[] into a single series.
// Each property contributes weighted by its unit count.
// ═══════════════════════════════════════════════════════════════════════

function vacancyTimeline() {
  const months = {};
  const weights = {};

  for (const p of _portfolio) {
    const units = Array.isArray(p.units) ? p.units.length : 1;
    const history = Array.isArray(p.vacancyHistory) ? p.vacancyHistory : [];
    for (const h of history) {
      const ym = h.yearMonth;
      if (!ym) continue;
      months[ym] = (months[ym] || 0) + ((Number(h.vacancyPct) || 0) * units);
      weights[ym] = (weights[ym] || 0) + units;
    }
  }

  const series = Object.keys(months)
    .sort()
    .map((ym) => ({
      yearMonth: ym,
      vacancyPct: weights[ym] > 0 ? round4(months[ym] / weights[ym]) : 0,
    }));

  // current-state fallback (if no history): single point from live occupancy
  if (series.length === 0 && _portfolio.length > 0) {
    const totalRent = sum(_portfolio, propertyRentRoll);
    const potential = sum(_portfolio, propertyPotentialRent);
    const vacancy = potential > 0 ? round4(1 - totalRent / potential) : 0;
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    series.push({ yearMonth: ym, vacancyPct: vacancy });
  }

  const values = series.map((s) => s.vacancyPct);
  const avg = values.length ? round4(values.reduce((a, b) => a + b, 0) / values.length) : 0;
  const peak = values.length ? round4(Math.max(...values)) : 0;
  const trough = values.length ? round4(Math.min(...values)) : 0;

  return {
    series,
    stats: { avg, peak, trough, count: values.length },
    meta: {
      engine: 'portfolio-dashboard',
      version: '1.0.0',
      computedAt: new Date().toISOString(),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
// capex() — capital expenditures per property, with YTD / LTM totals
// ═══════════════════════════════════════════════════════════════════════

function capex() {
  const now = new Date();
  const ytdStart = new Date(now.getFullYear(), 0, 1);
  const ltmStart = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

  const properties = _portfolio.map((p) => {
    const items = Array.isArray(p.capex) ? p.capex : [];
    const lifetime = round2(sum(items, (c) => c.amount));
    const ytd = round2(
      sum(items.filter((c) => parseDate(c.date) && parseDate(c.date) >= ytdStart), (c) => c.amount),
    );
    const ltm = round2(
      sum(items.filter((c) => parseDate(c.date) && parseDate(c.date) >= ltmStart), (c) => c.amount),
    );
    return {
      propertyId: p.id,
      name_he: p.name_he,
      name_en: p.name_en,
      city: p.city,
      itemCount: items.length,
      lifetime,
      ytd,
      ltm,
      items: items.slice(),
    };
  });

  const totals = {
    lifetime: round2(sum(properties, (p) => p.lifetime)),
    ytd: round2(sum(properties, (p) => p.ytd)),
    ltm: round2(sum(properties, (p) => p.ltm)),
    count: sum(properties, (p) => p.itemCount),
  };

  return { properties, totals };
}

// ═══════════════════════════════════════════════════════════════════════
// disposition({propertyId, projectedPrice, costs}) — net sale proceeds
// Simplified (vs. betterment-tax.js engine): lets the portfolio page run
// what-if scenarios without pulling the full מס שבח module. Falls back to
// plain 25% (individual) on the projected gain.
// ═══════════════════════════════════════════════════════════════════════

function disposition(params = {}) {
  const { propertyId, projectedPrice, costs = {} } = params;
  if (!propertyId) throw new Error('disposition: propertyId is required');
  if (typeof projectedPrice !== 'number') {
    throw new Error('disposition: projectedPrice must be a number');
  }
  const p = _portfolio.find((x) => x.id === propertyId);
  if (!p) throw new Error(`disposition: property ${propertyId} not found`);

  const purchase = Number(p.purchasePrice) || 0;
  const improvements = Array.isArray(p.capex) ? sum(p.capex, (c) => c.amount) : 0;
  const expenses = Number(costs.legalFees || 0) + Number(costs.other || 0);

  // Broker + legal — inherit defaults if not provided
  const brokerPct = typeof costs.brokerCommissionPct === 'number'
    ? costs.brokerCommissionPct
    : TAX_CONSTANTS_2026.BROKER_COMMISSION_DEFAULT;
  const legalPct = typeof costs.legalFeesPct === 'number'
    ? costs.legalFeesPct
    : TAX_CONSTANTS_2026.LEGAL_FEES_DEFAULT;
  const broker = round2(projectedPrice * brokerPct);
  const legal = round2(projectedPrice * legalPct);

  // Nominal gain (betterment base) — improvements + purchase + expenses subtracted
  const gain = round2(projectedPrice - purchase - improvements - expenses);
  const bettermentRate =
    (costs.sellerType || 'individual') === 'company'
      ? TAX_CONSTANTS_2026.BETTERMENT_COMPANY
      : TAX_CONSTANTS_2026.BETTERMENT_INDIVIDUAL;
  const bettermentTax = round2(Math.max(0, gain) * bettermentRate);

  // Outstanding debt at closing — uses current balance
  const outstandingDebt = propertyDebt(p);

  // Net proceeds = price − broker − legal − betterment − debt payoff
  const netProceeds = round2(
    projectedPrice - broker - legal - bettermentTax - outstandingDebt,
  );

  // Return on sale, over equity currently in the property
  const equity = round2((Number(p.currentValue) || 0) - outstandingDebt);
  const returnOnSale = equity > 0 ? round4((netProceeds - equity) / equity) : 0;

  return {
    propertyId,
    name_he: p.name_he,
    name_en: p.name_en,
    projectedPrice: round2(projectedPrice),
    purchase,
    improvements: round2(improvements),
    expenses: round2(expenses),
    broker,
    legal,
    gain,
    bettermentRate,
    bettermentTax,
    outstandingDebt,
    netProceeds,
    equity,
    returnOnSale,
    notes: {
      he:
        'חישוב מפושט: מס שבח 25% ליחיד / 23% לחברה על הרווח הנומינלי. ' +
        'לחישוב מלא כולל CPI ופטורים — השתמש ב־betterment-tax.js.',
      en:
        'Simplified: 25% individual / 23% company on nominal gain. ' +
        'For full CPI + exemptions path call betterment-tax.js.',
    },
    meta: {
      engine: 'portfolio-dashboard',
      version: '1.0.0',
      computedAt: new Date().toISOString(),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  // Data ingest
  setPortfolio,
  getPortfolio,
  // KPIs
  aggregatePortfolio,
  performanceByProperty,
  concentrationRisk,
  debtSchedule,
  vacancyTimeline,
  capex,
  disposition,
  // Constants (read-only)
  TAX_CONSTANTS_2026,
  HEBREW_LABELS,
  ENGLISH_LABELS,
  // Internal helpers exposed for testing
  _internals: {
    round2,
    round4,
    sum,
    parseDate,
    monthsBetween,
    daysBetween,
    propertyRentRoll,
    propertyPotentialRent,
    propertyMonthlyExpenses,
    propertyDebt,
    propertyMonthlyDebtService,
    propertyOccupancy,
    amortize,
  },
};
