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
  catch (e: any) { console.error("Production-Enterprise2 query error:", e.message); return []; }
}

async function nextNum(prefix: string, table: string, col: string) {
  const year = new Date().getFullYear();
  const rows = await q(`SELECT ${col} FROM ${table} WHERE ${col} LIKE '${prefix}${year}-%' ORDER BY id DESC LIMIT 1`);
  const last = (rows[0] as any)?.[col];
  const seq = last ? parseInt(last.split("-").pop()!) + 1 : 1;
  return `${prefix}${year}-${String(seq).padStart(4, "0")}`;
}

const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";

// ========== BOM TREE ==========
router.get("/bom-tree", async (_req, res) => {
  res.json(await q(`SELECT * FROM bom_tree ORDER BY product_name ASC, id DESC`));
});

router.get("/bom-tree/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(DISTINCT product_code) as unique_products,
    COUNT(*) FILTER (WHERE bom_level='component') as components,
    COUNT(*) FILTER (WHERE status='active') as active,
    COALESCE(AVG(rolled_up_cost::numeric), 0) as avg_cost,
    COALESCE(SUM(rolled_up_cost::numeric), 0) as total_cost,
    COUNT(*) FILTER (WHERE status='draft') as drafts,
    COUNT(*) FILTER (WHERE status='under_review') as under_review
  FROM bom_tree`);
  res.json(rows[0] || {});
});

router.post("/bom-tree", async (req, res) => {
  const d = req.body;
  const num = await nextNum("BOM-", "bom_tree", "bom_number");
  await q(`INSERT INTO bom_tree (bom_number, product_code, product_name, version, bom_level, parent_bom_id, components_json, quantity_per_unit, unit, material_cost, labor_cost, overhead_cost, rolled_up_cost, preferred_supplier, lead_time_days, status, notes)
    VALUES ('${num}', ${s(d.productCode)}, ${s(d.productName)}, ${s(d.version || '1.0')}, '${d.bomLevel || 'top'}', ${d.parentBomId || 'NULL'}, ${d.componentsJson ? `'${JSON.stringify(d.componentsJson).replace(/'/g, "''")}'` : "'[]'"}, ${d.quantityPerUnit || 1}, '${d.unit || 'unit'}', ${d.materialCost || 0}, ${d.laborCost || 0}, ${d.overheadCost || 0}, ${d.rolledUpCost || 0}, ${s(d.preferredSupplier)}, ${d.leadTimeDays || 0}, '${d.status || 'draft'}', ${s(d.notes)})`);
  res.json((await q(`SELECT * FROM bom_tree WHERE bom_number='${num}'`))[0]);
});

router.put("/bom-tree/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.productName) sets.push(`product_name=${s(d.productName)}`);
  if (d.productCode) sets.push(`product_code=${s(d.productCode)}`);
  if (d.version) sets.push(`version=${s(d.version)}`);
  if (d.bomLevel) sets.push(`bom_level='${d.bomLevel}'`);
  if (d.materialCost !== undefined) sets.push(`material_cost=${d.materialCost}`);
  if (d.laborCost !== undefined) sets.push(`labor_cost=${d.laborCost}`);
  if (d.overheadCost !== undefined) sets.push(`overhead_cost=${d.overheadCost}`);
  if (d.rolledUpCost !== undefined) sets.push(`rolled_up_cost=${d.rolledUpCost}`);
  if (d.preferredSupplier !== undefined) sets.push(`preferred_supplier=${s(d.preferredSupplier)}`);
  if (d.leadTimeDays !== undefined) sets.push(`lead_time_days=${d.leadTimeDays}`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.componentsJson) sets.push(`components_json='${JSON.stringify(d.componentsJson).replace(/'/g, "''")}'`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE bom_tree SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM bom_tree WHERE id=${req.params.id}`))[0]);
});

router.delete("/bom-tree/:id", async (req, res) => {
  await q(`DELETE FROM bom_tree WHERE id=${req.params.id} AND status='draft'`);
  res.json({ success: true });
});

// ========== WORK INSTRUCTIONS ==========
router.get("/work-instructions", async (_req, res) => {
  res.json(await q(`SELECT * FROM work_instructions ORDER BY updated_at DESC, id DESC`));
});

router.get("/work-instructions/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='active') as active,
    COUNT(*) FILTER (WHERE status='draft') as drafts,
    COUNT(*) FILTER (WHERE status='archived') as archived,
    COUNT(DISTINCT department) as departments,
    COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '30 days') as recent_updates,
    COALESCE(AVG(estimated_time), 0) as avg_time
  FROM work_instructions`);
  res.json(rows[0] || {});
});

router.post("/work-instructions", async (req, res) => {
  const d = req.body;
  const num = await nextNum("WI-", "work_instructions", "instruction_number");
  await q(`INSERT INTO work_instructions (instruction_number, title, product_name, product_code, version, department, category, steps_json, safety_notes, quality_requirements, tools_required, estimated_time, skill_level, status, notes)
    VALUES ('${num}', ${s(d.title)}, ${s(d.productName)}, ${s(d.productCode)}, ${s(d.version || '1.0')}, ${s(d.department)}, '${d.category || 'production'}', ${d.stepsJson ? `'${JSON.stringify(d.stepsJson).replace(/'/g, "''")}'` : "'[]'"}, ${s(d.safetyNotes)}, ${s(d.qualityRequirements)}, ${s(d.toolsRequired)}, ${d.estimatedTime || 0}, '${d.skillLevel || 'basic'}', '${d.status || 'draft'}', ${s(d.notes)})`);
  res.json((await q(`SELECT * FROM work_instructions WHERE instruction_number='${num}'`))[0]);
});

router.put("/work-instructions/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.title) sets.push(`title=${s(d.title)}`);
  if (d.productName !== undefined) sets.push(`product_name=${s(d.productName)}`);
  if (d.productCode !== undefined) sets.push(`product_code=${s(d.productCode)}`);
  if (d.version) sets.push(`version=${s(d.version)}`);
  if (d.department !== undefined) sets.push(`department=${s(d.department)}`);
  if (d.category) sets.push(`category='${d.category}'`);
  if (d.stepsJson) sets.push(`steps_json='${JSON.stringify(d.stepsJson).replace(/'/g, "''")}'`);
  if (d.safetyNotes !== undefined) sets.push(`safety_notes=${s(d.safetyNotes)}`);
  if (d.qualityRequirements !== undefined) sets.push(`quality_requirements=${s(d.qualityRequirements)}`);
  if (d.toolsRequired !== undefined) sets.push(`tools_required=${s(d.toolsRequired)}`);
  if (d.estimatedTime !== undefined) sets.push(`estimated_time=${d.estimatedTime}`);
  if (d.skillLevel) sets.push(`skill_level='${d.skillLevel}'`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.approvedBy) { sets.push(`approved_by=${s(d.approvedBy)}`); sets.push(`approved_at=NOW()`); }
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE work_instructions SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM work_instructions WHERE id=${req.params.id}`))[0]);
});

router.delete("/work-instructions/:id", async (req, res) => {
  await q(`DELETE FROM work_instructions WHERE id=${req.params.id} AND status='draft'`);
  res.json({ success: true });
});

// ========== PRODUCTION PLANNING ==========
router.get("/production-planning", async (_req, res) => {
  res.json(await q(`SELECT * FROM production_planning ORDER BY start_date ASC NULLS LAST, id DESC`));
});

router.get("/production-planning/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='in_progress') as in_progress,
    COUNT(*) FILTER (WHERE status='completed') as completed,
    COUNT(*) FILTER (WHERE status='delayed') as delayed,
    COALESCE(AVG(utilization_percent::numeric), 0) as avg_utilization,
    COALESCE(AVG(on_time_percent::numeric), 0) as avg_on_time,
    COALESCE(SUM(planned_quantity), 0) as total_planned,
    COALESCE(SUM(actual_quantity), 0) as total_actual,
    COUNT(*) FILTER (WHERE bottleneck IS NOT NULL AND bottleneck != '') as bottleneck_count
  FROM production_planning WHERE status != 'cancelled'`);
  res.json(rows[0] || {});
});

router.post("/production-planning", async (req, res) => {
  const d = req.body;
  const num = await nextNum("PP-", "production_planning", "plan_number");
  await q(`INSERT INTO production_planning (plan_number, title, product_name, product_code, production_line, planned_quantity, unit, start_date, end_date, priority, status, assigned_to, shift_pattern, notes)
    VALUES ('${num}', ${s(d.title)}, ${s(d.productName)}, ${s(d.productCode)}, ${s(d.productionLine)}, ${d.plannedQuantity || 0}, '${d.unit || 'unit'}', ${d.startDate ? `'${d.startDate}'` : 'NULL'}, ${d.endDate ? `'${d.endDate}'` : 'NULL'}, '${d.priority || 'medium'}', '${d.status || 'draft'}', ${s(d.assignedTo)}, ${s(d.shiftPattern)}, ${s(d.notes)})`);
  res.json((await q(`SELECT * FROM production_planning WHERE plan_number='${num}'`))[0]);
});

router.put("/production-planning/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.title) sets.push(`title=${s(d.title)}`);
  if (d.productName !== undefined) sets.push(`product_name=${s(d.productName)}`);
  if (d.productionLine !== undefined) sets.push(`production_line=${s(d.productionLine)}`);
  if (d.plannedQuantity !== undefined) sets.push(`planned_quantity=${d.plannedQuantity}`);
  if (d.actualQuantity !== undefined) sets.push(`actual_quantity=${d.actualQuantity}`);
  if (d.startDate) sets.push(`start_date='${d.startDate}'`);
  if (d.endDate) sets.push(`end_date='${d.endDate}'`);
  if (d.actualStartDate) sets.push(`actual_start_date='${d.actualStartDate}'`);
  if (d.actualEndDate) sets.push(`actual_end_date='${d.actualEndDate}'`);
  if (d.priority) sets.push(`priority='${d.priority}'`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.assignedTo !== undefined) sets.push(`assigned_to=${s(d.assignedTo)}`);
  if (d.bottleneck !== undefined) sets.push(`bottleneck=${s(d.bottleneck)}`);
  if (d.utilizationPercent !== undefined) sets.push(`utilization_percent=${d.utilizationPercent}`);
  if (d.onTimePercent !== undefined) sets.push(`on_time_percent=${d.onTimePercent}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE production_planning SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM production_planning WHERE id=${req.params.id}`))[0]);
});

router.delete("/production-planning/:id", async (req, res) => {
  await q(`DELETE FROM production_planning WHERE id=${req.params.id} AND status='draft'`);
  res.json({ success: true });
});

// ========== QUALITY CONTROL ENT ==========
router.get("/quality-control-ent", async (_req, res) => {
  res.json(await q(`SELECT * FROM quality_control_ent ORDER BY inspection_date DESC NULLS LAST, id DESC`));
});

router.get("/quality-control-ent/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE result='pass') as passed,
    COUNT(*) FILTER (WHERE result='fail') as failed,
    COUNT(*) FILTER (WHERE result='pending') as pending,
    COALESCE(AVG(CASE WHEN sample_size > 0 THEN (accepted_count::float / sample_size) * 100 END), 0) as pass_rate,
    COALESCE(AVG(rejected_count), 0) as avg_defects,
    COALESCE(SUM(cost_of_quality::numeric), 0) as total_quality_cost,
    COUNT(*) FILTER (WHERE rework_required=true AND rework_completed=false) as pending_rework
  FROM quality_control_ent`);
  res.json(rows[0] || {});
});

router.post("/quality-control-ent", async (req, res) => {
  const d = req.body;
  const num = await nextNum("QCE-", "quality_control_ent", "inspection_number");
  await q(`INSERT INTO quality_control_ent (inspection_number, inspection_type, inspection_date, product_name, product_code, batch_number, order_reference, supplier_name, inspector_name, inspection_method, sample_size, accepted_count, rejected_count, defect_type, defect_description, severity, result, corrective_action, preventive_action, disposition, rework_required, cost_of_quality, certificate_number, status, notes)
    VALUES ('${num}', '${d.inspectionType || 'incoming'}', '${d.inspectionDate || new Date().toISOString().slice(0, 10)}', ${s(d.productName)}, ${s(d.productCode)}, ${s(d.batchNumber)}, ${s(d.orderReference)}, ${s(d.supplierName)}, ${s(d.inspectorName)}, ${s(d.inspectionMethod)}, ${d.sampleSize || 1}, ${d.acceptedCount || 0}, ${d.rejectedCount || 0}, ${s(d.defectType)}, ${s(d.defectDescription)}, '${d.severity || 'minor'}', '${d.result || 'pending'}', ${s(d.correctiveAction)}, ${s(d.preventiveAction)}, '${d.disposition || 'pending'}', ${d.reworkRequired || false}, ${d.costOfQuality || 0}, ${s(d.certificateNumber)}, '${d.status || 'pending'}', ${s(d.notes)})`);
  res.json((await q(`SELECT * FROM quality_control_ent WHERE inspection_number='${num}'`))[0]);
});

router.put("/quality-control-ent/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.inspectionType) sets.push(`inspection_type='${d.inspectionType}'`);
  if (d.inspectionDate) sets.push(`inspection_date='${d.inspectionDate}'`);
  if (d.productName) sets.push(`product_name=${s(d.productName)}`);
  if (d.inspectorName) sets.push(`inspector_name=${s(d.inspectorName)}`);
  if (d.sampleSize !== undefined) sets.push(`sample_size=${d.sampleSize}`);
  if (d.acceptedCount !== undefined) sets.push(`accepted_count=${d.acceptedCount}`);
  if (d.rejectedCount !== undefined) sets.push(`rejected_count=${d.rejectedCount}`);
  if (d.severity) sets.push(`severity='${d.severity}'`);
  if (d.result) sets.push(`result='${d.result}'`);
  if (d.disposition) sets.push(`disposition='${d.disposition}'`);
  if (d.correctiveAction !== undefined) sets.push(`corrective_action=${s(d.correctiveAction)}`);
  if (d.preventiveAction !== undefined) sets.push(`preventive_action=${s(d.preventiveAction)}`);
  if (d.reworkRequired !== undefined) sets.push(`rework_required=${d.reworkRequired}`);
  if (d.reworkCompleted !== undefined) sets.push(`rework_completed=${d.reworkCompleted}`);
  if (d.costOfQuality !== undefined) sets.push(`cost_of_quality=${d.costOfQuality}`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE quality_control_ent SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM quality_control_ent WHERE id=${req.params.id}`))[0]);
});

router.delete("/quality-control-ent/:id", async (req, res) => {
  await q(`DELETE FROM quality_control_ent WHERE id=${req.params.id} AND status='pending'`);
  res.json({ success: true });
});

// ========== MACHINE MAINTENANCE ==========
router.get("/machine-maintenance", async (_req, res) => {
  res.json(await q(`SELECT * FROM machine_maintenance ORDER BY scheduled_date ASC NULLS LAST, id DESC`));
});

router.get("/machine-maintenance/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='scheduled') as scheduled,
    COUNT(*) FILTER (WHERE status='in_progress') as in_progress,
    COUNT(*) FILTER (WHERE status='completed') as completed,
    COUNT(*) FILTER (WHERE scheduled_date <= CURRENT_DATE AND status='scheduled') as upcoming,
    COALESCE(SUM(total_cost::numeric), 0) as total_cost,
    COALESCE(SUM(total_cost::numeric) FILTER (WHERE completed_date >= DATE_TRUNC('month', CURRENT_DATE)), 0) as monthly_cost,
    COALESCE(SUM(downtime_hours::numeric), 0) as total_downtime,
    COUNT(*) FILTER (WHERE maintenance_type='preventive') as preventive,
    COUNT(*) FILTER (WHERE maintenance_type='corrective') as corrective
  FROM machine_maintenance`);
  res.json(rows[0] || {});
});

router.post("/machine-maintenance", async (req, res) => {
  const d = req.body;
  const num = await nextNum("MM-", "machine_maintenance", "maintenance_number");
  await q(`INSERT INTO machine_maintenance (maintenance_number, machine_name, machine_code, location, maintenance_type, title, description, frequency, priority, status, scheduled_date, assigned_to, estimated_hours, notes)
    VALUES ('${num}', ${s(d.machineName)}, ${s(d.machineCode)}, ${s(d.location)}, '${d.maintenanceType || 'preventive'}', ${s(d.title)}, ${s(d.description)}, '${d.frequency || 'monthly'}', '${d.priority || 'medium'}', '${d.status || 'scheduled'}', ${d.scheduledDate ? `'${d.scheduledDate}'` : 'NULL'}, ${s(d.assignedTo)}, ${d.estimatedHours || 0}, ${s(d.notes)})`);
  res.json((await q(`SELECT * FROM machine_maintenance WHERE maintenance_number='${num}'`))[0]);
});

router.put("/machine-maintenance/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.machineName) sets.push(`machine_name=${s(d.machineName)}`);
  if (d.machineCode !== undefined) sets.push(`machine_code=${s(d.machineCode)}`);
  if (d.location !== undefined) sets.push(`location=${s(d.location)}`);
  if (d.maintenanceType) sets.push(`maintenance_type='${d.maintenanceType}'`);
  if (d.title) sets.push(`title=${s(d.title)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.frequency) sets.push(`frequency='${d.frequency}'`);
  if (d.priority) sets.push(`priority='${d.priority}'`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.scheduledDate) sets.push(`scheduled_date='${d.scheduledDate}'`);
  if (d.completedDate) sets.push(`completed_date='${d.completedDate}'`);
  if (d.assignedTo !== undefined) sets.push(`assigned_to=${s(d.assignedTo)}`);
  if (d.estimatedHours !== undefined) sets.push(`estimated_hours=${d.estimatedHours}`);
  if (d.actualHours !== undefined) sets.push(`actual_hours=${d.actualHours}`);
  if (d.partsCost !== undefined) sets.push(`parts_cost=${d.partsCost}`);
  if (d.laborCost !== undefined) sets.push(`labor_cost=${d.laborCost}`);
  if (d.totalCost !== undefined) sets.push(`total_cost=${d.totalCost}`);
  if (d.downtimeHours !== undefined) sets.push(`downtime_hours=${d.downtimeHours}`);
  if (d.partsUsed !== undefined) sets.push(`parts_used=${s(d.partsUsed)}`);
  if (d.findings !== undefined) sets.push(`findings=${s(d.findings)}`);
  if (d.nextMaintenanceDate) sets.push(`next_maintenance_date='${d.nextMaintenanceDate}'`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.status === 'completed') sets.push(`completed_date=COALESCE(completed_date, CURRENT_DATE)`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE machine_maintenance SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM machine_maintenance WHERE id=${req.params.id}`))[0]);
});

router.delete("/machine-maintenance/:id", async (req, res) => {
  await q(`DELETE FROM machine_maintenance WHERE id=${req.params.id} AND status IN ('scheduled','cancelled')`);
  res.json({ success: true });
});

// ========== PRODUCTION REPORTS ==========
router.get("/production-reports", async (_req, res) => {
  res.json(await q(`SELECT * FROM production_reports ORDER BY report_date DESC NULLS LAST, id DESC`));
});

router.get("/production-reports/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COALESCE(SUM(total_units_produced), 0) as total_units,
    COALESCE(AVG(cost_per_unit::numeric), 0) as avg_cost_per_unit,
    COALESCE(AVG(oee::numeric), 0) as avg_oee,
    COALESCE(AVG(availability::numeric), 0) as avg_availability,
    COALESCE(AVG(performance::numeric), 0) as avg_performance,
    COALESCE(AVG(quality::numeric), 0) as avg_quality,
    COALESCE(SUM(total_cost::numeric), 0) as total_cost,
    COALESCE(SUM(downtime_hours::numeric), 0) as total_downtime
  FROM production_reports WHERE status != 'cancelled'`);
  res.json(rows[0] || {});
});

router.post("/production-reports", async (req, res) => {
  const d = req.body;
  const num = await nextNum("PR-", "production_reports", "report_number");
  await q(`INSERT INTO production_reports (report_number, report_type, report_date, period_start, period_end, production_line, total_units_produced, total_units_planned, defective_units, cost_per_unit, total_cost, labor_hours, machine_hours, oee, availability, performance, quality, downtime_hours, waste_material, energy_consumption, status, prepared_by, notes)
    VALUES ('${num}', '${d.reportType || 'daily'}', ${d.reportDate ? `'${d.reportDate}'` : 'CURRENT_DATE'}, ${d.periodStart ? `'${d.periodStart}'` : 'NULL'}, ${d.periodEnd ? `'${d.periodEnd}'` : 'NULL'}, ${s(d.productionLine)}, ${d.totalUnitsProduced || 0}, ${d.totalUnitsPlanned || 0}, ${d.defectiveUnits || 0}, ${d.costPerUnit || 0}, ${d.totalCost || 0}, ${d.laborHours || 0}, ${d.machineHours || 0}, ${d.oee || 0}, ${d.availability || 0}, ${d.performance || 0}, ${d.quality || 0}, ${d.downtimeHours || 0}, ${d.wasteMaterial || 0}, ${d.energyConsumption || 0}, '${d.status || 'draft'}', ${s(d.preparedBy)}, ${s(d.notes)})`);
  res.json((await q(`SELECT * FROM production_reports WHERE report_number='${num}'`))[0]);
});

router.put("/production-reports/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.reportType) sets.push(`report_type='${d.reportType}'`);
  if (d.reportDate) sets.push(`report_date='${d.reportDate}'`);
  if (d.productionLine !== undefined) sets.push(`production_line=${s(d.productionLine)}`);
  if (d.totalUnitsProduced !== undefined) sets.push(`total_units_produced=${d.totalUnitsProduced}`);
  if (d.totalUnitsPlanned !== undefined) sets.push(`total_units_planned=${d.totalUnitsPlanned}`);
  if (d.defectiveUnits !== undefined) sets.push(`defective_units=${d.defectiveUnits}`);
  if (d.costPerUnit !== undefined) sets.push(`cost_per_unit=${d.costPerUnit}`);
  if (d.totalCost !== undefined) sets.push(`total_cost=${d.totalCost}`);
  if (d.laborHours !== undefined) sets.push(`labor_hours=${d.laborHours}`);
  if (d.machineHours !== undefined) sets.push(`machine_hours=${d.machineHours}`);
  if (d.oee !== undefined) sets.push(`oee=${d.oee}`);
  if (d.availability !== undefined) sets.push(`availability=${d.availability}`);
  if (d.performance !== undefined) sets.push(`performance=${d.performance}`);
  if (d.quality !== undefined) sets.push(`quality=${d.quality}`);
  if (d.downtimeHours !== undefined) sets.push(`downtime_hours=${d.downtimeHours}`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.preparedBy) sets.push(`prepared_by=${s(d.preparedBy)}`);
  if (d.approvedBy) sets.push(`approved_by=${s(d.approvedBy)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE production_reports SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM production_reports WHERE id=${req.params.id}`))[0]);
});

router.delete("/production-reports/:id", async (req, res) => {
  await q(`DELETE FROM production_reports WHERE id=${req.params.id} AND status='draft'`);
  res.json({ success: true });
});

export default router;
