import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import {
  externalApiKeysTable,
  webhookConfigsTable,
  webhookLogsTable,
  suppliersTable,
  supplierDocumentsTable,
  entityRecordsTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql, gt } from "drizzle-orm";
import { hashApiKey } from "../lib/external-auth";

const router = Router();

interface ApiKeyUser {
  id: number;
  name: string;
  ownerType: string;
  ownerId: number | null;
  permissions: any;
}

interface ApiAuthRequest extends Request {
  apiKeyUser?: ApiKeyUser;
}

async function requireApiKey(req: ApiAuthRequest, res: Response, next: NextFunction): Promise<void> {
  const apiKey = req.headers["x-api-key"] as string;
  if (!apiKey) {
    res.status(401).json({ error: "API key required. Pass via X-API-Key header." }); return;
  }

  const keyHash = hashApiKey(apiKey);
  const [key] = await db.select().from(externalApiKeysTable)
    .where(and(
      eq(externalApiKeysTable.keyHash, keyHash),
      eq(externalApiKeysTable.isActive, true)
    ));

  if (!key) {
    res.status(401).json({ error: "Invalid or inactive API key" }); return;
  }

  if (key.expiresAt && key.expiresAt < new Date()) {
    res.status(401).json({ error: "API key expired" }); return;
  }

  await db.update(externalApiKeysTable).set({
    lastUsedAt: new Date(),
    usageCount: key.usageCount + 1,
  }).where(eq(externalApiKeysTable.id, key.id));

  req.apiKeyUser = {
    id: key.id,
    name: key.name,
    ownerType: key.ownerType,
    ownerId: key.ownerId,
    permissions: key.permissions,
  };
  next();
}

function checkPermission(permissions: any, action: string): boolean {
  if (!permissions || typeof permissions !== "object") return true;
  const perms = permissions as Record<string, boolean>;
  if (Object.keys(perms).length === 0) return true;
  return perms[action] !== false;
}

router.get("/external/v1/status", requireApiKey as any, (req: Request, res: Response) => {
  const authReq = req as ApiAuthRequest;
  res.json({
    status: "ok",
    apiKeyName: authReq.apiKeyUser?.name,
    ownerType: authReq.apiKeyUser?.ownerType,
    timestamp: new Date().toISOString(),
  });
});

router.get("/external/v1/supplier/info", requireApiKey as any, async (req: Request, res: Response) => {
  try {
    const authReq = req as ApiAuthRequest;
    if (authReq.apiKeyUser?.ownerType !== "supplier") {
      res.status(403).json({ error: "API key not associated with a supplier" }); return;
    }
    if (!checkPermission(authReq.apiKeyUser?.permissions, "read:supplier")) {
      res.status(403).json({ error: "Permission denied: read:supplier" }); return;
    }
    const supplierId = authReq.apiKeyUser.ownerId;
    if (!supplierId) { res.status(404).json({ error: "Supplier not linked" }); return; }

    const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId));
    if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }
    res.json(supplier);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/external/v1/supplier/purchase-orders", requireApiKey as any, async (req: Request, res: Response) => {
  try {
    const authReq = req as ApiAuthRequest;
    if (authReq.apiKeyUser?.ownerType !== "supplier") {
      res.status(403).json({ error: "API key not associated with a supplier" }); return;
    }
    if (!checkPermission(authReq.apiKeyUser?.permissions, "read:purchase_orders")) {
      res.status(403).json({ error: "Permission denied: read:purchase_orders" }); return;
    }
    const supplierId = authReq.apiKeyUser.ownerId;
    if (!supplierId) { res.status(404).json({ error: "Supplier not linked" }); return; }

    const poEntityId = await getEntityIdBySlug("purchase_order");
    if (!poEntityId) { res.json([]); return; }

    const orders = await db.select().from(entityRecordsTable)
      .where(and(
        eq(entityRecordsTable.entityId, poEntityId),
        sql`(${entityRecordsTable.data}->>'supplier_id')::text = ${String(supplierId)}`
      ))
      .orderBy(desc(entityRecordsTable.createdAt))
      .limit(Number(req.query.limit) || 50);

    res.json(orders);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/external/v1/supplier/invoices", requireApiKey as any, async (req: Request, res: Response) => {
  try {
    const authReq = req as ApiAuthRequest;
    if (authReq.apiKeyUser?.ownerType !== "supplier") {
      res.status(403).json({ error: "API key not associated with a supplier" }); return;
    }
    if (!checkPermission(authReq.apiKeyUser?.permissions, "write:invoices")) {
      res.status(403).json({ error: "Permission denied: write:invoices" }); return;
    }
    const supplierId = authReq.apiKeyUser.ownerId;
    if (!supplierId) { res.status(400).json({ error: "Supplier not linked" }); return; }

    const { documentName, documentType, fileUrl, notes } = req.body;
    const [doc] = await db.insert(supplierDocumentsTable).values({
      supplierId,
      documentName: documentName || "חשבונית מ-API",
      documentType: documentType || "invoice",
      fileUrl: fileUrl || null,
      notes: notes || null,
    }).returning();

    await triggerWebhooks("supplier.invoice_submitted", {
      supplierId,
      documentId: doc.id,
      documentName: doc.documentName,
    });

    res.status(201).json(doc);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/external/v1/contractor/info", requireApiKey as any, async (req: Request, res: Response) => {
  try {
    const authReq = req as ApiAuthRequest;
    if (authReq.apiKeyUser?.ownerType !== "contractor") {
      res.status(403).json({ error: "API key not associated with a contractor" }); return;
    }
    if (!checkPermission(authReq.apiKeyUser?.permissions, "read:contractor")) {
      res.status(403).json({ error: "Permission denied: read:contractor" }); return;
    }
    const contractorId = authReq.apiKeyUser.ownerId;
    if (!contractorId) { res.status(404).json({ error: "Contractor not linked" }); return; }

    const EMPLOYEE_ENTITY_ID = 34;
    const [contractor] = await db.select().from(entityRecordsTable)
      .where(and(
        eq(entityRecordsTable.id, contractorId),
        eq(entityRecordsTable.entityId, EMPLOYEE_ENTITY_ID)
      ));
    if (!contractor) { res.status(404).json({ error: "Contractor not found" }); return; }
    res.json(contractor);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/external/v1/contractor/reports", requireApiKey as any, async (req: Request, res: Response) => {
  try {
    const authReq = req as ApiAuthRequest;
    if (authReq.apiKeyUser?.ownerType !== "contractor") {
      res.status(403).json({ error: "API key not associated with a contractor" }); return;
    }
    if (!checkPermission(authReq.apiKeyUser?.permissions, "write:reports")) {
      res.status(403).json({ error: "Permission denied: write:reports" }); return;
    }
    const contractorId = authReq.apiKeyUser.ownerId;
    if (!contractorId) { res.status(400).json({ error: "Contractor not linked" }); return; }

    const reportEntityId = await getEntityIdBySlug("contractor_report");
    if (!reportEntityId) {
      res.status(400).json({ error: "Contractor report entity not configured" }); return;
    }

    const { data } = req.body;
    const [record] = await db.insert(entityRecordsTable).values({
      entityId: reportEntityId,
      status: "submitted",
      data: { ...data, contractor_id: String(contractorId), submitted_at: new Date().toISOString(), source: "api" },
    }).returning();

    await triggerWebhooks("contractor.report_submitted", {
      contractorId,
      reportId: record.id,
    });

    res.status(201).json(record);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/external/v1/contractor/hours", requireApiKey as any, async (req: Request, res: Response) => {
  try {
    const authReq = req as ApiAuthRequest;
    if (authReq.apiKeyUser?.ownerType !== "contractor") {
      res.status(403).json({ error: "API key not associated with a contractor" }); return;
    }
    if (!checkPermission(authReq.apiKeyUser?.permissions, "write:hours")) {
      res.status(403).json({ error: "Permission denied: write:hours" }); return;
    }
    const contractorId = authReq.apiKeyUser.ownerId;
    if (!contractorId) { res.status(400).json({ error: "Contractor not linked" }); return; }

    const ATTENDANCE_ENTITY_ID = 35;
    const { date, checkIn, checkOut, totalHours, notes } = req.body;

    const [record] = await db.insert(entityRecordsTable).values({
      entityId: ATTENDANCE_ENTITY_ID,
      status: "active",
      data: {
        employee_id: String(contractorId),
        date: date || new Date().toISOString().slice(0, 10),
        check_in: checkIn,
        check_out: checkOut,
        total_hours: totalHours,
        type: "present",
        notes: notes || "",
        source: "api",
      },
    }).returning();

    res.status(201).json(record);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function triggerWebhooks(event: string, payload: any): Promise<void> {
  try {
    const webhooks = await db.select().from(webhookConfigsTable)
      .where(eq(webhookConfigsTable.isActive, true));

    for (const webhook of webhooks) {
      const events = (webhook.events as string[]) || [];
      if (events.length > 0 && !events.includes(event) && !events.includes("*")) {
        continue;
      }

      const startTime = Date.now();
      try {
        const timestamp = new Date().toISOString();
        const bodyObj = { event, payload, timestamp };
        const bodyStr = JSON.stringify(bodyObj);
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...(webhook.headers as Record<string, string> || {}),
        };
        if (webhook.secret) {
          const crypto = await import("crypto");
          const signature = crypto.createHmac("sha256", webhook.secret)
            .update(bodyStr)
            .digest("hex");
          headers["X-Webhook-Signature"] = signature;
          headers["X-Webhook-Timestamp"] = timestamp;
        }

        const response = await fetch(webhook.url, {
          method: "POST",
          headers,
          body: bodyStr,
          signal: AbortSignal.timeout(10000),
        });

        const duration = Date.now() - startTime;
        await db.insert(webhookLogsTable).values({
          webhookId: webhook.id,
          event,
          payload,
          responseStatus: response.status,
          responseBody: await response.text().catch(() => ""),
          success: response.ok,
          duration,
        });

        if (response.ok) {
          await db.update(webhookConfigsTable).set({
            lastTriggeredAt: new Date(),
            failureCount: 0,
          }).where(eq(webhookConfigsTable.id, webhook.id));
        } else {
          await db.update(webhookConfigsTable).set({
            failureCount: webhook.failureCount + 1,
          }).where(eq(webhookConfigsTable.id, webhook.id));
        }
      } catch (err: any) {
        const duration = Date.now() - startTime;
        await db.insert(webhookLogsTable).values({
          webhookId: webhook.id,
          event,
          payload,
          responseStatus: 0,
          responseBody: err.message,
          success: false,
          duration,
        });
        await db.update(webhookConfigsTable).set({
          failureCount: webhook.failureCount + 1,
        }).where(eq(webhookConfigsTable.id, webhook.id));
      }
    }
  } catch (err) {
    console.error("[Webhooks] Error triggering webhooks:", err);
  }
}

async function getEntityIdBySlug(slug: string): Promise<number | null> {
  try {
    const { moduleEntitiesTable } = await import("@workspace/db/schema");
    const [entity] = await db.select({ id: moduleEntitiesTable.id })
      .from(moduleEntitiesTable).where(eq(moduleEntitiesTable.slug, slug));
    return entity?.id || null;
  } catch {
    return null;
  }
}

export { triggerWebhooks };
export default router;
