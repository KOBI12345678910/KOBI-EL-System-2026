/**
 * @openapi
 * /api/quality-inspections:
 *   get:
 *     summary: בקרת איכות — Quality inspections list
 *     description: מחזיר רשימת בדיקות איכות בייצור (ברזל, אלומיניום, זכוכית). כולל תוצאות, סטטוסים ומגמות SPC.
 *     tags: [Production & Manufacturing]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: רשימת בדיקות איכות
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   inspection_date: { type: string, format: date }
 *                   status: { type: string, enum: [pass, fail, pending] }
 *                   material_type: { type: string, description: "סוג חומר: ברזל/אלומיניום/זכוכית" }
 *       401: { description: לא מחובר }
 * /api/work-orders:
 *   get:
 *     summary: פקודות עבודה — Work orders
 *     description: מחזיר רשימת פקודות עבודה לייצור. ניהול לוח זמנים, שיוך עובדים, וצמידות למכונות.
 *     tags: [Production & Manufacturing]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: רשימת פקודות עבודה
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   order_number: { type: string }
 *                   status: { type: string, enum: [pending, in_progress, completed, cancelled] }
 *                   product_name: { type: string }
 *                   quantity: { type: number }
 *       401: { description: לא מחובר }
 */
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
  catch (e: any) { console.error("Production-Enterprise query error:", e.message); return []; }
}

async function nextNum(prefix: string, table: string, col: string) {
  const year = new Date().getFullYear();
  const pattern = `${prefix}${year}-%`;
  const colRaw = sql.raw(col);
  const tableRaw = sql.raw(table);
  try {
    const r = await db.execute(sql`SELECT ${colRaw} FROM ${tableRaw} WHERE ${colRaw} LIKE ${pattern} ORDER BY id DESC LIMIT 1`);
    const last = (r.rows[0] as any)?.[col];
    const seq = last ? parseInt(last.split("-").pop()!) + 1 : 1;
    return `${prefix}${year}-${String(seq).padStart(4, "0")}`;
  } catch {
    return `${prefix}${year}-${String(Date.now()).slice(-4)}`;
  }
}

// Generate work order number using PostgreSQL sequence for race-safe numbering
async function nextNumForWorkOrder(prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const r = await db.execute(sql.raw(`SELECT nextval('work_orders_order_number_seq'::regclass) as seq_val`));
  const seq = (r.rows[0] as any)?.seq_val || 1;
  return `${prefix}${year}-${seq}`;
}

// ========== QUALITY INSPECTIONS ==========
router.get("/quality-inspections", async (_req, res) => {
  res.json(await q(`SELECT * FROM quality_inspections ORDER BY inspection_date DESC, id DESC`));
});

router.get("/quality-inspections/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE result='pass') as passed,
    COUNT(*) FILTER (WHERE result='fail') as failed,
    COUNT(*) FILTER (WHERE result='pending') as pending,
    COUNT(*) FILTER (WHERE result='conditional') as conditional,
    COALESCE(AVG(CASE WHEN sample_size > 0 THEN (accepted_count::float / sample_size) * 100 END), 0) as avg_acceptance_rate,
    COALESCE(SUM(cost_of_quality), 0) as total_quality_cost,
    COUNT(*) FILTER (WHERE rework_required=true AND rework_completed=false) as pending_rework
  FROM quality_inspections`);
  res.json(rows[0] || {});
});

router.post("/quality-inspections", async (req, res) => {
  const d = req.body;
  const num = await nextNum("QC-", "quality_inspections", "inspection_number");
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO quality_inspections (inspection_number, inspection_type, inspection_date, product_name, product_code, batch_number, order_reference, supplier_name, customer_name, inspector_name, inspection_method, sample_size, accepted_count, rejected_count, defect_type, defect_description, severity, measurements, specifications, result, corrective_action, preventive_action, disposition, quarantine_location, rework_required, cost_of_quality, certificate_number, notes)
    VALUES ('${num}', '${d.inspectionType||'incoming'}', '${d.inspectionDate || new Date().toISOString().slice(0,10)}', ${s(d.productName)}, ${s(d.productCode)}, ${s(d.batchNumber)}, ${s(d.orderReference)}, ${s(d.supplierName)}, ${s(d.customerName)}, ${s(d.inspectorName)}, ${s(d.inspectionMethod)}, ${d.sampleSize||1}, ${d.acceptedCount||0}, ${d.rejectedCount||0}, ${s(d.defectType)}, ${s(d.defectDescription)}, '${d.severity||'minor'}', ${s(d.measurements)}, ${s(d.specifications)}, '${d.result||'pending'}', ${s(d.correctiveAction)}, ${s(d.preventiveAction)}, '${d.disposition||'pending'}', ${s(d.quarantineLocation)}, ${d.reworkRequired||false}, ${d.costOfQuality||0}, ${s(d.certificateNumber)}, ${s(d.notes)})`);
  res.json((await q(`SELECT * FROM quality_inspections WHERE inspection_number='${num}'`))[0]);
});

router.put("/quality-inspections/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
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
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.result === 'pass' || d.result === 'fail') {
    sets.push(`reviewed_by=${s((req as any).user?.fullName)}`);
    sets.push(`reviewed_at=NOW()`);
  }
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE quality_inspections SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM quality_inspections WHERE id=${req.params.id}`))[0]);
});

router.delete("/quality-inspections/:id", async (req, res) => {
  await q(`DELETE FROM quality_inspections WHERE id=${req.params.id} AND result='pending'`);
  res.json({ success: true });
});

// ========== WORK ORDERS ==========

const VALID_ORDER_TYPES = new Set(["cutting","welding","bending","drilling","grinding","assembly","glass_cutting","glass_fitting","painting","powder_coating","galvanizing","installation","measurement","production","maintenance","repair","rework","prototype","quality_check"]);
const VALID_PRIORITIES = new Set(["critical","high","medium","low"]);
const VALID_STATUSES = new Set(["draft","planned","in_progress","on_hold","completed","cancelled","quality_check"]);
// State machine: which statuses can transition to which
const STATUS_TRANSITIONS: Record<string, Set<string>> = {
  draft:         new Set(["planned","cancelled"]),
  planned:       new Set(["in_progress","on_hold","cancelled"]),
  in_progress:   new Set(["quality_check","on_hold","completed","cancelled"]),
  quality_check: new Set(["completed","in_progress","cancelled"]),
  on_hold:       new Set(["planned","in_progress","cancelled"]),
  completed:     new Set([]),
  cancelled:     new Set([]),
};

// J-02: Hebrew error messages
router.get("/work-orders", async (_req, res) => {
  try {
    const result = await q(`SELECT * FROM work_orders WHERE deleted_at IS NULL ORDER BY due_date ASC NULLS LAST, id DESC`);
    res.json(result);
  } catch (error: any) {
    console.error("Work orders fetch error:", error);
    res.status(500).json({ error: "אירעה שגיאה בטעינת הזמנות העבודה" });
  }
});

router.get("/work-orders/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='draft') as drafts,
    COUNT(*) FILTER (WHERE status='planned') as planned,
    COUNT(*) FILTER (WHERE status='in_progress') as in_progress,
    COUNT(*) FILTER (WHERE status='completed') as completed,
    COUNT(*) FILTER (WHERE status='on_hold') as on_hold,
    COUNT(*) FILTER (WHERE priority='critical') as critical,
    COALESCE(SUM(total_cost), 0) as total_cost
  FROM work_orders WHERE deleted_at IS NULL AND status != 'cancelled'`);
  res.json(rows[0] || {});
});

router.post("/work-orders", async (req, res) => {
  const d = req.body;

  // Server-side validation
  if (!d.title || !String(d.title).trim()) return res.status(400).json({ error: "שדה כותרת הוא חובה" });
  if (!d.dueDate) return res.status(400).json({ error: "שדה תאריך יעד הוא חובה" });
  const qty = parseFloat(d.quantityOrdered);
  if (isNaN(qty) || qty <= 0) return res.status(400).json({ error: "כמות מוזמנת חייבת להיות מספר חיובי" });
  if (d.orderType && !VALID_ORDER_TYPES.has(d.orderType)) return res.status(400).json({ error: "סוג הוראה לא חוקי" });
  if (d.priority && !VALID_PRIORITIES.has(d.priority)) return res.status(400).json({ error: "עדיפות לא חוקית" });
  if (d.status && !VALID_STATUSES.has(d.status)) return res.status(400).json({ error: "סטטוס לא חוקי" });
  
  // Reject negative costs/hours (don't clamp)
  const materialCost = parseFloat(d.materialCost) || 0;
  const laborCost = parseFloat(d.laborCost) || 0;
  const overheadCost = parseFloat(d.overheadCost) || 0;
  const estimatedHours = parseFloat(d.estimatedHours) || 0;
  const qtyCompleted = parseFloat(d.quantityCompleted) || 0;
  const qtyRejected = parseFloat(d.quantityRejected) || 0;
  
  if (materialCost < 0) return res.status(400).json({ error: "עלות חומרים לא יכולה להיות שלילית" });
  if (laborCost < 0) return res.status(400).json({ error: "עלות עבודה לא יכולה להיות שלילית" });
  if (overheadCost < 0) return res.status(400).json({ error: "עלות תקורה לא יכולה להיות שלילית" });
  if (estimatedHours < 0) return res.status(400).json({ error: "שעות מוערכות לא יכולות להיות שליליות" });
  if (qtyCompleted < 0) return res.status(400).json({ error: "כמות שהושלמה לא יכולה להיות שלילית" });
  if (qtyRejected < 0) return res.status(400).json({ error: "כמות שנפסלה לא יכולה להיות שלילית" });
  
  const totalCost = materialCost + laborCost + overheadCost;
  const completionPct = qty > 0 ? Math.min(100, (qtyCompleted / qty) * 100) : 0;

  const user = (req as any).user;

  try {
    // nextNumForWorkOrder uses PostgreSQL sequence which is atomically safe under concurrency
    const num = await nextNumForWorkOrder("WO-");
    await db.execute(sql`INSERT INTO work_orders (
      order_number, order_type, title, description, priority, status, department, material_type,
      assigned_to, assigned_team, customer_name, project_name, product_name, product_code,
      quantity_ordered, quantity_completed, quantity_rejected, completion_percentage,
      unit_of_measure, start_date, due_date, estimated_hours,
      material_cost, labor_cost, overhead_cost, total_cost,
      machine_name, work_center, notes, created_by, created_by_name
    ) VALUES (
      ${num}, ${d.orderType || 'production'}, ${String(d.title).trim()}, ${d.description || null},
      ${d.priority || 'medium'}, ${d.status || 'draft'}, ${d.department || null}, ${d.materialType || null},
      ${d.assignedTo || null}, ${d.assignedTeam || null}, ${d.customerName || null}, ${d.projectName || null},
      ${d.productName || null}, ${d.productCode || null},
      ${qty}, ${qtyCompleted}, ${qtyRejected}, ${completionPct},
      ${d.unitOfMeasure || 'יחידה'}, ${d.startDate || null}, ${d.dueDate},
      ${estimatedHours},
      ${materialCost}, ${laborCost}, ${overheadCost}, ${totalCost},
      ${d.machineName || null}, ${d.workCenter || null}, ${d.notes || null},
      ${user?.id || null}, ${user?.fullName || null}
    )`);
    const rows = await db.execute(sql`SELECT * FROM work_orders WHERE order_number = ${num}`);
    res.json(rows.rows[0]);
  } catch (e: any) {
    console.error("work-orders POST error:", e.message);
    res.status(500).json({ error: "שגיאה בשמירה" });
  }
});

router.put("/work-orders/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "מזהה לא חוקי" });
  const d = req.body;

  // Required field validation for PUT when provided
  if (d.title !== undefined && !String(d.title).trim()) return res.status(400).json({ error: "כותרת לא יכולה להיות ריקה" });
  if (d.dueDate !== undefined && !d.dueDate) return res.status(400).json({ error: "תאריך יעד לא יכול להיות ריק" });

  // Validate enums
  if (d.orderType !== undefined && !VALID_ORDER_TYPES.has(d.orderType)) return res.status(400).json({ error: "סוג הוראה לא חוקי" });
  if (d.priority !== undefined && !VALID_PRIORITIES.has(d.priority)) return res.status(400).json({ error: "עדיפות לא חוקית" });

  // State machine validation
  if (d.status !== undefined) {
    if (!VALID_STATUSES.has(d.status)) return res.status(400).json({ error: "סטטוס לא חוקי" });
    const currentRows = await db.execute(sql`SELECT status FROM work_orders WHERE id = ${id}`);
    const currentStatus = (currentRows.rows[0] as any)?.status;
    if (currentStatus && currentStatus !== d.status) {
      const allowed = STATUS_TRANSITIONS[currentStatus];
      if (allowed && !allowed.has(d.status)) {
        return res.status(400).json({ error: `לא ניתן לעבור מסטטוס "${currentStatus}" ל-"${d.status}"` });
      }
    }
  }

  // Validate numeric non-negative values — strict checks with isNaN validation
  if (d.quantityOrdered !== undefined) {
    const qo = parseFloat(d.quantityOrdered);
    if (isNaN(qo) || qo <= 0) return res.status(400).json({ error: "כמות מוזמנת חייבת להיות מספר חיובי" });
  }
  if (d.quantityCompleted !== undefined) {
    const qc = parseFloat(d.quantityCompleted);
    if (isNaN(qc) || qc < 0) return res.status(400).json({ error: "כמות שהושלמה חייבת להיות מספר אי-שלילי" });
  }
  if (d.quantityRejected !== undefined) {
    const qr = parseFloat(d.quantityRejected);
    if (isNaN(qr) || qr < 0) return res.status(400).json({ error: "כמות שנפסלה חייבת להיות מספר אי-שלילי" });
  }
  if (d.estimatedHours !== undefined) {
    const eh = parseFloat(d.estimatedHours);
    if (isNaN(eh) || eh < 0) return res.status(400).json({ error: "שעות מוערכות חייבות להיות מספר אי-שלילי" });
  }
  if (d.actualHours !== undefined) {
    const ah = parseFloat(d.actualHours);
    if (isNaN(ah) || ah < 0) return res.status(400).json({ error: "שעות בפועל חייבות להיות מספר אי-שלילי" });
  }
  if (d.materialCost !== undefined) {
    const mc = parseFloat(d.materialCost);
    if (isNaN(mc) || mc < 0) return res.status(400).json({ error: "עלות חומרים חייבת להיות מספר אי-שלילי" });
  }
  if (d.laborCost !== undefined) {
    const lc = parseFloat(d.laborCost);
    if (isNaN(lc) || lc < 0) return res.status(400).json({ error: "עלות עבודה חייבת להיות מספר אי-שלילי" });
  }
  if (d.overheadCost !== undefined) {
    const oc = parseFloat(d.overheadCost);
    if (isNaN(oc) || oc < 0) return res.status(400).json({ error: "עלות תקורה חייבת להיות מספר אי-שלילי" });
  }

  // Build dynamic SQL parts using parameterized approach
  // We'll collect field assignments with values and build a single query
  const setParts: ReturnType<typeof sql>[] = [];

  if (d.title !== undefined) setParts.push(sql`title = ${String(d.title).trim() || null}`);
  if (d.description !== undefined) setParts.push(sql`description = ${d.description || null}`);
  if (d.orderType !== undefined) setParts.push(sql`order_type = ${d.orderType}`);
  if (d.priority !== undefined) setParts.push(sql`priority = ${d.priority}`);
  if (d.status !== undefined) {
    setParts.push(sql`status = ${d.status}`);
    if (d.status === 'in_progress') setParts.push(sql`actual_start_date = CURRENT_DATE`);
    if (d.status === 'completed') setParts.push(sql`actual_end_date = CURRENT_DATE`);
  }
  if (d.department !== undefined) setParts.push(sql`department = ${d.department || null}`);
  if (d.materialType !== undefined) setParts.push(sql`material_type = ${d.materialType || null}`);
  if (d.assignedTo !== undefined) setParts.push(sql`assigned_to = ${d.assignedTo || null}`);
  if (d.assignedTeam !== undefined) setParts.push(sql`assigned_team = ${d.assignedTeam || null}`);
  if (d.customerName !== undefined) setParts.push(sql`customer_name = ${d.customerName || null}`);
  if (d.projectName !== undefined) setParts.push(sql`project_name = ${d.projectName || null}`);
  if (d.productName !== undefined) setParts.push(sql`product_name = ${d.productName || null}`);
  if (d.productCode !== undefined) setParts.push(sql`product_code = ${d.productCode || null}`);
  if (d.unitOfMeasure !== undefined) setParts.push(sql`unit_of_measure = ${d.unitOfMeasure}`);
  if (d.startDate !== undefined) setParts.push(sql`start_date = ${d.startDate || null}`);
  if (d.dueDate !== undefined) setParts.push(sql`due_date = ${d.dueDate || null}`);
  if (d.estimatedHours !== undefined) setParts.push(sql`estimated_hours = ${parseFloat(d.estimatedHours) || 0}`);
  if (d.actualHours !== undefined) setParts.push(sql`actual_hours = ${parseFloat(d.actualHours) || 0}`);
  if (d.machineName !== undefined) setParts.push(sql`machine_name = ${d.machineName || null}`);
  if (d.workCenter !== undefined) setParts.push(sql`work_center = ${d.workCenter || null}`);
  if (d.notes !== undefined) setParts.push(sql`notes = ${d.notes || null}`);

  // Handle cost fields — auto-compute total (values already validated as non-negative above)
  const needCostRecalc = d.materialCost !== undefined || d.laborCost !== undefined || d.overheadCost !== undefined;
  if (needCostRecalc) {
    const currentRow = await db.execute(sql`SELECT material_cost, labor_cost, overhead_cost FROM work_orders WHERE id = ${id}`);
    const cur = (currentRow.rows[0] as any) || {};
    const mc = d.materialCost !== undefined ? parseFloat(d.materialCost) || 0 : parseFloat(cur.material_cost) || 0;
    const lc = d.laborCost !== undefined ? parseFloat(d.laborCost) || 0 : parseFloat(cur.labor_cost) || 0;
    const oc = d.overheadCost !== undefined ? parseFloat(d.overheadCost) || 0 : parseFloat(cur.overhead_cost) || 0;
    if (d.materialCost !== undefined) setParts.push(sql`material_cost = ${mc}`);
    if (d.laborCost !== undefined) setParts.push(sql`labor_cost = ${lc}`);
    if (d.overheadCost !== undefined) setParts.push(sql`overhead_cost = ${oc}`);
    setParts.push(sql`total_cost = ${mc + lc + oc}`);
  }

  // Handle quantity fields — auto-compute completion % (values already validated as non-negative above)
  const needQtyRecalc = d.quantityOrdered !== undefined || d.quantityCompleted !== undefined || d.quantityRejected !== undefined;
  if (needQtyRecalc) {
    const currentRow = await db.execute(sql`SELECT quantity_ordered, quantity_completed, quantity_rejected FROM work_orders WHERE id = ${id}`);
    const cur = (currentRow.rows[0] as any) || {};
    const qo = d.quantityOrdered !== undefined ? parseFloat(d.quantityOrdered) || 0 : parseFloat(cur.quantity_ordered) || 0;
    const qc = d.quantityCompleted !== undefined ? parseFloat(d.quantityCompleted) || 0 : parseFloat(cur.quantity_completed) || 0;
    const qr = d.quantityRejected !== undefined ? parseFloat(d.quantityRejected) || 0 : parseFloat(cur.quantity_rejected) || 0;
    if (d.quantityOrdered !== undefined) setParts.push(sql`quantity_ordered = ${qo}`);
    if (d.quantityCompleted !== undefined) setParts.push(sql`quantity_completed = ${qc}`);
    if (d.quantityRejected !== undefined) setParts.push(sql`quantity_rejected = ${qr}`);
    const pct = qo > 0 ? Math.min(100, (qc / qo) * 100) : 0;
    setParts.push(sql`completion_percentage = ${pct}`);
  }

  if (setParts.length === 0) return res.status(400).json({ error: "אין שדות לעדכון" });
  setParts.push(sql`updated_at = NOW()`);

  // Join all setParts with commas
  const setClause = setParts.reduce((acc, part, i) => i === 0 ? part : sql`${acc}, ${part}`);

  try {
    await db.execute(sql`UPDATE work_orders SET ${setClause} WHERE id = ${id}`);
    const rows = await db.execute(sql`SELECT * FROM work_orders WHERE id = ${id}`);
    res.json(rows.rows[0]);
  } catch (e: any) {
    console.error("work-orders PUT error:", e.message);
    res.status(500).json({ error: "שגיאה בעדכון" });
  }
});

router.delete("/work-orders/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "מזהה לא חוקי" });
  try {
    const result = await db.execute(sql`UPDATE work_orders SET deleted_at = NOW() WHERE id = ${id} AND status = 'draft' AND deleted_at IS NULL`);
    if ((result.rowCount || 0) === 0) {
      return res.status(400).json({ error: "ניתן למחוק רק הוראות עבודה בסטטוס טיוטה" });
    }
    res.json({ success: true });
  } catch (e: any) {
    console.error("work-orders DELETE error:", e.message);
    res.status(500).json({ error: "שגיאה במחיקה" });
  }
});

export default router;
