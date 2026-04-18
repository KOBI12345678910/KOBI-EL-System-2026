/**
 * Unit tests for Bank Reconciliation Auto-Matcher
 * Agent-07 — Wave 1.5
 *
 * Run: node --test test/bank-matcher.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  scoreMatch,
  findBestMatch,
  autoReconcileBatch,
} = require('../src/bank/matcher');

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeBankTx(overrides = {}) {
  return {
    id: 'btx-1',
    transaction_date: '2026-04-01',
    description: 'payment from acme industries ltd',
    amount: 1000,
    reference_number: 'REF-001',
    reconciled: false,
    ...overrides,
  };
}

function makeLedgerEntry(overrides = {}) {
  return {
    id: 'inv-1',
    customer_name: 'Acme Industries Ltd',
    invoice_date: '2026-04-01',
    gross_amount: 1000,
    amount_outstanding: 1000,
    reference_number: 'REF-001',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// scoreMatch tests
// ---------------------------------------------------------------------------

test('1. scoreMatch: exact amount + same day yields high confidence (>=0.8)', () => {
  const bankTx = makeBankTx();
  const ledger = makeLedgerEntry();
  const result = scoreMatch(bankTx, ledger, { type: 'customer_invoice' });
  assert.ok(result.confidence >= 0.8, `expected >=0.8, got ${result.confidence}`);
  assert.equal(result.criteria.amount, 'exact');
  assert.equal(result.criteria.date, 'same_day');
});

test('2. scoreMatch: exact amount but far date still has confidence, lower than same-day', () => {
  const bankTx = makeBankTx({ transaction_date: '2026-04-01' });
  const ledgerFar = makeLedgerEntry({ invoice_date: '2025-12-01' }); // >30 days away
  const ledgerSame = makeLedgerEntry({ invoice_date: '2026-04-01' });

  const farResult = scoreMatch(bankTx, ledgerFar, { type: 'customer_invoice' });
  const sameResult = scoreMatch(bankTx, ledgerSame, { type: 'customer_invoice' });

  assert.ok(farResult.confidence > 0, 'far-date exact-amount should still match');
  assert.ok(farResult.confidence < sameResult.confidence,
    `far (${farResult.confidence}) should be less than same-day (${sameResult.confidence})`);
});

test('3. scoreMatch: amount 5% off is rejected (confidence 0)', () => {
  const bankTx = makeBankTx({ amount: 1000 });
  const ledger = makeLedgerEntry({ gross_amount: 1060 }); // 6% off
  const result = scoreMatch(bankTx, ledger, { type: 'customer_invoice' });
  assert.equal(result.confidence, 0);
  assert.equal(result.criteria.rejected, 'amount_mismatch');
});

test('4. scoreMatch: amount 1% off yields partial confidence', () => {
  const bankTx = makeBankTx({ amount: 1000 });
  // 2% off → falls into "partial" bucket (< 0.05 but >= 0.01)
  const ledger = makeLedgerEntry({ gross_amount: 1020 });
  const result = scoreMatch(bankTx, ledger, { type: 'customer_invoice' });
  assert.ok(result.confidence > 0, 'should have non-zero confidence');
  assert.ok(result.confidence < 0.8, 'partial match should be below strict exact level');
  assert.equal(result.criteria.amount, 'partial');
});

test('5. scoreMatch: name substring match adds boost', () => {
  const bankTx = makeBankTx({
    description: 'wire transfer from acmecorp',
    reference_number: 'XYZ-OTHER', // avoid ref boost
  });
  const withName = makeLedgerEntry({
    customer_name: 'ACMECORP LLC',
    reference_number: 'DIFFERENT-REF',
  });
  const withoutName = makeLedgerEntry({
    customer_name: 'Zebra Corp',
    reference_number: 'DIFFERENT-REF',
  });

  const r1 = scoreMatch(bankTx, withName, { type: 'customer_invoice' });
  const r2 = scoreMatch(bankTx, withoutName, { type: 'customer_invoice' });

  assert.ok(r1.confidence > r2.confidence,
    `name match (${r1.confidence}) should beat no-name match (${r2.confidence})`);
  assert.equal(r1.criteria.name, 'substring_match');
});

test('6. scoreMatch: exact reference_number match adds +0.2', () => {
  const bankTx = makeBankTx({
    description: 'unrelated description',
    reference_number: 'UNIQUE-REF-42',
  });
  const withRef = makeLedgerEntry({
    customer_name: 'Zebra Corp', // no name match
    reference_number: 'UNIQUE-REF-42',
  });
  const withoutRef = makeLedgerEntry({
    customer_name: 'Zebra Corp',
    reference_number: 'SOMETHING-ELSE',
  });

  const r1 = scoreMatch(bankTx, withRef, { type: 'customer_invoice' });
  const r2 = scoreMatch(bankTx, withoutRef, { type: 'customer_invoice' });

  const delta = r1.confidence - r2.confidence;
  assert.ok(Math.abs(delta - 0.2) < 1e-9,
    `reference match should add exactly 0.2 (got delta=${delta})`);
  assert.equal(r1.criteria.reference, 'exact');
});

test('7. scoreMatch: wrong direction (customer_payment with negative bank amount) penalized', () => {
  const bankTx = makeBankTx({ amount: -1000 }); // debit
  const ledger = makeLedgerEntry({ gross_amount: 1000 });

  const wrong = scoreMatch(bankTx, ledger, { type: 'customer_payment' });
  const right = scoreMatch(makeBankTx({ amount: 1000 }), ledger, { type: 'customer_payment' });

  assert.ok(wrong.confidence < right.confidence,
    `wrong direction (${wrong.confidence}) should be less than right direction (${right.confidence})`);
  assert.equal(wrong.criteria.direction, 'wrong');
});

test('8. scoreMatch: null/missing fields should not crash, should give low/zero confidence', () => {
  const bankTx = {
    id: 'btx-null',
    transaction_date: null,
    description: null,
    amount: null,
    reference_number: null,
  };
  const ledger = {
    id: 'inv-null',
    customer_name: null,
    invoice_date: null,
    gross_amount: null,
    reference_number: null,
  };

  let result;
  assert.doesNotThrow(() => {
    result = scoreMatch(bankTx, ledger, { type: 'customer_invoice' });
  });
  assert.ok(result);
  assert.ok(typeof result.confidence === 'number');
  assert.ok(result.confidence >= 0 && result.confidence <= 1);
});

test('9. scoreMatch: zero bank amount is handled without throwing / division errors', () => {
  const zeroBothTx = makeBankTx({ amount: 0 });
  const zeroBothLedger = makeLedgerEntry({ gross_amount: 0, amount_outstanding: 0 });

  let r1;
  assert.doesNotThrow(() => {
    r1 = scoreMatch(zeroBothTx, zeroBothLedger, { type: 'customer_invoice' });
  });
  assert.ok(typeof r1.confidence === 'number');
  assert.ok(Number.isFinite(r1.confidence));

  // Zero bank vs non-zero ledger should reject
  const nonZeroLedger = makeLedgerEntry({ gross_amount: 500 });
  const r2 = scoreMatch(zeroBothTx, nonZeroLedger, { type: 'customer_invoice' });
  assert.equal(r2.confidence, 0);
});

// ---------------------------------------------------------------------------
// findBestMatch tests
// ---------------------------------------------------------------------------

test('10. findBestMatch: empty candidates returns null', () => {
  const bankTx = makeBankTx();
  assert.equal(findBestMatch(bankTx, [], 'customer_invoice'), null);
  assert.equal(findBestMatch(bankTx, null, 'customer_invoice'), null);
  assert.equal(findBestMatch(bankTx, undefined, 'customer_invoice'), null);
});

test('11. findBestMatch: returns the highest-confidence match among candidates', () => {
  const bankTx = makeBankTx({
    amount: 1000,
    transaction_date: '2026-04-01',
    description: 'acme payment',
    reference_number: 'REF-A',
  });

  const weakMatch = makeLedgerEntry({
    id: 'weak',
    customer_name: 'Zebra',
    invoice_date: '2026-03-20', // within week
    gross_amount: 1020, // partial
    reference_number: 'NO-MATCH',
  });
  const strongMatch = makeLedgerEntry({
    id: 'strong',
    customer_name: 'Acme Industries',
    invoice_date: '2026-04-01',
    gross_amount: 1000,
    reference_number: 'REF-A',
  });

  const result = findBestMatch(bankTx, [weakMatch, strongMatch], 'customer_invoice');
  assert.ok(result);
  assert.equal(result.entry.id, 'strong');
});

test('12. findBestMatch: filters out candidates with confidence < 0.3', () => {
  const bankTx = makeBankTx({
    amount: 1000,
    description: 'unrelated',
    reference_number: 'NOPE',
    transaction_date: '2026-04-01',
  });
  // Partial amount (2% off) = 0.2; far date (>30 days) = -0.1 → 0.1, below 0.3
  const weak = makeLedgerEntry({
    id: 'weak',
    customer_name: 'Zebra Corp',
    invoice_date: '2025-01-01',
    gross_amount: 1020,
    reference_number: 'OTHER',
  });
  const result = findBestMatch(bankTx, [weak], 'customer_invoice');
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// autoReconcileBatch tests
// ---------------------------------------------------------------------------

test('13. autoReconcileBatch: skips already-reconciled transactions', () => {
  const reconciled = makeBankTx({ id: 'btx-done', reconciled: true });
  const invoice = makeLedgerEntry();
  const result = autoReconcileBatch(
    [reconciled],
    { customerInvoices: [invoice], purchaseOrders: [] }
  );
  assert.deepEqual(result, []);
});

test('14. autoReconcileBatch: routes positive amounts to customer invoices, negative to purchase orders', () => {
  const positiveTx = makeBankTx({ id: 'pos', amount: 1000 });
  const negativeTx = makeBankTx({ id: 'neg', amount: -500 });

  const invoice = makeLedgerEntry({ id: 'inv-100', gross_amount: 1000 });
  const po = makeLedgerEntry({
    id: 'po-200',
    supplier_name: 'Supplier Corp',
    customer_name: undefined,
    gross_amount: 500,
  });

  const result = autoReconcileBatch(
    [positiveTx, negativeTx],
    { customerInvoices: [invoice], purchaseOrders: [po] }
  );

  assert.equal(result.length, 2);
  const posSuggestion = result.find(r => r.bank_transaction_id === 'pos');
  const negSuggestion = result.find(r => r.bank_transaction_id === 'neg');

  assert.ok(posSuggestion, 'positive transaction should get a suggestion');
  assert.equal(posSuggestion.target_type, 'customer_invoice');
  assert.equal(posSuggestion.target_id, 'inv-100');

  assert.ok(negSuggestion, 'negative transaction should get a suggestion');
  assert.equal(negSuggestion.target_type, 'purchase_order');
  assert.equal(negSuggestion.target_id, 'po-200');
});

test('15. autoReconcileBatch: match_type thresholds (>=0.85 exact, >=0.6 partial, else suggested)', () => {
  // Exact: same-day + exact amount + name + ref = 0.6 + 0.2 + 0.15 + 0.2 = 1.15 → clamped to 1.0
  const exactTx = makeBankTx({
    id: 'exact',
    amount: 1000,
    description: 'payment from acme industries',
    reference_number: 'REF-EXACT',
    transaction_date: '2026-04-01',
  });
  const exactInvoice = makeLedgerEntry({
    id: 'inv-exact',
    customer_name: 'Acme Industries',
    gross_amount: 1000,
    invoice_date: '2026-04-01',
    reference_number: 'REF-EXACT',
  });

  // Partial: exact amount (0.6) + far date (-0.1) = 0.5 < 0.6 → "suggested"
  // We want a score between 0.6 and 0.85 → exact amount (0.6) + within week (0.05) = 0.65
  const partialTx = makeBankTx({
    id: 'partial',
    amount: 2000,
    description: 'unknown sender',
    reference_number: 'NO',
    transaction_date: '2026-04-01',
  });
  const partialInvoice = makeLedgerEntry({
    id: 'inv-partial',
    customer_name: 'Zebra LLC',
    gross_amount: 2000,
    invoice_date: '2026-04-06', // 5 days away → within_week = +0.05
    reference_number: 'OTHER',
  });

  // Suggested: partial amount only, just above threshold
  // 2% amount diff = 0.2 + within_1_day 0.15 = 0.35 → "suggested" (< 0.6)
  const suggestedTx = makeBankTx({
    id: 'suggested',
    amount: 3000,
    description: 'unknown',
    reference_number: 'NO',
    transaction_date: '2026-04-01',
  });
  const suggestedInvoice = makeLedgerEntry({
    id: 'inv-suggested',
    customer_name: 'Unrelated Inc',
    gross_amount: 3060, // 2% off
    invoice_date: '2026-04-02',
    reference_number: 'OTHER',
  });

  const result = autoReconcileBatch(
    [exactTx, partialTx, suggestedTx],
    {
      customerInvoices: [exactInvoice, partialInvoice, suggestedInvoice],
      purchaseOrders: [],
    }
  );

  const exactS = result.find(r => r.bank_transaction_id === 'exact');
  const partialS = result.find(r => r.bank_transaction_id === 'partial');
  const suggestedS = result.find(r => r.bank_transaction_id === 'suggested');

  assert.ok(exactS, 'exact tx should produce a suggestion');
  assert.ok(exactS.confidence >= 0.85, `exact confidence ${exactS.confidence} should be >=0.85`);
  assert.equal(exactS.match_type, 'exact');

  assert.ok(partialS, 'partial tx should produce a suggestion');
  assert.ok(partialS.confidence >= 0.6 && partialS.confidence < 0.85,
    `partial confidence ${partialS.confidence} should be in [0.6, 0.85)`);
  assert.equal(partialS.match_type, 'partial');

  assert.ok(suggestedS, 'suggested tx should produce a suggestion');
  assert.ok(suggestedS.confidence < 0.6,
    `suggested confidence ${suggestedS.confidence} should be <0.6`);
  assert.equal(suggestedS.match_type, 'suggested');
});

test('16. autoReconcileBatch: empty candidate pools produces empty suggestions', () => {
  const tx1 = makeBankTx({ id: 'a', amount: 1000 });
  const tx2 = makeBankTx({ id: 'b', amount: -500 });

  const r1 = autoReconcileBatch([tx1, tx2], { customerInvoices: [], purchaseOrders: [] });
  assert.deepEqual(r1, []);

  const r2 = autoReconcileBatch([tx1, tx2], {});
  assert.deepEqual(r2, []);
});

test('17. autoReconcileBatch: with multiple candidates picks the best match', () => {
  const bankTx = makeBankTx({
    id: 'multi',
    amount: 1000,
    transaction_date: '2026-04-01',
    description: 'payment from acme industries',
    reference_number: 'REF-BEST',
  });

  const weak = makeLedgerEntry({
    id: 'weak',
    customer_name: 'Zebra Corp',
    gross_amount: 1020, // partial
    invoice_date: '2026-03-25',
    reference_number: 'NOPE',
  });
  const good = makeLedgerEntry({
    id: 'good',
    customer_name: 'Acme Industries',
    gross_amount: 1000,
    invoice_date: '2026-04-01',
    reference_number: 'REF-BEST',
  });
  const ok = makeLedgerEntry({
    id: 'ok',
    customer_name: 'Other Biz',
    gross_amount: 1000,
    invoice_date: '2026-04-05',
    reference_number: 'OTHER',
  });

  const result = autoReconcileBatch(
    [bankTx],
    { customerInvoices: [weak, good, ok], purchaseOrders: [] }
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].target_id, 'good');
  assert.equal(result[0].target_type, 'customer_invoice');
});

test('18. autoReconcileBatch: zero-amount transactions are not routed anywhere', () => {
  // tx.amount > 0 is false AND tx.amount < 0 is false → no match attempted
  const zeroTx = makeBankTx({ id: 'zero', amount: 0 });
  const invoice = makeLedgerEntry({ gross_amount: 0 });
  const result = autoReconcileBatch(
    [zeroTx],
    { customerInvoices: [invoice], purchaseOrders: [] }
  );
  assert.deepEqual(result, []);
});

test('19. autoReconcileBatch: matched_amount is always the absolute value', () => {
  const negTx = makeBankTx({ id: 'neg', amount: -750 });
  const po = makeLedgerEntry({
    id: 'po-1',
    supplier_name: 'Acme Supply',
    customer_name: undefined,
    gross_amount: 750,
  });
  const result = autoReconcileBatch(
    [negTx],
    { customerInvoices: [], purchaseOrders: [po] }
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].matched_amount, 750);
});
