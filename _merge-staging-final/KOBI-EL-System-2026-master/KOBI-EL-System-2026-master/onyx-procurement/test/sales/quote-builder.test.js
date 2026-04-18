/**
 * Unit tests for Sales Quote Builder — src/sales/quote-builder.js
 * Agent Y-016 — 2026-04-11
 *
 * Run with:  node --test test/sales/quote-builder.test.js
 *
 * Covers:
 *   - createQuote with fixed clock → deterministic number + dates
 *   - computeTotals: subtotal, line discounts, total discounts, VAT 17%, gross
 *   - applyDiscount: line + total scopes, percent + amount
 *   - addLine / updateLine / removeLine (draft only)
 *   - reviseQuote: creates new version, prior preserved
 *   - statusTransition: legal + illegal flows
 *   - convertToOrder: shape + source metadata
 *   - Hebrew glossary coverage + bilingual fallback PDF rendering
 *   - VAT rate comes from config (not hard-coded)
 *   - Optional fx-engine hook
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  QuoteBuilder,
  STATUS,
  ALLOWED,
  GLOSSARY,
  DEFAULT_VAT,
  round2
} = require('../../src/sales/quote-builder.js');

const TMP_DIR = path.join(__dirname, '..', 'tmp-quote-pdfs');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

/* ---------- helpers ---------- */
function fixedClock(iso) {
  return () => new Date(iso);
}

function fixture(builder) {
  return builder.createQuote({
    customer: {
      name: 'אלקטרו-אריק בע"מ',
      company_id: '512345678',
      email: 'sales@electro-eric.co.il',
      phone: '03-9876543'
    },
    items: [
      { sku: 'SKU-100', description: 'בקר PLC', qty: 2, unitPrice: 1500 },
      { sku: 'SKU-200', description: 'רלה 24V', qty: 10, unitPrice: 45,
        discount: { type: 'percent', value: 10, reason: 'לקוח חוזר' } },
      { sku: 'SKU-300', description: 'כבל חשמל 4x2.5', qty: 50, unitPrice: 12 }
    ],
    validDays: 30,
    terms: 'תשלום שוטף+30',
    notes: 'משלוח כלול'
  });
}

/* ===========================================================================
 * ctor + config
 * ========================================================================= */

test('ctor: default VAT 17%, default currency ILS', () => {
  const b = new QuoteBuilder();
  assert.equal(b.vatRate, DEFAULT_VAT);
  assert.equal(b.vatRate, 0.17);
  assert.equal(b.currency, 'ILS');
});

test('ctor: VAT rate is configurable', () => {
  const b = new QuoteBuilder({ vatRate: 0.18 });
  assert.equal(b.vatRate, 0.18);
});

test('ctor: injected clock is used for createQuote', () => {
  const b = new QuoteBuilder({ now: fixedClock('2026-04-11T08:00:00Z') });
  const q = b.createQuote({
    customer: { name: 'X' },
    items: [{ sku: 'A', qty: 1, unitPrice: 100 }],
    validDays: 7
  });
  assert.equal(q.issued_date, '2026-04-11');
  assert.equal(q.expires_date, '2026-04-18');
  assert.match(q.number, /^Q-2026-\d{5}$/);
});

/* ===========================================================================
 * createQuote
 * ========================================================================= */

test('createQuote: draft status, version 1, customer snapshot', () => {
  const b = new QuoteBuilder({ now: fixedClock('2026-04-11T08:00:00Z') });
  const q = fixture(b);
  assert.equal(q.status, STATUS.DRAFT);
  assert.equal(q.version, 1);
  assert.equal(q.lines.length, 3);
  assert.equal(q.customer.name, 'אלקטרו-אריק בע"מ');
  assert.ok(q.history[0].event === 'created');
  assert.equal(q.previous_version_id, null);
});

test('createQuote: rejects bad inputs', () => {
  const b = new QuoteBuilder();
  assert.throws(() => b.createQuote({}), /customer/);
  assert.throws(() => b.createQuote({ customer: {} }), /items/);
  assert.throws(
    () => b.createQuote({ customer: {}, items: [{ qty: 1, unitPrice: 10 }] }),
    /sku required/
  );
  assert.throws(
    () => b.createQuote({ customer: {}, items: [{ sku: 'A', qty: -1, unitPrice: 10 }] }),
    /non-negative/
  );
});

test('createQuote: allocation_number starts as placeholder "pending"', () => {
  const b = new QuoteBuilder();
  const q = fixture(b);
  assert.equal(q.allocation_number, null);
  assert.equal(q.allocation_source, 'pending');
});

test('createQuote: allocation_number can be preassigned', () => {
  const b = new QuoteBuilder();
  const q = b.createQuote({
    customer: { name: 'X' },
    items: [{ sku: 'A', qty: 1, unitPrice: 100 }],
    allocationNumber: 'AL987654321'
  });
  assert.equal(q.allocation_number, 'AL987654321');
  assert.equal(q.allocation_source, 'preassigned');
});

/* ===========================================================================
 * computeTotals
 * ========================================================================= */

test('computeTotals: plain math, no discounts, 17% VAT', () => {
  const b = new QuoteBuilder();
  const q = b.createQuote({
    customer: { name: 'X' },
    items: [
      { sku: 'A', qty: 2, unitPrice: 100 },
      { sku: 'B', qty: 3, unitPrice: 50 }
    ]
  });
  const t = q.totals;
  assert.equal(t.subtotal, 350);
  assert.equal(t.line_discount, 0);
  assert.equal(t.total_discount, 0);
  assert.equal(t.net, 350);
  assert.equal(t.vat, round2(350 * 0.17));   // 59.5
  assert.equal(t.gross, round2(350 + 350 * 0.17)); // 409.5
});

test('computeTotals: fixture quote (10% line discount)', () => {
  const b = new QuoteBuilder();
  const q = fixture(b);
  const t = q.totals;

  // line 1: 2 * 1500 = 3000
  // line 2: 10 * 45 = 450, 10% = 45 discount → 405 net
  // line 3: 50 * 12 = 600
  // subtotal = 4050, line_discount = 45, net (pre VAT) = 4005
  // VAT @ 17% = 680.85, gross = 4685.85
  assert.equal(t.subtotal, 4050);
  assert.equal(t.line_discount, 45);
  assert.equal(t.net, 4005);
  assert.equal(t.vat, 680.85);
  assert.equal(t.gross, 4685.85);
  assert.equal(t.currency, 'ILS');
  assert.equal(t.vat_rate, 0.17);
});

test('computeTotals: honors config vatRate (18%)', () => {
  const b = new QuoteBuilder({ vatRate: 0.18 });
  const q = b.createQuote({
    customer: { name: 'X' },
    items: [{ sku: 'A', qty: 1, unitPrice: 1000 }]
  });
  assert.equal(q.totals.vat_rate, 0.18);
  assert.equal(q.totals.vat, 180);
  assert.equal(q.totals.gross, 1180);
});

test('computeTotals: line discount as amount', () => {
  const b = new QuoteBuilder();
  const q = b.createQuote({
    customer: { name: 'X' },
    items: [{ sku: 'A', qty: 1, unitPrice: 1000, discount: { type: 'amount', value: 250 } }]
  });
  assert.equal(q.totals.line_discount, 250);
  assert.equal(q.totals.net, 750);
});

test('computeTotals: discount cannot exceed gross (clamped)', () => {
  const b = new QuoteBuilder();
  const q = b.createQuote({
    customer: { name: 'X' },
    items: [{ sku: 'A', qty: 1, unitPrice: 100, discount: { type: 'amount', value: 999 } }]
  });
  assert.equal(q.totals.line_discount, 100);
  assert.equal(q.totals.net, 0);
  assert.equal(q.totals.vat, 0);
  assert.equal(q.totals.gross, 0);
});

test('computeTotals: net never negative', () => {
  const b = new QuoteBuilder();
  const q = b.createQuote({
    customer: { name: 'X' },
    items: [{ sku: 'A', qty: 1, unitPrice: 100 }]
  });
  b.applyDiscount(q, { type: 'amount', value: 9999, scope: 'total' });
  assert.equal(q.totals.net, 0);
  assert.equal(q.totals.vat, 0);
  assert.equal(q.totals.gross, 0);
});

/* ===========================================================================
 * applyDiscount
 * ========================================================================= */

test('applyDiscount: scope=total, percent', () => {
  const b = new QuoteBuilder();
  const q = b.createQuote({
    customer: { name: 'X' },
    items: [{ sku: 'A', qty: 1, unitPrice: 1000 }]
  });
  b.applyDiscount(q, { type: 'percent', value: 10, scope: 'total', reason: 'promo' });
  // 1000 → 10% → 900 net → VAT 153 → gross 1053
  assert.equal(q.totals.total_discount, 100);
  assert.equal(q.totals.net, 900);
  assert.equal(q.totals.vat, 153);
  assert.equal(q.totals.gross, 1053);
  assert.equal(q.discounts.length, 1);
  assert.equal(q.discounts[0].reason, 'promo');
});

test('applyDiscount: scope=total, amount', () => {
  const b = new QuoteBuilder();
  const q = b.createQuote({
    customer: { name: 'X' },
    items: [{ sku: 'A', qty: 1, unitPrice: 1000 }]
  });
  b.applyDiscount(q, { type: 'amount', value: 250, scope: 'total' });
  assert.equal(q.totals.net, 750);
});

test('applyDiscount: scope=line, mutates line.discount', () => {
  const b = new QuoteBuilder();
  const q = b.createQuote({
    customer: { name: 'X' },
    items: [
      { sku: 'A', qty: 1, unitPrice: 1000 },
      { sku: 'B', qty: 2, unitPrice: 500 }
    ]
  });
  b.applyDiscount(q, { type: 'percent', value: 20, scope: 'line', sku: 'A' });
  assert.equal(q.lines[0].discount.type, 'percent');
  assert.equal(q.lines[0].discount.value, 20);
  // line A: 1000 - 200 = 800; line B: 1000 → total net 1800
  assert.equal(q.totals.net, 1800);
});

test('applyDiscount: accumulates, does not replace', () => {
  const b = new QuoteBuilder();
  const q = b.createQuote({
    customer: { name: 'X' },
    items: [{ sku: 'A', qty: 1, unitPrice: 1000 }]
  });
  b.applyDiscount(q, { type: 'percent', value: 10, scope: 'total', reason: 'first' });
  b.applyDiscount(q, { type: 'amount', value: 50, scope: 'total', reason: 'second' });
  // 1000 → 900 → 850
  assert.equal(q.discounts.length, 2);
  assert.equal(q.totals.net, 850);
  assert.equal(q.totals.total_discount, 150);
});

test('applyDiscount: rejects percent > 100', () => {
  const b = new QuoteBuilder();
  const q = b.createQuote({
    customer: { name: 'X' },
    items: [{ sku: 'A', qty: 1, unitPrice: 100 }]
  });
  assert.throws(
    () => b.applyDiscount(q, { type: 'percent', value: 150, scope: 'total' }),
    /percent cannot exceed 100/
  );
});

test('applyDiscount: scope=line requires sku', () => {
  const b = new QuoteBuilder();
  const q = b.createQuote({
    customer: { name: 'X' },
    items: [{ sku: 'A', qty: 1, unitPrice: 100 }]
  });
  assert.throws(
    () => b.applyDiscount(q, { type: 'percent', value: 10, scope: 'line' }),
    /sku required/
  );
});

/* ===========================================================================
 * addLine / updateLine / removeLine
 * ========================================================================= */

test('addLine: appends new sku', () => {
  const b = new QuoteBuilder();
  const q = fixture(b);
  b.addLine(q, { sku: 'SKU-400', qty: 1, unitPrice: 2000 });
  assert.equal(q.lines.length, 4);
  assert.equal(q.totals.subtotal, 4050 + 2000);
});

test('addLine: dup sku merges qty', () => {
  const b = new QuoteBuilder();
  const q = fixture(b);
  b.addLine(q, { sku: 'SKU-100', qty: 1, unitPrice: 1500 });
  const line = q.lines.find((l) => l.sku === 'SKU-100');
  assert.equal(line.qty, 3);
});

test('updateLine: qty change reflows totals', () => {
  const b = new QuoteBuilder();
  const q = fixture(b);
  b.updateLine(q, 'SKU-100', { qty: 5 });
  const t = q.totals;
  // line 1: 5 * 1500 = 7500
  // line 2: 10 * 45 = 450, 10% = 45 → 405
  // line 3: 50 * 12 = 600
  // subtotal 8550, line_discount 45, net 8505, VAT 1445.85, gross 9950.85
  assert.equal(t.subtotal, 8550);
  assert.equal(t.net, 8505);
  assert.equal(t.vat, 1445.85);
  assert.equal(t.gross, 9950.85);
});

test('removeLine: drops sku', () => {
  const b = new QuoteBuilder();
  const q = fixture(b);
  b.removeLine(q, 'SKU-200');
  assert.equal(q.lines.length, 2);
  assert.equal(q.totals.line_discount, 0);
});

test('addLine: not allowed on sent quote', () => {
  const b = new QuoteBuilder();
  const q = fixture(b);
  b.statusTransition(q.id, STATUS.SENT);
  assert.throws(
    () => b.addLine(q, { sku: 'X', qty: 1, unitPrice: 10 }),
    /cannot edit quote in status sent/
  );
});

/* ===========================================================================
 * reviseQuote — versioning
 * ========================================================================= */

test('reviseQuote: creates v2 with patched terms; v1 preserved', () => {
  const b = new QuoteBuilder();
  const q1 = fixture(b);
  b.statusTransition(q1.id, STATUS.SENT);
  const q2 = b.reviseQuote(q1.id, { terms: 'שוטף+60', reason: 'customer ask' });
  assert.equal(q2.version, 2);
  assert.equal(q2.terms, 'שוטף+60');
  assert.equal(q2.previous_version_id, q1.id);
  // Sent → revised goes back to draft
  assert.equal(q2.status, STATUS.DRAFT);

  const versions = b.listVersions(q1.id);
  assert.equal(versions.length, 2);
  assert.equal(versions[0].version, 1);
  assert.equal(versions[1].version, 2);
});

test('reviseQuote: v1 history is fully preserved (never deleted)', () => {
  const b = new QuoteBuilder();
  const q1 = fixture(b);
  const originalTerms = q1.terms;
  const originalLines = JSON.parse(JSON.stringify(q1.lines));
  b.statusTransition(q1.id, STATUS.SENT);
  b.reviseQuote(q1.id, { terms: 'changed', lines: [{ sku: 'NEW', qty: 1, unitPrice: 100 }] });
  // v1 still accessible
  const v1 = b.getVersion(q1.id, 1);
  assert.equal(v1.terms, originalTerms);
  assert.deepEqual(v1.lines[0].sku, originalLines[0].sku);
});

test('reviseQuote: replace lines patch', () => {
  const b = new QuoteBuilder();
  const q1 = fixture(b);
  const q2 = b.reviseQuote(q1.id, {
    lines: [{ sku: 'NEW-1', qty: 2, unitPrice: 500 }]
  });
  assert.equal(q2.lines.length, 1);
  assert.equal(q2.totals.net, 1000);
});

test('reviseQuote: listVersions returns all; getVersion by number', () => {
  const b = new QuoteBuilder();
  const q1 = fixture(b);
  b.reviseQuote(q1.id, { reason: 'r1' });
  b.reviseQuote(q1.id, { reason: 'r2' });
  assert.equal(b.listVersions(q1.id).length, 3);
  assert.equal(b.getVersion(q1.id, 2).version, 2);
  assert.equal(b.getVersion(q1.id).version, 3); // head
});

test('reviseQuote: throws for unknown id', () => {
  const b = new QuoteBuilder();
  assert.throws(() => b.reviseQuote('nope'), /not found/);
});

/* ===========================================================================
 * statusTransition
 * ========================================================================= */

test('statusTransition: draft → sent → accepted → won happy path', () => {
  const b = new QuoteBuilder();
  const q = fixture(b);
  b.statusTransition(q.id, STATUS.SENT, { actor: 'u1', reason: 'emailed' });
  assert.equal(q.status, 'sent');
  b.statusTransition(q.id, STATUS.ACCEPTED, { actor: 'u1' });
  assert.equal(q.status, 'accepted');
  b.statusTransition(q.id, STATUS.WON, { actor: 'u1', reason: 'signed' });
  assert.equal(q.status, 'won');

  // history: created, sent, accepted, won = 4
  assert.equal(q.history.length, 4);
  assert.equal(q.history[1].to, 'sent');
  assert.equal(q.history[3].reason, 'signed');
});

test('statusTransition: accepted → lost is legal', () => {
  const b = new QuoteBuilder();
  const q = fixture(b);
  b.statusTransition(q.id, STATUS.SENT);
  b.statusTransition(q.id, STATUS.ACCEPTED);
  b.statusTransition(q.id, STATUS.LOST);
  assert.equal(q.status, 'lost');
});

test('statusTransition: illegal draft → won', () => {
  const b = new QuoteBuilder();
  const q = fixture(b);
  assert.throws(
    () => b.statusTransition(q.id, STATUS.WON),
    /illegal transition draft/
  );
});

test('statusTransition: illegal draft → accepted', () => {
  const b = new QuoteBuilder();
  const q = fixture(b);
  assert.throws(
    () => b.statusTransition(q.id, STATUS.ACCEPTED),
    /illegal transition draft/
  );
});

test('statusTransition: terminal states cannot move', () => {
  const b = new QuoteBuilder();
  const q = fixture(b);
  b.statusTransition(q.id, STATUS.SENT);
  b.statusTransition(q.id, STATUS.ACCEPTED);
  b.statusTransition(q.id, STATUS.WON);
  assert.throws(() => b.statusTransition(q.id, STATUS.LOST), /illegal transition won/);
});

test('statusTransition: any → expired is legal before terminal', () => {
  const b = new QuoteBuilder();
  // draft → expired
  const q1 = fixture(b);
  b.statusTransition(q1.id, STATUS.EXPIRED);
  assert.equal(q1.status, 'expired');
  // sent → expired
  const q2 = fixture(b);
  b.statusTransition(q2.id, STATUS.SENT);
  b.statusTransition(q2.id, STATUS.EXPIRED);
  assert.equal(q2.status, 'expired');
});

/* ===========================================================================
 * convertToOrder
 * ========================================================================= */

test('convertToOrder: requires accepted or won', () => {
  const b = new QuoteBuilder();
  const q = fixture(b);
  assert.throws(() => b.convertToOrder(q), /must be accepted or won/);
});

test('convertToOrder: preserves totals, lines, customer, allocation placeholder', () => {
  const b = new QuoteBuilder();
  const q = fixture(b);
  b.statusTransition(q.id, STATUS.SENT);
  b.statusTransition(q.id, STATUS.ACCEPTED);
  const order = b.convertToOrder(q);
  assert.equal(order.order_type, 'sales_order');
  assert.equal(order.source_quote_id, q.id);
  assert.equal(order.source_quote_number, q.number);
  assert.equal(order.lines.length, q.lines.length);
  assert.equal(order.totals.net, q.totals.net);
  assert.equal(order.customer.name, q.customer.name);
  assert.equal(order.allocation_number, null);
  assert.equal(order.allocation_source, 'pending');
  assert.equal(order.status, 'pending_fulfillment');
});

/* ===========================================================================
 * Hebrew glossary + PDF fallback
 * ========================================================================= */

test('glossary: all status labels bilingual', () => {
  for (const s of ['Draft', 'Sent', 'Accepted', 'Won', 'Lost', 'Expired']) {
    const key = 'status' + s;
    assert.ok(GLOSSARY[key], `missing ${key}`);
    assert.ok(GLOSSARY[key].he && GLOSSARY[key].he.length > 0);
    assert.ok(GLOSSARY[key].en && GLOSSARY[key].en.length > 0);
  }
});

test('glossary: reforma 2024 notice bilingual', () => {
  assert.match(GLOSSARY.reformaNotice.he, /רפורמת החשבונית 2024/);
  assert.match(GLOSSARY.reformaNotice.en, /2024 invoice reform/);
});

test('generatePDF: produces PDF or bilingual text fallback', async () => {
  const b = new QuoteBuilder({ pdfDir: TMP_DIR });
  const q = fixture(b);
  const result = await b.generatePDF(q);
  assert.ok(result);
  assert.ok(result.engine === 'pdfkit' || result.engine === 'text');
  assert.ok(result.size > 0);
  if (result.engine === 'pdfkit') {
    assert.ok(result.path && fs.existsSync(result.path));
    assert.match(result.path, /\.pdf$/);
  } else {
    assert.match(result.text, /הצעת מחיר/);
    assert.match(result.text, /Sales Quote/);
    assert.match(result.text, /SKU-100/);
    assert.match(result.text, /reform/i);
  }
});

test('statusTransition: throws for unknown id', () => {
  const b = new QuoteBuilder();
  assert.throws(() => b.statusTransition('missing', STATUS.SENT), /not found/);
});

/* ===========================================================================
 * FX engine hook (optional)
 * ========================================================================= */

test('convertCurrency: uses injected fxEngine', () => {
  const fakeFx = {
    convert(amount, from, to /* , date */) {
      // fake 1 USD = 3.70 ILS
      const rate = (from === 'ILS' && to === 'USD') ? 1 / 3.70 : 3.70;
      return {
        amount, from, to, rate, converted: amount * rate,
        source: 'TEST', asOf: '2026-04-11', stale: false, direction: 'direct'
      };
    }
  };
  const b = new QuoteBuilder({ fxEngine: fakeFx });
  const q = b.createQuote({
    customer: { name: 'X' },
    items: [{ sku: 'A', qty: 1, unitPrice: 370 }]
  });
  // Net 370, VAT 62.9, Gross 432.9 ILS
  const usd = b.convertCurrency(q, 'USD');
  assert.equal(usd.currency, 'USD');
  assert.ok(usd.gross > 0 && usd.gross < 200); // roughly 432.9 / 3.70 ≈ 117
  assert.equal(usd.fx.from, 'ILS');
  assert.equal(usd.fx.to, 'USD');
});

test('convertCurrency: throws without fxEngine', () => {
  const b = new QuoteBuilder({ fxEngine: null });
  // Force null after ctor to bypass auto-load
  b.fxEngine = null;
  const q = b.createQuote({
    customer: { name: 'X' },
    items: [{ sku: 'A', qty: 1, unitPrice: 100 }]
  });
  assert.throws(() => b.convertCurrency(q, 'USD'), /no fxEngine/);
});

/* ===========================================================================
 * Never-delete rule — revised quote always has lower version preserved
 * ========================================================================= */

test('never-delete rule: chain grows monotonically', () => {
  const b = new QuoteBuilder();
  const q1 = fixture(b);
  for (let i = 0; i < 5; i++) {
    b.reviseQuote(q1.id, { reason: `r${i}` });
  }
  const versions = b.listVersions(q1.id);
  assert.equal(versions.length, 6);
  for (let v = 1; v <= 6; v++) {
    assert.ok(b.getVersion(q1.id, v), `v${v} should exist`);
  }
});
