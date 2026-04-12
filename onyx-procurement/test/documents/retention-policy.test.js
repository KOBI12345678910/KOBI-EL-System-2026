/**
 * Document Retention Policy — Unit Tests
 * Agent Y-114 / Swarm Documents / Techno-Kol Uzi Mega-ERP 2026
 *
 * Covers:
 *   - defineRetention (override + merge + disposal-mode validation)
 *   - classify (explicit tag, keyword match, Hebrew+English, strict mode)
 *   - applyPolicy (queue generation, eligibility, permanent records, holds)
 *   - disposalQueue (pending-only default, `all` filter, append-only)
 *   - approveDisposal (approval gate, never-auto-delete, missing-approver throw)
 *   - archiveDocument / anonymizeDocument (non-destructive lifecycle)
 *   - legalHold integration (pauses disposal, Y-115 external resolver)
 *   - complianceReport (period window, queue/status breakdown, events)
 *   - bilingualPolicy (Hebrew + English, retention table)
 *   - NEVER-DELETE invariant: no method physically removes a document record.
 *
 * Run with:  node --test test/documents/retention-policy.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  RetentionPolicy,
  ISRAELI_RETENTION_CLASSES,
  DOC_STATUS,
  DISPOSAL_MODES,
  QUEUE_STATUS,
} = require('../../src/documents/retention-policy.js');

// ─── fixed clock helpers ─────────────────────────────────────────────
const FIXED_NOW = '2026-04-11T09:00:00Z';
const clockAt = (iso) => () => new Date(iso);

function makePolicy(opts = {}) {
  return new RetentionPolicy({ now: clockAt(FIXED_NOW), ...opts });
}

function taxDoc(overrides = {}) {
  return {
    id: 'doc-tax-2018',
    docType: 'tax_records',
    title_he: 'דוח מס שנתי 2018',
    title_en: 'Annual tax return 2018',
    fiscalYearEnd: '2018-12-31',
    createdAt: '2019-01-15',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// defineRetention
// ═══════════════════════════════════════════════════════════════

describe('defineRetention', () => {
  test('accepts all Israeli required classes', () => {
    const p = makePolicy();
    for (const key of [
      'tax_records',
      'accounting_books',
      'payroll_records',
      'personnel_files',
      'contracts',
      'medical_records',
      'building_permits',
      'tabu_documents',
      'legal_proceedings',
    ]) {
      const c = p.getRetentionClass(key);
      assert.ok(c, `missing seeded class ${key}`);
      assert.ok(c.lawReference.length > 0, `${key} missing lawReference`);
    }
  });

  test('tax records default to 7 years', () => {
    assert.equal(ISRAELI_RETENTION_CLASSES.tax_records.retentionYears, 7);
    assert.equal(ISRAELI_RETENTION_CLASSES.accounting_books.retentionYears, 7);
    assert.equal(ISRAELI_RETENTION_CLASSES.payroll_records.retentionYears, 7);
    assert.equal(ISRAELI_RETENTION_CLASSES.personnel_files.retentionYears, 7);
    assert.equal(ISRAELI_RETENTION_CLASSES.contracts.retentionYears, 7);
  });

  test('medical records are 20 years', () => {
    assert.equal(ISRAELI_RETENTION_CLASSES.medical_records.retentionYears, 20);
  });

  test('building permits / tabu / legal proceedings are permanent', () => {
    for (const key of ['building_permits', 'tabu_documents', 'legal_proceedings']) {
      const c = ISRAELI_RETENTION_CLASSES[key];
      assert.equal(c.retentionYears, null);
      assert.equal(c.holdOverride, true);
    }
  });

  test('defineRetention overrides fields without touching seeded object', () => {
    const p = makePolicy();
    const out = p.defineRetention({
      docType: 'tax_records',
      retentionYears: 10,
      disposal: 'anonymize',
    });
    assert.equal(out.retentionYears, 10);
    assert.equal(out.disposal, 'anonymize');
    assert.equal(out.lawReference, ISRAELI_RETENTION_CLASSES.tax_records.lawReference);
    // Seeded constant untouched
    assert.equal(ISRAELI_RETENTION_CLASSES.tax_records.retentionYears, 7);
  });

  test('defineRetention validates disposal mode', () => {
    const p = makePolicy();
    assert.throws(
      () => p.defineRetention({ docType: 'tax_records', disposal: 'burn' }),
      /invalid disposal mode/
    );
  });

  test('defineRetention can introduce a new class', () => {
    const p = makePolicy();
    const c = p.defineRetention({
      docType: 'custom_exports',
      retentionYears: 5,
      lawReference: 'internal policy',
      disposal: 'archive',
    });
    assert.equal(c.retentionYears, 5);
    assert.equal(c.disposal, 'archive');
    assert.ok(p.getRetentionClass('custom_exports'));
  });
});

// ═══════════════════════════════════════════════════════════════
// classify
// ═══════════════════════════════════════════════════════════════

describe('classify', () => {
  test('explicit retentionClass wins', () => {
    const p = makePolicy();
    const c = p.classify({ id: 'x', retentionClass: 'medical_records' });
    assert.equal(c.key, 'medical_records');
  });

  test('classifies by Hebrew keyword', () => {
    const p = makePolicy();
    const c = p.classify({ id: 'x', title_he: 'תלוש שכר אפריל' });
    assert.equal(c.key, 'payroll_records');
  });

  test('classifies by English keyword', () => {
    const p = makePolicy();
    const c = p.classify({ id: 'x', docType: 'PAYROLL', title: 'Monthly payslip' });
    assert.equal(c.key, 'payroll_records');
  });

  test('classifies contract by filename', () => {
    const p = makePolicy();
    const c = p.classify({ id: 'x', filename: 'service_agreement.pdf' });
    assert.equal(c.key, 'contracts');
  });

  test('classifies tabu document', () => {
    const p = makePolicy();
    const c = p.classify({ id: 'x', title_he: 'נסח טאבו גוש 6109' });
    assert.equal(c.key, 'tabu_documents');
  });

  test('classifies building permit', () => {
    const p = makePolicy();
    const c = p.classify({ id: 'x', title_he: 'היתר בנייה' });
    assert.equal(c.key, 'building_permits');
  });

  test('classifies legal proceedings', () => {
    const p = makePolicy();
    const c = p.classify({ id: 'x', title_he: 'תביעה אזרחית בית משפט השלום' });
    assert.equal(c.key, 'legal_proceedings');
  });

  test('strict mode throws on unknown', () => {
    const p = makePolicy({ strict: true });
    assert.throws(() => p.classify({ id: 'x', docType: 'random-thing' }), /unable to classify/);
  });

  test('non-strict falls back to generic contracts class', () => {
    const p = makePolicy();
    const c = p.classify({ id: 'x', docType: 'random-thing' });
    assert.equal(c.key, 'contracts');
  });
});

// ═══════════════════════════════════════════════════════════════
// applyPolicy — queue generation
// ═══════════════════════════════════════════════════════════════

describe('applyPolicy', () => {
  test('queues only eligible documents', () => {
    const p = makePolicy();
    p.ingestDocument(taxDoc()); // 2018 → eligible in 2025
    p.ingestDocument(
      taxDoc({ id: 'doc-tax-2024', fiscalYearEnd: '2024-12-31', title_he: 'דוח מס 2024' })
    ); // not yet eligible
    const summary = p.applyPolicy();
    assert.equal(summary.scanned, 2);
    assert.equal(summary.queued, 1);
    const queue = p.disposalQueue();
    assert.equal(queue.length, 1);
    assert.equal(queue[0].docId, 'doc-tax-2018');
    assert.equal(queue[0].status, QUEUE_STATUS.PENDING);
    assert.equal(queue[0].disposal, 'archive'); // safe default (not delete)
  });

  test('permanent records are never queued', () => {
    const p = makePolicy();
    p.ingestDocument({
      id: 'p-1',
      docType: 'building_permits',
      title_he: 'היתר בנייה 1970',
      permitIssued: '1970-01-01',
    });
    p.ingestDocument({
      id: 'p-2',
      docType: 'tabu_documents',
      title_he: 'נסח טאבו 1955',
      recorded: '1955-06-01',
    });
    p.ingestDocument({
      id: 'p-3',
      docType: 'legal_proceedings',
      title_en: 'closed lawsuit 1980',
      caseClosed: '1980-12-01',
    });
    const summary = p.applyPolicy();
    assert.equal(summary.queued, 0);
    assert.equal(summary.permanent, 3);
    assert.equal(p.disposalQueue().length, 0);
  });

  test('medical records use 20-year clock', () => {
    const p = makePolicy();
    p.ingestDocument({
      id: 'm-1',
      docType: 'medical_records',
      title_he: 'רשומה רפואית',
      caseClosed: '2000-01-01', // 26 years ago → eligible
    });
    p.ingestDocument({
      id: 'm-2',
      docType: 'medical_records',
      title_he: 'רשומה רפואית',
      caseClosed: '2020-01-01', // 6 years ago → NOT eligible
    });
    p.applyPolicy();
    const q = p.disposalQueue();
    assert.equal(q.length, 1);
    assert.equal(q[0].docId, 'm-1');
    assert.equal(q[0].disposal, 'anonymize'); // not delete
  });

  test('never re-queues already archived documents', () => {
    const p = makePolicy();
    p.ingestDocument(taxDoc());
    p.applyPolicy();
    const [entry] = p.disposalQueue();
    p.approveDisposal(entry.docId, 'cfo@techno-kol.co.il');
    // second pass
    const summary2 = p.applyPolicy();
    assert.equal(summary2.queued, 0);
    assert.equal(summary2.skipped, 1);
  });

  test('honours Y-115 external legal hold resolver', () => {
    const holds = new Set(['doc-tax-2018']);
    const p = makePolicy({ y115Resolver: (id) => ({ onHold: holds.has(id) }) });
    p.ingestDocument(taxDoc());
    p.ingestDocument(
      taxDoc({ id: 'doc-tax-2017', fiscalYearEnd: '2017-12-31', title_he: 'דוח מס 2017' })
    );
    const summary = p.applyPolicy();
    assert.equal(summary.queued, 1);
    assert.equal(summary.held, 1);
  });

  test('Y-115 resolver throwing defaults to HOLD (safety)', () => {
    const p = makePolicy({
      y115Resolver: () => {
        throw new Error('Y-115 registry unavailable');
      },
    });
    p.ingestDocument(taxDoc());
    const summary = p.applyPolicy();
    assert.equal(summary.queued, 0);
    assert.equal(summary.held, 1);
  });
});

// ═══════════════════════════════════════════════════════════════
// disposalQueue
// ═══════════════════════════════════════════════════════════════

describe('disposalQueue', () => {
  test('returns only pending by default', () => {
    const p = makePolicy();
    p.ingestDocument(taxDoc());
    p.applyPolicy();
    assert.equal(p.disposalQueue().length, 1);
    p.approveDisposal('doc-tax-2018', 'approver@x');
    // executed entry no longer pending
    assert.equal(p.disposalQueue().length, 0);
    // but entire history is retained
    const all = p.disposalQueue({ status: 'all' });
    assert.equal(all.length, 1);
    assert.equal(all[0].status, QUEUE_STATUS.EXECUTED);
  });

  test('queue is append-only — rejected items are preserved', () => {
    const p = makePolicy();
    p.ingestDocument(taxDoc());
    p.applyPolicy();
    p.rejectDisposal('doc-tax-2018', 'reviewer@x', 'still needed');
    const all = p.disposalQueue({ status: 'all' });
    assert.equal(all.length, 1);
    assert.equal(all[0].status, QUEUE_STATUS.REJECTED);
    assert.ok(/still needed/.test(all[0].reason));
  });
});

// ═══════════════════════════════════════════════════════════════
// approveDisposal — approval gate + NEVER auto-delete
// ═══════════════════════════════════════════════════════════════

describe('approveDisposal — approval gate', () => {
  test('requires a named approver (no empty / undefined)', () => {
    const p = makePolicy();
    p.ingestDocument(taxDoc());
    p.applyPolicy();
    assert.throws(() => p.approveDisposal('doc-tax-2018'), /approver/);
    assert.throws(() => p.approveDisposal('doc-tax-2018', ''), /approver/);
    assert.throws(() => p.approveDisposal('doc-tax-2018', null), /approver/);
  });

  test('never auto-deletes — even when class is set to delete', () => {
    const p = makePolicy();
    p.defineRetention({ docType: 'tax_records', disposal: 'delete' });
    p.ingestDocument(taxDoc());
    p.applyPolicy();
    // document is still in store BEFORE approval
    assert.ok(p.getDocument('doc-tax-2018'));
    // the queue entry sits pending — no action happens without approval
    const [entry] = p.disposalQueue();
    assert.equal(entry.status, QUEUE_STATUS.PENDING);
    // approve
    p.approveDisposal('doc-tax-2018', { id: 'cfo@x', name: 'CFO' }, { reason: 'lawful purge' });
    // Even for 'delete' mode, the document record is retained in the store with status DISPOSED
    const after = p.getDocument('doc-tax-2018');
    assert.ok(after, 'document record must still exist — engine NEVER physically deletes');
    assert.equal(after.status, DOC_STATUS.DISPOSED);
    assert.ok(after.disposedMarker);
    assert.ok(after.disposedBy);
  });

  test('blocks approval while under legal hold', () => {
    const p = makePolicy();
    p.ingestDocument(taxDoc());
    p.applyPolicy();
    p.legalHold('doc-tax-2018', 'audit investigation', '2027-01-01');
    assert.throws(() => p.approveDisposal('doc-tax-2018', 'cfo@x'), /LEGAL HOLD/);
  });

  test('archive approval leaves document retrievable', () => {
    const p = makePolicy();
    p.ingestDocument(taxDoc());
    p.applyPolicy();
    p.approveDisposal('doc-tax-2018', 'cfo@x');
    const after = p.getDocument('doc-tax-2018');
    assert.equal(after.status, DOC_STATUS.ARCHIVED);
    assert.ok(after.archivedAt);
  });

  test('anonymize approval strips PII but retains record', () => {
    const p = makePolicy();
    p.ingestDocument({
      id: 'emp-1',
      docType: 'personnel_files',
      title_he: 'תיק עובד',
      terminationDate: '2016-06-01',
      personName: 'משה כהן',
      idNumber: '039123456',
      email: 'moshe@example.com',
      phone: '050-1234567',
      salary: 12000,
    });
    p.applyPolicy();
    const [entry] = p.disposalQueue();
    assert.equal(entry.disposal, 'anonymize'); // not delete
    p.approveDisposal('emp-1', 'hr-chief@x');
    const doc = p.getDocument('emp-1');
    assert.equal(doc.status, DOC_STATUS.ANONYMIZED);
    assert.equal(doc.personName, '[ANONYMIZED]');
    assert.equal(doc.idNumber, '[ANONYMIZED]');
    assert.equal(doc.email, '[ANONYMIZED]');
    assert.equal(doc.phone, '[ANONYMIZED]');
    assert.equal(doc.salary, 12000, 'non-PII field preserved for analytics');
    assert.ok(doc.piiRemoved.includes('personName'));
  });
});

// ═══════════════════════════════════════════════════════════════
// legalHold
// ═══════════════════════════════════════════════════════════════

describe('legalHold', () => {
  test('requires reason', () => {
    const p = makePolicy();
    p.ingestDocument(taxDoc());
    assert.throws(() => p.legalHold('doc-tax-2018'), /reason/);
  });

  test('flips pending queue entries to HELD', () => {
    const p = makePolicy();
    p.ingestDocument(taxDoc());
    p.applyPolicy();
    p.legalHold('doc-tax-2018', 'court order', '2030-01-01');
    const all = p.disposalQueue({ status: 'all' });
    assert.equal(all[0].status, QUEUE_STATUS.HELD);
    assert.ok(/court order/.test(all[0].reason));
  });

  test('release restores ACTIVE status', () => {
    const p = makePolicy();
    p.ingestDocument(taxDoc());
    p.legalHold('doc-tax-2018', 'investigation');
    p.releaseLegalHold('doc-tax-2018', 'legal@x', 'case closed');
    const doc = p.getDocument('doc-tax-2018');
    assert.equal(doc.status, DOC_STATUS.ACTIVE);
    assert.equal(p.listLegalHolds().length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// complianceReport
// ═══════════════════════════════════════════════════════════════

describe('complianceReport', () => {
  test('period window filters events and queue entries', () => {
    const p = makePolicy();
    p.ingestDocument(taxDoc());
    p.applyPolicy();
    p.approveDisposal('doc-tax-2018', 'cfo@x');
    const report = p.complianceReport({ from: '2026-01-01', to: '2026-12-31' });
    assert.equal(report.totals.documents, 1);
    assert.equal(report.queue.entries.length, 1);
    assert.equal(report.queue.byStatus.executed, 1);
    assert.equal(report.queue.byDisposal.archive, 1);
    assert.equal(report.queue.byDisposal.delete, 0);
    assert.equal(report.documentsByStatus.archived, 1);
    assert.ok(/לא מוחקים/.test(report.invariant));
    assert.ok(report.events.length > 0);
  });

  test('empty report still returns structure', () => {
    const p = makePolicy();
    const report = p.complianceReport();
    assert.ok(report.period);
    assert.equal(report.totals.documents, 0);
    assert.equal(report.queue.entries.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// bilingualPolicy
// ═══════════════════════════════════════════════════════════════

describe('bilingualPolicy', () => {
  test('produces Hebrew + English policy documents', () => {
    const p = makePolicy();
    const doc = p.bilingualPolicy();
    assert.equal(doc.direction, 'rtl');
    assert.ok(doc.he.includes('מדיניות שימור מסמכים'));
    assert.ok(doc.he.includes('7 שנים'));
    assert.ok(doc.he.includes('לצמיתות'));
    assert.ok(doc.he.includes('לא מוחקים'));
    assert.ok(doc.en.includes('Document Retention Policy'));
    assert.ok(doc.en.includes('7 years'));
    assert.ok(doc.en.includes('permanent'));
    assert.ok(doc.en.includes('Never delete'));
    assert.ok(Array.isArray(doc.table));
    assert.ok(doc.table.length >= 9);
  });

  test('table contains all statutory classes', () => {
    const p = makePolicy();
    const { table } = p.bilingualPolicy();
    const keys = table.map((r) => r.key);
    for (const k of [
      'tax_records',
      'accounting_books',
      'payroll_records',
      'personnel_files',
      'contracts',
      'medical_records',
      'building_permits',
      'tabu_documents',
      'legal_proceedings',
    ]) {
      assert.ok(keys.includes(k), `missing ${k} in bilingual table`);
    }
  });

  test('overrides appear in bilingual output', () => {
    const p = makePolicy();
    p.defineRetention({
      docType: 'tax_records',
      retentionYears: 10,
      disposal: 'anonymize',
    });
    const { table } = p.bilingualPolicy();
    const row = table.find((r) => r.key === 'tax_records');
    assert.equal(row.retentionYears, 10);
    assert.equal(row.disposal, 'anonymize');
    assert.ok(/10 שנים/.test(row.retention_he));
    assert.ok(/10 years/.test(row.retention_en));
  });
});

// ═══════════════════════════════════════════════════════════════
// NEVER-DELETE invariant — end-to-end
// ═══════════════════════════════════════════════════════════════

describe('NEVER-DELETE invariant', () => {
  test('no code path removes a document from the store', () => {
    const p = makePolicy();
    p.ingestDocument(taxDoc());
    p.ingestDocument({
      id: 'emp-2',
      docType: 'personnel_files',
      title_he: 'תיק עובד',
      terminationDate: '2010-01-01',
      personName: 'דנה לוי',
      idNumber: '123456789',
    });
    // Force delete on a class AND exercise every disposal path
    p.defineRetention({ docType: 'tax_records', disposal: 'delete' });
    p.applyPolicy();
    const queued = p.disposalQueue();
    for (const q of queued) p.approveDisposal(q.docId, 'auditor@x');

    // Both documents MUST still be retrievable
    assert.ok(p.getDocument('doc-tax-2018'));
    assert.ok(p.getDocument('emp-2'));
    assert.equal(p.listDocuments().length, 2);
  });

  test('audit trail is append-only and non-empty', () => {
    const p = makePolicy();
    p.ingestDocument(taxDoc());
    p.applyPolicy();
    p.approveDisposal('doc-tax-2018', 'cfo@x');
    const trail = p.auditTrail();
    const kinds = trail.map((e) => e.kind);
    assert.ok(kinds.includes('policy_initialized'));
    assert.ok(kinds.includes('document_ingested'));
    assert.ok(kinds.includes('queued_for_disposal'));
    assert.ok(kinds.includes('disposal_approved'));
    assert.ok(kinds.includes('document_archived'));
  });

  test('DISPOSAL_MODES exposes exactly the three allowed modes', () => {
    assert.deepEqual([...DISPOSAL_MODES].sort(), ['anonymize', 'archive', 'delete']);
  });
});
