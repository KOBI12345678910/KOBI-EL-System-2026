/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Retention Enforcer — test suite
 * ═══════════════════════════════════════════════════════════════════════════
 *  Agent Y-137  |  Techno-Kol Uzi mega-ERP  |  2026-04-11
 *  Onyx-Procurement / test / privacy / retention-enforcer.test.js
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Run:
 *     node --test test/privacy/retention-enforcer.test.js
 *
 *  Uses only node:test + node:assert — zero external deps.
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RetentionEnforcer,
  ARCHIVAL_METHOD,
  RECORD_STATUS,
  EVENTS,
  DEFAULT_CATEGORIES,
} = require('../../src/privacy/retention-enforcer');

// ───────────────────────────────────────────────────────────────────────────
//  Fixtures / helpers
// ───────────────────────────────────────────────────────────────────────────

const FIXED_NOW = '2026-04-11T12:00:00.000Z';

function makeEnforcer(now = FIXED_NOW, opts = {}) {
  return new RetentionEnforcer({ now, ...opts });
}

function yearsAgo(n, from = FIXED_NOW) {
  const d = new Date(from);
  d.setUTCFullYear(d.getUTCFullYear() - n);
  return d.toISOString();
}

function daysAgo(n, from = FIXED_NOW) {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

// ───────────────────────────────────────────────────────────────────────────
//  1 — policy definition
// ───────────────────────────────────────────────────────────────────────────

test('01 — definePolicy creates and returns an immutable policy', () => {
  const e = makeEnforcer();
  const policy = e.definePolicy({
    id: 'tax-custom',
    category: 'tax-custom',
    retentionDays: 365 * 7,
    purpose: 'Custom tax retention',
    legalBasis_he: 'פקודת מס הכנסה',
    legalBasis_en: 'Income Tax Ordinance',
    archivalMethod: ARCHIVAL_METHOD.COLD_STORAGE,
  });
  assert.equal(policy.id, 'tax-custom');
  assert.equal(policy.retentionDays, 2555);
  assert.equal(policy.archivalMethod, 'cold-storage');
  assert.ok(Object.isFrozen(policy));
  assert.throws(() => {
    policy.retentionDays = 1;
  });
});

test('02 — definePolicy validates inputs strictly', () => {
  const e = makeEnforcer();
  assert.throws(
    () => e.definePolicy({}),
    /policy\.id must be a non-empty string/
  );
  assert.throws(
    () =>
      e.definePolicy({
        id: 'x',
        category: 'y',
        retentionDays: -1,
        purpose: 'p',
        legalBasis_he: 'h',
        legalBasis_en: 'e',
        archivalMethod: 'cold-storage',
      }),
    /retentionDays must be a positive integer/
  );
  assert.throws(
    () =>
      e.definePolicy({
        id: 'x',
        category: 'y',
        retentionDays: 30,
        purpose: 'p',
        legalBasis_he: 'h',
        legalBasis_en: 'e',
        archivalMethod: 'hard-delete',
      }),
    /archivalMethod must be one of/
  );
});

test('03 — Israeli-law defaults are seeded (tax 7y, medical 10y, construction 25y)', () => {
  const e = makeEnforcer();
  const tax = e.policyForCategory('tax');
  const medical = e.policyForCategory('medical');
  const construction = e.policyForCategory('construction');
  assert.ok(tax, 'tax policy seeded');
  assert.equal(tax.retentionDays, 7 * 365);
  assert.equal(tax.legalBasis_he, 'פקודת מס הכנסה');
  assert.ok(medical);
  assert.equal(medical.retentionDays, 10 * 365);
  assert.ok(construction);
  assert.equal(construction.retentionDays, 25 * 365);
});

// ───────────────────────────────────────────────────────────────────────────
//  2 — classification
// ───────────────────────────────────────────────────────────────────────────

test('04 — classifyRecord assigns policy and computes expiresAt correctly', () => {
  const e = makeEnforcer();
  const cls = e.classifyRecord({
    recordId: 'inv-001',
    category: 'tax',
    createdAt: '2020-01-01T00:00:00.000Z',
  });
  assert.equal(cls.recordId, 'inv-001');
  assert.equal(cls.category, 'tax');
  assert.equal(cls.status, RECORD_STATUS.LIVE);
  const expires = new Date(cls.expiresAt);
  const expected = new Date('2020-01-01T00:00:00.000Z');
  expected.setUTCDate(expected.getUTCDate() + 7 * 365);
  assert.equal(expires.toISOString(), expected.toISOString());
});

test('05 — classifyRecord rejects unknown category', () => {
  const e = makeEnforcer();
  assert.throws(
    () =>
      e.classifyRecord({
        recordId: 'x',
        category: 'nonexistent',
        createdAt: FIXED_NOW,
      }),
    /no policy defined for category/
  );
});

// ───────────────────────────────────────────────────────────────────────────
//  3 — scanDue
// ───────────────────────────────────────────────────────────────────────────

test('06 — scanDue finds only expired records', () => {
  const e = makeEnforcer();
  // marketing policy = 2 years
  e.classifyRecord({
    recordId: 'mkt-old',
    category: 'marketing',
    createdAt: yearsAgo(3), // expired
  });
  e.classifyRecord({
    recordId: 'mkt-new',
    category: 'marketing',
    createdAt: yearsAgo(1), // still live
  });
  const due = e.scanDue(FIXED_NOW);
  const ids = due.map((d) => d.recordId);
  assert.ok(ids.includes('mkt-old'));
  assert.ok(!ids.includes('mkt-new'));
});

test('07 — scanDue filters by category', () => {
  const e = makeEnforcer();
  e.classifyRecord({
    recordId: 'tax-old',
    category: 'tax',
    createdAt: yearsAgo(10),
  });
  e.classifyRecord({
    recordId: 'mkt-old',
    category: 'marketing',
    createdAt: yearsAgo(5),
  });
  const taxOnly = e.scanDue(FIXED_NOW, { category: 'tax' });
  assert.equal(taxOnly.length, 1);
  assert.equal(taxOnly[0].recordId, 'tax-old');
});

test('08 — scanDue respects legal hold (NEVER returns held records)', () => {
  const e = makeEnforcer();
  e.classifyRecord({
    recordId: 'hr-old',
    category: 'hr',
    createdAt: yearsAgo(8),
  });
  // before hold: due
  assert.equal(e.scanDue(FIXED_NOW).length, 1);
  e.legalHoldOverride('hr-old', {
    reason: 'pending litigation',
    placedBy: 'legal@company.co.il',
    matterId: 'MATTER-42',
  });
  // after hold: not due
  const due = e.scanDue(FIXED_NOW);
  assert.equal(due.length, 0);
  assert.ok(e.isOnLegalHold('hr-old'));
});

// ───────────────────────────────────────────────────────────────────────────
//  4 — dryRun
// ───────────────────────────────────────────────────────────────────────────

test('09 — dryRun previews without mutating any state', () => {
  const e = makeEnforcer();
  e.classifyRecord({
    recordId: 'mkt-1',
    category: 'marketing',
    createdAt: yearsAgo(5),
  });
  e.classifyRecord({
    recordId: 'mkt-2',
    category: 'marketing',
    createdAt: yearsAgo(5),
  });
  const snapshotBefore = {
    auditSize: e.auditEvents().length,
    ledgerSize: e.tombstoneLedger().length,
    status1: e.getClassification('mkt-1').status,
    status2: e.getClassification('mkt-2').status,
  };
  const preview = e.dryRun(FIXED_NOW);
  assert.equal(preview.totalDue, 2);
  assert.equal(preview.mutated, false);
  assert.equal(preview.note_he, 'תצוגה מקדימה בלבד — לא בוצעה שום פעולה');
  // nothing changed
  assert.equal(e.auditEvents().length, snapshotBefore.auditSize);
  assert.equal(e.tombstoneLedger().length, snapshotBefore.ledgerSize);
  assert.equal(
    e.getClassification('mkt-1').status,
    snapshotBefore.status1
  );
  assert.equal(
    e.getClassification('mkt-2').status,
    snapshotBefore.status2
  );
});

test('10 — dryRun totals per method and per category', () => {
  const e = makeEnforcer();
  e.definePolicy({
    id: 'p-short-tomb',
    category: 'short-tomb',
    retentionDays: 10,
    purpose: 'test',
    legalBasis_he: 'בדיקה',
    legalBasis_en: 'Test',
    archivalMethod: ARCHIVAL_METHOD.TOMBSTONE,
  });
  e.classifyRecord({
    recordId: 'r-tomb',
    category: 'short-tomb',
    createdAt: daysAgo(30),
  });
  e.classifyRecord({
    recordId: 'r-mkt',
    category: 'marketing',
    createdAt: yearsAgo(5),
  });
  const preview = e.dryRun(FIXED_NOW);
  assert.equal(preview.totalDue, 2);
  assert.equal(preview.perMethod['tombstone'], 1);
  assert.equal(preview.perMethod['cold-storage'], 1);
  assert.equal(preview.perCategory['short-tomb'], 1);
  assert.equal(preview.perCategory['marketing'], 1);
});

// ───────────────────────────────────────────────────────────────────────────
//  5 — enforceArchive + events
// ───────────────────────────────────────────────────────────────────────────

test('11 — enforceArchive emits event and flips status WITHOUT hard delete', () => {
  const e = makeEnforcer();
  e.classifyRecord({
    recordId: 'mkt-arch',
    category: 'marketing',
    createdAt: yearsAgo(5),
  });
  const events = [];
  e.on(EVENTS.RECORD_ARCHIVED, (evt) => events.push(evt));
  const result = e.enforceArchive('mkt-arch', {
    method: ARCHIVAL_METHOD.COLD_STORAGE,
    approvedBy: 'dpo@company.co.il',
  });
  assert.equal(result.method, 'cold-storage');
  assert.equal(result.hardDeleted, false);
  assert.ok(result.coldStorageRef.startsWith('cold_'));
  assert.equal(
    e.getClassification('mkt-arch').status,
    RECORD_STATUS.ARCHIVED
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].archive.recordId, 'mkt-arch');
  // record still exists in the Map — proof we did NOT hard delete
  assert.ok(e.getClassification('mkt-arch') !== null);
});

test('12 — enforceArchive refuses to archive records on legal hold', () => {
  const e = makeEnforcer();
  e.classifyRecord({
    recordId: 'litigated',
    category: 'hr',
    createdAt: yearsAgo(10),
  });
  e.legalHoldOverride('litigated', {
    reason: 'regulatory audit',
    placedBy: 'counsel',
  });
  assert.throws(
    () =>
      e.enforceArchive('litigated', {
        method: ARCHIVAL_METHOD.COLD_STORAGE,
        approvedBy: 'ops',
      }),
    /legal hold/
  );
  // status must remain legal_hold
  assert.equal(
    e.getClassification('litigated').status,
    RECORD_STATUS.LEGAL_HOLD
  );
});

test('13 — enforceArchive with pseudonymize sets the right state', () => {
  const e = makeEnforcer();
  e.definePolicy({
    id: 'p-pseudo',
    category: 'pseudo',
    retentionDays: 10,
    purpose: 'PII retention',
    legalBasis_he: 'חוק הגנת הפרטיות',
    legalBasis_en: 'Privacy Law',
    archivalMethod: ARCHIVAL_METHOD.PSEUDONYMIZE,
  });
  e.classifyRecord({
    recordId: 'user-42',
    category: 'pseudo',
    createdAt: daysAgo(30),
  });
  const events = [];
  e.on(EVENTS.RECORD_PSEUDONYMIZED, (evt) => events.push(evt));
  const result = e.enforceArchive('user-42');
  assert.equal(result.method, 'pseudonymize');
  assert.equal(
    e.getClassification('user-42').status,
    RECORD_STATUS.PSEUDONYMIZED
  );
  assert.equal(events.length, 1);
  assert.ok(result.pseudonymousTag.startsWith('u***'));
});

test('14 — enforceArchive with tombstone appends to the ledger', () => {
  const e = makeEnforcer();
  e.definePolicy({
    id: 'p-tomb',
    category: 'tomb-cat',
    retentionDays: 10,
    purpose: 'Tombstone test',
    legalBasis_he: 'בדיקה',
    legalBasis_en: 'Test',
    archivalMethod: ARCHIVAL_METHOD.TOMBSTONE,
  });
  e.classifyRecord({
    recordId: 'gone-1',
    category: 'tomb-cat',
    createdAt: daysAgo(30),
  });
  const before = e.tombstoneLedger().length;
  const events = [];
  e.on(EVENTS.RECORD_TOMBSTONED, (evt) => events.push(evt));
  const result = e.enforceArchive('gone-1');
  assert.equal(result.method, 'tombstone');
  assert.equal(e.tombstoneLedger().length, before + 1);
  assert.equal(result.tombstoneSeq, before);
  assert.equal(events.length, 1);
  assert.equal(
    e.getClassification('gone-1').status,
    RECORD_STATUS.TOMBSTONED
  );
  // record still exists — no hard delete
  assert.ok(e.getClassification('gone-1') !== null);
});

// ───────────────────────────────────────────────────────────────────────────
//  6 — legal hold
// ───────────────────────────────────────────────────────────────────────────

test('15 — legalHoldOverride places and releaseLegalHold releases the hold', () => {
  const e = makeEnforcer();
  e.classifyRecord({
    recordId: 'hr-1',
    category: 'hr',
    createdAt: yearsAgo(10),
  });
  const placed = [];
  const released = [];
  e.on(EVENTS.HOLD_PLACED, (evt) => placed.push(evt));
  e.on(EVENTS.HOLD_RELEASED, (evt) => released.push(evt));
  e.legalHoldOverride('hr-1', {
    reason: 'Labor court case 12345',
    placedBy: 'legal',
    matterId: 'CASE-12345',
  });
  assert.equal(placed.length, 1);
  assert.equal(placed[0].hold.matterId, 'CASE-12345');
  assert.ok(e.isOnLegalHold('hr-1'));
  // release
  e.releaseLegalHold('hr-1', {
    reason: 'case dismissed',
    releasedBy: 'legal',
  });
  assert.equal(released.length, 1);
  assert.equal(e.isOnLegalHold('hr-1'), false);
  // now it's live again and can be scanned
  const due = e.scanDue(FIXED_NOW);
  assert.equal(due.length, 1);
  assert.equal(due[0].recordId, 'hr-1');
});

test('16 — releaseLegalHold throws if no hold exists', () => {
  const e = makeEnforcer();
  assert.throws(
    () => e.releaseLegalHold('nonexistent', { reason: 'x', releasedBy: 'y' }),
    /no legal hold/
  );
});

// ───────────────────────────────────────────────────────────────────────────
//  7 — tombstone hash chain
// ───────────────────────────────────────────────────────────────────────────

test('17 — tombstone ledger is append-only with SHA-256 prevHash chain', () => {
  const e = makeEnforcer();
  e.exportTombstone('rec-a', 'obsolete 1');
  e.exportTombstone('rec-b', 'obsolete 2');
  e.exportTombstone('rec-c', 'obsolete 3');
  const ledger = e.tombstoneLedger();
  assert.equal(ledger.length, 3);
  // each entry's prevHash = previous entry's hash
  assert.equal(ledger[1].prevHash, ledger[0].hash);
  assert.equal(ledger[2].prevHash, ledger[1].hash);
  // verify chain
  const verify = e.verifyTombstoneChain();
  assert.equal(verify.valid, true);
  // each entry has contentHash and note_he + note_en
  assert.ok(ledger[0].contentHash);
  assert.equal(
    ledger[0].note_he,
    'אבן זיכרון בלבד — הרשומה לא נמחקה פיזית'
  );
  assert.equal(
    ledger[0].note_en,
    'Tombstone only — record was NOT hard-deleted'
  );
  // hardDeleted must always be false
  for (const t of ledger) {
    assert.equal(t.hardDeleted, false);
  }
});

test('18 — tombstone chain detects tampering (integrity guarantee)', () => {
  const e = makeEnforcer();
  e.exportTombstone('rec-a', 'reason-a');
  e.exportTombstone('rec-b', 'reason-b');
  e.exportTombstone('rec-c', 'reason-c');
  // sanity: chain is valid
  assert.equal(e.verifyTombstoneChain().valid, true);
  // tamper with the internal ledger (using private access for the test)
  const internal = e._tombstoneLedger;
  // replace entry[1] with a tampered copy — object is frozen, replace the slot
  internal[1] = Object.freeze({
    ...internal[1],
    reason: 'TAMPERED REASON',
  });
  const verify = e.verifyTombstoneChain();
  assert.equal(verify.valid, false);
  assert.equal(verify.brokenAt, 1);
});

// ───────────────────────────────────────────────────────────────────────────
//  8 — restore
// ───────────────────────────────────────────────────────────────────────────

test('19 — restoreFromArchive un-archives with full audit', () => {
  const e = makeEnforcer();
  e.classifyRecord({
    recordId: 'mkt-restore',
    category: 'marketing',
    createdAt: yearsAgo(5),
  });
  e.enforceArchive('mkt-restore', {
    method: ARCHIVAL_METHOD.COLD_STORAGE,
    approvedBy: 'ops',
  });
  const events = [];
  e.on(EVENTS.RECORD_RESTORED, (evt) => events.push(evt));
  const result = e.restoreFromArchive(
    'mkt-restore',
    'ongoing investigation requires data',
    'dpo@company.co.il'
  );
  assert.equal(result.recordId, 'mkt-restore');
  assert.equal(result.fromStatus, RECORD_STATUS.ARCHIVED);
  assert.equal(result.toStatus, RECORD_STATUS.RESTORED);
  assert.equal(result.approver, 'dpo@company.co.il');
  assert.equal(
    e.getClassification('mkt-restore').status,
    RECORD_STATUS.RESTORED
  );
  assert.equal(events.length, 1);
});

test('20 — restoreFromArchive refuses to restore tombstoned records', () => {
  const e = makeEnforcer();
  e.definePolicy({
    id: 'p-tomb-r',
    category: 'tomb-r',
    retentionDays: 10,
    purpose: 'test',
    legalBasis_he: 'בדיקה',
    legalBasis_en: 'Test',
    archivalMethod: ARCHIVAL_METHOD.TOMBSTONE,
  });
  e.classifyRecord({
    recordId: 'tomb-rec',
    category: 'tomb-r',
    createdAt: daysAgo(30),
  });
  e.enforceArchive('tomb-rec');
  assert.throws(
    () =>
      e.restoreFromArchive('tomb-rec', 'try restore', 'dpo'),
    /cannot be restored from state tombstoned/
  );
});

// ───────────────────────────────────────────────────────────────────────────
//  9 — rollback
// ───────────────────────────────────────────────────────────────────────────

test('21 — rollbackLastBatch reverts all actions in the last batch', () => {
  const e = makeEnforcer();
  e.classifyRecord({
    recordId: 'a',
    category: 'marketing',
    createdAt: yearsAgo(5),
  });
  e.classifyRecord({
    recordId: 'b',
    category: 'marketing',
    createdAt: yearsAgo(5),
  });
  e.classifyRecord({
    recordId: 'c',
    category: 'marketing',
    createdAt: yearsAgo(5),
  });
  const batch = e.enforceBatch(['a', 'b', 'c'], { approvedBy: 'ops' });
  assert.equal(batch.actions.length, 3);
  // all archived
  assert.equal(
    e.getClassification('a').status,
    RECORD_STATUS.ARCHIVED
  );
  // rollback
  const events = [];
  e.on(EVENTS.BATCH_ROLLEDBACK, (evt) => events.push(evt));
  const rollback = e.rollbackLastBatch({
    approvedBy: 'dpo',
    reason: 'archived in error',
  });
  assert.equal(rollback.reverted.length, 3);
  // all back to live
  assert.equal(e.getClassification('a').status, RECORD_STATUS.LIVE);
  assert.equal(e.getClassification('b').status, RECORD_STATUS.LIVE);
  assert.equal(e.getClassification('c').status, RECORD_STATUS.LIVE);
  assert.equal(events.length, 1);
  // batch marked as rolledBack but still present
  const batches = e.listBatches();
  assert.equal(batches.length, 1);
  assert.equal(batches[0].rolledBack, true);
});

test('22 — rollbackLastBatch throws if there is no batch', () => {
  const e = makeEnforcer();
  assert.throws(() => e.rollbackLastBatch(), /no batch to rollback/);
});

// ───────────────────────────────────────────────────────────────────────────
//  10 — audit report
// ───────────────────────────────────────────────────────────────────────────

test('23 — auditReport returns bilingual counts per category', () => {
  const e = makeEnforcer();
  e.classifyRecord({
    recordId: 'mkt-1',
    category: 'marketing',
    createdAt: yearsAgo(5),
  });
  e.classifyRecord({
    recordId: 'mkt-2',
    category: 'marketing',
    createdAt: yearsAgo(5),
  });
  e.classifyRecord({
    recordId: 'hr-1',
    category: 'hr',
    createdAt: yearsAgo(10),
  });
  e.enforceArchive('mkt-1', { approvedBy: 'ops' });
  e.enforceArchive('mkt-2', { approvedBy: 'ops' });
  e.enforceArchive('hr-1', { approvedBy: 'ops' });
  const report = e.auditReport({
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-12-31T23:59:59.000Z',
  });
  assert.equal(report.totals.archived, 3);
  assert.equal(report.countsByCategory.marketing, 2);
  assert.equal(report.countsByCategory.hr, 1);
  assert.equal(report.countsByMethod['cold-storage'], 3);
  assert.ok(report.he.title);
  assert.ok(report.en.title);
  assert.equal(report.invariant_he, 'לא מוחקים — רק משדרגים ומגדלים');
  assert.equal(report.chainIntegrity, true);
});

test('24 — auditReport period filters events outside the window', () => {
  const e = makeEnforcer();
  e.classifyRecord({
    recordId: 'r1',
    category: 'marketing',
    createdAt: yearsAgo(5),
  });
  e.enforceArchive('r1', { approvedBy: 'ops' });
  // narrow window in the past — should exclude all
  const past = e.auditReport({
    from: '2020-01-01T00:00:00.000Z',
    to: '2020-12-31T00:00:00.000Z',
  });
  assert.equal(past.totals.archived, 0);
  assert.equal(past.totals.classified, 0);
});

// ───────────────────────────────────────────────────────────────────────────
//  11 — chain integrity
// ───────────────────────────────────────────────────────────────────────────

test('25 — audit chain is valid through a full workflow', () => {
  const e = makeEnforcer();
  e.classifyRecord({
    recordId: 'r1',
    category: 'marketing',
    createdAt: yearsAgo(5),
  });
  e.classifyRecord({
    recordId: 'r2',
    category: 'hr',
    createdAt: yearsAgo(10),
  });
  e.legalHoldOverride('r2', { reason: 'audit', placedBy: 'legal' });
  e.enforceArchive('r1', { approvedBy: 'ops' });
  e.exportTombstone('extra-r3', 'manual tombstone');
  e.releaseLegalHold('r2', { reason: 'done', releasedBy: 'legal' });
  e.enforceArchive('r2', { approvedBy: 'ops' });
  // both chains must be intact
  const audit = e.verifyAuditChain();
  const tomb = e.verifyTombstoneChain();
  assert.equal(audit.valid, true);
  assert.equal(tomb.valid, true);
});

// ───────────────────────────────────────────────────────────────────────────
//  12 — no hard delete invariant
// ───────────────────────────────────────────────────────────────────────────

test('26 — invariant: no path in the API produces a hard delete', () => {
  const e = makeEnforcer();
  // seed multiple records in different categories with different methods
  e.definePolicy({
    id: 'p-all-tomb',
    category: 'all-tomb',
    retentionDays: 1,
    purpose: 'test',
    legalBasis_he: 'בדיקה',
    legalBasis_en: 'Test',
    archivalMethod: ARCHIVAL_METHOD.TOMBSTONE,
  });
  e.definePolicy({
    id: 'p-all-pseudo',
    category: 'all-pseudo',
    retentionDays: 1,
    purpose: 'test',
    legalBasis_he: 'בדיקה',
    legalBasis_en: 'Test',
    archivalMethod: ARCHIVAL_METHOD.PSEUDONYMIZE,
  });
  e.classifyRecord({
    recordId: 'a',
    category: 'marketing',
    createdAt: yearsAgo(5),
  });
  e.classifyRecord({
    recordId: 'b',
    category: 'all-tomb',
    createdAt: daysAgo(30),
  });
  e.classifyRecord({
    recordId: 'c',
    category: 'all-pseudo',
    createdAt: daysAgo(30),
  });
  e.enforceBatch(['a', 'b', 'c'], { approvedBy: 'ops' });
  // every classification must still exist in the Map after enforcement
  assert.ok(e.getClassification('a') !== null);
  assert.ok(e.getClassification('b') !== null);
  assert.ok(e.getClassification('c') !== null);
  // statuses must be the soft-archived variants, not deleted
  assert.equal(e.getClassification('a').status, RECORD_STATUS.ARCHIVED);
  assert.equal(e.getClassification('b').status, RECORD_STATUS.TOMBSTONED);
  assert.equal(
    e.getClassification('c').status,
    RECORD_STATUS.PSEUDONYMIZED
  );
  // all archive records mark hardDeleted:false
  // (archive map for 'b' exists because enforceArchive writes it for any method)
  assert.equal(e._archives.get('a').hardDeleted, false);
  assert.equal(e._archives.get('b').hardDeleted, false);
  assert.equal(e._archives.get('c').hardDeleted, false);
});

// ───────────────────────────────────────────────────────────────────────────
//  13 — misc / negative
// ───────────────────────────────────────────────────────────────────────────

test('27 — classifyRecord rejects invalid dates', () => {
  const e = makeEnforcer();
  assert.throws(
    () =>
      e.classifyRecord({
        recordId: 'x',
        category: 'tax',
        createdAt: 'not-a-date',
      }),
    /createdAt must be a valid date/
  );
});

test('28 — enforceArchive refuses to archive an already-archived record', () => {
  const e = makeEnforcer();
  e.classifyRecord({
    recordId: 'r',
    category: 'marketing',
    createdAt: yearsAgo(5),
  });
  e.enforceArchive('r', { approvedBy: 'ops' });
  assert.throws(
    () => e.enforceArchive('r', { approvedBy: 'ops' }),
    /already archived/
  );
});

test('29 — policy defined event fires on definePolicy', () => {
  const e = makeEnforcer();
  const seen = [];
  e.on(EVENTS.POLICY_DEFINED, (evt) => seen.push(evt));
  e.definePolicy({
    id: 'evt-test',
    category: 'evt-test',
    retentionDays: 100,
    purpose: 'test',
    legalBasis_he: 'בדיקה',
    legalBasis_en: 'Test',
    archivalMethod: ARCHIVAL_METHOD.COLD_STORAGE,
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].policy.id, 'evt-test');
});

test('30 — bilingual labels present on defaults (RTL Hebrew + English)', () => {
  const e = makeEnforcer();
  const pols = e.listPolicies();
  for (const p of pols) {
    assert.ok(p.legalBasis_he && p.legalBasis_he.length > 0);
    assert.ok(p.legalBasis_en && p.legalBasis_en.length > 0);
    // Hebrew basis must contain Hebrew characters
    assert.ok(/[\u0590-\u05FF]/.test(p.legalBasis_he));
  }
});
