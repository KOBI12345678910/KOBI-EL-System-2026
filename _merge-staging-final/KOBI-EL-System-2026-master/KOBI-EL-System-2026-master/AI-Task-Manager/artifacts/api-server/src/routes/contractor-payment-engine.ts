/**
 * ============================================================
 * מנוע תשלומים חכם לקבלנים - Contractor Payment Engine
 * ============================================================
 * מחשב תשלומים לקבלנים (מתקינים, עובדי ייצור, סוכני מכירות, צבעים, מודדים)
 * שני מודלים: למטר מרובע או לפי אחוזים מהפרויקט
 * המערכת ממליצה על המודל הזול יותר עבור החברה
 * ============================================================
 */

import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";
import { VAT_RATE } from "../constants";

const router = Router();

// ===== קבועים =====
const SALES_AGENT_COMMISSION = 0.075; // עמלת סוכן מכירות 7.5%
const SALES_AGENT_BONUS = 0.025; // בונוס סוכן מכירות 2.5% אם עמד ביעד
const DEFAULT_PAINTER_RATE_SQM = 55; // תעריף ברירת מחדל לצבע - 55 ש"ח למ"ר

// ===== POST /init - יצירת טבלאות וזריעת נתונים =====
router.post("/init", async (req: Request, res: Response) => {
  try {
    // יצירת טבלת פרופילי קבלנים
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contractor_profiles (
        id SERIAL PRIMARY KEY,
        contractor_id VARCHAR(50) UNIQUE,
        full_name VARCHAR(255),
        phone VARCHAR(50),
        email VARCHAR(100),
        id_number VARCHAR(20),
        contractor_type VARCHAR(50),
        rate_per_sqm NUMERIC(10,2),
        rate_percentage NUMERIC(5,2),
        bonus_percentage NUMERIC(5,2) DEFAULT 0,
        bonus_threshold NUMERIC(15,2),
        bank_name VARCHAR(100),
        bank_branch VARCHAR(20),
        bank_account VARCHAR(30),
        tax_id VARCHAR(20),
        withholding_rate NUMERIC(5,2) DEFAULT 0,
        contract_start DATE,
        contract_end DATE,
        documents JSONB DEFAULT '[]',
        status VARCHAR(20) DEFAULT 'active',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // יצירת טבלת פרויקטים של קבלנים
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contractor_projects (
        id SERIAL PRIMARY KEY,
        contractor_id INTEGER,
        project_id INTEGER,
        project_name VARCHAR(255),
        customer_name VARCHAR(255),
        role VARCHAR(50),
        total_sqm NUMERIC(10,2),
        project_amount_no_vat NUMERIC(15,2),
        payment_model VARCHAR(20),
        rate_used NUMERIC(10,2),
        calculated_amount_sqm NUMERIC(15,2),
        calculated_amount_pct NUMERIC(15,2),
        recommended_model VARCHAR(20),
        company_savings NUMERIC(15,2),
        final_amount NUMERIC(15,2),
        vat_amount NUMERIC(15,2),
        total_with_vat NUMERIC(15,2),
        approved BOOLEAN DEFAULT false,
        approved_by VARCHAR(255),
        approved_at TIMESTAMPTZ,
        paid BOOLEAN DEFAULT false,
        paid_date DATE,
        invoice_number VARCHAR(50),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // יצירת טבלת סיכום חודשי
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contractor_monthly_summary (
        id SERIAL PRIMARY KEY,
        contractor_id INTEGER,
        month VARCHAR(7),
        year INTEGER,
        total_projects INTEGER DEFAULT 0,
        total_sqm NUMERIC(10,2) DEFAULT 0,
        total_amount_no_vat NUMERIC(15,2) DEFAULT 0,
        vat_amount NUMERIC(15,2) DEFAULT 0,
        total_with_vat NUMERIC(15,2) DEFAULT 0,
        withholding_tax NUMERIC(15,2) DEFAULT 0,
        net_payment NUMERIC(15,2) DEFAULT 0,
        bonus_earned NUMERIC(15,2) DEFAULT 0,
        met_target BOOLEAN DEFAULT false,
        payment_status VARCHAR(20) DEFAULT 'pending',
        payment_date DATE,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // זריעת 5 קבלנים - אחד מכל סוג
    const seedContractors = [
      {
        contractor_id: "CON-001",
        full_name: "יוסי כהן",
        phone: "050-1234567",
        email: "yossi@example.com",
        id_number: "123456789",
        contractor_type: "production_worker",
        rate_per_sqm: 45,
        rate_percentage: 8,
        bonus_percentage: 2,
        bonus_threshold: 50000,
        bank_name: "בנק הפועלים",
        bank_branch: "123",
        bank_account: "456789",
        tax_id: "514123456",
        withholding_rate: 20,
      },
      {
        contractor_id: "CON-002",
        full_name: "משה לוי",
        phone: "050-2345678",
        email: "moshe@example.com",
        id_number: "234567890",
        contractor_type: "installer",
        rate_per_sqm: 60,
        rate_percentage: 10,
        bonus_percentage: 1.5,
        bonus_threshold: 60000,
        bank_name: "בנק לאומי",
        bank_branch: "456",
        bank_account: "789012",
        tax_id: "514234567",
        withholding_rate: 15,
      },
      {
        contractor_id: "CON-003",
        full_name: "דנה אברהם",
        phone: "050-3456789",
        email: "dana@example.com",
        id_number: "345678901",
        contractor_type: "sales_agent",
        rate_per_sqm: 0,
        rate_percentage: 7.5,
        bonus_percentage: 2.5,
        bonus_threshold: 100000,
        bank_name: "בנק דיסקונט",
        bank_branch: "789",
        bank_account: "012345",
        tax_id: "514345678",
        withholding_rate: 10,
      },
      {
        contractor_id: "CON-004",
        full_name: "אבי מזרחי",
        phone: "050-4567890",
        email: "avi@example.com",
        id_number: "456789012",
        contractor_type: "painter",
        rate_per_sqm: 55,
        rate_percentage: 0,
        bonus_percentage: 0,
        bonus_threshold: 0,
        bank_name: "בנק מזרחי טפחות",
        bank_branch: "012",
        bank_account: "345678",
        tax_id: "514456789",
        withholding_rate: 25,
      },
      {
        contractor_id: "CON-005",
        full_name: "רונית שפירא",
        phone: "050-5678901",
        email: "ronit@example.com",
        id_number: "567890123",
        contractor_type: "measurer",
        rate_per_sqm: 30,
        rate_percentage: 5,
        bonus_percentage: 1,
        bonus_threshold: 40000,
        bank_name: "בנק הבינלאומי",
        bank_branch: "345",
        bank_account: "678901",
        tax_id: "514567890",
        withholding_rate: 18,
      },
    ];

    for (const c of seedContractors) {
      await pool.query(
        `INSERT INTO contractor_profiles
          (contractor_id, full_name, phone, email, id_number, contractor_type,
           rate_per_sqm, rate_percentage, bonus_percentage, bonus_threshold,
           bank_name, bank_branch, bank_account, tax_id, withholding_rate, contract_start)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, NOW())
         ON CONFLICT (contractor_id) DO NOTHING`,
        [
          c.contractor_id, c.full_name, c.phone, c.email, c.id_number, c.contractor_type,
          c.rate_per_sqm, c.rate_percentage, c.bonus_percentage, c.bonus_threshold,
          c.bank_name, c.bank_branch, c.bank_account, c.tax_id, c.withholding_rate,
        ]
      );
    }

    res.json({
      success: true,
      message: "טבלאות קבלנים נוצרו בהצלחה ו-5 קבלנים נזרעו",
      tables: ["contractor_profiles", "contractor_projects", "contractor_monthly_summary"],
      seeded_contractors: seedContractors.length,
    });
  } catch (error: any) {
    console.error("שגיאה באתחול מנוע תשלומי קבלנים:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== CRUD - קבלנים =====

// קבלת כל הקבלנים
router.get("/contractors", async (req: Request, res: Response) => {
  try {
    const { status, contractor_type } = req.query;
    let query = `SELECT * FROM contractor_profiles WHERE 1=1`;
    const params: any[] = [];

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }
    if (contractor_type) {
      params.push(contractor_type);
      query += ` AND contractor_type = $${params.length}`;
    }

    query += ` ORDER BY full_name ASC`;
    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length,
    });
  } catch (error: any) {
    console.error("שגיאה בשליפת קבלנים:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// קבלת קבלן לפי ID
router.get("/contractors/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`SELECT * FROM contractor_profiles WHERE id = $1`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "קבלן לא נמצא" });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה בשליפת קבלן:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// יצירת קבלן חדש
router.post("/contractors", async (req: Request, res: Response) => {
  try {
    const {
      contractor_id, full_name, phone, email, id_number, contractor_type,
      rate_per_sqm, rate_percentage, bonus_percentage, bonus_threshold,
      bank_name, bank_branch, bank_account, tax_id, withholding_rate,
      contract_start, contract_end, notes,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO contractor_profiles
        (contractor_id, full_name, phone, email, id_number, contractor_type,
         rate_per_sqm, rate_percentage, bonus_percentage, bonus_threshold,
         bank_name, bank_branch, bank_account, tax_id, withholding_rate,
         contract_start, contract_end, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [
        contractor_id, full_name, phone, email, id_number, contractor_type,
        rate_per_sqm || 0, rate_percentage || 0, bonus_percentage || 0, bonus_threshold || 0,
        bank_name, bank_branch, bank_account, tax_id, withholding_rate || 0,
        contract_start, contract_end, notes,
      ]
    );

    res.status(201).json({
      success: true,
      message: "קבלן נוצר בהצלחה",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("שגיאה ביצירת קבלן:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// עדכון קבלן
router.put("/contractors/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;

    // בניית שאילתת עדכון דינמית
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(fields)) {
      if (key === "id") continue; // לא מעדכנים ID
      setClauses.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE contractor_profiles SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "קבלן לא נמצא" });
    }

    res.json({
      success: true,
      message: "קבלן עודכן בהצלחה",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("שגיאה בעדכון קבלן:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// מחיקה רכה - שינוי סטטוס ל-inactive (לעולם לא מוחקים!)
router.delete("/contractors/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE contractor_profiles SET status = 'inactive', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "קבלן לא נמצא" });
    }

    res.json({
      success: true,
      message: "קבלן הועבר למצב לא פעיל (לא נמחק - רק שינוי סטטוס)",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("שגיאה בביטול קבלן:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== POST /calculate-payment - חישוב תשלום חכם =====
router.post("/calculate-payment", async (req: Request, res: Response) => {
  try {
    const { contractor_id, total_sqm, project_amount_no_vat } = req.body;

    // שליפת פרטי הקבלן
    const contractorResult = await pool.query(
      `SELECT * FROM contractor_profiles WHERE id = $1`,
      [contractor_id]
    );

    if (contractorResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: "קבלן לא נמצא" });
    }

    const contractor = contractorResult.rows[0];
    const { contractor_type, rate_per_sqm, rate_percentage } = contractor;

    let calculated_amount_sqm = 0;
    let calculated_amount_pct = 0;
    let recommended_model = "";
    let company_savings = 0;
    let final_amount = 0;

    if (contractor_type === "sales_agent") {
      // סוכן מכירות - תמיד לפי אחוזים (7.5%)
      calculated_amount_pct = project_amount_no_vat * SALES_AGENT_COMMISSION;
      calculated_amount_sqm = 0; // לא רלוונטי לסוכן מכירות
      recommended_model = "percentage";
      final_amount = calculated_amount_pct;
      company_savings = 0; // אין השוואה - מודל יחיד
    } else if (contractor_type === "painter") {
      // צבע - תמיד למ"ר (ברירת מחדל 55 ש"ח)
      const painterRate = rate_per_sqm > 0 ? rate_per_sqm : DEFAULT_PAINTER_RATE_SQM;
      calculated_amount_sqm = total_sqm * painterRate;
      calculated_amount_pct = 0; // לא רלוונטי לצבע
      recommended_model = "per_sqm";
      final_amount = calculated_amount_sqm;
      company_savings = 0; // אין השוואה - מודל יחיד
    } else {
      // עובד ייצור / מתקין / מודד - חישוב שני המודלים
      calculated_amount_sqm = total_sqm * rate_per_sqm;
      calculated_amount_pct = project_amount_no_vat * (rate_percentage / 100);

      // המערכת ממליצה על המודל הזול יותר עבור החברה
      if (calculated_amount_sqm <= calculated_amount_pct) {
        recommended_model = "per_sqm";
        final_amount = calculated_amount_sqm;
        company_savings = calculated_amount_pct - calculated_amount_sqm;
      } else {
        recommended_model = "percentage";
        final_amount = calculated_amount_pct;
        company_savings = calculated_amount_sqm - calculated_amount_pct;
      }
    }

    // חישוב מע"מ
    const vat_amount = final_amount * VAT_RATE;
    const total_with_vat = final_amount + vat_amount;

    res.json({
      success: true,
      message: "חישוב תשלום הושלם",
      data: {
        contractor: {
          id: contractor.id,
          full_name: contractor.full_name,
          contractor_type,
        },
        project: {
          total_sqm,
          project_amount_no_vat,
        },
        calculation: {
          // חישוב למ"ר
          calculated_amount_sqm: parseFloat(calculated_amount_sqm.toFixed(2)),
          rate_per_sqm: contractor_type === "painter"
            ? (rate_per_sqm > 0 ? rate_per_sqm : DEFAULT_PAINTER_RATE_SQM)
            : rate_per_sqm,
          // חישוב לפי אחוזים
          calculated_amount_pct: parseFloat(calculated_amount_pct.toFixed(2)),
          rate_percentage,
          // המלצה
          recommended_model,
          company_savings: parseFloat(company_savings.toFixed(2)),
          // סכומים סופיים
          final_amount: parseFloat(final_amount.toFixed(2)),
          vat_amount: parseFloat(vat_amount.toFixed(2)),
          total_with_vat: parseFloat(total_with_vat.toFixed(2)),
        },
        explanation:
          contractor_type === "sales_agent"
            ? `סוכן מכירות - עמלה קבועה ${SALES_AGENT_COMMISSION * 100}%`
            : contractor_type === "painter"
            ? `צבע - תעריף קבוע למ"ר`
            : `המודל המומלץ לחברה: ${recommended_model === "per_sqm" ? "למטר מרובע" : "לפי אחוזים"} - חיסכון של ${company_savings.toFixed(2)} ש"ח`,
      },
    });
  } catch (error: any) {
    console.error("שגיאה בחישוב תשלום:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== POST /assign-project - שיוך קבלן לפרויקט =====
router.post("/assign-project", async (req: Request, res: Response) => {
  try {
    const {
      contractor_id, project_id, project_name, customer_name, role,
      total_sqm, project_amount_no_vat, payment_model, notes,
    } = req.body;

    // שליפת פרטי הקבלן
    const contractorResult = await pool.query(
      `SELECT * FROM contractor_profiles WHERE id = $1`,
      [contractor_id]
    );

    if (contractorResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: "קבלן לא נמצא" });
    }

    const contractor = contractorResult.rows[0];
    const { contractor_type, rate_per_sqm, rate_percentage } = contractor;

    // חישוב שני המודלים
    let calculated_amount_sqm = 0;
    let calculated_amount_pct = 0;
    let recommended_model = "";
    let company_savings = 0;
    let final_amount = 0;
    let rate_used = 0;

    if (contractor_type === "sales_agent") {
      calculated_amount_pct = project_amount_no_vat * SALES_AGENT_COMMISSION;
      recommended_model = "percentage";
      final_amount = calculated_amount_pct;
      rate_used = SALES_AGENT_COMMISSION * 100;
    } else if (contractor_type === "painter") {
      const painterRate = rate_per_sqm > 0 ? rate_per_sqm : DEFAULT_PAINTER_RATE_SQM;
      calculated_amount_sqm = total_sqm * painterRate;
      recommended_model = "per_sqm";
      final_amount = calculated_amount_sqm;
      rate_used = painterRate;
    } else {
      calculated_amount_sqm = total_sqm * rate_per_sqm;
      calculated_amount_pct = project_amount_no_vat * (rate_percentage / 100);

      if (calculated_amount_sqm <= calculated_amount_pct) {
        recommended_model = "per_sqm";
      } else {
        recommended_model = "percentage";
      }

      // אם המשתמש בחר מודל ספציפי, נשתמש בו; אחרת נשתמש בהמלצה
      const chosenModel = payment_model || recommended_model;

      if (chosenModel === "per_sqm") {
        final_amount = calculated_amount_sqm;
        rate_used = rate_per_sqm;
      } else {
        final_amount = calculated_amount_pct;
        rate_used = rate_percentage;
      }

      company_savings = Math.abs(calculated_amount_sqm - calculated_amount_pct);
    }

    const vat_amount = final_amount * VAT_RATE;
    const total_with_vat = final_amount + vat_amount;

    const result = await pool.query(
      `INSERT INTO contractor_projects
        (contractor_id, project_id, project_name, customer_name, role,
         total_sqm, project_amount_no_vat, payment_model, rate_used,
         calculated_amount_sqm, calculated_amount_pct, recommended_model,
         company_savings, final_amount, vat_amount, total_with_vat, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        contractor_id, project_id, project_name, customer_name,
        role || contractor_type, total_sqm, project_amount_no_vat,
        payment_model || recommended_model, rate_used,
        parseFloat(calculated_amount_sqm.toFixed(2)),
        parseFloat(calculated_amount_pct.toFixed(2)),
        recommended_model,
        parseFloat(company_savings.toFixed(2)),
        parseFloat(final_amount.toFixed(2)),
        parseFloat(vat_amount.toFixed(2)),
        parseFloat(total_with_vat.toFixed(2)),
        notes,
      ]
    );

    res.status(201).json({
      success: true,
      message: "קבלן שויך לפרויקט בהצלחה",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("שגיאה בשיוך קבלן לפרויקט:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== GET /monthly-summary/:contractorId/:month - סיכום חודשי לקבלן =====
router.get("/monthly-summary/:contractorId/:month", async (req: Request, res: Response) => {
  try {
    const { contractorId, month } = req.params;

    // שליפת סיכום חודשי קיים
    const summaryResult = await pool.query(
      `SELECT cms.*, cp.full_name, cp.contractor_type, cp.contractor_id as contractor_code
       FROM contractor_monthly_summary cms
       JOIN contractor_profiles cp ON cp.id = cms.contractor_id
       WHERE cms.contractor_id = $1 AND cms.month = $2`,
      [contractorId, month]
    );

    if (summaryResult.rows.length === 0) {
      // אם אין סיכום - נחשב מהפרויקטים
      const projectsResult = await pool.query(
        `SELECT * FROM contractor_projects
         WHERE contractor_id = $1 AND TO_CHAR(created_at, 'YYYY-MM') = $2`,
        [contractorId, month]
      );

      const contractorResult = await pool.query(
        `SELECT * FROM contractor_profiles WHERE id = $1`,
        [contractorId]
      );

      if (contractorResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: "קבלן לא נמצא" });
      }

      const contractor = contractorResult.rows[0];
      const projects = projectsResult.rows;

      // חישוב סיכום
      const total_projects = projects.length;
      const total_sqm = projects.reduce((sum: number, p: any) => sum + parseFloat(p.total_sqm || 0), 0);
      const total_amount_no_vat = projects.reduce((sum: number, p: any) => sum + parseFloat(p.final_amount || 0), 0);
      const vat_amount = total_amount_no_vat * VAT_RATE;
      const total_with_vat = total_amount_no_vat + vat_amount;
      const withholding_tax = total_amount_no_vat * (parseFloat(contractor.withholding_rate) / 100);
      const net_payment = total_with_vat - withholding_tax;

      // בדיקת בונוס - האם עמד ביעד
      const met_target = total_amount_no_vat >= parseFloat(contractor.bonus_threshold || 0);
      let bonus_earned = 0;

      if (met_target && parseFloat(contractor.bonus_percentage) > 0) {
        bonus_earned = total_amount_no_vat * (parseFloat(contractor.bonus_percentage) / 100);
      }

      // בונוס סוכן מכירות - 2.5% נוסף אם עמד ביעד
      if (contractor.contractor_type === "sales_agent" && met_target) {
        bonus_earned = total_amount_no_vat * SALES_AGENT_BONUS;
      }

      return res.json({
        success: true,
        message: "סיכום חודשי מחושב (לא נשמר עדיין)",
        data: {
          contractor: {
            id: contractor.id,
            full_name: contractor.full_name,
            contractor_type: contractor.contractor_type,
          },
          month,
          total_projects,
          total_sqm: parseFloat(total_sqm.toFixed(2)),
          total_amount_no_vat: parseFloat(total_amount_no_vat.toFixed(2)),
          vat_amount: parseFloat(vat_amount.toFixed(2)),
          total_with_vat: parseFloat(total_with_vat.toFixed(2)),
          withholding_tax: parseFloat(withholding_tax.toFixed(2)),
          net_payment: parseFloat((net_payment + bonus_earned).toFixed(2)),
          bonus_earned: parseFloat(bonus_earned.toFixed(2)),
          met_target,
          projects,
        },
      });
    }

    res.json({
      success: true,
      data: summaryResult.rows[0],
    });
  } catch (error: any) {
    console.error("שגיאה בשליפת סיכום חודשי:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== POST /generate-monthly-summary/:month - יצירת סיכומים חודשיים לכל הקבלנים =====
router.post("/generate-monthly-summary/:month", async (req: Request, res: Response) => {
  try {
    const { month } = req.params; // פורמט: YYYY-MM
    const year = parseInt(month.split("-")[0]);

    // שליפת כל הקבלנים הפעילים
    const contractorsResult = await pool.query(
      `SELECT * FROM contractor_profiles WHERE status = 'active'`
    );

    const summaries: any[] = [];

    for (const contractor of contractorsResult.rows) {
      // שליפת פרויקטים של הקבלן בחודש הנתון
      const projectsResult = await pool.query(
        `SELECT * FROM contractor_projects
         WHERE contractor_id = $1 AND TO_CHAR(created_at, 'YYYY-MM') = $2`,
        [contractor.id, month]
      );

      const projects = projectsResult.rows;
      const total_projects = projects.length;
      const total_sqm = projects.reduce((sum: number, p: any) => sum + parseFloat(p.total_sqm || 0), 0);
      const total_amount_no_vat = projects.reduce((sum: number, p: any) => sum + parseFloat(p.final_amount || 0), 0);
      const vat_amount = total_amount_no_vat * VAT_RATE;
      const total_with_vat = total_amount_no_vat + vat_amount;
      const withholding_tax = total_amount_no_vat * (parseFloat(contractor.withholding_rate) / 100);

      // בדיקת בונוס
      const met_target = total_amount_no_vat >= parseFloat(contractor.bonus_threshold || 0);
      let bonus_earned = 0;

      if (met_target && parseFloat(contractor.bonus_percentage) > 0) {
        bonus_earned = total_amount_no_vat * (parseFloat(contractor.bonus_percentage) / 100);
      }

      if (contractor.contractor_type === "sales_agent" && met_target) {
        bonus_earned = total_amount_no_vat * SALES_AGENT_BONUS;
      }

      const net_payment = total_with_vat - withholding_tax + bonus_earned;

      // הכנסה/עדכון בטבלת סיכום חודשי
      const summaryResult = await pool.query(
        `INSERT INTO contractor_monthly_summary
          (contractor_id, month, year, total_projects, total_sqm, total_amount_no_vat,
           vat_amount, total_with_vat, withholding_tax, net_payment, bonus_earned, met_target)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (contractor_id, month) DO UPDATE SET
           total_projects = EXCLUDED.total_projects,
           total_sqm = EXCLUDED.total_sqm,
           total_amount_no_vat = EXCLUDED.total_amount_no_vat,
           vat_amount = EXCLUDED.vat_amount,
           total_with_vat = EXCLUDED.total_with_vat,
           withholding_tax = EXCLUDED.withholding_tax,
           net_payment = EXCLUDED.net_payment,
           bonus_earned = EXCLUDED.bonus_earned,
           met_target = EXCLUDED.met_target,
           updated_at = NOW()
         RETURNING *`,
        [
          contractor.id, month, year, total_projects,
          parseFloat(total_sqm.toFixed(2)),
          parseFloat(total_amount_no_vat.toFixed(2)),
          parseFloat(vat_amount.toFixed(2)),
          parseFloat(total_with_vat.toFixed(2)),
          parseFloat(withholding_tax.toFixed(2)),
          parseFloat(net_payment.toFixed(2)),
          parseFloat(bonus_earned.toFixed(2)),
          met_target,
        ]
      );

      summaries.push({
        contractor_name: contractor.full_name,
        contractor_type: contractor.contractor_type,
        ...summaryResult.rows[0],
      });
    }

    res.json({
      success: true,
      message: `סיכומים חודשיים נוצרו עבור חודש ${month}`,
      data: summaries,
      total_contractors: summaries.length,
    });
  } catch (error: any) {
    console.error("שגיאה ביצירת סיכומים חודשיים:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== GET /dashboard - לוח בקרה =====
router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

    // סך תשלומים החודש
    const totalPaymentsResult = await pool.query(
      `SELECT
         COALESCE(SUM(final_amount), 0) as total_no_vat,
         COALESCE(SUM(total_with_vat), 0) as total_with_vat,
         COUNT(*) as total_projects
       FROM contractor_projects
       WHERE TO_CHAR(created_at, 'YYYY-MM') = $1`,
      [currentMonth]
    );

    // תשלומים לפי סוג קבלן
    const byTypeResult = await pool.query(
      `SELECT
         cp.contractor_type,
         COUNT(cpr.id) as projects_count,
         COALESCE(SUM(cpr.final_amount), 0) as total_amount,
         COALESCE(SUM(cpr.total_with_vat), 0) as total_with_vat
       FROM contractor_projects cpr
       JOIN contractor_profiles cp ON cp.id = cpr.contractor_id
       WHERE TO_CHAR(cpr.created_at, 'YYYY-MM') = $1
       GROUP BY cp.contractor_type
       ORDER BY total_amount DESC`,
      [currentMonth]
    );

    // חיסכון מהמודל החכם
    const savingsResult = await pool.query(
      `SELECT
         COALESCE(SUM(company_savings), 0) as total_savings,
         COUNT(*) FILTER (WHERE company_savings > 0) as projects_with_savings
       FROM contractor_projects
       WHERE TO_CHAR(created_at, 'YYYY-MM') = $1`,
      [currentMonth]
    );

    // מרוויחים מובילים
    const topEarnersResult = await pool.query(
      `SELECT
         cp.full_name,
         cp.contractor_type,
         COUNT(cpr.id) as projects_count,
         COALESCE(SUM(cpr.final_amount), 0) as total_earned
       FROM contractor_projects cpr
       JOIN contractor_profiles cp ON cp.id = cpr.contractor_id
       WHERE TO_CHAR(cpr.created_at, 'YYYY-MM') = $1
       GROUP BY cp.id, cp.full_name, cp.contractor_type
       ORDER BY total_earned DESC
       LIMIT 10`,
      [currentMonth]
    );

    // ממתינים לאישור
    const pendingApprovalResult = await pool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(final_amount), 0) as total
       FROM contractor_projects WHERE approved = false`
    );

    res.json({
      success: true,
      data: {
        month: currentMonth,
        total_payments: totalPaymentsResult.rows[0],
        by_contractor_type: byTypeResult.rows,
        smart_model_savings: savingsResult.rows[0],
        top_earners: topEarnersResult.rows,
        pending_approval: pendingApprovalResult.rows[0],
      },
    });
  } catch (error: any) {
    console.error("שגיאה בלוח בקרה:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== GET /comparison-report - דוח השוואה: חיסכון מהמודל החכם =====
router.get("/comparison-report", async (req: Request, res: Response) => {
  try {
    const { from_date, to_date } = req.query;

    let dateFilter = "";
    const params: any[] = [];

    if (from_date && to_date) {
      params.push(from_date, to_date);
      dateFilter = `AND cpr.created_at BETWEEN $${params.length - 1} AND $${params.length}`;
    }

    // סך כל הפרויקטים עם חישוב שני המודלים
    const comparisonResult = await pool.query(
      `SELECT
         cp.contractor_type,
         COUNT(cpr.id) as total_projects,
         COALESCE(SUM(cpr.calculated_amount_sqm), 0) as total_if_sqm,
         COALESCE(SUM(cpr.calculated_amount_pct), 0) as total_if_percentage,
         COALESCE(SUM(cpr.final_amount), 0) as total_actual_paid,
         COALESCE(SUM(cpr.company_savings), 0) as total_savings,
         COALESCE(AVG(cpr.company_savings), 0) as avg_savings_per_project
       FROM contractor_projects cpr
       JOIN contractor_profiles cp ON cp.id = cpr.contractor_id
       WHERE 1=1 ${dateFilter}
       GROUP BY cp.contractor_type
       ORDER BY total_savings DESC`,
      params
    );

    // סיכום כללי
    const totalResult = await pool.query(
      `SELECT
         COUNT(*) as total_projects,
         COALESCE(SUM(calculated_amount_sqm), 0) as total_if_always_sqm,
         COALESCE(SUM(calculated_amount_pct), 0) as total_if_always_percentage,
         COALESCE(SUM(final_amount), 0) as total_actual_paid,
         COALESCE(SUM(company_savings), 0) as total_savings
       FROM contractor_projects
       WHERE 1=1 ${dateFilter}`,
      params
    );

    const totals = totalResult.rows[0];
    // חישוב כמה היה עולה אם תמיד משלמים לפי אחוזים
    const savings_vs_always_percentage =
      parseFloat(totals.total_if_always_percentage) - parseFloat(totals.total_actual_paid);

    res.json({
      success: true,
      message: "דוח השוואה - חיסכון מהמודל החכם",
      data: {
        by_contractor_type: comparisonResult.rows,
        totals: {
          ...totals,
          savings_vs_always_percentage: parseFloat(savings_vs_always_percentage.toFixed(2)),
          explanation: `אם היינו תמיד משלמים לפי אחוזים, היינו משלמים ${totals.total_if_always_percentage} ש"ח. בפועל שילמנו ${totals.total_actual_paid} ש"ח. חיסכון: ${savings_vs_always_percentage.toFixed(2)} ש"ח`,
        },
      },
    });
  } catch (error: any) {
    console.error("שגיאה בדוח השוואה:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== GET /contractor/:id/history - היסטוריית פרויקטים של קבלן =====
router.get("/contractor/:id/history", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // פרטי הקבלן
    const contractorResult = await pool.query(
      `SELECT * FROM contractor_profiles WHERE id = $1`,
      [id]
    );

    if (contractorResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: "קבלן לא נמצא" });
    }

    const contractor = contractorResult.rows[0];

    // כל הפרויקטים
    const projectsResult = await pool.query(
      `SELECT * FROM contractor_projects WHERE contractor_id = $1 ORDER BY created_at DESC`,
      [id]
    );

    // סיכומים חודשיים
    const monthlySummariesResult = await pool.query(
      `SELECT * FROM contractor_monthly_summary WHERE contractor_id = $1 ORDER BY month DESC`,
      [id]
    );

    // סטטיסטיקות כלליות
    const statsResult = await pool.query(
      `SELECT
         COUNT(*) as total_projects,
         COALESCE(SUM(total_sqm), 0) as total_sqm,
         COALESCE(SUM(final_amount), 0) as total_earned_no_vat,
         COALESCE(SUM(total_with_vat), 0) as total_earned_with_vat,
         COALESCE(SUM(company_savings), 0) as total_company_savings,
         COALESCE(AVG(final_amount), 0) as avg_per_project,
         MIN(created_at) as first_project,
         MAX(created_at) as last_project
       FROM contractor_projects WHERE contractor_id = $1`,
      [id]
    );

    res.json({
      success: true,
      data: {
        contractor,
        statistics: statsResult.rows[0],
        projects: projectsResult.rows,
        monthly_summaries: monthlySummariesResult.rows,
      },
    });
  } catch (error: any) {
    console.error("שגיאה בשליפת היסטוריית קבלן:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
