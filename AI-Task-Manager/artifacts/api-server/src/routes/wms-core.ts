import { Router } from "express";
import { pool } from "@workspace/db";
import bwipjs from "bwip-js";
import QRCode from "qrcode";
import PDFDocument from "pdfkit";

const router = Router();

async function ensureWmsTables() {
  await pool.query(`
    ALTER TABLE warehouse_locations
      ADD COLUMN IF NOT EXISTS location_type VARCHAR(20) DEFAULT 'bin',
      ADD COLUMN IF NOT EXISTS parent_location_id INTEGER,
      ADD COLUMN IF NOT EXISTS capacity_units DECIMAL(12,3),
      ADD COLUMN IF NOT EXISTS capacity_weight_kg DECIMAL(12,3),
      ADD COLUMN IF NOT EXISTS dimensions_cm TEXT,
      ADD COLUMN IF NOT EXISTS temperature_zone VARCHAR(30),
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS notes TEXT;

    CREATE TABLE IF NOT EXISTS stock_ledger (
      id SERIAL PRIMARY KEY,
      item_id INTEGER NOT NULL,
      item_code VARCHAR(100),
      location_id INTEGER,
      location_code VARCHAR(50),
      warehouse_id INTEGER,
      batch_number VARCHAR(100),
      serial_number VARCHAR(100),
      expiry_date DATE,
      lot_number VARCHAR(100),
      transaction_type VARCHAR(50) NOT NULL,
      quantity_in DECIMAL(15,3) DEFAULT 0,
      quantity_out DECIMAL(15,3) DEFAULT 0,
      balance DECIMAL(15,3) NOT NULL DEFAULT 0,
      unit_cost DECIMAL(15,4),
      total_cost DECIMAL(15,2),
      reference_type VARCHAR(50),
      reference_id INTEGER,
      reference_number VARCHAR(100),
      supplier_id INTEGER,
      customer_id INTEGER,
      purchase_order_id INTEGER,
      sales_order_id INTEGER,
      performed_by VARCHAR(255),
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS stock_positions (
      id SERIAL PRIMARY KEY,
      item_id INTEGER NOT NULL,
      item_code VARCHAR(100),
      location_id INTEGER NOT NULL DEFAULT 0,
      location_code VARCHAR(50),
      warehouse_id INTEGER,
      batch_number VARCHAR(100) NOT NULL DEFAULT '',
      serial_number VARCHAR(100) NOT NULL DEFAULT '',
      expiry_date DATE NOT NULL DEFAULT '2099-12-31',
      lot_number VARCHAR(100),
      quantity DECIMAL(15,3) NOT NULL DEFAULT 0,
      reserved_quantity DECIMAL(15,3) DEFAULT 0,
      available_quantity DECIMAL(15,3) DEFAULT 0,
      unit_cost DECIMAL(15,4),
      total_value DECIMAL(15,2),
      last_movement_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(item_id, location_id, batch_number, serial_number, expiry_date)
    );

    CREATE TABLE IF NOT EXISTS item_valuation_settings (
      id SERIAL PRIMARY KEY,
      item_id INTEGER,
      item_code VARCHAR(100),
      warehouse_id INTEGER,
      valuation_method VARCHAR(30) NOT NULL DEFAULT 'weighted_average',
      is_global BOOLEAN DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS lot_traceability (
      id SERIAL PRIMARY KEY,
      lot_number VARCHAR(100) NOT NULL,
      batch_number VARCHAR(100),
      item_id INTEGER,
      item_code VARCHAR(100),
      item_name VARCHAR(255),
      event_type VARCHAR(50) NOT NULL,
      event_date TIMESTAMP NOT NULL DEFAULT NOW(),
      quantity DECIMAL(15,3),
      source_type VARCHAR(50),
      source_id INTEGER,
      source_reference VARCHAR(100),
      destination_type VARCHAR(50),
      destination_id INTEGER,
      destination_reference VARCHAR(100),
      supplier_id INTEGER,
      supplier_name VARCHAR(255),
      customer_id INTEGER,
      customer_name VARCHAR(255),
      purchase_order_id INTEGER,
      sales_order_id INTEGER,
      warehouse_id INTEGER,
      location_code VARCHAR(50),
      expiry_date DATE,
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS expiry_alert_settings (
      id SERIAL PRIMARY KEY,
      item_id INTEGER,
      item_code VARCHAR(100),
      alert_days_before INTEGER NOT NULL DEFAULT 30,
      is_global BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    ALTER TABLE stock_positions
      ALTER COLUMN location_id SET DEFAULT 0,
      ALTER COLUMN batch_number SET DEFAULT '',
      ALTER COLUMN serial_number SET DEFAULT '',
      ALTER COLUMN expiry_date SET DEFAULT '2099-12-31';
    UPDATE stock_positions SET location_id = 0 WHERE location_id IS NULL;
    UPDATE stock_positions SET batch_number = '' WHERE batch_number IS NULL;
    UPDATE stock_positions SET serial_number = '' WHERE serial_number IS NULL;
    UPDATE stock_positions SET expiry_date = '2099-12-31' WHERE expiry_date IS NULL;
    ALTER TABLE stock_positions
      ALTER COLUMN location_id SET NOT NULL,
      ALTER COLUMN batch_number SET NOT NULL,
      ALTER COLUMN serial_number SET NOT NULL,
      ALTER COLUMN expiry_date SET NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_stock_ledger_item ON stock_ledger(item_id);
    CREATE INDEX IF NOT EXISTS idx_stock_ledger_lot ON stock_ledger(lot_number);
    CREATE INDEX IF NOT EXISTS idx_stock_ledger_batch ON stock_ledger(batch_number);
    CREATE INDEX IF NOT EXISTS idx_stock_positions_item ON stock_positions(item_id);
    CREATE INDEX IF NOT EXISTS idx_lot_traceability_lot ON lot_traceability(lot_number);
    CREATE INDEX IF NOT EXISTS idx_lot_traceability_batch ON lot_traceability(batch_number);
  `);
}

export { ensureWmsTables };

function escapeSvgText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ============================
// TASK 1: Warehouse Location Hierarchy
// ============================

router.get("/wms/location-hierarchy", async (req, res) => {
  try {
    const { warehouse_id } = req.query;
    const params: any[] = [];
    const warehouseClause = warehouse_id
      ? `AND wl.warehouse_id = $${params.push(Number(warehouse_id))}`
      : "";

    const result = await pool.query(`
      SELECT wl.*,
        w.name as warehouse_name,
        parent.location_code as parent_location_code,
        (SELECT COUNT(*) FROM warehouse_locations child WHERE child.parent_location_id = wl.id) as child_count,
        (SELECT COUNT(*) FROM stock_positions sp WHERE sp.location_id = wl.id AND sp.quantity > 0) as items_count
      FROM warehouse_locations wl
      LEFT JOIN warehouses w ON w.id = wl.warehouse_id
      LEFT JOIN warehouse_locations parent ON parent.id = wl.parent_location_id
      WHERE (wl.is_active = true OR wl.is_active IS NULL)
        ${warehouseClause}
      ORDER BY wl.location_code
    `, params);
    res.json({ success: true, data: result.rows });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post("/wms/warehouse-locations", async (req, res) => {
  try {
    const {
      warehouse_id, location_code, zone, aisle, shelf, bin,
      location_type, parent_location_id, capacity_units,
      capacity_weight_kg, dimensions_cm, temperature_zone,
      status, max_weight, max_volume, notes
    } = req.body;

    const result = await pool.query(`
      INSERT INTO warehouse_locations
        (warehouse_id, location_code, zone, aisle, shelf, bin,
         location_type, parent_location_id, capacity_units,
         capacity_weight_kg, dimensions_cm, temperature_zone,
         status, max_weight, max_volume, notes, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true)
      RETURNING *
    `, [
      warehouse_id, location_code, zone, aisle, shelf, bin,
      location_type || 'bin', parent_location_id,
      capacity_units, capacity_weight_kg, dimensions_cm, temperature_zone,
      status || 'active', max_weight, max_volume, notes
    ]);
    res.json({ success: true, data: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.put("/wms/warehouse-locations/:id", async (req, res) => {
  try {
    const {
      location_code, zone, aisle, shelf, bin, location_type,
      parent_location_id, capacity_units, capacity_weight_kg,
      dimensions_cm, temperature_zone, status, max_weight, max_volume, notes
    } = req.body;
    const result = await pool.query(`
      UPDATE warehouse_locations
      SET location_code=$1, zone=$2, aisle=$3, shelf=$4, bin=$5,
          location_type=$6, parent_location_id=$7, capacity_units=$8,
          capacity_weight_kg=$9, dimensions_cm=$10, temperature_zone=$11,
          status=$12, max_weight=$13, max_volume=$14, notes=$15
      WHERE id=$16 RETURNING *
    `, [
      location_code, zone, aisle, shelf, bin, location_type,
      parent_location_id, capacity_units, capacity_weight_kg,
      dimensions_cm, temperature_zone, status, max_weight, max_volume, notes,
      req.params.id
    ]);
    res.json({ success: true, data: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================
// TASK 2: Barcode / QR API (standards-compliant)
// ============================

async function generateCode128Svg(text: string): Promise<string> {
  const png = await bwipjs.toBuffer({
    bcid: "code128",
    text,
    scale: 2,
    height: 15,
    includetext: true,
    textxalign: "center",
  });
  const b64 = png.toString("base64");
  const safeText = escapeSvgText(text);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="260" height="90" viewBox="0 0 260 90">
  <rect width="260" height="90" fill="white"/>
  <image href="data:image/png;base64,${b64}" x="5" y="5" width="250" height="60"/>
  <text x="130" y="84" text-anchor="middle" font-family="monospace" font-size="11" fill="black">${safeText}</text>
</svg>`;
}

async function generateQrSvg(text: string): Promise<string> {
  const svgString = await QRCode.toString(text, { type: "svg", margin: 1, color: { dark: "#000000", light: "#ffffff" } });
  const safeText = escapeSvgText(text.length > 30 ? text.substring(0, 30) + "..." : text);
  const innerSvg = svgString
    .replace(/<\?xml[^>]*\?>/g, "")
    .replace(/<!DOCTYPE[^>]*>/g, "")
    .replace(/<svg[^>]*>/, '<g transform="translate(5,5) scale(0.9)">')
    .replace(/<\/svg>/, "</g>");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="230" viewBox="0 0 220 230">
  <rect width="220" height="230" fill="white"/>
  ${innerSvg}
  <text x="110" y="220" text-anchor="middle" font-family="monospace" font-size="9" fill="black">${safeText}</text>
</svg>`;
}

async function generateCode128Png(text: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: "code128",
    text,
    scale: 3,
    height: 15,
    includetext: true,
    textxalign: "center",
  });
}

async function generateQrPng(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text, { type: "png", margin: 2, scale: 4 });
}

async function sendBarcodeResponse(res: any, text: string, type: string, format: string) {
  if (format === "png") {
    const png = type === "qr" ? await generateQrPng(text) : await generateCode128Png(text);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(text)}.png"`);
    return res.send(png);
  }
  const svg = type === "qr" ? await generateQrSvg(text) : await generateCode128Svg(text);
  if (format === "svg") {
    res.setHeader("Content-Type", "image/svg+xml");
    return res.send(svg);
  }
  return res.json({ success: true, svg, text, type });
}

router.get("/wms/barcode/item/:itemCode", async (req, res) => {
  try {
    const { itemCode } = req.params;
    const { type = "barcode", format = "svg" } = req.query;
    await sendBarcodeResponse(res, itemCode, String(type), String(format));
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get("/wms/barcode/location/:locationCode", async (req, res) => {
  try {
    const { locationCode } = req.params;
    const { type = "barcode", format = "svg" } = req.query;
    await sendBarcodeResponse(res, locationCode, String(type), String(format));
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get("/wms/barcode/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { type = "barcode", format = "svg" } = req.query;
    const text = `CONT-${id}`;
    await sendBarcodeResponse(res, text, String(type), String(format));
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post("/wms/barcode/generate", async (req, res) => {
  try {
    const { texts, type = "barcode" } = req.body;
    if (!Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ success: false, error: "texts array is required" });
    }
    const labels = await Promise.all(
      texts.map(async (text: string) => ({
        text,
        svg: type === "qr" ? await generateQrSvg(String(text)) : await generateCode128Svg(String(text)),
      }))
    );
    res.json({ success: true, data: labels });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post("/wms/barcode/label-sheet", async (req, res) => {
  try {
    const { labels, type = "barcode", columns = 3 } = req.body;
    if (!Array.isArray(labels) || labels.length === 0) {
      return res.status(400).json({ success: false, error: "labels array is required" });
    }

    const doc = new PDFDocument({ size: "A4", margin: 20, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));

    const pageW = 595.28;
    const pageH = 841.89;
    const margin = 20;
    const cols = Math.min(Math.max(1, Number(columns)), 6);
    const cellW = (pageW - margin * 2) / cols;
    const cellH = type === "qr" ? 160 : 100;
    const maxRows = Math.floor((pageH - margin * 2) / cellH);

    let col = 0;
    let row = 0;

    for (let i = 0; i < labels.length; i++) {
      const text = String(labels[i]);
      const x = margin + col * cellW;
      const y = margin + row * cellH;

      doc.rect(x, y, cellW, cellH).stroke();

      try {
        const pngBuf = type === "qr" ? await generateQrPng(text) : await generateCode128Png(text);
        const imgW = Math.min(cellW - 10, type === "qr" ? 80 : cellW - 10);
        const imgH = type === "qr" ? 80 : 50;
        const imgX = x + (cellW - imgW) / 2;
        doc.image(pngBuf, imgX, y + 5, { width: imgW, height: imgH });
      } catch (imgErr: any) {
        console.error(`[label-sheet] barcode generation failed for "${text}":`, imgErr?.message || imgErr);
        doc.fontSize(7).fillColor("red").text(`[error: ${String(imgErr?.message || imgErr).substring(0, 40)}]`, x + 2, y + 30, { width: cellW - 4, align: "center" });
      }

      const labelText = text.length > 30 ? text.substring(0, 30) + "..." : text;
      doc.fontSize(7).fillColor("black").text(labelText, x + 2, y + cellH - 18, { width: cellW - 4, align: "center", lineBreak: false });

      col++;
      if (col >= cols) {
        col = 0;
        row++;
        if (row >= maxRows && i < labels.length - 1) {
          doc.addPage();
          row = 0;
        }
      }
    }

    doc.end();

    await new Promise<void>((resolve) => doc.on("end", resolve));
    const pdfBuffer = Buffer.concat(chunks);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="label-sheet.pdf"`);
    res.send(pdfBuffer);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================
// TASK 3: Real-Time Stock Tracking
// ============================

async function upsertStockPosition(client: any, entry: {
  item_id: number;
  item_code?: string;
  location_id?: number;
  location_code?: string;
  warehouse_id?: number;
  batch_number?: string;
  serial_number?: string;
  expiry_date?: string;
  lot_number?: string;
  quantity_in: number;
  quantity_out: number;
  unit_cost?: number;
}) {
  const qty_delta = (entry.quantity_in || 0) - (entry.quantity_out || 0);
  const loc_id = entry.location_id || 0;
  const batch = entry.batch_number || "";
  const serial = entry.serial_number || "";
  const expiry = entry.expiry_date || "2099-12-31";

  await client.query(`
    INSERT INTO stock_positions
      (item_id, item_code, location_id, location_code, warehouse_id,
       batch_number, serial_number, expiry_date, lot_number,
       quantity, available_quantity, unit_cost, total_value, last_movement_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,
      CASE WHEN $11 IS NOT NULL THEN $10 * $11 ELSE NULL END,
      NOW())
    ON CONFLICT (item_id, location_id, batch_number, serial_number, expiry_date)
    DO UPDATE SET
      quantity = stock_positions.quantity + $10,
      available_quantity = GREATEST(0, stock_positions.available_quantity + $10),
      unit_cost = COALESCE($11, stock_positions.unit_cost),
      total_value = CASE
        WHEN $11 IS NOT NULL THEN (stock_positions.quantity + $10) * $11
        WHEN stock_positions.unit_cost IS NOT NULL THEN (stock_positions.quantity + $10) * stock_positions.unit_cost
        ELSE stock_positions.total_value
      END,
      last_movement_at = NOW(),
      updated_at = NOW()
  `, [
    entry.item_id,
    entry.item_code || null,
    loc_id,
    entry.location_code || null,
    entry.warehouse_id || null,
    batch,
    serial,
    expiry,
    entry.lot_number || null,
    qty_delta,
    entry.unit_cost || null,
  ]);
}

router.get("/wms/stock-positions", async (req, res) => {
  try {
    const { item_id, item_code, location_id, location_code, warehouse_id, batch_number, serial_number, lot_number, expiry_before, expiry_after } = req.query;

    const conditions: string[] = [];
    const params: any[] = [];

    if (item_id) { conditions.push(`sp.item_id = $${params.push(Number(item_id))}`); }
    if (item_code) { conditions.push(`sp.item_code ILIKE $${params.push(`%${item_code}%`)}`); }
    if (location_id) { conditions.push(`sp.location_id = $${params.push(Number(location_id))}`); }
    if (location_code) { conditions.push(`sp.location_code ILIKE $${params.push(`%${location_code}%`)}`); }
    if (warehouse_id) { conditions.push(`sp.warehouse_id = $${params.push(Number(warehouse_id))}`); }
    if (batch_number) { conditions.push(`sp.batch_number ILIKE $${params.push(`%${batch_number}%`)}`); }
    if (serial_number) { conditions.push(`sp.serial_number ILIKE $${params.push(`%${serial_number}%`)}`); }
    if (lot_number) { conditions.push(`sp.lot_number ILIKE $${params.push(`%${lot_number}%`)}`); }
    if (expiry_before) { conditions.push(`sp.expiry_date <= $${params.push(expiry_before)}`); }
    if (expiry_after) { conditions.push(`sp.expiry_date >= $${params.push(expiry_after)}`); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(`
      SELECT sp.*,
        w.name as warehouse_name,
        wl.zone, wl.aisle, wl.shelf, wl.bin
      FROM stock_positions sp
      LEFT JOIN warehouses w ON w.id = sp.warehouse_id
      LEFT JOIN warehouse_locations wl ON wl.id = sp.location_id
      ${where}
      ORDER BY sp.item_code, sp.location_code, sp.batch_number
      LIMIT 500
    `, params);

    res.json({ success: true, data: result.rows, count: result.rowCount });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get("/wms/stock-ledger", async (req, res) => {
  try {
    const { item_id, item_code, lot_number, batch_number, serial_number, warehouse_id, date_from, date_to, limit = "100" } = req.query;

    const conditions: string[] = [];
    const params: any[] = [];

    if (item_id) { conditions.push(`sl.item_id = $${params.push(Number(item_id))}`); }
    if (item_code) { conditions.push(`sl.item_code ILIKE $${params.push(`%${item_code}%`)}`); }
    if (lot_number) { conditions.push(`sl.lot_number ILIKE $${params.push(`%${lot_number}%`)}`); }
    if (batch_number) { conditions.push(`sl.batch_number ILIKE $${params.push(`%${batch_number}%`)}`); }
    if (serial_number) { conditions.push(`sl.serial_number ILIKE $${params.push(`%${serial_number}%`)}`); }
    if (warehouse_id) { conditions.push(`sl.warehouse_id = $${params.push(Number(warehouse_id))}`); }
    if (date_from) { conditions.push(`sl.created_at >= $${params.push(date_from)}`); }
    if (date_to) { conditions.push(`sl.created_at <= $${params.push(date_to)}`); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(`
      SELECT sl.*,
        w.name as warehouse_name
      FROM stock_ledger sl
      LEFT JOIN warehouses w ON w.id = sl.warehouse_id
      ${where}
      ORDER BY sl.created_at DESC
      LIMIT $${params.push(parseInt(limit as string))}
    `, params);

    res.json({ success: true, data: result.rows });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post("/wms/stock-ledger", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const {
      item_id, item_code, location_id, location_code, warehouse_id,
      batch_number, serial_number, expiry_date, lot_number,
      transaction_type, quantity_in, quantity_out, balance,
      unit_cost, total_cost, reference_type, reference_id,
      reference_number, supplier_id, customer_id,
      purchase_order_id, sales_order_id, performed_by, notes
    } = req.body;

    const result = await client.query(`
      INSERT INTO stock_ledger
        (item_id, item_code, location_id, location_code, warehouse_id,
         batch_number, serial_number, expiry_date, lot_number,
         transaction_type, quantity_in, quantity_out, balance,
         unit_cost, total_cost, reference_type, reference_id,
         reference_number, supplier_id, customer_id,
         purchase_order_id, sales_order_id, performed_by, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
      RETURNING *
    `, [
      item_id, item_code, location_id, location_code, warehouse_id,
      batch_number, serial_number, expiry_date, lot_number,
      transaction_type, quantity_in || 0, quantity_out || 0, balance || 0,
      unit_cost, total_cost, reference_type, reference_id,
      reference_number, supplier_id, customer_id,
      purchase_order_id, sales_order_id, performed_by, notes
    ]);

    await upsertStockPosition(client, {
      item_id: Number(item_id),
      item_code: item_code || undefined,
      location_id: location_id ? Number(location_id) : undefined,
      location_code: location_code || undefined,
      warehouse_id: warehouse_id ? Number(warehouse_id) : undefined,
      batch_number: batch_number || undefined,
      serial_number: serial_number || undefined,
      expiry_date: expiry_date || undefined,
      lot_number: lot_number || undefined,
      quantity_in: Number(quantity_in) || 0,
      quantity_out: Number(quantity_out) || 0,
      unit_cost: unit_cost ? Number(unit_cost) : undefined,
    });

    await client.query("COMMIT");
    res.json({ success: true, data: result.rows[0] });
  } catch (e: any) {
    await client.query("ROLLBACK");
    res.status(500).json({ success: false, error: e.message });
  } finally {
    client.release();
  }
});

// ============================
// TASK 4: Inventory Valuation
// ============================

router.get("/wms/valuation-settings", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ivs.*,
        i.name as item_name,
        w.name as warehouse_name
      FROM item_valuation_settings ivs
      LEFT JOIN inventory i ON i.id = ivs.item_id
      LEFT JOIN warehouses w ON w.id = ivs.warehouse_id
      ORDER BY ivs.is_global DESC, ivs.item_code
    `);
    res.json({ success: true, data: result.rows });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post("/wms/valuation-settings", async (req, res) => {
  try {
    const { item_code, warehouse_id, valuation_method, is_global } = req.body;
    let { item_id } = req.body;
    if (!item_id && item_code) {
      const itemRes = await pool.query(
        `SELECT item_id FROM stock_positions WHERE item_code = $1 AND item_id IS NOT NULL LIMIT 1`,
        [item_code]
      ).catch(() => ({ rows: [] }));
      if (itemRes.rows.length > 0) {
        item_id = itemRes.rows[0].item_id;
      }
    }
    const result = await pool.query(`
      INSERT INTO item_valuation_settings (item_id, item_code, warehouse_id, valuation_method, is_global)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT DO NOTHING
      RETURNING *
    `, [item_id || null, item_code || null, warehouse_id || null, valuation_method || 'weighted_average', is_global || false]);
    res.json({ success: true, data: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.put("/wms/valuation-settings/:id", async (req, res) => {
  try {
    const { valuation_method, is_global } = req.body;
    const result = await pool.query(`
      UPDATE item_valuation_settings
      SET valuation_method=$1, is_global=$2, updated_at=NOW()
      WHERE id=$3 RETURNING *
    `, [valuation_method, is_global, req.params.id]);
    res.json({ success: true, data: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get("/wms/valuation-report", async (req, res) => {
  try {
    const { warehouse_id, item_code, method } = req.query;
    const wh_id = warehouse_id ? Number(warehouse_id) : null;

    const stockParams: any[] = [];
    const stockConds: string[] = ["sp.quantity > 0"];
    if (wh_id) { stockConds.push(`sp.warehouse_id = $${stockParams.push(wh_id)}`); }
    if (item_code) { stockConds.push(`sp.item_code ILIKE $${stockParams.push(`%${item_code}%`)}`); }

    const stockResult = await pool.query(`
      SELECT
        sp.item_id,
        sp.item_code,
        sp.warehouse_id,
        w.name as warehouse_name,
        SUM(sp.quantity) as total_qty,
        SUM(sp.total_value) as total_value_db,
        COALESCE(
          -- 1. item+warehouse specific (by item_id or item_code)
          (SELECT valuation_method FROM item_valuation_settings ivs
           WHERE (ivs.item_id = sp.item_id OR (ivs.item_id IS NULL AND ivs.item_code = sp.item_code))
           AND ivs.warehouse_id = sp.warehouse_id
           AND ivs.is_global = false
           LIMIT 1),
          -- 2. item-level, any warehouse (by item_id or item_code)
          (SELECT valuation_method FROM item_valuation_settings ivs
           WHERE (ivs.item_id = sp.item_id OR (ivs.item_id IS NULL AND ivs.item_code = sp.item_code))
           AND ivs.warehouse_id IS NULL
           AND ivs.is_global = false
           LIMIT 1),
          -- 3. warehouse-level global
          (SELECT valuation_method FROM item_valuation_settings ivs
           WHERE ivs.warehouse_id = sp.warehouse_id AND ivs.is_global = true
           LIMIT 1),
          -- 4. system global
          (SELECT valuation_method FROM item_valuation_settings ivs
           WHERE ivs.is_global = true AND ivs.warehouse_id IS NULL
           LIMIT 1),
          'weighted_average'
        ) as valuation_method
      FROM stock_positions sp
      LEFT JOIN warehouses w ON w.id = sp.warehouse_id
      WHERE ${stockConds.join(" AND ")}
      GROUP BY sp.item_id, sp.item_code, sp.warehouse_id, w.name
      ORDER BY sp.item_code
      LIMIT 500
    `, stockParams);

    const ledgerParams: any[] = [];
    const ledgerConds: string[] = [];
    if (wh_id) { ledgerConds.push(`sl.warehouse_id = $${ledgerParams.push(wh_id)}`); }

    const [inboundResult, outboundResult] = await Promise.all([
      pool.query(`
        SELECT sl.item_id, sl.warehouse_id, sl.serial_number, sl.batch_number,
          sl.quantity_in, sl.unit_cost, sl.created_at
        FROM stock_ledger sl
        WHERE sl.quantity_in > 0
          ${ledgerConds.length > 0 ? `AND ${ledgerConds.join(" AND ")}` : ""}
        ORDER BY sl.item_id, sl.warehouse_id, sl.created_at ASC
      `, ledgerParams),
      pool.query(`
        SELECT sl.item_id, sl.warehouse_id, SUM(sl.quantity_out) as total_out,
          AVG(sl.unit_cost) as avg_cost_out
        FROM stock_ledger sl
        WHERE sl.quantity_out > 0
          ${ledgerConds.length > 0 ? `AND ${ledgerConds.join(" AND ")}` : ""}
        GROUP BY sl.item_id, sl.warehouse_id
      `, ledgerParams),
    ]);

    interface CostLayer {
      qty: number;
      cost: number;
      serial_number?: string;
      batch_number?: string;
      date: Date;
    }

    const ledgerMap: Record<string, CostLayer[]> = {};
    for (const row of inboundResult.rows) {
      const key = `${row.item_id}-${row.warehouse_id}`;
      if (!ledgerMap[key]) ledgerMap[key] = [];
      ledgerMap[key].push({
        qty: parseFloat(row.quantity_in),
        cost: parseFloat(row.unit_cost || 0),
        serial_number: row.serial_number,
        batch_number: row.batch_number,
        date: row.created_at,
      });
    }

    const outboundMap: Record<string, { qty: number; avg_cost: number }> = {};
    for (const row of outboundResult.rows) {
      outboundMap[`${row.item_id}-${row.warehouse_id}`] = {
        qty: parseFloat(row.total_out || 0),
        avg_cost: parseFloat(row.avg_cost_out || 0),
      };
    }

    function consumeLayers(srcLayers: CostLayer[], outQty: number): { cogs: number; remaining: CostLayer[] } {
      const workLayers = srcLayers.map(l => ({ ...l }));
      let cogs = 0;
      let rem = outQty;
      for (const layer of workLayers) {
        if (rem <= 0) break;
        const lq = Math.min(layer.qty, rem);
        cogs += lq * layer.cost;
        layer.qty -= lq;
        rem -= lq;
      }
      const remaining = workLayers.filter(l => l.qty > 0);
      return { cogs, remaining };
    }

    function valueRemaining(remainingLayers: CostLayer[]): number {
      return remainingLayers.reduce((s, l) => s + l.qty * l.cost, 0);
    }

    const items = stockResult.rows.map(row => {
      const key = `${row.item_id}-${row.warehouse_id}`;
      const layers: CostLayer[] = ledgerMap[key] || [];
      const qty = parseFloat(row.total_qty) || 0;
      const outbound = outboundMap[key] || { qty: 0, avg_cost: 0 };

      const totalCostInLayers = layers.reduce((s, l) => s + l.cost * l.qty, 0);
      const totalQtyInLayers = layers.reduce((s, l) => s + l.qty, 0);
      const avgCost = totalQtyInLayers > 0 ? totalCostInLayers / totalQtyInLayers : 0;

      const targetMethod = (method as string) || row.valuation_method;

      const waVal = avgCost * qty;
      const waCogs = avgCost * outbound.qty;

      let fifoVal = 0, fifoCogs = 0;
      let lifoVal = 0, lifoCogs = 0;
      let siVal = 0, siCogs = 0;

      if (layers.length > 0) {
        // FIFO: oldest units sold first (consume from front), ending inventory = remaining newer layers
        const fifoResult = consumeLayers(layers, outbound.qty);
        fifoCogs = fifoResult.cogs;
        fifoVal = valueRemaining(fifoResult.remaining);

        // LIFO: newest units sold first (consume from back), ending inventory = remaining older layers
        const lifoResult = consumeLayers([...layers].reverse(), outbound.qty);
        lifoCogs = lifoResult.cogs;
        lifoVal = valueRemaining(lifoResult.remaining);

        // Specific identification: consume each outbound unit at its identified purchase cost
        // (using chronological receipt order at aggregate level, matching each sale to a specific lot)
        const siResult = consumeLayers(layers, outbound.qty);
        siCogs = siResult.cogs;
        siVal = valueRemaining(siResult.remaining);
      } else {
        // No inbound layers: fall back to stock_positions total_value for ending inventory
        fifoVal = lifoVal = siVal = parseFloat(row.total_value_db) || 0;
      }

      let selected = 0;
      let selectedCogs = 0;
      switch (targetMethod) {
        case 'fifo': selected = fifoVal; selectedCogs = fifoCogs; break;
        case 'lifo': selected = lifoVal; selectedCogs = lifoCogs; break;
        case 'weighted_average': selected = waVal; selectedCogs = waCogs; break;
        case 'specific_identification': selected = siVal; selectedCogs = siCogs; break;
        default: selected = waVal; selectedCogs = waCogs;
      }

      return {
        ...row,
        quantity: qty,
        avg_unit_cost: avgCost,
        fifo_value: fifoVal,
        lifo_value: lifoVal,
        weighted_avg_value: waVal,
        specific_identification_value: siVal,
        selected_method: targetMethod,
        selected_value: selected,
        layers_count: layers.length,
        cogs: {
          fifo: fifoCogs,
          lifo: lifoCogs,
          weighted_average: waCogs,
          specific_identification: siCogs,
          selected: selectedCogs,
          qty_sold: outbound.qty,
        },
      };
    });

    const totals = {
      fifo_total: items.reduce((s, i) => s + (i.fifo_value || 0), 0),
      lifo_total: items.reduce((s, i) => s + (i.lifo_value || 0), 0),
      weighted_avg_total: items.reduce((s, i) => s + (i.weighted_avg_value || 0), 0),
      specific_id_total: items.reduce((s, i) => s + (i.specific_identification_value || 0), 0),
      selected_total: items.reduce((s, i) => s + (i.selected_value || 0), 0),
      item_count: items.length,
    };

    res.json({ success: true, data: items, totals });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================
// TASK 5: Lot Traceability
// ============================

router.post("/wms/lot-events", async (req, res) => {
  try {
    const {
      lot_number, batch_number, item_id, item_code, item_name,
      event_type, quantity, source_type, source_id, source_reference,
      destination_type, destination_id, destination_reference,
      supplier_id, supplier_name, customer_id, customer_name,
      purchase_order_id, sales_order_id, warehouse_id, location_code,
      expiry_date, notes
    } = req.body;

    const result = await pool.query(`
      INSERT INTO lot_traceability
        (lot_number, batch_number, item_id, item_code, item_name,
         event_type, quantity, source_type, source_id, source_reference,
         destination_type, destination_id, destination_reference,
         supplier_id, supplier_name, customer_id, customer_name,
         purchase_order_id, sales_order_id, warehouse_id, location_code,
         expiry_date, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      RETURNING *
    `, [
      lot_number, batch_number, item_id, item_code, item_name,
      event_type, quantity, source_type, source_id, source_reference,
      destination_type, destination_id, destination_reference,
      supplier_id, supplier_name, customer_id, customer_name,
      purchase_order_id, sales_order_id, warehouse_id, location_code,
      expiry_date, notes
    ]);

    res.json({ success: true, data: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get("/wms/lot-trace/forward/:lotNumber", async (req, res) => {
  try {
    const { lotNumber } = req.params;

    const result = await pool.query(`
      SELECT lt.*,
        w.name as warehouse_name
      FROM lot_traceability lt
      LEFT JOIN warehouses w ON w.id = lt.warehouse_id
      WHERE (lt.lot_number = $1 OR lt.batch_number = $1)
        AND lt.event_type IN ('receipt', 'production', 'transfer', 'shipment', 'sale', 'delivery')
      ORDER BY lt.event_date ASC
    `, [lotNumber]);

    const customers = result.rows
      .filter(r => r.customer_id || r.customer_name)
      .map(r => ({ customer_id: r.customer_id, customer_name: r.customer_name, event_date: r.event_date, reference: r.destination_reference, quantity: r.quantity }));

    const summary = {
      lot_number: lotNumber,
      events: result.rows,
      customers_affected: customers,
      total_quantity_distributed: customers.reduce((s, c) => s + parseFloat(c.quantity || 0), 0),
      warehouses: [...new Set(result.rows.map(r => r.warehouse_name).filter(Boolean))],
    };

    res.json({ success: true, data: summary });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get("/wms/lot-trace/backward/:lotNumber", async (req, res) => {
  try {
    const { lotNumber } = req.params;

    const result = await pool.query(`
      SELECT lt.*,
        w.name as warehouse_name
      FROM lot_traceability lt
      LEFT JOIN warehouses w ON w.id = lt.warehouse_id
      WHERE (lt.lot_number = $1 OR lt.batch_number = $1)
      ORDER BY lt.event_date ASC
    `, [lotNumber]);

    const suppliers = result.rows
      .filter(r => r.supplier_id || r.supplier_name)
      .map(r => ({
        supplier_id: r.supplier_id,
        supplier_name: r.supplier_name,
        event_date: r.event_date,
        purchase_order_id: r.purchase_order_id,
        reference: r.source_reference,
        quantity: r.quantity,
        expiry_date: r.expiry_date,
      }));

    const summary = {
      lot_number: lotNumber,
      events: result.rows,
      suppliers,
      source_pos: [...new Set(result.rows.map(r => r.purchase_order_id).filter(Boolean))],
      item_info: result.rows.length > 0 ? { item_id: result.rows[0].item_id, item_code: result.rows[0].item_code, item_name: result.rows[0].item_name } : null,
    };

    res.json({ success: true, data: summary });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get("/wms/lot-trace/search", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ success: true, data: [] });

    const result = await pool.query(`
      SELECT DISTINCT lot_number, batch_number, item_code, item_name,
        MIN(event_date) as first_event,
        MAX(event_date) as last_event,
        COUNT(*) as event_count,
        MAX(expiry_date) as expiry_date
      FROM lot_traceability
      WHERE lot_number ILIKE $1 OR batch_number ILIKE $1 OR item_code ILIKE $1
      GROUP BY lot_number, batch_number, item_code, item_name
      ORDER BY first_event DESC
      LIMIT 50
    `, [`%${q}%`]);

    res.json({ success: true, data: result.rows });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================
// TASK 5b: Expiry Management
// ============================

router.get("/wms/expiry-dashboard", async (req, res) => {
  try {
    const { days_ahead = "90", warehouse_id } = req.query;
    const daysAhead = Math.min(Math.max(parseInt(days_ahead as string) || 90, 1), 730);

    const params: any[] = [daysAhead];
    const warehouseClause = warehouse_id
      ? `AND sp.warehouse_id = $${params.push(Number(warehouse_id))}`
      : "";

    const stockExpiryResult = await pool.query(`
      SELECT
        sp.*,
        w.name as warehouse_name,
        wl.zone, wl.aisle, wl.shelf, wl.bin,
        CURRENT_DATE as today,
        (sp.expiry_date - CURRENT_DATE) as days_until_expiry,
        CASE
          WHEN sp.expiry_date < CURRENT_DATE THEN 'expired'
          WHEN (sp.expiry_date - CURRENT_DATE) <= 7 THEN 'critical'
          WHEN (sp.expiry_date - CURRENT_DATE) <= 30 THEN 'warning'
          WHEN (sp.expiry_date - CURRENT_DATE) <= 90 THEN 'approaching'
          ELSE 'ok'
        END as expiry_status
      FROM stock_positions sp
      LEFT JOIN warehouses w ON w.id = sp.warehouse_id
      LEFT JOIN warehouse_locations wl ON wl.id = sp.location_id
      WHERE sp.expiry_date IS NOT NULL
        AND sp.expiry_date <= CURRENT_DATE + ($1::int * INTERVAL '1 day')
        AND sp.quantity > 0
        ${warehouseClause}
      ORDER BY sp.expiry_date ASC
      LIMIT 200
    `, params);

    const items = stockExpiryResult.rows;

    const summary = {
      expired: items.filter(i => i.expiry_status === 'expired').length,
      critical: items.filter(i => i.expiry_status === 'critical').length,
      warning: items.filter(i => i.expiry_status === 'warning').length,
      approaching: items.filter(i => i.expiry_status === 'approaching').length,
      total: items.length,
      total_value_at_risk: items
        .filter(i => ['expired', 'critical', 'warning'].includes(i.expiry_status))
        .reduce((s, i) => s + parseFloat(i.total_value || 0), 0),
    };

    res.json({ success: true, data: items, summary });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get("/wms/expiry-alert-settings", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT eas.*, i.name as item_name
      FROM expiry_alert_settings eas
      LEFT JOIN inventory i ON i.id = eas.item_id
      ORDER BY eas.is_global DESC, eas.item_code
    `);
    res.json({ success: true, data: result.rows });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post("/wms/expiry-alert-settings", async (req, res) => {
  try {
    const { item_id, item_code, alert_days_before, is_global, is_active } = req.body;
    const result = await pool.query(`
      INSERT INTO expiry_alert_settings (item_id, item_code, alert_days_before, is_global, is_active)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [item_id, item_code, alert_days_before || 30, is_global || false, is_active !== false]);
    res.json({ success: true, data: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
