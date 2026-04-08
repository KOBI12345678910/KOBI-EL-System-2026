import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// Helper functions for our task's version
function s(v: unknown): string {
  if (v === null || v === undefined || v === "") return "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

function safeInt(v: unknown, fallback = 0): number {
  const n = parseInt(String(v), 10);
  return isNaN(n) ? fallback : n;
}

function safeNum(v: unknown, fallback = 0): number {
  const n = parseFloat(String(v));
  return isNaN(n) ? fallback : n;
}

function safeDate(v: unknown): string {
  if (!v) return "NULL";
  const str = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return `'${str}'`;
  }
  return "NULL";
}

async function q(query: string): Promise<Record<string, unknown>[]> {
  try {
    const r = await db.execute(sql.raw(query));
    const rows = (r as unknown as { rows?: Record<string, unknown>[] }).rows;
    return rows || [];
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[QMS] query error:", msg, "| query:", query.slice(0, 200));
    return [];
  }
}

async function ensureTables() {
  await q(`CREATE TABLE IF NOT EXISTS non_conformance_reports (
    id SERIAL PRIMARY KEY,
    ncr_number VARCHAR(32) UNIQUE,
    description TEXT,
    source VARCHAR(50) DEFAULT 'production',
    severity VARCHAR(20) DEFAULT 'minor',
    status VARCHAR(30) DEFAULT 'open',
    root_cause TEXT,
    corrective_action TEXT,
    preventive_action TEXT,
    affected_product_id INTEGER,
    affected_order_id INTEGER,
    responsible_id INTEGER,
    due_date DATE,
    closed_date DATE,
    cost_of_quality NUMERIC(14,2) DEFAULT 0,
    photos JSONB DEFAULT '[]',
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  await q(`ALTER TABLE non_conformance_reports ADD COLUMN IF NOT EXISTS title TEXT`);
  await q(`ALTER TABLE non_conformance_reports ADD COLUMN IF NOT EXISTS product_name TEXT`);
  await q(`ALTER TABLE non_conformance_reports ADD COLUMN IF NOT EXISTS product_code TEXT`);
  await q(`ALTER TABLE non_conformance_reports ADD COLUMN IF NOT EXISTS batch_reference TEXT`);
  await q(`ALTER TABLE non_conformance_reports ADD COLUMN IF NOT EXISTS quantity_affected INTEGER DEFAULT 0`);
  await q(`ALTER TABLE non_conformance_reports ADD COLUMN IF NOT EXISTS defect_type TEXT`);
  await q(`ALTER TABLE non_conformance_reports ADD COLUMN IF NOT EXISTS disposition VARCHAR(50) DEFAULT 'pending'`);
  await q(`ALTER TABLE non_conformance_reports ADD COLUMN IF NOT EXISTS detected_by TEXT`);
  await q(`ALTER TABLE non_conformance_reports ADD COLUMN IF NOT EXISTS detection_date DATE DEFAULT CURRENT_DATE`);
  await q(`ALTER TABLE non_conformance_reports ADD COLUMN IF NOT EXISTS responsible_person TEXT`);
  await q(`ALTER TABLE non_conformance_reports ADD COLUMN IF NOT EXISTS containment_action TEXT`);
  await q(`ALTER TABLE non_conformance_reports ADD COLUMN IF NOT EXISTS root_cause_summary TEXT`);
  await q(`ALTER TABLE non_conformance_reports ADD COLUMN IF NOT EXISTS cost_impact NUMERIC(14,2) DEFAULT 0`);
  await q(`ALTER TABLE non_conformance_reports ADD COLUMN IF NOT EXISTS supplier_id INTEGER`);
  await q(`ALTER TABLE non_conformance_reports ADD COLUMN IF NOT EXISTS work_order_id INTEGER`);
  await q(`ALTER TABLE non_conformance_reports ADD COLUMN IF NOT EXISTS customer_id INTEGER`);
  await q(`ALTER TABLE non_conformance_reports ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP`);

  await q(`CREATE TABLE IF NOT EXISTS ncr_root_causes (
    id SERIAL PRIMARY KEY,
    ncr_id INTEGER NOT NULL REFERENCES non_conformance_reports(id) ON DELETE CASCADE,
    method VARCHAR(20) DEFAULT '5why',
    why1 TEXT,
    why2 TEXT,
    why3 TEXT,
    why4 TEXT,
    why5 TEXT,
    root_cause TEXT,
    ishikawa_man TEXT,
    ishikawa_machine TEXT,
    ishikawa_material TEXT,
    ishikawa_method TEXT,
    ishikawa_measurement TEXT,
    ishikawa_environment TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS corrective_actions (
    id SERIAL PRIMARY KEY,
    capa_number VARCHAR(32) UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    type VARCHAR(20) DEFAULT 'corrective',
    source_type VARCHAR(30) DEFAULT 'ncr',
    source_ncr_id INTEGER,
    source_complaint_id INTEGER,
    responsible_person TEXT,
    department TEXT,
    due_date DATE,
    completed_date DATE,
    status VARCHAR(30) DEFAULT 'initiated',
    priority VARCHAR(20) DEFAULT 'medium',
    verification_method TEXT,
    verification_person TEXT,
    verification_date DATE,
    verification_result TEXT,
    effectiveness_rating INTEGER,
    effectiveness_notes TEXT,
    effectiveness_review_date DATE,
    recurrence_check_date DATE,
    cost_estimate NUMERIC(14,2) DEFAULT 0,
    cost_actual NUMERIC(14,2) DEFAULT 0,
    notes TEXT,
    closed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS customer_complaints (
    id SERIAL PRIMARY KEY,
    complaint_number VARCHAR(32) UNIQUE,
    customer_name TEXT NOT NULL,
    customer_reference TEXT,
    product_name TEXT,
    product_code TEXT,
    batch_reference TEXT,
    complaint_type VARCHAR(50) DEFAULT 'quality',
    severity VARCHAR(20) DEFAULT 'medium',
    description TEXT NOT NULL,
    received_date DATE DEFAULT CURRENT_DATE,
    sla_days INTEGER DEFAULT 10,
    target_resolution_date DATE,
    actual_resolution_date DATE,
    status VARCHAR(30) DEFAULT 'received',
    assigned_to TEXT,
    linked_ncr_id INTEGER,
    investigation_summary TEXT,
    resolution_description TEXT,
    customer_notified BOOLEAN DEFAULT FALSE,
    customer_notified_date DATE,
    customer_satisfaction INTEGER,
    root_cause_confirmed TEXT,
    prevent_recurrence TEXT,
    closed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS complaint_investigations (
    id SERIAL PRIMARY KEY,
    complaint_id INTEGER NOT NULL REFERENCES customer_complaints(id) ON DELETE CASCADE,
    step_number INTEGER DEFAULT 1,
    action_taken TEXT,
    findings TEXT,
    investigator TEXT,
    investigation_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS supplier_quality_scores (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER NOT NULL,
    supplier_name TEXT,
    period_start DATE,
    period_end DATE,
    total_lots INTEGER DEFAULT 0,
    rejected_lots INTEGER DEFAULT 0,
    total_units INTEGER DEFAULT 0,
    rejected_units INTEGER DEFAULT 0,
    ppm NUMERIC(10,2) DEFAULT 0,
    rejection_rate NUMERIC(6,4) DEFAULT 0,
    quality_score NUMERIC(5,2) DEFAULT 0,
    on_time_delivery_rate NUMERIC(6,4) DEFAULT 0,
    open_scars INTEGER DEFAULT 0,
    closed_scars INTEGER DEFAULT 0,
    last_audit_date DATE,
    last_audit_score NUMERIC(5,2),
    status VARCHAR(30) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS supplier_audits (
    id SERIAL PRIMARY KEY,
    audit_number VARCHAR(32) UNIQUE,
    supplier_id INTEGER NOT NULL,
    supplier_name TEXT,
    audit_type VARCHAR(30) DEFAULT 'routine',
    scheduled_date DATE,
    actual_date DATE,
    auditor TEXT,
    lead_auditor TEXT,
    scope TEXT,
    checklist_used TEXT,
    status VARCHAR(30) DEFAULT 'scheduled',
    overall_score NUMERIC(5,2),
    critical_findings INTEGER DEFAULT 0,
    major_findings INTEGER DEFAULT 0,
    minor_findings INTEGER DEFAULT 0,
    observations INTEGER DEFAULT 0,
    findings_summary TEXT,
    recommendations TEXT,
    next_audit_date DATE,
    report_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS supplier_corrective_actions (
    id SERIAL PRIMARY KEY,
    scar_number VARCHAR(32) UNIQUE,
    supplier_id INTEGER NOT NULL,
    supplier_name TEXT,
    linked_audit_id INTEGER,
    linked_ncr_id INTEGER,
    issue_description TEXT NOT NULL,
    severity VARCHAR(20) DEFAULT 'major',
    issued_date DATE DEFAULT CURRENT_DATE,
    response_due_date DATE,
    close_out_date DATE,
    status VARCHAR(30) DEFAULT 'issued',
    supplier_root_cause TEXT,
    supplier_corrective_action TEXT,
    supplier_response_date DATE,
    verification_method TEXT,
    verification_date DATE,
    verification_result TEXT,
    verified_by TEXT,
    effectiveness_confirmed BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
}

ensureTables().catch(e => console.error("[QMS] ensureTables error:", e));

function generateNumber(prefix: string): string {
  const ts = Date.now().toString().slice(-8);
  return `${prefix}-${ts}`;
}

// ─────────────────────────────────────────────────────────────
// CALIBRATION INSTRUMENTS (HEAD)
// ─────────────────────────────────────────────────────────────

router.get("/calibration-instruments", async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT * FROM calibration_instruments ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    logger.error("qms_calibration_instruments_list_error", { error: err.message });
    res.status(500).json({ error: "Failed to fetch calibration instruments" });
  }
});

router.get("/calibration-instruments/due", async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT * FROM calibration_instruments
      WHERE next_calibration_date <= CURRENT_DATE + INTERVAL '30 days'
        OR calibration_status = 'overdue'
      ORDER BY next_calibration_date ASC
    `);
    res.json(result.rows);
  } catch (err: any) {
    logger.error("qms_calibration_due_error", { error: err.message });
    res.status(500).json({ error: "Failed to fetch due calibrations" });
  }
});

router.get("/calibration-instruments/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.execute(sql`
      SELECT * FROM calibration_instruments WHERE id = ${parseInt(id)}
    `);
    if (!result.rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(result.rows[0]);
  } catch (err: any) {
    logger.error("qms_calibration_instrument_get_error", { error: err.message });
    res.status(500).json({ error: "Failed to fetch instrument" });
  }
});

router.post("/calibration-instruments", async (req, res) => {
  try {
    const {
      name, serialNumber, type, location, department,
      calibrationInterval, lastCalibrationDate, nextCalibrationDate,
      calibrationStatus, manufacturer, model, notes
    } = req.body;
    const result = await db.execute(sql`
      INSERT INTO calibration_instruments
        (name, serial_number, type, location, department, calibration_interval,
         last_calibration_date, next_calibration_date, calibration_status,
         manufacturer, model, notes)
      VALUES
        (${name}, ${serialNumber}, ${type}, ${location}, ${department},
         ${calibrationInterval || 12}, ${lastCalibrationDate || null},
         ${nextCalibrationDate || null}, ${calibrationStatus || 'active'},
         ${manufacturer || null}, ${model || null}, ${notes || null})
      RETURNING *
    `);
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    logger.error("qms_calibration_instrument_create_error", { error: err.message });
    res.status(500).json({ error: "Failed to create instrument" });
  }
});

router.put("/calibration-instruments/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, serialNumber, type, location, department,
      calibrationInterval, lastCalibrationDate, nextCalibrationDate,
      calibrationStatus, manufacturer, model, notes, outOfCalibration
    } = req.body;
    const result = await db.execute(sql`
      UPDATE calibration_instruments SET
        name = COALESCE(${name}, name),
        serial_number = COALESCE(${serialNumber}, serial_number),
        type = COALESCE(${type}, type),
        location = COALESCE(${location}, location),
        department = COALESCE(${department}, department),
        calibration_interval = COALESCE(${calibrationInterval}, calibration_interval),
        last_calibration_date = COALESCE(${lastCalibrationDate || null}, last_calibration_date),
        next_calibration_date = COALESCE(${nextCalibrationDate || null}, next_calibration_date),
        calibration_status = COALESCE(${calibrationStatus}, calibration_status),
        manufacturer = COALESCE(${manufacturer || null}, manufacturer),
        model = COALESCE(${model || null}, model),
        notes = COALESCE(${notes || null}, notes),
        out_of_calibration = COALESCE(${outOfCalibration !== undefined ? outOfCalibration : null}, out_of_calibration),
        updated_at = NOW()
      WHERE id = ${parseInt(id)}
      RETURNING *
    `);
    if (!result.rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(result.rows[0]);
  } catch (err: any) {
    logger.error("qms_calibration_instrument_update_error", { error: err.message });
    res.status(500).json({ error: "Failed to update instrument" });
  }
});

router.delete("/calibration-instruments/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute(sql`DELETE FROM calibration_instruments WHERE id = ${parseInt(id)}`);
    res.json({ success: true });
  } catch (err: any) {
    logger.error("qms_calibration_instrument_delete_error", { error: err.message });
    res.status(500).json({ error: "Failed to delete instrument" });
  }
});

// ─────────────────────────────────────────────────────────────
// CALIBRATION RECORDS (HEAD)
// ─────────────────────────────────────────────────────────────

router.get("/calibration-records", async (req, res) => {
  try {
    const { instrumentId } = req.query;
    const result = await db.execute(sql`
      SELECT cr.*, ci.name as instrument_name, ci.serial_number
      FROM calibration_records cr
      LEFT JOIN calibration_instruments ci ON ci.id = cr.instrument_id
      ${instrumentId ? sql`WHERE cr.instrument_id = ${parseInt(instrumentId as string)}` : sql``}
      ORDER BY cr.calibration_date DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    logger.error("qms_calibration_records_error", { error: err.message });
    res.status(500).json({ error: "Failed to fetch calibration records" });
  }
});

router.post("/calibration-records", async (req, res) => {
  try {
    const {
      instrumentId, calibrationDate, result: calResult, nextDueDate,
      certificateNumber, performedBy, labName, notes
    } = req.body;
    const record = await db.execute(sql`
      INSERT INTO calibration_records
        (instrument_id, calibration_date, result, next_due_date,
         certificate_number, performed_by, lab_name, notes)
      VALUES
        (${instrumentId}, ${calibrationDate}, ${calResult || 'pass'},
         ${nextDueDate || null}, ${certificateNumber || null},
         ${performedBy || null}, ${labName || null}, ${notes || null})
      RETURNING *
    `);
    // Update instrument status and dates
    await db.execute(sql`
      UPDATE calibration_instruments SET
        last_calibration_date = ${calibrationDate},
        next_calibration_date = ${nextDueDate || null},
        calibration_status = ${calResult === 'fail' ? 'overdue' : 'calibrated'},
        out_of_calibration = ${calResult === 'fail' ? true : false},
        updated_at = NOW()
      WHERE id = ${instrumentId}
    `);
    res.status(201).json(record.rows[0]);
  } catch (err: any) {
    logger.error("qms_calibration_record_create_error", { error: err.message });
    res.status(500).json({ error: "Failed to create calibration record" });
  }
});

// ─────────────────────────────────────────────────────────────
// INTERNAL AUDITS (HEAD)
// ─────────────────────────────────────────────────────────────

router.get("/internal-audits", async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT * FROM internal_audits ORDER BY scheduled_date DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    logger.error("qms_audits_list_error", { error: err.message });
    res.status(500).json({ error: "Failed to fetch audits" });
  }
});

router.get("/internal-audits/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const audit = await db.execute(sql`SELECT * FROM internal_audits WHERE id = ${parseInt(id)}`);
    if (!audit.rows[0]) return res.status(404).json({ error: "Not found" });
    const findings = await db.execute(sql`
      SELECT af.*, 
        (SELECT json_agg(aca.*) FROM audit_corrective_actions aca WHERE aca.finding_id = af.id) as corrective_actions
      FROM audit_findings af WHERE af.audit_id = ${parseInt(id)}
      ORDER BY af.created_at DESC
    `);
    res.json({ ...audit.rows[0], findings: findings.rows });
  } catch (err: any) {
    logger.error("qms_audit_get_error", { error: err.message });
    res.status(500).json({ error: "Failed to fetch audit" });
  }
});

router.post("/internal-audits", async (req, res) => {
  try {
    const {
      auditNumber, scope, auditor, auditee, scheduledDate,
      executionDate, status, auditType, notes
    } = req.body;
    const result = await db.execute(sql`
      INSERT INTO internal_audits
        (audit_number, scope, auditor, auditee, scheduled_date,
         execution_date, status, audit_type, notes)
      VALUES
        (${auditNumber || `AUD-${Date.now()}`}, ${scope}, ${auditor || null},
         ${auditee || null}, ${scheduledDate || null}, ${executionDate || null},
         ${status || 'planned'}, ${auditType || 'internal'}, ${notes || null})
      RETURNING *
    `);
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    logger.error("qms_audit_create_error", { error: err.message });
    res.status(500).json({ error: "Failed to create audit" });
  }
});

router.put("/internal-audits/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      scope, auditor, auditee, scheduledDate, executionDate, status, notes
    } = req.body;
    const result = await db.execute(sql`
      UPDATE internal_audits SET
        scope = COALESCE(${scope}, scope),
        auditor = COALESCE(${auditor || null}, auditor),
        auditee = COALESCE(${auditee || null}, auditee),
        scheduled_date = COALESCE(${scheduledDate || null}, scheduled_date),
        execution_date = COALESCE(${executionDate || null}, execution_date),
        status = COALESCE(${status}, status),
        notes = COALESCE(${notes || null}, notes),
        updated_at = NOW()
      WHERE id = ${parseInt(id)}
      RETURNING *
    `);
    if (!result.rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(result.rows[0]);
  } catch (err: any) {
    logger.error("qms_audit_update_error", { error: err.message });
    res.status(500).json({ error: "Failed to update audit" });
  }
});

// ─────────────────────────────────────────────────────────────
// AUDIT FINDINGS (HEAD)
// ─────────────────────────────────────────────────────────────

router.get("/audit-findings", async (req, res) => {
  try {
    const { auditId } = req.query;
    const result = await db.execute(sql`
      SELECT af.*, ia.scope as audit_scope
      FROM audit_findings af
      LEFT JOIN internal_audits ia ON ia.id = af.audit_id
      ${auditId ? sql`WHERE af.audit_id = ${parseInt(auditId as string)}` : sql``}
      ORDER BY af.created_at DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    logger.error("qms_findings_list_error", { error: err.message });
    res.status(500).json({ error: "Failed to fetch findings" });
  }
});

router.post("/audit-findings", async (req, res) => {
  try {
    const {
      auditId, findingNumber, description, severity,
      clause, evidence, status, responsiblePerson, dueDate
    } = req.body;
    const result = await db.execute(sql`
      INSERT INTO audit_findings
        (audit_id, finding_number, description, severity, clause,
         evidence, status, responsible_person, due_date)
      VALUES
        (${auditId}, ${findingNumber || `F-${Date.now()}`}, ${description},
         ${severity || 'minor'}, ${clause || null}, ${evidence || null},
         ${status || 'open'}, ${responsiblePerson || null}, ${dueDate || null})
      RETURNING *
    `);
    // Update audit status if there are open findings
    await db.execute(sql`
      UPDATE internal_audits SET
        status = CASE WHEN status = 'completed' THEN 'open_findings' ELSE status END,
        updated_at = NOW()
      WHERE id = ${auditId}
    `);
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    logger.error("qms_finding_create_error", { error: err.message });
    res.status(500).json({ error: "Failed to create finding" });
  }
});

router.put("/audit-findings/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { description, severity, status, responsiblePerson, dueDate, closedDate } = req.body;
    const result = await db.execute(sql`
      UPDATE audit_findings SET
        description = COALESCE(${description}, description),
        severity = COALESCE(${severity}, severity),
        status = COALESCE(${status}, status),
        responsible_person = COALESCE(${responsiblePerson || null}, responsible_person),
        due_date = COALESCE(${dueDate || null}, due_date),
        closed_date = COALESCE(${closedDate || null}, closed_date),
        updated_at = NOW()
      WHERE id = ${parseInt(id)}
      RETURNING *
    `);
    if (!result.rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(result.rows[0]);
  } catch (err: any) {
    logger.error("qms_finding_update_error", { error: err.message });
    res.status(500).json({ error: "Failed to update finding" });
  }
});

// ─────────────────────────────────────────────────────────────
// AUDIT CORRECTIVE ACTIONS (HEAD)
// ─────────────────────────────────────────────────────────────

router.get("/audit-corrective-actions", async (req, res) => {
  try {
    const { findingId } = req.query;
    const result = await db.execute(sql`
      SELECT * FROM audit_corrective_actions
      ${findingId ? sql`WHERE finding_id = ${parseInt(findingId as string)}` : sql``}
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    logger.error("qms_corrective_actions_error", { error: err.message });
    res.status(500).json({ error: "Failed to fetch corrective actions" });
  }
});

router.post("/audit-corrective-actions", async (req, res) => {
  try {
    const {
      findingId, description, assignedTo, dueDate, status, completedDate, verifiedBy
    } = req.body;
    const result = await db.execute(sql`
      INSERT INTO audit_corrective_actions
        (finding_id, description, assigned_to, due_date, status, completed_date, verified_by)
      VALUES
        (${findingId}, ${description}, ${assignedTo || null}, ${dueDate || null},
         ${status || 'open'}, ${completedDate || null}, ${verifiedBy || null})
      RETURNING *
    `);
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    logger.error("qms_corrective_action_create_error", { error: err.message });
    res.status(500).json({ error: "Failed to create corrective action" });
  }
});

router.put("/audit-corrective-actions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { description, assignedTo, dueDate, status, completedDate, verifiedBy } = req.body;
    const result = await db.execute(sql`
      UPDATE audit_corrective_actions SET
        description = COALESCE(${description}, description),
        assigned_to = COALESCE(${assignedTo || null}, assigned_to),
        due_date = COALESCE(${dueDate || null}, due_date),
        status = COALESCE(${status}, status),
        completed_date = COALESCE(${completedDate || null}, completed_date),
        verified_by = COALESCE(${verifiedBy || null}, verified_by),
        updated_at = NOW()
      WHERE id = ${parseInt(id)}
      RETURNING *
    `);
    if (!result.rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(result.rows[0]);
  } catch (err: any) {
    logger.error("qms_corrective_action_update_error", { error: err.message });
    res.status(500).json({ error: "Failed to update corrective action" });
  }
});

// ─────────────────────────────────────────────────────────────
// MATERIAL CERTIFICATES (HEAD)
// ─────────────────────────────────────────────────────────────

router.get("/material-certificates", async (req, res) => {
  try {
    const { batchId, materialId, expiringDays } = req.query;
    const result = await db.execute(sql`
      SELECT * FROM material_certificates
      WHERE 1=1
        ${batchId ? sql`AND batch_reference = ${batchId as string}` : sql``}
        ${materialId ? sql`AND material_id = ${parseInt(materialId as string)}` : sql``}
        ${expiringDays ? sql`AND expiry_date <= CURRENT_DATE + INTERVAL '${sql.raw(expiringDays as string)} days'` : sql``}
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    logger.error("qms_material_certs_list_error", { error: err.message });
    res.status(500).json({ error: "Failed to fetch material certificates" });
  }
});

router.get("/material-certificates/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.execute(sql`
      SELECT * FROM material_certificates WHERE id = ${parseInt(id)}
    `);
    if (!result.rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(result.rows[0]);
  } catch (err: any) {
    logger.error("qms_material_cert_get_error", { error: err.message });
    res.status(500).json({ error: "Failed to fetch material certificate" });
  }
});

router.post("/material-certificates", async (req, res) => {
  try {
    const {
      certificateNumber, certType, materialId, materialName,
      batchReference, supplierId, supplierName, issueDate, expiryDate,
      grade, standard, heatNumber, millName, chemicalComposition,
      mechanicalProperties, status, notes
    } = req.body;
    const result = await db.execute(sql`
      INSERT INTO material_certificates
        (certificate_number, cert_type, material_id, material_name,
         batch_reference, supplier_id, supplier_name, issue_date, expiry_date,
         grade, standard, heat_number, mill_name, chemical_composition,
         mechanical_properties, status, notes)
      VALUES
        (${certificateNumber}, ${certType || 'MTC'}, ${materialId || null}, ${materialName},
         ${batchReference || null}, ${supplierId || null}, ${supplierName || null},
         ${issueDate || null}, ${expiryDate || null},
         ${grade || null}, ${standard || null}, ${heatNumber || null},
         ${millName || null}, ${chemicalComposition || null},
         ${mechanicalProperties || null}, ${status || 'valid'}, ${notes || null})
      RETURNING *
    `);
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    logger.error("qms_material_cert_create_error", { error: err.message });
    res.status(500).json({ error: "Failed to create material certificate" });
  }
});

router.put("/material-certificates/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      certificateNumber, certType, materialName, batchReference,
      supplierName, issueDate, expiryDate, grade, standard,
      heatNumber, millName, status, notes
    } = req.body;
    const result = await db.execute(sql`
      UPDATE material_certificates SET
        certificate_number = COALESCE(${certificateNumber}, certificate_number),
        cert_type = COALESCE(${certType}, cert_type),
        material_name = COALESCE(${materialName}, material_name),
        batch_reference = COALESCE(${batchReference || null}, batch_reference),
        supplier_name = COALESCE(${supplierName || null}, supplier_name),
        issue_date = COALESCE(${issueDate || null}, issue_date),
        expiry_date = COALESCE(${expiryDate || null}, expiry_date),
        grade = COALESCE(${grade || null}, grade),
        standard = COALESCE(${standard || null}, standard),
        heat_number = COALESCE(${heatNumber || null}, heat_number),
        mill_name = COALESCE(${millName || null}, mill_name),
        status = COALESCE(${status}, status),
        notes = COALESCE(${notes || null}, notes),
        updated_at = NOW()
      WHERE id = ${parseInt(id)}
      RETURNING *
    `);
    if (!result.rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(result.rows[0]);
  } catch (err: any) {
    logger.error("qms_material_cert_update_error", { error: err.message });
    res.status(500).json({ error: "Failed to update material certificate" });
  }
});

router.delete("/material-certificates/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute(sql`DELETE FROM material_certificates WHERE id = ${parseInt(id)}`);
    res.json({ success: true });
  } catch (err: any) {
    logger.error("qms_material_cert_delete_error", { error: err.message });
    res.status(500).json({ error: "Failed to delete material certificate" });
  }
});

// Traceability: get all certs for a batch
router.get("/material-certificates/traceability/batch/:batchRef", async (req, res) => {
  try {
    const { batchRef } = req.params;
    const result = await db.execute(sql`
      SELECT * FROM material_certificates
      WHERE batch_reference = ${batchRef}
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    logger.error("qms_traceability_batch_error", { error: err.message });
    res.status(500).json({ error: "Failed to fetch batch traceability" });
  }
});

// Traceability: get all batches for a cert
router.get("/material-certificates/traceability/cert/:certId", async (req, res) => {
  try {
    const { certId } = req.params;
    const cert = await db.execute(sql`
      SELECT * FROM material_certificates WHERE id = ${parseInt(certId)}
    `);
    if (!cert.rows[0]) return res.status(404).json({ error: "Certificate not found" });
    const c = cert.rows[0] as any;
    const batches = await db.execute(sql`
      SELECT * FROM material_certificates
      WHERE material_id = ${c.material_id} AND grade = ${c.grade}
      ORDER BY created_at DESC
    `);
    res.json(batches.rows);
  } catch (err: any) {
    logger.error("qms_traceability_cert_error", { error: err.message });
    res.status(500).json({ error: "Failed to fetch certificate traceability" });
  }
});

// ─────────────────────────────────────────────────────────────
// QUALITY KPIS (HEAD)
// ─────────────────────────────────────────────────────────────

router.get("/quality-kpis/summary", async (req, res) => {
  try {
    const summary = await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM non_conformance_reports WHERE status != 'closed') as open_ncrs,
        (SELECT COUNT(*) FROM internal_audits WHERE status = 'open_findings') as audits_with_findings,
        (SELECT COUNT(*) FROM calibration_instruments WHERE calibration_status = 'overdue') as overdue_calibrations,
        (SELECT COUNT(*) FROM material_certificates WHERE expiry_date <= CURRENT_DATE + INTERVAL '30 days') as expiring_certs
    `);
    res.json(summary.rows[0]);
  } catch (err: any) {
    logger.error("qms_kpi_summary_error", { error: err.message });
    res.status(500).json({ error: "Failed to fetch KPI summary" });
  }
});

// ── NCR routes (Our version) ──────────────────────────────────────────────────────────────

router.get("/qms/ncr", async (_req: Request, res: Response) => {
  const rows = await q(`
    SELECT * FROM non_conformance_reports
    ORDER BY created_at DESC
  `);
  res.json(rows);
});

router.get("/qms/ncr/stats", async (_req: Request, res: Response) => {
  const rows = await q(`
    SELECT
      COUNT(*) FILTER (WHERE status != 'closed') AS open_count,
      COUNT(*) FILTER (WHERE status = 'closed') AS closed_count,
      COUNT(*) FILTER (WHERE status IN ('investigating','in_progress')) AS investigating_count,
      COUNT(*) FILTER (WHERE status IN ('investigating','in_progress')) AS investigating_count,
      COUNT(*) FILTER (WHERE severity = 'critical') AS critical_count,
      COALESCE(SUM(COALESCE(cost_impact, cost_of_quality, 0)),0) AS total_cost,
      COUNT(*) AS total
    FROM non_conformance_reports WHERE is_active = TRUE OR is_active IS NULL
  `);
  res.json(rows[0] || {});
});

router.get("/qms/ncr/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const rows = await q(`SELECT * FROM non_conformance_reports WHERE id = ${safeInt(id)}`);
  if (!rows.length) return res.status(404).json({ error: "Not found" });
  const ncr = rows[0];
  const rca = await q(`SELECT * FROM ncr_root_causes WHERE ncr_id = ${safeInt(id)} ORDER BY id DESC LIMIT 1`);
  const capas = await q(`SELECT id, capa_number, title, status, type FROM corrective_actions WHERE source_ncr_id = ${safeInt(id)}`);
  res.json({ ...ncr, root_cause_analysis: rca[0] || null, linked_capas: capas });
});

router.post("/qms/ncr", async (req: Request, res: Response) => {
  const b = req.body || {};
  const num = generateNumber("NCR");
  const rows = await q(`
    INSERT INTO non_conformance_reports (
      ncr_number, title, description, source, product_name, product_code, batch_reference,
      quantity_affected, defect_type, severity, disposition, status, detected_by,
      detection_date, responsible_person, containment_action, root_cause_summary, cost_impact,
      root_cause, corrective_action, preventive_action, cost_of_quality
    ) VALUES (
      ${s(num)}, ${s(b.title)}, ${s(b.description)}, ${s(b.source || "production")},
      ${s(b.product_name)}, ${s(b.product_code)}, ${s(b.batch_reference)},
      ${safeInt(b.quantity_affected)}, ${s(b.defect_type)}, ${s(b.severity || "minor")},
      ${s(b.disposition || "pending")}, ${s(b.status || "open")}, ${s(b.detected_by)},
      ${safeDate(b.detection_date) === "NULL" ? "CURRENT_DATE" : safeDate(b.detection_date)},
      ${s(b.responsible_person)}, ${s(b.containment_action)}, ${s(b.root_cause_summary)},
      ${safeNum(b.cost_impact || b.cost_of_quality)},
      ${s(b.root_cause || b.root_cause_summary)}, ${s(b.corrective_action || b.containment_action)},
      ${s(b.preventive_action)}, ${safeNum(b.cost_of_quality || b.cost_impact)}
    ) RETURNING *
  `);
  res.json(rows[0] || {});
});

router.put("/qms/ncr/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const b = req.body || {};
  const rows = await q(`
    UPDATE non_conformance_reports SET
      title = ${s(b.title)},
      description = ${s(b.description)},
      source = ${s(b.source)},
      product_name = ${s(b.product_name)},
      product_code = ${s(b.product_code)},
      batch_reference = ${s(b.batch_reference)},
      quantity_affected = ${safeInt(b.quantity_affected)},
      defect_type = ${s(b.defect_type)},
      severity = ${s(b.severity)},
      disposition = ${s(b.disposition)},
      status = ${s(b.status)},
      detected_by = ${s(b.detected_by)},
      detection_date = ${safeDate(b.detection_date) === "NULL" ? "detection_date" : safeDate(b.detection_date)},
      responsible_person = ${s(b.responsible_person)},
      containment_action = ${s(b.containment_action)},
      root_cause_summary = ${s(b.root_cause_summary)},
      cost_impact = ${safeNum(b.cost_impact || b.cost_of_quality)},
      root_cause = ${s(b.root_cause || b.root_cause_summary)},
      corrective_action = ${s(b.corrective_action || b.containment_action)},
      preventive_action = ${s(b.preventive_action)},
      cost_of_quality = ${safeNum(b.cost_of_quality || b.cost_impact)},
      updated_at = NOW()
      ${b.status === "closed" ? ", closed_date = CURRENT_DATE, closed_at = NOW()" : ""}
    WHERE id = ${safeInt(id)} RETURNING *
  `);
  res.json(rows[0] || {});
});

router.delete("/qms/ncr/:id", async (req: Request, res: Response) => {
  await q(`DELETE FROM non_conformance_reports WHERE id = ${safeInt(req.params.id)}`);
  res.json({ success: true });
});

// NCR root cause analysis
router.post("/qms/ncr/:id/rca", async (req: Request, res: Response) => {
  const b = req.body || {};
  const ncrId = safeInt(req.params.id);
  await q(`DELETE FROM ncr_root_causes WHERE ncr_id = ${ncrId}`);
  const rows = await q(`
    INSERT INTO ncr_root_causes (
      ncr_id, method, why1, why2, why3, why4, why5, root_cause,
      ishikawa_man, ishikawa_machine, ishikawa_material, ishikawa_method,
      ishikawa_measurement, ishikawa_environment
    ) VALUES (
      ${ncrId}, ${s(b.method || "5why")},
      ${s(b.why1)}, ${s(b.why2)}, ${s(b.why3)}, ${s(b.why4)}, ${s(b.why5)},
      ${s(b.root_cause)},
      ${s(b.ishikawa_man)}, ${s(b.ishikawa_machine)}, ${s(b.ishikawa_material)},
      ${s(b.ishikawa_method)}, ${s(b.ishikawa_measurement)}, ${s(b.ishikawa_environment)}
    ) RETURNING *
  `);
  res.json(rows[0] || {});
});

// ── CAPA routes (Our version) ─────────────────────────────────────────────────────────────

router.get("/qms/capa", async (_req: Request, res: Response) => {
  const rows = await q(`SELECT * FROM corrective_actions ORDER BY created_at DESC`);
  res.json(rows);
});

router.get("/qms/capa/stats", async (_req: Request, res: Response) => {
  const rows = await q(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'initiated') AS initiated,
      COUNT(*) FILTER (WHERE status = 'in-progress') AS in_progress,
      COUNT(*) FILTER (WHERE status = 'verification') AS verification,
      COUNT(*) FILTER (WHERE status = 'effectiveness-review') AS effectiveness_review,
      COUNT(*) FILTER (WHERE status = 'closed') AS closed,
      COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status != 'closed') AS overdue
    FROM corrective_actions
  `);
  res.json(rows[0] || {});
});

router.get("/qms/capa/:id", async (req: Request, res: Response) => {
  const rows = await q(`SELECT * FROM corrective_actions WHERE id = ${safeInt(req.params.id)}`);
  if (!rows.length) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

router.post("/qms/capa", async (req: Request, res: Response) => {
  const b = req.body || {};
  const num = generateNumber("CAPA");
  const rows = await q(`
    INSERT INTO corrective_actions (
      capa_number, title, description, type, source_type, source_ncr_id, source_complaint_id,
      responsible_person, department, due_date, status, priority,
      verification_method, verification_person, notes, cost_estimate
    ) VALUES (
      ${s(num)}, ${s(b.title)}, ${s(b.description)},
      ${s(b.type || "corrective")}, ${s(b.source_type || "ncr")},
      ${b.source_ncr_id ? safeInt(b.source_ncr_id) : "NULL"},
      ${b.source_complaint_id ? safeInt(b.source_complaint_id) : "NULL"},
      ${s(b.responsible_person)}, ${s(b.department)},
      ${safeDate(b.due_date) === "NULL" ? "NULL" : safeDate(b.due_date)},
      ${s(b.status || "initiated")}, ${s(b.priority || "medium")},
      ${s(b.verification_method)}, ${s(b.verification_person)},
      ${s(b.notes)}, ${safeNum(b.cost_estimate)}
    ) RETURNING *
  `);
  res.json(rows[0] || {});
});

router.put("/qms/capa/:id", async (req: Request, res: Response) => {
  const b = req.body || {};
  const rows = await q(`
    UPDATE corrective_actions SET
      title = ${s(b.title)},
      description = ${s(b.description)},
      type = ${s(b.type)},
      source_type = ${s(b.source_type)},
      source_ncr_id = ${b.source_ncr_id ? safeInt(b.source_ncr_id) : "NULL"},
      source_complaint_id = ${b.source_complaint_id ? safeInt(b.source_complaint_id) : "NULL"},
      responsible_person = ${s(b.responsible_person)},
      department = ${s(b.department)},
      due_date = ${safeDate(b.due_date) === "NULL" ? "due_date" : safeDate(b.due_date)},
      completed_date = ${safeDate(b.completed_date) === "NULL" ? "completed_date" : safeDate(b.completed_date)},
      status = ${s(b.status)},
      priority = ${s(b.priority)},
      verification_method = ${s(b.verification_method)},
      verification_person = ${s(b.verification_person)},
      verification_date = ${safeDate(b.verification_date) === "NULL" ? "verification_date" : safeDate(b.verification_date)},
      verification_result = ${s(b.verification_result)},
      effectiveness_rating = ${b.effectiveness_rating ? safeInt(b.effectiveness_rating) : "effectiveness_rating"},
      effectiveness_notes = ${s(b.effectiveness_notes)},
      cost_estimate = ${safeNum(b.cost_estimate)},
      cost_actual = ${safeNum(b.cost_actual)},
      notes = ${s(b.notes)},
      updated_at = NOW()
      ${b.status === "closed" ? ", closed_at = NOW()" : ""}
    WHERE id = ${safeInt(req.params.id)} RETURNING *
  `);
  res.json(rows[0] || {});
});

router.delete("/qms/capa/:id", async (req: Request, res: Response) => {
  await q(`DELETE FROM corrective_actions WHERE id = ${safeInt(req.params.id)}`);
  res.json({ success: true });
});

// ── Customer Complaints routes (Our version) ───────────────────────────────────────────────

router.get("/qms/complaints", async (_req: Request, res: Response) => {
  const rows = await q(`
    SELECT *,
      CASE
        WHEN status NOT IN ('resolved','closed') AND target_resolution_date < CURRENT_DATE THEN 'overdue'
        WHEN status NOT IN ('resolved','closed') AND target_resolution_date <= CURRENT_DATE + INTERVAL '2 days' THEN 'warning'
        ELSE 'ok'
      END AS sla_status
    FROM customer_complaints
    ORDER BY created_at DESC
  `);
  res.json(rows);
});

router.get("/qms/complaints/stats", async (_req: Request, res: Response) => {
  const rows = await q(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'received') AS received,
      COUNT(*) FILTER (WHERE status = 'investigating') AS investigating,
      COUNT(*) FILTER (WHERE status = 'resolved') AS resolved,
      COUNT(*) FILTER (WHERE status = 'closed') AS closed,
      COUNT(*) FILTER (WHERE status NOT IN ('resolved','closed') AND target_resolution_date < CURRENT_DATE) AS overdue,
      ROUND(AVG(CASE WHEN actual_resolution_date IS NOT NULL THEN
        EXTRACT(DAY FROM actual_resolution_date::timestamp - received_date::timestamp)
      END), 1) AS avg_resolution_days
    FROM customer_complaints
  `);
  res.json(rows[0] || {});
});

router.get("/qms/complaints/:id", async (req: Request, res: Response) => {
  const rows = await q(`SELECT * FROM customer_complaints WHERE id = ${safeInt(req.params.id)}`);
  if (!rows.length) return res.status(404).json({ error: "Not found" });
  const complaint = rows[0];
  const investigations = await q(`SELECT * FROM complaint_investigations WHERE complaint_id = ${safeInt(req.params.id)} ORDER BY step_number`);
  res.json({ ...complaint, investigations });
});

router.post("/qms/complaints", async (req: Request, res: Response) => {
  const b = req.body || {};
  const num = generateNumber("CMP");
  const slaDate = b.received_date
    ? `(${safeDate(b.received_date)}::date + INTERVAL '${safeInt(b.sla_days || 10)} days')`
    : `(CURRENT_DATE + INTERVAL '${safeInt(b.sla_days || 10)} days')`;
  const rows = await q(`
    INSERT INTO customer_complaints (
      complaint_number, customer_name, customer_reference, product_name, product_code,
      batch_reference, complaint_type, severity, description, received_date,
      sla_days, target_resolution_date, status, assigned_to, linked_ncr_id
    ) VALUES (
      ${s(num)}, ${s(b.customer_name)}, ${s(b.customer_reference)},
      ${s(b.product_name)}, ${s(b.product_code)}, ${s(b.batch_reference)},
      ${s(b.complaint_type || "quality")}, ${s(b.severity || "medium")},
      ${s(b.description)},
      ${safeDate(b.received_date) === "NULL" ? "CURRENT_DATE" : safeDate(b.received_date)},
      ${safeInt(b.sla_days || 10)}, ${slaDate},
      ${s(b.status || "received")}, ${s(b.assigned_to)},
      ${b.linked_ncr_id ? safeInt(b.linked_ncr_id) : "NULL"}
    ) RETURNING *
  `);
  res.json(rows[0] || {});
});

router.put("/qms/complaints/:id", async (req: Request, res: Response) => {
  const b = req.body || {};
  const rows = await q(`
    UPDATE customer_complaints SET
      customer_name = ${s(b.customer_name)},
      customer_reference = ${s(b.customer_reference)},
      product_name = ${s(b.product_name)},
      product_code = ${s(b.product_code)},
      batch_reference = ${s(b.batch_reference)},
      complaint_type = ${s(b.complaint_type)},
      severity = ${s(b.severity)},
      description = ${s(b.description)},
      sla_days = ${safeInt(b.sla_days || 10)},
      status = ${s(b.status)},
      assigned_to = ${s(b.assigned_to)},
      linked_ncr_id = ${b.linked_ncr_id ? safeInt(b.linked_ncr_id) : "NULL"},
      investigation_summary = ${s(b.investigation_summary)},
      resolution_description = ${s(b.resolution_description)},
      customer_notified = ${b.customer_notified ? "TRUE" : "FALSE"},
      customer_notified_date = ${safeDate(b.customer_notified_date) === "NULL" ? "customer_notified_date" : safeDate(b.customer_notified_date)},
      customer_satisfaction = ${b.customer_satisfaction ? safeInt(b.customer_satisfaction) : "customer_satisfaction"},
      root_cause_confirmed = ${s(b.root_cause_confirmed)},
      prevent_recurrence = ${s(b.prevent_recurrence)},
      updated_at = NOW()
      ${b.status === 'closed' || b.status === 'resolved' ? ", actual_resolution_date = CURRENT_DATE, closed_at = NOW()" : ""}
    WHERE id = ${safeInt(req.params.id)} RETURNING *
  `);
  res.json(rows[0] || {});
});

router.delete("/qms/complaints/:id", async (req: Request, res: Response) => {
  await q(`DELETE FROM customer_complaints WHERE id = ${safeInt(req.params.id)}`);
  res.json({ success: true });
});

// Complaint investigation log
router.post("/qms/complaints/:id/investigation", async (req: Request, res: Response) => {
  const b = req.body || {};
  const complaintId = safeInt(req.params.id);
  const rows = await q(`
    INSERT INTO complaint_investigations (
      complaint_id, step_number, action_taken, findings, investigator, investigation_date
    ) VALUES (
      ${complaintId},
      COALESCE((SELECT MAX(step_number)+1 FROM complaint_investigations WHERE complaint_id = ${complaintId}), 1),
      ${s(b.action_taken)}, ${s(b.findings)}, ${s(b.investigator)},
      ${safeDate(b.investigation_date) === "NULL" ? "CURRENT_DATE" : safeDate(b.investigation_date)}
    ) RETURNING *
  `);
  res.json(rows[0] || {});
});

// ── Supplier Quality routes (Our version) ───────────────────────────────────────────────────

router.get("/qms/supplier-quality", async (_req: Request, res: Response) => {
  const rows = await q(`SELECT * FROM supplier_quality_scores ORDER BY quality_score DESC`);
  res.json(rows);
});

router.get("/qms/supplier-quality/:id", async (req: Request, res: Response) => {
  const rows = await q(`SELECT * FROM supplier_quality_scores WHERE supplier_id = ${safeInt(req.params.id)}`);
  res.json(rows[0] || {});
});

router.get("/qms/supplier-audits", async (req: Request, res: Response) => {
  const { supplierId } = req.query;
  const where = supplierId ? `WHERE supplier_id = ${safeInt(supplierId)}` : "";
  const rows = await q(`SELECT * FROM supplier_audits ${where} ORDER BY actual_date DESC NULLS LAST, scheduled_date DESC`);
  res.json(rows);
});

router.post("/qms/supplier-audits", async (req: Request, res: Response) => {
  const b = req.body || {};
  const num = generateNumber("AUD");
  const rows = await q(`
    INSERT INTO supplier_audits (
      audit_number, supplier_id, supplier_name, audit_type, scheduled_date, auditor, scope, status
    ) VALUES (
      ${s(num)}, ${safeInt(b.supplier_id)}, ${s(b.supplier_name)}, ${s(b.audit_type || "routine")},
      ${safeDate(b.scheduled_date)}, ${s(b.auditor)}, ${s(b.scope)}, ${s(b.status || "scheduled")}
    ) RETURNING *
  `);
  res.json(rows[0] || {});
});

router.put("/qms/supplier-audits/:id", async (req: Request, res: Response) => {
  const b = req.body || {};
  const rows = await q(`
    UPDATE supplier_audits SET
      actual_date = ${safeDate(b.actual_date)},
      auditor = ${s(b.auditor)},
      status = ${s(b.status)},
      overall_score = ${safeNum(b.overall_score)},
      critical_findings = ${safeInt(b.critical_findings)},
      major_findings = ${safeInt(b.major_findings)},
      minor_findings = ${safeInt(b.minor_findings)},
      findings_summary = ${s(b.findings_summary)},
      recommendations = ${s(b.recommendations)},
      next_audit_date = ${safeDate(b.next_audit_date)},
      updated_at = NOW()
    WHERE id = ${safeInt(req.params.id)} RETURNING *
  `);
  res.json(rows[0] || {});
});

router.get("/qms/scar", async (req: Request, res: Response) => {
  const { supplierId } = req.query;
  const where = supplierId ? `WHERE supplier_id = ${safeInt(supplierId)}` : "";
  const rows = await q(`SELECT * FROM supplier_corrective_actions ${where} ORDER BY issued_date DESC`);
  res.json(rows);
});

router.post("/qms/scar", async (req: Request, res: Response) => {
  const b = req.body || {};
  const num = generateNumber("SCAR");
  const rows = await q(`
    INSERT INTO supplier_corrective_actions (
      scar_number, supplier_id, supplier_name, issue_description, severity,
      issued_date, response_due_date, status, linked_audit_id, linked_ncr_id
    ) VALUES (
      ${s(num)}, ${safeInt(b.supplier_id)}, ${s(b.supplier_name)}, ${s(b.issue_description)}, ${s(b.severity || "major")},
      ${safeDate(b.issued_date) === "NULL" ? "CURRENT_DATE" : safeDate(b.issued_date)},
      ${safeDate(b.response_due_date)}, ${s(b.status || "issued")},
      ${safeInt(b.linked_audit_id) || "NULL"}, ${safeInt(b.linked_ncr_id) || "NULL"}
    ) RETURNING *
  `);
  res.json(rows[0] || {});
});

router.put("/qms/scar/:id", async (req: Request, res: Response) => {
  const b = req.body || {};
  const rows = await q(`
    UPDATE supplier_corrective_actions SET
      status = ${s(b.status)},
      supplier_root_cause = ${s(b.supplier_root_cause)},
      supplier_corrective_action = ${s(b.supplier_corrective_action)},
      supplier_response_date = ${safeDate(b.supplier_response_date)},
      verification_method = ${s(b.verification_method)},
      verification_date = ${safeDate(b.verification_date)},
      verification_result = ${s(b.verification_result)},
      verified_by = ${s(b.verified_by)},
      effectiveness_confirmed = ${b.effectiveness_confirmed ? "TRUE" : "FALSE"},
      close_out_date = ${b.status === "closed" ? "CURRENT_DATE" : "close_out_date"},
      updated_at = NOW()
    WHERE id = ${safeInt(req.params.id)} RETURNING *
  `);
  res.json(rows[0] || {});
});

export default router;
