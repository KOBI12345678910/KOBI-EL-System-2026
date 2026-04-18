/**
 * Customer Segmentation Engine — Unit Tests
 * Agent Y-091 — Techno-Kol Uzi mega-ERP 2026 / onyx-procurement
 *
 * Run with:   node --test test/customer/segmentation.test.js
 * Requires:   Node >= 18 (built-in `node:test` runner).
 *
 * Covers:
 *   - RFM scoring (boundary quintiles + raw extraction)
 *   - Named segment mapping (Champions, Loyal, New, At Risk, Lost, ...)
 *   - Lifecycle transitions (prospect → first_time → repeat → loyal →
 *     champion → at_risk → churned)
 *   - k-means convergence and reproducibility (seeded)
 *   - Behavioural segmentation
 *   - Venn-style segment overlap
 *   - CLV forecast math
 *   - Campaign export (exportSegments)
 *   - recommendAction fallback behaviour
 *   - Hebrew labels present
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  CustomerSegmentation,
  RFM_SEGMENTS,
  LIFECYCLE_STAGES,
  BEHAVIOURAL_SEGMENTS,
  GLOSSARY,
  __internal__,
} = require(path.resolve(__dirname, '..', '..', 'src', 'customer', 'segmentation.js'));

// ─── fixtures ─────────────────────────────────────────────────────────────

const REF = new Date('2026-04-11T00:00:00Z');

function daysAgo(n) {
  const d = new Date(REF.getTime());
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

function makeEngine(overrides = {}) {
  return new CustomerSegmentation({ referenceDate: REF, ...overrides });
}

function champion() {
  const orders = [];
  for (let i = 0; i < 15; i++) {
    orders.push({ date: daysAgo(i * 15 + 2), amount: 5000 });
  }
  return {
    id: 'C-champ-1',
    orders,
    grossMargin: 0.4,
    retentionRate: 0.9,
  };
}

function atRiskClient() {
  const orders = [];
  for (let i = 0; i < 8; i++) {
    // bought a lot, but 250 days ago and older
    orders.push({ date: daysAgo(250 + i * 20), amount: 8000 });
  }
  return { id: 'C-risk-1', orders };
}

function newClient() {
  return {
    id: 'C-new-1',
    orders: [{ date: daysAgo(5), amount: 400 }],
  };
}

function lostClient() {
  return {
    id: 'C-lost-1',
    orders: [{ date: daysAgo(500), amount: 50 }],
  };
}

function prospect() {
  return { id: 'C-pros-1', orders: [] };
}

// ─── RFM scoring ──────────────────────────────────────────────────────────

test('computeRFM — champion customer scores 5/5/5', () => {
  const eng = makeEngine();
  const rfm = eng.computeRFM({ customer: champion() });
  assert.equal(rfm.R, 5, 'R should be 5 (purchased within 14 days)');
  assert.equal(rfm.F, 5, 'F should be 5 (>12 orders)');
  assert.equal(rfm.M, 5, 'M should be 5 (>50k spend)');
  assert.equal(rfm.raw.frequency, 15);
  assert.equal(rfm.raw.monetary, 75000);
  assert.ok(rfm.raw.recencyDays <= 14);
});

test('computeRFM — new/tiny client scores 5/1/1', () => {
  const eng = makeEngine();
  const rfm = eng.computeRFM({ customer: newClient() });
  assert.equal(rfm.R, 5);
  assert.equal(rfm.F, 1);
  assert.equal(rfm.M, 1);
});

test('computeRFM — lost client scores 1/1/1', () => {
  const eng = makeEngine();
  const rfm = eng.computeRFM({ customer: lostClient() });
  assert.equal(rfm.R, 1);
  assert.equal(rfm.F, 1);
  assert.equal(rfm.M, 1);
});

test('computeRFM — respects explicit period window', () => {
  const eng = makeEngine();
  const cust = {
    id: 'C-per-1',
    orders: [
      { date: daysAgo(500), amount: 100000 }, // outside period
      { date: daysAgo(10), amount: 2000 },
    ],
  };
  const rfm = eng.computeRFM({
    customer: cust,
    period: { start: daysAgo(90), end: daysAgo(0) },
  });
  assert.equal(rfm.raw.frequency, 1, 'only the recent order is counted');
  assert.equal(rfm.raw.monetary, 2000);
});

test('computeRFM — pre-aggregated customer fields supported', () => {
  const eng = makeEngine();
  const rfm = eng.computeRFM({
    customer: {
      id: 'C-agg-1',
      lastOrderDate: daysAgo(20),
      orderCount: 8,
      totalSpend: 12000,
    },
  });
  assert.equal(rfm.R, 4);
  assert.equal(rfm.F, 4);
  assert.equal(rfm.M, 3);
});

test('computeRFM — throws for missing customer', () => {
  const eng = makeEngine();
  assert.throws(() => eng.computeRFM({}), /customer object is required/);
});

// ─── segmentRFM mapping ───────────────────────────────────────────────────

test('segmentRFM — champions for R=F=M=5', () => {
  const eng = makeEngine();
  const seg = eng.segmentRFM({ R: 5, F: 5, M: 5 });
  assert.equal(seg.id, 'champions');
  assert.equal(seg.he, 'אלופים');
  assert.equal(seg.action, 'retain');
  assert.equal(seg.code, '555');
});

test('segmentRFM — new customers for high R low F', () => {
  const eng = makeEngine();
  const seg = eng.segmentRFM({ R: 5, F: 1, M: 1 });
  assert.equal(seg.id, 'new_customers');
  assert.equal(seg.action, 'nurture');
});

test('segmentRFM — at risk for low R, high F, high M', () => {
  const eng = makeEngine();
  const seg = eng.segmentRFM({ R: 2, F: 4, M: 4 });
  assert.equal(seg.action, 'win-back');
  // 244 first hits cannot_lose (which is the stronger variant); either is ok
  assert.ok(['at_risk', 'cannot_lose'].includes(seg.id));
});

test('segmentRFM — lost for 1/1/X', () => {
  const eng = makeEngine();
  const seg = eng.segmentRFM({ R: 1, F: 1, M: 1 });
  assert.equal(seg.id, 'lost');
});

test('segmentRFM — throws for out-of-range scores', () => {
  const eng = makeEngine();
  assert.throws(() => eng.segmentRFM({ R: 0, F: 5, M: 5 }), /1\.\.5/);
  assert.throws(() => eng.segmentRFM({ R: 5, F: 6, M: 5 }), /1\.\.5/);
});

test('RFM_SEGMENTS — every entry has Hebrew label', () => {
  for (const s of RFM_SEGMENTS) {
    assert.ok(s.he && typeof s.he === 'string', `segment ${s.id} missing Hebrew label`);
    assert.ok(s.en && typeof s.en === 'string', `segment ${s.id} missing English label`);
  }
});

// ─── lifecycle transitions ────────────────────────────────────────────────

test('lifecycleStage — prospect (no orders)', () => {
  const eng = makeEngine();
  assert.equal(eng.lifecycleStage(prospect()).id, 'prospect');
});

test('lifecycleStage — first_time (1 recent order)', () => {
  const eng = makeEngine();
  const stage = eng.lifecycleStage({ id: 'C-ft', orders: [{ date: daysAgo(5), amount: 500 }] });
  assert.equal(stage.id, 'first_time');
  assert.equal(stage.he, 'ראשוני');
});

test('lifecycleStage — repeat (2 recent orders)', () => {
  const eng = makeEngine();
  const stage = eng.lifecycleStage({
    id: 'C-rep',
    orders: [
      { date: daysAgo(10), amount: 500 },
      { date: daysAgo(30), amount: 500 },
    ],
  });
  assert.equal(stage.id, 'repeat');
});

test('lifecycleStage — loyal (6+ orders)', () => {
  const eng = makeEngine();
  const orders = [];
  for (let i = 0; i < 7; i++) orders.push({ date: daysAgo(i * 10 + 5), amount: 500 });
  assert.equal(eng.lifecycleStage({ id: 'C-loy', orders }).id, 'loyal');
});

test('lifecycleStage — champion (12+ orders AND 50k+ spend)', () => {
  const eng = makeEngine();
  const stage = eng.lifecycleStage(champion());
  assert.equal(stage.id, 'champion');
  assert.equal(stage.he, 'אלוף');
});

test('lifecycleStage — at_risk (>180d inactive)', () => {
  const eng = makeEngine();
  const stage = eng.lifecycleStage({
    id: 'C-ar',
    orders: [
      { date: daysAgo(200), amount: 5000 },
      { date: daysAgo(220), amount: 5000 },
    ],
  });
  assert.equal(stage.id, 'at_risk');
});

test('lifecycleStage — churned (>365d inactive)', () => {
  const eng = makeEngine();
  const stage = eng.lifecycleStage({
    id: 'C-ch',
    orders: [{ date: daysAgo(400), amount: 5000 }],
  });
  assert.equal(stage.id, 'churned');
});

test('lifecycleStage — catalogue has Hebrew labels', () => {
  for (const s of LIFECYCLE_STAGES) {
    assert.ok(s.he, `${s.id} missing Hebrew`);
    assert.ok(s.en, `${s.id} missing English`);
  }
});

// ─── k-means convergence ─────────────────────────────────────────────────

test('kMeansCluster — converges on a separable 2-cluster dataset', () => {
  const eng = makeEngine();
  const customers = [
    { id: 'a1', spend: 100,  freq: 1 },
    { id: 'a2', spend: 110,  freq: 2 },
    { id: 'a3', spend: 120,  freq: 1 },
    { id: 'b1', spend: 9000, freq: 40 },
    { id: 'b2', spend: 9500, freq: 42 },
    { id: 'b3', spend: 9800, freq: 45 },
  ];
  const result = eng.kMeansCluster(customers, 2, ['spend', 'freq'], { seed: 7 });
  assert.ok(result.converged, 'k-means should converge on separable data');
  assert.equal(result.centroids.length, 2);
  // assignments should group a* together and b* together
  const group1 = new Set(['a1', 'a2', 'a3'].map((id) => result.assignments[customers.findIndex((c) => c.id === id)]));
  const group2 = new Set(['b1', 'b2', 'b3'].map((id) => result.assignments[customers.findIndex((c) => c.id === id)]));
  assert.equal(group1.size, 1, 'all "a" points should share one cluster');
  assert.equal(group2.size, 1, 'all "b" points should share one cluster');
  assert.notDeepEqual(Array.from(group1), Array.from(group2));
  assert.ok(result.iterations >= 1);
});

test('kMeansCluster — reproducible with same seed', () => {
  const eng = makeEngine();
  const customers = Array.from({ length: 20 }, (_, i) => ({
    id: `c${i}`,
    spend: (i * 137) % 1000,
    freq: (i * 91) % 50,
  }));
  const a = eng.kMeansCluster(customers, 3, ['spend', 'freq'], { seed: 42 });
  const b = eng.kMeansCluster(customers, 3, ['spend', 'freq'], { seed: 42 });
  assert.deepEqual(a.assignments, b.assignments);
  assert.deepEqual(a.centroids, b.centroids);
});

test('kMeansCluster — accepts function feature extractors', () => {
  const eng = makeEngine();
  const customers = [
    { id: 'x1', orders: [{ amount: 100 }, { amount: 200 }] },
    { id: 'x2', orders: [{ amount: 110 }, { amount: 190 }] },
    { id: 'y1', orders: [{ amount: 5000 }, { amount: 5500 }] },
    { id: 'y2', orders: [{ amount: 5200 }, { amount: 5600 }] },
  ];
  const result = eng.kMeansCluster(
    customers,
    2,
    [(c) => c.orders.reduce((s, o) => s + o.amount, 0), (c) => c.orders.length],
    { seed: 3 },
  );
  assert.ok(result.converged);
  assert.equal(result.clusters.length, 2);
});

test('kMeansCluster — empty customers returns empty result', () => {
  const eng = makeEngine();
  const r = eng.kMeansCluster([], 3, ['spend']);
  assert.deepEqual(r.centroids, []);
  assert.deepEqual(r.assignments, []);
  assert.equal(r.inertia, 0);
  assert.equal(r.converged, true);
});

test('kMeansCluster — k > n clamps gracefully', () => {
  const eng = makeEngine();
  const r = eng.kMeansCluster(
    [{ id: 'a', s: 1 }, { id: 'b', s: 2 }],
    5,
    ['s'],
    { seed: 1 },
  );
  assert.ok(r.centroids.length <= 2);
});

test('kMeansCluster — throws on invalid k', () => {
  const eng = makeEngine();
  assert.throws(() => eng.kMeansCluster([{ s: 1 }], 0, ['s']), /positive integer/);
});

// ─── behavioural segmentation ─────────────────────────────────────────────

test('behavioralSegment — price-sensitive via high discount', () => {
  const eng = makeEngine();
  const seg = eng.behavioralSegment({ id: 'C', avgDiscountPct: 0.25 });
  assert.equal(seg.id, 'price_sensitive');
  assert.equal(seg.he, 'רגיש-למחיר');
});

test('behavioralSegment — quality-seeker via high AOV + low returns', () => {
  const eng = makeEngine();
  const seg = eng.behavioralSegment({
    id: 'C',
    avgOrderValue: 4500,
    returnRate: 0.02,
    avgDiscountPct: 0.02,
  });
  assert.equal(seg.id, 'quality_seeker');
});

test('behavioralSegment — convenience via reorder rate', () => {
  const eng = makeEngine();
  const seg = eng.behavioralSegment({
    id: 'C',
    reorderRate: 0.7,
    touchpoints: 1,
    avgDiscountPct: 0.01,
  });
  assert.equal(seg.id, 'convenience');
});

test('behavioralSegment — brand-loyal via brand share', () => {
  const eng = makeEngine();
  const seg = eng.behavioralSegment({
    id: 'C',
    topBrandShare: 0.8,
    avgDiscountPct: 0,
    avgOrderValue: 800,
  });
  assert.equal(seg.id, 'brand_loyal');
});

test('behavioralSegment — derives brand share from orders', () => {
  const eng = makeEngine();
  const orders = [
    { amount: 100, brand: 'Sony' },
    { amount: 120, brand: 'Sony' },
    { amount: 115, brand: 'Sony' },
    { amount: 90,  brand: 'Samsung' },
  ];
  const seg = eng.behavioralSegment({ id: 'C', orders });
  assert.equal(seg.id, 'brand_loyal');
});

test('BEHAVIOURAL_SEGMENTS — has Hebrew labels', () => {
  for (const s of BEHAVIOURAL_SEGMENTS) {
    assert.ok(s.he);
    assert.ok(s.en);
  }
});

// ─── segment overlap ──────────────────────────────────────────────────────

test('segmentOverlap — classic Venn math', () => {
  const eng = makeEngine();
  const v = eng.segmentOverlap(['a', 'b', 'c'], ['b', 'c', 'd']);
  assert.deepEqual(v.intersection, ['b', 'c']);
  assert.deepEqual(v.union, ['a', 'b', 'c', 'd']);
  assert.deepEqual(v.onlyA, ['a']);
  assert.deepEqual(v.onlyB, ['d']);
  assert.equal(v.sizeA, 3);
  assert.equal(v.sizeB, 3);
  assert.equal(v.jaccard, 2 / 4);
});

test('segmentOverlap — disjoint sets', () => {
  const eng = makeEngine();
  const v = eng.segmentOverlap(['x'], ['y']);
  assert.equal(v.jaccard, 0);
  assert.deepEqual(v.intersection, []);
});

test('segmentOverlap — accepts {customerIds}', () => {
  const eng = makeEngine();
  const v = eng.segmentOverlap({ customerIds: ['1', '2'] }, { customerIds: ['2'] });
  assert.deepEqual(v.intersection, ['2']);
  assert.equal(v.jaccard, 0.5);
});

// ─── recommendAction ──────────────────────────────────────────────────────

test('recommendAction — RFM segment', () => {
  const eng = makeEngine();
  const rec = eng.recommendAction('champions');
  assert.equal(rec.action, 'retain');
  assert.equal(rec.kind, 'rfm');
  assert.ok(rec.he.includes('שימור'));
  assert.ok(rec.channels.length > 0);
});

test('recommendAction — lifecycle stage', () => {
  const eng = makeEngine();
  const rec = eng.recommendAction('churned');
  assert.equal(rec.kind, 'lifecycle');
  assert.equal(rec.action, 'win-back');
});

test('recommendAction — behavioural', () => {
  const eng = makeEngine();
  const rec = eng.recommendAction('price_sensitive');
  assert.equal(rec.kind, 'behavioural');
  assert.equal(rec.action, 'grow');
});

test('recommendAction — unknown segment falls back safely', () => {
  const eng = makeEngine();
  const rec = eng.recommendAction('xyzzy');
  assert.equal(rec.kind, 'unknown');
  assert.equal(rec.action, 'nurture');
});

// ─── CLV forecast ─────────────────────────────────────────────────────────

test('forecastValue — basic math (explicit inputs)', () => {
  const eng = makeEngine();
  // AOV 1000, 10 orders/yr, 40% margin, retention 1 → factor=1,
  // horizon 3 → CLV = 1000 * 10 * 0.4 * 1 * 3 = 12,000
  const res = eng.forecastValue(
    {
      id: 'X',
      avgOrderValue: 1000,
      annualFrequency: 10,
      grossMargin: 0.4,
      retentionRate: 1,
    },
    3,
  );
  assert.equal(res.clv, 12000);
  assert.equal(res.inputs.aov, 1000);
  assert.equal(res.inputs.annualFrequency, 10);
});

test('forecastValue — retention decay', () => {
  const eng = makeEngine();
  // retention 0.5 over 3 years → factor = (1 + 0.5 + 0.25) / 3 = 0.5833...
  // CLV = 1000 * 10 * 0.4 * 0.5833 * 3 ≈ 7,000
  const res = eng.forecastValue(
    {
      id: 'Y',
      avgOrderValue: 1000,
      annualFrequency: 10,
      grossMargin: 0.4,
      retentionRate: 0.5,
    },
    3,
  );
  assert.ok(res.clv > 6000 && res.clv < 8000, `expected ~7000, got ${res.clv}`);
});

test('forecastValue — derives AOV and frequency from orders', () => {
  const eng = makeEngine();
  const customer = {
    id: 'Z',
    orders: [
      { date: daysAgo(400), amount: 1000 },
      { date: daysAgo(200), amount: 1000 },
      { date: daysAgo(30),  amount: 1000 },
    ],
    grossMargin: 0.3,
    retentionRate: 0.9,
  };
  const res = eng.forecastValue(customer, 2);
  assert.equal(res.inputs.aov, 1000);
  assert.ok(res.inputs.annualFrequency > 0);
  assert.ok(res.clv > 0);
});

test('forecastValue — zero/negative horizon returns zero', () => {
  const eng = makeEngine();
  const res = eng.forecastValue({ id: 'X', avgOrderValue: 100, annualFrequency: 1 }, 0);
  assert.equal(res.clv, 0);
});

test('forecastValue — supports discount rate object form', () => {
  const eng = makeEngine();
  const base = eng.forecastValue(
    { id: 'X', avgOrderValue: 1000, annualFrequency: 10, grossMargin: 0.4, retentionRate: 1 },
    { horizonYears: 5, discountRate: 0 },
  ).clv;
  const discounted = eng.forecastValue(
    { id: 'X', avgOrderValue: 1000, annualFrequency: 10, grossMargin: 0.4, retentionRate: 1 },
    { horizonYears: 5, discountRate: 0.1 },
  ).clv;
  assert.ok(discounted < base, `discounted (${discounted}) should be < base (${base})`);
});

test('forecastValue — throws for missing customer', () => {
  const eng = makeEngine();
  assert.throws(() => eng.forecastValue(null, 3), /customer object is required/);
});

// ─── index + exportSegments ───────────────────────────────────────────────

test('indexCustomers + exportSegments — champions list is populated', () => {
  const eng = makeEngine();
  const customers = [
    champion(),
    { ...champion(), id: 'C-champ-2' },
    newClient(),
    lostClient(),
    prospect(),
  ];
  eng.indexCustomers(customers);
  const champs = eng.exportSegments('champions');
  assert.ok(champs.includes('C-champ-1'));
  assert.ok(champs.includes('C-champ-2'));
  const prospects = eng.exportSegments('prospect');
  assert.deepEqual(prospects, ['C-pros-1']);
  const lost = eng.exportSegments('lost');
  assert.ok(lost.includes('C-lost-1'));
});

test('exportSegments — returns empty array for unknown segment', () => {
  const eng = makeEngine();
  assert.deepEqual(eng.exportSegments('zzz'), []);
});

test('exportSegments — throws on missing segmentId', () => {
  const eng = makeEngine();
  assert.throws(() => eng.exportSegments(), /segmentId string/);
});

test('indexCustomers — never mutates input', () => {
  const eng = makeEngine();
  const customers = [champion(), newClient()];
  const snapshot = JSON.stringify(customers);
  eng.indexCustomers(customers);
  assert.equal(JSON.stringify(customers), snapshot);
});

// ─── internal helpers (light spot checks) ────────────────────────────────

test('internal — scoreByThresholds lower_better boundaries', () => {
  const { scoreByThresholds } = __internal__;
  const t = [14, 30, 60, 120];
  assert.equal(scoreByThresholds(5, t, 'lower_better'), 5);
  assert.equal(scoreByThresholds(14, t, 'lower_better'), 5);
  assert.equal(scoreByThresholds(15, t, 'lower_better'), 4);
  assert.equal(scoreByThresholds(999, t, 'lower_better'), 1);
});

test('internal — makeDeterministicRng is deterministic', () => {
  const { makeDeterministicRng } = __internal__;
  const a = makeDeterministicRng(1);
  const b = makeDeterministicRng(1);
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
});

test('GLOSSARY — has rfm/recency/frequency/monetary/clv keys', () => {
  for (const key of ['rfm', 'recency', 'frequency', 'monetary', 'clv']) {
    assert.ok(GLOSSARY[key], `missing glossary key: ${key}`);
    assert.ok(GLOSSARY[key].he);
    assert.ok(GLOSSARY[key].en);
  }
});

// ─── constructor validation ──────────────────────────────────────────────

test('constructor — throws on invalid referenceDate', () => {
  assert.throws(() => new CustomerSegmentation({ referenceDate: 'not-a-date' }), /referenceDate/);
});
