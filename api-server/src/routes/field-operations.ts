import { Router, type Request, type Response } from "express";
import { pool } from "@workspace/db";

const router = Router();

router.use("/field-ops", (req, res, next) => {
  if (!req.userId) {
    res.status(401).json({ error: "נדרשת הזדהות" });
    return;
  }
  next();
});

router.post("/field-ops/gps-clock", async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { action, latitude, longitude, accuracy, notes } = req.body;
    if (!action || !["clock_in", "clock_out"].includes(action)) {
      res.status(400).json({ error: "action must be clock_in or clock_out" });
      return;
    }
    await pool.query(
      `INSERT INTO field_gps_clock_records (user_id, action, latitude, longitude, accuracy, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [userId, action, latitude || null, longitude || null, accuracy || null, notes || null]
    );
    res.json({ success: true, message: action === "clock_in" ? "כניסה נרשמה" : "יציאה נרשמה" });
  } catch (err) {
    console.error("GPS clock error:", err);
    res.status(500).json({ error: "שגיאה בשמירת נתוני שעון" });
  }
});

router.get("/field-ops/gps-clock/status", async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const result = await pool.query(
      `SELECT * FROM field_gps_clock_records WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    const lastRecord = result.rows[0] || null;
    const isClockedIn = lastRecord?.action === "clock_in";
    res.json({ isClockedIn, lastRecord });
  } catch (err) {
    console.error("GPS clock status error:", err);
    res.status(500).json({ error: "שגיאה בטעינת סטטוס" });
  }
});

router.get("/field-ops/gps-clock/history", async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const result = await pool.query(
      `SELECT * FROM field_gps_clock_records WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
    res.json({ records: result.rows });
  } catch (err) {
    console.error("GPS clock history error:", err);
    res.status(500).json({ error: "שגיאה בטעינת היסטוריה" });
  }
});

router.get("/gps/users", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.department, u.job_title,
              u.gps_enabled, u.gps_device_id,
              gs.last_latitude, gs.last_longitude, gs.last_accuracy,
              gs.last_speed, gs.last_battery_level, gs.last_heading, gs.last_altitude,
              gs.last_ping_at, gs.total_pings, gs.is_moving, gs.status AS gps_status,
              gs.updated_at AS gps_updated_at
       FROM users u
       LEFT JOIN user_gps_status gs ON gs.user_id = u.id
       WHERE u.is_active = TRUE
         AND COALESCE(u.gps_enabled, TRUE) = TRUE
         AND u.deleted_at IS NULL
       ORDER BY gs.last_ping_at DESC NULLS LAST, u.full_name`
    );
    res.json({ users: result.rows, count: result.rowCount });
  } catch (err) {
    console.error("GPS users list error:", err);
    res.status(500).json({ error: "שגיאה בטעינת משתמשי GPS" });
  }
});

router.put("/gps/users/:id/toggle", async (req: Request, res: Response) => {
  try {
    const targetId = parseInt(req.params.id);
    if (isNaN(targetId)) { res.status(400).json({ error: "מזהה משתמש לא תקין" }); return; }
    const isAdmin = req.permissions?.isSuperAdmin === true;
    const isSelf = req.userId === targetId;
    if (!isAdmin && !isSelf) {
      res.status(403).json({ error: "אין הרשאה לשנות הגדרות GPS של משתמש אחר" });
      return;
    }
    const current = await pool.query(`SELECT gps_enabled FROM users WHERE id = $1 AND deleted_at IS NULL`, [targetId]);
    if (current.rows.length === 0) { res.status(404).json({ error: "משתמש לא נמצא" }); return; }
    const newValue = !(current.rows[0].gps_enabled ?? true);
    await pool.query(`UPDATE users SET gps_enabled = $1, updated_at = NOW() WHERE id = $2`, [newValue, targetId]);
    const updated = await pool.query(
      `SELECT u.id, u.full_name, u.gps_enabled, u.gps_device_id, gs.last_ping_at, gs.is_moving, gs.status AS gps_status
       FROM users u LEFT JOIN user_gps_status gs ON gs.user_id = u.id WHERE u.id = $1`, [targetId]
    );
    res.json({ success: true, user: updated.rows[0] });
  } catch (err) {
    console.error("GPS toggle error:", err);
    res.status(500).json({ error: "שגיאה בשינוי סטטוס GPS" });
  }
});

router.post("/gps/users/:id/location", async (req: Request, res: Response) => {
  try {
    const targetId = parseInt(req.params.id);
    if (isNaN(targetId)) { res.status(400).json({ error: "מזהה משתמש לא תקין" }); return; }
    const isAdmin = req.permissions?.isSuperAdmin === true;
    const isSelf = req.userId === targetId;
    if (!isAdmin && !isSelf) {
      res.status(403).json({ error: "אין הרשאה לעדכן מיקום של משתמש אחר" });
      return;
    }
    const { latitude, longitude, accuracy, speed, battery_level, heading, altitude, timestamp } = req.body;
    if (latitude == null || longitude == null) {
      res.status(400).json({ error: "נדרשים קווי אורך ורוחב" });
      return;
    }
    const userCheck = await pool.query(`SELECT id, gps_enabled FROM users WHERE id = $1 AND deleted_at IS NULL`, [targetId]);
    if (userCheck.rows.length === 0) { res.status(404).json({ error: "משתמש לא נמצא" }); return; }
    if (!userCheck.rows[0].gps_enabled) { res.status(400).json({ error: "GPS מושבת עבור משתמש זה" }); return; }
    await pool.query(
      `INSERT INTO field_location_pings (user_id, latitude, longitude, accuracy, battery_level, speed, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()))`,
      [targetId, latitude, longitude, accuracy || null, battery_level ?? null, speed ?? null, timestamp || null]
    );
    const isMoving = (speed ?? 0) > 0.5;
    await pool.query(
      `INSERT INTO user_gps_status (user_id, last_latitude, last_longitude, last_accuracy, last_speed, last_battery_level, last_heading, last_altitude, last_ping_at, total_pings, is_moving, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, NOW()), 1, $10, $11, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         last_latitude = EXCLUDED.last_latitude,
         last_longitude = EXCLUDED.last_longitude,
         last_accuracy = EXCLUDED.last_accuracy,
         last_speed = EXCLUDED.last_speed,
         last_battery_level = EXCLUDED.last_battery_level,
         last_heading = COALESCE(EXCLUDED.last_heading, user_gps_status.last_heading),
         last_altitude = COALESCE(EXCLUDED.last_altitude, user_gps_status.last_altitude),
         last_ping_at = COALESCE(EXCLUDED.last_ping_at, NOW()),
         total_pings = user_gps_status.total_pings + 1,
         is_moving = EXCLUDED.is_moving,
         status = EXCLUDED.status,
         updated_at = NOW()`,
      [targetId, latitude, longitude, accuracy || null, speed ?? null, battery_level ?? null, heading ?? null, altitude ?? null, timestamp || null, isMoving, isMoving ? 'moving' : 'idle']
    );
    res.json({ success: true, location: { latitude, longitude, accuracy, speed, battery_level, heading, altitude, timestamp: timestamp || new Date().toISOString() } });
  } catch (err) {
    console.error("GPS user location update error:", err);
    res.status(500).json({ error: "שגיאה בעדכון מיקום GPS" });
  }
});

router.get("/gps/users/:id/history", async (req: Request, res: Response) => {
  try {
    const targetId = parseInt(req.params.id);
    if (isNaN(targetId)) { res.status(400).json({ error: "מזהה משתמש לא תקין" }); return; }
    const isAdmin = req.permissions?.isSuperAdmin === true;
    const isSelf = req.userId === targetId;
    if (!isAdmin && !isSelf) {
      res.status(403).json({ error: "אין הרשאה לצפות בהיסטוריית GPS של משתמש אחר" });
      return;
    }
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const offset = parseInt(req.query.offset as string) || 0;
    const from = req.query.from as string || null;
    const to = req.query.to as string || null;
    let query = `SELECT id, latitude, longitude, accuracy, speed, battery_level, created_at
       FROM field_location_pings WHERE user_id = $1`;
    const params: any[] = [targetId];
    let paramIdx = 2;
    if (from) { query += ` AND created_at >= $${paramIdx}::timestamptz`; params.push(from); paramIdx++; }
    if (to) { query += ` AND created_at <= $${paramIdx}::timestamptz`; params.push(to); paramIdx++; }
    query += ` ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(limit, offset);
    const result = await pool.query(query, params);
    let countQuery = `SELECT COUNT(*) FROM field_location_pings WHERE user_id = $1`;
    const countParams: any[] = [targetId];
    let cIdx = 2;
    if (from) { countQuery += ` AND created_at >= $${cIdx}::timestamptz`; countParams.push(from); cIdx++; }
    if (to) { countQuery += ` AND created_at <= $${cIdx}::timestamptz`; countParams.push(to); cIdx++; }
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0]?.count || "0");
    res.json({ history: result.rows, total, limit, offset });
  } catch (err) {
    console.error("GPS user history error:", err);
    res.status(500).json({ error: "שגיאה בטעינת היסטוריית GPS" });
  }
});

router.get("/field-ops/gps-clock/team", async (req: Request, res: Response) => {
  try {
    const isAdmin = req.permissions?.isSuperAdmin === true;
    let isManager = isAdmin;
    if (!isManager) {
      const userCheck = await pool.query(
        `SELECT job_title FROM users WHERE id = $1`, [req.userId]
      );
      const title = String(userCheck.rows[0]?.job_title || "").toLowerCase();
      isManager = title.includes("manager") || title.includes("מנהל") || title.includes("director");
    }
    if (!isManager) {
      res.status(403).json({ error: "גישה מוגבלת למנהלים" });
      return;
    }
    const result = await pool.query(
      `SELECT u.id AS user_id, u.full_name, u.department, u.job_title,
              gs.last_latitude AS latitude, gs.last_longitude AS longitude,
              gs.last_accuracy AS accuracy, gs.last_ping_at AS created_at,
              gs.last_speed AS speed, gs.last_battery_level AS battery_level,
              gs.is_moving, gs.status AS gps_status, gs.total_pings,
              COALESCE(gs.status, 'idle') AS action,
              CASE
                WHEN LOWER(COALESCE(u.job_title, u.department, '')) LIKE '%סוכן%' OR LOWER(COALESCE(u.job_title, u.department, '')) LIKE '%sales%' OR LOWER(COALESCE(u.job_title, u.department, '')) LIKE '%מכירות%' THEN 'sales_agent'
                WHEN LOWER(COALESCE(u.job_title, u.department, '')) LIKE '%מודד%' OR LOWER(COALESCE(u.job_title, u.department, '')) LIKE '%measur%' THEN 'measurer'
                WHEN LOWER(COALESCE(u.job_title, u.department, '')) LIKE '%מתקין%' OR LOWER(COALESCE(u.job_title, u.department, '')) LIKE '%install%' THEN 'installer'
                ELSE 'other'
              END AS employee_type
       FROM users u
       LEFT JOIN user_gps_status gs ON gs.user_id = u.id
       WHERE u.is_active = TRUE
         AND COALESCE(u.gps_enabled, TRUE) = TRUE
         AND u.deleted_at IS NULL
       ORDER BY u.full_name`
    );
    res.json({ members: result.rows });
  } catch (err) {
    console.error("Team locations error:", err);
    res.status(500).json({ error: "שגיאה בטעינת מיקומי צוות" });
  }
});

router.get("/field-ops/barcode-lookup/:code", async (req: Request, res: Response) => {
  try {
    const code = String(req.params.code);
    try {
      const invResult = await pool.query(
        `SELECT id, item_number, item_name, category, quantity, unit, cost_per_unit, status
         FROM accounting_inventory
         WHERE item_number = $1
         LIMIT 1`,
        [code]
      );
      if (invResult.rows.length > 0) {
        res.json({ found: true, source: "inventory", item: invResult.rows[0] });
        return;
      }
    } catch { /* table may not exist */ }
    try {
      const assetResult = await pool.query(
        `SELECT id, asset_name, asset_code, category, status, location, barcode
         FROM fixed_assets
         WHERE barcode = $1 OR asset_code = $1
         LIMIT 1`,
        [code]
      );
      if (assetResult.rows.length > 0) {
        res.json({ found: true, source: "asset", item: assetResult.rows[0] });
        return;
      }
    } catch { /* table may not exist */ }
    res.json({ found: false, source: null, item: null, message: "פריט לא נמצא" });
  } catch (err) {
    console.error("Barcode lookup error:", err);
    res.status(500).json({ error: "שגיאה בחיפוש ברקוד" });
  }
});

router.get("/field-ops/customer-detail/:id", async (req: Request, res: Response) => {
  try {
    const customerId = Number(String(req.params.id));
    let customer: Record<string, unknown> | null = null;
    try {
      const custResult = await pool.query(
        `SELECT id, name, contact_name, phone, email, address, city, notes
         FROM customers WHERE id = $1`,
        [customerId]
      );
      if (custResult.rows.length > 0) {
        customer = custResult.rows[0] as Record<string, unknown>;
      }
    } catch {
      try {
        const custResult = await pool.query(
          `SELECT id, company_name AS name, contact_name, phone, email, address, city, notes
           FROM crm_contacts WHERE id = $1`,
          [customerId]
        );
        if (custResult.rows.length > 0) {
          customer = custResult.rows[0] as Record<string, unknown>;
        }
      } catch { /* table may not exist */ }
    }
    if (!customer) {
      res.status(404).json({ error: "לקוח לא נמצא" });
      return;
    }
    let recentOrders: Record<string, unknown>[] = [];
    try {
      const ordersResult = await pool.query(
        `SELECT id, order_number, status, total_amount, created_at
         FROM orders WHERE customer_id = $1
         ORDER BY created_at DESC LIMIT 10`,
        [customerId]
      );
      recentOrders = ordersResult.rows as Record<string, unknown>[];
    } catch { /* table may not exist */ }
    res.json({ customer, recentOrders });
  } catch (err) {
    console.error("Customer detail error:", err);
    res.status(500).json({ error: "שגיאה בטעינת פרטי לקוח" });
  }
});

router.get("/field-ops/location-pings", async (req: Request, res: Response) => {
  try {
    let userId = req.userId;
    if (req.query.userId && String(req.query.userId) !== String(req.userId)) {
      const isAdmin = req.permissions?.isSuperAdmin === true;
      let isManager = isAdmin;
      if (!isManager) {
        const uc = await pool.query(`SELECT job_title FROM users WHERE id = $1`, [req.userId]);
        const t = String(uc.rows[0]?.job_title || "").toLowerCase();
        isManager = t.includes("manager") || t.includes("מנהל") || t.includes("director");
      }
      if (!isManager) {
        res.status(403).json({ error: "אין הרשאה לצפות במיקומי עובדים אחרים" });
        return;
      }
      userId = Number(req.query.userId);
    }
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const result = await pool.query(
      `SELECT id, user_id, latitude, longitude, accuracy, created_at
       FROM field_location_pings
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    res.json({ pings: result.rows });
  } catch (err) {
    console.error("Location pings history error:", err);
    res.status(500).json({ error: "שגיאה בטעינת היסטוריית מיקומים" });
  }
});

router.post("/field-ops/location-ping", async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { latitude, longitude, accuracy, battery_level, speed, timestamp } = req.body;
    await pool.query(
      `INSERT INTO field_location_pings (user_id, latitude, longitude, accuracy, battery_level, speed, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()))`,
      [userId, latitude, longitude, accuracy || null, battery_level ?? null, speed ?? null, timestamp || null]
    );
    const isMoving = (speed ?? 0) > 0.5;
    await pool.query(
      `INSERT INTO user_gps_status (user_id, last_latitude, last_longitude, last_accuracy, last_speed, last_battery_level, last_ping_at, total_pings, is_moving, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()), 1, $8, $9, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         last_latitude = EXCLUDED.last_latitude,
         last_longitude = EXCLUDED.last_longitude,
         last_accuracy = EXCLUDED.last_accuracy,
         last_speed = EXCLUDED.last_speed,
         last_battery_level = EXCLUDED.last_battery_level,
         last_ping_at = COALESCE(EXCLUDED.last_ping_at, NOW()),
         total_pings = user_gps_status.total_pings + 1,
         is_moving = EXCLUDED.is_moving,
         status = EXCLUDED.status,
         updated_at = NOW()`,
      [userId, latitude, longitude, accuracy || null, speed ?? null, battery_level ?? null, timestamp || null, isMoving, isMoving ? 'moving' : 'idle']
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Location ping error:", err);
    res.status(500).json({ error: "שגיאה בשמירת מיקום" });
  }
});

router.get("/field-ops/sales-agent-customer/:userId", async (req: Request, res: Response) => {
  try {
    const isAdmin = req.permissions?.isSuperAdmin === true;
    let isManager = isAdmin;
    if (!isManager) {
      const userCheck = await pool.query(`SELECT job_title FROM users WHERE id = $1`, [req.userId]);
      const title = String(userCheck.rows[0]?.job_title || "").toLowerCase();
      isManager = title.includes("manager") || title.includes("מנהל") || title.includes("director");
    }
    if (!isManager) {
      res.status(403).json({ error: "גישה מוגבלת למנהלים" });
      return;
    }
    const agentUserId = Number(req.params.userId);
    const recentOrderResult = await pool.query(
      `SELECT so.id, so.order_number, so.customer_name, so.customer_phone,
              so.shipping_address, so.installation_address, so.installation_city,
              so.status, so.created_at
       FROM sales_orders so
       WHERE so.salesperson_id = $1
       ORDER BY so.created_at DESC
       LIMIT 1`,
      [agentUserId]
    );
    const recentOrder = recentOrderResult.rows[0] || null;
    let customerDetails: Record<string, unknown> | null = null;
    if (recentOrder) {
      try {
        // Try to match by exact customer_name first, then wildcard, then by phone
        let custResult = { rows: [] as any[] };
        if (recentOrder.customer_name) {
          custResult = await pool.query(
            `SELECT id, name, customer_name, address, city, phone, mobile, contact_person, contact_name
             FROM sales_customers
             WHERE name ILIKE $1 OR customer_name ILIKE $1
             LIMIT 1`,
            [recentOrder.customer_name]
          );
        }
        if (custResult.rows.length === 0 && recentOrder.customer_phone) {
          custResult = await pool.query(
            `SELECT id, name, customer_name, address, city, phone, mobile, contact_person, contact_name
             FROM sales_customers
             WHERE phone = $1 OR mobile = $1
             LIMIT 1`,
            [recentOrder.customer_phone]
          );
        }
        if (custResult.rows.length > 0) {
          customerDetails = custResult.rows[0] as Record<string, unknown>;
        }
      } catch { /* table may not exist */ }
    }
    res.json({ recentOrder, customerDetails });
  } catch (err) {
    console.error("Sales agent customer error:", err);
    res.status(500).json({ error: "שגיאה בטעינת פרטי לקוח לסוכן" });
  }
});

async function isManagerOrAdmin(userId: number | undefined, permissions: any): Promise<boolean> {
  if (permissions?.isSuperAdmin === true) return true;
  if (!userId) return false;
  const userCheck = await pool.query(`SELECT job_title FROM users WHERE id = $1`, [userId]);
  const title = String(userCheck.rows[0]?.job_title || "").toLowerCase();
  return title.includes("manager") || title.includes("מנהל") || title.includes("director");
}

router.post("/field-ops/quote-location-verify", async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { quoteId, agentLatitude, agentLongitude } = req.body;

    if (agentLatitude == null || agentLongitude == null) {
      res.status(400).json({ error: "נדרשים נתוני מיקום של הסוכן" });
      return;
    }

    const agentLat = Number(agentLatitude);
    const agentLng = Number(agentLongitude);
    if (Number.isNaN(agentLat) || Number.isNaN(agentLng)) {
      res.status(400).json({ error: "נתוני מיקום לא תקינים" });
      return;
    }

    const managerAccess = await isManagerOrAdmin(userId, req.permissions);

    // Resolve customer name, address, and coordinates from the DB — do not trust client-supplied values
    let dbCustomerName: string | null = null;
    let dbCustomerAddress: string | null = null;
    let dbCustomerLat: number | null = null;
    let dbCustomerLng: number | null = null;
    if (quoteId) {
      const quoteCheck = await pool.query(
        `SELECT sq.salesperson_id, sq.created_by, sq.customer_name,
                c.city, c.address, c.latitude, c.longitude
         FROM sales_quotations sq
         LEFT JOIN customers c ON c.id = sq.customer_id
         WHERE sq.id = $1`,
        [quoteId]
      );
      const quote = quoteCheck.rows[0];
      if (!quote) {
        res.status(404).json({ error: "הצעת מחיר לא נמצאה" });
        return;
      }
      if (!managerAccess) {
        const isOwner = Number(quote.salesperson_id) === userId || String(quote.created_by) === String(userId);
        if (!isOwner) {
          res.status(403).json({ error: "ניתן לאמת מיקום רק עבור הצעות שיצרת" });
          return;
        }
      }
      dbCustomerName = quote.customer_name || null;
      dbCustomerAddress = [quote.address, quote.city].filter(Boolean).join(", ") || null;
      dbCustomerLat = quote.latitude != null ? Number(quote.latitude) : null;
      dbCustomerLng = quote.longitude != null ? Number(quote.longitude) : null;
    }

    // Compute Haversine distance if customer coordinates are stored in the DB
    const THRESHOLD_METERS = 500;
    let distanceMeters: number | null = null;
    let isVerified: boolean | null = null;

    if (dbCustomerLat !== null && dbCustomerLng !== null) {
      const R = 6371000;
      const lat1 = agentLat * Math.PI / 180;
      const lat2 = dbCustomerLat * Math.PI / 180;
      const dLat = (dbCustomerLat - agentLat) * Math.PI / 180;
      const dLon = (dbCustomerLng - agentLng) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
      distanceMeters = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      isVerified = distanceMeters <= THRESHOLD_METERS;
    }

    const result = await pool.query(
      `INSERT INTO quote_location_verifications
         (quote_id, agent_user_id, agent_latitude, agent_longitude, customer_latitude, customer_longitude, customer_name, customer_address, is_verified, distance_meters, verification_threshold_meters)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [quoteId || null, userId, agentLat, agentLng, dbCustomerLat, dbCustomerLng, dbCustomerName, dbCustomerAddress, isVerified, distanceMeters, THRESHOLD_METERS]
    );

    const message = isVerified === true
      ? `מיקום אומת — הסוכן נמצא במרחק ${Math.round(distanceMeters!)} מ׳ מהלקוח`
      : isVerified === false
        ? `מיקום לא אומת — מרחק ${Math.round(distanceMeters!)} מ׳ (מעל סף ${THRESHOLD_METERS} מ׳)`
        : "מיקום הסוכן נשמר — נדרשות קואורדינטות לקוח לאימות מרחק";

    res.json({
      success: true,
      verification: result.rows[0],
      isVerified,
      distanceMeters,
      message
    });
  } catch (err) {
    console.error("Quote location verify error:", err);
    res.status(500).json({ error: "שגיאה באימות מיקום הצעה" });
  }
});

router.get("/field-ops/quote-location-verify/:quoteId", async (req: Request, res: Response) => {
  try {
    const quoteId = Number(req.params.quoteId);
    const userId = req.userId!;

    const managerAccess = await isManagerOrAdmin(userId, req.permissions);
    if (!managerAccess) {
      const quoteCheck = await pool.query(
        `SELECT salesperson_id, created_by FROM sales_quotations WHERE id = $1`,
        [quoteId]
      );
      const quote = quoteCheck.rows[0];
      if (!quote) {
        res.status(404).json({ error: "הצעת מחיר לא נמצאה" });
        return;
      }
      const isOwner = Number(quote.salesperson_id) === userId || String(quote.created_by) === String(userId);
      if (!isOwner) {
        res.status(403).json({ error: "גישה מוגבלת לנתוני אימות מיקום" });
        return;
      }
    }

    // Managers see any verification for the quote; agents see only their own
    const verResult = managerAccess
      ? await pool.query(
          `SELECT * FROM quote_location_verifications WHERE quote_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [quoteId]
        )
      : await pool.query(
          `SELECT * FROM quote_location_verifications WHERE quote_id = $1 AND agent_user_id = $2 ORDER BY created_at DESC LIMIT 1`,
          [quoteId, userId]
        );

    res.json({ verification: verResult.rows[0] || null });
  } catch (err) {
    console.error("Quote location verify get error:", err);
    res.status(500).json({ error: "שגיאה בטעינת אימות מיקום" });
  }
});

router.post("/field-ops/visit-logs", async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { customerId, customerName, notes, photos, latitude, longitude, orderData } = req.body;
    const result = await pool.query(
      `INSERT INTO field_visit_logs (user_id, customer_id, customer_name, notes, photos, latitude, longitude, order_data, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [userId, customerId || null, customerName || null, notes || null, JSON.stringify(photos || []),
       latitude || null, longitude || null, orderData ? JSON.stringify(orderData) : null]
    );
    res.json({ success: true, visit: result.rows[0] });
  } catch (err) {
    console.error("Visit log error:", err);
    res.status(500).json({ error: "שגיאה בשמירת ביקור" });
  }
});

router.get("/field-ops/visit-logs", async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const result = await pool.query(
      `SELECT * FROM field_visit_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
    res.json({ visits: result.rows });
  } catch (err) {
    console.error("Visit logs list error:", err);
    res.status(500).json({ error: "שגיאה בטעינת ביקורים" });
  }
});

router.post("/field-ops/production-reports", async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { workOrderId, type, quantityProduced, reasonCode, reasonText, severity, description, photos } = req.body;
    const result = await pool.query(
      `INSERT INTO field_production_reports (user_id, work_order_id, report_type, quantity_produced, reason_code, reason_text, severity, description, photos, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING *`,
      [userId, workOrderId || null, type || "production",
       quantityProduced || 0, reasonCode || null, reasonText || null,
       severity || null, description || null, JSON.stringify(photos || [])]
    );
    res.json({ success: true, report: result.rows[0] });
  } catch (err) {
    console.error("Production report error:", err);
    res.status(500).json({ error: "שגיאה בשמירת דיווח ייצור" });
  }
});

router.get("/field-ops/production-reports", async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const result = await pool.query(
      `SELECT * FROM field_production_reports WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
    res.json({ reports: result.rows });
  } catch (err) {
    console.error("Production reports list error:", err);
    res.status(500).json({ error: "שגיאה בטעינת דיווחי ייצור" });
  }
});

router.get("/field-ops/maintenance-orders", async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const status = req.query.status ? String(req.query.status) : undefined;
    let query = `SELECT * FROM field_maintenance_orders WHERE assigned_to = $1`;
    const params: (string | number)[] = [userId as number];
    if (status && status !== "all") {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }
    query += ` ORDER BY priority_level ASC, created_at DESC LIMIT 100`;
    const result = await pool.query(query, params);
    res.json({ orders: result.rows });
  } catch (err) {
    console.error("Maintenance orders error:", err);
    res.status(500).json({ error: "שגיאה בטעינת הזמנות תחזוקה" });
  }
});

router.get("/field-ops/maintenance-orders/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(String(req.params.id));
    const userId = req.userId;
    const result = await pool.query(
      `SELECT * FROM field_maintenance_orders WHERE id = $1 AND (assigned_to = $2 OR (assigned_to IS NULL AND $3 = true))`,
      [id, userId, req.permissions?.isSuperAdmin === true]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "הזמנת תחזוקה לא נמצאה או אין הרשאה" });
      return;
    }
    res.json({ order: result.rows[0] });
  } catch (err) {
    console.error("Maintenance order detail error:", err);
    res.status(500).json({ error: "שגיאה בטעינת פרטי הזמנה" });
  }
});

router.put("/field-ops/maintenance-orders/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(String(req.params.id));
    const userId = req.userId;
    const { status, timeSpentMinutes, partsUsed, notes, photoBefore, photoAfter } = req.body;
    const ownerCheck = await pool.query(
      `SELECT id FROM field_maintenance_orders WHERE id = $1 AND (assigned_to = $2 OR (assigned_to IS NULL AND $3 = true))`,
      [id, userId, req.permissions?.isSuperAdmin === true]
    );
    if (ownerCheck.rows.length === 0) {
      res.status(403).json({ error: "אין הרשאה לעדכן הזמנה זו" });
      return;
    }
    const result = await pool.query(
      `UPDATE field_maintenance_orders
       SET status = COALESCE($2, status),
           time_spent_minutes = COALESCE($3, time_spent_minutes),
           parts_used = COALESCE($4, parts_used),
           notes = COALESCE($5, notes),
           photo_before = COALESCE($6, photo_before),
           photo_after = COALESCE($7, photo_after),
           completed_by = CASE WHEN $2 = 'completed' THEN $8 ELSE completed_by END,
           completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE completed_at END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status || null, timeSpentMinutes || null,
       partsUsed ? JSON.stringify(partsUsed) : null, notes || null,
       photoBefore || null, photoAfter || null, userId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "הזמנת תחזוקה לא נמצאה" });
      return;
    }
    res.json({ success: true, order: result.rows[0] });
  } catch (err) {
    console.error("Maintenance order update error:", err);
    res.status(500).json({ error: "שגיאה בעדכון הזמנת תחזוקה" });
  }
});

router.get("/field-ops/scan-history", async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const result = await pool.query(
      `SELECT * FROM field_scan_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
    res.json({ scans: result.rows });
  } catch (err) {
    console.error("Scan history error:", err);
    res.status(500).json({ error: "שגיאה בטעינת היסטוריית סריקות" });
  }
});

router.post("/field-ops/scan-history", async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { barcode, itemName, itemCode, action, result: scanResult } = req.body;
    const dbResult = await pool.query(
      `INSERT INTO field_scan_history (user_id, barcode, item_name, item_code, action, scan_result, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [userId, barcode, itemName || null, itemCode || null, action || "lookup", scanResult || null]
    );
    res.json({ success: true, scan: dbResult.rows[0] });
  } catch (err) {
    console.error("Scan history save error:", err);
    res.status(500).json({ error: "שגיאה בשמירת סריקה" });
  }
});

router.post("/field-ops/gps/update-location", async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { latitude, longitude, accuracy, battery_level, speed, heading, altitude, timestamp } = req.body;
    await pool.query(
      `INSERT INTO field_location_pings (user_id, latitude, longitude, accuracy, battery_level, speed, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()))`,
      [userId, latitude, longitude, accuracy || null, battery_level ?? null, speed ?? null, timestamp || null]
    );
    const isMoving = (speed ?? 0) > 0.5;
    await pool.query(
      `INSERT INTO user_gps_status (user_id, last_latitude, last_longitude, last_accuracy, last_speed, last_battery_level, last_heading, last_altitude, last_ping_at, total_pings, is_moving, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, NOW()), 1, $10, $11, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         last_latitude = EXCLUDED.last_latitude,
         last_longitude = EXCLUDED.last_longitude,
         last_accuracy = EXCLUDED.last_accuracy,
         last_speed = EXCLUDED.last_speed,
         last_battery_level = EXCLUDED.last_battery_level,
         last_heading = COALESCE(EXCLUDED.last_heading, user_gps_status.last_heading),
         last_altitude = COALESCE(EXCLUDED.last_altitude, user_gps_status.last_altitude),
         last_ping_at = COALESCE(EXCLUDED.last_ping_at, NOW()),
         total_pings = user_gps_status.total_pings + 1,
         is_moving = EXCLUDED.is_moving,
         status = EXCLUDED.status,
         updated_at = NOW()`,
      [userId, latitude, longitude, accuracy || null, speed ?? null, battery_level ?? null, heading ?? null, altitude ?? null, timestamp || null, isMoving, isMoving ? 'moving' : 'idle']
    );
    res.json({ success: true });
  } catch (err) {
    console.error("GPS update-location error:", err);
    res.status(500).json({ error: "שגיאה בשמירת מיקום" });
  }
});

router.post("/field-ops/onsite-order", async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { customerId, customerName, items, totalAgorot, notes } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "יש לציין פריטים להזמנה" });
      return;
    }
    const orderResult = await pool.query(
      `INSERT INTO field_orders (customer_id, order_number, status, total_amount, notes, created_by, created_at)
       VALUES ($1, $2, 'pending', $3, $4, $5, NOW())
       RETURNING id, order_number`,
      [customerId || null, "FLD-" + Date.now(), totalAgorot || 0, notes || null, userId]
    );
    const orderId = Number(orderResult.rows[0].id);
    for (const item of items) {
      await pool.query(
        `INSERT INTO field_order_items (order_id, product_id, item_name, item_number, quantity, unit_price_agorot, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [orderId, item.productId || null, item.name, item.itemNumber || null, item.quantity || 1, item.priceAgorot || 0]
      );
    }
    res.json({ success: true, orderId });
  } catch (err) {
    console.error("On-site order error:", err);
    res.status(500).json({ error: "שגיאה ביצירת הזמנה" });
  }
});

router.get("/field-ops/product-catalog", async (req: Request, res: Response) => {
  try {
    const search = req.query.search ? String(req.query.search) : null;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * limit;
    const updatedAfter = req.query.updated_after ? String(req.query.updated_after) : null;
    let products: Record<string, unknown>[] = [];
    try {
      const conditions: string[] = ["status != 'inactive'"];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (search) {
        conditions.push(`(item_name ILIKE $${paramIndex} OR item_number ILIKE $${paramIndex} OR category ILIKE $${paramIndex})`);
        params.push(`%${search}%`);
        paramIndex++;
      }
      if (updatedAfter) {
        conditions.push(`updated_at >= $${paramIndex}`);
        params.push(updatedAfter);
        paramIndex++;
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      params.push(limit, offset);
      const result = await pool.query(
        `SELECT id, item_number, item_name, category, unit, cost_per_unit, status, updated_at
         FROM accounting_inventory
         ${where}
         ORDER BY item_name
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        params
      );
      products = result.rows as Record<string, unknown>[];
    } catch { /* table may not exist */ }
    res.json({ products });
  } catch (err) {
    console.error("Product catalog error:", err);
    res.status(500).json({ error: "שגיאה בטעינת קטלוג מוצרים" });
  }
});

router.get("/field-ops/gps/saved-locations", async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const category = req.query.category ? String(req.query.category) : null;
    let query = `SELECT * FROM gps_saved_locations WHERE user_id = $1`;
    const params: (number | string)[] = [userId!];
    if (category && category !== "all") {
      query += ` AND category = $2`;
      params.push(category);
    }
    query += ` ORDER BY is_favorite DESC, updated_at DESC`;
    const result = await pool.query(query, params);
    res.json({ locations: result.rows });
  } catch (err) {
    console.error("Saved locations list error:", err);
    res.status(500).json({ error: "שגיאה בטעינת מיקומים שמורים" });
  }
});

router.post("/field-ops/gps/saved-locations", async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { name, category, latitude, longitude, address, notes, icon, color } = req.body;
    if (!name || latitude == null || longitude == null) {
      res.status(400).json({ error: "שם וקואורדינטות נדרשים" });
      return;
    }
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      res.status(400).json({ error: "קואורדינטות לא תקינות" });
      return;
    }
    const VALID_CATEGORIES = ["home", "work", "food", "nature", "other"];
    const safeCategory = VALID_CATEGORIES.includes(category) ? category : "other";
    const result = await pool.query(
      `INSERT INTO gps_saved_locations (user_id, name, category, latitude, longitude, address, notes, icon, color)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [userId, name, safeCategory, lat, lng, address || null, notes || null, icon || null, color || null]
    );
    res.json({ success: true, location: result.rows[0] });
  } catch (err) {
    console.error("Save location error:", err);
    res.status(500).json({ error: "שגיאה בשמירת מיקום" });
  }
});

router.put("/field-ops/gps/saved-locations/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const id = Number(req.params.id);
    const { name, category, latitude, longitude, address, notes, icon, color, is_favorite } = req.body;
    const result = await pool.query(
      `UPDATE gps_saved_locations
       SET name = COALESCE($3, name), category = COALESCE($4, category),
           latitude = COALESCE($5, latitude), longitude = COALESCE($6, longitude),
           address = COALESCE($7, address), notes = COALESCE($8, notes),
           icon = COALESCE($9, icon), color = COALESCE($10, color),
           is_favorite = COALESCE($11, is_favorite), updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId, name, category, latitude, longitude, address, notes, icon, color, is_favorite]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "מיקום לא נמצא" });
      return;
    }
    res.json({ success: true, location: result.rows[0] });
  } catch (err) {
    console.error("Update saved location error:", err);
    res.status(500).json({ error: "שגיאה בעדכון מיקום" });
  }
});

router.delete("/field-ops/gps/saved-locations/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const id = Number(req.params.id);
    const result = await pool.query(
      `DELETE FROM gps_saved_locations WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "מיקום לא נמצא" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Delete saved location error:", err);
    res.status(500).json({ error: "שגיאה במחיקת מיקום" });
  }
});

router.post("/field-ops/gps/share-location", async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { name, latitude, longitude, address, expiresInHours } = req.body;
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      res.status(400).json({ error: "קואורדינטות לא תקינות" });
      return;
    }
    const hours = Number(expiresInHours);
    if (expiresInHours != null && (Number.isNaN(hours) || hours <= 0 || hours > 8760)) {
      res.status(400).json({ error: "זמן תפוגה לא תקין" });
      return;
    }
    const crypto = await import("crypto");
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result: { rows: any[] } = { rows: [] };
    for (let attempt = 0; attempt < 5; attempt++) {
      const bytes = crypto.randomBytes(8);
      let code = "";
      for (let i = 0; i < 8; i++) {
        code += chars[bytes[i] % chars.length];
      }
      const expiresAt = hours
        ? new Date(Date.now() + hours * 3600000).toISOString()
        : null;
      try {
        result = await pool.query(
          `INSERT INTO gps_location_shares (user_id, share_code, name, latitude, longitude, address, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [userId, code, name || null, lat, lng, address || null, expiresAt]
        );
        break;
      } catch (e: any) {
        if (e.code === "23505" && attempt < 4) continue;
        throw e;
      }
    }
    if (result.rows.length === 0) {
      res.status(500).json({ error: "שגיאה ביצירת קוד שיתוף" });
      return;
    }
    res.json({ success: true, share: result.rows[0] });
  } catch (err) {
    console.error("Share location error:", err);
    res.status(500).json({ error: "שגיאה בשיתוף מיקום" });
  }
});

router.get("/field-ops/gps/share/:code", async (req: Request, res: Response) => {
  try {
    const code = String(req.params.code).toUpperCase();
    const result = await pool.query(
      `SELECT * FROM gps_location_shares WHERE share_code = $1 AND is_active = TRUE`,
      [code]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "קוד שיתוף לא נמצא או פג תוקף" });
      return;
    }
    const share = result.rows[0];
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      res.status(410).json({ error: "השיתוף פג תוקף" });
      return;
    }
    await pool.query(`UPDATE gps_location_shares SET view_count = view_count + 1 WHERE id = $1`, [share.id]);
    res.json({ share });
  } catch (err) {
    console.error("Get share error:", err);
    res.status(500).json({ error: "שגיאה בטעינת שיתוף" });
  }
});

router.get("/field-ops/gps/my-shares", async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const result = await pool.query(
      `SELECT * FROM gps_location_shares WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [userId]
    );
    res.json({ shares: result.rows });
  } catch (err) {
    console.error("My shares error:", err);
    res.status(500).json({ error: "שגיאה בטעינת שיתופים" });
  }
});

router.get("/field-ops/gps/tracking-stats", async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const isAdmin = req.permissions?.isSuperAdmin === true;
    let isManager = isAdmin;
    if (!isManager) {
      const uc = await pool.query(`SELECT job_title FROM users WHERE id = $1`, [req.userId]);
      const t = String(uc.rows[0]?.job_title || "").toLowerCase();
      isManager = t.includes("manager") || t.includes("מנהל") || t.includes("director");
    }

    let savedLocationsCount = 0;
    try {
      const r = await pool.query(`SELECT COUNT(*) as cnt FROM gps_saved_locations WHERE user_id = $1`, [userId]);
      savedLocationsCount = Number(r.rows[0]?.cnt || 0);
    } catch { /* table may not exist */ }

    let activeSharesCount = 0;
    try {
      const r = await pool.query(`SELECT COUNT(*) as cnt FROM gps_location_shares WHERE user_id = $1 AND is_active = TRUE`, [userId]);
      activeSharesCount = Number(r.rows[0]?.cnt || 0);
    } catch { /* table may not exist */ }

    let todayPingsCount = 0;
    try {
      const targetUser = isManager && req.query.userId ? Number(req.query.userId) : userId;
      const r = await pool.query(
        `SELECT COUNT(*) as cnt FROM field_location_pings WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
        [targetUser]
      );
      todayPingsCount = Number(r.rows[0]?.cnt || 0);
    } catch { /* table may not exist */ }

    let totalDistanceKm = 0;
    try {
      const targetUser = isManager && req.query.userId ? Number(req.query.userId) : userId;
      const pingsResult = await pool.query(
        `SELECT latitude, longitude FROM field_location_pings WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours' ORDER BY created_at ASC`,
        [targetUser]
      );
      const pings = pingsResult.rows;
      for (let i = 1; i < pings.length; i++) {
        const lat1 = Number(pings[i-1].latitude) * Math.PI / 180;
        const lat2 = Number(pings[i].latitude) * Math.PI / 180;
        const dLat = (Number(pings[i].latitude) - Number(pings[i-1].latitude)) * Math.PI / 180;
        const dLon = (Number(pings[i].longitude) - Number(pings[i-1].longitude)) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
        const d = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        if (d < 5) totalDistanceKm += d;
      }
    } catch { /* table may not exist */ }

    let activeFieldWorkers = 0;
    if (isManager) {
      try {
        const r = await pool.query(
          `SELECT COUNT(DISTINCT user_id) as cnt FROM field_gps_clock_records
           WHERE action = 'clock_in' AND created_at > NOW() - INTERVAL '24 hours'
           AND user_id NOT IN (
             SELECT DISTINCT user_id FROM field_gps_clock_records
             WHERE action = 'clock_out' AND created_at > NOW() - INTERVAL '24 hours'
           )`
        );
        activeFieldWorkers = Number(r.rows[0]?.cnt || 0);
      } catch { /* table may not exist */ }
    }

    res.json({
      savedLocationsCount,
      activeSharesCount,
      todayPingsCount,
      totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
      activeFieldWorkers,
      isManager
    });
  } catch (err) {
    console.error("GPS tracking stats error:", err);
    res.status(500).json({ error: "שגיאה בטעינת סטטיסטיקות GPS" });
  }
});

router.get("/field-ops/gps/last-location", async (req: Request, res: Response) => {
  try {
    const targetUserId = req.query.userId ? Number(req.query.userId) : req.userId;
    if (targetUserId !== req.userId) {
      const isAdmin = req.permissions?.isSuperAdmin === true;
      if (!isAdmin) {
        const uc = await pool.query(`SELECT job_title FROM users WHERE id = $1`, [req.userId]);
        const t = String(uc.rows[0]?.job_title || "").toLowerCase();
        const isManager = t.includes("manager") || t.includes("מנהל") || t.includes("director");
        if (!isManager) {
          res.status(403).json({ error: "אין הרשאה לצפות במיקום משתמש אחר" });
          return;
        }
      }
    }
    let lastLocation = null;
    try {
      const r = await pool.query(
        `SELECT last_latitude, last_longitude, last_accuracy, last_speed,
                last_battery_level, last_heading, last_altitude, last_ping_at,
                total_pings, is_moving, status
         FROM user_gps_status WHERE user_id = $1`,
        [targetUserId]
      );
      if (r.rows.length > 0 && r.rows[0].last_latitude != null) {
        const row = r.rows[0];
        lastLocation = {
          latitude: Number(row.last_latitude),
          longitude: Number(row.last_longitude),
          accuracy: row.last_accuracy ? Number(row.last_accuracy) : null,
          speed: row.last_speed ? Number(row.last_speed) : null,
          batteryLevel: row.last_battery_level ? Number(row.last_battery_level) : null,
          heading: row.last_heading ? Number(row.last_heading) : null,
          altitude: row.last_altitude ? Number(row.last_altitude) : null,
          timestamp: row.last_ping_at,
          totalPings: Number(row.total_pings || 0),
          isMoving: row.is_moving || false,
          status: row.status || "idle",
        };
      } else {
        const fallback = await pool.query(
          `SELECT latitude, longitude, accuracy, speed, battery_level, created_at
           FROM field_location_pings WHERE user_id = $1
           ORDER BY created_at DESC LIMIT 1`,
          [targetUserId]
        );
        if (fallback.rows.length > 0) {
          lastLocation = {
            latitude: Number(fallback.rows[0].latitude),
            longitude: Number(fallback.rows[0].longitude),
            accuracy: fallback.rows[0].accuracy ? Number(fallback.rows[0].accuracy) : null,
            speed: fallback.rows[0].speed ? Number(fallback.rows[0].speed) : null,
            batteryLevel: fallback.rows[0].battery_level ? Number(fallback.rows[0].battery_level) : null,
            heading: null,
            altitude: null,
            timestamp: fallback.rows[0].created_at,
            totalPings: 0,
            isMoving: false,
            status: "idle",
          };
        }
      }
    } catch { /* table may not exist */ }
    res.json({ lastLocation });
  } catch (err) {
    console.error("GPS last-location error:", err);
    res.status(500).json({ error: "שגיאה בטעינת מיקום אחרון" });
  }
});

export default router;
