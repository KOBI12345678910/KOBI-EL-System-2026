import { Router, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const logger = console;

// Rate limiter for standard endpoints (200 req/min)
export const standardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: "Too many requests, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.user?.role === "admin",
});

// Rate limiter for heavy endpoints (20 req/min)
export const heavyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: "Too many requests for this endpoint, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.user?.role === "admin",
});

// API Key authentication middleware
export async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers["x-api-key"] as string;
  
  if (!apiKey) {
    return next();
  }

  try {
    const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
    
    const result = await db.execute(
      sql`SELECT id, user_id, scopes, is_active, expires_at FROM api_keys WHERE key_hash = ${keyHash}`
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    const key = result.rows[0];
    
    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      return res.status(401).json({ error: "API key expired" });
    }

    req.user = { email: key.user_id, apiKeyId: key.id };
    req.apiKeyScopes = key.scopes || [];

    await db.execute(sql`UPDATE api_keys SET last_used_at = NOW() WHERE id = ${key.id}`);

    next();
  } catch (error) {
    logger.error("[Gateway] API key auth failed:", error);
    res.status(500).json({ error: "Authentication error" });
  }
}

// Response caching middleware
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60 * 1000; // 60 seconds

export function cacheResponse(ttl: number = CACHE_TTL) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET") {
      return next();
    }

    const cacheKey = `${req.method}:${req.path}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < ttl) {
      res.set("X-Cache", "HIT");
      return res.json(cached.data);
    }

    const originalJson = res.json.bind(res);
    res.json = function (data: any) {
      cache.set(cacheKey, { data, timestamp: Date.now() });
      res.set("X-Cache", "MISS");
      return originalJson(data);
    };

    next();
  };
}

// Request tracking middleware
export function trackRequest(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  res.on("finish", async () => {
    const responseTime = Date.now() - startTime;
    const apiKeyId = (req as any).apiKeyId;

    if (apiKeyId) {
      try {
        await db.execute(
          sql`INSERT INTO api_key_usage (key_id, endpoint, method, status_code, response_time)
            VALUES (${apiKeyId}, ${req.path}, ${req.method}, ${res.statusCode}, ${responseTime})`
        );
      } catch (error) {
        logger.error("[Gateway] Failed to log API key usage:", error);
      }
    }
  });

  next();
}

// Request ID injection
export function injectRequestId(req: Request, res: Response, next: NextFunction) {
  const requestId = crypto.randomUUID();
  req.id = requestId;
  res.set("X-Request-ID", requestId);
  next();
}

// Version negotiation middleware
export function versionNegotiation(req: Request, res: Response, next: NextFunction) {
  const version = req.path.includes("/api/v2") ? "v2" : "v1";
  req.apiVersion = version;
  next();
}

// Cache invalidation helper
export function invalidateCache(pattern?: string) {
  if (pattern) {
    for (const key of cache.keys()) {
      if (key.includes(pattern)) {
        cache.delete(key);
      }
    }
  } else {
    cache.clear();
  }
}

// Create gateway router
export function createGatewayRouter(): Router {
  const router = Router();

  // Global middleware
  router.use(injectRequestId);
  router.use(apiKeyAuth);
  router.use(trackRequest);
  router.use(versionNegotiation);

  // Rate limiting based on endpoint
  router.use((req, res, next) => {
    const heavyEndpoints = [
      "/api/v1/reports",
      "/api/v1/analytics",
      "/api/v1/export",
      "/api/v2/batch",
    ];

    if (heavyEndpoints.some((ep) => req.path.includes(ep))) {
      return heavyLimiter(req, res, next);
    }

    return standardLimiter(req, res, next);
  });

  // Caching for GET requests
  router.get("*", cacheResponse(30000));

  return router;
}

// Cache stats endpoint
export async function getCacheStats() {
  let cachedRequests = 0;
  let totalSize = 0;

  for (const [, value] of cache.entries()) {
    cachedRequests++;
    totalSize += JSON.stringify(value.data).length;
  }

  return {
    cachedRequests,
    totalSize: `${(totalSize / 1024).toFixed(2)} KB`,
    entries: cache.size,
  };
}
