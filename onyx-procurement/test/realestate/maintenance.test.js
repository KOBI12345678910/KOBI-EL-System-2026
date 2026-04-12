/**
 * Unit tests — Property Maintenance Requests
 * Agent Y-049 — Mega-ERP Techno-Kol Uzi (Kobi EL)
 *
 * Run: node --test onyx-procurement/test/realestate/maintenance.test.js
 *
 * House rule: לא מוחקים — רק משדרגים ומגדלים.
 * Zero external deps.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MaintenanceRequests,
  CATEGORIES,
  PRIORITIES,
  SLA_HOURS,
  STATUS,
  DEFAULT_SPLIT_BY_CATEGORY,
} = require('../../src/realestate/maintenance');

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

function baseTenant() {
  return { name: 'משפחת כהן', phone: '050-1234567', email: 'cohen@example.co.il' };
}

// ---------------------------------------------------------------------------
// Constants sanity
// ---------------------------------------------------------------------------

test('CONSTANTS — categories and priorities cover required set', () => {
  for (const c of ['plumbing', 'electrical', 'hvac', 'structural',
    'appliance', 'pest', 'common-area', 'other']) {
    assert.ok(CATEGORIES.includes(c), `missing category ${c}`);
  }
  assert.deepEqual([...PRIORITIES].sort(),
    ['emergency', 'low', 'normal', 'urgent'].sort());
  assert.equal(SLA_HOURS.emergency, 4);
  assert.equal(SLA_HOURS.urgent, 24);
  assert.equal(SLA_HOURS.normal, 72);
  assert.equal(SLA_HOURS.low, 168);
});

test('DEFAULT_SPLIT_BY_CATEGORY — each split sums to 100', () => {
  for (const [cat, split] of Object.entries(DEFAULT_SPLIT_BY_CATEGORY)) {
    assert.equal(split.landlord + split.tenant, 100,
      `${cat} split does not sum to 100`);
  }
  assert.equal(DEFAULT_SPLIT_BY_CATEGORY.structural.landlord, 100,
    'structural defects are landlord-only under Israeli tenancy law');
  assert.equal(DEFAULT_SPLIT_BY_CATEGORY['common-area'].landlord, 100,
    'common area is landlord-only');
});

// ---------------------------------------------------------------------------
// createRequest
// ---------------------------------------------------------------------------

test('createRequest — validates inputs & assigns SLA due', () => {
  const clock = makeClock('2026-04-11T08:00:00Z');
  const m = new MaintenanceRequests({ clock });

  assert.throws(() => m.createRequest({}), /propertyId/);
  assert.throws(() => m.createRequest({
    propertyId: 'P1', unit: 'A-1', tenant: baseTenant(),
    category: 'bogus', description_he: 'xxx', priority: 'urgent',
  }), /category/);

  const req = m.createRequest({
    propertyId: 'P-100',
    unit: 'A-12',
    tenant: baseTenant(),
    category: 'plumbing',
    description_he: 'נזילה מתחת לכיור במטבח',
    priority: 'urgent',
    photos: ['/uploads/1.jpg'],
    reportedAt: '2026-04-11T08:00:00Z',
  });

  assert.match(req.id, /^MR-/);
  assert.match(req.workOrderNumber, /^WO-2026-\d{5}$/);
  assert.equal(req.status, STATUS.OPEN);
  assert.equal(req.priority, 'urgent');
  // Due 24h after report
  assert.equal(req.slaDueAt, new Date('2026-04-12T08:00:00Z').toISOString());
  assert.equal(req.slaBreachedAt, null);
  assert.equal(req.history.length, 1);
  assert.equal(req.history[0].action, 'created');
});

// ---------------------------------------------------------------------------
// assignVendor + scheduleVisit + recordCompletion lifecycle
// ---------------------------------------------------------------------------

test('lifecycle — assignVendor → scheduleVisit → recordCompletion', () => {
  const clock = makeClock('2026-04-11T08:00:00Z');
  const catalog = {
    hasSupplier(id) { return ['VND-AQUA', 'VND-ELEC'].includes(id); },
  };
  const m = new MaintenanceRequests({ clock, vendorCatalog: catalog });

  const r = m.createRequest({
    propertyId: 'P-100', unit: 'A-12', tenant: baseTenant(),
    category: 'plumbing', description_he: 'נזילה בכיור',
    priority: 'urgent', reportedAt: clock.nowIso(),
  });

  // unknown vendor should be rejected
  assert.throws(() => m.assignVendor(r.id, 'VND-GHOST', 500), /not in supplier catalog/);

  clock.advanceHours(1);
  const r1 = m.assignVendor(r.id, 'VND-AQUA', 450);
  assert.equal(r1.vendorId, 'VND-AQUA');
  assert.equal(r1.estimatedCost, 450);
  assert.equal(r1.status, STATUS.ASSIGNED);

  clock.advanceHours(2);
  const r2 = m.scheduleVisit(r.id, '2026-04-11T14:00:00Z', 'להביא מפתח מיוחד');
  assert.equal(r2.status, STATUS.SCHEDULED);
  assert.equal(r2.scheduledAt, new Date('2026-04-11T14:00:00Z').toISOString());

  clock.advanceHours(5);
  const r3 = m.recordCompletion(r.id, {
    workPerformed: 'הוחלפה מפרקת שכונה + סיליקון חדש',
    partsUsed: [{ name: 'מפרקת פליז 1/2"', qty: 1, cost: 120 }],
    laborHours: 1.5,
    totalCost: 520,
    tenantSignature: 'כהן י.',
  });

  assert.equal(r3.status, STATUS.COMPLETED);
  assert.equal(r3.completion.totalCost, 520);
  assert.equal(r3.completion.laborHours, 1.5);
  assert.equal(r3.completion.partsUsed.length, 1);
  // Completed within 24h SLA — no breach
  assert.equal(r3.slaBreachedAt, null);

  // History must be monotonically growing (no deletes)
  const actions = r3.history.map((h) => h.action);
  assert.deepEqual(actions,
    ['created', 'vendor-assigned', 'visit-scheduled', 'completed']);
});

// ---------------------------------------------------------------------------
// SLA breach detection
// ---------------------------------------------------------------------------

test('slaTracker — detects live breach and flags on request', () => {
  const clock = makeClock('2026-04-11T08:00:00Z');
  const m = new MaintenanceRequests({ clock });

  const emergency = m.createRequest({
    propertyId: 'P-200', unit: 'B-3', tenant: baseTenant(),
    category: 'electrical', description_he: 'נפילת חשמל בכל הדירה',
    priority: 'emergency', reportedAt: clock.nowIso(),
  });
  const urgent = m.createRequest({
    propertyId: 'P-200', unit: 'B-4', tenant: baseTenant(),
    category: 'hvac', description_he: 'מיזוג לא עובד',
    priority: 'urgent', reportedAt: clock.nowIso(),
  });
  const normal = m.createRequest({
    propertyId: 'P-200', unit: 'B-5', tenant: baseTenant(),
    category: 'appliance', description_he: 'תנור לא מחמם',
    priority: 'normal', reportedAt: clock.nowIso(),
  });

  // 5 hours pass — only emergency (4h) should breach
  clock.advanceHours(5);
  const snap = m.slaTracker();
  const findById = (id) => snap.find((s) => s.id === id);

  assert.equal(findById(emergency.id).breached, true);
  assert.equal(findById(urgent.id).breached, false);
  assert.equal(findById(normal.id).breached, false);

  // Breach is persisted on the request (not just on the snapshot)
  const persisted = m.getRequest(emergency.id);
  assert.ok(persisted.slaBreachedAt);
  assert.ok(persisted.history.some((h) => h.action === 'sla-breached'));

  // 25 more hours — urgent also breaches (29h total > 24h)
  clock.advanceHours(25);
  const snap2 = m.slaTracker();
  assert.equal(snap2.find((s) => s.id === urgent.id).breached, true);

  // Sorted by minutesRemaining ascending (most urgent first)
  for (let i = 1; i < snap2.length; i += 1) {
    assert.ok(snap2[i - 1].minutesRemaining <= snap2[i].minutesRemaining);
  }
});

test('slaTracker — completed within SLA is not flagged', () => {
  const clock = makeClock('2026-04-11T08:00:00Z');
  const m = new MaintenanceRequests({ clock });
  const r = m.createRequest({
    propertyId: 'P-300', unit: 'C-1', tenant: baseTenant(),
    category: 'plumbing', description_he: 'ברז דולף',
    priority: 'normal', reportedAt: clock.nowIso(),
  });
  m.assignVendor(r.id, 'VND-AQUA', 200);
  clock.advanceHours(30);
  const done = m.recordCompletion(r.id, {
    workPerformed: 'הוחלף ברז', totalCost: 280, laborHours: 0.5,
  });
  assert.equal(done.slaBreachedAt, null, '30h < 72h → no breach');
});

test('slaTracker — completed after SLA is flagged at completion time', () => {
  const clock = makeClock('2026-04-11T08:00:00Z');
  const m = new MaintenanceRequests({ clock });
  const r = m.createRequest({
    propertyId: 'P-300', unit: 'C-2', tenant: baseTenant(),
    category: 'plumbing', description_he: 'ברז דולף',
    priority: 'emergency', reportedAt: clock.nowIso(),
  });
  m.assignVendor(r.id, 'VND-AQUA', 200);
  clock.advanceHours(10); // > 4h SLA
  const done = m.recordCompletion(r.id, {
    workPerformed: 'תוקן', totalCost: 300, laborHours: 1,
  });
  assert.ok(done.slaBreachedAt, 'should record breach at completion');
});

// ---------------------------------------------------------------------------
// Cost split — Israeli law defaults + override
// ---------------------------------------------------------------------------

test('splitCost — structural defaults to 100% landlord (Israeli law)', () => {
  const clock = makeClock('2026-04-11T08:00:00Z');
  const m = new MaintenanceRequests({ clock });
  const r = m.createRequest({
    propertyId: 'P-400', unit: 'D-1', tenant: baseTenant(),
    category: 'structural', description_he: 'סדק במרפסת',
    priority: 'urgent', reportedAt: clock.nowIso(),
  });
  m.assignVendor(r.id, 'VND-BUILDER', 8000);
  m.recordCompletion(r.id, {
    workPerformed: 'סגירת סדק + טיח חדש', totalCost: 7850, laborHours: 12,
  });

  const split = m.splitCost(r.id);
  assert.equal(split.landlordPct, 100);
  assert.equal(split.tenantPct, 0);
  assert.equal(split.landlordShare, 7850);
  assert.equal(split.tenantShare, 0);
  assert.equal(split.source, 'default-by-category');
  assert.match(split.basis_he, /חוק השכירות/);
});

test('splitCost — plumbing default 80/20', () => {
  const clock = makeClock('2026-04-11T08:00:00Z');
  const m = new MaintenanceRequests({ clock });
  const r = m.createRequest({
    propertyId: 'P-400', unit: 'D-2', tenant: baseTenant(),
    category: 'plumbing', description_he: 'סתימה בכיור',
    priority: 'normal', reportedAt: clock.nowIso(),
  });
  m.assignVendor(r.id, 'VND-AQUA', 500);
  m.recordCompletion(r.id, {
    workPerformed: 'שחרור סתימה', totalCost: 500, laborHours: 1,
  });
  const split = m.splitCost(r.id);
  assert.equal(split.landlordShare, 400); // 80%
  assert.equal(split.tenantShare, 100);   // 20%
  assert.equal(split.landlordShare + split.tenantShare, 500);
});

test('splitCost — override with explicit 50/50 (misuse)', () => {
  const clock = makeClock('2026-04-11T08:00:00Z');
  const m = new MaintenanceRequests({ clock });
  const r = m.createRequest({
    propertyId: 'P-400', unit: 'D-3', tenant: baseTenant(),
    category: 'plumbing', description_he: 'סתימה מסיגריות',
    priority: 'normal', reportedAt: clock.nowIso(),
  });
  m.assignVendor(r.id, 'VND-AQUA', 800);
  m.recordCompletion(r.id, {
    workPerformed: 'שחרור סתימה', totalCost: 800, laborHours: 2,
  });
  const split = m.splitCost(r.id, { landlordPct: 50, tenantPct: 50 });
  assert.equal(split.source, 'override');
  assert.equal(split.landlordShare, 400);
  assert.equal(split.tenantShare, 400);
});

test('splitCost — invalid overrides are rejected', () => {
  const clock = makeClock('2026-04-11T08:00:00Z');
  const m = new MaintenanceRequests({ clock });
  const r = m.createRequest({
    propertyId: 'P-400', unit: 'D-4', tenant: baseTenant(),
    category: 'plumbing', description_he: 'בדיקה',
    priority: 'normal', reportedAt: clock.nowIso(),
  });
  m.assignVendor(r.id, 'VND-AQUA', 100);
  m.recordCompletion(r.id, { workPerformed: 'x', totalCost: 100, laborHours: 0.5 });

  assert.throws(() => m.splitCost(r.id, { landlordPct: 60, tenantPct: 30 }),
    /must = 100/);
  assert.throws(() => m.splitCost(r.id, { landlordPct: -5, tenantPct: 105 }),
    /out of range/);
});

test('splitCost — cannot split before completion', () => {
  const clock = makeClock('2026-04-11T08:00:00Z');
  const m = new MaintenanceRequests({ clock });
  const r = m.createRequest({
    propertyId: 'P-400', unit: 'D-5', tenant: baseTenant(),
    category: 'plumbing', description_he: 'בדיקה',
    priority: 'normal', reportedAt: clock.nowIso(),
  });
  assert.throws(() => m.splitCost(r.id), /requires recordCompletion/);
});

// ---------------------------------------------------------------------------
// Cost aggregation
// ---------------------------------------------------------------------------

test('costAggregation — totals per property + per category', () => {
  const clock = makeClock('2026-04-01T08:00:00Z');
  const m = new MaintenanceRequests({ clock });

  const r1 = m.createRequest({
    propertyId: 'P-500', unit: 'E-1', tenant: baseTenant(),
    category: 'plumbing', description_he: 'נזילה',
    priority: 'normal', reportedAt: clock.nowIso(),
  });
  m.assignVendor(r1.id, 'VND-AQUA', 500);
  m.recordCompletion(r1.id, { workPerformed: 'x', totalCost: 500, laborHours: 1 });
  m.splitCost(r1.id); // 80/20 → 400 / 100

  clock.advanceDays(3);
  const r2 = m.createRequest({
    propertyId: 'P-500', unit: 'E-2', tenant: baseTenant(),
    category: 'electrical', description_he: 'שקע חשמל לא עובד',
    priority: 'urgent', reportedAt: clock.nowIso(),
  });
  m.assignVendor(r2.id, 'VND-ELEC', 700);
  m.recordCompletion(r2.id, { workPerformed: 'x', totalCost: 700, laborHours: 2 });
  m.splitCost(r2.id); // 90/10 → 630 / 70

  clock.advanceDays(5);
  const r3 = m.createRequest({
    propertyId: 'P-500', unit: 'E-3', tenant: baseTenant(),
    category: 'plumbing', description_he: 'ברז דולף',
    priority: 'low', reportedAt: clock.nowIso(),
  });
  m.assignVendor(r3.id, 'VND-AQUA', 200);
  m.recordCompletion(r3.id, { workPerformed: 'x', totalCost: 200, laborHours: 0.5 });
  m.splitCost(r3.id); // 80/20 → 160 / 40

  // Something on a different property — MUST be excluded
  const rx = m.createRequest({
    propertyId: 'P-999', unit: 'Z-1', tenant: baseTenant(),
    category: 'plumbing', description_he: 'x',
    priority: 'normal', reportedAt: clock.nowIso(),
  });
  m.assignVendor(rx.id, 'VND-AQUA', 1000);
  m.recordCompletion(rx.id, { workPerformed: 'x', totalCost: 1000, laborHours: 2 });
  m.splitCost(rx.id);

  const agg = m.costAggregation('P-500', {
    from: '2026-04-01T00:00:00Z',
    to: '2026-04-30T23:59:59Z',
  });

  assert.equal(agg.count, 3);
  assert.equal(agg.total, 1400);                   // 500 + 700 + 200
  assert.equal(agg.byCategory.plumbing, 700);      // 500 + 200
  assert.equal(agg.byCategory.electrical, 700);
  assert.equal(agg.landlordTotal, 1190);           // 400 + 630 + 160
  assert.equal(agg.tenantTotal, 210);              // 100 +  70 +  40
  assert.equal(agg.landlordTotal + agg.tenantTotal, agg.total);
});

test('costAggregation — period filter excludes out-of-range requests', () => {
  const clock = makeClock('2026-01-01T08:00:00Z');
  const m = new MaintenanceRequests({ clock });
  const rOld = m.createRequest({
    propertyId: 'P-501', unit: 'F-1', tenant: baseTenant(),
    category: 'plumbing', description_he: 'ישן',
    priority: 'normal', reportedAt: clock.nowIso(),
  });
  m.assignVendor(rOld.id, 'VND-AQUA', 300);
  m.recordCompletion(rOld.id, { workPerformed: 'x', totalCost: 300, laborHours: 1 });

  clock.set('2026-04-15T08:00:00Z');
  const rNew = m.createRequest({
    propertyId: 'P-501', unit: 'F-2', tenant: baseTenant(),
    category: 'plumbing', description_he: 'חדש',
    priority: 'normal', reportedAt: clock.nowIso(),
  });
  m.assignVendor(rNew.id, 'VND-AQUA', 400);
  m.recordCompletion(rNew.id, { workPerformed: 'x', totalCost: 400, laborHours: 1 });

  const agg = m.costAggregation('P-501', {
    from: '2026-04-01T00:00:00Z',
    to: '2026-04-30T23:59:59Z',
  });
  assert.equal(agg.count, 1);
  assert.equal(agg.total, 400);
});

// ---------------------------------------------------------------------------
// Recurring issue detection
// ---------------------------------------------------------------------------

test('recurringIssues — detects unit-level hotspot (same cat+unit ≥2 in 180d)', () => {
  const clock = makeClock('2026-01-01T08:00:00Z');
  const m = new MaintenanceRequests({ clock });

  // Three plumbing calls in unit E-1 within a month
  for (let i = 0; i < 3; i += 1) {
    const r = m.createRequest({
      propertyId: 'P-600', unit: 'E-1', tenant: baseTenant(),
      category: 'plumbing', description_he: `נזילה חוזרת ${i + 1}`,
      priority: 'normal', reportedAt: clock.nowIso(),
    });
    m.assignVendor(r.id, 'VND-AQUA', 300);
    m.recordCompletion(r.id, { workPerformed: 'x', totalCost: 300, laborHours: 1 });
    clock.advanceDays(10);
  }

  const res = m.recurringIssues('P-600');
  const hotspot = res.patterns.find((p) => p.kind === 'unit-hotspot');
  assert.ok(hotspot, 'expected a unit-hotspot pattern');
  assert.equal(hotspot.unit, 'E-1');
  assert.equal(hotspot.category, 'plumbing');
  assert.equal(hotspot.count, 3);
  assert.match(hotspot.message_he, /אינסטלציה/);

  const chronic = res.patterns.find((p) => p.kind === 'chronic-category');
  assert.ok(chronic, 'expected a chronic-category pattern');
  assert.equal(chronic.category, 'plumbing');
  assert.equal(chronic.count, 3);
  assert.equal(chronic.totalCost, 900);
});

test('recurringIssues — does NOT flag one-off issues', () => {
  const clock = makeClock('2026-01-01T08:00:00Z');
  const m = new MaintenanceRequests({ clock });
  m.createRequest({
    propertyId: 'P-601', unit: 'E-1', tenant: baseTenant(),
    category: 'plumbing', description_he: 'ברז',
    priority: 'normal', reportedAt: clock.nowIso(),
  });
  const res = m.recurringIssues('P-601');
  assert.equal(res.patterns.length, 0);
  assert.equal(res.totalRequests, 1);
});

// ---------------------------------------------------------------------------
// Work-order PDF (plain text)
// ---------------------------------------------------------------------------

test('generateWorkOrderPDF — contains Hebrew sections and numbers', () => {
  const clock = makeClock('2026-04-11T08:00:00Z');
  const m = new MaintenanceRequests({ clock });
  const r = m.createRequest({
    propertyId: 'P-700', unit: 'G-1', tenant: baseTenant(),
    category: 'plumbing', description_he: 'נזילה מהתקרה',
    priority: 'emergency', reportedAt: clock.nowIso(),
  });
  m.assignVendor(r.id, 'VND-AQUA', 600);
  m.scheduleVisit(r.id, '2026-04-11T10:00:00Z', 'דחוף — דירה שכנה מציפה');
  m.recordCompletion(r.id, {
    workPerformed: 'סגירת צינור סדוק', totalCost: 640, laborHours: 2,
    partsUsed: [{ name: 'צינור פוליאתילן', qty: 2, cost: 80 }],
    tenantSignature: 'י. כהן',
  });
  m.splitCost(r.id);

  const out = m.generateWorkOrderPDF(r.id);
  assert.match(out.workOrderNumber, /^WO-2026-/);
  assert.equal(out.mime, 'text/plain; charset=utf-8');
  assert.ok(out.filename.endsWith('.txt'));
  assert.ok(out.bytes > 0);

  const text = out.content;
  assert.match(text, /הזמנת עבודה/);
  assert.match(text, /נכס \/ Property/);
  assert.match(text, /דייר \/ Tenant/);
  assert.match(text, /תיאור הבעיה \/ Issue/);
  assert.match(text, /חלוקת עלות \/ Cost Split/);
  assert.match(text, /חוק השכירות/);
  assert.match(text, /₪640\.00/);
  assert.match(text, /לא מוחקים/);
});

// ---------------------------------------------------------------------------
// Never-delete semantics
// ---------------------------------------------------------------------------

test('cancelRequest — soft cancel, history preserved, no delete', () => {
  const clock = makeClock('2026-04-11T08:00:00Z');
  const m = new MaintenanceRequests({ clock });
  const r = m.createRequest({
    propertyId: 'P-800', unit: 'H-1', tenant: baseTenant(),
    category: 'other', description_he: 'טעות',
    priority: 'low', reportedAt: clock.nowIso(),
  });
  const cancelled = m.cancelRequest(r.id, 'duplicate report');
  assert.equal(cancelled.status, STATUS.CANCELLED);

  // Still present on listRequests (no hard delete)
  const all = m.listRequests({ propertyId: 'P-800' });
  assert.equal(all.length, 1);
  assert.equal(all[0].id, r.id);

  // Cancelling again for closed/completed is blocked
  const r2 = m.createRequest({
    propertyId: 'P-800', unit: 'H-2', tenant: baseTenant(),
    category: 'plumbing', description_he: 'ok',
    priority: 'normal', reportedAt: clock.nowIso(),
  });
  m.assignVendor(r2.id, 'VND-AQUA', 100);
  m.recordCompletion(r2.id, { workPerformed: 'x', totalCost: 100, laborHours: 0.5 });
  assert.throws(() => m.cancelRequest(r2.id), /cannot cancel/);
});
