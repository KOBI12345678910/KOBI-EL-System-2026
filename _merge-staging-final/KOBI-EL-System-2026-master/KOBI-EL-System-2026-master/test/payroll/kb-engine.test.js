/**
 * test/payroll/kb-engine.test.js
 * ──────────────────────────────
 * Agent X-22 — Internal Knowledge Base test suite.
 * Zero deps. Runs with plain `node` via a tiny assertion harness.
 *
 * Run:
 *   node test/payroll/kb-engine.test.js
 *
 * Expected: "kb-engine: <N>/<N> tests passed" and process exit code 0.
 */

'use strict';

const path = require('path');
const assert = require('assert');

const kbModulePath = path.resolve(
  __dirname,
  '..',
  '..',
  'onyx-procurement',
  'src',
  'kb',
  'kb-engine.js'
);

const { createKB, seedDefaultKB, _internal } = require(kbModulePath);

// ───────────────────────────────────────────────────────────────
// Lightweight test runner (zero deps)
// ───────────────────────────────────────────────────────────────

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

async function run() {
  let passed = 0;
  const failed = [];
  for (const t of tests) {
    try {
      await t.fn();
      passed += 1;
      console.log(`  ok   ${t.name}`);
    } catch (err) {
      failed.push({ name: t.name, err });
      console.log(`  FAIL ${t.name}\n       ${err && err.message}`);
    }
  }
  console.log(
    `\nkb-engine: ${passed}/${tests.length} tests passed` +
      (failed.length ? ` — ${failed.length} failures` : '')
  );
  if (failed.length) process.exit(1);
}

// ───────────────────────────────────────────────────────────────
// Tests
// ───────────────────────────────────────────────────────────────

test('1. createKB() seeds 10 articles and 8 categories', () => {
  const kb = createKB();
  const cats = kb.listCategories();
  assert.strictEqual(cats.length, 8, 'should seed 8 categories');
  assert.strictEqual(kb._state.articles.size, 10, 'should seed 10 articles');
  const ids = Array.from(kb._state.articles.keys());
  const expectedIds = [
    'kb-payroll-wage-slip',
    'kb-tax-income-2026',
    'kb-acc-invoice-allocation',
    'kb-reports-1320',
    'kb-payroll-severance',
    'kb-benefits-recreation',
    'kb-social-ni-employer',
    'kb-social-study-fund',
    'kb-tools-salary-sim',
    'kb-ops-backup-restore',
  ];
  for (const id of expectedIds) {
    assert.ok(ids.includes(id), `missing article ${id}`);
  }
});

test('2. seeded articles are bilingual and non-empty', () => {
  const kb = createKB();
  for (const a of kb._state.articles.values()) {
    assert.ok(a.title && a.title.he && a.title.en, `${a.id} title missing`);
    assert.ok(a.body && a.body.he && a.body.en, `${a.id} body missing`);
    // Each article should have at least 100 chars of real content, not a placeholder
    assert.ok(a.body.he.length > 100, `${a.id} Hebrew body too short`);
    assert.ok(a.body.en.length > 100, `${a.id} English body too short`);
  }
});

test('3. createArticle() requires bilingual title + body + category', () => {
  const kb = createKB({ autoSeed: false });
  kb.upsertCategory({
    id: 'payroll',
    name: { he: 'שכר', en: 'Payroll' },
  });
  // missing title.en
  assert.throws(() =>
    kb.createArticle({
      title: { he: 'כותרת' },
      body: { he: 'גוף', en: 'body' },
      category: 'payroll',
    })
  );
  // missing body
  assert.throws(() =>
    kb.createArticle({
      title: { he: 'כ', en: 'T' },
      category: 'payroll',
    })
  );
  // missing category
  assert.throws(() =>
    kb.createArticle({
      title: { he: 'כותרת', en: 'Title' },
      body: { he: 'גוף', en: 'Body' },
    })
  );
  // unknown category
  assert.throws(() =>
    kb.createArticle({
      title: { he: 'כותרת', en: 'Title' },
      body: { he: 'גוף', en: 'Body' },
      category: 'nosuch',
    })
  );
});

test('4. updateArticle() creates a new version and keeps the old one', () => {
  const kb = createKB();
  const art = kb.getArticle('kb-payroll-wage-slip');
  assert.strictEqual(art.version, 1);
  assert.strictEqual(art.versions.length, 0);

  const updated = kb.updateArticle('kb-payroll-wage-slip', {
    body: {
      he: art.body.he + ' (עודכן ל־2026)',
      en: art.body.en + ' (updated for 2026)',
    },
  });
  assert.strictEqual(updated.version, 2);
  assert.strictEqual(updated.versions.length, 1);
  assert.strictEqual(updated.versions[0].version, 1);
  // original body preserved in history
  assert.ok(
    !updated.versions[0].body.he.includes('עודכן ל־2026'),
    'history should keep the ORIGINAL body'
  );
  assert.ok(
    updated.body.he.includes('עודכן ל־2026'),
    'current body should reflect the update'
  );
});

test('5. updateArticle() increments versions monotonically', () => {
  const kb = createKB();
  let art;
  for (let i = 0; i < 5; i++) {
    art = kb.updateArticle('kb-tax-income-2026', {
      tags: ['v' + (i + 1)],
    });
  }
  assert.strictEqual(art.version, 6); // 1 initial + 5 updates
  assert.strictEqual(art.versions.length, 5);
});

test('6. deleteArticle() is refused (never-delete rule)', () => {
  const kb = createKB();
  assert.throws(() => kb.deleteArticle('kb-payroll-wage-slip'), /never-delete/);
  assert.strictEqual(kb._state.articles.size, 10);
});

test('7. searchKB() finds Hebrew articles by Hebrew query', () => {
  const kb = createKB();
  const results = kb.searchKB('תלוש שכר', 'he');
  assert.ok(results.length > 0, 'expected at least one hit');
  assert.strictEqual(results[0].article.id, 'kb-payroll-wage-slip');
  assert.ok(results[0].score > 0);
  assert.ok(typeof results[0].snippet === 'string');
});

test('8. searchKB() finds English articles by English query', () => {
  const kb = createKB();
  const results = kb.searchKB('severance calculation', 'en');
  assert.ok(results.length > 0);
  assert.strictEqual(results[0].article.id, 'kb-payroll-severance');
});

test('9. searchKB() is ranked by relevance (BM25-lite)', () => {
  const kb = createKB();
  const results = kb.searchKB('מס הכנסה מדרגות', 'he');
  assert.ok(results.length >= 1);
  // The income-tax article should be rank #1
  assert.strictEqual(results[0].article.id, 'kb-tax-income-2026');
  if (results.length > 1) {
    assert.ok(
      results[0].score >= results[1].score,
      'results must be sorted by score desc'
    );
  }
});

test('10. searchKB() returns empty for empty query, not throws', () => {
  const kb = createKB();
  assert.deepStrictEqual(kb.searchKB('', 'he'), []);
  assert.deepStrictEqual(kb.searchKB('   ', 'he'), []);
  assert.deepStrictEqual(kb.searchKB(null, 'he'), []);
});

test('11. searchKB() falls back to substring when BM25 finds nothing', () => {
  const kb = createKB();
  // "1320" is a digit token — still tokenised, should match form 1320 article
  const results = kb.searchKB('1320', 'he');
  assert.ok(results.length >= 1);
  assert.ok(results.some((r) => r.article.id === 'kb-reports-1320'));
});

test('12. getCategory() returns category + all its articles', () => {
  const kb = createKB();
  const cat = kb.getCategory('payroll');
  assert.ok(cat);
  assert.strictEqual(cat.category.id, 'payroll');
  // two seeded articles in "payroll": wage-slip + severance
  const ids = cat.articles.map((a) => a.id).sort();
  assert.deepStrictEqual(ids, ['kb-payroll-severance', 'kb-payroll-wage-slip']);
});

test('13. categories have FAQs and hierarchy', () => {
  const kb = createKB();
  const cat = kb.getCategory('payroll');
  assert.ok(cat.category.faqs.length >= 2);
  assert.ok(cat.category.faqs[0].q.he && cat.category.faqs[0].q.en);
  assert.ok(cat.category.faqs[0].a.he && cat.category.faqs[0].a.en);
  // child category exists
  const benefits = kb.getCategory('benefits');
  assert.strictEqual(benefits.category.parent, 'payroll');
  // payroll should list benefits as a child (post-hierarchy wiring)
  const payrollFresh = kb.listCategories().find((c) => c.id === 'payroll');
  assert.ok(payrollFresh.children.includes('benefits'));
});

test('14. markHelpful() increments the right counter only', () => {
  const kb = createKB();
  const before = kb.getArticle('kb-ops-backup-restore');
  assert.strictEqual(before.helpful_count, 0);
  assert.strictEqual(before.not_helpful_count, 0);

  const r1 = kb.markHelpful('kb-ops-backup-restore', true);
  assert.strictEqual(r1.helpful_count, 1);
  assert.strictEqual(r1.not_helpful_count, 0);

  const r2 = kb.markHelpful('kb-ops-backup-restore', false);
  assert.strictEqual(r2.helpful_count, 1);
  assert.strictEqual(r2.not_helpful_count, 1);

  // validation: helpful must be boolean
  assert.throws(() => kb.markHelpful('kb-ops-backup-restore', 'yes'));
  // unknown article
  assert.throws(() => kb.markHelpful('kb-nope', true));
});

test('15. getPopular() sorts by view count desc', () => {
  const kb = createKB();
  // bump views on a couple of articles
  kb.getArticle('kb-reports-1320', { incrementViews: true });
  kb.getArticle('kb-reports-1320', { incrementViews: true });
  kb.getArticle('kb-reports-1320', { incrementViews: true });
  kb.getArticle('kb-payroll-wage-slip', { incrementViews: true });
  kb.getArticle('kb-payroll-wage-slip', { incrementViews: true });
  kb.getArticle('kb-tax-income-2026', { incrementViews: true });

  const top = kb.getPopular(3);
  assert.strictEqual(top.length, 3);
  assert.strictEqual(top[0].id, 'kb-reports-1320');
  assert.strictEqual(top[0].views, 3);
  assert.strictEqual(top[1].id, 'kb-payroll-wage-slip');
  assert.strictEqual(top[1].views, 2);
  assert.ok(top[2].views <= top[1].views);
});

test('16. getRelated() prefers explicit related, then same category', () => {
  const kb = createKB();
  const related = kb.getRelated('kb-payroll-wage-slip', 3);
  assert.strictEqual(related.length, 3);
  // kb-payroll-wage-slip has explicit related: tax-income-2026, severance, recreation
  const ids = related.map((a) => a.id);
  assert.ok(ids.includes('kb-tax-income-2026'));
  assert.ok(ids.includes('kb-payroll-severance'));
});

test('17. getRelated() fills from same category when explicit not enough', () => {
  const kb = createKB();
  // kb-ops-backup-restore has empty related[]; it should fall back to same category (ops has only it).
  const related = kb.getRelated('kb-ops-backup-restore', 3);
  assert.ok(Array.isArray(related));
  // ops has only the one article, so expect 0 related
  assert.strictEqual(related.length, 0);

  // kb-social-ni-employer has related: ['kb-tax-income-2026', 'kb-payroll-wage-slip']
  // Ask for 3, so it should fill one more from same "social" category → study-fund
  const related2 = kb.getRelated('kb-social-ni-employer', 3);
  assert.strictEqual(related2.length, 3);
  const ids = related2.map((r) => r.id);
  assert.ok(ids.includes('kb-social-study-fund'));
});

test('18. diffVersions() returns added / removed tokens across versions', () => {
  const kb = createKB();
  kb.updateArticle('kb-tax-income-2026', {
    body: {
      he: 'תוכן חדש לגמרי עם מילים שלא היו קודם כגון אובונטו פינגווין',
      en: 'Brand new content with tokens like ubuntu penguin',
    },
  });
  const diff = kb.diffVersions('kb-tax-income-2026', 1, 2);
  assert.ok(diff.added.length > 0);
  assert.ok(diff.removed.length > 0);
  assert.ok(diff.added.includes('אובונטו') || diff.added.includes('פינגווין'));
  assert.strictEqual(diff.from, 1);
  assert.strictEqual(diff.to, 2);
});

test('19. getArticle() optionally increments view counter', () => {
  const kb = createKB();
  const a0 = kb.getArticle('kb-tools-salary-sim');
  assert.strictEqual(a0.views, 0);
  kb.getArticle('kb-tools-salary-sim', { incrementViews: true });
  kb.getArticle('kb-tools-salary-sim', { incrementViews: true });
  const a2 = kb.getArticle('kb-tools-salary-sim');
  assert.strictEqual(a2.views, 2);
  // read without increment leaves count unchanged
  kb.getArticle('kb-tools-salary-sim');
  assert.strictEqual(kb.getArticle('kb-tools-salary-sim').views, 2);
});

test('20. external search engine takes precedence when provided', () => {
  let called = false;
  const fakeExternal = ({ query, lang, docs }) => {
    called = true;
    // Return the first doc regardless
    return [{ article: docs[0], score: 99, snippet: 'from-ext' }];
  };
  const kb = createKB({ externalSearch: fakeExternal });
  const results = kb.searchKB('anything', 'he');
  assert.strictEqual(called, true);
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].snippet, 'from-ext');
  assert.strictEqual(results[0].score, 99);
});

test('21. tokeniser strips nikud and normalises case', () => {
  const { tokenise, normaliseText } = _internal;
  // a word with nikud should match the same word without nikud
  const withNikud = tokenise('שָׁלוֹם');
  const without = tokenise('שלום');
  assert.deepStrictEqual(withNikud, without);
  assert.strictEqual(normaliseText('MixedCASE'), 'mixedcase');
});

test('22. stopwords are dropped from tokenisation', () => {
  const { tokenise } = _internal;
  const tokens = tokenise('the quick brown fox is the best');
  assert.ok(!tokens.includes('the'));
  assert.ok(!tokens.includes('is'));
  assert.ok(tokens.includes('quick'));
});

test('23. searchKB() score rises with repeated query terms in document', () => {
  const kb = createKB({ autoSeed: false });
  kb.upsertCategory({
    id: 'c1',
    name: { he: 'קטגוריה', en: 'Cat' },
  });
  kb.createArticle({
    id: 'a1',
    category: 'c1',
    title: { he: 'מסמך רגיל', en: 'Ordinary doc' },
    body: {
      he: 'המסמך מכיל מילה אחת של חיפוש: בלוקצ׳יין.',
      en: 'Doc has only one search term: blockchain.',
    },
  });
  kb.createArticle({
    id: 'a2',
    category: 'c1',
    title: { he: 'מסמך דחוס', en: 'Dense doc' },
    body: {
      he: 'בלוקצ׳יין בלוקצ׳יין בלוקצ׳יין בלוקצ׳יין טכנולוגיה מבוזרת.',
      en: 'blockchain blockchain blockchain blockchain distributed technology.',
    },
  });
  const ranked = kb.searchKB('בלוקצ׳יין', 'he');
  assert.ok(ranked.length >= 2);
  assert.strictEqual(ranked[0].article.id, 'a2');
});

// ───────────────────────────────────────────────────────────────
// Go!
// ───────────────────────────────────────────────────────────────

run();
