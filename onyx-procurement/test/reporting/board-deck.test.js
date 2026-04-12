/**
 * Unit tests for BoardDeck — bilingual quarterly board deck generator.
 * Agent Y-187 — written 2026-04-11
 *
 * Run:
 *   node --test onyx-procurement/test/reporting/board-deck.test.js
 *
 * Coverage (17 tests):
 *    1.  exports surface — class + helpers
 *    2.  class construction + defaults
 *    3.  render returns a valid HTML document
 *    4.  render contains all 11 canonical slides
 *    5.  render emits mirror-pair pattern (he + en per slide)
 *    6.  Hebrew slide is dir="rtl" lang="he"
 *    7.  English slide is dir="ltr" lang="en"
 *    8.  Palantir dark palette appears in inline CSS
 *    9.  setExecutiveSummary bullets render in both languages
 *   10.  setFinancialHighlights metrics render as metric cards with deltas
 *   11.  setRisksMitigations renders severity classes
 *   12.  setPipelineBacklog renders a table with headers + rows
 *   13.  HTML escaping guards against <script> injection
 *   14.  loadAggregated accepts unknown keys into customSections
 *   15.  writeToFile persists a self-contained HTML file to disk
 *   16.  generateBoardDeck helper returns html for in-memory use
 *   17.  Confidential footer toggles off when configured
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  BoardDeck,
  generateBoardDeck,
  PALETTE,
  SLIDE_ORDER,
  DEFAULT_TITLES,
  _internals,
} = require('../../src/reporting/board-deck.js');

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'board-deck-'));

function sampleData() {
  return {
    company: 'טכנו-קול עוזי בע"מ',
    quarter: 'Q1 2026',
    fiscalYear: '2026',
    preparedBy: 'Kobi El-Roi',
    meetingDate: '2026-04-15',
    executiveSummary: {
      en: [
        'Revenue up 12% YoY driven by industrial segment',
        'Gross margin expanded 210 bps to 34.6%',
        'Cash runway extended to 18 months',
      ],
      he: [
        'הכנסות עלו ב-12% שנה-על-שנה בזכות מגזר התעשייה',
        'רווח גולמי התרחב ב-210 נ"ב ל-34.6%',
        'רזרבת מזומנים הוארכה ל-18 חודשים',
      ],
    },
    financialHighlights: {
      metricsEn: [
        { label: 'Revenue',   value: '₪ 48.2M', delta: '+12%', trend: 'up'   },
        { label: 'Gross Margin', value: '34.6%', delta: '+210bps', trend: 'up' },
        { label: 'EBITDA',    value: '₪ 6.4M',  delta: '-3%',  trend: 'down' },
        { label: 'Cash',      value: '₪ 22.1M', delta: 'flat', trend: 'flat' },
      ],
      metricsHe: [
        { label: 'הכנסות',   value: '₪ 48.2מ',  delta: '+12%',     trend: 'up' },
        { label: 'רווח גולמי', value: '34.6%',  delta: '+210נ"ב', trend: 'up' },
        { label: 'EBITDA',   value: '₪ 6.4מ',   delta: '-3%',     trend: 'down' },
        { label: 'מזומן',    value: '₪ 22.1מ',  delta: 'ללא שינוי', trend: 'flat' },
      ],
    },
    operatingMetrics: {
      metricsEn: [ { label: 'Orders Shipped', value: '2,140' } ],
      metricsHe: [ { label: 'הזמנות נשלחו',   value: '2,140' } ],
    },
    customerMetrics: {
      metricsEn: [ { label: 'NPS', value: '62', delta: '+4', trend: 'up' } ],
      metricsHe: [ { label: 'NPS', value: '62', delta: '+4', trend: 'up' } ],
    },
    safetyCompliance: {
      en: ['Zero lost-time incidents', 'ISO 9001 audit passed with 0 majors'],
      he: ['אפס תאונות עם ימי היעדרות', 'עבר ביקורת ISO 9001 ללא חריגות מהותיות'],
    },
    pipelineBacklog: {
      headersEn: ['Segment', 'Backlog (₪M)', 'Expected Q2'],
      headersHe: ['מגזר',   'צבר (₪מ)',     'צפי לרבעון 2'],
      rowsEn:    [['Industrial', 28.4, 14.1], ['Retail', 11.2, 6.3]],
      rowsHe:    [['תעשייה',    28.4, 14.1], ['קמעונאות', 11.2, 6.3]],
    },
    strategicInitiatives: {
      en: ['Launch new SKU line Q2', 'Open Haifa distribution center'],
      he: ['השקת קו מוצרים חדש ברבעון 2', 'פתיחת מרכז לוגיסטי בחיפה'],
    },
    risksMitigations: {
      items: [
        { severity: 'high', riskEn: 'FX exposure to USD',  riskHe: 'חשיפה מטבעית לדולר', mitigationEn: 'Hedge 60% rolling 6M', mitigationHe: 'גידור 60% מתגלגל 6 חודשים' },
        { severity: 'med',  riskEn: 'Key supplier concentration', riskHe: 'ריכוזיות ספק מרכזי', mitigationEn: 'Qualify 2nd source', mitigationHe: 'הסמכת ספק חלופי' },
        { severity: 'low',  riskEn: 'Cyber phishing',      riskHe: 'דיוג סייבר',          mitigationEn: 'Quarterly drills',  mitigationHe: 'תרגולים רבעוניים' },
      ],
    },
    asksForBoard: {
      en: ['Approve CapEx ₪ 4.5M', 'Approve ESOP refresh'],
      he: ['אישור השקעה הונית ₪ 4.5מ', 'אישור רענון תכנית אופציות'],
    },
  };
}

// ─────────────────────────────────────────────────────────────
// 1. Exports surface
// ─────────────────────────────────────────────────────────────
test('exports BoardDeck class and helper functions', () => {
  assert.equal(typeof BoardDeck, 'function');
  assert.equal(typeof generateBoardDeck, 'function');
  assert.equal(typeof PALETTE, 'object');
  assert.ok(Array.isArray(SLIDE_ORDER));
  assert.equal(SLIDE_ORDER.length, 11);
  assert.equal(typeof DEFAULT_TITLES, 'object');
  assert.equal(typeof _internals.escapeHtml, 'function');
});

// ─────────────────────────────────────────────────────────────
// 2. Class construction + defaults
// ─────────────────────────────────────────────────────────────
test('BoardDeck constructor captures options and sets defaults', () => {
  const deck = new BoardDeck({ company: 'Acme', quarter: 'Q2 2026' });
  assert.equal(deck.company, 'Acme');
  assert.equal(deck.quarter, 'Q2 2026');
  assert.equal(deck.confidential, true);
  const empty = new BoardDeck();
  assert.ok(empty.company.length > 0);
});

// ─────────────────────────────────────────────────────────────
// 3. render returns a valid HTML document
// ─────────────────────────────────────────────────────────────
test('render returns a valid HTML5 document', () => {
  const deck = new BoardDeck(sampleData());
  deck.loadAggregated(sampleData());
  const html = deck.render();
  assert.ok(html.startsWith('<!DOCTYPE html>'), 'should start with doctype');
  assert.ok(/<html[^>]+lang="en"/.test(html));
  assert.ok(/<head>/.test(html));
  assert.ok(/<body>/.test(html));
  assert.ok(/<\/html>/.test(html));
  assert.ok(/<style>/.test(html), 'must embed inline CSS');
});

// ─────────────────────────────────────────────────────────────
// 4. render contains all 11 canonical slide sections
// ─────────────────────────────────────────────────────────────
test('render contains all 11 canonical slides', () => {
  const deck = new BoardDeck(sampleData());
  deck.loadAggregated(sampleData());
  const html = deck.render();
  for (const key of SLIDE_ORDER) {
    assert.ok(
      html.includes(`data-slide="${key}"`),
      `slide ${key} should be present`
    );
    assert.ok(
      html.includes(`slide-${key}`),
      `css class slide-${key} should appear`
    );
  }
});

// ─────────────────────────────────────────────────────────────
// 5. Mirror-pair pattern: every slide has both EN and HE siblings
// ─────────────────────────────────────────────────────────────
test('every slide produces a mirror pair (he + en)', () => {
  const deck = new BoardDeck(sampleData());
  deck.loadAggregated(sampleData());
  const html = deck.render();
  // Count mirror-pair wrappers — should be at least SLIDE_ORDER.length
  const pairs = html.match(/class="slide-pair"/g) || [];
  assert.ok(pairs.length >= SLIDE_ORDER.length, `expected >= ${SLIDE_ORDER.length} pairs, got ${pairs.length}`);
  const enSlides = html.match(/class="slide slide-[a-zA-Z]+ slide-en"/g) || [];
  const heSlides = html.match(/class="slide slide-[a-zA-Z]+ slide-he"/g) || [];
  assert.equal(enSlides.length, heSlides.length, 'en / he slide counts must match');
  assert.ok(enSlides.length >= SLIDE_ORDER.length);
});

// ─────────────────────────────────────────────────────────────
// 6. Hebrew slides are dir="rtl" lang="he"
// ─────────────────────────────────────────────────────────────
test('Hebrew slides are marked dir="rtl" lang="he"', () => {
  const deck = new BoardDeck(sampleData());
  deck.loadAggregated(sampleData());
  const html = deck.render();
  const matches = html.match(/<section class="slide [^"]*slide-he"[^>]*dir="rtl"[^>]*lang="he"/g) || [];
  assert.ok(matches.length >= SLIDE_ORDER.length, `Hebrew RTL slides should exist; found ${matches.length}`);
});

// ─────────────────────────────────────────────────────────────
// 7. English slides are dir="ltr" lang="en"
// ─────────────────────────────────────────────────────────────
test('English slides are marked dir="ltr" lang="en"', () => {
  const deck = new BoardDeck(sampleData());
  deck.loadAggregated(sampleData());
  const html = deck.render();
  const matches = html.match(/<section class="slide [^"]*slide-en"[^>]*dir="ltr"[^>]*lang="en"/g) || [];
  assert.ok(matches.length >= SLIDE_ORDER.length, `English LTR slides should exist; found ${matches.length}`);
});

// ─────────────────────────────────────────────────────────────
// 8. Palantir dark palette is applied in inline CSS
// ─────────────────────────────────────────────────────────────
test('inline CSS uses the Palantir dark palette', () => {
  const deck = new BoardDeck(sampleData());
  const html = deck.render();
  assert.ok(html.includes(PALETTE.bg),    'bg color should be present');
  assert.ok(html.includes(PALETTE.panel), 'panel color should be present');
  assert.ok(html.includes(PALETTE.accent),'accent color should be present');
  // Explicit Palantir-dark hex values from the spec
  assert.ok(html.includes('#0b0d10'), '#0b0d10 bg hex literal');
  assert.ok(html.includes('#13171c'), '#13171c panel hex literal');
  assert.ok(html.includes('#4a9eff'), '#4a9eff accent hex literal');
});

// ─────────────────────────────────────────────────────────────
// 9. setExecutiveSummary renders bullets in both languages
// ─────────────────────────────────────────────────────────────
test('setExecutiveSummary renders bullets bilingually', () => {
  const deck = new BoardDeck({ company: 'Acme', quarter: 'Q1' });
  deck.setExecutiveSummary({
    en: ['Revenue up 12% YoY', 'Gross margin expanded'],
    he: ['הכנסות עלו ב-12% שנה על שנה', 'רווח גולמי התרחב'],
  });
  const html = deck.render();
  assert.ok(html.includes('Revenue up 12% YoY'));
  assert.ok(html.includes('Gross margin expanded'));
  assert.ok(html.includes('הכנסות עלו ב-12% שנה על שנה'));
  assert.ok(html.includes('רווח גולמי התרחב'));
});

// ─────────────────────────────────────────────────────────────
// 10. Financial metrics render as metric cards + deltas
// ─────────────────────────────────────────────────────────────
test('setFinancialHighlights renders metric cards with deltas', () => {
  const deck = new BoardDeck({ company: 'Acme', quarter: 'Q1' });
  deck.setFinancialHighlights({
    metricsEn: [
      { label: 'Revenue', value: '₪ 48.2M', delta: '+12%', trend: 'up' },
      { label: 'EBITDA',  value: '₪ 6.4M',  delta: '-3%',  trend: 'down' },
    ],
    metricsHe: [
      { label: 'הכנסות', value: '₪ 48.2מ', delta: '+12%', trend: 'up' },
      { label: 'EBITDA', value: '₪ 6.4מ',  delta: '-3%',  trend: 'down' },
    ],
  });
  const html = deck.render();
  assert.ok(html.includes('metric-card'));
  assert.ok(html.includes('metric-label'));
  assert.ok(html.includes('metric-value'));
  assert.ok(html.includes('delta up'));
  assert.ok(html.includes('delta down'));
  assert.ok(html.includes('₪ 48.2M'));
  assert.ok(html.includes('הכנסות'));
});

// ─────────────────────────────────────────────────────────────
// 11. Risks are severity-classed
// ─────────────────────────────────────────────────────────────
test('setRisksMitigations renders severity classes', () => {
  const deck = new BoardDeck({ company: 'Acme', quarter: 'Q1' });
  deck.setRisksMitigations({
    items: [
      { severity: 'high', riskEn: 'FX',     riskHe: 'מט"ח',    mitigationEn: 'Hedge', mitigationHe: 'גידור' },
      { severity: 'med',  riskEn: 'Supply', riskHe: 'שרשרת',   mitigationEn: '2nd',   mitigationHe: 'חלופי' },
      { severity: 'low',  riskEn: 'Cyber',  riskHe: 'סייבר',   mitigationEn: 'Drill', mitigationHe: 'תרגול' },
    ],
  });
  const html = deck.render();
  assert.ok(html.includes('risk-high'));
  assert.ok(html.includes('risk-med'));
  assert.ok(html.includes('risk-low'));
  assert.ok(html.includes('FX'));
  assert.ok(html.includes('מט"ח') || html.includes('מט&quot;ח'));
});

// ─────────────────────────────────────────────────────────────
// 12. Pipeline/backlog renders a table
// ─────────────────────────────────────────────────────────────
test('setPipelineBacklog renders a table with headers and rows', () => {
  const deck = new BoardDeck({ company: 'Acme', quarter: 'Q1' });
  deck.setPipelineBacklog({
    headersEn: ['Segment', 'Backlog'],
    headersHe: ['מגזר',   'צבר'],
    rowsEn:    [['Industrial', '28.4'], ['Retail', '11.2']],
    rowsHe:    [['תעשייה',    '28.4'], ['קמעונאות', '11.2']],
  });
  const html = deck.render();
  assert.ok(html.includes('<table class="board-table">'));
  assert.ok(html.includes('<th>Segment</th>'));
  assert.ok(html.includes('Industrial'));
  assert.ok(html.includes('<th>מגזר</th>'));
  assert.ok(html.includes('תעשייה'));
});

// ─────────────────────────────────────────────────────────────
// 13. HTML escaping blocks injection
// ─────────────────────────────────────────────────────────────
test('user content is HTML-escaped to prevent injection', () => {
  const deck = new BoardDeck({ company: '<Acme>', quarter: '"Q1"' });
  deck.setExecutiveSummary({
    en: ['<script>alert(1)</script>', 'a & b'],
    he: ["נקודה 'חשובה'"],
  });
  const html = deck.render();
  assert.ok(!html.includes('<script>alert(1)</script>'), 'script tag must be escaped');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('a &amp; b'));
  assert.ok(html.includes('&lt;Acme&gt;'));
  assert.ok(html.includes('&quot;Q1&quot;'));
});

// ─────────────────────────────────────────────────────────────
// 14. loadAggregated accepts unknown sections
// ─────────────────────────────────────────────────────────────
test('loadAggregated keeps unknown keys in customSections', () => {
  const deck = new BoardDeck();
  deck.loadAggregated({
    company: 'Acme',
    quarter: 'Q1',
    esgKpis: {
      titleEn: 'ESG KPIs',
      titleHe: 'מדדי ESG',
      bulletsEn: ['Scope 1 -8%'],
      bulletsHe: ['היקף 1 -8%'],
    },
  });
  assert.equal(deck.company, 'Acme');
  assert.equal(deck.customSections.length, 1);
  const html = deck.render();
  assert.ok(html.includes('ESG KPIs'));
  assert.ok(html.includes('מדדי ESG'));
  assert.ok(html.includes('Scope 1 -8%'));
  assert.ok(html.includes('היקף 1 -8%'));
});

// ─────────────────────────────────────────────────────────────
// 15. writeToFile persists a self-contained HTML file
// ─────────────────────────────────────────────────────────────
test('writeToFile persists a self-contained HTML file', () => {
  const deck = new BoardDeck(sampleData());
  deck.loadAggregated(sampleData());
  const target = path.join(TMP_DIR, 'board-q1-2026.html');
  const { path: outPath, size } = deck.writeToFile(target);
  assert.equal(outPath, path.resolve(target));
  assert.ok(fs.existsSync(outPath));
  assert.ok(size > 2000, `expected html > 2000 bytes, got ${size}`);
  const disk = fs.readFileSync(outPath, 'utf8');
  assert.ok(disk.startsWith('<!DOCTYPE html>'));
  // self-contained → no external css, no external js, no external images
  assert.ok(!/<link[^>]+rel="stylesheet"/.test(disk), 'no external stylesheet links');
  assert.ok(!/<script[^>]*src=/.test(disk), 'no external scripts');
  assert.ok(!/<img[^>]*src="http/.test(disk), 'no remote images');
});

// ─────────────────────────────────────────────────────────────
// 16. generateBoardDeck helper one-shot
// ─────────────────────────────────────────────────────────────
test('generateBoardDeck helper returns html for in-memory use', () => {
  const { html } = generateBoardDeck(sampleData());
  assert.equal(typeof html, 'string');
  assert.ok(html.includes('data-slide="title"'));
  assert.ok(html.includes('data-slide="asksForBoard"'));
  const target = path.join(TMP_DIR, 'helper.html');
  const disk = generateBoardDeck(sampleData(), target);
  assert.ok(fs.existsSync(disk.path));
});

// ─────────────────────────────────────────────────────────────
// 17. Confidential footer can be turned off
// ─────────────────────────────────────────────────────────────
test('confidential footer toggles when configured', () => {
  const open = new BoardDeck({ company: 'Acme', quarter: 'Q1', confidential: false });
  const openHtml = open.render();
  assert.ok(!openHtml.includes('CONFIDENTIAL'));
  const locked = new BoardDeck({ company: 'Acme', quarter: 'Q1' });
  const lockedHtml = locked.render();
  assert.ok(lockedHtml.includes('CONFIDENTIAL'));
  assert.ok(lockedHtml.includes('סודי'));
});
