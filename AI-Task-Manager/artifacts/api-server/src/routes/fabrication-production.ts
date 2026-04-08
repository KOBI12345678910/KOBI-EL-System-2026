import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();
const IdParam = z.object({ id: z.coerce.number().int().positive() });
function safeRows(result: any) { return result?.rows || []; }

const TABLES = {
  cutting: { table: "cutting_lists", numberCol: "cutting_number", label: "חיתוך" },
  assembly: { table: "assembly_orders", numberCol: "assembly_number", label: "הרכבה" },
  welding: { table: "welding_orders", numberCol: "welding_number", label: "ריתוך" },
  coating: { table: "coating_orders", numberCol: "coating_number", label: "ציפוי" },
  glazing: { table: "glazing_orders", numberCol: "glazing_number", label: "זיגוג" },
};

// ========== CUTTING LISTS ==========
router.get("/cutting-lists", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM cutting_lists ORDER BY created_at DESC");
    res.json(safeRows(result));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/cutting-lists/stats", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COALESCE(SUM(quantity), 0) as total_pieces,
        COALESCE(AVG(waste_percent), 0) as avg_waste_percent
      FROM cutting_lists
    `);
    res.json(r.rows[0] || {});
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/cutting-lists", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      INSERT INTO cutting_lists (cutting_number, project_id, work_order_id,
        product_name, profile_id, profile_number, profile_name,
        material, raw_length_mm, cut_length_mm, angle_degrees_1, angle_degrees_2,
        quantity, position, part_label, machining_operations,
        drill_holes, notches, optimization_group, machine_id, operator_name, status, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      RETURNING *`,
      [b.cuttingNumber, b.projectId, b.workOrderId,
       b.productName, b.profileId, b.profileNumber, b.profileName,
       b.material, b.rawLengthMm, b.cutLengthMm, b.angleDegrees1, b.angleDegrees2,
       b.quantity, b.position, b.partLabel, b.machiningOperations,
       b.drillHoles ? JSON.stringify(b.drillHoles) : null,
       b.notches ? JSON.stringify(b.notches) : null,
       b.optimizationGroup, b.machineId, b.operatorName, b.status || 'pending', b.notes]);
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ message: "מספר חיתוך כבר קיים" });
    res.status(400).json({ message: e.message });
  }
});

router.put("/cutting-lists/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const b = req.body;
    const r = await pool.query(`
      UPDATE cutting_lists SET
        cut_length_mm=COALESCE($1,cut_length_mm), quantity=COALESCE($2,quantity),
        operator_name=COALESCE($3,operator_name), status=COALESCE($4,status),
        notes=COALESCE($5,notes), cut_at=CASE WHEN $4='completed' THEN NOW() ELSE cut_at END,
        updated_at=NOW()
      WHERE id=$6 RETURNING *`,
      [b.cutLengthMm, b.quantity, b.operatorName, b.status, b.notes, id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Cutting list not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/cutting-lists/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("DELETE FROM cutting_lists WHERE id=$1 RETURNING *", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// ========== ASSEMBLY ORDERS ==========
router.get("/assembly-orders", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM assembly_orders ORDER BY created_at DESC");
    res.json(safeRows(result));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/assembly-orders/stats", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COALESCE(AVG(actual_minutes) FILTER (WHERE actual_minutes IS NOT NULL), 0) as avg_minutes
      FROM assembly_orders
    `);
    res.json(r.rows[0] || {});
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/assembly-orders", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      INSERT INTO assembly_orders (assembly_number, project_id, work_order_id,
        product_name, product_type, system_id, system_name,
        width_mm, height_mm, opening_type, opening_direction, panels_count,
        frame_color, finish_id, hardware_set_id, glass_id, seal_type, gasket_type,
        thermal_break, components_json, assembly_steps, assembly_station,
        assigned_to, estimated_minutes, priority, status, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
      RETURNING *`,
      [b.assemblyNumber, b.projectId, b.workOrderId,
       b.productName, b.productType, b.systemId, b.systemName,
       b.widthMm, b.heightMm, b.openingType, b.openingDirection, b.panelsCount,
       b.frameColor, b.finishId, b.hardwareSetId, b.glassId, b.sealType, b.gasketType,
       b.thermalBreak, b.componentsJson ? JSON.stringify(b.componentsJson) : null,
       b.assemblySteps ? JSON.stringify(b.assemblySteps) : null, b.assemblyStation,
       b.assignedTo, b.estimatedMinutes, b.priority || 'normal', b.status || 'pending', b.notes]);
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ message: "מספר הרכבה כבר קיים" });
    res.status(400).json({ message: e.message });
  }
});

router.put("/assembly-orders/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const b = req.body;
    const r = await pool.query(`
      UPDATE assembly_orders SET
        assigned_to=COALESCE($1,assigned_to), status=COALESCE($2,status),
        actual_minutes=COALESCE($3,actual_minutes), qc_result=COALESCE($4,qc_result),
        qc_notes=COALESCE($5,qc_notes), notes=COALESCE($6,notes),
        started_at=CASE WHEN $2='in_progress' AND started_at IS NULL THEN NOW() ELSE started_at END,
        completed_at=CASE WHEN $2='completed' THEN NOW() ELSE completed_at END,
        updated_at=NOW()
      WHERE id=$7 RETURNING *`,
      [b.assignedTo, b.status, b.actualMinutes, b.qcResult, b.qcNotes, b.notes, id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Assembly order not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/assembly-orders/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("DELETE FROM assembly_orders WHERE id=$1 RETURNING *", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// ========== WELDING ORDERS ==========
router.get("/welding-orders", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM welding_orders ORDER BY created_at DESC");
    res.json(safeRows(result));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/welding-orders/stats", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(DISTINCT weld_type) as weld_type_count
      FROM welding_orders
    `);
    res.json(r.rows[0] || {});
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/welding-orders", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      INSERT INTO welding_orders (welding_number, project_id, work_order_id, assembly_order_id,
        product_name, material, weld_type, joint_type, weld_position,
        filler_material, shielding_gas, weld_length_mm, throat_thickness_mm,
        wps_number, welder_cert_number, assigned_to, machine_id,
        estimated_minutes, inspection_type, priority, status, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      RETURNING *`,
      [b.weldingNumber, b.projectId, b.workOrderId, b.assemblyOrderId,
       b.productName, b.material, b.weldType, b.jointType, b.weldPosition,
       b.fillerMaterial, b.shieldingGas, b.weldLengthMm, b.throatThicknessMm,
       b.wpsNumber, b.welderCertNumber, b.assignedTo, b.machineId,
       b.estimatedMinutes, b.inspectionType, b.priority || 'normal', b.status || 'pending', b.notes]);
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ message: "מספר ריתוך כבר קיים" });
    res.status(400).json({ message: e.message });
  }
});

router.put("/welding-orders/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const b = req.body;
    const r = await pool.query(`
      UPDATE welding_orders SET
        assigned_to=COALESCE($1,assigned_to), status=COALESCE($2,status),
        actual_minutes=COALESCE($3,actual_minutes), inspection_result=COALESCE($4,inspection_result),
        notes=COALESCE($5,notes),
        started_at=CASE WHEN $2='in_progress' AND started_at IS NULL THEN NOW() ELSE started_at END,
        completed_at=CASE WHEN $2='completed' THEN NOW() ELSE completed_at END,
        updated_at=NOW()
      WHERE id=$6 RETURNING *`,
      [b.assignedTo, b.status, b.actualMinutes, b.inspectionResult, b.notes, id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Welding order not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/welding-orders/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("DELETE FROM welding_orders WHERE id=$1 RETURNING *", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// ========== COATING ORDERS ==========
router.get("/coating-orders", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM coating_orders ORDER BY created_at DESC");
    res.json(safeRows(result));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/coating-orders/stats", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status IN ('in_progress','sent')) as in_progress,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE is_external = true) as external_count,
        COALESCE(SUM(total_area_sqm), 0) as total_area_sqm
      FROM coating_orders
    `);
    res.json(r.rows[0] || {});
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/coating-orders", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      INSERT INTO coating_orders (coating_number, project_id, work_order_id,
        coating_type, finish_id, color_id, color_code, color_name,
        surface, pretreatment, primer_required, coats_required,
        thickness_microns, cure_temperature_c, cure_time_minutes,
        total_area_sqm, pieces_count, batch_number,
        assigned_to, estimated_minutes, is_external, external_supplier, external_cost,
        priority, status, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
      RETURNING *`,
      [b.coatingNumber, b.projectId, b.workOrderId,
       b.coatingType, b.finishId, b.colorId, b.colorCode, b.colorName,
       b.surface, b.pretreatment, b.primerRequired, b.coatsRequired,
       b.thicknessMicrons, b.cureTemperatureC, b.cureTimeMinutes,
       b.totalAreaSqm, b.piecesCount, b.batchNumber,
       b.assignedTo, b.estimatedMinutes, b.isExternal, b.externalSupplier, b.externalCost,
       b.priority || 'normal', b.status || 'pending', b.notes]);
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ message: "מספר ציפוי כבר קיים" });
    res.status(400).json({ message: e.message });
  }
});

router.put("/coating-orders/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const b = req.body;
    const r = await pool.query(`
      UPDATE coating_orders SET
        assigned_to=COALESCE($1,assigned_to), status=COALESCE($2,status),
        actual_minutes=COALESCE($3,actual_minutes), quality_check=COALESCE($4,quality_check),
        adhesion_test=COALESCE($5,adhesion_test), thickness_test=COALESCE($6,thickness_test),
        notes=COALESCE($7,notes),
        sent_at=CASE WHEN $2='sent' THEN NOW() ELSE sent_at END,
        received_at=CASE WHEN $2='completed' THEN NOW() ELSE received_at END,
        updated_at=NOW()
      WHERE id=$8 RETURNING *`,
      [b.assignedTo, b.status, b.actualMinutes, b.qualityCheck,
       b.adhesionTest, b.thicknessTest, b.notes, id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Coating order not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/coating-orders/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("DELETE FROM coating_orders WHERE id=$1 RETURNING *", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// ========== GLAZING ORDERS ==========
router.get("/glazing-orders", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM glazing_orders ORDER BY created_at DESC");
    res.json(safeRows(result));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/glazing-orders/stats", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COALESCE(SUM(area_sqm * quantity), 0) as total_area_sqm
      FROM glazing_orders
    `);
    res.json(r.rows[0] || {});
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/glazing-orders", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      INSERT INTO glazing_orders (glazing_number, project_id, work_order_id, assembly_order_id,
        glass_id, glass_code, glass_type, width_mm, height_mm, area_sqm, quantity,
        edge_work, spacer_type, sealant_type, glazing_method,
        glazing_beads_required, setting_blocks_required,
        assigned_to, glazing_station, estimated_minutes, priority, status, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      RETURNING *`,
      [b.glazingNumber, b.projectId, b.workOrderId, b.assemblyOrderId,
       b.glassId, b.glassCode, b.glassType, b.widthMm, b.heightMm, b.areaSqm, b.quantity,
       b.edgeWork, b.spacerType, b.sealantType, b.glazingMethod,
       b.glazingBeadsRequired, b.settingBlocksRequired,
       b.assignedTo, b.glazingStation, b.estimatedMinutes,
       b.priority || 'normal', b.status || 'pending', b.notes]);
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ message: "מספר זיגוג כבר קיים" });
    res.status(400).json({ message: e.message });
  }
});

router.put("/glazing-orders/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const b = req.body;
    const r = await pool.query(`
      UPDATE glazing_orders SET
        assigned_to=COALESCE($1,assigned_to), status=COALESCE($2,status),
        actual_minutes=COALESCE($3,actual_minutes), qc_result=COALESCE($4,qc_result),
        notes=COALESCE($5,notes),
        started_at=CASE WHEN $2='in_progress' AND started_at IS NULL THEN NOW() ELSE started_at END,
        completed_at=CASE WHEN $2='completed' THEN NOW() ELSE completed_at END,
        updated_at=NOW()
      WHERE id=$6 RETURNING *`,
      [b.assignedTo, b.status, b.actualMinutes, b.qcResult, b.notes, id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Glazing order not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/glazing-orders/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("DELETE FROM glazing_orders WHERE id=$1 RETURNING *", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// ========== PRODUCTION DASHBOARD ==========
router.get("/fabrication-production/dashboard", async (_req, res) => {
  try {
    const [cutting, assembly, welding, coating, glazing] = await Promise.all([
      pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='in_progress') as active, COUNT(*) FILTER (WHERE status='pending') as pending FROM cutting_lists"),
      pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='in_progress') as active, COUNT(*) FILTER (WHERE status='pending') as pending FROM assembly_orders"),
      pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='in_progress') as active, COUNT(*) FILTER (WHERE status='pending') as pending FROM welding_orders"),
      pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status IN ('in_progress','sent')) as active, COUNT(*) FILTER (WHERE status='pending') as pending FROM coating_orders"),
      pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='in_progress') as active, COUNT(*) FILTER (WHERE status='pending') as pending FROM glazing_orders"),
    ]);
    res.json({
      cutting: cutting.rows[0],
      assembly: assembly.rows[0],
      welding: welding.rows[0],
      coating: coating.rows[0],
      glazing: glazing.rows[0],
    });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

export default router;
