/**
 * form-6111.test.js — tests for טופס 6111 annual adjusted financial statements.
 * Agent Y-002 / Techno-Kol Uzi Mega-ERP — Wave 2026
 *
 * Scope:
 *   • COA → 6111 row mapping (prefix, name hint, type fallback, ultimate fallback)
 *   • Trial-balance aggregation (sign convention, section totals)
 *   • Adjustment rules boundary cases
 *       - entertainment 80% / 20%
 *       - donations above 30% cap
 *       - depreciation book vs tax diff
 *       - FX §9 unrealised capital diff
 *       - accrual-to-cash delta
 *       - vehicle non-deductible share
 *       - fines (always non-deductible)
 *   • Taxable income + 23% corporate tax boundary cases
 *       - profit → positive tax
 *       - loss → zero tax + loss carried
 *       - exactly zero
 *   • Advances / credits / withholding netting against tax
 *   • XML validity + bilingual labels
 *   • JSON round-trip
 *   • PDF degradation path (no pdfkit available)
 *   • Rule: "לא מוחקים רק משדרגים ומגדלים" — input data not mutated
 */

'use strict';

const assert = require('node:assert/strict');
const test   = require('node:test');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');

const form6111 = require('../../src/tax/form-6111');

const {
  generate6111,
  mapCOAToForm6111,
  applyAdjustments,
  computeCorporateTax,
  aggregateTrialBalance,
  renderJson,
  renderXml,
  renderPdf,
  COA_MAP,
  SECTION_CODES,
  ADJ_RULES,
  CONSTANTS_2026,
  TYPE_FALLBACK,
  createEngine,
  _internals,
} = form6111;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COMPANY = Object.freeze({
  company_id:      '514000000',
  legal_name:      'טכנו קול עוזי בע"מ',
  tax_file_number: '940123456',
  fiscal_year:     2026,
});

/**
 * A small but realistic trial balance.
 *
 *   Revenues      1,000,000 Cr
 *   COGS            600,000 Dr   → gross profit    400,000
 *   OPEX            185,000 Dr   → operating profit 215,000
 *   Financial exp   15,000 Dr
 *   Financial inc    5,000 Cr    → financial net   -10,000
 *   Book profit                  =                  205,000
 *
 *   Assets (net, incl. acc depn)    =   885,000
 *     Current       455,000   (cash 250+205 profit-closed to cash, AR 150, inv 80)
 *     wait — keep it simple: we bump cash by 205 so that assets == L+E after
 *     closing the profit into equity. This keeps the BS internally consistent
 *     without having to re-post journal entries in the fixture.
 *
 *   Liabilities                     =   380,000
 *   Equity   (incl. closed profit)  =   505,000   → 300 before + 205 closed
 *   Total L + E                     =   885,000   ✓
 *
 * Debit-credit convention: asset/expense accounts carry debit balances,
 * revenue/liability/equity accounts carry credit balances.
 */
function baseTrialBalance() {
  return [
    // Revenues (credit balance)
    { code: '1010', name: 'מכירות בארץ',       type: 'revenue',  debit: 0,       credit: 800000 },
    { code: '1020', name: 'מכירות לחו"ל',       type: 'revenue',  debit: 0,       credit: 200000 },
    // COGS (debit balance)
    { code: '2020', name: 'קניות',              type: 'cogs',     debit: 500000,  credit: 0 },
    { code: '2100', name: 'עבודה ישירה',        type: 'cogs',     debit: 100000,  credit: 0 },
    // OPEX (debit balance)
    { code: '3100', name: 'שכר ונלוות',         type: 'expense',  debit: 120000,  credit: 0 },
    { code: '3200', name: 'שכר דירה',            type: 'expense',  debit: 30000,   credit: 0 },
    { code: '3400', name: 'כיבוד ואירוח',        type: 'expense',  debit: 10000,   credit: 0 },
    { code: '4000', name: 'פחת',                  type: 'expense',  debit: 20000,   credit: 0 },
    { code: '4200', name: 'תרומות',               type: 'expense',  debit: 5000,    credit: 0 },
    // Financial
    { code: '5110', name: 'ריבית בנקים',          type: 'financial',debit: 15000,   credit: 0 },
    { code: '5010', name: 'ריבית שהתקבלה',        type: 'financial',debit: 0,       credit: 5000 },
    // Current assets (debit) — cash includes the 205K profit swept in
    { code: '7020', name: 'בנק — עו"ש',           type: 'asset',    debit: 455000,  credit: 0 },
    { code: '7100', name: 'לקוחות',                type: 'asset',    debit: 150000,  credit: 0 },
    { code: '7200', name: 'מלאי',                  type: 'asset',    debit: 80000,   credit: 0 },
    // Fixed assets
    { code: '7420', name: 'מכונות וציוד',          type: 'fixed',    debit: 300000,  credit: 0 },
    { code: '7500', name: 'פחת נצבר',              type: 'fixed',    debit: 0,       credit: 100000 },
    // Liabilities (credit)
    { code: '7710', name: 'ספקים',                 type: 'liability',debit: 0,       credit: 180000 },
    { code: '8100', name: 'הלוואות לזמן ארוך',     type: 'liability',debit: 0,       credit: 200000 },
    // Equity (credit)
    { code: '8800', name: 'הון מניות',             type: 'equity',   debit: 0,       credit: 100000 },
    { code: '9000', name: 'עודפים',                type: 'equity',   debit: 0,       credit: 200000 },
  ];
}

// ---------------------------------------------------------------------------
// mapCOAToForm6111
// ---------------------------------------------------------------------------

test('mapCOAToForm6111 — exact code prefix match (4-digit)', () => {
  const m = mapCOAToForm6111({ code: '3400', type: 'expense' });
  assert.equal(m.row, 3400);
  assert.equal(m.section, 'OPEX');
  assert.match(m.source, /code_prefix_3400/);
});

test('mapCOAToForm6111 — sub-account prefix match (e.g. 3400-01)', () => {
  const m = mapCOAToForm6111({ code: '3400-01', type: 'expense' });
  assert.equal(m.row, 3400);
  assert.equal(m.he, 'כיבוד ואירוח');
  assert.equal(m.en, 'Entertainment & hospitality');
});

test('mapCOAToForm6111 — bilingual section labels present', () => {
  const m = mapCOAToForm6111({ code: '1010', type: 'revenue' });
  assert.equal(m.section, 'REVENUES');
  assert.equal(m.sectionHe, 'הכנסות');
  assert.equal(m.sectionEn, 'Revenues');
});

test('mapCOAToForm6111 — name-hint fallback (entertainment by name)', () => {
  const m = mapCOAToForm6111({ code: 'XYZ', name: 'Entertainment stuff', type: 'expense' });
  assert.equal(m.row, 3400);
  assert.match(m.source, /name_hint/);
});

test('mapCOAToForm6111 — Hebrew name hint (תרומות)', () => {
  const m = mapCOAToForm6111({ code: 'ZZZ', name: 'תרומות', type: 'expense' });
  assert.equal(m.row, 4200);
});

test('mapCOAToForm6111 — type fallback when no code/name match', () => {
  const m = mapCOAToForm6111({ code: 'FOO', name: 'whatever', type: 'asset' });
  assert.equal(m.row, 7300);
  assert.equal(m.section, 'CURRENT_ASSETS');
  assert.match(m.source, /type_fallback_asset/);
});

test('mapCOAToForm6111 — ultimate fallback when nothing matches', () => {
  const m = mapCOAToForm6111({ code: 'UNK' });
  assert.equal(m.row, 4900);
  assert.equal(m.section, 'OPEX');
  assert.match(m.source, /uncategorised_fallback/);
});

test('mapCOAToForm6111 — throws on non-object input', () => {
  assert.throws(() => mapCOAToForm6111(null));
  assert.throws(() => mapCOAToForm6111('3400'));
});

test('mapCOAToForm6111 — sign flag for contra accounts (accumulated depreciation)', () => {
  const m = mapCOAToForm6111({ code: '7500', type: 'fixed' });
  assert.equal(m.row, 7500);
  assert.equal(m.sign, -1);
});

// ---------------------------------------------------------------------------
// aggregateTrialBalance
// ---------------------------------------------------------------------------

test('aggregateTrialBalance — revenues reported as positive', () => {
  const { sections } = aggregateTrialBalance(baseTrialBalance());
  assert.equal(sections.get('REVENUES').total, 1000000);
});

test('aggregateTrialBalance — COGS reported as positive expense', () => {
  const { sections } = aggregateTrialBalance(baseTrialBalance());
  assert.equal(sections.get('COGS').total, 600000);
});

test('aggregateTrialBalance — section rowCount accurate', () => {
  const { sections } = aggregateTrialBalance(baseTrialBalance());
  assert.equal(sections.get('REVENUES').rowCount, 2);
  assert.equal(sections.get('OPEX').rowCount, 5);
});

test('aggregateTrialBalance — non-array input yields warning, empty maps', () => {
  const { rows, sections, warnings } = aggregateTrialBalance(null);
  assert.equal(rows.size, 0);
  assert.equal(warnings.length, 1);
  // Sections should still be seeded with zero totals
  assert.equal(sections.get('REVENUES').total, 0);
});

test('aggregateTrialBalance — skips non-object rows with warning', () => {
  const { warnings } = aggregateTrialBalance([null, 'xyz', { code: '1010', debit: 0, credit: 100 }]);
  assert.ok(warnings.length >= 2);
});

// ---------------------------------------------------------------------------
// Adjustment rules
// ---------------------------------------------------------------------------

test('adjustments — entertainment 80%/20% add-back', () => {
  const { amount } = ADJ_RULES.entertainment({ entertainmentExpense: 10000 });
  assert.equal(amount, 2000); // 20% of 10000
});

test('adjustments — entertainment zero input', () => {
  const { amount } = ADJ_RULES.entertainment({});
  assert.equal(amount, 0);
});

test('adjustments — donations above 30% cap adds excess back', () => {
  // taxable base 100000 → cap = 30000. Donate 50000 → excess 20000.
  const { amount } = ADJ_RULES.donations({ donations: 50000 }, { taxableBeforeAdj: 100000 });
  assert.equal(amount, 20000);
});

test('adjustments — donations below floor rejected entirely', () => {
  const { amount } = ADJ_RULES.donations({ donations: 100 }, { taxableBeforeAdj: 100000 });
  assert.equal(amount, 100); // full rejection
});

test('adjustments — donations exactly at 30% cap → zero excess', () => {
  const { amount } = ADJ_RULES.donations({ donations: 30000 }, { taxableBeforeAdj: 100000 });
  assert.equal(amount, 0);
});

test('adjustments — depreciation diff: book > tax (add back)', () => {
  const { amount } = ADJ_RULES.depreciationDiff({ bookDepreciation: 20000, taxDepreciation: 15000 });
  assert.equal(amount, 5000);
});

test('adjustments — depreciation diff: book < tax (deduct)', () => {
  const { amount } = ADJ_RULES.depreciationDiff({ bookDepreciation: 10000, taxDepreciation: 15000 });
  assert.equal(amount, -5000);
});

test('adjustments — FX §9 unrealised capital gain removed from taxable income', () => {
  const { amount } = ADJ_RULES.fxSection9({ fxUnrealisedCapital: 3000 });
  assert.equal(amount, -3000); // reverse book gain
});

test('adjustments — FX §9 unrealised capital loss added back', () => {
  const { amount } = ADJ_RULES.fxSection9({ fxUnrealisedCapital: -3000 });
  assert.equal(amount, 3000);
});

test('adjustments — accrual-to-cash delta passed through', () => {
  const { amount } = ADJ_RULES.accrualVsCash({ accrualToCashDelta: -7500 });
  assert.equal(amount, -7500);
});

test('adjustments — vehicle non-deductible default 55%', () => {
  const { amount } = ADJ_RULES.vehicle({ vehicleExpense: 10000 });
  // default deductible share = 0.45 → non-deductible = 0.55
  assert.equal(amount, 5500);
});

test('adjustments — vehicle custom share respected', () => {
  const { amount } = ADJ_RULES.vehicle({ vehicleExpense: 10000, deductibleShare: 0.80 });
  assert.equal(amount, 2000);
});

test('adjustments — fines always fully non-deductible', () => {
  const { amount } = ADJ_RULES.fines({ fines: 1500 });
  assert.equal(amount, 1500);
});

test('applyAdjustments — total sums all rules', () => {
  const { total, list } = applyAdjustments(
    {
      entertainmentExpense: 10000, // +2000
      donations: 50000,            // +20000 at cap 30k
      bookDepreciation: 20000,
      taxDepreciation: 15000,      // +5000
      fxUnrealisedCapital: 3000,   // -3000
      vehicleExpense: 10000,       // +5500
      fines: 500,                  // +500
    },
    { taxableBeforeAdj: 100000 }
  );
  assert.equal(total, 2000 + 20000 + 5000 - 3000 + 5500 + 500);
  assert.equal(list.length, Object.keys(ADJ_RULES).length);
});

// ---------------------------------------------------------------------------
// Corporate tax computation
// ---------------------------------------------------------------------------

test('computeCorporateTax — 23% on positive income', () => {
  const r = computeCorporateTax(100000, 2026);
  assert.equal(r.rate, 0.23);
  assert.equal(r.tax, 23000);
  assert.equal(r.loss, 0);
});

test('computeCorporateTax — zero income → zero tax', () => {
  const r = computeCorporateTax(0, 2026);
  assert.equal(r.tax, 0);
});

test('computeCorporateTax — loss → zero tax, loss recorded', () => {
  const r = computeCorporateTax(-50000, 2026);
  assert.equal(r.tax, 0);
  assert.equal(r.loss, 50000);
});

test('computeCorporateTax — tiny positive income', () => {
  const r = computeCorporateTax(1, 2026);
  assert.equal(r.tax, 0.23);
});

test('computeCorporateTax — 2026 rate constant is 23%', () => {
  assert.equal(CONSTANTS_2026.CORPORATE_TAX_RATE, 0.23);
  assert.equal(CONSTANTS_2026.YEAR, 2026);
});

// ---------------------------------------------------------------------------
// generate6111 — end-to-end
// ---------------------------------------------------------------------------

test('generate6111 — income statement aggregates correctly', () => {
  const r = generate6111(baseTrialBalance(), {}, COMPANY);
  const is = r.incomeStatement;
  assert.equal(is.revenues, 1000000);
  assert.equal(is.cogs, 600000);
  assert.equal(is.grossProfit, 400000);
  assert.equal(is.operatingExpenses, 185000); // 120+30+10+20+5 = 185k
  assert.equal(is.operatingProfit, 215000);
  // Financial net: expense 15000 minus income 5000 = 10000
  assert.equal(is.financialNet, 10000);
  assert.equal(is.bookProfit, 205000); // 215000 - 10000 + 0
});

test('generate6111 — balance sheet totals and check', () => {
  const r = generate6111(baseTrialBalance(), {}, COMPANY);
  const bs = r.balanceSheet;
  // Cash 455 + AR 150 + Inv 80 = 685K current assets
  assert.equal(bs.currentAssets, 685000);
  // Fixed 300 - 100 acc-depn = 200K
  assert.equal(bs.fixedAssets, 200000);
  assert.equal(bs.totalAssets, 885000);
  assert.equal(bs.liabilities, 380000);
  // Equity = share 100 + retained 200 + current-year book profit 205 = 505K
  assert.equal(bs.equity, 505000);
  assert.equal(bs.totalLiabilitiesEquity, 885000);
  assert.equal(bs.balanceCheck, 0);
});

test('generate6111 — sections ordered by SECTION_CODES', () => {
  const r = generate6111(baseTrialBalance(), {}, COMPANY);
  const ids = r.sections.map(s => s.id);
  assert.deepEqual(ids, SECTION_CODES.map(s => s.id));
});

test('generate6111 — applies adjustments and yields tax', () => {
  const r = generate6111(baseTrialBalance(), {
    entertainmentExpense: 10000,   // +2000
    donations: 3000,               // within 30% cap (cap = 0.3 * 205000 = 61500)
  }, COMPANY);
  const tc = r.taxComputation;
  assert.equal(tc.bookProfit, 205000);
  // Entertainment +2000, donations under cap +0, other rules 0 → 2000 total
  assert.equal(tc.adjustmentsTotal, 2000);
  assert.equal(tc.taxableIncome, 207000);
  assert.equal(tc.corporateTax, Math.round(207000 * 0.23 * 100) / 100);
});

test('generate6111 — advances + credits reduce tax due', () => {
  const r = generate6111(baseTrialBalance(), {
    advances: 20000,
    credits: 5000,
    withholdingCredits: 1000,
  }, COMPANY);
  const tc = r.taxComputation;
  const expectedTax = Math.round(205000 * 0.23 * 100) / 100;
  assert.equal(tc.corporateTax, expectedTax);
  assert.equal(tc.totalCredits, 26000);
  assert.equal(tc.taxDue, Math.round((expectedTax - 26000) * 100) / 100);
});

test('generate6111 — loss year produces zero tax, loss recorded', () => {
  // Use a loss-making TB: strip revenues
  const tb = baseTrialBalance().filter(a => a.code[0] !== '1');
  const r = generate6111(tb, {}, COMPANY);
  assert.equal(r.taxComputation.corporateTax, 0);
  assert.ok(r.taxComputation.loss > 0);
});

test('generate6111 — fiscal year defaults to CONSTANTS_2026.YEAR', () => {
  const r = generate6111(baseTrialBalance(), {}, { company_id: '1', legal_name: 'X' });
  assert.equal(r.year, 2026);
});

test('generate6111 — input trial balance not mutated (never delete rule)', () => {
  const tb = baseTrialBalance();
  const snap = JSON.stringify(tb);
  generate6111(tb, { entertainmentExpense: 1000, donations: 500 }, COMPANY);
  assert.equal(JSON.stringify(tb), snap);
});

test('generate6111 — sanity check: balanced BS → no BS_IMBALANCE warning', () => {
  const r = generate6111(baseTrialBalance(), {}, COMPANY);
  const bsWarn = r.sanity.find(s => s.code === 'BS_IMBALANCE');
  assert.equal(bsWarn, undefined);
});

test('generate6111 — unbalanced BS emits warning', () => {
  const tb = baseTrialBalance();
  tb.push({ code: '7020', name: 'מזומן נוסף', type: 'asset', debit: 9999, credit: 0 });
  const r = generate6111(tb, {}, COMPANY);
  const bsWarn = r.sanity.find(s => s.code === 'BS_IMBALANCE');
  assert.ok(bsWarn, 'expected BS_IMBALANCE warning');
});

test('generate6111 — metadata carries rule string', () => {
  const r = generate6111(baseTrialBalance(), {}, COMPANY);
  assert.equal(r.metadata.rule, 'לא מוחקים רק משדרגים ומגדלים');
  assert.equal(r.metadata.sectionCount, 9);
});

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

test('renderJson — emits parseable JSON', () => {
  const r = generate6111(baseTrialBalance(), {}, COMPANY);
  const json = renderJson(r);
  const parsed = JSON.parse(json);
  assert.equal(parsed.formType, '6111');
  assert.equal(parsed.year, 2026);
});

test('renderXml — well-formed XML envelope', () => {
  const r = generate6111(baseTrialBalance(), {}, COMPANY);
  const xml = renderXml(r);
  assert.match(xml, /<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<Form6111 xmlns="https:\/\/taxes\.gov\.il\/form6111\/2026">/);
  assert.match(xml, /<\/Form6111>/);
});

test('renderXml — contains bilingual labels', () => {
  const r = generate6111(baseTrialBalance(), {}, COMPANY);
  const xml = renderXml(r);
  assert.ok(xml.includes('<LabelHe>הכנסות</LabelHe>'));
  assert.ok(xml.includes('<LabelEn>Revenues</LabelEn>'));
});

test('renderXml — tag balance (open/close parity)', () => {
  const r = generate6111(baseTrialBalance(), {}, COMPANY);
  const xml = renderXml(r);
  // Strip <?xml ...?> declaration, then count opening and closing tags.
  // An opening tag is <Name ...> (attrs may contain '/' from URLs) but NOT
  // <Name .../> self-closing. A closing tag is </Name>.
  const body = xml.replace(/<\?xml[^?]*\?>/, '');
  const tagRegex = /<\/?([A-Za-z][\w-]*)\b[^>]*?(\/?)>/g;
  let opens = 0;
  let closes = 0;
  let m;
  while ((m = tagRegex.exec(body)) !== null) {
    const full = m[0];
    const selfClosing = full.endsWith('/>');
    const isClose = full.startsWith('</');
    if (isClose) closes++;
    else if (!selfClosing) opens++;
  }
  assert.equal(opens, closes, `expected matching tag counts, got ${opens} open vs ${closes} close`);
});

test('renderXml — escapes special characters in company name', () => {
  const tb = baseTrialBalance();
  const xml = renderXml(generate6111(tb, {}, {
    company_id: '1', legal_name: 'Foo & <Bar>', tax_file_number: 'x', fiscal_year: 2026,
  }));
  assert.ok(xml.includes('Foo &amp; &lt;Bar&gt;'));
  assert.ok(!xml.includes('Foo & <Bar>'));
});

test('renderXml — TaxComputation section populated', () => {
  const r = generate6111(baseTrialBalance(), { advances: 1000 }, COMPANY);
  const xml = renderXml(r);
  assert.ok(xml.includes('<TaxComputation>'));
  assert.ok(xml.includes('<CorporateTax>'));
  assert.ok(xml.includes('<TaxDue>'));
});

test('renderPdf — degraded text path when pdfkit missing (default in tests)', () => {
  const r = generate6111(baseTrialBalance(), { entertainmentExpense: 5000 }, COMPANY);
  const tmp = path.join(os.tmpdir(), `form6111-${Date.now()}.txt`);
  const out = renderPdf(r, tmp);
  // If pdfkit is not installed the renderer falls back to a text stub
  if (out.kind === 'text') {
    assert.ok(fs.existsSync(tmp));
    const content = fs.readFileSync(tmp, 'utf8');
    assert.ok(content.includes('Form 6111'));
    assert.ok(content.includes('Income Statement'));
    assert.ok(content.includes('Tax Computation'));
    fs.unlinkSync(tmp);
  } else {
    // pdfkit available — we only care that a file was written
    assert.equal(out.kind, 'pdf');
  }
});

// ---------------------------------------------------------------------------
// Engine factory
// ---------------------------------------------------------------------------

test('createEngine — exposes the canonical surface', () => {
  const e = createEngine();
  assert.equal(typeof e.generate6111, 'function');
  assert.equal(typeof e.mapCOAToForm6111, 'function');
  assert.equal(typeof e.computeCorporateTax, 'function');
  assert.equal(e.CONSTANTS_2026.CORPORATE_TAX_RATE, 0.23);
});

test('_internals — round helper respects decimals', () => {
  assert.equal(_internals.round(1.23456, 2), 1.23);
  assert.equal(_internals.round(1.235, 2), 1.24);
});

test('_internals — xmlEscape handles all five entities', () => {
  assert.equal(_internals.xmlEscape('<a b="c" d=\'e\' & f>'), '&lt;a b=&quot;c&quot; d=&apos;e&apos; &amp; f&gt;');
});

test('_internals — findSection maps row code to section', () => {
  assert.equal(_internals.findSection(3400).id, 'OPEX');
  assert.equal(_internals.findSection(1020).id, 'REVENUES');
  assert.equal(_internals.findSection(9000).id, 'EQUITY');
  assert.equal(_internals.findSection(-1), null);
});
