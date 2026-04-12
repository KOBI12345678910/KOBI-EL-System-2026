/**
 * CAPA Workflow tests — Agent Y-038 (Swarm Quality)
 * Techno-Kol Uzi Mega-ERP (Kobi 2026)
 *
 * Tests the CAPAWorkflow class (8D methodology, ISO 9001:2015 aligned).
 *
 * Run:
 *   cd onyx-procurement
 *   node --test test/quality/capa-workflow.test.js
 *
 * Coverage:
 *   - createCAPA (inputs, validation, NCR linkage, id generation)
 *   - 8D stage gating (cannot skip, cannot go backwards, evidence required)
 *   - effectivenessCheck timing (min 30 days after implementation)
 *   - escalation rules (level 1/2/3 thresholds)
 *   - recurrence detection via relatedCAPAs
 *   - openCAPAs / overdueCAPAs dashboards
 *   - metrics rollup (time-to-containment, time-to-resolution, recurrence)
 *   - generate8DReport bilingual structure
 *   - non-destructiveness (archive, never hard-delete)
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CAPAWorkflow,
  STAGES,
  STAGE_ORDER,
  TRIGGERS,
  SEVERITIES,
  STATUS,
  STAGE_SLA_DAYS,
  ESCALATION_DAYS,
  MIN_EFFECTIVENESS_WAIT_DAYS,
  ISO_9001_REFS,
  LABELS_HE,
  LABELS_EN,
} = require('../../src/quality/capa-workflow.js');

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Create a CAPAWorkflow whose clock is a mutable reference so tests
 * can advance virtual time without touching the real clock.
 */
function makeClockedWorkflow(startIso = '2026-01-01T08:00:00.000Z', opts = {}) {
  const clock = { now: new Date(startIso) };
  const wf = new CAPAWorkflow(Object.assign({
    now: () => new Date(clock.now.getTime()),
  }, opts));
  return { wf, clock, advanceDays(d) { clock.now = new Date(clock.now.getTime() + d * 86400000); } };
}

function baseInput(extra = {}) {
  return Object.assign({
    trigger: TRIGGERS.NCR,
    description_he: 'ריתוך קר במסגרת — פגם קריטי בחוזק',
    description_en: 'Cold weld on frame — critical strength defect',
    rootCause: 'welder temperature not calibrated',
    sourceId: 'NCR-000123',
    severity: SEVERITIES.MAJOR,
    owner: 'qm@techno-kol-uzi.example',
  }, extra);
}

function fullEvidence(extra = {}) {
  return Object.assign({
    notes: 'evidence notes — ראיות מצורפות',
    attachments: ['inspection-photo.jpg'],
    approvedBy: 'qm@techno-kol-uzi',
    containmentAction: 'quarantine lot + 100% inspection',
    rootCause: 'welder heater PID drift',
    permanentAction: 'recalibrate + retrain operators',
    preventiveAction: 'monthly PID audit',
    implementedAt: '2026-01-20T10:00:00.000Z',
  }, extra);
}

// ─────────────────────────────────────────────────────────────────
// 01. Constants & exports sanity
// ─────────────────────────────────────────────────────────────────

test('01. exports CAPAWorkflow class and constants', () => {
  assert.equal(typeof CAPAWorkflow, 'function');
  assert.equal(typeof STAGES, 'object');
  assert.equal(typeof TRIGGERS, 'object');
  assert.equal(typeof STATUS, 'object');
  assert.equal(typeof ISO_9001_REFS, 'object');
  assert.equal(STAGE_ORDER.length, 8, '8D must have exactly 8 stages');
});

test('02. STAGES are in correct 8D order', () => {
  assert.deepEqual(STAGE_ORDER, [
    STAGES.D1_TEAM,
    STAGES.D2_PROBLEM,
    STAGES.D3_CONTAINMENT,
    STAGES.D4_ROOT_CAUSE,
    STAGES.D5_PERMANENT,
    STAGES.D6_IMPLEMENT,
    STAGES.D7_PREVENT,
    STAGES.D8_CLOSE,
  ]);
});

test('03. ISO 9001 refs include clause 10.2', () => {
  assert.ok(ISO_9001_REFS['10.2']);
  assert.match(ISO_9001_REFS['10.2'], /corrective action/i);
});

test('04. Hebrew labels are frozen and contain 8D stages', () => {
  assert.ok(Object.isFrozen(LABELS_HE));
  assert.ok(LABELS_HE.stages.D1_TEAM.includes('D1'));
  assert.ok(LABELS_HE.stages.D4_ROOT_CAUSE.includes('שורש'));
});

test('05. Severity SLA multipliers make CRITICAL faster than MINOR', () => {
  const { wf } = makeClockedWorkflow();
  const id1 = wf.createCAPA(baseInput({ severity: SEVERITIES.CRITICAL }));
  const id2 = wf.createCAPA(baseInput({ severity: SEVERITIES.MINOR }));
  const capa1 = wf.getCAPA(id1);
  const capa2 = wf.getCAPA(id2);
  assert.ok(new Date(capa1.dueDate).getTime() < new Date(capa2.dueDate).getTime());
});

// ─────────────────────────────────────────────────────────────────
// createCAPA — inputs and validation
// ─────────────────────────────────────────────────────────────────

test('06. createCAPA returns a stable CAPA-###### id', () => {
  const { wf } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  assert.match(id, /^CAPA-\d{6}$/);
});

test('07. createCAPA stores all input fields', () => {
  const { wf } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  const capa = wf.getCAPA(id);
  assert.equal(capa.trigger, TRIGGERS.NCR);
  assert.equal(capa.severity, SEVERITIES.MAJOR);
  assert.equal(capa.sourceId, 'NCR-000123');
  assert.equal(capa.currentStage, STAGES.D1_TEAM);
  assert.equal(capa.status, STATUS.OPEN);
  assert.ok(capa.description.he.includes('ריתוך'));
  assert.ok(capa.description.en.includes('Cold weld'));
});

test('08. createCAPA rejects missing trigger', () => {
  const { wf } = makeClockedWorkflow();
  assert.throws(() => wf.createCAPA({ description_he: 'x' }), /trigger/);
});

test('09. createCAPA rejects invalid trigger', () => {
  const { wf } = makeClockedWorkflow();
  assert.throws(
    () => wf.createCAPA(baseInput({ trigger: 'magic' })),
    /invalid trigger/,
  );
});

test('10. createCAPA rejects invalid severity', () => {
  const { wf } = makeClockedWorkflow();
  assert.throws(
    () => wf.createCAPA(baseInput({ severity: 'BANANA' })),
    /invalid severity/,
  );
});

test('11. createCAPA requires at least one description language', () => {
  const { wf } = makeClockedWorkflow();
  assert.throws(
    () => wf.createCAPA(baseInput({ description_he: '', description_en: '' })),
    /description/,
  );
});

test('12. createCAPA falls back between Hebrew/English when one missing', () => {
  const { wf } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput({ description_en: '' }));
  const capa = wf.getCAPA(id);
  assert.equal(capa.description.en, capa.description.he);
});

test('13. createCAPA integrates with Y-037 NCR via ncrRepo', () => {
  const ncrRepo = {
    findNcrById(id) {
      return {
        id,
        product: 'FRAME-X1',
        supplier: 'SUP-42',
        severity: 'MAJOR',
        loggedAt: '2026-01-02T09:00:00.000Z',
      };
    },
  };
  const { wf } = makeClockedWorkflow(undefined, { ncrRepo });
  const id = wf.createCAPA(baseInput());
  const capa = wf.getCAPA(id);
  assert.ok(capa.ncrSnapshot);
  assert.equal(capa.ncrSnapshot.product, 'FRAME-X1');
  assert.equal(capa.ncrSnapshot.supplier, 'SUP-42');
});

test('14. createCAPA survives NCR repo errors (safe-by-default)', () => {
  const ncrRepo = {
    findNcrById() { throw new Error('db down'); },
  };
  const { wf } = makeClockedWorkflow(undefined, { ncrRepo });
  const id = wf.createCAPA(baseInput());
  const capa = wf.getCAPA(id);
  assert.equal(capa.ncrSnapshot, null);
});

// ─────────────────────────────────────────────────────────────────
// 8D stage gating
// ─────────────────────────────────────────────────────────────────

test('15. advanceStage D1 → D2 works with valid evidence', () => {
  const { wf } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  const capa = wf.advanceStage(id, STAGES.D2_PROBLEM, { notes: 'problem defined' });
  assert.equal(capa.currentStage, STAGES.D2_PROBLEM);
  assert.equal(capa.status, STATUS.IN_PROGRESS);
});

test('16. advanceStage cannot skip stages (D1 → D3)', () => {
  const { wf } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  assert.throws(
    () => wf.advanceStage(id, STAGES.D3_CONTAINMENT, { notes: 'x' }),
    /gated|advance one at a time/i,
  );
});

test('17. advanceStage cannot move backwards (D2 → D1)', () => {
  const { wf } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  wf.advanceStage(id, STAGES.D2_PROBLEM, { notes: 'problem' });
  assert.throws(
    () => wf.advanceStage(id, STAGES.D1_TEAM, { notes: 'rewind' }),
    /backwards|same stage/i,
  );
});

test('18. advanceStage requires evidence object', () => {
  const { wf } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  assert.throws(
    () => wf.advanceStage(id, STAGES.D2_PROBLEM, null),
    /evidence/,
  );
});

test('19. advanceStage requires notes or attachments', () => {
  const { wf } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  assert.throws(
    () => wf.advanceStage(id, STAGES.D2_PROBLEM, { notes: '' }),
    /notes or attachments/,
  );
});

test('20. advanceStage D3 (Containment) requires containmentAction', () => {
  const { wf } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  wf.advanceStage(id, STAGES.D2_PROBLEM, { notes: 'problem' });
  assert.throws(
    () => wf.advanceStage(id, STAGES.D3_CONTAINMENT, { notes: 'x' }),
    /D3.*containmentAction/,
  );
});

test('21. advanceStage D4 (Root Cause) requires rootCause evidence', () => {
  const { wf } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  wf.advanceStage(id, STAGES.D2_PROBLEM, { notes: 'problem' });
  wf.advanceStage(id, STAGES.D3_CONTAINMENT, {
    notes: 'quarantine',
    containmentAction: 'quarantine lot + 100% inspection',
  });
  assert.throws(
    () => wf.advanceStage(id, STAGES.D4_ROOT_CAUSE, { notes: 'x' }),
    /D4.*rootCause/,
  );
});

test('22. advanceStage D6 (Implement) requires implementedAt', () => {
  const { wf, advanceDays } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  wf.advanceStage(id, STAGES.D2_PROBLEM, { notes: 'defined' });
  wf.advanceStage(id, STAGES.D3_CONTAINMENT, {
    notes: 'q', containmentAction: 'quarantine',
  });
  wf.advanceStage(id, STAGES.D4_ROOT_CAUSE, { notes: 'r', rootCause: 'PID drift' });
  wf.advanceStage(id, STAGES.D5_PERMANENT, { notes: 'plan', permanentAction: 'recal' });
  advanceDays(5);
  assert.throws(
    () => wf.advanceStage(id, STAGES.D6_IMPLEMENT, { notes: 'implemented' }),
    /D6.*implementedAt/,
  );
});

test('23. advanceStage D8 (Close) requires approvedBy', () => {
  const { wf } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  wf.advanceStage(id, STAGES.D2_PROBLEM, { notes: 'defined' });
  wf.advanceStage(id, STAGES.D3_CONTAINMENT, {
    notes: 'q', containmentAction: 'qr',
  });
  wf.advanceStage(id, STAGES.D4_ROOT_CAUSE, { notes: 'r', rootCause: 'PID drift' });
  wf.advanceStage(id, STAGES.D5_PERMANENT, { notes: 'plan', permanentAction: 'recal' });
  wf.advanceStage(id, STAGES.D6_IMPLEMENT, {
    notes: 'impl', implementedAt: '2026-01-10T00:00:00Z',
  });
  wf.advanceStage(id, STAGES.D7_PREVENT, { notes: 'prevent', preventiveAction: 'audit' });
  assert.throws(
    () => wf.advanceStage(id, STAGES.D8_CLOSE, { notes: 'close' }),
    /D8.*approvedBy/,
  );
});

test('24. full 8D walkthrough D1 → D8 transitions correctly', () => {
  const { wf, advanceDays } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  advanceDays(1);
  wf.advanceStage(id, STAGES.D2_PROBLEM, { notes: 'defined' });
  advanceDays(1);
  wf.advanceStage(id, STAGES.D3_CONTAINMENT, {
    notes: 'q', containmentAction: 'quarantine',
  });
  advanceDays(2);
  wf.advanceStage(id, STAGES.D4_ROOT_CAUSE, {
    notes: 'rc', rootCause: 'heater PID drift',
  });
  advanceDays(3);
  wf.advanceStage(id, STAGES.D5_PERMANENT, {
    notes: 'plan', permanentAction: 'recalibrate + retrain',
  });
  advanceDays(5);
  wf.advanceStage(id, STAGES.D6_IMPLEMENT, {
    notes: 'done', implementedAt: '2026-01-13T00:00:00Z',
  });
  advanceDays(3);
  wf.advanceStage(id, STAGES.D7_PREVENT, {
    notes: 'audit', preventiveAction: 'monthly PID audit',
  });
  advanceDays(2);
  const closedCapa = wf.advanceStage(id, STAGES.D8_CLOSE, {
    notes: 'closed', approvedBy: 'qm@techno-kol-uzi',
  });
  assert.equal(closedCapa.currentStage, STAGES.D8_CLOSE);
  // Verification still pending → VERIFYING, not CLOSED
  assert.equal(closedCapa.status, STATUS.VERIFYING);
});

test('25. advance fails on unknown CAPA id', () => {
  const { wf } = makeClockedWorkflow();
  assert.throws(
    () => wf.advanceStage('CAPA-999999', STAGES.D2_PROBLEM, { notes: 'x' }),
    /not found/,
  );
});

test('26. stages accept short form D1..D8 in advanceStage', () => {
  const { wf } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  const capa = wf.advanceStage(id, 'D2', { notes: 'defined via short form' });
  assert.equal(capa.currentStage, STAGES.D2_PROBLEM);
});

// ─────────────────────────────────────────────────────────────────
// effectivenessCheck — timing and verification
// ─────────────────────────────────────────────────────────────────

test('27. effectivenessCheck rejected if before D6 (Implement)', () => {
  const { wf } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  wf.advanceStage(id, STAGES.D2_PROBLEM, { notes: 'p' });
  assert.throws(
    () => wf.effectivenessCheck(id, {
      daysAfter: 30, metric: 'defect_rate_pct',
      result: { baseline: 5, current: 1, target: 2 },
    }),
    /before D6|not.*implement/i,
  );
});

test('28. effectivenessCheck enforces MIN 30-day wait', () => {
  const { wf } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  // walk to D6
  wf.advanceStage(id, STAGES.D2_PROBLEM, { notes: 'p' });
  wf.advanceStage(id, STAGES.D3_CONTAINMENT, { notes: 'c', containmentAction: 'quar' });
  wf.advanceStage(id, STAGES.D4_ROOT_CAUSE, { notes: 'r', rootCause: 'PID' });
  wf.advanceStage(id, STAGES.D5_PERMANENT, { notes: 'p', permanentAction: 'recal' });
  wf.advanceStage(id, STAGES.D6_IMPLEMENT, { notes: 'i', implementedAt: '2026-01-05T00:00:00Z' });

  assert.throws(
    () => wf.effectivenessCheck(id, {
      daysAfter: 10, metric: 'defect_rate_pct',
      result: { baseline: 5, current: 1, target: 2 },
    }),
    /too early|minimum/i,
  );
  assert.equal(MIN_EFFECTIVENESS_WAIT_DAYS, 30);
});

test('29. effectivenessCheck pass by numeric comparison (lower-is-better)', () => {
  const { wf } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  wf.advanceStage(id, STAGES.D2_PROBLEM, { notes: 'p' });
  wf.advanceStage(id, STAGES.D3_CONTAINMENT, { notes: 'c', containmentAction: 'quar' });
  wf.advanceStage(id, STAGES.D4_ROOT_CAUSE, { notes: 'r', rootCause: 'PID' });
  wf.advanceStage(id, STAGES.D5_PERMANENT, { notes: 'p', permanentAction: 'recal' });
  wf.advanceStage(id, STAGES.D6_IMPLEMENT, { notes: 'i', implementedAt: '2026-01-05T00:00:00Z' });

  const rec = wf.effectivenessCheck(id, {
    daysAfter: 45, metric: 'defect_rate_pct',
    result: { baseline: 5, current: 1, target: 2 },
  });
  assert.equal(rec.passed, true);
  assert.equal(rec.improvement, 4);
});

test('30. effectivenessCheck fail flips CAPA back to IN_PROGRESS', () => {
  const { wf } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  wf.advanceStage(id, STAGES.D2_PROBLEM, { notes: 'p' });
  wf.advanceStage(id, STAGES.D3_CONTAINMENT, { notes: 'c', containmentAction: 'quar' });
  wf.advanceStage(id, STAGES.D4_ROOT_CAUSE, { notes: 'r', rootCause: 'PID' });
  wf.advanceStage(id, STAGES.D5_PERMANENT, { notes: 'p', permanentAction: 'recal' });
  wf.advanceStage(id, STAGES.D6_IMPLEMENT, { notes: 'i', implementedAt: '2026-01-05T00:00:00Z' });
  wf.advanceStage(id, STAGES.D7_PREVENT, { notes: 'prev', preventiveAction: 'audit' });
  wf.advanceStage(id, STAGES.D8_CLOSE, { notes: 'c', approvedBy: 'qm' });

  // fail: current > target
  const rec = wf.effectivenessCheck(id, {
    daysAfter: 45, metric: 'defect_rate_pct',
    result: { baseline: 5, current: 4, target: 2 },
  });
  assert.equal(rec.passed, false);

  const capa = wf.getCAPA(id);
  assert.equal(capa.status, STATUS.IN_PROGRESS);
  assert.equal(capa.closureOutcome, 'INEFFECTIVE');
});

test('31. effectivenessCheck with higherIsBetter uses opposite comparison', () => {
  const { wf } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  wf.advanceStage(id, STAGES.D2_PROBLEM, { notes: 'p' });
  wf.advanceStage(id, STAGES.D3_CONTAINMENT, { notes: 'c', containmentAction: 'quar' });
  wf.advanceStage(id, STAGES.D4_ROOT_CAUSE, { notes: 'r', rootCause: 'PID' });
  wf.advanceStage(id, STAGES.D5_PERMANENT, { notes: 'p', permanentAction: 'recal' });
  wf.advanceStage(id, STAGES.D6_IMPLEMENT, { notes: 'i', implementedAt: '2026-01-05T00:00:00Z' });

  const rec = wf.effectivenessCheck(id, {
    daysAfter: 60, metric: 'fpy_pct', // first-pass yield
    result: { baseline: 85, current: 97, target: 95, higherIsBetter: true },
  });
  assert.equal(rec.passed, true);
});

test('32. effectivenessCheck pass after D8 closes the CAPA', () => {
  const { wf, advanceDays } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  wf.advanceStage(id, STAGES.D2_PROBLEM, { notes: 'p' });
  wf.advanceStage(id, STAGES.D3_CONTAINMENT, { notes: 'c', containmentAction: 'quar' });
  wf.advanceStage(id, STAGES.D4_ROOT_CAUSE, { notes: 'r', rootCause: 'PID' });
  wf.advanceStage(id, STAGES.D5_PERMANENT, { notes: 'p', permanentAction: 'recal' });
  wf.advanceStage(id, STAGES.D6_IMPLEMENT, { notes: 'i', implementedAt: '2026-01-05T00:00:00Z' });
  wf.advanceStage(id, STAGES.D7_PREVENT, { notes: 'prev', preventiveAction: 'audit' });
  advanceDays(40);
  wf.advanceStage(id, STAGES.D8_CLOSE, { notes: 'c', approvedBy: 'qm' });

  const rec = wf.effectivenessCheck(id, {
    daysAfter: 45, metric: 'defect_rate_pct',
    result: { baseline: 5, current: 1, target: 2 },
  });
  assert.equal(rec.passed, true);
  const capa = wf.getCAPA(id);
  assert.equal(capa.status, STATUS.CLOSED);
  assert.equal(capa.closureOutcome, 'EFFECTIVE');
});

// ─────────────────────────────────────────────────────────────────
// escalation rules
// ─────────────────────────────────────────────────────────────────

test('33. escalation level 0 when CAPA is on time', () => {
  const { wf } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  const rec = wf.escalation(id);
  assert.equal(rec.level, 0);
});

test('34. escalation level 1 when 3+ days over SLA', () => {
  const { wf, advanceDays } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput({ severity: SEVERITIES.MINOR })); // SLA = 1 day for D1
  advanceDays(1 + ESCALATION_DAYS.LEVEL_1_SUPERVISOR + 1); // past SLA by 4 days
  const rec = wf.escalation(id);
  assert.equal(rec.level, 1);
  assert.equal(rec.target, 'supervisor');
});

test('35. escalation level 2 when 7+ days over SLA', () => {
  const { wf, advanceDays } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput({ severity: SEVERITIES.MINOR }));
  advanceDays(1 + ESCALATION_DAYS.LEVEL_2_MANAGER + 1);
  const rec = wf.escalation(id);
  assert.equal(rec.level, 2);
  assert.equal(rec.target, 'department-manager');
});

test('36. escalation level 3 when 14+ days over SLA', () => {
  const { wf, advanceDays } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput({ severity: SEVERITIES.MINOR }));
  advanceDays(1 + ESCALATION_DAYS.LEVEL_3_EXECUTIVE + 1);
  const rec = wf.escalation(id);
  assert.equal(rec.level, 3);
  assert.equal(rec.target, 'executive-quality-manager');
});

test('37. escalation records are appended to CAPA history', () => {
  const { wf, advanceDays } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput({ severity: SEVERITIES.MINOR }));
  advanceDays(1 + ESCALATION_DAYS.LEVEL_1_SUPERVISOR + 1);
  wf.escalation(id);
  advanceDays(ESCALATION_DAYS.LEVEL_2_MANAGER - ESCALATION_DAYS.LEVEL_1_SUPERVISOR + 1);
  wf.escalation(id);
  const capa = wf.getCAPA(id);
  assert.equal(capa.escalationHistory.length, 2);
  assert.equal(capa.escalationHistory[0].level, 1);
  assert.equal(capa.escalationHistory[1].level, 2);
  assert.equal(capa.status, STATUS.ESCALATED);
});

test('38. escalation does not regress from higher level to lower', () => {
  const { wf, advanceDays } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput({ severity: SEVERITIES.MINOR }));
  advanceDays(1 + ESCALATION_DAYS.LEVEL_3_EXECUTIVE + 1);
  wf.escalation(id);
  const capa1 = wf.getCAPA(id);
  // calling again should not add a lower-level record
  wf.escalation(id);
  const capa2 = wf.getCAPA(id);
  assert.equal(capa2.escalationHistory.length, capa1.escalationHistory.length);
  assert.equal(capa2.escalationLevel, 3);
});

test('39. escalation is a no-op on closed CAPAs', () => {
  const { wf, advanceDays } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  wf.advanceStage(id, STAGES.D2_PROBLEM, { notes: 'p' });
  wf.advanceStage(id, STAGES.D3_CONTAINMENT, { notes: 'c', containmentAction: 'q' });
  wf.advanceStage(id, STAGES.D4_ROOT_CAUSE, { notes: 'r', rootCause: 'PID' });
  wf.advanceStage(id, STAGES.D5_PERMANENT, { notes: 'p', permanentAction: 'recal' });
  wf.advanceStage(id, STAGES.D6_IMPLEMENT, { notes: 'i', implementedAt: '2026-01-05T00:00:00Z' });
  wf.advanceStage(id, STAGES.D7_PREVENT, { notes: 'prev', preventiveAction: 'audit' });
  advanceDays(40);
  wf.advanceStage(id, STAGES.D8_CLOSE, { notes: 'c', approvedBy: 'qm' });
  wf.effectivenessCheck(id, {
    daysAfter: 45, metric: 'defect_rate_pct',
    result: { baseline: 5, current: 1, target: 2 },
  });
  advanceDays(200);
  const rec = wf.escalation(id);
  assert.equal(rec.level, 0);
  assert.equal(rec.reason, 'not-active');
});

// ─────────────────────────────────────────────────────────────────
// Recurrence detection / relatedCAPAs
// ─────────────────────────────────────────────────────────────────

test('40. relatedCAPAs finds siblings with same sourceId', () => {
  const { wf } = makeClockedWorkflow();
  const id1 = wf.createCAPA(baseInput({ sourceId: 'NCR-777' }));
  const id2 = wf.createCAPA(baseInput({
    sourceId: 'NCR-777',
    description_he: 'שוב פגם ריתוך באותה מסגרת',
    description_en: 'Recurring weld defect on the same frame',
  }));
  const rel = wf.relatedCAPAs(id1);
  assert.equal(rel.length, 1);
  assert.equal(rel[0].capaId, id2);
  assert.ok(rel[0].reasons.includes('same-source'));
});

test('41. relatedCAPAs finds text-similar descriptions', () => {
  const { wf } = makeClockedWorkflow();
  const id1 = wf.createCAPA(baseInput({
    sourceId: 'NCR-A',
    description_en: 'Cold weld strength defect frame module',
  }));
  const id2 = wf.createCAPA(baseInput({
    sourceId: 'NCR-B',
    description_en: 'Strength defect cold weld frame module batch two',
  }));
  const rel = wf.relatedCAPAs(id1);
  assert.ok(rel.length >= 1);
  assert.equal(rel[0].capaId, id2);
  assert.ok(rel[0].reasons.some((r) => r.startsWith('text-sim')));
});

test('42. relatedCAPAs ranks same-source over text similarity', () => {
  const { wf } = makeClockedWorkflow();
  const id1 = wf.createCAPA(baseInput({
    sourceId: 'NCR-X',
    description_en: 'Cold weld strength defect frame',
  }));
  const id2 = wf.createCAPA(baseInput({
    sourceId: 'NCR-X',
    description_en: 'Entirely unrelated words foo bar baz',
  }));
  const id3 = wf.createCAPA(baseInput({
    sourceId: 'NCR-Y',
    description_en: 'Cold weld strength defect frame again',
  }));
  const rel = wf.relatedCAPAs(id1);
  assert.equal(rel[0].capaId, id2); // same source always first
  assert.equal(rel[1].capaId, id3);
});

test('43. relatedCAPAs detects same-product through ncrSnapshot', () => {
  const ncrRepo = {
    _map: {
      'NCR-1': { id: 'NCR-1', product: 'FRAME-X1', supplier: 'SUP-9' },
      'NCR-2': { id: 'NCR-2', product: 'FRAME-X1', supplier: 'SUP-9' },
    },
    findNcrById(id) { return this._map[id]; },
  };
  const { wf } = makeClockedWorkflow(undefined, { ncrRepo });
  const id1 = wf.createCAPA(baseInput({ sourceId: 'NCR-1' }));
  const id2 = wf.createCAPA(baseInput({
    sourceId: 'NCR-2',
    description_he: 'פגם אחר לגמרי במסגרת XX',
    description_en: 'A very different kind of thing entirely',
  }));
  const rel = wf.relatedCAPAs(id1);
  const found = rel.find((r) => r.capaId === id2);
  assert.ok(found);
  assert.ok(found.reasons.includes('same-product'));
});

test('44. relatedCAPAs returns empty for unknown capa', () => {
  const { wf } = makeClockedWorkflow();
  assert.deepEqual(wf.relatedCAPAs('nope'), []);
});

// ─────────────────────────────────────────────────────────────────
// Dashboards — openCAPAs / overdueCAPAs
// ─────────────────────────────────────────────────────────────────

test('45. openCAPAs lists all non-closed CAPAs', () => {
  const { wf } = makeClockedWorkflow();
  wf.createCAPA(baseInput());
  wf.createCAPA(baseInput());
  wf.createCAPA(baseInput());
  const open = wf.openCAPAs();
  assert.equal(open.length, 3);
});

test('46. openCAPAs filters by owner', () => {
  const { wf } = makeClockedWorkflow();
  wf.createCAPA(baseInput({ owner: 'alice' }));
  wf.createCAPA(baseInput({ owner: 'bob' }));
  wf.createCAPA(baseInput({ owner: 'alice' }));
  const alice = wf.openCAPAs('alice');
  const bob = wf.openCAPAs('bob');
  assert.equal(alice.length, 2);
  assert.equal(bob.length, 1);
});

test('47. overdueCAPAs returns items past stage SLA', () => {
  const { wf, advanceDays } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput({ severity: SEVERITIES.MINOR }));
  advanceDays(5);
  const overdue = wf.overdueCAPAs();
  assert.ok(overdue.length >= 1);
  assert.equal(overdue[0].id, id);
  assert.ok(overdue[0].overdueDays > 0);
});

test('48. overdueCAPAs excludes closed and archived CAPAs', () => {
  const { wf, advanceDays } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  advanceDays(200);
  wf.archiveCAPA(id, 'superseded');
  const overdue = wf.overdueCAPAs();
  assert.equal(overdue.filter((c) => c.id === id).length, 0);
});

// ─────────────────────────────────────────────────────────────────
// generate8DReport — bilingual structure
// ─────────────────────────────────────────────────────────────────

test('49. generate8DReport returns bilingual report with 8 sections', () => {
  const { wf } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  const report = wf.generate8DReport(id);
  assert.equal(report.sections.length, 8);
  assert.ok(report.meta.title.he);
  assert.ok(report.meta.title.en);
  assert.ok(report.problem.he);
  assert.ok(report.problem.en);
  assert.equal(report.meta.isoReference.code, '10.2');
});

test('50. generate8DReport reflects stage state (PENDING/COMPLETED/IN_PROGRESS)', () => {
  const { wf } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  wf.advanceStage(id, STAGES.D2_PROBLEM, { notes: 'defined' });
  const r = wf.generate8DReport(id);
  const d1 = r.sections.find((s) => s.stage === STAGES.D1_TEAM);
  const d2 = r.sections.find((s) => s.stage === STAGES.D2_PROBLEM);
  const d3 = r.sections.find((s) => s.stage === STAGES.D3_CONTAINMENT);
  assert.equal(d1.state, 'COMPLETED');
  assert.equal(d2.state, 'IN_PROGRESS');
  assert.equal(d3.state, 'PENDING');
});

test('51. generate8DReport includes ncrSnapshot when available', () => {
  const ncrRepo = {
    findNcrById(id) {
      return { id, product: 'P-9', supplier: 'S-1', severity: 'MAJOR' };
    },
  };
  const { wf } = makeClockedWorkflow(undefined, { ncrRepo });
  const id = wf.createCAPA(baseInput({ sourceId: 'NCR-001' }));
  const r = wf.generate8DReport(id);
  assert.ok(r.meta.ncrSnapshot);
  assert.equal(r.meta.ncrSnapshot.product, 'P-9');
});

// ─────────────────────────────────────────────────────────────────
// Metrics rollup
// ─────────────────────────────────────────────────────────────────

test('52. metrics returns totals and breakdowns', () => {
  const { wf } = makeClockedWorkflow();
  wf.createCAPA(baseInput({ trigger: TRIGGERS.NCR }));
  wf.createCAPA(baseInput({ trigger: TRIGGERS.AUDIT, severity: SEVERITIES.MINOR }));
  wf.createCAPA(baseInput({ trigger: TRIGGERS.CUSTOMER_COMPLAINT, severity: SEVERITIES.CRITICAL }));
  const m = wf.metrics({ from: '2026-01-01', to: '2026-12-31' });
  assert.equal(m.total, 3);
  assert.equal(m.open, 3);
  assert.equal(m.closed, 0);
  assert.equal(m.byTrigger[TRIGGERS.NCR], 1);
  assert.equal(m.byTrigger[TRIGGERS.AUDIT], 1);
  assert.equal(m.bySeverity[SEVERITIES.CRITICAL], 1);
});

test('53. metrics.recurrenceRate counts same-source CAPAs', () => {
  const { wf } = makeClockedWorkflow();
  wf.createCAPA(baseInput({ sourceId: 'NCR-SAME' }));
  wf.createCAPA(baseInput({ sourceId: 'NCR-SAME' }));
  wf.createCAPA(baseInput({ sourceId: 'NCR-OTHER' }));
  const m = wf.metrics('all');
  // 2 unique sources, 1 recurrent → recurrenceRate = 0.5
  assert.equal(m.recurrenceRate, 0.5);
});

test('54. metrics time-to-containment is averaged across CAPAs', () => {
  const { wf, advanceDays } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  wf.advanceStage(id, STAGES.D2_PROBLEM, { notes: 'p' });
  advanceDays(2);
  wf.advanceStage(id, STAGES.D3_CONTAINMENT, { notes: 'c', containmentAction: 'quar' });
  const m = wf.metrics('all');
  assert.equal(typeof m.avgTimeToContainmentDays, 'number');
  assert.ok(m.avgTimeToContainmentDays >= 0);
});

test('55. metrics.effectivenessRate 1.0 when all closures effective', () => {
  const { wf, advanceDays } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  wf.advanceStage(id, STAGES.D2_PROBLEM, { notes: 'p' });
  wf.advanceStage(id, STAGES.D3_CONTAINMENT, { notes: 'c', containmentAction: 'q' });
  wf.advanceStage(id, STAGES.D4_ROOT_CAUSE, { notes: 'r', rootCause: 'PID' });
  wf.advanceStage(id, STAGES.D5_PERMANENT, { notes: 'p', permanentAction: 'recal' });
  wf.advanceStage(id, STAGES.D6_IMPLEMENT, { notes: 'i', implementedAt: '2026-01-05T00:00:00Z' });
  wf.advanceStage(id, STAGES.D7_PREVENT, { notes: 'prev', preventiveAction: 'audit' });
  advanceDays(40);
  wf.advanceStage(id, STAGES.D8_CLOSE, { notes: 'c', approvedBy: 'qm' });
  wf.effectivenessCheck(id, {
    daysAfter: 45, metric: 'defect_rate_pct',
    result: { baseline: 5, current: 1, target: 2 },
  });
  const m = wf.metrics('all');
  assert.equal(m.closed, 1);
  assert.equal(m.effectivenessRate, 1.0);
});

// ─────────────────────────────────────────────────────────────────
// Non-destructiveness — archive, never delete
// ─────────────────────────────────────────────────────────────────

test('56. archiveCAPA sets ARCHIVED status and never hard-deletes', () => {
  const { wf } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  wf.archiveCAPA(id, 'duplicate of CAPA-000099');
  const capa = wf.getCAPA(id);
  assert.equal(capa.status, STATUS.ARCHIVED);
  assert.ok(capa.archivedAt);
  // still retrievable
  assert.ok(wf.getCAPA(id));
});

test('57. archived CAPAs are excluded from openCAPAs()', () => {
  const { wf } = makeClockedWorkflow();
  const id1 = wf.createCAPA(baseInput());
  wf.createCAPA(baseInput());
  wf.archiveCAPA(id1, 'superseded');
  const open = wf.openCAPAs();
  assert.equal(open.length, 1);
});

test('58. advanceStage blocked on archived CAPAs (non-destructive)', () => {
  const { wf } = makeClockedWorkflow();
  const id = wf.createCAPA(baseInput());
  wf.archiveCAPA(id, 'test');
  assert.throws(
    () => wf.advanceStage(id, STAGES.D2_PROBLEM, { notes: 'p' }),
    /ARCHIVED|cannot advance/,
  );
});

test('59. count() returns total CAPAs including archived', () => {
  const { wf } = makeClockedWorkflow();
  const id1 = wf.createCAPA(baseInput());
  wf.createCAPA(baseInput());
  wf.createCAPA(baseInput());
  wf.archiveCAPA(id1, 'x');
  assert.equal(wf.count(), 3);
});

// ─────────────────────────────────────────────────────────────────
// End-to-end: NCR → CAPA → 8D → close
// ─────────────────────────────────────────────────────────────────

test('60. end-to-end NCR to closed CAPA with effectiveness verified', () => {
  const ncrRepo = {
    findNcrById(id) {
      return {
        id, product: 'WELD-FRAME-A',
        supplier: 'SUPP-7', severity: 'MAJOR',
      };
    },
  };
  const { wf, advanceDays } = makeClockedWorkflow('2026-01-01T00:00:00Z', { ncrRepo });
  const id = wf.createCAPA(baseInput({
    trigger: TRIGGERS.NCR, sourceId: 'NCR-E2E-001',
  }));

  advanceDays(1);
  wf.advanceStage(id, STAGES.D2_PROBLEM, { notes: 'defined' });
  advanceDays(1);
  wf.advanceStage(id, STAGES.D3_CONTAINMENT, {
    notes: 'quarantine', containmentAction: 'quarantine lot',
  });
  advanceDays(3);
  wf.advanceStage(id, STAGES.D4_ROOT_CAUSE, {
    notes: 'root', rootCause: 'welder PID drift',
  });
  advanceDays(3);
  wf.advanceStage(id, STAGES.D5_PERMANENT, {
    notes: 'plan', permanentAction: 'recalibrate + retrain',
  });
  advanceDays(5);
  wf.advanceStage(id, STAGES.D6_IMPLEMENT, {
    notes: 'impl', implementedAt: new Date().toISOString(),
  });
  advanceDays(2);
  wf.advanceStage(id, STAGES.D7_PREVENT, {
    notes: 'prev', preventiveAction: 'monthly audit',
  });
  advanceDays(40); // wait for effectiveness window
  wf.advanceStage(id, STAGES.D8_CLOSE, {
    notes: 'close', approvedBy: 'qm@techno-kol-uzi',
  });
  wf.effectivenessCheck(id, {
    daysAfter: 40, metric: 'defect_rate_pct',
    result: { baseline: 4.8, current: 0.3, target: 1.0 },
  });

  const capa = wf.getCAPA(id);
  assert.equal(capa.status, STATUS.CLOSED);
  assert.equal(capa.closureOutcome, 'EFFECTIVE');
  const report = wf.generate8DReport(id);
  assert.equal(report.meta.status, STATUS.CLOSED);
});
