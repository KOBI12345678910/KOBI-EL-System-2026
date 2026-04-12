/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Retention Engine — Unit tests
 * ═══════════════════════════════════════════════════════════════════════════
 *  Agent Y-149  |  Techno-Kol Uzi mega-ERP  |  2026-04-11
 *
 *  Run:    node --test test/compliance/retention-engine.test.js
 *
 *  Coverage — 16 deterministic test cases that exercise every public
 *  surface of RetentionEngine:
 *     1. categorize — explicit category
 *     2. categorize — by record.type
 *     3. categorize — by tags fallback
 *     4. categorize — unknown type → privacy default
 *     5. computeExpiryDate — 7y financial
 *     6. computeExpiryDate — 10y medical
 *     7. computeExpiryDate — 25y construction
 *     8. computeExpiryDate — legal hold returns null
 *     9. scanDue — only expired records returned
 *    10. archiveBatch — soft-archive, event emitted, production not deleted
 *    11. archiveBatch — legal hold blocks archival
 *    12. holdOverride — releaseHold round-trip
 *    13. verifyChain — SHA256 chain integrity
 *    14. verifyChain — tamper detection
 *    15. bilingualReport — both languages + hash
 *    16. Retention matrix immutability
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RetentionEngine,
  RETENTION_MATRIX,
  TYPE_TO_CATEGORY,
} = require('../../src/compliance/retention-engine.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXED_NOW = new Date('2026-04-11T00:00:00.000Z');

function mkEngine(now = FIXED_NOW) {
  return new RetentionEngine({ now });
}

// ---------------------------------------------------------------------------
// 1. categorize — explicit category
// ---------------------------------------------------------------------------
test('01 categorize — explicit record.category is honoured', () => {
  const e = mkEngine();
  const out = e.categorize({ id: 'r1', category: 'aml', created_at: '2020-01-01' });
  assert.equal(out.category, 'aml');
  assert.equal(out.years, 7);
  assert.ok(out.labels.he.includes('איסור'));
  assert.match(out.labels.en, /AML/);
});

// ---------------------------------------------------------------------------
// 2. categorize — by record.type
// ---------------------------------------------------------------------------
test('02 categorize — invoice → financial (7y)', () => {
  const e = mkEngine();
  const out = e.categorize({ id: 'r2', type: 'invoice', created_at: '2024-01-01' });
  assert.equal(out.category, 'financial');
  assert.equal(out.years, 7);
  assert.match(out.law.he, /מס הכנסה|מע״מ/);
});

// ---------------------------------------------------------------------------
// 3. categorize — tag fallback
// ---------------------------------------------------------------------------
test('03 categorize — tag fallback resolves to construction (25y)', () => {
  const e = mkEngine();
  const out = e.categorize({
    id: 'r3',
    tags: ['unknown', 'building_permit'],
    handover_date: '2000-01-01',
  });
  assert.equal(out.category, 'construction');
  assert.equal(out.years, 25);
});

// ---------------------------------------------------------------------------
// 4. categorize — unknown → privacy default (safe, 7y)
// ---------------------------------------------------------------------------
test('04 categorize — unknown record defaults to privacy/7y', () => {
  const e = mkEngine();
  const out = e.categorize({ id: 'r4', type: 'mystery', created_at: '2024-01-01' });
  assert.equal(out.category, 'privacy');
  assert.equal(out.years, 7);
});

// ---------------------------------------------------------------------------
// 5. computeExpiryDate — 7y financial
// ---------------------------------------------------------------------------
test('05 computeExpiryDate — financial 7 years from created_at', () => {
  const e = mkEngine();
  const rec = { id: 'inv-1', type: 'invoice', created_at: '2018-04-11T00:00:00.000Z' };
  const expiry = e.computeExpiryDate(rec);
  assert.equal(expiry.toISOString(), '2025-04-11T00:00:00.000Z');
});

// ---------------------------------------------------------------------------
// 6. computeExpiryDate — 10y medical
// ---------------------------------------------------------------------------
test('06 computeExpiryDate — medical 10 years', () => {
  const e = mkEngine();
  const rec = { id: 'med-1', type: 'medical_file', created_at: '2015-01-01T00:00:00.000Z' };
  const expiry = e.computeExpiryDate(rec);
  assert.equal(expiry.toISOString(), '2025-01-01T00:00:00.000Z');
});

// ---------------------------------------------------------------------------
// 7. computeExpiryDate — 25y construction from handover_date
// ---------------------------------------------------------------------------
test('07 computeExpiryDate — construction 25 years from handover_date', () => {
  const e = mkEngine();
  const rec = {
    id: 'bld-1',
    type: 'handover_protocol',
    handover_date: '2000-06-01T00:00:00.000Z',
  };
  const expiry = e.computeExpiryDate(rec);
  assert.equal(expiry.toISOString(), '2025-06-01T00:00:00.000Z');
});

// ---------------------------------------------------------------------------
// 8. computeExpiryDate — legal hold → null
// ---------------------------------------------------------------------------
test('08 computeExpiryDate — legal hold returns null', () => {
  const e = mkEngine();
  const rec = { id: 'r8', type: 'invoice', created_at: '2000-01-01' };
  e.register(rec);
  e.holdOverride('r8', 'litigation #42');
  assert.equal(e.computeExpiryDate(rec), null);
});

// ---------------------------------------------------------------------------
// 9. scanDue — only expired records returned
// ---------------------------------------------------------------------------
test('09 scanDue — returns only records whose retention has expired', () => {
  const e = mkEngine();
  e.register({ id: 'old', type: 'invoice', created_at: '2010-01-01T00:00:00.000Z' }); // expired
  e.register({ id: 'new', type: 'invoice', created_at: '2025-01-01T00:00:00.000Z' }); // active
  e.register({ id: 'med', type: 'medical_file', created_at: '2000-01-01T00:00:00.000Z' }); // expired

  const due = e.scanDue();
  const ids = due.map((d) => d.record.id).sort();
  assert.deepEqual(ids, ['med', 'old']);
  assert.equal(due.find((d) => d.record.id === 'med').category, 'medical');
});

// ---------------------------------------------------------------------------
// 10. archiveBatch — soft-archive, event emitted, production not deleted
// ---------------------------------------------------------------------------
test('10 archiveBatch — soft-archive emits event, flags row, never deletes', () => {
  const e = mkEngine();
  e.register({ id: 'x1', type: 'invoice', created_at: '2010-01-01T00:00:00.000Z' });
  const captured = [];
  e.on('archive', (evt) => captured.push(evt));

  const due = e.scanDue();
  const events = e.archiveBatch(due.map((d) => d.record));

  assert.equal(events.length, 1);
  assert.equal(events[0].action, 'soft_archive');
  assert.equal(events[0].hard_deleted, false);
  assert.equal(events[0].to, 'cold_storage');
  assert.equal(captured.length, 1);
  // Production row still present, just flagged archived
  const stored = e.getRecord('x1');
  assert.ok(stored, 'record must still exist in engine after archive');
  assert.equal(stored.archived, true);
  assert.ok(stored.archived_at);
});

// ---------------------------------------------------------------------------
// 11. archiveBatch — legal hold blocks archival
// ---------------------------------------------------------------------------
test('11 archiveBatch — legal hold blocks archival (hold wins)', () => {
  const e = mkEngine();
  e.register({ id: 'hold-1', type: 'invoice', created_at: '2000-01-01T00:00:00.000Z' });
  e.holdOverride('hold-1', 'civil suit 2026/123');

  const events = e.archiveBatch([{ id: 'hold-1' }]);
  assert.equal(events.length, 0);
  assert.equal(e.getRecord('hold-1').archived, undefined);

  // A "archive_blocked_by_hold" decision must exist in the chain
  const blocked = e.decisions.find((d) => d.action === 'archive_blocked_by_hold');
  assert.ok(blocked, 'blocked-by-hold decision should appear in chain');
});

// ---------------------------------------------------------------------------
// 12. holdOverride + releaseHold round-trip
// ---------------------------------------------------------------------------
test('12 holdOverride / releaseHold round-trip', () => {
  const e = mkEngine();
  e.register({ id: 'h1', type: 'invoice', created_at: '2000-01-01T00:00:00.000Z' });
  e.holdOverride('h1', 'regulator inquiry');
  assert.equal(e.holds.length, 1);
  assert.equal(e.holds[0].id, 'h1');

  const released = e.releaseHold('h1', 'inquiry closed');
  assert.equal(released, true);
  assert.equal(e.holds.length, 0);
});

// ---------------------------------------------------------------------------
// 13. verifyChain — clean chain passes
// ---------------------------------------------------------------------------
test('13 verifyChain — untouched chain verifies', () => {
  const e = mkEngine();
  e.register({ id: 'c1', type: 'invoice', created_at: '2018-01-01' });
  e.register({ id: 'c2', type: 'invoice', created_at: '2019-01-01' });
  e.scanDue();
  e.archiveBatch([{ id: 'c1' }]);
  assert.equal(e.verifyChain(), true);
});

// ---------------------------------------------------------------------------
// 14. verifyChain — tamper detection
// ---------------------------------------------------------------------------
test('14 verifyChain — tampering with internal chain is detected', () => {
  const e = mkEngine();
  e.register({ id: 't1', type: 'invoice', created_at: '2000-01-01' });

  // Access internal list and mutate a middle entry.
  // Because freeze is shallow on nested objects, we can simulate tampering
  // by rewriting the internal array directly (test only).
  const internal = e._decisions;
  // Build a tampered clone of decision 1
  const original = internal[1];
  const tampered = {
    seq: original.seq,
    action: original.action,
    timestamp: original.timestamp,
    payload: { id: 'evil', type: 'forged' },
    prevHash: original.prevHash,
    hash: original.hash, // leave old hash → recomputed will differ
  };
  internal[1] = tampered;

  assert.equal(e.verifyChain(), false);
});

// ---------------------------------------------------------------------------
// 15. bilingualReport — both languages + stable hash seal
// ---------------------------------------------------------------------------
test('15 bilingualReport — bilingual content and SHA256 seal', () => {
  const e = mkEngine();
  e.register({ id: 'f1', type: 'invoice', created_at: '2018-01-01' });
  e.register({ id: 'm1', type: 'medical_file', created_at: '2015-01-01' });

  const rep = e.bilingualReport();
  assert.ok(rep.he.includes('דו״ח שימור רשומות'));
  assert.ok(rep.he.includes('\u202B'), 'Hebrew block should carry RTL marks');
  assert.ok(rep.en.includes('Retention Report'));
  assert.match(rep.hash, /^[a-f0-9]{64}$/);
  assert.ok(rep.generatedAt);
});

// ---------------------------------------------------------------------------
// 16. Retention matrix immutability
// ---------------------------------------------------------------------------
test('16 RETENTION_MATRIX is frozen and carries all 8 categories', () => {
  assert.ok(Object.isFrozen(RETENTION_MATRIX));
  const keys = Object.keys(RETENTION_MATRIX).sort();
  assert.deepEqual(keys, [
    'aml',
    'construction',
    'contracts',
    'employment',
    'financial',
    'medical',
    'privacy',
    'tax_audit',
  ]);
  assert.equal(RETENTION_MATRIX.construction.years, 25);
  assert.equal(RETENTION_MATRIX.tax_audit.years, 10);
  assert.ok(Object.isFrozen(TYPE_TO_CATEGORY));
});
