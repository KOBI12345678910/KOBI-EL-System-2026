/**
 * Tests — InternalWiki (Agent Y-132)
 * Zero deps (node:test + node:assert/strict).
 *
 * Covers the full required matrix:
 *   • create + initial version
 *   • update + append-only versioning
 *   • diff computation (line-level)
 *   • TF-IDF search (Hebrew + English + filters)
 *   • Hebrew tokeniser (nikkud + prefixes)
 *   • Markdown mini-parser (headings / lists / bold / italic / inline code
 *     / links / wiki-links / fenced code blocks)
 *   • wiki-link extraction
 *   • link graph + broken links
 *   • archivePage (append-only, never deletes)
 *   • bulk import
 *   • watchers (append-only)
 *   • table of contents
 *   • recentChanges
 *   • exportMarkdown
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  InternalWiki,
  SPACES,
  PAGE_STATUS,
  BILINGUAL_LABELS,
  parseMarkdown,
  extractWikiLinks,
  tokenize,
  stripHebrewPrefix,
  slugify,
  lineDiff,
} = require('../../src/comms/internal-wiki');

// -------- helpers ------------------------------------------------------------

function makeWiki() {
  return new InternalWiki();
}

function basePage(over = {}) {
  return Object.assign({
    title_he: 'מדריך קליטת עובד',
    title_en: 'Employee Onboarding Guide',
    slug:     'onboarding-guide',
    markdown: '# כותרת\n\nטקסט בעברית.\n\n- פריט ראשון\n- פריט שני',
    spaces:   ['onboarding'],
    tags:     ['hr', 'onboarding'],
    author:   'y132-bot',
  }, over);
}

// ---- 1 -----------------------------------------------------------------------
test('constants and labels export correctly', () => {
  assert.ok(SPACES.engineering);
  assert.ok(SPACES.hr);
  assert.ok(SPACES.finance);
  assert.ok(SPACES.ops);
  assert.ok(SPACES.onboarding);
  assert.ok(SPACES.compliance);
  assert.equal(PAGE_STATUS.ACTIVE,   'active');
  assert.equal(PAGE_STATUS.ARCHIVED, 'archived');
  assert.ok(BILINGUAL_LABELS.page.he);
  assert.ok(BILINGUAL_LABELS.page.en);
});

// ---- 2 -----------------------------------------------------------------------
test('createPage seeds version 1 and indexes slug', () => {
  const w = makeWiki();
  const p = w.createPage(basePage());
  assert.equal(p.versions.length, 1);
  assert.equal(p.versions[0].version, 1);
  assert.equal(p.versions[0].editor, 'y132-bot');
  assert.equal(p.status, PAGE_STATUS.ACTIVE);
  assert.equal(p.slug, 'onboarding-guide');
});

// ---- 3 -----------------------------------------------------------------------
test('createPage validates required fields and spaces', () => {
  const w = makeWiki();
  assert.throws(() => w.createPage(basePage({ title_he: '' })),   /title_he required/);
  assert.throws(() => w.createPage(basePage({ title_en: '' })),   /title_en required/);
  assert.throws(() => w.createPage(basePage({ author: '' })),     /author required/);
  assert.throws(() => w.createPage(basePage({ spaces: [] })),     /spaces/);
  assert.throws(() => w.createPage(basePage({ spaces: ['xyz'] })),/unknown space/);
});

// ---- 4 -----------------------------------------------------------------------
test('createPage rejects duplicate slug', () => {
  const w = makeWiki();
  w.createPage(basePage({ slug: 'shared-slug' }));
  assert.throws(
    () => w.createPage(basePage({ slug: 'shared-slug', title_en: 'Other' })),
    /slug already exists/
  );
});

// ---- 5 -----------------------------------------------------------------------
test('updatePage pushes a new version (append-only)', () => {
  const w = makeWiki();
  const p = w.createPage(basePage());
  const upd = w.updatePage(p.id, {
    markdown: '# כותרת חדשה\n\nעדכון',
    editor:   'ops-admin',
    summary:  'refresh',
  });
  assert.equal(upd.versions.length, 2);
  assert.equal(upd.versions[0].version, 1);
  assert.equal(upd.versions[1].version, 2);
  assert.equal(upd.versions[0].markdown, p.versions[0].markdown,  'v1 unchanged');
  assert.equal(upd.versions[1].editor, 'ops-admin');

  // And v3:
  const upd2 = w.updatePage(p.id, {
    markdown: '# כותרת חדשה\n\nעדכון\n\nשורה נוספת',
    editor:   'ops-admin',
    summary:  'add line',
  });
  assert.equal(upd2.versions.length, 3);
});

// ---- 6 -----------------------------------------------------------------------
test('updatePage same-content is a no-op but does not throw', () => {
  const w = makeWiki();
  const p = w.createPage(basePage());
  const same = w.updatePage(p.id, {
    markdown: p.versions[0].markdown,
    editor:   'ops-admin',
  });
  assert.equal(same.versions.length, 1);
});

// ---- 7 -----------------------------------------------------------------------
test('getPage returns latest by default and specific version on request', () => {
  const w = makeWiki();
  const p = w.createPage(basePage());
  w.updatePage(p.id, { markdown: 'v2 body', editor: 'editor-a' });
  w.updatePage(p.id, { markdown: 'v3 body', editor: 'editor-b' });

  const latest = w.getPage(p.id);
  assert.equal(latest.currentVersion, 3);
  assert.equal(latest.currentMarkdown, 'v3 body');

  const v1 = w.getPage(p.id, { version: 1 });
  assert.equal(v1.currentVersion, 1);
  assert.equal(v1.currentMarkdown, p.versions[0].markdown);

  assert.throws(() => w.getPage(p.id, { version: 99 }), /version not found/);
});

// ---- 8 -----------------------------------------------------------------------
test('listVersions returns full history metadata', () => {
  const w = makeWiki();
  const p = w.createPage(basePage());
  w.updatePage(p.id, { markdown: 'line one\nline two', editor: 'a', summary: 'first edit' });
  w.updatePage(p.id, { markdown: 'line one\nline two\nline three', editor: 'b', summary: 'add line three' });

  const list = w.listVersions(p.id);
  assert.equal(list.length, 3);
  assert.equal(list[0].version, 1);
  assert.equal(list[1].editor,  'a');
  assert.equal(list[2].summary, 'add line three');
  for (const v of list) assert.ok(typeof v.size === 'number' && v.size >= 0);
});

// ---- 9 -----------------------------------------------------------------------
test('diffVersions computes line-level adds / removes', () => {
  const w = makeWiki();
  const p = w.createPage(basePage({
    markdown: 'alpha\nbeta\ngamma',
  }));
  w.updatePage(p.id, { markdown: 'alpha\nBETA\ngamma\ndelta', editor: 'e' });

  const d = w.diffVersions(p.id, 1, 2);
  assert.ok(d.added.includes('BETA'));
  assert.ok(d.added.includes('delta'));
  assert.ok(d.removed.includes('beta'));
  assert.equal(d.summary.added, 2);
  assert.equal(d.summary.removed, 1);
  assert.equal(d.summary.net, 1);
});

// ---- 10 ----------------------------------------------------------------------
test('lineDiff unit: identical inputs produce no changes', () => {
  const d = lineDiff('a\nb\nc', 'a\nb\nc');
  assert.equal(d.added.length, 0);
  assert.equal(d.removed.length, 0);
});

// ---- 11 ----------------------------------------------------------------------
test('Hebrew tokeniser strips nikkud and common prefixes', () => {
  // Nikud (the patach mark U+05B7 on ב)
  const t1 = tokenize('בַּבַּ֥יִת');
  assert.ok(t1.length > 0, 'some tokens produced');
  // Prefix stripper direct
  assert.equal(stripHebrewPrefix('לעובד'), 'עובד');
  assert.equal(stripHebrewPrefix('הבית'),  'בית');
  assert.equal(stripHebrewPrefix('מהעיר'), 'עיר');
  // Stop word dropped
  assert.equal(tokenize('של על'). length, 0);
  // Bilingual
  const mixed = tokenize('Employee עובד handbook');
  assert.ok(mixed.includes('employee'));
  assert.ok(mixed.includes('עובד'));
  assert.ok(mixed.includes('handbook'));
});

// ---- 12 ----------------------------------------------------------------------
test('slugify produces URL-safe slugs (Hebrew kept)', () => {
  assert.equal(slugify('Employee Onboarding Guide'), 'employee-onboarding-guide');
  const s = slugify('מדריך קליטת עובד');
  assert.ok(s.length > 0);
  assert.ok(/^[\w\u05D0-\u05EA-]+$/.test(s));
});

// ---- 13 ----------------------------------------------------------------------
test('parseMarkdown handles headings, lists, code, links, wiki-links', () => {
  const md = [
    '# Heading 1',
    '## Heading 2',
    '',
    'Some **bold** and *italic* and `code` and [anchor](https://x) and [[Other Page]]',
    '',
    '- one',
    '- two',
    '',
    '1. first',
    '2. second',
    '',
    '```js',
    'const x = 1;',
    '```',
  ].join('\n');

  const ast = parseMarkdown(md);
  const kinds = ast.children.map(b => b.type);
  assert.ok(kinds.includes('heading'));
  assert.ok(kinds.includes('paragraph'));
  assert.ok(kinds.includes('list'));
  assert.ok(kinds.includes('codeblock'));

  // Two headings
  const headings = ast.children.filter(b => b.type === 'heading');
  assert.equal(headings.length, 2);
  assert.equal(headings[0].level, 1);
  assert.equal(headings[1].level, 2);

  // Two lists: one unordered, one ordered
  const lists = ast.children.filter(b => b.type === 'list');
  assert.equal(lists.length, 2);
  assert.equal(lists[0].ordered, false);
  assert.equal(lists[1].ordered, true);
  assert.equal(lists[0].items.length, 2);
  assert.equal(lists[1].items.length, 2);

  // Code block captured
  const code = ast.children.find(b => b.type === 'codeblock');
  assert.equal(code.lang, 'js');
  assert.equal(code.value, 'const x = 1;');

  // Inline parsing of the paragraph
  const para = ast.children.find(b => b.type === 'paragraph');
  const iKinds = para.children.map(c => c.type);
  assert.ok(iKinds.includes('strong'));
  assert.ok(iKinds.includes('em'));
  assert.ok(iKinds.includes('code'));
  assert.ok(iKinds.includes('link'));
  assert.ok(iKinds.includes('wikilink'));
});

// ---- 14 ----------------------------------------------------------------------
test('extractWikiLinks finds all [[...]] references', () => {
  const md = 'See [[Onboarding Guide]] and also [[Payroll 2026]] not [a](b) or `[[escaped]]`';
  const links = extractWikiLinks(md);
  assert.ok(links.includes('Onboarding Guide'));
  assert.ok(links.includes('Payroll 2026'));
  assert.ok(links.includes('escaped'));  // regex does not know about code spans
});

// ---- 15 ----------------------------------------------------------------------
test('search ranks TF-IDF and supports space/tag/author filters', () => {
  const w = makeWiki();
  w.createPage(basePage({
    slug: 'onb-1', title_en: 'Onboarding A',
    markdown: 'onboarding onboarding checklist for new hires',
    tags: ['hr'],
  }));
  w.createPage(basePage({
    slug: 'onb-2', title_en: 'Onboarding B',
    markdown: 'general checklist about tooling onboarding',
    tags: ['hr', 'dev'],
  }));
  w.createPage(basePage({
    slug: 'fin-1', title_en: 'Finance manual',
    markdown: 'vat report procedure for finance team',
    spaces: ['finance'],
    tags: ['finance'],
  }));

  const r = w.search('onboarding');
  assert.ok(r.length >= 2);
  // The first doc repeats "onboarding" so it should outrank the second
  assert.equal(r[0].slug, 'onb-1');

  const rFin = w.search('vat', { spaces: ['finance'] });
  assert.equal(rFin.length, 1);
  assert.equal(rFin[0].slug, 'fin-1');

  const rDev = w.search('onboarding', { tags: ['dev'] });
  assert.equal(rDev.length, 1);
  assert.equal(rDev[0].slug, 'onb-2');

  const rAuthor = w.search('checklist', { authors: ['y132-bot'] });
  assert.ok(rAuthor.length >= 2);
});

// ---- 16 ----------------------------------------------------------------------
test('search returns [] for empty or stopword-only queries', () => {
  const w = makeWiki();
  w.createPage(basePage());
  assert.deepEqual(w.search(''),       []);
  assert.deepEqual(w.search('the of'), []);
});

// ---- 17 ----------------------------------------------------------------------
test('Hebrew search matches across prefixes', () => {
  const w = makeWiki();
  w.createPage(basePage({
    slug: 'heb-1', title_en: 'Hebrew page',
    markdown: 'זה דף על עובד חדש בחברה',
  }));
  // User searches with a prefixed form
  const r = w.search('לעובד');
  assert.ok(r.length >= 1, 'prefix-normalised match succeeds');
  assert.equal(r[0].slug, 'heb-1');
});

// ---- 18 ----------------------------------------------------------------------
test('linkGraph returns forward + back links', () => {
  const w = makeWiki();
  const a = w.createPage(basePage({
    slug: 'page-a',
    title_en: 'Page A',
    markdown: 'see also [[Page B]] and [[Page C]]',
  }));
  const b = w.createPage(basePage({
    slug: 'page-b',
    title_en: 'Page B',
    markdown: 'back to [[Page A]]',
  }));

  const g = w.linkGraph(a.id);
  assert.equal(g.slug, 'page-a');
  const forwardSlugs = g.forward.map(f => f.slug);
  assert.ok(forwardSlugs.includes('page-b'));
  assert.ok(forwardSlugs.includes('page-c'));
  // Page B exists
  const fb = g.forward.find(f => f.slug === 'page-b');
  assert.equal(fb.exists, true);
  // Page C does NOT exist
  const fc = g.forward.find(f => f.slug === 'page-c');
  assert.equal(fc.exists, false);

  // Back-link from B
  assert.equal(g.back.length, 1);
  assert.equal(g.back[0].slug, 'page-b');
});

// ---- 19 ----------------------------------------------------------------------
test('broken_links detects dangling wiki references', () => {
  const w = makeWiki();
  w.createPage(basePage({
    slug: 'source',
    title_en: 'Source',
    markdown: 'link to [[Ghost Page]] that does not exist',
  }));
  const broken = w.broken_links();
  assert.ok(broken.length >= 1);
  const hit = broken.find(b => b.target === 'Ghost Page');
  assert.ok(hit);
  assert.equal(hit.targetSlug, 'ghost-page');
});

// ---- 20 ----------------------------------------------------------------------
test('archivePage flips status but never deletes data', () => {
  const w = makeWiki();
  const p = w.createPage(basePage());
  const archived = w.archivePage(p.id);
  assert.equal(archived.status, PAGE_STATUS.ARCHIVED);
  // Page still retrievable
  const fetched = w.getPage(p.id);
  assert.equal(fetched.status, PAGE_STATUS.ARCHIVED);
  assert.equal(fetched.versions.length, 1);
  // Archived pages excluded from active search
  w.createPage(basePage({ slug: 'other', title_en: 'Other', markdown: 'onboarding guide' }));
  const r = w.search('onboarding');
  assert.ok(r.every(x => x.pageId !== p.id));
});

// ---- 21 ----------------------------------------------------------------------
test('importMarkdown bulk-imports a list of pages', () => {
  const w = makeWiki();
  const r = w.importMarkdown([
    { title_he: 'מדריך 1', title_en: 'Guide 1', slug: 'g1', markdown: '# One', spaces: ['engineering'], author: 'y132-bot' },
    { title_he: 'מדריך 2', title_en: 'Guide 2', slug: 'g2', markdown: '# Two', spaces: ['engineering'], author: 'y132-bot' },
    { title_he: 'מדריך 3', title_en: 'Guide 3', slug: 'g3', markdown: '# Three', spaces: ['compliance'], author: 'y132-bot' },
  ]);
  assert.equal(r.imported_count, 3);
  assert.equal(r.pages.length, 3);
  // Defaults applied when meta used
  const single = w.importMarkdown('# Lone page', {
    title_he: 'לבד', title_en: 'Lonely',
    slug: 'lonely', spaces: ['hr'], author: 'y132-bot',
  });
  assert.equal(single.imported_count, 1);
  assert.equal(single.pages[0].slug, 'lonely');
});

// ---- 22 ----------------------------------------------------------------------
test('recentChanges returns append-only audit feed (newest first)', () => {
  const w = makeWiki();
  const p = w.createPage(basePage());
  w.updatePage(p.id, { markdown: 'updated', editor: 'e1', summary: 'first edit' });
  w.archivePage(p.id);
  const feed = w.recentChanges(10);
  assert.ok(feed.length >= 3);
  // Newest first
  assert.equal(feed[0].kind, 'archive');
  assert.equal(feed[1].kind, 'update');
  assert.equal(feed[2].kind, 'create');
});

// ---- 23 ----------------------------------------------------------------------
test('watchers append-only + delegation to Y-121', () => {
  const w = makeWiki();
  const p = w.createPage(basePage());
  w.watchers(p.id, { subscribe: 'alice' });
  w.watchers(p.id, { subscribe: 'bob' });
  w.watchers(p.id, { subscribe: 'alice' }); // idempotent
  let state = w.watchers(p.id);
  assert.deepEqual(state.active.sort(), ['alice', 'bob']);
  assert.equal(state.notifyBridge, 'Y-121 email-templates (delegated)');

  // unsubscribe is recorded but history kept
  w.watchers(p.id, { unsubscribe: 'alice' });
  state = w.watchers(p.id);
  assert.deepEqual(state.active, ['bob']);
  // History still contains alice's original subscribe entry (append-only)
  const aliceEntries = state.history.filter(h => h.user === 'alice');
  assert.ok(aliceEntries.length >= 2);
  assert.ok(aliceEntries.some(h => h.active === true));
  assert.ok(aliceEntries.some(h => h.active === false));
});

// ---- 24 ----------------------------------------------------------------------
test('tableOfContents returns headings grouped per page in space', () => {
  const w = makeWiki();
  w.createPage(basePage({
    slug: 'eng-a', title_en: 'Eng A',
    spaces: ['engineering'],
    markdown: '# Top\n## Sub 1\n### Sub 1.1\n## Sub 2',
  }));
  w.createPage(basePage({
    slug: 'eng-b', title_en: 'Eng B',
    spaces: ['engineering'],
    markdown: '# Only heading',
  }));
  const toc = w.tableOfContents('engineering');
  assert.equal(toc.space, 'engineering');
  assert.equal(toc.pages.length, 2);
  const a = toc.pages.find(p => p.slug === 'eng-a');
  assert.equal(a.headings.length, 4);
  assert.equal(a.headings[0].level, 1);
  assert.equal(a.headings[0].text, 'Top');
  assert.equal(a.headings[2].level, 3);
  assert.throws(() => w.tableOfContents('bogus'), /unknown space/);
});

// ---- 25 ----------------------------------------------------------------------
test('exportMarkdown returns current raw markdown', () => {
  const w = makeWiki();
  const p = w.createPage(basePage({ markdown: '# first' }));
  w.updatePage(p.id, { markdown: '# second', editor: 'e' });
  const out = w.exportMarkdown(p.id);
  assert.equal(out.markdown, '# second');
  assert.equal(out.version, 2);
  assert.equal(out.slug, 'onboarding-guide');
});

// ---- 26 ----------------------------------------------------------------------
test('stats reports totals across lifecycle', () => {
  const w = makeWiki();
  const p1 = w.createPage(basePage({ slug: 'a', title_en: 'A' }));
  const p2 = w.createPage(basePage({ slug: 'b', title_en: 'B' }));
  w.updatePage(p1.id, { markdown: 'new body', editor: 'e' });
  w.archivePage(p2.id);
  const s = w.stats();
  assert.equal(s.total,    2);
  assert.equal(s.active,   1);
  assert.equal(s.archived, 1);
  assert.equal(s.versions, 3);   // 2 + 1 update = 3 total version rows
  assert.ok(s.diffLog >= 1);
});
