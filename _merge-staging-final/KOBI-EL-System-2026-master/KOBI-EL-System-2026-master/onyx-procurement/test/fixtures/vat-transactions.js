/**
 * Test fixture factory — VAT transactions (vat_periods summary row)
 * Matches `vat_periods` schema in 004-vat-module.sql and the computed
 * totals object returned by src/vat/vat-routes.js GET /api/vat/periods/:id.
 *
 * Money fields are Numbers with 2 decimals.
 */

'use strict';

const {
  randInt,
  money,
} = require('./suppliers');

let _vatSeq = 0;

function makeVatTransaction(overrides = {}) {
  _vatSeq += 1;
  const period_start = overrides.period_start || '2026-04-01';
  const period_end = overrides.period_end || '2026-04-30';
  const period_label = overrides.period_label || '2026-04';

  const taxable_sales = money(randInt(10000, 300000));
  const zero_rate_sales = money(randInt(0, 20000));
  const exempt_sales = money(randInt(0, 5000));
  const vat_on_sales = money(taxable_sales * 0.17);

  const taxable_purchases = money(randInt(5000, 150000));
  const vat_on_purchases = money(taxable_purchases * 0.17);
  const asset_purchases = money(randInt(0, 30000));
  const vat_on_assets = money(asset_purchases * 0.17);

  const net_vat_payable = money(vat_on_sales - vat_on_purchases - vat_on_assets);
  const is_refund = net_vat_payable < 0;

  return {
    id: overrides.id || _vatSeq,
    period_start,
    period_end,
    period_label,
    status: 'open',

    // Outputs (עסקאות / מכירות)
    taxable_sales,
    zero_rate_sales,
    exempt_sales,
    vat_on_sales,

    // Inputs (תשומות / קניות)
    taxable_purchases,
    vat_on_purchases,
    asset_purchases,
    vat_on_assets,

    // Net
    net_vat_payable,
    is_refund,

    // Submission
    submitted_at: null,
    submission_reference: null,
    pcn836_payload: null,
    pcn836_file_path: null,

    // Audit
    prepared_by: 'factory',
    reviewed_by: null,
    locked_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),

    ...overrides,
  };
}

module.exports = { makeVatTransaction };
