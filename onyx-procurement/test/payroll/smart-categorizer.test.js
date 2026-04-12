/**
 * Smart Bank Transaction Categorizer — Unit Tests
 * Agent 90 / Techno-Kol Uzi Mega-ERP
 *
 * 20+ cases covering every major category, the public API surface,
 * custom rules, learned overrides, and fallback behaviour.
 *
 * Run: node --test test/payroll/smart-categorizer.test.js
 *   or: node --test test/payroll/
 */

'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  CATEGORIES,
  categorize,
  addRule,
  learn,
  getRules,
  _resetForTests,
} = require('../../src/bank/smart-categorizer.js');

beforeEach(() => {
  _resetForTests();
});

describe('smart-categorizer — built-in rules catalogue', () => {
  test('catalogue ships with 50+ rules', () => {
    const snap = getRules();
    assert.ok(snap.builtin >= 50, `expected 50+ builtin rules, got ${snap.builtin}`);
    assert.equal(snap.custom, 0);
    assert.equal(snap.learned, 0);
  });

  test('all canonical categories are exposed', () => {
    const required = [
      'INCOME', 'OPERATIONS', 'PAYROLL', 'FUEL', 'FOOD',
      'TELECOM', 'MAINTENANCE', 'ARNONA', 'OFFICE', 'OTHER',
    ];
    for (const key of required) {
      assert.ok(CATEGORIES[key], `missing category key: ${key}`);
      assert.equal(typeof CATEGORIES[key], 'string');
    }
  });
});

describe('smart-categorizer — categorize() happy paths', () => {
  // 1. Food — Shufersal
  test('Shufersal → מזון', () => {
    const r = categorize({ description: 'SHUFERSAL DEAL TLV 1234', amount: -245.9 });
    assert.equal(r.category, CATEGORIES.FOOD);
    assert.ok(r.confidence >= 85);
    assert.ok(r.matched_rule);
    assert.equal(r.matched_rule.source, 'builtin');
  });

  // 2. Food — Rami Levy (Hebrew)
  test('רמי לוי → מזון', () => {
    const r = categorize({ description: 'חיוב רמי לוי השקמה', amount: -380 });
    assert.equal(r.category, CATEGORIES.FOOD);
    assert.ok(r.confidence >= 85);
  });

  // 3. Food — Yochananof
  test('Yochananof → מזון', () => {
    const r = categorize({ description: 'YOCHANANOF BRANCH 42', amount: -512.45 });
    assert.equal(r.category, CATEGORIES.FOOD);
  });

  // 4. Fuel — Paz
  test('Paz → דלק', () => {
    const r = categorize({ description: 'PAZ 2000 AYALON', amount: -320 });
    assert.equal(r.category, CATEGORIES.FUEL);
    assert.ok(r.matched_rule.subcategory.includes('פז'));
  });

  // 5. Fuel — Sonol (Hebrew)
  test('סונול → דלק', () => {
    const r = categorize({ description: 'תחנת סונול הרצליה', amount: -410 });
    assert.equal(r.category, CATEGORIES.FUEL);
  });

  // 6. Fuel — Delek
  test('Delek → דלק', () => {
    const r = categorize({ description: 'DELEK MOTORS HOLON', amount: -275 });
    assert.equal(r.category, CATEGORIES.FUEL);
  });

  // 7. Transport — Rav Kav
  test('Rav-Kav → תחבורה', () => {
    const r = categorize({ description: 'RAV KAV LOADING', amount: -180 });
    assert.equal(r.category, CATEGORIES.TRANSPORT);
  });

  // 8. Transport — Pango parking
  test('Pango → תחבורה', () => {
    const r = categorize({ description: 'PANGO PARKING APP', amount: -22 });
    assert.equal(r.category, CATEGORIES.TRANSPORT);
  });

  // 9. Telecom — Bezeq
  test('Bezeq → תקשורת', () => {
    const r = categorize({ description: 'BEZEQ MONTHLY BILL', amount: -230 });
    assert.equal(r.category, CATEGORIES.TELECOM);
  });

  // 10. Telecom — Cellcom (Hebrew)
  test('סלקום → תקשורת', () => {
    const r = categorize({ description: 'סלקום חשבון מרץ', amount: -149.9 });
    assert.equal(r.category, CATEGORIES.TELECOM);
  });

  // 11. Utilities — Electric company (Hebrew)
  test('חברת החשמל → חשמל ומים', () => {
    const r = categorize({ description: 'חברת החשמל לישראל', amount: -890 });
    assert.equal(r.category, CATEGORIES.UTILITIES);
    assert.ok(r.confidence >= 85);
  });

  // 12. Utilities — מקורות water
  test('מקורות → חשמל ומים', () => {
    const r = categorize({ description: 'מקורות חברת מים', amount: -220 });
    assert.equal(r.category, CATEGORIES.UTILITIES);
  });

  // 13. Government — Bituach Leumi
  test('ביטוח לאומי → ממשלה', () => {
    const r = categorize({ description: 'ביטוח לאומי - דמי ביטוח', amount: -1200 });
    assert.equal(r.category, CATEGORIES.GOVERNMENT);
  });

  // 14. Government — Income tax
  test('מס הכנסה → ממשלה', () => {
    const r = categorize({ description: 'מס הכנסה - מקדמה', amount: -3500 });
    assert.equal(r.category, CATEGORIES.GOVERNMENT);
  });

  // 15. Arnona — municipal tax
  test('ארנונה → ארנונה', () => {
    const r = categorize({ description: 'ארנונה עיריית תל אביב', amount: -1850 });
    assert.equal(r.category, CATEGORIES.ARNONA);
  });

  // 16. Retail — IKEA
  test('IKEA → קמעונאות', () => {
    const r = categorize({ description: 'IKEA ISRAEL NETANYA', amount: -1299 });
    assert.equal(r.category, CATEGORIES.RETAIL);
  });

  // 17. Restaurant — Aroma
  test('Aroma → מסעדות', () => {
    const r = categorize({ description: 'AROMA ESPRESSO DIZENGOFF', amount: -42 });
    assert.equal(r.category, CATEGORIES.RESTAURANT);
  });

  // 18. Restaurant — Domino's (Hebrew)
  test('דומינוס → מסעדות', () => {
    const r = categorize({ description: 'דומינוס פיצה סניף רמת גן', amount: -99 });
    assert.equal(r.category, CATEGORIES.RESTAURANT);
  });

  // 19. E-commerce — Amazon
  test('Amazon → מסחר אלקטרוני', () => {
    const r = categorize({ description: 'AMAZON.COM*AB12CD', amount: -89.9 });
    assert.equal(r.category, CATEGORIES.ECOMMERCE);
  });

  // 20. E-commerce — AliExpress
  test('AliExpress → מסחר אלקטרוני', () => {
    const r = categorize({ description: 'ALIEXPRESS ORDER', amount: -15.2 });
    assert.equal(r.category, CATEGORIES.ECOMMERCE);
  });

  // 21. Supplier — HotMil (Techno-Kol specific)
  test('הוט מיל → ספקים', () => {
    const r = categorize({ description: 'חשבונית הוט מיל מתכות', amount: -12500 });
    assert.equal(r.category, CATEGORIES.SUPPLIERS);
    assert.ok(r.matched_rule.subcategory.includes('הוט מיל'));
  });

  // 22. Payroll — משכורת
  test('משכורת → שכר', () => {
    const r = categorize({ description: 'העברת משכורת חודשית', amount: -8500 });
    assert.equal(r.category, CATEGORIES.PAYROLL);
  });

  // 23. Income — incoming transfer
  test('העברה נכנסת → הכנסות', () => {
    const r = categorize({ description: 'העברה נכנסת מלקוח', amount: 24000 });
    assert.equal(r.category, CATEGORIES.INCOME);
  });

  // 24. Real estate — Vaad Bayit
  test('ועד בית → נדלן', () => {
    const r = categorize({ description: 'ועד בית חודשי', amount: -250 });
    assert.equal(r.category, CATEGORIES.REAL_ESTATE);
  });
});

describe('smart-categorizer — custom rules', () => {
  test('addRule() registers a custom rule that beats the fallback', () => {
    const id = addRule(/ACME\s*IMPORTS/i, CATEGORIES.SUPPLIERS, {
      subcategory: 'ACME — custom',
      priority: 95,
    });
    assert.ok(id && typeof id === 'string');

    const r = categorize({ description: 'ACME IMPORTS LTD TLV', amount: -4200 });
    assert.equal(r.category, CATEGORIES.SUPPLIERS);
    assert.equal(r.matched_rule.source, 'custom');
    assert.equal(r.matched_rule.subcategory, 'ACME — custom');
  });

  test('custom rule with string pattern yields high confidence on exact match', () => {
    addRule('widgetco', CATEGORIES.SUPPLIERS, { priority: 90 });
    const r = categorize({ description: 'widgetco' });
    assert.equal(r.category, CATEGORIES.SUPPLIERS);
    assert.equal(r.confidence, 100);
  });

  test('addRule throws without category', () => {
    assert.throws(() => addRule(/foo/, undefined));
  });
});

describe('smart-categorizer — learn() user overrides', () => {
  test('learn() records a user override and reuses it next time', () => {
    const tx = { description: 'WEIRDMERCHANT BRANCH 01', amount: -77 };
    // Before: should fall through to generic expense fallback
    const before = categorize(tx);
    assert.notEqual(before.category, CATEGORIES.OFFICE);

    learn(tx, CATEGORIES.OFFICE, { subcategory: 'ציוד משרדי' });

    const after = categorize(tx);
    assert.equal(after.category, CATEGORIES.OFFICE);
    assert.equal(after.matched_rule.source, 'learned');
    assert.ok(after.confidence >= 90, `expected learned confidence ≥ 90, got ${after.confidence}`);
  });

  test('learn() is a no-op on empty input', () => {
    assert.equal(learn({}, CATEGORIES.OFFICE), null);
    assert.equal(learn({ description: '' }, CATEGORIES.OFFICE), null);
  });
});

describe('smart-categorizer — fallback & edge cases', () => {
  test('empty transaction returns OTHER with confidence 0', () => {
    const r = categorize({});
    assert.equal(r.category, CATEGORIES.OTHER);
    assert.equal(r.confidence, 0);
    assert.equal(r.matched_rule, null);
  });

  test('null/undefined transaction is safe', () => {
    assert.doesNotThrow(() => categorize(null));
    assert.doesNotThrow(() => categorize(undefined));
  });

  test('unknown merchant with negative amount → fallback OPERATIONS', () => {
    const r = categorize({ description: 'UNKNOWN VENDOR 9999', amount: -150 });
    assert.equal(r.category, CATEGORIES.OPERATIONS);
    assert.equal(r.matched_rule.source, 'fallback');
    assert.ok(r.confidence > 0 && r.confidence < 50);
  });

  test('unknown merchant with positive amount → fallback INCOME', () => {
    const r = categorize({ description: 'UNKNOWN CREDIT', amount: 9999 });
    assert.equal(r.category, CATEGORIES.INCOME);
    assert.equal(r.matched_rule.source, 'fallback');
  });

  test('higher priority rule wins over lower priority rule on the same text', () => {
    addRule(/test-merchant/i, CATEGORIES.OFFICE, { priority: 50 });
    addRule(/test-merchant/i, CATEGORIES.OPERATIONS, { priority: 99 });
    const r = categorize({ description: 'TEST-MERCHANT XYZ' });
    assert.equal(r.category, CATEGORIES.OPERATIONS);
  });
});
