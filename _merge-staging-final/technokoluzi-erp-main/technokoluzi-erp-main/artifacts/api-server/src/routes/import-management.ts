import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";

const router = Router();

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  (req as any).user = result.user;
  next();
}

router.use(requireAuth as any);

async function q(query: string) {
  try { const r = await db.execute(sql.raw(query)); return r.rows || []; }
  catch (e: any) { console.error("Import-Management query error:", e.message); return []; }
}

const s = (v: any) => v !== undefined && v !== null ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
const n = (v: any, def = 0) => Number(v) || def;

// ========== AUTO-CREATE TABLES ==========
(async () => {
  await q(`CREATE TABLE IF NOT EXISTS import_orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(100),
    supplier_id INT,
    supplier_name VARCHAR(255),
    supplier_country VARCHAR(100),
    items JSONB DEFAULT '[]'::jsonb,
    total_value_foreign NUMERIC(14,2) DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'USD',
    exchange_rate NUMERIC(10,4) DEFAULT 1,
    total_value_ils NUMERIC(14,2) DEFAULT 0,
    incoterm VARCHAR(10) DEFAULT 'FOB',
    status VARCHAR(30) DEFAULT 'ordered',
    order_date DATE,
    expected_arrival DATE,
    actual_arrival DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS import_shipments (
    id SERIAL PRIMARY KEY,
    import_order_id INT REFERENCES import_orders(id) ON DELETE CASCADE,
    tracking_number VARCHAR(255),
    carrier VARCHAR(255),
    ship_type VARCHAR(20) DEFAULT 'sea',
    port_of_origin VARCHAR(255),
    port_of_destination VARCHAR(255),
    container_number VARCHAR(100),
    departure_date DATE,
    arrival_date DATE,
    status VARCHAR(30) DEFAULT 'booked',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS import_customs (
    id SERIAL PRIMARY KEY,
    shipment_id INT REFERENCES import_shipments(id) ON DELETE CASCADE,
    customs_broker VARCHAR(255),
    declaration_number VARCHAR(100),
    duties_amount NUMERIC(12,2) DEFAULT 0,
    vat_amount NUMERIC(12,2) DEFAULT 0,
    processing_fee NUMERIC(12,2) DEFAULT 0,
    status VARCHAR(30) DEFAULT 'pending',
    cleared_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS import_costs (
    id SERIAL PRIMARY KEY,
    import_order_id INT REFERENCES import_orders(id) ON DELETE CASCADE,
    cost_type VARCHAR(50) DEFAULT 'freight',
    description VARCHAR(255),
    amount NUMERIC(12,2) DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'ILS',
    amount_ils NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS import_exchange_rates (
    id SERIAL PRIMARY KEY,
    currency VARCHAR(10) NOT NULL,
    rate NUMERIC(10,4) NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    source VARCHAR(100) DEFAULT 'manual',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  // Seed common exchange rates if empty
  const existing = await q(`SELECT COUNT(*) as cnt FROM import_exchange_rates`);
  if (Number((existing[0] as any)?.cnt) === 0) {
    await q(`INSERT INTO import_exchange_rates (currency, rate, source) VALUES
      ('USD', 3.65, 'seed'), ('EUR', 3.95, 'seed'), ('GBP', 4.55, 'seed'),
      ('CNY', 0.50, 'seed'), ('TRY', 0.11, 'seed'), ('JPY', 0.024, 'seed')`);
  }
  console.log("[Import-Management] Tables ready");
})();

// ========== IMPORT ORDERS ==========
router.get("/import/orders", async (_req, res) => {
  res.json(await q(`SELECT io.*,
    (SELECT COUNT(*) FROM import_shipments ish WHERE ish.import_order_id = io.id) as shipments_count,
    (SELECT COALESCE(SUM(amount_ils),0) FROM import_costs ic WHERE ic.import_order_id = io.id) as total_costs_ils
    FROM import_orders io ORDER BY io.created_at DESC`));
});

router.get("/import/orders/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='ordered') as ordered,
    COUNT(*) FILTER (WHERE status='shipped') as shipped,
    COUNT(*) FILTER (WHERE status='in_customs') as in_customs,
    COUNT(*) FILTER (WHERE status='cleared') as cleared,
    COUNT(*) FILTER (WHERE status='received') as received,
    COALESCE(SUM(total_value_ils), 0) as total_value_ils,
    COALESCE(SUM(total_value_foreign), 0) as total_value_foreign
  FROM import_orders`);
  res.json(rows[0] || {});
});

router.post("/import/orders", async (req, res) => {
  const d = req.body;
  const foreignVal = n(d.totalValueForeign);
  const rate = n(d.exchangeRate, 1);
  const ilsVal = d.totalValueIls || (foreignVal * rate);
  await q(`INSERT INTO import_orders (order_number, supplier_id, supplier_name, supplier_country, items, total_value_foreign, currency, exchange_rate, total_value_ils, incoterm, status, order_date, expected_arrival, notes)
    VALUES (${s(d.orderNumber)}, ${d.supplierId || 'NULL'}, ${s(d.supplierName)}, ${s(d.supplierCountry)}, ${s(JSON.stringify(d.items || []))}, ${foreignVal}, ${s(d.currency || 'USD')}, ${rate}, ${ilsVal}, ${s(d.incoterm || 'FOB')}, ${s(d.status || 'ordered')}, ${d.orderDate ? `'${d.orderDate}'` : 'CURRENT_DATE'}, ${d.expectedArrival ? `'${d.expectedArrival}'` : 'NULL'}, ${s(d.notes)})`);
  res.json({ success: true });
});

router.put("/import/orders/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.orderNumber) sets.push(`order_number=${s(d.orderNumber)}`);
  if (d.supplierName) sets.push(`supplier_name=${s(d.supplierName)}`);
  if (d.supplierCountry) sets.push(`supplier_country=${s(d.supplierCountry)}`);
  if (d.items) sets.push(`items=${s(JSON.stringify(d.items))}`);
  if (d.totalValueForeign !== undefined) sets.push(`total_value_foreign=${n(d.totalValueForeign)}`);
  if (d.currency) sets.push(`currency=${s(d.currency)}`);
  if (d.exchangeRate !== undefined) sets.push(`exchange_rate=${n(d.exchangeRate, 1)}`);
  if (d.totalValueIls !== undefined) sets.push(`total_value_ils=${n(d.totalValueIls)}`);
  if (d.incoterm) sets.push(`incoterm=${s(d.incoterm)}`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.orderDate) sets.push(`order_date='${d.orderDate}'`);
  if (d.expectedArrival) sets.push(`expected_arrival='${d.expectedArrival}'`);
  if (d.actualArrival) sets.push(`actual_arrival='${d.actualArrival}'`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE import_orders SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM import_orders WHERE id=${req.params.id}`))[0]);
});

router.delete("/import/orders/:id", async (req, res) => {
  await q(`DELETE FROM import_orders WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== IMPORT SHIPMENTS ==========
router.get("/import/shipments", async (_req, res) => {
  res.json(await q(`SELECT ish.*, io.order_number, io.supplier_name
    FROM import_shipments ish
    LEFT JOIN import_orders io ON ish.import_order_id = io.id
    ORDER BY ish.created_at DESC`));
});

router.post("/import/shipments", async (req, res) => {
  const d = req.body;
  await q(`INSERT INTO import_shipments (import_order_id, tracking_number, carrier, ship_type, port_of_origin, port_of_destination, container_number, departure_date, arrival_date, status, notes)
    VALUES (${d.importOrderId || 'NULL'}, ${s(d.trackingNumber)}, ${s(d.carrier)}, ${s(d.shipType || 'sea')}, ${s(d.portOfOrigin)}, ${s(d.portOfDestination)}, ${s(d.containerNumber)}, ${d.departureDate ? `'${d.departureDate}'` : 'NULL'}, ${d.arrivalDate ? `'${d.arrivalDate}'` : 'NULL'}, ${s(d.status || 'booked')}, ${s(d.notes)})`);
  // Auto-update order status
  if (d.importOrderId) await q(`UPDATE import_orders SET status='shipped', updated_at=NOW() WHERE id=${d.importOrderId} AND status='ordered'`);
  res.json({ success: true });
});

router.put("/import/shipments/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.trackingNumber) sets.push(`tracking_number=${s(d.trackingNumber)}`);
  if (d.carrier) sets.push(`carrier=${s(d.carrier)}`);
  if (d.shipType) sets.push(`ship_type=${s(d.shipType)}`);
  if (d.portOfOrigin) sets.push(`port_of_origin=${s(d.portOfOrigin)}`);
  if (d.portOfDestination) sets.push(`port_of_destination=${s(d.portOfDestination)}`);
  if (d.containerNumber) sets.push(`container_number=${s(d.containerNumber)}`);
  if (d.departureDate) sets.push(`departure_date='${d.departureDate}'`);
  if (d.arrivalDate) sets.push(`arrival_date='${d.arrivalDate}'`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE import_shipments SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM import_shipments WHERE id=${req.params.id}`))[0]);
});

router.delete("/import/shipments/:id", async (req, res) => {
  await q(`DELETE FROM import_shipments WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== IMPORT CUSTOMS ==========
router.get("/import/customs", async (_req, res) => {
  res.json(await q(`SELECT ic.*, ish.tracking_number, ish.container_number, io.order_number, io.supplier_name
    FROM import_customs ic
    LEFT JOIN import_shipments ish ON ic.shipment_id = ish.id
    LEFT JOIN import_orders io ON ish.import_order_id = io.id
    ORDER BY ic.created_at DESC`));
});

router.post("/import/customs", async (req, res) => {
  const d = req.body;
  await q(`INSERT INTO import_customs (shipment_id, customs_broker, declaration_number, duties_amount, vat_amount, processing_fee, status, notes)
    VALUES (${d.shipmentId || 'NULL'}, ${s(d.customsBroker)}, ${s(d.declarationNumber)}, ${n(d.dutiesAmount)}, ${n(d.vatAmount)}, ${n(d.processingFee)}, ${s(d.status || 'pending')}, ${s(d.notes)})`);
  // Auto-update order status via shipment
  if (d.shipmentId) {
    await q(`UPDATE import_shipments SET status='customs', updated_at=NOW() WHERE id=${d.shipmentId}`);
    await q(`UPDATE import_orders SET status='in_customs', updated_at=NOW() WHERE id=(SELECT import_order_id FROM import_shipments WHERE id=${d.shipmentId})`);
  }
  res.json({ success: true });
});

router.put("/import/customs/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.customsBroker) sets.push(`customs_broker=${s(d.customsBroker)}`);
  if (d.declarationNumber) sets.push(`declaration_number=${s(d.declarationNumber)}`);
  if (d.dutiesAmount !== undefined) sets.push(`duties_amount=${n(d.dutiesAmount)}`);
  if (d.vatAmount !== undefined) sets.push(`vat_amount=${n(d.vatAmount)}`);
  if (d.processingFee !== undefined) sets.push(`processing_fee=${n(d.processingFee)}`);
  if (d.status) {
    sets.push(`status=${s(d.status)}`);
    if (d.status === 'cleared') sets.push(`cleared_at=NOW()`);
  }
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE import_customs SET ${sets.join(",")} WHERE id=${req.params.id}`);
  // If cleared, update parent statuses
  if (d.status === 'cleared') {
    const cust = (await q(`SELECT shipment_id FROM import_customs WHERE id=${req.params.id}`))[0] as any;
    if (cust?.shipment_id) {
      await q(`UPDATE import_shipments SET status='delivered', updated_at=NOW() WHERE id=${cust.shipment_id}`);
      await q(`UPDATE import_orders SET status='cleared', updated_at=NOW() WHERE id=(SELECT import_order_id FROM import_shipments WHERE id=${cust.shipment_id})`);
    }
  }
  res.json((await q(`SELECT * FROM import_customs WHERE id=${req.params.id}`))[0]);
});

// ========== IMPORT COSTS ==========
router.get("/import/costs/:orderId", async (req, res) => {
  res.json(await q(`SELECT * FROM import_costs WHERE import_order_id=${req.params.orderId} ORDER BY created_at`));
});

router.post("/import/costs", async (req, res) => {
  const d = req.body;
  const amountIls = d.amountIls || n(d.amount);
  await q(`INSERT INTO import_costs (import_order_id, cost_type, description, amount, currency, amount_ils)
    VALUES (${d.importOrderId || 'NULL'}, ${s(d.costType || 'freight')}, ${s(d.description)}, ${n(d.amount)}, ${s(d.currency || 'ILS')}, ${amountIls})`);
  res.json({ success: true });
});

router.delete("/import/costs/:id", async (req, res) => {
  await q(`DELETE FROM import_costs WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== LANDED COST ==========
router.post("/import/orders/:id/calculate-landed-cost", async (req, res) => {
  const order = (await q(`SELECT * FROM import_orders WHERE id=${req.params.id}`))[0] as any;
  if (!order) { res.status(404).json({ error: "הזמנה לא נמצאה" }); return; }
  const costs = await q(`SELECT * FROM import_costs WHERE import_order_id=${req.params.id}`);
  const totalCosts = (costs as any[]).reduce((sum, c) => sum + Number(c.amount_ils || 0), 0);
  const productValue = Number(order.total_value_ils) || 0;
  const landedCost = productValue + totalCosts;
  const costBreakdown = (costs as any[]).reduce((acc: any, c: any) => {
    acc[c.cost_type] = (acc[c.cost_type] || 0) + Number(c.amount_ils || 0);
    return acc;
  }, {});
  res.json({ orderId: order.id, productValue, totalCosts, landedCost, costBreakdown, costPercentage: productValue > 0 ? ((totalCosts / productValue) * 100).toFixed(1) : 0 });
});

// ========== TRACKING ==========
router.get("/import/tracking/:shipmentId", async (req, res) => {
  const shipment = (await q(`SELECT ish.*, io.order_number, io.supplier_name, io.supplier_country
    FROM import_shipments ish LEFT JOIN import_orders io ON ish.import_order_id = io.id
    WHERE ish.id=${req.params.shipmentId}`))[0];
  const customs = await q(`SELECT * FROM import_customs WHERE shipment_id=${req.params.shipmentId}`);
  res.json({ shipment, customs });
});

// ========== EXCHANGE RATES ==========
router.get("/import/exchange-rates", async (_req, res) => {
  res.json(await q(`SELECT DISTINCT ON (currency) * FROM import_exchange_rates ORDER BY currency, date DESC`));
});

router.post("/import/exchange-rate", async (req, res) => {
  const d = req.body;
  await q(`INSERT INTO import_exchange_rates (currency, rate, date, source)
    VALUES (${s(d.currency)}, ${n(d.rate, 1)}, ${d.date ? `'${d.date}'` : 'CURRENT_DATE'}, ${s(d.source || 'manual')})`);
  res.json({ success: true });
});

// ========== PIPELINE ==========
router.get("/import/pipeline", async (_req, res) => {
  const statuses = ['ordered', 'shipped', 'in_customs', 'cleared', 'received'];
  const pipeline: any = {};
  for (const status of statuses) {
    pipeline[status] = await q(`SELECT io.*,
      (SELECT COUNT(*) FROM import_shipments ish WHERE ish.import_order_id = io.id) as shipments_count
      FROM import_orders io WHERE io.status='${status}' ORDER BY io.expected_arrival ASC NULLS LAST`);
  }
  res.json(pipeline);
});

// ========== DASHBOARD ==========
router.get("/import/dashboard", async (_req, res) => {
  const orders = await q(`SELECT COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='ordered') as ordered,
    COUNT(*) FILTER (WHERE status='shipped') as shipped,
    COUNT(*) FILTER (WHERE status='in_customs') as in_customs,
    COUNT(*) FILTER (WHERE status='received') as received,
    COALESCE(SUM(total_value_ils),0) as total_value_ils,
    COALESCE(SUM(total_value_foreign),0) as total_value_foreign
  FROM import_orders`);
  const shipments = await q(`SELECT COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='in_transit') as in_transit,
    COUNT(*) FILTER (WHERE status='arrived') as arrived
  FROM import_shipments`);
  const costs = await q(`SELECT COALESCE(SUM(amount_ils),0) as total_costs,
    cost_type, COALESCE(SUM(amount_ils),0) as type_total
  FROM import_costs GROUP BY cost_type ORDER BY type_total DESC`);
  const rates = await q(`SELECT DISTINCT ON (currency) currency, rate, date FROM import_exchange_rates ORDER BY currency, date DESC`);
  const upcoming = await q(`SELECT * FROM import_orders WHERE expected_arrival >= CURRENT_DATE AND status NOT IN ('received','cleared') ORDER BY expected_arrival ASC LIMIT 5`);
  res.json({ orders: orders[0], shipments: shipments[0], costBreakdown: costs, exchangeRates: rates, upcoming });
});

export default router;
