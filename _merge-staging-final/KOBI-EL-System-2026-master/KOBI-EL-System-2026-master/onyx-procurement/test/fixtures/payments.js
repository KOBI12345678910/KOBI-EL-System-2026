/**
 * Test fixture factory — payments
 * Matches `customer_payments` schema in 005-annual-tax-module.sql AND
 * doubles as a generic `bank_transactions` row (006-bank-reconciliation.sql),
 * which is what src/bank/matcher.js + bank-routes.js auto-reconcile consume.
 *
 * By default produces a customer-payment-shaped object; pass
 *   { kind: 'bank_tx' } for a bank-transaction-shaped object.
 */

'use strict';

const {
  randInt,
  pick,
  money,
} = require('./suppliers');

const METHODS = ['bank_transfer', 'check', 'cash', 'credit_card', 'standing_order', 'wire'];
const TX_TYPES = ['transfer', 'check', 'standing_order', 'direct_debit', 'card', 'fee'];

let _paymentSeq = 0;

function makePayment(overrides = {}) {
  _paymentSeq += 1;
  const { kind = 'customer_payment', ...rest } = overrides;

  if (kind === 'bank_tx') {
    // bank_transactions row (used by bank-reconciliation matcher)
    return {
      id: rest.id || _paymentSeq,
      bank_account_id: 1,
      bank_statement_id: 1,
      transaction_date: '2026-04-05',
      value_date: '2026-04-05',
      description: `תשלום ספק #${_paymentSeq}`,
      long_description: null,
      counterparty_name: 'אלקטרה בע"מ',
      counterparty_account: String(randInt(100000, 9999999)),
      reference_number: `REF-${randInt(100000, 999999)}`,
      amount: money(-1 * randInt(500, 25000)), // negative = debit (out)
      balance_after: money(randInt(10000, 500000)),
      transaction_type: pick(TX_TYPES),
      check_number: null,
      currency: 'ILS',
      reconciled: false,
      reconciled_at: null,
      reconciled_by: null,
      matched_to_type: null,
      matched_to_id: null,
      match_confidence: null,
      created_at: new Date().toISOString(),
      raw_data: {},
      ...rest,
    };
  }

  // default: customer_payments row (קבלה)
  const amount = money(randInt(500, 50000));
  return {
    id: rest.id || _paymentSeq,
    receipt_number: `RC-${String(_paymentSeq).padStart(6, '0')}`,
    payment_date: '2026-04-05',
    customer_id: 1,
    customer_name: 'חברת לקוח בע"מ',
    amount,
    currency: 'ILS',
    payment_method: pick(METHODS),
    bank_account_id: 1,
    check_number: null,
    check_bank: null,
    check_branch: null,
    check_account: null,
    check_value_date: null,
    reference_number: `REF-${randInt(100000, 999999)}`,
    invoice_ids: [1],
    notes: null,
    reconciled: false,
    reconciled_at: null,
    reconciled_by: null,
    created_at: new Date().toISOString(),
    created_by: 'factory',
    ...rest,
  };
}

module.exports = { makePayment };
