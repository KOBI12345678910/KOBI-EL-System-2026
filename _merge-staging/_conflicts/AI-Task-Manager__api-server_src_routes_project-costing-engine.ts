// ============================================================
// מנוע תמחור פרויקטים מתקדם - הלב הפיננסי של המפעל
// חישוב עלות אמיתית ורווחיות לכל פרויקט מתכת
// TechnoKoluzi ERP - Project Costing Engine
// ============================================================

import { Router, Request, Response } from 'express';
import pool from '@workspace/db';
import { VAT_RATE } from '../constants';

const router = Router();

// ============================================================
// אתחול טבלאות תמחור פרויקטים
// ============================================================
const initSQL = `
-- טבלת תמחור פרויקטים ראשית
CREATE TABLE IF NOT EXISTS project_costings (
  id SERIAL PRIMARY KEY,
  costing_number VARCHAR UNIQUE,
  project_id INTEGER,
  project_name VARCHAR,
  customer_id INTEGER,
  customer_name VARCHAR,
  customer_type VARCHAR DEFAULT 'private',
  products JSONB DEFAULT '[]',
  total_raw_material_cost NUMERIC(15,2) DEFAULT 0,
  total_labor_cost NUMERIC(15,2) DEFAULT 0,
  total_painting_cost NUMERIC(15,2) DEFAULT 0,
  total_installation_cost NUMERIC(15,2) DEFAULT 0,
  total_transport_cost NUMERIC(15,2) DEFAULT 0,
  total_accessories_cost NUMERIC(15,2) DEFAULT 0,
  total_other_costs NUMERIC(15,2) DEFAULT 0,
  total_cost_before_overhead NUMERIC(15,2) DEFAULT 0,
  overhead_percentage NUMERIC(5,2) DEFAULT 15,
  overhead_amount NUMERIC(15,2) DEFAULT 0,
  total_cost NUMERIC(15,2) DEFAULT 0,
  target_margin_percentage NUMERIC(5,2) DEFAULT 200,
  recommended_price NUMERIC(15,2) DEFAULT 0,
  actual_price NUMERIC(15,2) DEFAULT 0,
  actual_price_per_meter NUMERIC(10,2),
  total_meters NUMERIC(10,2),
  total_sqm NUMERIC(10,2),
  discount_percentage NUMERIC(5,2) DEFAULT 0,
  discount_amount NUMERIC(15,2) DEFAULT 0,
  final_price_before_vat NUMERIC(15,2) DEFAULT 0,
  vat_amount NUMERIC(15,2) DEFAULT 0,
  final_price_with_vat NUMERIC(15,2) DEFAULT 0,
  gross_profit NUMERIC(15,2) DEFAULT 0,
  gross_margin_percent NUMERIC(5,2) DEFAULT 0,
  net_profit NUMERIC(15,2) DEFAULT 0,
  net_margin_percent NUMERIC(5,2) DEFAULT 0,
  sales_commission_rate NUMERIC(5,2) DEFAULT 7.5,
  sales_commission_amount NUMERIC(15,2) DEFAULT 0,
  installer_cost_model VARCHAR,
  installer_cost NUMERIC(15,2) DEFAULT 0,
  producer_cost_model VARCHAR,
  producer_cost NUMERIC(15,2) DEFAULT 0,
  painting_rate_per_meter NUMERIC(10,2) DEFAULT 55,
  painting_area NUMERIC(10,2) DEFAULT 0,
  scenario_analysis JSONB DEFAULT '[]',
  ai_recommendations JSONB DEFAULT '[]',
  status VARCHAR DEFAULT 'draft',
  approved_by VARCHAR,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- פריטי שורה בתמחור
CREATE TABLE IF NOT EXISTS costing_line_items (
  id SERIAL PRIMARY KEY,
  costing_id INTEGER REFERENCES project_costings(id),
  item_type VARCHAR NOT NULL,
  product_name VARCHAR,
  product_code VARCHAR,
  raw_material_id INTEGER,
  raw_material_name VARCHAR,
  quantity NUMERIC(10,3),
  unit VARCHAR,
  unit_cost NUMERIC(10,2),
  total_cost NUMERIC(15,2),
  supplier_id INTEGER,
  supplier_name VARCHAR,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- תרחישי תמחור - ניתוח מה-אם
CREATE TABLE IF NOT EXISTS costing_scenarios (
  id SERIAL PRIMARY KEY,
  costing_id INTEGER REFERENCES project_costings(id),
  scenario_name VARCHAR,
  scenario_name_he VARCHAR,
  description TEXT,
  variable_changes JSONB DEFAULT '[]',
  original_cost NUMERIC(15,2),
  new_cost NUMERIC(15,2),
  original_profit NUMERIC(15,2),
  new_profit NUMERIC(15,2),
  original_margin NUMERIC(5,2),
  new_margin NUMERIC(5,2),
  impact_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

// ============================================================
// POST /init - אתחול טבלאות ונתוני דוגמה
// ============================================================
router.post('/init', async (req: Request, res: Response) => {
  try {
    // יצירת טבלאות
    await pool.query(initSQL);

    // נתוני דוגמה - תמחור פרויקט שער חשמלי
    const sampleCosting = await pool.query(`
      INSERT INTO project_costings (
        costing_number, project_id, project_name, customer_id, customer_name, customer_type,
        products, total_raw_material_cost, total_labor_cost, total_painting_cost,
        total_installation_cost, total_transport_cost, total_accessories_cost,
        total_other_costs, total_cost_before_overhead, overhead_percentage, overhead_amount,
        total_cost, target_margin_percentage, recommended_price, actual_price,
        actual_price_per_meter, total_meters, total_sqm,
        discount_percentage, discount_amount, final_price_before_vat,
        vat_amount, final_price_with_vat, gross_profit, gross_margin_percent,
        net_profit, net_margin_percent, sales_commission_rate, sales_commission_amount,
        installer_cost_model, installer_cost, producer_cost_model, producer_cost,
        painting_rate_per_meter, painting_area, status
      ) VALUES (
        'CST-2026-0001', 1, 'שער חשמלי - וילה כהן', 1, 'דוד כהן', 'private',
        '[{"name":"שער חשמלי נגרר","type":"gate","meters":5.5,"sqm":11}]'::jsonb,
        3200, 1800, 605, 1200, 350, 450, 200,
        7805, 15, 1170.75, 8975.75, 200, 26927.25, 25000,
        4545.45, 5.5, 11,
        5, 1250, 23750, 4037.50, 27787.50,
        14774.25, 62.21, 12996.37, 54.72,
        7.5, 1781.25, 'per_meter', 1200, 'per_meter', 800,
        55, 11, 'draft'
      ) ON CONFLICT (costing_number) DO NOTHING
      RETURNING id
    `);

    // פריטי שורה לדוגמה
    if (sampleCosting.rows.length > 0) {
      const costingId = sampleCosting.rows[0].id;
      await pool.query(`
        INSERT INTO costing_line_items (costing_id, item_type, product_name, product_code, raw_material_name, quantity, unit, unit_cost, total_cost, supplier_name) VALUES
        ($1, 'raw_material', 'שער חשמלי נגרר', 'GATE-001', 'פרופיל ברזל 40x40', 12, 'מטר', 45.00, 540.00, 'מתכת ישראל'),
        ($1, 'raw_material', 'שער חשמלי נגרר', 'GATE-001', 'פרופיל ברזל 60x40', 8, 'מטר', 55.00, 440.00, 'מתכת ישראל'),
        ($1, 'raw_material', 'שער חשמלי נגרר', 'GATE-001', 'פח ברזל 2 מ"מ', 4, 'מ"ר', 180.00, 720.00, 'מתכת ישראל'),
        ($1, 'raw_material', 'שער חשמלי נגרר', 'GATE-001', 'גלגלים תעשייתיים', 4, 'יחידה', 125.00, 500.00, 'אביזרי שער בע"מ'),
        ($1, 'raw_material', 'שער חשמלי נגרר', 'GATE-001', 'מנוע חשמלי NICE', 1, 'יחידה', 1000.00, 1000.00, 'ניס ישראל'),
        ($1, 'labor', 'עבודת ייצור', NULL, NULL, 12, 'שעה', 150.00, 1800.00, NULL),
        ($1, 'painting', 'צביעה אלקטרוסטטית', NULL, NULL, 11, 'מ"ר', 55.00, 605.00, 'צבע פלוס'),
        ($1, 'installation', 'התקנה באתר', NULL, NULL, 1, 'פרויקט', 1200.00, 1200.00, NULL),
        ($1, 'transport', 'הובלה לאתר', NULL, NULL, 1, 'נסיעה', 350.00, 350.00, NULL),
        ($1, 'accessories', 'אביזרים נוספים', NULL, NULL, 1, 'סט', 450.00, 450.00, NULL)
        ON CONFLICT DO NOTHING
      `, [costingId]);
    }

    // תמחור פרויקט שני - גדר פלדה
    await pool.query(`
      INSERT INTO project_costings (
        costing_number, project_id, project_name, customer_id, customer_name, customer_type,
        products, total_raw_material_cost, total_labor_cost, total_painting_cost,
        total_installation_cost, total_transport_cost, total_accessories_cost,
        total_cost_before_overhead, overhead_percentage, overhead_amount, total_cost,
        target_margin_percentage, recommended_price, actual_price,
        actual_price_per_meter, total_meters,
        final_price_before_vat, vat_amount, final_price_with_vat,
        gross_profit, gross_margin_percent, painting_rate_per_meter, painting_area,
        status
      ) VALUES (
        'CST-2026-0002', 2, 'גדר פלדה - פרויקט לוי', 2, 'משה לוי', 'private',
        '[{"name":"גדר פלדה עם עמודים","type":"fence","meters":25,"sqm":37.5}]'::jsonb,
        8500, 4200, 2062.50, 3500, 500, 800,
        19562.50, 15, 2934.38, 22496.88,
        200, 67490.63, 60000,
        2400, 25,
        60000, 10200, 70200,
        37503.13, 62.51, 55, 37.5,
        'draft'
      ) ON CONFLICT (costing_number) DO NOTHING
    `);

    res.json({
      success: true,
      message: 'מנוע תמחור פרויקטים אותחל בהצלחה - טבלאות ונתוני דוגמה נוצרו',
      tables: ['project_costings', 'costing_line_items', 'costing_scenarios']
    });
  } catch (error: any) {
    console.error('שגיאה באתחול מנוע תמחור:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD - תמחור פרויקטים
// ============================================================

// קבלת כל התמחורים
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, customer_id, project_id, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (status) {
      params.push(status);
      where += ` AND status = $${params.length}`;
    }
    if (customer_id) {
      params.push(customer_id);
      where += ` AND customer_id = $${params.length}`;
    }
    if (project_id) {
      params.push(project_id);
      where += ` AND project_id = $${params.length}`;
    }

    params.push(Number(limit), offset);
    const result = await pool.query(
      `SELECT * FROM project_costings ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM project_costings ${where}`,
      params.slice(0, -2)
    );

    res.json({
      success: true,
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: Number(page),
      limit: Number(limit)
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// קבלת תמחור בודד עם פריטי שורה
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const costing = await pool.query('SELECT * FROM project_costings WHERE id = $1', [id]);
    if (costing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'תמחור לא נמצא' });
    }

    // טעינת פריטי שורה
    const lineItems = await pool.query(
      'SELECT * FROM costing_line_items WHERE costing_id = $1 ORDER BY item_type, id',
      [id]
    );

    // טעינת תרחישים
    const scenarios = await pool.query(
      'SELECT * FROM costing_scenarios WHERE costing_id = $1 ORDER BY created_at DESC',
      [id]
    );

    res.json({
      success: true,
      data: {
        ...costing.rows[0],
        line_items: lineItems.rows,
        scenarios: scenarios.rows
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// יצירת תמחור חדש
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      project_id, project_name, customer_id, customer_name, customer_type,
      products, total_meters, total_sqm, installer_cost_model, producer_cost_model,
      painting_rate_per_meter, target_margin_percentage, notes
    } = req.body;

    // יצירת מספר תמחור ייחודי
    const countResult = await pool.query('SELECT COUNT(*) FROM project_costings');
    const count = parseInt(countResult.rows[0].count) + 1;
    const costingNumber = `CST-2026-${String(count).padStart(4, '0')}`;

    const result = await pool.query(`
      INSERT INTO project_costings (
        costing_number, project_id, project_name, customer_id, customer_name, customer_type,
        products, total_meters, total_sqm, installer_cost_model, producer_cost_model,
        painting_rate_per_meter, target_margin_percentage, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      costingNumber, project_id, project_name, customer_id, customer_name,
      customer_type || 'private', JSON.stringify(products || []),
      total_meters, total_sqm, installer_cost_model, producer_cost_model,
      painting_rate_per_meter || 55, target_margin_percentage || 200, notes
    ]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// עדכון תמחור
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    delete fields.id;
    delete fields.created_at;
    fields.updated_at = new Date().toISOString();

    // תיקון: מניעת SQL injection - רק שמות עמודות חוקיים מותרים בעדכון
    const ALLOWED_COSTING_FIELDS = [
      'project_id', 'project_name', 'customer_id', 'customer_name', 'customer_type',
      'products', 'total_raw_material_cost', 'total_labor_cost', 'total_painting_cost',
      'total_installation_cost', 'total_transport_cost', 'total_accessories_cost', 'total_other_costs',
      'total_cost_before_overhead', 'overhead_percentage', 'overhead_amount', 'total_cost',
      'target_margin_percentage', 'recommended_price', 'actual_price', 'actual_price_per_meter',
      'total_meters', 'total_sqm', 'discount_percentage', 'discount_amount',
      'final_price_before_vat', 'vat_amount', 'final_price_with_vat',
      'gross_profit', 'gross_margin_percent', 'net_profit', 'net_margin_percent',
      'sales_commission_rate', 'sales_commission_amount', 'installer_cost_model', 'installer_cost',
      'producer_cost_model', 'producer_cost', 'painting_rate_per_meter', 'painting_area',
      'scenario_analysis', 'ai_recommendations', 'status', 'approved_by', 'approved_at', 'notes', 'updated_at'
    ];
    const safeFields: Record<string, any> = {};
    for (const k of Object.keys(fields)) {
      if (ALLOWED_COSTING_FIELDS.includes(k)) safeFields[k] = fields[k];
    }

    const keys = Object.keys(safeFields);
    const values = Object.values(safeFields);
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');

    const result = await pool.query(
      `UPDATE project_costings SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'תמחור לא נמצא' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// מחיקת תמחור (סימון כמבוטל, לא מחיקה פיזית)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // לא מוחקים! רק מסמנים כמבוטל
    const result = await pool.query(
      `UPDATE project_costings SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'תמחור לא נמצא' });
    }
    res.json({ success: true, data: result.rows[0], message: 'תמחור סומן כמבוטל' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD - פריטי שורה
// ============================================================

// הוספת פריט שורה לתמחור
router.post('/line-item/:costingId', async (req: Request, res: Response) => {
  try {
    const { costingId } = req.params;
    const {
      item_type, product_name, product_code, raw_material_id, raw_material_name,
      quantity, unit, unit_cost, total_cost, supplier_id, supplier_name, notes
    } = req.body;

    const result = await pool.query(`
      INSERT INTO costing_line_items (
        costing_id, item_type, product_name, product_code, raw_material_id, raw_material_name,
        quantity, unit, unit_cost, total_cost, supplier_id, supplier_name, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `, [
      costingId, item_type, product_name, product_code, raw_material_id, raw_material_name,
      quantity, unit, unit_cost, total_cost || (quantity * unit_cost), supplier_id, supplier_name, notes
    ]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// קבלת פריטי שורה לתמחור
router.get('/line-items/:costingId', async (req: Request, res: Response) => {
  try {
    const { costingId } = req.params;
    const result = await pool.query(
      'SELECT * FROM costing_line_items WHERE costing_id = $1 ORDER BY item_type, id',
      [costingId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// עדכון פריט שורה
router.put('/line-item/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    delete fields.id;
    delete fields.created_at;

    // תיקון: מניעת SQL injection - רק שמות עמודות חוקיים מותרים בעדכון
    const ALLOWED_LINE_ITEM_FIELDS = [
      'item_type', 'product_name', 'product_code', 'raw_material_id', 'raw_material_name',
      'quantity', 'unit', 'unit_cost', 'total_cost', 'supplier_id', 'supplier_name', 'notes'
    ];
    const safeFields: Record<string, any> = {};
    for (const k of Object.keys(fields)) {
      if (ALLOWED_LINE_ITEM_FIELDS.includes(k)) safeFields[k] = fields[k];
    }

    const keys = Object.keys(safeFields);
    const values = Object.values(safeFields);
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');

    const result = await pool.query(
      `UPDATE costing_line_items SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /calculate/:costingId - חישוב תמחור מלא
// חומרי גלם מDB + עבודה לפי מודל + צביעה 55/מטר + אביזרים + הובלה + תקורה 15% + עמלה 7.5% + מרווח יעד 200%
// ============================================================
router.post('/calculate/:costingId', async (req: Request, res: Response) => {
  try {
    const { costingId } = req.params;

    // טעינת התמחור
    const costingResult = await pool.query('SELECT * FROM project_costings WHERE id = $1', [costingId]);
    if (costingResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'תמחור לא נמצא' });
    }
    const costing = costingResult.rows[0];

    // טעינת פריטי שורה
    const lineItems = await pool.query(
      'SELECT * FROM costing_line_items WHERE costing_id = $1',
      [costingId]
    );

    // חישוב עלויות לפי סוג
    let totalRawMaterial = 0;
    let totalLabor = 0;
    let totalPainting = 0;
    let totalInstallation = 0;
    let totalTransport = 0;
    let totalAccessories = 0;
    let totalOther = 0;

    for (const item of lineItems.rows) {
      const cost = parseFloat(item.total_cost) || 0;
      switch (item.item_type) {
        case 'raw_material': totalRawMaterial += cost; break;
        case 'labor': totalLabor += cost; break;
        case 'painting': totalPainting += cost; break;
        case 'installation': totalInstallation += cost; break;
        case 'transport': totalTransport += cost; break;
        case 'accessories': totalAccessories += cost; break;
        default: totalOther += cost; break;
      }
    }

    // אם אין פריטי צביעה, חשב לפי תעריף למטר
    if (totalPainting === 0 && costing.painting_area > 0) {
      totalPainting = parseFloat(costing.painting_rate_per_meter) * parseFloat(costing.painting_area);
    }

    // סכום עלויות לפני תקורה
    const totalCostBeforeOverhead = totalRawMaterial + totalLabor + totalPainting +
      totalInstallation + totalTransport + totalAccessories + totalOther;

    // תקורה - 15% ברירת מחדל
    const overheadPercentage = parseFloat(costing.overhead_percentage) || 15;
    const overheadAmount = totalCostBeforeOverhead * (overheadPercentage / 100);

    // עלות כוללת
    const totalCost = totalCostBeforeOverhead + overheadAmount;

    // מחיר מומלץ לפי מרווח יעד (200% = מחיר פי 3 מהעלות)
    const targetMargin = parseFloat(costing.target_margin_percentage) || 200;
    const recommendedPrice = totalCost * (1 + targetMargin / 100);

    // מחיר בפועל - אם לא הוזן, משתמשים במומלץ
    const actualPrice = parseFloat(costing.actual_price) || recommendedPrice;

    // הנחה
    const discountPercentage = parseFloat(costing.discount_percentage) || 0;
    const discountAmount = actualPrice * (discountPercentage / 100);
    const finalPriceBeforeVat = actualPrice - discountAmount;

    const vatAmount = finalPriceBeforeVat * VAT_RATE;
    const finalPriceWithVat = finalPriceBeforeVat + vatAmount;

    // עמלת מכירות - 7.5% מהמחיר לפני מע"מ
    const salesCommissionRate = parseFloat(costing.sales_commission_rate) || 7.5;
    const salesCommissionAmount = finalPriceBeforeVat * (salesCommissionRate / 100);

    // עלות מתקין
    let installerCost = parseFloat(costing.installer_cost) || 0;
    if (costing.installer_cost_model === 'per_meter' && costing.total_meters) {
      // עלות כבר מחושבת בפריטי שורה
    }

    // עלות יצרן
    let producerCost = parseFloat(costing.producer_cost) || 0;

    // רווח גולמי = מחיר סופי - עלות כוללת
    const grossProfit = finalPriceBeforeVat - totalCost;
    const grossMarginPercent = finalPriceBeforeVat > 0 ? (grossProfit / finalPriceBeforeVat) * 100 : 0;

    // רווח נקי = רווח גולמי - עמלות
    const netProfit = grossProfit - salesCommissionAmount;
    const netMarginPercent = finalPriceBeforeVat > 0 ? (netProfit / finalPriceBeforeVat) * 100 : 0;

    // מחיר למטר
    const actualPricePerMeter = costing.total_meters > 0 ? finalPriceBeforeVat / parseFloat(costing.total_meters) : null;

    // עדכון התמחור בDB
    const updateResult = await pool.query(`
      UPDATE project_costings SET
        total_raw_material_cost = $1, total_labor_cost = $2, total_painting_cost = $3,
        total_installation_cost = $4, total_transport_cost = $5, total_accessories_cost = $6,
        total_other_costs = $7, total_cost_before_overhead = $8, overhead_amount = $9,
        total_cost = $10, recommended_price = $11, actual_price_per_meter = $12,
        discount_amount = $13, final_price_before_vat = $14, vat_amount = $15,
        final_price_with_vat = $16, gross_profit = $17, gross_margin_percent = $18,
        net_profit = $19, net_margin_percent = $20, sales_commission_amount = $21,
        updated_at = NOW()
      WHERE id = $22
      RETURNING *
    `, [
      totalRawMaterial, totalLabor, totalPainting, totalInstallation, totalTransport,
      totalAccessories, totalOther, totalCostBeforeOverhead, overheadAmount,
      totalCost, recommendedPrice, actualPricePerMeter,
      discountAmount, finalPriceBeforeVat, vatAmount, finalPriceWithVat,
      grossProfit, grossMarginPercent, netProfit, netMarginPercent, salesCommissionAmount,
      costingId
    ]);

    res.json({
      success: true,
      message: 'חישוב תמחור הושלם בהצלחה',
      data: updateResult.rows[0],
      breakdown: {
        // פירוט עלויות
        raw_materials: totalRawMaterial,
        labor: totalLabor,
        painting: totalPainting,
        installation: totalInstallation,
        transport: totalTransport,
        accessories: totalAccessories,
        other: totalOther,
        cost_before_overhead: totalCostBeforeOverhead,
        overhead: { percentage: overheadPercentage, amount: overheadAmount },
        total_cost: totalCost,
        // תמחור
        recommended_price: recommendedPrice,
        actual_price: actualPrice,
        discount: { percentage: discountPercentage, amount: discountAmount },
        final_price_before_vat: finalPriceBeforeVat,
        vat: vatAmount,
        final_price_with_vat: finalPriceWithVat,
        // רווחיות
        sales_commission: { rate: salesCommissionRate, amount: salesCommissionAmount },
        gross_profit: grossProfit,
        gross_margin_percent: grossMarginPercent,
        net_profit: netProfit,
        net_margin_percent: netMarginPercent,
        price_per_meter: actualPricePerMeter
      }
    });
  } catch (error: any) {
    console.error('שגיאה בחישוב תמחור:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /profitability/:costingId - דוח רווח והפסד מלא לפרויקט
// ============================================================
router.get('/profitability/:costingId', async (req: Request, res: Response) => {
  try {
    const { costingId } = req.params;
    const costing = await pool.query('SELECT * FROM project_costings WHERE id = $1', [costingId]);
    if (costing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'תמחור לא נמצא' });
    }

    const c = costing.rows[0];
    const lineItems = await pool.query(
      'SELECT * FROM costing_line_items WHERE costing_id = $1 ORDER BY item_type',
      [costingId]
    );

    // פירוט רווח והפסד
    const pnl = {
      // הכנסות
      revenue: {
        actual_price: parseFloat(c.actual_price) || 0,
        discount: parseFloat(c.discount_amount) || 0,
        net_revenue: parseFloat(c.final_price_before_vat) || 0,
        vat_collected: parseFloat(c.vat_amount) || 0,
        total_with_vat: parseFloat(c.final_price_with_vat) || 0
      },
      // עלות המכר
      cost_of_goods: {
        raw_materials: parseFloat(c.total_raw_material_cost) || 0,
        labor: parseFloat(c.total_labor_cost) || 0,
        painting: parseFloat(c.total_painting_cost) || 0,
        installation: parseFloat(c.total_installation_cost) || 0,
        transport: parseFloat(c.total_transport_cost) || 0,
        accessories: parseFloat(c.total_accessories_cost) || 0,
        other: parseFloat(c.total_other_costs) || 0,
        subtotal: parseFloat(c.total_cost_before_overhead) || 0
      },
      // תקורה
      overhead: {
        percentage: parseFloat(c.overhead_percentage) || 0,
        amount: parseFloat(c.overhead_amount) || 0
      },
      // עלות כוללת
      total_cost: parseFloat(c.total_cost) || 0,
      // רווח גולמי
      gross_profit: parseFloat(c.gross_profit) || 0,
      gross_margin: parseFloat(c.gross_margin_percent) || 0,
      // הוצאות תפעוליות
      operating_expenses: {
        sales_commission: parseFloat(c.sales_commission_amount) || 0,
        installer_cost: parseFloat(c.installer_cost) || 0,
        producer_cost: parseFloat(c.producer_cost) || 0
      },
      // רווח נקי
      net_profit: parseFloat(c.net_profit) || 0,
      net_margin: parseFloat(c.net_margin_percent) || 0,
      // מדדי ביצוע
      kpis: {
        price_per_meter: parseFloat(c.actual_price_per_meter) || 0,
        total_meters: parseFloat(c.total_meters) || 0,
        cost_per_meter: c.total_meters > 0 ? parseFloat(c.total_cost) / parseFloat(c.total_meters) : 0,
        profit_per_meter: c.total_meters > 0 ? parseFloat(c.net_profit) / parseFloat(c.total_meters) : 0,
        target_margin: parseFloat(c.target_margin_percentage) || 0,
        margin_vs_target: (parseFloat(c.gross_margin_percent) || 0) >= (parseFloat(c.target_margin_percentage) || 0)
          ? 'עומד ביעד' : 'מתחת ליעד'
      }
    };

    res.json({
      success: true,
      project: { id: c.project_id, name: c.project_name, customer: c.customer_name },
      costing_number: c.costing_number,
      pnl,
      line_items: lineItems.rows,
      status: c.status
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /scenario/:costingId - ניתוח מה-אם (שינוי מחיר חומר/מודל עבודה/הנחה)
// ============================================================
router.post('/scenario/:costingId', async (req: Request, res: Response) => {
  try {
    const { costingId } = req.params;
    const {
      scenario_name, scenario_name_he, description,
      variable_changes // מערך של { variable, original_value, new_value }
    } = req.body;

    const costing = await pool.query('SELECT * FROM project_costings WHERE id = $1', [costingId]);
    if (costing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'תמחור לא נמצא' });
    }
    const c = costing.rows[0];

    // חישוב מקורי
    const originalCost = parseFloat(c.total_cost) || 0;
    const originalProfit = parseFloat(c.gross_profit) || 0;
    const originalMargin = parseFloat(c.gross_margin_percent) || 0;

    // חישוב עם שינויים
    let newCostAdjustment = 0;
    let newPriceAdjustment = 0;

    for (const change of (variable_changes || [])) {
      switch (change.variable) {
        case 'raw_material_cost':
          // שינוי עלות חומרי גלם באחוזים
          const rawDiff = parseFloat(c.total_raw_material_cost) * (parseFloat(change.new_value) - parseFloat(change.original_value)) / 100;
          newCostAdjustment += rawDiff;
          break;
        case 'labor_cost':
          // שינוי עלות עבודה
          const laborDiff = parseFloat(change.new_value) - parseFloat(change.original_value);
          newCostAdjustment += laborDiff;
          break;
        case 'painting_rate':
          // שינוי תעריף צביעה למטר
          const paintDiff = (parseFloat(change.new_value) - parseFloat(change.original_value)) * (parseFloat(c.painting_area) || 0);
          newCostAdjustment += paintDiff;
          break;
        case 'discount_percentage':
          // שינוי אחוז הנחה
          const priceDiff = parseFloat(c.actual_price) * (parseFloat(change.new_value) - parseFloat(change.original_value)) / 100;
          newPriceAdjustment -= priceDiff;
          break;
        case 'overhead_percentage':
          // שינוי אחוז תקורה
          const overheadDiff = parseFloat(c.total_cost_before_overhead) * (parseFloat(change.new_value) - parseFloat(change.original_value)) / 100;
          newCostAdjustment += overheadDiff;
          break;
      }
    }

    const newCost = originalCost + newCostAdjustment;
    const newRevenue = (parseFloat(c.final_price_before_vat) || 0) + newPriceAdjustment;
    const newProfit = newRevenue - newCost;
    const newMargin = newRevenue > 0 ? (newProfit / newRevenue) * 100 : 0;

    // שמירת התרחיש
    const impactSummary = `שינוי עלות: ${newCostAdjustment >= 0 ? '+' : ''}${newCostAdjustment.toFixed(2)} ₪, שינוי הכנסה: ${newPriceAdjustment >= 0 ? '+' : ''}${newPriceAdjustment.toFixed(2)} ₪, שינוי רווח: ${(newProfit - originalProfit).toFixed(2)} ₪, מרווח חדש: ${newMargin.toFixed(1)}%`;

    const result = await pool.query(`
      INSERT INTO costing_scenarios (
        costing_id, scenario_name, scenario_name_he, description,
        variable_changes, original_cost, new_cost, original_profit, new_profit,
        original_margin, new_margin, impact_summary
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [
      costingId, scenario_name, scenario_name_he, description,
      JSON.stringify(variable_changes || []), originalCost, newCost,
      originalProfit, newProfit, originalMargin, newMargin, impactSummary
    ]);

    res.json({
      success: true,
      message: 'תרחיש נוצר בהצלחה',
      data: result.rows[0],
      comparison: {
        original: { cost: originalCost, profit: originalProfit, margin: originalMargin },
        scenario: { cost: newCost, profit: newProfit, margin: newMargin },
        delta: {
          cost: newCostAdjustment,
          profit: newProfit - originalProfit,
          margin: newMargin - originalMargin
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /compare-models/:costingId - השוואת מודלים: מתקין/יצרן למטר vs אחוז
// ============================================================
router.post('/compare-models/:costingId', async (req: Request, res: Response) => {
  try {
    const { costingId } = req.params;
    const {
      installer_per_meter_rate, installer_percentage_rate,
      producer_per_meter_rate, producer_percentage_rate
    } = req.body;

    const costing = await pool.query('SELECT * FROM project_costings WHERE id = $1', [costingId]);
    if (costing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'תמחור לא נמצא' });
    }
    const c = costing.rows[0];

    const totalMeters = parseFloat(c.total_meters) || 0;
    const totalSqm = parseFloat(c.total_sqm) || 0;
    const finalPrice = parseFloat(c.final_price_before_vat) || 0;

    // השוואת מתקין
    const installerPerMeterCost = totalMeters * (installer_per_meter_rate || 0);
    const installerPercentageCost = finalPrice * ((installer_percentage_rate || 0) / 100);
    const installerCheaper = installerPerMeterCost <= installerPercentageCost ? 'per_meter' : 'percentage';
    const installerSaving = Math.abs(installerPerMeterCost - installerPercentageCost);

    // השוואת יצרן
    const producerPerMeterCost = totalSqm * (producer_per_meter_rate || 0);
    const producerPercentageCost = finalPrice * ((producer_percentage_rate || 0) / 100);
    const producerCheaper = producerPerMeterCost <= producerPercentageCost ? 'per_meter' : 'percentage';
    const producerSaving = Math.abs(producerPerMeterCost - producerPercentageCost);

    res.json({
      success: true,
      project: { name: c.project_name, meters: totalMeters, sqm: totalSqm, price: finalPrice },
      installer_comparison: {
        per_meter: {
          rate: installer_per_meter_rate,
          total_cost: installerPerMeterCost,
          description: `${installer_per_meter_rate} ₪ × ${totalMeters} מטר = ${installerPerMeterCost.toFixed(2)} ₪`
        },
        percentage: {
          rate: installer_percentage_rate,
          total_cost: installerPercentageCost,
          description: `${installer_percentage_rate}% × ${finalPrice.toFixed(2)} ₪ = ${installerPercentageCost.toFixed(2)} ₪`
        },
        cheaper_model: installerCheaper,
        saving: installerSaving,
        recommendation: `מודל ${installerCheaper === 'per_meter' ? 'למטר' : 'אחוז'} זול יותר ב-${installerSaving.toFixed(2)} ₪`
      },
      producer_comparison: {
        per_meter: {
          rate: producer_per_meter_rate,
          total_cost: producerPerMeterCost,
          description: `${producer_per_meter_rate} ₪ × ${totalSqm} מ"ר = ${producerPerMeterCost.toFixed(2)} ₪`
        },
        percentage: {
          rate: producer_percentage_rate,
          total_cost: producerPercentageCost,
          description: `${producer_percentage_rate}% × ${finalPrice.toFixed(2)} ₪ = ${producerPercentageCost.toFixed(2)} ₪`
        },
        cheaper_model: producerCheaper,
        saving: producerSaving,
        recommendation: `מודל ${producerCheaper === 'per_meter' ? 'למטר' : 'אחוז'} זול יותר ב-${producerSaving.toFixed(2)} ₪`
      },
      total_potential_saving: installerSaving + producerSaving
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /margin-analysis/:period - ניתוח מרווחים לכל הפרויקטים בתקופה
// ============================================================
router.get('/margin-analysis/:period', async (req: Request, res: Response) => {
  try {
    const { period } = req.params; // פורמט: 2026-03 או 2026-Q1

    let dateFilter = '';
    const params: any[] = [];

    if (period.includes('Q')) {
      // רבעון
      const [year, quarter] = period.split('-Q');
      const startMonth = (parseInt(quarter) - 1) * 3 + 1;
      const endMonth = startMonth + 2;
      params.push(`${year}-${String(startMonth).padStart(2, '0')}-01`);
      params.push(`${year}-${String(endMonth).padStart(2, '0')}-31`);
      dateFilter = 'WHERE created_at >= $1::date AND created_at <= $2::date';
    } else {
      // חודש
      params.push(period + '-01');
      params.push(period + '-31');
      dateFilter = 'WHERE created_at >= $1::date AND created_at <= $2::date';
    }

    const result = await pool.query(`
      SELECT
        id, costing_number, project_name, customer_name,
        total_cost, final_price_before_vat, gross_profit, gross_margin_percent,
        net_profit, net_margin_percent, total_meters, status,
        CASE
          WHEN gross_margin_percent >= 50 THEN 'excellent'
          WHEN gross_margin_percent >= 30 THEN 'good'
          WHEN gross_margin_percent >= 15 THEN 'acceptable'
          ELSE 'below_target'
        END as margin_category
      FROM project_costings
      ${dateFilter}
      ORDER BY gross_margin_percent DESC
    `, params);

    // סיכום
    const projects = result.rows;
    const totalRevenue = projects.reduce((s: number, p: any) => s + (parseFloat(p.final_price_before_vat) || 0), 0);
    const totalCost = projects.reduce((s: number, p: any) => s + (parseFloat(p.total_cost) || 0), 0);
    const totalProfit = projects.reduce((s: number, p: any) => s + (parseFloat(p.gross_profit) || 0), 0);
    const avgMargin = projects.length > 0
      ? projects.reduce((s: number, p: any) => s + (parseFloat(p.gross_margin_percent) || 0), 0) / projects.length
      : 0;

    const belowTarget = projects.filter((p: any) => parseFloat(p.gross_margin_percent) < 30).length;

    res.json({
      success: true,
      period,
      summary: {
        total_projects: projects.length,
        total_revenue: totalRevenue,
        total_cost: totalCost,
        total_profit: totalProfit,
        average_margin: avgMargin,
        projects_below_target: belowTarget,
        best_project: projects[0] || null,
        worst_project: projects[projects.length - 1] || null
      },
      projects
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /discount-impact/:costingId/:discountPercent - השפעת הנחה על רווח
// ============================================================
router.get('/discount-impact/:costingId/:discountPercent', async (req: Request, res: Response) => {
  try {
    const { costingId, discountPercent } = req.params;
    const discount = parseFloat(discountPercent);

    const costing = await pool.query('SELECT * FROM project_costings WHERE id = $1', [costingId]);
    if (costing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'תמחור לא נמצא' });
    }
    const c = costing.rows[0];

    const actualPrice = parseFloat(c.actual_price) || 0;
    const totalCost = parseFloat(c.total_cost) || 0;
    const currentDiscount = parseFloat(c.discount_percentage) || 0;

    // מצב נוכחי
    const currentDiscountAmount = actualPrice * (currentDiscount / 100);
    const currentRevenue = actualPrice - currentDiscountAmount;
    const currentProfit = currentRevenue - totalCost;
    const currentMargin = currentRevenue > 0 ? (currentProfit / currentRevenue) * 100 : 0;

    // מצב עם הנחה חדשה
    const newDiscountAmount = actualPrice * (discount / 100);
    const newRevenue = actualPrice - newDiscountAmount;
    const newProfit = newRevenue - totalCost;
    const newMargin = newRevenue > 0 ? (newProfit / newRevenue) * 100 : 0;

    // השפעה
    const profitDrop = currentProfit - newProfit;
    const marginDrop = currentMargin - newMargin;

    // נקודת איזון - בכמה אחוז הנחה הרווח מתאפס
    const breakEvenDiscount = actualPrice > 0 ? ((actualPrice - totalCost) / actualPrice) * 100 : 0;

    res.json({
      success: true,
      project: c.project_name,
      original_price: actualPrice,
      current_state: {
        discount_percent: currentDiscount,
        discount_amount: currentDiscountAmount,
        revenue: currentRevenue,
        profit: currentProfit,
        margin: currentMargin
      },
      new_state: {
        discount_percent: discount,
        discount_amount: newDiscountAmount,
        revenue: newRevenue,
        profit: newProfit,
        margin: newMargin
      },
      impact: {
        profit_drop: profitDrop,
        profit_drop_percent: currentProfit > 0 ? (profitDrop / currentProfit) * 100 : 0,
        margin_drop: marginDrop,
        still_profitable: newProfit > 0,
        break_even_discount: breakEvenDiscount,
        warning: newProfit <= 0 ? 'אזהרה: הפרויקט לא רווחי בהנחה זו!' :
          newMargin < 15 ? 'אזהרה: מרווח נמוך מ-15%!' : null
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /dashboard - דשבורד תמחור ראשי
// ============================================================
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    // ממוצע מרווחים
    const avgMargin = await pool.query(`
      SELECT
        AVG(gross_margin_percent) as avg_gross_margin,
        AVG(net_margin_percent) as avg_net_margin,
        SUM(gross_profit) as total_gross_profit,
        SUM(net_profit) as total_net_profit,
        SUM(final_price_before_vat) as total_revenue,
        SUM(total_cost) as total_costs,
        COUNT(*) as total_costings
      FROM project_costings
      WHERE status != 'cancelled'
    `);

    // פרויקטים מתחת ליעד
    const belowTarget = await pool.query(`
      SELECT id, costing_number, project_name, gross_margin_percent, net_profit
      FROM project_costings
      WHERE gross_margin_percent < 30 AND status != 'cancelled'
      ORDER BY gross_margin_percent ASC
      LIMIT 10
    `);

    // מגמת עלות חומרי גלם
    const materialTrend = await pool.query(`
      SELECT
        DATE_TRUNC('month', created_at) as month,
        AVG(total_raw_material_cost) as avg_material_cost,
        AVG(gross_margin_percent) as avg_margin
      FROM project_costings
      WHERE status != 'cancelled'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month DESC
      LIMIT 12
    `);

    // סטטוסים
    const statusBreakdown = await pool.query(`
      SELECT status, COUNT(*) as count, SUM(final_price_before_vat) as total_value
      FROM project_costings
      GROUP BY status
    `);

    // חמשת הפרויקטים הרווחיים ביותר
    const topProfitable = await pool.query(`
      SELECT id, costing_number, project_name, customer_name,
        final_price_before_vat, gross_profit, gross_margin_percent
      FROM project_costings
      WHERE status != 'cancelled'
      ORDER BY gross_profit DESC
      LIMIT 5
    `);

    res.json({
      success: true,
      dashboard: {
        summary: avgMargin.rows[0],
        projects_below_target: belowTarget.rows,
        material_cost_trend: materialTrend.rows,
        status_breakdown: statusBreakdown.rows,
        top_profitable_projects: topProfitable.rows
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /ai-optimize/:costingId - המלצות AI לתמחור אופטימלי
// ============================================================
router.post('/ai-optimize/:costingId', async (req: Request, res: Response) => {
  try {
    const { costingId } = req.params;
    const costing = await pool.query('SELECT * FROM project_costings WHERE id = $1', [costingId]);
    if (costing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'תמחור לא נמצא' });
    }
    const c = costing.rows[0];

    const recommendations: any[] = [];
    const grossMargin = parseFloat(c.gross_margin_percent) || 0;
    const totalCost = parseFloat(c.total_cost) || 0;
    const rawMaterialCost = parseFloat(c.total_raw_material_cost) || 0;
    const laborCost = parseFloat(c.total_labor_cost) || 0;
    const paintingCost = parseFloat(c.total_painting_cost) || 0;
    const finalPrice = parseFloat(c.final_price_before_vat) || 0;

    // ניתוח מרווח
    if (grossMargin < 20) {
      recommendations.push({
        type: 'critical',
        category: 'margin',
        title_he: 'מרווח נמוך מדי - דורש התייחסות מיידית',
        suggestion_he: 'המרווח הגולמי נמוך מ-20%. מומלץ לבדוק אפשרות להעלאת מחיר או הורדת עלויות.',
        potential_impact: `העלאת מרווח ל-30% תוסיף ${((finalPrice * 0.3) - (finalPrice - totalCost)).toFixed(2)} ₪ רווח`
      });
    }

    // ניתוח חומרי גלם
    if (rawMaterialCost / totalCost > 0.5) {
      recommendations.push({
        type: 'optimization',
        category: 'materials',
        title_he: 'עלות חומרי גלם גבוהה',
        suggestion_he: `חומרי גלם מהווים ${((rawMaterialCost / totalCost) * 100).toFixed(1)}% מהעלות. בדוק ספקים חלופיים או קניה בכמויות.`,
        potential_impact: `הפחתה של 10% בחומרי גלם תחסוך ${(rawMaterialCost * 0.1).toFixed(2)} ₪`
      });
    }

    // ניתוח מודל תשלום מתקין
    if (c.installer_cost_model === 'percentage' && c.total_meters > 10) {
      recommendations.push({
        type: 'optimization',
        category: 'installer',
        title_he: 'שקול מודל תשלום למטר עבור מתקין',
        suggestion_he: 'בפרויקטים גדולים (מעל 10 מטר), מודל למטר בדרך כלל זול יותר לחברה.',
        potential_impact: 'בדוק השוואת מודלים דרך /compare-models'
      });
    }

    // ניתוח הנחה
    const discount = parseFloat(c.discount_percentage) || 0;
    if (discount > 10) {
      recommendations.push({
        type: 'warning',
        category: 'discount',
        title_he: 'הנחה גבוהה',
        suggestion_he: `הנחה של ${discount}% מורידה את הרווח משמעותית. שקול הנחה של עד 7%.`,
        potential_impact: `הפחתת הנחה ל-7% תוסיף ${((discount - 7) / 100 * (parseFloat(c.actual_price) || 0)).toFixed(2)} ₪`
      });
    }

    // ניתוח צביעה
    const paintingRate = parseFloat(c.painting_rate_per_meter) || 55;
    if (paintingRate > 60) {
      recommendations.push({
        type: 'optimization',
        category: 'painting',
        title_he: 'תעריף צביעה גבוה',
        suggestion_he: `תעריף צביעה ${paintingRate} ₪/מטר גבוה מהממוצע (55 ₪). בדוק הצעות מצבעיות.`,
        potential_impact: `הורדה ל-55 ₪ תחסוך ${((paintingRate - 55) * (parseFloat(c.painting_area) || 0)).toFixed(2)} ₪`
      });
    }

    // המלצת מחיר אופטימלי
    const optimalPrice = totalCost * 2.5; // מרווח 60%
    recommendations.push({
      type: 'pricing',
      category: 'optimal_price',
      title_he: 'מחיר אופטימלי מומלץ',
      suggestion_he: `מחיר אופטימלי (מרווח 60%): ${optimalPrice.toFixed(2)} ₪. מחיר נוכחי: ${finalPrice.toFixed(2)} ₪.`,
      potential_impact: finalPrice < optimalPrice
        ? `העלאת מחיר ב-${(optimalPrice - finalPrice).toFixed(2)} ₪ תגדיל רווח`
        : 'המחיר הנוכחי טוב - מעל האופטימום'
    });

    // שמירת המלצות
    await pool.query(
      'UPDATE project_costings SET ai_recommendations = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(recommendations), costingId]
    );

    res.json({
      success: true,
      message: 'ניתוח AI הושלם',
      costing_number: c.costing_number,
      project_name: c.project_name,
      current_metrics: {
        total_cost: totalCost,
        final_price: finalPrice,
        gross_margin: grossMargin,
        net_profit: parseFloat(c.net_profit) || 0
      },
      recommendations
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /product-profitability - רווחיות לפי מוצר
// ============================================================
router.get('/product-profitability', async (req: Request, res: Response) => {
  try {
    // ניתוח רווחיות לפי סוג מוצר מתוך JSONB
    const result = await pool.query(`
      SELECT
        p.product_type,
        COUNT(*) as project_count,
        AVG(pc.gross_margin_percent) as avg_margin,
        SUM(pc.gross_profit) as total_profit,
        SUM(pc.final_price_before_vat) as total_revenue,
        AVG(pc.total_cost) as avg_cost,
        MIN(pc.gross_margin_percent) as min_margin,
        MAX(pc.gross_margin_percent) as max_margin
      FROM project_costings pc,
        LATERAL jsonb_array_elements(pc.products) AS p_elem,
        LATERAL jsonb_to_record(p_elem) AS p(product_type text)
      WHERE pc.status != 'cancelled'
      GROUP BY p.product_type
      ORDER BY total_profit DESC
    `);

    // אם אין נתוני JSONB, נשתמש בנתונים ישירים
    let products = result.rows;
    if (products.length === 0) {
      const fallback = await pool.query(`
        SELECT
          project_name as product_type,
          COUNT(*) as project_count,
          AVG(gross_margin_percent) as avg_margin,
          SUM(gross_profit) as total_profit,
          SUM(final_price_before_vat) as total_revenue,
          AVG(total_cost) as avg_cost,
          MIN(gross_margin_percent) as min_margin,
          MAX(gross_margin_percent) as max_margin
        FROM project_costings
        WHERE status != 'cancelled'
        GROUP BY project_name
        ORDER BY total_profit DESC
      `);
      products = fallback.rows;
    }

    res.json({
      success: true,
      data: products,
      summary: {
        most_profitable: products[0] || null,
        least_profitable: products[products.length - 1] || null,
        total_products_analyzed: products.length
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
