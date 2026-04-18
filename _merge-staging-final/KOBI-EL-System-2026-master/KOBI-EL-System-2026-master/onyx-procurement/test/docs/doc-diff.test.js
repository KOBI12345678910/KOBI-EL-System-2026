/* ============================================================================
 * Techno-Kol ERP — DocDiff tests
 * Agent Y-117 — node:test suite
 *
 * Runs with:  node --test test/docs/doc-diff.test.js
 * ========================================================================== */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  DocDiff,
  DIFF_OPS,
  LABELS,
  _internals,
} = require('../../src/docs/doc-diff');

const dd = new DocDiff();

/* ----------------------------------------------------------------------------
 * Section A — Myers line-level diff correctness
 * -------------------------------------------------------------------------- */

test('A1 — identical inputs produce only equal ops', () => {
  const a = 'one\ntwo\nthree';
  const b = 'one\ntwo\nthree';
  const diff = dd.diffLines(a, b);
  assert.equal(diff.length, 3);
  for (const d of diff) assert.equal(d.op, 'equal');
  assert.deepEqual(diff.map((d) => d.line), ['one', 'two', 'three']);
});

test('A2 — empty vs non-empty is all insertions', () => {
  const diff = dd.diffLines('', 'hello\nworld');
  assert.equal(diff.length, 2);
  assert.equal(diff[0].op, 'insert');
  assert.equal(diff[1].op, 'insert');
  assert.equal(diff[0].line, 'hello');
  assert.equal(diff[1].line, 'world');
});

test('A3 — non-empty vs empty is all deletions', () => {
  const diff = dd.diffLines('alpha\nbeta', '');
  assert.equal(diff.length, 2);
  assert.equal(diff[0].op, 'delete');
  assert.equal(diff[1].op, 'delete');
});

test('A4 — single line change yields delete+insert', () => {
  const a = 'first\nSECOND\nthird';
  const b = 'first\nsecond\nthird';
  const diff = dd.diffLines(a, b);
  const ops = diff.map((d) => d.op);
  assert.ok(ops.includes('delete'));
  assert.ok(ops.includes('insert'));
  // Patch round-trip.
  assert.equal(dd.patch(a, diff), b);
});

test('A5 — Myers minimality: inserting one line in the middle adds exactly 1 op', () => {
  const a = ['a', 'b', 'c', 'd', 'e'].join('\n');
  const b = ['a', 'b', 'X', 'c', 'd', 'e'].join('\n');
  const diff = dd.diffLines(a, b);
  const inserts = diff.filter((d) => d.op === 'insert');
  const deletes = diff.filter((d) => d.op === 'delete');
  assert.equal(inserts.length, 1);
  assert.equal(deletes.length, 0);
  assert.equal(inserts[0].line, 'X');
});

test('A6 — CRLF vs LF are normalized identically', () => {
  const a = 'foo\r\nbar\r\nbaz';
  const b = 'foo\nbar\nbaz';
  const diff = dd.diffLines(a, b);
  assert.equal(diff.every((d) => d.op === 'equal'), true);
});

/* ----------------------------------------------------------------------------
 * Section B — Word-level diff
 * -------------------------------------------------------------------------- */

test('B1 — word diff identifies a single replaced word', () => {
  const a = 'the quick brown fox';
  const b = 'the quick red fox';
  const diff = dd.diffWords(a, b);
  const deleted = diff.filter((d) => d.op === 'delete').map((d) => d.token);
  const inserted = diff.filter((d) => d.op === 'insert').map((d) => d.token);
  assert.ok(deleted.includes('brown'));
  assert.ok(inserted.includes('red'));
});

test('B2 — word diff preserves whitespace tokens', () => {
  const a = 'a  b';   // two spaces
  const b = 'a b';    // one space
  const diff = dd.diffWords(a, b);
  // Reconstruct from kept+inserted to confirm round-trip of B.
  const rebuilt = diff
    .filter((d) => d.op !== 'delete')
    .map((d) => d.token)
    .join('');
  assert.equal(rebuilt, b);
});

/* ----------------------------------------------------------------------------
 * Section C — Character-level diff and Hebrew safety
 * -------------------------------------------------------------------------- */

test('C1 — char diff treats nikkud as attached to base letter', () => {
  // Same text, once with and once without nikkud on the letter ב.
  // Without nikkud the letter takes 1 grapheme; with nikkud it is still 1
  // grapheme because the dagesh U+05BC is combining. The diff should report
  // 1 delete + 1 insert for that character only, NOT per codepoint.
  const a = 'בית'; // no nikkud
  const b = 'בִּית'; // hiriq + dagesh on ב
  const diff = dd.diffChars(a, b);
  const deletes = diff.filter((d) => d.op === 'delete');
  const inserts = diff.filter((d) => d.op === 'insert');
  // exactly one delete and one insert — the ב (bet) glyph cluster.
  assert.equal(deletes.length, 1);
  assert.equal(inserts.length, 1);
  assert.equal(deletes[0].char, 'ב');
  assert.equal(inserts[0].char, 'בִּ');
});

test('C2 — final letters vs medial forms are distinct graphemes', () => {
  // "ממ" (medial-medial) vs "ם" (final) — they should NOT compare equal.
  const diff = dd.diffChars('ממ', 'ם');
  const kept = diff.filter((d) => d.op === 'equal');
  assert.equal(kept.length, 0);
});

test('C3 — mixed Hebrew + English + digits line diff', () => {
  const a = 'חשבונית 2026-001 ILS';
  const b = 'חשבונית 2026-002 ILS';
  const diff = dd.diffWords(a, b);
  const deleted = diff.filter((d) => d.op === 'delete').map((d) => d.token);
  const inserted = diff.filter((d) => d.op === 'insert').map((d) => d.token);
  assert.ok(deleted.includes('2026-001'));
  assert.ok(inserted.includes('2026-002'));
  // "חשבונית" and "ILS" must both remain equal.
  const keptWords = diff.filter((d) => d.op === 'equal').map((d) => d.token);
  assert.ok(keptWords.includes('חשבונית'));
  assert.ok(keptWords.includes('ILS'));
});

test('C4 — pure Hebrew line diff round-trips', () => {
  const a = 'שורה ראשונה\nשורה שנייה\nשורה שלישית';
  const b = 'שורה ראשונה\nשורה שונתה\nשורה שלישית';
  const diff = dd.diffLines(a, b);
  assert.equal(dd.patch(a, diff), b);
  assert.equal(dd.reversePatch(b, diff), a);
});

/* ----------------------------------------------------------------------------
 * Section D — Sectioned diff
 * -------------------------------------------------------------------------- */

test('D1 — diffSections splits by markdown-style headers', () => {
  const a = '# Intro\nHello\n# Body\nAlpha\n# Tail\nEnd';
  const b = '# Intro\nHello\n# Body\nBeta\n# Tail\nEnd';
  const result = dd.diffSections(a, b, /^#\s.+$/);
  const body = result.sections.find((s) => s.title === '# Body');
  assert.ok(body);
  const ins = body.diff.filter((d) => d.op === 'insert');
  const del = body.diff.filter((d) => d.op === 'delete');
  assert.equal(ins.length, 1);
  assert.equal(del.length, 1);
  assert.equal(ins[0].line, 'Beta');
  assert.equal(del[0].line, 'Alpha');
});

test('D2 — diffSections reports whole-section insert and delete', () => {
  const a = '## א\nX\n## ב\nY';
  const b = '## א\nX\n## ג\nZ';
  const result = dd.diffSections(a, b, /^##\s.+$/);
  const titles = result.sections.map((s) => s.title);
  assert.ok(titles.includes('## ב'));
  assert.ok(titles.includes('## ג'));
  const inserted = result.sections.find((s) => s.title === '## ג');
  const deleted = result.sections.find((s) => s.title === '## ב');
  assert.equal(inserted.kind, 'insert');
  assert.equal(deleted.kind, 'delete');
});

/* ----------------------------------------------------------------------------
 * Section E — Patch / reverse patch round-trips
 * -------------------------------------------------------------------------- */

test('E1 — patch round-trip for ASCII', () => {
  const a = 'one\ntwo\nthree\nfour\nfive';
  const b = 'one\nTWO\nthree\nFOUR\nfive\nsix';
  const diff = dd.diffLines(a, b);
  assert.equal(dd.patch(a, diff), b);
});

test('E2 — reverse patch reproduces A', () => {
  const a = 'one\ntwo\nthree\nfour\nfive';
  const b = 'one\nTWO\nthree\nFOUR\nfive\nsix';
  const diff = dd.diffLines(a, b);
  assert.equal(dd.reversePatch(b, diff), a);
});

test('E3 — patch rejects mismatched A (structural guard)', () => {
  const a = 'one\ntwo\nthree';
  const b = 'one\nTWO\nthree';
  const diff = dd.diffLines(a, b);
  assert.throws(() => dd.patch('different\ncontent', diff), /structural mismatch/);
});

test('E4 — patch round-trip for Hebrew', () => {
  const a = 'שלום עולם\nברוך הבא\nזהו מסמך';
  const b = 'שלום עולם\nברוכים הבאים\nזהו מסמך מעודכן';
  const diff = dd.diffLines(a, b);
  assert.equal(dd.patch(a, diff), b);
  assert.equal(dd.reversePatch(b, diff), a);
});

/* ----------------------------------------------------------------------------
 * Section F — 3-way merge
 * -------------------------------------------------------------------------- */

test('F1 — clean merge when only one branch changes', () => {
  const base = 'line1\nline2\nline3';
  const A    = 'line1\nLINE2\nline3';
  const B    = 'line1\nline2\nline3';
  const res = dd.mergeThreeWay(base, A, B);
  assert.equal(res.clean, true);
  assert.equal(res.conflicts, 0);
  assert.equal(res.merged, 'line1\nLINE2\nline3');
});

test('F2 — clean merge for disjoint edits on different lines', () => {
  const base = 'a\nb\nc';
  const A    = 'A\nb\nc';
  const B    = 'a\nb\nC';
  const res = dd.mergeThreeWay(base, A, B);
  assert.equal(res.clean, true);
  assert.equal(res.merged, 'A\nb\nC');
});

test('F3 — conflict when both branches modify same line differently', () => {
  const base = 'hello\nworld';
  const A    = 'HELLO\nworld';
  const B    = 'Hello!\nworld';
  const res = dd.mergeThreeWay(base, A, B);
  assert.equal(res.clean, false);
  assert.equal(res.conflicts, 1);
  // Conflict markers present.
  assert.match(res.merged, /<<<<<<< Branch A/);
  assert.match(res.merged, /\|\|\|\|\|\|\| Base/);
  assert.match(res.merged, /=======/);
  assert.match(res.merged, />>>>>>> Branch B/);
});

test('F4 — Hebrew 3-way merge conflict is preserved correctly', () => {
  const base = 'סעיף א׳: תקציב\nסעיף ב׳: לוח זמנים';
  const A    = 'סעיף א׳: תקציב מעודכן\nסעיף ב׳: לוח זמנים';
  const B    = 'סעיף א׳: תקציב חדש\nסעיף ב׳: לוח זמנים';
  const res = dd.mergeThreeWay(base, A, B);
  assert.equal(res.clean, false);
  assert.equal(res.conflicts, 1);
  // Both versions must appear in merged output.
  assert.ok(res.merged.includes('סעיף א׳: תקציב מעודכן'));
  assert.ok(res.merged.includes('סעיף א׳: תקציב חדש'));
  // Unchanged line stays intact.
  assert.ok(res.merged.includes('סעיף ב׳: לוח זמנים'));
});

test('F5 — identical edits on both branches produce clean merge', () => {
  const base = 'foo\nbar';
  const A    = 'foo\nBAR';
  const B    = 'foo\nBAR';
  const res = dd.mergeThreeWay(base, A, B);
  assert.equal(res.clean, true);
  assert.equal(res.merged, 'foo\nBAR');
});

/* ----------------------------------------------------------------------------
 * Section G — Output formatters
 * -------------------------------------------------------------------------- */

test('G1 — formatHTML escapes angle brackets and RTL dir is set', () => {
  const a = 'safe line';
  const b = '<script>alert(1)</script>';
  const diff = dd.diffLines(a, b);
  const html = dd.formatHTML(diff);
  assert.match(html, /dir="rtl"/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  // Ensure the title tags use bilingual labels.
  assert.ok(html.includes('דוח השוואת מסמכים'));
  assert.ok(html.includes('Document diff report'));
});

test('G2 — formatHTML uses <ins> and <del> tags', () => {
  const diff = dd.diffLines('foo', 'bar');
  const html = dd.formatHTML(diff);
  assert.match(html, /<ins[^>]*>bar<\/ins>/);
  assert.match(html, /<del[^>]*>foo<\/del>/);
});

test('G3 — formatMarkdown uses +++ / --- prefixes', () => {
  const diff = dd.diffLines('kept\nold', 'kept\nnew');
  const md = dd.formatMarkdown(diff);
  assert.match(md, /^--- old$/m);
  assert.match(md, /^\+\+\+ new$/m);
  assert.match(md, /^  kept$/m);
});

test('G4 — formatUnified emits hunk header and sign prefixes', () => {
  const a = 'a\nb\nc\nd\ne\nf';
  const b = 'a\nb\nc\nX\ne\nf';
  const diff = dd.diffLines(a, b);
  const u = dd.formatUnified(diff, 1);
  assert.match(u, /^@@ -\d+,\d+ \+\d+,\d+ @@$/m);
  assert.match(u, /^-d$/m);
  assert.match(u, /^\+X$/m);
});

/* ----------------------------------------------------------------------------
 * Section H — Summary and similarity
 * -------------------------------------------------------------------------- */

test('H1 — summary counts operations correctly', () => {
  const diff = dd.diffLines('a\nb\nc', 'a\nX\nc\nY');
  const s = dd.summary(diff);
  assert.equal(s.unchanged, 2);    // a, c
  assert.equal(s.deletions, 1);    // b
  assert.equal(s.insertions, 2);   // X, Y
  assert.equal(s.total, 5);
  assert.ok(s.percentChanged > 0);
  assert.ok(s.percentChanged < 100);
  assert.equal(s.labels.insertions.he, LABELS.inserted.he);
});

test('H2 — summary of identical docs is 0% changed', () => {
  const diff = dd.diffLines('x\ny', 'x\ny');
  const s = dd.summary(diff);
  assert.equal(s.percentChanged, 0);
  assert.equal(s.insertions, 0);
  assert.equal(s.deletions, 0);
  assert.equal(s.unchanged, 2);
});

test('H3 — similarityScore: identical => 1', () => {
  assert.equal(dd.similarityScore('abcdef', 'abcdef'), 1);
  assert.equal(dd.similarityScore('', ''), 1);
  assert.equal(dd.similarityScore('שלום', 'שלום'), 1);
});

test('H4 — similarityScore: completely different => 0', () => {
  const s = dd.similarityScore('aaaa', 'bbbb');
  assert.equal(s, 0);
});

test('H5 — similarityScore: partial similarity is in (0,1)', () => {
  const s = dd.similarityScore('kitten', 'sitting');
  assert.ok(s > 0);
  assert.ok(s < 1);
  // kitten→sitting is a canonical distance-3 example; length 7 max → ~0.5714.
  assert.ok(Math.abs(s - 0.5714) < 0.01);
});

test('H6 — similarityScore on Hebrew is symmetric and bounded', () => {
  const a = 'חוזה מסחרי לדוגמה';
  const b = 'חוזה משפטי לדוגמה';
  const ab = dd.similarityScore(a, b);
  const ba = dd.similarityScore(b, a);
  assert.equal(ab, ba);
  assert.ok(ab > 0 && ab < 1);
});

/* ----------------------------------------------------------------------------
 * Section I — Safety of HTML escaping
 * -------------------------------------------------------------------------- */

test('I1 — escapeHtml handles all OWASP base chars', () => {
  const { escapeHtml } = _internals;
  const raw = `&<>"'`;
  const out = escapeHtml(raw);
  assert.equal(out, '&amp;&lt;&gt;&quot;&#39;');
});

test('I2 — null/undefined are rendered as empty strings in HTML formatter', () => {
  const diff = Object.freeze([{ op: 'equal', line: '' }]);
  const html = dd.formatHTML(diff);
  assert.match(html, /<span><\/span>/);
});

/* ----------------------------------------------------------------------------
 * Section J — Static-method facade
 * -------------------------------------------------------------------------- */

test('J1 — DocDiff.diffLines static invocation works identically', () => {
  const a = 'x\ny';
  const b = 'x\nz';
  const fromInstance = dd.diffLines(a, b);
  const fromStatic = DocDiff.diffLines(a, b);
  assert.deepEqual(
    fromStatic.map((d) => ({ op: d.op, line: d.line })),
    fromInstance.map((d) => ({ op: d.op, line: d.line })),
  );
});

test('J2 — DIFF_OPS catalog is frozen and bilingual', () => {
  assert.ok(Object.isFrozen(DIFF_OPS));
  assert.equal(DIFF_OPS.insert.he, 'נוסף');
  assert.equal(DIFF_OPS.delete.he, 'נמחק');
  assert.equal(DIFF_OPS.equal.he, 'ללא שינוי');
});
