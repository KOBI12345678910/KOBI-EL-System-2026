# AG-Y018 — Bundle / Kit Pricing Engine

**Agent:** Y-018
**Module:** `onyx-procurement/src/pricing/bundle.js`
**Tests:** `onyx-procurement/test/pricing/bundle.test.js`
**Status:** GREEN — 21 / 21 passing on `node --test`
**Date:** 2026-04-11
**Project rule:** לא מוחקים רק משדרגים ומגדלים (never delete — only upgrade and grow)

---

## 1. Scope

Build a deterministic, zero-dependency bundle/kit pricing engine to answer
the four business questions a procurement / sales ERP must answer for any
composite SKU:

| Question | Method |
|---|---|
| How much does the customer pay (net, VAT, gross)? | `priceBundle()` |
| How do we split that price across components for revenue recognition under **IFRS 15**? | `priceBundle().allocations` |
| How many whole bundles can we ship given current inventory? | `availability()` |
| Which component pick lines does the warehouse fulfil? | `explode()` |

Plus structural integrity: circular-reference and orphan detection
(`validateBundle`), recursive bundle-of-bundles (`nestedBundles`), and an
append-only revision history (`getBundleHistory`).

---

## 2. Public API

```js
const { BundlePricing, CONSTANTS } = require('./src/pricing/bundle.js');

const bp = new BundlePricing({
  maxDepth: 8,          // default nesting cap
  vatRate: 0.18,        // Israeli מע"מ
});

bp.upsertComponent('BOLT-10', { price: 100, name_he: 'בורג', name_en: 'Bolt', inventory: 50 });

bp.defineBundle({
  sku: 'KIT-A',
  name_he: 'ערכה א',
  name_en: 'Kit A',
  components: [{ sku: 'BOLT-10', qty: 2 }, { sku: 'NUT-10', qty: 2 }],
  pricingMode: 'discount',
  discountPct: 10,
  allocationMethod: 'relative',
});

bp.priceBundle('KIT-A', { qty: 1, includeVat: true });
bp.availability('KIT-A');
bp.explode('KIT-A', 3);
bp.validateBundle('KIT-A');
bp.nestedBundles('KIT-A', 3);
```

### 2.1 Pricing modes

| Mode | Formula | Use case |
|---|---|---|
| `sum` | `priceNet = Σ (unitSsp × qty)` | Pure kits, no deal |
| `fixed` | `priceNet = price × qty` | Flat contract price |
| `discount` | `priceNet = Σ × (1 − discountPct/100)` | Promotional kits |

### 2.2 Allocation methods (IFRS 15-compliant)

| Method | Split basis |
|---|---|
| `relative` | Proportional to each component's **standalone selling price (SSP)** — this is the IFRS 15 default (§§ 73-86) |
| `even` | Equal per component line |
| `weight` | User-supplied numeric weights on each `component` row. Falls back to `relative` if weights missing or sum to zero. |

---

## 3. Allocation examples

All examples use the same three leaf SSPs:

| SKU | name_he | SSP (₪, net) |
|---|---|---|
| `BOLT-10` | בורג פלדה M10 | 100 |
| `NUT-10` | אום M10 | 30 |
| `WASHER-10` | דסקית M10 | 20 |

### 3.1 `pricingMode: 'sum'`, `allocationMethod: 'relative'`

Bundle: 2 × BOLT-10 + 2 × NUT-10 + 2 × WASHER-10
`Σ standalone = 200 + 60 + 40 = 300`
`priceNet = 300` (no discount)

| Component | Line SSP | Share % | revenueNet |
|---|---|---|---|
| BOLT-10 | 200 | 66.67% | 200 |
| NUT-10 | 60 | 20.00% | 60 |
| WASHER-10 | 40 | 13.33% | 40 |
| **Σ alloc** | | **100.00%** | **300** |

VAT @ 18% on total: `priceVat = 54`, `priceGross = 354`.

### 3.2 `pricingMode: 'discount'` (10%), `allocationMethod: 'relative'`

Same components, 10% discount applied to the sum:
`priceNet = 300 × 0.9 = 270`

| Component | Ratio | revenueNet |
|---|---|---|
| BOLT-10 | 200 / 300 | 180 |
| NUT-10 | 60 / 300 | 54 |
| WASHER-10 | 40 / 300 | 36 |
| **Σ alloc** | | **270** |

Each component absorbs its proportional share of the ₪30 discount — the IFRS 15
relative-SSP method.

### 3.3 `pricingMode: 'fixed'` @ ₪100, `allocationMethod: 'even'`

Same components, customer pays a flat ₪100.

| Component | revenueNet |
|---|---|
| BOLT-10 | 33.34 |
| NUT-10 | 33.33 |
| WASHER-10 | 33.33 |
| **Σ alloc** | **100.00** |

The extra agora on BOLT-10 comes from the **largest-remainder** absorption
rule (see §4.3 below) so `Σ allocations = priceNet` exactly.

### 3.4 `pricingMode: 'fixed'` @ ₪100, `allocationMethod: 'weight'`

Component weights `{BOLT:7, NUT:2, WASHER:1}`. Total weight = 10.

| Component | revenueNet |
|---|---|
| BOLT-10 | 70 |
| NUT-10 | 20 |
| WASHER-10 | 10 |
| **Σ alloc** | **100** |

---

## 4. IFRS 15 note — revenue recognition across components

### 4.1 The standard

IFRS 15 *Revenue from Contracts with Customers*, §§ 73-86 requires that when
a contract contains multiple distinct performance obligations sold as a
bundle, the transaction price must be allocated to each performance
obligation **in proportion to the standalone selling prices** of the goods
or services promised (the "relative standalone selling price" method).

> "An entity shall allocate the transaction price to each performance
>  obligation identified in the contract on a **relative standalone selling
>  price basis**." — IFRS 15 §74

### 4.2 How this engine satisfies it

1. `defineBundle` **requires** an explicit `allocationMethod`. The default
   (and the method expected by Israeli auditors for composite sales) is
   `'relative'`.
2. `priceBundle(...)` returns both the **invoice-level** view
   (`priceNet / priceVat / priceGross`) and the **revenue-recognition
   view** (`allocations[].revenueNet` per component), so the GL side of the
   posting can book revenue to the correct product-line accounts while the
   customer-facing invoice shows a single bundle line.
3. `Σ allocations.revenueNet === priceNet` is a **hard invariant** — the
   test `allocation sum == priceNet for relative / even / weight` asserts
   it for all three methods, including with a non-trivial 17% discount on
   `qty: 2` bundles that creates rounding.  Largest-remainder absorption
   in integer agorot guarantees exact reconciliation (`checksum.deltaNet === 0`).
4. `'even'` and `'weight'` are provided as **non-default** methods for the
   specific cases where management has determined (and documented) that
   components are essentially interchangeable or that a non-SSP basis
   better reflects the economic substance of the transaction. The engine
   does not judge this — it just transparently applies the chosen method
   and stores it (append-only) on the bundle revision, so auditors can
   always see which method was in force at the time of the sale.

### 4.3 Rounding policy

All monetary math is performed in **integer agorot** (₪ × 100) to avoid
JavaScript floating-point drift.  The allocator:

1. Floors each line at `floor(priceNet × weight / totalWeight)` agorot.
2. Distributes the leftover agorot to the lines with the **largest fractional
   remainders** first (deterministic tie-break: larger line-SSP first, then
   lower index).
3. Has a safety net that corrects both overshoot and undershoot so
   `Σ allocAgorot === priceNetAgorot` is guaranteed even in pathological
   cases.

This gives a GL-reconcilable allocation to the agora.

### 4.4 Israeli VAT handling

Israeli VAT (מע"מ, 18% as of 2026-01-01) is applied to the **total** bundle
price — this is what appears on the customer's invoice, on a single bundle
line.  For the GL posting, the engine returns:

| Field | Meaning |
|---|---|
| `priceNet` | Net-of-VAT bundle price (what the GL books to revenue) |
| `priceVat` | 18% × priceNet (what the GL books to "מע"מ עסקאות") |
| `priceGross` | priceNet + priceVat (what the AR module books to trade receivables) |
| `allocations[].revenueNet` | Net-of-VAT per component (for product-line revenue reporting / IFRS 15) |

The VAT portion is **not** allocated per component — it sits on a single
output-VAT account.  The per-component split is purely for revenue analytics
and IFRS 15 disclosure.  This matches Israeli Tax Authority practice on
mixed-product invoices.

### 4.5 Override cases

`priceBundle` accepts `context.vatRate` and `context.includeVat`.  This is
needed for:

- **Zero-rated exports** — set `vatRate: 0` or `includeVat: false`.
- **Reduced rates** — historical reconciliation or future rate changes.
- **Net-only quotes** — B2B quotations where the customer requests
  ex-VAT pricing.

---

## 5. Nesting rules (bundle-of-bundles)

### 5.1 Recursion

`nestedBundles(sku, qty)` walks the bundle graph depth-first, multiplying
`qty` along the path, and returns a flat array of **leaf** lines
`{sku, qty, depth}`.  Duplicate leaves (e.g. a BOLT-10 that appears both
directly in the outer bundle and transitively via an inner bundle) are
**merged** — quantities are summed, `depth` is `max`.

`explode(sku, qty)` is the public-facing version — it additionally hydrates
Hebrew/English names from the catalog so the warehouse UI can render the
pick list.

### 5.2 SSP of a nested bundle

For pricing purposes, a nested bundle's **effective SSP** is the **sum of
its own leaf SSPs** (sub-bundle discounts are *not* re-applied at the
outer level — that would double-discount).  This yields two auditor-friendly
properties:

1. `priceBundle('OUTER').sumOfStandalone` is the true bill-of-materials
   standalone value of the outer bundle, regardless of how deep the nesting
   goes.
2. Discounts compose *additively* on the outer bundle, not *multiplicatively*
   through the nesting path — a 10% outer discount on an inner bundle that
   already had a 20% discount is just a 10% discount on the outer bundle's
   gross BOM.  No hidden compounding.

### 5.3 Depth cap

`new BundlePricing({ maxDepth: N })` (default 8).  The walker throws
`maxDepth ${N} exceeded` on overflow — validated by the `maxDepth guard
trips on deeply nested bundles` test.

### 5.4 Cycle detection

`validateBundle` performs a DFS with a grey/black visitation set; any
back-edge yields a `CIRCULAR_REFERENCE` error with the full cycle path
bilingual (`"A → B → A"`).  `priceBundle` *always* calls `validateBundle`
first and refuses to price a broken bundle (`invalid bundle` error with
`.errors` attached).  This prevents a cycle from ever reaching the GL.

Demonstrated by the test `validateBundle detects circular references`:
after defining A → BOLT, B → A, and then re-defining A → {BOLT, B}, the
validator catches A → B → A and `priceBundle` throws.

### 5.5 Orphan detection

A component SKU that exists neither in the leaf catalog nor as another
bundle is flagged `ORPHAN_COMPONENT`.  Use case: a component was renamed
or its master record archived without updating dependent bundles — the
validator refuses to price the bundle until the reference is repaired or
the bundle is re-revisioned without it.

---

## 6. Append-only revisions (rule: לא מוחקים)

`defineBundle` **never overwrites** an existing bundle.  Each call pushes a
new frozen revision onto `getBundleHistory(sku)`:

```js
bp.defineBundle({ sku: 'KIT-A', ... });         // revision 1
bp.defineBundle({ sku: 'KIT-A', ... });         // revision 2  (kept in history)
bp.getBundle('KIT-A').revision;                 // → 2 (latest)
bp.getBundleHistory('KIT-A').length;            // → 2 (full audit trail)
```

Same for `upsertComponent` — every change to a leaf's price or inventory
produces a new frozen row with an incremented `revision` counter.  Nothing
is ever removed.  Auditors can replay *any* historical bundle price by
pulling the revision active on a given date.

This is asserted by the test `defineBundle is append-only`.

---

## 7. Availability semantics

```
availability(bundleSku) =
    min over leaves of floor(leaf.inventory / leaf.qty_per_bundle)
```

- Nested bundles are expanded to leaves first; quantities multiply along
  the path.
- A leaf with `inventory = 0` and positive qty-per-bundle forces
  `availability = 0` (short-circuit).
- Result is always a non-negative integer.  `Infinity` is only ever returned
  as a sentinel when there are no leaves (degenerate empty bundle), and is
  mapped to `0` on the way out.

Asserted by:

- `availability = min over components of floor(inventory / per-bundle qty)` — 4
- `availability with nested bundles multiplies qty along the path` — 8
- `availability = 0 when any leaf is out of stock`

---

## 8. Test results

```
$ node --test test/pricing/bundle.test.js

✔ defineBundle requires valid pricingMode + allocationMethod
✔ defineBundle is append-only (never delete — only upgrade and grow)
✔ pricingMode=sum yields priceNet == Σ standalone
✔ pricingMode=fixed yields priceNet == price * qty
✔ pricingMode=discount applies discountPct to sum
✔ allocation sum == priceNet for relative / even / weight
✔ relative allocation follows standalone proportions
✔ even allocation gives approximately equal split
✔ weight allocation uses user-supplied weights
✔ Israeli VAT applies to total; per-component allocation is net
✔ override vatRate via context
✔ explode handles nested bundle-of-bundles and merges duplicates
✔ priceBundle works for nested bundles (sub-bundle SSP = sum of leaves)
✔ availability = min over components of floor(inventory / per-bundle qty)
✔ availability with nested bundles multiplies qty along the path
✔ availability = 0 when any leaf is out of stock
✔ validateBundle detects circular references
✔ validateBundle detects orphan components
✔ validateBundle is green for a healthy bundle
✔ maxDepth guard trips on deeply nested bundles
✔ CONSTANTS exports required keys

ℹ tests 21
ℹ pass  21
ℹ fail  0
ℹ duration_ms ~144
```

All 21 tests passing.  Coverage summary:

- Pricing modes: sum / fixed / discount
- Allocation methods: relative / even / weight
- IFRS 15 invariant: `Σ allocations == priceNet` (exact to 1 agora)
- Nested bundle explode + pricing
- Availability across leaves (with nesting multiplication)
- Out-of-stock short-circuit
- Circular-reference detection (with `priceBundle` refusal)
- Orphan component detection
- Append-only revision history
- maxDepth guard
- Israeli VAT (18%) + rate override
- Bilingual error messages (Hebrew + English)

---

## 9. Non-functional notes

- **Zero dependencies.** Only `node:test` + `node:assert/strict` for tests —
  no runtime deps at all.
- **Bilingual.** All bundle/component definitions carry `name_he` / `name_en`
  and every validator error has `message_he` and `message_en`.
- **Integer-agorot math.** No floating-point drift possible — every monetary
  intermediate is an integer and the checksum invariant is `deltaNet === 0`.
- **Frozen revisions.** Every stored bundle and catalog row is
  `Object.freeze`-d; downstream consumers cannot mutate engine state.
- **Deterministic tie-break.** Rounding residuals are absorbed by
  largest-fractional-remainder first, tied by larger line-SSP, then lower
  index — so the same bundle always allocates the same way for the same
  inputs.
- **Never deletes.** `defineBundle` appends revisions; `upsertComponent`
  appends revisions; `setInventory` appends a new frozen row.  The rule
  *לא מוחקים רק משדרגים ומגדלים* is enforced at the data-store level.

---

## 10. Files touched

| File | Status |
|---|---|
| `onyx-procurement/src/pricing/bundle.js` | **NEW** — engine implementation |
| `onyx-procurement/test/pricing/bundle.test.js` | **NEW** — 21 tests, all green |
| `_qa-reports/AG-Y018-bundle-pricing.md` | **NEW** — this report |

No existing files were modified.  No files were deleted.
