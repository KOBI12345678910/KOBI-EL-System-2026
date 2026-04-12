/**
 * Unit tests for onyx-procurement/src/rfq/rfq-engine.js
 * Agent X-28 — Swarm 3B — Techno-Kol Uzi mega-ERP — 2026-04-11
 *
 * Run:
 *   node --test test/payroll/rfq-engine.test.js
 *
 * Scope:
 *   - Full RFQ lifecycle (create → invite → bid → close → score → award)
 *   - State-machine legal transitions
 *   - Blind bidding (supplier view isolation)
 *   - Deadline enforcement
 *   - Minimum-bid compliance flags
 *   - Weighted scoring math (incl. normalization)
 *   - Q&A broadcast
 *   - Revision / supersession (never delete)
 *   - Archive → preserves data
 *   - Full audit trail
 *   - Validation errors
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const rfqMod = require('../../onyx-procurement/src/rfq/rfq-engine');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function basicFields(overrides = {}) {
  return {
    title: 'רכש כבלי חשמל לבניין מזרח',
    titleEn: 'Procurement of power cables — East building',
    description: 'הזמנה עבור פרויקט חשמל ראשי',
    currency: 'ILS',
    deadline: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    minBids: 3,
    publicSector: false,
    lineItems: [
      {
        description: 'כבל NYY 5x16mm',
        spec: 'תקן ישראלי 61',
        quantity: 500,
        unit: 'מטר',
        target_delivery: '2026-05-15',
        currency: 'ILS',
      },
      {
        description: 'כבל NYY 5x25mm',
        spec: 'תקן ישראלי 61',
        quantity: 300,
        unit: 'מטר',
        target_delivery: '2026-05-15',
        currency: 'ILS',
      },
    ],
    ...overrides,
  };
}

function newEngine(opts) {
  return rfqMod.createRfqEngine(opts);
}

async function setupOpenRfq(engine, fields) {
  const rfqId = engine.createRfq(fields || basicFields(), 'buyer-01');
  const invs = await engine.inviteSuppliers(
    rfqId,
    ['supA', 'supB', 'supC'],
    'buyer-01'
  );
  return { rfqId, invs };
}

function makeBid(rfq, prices, extras = {}) {
  return {
    supplierName: extras.supplierName || 'ספק לדוגמה בע״מ',
    currency: rfq.currency || 'ILS',
    lines: prices.map((p) => ({ unitPrice: p })),
    deliveryDays: extras.deliveryDays ?? 20,
    qualityScore: extras.qualityScore ?? 80,
    paymentTermsDays: extras.paymentTermsDays ?? 30,
    notes: extras.notes || '',
  };
}

// ---------------------------------------------------------------------------
// 1. createRfq — basic creation
// ---------------------------------------------------------------------------

test('createRfq: creates RFQ in DRAFT state with line items', () => {
  const engine = newEngine();
  const rfqId = engine.createRfq(basicFields(), 'buyer-01');
  assert.match(rfqId, /^rfq_/);
  const rfq = engine.getRfq(rfqId);
  assert.equal(rfq.state, 'DRAFT');
  assert.equal(rfq.title, 'רכש כבלי חשמל לבניין מזרח');
  assert.equal(rfq.lineItems.length, 2);
  assert.equal(rfq.createdBy, 'buyer-01');
  assert.equal(rfq.currency, 'ILS');
  assert.equal(rfq.legalFlags.length, 0);
});

// ---------------------------------------------------------------------------
// 2. Validation — missing fields
// ---------------------------------------------------------------------------

test('createRfq: rejects missing title', () => {
  const engine = newEngine();
  assert.throws(
    () => engine.createRfq(basicFields({ title: '' })),
    /title is required/
  );
});

test('createRfq: rejects empty line items', () => {
  const engine = newEngine();
  assert.throws(
    () => engine.createRfq(basicFields({ lineItems: [] })),
    /at least one line item/
  );
});

test('createRfq: rejects negative quantity', () => {
  const engine = newEngine();
  const f = basicFields();
  f.lineItems[0].quantity = -5;
  assert.throws(() => engine.createRfq(f), /quantity must be positive/);
});

test('createRfq: rejects unsupported currency', () => {
  const engine = newEngine();
  assert.throws(
    () => engine.createRfq(basicFields({ currency: 'ZZZ' })),
    /Currency ZZZ not supported/
  );
});

// ---------------------------------------------------------------------------
// 3. Public-sector legal flags
// ---------------------------------------------------------------------------

test('createRfq: public sector sets legal flags (חוק חובת מכרזים)', () => {
  const engine = newEngine();
  const rfqId = engine.createRfq(basicFields({ publicSector: true }), 'gov-buyer');
  const rfq = engine.getRfq(rfqId);
  assert.ok(rfq.publicSector);
  assert.ok(rfq.legalFlags.includes('חוק חובת מכרזים'));
  assert.ok(rfq.legalFlags.includes('Public Procurement Law'));
});

// ---------------------------------------------------------------------------
// 4. Invite suppliers + email stub
// ---------------------------------------------------------------------------

test('inviteSuppliers: generates unique tokens and sends emails', async () => {
  const engine = newEngine();
  const rfqId = engine.createRfq(basicFields(), 'buyer-01');
  const invs = await engine.inviteSuppliers(
    rfqId,
    ['supA', 'supB', 'supC'],
    'buyer-01'
  );
  assert.equal(invs.length, 3);
  const tokens = new Set(invs.map((i) => i.token));
  assert.equal(tokens.size, 3, 'tokens must be unique');
  for (const i of invs) {
    assert.match(i.token, /^[A-Za-z0-9_-]{20,}$/);
    assert.ok(i.url.includes(i.token));
  }
  const sent = engine._mailer.list();
  assert.equal(sent.length, 3);
  assert.ok(sent[0].body.includes('הנכם מוזמנים להגיש הצעת מחיר'));
  // Reinvoking returns existing invitations (no duplicates)
  const again = await engine.inviteSuppliers(rfqId, ['supA'], 'buyer-01');
  assert.equal(again[0].id, invs[0].id);
});

// ---------------------------------------------------------------------------
// 5. State transition — DRAFT→INVITED→OPEN
// ---------------------------------------------------------------------------

test('inviteSuppliers: transitions DRAFT → OPEN after send', async () => {
  const engine = newEngine();
  const rfqId = engine.createRfq(basicFields(), 'buyer-01');
  assert.equal(engine.getRfq(rfqId).state, 'DRAFT');
  await engine.inviteSuppliers(rfqId, ['supA', 'supB', 'supC']);
  assert.equal(engine.getRfq(rfqId).state, 'OPEN');
});

// ---------------------------------------------------------------------------
// 6. Public-sector: requires minBids invitations
// ---------------------------------------------------------------------------

test('inviteSuppliers: public-sector requires minBids invitees', async () => {
  const engine = newEngine();
  const rfqId = engine.createRfq(
    basicFields({ publicSector: true, minBids: 3 }),
    'gov-buyer'
  );
  await assert.rejects(
    () => engine.inviteSuppliers(rfqId, ['supA', 'supB'], 'gov-buyer'),
    /at least 3 invitations/
  );
});

// ---------------------------------------------------------------------------
// 7. submitBid — happy path + no-auth via token
// ---------------------------------------------------------------------------

test('submitBid: accepts valid bid via token (no login)', async () => {
  const engine = newEngine();
  const { rfqId, invs } = await setupOpenRfq(engine);
  const rfq = engine.getRfq(rfqId);

  const bidId = engine.submitBid(
    invs[0].token,
    makeBid(rfq, [10, 20], { supplierName: 'ספק A בע״מ' })
  );
  assert.match(bidId, /^bid_/);

  const allBids = engine._storage.listBids(rfqId);
  assert.equal(allBids.length, 1);
  assert.equal(allBids[0].totalPrice, 10 * 500 + 20 * 300);
  assert.equal(allBids[0].supplierId, 'supA');
});

// ---------------------------------------------------------------------------
// 8. submitBid — invalid token
// ---------------------------------------------------------------------------

test('submitBid: rejects invalid token', async () => {
  const engine = newEngine();
  const { rfqId } = await setupOpenRfq(engine);
  const rfq = engine.getRfq(rfqId);
  assert.throws(
    () => engine.submitBid('not-a-real-token', makeBid(rfq, [10, 20])),
    /Invalid invitation token/
  );
});

// ---------------------------------------------------------------------------
// 9. submitBid — deadline enforcement
// ---------------------------------------------------------------------------

test('submitBid: enforces deadline — rejects past deadlines', async () => {
  const engine = newEngine();
  const rfqId = engine.createRfq(
    basicFields({
      deadline: new Date(Date.now() - 1000).toISOString(),
    })
  );
  const invs = await engine.inviteSuppliers(rfqId, ['supA', 'supB', 'supC']);
  const rfq = engine.getRfq(rfqId);
  assert.throws(
    () => engine.submitBid(invs[0].token, makeBid(rfq, [10, 20])),
    /deadline has passed/
  );
});

// ---------------------------------------------------------------------------
// 10. Revision — previous bid superseded, never deleted
// ---------------------------------------------------------------------------

test('submitBid: revisions supersede — nothing is deleted', async () => {
  const engine = newEngine();
  const { rfqId, invs } = await setupOpenRfq(engine);
  const rfq = engine.getRfq(rfqId);
  const id1 = engine.submitBid(invs[0].token, makeBid(rfq, [10, 20]));
  const id2 = engine.submitBid(invs[0].token, makeBid(rfq, [9, 18]));
  const allBids = engine._storage.listBids(rfqId);
  assert.equal(allBids.length, 2);
  const prev = allBids.find((b) => b.id === id1);
  const curr = allBids.find((b) => b.id === id2);
  assert.ok(prev.superseded);
  assert.ok(!curr.superseded);
  const active = allBids.filter((b) => !b.superseded);
  assert.equal(active.length, 1);
});

// ---------------------------------------------------------------------------
// 11. closeRfq — locks and transitions
// ---------------------------------------------------------------------------

test('closeRfq: transitions OPEN → CLOSED and blocks further bids', async () => {
  const engine = newEngine();
  const { rfqId, invs } = await setupOpenRfq(engine);
  const rfq = engine.getRfq(rfqId);
  engine.submitBid(invs[0].token, makeBid(rfq, [10, 20]));
  engine.submitBid(invs[1].token, makeBid(rfq, [11, 19]));
  engine.submitBid(invs[2].token, makeBid(rfq, [12, 18]));

  engine.closeRfq(rfqId, 'buyer-01');
  assert.equal(engine.getRfq(rfqId).state, 'CLOSED');

  assert.throws(
    () => engine.submitBid(invs[0].token, makeBid(rfq, [8, 16])),
    /expected one of OPEN/
  );
});

// ---------------------------------------------------------------------------
// 12. Minimum-bid compliance flag
// ---------------------------------------------------------------------------

test('closeRfq: flags public-sector RFQ closed with < minBids', async () => {
  const engine = newEngine();
  const rfqId = engine.createRfq(
    basicFields({ publicSector: true, minBids: 3 }),
    'gov-buyer'
  );
  const invs = await engine.inviteSuppliers(
    rfqId,
    ['supA', 'supB', 'supC', 'supD'],
    'gov-buyer'
  );
  const rfq = engine.getRfq(rfqId);
  // Only two suppliers respond
  engine.submitBid(invs[0].token, makeBid(rfq, [10, 20]));
  engine.submitBid(invs[1].token, makeBid(rfq, [11, 19]));
  engine.closeRfq(rfqId, 'gov-buyer');
  const closed = engine.getRfq(rfqId);
  assert.ok(
    closed.legalFlags.some((f) => f.includes('Insufficient bids')),
    'legalFlags should mention insufficient bids'
  );
  const audit = engine.getAuditTrail(rfqId);
  assert.ok(audit.some((a) => a.action === 'compliance:insufficient_bids'));
});

// ---------------------------------------------------------------------------
// 13. scoreBids — weighted scoring math
// ---------------------------------------------------------------------------

test('scoreBids: computes weighted scores and ranks correctly', async () => {
  const engine = newEngine();
  const { rfqId, invs } = await setupOpenRfq(engine);
  const rfq = engine.getRfq(rfqId);
  // Cheapest
  engine.submitBid(
    invs[0].token,
    makeBid(rfq, [10, 20], {
      deliveryDays: 30,
      qualityScore: 70,
      paymentTermsDays: 30,
      supplierName: 'A',
    })
  );
  // Middle
  engine.submitBid(
    invs[1].token,
    makeBid(rfq, [11, 21], {
      deliveryDays: 20,
      qualityScore: 85,
      paymentTermsDays: 45,
      supplierName: 'B',
    })
  );
  // Expensive but fast
  engine.submitBid(
    invs[2].token,
    makeBid(rfq, [15, 25], {
      deliveryDays: 10,
      qualityScore: 95,
      paymentTermsDays: 60,
      supplierName: 'C',
    })
  );

  engine.closeRfq(rfqId, 'buyer-01');
  const ranked = engine.scoreBids(rfqId, {
    price: 0.5,
    delivery: 0.2,
    quality: 0.2,
    paymentTerms: 0.1,
  });

  assert.equal(ranked.length, 3);
  // Ranked strictly descending by score
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(ranked[i - 1].score >= ranked[i].score);
  }
  // Every component in [0,100]
  for (const r of ranked) {
    for (const key of ['price', 'delivery', 'quality', 'paymentTerms']) {
      assert.ok(r.components[key] >= 0 && r.components[key] <= 100);
    }
  }
  // Best price = supplier A → price component = 100
  const a = ranked.find((r) => r.supplierName === 'A');
  assert.equal(a.components.price, 100);
  // Fastest delivery = C → delivery component = 100
  const c = ranked.find((r) => r.supplierName === 'C');
  assert.equal(c.components.delivery, 100);
});

// ---------------------------------------------------------------------------
// 14. Weight normalization — non-normalized weights still work
// ---------------------------------------------------------------------------

test('scoreBids: normalizes arbitrary weight totals', async () => {
  const engine = newEngine();
  const { rfqId, invs } = await setupOpenRfq(engine);
  const rfq = engine.getRfq(rfqId);
  engine.submitBid(invs[0].token, makeBid(rfq, [10, 20], { supplierName: 'A' }));
  engine.submitBid(invs[1].token, makeBid(rfq, [11, 21], { supplierName: 'B' }));
  engine.submitBid(invs[2].token, makeBid(rfq, [12, 22], { supplierName: 'C' }));
  engine.closeRfq(rfqId);
  // Weights sum = 300 — should normalize internally
  const ranked = engine.scoreBids(rfqId, {
    price: 150,
    delivery: 60,
    quality: 60,
    paymentTerms: 30,
  });
  assert.equal(ranked.length, 3);
  // The normalizer should yield the same weight ratios as {0.5,0.2,0.2,0.1}
  const normalized = rfqMod._normalizeWeights({
    price: 150,
    delivery: 60,
    quality: 60,
    paymentTerms: 30,
  });
  assert.equal(rfqMod._round2(normalized.price), 0.5);
  assert.equal(rfqMod._round2(normalized.delivery), 0.2);
  assert.equal(rfqMod._round2(normalized.quality), 0.2);
  assert.equal(rfqMod._round2(normalized.paymentTerms), 0.1);
});

// ---------------------------------------------------------------------------
// 15. awardRfq — transitions and creates PO
// ---------------------------------------------------------------------------

test('awardRfq: transitions SCORED → AWARDED and produces PO', async () => {
  const engine = newEngine();
  const { rfqId, invs } = await setupOpenRfq(engine);
  const rfq = engine.getRfq(rfqId);
  const bA = engine.submitBid(invs[0].token, makeBid(rfq, [10, 20], { supplierName: 'A' }));
  engine.submitBid(invs[1].token, makeBid(rfq, [11, 21], { supplierName: 'B' }));
  engine.submitBid(invs[2].token, makeBid(rfq, [12, 22], { supplierName: 'C' }));
  engine.closeRfq(rfqId);
  engine.scoreBids(rfqId);
  const { poId, rfq: rfqAfter, po } = engine.awardRfq(rfqId, bA, 'buyer-01');
  assert.match(poId, /^po_/);
  assert.equal(rfqAfter.state, 'AWARDED');
  assert.equal(rfqAfter.awardedBidId, bA);
  assert.equal(rfqAfter.awardedPoId, poId);
  assert.equal(po.total, 10 * 500 + 20 * 300);
  assert.equal(po.lines.length, 2);
  assert.equal(po.status, 'issued');
});

// ---------------------------------------------------------------------------
// 16. State-machine — illegal transition blocked
// ---------------------------------------------------------------------------

test('state machine: cannot award directly from DRAFT', async () => {
  const engine = newEngine();
  const rfqId = engine.createRfq(basicFields());
  assert.throws(
    () => engine.awardRfq(rfqId, 'bid_nonexistent', 'buyer-01'),
    /expected one of SCORED/
  );
});

// ---------------------------------------------------------------------------
// 17. Blind bidding — supplier view isolation
// ---------------------------------------------------------------------------

test('getSupplierView: supplier cannot see other suppliers data', async () => {
  const engine = newEngine();
  const { rfqId, invs } = await setupOpenRfq(engine);
  const rfq = engine.getRfq(rfqId);
  engine.submitBid(invs[0].token, makeBid(rfq, [10, 20], { supplierName: 'A' }));
  engine.submitBid(invs[1].token, makeBid(rfq, [11, 21], { supplierName: 'B' }));
  // Supplier A fetches their view
  const viewA = engine.getSupplierView(invs[0].token);
  assert.equal(viewA.supplierId, 'supA');
  assert.equal(viewA.myBids.length, 1);
  assert.equal(viewA.myBids[0].supplierName, 'A');
  // The view must not contain supplier B's bid anywhere
  const json = JSON.stringify(viewA);
  assert.ok(!json.includes('"supplierName":"B"'));
  assert.ok(viewA.canSubmit);
});

// ---------------------------------------------------------------------------
// 18. Q&A — broadcast to all suppliers
// ---------------------------------------------------------------------------

test('qaAnswer: broadcasts to all invited suppliers', async () => {
  const engine = newEngine();
  const { rfqId, invs } = await setupOpenRfq(engine);
  engine._mailer.clear();
  // Supplier A asks a clarifying question
  const qId = engine.qaAddQuestion(
    rfqId,
    invs[0].token,
    'האם ניתן לקבל אישור תקן ישראלי 61 מהיצרן?'
  );
  engine._mailer.clear();
  await engine.qaAnswer(
    rfqId,
    qId,
    'כן — נא לצרף אישור סקור בהצעה',
    'buyer-01'
  );
  const sent = engine._mailer.list();
  assert.equal(sent.length, invs.length, 'Q&A answer must fan out to everyone');
  for (const msg of sent) {
    assert.ok(msg.meta.broadcast);
    assert.ok(msg.body.includes('נא לצרף אישור סקור'));
  }
});

// ---------------------------------------------------------------------------
// 19. Comparison matrix — best-price highlighting
// ---------------------------------------------------------------------------

test('buildComparisonMatrix: flags bestPrice per line', async () => {
  const engine = newEngine();
  const { rfqId, invs } = await setupOpenRfq(engine);
  const rfq = engine.getRfq(rfqId);
  engine.submitBid(invs[0].token, makeBid(rfq, [10, 25], { supplierName: 'A' }));
  engine.submitBid(invs[1].token, makeBid(rfq, [12, 20], { supplierName: 'B' }));
  engine.submitBid(invs[2].token, makeBid(rfq, [15, 22], { supplierName: 'C' }));
  const m = engine.buildComparisonMatrix(rfqId);
  // Line 0: supplier A best at 10
  const l0 = m.lines[0];
  assert.equal(l0.bestPrice, 10);
  const l0Best = l0.cells.find((c) => c.isBest);
  assert.equal(l0Best.supplierName, 'A');
  // Line 1: supplier B best at 20
  const l1 = m.lines[1];
  assert.equal(l1.bestPrice, 20);
  const l1Best = l1.cells.find((c) => c.isBest);
  assert.equal(l1Best.supplierName, 'B');
});

// ---------------------------------------------------------------------------
// 20. Archive — preserves data
// ---------------------------------------------------------------------------

test('archiveRfq: flips state without deleting data', async () => {
  const engine = newEngine();
  const rfqId = engine.createRfq(basicFields());
  engine.archiveRfq(rfqId, 'buyer-01');
  const r = engine.getRfq(rfqId);
  assert.equal(r.state, 'ARCHIVED');
  assert.ok(r.archivedAt);
  assert.ok(r.title, 'Original data is preserved');
  assert.ok(r.lineItems.length > 0);
});

// ---------------------------------------------------------------------------
// 21. Audit trail — complete
// ---------------------------------------------------------------------------

test('audit trail: records every lifecycle event', async () => {
  const engine = newEngine();
  const { rfqId, invs } = await setupOpenRfq(engine);
  const rfq = engine.getRfq(rfqId);
  const bA = engine.submitBid(invs[0].token, makeBid(rfq, [10, 20], { supplierName: 'A' }));
  engine.submitBid(invs[1].token, makeBid(rfq, [11, 21], { supplierName: 'B' }));
  engine.submitBid(invs[2].token, makeBid(rfq, [12, 22], { supplierName: 'C' }));
  engine.closeRfq(rfqId, 'buyer-01');
  engine.scoreBids(rfqId);
  engine.awardRfq(rfqId, bA, 'buyer-01');
  engine.archiveRfq(rfqId, 'buyer-01');

  const audit = engine.getAuditTrail(rfqId);
  const actions = audit.map((a) => a.action);
  assert.ok(actions.includes('rfq:created'));
  assert.ok(actions.includes('supplier:invited'));
  assert.ok(actions.includes('bid:submitted'));
  assert.ok(actions.some((a) => a.startsWith('state:OPEN->CLOSED')));
  assert.ok(actions.some((a) => a.startsWith('state:CLOSED->SCORED')));
  assert.ok(actions.some((a) => a.startsWith('state:SCORED->AWARDED')));
  assert.ok(actions.some((a) => a.startsWith('state:AWARDED->ARCHIVED')));
  // Every entry has timestamp + actor
  for (const ev of audit) {
    assert.ok(ev.at);
    assert.ok(ev.actor);
    assert.ok(ev.id);
  }
});

// ---------------------------------------------------------------------------
// 22. Validation — bid with wrong line-count
// ---------------------------------------------------------------------------

test('submitBid: rejects bid with mismatched line count', async () => {
  const engine = newEngine();
  const { rfqId, invs } = await setupOpenRfq(engine);
  const rfq = engine.getRfq(rfqId);
  // RFQ has 2 line items — bid has 1
  const badBid = {
    supplierName: 'Bad Co',
    lines: [{ unitPrice: 10 }],
    deliveryDays: 10,
    qualityScore: 80,
    paymentTermsDays: 30,
  };
  assert.throws(
    () => engine.submitBid(invs[0].token, badBid),
    /must have exactly 2 line/
  );
  // Sanity-check that scoring still works after a valid bid
  const good = engine.submitBid(invs[0].token, makeBid(rfq, [10, 20]));
  assert.match(good, /^bid_/);
});

// ---------------------------------------------------------------------------
// 23. Scoring handles edge case — only one bid
// ---------------------------------------------------------------------------

test('scoreBids: handles single-bid case without divide-by-zero', async () => {
  const engine = newEngine();
  const { rfqId, invs } = await setupOpenRfq(engine);
  const rfq = engine.getRfq(rfqId);
  engine.submitBid(invs[0].token, makeBid(rfq, [10, 20], { supplierName: 'Only' }));
  engine.closeRfq(rfqId);
  const ranked = engine.scoreBids(rfqId);
  assert.equal(ranked.length, 1);
  // When every metric has a single value, the component defaults to 100.
  assert.equal(ranked[0].components.price, 100);
  assert.equal(ranked[0].components.delivery, 100);
  assert.ok(ranked[0].score > 0);
  assert.equal(ranked[0].rank, 1);
});
