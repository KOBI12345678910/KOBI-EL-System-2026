/**
 * Tests for Voice of Customer (VOC)  —  onyx-procurement/src/customer/voc.js
 * -------------------------------------------------------------
 * Agent Y-101 QA — zero-dep, plain node:test runner.
 *
 *   npm test            (or)
 *   node --test test/customer/voc.test.js
 *
 * Covers:
 *   - categorization across all canonical buckets (He+En)
 *   - theme clustering on overlapping feature tokens
 *   - customer-weight voting & prioritization
 *   - close-loop tracking (append-only)
 *   - competitor extraction (Hebrew + English brands)
 *   - append-only revision log (never delete, only upgrade)
 *   - bilingual product brief generation
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { VOC } = require(path.join('..', '..', 'src', 'customer', 'voc.js'));

// ---------------------------------------------------------------
// categorization
// ---------------------------------------------------------------
test('VOC.categorize — classifies Hebrew bug ticket as "bug"', () => {
  const voc = new VOC();
  const it = voc.captureItem({
    source: 'ticket',
    customerId: 'C-1',
    content: 'המערכת קרסה, הדוח שבור, תקלה חמורה'
  });
  const categorized = voc.categorize({ item: it });
  assert.equal(categorized.category, 'bug');
});

test('VOC.categorize — classifies English feature request', () => {
  const voc = new VOC();
  const it = voc.captureItem({
    source: 'survey',
    customerId: 'C-2',
    content: 'Please add a dark mode, I would love this feature request'
  });
  voc.categorize({ item: it });
  assert.equal(it.category, 'feature-request');
});

test('VOC.categorize — Hebrew compliment bucketed', () => {
  const voc = new VOC();
  const it = voc.captureItem({
    source: 'review',
    customerId: 'C-3',
    content: 'תודה! מעולה, שירות מדהים, ממליץ בחום'
  });
  voc.categorize({ item: it });
  assert.equal(it.category, 'compliment');
  assert.equal(it.sentiment, 'positive');
});

test('VOC.categorize — pricing complaint in Hebrew', () => {
  const voc = new VOC();
  const it = voc.captureItem({
    source: 'email',
    customerId: 'C-4',
    content: 'המחיר יקר מדי, המנוי החודשי גבוה מדי'
  });
  voc.categorize({ item: it });
  assert.equal(it.category, 'pricing');
});

test('VOC.categorize — support complaint in English', () => {
  const voc = new VOC();
  const it = voc.captureItem({
    source: 'call-transcript',
    customerId: 'C-5',
    content: 'Your support agent never answered my chat ticket'
  });
  voc.categorize({ item: it });
  assert.equal(it.category, 'support');
});

test('VOC.categorize — categories list can be restricted', () => {
  const voc = new VOC();
  const it = voc.captureItem({
    source: 'survey', customerId: 'C-6',
    content: 'נהדר, המוצר עובד מצוין'
  });
  voc.categorize({ item: it, categories: ['compliment', 'bug'] });
  assert.equal(it.category, 'compliment');
});

// ---------------------------------------------------------------
// theme clustering
// ---------------------------------------------------------------
test('VOC.themeExtraction — clusters items with overlapping terms', () => {
  const voc = new VOC();
  const items = [
    voc.captureItem({ source: 'survey',  customerId: 'C-1',
      content: 'The export to excel is slow and broken on large reports' }),
    voc.captureItem({ source: 'ticket',  customerId: 'C-2',
      content: 'Excel export keeps crashing on large reports, very slow' }),
    voc.captureItem({ source: 'email',   customerId: 'C-3',
      content: 'Large report export to excel is broken, please fix' }),
    voc.captureItem({ source: 'review',  customerId: 'C-9',
      content: 'Beautiful UI, really nice onboarding screens and clean design' })
  ];
  items.forEach(it => voc.categorize({ item: it }));
  const themes = voc.themeExtraction();
  // we expect at least one theme grouping the three "excel export" voices
  const exportTheme = themes.find(t =>
    (t.label || '').toLowerCase().includes('export') ||
    (t.label || '').toLowerCase().includes('excel')
  );
  assert.ok(exportTheme, 'expected an export/excel theme');
  assert.ok(exportTheme.items.length >= 3, 'theme should contain 3 items');
});

test('VOC.themeExtraction — Hebrew clustering on shared vocabulary', () => {
  const voc = new VOC();
  voc.captureItem({ source: 'ticket', customerId: 'C-10',
    content: 'אפליקציית המובייל קורסת בעת הכניסה למסך הדוחות' });
  voc.captureItem({ source: 'ticket', customerId: 'C-11',
    content: 'המובייל קורס כשאני פותח דוחות חודשיים' });
  voc.captureItem({ source: 'survey', customerId: 'C-12',
    content: 'דוחות במובייל קורסים' });
  const themes = voc.themeExtraction();
  assert.ok(themes.length >= 1);
  // find the mobile theme
  const mob = themes.find(t => Object.keys(t.centroid || {}).some(k => k.includes('מובייל') || k.includes('דוחות')));
  assert.ok(mob, 'expected a mobile/reports theme');
  assert.ok(mob.items.length >= 2);
});

// ---------------------------------------------------------------
// voting weight & prioritization
// ---------------------------------------------------------------
test('VOC.voteOnTheme — stacks customer weights and prioritizes correctly', () => {
  const voc = new VOC();
  // theme A — 2 items, big customer weight
  voc.captureItem({ source: 'survey', customerId: 'C-A1',
    content: 'dark mode please, feature request for dark theme dark dark' });
  voc.captureItem({ source: 'survey', customerId: 'C-A2',
    content: 'please add a dark theme feature, dark mode missing' });
  // theme B — 3 items, small customer weight
  voc.captureItem({ source: 'ticket', customerId: 'C-B1',
    content: 'csv import fails with arabic characters error broken' });
  voc.captureItem({ source: 'ticket', customerId: 'C-B2',
    content: 'csv import error broken for arabic charset' });
  voc.captureItem({ source: 'ticket', customerId: 'C-B3',
    content: 'csv arabic import broken error' });
  const themes = voc.themeExtraction();
  const darkTheme = themes.find(t => (t.label || '').includes('dark'));
  const csvTheme  = themes.find(t => (t.label || '').includes('csv') || (t.label || '').includes('arabic'));
  assert.ok(darkTheme); assert.ok(csvTheme);

  // big enterprise customer weights the dark theme heavily
  voc.voteOnTheme({ themeId: darkTheme.id, customerId: 'C-BIG', weight: 100000 });
  voc.voteOnTheme({ themeId: darkTheme.id, customerId: 'C-MID', weight: 50000 });
  voc.voteOnTheme({ themeId: csvTheme.id,  customerId: 'C-SMALL', weight: 500 });

  const byCount = voc.prioritizeThemes({ metric: 'count' });
  // csv has more items
  assert.equal(byCount[0].id, csvTheme.id);

  const byRevenue = voc.prioritizeThemes({ metric: 'revenue-weighted' });
  // dark has larger weight
  assert.equal(byRevenue[0].id, darkTheme.id);
  assert.equal(darkTheme.weightTotal, 150000);
});

test('VOC.voteOnTheme — rejects invalid inputs', () => {
  const voc = new VOC();
  voc.captureItem({ source: 'survey', customerId: 'C-1', content: 'dark mode feature please' });
  const [theme] = voc.themeExtraction();
  assert.throws(() => voc.voteOnTheme({ themeId: 'missing', customerId: 'X', weight: 1 }));
  assert.throws(() => voc.voteOnTheme({ themeId: theme.id, weight: 1 }));
  assert.throws(() => voc.voteOnTheme({ themeId: theme.id, customerId: 'X', weight: -5 }));
});

// ---------------------------------------------------------------
// close-loop tracking
// ---------------------------------------------------------------
test('VOC.closeLoop — records communication and never deletes history', () => {
  const voc = new VOC();
  voc.captureItem({ source: 'email', customerId: 'C-100',
    content: 'dark mode is missing, feature request please add' });
  voc.captureItem({ source: 'email', customerId: 'C-101',
    content: 'dark theme request please add it' });
  const [theme] = voc.themeExtraction();

  voc.linkToRoadmap({ themeId: theme.id, roadmapItemId: 'ROAD-42' });
  assert.equal(theme.roadmapItemId, 'ROAD-42');
  assert.equal(theme.status, 'linked');

  const closed = voc.closeLoop({
    themeId: theme.id,
    customerIds: ['C-100', 'C-101'],
    updateText: 'Dark mode shipped in release 2026.05'
  });
  assert.equal(closed.customerIds.length, 2);
  assert.equal(theme.status, 'closed-loop');
  assert.equal(theme.closeLoop.length, 1);

  // re-link to a different roadmap item — the old id is preserved in history
  voc.linkToRoadmap({ themeId: theme.id, roadmapItemId: 'ROAD-99' });
  const links = voc.roadmapLinks.filter(l => l.themeId === theme.id);
  assert.equal(links.length, 2);
  assert.equal(links[1].previous, 'ROAD-42');
});

// ---------------------------------------------------------------
// competitor extraction
// ---------------------------------------------------------------
test('VOC.competitorMentions — extracts both Hebrew and English brand names', () => {
  const voc = new VOC();
  voc.captureItem({ source: 'meeting-note', customerId: 'C-X',
    content: 'הלקוח משווה אותנו לפריוריטי ולרווחית, אבל גם מזכיר את SAP' });
  voc.captureItem({ source: 'email', customerId: 'C-Y',
    content: 'We are evaluating Salesforce vs your product' });
  voc.captureItem({ source: 'survey', customerId: 'C-Z',
    content: 'I love your interface, much better than Hubspot' });
  const mentions = voc.competitorMentions();
  const names = mentions.map(m => m.competitor);
  assert.ok(names.includes('salesforce'));
  assert.ok(names.includes('hubspot'));
  assert.ok(names.includes('sap') || names.includes('פריוריטי') || names.includes('ריווחית'));
});

test('VOC.addCompetitor — growing list, never deleting', () => {
  const voc = new VOC();
  const listBefore = voc.addCompetitor('AcmeSoft');
  assert.ok(listBefore.includes('acmesoft'));
  voc.captureItem({ source: 'social', customerId: 'C-1',
    content: 'AcmeSoft is 30% cheaper than you' });
  const ms = voc.competitorMentions();
  assert.ok(ms.find(m => m.competitor === 'acmesoft'));
});

// ---------------------------------------------------------------
// voice share + feature-request tracker
// ---------------------------------------------------------------
test('VOC.voiceShare — distribution sums to total', () => {
  const voc = new VOC();
  voc.categorize({ item: voc.captureItem({ source: 'email', customerId: 'A', content: 'bug broken crash' }) });
  voc.categorize({ item: voc.captureItem({ source: 'email', customerId: 'A', content: 'יקר מדי המחיר' }) });
  voc.categorize({ item: voc.captureItem({ source: 'email', customerId: 'B', content: 'great, love it, thanks' }) });
  const vs = voc.voiceShare({});
  assert.equal(vs.total, 3);
  const sumShares = Object.values(vs.share).reduce((a, b) => a + b.share, 0);
  assert.ok(Math.abs(sumShares - 1) < 0.05);
});

test('VOC.featureRequestTracker — returns only feature requests for a customer', () => {
  const voc = new VOC();
  const it1 = voc.captureItem({ source: 'survey', customerId: 'CX',
    content: 'feature request: please add multi-currency' });
  voc.categorize({ item: it1 });
  const it2 = voc.captureItem({ source: 'ticket', customerId: 'CX',
    content: 'bug: app crashed' });
  voc.categorize({ item: it2 });
  const list = voc.featureRequestTracker({ customerId: 'CX' });
  assert.equal(list.length, 1);
  assert.equal(list[0].id, it1.id);
});

// ---------------------------------------------------------------
// bilingual product brief
// ---------------------------------------------------------------
test('VOC.generateProductBrief — produces bilingual brief', () => {
  const voc = new VOC();
  voc.captureItem({ source: 'survey', customerId: 'C-1',
    content: 'dark mode is missing, feature request' });
  voc.captureItem({ source: 'survey', customerId: 'C-2',
    content: 'dark theme please add feature request' });
  voc.captureItem({ source: 'survey', customerId: 'C-3',
    content: 'feature request: dark theme mode' });
  const [theme] = voc.themeExtraction();
  voc.voteOnTheme({ themeId: theme.id, customerId: 'C-BIG', weight: 9000 });
  voc.prioritizeThemes({ metric: 'strategic-fit' });
  const brief = voc.generateProductBrief(theme.id);
  assert.ok(brief.title.en && brief.title.he);
  assert.ok(brief.summary.en.length > 0);
  assert.ok(brief.summary.he.length > 0);
  assert.ok(brief.supportingItems >= 3);
  assert.ok(brief.votesTotal >= 9000);
});

// ---------------------------------------------------------------
// append-only contract
// ---------------------------------------------------------------
test('VOC — category revision history is preserved, nothing is deleted', () => {
  const voc = new VOC();
  const it = voc.captureItem({ source: 'survey', customerId: 'C-1',
    content: 'bug broken crash' });
  voc.categorize({ item: it });
  const firstCat = it.category;
  // force a re-categorize into a different restricted set
  voc.categorize({ item: it, categories: ['compliment'] });
  // revision history should contain the previous category
  const rev = it.revisions.find(r => r.field === 'category');
  assert.ok(rev, 'revision log should track category change');
  assert.equal(rev.from, firstCat);
});
