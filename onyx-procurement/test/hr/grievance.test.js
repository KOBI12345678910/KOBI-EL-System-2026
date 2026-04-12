/**
 * Grievance System — Unit Tests
 * Agent Y-075 • Techno-Kol Uzi • Swarm 7
 *
 * Run with:
 *   node --test test/hr/grievance.test.js
 *
 * Requires Node >= 18 for node:test.
 *
 * Covers:
 *   - Filing flow (all categories, validation, statutory routing)
 *   - Anonymous handling (identity scrubbing, anon token, protection)
 *   - Conflict-of-interest check on investigator assignment
 *   - Interview recording (consent required)
 *   - Hearing scheduling & verdict
 *   - Retaliation monitor window + incident reporting
 *   - Encryption round-trip (AES-256-GCM)
 *   - RBAC / restrictAccess / checkAccess
 *   - Statutory report aggregation
 *   - Appeal process escalation
 *   - Kobi's rule: nothing is ever deleted (audit trail integrity)
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const grv = require(path.resolve(__dirname, '..', '..', 'src', 'hr', 'grievance.js'));
const {
  GrievanceSystem,
  CATEGORIES,
  SEVERITY,
  STATUS,
  STATUTORY_ROUTE,
  DEFAULT_ROLES,
  _internals,
} = grv;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

let nowMs = Date.parse('2026-04-11T10:00:00Z');
function fakeClock() { return new Date(nowMs); }
function advance(days) { nowMs += days * 86400000; }
function resetClock() { nowMs = Date.parse('2026-04-11T10:00:00Z'); }

let idCounter = 0;
function fakeId(prefix) { idCounter += 1; return `${prefix}-fake-${idCounter}`; }

function makeSystem(opts = {}) {
  idCounter = 0;
  return new GrievanceSystem({
    encryptionKey: 'test-secret-key-0123456789',
    clock: fakeClock,
    randomId: fakeId,
    ...opts,
  });
}

function complainant(overrides = {}) {
  return {
    id: 'emp-100',
    name: 'Dana Cohen',
    role: 'engineer',
    email: 'dana@example.co.il',
    ...overrides,
  };
}

function harassmentOfficer() {
  return { id: 'off-1', name: 'Rina Levi', role: 'harassment-officer' };
}

function hrOfficer() {
  return { id: 'hro-1', name: 'Uri Ben-David', role: 'hr-officer' };
}

// ═════════════════════════════════════════════════════════════
// FILING FLOW
// ═════════════════════════════════════════════════════════════

test('fileComplaint: happy path with full complainant info', () => {
  resetClock();
  const sys = makeSystem();
  const res = sys.fileComplaint({
    complainant: complainant(),
    anonymous: false,
    category: 'management',
    description: 'My manager refuses to approve vacation despite union rules.',
    severity: 'medium',
  });
  assert.ok(res.id && res.id.startsWith('grv-'));
  assert.equal(res.status, STATUS.FILED);
  assert.equal(res.category, 'management');
  assert.equal(res.severity, 'medium');
  assert.equal(res.complainant.anonymous, false);
  assert.equal(res.complainant.id, 'emp-100');
  assert.equal(res.descriptionEncrypted, true);
  assert.equal(res.description, null);
  assert.ok(res.descriptionEnc);
  assert.equal(res.descriptionEnc.alg, 'aes-256-gcm');
  assert.ok(res.slaDeadline);
  assert.ok(res.historyCount >= 1);
});

test('fileComplaint: invalid category rejected', () => {
  const sys = makeSystem();
  assert.throws(() => sys.fileComplaint({
    complainant: complainant(),
    category: 'nonsense',
    description: 'foo',
  }), /invalid category/);
});

test('fileComplaint: description required', () => {
  const sys = makeSystem();
  assert.throws(() => sys.fileComplaint({
    complainant: complainant(),
    category: 'management',
    description: '',
  }), /description is required/);
});

test('fileComplaint: non-anonymous requires complainant.id', () => {
  const sys = makeSystem();
  assert.throws(() => sys.fileComplaint({
    anonymous: false,
    category: 'management',
    description: 'x',
  }), /complainant.id is required/);
});

test('fileComplaint: harassment routes to statutory law', () => {
  const sys = makeSystem();
  const res = sys.fileComplaint({
    complainant: complainant(),
    category: 'harassment',
    description: 'Unwanted comments by team lead, persistent.',
    severity: 'critical',
  });
  assert.equal(res.category, 'harassment');
  assert.ok(res.statutory.required);
  assert.match(res.statutory.statute.he, /הטרדה מינית/);
  assert.match(res.statutory.statute.en, /Sexual Harassment/);
  assert.equal(res.statutory.ministryNotifiable, true);
  assert.equal(res.protectedFromRetaliation, true);
  assert.ok(res.allowedRoles.includes('harassment-officer'));
});

test('fileComplaint: pay complaint routes to equal-pay law', () => {
  const sys = makeSystem();
  const res = sys.fileComplaint({
    complainant: complainant(),
    category: 'pay',
    description: 'Female colleagues in same role earn 15% less.',
  });
  assert.match(res.statutory.statute.he, /שכר שווה/);
  assert.match(res.statutory.statute.en, /Equal Pay/);
  assert.equal(res.protectedFromRetaliation, true);
});

test('fileComplaint: ethics/whistleblower routes to protection law', () => {
  const sys = makeSystem();
  const res = sys.fileComplaint({
    complainant: complainant(),
    category: 'ethics',
    description: 'I saw financial records being backdated.',
    severity: 'high',
  });
  assert.match(res.statutory.statute.he, /חשיפת עבירות/);
  assert.equal(res.protectedFromRetaliation, true);
  assert.equal(res.statutory.ministryNotifiable, true);
});

// ═════════════════════════════════════════════════════════════
// ANONYMOUS HANDLING
// ═════════════════════════════════════════════════════════════

test('anonymous: identity is scrubbed, anon token stable within case', () => {
  const sys = makeSystem();
  const res = sys.fileComplaint({
    complainant: complainant(),    // provided, but will be scrubbed
    anonymous: true,
    category: 'harassment',
    description: 'Anonymous harassment report.',
    severity: 'high',
  });
  assert.equal(res.complainant.anonymous, true);
  assert.equal(res.complainant.id, undefined);
  assert.equal(res.complainant.name, undefined);
  assert.equal(res.complainant.email, undefined);
  assert.ok(res.complainant.pseudonym.startsWith('anon-'));
  assert.ok(res.complainant.anonToken);
  // Anon cases must be protected from retaliation AUTOMATICALLY
  assert.equal(res.protectedFromRetaliation, true);
  // Anon complainant cannot appear in allowedRoles
  assert.ok(!res.allowedRoles.includes('complainant'));
});

test('anonymous: fully anonymous (no complainant.id) accepted for sensitive cases', () => {
  const sys = makeSystem();
  const res = sys.fileComplaint({
    anonymous: true,
    category: 'ethics',
    description: 'Someone is taking kickbacks from a supplier.',
  });
  assert.equal(res.complainant.anonymous, true);
  assert.equal(res.complainant.anonToken, null);
});

// ═════════════════════════════════════════════════════════════
// INVESTIGATOR / CONFLICT-OF-INTEREST
// ═════════════════════════════════════════════════════════════

test('assignInvestigator: happy path for management complaint', () => {
  const sys = makeSystem();
  const c = sys.fileComplaint({
    complainant: complainant(),
    category: 'management',
    description: 'Issue with PM.',
  });
  const r = sys.assignInvestigator(c.id, hrOfficer());
  assert.equal(r.assigned, true);
  assert.equal(r.conflictOfInterest, false);
});

test('assignInvestigator: blocks when investigator is complainant', () => {
  const sys = makeSystem();
  const c = sys.fileComplaint({
    complainant: complainant({ id: 'emp-X' }),
    category: 'management',
    description: 'Issue.',
  });
  const r = sys.assignInvestigator(c.id, { id: 'emp-X', role: 'hr-officer' });
  assert.equal(r.assigned, false);
  assert.equal(r.conflictOfInterest, true);
  assert.match(r.reason.en, /complainant/);
});

test('assignInvestigator: blocks when investigator is a witness', () => {
  const sys = makeSystem();
  const c = sys.fileComplaint({
    complainant: complainant(),
    category: 'management',
    description: 'Issue.',
    witnesses: [{ id: 'w-1', name: 'Witness One' }],
  });
  const r = sys.assignInvestigator(c.id, { id: 'w-1', role: 'hr-officer' });
  assert.equal(r.assigned, false);
  assert.match(r.reason.en, /witness/);
});

test('assignInvestigator: blocks when personal relationship declared', () => {
  const sys = makeSystem();
  const c = sys.fileComplaint({
    complainant: complainant({ id: 'emp-200' }),
    category: 'management',
    description: 'Issue.',
  });
  const r = sys.assignInvestigator(c.id, {
    id: 'inv-1',
    role: 'hr-officer',
    relationships: [{ targetId: 'emp-200', kind: 'spouse' }],
  });
  assert.equal(r.assigned, false);
  assert.match(r.reason.he, /קרבה/);
});

test('assignInvestigator: harassment requires harassment-officer role', () => {
  const sys = makeSystem();
  const c = sys.fileComplaint({
    complainant: complainant(),
    category: 'harassment',
    description: 'Report.',
  });
  const rBad = sys.assignInvestigator(c.id, hrOfficer()); // wrong role
  assert.equal(rBad.assigned, false);
  assert.match(rBad.reason.he, /אחראי/);
  const rGood = sys.assignInvestigator(c.id, harassmentOfficer());
  assert.equal(rGood.assigned, true);
});

// ═════════════════════════════════════════════════════════════
// INTERVIEW & HEARING & VERDICT
// ═════════════════════════════════════════════════════════════

test('recordInterview: requires consent and encrypts content', () => {
  const sys = makeSystem();
  const c = sys.fileComplaint({
    complainant: complainant(),
    category: 'management',
    description: 'Issue.',
  });
  assert.throws(() => sys.recordInterview({
    complaintId: c.id,
    subject: { id: 'emp-200' },
    content: 'He said he would not promote me.',
    consent: false,
  }), /consent required/);

  const r = sys.recordInterview({
    complaintId: c.id,
    subject: { id: 'emp-200', name: 'Witness' },
    content: 'He said he would not promote me.',
    consent: true,
  });
  assert.ok(r.interviewId.startsWith('int-'));
  assert.ok(r.hash);
});

test('scheduleHearings: creates hearing plan with notice + decision windows', () => {
  resetClock();
  const sys = makeSystem();
  const c = sys.fileComplaint({
    complainant: complainant(),
    category: 'management',
    description: 'Issue.',
  });
  const plan = sys.scheduleHearings(c.id);
  assert.ok(plan.id.startsWith('hrg-'));
  assert.ok(new Date(plan.hearingAt).getTime() > new Date(plan.notice).getTime());
  assert.ok(new Date(plan.decideBy).getTime() > new Date(plan.respondBy).getTime());
});

test('decideVerdict: records finding and emits bilingual label', () => {
  const sys = makeSystem();
  const c = sys.fileComplaint({
    complainant: complainant(),
    category: 'management',
    description: 'Issue.',
  });
  const v = sys.decideVerdict({
    complaintId: c.id,
    finding: 'substantiated',
    actions: [{ type: 'training', target: 'manager-A', detail: 'Mandatory manager training.' }],
    appeal: { allowed: true },
  });
  assert.equal(v.finding, 'substantiated');
  assert.equal(v.findingLabel.he, 'מבוססת');
  assert.equal(v.findingLabel.en, 'Substantiated');
  assert.equal(v.appeal.allowed, true);
});

test('decideVerdict: rejects invalid finding', () => {
  const sys = makeSystem();
  const c = sys.fileComplaint({
    complainant: complainant(),
    category: 'management',
    description: 'Issue.',
  });
  assert.throws(() => sys.decideVerdict({
    complaintId: c.id,
    finding: 'maybe',
    actions: [],
  }), /invalid finding/);
});

// ═════════════════════════════════════════════════════════════
// RETALIATION MONITOR
// ═════════════════════════════════════════════════════════════

test('retaliationMonitor: opens 180-day window by default', () => {
  resetClock();
  const sys = makeSystem();
  const c = sys.fileComplaint({
    complainant: complainant(),
    category: 'ethics',
    description: 'Whistleblower report.',
  });
  const mon = sys.retaliationMonitor(c.id);
  assert.equal(mon.daysAfter, 180);
  assert.equal(mon.status, 'active');
  assert.ok(sys.isRetaliationWindowOpen(c.id));
  // Advance 100 days → still open
  advance(100);
  assert.ok(sys.isRetaliationWindowOpen(c.id));
  // Advance to 200 days total → closed
  advance(100);
  assert.equal(sys.isRetaliationWindowOpen(c.id), false);
});

test('retaliationMonitor: reportRetaliation records incidents', () => {
  resetClock();
  const sys = makeSystem();
  const c = sys.fileComplaint({
    complainant: complainant(),
    category: 'ethics',
    description: 'Whistleblower.',
  });
  sys.retaliationMonitor(c.id, 90);
  advance(10);
  const inc = sys.reportRetaliation(c.id, {
    type: 'demotion',
    actor: 'manager-X',
    detail: 'Unexplained demotion two weeks after filing.',
  });
  assert.ok(inc.id.startsWith('ret-'));
  assert.equal(inc.reviewed, false);
  // Verify incident recorded on watch
  const view = sys.getComplaint(c.id, { id: 'any', role: 'hr-officer' });
  assert.equal(view.retaliationIncidentCount, 1);
});

test('retaliationMonitor: reportRetaliation throws when no active monitor', () => {
  const sys = makeSystem();
  const c = sys.fileComplaint({
    complainant: complainant(),
    category: 'management',
    description: 'Issue.',
  });
  assert.throws(() => sys.reportRetaliation(c.id, { type: 'demotion' }), /no active retaliation monitor/);
});

// ═════════════════════════════════════════════════════════════
// ENCRYPTION ROUND-TRIP
// ═════════════════════════════════════════════════════════════

test('encrypt/decrypt: AES-256-GCM round-trip preserves payload', () => {
  const sys = makeSystem();
  const payload = { secret: 'סוד מקצועי', arr: [1, 2, 3], nested: { k: 'v' } };
  const env = sys.encrypt(payload);
  assert.equal(env.alg, 'aes-256-gcm');
  assert.equal(env.v, 1);
  assert.ok(env.salt && env.iv && env.tag && env.ct);
  const back = sys.decrypt(env);
  assert.deepEqual(back, payload);
});

test('encrypt/decrypt: tampered ciphertext is rejected by GCM auth tag', () => {
  const sys = makeSystem();
  const env = sys.encrypt({ x: 1 });
  // Flip a byte in the ciphertext
  const tampered = { ...env, ct: (env.ct[0] === '0' ? '1' : '0') + env.ct.slice(1) };
  assert.throws(() => sys.decrypt(tampered));
});

test('encrypt: fileComplaint stores only ciphertext + hash, never plaintext', () => {
  const sys = makeSystem();
  const res = sys.fileComplaint({
    complainant: complainant(),
    category: 'harassment',
    description: 'Very sensitive description',
    severity: 'high',
  });
  // Description plaintext must not be present in any returned field.
  const json = JSON.stringify(res);
  assert.ok(!json.includes('Very sensitive description'),
    'plaintext description leaked to public view');
  assert.ok(res.descriptionEnc);
  // Verify round-trip via helper
  const back = sys.decrypt(res.descriptionEnc);
  assert.equal(back.description, 'Very sensitive description');
});

test('encrypt: no key → throws with clear message', () => {
  const sys = new GrievanceSystem({ clock: fakeClock, randomId: fakeId });
  assert.throws(() => sys.encrypt({ a: 1 }), /no encryption key/);
});

// ═════════════════════════════════════════════════════════════
// ACCESS CONTROL (RBAC)
// ═════════════════════════════════════════════════════════════

test('restrictAccess: narrows allowedRoles', () => {
  const sys = makeSystem();
  const c = sys.fileComplaint({
    complainant: complainant(),
    category: 'harassment',
    description: 'Report.',
  });
  sys.restrictAccess({ complaintId: c.id, allowedRoles: ['harassment-officer', 'legal'] });
  const view = sys.getComplaint(c.id, { id: 'off-1', role: 'harassment-officer' });
  assert.deepEqual(view.allowedRoles, ['harassment-officer', 'legal']);
});

test('restrictAccess: unknown role rejected', () => {
  const sys = makeSystem();
  const c = sys.fileComplaint({
    complainant: complainant(),
    category: 'management',
    description: 'Issue.',
  });
  assert.throws(() => sys.restrictAccess({
    complaintId: c.id,
    allowedRoles: ['hr-officer', 'NOT-A-ROLE'],
  }), /unknown role/);
});

test('checkAccess: actor with disallowed role is rejected', () => {
  const sys = makeSystem();
  const c = sys.fileComplaint({
    complainant: complainant(),
    category: 'harassment',
    description: 'Report.',
  });
  sys.restrictAccess({ complaintId: c.id, allowedRoles: ['harassment-officer'] });
  assert.equal(sys.checkAccess(c.id, { id: 'x', role: 'hr-officer' }), false);
  assert.equal(sys.checkAccess(c.id, { id: 'x', role: 'harassment-officer' }), true);
});

test('checkAccess: complainant can view their own case only', () => {
  const sys = makeSystem();
  const c = sys.fileComplaint({
    complainant: complainant({ id: 'emp-A' }),
    category: 'management',
    description: 'Issue.',
  });
  assert.equal(sys.checkAccess(c.id, { id: 'emp-A', role: 'complainant' }), true);
  assert.equal(sys.checkAccess(c.id, { id: 'emp-B', role: 'complainant' }), false);
});

test('checkAccess: anonymous case blocks complainant role entirely', () => {
  const sys = makeSystem();
  const c = sys.fileComplaint({
    complainant: complainant({ id: 'emp-A' }),
    anonymous: true,
    category: 'harassment',
    description: 'anon',
  });
  assert.equal(sys.checkAccess(c.id, { id: 'emp-A', role: 'complainant' }), false);
});

test('getComplaint: denied actors get thrown', () => {
  const sys = makeSystem();
  const c = sys.fileComplaint({
    complainant: complainant(),
    category: 'management',
    description: 'Issue.',
  });
  assert.throws(() => sys.getComplaint(c.id, { id: 'x', role: 'intern' }), /access denied/);
});

// ═════════════════════════════════════════════════════════════
// STATUTORY REPORT
// ═════════════════════════════════════════════════════════════

test('statutoryReport: aggregates without exposing identity', () => {
  resetClock();
  const sys = makeSystem();
  sys.fileComplaint({ complainant: complainant({ id: 'e1' }), category: 'harassment', description: 'x', severity: 'high' });
  sys.fileComplaint({ complainant: complainant({ id: 'e2' }), category: 'pay',        description: 'y', severity: 'medium' });
  sys.fileComplaint({ anonymous: true, category: 'ethics', description: 'z', severity: 'critical' });
  const rpt = sys.statutoryReport({ from: '2026-01-01', to: '2026-12-31' });
  assert.equal(rpt.totals.filed, 3);
  assert.equal(rpt.totals.anonymous, 1);
  assert.equal(rpt.byCategory.harassment, 1);
  assert.equal(rpt.byCategory.pay, 1);
  assert.equal(rpt.byCategory.ethics, 1);
  assert.equal(rpt.bySeverity.high, 1);
  assert.equal(rpt.bySeverity.critical, 1);
  // ministryNotifiable = harassment + ethics = 2
  assert.equal(rpt.totals.ministryNotifiable, 2);
  // Ensure no identities leaked
  const serialised = JSON.stringify(rpt);
  assert.ok(!serialised.includes('Dana Cohen'));
  assert.ok(!serialised.includes('emp-100'));
});

// ═════════════════════════════════════════════════════════════
// APPEAL PROCESS
// ═════════════════════════════════════════════════════════════

test('appealProcess: opens escalation path after verdict', () => {
  resetClock();
  const sys = makeSystem();
  const c = sys.fileComplaint({
    complainant: complainant(),
    category: 'management',
    description: 'Issue.',
  });
  sys.decideVerdict({ complaintId: c.id, finding: 'unsubstantiated', actions: [], appeal: { allowed: true } });
  const app = sys.appealProcess(c.id);
  assert.equal(app.status, 'pending-review');
  assert.equal(app.escalationPath.length, 3);
  assert.equal(app.escalationPath[0].role, 'legal');
  assert.equal(app.escalationPath[2].role, 'external');
});

test('appealProcess: escalation advances through levels', () => {
  resetClock();
  const sys = makeSystem();
  const c = sys.fileComplaint({
    complainant: complainant(),
    category: 'management',
    description: 'Issue.',
  });
  sys.decideVerdict({ complaintId: c.id, finding: 'unsubstantiated', actions: [], appeal: { allowed: true } });
  sys.appealProcess(c.id);
  let a = sys.escalateAppeal(c.id, 'rejected'); // legal -> ceo
  assert.equal(a.escalationPath[0].status, 'rejected');
  assert.equal(a.escalationPath[1].status, 'pending');
  a = sys.escalateAppeal(c.id, 'upheld'); // ceo upholds
  assert.equal(a.outcome, 'upheld');
  assert.equal(a.status, 'resolved');
});

test('appealProcess: cannot appeal when verdict disallows', () => {
  const sys = makeSystem();
  const c = sys.fileComplaint({
    complainant: complainant(),
    category: 'management',
    description: 'Issue.',
  });
  sys.decideVerdict({ complaintId: c.id, finding: 'unsubstantiated', actions: [], appeal: { allowed: false } });
  assert.throws(() => sys.appealProcess(c.id), /not allowed/);
});

// ═════════════════════════════════════════════════════════════
// AUDIT TRAIL — nothing is ever deleted
// ═════════════════════════════════════════════════════════════

test('audit trail: hash chain is intact and history only grows', () => {
  resetClock();
  const sys = makeSystem();
  const c = sys.fileComplaint({
    complainant: complainant(),
    category: 'management',
    description: 'Issue.',
  });
  sys.assignInvestigator(c.id, hrOfficer());
  sys.recordInterview({
    complaintId: c.id,
    subject: { id: 'w-1' },
    content: 'interview content',
    consent: true,
  });
  sys.scheduleHearings(c.id);
  sys.decideVerdict({ complaintId: c.id, finding: 'substantiated', actions: [], appeal: { allowed: true } });
  const raw = sys.complaints.get(c.id);
  assert.ok(raw.history.length >= 5);
  // Verify hash chain
  for (let i = 1; i < raw.history.length; i++) {
    assert.equal(raw.history[i].prevHash, raw.history[i - 1].hash);
  }
});

test('audit trail: auditLog sink receives events', () => {
  resetClock();
  const events = [];
  const sys = makeSystem({ auditLog: (e) => events.push(e) });
  const c = sys.fileComplaint({
    complainant: complainant(),
    category: 'management',
    description: 'Issue.',
  });
  assert.ok(events.length >= 1);
  assert.equal(events[0].event, 'filed');
  assert.equal(events[0].complaintId, c.id);
});

// ═════════════════════════════════════════════════════════════
// CONSTANTS SANITY
// ═════════════════════════════════════════════════════════════

test('constants: all 9 categories present with bilingual labels', () => {
  const keys = ['harassment','discrimination','safety','pay','management','hr-policy','retaliation','ethics','other'];
  for (const k of keys) {
    assert.ok(CATEGORIES[k], `missing category ${k}`);
    assert.ok(CATEGORIES[k].he);
    assert.ok(CATEGORIES[k].en);
  }
});

test('constants: severity levels have SLA mapping', () => {
  for (const lvl of ['low','medium','high','critical']) {
    assert.ok(SEVERITY[lvl].slaDays > 0);
  }
  // sanity: critical must be strictest
  assert.ok(SEVERITY.critical.slaDays < SEVERITY.low.slaDays);
});

test('constants: DEFAULT_ROLES includes harassment-officer and complainant', () => {
  assert.ok(DEFAULT_ROLES['harassment-officer']);
  assert.equal(DEFAULT_ROLES['complainant'].view, 'own');
});

test('constants: STATUTORY_ROUTE for harassment requires harassment-officer', () => {
  assert.equal(STATUTORY_ROUTE.harassment.requiresOfficer, 'harassment-officer');
  assert.equal(STATUTORY_ROUTE.harassment.investigationDays, 7);
});

// ═════════════════════════════════════════════════════════════
// LOW-LEVEL CRYPTO HELPERS
// ═════════════════════════════════════════════════════════════

test('_internals: sha256 is deterministic', () => {
  assert.equal(_internals.sha256('abc'), _internals.sha256('abc'));
  assert.notEqual(_internals.sha256('abc'), _internals.sha256('abcd'));
});

test('_internals: encryptPayload / decryptPayload round-trip', () => {
  const env = _internals.encryptPayload({ a: 1, b: 'שלום' }, 'key');
  const back = _internals.decryptPayload(env, 'key');
  assert.deepEqual(back, { a: 1, b: 'שלום' });
});

test('_internals: wrong key fails decryption', () => {
  const env = _internals.encryptPayload({ a: 1 }, 'keyA');
  assert.throws(() => _internals.decryptPayload(env, 'keyB'));
});
