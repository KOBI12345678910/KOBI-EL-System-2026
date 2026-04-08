// ============================================================
// מנוע בקרת איכות - לבדיקת מוצרים מיוצרים
// שערים, מעקות, פרגולות, דלתות, גדרות, מדרגות
// TechnoKoluzi ERP - Quality Control Engine
// ============================================================

import { Router, Request, Response } from 'express';
import pool from '@workspace/db';

const router = Router();

// ============================================================
// סוגי פגמים אפשריים
// ============================================================
const DEFECT_TYPES = [
  'welding_crack', 'welding_porosity', 'misalignment', 'wrong_dimension',
  'paint_defect', 'paint_bubbling', 'rust_spot', 'missing_hardware',
  'loose_bolt', 'glass_scratch', 'glass_chip', 'dent', 'bend',
  'color_mismatch', 'wrong_material'
];

// ============================================================
// אתחול טבלאות בקרת איכות
// ============================================================
const initSQL = `
-- טבלת בדיקות איכות
CREATE TABLE IF NOT EXISTS quality_inspections (
  id SERIAL PRIMARY KEY,
  inspection_number VARCHAR UNIQUE,
  project_id INTEGER,
  project_name VARCHAR,
  product_type VARCHAR,
  product_name VARCHAR,
  production_order_id INTEGER,
  inspector_id INTEGER,
  inspector_name VARCHAR,
  inspection_type VARCHAR DEFAULT 'final',
  inspection_date TIMESTAMPTZ DEFAULT NOW(),
  checklist JSONB DEFAULT '[]',
  measurements_check JSONB DEFAULT '{}',
  welding_quality VARCHAR,
  painting_quality VARCHAR,
  alignment_check VARCHAR,
  hardware_check VARCHAR,
  safety_check VARCHAR,
  overall_grade VARCHAR,
  score NUMERIC(5,2),
  pass BOOLEAN,
  defects_found JSONB DEFAULT '[]',
  photos JSONB DEFAULT '[]',
  corrective_actions JSONB DEFAULT '[]',
  reinspection_required BOOLEAN DEFAULT false,
  reinspection_date DATE,
  reinspection_result VARCHAR,
  customer_visible_issues BOOLEAN DEFAULT false,
  notes TEXT,
  approved_by VARCHAR,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- טבלת פגמים
CREATE TABLE IF NOT EXISTS quality_defects (
  id SERIAL PRIMARY KEY,
  inspection_id INTEGER REFERENCES quality_inspections(id),
  project_id INTEGER,
  defect_type VARCHAR NOT NULL,
  severity VARCHAR DEFAULT 'minor',
  location VARCHAR,
  description TEXT,
  description_he TEXT,
  photo_url TEXT,
  root_cause VARCHAR,
  corrective_action TEXT,
  assigned_to VARCHAR,
  status VARCHAR DEFAULT 'open',
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  cost_to_fix NUMERIC(15,2) DEFAULT 0,
  delay_days INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- תקני איכות
CREATE TABLE IF NOT EXISTS quality_standards (
  id SERIAL PRIMARY KEY,
  product_type VARCHAR NOT NULL,
  standard_name VARCHAR,
  standard_name_he VARCHAR,
  category VARCHAR,
  check_item VARCHAR NOT NULL,
  check_item_he VARCHAR,
  acceptable_range VARCHAR,
  measurement_unit VARCHAR,
  is_critical BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

// ============================================================
// POST /init - אתחול טבלאות ותקני איכות
// ============================================================
router.post('/init', async (req: Request, res: Response) => {
  try {
    await pool.query(initSQL);

    // תקני איכות לכל סוגי המוצרים
    const standards = [
      // שערים - gates
      { product_type: 'gates', standard_name: 'Gate Welding', standard_name_he: 'ריתוך שער', category: 'welding', check_item: 'Weld penetration depth', check_item_he: 'עומק חדירת ריתוך', acceptable_range: '3-5mm', measurement_unit: 'mm', is_critical: true },
      { product_type: 'gates', standard_name: 'Gate Welding', standard_name_he: 'ריתוך שער', category: 'welding', check_item: 'Weld visual inspection', check_item_he: 'בדיקה חזותית ריתוך - ללא סדקים', acceptable_range: 'No cracks', measurement_unit: 'visual', is_critical: true },
      { product_type: 'gates', standard_name: 'Gate Dimensions', standard_name_he: 'מידות שער', category: 'dimensions', check_item: 'Width tolerance', check_item_he: 'סטייה ברוחב', acceptable_range: '±5mm', measurement_unit: 'mm', is_critical: true },
      { product_type: 'gates', standard_name: 'Gate Dimensions', standard_name_he: 'מידות שער', category: 'dimensions', check_item: 'Height tolerance', check_item_he: 'סטייה בגובה', acceptable_range: '±5mm', measurement_unit: 'mm', is_critical: true },
      { product_type: 'gates', standard_name: 'Gate Paint', standard_name_he: 'צביעת שער', category: 'painting', check_item: 'Paint thickness', check_item_he: 'עובי צבע', acceptable_range: '60-120 microns', measurement_unit: 'microns', is_critical: false },
      { product_type: 'gates', standard_name: 'Gate Paint', standard_name_he: 'צביעת שער', category: 'painting', check_item: 'Paint adhesion', check_item_he: 'הידבקות צבע', acceptable_range: 'No peeling', measurement_unit: 'visual', is_critical: true },
      { product_type: 'gates', standard_name: 'Gate Hardware', standard_name_he: 'פרזול שער', category: 'hardware', check_item: 'Wheel alignment', check_item_he: 'יישור גלגלים', acceptable_range: 'Smooth operation', measurement_unit: 'functional', is_critical: true },
      { product_type: 'gates', standard_name: 'Gate Safety', standard_name_he: 'בטיחות שער', category: 'safety', check_item: 'Motor safety sensor', check_item_he: 'חיישן בטיחות מנוע', acceptable_range: 'Functional', measurement_unit: 'functional', is_critical: true },

      // מעקות - railings
      { product_type: 'railings', standard_name: 'Railing Standards', standard_name_he: 'תקן מעקה', category: 'dimensions', check_item: 'Height from floor', check_item_he: 'גובה מרצפה', acceptable_range: '105-110cm', measurement_unit: 'cm', is_critical: true },
      { product_type: 'railings', standard_name: 'Railing Standards', standard_name_he: 'תקן מעקה', category: 'dimensions', check_item: 'Spacing between bars', check_item_he: 'מרחק בין חישוקים', acceptable_range: 'Max 10cm', measurement_unit: 'cm', is_critical: true },
      { product_type: 'railings', standard_name: 'Railing Welding', standard_name_he: 'ריתוך מעקה', category: 'welding', check_item: 'Weld smoothness', check_item_he: 'חלקות ריתוך', acceptable_range: 'Smooth finish', measurement_unit: 'visual', is_critical: false },
      { product_type: 'railings', standard_name: 'Railing Safety', standard_name_he: 'בטיחות מעקה', category: 'safety', check_item: 'Load bearing test', check_item_he: 'בדיקת עומס', acceptable_range: 'Min 100kg/m', measurement_unit: 'kg/m', is_critical: true },
      { product_type: 'railings', standard_name: 'Railing Paint', standard_name_he: 'צביעת מעקה', category: 'painting', check_item: 'Color consistency', check_item_he: 'אחידות צבע', acceptable_range: 'RAL match', measurement_unit: 'visual', is_critical: false },

      // פרגולות - pergolas
      { product_type: 'pergolas', standard_name: 'Pergola Structure', standard_name_he: 'מבנה פרגולה', category: 'dimensions', check_item: 'Column verticality', check_item_he: 'אנכיות עמודים', acceptable_range: '±2mm/m', measurement_unit: 'mm/m', is_critical: true },
      { product_type: 'pergolas', standard_name: 'Pergola Structure', standard_name_he: 'מבנה פרגולה', category: 'dimensions', check_item: 'Beam level', check_item_he: 'מפלס קורות', acceptable_range: '±3mm', measurement_unit: 'mm', is_critical: true },
      { product_type: 'pergolas', standard_name: 'Pergola Welding', standard_name_he: 'ריתוך פרגולה', category: 'welding', check_item: 'Structural weld integrity', check_item_he: 'שלמות ריתוך מבני', acceptable_range: 'Full penetration', measurement_unit: 'visual', is_critical: true },
      { product_type: 'pergolas', standard_name: 'Pergola Paint', standard_name_he: 'צביעת פרגולה', category: 'painting', check_item: 'Rust protection', check_item_he: 'הגנה מחלודה', acceptable_range: 'Full coverage', measurement_unit: 'visual', is_critical: true },

      // דלתות - doors
      { product_type: 'doors', standard_name: 'Door Standards', standard_name_he: 'תקן דלת', category: 'dimensions', check_item: 'Door squareness', check_item_he: 'ריבועיות דלת', acceptable_range: '±2mm diagonal', measurement_unit: 'mm', is_critical: true },
      { product_type: 'doors', standard_name: 'Door Standards', standard_name_he: 'תקן דלת', category: 'hardware', check_item: 'Lock mechanism', check_item_he: 'מנגנון נעילה', acceptable_range: 'Smooth operation', measurement_unit: 'functional', is_critical: true },
      { product_type: 'doors', standard_name: 'Door Standards', standard_name_he: 'תקן דלת', category: 'hardware', check_item: 'Hinge alignment', check_item_he: 'יישור צירים', acceptable_range: 'No sag', measurement_unit: 'functional', is_critical: true },
      { product_type: 'doors', standard_name: 'Door Paint', standard_name_he: 'צביעת דלת', category: 'painting', check_item: 'Surface finish', check_item_he: 'גמר משטח', acceptable_range: 'No drips/bubbles', measurement_unit: 'visual', is_critical: false },

      // גדרות - fences
      { product_type: 'fences', standard_name: 'Fence Standards', standard_name_he: 'תקן גדר', category: 'dimensions', check_item: 'Post spacing', check_item_he: 'מרחק בין עמודים', acceptable_range: '200-250cm', measurement_unit: 'cm', is_critical: false },
      { product_type: 'fences', standard_name: 'Fence Standards', standard_name_he: 'תקן גדר', category: 'dimensions', check_item: 'Height consistency', check_item_he: 'אחידות גובה', acceptable_range: '±10mm', measurement_unit: 'mm', is_critical: true },
      { product_type: 'fences', standard_name: 'Fence Welding', standard_name_he: 'ריתוך גדר', category: 'welding', check_item: 'Panel to post weld', check_item_he: 'ריתוך פאנל לעמוד', acceptable_range: 'Full contact', measurement_unit: 'visual', is_critical: true },
      { product_type: 'fences', standard_name: 'Fence Paint', standard_name_he: 'צביעת גדר', category: 'painting', check_item: 'Galvanization check', check_item_he: 'בדיקת גלוון', acceptable_range: 'Min 40 microns', measurement_unit: 'microns', is_critical: true },

      // מדרגות - stairs
      { product_type: 'stairs', standard_name: 'Stair Standards', standard_name_he: 'תקן מדרגות', category: 'dimensions', check_item: 'Step rise consistency', check_item_he: 'אחידות שלח', acceptable_range: '±3mm', measurement_unit: 'mm', is_critical: true },
      { product_type: 'stairs', standard_name: 'Stair Standards', standard_name_he: 'תקן מדרגות', category: 'dimensions', check_item: 'Step tread depth', check_item_he: 'עומק מדרך', acceptable_range: '25-30cm', measurement_unit: 'cm', is_critical: true },
      { product_type: 'stairs', standard_name: 'Stair Safety', standard_name_he: 'בטיחות מדרגות', category: 'safety', check_item: 'Anti-slip surface', check_item_he: 'משטח מונע החלקה', acceptable_range: 'Present', measurement_unit: 'visual', is_critical: true },
      { product_type: 'stairs', standard_name: 'Stair Welding', standard_name_he: 'ריתוך מדרגות', category: 'welding', check_item: 'Stringer weld quality', check_item_he: 'איכות ריתוך נושאים', acceptable_range: 'Full penetration', measurement_unit: 'visual', is_critical: true },
      { product_type: 'stairs', standard_name: 'Stair Safety', standard_name_he: 'בטיחות מדרגות', category: 'safety', check_item: 'Load bearing capacity', check_item_he: 'כושר נשיאת עומס', acceptable_range: 'Min 300kg/m2', measurement_unit: 'kg/m2', is_critical: true }
    ];

    for (const std of standards) {
      await pool.query(`
        INSERT INTO quality_standards (
          product_type, standard_name, standard_name_he, category,
          check_item, check_item_he, acceptable_range, measurement_unit, is_critical
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT DO NOTHING
      `, [
        std.product_type, std.standard_name, std.standard_name_he, std.category,
        std.check_item, std.check_item_he, std.acceptable_range, std.measurement_unit, std.is_critical
      ]);
    }

    res.json({
      success: true,
      message: 'מנוע בקרת איכות אותחל בהצלחה - תקנים לכל סוגי המוצרים נוצרו',
      tables: ['quality_inspections', 'quality_defects', 'quality_standards'],
      standards_created: standards.length,
      product_types: ['gates', 'railings', 'pergolas', 'doors', 'fences', 'stairs'],
      defect_types: DEFECT_TYPES
    });
  } catch (error: any) {
    console.error('שגיאה באתחול מנוע בקרת איכות:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD - בדיקות איכות
// ============================================================

// קבלת כל הבדיקות
router.get('/', async (req: Request, res: Response) => {
  try {
    const { product_type, pass, inspector_id, project_id, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (product_type) { params.push(product_type); where += ` AND product_type = $${params.length}`; }
    if (pass !== undefined) { params.push(pass === 'true'); where += ` AND pass = $${params.length}`; }
    if (inspector_id) { params.push(inspector_id); where += ` AND inspector_id = $${params.length}`; }
    if (project_id) { params.push(project_id); where += ` AND project_id = $${params.length}`; }

    params.push(Number(limit), offset);
    const result = await pool.query(
      `SELECT * FROM quality_inspections ${where} ORDER BY inspection_date DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM quality_inspections ${where}`,
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

// קבלת בדיקה בודדת
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const inspection = await pool.query('SELECT * FROM quality_inspections WHERE id = $1', [id]);
    if (inspection.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'בדיקת איכות לא נמצאה' });
    }

    // טעינת פגמים
    const defects = await pool.query(
      'SELECT * FROM quality_defects WHERE inspection_id = $1 ORDER BY severity DESC, created_at',
      [id]
    );

    res.json({
      success: true,
      data: {
        ...inspection.rows[0],
        defects: defects.rows
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// יצירת בדיקה חדשה ידנית
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      project_id, project_name, product_type, product_name,
      production_order_id, inspector_id, inspector_name, inspection_type, notes
    } = req.body;

    const countResult = await pool.query('SELECT COUNT(*) FROM quality_inspections');
    const count = parseInt(countResult.rows[0].count) + 1;
    const inspectionNumber = `QC-2026-${String(count).padStart(4, '0')}`;

    const result = await pool.query(`
      INSERT INTO quality_inspections (
        inspection_number, project_id, project_name, product_type, product_name,
        production_order_id, inspector_id, inspector_name, inspection_type, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `, [
      inspectionNumber, project_id, project_name, product_type, product_name,
      production_order_id, inspector_id, inspector_name, inspection_type || 'final', notes
    ]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// עדכון בדיקה
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    delete fields.id;
    delete fields.created_at;
    fields.updated_at = new Date().toISOString();

    if (fields.checklist) fields.checklist = JSON.stringify(fields.checklist);
    if (fields.measurements_check) fields.measurements_check = JSON.stringify(fields.measurements_check);
    if (fields.defects_found) fields.defects_found = JSON.stringify(fields.defects_found);
    if (fields.photos) fields.photos = JSON.stringify(fields.photos);
    if (fields.corrective_actions) fields.corrective_actions = JSON.stringify(fields.corrective_actions);

    const keys = Object.keys(fields);
    const values = Object.values(fields);
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');

    const result = await pool.query(
      `UPDATE quality_inspections SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'בדיקה לא נמצאה' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ביטול בדיקה (לא מחיקה!)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `UPDATE quality_inspections SET overall_grade = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'בדיקה לא נמצאה' });
    }
    res.json({ success: true, data: result.rows[0], message: 'בדיקה סומנה כמבוטלת' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD - תקני איכות
// ============================================================

router.get('/standards', async (req: Request, res: Response) => {
  try {
    const { product_type, category, is_critical } = req.query;
    let where = 'WHERE is_active = true';
    const params: any[] = [];

    if (product_type) { params.push(product_type); where += ` AND product_type = $${params.length}`; }
    if (category) { params.push(category); where += ` AND category = $${params.length}`; }
    if (is_critical !== undefined) { params.push(is_critical === 'true'); where += ` AND is_critical = $${params.length}`; }

    const result = await pool.query(
      `SELECT * FROM quality_standards ${where} ORDER BY product_type, category, is_critical DESC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/standards', async (req: Request, res: Response) => {
  try {
    const {
      product_type, standard_name, standard_name_he, category,
      check_item, check_item_he, acceptable_range, measurement_unit, is_critical
    } = req.body;

    const result = await pool.query(`
      INSERT INTO quality_standards (
        product_type, standard_name, standard_name_he, category,
        check_item, check_item_he, acceptable_range, measurement_unit, is_critical
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [product_type, standard_name, standard_name_he, category, check_item, check_item_he, acceptable_range, measurement_unit, is_critical || false]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /start-inspection/:projectId - התחלת בדיקה מתוך תקנים
// ============================================================
router.post('/start-inspection/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const {
      project_name, product_type, product_name,
      production_order_id, inspector_id, inspector_name
    } = req.body;

    // טעינת תקני איכות לסוג המוצר
    const standards = await pool.query(
      'SELECT * FROM quality_standards WHERE product_type = $1 AND is_active = true ORDER BY is_critical DESC, category',
      [product_type]
    );

    if (standards.rows.length === 0) {
      return res.status(400).json({ success: false, error: `לא נמצאו תקנים לסוג מוצר: ${product_type}` });
    }

    // בניית צ'קליסט מתקנים
    const checklist = standards.rows.map((std: any) => ({
      standard_id: std.id,
      category: std.category,
      check_item: std.check_item,
      check_item_he: std.check_item_he,
      acceptable_range: std.acceptable_range,
      measurement_unit: std.measurement_unit,
      is_critical: std.is_critical,
      result: null, // ימולא ע"י הבודק
      actual_value: null,
      pass: null,
      notes: ''
    }));

    // יצירת מספר בדיקה ייחודי
    const countResult = await pool.query('SELECT COUNT(*) FROM quality_inspections');
    const count = parseInt(countResult.rows[0].count) + 1;
    const inspectionNumber = `QC-2026-${String(count).padStart(4, '0')}`;

    const result = await pool.query(`
      INSERT INTO quality_inspections (
        inspection_number, project_id, project_name, product_type, product_name,
        production_order_id, inspector_id, inspector_name, inspection_type, checklist
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'final',$9)
      RETURNING *
    `, [
      inspectionNumber, projectId, project_name, product_type, product_name,
      production_order_id, inspector_id, inspector_name, JSON.stringify(checklist)
    ]);

    res.status(201).json({
      success: true,
      message: `בדיקת איכות נוצרה עם ${checklist.length} פריטי בדיקה`,
      data: result.rows[0],
      checklist_items: checklist.length,
      critical_items: checklist.filter((c: any) => c.is_critical).length
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /submit-inspection/:inspectionId - הגשת תוצאות בדיקה
// ============================================================
router.post('/submit-inspection/:inspectionId', async (req: Request, res: Response) => {
  try {
    const { inspectionId } = req.params;
    const {
      checklist, measurements_check,
      welding_quality, painting_quality, alignment_check,
      hardware_check, safety_check, photos, notes
    } = req.body;

    // חישוב ציון וקביעת עובר/נכשל
    let totalChecks = 0;
    let passedChecks = 0;
    let criticalFails = 0;
    const defectsFound: any[] = [];

    for (const item of (checklist || [])) {
      totalChecks++;
      if (item.pass === true) {
        passedChecks++;
      } else if (item.pass === false) {
        if (item.is_critical) criticalFails++;
        defectsFound.push({
          check_item: item.check_item_he || item.check_item,
          category: item.category,
          is_critical: item.is_critical,
          actual_value: item.actual_value,
          expected: item.acceptable_range
        });
      }
    }

    const score = totalChecks > 0 ? (passedChecks / totalChecks) * 100 : 0;

    // קביעת ציון כולל
    let overallGrade: string;
    let pass: boolean;

    if (criticalFails > 0) {
      overallGrade = 'fail';
      pass = false;
    } else if (score >= 95) {
      overallGrade = 'excellent';
      pass = true;
    } else if (score >= 85) {
      overallGrade = 'good';
      pass = true;
    } else if (score >= 70) {
      overallGrade = 'acceptable';
      pass = true;
    } else {
      overallGrade = 'fail';
      pass = false;
    }

    const reinspectionRequired = !pass;
    const customerVisibleIssues = defectsFound.some((d: any) =>
      ['paint_defect', 'dent', 'color_mismatch', 'glass_scratch'].includes(d.category)
    );

    // עדכון הבדיקה
    const result = await pool.query(`
      UPDATE quality_inspections SET
        checklist = $1, measurements_check = $2,
        welding_quality = $3, painting_quality = $4, alignment_check = $5,
        hardware_check = $6, safety_check = $7,
        overall_grade = $8, score = $9, pass = $10,
        defects_found = $11, photos = $12,
        reinspection_required = $13, customer_visible_issues = $14,
        notes = $15, updated_at = NOW()
      WHERE id = $16
      RETURNING *
    `, [
      JSON.stringify(checklist || []), JSON.stringify(measurements_check || {}),
      welding_quality, painting_quality, alignment_check,
      hardware_check, safety_check,
      overallGrade, score, pass,
      JSON.stringify(defectsFound), JSON.stringify(photos || []),
      reinspectionRequired, customerVisibleIssues,
      notes, inspectionId
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'בדיקה לא נמצאה' });
    }

    res.json({
      success: true,
      message: pass ? 'המוצר עבר בדיקת איכות!' : 'המוצר נכשל בבדיקת איכות',
      data: result.rows[0],
      summary: {
        total_checks: totalChecks,
        passed: passedChecks,
        failed: totalChecks - passedChecks,
        critical_fails: criticalFails,
        score,
        overall_grade: overallGrade,
        pass,
        reinspection_required: reinspectionRequired,
        defects_count: defectsFound.length,
        customer_visible_issues: customerVisibleIssues
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /report-defect/:inspectionId - דיווח על פגם
// ============================================================
router.post('/report-defect/:inspectionId', async (req: Request, res: Response) => {
  try {
    const { inspectionId } = req.params;
    const {
      project_id, defect_type, severity, location,
      description, description_he, photo_url,
      root_cause, corrective_action, assigned_to
    } = req.body;

    // וידוא סוג פגם תקין
    if (defect_type && !DEFECT_TYPES.includes(defect_type)) {
      return res.status(400).json({
        success: false,
        error: `סוג פגם לא תקין. סוגים אפשריים: ${DEFECT_TYPES.join(', ')}`
      });
    }

    const result = await pool.query(`
      INSERT INTO quality_defects (
        inspection_id, project_id, defect_type, severity, location,
        description, description_he, photo_url, root_cause,
        corrective_action, assigned_to
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      inspectionId, project_id, defect_type, severity || 'minor', location,
      description, description_he, photo_url, root_cause,
      corrective_action, assigned_to
    ]);

    // עדכון רשימת פגמים בבדיקה
    await pool.query(`
      UPDATE quality_inspections SET
        defects_found = (
          SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::jsonb)
          FROM quality_defects d WHERE d.inspection_id = $1
        ),
        updated_at = NOW()
      WHERE id = $1
    `, [inspectionId]);

    res.status(201).json({
      success: true,
      message: 'פגם דווח בהצלחה',
      data: result.rows[0]
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /defects-open - כל הפגמים הפתוחים
// ============================================================
router.get('/defects-open', async (req: Request, res: Response) => {
  try {
    const { severity, defect_type, assigned_to } = req.query;
    let where = "WHERE status = 'open'";
    const params: any[] = [];

    if (severity) { params.push(severity); where += ` AND severity = $${params.length}`; }
    if (defect_type) { params.push(defect_type); where += ` AND defect_type = $${params.length}`; }
    if (assigned_to) { params.push(assigned_to); where += ` AND assigned_to = $${params.length}`; }

    const result = await pool.query(
      `SELECT qd.*, qi.inspection_number, qi.project_name, qi.product_type
       FROM quality_defects qd
       LEFT JOIN quality_inspections qi ON qd.inspection_id = qi.id
       ${where}
       ORDER BY
         CASE severity WHEN 'critical' THEN 1 WHEN 'major' THEN 2 WHEN 'minor' THEN 3 ELSE 4 END,
         qd.created_at`,
      params
    );

    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length,
      by_severity: {
        critical: result.rows.filter((r: any) => r.severity === 'critical').length,
        major: result.rows.filter((r: any) => r.severity === 'major').length,
        minor: result.rows.filter((r: any) => r.severity === 'minor').length
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /resolve-defect/:defectId - פתרון פגם
// ============================================================
router.post('/resolve-defect/:defectId', async (req: Request, res: Response) => {
  try {
    const { defectId } = req.params;
    const { resolution_notes, cost_to_fix, delay_days } = req.body;

    const result = await pool.query(`
      UPDATE quality_defects SET
        status = 'resolved',
        resolved_at = NOW(),
        resolution_notes = $1,
        cost_to_fix = COALESCE($2, cost_to_fix),
        delay_days = COALESCE($3, delay_days),
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [resolution_notes, cost_to_fix, delay_days, defectId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'פגם לא נמצא' });
    }
    res.json({ success: true, data: result.rows[0], message: 'פגם סומן כנפתר' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /quality-dashboard - דשבורד בקרת איכות ראשי
// ============================================================
router.get('/quality-dashboard', async (req: Request, res: Response) => {
  try {
    // שיעור מעבר
    const passRate = await pool.query(`
      SELECT
        COUNT(*) as total_inspections,
        SUM(CASE WHEN pass = true THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN pass = false THEN 1 ELSE 0 END) as failed,
        CASE WHEN COUNT(*) > 0
          THEN (SUM(CASE WHEN pass = true THEN 1 ELSE 0 END)::numeric / COUNT(*)) * 100
          ELSE 0
        END as pass_rate,
        AVG(score) as avg_score
      FROM quality_inspections
      WHERE overall_grade != 'cancelled'
    `);

    // פגמים נפוצים
    const commonDefects = await pool.query(`
      SELECT defect_type, severity, COUNT(*) as count
      FROM quality_defects
      GROUP BY defect_type, severity
      ORDER BY count DESC
      LIMIT 10
    `);

    // מגמות לפי חודש
    const trends = await pool.query(`
      SELECT
        DATE_TRUNC('month', inspection_date) as month,
        COUNT(*) as total,
        AVG(score) as avg_score,
        SUM(CASE WHEN pass = true THEN 1 ELSE 0 END) as passed
      FROM quality_inspections
      WHERE overall_grade != 'cancelled'
      GROUP BY DATE_TRUNC('month', inspection_date)
      ORDER BY month DESC
      LIMIT 12
    `);

    // לפי סוג מוצר
    const byProductType = await pool.query(`
      SELECT
        product_type,
        COUNT(*) as inspections,
        AVG(score) as avg_score,
        SUM(CASE WHEN pass = true THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN pass = false THEN 1 ELSE 0 END) as failed
      FROM quality_inspections
      WHERE overall_grade != 'cancelled'
      GROUP BY product_type
      ORDER BY avg_score DESC
    `);

    // פגמים פתוחים
    const openDefects = await pool.query(`
      SELECT COUNT(*) as count,
        SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN severity = 'major' THEN 1 ELSE 0 END) as major,
        SUM(CASE WHEN severity = 'minor' THEN 1 ELSE 0 END) as minor
      FROM quality_defects
      WHERE status = 'open'
    `);

    res.json({
      success: true,
      dashboard: {
        pass_rate: passRate.rows[0],
        common_defects: commonDefects.rows,
        trends: trends.rows,
        by_product_type: byProductType.rows,
        open_defects: openDefects.rows[0]
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /product-quality-report/:productType - דוח איכות לסוג מוצר
// ============================================================
router.get('/product-quality-report/:productType', async (req: Request, res: Response) => {
  try {
    const { productType } = req.params;

    const inspections = await pool.query(`
      SELECT * FROM quality_inspections
      WHERE product_type = $1 AND overall_grade != 'cancelled'
      ORDER BY inspection_date DESC
    `, [productType]);

    const defects = await pool.query(`
      SELECT qd.* FROM quality_defects qd
      JOIN quality_inspections qi ON qd.inspection_id = qi.id
      WHERE qi.product_type = $1
      ORDER BY qd.created_at DESC
    `, [productType]);

    const standards = await pool.query(
      'SELECT * FROM quality_standards WHERE product_type = $1 AND is_active = true ORDER BY is_critical DESC',
      [productType]
    );

    const total = inspections.rows.length;
    const passed = inspections.rows.filter((i: any) => i.pass).length;
    const avgScore = total > 0 ? inspections.rows.reduce((s: number, i: any) => s + (parseFloat(i.score) || 0), 0) / total : 0;

    res.json({
      success: true,
      product_type: productType,
      summary: {
        total_inspections: total,
        passed,
        failed: total - passed,
        pass_rate: total > 0 ? (passed / total) * 100 : 0,
        avg_score: avgScore,
        total_defects: defects.rows.length,
        open_defects: defects.rows.filter((d: any) => d.status === 'open').length
      },
      inspections: inspections.rows,
      defects: defects.rows,
      standards: standards.rows
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /inspector-performance/:inspectorId - ביצועי בודק
// ============================================================
router.get('/inspector-performance/:inspectorId', async (req: Request, res: Response) => {
  try {
    const { inspectorId } = req.params;

    const result = await pool.query(`
      SELECT
        inspector_name,
        COUNT(*) as total_inspections,
        AVG(score) as avg_score,
        SUM(CASE WHEN pass = true THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN pass = false THEN 1 ELSE 0 END) as rejected,
        COUNT(DISTINCT product_type) as product_types_inspected,
        MIN(inspection_date) as first_inspection,
        MAX(inspection_date) as last_inspection
      FROM quality_inspections
      WHERE inspector_id = $1 AND overall_grade != 'cancelled'
      GROUP BY inspector_name
    `, [inspectorId]);

    // פגמים שמצא
    const defectsFound = await pool.query(`
      SELECT defect_type, COUNT(*) as count
      FROM quality_defects qd
      JOIN quality_inspections qi ON qd.inspection_id = qi.id
      WHERE qi.inspector_id = $1
      GROUP BY defect_type
      ORDER BY count DESC
    `, [inspectorId]);

    res.json({
      success: true,
      inspector_id: inspectorId,
      performance: result.rows[0] || null,
      defects_found_by_type: defectsFound.rows
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /defect-analysis/:period - ניתוח פארטו של פגמים
// ============================================================
router.get('/defect-analysis/:period', async (req: Request, res: Response) => {
  try {
    const { period } = req.params;
    const params: any[] = [];
    let dateFilter = '';

    if (period.includes('Q')) {
      const [year, quarter] = period.split('-Q');
      const startMonth = (parseInt(quarter) - 1) * 3 + 1;
      const endMonth = startMonth + 2;
      params.push(`${year}-${String(startMonth).padStart(2, '0')}-01`);
      params.push(`${year}-${String(endMonth).padStart(2, '0')}-31`);
      dateFilter = 'WHERE qd.created_at >= $1::date AND qd.created_at <= $2::date';
    } else {
      params.push(period + '-01', period + '-31');
      dateFilter = 'WHERE qd.created_at >= $1::date AND qd.created_at <= $2::date';
    }

    // ניתוח פארטו - סוגי פגמים
    const pareto = await pool.query(`
      SELECT
        qd.defect_type,
        COUNT(*) as count,
        SUM(qd.cost_to_fix) as total_fix_cost,
        SUM(qd.delay_days) as total_delay_days,
        ROUND(COUNT(*)::numeric / NULLIF((SELECT COUNT(*) FROM quality_defects qd2 ${dateFilter.replace('qd.', 'qd2.')}), 0) * 100, 1) as percentage
      FROM quality_defects qd
      ${dateFilter}
      GROUP BY qd.defect_type
      ORDER BY count DESC
    `, [...params, ...params]);

    // ניתוח לפי חומרה
    const bySeverity = await pool.query(`
      SELECT severity, COUNT(*) as count, SUM(cost_to_fix) as total_cost
      FROM quality_defects qd
      ${dateFilter}
      GROUP BY severity
      ORDER BY
        CASE severity WHEN 'critical' THEN 1 WHEN 'major' THEN 2 WHEN 'minor' THEN 3 END
    `, params);

    // חישוב פארטו מצטבר
    let cumulativePercent = 0;
    const paretoWithCumulative = pareto.rows.map((row: any) => {
      cumulativePercent += parseFloat(row.percentage) || 0;
      return { ...row, cumulative_percentage: cumulativePercent };
    });

    // כלל 80/20
    const top20percent = Math.ceil(pareto.rows.length * 0.2);
    const top20defects = pareto.rows.slice(0, top20percent);
    const top20count = top20defects.reduce((s: number, r: any) => s + parseInt(r.count), 0);
    const totalCount = pareto.rows.reduce((s: number, r: any) => s + parseInt(r.count), 0);

    res.json({
      success: true,
      period,
      pareto_analysis: paretoWithCumulative,
      by_severity: bySeverity.rows,
      insight: {
        total_defect_types: pareto.rows.length,
        total_defects: totalCount,
        top_20_percent_types: top20defects.map((d: any) => d.defect_type),
        top_20_percent_count: top20count,
        top_20_percent_ratio: totalCount > 0 ? (top20count / totalCount) * 100 : 0,
        pareto_principle: `${top20percent} סוגי פגמים (20%) אחראים ל-${totalCount > 0 ? ((top20count / totalCount) * 100).toFixed(1) : 0}% מכלל הפגמים`
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /cost-of-quality/:period - עלות איכות (עלות תיקונים)
// ============================================================
router.get('/cost-of-quality/:period', async (req: Request, res: Response) => {
  try {
    const { period } = req.params;

    const result = await pool.query(`
      SELECT
        SUM(cost_to_fix) as total_fix_cost,
        SUM(delay_days) as total_delay_days,
        COUNT(*) as total_defects,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved,
        COUNT(CASE WHEN status = 'open' THEN 1 END) as open_defects,
        AVG(cost_to_fix) as avg_fix_cost,
        MAX(cost_to_fix) as max_fix_cost
      FROM quality_defects
      WHERE created_at >= ($1 || '-01')::date AND created_at <= ($1 || '-31')::date
    `, [period]);

    // עלות לפי סוג פגם
    const byType = await pool.query(`
      SELECT
        defect_type,
        SUM(cost_to_fix) as total_cost,
        COUNT(*) as count,
        AVG(cost_to_fix) as avg_cost,
        SUM(delay_days) as total_delay
      FROM quality_defects
      WHERE created_at >= ($1 || '-01')::date AND created_at <= ($1 || '-31')::date
      GROUP BY defect_type
      ORDER BY total_cost DESC
    `, [period]);

    const summary = result.rows[0];
    const totalFixCost = parseFloat(summary.total_fix_cost) || 0;
    const avgDailyDelayCost = 2000; // הערכת עלות יום עיכוב - 2000 ₪
    const delayCost = (parseInt(summary.total_delay_days) || 0) * avgDailyDelayCost;

    res.json({
      success: true,
      period,
      cost_of_quality: {
        direct_fix_cost: totalFixCost,
        delay_cost_estimated: delayCost,
        total_quality_cost: totalFixCost + delayCost,
        total_defects: parseInt(summary.total_defects) || 0,
        avg_fix_cost: parseFloat(summary.avg_fix_cost) || 0,
        max_fix_cost: parseFloat(summary.max_fix_cost) || 0,
        total_delay_days: parseInt(summary.total_delay_days) || 0
      },
      by_defect_type: byType.rows,
      recommendation_he: totalFixCost > 5000
        ? 'עלות איכות גבוהה - מומלץ לחזק תהליכי בקרה בייצור'
        : 'עלות איכות בטווח סביר'
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /reinspect/:inspectionId - בדיקה חוזרת
// ============================================================
router.post('/reinspect/:inspectionId', async (req: Request, res: Response) => {
  try {
    const { inspectionId } = req.params;
    const { reinspection_result, notes, inspector_id, inspector_name } = req.body;

    // טעינת הבדיקה המקורית
    const original = await pool.query('SELECT * FROM quality_inspections WHERE id = $1', [inspectionId]);
    if (original.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'בדיקה לא נמצאה' });
    }

    // עדכון תוצאת בדיקה חוזרת
    const result = await pool.query(`
      UPDATE quality_inspections SET
        reinspection_date = NOW(),
        reinspection_result = $1,
        reinspection_required = false,
        pass = CASE WHEN $1 = 'pass' THEN true ELSE false END,
        overall_grade = CASE WHEN $1 = 'pass' THEN 'pass_after_reinspection' ELSE 'fail' END,
        notes = COALESCE(notes || ' | ', '') || $2,
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [
      reinspection_result,
      `בדיקה חוזרת ${new Date().toLocaleDateString('he-IL')} - תוצאה: ${reinspection_result}. ${notes || ''}`,
      inspectionId
    ]);

    // אם עבר - סגירת פגמים פתוחים
    if (reinspection_result === 'pass') {
      await pool.query(`
        UPDATE quality_defects SET
          status = 'resolved',
          resolved_at = NOW(),
          resolution_notes = COALESCE(resolution_notes || ' | ', '') || 'נפתר בבדיקה חוזרת'
        WHERE inspection_id = $1 AND status = 'open'
      `, [inspectionId]);
    }

    res.json({
      success: true,
      message: reinspection_result === 'pass' ? 'המוצר עבר בדיקה חוזרת בהצלחה!' : 'המוצר נכשל גם בבדיקה חוזרת',
      data: result.rows[0]
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /pending-inspections - מוצרים ממתינים לבדיקת איכות
// ============================================================
router.get('/pending-inspections', async (req: Request, res: Response) => {
  try {
    // בדיקות שעדיין לא הושלמו (ללא ציון)
    const pending = await pool.query(`
      SELECT * FROM quality_inspections
      WHERE (overall_grade IS NULL OR overall_grade = '')
        AND overall_grade != 'cancelled'
      ORDER BY created_at ASC
    `);

    // בדיקות שדורשות בדיקה חוזרת
    const reinspection = await pool.query(`
      SELECT * FROM quality_inspections
      WHERE reinspection_required = true AND reinspection_result IS NULL
      ORDER BY created_at ASC
    `);

    res.json({
      success: true,
      pending_inspections: pending.rows,
      awaiting_reinspection: reinspection.rows,
      total_pending: pending.rows.length + reinspection.rows.length
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /certificates/:projectId - הנפקת תעודת איכות ללקוח
// ============================================================
router.get('/certificates/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    // טעינת כל הבדיקות שעברו לפרויקט
    const inspections = await pool.query(`
      SELECT * FROM quality_inspections
      WHERE project_id = $1 AND pass = true
      ORDER BY inspection_date DESC
    `, [projectId]);

    if (inspections.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'לא נמצאו בדיקות איכות שעברו בהצלחה לפרויקט זה'
      });
    }

    const latestInspection = inspections.rows[0];

    // תעודת איכות
    const certificate = {
      title: 'תעודת איכות - טכנוקולוזי',
      title_en: 'Quality Certificate - TechnoKoluzi',
      certificate_number: `CERT-${latestInspection.inspection_number}`,
      issued_date: new Date().toISOString(),
      // פרטי פרויקט
      project: {
        id: latestInspection.project_id,
        name: latestInspection.project_name,
        product_type: latestInspection.product_type,
        product_name: latestInspection.product_name
      },
      // פרטי בדיקה
      inspection: {
        inspection_number: latestInspection.inspection_number,
        inspection_date: latestInspection.inspection_date,
        inspector_name: latestInspection.inspector_name,
        overall_grade: latestInspection.overall_grade,
        score: parseFloat(latestInspection.score),
        checks_performed: (latestInspection.checklist || []).length
      },
      // תקנים שנבדקו
      standards_checked: {
        welding: latestInspection.welding_quality,
        painting: latestInspection.painting_quality,
        alignment: latestInspection.alignment_check,
        hardware: latestInspection.hardware_check,
        safety: latestInspection.safety_check
      },
      // הצהרה
      declaration_he: `מוצר זה נבדק ועמד בכל תקני האיכות הנדרשים. הבדיקה בוצעה על ידי ${latestInspection.inspector_name} בתאריך ${new Date(latestInspection.inspection_date).toLocaleDateString('he-IL')}.`,
      declaration_en: `This product has been inspected and meets all required quality standards. Inspection performed by ${latestInspection.inspector_name} on ${new Date(latestInspection.inspection_date).toLocaleDateString('en-IL')}.`,
      // אישור
      approved_by: latestInspection.approved_by || 'ממתין לאישור',
      approved_at: latestInspection.approved_at,
      // כל הבדיקות
      all_inspections: inspections.rows.length,
      warranty_note_he: 'מוצר זה מכוסה באחריות לתקופה של 12 חודשים מיום ההתקנה.'
    };

    res.json({
      success: true,
      certificate
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
