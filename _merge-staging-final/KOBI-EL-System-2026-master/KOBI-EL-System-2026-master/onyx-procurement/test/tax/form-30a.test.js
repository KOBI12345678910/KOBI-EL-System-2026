/**
 * Tests for src/tax/form-30a.js
 *
 * Israeli self-employed quarterly advance — טופס 30א ו-30ב
 *
 * Covers:
 *   • computeAdvanceRate — rate from Tax Authority notice (priorTax / priorRevenue)
 *   • applyAdvanceToTurnover — advance amount, rounding, edge cases
 *   • dueDateFor / quarterWindow — due date logic (15th of next month, Q4 → Jan 15 of next year)
 *   • generate30a — full form payload, taxpayer validation, bilingual labels
 *   • generate30b — adjusted rate mid-year, reason capture, rate source formula
 *   • Purity — inputs not mutated (לא מוחקים רק משדרגים ומגדלים)
 *
 * Run: node --test test/tax/form-30a.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  generate30a,
  generate30b,
  computeAdvanceRate,
  applyAdvanceToTurnover,
  dueDateFor,
  quarterWindow,
  FORM_LABELS,
} = require('../../src/tax/form-30a.js');

// ═══ SHARED FIXTURE ═══

const taxpayer = {
  tax_file_number: '516123456',
  id_number:       '038123456',
  legal_name:      'כובי אל — בניה וצביעה',
  address:         'HaMelacha 10, Tel Aviv',
  phone:           '03-1234567',
  email:           'kobi@technokoluzi.co.il',
};

// ═══ computeAdvanceRate ═══

describe('computeAdvanceRate', () => {
  test('divides prior-year tax by prior-year revenue', () => {
    // 73,000 tax on 1,000,000 revenue → 0.073 (7.3%)
    const rate = computeAdvanceRate(73000, 1000000);
    assert.equal(rate, 0.073);
  });

  test('returns 0 for zero revenue', () => {
    assert.equal(computeAdvanceRate(50000, 0), 0);
  });

  test('returns 0 for zero tax', () => {
    assert.equal(computeAdvanceRate(0, 1000000), 0);
  });

  test('returns 0 for negative inputs', () => {
    assert.equal(computeAdvanceRate(-100, 1000000), 0);
    assert.equal(computeAdvanceRate(100, -1000000), 0);
  });

  test('returns 0 for non-finite inputs', () => {
    assert.equal(computeAdvanceRate(NaN, 1000000), 0);
    assert.equal(computeAdvanceRate(100, Infinity), 0);
  });

  test('caps at 1 (100%) for absurd inputs', () => {
    assert.equal(computeAdvanceRate(2000000, 1000000), 1);
  });

  test('realistic 2026 rate — small construction self-employed', () => {
    // Prior year: 350,000 tax on 2,500,000 revenue → 0.14 (14%)
    const rate = computeAdvanceRate(350000, 2500000);
    assert.equal(rate, 0.14);
  });
});

// ═══ applyAdvanceToTurnover ═══

describe('applyAdvanceToTurnover', () => {
  test('multiplies rate by turnover, rounded to 2 decimals', () => {
    // 7.3% of 250,000 = 18,250.00
    assert.equal(applyAdvanceToTurnover(0.073, 250000), 18250);
  });

  test('rounds agorot correctly', () => {
    // 0.0733 * 123456.78 = 9049.3819... → 9049.38
    const out = applyAdvanceToTurnover(0.0733, 123456.78);
    assert.equal(out, 9049.38);
  });

  test('returns 0 for non-positive inputs', () => {
    assert.equal(applyAdvanceToTurnover(0, 100000), 0);
    assert.equal(applyAdvanceToTurnover(0.1, 0), 0);
    assert.equal(applyAdvanceToTurnover(-0.1, 100000), 0);
  });

  test('handles typical quarterly numbers', () => {
    // 14% rate on 625,000 quarter = 87,500
    assert.equal(applyAdvanceToTurnover(0.14, 625000), 87500);
  });
});

// ═══ dueDateFor ═══

describe('dueDateFor — 15th of month after quarter end', () => {
  test('Q1 → April 15', () => {
    assert.equal(dueDateFor(1, 2026), '2026-04-15');
  });

  test('Q2 → July 15', () => {
    assert.equal(dueDateFor(2, 2026), '2026-07-15');
  });

  test('Q3 → October 15', () => {
    assert.equal(dueDateFor(3, 2026), '2026-10-15');
  });

  test('Q4 → January 15 of the FOLLOWING year', () => {
    assert.equal(dueDateFor(4, 2026), '2027-01-15');
  });

  test('Q4 edge: year rollover correct for 2025 → 2026', () => {
    assert.equal(dueDateFor(4, 2025), '2026-01-15');
  });

  test('rejects invalid quarter', () => {
    assert.throws(() => dueDateFor(0, 2026), /Invalid quarter/);
    assert.throws(() => dueDateFor(5, 2026), /Invalid quarter/);
    assert.throws(() => dueDateFor('Q1', 2026), /Invalid quarter/);
  });

  test('rejects invalid year', () => {
    assert.throws(() => dueDateFor(1, 0), /Invalid year/);
    assert.throws(() => dueDateFor(1, 'twenty-six'), /Invalid year/);
  });
});

// ═══ quarterWindow ═══

describe('quarterWindow — calendar quarter start/end', () => {
  test('Q1 2026 → Jan 1 .. Mar 31', () => {
    assert.deepEqual(quarterWindow(1, 2026), { start: '2026-01-01', end: '2026-03-31' });
  });

  test('Q2 2026 → Apr 1 .. Jun 30', () => {
    assert.deepEqual(quarterWindow(2, 2026), { start: '2026-04-01', end: '2026-06-30' });
  });

  test('Q3 2026 → Jul 1 .. Sep 30', () => {
    assert.deepEqual(quarterWindow(3, 2026), { start: '2026-07-01', end: '2026-09-30' });
  });

  test('Q4 2026 → Oct 1 .. Dec 31', () => {
    assert.deepEqual(quarterWindow(4, 2026), { start: '2026-10-01', end: '2026-12-31' });
  });
});

// ═══ generate30a ═══

describe('generate30a — regular quarterly advance', () => {
  const baseParams = {
    taxpayer,
    priorYearTax:     73000,
    priorYearRevenue: 1000000,
    quarter:          1,
    year:             2026,
    currentTurnover:  250000,
  };

  test('returns {rate, base, advance, due, form}', () => {
    const out = generate30a(baseParams);
    assert.ok('rate'    in out);
    assert.ok('base'    in out);
    assert.ok('advance' in out);
    assert.ok('due'     in out);
    assert.ok('form'    in out);
  });

  test('rate = priorYearTax / priorYearRevenue', () => {
    const out = generate30a(baseParams);
    assert.equal(out.rate, 0.073);
  });

  test('base = currentTurnover when no deductions', () => {
    const out = generate30a(baseParams);
    assert.equal(out.base, 250000);
  });

  test('advance = rate × base, rounded 2dp', () => {
    const out = generate30a(baseParams);
    // 0.073 * 250000 = 18250
    assert.equal(out.advance, 18250);
  });

  test('due date is 15-Apr for Q1', () => {
    const out = generate30a(baseParams);
    assert.equal(out.due, '2026-04-15');
    assert.equal(out.form.period.dueDate, '2026-04-15');
  });

  test('Q4 due date rolls to January of following year', () => {
    const out = generate30a({ ...baseParams, quarter: 4 });
    assert.equal(out.due, '2027-01-15');
  });

  test('deductions reduce the base before applying rate', () => {
    const out = generate30a({ ...baseParams, adjustments: { deductions: 50000 } });
    // base = 250000 - 50000 = 200000
    // advance = 0.073 * 200000 = 14600
    assert.equal(out.base, 200000);
    assert.equal(out.advance, 14600);
  });

  test('credits reduce the advance after the rate', () => {
    const out = generate30a({
      ...baseParams,
      adjustments: { credits: 1000 },
    });
    // advance = 18250 - 1000 = 17250
    assert.equal(out.advance, 17250);
  });

  test('accepts adjustments as bare number (deductions)', () => {
    const out = generate30a({ ...baseParams, adjustments: 50000 });
    assert.equal(out.base, 200000);
    assert.equal(out.advance, 14600);
  });

  test('accepts adjustments as array of deductions', () => {
    const out = generate30a({ ...baseParams, adjustments: [10000, 20000, 20000] });
    assert.equal(out.base, 200000);
    assert.equal(out.advance, 14600);
  });

  test('form contains bilingual labels', () => {
    const out = generate30a(baseParams);
    assert.equal(out.form.formLabel.he, 'טופס 30א — מקדמות לעצמאי');
    assert.equal(out.form.formLabel.en, 'Form 30A — Self-Employed Quarterly Advance');
  });

  test('form includes rate source with formula', () => {
    const out = generate30a(baseParams);
    assert.equal(out.form.rateSource.formula, 'priorYearTax / priorYearRevenue');
    assert.equal(out.form.rateSource.priorYearTax, 73000);
    assert.equal(out.form.rateSource.priorYearRevenue, 1000000);
    assert.equal(out.form.rateSource.ratePercent, 7.3);
  });

  test('form.period includes quarter start/end', () => {
    const out = generate30a(baseParams);
    assert.equal(out.form.period.start, '2026-01-01');
    assert.equal(out.form.period.end,   '2026-03-31');
  });

  test('throws on missing taxpayer', () => {
    assert.throws(() => generate30a({ ...baseParams, taxpayer: undefined }),
                  /taxpayer is required/);
  });

  test('throws on taxpayer missing tax_file_number', () => {
    const broken = { ...taxpayer, tax_file_number: '' };
    assert.throws(() => generate30a({ ...baseParams, taxpayer: broken }),
                  /tax_file_number is required/);
  });

  test('throws on negative currentTurnover', () => {
    assert.throws(() => generate30a({ ...baseParams, currentTurnover: -1 }),
                  /currentTurnover/);
  });

  test('does not mutate input params (purity)', () => {
    const params = { ...baseParams, adjustments: { deductions: 1000, credits: 500 } };
    const snap   = JSON.stringify(params);
    generate30a(params);
    assert.equal(JSON.stringify(params), snap, 'input was mutated');
  });

  test('zero turnover produces zero advance', () => {
    const out = generate30a({ ...baseParams, currentTurnover: 0 });
    assert.equal(out.advance, 0);
  });

  test('zero prior-year revenue → rate 0 → advance 0', () => {
    const out = generate30a({ ...baseParams, priorYearRevenue: 0, priorYearTax: 0 });
    assert.equal(out.rate, 0);
    assert.equal(out.advance, 0);
  });
});

// ═══ generate30b ═══

describe('generate30b — adjusted advance mid-year', () => {
  const baseParams = {
    taxpayer,
    quarter: 2,
    year:    2026,
    // Current-year actuals through Q1+Q2: significantly higher profitability
    actualRevenue:     500000,
    actualTaxEstimate: 60000,
    currentTurnover:   250000,
    reason:            'גידול בהכנסות בגין פרויקט בניה חדש',
  };

  test('returns {rate, base, advance, due, form}', () => {
    const out = generate30b(baseParams);
    assert.ok('rate'    in out);
    assert.ok('base'    in out);
    assert.ok('advance' in out);
    assert.ok('due'     in out);
    assert.ok('form'    in out);
  });

  test('proposed rate = actualTaxEstimate / actualRevenue', () => {
    const out = generate30b(baseParams);
    // 60000 / 500000 = 0.12
    assert.equal(out.rate, 0.12);
  });

  test('advance = proposed rate × current turnover', () => {
    const out = generate30b(baseParams);
    // 0.12 * 250000 = 30000
    assert.equal(out.advance, 30000);
  });

  test('Q2 due date is 15-Jul', () => {
    const out = generate30b(baseParams);
    assert.equal(out.due, '2026-07-15');
  });

  test('captures adjustment reason on form', () => {
    const out = generate30b(baseParams);
    assert.equal(out.form.adjustment.basis, 'current_year_actuals');
    assert.equal(out.form.adjustment.reason, 'גידול בהכנסות בגין פרויקט בניה חדש');
  });

  test('bilingual label reads as טופס 30ב / Form 30B', () => {
    const out = generate30b(baseParams);
    assert.equal(out.form.formLabel.he, 'טופס 30ב — מקדמות מתואמות');
    assert.equal(out.form.formLabel.en, 'Form 30B — Adjusted Quarterly Advance');
  });

  test('rate source formula is current-year actuals', () => {
    const out = generate30b(baseParams);
    assert.equal(out.form.rateSource.formula, 'actualTaxEstimate / actualRevenue');
    assert.equal(out.form.rateSource.actualRevenue,     500000);
    assert.equal(out.form.rateSource.actualTaxEstimate, 60000);
  });

  test('30a vs 30b use SAME computeAdvanceRate formula, different inputs', () => {
    // 30a uses prior-year numbers
    const a = generate30a({
      taxpayer,
      priorYearTax:     60000,
      priorYearRevenue: 500000,
      quarter:          2,
      year:             2026,
      currentTurnover:  250000,
    });
    // 30b with current-year actuals that match those numbers produces same rate
    const b = generate30b(baseParams);
    assert.equal(a.rate,    b.rate);
    assert.equal(a.advance, b.advance);
    // but 30b carries the adjustment reason, 30a does not
    assert.equal(a.form.formType, '30a');
    assert.equal(b.form.formType, '30b');
    assert.ok(!('adjustment' in a.form));
    assert.ok('adjustment' in b.form);
  });

  test('throws on missing actualRevenue', () => {
    assert.throws(() => generate30b({ ...baseParams, actualRevenue: undefined }),
                  /actualRevenue/);
  });

  test('does not mutate input params (purity)', () => {
    const params = { ...baseParams };
    const snap   = JSON.stringify(params);
    generate30b(params);
    assert.equal(JSON.stringify(params), snap, 'input was mutated');
  });
});

// ═══ FORM_LABELS constant ═══

describe('FORM_LABELS', () => {
  test('exposes HE + EN for every key', () => {
    for (const [key, label] of Object.entries(FORM_LABELS)) {
      assert.ok(label.he, `${key} missing HE`);
      assert.ok(label.en, `${key} missing EN`);
    }
  });

  test('is frozen', () => {
    assert.ok(Object.isFrozen(FORM_LABELS));
  });
});
