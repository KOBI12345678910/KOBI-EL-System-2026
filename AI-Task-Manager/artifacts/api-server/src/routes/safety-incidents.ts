import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ─── Auto-create tables ───────────────────────────────────────────────────────
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS safety_incidents (
      id SERIAL PRIMARY KEY,
      incident_number VARCHAR(50) UNIQUE,
      date TIMESTAMPTZ DEFAULT NOW(),
      location VARCHAR(100),
      type VARCHAR(30) CHECK (type IN ('injury','near_miss','property_damage','fire','chemical_spill','equipment_failure','fall','cut','burn','eye_injury')),
      severity VARCHAR(20) CHECK (severity IN ('minor','moderate','serious','critical','fatal')),
      description TEXT,
      employee_id INTEGER,
      employee_name VARCHAR(200),
      witnesses JSONB DEFAULT '[]',
      immediate_action TEXT,
      root_cause TEXT,
      corrective_action TEXT,
      preventive_action TEXT,
      medical_treatment TEXT,
      days_lost INT DEFAULT 0,
      cost_estimate NUMERIC(14,2) DEFAULT 0,
      photos JSONB DEFAULT '[]',
      status VARCHAR(20) DEFAULT 'reported' CHECK (status IN ('reported','investigating','action_required','resolved','closed')),
      reported_by VARCHAR(200),
      investigated_by VARCHAR(200),
      closed_at TIMESTAMPTZ,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS safety_inspections (
      id SERIAL PRIMARY KEY,
      inspection_date DATE DEFAULT CURRENT_DATE,
      area VARCHAR(100),
      inspector_id INTEGER,
      inspector_name VARCHAR(200),
      checklist JSONB DEFAULT '[]',
      overall_result VARCHAR(20) CHECK (overall_result IN ('pass','fail','conditional')),
      findings TEXT,
      corrective_actions TEXT,
      next_inspection DATE,
      status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','overdue')),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS safety_training (
      id SERIAL PRIMARY KEY,
      training_name VARCHAR(200),
      category VARCHAR(30) CHECK (category IN ('general','welding','cutting','heights','chemicals','fire','first_aid','ppe','crane','forklift')),
      instructor VARCHAR(200),
      date DATE,
      duration_hours NUMERIC(4,1),
      attendees JSONB DEFAULT '[]',
      pass_rate REAL DEFAULT 0,
      next_refresher DATE,
      certificates_issued INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS safety_equipment_checks (
      id SERIAL PRIMARY KEY,
      equipment_type VARCHAR(40) CHECK (equipment_type IN ('fire_extinguisher','first_aid_kit','safety_shower','eye_wash','smoke_detector','guard_rail','ventilation','ppe_station')),
      location VARCHAR(100),
      checked_by VARCHAR(200),
      check_date DATE DEFAULT CURRENT_DATE,
      status VARCHAR(20) CHECK (status IN ('ok','needs_repair','replaced','missing')),
      next_check DATE,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS safety_procedures (
      id SERIAL PRIMARY KEY,
      procedure_name VARCHAR(300),
      category VARCHAR(50),
      version INT DEFAULT 1,
      content TEXT,
      applicable_departments JSONB DEFAULT '[]',
      mandatory_acknowledgment BOOLEAN DEFAULT true,
      acknowledged_count INT DEFAULT 0,
      total_employees INT DEFAULT 0,
      last_updated DATE DEFAULT CURRENT_DATE,
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

// ─── Pre-seed safety data ─────────────────────────────────────────────────────
async function seedData() {
  const { rows } = await pool.query(`SELECT COUNT(*) as c FROM safety_incidents`);
  if (Number(rows[0].c) > 0) return;

  // Seed some sample incidents
  const incidents = [
    { num: 'INC-2025-001', type: 'cut', severity: 'minor', loc: 'סדנת חיתוך', desc: 'חתך קל בזמן עבודה עם מסור', emp: 'יוסי כהן', action: 'חבישה וטיפול ראשוני', status: 'closed', days: 0 },
    { num: 'INC-2025-002', type: 'burn', severity: 'moderate', loc: 'סדנת ריתוך', desc: 'כוויה קלה מניצוצות ריתוך', emp: 'דני לוי', action: 'טיפול רפואי ומנוחה', status: 'resolved', days: 2 },
    { num: 'INC-2025-003', type: 'near_miss', severity: 'minor', loc: 'חצר', desc: 'כמעט נפילת חומר ממלגזה', emp: null, action: 'תדרוך בטיחות למפעיל', status: 'closed', days: 0 },
    { num: 'INC-2025-004', type: 'equipment_failure', severity: 'moderate', loc: 'סדנה ראשית', desc: 'תקלה במדחס - נזילת שמן', emp: null, action: 'כיבוי מדחס וטיפול טכני', status: 'resolved', days: 0 },
    { num: 'INC-2025-005', type: 'eye_injury', severity: 'minor', loc: 'סדנת ליטוש', desc: 'שבב נכנס לעין - לא הרכיב משקפי מגן', emp: 'משה אברהם', action: 'שטיפת עיניים ובדיקה', status: 'closed', days: 1 },
  ];
  for (const inc of incidents) {
    await pool.query(`
      INSERT INTO safety_incidents (incident_number, date, location, type, severity, description, employee_name, immediate_action, status, days_lost, reported_by)
      VALUES ($1, NOW() - (random()*90)::int * INTERVAL '1 day', $2, $3, $4, $5, $6, $7, $8, $9, 'מנהל בטיחות')
    `, [inc.num, inc.loc, inc.type, inc.severity, inc.desc, inc.emp, inc.action, inc.status, inc.days]);
  }

  // Seed safety equipment checks
  const eqChecks = [
    { type: 'fire_extinguisher', loc: 'סדנה ראשית - כניסה', status: 'ok' },
    { type: 'fire_extinguisher', loc: 'סדנת ריתוך', status: 'ok' },
    { type: 'fire_extinguisher', loc: 'משרדים', status: 'ok' },
    { type: 'first_aid_kit', loc: 'סדנה ראשית', status: 'ok' },
    { type: 'first_aid_kit', loc: 'חצר', status: 'needs_repair' },
    { type: 'eye_wash', loc: 'סדנת צביעה', status: 'ok' },
    { type: 'safety_shower', loc: 'סדנת צביעה', status: 'ok' },
    { type: 'smoke_detector', loc: 'מחסן', status: 'ok' },
    { type: 'ventilation', loc: 'סדנת ריתוך', status: 'ok' },
    { type: 'ppe_station', loc: 'כניסה ראשית', status: 'ok' },
  ];
  for (const eq of eqChecks) {
    await pool.query(`
      INSERT INTO safety_equipment_checks (equipment_type, location, checked_by, check_date, status, next_check)
      VALUES ($1, $2, 'מנהל בטיחות', CURRENT_DATE - (random()*30)::int, $3, CURRENT_DATE + 30)
    `, [eq.type, eq.loc, eq.status]);
  }

  // Seed safety procedures
  const procs = [
    { name: 'נוהל עבודה בגובה', cat: 'heights', dept: '["ייצור","התקנות"]' },
    { name: 'נוהל עבודה עם ריתוך', cat: 'welding', dept: '["ריתוך"]' },
    { name: 'נוהל חירום - אש', cat: 'fire', dept: '["כולם"]' },
    { name: 'נוהל שימוש בציוד מגן אישי', cat: 'ppe', dept: '["כולם"]' },
    { name: 'נוהל הפעלת מלגזה', cat: 'forklift', dept: '["לוגיסטיקה"]' },
    { name: 'נוהל עבודה עם חומרים כימיים', cat: 'chemicals', dept: '["צביעה"]' },
  ];
  for (const p of procs) {
    await pool.query(`
      INSERT INTO safety_procedures (procedure_name, category, applicable_departments, status, total_employees, acknowledged_count)
      VALUES ($1, $2, $3::jsonb, 'active', 25, (random()*25)::int)
    `, [p.name, p.cat, p.dept]);
  }
}

ensureTables().then(() => seedData()).catch(e => console.error("safety-incidents init:", e));

// ═══════════════════════════════════════════════════════════════════════════════
//  INCIDENTS CRUD
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/api/safety/incidents", async (_req, res) => {
  try {
    const { type, severity, status, search } = _req.query;
    let q = `SELECT * FROM safety_incidents WHERE 1=1`;
    const params: any[] = [];
    let i = 1;
    if (type) { q += ` AND type=$${i}`; params.push(type); i++; }
    if (severity) { q += ` AND severity=$${i}`; params.push(severity); i++; }
    if (status) { q += ` AND status=$${i}`; params.push(status); i++; }
    if (search) { q += ` AND (description ILIKE $${i} OR employee_name ILIKE $${i} OR incident_number ILIKE $${i})`; params.push(`%${search}%`); i++; }
    q += ` ORDER BY date DESC`;
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/api/safety/incidents/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM safety_incidents WHERE id=$1`, [req.params.id]);
    res.json(rows[0] || {});
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/api/safety/incidents", async (req, res) => {
  try {
    const b = req.body;
    const numR = await pool.query(`SELECT COUNT(*) as c FROM safety_incidents`);
    const num = `INC-${new Date().getFullYear()}-${String(Number(numR.rows[0].c) + 1).padStart(3, '0')}`;
    const { rows } = await pool.query(`
      INSERT INTO safety_incidents (incident_number, date, location, type, severity, description, employee_id, employee_name, witnesses, immediate_action, root_cause, corrective_action, preventive_action, medical_treatment, days_lost, cost_estimate, photos, status, reported_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *
    `, [num, b.date || new Date(), b.location, b.type, b.severity, b.description, b.employee_id, b.employee_name, JSON.stringify(b.witnesses || []), b.immediate_action, b.root_cause, b.corrective_action, b.preventive_action, b.medical_treatment, b.days_lost || 0, b.cost_estimate || 0, JSON.stringify(b.photos || []), b.status || 'reported', b.reported_by]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/api/safety/incidents/:id", async (req, res) => {
  try {
    const b = req.body;
    const closedAt = b.status === 'closed' ? 'NOW()' : 'closed_at';
    const { rows } = await pool.query(`
      UPDATE safety_incidents SET location=$1, type=$2, severity=$3, description=$4, employee_id=$5, employee_name=$6, witnesses=$7, immediate_action=$8, root_cause=$9, corrective_action=$10, preventive_action=$11, medical_treatment=$12, days_lost=$13, cost_estimate=$14, photos=$15, status=$16, investigated_by=$17, closed_at=${b.status === 'closed' ? 'NOW()' : 'closed_at'}
      WHERE id=$18 RETURNING *
    `, [b.location, b.type, b.severity, b.description, b.employee_id, b.employee_name, JSON.stringify(b.witnesses || []), b.immediate_action, b.root_cause, b.corrective_action, b.preventive_action, b.medical_treatment, b.days_lost, b.cost_estimate, JSON.stringify(b.photos || []), b.status, b.investigated_by, req.params.id]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/api/safety/incidents/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM safety_incidents WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/api/safety/incidents/by-type", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT type, COUNT(*) as count, COUNT(*) FILTER (WHERE severity IN ('serious','critical','fatal')) as severe_count
      FROM safety_incidents GROUP BY type ORDER BY count DESC
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/api/safety/incidents/trend", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT TO_CHAR(date, 'YYYY-MM') as month, COUNT(*) as total,
        COUNT(*) FILTER (WHERE severity='minor') as minor,
        COUNT(*) FILTER (WHERE severity='moderate') as moderate,
        COUNT(*) FILTER (WHERE severity IN ('serious','critical','fatal')) as serious,
        SUM(days_lost) as days_lost
      FROM safety_incidents WHERE date >= NOW() - INTERVAL '12 months'
      GROUP BY TO_CHAR(date, 'YYYY-MM') ORDER BY month
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  INSPECTIONS CRUD
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/api/safety/inspections", async (_req, res) => {
  try {
    const { status } = _req.query;
    let q = `SELECT * FROM safety_inspections WHERE 1=1`;
    const params: any[] = [];
    if (status) { q += ` AND status=$1`; params.push(status); }
    q += ` ORDER BY inspection_date DESC`;
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/api/safety/inspections", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      INSERT INTO safety_inspections (inspection_date, area, inspector_id, inspector_name, checklist, overall_result, findings, corrective_actions, next_inspection, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [b.inspection_date, b.area, b.inspector_id, b.inspector_name, JSON.stringify(b.checklist || []), b.overall_result, b.findings, b.corrective_actions, b.next_inspection, b.status || 'scheduled']);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/api/safety/inspections/:id", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      UPDATE safety_inspections SET inspection_date=$1, area=$2, inspector_name=$3, checklist=$4, overall_result=$5, findings=$6, corrective_actions=$7, next_inspection=$8, status=$9
      WHERE id=$10 RETURNING *
    `, [b.inspection_date, b.area, b.inspector_name, JSON.stringify(b.checklist || []), b.overall_result, b.findings, b.corrective_actions, b.next_inspection, b.status, req.params.id]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/api/safety/inspections/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM safety_inspections WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/api/safety/overdue-inspections", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM safety_inspections WHERE next_inspection IS NOT NULL AND next_inspection < CURRENT_DATE AND status != 'completed'
      ORDER BY next_inspection
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  TRAINING CRUD
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/api/safety/trainings", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM safety_training ORDER BY date DESC`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/api/safety/trainings", async (req, res) => {
  try {
    const b = req.body;
    const attendees = b.attendees || [];
    const passed = attendees.filter((a: any) => a.passed).length;
    const rate = attendees.length > 0 ? (passed / attendees.length) * 100 : 0;
    const { rows } = await pool.query(`
      INSERT INTO safety_training (training_name, category, instructor, date, duration_hours, attendees, pass_rate, next_refresher, certificates_issued)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [b.training_name, b.category, b.instructor, b.date, b.duration_hours, JSON.stringify(attendees), rate, b.next_refresher, b.certificates_issued || passed]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/api/safety/trainings/:id", async (req, res) => {
  try {
    const b = req.body;
    const attendees = b.attendees || [];
    const passed = attendees.filter((a: any) => a.passed).length;
    const rate = attendees.length > 0 ? (passed / attendees.length) * 100 : 0;
    const { rows } = await pool.query(`
      UPDATE safety_training SET training_name=$1, category=$2, instructor=$3, date=$4, duration_hours=$5, attendees=$6, pass_rate=$7, next_refresher=$8, certificates_issued=$9
      WHERE id=$10 RETURNING *
    `, [b.training_name, b.category, b.instructor, b.date, b.duration_hours, JSON.stringify(attendees), rate, b.next_refresher, b.certificates_issued || passed, req.params.id]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/api/safety/trainings/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM safety_training WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/api/safety/training-due", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM safety_training WHERE next_refresher IS NOT NULL AND next_refresher <= CURRENT_DATE + INTERVAL '30 days'
      ORDER BY next_refresher
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  EQUIPMENT CHECKS CRUD
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/api/safety/equipment-checks", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM safety_equipment_checks ORDER BY check_date DESC`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/api/safety/equipment-checks", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      INSERT INTO safety_equipment_checks (equipment_type, location, checked_by, check_date, status, next_check, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [b.equipment_type, b.location, b.checked_by, b.check_date, b.status, b.next_check, b.notes]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/api/safety/equipment-checks/:id", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      UPDATE safety_equipment_checks SET equipment_type=$1, location=$2, checked_by=$3, check_date=$4, status=$5, next_check=$6, notes=$7
      WHERE id=$8 RETURNING *
    `, [b.equipment_type, b.location, b.checked_by, b.check_date, b.status, b.next_check, b.notes, req.params.id]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/api/safety/equipment-checks/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM safety_equipment_checks WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  PROCEDURES CRUD
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/api/safety/procedures", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM safety_procedures ORDER BY procedure_name`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/api/safety/procedures", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      INSERT INTO safety_procedures (procedure_name, category, version, content, applicable_departments, mandatory_acknowledgment, total_employees, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [b.procedure_name, b.category, b.version || 1, b.content, JSON.stringify(b.applicable_departments || []), b.mandatory_acknowledgment ?? true, b.total_employees || 0, b.status || 'draft']);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/api/safety/procedures/:id", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      UPDATE safety_procedures SET procedure_name=$1, category=$2, version=$3, content=$4, applicable_departments=$5, mandatory_acknowledgment=$6, total_employees=$7, acknowledged_count=$8, status=$9, last_updated=CURRENT_DATE
      WHERE id=$10 RETURNING *
    `, [b.procedure_name, b.category, b.version, b.content, JSON.stringify(b.applicable_departments || []), b.mandatory_acknowledgment, b.total_employees, b.acknowledged_count, b.status, req.params.id]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/api/safety/procedures/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM safety_procedures WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  KPIs & DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/api/safety/kpis", async (_req, res) => {
  try {
    const lastIncident = await pool.query(`SELECT MAX(date) as last_date FROM safety_incidents WHERE type != 'near_miss'`);
    const daysSince = lastIncident.rows[0]?.last_date
      ? Math.floor((Date.now() - new Date(lastIncident.rows[0].last_date).getTime()) / 86400000)
      : 999;
    const yearIncidents = await pool.query(`SELECT COUNT(*) as c FROM safety_incidents WHERE date >= NOW() - INTERVAL '12 months'`);
    const yearDaysLost = await pool.query(`SELECT SUM(days_lost) as d FROM safety_incidents WHERE date >= NOW() - INTERVAL '12 months'`);
    const trainingCompliance = await pool.query(`
      SELECT ROUND(AVG(pass_rate),1) as avg_pass_rate, COUNT(*) as total_trainings
      FROM safety_training WHERE date >= NOW() - INTERVAL '12 months'
    `);
    const inspCompliance = await pool.query(`
      SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE overall_result='pass') as passed
      FROM safety_inspections WHERE inspection_date >= NOW() - INTERVAL '6 months'
    `);
    const eqOk = await pool.query(`
      SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='ok') as ok_count
      FROM safety_equipment_checks
    `);
    const procCompliance = await pool.query(`
      SELECT SUM(acknowledged_count) as ack, SUM(total_employees) as total FROM safety_procedures WHERE status='active'
    `);

    const inspTotal = Number(inspCompliance.rows[0]?.total || 1);
    const eqTotal = Number(eqOk.rows[0]?.total || 1);
    const procTotal = Number(procCompliance.rows[0]?.total || 1);

    res.json({
      days_since_last_incident: daysSince,
      year_incidents: Number(yearIncidents.rows[0].c),
      year_days_lost: Number(yearDaysLost.rows[0]?.d || 0),
      training_avg_pass_rate: Number(trainingCompliance.rows[0]?.avg_pass_rate || 0),
      training_count: Number(trainingCompliance.rows[0]?.total_trainings || 0),
      inspection_compliance: ((Number(inspCompliance.rows[0]?.passed || 0) / inspTotal) * 100).toFixed(1),
      equipment_ok_rate: ((Number(eqOk.rows[0]?.ok_count || 0) / eqTotal) * 100).toFixed(1),
      procedure_acknowledgment_rate: procTotal > 0 ? ((Number(procCompliance.rows[0]?.ack || 0) / procTotal) * 100).toFixed(1) : 0,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/api/safety/dashboard", async (_req, res) => {
  try {
    const kpisR = await pool.query(`SELECT COUNT(*) as total_incidents FROM safety_incidents`);
    const openIncidents = await pool.query(`SELECT COUNT(*) as c FROM safety_incidents WHERE status NOT IN ('resolved','closed')`);
    const recentIncidents = await pool.query(`SELECT * FROM safety_incidents ORDER BY date DESC LIMIT 5`);
    const overdueInsp = await pool.query(`SELECT COUNT(*) as c FROM safety_inspections WHERE next_inspection < CURRENT_DATE AND status != 'completed'`);
    const trainingDue = await pool.query(`SELECT COUNT(*) as c FROM safety_training WHERE next_refresher IS NOT NULL AND next_refresher <= CURRENT_DATE + INTERVAL '30 days'`);
    const eqIssues = await pool.query(`SELECT COUNT(*) as c FROM safety_equipment_checks WHERE status != 'ok'`);
    const byType = await pool.query(`SELECT type, COUNT(*) as count FROM safety_incidents GROUP BY type ORDER BY count DESC`);
    const bySeverity = await pool.query(`SELECT severity, COUNT(*) as count FROM safety_incidents GROUP BY severity`);
    const lastIncident = await pool.query(`SELECT MAX(date) as last_date FROM safety_incidents WHERE type != 'near_miss'`);
    const daysSince = lastIncident.rows[0]?.last_date
      ? Math.floor((Date.now() - new Date(lastIncident.rows[0].last_date).getTime()) / 86400000)
      : 999;

    res.json({
      total_incidents: Number(kpisR.rows[0].total_incidents),
      open_incidents: Number(openIncidents.rows[0].c),
      days_since_last_incident: daysSince,
      overdue_inspections: Number(overdueInsp.rows[0].c),
      training_due: Number(trainingDue.rows[0].c),
      equipment_issues: Number(eqIssues.rows[0].c),
      recent_incidents: recentIncidents.rows,
      by_type: byType.rows,
      by_severity: bySeverity.rows,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
