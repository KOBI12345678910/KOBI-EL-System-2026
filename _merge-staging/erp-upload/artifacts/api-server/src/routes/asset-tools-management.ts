// ============================================================================
// ניהול נכסים, כלים, ציוד ורכבים של החברה
// Asset, Tools & Equipment Management Engine
// מעקב נכסים, תחזוקה, פחת, ביטוחים וצי רכבים
// ============================================================================

import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ============================================================================
// אתחול טבלאות - יצירת כל הטבלאות של ניהול נכסים
// ============================================================================
router.post("/asset-management/init", async (_req, res) => {
  try {
    await pool.query(`
      -- נכסי החברה - ציוד, כלים, מכונות ועוד
      CREATE TABLE IF NOT EXISTS company_assets (
        id SERIAL PRIMARY KEY,
        asset_number VARCHAR(100) UNIQUE,
        asset_name VARCHAR(300),
        asset_name_he VARCHAR(300),
        category VARCHAR(200),
        subcategory VARCHAR(200),
        manufacturer VARCHAR(200),
        model VARCHAR(200),
        serial_number VARCHAR(200),
        purchase_date DATE,
        purchase_cost NUMERIC(15,2),
        current_value NUMERIC(15,2),
        depreciation_rate NUMERIC(5,2),
        location VARCHAR(300),
        department VARCHAR(200),
        assigned_to VARCHAR(200),
        condition VARCHAR(50) DEFAULT 'good',
        last_inspection DATE,
        next_inspection DATE,
        warranty_expiry DATE,
        insurance_policy VARCHAR(200),
        insurance_expiry DATE,
        maintenance_schedule VARCHAR(100),
        last_maintenance DATE,
        next_maintenance DATE,
        total_maintenance_cost NUMERIC(15,2) DEFAULT 0,
        operating_hours NUMERIC DEFAULT 0,
        photos JSONB DEFAULT '[]',
        documents JSONB DEFAULT '[]',
        notes TEXT,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- יומן תחזוקת נכסים - כל פעולת תחזוקה
      CREATE TABLE IF NOT EXISTS asset_maintenance_log (
        id SERIAL PRIMARY KEY,
        asset_id INTEGER,
        asset_name VARCHAR(300),
        maintenance_type VARCHAR(100),
        description TEXT,
        performed_by VARCHAR(200),
        cost NUMERIC(15,2) DEFAULT 0,
        parts_used JSONB DEFAULT '[]',
        downtime_hours NUMERIC DEFAULT 0,
        next_maintenance DATE,
        notes TEXT,
        status VARCHAR(50) DEFAULT 'completed',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- צי רכבים - ניהול כלי רכב של החברה
      CREATE TABLE IF NOT EXISTS vehicle_fleet (
        id SERIAL PRIMARY KEY,
        vehicle_number VARCHAR(50) UNIQUE,
        vehicle_type VARCHAR(100),
        make VARCHAR(100),
        model VARCHAR(100),
        year INTEGER,
        license_plate VARCHAR(50),
        assigned_to VARCHAR(200),
        department VARCHAR(200),
        fuel_type VARCHAR(50) DEFAULT 'diesel',
        odometer_km INTEGER DEFAULT 0,
        insurance_expiry DATE,
        test_date DATE,
        next_test DATE,
        monthly_cost NUMERIC(15,2) DEFAULT 0,
        fuel_cost_monthly NUMERIC(15,2) DEFAULT 0,
        status VARCHAR(50) DEFAULT 'active',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    res.json({ message: "טבלאות ניהול נכסים אותחלו בהצלחה" });
  } catch (error) {
    console.error("שגיאה באתחול טבלאות נכסים:", error);
    res.status(500).json({ error: "שגיאה באתחול טבלאות נכסים" });
  }
});

// ============================================================================
// CRUD - נכסי החברה
// ============================================================================

// קבלת כל הנכסים
router.get("/company-assets", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM company_assets WHERE status != 'deleted' ORDER BY created_at DESC");
    res.json(rows);
  } catch (error) {
    console.error("שגיאה בשליפת נכסים:", error);
    res.status(500).json({ error: "שגיאה בשליפת נכסים" });
  }
});

// קבלת נכס לפי מזהה
router.get("/company-assets/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM company_assets WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "נכס לא נמצא" });
    res.json(rows[0]);
  } catch (error) {
    console.error("שגיאה בשליפת נכס:", error);
    res.status(500).json({ error: "שגיאה בשליפת נכס" });
  }
});

// יצירת נכס חדש
router.post("/company-assets", async (req, res) => {
  try {
    const { asset_number, asset_name, asset_name_he, category, subcategory, manufacturer, model, serial_number, purchase_date, purchase_cost, current_value, depreciation_rate, location, department, assigned_to, condition, last_inspection, next_inspection, warranty_expiry, insurance_policy, insurance_expiry, maintenance_schedule, last_maintenance, next_maintenance, total_maintenance_cost, operating_hours, photos, documents, notes, status } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO company_assets (asset_number, asset_name, asset_name_he, category, subcategory, manufacturer, model, serial_number, purchase_date, purchase_cost, current_value, depreciation_rate, location, department, assigned_to, condition, last_inspection, next_inspection, warranty_expiry, insurance_policy, insurance_expiry, maintenance_schedule, last_maintenance, next_maintenance, total_maintenance_cost, operating_hours, photos, documents, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30) RETURNING *`,
      [asset_number, asset_name, asset_name_he, category, subcategory, manufacturer, model, serial_number, purchase_date, purchase_cost, current_value, depreciation_rate, location, department, assigned_to, condition, last_inspection, next_inspection, warranty_expiry, insurance_policy, insurance_expiry, maintenance_schedule, last_maintenance, next_maintenance, total_maintenance_cost, operating_hours, JSON.stringify(photos || []), JSON.stringify(documents || []), notes, status]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("שגיאה ביצירת נכס:", error);
    res.status(500).json({ error: "שגיאה ביצירת נכס" });
  }
});

// עדכון נכס
router.put("/company-assets/:id", async (req, res) => {
  try {
    const { asset_number, asset_name, asset_name_he, category, subcategory, manufacturer, model, serial_number, purchase_date, purchase_cost, current_value, depreciation_rate, location, department, assigned_to, condition, last_inspection, next_inspection, warranty_expiry, insurance_policy, insurance_expiry, maintenance_schedule, last_maintenance, next_maintenance, total_maintenance_cost, operating_hours, photos, documents, notes, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE company_assets SET asset_number=COALESCE($1,asset_number), asset_name=COALESCE($2,asset_name),
       asset_name_he=COALESCE($3,asset_name_he), category=COALESCE($4,category), subcategory=COALESCE($5,subcategory),
       manufacturer=COALESCE($6,manufacturer), model=COALESCE($7,model), serial_number=COALESCE($8,serial_number),
       purchase_date=COALESCE($9,purchase_date), purchase_cost=COALESCE($10,purchase_cost), current_value=COALESCE($11,current_value),
       depreciation_rate=COALESCE($12,depreciation_rate), location=COALESCE($13,location), department=COALESCE($14,department),
       assigned_to=COALESCE($15,assigned_to), condition=COALESCE($16,condition), last_inspection=COALESCE($17,last_inspection),
       next_inspection=COALESCE($18,next_inspection), warranty_expiry=COALESCE($19,warranty_expiry),
       insurance_policy=COALESCE($20,insurance_policy), insurance_expiry=COALESCE($21,insurance_expiry),
       maintenance_schedule=COALESCE($22,maintenance_schedule), last_maintenance=COALESCE($23,last_maintenance),
       next_maintenance=COALESCE($24,next_maintenance), total_maintenance_cost=COALESCE($25,total_maintenance_cost),
       operating_hours=COALESCE($26,operating_hours), photos=COALESCE($27,photos), documents=COALESCE($28,documents),
       notes=COALESCE($29,notes), status=COALESCE($30,status), updated_at=NOW()
       WHERE id=$31 RETURNING *`,
      [asset_number, asset_name, asset_name_he, category, subcategory, manufacturer, model, serial_number, purchase_date, purchase_cost, current_value, depreciation_rate, location, department, assigned_to, condition, last_inspection, next_inspection, warranty_expiry, insurance_policy, insurance_expiry, maintenance_schedule, last_maintenance, next_maintenance, total_maintenance_cost, operating_hours, photos ? JSON.stringify(photos) : null, documents ? JSON.stringify(documents) : null, notes, status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "נכס לא נמצא" });
    res.json(rows[0]);
  } catch (error) {
    console.error("שגיאה בעדכון נכס:", error);
    res.status(500).json({ error: "שגיאה בעדכון נכס" });
  }
});

// מחיקה רכה של נכס
router.delete("/company-assets/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE company_assets SET status='deleted', updated_at=NOW() WHERE id=$1 RETURNING *",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "נכס לא נמצא" });
    res.json({ message: "נכס סומן כמחוק", data: rows[0] });
  } catch (error) {
    console.error("שגיאה במחיקת נכס:", error);
    res.status(500).json({ error: "שגיאה במחיקת נכס" });
  }
});

// ============================================================================
// CRUD - יומן תחזוקה
// ============================================================================

// קבלת כל רשומות התחזוקה
router.get("/asset-maintenance-log", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM asset_maintenance_log ORDER BY created_at DESC");
    res.json(rows);
  } catch (error) {
    console.error("שגיאה בשליפת יומן תחזוקה:", error);
    res.status(500).json({ error: "שגיאה בשליפת יומן תחזוקה" });
  }
});

// קבלת רשומת תחזוקה לפי מזהה
router.get("/asset-maintenance-log/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM asset_maintenance_log WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "רשומת תחזוקה לא נמצאה" });
    res.json(rows[0]);
  } catch (error) {
    console.error("שגיאה בשליפת רשומת תחזוקה:", error);
    res.status(500).json({ error: "שגיאה בשליפת רשומת תחזוקה" });
  }
});

// יצירת רשומת תחזוקה חדשה + עדכון הנכס
router.post("/asset-maintenance-log", async (req, res) => {
  try {
    const { asset_id, asset_name, maintenance_type, description, performed_by, cost, parts_used, downtime_hours, next_maintenance, notes, status } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO asset_maintenance_log (asset_id, asset_name, maintenance_type, description, performed_by, cost, parts_used, downtime_hours, next_maintenance, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [asset_id, asset_name, maintenance_type, description, performed_by, cost, JSON.stringify(parts_used || []), downtime_hours, next_maintenance, notes, status]
    );

    // עדכון הנכס עם תאריך תחזוקה אחרון ועלות מצטברת
    if (asset_id) {
      await pool.query(
        `UPDATE company_assets SET last_maintenance=NOW()::date, next_maintenance=COALESCE($1, next_maintenance),
         total_maintenance_cost = total_maintenance_cost + COALESCE($2, 0), updated_at=NOW()
         WHERE id=$3`,
        [next_maintenance, cost, asset_id]
      );
    }

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("שגיאה ביצירת רשומת תחזוקה:", error);
    res.status(500).json({ error: "שגיאה ביצירת רשומת תחזוקה" });
  }
});

// עדכון רשומת תחזוקה
router.put("/asset-maintenance-log/:id", async (req, res) => {
  try {
    const { asset_id, asset_name, maintenance_type, description, performed_by, cost, parts_used, downtime_hours, next_maintenance, notes, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE asset_maintenance_log SET asset_id=COALESCE($1,asset_id), asset_name=COALESCE($2,asset_name),
       maintenance_type=COALESCE($3,maintenance_type), description=COALESCE($4,description),
       performed_by=COALESCE($5,performed_by), cost=COALESCE($6,cost), parts_used=COALESCE($7,parts_used),
       downtime_hours=COALESCE($8,downtime_hours), next_maintenance=COALESCE($9,next_maintenance),
       notes=COALESCE($10,notes), status=COALESCE($11,status)
       WHERE id=$12 RETURNING *`,
      [asset_id, asset_name, maintenance_type, description, performed_by, cost, parts_used ? JSON.stringify(parts_used) : null, downtime_hours, next_maintenance, notes, status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "רשומת תחזוקה לא נמצאה" });
    res.json(rows[0]);
  } catch (error) {
    console.error("שגיאה בעדכון רשומת תחזוקה:", error);
    res.status(500).json({ error: "שגיאה בעדכון רשומת תחזוקה" });
  }
});

// מחיקה רכה של רשומת תחזוקה
router.delete("/asset-maintenance-log/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE asset_maintenance_log SET status='cancelled' WHERE id=$1 RETURNING *",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "רשומת תחזוקה לא נמצאה" });
    res.json({ message: "רשומת תחזוקה בוטלה", data: rows[0] });
  } catch (error) {
    console.error("שגיאה במחיקת רשומת תחזוקה:", error);
    res.status(500).json({ error: "שגיאה במחיקת רשומת תחזוקה" });
  }
});

// ============================================================================
// CRUD - צי רכבים
// ============================================================================

// קבלת כל הרכבים
router.get("/vehicle-fleet", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM vehicle_fleet WHERE status != 'deleted' ORDER BY created_at DESC");
    res.json(rows);
  } catch (error) {
    console.error("שגיאה בשליפת צי רכבים:", error);
    res.status(500).json({ error: "שגיאה בשליפת צי רכבים" });
  }
});

// קבלת רכב לפי מזהה
router.get("/vehicle-fleet/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM vehicle_fleet WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "רכב לא נמצא" });
    res.json(rows[0]);
  } catch (error) {
    console.error("שגיאה בשליפת רכב:", error);
    res.status(500).json({ error: "שגיאה בשליפת רכב" });
  }
});

// יצירת רכב חדש
router.post("/vehicle-fleet", async (req, res) => {
  try {
    const { vehicle_number, vehicle_type, make, model, year, license_plate, assigned_to, department, fuel_type, odometer_km, insurance_expiry, test_date, next_test, monthly_cost, fuel_cost_monthly, status, notes } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO vehicle_fleet (vehicle_number, vehicle_type, make, model, year, license_plate, assigned_to, department, fuel_type, odometer_km, insurance_expiry, test_date, next_test, monthly_cost, fuel_cost_monthly, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [vehicle_number, vehicle_type, make, model, year, license_plate, assigned_to, department, fuel_type, odometer_km, insurance_expiry, test_date, next_test, monthly_cost, fuel_cost_monthly, status, notes]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("שגיאה ביצירת רכב:", error);
    res.status(500).json({ error: "שגיאה ביצירת רכב" });
  }
});

// עדכון רכב
router.put("/vehicle-fleet/:id", async (req, res) => {
  try {
    const { vehicle_number, vehicle_type, make, model, year, license_plate, assigned_to, department, fuel_type, odometer_km, insurance_expiry, test_date, next_test, monthly_cost, fuel_cost_monthly, status, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE vehicle_fleet SET vehicle_number=COALESCE($1,vehicle_number), vehicle_type=COALESCE($2,vehicle_type),
       make=COALESCE($3,make), model=COALESCE($4,model), year=COALESCE($5,year), license_plate=COALESCE($6,license_plate),
       assigned_to=COALESCE($7,assigned_to), department=COALESCE($8,department), fuel_type=COALESCE($9,fuel_type),
       odometer_km=COALESCE($10,odometer_km), insurance_expiry=COALESCE($11,insurance_expiry),
       test_date=COALESCE($12,test_date), next_test=COALESCE($13,next_test), monthly_cost=COALESCE($14,monthly_cost),
       fuel_cost_monthly=COALESCE($15,fuel_cost_monthly), status=COALESCE($16,status), notes=COALESCE($17,notes),
       updated_at=NOW() WHERE id=$18 RETURNING *`,
      [vehicle_number, vehicle_type, make, model, year, license_plate, assigned_to, department, fuel_type, odometer_km, insurance_expiry, test_date, next_test, monthly_cost, fuel_cost_monthly, status, notes, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "רכב לא נמצא" });
    res.json(rows[0]);
  } catch (error) {
    console.error("שגיאה בעדכון רכב:", error);
    res.status(500).json({ error: "שגיאה בעדכון רכב" });
  }
});

// מחיקה רכה של רכב
router.delete("/vehicle-fleet/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE vehicle_fleet SET status='deleted', updated_at=NOW() WHERE id=$1 RETURNING *",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "רכב לא נמצא" });
    res.json({ message: "רכב סומן כמחוק", data: rows[0] });
  } catch (error) {
    console.error("שגיאה במחיקת רכב:", error);
    res.status(500).json({ error: "שגיאה במחיקת רכב" });
  }
});

// ============================================================================
// דשבורד נכסים - ערך כולל, פחת, תחזוקה וביטוחים
// ============================================================================
router.get("/asset-management/assets-dashboard", async (_req, res) => {
  try {
    // סיכום נכסים כולל
    const assetSummary = await pool.query(`
      SELECT COUNT(*) as total_assets,
             SUM(purchase_cost) as total_purchase_cost,
             SUM(current_value) as total_current_value,
             SUM(purchase_cost) - SUM(current_value) as total_depreciation,
             SUM(total_maintenance_cost) as total_maintenance_cost,
             COUNT(*) FILTER (WHERE condition = 'good') as good_condition,
             COUNT(*) FILTER (WHERE condition = 'fair') as fair_condition,
             COUNT(*) FILTER (WHERE condition = 'poor') as poor_condition,
             COUNT(*) FILTER (WHERE condition = 'broken') as broken
      FROM company_assets
      WHERE status = 'active'
    `);

    // נכסים לפי קטגוריה
    const byCategory = await pool.query(`
      SELECT category,
             COUNT(*) as count,
             SUM(current_value) as total_value,
             SUM(total_maintenance_cost) as maintenance_cost
      FROM company_assets
      WHERE status = 'active'
      GROUP BY category
      ORDER BY total_value DESC NULLS LAST
    `);

    // תחזוקה קרובה - ב-30 ימים הקרובים
    const maintenanceDue = await pool.query(`
      SELECT id, asset_number, asset_name, asset_name_he, next_maintenance, maintenance_schedule, condition
      FROM company_assets
      WHERE status = 'active' AND next_maintenance IS NOT NULL AND next_maintenance <= NOW()::date + INTERVAL '30 days'
      ORDER BY next_maintenance ASC
    `);

    // ביטוחים שפגים בקרוב - ב-60 ימים הקרובים
    const insuranceExpiring = await pool.query(`
      SELECT id, asset_number, asset_name, asset_name_he, insurance_policy, insurance_expiry
      FROM company_assets
      WHERE status = 'active' AND insurance_expiry IS NOT NULL AND insurance_expiry <= NOW()::date + INTERVAL '60 days'
      ORDER BY insurance_expiry ASC
    `);

    // אחריות שפגה
    const warrantyExpiring = await pool.query(`
      SELECT id, asset_number, asset_name, asset_name_he, warranty_expiry, manufacturer
      FROM company_assets
      WHERE status = 'active' AND warranty_expiry IS NOT NULL AND warranty_expiry <= NOW()::date + INTERVAL '60 days'
      ORDER BY warranty_expiry ASC
    `);

    // סיכום צי רכבים
    const fleetSummary = await pool.query(`
      SELECT COUNT(*) as total_vehicles,
             SUM(monthly_cost) as total_monthly_cost,
             SUM(fuel_cost_monthly) as total_fuel_cost,
             COUNT(*) FILTER (WHERE insurance_expiry IS NOT NULL AND insurance_expiry <= NOW()::date + INTERVAL '30 days') as insurance_expiring_soon
      FROM vehicle_fleet
      WHERE status = 'active'
    `);

    res.json({
      asset_summary: assetSummary.rows[0],
      by_category: byCategory.rows,
      maintenance_due: maintenanceDue.rows,
      insurance_expiring: insuranceExpiring.rows,
      warranty_expiring: warrantyExpiring.rows,
      fleet_summary: fleetSummary.rows[0]
    });
  } catch (error) {
    console.error("שגיאה בטעינת דשבורד נכסים:", error);
    res.status(500).json({ error: "שגיאה בטעינת דשבורד נכסים" });
  }
});

// ============================================================================
// לוח תחזוקה - תחזוקות קרובות וממתינות
// ============================================================================
router.get("/asset-management/maintenance-schedule", async (_req, res) => {
  try {
    // תחזוקות שעברו את מועדן
    const overdue = await pool.query(`
      SELECT id, asset_number, asset_name, asset_name_he, next_maintenance, maintenance_schedule, condition, assigned_to, location
      FROM company_assets
      WHERE status = 'active' AND next_maintenance IS NOT NULL AND next_maintenance < NOW()::date
      ORDER BY next_maintenance ASC
    `);

    // תחזוקות ב-7 ימים הקרובים
    const thisWeek = await pool.query(`
      SELECT id, asset_number, asset_name, asset_name_he, next_maintenance, maintenance_schedule, condition, assigned_to, location
      FROM company_assets
      WHERE status = 'active' AND next_maintenance IS NOT NULL AND next_maintenance BETWEEN NOW()::date AND NOW()::date + INTERVAL '7 days'
      ORDER BY next_maintenance ASC
    `);

    // תחזוקות ב-30 ימים הקרובים
    const thisMonth = await pool.query(`
      SELECT id, asset_number, asset_name, asset_name_he, next_maintenance, maintenance_schedule, condition, assigned_to, location
      FROM company_assets
      WHERE status = 'active' AND next_maintenance IS NOT NULL AND next_maintenance BETWEEN NOW()::date + INTERVAL '7 days' AND NOW()::date + INTERVAL '30 days'
      ORDER BY next_maintenance ASC
    `);

    // היסטוריית תחזוקה אחרונה
    const recentMaintenance = await pool.query(`
      SELECT * FROM asset_maintenance_log
      ORDER BY created_at DESC
      LIMIT 20
    `);

    // עלויות תחזוקה החודש
    const monthlyCost = await pool.query(`
      SELECT SUM(cost) as total_cost, COUNT(*) as total_jobs
      FROM asset_maintenance_log
      WHERE created_at >= DATE_TRUNC('month', NOW())
    `);

    res.json({
      overdue: overdue.rows,
      this_week: thisWeek.rows,
      this_month: thisMonth.rows,
      recent_maintenance: recentMaintenance.rows,
      monthly_cost: monthlyCost.rows[0],
      summary: {
        overdue_count: overdue.rows.length,
        this_week_count: thisWeek.rows.length,
        this_month_count: thisMonth.rows.length
      }
    });
  } catch (error) {
    console.error("שגיאה בטעינת לוח תחזוקה:", error);
    res.status(500).json({ error: "שגיאה בטעינת לוח תחזוקה" });
  }
});

// ============================================================================
// דוח פחת - כל הנכסים עם חישוב פחת
// ============================================================================
router.get("/asset-management/depreciation-report", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, asset_number, asset_name, asset_name_he, category, purchase_date, purchase_cost, current_value,
             depreciation_rate,
             CASE WHEN purchase_cost > 0 THEN ROUND(purchase_cost - current_value, 2) ELSE 0 END as total_depreciation,
             CASE WHEN purchase_cost > 0 AND depreciation_rate > 0
               THEN ROUND((purchase_cost - current_value) / purchase_cost * 100, 2) ELSE 0 END as depreciation_percent,
             CASE WHEN depreciation_rate > 0 AND current_value > 0
               THEN ROUND(current_value * depreciation_rate / 100, 2) ELSE 0 END as annual_depreciation,
             CASE WHEN depreciation_rate > 0 AND current_value > 0
               THEN CEIL(current_value / (purchase_cost * depreciation_rate / 100)) ELSE NULL END as years_remaining
      FROM company_assets
      WHERE status = 'active' AND purchase_cost IS NOT NULL
      ORDER BY purchase_cost DESC NULLS LAST
    `);

    // סיכום כולל
    const totals = rows.reduce((acc: any, row: any) => ({
      total_purchase: acc.total_purchase + (Number(row.purchase_cost) || 0),
      total_current: acc.total_current + (Number(row.current_value) || 0),
      total_depreciation: acc.total_depreciation + (Number(row.total_depreciation) || 0),
      total_annual_depreciation: acc.total_annual_depreciation + (Number(row.annual_depreciation) || 0)
    }), { total_purchase: 0, total_current: 0, total_depreciation: 0, total_annual_depreciation: 0 });

    res.json({
      assets: rows,
      totals,
      depreciation_rate_avg: rows.length > 0
        ? Math.round(rows.reduce((sum: number, r: any) => sum + (Number(r.depreciation_rate) || 0), 0) / rows.length * 100) / 100
        : 0
    });
  } catch (error) {
    console.error("שגיאה בטעינת דוח פחת:", error);
    res.status(500).json({ error: "שגיאה בטעינת דוח פחת" });
  }
});

// ============================================================================
// סטטוס צי רכבים - כל הרכבים עם פרטים מלאים
// ============================================================================
router.get("/asset-management/vehicle-fleet-status", async (_req, res) => {
  try {
    const { rows: vehicles } = await pool.query(`
      SELECT *,
             CASE WHEN insurance_expiry IS NOT NULL AND insurance_expiry < NOW()::date THEN true ELSE false END as insurance_expired,
             CASE WHEN next_test IS NOT NULL AND next_test < NOW()::date THEN true ELSE false END as test_overdue,
             monthly_cost + fuel_cost_monthly as total_monthly_cost
      FROM vehicle_fleet
      WHERE status != 'deleted'
      ORDER BY status, make, model
    `);

    // סיכום
    const summary = await pool.query(`
      SELECT COUNT(*) as total,
             COUNT(*) FILTER (WHERE status = 'active') as active,
             COUNT(*) FILTER (WHERE status = 'maintenance') as in_maintenance,
             COUNT(*) FILTER (WHERE status = 'inactive') as inactive,
             SUM(monthly_cost) as total_monthly_cost,
             SUM(fuel_cost_monthly) as total_fuel_cost,
             SUM(monthly_cost + fuel_cost_monthly) as total_fleet_cost,
             AVG(odometer_km) as avg_odometer
      FROM vehicle_fleet
      WHERE status != 'deleted'
    `);

    // לפי סוג דלק
    const byFuelType = await pool.query(`
      SELECT fuel_type, COUNT(*) as count, SUM(fuel_cost_monthly) as total_fuel_cost
      FROM vehicle_fleet
      WHERE status = 'active'
      GROUP BY fuel_type
    `);

    // טסטים קרובים
    const upcomingTests = await pool.query(`
      SELECT vehicle_number, make, model, license_plate, next_test, assigned_to
      FROM vehicle_fleet
      WHERE status = 'active' AND next_test IS NOT NULL AND next_test <= NOW()::date + INTERVAL '60 days'
      ORDER BY next_test ASC
    `);

    res.json({
      vehicles,
      summary: summary.rows[0],
      by_fuel_type: byFuelType.rows,
      upcoming_tests: upcomingTests.rows
    });
  } catch (error) {
    console.error("שגיאה בטעינת סטטוס צי רכבים:", error);
    res.status(500).json({ error: "שגיאה בטעינת סטטוס צי רכבים" });
  }
});

// ============================================================================
// התראות ביטוח - ביטוחים שעומדים לפוג לנכסים ורכבים
// ============================================================================
router.get("/asset-management/insurance-expiry-alerts", async (_req, res) => {
  try {
    // ביטוחי נכסים שפגו
    const expiredAssets = await pool.query(`
      SELECT id, asset_number, asset_name, asset_name_he, insurance_policy, insurance_expiry, category, location,
             'expired' as alert_type
      FROM company_assets
      WHERE status = 'active' AND insurance_expiry IS NOT NULL AND insurance_expiry < NOW()::date
      ORDER BY insurance_expiry ASC
    `);

    // ביטוחי נכסים שפגים ב-30 יום
    const expiringSoonAssets = await pool.query(`
      SELECT id, asset_number, asset_name, asset_name_he, insurance_policy, insurance_expiry, category, location,
             'expiring_soon' as alert_type
      FROM company_assets
      WHERE status = 'active' AND insurance_expiry IS NOT NULL
        AND insurance_expiry BETWEEN NOW()::date AND NOW()::date + INTERVAL '30 days'
      ORDER BY insurance_expiry ASC
    `);

    // ביטוחי נכסים שפגים ב-60 יום
    const expiringAssets = await pool.query(`
      SELECT id, asset_number, asset_name, asset_name_he, insurance_policy, insurance_expiry, category, location,
             'expiring' as alert_type
      FROM company_assets
      WHERE status = 'active' AND insurance_expiry IS NOT NULL
        AND insurance_expiry BETWEEN NOW()::date + INTERVAL '30 days' AND NOW()::date + INTERVAL '60 days'
      ORDER BY insurance_expiry ASC
    `);

    // ביטוחי רכבים שפגו או פגים בקרוב
    const vehicleInsurance = await pool.query(`
      SELECT id, vehicle_number, make, model, license_plate, insurance_expiry, assigned_to,
             CASE
               WHEN insurance_expiry < NOW()::date THEN 'expired'
               WHEN insurance_expiry <= NOW()::date + INTERVAL '30 days' THEN 'expiring_soon'
               ELSE 'expiring'
             END as alert_type
      FROM vehicle_fleet
      WHERE status = 'active' AND insurance_expiry IS NOT NULL
        AND insurance_expiry <= NOW()::date + INTERVAL '60 days'
      ORDER BY insurance_expiry ASC
    `);

    res.json({
      assets_expired: expiredAssets.rows,
      assets_expiring_soon: expiringSoonAssets.rows,
      assets_expiring: expiringAssets.rows,
      vehicles: vehicleInsurance.rows,
      summary: {
        total_expired: expiredAssets.rows.length + vehicleInsurance.rows.filter((v: any) => v.alert_type === 'expired').length,
        total_expiring_soon: expiringSoonAssets.rows.length + vehicleInsurance.rows.filter((v: any) => v.alert_type === 'expiring_soon').length,
        total_expiring: expiringAssets.rows.length + vehicleInsurance.rows.filter((v: any) => v.alert_type === 'expiring').length,
        requires_immediate_action: expiredAssets.rows.length + vehicleInsurance.rows.filter((v: any) => v.alert_type === 'expired').length
      }
    });
  } catch (error) {
    console.error("שגיאה בטעינת התראות ביטוח:", error);
    res.status(500).json({ error: "שגיאה בטעינת התראות ביטוח" });
  }
});

export default router;
