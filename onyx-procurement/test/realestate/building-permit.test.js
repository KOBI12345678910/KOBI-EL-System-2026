/**
 * test/realestate/building-permit.test.js
 * ----------------------------------------------------------------
 * Tests for Israeli building-permit tracker (היתרי בנייה).
 *
 * Covers:
 *   • application creation + validation
 *   • stage progression (קליטה → סיום) incl. illegal transitions
 *   • document checklist per type
 *   • municipal fee calculation
 *   • committee hearings, objections, amendments
 *   • stage duration & stale-application alerts
 *   • TAMA 38/1 and 38/2 tracking
 *   • append-only audit trail ("never delete")
 *
 * Run:
 *   node --test test/realestate/building-permit.test.js
 *
 * Author: Agent Y-055 — Techno-Kol Uzi ERP
 * ----------------------------------------------------------------
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BuildingPermit,
  STAGES,
  APPLICATION_TYPE,
  COMMITTEE,
  TAMA_TYPE,
  MUNICIPAL_TARIFFS,
  TYPE_MULTIPLIER,
  FORWARD_ORDER,
} = require('../../src/realestate/building-permit.js');

// ─────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────

function fixtureNewConstruction(bp) {
  return bp.createApplication({
    propertyId: 'PROP-001',
    applicant:  { name: 'חברת טכנו-קול בע"מ', id: '514000000' },
    architect:  { name: 'שרה אדריכלית',       license: 'AR-12345' },
    engineer:   { name: 'יוסי מהנדס',         license: 'ENG-67890' },
    applicationType: APPLICATION_TYPE.NEW_CONSTRUCTION,
    description: 'בניין מגורים 8 קומות',
    sqmProposed: 1200,
    municipality: 'tel-aviv',
    committee: COMMITTEE.LOCAL,
    documents: [
      { key: 'plans' },
      { key: 'calc' },
    ],
  });
}

function fixtureTama38(bp) {
  return bp.createApplication({
    propertyId: 'PROP-002',
    applicant:  { name: 'נציגות הבית המשותף' },
    architect:  { name: 'דן אדריכל' },
    engineer:   { name: 'שמעון רעידות' },
    applicationType: APPLICATION_TYPE.TAMA_38,
    description: 'חיזוק מבנה ותוספת 2 קומות',
    sqmProposed: 850,
    municipality: 'jerusalem',
  });
}

// ─────────────────────────────────────────────────────────────────────
// createApplication
// ─────────────────────────────────────────────────────────────────────

test('createApplication: creates record at intake stage', () => {
  const bp = new BuildingPermit();
  const id = fixtureNewConstruction(bp);
  assert.ok(id.startsWith('permit_'));
  const rec = bp.getApplication(id);
  assert.equal(rec.currentStage, STAGES.INTAKE);
  assert.equal(rec.applicationType, APPLICATION_TYPE.NEW_CONSTRUCTION);
  assert.equal(rec.sqmProposed, 1200);
  assert.equal(rec.municipality, 'tel-aviv');
  assert.equal(rec.stageHistory.length, 1);
  assert.equal(rec.stageHistory[0].stage, STAGES.INTAKE);
  assert.equal(rec.labels.he.type, 'בנייה חדשה');
  assert.equal(rec.labels.en.stage, 'Intake');
});

test('createApplication: rejects missing required fields', () => {
  const bp = new BuildingPermit();
  assert.throws(() => bp.createApplication({}));
  assert.throws(() => bp.createApplication({ propertyId: 'P1' }));
  assert.throws(() => bp.createApplication({
    propertyId: 'P1',
    applicant: { name: 'A' },
    architect: { name: 'B' },
    engineer:  { name: 'C' },
    applicationType: 'unknown-type',
    description: 'x',
    sqmProposed: 10,
  }), /Invalid applicationType/);
});

test('createApplication: rejects zero or negative sqm', () => {
  const bp = new BuildingPermit();
  assert.throws(() => bp.createApplication({
    propertyId: 'P1',
    applicant: { name: 'A' },
    architect: { name: 'B' },
    engineer:  { name: 'C' },
    applicationType: APPLICATION_TYPE.RENOVATION,
    description: 'x',
    sqmProposed: 0,
  }), /sqmProposed/);
});

// ─────────────────────────────────────────────────────────────────────
// Stage progression
// ─────────────────────────────────────────────────────────────────────

test('stage progression: walks through the full Israeli pipeline', () => {
  const bp = new BuildingPermit();
  const id = fixtureNewConstruction(bp);

  const sequence = [
    STAGES.ENG_REVIEW,
    STAGES.LOCATING,
    STAGES.HEARING,
    STAGES.PERMIT,
    STAGES.OPEN,
    STAGES.COMPLETION,
  ];
  for (const s of sequence) {
    const r = bp.recordStatusChange(id, s, `advance to ${s}`);
    assert.equal(r.ok, true);
    assert.equal(r.to, s);
  }
  const rec = bp.getApplication(id);
  assert.equal(rec.currentStage, STAGES.COMPLETION);
  assert.equal(rec.stageHistory.length, 7); // intake + 6 transitions
});

test('stage progression: forward order matches Hebrew pipeline', () => {
  assert.deepEqual(FORWARD_ORDER, [
    STAGES.INTAKE,
    STAGES.ENG_REVIEW,
    STAGES.LOCATING,
    STAGES.HEARING,
    STAGES.PERMIT,
    STAGES.OPEN,
    STAGES.COMPLETION,
  ]);
});

test('stage progression: rejects skipping stages', () => {
  const bp = new BuildingPermit();
  const id = fixtureNewConstruction(bp);
  assert.throws(
    () => bp.recordStatusChange(id, STAGES.PERMIT),
    /illegal transition/
  );
});

test('stage progression: rejects reopening terminal stage', () => {
  const bp = new BuildingPermit();
  const id = fixtureNewConstruction(bp);
  // Fast-forward to rejected
  bp.recordStatusChange(id, STAGES.REJECTED, 'missing docs');
  assert.throws(
    () => bp.recordStatusChange(id, STAGES.ENG_REVIEW),
    /illegal transition/
  );
});

test('stage progression: on-hold and resume work', () => {
  const bp = new BuildingPermit();
  const id = fixtureNewConstruction(bp);
  bp.recordStatusChange(id, STAGES.ENG_REVIEW);
  bp.recordStatusChange(id, STAGES.ON_HOLD, 'waiting for architect');
  // Resume into locating is allowed
  const r = bp.recordStatusChange(id, STAGES.LOCATING);
  assert.equal(r.to, STAGES.LOCATING);
  const rec = bp.getApplication(id);
  // History preserved — nothing deleted
  assert.equal(rec.stageHistory.length, 4);
  assert.equal(rec.stageHistory[0].stage, STAGES.INTAKE);
  assert.equal(rec.stageHistory[1].stage, STAGES.ENG_REVIEW);
  assert.equal(rec.stageHistory[2].stage, STAGES.ON_HOLD);
  assert.equal(rec.stageHistory[3].stage, STAGES.LOCATING);
});

// ─────────────────────────────────────────────────────────────────────
// documentChecklist
// ─────────────────────────────────────────────────────────────────────

test('documentChecklist: new-construction includes shelter + parking', () => {
  const bp = new BuildingPermit();
  const cl = bp.documentChecklist(APPLICATION_TYPE.NEW_CONSTRUCTION);
  const required = cl.filter((d) => d.required).map((d) => d.key);
  assert.ok(required.includes('plans'));
  assert.ok(required.includes('calc'));
  assert.ok(required.includes('shelter'));
  assert.ok(required.includes('parking'));
  assert.ok(required.includes('fire'));
  assert.ok(required.includes('water'));
});

test('documentChecklist: TAMA-38 requires seismic-eng and tama-cert', () => {
  const bp = new BuildingPermit();
  const cl = bp.documentChecklist(APPLICATION_TYPE.TAMA_38);
  const required = cl.filter((d) => d.required).map((d) => d.key);
  assert.ok(required.includes('tama-cert'));
  assert.ok(required.includes('seismic-eng'));
});

test('documentChecklist: renovation has minimal requirements', () => {
  const bp = new BuildingPermit();
  const cl = bp.documentChecklist(APPLICATION_TYPE.RENOVATION);
  const required = cl.filter((d) => d.required).map((d) => d.key);
  assert.ok(!required.includes('shelter'));
  assert.ok(!required.includes('seismic-eng'));
  assert.ok(required.includes('plans'));
  assert.ok(required.includes('lawyer'));
});

test('documentChecklist: bilingual labels present', () => {
  const bp = new BuildingPermit();
  const cl = bp.documentChecklist(APPLICATION_TYPE.NEW_CONSTRUCTION);
  const plans = cl.find((d) => d.key === 'plans');
  assert.equal(plans.he, 'תוכניות אדריכליות');
  assert.equal(plans.en, 'Architectural Plans');
});

test('documentCompletion: computes missing vs provided', () => {
  const bp = new BuildingPermit();
  const id = fixtureNewConstruction(bp);
  const comp = bp.documentCompletion(id);
  assert.ok(comp.missing.length > 0);
  assert.ok(comp.provided.includes('plans'));
  assert.ok(comp.provided.includes('calc'));
  assert.ok(comp.completionPct < 100);
});

// ─────────────────────────────────────────────────────────────────────
// permitFees
// ─────────────────────────────────────────────────────────────────────

test('permitFees: tel-aviv new-construction 1200 m²', () => {
  const bp = new BuildingPermit();
  const fees = bp.permitFees({
    type: APPLICATION_TYPE.NEW_CONSTRUCTION,
    sqm: 1200,
    municipality: 'tel-aviv',
  });
  assert.equal(fees.currency, 'ILS');
  // perSqm=72, mult=1.00, base=86400
  // infra=8640, archive=450, total=95490
  assert.equal(fees.breakdown.base, 86400);
  assert.equal(fees.breakdown.infrastructure, 8640);
  assert.equal(fees.breakdown.archive, 450);
  assert.equal(fees.total, 95490);
  assert.equal(fees.breakdown.minFloorApplied, false);
});

test('permitFees: renovation applies 0.40 multiplier', () => {
  const bp = new BuildingPermit();
  const fees = bp.permitFees({
    type: APPLICATION_TYPE.RENOVATION,
    sqm: 100,
    municipality: 'haifa',
  });
  // perSqm=54, mult=0.40, base=2160
  // infra=216, archive=450, rawTotal=2826
  // minFee=1800, so total=2826
  assert.equal(fees.breakdown.base, 2160);
  assert.equal(fees.total, 2826);
});

test('permitFees: tiny sqm gets floored to minFee', () => {
  const bp = new BuildingPermit();
  const fees = bp.permitFees({
    type: APPLICATION_TYPE.RENOVATION,
    sqm: 5,
    municipality: 'tel-aviv',
  });
  // base ≈ 72*5*0.4 = 144, infra=14, archive=450, raw=608
  // minFee=2400, so total=2400
  assert.equal(fees.total, 2400);
  assert.equal(fees.breakdown.minFloorApplied, true);
});

test('permitFees: TAMA-38 gets 0.5 multiplier (incentive)', () => {
  const bp = new BuildingPermit();
  const fees = bp.permitFees({
    type: APPLICATION_TYPE.TAMA_38,
    sqm: 1000,
    municipality: 'tel-aviv',
  });
  assert.equal(fees.breakdown.base, 72 * 1000 * 0.5);
});

test('permitFees: unknown municipality falls back to default', () => {
  const bp = new BuildingPermit();
  const fees = bp.permitFees({
    type: APPLICATION_TYPE.NEW_CONSTRUCTION,
    sqm: 100,
    municipality: 'nowhere-ville',
  });
  assert.equal(fees.tariff.key, 'default');
  assert.equal(fees.tariff.perSqm, MUNICIPAL_TARIFFS.default.perSqm);
});

test('permitFees: rejects bad inputs', () => {
  const bp = new BuildingPermit();
  assert.throws(() => bp.permitFees({}));
  assert.throws(() => bp.permitFees({ type: 'x', sqm: 100 }), /Invalid applicationType/);
  assert.throws(() => bp.permitFees({
    type: APPLICATION_TYPE.NEW_CONSTRUCTION,
    sqm: -1,
  }), /sqm must be/);
});

// ─────────────────────────────────────────────────────────────────────
// committeeHearings
// ─────────────────────────────────────────────────────────────────────

test('committeeHearings: schedule + recordResult', () => {
  const bp = new BuildingPermit();
  const id = fixtureNewConstruction(bp);
  const hearings = bp.committeeHearings(id);
  const hid = hearings.schedule({
    committee: COMMITTEE.LOCAL,
    date: '2026-05-10',
    agenda: 'דיון ראשון',
  });
  assert.ok(hid.startsWith('hearing_'));
  assert.equal(hearings.list().length, 1);
  assert.ok(hearings.next());
  hearings.recordResult(hid, 'conditional', 'pending shelter plan');
  const h = hearings.list()[0];
  assert.equal(h.result, 'conditional');
  assert.equal(h.committeeLabel.he, 'ועדה מקומית');
  assert.equal(hearings.next(), null);
});

test('committeeHearings: rejects invalid committee / result', () => {
  const bp = new BuildingPermit();
  const id = fixtureNewConstruction(bp);
  const h = bp.committeeHearings(id);
  assert.throws(() => h.schedule({ committee: 'bogus', date: '2026-05-01' }));
  const hid = h.schedule({ committee: COMMITTEE.DISTRICT, date: '2026-06-01' });
  assert.throws(() => h.recordResult(hid, 'maybe'));
});

// ─────────────────────────────────────────────────────────────────────
// objections
// ─────────────────────────────────────────────────────────────────────

test('objections: file + resolve + countOpen', () => {
  const bp = new BuildingPermit();
  const id = fixtureNewConstruction(bp);
  const obj = bp.objections(id);
  const oid = obj.file({
    objector: { name: 'שכן מדירה 3' },
    grounds: 'חסימת אור',
  });
  assert.equal(obj.countOpen(), 1);
  obj.resolve(oid, 'dismissed', 'no standing');
  assert.equal(obj.countOpen(), 0);
  assert.equal(obj.list()[0].status, 'dismissed');
});

test('objections: rejects bad inputs', () => {
  const bp = new BuildingPermit();
  const id = fixtureNewConstruction(bp);
  const obj = bp.objections(id);
  assert.throws(() => obj.file({}));
  assert.throws(() => obj.file({ objector: { name: 'X' } }));
  const oid = obj.file({ objector: { name: 'X' }, grounds: 'y' });
  assert.throws(() => obj.resolve(oid, 'bogus'));
});

// ─────────────────────────────────────────────────────────────────────
// amendments
// ─────────────────────────────────────────────────────────────────────

test('amendments: propose + approve updates sqm', () => {
  const bp = new BuildingPermit();
  const id = fixtureNewConstruction(bp);
  const am = bp.amendments(id);
  const aid = am.propose({
    description: 'הוספת מרפסת',
    sqmDelta: 25,
    reason: 'שינוי מזמין',
  });
  const before = bp.getApplication(id).sqmProposed;
  am.approve(aid, 'architect-sarah');
  const after = bp.getApplication(id).sqmProposed;
  assert.equal(after - before, 25);
  assert.equal(am.list()[0].status, 'approved');
});

test('amendments: reject does not touch sqm', () => {
  const bp = new BuildingPermit();
  const id = fixtureNewConstruction(bp);
  const am = bp.amendments(id);
  const aid = am.propose({ description: 'x', sqmDelta: 50, reason: 'r' });
  const before = bp.getApplication(id).sqmProposed;
  am.reject(aid, 'exceeds zoning');
  assert.equal(bp.getApplication(id).sqmProposed, before);
  assert.equal(am.list()[0].status, 'rejected');
});

test('amendments: cannot double-decide', () => {
  const bp = new BuildingPermit();
  const id = fixtureNewConstruction(bp);
  const am = bp.amendments(id);
  const aid = am.propose({ description: 'x', reason: 'r' });
  am.approve(aid);
  assert.throws(() => am.approve(aid), /already/);
  assert.throws(() => am.reject(aid, 'no'), /already/);
});

// ─────────────────────────────────────────────────────────────────────
// daysInStage + alertStaleApplication
// ─────────────────────────────────────────────────────────────────────

test('daysInStage: returns days since last transition', () => {
  const bp = new BuildingPermit();
  const id = fixtureNewConstruction(bp);
  const info = bp.daysInStage(id);
  assert.equal(info.currentStage, STAGES.INTAKE);
  assert.ok(info.days >= 0);
  assert.ok(info.history.length >= 1);
});

test('alertStaleApplication: fresh permit is not stale', () => {
  const bp = new BuildingPermit();
  const id = fixtureNewConstruction(bp);
  const alert = bp.alertStaleApplication(id);
  assert.equal(alert.stale, false);
  assert.equal(alert.reason, 'within-sla');
});

test('alertStaleApplication: terminal stage is not stale', () => {
  const bp = new BuildingPermit();
  const id = fixtureNewConstruction(bp);
  bp.recordStatusChange(id, STAGES.REJECTED, 'rejected');
  const alert = bp.alertStaleApplication(id);
  assert.equal(alert.stale, false);
  assert.equal(alert.reason, 'terminal-stage');
});

test('alertStaleApplication: manipulated old history triggers stale', () => {
  const bp = new BuildingPermit();
  const id = fixtureNewConstruction(bp);
  // Simulate an old application by back-dating the intake entry
  // via the append-only store (legit sub-case: seed / import).
  const permit = bp._store.get(id);
  const oldDate = new Date(Date.now() - 100 * 24 * 3600 * 1000).toISOString();
  permit.stageHistory[0].at = oldDate;
  permit.updatedAt = oldDate;
  bp._store.set(id, permit);
  const alert = bp.alertStaleApplication(id);
  assert.equal(alert.stale, true, 'should be stale after 100 days in INTAKE');
  assert.ok(alert.days >= 99);
});

// ─────────────────────────────────────────────────────────────────────
// TAMA 38 tracking
// ─────────────────────────────────────────────────────────────────────

test('tamaTracker: register TAMA 38/1 and record milestones', () => {
  const bp = new BuildingPermit();
  const id = fixtureTama38(bp);
  const tama = bp.tamaTracker('PROP-002');
  const rec = tama.register({
    permitId: id,
    tamaType: TAMA_TYPE.TAMA_38_1,
    unitsBefore: 8,
    unitsAfter: 12,
  });
  assert.equal(rec.tamaType, TAMA_TYPE.TAMA_38_1);
  assert.equal(rec.unitsBefore, 8);
  assert.equal(rec.unitsAfter, 12);
  assert.equal(rec.label.he.startsWith('תמ"א 38/1'), true);

  tama.recordMilestone(id, 'seismic-assessment', '2026-03-01');
  tama.recordMilestone(id, 'resident-agreement', '2026-03-15');
  tama.recordMilestone(id, 'committee-approval', '2026-04-01');
  tama.recordMilestone(id, 'strengthening',      '2026-04-05');

  const got = tama.get(id);
  assert.equal(got.milestones.length, 4);
  assert.equal(got.milestones[3].milestone, 'strengthening');
});

test('tamaTracker: 38/2 allows demolition but not strengthening', () => {
  const bp = new BuildingPermit();
  const id = fixtureTama38(bp);
  const tama = bp.tamaTracker('PROP-002');
  tama.register({
    permitId: id,
    tamaType: TAMA_TYPE.TAMA_38_2,
    unitsBefore: 6,
    unitsAfter: 18,
  });
  tama.recordMilestone(id, 'demolition', '2026-05-01');
  assert.throws(
    () => tama.recordMilestone(id, 'strengthening'),
    /TAMA 38\/1/
  );
});

test('tamaTracker: 38/1 forbids demolition milestone', () => {
  const bp = new BuildingPermit();
  const id = fixtureTama38(bp);
  const tama = bp.tamaTracker('PROP-002');
  tama.register({ permitId: id, tamaType: TAMA_TYPE.TAMA_38_1 });
  assert.throws(
    () => tama.recordMilestone(id, 'demolition'),
    /TAMA 38\/2/
  );
});

test('tamaTracker: rejects non-TAMA permits', () => {
  const bp = new BuildingPermit();
  const id = fixtureNewConstruction(bp);
  const tama = bp.tamaTracker('PROP-001');
  assert.throws(
    () => tama.register({ permitId: id, tamaType: TAMA_TYPE.TAMA_38_1 }),
    /permit type must be/
  );
});

test('tamaTracker: list filters by property', () => {
  const bp = new BuildingPermit();
  const id = fixtureTama38(bp);
  const tama = bp.tamaTracker('PROP-002');
  tama.register({ permitId: id, tamaType: TAMA_TYPE.TAMA_38_1 });
  const list = tama.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].permitId, id);
  assert.equal(list[0].tama.tamaType, TAMA_TYPE.TAMA_38_1);
});

// ─────────────────────────────────────────────────────────────────────
// Audit trail / immutability
// ─────────────────────────────────────────────────────────────────────

test('audit trail: every mutation is recorded', () => {
  const bp = new BuildingPermit();
  const id = fixtureNewConstruction(bp);
  bp.recordStatusChange(id, STAGES.ENG_REVIEW);
  bp.committeeHearings(id).schedule({
    committee: COMMITTEE.LOCAL,
    date: '2026-05-10',
  });
  bp.objections(id).file({ objector: { name: 'X' }, grounds: 'y' });
  const trail = bp.getAuditTrail();
  const actions = trail.map((e) => e.action);
  assert.ok(actions.includes('createApplication'));
  assert.ok(actions.includes('recordStatusChange'));
  assert.ok(actions.includes('hearing.schedule'));
  assert.ok(actions.includes('objection.file'));
});

test('listApplications: filters by property + type + stage', () => {
  const bp = new BuildingPermit();
  const id1 = fixtureNewConstruction(bp);
  fixtureTama38(bp);
  const byProp = bp.listApplications({ propertyId: 'PROP-001' });
  assert.equal(byProp.length, 1);
  assert.equal(byProp[0].id, id1);

  const byType = bp.listApplications({ applicationType: APPLICATION_TYPE.TAMA_38 });
  assert.equal(byType.length, 1);

  const byStage = bp.listApplications({ currentStage: STAGES.INTAKE });
  assert.equal(byStage.length, 2);
});

test('TYPE_MULTIPLIER: all types are defined', () => {
  for (const t of Object.values(APPLICATION_TYPE)) {
    assert.ok(
      typeof TYPE_MULTIPLIER[t] === 'number',
      `multiplier missing for ${t}`
    );
  }
});
