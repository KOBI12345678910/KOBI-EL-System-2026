/**
 * DocSearch — Unit Tests
 * Agent Y-112 — Techno-Kol Uzi / Mega-ERP
 *
 * Run with:
 *   node --test test/documents/doc-search.test.js
 *
 * Covers:
 *   - indexing & re-indexing (additive rule)
 *   - Hebrew tokenization (niqqud, final letters, stopwords)
 *   - Core ranked search + filters + scope
 *   - Phrase search (exact and non-exact)
 *   - Proximity search
 *   - Wildcard search (* and ?)
 *   - Fuzzy search (Levenshtein)
 *   - Highlight snippets
 *   - Related documents (TF-IDF cosine)
 *   - Faceted search counts
 *   - Saved searches + alert-on-new-match
 *   - Search history
 *   - Permission-filtered (ACL) results
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  DocSearch,
  hebrewTokenize,
  stripNiqqud,
  normalizeFinalLetters,
  levenshtein,
  compileWildcard,
  detectLanguage,
} = require(path.resolve(__dirname, '..', '..', 'src', 'documents', 'doc-search.js'));

// ════════════════════════════════════════════════════════════════════
// Test fixtures — a small bilingual corpus
// ════════════════════════════════════════════════════════════════════

function buildEngine() {
  const ds = new DocSearch();

  ds.indexDocument({
    docId: 'doc-1',
    content: 'חוזה עבודה עם ספק הברזל תל אביב לפרויקט בנייה רמת גן',
    metadata: {
      author: 'kobi',
      createdDate: '2026-01-15',
      type: 'contract',
      tags: ['ברזל', 'בנייה', 'ספק'],
      customerId: 'cust-100',
      projectId: 'proj-A',
      language: 'he',
      acl: { owner: 'kobi', readers: ['dana'], groups: ['procurement'], public: false },
    },
  });

  ds.indexDocument({
    docId: 'doc-2',
    content: 'הצעת מחיר לעבודות צביעה וגבס בפרויקט חיפה כולל חומרים',
    metadata: {
      author: 'dana',
      createdDate: '2026-02-01',
      type: 'quote',
      tags: ['צביעה', 'גבס', 'חיפה'],
      customerId: 'cust-100',
      projectId: 'proj-B',
      language: 'he',
      acl: { owner: 'dana', readers: [], groups: ['sales'], public: false },
    },
  });

  ds.indexDocument({
    docId: 'doc-3',
    content: 'Invoice number 2026-001 for electrical installation and wiring at the office',
    metadata: {
      author: 'avi',
      createdDate: '2026-03-10',
      type: 'invoice',
      tags: ['electrical', 'office'],
      customerId: 'cust-200',
      projectId: 'proj-C',
      language: 'en',
      acl: { public: true },
    },
  });

  ds.indexDocument({
    docId: 'doc-4',
    content: 'דוח התקדמות פרויקט בנייה רמת גן כולל צביעה וחשמל ובטיחות באתר',
    metadata: {
      author: 'kobi',
      createdDate: '2026-03-15',
      type: 'report',
      tags: ['בנייה', 'דוח', 'בטיחות'],
      customerId: 'cust-100',
      projectId: 'proj-A',
      language: 'he',
      acl: { owner: 'kobi', readers: ['avi'], groups: ['procurement'], public: false },
    },
  });

  ds.indexDocument({
    docId: 'doc-5',
    content: 'Safety protocol for construction site in Tel Aviv — hard hats and vests',
    metadata: {
      author: 'avi',
      createdDate: '2025-12-01',
      type: 'protocol',
      tags: ['safety', 'construction'],
      customerId: 'cust-300',
      projectId: 'proj-D',
      language: 'en',
      acl: { owner: 'avi', readers: ['kobi'], groups: [], public: false },
    },
  });

  return ds;
}

// ════════════════════════════════════════════════════════════════════
// 1. Hebrew tokenization
// ════════════════════════════════════════════════════════════════════

test('hebrewTokenize: strips niqqud', () => {
  const withNiqqud = 'שָׁלוֹם';
  const tokens = hebrewTokenize(withNiqqud);
  assert.deepEqual(tokens, ['שלומ']);
});

test('hebrewTokenize: normalizes final letters', () => {
  const tokens = hebrewTokenize('שלום ציון כסף ארץ');
  // ם→מ, ן→נ, ף→פ, ץ→צ
  assert.ok(tokens.includes('שלומ'));
  assert.ok(tokens.includes('ציונ'));
  assert.ok(tokens.includes('כספ'));
  assert.ok(tokens.includes('ארצ'));
});

test('hebrewTokenize: removes Hebrew stopwords', () => {
  const tokens = hebrewTokenize('של את עם זה חוזה בנייה');
  assert.ok(!tokens.includes('של'));
  assert.ok(!tokens.includes('את'));
  assert.ok(tokens.includes('חוזה'));
  assert.ok(tokens.includes('בנייה'));
});

test('hebrewTokenize: mixed Hebrew + English', () => {
  const tokens = hebrewTokenize('Invoice חשבונית 2026-001');
  assert.ok(tokens.includes('invoice'));
  assert.ok(tokens.includes('חשבונית'));
  assert.ok(tokens.includes('2026'));
  assert.ok(tokens.includes('001'));
});

test('DocSearch#hebrewTokenization is the public entry point', () => {
  const ds = new DocSearch();
  const tokens = ds.hebrewTokenization('חוֹזֶה שֶׁל בְּנִיָּה');
  assert.ok(tokens.length >= 1);
  assert.ok(tokens.includes('חוזה'));
});

test('stripNiqqud + normalizeFinalLetters are safe on empty / non-string', () => {
  assert.equal(stripNiqqud(''), '');
  assert.equal(stripNiqqud(null), '');
  assert.equal(normalizeFinalLetters(''), '');
  assert.equal(normalizeFinalLetters(undefined), '');
});

test('detectLanguage distinguishes Hebrew, English, mixed', () => {
  assert.equal(detectLanguage('שלום עולם'), 'he');
  assert.equal(detectLanguage('hello world'), 'en');
  assert.equal(detectLanguage('hello שלום'), 'mixed');
});

// ════════════════════════════════════════════════════════════════════
// 2. Indexing
// ════════════════════════════════════════════════════════════════════

test('indexDocument: rejects missing docId', () => {
  const ds = new DocSearch();
  assert.throws(() => ds.indexDocument({ content: 'x' }), /docId is required/);
});

test('indexDocument: stores + builds inverted index', () => {
  const ds = buildEngine();
  const stats = ds.stats();
  assert.equal(stats.docs, 5);
  assert.ok(stats.terms > 0);
  assert.ok(ds.hasTerm('חוזה'));
  assert.ok(ds.hasTerm('invoice'));
});

test('indexDocument: re-indexing is additive — old tokens removed, new applied', () => {
  const ds = new DocSearch();
  ds.indexDocument({ docId: 'd1', content: 'first version text', metadata: {} });
  assert.ok(ds.hasTerm('first'));
  ds.indexDocument({ docId: 'd1', content: 'second revision content', metadata: {} });
  assert.ok(!ds.hasTerm('first'));
  assert.ok(ds.hasTerm('revision'));
  assert.equal(ds.stats().docs, 1);
});

// ════════════════════════════════════════════════════════════════════
// 3. Core search
// ════════════════════════════════════════════════════════════════════

test('search: ranks Hebrew query by TF-IDF', () => {
  const ds = buildEngine();
  const res = ds.search({ query: 'בנייה רמת גן' });
  assert.ok(res.total >= 2);
  const ids = res.results.map((r) => r.docId);
  assert.ok(ids.includes('doc-1'));
  assert.ok(ids.includes('doc-4'));
});

test('search: English query', () => {
  const ds = buildEngine();
  const res = ds.search({ query: 'electrical wiring' });
  assert.equal(res.total, 1);
  assert.equal(res.results[0].docId, 'doc-3');
});

test('search: filter by type + author', () => {
  const ds = buildEngine();
  const res = ds.search({
    query: '',
    filters: { author: 'kobi', type: 'report' },
  });
  assert.equal(res.total, 1);
  assert.equal(res.results[0].docId, 'doc-4');
});

test('search: filter by dateRange', () => {
  const ds = buildEngine();
  const res = ds.search({
    query: '',
    filters: {
      dateRange: { from: '2026-02-01', to: '2026-03-31' },
    },
  });
  const ids = res.results.map((r) => r.docId).sort();
  assert.deepEqual(ids, ['doc-2', 'doc-3', 'doc-4']);
});

test('search: filter by tags (AND semantics)', () => {
  const ds = buildEngine();
  const res = ds.search({
    query: '',
    filters: { tags: ['בנייה'] },
  });
  const ids = res.results.map((r) => r.docId).sort();
  assert.deepEqual(ids, ['doc-1', 'doc-4']);
});

test('search: scope by customerId', () => {
  const ds = buildEngine();
  const res = ds.search({
    query: '',
    scope: { customerId: 'cust-100' },
  });
  assert.equal(res.total, 3);
});

// ════════════════════════════════════════════════════════════════════
// 4. Phrase search
// ════════════════════════════════════════════════════════════════════

test('phraseSearch: exact contiguous phrase', () => {
  const ds = buildEngine();
  const res = ds.phraseSearch({ phrase: 'רמת גן', exact: true });
  const ids = res.results.map((r) => r.docId).sort();
  assert.deepEqual(ids, ['doc-1', 'doc-4']);
});

test('phraseSearch: phrase absent returns empty', () => {
  const ds = buildEngine();
  const res = ds.phraseSearch({ phrase: 'רמת אביב', exact: true });
  assert.equal(res.total, 0);
});

test('phraseSearch: non-exact treats as AND of tokens', () => {
  const ds = buildEngine();
  const res = ds.phraseSearch({ phrase: 'electrical office', exact: false });
  assert.equal(res.total, 1);
  assert.equal(res.results[0].docId, 'doc-3');
});

test('phraseSearch: English exact phrase', () => {
  const ds = buildEngine();
  const res = ds.phraseSearch({ phrase: 'construction site', exact: true });
  assert.equal(res.total, 1);
  assert.equal(res.results[0].docId, 'doc-5');
});

test('phraseSearch: empty phrase returns empty', () => {
  const ds = buildEngine();
  assert.equal(ds.phraseSearch({ phrase: '' }).total, 0);
  assert.equal(ds.phraseSearch({}).total, 0);
});

// ════════════════════════════════════════════════════════════════════
// 5. Proximity search
// ════════════════════════════════════════════════════════════════════

test('proximitySearch: terms within window', () => {
  const ds = buildEngine();
  const res = ds.proximitySearch({ terms: ['צביעה', 'בנייה'], maxDistance: 10 });
  const ids = res.results.map((r) => r.docId);
  assert.ok(ids.includes('doc-4'));
});

test('proximitySearch: too far apart excluded', () => {
  const ds = buildEngine();
  const res = ds.proximitySearch({ terms: ['צביעה', 'בנייה'], maxDistance: 1 });
  assert.equal(res.total, 0);
});

test('proximitySearch: missing term returns empty', () => {
  const ds = buildEngine();
  const res = ds.proximitySearch({ terms: ['צביעה', 'nonexistent'], maxDistance: 5 });
  assert.equal(res.total, 0);
});

// ════════════════════════════════════════════════════════════════════
// 6. Wildcard search
// ════════════════════════════════════════════════════════════════════

test('wildcardSearch: * suffix', () => {
  const ds = buildEngine();
  const res = ds.wildcardSearch('elect*');
  assert.ok(res.total >= 1);
  assert.equal(res.results[0].docId, 'doc-3');
});

test('wildcardSearch: ? single char', () => {
  const ds = new DocSearch();
  ds.indexDocument({ docId: 'a', content: 'cat bat hat', metadata: {} });
  const res = ds.wildcardSearch('?at');
  assert.equal(res.total, 1);
  assert.ok(res.matchingTerms.length >= 3);
});

test('wildcardSearch: Hebrew wildcard', () => {
  const ds = buildEngine();
  const res = ds.wildcardSearch('בנ*');
  const ids = res.results.map((r) => r.docId);
  assert.ok(ids.includes('doc-1'));
  assert.ok(ids.includes('doc-4'));
});

test('wildcardSearch: empty pattern safe', () => {
  const ds = buildEngine();
  assert.equal(ds.wildcardSearch('').total, 0);
});

test('compileWildcard escapes regex meta chars', () => {
  const re = compileWildcard('a.b*');
  assert.ok(re.test('a.bxyz'));
  assert.ok(!re.test('axbxyz'));
});

// ════════════════════════════════════════════════════════════════════
// 7. Fuzzy search — Levenshtein
// ════════════════════════════════════════════════════════════════════

test('levenshtein: basic distances', () => {
  assert.equal(levenshtein('cat', 'cat', 3), 0);
  assert.equal(levenshtein('cat', 'bat', 3), 1);
  assert.equal(levenshtein('cat', 'cats', 3), 1);
  assert.equal(levenshtein('kitten', 'sitting', 3), 3);
});

test('levenshtein: early exit above bound', () => {
  const d = levenshtein('aaaaa', 'bbbbb', 2);
  assert.ok(d > 2);
});

test('fuzzySearch: finds typo match', () => {
  const ds = new DocSearch();
  ds.indexDocument({ docId: 'a', content: 'invoice report', metadata: {} });
  ds.indexDocument({ docId: 'b', content: 'payment receipt', metadata: {} });
  const res = ds.fuzzySearch({ query: 'invice', maxEdits: 2 });
  assert.ok(res.total >= 1);
  assert.equal(res.results[0].docId, 'a');
});

test('fuzzySearch: Hebrew typo', () => {
  const ds = new DocSearch();
  ds.indexDocument({ docId: 'a', content: 'חוזה עבודה', metadata: {} });
  const res = ds.fuzzySearch({ query: 'חוזא', maxEdits: 2 });
  assert.ok(res.total >= 1);
});

test('fuzzySearch: empty query returns empty', () => {
  const ds = buildEngine();
  assert.equal(ds.fuzzySearch({ query: '' }).total, 0);
});

// ════════════════════════════════════════════════════════════════════
// 8. Highlight snippets
// ════════════════════════════════════════════════════════════════════

test('highlightSnippets: returns match with surrounding context', () => {
  const ds = buildEngine();
  const h = ds.highlightSnippets('doc-4', 'צביעה');
  assert.ok(h.snippets.length >= 1);
  const s = h.snippets[0];
  assert.equal(s.match, 'צביעה');
  assert.ok(s.text.includes('[צביעה]'));
});

test('highlightSnippets: unknown doc returns empty', () => {
  const ds = buildEngine();
  const h = ds.highlightSnippets('does-not-exist', 'x');
  assert.deepEqual(h.snippets, []);
});

test('highlightSnippets: multiple matches, capped by maxSnippets', () => {
  const ds = new DocSearch();
  ds.indexDocument({
    docId: 'a',
    content: 'alpha one alpha two alpha three alpha four alpha five alpha six',
    metadata: {},
  });
  const h = ds.highlightSnippets('a', 'alpha', { maxSnippets: 3 });
  assert.equal(h.snippets.length, 3);
});

// ════════════════════════════════════════════════════════════════════
// 9. Related documents — TF-IDF cosine
// ════════════════════════════════════════════════════════════════════

test('relatedDocuments: ranks by content similarity', () => {
  const ds = buildEngine();
  const related = ds.relatedDocuments('doc-1', 5);
  assert.ok(related.length >= 1);
  // doc-4 shares "בנייה", "רמת", "גן" with doc-1 → should be top-ranked
  const ids = related.map((r) => r.docId);
  assert.ok(ids.includes('doc-4'));
});

test('relatedDocuments: unknown doc returns []', () => {
  const ds = buildEngine();
  assert.deepEqual(ds.relatedDocuments('nope'), []);
});

// ════════════════════════════════════════════════════════════════════
// 10. Faceted search — counts
// ════════════════════════════════════════════════════════════════════

test('facetedSearch: counts by type/author/tag/date/language', () => {
  const ds = buildEngine();
  const f = ds.facetedSearch('');
  assert.equal(f.total, 5);
  assert.equal(f.facets.type.contract, 1);
  assert.equal(f.facets.type.quote, 1);
  assert.equal(f.facets.type.invoice, 1);
  assert.equal(f.facets.type.report, 1);
  assert.equal(f.facets.type.protocol, 1);

  assert.equal(f.facets.author.kobi, 2);
  assert.equal(f.facets.author.dana, 1);
  assert.equal(f.facets.author.avi, 2);

  assert.equal(f.facets.language.he, 3);
  assert.equal(f.facets.language.en, 2);

  // tag facets
  assert.equal(f.facets.tag['בנייה'], 2);
  assert.equal(f.facets.tag['safety'], 1);

  // date buckets
  assert.equal(f.facets.date['2026-01'], 1);
  assert.equal(f.facets.date['2026-02'], 1);
  assert.equal(f.facets.date['2026-03'], 2);
  assert.equal(f.facets.date['2025-12'], 1);
});

test('facetedSearch: with query restricts counts', () => {
  const ds = buildEngine();
  const f = ds.facetedSearch('בנייה');
  assert.ok(f.total >= 2);
  assert.ok(f.facets.type.contract >= 1);
});

// ════════════════════════════════════════════════════════════════════
// 11. Saved searches + alerts
// ════════════════════════════════════════════════════════════════════

test('savedSearches: save, list, remove', () => {
  const ds = buildEngine();
  const saved = ds.savedSearches({ userId: 'kobi' });
  const entry = saved.save({ name: 'all contracts', query: '', filters: { type: 'contract' } });
  assert.ok(entry.id);
  assert.equal(saved.list().length, 1);
  assert.equal(saved.remove(entry.id), true);
  // additive: remove marks archived rather than deleting
  const stats = ds.stats();
  assert.equal(stats.savedSearches, 1);
});

test('savedSearches: alert on new match', () => {
  const ds = buildEngine();
  const saved = ds.savedSearches({ userId: 'kobi' });
  saved.save({ name: 'reports', query: '', filters: { type: 'report' } });

  // no new matches yet
  assert.deepEqual(saved.checkAlerts(), []);

  // add a new report doc
  ds.indexDocument({
    docId: 'doc-6',
    content: 'דוח חדש על התקדמות פרויקט',
    metadata: {
      author: 'kobi',
      createdDate: '2026-04-01',
      type: 'report',
      tags: [],
      customerId: 'cust-100',
      projectId: 'proj-A',
      language: 'he',
    },
  });

  const alerts = saved.checkAlerts();
  assert.equal(alerts.length, 1);
  assert.ok(alerts[0].newMatches.includes('doc-6'));

  // next call: no more new matches
  assert.deepEqual(saved.checkAlerts(), []);
});

test('savedSearches: requires userId', () => {
  const ds = buildEngine();
  assert.throws(() => ds.savedSearches({}), /userId is required/);
});

// ════════════════════════════════════════════════════════════════════
// 12. Search history
// ════════════════════════════════════════════════════════════════════

test('searchHistory: push + list most recent first', () => {
  const ds = buildEngine();
  const h = ds.searchHistory({ userId: 'kobi' });
  h.push('בנייה');
  h.push('רמת גן');
  h.push('חוזה');
  const recent = h.list();
  assert.equal(recent.length, 3);
  assert.equal(recent[0].query, 'חוזה');
  assert.equal(recent[2].query, 'בנייה');
});

test('searchHistory: respects maxHistory', () => {
  const ds = new DocSearch({ maxHistory: 3 });
  const h = ds.searchHistory({ userId: 'kobi' });
  h.push('q1'); h.push('q2'); h.push('q3'); h.push('q4');
  assert.equal(h.list().length, 3);
  assert.equal(h.list()[0].query, 'q4');
});

test('searchHistory: empty queries ignored', () => {
  const ds = buildEngine();
  const h = ds.searchHistory({ userId: 'u' });
  h.push('');
  h.push('   ');
  assert.equal(h.list().length, 0);
});

// ════════════════════════════════════════════════════════════════════
// 13. Permission filtering — ACL
// ════════════════════════════════════════════════════════════════════

test('permissionFiltered: owner sees own docs', () => {
  const ds = buildEngine();
  const all = ds.search({ query: '' }).results;
  const kobi = ds.permissionFiltered({ results: all, user: { id: 'kobi', groups: ['procurement'] } });
  const ids = kobi.map((r) => r.docId).sort();
  // kobi owns doc-1, doc-4; is a reader on doc-5; doc-3 is public
  // plus procurement group gives doc-1, doc-4 again
  assert.ok(ids.includes('doc-1'));
  assert.ok(ids.includes('doc-3')); // public
  assert.ok(ids.includes('doc-4'));
  assert.ok(ids.includes('doc-5')); // reader
  assert.ok(!ids.includes('doc-2')); // dana's — kobi not on sales
});

test('permissionFiltered: non-member blocked from private docs', () => {
  const ds = buildEngine();
  const all = ds.search({ query: '' }).results;
  const stranger = ds.permissionFiltered({
    results: all,
    user: { id: 'stranger', groups: [] },
  });
  const ids = stranger.map((r) => r.docId);
  // only the public doc-3
  assert.deepEqual(ids, ['doc-3']);
});

test('permissionFiltered: admin sees all', () => {
  const ds = buildEngine();
  const all = ds.search({ query: '' }).results;
  const admin = ds.permissionFiltered({
    results: all,
    user: { id: 'root', roles: ['admin'] },
  });
  assert.equal(admin.length, 5);
});

test('permissionFiltered: group membership grants access', () => {
  const ds = buildEngine();
  const all = ds.search({ query: '' }).results;
  const sales = ds.permissionFiltered({
    results: all,
    user: { id: 'newbie', groups: ['sales'] },
  });
  const ids = sales.map((r) => r.docId).sort();
  assert.ok(ids.includes('doc-2'));
  assert.ok(ids.includes('doc-3')); // public
});

test('permissionFiltered: missing user returns empty', () => {
  const ds = buildEngine();
  const all = ds.search({ query: '' }).results;
  assert.deepEqual(ds.permissionFiltered({ results: all }), []);
});

test('permissionFiltered: bad input shapes handled', () => {
  const ds = buildEngine();
  assert.deepEqual(ds.permissionFiltered({ results: null, user: { id: 'k' } }), []);
  assert.deepEqual(
    ds.permissionFiltered({ results: [null, { docId: null }], user: { id: 'k' } }),
    []
  );
});
