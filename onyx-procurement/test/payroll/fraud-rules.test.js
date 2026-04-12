/**
 * Unit tests for Fraud Detection Rules Engine
 * Agent-X03 — Swarm 3 — Techno-Kol Uzi ERP
 *
 * Run: node --test test/payroll/fraud-rules.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateRules,
  addRule,
  listRules,
  getRuleById,
  explainDecision,
  _internals,
} = require('../../src/security/fraud-rules');

// ---------------------------------------------------------------------------
// Test context helpers
// ---------------------------------------------------------------------------

function baseCtx(overrides = {}) {
  return {
    now: '2026-04-08T10:30:00Z', // Wed 10:30 UTC, weekday
    approval_threshold: 5000,
    split_threshold: 5000,
    round_amount_tolerance: 0,
    vendor: {
      id: 'V-1',
      name: 'Acme Israel Ltd',
      created_at: '2024-01-01T10:00:00Z',
      vat_id: '123456789',
      vat_validated: true,
      bank_account: 'IL620108000000099999999',
      bank_account_changed_at: null,
      address: 'Dizengoff 1, Tel Aviv',
      israeli_registered: true,
    },
    vendor_history: {
      recent_round_amounts: 0,
      round_amount_frequency_threshold: 3,
      recent_invoice_numbers: ['INV-100', 'INV-200'],
    },
    invoice: {
      id: 'I-1',
      number: 'INV-201',
      description: 'Monthly cloud services',
      amount: 3200,
      invoice_date: '2026-04-01T00:00:00Z',
      submitted_at: '2026-04-08T09:00:00Z',
      has_supporting_docs: true,
      supporting_docs_count: 2,
      purchase_order_id: 'PO-9',
    },
    payment: {
      initiated_at: '2026-04-08T10:00:00Z',
      amount: 3200,
      destination_iban: 'IL620108000000099999999',
      destination_country: 'IL',
    },
    employee: null,
    related_employees: [],
    related_invoices: [],
    split_batch_total: null,
    holidays: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Registry & metadata
// ---------------------------------------------------------------------------

test('01. listRules returns at least 30 built-in rules', () => {
  const rules = listRules();
  assert.ok(rules.length >= 30, `expected >=30 rules, got ${rules.length}`);
});

test('02. all built-in rules have unique IDs and required fields', () => {
  const rules = listRules();
  const ids = new Set();
  for (const r of rules) {
    assert.equal(typeof r.id, 'string');
    assert.ok(r.id.length > 0);
    assert.ok(!ids.has(r.id), `duplicate id ${r.id}`);
    ids.add(r.id);
    assert.equal(typeof r.name_he, 'string');
    assert.equal(typeof r.name_en, 'string');
    assert.equal(typeof r.check, 'function');
    assert.equal(typeof r.message_he, 'string');
    assert.equal(typeof r.message_en, 'string');
    assert.ok(r.severity >= 1 && r.severity <= 10);
  }
});

test('03. getRuleById finds built-in rules and returns null for missing', () => {
  assert.ok(getRuleById('FR-001'));
  assert.equal(getRuleById('NOPE-404'), null);
});

// ---------------------------------------------------------------------------
// 2. Clean context -> allow
// ---------------------------------------------------------------------------

test('04. clean context produces zero risk and allow', () => {
  const res = evaluateRules(baseCtx());
  assert.equal(res.triggered_rules.length, 0);
  assert.equal(res.risk_score, 0);
  assert.equal(res.recommended_action, 'allow');
});

test('05. empty context is handled without throwing', () => {
  const res = evaluateRules({});
  assert.ok(Array.isArray(res.triggered_rules));
  assert.equal(res.recommended_action, 'allow');
});

test('06. null/undefined context does not crash', () => {
  const r1 = evaluateRules(null);
  const r2 = evaluateRules(undefined);
  assert.equal(r1.recommended_action, 'allow');
  assert.equal(r2.recommended_action, 'allow');
});

// ---------------------------------------------------------------------------
// 3. Per-rule triggers
// ---------------------------------------------------------------------------

test('07. FR-001: invoice amount just below approval threshold', () => {
  const ctx = baseCtx({
    invoice: { ...baseCtx().invoice, amount: 4999 },
  });
  const res = evaluateRules(ctx);
  const ids = res.triggered_rules.map((r) => r.id);
  assert.ok(ids.includes('FR-001'), `expected FR-001 in ${ids.join(',')}`);
});

test('08. FR-002: new vendor + invoice within 24h', () => {
  const ctx = baseCtx({
    vendor: {
      ...baseCtx().vendor,
      created_at: '2026-04-08T00:00:00Z',
    },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-002'));
});

test('09. FR-003: bank account changed < 7 days before payment', () => {
  const ctx = baseCtx({
    vendor: {
      ...baseCtx().vendor,
      bank_account_changed_at: '2026-04-05T10:00:00Z',
    },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-003'));
});

test('10. FR-004: VAT ID not validated', () => {
  const ctx = baseCtx({
    vendor: {
      ...baseCtx().vendor,
      vat_id: '123456789',
      vat_validated: false,
    },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-004'));
});

test('11. FR-005: red-flag name token without Israeli registration', () => {
  const ctx = baseCtx({
    vendor: {
      ...baseCtx().vendor,
      name: 'Mega Holdings Offshore Consulting',
      israeli_registered: false,
    },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-005'));
});

test('12. FR-006: round amounts high frequency', () => {
  const ctx = baseCtx({
    invoice: { ...baseCtx().invoice, amount: 10000 },
    vendor_history: {
      recent_round_amounts: 5,
      round_amount_frequency_threshold: 3,
      recent_invoice_numbers: ['A1', 'A2'],
    },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-006'));
});

test('13. FR-007: sequential invoice numbers from same vendor', () => {
  const ctx = baseCtx({
    vendor_history: {
      recent_round_amounts: 0,
      round_amount_frequency_threshold: 3,
      recent_invoice_numbers: ['INV-100', 'INV-101', 'INV-102', 'INV-103'],
    },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-007'));
});

test('14. FR-008: split invoice evading threshold via split_batch_total', () => {
  const ctx = baseCtx({
    invoice: {
      ...baseCtx().invoice,
      amount: 4800,
      split_batch_id: 'batch-1',
    },
    split_batch_total: 14000,
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-008'));
});

test('15. FR-008: split invoice via related_invoices fallback', () => {
  const ctx = baseCtx({
    invoice: { ...baseCtx().invoice, amount: 4800, split_batch_id: 'batch-2' },
    related_invoices: [
      { id: 'r1', vendor_id: 'V-1', amount: 4800, split_batch_id: 'batch-2' },
      { id: 'r2', vendor_id: 'V-1', amount: 4900, split_batch_id: 'batch-2' },
      { id: 'r3', vendor_id: 'V-1', amount: 4800, split_batch_id: 'batch-2' },
    ],
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-008'));
});

test('16. FR-009: duplicate description from different vendor', () => {
  const ctx = baseCtx({
    related_invoices: [
      { id: 'r1', vendor_id: 'V-OTHER', description: 'Monthly cloud services', amount: 1000 },
    ],
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-009'));
});

test('17. FR-010: invoice date in the future', () => {
  const ctx = baseCtx({
    invoice: { ...baseCtx().invoice, invoice_date: '2027-01-01T00:00:00Z' },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-010'));
});

test('18. FR-011: payment before invoice date', () => {
  const ctx = baseCtx({
    invoice: { ...baseCtx().invoice, invoice_date: '2026-04-10T00:00:00Z' },
    payment: {
      ...baseCtx().payment,
      initiated_at: '2026-04-05T10:00:00Z',
    },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-011'));
});

test('19. FR-012: missing supporting documents', () => {
  const ctx = baseCtx({
    invoice: {
      ...baseCtx().invoice,
      has_supporting_docs: false,
      supporting_docs_count: 0,
    },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-012'));
});

test('20. FR-013: vendor address matches employee address', () => {
  const ctx = baseCtx({
    employee: {
      id: 'E-1',
      tz: '000000018',
      address: 'Dizengoff 1, Tel Aviv',
      bank_accounts: [],
    },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-013'));
});

test('21. FR-013: matches via related_employees list', () => {
  const ctx = baseCtx({
    related_employees: [
      { id: 'E-99', address: 'DIZENGOFF 1, TEL AVIV' },
    ],
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-013'));
});

test('22. FR-014: IBAN from high-risk country (Russia)', () => {
  const ctx = baseCtx({
    payment: {
      ...baseCtx().payment,
      destination_iban: 'RU02044525225040702810412345678901',
      destination_country: null,
    },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-014'));
});

test('23. FR-015: weekend transaction (Saturday)', () => {
  // 2026-04-11 is Saturday
  const ctx = baseCtx({
    payment: {
      ...baseCtx().payment,
      initiated_at: '2026-04-11T10:00:00Z',
    },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-015'));
});

test('24. FR-016: out-of-hours transaction (02:00)', () => {
  const ctx = baseCtx({
    payment: {
      ...baseCtx().payment,
      initiated_at: '2026-04-08T02:00:00',
    },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-016'));
});

test('25. FR-017: holiday transaction', () => {
  const ctx = baseCtx({
    holidays: ['2026-04-08'],
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-017'));
});

test('26. FR-018: employee with multiple bank accounts', () => {
  const ctx = baseCtx({
    employee: {
      id: 'E-1',
      tz: '000000018',
      address: 'X',
      bank_accounts: ['IL11', 'IL22'],
    },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-018'));
});

test('27. FR-019: salary paid to wrong account', () => {
  const ctx = baseCtx({
    employee: {
      id: 'E-1',
      tz: '000000018',
      address: 'X',
      bank_accounts: ['IL11', 'IL22'],
      active_bank_account: 'IL22',
      expected_bank_account: 'IL11',
    },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-019'));
});

test('28. FR-020: duplicate TZ across employees', () => {
  const ctx = baseCtx({
    employee: {
      id: 'E-1',
      tz: '000000018',
      address: 'X',
    },
    related_employees: [
      { id: 'E-2', tz: '000000018', address: 'Y' },
    ],
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-020'));
});

test('29. FR-021: unusually high overtime', () => {
  const ctx = baseCtx({
    employee: {
      id: 'E-1',
      tz: '000000018',
      address: 'X',
      overtime_hours: 120,
      standard_overtime_hours: 30,
    },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-021'));
});

test('30. FR-022: invalid TZ check digit', () => {
  const ctx = baseCtx({
    employee: {
      id: 'E-1',
      tz: '123456789', // invalid
      address: 'X',
    },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-022'));
});

test('31. FR-023: vendor with no VAT ID', () => {
  const ctx = baseCtx({
    vendor: { ...baseCtx().vendor, vat_id: '' },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-023'));
});

test('32. FR-024: non-positive invoice amount', () => {
  const ctx = baseCtx({
    invoice: { ...baseCtx().invoice, amount: 0 },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-024'));
});

test('33. FR-025: duplicate invoice number from same vendor', () => {
  const ctx = baseCtx({
    invoice: { ...baseCtx().invoice, number: 'INV-100' },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-025'));
});

test('34. FR-026: amount 10x above approval threshold', () => {
  const ctx = baseCtx({
    invoice: { ...baseCtx().invoice, amount: 60000 },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-026'));
});

test('35. FR-027: blank/generic description', () => {
  const ctx = baseCtx({
    invoice: { ...baseCtx().invoice, description: 'misc' },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-027'));
});

test('36. FR-028: payment amount differs from invoice', () => {
  const ctx = baseCtx({
    payment: { ...baseCtx().payment, amount: 3500 },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-028'));
});

test('37. FR-029: very old invoice submitted now', () => {
  const ctx = baseCtx({
    invoice: {
      ...baseCtx().invoice,
      invoice_date: '2025-01-01T00:00:00Z',
      submitted_at: '2026-04-08T09:00:00Z',
    },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-029'));
});

test('38. FR-030: same user created vendor and approved invoice', () => {
  const ctx = baseCtx({
    vendor: { ...baseCtx().vendor, created_by: 'U-42' },
    invoice: { ...baseCtx().invoice, approved_by: 'U-42' },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-030'));
});

test('39. FR-031: employee bank account matches vendor bank account', () => {
  const ctx = baseCtx({
    vendor: { ...baseCtx().vendor, bank_account: 'IL620108000000099999999' },
    employee: {
      id: 'E-1',
      tz: '000000018',
      address: 'X',
      active_bank_account: 'IL62 0108 0000 0009 9999 999',
    },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-031'));
});

test('40. FR-032: invoice without linked PO', () => {
  const ctx = baseCtx({
    invoice: { ...baseCtx().invoice, purchase_order_id: null },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.triggered_rules.some((r) => r.id === 'FR-032'));
});

// ---------------------------------------------------------------------------
// 4. Scoring & recommended_action
// ---------------------------------------------------------------------------

test('41. low-severity single hit yields allow', () => {
  const ctx = baseCtx({
    invoice: { ...baseCtx().invoice, description: 'misc' }, // FR-027 sev=3 only
  });
  const res = evaluateRules(ctx);
  assert.equal(res.recommended_action, 'allow');
  assert.ok(res.risk_score < 25);
});

test('42. single high-severity triggers review or block', () => {
  const ctx = baseCtx({
    employee: {
      id: 'E-1',
      tz: '000000018',
      address: 'X',
      active_bank_account: 'A',
      expected_bank_account: 'B',
    },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.risk_score >= 25);
  assert.ok(['review', 'block'].includes(res.recommended_action));
});

test('43. multiple severe hits trigger block', () => {
  const ctx = baseCtx({
    vendor: {
      ...baseCtx().vendor,
      created_at: '2026-04-08T00:00:00Z', // FR-002
      bank_account_changed_at: '2026-04-05T10:00:00Z', // FR-003
      address: 'Dizengoff 1, Tel Aviv',
    },
    employee: {
      id: 'E-1',
      tz: '000000018',
      address: 'Dizengoff 1, Tel Aviv', // FR-013
      active_bank_account: 'A',
      expected_bank_account: 'B', // FR-019
    },
    payment: {
      ...baseCtx().payment,
      destination_iban: 'RU02044525225040702810412345678901',
      destination_country: 'RU',
    },
  });
  const res = evaluateRules(ctx);
  assert.equal(res.recommended_action, 'block');
  assert.ok(res.risk_score >= 60);
});

test('44. risk_score is clamped to 100', () => {
  // Fabricate a ctx that hits nearly everything
  const ctx = baseCtx({
    vendor: {
      id: 'V-1',
      name: 'Offshore Holdings Consulting Ltd',
      israeli_registered: false,
      created_at: '2026-04-08T00:00:00Z',
      vat_id: '',
      vat_validated: false,
      bank_account: 'IL99',
      bank_account_changed_at: '2026-04-07T00:00:00Z',
      address: 'Same Street 1',
      created_by: 'U-1',
    },
    invoice: {
      id: 'I-1',
      number: 'INV-100',
      description: 'misc',
      amount: 4999,
      invoice_date: '2027-01-01T00:00:00Z',
      submitted_at: '2026-04-08T02:00:00Z',
      has_supporting_docs: false,
      supporting_docs_count: 0,
      purchase_order_id: null,
      approved_by: 'U-1',
      split_batch_id: 'b-1',
    },
    split_batch_total: 20000,
    payment: {
      initiated_at: '2026-04-05T02:00:00Z',
      amount: 9999,
      destination_iban: 'RU1',
      destination_country: 'RU',
    },
    employee: {
      id: 'E-1',
      tz: '123456789', // invalid
      address: 'Same Street 1',
      bank_accounts: ['IL99', 'IL88'],
      active_bank_account: 'IL99',
      expected_bank_account: 'IL88',
      overtime_hours: 200,
      standard_overtime_hours: 20,
    },
    related_employees: [{ id: 'E-2', tz: '123456789' }],
    related_invoices: [
      { id: 'x', vendor_id: 'V-OTHER', description: 'misc' },
    ],
    vendor_history: {
      recent_round_amounts: 10,
      round_amount_frequency_threshold: 3,
      recent_invoice_numbers: ['INV-100', 'INV-101', 'INV-102', 'INV-103'],
    },
  });
  const res = evaluateRules(ctx);
  assert.ok(res.risk_score <= 100);
  assert.equal(res.recommended_action, 'block');
});

test('45. thresholds: score>=25 -> review, >=60 -> block, else allow', () => {
  // weekend alone (sev 3) should remain allow
  const ctx = baseCtx({
    payment: { ...baseCtx().payment, initiated_at: '2026-04-11T10:00:00Z' },
    invoice: { ...baseCtx().invoice, submitted_at: '2026-04-11T10:00:00Z' },
  });
  const res = evaluateRules(ctx);
  assert.equal(res.recommended_action, 'allow');
});

// ---------------------------------------------------------------------------
// 5. addRule / custom rules
// ---------------------------------------------------------------------------

test('46. addRule registers a custom rule and it is used in evaluation', () => {
  const before = listRules().length;
  const rule = {
    id: 'CUSTOM-001',
    name_he: 'מותאם אישית',
    name_en: 'Custom rule',
    severity: 7,
    check: (ctx) => !!(ctx && ctx.custom_flag),
    message_he: 'הדלק המותאם אישית הודלק.',
    message_en: 'Custom flag was set.',
  };
  addRule(rule);
  assert.equal(listRules().length, before + 1);
  assert.ok(getRuleById('CUSTOM-001'));
  const res = evaluateRules({ custom_flag: true });
  assert.ok(res.triggered_rules.some((t) => t.id === 'CUSTOM-001'));
});

test('47. addRule rejects duplicate id', () => {
  assert.throws(() => addRule({
    id: 'FR-001',
    name_he: 'x',
    name_en: 'x',
    severity: 5,
    check: () => true,
    message_he: 'x',
    message_en: 'x',
  }));
});

test('48. addRule validates required fields and types', () => {
  assert.throws(() => addRule(null));
  assert.throws(() => addRule({}));
  assert.throws(() => addRule({
    id: 'BAD-1',
    name_he: 'x',
    name_en: 'x',
    severity: 15, // out of range
    check: () => true,
    message_he: 'x',
    message_en: 'x',
  }));
  assert.throws(() => addRule({
    id: 'BAD-2',
    name_he: 'x',
    name_en: 'x',
    severity: 5,
    check: 'not a function',
    message_he: 'x',
    message_en: 'x',
  }));
});

// ---------------------------------------------------------------------------
// 6. explainDecision
// ---------------------------------------------------------------------------

test('49. explainDecision returns Hebrew + English text', () => {
  const ctx = baseCtx({
    invoice: { ...baseCtx().invoice, amount: 4999 },
  });
  const res = evaluateRules(ctx);
  const exp = explainDecision(res);
  assert.ok(typeof exp.he === 'string' && exp.he.length > 0);
  assert.ok(typeof exp.en === 'string' && exp.en.length > 0);
  assert.ok(exp.he.includes('ציון סיכון'));
  assert.ok(exp.en.toLowerCase().includes('risk score'));
  assert.ok(exp.summary.triggered_count >= 1);
});

test('50. explainDecision reports allow when nothing triggered', () => {
  const res = evaluateRules(baseCtx());
  const exp = explainDecision(res);
  assert.equal(exp.summary.recommended_action, 'allow');
  assert.ok(exp.he.includes('אישור אוטומטי'));
  assert.ok(exp.en.includes('ALLOW'));
});

test('51. explainDecision throws on non-object', () => {
  assert.throws(() => explainDecision(null));
  assert.throws(() => explainDecision('x'));
});

// ---------------------------------------------------------------------------
// 7. Internal helpers (smoke)
// ---------------------------------------------------------------------------

test('52. isValidTZ: known valid and invalid IDs', () => {
  assert.equal(_internals.isValidTZ('000000018'), true);
  assert.equal(_internals.isValidTZ('123456789'), false);
  assert.equal(_internals.isValidTZ(''), false);
  assert.equal(_internals.isValidTZ(null), false);
});

test('53. isRoundAmount: basic cases', () => {
  assert.equal(_internals.isRoundAmount(10000, 0), true);
  assert.equal(_internals.isRoundAmount(20000, 0), true);
  assert.equal(_internals.isRoundAmount(999, 0), false);
  assert.equal(_internals.isRoundAmount(10050, 0), false);
  assert.equal(_internals.isRoundAmount(10050, 100), true);
});

test('54. countSequential counts near-sequential invoice numbers', () => {
  assert.ok(_internals.countSequential(['INV-100', 'INV-101', 'INV-103']) >= 2);
  assert.equal(_internals.countSequential(['INV-1', 'INV-500']), 0);
});

test('55. ibanCountry extracts ISO-2 prefix', () => {
  assert.equal(_internals.ibanCountry('IL620108000000099999999'), 'IL');
  assert.equal(_internals.ibanCountry('RU02044525225040702810412345678901'), 'RU');
  assert.equal(_internals.ibanCountry('xx'), 'XX');
  assert.equal(_internals.ibanCountry(''), null);
  assert.equal(_internals.ibanCountry(null), null);
});

test('56. normAddr lowercases and collapses whitespace', () => {
  assert.equal(
    _internals.normAddr('  Dizengoff  1, Tel-Aviv '),
    _internals.normAddr('dizengoff 1 tel aviv')
  );
});

// ---------------------------------------------------------------------------
// 8. Evaluation safety
// ---------------------------------------------------------------------------

test('57. a throwing custom rule does not break evaluateRules', () => {
  addRule({
    id: 'CUSTOM-THROW',
    name_he: 'זורק שגיאה',
    name_en: 'Throws',
    severity: 1,
    check: () => { throw new Error('boom'); },
    message_he: 'x',
    message_en: 'x',
  });
  const res = evaluateRules(baseCtx());
  // rule should not appear in triggered (check returned falsy via thrown error)
  assert.ok(!res.triggered_rules.some((r) => r.id === 'CUSTOM-THROW'));
  assert.equal(res.recommended_action, 'allow');
});

test('58. triggered_rules entries carry severity and bilingual names', () => {
  const ctx = baseCtx({
    invoice: { ...baseCtx().invoice, amount: 4999 },
  });
  const res = evaluateRules(ctx);
  const t = res.triggered_rules.find((r) => r.id === 'FR-001');
  assert.ok(t);
  assert.equal(typeof t.severity, 'number');
  assert.ok(t.name_he.length > 0);
  assert.ok(t.name_en.length > 0);
  assert.ok(t.message_he.length > 0);
  assert.ok(t.message_en.length > 0);
});
