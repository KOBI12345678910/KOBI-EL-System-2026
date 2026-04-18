/**
 * Test fixtures — barrel export.
 *
 * Usage:
 *   const { makeEmployer, makeEmployee, makeTimesheet, seed } = require('./test/fixtures');
 *   seed(42);  // reproducible runs
 *   const emp = makeEmployee({ employment_type: 'monthly' });
 *
 * All factories return plain JS objects whose shapes match the real
 * Supabase schema columns consumed by:
 *   - src/payroll/wage-slip-calculator.js
 *   - src/payroll/payroll-routes.js
 *   - src/vat/vat-routes.js
 *   - src/bank/bank-routes.js
 *
 * Zero external dependencies. Deterministic when you call seed(n).
 */

'use strict';

const {
  makeSupplier,
  seed,
  rand,
  randInt,
  pick,
  money,
  generateIsraeliId,
  isValidIsraeliId,
  israeliIdCheckDigit,
  generateCompanyId,
} = require('./suppliers');
const { makeEmployer } = require('./employers');
const { makeEmployee } = require('./employees');
const { makeTimesheet } = require('./timesheets');
const { makeWageSlip } = require('./wage-slips');
const { makeInvoice } = require('./invoices');
const { makePurchaseOrder } = require('./purchase-orders');
const { makePayment } = require('./payments');
const { makeVatTransaction } = require('./vat-transactions');

module.exports = {
  // factories
  makeSupplier,
  makeEmployer,
  makeEmployee,
  makeTimesheet,
  makeWageSlip,
  makeInvoice,
  makePurchaseOrder,
  makePayment,
  makeVatTransaction,

  // deterministic PRNG + helpers
  seed,
  rand,
  randInt,
  pick,
  money,

  // Israeli ID helpers (Luhn-valid ת.ז)
  generateIsraeliId,
  isValidIsraeliId,
  israeliIdCheckDigit,
  generateCompanyId,
};
