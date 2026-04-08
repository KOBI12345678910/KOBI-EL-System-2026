import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  integrationConnectionsTable,
  integrationEndpointsTable,
  integrationWebhooksTable,
  integrationSyncLogsTable,
  entityFieldsTable,
} from "@workspace/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { z } from "zod/v4";
import { testConnection, executeSync } from "../../lib/integration-runtime";

const router: IRouter = Router();

const SENSITIVE_KEYS = ["token", "password", "appSecret", "secret", "apiKey", "api_key", "client_secret"];

function maskCredentials<T extends Record<string, unknown>>(conn: T): T {
  if (!conn || typeof conn !== "object") return conn;
  const result = { ...conn };
  if (result.authConfig && typeof result.authConfig === "object") {
    const masked = { ...(result.authConfig as Record<string, unknown>) };
    for (const key of SENSITIVE_KEYS) {
      if (masked[key] && typeof masked[key] === "string") {
        const val = masked[key] as string;
        masked[key] = val.length > 8 ? val.slice(0, 4) + "****" + val.slice(-4) : "****";
      }
    }
    result.authConfig = masked;
  }
  return result;
}


const ConnectionBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  serviceType: z.string().optional(),
  baseUrl: z.string().min(1),
  authMethod: z.string().optional(),
  authConfig: z.record(z.string(), z.any()).optional(),
  defaultHeaders: z.record(z.string(), z.any()).optional(),
  isActive: z.boolean().optional(),
});

const EndpointBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  method: z.string().optional(),
  path: z.string().min(1),
  requestHeaders: z.record(z.string(), z.any()).optional(),
  requestBody: z.record(z.string(), z.any()).nullable().optional(),
  fieldMapping: z.array(z.any()).optional(),
  syncDirection: z.string().optional(),
  entityId: z.number().optional(),
  scheduleConfig: z.record(z.string(), z.any()).nullable().optional(),
  isActive: z.boolean().optional(),
});

const WebhookBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  webhookSecret: z.string().optional(),
  entityId: z.number().optional(),
  fieldMapping: z.array(z.any()).optional(),
  eventType: z.string().optional(),
  isActive: z.boolean().optional(),
});

router.get("/platform/integrations", async (_req, res) => {
  try {
    const connections = await db.select().from(integrationConnectionsTable).orderBy(desc(integrationConnectionsTable.createdAt));
    res.json(connections.map(c => maskCredentials(c)));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/integrations", async (req, res) => {
  try {
    const body = ConnectionBody.parse(req.body);
    const [conn] = await db.insert(integrationConnectionsTable).values(body).returning();
    res.status(201).json(conn);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/integrations/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [conn] = await db.select().from(integrationConnectionsTable).where(eq(integrationConnectionsTable.id, id));
    if (!conn) return res.status(404).json({ message: "Connection not found" });
    res.json(maskCredentials(conn));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/integrations/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = ConnectionBody.partial().parse(req.body);

    if (body.authConfig && typeof body.authConfig === "object") {
      const [existing] = await db.select().from(integrationConnectionsTable).where(eq(integrationConnectionsTable.id, id));
      if (existing) {
        const existingAuth = (existing.authConfig || {}) as Record<string, unknown>;
        const newAuth = body.authConfig as Record<string, unknown>;
        for (const key of SENSITIVE_KEYS) {
          if (newAuth[key] && typeof newAuth[key] === "string" && (newAuth[key] as string).includes("****")) {
            newAuth[key] = existingAuth[key];
          }
        }
        body.authConfig = newAuth;
      }
    }

    const [conn] = await db.update(integrationConnectionsTable).set({ ...body, updatedAt: new Date() }).where(eq(integrationConnectionsTable.id, id)).returning();
    if (!conn) return res.status(404).json({ message: "Connection not found" });
    res.json(maskCredentials(conn));
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/integrations/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(integrationConnectionsTable).where(eq(integrationConnectionsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/integrations/:id/test", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await testConnection(id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/platform/integrations/:id/endpoints", async (req, res) => {
  try {
    const connectionId = Number(req.params.id);
    const endpoints = await db.select().from(integrationEndpointsTable).where(eq(integrationEndpointsTable.connectionId, connectionId));
    res.json(endpoints);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/integrations/:id/endpoints", async (req, res) => {
  try {
    const connectionId = Number(req.params.id);
    const body = EndpointBody.parse(req.body);
    const [endpoint] = await db.insert(integrationEndpointsTable).values({ ...body, connectionId }).returning();
    res.status(201).json(endpoint);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/integration-endpoints/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = EndpointBody.partial().parse(req.body);
    const [endpoint] = await db.update(integrationEndpointsTable).set({ ...body, updatedAt: new Date() }).where(eq(integrationEndpointsTable.id, id)).returning();
    if (!endpoint) return res.status(404).json({ message: "Endpoint not found" });
    res.json(endpoint);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/integration-endpoints/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(integrationEndpointsTable).where(eq(integrationEndpointsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/integrations/:id/webhooks", async (req, res) => {
  try {
    const connectionId = Number(req.params.id);
    const webhooks = await db.select().from(integrationWebhooksTable).where(eq(integrationWebhooksTable.connectionId, connectionId));
    res.json(webhooks);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/integrations/:id/webhooks", async (req, res) => {
  try {
    const connectionId = Number(req.params.id);
    const body = WebhookBody.parse(req.body);
    const [webhook] = await db.insert(integrationWebhooksTable).values({ ...body, connectionId }).returning();
    res.status(201).json(webhook);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/integration-webhooks/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = WebhookBody.partial().parse(req.body);
    const [webhook] = await db.update(integrationWebhooksTable).set({ ...body, updatedAt: new Date() }).where(eq(integrationWebhooksTable.id, id)).returning();
    if (!webhook) return res.status(404).json({ message: "Webhook not found" });
    res.json(webhook);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/integration-webhooks/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(integrationWebhooksTable).where(eq(integrationWebhooksTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/integrations/:id/sync-logs", async (req, res) => {
  try {
    const connectionId = Number(req.params.id);
    const logs = await db.select().from(integrationSyncLogsTable)
      .where(eq(integrationSyncLogsTable.connectionId, connectionId))
      .orderBy(desc(integrationSyncLogsTable.startedAt));
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/integration-sync-logs", async (_req, res) => {
  try {
    const logs = await db.select().from(integrationSyncLogsTable)
      .orderBy(desc(integrationSyncLogsTable.startedAt))
      .limit(100);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/integrations/:id/sync", async (req, res) => {
  try {
    const connectionId = Number(req.params.id);
    const endpointId = req.body.endpointId;
    const direction = req.body.direction;

    const [conn] = await db.select().from(integrationConnectionsTable).where(eq(integrationConnectionsTable.id, connectionId));
    if (!conn) return res.status(404).json({ message: "Connection not found" });

    if (endpointId) {
      const result = await executeSync(connectionId, endpointId, direction);
      return res.json(result);
    }

    const endpoints = await db.select().from(integrationEndpointsTable)
      .where(eq(integrationEndpointsTable.connectionId, connectionId));

    const activeEndpoints = endpoints.filter(ep => ep.isActive);

    if (activeEndpoints.length === 0) {
      const [log] = await db.insert(integrationSyncLogsTable).values({
        connectionId,
        direction: direction || "import",
        status: "completed",
        recordsProcessed: 0,
        recordsFailed: 0,
        details: { message: "No active endpoints to sync" },
        completedAt: new Date(),
      }).returning();

      await db.update(integrationConnectionsTable)
        .set({ lastSyncAt: new Date() })
        .where(eq(integrationConnectionsTable.id, connectionId));

      return res.json(log);
    }

    const results = [];
    for (const ep of activeEndpoints) {
      const syncDir = direction || ep.syncDirection;
      if (syncDir && !["import", "export", "bidirectional"].includes(syncDir)) continue;
      try {
        const result = await executeSync(connectionId, ep.id, syncDir);
        results.push({ endpointId: ep.id, endpointName: ep.name, ...result });
      } catch (err: any) {
        results.push({ endpointId: ep.id, endpointName: ep.name, error: err.message });
      }
    }

    res.json({ results });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/integrations/entity-fields/:entityId", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    const fields = await db.select().from(entityFieldsTable)
      .where(eq(entityFieldsTable.entityId, entityId))
      .orderBy(asc(entityFieldsTable.sortOrder));
    res.json(fields.map(f => ({ slug: f.slug, name: f.name, fieldType: f.fieldType })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
