/**
 * Test fixture factory — tax invoices
 * Matches `tax_invoices` schema in 004-vat-module.sql,
 * also compatible with `customer_invoices` (005-annual-tax-module.sql).
 *
 * Used by src/vat/vat-routes.js POST /api/vat/invoices, which auto-fills
 * vat_amount from net_amount × vat_rate if vat_amount is missing.
 *
 * Hard requirements:
 *   money fields are Numbers with 2 decimals, not strings
 *   net_amount + vat_amount === gross_amount (within rounding)
 */

'use strict';

const {
  randInt,
  pick,
  money,
  generateCompanyId,
} = require('./suppliers');

const COUNTERPARTY_NAMES = [
  'אלקטרה בע"מ',
  'חומרי בניין הדר',
  'MegaSteel Industries',
  'טכנולוגיות אור',
  'NorthPipe Trading',
];

const CATEGORIES = ['goods', 'services', 'asset'];

let _invoiceSeq = 0;

function makeInvoice(overrides = {}) {
  _invoiceSeq += 1;
  const direction = overrides.direction || 'input';
  const invoice_type = direction === 'output' ? 'issued' : 'received';
  const vat_rate = 0.17;

  const net_amount = money(randInt(500, 50000));
  const vat_amount = money(net_amount * vat_rate);
  const gross_amount = money(net_amount + vat_amount);

  return {
    id: overrides.id || _invoiceSeq,
    invoice_type,
    direction,
    invoice_number: `INV-${String(_invoiceSeq).padStart(6, '0')}`,
    invoice_date: '2026-04-01',
    value_date: '2026-04-01',
    counterparty_id: generateCompanyId(),
    counterparty_name: pick(COUNTERPARTY_NAMES),
    counterparty_address: 'רחוב הרצל 1, תל אביב',
    net_amount,
    vat_rate,
    vat_amount,
    gross_amount,
    currency: 'ILS',
    fx_rate: 1.0,
    category: pick(CATEGORIES),
    is_asset: false,
    is_zero_rate: false,
    is_exempt: false,
    vat_period_id: null,
    accounting_period: '2026-04',
    allocation_number: `AL${randInt(100000000, 999999999)}`,
    allocation_verified: false,
    source_type: 'manual',
    source_id: null,
    pdf_path: null,
    status: 'recorded',
    created_at: new Date().toISOString(),
    created_by: 'factory',
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

module.exports = { makeInvoice };
