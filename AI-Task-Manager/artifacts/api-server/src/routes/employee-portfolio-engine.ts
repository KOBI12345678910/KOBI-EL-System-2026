// ============================================================
// מנוע תיק עובד מלא - 360 מעלות
// פרטים אישיים, פרויקטים, פיננסי, מסמכים, ביצועים, יעדים
// ============================================================

import { Router } from "express";
import { pool } from "@workspace/db";
import { handleApiError, getHebrewErrorMessage } from "../lib/error-handler";

const router = Router();

// ============================================================
// יצירת טבלאות - תיק עובד, היסטוריית פרויקטים, מסמכים, סיכום פיננסי
// ============================================================
async function ensureTables() {
  await pool.query(`
    -- טבלת תיק עובד מלא
    CREATE TABLE IF NOT EXISTS employee_portfolios (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER UNIQUE NOT NULL,
      employee_code VARCHAR UNIQUE,
      full_name VARCHAR NOT NULL,
      id_number VARCHAR,
      date_of_birth DATE,
      phone VARCHAR,
      phone2 VARCHAR,
      email VARCHAR,
      address TEXT,
      city VARCHAR,
      emergency_contact_name VARCHAR,
      emergency_contact_phone VARCHAR,
      department VARCHAR,
      position VARCHAR,
      position_he VARCHAR,
      employee_type VARCHAR DEFAULT 'salaried',
      hire_date DATE,
      seniority_years NUMERIC(4,1),
      contract_type VARCHAR DEFAULT 'permanent',
      manager_id INTEGER,
      manager_name VARCHAR,
      base_salary NUMERIC(15,2),
      payment_model VARCHAR,
      rate_per_meter NUMERIC(10,2),
      rate_percentage NUMERIC(5,2),
      commission_rate NUMERIC(5,2),
      bank_name VARCHAR,
      bank_branch VARCHAR,
      bank_account VARCHAR,
      tax_id VARCHAR,
      tax_bracket INTEGER,
      pension_fund VARCHAR,
      education_fund VARCHAR,
      health_insurance VARCHAR,
      photo_url TEXT,
      skills JSONB DEFAULT '[]',
      certifications JSONB DEFAULT '[]',
      languages JSONB DEFAULT '[]',
      goals JSONB DEFAULT '[]',
      warnings INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      termination_date DATE,
      termination_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- טבלת היסטוריית פרויקטים של עובד
    CREATE TABLE IF NOT EXISTS employee_project_history (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL,
      project_id INTEGER,
      project_name VARCHAR,
      customer_name VARCHAR,
      role VARCHAR,
      start_date DATE,
      end_date DATE,
      total_hours NUMERIC(8,2),
      total_earned NUMERIC(15,2),
      performance_rating NUMERIC(3,1),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- טבלת מסמכי עובד
    CREATE TABLE IF NOT EXISTS employee_documents (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL,
      document_type VARCHAR NOT NULL,
      document_name VARCHAR,
      file_url TEXT,
      upload_date TIMESTAMPTZ DEFAULT NOW(),
      expiry_date DATE,
      signed BOOLEAN DEFAULT false,
      signed_date TIMESTAMPTZ,
      notes TEXT
    );

    -- טבלת סיכום פיננסי עובד
    CREATE TABLE IF NOT EXISTS employee_financial_summary (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL,
      period VARCHAR NOT NULL,
      total_projects INTEGER DEFAULT 0,
      total_revenue_brought NUMERIC(15,2) DEFAULT 0,
      total_cost_to_company NUMERIC(15,2) DEFAULT 0,
      net_value NUMERIC(15,2) DEFAULT 0,
      total_salary_paid NUMERIC(15,2) DEFAULT 0,
      total_commissions NUMERIC(15,2) DEFAULT 0,
      total_bonuses NUMERIC(15,2) DEFAULT 0,
      total_expenses NUMERIC(15,2) DEFAULT 0,
      productivity_score NUMERIC(5,2),
      value_score NUMERIC(5,2),
      attendance_rate NUMERIC(5,2),
      goal_achievement NUMERIC(5,2),
      overall_score NUMERIC(5,2),
      rank_in_department INTEGER,
      recommendations JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(employee_id, period)
    );
  `);
}

// ============================================================
// אתחול + 10 עובדים לדוגמה - מחלקות שונות
// ============================================================
router.post("/init", async (_req, res) => {
  try {
    await ensureTables();

    const existing = await pool.query("SELECT COUNT(*) FROM employee_portfolios");
    if (parseInt(existing.rows[0].count) > 0) {
      return res.json({ message: "טבלאות כבר קיימות עם נתונים", initialized: true });
    }

    // עובדים לדוגמה - 10 עובדים ב-5 מחלקות
    const seedEmployees = [
      // מכירות
      {
        employee_id: 1, code: 'EMP-001', name: 'שלמה לוי', id_number: '111111118', phone: '050-1000001',
        email: 'shlomo@technokoluzi.co.il', department: 'sales', position: 'Sales Manager', position_he: 'מנהל מכירות',
        employee_type: 'salaried', hire_date: '2020-01-15', base_salary: 22000, commission_rate: 3.5,
        manager_name: 'עוזי כהן', bank_name: 'לאומי', bank_branch: '680', bank_account: '11111111',
        skills: JSON.stringify(['מכירות B2B', 'ניהול לקוחות', 'הצעות מחיר']), city: 'תל אביב'
      },
      {
        employee_id: 2, code: 'EMP-002', name: 'דני אברהם', id_number: '222222226', phone: '050-1000002',
        email: 'dani@technokoluzi.co.il', department: 'sales', position: 'Sales Agent', position_he: 'סוכן מכירות',
        employee_type: 'salaried', hire_date: '2022-06-01', base_salary: 12000, commission_rate: 5.0,
        manager_name: 'שלמה לוי', bank_name: 'הפועלים', bank_branch: '532', bank_account: '22222222',
        skills: JSON.stringify(['מכירות שטח', 'מדידות', 'CRM']), city: 'רמת גן'
      },
      // ייצור
      {
        employee_id: 3, code: 'EMP-003', name: 'חסן עלי', id_number: '333333334', phone: '050-1000003',
        email: 'hasan@technokoluzi.co.il', department: 'production', position: 'Production Manager', position_he: 'מנהל ייצור',
        employee_type: 'salaried', hire_date: '2018-03-10', base_salary: 20000,
        manager_name: 'עוזי כהן', bank_name: 'דיסקונט', bank_branch: '123', bank_account: '33333333',
        skills: JSON.stringify(['ניהול קו ייצור', 'ריתוך', 'CNC', 'בקרת איכות']), city: 'נצרת'
      },
      {
        employee_id: 4, code: 'EMP-004', name: 'מיכאל קרסו', id_number: '444444442', phone: '050-1000004',
        email: 'michael@technokoluzi.co.il', department: 'production', position: 'Welder', position_he: 'רתך בכיר',
        employee_type: 'salaried', hire_date: '2021-09-01', base_salary: 14000,
        manager_name: 'חסן עלי', bank_name: 'מזרחי', bank_branch: '414', bank_account: '44444444',
        skills: JSON.stringify(['ריתוך MIG', 'ריתוך TIG', 'קריאת שרטוטים']), city: 'חיפה'
      },
      // התקנות
      {
        employee_id: 5, code: 'EMP-005', name: 'יוסי כהן', id_number: '555555550', phone: '050-1000005',
        email: 'yosi@technokoluzi.co.il', department: 'installation', position: 'Lead Installer', position_he: 'מתקין ראשי',
        employee_type: 'contractor', hire_date: '2019-07-01', payment_model: 'per_meter', rate_per_meter: 35.00,
        manager_name: 'עוזי כהן', bank_name: 'לאומי', bank_branch: '680', bank_account: '55555555',
        skills: JSON.stringify(['התקנת גדרות', 'שערים', 'פרגולות']), city: 'תל אביב'
      },
      {
        employee_id: 6, code: 'EMP-006', name: 'מוחמד חסן', id_number: '666666668', phone: '050-1000006',
        email: 'mohamed@technokoluzi.co.il', department: 'installation', position: 'Installer', position_he: 'מתקין',
        employee_type: 'contractor', hire_date: '2020-11-15', payment_model: 'per_meter', rate_per_meter: 32.00,
        manager_name: 'יוסי כהן', bank_name: 'הפועלים', bank_branch: '532', bank_account: '66666666',
        skills: JSON.stringify(['מעקות', 'סורגים', 'דלתות']), city: 'נצרת'
      },
      // הנדסה / מדידות
      {
        employee_id: 7, code: 'EMP-007', name: 'רון אברהמי', id_number: '777777776', phone: '050-1000007',
        email: 'ron@technokoluzi.co.il', department: 'engineering', position: 'Measurement Engineer', position_he: 'מהנדס מדידות',
        employee_type: 'salaried', hire_date: '2021-02-01', base_salary: 16000,
        manager_name: 'חסן עלי', bank_name: 'דיסקונט', bank_branch: '123', bank_account: '77777777',
        skills: JSON.stringify(['מדידות שטח', 'AutoCAD', 'SolidWorks', 'לייזר מטר']), city: 'הרצליה'
      },
      {
        employee_id: 8, code: 'EMP-008', name: 'עומר חדד', id_number: '888888884', phone: '050-1000008',
        email: 'omer@technokoluzi.co.il', department: 'engineering', position: 'Design Engineer', position_he: 'מהנדס תכן',
        employee_type: 'salaried', hire_date: '2023-01-15', base_salary: 18000,
        manager_name: 'חסן עלי', bank_name: 'מזרחי', bank_branch: '414', bank_account: '88888888',
        skills: JSON.stringify(['AutoCAD', 'SolidWorks', 'קונסטרוקציות', 'שרטוט']), city: 'רעננה'
      },
      // אדמיניסטרציה
      {
        employee_id: 9, code: 'EMP-009', name: 'מיכל דוד', id_number: '999999992', phone: '050-1000009',
        email: 'michal@technokoluzi.co.il', department: 'admin', position: 'Office Manager', position_he: 'מנהלת משרד',
        employee_type: 'salaried', hire_date: '2019-04-01', base_salary: 13000,
        manager_name: 'עוזי כהן', bank_name: 'לאומי', bank_branch: '680', bank_account: '99999999',
        skills: JSON.stringify(['ניהול משרד', 'חשבונות', 'Excel', 'הנהלת חשבונות']), city: 'פתח תקווה'
      },
      {
        employee_id: 10, code: 'EMP-010', name: 'נועה שרון', id_number: '101010100', phone: '050-1000010',
        email: 'noa@technokoluzi.co.il', department: 'admin', position: 'HR Coordinator', position_he: 'רכזת משאבי אנוש',
        employee_type: 'salaried', hire_date: '2024-01-01', base_salary: 11000,
        manager_name: 'מיכל דוד', bank_name: 'הפועלים', bank_branch: '532', bank_account: '10101010',
        skills: JSON.stringify(['משאבי אנוש', 'גיוס', 'שכר', 'רווחה']), city: 'ראשון לציון'
      }
    ];

    for (const emp of seedEmployees) {
      await pool.query(`
        INSERT INTO employee_portfolios (employee_id, employee_code, full_name, id_number, phone, email,
          department, position, position_he, employee_type, hire_date, base_salary, payment_model,
          rate_per_meter, rate_percentage, commission_rate, manager_name, bank_name, bank_branch,
          bank_account, skills, city)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
        ON CONFLICT (employee_id) DO NOTHING
      `, [emp.employee_id, emp.code, emp.name, emp.id_number, emp.phone, emp.email,
          emp.department, emp.position, emp.position_he, emp.employee_type, emp.hire_date,
          emp.base_salary || null, emp.payment_model || null, emp.rate_per_meter || null,
          emp.rate_percentage || null, emp.commission_rate || null, emp.manager_name,
          emp.bank_name, emp.bank_branch, emp.bank_account, emp.skills, emp.city]);
    }

    // היסטוריית פרויקטים לדוגמה
    const seedProjects = [
      { employee_id: 1, project_name: 'גדר מפעל אופק', customer_name: 'חברת אופק', role: 'מנהל מכירה', total_hours: 20, total_earned: 3500, performance_rating: 4.5 },
      { employee_id: 1, project_name: 'מעקות בניין מגורים', customer_name: 'קבוצת אלון', role: 'מנהל מכירה', total_hours: 30, total_earned: 8500, performance_rating: 4.8 },
      { employee_id: 2, project_name: 'שער חניה פרטי', customer_name: 'משפחת ישראלי', role: 'סוכן מכירות', total_hours: 5, total_earned: 1200, performance_rating: 4.2 },
      { employee_id: 3, project_name: 'גדר מפעל אופק', customer_name: 'חברת אופק', role: 'ניהול ייצור', total_hours: 80, total_earned: 0, performance_rating: 4.7 },
      { employee_id: 5, project_name: 'גדר מפעל אופק', customer_name: 'חברת אופק', role: 'מתקין ראשי', total_hours: 40, total_earned: 4200, performance_rating: 4.9 },
      { employee_id: 7, project_name: 'מעקות בניין מגורים', customer_name: 'קבוצת אלון', role: 'מודד', total_hours: 8, total_earned: 0, performance_rating: 4.6 }
    ];

    for (const proj of seedProjects) {
      await pool.query(`
        INSERT INTO employee_project_history (employee_id, project_name, customer_name, role, total_hours, total_earned, performance_rating)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [proj.employee_id, proj.project_name, proj.customer_name, proj.role, proj.total_hours, proj.total_earned, proj.performance_rating]);
    }

    // מסמכים לדוגמה
    const seedDocs = [
      { employee_id: 1, type: 'contract', name: 'חוזה עבודה', expiry_date: '2027-01-15', signed: true },
      { employee_id: 2, type: 'contract', name: 'חוזה עבודה', expiry_date: '2027-06-01', signed: true },
      { employee_id: 3, type: 'certification', name: 'תעודת מנהל ייצור', expiry_date: '2026-06-10', signed: false },
      { employee_id: 5, type: 'insurance', name: 'ביטוח קבלן', expiry_date: '2026-04-15', signed: true },
      { employee_id: 7, type: 'certification', name: 'תעודת מודד מוסמך', expiry_date: '2026-08-01', signed: true }
    ];

    for (const doc of seedDocs) {
      await pool.query(`
        INSERT INTO employee_documents (employee_id, document_type, document_name, expiry_date, signed)
        VALUES ($1,$2,$3,$4,$5)
      `, [doc.employee_id, doc.type, doc.name, doc.expiry_date, doc.signed]);
    }

    res.json({
      message: "אתחול מנוע תיק עובד הושלם בהצלחה",
      tables: ['employee_portfolios', 'employee_project_history', 'employee_documents', 'employee_financial_summary'],
      seeded: { employees: 10, projects: seedProjects.length, documents: seedDocs.length }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// CRUD עובדים
// ============================================================

// כל העובדים
// J-02: Hebrew error messages
router.get("/employees", async (req, res) => {
  try {
    await ensureTables();
    const { department, type, search, active } = req.query;
    let query = "SELECT * FROM employee_portfolios WHERE 1=1";
    const params: any[] = [];
    let idx = 1;

    if (department) { query += ` AND department = $${idx++}`; params.push(department); }
    if (type) { query += ` AND employee_type = $${idx++}`; params.push(type); }
    if (active !== undefined) { query += ` AND is_active = $${idx++}`; params.push(active === 'true'); }
    if (search) { query += ` AND (full_name ILIKE $${idx} OR employee_code ILIKE $${idx} OR email ILIKE $${idx})`; params.push(`%${search}%`); idx++; }

    query += " ORDER BY department, full_name";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error: any) {
    handleApiError(res, error, 500, "אירעה שגיאה בטעינת רשימת העובדים");
  }
});

// עובד בודד
router.get("/employees/:id", async (req, res) => {
  try {
    await ensureTables();
    const result = await pool.query("SELECT * FROM employee_portfolios WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "עובד לא נמצא" });
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// הוספת עובד
router.post("/employees", async (req, res) => {
  try {
    await ensureTables();
    const b = req.body;
    const result = await pool.query(`
      INSERT INTO employee_portfolios (employee_id, employee_code, full_name, id_number, date_of_birth,
        phone, phone2, email, address, city, emergency_contact_name, emergency_contact_phone,
        department, position, position_he, employee_type, hire_date, contract_type,
        manager_id, manager_name, base_salary, payment_model, rate_per_meter, rate_percentage,
        commission_rate, bank_name, bank_branch, bank_account, tax_id, tax_bracket,
        pension_fund, education_fund, health_insurance, photo_url, skills, certifications,
        languages, goals)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38)
      RETURNING *
    `, [b.employee_id, b.employee_code, b.full_name, b.id_number, b.date_of_birth,
        b.phone, b.phone2, b.email, b.address, b.city, b.emergency_contact_name, b.emergency_contact_phone,
        b.department, b.position, b.position_he, b.employee_type, b.hire_date, b.contract_type,
        b.manager_id, b.manager_name, b.base_salary, b.payment_model, b.rate_per_meter, b.rate_percentage,
        b.commission_rate, b.bank_name, b.bank_branch, b.bank_account, b.tax_id, b.tax_bracket,
        b.pension_fund, b.education_fund, b.health_insurance, b.photo_url,
        JSON.stringify(b.skills || []), JSON.stringify(b.certifications || []),
        JSON.stringify(b.languages || []), JSON.stringify(b.goals || [])]);
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// עדכון עובד
router.put("/employees/:id", async (req, res) => {
  try {
    await ensureTables();
    const b = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const allowedFields = [
      'employee_code', 'full_name', 'id_number', 'date_of_birth', 'phone', 'phone2', 'email', 'address', 'city',
      'emergency_contact_name', 'emergency_contact_phone', 'department', 'position', 'position_he',
      'employee_type', 'hire_date', 'seniority_years', 'contract_type', 'manager_id', 'manager_name',
      'base_salary', 'payment_model', 'rate_per_meter', 'rate_percentage', 'commission_rate',
      'bank_name', 'bank_branch', 'bank_account', 'tax_id', 'tax_bracket', 'pension_fund',
      'education_fund', 'health_insurance', 'photo_url', 'skills', 'certifications', 'languages',
      'goals', 'warnings', 'is_active', 'termination_date', 'termination_reason'
    ];
    const jsonFields = ['skills', 'certifications', 'languages', 'goals'];

    for (const field of allowedFields) {
      if (b[field] !== undefined) {
        fields.push(`${field} = $${idx++}`);
        values.push(jsonFields.includes(field) ? JSON.stringify(b[field]) : b[field]);
      }
    }

    if (fields.length === 0) return res.status(400).json({ error: "לא נשלחו שדות לעדכון" });
    fields.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE employee_portfolios SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "עובד לא נמצא" });
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// מחיקה רכה
router.delete("/employees/:id", async (req, res) => {
  try {
    await ensureTables();
    const result = await pool.query(
      "UPDATE employee_portfolios SET is_active = false, termination_date = CURRENT_DATE, updated_at = NOW() WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "עובד לא נמצא" });
    res.json({ message: "עובד סומן כלא פעיל", employee: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// תיק עובד מלא 360 - כל הנתונים
// ============================================================
router.get("/portfolio/:employeeId", async (req, res) => {
  try {
    await ensureTables();
    const { employeeId } = req.params;

    // פרטים אישיים
    const employee = await pool.query(
      "SELECT * FROM employee_portfolios WHERE employee_id = $1",
      [employeeId]
    );
    if (employee.rows.length === 0) return res.status(404).json({ error: "עובד לא נמצא" });

    // היסטוריית פרויקטים
    const projects = await pool.query(
      "SELECT * FROM employee_project_history WHERE employee_id = $1 ORDER BY start_date DESC",
      [employeeId]
    );

    // מסמכים
    const documents = await pool.query(
      "SELECT * FROM employee_documents WHERE employee_id = $1 ORDER BY upload_date DESC",
      [employeeId]
    );

    // סיכום פיננסי
    const financials = await pool.query(
      "SELECT * FROM employee_financial_summary WHERE employee_id = $1 ORDER BY period DESC",
      [employeeId]
    );

    // חישוב ותק
    const emp = employee.rows[0];
    const hireDate = emp.hire_date ? new Date(emp.hire_date) : null;
    const seniority = hireDate ? ((Date.now() - hireDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)).toFixed(1) : null;

    // סטטיסטיקות פרויקטים
    const totalProjects = projects.rows.length;
    const totalHours = projects.rows.reduce((sum: number, p: any) => sum + (parseFloat(p.total_hours) || 0), 0);
    const totalEarned = projects.rows.reduce((sum: number, p: any) => sum + (parseFloat(p.total_earned) || 0), 0);
    const avgRating = totalProjects > 0
      ? projects.rows.reduce((sum: number, p: any) => sum + (parseFloat(p.performance_rating) || 0), 0) / totalProjects
      : null;

    // מסמכים שפג תוקפם
    const expiredDocs = documents.rows.filter((d: any) => d.expiry_date && new Date(d.expiry_date) < new Date());
    const expiringDocs = documents.rows.filter((d: any) => {
      if (!d.expiry_date) return false;
      const exp = new Date(d.expiry_date);
      const thirtyDays = new Date();
      thirtyDays.setDate(thirtyDays.getDate() + 30);
      return exp >= new Date() && exp <= thirtyDays;
    });

    res.json({
      personal: emp,
      seniority_years: seniority,
      projects: {
        history: projects.rows,
        total: totalProjects,
        total_hours: totalHours,
        total_earned: totalEarned,
        avg_performance_rating: avgRating ? Math.round(avgRating * 10) / 10 : null
      },
      documents: {
        all: documents.rows,
        expired: expiredDocs,
        expiring_soon: expiringDocs
      },
      financials: financials.rows,
      goals: emp.goals,
      warnings: emp.warnings
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// ערך עובד - כמה מביא מול כמה עולה, ROI
// ============================================================
router.get("/employee-value/:employeeId", async (req, res) => {
  try {
    await ensureTables();
    const { employeeId } = req.params;

    const employee = await pool.query("SELECT * FROM employee_portfolios WHERE employee_id = $1", [employeeId]);
    if (employee.rows.length === 0) return res.status(404).json({ error: "עובד לא נמצא" });

    const emp = employee.rows[0];

    // סה\"כ הכנסות שהביא מפרויקטים
    const revenue = await pool.query(
      "SELECT COALESCE(SUM(total_earned), 0) as total FROM employee_project_history WHERE employee_id = $1",
      [employeeId]
    );

    // עלות חודשית משוערת
    const monthlyCost = parseFloat(emp.base_salary) || 0;
    const hireDate = emp.hire_date ? new Date(emp.hire_date) : new Date();
    const monthsWorked = Math.max(1, Math.round((Date.now() - hireDate.getTime()) / (30 * 24 * 60 * 60 * 1000)));
    const totalCost = monthlyCost * monthsWorked;
    const totalRevenue = parseFloat(revenue.rows[0].total);

    // ROI
    const roi = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost * 100) : 0;

    // סיכום פיננסי אחרון
    const latestFinancial = await pool.query(
      "SELECT * FROM employee_financial_summary WHERE employee_id = $1 ORDER BY period DESC LIMIT 1",
      [employeeId]
    );

    res.json({
      employee: { id: emp.employee_id, name: emp.full_name, department: emp.department, position: emp.position_he },
      value_analysis: {
        total_revenue_brought: totalRevenue,
        total_cost_to_company: totalCost,
        net_value: totalRevenue - totalCost,
        roi_percentage: Math.round(roi * 100) / 100,
        months_employed: monthsWorked,
        monthly_salary: monthlyCost,
        avg_monthly_revenue: Math.round(totalRevenue / monthsWorked * 100) / 100
      },
      latest_financial_summary: latestFinancial.rows[0] || null,
      assessment: roi > 100 ? 'ערך גבוה מאוד' : roi > 50 ? 'ערך גבוה' : roi > 0 ? 'ערך חיובי' : roi > -20 ? 'ערך שולי' : 'דורש בחינה'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// היסטוריית פרויקטים של עובד
// ============================================================
router.get("/project-history/:employeeId", async (req, res) => {
  try {
    await ensureTables();
    const result = await pool.query(
      "SELECT * FROM employee_project_history WHERE employee_id = $1 ORDER BY start_date DESC",
      [req.params.employeeId]
    );
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// היסטוריה פיננסית - שכר/עמלות/בונוסים
// ============================================================
router.get("/financial-history/:employeeId", async (req, res) => {
  try {
    await ensureTables();
    const result = await pool.query(
      "SELECT * FROM employee_financial_summary WHERE employee_id = $1 ORDER BY period DESC",
      [req.params.employeeId]
    );
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// העלאת מסמך לעובד
// ============================================================
router.post("/upload-document/:employeeId", async (req, res) => {
  try {
    await ensureTables();
    const { employeeId } = req.params;
    const b = req.body;

    const result = await pool.query(`
      INSERT INTO employee_documents (employee_id, document_type, document_name, file_url, expiry_date, signed, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [employeeId, b.document_type, b.document_name, b.file_url, b.expiry_date, b.signed || false, b.notes]);

    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// מסמכי עובד
// ============================================================
router.get("/documents/:employeeId", async (req, res) => {
  try {
    await ensureTables();
    const { type } = req.query;
    let query = "SELECT * FROM employee_documents WHERE employee_id = $1";
    const params: any[] = [req.params.employeeId];

    if (type) { query += " AND document_type = $2"; params.push(type); }
    query += " ORDER BY upload_date DESC";

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// סקירת מחלקה - כל העובדים במחלקה עם סטטיסטיקות
// ============================================================
router.get("/department-overview/:department", async (req, res) => {
  try {
    await ensureTables();
    const { department } = req.params;

    const employees = await pool.query(
      "SELECT * FROM employee_portfolios WHERE department = $1 AND is_active = true ORDER BY full_name",
      [department]
    );

    // סטטיסטיקות מחלקה
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_employees,
        AVG(base_salary) as avg_salary,
        MAX(base_salary) as max_salary,
        MIN(base_salary) as min_salary,
        AVG(seniority_years) as avg_seniority,
        SUM(warnings) as total_warnings
      FROM employee_portfolios WHERE department = $1 AND is_active = true
    `, [department]);

    // פרויקטים של המחלקה
    const empIds = employees.rows.map((e: any) => e.employee_id);
    let projectStats = { total: 0, avg_rating: null as number | null };
    if (empIds.length > 0) {
      const projRes = await pool.query(`
        SELECT COUNT(*) as total, AVG(performance_rating) as avg_rating
        FROM employee_project_history WHERE employee_id = ANY($1)
      `, [empIds]);
      projectStats = projRes.rows[0];
    }

    res.json({
      department,
      employees: employees.rows,
      stats: stats.rows[0],
      project_stats: projectStats
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// דשבורד כללי - סקירת כלל העובדים
// ============================================================
router.get("/dashboard", async (_req, res) => {
  try {
    await ensureTables();

    // סה\"כ עובדים
    const total = await pool.query("SELECT COUNT(*) FROM employee_portfolios WHERE is_active = true");

    // לפי מחלקה
    const byDept = await pool.query(`
      SELECT department, COUNT(*) as count, AVG(base_salary) as avg_salary
      FROM employee_portfolios WHERE is_active = true
      GROUP BY department ORDER BY count DESC
    `);

    // שכר ממוצע
    const avgSalary = await pool.query(
      "SELECT AVG(base_salary) as avg FROM employee_portfolios WHERE is_active = true AND base_salary IS NOT NULL"
    );

    // תחלופה - עובדים שעזבו השנה
    const turnover = await pool.query(
      "SELECT COUNT(*) FROM employee_portfolios WHERE is_active = false AND EXTRACT(YEAR FROM termination_date) = EXTRACT(YEAR FROM NOW())"
    );

    // עובדים מובילים - לפי ממוצע ביצועים
    const topPerformers = await pool.query(`
      SELECT ep.employee_id, ep.full_name, ep.department, ep.position_he,
        AVG(eph.performance_rating) as avg_rating,
        COUNT(eph.id) as total_projects,
        SUM(eph.total_earned) as total_earned
      FROM employee_portfolios ep
      JOIN employee_project_history eph ON eph.employee_id = ep.employee_id
      WHERE ep.is_active = true
      GROUP BY ep.employee_id, ep.full_name, ep.department, ep.position_he
      HAVING COUNT(eph.id) > 0
      ORDER BY avg_rating DESC
      LIMIT 10
    `);

    // חדשים אחרונים
    const recentHires = await pool.query(
      "SELECT * FROM employee_portfolios WHERE is_active = true ORDER BY hire_date DESC LIMIT 5"
    );

    // מסמכים שפג תוקפם
    const expiringDocs = await pool.query(`
      SELECT ed.*, ep.full_name, ep.department
      FROM employee_documents ed
      JOIN employee_portfolios ep ON ep.employee_id = ed.employee_id
      WHERE ed.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
      ORDER BY ed.expiry_date
    `);

    res.json({
      total_employees: parseInt(total.rows[0].count),
      by_department: byDept.rows,
      avg_salary: parseFloat(avgSalary.rows[0].avg) || 0,
      turnover_this_year: parseInt(turnover.rows[0].count),
      top_performers: topPerformers.rows,
      recent_hires: recentHires.rows,
      expiring_documents: expiringDocs.rows
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// לוח מובילים - מחלקה + תקופה
// ============================================================
router.get("/leaderboard/:department/:period", async (req, res) => {
  try {
    await ensureTables();
    const { department, period } = req.params;

    let dateFilter = "";
    switch (period) {
      case 'month': dateFilter = "AND eph.created_at >= DATE_TRUNC('month', NOW())"; break;
      case 'quarter': dateFilter = "AND eph.created_at >= DATE_TRUNC('quarter', NOW())"; break;
      case 'year': dateFilter = "AND eph.created_at >= DATE_TRUNC('year', NOW())"; break;
      default: dateFilter = "";
    }

    const result = await pool.query(`
      SELECT ep.employee_id, ep.full_name, ep.position_he,
        COUNT(eph.id) as total_projects,
        COALESCE(SUM(eph.total_earned), 0) as total_earned,
        COALESCE(SUM(eph.total_hours), 0) as total_hours,
        AVG(eph.performance_rating) as avg_rating
      FROM employee_portfolios ep
      LEFT JOIN employee_project_history eph ON eph.employee_id = ep.employee_id ${dateFilter}
      WHERE ep.department = $1 AND ep.is_active = true
      GROUP BY ep.employee_id, ep.full_name, ep.position_he
      ORDER BY total_earned DESC, avg_rating DESC
    `, [department]);

    // הוספת דירוג
    const ranked = result.rows.map((row: any, index: number) => ({ ...row, rank: index + 1 }));

    res.json({
      department,
      period,
      leaderboard: ranked
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// חישוב ערך עובד מלא לתקופה
// ============================================================
router.post("/calculate-value/:employeeId/:period", async (req, res) => {
  try {
    await ensureTables();
    const { employeeId, period } = req.params; // period = YYYY-MM

    const employee = await pool.query("SELECT * FROM employee_portfolios WHERE employee_id = $1", [employeeId]);
    if (employee.rows.length === 0) return res.status(404).json({ error: "עובד לא נמצא" });

    const emp = employee.rows[0];

    // פרויקטים בתקופה
    const projects = await pool.query(`
      SELECT * FROM employee_project_history
      WHERE employee_id = $1 AND to_char(created_at, 'YYYY-MM') = $2
    `, [employeeId, period]);

    const totalRevenue = projects.rows.reduce((sum: number, p: any) => sum + (parseFloat(p.total_earned) || 0), 0);
    const totalHours = projects.rows.reduce((sum: number, p: any) => sum + (parseFloat(p.total_hours) || 0), 0);
    const avgRating = projects.rows.length > 0
      ? projects.rows.reduce((sum: number, p: any) => sum + (parseFloat(p.performance_rating) || 0), 0) / projects.rows.length
      : null;

    // עלות חודשית
    const monthlySalary = parseFloat(emp.base_salary) || 0;
    const commissions = totalRevenue * (parseFloat(emp.commission_rate) || 0) / 100;
    const totalCost = monthlySalary + commissions;
    const netValue = totalRevenue - totalCost;

    // ציון פרודוקטיביות
    const productivityScore = totalHours > 0 ? (totalRevenue / totalHours) : 0;
    const valueScore = totalCost > 0 ? (totalRevenue / totalCost * 100) : 0;

    // שמירה או עדכון
    const result = await pool.query(`
      INSERT INTO employee_financial_summary (employee_id, period, total_projects, total_revenue_brought,
        total_cost_to_company, net_value, total_salary_paid, total_commissions, productivity_score, value_score,
        overall_score)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (employee_id, period)
      DO UPDATE SET total_projects = $3, total_revenue_brought = $4, total_cost_to_company = $5,
        net_value = $6, total_salary_paid = $7, total_commissions = $8, productivity_score = $9,
        value_score = $10, overall_score = $11
      RETURNING *
    `, [employeeId, period, projects.rows.length, totalRevenue, totalCost, netValue,
        monthlySalary, commissions, productivityScore, valueScore,
        avgRating ? (avgRating * 20) : null]); // ממירים ציון 1-5 ל-1-100

    res.json({
      message: "חישוב ערך עובד הושלם",
      summary: result.rows[0],
      details: {
        projects: projects.rows,
        total_revenue: totalRevenue,
        total_cost: totalCost,
        net_value: netValue,
        productivity_per_hour: productivityScore,
        value_ratio: valueScore
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// מסמכים שפג תוקפם / עומדים לפוג ב-30 יום
// ============================================================
router.get("/expiring-documents", async (_req, res) => {
  try {
    await ensureTables();

    const result = await pool.query(`
      SELECT ed.*, ep.full_name, ep.department, ep.position_he, ep.phone
      FROM employee_documents ed
      JOIN employee_portfolios ep ON ep.employee_id = ed.employee_id
      WHERE ed.expiry_date IS NOT NULL AND ed.expiry_date <= CURRENT_DATE + 30
      ORDER BY ed.expiry_date ASC
    `);

    const expired = result.rows.filter((d: any) => new Date(d.expiry_date) < new Date());
    const expiringSoon = result.rows.filter((d: any) => new Date(d.expiry_date) >= new Date());

    res.json({
      expired: expired,
      expiring_within_30_days: expiringSoon,
      total: result.rows.length
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// הגדרת יעדים לעובד
// ============================================================
router.post("/set-goals/:employeeId", async (req, res) => {
  try {
    await ensureTables();
    const { employeeId } = req.params;
    const { goals } = req.body; // מערך יעדים

    if (!goals || !Array.isArray(goals)) {
      return res.status(400).json({ error: "נדרש מערך goals" });
    }

    // הוספת יעדים חדשים לקיימים (לא מוחקים!)
    const current = await pool.query(
      "SELECT goals FROM employee_portfolios WHERE employee_id = $1",
      [employeeId]
    );

    if (current.rows.length === 0) return res.status(404).json({ error: "עובד לא נמצא" });

    const existingGoals = current.rows[0].goals || [];
    const allGoals = [...existingGoals, ...goals.map((g: any) => ({
      ...g,
      set_date: new Date().toISOString(),
      status: g.status || 'active'
    }))];

    const result = await pool.query(
      "UPDATE employee_portfolios SET goals = $2, updated_at = NOW() WHERE employee_id = $1 RETURNING *",
      [employeeId, JSON.stringify(allGoals)]
    );

    res.json({ message: "יעדים הוגדרו בהצלחה", employee: result.rows[0], total_goals: allGoals.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// מבנה ארגוני - היררכיה מלאה
// ============================================================
router.get("/org-chart", async (_req, res) => {
  try {
    await ensureTables();

    const employees = await pool.query(`
      SELECT employee_id, full_name, department, position, position_he, manager_id, manager_name, photo_url
      FROM employee_portfolios
      WHERE is_active = true
      ORDER BY department, position
    `);

    // בניית עץ ארגוני
    const byDepartment: Record<string, any[]> = {};
    for (const emp of employees.rows) {
      if (!byDepartment[emp.department]) {
        byDepartment[emp.department] = [];
      }
      byDepartment[emp.department].push(emp);
    }

    // זיהוי מנהלים (מי שאין לו מנהל או מנהל עצמו)
    const topLevel = employees.rows.filter((e: any) => !e.manager_id || !employees.rows.find((m: any) => m.employee_id === e.manager_id));

    // בניית היררכיה
    function buildTree(managerId: number): any[] {
      return employees.rows
        .filter((e: any) => e.manager_id === managerId)
        .map((e: any) => ({
          ...e,
          reports: buildTree(e.employee_id)
        }));
    }

    const hierarchy = topLevel.map((e: any) => ({
      ...e,
      reports: buildTree(e.employee_id)
    }));

    res.json({
      org_chart: hierarchy,
      by_department: byDepartment,
      total_employees: employees.rows.length,
      departments: Object.keys(byDepartment)
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
