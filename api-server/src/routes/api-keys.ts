import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import crypto from "crypto";

const router: IRouter = Router();
const logger = console;

router.post("/api-keys", async (req: Request, res: Response) => {
  try {
    const { keyName, scopes, expiresAt } = req.body;
    const userId = req.user?.email || "system";

    const apiKey = crypto.randomBytes(32).toString("hex");
    const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

    const result = await db.execute(
      sql`INSERT INTO api_keys (key_hash, key_name, user_id, scopes, expires_at, is_active)
        VALUES (${keyHash}, ${keyName}, ${userId}, ${JSON.stringify(scopes || [])}, ${expiresAt}, true)
        RETURNING id, key_name`
    );

    res.json({
      success: true,
      keyId: result.rows[0].id,
      apiKey: apiKey,
      message: "Store this API key securely. You won't see it again.",
    });
  } catch (error: any) {
    logger.error("[API Keys] Create failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.get("/api-keys", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.email || "system";

    const result = await db.execute(
      sql`SELECT id, key_name, scopes, is_active, last_used_at, expires_at, created_at FROM api_keys WHERE user_id = ${userId} ORDER BY created_at DESC`
    );

    res.json({ keys: result.rows });
  } catch (error: any) {
    logger.error("[API Keys] List failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.delete("/api-keys/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.email || "system";

    await db.execute(
      sql`DELETE FROM api_keys WHERE id = ${parseInt(id)} AND user_id = ${userId}`
    );

    res.json({ success: true });
  } catch (error: any) {
    logger.error("[API Keys] Delete failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/api-keys/:id/toggle", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.email || "system";

    const keyResult = await db.execute(
      sql`SELECT is_active FROM api_keys WHERE id = ${parseInt(id)} AND user_id = ${userId}`
    );

    if (keyResult.rows.length === 0) {
      return res.status(404).json({ error: "Key not found" });
    }

    const newState = !keyResult.rows[0].is_active;

    await db.execute(
      sql`UPDATE api_keys SET is_active = ${newState} WHERE id = ${parseInt(id)}`
    );

    res.json({ success: true, isActive: newState });
  } catch (error: any) {
    logger.error("[API Keys] Toggle failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.get("/api-keys/usage/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await db.execute(
      sql`SELECT endpoint, method, status_code as statusCode, response_time as responseTime, created_at as createdAt FROM api_key_usage WHERE key_id = ${parseInt(id)} ORDER BY created_at DESC LIMIT 100`
    );

    res.json({ usage: result.rows });
  } catch (error: any) {
    logger.error("[API Keys] Usage failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

export default router;
