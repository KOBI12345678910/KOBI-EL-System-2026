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
  catch (e: any) { console.error("Production/ProductDev query error:", e.message); return []; }
}

async function nextNum(prefix: string, table: string, col: string) {
  const year = new Date().getFullYear();
  const rows = await q(`SELECT ${col} FROM ${table} WHERE ${col} LIKE '${prefix}${year}-%' ORDER BY id DESC LIMIT 1`);
  const last = (rows[0] as any)?.[col];
  const seq = last ? parseInt(last.split("-").pop()!) + 1 : 1;
  return `${prefix}${year}-${String(seq).padStart(4, "0")}`;
}

const s = (v: any) => v != null && v !== "" ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
const n = (v: any) => v != null && v !== "" ? Number(v) : "NULL";

// ========== BOM HEADERS ==========
router.get("/bom-headers", async (_req, res) => {
  res.json(await q(`SELECT h.*, (SELECT COUNT(*) FROM bom_lines WHERE bom_header_id=h.id) as line_count FROM bom_headers h ORDER BY h.id DESC`));
});

router.get("/bom-headers/stats", async (_req, res) => {
  const rows = await q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='active') as active, COUNT(*) FILTER (WHERE status='draft') as draft, COUNT(*) FILTER (WHERE status='obsolete') as obsolete, COALESCE(SUM(total_cost), 0) as total_cost FROM bom_headers`);
  res.json(rows[0] || {});
});

router.get("/bom-headers/:id", async (req, res) => {
  const header = (await q(`SELECT * FROM bom_headers WHERE id=${req.params.id}`))[0];
  const lines = await q(`SELECT * FROM bom_lines WHERE bom_header_id=${req.params.id} ORDER BY level ASC, id ASC`);
  res.json({ header, lines });
});

router.post("/bom-headers", async (req, res) => {
  const d = req.body;
  const num = await nextNum("BOM-", "bom_headers", "bom_number");
  await q(`INSERT INTO bom_headers (bom_number, name, product_name, product_sku, version, status, description, total_cost, created_by) VALUES ('${num}', ${s(d.name)}, ${s(d.productName)}, ${s(d.productSku)}, ${s(d.version || '1.0')}, '${d.status || 'draft'}', ${s(d.description)}, ${n(d.totalCost)}, ${s(d.createdBy)})`);
  res.json((await q(`SELECT * FROM bom_headers WHERE bom_number='${num}'`))[0]);
});

router.put("/bom-headers/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.name) sets.push(`name=${s(d.name)}`);
  if (d.productName !== undefined) sets.push(`product_name=${s(d.productName)}`);
  if (d.productSku !== undefined) sets.push(`product_sku=${s(d.productSku)}`);
  if (d.version) sets.push(`version=${s(d.version)}`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.totalCost !== undefined) sets.push(`total_cost=${n(d.totalCost)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE bom_headers SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM bom_headers WHERE id=${req.params.id}`))[0]);
});

router.delete("/bom-headers/:id", async (req, res) => {
  await q(`DELETE FROM bom_lines WHERE bom_header_id=${req.params.id}`);
  await q(`DELETE FROM bom_headers WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== BOM LINES ==========
router.get("/bom-lines/:bomId", async (req, res) => {
  res.json(await q(`SELECT * FROM bom_lines WHERE bom_header_id=${req.params.bomId} ORDER BY level ASC, id ASC`));
});

router.post("/bom-lines", async (req, res) => {
  const d = req.body;
  await q(`INSERT INTO bom_lines (bom_header_id, component_name, component_sku, quantity, unit, unit_cost, total_cost, level, parent_line_id, notes) VALUES (${d.bomHeaderId}, ${s(d.componentName)}, ${s(d.componentSku)}, ${n(d.quantity)}, ${s(d.unit || 'unit')}, ${n(d.unitCost)}, ${n(d.totalCost)}, ${d.level || 1}, ${d.parentLineId || 'NULL'}, ${s(d.notes)})`);
  const rows = await q(`SELECT * FROM bom_lines WHERE bom_header_id=${d.bomHeaderId} ORDER BY id DESC LIMIT 1`);
  res.json(rows[0]);
});

router.put("/bom-lines/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.componentName) sets.push(`component_name=${s(d.componentName)}`);
  if (d.componentSku !== undefined) sets.push(`component_sku=${s(d.componentSku)}`);
  if (d.quantity !== undefined) sets.push(`quantity=${n(d.quantity)}`);
  if (d.unit) sets.push(`unit=${s(d.unit)}`);
  if (d.unitCost !== undefined) sets.push(`unit_cost=${n(d.unitCost)}`);
  if (d.totalCost !== undefined) sets.push(`total_cost=${n(d.totalCost)}`);
  if (d.level !== undefined) sets.push(`level=${d.level}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE bom_lines SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM bom_lines WHERE id=${req.params.id}`))[0]);
});

router.delete("/bom-lines/:id", async (req, res) => {
  await q(`DELETE FROM bom_lines WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== PRODUCTION WORK ORDERS ==========
router.get("/production-work-orders", async (_req, res) => {
  res.json(await q(`SELECT wo.*, bh.name as bom_name FROM production_work_orders wo LEFT JOIN bom_headers bh ON wo.bom_id=bh.id ORDER BY wo.id DESC`));
});

router.get("/production-work-orders/stats", async (_req, res) => {
  const rows = await q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='planned') as planned, COUNT(*) FILTER (WHERE status='in-progress') as in_progress, COUNT(*) FILTER (WHERE status='completed') as completed, COUNT(*) FILTER (WHERE status='cancelled') as cancelled, COALESCE(SUM(quantity_planned), 0) as total_planned, COALESCE(SUM(quantity_produced), 0) as total_produced FROM production_work_orders`);
  res.json(rows[0] || {});
});

router.post("/production-work-orders", async (req, res) => {
  const d = req.body;
  const num = await nextNum("PWO-", "production_work_orders", "order_number");
  await q(`INSERT INTO production_work_orders (order_number, product_name, bom_id, planned_start, planned_end, quantity_planned, quantity_produced, status, assigned_to, priority, notes) VALUES ('${num}', ${s(d.productName)}, ${d.bomId || 'NULL'}, ${d.plannedStart ? `'${d.plannedStart}'` : 'NULL'}, ${d.plannedEnd ? `'${d.plannedEnd}'` : 'NULL'}, ${n(d.quantityPlanned)}, ${n(d.quantityProduced)}, '${d.status || 'planned'}', ${s(d.assignedTo)}, '${d.priority || 'medium'}', ${s(d.notes)})`);
  res.json((await q(`SELECT * FROM production_work_orders WHERE order_number='${num}'`))[0]);
});

router.put("/production-work-orders/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.productName) sets.push(`product_name=${s(d.productName)}`);
  if (d.bomId !== undefined) sets.push(`bom_id=${d.bomId || 'NULL'}`);
  if (d.plannedStart !== undefined) sets.push(`planned_start=${d.plannedStart ? `'${d.plannedStart}'` : 'NULL'}`);
  if (d.plannedEnd !== undefined) sets.push(`planned_end=${d.plannedEnd ? `'${d.plannedEnd}'` : 'NULL'}`);
  if (d.actualStart !== undefined) sets.push(`actual_start=${d.actualStart ? `'${d.actualStart}'` : 'NULL'}`);
  if (d.actualEnd !== undefined) sets.push(`actual_end=${d.actualEnd ? `'${d.actualEnd}'` : 'NULL'}`);
  if (d.quantityPlanned !== undefined) sets.push(`quantity_planned=${n(d.quantityPlanned)}`);
  if (d.quantityProduced !== undefined) sets.push(`quantity_produced=${n(d.quantityProduced)}`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.assignedTo !== undefined) sets.push(`assigned_to=${s(d.assignedTo)}`);
  if (d.priority) sets.push(`priority='${d.priority}'`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.status === 'in-progress' && !d.actualStart) sets.push(`actual_start=COALESCE(actual_start, CURRENT_DATE)`);
  if (d.status === 'completed') sets.push(`actual_end=COALESCE(actual_end, CURRENT_DATE)`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE production_work_orders SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM production_work_orders WHERE id=${req.params.id}`))[0]);
});

router.delete("/production-work-orders/:id", async (req, res) => {
  await q(`DELETE FROM production_work_orders WHERE id=${req.params.id} AND status IN ('planned','cancelled')`);
  res.json({ success: true });
});

// ========== PRODUCTION PLANS ==========
router.get("/production-plans", async (_req, res) => {
  res.json(await q(`SELECT p.*, (SELECT COUNT(*) FROM production_plan_lines WHERE plan_id=p.id) as line_count FROM production_plans p ORDER BY p.id DESC`));
});

router.get("/production-plans/stats", async (_req, res) => {
  const rows = await q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='draft') as draft, COUNT(*) FILTER (WHERE status='active') as active, COUNT(*) FILTER (WHERE status='closed') as closed FROM production_plans`);
  res.json(rows[0] || {});
});

router.get("/production-plans/:id", async (req, res) => {
  const plan = (await q(`SELECT * FROM production_plans WHERE id=${req.params.id}`))[0];
  const lines = await q(`SELECT * FROM production_plan_lines WHERE plan_id=${req.params.id} ORDER BY id ASC`);
  res.json({ plan, lines });
});

router.post("/production-plans", async (req, res) => {
  const d = req.body;
  const num = await nextNum("PP-", "production_plans", "plan_number");
  await q(`INSERT INTO production_plans (plan_number, name, period_start, period_end, status, notes, created_by) VALUES ('${num}', ${s(d.name)}, ${d.periodStart ? `'${d.periodStart}'` : 'NULL'}, ${d.periodEnd ? `'${d.periodEnd}'` : 'NULL'}, '${d.status || 'draft'}', ${s(d.notes)}, ${s(d.createdBy)})`);
  res.json((await q(`SELECT * FROM production_plans WHERE plan_number='${num}'`))[0]);
});

router.put("/production-plans/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.name) sets.push(`name=${s(d.name)}`);
  if (d.periodStart !== undefined) sets.push(`period_start=${d.periodStart ? `'${d.periodStart}'` : 'NULL'}`);
  if (d.periodEnd !== undefined) sets.push(`period_end=${d.periodEnd ? `'${d.periodEnd}'` : 'NULL'}`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE production_plans SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM production_plans WHERE id=${req.params.id}`))[0]);
});

router.delete("/production-plans/:id", async (req, res) => {
  await q(`DELETE FROM production_plan_lines WHERE plan_id=${req.params.id}`);
  await q(`DELETE FROM production_plans WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== PRODUCTION PLAN LINES ==========
router.post("/production-plan-lines", async (req, res) => {
  const d = req.body;
  await q(`INSERT INTO production_plan_lines (plan_id, product_name, target_quantity, bom_id, scheduled_start, scheduled_end, work_order_id, status, notes) VALUES (${d.planId}, ${s(d.productName)}, ${n(d.targetQuantity)}, ${d.bomId || 'NULL'}, ${d.scheduledStart ? `'${d.scheduledStart}'` : 'NULL'}, ${d.scheduledEnd ? `'${d.scheduledEnd}'` : 'NULL'}, ${d.workOrderId || 'NULL'}, '${d.status || 'pending'}', ${s(d.notes)})`);
  res.json((await q(`SELECT * FROM production_plan_lines WHERE plan_id=${d.planId} ORDER BY id DESC LIMIT 1`))[0]);
});

router.put("/production-plan-lines/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.productName) sets.push(`product_name=${s(d.productName)}`);
  if (d.targetQuantity !== undefined) sets.push(`target_quantity=${n(d.targetQuantity)}`);
  if (d.scheduledStart !== undefined) sets.push(`scheduled_start=${d.scheduledStart ? `'${d.scheduledStart}'` : 'NULL'}`);
  if (d.scheduledEnd !== undefined) sets.push(`scheduled_end=${d.scheduledEnd ? `'${d.scheduledEnd}'` : 'NULL'}`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE production_plan_lines SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM production_plan_lines WHERE id=${req.params.id}`))[0]);
});

router.delete("/production-plan-lines/:id", async (req, res) => {
  await q(`DELETE FROM production_plan_lines WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== QC INSPECTIONS ==========
router.get("/qc-inspections", async (_req, res) => {
  res.json(await q(`SELECT * FROM qc_inspections ORDER BY id DESC`));
});

router.get("/qc-inspections/stats", async (_req, res) => {
  const rows = await q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE result='pass') as passed, COUNT(*) FILTER (WHERE result='fail') as failed, COUNT(*) FILTER (WHERE status='pending') as pending, COALESCE(SUM(defects_found), 0) as total_defects FROM qc_inspections`);
  res.json(rows[0] || {});
});

router.post("/qc-inspections", async (req, res) => {
  const d = req.body;
  const num = await nextNum("QCI-", "qc_inspections", "inspection_number");
  await q(`INSERT INTO qc_inspections (inspection_number, work_order_id, batch_reference, inspection_date, inspector, inspection_type, result, defects_found, defect_description, corrective_action, status, notes) VALUES ('${num}', ${d.workOrderId || 'NULL'}, ${s(d.batchReference)}, ${d.inspectionDate ? `'${d.inspectionDate}'` : 'CURRENT_DATE'}, ${s(d.inspector)}, '${d.inspectionType || 'in-process'}', '${d.result || 'pending'}', ${d.defectsFound || 0}, ${s(d.defectDescription)}, ${s(d.correctiveAction)}, '${d.status || 'pending'}', ${s(d.notes)})`);
  res.json((await q(`SELECT * FROM qc_inspections WHERE inspection_number='${num}'`))[0]);
});

router.put("/qc-inspections/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.batchReference !== undefined) sets.push(`batch_reference=${s(d.batchReference)}`);
  if (d.inspectionDate) sets.push(`inspection_date='${d.inspectionDate}'`);
  if (d.inspector) sets.push(`inspector=${s(d.inspector)}`);
  if (d.inspectionType) sets.push(`inspection_type='${d.inspectionType}'`);
  if (d.result) sets.push(`result='${d.result}'`);
  if (d.defectsFound !== undefined) sets.push(`defects_found=${d.defectsFound}`);
  if (d.defectDescription !== undefined) sets.push(`defect_description=${s(d.defectDescription)}`);
  if (d.correctiveAction !== undefined) sets.push(`corrective_action=${s(d.correctiveAction)}`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE qc_inspections SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM qc_inspections WHERE id=${req.params.id}`))[0]);
});

router.delete("/qc-inspections/:id", async (req, res) => {
  await q(`DELETE FROM qc_inspections WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== MACHINES ==========
router.get("/machines", async (_req, res) => {
  res.json(await q(`SELECT m.*, (SELECT COUNT(*) FROM machine_maintenance_records WHERE machine_id=m.id) as maintenance_count FROM machines m ORDER BY m.id DESC`));
});

router.get("/machines/stats", async (_req, res) => {
  const rows = await q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='active') as active, COUNT(*) FILTER (WHERE status='maintenance') as in_maintenance, COUNT(*) FILTER (WHERE status='retired') as retired FROM machines`);
  res.json(rows[0] || {});
});

router.post("/machines", async (req, res) => {
  const d = req.body;
  const num = await nextNum("MCH-", "machines", "machine_number");
  await q(`INSERT INTO machines (machine_number, name, asset_tag, location, machine_type, manufacturer, model, serial_number, status, purchase_date, notes) VALUES ('${num}', ${s(d.name)}, ${s(d.assetTag)}, ${s(d.location)}, ${s(d.machineType)}, ${s(d.manufacturer)}, ${s(d.model)}, ${s(d.serialNumber)}, '${d.status || 'active'}', ${d.purchaseDate ? `'${d.purchaseDate}'` : 'NULL'}, ${s(d.notes)})`);
  res.json((await q(`SELECT * FROM machines WHERE machine_number='${num}'`))[0]);
});

router.put("/machines/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.name) sets.push(`name=${s(d.name)}`);
  if (d.assetTag !== undefined) sets.push(`asset_tag=${s(d.assetTag)}`);
  if (d.location !== undefined) sets.push(`location=${s(d.location)}`);
  if (d.machineType !== undefined) sets.push(`machine_type=${s(d.machineType)}`);
  if (d.manufacturer !== undefined) sets.push(`manufacturer=${s(d.manufacturer)}`);
  if (d.model !== undefined) sets.push(`model=${s(d.model)}`);
  if (d.serialNumber !== undefined) sets.push(`serial_number=${s(d.serialNumber)}`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE machines SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM machines WHERE id=${req.params.id}`))[0]);
});

router.delete("/machines/:id", async (req, res) => {
  await q(`DELETE FROM machine_maintenance_records WHERE machine_id=${req.params.id}`);
  await q(`DELETE FROM machines WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== MACHINE MAINTENANCE RECORDS ==========
router.get("/machine-maintenance", async (_req, res) => {
  res.json(await q(`SELECT mr.*, m.name as machine_name FROM machine_maintenance_records mr LEFT JOIN machines m ON mr.machine_id=m.id ORDER BY mr.scheduled_date ASC NULLS LAST, mr.id DESC`));
});

router.get("/machine-maintenance/stats", async (_req, res) => {
  const rows = await q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='scheduled') as scheduled, COUNT(*) FILTER (WHERE status='in-progress') as in_progress, COUNT(*) FILTER (WHERE status='completed') as completed, COUNT(*) FILTER (WHERE status='scheduled' AND scheduled_date < CURRENT_DATE) as overdue, COALESCE(SUM(cost), 0) as total_cost FROM machine_maintenance_records`);
  res.json(rows[0] || {});
});

router.post("/machine-maintenance", async (req, res) => {
  const d = req.body;
  const num = await nextNum("MMR-", "machine_maintenance_records", "record_number");
  await q(`INSERT INTO machine_maintenance_records (record_number, machine_id, maintenance_type, scheduled_date, completed_date, performed_by, description, cost, parts_replaced, next_scheduled_date, status, notes) VALUES ('${num}', ${d.machineId}, '${d.maintenanceType || 'preventive'}', ${d.scheduledDate ? `'${d.scheduledDate}'` : 'NULL'}, ${d.completedDate ? `'${d.completedDate}'` : 'NULL'}, ${s(d.performedBy)}, ${s(d.description)}, ${n(d.cost)}, ${s(d.partsReplaced)}, ${d.nextScheduledDate ? `'${d.nextScheduledDate}'` : 'NULL'}, '${d.status || 'scheduled'}', ${s(d.notes)})`);
  res.json((await q(`SELECT * FROM machine_maintenance_records WHERE record_number='${num}'`))[0]);
});

router.put("/machine-maintenance/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.maintenanceType) sets.push(`maintenance_type='${d.maintenanceType}'`);
  if (d.scheduledDate !== undefined) sets.push(`scheduled_date=${d.scheduledDate ? `'${d.scheduledDate}'` : 'NULL'}`);
  if (d.completedDate !== undefined) sets.push(`completed_date=${d.completedDate ? `'${d.completedDate}'` : 'NULL'}`);
  if (d.performedBy !== undefined) sets.push(`performed_by=${s(d.performedBy)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.cost !== undefined) sets.push(`cost=${n(d.cost)}`);
  if (d.partsReplaced !== undefined) sets.push(`parts_replaced=${s(d.partsReplaced)}`);
  if (d.nextScheduledDate !== undefined) sets.push(`next_scheduled_date=${d.nextScheduledDate ? `'${d.nextScheduledDate}'` : 'NULL'}`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.status === 'completed') sets.push(`completed_date=COALESCE(completed_date, CURRENT_DATE)`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE machine_maintenance_records SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM machine_maintenance_records WHERE id=${req.params.id}`))[0]);
});

router.delete("/machine-maintenance/:id", async (req, res) => {
  await q(`DELETE FROM machine_maintenance_records WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== ROADMAP ITEMS ==========
router.get("/roadmap-items", async (_req, res) => {
  res.json(await q(`SELECT * FROM roadmap_items ORDER BY id DESC`));
});

router.get("/roadmap-items/stats", async (_req, res) => {
  const rows = await q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='backlog') as backlog, COUNT(*) FILTER (WHERE status='planned') as planned, COUNT(*) FILTER (WHERE status='in-progress') as in_progress, COUNT(*) FILTER (WHERE status='completed') as completed FROM roadmap_items`);
  res.json(rows[0] || {});
});

router.post("/roadmap-items", async (req, res) => {
  const d = req.body;
  const num = await nextNum("RM-", "roadmap_items", "item_number");
  await q(`INSERT INTO roadmap_items (item_number, title, product_area, item_type, status, priority, target_quarter, owner, description, success_metrics) VALUES ('${num}', ${s(d.title)}, ${s(d.productArea)}, '${d.itemType || 'feature'}', '${d.status || 'backlog'}', '${d.priority || 'medium'}', ${s(d.targetQuarter)}, ${s(d.owner)}, ${s(d.description)}, ${s(d.successMetrics)})`);
  res.json((await q(`SELECT * FROM roadmap_items WHERE item_number='${num}'`))[0]);
});

router.put("/roadmap-items/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.title) sets.push(`title=${s(d.title)}`);
  if (d.productArea !== undefined) sets.push(`product_area=${s(d.productArea)}`);
  if (d.itemType) sets.push(`item_type='${d.itemType}'`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.priority) sets.push(`priority='${d.priority}'`);
  if (d.targetQuarter !== undefined) sets.push(`target_quarter=${s(d.targetQuarter)}`);
  if (d.owner !== undefined) sets.push(`owner=${s(d.owner)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.successMetrics !== undefined) sets.push(`success_metrics=${s(d.successMetrics)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE roadmap_items SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM roadmap_items WHERE id=${req.params.id}`))[0]);
});

router.delete("/roadmap-items/:id", async (req, res) => {
  await q(`DELETE FROM roadmap_items WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== R&D PROJECTS ==========
router.get("/rd-projects", async (_req, res) => {
  res.json(await q(`SELECT * FROM rd_projects ORDER BY id DESC`));
});

router.get("/rd-projects/stats", async (_req, res) => {
  const rows = await q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='ideation') as ideation, COUNT(*) FILTER (WHERE status='research') as research, COUNT(*) FILTER (WHERE status='development') as development, COUNT(*) FILTER (WHERE status='testing') as testing, COUNT(*) FILTER (WHERE status='completed') as completed, COALESCE(SUM(budget), 0) as total_budget, COALESCE(SUM(spent), 0) as total_spent FROM rd_projects`);
  res.json(rows[0] || {});
});

router.post("/rd-projects", async (req, res) => {
  const d = req.body;
  const num = await nextNum("RD-", "rd_projects", "project_number");
  await q(`INSERT INTO rd_projects (project_number, name, objective, status, start_date, end_date, budget, spent, team_members, milestones, outcomes) VALUES ('${num}', ${s(d.name)}, ${s(d.objective)}, '${d.status || 'ideation'}', ${d.startDate ? `'${d.startDate}'` : 'NULL'}, ${d.endDate ? `'${d.endDate}'` : 'NULL'}, ${n(d.budget)}, ${n(d.spent)}, ${s(d.teamMembers)}, ${s(d.milestones)}, ${s(d.outcomes)})`);
  res.json((await q(`SELECT * FROM rd_projects WHERE project_number='${num}'`))[0]);
});

router.put("/rd-projects/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.name) sets.push(`name=${s(d.name)}`);
  if (d.objective !== undefined) sets.push(`objective=${s(d.objective)}`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.startDate !== undefined) sets.push(`start_date=${d.startDate ? `'${d.startDate}'` : 'NULL'}`);
  if (d.endDate !== undefined) sets.push(`end_date=${d.endDate ? `'${d.endDate}'` : 'NULL'}`);
  if (d.budget !== undefined) sets.push(`budget=${n(d.budget)}`);
  if (d.spent !== undefined) sets.push(`spent=${n(d.spent)}`);
  if (d.teamMembers !== undefined) sets.push(`team_members=${s(d.teamMembers)}`);
  if (d.milestones !== undefined) sets.push(`milestones=${s(d.milestones)}`);
  if (d.outcomes !== undefined) sets.push(`outcomes=${s(d.outcomes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE rd_projects SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM rd_projects WHERE id=${req.params.id}`))[0]);
});

router.delete("/rd-projects/:id", async (req, res) => {
  await q(`DELETE FROM rd_projects WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== FEATURE REQUESTS ==========
router.get("/feature-requests", async (_req, res) => {
  res.json(await q(`SELECT fr.*, ri.title as roadmap_title FROM feature_requests fr LEFT JOIN roadmap_items ri ON fr.linked_roadmap_item_id=ri.id ORDER BY fr.votes DESC, fr.id DESC`));
});

router.get("/feature-requests/stats", async (_req, res) => {
  const rows = await q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='new') as new_count, COUNT(*) FILTER (WHERE status='under-review') as under_review, COUNT(*) FILTER (WHERE status='accepted') as accepted, COUNT(*) FILTER (WHERE status='implemented') as implemented, COALESCE(SUM(votes), 0) as total_votes FROM feature_requests`);
  res.json(rows[0] || {});
});

router.post("/feature-requests", async (req, res) => {
  const d = req.body;
  const num = await nextNum("FR-", "feature_requests", "request_number");
  await q(`INSERT INTO feature_requests (request_number, title, description, submitted_by, source, status, priority, votes, linked_roadmap_item_id, category) VALUES ('${num}', ${s(d.title)}, ${s(d.description)}, ${s(d.submittedBy)}, '${d.source || 'internal'}', '${d.status || 'new'}', '${d.priority || 'medium'}', ${d.votes || 0}, ${d.linkedRoadmapItemId || 'NULL'}, ${s(d.category)})`);
  res.json((await q(`SELECT * FROM feature_requests WHERE request_number='${num}'`))[0]);
});

router.put("/feature-requests/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.title) sets.push(`title=${s(d.title)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.submittedBy !== undefined) sets.push(`submitted_by=${s(d.submittedBy)}`);
  if (d.source) sets.push(`source='${d.source}'`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.priority) sets.push(`priority='${d.priority}'`);
  if (d.category !== undefined) sets.push(`category=${s(d.category)}`);
  if (d.linkedRoadmapItemId !== undefined) sets.push(`linked_roadmap_item_id=${d.linkedRoadmapItemId || 'NULL'}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE feature_requests SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM feature_requests WHERE id=${req.params.id}`))[0]);
});

router.post("/feature-requests/:id/vote", async (req, res) => {
  await q(`UPDATE feature_requests SET votes = votes + 1, updated_at=NOW() WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM feature_requests WHERE id=${req.params.id}`))[0]);
});

router.delete("/feature-requests/:id", async (req, res) => {
  await q(`DELETE FROM feature_requests WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== QA TEST PLANS ==========
router.get("/qa-test-plans", async (_req, res) => {
  res.json(await q(`SELECT tp.*, (SELECT COUNT(*) FROM qa_test_cases WHERE plan_id=tp.id) as case_count, (SELECT COUNT(*) FROM qa_test_cases WHERE plan_id=tp.id AND status='passed') as passed_count, (SELECT COUNT(*) FROM qa_test_cases WHERE plan_id=tp.id AND status='failed') as failed_count FROM qa_test_plans tp ORDER BY tp.id DESC`));
});

router.get("/qa-test-plans/stats", async (_req, res) => {
  const rows = await q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='draft') as draft, COUNT(*) FILTER (WHERE status='active') as active, COUNT(*) FILTER (WHERE status='completed') as completed, (SELECT COUNT(*) FROM qa_test_cases) as total_cases, (SELECT COUNT(*) FROM qa_test_cases WHERE status='passed') as passed_cases, (SELECT COUNT(*) FROM qa_test_cases WHERE status='failed') as failed_cases FROM qa_test_plans`);
  res.json(rows[0] || {});
});

router.get("/qa-test-plans/:id", async (req, res) => {
  const plan = (await q(`SELECT * FROM qa_test_plans WHERE id=${req.params.id}`))[0];
  const cases = await q(`SELECT * FROM qa_test_cases WHERE plan_id=${req.params.id} ORDER BY id ASC`);
  res.json({ plan, cases });
});

router.post("/qa-test-plans", async (req, res) => {
  const d = req.body;
  const num = await nextNum("QTP-", "qa_test_plans", "plan_number");
  await q(`INSERT INTO qa_test_plans (plan_number, name, product_feature, version, status, created_by) VALUES ('${num}', ${s(d.name)}, ${s(d.productFeature)}, ${s(d.version)}, '${d.status || 'draft'}', ${s(d.createdBy)})`);
  res.json((await q(`SELECT * FROM qa_test_plans WHERE plan_number='${num}'`))[0]);
});

router.put("/qa-test-plans/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.name) sets.push(`name=${s(d.name)}`);
  if (d.productFeature !== undefined) sets.push(`product_feature=${s(d.productFeature)}`);
  if (d.version !== undefined) sets.push(`version=${s(d.version)}`);
  if (d.status) sets.push(`status='${d.status}'`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE qa_test_plans SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM qa_test_plans WHERE id=${req.params.id}`))[0]);
});

router.delete("/qa-test-plans/:id", async (req, res) => {
  await q(`DELETE FROM qa_test_cases WHERE plan_id=${req.params.id}`);
  await q(`DELETE FROM qa_test_plans WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== QA TEST CASES ==========
router.get("/qa-test-cases/:planId", async (req, res) => {
  res.json(await q(`SELECT * FROM qa_test_cases WHERE plan_id=${req.params.planId} ORDER BY id ASC`));
});

router.post("/qa-test-cases", async (req, res) => {
  const d = req.body;
  const num = await nextNum("TC-", "qa_test_cases", "case_number");
  await q(`INSERT INTO qa_test_cases (case_number, plan_id, title, steps, expected_result, status, tester, notes) VALUES ('${num}', ${d.planId}, ${s(d.title)}, ${s(d.steps)}, ${s(d.expectedResult)}, '${d.status || 'not-run'}', ${s(d.tester)}, ${s(d.notes)})`);
  res.json((await q(`SELECT * FROM qa_test_cases WHERE case_number='${num}'`))[0]);
});

router.put("/qa-test-cases/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.title) sets.push(`title=${s(d.title)}`);
  if (d.steps !== undefined) sets.push(`steps=${s(d.steps)}`);
  if (d.expectedResult !== undefined) sets.push(`expected_result=${s(d.expectedResult)}`);
  if (d.actualResult !== undefined) sets.push(`actual_result=${s(d.actualResult)}`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.tester !== undefined) sets.push(`tester=${s(d.tester)}`);
  if (d.runDate !== undefined) sets.push(`run_date=${d.runDate ? `'${d.runDate}'` : 'NULL'}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE qa_test_cases SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM qa_test_cases WHERE id=${req.params.id}`))[0]);
});

router.post("/qa-test-cases/:id/run", async (req, res) => {
  const d = req.body;
  await q(`UPDATE qa_test_cases SET status='${d.result || 'passed'}', actual_result=${s(d.actualResult)}, run_date=CURRENT_DATE, tester=${s(d.tester)}, updated_at=NOW() WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM qa_test_cases WHERE id=${req.params.id}`))[0]);
});

router.delete("/qa-test-cases/:id", async (req, res) => {
  await q(`DELETE FROM qa_test_cases WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== PRODUCTION REPORTS ==========
router.get("/production-reports/output", async (req, res) => {
  const { from, to } = req.query as any;
  const dateFilter = from && to ? `WHERE actual_end BETWEEN '${from}' AND '${to}'` : "";
  const rows = await q(`SELECT product_name, SUM(quantity_produced) as total_produced, SUM(quantity_planned) as total_planned, COUNT(*) as order_count FROM production_work_orders ${dateFilter} GROUP BY product_name ORDER BY total_produced DESC`);
  res.json(rows);
});

router.get("/production-reports/completion-rates", async (_req, res) => {
  const rows = await q(`SELECT status, COUNT(*) as count FROM production_work_orders GROUP BY status`);
  res.json(rows);
});

router.get("/production-reports/qc-rates", async (_req, res) => {
  const rows = await q(`SELECT result, COUNT(*) as count FROM qc_inspections GROUP BY result`);
  res.json(rows);
});

router.get("/production-reports/machine-downtime", async (_req, res) => {
  const rows = await q(`SELECT m.name as machine_name, COUNT(mr.id) as maintenance_count, COALESCE(SUM(mr.cost), 0) as total_cost, COUNT(*) FILTER (WHERE mr.status='scheduled' AND mr.scheduled_date < CURRENT_DATE) as overdue FROM machines m LEFT JOIN machine_maintenance_records mr ON m.id=mr.machine_id GROUP BY m.id, m.name ORDER BY maintenance_count DESC`);
  res.json(rows);
});

export default router;
