/**
 * Unit tests for WatermarkTool — document watermark & stamp tool
 * Agent Y-119 — written 2026-04-11
 *
 * Run:   node --test test/docs/watermark.test.js
 *
 * Coverage (>=18 tests):
 *   01. applyVisibleWatermark — top-left
 *   02. applyVisibleWatermark — top-right
 *   03. applyVisibleWatermark — bottom-left
 *   04. applyVisibleWatermark — bottom-right
 *   05. applyVisibleWatermark — center
 *   06. applyVisibleWatermark — diagonal sets 45deg rotation
 *   07. applyVisibleWatermark — invalid position throws
 *   08. applyVisibleWatermark — opacity out of [0,1] throws
 *   09. applyInvisibleWatermark — missing metadata field throws
 *   10. applyInvisibleWatermark — produces stable SHA-256 hash
 *   11. applyTimestamp — ISO format
 *   12. applyTimestamp — Hebrew format contains גרגוריאני
 *   13. applyTimestamp — Hebrew withJewish adds עברי
 *   14. applyTimestamp — short format dd/mm/yyyy
 *   15. applyConfidentialitySeal — all 5 levels bilingual + palette
 *   16. applyConfidentialitySeal — invalid level throws
 *   17. applyDynamicWatermark — template substitution
 *   18. applyDynamicWatermark — unknown variables left literal
 *   19. verifyWatermark — authentic metadata returns ok
 *   20. verifyWatermark — tampered metadata returns HASH_MISMATCH
 *   21. extractWatermarks — returns all + includes hidden
 *   22. removeWatermark — soft-remove preserves record & audit
 *   23. removeWatermark — without justification throws
 *   24. bulkApply — applies confidentiality seal to many docs
 *   25. bulkApply — reports partial failures
 *   26. auditTrail — monotonic growth, immutable to callers
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  WatermarkTool,
  POSITIONS,
  CONFIDENTIALITY_LEVELS,
  WM_STATUS,
  sha256Hex,
  stableStringify,
  substituteTemplate,
} = require('../../src/docs/watermark');

/* Fixed clock for deterministic hashes where needed. */
function fixedClock(iso) {
  const d = new Date(iso);
  return () => new Date(d.getTime());
}

/* ---------- 01-06: positions ---------- */

test('01 visible watermark — top-left position', () => {
  const wm = new WatermarkTool();
  const rec = wm.applyVisibleWatermark({
    docId: 'DOC-1', text: 'DRAFT', position: 'top-left', opacity: 0.5,
  });
  assert.equal(rec.spec.position, 'top-left');
  assert.equal(rec.spec.anchor.x, 'left');
  assert.equal(rec.spec.anchor.y, 'top');
  assert.equal(rec.spec.positionLabel.he, 'שמאל-עליון');
});

test('02 visible watermark — top-right position', () => {
  const wm = new WatermarkTool();
  const rec = wm.applyVisibleWatermark({
    docId: 'DOC-2', text: 'PREVIEW', position: 'top-right',
  });
  assert.equal(rec.spec.anchor.x, 'right');
  assert.equal(rec.spec.anchor.y, 'top');
});

test('03 visible watermark — bottom-left position', () => {
  const wm = new WatermarkTool();
  const rec = wm.applyVisibleWatermark({
    docId: 'DOC-3', text: 'SAMPLE', position: 'bottom-left',
  });
  assert.equal(rec.spec.anchor.x, 'left');
  assert.equal(rec.spec.anchor.y, 'bottom');
});

test('04 visible watermark — bottom-right position', () => {
  const wm = new WatermarkTool();
  const rec = wm.applyVisibleWatermark({
    docId: 'DOC-4', text: 'COPY', position: 'bottom-right',
  });
  assert.equal(rec.spec.anchor.x, 'right');
  assert.equal(rec.spec.anchor.y, 'bottom');
});

test('05 visible watermark — center position', () => {
  const wm = new WatermarkTool();
  const rec = wm.applyVisibleWatermark({
    docId: 'DOC-5', text: 'CENTER', position: 'center',
  });
  assert.equal(rec.spec.anchor.x, 'center');
  assert.equal(rec.spec.anchor.y, 'center');
  assert.equal(rec.spec.rotation, 0);
});

test('06 visible watermark — diagonal sets 45deg rotation', () => {
  const wm = new WatermarkTool();
  const rec = wm.applyVisibleWatermark({
    docId: 'DOC-6', text: 'CONFIDENTIAL', position: 'diagonal', opacity: 0.3,
  });
  assert.equal(rec.spec.position, 'diagonal');
  assert.equal(rec.spec.rotation, 45);
});

/* ---------- 07-08: input validation ---------- */

test('07 visible watermark — invalid position throws', () => {
  const wm = new WatermarkTool();
  assert.throws(
    () => wm.applyVisibleWatermark({ docId: 'X', text: 'T', position: 'nowhere' }),
    /POSITION_INVALID/,
  );
});

test('08 visible watermark — opacity out of range throws', () => {
  const wm = new WatermarkTool();
  assert.throws(
    () => wm.applyVisibleWatermark({ docId: 'X', text: 'T', position: 'center', opacity: 2 }),
    /OPACITY_OUT_OF_RANGE/,
  );
});

/* ---------- 09-10: invisible / metadata hash ---------- */

test('09 invisible watermark — missing required metadata field throws', () => {
  const wm = new WatermarkTool();
  assert.throws(
    () => wm.applyInvisibleWatermark({
      docId: 'X',
      metadata: { owner: 'alice', recipient: 'bob', purpose: 'contract' }, // no timestamp
    }),
    /METADATA_MISSING_FIELD: timestamp/,
  );
});

test('10 invisible watermark — produces stable SHA-256 hash', () => {
  const wm = new WatermarkTool();
  const meta = {
    owner: 'CFO@technokol',
    timestamp: '2026-04-11T08:00:00Z',
    recipient: 'legal@partner.co.il',
    purpose: 'שותפות-אסטרטגית',
  };
  const rec = wm.applyInvisibleWatermark({ docId: 'DOC-10', metadata: meta });
  const expectedHash = sha256Hex(stableStringify({
    owner: meta.owner,
    timestamp: meta.timestamp,
    recipient: meta.recipient,
    purpose: meta.purpose,
  }));
  assert.equal(rec.payloadHash, expectedHash);
  assert.match(rec.integrityHash, /^[a-f0-9]{64}$/);
});

/* ---------- 11-14: timestamp ---------- */

test('11 applyTimestamp — ISO format', () => {
  const wm = new WatermarkTool({ clock: fixedClock('2026-04-11T08:15:30.000Z') });
  const rec = wm.applyTimestamp({ docId: 'T1', format: 'ISO' });
  assert.equal(rec.spec.rendered, '2026-04-11T08:15:30.000Z');
  assert.equal(rec.spec.format, 'ISO');
});

test('12 applyTimestamp — Hebrew format contains גרגוריאני', () => {
  const wm = new WatermarkTool({ clock: fixedClock('2026-04-11T10:00:00Z') });
  const rec = wm.applyTimestamp({ docId: 'T2', format: 'Hebrew' });
  assert.match(rec.spec.rendered, /גרגוריאני/);
  assert.match(rec.spec.rendered, /אפריל/);
  assert.match(rec.spec.rendered, /2026/);
});

test('13 applyTimestamp — Hebrew withJewish adds עברי addendum', () => {
  const wm = new WatermarkTool({ clock: fixedClock('2026-04-11T10:00:00Z') });
  const rec = wm.applyTimestamp({ docId: 'T3', format: 'Hebrew', withJewish: true });
  assert.match(rec.spec.rendered, /גרגוריאני/);
  assert.match(rec.spec.rendered, /עברי/);
  assert.equal(rec.spec.withJewish, true);
});

test('14 applyTimestamp — short format dd/mm/yyyy', () => {
  const wm = new WatermarkTool({ clock: fixedClock('2026-04-11T10:00:00Z') });
  const rec = wm.applyTimestamp({ docId: 'T4', format: 'short' });
  // Timezone-agnostic: ensure it matches dd/mm/yyyy shape around the expected date
  assert.match(rec.spec.rendered, /^\d{2}\/\d{2}\/\d{4}$/);
  assert.match(rec.spec.rendered, /\/2026$/);
});

/* ---------- 15-16: confidentiality seal ---------- */

test('15 confidentiality seal — all 5 levels bilingual + palette', () => {
  const wm = new WatermarkTool();
  const expected = {
    public:       { he: 'ציבורי',         en: 'Public',       color: '#2E7D32' },
    internal:     { he: 'פנימי',          en: 'Internal',     color: '#1565C0' },
    confidential: { he: 'חסוי',           en: 'Confidential', color: '#EF6C00' },
    restricted:   { he: 'מוגבל',          en: 'Restricted',   color: '#C62828' },
    secret:       { he: 'סודי ביותר',     en: 'Secret',       color: '#4A148C' },
  };
  let rank = 0;
  for (const level of Object.keys(expected)) {
    const rec = wm.applyConfidentialitySeal({ docId: `C-${level}`, level });
    assert.equal(rec.spec.level, level);
    assert.equal(rec.spec.labels.he, expected[level].he);
    assert.equal(rec.spec.labels.en, expected[level].en);
    assert.equal(rec.spec.color, expected[level].color);
    assert.equal(rec.spec.bilingualText, `${expected[level].he} / ${expected[level].en}`);
    assert.ok(rec.spec.rank > rank, 'rank must strictly increase across levels');
    rank = rec.spec.rank;
  }
  assert.equal(rank, 5, 'highest rank must be 5 (secret)');
});

test('16 confidentiality seal — invalid level throws', () => {
  const wm = new WatermarkTool();
  assert.throws(
    () => wm.applyConfidentialitySeal({ docId: 'X', level: 'top_secret' }),
    /LEVEL_INVALID/,
  );
});

/* ---------- 17-18: dynamic watermark / template ---------- */

test('17 dynamic watermark — substitutes recipient / date / email / doc_id', () => {
  const wm = new WatermarkTool({ clock: fixedClock('2026-04-11T00:00:00Z') });
  const rec = wm.applyDynamicWatermark({
    docId: 'DYN-1',
    template: 'Sent to {recipient} <{recipient_email}> on {date} — ref {doc_id}',
    context: { recipient: 'Yossi Cohen', recipient_email: 'yossi@partner.co.il' },
  });
  assert.equal(
    rec.spec.rendered,
    'Sent to Yossi Cohen <yossi@partner.co.il> on 2026-04-11 — ref DYN-1',
  );
});

test('18 dynamic watermark — unknown variables remain literal', () => {
  const wm = new WatermarkTool();
  const rec = wm.applyDynamicWatermark({
    docId: 'DYN-2',
    template: 'Hello {unknown_var} and {recipient}',
    context: { recipient: 'Ruth' },
  });
  assert.match(rec.spec.rendered, /\{unknown_var\}/);
  assert.match(rec.spec.rendered, /Ruth/);
});

/* ---------- 19-20: verifyWatermark integrity ---------- */

test('19 verifyWatermark — authentic metadata returns ok', () => {
  const wm = new WatermarkTool();
  const meta = {
    owner: 'CEO',
    timestamp: '2026-04-11T08:00:00Z',
    recipient: 'board',
    purpose: 'quarterly-review',
  };
  wm.applyInvisibleWatermark({ docId: 'V-1', metadata: meta });
  const verdict = wm.verifyWatermark('V-1', meta);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.he, 'חותמת אותנטית');
  assert.equal(verdict.en, 'Authentic watermark');
});

test('20 verifyWatermark — tampered metadata returns HASH_MISMATCH', () => {
  const wm = new WatermarkTool();
  wm.applyInvisibleWatermark({
    docId: 'V-2',
    metadata: { owner: 'CEO', timestamp: 'T', recipient: 'board', purpose: 'X' },
  });
  const verdict = wm.verifyWatermark('V-2', {
    owner: 'CEO', timestamp: 'T', recipient: 'board', purpose: 'TAMPERED',
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'HASH_MISMATCH');
});

/* ---------- 21-23: extract + soft-remove ---------- */

test('21 extractWatermarks — returns all watermarks including hidden', () => {
  const wm = new WatermarkTool();
  wm.applyVisibleWatermark({ docId: 'E-1', text: 'A', position: 'center' });
  const r2 = wm.applyVisibleWatermark({ docId: 'E-1', text: 'B', position: 'diagonal' });
  wm.applyConfidentialitySeal({ docId: 'E-1', level: 'confidential' });
  wm.removeWatermark('E-1', r2.id, 'מיותר לטיוטה הזו');
  const all = wm.extractWatermarks('E-1');
  assert.equal(all.length, 3);
  const hidden = all.filter(r => r.status === WM_STATUS.hidden.id);
  assert.equal(hidden.length, 1);
  assert.equal(hidden[0].id, r2.id);
});

test('22 removeWatermark — soft-remove preserves record and audit log', () => {
  const wm = new WatermarkTool();
  const rec = wm.applyVisibleWatermark({
    docId: 'R-1', text: 'OLD', position: 'diagonal',
  });
  const before = wm.extractWatermarks('R-1')[0];
  assert.equal(before.status, WM_STATUS.active.id);

  wm.removeWatermark('R-1', rec.id, 'מעדכנים לגרסה חדשה');

  const after = wm.extractWatermarks('R-1')[0];
  assert.equal(after.id, before.id, 'record id preserved');
  assert.equal(after.status, WM_STATUS.hidden.id, 'status flipped to hidden');
  assert.equal(after.spec.text, 'OLD', 'original spec preserved');
  assert.equal(after.hiddenJustification, 'מעדכנים לגרסה חדשה');

  // Audit log contains apply + soft-remove.
  const audit = wm.auditTrail('R-1');
  const actions = audit.map(a => a.action);
  assert.deepEqual(actions, ['apply', 'soft-remove']);
});

test('23 removeWatermark — without justification throws', () => {
  const wm = new WatermarkTool();
  const rec = wm.applyVisibleWatermark({
    docId: 'R-2', text: 'X', position: 'center',
  });
  assert.throws(
    () => wm.removeWatermark('R-2', rec.id, ''),
    /JUSTIFICATION_REQUIRED/,
  );
  assert.throws(
    () => wm.removeWatermark('R-2', rec.id),
    /JUSTIFICATION_REQUIRED/,
  );
});

/* ---------- 24-25: bulkApply ---------- */

test('24 bulkApply — applies confidentiality seal to many docs', () => {
  const wm = new WatermarkTool();
  const docs = ['BULK-1', 'BULK-2', 'BULK-3', 'BULK-4'];
  const result = wm.bulkApply(docs, { type: 'confidentiality', level: 'restricted' });
  assert.equal(result.total, 4);
  assert.equal(result.succeeded, 4);
  assert.equal(result.failed, 0);
  for (const docId of docs) {
    const wms = wm.extractWatermarks(docId);
    assert.equal(wms.length, 1);
    assert.equal(wms[0].spec.level, 'restricted');
    assert.equal(wms[0].spec.labels.he, 'מוגבל');
  }
});

test('25 bulkApply — reports partial failures without aborting', () => {
  const wm = new WatermarkTool();
  const result = wm.bulkApply(['OK-1', 'OK-2', 'BAD-1'], {
    type: 'visible',
    text: 'DRAFT',
    position: 'center',
    // For BAD-1 we rely on the caller to override — but here all three are
    // valid at this point. We'll simulate a failing doc by passing an invalid
    // position via a separate call.
  });
  assert.equal(result.succeeded, 3);

  const result2 = wm.bulkApply(['X', 'Y'], {
    type: 'visible', text: 'T', position: 'nowhere',
  });
  assert.equal(result2.failed, 2);
  assert.equal(result2.succeeded, 0);
  assert.match(result2.results[0].error, /POSITION_INVALID/);
});

/* ---------- 26: audit trail ---------- */

test('26 auditTrail — monotonic growth + immutable to callers', () => {
  const wm = new WatermarkTool();
  wm.applyVisibleWatermark({ docId: 'A-1', text: 'T', position: 'center' });
  wm.applyConfidentialitySeal({ docId: 'A-1', level: 'confidential' });
  wm.applyInvisibleWatermark({
    docId: 'A-1',
    metadata: { owner: 'o', timestamp: 't', recipient: 'r', purpose: 'p' },
  });
  const trail1 = wm.auditTrail('A-1');
  assert.equal(trail1.length, 3);

  // Mutation attempt on the returned snapshot must not affect internal state.
  try { trail1.push({ action: 'HACK' }); } catch (_) { /* ok if frozen */ }
  const trail2 = wm.auditTrail('A-1');
  assert.equal(trail2.length, 3, 'internal audit log unchanged');

  // Growth is monotonic after more operations.
  wm.applyTimestamp({ docId: 'A-1', format: 'ISO' });
  const trail3 = wm.auditTrail('A-1');
  assert.equal(trail3.length, 4);
  // Entries are ordered earliest→latest.
  const ts = trail3.map(e => e.ts);
  const sorted = [...ts].sort();
  assert.deepEqual(ts, sorted, 'audit entries must be chronologically ordered');
});

/* ---------- 27: helper sanity ---------- */

test('27 substituteTemplate — pure helper handles missing context', () => {
  assert.equal(substituteTemplate('{a}-{b}', { a: 1, b: 2 }), '1-2');
  assert.equal(substituteTemplate('{a}-{b}', { a: 1 }), '1-{b}');
  assert.equal(substituteTemplate('plain', {}), 'plain');
});
