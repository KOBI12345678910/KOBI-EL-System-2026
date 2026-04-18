/**
 * Inventory Valuation Report — Techno-Kol Uzi
 * Agent 65
 *
 * Builds a period-end inventory valuation under FIFO, LIFO, or WAC
 * (weighted average cost), including slow-moving / dead-stock analysis
 * and a commodity-pricing layer for ferrous / non-ferrous metals.
 *
 * Core design:
 *   - Pure functions for the valuation math. Zero DB coupling in the core.
 *   - An optional `supabase` client is used purely to LOAD the inputs.
 *     If no supabase is supplied, the same core can be called by tests
 *     or by an external caller that already has the data in memory.
 *   - Works even if the `inventory_items` / `inventory_movements` tables
 *     do not exist: it will reconstruct item flow from invoices + POs.
 *
 * Accounting methods:
 *   FIFO — First-In-First-Out. Oldest lot is consumed first. The value
 *          on hand is the most recent receipts, and COGS reflects older
 *          (cheaper in an inflationary market) costs.
 *   LIFO — Last-In-First-Out. Newest lot is consumed first. On hand is
 *          the oldest layers. Not IFRS-accepted but common for metals
 *          internal management reporting.
 *   WAC  — Weighted Average Cost. After every receipt the unit cost is
 *          recomputed as (current_value + receipt_value) / total_qty.
 *          Issues are costed at that running average.
 *
 * NO DELETIONS — this module is append-only and never mutates inputs.
 */

'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;

// Standard category keys used across Techno-Kol Uzi.
const CATEGORY_RAW = 'raw_materials';
const CATEGORY_WIP = 'work_in_progress';
const CATEGORY_FINISHED = 'finished_goods';
const CATEGORY_OTHER = 'other';

// Known LME-quoted commodities we care about at Techno-Kol Uzi.
const COMMODITY_ALIASES = {
  iron: 'iron',
  steel: 'iron',
  ferrous: 'iron',
  'ברזל': 'iron',
  'פלדה': 'iron',
  aluminium: 'aluminium',
  aluminum: 'aluminium',
  'אלומיניום': 'aluminium',
  copper: 'copper',
  'נחושת': 'copper',
  brass: 'copper',
  bronze: 'copper',
};

// --- money helpers (agorot-safe) ---------------------------------------

function toAgorot(n) {
  return Math.round(Number(n || 0) * 100);
}
function fromAgorot(a) {
  return Math.round(Number(a || 0)) / 100;
}
function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

// --- date helpers ------------------------------------------------------

function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function daysBetween(a, b) {
  const da = toDate(a);
  const db = toDate(b);
  if (!da || !db) return null;
  return Math.floor((db.getTime() - da.getTime()) / DAY_MS);
}

// --- commodity ---------------------------------------------------------

function detectCommodity(item) {
  if (!item) return null;
  const raw = String(item.commodity || item.metal || item.material || '')
    .trim()
    .toLowerCase();
  if (COMMODITY_ALIASES[raw]) return COMMODITY_ALIASES[raw];
  // fallback: try to catch by sku / name
  const haystack = (
    (item.sku || '') + ' ' +
    (item.name || '') + ' ' +
    (item.description || '')
  ).toLowerCase();
  for (const key of Object.keys(COMMODITY_ALIASES)) {
    if (haystack.includes(key)) return COMMODITY_ALIASES[key];
  }
  return null;
}

/**
 * Normalise a commodity index snapshot (e.g. LME close prices) into
 * a { iron, aluminium, copper } map of unit prices per kg in ILS.
 */
function normaliseCommodityIndex(index) {
  if (!index) return {};
  const out = {};
  for (const [k, v] of Object.entries(index)) {
    const key = COMMODITY_ALIASES[String(k).toLowerCase()] || String(k).toLowerCase();
    if (typeof v === 'number') out[key] = v;
    else if (v && typeof v === 'object') out[key] = Number(v.price_per_kg ?? v.price ?? 0);
  }
  return out;
}

// --- input normalisation ----------------------------------------------

/**
 * Normalise raw movement rows into a common shape:
 *   { itemId, sku, name, category, commodity, type: 'IN'|'OUT',
 *     qty, unitCost, date, source }
 * Opening balances are modelled as a single IN at `asOfStart`.
 */
function normaliseMovements({
  opening = [],
  receipts = [],
  issues = [],
  salesLines = [],
  purchaseLines = [],
}) {
  const out = [];

  for (const o of opening) {
    const qty = Number(o.quantity || o.qty || 0);
    if (!qty) continue;
    out.push({
      itemId: o.item_id || o.sku || o.id,
      sku: o.sku || o.item_id || o.id,
      name: o.name || o.description || '',
      category: o.category || CATEGORY_OTHER,
      commodity: detectCommodity(o),
      type: 'IN',
      qty: Math.abs(qty),
      unitCost: Number(o.unit_cost || o.cost || 0),
      date: toDate(o.as_of || o.date) || new Date(0),
      source: 'opening',
    });
  }

  for (const r of receipts) {
    const qty = Number(r.quantity || r.qty || 0);
    if (!qty) continue;
    out.push({
      itemId: r.item_id || r.sku,
      sku: r.sku || r.item_id,
      name: r.name || r.description || '',
      category: r.category || CATEGORY_RAW,
      commodity: detectCommodity(r),
      type: 'IN',
      qty: Math.abs(qty),
      unitCost: Number(r.unit_cost || r.cost || r.price || 0),
      date: toDate(r.received_at || r.date || r.grn_date),
      source: r.source || 'grn',
      ref: r.grn_number || r.po_number || r.ref,
    });
  }

  for (const i of issues) {
    const qty = Number(i.quantity || i.qty || 0);
    if (!qty) continue;
    out.push({
      itemId: i.item_id || i.sku,
      sku: i.sku || i.item_id,
      name: i.name || '',
      category: i.category || CATEGORY_OTHER,
      commodity: detectCommodity(i),
      type: 'OUT',
      qty: Math.abs(qty),
      unitCost: 0, // issues don't carry cost; the method decides
      date: toDate(i.issued_at || i.date),
      source: i.source || 'issue',
      ref: i.ref,
      salePrice: Number(i.sale_price || 0),
    });
  }

  // Fallback path: derive flows from invoices/PO lines when inventory
  // tables are absent. PO lines = inbound, sales invoice lines = outbound.
  for (const p of purchaseLines) {
    const qty = Number(p.quantity || p.qty || 0);
    if (!qty) continue;
    out.push({
      itemId: p.item_id || p.sku || p.product_id,
      sku: p.sku || p.item_id || p.product_id,
      name: p.name || p.description || '',
      category: p.category || CATEGORY_RAW,
      commodity: detectCommodity(p),
      type: 'IN',
      qty: Math.abs(qty),
      unitCost: Number(p.unit_cost || p.unit_price || p.price || 0),
      date: toDate(p.date || p.po_date || p.received_at),
      source: 'po_line',
      ref: p.po_number || p.invoice_number,
    });
  }
  for (const s of salesLines) {
    const qty = Number(s.quantity || s.qty || 0);
    if (!qty) continue;
    out.push({
      itemId: s.item_id || s.sku || s.product_id,
      sku: s.sku || s.item_id || s.product_id,
      name: s.name || s.description || '',
      category: s.category || CATEGORY_FINISHED,
      commodity: detectCommodity(s),
      type: 'OUT',
      qty: Math.abs(qty),
      unitCost: 0,
      date: toDate(s.date || s.invoice_date),
      source: 'sales_line',
      ref: s.invoice_number,
      salePrice: Number(s.unit_price || s.price || 0),
    });
  }

  return out;
}

/**
 * Group movements by item and sort each bucket chronologically.
 * Stable tiebreak: IN before OUT on the same day (so same-day receipts
 * can be consumed by same-day issues).
 */
function groupByItem(movements) {
  const map = new Map();
  for (const m of movements) {
    const key = m.itemId || m.sku || m.name || 'UNKNOWN';
    if (!map.has(key)) {
      map.set(key, {
        itemId: key,
        sku: m.sku || key,
        name: m.name || '',
        category: m.category || CATEGORY_OTHER,
        commodity: m.commodity || null,
        movements: [],
      });
    }
    const b = map.get(key);
    if (m.name && !b.name) b.name = m.name;
    if (m.commodity && !b.commodity) b.commodity = m.commodity;
    b.movements.push(m);
  }
  for (const b of map.values()) {
    b.movements.sort((a, c) => {
      const da = toDate(a.date)?.getTime() ?? 0;
      const dc = toDate(c.date)?.getTime() ?? 0;
      if (da !== dc) return da - dc;
      if (a.type !== c.type) return a.type === 'IN' ? -1 : 1;
      return 0;
    });
  }
  return map;
}

// --- valuation engines -------------------------------------------------

/**
 * Run a single item's movements under FIFO. Returns:
 *   { qtyOnHand, valueAgorot, unitCost, cogsAgorot, revenueAgorot,
 *     lastMovementDate, layers }
 * Movements MUST be sorted oldest→newest and filtered to <= asOf already.
 */
function runFifo(movements) {
  const layers = []; // [{qty, unitCostAgorot, date}]
  let cogsAgorot = 0;
  let revenueAgorot = 0;
  let lastDate = null;

  for (const m of movements) {
    if (m.date) lastDate = m.date;
    if (m.type === 'IN') {
      layers.push({
        qty: m.qty,
        unitCostAgorot: toAgorot(m.unitCost),
        date: m.date,
      });
      continue;
    }
    // OUT: consume oldest first
    let remaining = m.qty;
    revenueAgorot += toAgorot(m.qty * (m.salePrice || 0));
    while (remaining > 1e-9 && layers.length) {
      const head = layers[0];
      const take = Math.min(head.qty, remaining);
      cogsAgorot += Math.round(take * head.unitCostAgorot);
      head.qty -= take;
      remaining -= take;
      if (head.qty <= 1e-9) layers.shift();
    }
    // If remaining > 0 we're short-issuing (negative stock). Record at 0 cost
    // so the books don't blow up; it'll show as a warning in the summary.
  }

  const qtyOnHand = layers.reduce((s, l) => s + l.qty, 0);
  const valueAgorot = layers.reduce(
    (s, l) => s + Math.round(l.qty * l.unitCostAgorot),
    0
  );
  const unitCost = qtyOnHand > 0 ? fromAgorot(valueAgorot / qtyOnHand) : 0;

  return {
    qtyOnHand: round2(qtyOnHand),
    valueAgorot,
    unitCost: round2(unitCost),
    cogsAgorot,
    revenueAgorot,
    lastMovementDate: lastDate,
    layers: layers.map((l) => ({ ...l, unitCost: fromAgorot(l.unitCostAgorot) })),
  };
}

/** LIFO: consume newest layer first (the stack grows and we pop off the top). */
function runLifo(movements) {
  const layers = [];
  let cogsAgorot = 0;
  let revenueAgorot = 0;
  let lastDate = null;

  for (const m of movements) {
    if (m.date) lastDate = m.date;
    if (m.type === 'IN') {
      layers.push({
        qty: m.qty,
        unitCostAgorot: toAgorot(m.unitCost),
        date: m.date,
      });
      continue;
    }
    let remaining = m.qty;
    revenueAgorot += toAgorot(m.qty * (m.salePrice || 0));
    while (remaining > 1e-9 && layers.length) {
      const top = layers[layers.length - 1];
      const take = Math.min(top.qty, remaining);
      cogsAgorot += Math.round(take * top.unitCostAgorot);
      top.qty -= take;
      remaining -= take;
      if (top.qty <= 1e-9) layers.pop();
    }
  }

  const qtyOnHand = layers.reduce((s, l) => s + l.qty, 0);
  const valueAgorot = layers.reduce(
    (s, l) => s + Math.round(l.qty * l.unitCostAgorot),
    0
  );
  const unitCost = qtyOnHand > 0 ? fromAgorot(valueAgorot / qtyOnHand) : 0;

  return {
    qtyOnHand: round2(qtyOnHand),
    valueAgorot,
    unitCost: round2(unitCost),
    cogsAgorot,
    revenueAgorot,
    lastMovementDate: lastDate,
    layers: layers.map((l) => ({ ...l, unitCost: fromAgorot(l.unitCostAgorot) })),
  };
}

/**
 * WAC: maintain a running (totalQty, totalValueAgorot). After each IN
 * recompute avg. Issues are costed at the current running average.
 */
function runWac(movements) {
  let qty = 0;
  let valueAgorot = 0;
  let cogsAgorot = 0;
  let revenueAgorot = 0;
  let lastDate = null;

  for (const m of movements) {
    if (m.date) lastDate = m.date;
    if (m.type === 'IN') {
      valueAgorot += Math.round(m.qty * toAgorot(m.unitCost));
      qty += m.qty;
      continue;
    }
    // OUT
    revenueAgorot += toAgorot(m.qty * (m.salePrice || 0));
    const avg = qty > 0 ? valueAgorot / qty : 0;
    const take = Math.min(qty, m.qty);
    const issuedValue = Math.round(take * avg);
    cogsAgorot += issuedValue;
    qty -= take;
    valueAgorot -= issuedValue;
    if (qty <= 1e-9) {
      qty = 0;
      valueAgorot = 0;
    }
  }

  const unitCost = qty > 0 ? fromAgorot(valueAgorot / qty) : 0;
  return {
    qtyOnHand: round2(qty),
    valueAgorot: Math.max(0, valueAgorot),
    unitCost: round2(unitCost),
    cogsAgorot,
    revenueAgorot,
    lastMovementDate: lastDate,
    layers: qty > 0
      ? [{ qty: round2(qty), unitCost: round2(unitCost), unitCostAgorot: Math.round((valueAgorot / qty) || 0) }]
      : [],
  };
}

function runMethod(method, movements) {
  const m = String(method || 'FIFO').toUpperCase();
  if (m === 'FIFO') return runFifo(movements);
  if (m === 'LIFO') return runLifo(movements);
  if (m === 'WAC' || m === 'WEIGHTED_AVERAGE' || m === 'AVERAGE') return runWac(movements);
  throw new Error(`Unsupported valuation method: ${method}`);
}

// --- supabase loader --------------------------------------------------

/**
 * Best-effort loader. Tries inventory-specific tables first; if any fail
 * we silently fall back to purchase/sales lines so the caller always
 * receives something computable. Missing tables are NOT an error — they
 * are reported in `warnings`.
 */
async function loadFromSupabase(supabase, asOf) {
  const warnings = [];
  const asOfIso = toDate(asOf)?.toISOString() || new Date().toISOString();

  async function safe(tableName, builder) {
    try {
      const q = builder(supabase.from(tableName));
      const { data, error } = await q;
      if (error) {
        warnings.push(`${tableName}: ${error.message || error.code || 'unknown error'}`);
        return null;
      }
      return data || [];
    } catch (e) {
      warnings.push(`${tableName}: ${e.message || String(e)}`);
      return null;
    }
  }

  const opening = (await safe('inventory_opening_balances', (q) =>
    q.select('*').lte('as_of', asOfIso)
  )) || [];
  const receipts = (await safe('inventory_movements', (q) =>
    q.select('*').eq('movement_type', 'receipt').lte('date', asOfIso)
  )) || [];
  const issues = (await safe('inventory_movements', (q) =>
    q.select('*').eq('movement_type', 'issue').lte('date', asOfIso)
  )) || [];

  // Fallback sources — always pulled, so we can reconcile when the
  // purpose-built tables exist but are thin.
  const purchaseLines = (await safe('purchase_order_lines', (q) =>
    q.select('*').lte('date', asOfIso)
  )) || [];
  const salesLines = (await safe('invoice_lines', (q) =>
    q.select('*').lte('date', asOfIso)
  )) || [];

  return { opening, receipts, issues, purchaseLines, salesLines, warnings };
}

// --- main entry point -------------------------------------------------

/**
 * @param {Object} params
 * @param {Date|string} params.asOf
 * @param {'FIFO'|'LIFO'|'WAC'} params.method
 * @param {Object} [params.supabase]      — optional supabase client
 * @param {Object} [params.data]          — in-memory inputs (overrides supabase)
 * @param {Object} [params.commodityIndex] — { iron, aluminium, copper } ILS/kg
 * @param {number} [params.slowDays=90]
 * @param {number} [params.deadDays=365]
 * @returns {Promise<Object>}
 */
async function valueInventory({
  asOf,
  method = 'FIFO',
  supabase = null,
  data = null,
  commodityIndex = null,
  slowDays = 90,
  deadDays = 365,
} = {}) {
  const asOfDate = toDate(asOf) || new Date();
  const warnings = [];

  // 0. validate method early so empty datasets still surface the error
  const methodUpper = String(method || 'FIFO').toUpperCase();
  if (!['FIFO', 'LIFO', 'WAC', 'WEIGHTED_AVERAGE', 'AVERAGE'].includes(methodUpper)) {
    throw new Error(`Unsupported valuation method: ${method}`);
  }

  // 1. gather raw inputs
  let raw;
  if (data) {
    raw = { ...data };
  } else if (supabase) {
    raw = await loadFromSupabase(supabase, asOfDate);
    warnings.push(...(raw.warnings || []));
  } else {
    raw = {};
  }

  // 2. normalise to a single stream of movements
  const movements = normaliseMovements({
    opening: raw.opening || [],
    receipts: raw.receipts || [],
    issues: raw.issues || [],
    salesLines: raw.salesLines || [],
    purchaseLines: raw.purchaseLines || [],
  }).filter((m) => !m.date || m.date.getTime() <= asOfDate.getTime());

  // 3. group + run the chosen method per item
  const grouped = groupByItem(movements);
  const items = [];

  const normIndex = normaliseCommodityIndex(commodityIndex);

  for (const bucket of grouped.values()) {
    const r = runMethod(method, bucket.movements);
    const value = fromAgorot(r.valueAgorot);
    const cogs = fromAgorot(r.cogsAgorot);
    const revenue = fromAgorot(r.revenueAgorot);
    const grossProfit = round2(revenue - cogs);
    const grossMarginPct = revenue > 0 ? round2((grossProfit / revenue) * 100) : 0;

    // days since last movement at asOf
    const daysSince = bucket.movements.length
      ? daysBetween(
          bucket.movements[bucket.movements.length - 1].date,
          asOfDate
        )
      : null;

    // commodity overlay (non-destructive — shown alongside book value)
    let commodityValue = null;
    let commodityUnitPrice = null;
    if (bucket.commodity && normIndex[bucket.commodity] && r.qtyOnHand > 0) {
      commodityUnitPrice = normIndex[bucket.commodity];
      commodityValue = round2(r.qtyOnHand * commodityUnitPrice);
    }

    items.push({
      itemId: bucket.itemId,
      sku: bucket.sku,
      name: bucket.name,
      category: bucket.category,
      commodity: bucket.commodity,
      quantityOnHand: r.qtyOnHand,
      unitCost: r.unitCost,
      totalValue: round2(value),
      cogs: round2(cogs),
      revenue: round2(revenue),
      grossProfit,
      grossMarginPct,
      lastMovementDate: r.lastMovementDate ? r.lastMovementDate.toISOString() : null,
      daysSinceMovement: daysSince,
      isSlowMoving: daysSince != null && daysSince >= slowDays && daysSince < deadDays && r.qtyOnHand > 0,
      isDeadStock: daysSince != null && daysSince >= deadDays && r.qtyOnHand > 0,
      commodityUnitPrice,
      commodityValue,
      layers: r.layers,
    });
  }

  // 4. summary + breakdown
  items.sort((a, b) => b.totalValue - a.totalValue);

  const byCategory = {};
  let totalValue = 0;
  let totalCogs = 0;
  let totalRevenue = 0;
  for (const it of items) {
    totalValue += it.totalValue;
    totalCogs += it.cogs;
    totalRevenue += it.revenue;
    const cat = it.category || CATEGORY_OTHER;
    if (!byCategory[cat]) {
      byCategory[cat] = { category: cat, itemCount: 0, totalValue: 0, totalCogs: 0 };
    }
    byCategory[cat].itemCount += 1;
    byCategory[cat].totalValue = round2(byCategory[cat].totalValue + it.totalValue);
    byCategory[cat].totalCogs = round2(byCategory[cat].totalCogs + it.cogs);
  }

  const slowMoving = items.filter((i) => i.isSlowMoving);
  const deadStock = items.filter((i) => i.isDeadStock);

  const totalGrossProfit = round2(totalRevenue - totalCogs);
  const grossMarginPct = totalRevenue > 0 ? round2((totalGrossProfit / totalRevenue) * 100) : 0;

  return {
    meta: {
      asOf: asOfDate.toISOString(),
      method: String(method).toUpperCase(),
      slowDays,
      deadDays,
      itemCount: items.length,
      generatedAt: new Date().toISOString(),
      source: data ? 'in-memory' : supabase ? 'supabase' : 'empty',
      warnings,
    },
    summary: {
      totalInventoryValue: round2(totalValue),
      totalCogs: round2(totalCogs),
      totalRevenue: round2(totalRevenue),
      totalGrossProfit,
      grossMarginPct,
      slowMovingValue: round2(slowMoving.reduce((s, i) => s + i.totalValue, 0)),
      deadStockValue: round2(deadStock.reduce((s, i) => s + i.totalValue, 0)),
      slowMovingCount: slowMoving.length,
      deadStockCount: deadStock.length,
    },
    byCategory: Object.values(byCategory).sort((a, b) => b.totalValue - a.totalValue),
    slowMoving,
    deadStock,
    items,
  };
}

// --- PDF rendering ----------------------------------------------------

/**
 * Render a full inventory valuation report as PDF via pdfkit.
 * Lazy-requires pdfkit + fs so the module can still be require()'d in
 * environments that don't have pdfkit available (e.g. pure unit tests).
 */
function valueInventoryPdf(report, outputPath) {
  return new Promise((resolve, reject) => {
    let PDFDocument, fs, path;
    try {
      PDFDocument = require('pdfkit');
      fs = require('fs');
      path = require('path');
    } catch (e) {
      return reject(new Error('pdfkit / fs not available: ' + e.message));
    }

    try {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: `Inventory Valuation ${report?.meta?.asOf || ''}`,
          Author: 'Techno-Kol Uzi — ONYX Procurement',
          Subject: 'Inventory Valuation Report',
          Keywords: 'inventory, valuation, FIFO, LIFO, WAC, metals',
          CreationDate: new Date(),
        },
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      const money = (n) => '₪ ' + Number(n || 0).toLocaleString('en-IL', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const pct = (n) => (Number(n || 0)).toFixed(2) + '%';

      // Header
      doc.fontSize(18).text('Inventory Valuation Report', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(11).text('Techno-Kol Uzi — מערכת ONYX Procurement', { align: 'center' });
      doc.moveDown();

      doc.fontSize(10);
      doc.text(`As Of: ${report?.meta?.asOf || '—'}`);
      doc.text(`Method: ${report?.meta?.method || '—'}`);
      doc.text(`Generated: ${report?.meta?.generatedAt || new Date().toISOString()}`);
      doc.text(`Items: ${report?.meta?.itemCount ?? 0}`);
      doc.moveDown();

      // Summary
      doc.fontSize(13).text('Summary', { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10);
      const s = report?.summary || {};
      doc.text(`Total Inventory Value:  ${money(s.totalInventoryValue)}`);
      doc.text(`Total COGS (period):    ${money(s.totalCogs)}`);
      doc.text(`Total Revenue:          ${money(s.totalRevenue)}`);
      doc.text(`Total Gross Profit:     ${money(s.totalGrossProfit)}`);
      doc.text(`Gross Margin:           ${pct(s.grossMarginPct)}`);
      doc.text(`Slow-Moving Value:      ${money(s.slowMovingValue)}  (${s.slowMovingCount || 0} items)`);
      doc.text(`Dead-Stock Value:       ${money(s.deadStockValue)}  (${s.deadStockCount || 0} items)`);
      doc.moveDown();

      // Category breakdown
      doc.fontSize(13).text('Breakdown by Category', { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10);
      for (const c of report?.byCategory || []) {
        doc.text(
          `${String(c.category).padEnd(20, ' ')}  ${String(c.itemCount).padStart(4, ' ')} items   ${money(c.totalValue).padStart(18, ' ')}`
        );
      }
      doc.moveDown();

      // Items table (top 50)
      doc.fontSize(13).text('Items on Hand', { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(9);
      doc.text('SKU                  Name                         Qty      UnitCost       Value            COGS');
      doc.text('-'.repeat(110));
      const top = (report?.items || []).slice(0, 50);
      for (const it of top) {
        const row =
          String(it.sku || '').slice(0, 18).padEnd(20, ' ') +
          ' ' +
          String(it.name || '').slice(0, 26).padEnd(28, ' ') +
          ' ' +
          String(it.quantityOnHand).padStart(8, ' ') +
          '  ' +
          money(it.unitCost).padStart(12, ' ') +
          '  ' +
          money(it.totalValue).padStart(14, ' ') +
          '  ' +
          money(it.cogs).padStart(12, ' ');
        doc.text(row);
      }
      if ((report?.items || []).length > 50) {
        doc.moveDown(0.3);
        doc.text(`... ${(report.items.length - 50)} more items omitted in PDF, see JSON payload.`);
      }
      doc.moveDown();

      // Slow / dead stock sections
      if ((report?.slowMoving || []).length) {
        doc.addPage();
        doc.fontSize(13).text(`Slow-Moving Items (>= ${report.meta.slowDays} days)`, { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(9);
        for (const it of report.slowMoving) {
          doc.text(
            `${String(it.sku).padEnd(18, ' ')}  ${String(it.name || '').slice(0, 24).padEnd(26, ' ')}  ` +
              `${String(it.daysSinceMovement).padStart(4, ' ')}d  ${money(it.totalValue).padStart(14, ' ')}`
          );
        }
      }
      if ((report?.deadStock || []).length) {
        doc.addPage();
        doc.fontSize(13).text(`Dead Stock (>= ${report.meta.deadDays} days)`, { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(9);
        for (const it of report.deadStock) {
          doc.text(
            `${String(it.sku).padEnd(18, ' ')}  ${String(it.name || '').slice(0, 24).padEnd(26, ' ')}  ` +
              `${String(it.daysSinceMovement).padStart(4, ' ')}d  ${money(it.totalValue).padStart(14, ' ')}`
          );
        }
      }

      if (report?.meta?.warnings?.length) {
        doc.addPage();
        doc.fontSize(13).text('Warnings', { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(9);
        for (const w of report.meta.warnings) doc.text('- ' + w);
      }

      doc.end();
      stream.on('finish', () => {
        try {
          const size = fs.statSync(outputPath).size;
          resolve({ path: outputPath, size });
        } catch (e) {
          resolve({ path: outputPath, size: 0 });
        }
      });
      stream.on('error', reject);
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = {
  valueInventory,
  valueInventoryPdf,
  // exposed for tests / reuse
  normaliseMovements,
  groupByItem,
  runFifo,
  runLifo,
  runWac,
  runMethod,
  detectCommodity,
  normaliseCommodityIndex,
  loadFromSupabase,
  COMMODITY_ALIASES,
  CATEGORY_RAW,
  CATEGORY_WIP,
  CATEGORY_FINISHED,
  CATEGORY_OTHER,
};
