/**
 * NCR Tracker — Test Suite
 * =========================
 * Agent Y-037  |  Swarm Quality  |  Techno-Kol Uzi mega-ERP
 *
 * Covers:
 *   1. NCR lifecycle                 (create → triage → disposition → RCA → CAPA → close)
 *   2. Disposition tracking          (all 5 actions, supersede history)
 *   3. Cost-of-Poor-Quality          (aggregation by category + source + disposition)
 *   4. Supplier scorecard            (ncr rate, grade thresholds, score curve)
 *   5. Pareto trend analysis         (supplier / sku / defect-code / work-center)
 *
 * Runner: plain Node's `node:assert` — no external test framework.
 */

'use strict';

const assert = require('node:assert/strict');
const {
    NCRTracker,
    DEFECT_CODES_IL,
    SEVERITY,
    DISPOSITION,
    RCA_METHOD,
    STATUS,
    SOURCE,
    COQ_CATEGORY,
} = require('../../src/quality/ncr-tracker');

// ─── Test harness ─────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
function test(name, fn) {
    try {
        fn();
        console.log(`  ok  ${name}`);
        passed++;
    } catch (e) {
        console.error(`  FAIL ${name}`);
        console.error(`       ${e.message}`);
        if (e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n'));
        failed++;
    }
}

// Deterministic clock + ids for reproducible tests
function makeTracker(extra = {}) {
    let tick = 0;
    let idx  = 0;
    const base = Date.UTC(2026, 3, 1, 8, 0, 0); // 2026-04-01T08:00:00Z
    return new NCRTracker({
        clock: () => new Date(base + (tick++) * 60_000), // +1 minute per call
        idGen: () => `NCR-T${String(++idx).padStart(4, '0')}`,
        ...extra,
    });
}

console.log('NCR Tracker — test suite');
console.log('─'.repeat(60));

// ═══════════════════════════════════════════════════════════════════════
// 1.  LIFECYCLE — create → triage → disposition → RCA → CAPA → close
// ═══════════════════════════════════════════════════════════════════════

test('createNCR: happy path — internal, minor defect', () => {
    const t = makeTracker();
    const id = t.createNCR({
        source: 'internal',
        sku: 'SHEET-MS-2MM-1000x2000',
        lotId: 'LOT-2026-0401',
        qty: 3,
        defects: [{ code: 'IL-DIM-001', severity: 'minor', description: 'off by 0.2mm' }],
        detectedBy: 'QC-005',
        workCenter: 'WC-LASER-01',
    });
    assert.ok(id.startsWith('NCR-T'));
    const ncr = t.getNCR(id);
    assert.equal(ncr.status.code, 'triaged');
    assert.equal(ncr.worstSeverity.code, 'minor');
    assert.equal(ncr.defects.length, 1);
    assert.equal(ncr.defects[0].codeMeta.he, DEFECT_CODES_IL['IL-DIM-001'].he);
    assert.equal(ncr.sku, 'SHEET-MS-2MM-1000x2000');
});

test('createNCR: worstSeverity = critical when any defect is critical', () => {
    const t = makeTracker();
    const id = t.createNCR({
        source: 'internal',
        sku: 'WELD-ASSY-A',
        lotId: 'LOT-A',
        qty: 1,
        defects: [
            { code: 'IL-SRF-001', severity: 'minor' },
            { code: 'IL-WLD-002', severity: 'critical', description: 'weld crack' },
        ],
        detectedBy: 'QC-001',
    });
    assert.equal(t.getNCR(id).worstSeverity.code, 'critical');
});

test('createNCR: validation errors', () => {
    const t = makeTracker();
    assert.throws(() => t.createNCR({}), /source/);
    assert.throws(() => t.createNCR({ source: 'internal' }), /sku/);
    assert.throws(() => t.createNCR({ source: 'internal', sku: 'X', lotId: 'L' }), /qty/);
    assert.throws(() => t.createNCR({ source: 'internal', sku: 'X', lotId: 'L', qty: 1 }), /defects/);
    assert.throws(() => t.createNCR({
        source: 'internal', sku: 'X', lotId: 'L', qty: 1,
        defects: [{ code: 'IL-DIM-001' }],
    }), /detectedBy/);
    assert.throws(() => t.createNCR({
        source: 'internal', sku: 'X', lotId: 'L', qty: 1,
        defects: [{ code: 'IL-DIM-001', severity: 'catastrophic' }],
        detectedBy: 'x',
    }), /severity/);
});

test('Full lifecycle: create → disposition → RCA → CAPA → close', () => {
    const t = makeTracker();
    const id = t.createNCR({
        source: 'internal',
        sku: 'BEAM-IPN-200',
        lotId: 'LOT-42',
        qty: 10,
        defects: [{ code: 'IL-WLD-001', severity: 'major' }],
        detectedBy: 'QC-010',
        workCenter: 'WC-WELD-02',
    });

    // 1. Disposition
    const dispSnap = t.disposition(id, 'rework', { decidedBy: 'MRB-TEAM-1' });
    assert.equal(dispSnap.status.code, 'dispositioned');
    assert.equal(dispSnap.disposition.code, 'rework');
    assert.equal(dispSnap.cost.currency, 'ILS');
    assert.equal(dispSnap.cost.totalCost, 450); // 45 * 10
    assert.equal(dispSnap.cost.category.code, 'internal-failure');

    // 2. RCA
    const rcaSnap = t.rootCauseAnalysis(id, {
        method: '5-why',
        findings: { whys: ['wire speed drifted', 'feeder clog', 'missed PM', 'PM calendar wrong', 'CMMS lost update'] },
        analyst: 'QE-02',
    });
    assert.equal(rcaSnap.status.code, 'rca-done');
    assert.equal(rcaSnap.rca.method.code, '5-why');
    assert.equal(rcaSnap.rca.findings.whys.length, 5);

    // 3. CAPA
    const capaSnap = t.linkToCAPA(id, 'CAPA-2026-0077');
    assert.equal(capaSnap.status.code, 'linked-capa');
    assert.equal(capaSnap.capaId, 'CAPA-2026-0077');

    // 4. Close
    const closed = t.closeNCR(id, 'QA-MGR');
    assert.equal(closed.status.code, 'closed');
    assert.ok(closed.closedAt);
    assert.equal(closed.closedBy, 'QA-MGR');

    // Audit trail contains every op
    const ops = t.getAuditTrail().map(r => r.op);
    assert.deepEqual(ops, ['createNCR', 'disposition', 'rca', 'linkToCAPA', 'closeNCR']);
});

// ═══════════════════════════════════════════════════════════════════════
// 2.  DISPOSITION — all 5 actions + supersede
// ═══════════════════════════════════════════════════════════════════════

test('disposition: all 5 actions compute costs correctly', () => {
    const actions = ['use-as-is', 'rework', 'return-to-supplier', 'scrap', 'downgrade'];
    const expected = { 'use-as-is': 5, 'rework': 45, 'return-to-supplier': 12, 'scrap': 120, 'downgrade': 60 };
    for (const act of actions) {
        const t = makeTracker();
        const id = t.createNCR({
            source: 'internal', sku: 'X', lotId: 'L', qty: 2,
            defects: [{ code: 'IL-DIM-001', severity: 'minor' }], detectedBy: 'q',
        });
        const snap = t.disposition(id, act);
        assert.equal(snap.disposition.code, act);
        assert.equal(snap.cost.totalCost, expected[act] * 2, `cost for ${act}`);
    }
});

test('disposition: invalid action rejected', () => {
    const t = makeTracker();
    const id = t.createNCR({
        source: 'internal', sku: 'X', lotId: 'L', qty: 1,
        defects: [{ code: 'IL-DIM-001', severity: 'minor' }], detectedBy: 'q',
    });
    assert.throws(() => t.disposition(id, 'recycle'), /invalid action/);
});

test('disposition: supersede history (לא מוחקים)', () => {
    const t = makeTracker();
    const id = t.createNCR({
        source: 'internal', sku: 'X', lotId: 'L', qty: 1,
        defects: [{ code: 'IL-DIM-001', severity: 'minor' }], detectedBy: 'q',
    });
    t.disposition(id, 'rework');
    t.disposition(id, 'scrap', { note: 'rework failed second inspection' });
    const ncr = t.getNCR(id);
    assert.equal(ncr.disposition.code, 'scrap');
    // Supersede event is on the event log — nothing was deleted
    const superseded = ncr.events.filter(e => e.type === 'disposition-superseded');
    assert.equal(superseded.length, 1);
    assert.equal(superseded[0].data.previous, 'rework');
    assert.equal(superseded[0].data.next, 'scrap');
});

test('disposition: custom unit cost overrides default', () => {
    const t = makeTracker();
    const id = t.createNCR({
        source: 'internal', sku: 'X', lotId: 'L', qty: 3,
        defects: [{ code: 'IL-DIM-001', severity: 'minor' }], detectedBy: 'q',
    });
    const snap = t.disposition(id, 'rework', { unitCost: 200 });
    assert.equal(snap.cost.totalCost, 600); // 3 * 200
});

// ═══════════════════════════════════════════════════════════════════════
// 3.  COST OF POOR QUALITY — aggregation
// ═══════════════════════════════════════════════════════════════════════

test('costOfPoorQuality: aggregates by category, source, disposition', () => {
    const t = makeTracker();

    const a = t.createNCR({
        source: 'internal', sku: 'SKU-A', lotId: 'L1', qty: 2,
        defects: [{ code: 'IL-DIM-001', severity: 'minor' }], detectedBy: 'q',
    });
    t.disposition(a, 'rework'); // 45*2 = 90 internal-failure / internal

    const b = t.createNCR({
        source: 'supplier', sku: 'SKU-B', lotId: 'L2', qty: 5,
        defects: [{ code: 'IL-MAT-003', severity: 'major' }], detectedBy: 'q',
        supplierId: 'SUP-100',
    });
    t.disposition(b, 'return-to-supplier'); // 12*5 = 60 external-failure / supplier

    const c = t.createNCR({
        source: 'customer', sku: 'SKU-C', lotId: 'L3', qty: 1,
        defects: [{ code: 'IL-WLD-002', severity: 'critical' }], detectedBy: 'q',
        customerId: 'CUST-1',
    });
    t.disposition(c, 'scrap'); // 120*1 = 120 — customer source → external-failure

    const coq = t.costOfPoorQuality();
    assert.equal(coq.total, 270);
    assert.equal(coq.count, 3);
    assert.equal(coq.byCategory['internal-failure'], 90);
    assert.equal(coq.byCategory['external-failure'], 60 + 120);
    assert.equal(coq.bySource['internal'], 90);
    assert.equal(coq.bySource['supplier'], 60);
    assert.equal(coq.bySource['customer'], 120);
    assert.equal(coq.byDisposition['rework'], 90);
    assert.equal(coq.byDisposition['return-to-supplier'], 60);
    assert.equal(coq.byDisposition['scrap'], 120);
});

test('costOfPoorQuality: period filter works', () => {
    const t = makeTracker();
    const id = t.createNCR({
        source: 'internal', sku: 'X', lotId: 'L', qty: 1,
        defects: [{ code: 'IL-DIM-001', severity: 'minor' }], detectedBy: 'q',
    });
    t.disposition(id, 'rework');
    // Period in the far future → nothing matches
    const empty = t.costOfPoorQuality({
        from: '2030-01-01T00:00:00Z',
        to:   '2030-12-31T23:59:59Z',
    });
    assert.equal(empty.total, 0);
    assert.equal(empty.count, 0);
});

// ═══════════════════════════════════════════════════════════════════════
// 4.  SUPPLIER SCORECARD — score / grade / side-effects
// ═══════════════════════════════════════════════════════════════════════

test('supplierScorecard: perfect supplier → A, score 100', () => {
    const t = makeTracker();
    // Create NCR for a DIFFERENT supplier to ensure filter works
    const id = t.createNCR({
        source: 'supplier', sku: 'X', lotId: 'L', qty: 1,
        defects: [{ code: 'IL-MAT-003', severity: 'major' }], detectedBy: 'q',
        supplierId: 'OTHER-SUP',
    });
    t.disposition(id, 'return-to-supplier');

    const sc = t.supplierScorecard('SUP-PERFECT');
    assert.equal(sc.ncrCount, 0);
    assert.equal(sc.score, 100);
    assert.equal(sc.grade, 'A');
});

test('supplierScorecard: grades across thresholds', () => {
    const cases = [
        { weight: 0,  grade: 'A', score: 100 },  // perfect
        { weight: 5,  grade: 'A', score: 90  },  // 1 major → A (borderline)
        { weight: 10, grade: 'B', score: 80  },  // 2 major → B
        { weight: 15, grade: 'C', score: 70  },  // 3 major → C
        { weight: 20, grade: 'D', score: 60  },  // 4 major → D
        { weight: 25, grade: 'F', score: 50  },  // 5 major → F
        { weight: 50, grade: 'F', score: 0   },  // 2 critical → F floor
    ];
    for (const c of cases) {
        const t = makeTracker();
        // Create enough minor NCRs to reach the target severity weight by
        // using major (weight 5) and critical (weight 25) as building blocks
        let remaining = c.weight;
        while (remaining >= 25) {
            const id = t.createNCR({
                source: 'supplier', sku: 'X', lotId: 'L', qty: 1,
                defects: [{ code: 'IL-MAT-003', severity: 'critical' }], detectedBy: 'q',
                supplierId: 'SUP-T',
            });
            t.disposition(id, 'return-to-supplier');
            remaining -= 25;
        }
        while (remaining >= 5) {
            const id = t.createNCR({
                source: 'supplier', sku: 'X', lotId: 'L', qty: 1,
                defects: [{ code: 'IL-MAT-003', severity: 'major' }], detectedBy: 'q',
                supplierId: 'SUP-T',
            });
            t.disposition(id, 'return-to-supplier');
            remaining -= 5;
        }
        const sc = t.supplierScorecard('SUP-T');
        assert.equal(sc.severityScore, c.weight, `severityScore for weight ${c.weight}`);
        assert.equal(sc.score, c.score, `score for weight ${c.weight}`);
        assert.equal(sc.grade, c.grade, `grade for weight ${c.weight}`);
    }
});

test('supplierScorecard: side-effect call into supplierEngine', () => {
    const calls = [];
    const supplierEngine = {
        recordQualityEvent: (evt) => calls.push({ type: 'record', evt }),
        updateQualityScore: (id, data) => calls.push({ type: 'update', id, data }),
    };
    const t = makeTracker({ supplierEngine });
    const id = t.createNCR({
        source: 'supplier', sku: 'X', lotId: 'L', qty: 2,
        defects: [{ code: 'IL-MAT-003', severity: 'major' }], detectedBy: 'q',
        supplierId: 'SUP-X',
    });
    t.disposition(id, 'return-to-supplier');
    const sc = t.supplierScorecard('SUP-X');
    assert.equal(calls[0].type, 'record');
    assert.equal(calls[0].evt.supplierId, 'SUP-X');
    assert.equal(calls[1].type, 'update');
    assert.equal(calls[1].id, 'SUP-X');
    assert.equal(calls[1].data.score, sc.score);
});

// ═══════════════════════════════════════════════════════════════════════
// 5.  PARETO TREND ANALYSIS
// ═══════════════════════════════════════════════════════════════════════

test('trendAnalysis: supplier dimension Pareto', () => {
    const t = makeTracker();
    // SUP-A: 2 critical (weight 25 each = 50)
    for (let i = 0; i < 2; i++) {
        const id = t.createNCR({
            source: 'supplier', sku: 'X', lotId: `L${i}`, qty: 1,
            defects: [{ code: 'IL-MAT-003', severity: 'critical' }], detectedBy: 'q',
            supplierId: 'SUP-A',
        });
        t.disposition(id, 'return-to-supplier');
    }
    // SUP-B: 3 major (5*3 = 15)
    for (let i = 0; i < 3; i++) {
        const id = t.createNCR({
            source: 'supplier', sku: 'Y', lotId: `M${i}`, qty: 1,
            defects: [{ code: 'IL-MAT-003', severity: 'major' }], detectedBy: 'q',
            supplierId: 'SUP-B',
        });
        t.disposition(id, 'return-to-supplier');
    }
    // SUP-C: 1 minor (1)
    const idC = t.createNCR({
        source: 'supplier', sku: 'Z', lotId: 'N', qty: 1,
        defects: [{ code: 'IL-MAT-003', severity: 'minor' }], detectedBy: 'q',
        supplierId: 'SUP-C',
    });
    t.disposition(idC, 'return-to-supplier');

    const pareto = t.trendAnalysis({ dimension: 'supplier' });
    assert.equal(pareto.dimension, 'supplier');
    assert.equal(pareto.items.length, 3);
    assert.equal(pareto.items[0].key, 'SUP-A');
    assert.equal(pareto.items[0].severityScore, 50);
    assert.equal(pareto.items[1].key, 'SUP-B');
    assert.equal(pareto.items[1].severityScore, 15);
    assert.equal(pareto.items[2].key, 'SUP-C');
    // Pareto 80% cutoff: 50/66 = 75.76% → needs SUP-B for cumPct to pass 80
    assert.ok(pareto.paretoCutoffIndex >= 1);
});

test('trendAnalysis: defect-code dimension', () => {
    const t = makeTracker();
    // 3 x IL-WLD-002 critical, 1 x IL-DIM-001 minor
    for (let i = 0; i < 3; i++) {
        t.createNCR({
            source: 'internal', sku: 'X', lotId: `L${i}`, qty: 1,
            defects: [{ code: 'IL-WLD-002', severity: 'critical' }], detectedBy: 'q',
        });
    }
    t.createNCR({
        source: 'internal', sku: 'Y', lotId: 'M', qty: 1,
        defects: [{ code: 'IL-DIM-001', severity: 'minor' }], detectedBy: 'q',
    });
    const pareto = t.trendAnalysis({ dimension: 'defect-code' });
    assert.equal(pareto.items[0].key, 'IL-WLD-002');
    assert.equal(pareto.items[0].severityScore, 75); // 3*25
    assert.equal(pareto.items[1].key, 'IL-DIM-001');
    assert.equal(pareto.items[1].severityScore, 1);
});

test('trendAnalysis: work-center dimension', () => {
    const t = makeTracker();
    t.createNCR({
        source: 'internal', sku: 'X', lotId: 'L', qty: 1,
        defects: [{ code: 'IL-DIM-001', severity: 'major' }], detectedBy: 'q',
        workCenter: 'WC-LASER-01',
    });
    t.createNCR({
        source: 'internal', sku: 'X', lotId: 'L', qty: 1,
        defects: [{ code: 'IL-DIM-001', severity: 'minor' }], detectedBy: 'q',
        workCenter: 'WC-LASER-01',
    });
    t.createNCR({
        source: 'internal', sku: 'X', lotId: 'L', qty: 1,
        defects: [{ code: 'IL-WLD-001', severity: 'major' }], detectedBy: 'q',
        workCenter: 'WC-WELD-02',
    });
    const pareto = t.trendAnalysis({ dimension: 'work-center' });
    assert.equal(pareto.items.length, 2);
    // WC-LASER-01: 5+1 = 6. WC-WELD-02: 5. Sorted desc.
    assert.equal(pareto.items[0].key, 'WC-LASER-01');
    assert.equal(pareto.items[0].severityScore, 6);
    assert.equal(pareto.items[1].key, 'WC-WELD-02');
});

test('trendAnalysis: rejects invalid dimension', () => {
    const t = makeTracker();
    assert.throws(() => t.trendAnalysis({ dimension: 'color' }), /dimension/);
});

// ═══════════════════════════════════════════════════════════════════════
// 6.  RCA METHODS & CAPA
// ═══════════════════════════════════════════════════════════════════════

test('rootCauseAnalysis: 5-why validation', () => {
    const t = makeTracker();
    const id = t.createNCR({
        source: 'internal', sku: 'X', lotId: 'L', qty: 1,
        defects: [{ code: 'IL-WLD-001', severity: 'major' }], detectedBy: 'q',
    });
    assert.throws(
        () => t.rootCauseAnalysis(id, { method: '5-why', findings: {} }),
        /whys/
    );
    const snap = t.rootCauseAnalysis(id, {
        method: '5-why',
        findings: { whys: ['a', 'b', 'c', 'd', 'e'] },
    });
    assert.equal(snap.rca.method.code, '5-why');
});

test('rootCauseAnalysis: fishbone with categories', () => {
    const t = makeTracker();
    const id = t.createNCR({
        source: 'internal', sku: 'X', lotId: 'L', qty: 1,
        defects: [{ code: 'IL-WLD-001', severity: 'major' }], detectedBy: 'q',
    });
    const snap = t.rootCauseAnalysis(id, {
        method: 'fishbone',
        findings: {
            categories: {
                man:         ['operator fatigue'],
                machine:     ['torch calibration drift'],
                method:      ['missing travel-speed SOP'],
                material:    ['humid filler wire'],
                measurement: ['gauge overdue'],
                environment: ['draft in bay'],
            },
        },
    });
    assert.equal(snap.rca.method.code, 'fishbone');
    assert.equal(Object.keys(snap.rca.findings.categories).length, 6);
});

test('rootCauseAnalysis: FMEA computes RPN', () => {
    const t = makeTracker();
    const id = t.createNCR({
        source: 'internal', sku: 'X', lotId: 'L', qty: 1,
        defects: [{ code: 'IL-WLD-001', severity: 'major' }], detectedBy: 'q',
    });
    const snap = t.rootCauseAnalysis(id, {
        method: 'fmea',
        findings: {
            failureModes: [
                { mode: 'lack of fusion',    severity: 8, occurrence: 4, detection: 3 }, // rpn 96
                { mode: 'filler wire drift', severity: 5, occurrence: 2, detection: 5 }, // rpn 50
            ],
        },
    });
    assert.equal(snap.rca.findings.failureModes[0].rpn, 96);
    assert.equal(snap.rca.findings.failureModes[1].rpn, 50);
});

test('rootCauseAnalysis: supersede history', () => {
    const t = makeTracker();
    const id = t.createNCR({
        source: 'internal', sku: 'X', lotId: 'L', qty: 1,
        defects: [{ code: 'IL-WLD-001', severity: 'major' }], detectedBy: 'q',
    });
    t.rootCauseAnalysis(id, { method: '5-why', findings: { whys: ['a'] } });
    t.rootCauseAnalysis(id, { method: 'fishbone', findings: { categories: { man: ['x'] } } });
    const ncr = t.getNCR(id);
    assert.equal(ncr.rca.method.code, 'fishbone');
    assert.equal(ncr.rcaHistory.length, 1);
    assert.equal(ncr.rcaHistory[0].method.code, '5-why');
});

test('linkToCAPA: integrates with injected CAPA engine', () => {
    const backlinks = [];
    const capaEngine = { attachNCR: (capaId, ncrId) => backlinks.push({ capaId, ncrId }) };
    const t = makeTracker({ capaEngine });
    const id = t.createNCR({
        source: 'internal', sku: 'X', lotId: 'L', qty: 1,
        defects: [{ code: 'IL-WLD-001', severity: 'major' }], detectedBy: 'q',
    });
    t.linkToCAPA(id, 'CAPA-9000');
    assert.equal(backlinks.length, 1);
    assert.equal(backlinks[0].capaId, 'CAPA-9000');
    assert.equal(backlinks[0].ncrId, id);
});

// ═══════════════════════════════════════════════════════════════════════
// 7.  RMA GENERATION
// ═══════════════════════════════════════════════════════════════════════

test('rmaGeneration: customer NCR auto-creates RMA via injected engine', () => {
    const created = [];
    const rmaEngine = {
        createRma: (payload) => {
            created.push(payload);
            return 'RMA-ABC-001';
        },
    };
    const t = makeTracker({ rmaEngine });
    const id = t.createNCR({
        source: 'customer', sku: 'GATE-BIG', lotId: 'L-12', qty: 1,
        defects: [{ code: 'IL-SRF-003', severity: 'major' }], detectedBy: 'CS-01',
        customerId: 'CUST-42', salesOrderId: 'SO-9001',
    });
    const rmaId = t.rmaGeneration(id);
    assert.equal(rmaId, 'RMA-ABC-001');
    assert.equal(created[0].customerId, 'CUST-42');
    assert.equal(created[0].items[0].sku, 'GATE-BIG');
    assert.equal(t.getNCR(id).rmaId, 'RMA-ABC-001');
});

test('rmaGeneration: internal NCR is rejected', () => {
    const t = makeTracker();
    const id = t.createNCR({
        source: 'internal', sku: 'X', lotId: 'L', qty: 1,
        defects: [{ code: 'IL-DIM-001', severity: 'minor' }], detectedBy: 'q',
    });
    assert.throws(() => t.rmaGeneration(id), /customer/);
});

test('rmaGeneration: fallback stub when no engine injected', () => {
    const t = makeTracker();
    const id = t.createNCR({
        source: 'customer', sku: 'X', lotId: 'L', qty: 1,
        defects: [{ code: 'IL-SRF-003', severity: 'major' }], detectedBy: 'q',
        customerId: 'CUST-1',
    });
    const rmaId = t.rmaGeneration(id);
    assert.ok(rmaId.startsWith('RMA-STUB-'));
});

test('rmaGeneration: idempotent — second call returns same rmaId', () => {
    const t = makeTracker();
    const id = t.createNCR({
        source: 'customer', sku: 'X', lotId: 'L', qty: 1,
        defects: [{ code: 'IL-SRF-003', severity: 'major' }], detectedBy: 'q',
        customerId: 'CUST-1',
    });
    const a = t.rmaGeneration(id);
    const b = t.rmaGeneration(id);
    assert.equal(a, b);
});

// ═══════════════════════════════════════════════════════════════════════
// 8.  CUSTOMER DEFECT CATALOGS
// ═══════════════════════════════════════════════════════════════════════

test('customer defect catalogs: custom code resolved for right customer', () => {
    const t = makeTracker();
    t.registerCustomerDefectCatalog('CUST-ARMY-01', {
        'MIL-STD-PAINT-A': { he: 'גוון צבאי חסר תקן', en: 'Military color non-spec' },
    });
    const id = t.createNCR({
        source: 'customer', sku: 'ARMORED-PANEL', lotId: 'L1', qty: 1,
        defects: [{ code: 'MIL-STD-PAINT-A', severity: 'major' }], detectedBy: 'q',
        customerId: 'CUST-ARMY-01',
    });
    const ncr = t.getNCR(id);
    assert.equal(ncr.defects[0].codeMeta.he, 'גוון צבאי חסר תקן');
});

// ═══════════════════════════════════════════════════════════════════════
// 9.  SUMMARY
// ═══════════════════════════════════════════════════════════════════════

console.log('─'.repeat(60));
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
