/**
 * Unit tests — Property Inspection Engine
 * Agent Y-058 — Mega-ERP Techno-Kol Uzi (Kobi EL)
 *
 * Run: node --test onyx-procurement/test/realestate/inspection.test.js
 *
 * House rule: לא מוחקים — רק משדרגים ומגדלים.
 * Zero external deps.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PropertyInspection,
  INSPECTION_TYPES,
  CATEGORIES,
  SEVERITIES,
  WARRANTY_PERIODS,
} = require('../../src/realestate/inspection');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClock(initialIso) {
  let now = Date.parse(initialIso);
  const fn = () => now;
  fn.advance = (ms) => { now += ms; };
  fn.advanceHours = (h) => { now += h * 3_600_000; };
  fn.advanceDays = (d) => { now += d * 86_400_000; };
  fn.set = (iso) => { now = Date.parse(iso); };
  fn.nowIso = () => new Date(now).toISOString();
  return fn;
}

function buildHandoverChecklist(insp, id = 'CK-HANDOVER-V1') {
  return insp.defineChecklist({
    id,
    type: 'handover',
    items: [
      { itemId: 'STR-001', category: 'מבנה',      label_he: 'סדק קונסטרוקטיבי בקיר נושא', label_en: 'Structural crack in load-bearing wall', severity: 'critical' },
      { itemId: 'STR-002', category: 'מבנה',      label_he: 'אדן חלון מתפורר',            label_en: 'Crumbling window sill',                  severity: 'major'    },
      { itemId: 'PLB-001', category: 'אינסטלציה', label_he: 'נזילה מצנרת מים חמים',        label_en: 'Hot-water pipe leak',                    severity: 'major'    },
      { itemId: 'ELE-001', category: 'חשמל',      label_he: 'הארקה תקינה לוח חשמל',        label_en: 'Panel grounding OK',                     severity: 'critical' },
      { itemId: 'FIN-001', category: 'גימור',     label_he: 'שריטה בריצוף סלון',           label_en: 'Scratch in living-room flooring',        severity: 'cosmetic' },
      { itemId: 'SAF-001', category: 'בטיחות',    label_he: 'מעקה מרפסת תקני',             label_en: 'Balcony railing to standard',            severity: 'critical' },
      { itemId: 'GAS-001', category: 'אזעקה/גז',  label_he: 'גלאי גז פעיל',                label_en: 'Gas detector operational',               severity: 'critical' },
      { itemId: 'DMP-001', category: 'רטיבות',    label_he: 'כתם רטיבות בתקרת חדר אמבטיה', label_en: 'Damp stain on bathroom ceiling',         severity: 'major'    },
    ],
  });
}

function buildMoveInChecklist(insp, id = 'CK-MOVEIN-V1') {
  return insp.defineChecklist({
    id,
    type: 'move-in',
    items: [
      { itemId: 'WALL-LIV',  category: 'גימור',     label_he: 'קיר סלון',     label_en: 'Living room wall',  severity: 'cosmetic' },
      { itemId: 'FLOOR-LIV', category: 'גימור',     label_he: 'ריצוף סלון',   label_en: 'Living room floor', severity: 'minor'    },
      { itemId: 'KITCH-SINK',category: 'אינסטלציה', label_he: 'כיור מטבח',    label_en: 'Kitchen sink',      severity: 'major'    },
      { itemId: 'BATH-MOLD', category: 'רטיבות',    label_he: 'אמבטיה עובש',  label_en: 'Bathroom mold',     severity: 'major'    },
      { itemId: 'FRONT-DOOR',category: 'בטיחות',    label_he: 'דלת כניסה',    label_en: 'Front door',        severity: 'major'    },
    ],
  });
}

// ---------------------------------------------------------------------------
// 1. CONSTANTS sanity
// ---------------------------------------------------------------------------

test('CONSTANTS — six inspection types and seven categories defined', () => {
  for (const t of ['pre-purchase', 'move-in', 'move-out', 'annual-safety', 'pre-renewal', 'handover']) {
    assert.ok(INSPECTION_TYPES.includes(t), `missing type ${t}`);
  }
  assert.equal(INSPECTION_TYPES.length, 6);
  for (const c of ['מבנה', 'אינסטלציה', 'חשמל', 'גימור', 'בטיחות', 'אזעקה/גז', 'רטיבות']) {
    assert.ok(CATEGORIES.includes(c), `missing category ${c}`);
  }
  assert.equal(SEVERITIES.cosmetic, 1);
  assert.equal(SEVERITIES.minor, 2);
  assert.equal(SEVERITIES.major, 3);
  assert.equal(SEVERITIES.critical, 4);
});

// ---------------------------------------------------------------------------
// 2. defineChecklist — bilingual + categories + severities
// ---------------------------------------------------------------------------

test('defineChecklist — bilingual items, categories validated, version bumps', () => {
  const clock = makeClock('2026-04-11T08:00:00Z');
  const insp = new PropertyInspection({ clock });
  const ck = buildHandoverChecklist(insp);
  assert.equal(ck.itemCount, 8);
  assert.equal(ck.type, 'handover');
  assert.equal(ck.version, 1);
  for (const it of ck.items) {
    assert.ok(it.label_he && it.label_en, 'bilingual labels required');
    assert.ok(CATEGORIES.includes(it.category));
    assert.ok(SEVERITIES[it.severity]);
  }

  // Re-defining same id bumps version (append-style upgrade — not delete)
  const ck2 = buildHandoverChecklist(insp);
  assert.equal(ck2.version, 2);

  // Bad inputs rejected
  assert.throws(() => insp.defineChecklist({ id: 'X', type: 'invalid', items: [] }), /invalid/);
  assert.throws(() => insp.defineChecklist({
    id: 'X', type: 'handover',
    items: [{ category: 'מבנה', label_he: 'a', label_en: 'b', severity: 'wat' }],
  }), /severity/);
});

// ---------------------------------------------------------------------------
// 3. scheduleInspection — type=pre-purchase
// ---------------------------------------------------------------------------

test('scheduleInspection — pre-purchase', () => {
  const clock = makeClock('2026-04-11T08:00:00Z');
  const insp = new PropertyInspection({ clock });
  const r = insp.scheduleInspection({
    propertyId: 'P-100', type: 'pre-purchase', inspectorId: 'INSP-01',
    date: '2026-04-12T10:00:00Z', reason: 'בדיקה לפני רכישה',
  });
  assert.equal(r.type, 'pre-purchase');
  assert.equal(r.type_he, 'בדיקה לפני רכישה');
  assert.match(r.inspectionNumber, /^INSP-2026-\d{5}$/);
  assert.equal(r.status, 'scheduled');
  assert.equal(r.history.length, 1);
});

// ---------------------------------------------------------------------------
// 4-5-6-7-8-9. all 6 inspection types schedule
// ---------------------------------------------------------------------------

test('scheduleInspection — move-in', () => {
  const insp = new PropertyInspection({ clock: makeClock('2026-04-11T08:00:00Z') });
  const r = insp.scheduleInspection({
    propertyId: 'P-200', type: 'move-in', inspectorId: 'INSP-02',
    date: '2026-04-15T09:00:00Z', leaseId: 'L-77', tenantId: 'T-9',
  });
  assert.equal(r.type, 'move-in');
  assert.equal(r.leaseId, 'L-77');
});

test('scheduleInspection — move-out', () => {
  const insp = new PropertyInspection({ clock: makeClock('2027-04-11T08:00:00Z') });
  const r = insp.scheduleInspection({
    propertyId: 'P-200', type: 'move-out', inspectorId: 'INSP-02',
    date: '2027-04-15T09:00:00Z', leaseId: 'L-77', tenantId: 'T-9',
  });
  assert.equal(r.type, 'move-out');
});

test('scheduleInspection — annual-safety', () => {
  const insp = new PropertyInspection({ clock: makeClock('2026-04-11T08:00:00Z') });
  const r = insp.scheduleInspection({
    propertyId: 'P-300', type: 'annual-safety', inspectorId: 'INSP-03',
    date: '2026-06-01T09:00:00Z', reason: 'שנתי',
  });
  assert.equal(r.type, 'annual-safety');
});

test('scheduleInspection — pre-renewal', () => {
  const insp = new PropertyInspection({ clock: makeClock('2026-04-11T08:00:00Z') });
  const r = insp.scheduleInspection({
    propertyId: 'P-400', type: 'pre-renewal', inspectorId: 'INSP-04',
    date: '2026-12-01T09:00:00Z', leaseId: 'L-12',
  });
  assert.equal(r.type, 'pre-renewal');
});

test('scheduleInspection — handover (חוק המכר)', () => {
  const insp = new PropertyInspection({ clock: makeClock('2026-04-11T08:00:00Z') });
  const r = insp.scheduleInspection({
    propertyId: 'P-500', type: 'handover', inspectorId: 'INSP-05',
    date: '2026-05-01T09:00:00Z', reason: 'מסירה לרוכש',
  });
  assert.equal(r.type, 'handover');
  assert.match(r.type_he, /חוק המכר/);
});

test('scheduleInspection — invalid type rejected', () => {
  const insp = new PropertyInspection({ clock: makeClock('2026-04-11T08:00:00Z') });
  assert.throws(() => insp.scheduleInspection({
    propertyId: 'P-1', type: 'bogus', inspectorId: 'X', date: '2026-01-01',
  }), /invalid inspection type/);
});

// ---------------------------------------------------------------------------
// 10. recordInspection — append-only
// ---------------------------------------------------------------------------

test('recordInspection — appends findings, never replaces', () => {
  const clock = makeClock('2026-04-11T08:00:00Z');
  const insp = new PropertyInspection({ clock });
  buildHandoverChecklist(insp);
  const sched = insp.scheduleInspection({
    propertyId: 'P-100', type: 'handover', inspectorId: 'INSP-01',
    date: '2026-04-12T09:00:00Z', checklistId: 'CK-HANDOVER-V1',
  });

  insp.recordInspection({
    inspectionId: sched.id,
    findings: [
      { itemId: 'STR-001', status: 'pass', severity: 'critical', notes: 'OK' },
      { itemId: 'STR-002', status: 'fail', severity: 'major', notes: 'אדן מתפורר', photos: ['/img/1.jpg'] },
    ],
  });
  // Append again — must NOT erase the first batch
  insp.recordInspection({
    inspectionId: sched.id,
    findings: [
      { itemId: 'PLB-001', status: 'fail', severity: 'major', notes: 'נזילה' },
    ],
  });
  const rec = insp.getInspection(sched.id);
  assert.equal(rec.findings.length, 3, 'findings are append-only');
  assert.equal(rec.findings[0].itemId, 'STR-001');
  assert.equal(rec.findings[2].itemId, 'PLB-001');
  // History contains 1 schedule + 2 record events
  const actions = rec.history.map((h) => h.action);
  assert.deepEqual(actions, ['scheduled', 'findings-recorded', 'findings-recorded']);
});

// ---------------------------------------------------------------------------
// 11. generateReport — bilingual
// ---------------------------------------------------------------------------

test('generateReport — bilingual HTML + text with severity summary', () => {
  const clock = makeClock('2026-04-11T08:00:00Z');
  const insp = new PropertyInspection({ clock });
  buildHandoverChecklist(insp);
  const sched = insp.scheduleInspection({
    propertyId: 'P-100', type: 'handover', inspectorId: 'INSP-01',
    date: '2026-04-12T09:00:00Z', checklistId: 'CK-HANDOVER-V1',
  });
  insp.recordInspection({
    inspectionId: sched.id,
    findings: [
      { itemId: 'STR-001', status: 'fail', severity: 'critical', notes: 'סדק קריטי', photos: ['/img/a.jpg'] },
      { itemId: 'PLB-001', status: 'fail', severity: 'major' },
      { itemId: 'FIN-001', status: 'fail', severity: 'cosmetic' },
    ],
  });

  const rep = insp.generateReport(sched.id);
  // HTML
  assert.ok(rep.html.includes('dir="rtl"'));
  assert.ok(rep.html.includes('דוח בדיקה'));
  assert.ok(rep.html.includes('Inspection report'));
  assert.ok(rep.html.includes('סיכום חומרה'));
  assert.ok(rep.html.includes('Severity summary'));
  assert.ok(rep.html.includes('/img/a.jpg'));
  // Text
  assert.ok(rep.text.includes('דוח בדיקה'));
  assert.ok(rep.text.includes('Inspection Report'));
  assert.ok(rep.text.includes('Critical'));
  assert.ok(rep.text.includes('קריטי'));
  // Summary
  assert.equal(rep.summary.critical, 1);
  assert.equal(rep.summary.major, 1);
  assert.equal(rep.summary.cosmetic, 1);
  assert.equal(rep.summary.total, 3);
  assert.equal(rep.findingsCount, 3);
});

// ---------------------------------------------------------------------------
// 12. createDefectList — extracts majors with warranty
// ---------------------------------------------------------------------------

test('createDefectList — extracts major+critical with 1y minimum warranty', () => {
  const clock = makeClock('2026-04-11T08:00:00Z');
  const insp = new PropertyInspection({ clock });
  buildHandoverChecklist(insp);
  const sched = insp.scheduleInspection({
    propertyId: 'P-100', type: 'handover', inspectorId: 'INSP-01',
    date: '2026-04-12T09:00:00Z', checklistId: 'CK-HANDOVER-V1',
  });
  insp.recordInspection({
    inspectionId: sched.id,
    findings: [
      { itemId: 'STR-001', status: 'fail', severity: 'critical', notes: 'סדק' },
      { itemId: 'STR-002', status: 'fail', severity: 'major' },
      { itemId: 'PLB-001', status: 'fail', severity: 'major' },
      { itemId: 'FIN-001', status: 'fail', severity: 'cosmetic' }, // not a major → excluded
      { itemId: 'DMP-001', status: 'fail', severity: 'major' },    // moisture → roof warranty 7y
      { itemId: 'SAF-001', status: 'pass', severity: 'critical' }, // pass → excluded
    ],
  });

  const list = insp.createDefectList(sched.id);
  assert.equal(list.defectCount, 4, 'majors+criticals only, pass excluded, cosmetic excluded');
  // Sorted critical first
  assert.equal(list.defects[0].severity, 'critical');
  // Structural defect → concreteFoundations warranty 4 years
  const struct = list.defects.find((d) => d.findingId.includes('-1') && d.category === 'מבנה');
  assert.ok(struct);
  assert.equal(struct.warrantyYears, 4);
  // Plumbing → 2 years
  const plb = list.defects.find((d) => d.category === 'אינסטלציה');
  assert.equal(plb.warrantyYears, 2);
  // Moisture → 7 years
  const dmp = list.defects.find((d) => d.category === 'רטיבות');
  assert.equal(dmp.warrantyYears, 7);
  // All defects must have ≥1 year (minimum)
  for (const d of list.defects) {
    assert.ok(d.warrantyYears >= 1, '1-year minimum');
    assert.ok(d.warrantyExpiresAt);
    assert.match(d.legalBasis_he, /חוק המכר/);
  }
});

// ---------------------------------------------------------------------------
// 13. trackRepairRequest — emits event linking to Y-049
// ---------------------------------------------------------------------------

test('trackRepairRequest — emits repair:requested for Y-049 maintenance', () => {
  const clock = makeClock('2026-04-11T08:00:00Z');
  const insp = new PropertyInspection({ clock });
  buildHandoverChecklist(insp);
  const sched = insp.scheduleInspection({
    propertyId: 'P-100', type: 'handover', inspectorId: 'INSP-01',
    date: '2026-04-12T09:00:00Z', checklistId: 'CK-HANDOVER-V1',
  });
  insp.recordInspection({
    inspectionId: sched.id,
    findings: [{ itemId: 'PLB-001', status: 'fail', severity: 'major', notes: 'נזילה' }],
  });
  const list = insp.createDefectList(sched.id);
  const defect = list.defects[0];

  const events = [];
  insp.on('repair:requested', (e) => events.push(e));

  const repair = insp.trackRepairRequest({
    defectId: defect.defectId,
    assignedTo: 'VND-AQUA',
    dueDate: '2026-05-01T09:00:00Z',
    notes: 'דחוף',
  });

  assert.match(repair.repairId, /^REP-/);
  assert.equal(repair.assignedTo, 'VND-AQUA');
  assert.equal(repair.status, 'requested');
  assert.equal(events.length, 1, 'repair:requested event must be emitted');
  assert.equal(events[0].defectId, defect.defectId);
  assert.equal(events[0].propertyId, 'P-100');
  assert.equal(events[0].assignedTo, 'VND-AQUA');

  // Defect must now be linked
  const updatedDef = insp.getDefect(defect.defectId);
  assert.equal(updatedDef.repairId, repair.repairId);
  assert.equal(updatedDef.status, 'repair-requested');
  // History on defect (append-only)
  assert.equal(updatedDef.history.length, 2);
});

// ---------------------------------------------------------------------------
// 14. compareInspections — move-in vs move-out
// ---------------------------------------------------------------------------

test('compareInspections — move-in vs move-out diff (חוק הגנת הדייר)', () => {
  const clock = makeClock('2026-04-11T08:00:00Z');
  const insp = new PropertyInspection({ clock });
  buildMoveInChecklist(insp);

  // Move-in
  const mi = insp.scheduleInspection({
    propertyId: 'P-200', type: 'move-in', inspectorId: 'INSP-02',
    date: '2026-04-12T09:00:00Z', leaseId: 'L-77', checklistId: 'CK-MOVEIN-V1',
  });
  insp.recordInspection({
    inspectionId: mi.id,
    findings: [
      { itemId: 'WALL-LIV',  status: 'pass', severity: 'cosmetic' },
      { itemId: 'FLOOR-LIV', status: 'noted', severity: 'cosmetic', notes: 'שריטה קיימת בכניסה' },
      { itemId: 'KITCH-SINK',status: 'pass', severity: 'minor' },
      { itemId: 'BATH-MOLD', status: 'noted', severity: 'minor', notes: 'כתם קטן' },
      { itemId: 'FRONT-DOOR',status: 'pass', severity: 'minor' },
    ],
  });

  // Move-out — a year later
  clock.advanceDays(365);
  const mo = insp.scheduleInspection({
    propertyId: 'P-200', type: 'move-out', inspectorId: 'INSP-02',
    date: clock.nowIso(), leaseId: 'L-77', checklistId: 'CK-MOVEIN-V1',
  });
  insp.recordInspection({
    inspectionId: mo.id,
    findings: [
      { itemId: 'WALL-LIV',  status: 'fail', severity: 'major',    notes: 'חור גדול בקיר' },        // worsened cosmetic→major
      { itemId: 'FLOOR-LIV', status: 'noted', severity: 'cosmetic', notes: 'אותה שריטה' },          // unchanged
      { itemId: 'KITCH-SINK',status: 'fail', severity: 'major',    notes: 'כיור שבור' },           // worsened minor→major
      { itemId: 'BATH-MOLD', status: 'noted', severity: 'minor' },                                  // unchanged
      { itemId: 'FRONT-DOOR',status: 'pass', severity: 'minor' },                                   // unchanged
      { itemId: 'NEW-DAMAGE',status: 'fail', severity: 'major', notes: 'דלת ארון נשברה' },        // added (no move-in record)
    ],
  });

  const diff = insp.compareInspections(mi.id, mo.id);
  assert.equal(diff.summary.added, 1, 'one brand-new failure');
  assert.equal(diff.summary.worsened, 2, 'wall + sink worsened');
  assert.equal(diff.summary.unchanged, 3);
  assert.equal(diff.summary.newDamageCount, 3,
    'new damages = added + worsened — used for deposit deduction');
  assert.match(diff.summary.basis_he, /חוק הגנת הדייר/);
});

// ---------------------------------------------------------------------------
// 15. computeDepositReturn — wear-and-tear excluded
// ---------------------------------------------------------------------------

test('computeDepositReturn — wear-and-tear excluded, legal cap applied', () => {
  const clock = makeClock('2026-04-11T08:00:00Z');
  const insp = new PropertyInspection({ clock });
  buildMoveInChecklist(insp);

  const mi = insp.scheduleInspection({
    propertyId: 'P-200', type: 'move-in', inspectorId: 'INSP-02',
    date: '2026-04-12T09:00:00Z', leaseId: 'L-77', tenantId: 'T-9',
    checklistId: 'CK-MOVEIN-V1',
  });
  insp.recordInspection({
    inspectionId: mi.id,
    findings: [
      { itemId: 'WALL-LIV', status: 'pass', severity: 'cosmetic' },
      { itemId: 'KITCH-SINK', status: 'pass', severity: 'minor' },
    ],
  });
  clock.advanceDays(365);
  const mo = insp.scheduleInspection({
    propertyId: 'P-200', type: 'move-out', inspectorId: 'INSP-02',
    date: clock.nowIso(), leaseId: 'L-77', tenantId: 'T-9',
    checklistId: 'CK-MOVEIN-V1',
  });
  insp.recordInspection({
    inspectionId: mo.id,
    findings: [
      { itemId: 'WALL-LIV', status: 'fail', severity: 'major', notes: 'חור' },
      { itemId: 'KITCH-SINK', status: 'fail', severity: 'major', notes: 'שבור' },
    ],
  });

  const out = insp.computeDepositReturn('T-9', 'L-77', {
    depositAmount: 15000,
    monthlyRent: 5000,
    leaseMonths: 12,
    cleaningCost: 500,
    repairCosts: [
      { findingId: 'F-WALL', amount: 800, wearAndTear: false },   // wall — eligible
      { findingId: 'F-SINK', amount: 1200, wearAndTear: false },  // sink — eligible
      { findingId: 'F-PAINT', amount: 2000, wearAndTear: true },  // routine paint — EXCLUDED (wear&tear)
    ],
  });

  // Eligible = 800 + 1200 = 2000 ; cleaning = 500 ; proposed = 2500
  assert.equal(out.eligibleRepairsTotal, 2000);
  assert.equal(out.excludedRepairsTotal, 2000);
  assert.equal(out.cleaningCost, 500);
  assert.equal(out.proposedDeduction, 2500);

  // Legal cap = min(deposit 15000, 3*rent 15000, leaseMonths*rent/3 = 12*5000/3 = 20000) = 15000
  assert.equal(out.legalCap, 15000);
  assert.equal(out.cappedDeduction, 2500); // proposed < cap
  assert.equal(out.refundToTenant, 12500);

  // Comparison should be attached
  assert.ok(out.comparison);
  assert.equal(out.comparison.summary.newDamageCount, 2);
});

test('computeDepositReturn — legal cap actually caps over-the-top deductions', () => {
  const clock = makeClock('2026-04-11T08:00:00Z');
  const insp = new PropertyInspection({ clock });
  const out = insp.computeDepositReturn('T-X', 'L-X', {
    depositAmount: 15000,
    monthlyRent: 5000,
    leaseMonths: 12,
    cleaningCost: 0,
    repairCosts: [
      { findingId: 'F-EXAGGERATED', amount: 50000, wearAndTear: false },
    ],
  });
  // Proposed=50,000 capped to legalCap=15,000 → refund=0
  assert.equal(out.proposedDeduction, 50000);
  assert.equal(out.legalCap, 15000);
  assert.equal(out.cappedDeduction, 15000);
  assert.equal(out.refundToTenant, 0);
});

// ---------------------------------------------------------------------------
// 16. warrantyPeriods — Israeli law table
// ---------------------------------------------------------------------------

test('warrantyPeriods — Israeli law (חוק המכר דירות) full table', () => {
  const insp = new PropertyInspection({ clock: makeClock('2026-04-11T08:00:00Z') });
  const w = insp.warrantyPeriods();
  assert.match(w.basis_he, /חוק המכר/);
  assert.equal(w.periods.general.years, 1);
  assert.equal(w.periods.plumbing.years, 2);
  assert.equal(w.periods.thermalInsulation.years, 3);
  assert.equal(w.periods.concreteFoundations.years, 4);
  assert.equal(w.periods.roofWaterproofing.years, 7);
  assert.equal(w.periods.flooring.years, 7);
  // asTable sorted ascending
  for (let i = 1; i < w.asTable.length; i += 1) {
    assert.ok(w.asTable[i - 1].years <= w.asTable[i].years);
  }
  // Module-level constant matches instance result
  assert.equal(WARRANTY_PERIODS.roofWaterproofing.years, 7);
});

// ---------------------------------------------------------------------------
// 17. defect severity ranking
// ---------------------------------------------------------------------------

test('defect severity ranking — critical first then major', () => {
  const clock = makeClock('2026-04-11T08:00:00Z');
  const insp = new PropertyInspection({ clock });
  buildHandoverChecklist(insp);
  const sched = insp.scheduleInspection({
    propertyId: 'P-700', type: 'handover', inspectorId: 'INSP-01',
    date: '2026-04-12T09:00:00Z', checklistId: 'CK-HANDOVER-V1',
  });
  insp.recordInspection({
    inspectionId: sched.id,
    findings: [
      { itemId: 'PLB-001', status: 'fail', severity: 'major' },
      { itemId: 'STR-001', status: 'fail', severity: 'critical' },
      { itemId: 'DMP-001', status: 'fail', severity: 'major' },
      { itemId: 'SAF-001', status: 'fail', severity: 'critical' },
    ],
  });
  const list = insp.createDefectList(sched.id);
  // First two MUST be critical
  assert.equal(list.defects[0].severity, 'critical');
  assert.equal(list.defects[1].severity, 'critical');
  assert.equal(list.defects[2].severity, 'major');
  assert.equal(list.defects[3].severity, 'major');
});

// ---------------------------------------------------------------------------
// 18. history — full property inspection history, never purged
// ---------------------------------------------------------------------------

test('history — full inspection history for property, never purged', () => {
  const clock = makeClock('2026-04-11T08:00:00Z');
  const insp = new PropertyInspection({ clock });

  insp.scheduleInspection({
    propertyId: 'P-900', type: 'pre-purchase', inspectorId: 'I-1',
    date: '2026-04-12T09:00:00Z',
  });
  clock.advanceDays(60);
  insp.scheduleInspection({
    propertyId: 'P-900', type: 'handover', inspectorId: 'I-2',
    date: clock.nowIso(),
  });
  clock.advanceDays(180);
  insp.scheduleInspection({
    propertyId: 'P-900', type: 'annual-safety', inspectorId: 'I-3',
    date: clock.nowIso(),
  });
  // A different property — must be excluded
  insp.scheduleInspection({
    propertyId: 'P-OTHER', type: 'handover', inspectorId: 'I-9',
    date: clock.nowIso(),
  });

  const h = insp.history('P-900');
  assert.equal(h.total, 3);
  // Most recent first
  assert.equal(h.inspections[0].type, 'annual-safety');
  assert.equal(h.inspections[1].type, 'handover');
  assert.equal(h.inspections[2].type, 'pre-purchase');
});

// ---------------------------------------------------------------------------
// 19. bilingual report sanity (extra coverage)
// ---------------------------------------------------------------------------

test('bilingual report — Hebrew RTL + English labels both present', () => {
  const clock = makeClock('2026-04-11T08:00:00Z');
  const insp = new PropertyInspection({ clock });
  buildHandoverChecklist(insp);
  const sched = insp.scheduleInspection({
    propertyId: 'P-BILING', type: 'handover', inspectorId: 'INSP-X',
    date: '2026-04-12T09:00:00Z', checklistId: 'CK-HANDOVER-V1',
  });
  insp.recordInspection({
    inspectionId: sched.id,
    findings: [
      { itemId: 'STR-001', status: 'fail', severity: 'critical' },
    ],
  });
  const rep = insp.generateReport(sched.id);
  // Hebrew terms
  assert.ok(rep.html.includes('דוח בדיקה'));
  assert.ok(rep.html.includes('סדק קונסטרוקטיבי בקיר נושא'));
  assert.ok(rep.html.includes('קריטי'));
  // English terms
  assert.ok(rep.html.includes('Inspection report'));
  assert.ok(rep.html.includes('Structural crack in load-bearing wall'));
  assert.ok(rep.html.includes('Critical'));
  // RTL
  assert.ok(rep.html.includes('dir="rtl"'));
});

// ---------------------------------------------------------------------------
// 20. Append-only / no-delete invariant
// ---------------------------------------------------------------------------

test('no-delete invariant — defects history append-only after repair', () => {
  const clock = makeClock('2026-04-11T08:00:00Z');
  const insp = new PropertyInspection({ clock });
  buildHandoverChecklist(insp);
  const sched = insp.scheduleInspection({
    propertyId: 'P-AUDIT', type: 'handover', inspectorId: 'INSP-01',
    date: '2026-04-12T09:00:00Z', checklistId: 'CK-HANDOVER-V1',
  });
  insp.recordInspection({
    inspectionId: sched.id,
    findings: [{ itemId: 'PLB-001', status: 'fail', severity: 'major' }],
  });
  const list = insp.createDefectList(sched.id);
  const def = list.defects[0];
  insp.trackRepairRequest({
    defectId: def.defectId, assignedTo: 'VND-A', dueDate: '2026-05-01T09:00:00Z',
  });

  const finalDef = insp.getDefect(def.defectId);
  // History never shrinks, only grows
  assert.ok(finalDef.history.length >= 2);
  // The original "defect-listed" entry must still be there
  assert.equal(finalDef.history[0].action, 'defect-listed');
  // No method exists to delete a defect — listDefects still finds it
  const all = insp.listDefects({ propertyId: 'P-AUDIT' });
  assert.equal(all.length, 1);
  assert.equal(all[0].defectId, def.defectId);
});
