/**
 * RMA (Returns / Return Merchandise Authorization) — Unit Tests
 * =============================================================
 * בדיקות יחידה למנוע ההחזרות ואישורי ה-RMA
 *
 * Agent X-32  |  Swarm 3B  |  Techno-Kol Uzi mega-ERP
 *
 * Run with:    node --test test/payroll/rma.test.js
 *     or:      node test/run.js
 *
 * Requires Node >= 18 for the built-in `node:test` runner.
 *
 * Covers 25+ scenarios across:
 *   • RMA number formatting (RMA-YYYYMM-NNNN)
 *   • Reason code resolution (6 canonical + unknowns)
 *   • Auto-approval vs. manual approval
 *   • Consumer-law exclusions (חוק הגנת הצרכן)
 *   • Restocking fee math (5% cap ₪100, waived for seller fault)
 *   • Receive / inspect / dispositions
 *   • Credit note / refund / replacement
 *   • Audit trail append-only invariant
 *   • State machine guards (illegal transitions)
 *   • getRmaStats aggregation
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const rma = require(
  path.resolve(__dirname, '..', '..', 'src', 'returns', 'rma.js')
);

const {
  REASON_CODES,
  STATUS,
  DISPOSITION,
  CONDITION,
  REFUND_TYPES,
  EXCLUDED_CATEGORIES,
  DEFAULT_POLICY,
  LEGAL_TRANSITIONS,

  createRma,
  approveRma,
  receiveReturn,
  inspectItems,
  processRefund,
  closeRma,
  rejectRma,
  getRmaStats,

  getRma,
  listRmas,
  getAuditTrail,
  getShipBackInstructions,
  computeRestockingFee,
  isItemExcludedByConsumerLaw,
  resolveReason,

  createStore,
  setInvoiceGenerator,
  setInventoryHook,
  _internal,
} = rma;

const { formatRmaNumber, toYearMonth, daysBetween, round2, _shouldAutoApprove } =
  _internal;

// ─────────────────────────────────────────────────────────────
// Fixture helpers
// ─────────────────────────────────────────────────────────────

function makeItems(overrides) {
  return [
    {
      item_id: 'sku-001',
      description: 'כבל USB-C 2m',
      category: 'accessory',
      qty: 2,
      unit_price_ils: 50,
    },
    {
      item_id: 'sku-002',
      description: 'Wireless mouse',
      category: 'accessory',
      qty: 1,
      unit_price_ils: 150,
    },
    ...(overrides || []),
  ];
}

function makeB2CInvoice(ageDays, overrides) {
  const issued = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
  return {
    id: 'inv-b2c-001',
    customer_type: 'consumer',
    issued_at: issued.toISOString(),
    total_ils: 250,
    ...(overrides || {}),
  };
}

function makeB2BInvoice(ageDays, overrides) {
  const issued = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
  return {
    id: 'inv-b2b-001',
    customer_type: 'business',
    issued_at: issued.toISOString(),
    total_ils: 2500,
    ...(overrides || {}),
  };
}

function makeStore() {
  return createStore();
}

/** Drive an RMA all the way from createRma to closeRma. */
function driveHappyPath(store, reasonCode, invoice) {
  const items = makeItems();
  const id = createRma('cust-1', invoice.id, items, reasonCode, {
    store,
    invoice,
  });
  const rec = store.rmas.get(id);
  if (rec.status === STATUS.PENDING_APPROVAL) {
    approveRma(id, 'mgr-1', { store });
  }
  receiveReturn(
    id,
    items.map((it) => ({
      item_id: it.item_id,
      qty_received: it.qty,
      condition: CONDITION.NEW,
    })),
    { store }
  );
  inspectItems(
    id,
    items.map((it) => ({
      item_id: it.item_id,
      disposition: DISPOSITION.RESTOCK,
    })),
    { store }
  );
  const creditId = processRefund(id, REFUND_TYPES.CREDIT_NOTE, { store });
  closeRma(id, { store });
  return { id, creditId };
}

// ═════════════════════════════════════════════════════════════
// 01 — constants & formatters
// ═════════════════════════════════════════════════════════════

test('01 RMA number format — RMA-YYYYMM-NNNN with zero padding', () => {
  assert.equal(formatRmaNumber('202604', 1), 'RMA-202604-0001');
  assert.equal(formatRmaNumber('202604', 42), 'RMA-202604-0042');
  assert.equal(formatRmaNumber('202612', 9999), 'RMA-202612-9999');
});

test('02 toYearMonth produces UTC YYYYMM', () => {
  assert.equal(toYearMonth('2026-04-11T08:30:00Z'), '202604');
  assert.equal(toYearMonth('2026-01-01T00:00:00Z'), '202601');
  assert.equal(toYearMonth('2026-12-31T23:59:00Z'), '202612');
});

test('03 reason dictionary has 6 canonical codes with bilingual labels', () => {
  const codes = Object.values(REASON_CODES).map((r) => r.code);
  assert.equal(codes.length, 6);
  assert.ok(codes.includes('defective'));
  assert.ok(codes.includes('wrong_item'));
  assert.ok(codes.includes('wrong_qty'));
  assert.ok(codes.includes('damaged_in_transit'));
  assert.ok(codes.includes('customer_changed_mind'));
  assert.ok(codes.includes('warranty_claim'));
  for (const r of Object.values(REASON_CODES)) {
    assert.ok(r.label_he && r.label_he.length > 0, 'Hebrew label missing');
    assert.ok(r.label_en && r.label_en.length > 0, 'English label missing');
  }
});

test('04 resolveReason accepts strings, objects, rejects unknowns', () => {
  assert.equal(resolveReason('defective').code, 'defective');
  assert.equal(resolveReason(REASON_CODES.WARRANTY).code, 'warranty_claim');
  assert.throws(() => resolveReason('no_such_code'), /unknown reason code/);
  assert.throws(() => resolveReason(null), /reason is required/);
  assert.throws(() => resolveReason({ code: 'bogus' }), /unknown reason code/);
});

// ═════════════════════════════════════════════════════════════
// 05 — createRma happy path
// ═════════════════════════════════════════════════════════════

test('05 createRma generates RMA-YYYYMM-NNNN for a B2B invoice', () => {
  const store = makeStore();
  const inv = makeB2BInvoice(5);
  const id = createRma('cust-10', inv.id, makeItems(), 'defective', {
    store,
    invoice: inv,
  });
  const rec = getRma(id, { store });
  assert.ok(rec);
  assert.match(rec.rma_number, /^RMA-\d{6}-\d{4}$/);
  assert.equal(rec.customer_id, 'cust-10');
  assert.equal(rec.invoice_id, inv.id);
  assert.equal(rec.reason, 'defective');
  assert.ok(rec.reason_label_he.length > 0);
  assert.equal(rec.lines.length, 2);
  assert.equal(rec.lines[0].qty_requested, 2);
});

test('06 createRma — sequence increments per month', () => {
  const store = makeStore();
  const inv = makeB2BInvoice(1);
  const a = createRma('c1', inv.id, makeItems(), 'defective', { store, invoice: inv });
  const b = createRma('c2', inv.id, makeItems(), 'wrong_item', { store, invoice: inv });
  const c = createRma('c3', inv.id, makeItems(), 'damaged_in_transit', { store, invoice: inv });
  const aNum = getRma(a, { store }).rma_number;
  const bNum = getRma(b, { store }).rma_number;
  const cNum = getRma(c, { store }).rma_number;
  const seqA = parseInt(aNum.split('-')[2], 10);
  const seqB = parseInt(bNum.split('-')[2], 10);
  const seqC = parseInt(cNum.split('-')[2], 10);
  assert.equal(seqB - seqA, 1);
  assert.equal(seqC - seqB, 1);
});

test('07 createRma rejects empty items[] and missing ids', () => {
  const store = makeStore();
  assert.throws(
    () => createRma('', 'inv', makeItems(), 'defective', { store }),
    /customerId is required/
  );
  assert.throws(
    () => createRma('c', '', makeItems(), 'defective', { store }),
    /invoiceId is required/
  );
  assert.throws(
    () => createRma('c', 'inv', [], 'defective', { store }),
    /non-empty array/
  );
});

// ═════════════════════════════════════════════════════════════
// 08 — auto approval rules
// ═════════════════════════════════════════════════════════════

test('08 createRma auto-approves a defective B2B invoice within window', () => {
  const store = makeStore();
  const inv = makeB2BInvoice(5); // 5 days old
  const id = createRma('c', inv.id, makeItems(), 'defective', { store, invoice: inv });
  const rec = store.rmas.get(id);
  assert.equal(rec.status, STATUS.APPROVED);
  assert.ok(rec.approved_at);
  const events = getAuditTrail(id, { store });
  assert.ok(events.some((e) => e.meta && e.meta.auto === true));
});

test('09 warranty claims never auto-approve — always pending', () => {
  const store = makeStore();
  const inv = makeB2BInvoice(2);
  const id = createRma('c', inv.id, makeItems(), 'warranty_claim', { store, invoice: inv });
  assert.equal(store.rmas.get(id).status, STATUS.PENDING_APPROVAL);
});

test('10 invoices older than 30 days require manual approval', () => {
  const store = makeStore();
  const inv = makeB2BInvoice(45); // over AUTO_APPROVAL_DAYS
  const id = createRma('c', inv.id, makeItems(), 'defective', { store, invoice: inv });
  assert.equal(store.rmas.get(id).status, STATUS.PENDING_APPROVAL);
});

test('11 consumer invoice past 14-day window → manual approval', () => {
  const store = makeStore();
  const inv = makeB2CInvoice(20); // > 14
  const id = createRma('c', inv.id, makeItems(), 'customer_changed_mind', {
    store,
    invoice: inv,
  });
  assert.equal(store.rmas.get(id).status, STATUS.PENDING_APPROVAL);
});

// ═════════════════════════════════════════════════════════════
// 12 — consumer-law exclusions
// ═════════════════════════════════════════════════════════════

test('12 perishable / custom / opened_software items are excluded', () => {
  assert.ok(isItemExcludedByConsumerLaw({ category: 'perishable' }));
  assert.ok(isItemExcludedByConsumerLaw({ category: 'custom' }));
  assert.ok(isItemExcludedByConsumerLaw({ category: 'opened_software' }));
  assert.ok(!isItemExcludedByConsumerLaw({ category: 'accessory' }));
  assert.ok(isItemExcludedByConsumerLaw({ excluded: true }));
  assert.ok(EXCLUDED_CATEGORIES.length >= 3);
});

test('13 all-excluded consumer RMA rejected at creation time', () => {
  const store = makeStore();
  const inv = makeB2CInvoice(3);
  const items = [
    {
      item_id: 'cake-01',
      description: 'Birthday cake',
      category: 'perishable',
      qty: 1,
      unit_price_ils: 200,
    },
  ];
  assert.throws(
    () => createRma('c', inv.id, items, 'customer_changed_mind', { store, invoice: inv }),
    /excluded from 14-day consumer return/
  );
});

test('14 mixed excluded + eligible consumer items → RMA created with flag', () => {
  const store = makeStore();
  const inv = makeB2CInvoice(3);
  const items = [
    {
      item_id: 'cake-01',
      category: 'perishable',
      qty: 1,
      unit_price_ils: 200,
    },
    {
      item_id: 'sku-002',
      category: 'accessory',
      qty: 1,
      unit_price_ils: 150,
    },
  ];
  const id = createRma('c', inv.id, items, 'customer_changed_mind', {
    store,
    invoice: inv,
  });
  const rec = getRma(id, { store });
  assert.equal(rec.lines.length, 2);
  assert.equal(rec.lines[0].excluded_consumer_law, true);
  assert.equal(rec.lines[1].excluded_consumer_law, false);
});

// ═════════════════════════════════════════════════════════════
// 15 — restocking fee math
// ═════════════════════════════════════════════════════════════

test('15 restocking fee — 5% of total, waived for defective', () => {
  assert.equal(computeRestockingFee('defective', 500, DEFAULT_POLICY), 0);
  assert.equal(computeRestockingFee('wrong_item', 1000, DEFAULT_POLICY), 0);
  assert.equal(computeRestockingFee('warranty_claim', 500, DEFAULT_POLICY), 0);
  // Customer changed mind on 500 → 5% = 25, under cap
  assert.equal(computeRestockingFee('customer_changed_mind', 500, DEFAULT_POLICY), 25);
});

test('16 restocking fee cap — never more than ₪100', () => {
  // 5% of 5,000 = 250, cap at 100
  assert.equal(
    computeRestockingFee('customer_changed_mind', 5000, DEFAULT_POLICY),
    100
  );
  // 5% of 20,000 = 1,000, still cap at 100
  assert.equal(
    computeRestockingFee('customer_changed_mind', 20000, DEFAULT_POLICY),
    100
  );
  // 5% of 1,999 = 99.95, under cap
  assert.equal(
    computeRestockingFee('customer_changed_mind', 1999, DEFAULT_POLICY),
    99.95
  );
});

// ═════════════════════════════════════════════════════════════
// 17 — receive / inspect / state machine
// ═════════════════════════════════════════════════════════════

test('17 receiveReturn sets qty_received and transitions to received', () => {
  const store = makeStore();
  const inv = makeB2BInvoice(5);
  const items = makeItems();
  const id = createRma('c', inv.id, items, 'defective', { store, invoice: inv });
  receiveReturn(
    id,
    [
      { item_id: 'sku-001', qty_received: 2, condition: CONDITION.OPEN_BOX },
      { item_id: 'sku-002', qty_received: 1, condition: CONDITION.NEW },
    ],
    { store }
  );
  const rec = getRma(id, { store });
  assert.equal(rec.status, STATUS.RECEIVED);
  assert.equal(rec.lines[0].qty_received, 2);
  assert.equal(rec.lines[0].condition, CONDITION.OPEN_BOX);
  assert.ok(rec.received_at);
});

test('18 receiveReturn rejects qty_received > qty_requested', () => {
  const store = makeStore();
  const inv = makeB2BInvoice(5);
  const id = createRma('c', inv.id, makeItems(), 'defective', { store, invoice: inv });
  assert.throws(
    () =>
      receiveReturn(
        id,
        [{ item_id: 'sku-001', qty_received: 99, condition: CONDITION.NEW }],
        { store }
      ),
    /exceeds qty_requested/
  );
});

test('19 inspectItems validates condition and disposition', () => {
  const store = makeStore();
  const inv = makeB2BInvoice(5);
  const items = makeItems();
  const id = createRma('c', inv.id, items, 'defective', { store, invoice: inv });
  receiveReturn(
    id,
    items.map((it) => ({
      item_id: it.item_id,
      qty_received: it.qty,
      condition: CONDITION.NEW,
    })),
    { store }
  );
  assert.throws(
    () =>
      inspectItems(
        id,
        [{ item_id: 'sku-001', condition: 'bogus', disposition: DISPOSITION.RESTOCK }],
        { store }
      ),
    /invalid condition/
  );
  assert.throws(
    () =>
      inspectItems(
        id,
        [{ item_id: 'sku-001', disposition: 'melt' }],
        { store }
      ),
    /invalid disposition/
  );
  inspectItems(
    id,
    items.map((it) => ({
      item_id: it.item_id,
      disposition: DISPOSITION.RESTOCK,
    })),
    { store }
  );
  assert.equal(getRma(id, { store }).status, STATUS.INSPECTED);
});

test('20 inventory hook is called for every inspected line', () => {
  const store = makeStore();
  const calls = [];
  setInventoryHook((op) => {
    calls.push({ ...op });
    return op;
  });
  try {
    const inv = makeB2BInvoice(5);
    const items = makeItems();
    const id = createRma('c', inv.id, items, 'defective', { store, invoice: inv });
    receiveReturn(
      id,
      items.map((it) => ({
        item_id: it.item_id,
        qty_received: it.qty,
        condition: CONDITION.NEW,
      })),
      { store }
    );
    inspectItems(
      id,
      [
        { item_id: 'sku-001', disposition: DISPOSITION.RESTOCK },
        { item_id: 'sku-002', disposition: DISPOSITION.SCRAP },
      ],
      { store }
    );
    assert.equal(calls.length, 2);
    const actions = calls.map((c) => c.action).sort();
    assert.deepEqual(actions, ['restock', 'scrap']);
  } finally {
    setInventoryHook((op) => op); // reset
  }
});

// ═════════════════════════════════════════════════════════════
// 21 — refund / credit note flow
// ═════════════════════════════════════════════════════════════

test('21 processRefund issues a credit note via injected generator', () => {
  const store = makeStore();
  const captured = [];
  setInvoiceGenerator((rmaRec, amount) => {
    captured.push({ rma_number: rmaRec.rma_number, amount });
    return {
      id: 'CN-TEST-' + rmaRec.rma_number,
      rma_id: rmaRec.id,
      amount_ils: amount,
    };
  });
  try {
    const inv = makeB2BInvoice(5);
    const { id, creditId } = driveHappyPath(store, 'defective', inv);
    assert.ok(creditId.startsWith('CN-TEST-'));
    assert.equal(captured.length, 1);
    // items: 2 * 50 + 1 * 150 = 250, defective → no restocking fee
    assert.equal(captured[0].amount, 250);
    const rec = getRma(id, { store });
    assert.equal(rec.status, STATUS.CLOSED);
    assert.equal(rec.refund_subtotal_ils, 250);
    assert.equal(rec.refund_restocking_fee_ils, 0);
    assert.equal(rec.refund_net_ils, 250);
  } finally {
    // reset generator to default
    setInvoiceGenerator((r, a) => ({
      id: 'CN-' + r.rma_number,
      rma_id: r.id,
      amount_ils: a,
    }));
  }
});

test('22 processRefund applies restocking fee for changed-mind reason', () => {
  const store = makeStore();
  const inv = makeB2CInvoice(3); // inside 14-day window
  const items = [
    {
      item_id: 'sku-01',
      category: 'accessory',
      qty: 1,
      unit_price_ils: 800,
    },
  ];
  const id = createRma('c', inv.id, items, 'customer_changed_mind', {
    store,
    invoice: inv,
  });
  receiveReturn(
    id,
    [{ item_id: 'sku-01', qty_received: 1, condition: CONDITION.OPEN_BOX }],
    { store }
  );
  inspectItems(
    id,
    [{ item_id: 'sku-01', disposition: DISPOSITION.RESTOCK }],
    { store }
  );
  processRefund(id, REFUND_TYPES.CREDIT_NOTE, { store });
  const rec = getRma(id, { store });
  // 5% of 800 = 40, under cap
  assert.equal(rec.refund_subtotal_ils, 800);
  assert.equal(rec.refund_restocking_fee_ils, 40);
  assert.equal(rec.refund_net_ils, 760);
});

test('23 REPAIR lines do not contribute to refund amount', () => {
  const store = makeStore();
  const inv = makeB2BInvoice(5);
  const items = makeItems(); // 100 + 150 = 250
  const id = createRma('c', inv.id, items, 'defective', { store, invoice: inv });
  receiveReturn(
    id,
    items.map((it) => ({
      item_id: it.item_id,
      qty_received: it.qty,
      condition: CONDITION.USED,
    })),
    { store }
  );
  inspectItems(
    id,
    [
      { item_id: 'sku-001', disposition: DISPOSITION.REPAIR },
      { item_id: 'sku-002', disposition: DISPOSITION.RESTOCK },
    ],
    { store }
  );
  processRefund(id, REFUND_TYPES.CREDIT_NOTE, { store });
  const rec = getRma(id, { store });
  // Only sku-002 (150) is refunded
  assert.equal(rec.refund_subtotal_ils, 150);
});

test('24 replacement refund type issues no credit note', () => {
  const store = makeStore();
  const inv = makeB2BInvoice(5);
  const items = makeItems();
  const id = createRma('c', inv.id, items, 'defective', { store, invoice: inv });
  receiveReturn(
    id,
    items.map((it) => ({
      item_id: it.item_id,
      qty_received: it.qty,
      condition: CONDITION.DEFECTIVE,
    })),
    { store }
  );
  inspectItems(
    id,
    items.map((it) => ({ item_id: it.item_id, disposition: DISPOSITION.REPLACE })),
    { store }
  );
  const creditId = processRefund(id, REFUND_TYPES.REPLACEMENT, { store });
  assert.equal(creditId, '');
  const events = getAuditTrail(id, { store });
  assert.ok(events.some((e) => e.event === 'replacement_issued'));
});

// ═════════════════════════════════════════════════════════════
// 25 — state machine guards, audit trail
// ═════════════════════════════════════════════════════════════

test('25 illegal transition — cannot close an approved RMA directly', () => {
  const store = makeStore();
  const inv = makeB2BInvoice(5);
  const id = createRma('c', inv.id, makeItems(), 'defective', { store, invoice: inv });
  assert.throws(() => closeRma(id, { store }), /illegal transition/);
});

test('26 rejectRma can reject from pending_approval (terminal)', () => {
  const store = makeStore();
  const inv = makeB2BInvoice(45); // → pending_approval
  const id = createRma('c', inv.id, makeItems(), 'defective', { store, invoice: inv });
  rejectRma(id, 'Out of warranty', { store });
  const rec = getRma(id, { store });
  assert.equal(rec.status, STATUS.REJECTED);
  assert.equal(rec.rejection_reason, 'Out of warranty');
  // Cannot transition further
  assert.throws(() => closeRma(id, { store }), /illegal transition/);
});

test('27 audit trail is append-only and bilingual', () => {
  const store = makeStore();
  const inv = makeB2BInvoice(5);
  const { id } = driveHappyPath(store, 'defective', inv);
  const events = getAuditTrail(id, { store });
  assert.ok(events.length >= 5);
  // Every event carries BOTH label_he and label_en
  for (const e of events) {
    assert.ok(typeof e.label_he === 'string' && e.label_he.length > 0);
    assert.ok(typeof e.label_en === 'string' && e.label_en.length > 0);
    assert.ok(typeof e.at === 'string');
  }
  // Append-only invariant — there is no purge API
  assert.equal(typeof rma.deleteAuditTrail, 'undefined');
  assert.equal(typeof rma.clearAudit, 'undefined');
});

test('28 getShipBackInstructions returns bilingual packet', () => {
  const store = makeStore();
  const inv = makeB2BInvoice(5);
  const id = createRma('c', inv.id, makeItems(), 'defective', { store, invoice: inv });
  const pkt = getShipBackInstructions(id, { store });
  assert.ok(pkt.rma_number.startsWith('RMA-'));
  assert.match(pkt.label_he, /מספר החזרה/);
  assert.match(pkt.label_he, /בני ברק/);
  assert.match(pkt.label_en, /RMA Number/);
  assert.match(pkt.label_en, /Returns DC/);
});

// ═════════════════════════════════════════════════════════════
// 29 — stats aggregation
// ═════════════════════════════════════════════════════════════

test('29 getRmaStats — count, top_reasons, avg_resolution_days', () => {
  const store = makeStore();
  const inv = makeB2BInvoice(5);
  // 3 defective, 2 wrong_item, 1 warranty (pending — excluded from avg)
  for (let i = 0; i < 3; i++) {
    driveHappyPath(store, 'defective', inv);
  }
  for (let i = 0; i < 2; i++) {
    driveHappyPath(store, 'wrong_item', inv);
  }
  createRma('cW', inv.id, makeItems(), 'warranty_claim', { store, invoice: inv });

  const stats = getRmaStats(
    { from: '2000-01-01', to: '9999-01-01' },
    { store }
  );
  assert.equal(stats.count, 6);
  assert.equal(stats.top_reasons[0].code, 'defective');
  assert.equal(stats.top_reasons[0].count, 3);
  assert.equal(stats.top_reasons[1].code, 'wrong_item');
  assert.equal(stats.top_reasons[1].count, 2);
  // 5 closed RMAs — avg resolution should be a non-negative number
  assert.ok(typeof stats.avg_resolution_days === 'number');
  assert.ok(stats.avg_resolution_days >= 0);
  assert.ok(stats.by_status.closed >= 5);
});

test('30 listRmas filters by status and customer_id', () => {
  const store = makeStore();
  const inv = makeB2BInvoice(5);
  const { id: idA } = driveHappyPath(store, 'defective', inv);
  createRma('cust-XYZ', inv.id, makeItems(), 'warranty_claim', {
    store,
    invoice: inv,
  });
  const closed = listRmas({ status: STATUS.CLOSED }, { store });
  assert.equal(closed.length, 1);
  assert.equal(closed[0].id, idA);
  const byCust = listRmas({ customer_id: 'cust-XYZ' }, { store });
  assert.equal(byCust.length, 1);
});

// ═════════════════════════════════════════════════════════════
// 31 — policy: LEGAL_TRANSITIONS + daysBetween + round2
// ═════════════════════════════════════════════════════════════

test('31 LEGAL_TRANSITIONS — terminal states have no successors', () => {
  assert.deepEqual(LEGAL_TRANSITIONS.closed, []);
  assert.deepEqual(LEGAL_TRANSITIONS.rejected, []);
  // draft can go 3 ways
  assert.ok(LEGAL_TRANSITIONS.draft.includes('pending_approval'));
  assert.ok(LEGAL_TRANSITIONS.draft.includes('approved'));
  assert.ok(LEGAL_TRANSITIONS.draft.includes('rejected'));
});

test('32 daysBetween + round2 pure utilities', () => {
  const a = '2026-04-01T00:00:00Z';
  const b = '2026-04-11T00:00:00Z';
  assert.equal(daysBetween(a, b), 10);
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(round2(99.955), 99.96);
  assert.equal(round2(99.954), 99.95);
});

test('33 _shouldAutoApprove integration with invoice age + consumer flag', () => {
  const freshB2B = makeB2BInvoice(5);
  const staleB2B = makeB2BInvoice(60);
  const freshB2C = makeB2CInvoice(5);
  const staleB2C = makeB2CInvoice(20);
  const reasonDefective = 'defective';

  // Fresh B2B defective — auto-approve
  assert.ok(
    _shouldAutoApprove(
      { reason: reasonDefective, created_at: new Date().toISOString() },
      freshB2B,
      DEFAULT_POLICY
    )
  );
  // Stale B2B — not auto-approved
  assert.ok(
    !_shouldAutoApprove(
      { reason: reasonDefective, created_at: new Date().toISOString() },
      staleB2B,
      DEFAULT_POLICY
    )
  );
  // Fresh B2C — auto-approve
  assert.ok(
    _shouldAutoApprove(
      { reason: reasonDefective, created_at: new Date().toISOString() },
      freshB2C,
      DEFAULT_POLICY
    )
  );
  // Stale B2C past 14d — not auto-approved
  assert.ok(
    !_shouldAutoApprove(
      { reason: reasonDefective, created_at: new Date().toISOString() },
      staleB2C,
      DEFAULT_POLICY
    )
  );
});
