import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/field-measurements", async (req, res) => {
  try {
    const status = req.query.status as string;
    const category = req.query.category as string;
    let query = `SELECT * FROM field_measurements`;
    const conditions: string[] = [];
    const params: any[] = [];
    if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
    if (category) { params.push(category); conditions.push(`category = $${params.length}`); }
    if (conditions.length) query += ` WHERE ${conditions.join(' AND ')}`;
    query += ` ORDER BY measurement_date DESC, id DESC`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) { console.error("field-measurements error:", e.message); res.status(500).json({ error: "Failed to load measurements" }); }
});

router.get("/field-measurements/stats", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status='planned') as planned,
      COUNT(*) FILTER (WHERE status='in_progress') as in_progress,
      COUNT(*) FILTER (WHERE status='completed') as completed,
      COUNT(*) FILTER (WHERE approval_status='approved') as approved,
      COUNT(*) FILTER (WHERE approval_status='pending') as pending_approval,
      COUNT(DISTINCT project_name) as projects,
      COUNT(DISTINCT measured_by) as measurers
    FROM field_measurements`);
    res.json(rows[0] || {});
  } catch (e: any) { console.error("field-measurements/stats error:", e.message); res.status(500).json({ error: "Failed to load stats" }); }
});

router.get("/field-measurements/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM field_measurements WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: "Failed to load measurement" }); }
});

router.post("/field-measurements", async (req, res) => {
  try {
    const d = req.body;
    const numRes = await pool.query(`SELECT COUNT(*) as c FROM field_measurements`);
    const num = `FM-2026-${String(Number(numRes.rows[0].c) + 1).padStart(3, '0')}`;
    const { rows } = await pool.query(
      `INSERT INTO field_measurements (measurement_number, project_name, project_id, customer_name, site_address,
        measured_by, measurement_date, status, category, floor, room, opening_type,
        width_mm, height_mm, depth_mm, sill_height_mm, wall_material, glass_type,
        frame_color, opening_direction, handle_side, mosquito_net, shutter_type, notes, approval_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) RETURNING *`,
      [num, d.project_name, d.project_id, d.customer_name, d.site_address,
       d.measured_by, d.measurement_date || new Date().toISOString().split('T')[0],
       d.status || 'planned', d.category || 'windows', d.floor, d.room, d.opening_type || 'window',
       d.width_mm, d.height_mm, d.depth_mm, d.sill_height_mm, d.wall_material, d.glass_type,
       d.frame_color, d.opening_direction, d.handle_side, d.mosquito_net || false,
       d.shutter_type, d.notes, d.approval_status || 'pending']
    );
    res.status(201).json(rows[0]);
  } catch (e: any) { console.error("field-measurements POST error:", e.message); res.status(400).json({ error: "Failed to create measurement" }); }
});

router.put("/field-measurements/:id", async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(
      `UPDATE field_measurements SET
        project_name=COALESCE($1,project_name), customer_name=COALESCE($2,customer_name),
        site_address=COALESCE($3,site_address), measured_by=COALESCE($4,measured_by),
        measurement_date=COALESCE($5,measurement_date), status=COALESCE($6,status),
        category=COALESCE($7,category), floor=COALESCE($8,floor), room=COALESCE($9,room),
        opening_type=COALESCE($10,opening_type), width_mm=COALESCE($11,width_mm),
        height_mm=COALESCE($12,height_mm), depth_mm=COALESCE($13,depth_mm),
        sill_height_mm=COALESCE($14,sill_height_mm), wall_material=COALESCE($15,wall_material),
        glass_type=COALESCE($16,glass_type), frame_color=COALESCE($17,frame_color),
        opening_direction=COALESCE($18,opening_direction), handle_side=COALESCE($19,handle_side),
        mosquito_net=COALESCE($20,mosquito_net), shutter_type=COALESCE($21,shutter_type),
        notes=COALESCE($22,notes), approval_status=COALESCE($23,approval_status),
        updated_at=NOW()
       WHERE id=$24 RETURNING *`,
      [d.project_name, d.customer_name, d.site_address, d.measured_by,
       d.measurement_date, d.status, d.category, d.floor, d.room,
       d.opening_type, d.width_mm, d.height_mm, d.depth_mm, d.sill_height_mm,
       d.wall_material, d.glass_type, d.frame_color, d.opening_direction,
       d.handle_side, d.mosquito_net, d.shutter_type, d.notes, d.approval_status,
       req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { console.error("field-measurements PUT error:", e.message); res.status(400).json({ error: "Failed to update measurement" }); }
});

router.delete("/field-measurements/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM field_measurements WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: "Failed to delete measurement" }); }
});

export default router;
