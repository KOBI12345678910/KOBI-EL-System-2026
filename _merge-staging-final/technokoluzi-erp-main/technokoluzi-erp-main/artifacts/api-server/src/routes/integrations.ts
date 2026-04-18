import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { integrationConnectionsTable, integrationSyncLogsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.userId) {
    return res.status(401).json({ error: "נדרשת התחברות" });
  }
  return next();
}

const SENSITIVE_AUTH_KEYS = [
  "token", "password", "appSecret", "secret", "apiKey", "api_key", "client_secret",
  "authToken", "auth_token", "botToken", "bot_token", "accessToken", "access_token",
  "refreshToken", "refresh_token", "privateKey", "private_key",
];

function maskAuthConfig<T extends Record<string, unknown>>(conn: T): T {
  if (!conn || typeof conn !== "object") return conn;
  const result = { ...conn };
  if (result.authConfig && typeof result.authConfig === "object") {
    const masked = { ...(result.authConfig as Record<string, unknown>) };
    for (const key of SENSITIVE_AUTH_KEYS) {
      if (masked[key] && typeof masked[key] === "string") {
        const val = masked[key] as string;
        masked[key] = val.length > 8 ? val.slice(0, 4) + "****" + val.slice(-4) : "****";
      }
    }
    result.authConfig = masked;
  }
  return result;
}


const CreateConnectionBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  serviceType: z.string().default("rest_api"),
  baseUrl: z.string().min(1),
  authMethod: z.string().default("none"),
  authConfig: z.record(z.string(), z.any()).default({}),
  defaultHeaders: z.record(z.string(), z.any()).default({}),
  isActive: z.boolean().default(true),
});

const UpdateConnectionBody = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  baseUrl: z.string().optional(),
  authMethod: z.string().optional(),
  authConfig: z.record(z.string(), z.any()).optional(),
  defaultHeaders: z.record(z.string(), z.any()).optional(),
  isActive: z.boolean().optional(),
});

const TestConnectionBody = z.object({
  baseUrl: z.string().min(1),
  authMethod: z.string().default("none"),
  authConfig: z.record(z.string(), z.any()).default({}),
  defaultHeaders: z.record(z.string(), z.any()).default({}),
});

router.get("/integrations/connections", requireAuth, async (_req, res) => {
  try {
    const connections = await db
      .select()
      .from(integrationConnectionsTable)
      .orderBy(desc(integrationConnectionsTable.createdAt));
    res.json(connections.map(c => maskAuthConfig(c)));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/integrations/connections/:id", requireAuth, async (req, res) => {
  try {
    const [connection] = await db
      .select()
      .from(integrationConnectionsTable)
      .where(eq(integrationConnectionsTable.id, Number(req.params.id)));
    if (!connection) return res.status(404).json({ error: "Not found" });
    res.json(maskAuthConfig(connection));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function deriveServiceType(slug: string, requested: string): string {
  if (slug === "gmail" || slug === "google-smtp") return "gmail";
  if (slug === "whatsapp" || slug === "whatsapp-api" || slug === "green-api") return "whatsapp";
  if (slug === "sms" || slug === "twilio" || slug === "nexmo" || slug === "vonage") return "sms";
  if (slug === "telegram" || slug === "telegram-bot") return "telegram";
  return requested;
}

router.post("/integrations/connections", requireAuth, async (req, res) => {
  try {
    const body = CreateConnectionBody.parse(req.body);
    const serviceType = deriveServiceType(body.slug, body.serviceType);
    const [connection] = await db
      .insert(integrationConnectionsTable)
      .values({
        name: body.name,
        slug: body.slug,
        description: body.description || null,
        serviceType,
        baseUrl: body.baseUrl,
        authMethod: body.authMethod,
        authConfig: body.authConfig,
        defaultHeaders: body.defaultHeaders,
        isActive: body.isActive,
      })
      .returning();
    res.status(201).json(connection);
  } catch (err: any) {
    if (err.issues) return res.status(400).json({ error: "Validation failed", details: err.issues });
    res.status(500).json({ error: err.message });
  }
});

router.put("/integrations/connections/:id", requireAuth, async (req, res) => {
  try {
    const body = UpdateConnectionBody.parse(req.body);
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl;
    if (body.authMethod !== undefined) updates.authMethod = body.authMethod;
    if (body.defaultHeaders !== undefined) updates.defaultHeaders = body.defaultHeaders;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    if (body.authConfig !== undefined) {
      const [existing] = await db.select().from(integrationConnectionsTable)
        .where(eq(integrationConnectionsTable.id, Number(req.params.id)));
      if (existing) {
        const existingAuth = (existing.authConfig || {}) as Record<string, unknown>;
        const newAuth = { ...(body.authConfig as Record<string, unknown>) };
        for (const key of SENSITIVE_AUTH_KEYS) {
          if (newAuth[key] && typeof newAuth[key] === "string" && (newAuth[key] as string).includes("****")) {
            newAuth[key] = existingAuth[key];
          }
        }
        updates.authConfig = newAuth;
      } else {
        updates.authConfig = body.authConfig;
      }
    }

    const [updated] = await db
      .update(integrationConnectionsTable)
      .set(updates)
      .where(eq(integrationConnectionsTable.id, Number(req.params.id)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(maskAuthConfig(updated));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/integrations/connections/:id", requireAuth, async (req, res) => {
  try {
    const [deleted] = await db
      .delete(integrationConnectionsTable)
      .where(eq(integrationConnectionsTable.id, Number(req.params.id)))
      .returning();
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/integrations/connections/:id/test", requireAuth, async (req, res) => {
  try {
    const [connection] = await db
      .select()
      .from(integrationConnectionsTable)
      .where(eq(integrationConnectionsTable.id, Number(req.params.id)));
    if (!connection) return res.status(404).json({ error: "Not found" });

    let success = false;
    let message = "";
    const startTime = Date.now();

    try {
      const headers: Record<string, string> = {};
      const authConfig = connection.authConfig as Record<string, any> || {};
      const defaultHeaders = connection.defaultHeaders as Record<string, any> || {};

      Object.entries(defaultHeaders).forEach(([k, v]) => { headers[k] = String(v); });

      if (connection.authMethod === "api_key" && authConfig.apiKey) {
        headers[authConfig.headerName || "Authorization"] = authConfig.apiKey;
      } else if (connection.authMethod === "bearer" && authConfig.token) {
        headers["Authorization"] = `Bearer ${authConfig.token}`;
      } else if (connection.authMethod === "basic" && authConfig.username) {
        const cred = Buffer.from(`${authConfig.username}:${authConfig.password || ""}`).toString("base64");
        headers["Authorization"] = `Basic ${cred}`;
      }

      const testUrl = authConfig.testEndpoint
        ? `${connection.baseUrl}${authConfig.testEndpoint}`
        : connection.baseUrl;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(testUrl, {
        method: "GET",
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      success = response.ok;
      message = success
        ? `חיבור הצליח (${response.status}) - ${Date.now() - startTime}ms`
        : `שגיאה: ${response.status} ${response.statusText}`;
    } catch (fetchErr: any) {
      message = `שגיאת חיבור: ${fetchErr.message}`;
    }

    if (success) {
      await db
        .update(integrationConnectionsTable)
        .set({ lastSyncAt: new Date(), updatedAt: new Date() })
        .where(eq(integrationConnectionsTable.id, connection.id));
    }

    await db.insert(integrationSyncLogsTable).values({
      connectionId: connection.id,
      direction: "test",
      status: success ? "success" : "failed",
      recordsProcessed: 0,
      recordsFailed: 0,
      errorMessage: success ? null : message,
      details: { responseTime: Date.now() - startTime },
    });

    res.json({ success, message });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/integrations/test-url", requireAuth, async (req, res) => {
  try {
    const body = TestConnectionBody.parse(req.body);
    const headers: Record<string, string> = {};
    const authConfig = body.authConfig || {};

    Object.entries(body.defaultHeaders || {}).forEach(([k, v]) => { headers[k] = String(v); });

    if (body.authMethod === "api_key" && authConfig.apiKey) {
      headers[authConfig.headerName || "Authorization"] = authConfig.apiKey;
    } else if (body.authMethod === "bearer" && authConfig.token) {
      headers["Authorization"] = `Bearer ${authConfig.token}`;
    } else if (body.authMethod === "basic" && authConfig.username) {
      const cred = Buffer.from(`${authConfig.username}:${authConfig.password || ""}`).toString("base64");
      headers["Authorization"] = `Basic ${cred}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const startTime = Date.now();

    const response = await fetch(body.baseUrl, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    res.json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      responseTime: Date.now() - startTime,
    });
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
});

router.get("/integrations/connections/:id/logs", requireAuth, async (req, res) => {
  try {
    const logs = await db
      .select()
      .from(integrationSyncLogsTable)
      .where(eq(integrationSyncLogsTable.connectionId, Number(req.params.id)))
      .orderBy(desc(integrationSyncLogsTable.startedAt))
      .limit(50);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
