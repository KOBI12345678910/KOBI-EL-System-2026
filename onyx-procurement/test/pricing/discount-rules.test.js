/**
 * Discount Rules Engine — tests
 * Agent Y-019 — Swarm: Mega-ERP Techno-Kol Uzi
 *
 * Run:
 *   node --test onyx-procurement/test/pricing/discount-rules.test.js
 *
 * Covers (as required):
 *   • stacking with priority
 *   • exclusivity lockout
 *   • date window filtering
 *   • BOGO math
 *   • maxDiscount cap
 *   • explain() bilingual output
 *   + bonus: validateRule, disableRule never deletes, consumer-
 *     protection prior-price guard, cart-wide safety cap.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DiscountEngine,
  CONSTANTS,
  evaluateCondition,
} = require('../../src/pricing/discount-rules.js');

// ───────── helpers ─────────
function makeCart() {
  return {
    customer: { id: 'C1', tier: 'vip' },
    lines: [
      { sku: 'STEEL-10', description: 'Steel sheet 10mm', qty: 4, unitPrice: 250 },
      { sku: 'BOLT-M8',  description: 'Bolt M8',          qty: 10, unitPrice: 5 },
      { sku: 'PAINT-RED', description: 'Red paint 1L',    qty: 2, unitPrice: 80 },
    ],
    context: { date: '2026-04-11T10:00:00Z' },
  };
}

// =========================================================
// validateRule
// =========================================================
test('validateRule — rejects invalid rules with messages', () => {
  const eng = new DiscountEngine();
  const bad = eng.validateRule({ id: 'x' });  // missing type and action
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.length >= 2);

  const bad2 = eng.validateRule({
    id: 'p1',
    type: 'cart',
    action: { type: 'percent', value: 150 },
  });
  assert.equal(bad2.ok, false);
  assert.ok(bad2.errors.some((e) => e.includes('percent')));

  const bad3 = eng.validateRule({
    id: 'p2',
    type: 'cart',
    action: { type: 'percent', value: 10 },
    startDate: '2026-06-01',
    endDate: '2026-05-01',
  });
  assert.equal(bad3.ok, false);
  assert.ok(bad3.errors.some((e) => e.includes('startDate')));
});

test('validateRule — accepts a good rule', () => {
  const eng = new DiscountEngine();
  const ok = eng.validateRule({
    id: 'ok-1',
    type: 'cart',
    condition: { field: 'cart.subtotal', op: 'gt', value: 0 },
    action: { type: 'percent', value: 10 },
    priority: 100,
  });
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
});

// =========================================================
// defineRule — upgrade-not-delete (versioning)
// =========================================================
test('defineRule — re-defining keeps history (never deletes)', () => {
  const eng = new DiscountEngine();
  eng.defineRule({
    id: 'r1', type: 'cart',
    action: { type: 'percent', value: 5 },
  });
  eng.defineRule({
    id: 'r1', type: 'cart',
    action: { type: 'percent', value: 10 },
  });
  const r = eng.getRule('r1');
  assert.equal(r.version, 2);
  assert.equal(r.action.value, 10);
  assert.equal(r.history.length, 1);
  assert.equal(r.history[0].snapshot.action.value, 5);
});

test('disableRule — soft disable, rule still present', () => {
  const eng = new DiscountEngine();
  eng.defineRule({
    id: 'r1', type: 'cart',
    action: { type: 'percent', value: 10 },
  });
  eng.disableRule('r1');
  assert.equal(eng.getRule('r1').disabled, true);
  assert.equal(eng.listRules().length, 1);
  assert.equal(eng.listActiveRules('2026-04-11').length, 0);
});

// =========================================================
// date window
// =========================================================
test('listActiveRules — filters by date window', () => {
  const eng = new DiscountEngine();
  eng.defineRule({
    id: 'pesach', type: 'period',
    action: { type: 'percent', value: 15 },
    startDate: '2026-04-01', endDate: '2026-04-15',
  });
  eng.defineRule({
    id: 'pre-sukkot', type: 'period',
    action: { type: 'percent', value: 10 },
    startDate: '2026-09-01', endDate: '2026-09-30',
  });
  const activeNow = eng.listActiveRules('2026-04-11');
  assert.equal(activeNow.length, 1);
  assert.equal(activeNow[0].id, 'pesach');

  const activeSept = eng.listActiveRules('2026-09-10');
  assert.equal(activeSept.length, 1);
  assert.equal(activeSept[0].id, 'pre-sukkot');

  const activeDec = eng.listActiveRules('2026-12-01');
  assert.equal(activeDec.length, 0);
});

// =========================================================
// evaluate — condition matching
// =========================================================
test('evaluate — AND/OR/NOT condition tree', () => {
  const eng = new DiscountEngine();
  eng.defineRule({
    id: 'vip-big',
    type: 'customer',
    condition: {
      all: [
        { field: 'customer.tier', op: 'eq', value: 'vip' },
        { any: [
          { field: 'cart.lines.length', op: 'gt', value: 2 },
          { field: 'customer.total_spend_ytd', op: 'gt', value: 100000 },
        ] },
      ],
    },
    action: { type: 'percent', value: 7 },
  });

  const c1 = makeCart(); // 3 lines, vip
  const matches = eng.evaluate({ cart: c1, customer: c1.customer, context: c1.context });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 'vip-big');

  const c2 = { customer: { tier: 'regular' }, lines: c1.lines, context: c1.context };
  const matches2 = eng.evaluate({ cart: c2, customer: c2.customer });
  assert.equal(matches2.length, 0);
});

// =========================================================
// STACKING with priority
// =========================================================
test('evaluate + apply — stacking with priority order', () => {
  const eng = new DiscountEngine();
  // r1: lower priority — 5% off cart
  eng.defineRule({
    id: 'loyalty',
    type: 'customer',
    condition: { field: 'customer.tier', op: 'eq', value: 'vip' },
    action: { type: 'percent', value: 5 },
    priority: 50,
    stackable: true,
  });
  // r2: higher priority — ₪100 off cart
  eng.defineRule({
    id: 'welcome',
    type: 'cart',
    action: { type: 'amount', value: 100 },
    priority: 200,
    stackable: true,
  });

  const cart = makeCart();
  const order = eng.evaluate({ cart, customer: cart.customer, context: cart.context });
  assert.deepEqual(order.map((r) => r.id), ['welcome', 'loyalty']);

  const result = eng.apply(cart);
  // subtotal = 4*250 + 10*5 + 2*80 = 1000 + 50 + 160 = 1210
  assert.equal(result.subtotal, 1210);
  // welcome: 100 off -> 1110
  // loyalty 5% off remaining 1110 = 55.50
  // total discount = 155.50
  assert.equal(result.totalDiscount, 155.5);
  assert.equal(result.total, 1054.5);
  assert.equal(result.breakdown.length, 2);
  assert.equal(result.breakdown[0].ruleId, 'welcome');
  assert.equal(result.breakdown[1].ruleId, 'loyalty');
});

// =========================================================
// EXCLUSIVITY lockout
// =========================================================
test('evaluate — exclusive rule locks out lower-priority rules', () => {
  const eng = new DiscountEngine();
  eng.defineRule({
    id: 'clearance',
    type: 'cart',
    action: { type: 'percent', value: 30 },
    priority: 500,
    exclusive: true,
  });
  eng.defineRule({
    id: 'loyalty',
    type: 'customer',
    condition: { field: 'customer.tier', op: 'eq', value: 'vip' },
    action: { type: 'percent', value: 5 },
    priority: 100,
    stackable: true,
  });

  const cart = makeCart();
  const picked = eng.evaluate({ cart, customer: cart.customer, context: cart.context });
  assert.equal(picked.length, 1);
  assert.equal(picked[0].id, 'clearance');

  const result = eng.apply(cart);
  assert.equal(result.subtotal, 1210);
  assert.equal(result.totalDiscount, 363); // 30% of 1210
  assert.equal(result.total, 847);
});

test('evaluate — non-stackable lower-priority rule is skipped when stackable higher rule picked', () => {
  const eng = new DiscountEngine();
  eng.defineRule({
    id: 'hi-stackable',
    type: 'cart',
    action: { type: 'percent', value: 10 },
    priority: 500,
    stackable: true,
  });
  eng.defineRule({
    id: 'lo-non-stackable',
    type: 'cart',
    action: { type: 'percent', value: 20 },
    priority: 100,
    stackable: false,
  });
  const cart = makeCart();
  const picked = eng.evaluate({ cart, customer: cart.customer, context: cart.context });
  // Only the higher-priority stackable rule picked; the lower
  // non-stackable is filtered out because something is already
  // in the list.
  assert.equal(picked.length, 1);
  assert.equal(picked[0].id, 'hi-stackable');
});

// =========================================================
// BOGO
// =========================================================
test('apply — BOGO on eligible SKU grants correct free units', () => {
  const eng = new DiscountEngine();
  eng.defineRule({
    id: 'bogo-steel',
    type: 'item',
    action: { type: 'bogo', value: 1, targetSku: 'STEEL-10', scope: 'line' },
    priority: 300,
  });

  const cart = makeCart();
  // 4 units of STEEL-10 @250 — floor(4/2)=2 eligible, but value=1 so 1 free
  const result = eng.apply(cart);
  assert.equal(result.subtotal, 1210);
  assert.equal(result.totalDiscount, 250);  // one unit of STEEL-10 free
  assert.equal(result.total, 960);
  assert.equal(result.breakdown[0].detail.freeUnits, 1);
});

test('apply — BOGO with high value only takes half of qty', () => {
  const eng = new DiscountEngine();
  eng.defineRule({
    id: 'bogo-big',
    type: 'item',
    action: { type: 'bogo', value: 99, targetSku: 'STEEL-10', scope: 'line' },
    priority: 300,
  });
  const cart = makeCart();
  // qty=4 -> max free = floor(4/2) = 2, even though value=99
  const result = eng.apply(cart);
  assert.equal(result.totalDiscount, 500); // 2 × 250
});

// =========================================================
// maxDiscount cap
// =========================================================
test('apply — maxDiscount caps a single rule', () => {
  const eng = new DiscountEngine();
  eng.defineRule({
    id: 'big-pct',
    type: 'cart',
    action: { type: 'percent', value: 50 },
    maxDiscount: 100,  // cap at ₪100
    priority: 100,
  });
  const cart = makeCart();
  const result = eng.apply(cart);
  // 50% of 1210 = 605 but capped at 100
  assert.equal(result.totalDiscount, 100);
  assert.equal(result.total, 1110);
  assert.equal(result.breakdown[0].detail.cappedFromAgorot > 0, true);
});

// =========================================================
// cart-wide safety cap (MAX_TOTAL_DISCOUNT_PCT = 80)
// =========================================================
test('apply — cart-wide 80% safety cap cannot be exceeded', () => {
  const eng = new DiscountEngine();
  eng.defineRule({
    id: 'huge',
    type: 'cart',
    action: { type: 'percent', value: 95 },
    priority: 500,
  });
  const cart = makeCart();
  const result = eng.apply(cart);
  // would be 95% = 1149.50 but cap is 80% = 968
  assert.equal(result.totalDiscount, 968);
  assert.equal(result.total, 242);
  // a cap entry is appended
  const capEntry = result.breakdown.find((b) => b.ruleId === '__cart_cap__');
  assert.ok(capEntry);
});

// =========================================================
// Consumer protection — prior price honesty
// =========================================================
test('apply — prior-price honesty warning when prior price is too recent', () => {
  const eng = new DiscountEngine();
  eng.defineRule({
    id: 'flash-pesach',
    type: 'item',
    action: { type: 'percent', value: 20, scope: 'line', targetSku: 'STEEL-10' },
    startDate: '2026-04-01',
    endDate:   '2026-04-15',
  });
  const cart = makeCart();
  // Prior price was only set 5 days before the promotion — not honest
  cart.lines[0].priorPrice = 300;
  cart.lines[0].priorPriceSince = '2026-03-27';

  const result = eng.apply(cart);
  assert.ok(result.honestyWarnings.length >= 1);
  assert.equal(result.honestyWarnings[0].ruleId, 'flash-pesach');
});

test('apply — prior-price honesty OK when >= 30 days old', () => {
  const eng = new DiscountEngine();
  eng.defineRule({
    id: 'honest',
    type: 'item',
    action: { type: 'percent', value: 20, scope: 'line', targetSku: 'STEEL-10' },
    startDate: '2026-04-01',
  });
  const cart = makeCart();
  cart.lines[0].priorPrice = 300;
  cart.lines[0].priorPriceSince = '2026-01-01';  // well over 30 days

  const result = eng.apply(cart);
  assert.equal(result.honestyWarnings.length, 0);
});

// =========================================================
// freeItem adds a zero-cost line
// =========================================================
test('apply — freeItem adds a zero-cost line to the cart', () => {
  const eng = new DiscountEngine();
  eng.defineRule({
    id: 'gwp',
    type: 'cart',
    action: { type: 'freeItem', sku: 'STICKER', qty: 1 },
    priority: 50,
  });
  const cart = makeCart();
  const before = cart.lines.length;
  eng.apply(cart);
  assert.equal(cart.lines.length, before + 1);
  const free = cart.lines[cart.lines.length - 1];
  assert.equal(free.sku, 'STICKER');
  assert.equal(free.unitPrice, 0);
  assert.equal(free.meta.free, true);
});

// =========================================================
// upgrade swaps SKU
// =========================================================
test('apply — upgrade swaps SKU at same price', () => {
  const eng = new DiscountEngine();
  eng.defineRule({
    id: 'upgr',
    type: 'item',
    action: { type: 'upgrade', fromSku: 'PAINT-RED', toSku: 'PAINT-RED-PREMIUM' },
    priority: 75,
  });
  const cart = makeCart();
  eng.apply(cart);
  const line = cart.lines.find((l) => l.upgradedFrom === 'PAINT-RED');
  assert.ok(line);
  assert.equal(line.sku, 'PAINT-RED-PREMIUM');
});

// =========================================================
// explain() bilingual
// =========================================================
test('explain — produces Hebrew and English human-readable output', () => {
  const eng = new DiscountEngine();
  eng.defineRule({
    id: 'loyalty',
    type: 'customer',
    condition: { field: 'customer.tier', op: 'eq', value: 'vip' },
    action: { type: 'percent', value: 5 },
    priority: 50,
    note_he: 'הנחת נאמנות 5%',
    note_en: 'Loyalty 5%',
  });
  eng.defineRule({
    id: 'welcome',
    type: 'cart',
    action: { type: 'amount', value: 100 },
    priority: 200,
    note_he: 'קופון ברוך הבא',
    note_en: 'Welcome coupon',
  });
  const cart = makeCart();
  eng.apply(cart);
  const exp = eng.explain(cart);
  assert.ok(exp.he.includes('סכום לפני הנחה'));
  assert.ok(exp.he.includes('loyalty'));
  assert.ok(exp.he.includes('welcome'));
  assert.ok(exp.he.includes('הנחת נאמנות 5%'));
  assert.ok(exp.he.includes('סכום לתשלום'));
  assert.ok(exp.en.includes('Subtotal before discounts'));
  assert.ok(exp.en.includes('Welcome coupon'));
  assert.ok(exp.en.includes('Total to pay'));
  assert.equal(exp.entries.length, 2);
});

test('explain — no discounts message when nothing matches', () => {
  const eng = new DiscountEngine();
  const cart = makeCart();
  eng.apply(cart);
  const exp = eng.explain(cart);
  assert.ok(exp.he.includes('לא חלה הנחה'));
  assert.ok(exp.en.includes('No discounts applied'));
});

// =========================================================
// CONSTANTS sanity
// =========================================================
test('CONSTANTS — are sane and immutable', () => {
  assert.equal(CONSTANTS.MAX_TOTAL_DISCOUNT_PCT, 80);
  assert.equal(CONSTANTS.PRIOR_PRICE_MIN_DAYS, 30);
  assert.throws(() => { CONSTANTS.MAX_TOTAL_DISCOUNT_PCT = 99; });
});

// =========================================================
// evaluateCondition spot checks
// =========================================================
test('evaluateCondition — op coverage', () => {
  const scope = { customer: { tier: 'vip', tags: ['metal', 'pro'], name: 'אורי' } };
  assert.equal(evaluateCondition({ field: 'customer.tier', op: 'eq', value: 'vip' }, scope), true);
  assert.equal(evaluateCondition({ field: 'customer.tier', op: 'ne', value: 'vip' }, scope), false);
  assert.equal(evaluateCondition({ field: 'customer.tags', op: 'contains', value: 'pro' }, scope), true);
  assert.equal(evaluateCondition({ field: 'customer.name', op: 'startsWith', value: 'או' }, scope), true);
  assert.equal(evaluateCondition({ field: 'customer.tier', op: 'in', value: ['vip', 'gold'] }, scope), true);
  assert.equal(evaluateCondition({ not: { field: 'customer.tier', op: 'eq', value: 'regular' } }, scope), true);
  assert.equal(evaluateCondition({ field: 'missing.x', op: 'exists' }, scope), false);
});
