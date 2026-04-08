import { Router } from "express";
import { pool, db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

function safeNum(v: any): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// ─── INSPECTION PLANS ───────────────────────────────────────────────────────

router.get("/inspection-plans", async (req, res) => {
  try {
    const { materialId, supplierId, type } = req.query;
    let whereClause = "WHERE 1=1";
    const params: any[] = [];
    let idx = 1;
    if (materialId) { whereClause += ` AND ip.material_id = $${idx++}`; params.push(materialId); }
    if (supplierId) { whereClause += ` AND ip.supplier_id = $${idx++}`; params.push(supplierId); }
    if (type) { whereClause += ` AND ip.inspection_type = $${idx++}`; params.push(type); }
    const result = await db.execute(sql.raw(`
      SELECT ip.*,
        COUNT(ipi.id) AS item_count
      FROM inspection_plans ip
      LEFT JOIN inspection_plan_items ipi ON ipi.plan_id = ip.id
      ${whereClause}
      GROUP BY ip.id
      ORDER BY ip.created_at DESC
    `, params));
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/inspection-plans/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [plan] = (await pool.query(`SELECT * FROM inspection_plans WHERE id = $1`, [id])).rows;
    if (!plan) return res.status(404).json({ error: "Not found" });
    const items = (await pool.query(`SELECT * FROM inspection_plan_items WHERE plan_id = $1 ORDER BY sort_order, id`, [id])).rows;
    res.json({ ...plan, items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/inspection-plans", async (req, res) => {
  try {
    const {
      planName, planCode, inspectionType, materialId, materialName, supplierId, supplierName,
      sampleSize, samplingMethod, acceptanceLevel, rejectionLevel, description, notes, items
    } = req.body;
    const r = await db.execute(sql.raw(`
      INSERT INTO inspection_plans (plan_name, plan_code, inspection_type, material_id, material_name, supplier_id, supplier_name,
        sample_size, sampling_method, acceptance_level, rejection_level, description, notes, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,TRUE,NOW(),NOW())
      RETURNING *
    `, [planName, planCode, inspectionType||"incoming", materialId||null, materialName||null, supplierId||null, supplierName||null,
        sampleSize||1, samplingMethod||"random", acceptanceLevel||0, rejectionLevel||null, description||null, notes||null]));
    const plan = r.rows[0] as any;
    if (Array.isArray(items) && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        await db.execute(sql.raw(`
          INSERT INTO inspection_plan_items (plan_id, item_name, parameter_type, min_value, max_value, target_value, unit, test_method, is_required, sort_order, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
        `, [plan.id, it.itemName||it.item_name, it.parameterType||it.parameter_type||"measurement",
            it.minValue||it.min_value||null, it.maxValue||it.max_value||null, it.targetValue||it.target_value||null,
            it.unit||null, it.testMethod||it.test_method||null, it.isRequired !== false, i]));
      }
    }
    res.status(201).json(plan);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/inspection-plans/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      planName, planCode, inspectionType, materialId, materialName, supplierId, supplierName,
      sampleSize, samplingMethod, acceptanceLevel, rejectionLevel, description, notes, isActive, items
    } = req.body;
    const r = await db.execute(sql.raw(`
      UPDATE inspection_plans SET
        plan_name=COALESCE($1, plan_name), plan_code=COALESCE($2, plan_code),
        inspection_type=COALESCE($3, inspection_type), material_id=COALESCE($4, material_id),
        material_name=COALESCE($5, material_name), supplier_id=COALESCE($6, supplier_id),
        supplier_name=COALESCE($7, supplier_name), sample_size=COALESCE($8, sample_size),
        sampling_method=COALESCE($9, sampling_method), acceptance_level=COALESCE($10, acceptance_level),
        rejection_level=COALESCE($11, rejection_level), description=COALESCE($12, description),
        notes=COALESCE($13, notes), is_active=COALESCE($14, is_active), updated_at=NOW()
      WHERE id=$15 RETURNING *
    `, [planName||null, planCode||null, inspectionType||null, materialId||null, materialName||null,
        supplierId||null, supplierName||null, sampleSize||null, samplingMethod||null,
        acceptanceLevel!=null?acceptanceLevel:null, rejectionLevel||null, description||null,
        notes||null, isActive!=null?isActive:null, id]));
    if (Array.isArray(items)) {
      await pool.query(`DELETE FROM inspection_plan_items WHERE plan_id = $1`, [id]);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        await db.execute(sql.raw(`
          INSERT INTO inspection_plan_items (plan_id, item_name, parameter_type, min_value, max_value, target_value, unit, test_method, is_required, sort_order, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
        `, [id, it.itemName||it.item_name, it.parameterType||it.parameter_type||"measurement",
            it.minValue||it.min_value||null, it.maxValue||it.max_value||null, it.targetValue||it.target_value||null,
            it.unit||null, it.testMethod||it.test_method||null, it.isRequired !== false, i]));
      }
    }
    res.json(r.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/inspection-plans/:id/clone", async (req, res) => {
  try {
    const { id } = req.params;
    const { newPlanName } = req.body;
    const [orig] = (await pool.query(`SELECT * FROM inspection_plans WHERE id = $1`, [id])).rows as any[];
    if (!orig) return res.status(404).json({ error: "Not found" });
    const r = await db.execute(sql.raw(`
      INSERT INTO inspection_plans (plan_name, plan_code, inspection_type, material_id, material_name, supplier_id, supplier_name,
        sample_size, sampling_method, acceptance_level, rejection_level, description, notes, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,TRUE,NOW(),NOW()) RETURNING *
    `, [newPlanName || `${orig.plan_name} (עותק)`, orig.plan_code ? `${orig.plan_code}-COPY` : null,
        orig.inspection_type, orig.material_id, orig.material_name, orig.supplier_id, orig.supplier_name,
        orig.sample_size, orig.sampling_method, orig.acceptance_level, orig.rejection_level,
        orig.description, orig.notes]));
    const newPlan = r.rows[0] as any;
    const origItems = (await pool.query(`SELECT * FROM inspection_plan_items WHERE plan_id = $1 ORDER BY sort_order, id`, [id])).rows;
    for (const it of origItems as any[]) {
      await db.execute(sql.raw(`
        INSERT INTO inspection_plan_items (plan_id, item_name, parameter_type, min_value, max_value, target_value, unit, test_method, is_required, sort_order, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
      `, [newPlan.id, it.item_name, it.parameter_type, it.min_value, it.max_value, it.target_value, it.unit, it.test_method, it.is_required, it.sort_order]));
    }
    res.status(201).json(newPlan);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/inspection-plans/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM inspection_plan_items WHERE plan_id = $1`, [id]);
    await pool.query(`DELETE FROM inspection_plans WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── QC INSPECTIONS (expanded) ───────────────────────────────────────────────

router.get("/qc-inspections", async (req, res) => {
  try {
    const { type, status, result, planId } = req.query;
    let where = "WHERE 1=1";
    const params: any[] = [];
    let idx = 1;
    if (type) { where += ` AND i.inspection_type=$${idx++}`; params.push(type); }
    if (status) { where += ` AND i.status=$${idx++}`; params.push(status); }
    if (result) { where += ` AND i.result=$${idx++}`; params.push(result); }
    if (planId) { where += ` AND i.plan_id=$${idx++}`; params.push(planId); }
    const rows = (await db.execute(sql.raw(`
      SELECT i.*, ip.plan_name, ip.sample_size AS plan_sample_size,
        COUNT(ir.id) AS result_count,
        SUM(CASE WHEN ir.result='pass' THEN 1 ELSE 0 END) AS results_passed,
        SUM(CASE WHEN ir.result='fail' THEN 1 ELSE 0 END) AS results_failed
      FROM qc_inspections i
      LEFT JOIN inspection_plans ip ON ip.id = i.plan_id
      LEFT JOIN inspection_results ir ON ir.inspection_id = i.id
      ${where}
      GROUP BY i.id, ip.plan_name, ip.sample_size
      ORDER BY i.created_at DESC
    `, params))).rows;
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/qc-inspections/stats", async (_req, res) => {
  try {
    const r = (await db.execute(sql`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN result='pass' THEN 1 ELSE 0 END) AS passed,
        SUM(CASE WHEN result='fail' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN inspection_type='incoming' THEN 1 ELSE 0 END) AS incoming_count,
        SUM(CASE WHEN inspection_type='in-process' THEN 1 ELSE 0 END) AS in_process_count,
        SUM(CASE WHEN inspection_type='final' THEN 1 ELSE 0 END) AS final_count,
        SUM(COALESCE(defects_found,0)) AS total_defects
      FROM qc_inspections
    `)).rows[0] || {};
    res.json(r);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/qc-inspections/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [insp] = (await pool.query(`
      SELECT i.*, ip.plan_name, ip.acceptance_level, ip.rejection_level
      FROM qc_inspections i
      LEFT JOIN inspection_plans ip ON ip.id = i.plan_id
      WHERE i.id=$1
    `, [id])).rows;
    if (!insp) return res.status(404).json({ error: "Not found" });
    const results = (await pool.query(`
      SELECT ir.*, ipi.item_name, ipi.parameter_type, ipi.min_value, ipi.max_value, ipi.target_value, ipi.unit
      FROM inspection_results ir
      LEFT JOIN inspection_plan_items ipi ON ipi.id = ir.plan_item_id
      WHERE ir.inspection_id=$1 ORDER BY ir.id
    `, [id])).rows;
    res.json({ ...insp, results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/qc-inspections", async (req, res) => {
  try {
    const {
      inspectionType, planId, materialId, materialName, supplierId, supplierName,
      workOrderId, batchReference, inspectionDate, inspector, sampleSize,
      result, disposition, defectsFound, defectDescription, correctiveAction, status, notes
    } = req.body;

    const counter = (await db.execute(sql`
      INSERT INTO auto_number_counters (entity_type, last_number) VALUES ('qc_inspection', 1)
      ON CONFLICT (entity_type) DO UPDATE SET last_number = auto_number_counters.last_number + 1
      RETURNING last_number
    `)).rows[0] as any;
    const num = String(counter.last_number).padStart(5, "0");
    const inspectionNumber = `QC-${num}`;

    const r = await db.execute(sql.raw(`
      INSERT INTO qc_inspections (
        inspection_number, inspection_type, plan_id, material_id, material_name,
        supplier_id, supplier_name, work_order_id, batch_reference, inspection_date,
        inspector, sample_size, result, disposition, defects_found, defect_description,
        corrective_action, status, notes, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),NOW())
      RETURNING *
    `, [inspectionNumber, inspectionType||"in-process", planId||null, materialId||null, materialName||null,
        supplierId||null, supplierName||null, workOrderId||null, batchReference||null, inspectionDate||null,
        inspector||null, sampleSize||1, result||"pending", disposition||"pending", defectsFound||0,
        defectDescription||null, correctiveAction||null, status||"pending", notes||null]));
    res.status(201).json(r.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/qc-inspections/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body;
    const r = await db.execute(sql.raw(`
      UPDATE qc_inspections SET
        inspection_type=COALESCE($1,inspection_type), plan_id=COALESCE($2,plan_id),
        material_id=COALESCE($3,material_id), material_name=COALESCE($4,material_name),
        supplier_id=COALESCE($5,supplier_id), supplier_name=COALESCE($6,supplier_name),
        work_order_id=COALESCE($7,work_order_id), batch_reference=COALESCE($8,batch_reference),
        inspection_date=COALESCE($9,inspection_date), inspector=COALESCE($10,inspector),
        sample_size=COALESCE($11,sample_size), result=COALESCE($12,result),
        disposition=COALESCE($13,disposition), defects_found=COALESCE($14,defects_found),
        defect_description=COALESCE($15,defect_description), corrective_action=COALESCE($16,corrective_action),
        status=COALESCE($17,status), notes=COALESCE($18,notes), updated_at=NOW()
      WHERE id=$19 RETURNING *
    `, [b.inspectionType||null, b.planId||null, b.materialId||null, b.materialName||null,
        b.supplierId||null, b.supplierName||null, b.workOrderId||null, b.batchReference||null,
        b.inspectionDate||null, b.inspector||null, b.sampleSize||null, b.result||null,
        b.disposition||null, b.defectsFound!=null?b.defectsFound:null, b.defectDescription||null,
        b.correctiveAction||null, b.status||null, b.notes||null, id]));
    res.json(r.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/qc-inspections/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM inspection_results WHERE inspection_id=$1`, [id]);
    await pool.query(`DELETE FROM quality_certificates WHERE inspection_id=$1`, [id]);
    await pool.query(`DELETE FROM qc_inspections WHERE id=$1`, [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── INSPECTION RESULTS ───────────────────────────────────────────────────────

router.post("/qc-inspections/:id/results", async (req, res) => {
  try {
    const { id } = req.params;
    const { planItemId, measuredValue, result, notes } = req.body;
    const planItem = planItemId
      ? (await pool.query(`SELECT * FROM inspection_plan_items WHERE id=$1`, [planItemId])).rows[0] as any
      : null;

    let autoResult = result;
    if (!autoResult && planItem && measuredValue != null) {
      const v = safeNum(measuredValue);
      const minV = planItem.min_value != null ? safeNum(planItem.min_value) : null;
      const maxV = planItem.max_value != null ? safeNum(planItem.max_value) : null;
      if (minV != null && v < minV) autoResult = "fail";
      else if (maxV != null && v > maxV) autoResult = "fail";
      else autoResult = "pass";
    }

    const r = await db.execute(sql.raw(`
      INSERT INTO inspection_results (inspection_id, plan_item_id, measured_value, result, notes, recorded_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,NOW(),NOW(),NOW()) RETURNING *
    `, [id, planItemId||null, measuredValue||null, autoResult||"pending", notes||null]));

    const allResults = (await pool.query(`SELECT result FROM inspection_results WHERE inspection_id=$1`, [id])).rows as any[];
    if (allResults.length > 0) {
      const hasFail = allResults.some((r: any) => r.result === "fail");
      const allPending = allResults.every((r: any) => r.result === "pending");
      const overallResult = hasFail ? "fail" : allPending ? "pending" : "pass";
      await db.execute(sql.raw(`UPDATE qc_inspections SET result=$1, updated_at=NOW() WHERE id=$2`, [overallResult, id]));
    }

    res.status(201).json(r.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DISPOSITION DECISION ─────────────────────────────────────────────────────

router.post("/qc-inspections/:id/disposition", async (req, res) => {
  try {
    const { id } = req.params;
    const { disposition, notes } = req.body;
    const validDispositions = ["accept", "reject", "quarantine", "rework", "conditional_accept"];
    if (!validDispositions.includes(disposition)) {
      return res.status(400).json({ error: "Invalid disposition" });
    }
    const result = disposition === "accept" ? "pass" : disposition === "conditional_accept" ? "conditional" : "fail";
    const status = ["accept", "conditional_accept"].includes(disposition) ? "passed" : disposition === "quarantine" ? "in_progress" : "failed";
    const r = await db.execute(sql.raw(`
      UPDATE qc_inspections SET disposition=$1, result=$2, status=$3,
        corrective_action=COALESCE($4, corrective_action), updated_at=NOW()
      WHERE id=$5 RETURNING *
    `, [disposition, result, status, notes||null, id]));
    res.json(r.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SPC CONTROL CHARTS ──────────────────────────────────────────────────────

router.get("/spc-charts", async (req, res) => {
  try {
    const { processName, status } = req.query;
    let where = "WHERE 1=1";
    const params: any[] = [];
    let idx = 1;
    if (processName) { where += ` AND process_name ILIKE $${idx++}`; params.push(`%${processName}%`); }
    if (status) { where += ` AND chart_status=$${idx++}`; params.push(status); }
    const rows = (await db.execute(sql.raw(`
      SELECT sc.*,
        COUNT(sm.id) AS measurement_count,
        MAX(sm.recorded_at) AS last_measurement_at
      FROM spc_control_charts sc
      LEFT JOIN spc_measurements sm ON sm.chart_id = sc.id
      ${where}
      GROUP BY sc.id
      ORDER BY sc.created_at DESC
    `, params))).rows;
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/spc-charts/stats", async (_req, res) => {
  try {
    const r = (await db.execute(sql`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN chart_status='in_control' THEN 1 ELSE 0 END) AS in_control,
        SUM(CASE WHEN chart_status='out_of_control' THEN 1 ELSE 0 END) AS out_of_control,
        SUM(CASE WHEN chart_status='warning' THEN 1 ELSE 0 END) AS warning
      FROM spc_control_charts
    `)).rows[0] || {};
    res.json(r);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/spc-charts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = "50" } = req.query;
    const [chart] = (await pool.query(`SELECT * FROM spc_control_charts WHERE id=$1`, [id])).rows;
    if (!chart) return res.status(404).json({ error: "Not found" });
    const measurements = (await pool.query(`
      SELECT * FROM spc_measurements WHERE chart_id=$1
      ORDER BY recorded_at DESC LIMIT $2
    `, [id, parseInt(String(limit))])).rows.reverse();
    const spcStats = computeSpcStats(measurements as any[], chart as any);
    res.json({ ...chart, measurements, ...spcStats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/spc-charts", async (req, res) => {
  try {
    const { processName, parameterName, chartType, ucl, lcl, cl, usl, lsl, target, unit, subgroupSize, notes } = req.body;
    const r = await db.execute(sql.raw(`
      INSERT INTO spc_control_charts (process_name, parameter_name, chart_type, ucl, lcl, cl, usl, lsl, target, unit, subgroup_size, chart_status, notes, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'in_control',$12,NOW(),NOW()) RETURNING *
    `, [processName, parameterName, chartType||"xbar", ucl||null, lcl||null, cl||null, usl||null, lsl||null, target||null, unit||null, subgroupSize||5, notes||null]));
    res.status(201).json(r.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/spc-charts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { processName, parameterName, chartType, ucl, lcl, cl, usl, lsl, target, unit, subgroupSize, chartStatus, notes } = req.body;
    const r = await db.execute(sql.raw(`
      UPDATE spc_control_charts SET
        process_name=COALESCE($1,process_name), parameter_name=COALESCE($2,parameter_name),
        chart_type=COALESCE($3,chart_type), ucl=COALESCE($4,ucl), lcl=COALESCE($5,lcl),
        cl=COALESCE($6,cl), usl=COALESCE($7,usl), lsl=COALESCE($8,lsl), target=COALESCE($9,target),
        unit=COALESCE($10,unit), subgroup_size=COALESCE($11,subgroup_size),
        chart_status=COALESCE($12,chart_status), notes=COALESCE($13,notes), updated_at=NOW()
      WHERE id=$14 RETURNING *
    `, [processName||null, parameterName||null, chartType||null, ucl||null, lcl||null, cl||null,
        usl||null, lsl||null, target||null, unit||null, subgroupSize||null, chartStatus||null, notes||null, id]));
    res.json(r.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/spc-charts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM spc_measurements WHERE chart_id=$1`, [id]);
    await pool.query(`DELETE FROM spc_control_charts WHERE id=$1`, [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SPC MEASUREMENTS ──────────────────────────────────────────────────────────

router.post("/spc-charts/:id/measurements", async (req, res) => {
  try {
    const { id } = req.params;
    const { value, subgroupValues, inspector, notes } = req.body;
    const chart = (await pool.query(`SELECT * FROM spc_control_charts WHERE id=$1`, [id])).rows[0] as any;
    if (!chart) return res.status(404).json({ error: "Chart not found" });

    const numVal = safeNum(value);
    const violations = detectViolations(numVal, chart);

    const r = await db.execute(sql.raw(`
      INSERT INTO spc_measurements (chart_id, value, subgroup_values, inspector, violation_flags, is_out_of_control, notes, recorded_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW(),NOW()) RETURNING *
    `, [id, numVal, subgroupValues ? JSON.stringify(subgroupValues) : null, inspector||null,
        violations.length > 0 ? JSON.stringify(violations) : null, violations.length > 0, notes||null]));

    const newStatus = violations.length > 0 ? "out_of_control" : "in_control";
    await db.execute(sql.raw(`UPDATE spc_control_charts SET chart_status=$1, updated_at=NOW() WHERE id=$2`, [newStatus, id]));

    const allMeasurements = (await pool.query(`
      SELECT * FROM spc_measurements WHERE chart_id=$1 ORDER BY recorded_at DESC LIMIT 100
    `, [id])).rows.reverse();
    const spcStats = computeSpcStats(allMeasurements as any[], chart);

    res.status(201).json({ measurement: r.rows[0], violations, spcStats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── QUALITY CERTIFICATES ──────────────────────────────────────────────────────

router.get("/quality-certificates", async (req, res) => {
  try {
    const { batchId, inspectionId, status } = req.query;
    let where = "WHERE 1=1";
    const params: any[] = [];
    let idx = 1;
    if (batchId) { where += ` AND batch_reference=$${idx++}`; params.push(batchId); }
    if (inspectionId) { where += ` AND inspection_id=$${idx++}`; params.push(inspectionId); }
    if (status) { where += ` AND cert_status=$${idx++}`; params.push(status); }
    const rows = (await db.execute(sql.raw(`SELECT * FROM quality_certificates ${where} ORDER BY issued_at DESC`, params))).rows;
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/quality-certificates/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [cert] = (await pool.query(`SELECT qc.*, qi.batch_reference, qi.inspector, qi.inspection_date, qi.inspection_type
      FROM quality_certificates qc
      LEFT JOIN qc_inspections qi ON qi.id = qc.inspection_id
      WHERE qc.id=$1`, [id])).rows;
    if (!cert) return res.status(404).json({ error: "Not found" });
    const certData = cert as any;
    if (certData.test_results && typeof certData.test_results === "string") {
      try { certData.test_results = JSON.parse(certData.test_results); } catch {}
    }
    res.json(certData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/quality-certificates", async (req, res) => {
  try {
    const {
      inspectionId, certType, batchReference, productName, materialName,
      supplierName, inspectorName, testResults, overallResult, remarks, expiryDate
    } = req.body;

    const counter = (await db.execute(sql`
      INSERT INTO auto_number_counters (entity_type, last_number) VALUES ('quality_cert', 1)
      ON CONFLICT (entity_type) DO UPDATE SET last_number = auto_number_counters.last_number + 1
      RETURNING last_number
    `)).rows[0] as any;
    const certNumber = `CERT-${String(counter.last_number).padStart(5, "0")}`;

    const r = await db.execute(sql.raw(`
      INSERT INTO quality_certificates (
        cert_number, inspection_id, cert_type, batch_reference, product_name, material_name,
        supplier_name, inspector_name, test_results, overall_result, remarks,
        cert_status, issued_at, expiry_date, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'issued',NOW(),$12,NOW(),NOW()) RETURNING *
    `, [certNumber, inspectionId||null, certType||"CoC", batchReference||null, productName||null,
        materialName||null, supplierName||null, inspectorName||null,
        testResults ? JSON.stringify(testResults) : null,
        overallResult||"pass", remarks||null, expiryDate||null]));

    if (inspectionId) {
      await db.execute(sql.raw(`UPDATE qc_inspections SET certificate_id=$1, updated_at=NOW() WHERE id=$2`, [r.rows[0] && (r.rows[0] as any).id, inspectionId]));
    }
    res.status(201).json(r.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/quality-certificates/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { certStatus, remarks, expiryDate } = req.body;
    const r = await db.execute(sql.raw(`
      UPDATE quality_certificates SET
        cert_status=COALESCE($1,cert_status), remarks=COALESCE($2,remarks),
        expiry_date=COALESCE($3,expiry_date), updated_at=NOW()
      WHERE id=$4 RETURNING *
    `, [certStatus||null, remarks||null, expiryDate||null, id]));
    res.json(r.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────────

function detectViolations(value: number, chart: any): string[] {
  const violations: string[] = [];
  const ucl = chart.ucl != null ? safeNum(chart.ucl) : null;
  const lcl = chart.lcl != null ? safeNum(chart.lcl) : null;
  const cl = chart.cl != null ? safeNum(chart.cl) : null;
  if (ucl != null && value > ucl) violations.push("beyond_ucl");
  if (lcl != null && value < lcl) violations.push("beyond_lcl");
  if (cl != null && ucl != null && lcl != null) {
    const sigma = (ucl - lcl) / 6;
    if (sigma > 0) {
      const zScore = Math.abs((value - cl) / sigma);
      if (zScore > 2) violations.push("beyond_2sigma");
    }
  }
  return violations;
}

function computeSpcStats(measurements: any[], chart: any): Record<string, any> {
  if (!measurements || measurements.length === 0) return { cp: null, cpk: null, mean: null, stdDev: null, range: null };
  const values = measurements.map(m => safeNum(m.value)).filter(v => !isNaN(v));
  if (values.length === 0) return { cp: null, cpk: null, mean: null, stdDev: null, range: null };
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / Math.max(n - 1, 1);
  const stdDev = Math.sqrt(variance);
  const rangeVal = Math.max(...values) - Math.min(...values);
  const usl = chart.usl != null ? safeNum(chart.usl) : null;
  const lsl = chart.lsl != null ? safeNum(chart.lsl) : null;
  let cp: number | null = null;
  let cpk: number | null = null;
  if (usl != null && lsl != null && stdDev > 0) {
    cp = (usl - lsl) / (6 * stdDev);
    const cpkUpper = (usl - mean) / (3 * stdDev);
    const cpkLower = (mean - lsl) / (3 * stdDev);
    cpk = Math.min(cpkUpper, cpkLower);
  }
  const outOfControlCount = measurements.filter(m => m.is_out_of_control).length;
  return {
    mean: parseFloat(mean.toFixed(4)),
    stdDev: parseFloat(stdDev.toFixed(4)),
    range: parseFloat(rangeVal.toFixed(4)),
    cp: cp != null ? parseFloat(cp.toFixed(3)) : null,
    cpk: cpk != null ? parseFloat(cpk.toFixed(3)) : null,
    outOfControlCount,
    totalMeasurements: n,
  };
}

export default router;
