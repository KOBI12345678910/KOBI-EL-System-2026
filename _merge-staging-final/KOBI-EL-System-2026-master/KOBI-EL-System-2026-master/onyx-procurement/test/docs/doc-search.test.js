/**
 * Document Search Engine — Unit Tests  |  מנוע חיפוש מסמכים
 * ==============================================================
 *
 * Agent Y-112  |  Swarm Documents  |  Techno-Kol Uzi mega-ERP
 *
 * Run with:   node --test test/docs/doc-search.test.js
 *      or:    node --test
 *
 * Requires Node >= 18 for the built-in `node:test` runner.
 *
 * Exercises:
 *   - Tokenizer basics (Hebrew + English mixed)
 *   - Nikud stripping, Hebrew prefix stripping, Hebrew suffix stem
 *   - English stemming and stop-words
 *   - Indexing posting structure, docLen, N
 *   - BM25 scoring shape (rare term beats common term)
 *   - TF-IDF scoring path
 *   - Hebrew-specific query (queryHebrew)
 *   - Phrase query via positional index (positive + negative)
 *   - Fuzzy search — Levenshtein expansion
 *   - suggestCorrections
 *   - Safe highlight (HTML escaping, <mark> wrap)
 *   - facets counts per docType / tag / department
 *   - autocomplete prefix
 *   - Filters — docType, tags, department, dateRange
 *   - removeFromIndex soft-archive (append-only)
 *   - reindex full rebuild
 *   - Mutation log append-only ordering
 *   - stats() shape
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  DocSearch,
  BM25_K1,
  BM25_B,
  STATUS_LIVE,
  STATUS_ARCHIVED,
  STATUS_SUPERSEDED,
  _internal,
} = require(path.resolve(
  __dirname, '..', '..', 'src', 'docs', 'doc-search.js',
));

// ──────────────────────────────────────────────────────────
// Fixture helpers — pinned clock
// ──────────────────────────────────────────────────────────

function makeEngine(startTs) {
  const state = { t: startTs == null ? Date.UTC(2026, 3, 11) : startTs };
  const engine = new DocSearch({ now: () => state.t });
  return {
    engine,
    tick(ms) { state.t += ms; return state.t; },
  };
}

function seed(engine) {
  engine.indexDocument({
    docId: 'D1',
    title_he: 'חשבונית ספק לחברת אלקטרו',
    title_en: 'Supplier invoice for Electro Ltd',
    content: 'תשלום עבור חלקים חשמליים. Payment for electrical parts and wires.',
    metadata: { docType: 'invoice', department: 'finance' },
    tags: ['procurement', 'electrical'],
    versionId: 'v1',
  });
  engine.indexDocument({
    docId: 'D2',
    title_he: 'הזמנת רכש לברזל מבנה',
    title_en: 'Purchase order for structural steel',
    content: 'הזמנה דחופה לברזל ובטון. Urgent order for steel and concrete.',
    metadata: { docType: 'po', department: 'construction' },
    tags: ['procurement', 'steel'],
    versionId: 'v1',
  });
  engine.indexDocument({
    docId: 'D3',
    title_he: 'היתר בנייה',
    title_en: 'Building permit',
    content: 'היתר לבניית מבנה חדש ברמת גן. Construction permit for new building.',
    metadata: { docType: 'permit', department: 'construction' },
    tags: ['permits', 'municipality'],
    versionId: 'v1',
  });
  engine.indexDocument({
    docId: 'D4',
    title_he: 'חוזה עבודה',
    title_en: 'Employment contract',
    content: 'חוזה העסקה חדש לעובד במשרד. New employment contract for office worker.',
    metadata: { docType: 'contract', department: 'hr' },
    tags: ['hr', 'employment'],
    versionId: 'v1',
  });
}

// ──────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────

test('T01 constants exported and BM25 defaults are standard', () => {
  assert.equal(BM25_K1, 1.2);
  assert.equal(BM25_B, 0.75);
  assert.equal(STATUS_LIVE, 'live');
  assert.equal(STATUS_ARCHIVED, 'archived');
  assert.equal(STATUS_SUPERSEDED, 'superseded');
});

test('T02 tokenizer extracts mixed Hebrew + English + digits', () => {
  const toks = _internal.tokenize('מסמך A12 חשבונית Invoice 2026');
  assert.ok(toks.length >= 5, 'expected >=5 tokens, got ' + toks.length);
  // Hebrew tokens should have been stemmed/prefix-stripped where applicable
  assert.ok(toks.includes('invoice'));
  assert.ok(toks.includes('2026'));
});

test('T03 nikud is stripped before indexing', () => {
  const plain = 'שָׁלוֹם';
  const no = _internal.stripNikud(plain);
  assert.equal(no, 'שלום');
  const toks = _internal.tokenize(plain);
  assert.ok(toks.includes('שלום'));
});

test('T04 Hebrew prefix ה/ב/ל/מ/ש/כ/ו is stripped when residue >= 2', () => {
  // "הבית" → strip ה → "בית"
  assert.equal(_internal.stripHebrewPrefix('הבית'), 'בית');
  // "לעולם" → strip ל → "עולם"
  assert.equal(_internal.stripHebrewPrefix('לעולם'), 'עולם');
  // short word — do not over-strip
  assert.equal(_internal.stripHebrewPrefix('הר'), 'הר');
});

test('T05 Hebrew plural suffix ים/ות/יה/ון stem when residue >= 2', () => {
  assert.equal(_internal.stripHebrewSuffix('ספרים'), 'ספר');
  // "מכוניות" ends in "ות" — single-pass strip yields "מכוני"
  assert.equal(_internal.stripHebrewSuffix('מכוניות'), 'מכוני');
  // too short — preserved
  assert.equal(_internal.stripHebrewSuffix('ים'), 'ים');
});

test('T06 English stem strips ing/ed/es/s with residue >= 3', () => {
  assert.equal(_internal.stemEnglish('running'), 'runn');
  assert.equal(_internal.stemEnglish('ordered'), 'order');
  assert.equal(_internal.stemEnglish('houses'), 'hous');
  assert.equal(_internal.stemEnglish('cats'), 'cat');
  assert.equal(_internal.stemEnglish('is'), 'is');
});

test('T07 English stop-words are dropped by normalizeToken', () => {
  assert.equal(_internal.normalizeToken('the'), '');
  assert.equal(_internal.normalizeToken('and'), '');
  assert.ok(_internal.normalizeToken('supplier').length > 0);
});

test('T08 indexDocument returns posting count and docLen', () => {
  const { engine } = makeEngine();
  const res = engine.indexDocument({
    docId: 'D1',
    title_he: 'חשבונית',
    title_en: 'invoice',
    content: 'payment for supplier',
    metadata: { docType: 'invoice' },
    tags: ['a'],
    versionId: 'v1',
  });
  assert.equal(res.docId, 'D1');
  assert.equal(res.versionId, 'v1');
  assert.ok(res.terms > 0);
  assert.ok(res.docLen > 0);
  const s = engine.stats();
  assert.equal(s.docCount, 1);
  assert.equal(s.liveCount, 1);
});

test('T09 BM25 — rare term outranks common term', () => {
  const { engine } = makeEngine();
  // Common term "alpha" appears in 10 docs.
  for (let i = 0; i < 10; i++) {
    engine.indexDocument({
      docId: 'C' + i,
      title_en: 'alpha',
      content: 'alpha alpha alpha',
      metadata: { docType: 'x' },
      versionId: 'v1',
    });
  }
  // Rare term "zeta" appears in 1 doc.
  engine.indexDocument({
    docId: 'R1',
    title_en: 'zeta',
    content: 'zeta',
    metadata: { docType: 'x' },
    versionId: 'v1',
  });
  const results = engine.query('alpha zeta');
  assert.ok(results.length > 0);
  // R1 should be top because IDF of "zeta" dominates
  assert.equal(results[0].docId, 'R1');
});

test('T10 TF-IDF scorer path returns results too', () => {
  const { engine } = makeEngine();
  seed(engine);
  const r = engine.query('supplier', { scorer: 'tfidf' });
  assert.ok(r.length >= 1);
  assert.ok(r[0].score > 0);
});

test('T11 queryHebrew with nikud input hits the same doc as plain', () => {
  const { engine } = makeEngine();
  seed(engine);
  const plain = engine.query('חשבונית');
  const niku = engine.queryHebrew('חָשְׁבּוֹנִית');
  assert.ok(plain.length > 0);
  assert.ok(niku.length > 0);
  assert.equal(niku[0].docId, plain[0].docId);
});

test('T12 Hebrew prefix stripping enables match on "לחשבונית"', () => {
  const { engine } = makeEngine();
  seed(engine);
  // "לחשבונית" has prefix ל — stripped to "חשבונית" → stemmed to "חשבוני"
  const r = engine.query('לחשבונית');
  assert.ok(r.length >= 1, 'expected at least one match for prefixed query');
  assert.equal(r[0].docId, 'D1');
});

test('T13 phraseQuery — consecutive positions match', () => {
  const { engine } = makeEngine();
  engine.indexDocument({
    docId: 'P1',
    title_en: 'Alpha',
    content: 'quick brown fox jumps',
    metadata: { docType: 'x' },
    versionId: 'v1',
  });
  engine.indexDocument({
    docId: 'P2',
    title_en: 'Beta',
    content: 'brown quick fox',
    metadata: { docType: 'x' },
    versionId: 'v1',
  });
  const hits = engine.phraseQuery('quick brown fox');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].docId, 'P1');
});

test('T14 phraseQuery — tokens present but non-adjacent miss', () => {
  const { engine } = makeEngine();
  engine.indexDocument({
    docId: 'P3',
    title_en: 'Gamma',
    content: 'steel is strong and concrete is heavy',
    metadata: { docType: 'x' },
    versionId: 'v1',
  });
  const hits = engine.phraseQuery('steel concrete');
  assert.equal(hits.length, 0);
});

test('T15 fuzzySearch — 1-letter typo is tolerated', () => {
  const { engine } = makeEngine();
  seed(engine);
  // "invioce" (1 transposition-ish, Lev distance 2 from "invoice") should hit D1
  const r = engine.fuzzySearch('invioce', { maxDistance: 2 });
  assert.ok(r.length >= 1);
  assert.ok(r.some((x) => x.docId === 'D1'));
});

test('T16 Levenshtein helper — known distances', () => {
  assert.equal(_internal.levenshtein('kitten', 'sitting'), 3);
  assert.equal(_internal.levenshtein('abc', 'abc'), 0);
  assert.equal(_internal.levenshtein('', 'abc'), 3);
  assert.equal(_internal.levenshtein('abc', ''), 3);
});

test('T17 suggestCorrections returns ranked candidates', () => {
  const { engine } = makeEngine();
  seed(engine);
  // engine has stem "supplier" → "supplier" after stem → "supplier".
  // Actually stemEnglish('supplier') = 'supplie' (no trailing s with r) —
  // we test a mild typo on an existing indexed term.
  const sug = engine.suggestCorrections('invoic');
  assert.ok(Array.isArray(sug));
  assert.ok(sug.length >= 1);
  assert.ok(sug.every((s) => typeof s.term === 'string'));
});

test('T18 highlight — HTML-escapes and wraps matches in <mark>', () => {
  const { engine } = makeEngine();
  seed(engine);
  const out = engine.highlight('<script>invoice</script>', 'invoice');
  // The raw < must be escaped and the matching term must be wrapped
  assert.ok(out.includes('&lt;script&gt;'));
  assert.ok(out.includes('<mark>invoice</mark>'));
  // No unescaped tags leaked
  assert.ok(!/\<script\>/.test(out));
});

test('T19 highlight — empty query returns escaped content unchanged', () => {
  const { engine } = makeEngine();
  const out = engine.highlight('<b>hi</b>', '');
  assert.equal(out, '&lt;b&gt;hi&lt;/b&gt;');
});

test('T20 facets — counts by docType, tag, department', () => {
  const { engine } = makeEngine();
  seed(engine);
  const f = engine.facets('');
  assert.equal(f.total, 4);
  assert.equal(f.docType.invoice, 1);
  assert.equal(f.docType.po, 1);
  assert.equal(f.docType.permit, 1);
  assert.equal(f.department.construction, 2);
  assert.equal(f.tag.procurement, 2);
});

test('T21 autocomplete — prefix returns ranked index terms', () => {
  const { engine } = makeEngine();
  seed(engine);
  // "invoic" is a stem of "invoice" after English stem rules; expect
  // prefix "suppl" to match stemmed "supplie"
  const ac = engine.autocomplete('suppl', 5);
  assert.ok(Array.isArray(ac));
  assert.ok(ac.length >= 1, 'expected autocomplete hit');
  assert.ok(ac.some((t) => t.startsWith('suppl')));
});

test('T22 query filters — docType narrows the result set', () => {
  const { engine } = makeEngine();
  seed(engine);
  // "construction" appears in permit + po
  const all = engine.query('construction');
  assert.ok(all.length >= 1);
  const only = engine.query('construction', { filters: { docType: 'permit' } });
  assert.ok(only.every((r) => r.docType === 'permit'));
});

test('T23 query filters — tags filter (any mode)', () => {
  const { engine } = makeEngine();
  seed(engine);
  const r = engine.query('procurement', { filters: { tags: ['steel'] } });
  assert.ok(r.length >= 1);
  assert.ok(r.every((x) => x.tags.includes('steel')));
});

test('T24 query filters — dateRange excludes out-of-range docs', () => {
  const { engine, tick } = makeEngine(Date.UTC(2026, 3, 11));
  seed(engine);
  tick(10 * 24 * 60 * 60 * 1000);
  engine.indexDocument({
    docId: 'LATE',
    title_en: 'late supplier note',
    content: 'later',
    metadata: { docType: 'note' },
    versionId: 'v1',
  });
  const r = engine.query('supplier', { filters: { dateRange: { to: Date.UTC(2026, 3, 12) } } });
  assert.ok(r.every((x) => x.docId !== 'LATE'));
});

test('T25 removeFromIndex — soft archive, not deletion', () => {
  const { engine } = makeEngine();
  seed(engine);
  engine.removeFromIndex('D1', 'v1');
  // The raw history is still tracked, and the status flipped to archived
  const s = engine.stats();
  assert.equal(s.rawDocsTracked, 4);
  assert.equal(s.liveCount, 3);
  assert.equal(s.archivedCount, 1);
  // Live query no longer hits D1
  const r = engine.query('חשבונית');
  assert.ok(r.every((x) => x.docId !== 'D1'));
});

test('T26 reindex rebuilds live postings from raw history', () => {
  const { engine } = makeEngine();
  seed(engine);
  const before = engine.stats();
  const out = engine.reindex();
  assert.equal(out.N, before.liveCount);
  const after = engine.stats();
  assert.equal(after.liveCount, before.liveCount);
  // Should still be able to query
  const r = engine.query('invoice');
  assert.ok(r.length >= 1);
});

test('T27 re-indexing same docId supersedes old postings', () => {
  const { engine } = makeEngine();
  engine.indexDocument({
    docId: 'V1', title_en: 'one', content: 'original text', metadata: { docType: 'x' }, versionId: 'v1',
  });
  engine.indexDocument({
    docId: 'V1', title_en: 'one', content: 'updated content here', metadata: { docType: 'x' }, versionId: 'v2',
  });
  const r = engine.query('original');
  assert.equal(r.length, 0, 'original tokens should not hit superseded version');
  const r2 = engine.query('updated');
  assert.equal(r2.length, 1);
  assert.equal(r2[0].versionId, 'v2');
});

test('T28 mutation log is append-only and monotonic', () => {
  const { engine } = makeEngine();
  seed(engine);
  engine.removeFromIndex('D1');
  engine.reindex();
  const log = engine.getMutationLog();
  assert.ok(log.length >= 5);
  for (let i = 1; i < log.length; i++) {
    assert.ok(log[i].seq > log[i - 1].seq, 'seq must be monotonic');
  }
  // No entry has a delete op
  assert.ok(log.every((e) => e.op !== 'delete'));
});

test('T29 stats shape — every advertised field present', () => {
  const { engine } = makeEngine();
  seed(engine);
  const s = engine.stats();
  for (const k of [
    'docCount', 'liveCount', 'archivedCount', 'supersededCount',
    'termCount', 'postings', 'avgDocLen', 'mutationLogSize', 'rawDocsTracked',
  ]) {
    assert.ok(Object.prototype.hasOwnProperty.call(s, k), 'missing ' + k);
  }
  assert.equal(s.docCount, 4);
  assert.ok(s.termCount > 0);
});

test('T30 bilingual query — Hebrew token finds doc indexed with mixed content', () => {
  const { engine } = makeEngine();
  seed(engine);
  const r = engine.query('ברזל');
  assert.ok(r.length >= 1);
  // D2 indexed with "ברזל" in both title and content
  assert.equal(r[0].docId, 'D2');
});
