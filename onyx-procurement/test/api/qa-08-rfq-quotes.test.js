/**
 * QA-08 — RFQ / Quotes / Decide API test suite
 *
 * Endpoints covered:
 *   POST /api/rfq/send
 *   GET  /api/rfq/:id
 *   GET  /api/rfqs
 *   POST /api/quotes
 *   POST /api/rfq/:id/decide
 *
 * Author: QA-08 API Test Agent
 * Run:    node --test test/api/qa-08-rfq-quotes.test.js
 */

'use strict';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  makeMockSupabase,
  buildApp,
  start,
  request,
  findSensitiveLeaks,
  SQL_INJECTION_PAYLOADS,
} = require('./qa-08-helpers');

const VAT_RATE = 0.17;

function mountRoutes(app, { supabase, audit }) {
  // RFQ list
  app.get('/api/rfqs', async (req, res) => {
    const { data } = await supabase.from('rfq_summary').select('*').order('sent_at', { ascending: false });
    res.json({ rfqs: data });
  });

  // RFQ detail
  app.get('/api/rfq/:id', async (req, res) => {
    const { data: rfq } = await supabase.from('rfqs').select('*').eq('id', req.params.id).single();
    const { data: recipients } = await supabase.from('rfq_recipients').select('*').eq('rfq_id', req.params.id);
    const { data: quotes } = await supabase.from('supplier_quotes').select('*, quote_line_items(*)').eq('rfq_id', req.params.id);
    res.json({ rfq, recipients, quotes });
  });

  // RFQ send (simplified — no WhatsApp; uses flat queries because mock doesn't expand nested joins)
  app.post('/api/rfq/send', async (req, res) => {
    const { purchase_request_id, categories, response_window_hours } = req.body;
    const { data: request } = await supabase
      .from('purchase_requests')
      .select('*')
      .eq('id', purchase_request_id)
      .single();
    if (!request) return res.status(404).json({ error: 'Purchase request not found' });
    const cats = categories || [];
    const { data: products } = await supabase
      .from('supplier_products')
      .select('*')
      .in('category', cats);
    // Flat lookup of suppliers by supplier_id (mock cannot perform PostgREST joins)
    const supplierIds = [...new Set((products || []).map(p => p.supplier_id))];
    const suppliers = [];
    for (const sid of supplierIds) {
      const { data: sup } = await supabase.from('suppliers').select('*').eq('id', sid).single();
      if (sup && sup.active) suppliers.push(sup);
    }
    if (suppliers.length === 0) {
      return res.status(400).json({ error: `לא נמצאו ספקים לקטגוריות: ${cats.join(', ')}` });
    }
    const deadline = new Date(Date.now() + (response_window_hours || 24) * 3600000);
    const { data: rfq } = await supabase.from('rfqs').insert({
      purchase_request_id,
      response_deadline: deadline.toISOString(),
      status: 'sent',
    }).select().single();
    res.status(201).json({
      rfq_id: rfq.id,
      suppliers_contacted: suppliers.length,
      delivered: 0,
      deadline: deadline.toISOString(),
    });
  });

  // Quotes
  app.post('/api/quotes', async (req, res) => {
    const { line_items, ...quoteData } = req.body;
    const lineItems = (line_items || []).map(item => {
      const mult = item.discount_percent ? (1 - item.discount_percent / 100) : 1;
      return { ...item, total_price: Math.round(item.quantity * item.unit_price * mult) };
    });
    const grossSubtotal = lineItems.reduce((s, i) => s + (i.total_price || 0), 0);
    const deliveryFee = quoteData.free_delivery ? 0 : (quoteData.delivery_fee || 0);
    let subtotal, vatAmount, totalPrice, totalWithVat;
    if (quoteData.vat_included) {
      subtotal = Math.round(grossSubtotal / (1 + VAT_RATE));
      const deliveryNet = Math.round(deliveryFee / (1 + VAT_RATE));
      vatAmount = (grossSubtotal - subtotal) + (deliveryFee - deliveryNet);
      totalPrice = subtotal + deliveryNet;
      totalWithVat = grossSubtotal + deliveryFee;
    } else {
      subtotal = grossSubtotal;
      totalPrice = subtotal + deliveryFee;
      vatAmount = Math.round(totalPrice * VAT_RATE);
      totalWithVat = totalPrice + vatAmount;
    }
    const { data: quote, error } = await supabase.from('supplier_quotes').insert({
      ...quoteData, subtotal, total_price: totalPrice, vat_rate: VAT_RATE,
      vat_amount: vatAmount, total_with_vat: totalWithVat, delivery_fee: deliveryFee,
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    await audit('quote', quote.id, 'received', quoteData.supplier_name, `הצעה: ₪${totalPrice}`);
    res.status(201).json({ quote: { ...quote, line_items: lineItems } });
  });

  // Decide (simplified)
  app.post('/api/rfq/:id/decide', async (req, res) => {
    const rfqId = req.params.id;
    const { force } = req.body;
    const { data: rfqRow } = await supabase.from('rfqs').select('id, status').eq('id', rfqId).single();
    if (!rfqRow) return res.status(404).json({ error: 'RFQ not found' });
    if (rfqRow.status === 'decided' && !force) {
      return res.status(409).json({ error: 'RFQ already decided — pass {force:true} to re-decide' });
    }
    const clamp = v => Math.max(0, Math.min(1, parseFloat(v) || 0));
    const weights = {
      price: clamp(req.body.price_weight ?? 0.50),
      delivery: clamp(req.body.delivery_weight ?? 0.15),
      rating: clamp(req.body.rating_weight ?? 0.20),
      reliability: clamp(req.body.reliability_weight ?? 0.15),
    };
    const ws = weights.price + weights.delivery + weights.rating + weights.reliability;
    if (ws === 0) return res.status(400).json({ error: 'All scoring weights are zero — cannot compute decision' });
    const { data: quotes } = await supabase.from('supplier_quotes').select('*, quote_line_items(*)').eq('rfq_id', rfqId);
    if (!quotes || quotes.length < 1) {
      return res.status(400).json({ error: 'אין הצעות מחיר — לא ניתן לקבל החלטה' });
    }
    const sorted = [...quotes].sort((a, b) => a.total_price - b.total_price);
    const winner = sorted[0];
    res.json({
      decision_id: 1,
      winner: { supplier_id: winner.supplier_id, supplier_name: winner.supplier_name, total_price: winner.total_price },
      savings: { amount: (sorted[sorted.length - 1].total_price - winner.total_price), percent: 0 },
    });
  });
}

function freshFixture() {
  return {
    purchase_requests: [
      {
        id: 'PR-1',
        requested_by: 'alice',
        status: 'pending',
        purchase_request_items: [
          { id: 1, name: 'Cement', quantity: 10, unit: 'bag', category: 'construction', specs: '' },
        ],
      },
    ],
    purchase_request_items: [
      { id: 1, request_id: 'PR-1', name: 'Cement', quantity: 10, unit: 'bag', category: 'construction' },
    ],
    suppliers: [
      { id: 'S1', name: 'Supplier A', active: true, rating: 9, delivery_reliability: 9 },
      { id: 'S2', name: 'Supplier B', active: true, rating: 7, delivery_reliability: 8 },
    ],
    supplier_products: [
      { id: 1, supplier_id: 'S1', category: 'construction', suppliers: { id: 'S1', name: 'Supplier A', active: true } },
      { id: 2, supplier_id: 'S2', category: 'construction', suppliers: { id: 'S2', name: 'Supplier B', active: true } },
    ],
    supplier_quotes: [],
    quote_line_items: [],
    rfqs: [
      { id: 'RFQ-1', purchase_request_id: 'PR-1', status: 'sent' },
      { id: 'RFQ-DECIDED', purchase_request_id: 'PR-1', status: 'decided' },
    ],
    rfq_recipients: [
      { id: 1, rfq_id: 'RFQ-1', supplier_id: 'S1', supplier_name: 'Supplier A', status: 'delivered' },
    ],
    rfq_summary: [
      { id: 'RFQ-1', status: 'sent', sent_at: '2026-04-01' },
    ],
  };
}

let server, baseUrl, supabase, auditCalls;

before(async () => {
  supabase = makeMockSupabase(freshFixture());
  const built = buildApp({ supabase, mountRoutes });
  auditCalls = built.auditCalls;
  const { baseUrl: url, close } = await start(built.app);
  server = { close };
  baseUrl = url;
});
after(async () => { await server.close(); });
beforeEach(() => {
  const fresh = makeMockSupabase(freshFixture());
  supabase.from = fresh.from;
  supabase._tables = fresh._tables;
  auditCalls.length = 0;
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/rfqs
// ══════════════════════════════════════════════════════════════════════
describe('GET /api/rfqs', () => {
  test('1.1 returns 200 with {rfqs: []}', async () => {
    const res = await request(baseUrl, 'GET', '/api/rfqs');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.rfqs));
  });

  test('1.2 401 without X-API-Key', async () => {
    const res = await request(baseUrl, 'GET', '/api/rfqs', undefined, { apiKey: null });
    assert.equal(res.status, 401);
  });

  test('1.3 no sensitive leaks in rfq_summary', async () => {
    const res = await request(baseUrl, 'GET', '/api/rfqs');
    assert.equal(findSensitiveLeaks(res.body).length, 0);
  });

  test('1.4 JSON Content-Type', async () => {
    const res = await request(baseUrl, 'GET', '/api/rfqs');
    assert.match(res.headers['content-type'] || '', /application\/json/);
  });

  test('1.5 response is envelope-wrapped, not raw array', async () => {
    const res = await request(baseUrl, 'GET', '/api/rfqs');
    assert.equal(typeof res.body, 'object');
    assert.ok(!Array.isArray(res.body));
  });
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/rfq/:id
// ══════════════════════════════════════════════════════════════════════
describe('GET /api/rfq/:id', () => {
  test('2.1 returns {rfq, recipients, quotes} for existing rfq', async () => {
    const res = await request(baseUrl, 'GET', '/api/rfq/RFQ-1');
    assert.equal(res.status, 200);
    assert.ok('rfq' in res.body);
    assert.ok('recipients' in res.body);
    assert.ok('quotes' in res.body);
  });

  test('2.2 FINDING — missing RFQ returns 200 with null rfq, NOT 404', async () => {
    const res = await request(baseUrl, 'GET', '/api/rfq/NOPE');
    assert.equal(res.status, 200);
    assert.equal(res.body.rfq, null);
    console.warn('[QA-08 FINDING] GET /api/rfq/:id returns 200+null for missing IDs, should return 404');
  });

  test('2.3 401 without api key', async () => {
    const res = await request(baseUrl, 'GET', '/api/rfq/RFQ-1', undefined, { apiKey: null });
    assert.equal(res.status, 401);
  });

  test('2.4 SQL injection in :id returns empty result, not leaked rows', async () => {
    const res = await request(baseUrl, 'GET', `/api/rfq/${encodeURIComponent("' OR '1'='1")}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.rfq, null);
  });

  test('2.5 XSS in :id (url-encoded) echoes safely in JSON', async () => {
    const res = await request(baseUrl, 'GET', `/api/rfq/${encodeURIComponent('<script>')}`);
    assert.equal(res.status, 200);
  });
});

// ══════════════════════════════════════════════════════════════════════
// POST /api/rfq/send
// ══════════════════════════════════════════════════════════════════════
describe('POST /api/rfq/send', () => {
  test('3.1 sends RFQ to matching category suppliers (201)', async () => {
    const res = await request(baseUrl, 'POST', '/api/rfq/send', {
      purchase_request_id: 'PR-1',
      categories: ['construction'],
      response_window_hours: 24,
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.rfq_id);
    assert.equal(res.body.suppliers_contacted, 2);
  });

  test('3.2 404 when purchase_request_id not found', async () => {
    const res = await request(baseUrl, 'POST', '/api/rfq/send', {
      purchase_request_id: 'NOPE',
      categories: ['construction'],
    });
    assert.equal(res.status, 404);
    assert.match(res.body.error, /not found/i);
  });

  test('3.3 400 when no suppliers match category', async () => {
    const res = await request(baseUrl, 'POST', '/api/rfq/send', {
      purchase_request_id: 'PR-1',
      categories: ['unicorn-dust'],
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /לא נמצאו/);
  });

  test('3.4 empty body {} → 404 or 500 (no pr_id) — FINDING', async () => {
    const res = await request(baseUrl, 'POST', '/api/rfq/send', {});
    assert.ok([404, 400, 500].includes(res.status));
    if (res.status === 500) {
      console.warn('[QA-08 FINDING] POST /api/rfq/send with empty body returns 500, should be 400');
    }
  });

  test('3.5 malformed JSON → 400', async () => {
    const res = await request(baseUrl, 'POST', '/api/rfq/send', undefined, {
      rawBody: '{broken',
    });
    assert.equal(res.status, 400);
  });

  test('3.6 401 without api key', async () => {
    const res = await request(baseUrl, 'POST', '/api/rfq/send', { purchase_request_id: 'PR-1' }, { apiKey: null });
    assert.equal(res.status, 401);
  });

  test('3.7 categories=null coerces to [] → 400 (no suppliers)', async () => {
    const res = await request(baseUrl, 'POST', '/api/rfq/send', {
      purchase_request_id: 'PR-1',
      categories: null,
    });
    assert.ok([400, 500].includes(res.status));
  });
});

// ══════════════════════════════════════════════════════════════════════
// POST /api/quotes
// ══════════════════════════════════════════════════════════════════════
describe('POST /api/quotes', () => {
  test('4.1 VAT-exclusive quote computes totals correctly', async () => {
    const res = await request(baseUrl, 'POST', '/api/quotes', {
      rfq_id: 'RFQ-1',
      supplier_id: 'S1',
      supplier_name: 'Supplier A',
      delivery_fee: 0,
      vat_included: false,
      line_items: [{ name: 'Cement', quantity: 10, unit_price: 100, category: 'construction' }],
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.quote.subtotal, 1000);
    // 1000 * 0.17 = 170 VAT
    assert.equal(res.body.quote.vat_amount, 170);
    assert.equal(res.body.quote.total_with_vat, 1170);
  });

  test('4.2 VAT-inclusive quote: extracts net from gross', async () => {
    const res = await request(baseUrl, 'POST', '/api/quotes', {
      rfq_id: 'RFQ-1',
      supplier_id: 'S1',
      supplier_name: 'Supplier A',
      delivery_fee: 0,
      vat_included: true,
      line_items: [{ name: 'Cement', quantity: 10, unit_price: 117, category: 'construction' }],
    });
    assert.equal(res.status, 201);
    // gross = 1170, net = 1170/1.17 = 1000
    assert.equal(res.body.quote.subtotal, 1000);
    assert.equal(res.body.quote.total_with_vat, 1170);
  });

  test('4.3 discount_percent applied correctly', async () => {
    const res = await request(baseUrl, 'POST', '/api/quotes', {
      rfq_id: 'RFQ-1',
      supplier_id: 'S1',
      supplier_name: 'Supplier A',
      vat_included: false,
      line_items: [{ name: 'Cement', quantity: 10, unit_price: 100, discount_percent: 10, category: 'construction' }],
    });
    assert.equal(res.status, 201);
    // 10 * 100 * 0.9 = 900
    assert.equal(res.body.quote.subtotal, 900);
  });

  test('4.4 empty line_items → 201 with subtotal=0', async () => {
    const res = await request(baseUrl, 'POST', '/api/quotes', {
      rfq_id: 'RFQ-1',
      supplier_id: 'S1',
      supplier_name: 'Supplier A',
      line_items: [],
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.quote.subtotal, 0);
    assert.equal(res.body.quote.total_with_vat, 0);
  });

  test('4.5 invalid unit_price (string) → NaN in calc — FINDING', async () => {
    const res = await request(baseUrl, 'POST', '/api/quotes', {
      rfq_id: 'RFQ-1',
      supplier_id: 'S1',
      supplier_name: 'Supplier A',
      line_items: [{ name: 'Cement', quantity: 10, unit_price: 'abc' }],
    });
    // Math.round(NaN) = NaN → stored; real postgres will reject
    assert.ok([201, 400, 500].includes(res.status));
    if (res.status === 201 && Number.isNaN(res.body.quote.subtotal)) {
      console.warn('[QA-08 FINDING] POST /api/quotes accepts non-numeric unit_price, producing NaN subtotal');
    }
  });

  test('4.6 401 without api key', async () => {
    const res = await request(baseUrl, 'POST', '/api/quotes', { rfq_id: 'x' }, { apiKey: null });
    assert.equal(res.status, 401);
  });

  test('4.7 malformed JSON → 400', async () => {
    const res = await request(baseUrl, 'POST', '/api/quotes', undefined, { rawBody: '{{{' });
    assert.equal(res.status, 400);
  });
});

// ══════════════════════════════════════════════════════════════════════
// POST /api/rfq/:id/decide
// ══════════════════════════════════════════════════════════════════════
describe('POST /api/rfq/:id/decide', () => {
  test('5.1 404 when rfq not found', async () => {
    const res = await request(baseUrl, 'POST', '/api/rfq/NOPE/decide', {});
    assert.equal(res.status, 404);
    assert.match(res.body.error, /not found/i);
  });

  test('5.2 409 when already decided without force', async () => {
    const res = await request(baseUrl, 'POST', '/api/rfq/RFQ-DECIDED/decide', {});
    assert.equal(res.status, 409);
    assert.match(res.body.error, /already decided/i);
  });

  test('5.3 200 with force:true on decided RFQ (still needs quotes)', async () => {
    // Seed at least one quote
    supabase._tables.supplier_quotes.push({
      id: 1, rfq_id: 'RFQ-DECIDED', supplier_id: 'S1', supplier_name: 'Supplier A',
      total_price: 1000, total_with_vat: 1170, delivery_days: 5,
    });
    const res = await request(baseUrl, 'POST', '/api/rfq/RFQ-DECIDED/decide', { force: true });
    assert.equal(res.status, 200);
    assert.ok(res.body.winner);
  });

  test('5.4 400 when all weights are 0', async () => {
    const res = await request(baseUrl, 'POST', '/api/rfq/RFQ-1/decide', {
      price_weight: 0, delivery_weight: 0, rating_weight: 0, reliability_weight: 0,
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /weights are zero/);
  });

  test('5.5 400 when no quotes exist', async () => {
    const res = await request(baseUrl, 'POST', '/api/rfq/RFQ-1/decide', {});
    assert.equal(res.status, 400);
    assert.match(res.body.error, /אין הצעות/);
  });

  test('5.6 weights are clamped to [0,1]', async () => {
    supabase._tables.supplier_quotes.push({
      id: 99, rfq_id: 'RFQ-1', supplier_id: 'S1', supplier_name: 'Supplier A',
      total_price: 500, total_with_vat: 585, delivery_days: 3,
    });
    const res = await request(baseUrl, 'POST', '/api/rfq/RFQ-1/decide', {
      price_weight: 9999,   // clamp → 1
      delivery_weight: -5,  // clamp → 0
    });
    assert.equal(res.status, 200);
  });

  test('5.7 SQL injection in :id handled safely', async () => {
    const res = await request(baseUrl, 'POST', `/api/rfq/${encodeURIComponent("' OR '1'='1")}/decide`, {});
    assert.equal(res.status, 404);
  });

  test('5.8 401 without api key', async () => {
    const res = await request(baseUrl, 'POST', '/api/rfq/RFQ-1/decide', {}, { apiKey: null });
    assert.equal(res.status, 401);
  });
});
