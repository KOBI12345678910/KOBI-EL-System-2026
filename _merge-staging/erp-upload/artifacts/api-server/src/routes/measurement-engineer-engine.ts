// ============================================================
// מנוע ניהול מודדים / מהנדסי מדידה - מדידות שטח
// ניהול מלא של מודדים, פגישות מדידה, אישורים ופערי מדידה
// ============================================================

import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ============================================================
// יצירת טבלאות - מודדים, פגישות מדידה, פערי מדידה
// ============================================================
async function ensureTables() {
  await pool.query(`
    -- טבלת מהנדסי מדידה
    CREATE TABLE IF NOT EXISTS measurement_engineers (
      id SERIAL PRIMARY KEY,
      engineer_code VARCHAR UNIQUE,
      full_name VARCHAR NOT NULL,
      phone VARCHAR,
      email VARCHAR,
      specialization VARCHAR,
      equipment JSONB DEFAULT '[]',
      certifications JSONB DEFAULT '[]',
      total_measurements INTEGER DEFAULT 0,
      avg_accuracy_score NUMERIC(3,1) DEFAULT 5.0,
      availability_status VARCHAR DEFAULT 'available',
      vehicle VARCHAR,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- טבלת פגישות מדידה
    CREATE TABLE IF NOT EXISTS measurement_appointments (
      id SERIAL PRIMARY KEY,
      appointment_number VARCHAR UNIQUE,
      project_id INTEGER,
      customer_id INTEGER,
      customer_name VARCHAR NOT NULL,
      customer_phone VARCHAR,
      customer_address TEXT NOT NULL,
      customer_city VARCHAR,
      engineer_id INTEGER REFERENCES measurement_engineers(id),
      engineer_name VARCHAR,
      sales_agent_id INTEGER,
      sales_agent_name VARCHAR,
      scheduled_date DATE NOT NULL,
      scheduled_time VARCHAR,
      confirmed_by_customer BOOLEAN DEFAULT false,
      confirmed_at TIMESTAMPTZ,
      reminder_sent BOOLEAN DEFAULT false,
      status VARCHAR DEFAULT 'scheduled',
      arrival_time TIMESTAMPTZ,
      departure_time TIMESTAMPTZ,
      duration_minutes INTEGER,
      measurements_data JSONB DEFAULT '{}',
      measurement_photos JSONB DEFAULT '[]',
      site_photos JSONB DEFAULT '[]',
      sketch_url TEXT,
      special_requirements TEXT,
      obstacles TEXT,
      customer_notes TEXT,
      engineer_notes TEXT,
      customer_signature BOOLEAN DEFAULT false,
      customer_signature_date TIMESTAMPTZ,
      comparison_with_quote JSONB,
      discrepancy_found BOOLEAN DEFAULT false,
      discrepancy_details TEXT,
      discrepancy_alert_sent BOOLEAN DEFAULT false,
      approved_for_production BOOLEAN DEFAULT false,
      approved_by VARCHAR,
      approved_at TIMESTAMPTZ,
      documents JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- טבלת פערי מדידה
    CREATE TABLE IF NOT EXISTS measurement_discrepancies (
      id SERIAL PRIMARY KEY,
      appointment_id INTEGER REFERENCES measurement_appointments(id),
      project_id INTEGER,
      field VARCHAR NOT NULL,
      quote_value VARCHAR,
      measured_value VARCHAR,
      difference_percent NUMERIC(5,2),
      severity VARCHAR DEFAULT 'medium',
      resolved BOOLEAN DEFAULT false,
      resolved_by VARCHAR,
      resolved_at TIMESTAMPTZ,
      resolution_notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

// ============================================================
// אתחול טבלאות + נתוני דוגמה - 3 מודדים
// ============================================================
router.post("/init", async (_req, res) => {
  try {
    await ensureTables();

    const existing = await pool.query("SELECT COUNT(*) FROM measurement_engineers");
    if (parseInt(existing.rows[0].count) > 0) {
      return res.json({ message: "טבלאות כבר קיימות עם נתונים", initialized: true });
    }

    // מודדים לדוגמה
    const seedEngineers = [
      {
        code: 'ENG-001', name: 'רון אברהמי', phone: '050-6111111', email: 'ron@measure.co.il',
        specialization: 'מדידות פלדה ומתכת', equipment: JSON.stringify(['לייזר מטר Leica', 'פלס דיגיטלי', 'גלגל מדידה']),
        certifications: JSON.stringify(['מודד מוסמך', 'בטיחות בגובה']), vehicle: 'סקודה אוקטביה'
      },
      {
        code: 'ENG-002', name: 'עומר חדד', phone: '050-6222222', email: 'omer@measure.co.il',
        specialization: 'מדידות קונסטרוקציה', equipment: JSON.stringify(['לייזר מטר Bosch', 'מד זווית דיגיטלי', 'דרון DJI']),
        certifications: JSON.stringify(['מודד מוסמך', 'הפעלת רחפן']), vehicle: 'יונדאי טוסון'
      },
      {
        code: 'ENG-003', name: 'נועם פרידמן', phone: '050-6333333', email: 'noam@measure.co.il',
        specialization: 'מדידות גדרות ושערים', equipment: JSON.stringify(['לייזר מטר', 'פלס', 'סרט מדידה 50מ']),
        certifications: JSON.stringify(['מודד מוסמך']), vehicle: 'קיה ספורטאג'
      }
    ];

    for (const eng of seedEngineers) {
      await pool.query(`
        INSERT INTO measurement_engineers (engineer_code, full_name, phone, email, specialization, equipment, certifications, vehicle)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (engineer_code) DO NOTHING
      `, [eng.code, eng.name, eng.phone, eng.email, eng.specialization, eng.equipment, eng.certifications, eng.vehicle]);
    }

    // פגישות מדידה לדוגמה
    const seedAppointments = [
      {
        number: 'MA-2026-001', customer_name: 'חברת אופק בע"מ', customer_phone: '03-9999999',
        customer_address: 'אזור תעשייה הרצליה', customer_city: 'הרצליה',
        engineer_id: 1, engineer_name: 'רון אברהמי', sales_agent_name: 'שלמה סוכן',
        scheduled_date: '2026-03-27', scheduled_time: '09:00', status: 'scheduled'
      },
      {
        number: 'MA-2026-002', customer_name: 'משפחת כהן', customer_phone: '054-7777777',
        customer_address: 'רחוב הדקל 5', customer_city: 'רעננה',
        engineer_id: 2, engineer_name: 'עומר חדד', sales_agent_name: 'דני מכירות',
        scheduled_date: '2026-03-26', scheduled_time: '11:00', status: 'in_progress'
      },
      {
        number: 'MA-2026-003', customer_name: 'עיריית נתניה', customer_phone: '09-7777777',
        customer_address: 'גן העצמאות', customer_city: 'נתניה',
        engineer_id: 3, engineer_name: 'נועם פרידמן', sales_agent_name: 'שלמה סוכן',
        scheduled_date: '2026-03-30', scheduled_time: '08:00', status: 'scheduled'
      }
    ];

    for (const appt of seedAppointments) {
      await pool.query(`
        INSERT INTO measurement_appointments (appointment_number, customer_name, customer_phone, customer_address,
          customer_city, engineer_id, engineer_name, sales_agent_name, scheduled_date, scheduled_time, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (appointment_number) DO NOTHING
      `, [appt.number, appt.customer_name, appt.customer_phone, appt.customer_address,
          appt.customer_city, appt.engineer_id, appt.engineer_name, appt.sales_agent_name,
          appt.scheduled_date, appt.scheduled_time, appt.status]);
    }

    res.json({
      message: "אתחול מנוע מודדים הושלם בהצלחה",
      tables: ['measurement_engineers', 'measurement_appointments', 'measurement_discrepancies'],
      seeded: { engineers: 3, appointments: 3 }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// CRUD מודדים
// ============================================================

// כל המודדים
router.get("/engineers", async (req, res) => {
  try {
    await ensureTables();
    const { status, search } = req.query;
    let query = "SELECT * FROM measurement_engineers WHERE is_active = true";
    const params: any[] = [];
    let idx = 1;

    if (status) { query += ` AND availability_status = $${idx++}`; params.push(status); }
    if (search) { query += ` AND (full_name ILIKE $${idx} OR engineer_code ILIKE $${idx})`; params.push(`%${search}%`); idx++; }

    query += " ORDER BY created_at DESC";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// מודד בודד
router.get("/engineers/:id", async (req, res) => {
  try {
    await ensureTables();
    const result = await pool.query("SELECT * FROM measurement_engineers WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "מודד לא נמצא" });
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// הוספת מודד
router.post("/engineers", async (req, res) => {
  try {
    await ensureTables();
    const b = req.body;
    const result = await pool.query(`
      INSERT INTO measurement_engineers (engineer_code, full_name, phone, email, specialization, equipment, certifications, vehicle)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [b.engineer_code, b.full_name, b.phone, b.email, b.specialization,
        JSON.stringify(b.equipment || []), JSON.stringify(b.certifications || []), b.vehicle]);
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// עדכון מודד
router.put("/engineers/:id", async (req, res) => {
  try {
    await ensureTables();
    const b = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const allowedFields = [
      'engineer_code', 'full_name', 'phone', 'email', 'specialization', 'equipment', 'certifications',
      'total_measurements', 'avg_accuracy_score', 'availability_status', 'vehicle', 'is_active'
    ];
    const jsonFields = ['equipment', 'certifications'];

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
      `UPDATE measurement_engineers SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "מודד לא נמצא" });
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// מחיקה רכה של מודד
router.delete("/engineers/:id", async (req, res) => {
  try {
    await ensureTables();
    const result = await pool.query(
      "UPDATE measurement_engineers SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "מודד לא נמצא" });
    res.json({ message: "מודד הועבר ללא פעיל", engineer: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// CRUD פגישות מדידה
// ============================================================

// כל הפגישות
router.get("/appointments", async (req, res) => {
  try {
    await ensureTables();
    const { status, engineer_id, from_date, to_date, search } = req.query;
    let query = "SELECT * FROM measurement_appointments WHERE 1=1";
    const params: any[] = [];
    let idx = 1;

    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (engineer_id) { query += ` AND engineer_id = $${idx++}`; params.push(engineer_id); }
    if (from_date) { query += ` AND scheduled_date >= $${idx++}`; params.push(from_date); }
    if (to_date) { query += ` AND scheduled_date <= $${idx++}`; params.push(to_date); }
    if (search) { query += ` AND (customer_name ILIKE $${idx} OR appointment_number ILIKE $${idx})`; params.push(`%${search}%`); idx++; }

    query += " ORDER BY scheduled_date DESC, scheduled_time DESC";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// פגישה בודדת
router.get("/appointments/:id", async (req, res) => {
  try {
    await ensureTables();
    const result = await pool.query("SELECT * FROM measurement_appointments WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "פגישת מדידה לא נמצאה" });
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// יצירת פגישה
router.post("/appointments", async (req, res) => {
  try {
    await ensureTables();
    const b = req.body;
    const countRes = await pool.query("SELECT COUNT(*) FROM measurement_appointments");
    const apptNum = `MA-2026-${String(parseInt(countRes.rows[0].count) + 1).padStart(3, '0')}`;

    const result = await pool.query(`
      INSERT INTO measurement_appointments (appointment_number, project_id, customer_id, customer_name, customer_phone,
        customer_address, customer_city, engineer_id, engineer_name, sales_agent_id, sales_agent_name,
        scheduled_date, scheduled_time, special_requirements, customer_notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *
    `, [apptNum, b.project_id, b.customer_id, b.customer_name, b.customer_phone,
        b.customer_address, b.customer_city, b.engineer_id, b.engineer_name,
        b.sales_agent_id, b.sales_agent_name, b.scheduled_date, b.scheduled_time,
        b.special_requirements, b.customer_notes]);
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// עדכון פגישה
router.put("/appointments/:id", async (req, res) => {
  try {
    await ensureTables();
    const b = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const allowedFields = [
      'project_id', 'customer_id', 'customer_name', 'customer_phone', 'customer_address', 'customer_city',
      'engineer_id', 'engineer_name', 'sales_agent_id', 'sales_agent_name', 'scheduled_date', 'scheduled_time',
      'confirmed_by_customer', 'confirmed_at', 'reminder_sent', 'status', 'arrival_time', 'departure_time',
      'duration_minutes', 'measurements_data', 'measurement_photos', 'site_photos', 'sketch_url',
      'special_requirements', 'obstacles', 'customer_notes', 'engineer_notes', 'customer_signature',
      'customer_signature_date', 'comparison_with_quote', 'discrepancy_found', 'discrepancy_details',
      'discrepancy_alert_sent', 'approved_for_production', 'approved_by', 'approved_at', 'documents'
    ];
    const jsonFields = ['measurements_data', 'measurement_photos', 'site_photos', 'comparison_with_quote', 'documents'];

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
      `UPDATE measurement_appointments SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "פגישה לא נמצאה" });
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// דשבורד - סקירה כללית של מדידות
// ============================================================
router.get("/dashboard", async (_req, res) => {
  try {
    await ensureTables();

    // פגישות היום
    const todayAppts = await pool.query(
      "SELECT * FROM measurement_appointments WHERE scheduled_date = CURRENT_DATE ORDER BY scheduled_time"
    );

    // פגישות קרובות - 7 ימים הבאים
    const upcoming = await pool.query(
      "SELECT * FROM measurement_appointments WHERE scheduled_date BETWEEN CURRENT_DATE + 1 AND CURRENT_DATE + 7 AND status = 'scheduled' ORDER BY scheduled_date, scheduled_time"
    );

    // ממתינות לאישור
    const pendingApproval = await pool.query(
      "SELECT * FROM measurement_appointments WHERE status = 'completed' AND approved_for_production = false ORDER BY scheduled_date DESC"
    );

    // פערי מדידה לא פתורים
    const discrepancies = await pool.query(
      "SELECT d.*, ma.customer_name, ma.appointment_number FROM measurement_discrepancies d LEFT JOIN measurement_appointments ma ON ma.id = d.appointment_id WHERE d.resolved = false ORDER BY d.created_at DESC"
    );

    // סטטיסטיקות
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM measurement_engineers WHERE is_active = true) as total_engineers,
        (SELECT COUNT(*) FROM measurement_appointments WHERE scheduled_date = CURRENT_DATE) as today_count,
        (SELECT COUNT(*) FROM measurement_appointments WHERE status = 'completed' AND approved_for_production = false) as pending_approval_count,
        (SELECT COUNT(*) FROM measurement_discrepancies WHERE resolved = false) as open_discrepancies
    `);

    res.json({
      today_appointments: todayAppts.rows,
      upcoming_appointments: upcoming.rows,
      pending_approval: pendingApproval.rows,
      open_discrepancies: discrepancies.rows,
      stats: stats.rows[0]
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// לוח זמנים של מודד לשבוע ספציפי
// ============================================================
router.get("/engineer-schedule/:engineerId/:week", async (req, res) => {
  try {
    await ensureTables();
    const { engineerId, week } = req.params; // week = YYYY-Wxx או תאריך תחילת שבוע

    // חישוב תחילת וסוף שבוע
    let startDate = week;
    if (week.includes('W')) {
      // פורמט ISO week
      startDate = week; // נשתמש בתאריך ישירות
    }

    const appointments = await pool.query(`
      SELECT * FROM measurement_appointments
      WHERE engineer_id = $1
        AND scheduled_date BETWEEN $2::date AND ($2::date + INTERVAL '6 days')
      ORDER BY scheduled_date, scheduled_time
    `, [engineerId, startDate]);

    const engineer = await pool.query("SELECT * FROM measurement_engineers WHERE id = $1", [engineerId]);

    res.json({
      engineer: engineer.rows[0] || null,
      week_start: startDate,
      appointments: appointments.rows,
      total: appointments.rows.length
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// תזמון פגישת מדידה - עם תהליך אישור לקוח
// ============================================================
router.post("/schedule-appointment", async (req, res) => {
  try {
    await ensureTables();
    const b = req.body;

    // בדיקת זמינות מודד
    const conflicts = await pool.query(
      "SELECT * FROM measurement_appointments WHERE engineer_id = $1 AND scheduled_date = $2 AND status NOT IN ('cancelled', 'completed')",
      [b.engineer_id, b.scheduled_date]
    );

    // יצירת מספר פגישה
    const countRes = await pool.query("SELECT COUNT(*) FROM measurement_appointments");
    const apptNum = `MA-2026-${String(parseInt(countRes.rows[0].count) + 1).padStart(3, '0')}`;

    const result = await pool.query(`
      INSERT INTO measurement_appointments (appointment_number, project_id, customer_id, customer_name, customer_phone,
        customer_address, customer_city, engineer_id, engineer_name, sales_agent_id, sales_agent_name,
        scheduled_date, scheduled_time, special_requirements, customer_notes, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'scheduled') RETURNING *
    `, [apptNum, b.project_id, b.customer_id, b.customer_name, b.customer_phone,
        b.customer_address, b.customer_city, b.engineer_id, b.engineer_name,
        b.sales_agent_id, b.sales_agent_name, b.scheduled_date, b.scheduled_time,
        b.special_requirements, b.customer_notes]);

    // הכנת הודעת אישור ללקוח
    const confirmationMessage = `שלום ${b.customer_name}, נקבעה מדידה לתאריך ${b.scheduled_date} בשעה ${b.scheduled_time}. אנא אשרו את הפגישה.`;

    res.json({
      message: "פגישת מדידה נקבעה בהצלחה",
      appointment: result.rows[0],
      conflicts_warning: conflicts.rows.length > 0 ? `שימו לב: למודד יש ${conflicts.rows.length} פגישות נוספות באותו יום` : null,
      confirmation_message: confirmationMessage
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// אישור פגישה על ידי הלקוח
// ============================================================
router.post("/confirm-by-customer/:appointmentId", async (req, res) => {
  try {
    await ensureTables();
    const { appointmentId } = req.params;

    const result = await pool.query(`
      UPDATE measurement_appointments
      SET confirmed_by_customer = true, confirmed_at = NOW(), updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [appointmentId]);

    if (result.rows.length === 0) return res.status(404).json({ error: "פגישה לא נמצאה" });
    res.json({ message: "הפגישה אושרה על ידי הלקוח", appointment: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// התחלת מדידה - רישום הגעה ו-GPS
// ============================================================
router.post("/start-measurement/:appointmentId", async (req, res) => {
  try {
    await ensureTables();
    const { appointmentId } = req.params;
    const { gps_lat, gps_lng } = req.body;

    const result = await pool.query(`
      UPDATE measurement_appointments
      SET status = 'in_progress', arrival_time = NOW(),
          engineer_notes = COALESCE(engineer_notes, '') || $2,
          updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [appointmentId, gps_lat && gps_lng ? `\nGPS הגעה: ${gps_lat},${gps_lng}` : '']);

    if (result.rows.length === 0) return res.status(404).json({ error: "פגישה לא נמצאה" });

    // עדכון סטטוס מודד
    if (result.rows[0].engineer_id) {
      await pool.query(
        "UPDATE measurement_engineers SET availability_status = 'measuring', updated_at = NOW() WHERE id = $1",
        [result.rows[0].engineer_id]
      );
    }

    res.json({ message: "המדידה התחילה - הגעה נרשמה", appointment: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// הגשת מדידה - נתונים + תמונות + סקיצה
// ============================================================
router.post("/submit-measurement/:appointmentId", async (req, res) => {
  try {
    await ensureTables();
    const { appointmentId } = req.params;
    const { measurements_data, measurement_photos, site_photos, sketch_url, engineer_notes, obstacles } = req.body;

    const result = await pool.query(`
      UPDATE measurement_appointments
      SET status = 'completed', departure_time = NOW(),
          duration_minutes = EXTRACT(EPOCH FROM (NOW() - arrival_time)) / 60,
          measurements_data = COALESCE($2, measurements_data),
          measurement_photos = COALESCE($3, measurement_photos),
          site_photos = COALESCE($4, site_photos),
          sketch_url = COALESCE($5, sketch_url),
          engineer_notes = COALESCE($6, engineer_notes),
          obstacles = COALESCE($7, obstacles),
          updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [appointmentId, measurements_data ? JSON.stringify(measurements_data) : null,
        measurement_photos ? JSON.stringify(measurement_photos) : null,
        site_photos ? JSON.stringify(site_photos) : null,
        sketch_url, engineer_notes, obstacles]);

    if (result.rows.length === 0) return res.status(404).json({ error: "פגישה לא נמצאה" });

    // עדכון סטטוס מודד לזמין + הוספת מדידה
    if (result.rows[0].engineer_id) {
      await pool.query(
        "UPDATE measurement_engineers SET availability_status = 'available', total_measurements = total_measurements + 1, updated_at = NOW() WHERE id = $1",
        [result.rows[0].engineer_id]
      );
    }

    res.json({ message: "המדידה הוגשה בהצלחה", appointment: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// השוואת מדידה מול הצעת מחיר - התראה אם פער מעל 5%
// ============================================================
router.post("/compare-with-quote/:appointmentId", async (req, res) => {
  try {
    await ensureTables();
    const { appointmentId } = req.params;
    const { quote_dimensions } = req.body; // מערך של { field, quote_value, measured_value }

    if (!quote_dimensions || !Array.isArray(quote_dimensions)) {
      return res.status(400).json({ error: "נדרש מערך quote_dimensions עם שדות: field, quote_value, measured_value" });
    }

    const appointment = await pool.query("SELECT * FROM measurement_appointments WHERE id = $1", [appointmentId]);
    if (appointment.rows.length === 0) return res.status(404).json({ error: "פגישה לא נמצאה" });

    const discrepancies: any[] = [];
    let hasDiscrepancy = false;

    for (const dim of quote_dimensions) {
      const quoteVal = parseFloat(dim.quote_value) || 0;
      const measuredVal = parseFloat(dim.measured_value) || 0;
      const diffPercent = quoteVal > 0 ? Math.abs((measuredVal - quoteVal) / quoteVal * 100) : 0;

      // אם פער מעל 5% - סימון כפער
      if (diffPercent > 5) {
        hasDiscrepancy = true;
        const severity = diffPercent > 20 ? 'critical' : diffPercent > 10 ? 'high' : 'medium';

        const discResult = await pool.query(`
          INSERT INTO measurement_discrepancies (appointment_id, project_id, field, quote_value, measured_value, difference_percent, severity)
          VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
        `, [appointmentId, appointment.rows[0].project_id, dim.field, dim.quote_value, dim.measured_value, diffPercent, severity]);

        discrepancies.push(discResult.rows[0]);
      }
    }

    // עדכון הפגישה עם תוצאות ההשוואה
    await pool.query(`
      UPDATE measurement_appointments
      SET comparison_with_quote = $2, discrepancy_found = $3,
          discrepancy_details = $4, discrepancy_alert_sent = $3, updated_at = NOW()
      WHERE id = $1
    `, [appointmentId, JSON.stringify(quote_dimensions), hasDiscrepancy,
        hasDiscrepancy ? `נמצאו ${discrepancies.length} פערים מעל 5%` : null]);

    res.json({
      message: hasDiscrepancy ? "נמצאו פערים בין הצעת המחיר למדידה בפועל!" : "אין פערים משמעותיים - המדידה תואמת",
      has_discrepancy: hasDiscrepancy,
      discrepancies: discrepancies,
      comparison: quote_dimensions,
      alert_level: hasDiscrepancy ? (discrepancies.some((d: any) => d.severity === 'critical') ? 'CRITICAL' : 'WARNING') : 'OK'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// אישור לייצור - אחרי שהמדידה אומתה
// ============================================================
router.post("/approve-for-production/:appointmentId", async (req, res) => {
  try {
    await ensureTables();
    const { appointmentId } = req.params;
    const { approved_by } = req.body;

    const result = await pool.query(`
      UPDATE measurement_appointments
      SET approved_for_production = true, approved_by = $2, approved_at = NOW(), updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [appointmentId, approved_by || 'מנהל']);

    if (result.rows.length === 0) return res.status(404).json({ error: "פגישה לא נמצאה" });
    res.json({ message: "המדידה אושרה לייצור", appointment: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// כל פערי המדידה הלא פתורים
// ============================================================
router.get("/discrepancies", async (req, res) => {
  try {
    await ensureTables();
    const { severity, resolved } = req.query;
    let query = `
      SELECT d.*, ma.customer_name, ma.appointment_number, ma.customer_address, ma.engineer_name
      FROM measurement_discrepancies d
      LEFT JOIN measurement_appointments ma ON ma.id = d.appointment_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;

    if (severity) { query += ` AND d.severity = $${idx++}`; params.push(severity); }
    if (resolved !== undefined) { query += ` AND d.resolved = $${idx++}`; params.push(resolved === 'true'); }

    query += " ORDER BY d.created_at DESC";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// דוח דיוק מודד לאורך זמן
// ============================================================
router.get("/accuracy-report/:engineerId", async (req, res) => {
  try {
    await ensureTables();
    const { engineerId } = req.params;

    const engineer = await pool.query("SELECT * FROM measurement_engineers WHERE id = $1", [engineerId]);

    // כל הפגישות שהושלמו
    const completedAppts = await pool.query(
      "SELECT * FROM measurement_appointments WHERE engineer_id = $1 AND status = 'completed' ORDER BY scheduled_date DESC",
      [engineerId]
    );

    // פערים קשורים למודד
    const discrepancies = await pool.query(`
      SELECT d.* FROM measurement_discrepancies d
      JOIN measurement_appointments ma ON ma.id = d.appointment_id
      WHERE ma.engineer_id = $1
      ORDER BY d.created_at DESC
    `, [engineerId]);

    const totalMeasurements = completedAppts.rows.length;
    const withDiscrepancies = completedAppts.rows.filter((a: any) => a.discrepancy_found).length;
    const accuracyRate = totalMeasurements > 0 ? ((totalMeasurements - withDiscrepancies) / totalMeasurements * 100) : 100;

    res.json({
      engineer: engineer.rows[0] || null,
      total_measurements: totalMeasurements,
      measurements_with_discrepancies: withDiscrepancies,
      accuracy_rate: Math.round(accuracyRate * 100) / 100,
      discrepancies: discrepancies.rows,
      recent_measurements: completedAppts.rows.slice(0, 20)
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// שליחת סיכום מדידה ללקוח - עם בקשת חתימה
// ============================================================
router.post("/send-to-customer/:appointmentId", async (req, res) => {
  try {
    await ensureTables();
    const { appointmentId } = req.params;

    const appt = await pool.query("SELECT * FROM measurement_appointments WHERE id = $1", [appointmentId]);
    if (appt.rows.length === 0) return res.status(404).json({ error: "פגישה לא נמצאה" });

    const data = appt.rows[0];
    const message = `
📐 *סיכום מדידה #${data.appointment_number}*

👤 לקוח: ${data.customer_name}
📍 כתובת: ${data.customer_address}, ${data.customer_city}
📅 תאריך מדידה: ${data.scheduled_date}
👷 מודד: ${data.engineer_name}

📏 נתוני מדידה: ${JSON.stringify(data.measurements_data)}

${data.obstacles ? `⚠️ מכשולים: ${data.obstacles}` : ''}
${data.engineer_notes ? `📝 הערות: ${data.engineer_notes}` : ''}

✍️ אנא אשרו את המדידה וחתמו דיגיטלית.
    `.trim();

    const phone = data.customer_phone?.replace(/[-\s]/g, '');
    const whatsappUrl = phone ? `https://wa.me/972${phone.substring(1)}?text=${encodeURIComponent(message)}` : null;

    res.json({
      message: "סיכום מדידה מוכן לשליחה",
      whatsapp_url: whatsappUrl,
      whatsapp_message: message,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// כל המדידות הממתינות לאישור
// ============================================================
router.get("/pending-approvals", async (_req, res) => {
  try {
    await ensureTables();

    const result = await pool.query(`
      SELECT ma.*, me.full_name as engineer_full_name
      FROM measurement_appointments ma
      LEFT JOIN measurement_engineers me ON me.id = ma.engineer_id
      WHERE ma.status = 'completed' AND ma.approved_for_production = false
      ORDER BY ma.scheduled_date DESC
    `);

    res.json({
      pending: result.rows,
      total: result.rows.length
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
