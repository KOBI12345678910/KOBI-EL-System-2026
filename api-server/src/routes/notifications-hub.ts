import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();
const logger = console;

// Get user notifications
router.get("/notifications", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.email || "system";
    const { unreadOnly } = req.query;

    let query = "SELECT id, type, title, message, module_id, record_id, record_name, is_read, action_url, metadata, created_at FROM notifications WHERE user_id = $1";
    const params: any[] = [userId];

    if (unreadOnly === "true") {
      query += " AND is_read = false";
    }

    query += " ORDER BY created_at DESC LIMIT 100";

    const result = await db.execute(sql.raw(query, params));

    res.json({ notifications: result.rows || [] });
  } catch (error: any) {
    logger.error("[Notifications] Get failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

// Get unread notification count
router.get("/notifications/unread-count", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.email || "system";

    const result = await db.execute(
      sql`SELECT COUNT(*) as count FROM notifications WHERE user_id = ${userId} AND is_read = false`
    );

    res.json({ unreadCount: result.rows[0].count || 0 });
  } catch (error: any) {
    logger.error("[Notifications] Count failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

// Mark notification as read
router.post("/notifications/:id/read", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await db.execute(
      sql`UPDATE notifications SET is_read = true, read_at = NOW() WHERE id = ${parseInt(id)}`
    );

    res.json({ success: true });
  } catch (error: any) {
    logger.error("[Notifications] Mark read failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

// Mark all as read for user
router.post("/notifications/mark-all-read", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.email || "system";

    await db.execute(
      sql`UPDATE notifications SET is_read = true, read_at = NOW() WHERE user_id = ${userId} AND is_read = false`
    );

    res.json({ success: true });
  } catch (error: any) {
    logger.error("[Notifications] Mark all read failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

// Create notification (internal use)
router.post("/notifications/create", async (req: Request, res: Response) => {
  try {
    const { type, title, message, moduleId, recordId, recordName, userId, actionUrl, metadata } = req.body;

    if (!type || !title || !userId) {
      return res.status(400).json({ error: "type, title, and userId are required" });
    }

    const result = await db.execute(
      sql`INSERT INTO notifications (type, title, message, module_id, record_id, record_name, user_id, action_url, metadata, is_read)
        VALUES (${type}, ${title}, ${message || null}, ${moduleId || null}, ${recordId || null}, ${recordName || null}, ${userId}, ${actionUrl || null}, ${JSON.stringify(metadata || {})}, false)
        RETURNING id, type, title`
    );

    res.json({ success: true, notification: result.rows[0] });
  } catch (error: any) {
    logger.error("[Notifications] Create failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

// Delete notification
router.delete("/notifications/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.email || "system";

    await db.execute(
      sql`DELETE FROM notifications WHERE id = ${parseInt(id)} AND user_id = ${userId}`
    );

    res.json({ success: true });
  } catch (error: any) {
    logger.error("[Notifications] Delete failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

// Delete all notifications
router.delete("/notifications/clear-all", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.email || "system";

    await db.execute(sql`DELETE FROM notifications WHERE user_id = ${userId}`);

    res.json({ success: true });
  } catch (error: any) {
    logger.error("[Notifications] Clear all failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

export default router;
