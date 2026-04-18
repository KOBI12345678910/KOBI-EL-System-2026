/**
 * Unit tests for DocumentVC — office document version control
 * Agent Y-106 — written 2026-04-11
 *
 * Run:   node --test test/docs/doc-version-control.test.js
 *
 * Coverage (>=20 tests):
 *   01. uploadDocument creates v1 with SHA-256 checksum and draft tag
 *   02. uploadDocument rejects unknown docType
 *   03. uploadDocument rejects missing required fields
 *   04. getDocument latest vs specific version
 *   05. listVersions returns full history in order
 *   06. checkIn creates v2, computes signed diffSize, keeps v1
 *   07. checkIn with identical content still appends new version (append-only)
 *   08. checkOut acquires lock; second user gets LOCK_CONFLICT
 *   09. checkOut override steals lock and audits previous holder
 *   10. releaseLock by holder succeeds; by non-holder throws
 *   11. checkIn by lock holder auto-releases the lock
 *   12. compareVersions returns correct size delta, tags diff, checksumChanged
 *   13. rollbackToVersion creates NEW version, never deletes intermediates
 *   14. tagVersion 'published' without approvalChain throws
 *   15. approvalChain enforcement — partial approvals block 'published'
 *   16. approvalChain fully signed allows 'published' tag
 *   17. searchByContent uses injected text extractor and finds matches
 *   18. searchByContent without extractor falls back to utf-8 text
 *   19. watermark stores bilingual overlay spec (no rendering)
 *   20. auditTrail grows monotonically and is immutable to callers
 *   21. expiryTracking reports expiring-soon / expired statuses
 *   22. archiveDocument flips status; legal-hold blocks archive
 *   23. uploadDocument accepts all six doc types
 *   24. legal-hold tag flips document status and blocks checkOut
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DocumentVC,
  DOC_TYPES,
  DOC_STATUS,
  MILESTONE_TAGS,
} = require('../../src/docs/doc-version-control.js');

/* ─────────────────────────────────────────────────────────────────────────
 * Test fixtures
 * ───────────────────────────────────────────────────────────────────────── */

function makeVC() {
  // Deterministic clock: each call steps forward 1 hour so tests can reason
  // about ordering without being flaky on fast machines.
  let t = Date.parse('2026-04-11T08:00:00.000Z');
  return new DocumentVC({
    clock: () => {
      const iso = new Date(t).toISOString();
      t += 3600 * 1000;
      return iso;
    },
  });
}

function contractV1() {
  return {
    docType: 'contract',
    title_he: 'חוזה אספקה ספק A',
    title_en: 'Supply contract vendor A',
    fileBuffer: Buffer.from('CONTRACT V1 — 12 months, NET-30', 'utf8'),
    mimeType: 'application/pdf',
    author: 'legal@tko',
    tags: ['supply', 'vendor-a'],
    department: 'Legal',
  };
}

function contractV2Buffer() {
  return Buffer.from('CONTRACT V2 — 18 months, NET-45, penalty added', 'utf8');
}

/* ─────────────────────────────────────────────────────────────────────────
 * 01. uploadDocument creates v1
 * ───────────────────────────────────────────────────────────────────────── */
test('01. uploadDocument creates v1 with SHA-256 checksum and draft tag', () => {
  const vc = makeVC();
  const r = vc.uploadDocument(contractV1());
  assert.equal(r.version, 1);
  assert.match(r.docId, /^DOC-[A-F0-9]{12}$/);
  const rev = r.record.versions[0];
  assert.equal(rev.version, 1);
  assert.equal(rev.checksum.length, 64, 'SHA-256 is 64 hex chars');
  assert.ok(rev.tags.includes('draft'));
  assert.ok(rev.tags.includes('supply'));
  assert.equal(r.record.title_he, 'חוזה אספקה ספק A');
  assert.equal(r.record.docTypeLabel.he, 'חוזה');
  assert.equal(r.record.status.id, 'active');
});

/* ─────────────────────────────────────────────────────────────────────────
 * 02. upload rejects unknown docType
 * ───────────────────────────────────────────────────────────────────────── */
test('02. uploadDocument rejects unknown docType', () => {
  const vc = makeVC();
  assert.throws(
    () => vc.uploadDocument(Object.assign(contractV1(), { docType: 'bogus' })),
    /unknown docType/
  );
});

/* ─────────────────────────────────────────────────────────────────────────
 * 03. upload rejects missing required fields
 * ───────────────────────────────────────────────────────────────────────── */
test('03. uploadDocument rejects missing title_he', () => {
  const vc = makeVC();
  const bad = contractV1();
  delete bad.title_he;
  assert.throws(() => vc.uploadDocument(bad), /title_he/);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 04. getDocument latest vs specific
 * ───────────────────────────────────────────────────────────────────────── */
test('04. getDocument latest vs specific version', () => {
  const vc = makeVC();
  const { docId } = vc.uploadDocument(contractV1());
  vc.checkIn(docId, {
    fileBuffer: contractV2Buffer(),
    author: 'legal@tko',
    comment: 'NET-45 + penalty',
  });
  const latest = vc.getDocument(docId);
  assert.equal(latest.version, 2);
  assert.equal(latest.revision.comment, 'NET-45 + penalty');

  const v1 = vc.getDocument(docId, { version: 1 });
  assert.equal(v1.version, 1);
  assert.ok(Buffer.isBuffer(v1.buffer));
  assert.equal(v1.buffer.toString('utf8'), 'CONTRACT V1 — 12 months, NET-30');
});

/* ─────────────────────────────────────────────────────────────────────────
 * 05. listVersions full history
 * ───────────────────────────────────────────────────────────────────────── */
test('05. listVersions returns full history with checksums', () => {
  const vc = makeVC();
  const { docId } = vc.uploadDocument(contractV1());
  vc.checkIn(docId, { fileBuffer: contractV2Buffer(), author: 'legal@tko', comment: 'rev 2' });
  vc.checkIn(docId, { fileBuffer: Buffer.from('CONTRACT V3'), author: 'legal@tko', comment: 'rev 3' });
  const hist = vc.listVersions(docId);
  assert.equal(hist.length, 3);
  assert.equal(hist[0].version, 1);
  assert.equal(hist[1].version, 2);
  assert.equal(hist[2].version, 3);
  for (const h of hist) assert.equal(h.checksum.length, 64);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 06. checkIn v2 computes diffSize
 * ───────────────────────────────────────────────────────────────────────── */
test('06. checkIn v2 computes signed diffSize', () => {
  const vc = makeVC();
  const { docId } = vc.uploadDocument(contractV1());
  const r = vc.checkIn(docId, {
    fileBuffer: contractV2Buffer(),
    author: 'legal@tko',
    comment: 'grow',
  });
  assert.equal(r.version, 2);
  assert.ok(r.revision.diffSize > 0, 'V2 is larger than V1');
  assert.equal(r.revision.parentVersion, 1);
  assert.equal(r.revision.sourceAction, 'checkin');
});

/* ─────────────────────────────────────────────────────────────────────────
 * 07. identical content still appends (append-only)
 * ───────────────────────────────────────────────────────────────────────── */
test('07. checkIn with identical content still appends new version', () => {
  const vc = makeVC();
  const { docId } = vc.uploadDocument(contractV1());
  const same = contractV1().fileBuffer;
  const r = vc.checkIn(docId, { fileBuffer: same, author: 'legal@tko' });
  assert.equal(r.version, 2);
  assert.equal(r.revision.identicalToPrev, true);
  assert.equal(vc.listVersions(docId).length, 2, 'append-only even if identical');
});

/* ─────────────────────────────────────────────────────────────────────────
 * 08. checkOut lock + conflict
 * ───────────────────────────────────────────────────────────────────────── */
test('08. checkOut acquires lock; second user gets LOCK_CONFLICT', () => {
  const vc = makeVC();
  const { docId } = vc.uploadDocument(contractV1());
  const lock = vc.checkOut(docId, 'alice');
  assert.equal(lock.lock.user, 'alice');
  assert.throws(
    () => vc.checkOut(docId, 'bob'),
    (err) => err.code === 'LOCK_CONFLICT' && err.holder === 'alice'
  );
});

/* ─────────────────────────────────────────────────────────────────────────
 * 09. override steals lock and audits
 * ───────────────────────────────────────────────────────────────────────── */
test('09. checkOut override steals lock and audits previous holder', () => {
  const vc = makeVC();
  const { docId } = vc.uploadDocument(contractV1());
  vc.checkOut(docId, 'alice');
  const steal = vc.checkOut(docId, 'bob', { override: true, reason: 'alice on vacation' });
  assert.equal(steal.lock.user, 'bob');
  assert.equal(steal.lock.override, true);
  const trail = vc.auditTrail(docId);
  const override = trail.find((e) => e.action === 'override');
  assert.ok(override, 'override recorded');
  assert.equal(override.detail.previousHolder, 'alice');
  assert.match(override.detail.reason, /vacation/);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 10. releaseLock by non-holder throws
 * ───────────────────────────────────────────────────────────────────────── */
test('10. releaseLock by non-holder throws, by holder succeeds', () => {
  const vc = makeVC();
  const { docId } = vc.uploadDocument(contractV1());
  vc.checkOut(docId, 'alice');
  assert.throws(() => vc.releaseLock(docId, 'bob'), /cannot release lock/);
  const ok = vc.releaseLock(docId, 'alice');
  assert.equal(ok.released, true);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 11. checkIn by lock holder auto-releases
 * ───────────────────────────────────────────────────────────────────────── */
test('11. checkIn by lock holder auto-releases the lock', () => {
  const vc = makeVC();
  const { docId } = vc.uploadDocument(contractV1());
  vc.checkOut(docId, 'alice');
  vc.checkIn(docId, { fileBuffer: contractV2Buffer(), author: 'alice', comment: 'done' });
  // bob can now check out without conflict
  const bobLock = vc.checkOut(docId, 'bob');
  assert.equal(bobLock.lock.user, 'bob');
});

/* ─────────────────────────────────────────────────────────────────────────
 * 12. compareVersions
 * ───────────────────────────────────────────────────────────────────────── */
test('12. compareVersions returns size delta, tags diff, checksum change', () => {
  const vc = makeVC();
  const { docId } = vc.uploadDocument(contractV1());
  vc.checkIn(docId, { fileBuffer: contractV2Buffer(), author: 'legal@tko', comment: 'v2' });
  const cmp = vc.compareVersions(docId, 1, 2);
  assert.equal(cmp.from.version, 1);
  assert.equal(cmp.to.version, 2);
  assert.ok(cmp.sizeDelta > 0);
  assert.equal(cmp.checksumChanged, true);
  assert.match(cmp.label.he, /השוואה/);
  assert.match(cmp.label.en, /Compare/);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 13. rollback creates new version, never deletes
 * ───────────────────────────────────────────────────────────────────────── */
test('13. rollbackToVersion creates NEW version, intermediates survive', () => {
  const vc = makeVC();
  const { docId } = vc.uploadDocument(contractV1());
  vc.checkIn(docId, { fileBuffer: contractV2Buffer(), author: 'legal@tko', comment: 'v2' });
  vc.checkIn(docId, { fileBuffer: Buffer.from('BAD V3'), author: 'legal@tko', comment: 'oops' });
  const r = vc.rollbackToVersion(docId, 1, 'cto');
  assert.equal(r.version, 4, 'rollback created v4');
  assert.equal(r.revision.rollbackFrom, 1);
  assert.ok(r.revision.tags.includes('rollback'));
  const hist = vc.listVersions(docId);
  assert.equal(hist.length, 4, 'v1..v4 all preserved');
  // v4 content must equal v1 content
  const v4 = vc.getDocument(docId);
  const v1 = vc.getDocument(docId, { version: 1 });
  assert.equal(v4.buffer.toString('utf8'), v1.buffer.toString('utf8'));
});

/* ─────────────────────────────────────────────────────────────────────────
 * 14. tag 'published' without approval chain throws
 * ───────────────────────────────────────────────────────────────────────── */
test('14. tagVersion published without approvalChain throws', () => {
  const vc = makeVC();
  const { docId } = vc.uploadDocument(contractV1());
  assert.throws(
    () => vc.tagVersion(docId, 1, 'published'),
    /no approval chain/
  );
});

/* ─────────────────────────────────────────────────────────────────────────
 * 15. partial approvals block publish
 * ───────────────────────────────────────────────────────────────────────── */
test('15. approvalChain partial approval still blocks published tag', () => {
  const vc = makeVC();
  const { docId } = vc.uploadDocument(contractV1());
  vc.approvalChain(docId, [
    { role: 'legal',   userId: 'ronen' },
    { role: 'finance', userId: 'dana' },
    { role: 'ceo',     userId: 'uzi' },
  ]);
  vc.approvalChain(docId, null, {
    approve: { version: 1, role: 'legal', userId: 'ronen', comment: 'ok' },
  });
  assert.throws(
    () => vc.tagVersion(docId, 1, 'published'),
    (err) => err.code === 'APPROVAL_INCOMPLETE' && err.missing.length === 2
  );
});

/* ─────────────────────────────────────────────────────────────────────────
 * 16. full approvals unlock publish
 * ───────────────────────────────────────────────────────────────────────── */
test('16. approvalChain fully signed allows published tag', () => {
  const vc = makeVC();
  const { docId } = vc.uploadDocument(contractV1());
  vc.approvalChain(docId, [
    { role: 'legal',   userId: 'ronen' },
    { role: 'finance', userId: 'dana' },
    { role: 'ceo',     userId: 'uzi' },
  ]);
  for (const a of [
    { version: 1, role: 'legal',   userId: 'ronen', comment: 'legal ok' },
    { version: 1, role: 'finance', userId: 'dana',  comment: 'budget ok' },
    { version: 1, role: 'ceo',     userId: 'uzi',   comment: 'approved' },
  ]) {
    vc.approvalChain(docId, null, { approve: a });
  }
  const r = vc.tagVersion(docId, 1, 'published');
  assert.ok(r.tags.includes('published'));
});

/* ─────────────────────────────────────────────────────────────────────────
 * 17. searchByContent with text extractor
 * ───────────────────────────────────────────────────────────────────────── */
test('17. searchByContent uses injected text extractor', () => {
  const vc = makeVC();
  vc.uploadDocument(contractV1());
  vc.uploadDocument({
    docType: 'policy',
    title_he: 'מדיניות אבטחת מידע',
    title_en: 'Information security policy',
    fileBuffer: Buffer.from('ENCRYPTED-BLOB', 'utf8'),
    mimeType: 'application/pdf',
    author: 'ciso@tko',
    department: 'IT',
  });

  // Extractor pretends to OCR: returns "two-factor authentication" for policy only.
  const extractor = (buf /* , mime */) => {
    const s = buf.toString('utf8');
    if (s === 'ENCRYPTED-BLOB') return 'two-factor authentication mandatory';
    return s;
  };
  const hits = vc.searchByContent('two-factor', extractor);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].docType, 'policy');
});

/* ─────────────────────────────────────────────────────────────────────────
 * 18. searchByContent default utf-8 fallback
 * ───────────────────────────────────────────────────────────────────────── */
test('18. searchByContent falls back to utf-8 when no extractor given', () => {
  const vc = makeVC();
  vc.uploadDocument(contractV1());
  const hits = vc.searchByContent('NET-30');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].docType, 'contract');
});

/* ─────────────────────────────────────────────────────────────────────────
 * 19. watermark overlay spec
 * ───────────────────────────────────────────────────────────────────────── */
test('19. watermark stores bilingual overlay spec (no rendering)', () => {
  const vc = makeVC();
  const { docId } = vc.uploadDocument(contractV1());
  const r = vc.watermark(docId, { he: 'טיוטה — סודי', en: 'DRAFT — CONFIDENTIAL' }, {
    position: 'diagonal',
    opacity: 0.4,
  });
  assert.equal(r.watermark.text.he, 'טיוטה — סודי');
  assert.equal(r.watermark.text.en, 'DRAFT — CONFIDENTIAL');
  assert.equal(r.watermark.rendering, 'overlay-spec');
  assert.equal(r.watermark.position, 'diagonal');
});

/* ─────────────────────────────────────────────────────────────────────────
 * 20. auditTrail monotonic + immutable
 * ───────────────────────────────────────────────────────────────────────── */
test('20. auditTrail grows monotonically and is immutable to callers', () => {
  const vc = makeVC();
  const { docId } = vc.uploadDocument(contractV1());
  const t1 = vc.auditTrail(docId);
  assert.ok(t1.length >= 1);
  vc.checkOut(docId, 'alice');
  vc.checkIn(docId, { fileBuffer: contractV2Buffer(), author: 'alice', comment: 'v2' });
  const t2 = vc.auditTrail(docId);
  assert.ok(t2.length > t1.length, 'log grew');

  // Attempt to mutate returned copy — must NOT affect internal state.
  t2.push({ malicious: true });
  const t3 = vc.auditTrail(docId);
  assert.ok(!t3.some((e) => e.malicious === true), 'audit trail is a safe copy');
});

/* ─────────────────────────────────────────────────────────────────────────
 * 21. expiryTracking
 * ───────────────────────────────────────────────────────────────────────── */
test('21. expiryTracking reports expiring-soon / expired', () => {
  // Freeze clock to 2026-04-11
  const base = Date.parse('2026-04-11T08:00:00.000Z');
  let t = base;
  const vc = new DocumentVC({
    clock: () => {
      const iso = new Date(t).toISOString();
      t += 1000;
      return iso;
    },
  });
  const { docId } = vc.uploadDocument(contractV1());

  // expiring-soon — 10 days out
  const soon = new Date(base + 10 * 86400000).toISOString();
  vc.expiryTracking(docId, { set: { expiryDate: soon, reviewer: 'legal@tko' } });
  const r1 = vc.expiryTracking(docId);
  assert.equal(r1.status, 'expiring-soon');
  assert.ok(r1.daysUntilExpiry >= 9 && r1.daysUntilExpiry <= 10);

  // expired — 5 days ago
  const past = new Date(base - 5 * 86400000).toISOString();
  vc.expiryTracking(docId, { set: { expiryDate: past, reviewer: 'legal@tko' } });
  const r2 = vc.expiryTracking(docId);
  assert.equal(r2.status, 'expired');
});

/* ─────────────────────────────────────────────────────────────────────────
 * 22. archiveDocument status flip; legal-hold blocks archive
 * ───────────────────────────────────────────────────────────────────────── */
test('22. archiveDocument flips status; legal-hold blocks archive', () => {
  const vc = makeVC();
  const { docId } = vc.uploadDocument(contractV1());
  const r = vc.archiveDocument(docId, 'superseded by master agreement');
  assert.equal(r.status.id, 'archived');
  // versions still retrievable
  assert.equal(vc.listVersions(docId).length, 1);

  // second doc under legal hold cannot be archived
  const { docId: doc2 } = vc.uploadDocument({
    docType: 'memo',
    title_he: 'מזכר משפטי',
    title_en: 'Legal memo',
    fileBuffer: Buffer.from('litigation notes', 'utf8'),
    mimeType: 'text/plain',
    author: 'legal@tko',
  });
  vc.approvalChain(doc2, [{ role: 'legal', userId: 'ronen' }]);
  vc.tagVersion(doc2, 1, 'legal_hold');
  assert.throws(() => vc.archiveDocument(doc2, 'why'), /legal hold/);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 23. all six doc types accepted
 * ───────────────────────────────────────────────────────────────────────── */
test('23. uploadDocument accepts all six doc types', () => {
  const vc = makeVC();
  for (const t of ['contract', 'policy', 'procedure', 'marketing', 'memo', 'report']) {
    const r = vc.uploadDocument({
      docType: t,
      title_he: 'כותרת ' + t,
      title_en: 'Title ' + t,
      fileBuffer: Buffer.from('payload ' + t),
      mimeType: 'application/pdf',
      author: 'tester',
    });
    assert.equal(r.record.docType, t);
    assert.ok(DOC_TYPES[t].he);
    assert.ok(DOC_TYPES[t].en);
  }
});

/* ─────────────────────────────────────────────────────────────────────────
 * 24. legal-hold blocks check-out
 * ───────────────────────────────────────────────────────────────────────── */
test('24. legal-hold tag blocks subsequent checkOut', () => {
  const vc = makeVC();
  const { docId } = vc.uploadDocument(contractV1());
  vc.approvalChain(docId, [{ role: 'legal', userId: 'ronen' }]);
  vc.tagVersion(docId, 1, 'legal_hold');
  assert.throws(() => vc.checkOut(docId, 'alice'), /legal hold/);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 25. enum sanity — bilingual labels present everywhere
 * ───────────────────────────────────────────────────────────────────────── */
test('25. every enum entry has he + en labels', () => {
  for (const e of Object.values(DOC_TYPES))      { assert.ok(e.he); assert.ok(e.en); }
  for (const e of Object.values(DOC_STATUS))     { assert.ok(e.he); assert.ok(e.en); }
  for (const e of Object.values(MILESTONE_TAGS)) { assert.ok(e.he); assert.ok(e.en); }
});
