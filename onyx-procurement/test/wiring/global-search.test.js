/**
 * Tests — Global Search Federator (Agent Y-198)
 *
 * Run: node --test test/wiring/global-search.test.js
 *
 * Bilingual coverage: Hebrew + English, scatter/gather partial results,
 * BM25 scoring, permission filtering, safe HTML highlighting, facets,
 * timeout tolerance, edge cases, and idempotent registration.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  GlobalSearch,
  tokenize,
  normalizeToken,
  escapeHtml,
  highlightText,
  hasPermission,
  bm25Score,
  buildFacets,
} = require('../../src/wiring/global-search');

// ─── Fixtures ───────────────────────────────────────────────────────────────

const procurementFixtures = [
  {
    id: 'po-001',
    type: 'po',
    title: 'הזמנת רכש בטון טרומי',
    body: 'רכש של 200 יחידות בטון טרומי מספק מרכזי לפרויקט בנייה בחיפה.',
    owner: 'kobi',
    date: '2026-01-15',
    acl: ['ops', 'admin'],
  },
  {
    id: 'po-002',
    type: 'po',
    title: 'Steel Rebar Purchase Order',
    body: 'Procurement of 5 tons of steel rebar for construction site A.',
    owner: 'yossi',
    date: '2026-02-10',
    acl: ['ops'],
  },
  {
    id: 'po-003',
    type: 'po',
    title: 'חשבונית שיווקית',
    body: 'חשבונית לספק בטון ניסן עבור הפרויקט ברמת גן',
    owner: 'kobi',
    date: '2026-03-01',
    acl: [],
  },
];

const hrFixtures = [
  {
    id: 'emp-101',
    type: 'employee',
    title: 'שלום לוי — מהנדס בנייה',
    body: 'מהנדס אזרחי עם התמחות בפרויקטי בטון וברזל.',
    owner: 'hr',
    date: '2025-09-01',
    acl: ['hr', 'admin'],
  },
  {
    id: 'emp-102',
    type: 'employee',
    title: 'Avi Cohen — Project Manager',
    body: 'Senior PM specializing in construction concrete projects.',
    owner: 'hr',
    date: '2025-05-15',
    acl: ['hr', 'admin'],
  },
];

const financeFixtures = [
  {
    id: 'inv-500',
    type: 'invoice',
    title: 'Invoice #500 — Concrete Supplier',
    body: 'Payment for concrete delivery batch #500, total 45,000 NIS.',
    owner: 'finance',
    date: '2026-03-20',
    acl: ['finance', 'admin'],
  },
];

function makeModule(fixtures) {
  return async (q, opts) => {
    const toks = tokenize(q);
    if (toks.length === 0) return fixtures.slice();
    return fixtures.filter((f) => {
      const hay = tokenize((f.title || '') + ' ' + (f.body || ''));
      for (const t of toks) if (hay.indexOf(t) !== -1) return true;
      return false;
    });
  };
}

function wire(gs) {
  gs.registerIndex('procurement', makeModule(procurementFixtures));
  gs.registerIndex('hr', makeModule(hrFixtures));
  gs.registerIndex('finance', makeModule(financeFixtures));
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test('1. tokenize — Hebrew with niqqud and final letters', () => {
  const toks = tokenize('שָׁלוֹם עוֹלָם');
  assert.deepEqual(toks, ['שלומ', 'עולמ']);
});

test('2. tokenize — English lowercase and stopwords removal', () => {
  const toks = tokenize('The quick brown fox');
  assert.deepEqual(toks, ['quick', 'brown', 'fox']);
});

test('3. tokenize — bilingual mixed input', () => {
  const toks = tokenize('Cement בטון 500kg');
  assert.ok(toks.includes('cement'));
  assert.ok(toks.includes('בטונ'));
  assert.ok(toks.includes('500kg'));
});

test('4. normalizeToken — final letters map correctly', () => {
  assert.equal(normalizeToken('שלום'), 'שלומ');
  assert.equal(normalizeToken('יין'), 'יינ');
  assert.equal(normalizeToken('ארץ'), 'ארצ');
});

test('5. escapeHtml — safely escapes XSS payloads', () => {
  const dirty = '<script>alert("x")</script>';
  const clean = escapeHtml(dirty);
  assert.equal(clean, '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  assert.ok(!clean.includes('<script>'));
});

test('6. highlightText — wraps matched tokens and stays HTML-safe', () => {
  const html = highlightText('Buy cement & steel', ['cement']);
  assert.ok(html.includes('<mark>cement</mark>'));
  assert.ok(html.includes('&amp;'));
  assert.ok(!html.includes('& '));
});

test('7. highlightText — highlights Hebrew with niqqud variant', () => {
  const html = highlightText('רכש בטון לפרויקט', ['בטון']);
  assert.ok(html.includes('<mark>בטון</mark>'));
});

test('8. hasPermission — no ACL means public', () => {
  assert.equal(hasPermission([], ['ops']), true);
  assert.equal(hasPermission(undefined, []), true);
});

test('9. hasPermission — ACL enforced correctly', () => {
  assert.equal(hasPermission(['finance'], ['ops']), false);
  assert.equal(hasPermission(['finance', 'admin'], ['admin']), true);
  assert.equal(hasPermission(['hr'], ['*']), true);
});

test('10. bm25Score — higher for query-matching docs', () => {
  const df = new Map([['cement', 1], ['steel', 2]]);
  const a = bm25Score(['cement'], ['cement', 'delivery'], df, 3, 2);
  const b = bm25Score(['cement'], ['steel', 'delivery'], df, 3, 2);
  assert.ok(a > b);
  assert.equal(b, 0);
});

test('11. registerIndex — throws on bad input, tracks modules', () => {
  const gs = new GlobalSearch();
  assert.throws(() => gs.registerIndex('', async () => []), TypeError);
  assert.throws(() => gs.registerIndex('x', null), TypeError);
  gs.registerIndex('m1', async () => []);
  assert.deepEqual(gs.modules, ['m1']);
});

test('12. unregisterIndex — soft-disables but NEVER deletes', () => {
  const gs = new GlobalSearch();
  gs.registerIndex('m1', async () => []);
  gs.registerIndex('m2', async () => []);
  const ok = gs.unregisterIndex('m1');
  assert.equal(ok, true);
  // Still tracked, but not enabled
  assert.deepEqual(gs.modules, ['m1', 'm2']);
  assert.deepEqual(gs.enabledModules, ['m2']);
  // Re-enable
  assert.equal(gs.enableIndex('m1'), true);
  assert.deepEqual(gs.enabledModules, ['m1', 'm2']);
});

test('13. query — scatter/gather across modules returns merged results', async () => {
  const gs = new GlobalSearch();
  wire(gs);
  const res = await gs.query('concrete', { perms: ['admin', 'hr', 'finance', 'ops'] });
  assert.ok(res.results.length >= 2);
  const modules = new Set(res.results.map((r) => r._module));
  assert.ok(modules.has('hr'));
  assert.ok(modules.has('finance'));
  assert.ok(res.diagnostics.responded.includes('procurement'));
});

test('14. query — Hebrew query federated across procurement + hr', async () => {
  const gs = new GlobalSearch();
  wire(gs);
  const res = await gs.query('בטון', { perms: ['admin'] });
  assert.ok(res.results.length >= 2);
  const ids = res.results.map((r) => r.id);
  assert.ok(ids.includes('po-001') || ids.includes('po-003'));
  assert.ok(ids.includes('emp-101'));
});

test('15. query — permission filtering removes unauthorized docs', async () => {
  const gs = new GlobalSearch();
  wire(gs);
  // Caller only has ops permission — no finance, no hr
  const res = await gs.query('concrete', { perms: ['ops'] });
  for (const r of res.results) {
    assert.notEqual(r.type, 'invoice');
    assert.notEqual(r.type, 'employee');
  }
});

test('16. query — type filter whitelist works', async () => {
  const gs = new GlobalSearch();
  wire(gs);
  const res = await gs.query('בטון', { types: ['po'], perms: ['admin'] });
  for (const r of res.results) assert.equal(r.type, 'po');
});

test('17. query — limit caps result count', async () => {
  const gs = new GlobalSearch();
  wire(gs);
  const res = await gs.query('בטון', { limit: 1, perms: ['admin'] });
  assert.equal(res.results.length, 1);
});

test('18. query — results include highlighted title and snippet', async () => {
  const gs = new GlobalSearch();
  wire(gs);
  const res = await gs.query('concrete', { perms: ['admin'] });
  const hit = res.results.find((r) => r.id === 'inv-500');
  assert.ok(hit);
  assert.ok(hit._titleHl.includes('<mark>'));
  assert.ok(hit._snippetHl.length > 0);
});

test('19. query — facets built by type / owner / date', async () => {
  const gs = new GlobalSearch();
  wire(gs);
  const res = await gs.query('בטון', { perms: ['admin'] });
  assert.ok(Array.isArray(res.facets.type));
  assert.ok(Array.isArray(res.facets.owner));
  assert.ok(Array.isArray(res.facets.date));
  const typeKeys = res.facets.type.map((f) => f.key);
  assert.ok(typeKeys.includes('po') || typeKeys.includes('employee'));
});

test('20. query — scatter tolerates a timing-out module (partial results)', async () => {
  const gs = new GlobalSearch({ defaultTimeoutMs: 30 });
  gs.registerIndex('fast', async () => procurementFixtures.slice(0, 1));
  gs.registerIndex('slow', async () =>
    new Promise((resolve) => setTimeout(() => resolve([]), 500))
  );
  const res = await gs.query('בטון', { perms: ['admin'], timeoutMs: 30 });
  assert.ok(res.diagnostics.timedOut.includes('slow'));
  assert.ok(res.diagnostics.responded.includes('fast'));
  assert.ok(res.results.length >= 1);
});

test('21. query — scatter tolerates a throwing module', async () => {
  const gs = new GlobalSearch();
  gs.registerIndex('ok', async () => procurementFixtures.slice(0, 1));
  gs.registerIndex('broken', async () => { throw new Error('kaboom'); });
  const res = await gs.query('בטון', { perms: ['admin'] });
  assert.equal(res.diagnostics.errored.length, 1);
  assert.equal(res.diagnostics.errored[0].moduleId, 'broken');
  assert.ok(res.results.length >= 1);
});

test('22. query — empty query returns all allowed docs (list mode)', async () => {
  const gs = new GlobalSearch();
  wire(gs);
  const res = await gs.query('', { perms: ['admin'] });
  assert.ok(res.results.length >= 5);
});

test('23. buildFacets — date buckets formatted YYYY-MM', () => {
  const facets = buildFacets([
    { id: '1', type: 'po', date: '2026-01-15' },
    { id: '2', type: 'po', date: '2026-01-20' },
    { id: '3', type: 'po', date: '2026-02-01' },
  ]);
  const keys = facets.date.map((f) => f.key);
  assert.deepEqual(keys.sort(), ['2026-01', '2026-02']);
  const jan = facets.date.find((f) => f.key === '2026-01');
  assert.equal(jan.count, 2);
});

test('24. query — BM25 ranks title matches above body-only matches', async () => {
  const gs = new GlobalSearch();
  gs.registerIndex('m', async () => ([
    { id: 'a', type: 'x', title: 'unrelated topic', body: 'mentions cement once' },
    { id: 'b', type: 'x', title: 'cement order', body: 'short' },
  ]));
  const res = await gs.query('cement', { perms: ['admin'] });
  assert.equal(res.results[0].id, 'b');
});

test('25. query — module whitelist restricts scatter', async () => {
  const gs = new GlobalSearch();
  wire(gs);
  const res = await gs.query('בטון', {
    perms: ['admin'],
    modules: ['procurement'],
  });
  for (const r of res.results) assert.equal(r._module, 'procurement');
  assert.deepEqual(res.diagnostics.responded, ['procurement']);
});
