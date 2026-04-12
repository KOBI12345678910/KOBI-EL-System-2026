# AG-Y019 — Discount Rules Engine (`DiscountEngine`)

**Agent:** Y-019
**Swarm:** Mega-ERP Techno-Kol Uzi — Kobi EL
**Date:** 2026-04-11
**Module:** `onyx-procurement/src/pricing/discount-rules.js`
**Tests:**  `onyx-procurement/test/pricing/discount-rules.test.js`
**Rule of the house:** **לא מוחקים — רק משדרגים ומגדלים.**

---

## 1. Summary

A zero-dependency, deterministic, bilingual (Hebrew / English) discount
rules engine for the ONYX procurement layer of the Mega-ERP.

The engine:

* Accepts rules declaratively (`defineRule`) with priorities, stackability,
  exclusivity, date windows and per-rule discount caps.
* Evaluates which rules apply to a cart (`evaluate`) using an **AND/OR/NOT**
  condition tree against `{cart, customer, context}`.
* Applies rules in priority order (`apply`), honoring stacking /
  exclusivity lockout and enforcing a global 80% safety cap that no
  combination of rules can ever exceed.
* Produces a full bilingual audit trail via `explain()`.
* Enforces Israeli consumer protection (חוק הגנת הצרכן) on the
  "prior price" displayed next to any discounted line.
* **Never deletes** a rule — `disableRule()` only flips a flag;
  re-defining a rule stores the previous version in `rule.history[]`.

Test suite: **21 passing, 0 failing** (node --test, zero external deps).

---

## 2. Run the tests

```bash
# from the repo root
node --test onyx-procurement/test/pricing/discount-rules.test.js
```

Expected output (abridged):

```
✔ validateRule — rejects invalid rules with messages
✔ defineRule — re-defining keeps history (never deletes)
✔ listActiveRules — filters by date window
✔ evaluate + apply — stacking with priority order
✔ evaluate — exclusive rule locks out lower-priority rules
✔ apply — BOGO on eligible SKU grants correct free units
✔ apply — maxDiscount caps a single rule
✔ apply — cart-wide 80% safety cap cannot be exceeded
✔ apply — prior-price honesty warning when prior price is too recent
✔ explain — produces Hebrew and English human-readable output
...
ℹ pass 21  fail 0
```

---

## 3. Public API

```js
const {
  DiscountEngine,
  CONSTANTS,
  RULE_TYPES,
  ACTION_TYPES,
  CONDITION_OPS,
} = require('./src/pricing/discount-rules.js');

const engine = new DiscountEngine();
```

### Methods

| Method | Purpose |
|---|---|
| `defineRule(rule)` | Add/upgrade a rule. Throws on validation failure. Re-defining keeps the old version in `history[]`. |
| `disableRule(id)` | Soft-disable a rule (never deletes). |
| `enableRule(id)` | Re-enable a previously disabled rule. |
| `getRule(id)` | Fetch a single rule (clone). |
| `listRules()` | All rules (active + disabled). |
| `listActiveRules(date?)` | Rules that are enabled AND inside their date window on `date`. |
| `validateRule(rule)` | `{ ok:boolean, errors:string[] }` — does not mutate. |
| `evaluate({cart, customer, context})` | Returns matching rules sorted by priority, honoring stacking / exclusivity lockout. |
| `apply(cart, discounts?)` | Mutates the cart with the applied discounts and returns a breakdown object. |
| `explain(cart)` | Returns `{he, en, entries}` — human-readable bilingual audit. |

---

## 4. Rule syntax

```js
engine.defineRule({
  id:          'vip-pesach-2026',              // required, unique
  type:        'customer',                     // customer|item|quantity|period|cart
  condition: {                                 // AND / OR / NOT tree
    all: [
      { field: 'customer.tier', op: 'eq', value: 'vip' },
      { any: [
        { field: 'cart.lines.length', op: 'gt', value: 2 },
        { field: 'customer.total_spend_ytd', op: 'gt', value: 100000 },
      ] },
    ],
  },
  action:      { type: 'percent', value: 7 }, // see "Action types" below
  priority:    200,                            // higher = evaluated first
  stackable:   true,                           // default true
  exclusive:   false,                          // default false
  maxDiscount: 500,                            // ₪ cap per rule (or null)
  startDate:   '2026-04-01',
  endDate:     '2026-04-15',
  note_he:     'הנחת חג פסח ללקוחות VIP',
  note_en:     'Pesach VIP discount',
});
```

### Condition grammar

A condition is either a **leaf** or a **composite**.

```
leaf      ::= { field: dotted-path, op: <op>, value: any }
composite ::= { all: [cond, ...] }    // AND
           |  { any: [cond, ...] }    // OR
           |  { not: cond }           // NOT
           |  [cond, ...]             // shorthand for AND
```

Supported `op` values (`CONDITION_OPS`):

```
eq, ne, gt, gte, lt, lte,
in, nin, contains, startsWith, endsWith,
between, exists, regex
```

`field` is a dotted path evaluated against
`{ cart, customer, ctx }` — e.g. `customer.tier`,
`cart.lines.length`, `ctx.channel`.

### Action types

| `action.type` | Extra fields | Effect |
|---|---|---|
| `percent`  | `value` (0<v≤100), `scope?` | v% off cart (default) or selected lines |
| `amount`   | `value` (>0), `scope?`      | ₪value off cart or selected lines |
| `bogo`     | `value` (free qty ≥ 1), `targetSku?`, `scope:'line'` | Buy-one-get-N free — capped at `floor(qty/2)` free units |
| `freeItem` | `sku`, `qty?`, `description?` | Appends a zero-priced line (GWP) — does **not** reduce subtotal |
| `upgrade`  | `fromSku`, `toSku`, `toDescription?` | Swaps matching lines to the better SKU at the same price |

Any percent/amount action may also carry `targetSku` or `targetCategory` for
line-level filtering when `scope:'line'`.

---

## 5. Stacking / exclusivity rules

1. `evaluate()` sorts matching rules by `priority` DESC, stable by `id`.
2. Rules are scanned in that order and picked into the result list, with
   the following lockouts:
   * **Exclusive rule** (`exclusive:true`): as soon as one is picked,
     **no more rules are added** — it is the only discount on the cart.
     (A higher-priority stackable rule can still beat a lower-priority
     exclusive rule because the scan is priority-first.)
   * **Non-stackable rule** (`stackable:false`): only picked if nothing
     else is in the list yet; once picked, it behaves exclusively.
3. `apply()` then walks the picked list in priority order. Each rule is
   computed against the **running** (post-previous-discounts) subtotal,
   so stacking is compounding, not additive — which is what Israeli
   retailers typically expect.
4. A global **cart-wide safety cap** of `CONSTANTS.MAX_TOTAL_DISCOUNT_PCT`
   (= 80%) is enforced after all rules run, so no stacking bug can ever
   give a customer an unbounded discount.

---

## 6. Consumer protection (חוק הגנת הצרכן)

Israeli consumer protection law forbids advertising a "prior price" that
is not honest. The engine enforces two rules on any cart line that opts
in by supplying a `priorPrice`:

1. **`priorPrice > unitPrice`** — the prior price must actually be higher
   than the current price.
2. **`priorPriceSince + 30 days ≤ startDate`** — the prior price must have
   been the effective price for at least `CONSTANTS.PRIOR_PRICE_MIN_DAYS`
   (default **30** days) before the promotion starts.

If either check fails, the engine:

* Still applies the discount (so the customer is not harmed),
* Attaches a warning to `cart.honestyWarnings[]` with bilingual reasons,
* Surfaces the warnings in `explain()` under the
  "אזהרות חוק הגנת הצרכן / Consumer-protection warnings" section, so the
  operator can review before showing to the customer.

This is a guard-rail, not a silent block: the `_qa-reports` trail keeps
the warnings for audit.

---

## 7. Worked examples

### 7.1 Stacking — welcome coupon + VIP loyalty

```js
engine.defineRule({
  id: 'welcome', type: 'cart',
  action: { type: 'amount', value: 100 },
  priority: 200, stackable: true,
});
engine.defineRule({
  id: 'loyalty', type: 'customer',
  condition: { field: 'customer.tier', op: 'eq', value: 'vip' },
  action: { type: 'percent', value: 5 },
  priority: 50, stackable: true,
});

const cart = {
  customer: { tier: 'vip' },
  lines: [
    { sku: 'STEEL-10', qty: 4,  unitPrice: 250 },
    { sku: 'BOLT-M8',  qty: 10, unitPrice: 5  },
    { sku: 'PAINT-RED',qty: 2,  unitPrice: 80 },
  ],
};

engine.apply(cart);
// subtotal       = 1210
// welcome (−100) = 1110
// loyalty 5%     =  −55.50
// totalDiscount  =  155.50
// total          = 1054.50
```

### 7.2 Exclusive clearance beats stackable loyalty

```js
engine.defineRule({
  id: 'clearance', type: 'cart',
  action: { type: 'percent', value: 30 },
  priority: 500, exclusive: true,
});
engine.defineRule({
  id: 'loyalty', type: 'customer',
  condition: { field: 'customer.tier', op: 'eq', value: 'vip' },
  action: { type: 'percent', value: 5 },
  priority: 100, stackable: true,
});

// apply() -> only 'clearance' is picked; 'loyalty' is locked out.
// 30% of 1210 = 363 discount, total 847.
```

### 7.3 BOGO on steel sheets

```js
engine.defineRule({
  id: 'bogo-steel', type: 'item',
  action: { type: 'bogo', value: 1, targetSku: 'STEEL-10', scope: 'line' },
  priority: 300,
});

// qty=4 of STEEL-10 @250 -> 1 free unit = ₪250 off
```

### 7.4 Max-discount cap

```js
engine.defineRule({
  id: 'big-pct', type: 'cart',
  action: { type: 'percent', value: 50 },
  maxDiscount: 100,   // ₪
});

// 50% of 1210 = 605 but capped at 100 -> totalDiscount = 100
```

### 7.5 Bilingual explain output

```
סכום לפני הנחה: ₪1210.00
פירוט ההנחות שהוחלו:
  • [welcome] קופון ברוך הבא — הנחה ₪100.00
  • [loyalty] הנחת נאמנות 5% — הנחה ₪55.50
סה"כ הנחה: ₪155.50
סכום לתשלום: ₪1054.50

Subtotal before discounts: ₪1210.00
Applied discounts:
  • [welcome] Welcome coupon — discount ₪100.00
  • [loyalty] Loyalty 5% — discount ₪55.50
Total discount: ₪155.50
Total to pay: ₪1054.50
```

---

## 8. "Never delete" semantics

| Operation | Effect |
|---|---|
| `defineRule(newRule)`       | Creates a fresh rule with `version:1, history:[]`. |
| `defineRule(existingId)`    | Creates v+1 of the rule. The previous version is pushed onto `rule.history[]` as `{version, replacedAt, snapshot}`. No information is ever lost. |
| `disableRule(id)`           | Flips `rule.disabled = true`. Rule still returned by `listRules()`, filtered out of `listActiveRules()` and `evaluate()`. |
| `enableRule(id)`            | Reverses `disableRule()`. |
| (No `deleteRule` method)    | By design — there is no delete. |

This satisfies the house rule: **לא מוחקים, רק משדרגים ומגדלים.**

---

## 9. Integer-agorot arithmetic

All internal math is in integer agorot (`₪ × 100`) via `toAgorot()` /
`toShekels()`. This avoids floating-point drift and guarantees that
`apply()` always returns stable rounded ₪ figures, regardless of how
many rules are stacked.

---

## 10. Test coverage map

| Scenario | Test |
|---|---|
| `validateRule` rejects bad input | `validateRule — rejects invalid rules with messages` |
| `validateRule` accepts good input | `validateRule — accepts a good rule` |
| Versioning / history | `defineRule — re-defining keeps history (never deletes)` |
| Soft disable | `disableRule — soft disable, rule still present` |
| Date window | `listActiveRules — filters by date window` |
| AND/OR/NOT condition | `evaluate — AND/OR/NOT condition tree` |
| **Stacking with priority** | `evaluate + apply — stacking with priority order` |
| **Exclusivity lockout** | `evaluate — exclusive rule locks out lower-priority rules` |
| Non-stackable lockout | `evaluate — non-stackable lower-priority rule is skipped...` |
| **BOGO math** | `apply — BOGO on eligible SKU grants correct free units` |
| BOGO cap by qty | `apply — BOGO with high value only takes half of qty` |
| **maxDiscount cap** | `apply — maxDiscount caps a single rule` |
| Cart-wide safety cap | `apply — cart-wide 80% safety cap cannot be exceeded` |
| Consumer-protection warn | `apply — prior-price honesty warning when prior price is too recent` |
| Consumer-protection pass | `apply — prior-price honesty OK when >= 30 days old` |
| Free item (GWP) | `apply — freeItem adds a zero-cost line to the cart` |
| Upgrade action | `apply — upgrade swaps SKU at same price` |
| **Explain bilingual** | `explain — produces Hebrew and English human-readable output` |
| Explain empty cart | `explain — no discounts message when nothing matches` |
| Constants immutability | `CONSTANTS — are sane and immutable` |
| Condition op coverage | `evaluateCondition — op coverage` |

---

## 11. Files

* **Engine:**  `onyx-procurement/src/pricing/discount-rules.js`
* **Tests:**   `onyx-procurement/test/pricing/discount-rules.test.js`
* **Report:**  `_qa-reports/AG-Y019-discount-rules.md`  ← this file
* **Sibling:** `onyx-procurement/src/pricing/price-optimizer.js`
  (existing dynamic price optimizer — the discount engine runs **after**
  the optimizer and consumes its already-margined prices.)

---

## 12. Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-04-11 | Initial engine, 21-test suite, bilingual explain, consumer-protection guard. |

**Never delete — only upgrade and grow.**
לא מוחקים — רק משדרגים ומגדלים.
