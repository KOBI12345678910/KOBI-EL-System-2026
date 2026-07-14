/**
 * SmartBuild Pilot 2.0 — Monte Carlo Engine
 *
 * Deterministic (seeded) simulation of project profit:
 *   cost   ~ Normal(FAC, costSigmaPct)
 *   revenue~ Normal(forecast revenue, priceSigmaPct)
 *   delay  ~ Triangular(0, delayMax/3, delayMax) months of extra
 *            interest on the current loan balance.
 */

'use strict';

const { TODAY } = require('../core/contracts');
const { computeBudget } = require('./budget-engine');
const { computeSales } = require('./sales-engine');
const { computeFinance } = require('./finance-engine');

/** PRNG דטרמיניסטי. */
function mulberry32(seedInt) {
  let a = seedInt >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalPair(rng) { // Box-Muller
  let u = 0; let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const r = Math.sqrt(-2 * Math.log(u));
  return [r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)];
}

function triangular(rng, min, mode, max) {
  const u = rng();
  const f = (mode - min) / (max - min || 1);
  return u < f
    ? min + Math.sqrt(u * (max - min) * (mode - min))
    : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

function runMonteCarlo(store, projectId, opts = {}) {
  const {
    runs = 2000, seed = 42, costSigmaPct = 8, priceSigmaPct = 6, delayMaxMonths = 9,
    asOf = TODAY,
  } = opts;

  const budget = computeBudget(store, projectId);
  const sales = computeSales(store, projectId, asOf);
  const finance = computeFinance(store, projectId, asOf);

  const baseCost = budget.totals.fac;
  const baseRevenue = sales.projectedRevenue;
  const loanBalance = finance ? finance.totals.balance : 0;
  const monthlyRate = finance && finance.loans.length
    ? finance.loans.reduce((a, l) => a + (l.interest_rate_annual || 0), 0) / finance.loans.length / 12
    : 0.005;

  const rng = mulberry32(seed);
  const profits = [];
  const margins = [];
  const draws = { cost: [], revenue: [], delay: [] };

  for (let i = 0; i < runs; i++) {
    const [z1, z2] = normalPair(rng);
    const cost = baseCost * (1 + (z1 * costSigmaPct) / 100);
    const revenue = baseRevenue * (1 + (z2 * priceSigmaPct) / 100);
    const delayMonths = triangular(rng, 0, delayMaxMonths / 3, delayMaxMonths);
    const delayCost = delayMonths * loanBalance * monthlyRate;
    const profit = revenue - cost - delayCost;
    profits.push(profit);
    margins.push(revenue ? (profit / revenue) * 100 : 0);
    draws.cost.push(cost);
    draws.revenue.push(revenue);
    draws.delay.push(delayCost);
  }

  const sorted = profits.slice().sort((a, b) => a - b);
  const sortedMargins = margins.slice().sort((a, b) => a - b);
  const mean = profits.reduce((a, v) => a + v, 0) / (profits.length || 1);

  // היסטוגרמה — 20 דליים
  const min = sorted[0] || 0;
  const max = sorted[sorted.length - 1] || 0;
  const bucketSize = (max - min) / 20 || 1;
  const histogram = Array.from({ length: 20 }, (_, i) => ({
    bucketStart: Math.round(min + i * bucketSize),
    bucketEnd: Math.round(min + (i + 1) * bucketSize),
    count: 0,
  }));
  for (const p of profits) {
    const idx = Math.min(19, Math.max(0, Math.floor((p - min) / bucketSize)));
    histogram[idx].count += 1;
  }

  // רגישות: תרומת כל גורם לשונות הרווח (קורלציה בריבוע, מנורמלת)
  const corr2 = (xs) => {
    const mx = xs.reduce((a, v) => a + v, 0) / xs.length;
    let cov = 0; let vx = 0; let vp = 0;
    for (let i = 0; i < xs.length; i++) {
      cov += (xs[i] - mx) * (profits[i] - mean);
      vx += (xs[i] - mx) ** 2;
      vp += (profits[i] - mean) ** 2;
    }
    return vx && vp ? (cov * cov) / (vx * vp) : 0;
  };
  const raw = { cost: corr2(draws.cost), price: corr2(draws.revenue), delay: corr2(draws.delay) };
  const rawSum = raw.cost + raw.price + raw.delay || 1;
  const drivers = {
    costImpact: Math.round((raw.cost / rawSum) * 100),
    priceImpact: Math.round((raw.price / rawSum) * 100),
    delayImpact: Math.round((raw.delay / rawSum) * 100),
  };

  const p50 = Math.round(pct(sorted, 50));
  return {
    runs, seed,
    profit: {
      p5: Math.round(pct(sorted, 5)), p25: Math.round(pct(sorted, 25)), p50,
      p75: Math.round(pct(sorted, 75)), p95: Math.round(pct(sorted, 95)),
      mean: Math.round(mean), min: Math.round(min), max: Math.round(max),
    },
    margin: {
      p5: Math.round(pct(sortedMargins, 5) * 100) / 100,
      p50: Math.round(pct(sortedMargins, 50) * 100) / 100,
      p95: Math.round(pct(sortedMargins, 95) * 100) / 100,
    },
    probLoss: Math.round((profits.filter((p) => p < 0).length / (profits.length || 1)) * 10000) / 100,
    probMarginBelow: Math.round((margins.filter((m) => m < 8).length / (margins.length || 1)) * 10000) / 100,
    var95: Math.round(p50 - pct(sorted, 5)),
    histogram,
    drivers,
  };
}

module.exports = { mulberry32, runMonteCarlo };
