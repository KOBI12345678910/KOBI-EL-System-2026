/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ONYX AI — Seasonality Decomposition Tests (Agent Y-155)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Run (mirrors the sibling test/event-store.test.ts convention):
 *   TS_NODE_TRANSPILE_ONLY=true npx node --test --require ts-node/register test/seasonality/seasonality.test.ts
 *
 * Covers:
 *   - Math helpers (mean, variance, autocorrelation, movingAverage)
 *   - Period detection (weekly / monthly / yearly)
 *   - Classical additive decomposition (pure synthetic fixtures)
 *   - Hebrew calendar bundled + injected overrides
 *   - Bilingual report formatting
 *   - Error paths (empty input, bad period)
 *
 * Zero dependencies: uses only Node's builtin `node:test` and `node:assert`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  mean,
  variance,
  autocorrelation,
  movingAverage,
  detectPeriods,
  chooseBestPeriod,
  decompose,
  computeSeasonalPattern,
  bundledHebrewCalendar,
  toTimeSeries,
  renderBilingualReport,
  toDate,
  formatYmd,
  type TimeSeriesPoint,
  type HebrewHolidayFlags,
} from '../../src/seasonality/seasonality';

/* ──────────────────────────────────────────────────────────────────────────
 * Synthetic data generators
 * ────────────────────────────────────────────────────────────────────────── */

/** Deterministic LCG — makes tests reproducible without `seedrandom`. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

/** y = 10 + 0.3*t + 5*sin(2πt/7) + noise */
function syntheticWeekly(n: number, seed = 42): number[] {
  const rnd = lcg(seed);
  const out: number[] = [];
  for (let t = 0; t < n; t++) {
    const trend = 10 + 0.3 * t;
    const season = 5 * Math.sin((2 * Math.PI * t) / 7);
    const noise = (rnd() - 0.5) * 0.5;
    out.push(trend + season + noise);
  }
  return out;
}

/** y = 100 + 10*sin(2πt/30) + small noise — pure monthly signal. */
function syntheticMonthly(n: number, seed = 7): number[] {
  const rnd = lcg(seed);
  const out: number[] = [];
  for (let t = 0; t < n; t++) {
    out.push(100 + 10 * Math.sin((2 * Math.PI * t) / 30) + (rnd() - 0.5) * 0.2);
  }
  return out;
}

function syntheticFlat(n: number, v = 5): number[] {
  return new Array(n).fill(v);
}

function toPoints(values: readonly number[], startDate = '2026-01-01'): TimeSeriesPoint[] {
  const start = new Date(startDate);
  return values.map((v, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d, value: v };
  });
}

/* ──────────────────────────────────────────────────────────────────────────
 * Helper tests
 * ────────────────────────────────────────────────────────────────────────── */

test('01 — mean and variance of small array', () => {
  const xs = [2, 4, 4, 4, 5, 5, 7, 9];
  assert.equal(mean(xs), 5);
  assert.ok(Math.abs(variance(xs) - 4) < 1e-9, `variance=${variance(xs)}`);
});

test('02 — mean of empty array is 0 (defensive, no crash)', () => {
  assert.equal(mean([]), 0);
  assert.equal(variance([]), 0);
});

test('03 — autocorrelation of perfect 7-day sine is ~1 at lag 7', () => {
  const xs = [];
  for (let t = 0; t < 84; t++) xs.push(Math.sin((2 * Math.PI * t) / 7));
  const acf7 = autocorrelation(xs, 7);
  assert.ok(acf7 > 0.9, `acf7=${acf7}`);
  // And should be NEAR zero at a mismatched odd lag like 3
  const acf3 = autocorrelation(xs, 3);
  assert.ok(Math.abs(acf3) < Math.abs(acf7), `acf3=${acf3} acf7=${acf7}`);
});

test('04 — autocorrelation guards: lag>=n and zero-variance', () => {
  assert.equal(autocorrelation([1, 2, 3], 5), 0);
  assert.equal(autocorrelation([2, 2, 2, 2], 1), 0);
});

test('05 — movingAverage (odd window) centered correctly', () => {
  const xs = [1, 2, 3, 4, 5, 6, 7];
  const ma = movingAverage(xs, 3);
  assert.equal(ma[0], null);
  assert.equal(ma[1], 2); // (1+2+3)/3
  assert.equal(ma[2], 3); // (2+3+4)/3
  assert.equal(ma[5], 6); // (5+6+7)/3
  assert.equal(ma[6], null);
});

test('06 — movingAverage (even window, Cleveland 2xk centering)', () => {
  const xs = [1, 2, 3, 4, 5, 6, 7, 8];
  const ma = movingAverage(xs, 4);
  // index 2 → 0.5*xs[0] + xs[1]+xs[2]+xs[3] + 0.5*xs[4] all /4
  const expected2 = (0.5 * 1 + 2 + 3 + 0.5 * 5) / 4 + 1.5; // direct formula check below
  // Formula in the module: (0.5*x[i-half] + 0.5*x[i+half] + sum(x[i-half+1..i+half-1])) / w
  const manual2 = (0.5 * xs[0] + 0.5 * xs[4] + xs[1] + xs[2] + xs[3]) / 4;
  assert.equal(ma[0], null);
  assert.equal(ma[1], null);
  assert.ok(Math.abs((ma[2] as number) - manual2) < 1e-9);
  assert.equal(ma[7], null);
  void expected2; // lint calm
});

/* ──────────────────────────────────────────────────────────────────────────
 * Period detection tests
 * ────────────────────────────────────────────────────────────────────────── */

test('07 — detectPeriods on weekly signal ranks lag=7 at the top', () => {
  const xs = syntheticWeekly(120);
  const cands = detectPeriods(xs);
  assert.ok(cands.length > 0);
  assert.equal(cands[0].lag, 7);
  assert.equal(cands[0].label, 'weekly');
  assert.ok(cands[0].acf > 0.5, `weekly acf=${cands[0].acf}`);
});

test('08 — chooseBestPeriod picks 30 for a clean monthly signal', () => {
  const xs = syntheticMonthly(180);
  const { period, candidates } = chooseBestPeriod(xs, { candidateLags: [7, 14, 30, 60] });
  assert.equal(period, 30);
  const monthlyCand = candidates.find((c) => c.lag === 30);
  assert.ok(monthlyCand);
  assert.ok(monthlyCand!.acf > 0.5);
});

test('09 — chooseBestPeriod falls back to weekly on noise-only data', () => {
  const rnd = lcg(1);
  const xs: number[] = [];
  for (let i = 0; i < 40; i++) xs.push(rnd() * 10);
  const { period } = chooseBestPeriod(xs, { minAcf: 0.99 });
  assert.equal(period, 7);
});

/* ──────────────────────────────────────────────────────────────────────────
 * Core decomposition tests
 * ────────────────────────────────────────────────────────────────────────── */

test('10 — decompose reconstructs Y = trend + seasonal + residual (identity)', () => {
  const xs = syntheticWeekly(56);
  const pts = toPoints(xs, '2026-01-01');
  const rep = decompose(pts);
  // For every point where trend is non-null, observed should equal t+s+r exactly.
  for (const p of rep.points) {
    if (p.trend !== null && p.residual !== null) {
      const sum = p.trend + p.seasonal + p.residual;
      assert.ok(Math.abs(sum - p.observed) < 1e-9, `identity broken at i=${p.index}: ${sum} vs ${p.observed}`);
    }
  }
});

test('11 — decompose on weekly signal: seasonalPattern sums to ~0 (normalization)', () => {
  const xs = syntheticWeekly(70);
  const rep = decompose(toPoints(xs), { period: 7 });
  const s = rep.seasonalPattern.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(s) < 1e-9, `pattern sum=${s}`);
  assert.equal(rep.seasonalPattern.length, 7);
});

test('12 — decompose strength: weekly signal has seasonal >> residual', () => {
  const xs = syntheticWeekly(140);
  const rep = decompose(toPoints(xs), { period: 7 });
  assert.ok(rep.strength.seasonal > rep.strength.residual, `s=${rep.strength.seasonal} r=${rep.strength.residual}`);
  assert.ok(rep.strength.trend > 0, `trend=${rep.strength.trend}`);
});

test('13 — decompose on flat series: seasonal and residual collapse to 0', () => {
  const xs = syntheticFlat(30, 5);
  const rep = decompose(toPoints(xs), { period: 7 });
  // Seasonal pattern should be all zeros (no variation to explain)
  for (const s of rep.seasonalPattern) assert.ok(Math.abs(s) < 1e-9);
  // Non-edge residuals should be zero
  for (const p of rep.points) {
    if (p.residual !== null) assert.ok(Math.abs(p.residual) < 1e-9);
  }
});

test('14 — decompose throws on empty input', () => {
  assert.throws(() => decompose([]), /non-empty/);
});

test('15 — decompose throws on period < 2', () => {
  assert.throws(() => decompose(toPoints([1, 2, 3, 4, 5]), { period: 1 }), /period/);
});

test('16 — computeSeasonalPattern handles nulls at the edges', () => {
  const detrended = [null, null, 1, -1, 1, -1, null, null];
  const sp = computeSeasonalPattern(detrended, 2);
  assert.equal(sp.length, 2);
  // pattern is normalized to zero-sum
  const s = sp.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(s) < 1e-9);
});

/* ──────────────────────────────────────────────────────────────────────────
 * Hebrew calendar tests
 * ────────────────────────────────────────────────────────────────────────── */

test('17 — bundled calendar flags Rosh HaShana 5786 (2025-09-23) as roshHaShana', () => {
  const d = new Date(Date.UTC(2025, 8, 23));
  const flags = bundledHebrewCalendar(d);
  assert.equal(flags.roshHaShana, true);
  assert.equal(flags.anyHoliday, true);
});

test('18 — bundled calendar flags Pesach 5786 start and chol hamoed day', () => {
  // Pesach 5786 Nissan 15 = 2026-04-02 (first day yom tov)
  const start = new Date(Date.UTC(2026, 3, 2));
  const flagsStart = bundledHebrewCalendar(start);
  assert.equal(flagsStart.pesach, true);
  assert.notEqual(flagsStart.cholHamoedPesach, true);

  // Day +2 = Nissan 17 = 2026-04-04 should be chol hamoed
  const chol = new Date(Date.UTC(2026, 3, 4));
  const flagsChol = bundledHebrewCalendar(chol);
  assert.equal(flagsChol.pesach, true);
  assert.equal(flagsChol.cholHamoedPesach, true);
  assert.equal(flagsChol.cholHamoed, true);
});

test('19 — bundled calendar flags Sukkot 5786 (Tishrei 15 = 2025-10-07)', () => {
  const first = new Date(Date.UTC(2025, 9, 7));
  const flags = bundledHebrewCalendar(first);
  assert.equal(flags.sukkot, true);
  // Second day of Sukkot → chol hamoed under our (7-day) model
  const chol = new Date(Date.UTC(2025, 9, 8));
  const flagsChol = bundledHebrewCalendar(chol);
  assert.equal(flagsChol.cholHamoedSukkot, true);
});

test('20 — bundled calendar returns empty for a non-holiday weekday', () => {
  const d = new Date(Date.UTC(2026, 0, 15));
  const flags = bundledHebrewCalendar(d);
  assert.equal(flags.anyHoliday, undefined);
  assert.equal(flags.pesach, undefined);
});

test('21 — custom injected calendar overrides the bundled one', () => {
  const custom = (d: Date): HebrewHolidayFlags => {
    if (d.getUTCFullYear() === 2099) return { roshHaShana: true, anyHoliday: true };
    return {};
  };
  const pts = toPoints([1, 2, 3, 4, 5, 6, 7, 8], '2099-06-01');
  const rep = decompose(pts, { period: 7, hebrewCalendar: custom });
  for (const p of rep.points) {
    assert.equal(p.holidayFlags.roshHaShana, true);
  }
});

test('22 — decompose surfaces holidayImpact averages correctly', () => {
  // Build a window that includes Pesach 5786 (2026-04-02) and surrounding days.
  // Use distinct value=100 on holidays, value=1 otherwise, custom calendar.
  const values: number[] = [];
  const dates: Date[] = [];
  // 21-day window starting 2026-03-30 so it covers Pesach Apr 2-8
  for (let i = 0; i < 21; i++) {
    const d = new Date(Date.UTC(2026, 2, 30));
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(d);
  }
  const cal = bundledHebrewCalendar;
  for (const d of dates) {
    const f = cal(d);
    values.push(f.pesach ? 100 : 1);
  }
  const pts: TimeSeriesPoint[] = dates.map((d, i) => ({ date: d, value: values[i] }));
  const rep = decompose(pts, { period: 7 });
  assert.ok(rep.holidayImpact.pesach >= 99, `pesach impact=${rep.holidayImpact.pesach}`);
  assert.ok(rep.holidayImpact.anyHoliday >= 99);
});

/* ──────────────────────────────────────────────────────────────────────────
 * Bilingual / reporting
 * ────────────────────────────────────────────────────────────────────────── */

test('23 — report messages contain both Hebrew and English', () => {
  const xs = syntheticWeekly(42);
  const rep = decompose(toPoints(xs));
  assert.ok(rep.messages.length >= 2);
  for (const m of rep.messages) {
    assert.ok(typeof m.he === 'string' && m.he.length > 0);
    assert.ok(typeof m.en === 'string' && m.en.length > 0);
  }
  const hePattern = /[א-ת]/;
  assert.ok(hePattern.test(rep.messages[0].he), 'Hebrew text expected');
});

test('24 — renderBilingualReport emits HE and EN lines', () => {
  const xs = syntheticWeekly(35);
  const rep = decompose(toPoints(xs));
  const text = renderBilingualReport(rep);
  assert.ok(text.includes('HE:'));
  assert.ok(text.includes('EN:'));
  assert.ok(text.includes('Seasonality Report'));
});

/* ──────────────────────────────────────────────────────────────────────────
 * Utility / misc tests
 * ────────────────────────────────────────────────────────────────────────── */

test('25 — toTimeSeries zips arrays, refuses mismatched lengths', () => {
  const ts = toTimeSeries(['2026-01-01', '2026-01-02'], [10, 20]);
  assert.equal(ts.length, 2);
  assert.equal(ts[0].value, 10);
  assert.throws(() => toTimeSeries(['2026-01-01'], [1, 2]), /align/);
});

test('26 — toDate accepts Date, ISO string, and rejects garbage as undefined', () => {
  assert.ok(toDate(new Date('2026-04-11')) instanceof Date);
  assert.ok(toDate('2026-04-11') instanceof Date);
  assert.equal(toDate('garbage-not-a-date'), undefined);
  assert.equal(toDate(undefined), undefined);
});

test('27 — formatYmd is UTC-stable and zero-padded', () => {
  const d = new Date(Date.UTC(2026, 3, 1));
  assert.equal(formatYmd(d), '2026-04-01');
});

test('28 — integration: weekly decomposition exposes 7-long seasonal pattern and 100%+ period signal', () => {
  const xs = syntheticWeekly(84);
  const rep = decompose(toPoints(xs));
  assert.equal(rep.period, 7);
  assert.equal(rep.seasonalPattern.length, 7);
  // At least one non-edge point has a non-null trend
  assert.ok(rep.points.some((p) => p.trend !== null));
  // detectedPeriods list contains lag 7
  assert.ok(rep.detectedPeriods.some((c) => c.lag === 7));
});
