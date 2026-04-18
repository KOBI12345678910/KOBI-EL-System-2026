/**
 * QA-05 — Regression Agent
 * Area: Bank reconciliation matcher (legacy Wave 1.5 / B-11)
 *
 * Purpose:
 *   Pin the confidence-scoring heuristic used by the bank auto-matcher.
 *   The matcher's output drives the "Suggested Match" UI — drift here causes
 *   silent mis-reconciliations. These tests lock the score bands that the
 *   UI currently keys off (0.85+ "exact", 0.6+ "partial", 0.3+ "suggested").
 *
 * Run:
 *   node --test test/regression/qa-05-bank-matcher.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  scoreMatch,
  findBestMatch,
  autoReconcileBatch,
} = require(path.resolve(__dirname, '..', '..', 'src', 'bank', 'matcher.js'));

// ─── 1. scoreMatch — amount exactness gates the whole score ────────────

test('QA-05 bank.matcher: exact amount + same day + ref + name → confidence 1.0', () => {
  const bank = {
    id: 1,
    amount: 1000,
    transaction_date: '2026-04-01',
    description: 'acme ltd payment',
    reference_number: 'REF-1',
  };
  const ledger = {
    id: 10,
    amount: 1000,
    payment_date: '2026-04-01',
    customer_name: 'Acme Ltd',
    reference_number: 'REF-1',
  };
  const r = scoreMatch(bank, ledger, { type: 'customer_invoice' });
  assert.equal(r.confidence, 1, 'perfect match = 1.0');
  assert.equal(r.criteria.amount, 'exact');
  assert.equal(r.criteria.date, 'same_day');
  assert.equal(r.criteria.reference, 'exact');
});

test('QA-05 bank.matcher: 0.5% amount diff + same day → "close" @ baseline 0.6', () => {
  const bank = { id: 1, amount: 1005, transaction_date: '2026-04-01' };
  const ledger = { id: 10, amount: 1000, payment_date: '2026-04-01' };
  const r = scoreMatch(bank, ledger, { type: 'customer_invoice' });
  assert.equal(r.criteria.amount, 'close');
  assert.ok(r.confidence >= 0.55 && r.confidence <= 0.65, `expected ~0.6, got ${r.confidence}`);
});

test('QA-05 bank.matcher: >5% amount diff → rejected with 0 confidence', () => {
  const bank = { id: 1, amount: 1200, transaction_date: '2026-04-01' };
  const ledger = { id: 10, amount: 1000, payment_date: '2026-04-01' };
  const r = scoreMatch(bank, ledger, { type: 'customer_invoice' });
  assert.equal(r.confidence, 0);
  assert.equal(r.criteria.rejected, 'amount_mismatch');
});

test('QA-05 bank.matcher: wrong direction penalizes customer_payment with negative amount', () => {
  const bank = { id: 1, amount: -1000, transaction_date: '2026-04-01' };
  const ledger = { id: 10, amount: 1000, payment_date: '2026-04-01' };
  const r = scoreMatch(bank, ledger, { type: 'customer_payment' });
  // Direction wrong subtracts 0.3 — confidence starts at 0.6+0.2 then -0.3 → ~0.5
  assert.ok(r.confidence < 0.7, 'direction penalty must reduce confidence');
});

test('QA-05 bank.matcher: date > 30 days applies -0.1 penalty', () => {
  const bank = { id: 1, amount: 1000, transaction_date: '2026-04-01' };
  const ledger = { id: 10, amount: 1000, payment_date: '2026-01-01' };
  const r = scoreMatch(bank, ledger, { type: 'customer_invoice' });
  assert.equal(r.criteria.date, 'far_apart');
});

// ─── 2. findBestMatch — confidence threshold 0.3 ───────────────────────

test('QA-05 bank.matcher: findBestMatch returns null when no candidates above 0.3', () => {
  const bank = { id: 1, amount: 1000, transaction_date: '2026-04-01' };
  const candidates = [
    { id: 10, amount: 10000, payment_date: '2025-01-01' },  // wrong amount, far date
    { id: 11, amount: 500, payment_date: '2025-01-01' },    // wrong amount, far date
  ];
  const r = findBestMatch(bank, candidates, 'customer_invoice');
  assert.equal(r, null, 'nothing above threshold → null');
});

test('QA-05 bank.matcher: findBestMatch picks highest-confidence candidate', () => {
  const bank = { id: 1, amount: 1000, transaction_date: '2026-04-01' };
  const candidates = [
    { id: 10, amount: 1005, payment_date: '2026-04-05' },  // close
    { id: 11, amount: 1000, payment_date: '2026-04-01' },  // exact
    { id: 12, amount: 999,  payment_date: '2026-04-10' },  // close-ish
  ];
  const r = findBestMatch(bank, candidates, 'customer_invoice');
  assert.ok(r, 'must return a match');
  assert.equal(r.entry.id, 11, 'exact should win');
});

test('QA-05 bank.matcher: findBestMatch handles empty candidates', () => {
  const r = findBestMatch({ amount: 1000 }, [], 'customer_invoice');
  assert.equal(r, null);
});

// ─── 3. autoReconcileBatch — tiered classification ────────────────────

test('QA-05 bank.matcher: autoReconcileBatch classifies >=0.85 as "exact"', () => {
  const bank = [
    {
      id: 1,
      amount: 1000,
      transaction_date: '2026-04-01',
      description: 'acme',
      reference_number: 'REF-1',
    },
  ];
  const pools = {
    customerInvoices: [
      {
        id: 10,
        amount: 1000,
        payment_date: '2026-04-01',
        customer_name: 'Acme',
        reference_number: 'REF-1',
      },
    ],
  };
  const out = autoReconcileBatch(bank, pools);
  assert.equal(out.length, 1);
  assert.equal(out[0].match_type, 'exact');
  assert.ok(out[0].confidence >= 0.85);
});

test('QA-05 bank.matcher: autoReconcileBatch skips reconciled transactions', () => {
  const bank = [
    { id: 1, amount: 1000, transaction_date: '2026-04-01', reconciled: true },
  ];
  const pools = {
    customerInvoices: [{ id: 10, amount: 1000, payment_date: '2026-04-01' }],
  };
  const out = autoReconcileBatch(bank, pools);
  assert.equal(out.length, 0);
});

test('QA-05 bank.matcher: autoReconcileBatch routes negative amounts to purchaseOrders pool', () => {
  const bank = [
    {
      id: 1,
      amount: -500,
      transaction_date: '2026-04-01',
      description: 'beta supplier',
    },
  ];
  const pools = {
    customerInvoices: [{ id: 99, amount: 500, payment_date: '2026-04-01' }],
    purchaseOrders: [
      { id: 20, amount: 500, payment_date: '2026-04-01', supplier_name: 'Beta' },
    ],
  };
  const out = autoReconcileBatch(bank, pools);
  assert.equal(out.length, 1);
  assert.equal(out[0].target_type, 'purchase_order');
  assert.equal(out[0].target_id, 20);
});
