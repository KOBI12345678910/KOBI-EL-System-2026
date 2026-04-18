import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// Dashboard route - must be first to prevent sub-paths from being caught by dynamic :id routes
// Returns the rich dashboard payload matching what the frontend inventory-dashboard page expects
router.get("/dashboard", async (_req, res) => {
  try {
    const [warehouses, rawStock, finishedStock, movements, belowMin, rawItems, finishedItems] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM warehouses WHERE is_active=true").catch(() => ({ rows: [{ count: "0" }] })),
      pool.query("SELECT COUNT(*) as count, COALESCE(SUM(total_value),0) as total_value FROM raw_material_stock").catch(() => ({ rows: [{ count: "0", total_value: "0" }] })),
      pool.query("SELECT COUNT(*) as count, COALESCE(SUM(quantity * unit_cost),0) as total_value FROM finished_goods_stock").catch(() => ({ rows: [{ count: "0", total_value: "0" }] })),
      pool.query("SELECT COUNT(*) as count FROM stock_movements WHERE created_at > NOW() - INTERVAL '30 days'").catch(() => ({ rows: [{ count: "0" }] })),
      pool.query("SELECT COUNT(*) as count FROM raw_materials WHERE minimum_stock > 0 AND current_stock <= reorder_point").catch(() => ({ rows: [{ count: "0" }] })),
      pool.query(`
        SELECT rms.id::text as id, COALESCE(rm.material_name, 'חומר גלם #' || rms.id) as "itemName",
          COALESCE(rm.category, 'חומרי גלם') as category, COALESCE(w.name, 'מחסן ראשי') as warehouse,
          rms.quantity as "currentQty", COALESCE(rm.minimum_stock, 0) as "minQty",
          rms.unit_cost as "unitCost", rms.total_value as "totalValue",
          CASE WHEN rms.quantity = 0 THEN 'חסר' WHEN rm.minimum_stock > 0 AND rms.quantity <= rm.minimum_stock THEN 'נמוך' ELSE 'תקין' END as status
        FROM raw_material_stock rms
        LEFT JOIN raw_materials rm ON rms.material_id = rm.id
        LEFT JOIN warehouses w ON rms.warehouse_id = w.id
        ORDER BY rms.id DESC LIMIT 500
      `).catch(() => ({ rows: [] })),
      pool.query(`
        SELECT fgs.id::text as id, COALESCE(p.name, 'מוצר מוגמר #' || fgs.id) as "itemName",
          'מוצר מוגמר' as category, COALESCE(w.name, 'מחסן ראשי') as warehouse,
          fgs.quantity as "currentQty", 0 as "minQty", fgs.unit_cost as "unitCost",
          COALESCE(fgs.quantity * fgs.unit_cost, 0) as "totalValue",
          CASE WHEN fgs.quantity = 0 THEN 'חסר' ELSE 'תקין' END as status
        FROM finished_goods_stock fgs
        LEFT JOIN products p ON fgs.product_id = p.id
        LEFT JOIN warehouses w ON fgs.warehouse_id = w.id
        ORDER BY fgs.id DESC LIMIT 500
      `).catch(() => ({ rows: [] })),
    ]);
    const totalItems = Number(rawStock.rows[0].count) + Number(finishedStock.rows[0].count);
    const rawMaterialValue = Number(rawStock.rows[0].total_value);
    const finishedGoodsValue = Number(finishedStock.rows[0].total_value);
    const items = [
      ...rawItems.rows.map((r: any) => ({ ...r, currentQty: Number(r.currentQty), minQty: Number(r.minQty), unitCost: Number(r.unitCost), totalValue: Number(r.totalValue) })),
      ...finishedItems.rows.map((r: any) => ({ ...r, id: `fg-${r.id}`, currentQty: Number(r.currentQty), minQty: Number(r.minQty), unitCost: Number(r.unitCost), totalValue: Number(r.totalValue) })),
    ];
    res.json({
      totalWarehouses: Number(warehouses.rows[0].count),
      totalItems,
      rawMaterialItems: Number(rawStock.rows[0].count),
      rawMaterialValue,
      finishedGoodsItems: Number(finishedStock.rows[0].count),
      finishedGoodsValue,
      totalInventoryValue: rawMaterialValue + finishedGoodsValue,
      recentMovements: Number(movements.rows[0].count),
      belowMinimum: Number(belowMin.rows[0].count),
      items,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ===== CATEGORY 5: INVENTORY (Tasks 27-32) =====

// Task 27: Raw Materials Catalog
// GET raw materials catalog with types
router.get("/raw-materials", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM inventory WHERE material_type IN ('IRON_PROFILE', 'ALUMINUM_PROFILE', 'SCREWS', 'PAINT', 'GLASS', 'OTHER') ORDER BY name"
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST raw material
router.post("/raw-materials", async (req, res) => {
  try {
    const { name, materialType, unit, minStock, maxStock, currentStock, unitCost } = req.body;

    if (!name || !materialType) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const result = await pool.query(
      `INSERT INTO inventory (name, material_type, unit, min_stock, max_stock, current_stock, unit_cost, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING *`,
      [name, materialType, unit || "unit", minStock || 0, maxStock || 999, currentStock || 0, unitCost || 0]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Task 28: Inventory Movement Tracking (IN/OUT/ADJUSTMENT/WASTE)
// GET inventory movements
router.get("/movements", async (req, res) => {
  try {
    const { type, startDate, endDate, page = "1", limit = "50" } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    let query = "SELECT * FROM inventory_movements WHERE 1=1";
    const params: any[] = [];

    if (type) {
      query += " AND movement_type = $" + (params.length + 1);
      params.push(type);
    }

    if (startDate) {
      query += " AND created_at >= $" + (params.length + 1);
      params.push(new Date(startDate as string));
    }

    if (endDate) {
      query += " AND created_at <= $" + (params.length + 1);
      params.push(new Date(endDate as string));
    }

    query += " ORDER BY created_at DESC LIMIT $" + (params.length + 1) + " OFFSET $" + (params.length + 2);
    params.push(parseInt(limit as string), offset);

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST inventory movement (IN/OUT/ADJUSTMENT/WASTE)
router.post("/movements", async (req, res) => {
  try {
    const { inventoryId, movementType, quantity, reason, reference } = req.body;

    if (!inventoryId || !movementType || !quantity) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    if (!["IN", "OUT", "ADJUSTMENT", "WASTE"].includes(movementType)) {
      return res.status(400).json({ success: false, error: "Invalid movement type" });
    }

    // Get current stock
    const inventory = await pool.query("SELECT current_stock FROM inventory WHERE id = $1", [inventoryId]);
    if (!inventory.rows.length) {
      return res.status(404).json({ success: false, error: "Inventory not found" });
    }

    const newStock =
      movementType === "OUT" || movementType === "WASTE"
        ? inventory.rows[0].current_stock - quantity
        : inventory.rows[0].current_stock + quantity;

    // Record movement
    const movementResult = await pool.query(
      `INSERT INTO inventory_movements (inventory_id, movement_type, quantity, reason, reference, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [inventoryId, movementType, quantity, reason || null, reference || null, req.body.userId || "system"]
    );

    // Update inventory
    await pool.query("UPDATE inventory SET current_stock = $1, updated_at = NOW() WHERE id = $2", [
      newStock,
      inventoryId,
    ]);

    res.status(201).json({
      success: true,
      data: movementResult.rows[0],
      newStock,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Task 29: Minimum Inventory Alerts (warning/critical/out-of-stock)
// GET inventory alerts
router.get("/alerts", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, material_type, current_stock, min_stock,
              CASE 
                WHEN current_stock = 0 THEN 'out_of_stock'
                WHEN current_stock <= min_stock / 2 THEN 'critical'
                WHEN current_stock <= min_stock THEN 'warning'
                ELSE 'ok'
              END as alert_level
       FROM inventory
       WHERE current_stock <= min_stock
       ORDER BY alert_level DESC, current_stock ASC`
    );

    const alerts = {
      out_of_stock: result.rows.filter((r) => r.alert_level === "out_of_stock"),
      critical: result.rows.filter((r) => r.alert_level === "critical"),
      warning: result.rows.filter((r) => r.alert_level === "warning"),
    };

    res.json({ success: true, data: alerts });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Task 30: BOM (Bill of Materials) for common product types
// GET BOMs
router.get("/bom", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM bom ORDER BY product_type");
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST BOM
router.post("/bom", async (req, res) => {
  try {
    const { productType, description, items } = req.body;

    if (!productType || !items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const result = await pool.query(
      `INSERT INTO bom (product_type, description, items, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       RETURNING *`,
      [productType, description || null, JSON.stringify(items)]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Task 31: Supplier Management + Purchase Orders + Goods Receipt
// GET suppliers
router.get("/suppliers", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM suppliers WHERE is_active = 1 ORDER BY name");
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST purchase order
router.post("/purchase-orders", async (req, res) => {
  try {
    const { supplierId, items, expectedDelivery, notes } = req.body;

    if (!supplierId || !items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const result = await pool.query(
      `INSERT INTO purchase_orders (supplier_id, items, expected_delivery, status, notes, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [supplierId, JSON.stringify(items), expectedDelivery || null, "pending", notes || null, req.body.userId || "system"]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST goods receipt (receive purchase order)
router.post("/goods-receipt", async (req, res) => {
  try {
    const { purchaseOrderId, receivedItems, receivedDate } = req.body;

    if (!purchaseOrderId || !receivedItems) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    // Update PO status
    await pool.query("UPDATE purchase_orders SET status = $1, updated_at = NOW() WHERE id = $2", [
      "received",
      purchaseOrderId,
    ]);

    // Create goods receipt record
    const result = await pool.query(
      `INSERT INTO goods_receipts (purchase_order_id, received_items, received_date, created_by, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [purchaseOrderId, JSON.stringify(receivedItems), receivedDate || new Date(), req.body.userId || "system"]
    );

    // Update inventory for each item
    for (const item of receivedItems) {
      await pool.query("UPDATE inventory SET current_stock = current_stock + $1 WHERE id = $2", [
        item.quantity,
        item.inventoryId,
      ]);
    }

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Task 32: Physical Inventory Count with Discrepancy Approval
// GET inventory counts
router.get("/counts", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ic.*, i.name, i.current_stock
       FROM inventory_counts ic
       JOIN inventory i ON ic.inventory_id = i.id
       ORDER BY ic.count_date DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST inventory count
router.post("/counts", async (req, res) => {
  try {
    const { inventoryId, countedQuantity, notes } = req.body;

    if (!inventoryId || countedQuantity === undefined) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    // Get current stock
    const inventory = await pool.query("SELECT current_stock FROM inventory WHERE id = $1", [inventoryId]);
    if (!inventory.rows.length) {
      return res.status(404).json({ success: false, error: "Inventory not found" });
    }

    const variance = countedQuantity - inventory.rows[0].current_stock;
    const status = variance === 0 ? "approved" : "pending_approval";

    const result = await pool.query(
      `INSERT INTO inventory_counts (inventory_id, counted_quantity, variance, status, notes, counted_by, count_date, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [inventoryId, countedQuantity, variance, status, notes || null, req.body.userId || "system"]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// APPROVE discrepancy
router.put("/counts/:countId/approve", async (req, res) => {
  try {
    const { countId } = req.params;
    const { approveDiscount } = req.body;

    const countResult = await pool.query("SELECT * FROM inventory_counts WHERE id = $1", [parseInt(countId)]);
    if (!countResult.rows.length) {
      return res.status(404).json({ success: false, error: "Count not found" });
    }

    const count = countResult.rows[0];

    if (approveDiscount) {
      // Update inventory to match count
      await pool.query("UPDATE inventory SET current_stock = $1, updated_at = NOW() WHERE id = $2", [
        count.counted_quantity,
        count.inventory_id,
      ]);

      // Record adjustment movement
      const adjustmentQty = Math.abs(count.variance);
      await pool.query(
        `INSERT INTO inventory_movements (inventory_id, movement_type, quantity, reason, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          count.inventory_id,
          "ADJUSTMENT",
          adjustmentQty,
          `Count discrepancy approved: ${count.variance > 0 ? "+" : "-"}${adjustmentQty}`,
          req.body.userId || "system",
        ]
      );
    }

    const result = await pool.query(
      "UPDATE inventory_counts SET status = $1, approved_by = $2, approved_at = NOW() WHERE id = $3 RETURNING *",
      ["approved", req.body.userId || "system", parseInt(countId)]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
