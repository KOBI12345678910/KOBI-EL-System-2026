/**
 * Unit tests — Skills Matrix / Competency Tracker
 * ================================================
 * Agent Y-070  |  Swarm HR  |  Techno-Kol Uzi Mega-ERP  |  Wave 2026
 *
 * Covers:
 *   1. Assessment recording (append-only, level resolution)
 *   2. Gap calculation (required vs. actual)
 *   3. Single-point-of-failure detection (default + custom threshold)
 *   4. Succession readiness scoring & ranking
 *   5. Skill demand forecast (hiring + attrition)
 *   6. Smoke checks on: team capability, cross-training, visualization
 *
 * Run:   node --test test/hr/skills-matrix.test.js
 * Zero external deps — uses only node:test + node:assert/strict.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    SkillsMatrix,
    CATEGORY,
    METHOD,
    LEVEL,
    METAL_FAB_SKILLS,
} = require('../../src/hr/skills-matrix.js');

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

/** Deterministic clock for reproducible timestamps. */
function fixedClock(isoString) {
    const d = new Date(isoString);
    return () => new Date(d.getTime());
}

/** Fully seed a Techno-Kol Uzi shop-floor team. */
function buildSeededMatrix() {
    const m = new SkillsMatrix({
        clock: fixedClock('2026-04-11T08:00:00Z'),
        teams: {
            'SHOP-A': ['E-001', 'E-002', 'E-003', 'E-004'],
            'SHOP-B': ['E-005', 'E-006'],
        },
    });

    // Welder master + two apprentices
    m.assessEmployee({ employeeId: 'E-001', skillId: 'SKL-TIG',         level: 5, method: METHOD.TEST,    date: '2026-01-10' });
    m.assessEmployee({ employeeId: 'E-001', skillId: 'SKL-MIG',         level: 5, method: METHOD.CERT,    date: '2026-01-10' });
    m.assessEmployee({ employeeId: 'E-001', skillId: 'SKL-BLUEPRINT',   level: 4, method: METHOD.MANAGER, date: '2026-01-10' });
    m.assessEmployee({ employeeId: 'E-001', skillId: 'SKL-ISO-9001',    level: 3, method: METHOD.CERT,    date: '2026-01-10' });
    m.assessEmployee({ employeeId: 'E-001', skillId: 'SKL-TECH-HEB',    level: 5, method: METHOD.MANAGER, date: '2026-01-10' });

    // CNC laser guru — ONLY person who runs the laser ≥ 3 (SPOF!)
    m.assessEmployee({ employeeId: 'E-002', skillId: 'SKL-LASER-CNC',   level: 5, method: METHOD.TEST,    date: '2026-02-01' });
    m.assessEmployee({ employeeId: 'E-002', skillId: 'SKL-BLUEPRINT',   level: 3, method: METHOD.MANAGER, date: '2026-02-01' });
    m.assessEmployee({ employeeId: 'E-002', skillId: 'SKL-TECH-HEB',    level: 4, method: METHOD.MANAGER, date: '2026-02-01' });

    // Apprentice welder
    m.assessEmployee({ employeeId: 'E-003', skillId: 'SKL-MIG',         level: 2, method: METHOD.MANAGER, date: '2026-02-15' });
    m.assessEmployee({ employeeId: 'E-003', skillId: 'SKL-BLUEPRINT',   level: 2, method: METHOD.MANAGER, date: '2026-02-15' });
    m.assessEmployee({ employeeId: 'E-003', skillId: 'SKL-TECH-HEB',    level: 3, method: METHOD.SELF,    date: '2026-02-15' });

    // Press brake + plasma operator
    m.assessEmployee({ employeeId: 'E-004', skillId: 'SKL-PRESS-BRAKE', level: 4, method: METHOD.TEST,    date: '2026-01-20' });
    m.assessEmployee({ employeeId: 'E-004', skillId: 'SKL-PLASMA',      level: 4, method: METHOD.TEST,    date: '2026-01-20' });
    m.assessEmployee({ employeeId: 'E-004', skillId: 'SKL-BLUEPRINT',   level: 3, method: METHOD.MANAGER, date: '2026-01-20' });
    m.assessEmployee({ employeeId: 'E-004', skillId: 'SKL-TECH-HEB',    level: 4, method: METHOD.MANAGER, date: '2026-01-20' });

    // Quality / cert guy
    m.assessEmployee({ employeeId: 'E-005', skillId: 'SKL-ISO-9001',    level: 5, method: METHOD.CERT,    date: '2026-03-01' });
    m.assessEmployee({ employeeId: 'E-005', skillId: 'SKL-GDT',         level: 4, method: METHOD.TEST,    date: '2026-03-01' });
    m.assessEmployee({ employeeId: 'E-005', skillId: 'SKL-BLUEPRINT',   level: 5, method: METHOD.MANAGER, date: '2026-03-01' });

    // Newcomer — nothing much yet
    m.assessEmployee({ employeeId: 'E-006', skillId: 'SKL-TECH-HEB',    level: 2, method: METHOD.SELF,    date: '2026-03-15' });
    m.assessEmployee({ employeeId: 'E-006', skillId: 'SKL-BLUEPRINT',   level: 1, method: METHOD.SELF,    date: '2026-03-15' });

    return m;
}

// ══════════════════════════════════════════════════════════════════════
// 1. CONSTRUCTION & CATALOG
// ══════════════════════════════════════════════════════════════════════

test('01. constructor seeds metal-fab skill catalog by default', () => {
    const m = new SkillsMatrix();
    const skills = m.listSkills();
    assert.equal(skills.length, METAL_FAB_SKILLS.length);

    const ids = skills.map((s) => s.id).sort();
    assert.ok(ids.includes('SKL-LASER-CNC'));
    assert.ok(ids.includes('SKL-TIG'));
    assert.ok(ids.includes('SKL-MIG'));
    assert.ok(ids.includes('SKL-PLASMA'));
    assert.ok(ids.includes('SKL-PRESS-BRAKE'));
    assert.ok(ids.includes('SKL-BLUEPRINT'));
    assert.ok(ids.includes('SKL-GDT'));
    assert.ok(ids.includes('SKL-ISO-9001'));
    assert.ok(ids.includes('SKL-TECH-HEB'));
});

test('02. defineSkill validates category', () => {
    const m = new SkillsMatrix({ seedMetalFab: false });
    assert.throws(
        () => m.defineSkill({ id: 'X', name_he: 'א', name_en: 'A', category: 'bogus' }),
        /Invalid category/
    );
});

test('03. defineSkill stores bilingual names', () => {
    const m = new SkillsMatrix({ seedMetalFab: false });
    const s = m.defineSkill({
        id: 'SKL-PAINT',
        name_he: 'צביעה תעשייתית',
        name_en: 'Industrial painting',
        category: 'technical',
        description: 'Electrostatic powder coating, primer application',
    });
    assert.equal(s.id, 'SKL-PAINT');
    assert.equal(s.name_he, 'צביעה תעשייתית');
    assert.equal(s.name_en, 'Industrial painting');
    assert.equal(s.category, CATEGORY.TECHNICAL);
    assert.equal(s.active, true);
});

test('04. defineSkill on existing id UPGRADES, never erases', () => {
    const m = new SkillsMatrix({ seedMetalFab: false });
    m.defineSkill({ id: 'X1', name_he: 'ישן',  name_en: 'Old', category: 'technical' });
    m.defineSkill({ id: 'X1', name_he: 'חדש',  name_en: 'New', category: 'technical', description: 'updated' });
    const s = m.getSkill('X1');
    assert.equal(s.name_he, 'חדש');
    assert.equal(s.description, 'updated');
    // Only ONE skill stored, not two
    assert.equal(m.listSkills().length, 1);
});

// ══════════════════════════════════════════════════════════════════════
// 2. ASSESSMENT RECORDING
// ══════════════════════════════════════════════════════════════════════

test('05. assessEmployee rejects out-of-range level', () => {
    const m = new SkillsMatrix();
    assert.throws(
        () => m.assessEmployee({ employeeId: 'E1', skillId: 'SKL-MIG', level: 6, method: 'test' }),
        /out of range/
    );
    assert.throws(
        () => m.assessEmployee({ employeeId: 'E1', skillId: 'SKL-MIG', level: -1, method: 'test' }),
        /out of range/
    );
});

test('06. assessEmployee rejects unknown skill', () => {
    const m = new SkillsMatrix();
    assert.throws(
        () => m.assessEmployee({ employeeId: 'E1', skillId: 'SKL-NOPE', level: 3, method: 'test' }),
        /Unknown skillId/
    );
});

test('07. assessEmployee records and currentLevel resolves correctly', () => {
    const m = new SkillsMatrix({ clock: fixedClock('2026-04-11') });
    m.assessEmployee({ employeeId: 'E1', skillId: 'SKL-MIG', level: 3, method: 'self',    date: '2026-01-01' });
    m.assessEmployee({ employeeId: 'E1', skillId: 'SKL-MIG', level: 4, method: 'manager', date: '2026-02-01' });

    const cur = m.currentLevel('E1', 'SKL-MIG');
    assert.equal(cur.level, 4);
    assert.equal(cur.method, 'manager');
});

test('08. assessEmployee resolves by weight — test beats self even if older', () => {
    const m = new SkillsMatrix({ clock: fixedClock('2026-04-11') });
    // test (weight 1.2, score 3) beats self (weight 0.5, score 4)
    m.assessEmployee({ employeeId: 'E1', skillId: 'SKL-MIG', level: 3, method: 'test', date: '2026-01-01' });
    m.assessEmployee({ employeeId: 'E1', skillId: 'SKL-MIG', level: 4, method: 'self', date: '2026-03-01' });

    const cur = m.currentLevel('E1', 'SKL-MIG');
    assert.equal(cur.level, 3);
    assert.equal(cur.method, 'test');
});

test('09. assessEmployee history is append-only', () => {
    const m = new SkillsMatrix({ clock: fixedClock('2026-04-11') });
    m.assessEmployee({ employeeId: 'E1', skillId: 'SKL-MIG', level: 1, method: 'self',    date: '2025-01-01' });
    m.assessEmployee({ employeeId: 'E1', skillId: 'SKL-MIG', level: 2, method: 'manager', date: '2025-07-01' });
    m.assessEmployee({ employeeId: 'E1', skillId: 'SKL-MIG', level: 4, method: 'test',    date: '2026-03-01' });

    const hist = m.history('E1', 'SKL-MIG');
    assert.equal(hist.length, 3, 'all three assessments retained');
    assert.deepEqual(hist.map((h) => h.level), [1, 2, 4]);
});

test('10. expired cert is dropped from currentLevel', () => {
    const m = new SkillsMatrix({ clock: fixedClock('2026-04-11') });
    m.assessEmployee({
        employeeId: 'E1', skillId: 'SKL-ISO-9001',
        level: 5, method: 'cert',
        date: '2022-01-01',
        expiresAt: '2025-01-01',     // expired!
    });
    m.assessEmployee({
        employeeId: 'E1', skillId: 'SKL-ISO-9001',
        level: 3, method: 'manager',
        date: '2026-01-01',
    });

    const cur = m.currentLevel('E1', 'SKL-ISO-9001');
    assert.equal(cur.level, 3, 'expired cert was dropped, manager assessment wins');
});

// ══════════════════════════════════════════════════════════════════════
// 3. GAP CALCULATION
// ══════════════════════════════════════════════════════════════════════

test('11. skillGap — employeeId lookup + mixed met/unmet', () => {
    const m = buildSeededMatrix();
    const gap = m.skillGap({
        roleRequirements: {
            'SKL-MIG':       4,
            'SKL-TIG':       4,
            'SKL-BLUEPRINT': 3,
        },
        employeeActual: 'E-001',
    });
    // E-001 is MIG 5, TIG 5, BLUEPRINT 4 — all met
    assert.equal(gap.totalGap, 0);
    assert.equal(gap.fitScore, 1);
    assert.equal(gap.unmetCritical, 0);
    for (const r of gap.rows) assert.equal(r.met, true);
});

test('12. skillGap — gap math correct', () => {
    const m = buildSeededMatrix();
    const gap = m.skillGap({
        roleRequirements: {
            'SKL-MIG':       4,   // E-003 is 2 → gap 2
            'SKL-BLUEPRINT': 3,   // E-003 is 2 → gap 1
            'SKL-TIG':       4,   // E-003 is 0 → gap 4
        },
        employeeActual: 'E-003',
    });
    assert.equal(gap.totalGap, 2 + 1 + 4);
    assert.equal(gap.totalRequired, 11);
    // Coverage: MIG 2/4, BP 2/3, TIG 0/4 = 4/11 ≈ 0.3636
    assert.equal(gap.fitScore, 0.3636);
    assert.ok(gap.unmetCritical >= 2, 'MIG (gap 2) and TIG (gap 4) are critical');
});

test('13. skillGap — inline actual object works', () => {
    const m = new SkillsMatrix({ clock: fixedClock('2026-04-11') });
    const gap = m.skillGap({
        roleRequirements: { 'SKL-MIG': 3, 'SKL-TIG': 3 },
        employeeActual: { 'SKL-MIG': 3, 'SKL-TIG': 1 },
    });
    assert.equal(gap.rows.length, 2);
    assert.equal(gap.rows.find((r) => r.skillId === 'SKL-TIG').gap, 2);
    assert.equal(gap.rows.find((r) => r.skillId === 'SKL-MIG').gap, 0);
});

// ══════════════════════════════════════════════════════════════════════
// 4. SINGLE-POINT-OF-FAILURE DETECTION
// ══════════════════════════════════════════════════════════════════════

test('14. singlePoint — detects laser CNC SPOF (only E-002)', () => {
    const m = buildSeededMatrix();
    const r = m.singlePoint({ skillId: 'SKL-LASER-CNC' });
    assert.equal(r.isSPOF, true);
    assert.equal(r.qualifiedCount, 1);
    assert.equal(r.severity, 'high');
    assert.equal(r.qualified[0].employeeId, 'E-002');
    assert.ok(r.recommendation);
});

test('15. singlePoint — no-one qualified = critical', () => {
    const m = buildSeededMatrix();
    const r = m.singlePoint({ skillId: 'SKL-GDT', teamId: 'SHOP-A' });
    // Nobody in SHOP-A was assessed on GD&T
    assert.equal(r.qualifiedCount, 0);
    assert.equal(r.severity, 'critical');
    assert.equal(r.isSPOF, true);
});

test('16. singlePoint — scan all skills yields sorted list', () => {
    const m = buildSeededMatrix();
    const all = m.singlePoint({});
    assert.ok(Array.isArray(all));
    assert.ok(all.length === METAL_FAB_SKILLS.length);
    // Critical severity must come first
    const severityOrder = ['critical', 'high', 'medium', 'ok'];
    for (let i = 1; i < all.length; i++) {
        const prev = severityOrder.indexOf(all[i - 1].severity);
        const cur  = severityOrder.indexOf(all[i].severity);
        assert.ok(prev <= cur, `severity order broken at index ${i}`);
    }
});

test('17. singlePoint — custom threshold changes results', () => {
    const m = buildSeededMatrix();
    const r3 = m.singlePoint({ skillId: 'SKL-MIG', threshold: 3 });
    const r5 = m.singlePoint({ skillId: 'SKL-MIG', threshold: 5 });
    assert.ok(r3.qualifiedCount >= r5.qualifiedCount, 'raising threshold shrinks the qualified set');
});

// ══════════════════════════════════════════════════════════════════════
// 5. SUCCESSION PLANNING
// ══════════════════════════════════════════════════════════════════════

test('18. successionPlanning — E-001 is ready_now for weld supervisor', () => {
    const m = buildSeededMatrix();
    const plan = m.successionPlanning({
        position: {
            id: 'POS-WELD-SUP',
            name_he: 'ראש צוות ריתוך',
            name_en: 'Welding team lead',
            requirements: {
                'SKL-MIG':       4,
                'SKL-TIG':       4,
                'SKL-BLUEPRINT': 3,
                'SKL-TECH-HEB':  3,
            },
        },
        candidates: ['E-001', 'E-003', 'E-006'],
    });
    assert.equal(plan.candidates[0].employeeId, 'E-001');
    assert.equal(plan.candidates[0].ready, true);
    assert.equal(plan.candidates[0].readiness, 'ready_now');
    assert.equal(plan.candidates[0].unmetCritical, 0);

    // E-006 newcomer is way behind
    const e006 = plan.candidates.find((c) => c.employeeId === 'E-006');
    assert.equal(e006.readiness, 'not_candidate');
    assert.equal(e006.ready, false);
});

test('19. successionPlanning — candidates are sorted by readiness', () => {
    const m = buildSeededMatrix();
    const plan = m.successionPlanning({
        position: {
            id: 'POS-QA',
            requirements: { 'SKL-ISO-9001': 4, 'SKL-GDT': 3, 'SKL-BLUEPRINT': 4 },
        },
        candidates: ['E-005', 'E-001', 'E-003'],
    });
    // descending by readinessScore
    for (let i = 1; i < plan.candidates.length; i++) {
        assert.ok(plan.candidates[i - 1].readinessScore >= plan.candidates[i].readinessScore);
    }
    // E-005 is the cert/QA guy — should top the list
    assert.equal(plan.candidates[0].employeeId, 'E-005');
});

// ══════════════════════════════════════════════════════════════════════
// 6. TRAINING RECOMMENDATION
// ══════════════════════════════════════════════════════════════════════

test('20. trainingRecommendation — plan sorted by priority, hours calculated', () => {
    const m = buildSeededMatrix();
    const rec = m.trainingRecommendation({
        employeeId: 'E-003',
        targetRole: {
            id: 'ROLE-WELDER-III',
            requirements: {
                'SKL-MIG':       4,  // 2 → 4, gap 2, TECHNICAL → 80h
                'SKL-TIG':       3,  // 0 → 3, gap 3, TECHNICAL → 120h
                'SKL-BLUEPRINT': 3,  // 2 → 3, gap 1, TECHNICAL → 40h
            },
        },
    });
    assert.equal(rec.employeeId, 'E-003');
    assert.equal(rec.totalGapLevels, 2 + 3 + 1);
    assert.equal(rec.totalEstHours, 40 * (2 + 3 + 1));
    // critical (gap ≥ 3) before high (gap 2) before medium (gap 1)
    const priorities = rec.plan.map((p) => p.priority);
    assert.equal(priorities[0], 'critical');
    assert.equal(priorities[priorities.length - 1], 'medium');
});

// ══════════════════════════════════════════════════════════════════════
// 7. TEAM CAPABILITY & CROSS-TRAINING
// ══════════════════════════════════════════════════════════════════════

test('21. teamCapability — histogram + atOrAbove correct', () => {
    const m = buildSeededMatrix();
    const cap = m.teamCapability('SHOP-A', 'SKL-BLUEPRINT');
    // SHOP-A: E-001=4, E-002=3, E-003=2, E-004=3 → histogram 0:0,1:0,2:1,3:2,4:1
    assert.equal(cap.histogram[2], 1);
    assert.equal(cap.histogram[3], 2);
    assert.equal(cap.histogram[4], 1);
    assert.equal(cap.atOrAbove[3], 3); // 3 at ≥ level 3
    assert.equal(cap.atOrAbove[4], 1);
    assert.equal(cap.size, 4);
    assert.equal(cap.max, 4);
});

test('22. crossTrainingPlan — proposes mentor/apprentice for skills at risk', () => {
    const m = buildSeededMatrix();
    const plan = m.crossTrainingPlan('SHOP-A');
    assert.ok(plan.skillsAtRisk > 0);
    for (const rot of plan.rotations) {
        assert.ok(rot.currentRedundancy < 2);
        assert.ok(rot.skill);
    }
});

// ══════════════════════════════════════════════════════════════════════
// 8. VISUALIZATION
// ══════════════════════════════════════════════════════════════════════

test('23. visualizeMatrix — returns rectangular grid + legend', () => {
    const m = buildSeededMatrix();
    const v = m.visualizeMatrix({ teamId: 'SHOP-A' });
    assert.equal(v.rows.length, 4);
    assert.equal(v.matrix.length, 4);
    for (const row of v.matrix) {
        assert.equal(row.length, v.cols.length);
    }
    assert.equal(Object.keys(v.legend).length, 6); // 0..5
});

// ══════════════════════════════════════════════════════════════════════
// 9. SKILL DEMAND FORECAST
// ══════════════════════════════════════════════════════════════════════

test('24. skillDemandForecast — combines hiring demand + attrition loss', () => {
    const m = buildSeededMatrix();
    const fc = m.skillDemandForecast({
        openPositions: [
            { positionId: 'OP-1', count: 2, requirements: { 'SKL-TIG': 3, 'SKL-BLUEPRINT': 3 } },
            { positionId: 'OP-2', count: 1, requirements: { 'SKL-LASER-CNC': 4 } },
        ],
        attritionRisk: [
            // E-002 is our ONLY laser operator — if he leaves we lose everything.
            { employeeId: 'E-002', risk: 0.8 },
        ],
    });

    const laser = fc.forecast.find((f) => f.skillId === 'SKL-LASER-CNC');
    assert.ok(laser, 'laser should appear in forecast');
    // 1 open position × 1 weight + 0.8 attrition = 1.8 net
    assert.equal(laser.demandFromHiring, 1);
    assert.equal(laser.expectedLossFromAttrition, 0.8);
    assert.equal(laser.netDemand, 1.8);
    assert.equal(laser.priority, 'high');

    const tig = fc.forecast.find((f) => f.skillId === 'SKL-TIG');
    assert.equal(tig.demandFromHiring, 2);
});

test('25. skillDemandForecast — forecast sorted by netDemand desc', () => {
    const m = buildSeededMatrix();
    const fc = m.skillDemandForecast({
        openPositions: [
            { positionId: 'OP-1', count: 5, requirements: { 'SKL-MIG': 3 } },
            { positionId: 'OP-2', count: 1, requirements: { 'SKL-TIG': 3 } },
        ],
    });
    assert.ok(fc.forecast.length >= 2);
    for (let i = 1; i < fc.forecast.length; i++) {
        assert.ok(fc.forecast[i - 1].netDemand >= fc.forecast[i].netDemand);
    }
    assert.equal(fc.forecast[0].skillId, 'SKL-MIG');
});

// ══════════════════════════════════════════════════════════════════════
// 10. AUDIT TRAIL
// ══════════════════════════════════════════════════════════════════════

test('26. auditTrail records every define + assess action', () => {
    const m = new SkillsMatrix({ seedMetalFab: false, clock: fixedClock('2026-04-11') });
    m.defineSkill({ id: 'X1', name_he: 'א', name_en: 'A', category: 'technical' });
    m.assessEmployee({ employeeId: 'E1', skillId: 'X1', level: 3, method: 'test' });
    m.assessEmployee({ employeeId: 'E1', skillId: 'X1', level: 4, method: 'test' });

    const log = m.auditTrail();
    assert.equal(log.length, 3);
    assert.equal(log[0].kind, 'defineSkill');
    assert.equal(log[1].kind, 'assessEmployee');
    assert.equal(log[2].kind, 'assessEmployee');
});

// ══════════════════════════════════════════════════════════════════════
// 11. LEVEL SCALE INTEGRITY
// ══════════════════════════════════════════════════════════════════════

test('27. LEVEL scale has all 6 levels with bilingual labels', () => {
    for (let i = 0; i <= 5; i++) {
        assert.ok(LEVEL[i]);
        assert.ok(LEVEL[i].he);
        assert.ok(LEVEL[i].en);
    }
    assert.equal(LEVEL[0].en, 'None');
    assert.equal(LEVEL[5].en, 'Master/Teacher');
    assert.equal(LEVEL[3].he, 'עצמאי');
});
