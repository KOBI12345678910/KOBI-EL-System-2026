/**
 * Anomaly Detector — Unit Tests
 * Techno-Kol Uzi mega-ERP / Agent 100
 *
 * Run with:  node --test test/payroll/anomaly-detector.test.js
 *
 * 20+ test cases covering every statistical method in the detector.
 * Uses only the Node built-in test runner — zero external deps.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  detectAnomalies,
  analyzeAgainstBenford,
  findDuplicates,
  computeZScore,
  movingAverageAnomaly,
  mean,
  variance,
  stdev,
  median,
  quartile,
  firstSignificantDigit,
  vendorSimilarity,
  normalizeVendor,
  levenshtein,
  haversineKm,
  isRoundAmount,
  clampSeverity,
  detectZScore,
  detectIQR,
  detectDuplicates,
  detectRoundAmounts,
  detectTimeOfDay,
  detectVelocity,
  detectGeographic,
  detectBenford,
  detectMovingAverage,
  detectSeasonal,
  DEFAULTS,
} = require(path.resolve(__dirname, '..', '..', 'src', 'ml', 'anomaly-detector.js'));

// ─────────────────────────────────────────────────────────────
// Synthetic data helpers
// ─────────────────────────────────────────────────────────────

function tx(id, vendor, category, amount, date, extra = {}) {
  return Object.assign(
    {
      id,
      vendor,
      category,
      amount,
      currency: 'ILS',
      date,
    },
    extra
  );
}

function makeNormalHistory(vendor, category, base, n, startDate = '2026-01-01') {
  const out = [];
  const start = new Date(startDate).getTime();
  for (let i = 0; i < n; i++) {
    const d = new Date(start + i * 86400000).toISOString().slice(0, 10);
    // deterministic "jitter" around the base value
    const jitter = ((i * 37) % 11) - 5; // -5..+5
    out.push(tx(`${vendor}-${i}`, vendor, category, base + jitter, d));
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// 1. Pure stats sanity
// ═══════════════════════════════════════════════════════════════

test('mean / variance / stdev basic', () => {
  assert.equal(mean([1, 2, 3, 4, 5]), 3);
  // sample variance of 1..5 = 2.5
  assert.equal(variance([1, 2, 3, 4, 5]), 2.5);
  assert.ok(Math.abs(stdev([1, 2, 3, 4, 5]) - Math.sqrt(2.5)) < 1e-12);
  assert.equal(mean([]), 0);
  assert.equal(variance([42]), 0);
});

test('median and quartile', () => {
  assert.equal(median([1, 2, 3, 4, 5]), 3);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  const sorted = [1, 2, 3, 4, 5, 6, 7, 8];
  const q1 = quartile(sorted, 0.25);
  const q3 = quartile(sorted, 0.75);
  assert.ok(q1 < q3);
  assert.ok(q1 >= 1 && q1 <= 5);
  assert.ok(q3 >= 4 && q3 <= 8);
});

// ═══════════════════════════════════════════════════════════════
// 2. computeZScore
// ═══════════════════════════════════════════════════════════════

test('computeZScore — clear outlier', () => {
  const sample = [100, 102, 98, 101, 99, 100, 103, 97];
  const z = computeZScore(1000, sample);
  assert.ok(Math.abs(z) > 5, `expected huge z, got ${z}`);
});

test('computeZScore — inlier returns small magnitude', () => {
  const sample = [100, 102, 98, 101, 99];
  const z = computeZScore(100, sample);
  assert.ok(Math.abs(z) < 1);
});

test('computeZScore — zero stdev safe', () => {
  assert.equal(computeZScore(5, [5, 5, 5, 5]), 0);
  assert.equal(computeZScore(5, []), 0);
});

// ═══════════════════════════════════════════════════════════════
// 3. movingAverageAnomaly
// ═══════════════════════════════════════════════════════════════

test('movingAverageAnomaly flags the spike', () => {
  const series = [10, 10, 11, 10, 9, 10, 11, 10, 9, 10, 500, 10, 9];
  const idx = movingAverageAnomaly(series, 5, 3);
  assert.ok(idx.includes(10), `expected index 10 in ${JSON.stringify(idx)}`);
});

test('movingAverageAnomaly — no spike, no output', () => {
  const series = [10, 10, 10, 11, 9, 10, 11, 10, 9, 10, 10, 11, 9];
  const idx = movingAverageAnomaly(series, 5, 3);
  assert.deepEqual(idx, []);
});

// ═══════════════════════════════════════════════════════════════
// 4. Z-score detector end-to-end
// ═══════════════════════════════════════════════════════════════

test('detectZScore flags a 10x outlier in vendor history', () => {
  const txs = makeNormalHistory('Alpha', 'materials', 1000, 20);
  txs.push(tx('ALPHA-SPIKE', 'Alpha', 'materials', 12000, '2026-02-15'));
  const anomalies = detectZScore(txs, DEFAULTS);
  const hit = anomalies.find((a) => a.transaction_id === 'ALPHA-SPIKE');
  assert.ok(hit, 'expected spike to be flagged');
  assert.equal(hit.anomaly_type, 'zscore');
  assert.ok(hit.severity >= 5);
  assert.ok(hit.explanation_he.length > 0);
  assert.ok(hit.explanation_en.length > 0);
  assert.ok(hit.confidence > 0.5);
});

// ═══════════════════════════════════════════════════════════════
// 5. IQR detector
// ═══════════════════════════════════════════════════════════════

test('detectIQR flags out-of-range amount', () => {
  const txs = makeNormalHistory('Beta', 'services', 500, 20);
  txs.push(tx('BETA-HI', 'Beta', 'services', 10000, '2026-02-20'));
  txs.push(tx('BETA-LO', 'Beta', 'services', 1, '2026-02-21'));
  const anomalies = detectIQR(txs, DEFAULTS);
  const ids = anomalies.map((a) => a.transaction_id);
  assert.ok(ids.includes('BETA-HI'));
  assert.ok(ids.includes('BETA-LO'));
});

// ═══════════════════════════════════════════════════════════════
// 6. Moving-average detector
// ═══════════════════════════════════════════════════════════════

test('detectMovingAverage flags late-dataset spike', () => {
  const txs = makeNormalHistory('Gamma', 'fuel', 800, 120);
  // insert a spike near the end
  txs[100] = tx('GAMMA-SPIKE', 'Gamma', 'fuel', 20000, txs[100].date);
  const anomalies = detectMovingAverage(txs, {
    ...DEFAULTS,
    movingWindows: [30],
    movingThreshold: 3,
  });
  const hit = anomalies.find((a) => a.transaction_id === 'GAMMA-SPIKE');
  assert.ok(hit, 'expected moving-average detector to catch the spike');
});

// ═══════════════════════════════════════════════════════════════
// 7. Seasonal decomposition
// ═══════════════════════════════════════════════════════════════

test('detectSeasonal flags off-pattern monthly transaction', () => {
  // 2 years of monthly transactions, seasonal: Jan=100, Jul=1000
  const txs = [];
  for (let y = 2024; y <= 2025; y++) {
    for (let m = 1; m <= 12; m++) {
      const date = `${y}-${String(m).padStart(2, '0')}-15`;
      const base = m === 7 ? 1000 : 100;
      txs.push(tx(`S-${y}-${m}`, 'Delta', 'energy', base, date));
    }
  }
  // Odd spike in January 2026
  txs.push(tx('DELTA-ODD', 'Delta', 'energy', 5000, '2026-01-15'));
  const anomalies = detectSeasonal(txs, DEFAULTS);
  const hit = anomalies.find((a) => a.transaction_id === 'DELTA-ODD');
  assert.ok(hit, 'expected seasonal detector to catch odd January tx');
});

// ═══════════════════════════════════════════════════════════════
// 8. Benford analysis
// ═══════════════════════════════════════════════════════════════

test("analyzeAgainstBenford conforms on Benford-distributed set", () => {
  // Generate amounts following Benford: first digit d with probability log10((d+1)/d)
  const amounts = [];
  const seed = 1234;
  let s = seed;
  for (let i = 0; i < 500; i++) {
    // Use exponential of uniform to produce Benford-ish amounts
    s = (s * 1103515245 + 12345) % 2147483648;
    const u = s / 2147483648;
    const amt = Math.pow(10, u * 5);
    amounts.push(amt);
  }
  const res = analyzeAgainstBenford(amounts);
  assert.ok(res.conforms, `expected conformance, chi=${res.chi_square}`);
});

test('analyzeAgainstBenford flags uniform distribution', () => {
  // Uniform 100..999 -> every first digit 1..9 equally likely -> fails Benford
  const amounts = [];
  for (let i = 100; i <= 999; i++) amounts.push(i);
  const res = analyzeAgainstBenford(amounts);
  assert.equal(res.conforms, false);
  assert.ok(res.chi_square > DEFAULTS.benfordChiCritical);
  assert.ok(res.suspicious_digits.length > 0);
});

test('analyzeAgainstBenford returns safe result on tiny sample', () => {
  const res = analyzeAgainstBenford([100, 200]);
  assert.equal(res.conforms, true);
  assert.equal(res.reason, 'insufficient_samples');
});

// ═══════════════════════════════════════════════════════════════
// 9. firstSignificantDigit
// ═══════════════════════════════════════════════════════════════

test('firstSignificantDigit', () => {
  assert.equal(firstSignificantDigit(1), 1);
  assert.equal(firstSignificantDigit(9.99), 9);
  assert.equal(firstSignificantDigit(12345), 1);
  assert.equal(firstSignificantDigit(0.0047), 4);
  assert.equal(firstSignificantDigit(0), 0);
  assert.equal(firstSignificantDigit(-872), 8);
});

// ═══════════════════════════════════════════════════════════════
// 10. Duplicates
// ═══════════════════════════════════════════════════════════════

test('findDuplicates — exact duplicate 2 days apart', () => {
  const txs = [
    tx('D1', 'ACME Steel', 'materials', 1234.56, '2026-03-01'),
    tx('D2', 'ACME Steel', 'materials', 1234.56, '2026-03-03'),
  ];
  const pairs = findDuplicates(txs);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].days_apart, 2);
});

test('findDuplicates — fuzzy vendor match', () => {
  const txs = [
    tx('F1', 'ACME Steel Ltd.', 'materials', 999.99, '2026-03-01'),
    tx('F2', 'acme  steel  LTD', 'materials', 999.99, '2026-03-04'),
  ];
  const pairs = findDuplicates(txs);
  assert.equal(pairs.length, 1);
  assert.ok(pairs[0].similarity >= 0.85);
});

test('findDuplicates — ignores >7 days apart', () => {
  const txs = [
    tx('G1', 'Omega', 'materials', 500, '2026-03-01'),
    tx('G2', 'Omega', 'materials', 500, '2026-03-20'),
  ];
  assert.equal(findDuplicates(txs).length, 0);
});

test('detectDuplicates emits Hebrew + English explanation', () => {
  const txs = [
    tx('H1', 'BetaCo', 'services', 777, '2026-03-01'),
    tx('H2', 'BetaCo', 'services', 777, '2026-03-02'),
  ];
  const res = detectDuplicates(txs, DEFAULTS);
  assert.equal(res.length, 1);
  assert.match(res[0].explanation_he, /כפול/);
  assert.match(res[0].explanation_en, /duplicate/i);
});

// ═══════════════════════════════════════════════════════════════
// 11. Round-amount suspicion
// ═══════════════════════════════════════════════════════════════

test('isRoundAmount and detectRoundAmounts', () => {
  assert.equal(isRoundAmount(1000), true);
  assert.equal(isRoundAmount(1234), false);
  assert.equal(isRoundAmount(999.99), false);
  assert.equal(isRoundAmount(0), false);

  // Vendor with mostly round amounts
  const txs = [
    tx('R1', 'FakeLtd', 'services', 1000, '2026-01-01'),
    tx('R2', 'FakeLtd', 'services', 2000, '2026-01-02'),
    tx('R3', 'FakeLtd', 'services', 3000, '2026-01-03'),
    tx('R4', 'FakeLtd', 'services', 5000, '2026-01-04'),
    tx('R5', 'FakeLtd', 'services', 1234, '2026-01-05'),
  ];
  const res = detectRoundAmounts(txs, DEFAULTS);
  assert.ok(res.length >= 3);
  assert.equal(res[0].anomaly_type, 'round_amount');
});

// ═══════════════════════════════════════════════════════════════
// 12. Time-of-day
// ═══════════════════════════════════════════════════════════════

test('detectTimeOfDay flags 03:00 transactions', () => {
  const txs = [
    tx('T1', 'NightCo', 'misc', 500, '2026-04-11', { timestamp: '2026-04-11T03:17:00Z' }),
    tx('T2', 'DayCo', 'misc', 500, '2026-04-11', { timestamp: '2026-04-11T12:00:00Z' }),
  ];
  const res = detectTimeOfDay(txs, DEFAULTS);
  assert.equal(res.length, 1);
  assert.equal(res[0].transaction_id, 'T1');
  assert.ok(res[0].metric.hour === 3);
});

// ═══════════════════════════════════════════════════════════════
// 13. Velocity
// ═══════════════════════════════════════════════════════════════

test('detectVelocity flags burst of 6 tx in 5 minutes', () => {
  const base = Date.parse('2026-04-11T10:00:00Z');
  const txs = [];
  for (let i = 0; i < 6; i++) {
    txs.push(
      tx(`V${i}`, 'FastCo', 'services', 100, '2026-04-11', {
        timestamp: new Date(base + i * 30000).toISOString(), // every 30s
      })
    );
  }
  const res = detectVelocity(txs, DEFAULTS);
  assert.ok(res.length >= 1, 'expected velocity burst');
  assert.equal(res[0].anomaly_type, 'velocity');
});

// ═══════════════════════════════════════════════════════════════
// 14. Geographic
// ═══════════════════════════════════════════════════════════════

test('detectGeographic flags impossible travel', () => {
  // Tel Aviv -> New York in 10 minutes
  const txs = [
    tx('GEO1', 'Globex', 'services', 500, '2026-04-11', {
      timestamp: '2026-04-11T10:00:00Z',
      lat: 32.0853,
      lon: 34.7818,
      user_id: 'u1',
    }),
    tx('GEO2', 'Globex', 'services', 500, '2026-04-11', {
      timestamp: '2026-04-11T10:10:00Z',
      lat: 40.7128,
      lon: -74.006,
      user_id: 'u1',
    }),
  ];
  const res = detectGeographic(txs, DEFAULTS);
  assert.equal(res.length, 1);
  assert.equal(res[0].transaction_id, 'GEO2');
  assert.ok(res[0].metric.km_per_hour > 900);
});

test('haversineKm Tel Aviv to Jerusalem ~55km', () => {
  const km = haversineKm(32.0853, 34.7818, 31.7683, 35.2137);
  assert.ok(km > 45 && km < 75, `got ${km}`);
});

// ═══════════════════════════════════════════════════════════════
// 15. Fuzzy string helpers
// ═══════════════════════════════════════════════════════════════

test('levenshtein and vendorSimilarity', () => {
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('', 'abc'), 3);
  assert.equal(levenshtein('abc', 'abc'), 0);
  assert.ok(vendorSimilarity('ACME Corp', 'acme corp.') > 0.85);
  assert.ok(vendorSimilarity('Foo', 'BarBaz') < 0.5);
});

test('normalizeVendor strips punctuation and lowercases', () => {
  assert.equal(normalizeVendor('ACME, Corp.'), 'acme corp');
  assert.equal(normalizeVendor(null), '');
});

// ═══════════════════════════════════════════════════════════════
// 16. clampSeverity
// ═══════════════════════════════════════════════════════════════

test('clampSeverity bounds to 1..10', () => {
  assert.equal(clampSeverity(-5), 1);
  assert.equal(clampSeverity(0), 1);
  assert.equal(clampSeverity(5.4), 5);
  assert.equal(clampSeverity(100), 10);
  assert.equal(clampSeverity(NaN), 1);
});

// ═══════════════════════════════════════════════════════════════
// 17. detectAnomalies full pipeline — empty & edge cases
// ═══════════════════════════════════════════════════════════════

test('detectAnomalies returns [] for empty input', () => {
  assert.deepEqual(detectAnomalies([]), []);
  assert.deepEqual(detectAnomalies(null), []);
  assert.deepEqual(detectAnomalies(undefined), []);
});

test('detectAnomalies returns [] for single clean transaction', () => {
  const res = detectAnomalies([tx('X', 'V', 'c', 100, '2026-04-01')]);
  assert.deepEqual(res, []);
});

// ═══════════════════════════════════════════════════════════════
// 18. detectAnomalies full pipeline — mixed scenario
// ═══════════════════════════════════════════════════════════════

test('detectAnomalies mixed scenario covers multiple anomaly types', () => {
  // normal baseline
  const txs = makeNormalHistory('Epsilon', 'materials', 1000, 25);

  // inject a 20x z-score spike
  txs.push(tx('MIX-SPIKE', 'Epsilon', 'materials', 20000, '2026-03-01'));

  // inject a duplicate pair
  txs.push(tx('MIX-DUP-1', 'ZetaCo', 'services', 555.55, '2026-03-10'));
  txs.push(tx('MIX-DUP-2', 'ZetaCo', 'services', 555.55, '2026-03-12'));

  // inject a 03:00 tx
  txs.push(
    tx('MIX-NIGHT', 'EtaCo', 'misc', 100, '2026-03-15', {
      timestamp: '2026-03-15T03:00:00Z',
    })
  );

  const res = detectAnomalies(txs);
  const types = new Set(res.map((r) => r.anomaly_type));

  assert.ok(res.length > 0);
  assert.ok(types.has('zscore'), 'expected zscore in types: ' + [...types].join(','));
  assert.ok(types.has('duplicate'));
  assert.ok(types.has('time_of_day'));
  // every record has both languages
  for (const r of res) {
    assert.equal(typeof r.explanation_he, 'string');
    assert.equal(typeof r.explanation_en, 'string');
    assert.ok(r.severity >= 1 && r.severity <= 10);
    assert.ok(r.confidence >= 0 && r.confidence <= 1);
  }
  // sorted by severity desc
  for (let i = 1; i < res.length; i++) {
    assert.ok(res[i - 1].severity >= res[i].severity);
  }
});

// ═══════════════════════════════════════════════════════════════
// 19. Output shape contract
// ═══════════════════════════════════════════════════════════════

test('every detection conforms to the documented record shape', () => {
  const txs = makeNormalHistory('Theta', 'materials', 500, 20);
  txs.push(tx('THETA-SPIKE', 'Theta', 'materials', 9999, '2026-02-02'));
  const anomalies = detectAnomalies(txs);
  assert.ok(anomalies.length >= 1);
  for (const a of anomalies) {
    assert.ok('transaction_id' in a);
    assert.ok('anomaly_type' in a);
    assert.ok('severity' in a);
    assert.ok('explanation_he' in a);
    assert.ok('explanation_en' in a);
    assert.ok('confidence' in a);
    assert.ok('metric' in a);
  }
});

// ═══════════════════════════════════════════════════════════════
// 20. Determinism
// ═══════════════════════════════════════════════════════════════

test('detectAnomalies is deterministic across runs', () => {
  const txs = makeNormalHistory('Iota', 'materials', 200, 30);
  txs.push(tx('IOTA-SPIKE', 'Iota', 'materials', 9000, '2026-02-01'));
  const a = detectAnomalies(txs);
  const b = detectAnomalies(txs);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i].transaction_id, b[i].transaction_id);
    assert.equal(a[i].anomaly_type, b[i].anomaly_type);
    assert.equal(a[i].severity, b[i].severity);
  }
});

// ═══════════════════════════════════════════════════════════════
// 21. Ignores when insufficient history
// ═══════════════════════════════════════════════════════════════

test('detectZScore ignores vendors with tiny history', () => {
  const txs = [
    tx('K1', 'Kappa', 'materials', 100, '2026-01-01'),
    tx('K2', 'Kappa', 'materials', 99999, '2026-01-02'),
  ];
  const res = detectZScore(txs, DEFAULTS);
  assert.deepEqual(res, []);
});

// ═══════════════════════════════════════════════════════════════
// 22. Benford: Hebrew and English messages
// ═══════════════════════════════════════════════════════════════

test('detectBenford produces explanations when chi-square fails', () => {
  // Build 50 tx for vendor "Phi" where first digit is always 9 -> clearly non-Benford
  const txs = [];
  for (let i = 0; i < 50; i++) {
    txs.push(
      tx(`PHI${i}`, 'Phi', 'materials', 900 + i, `2026-02-${String((i % 27) + 1).padStart(2, '0')}`)
    );
  }
  const res = detectBenford(txs, DEFAULTS);
  assert.ok(res.length > 0);
  assert.equal(res[0].anomaly_type, 'benford');
  assert.match(res[0].explanation_he, /בנפורד|זיוף/);
  assert.match(res[0].explanation_en, /benford/i);
});
