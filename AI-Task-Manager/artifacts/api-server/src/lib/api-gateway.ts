import { Router, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { pool } from "@workspace/db";
import { validateSession } from "./auth";
import { logger } from "./logger";
import crypto from "crypto";

const responseCache = new Map<string, { data: string; contentType: string; expiresAt: number }>();
const CACHE_DEFAULT_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 500;

function getCacheKey(req: Request): string {
  return `${req.method}:${req.originalUrl}:${req.userId || "anon"}`;
}

export function gatewayCacheMiddleware(ttlMs: number = CACHE_DEFAULT_TTL_MS) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET") {
      invalidateCacheForPath(req.path);
      return next();
    }

    const key = getCacheKey(req);
    const cached = responseCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      res.setHeader("Content-Type", cached.contentType);
      res.setHeader("X-Cache", "HIT");
      return res.send(cached.data);
    }

    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      if (res.headersSent) return res;
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const data = JSON.stringify(body);
        if (responseCache.size >= MAX_CACHE_ENTRIES) {
          const oldest = responseCache.keys().next().value;
          if (oldest) responseCache.delete(oldest);
        }
        responseCache.set(key, {
          data,
          contentType: "application/json; charset=utf-8",
          expiresAt: Date.now() + ttlMs,
        });
      }
      if (!res.headersSent) res.setHeader("X-Cache", "MISS");
      return originalJson(body);
    };
    next();
  };
}

function invalidateCacheForPath(path: string) {
  const segments = path.split("/").filter(Boolean);
  const prefixes = new Set<string>();
  prefixes.add(segments.slice(0, Math.min(segments.length, 3)).join("/"));
  if (segments.length > 3) {
    prefixes.add(segments.slice(0, 3).join("/"));
  }
  for (const key of responseCache.keys()) {
    for (const prefix of prefixes) {
      if (key.includes(prefix)) {
        responseCache.delete(key);
        break;
      }
    }
  }
}

export function getCacheStats() {
  let hitCount = 0;
  let expiredCount = 0;
  const now = Date.now();
  for (const entry of responseCache.values()) {
    if (entry.expiresAt > now) hitCount++;
    else expiredCount++;
  }
  return { totalEntries: responseCache.size, active: hitCount, expired: expiredCount };
}

export function clearCache() {
  responseCache.clear();
}

export const perUserRateLimit = rateLimit({
  windowMs: 60_000,
  max: 200,
  keyGenerator: (req: Request) => req.userId || "anon",
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false },
  message: { error: "חרגת ממגבלת הבקשות. נסה שוב בעוד דקה", code: "RATE_LIMIT_EXCEEDED" },
});

export const heavyEndpointRateLimit = rateLimit({
  windowMs: 60_000,
  max: 20,
  keyGenerator: (req: Request) => req.userId || "anon",
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false },
  message: { error: "חרגת ממגבלת הבקשות לנקודת קצה כבדה. נסה שוב בעוד דקה", code: "RATE_LIMIT_EXCEEDED" },
});

const SCOPE_METHOD_MAP: Record<string, string[]> = {
  read: ["GET", "HEAD", "OPTIONS"],
  write: ["POST", "PUT", "PATCH", "DELETE"],
  admin: ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"],
};

function checkKeyScopes(scopes: string[], method: string): boolean {
  if (scopes.length === 0 || scopes.includes("*") || scopes.includes("admin")) {
    return true;
  }
  const upperMethod = method.toUpperCase();
  for (const scope of scopes) {
    const allowed = SCOPE_METHOD_MAP[scope];
    if (allowed && allowed.includes(upperMethod)) return true;
  }
  return false;
}

export async function apiKeyAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers["x-api-key"] as string;
  if (!apiKey) return next();

  try {
    const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
    const { rows } = await pool.query(
      `SELECT id, user_id, name, scopes, is_active, expires_at FROM api_keys WHERE key_hash = $1`,
      [keyHash]
    );

    if (rows.length === 0) {
      res.status(401).json({ error: "מפתח API לא תקין — Invalid API key" });
      return;
    }

    const keyRecord = rows[0] as Record<string, unknown>;

    if (!keyRecord.is_active) {
      res.status(403).json({ error: "מפתח API מושבת — API key disabled" });
      return;
    }

    if (keyRecord.expires_at && new Date(keyRecord.expires_at as string) < new Date()) {
      res.status(403).json({ error: "מפתח API פג תוקף — API key expired" });
      return;
    }

    let scopes: string[] = [];
    try {
      const raw = keyRecord.scopes;
      if (typeof raw === "string") scopes = JSON.parse(raw);
      else if (Array.isArray(raw)) scopes = raw as string[];
    } catch {
      scopes = [];
    }

    if (!checkKeyScopes(scopes, req.method)) {
      res.status(403).json({ error: "הרשאת מפתח API לא מספיקה — scope insufficient for this action" });
      return;
    }

    req.userId = String(keyRecord.user_id);
    req.apiKeyId = keyRecord.id;
    (req as Record<string, unknown>).apiKeyScopes = scopes;

    await pool.query(
      `UPDATE api_keys SET last_used_at = NOW(), usage_count = usage_count + 1 WHERE id = $1`,
      [keyRecord.id]
    );

    next();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal auth error";
    res.status(500).json({ error: "שגיאת אימות מפתח API — " + msg });
  }
}

export function requestTransformMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (req.headers["x-request-id"]) {
    (req as unknown as Record<string, unknown>).requestId = req.headers["x-request-id"];
  } else {
    const reqId = crypto.randomUUID();
    (req as unknown as Record<string, unknown>).requestId = reqId;
  }
  next();
}

export function responseTransformMiddleware(req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Powered-By", "Techno-Kol-Uzi-ERP");
  const version = (req as Record<string, unknown>).apiVersion || "v1";
  res.setHeader("X-API-Version", String(version));
  next();
}

export function createApiKeyRoutes(): Router {
  const router = Router();

  function requireAuth(req: Request, res: Response, next: NextFunction): void {
    if (!req.userId) { res.status(401).json({ error: "נדרש אימות" }); return; }
    next();
  }

  function requireAdmin(req: Request, res: Response, next: NextFunction): void {
    if (!req.permissions?.isSuperAdmin) { res.status(403).json({ error: "נדרשת הרשאת מנהל" }); return; }
    next();
  }

  router.get("/api-keys", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, name, user_id, scopes, is_active, created_at, last_used_at, usage_count, expires_at,
                CONCAT(LEFT(key_prefix, 8), '...') as key_preview
         FROM api_keys ORDER BY created_at DESC`
      );
      res.json({ data: rows });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  router.post("/api-keys", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { name, scopes, expires_in_days } = req.body;
      if (!name) { res.status(400).json({ error: "שם המפתח נדרש" }); return; }

      const rawKey = `tku_${crypto.randomBytes(32).toString("hex")}`;
      const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
      const keyPrefix = rawKey.substring(0, 12);
      const expiresAt = expires_in_days
        ? new Date(Date.now() + Number(expires_in_days) * 86400000)
        : null;

      const { rows } = await pool.query(
        `INSERT INTO api_keys (name, key_hash, key_prefix, user_id, scopes, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, created_at`,
        [name, keyHash, keyPrefix, req.userId, JSON.stringify(scopes || []), expiresAt]
      );

      res.status(201).json({
        ...rows[0],
        api_key: rawKey,
        message: "שמור את המפתח — הוא לא יוצג שוב",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  router.put("/api-keys/:id/toggle", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const { rows } = await pool.query(
        `UPDATE api_keys SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING id, is_active`,
        [id]
      );
      if (rows.length === 0) { res.status(404).json({ error: "מפתח לא נמצא" }); return; }
      res.json(rows[0]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  router.delete("/api-keys/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      await pool.query(`DELETE FROM api_keys WHERE id = $1`, [id]);
      res.json({ success: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  router.get("/gateway/stats", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
    const cache = getCacheStats();
    res.json({ cache, version: "v1" });
  });

  router.post("/gateway/cache/clear", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
    clearCache();
    res.json({ success: true, message: "מטמון נוקה" });
  });

  return router;
}
