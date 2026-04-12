/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  DSR Handler — Unit tests
 * ═══════════════════════════════════════════════════════════════════════════
 *  Agent Y-136  |  Techno-Kol Uzi mega-ERP  |  2026-04-11
 *
 *  Run:    node --test test/privacy/dsr-handler.test.js
 *
 *  Coverage — 26 deterministic test cases exercising every public surface
 *  of DSRHandler + תיקון 13 conformance checks:
 *
 *     01 receiveRequest — access
 *     02 receiveRequest — rectification
 *     03 receiveRequest — erasure
 *     04 receiveRequest — portability
 *     05 receiveRequest — restriction
 *     06 receiveRequest — objection
 *     07 receiveRequest — complaint
 *     08 receiveRequest — unknown type rejected
 *     09 receiveRequest — PII stored only as hash + last4
 *     10 verifyIdentity — approved → status flipped
 *     11 verifyIdentity — bad ת.ז format → rejected
 *     12 scopeRequest — aggregates across injectable data sources
 *     13 processAccessRequest — bilingual export compiled
 *     14 processRectification — audit delta stored + pseudonymized
 *     15 processErasure — retention hold BLOCKS erasure (refused)
 *     16 processErasure — no retention category → soft delete + pseudonymize
 *     17 processPortability — JSON + CSV with UTF-8 BOM
 *     18 processRestriction — freeze flag set
 *     19 processObjection — opt-out flag set
 *     20 processComplaint — escalated to DPO
 *     21 statutoryDeadline — 30 / 60 days for every type
 *     22 markComplex — extends deadline + written justification required
 *     23 generateResponse — bilingual HE + EN with all sections
 *     24 breachNotification — 72h authority deadline on critical
 *     25 breachNotification — low severity does NOT trigger notification
 *     26 auditLog verifyChain — SHA-256 chain integrity + tamper detection
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DSRHandler,
  REQUEST_TYPES,
  REQUEST_STATUS,
  VERIFICATION_METHODS,
  BREACH_SEVERITY,
  STATUTORY_RETENTION,
  DEADLINE_DAYS,
  BREACH_AUTHORITY_DEADLINE_HOURS,
  DPO_CRITERIA,
} = require('../../src/privacy/dsr-handler.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXED_NOW = new Date('2026-04-11T10:00:00.000Z');

function mkHandler(opts = {}) {
  return new DSRHandler({
    now: FIXED_NOW,
    dpo: { id: 'dpo_01', name: 'עדי לוי', email: 'dpo@technokol.co.il' },
    ...opts,
  });
}

const SUBJECT = {
  subjectId: 'subj_12345',
  subjectName: 'יוסי ישראלי',
  subjectIdDoc: '123456782',  // 9-digit ת.ז
};

// a data-source fetcher factory used by multiple tests
function mockSources(h, { includeRetention = true, includeNonRetention = true } = {}) {
  if (includeRetention) {
    h.registerDataSource('hr', () => ([
      { id: 'emp_1', category: 'hr', field: 'salary', value: 12000 },
    ]));
    h.registerDataSource('tax', () => ([
      { id: 'tax_1', category: 'tax', year: 2024, amount: 3400 },
    ]));
  }
  if (includeNonRetention) {
    h.registerDataSource('marketing', () => ([
      { id: 'm_1', category: 'marketing-prefs', topic: 'newsletter' },
    ]));
  }
}

function verifyHelper(h, requestId) {
  return h.verifyIdentity({
    requestId,
    verifier: 'kobi-operator',
    documents: [
      { type: 'teudat_zehut', number: '123456782', issuer: 'משרד הפנים', issuedAt: '2018-01-01' },
    ],
  });
}

// ---------------------------------------------------------------------------
// 01–07 receiveRequest — every type
// ---------------------------------------------------------------------------

test('01 receiveRequest — access creates record with 30d deadline', () => {
  const h = mkHandler();
  const rec = h.receiveRequest({ ...SUBJECT, requestType: 'access' });
  assert.equal(rec.requestType, 'access');
  assert.equal(rec.status, REQUEST_STATUS.RECEIVED);
  assert.equal(rec.requestTypeLabel.he, 'עיון במידע');
  assert.equal(rec.requestTypeLabel.en, 'Right of access');
  // deadline = +30 days
  const dl = new Date(rec.deadlineStandard);
  assert.equal(Math.round((dl - FIXED_NOW) / 86400000), 30);
});

test('02 receiveRequest — rectification', () => {
  const h = mkHandler();
  const rec = h.receiveRequest({ ...SUBJECT, requestType: 'rectification', details: 'כתובת שגויה' });
  assert.equal(rec.requestType, 'rectification');
  assert.equal(rec.requestTypeLabel.he, 'תיקון מידע');
  assert.match(rec.section, /סעיף 14/);
});

test('03 receiveRequest — erasure', () => {
  const h = mkHandler();
  const rec = h.receiveRequest({ ...SUBJECT, requestType: 'erasure' });
  assert.equal(rec.requestType, 'erasure');
  assert.equal(rec.requestTypeLabel.he, 'מחיקת מידע');
  assert.match(rec.section, /תיקון 13/);
});

test('04 receiveRequest — portability', () => {
  const h = mkHandler();
  const rec = h.receiveRequest({ ...SUBJECT, requestType: 'portability' });
  assert.equal(rec.requestType, 'portability');
  assert.equal(rec.requestTypeLabel.he, 'ניידות מידע');
});

test('05 receiveRequest — restriction', () => {
  const h = mkHandler();
  const rec = h.receiveRequest({ ...SUBJECT, requestType: 'restriction' });
  assert.equal(rec.requestType, 'restriction');
  assert.equal(rec.requestTypeLabel.he, 'הגבלת עיבוד');
});

test('06 receiveRequest — objection', () => {
  const h = mkHandler();
  const rec = h.receiveRequest({ ...SUBJECT, requestType: 'objection' });
  assert.equal(rec.requestType, 'objection');
  assert.equal(rec.requestTypeLabel.he, 'התנגדות לעיבוד');
});

test('07 receiveRequest — complaint', () => {
  const h = mkHandler();
  const rec = h.receiveRequest({ ...SUBJECT, requestType: 'complaint' });
  assert.equal(rec.requestType, 'complaint');
  assert.equal(rec.requestTypeLabel.en, 'Complaint to DPO / Authority');
});

test('08 receiveRequest — unknown type rejected', () => {
  const h = mkHandler();
  assert.throws(
    () => h.receiveRequest({ ...SUBJECT, requestType: 'teleport' }),
    /unknown requestType/
  );
});

// ---------------------------------------------------------------------------
// 09 PII privacy — plaintext ID never stored
// ---------------------------------------------------------------------------

test('09 receiveRequest — plaintext ת.ז never stored; only hash + last4', () => {
  const h = mkHandler();
  const rec = h.receiveRequest({ ...SUBJECT, requestType: 'access' });
  assert.equal(rec.subjectIdDocLast4, '6782');
  assert.match(rec.subjectIdDocHash, /^[0-9a-f]{64}$/);
  // no plaintext property anywhere
  assert.equal(rec.subjectIdDoc, undefined);
  for (const v of Object.values(rec)) {
    if (typeof v === 'string') assert.notEqual(v, '123456782');
  }
});

// ---------------------------------------------------------------------------
// 10–11 verifyIdentity
// ---------------------------------------------------------------------------

test('10 verifyIdentity — approved flips status and stores hashed doc', () => {
  const h = mkHandler();
  const req = h.receiveRequest({ ...SUBJECT, requestType: 'access' });
  const v = verifyHelper(h, req.id);
  assert.equal(v.approved, true);
  assert.equal(v.documents[0].numberLast4, '6782');
  assert.match(v.documents[0].numberHash, /^[0-9a-f]{64}$/);
  const after = h.listRequests()[0];
  assert.equal(after.status, REQUEST_STATUS.IDENTITY_VERIFIED);
});

test('11 verifyIdentity — bad ת.ז format rejected with Hebrew reason', () => {
  const h = mkHandler();
  const req = h.receiveRequest({ ...SUBJECT, requestType: 'access' });
  const v = h.verifyIdentity({
    requestId: req.id,
    verifier: 'kobi',
    documents: [{ type: 'teudat_zehut', number: '12345' }],
  });
  assert.equal(v.approved, false);
  assert.match(v.rejectionReason, /ת\.ז/);
  const after = h.listRequests()[0];
  assert.equal(after.status, REQUEST_STATUS.IDENTITY_REJECTED);
});

// ---------------------------------------------------------------------------
// 12 scopeRequest
// ---------------------------------------------------------------------------

test('12 scopeRequest — aggregates across injected data sources', () => {
  const h = mkHandler();
  mockSources(h);
  const req = h.receiveRequest({ ...SUBJECT, requestType: 'access' });
  verifyHelper(h, req.id);
  const scope = h.scopeRequest(req.id);
  assert.equal(scope.sources.length, 3);
  assert.equal(scope.totalRecords, 3);
  assert.deepEqual(
    [...scope.categories].sort(),
    ['hr', 'marketing-prefs', 'tax'].sort()
  );
  assert.equal(scope.sources.find(s => s.name === 'hr').recordCount, 1);
  assert.equal(scope.sources.find(s => s.name === 'tax').ok, true);
});

// ---------------------------------------------------------------------------
// 13 processAccessRequest — bilingual export
// ---------------------------------------------------------------------------

test('13 processAccessRequest — bilingual export with legal basis', () => {
  const h = mkHandler();
  mockSources(h);
  const req = h.receiveRequest({ ...SUBJECT, requestType: 'access' });
  verifyHelper(h, req.id);
  const exp = h.processAccessRequest(req.id);
  assert.ok(exp.data.hr && exp.data.tax && exp.data.marketing);
  assert.equal(exp.labels.he, 'ייצוא מידע אישי לצורך בקשת עיון');
  assert.match(exp.legalBasis.he, /סעיף 13/);
  assert.match(exp.legalBasis.en, /s\. 13/);
  assert.equal(h.listRequests()[0].status, REQUEST_STATUS.COMPLETED);
});

// ---------------------------------------------------------------------------
// 14 processRectification
// ---------------------------------------------------------------------------

test('14 processRectification — applies corrections and pseudonymizes values', () => {
  const h = mkHandler();
  const req = h.receiveRequest({ ...SUBJECT, requestType: 'rectification' });
  verifyHelper(h, req.id);
  const out = h.processRectification(req.id, [
    { source: 'crm', recordId: 'c_1', field: 'address', oldValue: 'רחוב הרצל 1', newValue: 'רחוב ויצמן 42' },
  ]);
  assert.equal(out.count, 1);
  assert.match(out.corrections[0].oldValuePseudo, /\*\*\*/);
  assert.match(out.corrections[0].newValuePseudo, /\*\*\*/);
  // plaintext not in pseudonymized form
  assert.notEqual(out.corrections[0].oldValuePseudo, 'רחוב הרצל 1');
});

// ---------------------------------------------------------------------------
// 15–16 processErasure
// ---------------------------------------------------------------------------

test('15 processErasure — retention hold (HR+TAX) BLOCKS erasure', () => {
  const h = mkHandler();
  mockSources(h, { includeRetention: true, includeNonRetention: false });
  const req = h.receiveRequest({ ...SUBJECT, requestType: 'erasure' });
  verifyHelper(h, req.id);
  const decision = h.processErasure(req.id);
  assert.equal(decision.decision, 'refused');
  assert.equal(decision.retentionHolds.length, 2);
  const cats = decision.retentionHolds.map(h => h.category).sort();
  assert.deepEqual(cats, ['hr', 'tax']);
  assert.match(decision.reason.he, /תקופות שימור/);
  assert.match(decision.legalCitation.he, /סעיף 14/);
  assert.equal(h.listRequests()[0].status, REQUEST_STATUS.REFUSED);
});

test('16 processErasure — only non-retention categories → soft delete + pseudonymize', () => {
  const h = mkHandler();
  // ONLY non-retention data source (marketing prefs) registered
  h.registerDataSource('mkt', () => ([
    { id: 'mk_1', category: 'marketing-prefs', topic: 'newsletter' },
  ]));
  const req = h.receiveRequest({ ...SUBJECT, requestType: 'erasure' });
  verifyHelper(h, req.id);
  const decision = h.processErasure(req.id);
  assert.equal(decision.decision, 'erased');
  assert.equal(decision.retentionHolds.length, 0);
  assert.match(decision.pseudonymized.subjectName, /\*\*\*/);
  // status flipped to ERASED — row NOT physically removed
  const after = h.listRequests()[0];
  assert.equal(after.status, REQUEST_STATUS.ERASED);
  assert.ok(after.subjectNamePseudo);
});

// ---------------------------------------------------------------------------
// 17 processPortability
// ---------------------------------------------------------------------------

test('17 processPortability — JSON + CSV with UTF-8 BOM and checksum', () => {
  const h = mkHandler();
  mockSources(h);
  const req = h.receiveRequest({ ...SUBJECT, requestType: 'portability' });
  verifyHelper(h, req.id);
  const out = h.processPortability(req.id);
  // JSON payload
  assert.equal(out.json.format, 'json+csv');
  assert.ok(out.json.data.hr);
  // CSV starts with UTF-8 BOM for Excel
  assert.equal(out.csv.charCodeAt(0), 0xFEFF);
  // header line has __source + some data columns
  const header = out.csv.split('\r\n')[0];
  assert.match(header, /__source/);
  // checksum present and deterministic-looking
  assert.match(out.checksum, /^[0-9a-f]{64}$/);
  // legal basis references Amendment 13
  assert.match(out.json.legalBasis.he, /13א|תיקון 13/);
});

// ---------------------------------------------------------------------------
// 18 processRestriction
// ---------------------------------------------------------------------------

test('18 processRestriction — freeze flag set with HE+EN labels', () => {
  const h = mkHandler();
  const req = h.receiveRequest({ ...SUBJECT, requestType: 'restriction' });
  verifyHelper(h, req.id);
  const out = h.processRestriction(req.id);
  assert.equal(out.scope, 'all-processing-except-storage');
  assert.match(out.labels.he, /הגבלת עיבוד/);
  assert.match(out.labels.en, /restricted/);
  const after = h.listRequests()[0];
  assert.equal(after.restriction.active, true);
});

// ---------------------------------------------------------------------------
// 19 processObjection
// ---------------------------------------------------------------------------

test('19 processObjection — opt-out flag set', () => {
  const h = mkHandler();
  const req = h.receiveRequest({ ...SUBJECT, requestType: 'objection' });
  verifyHelper(h, req.id);
  const out = h.processObjection(req.id);
  assert.equal(out.optOut, true);
  const after = h.listRequests()[0];
  assert.equal(after.objection.optOut, true);
  assert.equal(after.objection.scope, 'direct-marketing');
});

// ---------------------------------------------------------------------------
// 20 processComplaint
// ---------------------------------------------------------------------------

test('20 processComplaint — escalates to configured DPO', () => {
  const h = mkHandler();
  const req = h.receiveRequest({ ...SUBJECT, requestType: 'complaint' });
  const out = h.processComplaint(req.id);
  assert.equal(out.dpo.id, 'dpo_01');
  assert.equal(out.dpo.name, 'עדי לוי');
  assert.match(out.labels.he, /ממונה/);
  assert.equal(h.listRequests()[0].status, REQUEST_STATUS.ESCALATED);
});

// ---------------------------------------------------------------------------
// 21 statutoryDeadline — every type 30 / 60
// ---------------------------------------------------------------------------

test('21 statutoryDeadline — every type returns 30 / 60 days', () => {
  const h = mkHandler();
  for (const key of Object.keys(REQUEST_TYPES)) {
    const dl = h.statutoryDeadline(key);
    assert.equal(dl.standard, 30, `${key} standard`);
    assert.equal(dl.complex, 60, `${key} complex`);
  }
  assert.throws(() => h.statutoryDeadline('bogus'), /unknown requestType/);
});

// ---------------------------------------------------------------------------
// 22 markComplex
// ---------------------------------------------------------------------------

test('22 markComplex — extends deadline and requires written justification', () => {
  const h = mkHandler();
  const req = h.receiveRequest({ ...SUBJECT, requestType: 'access' });
  assert.throws(() => h.markComplex(req.id), /written justification/);
  const out = h.markComplex(req.id, 'scope spans 6 source systems — 30d insufficient');
  const dl = new Date(out.deadline);
  assert.equal(Math.round((dl - FIXED_NOW) / 86400000), 60);
});

// ---------------------------------------------------------------------------
// 23 generateResponse — bilingual letter
// ---------------------------------------------------------------------------

test('23 generateResponse — bilingual HE + EN with all required sections', () => {
  const h = mkHandler();
  mockSources(h);
  const req = h.receiveRequest({ ...SUBJECT, requestType: 'access' });
  verifyHelper(h, req.id);
  h.processAccessRequest(req.id);
  const resp = h.generateResponse(req.id);
  // Hebrew section
  assert.match(resp.he, /לכבוד יוסי ישראלי/);
  assert.match(resp.he, /תיקון 13/);
  assert.match(resp.he, /ממונה הגנה על מידע|עדי לוי/);
  // English section
  assert.match(resp.en, /Dear יוסי ישראלי/);
  assert.match(resp.en, /Amendment 13/);
  assert.match(resp.en, /Data Protection Officer|עדי לוי/);
  assert.match(resp.hash, /^[0-9a-f]{64}$/);
});

// ---------------------------------------------------------------------------
// 24 breachNotification — critical → 72h authority
// ---------------------------------------------------------------------------

test('24 breachNotification — critical severity → 72h authority deadline', () => {
  const h = mkHandler();
  const breach = h.breachNotification({
    incidentId: 'inc_001',
    affectedSubjects: ['123456782', '987654321'],
    severity: BREACH_SEVERITY.CRITICAL,
    discoveredAt: '2026-04-11T10:00:00.000Z',
    description: 'ransomware on customer DB',
  });
  assert.equal(breach.isMaterial, true);
  assert.equal(breach.authorityNotification.required, true);
  assert.equal(breach.authorityNotification.hours, 72);
  const dl = new Date(breach.authorityNotification.deadline);
  const discovered = new Date(breach.discoveredAt);
  assert.equal((dl - discovered) / 3600000, 72);
  assert.equal(breach.affectedCount, 2);
  // subjects stored as hashes + last4 only
  assert.match(breach.affectedSubjects[0].subjectHash, /^[0-9a-f]{64}$/);
  assert.equal(breach.affectedSubjects[0].last4, '6782');
  assert.equal(breach.status, 'pending_authority_notice');
  assert.match(breach.legalBasis.he, /תיקון 13/);
});

// ---------------------------------------------------------------------------
// 25 breachNotification — low severity does NOT trigger notification
// ---------------------------------------------------------------------------

test('25 breachNotification — low severity → not material, no authority deadline', () => {
  const h = mkHandler();
  const breach = h.breachNotification({
    incidentId: 'inc_002',
    affectedSubjects: ['111111118'],
    severity: BREACH_SEVERITY.LOW,
    discoveredAt: FIXED_NOW,
  });
  assert.equal(breach.isMaterial, false);
  assert.equal(breach.authorityNotification.required, false);
  assert.equal(breach.subjectNotification.required, false);
  assert.equal(breach.status, 'logged');
});

// ---------------------------------------------------------------------------
// 26 auditLog — SHA-256 chain integrity + tamper detection
// ---------------------------------------------------------------------------

test('26 auditLog — chain verifies intact, detects tampering, never empty', () => {
  const h = mkHandler();
  mockSources(h);
  const req = h.receiveRequest({ ...SUBJECT, requestType: 'access' });
  verifyHelper(h, req.id);
  h.scopeRequest(req.id);
  h.processAccessRequest(req.id);
  h.generateResponse(req.id);

  const log = h.auditLog();
  assert.ok(log.length >= 5);
  // every entry has a hash and prevHash
  for (const e of log) {
    assert.match(e.hash, /^[0-9a-f]{64}$/);
    assert.match(e.prevHash, /^[0-9a-f]{64}$/);
  }
  // verifyChain returns valid
  assert.deepEqual(h.verifyChain(), { valid: true, brokenAt: -1 });

  // requestId-filtered auditLog returns only those events
  const filtered = h.auditLog(req.id);
  assert.ok(filtered.length >= 4);
  for (const e of filtered) assert.equal(e.requestId, req.id);

  // tamper detection — mutate the middle entry's payload
  h._auditChain[2].payload = { tampered: true };
  const res = h.verifyChain();
  assert.equal(res.valid, false);
  assert.equal(res.brokenAt, 2);
});

// ---------------------------------------------------------------------------
// 27 DPO criteria & constants sanity
// ---------------------------------------------------------------------------

test('27 DPO criteria — bilingual list with תיקון 13 triggers', () => {
  const c = DSRHandler.dpoCriteria();
  assert.ok(c.he.length >= 3);
  assert.ok(c.en.length >= 3);
  assert.ok(c.he.some(x => /100,000|מעל/.test(x)));
  assert.equal(BREACH_AUTHORITY_DEADLINE_HOURS, 72);
  // statutory retention immutability
  assert.throws(() => { STATUTORY_RETENTION.tax = { years: 1 }; }, TypeError);
  assert.throws(() => { DEADLINE_DAYS.access = { standard: 1, complex: 2 }; }, TypeError);
});

// ---------------------------------------------------------------------------
// 28 process* called without verification → throws
// ---------------------------------------------------------------------------

test('28 processAccessRequest — throws if identity not verified', () => {
  const h = mkHandler();
  const req = h.receiveRequest({ ...SUBJECT, requestType: 'access' });
  assert.throws(
    () => h.processAccessRequest(req.id),
    /not verified/
  );
});
