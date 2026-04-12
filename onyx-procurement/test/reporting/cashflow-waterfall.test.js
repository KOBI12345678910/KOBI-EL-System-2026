/**
 * Unit tests for src/reporting/cashflow-waterfall.js
 * Agent Y-184 — 2026-04-11
 *
 * Run:
 *   node --test test/reporting/cashflow-waterfall.test.js
 *
 * Coverage targets:
 *   • build() produces ordered steps: opening → operating → investing →
 *     financing → closing
 *   • Indirect method expands net income → non-cash adjustments →
 *     working-capital changes → Israeli tax items
 *   • Direct method consumes operating[] line items
 *   • generateSVG() returns a valid SVG document with expected elements
 *     (<svg>, gradient defs, bar rects, bilingual labels, legend, palette
 *     colours, green/red/blue conditional fills)
 *   • formatNIS emits "₪" glyph and he-IL grouping
 *   • Never-delete contract: history() accumulates and is append-only
 *   • Israeli tax items (income_tax_payable, bituach_leumi, vat_payable)
 *     appear in steps with their Hebrew labels
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CashFlowWaterfall,
  PALETTE,
  STEP_KIND,
  LABELS,
  _internals,
} = require('../../src/reporting/cashflow-waterfall');

// ─── fixture builders ──────────────────────────────────────────

function indirectPeriod(overrides = {}) {
  return Object.assign({
    label: 'Q2 2026',
    opening_balance: 1_000_000,
    method: 'indirect',
    net_income: 250_000,
    adjustments: {
      depreciation: 80_000,
      amortization: 20_000,
      stock_compensation: 10_000,
      other_noncash: 0,
    },
    working_capital: {
      ar_change: -60_000,   // AR built up — use of cash
      inventory_change: -40_000,
      ap_change: 30_000,    // AP built up — source of cash
      prepaid_change: -5_000,
      accrued_change: 8_000,
    },
    israeli_tax: {
      income_tax_payable: -45_000, // tax paid
      bituach_leumi: -12_000,
      vat_payable: -18_000,
    },
    investing: [
      { label_en: 'CapEx Equipment', label_he: 'השקעות בציוד', amount: -150_000 },
      { label_en: 'Software', label_he: 'תוכנה', amount: -25_000 },
    ],
    financing: [
      { label_en: 'New Loan', label_he: 'הלוואה חדשה', amount: 200_000 },
      { label_en: 'Debt Repayment', label_he: 'החזר חוב', amount: -50_000 },
      { label_en: 'Dividends', label_he: 'דיבידנדים', amount: -80_000 },
    ],
  }, overrides);
}

function directPeriod(overrides = {}) {
  return Object.assign({
    label: 'Q2 2026 Direct',
    opening_balance: 500_000,
    method: 'direct',
    operating: [
      { label_en: 'Customer Receipts', label_he: 'תקבולי לקוחות', amount: 900_000 },
      { label_en: 'Supplier Payments', label_he: 'תשלומי ספקים', amount: -450_000 },
      { label_en: 'Payroll', label_he: 'שכר', amount: -200_000 },
      { label_en: 'VAT Payment / תשלום מע"מ', label_he: 'מע"מ', amount: -30_000 },
    ],
    investing: [
      { label_en: 'CapEx', label_he: 'הוצאות הוניות', amount: -100_000 },
    ],
    financing: [
      { label_en: 'Credit Line', label_he: 'מסגרת אשראי', amount: 50_000 },
    ],
  }, overrides);
}

// ─── 1. Construction + defaults ────────────────────────────────

test('CashFlowWaterfall: default construction uses indirect method and Palantir palette', () => {
  const wf = new CashFlowWaterfall();
  assert.equal(wf.method, 'indirect');
  assert.equal(wf.palette.background, '#0b0d10');
  assert.equal(wf.palette.surface, '#13171c');
  assert.equal(wf.palette.accent, '#4a9eff');
  assert.equal(wf.labels.opening.he, 'יתרת פתיחה');
  assert.equal(wf.labels.closing.en, 'Closing Balance');
});

// ─── 2. build() — indirect method ordered steps ───────────────

test('build(indirect): produces opening → operating → investing → financing → closing order', () => {
  const wf = new CashFlowWaterfall();
  const report = wf.build(indirectPeriod());
  const kinds = report.steps.map((s) => s.kind);
  assert.equal(kinds[0], STEP_KIND.OPENING, 'first step is opening');
  assert.equal(kinds[kinds.length - 1], STEP_KIND.CLOSING, 'last step is closing');

  // Check section order
  const sections = report.steps.map((s) => s.section);
  // opening then all operating (including subtotal) then investing then financing then closing
  const firstOp = sections.indexOf('operating');
  const firstInv = sections.indexOf('investing');
  const firstFin = sections.indexOf('financing');
  assert.ok(firstOp > 0 && firstOp < firstInv, 'operating comes before investing');
  assert.ok(firstInv < firstFin, 'investing comes before financing');
});

// ─── 3. Opening/closing balance arithmetic ────────────────────

test('build(indirect): closing balance equals opening + net change', () => {
  const wf = new CashFlowWaterfall();
  const period = indirectPeriod();
  const report = wf.build(period);
  const expectedNet = 250000 + 80000 + 20000 + 10000 + 0
    + (-60000) + (-40000) + 30000 + (-5000) + 8000
    + (-45000) + (-12000) + (-18000)
    + (-150000) + (-25000)
    + 200000 + (-50000) + (-80000);
  assert.equal(report.opening_balance, 1_000_000);
  assert.equal(report.closing_balance, 1_000_000 + expectedNet);
  assert.equal(report.totals.net_change, expectedNet);
});

// ─── 4. Indirect-method non-cash adjustments present ──────────

test('build(indirect): includes non-cash adjustments (depreciation / amortization) as steps', () => {
  const wf = new CashFlowWaterfall();
  const report = wf.build(indirectPeriod());
  const adjKeys = report.steps.filter((s) => s.kind === STEP_KIND.ADJUSTMENT).map((s) => s.key);
  assert.ok(adjKeys.includes('adj_depreciation'));
  assert.ok(adjKeys.includes('adj_amortization'));
  assert.ok(adjKeys.includes('adj_stock_compensation'));
  // other_noncash=0 should be skipped
  assert.ok(!adjKeys.includes('adj_other_noncash'));
});

// ─── 5. Working-capital changes ───────────────────────────────

test('build(indirect): expands working-capital changes with signs', () => {
  const wf = new CashFlowWaterfall();
  const report = wf.build(indirectPeriod());
  const wcSteps = report.steps.filter((s) => s.kind === STEP_KIND.WORKING_CAPITAL);
  const byKey = Object.fromEntries(wcSteps.map((s) => [s.key, s]));
  assert.equal(byKey.wc_ar_change.amount, -60000);
  assert.equal(byKey.wc_inventory_change.amount, -40000);
  assert.equal(byKey.wc_ap_change.amount, 30000);
  assert.equal(byKey.wc_ar_change.delta_direction, 'down');
  assert.equal(byKey.wc_ap_change.delta_direction, 'up');
});

// ─── 6. Israeli tax items ─────────────────────────────────────

test('build(indirect): includes Israeli tax items with bilingual labels', () => {
  const wf = new CashFlowWaterfall();
  const report = wf.build(indirectPeriod());
  const taxSteps = report.steps.filter((s) => s.kind === STEP_KIND.ISRAELI_TAX);
  assert.equal(taxSteps.length, 3);
  const keys = taxSteps.map((s) => s.key);
  assert.ok(keys.includes('tax_income_tax_payable'));
  assert.ok(keys.includes('tax_bituach_leumi'));
  assert.ok(keys.includes('tax_vat_payable'));
  // Hebrew labels
  const incomeTax = taxSteps.find((s) => s.key === 'tax_income_tax_payable');
  assert.equal(incomeTax.label_he, 'מס הכנסה לשלם');
  const bl = taxSteps.find((s) => s.key === 'tax_bituach_leumi');
  assert.equal(bl.label_he, 'ביטוח לאומי');
  const vat = taxSteps.find((s) => s.key === 'tax_vat_payable');
  assert.equal(vat.label_he, 'מע״מ לשלם');
});

// ─── 7. Subtotals match section sums ──────────────────────────

test('build(indirect): subtotal steps reflect per-section totals', () => {
  const wf = new CashFlowWaterfall();
  const report = wf.build(indirectPeriod());
  const subOp = report.steps.find((s) => s.key === 'subtotal_operating');
  const subInv = report.steps.find((s) => s.key === 'subtotal_investing');
  const subFin = report.steps.find((s) => s.key === 'subtotal_financing');
  assert.ok(subOp && subInv && subFin, 'all 3 subtotals present');
  assert.equal(subOp.amount, report.totals.operating);
  assert.equal(subInv.amount, report.totals.investing);
  assert.equal(subFin.amount, report.totals.financing);
  // Investing subtotal must be negative (all CapEx)
  assert.ok(subInv.amount < 0);
});

// ─── 8. Direct method ─────────────────────────────────────────

test('build(direct): consumes operating[] line items', () => {
  const wf = new CashFlowWaterfall({ method: 'direct' });
  const report = wf.build(directPeriod());
  const opSteps = report.steps.filter((s) => s.kind === STEP_KIND.OPERATING);
  assert.equal(opSteps.length, 4);
  // Positive receipts
  assert.equal(opSteps[0].amount, 900000);
  assert.equal(opSteps[0].delta_direction, 'up');
  // Negative payroll
  const payroll = opSteps.find((s) => s.label_en === 'Payroll');
  assert.ok(payroll);
  assert.equal(payroll.amount, -200000);
  assert.equal(payroll.delta_direction, 'down');
});

// ─── 9. Running balance monotone on known input ──────────────

test('build: running_before/running_after chain is consistent', () => {
  const wf = new CashFlowWaterfall();
  const report = wf.build(indirectPeriod());
  // Every non-subtotal delta step: running_after == running_before + amount
  for (const s of report.steps) {
    if (s.kind === STEP_KIND.OPENING || s.kind === STEP_KIND.CLOSING || s.kind === STEP_KIND.SUBTOTAL) continue;
    const rb = s.running_before;
    const ra = s.running_after;
    assert.equal(Math.round((rb + s.amount) * 100), Math.round(ra * 100), `step ${s.key}: ${rb}+${s.amount} !== ${ra}`);
  }
});

// ─── 10. generateSVG — produces a valid SVG document ─────────

test('generateSVG: returns valid self-contained SVG string', () => {
  const wf = new CashFlowWaterfall();
  const report = wf.build(indirectPeriod());
  const svg = wf.generateSVG(report);
  assert.equal(typeof svg, 'string');
  assert.ok(svg.startsWith('<?xml'), 'starts with XML declaration');
  assert.ok(svg.includes('<svg '), 'contains <svg> root');
  assert.ok(svg.includes('</svg>'), 'properly closed');
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'));
  // No external references
  assert.ok(!svg.includes('<link'));
  assert.ok(!svg.includes('<script'));
});

// ─── 11. SVG contains Palantir palette colors ────────────────

test('generateSVG: uses Palantir dark palette (#0b0d10, #13171c, #4a9eff)', () => {
  const wf = new CashFlowWaterfall();
  const svg = wf.generateSVG(wf.build(indirectPeriod()));
  assert.ok(svg.includes('#0b0d10'), 'background color present');
  assert.ok(svg.includes('#13171c'), 'surface color present');
  assert.ok(svg.includes('#4a9eff'), 'accent color present');
});

// ─── 12. SVG contains green-positive and red-negative fills ──

test('generateSVG: contains green positive (#4ade80) and red negative (#f87171) fills', () => {
  const wf = new CashFlowWaterfall();
  const svg = wf.generateSVG(wf.build(indirectPeriod()));
  assert.ok(svg.includes('#4ade80'), 'positive green present');
  assert.ok(svg.includes('#f87171'), 'negative red present');
  // Both gradients defined
  assert.ok(svg.includes('id="bar-pos"'));
  assert.ok(svg.includes('id="bar-neg"'));
  assert.ok(svg.includes('id="bar-bal"'));
});

// ─── 13. SVG contains bilingual title + tax labels ────────────

test('generateSVG: bilingual title + Hebrew Israeli-tax labels appear', () => {
  const wf = new CashFlowWaterfall();
  const svg = wf.generateSVG(wf.build(indirectPeriod()));
  assert.ok(svg.includes('תזרים מזומנים מדורג'), 'Hebrew title present');
  assert.ok(svg.includes('Cash Flow Waterfall'), 'English title present');
  assert.ok(svg.includes('מס הכנסה'), 'Hebrew income-tax label present');
  assert.ok(svg.includes('ביטוח לאומי'), 'Bituach Leumi label present');
  assert.ok(svg.includes('מע'), 'VAT Hebrew label present');
  assert.ok(svg.includes('יתרת פתיחה'), 'Hebrew opening label present');
  assert.ok(svg.includes('יתרת סגירה'), 'Hebrew closing label present');
});

// ─── 14. SVG contains expected rect elements (bars) ──────────

test('generateSVG: contains one <rect class="wf-bar"> per step', () => {
  const wf = new CashFlowWaterfall();
  const report = wf.build(indirectPeriod());
  const svg = wf.generateSVG(report);
  const barMatches = svg.match(/class="wf-bar/g) || [];
  assert.equal(barMatches.length, report.steps.length);
});

// ─── 15. Legend present ──────────────────────────────────────

test('generateSVG: legend contains positive/negative/balance swatches', () => {
  const wf = new CashFlowWaterfall();
  const svg = wf.generateSVG(wf.build(indirectPeriod()));
  assert.ok(svg.includes('wf-legend-swatch'));
  assert.ok(svg.includes('חיובי'));
  assert.ok(svg.includes('Positive'));
  assert.ok(svg.includes('שלילי'));
  assert.ok(svg.includes('Negative'));
});

// ─── 16. formatNIS + formatNISCompact ────────────────────────

test('formatNIS: emits ₪ glyph and he-IL grouping', () => {
  const { formatNIS, formatNISCompact } = _internals;
  const s = formatNIS(1234567.89);
  assert.ok(s.includes('₪'));
  assert.ok(s.includes('1,234,567'));
  assert.equal(formatNIS(0), '₪ 0.00');
  assert.equal(formatNIS(-50).startsWith('-₪'), true);
  assert.equal(formatNISCompact(2_500_000), '₪ 2.50M');
  assert.equal(formatNISCompact(5500), '₪ 5.5K');
});

// ─── 17. Never-delete: history is append-only ────────────────

test('history(): append-only — multiple builds accumulate, no delete API', () => {
  const wf = new CashFlowWaterfall();
  wf.build(indirectPeriod());
  wf.build(indirectPeriod({ opening_balance: 2_000_000 }));
  wf.build(directPeriod());
  assert.equal(wf.history().length, 3);
  assert.equal(typeof wf.delete, 'undefined');
  assert.equal(typeof wf.clear, 'undefined');
  assert.equal(typeof wf.reset, 'undefined');
});

// ─── 18. Invalid inputs throw ─────────────────────────────────

test('build: throws on non-object period', () => {
  const wf = new CashFlowWaterfall();
  assert.throws(() => wf.build(null), TypeError);
  assert.throws(() => wf.build('not-a-period'), TypeError);
  assert.throws(() => wf.build(42), TypeError);
});

test('generateSVG: throws on invalid report', () => {
  const wf = new CashFlowWaterfall();
  assert.throws(() => wf.generateSVG(null), TypeError);
  assert.throws(() => wf.generateSVG({ steps: 'nope' }), TypeError);
});

// ─── 19. Empty period still builds sane output ───────────────

test('build: minimal period (opening only) still produces opening + 3 subtotals + closing', () => {
  const wf = new CashFlowWaterfall();
  const report = wf.build({ opening_balance: 100_000 });
  assert.equal(report.opening_balance, 100_000);
  assert.equal(report.closing_balance, 100_000);
  assert.equal(report.totals.net_change, 0);
  const kinds = report.steps.map((s) => s.kind);
  assert.equal(kinds[0], STEP_KIND.OPENING);
  assert.equal(kinds[kinds.length - 1], STEP_KIND.CLOSING);
  // 3 subtotals always inserted
  const subs = report.steps.filter((s) => s.kind === STEP_KIND.SUBTOTAL);
  assert.equal(subs.length, 3);
});

// ─── 20. XML escaping ─────────────────────────────────────────

test('generateSVG: escapes XML special characters in labels', () => {
  const wf = new CashFlowWaterfall();
  const report = wf.build({
    opening_balance: 1000,
    method: 'direct',
    operating: [
      { label_en: 'A&B <test>', label_he: '"פנים"', amount: 500 },
    ],
  });
  const svg = wf.generateSVG(report);
  assert.ok(svg.includes('A&amp;B &lt;test&gt;'));
  assert.ok(svg.includes('&quot;פנים&quot;'));
  // No raw & followed by non-escape (must not emit `A&B`)
  assert.ok(!/A&B /.test(svg));
});

// ─── 21. buildAndRender shortcut ─────────────────────────────

test('buildAndRender: one-shot build→SVG returns SVG', () => {
  const wf = new CashFlowWaterfall();
  const svg = wf.buildAndRender(indirectPeriod());
  assert.ok(svg.startsWith('<?xml'));
  assert.ok(svg.includes('<svg'));
  assert.ok(svg.includes('יתרת פתיחה'));
});

// ─── 22. Determinism ──────────────────────────────────────────

test('build: is deterministic — same input yields identical output', () => {
  const wf1 = new CashFlowWaterfall();
  const wf2 = new CashFlowWaterfall();
  const r1 = wf1.build(indirectPeriod());
  const r2 = wf2.build(indirectPeriod());
  // Strip mutable fields before comparing (none in this module)
  assert.deepEqual(r1.steps, r2.steps);
  assert.deepEqual(r1.totals, r2.totals);
});

// ─── 23. Direct method also includes Israeli tax via operating[] ─

test('build(direct): operating items passed through preserve their labels', () => {
  const wf = new CashFlowWaterfall({ method: 'direct' });
  const report = wf.build(directPeriod());
  const vatStep = report.steps.find((s) => s.label_en && s.label_en.includes('VAT'));
  assert.ok(vatStep);
  assert.equal(vatStep.amount, -30000);
});

// ─── 24. Custom palette override ─────────────────────────────

test('constructor: custom palette override is applied', () => {
  const wf = new CashFlowWaterfall({
    palette: { background: '#000000', accent: '#ff00ff' },
  });
  const svg = wf.generateSVG(wf.build(indirectPeriod()));
  assert.ok(svg.includes('#000000'));
  assert.ok(svg.includes('#ff00ff'));
  // Originals still available for non-overridden keys
  assert.equal(wf.palette.positive, '#4ade80');
});

// ─── 25. SVG has exactly one <svg> root and well-formed viewBox ─

test('generateSVG: single <svg> root with viewBox', () => {
  const wf = new CashFlowWaterfall({ width: 1200, height: 640 });
  const svg = wf.generateSVG(wf.build(indirectPeriod()));
  const svgOpens = (svg.match(/<svg /g) || []).length;
  const svgCloses = (svg.match(/<\/svg>/g) || []).length;
  assert.equal(svgOpens, 1);
  assert.equal(svgCloses, 1);
  assert.ok(svg.includes('viewBox="0 0 1200 640"'));
});
