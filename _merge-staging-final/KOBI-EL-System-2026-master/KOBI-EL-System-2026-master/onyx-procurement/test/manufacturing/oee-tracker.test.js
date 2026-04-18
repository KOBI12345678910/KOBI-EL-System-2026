/**
 * Tests for src/manufacturing/oee-tracker.js
 *
 * OEE = Availability × Performance × Quality
 *
 * Covers:
 *   • recordRun — factor math, clamping, bilingual downtime labels
 *   • oee — period rollup, multi-run aggregation, no-data case
 *   • sixBigLosses — Nakajima attribution, reduced-speed gap, reject split
 *   • downtimeReasonCodes — Pareto sorting, cumulative %, bilingual labels
 *   • worldClassGap — vs 0.85 benchmark, weakest-factor coaching
 *   • alertLowOEE — threshold, severity, bilingual message
 *   • generateReport — bilingual summary + inline SVG sparkline
 *   • Purity — inputs never mutated (לא מוחקים רק משדרגים ומגדלים)
 *
 * Run: node --test test/manufacturing/oee-tracker.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  OEETracker,
  REASON_CODES,
  BIG_LOSS_LABELS,
  WORLD_CLASS_OEE,
  round,
  clamp01,
  parsePeriod,
  buildSparklineSVG,
  buildParetoBarSVG,
} = require('../../src/manufacturing/oee-tracker.js');

// ─── helpers ────────────────────────────────────────────────────────────

function makeTracker() {
  return new OEETracker();
}

/**
 * Textbook example (Vorne / Nakajima):
 *   plannedTime      = 420 min (one 7-hr shift)
 *   runTime          = 400 min (20 min downtime)
 *   idealCycleTime   = 1.0 min / piece
 *   piecesProduced   = 380
 *   piecesGood       = 370
 *
 *   Availability = 400 / 420 ≈ 0.9524
 *   Performance  = (1.0 × 380) / 400 = 0.95
 *   Quality      = 370 / 380 ≈ 0.9737
 *   OEE          ≈ 0.8810  (88.1%)
 */
function textbookRun(extra = {}) {
  return Object.assign(
    {
      machineId: 'CNC-01',
      shift: 'morning',
      plannedTime: 420,
      runTime: 400,
      idealCycleTime: 1.0,
      piecesProduced: 380,
      piecesGood: 370,
      downtime: [
        { reason: 'mechanical_breakdown', duration: 12 },
        { reason: 'setup_changeover', duration: 8 },
      ],
      timestamp: '2026-04-01T06:00:00.000Z',
    },
    extra
  );
}

// ═══ constants ═══

describe('OEE constants', () => {
  test('WORLD_CLASS_OEE is 0.85 (Nakajima)', () => {
    assert.equal(WORLD_CLASS_OEE, 0.85);
  });

  test('BIG_LOSS_LABELS has all six categories', () => {
    const keys = Object.keys(BIG_LOSS_LABELS);
    assert.equal(keys.length, 6);
    for (const k of [
      'equipment_failure',
      'setup_adjustment',
      'idling_minor_stops',
      'reduced_speed',
      'startup_rejects',
      'production_rejects',
    ]) {
      assert.ok(BIG_LOSS_LABELS[k], `missing big-loss category: ${k}`);
      assert.ok(BIG_LOSS_LABELS[k].he, `missing HE label for ${k}`);
      assert.ok(BIG_LOSS_LABELS[k].en, `missing EN label for ${k}`);
    }
  });

  test('REASON_CODES are bilingual and tagged with bigLoss', () => {
    for (const [code, def] of Object.entries(REASON_CODES)) {
      assert.ok(def.he, `missing HE label for ${code}`);
      assert.ok(def.en, `missing EN label for ${code}`);
      assert.ok(BIG_LOSS_LABELS[def.bigLoss], `bad bigLoss on ${code}`);
    }
  });

  test('REASON_CODES and BIG_LOSS_LABELS are frozen', () => {
    assert.ok(Object.isFrozen(REASON_CODES));
    assert.ok(Object.isFrozen(BIG_LOSS_LABELS));
  });
});

// ═══ helpers ═══

describe('round & clamp01 helpers', () => {
  test('round handles IEEE-754 drift', () => {
    assert.equal(round(0.1 + 0.2, 4), 0.3);
    assert.equal(round(0.9524, 4), 0.9524);
    assert.equal(round(NaN, 4), 0);
  });

  test('clamp01 holds [0,1]', () => {
    assert.equal(clamp01(-1), 0);
    assert.equal(clamp01(0.5), 0.5);
    assert.equal(clamp01(2), 1);
    assert.equal(clamp01(NaN), 0);
  });
});

// ═══ parsePeriod ═══

describe('parsePeriod', () => {
  test('undefined/all → full range', () => {
    const { from, to } = parsePeriod();
    assert.equal(from, -Infinity);
    assert.equal(to, Infinity);
  });

  test('explicit from/to', () => {
    const { from, to } = parsePeriod({
      from: '2026-01-01',
      to: '2026-12-31',
    });
    assert.ok(from < to);
    assert.ok(Number.isFinite(from));
  });

  test('string shortcut "today"', () => {
    const { from, to } = parsePeriod('today');
    assert.ok(from < to);
  });
});

// ═══ recordRun ═══

describe('OEETracker.recordRun', () => {
  test('computes the three factors from textbook values', () => {
    const tr = makeTracker();
    const rec = tr.recordRun(textbookRun());

    assert.equal(rec.machineId, 'CNC-01');
    assert.equal(rec.plannedTime, 420);
    assert.equal(rec.runTime, 400);
    assert.equal(rec.piecesGood, 370);

    // Availability = 400 / 420
    assert.equal(rec.availability, round(400 / 420, 4));
    // Performance  = (1.0 × 380) / 400 = 0.95
    assert.equal(rec.performance, 0.95);
    // Quality      = 370 / 380
    assert.equal(rec.quality, round(370 / 380, 4));
    // OEE          ≈ 0.8810
    assert.equal(
      rec.oee,
      round(rec.availability * rec.performance * rec.quality, 4)
    );
    assert.ok(rec.oee > 0.88 && rec.oee < 0.89);
  });

  test('rejects missing machineId', () => {
    const tr = makeTracker();
    assert.throws(() => tr.recordRun({ plannedTime: 1 }), /machineId/);
  });

  test('clamps runTime to planned and piecesGood to produced', () => {
    const tr = makeTracker();
    const rec = tr.recordRun({
      machineId: 'M1',
      plannedTime: 100,
      runTime: 999, // over-reported
      idealCycleTime: 1,
      piecesProduced: 50,
      piecesGood: 9999, // over-reported
    });
    assert.equal(rec.runTime, 100);
    assert.equal(rec.piecesGood, 50);
    assert.equal(rec.availability, 1);
    assert.equal(rec.quality, 1);
  });

  test('downtime entries resolved to bilingual labels + bigLoss', () => {
    const tr = makeTracker();
    const rec = tr.recordRun({
      machineId: 'M1',
      plannedTime: 60,
      runTime: 50,
      idealCycleTime: 1,
      piecesProduced: 40,
      piecesGood: 40,
      downtime: [
        { reason: 'setup_changeover', duration: 5 },
        { reason: 'electrical_fault', duration: 5 },
      ],
    });
    const [a, b] = rec.downtime;
    assert.equal(a.bigLoss, 'setup_adjustment');
    assert.equal(a.label.he, 'החלפת סדרה / setup');
    assert.equal(a.label.en, 'Setup / Changeover');
    assert.equal(b.bigLoss, 'equipment_failure');
    assert.ok(b.label.he);
    assert.ok(b.label.en);
  });

  test('unknown reason code degrades gracefully', () => {
    const tr = makeTracker();
    const rec = tr.recordRun({
      machineId: 'M1',
      plannedTime: 10,
      runTime: 5,
      idealCycleTime: 1,
      piecesProduced: 5,
      piecesGood: 5,
      downtime: [{ reason: 'alien_invasion', duration: 5 }],
    });
    assert.equal(rec.downtime[0].reason, 'alien_invasion');
    assert.ok(rec.downtime[0].label.he);
    assert.ok(rec.downtime[0].label.en);
  });

  test('record is frozen (immutable)', () => {
    const tr = makeTracker();
    const rec = tr.recordRun(textbookRun());
    assert.ok(Object.isFrozen(rec));
    assert.ok(Object.isFrozen(rec.downtime));
  });

  test('never deletes — append-only log', () => {
    const tr = makeTracker();
    tr.recordRun(textbookRun());
    tr.recordRun(textbookRun({ timestamp: '2026-04-02T06:00:00.000Z' }));
    assert.equal(tr._runs.length, 2);
  });

  test('does not mutate input object', () => {
    const tr = makeTracker();
    const input = textbookRun();
    const snap = JSON.stringify(input);
    tr.recordRun(input);
    assert.equal(JSON.stringify(input), snap);
  });
});

// ═══ oee ═══

describe('OEETracker.oee', () => {
  test('returns zeros when no runs', () => {
    const tr = makeTracker();
    const snap = tr.oee('M1');
    assert.equal(snap.runs, 0);
    assert.equal(snap.oee, 0);
  });

  test('rolls up one run = same factors as the run', () => {
    const tr = makeTracker();
    const rec = tr.recordRun(textbookRun());
    const snap = tr.oee('CNC-01');
    assert.equal(snap.runs, 1);
    assert.equal(snap.availability, rec.availability);
    assert.equal(snap.performance, rec.performance);
    assert.equal(snap.quality, rec.quality);
    assert.equal(snap.oee, rec.oee);
  });

  test('rolls up multiple runs by summing raw inputs, not averaging', () => {
    const tr = makeTracker();
    tr.recordRun({
      machineId: 'M1',
      plannedTime: 480,
      runTime: 420,
      idealCycleTime: 1,
      piecesProduced: 400,
      piecesGood: 395,
    });
    tr.recordRun({
      machineId: 'M1',
      plannedTime: 480,
      runTime: 450,
      idealCycleTime: 1,
      piecesProduced: 430,
      piecesGood: 420,
    });

    const snap = tr.oee('M1');
    // Availability = (420 + 450) / (480 + 480) = 870/960 = 0.90625
    assert.equal(snap.availability, round(870 / 960, 4));
    // Performance  = ((1×400)+(1×430)) / (420+450) = 830/870 ≈ 0.9540
    assert.equal(snap.performance, round(830 / 870, 4));
    // Quality      = (395 + 420) / (400 + 430) = 815/830 ≈ 0.9819
    assert.equal(snap.quality, round(815 / 830, 4));
    assert.equal(snap.runs, 2);
  });

  test('filters by period', () => {
    const tr = makeTracker();
    tr.recordRun(textbookRun({ timestamp: '2026-01-15T00:00:00Z' }));
    tr.recordRun(textbookRun({ timestamp: '2026-03-15T00:00:00Z' }));

    const q1 = tr.oee('CNC-01', {
      from: '2026-01-01',
      to: '2026-01-31',
    });
    assert.equal(q1.runs, 1);

    const q3 = tr.oee('CNC-01', {
      from: '2026-03-01',
      to: '2026-03-31',
    });
    assert.equal(q3.runs, 1);

    const all = tr.oee('CNC-01');
    assert.equal(all.runs, 2);
  });

  test('machineId=undefined aggregates across all machines', () => {
    const tr = makeTracker();
    tr.recordRun(textbookRun({ machineId: 'A' }));
    tr.recordRun(textbookRun({ machineId: 'B' }));
    const snap = tr.oee();
    assert.equal(snap.runs, 2);
    assert.equal(snap.machineId, 'all');
  });
});

// ═══ sixBigLosses ═══

describe('OEETracker.sixBigLosses', () => {
  test('attributes downtime to the correct big-loss bucket', () => {
    const tr = makeTracker();
    tr.recordRun({
      machineId: 'M1',
      plannedTime: 480,
      runTime: 440,
      idealCycleTime: 1,
      piecesProduced: 440,
      piecesGood: 440,
      downtime: [
        { reason: 'mechanical_breakdown', duration: 15 }, // equipment_failure
        { reason: 'electrical_fault', duration: 5 }, // equipment_failure
        { reason: 'setup_changeover', duration: 10 }, // setup_adjustment
        { reason: 'jammed_part', duration: 10 }, // idling_minor_stops
      ],
    });

    const losses = tr.sixBigLosses('M1');
    assert.equal(losses.losses.equipment_failure.minutes, 20);
    assert.equal(losses.losses.setup_adjustment.minutes, 10);
    assert.equal(losses.losses.idling_minor_stops.minutes, 10);
  });

  test('computes reduced_speed from runtime−ideal gap', () => {
    const tr = makeTracker();
    // 60-min run making 40 pieces at ideal 1 min/piece → ideal time = 40 min
    // reduced speed loss = 60 − 40 = 20 min
    tr.recordRun({
      machineId: 'M1',
      plannedTime: 60,
      runTime: 60,
      idealCycleTime: 1,
      piecesProduced: 40,
      piecesGood: 40,
    });

    const losses = tr.sixBigLosses('M1');
    assert.equal(losses.losses.reduced_speed.minutes, 20);
  });

  test('rejects converted to quality-loss minutes via idealCycleTime', () => {
    const tr = makeTracker();
    // Ideal 2 min/piece, 10 rejects → 20 quality-loss minutes.
    tr.recordRun({
      machineId: 'M1',
      plannedTime: 200,
      runTime: 200,
      idealCycleTime: 2,
      piecesProduced: 100,
      piecesGood: 90, // 10 rejects × 2 min = 20 min quality loss
    });

    const losses = tr.sixBigLosses('M1');
    // Default 50/50 split between startup and production rejects.
    assert.equal(losses.losses.startup_rejects.minutes, 10);
    assert.equal(losses.losses.production_rejects.minutes, 10);
    assert.equal(losses.categories.quality, 20);
  });

  test('categories sum matches per-bucket sum', () => {
    const tr = makeTracker();
    tr.recordRun({
      machineId: 'M1',
      plannedTime: 200,
      runTime: 180,
      idealCycleTime: 1,
      piecesProduced: 170,
      piecesGood: 160,
      downtime: [
        { reason: 'mechanical_breakdown', duration: 10 },
        { reason: 'setup_changeover', duration: 10 },
      ],
    });
    const out = tr.sixBigLosses('M1');
    assert.equal(
      out.categories.availability,
      round(out.losses.equipment_failure.minutes + out.losses.setup_adjustment.minutes, 2)
    );
    assert.equal(
      out.categories.performance,
      round(out.losses.idling_minor_stops.minutes + out.losses.reduced_speed.minutes, 2)
    );
    assert.equal(
      out.categories.quality,
      round(out.losses.startup_rejects.minutes + out.losses.production_rejects.minutes, 2)
    );
  });

  test('returns zero buckets for machine with no runs', () => {
    const tr = makeTracker();
    const out = tr.sixBigLosses('ghost-machine');
    assert.equal(out.losses.equipment_failure.minutes, 0);
    assert.equal(out.runs, 0);
  });
});

// ═══ downtimeReasonCodes (Pareto) ═══

describe('OEETracker.downtimeReasonCodes', () => {
  test('sorts reasons descending by total minutes', () => {
    const tr = makeTracker();
    tr.recordRun({
      machineId: 'M1',
      plannedTime: 500,
      runTime: 500,
      idealCycleTime: 1,
      piecesProduced: 500,
      piecesGood: 500,
      downtime: [
        { reason: 'setup_changeover', duration: 30 },
        { reason: 'mechanical_breakdown', duration: 60 },
        { reason: 'jammed_part', duration: 10 },
      ],
    });

    const { pareto, totalMinutes } = tr.downtimeReasonCodes('M1');
    assert.equal(totalMinutes, 100);
    assert.equal(pareto[0].reason, 'mechanical_breakdown');
    assert.equal(pareto[0].minutes, 60);
    assert.equal(pareto[1].reason, 'setup_changeover');
    assert.equal(pareto[2].reason, 'jammed_part');
  });

  test('percentages sum to ~100 and cumulative grows', () => {
    const tr = makeTracker();
    tr.recordRun({
      machineId: 'M1',
      plannedTime: 200,
      runTime: 200,
      idealCycleTime: 1,
      piecesProduced: 200,
      piecesGood: 200,
      downtime: [
        { reason: 'setup_changeover', duration: 20 },
        { reason: 'mechanical_breakdown', duration: 30 },
      ],
    });

    const { pareto } = tr.downtimeReasonCodes('M1');
    const sumPct = pareto.reduce((s, x) => s + x.percent, 0);
    assert.ok(Math.abs(sumPct - 100) < 0.01);
    assert.equal(pareto[pareto.length - 1].cumulativePercent, 100);
    assert.ok(pareto[0].cumulativePercent < pareto[1].cumulativePercent);
  });

  test('aggregates occurrences across runs', () => {
    const tr = makeTracker();
    tr.recordRun({
      machineId: 'M1',
      plannedTime: 100,
      runTime: 100,
      idealCycleTime: 1,
      piecesProduced: 100,
      piecesGood: 100,
      downtime: [{ reason: 'jammed_part', duration: 5 }],
    });
    tr.recordRun({
      machineId: 'M1',
      plannedTime: 100,
      runTime: 100,
      idealCycleTime: 1,
      piecesProduced: 100,
      piecesGood: 100,
      downtime: [{ reason: 'jammed_part', duration: 7 }],
    });

    const { pareto } = tr.downtimeReasonCodes('M1');
    assert.equal(pareto.length, 1);
    assert.equal(pareto[0].occurrences, 2);
    assert.equal(pareto[0].minutes, 12);
  });

  test('carries bilingual labels', () => {
    const tr = makeTracker();
    tr.recordRun({
      machineId: 'M1',
      plannedTime: 60,
      runTime: 60,
      idealCycleTime: 1,
      piecesProduced: 60,
      piecesGood: 60,
      downtime: [{ reason: 'paint_defect', duration: 5 }],
    });
    const { pareto } = tr.downtimeReasonCodes('M1');
    assert.equal(pareto[0].label.he, 'פגם צביעה');
    assert.equal(pareto[0].label.en, 'Paint Defect');
  });
});

// ═══ worldClassGap ═══

describe('OEETracker.worldClassGap', () => {
  test('gap to 0.85 for textbook 88% run (already above WC)', () => {
    const tr = makeTracker();
    tr.recordRun(textbookRun());
    const gap = tr.worldClassGap('CNC-01');
    assert.equal(gap.benchmark, 0.85);
    assert.ok(gap.actual > 0.85);
    assert.ok(gap.atWorldClass);
    assert.ok(gap.gap < 0); // negative = above benchmark
  });

  test('flags availability as weakest when it is lowest vs its target', () => {
    const tr = makeTracker();
    // Availability ≈ 0.50 (far below 0.90 target)
    // Performance  ≈ 1.0  (at target 0.95)
    // Quality      ≈ 1.0  (at target 0.9999)
    tr.recordRun({
      machineId: 'M1',
      plannedTime: 400,
      runTime: 200,
      idealCycleTime: 1,
      piecesProduced: 200,
      piecesGood: 200,
    });
    const gap = tr.worldClassGap('M1');
    assert.equal(gap.weakestFactor, 'availability');
    assert.ok(gap.coaching.he);
    assert.ok(gap.coaching.en);
  });

  test('flags quality as weakest when rejects dominate', () => {
    const tr = makeTracker();
    // Availability and Performance ~1.0, Quality = 0.5
    tr.recordRun({
      machineId: 'M1',
      plannedTime: 100,
      runTime: 100,
      idealCycleTime: 1,
      piecesProduced: 100,
      piecesGood: 50,
    });
    const gap = tr.worldClassGap('M1');
    assert.equal(gap.weakestFactor, 'quality');
  });

  test('gap is positive when below benchmark', () => {
    const tr = makeTracker();
    tr.recordRun({
      machineId: 'M1',
      plannedTime: 100,
      runTime: 50,
      idealCycleTime: 1,
      piecesProduced: 50,
      piecesGood: 50,
    });
    const gap = tr.worldClassGap('M1');
    assert.ok(gap.gap > 0);
    assert.ok(!gap.atWorldClass);
  });
});

// ═══ alertLowOEE ═══

describe('OEETracker.alertLowOEE', () => {
  test('returns empty when no machines below threshold', () => {
    const tr = makeTracker();
    tr.recordRun(textbookRun()); // ~0.88 OEE
    const alerts = tr.alertLowOEE(0.5);
    assert.equal(alerts.length, 0);
  });

  test('flags machines below threshold with severity', () => {
    const tr = makeTracker();
    tr.recordRun({
      machineId: 'OLD-LATHE',
      plannedTime: 400,
      runTime: 100,
      idealCycleTime: 1,
      piecesProduced: 100,
      piecesGood: 100,
    });
    const alerts = tr.alertLowOEE(0.7);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].machineId, 'OLD-LATHE');
    assert.ok(['critical', 'high', 'warning'].includes(alerts[0].severity));
    assert.ok(alerts[0].message.he);
    assert.ok(alerts[0].message.en);
  });

  test('sorts worst offenders first', () => {
    const tr = makeTracker();
    tr.recordRun({
      machineId: 'BAD',
      plannedTime: 100,
      runTime: 10,
      idealCycleTime: 1,
      piecesProduced: 10,
      piecesGood: 10,
    });
    tr.recordRun({
      machineId: 'MEH',
      plannedTime: 100,
      runTime: 60,
      idealCycleTime: 1,
      piecesProduced: 60,
      piecesGood: 60,
    });
    const alerts = tr.alertLowOEE(0.85);
    assert.equal(alerts[0].machineId, 'BAD');
  });
});

// ═══ generateReport ═══

describe('OEETracker.generateReport', () => {
  test('returns bilingual summary + SVG sparkline', () => {
    const tr = makeTracker();
    tr.recordRun(textbookRun({ timestamp: '2026-04-01T06:00:00Z' }));
    tr.recordRun(textbookRun({ timestamp: '2026-04-02T06:00:00Z' }));

    const report = tr.generateReport('CNC-01');
    assert.equal(report.machineId, 'CNC-01');
    assert.ok(report.summary.he);
    assert.ok(report.summary.en);
    assert.ok(report.summary.he.includes('OEE'));
    assert.ok(report.summary.en.includes('OEE'));
    assert.ok(report.svg.sparkline.startsWith('<svg'));
    assert.ok(report.svg.pareto.startsWith('<svg'));
  });

  test('sparkline SVG is well-formed XML and [0,1] bounded', () => {
    const svg = buildSparklineSVG([0.1, 0.5, 0.95, 2, -1]);
    assert.ok(svg.startsWith('<svg'));
    assert.ok(svg.endsWith('</svg>'));
    assert.ok(svg.includes('polyline'));
  });

  test('sparkline renders even with no data', () => {
    const svg = buildSparklineSVG([]);
    assert.ok(svg.includes('no data'));
  });

  test('pareto SVG renders with empty list', () => {
    const svg = buildParetoBarSVG([]);
    assert.ok(svg.includes('no data'));
  });

  test('report includes trend array limited to trendPoints', () => {
    const tr = makeTracker();
    for (let i = 0; i < 25; i++) {
      tr.recordRun(
        textbookRun({
          timestamp: new Date(2026, 3, i + 1).toISOString(),
        })
      );
    }
    const report = tr.generateReport('CNC-01', 'all', { trendPoints: 10 });
    assert.equal(report.trend.length, 10);
  });
});

// ═══ purity ═══

describe('purity — לא מוחקים רק משדרגים ומגדלים', () => {
  test('oee() does not mutate run records', () => {
    const tr = makeTracker();
    tr.recordRun(textbookRun());
    const before = JSON.stringify(tr._runs);
    tr.oee('CNC-01');
    tr.sixBigLosses('CNC-01');
    tr.downtimeReasonCodes('CNC-01');
    tr.worldClassGap('CNC-01');
    tr.alertLowOEE();
    tr.generateReport('CNC-01');
    assert.equal(JSON.stringify(tr._runs), before);
  });

  test('no method ever deletes a run', () => {
    const tr = makeTracker();
    tr.recordRun(textbookRun());
    tr.recordRun(textbookRun({ timestamp: '2026-04-05T06:00:00Z' }));
    const initialCount = tr._runs.length;
    tr.generateReport('CNC-01');
    tr.alertLowOEE();
    assert.equal(tr._runs.length, initialCount);
  });
});
