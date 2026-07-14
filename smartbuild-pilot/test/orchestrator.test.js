'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createStore } = require('../src/data/store');
const { seed } = require('../src/data/seed');
const { createEventBus } = require('../src/engines/event-bus');
const { createOrchestrator, ACTIONS } = require('../src/core/orchestrator');

function fresh() {
  const store = createStore();
  store.reset(seed);
  const bus = createEventBus(store);
  const orch = createOrchestrator(store, bus);
  return { store, bus, orch };
}

test('21 actions registered with metadata', () => {
  assert.equal(ACTIONS.length, 21);
  for (const a of ACTIONS) {
    assert.ok(a.id && a.label && a.entity && a.description);
    assert.ok(Array.isArray(a.preconditions) && Array.isArray(a.effects) && Array.isArray(a.emits));
  }
});

test('sign_sale creates a Sale-Law schedule summing to exactly 100%', () => {
  const { store, orch } = fresh();
  const r = orch.execute('sign_sale', { apartment_id: 'apt-30', buyer_id: 'buyer-20' });
  assert.ok(r.ok, r.error);
  const sale = r.result;
  assert.equal(sale.status, 'signed');
  assert.ok(sale.base_index_value > 100, 'base index set from cpi series');
  const items = store.find('payment_schedule_item', (i) => i.sale_id === sale.id);
  assert.equal(items.length, 7);
  const sum = items.reduce((a, i) => a + i.amount_base, 0);
  assert.equal(sum, sale.contract_price);
  assert.equal(store.get('apartment', 'apt-30').status, 'sold');
  assert.ok(r.events.includes('sale_signed'));
});

test('sign_sale guard: cannot sell a sold apartment', () => {
  const { orch } = fresh();
  const r = orch.execute('sign_sale', { apartment_id: 'apt-1', buyer_id: 'buyer-21' });
  assert.equal(r.ok, false);
});

test('record_buyer_payment computes linkage beyond the 20% threshold', () => {
  const { store, orch } = fresh();
  // sale-2 (sign 2025-02, מדד בסיס נמוך) — לשלם את הפריט הפתוח הבא שמעבר ל-20%
  const items = store.find('payment_schedule_item', (i) => i.sale_id === 'sale-2').sort((a, b) => a.seq - b.seq);
  const unpaid = items.find((i) => i.status !== 'paid');
  assert.ok(unpaid, 'sale-2 must have an unpaid item');
  const paidBase = items.filter((i) => i.status === 'paid').reduce((a, i) => a + i.amount_base, 0);
  assert.ok(paidBase >= 0.2 * store.get('sale', 'sale-2').contract_price, 'past the 20% threshold');
  const r = orch.execute('record_buyer_payment', { schedule_item_id: unpaid.id, pay_date: '2026-07-14' });
  assert.ok(r.ok, r.error);
  assert.ok(r.result.linkage_amount > 0, 'linkage must be positive when index rose since signing');
  assert.equal(r.result.amount_paid, unpaid.amount_base + r.result.linkage_amount);
  assert.equal(store.get('payment_schedule_item', unpaid.id).status, 'paid');
});

test('approve_budget_transfer guards source availability', () => {
  const { store, orch } = fresh();
  const req = orch.execute('request_budget_transfer', {
    from_budget_item_id: 'bl-contingency', to_budget_item_id: 'bl-parking', amount: 99999999,
  });
  assert.ok(req.ok);
  const r = orch.execute('approve_budget_transfer', { transfer_id: req.result.id });
  assert.equal(r.ok, false);
  assert.match(r.error, /זמינות/);
  // סכום חוקי עובר
  const req2 = orch.execute('request_budget_transfer', {
    from_budget_item_id: 'bl-contingency', to_budget_item_id: 'bl-parking', amount: 500000,
  });
  const r2 = orch.execute('approve_budget_transfer', { transfer_id: req2.result.id });
  assert.ok(r2.ok, r2.error);
  assert.equal(store.get('budget_item', 'bl-parking').transferred_in, 750000 + 500000);
});

test('drawdown_loan cannot exceed facility', () => {
  const { store, orch } = fresh();
  const over = orch.execute('drawdown_loan', { loan_id: 'loan-1', amount: 60000001 }); // 41M drawn of 95M
  assert.equal(over.ok, false);
  const ok = orch.execute('drawdown_loan', { loan_id: 'loan-1', amount: 4000000 });
  assert.ok(ok.ok);
  assert.equal(store.get('loan', 'loan-1').drawn_amount, 45000000);
});

test('award_tender creates the full chain: bids, contract, committed, events', () => {
  const { store, bus, orch } = fresh();
  const before = store.get('budget_item', 'bl-finishes').committed_amount;
  const r = orch.execute('award_tender', { tender_id: 'tender-2', bid_id: 'bid-6' });
  assert.ok(r.ok, r.error);
  assert.equal(store.get('tender', 'tender-2').status, 'awarded');
  assert.equal(store.get('bid', 'bid-6').status, 'won');
  assert.equal(store.get('bid', 'bid-5').status, 'lost');
  assert.equal(r.result.contract_sum, 23100000);
  assert.equal(store.get('budget_item', 'bl-finishes').committed_amount, before + 23100000);
  const types = bus.ledger().map((e) => e.event_type);
  assert.ok(types.includes('tender_awarded') && types.includes('commitment_created'));
});

test('payment request lifecycle updates the budget line', () => {
  const { store, orch } = fresh();
  const line = () => store.get('budget_item', 'bl-systems');
  const inv0 = line().invoiced_amount;
  const paid0 = line().paid_amount;
  const sub = orch.execute('submit_payment_request', { contract_id: 'contract-2', amount_requested: 1500000 });
  assert.ok(sub.ok);
  const app = orch.execute('approve_payment_request', { payment_request_id: sub.result.id, amount_approved: 1400000 });
  assert.ok(app.ok);
  assert.equal(line().invoiced_amount, inv0 + 1400000);
  const pay = orch.execute('pay_payment_request', { payment_request_id: sub.result.id });
  assert.ok(pay.ok);
  assert.equal(line().paid_amount, paid0 + 1400000);
  assert.ok(pay.events.includes('payment_executed'));
});

test('unknown action fails gracefully', () => {
  const { orch } = fresh();
  const r = orch.execute('fly_to_moon', {});
  assert.equal(r.ok, false);
});
