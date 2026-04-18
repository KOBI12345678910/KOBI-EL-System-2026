// ============================================================
// מנוע ניהול מתקינים/קבלני משנה - מפעל מתכת
// ניהול מלא של מתקינים, עבודות התקנה, תשלומים וסיכומים חודשיים
// ============================================================

import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ============================================================
// יצירת טבלאות - מתקינים, עבודות התקנה, סיכום חודשי
// ============================================================
async function ensureTables() {
  await pool.query(`
    -- טבלת מתקינים / קבלני משנה
    CREATE TABLE IF NOT EXISTS installers (
      id SERIAL PRIMARY KEY,
      installer_code VARCHAR UNIQUE,
      full_name VARCHAR NOT NULL,
      phone VARCHAR,
      phone2 VARCHAR,
      email VARCHAR,
      id_number VARCHAR,
      address TEXT,
      city VARCHAR,
      region VARCHAR,
      installer_type VARCHAR DEFAULT 'contractor',
      payment_model VARCHAR DEFAULT 'per_meter',
      rate_per_meter NUMERIC(10,2),
      rate_percentage NUMERIC(5,2),
      bonus_percentage NUMERIC(5,2) DEFAULT 0,
      specializations JSONB DEFAULT '[]',
      rating NUMERIC(3,1) DEFAULT 5.0,
      total_projects INTEGER DEFAULT 0,
      total_revenue_generated NUMERIC(15,2) DEFAULT 0,
      total_paid NUMERIC(15,2) DEFAULT 0,
      balance_owed NUMERIC(15,2) DEFAULT 0,
      availability_status VARCHAR DEFAULT 'available',
      vehicle VARCHAR,
      tools_provided BOOLEAN DEFAULT false,
      insurance_valid_until DATE,
      contract_signed BOOLEAN DEFAULT false,
      contract_id INTEGER,
      bank_name VARCHAR,
      bank_branch VARCHAR,
      bank_account VARCHAR,
      documents JSONB DEFAULT '[]',
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- טבלת עבודות התקנה
    CREATE TABLE IF NOT EXISTS installation_jobs (
      id SERIAL PRIMARY KEY,
      job_number VARCHAR UNIQUE,
      project_id INTEGER,
      customer_id INTEGER,
      customer_name VARCHAR,
      customer_phone VARCHAR,
      customer_address TEXT,
      customer_city VARCHAR,
      installer_id INTEGER REFERENCES installers(id),
      installer_name VARCHAR,
      products JSONB DEFAULT '[]',
      total_meters NUMERIC(10,2),
      total_sqm NUMERIC(10,2),
      payment_model VARCHAR,
      payment_amount NUMERIC(15,2),
      payment_calculated BOOLEAN DEFAULT false,
      scheduled_date DATE,
      scheduled_time_from VARCHAR,
      scheduled_time_to VARCHAR,
      actual_start TIMESTAMPTZ,
      actual_end TIMESTAMPTZ,
      status VARCHAR DEFAULT 'pending',
      installation_photos_before JSONB DEFAULT '[]',
      installation_photos_after JSONB DEFAULT '[]',
      customer_signed BOOLEAN DEFAULT false,
      customer_signature_date TIMESTAMPTZ,
      quality_check VARCHAR DEFAULT 'pending',
      quality_notes TEXT,
      issues JSONB DEFAULT '[]',
      completion_notes TEXT,
      satisfaction_score INTEGER,
      invoice_number VARCHAR,
      invoice_sent BOOLEAN DEFAULT false,
      invoice_date DATE,
      paid BOOLEAN DEFAULT false,
      paid_date DATE,
      paid_amount NUMERIC(15,2),
      documents JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- טבלת סיכום חודשי למתקין
    CREATE TABLE IF NOT EXISTS installer_monthly_summary (
      id SERIAL PRIMARY KEY,
      installer_id INTEGER REFERENCES installers(id),
      installer_name VARCHAR,
      month VARCHAR NOT NULL,
      year INTEGER NOT NULL,
      total_jobs INTEGER DEFAULT 0,
      total_meters NUMERIC(10,2) DEFAULT 0,
      total_sqm NUMERIC(10,2) DEFAULT 0,
      total_earned NUMERIC(15,2) DEFAULT 0,
      total_paid NUMERIC(15,2) DEFAULT 0,
      balance NUMERIC(15,2) DEFAULT 0,
      avg_quality_score NUMERIC(3,1),
      avg_satisfaction NUMERIC(3,1),
      complaints INTEGER DEFAULT 0,
      on_time_percentage NUMERIC(5,2),
      projects_detail JSONB DEFAULT '[]',
      invoice_sent BOOLEAN DEFAULT false,
      invoice_number VARCHAR,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(installer_id, month, year)
    );
  `);
}

// ============================================================
// אתחול טבלאות + נתוני דוגמה - 5 מתקינים
// ============================================================
router.post("/init", async (_req, res) => {
  try {
    await ensureTables();

    // בדיקה אם כבר יש נתונים
    const existing = await pool.query("SELECT COUNT(*) FROM installers");
    if (parseInt(existing.rows[0].count) > 0) {
      return res.json({ message: "טבלאות כבר קיימות עם נתונים", initialized: true });
    }

    // נתוני מתקינים לדוגמה
    const seedInstallers = [
      {
        code: 'INS-001', name: 'יוסי כהן', phone: '050-1111111', phone2: '03-1111111',
        email: 'yosi@install.co.il', id_number: '111111111', address: 'רחוב הרצל 10',
        city: 'תל אביב', region: 'מרכז', type: 'contractor', payment_model: 'per_meter',
        rate_per_meter: 35.00, specializations: JSON.stringify(['גדרות', 'שערים', 'פרגולות']),
        vehicle: 'פורד טרנזיט', tools_provided: true, bank_name: 'לאומי', bank_branch: '680', bank_account: '12345678'
      },
      {
        code: 'INS-002', name: 'מוחמד חסן', phone: '050-2222222', phone2: null,
        email: 'mohamed@install.co.il', id_number: '222222222', address: 'רחוב הגליל 5',
        city: 'נצרת', region: 'צפון', type: 'contractor', payment_model: 'per_meter',
        rate_per_meter: 32.00, specializations: JSON.stringify(['מעקות', 'סורגים', 'דלתות']),
        vehicle: 'מרצדס ויטו', tools_provided: true, bank_name: 'הפועלים', bank_branch: '532', bank_account: '87654321'
      },
      {
        code: 'INS-003', name: 'אלון לוי', phone: '050-3333333', phone2: '08-3333333',
        email: 'alon@install.co.il', id_number: '333333333', address: 'רחוב הנגב 15',
        city: 'באר שבע', region: 'דרום', type: 'contractor', payment_model: 'percentage',
        rate_percentage: 15.00, specializations: JSON.stringify(['קונסטרוקציות', 'פלדה', 'מבנים']),
        vehicle: 'איסוזו דימקס', tools_provided: false, bank_name: 'דיסקונט', bank_branch: '123', bank_account: '55555555'
      },
      {
        code: 'INS-004', name: 'דוד מזרחי', phone: '050-4444444', phone2: null,
        email: 'david@install.co.il', id_number: '444444444', address: 'רחוב הרימון 8',
        city: 'חיפה', region: 'צפון', type: 'employee', payment_model: 'per_meter',
        rate_per_meter: 28.00, specializations: JSON.stringify(['גדרות', 'שערים חשמליים']),
        vehicle: 'טויוטה היילקס', tools_provided: true, bank_name: 'מזרחי', bank_branch: '414', bank_account: '99887766'
      },
      {
        code: 'INS-005', name: 'סאלח עבדאללה', phone: '050-5555555', phone2: '04-5555555',
        email: 'salah@install.co.il', id_number: '555555555', address: 'רחוב השלום 20',
        city: 'עכו', region: 'צפון', type: 'contractor', payment_model: 'per_meter',
        rate_per_meter: 30.00, specializations: JSON.stringify(['פרגולות', 'סככות', 'מעקות']),
        vehicle: 'פיאט דוקטו', tools_provided: true, bank_name: 'לאומי', bank_branch: '790', bank_account: '11223344'
      }
    ];

    for (const ins of seedInstallers) {
      await pool.query(`
        INSERT INTO installers (installer_code, full_name, phone, phone2, email, id_number, address, city, region,
          installer_type, payment_model, rate_per_meter, rate_percentage, specializations, vehicle, tools_provided,
          bank_name, bank_branch, bank_account)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        ON CONFLICT (installer_code) DO NOTHING
      `, [ins.code, ins.name, ins.phone, ins.phone2, ins.email, ins.id_number, ins.address, ins.city, ins.region,
          ins.type, ins.payment_model, ins.rate_per_meter || null, ins.rate_percentage || null,
          ins.specializations, ins.vehicle, ins.tools_provided, ins.bank_name, ins.bank_branch, ins.bank_account]);
    }

    // עבודות התקנה לדוגמה
    const seedJobs = [
      {
        job_number: 'JOB-2026-001', project_id: 1, customer_name: 'חברת אופק בע"מ',
        customer_phone: '03-9999999', customer_address: 'אזור תעשייה הרצליה', customer_city: 'הרצליה',
        installer_id: 1, installer_name: 'יוסי כהן', products: JSON.stringify([{ name: 'גדר רשת', meters: 120 }]),
        total_meters: 120, payment_model: 'per_meter', scheduled_date: '2026-03-28', status: 'assigned',
        scheduled_time_from: '08:00', scheduled_time_to: '16:00'
      },
      {
        job_number: 'JOB-2026-002', project_id: 2, customer_name: 'משפחת ישראלי',
        customer_phone: '054-8888888', customer_address: 'רחוב האלון 12, כפר סבא', customer_city: 'כפר סבא',
        installer_id: 2, installer_name: 'מוחמד חסן', products: JSON.stringify([{ name: 'מעקה ברזל', meters: 25 }]),
        total_meters: 25, payment_model: 'per_meter', scheduled_date: '2026-03-26', status: 'in_progress',
        scheduled_time_from: '09:00', scheduled_time_to: '14:00'
      },
      {
        job_number: 'JOB-2026-003', project_id: 3, customer_name: 'עיריית נתניה',
        customer_phone: '09-7777777', customer_address: 'גן העצמאות, נתניה', customer_city: 'נתניה',
        installer_id: 3, installer_name: 'אלון לוי', products: JSON.stringify([{ name: 'קונסטרוקציית פלדה', sqm: 200 }]),
        total_sqm: 200, payment_model: 'percentage', scheduled_date: '2026-04-01', status: 'pending',
        scheduled_time_from: '07:00', scheduled_time_to: '17:00'
      }
    ];

    for (const job of seedJobs) {
      await pool.query(`
        INSERT INTO installation_jobs (job_number, project_id, customer_name, customer_phone, customer_address,
          customer_city, installer_id, installer_name, products, total_meters, total_sqm, payment_model,
          scheduled_date, status, scheduled_time_from, scheduled_time_to)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT (job_number) DO NOTHING
      `, [job.job_number, job.project_id, job.customer_name, job.customer_phone, job.customer_address,
          job.customer_city, job.installer_id, job.installer_name, job.products,
          job.total_meters || null, job.total_sqm || null, job.payment_model,
          job.scheduled_date, job.status, job.scheduled_time_from, job.scheduled_time_to]);
    }

    res.json({ message: "אתחול מנוע מתקינים הושלם בהצלחה", tables: ['installers', 'installation_jobs', 'installer_monthly_summary'], seeded: { installers: 5, jobs: 3 } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// CRUD מתקינים
// ============================================================

// קבלת כל המתקינים
router.get("/installers", async (req, res) => {
  try {
    await ensureTables();
    const { status, region, type, search } = req.query;
    let query = "SELECT * FROM installers WHERE 1=1";
    const params: any[] = [];
    let idx = 1;

    if (status) { query += ` AND availability_status = $${idx++}`; params.push(status); }
    if (region) { query += ` AND region = $${idx++}`; params.push(region); }
    if (type) { query += ` AND installer_type = $${idx++}`; params.push(type); }
    if (search) { query += ` AND (full_name ILIKE $${idx} OR installer_code ILIKE $${idx} OR phone ILIKE $${idx})`; params.push(`%${search}%`); idx++; }

    query += " ORDER BY created_at DESC";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// מתקין בודד
router.get("/installers/:id", async (req, res) => {
  try {
    await ensureTables();
    const result = await pool.query("SELECT * FROM installers WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "מתקין לא נמצא" });
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// הוספת מתקין חדש
router.post("/installers", async (req, res) => {
  try {
    await ensureTables();
    const b = req.body;
    const result = await pool.query(`
      INSERT INTO installers (installer_code, full_name, phone, phone2, email, id_number, address, city, region,
        installer_type, payment_model, rate_per_meter, rate_percentage, bonus_percentage, specializations,
        vehicle, tools_provided, insurance_valid_until, contract_signed, contract_id,
        bank_name, bank_branch, bank_account, documents, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
      RETURNING *
    `, [b.installer_code, b.full_name, b.phone, b.phone2, b.email, b.id_number, b.address, b.city, b.region,
        b.installer_type, b.payment_model, b.rate_per_meter, b.rate_percentage, b.bonus_percentage,
        JSON.stringify(b.specializations || []), b.vehicle, b.tools_provided, b.insurance_valid_until,
        b.contract_signed, b.contract_id, b.bank_name, b.bank_branch, b.bank_account,
        JSON.stringify(b.documents || []), b.notes]);
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// עדכון מתקין
router.put("/installers/:id", async (req, res) => {
  try {
    await ensureTables();
    const b = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    // בניית שאילתת עדכון דינמית
    const allowedFields = [
      'installer_code', 'full_name', 'phone', 'phone2', 'email', 'id_number', 'address', 'city', 'region',
      'installer_type', 'payment_model', 'rate_per_meter', 'rate_percentage', 'bonus_percentage',
      'specializations', 'rating', 'total_projects', 'total_revenue_generated', 'total_paid', 'balance_owed',
      'availability_status', 'vehicle', 'tools_provided', 'insurance_valid_until', 'contract_signed',
      'contract_id', 'bank_name', 'bank_branch', 'bank_account', 'documents', 'notes', 'is_active'
    ];

    for (const field of allowedFields) {
      if (b[field] !== undefined) {
        fields.push(`${field} = $${idx++}`);
        values.push(field === 'specializations' || field === 'documents' ? JSON.stringify(b[field]) : b[field]);
      }
    }

    if (fields.length === 0) return res.status(400).json({ error: "לא נשלחו שדות לעדכון" });

    fields.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE installers SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "מתקין לא נמצא" });
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// מחיקה רכה של מתקין
router.delete("/installers/:id", async (req, res) => {
  try {
    await ensureTables();
    const result = await pool.query(
      "UPDATE installers SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "מתקין לא נמצא" });
    res.json({ message: "מתקין הועבר ללא פעיל", installer: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// CRUD עבודות התקנה
// ============================================================

// כל העבודות
router.get("/jobs", async (req, res) => {
  try {
    await ensureTables();
    const { status, installer_id, customer_city, from_date, to_date } = req.query;
    let query = "SELECT * FROM installation_jobs WHERE 1=1";
    const params: any[] = [];
    let idx = 1;

    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (installer_id) { query += ` AND installer_id = $${idx++}`; params.push(installer_id); }
    if (customer_city) { query += ` AND customer_city = $${idx++}`; params.push(customer_city); }
    if (from_date) { query += ` AND scheduled_date >= $${idx++}`; params.push(from_date); }
    if (to_date) { query += ` AND scheduled_date <= $${idx++}`; params.push(to_date); }

    query += " ORDER BY scheduled_date DESC, created_at DESC";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// עבודה בודדת
router.get("/jobs/:id", async (req, res) => {
  try {
    await ensureTables();
    const result = await pool.query("SELECT * FROM installation_jobs WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "עבודה לא נמצאה" });
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// יצירת עבודה חדשה
router.post("/jobs", async (req, res) => {
  try {
    await ensureTables();
    const b = req.body;
    // יצירת מספר עבודה אוטומטי
    const countRes = await pool.query("SELECT COUNT(*) FROM installation_jobs");
    const jobNum = `JOB-2026-${String(parseInt(countRes.rows[0].count) + 1).padStart(3, '0')}`;

    const result = await pool.query(`
      INSERT INTO installation_jobs (job_number, project_id, customer_id, customer_name, customer_phone,
        customer_address, customer_city, installer_id, installer_name, products, total_meters, total_sqm,
        payment_model, scheduled_date, scheduled_time_from, scheduled_time_to, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *
    `, [jobNum, b.project_id, b.customer_id, b.customer_name, b.customer_phone,
        b.customer_address, b.customer_city, b.installer_id, b.installer_name,
        JSON.stringify(b.products || []), b.total_meters, b.total_sqm,
        b.payment_model, b.scheduled_date, b.scheduled_time_from, b.scheduled_time_to, b.status || 'pending']);
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// עדכון עבודה
router.put("/jobs/:id", async (req, res) => {
  try {
    await ensureTables();
    const b = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const allowedFields = [
      'project_id', 'customer_id', 'customer_name', 'customer_phone', 'customer_address', 'customer_city',
      'installer_id', 'installer_name', 'products', 'total_meters', 'total_sqm', 'payment_model',
      'payment_amount', 'payment_calculated', 'scheduled_date', 'scheduled_time_from', 'scheduled_time_to',
      'actual_start', 'actual_end', 'status', 'installation_photos_before', 'installation_photos_after',
      'customer_signed', 'customer_signature_date', 'quality_check', 'quality_notes', 'issues',
      'completion_notes', 'satisfaction_score', 'invoice_number', 'invoice_sent', 'invoice_date',
      'paid', 'paid_date', 'paid_amount', 'documents'
    ];

    const jsonFields = ['products', 'installation_photos_before', 'installation_photos_after', 'issues', 'documents'];

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
      `UPDATE installation_jobs SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "עבודה לא נמצאה" });
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// דשבורד - סקירה כללית של מצב ההתקנות
// ============================================================
router.get("/dashboard", async (req, res) => {
  try {
    await ensureTables();

    // עבודות פעילות
    const activeJobs = await pool.query(
      "SELECT * FROM installation_jobs WHERE status IN ('in_progress', 'assigned') ORDER BY scheduled_date"
    );

    // עבודות קרובות - 7 ימים הבאים
    const upcomingJobs = await pool.query(
      "SELECT * FROM installation_jobs WHERE status = 'pending' AND scheduled_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' ORDER BY scheduled_date"
    );

    // הושלמו החודש
    const completedThisMonth = await pool.query(
      "SELECT * FROM installation_jobs WHERE status = 'completed' AND EXTRACT(MONTH FROM actual_end) = EXTRACT(MONTH FROM NOW()) AND EXTRACT(YEAR FROM actual_end) = EXTRACT(YEAR FROM NOW())"
    );

    // סה\"כ הכנסות החודש
    const monthlyEarnings = await pool.query(
      "SELECT COALESCE(SUM(payment_amount), 0) as total_earnings FROM installation_jobs WHERE status = 'completed' AND EXTRACT(MONTH FROM actual_end) = EXTRACT(MONTH FROM NOW()) AND EXTRACT(YEAR FROM actual_end) = EXTRACT(YEAR FROM NOW())"
    );

    // מתקינים פעילים
    const activeInstallers = await pool.query(
      "SELECT COUNT(*) FROM installers WHERE is_active = true AND availability_status = 'available'"
    );

    // סטטיסטיקות כלליות
    const totalInstallers = await pool.query("SELECT COUNT(*) FROM installers WHERE is_active = true");
    const totalJobs = await pool.query("SELECT COUNT(*) FROM installation_jobs");
    const pendingPayments = await pool.query(
      "SELECT COUNT(*) as count, COALESCE(SUM(payment_amount), 0) as total FROM installation_jobs WHERE status = 'completed' AND paid = false"
    );

    res.json({
      active_jobs: activeJobs.rows,
      upcoming_jobs: upcomingJobs.rows,
      completed_this_month: completedThisMonth.rows,
      monthly_earnings: parseFloat(monthlyEarnings.rows[0].total_earnings),
      available_installers: parseInt(activeInstallers.rows[0].count),
      stats: {
        total_installers: parseInt(totalInstallers.rows[0].count),
        total_jobs: parseInt(totalJobs.rows[0].count),
        pending_payments_count: parseInt(pendingPayments.rows[0].count),
        pending_payments_total: parseFloat(pendingPayments.rows[0].total)
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// לוח עבודות של מתקין ספציפי
// ============================================================
router.get("/installer-schedule/:installerId", async (req, res) => {
  try {
    await ensureTables();
    const { installerId } = req.params;

    // עבודות עתידיות ופעילות
    const upcoming = await pool.query(
      `SELECT * FROM installation_jobs
       WHERE installer_id = $1 AND status IN ('pending', 'assigned', 'in_progress')
       ORDER BY scheduled_date ASC`,
      [installerId]
    );

    // מתקין - פרטים
    const installer = await pool.query("SELECT * FROM installers WHERE id = $1", [installerId]);

    res.json({
      installer: installer.rows[0] || null,
      upcoming_jobs: upcoming.rows,
      total_upcoming: upcoming.rows.length
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// שיבוץ מתקין לעבודה
// ============================================================
router.post("/assign-job/:jobId/:installerId", async (req, res) => {
  try {
    await ensureTables();
    const { jobId, installerId } = req.params;

    // אימות שהמתקין קיים ופנוי
    const installer = await pool.query("SELECT * FROM installers WHERE id = $1 AND is_active = true", [installerId]);
    if (installer.rows.length === 0) return res.status(404).json({ error: "מתקין לא נמצא או לא פעיל" });

    // עדכון העבודה עם המתקין
    const result = await pool.query(`
      UPDATE installation_jobs
      SET installer_id = $1, installer_name = $2, status = 'assigned',
          payment_model = COALESCE(payment_model, $3), updated_at = NOW()
      WHERE id = $4 RETURNING *
    `, [installerId, installer.rows[0].full_name, installer.rows[0].payment_model, jobId]);

    if (result.rows.length === 0) return res.status(404).json({ error: "עבודה לא נמצאה" });

    // עדכון סטטוס מתקין ל'תפוס' אם צריך
    await pool.query(
      "UPDATE installers SET availability_status = 'busy', updated_at = NOW() WHERE id = $1",
      [installerId]
    );

    res.json({ message: "מתקין שובץ בהצלחה", job: result.rows[0], installer: installer.rows[0].full_name });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// התחלת עבודה
// ============================================================
router.post("/start-job/:jobId", async (req, res) => {
  try {
    await ensureTables();
    const { jobId } = req.params;
    const { photos_before } = req.body;

    const result = await pool.query(`
      UPDATE installation_jobs
      SET status = 'in_progress', actual_start = NOW(),
          installation_photos_before = COALESCE($2, installation_photos_before),
          updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [jobId, photos_before ? JSON.stringify(photos_before) : null]);

    if (result.rows.length === 0) return res.status(404).json({ error: "עבודה לא נמצאה" });
    res.json({ message: "העבודה התחילה", job: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// סיום עבודה - עם תמונות וחתימת לקוח
// ============================================================
router.post("/complete-job/:jobId", async (req, res) => {
  try {
    await ensureTables();
    const { jobId } = req.params;
    const { photos_after, customer_signed, completion_notes, satisfaction_score, quality_notes } = req.body;

    const result = await pool.query(`
      UPDATE installation_jobs
      SET status = 'completed', actual_end = NOW(),
          installation_photos_after = COALESCE($2, installation_photos_after),
          customer_signed = COALESCE($3, false),
          customer_signature_date = CASE WHEN $3 = true THEN NOW() ELSE NULL END,
          completion_notes = COALESCE($4, completion_notes),
          satisfaction_score = COALESCE($5, satisfaction_score),
          quality_notes = COALESCE($6, quality_notes),
          quality_check = 'passed',
          updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [jobId, photos_after ? JSON.stringify(photos_after) : null, customer_signed, completion_notes, satisfaction_score, quality_notes]);

    if (result.rows.length === 0) return res.status(404).json({ error: "עבודה לא נמצאה" });

    // שחרור המתקין - בדיקה אם יש עוד עבודות פעילות
    const job = result.rows[0];
    if (job.installer_id) {
      const otherActive = await pool.query(
        "SELECT COUNT(*) FROM installation_jobs WHERE installer_id = $1 AND status IN ('in_progress', 'assigned') AND id != $2",
        [job.installer_id, jobId]
      );
      if (parseInt(otherActive.rows[0].count) === 0) {
        await pool.query(
          "UPDATE installers SET availability_status = 'available', total_projects = total_projects + 1, updated_at = NOW() WHERE id = $1",
          [job.installer_id]
        );
      }
    }

    res.json({ message: "העבודה הושלמה בהצלחה", job: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// חישוב תשלום לעבודה - לפי מטר או אחוז
// ============================================================
router.post("/calculate-payment/:jobId", async (req, res) => {
  try {
    await ensureTables();
    const { jobId } = req.params;
    const { project_total_amount } = req.body; // סכום כולל הפרויקט - לחישוב אחוזי

    const job = await pool.query("SELECT * FROM installation_jobs WHERE id = $1", [jobId]);
    if (job.rows.length === 0) return res.status(404).json({ error: "עבודה לא נמצאה" });

    const jobData = job.rows[0];

    // שליפת פרטי מתקין
    const installer = await pool.query("SELECT * FROM installers WHERE id = $1", [jobData.installer_id]);
    if (installer.rows.length === 0) return res.status(404).json({ error: "מתקין לא נמצא" });

    const ins = installer.rows[0];
    let paymentAmount = 0;
    let model = jobData.payment_model || ins.payment_model;

    if (model === 'per_meter') {
      // חישוב לפי מטרים
      const meters = parseFloat(jobData.total_meters) || 0;
      const rate = parseFloat(ins.rate_per_meter) || 0;
      paymentAmount = meters * rate;

      // בונוס אם מוגדר
      if (parseFloat(ins.bonus_percentage) > 0) {
        paymentAmount += paymentAmount * (parseFloat(ins.bonus_percentage) / 100);
      }
    } else if (model === 'percentage') {
      // חישוב לפי אחוז מהפרויקט
      const totalAmount = project_total_amount || 0;
      const percentage = parseFloat(ins.rate_percentage) || 0;
      paymentAmount = totalAmount * (percentage / 100);
    }

    // עדכון העבודה עם הסכום
    const updated = await pool.query(`
      UPDATE installation_jobs
      SET payment_amount = $2, payment_calculated = true, payment_model = $3, updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [jobId, paymentAmount, model]);

    // עדכון יתרה למתקין
    await pool.query(`
      UPDATE installers
      SET balance_owed = balance_owed + $2, total_revenue_generated = total_revenue_generated + COALESCE($3, 0), updated_at = NOW()
      WHERE id = $1
    `, [ins.id, paymentAmount, project_total_amount]);

    res.json({
      message: "חישוב תשלום הושלם",
      job_id: jobId,
      model: model,
      payment_amount: paymentAmount,
      calculation_details: model === 'per_meter'
        ? { meters: jobData.total_meters, rate: ins.rate_per_meter, bonus: ins.bonus_percentage }
        : { project_total: project_total_amount, percentage: ins.rate_percentage },
      job: updated.rows[0]
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// סיכום חודשי למתקין
// ============================================================
router.get("/monthly-summary/:installerId/:month", async (req, res) => {
  try {
    await ensureTables();
    const { installerId, month } = req.params; // month בפורמט YYYY-MM
    const [year, mon] = month.split("-");

    // שליפת עבודות של המתקין בחודש
    const jobs = await pool.query(`
      SELECT * FROM installation_jobs
      WHERE installer_id = $1
        AND EXTRACT(MONTH FROM scheduled_date) = $2
        AND EXTRACT(YEAR FROM scheduled_date) = $3
      ORDER BY scheduled_date
    `, [installerId, parseInt(mon), parseInt(year)]);

    // חישוב סיכומים
    const totalJobs = jobs.rows.length;
    const completedJobs = jobs.rows.filter((j: any) => j.status === 'completed');
    const totalMeters = jobs.rows.reduce((sum: number, j: any) => sum + (parseFloat(j.total_meters) || 0), 0);
    const totalSqm = jobs.rows.reduce((sum: number, j: any) => sum + (parseFloat(j.total_sqm) || 0), 0);
    const totalEarned = jobs.rows.reduce((sum: number, j: any) => sum + (parseFloat(j.payment_amount) || 0), 0);
    const paidJobs = jobs.rows.filter((j: any) => j.paid === true);
    const totalPaid = paidJobs.reduce((sum: number, j: any) => sum + (parseFloat(j.paid_amount) || 0), 0);
    const avgSatisfaction = completedJobs.length > 0
      ? completedJobs.reduce((sum: number, j: any) => sum + (j.satisfaction_score || 0), 0) / completedJobs.length
      : null;

    // בדיקה אם כבר יש סיכום
    const existingSummary = await pool.query(
      "SELECT * FROM installer_monthly_summary WHERE installer_id = $1 AND month = $2 AND year = $3",
      [installerId, mon, parseInt(year)]
    );

    // מתקין
    const installer = await pool.query("SELECT * FROM installers WHERE id = $1", [installerId]);

    // עדכון או יצירת סיכום
    let summary;
    if (existingSummary.rows.length > 0) {
      summary = await pool.query(`
        UPDATE installer_monthly_summary
        SET total_jobs = $4, total_meters = $5, total_sqm = $6, total_earned = $7, total_paid = $8,
            balance = $9, avg_satisfaction = $10, projects_detail = $11
        WHERE installer_id = $1 AND month = $2 AND year = $3 RETURNING *
      `, [installerId, mon, parseInt(year), totalJobs, totalMeters, totalSqm, totalEarned, totalPaid,
          totalEarned - totalPaid, avgSatisfaction, JSON.stringify(jobs.rows)]);
    } else {
      summary = await pool.query(`
        INSERT INTO installer_monthly_summary (installer_id, installer_name, month, year, total_jobs, total_meters,
          total_sqm, total_earned, total_paid, balance, avg_satisfaction, projects_detail)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `, [installerId, installer.rows[0]?.full_name, mon, parseInt(year), totalJobs, totalMeters,
          totalSqm, totalEarned, totalPaid, totalEarned - totalPaid, avgSatisfaction, JSON.stringify(jobs.rows)]);
    }

    res.json({
      summary: summary.rows[0],
      jobs: jobs.rows,
      stats: { totalJobs, completedJobs: completedJobs.length, totalMeters, totalSqm, totalEarned, totalPaid, balance: totalEarned - totalPaid }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// יצירת חשבונית חודשית למתקין
// ============================================================
router.post("/generate-monthly-invoice/:installerId/:month", async (req, res) => {
  try {
    await ensureTables();
    const { installerId, month } = req.params; // month = YYYY-MM
    const [year, mon] = month.split("-");

    // שליפת כל העבודות שהושלמו ולא שולמו בחודש
    const jobs = await pool.query(`
      SELECT * FROM installation_jobs
      WHERE installer_id = $1
        AND status = 'completed'
        AND paid = false
        AND EXTRACT(MONTH FROM scheduled_date) = $2
        AND EXTRACT(YEAR FROM scheduled_date) = $3
    `, [installerId, parseInt(mon), parseInt(year)]);

    if (jobs.rows.length === 0) return res.json({ message: "אין עבודות לחיוב בחודש זה" });

    const totalAmount = jobs.rows.reduce((sum: number, j: any) => sum + (parseFloat(j.payment_amount) || 0), 0);
    const invoiceNumber = `INV-${installerId}-${month}`;

    // עדכון כל העבודות עם מספר חשבונית
    for (const job of jobs.rows) {
      await pool.query(`
        UPDATE installation_jobs SET invoice_number = $2, invoice_sent = true, invoice_date = CURRENT_DATE, updated_at = NOW()
        WHERE id = $1
      `, [job.id, invoiceNumber]);
    }

    // עדכון סיכום חודשי
    await pool.query(`
      UPDATE installer_monthly_summary
      SET invoice_sent = true, invoice_number = $4
      WHERE installer_id = $1 AND month = $2 AND year = $3
    `, [installerId, mon, parseInt(year), invoiceNumber]);

    const installer = await pool.query("SELECT * FROM installers WHERE id = $1", [installerId]);

    res.json({
      message: "חשבונית חודשית נוצרה בהצלחה",
      invoice: {
        invoice_number: invoiceNumber,
        installer: installer.rows[0]?.full_name,
        month: month,
        total_jobs: jobs.rows.length,
        total_amount: totalAmount,
        jobs: jobs.rows.map((j: any) => ({ id: j.id, job_number: j.job_number, customer: j.customer_name, amount: j.payment_amount }))
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// דוח הכנסות לפי תקופה
// ============================================================
router.get("/earnings-report/:period", async (req, res) => {
  try {
    await ensureTables();
    const { period } = req.params; // week, month, quarter, year

    let dateFilter = "";
    switch (period) {
      case 'week': dateFilter = "AND scheduled_date >= CURRENT_DATE - INTERVAL '7 days'"; break;
      case 'month': dateFilter = "AND EXTRACT(MONTH FROM scheduled_date) = EXTRACT(MONTH FROM NOW()) AND EXTRACT(YEAR FROM scheduled_date) = EXTRACT(YEAR FROM NOW())"; break;
      case 'quarter': dateFilter = "AND scheduled_date >= DATE_TRUNC('quarter', NOW())"; break;
      case 'year': dateFilter = "AND EXTRACT(YEAR FROM scheduled_date) = EXTRACT(YEAR FROM NOW())"; break;
      default: dateFilter = "";
    }

    // הכנסות לפי מתקין
    const byInstaller = await pool.query(`
      SELECT installer_id, installer_name,
        COUNT(*) as total_jobs,
        SUM(COALESCE(total_meters, 0)) as total_meters,
        SUM(COALESCE(payment_amount, 0)) as total_earned,
        SUM(CASE WHEN paid = true THEN COALESCE(paid_amount, 0) ELSE 0 END) as total_paid,
        AVG(satisfaction_score) as avg_satisfaction
      FROM installation_jobs
      WHERE status = 'completed' ${dateFilter}
      GROUP BY installer_id, installer_name
      ORDER BY total_earned DESC
    `);

    // סה\"כ
    const totals = await pool.query(`
      SELECT
        COUNT(*) as total_jobs,
        SUM(COALESCE(payment_amount, 0)) as total_earned,
        SUM(CASE WHEN paid = true THEN COALESCE(paid_amount, 0) ELSE 0 END) as total_paid,
        AVG(satisfaction_score) as avg_satisfaction
      FROM installation_jobs
      WHERE status = 'completed' ${dateFilter}
    `);

    res.json({
      period,
      by_installer: byInstaller.rows,
      totals: totals.rows[0]
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// דוח איכות - כל המתקינים מדורגים
// ============================================================
router.get("/quality-report", async (_req, res) => {
  try {
    await ensureTables();

    const report = await pool.query(`
      SELECT
        i.id, i.installer_code, i.full_name, i.rating, i.total_projects,
        COUNT(j.id) as total_jobs,
        AVG(j.satisfaction_score) as avg_satisfaction,
        SUM(CASE WHEN j.quality_check = 'passed' THEN 1 ELSE 0 END) as quality_passed,
        SUM(CASE WHEN j.quality_check = 'failed' THEN 1 ELSE 0 END) as quality_failed,
        COUNT(CASE WHEN j.issues::text != '[]' AND j.issues::text != 'null' THEN 1 END) as jobs_with_issues,
        SUM(COALESCE(j.total_meters, 0)) as total_meters_installed
      FROM installers i
      LEFT JOIN installation_jobs j ON j.installer_id = i.id AND j.status = 'completed'
      WHERE i.is_active = true
      GROUP BY i.id, i.installer_code, i.full_name, i.rating, i.total_projects
      ORDER BY avg_satisfaction DESC NULLS LAST, i.rating DESC
    `);

    res.json({
      report: report.rows,
      total_installers: report.rows.length
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// זמינות מתקינים - מי פנוי ומתי
// ============================================================
router.get("/availability", async (req, res) => {
  try {
    await ensureTables();
    const { date, region } = req.query;

    // מתקינים פנויים
    let query = `
      SELECT i.*,
        (SELECT COUNT(*) FROM installation_jobs j WHERE j.installer_id = i.id AND j.status IN ('assigned', 'in_progress')) as active_jobs,
        (SELECT MIN(j.scheduled_date) FROM installation_jobs j WHERE j.installer_id = i.id AND j.status = 'assigned' AND j.scheduled_date >= CURRENT_DATE) as next_job_date
      FROM installers i
      WHERE i.is_active = true
    `;
    const params: any[] = [];
    let idx = 1;

    if (region) { query += ` AND i.region = $${idx++}`; params.push(region); }

    query += " ORDER BY i.availability_status, i.rating DESC";
    const result = await pool.query(query, params);

    // אם צריך לבדוק תאריך ספציפי
    let availableOnDate: any[] = [];
    if (date) {
      const busyOnDate = await pool.query(
        "SELECT DISTINCT installer_id FROM installation_jobs WHERE scheduled_date = $1 AND status IN ('assigned', 'in_progress', 'pending')",
        [date]
      );
      const busyIds = busyOnDate.rows.map((r: any) => r.installer_id);
      availableOnDate = result.rows.filter((i: any) => !busyIds.includes(i.id));
    }

    res.json({
      all_installers: result.rows,
      available_on_date: date ? availableOnDate : undefined,
      date_checked: date || null
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// שליחת פרטי עבודה למתקין בוואטסאפ
// ============================================================
router.post("/send-job-details/:jobId", async (req, res) => {
  try {
    await ensureTables();
    const { jobId } = req.params;

    const job = await pool.query("SELECT * FROM installation_jobs WHERE id = $1", [jobId]);
    if (job.rows.length === 0) return res.status(404).json({ error: "עבודה לא נמצאה" });

    const jobData = job.rows[0];
    const installer = await pool.query("SELECT * FROM installers WHERE id = $1", [jobData.installer_id]);

    if (installer.rows.length === 0) return res.status(404).json({ error: "מתקין לא נמצא" });

    // בניית הודעת וואטסאפ
    const message = `
🔧 *פרטי עבודת התקנה #${jobData.job_number}*

📅 תאריך: ${jobData.scheduled_date}
⏰ שעות: ${jobData.scheduled_time_from} - ${jobData.scheduled_time_to}

👤 לקוח: ${jobData.customer_name}
📞 טלפון: ${jobData.customer_phone}
📍 כתובת: ${jobData.customer_address}, ${jobData.customer_city}

📦 מוצרים: ${JSON.stringify(jobData.products)}
📏 מטרים: ${jobData.total_meters || '-'}
📐 מ"ר: ${jobData.total_sqm || '-'}

💰 מודל תשלום: ${jobData.payment_model}

📝 הערות: ${jobData.completion_notes || 'אין'}
    `.trim();

    const phone = installer.rows[0].phone?.replace(/[-\s]/g, '');
    const whatsappUrl = `https://wa.me/972${phone?.substring(1)}?text=${encodeURIComponent(message)}`;

    res.json({
      message: "פרטי עבודה מוכנים לשליחה",
      whatsapp_url: whatsappUrl,
      whatsapp_message: message,
      installer_phone: installer.rows[0].phone,
      installer_name: installer.rows[0].full_name
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// CRUD סיכומים חודשיים
// ============================================================
router.get("/monthly-summaries", async (req, res) => {
  try {
    await ensureTables();
    const { year, month, installer_id } = req.query;
    let query = "SELECT * FROM installer_monthly_summary WHERE 1=1";
    const params: any[] = [];
    let idx = 1;

    if (year) { query += ` AND year = $${idx++}`; params.push(year); }
    if (month) { query += ` AND month = $${idx++}`; params.push(month); }
    if (installer_id) { query += ` AND installer_id = $${idx++}`; params.push(installer_id); }

    query += " ORDER BY year DESC, month DESC";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
