# Inventory Valuation Report

Module: `src/reports/inventory-valuation.js`
Test:   `src/reports/inventory-valuation.test.js`
Owner:  Agent 65
Status: production-ready, 15/15 tests green

This document explains the inventory valuation engine that backs the
Techno-Kol Uzi period-end stock report. The engine supports three
costing methods (FIFO, LIFO, WAC), slow-moving and dead-stock flags, a
category breakdown (raw materials / WIP / finished goods), and an
optional commodity-pricing overlay for ferrous and non-ferrous metals.

The module is **append-only** — it never mutates or deletes input rows.
It works with or without a real `inventory_items` / `inventory_movements`
schema in Supabase: if those tables are missing it rebuilds the stock
ledger from purchase-order lines and sales-invoice lines.

---

## 1. Public API

```js
const {
  valueInventory,
  valueInventoryPdf,
} = require('./src/reports/inventory-valuation.js');
```

### `valueInventory({ asOf, method, supabase, data, commodityIndex, slowDays, deadDays })`

| Param            | Type                       | Default | Notes |
|------------------|----------------------------|---------|-------|
| `asOf`           | Date \| ISO string         | now     | Valuation cut-off. Movements strictly after this timestamp are ignored. |
| `method`         | `'FIFO'` \| `'LIFO'` \| `'WAC'` | `'FIFO'` | Also accepts `'WEIGHTED_AVERAGE'` / `'AVERAGE'`. |
| `supabase`       | supabase-js client         | `null`  | Used only to fetch inputs. Failed table reads are captured in `meta.warnings` — they are never fatal. |
| `data`           | object                     | `null`  | Overrides supabase. Handy for tests and ad-hoc reports. Shape: `{ opening, receipts, issues, purchaseLines, salesLines }`. |
| `commodityIndex` | object                     | `null`  | Optional LME-style price map in ILS/kg. Accepts flat (`{ iron: 5 }`) or nested (`{ copper: { price_per_kg: 45 } }`). |
| `slowDays`       | number                     | `90`    | Minimum days of inactivity to flag an item slow-moving. |
| `deadDays`       | number                     | `365`   | Minimum days of inactivity to flag an item as dead stock. |

Returns a plain object:

```js
{
  meta: {
    asOf, method, slowDays, deadDays, itemCount,
    generatedAt, source, warnings
  },
  summary: {
    totalInventoryValue, totalCogs, totalRevenue,
    totalGrossProfit, grossMarginPct,
    slowMovingValue, deadStockValue,
    slowMovingCount, deadStockCount
  },
  byCategory: [
    { category, itemCount, totalValue, totalCogs }, ...
  ],
  slowMoving: [ /* items flagged slow */ ],
  deadStock:  [ /* items flagged dead */ ],
  items: [
    {
      itemId, sku, name, category, commodity,
      quantityOnHand, unitCost, totalValue,
      cogs, revenue, grossProfit, grossMarginPct,
      lastMovementDate, daysSinceMovement,
      isSlowMoving, isDeadStock,
      commodityUnitPrice, commodityValue,
      layers
    }
  ]
}
```

### `valueInventoryPdf(report, outputPath)`

Renders a pdfkit report with:

1. Header (company, as-of, method, generation time)
2. Summary totals
3. Category breakdown
4. Items table (top 50 by value)
5. Slow-moving items page
6. Dead-stock items page
7. Warnings page (if supabase tables were missing)

Returns `Promise<{ path, size }>`. The target directory is created if it
does not exist. Lazy-loads `pdfkit` so the module still loads in
environments that do not install it.

---

## 2. Valuation methods

### FIFO — First-In-First-Out
Oldest lot is consumed first. The value on hand reflects the most
recent purchase prices, and COGS reflects older (usually cheaper)
costs. IFRS-compliant.

### LIFO — Last-In-First-Out
Newest lot is consumed first. On hand is the oldest layers. Not
IFRS-accepted, but useful for internal management reporting in a
metals business where commodity prices move every trading day.

### WAC — Weighted Average Cost
After every receipt the unit cost is recomputed as
`(current_value + receipt_value) / total_qty`. Issues are costed at
the running average. Simple to explain, smooths volatility.

### Worked example (used by the unit tests)

Inputs for one SKU `IRON-PLATE-10MM`:

| Date       | Event | Qty | Unit price |
|------------|-------|-----|------------|
| 2026-01-05 | IN    | 10  | 100        |
| 2026-02-10 | IN    | 10  | 120        |
| 2026-03-15 | OUT   | 15  | sold @ 200 |

| Method | COGS | On-hand qty | Unit cost | On-hand value |
|--------|------|-------------|-----------|----------------|
| FIFO   | 1600 | 5           | 120       | 600            |
| LIFO   | 1700 | 5           | 100       | 500            |
| WAC    | 1650 | 5           | 110       | 550            |

Revenue is 3000 in every case. Gross profit = revenue − COGS. These are
the numbers the test suite asserts against — run
`node --test src/reports/inventory-valuation.test.js` to verify.

---

## 3. Inputs

`valueInventory` will accept any of five streams:

| Stream          | Meaning |
|-----------------|---------|
| `opening`       | Opening balances at the period start. Modelled as a single IN at `as_of`. |
| `receipts`      | Goods-received notes (GRNs) — every PO receipt, regardless of source. |
| `issues`        | Stock issues (production, sales, scrap). Carries `sale_price` so revenue can be tracked. |
| `purchaseLines` | Fallback: when no `inventory_movements` table exists, PO lines stand in as receipts. |
| `salesLines`    | Fallback: when no `inventory_movements` table exists, sales-invoice lines stand in as issues. |

Each row is permissive — it accepts several aliases (`quantity` /
`qty`, `unit_cost` / `cost` / `price`, `received_at` / `date`, etc.) so
it slots straight onto whatever the upstream schema exposes. See
`normaliseMovements` in the source for the full list.

---

## 4. Commodity pricing

Techno-Kol Uzi holds large amounts of ferrous and non-ferrous metal,
whose market price moves daily. The engine supports a **commodity
overlay** on top of the book valuation — it does not replace FIFO/LIFO/
WAC, it runs alongside.

1. Each item's commodity is detected from its `commodity`, `metal`,
   `material`, or as a last resort the `sku` / `name` / `description`
   string. Hebrew aliases (`ברזל`, `אלומיניום`, `נחושת`) are understood.
2. Pass a `commodityIndex` to `valueInventory` in `{ iron, aluminium,
   copper }` form, unit price in ILS per kg.
3. The output items get two extra fields:
   - `commodityUnitPrice` — the index price you passed
   - `commodityValue` — `quantityOnHand × commodityUnitPrice`

You can then compare `totalValue` (book, cost-based) against the sum
of `commodityValue` (mark-to-market) to see how far the book lags the
spot market — a critical number on metals balance sheets.

### Linking to an external index (optional)

The module does not ship a live-feed integration by default (keeping
the core offline-testable). A cron job or bridge agent can fetch spot
prices from your broker (e.g. LME close, Trading Economics, local
traders) and call:

```js
const idx = await fetchCommodityIndex(); // your function
const report = await valueInventory({
  asOf: new Date(),
  method: 'WAC',
  supabase,
  commodityIndex: idx,
});
```

A good place for the live feed is a new scheduled job alongside the
existing ops bridge — it should write the latest price snapshot to a
`commodity_prices` table, and the valuation report can then load the
most recent row at `asOf`.

---

## 5. Slow-moving and dead-stock

For every item we compute `daysSinceMovement = asOf − lastMovement`.

- `isSlowMoving` — `daysSinceMovement >= slowDays && < deadDays && qty > 0`
- `isDeadStock`  — `daysSinceMovement >= deadDays && qty > 0`

Defaults are 90 and 365 days, in line with Israeli GAAP practice for
metals inventory. They are tunable per call via `slowDays` / `deadDays`.

The summary section exposes the totals and counts; the `slowMoving`
and `deadStock` arrays contain the full item records for drill-down.

---

## 6. When the inventory tables do not exist

The supabase loader tries, in order:

1. `inventory_opening_balances` → opening balances
2. `inventory_movements` (type = receipt) → receipts
3. `inventory_movements` (type = issue) → issues
4. `purchase_order_lines` → fallback receipts
5. `invoice_lines` → fallback issues

Any of the first three can fail silently — the failure is pushed onto
`meta.warnings` and the loader falls back to (4) and (5). The report
is never blocked on a missing schema; it just gets less accurate.

This is the behaviour the test
`valueInventory tolerates missing supabase tables via loader` exercises.

---

## 7. Running the tests

```bash
cd onyx-procurement
node --test src/reports/inventory-valuation.test.js
```

Expected output (abridged):

```
✔ FIFO basic flow
✔ LIFO basic flow
✔ WAC basic flow
✔ FIFO handles exact depletion
✔ LIFO handles multi-layer consumption
✔ WAC recomputes average after every receipt
✔ valueInventory FIFO end-to-end with categories + slow/dead
✔ valueInventory works with ONLY purchase/sales lines (no inventory tables)
✔ valueInventory clamps movements after asOf
✔ valueInventory handles invalid method
✔ valueInventory tolerates missing supabase tables via loader
✔ detectCommodity: direct + alias + haystack
✔ normaliseCommodityIndex accepts flat + nested
✔ normaliseMovements merges all input streams
✔ valueInventoryPdf writes a file
ℹ tests 15 / pass 15 / fail 0
```

---

## 8. Integration sketch

```js
const { createClient } = require('@supabase/supabase-js');
const {
  valueInventory,
  valueInventoryPdf,
} = require('./src/reports/inventory-valuation.js');

async function runMonthEnd() {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const asOf = new Date('2026-04-30T23:59:59Z');

  const report = await valueInventory({
    asOf,
    method: 'FIFO',
    supabase: sb,
    commodityIndex: {
      iron:      5.20,  // ILS/kg
      aluminium: 12.80,
      copper:    45.10,
    },
  });

  await valueInventoryPdf(report, `./out/inventory-${asOf.toISOString().slice(0,10)}.pdf`);

  // Persist the JSON snapshot too — append-only.
  await sb.from('inventory_valuation_snapshots').insert({
    as_of: asOf.toISOString(),
    method: 'FIFO',
    total_value: report.summary.totalInventoryValue,
    payload: report,
  });

  return report;
}
```

---

## 9. Non-goals / future work

- **Real-time mark-to-market.** The commodity overlay is a snapshot,
  not a live feed. Add a scheduled price-fetcher if you want continuous
  revaluation.
- **Standard costing.** Only actual-cost methods are supported. Adding
  a standard-cost variance analysis is a separate module.
- **Multi-currency.** Everything is assumed ILS. If Techno-Kol Uzi
  starts importing in EUR/USD, add an FX normalisation step inside
  `normaliseMovements`.
- **Lot tracking / serial numbers.** Layers are tracked by receipt date
  only, not by lot or serial. If traceability becomes a regulatory
  requirement, `layers` already carries `date` so it's a small lift.
