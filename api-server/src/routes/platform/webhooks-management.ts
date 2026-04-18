import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  outgoingWebhooksTable,
  webhookDeliveryLogsTable,
  incomingWebhookEndpointsTable,
} from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import crypto from "crypto";

const router: IRouter = Router();

router.get("/platform/outgoing-webhooks", async (_req, res) => {
  try {
    const webhooks = await db.select().from(outgoingWebhooksTable).orderBy(outgoingWebhooksTable.createdAt);
    res.json(webhooks);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/outgoing-webhooks", async (req, res) => {
  try {
    const { name, url, events, headers, authType, authValue, description, retryPolicy } = req.body;
    if (!name || !url) return res.status(400).json({ message: "name and url are required" });
    const [webhook] = await db.insert(outgoingWebhooksTable).values({
      name, url,
      events: events || [],
      headers: headers || {},
      authType: authType || "none",
      authValue: authValue || null,
      description: description || null,
      retryPolicy: retryPolicy || { maxRetries: 3, backoffSeconds: 30 },
    }).returning();
    res.status(201).json(webhook);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/outgoing-webhooks/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, url, events, headers, authType, authValue, description, retryPolicy, isActive } = req.body;
    const [webhook] = await db.update(outgoingWebhooksTable).set({
      ...(name !== undefined && { name }),
      ...(url !== undefined && { url }),
      ...(events !== undefined && { events }),
      ...(headers !== undefined && { headers }),
      ...(authType !== undefined && { authType }),
      ...(authValue !== undefined && { authValue }),
      ...(description !== undefined && { description }),
      ...(retryPolicy !== undefined && { retryPolicy }),
      ...(isActive !== undefined && { isActive }),
      updatedAt: new Date(),
    }).where(eq(outgoingWebhooksTable.id, id)).returning();
    if (!webhook) return res.status(404).json({ message: "Webhook not found" });
    res.json(webhook);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/outgoing-webhooks/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(outgoingWebhooksTable).where(eq(outgoingWebhooksTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/outgoing-webhooks/:id/test", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [webhook] = await db.select().from(outgoingWebhooksTable).where(eq(outgoingWebhooksTable.id, id));
    if (!webhook) return res.status(404).json({ message: "Webhook not found" });

    const samplePayload = {
      event: "test.ping",
      timestamp: new Date().toISOString(),
      data: { message: "This is a test payload from ERP system", webhookId: id },
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-ERP-Event": "test.ping",
      "X-ERP-Delivery": crypto.randomBytes(16).toString("hex"),
      ...((webhook.headers as Record<string, string>) || {}),
    };

    if (webhook.authType === "bearer" && webhook.authValue) {
      headers["Authorization"] = `Bearer ${webhook.authValue}`;
    } else if (webhook.authType === "api_key" && webhook.authValue) {
      headers["X-API-Key"] = webhook.authValue;
    } else if (webhook.authType === "basic" && webhook.authValue) {
      headers["Authorization"] = `Basic ${Buffer.from(webhook.authValue).toString("base64")}`;
    }

    const startTime = Date.now();
    let responseStatus: number | null = null;
    let responseBody: string | null = null;
    let success = false;
    let errorMessage: string | null = null;

    try {
      const resp = await fetch(webhook.url, {
        method: "POST",
        headers,
        body: JSON.stringify(samplePayload),
        signal: AbortSignal.timeout(10000),
      });
      responseStatus = resp.status;
      responseBody = await resp.text();
      success = resp.ok;
    } catch (fetchErr: any) {
      errorMessage = fetchErr.message;
    }

    const duration = Date.now() - startTime;

    await db.insert(webhookDeliveryLogsTable).values({
      webhookId: id,
      event: "test.ping",
      payload: samplePayload,
      responseStatus,
      responseBody,
      success,
      errorMessage,
      duration,
    });

    res.json({ success, responseStatus, responseBody, duration, errorMessage });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/outgoing-webhooks/:id/logs", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const logs = await db.select().from(webhookDeliveryLogsTable)
      .where(eq(webhookDeliveryLogsTable.webhookId, id))
      .orderBy(desc(webhookDeliveryLogsTable.sentAt))
      .limit(limit);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/incoming-webhooks", async (_req, res) => {
  try {
    const endpoints = await db.select().from(incomingWebhookEndpointsTable).orderBy(incomingWebhookEndpointsTable.createdAt);
    res.json(endpoints);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/incoming-webhooks", async (req, res) => {
  try {
    const { name, description, mappedAction, actionConfig } = req.body;
    if (!name) return res.status(400).json({ message: "name is required" });

    const slug = name.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") + "-" + crypto.randomBytes(4).toString("hex");
    const secret = crypto.randomBytes(24).toString("hex");

    const [endpoint] = await db.insert(incomingWebhookEndpointsTable).values({
      name,
      slug,
      secret,
      description: description || null,
      mappedAction: mappedAction || null,
      actionConfig: actionConfig || {},
    }).returning();
    res.status(201).json(endpoint);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/incoming-webhooks/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, description, mappedAction, actionConfig, isActive } = req.body;
    const [endpoint] = await db.update(incomingWebhookEndpointsTable).set({
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(mappedAction !== undefined && { mappedAction }),
      ...(actionConfig !== undefined && { actionConfig }),
      ...(isActive !== undefined && { isActive }),
      updatedAt: new Date(),
    }).where(eq(incomingWebhookEndpointsTable.id, id)).returning();
    if (!endpoint) return res.status(404).json({ message: "Endpoint not found" });
    res.json(endpoint);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/incoming-webhooks/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(incomingWebhookEndpointsTable).where(eq(incomingWebhookEndpointsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/incoming-webhooks/:id/test", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [endpoint] = await db.select().from(incomingWebhookEndpointsTable).where(eq(incomingWebhookEndpointsTable.id, id));
    if (!endpoint) return res.status(404).json({ message: "Endpoint not found" });

    const baseUrl = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : `http://localhost:${process.env.PORT || 3001}`;
    const endpointUrl = `${baseUrl}/api/platform/webhooks/receive/${endpoint.slug}`;

    const samplePayload = {
      event: "test.incoming",
      timestamp: new Date().toISOString(),
      data: { test: true, endpointId: id },
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (endpoint.secret) {
      headers["X-Webhook-Secret"] = endpoint.secret;
    }

    let success = false;
    let responseBody: string | null = null;

    try {
      const resp = await fetch(endpointUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(samplePayload),
        signal: AbortSignal.timeout(5000),
      });
      responseBody = await resp.text();
      success = resp.ok;
    } catch (fetchErr: any) {
      responseBody = fetchErr.message;
    }

    res.json({ success, endpointUrl, samplePayload, responseBody });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
