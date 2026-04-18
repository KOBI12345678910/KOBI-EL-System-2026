/**
 * QA-04 Scenario 1 — Procurement Full Flow (end-to-end)
 * ------------------------------------------------------------------
 * Flow under test:
 *   User creates supplier -> receives an invoice -> creates PO ->
 *   approves PO -> updates status -> sees it in dashboard ->
 *   cancels/deletes.
 *
 * Edge cases audited (from QA-04 prompt):
 *   - Can we cancel/delete half-way? (status-machine integrity)
 *   - Do dashboard counters match the real table rows? (inconsistent views)
 *   - Does approve on a non-draft PO return a clean 409 with a Hebrew-
 *     grade error, or a silent state flip?
 *   - Does "update status without body" return a useful error or a 500?
 *   - Does delete on a non-existent supplier silently succeed?
 *
 * The test harness lives in ./qa-04-harness.js.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFullApp,
  startServer,
  request,
  recordFinding,
} = require('./qa-04-harness');

async function newCtx() {
  const ctx = buildFullApp({
    suppliers: [],
    purchase_orders: [],
    tax_invoices: [],
  });
  await startServer(ctx);
  return ctx;
}

test('QA-04 / procurement / happy path — supplier → invoice → PO → approve → status → dashboard → cancel', async () => {
  const ctx = await newCtx();
  try {
    // 1. Create supplier
    let res = await request(ctx.server, 'POST', '/api/qa/suppliers', {
      name: 'מתכת הדרום בע"מ',
      category: 'construction',
      phone: '03-9999999',
      email: 'sales@metal-south.co.il',
      active: true,
    });
    if (res.status !== 201) {
      recordFinding({
        scenario: 'procurement-full-flow',
        severity: 'critical',
        title: 'POST /api/qa/suppliers did not return 201',
        observed: `status=${res.status}, body=${JSON.stringify(res.body)}`,
        expected: '201 Created with { supplier: {...} }',
        repro: 'POST /api/qa/suppliers with valid body',
        impact: 'Cannot onboard new suppliers — blocks whole procurement flow.',
      });
    }
    assert.equal(res.status, 201);
    const supplier = res.body.supplier;
    assert.ok(supplier.id, 'supplier id assigned');

    // 2. Record incoming tax invoice from that supplier (via VAT module)
    res = await request(ctx.server, 'POST', '/api/vat/invoices', {
      direction: 'input',
      invoice_number: 'A-20260401',
      invoice_date: '2026-04-01',
      supplier_name: supplier.name,
      supplier_id: supplier.id,
      net_amount: 10000,
      // vat_amount intentionally omitted — route must auto-fill
      status: 'ok',
    });
    if (res.status !== 201) {
      recordFinding({
        scenario: 'procurement-full-flow',
        severity: 'critical',
        title: 'POST /api/vat/invoices (input) rejected a valid invoice',
        observed: `status=${res.status}, body=${JSON.stringify(res.body)}`,
        expected: '201 with auto-filled vat_amount',
        repro: 'POST /api/vat/invoices with net_amount only, no vat_amount',
        impact: 'Incoming supplier invoices cannot be recorded — blocks VAT flow.',
      });
    }
    assert.equal(res.status, 201);
    const taxInvoice = res.body.invoice;
    assert.equal(taxInvoice.net_amount, 10000);
    assert.equal(taxInvoice.vat_amount, 1700, 'VAT auto-filled at 17%');
    assert.equal(taxInvoice.gross_amount, 11700, 'gross_amount auto-filled');

    // 3. Create PO against that invoice
    res = await request(ctx.server, 'POST', '/api/qa/purchase-orders', {
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      subtotal: 10000,
      vat_amount: 1700,
      total: 11700,
      linked_tax_invoice_id: taxInvoice.id,
      expected_delivery: '2026-04-15',
    });
    assert.equal(res.status, 201);
    const po = res.body.po;
    assert.equal(po.status, 'draft');
    assert.ok(po.id);

    // 4. Approve
    res = await request(ctx.server, 'POST', `/api/qa/purchase-orders/${po.id}/approve`, {});
    assert.equal(res.status, 200);
    assert.equal(res.body.order.status, 'approved');

    // 5. Update status -> "received"
    res = await request(ctx.server, 'POST', `/api/qa/purchase-orders/${po.id}/status`, {
      status: 'received',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.order.status, 'received');

    // 6. Dashboard check — count matches reality
    res = await request(ctx.server, 'GET', '/api/qa/dashboard');
    assert.equal(res.status, 200);
    const dash = res.body;
    assert.equal(dash.suppliers_count, 1);
    assert.equal(dash.orders_count, 1);
    assert.equal(dash.total_spend, 11700);

    // 7. Cancel the PO
    res = await request(ctx.server, 'POST', `/api/qa/purchase-orders/${po.id}/cancel`, {
      reason: 'e2e test cleanup',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.order.status, 'cancelled');

    // 8. Dashboard must reflect the cancellation
    res = await request(ctx.server, 'GET', '/api/qa/dashboard');
    assert.equal(res.body.cancelled_orders, 1);
    if (res.body.open_orders !== 0) {
      recordFinding({
        scenario: 'procurement-full-flow',
        severity: 'high',
        title: 'Dashboard open_orders counter does not react to cancellation',
        observed: `open_orders=${res.body.open_orders} after cancelling the only PO`,
        expected: 'open_orders should drop to 0 once PO status=cancelled',
        repro: 'Create 1 PO, approve it, mark received, cancel, GET /api/qa/dashboard',
        impact: 'Stale dashboard → users think procurement is active when it is not.',
      });
    }
    assert.equal(res.body.open_orders, 0);
  } finally {
    await ctx.close();
  }
});

test('QA-04 / procurement / negative — approve twice returns a clean 409', async () => {
  const ctx = await newCtx();
  try {
    await request(ctx.server, 'POST', '/api/qa/suppliers', { name: 'A', active: true });
    const po = (await request(ctx.server, 'POST', '/api/qa/purchase-orders', {
      supplier_id: 1, supplier_name: 'A', subtotal: 100, total: 117,
    })).body.po;
    await request(ctx.server, 'POST', `/api/qa/purchase-orders/${po.id}/approve`, {});
    const res2 = await request(ctx.server, 'POST', `/api/qa/purchase-orders/${po.id}/approve`, {});
    if (res2.status === 200) {
      recordFinding({
        scenario: 'procurement-full-flow',
        severity: 'high',
        title: 'Double-approve on a PO silently succeeds',
        observed: `2nd approve returned 200, body=${JSON.stringify(res2.body)}`,
        expected: '409 Conflict with message "Cannot approve in status approved"',
        repro: 'Approve a PO twice in a row',
        impact: 'No state-machine protection — audit log shows duplicate approvals.',
      });
    }
    assert.equal(res2.status, 409);
    assert.match(res2.body.error || '', /Cannot approve/);
  } finally {
    await ctx.close();
  }
});

test('QA-04 / procurement / negative — delete of non-existent supplier returns empty list not 404', async () => {
  const ctx = await newCtx();
  try {
    const res = await request(ctx.server, 'DELETE', '/api/qa/suppliers/99999');
    // Either 200 with empty `deleted: []` OR 404 — flag anything else
    if (!(res.status === 200 || res.status === 404)) {
      recordFinding({
        scenario: 'procurement-full-flow',
        severity: 'medium',
        title: 'DELETE non-existent supplier returned unexpected status',
        observed: `status=${res.status}, body=${JSON.stringify(res.body)}`,
        expected: '200 with empty deleted[] OR 404 Not Found',
        repro: 'DELETE /api/qa/suppliers/99999',
        impact: 'Client cannot distinguish success vs failure.',
      });
    }
    // We document the current behavior rather than forcing a 404
    assert.ok([200, 404].includes(res.status));
    // If 200, deleted must be an empty array
    if (res.status === 200) {
      assert.deepEqual(res.body.deleted, []);
    }
  } finally {
    await ctx.close();
  }
});

test('QA-04 / procurement / lost-data — POST with empty body creates a ghost PO', async () => {
  // Simulates the "back-before-save" scenario: client hits submit twice,
  // second time with empty body (form was cleared by navigation).
  const ctx = await newCtx();
  try {
    const res = await request(ctx.server, 'POST', '/api/qa/purchase-orders', {});
    // A defensive API should reject, returning 400. We record whatever happens.
    if (res.status === 201) {
      const po = res.body.po;
      if (!po.supplier_id || !po.total) {
        recordFinding({
          scenario: 'procurement-full-flow',
          severity: 'high',
          title: 'POST /api/qa/purchase-orders accepted an empty body',
          observed: `status=201, po=${JSON.stringify(po)}`,
          expected: '400 with validation error on required fields (supplier_id, total)',
          repro: 'POST /api/qa/purchase-orders with {}',
          impact: 'Ghost POs pollute the dashboard and break downstream totals.',
        });
      }
      // We still assert that no total spend came in — dashboard must stay sane
      const dash = await request(ctx.server, 'GET', '/api/qa/dashboard');
      assert.equal(dash.body.total_spend, 0);
    }
    assert.ok(res.status === 201 || res.status === 400);
  } finally {
    await ctx.close();
  }
});
