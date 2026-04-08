import { Router, Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";
import { validateSession } from "../lib/auth";

const router = Router();

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  (req as any).user = result.user;
  next();
}
router.use(requireAuth as any);

async function q(query: string): Promise<any[]> {
  try {
    const r = await pool.query(query);
    return r.rows || [];
  } catch (e: any) {
    console.error("HSE query error:", e.message, query.slice(0, 200));
    return [];
  }
}

function s(v: any): string {
  if (v === null || v === undefined || v === "") return "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

function num(v: any, def = 0): number {
  const n = Number(v);
  return isNaN(n) ? def : n;
}

async function nextIncidentNum(): Promise<string> {
  const year = new Date().getFullYear();
  const rows = await q(`SELECT incident_number FROM safety_incidents WHERE incident_number LIKE 'INC-${year}-%' ORDER BY id DESC LIMIT 1`);
  const last = (rows[0] as any)?.incident_number;
  const seq = last ? parseInt(last.split("-").pop()!) + 1 : 1;
  return `INC-${year}-${String(seq).padStart(4, "0")}`;
}

async function logAudit(incidentId: number, action: string, performedBy: string, fieldChanged?: string, oldValue?: string, newValue?: string, notes?: string) {
  try {
    await q(`INSERT INTO hse_audit_log (incident_id, action, field_changed, old_value, new_value, performed_by, notes)
      VALUES (${incidentId}, ${s(action)}, ${s(fieldChanged||null)}, ${s(oldValue||null)}, ${s(newValue||null)}, ${s(performedBy)}, ${s(notes||null)})`);
  } catch {}
}

// ========== SAFETY INCIDENTS ==========

router.get("/hse/incidents", async (req, res) => {
  const { status, severity, incident_type, department, search, limit = 100, page = 1 } = req.query as any;
  const lim = Math.min(Number(limit), 500);
  const off = (Number(page) - 1) * lim;
  let where = "WHERE 1=1";
  if (status && status !== "all") where += ` AND status=${s(status)}`;
  if (severity && severity !== "all") where += ` AND severity=${s(severity)}`;
  if (incident_type && incident_type !== "all") where += ` AND incident_type=${s(incident_type)}`;
  if (department && department !== "all") where += ` AND department=${s(department)}`;
  if (search) {
    const t = search.replace(/'/g, "''");
    where += ` AND (title ILIKE '%${t}%' OR incident_number ILIKE '%${t}%' OR location ILIKE '%${t}%' OR reported_by ILIKE '%${t}%' OR involved_persons ILIKE '%${t}%')`;
  }
  const countRows = await q(`SELECT COUNT(*) as total FROM safety_incidents ${where}`);
  const total = Number((countRows[0] as any)?.total || 0);
  const rows = await q(`SELECT * FROM safety_incidents ${where} ORDER BY incident_date DESC NULLS LAST, id DESC LIMIT ${lim} OFFSET ${off}`);
  res.json({ data: rows, pagination: { page: Number(page), limit: lim, total, totalPages: Math.ceil(total / lim) } });
});

router.get("/hse/incidents/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='reported') as reported,
    COUNT(*) FILTER (WHERE status='under_investigation') as under_investigation,
    COUNT(*) FILTER (WHERE status='corrective_action') as corrective_action,
    COUNT(*) FILTER (WHERE status='monitoring') as monitoring,
    COUNT(*) FILTER (WHERE status='closed') as closed,
    COUNT(*) FILTER (WHERE severity IN ('major','critical','catastrophic')) as severe,
    COUNT(*) FILTER (WHERE incident_type='near_miss') as near_misses,
    COUNT(*) FILTER (WHERE incident_type='first_aid') as first_aid,
    COUNT(*) FILTER (WHERE incident_type='property_damage') as property_damage,
    COUNT(*) FILTER (WHERE hospitalized=true) as hospitalizations,
    COALESCE(SUM(lost_work_days), 0) as total_lost_days,
    COALESCE(SUM(estimated_cost), 0) as total_cost,
    COUNT(*) FILTER (WHERE incident_date >= date_trunc('month', CURRENT_DATE)) as this_month,
    COUNT(*) FILTER (WHERE incident_date >= date_trunc('year', CURRENT_DATE)) as this_year
  FROM safety_incidents`);
  res.json(rows[0] || {});
});

router.get("/hse/incidents/:id", async (req, res) => {
  const rows = await q(`SELECT * FROM safety_incidents WHERE id=${Number(req.params.id)}`);
  if (!rows[0]) return res.status(404).json({ error: "אירוע לא נמצא" });
  res.json(rows[0]);
});

router.post("/hse/incidents", async (req, res) => {
  const d = req.body;
  const user = (req as any).user?.fullName || "מערכת";
  const num = await nextIncidentNum();
  await q(`INSERT INTO safety_incidents (
    incident_number, incident_type, incident_date, incident_time, title, description,
    severity, status, location, department, reported_by, involved_persons, witnesses,
    injury_type, injury_description, body_part, treatment_given, hospitalized,
    lost_work_days, equipment_involved, material_involved, root_cause, immediate_cause,
    corrective_action, corrective_action_due, preventive_action, estimated_cost, notes,
    employee_name, created_at, updated_at
  ) VALUES (
    ${s(num)}, ${s(d.incidentType||d.incident_type||'near_miss')},
    ${d.incidentDate||d.incident_date ? s(d.incidentDate||d.incident_date) : 'CURRENT_DATE'},
    ${d.incidentTime||d.incident_time ? s(d.incidentTime||d.incident_time) : 'NULL'},
    ${s(d.title)}, ${s(d.description)},
    ${s(d.severity||'minor')}, ${s(d.status||'reported')},
    ${s(d.location)}, ${s(d.department)}, ${s(d.reportedBy||d.reported_by||user)},
    ${s(d.involvedPersons||d.involved_persons)}, ${s(d.witnesses)},
    ${s(d.injuryType||d.injury_type)}, ${s(d.injuryDescription||d.injury_description)},
    ${s(d.bodyPart||d.body_part)}, ${s(d.treatmentGiven||d.treatment_given)},
    ${d.hospitalized||false}, ${num(d.lostWorkDays||d.lost_work_days)},
    ${s(d.equipmentInvolved||d.equipment_involved)}, ${s(d.materialInvolved||d.material_involved)},
    ${s(d.rootCause||d.root_cause)}, ${s(d.immediateCause||d.immediate_cause)},
    ${s(d.correctiveAction||d.corrective_action)},
    ${d.correctiveActionDue||d.corrective_action_due ? s(d.correctiveActionDue||d.corrective_action_due) : 'NULL'},
    ${s(d.preventiveAction||d.preventive_action)}, ${num(d.estimatedCost||d.estimated_cost)},
    ${s(d.notes)}, ${s(d.employeeName||d.employee_name)}, NOW(), NOW()
  )`);
  const created = await q(`SELECT * FROM safety_incidents WHERE incident_number=${s(num)}`);
  if (created[0]) {
    const id = (created[0] as any).id;
    await logAudit(id, "נוצר אירוע", user, undefined, undefined, undefined, `מספר אירוע: ${num}`);
  }
  res.status(201).json(created[0] || { incident_number: num });
});

router.put("/hse/incidents/:id", async (req, res) => {
  const id = Number(req.params.id);
  const d = req.body;
  const user = (req as any).user?.fullName || "מערכת";
  const old = await q(`SELECT status FROM safety_incidents WHERE id=${id}`);
  const oldStatus = (old[0] as any)?.status;

  const sets: string[] = [];
  if (d.title !== undefined) sets.push(`title=${s(d.title)}`);
  if (d.incidentType !== undefined || d.incident_type !== undefined) sets.push(`incident_type=${s(d.incidentType||d.incident_type)}`);
  if (d.incidentDate !== undefined || d.incident_date !== undefined) sets.push(`incident_date=${s(d.incidentDate||d.incident_date)}`);
  if (d.incidentTime !== undefined || d.incident_time !== undefined) sets.push(`incident_time=${s(d.incidentTime||d.incident_time)}`);
  if (d.severity !== undefined) sets.push(`severity=${s(d.severity)}`);
  if (d.status !== undefined) sets.push(`status=${s(d.status)}`);
  if (d.location !== undefined) sets.push(`location=${s(d.location)}`);
  if (d.department !== undefined) sets.push(`department=${s(d.department)}`);
  if (d.reportedBy !== undefined || d.reported_by !== undefined) sets.push(`reported_by=${s(d.reportedBy||d.reported_by)}`);
  if (d.involvedPersons !== undefined || d.involved_persons !== undefined) sets.push(`involved_persons=${s(d.involvedPersons||d.involved_persons)}`);
  if (d.witnesses !== undefined) sets.push(`witnesses=${s(d.witnesses)}`);
  if (d.injuryType !== undefined || d.injury_type !== undefined) sets.push(`injury_type=${s(d.injuryType||d.injury_type)}`);
  if (d.injuryDescription !== undefined || d.injury_description !== undefined) sets.push(`injury_description=${s(d.injuryDescription||d.injury_description)}`);
  if (d.bodyPart !== undefined || d.body_part !== undefined) sets.push(`body_part=${s(d.bodyPart||d.body_part)}`);
  if (d.treatmentGiven !== undefined || d.treatment_given !== undefined) sets.push(`treatment_given=${s(d.treatmentGiven||d.treatment_given)}`);
  if (d.hospitalized !== undefined) sets.push(`hospitalized=${d.hospitalized}`);
  if (d.lostWorkDays !== undefined || d.lost_work_days !== undefined) sets.push(`lost_work_days=${num(d.lostWorkDays??d.lost_work_days)}`);
  if (d.equipmentInvolved !== undefined || d.equipment_involved !== undefined) sets.push(`equipment_involved=${s(d.equipmentInvolved||d.equipment_involved)}`);
  if (d.materialInvolved !== undefined || d.material_involved !== undefined) sets.push(`material_involved=${s(d.materialInvolved||d.material_involved)}`);
  if (d.rootCause !== undefined || d.root_cause !== undefined) sets.push(`root_cause=${s(d.rootCause??d.root_cause)}`);
  if (d.immediateCause !== undefined || d.immediate_cause !== undefined) sets.push(`immediate_cause=${s(d.immediateCause??d.immediate_cause)}`);
  if (d.correctiveAction !== undefined || d.corrective_action !== undefined) sets.push(`corrective_action=${s(d.correctiveAction??d.corrective_action)}`);
  if (d.correctiveActionDue !== undefined || d.corrective_action_due !== undefined) sets.push(`corrective_action_due=${s(d.correctiveActionDue||d.corrective_action_due)}`);
  if (d.correctiveActionStatus !== undefined || d.corrective_action_status !== undefined) sets.push(`corrective_action_status=${s(d.correctiveActionStatus||d.corrective_action_status)}`);
  if (d.preventiveAction !== undefined || d.preventive_action !== undefined) sets.push(`preventive_action=${s(d.preventiveAction??d.preventive_action)}`);
  if (d.investigationBy !== undefined || d.investigation_by !== undefined) sets.push(`investigation_by=${s(d.investigationBy||d.investigation_by)}`);
  if (d.investigationFindings !== undefined || d.investigation_findings !== undefined) sets.push(`investigation_findings=${s(d.investigationFindings??d.investigation_findings)}`);
  if (d.estimatedCost !== undefined || d.estimated_cost !== undefined) sets.push(`estimated_cost=${num(d.estimatedCost??d.estimated_cost)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.employeeName !== undefined || d.employee_name !== undefined) sets.push(`employee_name=${s(d.employeeName||d.employee_name)}`);

  if (d.status === 'under_investigation') sets.push(`investigation_date=CURRENT_DATE`);
  if (d.status === 'closed') {
    sets.push(`closed_by=${s(user)}`);
    sets.push(`closed_at=NOW()`);
  }
  sets.push(`updated_at=NOW()`);

  if (sets.length === 1) return res.status(400).json({ error: "אין נתונים לעדכון" });
  await q(`UPDATE safety_incidents SET ${sets.join(",")} WHERE id=${id}`);

  if (d.status && d.status !== oldStatus) {
    await logAudit(id, "שינוי סטטוס", user, "status", oldStatus, d.status);
  } else {
    await logAudit(id, "עודכן אירוע", user);
  }
  const updated = await q(`SELECT * FROM safety_incidents WHERE id=${id}`);
  res.json(updated[0] || {});
});

router.post("/hse/incidents/:id/transition", async (req, res) => {
  const id = Number(req.params.id);
  const { newStatus } = req.body;
  const user = (req as any).user?.fullName || "מערכת";

  const incident = (await q(`SELECT * FROM safety_incidents WHERE id=${id}`))[0] as any;
  if (!incident) return res.status(404).json({ error: "אירוע לא נמצא" });

  const VALID_TRANSITIONS: Record<string, string[]> = {
    reported: ["under_investigation", "closed"],
    under_investigation: ["corrective_action", "closed"],
    corrective_action: ["monitoring", "closed"],
    monitoring: ["closed", "corrective_action"],
    closed: ["reopened"],
    reopened: ["under_investigation", "corrective_action"],
  };

  const allowed = VALID_TRANSITIONS[incident.status] || [];
  if (!allowed.includes(newStatus)) {
    return res.status(400).json({
      error: `לא ניתן לעבור מ-${incident.status} ל-${newStatus}`,
      allowedTransitions: allowed,
    });
  }

  if (newStatus === "closed") {
    const openActions = await q(`SELECT COUNT(*) as cnt FROM hse_corrective_actions WHERE incident_id=${id} AND status NOT IN ('completed','cancelled')`);
    const open = Number((openActions[0] as any)?.cnt || 0);
    if (open > 0) {
      return res.status(400).json({ error: `לא ניתן לסגור אירוע עם ${open} פעולות מתקנות פתוחות`, openActionCount: open });
    }
  }

  const sets: string[] = [`status=${s(newStatus)}`, `updated_at=NOW()`];
  if (newStatus === "under_investigation") sets.push(`investigation_date=CURRENT_DATE`);
  if (newStatus === "closed") { sets.push(`closed_by=${s(user)}`); sets.push(`closed_at=NOW()`); }

  await q(`UPDATE safety_incidents SET ${sets.join(",")} WHERE id=${id}`);
  await logAudit(id, "שינוי סטטוס", user, "status", incident.status, newStatus);

  const updated = await q(`SELECT * FROM safety_incidents WHERE id=${id}`);
  res.json(updated[0] || {});
});

router.delete("/hse/incidents/:id", async (req, res) => {
  const id = Number(req.params.id);
  const user = (req as any).user?.fullName || "מערכת";
  const incident = (await q(`SELECT status FROM safety_incidents WHERE id=${id}`))[0] as any;
  if (!incident) return res.status(404).json({ error: "אירוע לא נמצא" });
  if (incident.status !== "reported") return res.status(400).json({ error: "ניתן למחוק רק אירועים בסטטוס 'דווח'" });
  await q(`DELETE FROM safety_incidents WHERE id=${id}`);
  res.json({ success: true });
});

// ========== INVESTIGATIONS ==========

router.get("/hse/incidents/:id/investigations", async (req, res) => {
  const rows = await q(`SELECT * FROM hse_incident_investigations WHERE incident_id=${Number(req.params.id)} ORDER BY created_at DESC`);
  res.json(rows);
});

router.post("/hse/incidents/:id/investigations", async (req, res) => {
  const incidentId = Number(req.params.id);
  const d = req.body;
  const user = (req as any).user?.fullName || "מערכת";
  const rows = await q(`INSERT INTO hse_incident_investigations (
    incident_id, investigation_method, investigator, investigation_date,
    why_1, why_2, why_3, why_4, why_5,
    root_cause_category, root_cause_description,
    fishbone_people, fishbone_process, fishbone_equipment, fishbone_environment, fishbone_materials, fishbone_management,
    contributing_factors, findings, recommendations, status
  ) VALUES (
    ${incidentId}, ${s(d.investigationMethod||d.investigation_method||'five_whys')},
    ${s(d.investigator||user)}, ${d.investigationDate||d.investigation_date ? s(d.investigationDate||d.investigation_date) : 'CURRENT_DATE'},
    ${s(d.why1||d.why_1)}, ${s(d.why2||d.why_2)}, ${s(d.why3||d.why_3)}, ${s(d.why4||d.why_4)}, ${s(d.why5||d.why_5)},
    ${s(d.rootCauseCategory||d.root_cause_category)}, ${s(d.rootCauseDescription||d.root_cause_description)},
    ${s(d.fishbonePeople||d.fishbone_people)}, ${s(d.fishboneProcess||d.fishbone_process)},
    ${s(d.fishboneEquipment||d.fishbone_equipment)}, ${s(d.fishboneEnvironment||d.fishbone_environment)},
    ${s(d.fishboneMaterials||d.fishbone_materials)}, ${s(d.fishboneManagement||d.fishbone_management)},
    ${s(d.contributingFactors||d.contributing_factors)}, ${s(d.findings)}, ${s(d.recommendations)},
    ${s(d.status||'in_progress')}
  ) RETURNING *`);
  await logAudit(incidentId, "נוצרה חקירה", user);
  await q(`UPDATE safety_incidents SET status='under_investigation', investigation_date=CURRENT_DATE, investigation_by=${s(d.investigator||user)}, updated_at=NOW() WHERE id=${incidentId} AND status='reported'`);
  res.status(201).json(rows[0] || {});
});

router.put("/hse/incidents/:id/investigations/:invId", async (req, res) => {
  const incidentId = Number(req.params.id);
  const invId = Number(req.params.invId);
  const d = req.body;
  const user = (req as any).user?.fullName || "מערכת";
  const sets: string[] = [];
  const fields: [string, any][] = [
    ["investigation_method", d.investigationMethod||d.investigation_method],
    ["investigator", d.investigator],
    ["investigation_date", d.investigationDate||d.investigation_date],
    ["why_1", d.why1??d.why_1],
    ["why_2", d.why2??d.why_2],
    ["why_3", d.why3??d.why_3],
    ["why_4", d.why4??d.why_4],
    ["why_5", d.why5??d.why_5],
    ["root_cause_category", d.rootCauseCategory||d.root_cause_category],
    ["root_cause_description", d.rootCauseDescription??d.root_cause_description],
    ["fishbone_people", d.fishbonePeople??d.fishbone_people],
    ["fishbone_process", d.fishboneProcess??d.fishbone_process],
    ["fishbone_equipment", d.fishboneEquipment??d.fishbone_equipment],
    ["fishbone_environment", d.fishboneEnvironment??d.fishbone_environment],
    ["fishbone_materials", d.fishboneMaterials??d.fishbone_materials],
    ["fishbone_management", d.fishboneManagement??d.fishbone_management],
    ["contributing_factors", d.contributingFactors??d.contributing_factors],
    ["findings", d.findings],
    ["recommendations", d.recommendations],
    ["status", d.status],
  ];
  fields.forEach(([col, val]) => { if (val !== undefined) sets.push(`${col}=${s(val)}`); });
  if (d.status === "completed") sets.push(`completed_at=NOW()`);
  sets.push(`updated_at=NOW()`);
  const rows = await q(`UPDATE hse_incident_investigations SET ${sets.join(",")} WHERE id=${invId} AND incident_id=${incidentId} RETURNING *`);
  if (!rows[0]) return res.status(404).json({ error: "חקירה לא נמצאה" });
  await logAudit(incidentId, "עודכנה חקירה", user);
  res.json(rows[0]);
});

// ========== CORRECTIVE ACTIONS ==========

router.get("/hse/incidents/:id/corrective-actions", async (req, res) => {
  const rows = await q(`SELECT * FROM hse_corrective_actions WHERE incident_id=${Number(req.params.id)} ORDER BY due_date ASC NULLS LAST, created_at DESC`);
  res.json(rows);
});

router.post("/hse/incidents/:id/corrective-actions", async (req, res) => {
  const incidentId = Number(req.params.id);
  const d = req.body;
  const user = (req as any).user?.fullName || "מערכת";
  const year = new Date().getFullYear();
  const lastRows = await q(`SELECT action_number FROM hse_corrective_actions WHERE action_number LIKE 'CA-${year}-%' ORDER BY id DESC LIMIT 1`);
  const lastNum = (lastRows[0] as any)?.action_number;
  const seq = lastNum ? parseInt(lastNum.split("-").pop()!) + 1 : 1;
  const actionNumber = `CA-${year}-${String(seq).padStart(4, "0")}`;

  const rows = await q(`INSERT INTO hse_corrective_actions (
    incident_id, investigation_id, action_number, title, description, action_type, priority,
    assigned_to, department, due_date, status, verification_method, notes
  ) VALUES (
    ${incidentId}, ${d.investigationId||d.investigation_id ? num(d.investigationId||d.investigation_id) : 'NULL'},
    ${s(actionNumber)}, ${s(d.title)}, ${s(d.description)}, ${s(d.actionType||d.action_type||'corrective')},
    ${s(d.priority||'medium')}, ${s(d.assignedTo||d.assigned_to)}, ${s(d.department)},
    ${d.dueDate||d.due_date ? s(d.dueDate||d.due_date) : 'NULL'}, ${s(d.status||'open')},
    ${s(d.verificationMethod||d.verification_method)}, ${s(d.notes)}
  ) RETURNING *`);
  await logAudit(incidentId, "נוצרה פעולה מתקנת", user, undefined, undefined, undefined, `מספר: ${actionNumber}`);
  res.status(201).json(rows[0] || {});
});

router.put("/hse/incidents/:id/corrective-actions/:caId", async (req, res) => {
  const incidentId = Number(req.params.id);
  const caId = Number(req.params.caId);
  const d = req.body;
  const user = (req as any).user?.fullName || "מערכת";
  const sets: string[] = [];
  const fields: [string, any][] = [
    ["title", d.title], ["description", d.description], ["action_type", d.actionType||d.action_type],
    ["priority", d.priority], ["assigned_to", d.assignedTo||d.assigned_to], ["department", d.department],
    ["due_date", d.dueDate||d.due_date], ["completed_date", d.completedDate||d.completed_date],
    ["status", d.status], ["verification_method", d.verificationMethod||d.verification_method],
    ["verified_by", d.verifiedBy||d.verified_by], ["verified_date", d.verifiedDate||d.verified_date],
    ["effectiveness_rating", d.effectivenessRating||d.effectiveness_rating], ["notes", d.notes],
  ];
  fields.forEach(([col, val]) => { if (val !== undefined) sets.push(`${col}=${s(val)}`); });
  sets.push(`updated_at=NOW()`);
  const rows = await q(`UPDATE hse_corrective_actions SET ${sets.join(",")} WHERE id=${caId} AND incident_id=${incidentId} RETURNING *`);
  if (!rows[0]) return res.status(404).json({ error: "פעולה מתקנת לא נמצאה" });
  await logAudit(incidentId, "עודכנה פעולה מתקנת", user, "status", undefined, d.status);
  res.json(rows[0]);
});

router.delete("/hse/incidents/:id/corrective-actions/:caId", async (req, res) => {
  const incidentId = Number(req.params.id);
  const caId = Number(req.params.caId);
  await q(`DELETE FROM hse_corrective_actions WHERE id=${caId} AND incident_id=${incidentId}`);
  res.json({ success: true });
});

// ========== WITNESS STATEMENTS ==========

router.get("/hse/incidents/:id/witnesses", async (req, res) => {
  const rows = await q(`SELECT * FROM hse_witness_statements WHERE incident_id=${Number(req.params.id)} ORDER BY created_at ASC`);
  res.json(rows);
});

router.post("/hse/incidents/:id/witnesses", async (req, res) => {
  const incidentId = Number(req.params.id);
  const d = req.body;
  const user = (req as any).user?.fullName || "מערכת";
  const rows = await q(`INSERT INTO hse_witness_statements (
    incident_id, witness_name, witness_role, witness_department,
    statement_date, statement_text, was_present, contact_info, signature_obtained
  ) VALUES (
    ${incidentId}, ${s(d.witnessName||d.witness_name)}, ${s(d.witnessRole||d.witness_role)},
    ${s(d.witnessDepartment||d.witness_department)},
    ${d.statementDate||d.statement_date ? s(d.statementDate||d.statement_date) : 'CURRENT_DATE'},
    ${s(d.statementText||d.statement_text)},
    ${d.wasPresent!==undefined ? d.wasPresent : true}, ${s(d.contactInfo||d.contact_info)},
    ${d.signatureObtained||d.signature_obtained||false}
  ) RETURNING *`);
  await logAudit(incidentId, "נוספה עדות", user, undefined, undefined, undefined, d.witnessName||d.witness_name);
  res.status(201).json(rows[0] || {});
});

router.put("/hse/incidents/:id/witnesses/:wId", async (req, res) => {
  const incidentId = Number(req.params.id);
  const wId = Number(req.params.wId);
  const d = req.body;
  const sets: string[] = [];
  const fields: [string, any][] = [
    ["witness_name", d.witnessName||d.witness_name], ["witness_role", d.witnessRole||d.witness_role],
    ["witness_department", d.witnessDepartment||d.witness_department],
    ["statement_date", d.statementDate||d.statement_date], ["statement_text", d.statementText??d.statement_text],
    ["was_present", d.wasPresent], ["contact_info", d.contactInfo||d.contact_info],
    ["signature_obtained", d.signatureObtained||d.signature_obtained],
  ];
  fields.forEach(([col, val]) => { if (val !== undefined) sets.push(`${col}=${s(val)}`); });
  sets.push(`updated_at=NOW()`);
  const rows = await q(`UPDATE hse_witness_statements SET ${sets.join(",")} WHERE id=${wId} AND incident_id=${incidentId} RETURNING *`);
  if (!rows[0]) return res.status(404).json({ error: "עדות לא נמצאה" });
  res.json(rows[0]);
});

router.delete("/hse/incidents/:id/witnesses/:wId", async (req, res) => {
  await q(`DELETE FROM hse_witness_statements WHERE id=${Number(req.params.wId)} AND incident_id=${Number(req.params.id)}`);
  res.json({ success: true });
});

// ========== LESSONS LEARNED ==========

router.get("/hse/incidents/:id/lessons", async (req, res) => {
  const rows = await q(`SELECT * FROM hse_lessons_learned WHERE incident_id=${Number(req.params.id)} ORDER BY created_at DESC`);
  res.json(rows);
});

router.post("/hse/incidents/:id/lessons", async (req, res) => {
  const incidentId = Number(req.params.id);
  const d = req.body;
  const user = (req as any).user?.fullName || "מערכת";
  const rows = await q(`INSERT INTO hse_lessons_learned (
    incident_id, title, description, category, applicable_departments,
    shared_with, shared_date, is_shared, created_by
  ) VALUES (
    ${incidentId}, ${s(d.title)}, ${s(d.description)}, ${s(d.category)},
    ${s(d.applicableDepartments||d.applicable_departments)},
    ${s(d.sharedWith||d.shared_with)},
    ${d.sharedDate||d.shared_date ? s(d.sharedDate||d.shared_date) : 'NULL'},
    ${d.isShared||d.is_shared||false}, ${s(d.createdBy||d.created_by||user)}
  ) RETURNING *`);
  await logAudit(incidentId, "נוסף לקח", user, undefined, undefined, undefined, d.title);
  res.status(201).json(rows[0] || {});
});

router.put("/hse/incidents/:id/lessons/:lId", async (req, res) => {
  const incidentId = Number(req.params.id);
  const lId = Number(req.params.lId);
  const d = req.body;
  const sets: string[] = [];
  const fields: [string, any][] = [
    ["title", d.title], ["description", d.description], ["category", d.category],
    ["applicable_departments", d.applicableDepartments||d.applicable_departments],
    ["shared_with", d.sharedWith||d.shared_with], ["shared_date", d.sharedDate||d.shared_date],
    ["is_shared", d.isShared],
  ];
  fields.forEach(([col, val]) => { if (val !== undefined) sets.push(`${col}=${s(val)}`); });
  sets.push(`updated_at=NOW()`);
  const rows = await q(`UPDATE hse_lessons_learned SET ${sets.join(",")} WHERE id=${lId} AND incident_id=${incidentId} RETURNING *`);
  if (!rows[0]) return res.status(404).json({ error: "לקח לא נמצא" });
  res.json(rows[0]);
});

router.delete("/hse/incidents/:id/lessons/:lId", async (req, res) => {
  await q(`DELETE FROM hse_lessons_learned WHERE id=${Number(req.params.lId)} AND incident_id=${Number(req.params.id)}`);
  res.json({ success: true });
});

// ========== AUDIT LOG / TIMELINE ==========

router.get("/hse/incidents/:id/timeline", async (req, res) => {
  const id = Number(req.params.id);
  const rows = await q(`SELECT * FROM hse_audit_log WHERE incident_id=${id} ORDER BY performed_at DESC`);
  res.json(rows);
});

// ========== FULL INCIDENT DETAIL (all sub-entities in one call) ==========

router.get("/hse/incidents/:id/full", async (req, res) => {
  const id = Number(req.params.id);
  const [incident, investigations, correctiveActions, witnesses, lessons, timeline] = await Promise.all([
    q(`SELECT * FROM safety_incidents WHERE id=${id}`),
    q(`SELECT * FROM hse_incident_investigations WHERE incident_id=${id} ORDER BY created_at DESC`),
    q(`SELECT * FROM hse_corrective_actions WHERE incident_id=${id} ORDER BY due_date ASC NULLS LAST, created_at DESC`),
    q(`SELECT * FROM hse_witness_statements WHERE incident_id=${id} ORDER BY created_at ASC`),
    q(`SELECT * FROM hse_lessons_learned WHERE incident_id=${id} ORDER BY created_at DESC`),
    q(`SELECT * FROM hse_audit_log WHERE incident_id=${id} ORDER BY performed_at DESC LIMIT 50`),
  ]);
  if (!incident[0]) return res.status(404).json({ error: "אירוע לא נמצא" });
  res.json({ incident: incident[0], investigations, correctiveActions, witnesses, lessons, timeline });
});

export default router;
