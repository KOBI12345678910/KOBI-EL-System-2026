/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ONYX AI — AnomalyEngine Tests (Agent Y-153)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Run (verified working, Node 20+):
 *   TS_NODE_TRANSPILE_ONLY=true npx node --test --require ts-node/register test/anomaly/anomaly-engine.test.ts
 *
 * Covers:
 *   - Each of the 6 built-in detectors (zScore, MAD, IQR, EWMA, Page-Hinkley, seasonal)
 *   - Streaming mode + batch mode
 *   - Pathological inputs: empty, single point, all zero, constant, NaN-laden
 *   - Alert suppression (cooldown + rate limiting)
 *   - Event emission
 *   - Severity classification
 *   - Extensibility: custom detector, no deletion of built-ins
 *   - Seasonal pattern detection
 *   - Bilingual explanations (Hebrew + English present)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AnomalyEngine,
  AnomalyAlert,
  __internals__,
} from '../../src/anomaly/anomaly-engine';

/* ─────────────────────────────── helpers ─────────────────────────────── */

function fakeClock(start = 1_700_000_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

function seedSeries(n: number, base = 100, amp = 5, seed = 42): number[] {
  // Deterministic pseudo-random (xorshift) — stable test output
  let s = seed >>> 0;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const r = ((s >>> 0) / 0xffffffff) * 2 - 1; // [-1, 1]
    out.push(base + amp * r);
  }
  return out;
}

/* ─────────────────────────────── 1. Pathological: empty series ─────────────────────────────── */

test('1. empty series — analyze returns zero alerts, sane stats', () => {
  const eng = new AnomalyEngine();
  const rep = eng.analyze([]);
  assert.equal(rep.pointCount, 0);
  assert.equal(rep.alerts.length, 0);
  assert.equal(rep.stats.n, 0);
  assert.equal(rep.stats.mean, 0);
  assert.equal(rep.stats.stdev, 0);
  // Every built-in detector should be marked as NOT ran (insufficient samples)
  for (const name of ['zScore', 'mad', 'iqr', 'ewma', 'pageHinkley', 'seasonal']) {
    assert.equal(rep.summary[name].ran, false, `${name} should not run on empty`);
  }
});

/* ─────────────────────────────── 2. Pathological: single point ─────────────────────────────── */

test('2. single point — no detector triggers, no exceptions', () => {
  const eng = new AnomalyEngine();
  const rep = eng.analyze([42]);
  assert.equal(rep.pointCount, 1);
  assert.equal(rep.alerts.length, 0);
  assert.equal(rep.stats.min, 42);
  assert.equal(rep.stats.max, 42);
  assert.equal(rep.stats.mean, 42);
  assert.equal(rep.stats.stdev, 0);
});

/* ─────────────────────────────── 3. Pathological: all zero ─────────────────────────────── */

test('3. all-zero series — no false positives', () => {
  const eng = new AnomalyEngine();
  const rep = eng.analyze(new Array<number>(50).fill(0));
  assert.equal(rep.alerts.length, 0, 'constant zero must not trigger any alert');
  assert.equal(rep.stats.stdev, 0);
  assert.equal(rep.stats.mad, 0);
  assert.equal(rep.stats.iqr, 0);
});

/* ─────────────────────────────── 4. Pathological: constant nonzero series ─────────────────────────────── */

test('4. constant nonzero series — all detectors silent', () => {
  const eng = new AnomalyEngine();
  const rep = eng.analyze(new Array<number>(100).fill(777));
  assert.equal(rep.alerts.length, 0);
  assert.equal(rep.stats.stdev, 0);
  // zScore detector ran but produced nothing (sd === 0 early-exit)
  assert.equal(rep.summary.zScore.ran, true);
  assert.equal(rep.summary.zScore.alerts, 0);
});

/* ─────────────────────────────── 5. Z-Score — classic spike ─────────────────────────────── */

test('5. zScore — detects single spike in Gaussian-like series', () => {
  const eng = new AnomalyEngine({ zScoreThreshold: 3 });
  const series = seedSeries(80, 100, 3);
  series[40] = 250; // huge spike
  const rep = eng.analyze(series);
  const zAlerts = rep.alerts.filter((a) => a.detector === 'zScore');
  assert.ok(zAlerts.length >= 1, 'zScore should flag the spike');
  const spike = zAlerts.find((a) => a.index === 40);
  assert.ok(spike, 'spike at index 40 must be flagged');
  assert.ok(Math.abs(spike!.score) > 3);
  assert.equal(
    ['high', 'critical', 'medium'].includes(spike!.severity),
    true,
  );
});

/* ─────────────────────────────── 6. MAD — robust to contamination ─────────────────────────────── */

test('6. MAD — robust when multiple outliers inflate sample stdev', () => {
  const eng = new AnomalyEngine({ zScoreThreshold: 3, madThreshold: 3.5 });
  const series = seedSeries(60, 50, 2);
  // Inject 4 heavy outliers — these inflate stdev so z-score may miss them,
  // but MAD uses median so it stays robust
  series[10] = 500;
  series[20] = 600;
  series[30] = 700;
  series[40] = 800;
  const rep = eng.analyze(series);
  const madAlerts = rep.alerts.filter((a) => a.detector === 'mad');
  assert.ok(madAlerts.length >= 4, `MAD should flag all 4 outliers, got ${madAlerts.length}`);
});

/* ─────────────────────────────── 7. IQR — Tukey whiskers ─────────────────────────────── */

test('7. IQR — flags points outside 1.5*IQR whiskers', () => {
  const eng = new AnomalyEngine({ iqrK: 1.5 });
  const base = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  const series = [...base, 200, -150]; // clear box-plot outliers
  const rep = eng.analyze(series);
  const iqrAlerts = rep.alerts.filter((a) => a.detector === 'iqr');
  assert.ok(iqrAlerts.length >= 2, 'both extreme tails should trigger');
  const values = iqrAlerts.map((a) => a.value).sort((a, b) => a - b);
  assert.equal(values[0], -150);
  assert.equal(values[values.length - 1], 200);
});

/* ─────────────────────────────── 8. EWMA — gradual drift ─────────────────────────────── */

test('8. EWMA — catches gradual mean shift that z-score might miss', () => {
  const eng = new AnomalyEngine({
    ewmaAlpha: 0.3,
    ewmaL: 3,
  });
  // 50 points at mean 100, then slow drift up to 130
  const series: number[] = [];
  for (let i = 0; i < 50; i++) series.push(100 + (Math.sin(i) * 2));
  for (let i = 0; i < 30; i++) series.push(100 + i + (Math.cos(i) * 2));
  const rep = eng.analyze(series);
  const ewmaAlerts = rep.alerts.filter((a) => a.detector === 'ewma');
  assert.ok(ewmaAlerts.length >= 1, 'EWMA should catch the drift');
});

/* ─────────────────────────────── 9. Page-Hinkley — change-point ─────────────────────────────── */

test('9. Page-Hinkley — detects abrupt mean shift', () => {
  const eng = new AnomalyEngine({ phDelta: 0.01, phLambda: 10 });
  const series: number[] = [];
  for (let i = 0; i < 60; i++) series.push(50 + Math.sin(i) * 0.5);
  for (let i = 0; i < 60; i++) series.push(80 + Math.sin(i) * 0.5); // jump of +30
  const rep = eng.analyze(series);
  const phAlerts = rep.alerts.filter((a) => a.detector === 'pageHinkley');
  assert.ok(phAlerts.length >= 1, 'Page-Hinkley should detect the step change');
  // The first PH alert should land after index 60 (around the change)
  assert.ok(phAlerts[0].index >= 60 && phAlerts[0].index < 120);
});

/* ─────────────────────────────── 10. Seasonal — phase-aware residual ─────────────────────────────── */

test('10. Seasonal — detects break in a weekly pattern', () => {
  const eng = new AnomalyEngine({
    seasonalPeriod: 7,
    seasonalThreshold: 3,
  });
  // Build 6 weeks of a weekly pattern: weekend values are lower
  const pattern = [100, 100, 100, 100, 100, 30, 30];
  const series: number[] = [];
  for (let w = 0; w < 6; w++) {
    for (const v of pattern) series.push(v + (Math.random() > 0.5 ? 0.5 : -0.5));
  }
  // Break the pattern: a weekend day (phase 5) gets a weekday-like value
  series[5 + 7 * 3] = 100; // week 4, phase 5 — should stand out vs phase-5 median ~30
  const rep = eng.analyze(series);
  const seasonalAlerts = rep.alerts.filter((a) => a.detector === 'seasonal');
  assert.ok(
    seasonalAlerts.length >= 1,
    'seasonal detector should flag the broken weekend',
  );
});

/* ─────────────────────────────── 11. Bilingual explanations ─────────────────────────────── */

test('11. alerts contain both Hebrew and English explanations', () => {
  const eng = new AnomalyEngine();
  const series = [...seedSeries(40, 50, 1), 999];
  const rep = eng.analyze(series);
  assert.ok(rep.alerts.length > 0, 'need at least one alert to inspect');
  for (const a of rep.alerts) {
    assert.ok(a.explanation.he.length > 5, 'Hebrew explanation missing');
    assert.ok(a.explanation.en.length > 5, 'English explanation missing');
    // Hebrew string must contain a Hebrew character
    assert.ok(/[\u0590-\u05FF]/.test(a.explanation.he), 'no Hebrew chars in .he');
    // English explanation must be Latin (at least one Latin letter)
    assert.ok(/[A-Za-z]/.test(a.explanation.en), 'no Latin chars in .en');
  }
});

/* ─────────────────────────────── 12. Streaming mode — basic spike ─────────────────────────────── */

test('12. streaming update() — emits fired events for a spike', () => {
  const clock = fakeClock();
  const eng = new AnomalyEngine({ now: clock.now, cooldownMs: 0 });
  const fired: AnomalyAlert[] = [];
  eng.on('fired', (p) => fired.push(p as AnomalyAlert));

  // Prime with 50 stable points
  for (let i = 0; i < 50; i++) {
    eng.update(100 + (i % 2 ? 0.3 : -0.3));
    clock.advance(10);
  }
  // Inject a spike
  eng.update(500);
  clock.advance(10);

  assert.ok(fired.length > 0, 'streaming spike should fire at least once');
  const spikeAlert = fired.find((a) => a.value === 500);
  assert.ok(spikeAlert, 'spike event not emitted');
});

/* ─────────────────────────────── 13. Alert suppression — cooldown ─────────────────────────────── */

test('13. suppression — cooldown blocks repeated alerts of same key', () => {
  const clock = fakeClock();
  const eng = new AnomalyEngine({
    now: clock.now,
    cooldownMs: 60_000,
    maxAlertsPerWindow: 1000,
    zScoreThreshold: 2.5,
  });

  const allAlerts: AnomalyAlert[] = [];
  const firedAlerts: AnomalyAlert[] = [];
  eng.on('alert', (p) => allAlerts.push(p as AnomalyAlert));
  eng.on('fired', (p) => firedAlerts.push(p as AnomalyAlert));

  // Batch analyze a series with many zScore spikes
  const series = new Array<number>(30).fill(100);
  for (let i = 5; i < 30; i += 3) series[i] = 300; // many spikes
  eng.analyze(series, 'vendor-A');

  assert.ok(allAlerts.length > 1, 'multiple raw alerts generated');
  // Because all share same detector+tag and clock does not advance, only first should fire
  assert.equal(firedAlerts.length, 1, 'cooldown should suppress the rest');

  // Advance past cooldown — next analyze should fire again
  clock.advance(61_000);
  eng.analyze([100, 100, 300, 100], 'vendor-A');
  assert.ok(firedAlerts.length >= 2, 'after cooldown, new alert should fire');
});

/* ─────────────────────────────── 14. Suppression — rate-limit window ─────────────────────────────── */

test('14. suppression — maxAlertsPerWindow enforced per key', () => {
  const clock = fakeClock();
  const eng = new AnomalyEngine({
    now: clock.now,
    cooldownMs: 0, // no cooldown — test rate limit in isolation
    maxAlertsPerWindow: 3,
    suppressionWindowMs: 300_000,
    zScoreThreshold: 2,
  });

  const firedByDetector: Record<string, number> = {};
  eng.on('fired', (p) => {
    const a = p as AnomalyAlert;
    firedByDetector[a.detector] = (firedByDetector[a.detector] ?? 0) + 1;
  });

  // Each batch produces spike alert(s); call repeatedly within the window
  for (let i = 0; i < 10; i++) {
    eng.analyze([100, 100, 100, 100, 100, 100, 100, 100, 100, 500], 'metric-1');
    clock.advance(1_000); // still within the 5-minute window
  }

  // Rate limit is enforced per (detector + tag) key, so each detector that
  // fires should max out at exactly maxAlertsPerWindow (3)
  for (const [detector, count] of Object.entries(firedByDetector)) {
    assert.ok(
      count <= 3,
      `detector ${detector} fired ${count} — must be ≤ maxAlertsPerWindow (3)`,
    );
  }
  // At least one detector should have hit the cap
  const capped = Object.values(firedByDetector).some((c) => c === 3);
  assert.ok(capped, 'at least one detector must hit the rate cap');
});

/* ─────────────────────────────── 15. clearSuppression unblocks ─────────────────────────────── */

test('15. clearSuppression — upgrade-only reset of cooldown tracker', () => {
  const clock = fakeClock();
  const eng = new AnomalyEngine({
    now: clock.now,
    cooldownMs: 60_000,
    zScoreThreshold: 2,
    // disable the other detectors so we isolate zScore in this test
    madThreshold: 1_000,
    iqrK: 1_000,
    ewmaL: 1_000,
    phLambda: 1_000_000,
    seasonalThreshold: 1_000,
  });
  const firedZ: AnomalyAlert[] = [];
  eng.on('fired', (p) => {
    const a = p as AnomalyAlert;
    if (a.detector === 'zScore') firedZ.push(a);
  });

  eng.analyze([100, 100, 100, 100, 100, 100, 100, 100, 100, 500], 'x');
  assert.equal(firedZ.length, 1);

  // Second analyze within cooldown — must be suppressed
  eng.analyze([100, 100, 100, 100, 100, 100, 100, 100, 100, 500], 'x');
  assert.equal(firedZ.length, 1, 'still suppressed by cooldown');

  eng.clearSuppression('zScore', 'x');
  eng.analyze([100, 100, 100, 100, 100, 100, 100, 100, 100, 500], 'x');
  assert.equal(firedZ.length, 2, 'after clear, new alert fires');
});

/* ─────────────────────────────── 16. Custom detector — extensibility (append-only) ─────────────────────────────── */

test('16. addDetector — custom detectors run; cannot override built-ins', () => {
  const eng = new AnomalyEngine({ zScoreThreshold: 100 }); // disable zScore noise

  let called = 0;
  eng.addDetector('myDetector', (xs, self) => {
    called++;
    // Flag anything above 1000
    const alerts: AnomalyAlert[] = [];
    for (let i = 0; i < xs.length; i++) {
      if (xs[i] > 1000) {
        alerts.push({
          detector: 'myDetector',
          index: i,
          value: xs[i],
          expected: 0,
          score: xs[i],
          threshold: 1000,
          severity: 'high',
          explanation: {
            he: 'גלאי מותאם — ערך מעל 1000',
            en: 'custom detector — value above 1000',
          },
          timestamp: Date.now(),
        });
      }
    }
    return alerts;
  });

  // Try to shadow built-in — should be ignored
  let overrideCalled = 0;
  eng.addDetector('zScore', () => {
    overrideCalled++;
    return [];
  });

  const rep = eng.analyze([1, 2, 3, 5000, 4, 5]);
  assert.equal(called, 1, 'custom detector ran once');
  assert.equal(overrideCalled, 0, 'built-in override rejected');
  const custom = rep.alerts.filter((a) => a.detector === 'myDetector');
  assert.equal(custom.length, 1);
  assert.equal(custom[0].value, 5000);
});

/* ─────────────────────────────── 17. NaN / Infinity / mixed junk sanitation ─────────────────────────────── */

test('17. sanitization — NaN/Infinity ignored, valid values retained', () => {
  const eng = new AnomalyEngine();
  const series = [
    100,
    101,
    Number.NaN,
    102,
    Number.POSITIVE_INFINITY,
    99,
    Number.NEGATIVE_INFINITY,
    100,
    98,
    101,
    100,
    99,
    500,
  ];
  const rep = eng.analyze(series);
  assert.equal(rep.pointCount, 10, 'only 10 finite numbers expected');
  // The 500 at end should still be flagged
  assert.ok(rep.alerts.some((a) => a.value === 500));
});

/* ─────────────────────────────── 18. Severity classification via internals ─────────────────────────────── */

test('18. classifySeverity — ladder from info to critical', () => {
  const { classifySeverity } = __internals__;
  assert.equal(classifySeverity(0, 3), 'info');
  assert.equal(classifySeverity(3, 3), 'low');
  assert.equal(classifySeverity(4.8, 3), 'medium');
  assert.equal(classifySeverity(8, 3), 'high');
  assert.equal(classifySeverity(13, 3), 'critical');
  assert.equal(classifySeverity(-13, 3), 'critical', 'negative scores symmetric');
  assert.equal(classifySeverity(Number.NaN, 3), 'info', 'NaN falls back to info');
  assert.equal(classifySeverity(5, 0), 'info', 'zero threshold falls back to info');
});

/* ─────────────────────────────── 19. Stream reset keeps handlers + detectors ─────────────────────────────── */

test('19. resetStream — clears state but keeps subscribers and detectors', () => {
  const eng = new AnomalyEngine();
  let fired = 0;
  eng.on('fired', () => fired++);
  eng.addDetector('customK', () => []);

  for (let i = 0; i < 30; i++) eng.update(100);
  assert.equal(eng.getHistory().length, 30);

  eng.resetStream();
  assert.equal(eng.getHistory().length, 0);
  // Subscribers preserved — verify by triggering a batch alert
  eng.analyze([100, 100, 100, 100, 100, 100, 100, 100, 100, 9999]);
  assert.ok(fired >= 1, 'subscribers preserved after resetStream');
});

/* ─────────────────────────────── 20. Internal helpers: median/quantile ─────────────────────────────── */

test('20. internal stats helpers — median, quantile, MAD sanity', () => {
  const { median, quantile, madConsistent, mean, stdev } = __internals__;

  assert.equal(median([]), 0);
  assert.equal(median([5]), 5);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([1, 2, 3, 4, 5]), 3);

  assert.equal(quantile([1, 2, 3, 4, 5], 0), 1);
  assert.equal(quantile([1, 2, 3, 4, 5], 1), 5);
  assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3);

  const xs = [1, 1, 1, 1, 1];
  assert.equal(mean(xs), 1);
  assert.equal(stdev(xs), 0);
  assert.equal(madConsistent(xs), 0);

  // Non-trivial MAD
  const ys = [1, 1, 2, 2, 4, 6, 9];
  const m = madConsistent(ys);
  assert.ok(m > 0);
});

/* ─────────────────────────────── 21. Full end-to-end ERP scenario ─────────────────────────────── */

test('21. end-to-end — daily revenue stream with spike + drift', () => {
  const clock = fakeClock();
  const eng = new AnomalyEngine({
    now: clock.now,
    zScoreThreshold: 3,
    madThreshold: 3.5,
    phLambda: 20,
    cooldownMs: 1000,
  });

  const firedByDetector: Record<string, number> = {};
  eng.on('fired', (p) => {
    const a = p as AnomalyAlert;
    firedByDetector[a.detector] = (firedByDetector[a.detector] ?? 0) + 1;
  });

  // 90 days: baseline 10_000 ± noise
  const revenue = seedSeries(90, 10_000, 150, 99);
  // Inject: big spike at day 45, drift starting day 70
  revenue[45] = 50_000;
  for (let i = 70; i < 90; i++) revenue[i] += 2000;

  const rep = eng.analyze(revenue, 'daily-revenue');
  assert.ok(rep.alerts.length > 0);
  assert.ok(rep.stats.n === 90);
  // At least zScore OR MAD should catch the spike
  const spikeCaught = rep.alerts.some(
    (a) => a.index === 45 && (a.detector === 'zScore' || a.detector === 'mad'),
  );
  assert.ok(spikeCaught, 'massive spike must be caught');

  // Page-Hinkley or EWMA should catch drift (index >= 70)
  const driftCaught = rep.alerts.some(
    (a) => a.index >= 70 && (a.detector === 'pageHinkley' || a.detector === 'ewma'),
  );
  assert.ok(driftCaught, 'drift must be caught by PH or EWMA');
});
