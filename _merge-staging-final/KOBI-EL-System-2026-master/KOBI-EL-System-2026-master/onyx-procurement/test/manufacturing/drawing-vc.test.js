/**
 * Unit tests for DrawingVC — engineering-drawing version control
 * Agent Y-045 — written 2026-04-11
 *
 * Run:   node --test test/manufacturing/drawing-vc.test.js
 *
 * Coverage (>=20 tests):
 *   - upload of new drawing creates rev "A"
 *   - upload of identical content does NOT create a new rev
 *   - upload of changed content creates the next rev
 *   - alpha-rev sequence A → Z → AA → AB
 *   - explicit rev override (migration import)
 *   - numeric sub-rev creation (A → A.1 → A.2)
 *   - dual-approval requirement (single approval not enough)
 *   - status transitions: draft → in-review → approved
 *   - freezeRevision prevents auto supersede
 *   - frozen rev needs {force:true} for new major rev
 *   - getDrawing latest vs specific
 *   - listRevisions includes superseded entries
 *   - compare returns correct diff
 *   - linkToBOM bidirectional descriptor
 *   - linkToWorkOrder bidirectional descriptor
 *   - watermark returns annotated buffer with bilingual text
 *   - exportHistoryReport bilingual markdown contents
 *   - search by author, status, partNumber and free-text
 *   - audit log monotonic growth
 *   - supersedeRevision keeps record (never deletes)
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DrawingVC,
  DRAWING_FORMATS,
  STATUS,
  REQUIRED_APPROVAL_ROLES,
  _internals,
} = require('../../src/manufacturing/drawing-vc.js');

/* ─────────────────────────────────────────────────────────────────────────
 * Test fixtures
 * ───────────────────────────────────────────────────────────────────────── */

function bracketDwgV1() {
  return Object.assign({
    partNumber: 'BRK-100',
    fileBuffer: Buffer.from('DWG-CONTENT-V1', 'utf8'),
    format: 'DWG',
    author: 'Avi Cohen',
    notes: 'Initial release for laser cut',
  });
}

function bracketDwgV2() {
  return Object.assign({}, bracketDwgV1(), {
    fileBuffer: Buffer.from('DWG-CONTENT-V2-FILLET-RADIUS-CHANGED', 'utf8'),
    notes: 'Increase corner fillet to R5',
  });
}

function bracketDwgV3() {
  return Object.assign({}, bracketDwgV1(), {
    fileBuffer: Buffer.from('DWG-CONTENT-V3-MATERIAL-S355', 'utf8'),
    notes: 'Material upgraded S275 → S355',
  });
}

/* ─────────────────────────────────────────────────────────────────────────
 * 1. uploadDrawing — basic creation
 * ───────────────────────────────────────────────────────────────────────── */

test('01. uploadDrawing creates rev A on first upload', () => {
  const vc = new DrawingVC();
  const result = vc.uploadDrawing(bracketDwgV1());
  assert.equal(result.created, true);
  assert.equal(result.revision.rev, 'A');
  assert.equal(result.revision.partNumber, 'BRK-100');
  assert.equal(result.revision.status, STATUS.DRAFT);
  assert.equal(result.revision.format, 'DWG');
  assert.ok(result.revision.checksum.length === 64, 'SHA-256 hex length');
});

/* ─────────────────────────────────────────────────────────────────────────
 * 2. Identical content → no new rev
 * ───────────────────────────────────────────────────────────────────────── */

test('02. uploading identical content does NOT create a new rev', () => {
  const vc = new DrawingVC();
  vc.uploadDrawing(bracketDwgV1());
  const second = vc.uploadDrawing(bracketDwgV1());
  assert.equal(second.created, false);
  assert.equal(second.revision.rev, 'A');
  assert.match(second.reason_en, /identical/);
  assert.match(second.reason_he, /זהה/);
  assert.equal(vc.listRevisions('BRK-100').length, 1);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 3. Changed content → next major rev (A → B)
 * ───────────────────────────────────────────────────────────────────────── */

test('03. uploading changed content creates rev B', () => {
  const vc = new DrawingVC();
  vc.uploadDrawing(bracketDwgV1());
  const r = vc.uploadDrawing(bracketDwgV2());
  assert.equal(r.created, true);
  assert.equal(r.revision.rev, 'B');
  // previous rev now superseded
  const list = vc.listRevisions('BRK-100');
  assert.equal(list.length, 2);
  assert.equal(list[0].status, STATUS.SUPERSEDED);
  assert.equal(list[1].status, STATUS.DRAFT);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 4. Alpha-rev sequence — A through AA
 * ───────────────────────────────────────────────────────────────────────── */

test('04. alpha rev generator: A → Z → AA → AB', () => {
  assert.equal(_internals._nextMajorRev(), 'A');
  assert.equal(_internals._nextMajorRev('A'), 'B');
  assert.equal(_internals._nextMajorRev('Y'), 'Z');
  assert.equal(_internals._nextMajorRev('Z'), 'AA');
  assert.equal(_internals._nextMajorRev('AA'), 'AB');
  assert.equal(_internals._nextMajorRev('AZ'), 'BA');
  assert.equal(_internals._nextMajorRev('ZZ'), 'AAA');
});

/* ─────────────────────────────────────────────────────────────────────────
 * 5. Index/alpha round-trip
 * ───────────────────────────────────────────────────────────────────────── */

test('05. alpha index round-trip is bijective for 1..1000', () => {
  for (let i = 1; i <= 1000; i++) {
    const a = _internals._indexToAlpha(i);
    assert.equal(_internals._alphaToIndex(a), i, 'failed @ ' + i);
  }
});

/* ─────────────────────────────────────────────────────────────────────────
 * 6. Numeric sub-rev: A → A.1 → A.2
 * ───────────────────────────────────────────────────────────────────────── */

test('06. numeric sub-rev creates A.1, then A.2', () => {
  const vc = new DrawingVC();
  vc.uploadDrawing(bracketDwgV1());
  const sub1 = vc.uploadDrawing(Object.assign({}, bracketDwgV2(), { subRev: true }));
  assert.equal(sub1.revision.rev, 'A.1');
  const sub2 = vc.uploadDrawing(Object.assign({}, bracketDwgV3(), { subRev: true }));
  assert.equal(sub2.revision.rev, 'A.2');
});

/* ─────────────────────────────────────────────────────────────────────────
 * 7. Explicit rev override (migration imports)
 * ───────────────────────────────────────────────────────────────────────── */

test('07. explicit rev override is honoured for migration', () => {
  const vc = new DrawingVC();
  const r = vc.uploadDrawing(Object.assign({}, bracketDwgV1(), { rev: 'C' }));
  assert.equal(r.revision.rev, 'C');
});

/* ─────────────────────────────────────────────────────────────────────────
 * 8. Duplicate explicit rev rejected
 * ───────────────────────────────────────────────────────────────────────── */

test('08. duplicate explicit rev throws', () => {
  const vc = new DrawingVC();
  vc.uploadDrawing(Object.assign({}, bracketDwgV1(), { rev: 'C' }));
  assert.throws(
    () => vc.uploadDrawing(Object.assign({}, bracketDwgV2(), { rev: 'C' })),
    /already exists/
  );
});

/* ─────────────────────────────────────────────────────────────────────────
 * 9. Dual-approval requirement — single approval not enough
 * ───────────────────────────────────────────────────────────────────────── */

test('09. one approval is not enough — status stays in-review', () => {
  const vc = new DrawingVC();
  vc.uploadDrawing(bracketDwgV1());
  const r1 = vc.approveRevision('BRK-100', 'A', 'qa.shira', 'qa');
  assert.equal(r1.complete, false);
  assert.deepEqual(r1.missingRoles, ['design-lead']);
  assert.equal(r1.revision.status, STATUS.IN_REVIEW);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 10. Both approvals → status flips to approved
 * ───────────────────────────────────────────────────────────────────────── */

test('10. QA + design-lead approvals flip status to approved', () => {
  const vc = new DrawingVC();
  vc.uploadDrawing(bracketDwgV1());
  vc.approveRevision('BRK-100', 'A', 'qa.shira', 'qa');
  const r2 = vc.approveRevision('BRK-100', 'A', 'eng.uzi', 'design-lead');
  assert.equal(r2.complete, true);
  assert.deepEqual(r2.missingRoles, []);
  assert.equal(r2.revision.status, STATUS.APPROVED);
  assert.equal(r2.revision.approvals.length, 2);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 11. Invalid approval role rejected
 * ───────────────────────────────────────────────────────────────────────── */

test('11. invalid approval role is rejected', () => {
  const vc = new DrawingVC();
  vc.uploadDrawing(bracketDwgV1());
  assert.throws(
    () => vc.approveRevision('BRK-100', 'A', 'random.user', 'manager'),
    /invalid approval role/
  );
});

/* ─────────────────────────────────────────────────────────────────────────
 * 12. freezeRevision requires approved status
 * ───────────────────────────────────────────────────────────────────────── */

test('12. freezeRevision requires approved status', () => {
  const vc = new DrawingVC();
  vc.uploadDrawing(bracketDwgV1());
  assert.throws(() => vc.freezeRevision('BRK-100', 'A'), /only an approved/);
  vc.approveRevision('BRK-100', 'A', 'qa.shira', 'qa');
  vc.approveRevision('BRK-100', 'A', 'eng.uzi', 'design-lead');
  const f = vc.freezeRevision('BRK-100', 'A');
  assert.equal(f.status, STATUS.FROZEN);
  assert.ok(f.frozenAt);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 13. Frozen rev cannot be auto-superseded — needs {force:true}
 * ───────────────────────────────────────────────────────────────────────── */

test('13. frozen rev blocks auto supersede; force:true allows it', () => {
  const vc = new DrawingVC();
  vc.uploadDrawing(bracketDwgV1());
  vc.approveRevision('BRK-100', 'A', 'qa.shira', 'qa');
  vc.approveRevision('BRK-100', 'A', 'eng.uzi', 'design-lead');
  vc.freezeRevision('BRK-100', 'A');

  assert.throws(
    () => vc.uploadDrawing(bracketDwgV2()),
    /cannot supersede frozen/
  );

  const forced = vc.uploadDrawing(Object.assign({}, bracketDwgV2(), { force: true }));
  assert.equal(forced.created, true);
  assert.equal(forced.revision.rev, 'B');

  // frozen rev stays frozen, NOT superseded
  const a = vc.getDrawing('BRK-100', 'A');
  assert.equal(a.status, STATUS.FROZEN);
  // new rev is the active one
  const latest = vc.getDrawing('BRK-100');
  assert.equal(latest.rev, 'B');
});

/* ─────────────────────────────────────────────────────────────────────────
 * 14. Frozen rev allows sub-rev without force
 * ───────────────────────────────────────────────────────────────────────── */

test('14. frozen rev allows sub-rev (A → A.1) without force', () => {
  const vc = new DrawingVC();
  vc.uploadDrawing(bracketDwgV1());
  vc.approveRevision('BRK-100', 'A', 'qa.shira', 'qa');
  vc.approveRevision('BRK-100', 'A', 'eng.uzi', 'design-lead');
  vc.freezeRevision('BRK-100', 'A');
  const sub = vc.uploadDrawing(Object.assign({}, bracketDwgV2(), { subRev: true }));
  assert.equal(sub.revision.rev, 'A.1');
});

/* ─────────────────────────────────────────────────────────────────────────
 * 15. compare returns correct diff
 * ───────────────────────────────────────────────────────────────────────── */

test('15. compare reports checksum + size diff with bilingual summary', () => {
  const vc = new DrawingVC();
  vc.uploadDrawing(bracketDwgV1());
  vc.uploadDrawing(bracketDwgV2());
  const cmp = vc.compare('BRK-100/A', 'BRK-100/B');
  assert.equal(cmp.checksumChanged, true);
  assert.notEqual(cmp.sizeDelta, 0);
  assert.match(cmp.summary_en, /SHA-256 fingerprint changed/);
  assert.match(cmp.summary_he, /טביעת אצבע SHA-256 השתנתה/);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 16. linkToBOM is bidirectional
 * ───────────────────────────────────────────────────────────────────────── */

test('16. linkToBOM stores BOM id and returns reverse-link descriptor', () => {
  const vc = new DrawingVC();
  vc.uploadDrawing(bracketDwgV1());
  const link = vc.linkToBOM('BRK-100', 'A', 'BOM-2026-0042');
  assert.equal(link.bomId, 'BOM-2026-0042');
  assert.equal(link.bidirectional, true);
  assert.match(link.reverse_link_en, /BOM-2026-0042/);
  assert.match(link.reverse_link_he, /BRK-100/);

  const drawing = vc.getDrawing('BRK-100', 'A');
  assert.deepEqual(drawing.links.boms, ['BOM-2026-0042']);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 17. linkToWorkOrder is bidirectional
 * ───────────────────────────────────────────────────────────────────────── */

test('17. linkToWorkOrder stores WO id and returns reverse-link descriptor', () => {
  const vc = new DrawingVC();
  vc.uploadDrawing(bracketDwgV1());
  const link = vc.linkToWorkOrder('BRK-100', 'A', 'WO-2026-0099');
  assert.equal(link.woId, 'WO-2026-0099');
  assert.equal(link.bidirectional, true);

  const drawing = vc.getDrawing('BRK-100', 'A');
  assert.deepEqual(drawing.links.wos, ['WO-2026-0099']);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 18. watermark stamps bilingual text and preserves original
 * ───────────────────────────────────────────────────────────────────────── */

test('18. watermark appends bilingual stamp without corrupting original', () => {
  const vc = new DrawingVC();
  const original = Buffer.from('PDF-PAYLOAD', 'utf8');
  const wm = vc.watermark(original);
  assert.ok(wm.annotatedSize > wm.originalSize);
  assert.match(wm.text, /שליטת גרסה/);
  assert.match(wm.text, /Version Control/);
  // original buffer was untouched
  assert.equal(original.toString('utf8'), 'PDF-PAYLOAD');
  // annotated contains the watermark markers
  assert.match(wm.buffer.toString('utf8'), /WATERMARK-START/);
  assert.match(wm.buffer.toString('utf8'), /WATERMARK-END/);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 19. exportHistoryReport produces bilingual markdown
 * ───────────────────────────────────────────────────────────────────────── */

test('19. exportHistoryReport contains Hebrew + English headings + standards', () => {
  const vc = new DrawingVC();
  vc.uploadDrawing(bracketDwgV1());
  vc.uploadDrawing(bracketDwgV2());
  vc.approveRevision('BRK-100', 'B', 'qa.shira', 'qa');
  vc.approveRevision('BRK-100', 'B', 'eng.uzi', 'design-lead');
  vc.linkToBOM('BRK-100', 'B', 'BOM-2026-0042');
  vc.linkToWorkOrder('BRK-100', 'B', 'WO-2026-0099');
  const md = vc.exportHistoryReport('BRK-100');
  assert.match(md, /Drawing History/);
  assert.match(md, /היסטוריית שרטוט/);
  assert.match(md, /Revision A/);
  assert.match(md, /Revision B/);
  assert.match(md, /BOM-2026-0042/);
  assert.match(md, /WO-2026-0099/);
  assert.match(md, /ISO 128/);
  assert.match(md, /ASME Y14\.5/);
  assert.match(md, /qa\.shira/);
  assert.match(md, /eng\.uzi/);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 20. search by partNumber, author, status, free-text
 * ───────────────────────────────────────────────────────────────────────── */

test('20. search filters by partNumber/author/status and free-text', () => {
  const vc = new DrawingVC();
  vc.uploadDrawing(bracketDwgV1());
  vc.uploadDrawing({
    partNumber: 'PIPE-200',
    fileBuffer: Buffer.from('PIPE-CONTENT', 'utf8'),
    format: 'STEP',
    author: 'Yossi Levi',
    notes: 'Stainless 316 elbow',
  });
  vc.uploadDrawing({
    partNumber: 'WLD-300',
    fileBuffer: Buffer.from('WLDMENT', 'utf8'),
    format: 'DXF',
    author: 'Avi Cohen',
    notes: 'Welded base plate',
  });

  // free-text matches notes substring
  const elbowHits = vc.search('elbow');
  assert.equal(elbowHits.length, 1);
  assert.equal(elbowHits[0].partNumber, 'PIPE-200');

  // filter by author
  const aviHits = vc.search('', { author: 'Avi' });
  assert.equal(aviHits.length, 2);

  // filter by partNumber
  const brkHits = vc.search('', { partNumber: 'BRK-100' });
  assert.equal(brkHits.length, 1);

  // filter by status
  const draftHits = vc.search('', { status: STATUS.DRAFT });
  assert.equal(draftHits.length, 3);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 21. Audit log monotonic growth
 * ───────────────────────────────────────────────────────────────────────── */

test('21. audit log grows monotonically and never shrinks', () => {
  const vc = new DrawingVC();
  vc.uploadDrawing(bracketDwgV1());
  vc.uploadDrawing(bracketDwgV2());
  vc.approveRevision('BRK-100', 'B', 'qa.shira', 'qa');
  vc.approveRevision('BRK-100', 'B', 'eng.uzi', 'design-lead');
  vc.linkToBOM('BRK-100', 'B', 'BOM-2026-0042');

  const len = vc.auditLog.length;
  assert.ok(len >= 5, 'expected at least 5 audit events, got ' + len);
  for (let i = 0; i < vc.auditLog.length; i++) {
    assert.equal(vc.auditLog[i].seq, i + 1);
    assert.ok(vc.auditLog[i].at);
    assert.ok(vc.auditLog[i].action);
  }
});

/* ─────────────────────────────────────────────────────────────────────────
 * 22. supersedeRevision keeps the record (never deletes)
 * ───────────────────────────────────────────────────────────────────────── */

test('22. supersedeRevision keeps the record in history forever', () => {
  const vc = new DrawingVC();
  vc.uploadDrawing(bracketDwgV1());
  vc.uploadDrawing(bracketDwgV2());
  vc.supersedeRevision('BRK-100', 'B', 'design recall');
  const list = vc.listRevisions('BRK-100');
  assert.equal(list.length, 2);  // both still there
  assert.equal(list[1].status, STATUS.SUPERSEDED);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 23. getDrawing returns null for unknown part
 * ───────────────────────────────────────────────────────────────────────── */

test('23. getDrawing returns null for unknown part / unknown rev', () => {
  const vc = new DrawingVC();
  assert.equal(vc.getDrawing('NOPE'), null);
  vc.uploadDrawing(bracketDwgV1());
  assert.equal(vc.getDrawing('BRK-100', 'Z'), null);
  const ok = vc.getDrawing('BRK-100');
  assert.equal(ok.rev, 'A');
});

/* ─────────────────────────────────────────────────────────────────────────
 * 24. Unknown format rejected
 * ───────────────────────────────────────────────────────────────────────── */

test('24. unknown format is rejected', () => {
  const vc = new DrawingVC();
  assert.throws(
    () => vc.uploadDrawing(Object.assign({}, bracketDwgV1(), { format: 'BMP' })),
    /unknown format/
  );
});

/* ─────────────────────────────────────────────────────────────────────────
 * 25. Cannot approve a superseded revision
 * ───────────────────────────────────────────────────────────────────────── */

test('25. cannot approve a superseded revision', () => {
  const vc = new DrawingVC();
  vc.uploadDrawing(bracketDwgV1());
  vc.uploadDrawing(bracketDwgV2());
  // rev A is now superseded
  assert.throws(
    () => vc.approveRevision('BRK-100', 'A', 'qa.shira', 'qa'),
    /superseded/
  );
});

/* ─────────────────────────────────────────────────────────────────────────
 * 26. DRAWING_FORMATS catalog covers all required formats
 * ───────────────────────────────────────────────────────────────────────── */

test('26. DRAWING_FORMATS includes DWG/DXF/PDF/STEP/IGES with bilingual labels', () => {
  for (const f of ['DWG', 'DXF', 'PDF', 'STEP', 'IGES']) {
    assert.ok(DRAWING_FORMATS[f], 'missing format ' + f);
    assert.ok(DRAWING_FORMATS[f].he);
    assert.ok(DRAWING_FORMATS[f].en);
    assert.ok(DRAWING_FORMATS[f].standardRef);
  }
  assert.deepEqual(REQUIRED_APPROVAL_ROLES.slice().sort(), ['design-lead', 'qa']);
});
