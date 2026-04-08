import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();
const IdParam = z.object({ id: z.coerce.number().int().positive() });
function safeRows(result: any) { return result?.rows || []; }

// ========== PACKING LISTS ==========
router.get("/packing-lists", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM packing_lists ORDER BY created_at DESC");
    res.json(safeRows(result));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/packing-lists/stats", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COALESCE(SUM(total_pieces), 0) as total_pieces,
        COALESCE(SUM(crates_count), 0) as total_crates
      FROM packing_lists
    `);
    res.json(r.rows[0] || {});
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/packing-lists", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      INSERT INTO packing_lists (packing_number, project_id, work_order_id,
        customer_name, delivery_address, packing_type, items_json,
        total_pieces, total_weight, total_volume_cbm, crates_count, pallets_count,
        protection_type, special_instructions, assigned_to, estimated_minutes, priority, status, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING *`,
      [b.packingNumber, b.projectId, b.workOrderId,
       b.customerName, b.deliveryAddress, b.packingType,
       b.itemsJson ? JSON.stringify(b.itemsJson) : null,
       b.totalPieces, b.totalWeight, b.totalVolumeCbm, b.cratesCount, b.palletsCount,
       b.protectionType, b.specialInstructions, b.assignedTo, b.estimatedMinutes,
       b.priority || 'normal', b.status || 'pending', b.notes]);
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ message: "מספר אריזה כבר קיים" });
    res.status(400).json({ message: e.message });
  }
});

router.put("/packing-lists/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const b = req.body;
    const r = await pool.query(`
      UPDATE packing_lists SET
        assigned_to=COALESCE($1,assigned_to), status=COALESCE($2,status),
        packed_by=COALESCE($3,packed_by), verified_by=COALESCE($4,verified_by),
        labeling_complete=COALESCE($5,labeling_complete),
        actual_minutes=COALESCE($6,actual_minutes), notes=COALESCE($7,notes),
        packed_at=CASE WHEN $2='completed' THEN NOW() ELSE packed_at END,
        updated_at=NOW()
      WHERE id=$8 RETURNING *`,
      [b.assignedTo, b.status, b.packedBy, b.verifiedBy, b.labelingComplete,
       b.actualMinutes, b.notes, id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Packing list not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/packing-lists/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("DELETE FROM packing_lists WHERE id=$1 RETURNING *", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// ========== TRANSPORT ORDERS ==========
router.get("/transport-orders", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM transport_orders ORDER BY scheduled_date DESC NULLS LAST, created_at DESC");
    res.json(safeRows(result));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/transport-orders/stats", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
        COUNT(*) FILTER (WHERE status = 'in_transit') as in_transit,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE damage_report IS NOT NULL AND damage_report != '') as with_damage,
        COALESCE(SUM(transport_cost), 0) as total_cost
      FROM transport_orders
    `);
    res.json(r.rows[0] || {});
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/transport-orders", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      INSERT INTO transport_orders (transport_number, project_id, packing_list_id,
        customer_name, pickup_address, delivery_address, delivery_floor,
        has_crane_access, has_elevator_access, site_contact_name, site_contact_phone,
        vehicle_type, vehicle_number, driver_name, driver_phone,
        total_weight, total_pieces, requires_crane,
        scheduled_date, scheduled_time, transport_cost, assigned_to, priority, status, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
      RETURNING *`,
      [b.transportNumber, b.projectId, b.packingListId,
       b.customerName, b.pickupAddress, b.deliveryAddress, b.deliveryFloor,
       b.hasCraneAccess, b.hasElevatorAccess, b.siteContactName, b.siteContactPhone,
       b.vehicleType, b.vehicleNumber, b.driverName, b.driverPhone,
       b.totalWeight, b.totalPieces, b.requiresCrane,
       b.scheduledDate, b.scheduledTime, b.transportCost, b.assignedTo,
       b.priority || 'normal', b.status || 'scheduled', b.notes]);
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ message: "מספר הובלה כבר קיים" });
    res.status(400).json({ message: e.message });
  }
});

router.put("/transport-orders/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const b = req.body;
    const r = await pool.query(`
      UPDATE transport_orders SET
        driver_name=COALESCE($1,driver_name), vehicle_number=COALESCE($2,vehicle_number),
        status=COALESCE($3,status), damage_report=COALESCE($4,damage_report),
        delivery_confirmed_by=COALESCE($5,delivery_confirmed_by),
        notes=COALESCE($6,notes),
        actual_delivery_at=CASE WHEN $3='delivered' THEN NOW() ELSE actual_delivery_at END,
        updated_at=NOW()
      WHERE id=$7 RETURNING *`,
      [b.driverName, b.vehicleNumber, b.status, b.damageReport,
       b.deliveryConfirmedBy, b.notes, id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Transport order not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/transport-orders/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("DELETE FROM transport_orders WHERE id=$1 RETURNING *", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// ========== INSTALLATION ORDERS ==========
router.get("/installation-orders", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM installation_orders ORDER BY scheduled_start_date DESC NULLS LAST, created_at DESC");
    res.json(safeRows(result));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/installation-orders/stats", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE customer_signoff = true) as signed_off,
        COALESCE(SUM(total_units), 0) as total_units,
        COALESCE(SUM(total_cost), 0) as total_cost
      FROM installation_orders
    `);
    res.json(r.rows[0] || {});
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/installation-orders", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      INSERT INTO installation_orders (installation_number, project_id, transport_order_id,
        customer_name, site_address, site_contact_name, site_contact_phone,
        installation_type, items_json, total_units,
        team_leader, team_members, team_size,
        scheduled_start_date, scheduled_end_date, estimated_hours,
        anchor_type, sealant_type, insulation_required, flashing_required,
        removal_of_old, site_conditions, safety_requirements,
        scaffolding_required, crane_required, permits_required,
        priority, status, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
      RETURNING *`,
      [b.installationNumber, b.projectId, b.transportOrderId,
       b.customerName, b.siteAddress, b.siteContactName, b.siteContactPhone,
       b.installationType, b.itemsJson ? JSON.stringify(b.itemsJson) : null, b.totalUnits,
       b.teamLeader, b.teamMembers, b.teamSize,
       b.scheduledStartDate, b.scheduledEndDate, b.estimatedHours,
       b.anchorType, b.sealantType, b.insulationRequired, b.flashingRequired,
       b.removalOfOld, b.siteConditions, b.safetyRequirements,
       b.scaffoldingRequired, b.craneRequired, b.permitsRequired,
       b.priority || 'normal', b.status || 'scheduled', b.notes]);
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ message: "מספר התקנה כבר קיים" });
    res.status(400).json({ message: e.message });
  }
});

router.put("/installation-orders/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const b = req.body;
    const r = await pool.query(`
      UPDATE installation_orders SET
        team_leader=COALESCE($1,team_leader), status=COALESCE($2,status),
        actual_hours=COALESCE($3,actual_hours),
        customer_signoff=COALESCE($4,customer_signoff),
        punch_list_json=COALESCE($5::jsonb,punch_list_json),
        labor_cost=COALESCE($6,labor_cost), materials_cost=COALESCE($7,materials_cost),
        total_cost=COALESCE($8,total_cost), notes=COALESCE($9,notes),
        actual_start_date=CASE WHEN $2='in_progress' AND actual_start_date IS NULL THEN CURRENT_DATE ELSE actual_start_date END,
        actual_end_date=CASE WHEN $2='completed' THEN CURRENT_DATE ELSE actual_end_date END,
        signoff_date=CASE WHEN $4=true THEN CURRENT_DATE ELSE signoff_date END,
        updated_at=NOW()
      WHERE id=$10 RETURNING *`,
      [b.teamLeader, b.status, b.actualHours,
       b.customerSignoff, b.punchListJson ? JSON.stringify(b.punchListJson) : null,
       b.laborCost, b.materialsCost, b.totalCost, b.notes, id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Installation order not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/installation-orders/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("DELETE FROM installation_orders WHERE id=$1 RETURNING *", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// ========== SERVICE TICKETS ==========
router.get("/service-tickets", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM service_tickets ORDER BY created_at DESC");
    res.json(safeRows(result));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/service-tickets/stats", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'new') as new_count,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
        COUNT(*) FILTER (WHERE status = 'closed') as closed,
        COUNT(*) FILTER (WHERE warranty_status = 'valid') as under_warranty,
        COUNT(*) FILTER (WHERE urgency = 'urgent') as urgent_count,
        COALESCE(AVG(customer_satisfaction) FILTER (WHERE customer_satisfaction IS NOT NULL), 0) as avg_satisfaction,
        COALESCE(SUM(total_cost), 0) as total_cost
      FROM service_tickets
    `);
    res.json(r.rows[0] || {});
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/service-tickets", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      INSERT INTO service_tickets (ticket_number, project_id, installation_order_id,
        customer_name, customer_phone, customer_email, site_address,
        category, urgency, issue_type, issue_description,
        product_type, product_serial, warranty_status, warranty_expiry,
        technician_name, scheduled_date, estimated_hours, billable,
        priority, status, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      RETURNING *`,
      [b.ticketNumber, b.projectId, b.installationOrderId,
       b.customerName, b.customerPhone, b.customerEmail, b.siteAddress,
       b.category, b.urgency, b.issueType, b.issueDescription,
       b.productType, b.productSerial, b.warrantyStatus, b.warrantyExpiry,
       b.technicianName, b.scheduledDate, b.estimatedHours, b.billable,
       b.priority || 'normal', b.status || 'new', b.notes]);
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ message: "מספר קריאת שירות כבר קיים" });
    res.status(400).json({ message: e.message });
  }
});

router.put("/service-tickets/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const b = req.body;
    const r = await pool.query(`
      UPDATE service_tickets SET
        technician_name=COALESCE($1,technician_name), status=COALESCE($2,status),
        diagnosis_notes=COALESCE($3,diagnosis_notes), resolution_notes=COALESCE($4,resolution_notes),
        actual_hours=COALESCE($5,actual_hours), parts_cost=COALESCE($6,parts_cost),
        labor_cost=COALESCE($7,labor_cost), total_cost=COALESCE($8,total_cost),
        customer_satisfaction=COALESCE($9,customer_satisfaction),
        follow_up_required=COALESCE($10,follow_up_required), follow_up_date=$11,
        notes=COALESCE($12,notes),
        visited_at=CASE WHEN $2='in_progress' AND visited_at IS NULL THEN NOW() ELSE visited_at END,
        resolved_at=CASE WHEN $2='resolved' THEN NOW() ELSE resolved_at END,
        updated_at=NOW()
      WHERE id=$13 RETURNING *`,
      [b.technicianName, b.status, b.diagnosisNotes, b.resolutionNotes,
       b.actualHours, b.partsCost, b.laborCost, b.totalCost,
       b.customerSatisfaction, b.followUpRequired, b.followUpDate, b.notes, id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Service ticket not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/service-tickets/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("DELETE FROM service_tickets WHERE id=$1 RETURNING *", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// ========== PROJECT WORKFLOW STAGES ==========
router.get("/project-workflow/:projectId", async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) return res.status(400).json({ message: "Invalid project ID" });
    const result = await pool.query("SELECT * FROM project_workflow_stages WHERE project_id = $1 ORDER BY stage_order", [projectId]);
    res.json(safeRows(result));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/project-workflow/init/:projectId", async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) return res.status(400).json({ message: "Invalid project ID" });

    const existing = await pool.query("SELECT id FROM project_workflow_stages WHERE project_id = $1 LIMIT 1", [projectId]);
    if (existing.rows.length > 0) return res.status(409).json({ message: "Workflow already initialized" });

    const stages = [
      { name: "ליד", order: 1 },
      { name: "הצעת מחיר", order: 2 },
      { name: "פרויקט", order: 3 },
      { name: "מדידות", order: 4 },
      { name: "הנדסה", order: 5 },
      { name: "BOM", order: 6 },
      { name: "רכש", order: 7 },
      { name: "הקצאת מלאי", order: 8 },
      { name: "ייצור", order: 9 },
      { name: "בקרת איכות", order: 10 },
      { name: "אריזה", order: 11 },
      { name: "משלוח", order: 12 },
      { name: "התקנה", order: 13 },
      { name: "מסירה", order: 14 },
      { name: "שירות", order: 15 },
      { name: "מעקב תשלומים", order: 16 },
      { name: "ניתוח רווחיות", order: 17 },
    ];

    const values = stages.map(s => `(${projectId}, '${s.name}', ${s.order}, 'pending')`).join(",");
    await pool.query(`INSERT INTO project_workflow_stages (project_id, stage_name, stage_order, status) VALUES ${values}`);

    const result = await pool.query("SELECT * FROM project_workflow_stages WHERE project_id = $1 ORDER BY stage_order", [projectId]);
    res.status(201).json(safeRows(result));
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.put("/project-workflow/stage/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const b = req.body;
    const r = await pool.query(`
      UPDATE project_workflow_stages SET
        status=COALESCE($1,status), assigned_to=COALESCE($2,assigned_to),
        completion_percent=COALESCE($3,completion_percent), notes=COALESCE($4,notes),
        started_at=CASE WHEN $1='in_progress' AND started_at IS NULL THEN NOW() ELSE started_at END,
        completed_at=CASE WHEN $1='completed' THEN NOW() ELSE completed_at END,
        due_date=$5,
        updated_at=NOW()
      WHERE id=$6 RETURNING *`,
      [b.status, b.assignedTo, b.completionPercent, b.notes, b.dueDate, id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Stage not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// ========== LOGISTICS DASHBOARD ==========
router.get("/fabrication-logistics/dashboard", async (_req, res) => {
  try {
    const [packing, transport, installation, service] = await Promise.all([
      pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='in_progress') as active, COUNT(*) FILTER (WHERE status='pending') as pending FROM packing_lists"),
      pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='in_transit') as active, COUNT(*) FILTER (WHERE status='scheduled') as pending FROM transport_orders"),
      pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='in_progress') as active, COUNT(*) FILTER (WHERE status='scheduled') as pending FROM installation_orders"),
      pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status IN ('new','in_progress')) as active, COUNT(*) FILTER (WHERE urgency='urgent') as urgent FROM service_tickets"),
    ]);
    res.json({
      packing: packing.rows[0],
      transport: transport.rows[0],
      installation: installation.rows[0],
      service: service.rows[0],
    });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

export default router;
