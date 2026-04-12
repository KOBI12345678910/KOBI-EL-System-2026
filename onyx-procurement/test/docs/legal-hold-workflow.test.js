/**
 * Legal Hold Workflow — Unit Tests  |  מבחני מנוע ההקפאה המשפטית
 * =====================================================================
 *
 * Agent Y-115  |  Swarm Documents  |  Techno-Kol Uzi mega-ERP
 *
 * Run with:   node --test test/docs/legal-hold-workflow.test.js
 *      or:    node --test
 *
 * Covers:
 *   1.  initiateHold — happy path
 *   2.  initiateHold — validation
 *   3.  sendCustodianNotice — bilingual template
 *   4.  sendCustodianNotice — default Hebrew
 *   5.  trackAcknowledgment — append-only
 *   6.  trackAcknowledgment — all-custodians advances state
 *   7.  scopeDocuments — matches filter + keywords + date range
 *   8.  scopeDocuments — marks docs & freezes them
 *   9.  freezeDocument — idempotent reaffirm
 *  10.  assertMutable — blocks modification on frozen docs
 *  11.  collectForProduction — manifest + SHA-256 checksums
 *  12.  collectForProduction — rejects invalid format
 *  13.  releaseHold — status flip, records retained
 *  14.  releaseHold — requires justification + approver
 *  15.  escalation — triggers after 7 days of no ack
 *  16.  escalation — does NOT escalate acknowledged custodians
 *  17.  inProgressHolds — excludes released holds
 *  18.  reportToCourt — bilingual output + checksum
 *  19.  chainOfCustody — full trail ordering
 *  20.  event log append-only ordering
 *  21.  glossary presence (Hebrew + English)
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LegalHoldWorkflow,
  STATUS_LABELS,
  HEBREW_GLOSSARY,
  ACK_DEADLINE_DAYS,
} = require('../../src/docs/legal-hold-workflow.js');

/* ---------- Fixtures ---------- */

function makeDocStore(docs) {
  const store = new Map();
  for (const d of docs) store.set(d.docId, { ...d });
  return {
    findAll() { return Array.from(store.values()); },
    get(docId) { return store.get(docId) || null; },
    getRaw(docId) { return store.get(docId) || null; },
    markHold(docId, v, holdId) {
      const d = store.get(docId);
      if (d) { d.legalHold = !!v; d.legalHoldId = holdId; }
    },
  };
}

function sampleDocs() {
  return [
    {
      docId: 'd1',
      title: 'Purchase Order 2025-01 — Project Alpha',
      content: 'Supplier contract for Project Alpha. Keywords: alpha procurement.',
      docType: 'PO',
      department: 'procurement',
      owner: 'moshe',
      tags: ['alpha', 'po'],
      createdAt: '2025-06-01T10:00:00Z',
    },
    {
      docId: 'd2',
      title: 'Invoice INV-5521',
      content: 'Invoice concerning Project Alpha delivery.',
      docType: 'invoice',
      department: 'finance',
      owner: 'rachel',
      tags: ['alpha'],
      createdAt: '2025-07-14T12:00:00Z',
    },
    {
      docId: 'd3',
      title: 'HR Policy Memo',
      content: 'Internal HR memo — nothing about project alpha.',
      docType: 'memo',
      department: 'hr',
      owner: 'dana',
      tags: ['hr'],
      createdAt: '2025-08-01T09:00:00Z',
    },
    {
      docId: 'd4',
      title: 'Legacy 2019 contract',
      content: 'Old project alpha contract out of scope.',
      docType: 'contract',
      department: 'procurement',
      owner: 'moshe',
      tags: ['alpha', 'legacy'],
      createdAt: '2019-02-01T09:00:00Z',
    },
  ];
}

function freshHold(engine, custodians) {
  return engine.initiateHold({
    caseId: 'C-2026-001',
    court: 'בית המשפט המחוזי תל אביב',
    caseTitle: 'Project Alpha Litigation',
    matter: 'Breach of contract',
    custodians: custodians || [
      { custodianId: 'u-moshe', name: 'Moshe Levi', lang: 'he' },
      { custodianId: 'u-rachel', name: 'Rachel Cohen', lang: 'en' },
    ],
    scopeFilter: { department: 'procurement' },
    keywords: ['alpha'],
    dateRange: { from: '2025-01-01T00:00:00Z', to: '2025-12-31T23:59:59Z' },
  });
}

/* ---------- Tests ---------- */

test('01 initiateHold — happy path returns holdId and initiated status', () => {
  const engine = new LegalHoldWorkflow();
  const res = freshHold(engine);
  assert.ok(res.holdId && res.holdId.startsWith('hold_'));
  assert.equal(res.status, 'initiated');
  assert.equal(res.custodianCount, 2);
  assert.deepEqual(res.statusLabel, STATUS_LABELS.initiated);
  assert.equal(engine.holdCount(), 1);
});

test('02 initiateHold — validation errors', () => {
  const engine = new LegalHoldWorkflow();
  assert.throws(
    () => engine.initiateHold({ caseId: '', court: 'c', caseTitle: 't' }),
    /INVALID_INPUT.*caseId/,
  );
  assert.throws(
    () => engine.initiateHold({ caseId: 'c', court: '', caseTitle: 't' }),
    /INVALID_INPUT.*court/,
  );
  assert.throws(
    () => engine.initiateHold({ caseId: 'c', court: 'c', caseTitle: '' }),
    /INVALID_INPUT.*caseTitle/,
  );
});

test('03 sendCustodianNotice — bilingual letter + ack request', () => {
  const engine = new LegalHoldWorkflow();
  const { holdId } = freshHold(engine);
  const res = engine.sendCustodianNotice({
    holdId, custodianId: 'u-moshe', lang: 'he',
  });
  assert.ok(res.noticeId.startsWith('notice_'));
  assert.ok(res.subject.he.includes('הקפאה משפטית'));
  assert.ok(res.subject.en.includes('Legal Hold Notice'));
  assert.ok(res.body.he.includes('הודעת הקפאה משפטית'));
  assert.ok(res.body.en.includes('Legal Hold Notice'));
  assert.ok(res.body.he.includes(holdId));
  assert.equal(res.ackRequest.deadlineDays, ACK_DEADLINE_DAYS);
  assert.ok(res.ackRequest.he.length > 0);
  assert.ok(res.ackRequest.en.length > 0);
  const hold = engine.getHold(holdId);
  assert.equal(hold.status, 'noticed');
});

test('04 sendCustodianNotice — default Hebrew preferred body', () => {
  const engine = new LegalHoldWorkflow();
  const { holdId } = freshHold(engine);
  const heRes = engine.sendCustodianNotice({ holdId, custodianId: 'u-moshe' });
  assert.equal(heRes.preferred, heRes.body.he);
  const enRes = engine.sendCustodianNotice({
    holdId, custodianId: 'u-rachel', lang: 'en',
  });
  assert.equal(enRes.preferred, enRes.body.en);
});

test('05 trackAcknowledgment — append-only ack record', () => {
  const engine = new LegalHoldWorkflow();
  const { holdId } = freshHold(engine);
  engine.sendCustodianNotice({ holdId, custodianId: 'u-moshe' });
  const ack = engine.trackAcknowledgment({
    holdId, custodianId: 'u-moshe',
    acknowledged: true, notes: 'Received via email',
  });
  assert.ok(ack.ackId.startsWith('ack_'));
  assert.equal(ack.acknowledged, true);
  assert.equal(ack.status, 'acknowledged');
  const stored = engine.getAck(ack.ackId);
  assert.ok(stored);
  assert.equal(stored.notes, 'Received via email');
  // immutability of the stored record
  assert.throws(() => { stored.acknowledged = false; }, TypeError);
});

test('06 trackAcknowledgment — all custodians ack advances hold', () => {
  const engine = new LegalHoldWorkflow();
  const { holdId } = freshHold(engine);
  engine.sendCustodianNotice({ holdId, custodianId: 'u-moshe' });
  engine.sendCustodianNotice({ holdId, custodianId: 'u-rachel' });
  engine.trackAcknowledgment({ holdId, custodianId: 'u-moshe', acknowledged: true });
  assert.equal(engine.getHold(holdId).status, 'noticed');
  engine.trackAcknowledgment({ holdId, custodianId: 'u-rachel', acknowledged: true });
  assert.equal(engine.getHold(holdId).status, 'acknowledged');
});

test('07 scopeDocuments — filter + keywords + date range match', () => {
  const engine = new LegalHoldWorkflow();
  const { holdId } = freshHold(engine);
  const store = makeDocStore(sampleDocs());
  const res = engine.scopeDocuments(holdId, store);
  // d1 matches (procurement + alpha + in range);
  // d2 is finance, rejected by dept filter;
  // d3 is hr + no alpha;
  // d4 is procurement + alpha but OUT of date range
  assert.deepEqual(res.docIds.sort(), ['d1']);
  assert.equal(res.matchedCount, 1);
  assert.equal(engine.getHold(holdId).status, 'scoped');
});

test('08 scopeDocuments — matched docs marked legalHold and frozen', () => {
  const engine = new LegalHoldWorkflow();
  const { holdId } = freshHold(engine);
  const store = makeDocStore(sampleDocs());
  engine.scopeDocuments(holdId, store);
  const d1 = store.get('d1');
  assert.equal(d1.legalHold, true);
  assert.equal(d1.legalHoldId, holdId);
  assert.equal(engine.frozenCountFor(holdId), 1);
});

test('09 freezeDocument — idempotent reaffirm', () => {
  const engine = new LegalHoldWorkflow();
  const { holdId } = freshHold(engine);
  const first  = engine.freezeDocument(holdId, 'dX', { source: 'manual' });
  const second = engine.freezeDocument(holdId, 'dX', { source: 'manual' });
  assert.equal(first.frozenAt, second.frozenAt);
  assert.equal(engine.frozenCountFor(holdId), 1);
  // A reaffirm event must have been logged
  const events = engine.listEvents();
  assert.ok(events.some(e => e.type === 'freeze.reaffirm'));
});

test('10 assertMutable — blocks modification on frozen docs', () => {
  const engine = new LegalHoldWorkflow();
  const { holdId } = freshHold(engine);
  engine.freezeDocument(holdId, 'dX');
  assert.throws(
    () => engine.assertMutable('dX', 'delete', 'user1'),
    err => err.code === 'HOLD_IMMUTABLE',
  );
  // A non-frozen doc passes
  assert.equal(engine.assertMutable('dY', 'write', 'user1'), true);
  // The blocked attempt appears in chain of custody
  const trail = engine.chainOfCustody('dX');
  assert.ok(trail.entries.some(e => e.action === 'blocked:delete'));
});

test('11 collectForProduction — manifest + per-doc SHA-256 + manifestChecksum', () => {
  const engine = new LegalHoldWorkflow();
  const { holdId } = freshHold(engine);
  const store = makeDocStore(sampleDocs());
  engine.scopeDocuments(holdId, store);
  const manifest = engine.collectForProduction(holdId, { format: 'PDF', docStore: store });
  assert.equal(manifest.format, 'PDF');
  assert.equal(manifest.entryCount, 1);
  assert.equal(manifest.entries.length, 1);
  const entry = manifest.entries[0];
  assert.equal(entry.docId, 'd1');
  assert.equal(entry.checksumAlgo, 'SHA-256');
  assert.match(entry.checksum, /^[a-f0-9]{64}$/);
  assert.match(manifest.manifestChecksum, /^[a-f0-9]{64}$/);
  assert.equal(engine.getHold(holdId).status, 'collected');
});

test('12 collectForProduction — rejects invalid format', () => {
  const engine = new LegalHoldWorkflow();
  const { holdId } = freshHold(engine);
  assert.throws(
    () => engine.collectForProduction(holdId, { format: 'xml' }),
    /INVALID_INPUT.*format/,
  );
});

test('13 releaseHold — preserves notices, acks, frozen docs, collections', () => {
  const engine = new LegalHoldWorkflow();
  const { holdId } = freshHold(engine);
  engine.sendCustodianNotice({ holdId, custodianId: 'u-moshe' });
  engine.trackAcknowledgment({ holdId, custodianId: 'u-moshe', acknowledged: true });
  const store = makeDocStore(sampleDocs());
  engine.scopeDocuments(holdId, store);
  engine.collectForProduction(holdId, { format: 'native', docStore: store });
  const noticesBefore    = engine._countForHold(engine._notices, holdId);
  const acksBefore       = engine._countForHold(engine._acks, holdId);
  const frozenBefore     = engine.frozenCountFor(holdId);
  const collectionsBefore = engine.getHold(holdId).collections.length;

  const rel = engine.releaseHold(holdId, 'Case dismissed by court', 'gen-counsel-01');
  assert.equal(rel.status, 'released');
  assert.equal(rel.preserved, true);
  assert.equal(rel.retainedRecords.notices,    noticesBefore);
  assert.equal(rel.retainedRecords.acks,       acksBefore);
  assert.equal(rel.retainedRecords.frozenDocs, frozenBefore);
  assert.equal(rel.retainedRecords.collections, collectionsBefore);

  // After release, notices and acks are STILL in the maps
  assert.equal(engine._countForHold(engine._notices, holdId), noticesBefore);
  assert.equal(engine._countForHold(engine._acks, holdId), acksBefore);
  assert.equal(engine.frozenCountFor(holdId), frozenBefore);
});

test('14 releaseHold — requires justification and approver', () => {
  const engine = new LegalHoldWorkflow();
  const { holdId } = freshHold(engine);
  assert.throws(() => engine.releaseHold(holdId, '', 'approver'), /justification/);
  assert.throws(() => engine.releaseHold(holdId, 'just', ''), /approver/);
});

test('15 escalation — triggers after 7 days of no ack', () => {
  let t = new Date('2026-01-01T09:00:00Z').getTime();
  const engine = new LegalHoldWorkflow({ now: () => t });
  const { holdId } = freshHold(engine);
  engine.sendCustodianNotice({ holdId, custodianId: 'u-moshe' });
  engine.sendCustodianNotice({ holdId, custodianId: 'u-rachel' });
  // advance 8 days
  t += 8 * 24 * 60 * 60 * 1000;
  const res = engine.escalation(holdId);
  assert.equal(res.escalatedCount, 2);
  assert.deepEqual(res.escalated.sort(), ['u-moshe', 'u-rachel']);
  assert.equal(res.thresholdDays, ACK_DEADLINE_DAYS);
});

test('16 escalation — skips already-acknowledged custodians', () => {
  let t = new Date('2026-01-01T09:00:00Z').getTime();
  const engine = new LegalHoldWorkflow({ now: () => t });
  const { holdId } = freshHold(engine);
  engine.sendCustodianNotice({ holdId, custodianId: 'u-moshe' });
  engine.sendCustodianNotice({ holdId, custodianId: 'u-rachel' });
  engine.trackAcknowledgment({
    holdId, custodianId: 'u-moshe', acknowledged: true, timestamp: t,
  });
  t += 8 * 24 * 60 * 60 * 1000;
  const res = engine.escalation(holdId);
  assert.equal(res.escalatedCount, 1);
  assert.deepEqual(res.escalated, ['u-rachel']);
});

test('17 inProgressHolds — excludes released holds', () => {
  const engine = new LegalHoldWorkflow();
  const a = freshHold(engine);
  const b = freshHold(engine);
  assert.equal(engine.inProgressHolds().length, 2);
  engine.releaseHold(a.holdId, 'closed', 'approver');
  const active = engine.inProgressHolds();
  assert.equal(active.length, 1);
  assert.equal(active[0].holdId, b.holdId);
});

test('18 reportToCourt — Hebrew + English report with checksum', () => {
  const engine = new LegalHoldWorkflow();
  const { holdId } = freshHold(engine);
  const store = makeDocStore(sampleDocs());
  engine.scopeDocuments(holdId, store);
  engine.collectForProduction(holdId, { format: 'image', docStore: store });
  const r = engine.reportToCourt(holdId);
  assert.ok(r.he.includes('דו"ח הקפאה משפטית'));
  assert.ok(r.he.includes(engine.getHold(holdId).caseId));
  assert.ok(r.en.includes('Legal Hold Report'));
  assert.ok(r.en.includes('Project Alpha Litigation'));
  assert.match(r.reportChecksum, /^[a-f0-9]{64}$/);
  assert.equal(r.core.collections.length, 1);
  assert.equal(r.core.frozenCount, 1);
});

test('19 chainOfCustody — full trail ordering + manifest refs', () => {
  const engine = new LegalHoldWorkflow();
  const { holdId } = freshHold(engine);
  engine.freezeDocument(holdId, 'dZ');
  engine.recordAccess('dZ', { actor: 'lawyer1', op: 'read', reason: 'discovery' });
  engine.recordAccess('dZ', { actor: 'paralegal', op: 'view', reason: 'review' });
  const fakeStore = {
    findAll: () => [],
    get: () => null,
    getRaw: () => 'payload-bytes',
  };
  // manually tie dZ to a collection — collect freezes only current holdId
  engine.collectForProduction(holdId, { format: 'native', docStore: fakeStore });
  const trail = engine.chainOfCustody('dZ');
  assert.ok(trail.entryCount >= 4); // freeze, read, view, collect
  const actions = trail.entries.map(e => e.action);
  assert.equal(actions[0], 'freeze');
  assert.ok(actions.includes('read'));
  assert.ok(actions.includes('view'));
  assert.ok(actions.includes('collect'));
  assert.deepEqual(trail.holdIds, [holdId]);
  assert.equal(trail.manifestRefs.length, 1);
  assert.match(trail.trailHash, /^[a-f0-9]{64}$/);
});

test('20 event log — append-only monotonic sequence', () => {
  const engine = new LegalHoldWorkflow();
  const { holdId } = freshHold(engine);
  engine.sendCustodianNotice({ holdId, custodianId: 'u-moshe' });
  engine.trackAcknowledgment({ holdId, custodianId: 'u-moshe', acknowledged: true });
  engine.freezeDocument(holdId, 'd1');
  const events = engine.listEvents();
  assert.ok(events.length >= 4);
  for (let i = 1; i < events.length; i++) {
    assert.equal(events[i].seq, events[i - 1].seq + 1);
  }
  // event records are frozen
  assert.throws(() => { events[0].seq = 999; }, TypeError);
});

test('21 glossary — Hebrew + English terms present', () => {
  assert.ok(HEBREW_GLOSSARY.length >= 10);
  for (const term of HEBREW_GLOSSARY) {
    assert.ok(term.he && term.he.length > 0);
    assert.ok(term.en && term.en.length > 0);
  }
  // spot-check core terms
  const englishTerms = HEBREW_GLOSSARY.map(t => t.en);
  assert.ok(englishTerms.includes('legal hold'));
  assert.ok(englishTerms.includes('custodian'));
  assert.ok(englishTerms.includes('chain of custody'));
  assert.ok(englishTerms.includes('checksum (SHA-256)'));
});
