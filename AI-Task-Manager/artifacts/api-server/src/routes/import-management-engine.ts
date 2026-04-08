/**
 * מנוע ניהול יבוא וסחר חוץ - מפעל מתכת
 * ניהול משלוחים בינלאומיים של ברזל, אלומיניום וזכוכית
 * כולל חישוב עלויות נחיתה, מכס, מע"מ ושערי חליפין
 */

import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";
import { VAT_RATE } from "../constants";

// ===================== טיפוסים =====================

interface AuthRequest extends Request {
  user?: { id: number; username: string; role?: string };
}

interface QueryRow {
  [key: string]: unknown;
}

// ===================== סוגי עלויות זמינים =====================
const COST_TYPES = [
  { type: "freight_sea", description: "הובלה ימית", description_he: "הובלה ימית" },
  { type: "freight_air", description: "הובלה אווירית", description_he: "הובלה אווירית" },
  { type: "insurance", description: "ביטוח", description_he: "ביטוח מטען" },
  { type: "customs_duty", description: "מכס", description_he: "מכס" },
  { type: "purchase_tax", description: "מס קנייה", description_he: "מס קנייה" },
  { type: "vat", description: "מע\"מ", description_he: "מע\"מ יבוא" },
  { type: "broker_fee", description: "עמלת עמיל מכס", description_he: "עמלת עמיל מכס" },
  { type: "port_handling", description: "טיפול נמלי", description_he: "אגרות נמל וטיפול" },
  { type: "inland_transport", description: "הובלה יבשתית", description_he: "הובלה מנמל למפעל" },
  { type: "inspection", description: "בדיקות", description_he: "בדיקות ומעבדה" },
  { type: "storage", description: "אחסון", description_he: "אחסון במחסן ערובה" },
  { type: "documentation", description: "תיעוד", description_he: "עלויות תיעוד ורשיונות" },
];

// ===================== ראוטר =====================

const router = Router();

// ===================== אימות =====================

async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  req.user = result.user;
  next();
}

router.use("/import-management", requireAuth as (req: Request, res: Response, next: NextFunction) => void);

// ===================== שאילתה בטוחה =====================

async function safeQuery(query: string, params?: unknown[]): Promise<QueryRow[]> {
  try {
    const result = params
      ? await db.execute(sql.raw(query))
      : await db.execute(sql.raw(query));
    return (result.rows || []) as QueryRow[];
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("שגיאת שאילתת יבוא:", message);
    return [];
  }
}

// ===================== אתחול טבלאות =====================

router.post("/import-management/init", async (_req: Request, res: Response) => {
  try {
    // טבלת משלוחי יבוא
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS import_shipments (
        id SERIAL PRIMARY KEY,
        shipment_number VARCHAR(100) UNIQUE NOT NULL,
        supplier_id INTEGER,
        supplier_name VARCHAR(255),
        country_of_origin VARCHAR(100),
        port_of_loading VARCHAR(255),
        port_of_discharge VARCHAR(255) DEFAULT 'Ashdod',
        incoterm VARCHAR(10),
        ship_name VARCHAR(255),
        container_number VARCHAR(100),
        bill_of_lading VARCHAR(100),
        items JSONB DEFAULT '[]',
        total_weight_kg NUMERIC(15,2),
        total_volume_cbm NUMERIC(10,3),
        fob_value NUMERIC(15,2),
        freight_cost NUMERIC(15,2),
        insurance_cost NUMERIC(15,2),
        cif_value NUMERIC(15,2),
        currency VARCHAR(10) DEFAULT 'USD',
        exchange_rate NUMERIC(15,6),
        ils_value NUMERIC(15,2),
        customs_duty_rate NUMERIC(5,2),
        customs_duty_amount NUMERIC(15,2),
        purchase_tax NUMERIC(15,2),
        vat_amount NUMERIC(15,2),
        total_landed_cost NUMERIC(15,2),
        customs_broker VARCHAR(255),
        customs_declaration_number VARCHAR(100),
        estimated_arrival DATE,
        actual_arrival DATE,
        clearance_date DATE,
        delivery_to_warehouse DATE,
        documents JSONB DEFAULT '[]',
        status VARCHAR(50) DEFAULT 'ordered',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `));

    // טבלת פירוט עלויות יבוא
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS import_cost_breakdown (
        id SERIAL PRIMARY KEY,
        shipment_id INTEGER REFERENCES import_shipments(id),
        cost_type VARCHAR(100),
        description VARCHAR(500),
        amount NUMERIC(15,2),
        currency VARCHAR(10) DEFAULT 'ILS',
        vendor VARCHAR(255),
        invoice_number VARCHAR(100),
        paid BOOLEAN DEFAULT false,
        paid_date DATE,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `));

    // אינדקסים לביצועים
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_import_shipments_status ON import_shipments(status)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_import_shipments_supplier ON import_shipments(supplier_id)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_import_cost_shipment ON import_cost_breakdown(shipment_id)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_import_shipments_arrival ON import_shipments(estimated_arrival)`));

    res.json({
      success: true,
      message: "טבלאות יבוא אותחלו בהצלחה",
      tables: ["import_shipments", "import_cost_breakdown"],
      cost_types: COST_TYPES,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה באתחול טבלאות יבוא" });
  }
});

// ===================== CRUD משלוחי יבוא =====================

// רשימת כל המשלוחים עם סינון
router.get("/import-management/shipments", async (req: Request, res: Response) => {
  try {
    const { status, supplier_id, country, from_date, to_date, search, page = "1", limit = "50" } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = "WHERE 1=1";
    if (status) where += ` AND s.status = '${status}'`;
    if (supplier_id) where += ` AND s.supplier_id = ${Number(supplier_id)}`;
    if (country) where += ` AND s.country_of_origin ILIKE '%${country}%'`;
    if (from_date) where += ` AND s.estimated_arrival >= '${from_date}'`;
    if (to_date) where += ` AND s.estimated_arrival <= '${to_date}'`;
    if (search) where += ` AND (s.shipment_number ILIKE '%${search}%' OR s.supplier_name ILIKE '%${search}%' OR s.container_number ILIKE '%${search}%')`;

    // ספירה כוללת
    const countRows = await safeQuery(`SELECT COUNT(*) as total FROM import_shipments s ${where}`);
    const total = Number(countRows[0]?.total || 0);

    // משלוחים עם סכום עלויות
    const rows = await safeQuery(`
      SELECT s.*,
        COALESCE(SUM(c.amount), 0) as total_additional_costs,
        COUNT(c.id) as cost_items_count
      FROM import_shipments s
      LEFT JOIN import_cost_breakdown c ON c.shipment_id = s.id
      ${where}
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT ${Number(limit)} OFFSET ${offset}
    `);

    res.json({
      shipments: rows,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בשליפת משלוחים" });
  }
});

// משלוח בודד לפי מזהה
router.get("/import-management/shipments/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rows = await safeQuery(`SELECT * FROM import_shipments WHERE id = ${Number(id)}`);
    if (!rows.length) { res.status(404).json({ error: "משלוח לא נמצא" }); return; }

    // עלויות נלוות
    const costs = await safeQuery(`SELECT * FROM import_cost_breakdown WHERE shipment_id = ${Number(id)} ORDER BY created_at`);

    res.json({ shipment: rows[0], costs });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בשליפת משלוח" });
  }
});

// יצירת משלוח חדש
router.post("/import-management/shipments", async (req: AuthRequest, res: Response) => {
  try {
    const {
      shipment_number, supplier_id, supplier_name, country_of_origin,
      port_of_loading, port_of_discharge, incoterm, ship_name,
      container_number, bill_of_lading, items, total_weight_kg,
      total_volume_cbm, fob_value, freight_cost, insurance_cost,
      currency, exchange_rate, customs_duty_rate, customs_broker,
      customs_declaration_number, estimated_arrival, actual_arrival,
      documents, status, notes,
    } = req.body;

    // חישוב ערך CIF אוטומטי
    const fob = Number(fob_value) || 0;
    const freight = Number(freight_cost) || 0;
    const insurance = Number(insurance_cost) || 0;
    const cif_value = fob + freight + insurance;

    // חישוב ערך בשקלים
    const rate = Number(exchange_rate) || 1;
    const ils_value = cif_value * rate;

    // חישוב מכס, מס קנייה ומע"מ
    const dutyRate = Number(customs_duty_rate) || 0;
    const customs_duty_amount = ils_value * (dutyRate / 100);
    const purchase_tax = 0; // מס קנייה - תלוי בסיווג המוצר
    const vat_base = ils_value + customs_duty_amount + purchase_tax;
    const vat_amount = vat_base * VAT_RATE;
    const total_landed_cost = ils_value + customs_duty_amount + purchase_tax + vat_amount;

    const rows = await safeQuery(`
      INSERT INTO import_shipments (
        shipment_number, supplier_id, supplier_name, country_of_origin,
        port_of_loading, port_of_discharge, incoterm, ship_name,
        container_number, bill_of_lading, items, total_weight_kg,
        total_volume_cbm, fob_value, freight_cost, insurance_cost,
        cif_value, currency, exchange_rate, ils_value,
        customs_duty_rate, customs_duty_amount, purchase_tax, vat_amount,
        total_landed_cost, customs_broker, customs_declaration_number,
        estimated_arrival, actual_arrival, documents, status, notes
      ) VALUES (
        '${shipment_number}', ${supplier_id || 'NULL'}, '${supplier_name || ''}', '${country_of_origin || ''}',
        '${port_of_loading || ''}', '${port_of_discharge || 'Ashdod'}', '${incoterm || 'FOB'}', '${ship_name || ''}',
        '${container_number || ''}', '${bill_of_lading || ''}', '${JSON.stringify(items || [])}', ${total_weight_kg || 0},
        ${total_volume_cbm || 0}, ${fob}, ${freight}, ${insurance},
        ${cif_value}, '${currency || 'USD'}', ${rate}, ${ils_value},
        ${dutyRate}, ${customs_duty_amount}, ${purchase_tax}, ${vat_amount},
        ${total_landed_cost}, '${customs_broker || ''}', '${customs_declaration_number || ''}',
        ${estimated_arrival ? `'${estimated_arrival}'` : 'NULL'}, ${actual_arrival ? `'${actual_arrival}'` : 'NULL'},
        '${JSON.stringify(documents || [])}', '${status || 'ordered'}', '${notes || ''}'
      ) RETURNING *
    `);

    res.json({ success: true, message: "משלוח יבוא נוצר בהצלחה", shipment: rows[0] });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה ביצירת משלוח" });
  }
});

// עדכון משלוח
router.put("/import-management/shipments/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;

    // חישוב מחדש אם שונו ערכים פיננסיים
    if (fields.fob_value || fields.freight_cost || fields.insurance_cost || fields.exchange_rate || fields.customs_duty_rate) {
      const current = await safeQuery(`SELECT * FROM import_shipments WHERE id = ${Number(id)}`);
      if (!current.length) { res.status(404).json({ error: "משלוח לא נמצא" }); return; }

      const fob = Number(fields.fob_value ?? current[0].fob_value) || 0;
      const freight = Number(fields.freight_cost ?? current[0].freight_cost) || 0;
      const insurance = Number(fields.insurance_cost ?? current[0].insurance_cost) || 0;
      const rate = Number(fields.exchange_rate ?? current[0].exchange_rate) || 1;
      const dutyRate = Number(fields.customs_duty_rate ?? current[0].customs_duty_rate) || 0;

      const cif = fob + freight + insurance;
      const ils = cif * rate;
      const duty = ils * (dutyRate / 100);
      const ptax = Number(fields.purchase_tax ?? current[0].purchase_tax) || 0;
      const vat = (ils + duty + ptax) * VAT_RATE;
      const landed = ils + duty + ptax + vat;

      fields.cif_value = cif;
      fields.ils_value = ils;
      fields.customs_duty_amount = duty;
      fields.vat_amount = vat;
      fields.total_landed_cost = landed;
    }

    // בניית עדכון דינמי
    const setClauses: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      if (key === "id") continue;
      if (value === null || value === undefined) {
        setClauses.push(`${key} = NULL`);
      } else if (typeof value === "object") {
        setClauses.push(`${key} = '${JSON.stringify(value)}'`);
      } else if (typeof value === "string") {
        setClauses.push(`${key} = '${value}'`);
      } else {
        setClauses.push(`${key} = ${value}`);
      }
    }
    setClauses.push("updated_at = NOW()");

    const rows = await safeQuery(`UPDATE import_shipments SET ${setClauses.join(", ")} WHERE id = ${Number(id)} RETURNING *`);
    if (!rows.length) { res.status(404).json({ error: "משלוח לא נמצא" }); return; }

    res.json({ success: true, message: "משלוח עודכן בהצלחה", shipment: rows[0] });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בעדכון משלוח" });
  }
});

// ===================== CRUD עלויות נלוות =====================

// הוספת עלות למשלוח
router.post("/import-management/costs", async (_req: Request, res: Response) => {
  try {
    const { shipment_id, cost_type, description, amount, currency, vendor, invoice_number, paid, paid_date, notes } = _req.body;

    const rows = await safeQuery(`
      INSERT INTO import_cost_breakdown (shipment_id, cost_type, description, amount, currency, vendor, invoice_number, paid, paid_date, notes)
      VALUES (${Number(shipment_id)}, '${cost_type}', '${description || ''}', ${Number(amount) || 0}, '${currency || 'ILS'}', '${vendor || ''}', '${invoice_number || ''}', ${paid || false}, ${paid_date ? `'${paid_date}'` : 'NULL'}, '${notes || ''}')
      RETURNING *
    `);

    // עדכון עלות נחיתה כוללת של המשלוח
    await safeQuery(`
      UPDATE import_shipments SET
        total_landed_cost = COALESCE(ils_value, 0) + COALESCE(customs_duty_amount, 0) + COALESCE(purchase_tax, 0) + COALESCE(vat_amount, 0)
          + COALESCE((SELECT SUM(amount) FROM import_cost_breakdown WHERE shipment_id = ${Number(shipment_id)} AND cost_type NOT IN ('customs_duty','purchase_tax','vat')), 0),
        updated_at = NOW()
      WHERE id = ${Number(shipment_id)}
    `);

    res.json({ success: true, message: "עלות נוספה למשלוח", cost: rows[0] });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בהוספת עלות" });
  }
});

// עדכון עלות
router.put("/import-management/costs/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { cost_type, description, amount, currency, vendor, invoice_number, paid, paid_date, notes } = req.body;

    const setClauses: string[] = [];
    if (cost_type !== undefined) setClauses.push(`cost_type = '${cost_type}'`);
    if (description !== undefined) setClauses.push(`description = '${description}'`);
    if (amount !== undefined) setClauses.push(`amount = ${Number(amount)}`);
    if (currency !== undefined) setClauses.push(`currency = '${currency}'`);
    if (vendor !== undefined) setClauses.push(`vendor = '${vendor}'`);
    if (invoice_number !== undefined) setClauses.push(`invoice_number = '${invoice_number}'`);
    if (paid !== undefined) setClauses.push(`paid = ${paid}`);
    if (paid_date !== undefined) setClauses.push(`paid_date = ${paid_date ? `'${paid_date}'` : 'NULL'}`);
    if (notes !== undefined) setClauses.push(`notes = '${notes}'`);

    if (!setClauses.length) { res.status(400).json({ error: "לא סופקו שדות לעדכון" }); return; }

    const rows = await safeQuery(`UPDATE import_cost_breakdown SET ${setClauses.join(", ")} WHERE id = ${Number(id)} RETURNING *`);
    if (!rows.length) { res.status(404).json({ error: "עלות לא נמצאה" }); return; }

    res.json({ success: true, message: "עלות עודכנה בהצלחה", cost: rows[0] });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בעדכון עלות" });
  }
});

// רשימת עלויות למשלוח
router.get("/import-management/costs/:shipmentId", async (req: Request, res: Response) => {
  try {
    const { shipmentId } = req.params;
    const rows = await safeQuery(`
      SELECT * FROM import_cost_breakdown
      WHERE shipment_id = ${Number(shipmentId)}
      ORDER BY cost_type, created_at
    `);

    // סיכום לפי סוג עלות
    const summary = await safeQuery(`
      SELECT cost_type, COUNT(*) as count, SUM(amount) as total,
        SUM(CASE WHEN paid THEN amount ELSE 0 END) as paid_total,
        SUM(CASE WHEN NOT paid THEN amount ELSE 0 END) as unpaid_total
      FROM import_cost_breakdown
      WHERE shipment_id = ${Number(shipmentId)}
      GROUP BY cost_type
      ORDER BY total DESC
    `);

    res.json({ costs: rows, summary });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בשליפת עלויות" });
  }
});

// ===================== לוח בקרה יבוא =====================

router.get("/import-management/dashboard", async (_req: Request, res: Response) => {
  try {
    // משלוחים פעילים לפי סטטוס
    const activeByStatus = await safeQuery(`
      SELECT status, COUNT(*) as count,
        SUM(cif_value) as total_cif,
        SUM(total_landed_cost) as total_landed,
        SUM(total_weight_kg) as total_weight
      FROM import_shipments
      WHERE status NOT IN ('delivered', 'cancelled')
      GROUP BY status
      ORDER BY count DESC
    `);

    // סה"כ סטטיסטיקות
    const totals = await safeQuery(`
      SELECT
        COUNT(*) as total_shipments,
        COUNT(*) FILTER (WHERE status NOT IN ('delivered','cancelled')) as active_shipments,
        SUM(cif_value) FILTER (WHERE status NOT IN ('cancelled')) as total_cif_value,
        SUM(total_landed_cost) FILTER (WHERE status NOT IN ('cancelled')) as total_landed_cost,
        SUM(total_weight_kg) FILTER (WHERE status NOT IN ('cancelled')) as total_weight,
        AVG(total_landed_cost) FILTER (WHERE status = 'delivered') as avg_landed_cost
      FROM import_shipments
    `);

    // הגעות צפויות - 30 יום קרוב
    const upcomingArrivals = await safeQuery(`
      SELECT id, shipment_number, supplier_name, country_of_origin,
        estimated_arrival, total_weight_kg, cif_value, status
      FROM import_shipments
      WHERE estimated_arrival BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        AND status NOT IN ('delivered', 'cancelled')
      ORDER BY estimated_arrival ASC
    `);

    // פילוח לפי מדינת מקור
    const byCountry = await safeQuery(`
      SELECT country_of_origin, COUNT(*) as count,
        SUM(cif_value) as total_cif,
        SUM(total_weight_kg) as total_weight
      FROM import_shipments
      WHERE status != 'cancelled'
      GROUP BY country_of_origin
      ORDER BY total_cif DESC
    `);

    // עלויות שלא שולמו
    const unpaidCosts = await safeQuery(`
      SELECT c.*, s.shipment_number
      FROM import_cost_breakdown c
      JOIN import_shipments s ON s.id = c.shipment_id
      WHERE c.paid = false
      ORDER BY c.amount DESC
      LIMIT 20
    `);

    // עלויות חודשיות - 6 חודשים אחרונים
    const monthlyCosts = await safeQuery(`
      SELECT
        TO_CHAR(s.created_at, 'YYYY-MM') as month,
        SUM(s.cif_value) as total_cif,
        SUM(s.customs_duty_amount) as total_customs,
        SUM(s.vat_amount) as total_vat,
        SUM(s.total_landed_cost) as total_landed,
        COUNT(*) as shipment_count
      FROM import_shipments s
      WHERE s.created_at >= CURRENT_DATE - INTERVAL '6 months'
        AND s.status != 'cancelled'
      GROUP BY TO_CHAR(s.created_at, 'YYYY-MM')
      ORDER BY month DESC
    `);

    res.json({
      totals: totals[0] || {},
      active_by_status: activeByStatus,
      upcoming_arrivals: upcomingArrivals,
      by_country: byCountry,
      unpaid_costs: unpaidCosts,
      monthly_costs: monthlyCosts,
      cost_types: COST_TYPES,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בטעינת לוח בקרה" });
  }
});

// ===================== עלות נחיתה מפורטת =====================

router.get("/import-management/landed-cost/:shipmentId", async (req: Request, res: Response) => {
  try {
    const { shipmentId } = req.params;

    // משלוח
    const shipmentRows = await safeQuery(`SELECT * FROM import_shipments WHERE id = ${Number(shipmentId)}`);
    if (!shipmentRows.length) { res.status(404).json({ error: "משלוח לא נמצא" }); return; }
    const shipment = shipmentRows[0] as QueryRow;

    // פירוט עלויות
    const costs = await safeQuery(`
      SELECT cost_type, description, amount, currency, vendor, invoice_number, paid
      FROM import_cost_breakdown
      WHERE shipment_id = ${Number(shipmentId)}
      ORDER BY cost_type
    `);

    // חישוב עלות נחיתה לפריט
    const items = (shipment.items as Array<{ name: string; quantity: number; weight_kg: number; unit_price: number }>) || [];
    const totalFob = Number(shipment.fob_value) || 0;
    const totalLanded = Number(shipment.total_landed_cost) || 0;
    const landedRatio = totalFob > 0 ? totalLanded / totalFob : 1;

    // חלוקת עלות נחיתה לכל פריט באופן יחסי
    const itemsWithLanded = items.map((item) => {
      const itemFob = (item.unit_price || 0) * (item.quantity || 1);
      const itemShare = totalFob > 0 ? itemFob / totalFob : 0;
      const itemLanded = totalLanded * itemShare;
      const landedPerUnit = (item.quantity || 1) > 0 ? itemLanded / item.quantity : 0;
      return {
        ...item,
        fob_total: itemFob,
        share_percent: (itemShare * 100).toFixed(2),
        landed_total: itemLanded.toFixed(2),
        landed_per_unit: landedPerUnit.toFixed(2),
        markup_percent: ((landedRatio - 1) * 100).toFixed(2),
      };
    });

    // סיכום עלויות לפי קטגוריה
    const costSummary = await safeQuery(`
      SELECT cost_type,
        SUM(amount) as total,
        SUM(CASE WHEN paid THEN amount ELSE 0 END) as paid,
        SUM(CASE WHEN NOT paid THEN amount ELSE 0 END) as unpaid
      FROM import_cost_breakdown
      WHERE shipment_id = ${Number(shipmentId)}
      GROUP BY cost_type
    `);

    res.json({
      shipment: {
        id: shipment.id,
        shipment_number: shipment.shipment_number,
        supplier_name: shipment.supplier_name,
        country_of_origin: shipment.country_of_origin,
        currency: shipment.currency,
        exchange_rate: shipment.exchange_rate,
      },
      fob_value: totalFob,
      freight_cost: Number(shipment.freight_cost) || 0,
      insurance_cost: Number(shipment.insurance_cost) || 0,
      cif_value: Number(shipment.cif_value) || 0,
      ils_value: Number(shipment.ils_value) || 0,
      customs_duty_rate: Number(shipment.customs_duty_rate) || 0,
      customs_duty_amount: Number(shipment.customs_duty_amount) || 0,
      purchase_tax: Number(shipment.purchase_tax) || 0,
      vat_amount: Number(shipment.vat_amount) || 0,
      additional_costs: costs,
      cost_summary: costSummary,
      total_landed_cost: totalLanded,
      landed_cost_ratio: landedRatio.toFixed(4),
      items_breakdown: itemsWithLanded,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בחישוב עלות נחיתה" });
  }
});

// ===================== ניתוח השפעת שער חליפין =====================

router.get("/import-management/currency-impact", async (req: Request, res: Response) => {
  try {
    const { months = "12" } = req.query;

    // משלוחים עם שערי חליפין
    const shipments = await safeQuery(`
      SELECT id, shipment_number, supplier_name, currency, exchange_rate,
        fob_value, cif_value, ils_value, total_landed_cost,
        created_at
      FROM import_shipments
      WHERE exchange_rate IS NOT NULL AND exchange_rate > 0
        AND created_at >= CURRENT_DATE - INTERVAL '${Number(months)} months'
        AND status != 'cancelled'
      ORDER BY created_at DESC
    `);

    // ממוצע שער חליפין לפי חודש
    const monthlyRates = await safeQuery(`
      SELECT
        TO_CHAR(created_at, 'YYYY-MM') as month,
        currency,
        AVG(exchange_rate) as avg_rate,
        MIN(exchange_rate) as min_rate,
        MAX(exchange_rate) as max_rate,
        SUM(cif_value) as total_cif_foreign,
        SUM(ils_value) as total_cif_ils
      FROM import_shipments
      WHERE exchange_rate IS NOT NULL AND exchange_rate > 0
        AND created_at >= CURRENT_DATE - INTERVAL '${Number(months)} months'
        AND status != 'cancelled'
      GROUP BY TO_CHAR(created_at, 'YYYY-MM'), currency
      ORDER BY month DESC
    `);

    // ניתוח רגישות - מה היה קורה בשערים שונים
    const currentRate = shipments.length > 0 ? Number((shipments[0] as QueryRow).exchange_rate) : 3.65;
    const scenarios = [-10, -5, -2, 0, 2, 5, 10].map((pctChange) => {
      const hypotheticalRate = currentRate * (1 + pctChange / 100);
      let totalImpact = 0;
      for (const s of shipments) {
        const cifForeign = Number((s as QueryRow).cif_value) || 0;
        const actualIls = Number((s as QueryRow).ils_value) || 0;
        const hypotheticalIls = cifForeign * hypotheticalRate;
        totalImpact += hypotheticalIls - actualIls;
      }
      return {
        rate_change_pct: pctChange,
        hypothetical_rate: hypotheticalRate.toFixed(4),
        total_impact_ils: totalImpact.toFixed(2),
        description_he: pctChange === 0 ? "שער נוכחי" : pctChange > 0 ? `התחזקות דולר ב-${pctChange}%` : `היחלשות דולר ב-${Math.abs(pctChange)}%`,
      };
    });

    res.json({
      current_rate: currentRate,
      shipments_analyzed: shipments.length,
      monthly_rates: monthlyRates,
      sensitivity_analysis: scenarios,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בניתוח שער חליפין" });
  }
});

// ===================== ציר זמן משלוחים =====================

router.get("/import-management/shipping-timeline", async (req: Request, res: Response) => {
  try {
    const { months = "6" } = req.query;

    const shipments = await safeQuery(`
      SELECT id, shipment_number, supplier_name, country_of_origin,
        port_of_loading, port_of_discharge, ship_name, container_number,
        estimated_arrival, actual_arrival, clearance_date, delivery_to_warehouse,
        total_weight_kg, cif_value, status, created_at
      FROM import_shipments
      WHERE created_at >= CURRENT_DATE - INTERVAL '${Number(months)} months'
        AND status != 'cancelled'
      ORDER BY estimated_arrival ASC NULLS LAST
    `);

    // חישוב ימי עיכוב לכל משלוח
    const timeline = (shipments as QueryRow[]).map((s) => {
      const estimated = s.estimated_arrival ? new Date(s.estimated_arrival as string) : null;
      const actual = s.actual_arrival ? new Date(s.actual_arrival as string) : null;
      const delayDays = estimated && actual
        ? Math.round((actual.getTime() - estimated.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      const clearance = s.clearance_date ? new Date(s.clearance_date as string) : null;
      const clearanceDays = actual && clearance
        ? Math.round((clearance.getTime() - actual.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      return {
        ...s,
        delay_days: delayDays,
        clearance_processing_days: clearanceDays,
        is_delayed: delayDays !== null && delayDays > 0,
      };
    });

    // סטטיסטיקות עיכובים
    const delays = timeline.filter((t) => t.delay_days !== null);
    const avgDelay = delays.length > 0
      ? delays.reduce((sum, t) => sum + (t.delay_days || 0), 0) / delays.length
      : 0;
    const delayedCount = delays.filter((t) => t.is_delayed).length;

    res.json({
      timeline,
      stats: {
        total_shipments: timeline.length,
        avg_delay_days: avgDelay.toFixed(1),
        delayed_count: delayedCount,
        on_time_rate: delays.length > 0
          ? ((1 - delayedCount / delays.length) * 100).toFixed(1)
          : "N/A",
      },
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בטעינת ציר זמן" });
  }
});

// ===================== רשימת סוגי עלויות =====================

router.get("/import-management/cost-types", async (_req: Request, res: Response) => {
  res.json({ cost_types: COST_TYPES });
});

export default router;
