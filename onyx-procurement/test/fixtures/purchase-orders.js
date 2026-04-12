/**
 * Test fixture factory — purchase orders
 * Matches `purchase_orders` schema in 001-supabase-schema.sql.
 *
 * Used by src/bank/bank-routes.js auto-reconcile, which reads:
 *   id, supplier_name, total, created_at, status.
 */

'use strict';

const {
  randInt,
  pick,
  money,
} = require('./suppliers');

const SUPPLIERS = [
  'אלקטרה בע"מ',
  'חומרי בניין הדר',
  'MegaSteel Industries',
  'טכנולוגיות אור',
];

const STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'sent',
  'confirmed',
  'shipped',
  'delivered',
  'closed',
];

const SOURCES = ['manual', 'rfq', 'auction', 'auto_reorder', 'predictive', 'bundle'];

let _poSeq = 0;

function makePurchaseOrder(overrides = {}) {
  _poSeq += 1;
  const subtotal = money(randInt(1000, 80000));
  const delivery_fee = money(randInt(0, 500));
  const vat_amount = money((subtotal + delivery_fee) * 0.17);
  const total = money(subtotal + delivery_fee + vat_amount);

  return {
    id: overrides.id || `po-${String(_poSeq).padStart(4, '0')}`,
    rfq_id: null,
    supplier_id: `sup-${String(randInt(1, 10)).padStart(4, '0')}`,
    supplier_name: pick(SUPPLIERS),
    subtotal,
    delivery_fee,
    vat_amount,
    total,
    currency: 'ILS',
    payment_terms: 'שוטף + 30',
    expected_delivery: '2026-04-20',
    delivery_address: 'ריבל 37, תל אביב',
    requested_by: 'kobi',
    approved_by: 'kobi',
    approved_at: new Date().toISOString(),
    project_id: null,
    project_name: null,
    source: pick(SOURCES),
    status: pick(STATUSES),
    original_price: total,
    negotiated_savings: 0,
    negotiation_strategy: null,
    quality_score: null,
    quality_result: null,
    tracking_number: null,
    carrier: null,
    actual_delivery: null,
    notes: null,
    tags: [],
    sent_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

module.exports = { makePurchaseOrder };
