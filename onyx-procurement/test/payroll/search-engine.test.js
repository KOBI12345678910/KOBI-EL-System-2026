/**
 * Search Engine — Unit Tests
 * Agent X-14 — Techno-Kol Uzi / Swarm 3
 *
 * Run with:
 *   node --test test/payroll/search-engine.test.js
 *
 * Covers:
 *   - Hebrew tokenization (niqqud, final letters, stopwords)
 *   - English tokenization (stemming, stopwords)
 *   - Inverted index add/remove/upsert
 *   - TF-IDF scoring sanity
 *   - Phrase search
 *   - Boolean AND / OR / NOT
 *   - Fuzzy matching (Levenshtein)
 *   - Prefix search + suggest autocomplete
 *   - Faceted filters
 *   - Hit highlighting
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  createIndex,
  tokenizeHebrew,
  tokenizeEnglish,
  stripNiqqud,
  normalizeFinalLetters,
  stemEnglish,
  levenshtein,
  parseQuery,
  highlight,
  HEBREW_STOPWORDS,
  ENTITY_TYPES,
} = require(path.resolve(__dirname, '..', '..', 'src', 'search', 'search-engine.js'));

// ═════════════════════════════════════════════════════════════════
// 1. stripNiqqud / normalizeFinalLetters
// ═════════════════════════════════════════════════════════════════

test('stripNiqqud: removes vowel points', () => {
  const withNiqqud = 'שָׁלוֹם עוֹלָם';
  const stripped = stripNiqqud(withNiqqud);
  assert.equal(stripped, 'שלום עולם');
});

test('stripNiqqud: passes through plain Hebrew untouched', () => {
  assert.equal(stripNiqqud('שלום'), 'שלום');
});

test('normalizeFinalLetters: converts ם/ן/ץ/ף/ך → non-final', () => {
  assert.equal(normalizeFinalLetters('שלום'), 'שלומ');
  assert.equal(normalizeFinalLetters('חן'), 'חנ');
  assert.equal(normalizeFinalLetters('ארץ'), 'ארצ');
  assert.equal(normalizeFinalLetters('כסף'), 'כספ');
  assert.equal(normalizeFinalLetters('דרך'), 'דרכ');
});

// ═════════════════════════════════════════════════════════════════
// 2. tokenizeHebrew
// ═════════════════════════════════════════════════════════════════

test('tokenizeHebrew: basic sentence', () => {
  const tokens = tokenizeHebrew('חשבונית עבור לקוח חדש');
  assert.deepEqual(tokens, ['חשבונית', 'עבור', 'לקוח', 'חדש']);
});

test('tokenizeHebrew: strips niqqud before tokenizing', () => {
  const tokens = tokenizeHebrew('שָׁלוֹם רַב לָכֶם');
  assert.ok(tokens.includes('שלומ'));
  assert.ok(tokens.includes('רב'));
  assert.ok(tokens.includes('לכמ'));
});

test('tokenizeHebrew: removes stopwords', () => {
  const tokens = tokenizeHebrew('זה הוא המסמך של החברה');
  assert.ok(!tokens.includes('זה'));
  assert.ok(!tokens.includes('הוא'));
  assert.ok(!tokens.includes('של'));
  assert.ok(tokens.includes('המסמכ'));
  assert.ok(tokens.includes('החברה'));
});

test('tokenizeHebrew: normalizes final letters', () => {
  const tokens = tokenizeHebrew('שלום חנויות כסף דרך');
  assert.ok(tokens.includes('שלומ'));
  assert.ok(tokens.includes('חנויות'));
  assert.ok(tokens.includes('כספ'));
  assert.ok(tokens.includes('דרכ'));
});

test('tokenizeHebrew: splits on punctuation', () => {
  const tokens = tokenizeHebrew('חשבונית, קבלה; תשלום!');
  assert.deepEqual(tokens.sort(), ['חשבונית', 'קבלה', 'תשלומ'].sort());
});

test('tokenizeHebrew: handles mixed Hebrew + ASCII', () => {
  const tokens = tokenizeHebrew('לקוח ABC123 חשבונית');
  assert.ok(tokens.includes('לקוח'));
  assert.ok(tokens.includes('abc123'));
  assert.ok(tokens.includes('חשבונית'));
});

test('tokenizeHebrew: empty / null input', () => {
  assert.deepEqual(tokenizeHebrew(''), []);
  assert.deepEqual(tokenizeHebrew(null), []);
  assert.deepEqual(tokenizeHebrew(undefined), []);
});

// ═════════════════════════════════════════════════════════════════
// 3. tokenizeEnglish
// ═════════════════════════════════════════════════════════════════

test('tokenizeEnglish: lowercases and strips stopwords', () => {
  const tokens = tokenizeEnglish('The quick brown fox jumps over the lazy dog');
  assert.ok(!tokens.includes('the'));
  assert.ok(!tokens.includes('over'));
  assert.ok(tokens.includes('quick'));
  assert.ok(tokens.includes('brown'));
});

test('tokenizeEnglish: applies stem suffix stripping', () => {
  const tokens = tokenizeEnglish('running jumped swimming');
  assert.ok(tokens.some((t) => t.startsWith('runn')));
  assert.ok(tokens.some((t) => t.startsWith('jump')));
  assert.ok(tokens.some((t) => t.startsWith('swimm')));
});

test('stemEnglish: common suffixes', () => {
  assert.equal(stemEnglish('running'), 'runn');
  assert.equal(stemEnglish('jumping'), 'jump');
  assert.equal(stemEnglish('happily'), 'happi');
  assert.equal(stemEnglish('things'), 'thing');
});

// ═════════════════════════════════════════════════════════════════
// 4. levenshtein
// ═════════════════════════════════════════════════════════════════

test('levenshtein: equal strings → 0', () => {
  assert.equal(levenshtein('foo', 'foo', 2), 0);
});

test('levenshtein: single substitution → 1', () => {
  assert.equal(levenshtein('kitten', 'sitten', 2), 1);
});

test('levenshtein: above threshold → Infinity', () => {
  assert.equal(levenshtein('abc', 'xyz', 2), Infinity);
});

test('levenshtein: Hebrew words one edit apart', () => {
  // חשבונית vs חשבוניות — one insertion
  assert.ok(levenshtein('חשבונית', 'חשבוניות', 2) <= 2);
});

// ═════════════════════════════════════════════════════════════════
// 5. Index add / remove / upsert
// ═════════════════════════════════════════════════════════════════

test('index.add + stats: basic doc counts', () => {
  const idx = createIndex();
  idx.add('inv-1', 'invoice', { title: 'חשבונית מסחרית', amount: 1200 });
  idx.add('inv-2', 'invoice', { title: 'חשבונית שיווקית', amount: 500 });
  const s = idx.stats();
  assert.equal(s.docs, 2);
  assert.ok(s.terms > 0);
});

test('index.remove: removes from postings', () => {
  const idx = createIndex();
  idx.add('x1', 'item', { name: 'ברגים' });
  idx.add('x2', 'item', { name: 'ברגים קטנים' });
  assert.equal(idx.stats().docs, 2);
  idx.remove('x1');
  assert.equal(idx.stats().docs, 1);
  assert.equal(idx.get('x1'), null);
  assert.ok(idx.get('x2') != null);
});

test('index.add: upsert semantics replace prior content', () => {
  const idx = createIndex();
  idx.add('c1', 'client', { name: 'דן דוד' });
  idx.add('c1', 'client', { name: 'רות כהן' });
  assert.equal(idx.stats().docs, 1);
  const r1 = idx.search('דן').results;
  assert.equal(r1.length, 0);
  const r2 = idx.search('רות').results;
  assert.equal(r2.length, 1);
  assert.equal(r2[0].id, 'c1');
});

test('index.add: requires id and docType', () => {
  const idx = createIndex();
  assert.throws(() => idx.add('', 'invoice', { a: 1 }));
  assert.throws(() => idx.add('x', '', { a: 1 }));
});

// ═════════════════════════════════════════════════════════════════
// 6. Basic Hebrew search
// ═════════════════════════════════════════════════════════════════

test('search: Hebrew term returns matching docs', () => {
  const idx = createIndex();
  idx.add('inv-1', 'invoice', { title: 'חשבונית מסחרית ללקוח', note: 'תשלום מיידי' });
  idx.add('inv-2', 'invoice', { title: 'קבלה עבור רכישה' });
  idx.add('inv-3', 'invoice', { title: 'חשבונית פורמלית' });

  const r = idx.search('חשבונית');
  assert.equal(r.total, 2);
  const ids = r.results.map((x) => x.id).sort();
  assert.deepEqual(ids, ['inv-1', 'inv-3']);
  assert.ok(r.took_ms >= 0);
});

test('search: matches across final-letter variants', () => {
  const idx = createIndex();
  idx.add('d1', 'document', { content: 'שלום לכולם' });
  const r = idx.search('שלום');
  assert.equal(r.total, 1);
  const r2 = idx.search('שלומ');
  assert.equal(r2.total, 1);
});

test('search: niqqud query vs plain indexed text', () => {
  const idx = createIndex();
  idx.add('d1', 'document', { content: 'שלום רב' });
  const r = idx.search('שָׁלוֹם');
  assert.equal(r.total, 1);
});

// ═════════════════════════════════════════════════════════════════
// 7. Boolean search
// ═════════════════════════════════════════════════════════════════

test('search: AND — both terms must match', () => {
  const idx = createIndex();
  idx.add('a', 'item', { name: 'ברגים נירוסטה' });
  idx.add('b', 'item', { name: 'ברגים רגילים' });
  idx.add('c', 'item', { name: 'אומים נירוסטה' });
  const r = idx.search('ברגים נירוסטה');
  assert.equal(r.total, 1);
  assert.equal(r.results[0].id, 'a');
});

test('search: OR — union of hits', () => {
  const idx = createIndex();
  idx.add('a', 'item', { name: 'מסמר' });
  idx.add('b', 'item', { name: 'בורג' });
  idx.add('c', 'item', { name: 'מפתח' });
  const r = idx.search('מסמר OR בורג');
  assert.equal(r.total, 2);
});

test('search: NOT — excludes docs', () => {
  const idx = createIndex();
  idx.add('a', 'invoice', { title: 'חשבונית מסחרית' });
  idx.add('b', 'invoice', { title: 'חשבונית שיווקית' });
  const r = idx.search('חשבונית -מסחרית');
  assert.equal(r.total, 1);
  assert.equal(r.results[0].id, 'b');
});

// ═════════════════════════════════════════════════════════════════
// 8. Phrase search
// ═════════════════════════════════════════════════════════════════

test('search: phrase — exact sequence required', () => {
  const idx = createIndex();
  idx.add('a', 'document', { body: 'חוזה עבודה חתום עם עובד חדש' });
  idx.add('b', 'document', { body: 'עובד חוזה עבודה פחות ברור' });
  const r = idx.search('"חוזה עבודה"');
  assert.equal(r.total, 2);
  const r2 = idx.search('"עבודה חוזה"');
  assert.equal(r2.total, 0);
});

// ═════════════════════════════════════════════════════════════════
// 9. Fuzzy + prefix search
// ═════════════════════════════════════════════════════════════════

test('search: fuzzy — tolerates 1-2 edit distance', () => {
  const idx = createIndex();
  idx.add('x1', 'item', { name: 'מקלדת' });
  const r = idx.search('מקלדות~');
  assert.ok(r.total >= 1);
});

test('search: prefix — autocomplete-style hit', () => {
  const idx = createIndex();
  idx.add('x1', 'item', { name: 'מחשב נייד' });
  idx.add('x2', 'item', { name: 'מחשבון מדעי' });
  idx.add('x3', 'item', { name: 'מקלדת' });
  const r = idx.search('מחש*');
  assert.equal(r.total, 2);
});

test('suggest: returns matching terms sorted by DF', () => {
  const idx = createIndex();
  idx.add('1', 'item', { name: 'ברגים' });
  idx.add('2', 'item', { name: 'ברגים חזקים' });
  idx.add('3', 'item', { name: 'בורג קטן' });
  const out = idx.suggest('בר', 5);
  assert.ok(out.length >= 1);
  assert.ok(out.includes('ברגימ') || out.includes('ברגיםם') || out.some((x) => x.startsWith('בר')));
});

// ═════════════════════════════════════════════════════════════════
// 10. Faceted filters
// ═════════════════════════════════════════════════════════════════

test('search.filters: docType facet restricts results', () => {
  const idx = createIndex();
  idx.add('c1', 'client',  { name: 'חשבונאות מקצועית' });
  idx.add('i1', 'invoice', { title: 'חשבונאות שוטפת' });
  const r = idx.search('חשבונאות', { filters: { docType: 'invoice' } });
  assert.equal(r.total, 1);
  assert.equal(r.results[0].docType, 'invoice');
});

test('search.filters: date range', () => {
  const idx = createIndex();
  idx.add('old', 'invoice', { title: 'חשבונית ישנה', createdAt: '2024-01-01' });
  idx.add('new', 'invoice', { title: 'חשבונית חדשה', createdAt: '2026-03-15' });
  const r = idx.search('חשבונית', { filters: { dateFrom: '2026-01-01', dateTo: '2026-12-31' } });
  assert.equal(r.total, 1);
  assert.equal(r.results[0].id, 'new');
});

test('search.filters: user facet', () => {
  const idx = createIndex();
  idx.add('e1', 'employee', { name: 'כהן', user: 'alice' });
  idx.add('e2', 'employee', { name: 'לוי',  user: 'bob' });
  const r = idx.search('', { filters: { user: 'alice' } });
  assert.equal(r.total, 1);
  assert.equal(r.results[0].id, 'e1');
});

test('search.facets: counts grouped correctly', () => {
  const idx = createIndex();
  idx.add('a1', 'invoice',  { title: 'חשבון' });
  idx.add('a2', 'invoice',  { title: 'חשבון' });
  idx.add('b1', 'client',   { name:  'חשבון' });
  const r = idx.search('חשבון');
  assert.equal(r.facets.docType.invoice, 2);
  assert.equal(r.facets.docType.client, 1);
});

// ═════════════════════════════════════════════════════════════════
// 11. Highlighting
// ═════════════════════════════════════════════════════════════════

test('highlight: wraps matched Hebrew term', () => {
  const out = highlight('חשבונית מסחרית ללקוח', ['חשבונית']);
  assert.ok(out.includes('<mark>חשבונית</mark>'));
});

test('highlight: custom markers', () => {
  const out = highlight('test string here', ['test'], { pre: '[', post: ']' });
  assert.ok(out.includes('[test]'));
});

test('search: results include highlights object', () => {
  const idx = createIndex();
  idx.add('d1', 'document', { title: 'חוזה העסקה חתום', body: 'עובד חדש' });
  const r = idx.search('חוזה');
  assert.equal(r.results.length, 1);
  const hl = r.results[0].highlights;
  assert.ok(hl && typeof hl === 'object');
  const hasHighlightedTitle = Object.values(hl).some(
    (v) => typeof v === 'string' && v.includes('<mark>')
  );
  assert.ok(hasHighlightedTitle);
});

// ═════════════════════════════════════════════════════════════════
// 12. TF-IDF ranking sanity
// ═════════════════════════════════════════════════════════════════

test('search: more-frequent term boosts score', () => {
  const idx = createIndex();
  idx.add('a', 'document', { body: 'ברגים ברגים ברגים ברגים ברגים' });
  idx.add('b', 'document', { body: 'ברגים במסמך ארוך יותר עם מילים אחרות רבות מאוד וגם עוד' });
  const r = idx.search('ברגים');
  assert.equal(r.total, 2);
  assert.equal(r.results[0].id, 'a');
});

test('search: rare term scores higher than common term', () => {
  const idx = createIndex();
  for (let i = 0; i < 20; i++) idx.add(`c${i}`, 'item', { name: 'בורג רגיל' });
  idx.add('rare', 'item', { name: 'בורג טיטניום' });
  const r = idx.search('בורג טיטניום');
  assert.equal(r.results[0].id, 'rare');
});

// ═════════════════════════════════════════════════════════════════
// 13. Multi-entity indexing
// ═════════════════════════════════════════════════════════════════

test('index: supports all ERP entity types', () => {
  const idx = createIndex();
  idx.add('inv-9', 'invoice',  { total: 1500 });
  idx.add('cli-3', 'client',   { name: 'דוד כהן' });
  idx.add('vnd-5', 'vendor',   { name: 'ספק א' });
  idx.add('itm-2', 'item',     { sku: 'SKU-001' });
  idx.add('emp-1', 'employee', { name: 'רונית לוי' });
  idx.add('con-4', 'contract', { title: 'הסכם שירות' });
  idx.add('doc-7', 'document', { content: 'מסמך כללי' });
  assert.equal(idx.stats().docs, 7);

  for (const type of ['invoice', 'client', 'vendor', 'item', 'employee', 'contract', 'document']) {
    assert.ok(ENTITY_TYPES.includes(type));
  }
});

test('search: empty query returns all filtered docs most-recent first', () => {
  const idx = createIndex();
  idx.add('old', 'invoice', { title: 'ישן', createdAt: '2024-01-01' });
  idx.add('new', 'invoice', { title: 'חדש', createdAt: '2026-04-01' });
  const r = idx.search('');
  assert.equal(r.total, 2);
  assert.equal(r.results[0].id, 'new');
});

// ═════════════════════════════════════════════════════════════════
// 14. parseQuery — grammar sanity
// ═════════════════════════════════════════════════════════════════

test('parseQuery: phrase + and + not', () => {
  const { clauses } = parseQuery('"חוזה עבודה" -בוטל חשבונית');
  assert.equal(clauses.length, 3);
  assert.equal(clauses[0].type, 'phrase');
  assert.equal(clauses[1].op, 'NOT');
  assert.equal(clauses[2].op, 'AND');
});

test('parseQuery: fuzzy and prefix modifiers', () => {
  const { clauses } = parseQuery('חשבון~ מחש*');
  assert.equal(clauses.length, 2);
  assert.equal(clauses[0].type, 'fuzzy');
  assert.equal(clauses[1].type, 'prefix');
});

// ═════════════════════════════════════════════════════════════════
// 15. Hebrew stopwords set
// ═════════════════════════════════════════════════════════════════

test('HEBREW_STOPWORDS: common words present', () => {
  for (const w of ['של', 'את', 'עם', 'זה', 'הוא', 'על', 'אם', 'כי']) {
    assert.ok(HEBREW_STOPWORDS.has(w), `expected stopword ${w}`);
  }
});

// ═════════════════════════════════════════════════════════════════
// 16. Pagination
// ═════════════════════════════════════════════════════════════════

test('search: limit + offset paginate results', () => {
  const idx = createIndex();
  for (let i = 0; i < 5; i++) idx.add(`p${i}`, 'item', { name: 'ברגים' });
  const r = idx.search('ברגים', { limit: 2, offset: 0 });
  assert.equal(r.results.length, 2);
  assert.equal(r.total, 5);
  const r2 = idx.search('ברגים', { limit: 2, offset: 2 });
  assert.equal(r2.results.length, 2);
});

// ═════════════════════════════════════════════════════════════════
// 17. Mixed Hebrew + English
// ═════════════════════════════════════════════════════════════════

test('search: mixed Hebrew and English doc', () => {
  const idx = createIndex();
  idx.add('m1', 'document', { content: 'Invoice INV-2026-001 חשבונית מסחרית' });
  const r1 = idx.search('invoice');
  assert.equal(r1.total, 1);
  const r2 = idx.search('חשבונית');
  assert.equal(r2.total, 1);
  const r3 = idx.search('INV-2026-001');
  assert.equal(r3.total, 1);
});
