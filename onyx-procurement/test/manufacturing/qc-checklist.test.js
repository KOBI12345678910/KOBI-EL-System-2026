/**
 * Tests for src/manufacturing/qc-checklist.js
 *
 * Agent Y-036 — QC Checklist Engine (metal fabrication).
 *
 * Covers:
 *   • AQL sampling tables — lot-size letter, sample size, Ac/Re per letter × AQL
 *   • samplingPlan helper — normal / tightened / reduced severities
 *   • defineChecklist       — validation, versioning, never-delete semantics
 *   • createInspection      — plan attachment, sample size derivation
 *   • recordResult          — pass-fail + auto-computed measurement pass
 *   • verdictForInspection  — pass/fail with AQL rules + missing-item coverage
 *   • rejectLot             — NCR creation, inspection status transition
 *   • certificateOfConformance — guard against non-pass verdicts
 *   • controlCharts         — X-bar / R limits vs. known Montgomery constants
 *   • cpk                   — process capability index math
 *
 * Run: node --test test/manufacturing/qc-checklist.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  QCChecklist,
  samplingPlan,
  lotSizeLetter,
  aqlKey,
  AQL_CODE_SAMPLE_SIZE,
  AQL_SAMPLE_PLANS_NORMAL,
  AQL_SAMPLE_PLANS_TIGHTENED,
  AQL_SAMPLE_PLANS_REDUCED,
  CONTROL_CHART_CONSTANTS,
  QC_LABELS_HE,
  QC_LABELS_EN,
  ISRAELI_DEFENSE_STANDARDS,
} = require('../../src/manufacturing/qc-checklist.js');

// ═══════════════════════════════════════════════════════════════════════════
// 1. AQL table correctness — spot-check canonical MIL-STD-105E values
// ═══════════════════════════════════════════════════════════════════════════

describe('lot-size letter (MIL-STD-105E Table I)', () => {
  test('general level II — small lot', () => {
    assert.equal(lotSizeLetter(5,   'II'), 'A');
    assert.equal(lotSizeLetter(10,  'II'), 'B');
    assert.equal(lotSizeLetter(20,  'II'), 'C');
    assert.equal(lotSizeLetter(40,  'II'), 'D');
  });

  test('general level II — medium lot', () => {
    assert.equal(lotSizeLetter(75,   'II'), 'E');
    assert.equal(lotSizeLetter(120,  'II'), 'F');
    assert.equal(lotSizeLetter(200,  'II'), 'G');
    assert.equal(lotSizeLetter(400,  'II'), 'H');
    assert.equal(lotSizeLetter(1000, 'II'), 'J');
  });

  test('general level II — large lot', () => {
    assert.equal(lotSizeLetter(2000,   'II'), 'K');
    assert.equal(lotSizeLetter(5000,   'II'), 'L');
    assert.equal(lotSizeLetter(20000,  'II'), 'M');
    assert.equal(lotSizeLetter(100000, 'II'), 'N');
    assert.equal(lotSizeLetter(1000000,'II'), 'Q');
  });

  test('level boundaries are inclusive', () => {
    // 50 is the upper bound of row (26..50) → D, 51 is the lower bound of
    // (51..90) → E. This matches the MIL-STD-105E published row breaks.
    assert.equal(lotSizeLetter(50, 'II'), 'D');
    assert.equal(lotSizeLetter(51, 'II'), 'E');
  });
});

describe('AQL sample-size per code letter', () => {
  test('canonical sample sizes match MIL-STD-105E Table II-A', () => {
    assert.equal(AQL_CODE_SAMPLE_SIZE.A, 2);
    assert.equal(AQL_CODE_SAMPLE_SIZE.D, 8);
    assert.equal(AQL_CODE_SAMPLE_SIZE.G, 32);
    assert.equal(AQL_CODE_SAMPLE_SIZE.J, 80);
    assert.equal(AQL_CODE_SAMPLE_SIZE.L, 200);
    assert.equal(AQL_CODE_SAMPLE_SIZE.N, 500);
  });
});

describe('samplingPlan — single sampling plans', () => {
  test('lot=100, AQL=1.0, normal → letter F, n=20, Ac=1, Re=2', () => {
    const plan = samplingPlan({ lotSize: 100, aql: 1.0, severity: 'normal' });
    assert.equal(plan.letter, 'F');
    assert.equal(plan.sampleSize, 20);
    assert.equal(plan.Ac, 1);
    assert.equal(plan.Re, 2);
  });

  test('lot=500, AQL=1.0, normal → letter H, n=50, Ac=2, Re=3', () => {
    // 281..500 → letter H (II), sample size 50, AQL 1.0 → Ac=2, Re=3
    const plan = samplingPlan({ lotSize: 500, aql: 1.0, severity: 'normal' });
    assert.equal(plan.letter, 'H');
    assert.equal(plan.sampleSize, 50);
    assert.equal(plan.Ac, 2);
    assert.equal(plan.Re, 3);
  });

  test('lot=1000, AQL=2.5, normal → letter J, n=80, Ac=7, Re=8', () => {
    const plan = samplingPlan({ lotSize: 1000, aql: 2.5, severity: 'normal' });
    assert.equal(plan.letter, 'J');
    assert.equal(plan.sampleSize, 80);
    assert.equal(plan.Ac, 7);
    assert.equal(plan.Re, 8);
  });

  test('lot=500, AQL=1.0, tightened is stricter than normal', () => {
    const normal    = samplingPlan({ lotSize: 500, aql: 1.0, severity: 'normal' });
    const tightened = samplingPlan({ lotSize: 500, aql: 1.0, severity: 'tightened' });
    assert.equal(tightened.letter, normal.letter);
    assert.ok(tightened.Ac <= normal.Ac, 'tightened Ac must be ≤ normal Ac');
  });

  test('reduced sample size is 40% of normal', () => {
    const normal  = samplingPlan({ lotSize: 500, aql: 1.0, severity: 'normal' });
    const reduced = samplingPlan({ lotSize: 500, aql: 1.0, severity: 'reduced' });
    assert.equal(reduced.sampleSize, Math.max(2, Math.round(normal.sampleSize * 0.4)));
  });

  test('unknown AQL throws', () => {
    assert.throws(() => samplingPlan({ lotSize: 100, aql: 99.9 }), /no plan/);
  });

  test('non-positive lot size throws', () => {
    assert.throws(() => samplingPlan({ lotSize: 0, aql: 1.0 }), /lotSize must be positive/);
  });
});

describe('aqlKey normalisation', () => {
  test('maps common numeric forms', () => {
    assert.equal(aqlKey(1),   '1.0');
    assert.equal(aqlKey(1.0), '1.0');
    assert.equal(aqlKey(0.1), '0.10');
    assert.equal(aqlKey(0.4), '0.40');
    assert.equal(aqlKey(2.5), '2.5');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Checklist lifecycle
// ═══════════════════════════════════════════════════════════════════════════

function makeChecklist(qc) {
  return qc.defineChecklist({
    id: 'QC-WELD-001',
    sku: 'BRACKET-22x3',
    operation: 'MIG welding',
    stage: 'final',
    aql: 1.0,
    inspectionLevel: 'II',
    standards: ['ISO 9001', 'IAI SQ-PR-001'],
    items: [
      {
        id: 'DIM-01',
        name_he: 'אורך כללי',
        name_en: 'Overall length',
        type: 'measurement',
        spec: 220,
        tolerance: 0.5,
        method: 'caliper',
        reference: 'DWG-22x3 rev B',
      },
      {
        id: 'WELD-VIS',
        name_he: 'בדיקה חזותית של ריתוך',
        name_en: 'Visual weld inspection',
        type: 'pass-fail',
        method: 'visual',
        reference: 'AWS D1.1',
      },
      {
        id: 'FUNC-01',
        name_he: 'בדיקת תפקוד',
        name_en: 'Functional test',
        type: 'functional',
        method: 'load test',
      },
    ],
  });
}

describe('defineChecklist', () => {
  test('registers a checklist and increments version on re-define', () => {
    const qc = new QCChecklist();
    const v1 = makeChecklist(qc);
    assert.equal(v1.version, 1);
    const v2 = qc.defineChecklist({
      id: v1.id, sku: v1.sku, operation: v1.operation, stage: v1.stage,
      items: v1.items.slice(),
    });
    assert.equal(v2.version, 2);
    assert.equal(qc.listChecklistVersions(v1.id).length, 2);
  });

  test('validates required fields', () => {
    const qc = new QCChecklist();
    assert.throws(() => qc.defineChecklist({}), /id required/);
    assert.throws(() => qc.defineChecklist({ id: 'x' }), /sku required/);
    assert.throws(() => qc.defineChecklist({ id: 'x', sku: 's' }), /operation required/);
    assert.throws(() => qc.defineChecklist({ id: 'x', sku: 's', operation: 'o', stage: 'bogus', items: [] }), /stage must be/);
  });

  test('returned checklist is frozen', () => {
    const qc = new QCChecklist();
    const cl = makeChecklist(qc);
    assert.equal(Object.isFrozen(cl), true);
    assert.throws(() => { cl.sku = 'OTHER'; }, TypeError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Inspection + recordResult + verdict
// ═══════════════════════════════════════════════════════════════════════════

describe('inspection lifecycle', () => {
  test('createInspection derives sample size from lot size', () => {
    const qc = new QCChecklist();
    makeChecklist(qc);
    const ins = qc.createInspection({
      checklistId: 'QC-WELD-001',
      lotId: 'LOT-2026-0001',
      inspector: 'Shira Katz',
      lotSize: 500,
    });
    assert.equal(ins.plan.letter, 'H');
    assert.equal(ins.sampleSize, 50);
    assert.equal(ins.status, 'open');
  });

  test('recordResult auto-computes measurement pass from spec ± tolerance', () => {
    const qc = new QCChecklist();
    makeChecklist(qc);
    const ins = qc.createInspection({
      checklistId: 'QC-WELD-001', lotId: 'L1', inspector: 'QA', lotSize: 100,
    });
    const inTol  = qc.recordResult(ins.id, 'DIM-01', { value: 220.2 });
    const outTol = qc.recordResult(ins.id, 'DIM-01', { value: 221.0 });
    assert.equal(inTol.pass, true);
    assert.equal(outTol.pass, false);
  });

  test('recordResult requires explicit pass for pass-fail items', () => {
    const qc = new QCChecklist();
    makeChecklist(qc);
    const ins = qc.createInspection({
      checklistId: 'QC-WELD-001', lotId: 'L2', inspector: 'QA', lotSize: 100,
    });
    assert.throws(() => qc.recordResult(ins.id, 'WELD-VIS', {}), /explicit pass/);
  });
});

describe('verdictForInspection', () => {
  test('AQL accept: zero defects on a small lot', () => {
    const qc = new QCChecklist();
    makeChecklist(qc);
    const ins = qc.createInspection({
      checklistId: 'QC-WELD-001', lotId: 'L', inspector: 'QA', lotSize: 100,
    });
    for (const it of ['DIM-01', 'WELD-VIS', 'FUNC-01']) {
      qc.recordResult(ins.id, it, it === 'DIM-01' ? { value: 220 } : { pass: true });
    }
    const v = qc.verdictForInspection(ins.id);
    assert.equal(v.verdict, 'pass');
    assert.equal(v.defectCount, 0);
    assert.equal(v.aql.accept, true);
  });

  test('AQL reject: defects exceed Ac', () => {
    const qc = new QCChecklist();
    makeChecklist(qc);
    // Lot 100 → letter F, sample=20, AQL 1.0 → Ac=1, Re=2
    const ins = qc.createInspection({
      checklistId: 'QC-WELD-001', lotId: 'L', inspector: 'QA', lotSize: 100,
    });
    // Two failures (> Ac=1) should reject
    qc.recordResult(ins.id, 'DIM-01',  { value: 220 });      // pass
    qc.recordResult(ins.id, 'WELD-VIS',{ pass: false });      // fail
    qc.recordResult(ins.id, 'FUNC-01', { pass: false });      // fail
    const v = qc.verdictForInspection(ins.id);
    assert.equal(v.verdict, 'fail');
    assert.equal(v.defectCount, 2);
    assert.equal(v.aql.accept, false);
    assert.equal(v.aql.reject, true);
  });

  test('missing items cause fail even with zero defects', () => {
    const qc = new QCChecklist();
    makeChecklist(qc);
    const ins = qc.createInspection({
      checklistId: 'QC-WELD-001', lotId: 'L', inspector: 'QA', lotSize: 100,
    });
    qc.recordResult(ins.id, 'DIM-01', { value: 220 });
    const v = qc.verdictForInspection(ins.id);
    assert.equal(v.verdict, 'fail');
    assert.ok(v.missing.includes('WELD-VIS'));
    assert.ok(v.missing.includes('FUNC-01'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. NCR + Certificate of Conformance
// ═══════════════════════════════════════════════════════════════════════════

describe('rejectLot → NCR', () => {
  test('creates a Y-037 bridge NCR and transitions inspection', () => {
    const qc = new QCChecklist();
    makeChecklist(qc);
    const ins = qc.createInspection({
      checklistId: 'QC-WELD-001', lotId: 'L-BAD', inspector: 'QA', lotSize: 100,
    });
    qc.recordResult(ins.id, 'DIM-01',   { value: 230 }); // fail
    qc.recordResult(ins.id, 'WELD-VIS', { pass: false });
    qc.recordResult(ins.id, 'FUNC-01',  { pass: false });
    const ncr = qc.rejectLot(ins.id, 'Weld porosity + OOS length');
    assert.match(ncr.id, /^NCR-\d{6}$/);
    assert.match(ncr.bridgeKey, /^Y037\.ncr\./);
    assert.equal(ncr.lotId, 'L-BAD');
    assert.equal(qc.getInspection(ins.id).status, 'rejected');
  });
});

describe('certificateOfConformance', () => {
  test('emits a bilingual C of C when verdict is pass', () => {
    const qc = new QCChecklist();
    makeChecklist(qc);
    const ins = qc.createInspection({
      checklistId: 'QC-WELD-001', lotId: 'L-OK', inspector: 'Shira', lotSize: 100,
    });
    qc.recordResult(ins.id, 'DIM-01',   { value: 220 });
    qc.recordResult(ins.id, 'WELD-VIS', { pass: true });
    qc.recordResult(ins.id, 'FUNC-01',  { pass: true });
    const coc = qc.certificateOfConformance(ins.id);
    assert.equal(coc.type, 'certificate_of_conformance');
    assert.equal(coc.verdict, 'pass');
    assert.ok(coc.body.he.some((l) => l.includes('תעודת התאמה')));
    assert.ok(coc.body.en.some((l) => l.includes('Certificate of Conformance')));
  });

  test('refuses to emit for a failed inspection', () => {
    const qc = new QCChecklist();
    makeChecklist(qc);
    const ins = qc.createInspection({
      checklistId: 'QC-WELD-001', lotId: 'L-BAD', inspector: 'QA', lotSize: 100,
    });
    qc.recordResult(ins.id, 'DIM-01',   { value: 230 });
    qc.recordResult(ins.id, 'WELD-VIS', { pass: false });
    qc.recordResult(ins.id, 'FUNC-01',  { pass: false });
    assert.throws(() => qc.certificateOfConformance(ins.id), /not pass/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Control charts — X-bar / R
// ═══════════════════════════════════════════════════════════════════════════

describe('controlCharts', () => {
  test('X-bar and R limits with known subgroup of 5', () => {
    const qc = new QCChecklist();
    makeChecklist(qc);
    // Feed 25 values in 5 subgroups of 5 — classic Montgomery example shape
    const values = [
      220.00, 220.10, 220.05, 219.95, 220.02,  // g1
      220.03, 220.02, 219.97, 220.01, 220.00,  // g2
      219.99, 220.04, 220.06, 219.98, 220.01,  // g3
      220.02, 220.00, 219.96, 220.03, 220.05,  // g4
      219.98, 220.01, 220.04, 220.00, 219.99,  // g5
    ];
    for (let i = 0; i < values.length; i++) {
      const ins = qc.createInspection({
        checklistId: 'QC-WELD-001', lotId: `LOT-${i}`, inspector: 'QA', lotSize: 100,
      });
      qc.recordResult(ins.id, 'DIM-01', { value: values[i] });
    }
    const cc = qc.controlCharts('DIM-01', { subgroupSize: 5 });
    assert.equal(cc.subgroupSize, 5);
    assert.equal(cc.subgroups.length, 5);
    // X-bar center should be very close to 220.01 (true process mean)
    assert.ok(Math.abs(cc.xbar.center - 220.01) < 0.05);
    // Montgomery constants for n=5: A2=0.577, D4=2.114, D3=0
    assert.equal(cc.constants.A2, 0.577);
    assert.equal(cc.constants.D4, 2.114);
    assert.equal(cc.constants.D3, 0);
    // UCL_xbar = Xbar-bar + A2*Rbar
    const expectedUcl = cc.xbar.center + 0.577 * cc.r.center;
    assert.ok(Math.abs(cc.xbar.ucl - expectedUcl) < 1e-9);
    // R-chart LCL for n=5 must be 0
    assert.equal(cc.r.lcl, 0);
  });

  test('returns warning when insufficient data', () => {
    const qc = new QCChecklist();
    makeChecklist(qc);
    const cc = qc.controlCharts('DIM-01', { subgroupSize: 5 });
    assert.match(cc.warning, /insufficient data/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Cpk
// ═══════════════════════════════════════════════════════════════════════════

describe('cpk — process capability', () => {
  test('Cpk math with a tight, centred process', () => {
    const qc = new QCChecklist();
    makeChecklist(qc);
    // spec=220 ±0.5 → USL=220.5, LSL=219.5, width=1.0
    // Feed a distribution with known sigma
    const values = [
      219.90, 220.00, 220.10, 220.00, 219.95, 220.05,
      220.00, 220.02, 219.98, 220.01, 220.03, 219.97,
    ];
    for (let i = 0; i < values.length; i++) {
      const ins = qc.createInspection({
        checklistId: 'QC-WELD-001', lotId: `L${i}`, inspector: 'QA', lotSize: 100,
      });
      qc.recordResult(ins.id, 'DIM-01', { value: values[i] });
    }
    const res = qc.cpk('DIM-01');
    assert.equal(res.USL, 220.5);
    assert.equal(res.LSL, 219.5);
    assert.ok(res.cp != null && res.cp > 0);
    assert.ok(res.cpk != null && res.cpk > 0);
    // Mean ~ 220 → Cpk ≈ Cp (symmetric), and > 1 (capable) for this distribution
    assert.ok(res.cpk > 1.0);
    // sanity: Cpk <= Cp always
    assert.ok(res.cpk <= res.cp + 1e-12);
    assert.ok(
      ['capable — meets IAI/Elbit minimum', 'marginal — tighten process',
       'aerospace/defense — excellent'].includes(res.interpretation)
    );
  });

  test('Cpk low for a wide process', () => {
    const qc = new QCChecklist();
    makeChecklist(qc);
    const values = [219.7, 220.3, 219.6, 220.4, 219.8, 220.2, 219.5, 220.5];
    for (let i = 0; i < values.length; i++) {
      const ins = qc.createInspection({
        checklistId: 'QC-WELD-001', lotId: `L${i}`, inspector: 'QA', lotSize: 100,
      });
      qc.recordResult(ins.id, 'DIM-01', { value: values[i] });
    }
    const res = qc.cpk('DIM-01');
    assert.ok(res.cpk < 1.0, `expected Cpk<1.0, got ${res.cpk}`);
  });

  test('Cpk undefined for items without spec/tolerance', () => {
    const qc = new QCChecklist();
    qc.defineChecklist({
      id: 'QC-OPEN', sku: 'X', operation: 'test', stage: 'in-process',
      items: [{ id: 'OPEN', name_he: 'פתוח', name_en: 'Open', type: 'measurement' }],
    });
    assert.throws(() => qc.cpk('OPEN'), /lacks spec\/tolerance/);
  });

  test('Cpk returns warning with <2 samples', () => {
    const qc = new QCChecklist();
    makeChecklist(qc);
    const ins = qc.createInspection({
      checklistId: 'QC-WELD-001', lotId: 'X', inspector: 'QA', lotSize: 100,
    });
    qc.recordResult(ins.id, 'DIM-01', { value: 220 });
    const res = qc.cpk('DIM-01');
    assert.match(res.warning, /insufficient data/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Bilingual labels / Israeli defence standards present
// ═══════════════════════════════════════════════════════════════════════════

describe('bilingual labels and defence metadata', () => {
  test('labels cover every stage and verdict', () => {
    for (const key of ['incoming', 'inProcess', 'final', 'fai', 'pass', 'fail', 'cpk']) {
      assert.ok(QC_LABELS_HE[key], `missing HE label ${key}`);
      assert.ok(QC_LABELS_EN[key], `missing EN label ${key}`);
    }
  });

  test('Israeli defence standards list is populated', () => {
    for (const k of ['IAI', 'ELBIT', 'RAFAEL', 'IMI', 'MOD']) {
      assert.ok(ISRAELI_DEFENSE_STANDARDS[k]);
      assert.ok(ISRAELI_DEFENSE_STANDARDS[k].cpkMin >= 1.33);
    }
  });
});
