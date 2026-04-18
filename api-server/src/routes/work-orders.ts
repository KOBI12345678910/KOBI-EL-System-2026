import { Router } from "express";
import { pool } from "@workspace/db";
import QRCode from "qrcode";

const router = Router();

const WORK_ORDER_STATUSES = ["pending", "in_production", "quality_check", "ready", "delivered"];

// GET work orders with pagination
router.get("/", async (req, res) => {
  try {
    const { status, page = "1", limit = "50" } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    let query = "SELECT * FROM production_work_orders WHERE deleted_at IS NULL";
    const params: any[] = [];

    if (status && WORK_ORDER_STATUSES.includes(status as string)) {
      query += " AND status = $" + (params.length + 1);
      params.push(status);
    }

    query += " ORDER BY created_at DESC LIMIT $" + (params.length + 1) + " OFFSET $" + (params.length + 2);
    params.push(parseInt(limit as string), offset);

    const result = await pool.query(query, params);
    res.json({
      success: true,
      data: result.rows,
      pagination: { page: parseInt(page as string), limit: parseInt(limit as string) },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET work order by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "SELECT * FROM production_work_orders WHERE id = $1 AND deleted_at IS NULL",
      [parseInt(id)]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: "Work order not found" });
    }

    const workOrder = result.rows[0];

    const [assignments, photos, qrCode] = await Promise.all([
      pool.query("SELECT * FROM work_order_assignments WHERE work_order_id = $1", [parseInt(id)]),
      pool.query("SELECT * FROM work_order_photos WHERE work_order_id = $1 ORDER BY uploaded_at DESC", [
        parseInt(id),
      ]),
      pool.query("SELECT * FROM work_order_qr_codes WHERE work_order_id = $1", [parseInt(id)]),
    ]);

    res.json({
      success: true,
      data: {
        ...workOrder,
        assignments: assignments.rows,
        photos: photos.rows,
        qrCode: qrCode.rows[0],
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// CREATE work order
router.post("/", async (req, res) => {
  try {
    const {
      orderNumber,
      productName,
      quantityPlanned,
      plannedStart,
      plannedEnd,
      status = "pending",
      customerId,
      priority = "medium",
      workOrderType = "standard",
    } = req.body;

    if (!orderNumber || !productName || !quantityPlanned) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const result = await pool.query(
      `INSERT INTO production_work_orders 
       (order_number, product_name, quantity_planned, planned_start, planned_end, status, customer_id, priority, work_order_type, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       RETURNING *`,
      [
        orderNumber,
        productName,
        quantityPlanned,
        plannedStart || null,
        plannedEnd || null,
        WORK_ORDER_STATUSES.includes(status) ? status : "pending",
        customerId || null,
        priority,
        workOrderType,
        req.body.userId || "system",
      ]
    );

    const newWorkOrder = result.rows[0];

    // Generate QR code
    const apiUrl = process.env.VITE_API_URL || process.env.API_URL || "http://localhost:8080";
    const qrCodeData = `${apiUrl}/work-orders/${newWorkOrder.id}`;
    const qrCodeImage = await QRCode.toDataURL(qrCodeData);

    await pool.query(
      `INSERT INTO work_order_qr_codes (work_order_id, qr_code, qr_url, generated_at, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW(), NOW())`,
      [newWorkOrder.id, qrCodeImage, qrCodeData]
    );

    res.status(201).json({
      success: true,
      data: newWorkOrder,
      message: "Work order created successfully",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// UPDATE work order status
router.put("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!WORK_ORDER_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${WORK_ORDER_STATUSES.join(", ")}`,
      });
    }

    const result = await pool.query(
      "UPDATE production_work_orders SET status = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING *",
      [status, parseInt(id)]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: "Work order not found" });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: `Work order status updated to ${status}`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// UPLOAD photos (before/after/in-progress)
router.post("/:id/photos", async (req, res) => {
  try {
    const { id } = req.params;
    const { photoUrl, photoType = "in-progress", description } = req.body;

    if (!photoUrl) {
      return res.status(400).json({ success: false, error: "Photo URL is required" });
    }

    if (!["before", "after", "in-progress"].includes(photoType)) {
      return res.status(400).json({
        success: false,
        error: "Photo type must be: before, after, or in-progress",
      });
    }

    // Verify work order exists
    const workOrderCheck = await pool.query("SELECT id FROM production_work_orders WHERE id = $1", [
      parseInt(id),
    ]);
    if (!workOrderCheck.rows.length) {
      return res.status(404).json({ success: false, error: "Work order not found" });
    }

    const result = await pool.query(
      `INSERT INTO work_order_photos (work_order_id, photo_url, photo_type, description, uploaded_by, uploaded_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW())
       RETURNING *`,
      [parseInt(id), photoUrl, photoType, description || null, req.body.userId || 1]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "Photo uploaded successfully",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ASSIGN employees to work order
router.post("/:id/assignments", async (req, res) => {
  try {
    const { id } = req.params;
    const { employeeId, role = "worker", estimatedHours } = req.body;

    if (!employeeId) {
      return res.status(400).json({ success: false, error: "Employee ID is required" });
    }

    const result = await pool.query(
      `INSERT INTO work_order_assignments (work_order_id, employee_id, role, estimated_hours, status, assigned_by, assigned_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW())
       RETURNING *`,
      [
        parseInt(id),
        parseInt(employeeId),
        role,
        estimatedHours ? parseFloat(estimatedHours) : null,
        "assigned",
        req.body.userId || 1,
      ]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "Employee assigned successfully",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// LOG time for assignment
router.put("/assignments/:assignmentId/time", async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { actualHours, status = "in_progress" } = req.body;

    if (!actualHours) {
      return res.status(400).json({ success: false, error: "Actual hours is required" });
    }

    const result = await pool.query(
      `UPDATE work_order_assignments 
       SET actual_hours = $1, status = $2, started_at = CASE WHEN $2 = 'in_progress' THEN NOW() ELSE started_at END,
           completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE completed_at END, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [parseFloat(actualHours), status, parseInt(assignmentId)]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: "Assignment not found" });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: "Time logged successfully",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET work order templates
router.get("/templates/list", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM work_order_templates WHERE is_active = 1 ORDER BY name"
    );
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// CREATE work order from template
router.post("/from-template/:templateId", async (req, res) => {
  try {
    const { templateId } = req.params;
    const { orderNumber, productName, quantityPlanned, customerId } = req.body;

    const templateResult = await pool.query("SELECT * FROM work_order_templates WHERE id = $1", [
      parseInt(templateId),
    ]);
    if (!templateResult.rows.length) {
      return res.status(404).json({ success: false, error: "Template not found" });
    }

    const template = templateResult.rows[0];

    const result = await pool.query(
      `INSERT INTO production_work_orders 
       (order_number, product_name, quantity_planned, status, customer_id, priority, department, work_instructions, safety_requirements, tooling_required, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
       RETURNING *`,
      [
        orderNumber,
        productName,
        quantityPlanned || "1",
        template.default_status || "pending",
        customerId || null,
        template.priority || "medium",
        template.department,
        template.work_instructions,
        template.safety_requirements,
        template.tooling_required,
        req.body.userId || "system",
      ]
    );

    const newWorkOrder = result.rows[0];

    // Generate QR code
    const apiUrl = process.env.VITE_API_URL || process.env.API_URL || "http://localhost:8080";
    const qrCodeData = `${apiUrl}/work-orders/${newWorkOrder.id}`;
    const qrCodeImage = await QRCode.toDataURL(qrCodeData);

    await pool.query(
      `INSERT INTO work_order_qr_codes (work_order_id, qr_code, qr_url, generated_at, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW(), NOW())`,
      [newWorkOrder.id, qrCodeImage, qrCodeData]
    );

    res.status(201).json({
      success: true,
      data: newWorkOrder,
      message: "Work order created from template successfully",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET Kanban board (all statuses)
router.get("/board/kanban", async (req, res) => {
  try {
    const board: Record<string, any[]> = {};

    for (const status of WORK_ORDER_STATUSES) {
      const result = await pool.query(
        "SELECT * FROM production_work_orders WHERE status = $1 AND deleted_at IS NULL ORDER BY created_at DESC",
        [status]
      );
      board[status] = result.rows;
    }

    res.json({
      success: true,
      data: board,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET QR code
router.get("/:id/qr-code", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM work_order_qr_codes WHERE work_order_id = $1", [
      parseInt(id),
    ]);

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: "QR code not found" });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
