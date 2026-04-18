/**
 * Inventory Optimizer — Agent X-08 (Swarm 3)
 * Techno-Kol Uzi Mega-ERP (Kobi 2026)
 *
 * EOQ, reorder points, safety stock, ABC/XYZ classification, dead-stock
 * and overstock detection, stock-out risk, and a single end-to-end
 * optimizeInventory() driver that returns ranked recommendations.
 *
 * Built for an Israeli metal-fab shop (Techno-Kol Uzi):
 *   - Raw steel by gauge/size (sheet, rod, plate, square tube ...)
 *   - Supplier lead times in the 7–14 day band
 *   - Bulk discount thresholds (אחוזי הנחת כמות)
 *   - Warehouse space as a hard binding constraint
 *
 * Bilingual Hebrew/English. Zero external dependencies. Pure math.
 *
 * Exports:
 *   - calculateEOQ(demand, orderCost, holdingCost)            → number
 *   - calculateROP(avgDemand, leadTime, stdev, serviceLevel)  → number
 *   - calculateSafetyStock(stdev, leadTime, serviceLevel)     → number
 *   - classifyABC(items[])                                    → items with {abc_class}
 *   - classifyXYZ(items[])                                    → items with {xyz_class}
 *   - recommendReorders(inventory[])                          → urgent reorder list
 *   - findDeadStock(inventory[], threshold?)                  → stale items
 *   - findOverstock(inventory[])                              → overstock items
 *   - optimizeInventory(items[], opts?)                       → full analysis
 *   - applyBulkDiscount(eoq, price, tiers)                    → economic order w/ discount
 *   - SERVICE_LEVELS, CLASS_LABELS, DEFAULTS
 *
 * Run:
 *   const opt = require('./optimizer');
 *   opt.calculateEOQ(12000, 50, 4);           // → 547.72...
 *   opt.optimizeInventory(myInventory);       // → full analysis
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────

/**
 * Z-scores for one-tailed service-level cycles. Keyed as integer percent
 * so 95% === 95. Values extend 50..9999 for flexibility.
 */
const SERVICE_LEVELS = Object.freeze({
  50:   0.00,
  80:   0.84,
  85:   1.04,
  90:   1.28,
  95:   1.65,
  96:   1.75,
  97:   1.88,
  98:   2.05,
  99:   2.33,
  995:  2.58,   // 99.5%
  999:  3.09,   // 99.9%
});

const CLASS_LABELS = Object.freeze({
  A: 'A — בקרה הדוקה',
  B: 'B — בקרה בינונית',
  C: 'C — בקרה רופפת',
  X: 'X — ביקוש יציב',
  Y: 'Y — ביקוש בינוני',
  Z: 'Z — ביקוש תנודתי',
});

const DEFAULTS = Object.freeze({
  serviceLevel:       95,
  leadTimeDays:       10,       // Israeli steel suppliers ~7–14 days
  deadStockDays:      180,
  overstockMultiple:  3,
  holdingRate:        0.22,     // 22% of unit cost per year (IL market avg)
  defaultOrderCost:   75,       // ILS per PO processed
  minDailyDemand:     0.01,
  abcThresholds:      { A: 0.80, B: 0.95 },  // Pareto 80 / 15 / 5
  xyzThresholds:      { X: 0.25, Y: 0.50 },  // CV ≤ 0.25 stable, ≤ 0.50 medium
});

// ─────────────────────────────────────────────────────────────────────
// Internal numeric helpers — NO external deps
// ─────────────────────────────────────────────────────────────────────

function toNumber(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function clampPositive(x, floor = 0) {
  const n = toNumber(x, floor);
  return n > floor ? n : floor;
}

function roundTo(x, dp = 2) {
  if (!Number.isFinite(x)) return 0;
  const p = Math.pow(10, dp);
  return Math.round(x * p) / p;
}

function mean(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  let s = 0;
  for (const v of arr) s += toNumber(v, 0);
  return s / arr.length;
}

/** Sample stdev (n-1). Falls back to 0 on tiny arrays. */
function stdev(arr) {
  if (!Array.isArray(arr) || arr.length < 2) return 0;
  const m = mean(arr);
  let sq = 0;
  for (const v of arr) {
    const d = toNumber(v, 0) - m;
    sq += d * d;
  }
  return Math.sqrt(sq / (arr.length - 1));
}

/** Coefficient of variation. Guards div-by-zero. */
function coefficientOfVariation(arr) {
  const m = mean(arr);
  if (m === 0) return 0;
  return stdev(arr) / Math.abs(m);
}

function resolveZ(serviceLevel) {
  if (serviceLevel == null) return SERVICE_LEVELS[DEFAULTS.serviceLevel];
  // numeric: prefer integer percent key
  const key = Math.round(toNumber(serviceLevel, DEFAULTS.serviceLevel));
  if (SERVICE_LEVELS[key] != null) return SERVICE_LEVELS[key];
  // fractional (e.g. 99.5 → 995) — try *10
  const k10 = Math.round(toNumber(serviceLevel, 0) * 10);
  if (SERVICE_LEVELS[k10] != null) return SERVICE_LEVELS[k10];
  // interpolate from nearest known — monotone linear
  const known = Object.keys(SERVICE_LEVELS)
    .map(Number)
    .filter((k) => k <= 100)
    .sort((a, b) => a - b);
  const sl = toNumber(serviceLevel, DEFAULTS.serviceLevel);
  if (sl <= known[0]) return SERVICE_LEVELS[known[0]];
  if (sl >= known[known.length - 1]) return SERVICE_LEVELS[known[known.length - 1]];
  for (let i = 0; i < known.length - 1; i++) {
    const lo = known[i];
    const hi = known[i + 1];
    if (sl >= lo && sl <= hi) {
      const t = (sl - lo) / (hi - lo);
      return SERVICE_LEVELS[lo] + t * (SERVICE_LEVELS[hi] - SERVICE_LEVELS[lo]);
    }
  }
  return SERVICE_LEVELS[DEFAULTS.serviceLevel];
}

// ─────────────────────────────────────────────────────────────────────
// Core formulas
// ─────────────────────────────────────────────────────────────────────

/**
 * EOQ — Economic Order Quantity.
 *   Q* = sqrt((2 × D × S) / H)
 *
 *   D = annual demand (units / year)
 *   S = fixed order cost per PO (ILS)
 *   H = holding cost per unit per year (ILS)
 *
 * Returns 0 for any non-positive input — a zero EOQ means "do not stock
 * automatically; needs human review".
 */
function calculateEOQ(demand, orderCost, holdingCost) {
  const D = clampPositive(demand);
  const S = clampPositive(orderCost);
  const H = clampPositive(holdingCost);
  if (D === 0 || S === 0 || H === 0) return 0;
  return roundTo(Math.sqrt((2 * D * S) / H), 2);
}

/**
 * Safety stock — buffer for demand variability during lead time.
 *   SS = z × σ × sqrt(L)
 *
 *   σ = stdev of daily demand
 *   L = lead time in days
 *   z = z-score for target service level
 */
function calculateSafetyStock(stdevDemand, leadTime, serviceLevel = DEFAULTS.serviceLevel) {
  const sigma = clampPositive(stdevDemand);
  const L = clampPositive(leadTime);
  if (sigma === 0 || L === 0) return 0;
  const z = resolveZ(serviceLevel);
  return roundTo(z * sigma * Math.sqrt(L), 2);
}

/**
 * ROP — Reorder Point.
 *   ROP = (avg daily demand × lead time) + safety stock
 *
 * When `stdev` is provided, safety stock is calculated on the fly.
 * When `stdev` is omitted, the caller may pass a precomputed safety
 * stock in `overrideSafety`.
 */
function calculateROP(avgDemand, leadTime, stdevDemand = 0, serviceLevel = DEFAULTS.serviceLevel, overrideSafety = null) {
  const avg = clampPositive(avgDemand);
  const L = clampPositive(leadTime);
  const safety = overrideSafety != null
    ? clampPositive(overrideSafety)
    : calculateSafetyStock(stdevDemand, L, serviceLevel);
  return roundTo(avg * L + safety, 2);
}

// ─────────────────────────────────────────────────────────────────────
// ABC classification — Pareto on annual usage value
// ─────────────────────────────────────────────────────────────────────

/**
 * classifyABC(items) — returns a NEW array (inputs are not mutated).
 * Each item must have { sku, annualDemand, unitCost } or
 * { sku, annualUsageValue } (pre-aggregated).
 *
 * Classification:
 *   - A: cumulative ≤ abcThresholds.A (default 80%)  → tight control
 *   - B: cumulative ≤ abcThresholds.B (default 95%)  → medium control
 *   - C: everything else                              → loose control
 */
function classifyABC(items, thresholds = DEFAULTS.abcThresholds) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const A = clampPositive(thresholds.A, 0) || DEFAULTS.abcThresholds.A;
  const B = clampPositive(thresholds.B, 0) || DEFAULTS.abcThresholds.B;

  // compute usage value
  const rows = items.map((it) => {
    const base = { ...it };
    const value = it.annualUsageValue != null
      ? toNumber(it.annualUsageValue, 0)
      : toNumber(it.annualDemand, 0) * toNumber(it.unitCost, 0);
    base.annualUsageValue = roundTo(value, 2);
    return base;
  });

  rows.sort((a, b) => b.annualUsageValue - a.annualUsageValue);
  const total = rows.reduce((s, r) => s + r.annualUsageValue, 0);

  // Pareto boundary semantics: the FIRST item whose cumulative share
  // crosses the A threshold is still class A (it's the item that pushes
  // us over 80%). Same for B. This matches standard ABC-analysis
  // interpretation used in supply-chain literature.
  let cumulative = 0;
  let prevShare = 0;
  for (const r of rows) {
    cumulative += r.annualUsageValue;
    const share = total > 0 ? cumulative / total : 0;
    r.cumulative_share = roundTo(share, 4);
    if (total === 0) {
      r.abc_class = 'C';
    } else if (prevShare < A) {
      // previous cumulative was still inside A-zone → this item is A
      r.abc_class = 'A';
    } else if (prevShare < B) {
      r.abc_class = 'B';
    } else {
      r.abc_class = 'C';
    }
    r.abc_label = CLASS_LABELS[r.abc_class];
    prevShare = share;
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────
// XYZ classification — demand variability (coefficient of variation)
// ─────────────────────────────────────────────────────────────────────

/**
 * classifyXYZ(items) — expects each item to have either:
 *   - demandHistory: number[]   (daily or periodic demand samples)
 *   - or a pre-computed coefficientOfVariation
 *
 *   X: CV ≤ xyzThresholds.X (default 0.25)   → predictable
 *   Y: CV ≤ xyzThresholds.Y (default 0.50)   → medium
 *   Z: CV >  xyzThresholds.Y                 → erratic
 */
function classifyXYZ(items, thresholds = DEFAULTS.xyzThresholds) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const X = clampPositive(thresholds.X, 0) || DEFAULTS.xyzThresholds.X;
  const Y = clampPositive(thresholds.Y, 0) || DEFAULTS.xyzThresholds.Y;

  return items.map((it) => {
    const base = { ...it };
    const cv = it.coefficientOfVariation != null
      ? toNumber(it.coefficientOfVariation, 0)
      : coefficientOfVariation(it.demandHistory || []);
    base.coefficientOfVariation = roundTo(cv, 4);
    if (cv <= X) base.xyz_class = 'X';
    else if (cv <= Y) base.xyz_class = 'Y';
    else base.xyz_class = 'Z';
    base.xyz_label = CLASS_LABELS[base.xyz_class];
    return base;
  });
}

// ─────────────────────────────────────────────────────────────────────
// Detection helpers
// ─────────────────────────────────────────────────────────────────────

function daysSince(dateLike, now = Date.now()) {
  if (dateLike == null) return Infinity;
  const t = new Date(dateLike).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return Math.max(0, Math.floor((now - t) / 86400000));
}

/**
 * findDeadStock — items whose most recent movement is older than threshold
 * days. Items without `lastMovementDate` are treated as infinitely stale
 * so they surface too. Pass `{ now }` to freeze the clock for tests.
 */
function findDeadStock(inventory, threshold = DEFAULTS.deadStockDays, opts = {}) {
  if (!Array.isArray(inventory)) return [];
  const t = clampPositive(threshold, 0) || DEFAULTS.deadStockDays;
  const now = opts.now ? new Date(opts.now).getTime() : Date.now();
  const out = [];
  for (const it of inventory) {
    if (!it || typeof it !== 'object') continue;
    const age = daysSince(it.lastMovementDate, now);
    if (age >= t) {
      out.push({
        ...it,
        days_stale: Number.isFinite(age) ? age : null,
        reason: 'dead_stock',
        severity: age >= t * 2 ? 'high' : 'medium',
      });
    }
  }
  // worst first
  out.sort((a, b) => (b.days_stale || 0) - (a.days_stale || 0));
  return out;
}

/**
 * findOverstock — current stock > (overstockMultiple × EOQ). When EOQ
 * is not yet computed, the function derives it on the fly from the
 * item's own annualDemand / orderCost / holdingCost fields.
 */
function findOverstock(inventory, multiple = DEFAULTS.overstockMultiple) {
  if (!Array.isArray(inventory)) return [];
  const k = clampPositive(multiple, 0) || DEFAULTS.overstockMultiple;
  const out = [];
  for (const it of inventory) {
    if (!it || typeof it !== 'object') continue;
    const current = toNumber(it.currentStock, 0);
    const eoq = it.eoq != null
      ? toNumber(it.eoq, 0)
      : calculateEOQ(it.annualDemand, it.orderCost, it.holdingCost);
    if (eoq > 0 && current > k * eoq) {
      out.push({
        ...it,
        eoq,
        overstock_ratio: roundTo(current / eoq, 2),
        excess_units: roundTo(current - eoq, 2),
        reason: 'overstock',
        severity: current > k * 2 * eoq ? 'high' : 'medium',
      });
    }
  }
  out.sort((a, b) => b.overstock_ratio - a.overstock_ratio);
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Recommend reorders
// ─────────────────────────────────────────────────────────────────────

/**
 * recommendReorders — walks an inventory array, computes ROP for each
 * line, and returns the items whose currentStock is at or below ROP.
 * Each result includes urgency classification:
 *
 *   - 'critical': stockout already happened (current ≤ safety)
 *   - 'urgent':   current ≤ ROP within half a lead time
 *   - 'normal':   current ≤ ROP but buffer intact
 *
 * Missing numeric fields get safe defaults from DEFAULTS.
 */
function recommendReorders(inventory, opts = {}) {
  if (!Array.isArray(inventory)) return [];
  const serviceLevel = opts.serviceLevel ?? DEFAULTS.serviceLevel;
  const out = [];

  for (const it of inventory) {
    if (!it || typeof it !== 'object') continue;

    const avgDaily = clampPositive(
      it.avgDailyDemand != null
        ? it.avgDailyDemand
        : toNumber(it.annualDemand, 0) / 365,
      DEFAULTS.minDailyDemand,
    );
    const leadTime = clampPositive(it.leadTime, DEFAULTS.leadTimeDays) || DEFAULTS.leadTimeDays;
    const stdevDemand = clampPositive(
      it.stdevDemand != null ? it.stdevDemand : stdev(it.demandHistory || []),
    );
    const safety = calculateSafetyStock(stdevDemand, leadTime, serviceLevel);
    const rop = calculateROP(avgDaily, leadTime, stdevDemand, serviceLevel, safety);
    const current = toNumber(it.currentStock, 0);

    if (current <= rop) {
      let urgency = 'normal';
      if (current <= safety) urgency = 'critical';
      else if (current <= safety + avgDaily * (leadTime / 2)) urgency = 'urgent';

      const eoq = calculateEOQ(
        it.annualDemand,
        it.orderCost ?? DEFAULTS.defaultOrderCost,
        it.holdingCost,
      );

      const recommendedQty = Math.max(
        eoq > 0 ? eoq : avgDaily * leadTime,
        rop - current,
      );

      out.push({
        sku: it.sku,
        name_he: it.name_he || it.nameHe || it.name || '',
        name_en: it.name_en || it.nameEn || '',
        currentStock: current,
        safetyStock: safety,
        reorderPoint: rop,
        eoq: roundTo(eoq, 2),
        recommendedOrderQty: roundTo(recommendedQty, 2),
        leadTime,
        urgency,
        urgency_he: urgency === 'critical' ? 'קריטי' : urgency === 'urgent' ? 'דחוף' : 'רגיל',
        reason: current <= safety ? 'stockout_risk' : 'at_or_below_rop',
        supplier: it.supplier || it.supplier_id || null,
      });
    }
  }

  // critical first, then urgent, then normal
  const rank = { critical: 0, urgent: 1, normal: 2 };
  out.sort((a, b) => (rank[a.urgency] - rank[b.urgency]) || (a.currentStock - b.currentStock));
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Bulk-discount aware EOQ adjustment
// ─────────────────────────────────────────────────────────────────────

/**
 * applyBulkDiscount — given a base EOQ, evaluate whether ordering up to
 * a higher bulk-discount tier is economically better once the lower unit
 * price is factored in. Classic price-break EOQ logic.
 *
 * tiers shape:
 *   [{ minQty: 0,    price: 100.00 },
 *    { minQty: 500,  price: 95.00  },
 *    { minQty: 1000, price: 90.00  }]
 *
 * Returns { orderQty, unitPrice, totalCost }.
 */
function applyBulkDiscount(baseEoq, annualDemand, orderCost, holdingRate, tiers) {
  const Q0 = clampPositive(baseEoq);
  const D = clampPositive(annualDemand);
  const S = clampPositive(orderCost);
  const i = clampPositive(holdingRate, 0) || DEFAULTS.holdingRate;
  if (!Array.isArray(tiers) || tiers.length === 0 || Q0 === 0 || D === 0) {
    return { orderQty: Q0, unitPrice: 0, totalCost: 0, tier: null };
  }

  const sorted = tiers
    .map((t) => ({ minQty: clampPositive(t.minQty, 0), price: clampPositive(t.price, 0) }))
    .sort((a, b) => a.minQty - b.minQty);

  // Total annual cost at a given Q and unit price:
  //   TC = D*P + (D/Q)*S + (Q/2)*i*P
  const costOf = (Q, P) => D * P + (D / Q) * S + (Q / 2) * i * P;

  let best = null;
  for (const tier of sorted) {
    // Q candidate = max(EOQ@tier, tier.minQty)
    const H = i * tier.price;
    const eoqAtTier = H > 0 ? Math.sqrt((2 * D * S) / H) : 0;
    const Q = Math.max(eoqAtTier, tier.minQty);
    if (Q <= 0) continue;
    const tc = costOf(Q, tier.price);
    if (!best || tc < best.totalCost) {
      best = {
        orderQty: roundTo(Q, 2),
        unitPrice: tier.price,
        totalCost: roundTo(tc, 2),
        tier: { minQty: tier.minQty, price: tier.price },
      };
    }
  }
  return best || { orderQty: Q0, unitPrice: 0, totalCost: 0, tier: null };
}

// ─────────────────────────────────────────────────────────────────────
// Master driver: optimizeInventory
// ─────────────────────────────────────────────────────────────────────

/**
 * optimizeInventory(items, opts?) — runs the whole pipeline on one
 * snapshot of stock. Pure function: inputs are not mutated. Returns:
 *
 *   {
 *     items: [...items with eoq, rop, safety, abc, xyz, flags],
 *     reorders: [...],
 *     deadStock: [...],
 *     overstock: [...],
 *     summary: {
 *       totalItems, totalValue, classes, recommendations,
 *       warehouseUsagePct, potentialSavings,
 *     }
 *   }
 */
function optimizeInventory(items, opts = {}) {
  if (!Array.isArray(items)) items = [];

  const serviceLevel = opts.serviceLevel ?? DEFAULTS.serviceLevel;
  const deadStockDays = opts.deadStockDays ?? DEFAULTS.deadStockDays;
  const overstockMultiple = opts.overstockMultiple ?? DEFAULTS.overstockMultiple;
  const now = opts.now ? new Date(opts.now).getTime() : Date.now();
  const warehouseCapacity = toNumber(opts.warehouseCapacity, 0);

  // ─── 1. enrich each row ─────────────────────────────────────────
  const enriched = items.map((it) => {
    const src = it && typeof it === 'object' ? it : {};
    const annualDemand = toNumber(src.annualDemand, 0);
    const orderCost = toNumber(src.orderCost, DEFAULTS.defaultOrderCost);
    const unitCost = toNumber(src.unitCost, 0);
    const holdingCost = toNumber(
      src.holdingCost != null ? src.holdingCost : unitCost * DEFAULTS.holdingRate,
      0,
    );
    const leadTime = clampPositive(src.leadTime, DEFAULTS.leadTimeDays) || DEFAULTS.leadTimeDays;
    const avgDaily = clampPositive(
      src.avgDailyDemand != null ? src.avgDailyDemand : annualDemand / 365,
      0,
    );
    const history = Array.isArray(src.demandHistory) ? src.demandHistory : [];
    const sigma = src.stdevDemand != null ? toNumber(src.stdevDemand, 0) : stdev(history);

    const eoq = calculateEOQ(annualDemand, orderCost, holdingCost);
    const safety = calculateSafetyStock(sigma, leadTime, serviceLevel);
    const rop = calculateROP(avgDaily, leadTime, sigma, serviceLevel, safety);
    const current = toNumber(src.currentStock, 0);
    const annualUsageValue = roundTo(annualDemand * unitCost, 2);

    return {
      ...src,
      annualDemand,
      unitCost,
      orderCost,
      holdingCost,
      leadTime,
      avgDailyDemand: avgDaily,
      stdevDemand: roundTo(sigma, 4),
      currentStock: current,
      eoq,
      safetyStock: safety,
      reorderPoint: rop,
      annualUsageValue,
      coefficientOfVariation: roundTo(coefficientOfVariation(history), 4),
      daysStale: daysSince(src.lastMovementDate, now),
    };
  });

  // ─── 2. classify ────────────────────────────────────────────────
  const abc = classifyABC(enriched);
  // map abc results back into enriched rows by sku (abc returns copies)
  const abcIndex = new Map();
  for (const r of abc) abcIndex.set(r.sku, r);
  for (const row of enriched) {
    const hit = abcIndex.get(row.sku);
    if (hit) {
      row.abc_class = hit.abc_class;
      row.abc_label = hit.abc_label;
      row.cumulative_share = hit.cumulative_share;
    } else {
      row.abc_class = 'C';
      row.abc_label = CLASS_LABELS.C;
    }
  }
  const xyz = classifyXYZ(enriched);
  for (let i = 0; i < enriched.length; i++) {
    enriched[i].xyz_class = xyz[i].xyz_class;
    enriched[i].xyz_label = xyz[i].xyz_label;
  }

  // ─── 3. detection passes ────────────────────────────────────────
  const reorders = recommendReorders(enriched, { serviceLevel });
  const deadStock = findDeadStock(enriched, deadStockDays, { now });
  const overstock = findOverstock(enriched, overstockMultiple);

  // flag rows
  const reorderSkus = new Set(reorders.map((r) => r.sku));
  const deadSkus = new Set(deadStock.map((r) => r.sku));
  const overSkus = new Set(overstock.map((r) => r.sku));
  for (const row of enriched) {
    row.flags = {
      needs_reorder: reorderSkus.has(row.sku),
      dead_stock: deadSkus.has(row.sku),
      overstock: overSkus.has(row.sku),
    };
  }

  // ─── 4. summary ─────────────────────────────────────────────────
  const totalValue = enriched.reduce(
    (s, r) => s + toNumber(r.currentStock, 0) * toNumber(r.unitCost, 0),
    0,
  );
  const totalVolume = enriched.reduce(
    (s, r) => s + toNumber(r.currentStock, 0) * toNumber(r.unitVolume, 0),
    0,
  );

  const classCounts = { A: 0, B: 0, C: 0, X: 0, Y: 0, Z: 0 };
  for (const r of enriched) {
    classCounts[r.abc_class] = (classCounts[r.abc_class] || 0) + 1;
    classCounts[r.xyz_class] = (classCounts[r.xyz_class] || 0) + 1;
  }

  // Estimated savings from unloading dead + overstock, ballpark.
  const potentialSavings = roundTo(
    deadStock.reduce((s, r) => s + toNumber(r.currentStock, 0) * toNumber(r.unitCost, 0), 0) +
      overstock.reduce((s, r) => s + toNumber(r.excess_units, 0) * toNumber(r.unitCost, 0), 0),
    2,
  );

  const warehouseUsagePct = warehouseCapacity > 0
    ? roundTo((totalVolume / warehouseCapacity) * 100, 2)
    : null;

  return {
    items: enriched,
    reorders,
    deadStock,
    overstock,
    summary: {
      totalItems: enriched.length,
      totalValue: roundTo(totalValue, 2),
      totalVolume: roundTo(totalVolume, 4),
      classes: classCounts,
      recommendations: {
        reorder: reorders.length,
        dead_stock: deadStock.length,
        overstock: overstock.length,
      },
      warehouseCapacity: warehouseCapacity || null,
      warehouseUsagePct,
      potentialSavings,
      serviceLevel,
      generated_at: new Date(now).toISOString(),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────

module.exports = {
  // constants
  SERVICE_LEVELS,
  CLASS_LABELS,
  DEFAULTS,
  // core formulas
  calculateEOQ,
  calculateROP,
  calculateSafetyStock,
  // classification
  classifyABC,
  classifyXYZ,
  // detection
  recommendReorders,
  findDeadStock,
  findOverstock,
  // pricing
  applyBulkDiscount,
  // master driver
  optimizeInventory,
  // internals exposed for tests
  _internals: {
    mean,
    stdev,
    coefficientOfVariation,
    resolveZ,
    daysSince,
    roundTo,
  },
};
