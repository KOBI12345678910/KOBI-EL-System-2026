/**
 * Customer Health Score — Unit Tests
 * Techno-Kol Uzi mega-ERP / Agent Y-099
 *
 * Run with:  node --test test/customer/health-score.test.js
 *
 * Covers: score calc, status mapping, trend, decline alert, churn correlation,
 * playbook triggers, explainScore, segmentHealth, visualizeHealth, whatIf.
 *
 * Uses only Node built-in test runner — zero external deps.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  HealthScore,
  DEFAULT_FACTORS,
  DEFAULT_THRESHOLDS,
  STATUS_LABELS,
  statusFromTotal,
  clamp,
  slope,
  round2,
} = require(path.resolve(__dirname, '..', '..', 'src', 'customer', 'health-score.js'));

// ─────────────────────────────────────────────────────────────
// Helpers — a fake clock we can advance deterministically
// ─────────────────────────────────────────────────────────────

function mockClock(initial = Date.parse('2026-04-01T00:00:00Z')) {
  let t = initial;
  const fn = () => t;
  fn.advance = (ms) => { t += ms; };
  fn.advanceDays = (d) => { t += d * 86400000; };
  fn.set = (v) => { t = v; };
  return fn;
}

function makeHappyData() {
  return {
    usage:      { logins_per_month: 28, feature_adoption: 0.85, active_users_ratio: 0.9 },
    payments:   { on_time_rate: 0.98, credit_issues: 0, days_past_due: 0 },
    support:    { volume: 2, avg_severity: 1.5, oldest_open_days: 1 },
    survey:     { nps: 60, csat: 4.6 },
    engagement: { meetings_per_quarter: 10, response_rate: 0.9, exec_engagement: 0.8 },
    commercial: { expansion_signal: 0.8, upsell_opportunities: 3, contract_length_months: 36 },
    csm:        { csm_rapport: 9, champion_present: true, days_since_last_qbr: 20 },
  };
}

function makeSadData() {
  return {
    usage:      { logins_per_month: 1, feature_adoption: 0.1, active_users_ratio: 0.1 },
    payments:   { on_time_rate: 0.3, credit_issues: 4, days_past_due: 60 },
    support:    { volume: 18, avg_severity: 4.5, oldest_open_days: 45 },
    survey:     { nps: -60, csat: 1.5 },
    engagement: { meetings_per_quarter: 0, response_rate: 0.1, exec_engagement: 0 },
    commercial: { expansion_signal: 0, upsell_opportunities: 0, contract_length_months: 3 },
    csm:        { csm_rapport: 2, champion_present: false, days_since_last_qbr: 160 },
  };
}

function ingestAll(engine, customerId, bucket) {
  for (const [src, payload] of Object.entries(bucket)) {
    engine.ingestData(customerId, src, payload);
  }
}

// ═══════════════════════════════════════════════════════════════
// 1. Pure helpers
// ═══════════════════════════════════════════════════════════════

test('clamp: clamps below/above and passes NaN as low bound', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
  assert.equal(clamp(NaN, 0, 10), 0);
});

test('statusFromTotal: respects default thresholds', () => {
  assert.equal(statusFromTotal(95, DEFAULT_THRESHOLDS), 'healthy');
  assert.equal(statusFromTotal(80, DEFAULT_THRESHOLDS), 'healthy');
  assert.equal(statusFromTotal(70, DEFAULT_THRESHOLDS), 'watch');
  assert.equal(statusFromTotal(50, DEFAULT_THRESHOLDS), 'risk');
  assert.equal(statusFromTotal(20, DEFAULT_THRESHOLDS), 'critical');
  assert.equal(statusFromTotal(0,  DEFAULT_THRESHOLDS), 'critical');
});

test('slope: positive/negative/flat detection', () => {
  assert.ok(slope([10, 20, 30, 40]) > 0);
  assert.ok(slope([40, 30, 20, 10]) < 0);
  assert.equal(slope([50, 50, 50]), 0);
  assert.equal(slope([1]), 0);
});

// ═══════════════════════════════════════════════════════════════
// 2. Model definition
// ═══════════════════════════════════════════════════════════════

test('constructor: installs default model with 7 factors', () => {
  const hs = new HealthScore();
  assert.equal(hs.model.factors.length, 7);
  // weights normalize to ~1.0
  const sum = hs.model.factors.reduce((s, f) => s + f.weight, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.deepEqual(hs.model.thresholds, DEFAULT_THRESHOLDS);
});

test('defineModel: accepts custom factors and normalizes weights', () => {
  const hs = new HealthScore();
  hs.defineModel({
    factors: [
      { name: 'a', weight: 2, dataSource: 'a', scoreFn: () => 100 },
      { name: 'b', weight: 3, dataSource: 'b', scoreFn: () => 50 },
    ],
    thresholds: { healthy: 90, watch: 70, risk: 40, critical: 0 },
  });
  const sum = hs.model.factors.reduce((s, f) => s + f.weight, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.equal(hs.model.thresholds.healthy, 90);
});

test('defineModel: rejects missing factors or scoreFn', () => {
  const hs = new HealthScore();
  assert.throws(() => hs.defineModel({ factors: [] }), /factors/);
  assert.throws(
    () => hs.defineModel({ factors: [{ name: 'x', weight: 1, dataSource: 'x' }] }),
    /scoreFn/
  );
});

// ═══════════════════════════════════════════════════════════════
// 3. computeScore + status mapping
// ═══════════════════════════════════════════════════════════════

test('computeScore: happy customer is healthy', () => {
  const clock = mockClock();
  const hs = new HealthScore({ clock });
  ingestAll(hs, 'CUST-1', makeHappyData());
  const rec = hs.computeScore('CUST-1');
  assert.ok(rec.total >= 80, `expected healthy, got ${rec.total}`);
  assert.equal(rec.status, 'healthy');
  assert.equal(rec.customerId, 'CUST-1');
  // All 7 factors present in breakdown
  assert.equal(Object.keys(rec.breakdown).length, 7);
});

test('computeScore: sad customer is critical or risk', () => {
  const clock = mockClock();
  const hs = new HealthScore({ clock });
  ingestAll(hs, 'CUST-2', makeSadData());
  const rec = hs.computeScore('CUST-2');
  assert.ok(rec.total < 40, `expected critical, got ${rec.total}`);
  assert.equal(rec.status, 'critical');
});

test('computeScore: customer with no data produces default score', () => {
  const hs = new HealthScore({ clock: mockClock() });
  const rec = hs.computeScore('CUST-ZERO');
  assert.ok(rec.total >= 0 && rec.total <= 100);
  assert.ok(['healthy', 'watch', 'risk', 'critical'].includes(rec.status));
});

test('computeScore: breakdown weighted values sum ≈ total', () => {
  const hs = new HealthScore({ clock: mockClock() });
  ingestAll(hs, 'CUST-3', makeHappyData());
  const rec = hs.computeScore('CUST-3');
  const sum = Object.values(rec.breakdown).reduce((s, b) => s + b.weighted, 0);
  // Allow rounding tolerance.
  assert.ok(Math.abs(sum - rec.total) < 1.0);
});

test('computeScore: trend is 0 on first score', () => {
  const hs = new HealthScore({ clock: mockClock() });
  ingestAll(hs, 'CUST-4', makeHappyData());
  const rec = hs.computeScore('CUST-4');
  assert.equal(rec.trend, 0);
});

test('computeScore: decay reduces score when data is stale', () => {
  const clock = mockClock();
  const hs = new HealthScore({ clock });
  ingestAll(hs, 'CUST-5', makeHappyData());
  const fresh = hs.computeScore('CUST-5');
  clock.advanceDays(200); // let decay eat into scores
  const stale = hs.computeScore('CUST-5');
  assert.ok(stale.total < fresh.total, `expected decay, fresh=${fresh.total} stale=${stale.total}`);
});

// ═══════════════════════════════════════════════════════════════
// 4. trendAnalysis
// ═══════════════════════════════════════════════════════════════

test('trendAnalysis: improving customer has positive slope', () => {
  const clock = mockClock();
  const hs = new HealthScore({ clock });
  // Start sad, gradually improve.
  ingestAll(hs, 'CUST-T', makeSadData());
  hs.computeScore('CUST-T');
  clock.advanceDays(7);
  ingestAll(hs, 'CUST-T', {
    ...makeSadData(),
    usage: { logins_per_month: 15, feature_adoption: 0.5, active_users_ratio: 0.5 },
  });
  hs.computeScore('CUST-T');
  clock.advanceDays(7);
  ingestAll(hs, 'CUST-T', makeHappyData());
  hs.computeScore('CUST-T');

  const trend = hs.trendAnalysis('CUST-T');
  assert.ok(trend.slope > 0, `expected positive slope, got ${trend.slope}`);
  assert.equal(trend.direction, 'improving');
  assert.equal(trend.direction_he, 'משתפר');
  assert.equal(trend.points.length, 3);
});

test('trendAnalysis: declining customer direction flag', () => {
  const clock = mockClock();
  const hs = new HealthScore({ clock });
  ingestAll(hs, 'CUST-D', makeHappyData());
  hs.computeScore('CUST-D');
  clock.advanceDays(7);
  ingestAll(hs, 'CUST-D', makeSadData());
  hs.computeScore('CUST-D');
  const trend = hs.trendAnalysis('CUST-D');
  assert.equal(trend.direction, 'declining');
  assert.ok(trend.delta < 0);
});

test('trendAnalysis: empty history returns zero shape', () => {
  const hs = new HealthScore({ clock: mockClock() });
  const t = hs.trendAnalysis('ghost');
  assert.equal(t.points.length, 0);
  assert.equal(t.slope, 0);
  assert.equal(t.delta, 0);
  assert.equal(t.direction, 'flat');
});

test('trendAnalysis: period filter honors days window', () => {
  const clock = mockClock();
  const hs = new HealthScore({ clock });
  ingestAll(hs, 'CUST-P', makeHappyData());
  hs.computeScore('CUST-P');
  clock.advanceDays(100);
  hs.computeScore('CUST-P');
  clock.advanceDays(2);
  hs.computeScore('CUST-P');
  const recent = hs.trendAnalysis('CUST-P', { days: 10 });
  assert.ok(recent.points.length <= 2);
});

// ═══════════════════════════════════════════════════════════════
// 5. alertDecline
// ═══════════════════════════════════════════════════════════════

test('alertDecline: detects >10 point drop', () => {
  const clock = mockClock();
  const hs = new HealthScore({ clock });
  ingestAll(hs, 'ACME', makeHappyData());
  hs.computeScore('ACME');
  clock.advanceDays(1);
  ingestAll(hs, 'ACME', makeSadData());
  hs.computeScore('ACME');

  const alerts = hs.alertDecline({ threshold: 10 });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].customerId, 'ACME');
  assert.ok(alerts[0].drop >= 10);
  assert.ok(['low','medium','high','critical'].includes(alerts[0].severity));
  assert.match(alerts[0].message_he, /ACME/);
  assert.match(alerts[0].message_en, /ACME/);
});

test('alertDecline: skips customers with stable health', () => {
  const clock = mockClock();
  const hs = new HealthScore({ clock });
  ingestAll(hs, 'STEADY', makeHappyData());
  hs.computeScore('STEADY');
  clock.advanceDays(1);
  hs.computeScore('STEADY'); // same data → near-identical score
  const alerts = hs.alertDecline({ threshold: 10 });
  assert.equal(alerts.length, 0);
});

test('alertDecline: sorts by largest drop first', () => {
  const clock = mockClock();
  const hs = new HealthScore({ clock });
  // small drop
  ingestAll(hs, 'SMALL', makeHappyData());
  hs.computeScore('SMALL');
  clock.advanceDays(1);
  ingestAll(hs, 'SMALL', {
    ...makeHappyData(),
    usage: { logins_per_month: 10, feature_adoption: 0.5, active_users_ratio: 0.5 },
  });
  hs.computeScore('SMALL');
  // big drop
  ingestAll(hs, 'BIG', makeHappyData());
  hs.computeScore('BIG');
  clock.advanceDays(1);
  ingestAll(hs, 'BIG', makeSadData());
  hs.computeScore('BIG');

  const alerts = hs.alertDecline({ threshold: 5 });
  assert.ok(alerts.length >= 2);
  assert.equal(alerts[0].customerId, 'BIG');
});

// ═══════════════════════════════════════════════════════════════
// 6. explainScore
// ═══════════════════════════════════════════════════════════════

test('explainScore: produces bilingual drivers', () => {
  const hs = new HealthScore({ clock: mockClock() });
  ingestAll(hs, 'CUST-E', makeHappyData());
  hs.computeScore('CUST-E');
  const ex = hs.explainScore('CUST-E');
  assert.ok(Array.isArray(ex.top_drivers_he));
  assert.ok(Array.isArray(ex.top_drivers_en));
  assert.equal(ex.top_drivers_he.length, ex.top_drivers_en.length);
  assert.equal(ex.status_he, STATUS_LABELS[ex.status].he);
});

test('explainScore: highlights weaknesses for sad customer', () => {
  const hs = new HealthScore({ clock: mockClock() });
  ingestAll(hs, 'SAD-X', makeSadData());
  hs.computeScore('SAD-X');
  const ex = hs.explainScore('SAD-X');
  assert.ok(ex.weaknesses.length > 0);
  assert.ok(ex.top_drivers_en.some((s) => s.startsWith('Weakness')));
});

test('explainScore: no history returns sentinel', () => {
  const hs = new HealthScore({ clock: mockClock() });
  const ex = hs.explainScore('nobody');
  assert.equal(ex.total, 0);
  assert.match(ex.top_drivers_he[0], /אין נתונים/);
});

// ═══════════════════════════════════════════════════════════════
// 7. playbookTrigger
// ═══════════════════════════════════════════════════════════════

test('playbookTrigger: fires for risk status', () => {
  const hs = new HealthScore({ clock: mockClock() });
  ingestAll(hs, 'RISKY', makeSadData());
  hs.computeScore('RISKY');
  const pb = hs.playbookTrigger('RISKY');
  assert.ok(pb);
  assert.equal(pb.current_status, 'critical');
  assert.ok(Array.isArray(pb.playbook.steps));
});

test('playbookTrigger: no trigger for healthy stable customer', () => {
  const hs = new HealthScore({ clock: mockClock() });
  ingestAll(hs, 'GOOD', makeHappyData());
  hs.computeScore('GOOD');
  const pb = hs.playbookTrigger('GOOD');
  assert.equal(pb, null);
});

test('playbookTrigger: fires on sharp decline even if still healthy', () => {
  const clock = mockClock();
  const hs = new HealthScore({ clock });
  // Very permissive thresholds: everything >= 15 is healthy, so drops
  // still land inside 'healthy' and force the decline-reason path.
  hs.defineModel({
    factors: DEFAULT_FACTORS.map((f) => ({ ...f })),
    thresholds: { healthy: 15, watch: 10, risk: 5, critical: 0 },
  });
  ingestAll(hs, 'DIP', makeHappyData());
  hs.computeScore('DIP');
  clock.advanceDays(1);
  // Replace with SAD data across all sources → big drop, but 'healthy' sticks.
  ingestAll(hs, 'DIP', makeSadData());
  hs.computeScore('DIP');
  const pb = hs.playbookTrigger('DIP');
  assert.ok(pb, 'expected playbook to fire on decline');
  assert.equal(pb.reason, 'decline');
  assert.ok(pb.decline >= 10);
});

// ═══════════════════════════════════════════════════════════════
// 8. correlateChurn
// ═══════════════════════════════════════════════════════════════

test('correlateChurn: perfect correlation → precision and recall = 1', () => {
  const hs = new HealthScore({ clock: mockClock() });
  ingestAll(hs, 'CHURN-1', makeSadData());
  hs.computeScore('CHURN-1');
  ingestAll(hs, 'CHURN-2', makeSadData());
  hs.computeScore('CHURN-2');
  ingestAll(hs, 'KEEP-1', makeHappyData());
  hs.computeScore('KEEP-1');
  ingestAll(hs, 'KEEP-2', makeHappyData());
  hs.computeScore('KEEP-2');

  const r = hs.correlateChurn(['CHURN-1', 'CHURN-2']);
  assert.equal(r.tp, 2);
  assert.equal(r.fn, 0);
  assert.equal(r.fp, 0);
  assert.equal(r.tn, 2);
  assert.equal(r.precision, 1);
  assert.equal(r.recall, 1);
  assert.equal(r.f1, 1);
});

test('correlateChurn: unknown churned customers count as false negatives', () => {
  const hs = new HealthScore({ clock: mockClock() });
  ingestAll(hs, 'A', makeHappyData());
  hs.computeScore('A');
  const r = hs.correlateChurn(['GHOST']);
  assert.equal(r.fn, 1);
  assert.equal(r.tp, 0);
});

test('correlateChurn: guards non-array input', () => {
  const hs = new HealthScore({ clock: mockClock() });
  assert.throws(() => hs.correlateChurn('not-an-array'), /array/);
});

// ═══════════════════════════════════════════════════════════════
// 9. segmentHealth
// ═══════════════════════════════════════════════════════════════

test('segmentHealth: averages by segment', () => {
  const hs = new HealthScore({ clock: mockClock() });
  ingestAll(hs, 'ENT-1', makeHappyData());
  hs.computeScore('ENT-1');
  hs.assignSegment('ENT-1', 'enterprise');
  ingestAll(hs, 'ENT-2', makeSadData());
  hs.computeScore('ENT-2');
  hs.assignSegment('ENT-2', 'enterprise');
  ingestAll(hs, 'SMB-1', makeHappyData());
  hs.computeScore('SMB-1');
  hs.assignSegment('SMB-1', 'smb');

  const ent = hs.segmentHealth('enterprise');
  assert.equal(ent.count, 2);
  assert.ok(ent.avg > 0 && ent.avg <= 100);
  assert.equal(ent.dist.healthy + ent.dist.watch + ent.dist.risk + ent.dist.critical, 2);

  const all = hs.segmentHealth();
  assert.equal(all.count, 3);
});

// ═══════════════════════════════════════════════════════════════
// 10. visualizeHealth
// ═══════════════════════════════════════════════════════════════

test('visualizeHealth: returns an SVG string with score and labels', () => {
  const hs = new HealthScore({ clock: mockClock() });
  ingestAll(hs, 'VIZ-1', makeHappyData());
  const rec = hs.computeScore('VIZ-1');
  const svg = hs.visualizeHealth('VIZ-1');
  assert.match(svg, /^<svg/);
  assert.match(svg, /<\/svg>$/);
  assert.ok(svg.includes(String(rec.total)));
  assert.ok(svg.includes('VIZ-1'));
  assert.ok(svg.includes('polyline')); // sparkline
});

test('visualizeHealth: gracefully handles missing customer', () => {
  const hs = new HealthScore({ clock: mockClock() });
  const svg = hs.visualizeHealth('none');
  assert.match(svg, /^<svg/);
  assert.match(svg, /No data/);
});

// ═══════════════════════════════════════════════════════════════
// 11. whatIfSimulator
// ═══════════════════════════════════════════════════════════════

test('whatIfSimulator: improving usage raises score', () => {
  const hs = new HealthScore({ clock: mockClock() });
  ingestAll(hs, 'WHATIF', makeSadData());
  const before = hs.computeScore('WHATIF');
  const sim = hs.whatIfSimulator({
    customerId: 'WHATIF',
    factor: 'product_usage',
    newValue: { logins_per_month: 30, feature_adoption: 0.95, active_users_ratio: 0.95 },
  });
  assert.ok(sim.delta > 0, `expected improvement, got ${sim.delta}`);
  assert.equal(sim.before.total, before.total);
  assert.match(sim.recommendation_en, /Recommended|Negligible/);
});

test('whatIfSimulator: does not mutate history', () => {
  const hs = new HealthScore({ clock: mockClock() });
  ingestAll(hs, 'IMMUT', makeHappyData());
  hs.computeScore('IMMUT');
  const before = hs.getHistory('IMMUT').length;
  hs.whatIfSimulator({ customerId: 'IMMUT', factor: 'product_usage', newValue: { logins_per_month: 1 } });
  const after = hs.getHistory('IMMUT').length;
  assert.equal(after, before);
});

test('whatIfSimulator: rejects unknown factor', () => {
  const hs = new HealthScore({ clock: mockClock() });
  ingestAll(hs, 'X', makeHappyData());
  hs.computeScore('X');
  assert.throws(
    () => hs.whatIfSimulator({ customerId: 'X', factor: 'not_a_factor', newValue: {} }),
    /unknown factor/
  );
});

// ═══════════════════════════════════════════════════════════════
// 12. Immutability / never-delete rule
// ═══════════════════════════════════════════════════════════════

test('rule: history is append-only — scores accumulate', () => {
  const clock = mockClock();
  const hs = new HealthScore({ clock });
  ingestAll(hs, 'APPEND', makeHappyData());
  hs.computeScore('APPEND');
  clock.advanceDays(1);
  hs.computeScore('APPEND');
  clock.advanceDays(1);
  hs.computeScore('APPEND');
  const hist = hs.getHistory('APPEND');
  assert.equal(hist.length, 3);
  // First record untouched by subsequent scores.
  assert.equal(hist[0].trend, 0);
});

test('listCustomers: returns every customer ever touched', () => {
  const hs = new HealthScore({ clock: mockClock() });
  ingestAll(hs, 'L1', makeHappyData());
  hs.computeScore('L1');
  hs.assignSegment('L2', 'enterprise');
  const list = hs.listCustomers();
  assert.ok(list.includes('L1'));
  assert.ok(list.includes('L2'));
});
