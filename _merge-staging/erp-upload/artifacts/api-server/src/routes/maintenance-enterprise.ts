import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
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

async function q(query: string) {
  try { const r = await db.execute(sql.raw(query)); return r.rows || []; }
  catch (e: any) { console.error("Maintenance query error:", e.message); return []; }
}
async function nextNum(prefix: string, table: string, col: string) {
  const year = new Date().getFullYear();
  const rows = await q(`SELECT ${col} FROM ${table} WHERE ${col} LIKE '${prefix}${year}-%' ORDER BY id DESC LIMIT 1`);
  const last = (rows[0] as any)?.[col];
  const seq = last ? parseInt(last.split("-").pop()!) + 1 : 1;
  return `${prefix}${year}-${String(seq).padStart(4, "0")}`;
}

router.get("/maintenance-orders", async (_req, res) => {
  res.json(await q(`SELECT * FROM maintenance_orders ORDER BY scheduled_date ASC NULLS LAST, id DESC`));
});

router.get("/maintenance-orders/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='open') as open_count,
    COUNT(*) FILTER (WHERE status='in_progress') as in_progress,
    COUNT(*) FILTER (WHERE status='completed') as completed,
    COUNT(*) FILTER (WHERE status='waiting_parts') as waiting_parts,
    COUNT(*) FILTER (WHERE priority='critical') as critical,
    COALESCE(SUM(total_cost), 0) as total_cost,
    COALESCE(SUM(downtime_hours), 0) as total_downtime,
    COUNT(*) FILTER (WHERE maintenance_type='preventive') as preventive,
    COUNT(*) FILTER (WHERE is_recurring=true) as recurring
  FROM maintenance_orders WHERE status NOT IN ('cancelled','closed')`);
  res.json(rows[0] || {});
});

router.post("/maintenance-orders", async (req, res) => {
  const d = req.body;
  const num = await nextNum("MNT-", "maintenance_orders", "order_number");
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO maintenance_orders (order_number, maintenance_type, title, description, priority, status, equipment_name, equipment_code, equipment_location, department, reported_by, assigned_to, assigned_team, scheduled_date, estimated_hours, failure_cause, failure_code, safety_notes, is_recurring, frequency_days, next_maintenance_date, vendor_name, notes)
    VALUES ('${num}', '${d.maintenanceType||'corrective'}', ${s(d.title)}, ${s(d.description)}, '${d.priority||'medium'}', '${d.status||'open'}', ${s(d.equipmentName)}, ${s(d.equipmentCode)}, ${s(d.equipmentLocation)}, ${s(d.department)}, ${s(d.reportedBy)}, ${s(d.assignedTo)}, ${s(d.assignedTeam)}, ${d.scheduledDate ? `'${d.scheduledDate}'` : 'NULL'}, ${d.estimatedHours||0}, ${s(d.failureCause)}, ${s(d.failureCode)}, ${s(d.safetyNotes)}, ${d.isRecurring||false}, ${d.frequencyDays||'NULL'}, ${d.nextMaintenanceDate ? `'${d.nextMaintenanceDate}'` : 'NULL'}, ${s(d.vendorName)}, ${s(d.notes)})`);
  res.json((await q(`SELECT * FROM maintenance_orders WHERE order_number='${num}'`))[0]);
});

router.put("/maintenance-orders/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.title) sets.push(`title=${s(d.title)}`);
  if (d.maintenanceType) sets.push(`maintenance_type='${d.maintenanceType}'`);
  if (d.priority) sets.push(`priority='${d.priority}'`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.assignedTo) sets.push(`assigned_to=${s(d.assignedTo)}`);
  if (d.scheduledDate) sets.push(`scheduled_date='${d.scheduledDate}'`);
  if (d.completedDate) sets.push(`completed_date='${d.completedDate}'`);
  if (d.downtimeHours !== undefined) sets.push(`downtime_hours=${d.downtimeHours}`);
  if (d.actualHours !== undefined) sets.push(`actual_hours=${d.actualHours}`);
  if (d.partsCost !== undefined) sets.push(`parts_cost=${d.partsCost}`);
  if (d.laborCost !== undefined) sets.push(`labor_cost=${d.laborCost}`);
  if (d.solution !== undefined) sets.push(`solution=${s(d.solution)}`);
  if (d.preventiveAction !== undefined) sets.push(`preventive_action=${s(d.preventiveAction)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.status === 'completed') sets.push(`completed_date=COALESCE(completed_date, CURRENT_DATE)`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE maintenance_orders SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM maintenance_orders WHERE id=${req.params.id}`))[0]);
});

router.delete("/maintenance-orders/:id", async (req, res) => {
  await q(`DELETE FROM maintenance_orders WHERE id=${req.params.id} AND status IN ('open','cancelled')`);
  res.json({ success: true });
});

// ========== FIXED ASSETS ==========
router.get("/fixed-assets", async (_req, res) => {
  res.json(await q(`SELECT * FROM fixed_assets ORDER BY asset_number ASC`));
});

router.get("/fixed-assets/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='active') as active,
    COUNT(*) FILTER (WHERE status='maintenance') as in_maintenance,
    COUNT(*) FILTER (WHERE status='disposed') as disposed,
    COALESCE(SUM(purchase_cost), 0) as total_purchase_cost,
    COALESCE(SUM(current_value), 0) as total_current_value,
    COALESCE(SUM(accumulated_depreciation), 0) as total_depreciation,
    COUNT(*) FILTER (WHERE warranty_expiry IS NOT NULL AND warranty_expiry >= CURRENT_DATE) as under_warranty
  FROM fixed_assets`);
  res.json(rows[0] || {});
});

router.post("/fixed-assets", async (req, res) => {
  const d = req.body;
  const num = await nextNum("AST-", "fixed_assets", "asset_number");
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO fixed_assets (asset_number, asset_name, asset_type, category, description, manufacturer, model, serial_number, status, department, location, responsible_person, purchase_date, purchase_cost, supplier_name, invoice_number, warranty_expiry, useful_life_years, depreciation_method, annual_depreciation, accumulated_depreciation, salvage_value, maintenance_frequency_days, insurance_policy, insurance_expiry, insurance_value, barcode, condition, notes)
    VALUES ('${num}', ${s(d.assetName)}, '${d.assetType||'machinery'}', ${s(d.category)}, ${s(d.description)}, ${s(d.manufacturer)}, ${s(d.model)}, ${s(d.serialNumber)}, '${d.status||'active'}', ${s(d.department)}, ${s(d.location)}, ${s(d.responsiblePerson)}, ${d.purchaseDate ? `'${d.purchaseDate}'` : 'NULL'}, ${d.purchaseCost||0}, ${s(d.supplierName)}, ${s(d.invoiceNumber)}, ${d.warrantyExpiry ? `'${d.warrantyExpiry}'` : 'NULL'}, ${d.usefulLifeYears||10}, '${d.depreciationMethod||'straight_line'}', ${d.annualDepreciation||0}, ${d.accumulatedDepreciation||0}, ${d.salvageValue||0}, ${d.maintenanceFrequencyDays||'NULL'}, ${s(d.insurancePolicy)}, ${d.insuranceExpiry ? `'${d.insuranceExpiry}'` : 'NULL'}, ${d.insuranceValue||0}, ${s(d.barcode)}, '${d.condition||'good'}', ${s(d.notes)})`);
  res.json((await q(`SELECT * FROM fixed_assets WHERE asset_number='${num}'`))[0]);
});

router.put("/fixed-assets/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.assetName) sets.push(`asset_name=${s(d.assetName)}`);
  if (d.assetType) sets.push(`asset_type='${d.assetType}'`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.department) sets.push(`department=${s(d.department)}`);
  if (d.location) sets.push(`location=${s(d.location)}`);
  if (d.responsiblePerson) sets.push(`responsible_person=${s(d.responsiblePerson)}`);
  if (d.condition) sets.push(`condition='${d.condition}'`);
  if (d.annualDepreciation !== undefined) sets.push(`annual_depreciation=${d.annualDepreciation}`);
  if (d.accumulatedDepreciation !== undefined) sets.push(`accumulated_depreciation=${d.accumulatedDepreciation}`);
  if (d.lastMaintenanceDate) sets.push(`last_maintenance_date='${d.lastMaintenanceDate}'`);
  if (d.nextMaintenanceDate) sets.push(`next_maintenance_date='${d.nextMaintenanceDate}'`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.disposalDate) sets.push(`disposal_date='${d.disposalDate}'`);
  if (d.disposalReason) sets.push(`disposal_reason=${s(d.disposalReason)}`);
  if (d.disposalValue !== undefined) sets.push(`disposal_value=${d.disposalValue}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE fixed_assets SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM fixed_assets WHERE id=${req.params.id}`))[0]);
});

router.delete("/fixed-assets/:id", async (req, res) => {
  await q(`DELETE FROM fixed_assets WHERE id=${req.params.id} AND status='disposed'`);
  res.json({ success: true });
});

// ========== CONTROLLED DOCUMENTS ==========
router.get("/controlled-documents", async (_req, res) => {
  res.json(await q(`SELECT * FROM controlled_documents ORDER BY updated_at DESC, id DESC`));
});

router.get("/controlled-documents/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='active') as active,
    COUNT(*) FILTER (WHERE status='draft') as drafts,
    COUNT(*) FILTER (WHERE status='in_review') as in_review,
    COUNT(*) FILTER (WHERE status='obsolete') as obsolete,
    COUNT(*) FILTER (WHERE is_controlled=true) as controlled,
    COUNT(*) FILTER (WHERE is_confidential=true) as confidential,
    COUNT(*) FILTER (WHERE review_date IS NOT NULL AND review_date <= CURRENT_DATE + INTERVAL '30 days') as review_due
  FROM controlled_documents WHERE status NOT IN ('cancelled','archived')`);
  res.json(rows[0] || {});
});

router.post("/controlled-documents", async (req, res) => {
  const d = req.body;
  const num = await nextNum("DOC-", "controlled_documents", "document_number");
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO controlled_documents (document_number, document_type, title, description, category, department, status, version, classification, author_name, owner_name, reviewer_name, approver_name, effective_date, expiry_date, review_date, review_frequency_months, related_standard, related_regulation, distribution_list, is_controlled, is_confidential, keywords, notes)
    VALUES ('${num}', '${d.documentType||'procedure'}', ${s(d.title)}, ${s(d.description)}, ${s(d.category)}, ${s(d.department)}, '${d.status||'draft'}', '${d.version||'1.0'}', '${d.classification||'internal'}', ${s(d.authorName)}, ${s(d.ownerName)}, ${s(d.reviewerName)}, ${s(d.approverName)}, ${d.effectiveDate ? `'${d.effectiveDate}'` : 'NULL'}, ${d.expiryDate ? `'${d.expiryDate}'` : 'NULL'}, ${d.reviewDate ? `'${d.reviewDate}'` : 'NULL'}, ${d.reviewFrequencyMonths||12}, ${s(d.relatedStandard)}, ${s(d.relatedRegulation)}, ${s(d.distributionList)}, ${d.isControlled !== false}, ${d.isConfidential||false}, ${s(d.keywords)}, ${s(d.notes)})`);
  res.json((await q(`SELECT * FROM controlled_documents WHERE document_number='${num}'`))[0]);
});

router.put("/controlled-documents/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.title) sets.push(`title=${s(d.title)}`);
  if (d.documentType) sets.push(`document_type='${d.documentType}'`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.version) sets.push(`version='${d.version}'`);
  if (d.classification) sets.push(`classification='${d.classification}'`);
  if (d.department) sets.push(`department=${s(d.department)}`);
  if (d.ownerName) sets.push(`owner_name=${s(d.ownerName)}`);
  if (d.reviewerName) sets.push(`reviewer_name=${s(d.reviewerName)}`);
  if (d.approverName) sets.push(`approver_name=${s(d.approverName)}`);
  if (d.reviewDate) sets.push(`review_date='${d.reviewDate}'`);
  if (d.changeDescription) sets.push(`change_description=${s(d.changeDescription)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.status === 'approved' || d.status === 'active') sets.push(`approved_at=NOW()`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE controlled_documents SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM controlled_documents WHERE id=${req.params.id}`))[0]);
});

router.delete("/controlled-documents/:id", async (req, res) => {
  await q(`DELETE FROM controlled_documents WHERE id=${req.params.id} AND status='draft'`);
  res.json({ success: true });
});

// ========== SAFETY INCIDENTS ==========
router.get("/safety-incidents", async (_req, res) => {
  res.json(await q(`SELECT * FROM safety_incidents ORDER BY incident_date DESC, id DESC`));
});

router.get("/safety-incidents/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='reported') as reported,
    COUNT(*) FILTER (WHERE status='under_investigation') as investigating,
    COUNT(*) FILTER (WHERE status='corrective_action') as corrective,
    COUNT(*) FILTER (WHERE status='closed') as closed,
    COUNT(*) FILTER (WHERE severity IN ('major','critical','catastrophic')) as severe,
    COALESCE(SUM(lost_work_days), 0) as total_lost_days,
    COALESCE(SUM(estimated_cost), 0) as total_cost,
    COUNT(*) FILTER (WHERE incident_type='near_miss') as near_misses,
    COUNT(*) FILTER (WHERE hospitalized=true) as hospitalizations
  FROM safety_incidents`);
  res.json(rows[0] || {});
});

router.post("/safety-incidents", async (req, res) => {
  const d = req.body;
  const num = await nextNum("SAF-", "safety_incidents", "incident_number");
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO safety_incidents (incident_number, incident_type, incident_date, incident_time, title, description, severity, status, location, department, reported_by, involved_persons, witnesses, injury_type, injury_description, body_part, treatment_given, hospitalized, lost_work_days, equipment_involved, material_involved, root_cause, immediate_cause, corrective_action, corrective_action_due, preventive_action, estimated_cost, notes)
    VALUES ('${num}', '${d.incidentType||'near_miss'}', '${d.incidentDate || new Date().toISOString().slice(0,10)}', ${d.incidentTime ? `'${d.incidentTime}'` : 'NULL'}, ${s(d.title)}, ${s(d.description)}, '${d.severity||'minor'}', '${d.status||'reported'}', ${s(d.location)}, ${s(d.department)}, ${s(d.reportedBy)}, ${s(d.involvedPersons)}, ${s(d.witnesses)}, ${s(d.injuryType)}, ${s(d.injuryDescription)}, ${s(d.bodyPart)}, ${s(d.treatmentGiven)}, ${d.hospitalized||false}, ${d.lostWorkDays||0}, ${s(d.equipmentInvolved)}, ${s(d.materialInvolved)}, ${s(d.rootCause)}, ${s(d.immediateCause)}, ${s(d.correctiveAction)}, ${d.correctiveActionDue ? `'${d.correctiveActionDue}'` : 'NULL'}, ${s(d.preventiveAction)}, ${d.estimatedCost||0}, ${s(d.notes)})`);
  res.json((await q(`SELECT * FROM safety_incidents WHERE incident_number='${num}'`))[0]);
});

router.put("/safety-incidents/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.title) sets.push(`title=${s(d.title)}`);
  if (d.incidentType) sets.push(`incident_type='${d.incidentType}'`);
  if (d.severity) sets.push(`severity='${d.severity}'`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.rootCause !== undefined) sets.push(`root_cause=${s(d.rootCause)}`);
  if (d.immediateCause !== undefined) sets.push(`immediate_cause=${s(d.immediateCause)}`);
  if (d.correctiveAction !== undefined) sets.push(`corrective_action=${s(d.correctiveAction)}`);
  if (d.correctiveActionDue) sets.push(`corrective_action_due='${d.correctiveActionDue}'`);
  if (d.correctiveActionStatus) sets.push(`corrective_action_status='${d.correctiveActionStatus}'`);
  if (d.preventiveAction !== undefined) sets.push(`preventive_action=${s(d.preventiveAction)}`);
  if (d.investigationBy) sets.push(`investigation_by=${s(d.investigationBy)}`);
  if (d.investigationFindings !== undefined) sets.push(`investigation_findings=${s(d.investigationFindings)}`);
  if (d.lostWorkDays !== undefined) sets.push(`lost_work_days=${d.lostWorkDays}`);
  if (d.estimatedCost !== undefined) sets.push(`estimated_cost=${d.estimatedCost}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.status === 'under_investigation') sets.push(`investigation_date=CURRENT_DATE`);
  if (d.status === 'closed') { sets.push(`closed_by=${s((req as any).user?.fullName)}`); sets.push(`closed_at=NOW()`); }
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE safety_incidents SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM safety_incidents WHERE id=${req.params.id}`))[0]);
});

router.delete("/safety-incidents/:id", async (req, res) => {
  await q(`DELETE FROM safety_incidents WHERE id=${req.params.id} AND status='reported'`);
  res.json({ success: true });
});

export default router;
