/**
 * slo-tracker.test.js — Agent X-60 (Swarm 3D)
 * 30 test cases for the SLO/SLI tracker with error budgets.
 *
 * Zero external test deps — runs as:
 *     node test/payroll/slo-tracker.test.js
 *
 * Covers:
 *   - defineSLI / defineSLO input validation
 *   - record() append-only, out-of-order insertion, guards
 *   - currentBudget: consumed, remaining, status tiers, eta_exhaustion
 *   - burnRate: empty, healthy, exceeding
 *   - Google SRE multi-burn policy (1h, 6h, 3d)
 *   - Alert listeners and alert log
 *   - Deploy freeze policy hook
 *   - Historical attainment (buckets, met, overall)
 *   - dashboard() composition + bilingual labels
 *   - seedDefaultSLOs() — 6 seeded SLOs present with correct targets
 *   - Rolling-window advance: old samples stop contributing to budget
 *   - Budget exhaustion listener fires exactly once per SLO
 */

'use strict';

const path = require('path');
const slo = require(path.join(
  __dirname, '..', '..',
  'onyx-procurement', 'src', 'ops', 'slo-tracker.js'
));
const { MS } = slo;

/* ───────────────── tiny test harness ───────────────── */

let passed = 0;
let failed = 0;
const results = [];

function t(name, fn) {
  try {
    fn();
    passed++;
    results.push({ name, ok: true });
    console.log('  ok   ' + name);
  } catch (e) {
    failed++;
    results.push({ name, ok: false, err: e && e.message });
    console.log('  FAIL ' + name + ' — ' + (e && e.stack || e));
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error('assert: ' + (msg || ''));
}
function assertEq(a, b, msg) {
  if (a !== b) {
    throw new Error('expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a) + (msg ? ' — ' + msg : ''));
  }
}
function assertClose(a, b, eps, msg) {
  if (Math.abs(a - b) > (eps || 1e-9)) {
    throw new Error('expected ~' + b + ' got ' + a + (msg ? ' — ' + msg : ''));
  }
}
function assertThrows(fn, rx, msg) {
  let threw = false;
  try { fn(); } catch (e) { threw = !rx || rx.test(e.message); }
  if (!threw) throw new Error('expected throw' + (msg ? ' — ' + msg : ''));
}

/* ───────────────── clock shim ───────────────── */

function mkClock(startIso) {
  let t0 = new Date(startIso).getTime();
  return {
    now() { return t0; },
    advance(ms) { t0 += ms; return t0; },
    set(ms) { t0 = ms; return t0; },
  };
}

/* ───────────────── seed helpers ───────────────── */

function newEnv(startIso) {
  slo._resetForTests();
  const clock = mkClock(startIso || '2026-04-01T00:00:00.000Z');
  slo._setNow(clock.now);
  return clock;
}

function defineSimple(name, target, window) {
  const sliId = slo.defineSLI(name, null, null, {
    label_he: 'שירות ' + name,
    label_en: 'Service ' + name,
  });
  const sloId = slo.defineSLO(
    name + '_slo',
    sliId,
    target != null ? target : 0.999,
    window || '30d'
  );
  return { sliId, sloId };
}

/* ───────────────── tests ───────────────── */

(function run() {
  console.log('\nslo-tracker.test.js — running\n');

  // ══════════ 1. defineSLI / defineSLO validation ══════════

  t('defineSLI returns an id and lists the SLI', () => {
    newEnv();
    const id = slo.defineSLI('svc_x');
    assert(id.startsWith('SLI-'));
    const list = slo.listSLIs();
    assertEq(list.length, 1);
    assertEq(list[0].id, id);
    assertEq(list[0].name, 'svc_x');
  });

  t('defineSLI rejects empty name', () => {
    newEnv();
    assertThrows(() => slo.defineSLI(''), /name required/);
    assertThrows(() => slo.defineSLI('  '), /name required/);
  });

  t('defineSLO rejects unknown SLI', () => {
    newEnv();
    assertThrows(() => slo.defineSLO('x', 'SLI-9999', 0.99, '30d'), /unknown sliId/);
  });

  t('defineSLO rejects invalid target', () => {
    newEnv();
    const sliId = slo.defineSLI('svc');
    assertThrows(() => slo.defineSLO('x', sliId, 1.5, '30d'), /target must be in/);
    assertThrows(() => slo.defineSLO('x', sliId, 0, '30d'), /target must be in/);
    assertThrows(() => slo.defineSLO('x', sliId, -0.1, '30d'), /target must be in/);
  });

  t('defineSLO accepts string windows 7d / 30d / 90d and raw ms', () => {
    newEnv();
    const sliId = slo.defineSLI('svc');
    const a = slo.defineSLO('a', sliId, 0.99, '7d');
    const b = slo.defineSLO('b', sliId, 0.99, '30d');
    const c = slo.defineSLO('c', sliId, 0.99, '90d');
    const d = slo.defineSLO('d', sliId, 0.99, 3 * MS.DAY);
    assertEq(slo.getSLO(a).windowMs, 7 * MS.DAY);
    assertEq(slo.getSLO(b).windowMs, 30 * MS.DAY);
    assertEq(slo.getSLO(c).windowMs, 90 * MS.DAY);
    assertEq(slo.getSLO(d).windowMs, 3 * MS.DAY);
  });

  t('defineSLO rejects nonsense window', () => {
    newEnv();
    const sliId = slo.defineSLI('svc');
    assertThrows(() => slo.defineSLO('x', sliId, 0.99, 'banana'), /window/);
  });

  // ══════════ 2. record() ══════════

  t('record appends samples in order', () => {
    const clock = newEnv();
    const { sliId } = defineSimple('svc');
    slo.record(sliId, { good: 100, total: 100 });
    clock.advance(MS.MINUTE);
    slo.record(sliId, { good: 90, total: 100 });
    const sli = slo.getSLI(sliId);
    assertEq(sli.samples.length, 2);
    assertEq(sli.samples[1].good, 90);
  });

  t('record inserts out-of-order samples in sorted position', () => {
    newEnv();
    const { sliId } = defineSimple('svc');
    slo.record(sliId, { good: 1, total: 1, timestamp: 3000 });
    slo.record(sliId, { good: 1, total: 1, timestamp: 1000 });
    slo.record(sliId, { good: 1, total: 1, timestamp: 2000 });
    const ts = slo.getSLI(sliId).samples.map((s) => s.t);
    assertEq(JSON.stringify(ts), JSON.stringify([1000, 2000, 3000]));
  });

  t('record rejects good > total', () => {
    newEnv();
    const { sliId } = defineSimple('svc');
    assertThrows(() => slo.record(sliId, { good: 101, total: 100 }), /good.*> total/);
  });

  t('record rejects negative numbers', () => {
    newEnv();
    const { sliId } = defineSimple('svc');
    assertThrows(() => slo.record(sliId, { good: -1, total: 10 }), /non-negative/);
    assertThrows(() => slo.record(sliId, { good: 1, total: -10 }), /non-negative/);
  });

  t('record rejects unknown sliId', () => {
    newEnv();
    assertThrows(() => slo.record('SLI-9999', { good: 1, total: 1 }), /unknown sliId/);
  });

  // ══════════ 3. currentBudget ══════════

  t('currentBudget is fresh when all good', () => {
    newEnv();
    const { sloId, sliId } = defineSimple('svc', 0.999, '30d');
    slo.record(sliId, { good: 10000, total: 10000 });
    const b = slo.currentBudget(sloId);
    assertEq(b.good, 10000);
    assertEq(b.total, 10000);
    assertEq(b.observed_bad, 0);
    assertEq(b.consumed_pct, 0);
    assertEq(b.remaining_pct, 1);
    assertEq(b.status.key, 'healthy');
    assertEq(b.status.label_he, 'תקין');
  });

  t('currentBudget consumed_pct is observed_bad / allowed_bad', () => {
    newEnv();
    const { sloId, sliId } = defineSimple('svc', 0.99, '30d');
    // 1000 events, 5 bad → allowed_bad = 10, consumed = 0.5
    slo.record(sliId, { good: 995, total: 1000 });
    const b = slo.currentBudget(sloId);
    assertClose(b.allowed_bad, 10, 1e-6);
    assertEq(b.observed_bad, 5);
    assertClose(b.consumed_pct, 0.5, 1e-9);
    assertClose(b.remaining_pct, 0.5, 1e-9);
    assertEq(b.status.key, 'healthy');
  });

  t('currentBudget status transitions watch → at_risk → burning → exhausted', () => {
    // Status tiers (from slo-tracker.js STATUS_TIERS):
    //   remaining >= 0.50 → healthy
    //   remaining >= 0.25 → watch
    //   remaining >= 0.10 → at_risk
    //   remaining >= 0.00 → burning
    //   consumed >= 1     → exhausted
    // allowed_bad = 10000 * 0.01 = 100 events
    newEnv();
    const env1 = defineSimple('svc', 0.99, '30d');
    slo.record(env1.sliId, { good: 9940, total: 10000 }); // 60 bad / 100 = 0.6 consumed → watch (0.4 remaining)
    let b = slo.currentBudget(env1.sloId);
    assertEq(b.status.key, 'watch');

    newEnv();
    const env2 = defineSimple('svc', 0.99, '30d');
    slo.record(env2.sliId, { good: 9920, total: 10000 }); // 80/100 = 0.8 consumed → at_risk
    b = slo.currentBudget(env2.sloId);
    assertEq(b.status.key, 'at_risk');

    newEnv();
    const env3 = defineSimple('svc', 0.99, '30d');
    slo.record(env3.sliId, { good: 9905, total: 10000 }); // 95/100 = 0.95 consumed → burning
    b = slo.currentBudget(env3.sloId);
    assertEq(b.status.key, 'burning');

    newEnv();
    const env4 = defineSimple('svc', 0.99, '30d');
    slo.record(env4.sliId, { good: 9800, total: 10000 }); // 200/100 = 2.0 consumed → exhausted
    b = slo.currentBudget(env4.sloId);
    assertEq(b.status.key, 'exhausted');
    assertClose(b.consumed_pct, 2, 1e-9);
    assertEq(b.remaining_pct, 0);
  });

  t('currentBudget reports already_exhausted when consumed >= 1', () => {
    newEnv();
    const { sloId, sliId } = defineSimple('svc', 0.99, '30d');
    slo.record(sliId, { good: 980, total: 1000 });
    const b = slo.currentBudget(sloId);
    assertEq(b.eta_exhaustion, 'already_exhausted');
  });

  t('currentBudget predicts eta_exhaustion with linear extrapolation', () => {
    const clock = newEnv('2026-04-01T00:00:00.000Z');
    const { sloId, sliId } = defineSimple('svc', 0.99, '30d');
    // First 30 minutes: perfect (1000 events ok)
    slo.record(sliId, { good: 1000, total: 1000 });
    clock.advance(30 * MS.MINUTE);
    // Recent hour: 5 bad out of 100 → already 50% burned on a 10-allowed budget
    slo.record(sliId, { good: 95, total: 100 });
    const b = slo.currentBudget(sloId);
    assert(typeof b.eta_exhaustion === 'number', 'expected numeric eta, got ' + b.eta_exhaustion);
    assert(b.eta_exhaustion > clock.now(), 'eta must be in the future');
  });

  // ══════════ 4. burnRate ══════════

  t('burnRate is 0 with no samples', () => {
    newEnv();
    const { sloId } = defineSimple('svc');
    assertEq(slo.burnRate(sloId, MS.HOUR), 0);
  });

  t('burnRate = 1 when failures hit target exactly', () => {
    newEnv();
    const { sloId, sliId } = defineSimple('svc', 0.99, '30d');
    slo.record(sliId, { good: 99, total: 100 }); // 1% bad == allowed
    const rate = slo.burnRate(sloId, MS.HOUR);
    assertClose(rate, 1, 1e-9);
  });

  t('burnRate > 1 when failures exceed target', () => {
    newEnv();
    const { sloId, sliId } = defineSimple('svc', 0.99, '30d');
    slo.record(sliId, { good: 80, total: 100 }); // 20% bad = 20x allowed
    const rate = slo.burnRate(sloId, MS.HOUR);
    assertClose(rate, 20, 1e-9);
  });

  t('burnRate rejects non-positive window', () => {
    newEnv();
    const { sloId } = defineSimple('svc');
    assertThrows(() => slo.burnRate(sloId, 0), /windowMs/);
    assertThrows(() => slo.burnRate(sloId, -1), /windowMs/);
  });

  // ══════════ 5. alerts (SRE multi-burn) ══════════

  t('alertIfFastBurn fires when 1h burn exceeds threshold', () => {
    newEnv();
    const { sloId, sliId } = defineSimple('svc', 0.99, '30d');
    let heard = null;
    slo.onAlert((a) => { heard = a; });
    slo.record(sliId, { good: 50, total: 100 }); // 50% bad → very fast burn
    const fired = slo.alertIfFastBurn(sloId, 10);
    assert(fired, 'expected alert fired');
    assert(heard && heard.id === fired.id, 'listener heard alert');
    assertEq(fired.severity, 'page');
  });

  t('alertIfFastBurn returns null when burn is below threshold', () => {
    newEnv();
    const { sloId, sliId } = defineSimple('svc', 0.99, '30d');
    slo.record(sliId, { good: 99, total: 100 }); // rate = 1
    const fired = slo.alertIfFastBurn(sloId, 10);
    assertEq(fired, null);
  });

  t('evaluateMultiBurnAlerts triggers fast_1h page on sharp failure spike', () => {
    newEnv();
    const { sloId, sliId } = defineSimple('svc', 0.999, '30d');
    // A 2% burn over 1h means: in 1h, failures consumed 2% of the 30d budget.
    // Budget is 0.001 of total requests. 1h/30d = 1/720.
    // So needed burnRate (1h) >= 0.02 / (1/720) = 14.4.
    // 100 requests with 2 bad: failure rate = 0.02, allowed = 0.001 → burnRate=20 → trips.
    slo.record(sliId, { good: 98, total: 100 });
    const fired = slo.evaluateMultiBurnAlerts(sloId);
    assert(fired.length >= 1, 'expected at least one alert');
    const ids = fired.map((a) => a.rule);
    assert(ids.indexOf('fast_1h') >= 0, 'fast_1h should have fired — got ' + ids.join(','));
  });

  t('evaluateMultiBurnAlerts does not fire when healthy', () => {
    newEnv();
    const { sloId, sliId } = defineSimple('svc', 0.999, '30d');
    slo.record(sliId, { good: 10000, total: 10000 });
    const fired = slo.evaluateMultiBurnAlerts(sloId);
    assertEq(fired.length, 0);
  });

  // ══════════ 6. deploy freeze policy ══════════

  t('isDeployFrozen returns false by default', () => {
    newEnv();
    const { sloId } = defineSimple('svc');
    assertEq(slo.isDeployFrozen(sloId), false);
    assertEq(slo.isDeployFrozen(), false);
  });

  t('budget exhaustion freezes deploys + fires exhaustion listener', () => {
    newEnv();
    const { sloId, sliId } = defineSimple('svc', 0.999, '30d');
    let exhaustedFor = null;
    slo.onBudgetExhaustion((id) => { exhaustedFor = id; });
    // 1 bad per 1 total with 0.999 target → allowed 0.001, observed 1, consumed 1000x → exhausted
    slo.record(sliId, { good: 0, total: 10 });
    slo.evaluateMultiBurnAlerts(sloId);
    assertEq(slo.isDeployFrozen(sloId), true);
    assertEq(slo.isDeployFrozen(), true);
    assertEq(exhaustedFor, sloId);
  });

  t('freezePolicy(false) unfreezes everything', () => {
    newEnv();
    const { sloId, sliId } = defineSimple('svc', 0.999, '30d');
    slo.record(sliId, { good: 0, total: 10 });
    slo.evaluateMultiBurnAlerts(sloId);
    assertEq(slo.isDeployFrozen(sloId), true);
    slo.freezePolicy(false);
    assertEq(slo.isDeployFrozen(sloId), false);
  });

  // ══════════ 7. attainment ══════════

  t('attainment bucketises historical samples', () => {
    const clock = newEnv('2026-04-01T00:00:00.000Z');
    const { sloId, sliId } = defineSimple('svc', 0.99, '7d');
    // Seed 8 hourly buckets, all perfect.
    for (let i = 0; i < 8; i++) {
      slo.record(sliId, {
        good: 100,
        total: 100,
        timestamp: clock.now() - (8 - i) * MS.HOUR,
      });
    }
    const rep = slo.attainment(sloId, {
      from: clock.now() - 8 * MS.HOUR,
      to: clock.now(),
      bucketMs: MS.HOUR,
    });
    assertEq(rep.total_buckets, 8);
    assertEq(rep.met_buckets, 8);
    assertEq(rep.overall.good, 800);
    assertEq(rep.overall.total, 800);
    assertEq(rep.overall.attainment, 1);
    assertEq(rep.overall.met, true);
  });

  t('attainment marks failing buckets', () => {
    const clock = newEnv('2026-04-01T00:00:00.000Z');
    const { sloId, sliId } = defineSimple('svc', 0.99, '7d');
    // Two hour-buckets: one perfect, one 80% success.
    slo.record(sliId, { good: 100, total: 100, timestamp: clock.now() - 2 * MS.HOUR });
    slo.record(sliId, { good: 80, total: 100, timestamp: clock.now() - 1 * MS.HOUR });
    const rep = slo.attainment(sloId, {
      from: clock.now() - 2 * MS.HOUR,
      to: clock.now(),
      bucketMs: MS.HOUR,
    });
    assertEq(rep.total_buckets, 2);
    assertEq(rep.met_buckets, 1);
    assertEq(rep.buckets[0].met, true);
    assertEq(rep.buckets[1].met, false);
    assertClose(rep.buckets[1].attainment, 0.80, 1e-9);
  });

  // ══════════ 8. dashboard ══════════

  t('dashboard returns bilingual summary with all SLOs', () => {
    newEnv();
    const a = defineSimple('svc_a', 0.999, '30d');
    const b = defineSimple('svc_b', 0.99, '30d');
    slo.record(a.sliId, { good: 10000, total: 10000 });
    slo.record(b.sliId, { good: 992, total: 1000 }); // 8 bad of 1000 with 0.99 = 8/10 = 0.8 consumed → at_risk
    const d = slo.dashboard();
    assertEq(d.total, 2);
    assertEq(typeof d.title_he, 'string');
    assertEq(typeof d.title_en, 'string');
    assert(d.title_he.length > 0 && d.title_en.length > 0);
    const byId = Object.create(null);
    for (const row of d.rows) byId[row.id] = row;
    assertEq(byId[a.sloId].status.key, 'healthy');
    assertEq(byId[b.sloId].status.key, 'at_risk');
    // bilingual status labels present
    assert(typeof byId[a.sloId].status.label_he === 'string');
    assert(typeof byId[a.sloId].status.label_en === 'string');
  });

  // ══════════ 9. rolling-window advance ══════════

  t('rolling window advances: old samples stop contributing to budget', () => {
    const clock = newEnv('2026-04-01T00:00:00.000Z');
    const { sloId, sliId } = defineSimple('svc', 0.99, '7d');
    // Plant a burst of failures 10 days ago (outside the 7d window)
    slo.record(sliId, {
      good: 0, total: 1000,
      timestamp: clock.now() - 10 * MS.DAY,
    });
    // And a perfectly-healthy hour right now
    slo.record(sliId, { good: 1000, total: 1000 });
    const b = slo.currentBudget(sloId);
    assertEq(b.observed_bad, 0, 'old failures should be outside the 7d rolling window');
    assertEq(b.good, 1000);
    assertEq(b.status.key, 'healthy');
  });

  // ══════════ 10. seed SLOs ══════════

  t('seedDefaultSLOs installs the 6 canonical Techno-Kol Uzi SLOs', () => {
    newEnv();
    const seeds = slo.seedDefaultSLOs();
    const names = Object.keys(seeds).sort();
    // Expected seed keys
    const expected = [
      'apiAvailability',
      'apiLatency',
      'dbLatency',
      'pdfLatency',
      'taxExport',
      'wageSlip',
    ];
    assertEq(JSON.stringify(names), JSON.stringify(expected));

    // All 6 SLOs should be listed
    const slos = slo.listSLOs();
    assertEq(slos.length, 6);

    // Check targets / windows on each by name
    const byName = Object.create(null);
    for (const s of slos) byName[s.name] = s;

    assertEq(byName['api_availability_30d'].target, 0.999);
    assertEq(byName['api_availability_30d'].windowKey, '30d');

    assertEq(byName['api_latency_p95_30d'].target, 0.99);
    assertEq(byName['api_latency_p95_30d'].windowKey, '30d');

    assertEq(byName['wage_slip_30d'].target, 0.999);
    assertEq(byName['wage_slip_30d'].windowKey, '30d');

    assertEq(byName['pdf_latency_p95_30d'].target, 0.95);
    assertEq(byName['pdf_latency_p95_30d'].windowKey, '30d');

    assertEq(byName['tax_export_30d'].target, 0.99);
    assertEq(byName['tax_export_30d'].windowKey, '30d');

    assertEq(byName['db_latency_p99_7d'].target, 0.99);
    assertEq(byName['db_latency_p99_7d'].windowKey, '7d');

    // Bilingual labels present on all
    for (const s of slos) {
      assert(typeof s.label_he === 'string' && s.label_he.length > 0, 'he label: ' + s.name);
      assert(typeof s.label_en === 'string' && s.label_en.length > 0, 'en label: ' + s.name);
    }
  });

  // ══════════ 11. BURN_RULES catalog ══════════

  t('BURN_RULES exports the 3 Google SRE rules', () => {
    const rules = slo.BURN_RULES;
    assertEq(rules.length, 3);
    const byId = Object.create(null);
    for (const r of rules) byId[r.id] = r;
    assertEq(byId['fast_1h'].budgetBurn, 0.02);
    assertEq(byId['fast_6h'].budgetBurn, 0.05);
    assertEq(byId['slow_3d'].budgetBurn, 0.10);
    assertEq(byId['fast_1h'].severity, 'page');
    assertEq(byId['slow_3d'].severity, 'ticket');
  });

  // ══════════ summary ══════════

  console.log('\n---');
  console.log(`Total: ${passed + failed}   Passed: ${passed}   Failed: ${failed}`);
  if (failed > 0) {
    console.log('\nFAILURES:');
    for (const r of results) if (!r.ok) console.log('  - ' + r.name + ': ' + r.err);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
})();
