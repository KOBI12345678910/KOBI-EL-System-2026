import { Router, type IRouter, type Request, type Response } from "express";
import { timingSafeEqual } from "crypto";
import { db } from "@workspace/db";
import {
  ediTradingPartnersTable,
  ediDocumentMappingsTable,
  ediTransactionLogsTable,
  ediAcknowledgmentsTable,
} from "@workspace/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  generateOutboundEDI,
  processInboundEDI,
  retryEDITransaction,
  verifyWebhookSignature,
  pollSftpInbound,
  encryptEdiSecret,
  decryptEdiSecret,
  validateOutboundUrl,
} from "../lib/edi-processor";

const router: IRouter = Router();

type TradingPartnerRow = typeof ediTradingPartnersTable.$inferSelect;
type RedactedPartner = Omit<TradingPartnerRow, "webhookSecret" | "sftpPassword" | "apiKey"> & { webhookSecret: string | null; sftpPassword: string | null; apiKey: string | null };

function redactPartnerSecrets(partner: TradingPartnerRow): RedactedPartner {
  const { webhookSecret, sftpPassword, apiKey, ...rest } = partner;
  return {
    ...rest,
    webhookSecret: webhookSecret ? "••••••••" : null,
    sftpPassword: sftpPassword ? "••••••••" : null,
    apiKey: apiKey ? "••••••••" : null,
  };
}

router.get("/edi/trading-partners", async (_req: Request, res: Response) => {
  try {
    const partners = await db.select().from(ediTradingPartnersTable).orderBy(ediTradingPartnersTable.name);
    res.json(partners.map(p => redactPartnerSecrets(p)));
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : "Internal error" });
  }
});

router.get("/edi/trading-partners/:id", async (req: Request, res: Response) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [partner] = await db.select().from(ediTradingPartnersTable).where(eq(ediTradingPartnersTable.id, id));
    if (!partner) return res.status(404).json({ message: "Not found" });
    res.json(redactPartnerSecrets(partner));
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Bad request" });
  }
});

const tradingPartnerSchema = z.object({
  name: z.string().min(1),
  supplierId: z.coerce.number().int().positive().optional().nullable(),
  ediId: z.string().optional().nullable(),
  ediQualifier: z.string().optional().nullable(),
  protocol: z.enum(["webhook", "sftp", "api", "as2"]).default("webhook"),
  webhookUrl: z.string().url().optional().nullable(),
  webhookSecret: z.string().optional().nullable(),
  sftpHost: z.string().optional().nullable(),
  sftpPort: z.coerce.number().optional().nullable(),
  sftpUsername: z.string().optional().nullable(),
  sftpPassword: z.string().optional().nullable(),
  sftpInboundPath: z.string().optional().nullable(),
  sftpOutboundPath: z.string().optional().nullable(),
  as2Url: z.string().url().optional().nullable(),
  as2FromId: z.string().optional().nullable(),
  as2ToId: z.string().optional().nullable(),
  apiKey: z.string().optional().nullable(),
  ediFormat: z.enum(["X12", "EDIFACT"]).default("X12"),
  supportedDocTypes: z.array(z.string()).optional(),
  isActive: z.boolean().optional().default(true),
  testMode: z.boolean().optional().default(false),
  notes: z.string().optional().nullable(),
});

const REDACTED_PLACEHOLDER = "••••••••";

function stripRedactedSecrets<T extends Record<string, unknown>>(body: T): T {
  const result = { ...body };
  if (result.webhookSecret === REDACTED_PLACEHOLDER || result.webhookSecret === "") delete result.webhookSecret;
  if (result.sftpPassword === REDACTED_PLACEHOLDER || result.sftpPassword === "") delete result.sftpPassword;
  if (result.apiKey === REDACTED_PLACEHOLDER || result.apiKey === "") delete result.apiKey;
  return result;
}

function encryptBodySecrets(body: Record<string, unknown>): Record<string, unknown> {
  const out = { ...body };
  if (typeof out.webhookSecret === "string" && out.webhookSecret) {
    out.webhookSecret = encryptEdiSecret(out.webhookSecret);
  }
  if (typeof out.sftpPassword === "string" && out.sftpPassword) {
    out.sftpPassword = encryptEdiSecret(out.sftpPassword);
  }
  if (typeof out.apiKey === "string" && out.apiKey) {
    out.apiKey = encryptEdiSecret(out.apiKey);
  }
  return out;
}

router.post("/edi/trading-partners", async (req: Request, res: Response) => {
  try {
    const body = encryptBodySecrets(tradingPartnerSchema.parse(req.body) as Record<string, unknown>);
    const [partner] = await db.insert(ediTradingPartnersTable).values(body as typeof ediTradingPartnersTable.$inferInsert).returning();
    res.status(201).json(redactPartnerSecrets(partner));
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Bad request" });
  }
});

router.put("/edi/trading-partners/:id", async (req: Request, res: Response) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const rawBody = tradingPartnerSchema.partial().parse(req.body);
    const stripped = stripRedactedSecrets(rawBody as Record<string, unknown>);
    const body = encryptBodySecrets(stripped);
    const [partner] = await db.update(ediTradingPartnersTable)
      .set({ ...body, updatedAt: new Date() } as Partial<typeof ediTradingPartnersTable.$inferInsert>)
      .where(eq(ediTradingPartnersTable.id, id))
      .returning();
    if (!partner) return res.status(404).json({ message: "Not found" });
    res.json(redactPartnerSecrets(partner));
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Bad request" });
  }
});

router.delete("/edi/trading-partners/:id", async (req: Request, res: Response) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [deleted] = await db.delete(ediTradingPartnersTable).where(eq(ediTradingPartnersTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Bad request" });
  }
});

router.post("/edi/trading-partners/:id/test", async (req: Request, res: Response) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [partner] = await db.select().from(ediTradingPartnersTable).where(eq(ediTradingPartnersTable.id, id));
    if (!partner) return res.status(404).json({ message: "Not found" });

    if (partner.protocol === "sftp" && partner.sftpHost) {
      try {
        type SftpTestClient = {
          connect(c: Record<string, unknown>): Promise<void>;
          list(p: string): Promise<unknown[]>;
          end(): void;
        };
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const SftpClass = require("ssh2-sftp-client") as new () => SftpTestClient;
        const sftpClient = new SftpClass();
        await sftpClient.connect({
          host: partner.sftpHost,
          port: partner.sftpPort ?? 22,
          username: partner.sftpUsername ?? "edi",
          ...(partner.sftpPassword ? { password: decryptEdiSecret(partner.sftpPassword) } : {}),
          readyTimeout: 8000,
        });
        try {
          await sftpClient.list(partner.sftpInboundPath ?? "/inbound");
          await db.update(ediTradingPartnersTable).set({ lastContactAt: new Date(), updatedAt: new Date() }).where(eq(ediTradingPartnersTable.id, id));
          res.json({ success: true, message: `SFTP connection to ${partner.sftpHost}:${partner.sftpPort ?? 22} succeeded` });
        } finally {
          sftpClient.end();
        }
      } catch (sftpErr: unknown) {
        res.json({ success: false, error: sftpErr instanceof Error ? sftpErr.message : "SFTP connection failed" });
      }
    } else if (partner.protocol === "as2" && partner.as2Url) {
      try {
        validateOutboundUrl(partner.as2Url);
        const response = await fetch(partner.as2Url, {
          method: "OPTIONS",
          headers: { "AS2-From": partner.as2FromId ?? "EDI-SENDER", "AS2-To": partner.as2ToId ?? "EDI-RECEIVER" },
          signal: AbortSignal.timeout(5000),
        });
        await db.update(ediTradingPartnersTable).set({ lastContactAt: new Date(), updatedAt: new Date() }).where(eq(ediTradingPartnersTable.id, id));
        res.json({ success: response.ok || response.status < 500, httpStatus: response.status, message: `AS2 endpoint responded with HTTP ${response.status}` });
      } catch (as2Err: unknown) {
        res.json({ success: false, error: as2Err instanceof Error ? as2Err.message : "AS2 connection failed" });
      }
    } else if (partner.protocol === "webhook" && partner.webhookUrl) {
      const webhookUrl = partner.webhookUrl;
      try {
        validateOutboundUrl(webhookUrl);
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain", "X-EDI-Test": "true" },
          body: "ISA*00*TEST~",
          signal: AbortSignal.timeout(5000),
        });
        await db.update(ediTradingPartnersTable)
          .set({ lastContactAt: new Date(), updatedAt: new Date() })
          .where(eq(ediTradingPartnersTable.id, id));
        res.json({ success: response.ok, httpStatus: response.status });
      } catch (fetchErr: unknown) {
        res.json({ success: false, error: fetchErr instanceof Error ? fetchErr.message : "Connection failed" });
      }
    } else {
      res.json({ success: true, message: "Connection test skipped — no webhook configured" });
    }
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Bad request" });
  }
});

const mappingSchema = z.object({
  tradingPartnerId: z.coerce.number().int().positive().optional().nullable(),
  docType: z.string().min(1),
  docTypeName: z.string().optional().nullable(),
  ediFormat: z.enum(["X12", "EDIFACT"]).default("X12"),
  direction: z.enum(["inbound", "outbound"]).default("outbound"),
  mappingConfig: z.record(z.string()).optional(),
  transformationRules: z.array(z.unknown()).optional(),
  validationRules: z.array(z.unknown()).optional(),
  isActive: z.boolean().optional().default(true),
  isDefault: z.boolean().optional().default(false),
  notes: z.string().optional().nullable(),
});

router.get("/edi/mappings", async (req: Request, res: Response) => {
  try {
    const partnerId = req.query.partnerId ? z.coerce.number().int().positive().parse(req.query.partnerId) : null;
    const rows = partnerId
      ? await db.select().from(ediDocumentMappingsTable)
          .where(eq(ediDocumentMappingsTable.tradingPartnerId, partnerId))
          .orderBy(ediDocumentMappingsTable.docType)
      : await db.select().from(ediDocumentMappingsTable).orderBy(ediDocumentMappingsTable.docType);
    res.json(rows);
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : "Internal error" });
  }
});

router.post("/edi/mappings", async (req: Request, res: Response) => {
  try {
    const body = mappingSchema.parse(req.body);
    const [mapping] = await db.insert(ediDocumentMappingsTable).values(body).returning();
    res.status(201).json(mapping);
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Bad request" });
  }
});

router.put("/edi/mappings/:id", async (req: Request, res: Response) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = mappingSchema.partial().parse(req.body);
    const [mapping] = await db.update(ediDocumentMappingsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(ediDocumentMappingsTable.id, id))
      .returning();
    if (!mapping) return res.status(404).json({ message: "Not found" });
    res.json(mapping);
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Bad request" });
  }
});

router.delete("/edi/mappings/:id", async (req: Request, res: Response) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [deleted] = await db.delete(ediDocumentMappingsTable).where(eq(ediDocumentMappingsTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Bad request" });
  }
});

router.get("/edi/transactions/stats", async (_req: Request, res: Response) => {
  try {
    const statsResult = await db.execute<{
      total: string; sent: string; received: string; processed: string;
      failed: string; pending: string; quarantined: string; queued: string;
      outbound: string; inbound: string;
    }>(sql`
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE status = 'sent')::text AS sent,
        COUNT(*) FILTER (WHERE status = 'received')::text AS received,
        COUNT(*) FILTER (WHERE status = 'processed')::text AS processed,
        COUNT(*) FILTER (WHERE status = 'failed')::text AS failed,
        COUNT(*) FILTER (WHERE status = 'pending')::text AS pending,
        COUNT(*) FILTER (WHERE status = 'quarantined')::text AS quarantined,
        COUNT(*) FILTER (WHERE status = 'queued')::text AS queued,
        COUNT(*) FILTER (WHERE direction = 'outbound')::text AS outbound,
        COUNT(*) FILTER (WHERE direction = 'inbound')::text AS inbound
      FROM edi_transaction_logs
    `);
    const pendingAckResult = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*)::text AS count FROM edi_transaction_logs
      WHERE direction = 'outbound' AND status = 'sent' AND acknowledged_at IS NULL
    `);
    type StatsRow = { total: string; sent: string; received: string; processed: string; failed: string; pending: string; quarantined: string; queued: string; outbound: string; inbound: string };
    type AckRow = { count: string };
    const statsRows: StatsRow[] = (statsResult as { rows: StatsRow[] }).rows ?? [];
    const pendingAckRows: AckRow[] = (pendingAckResult as { rows: AckRow[] }).rows ?? [];
    const statsRow = statsRows[0];
    const pendingAckCount = pendingAckRows[0]?.count ?? "0";
    if (!statsRow) {
      return res.json({ total: 0, sent: 0, received: 0, processed: 0, failed: 0, pending: 0, quarantined: 0, queued: 0, outbound: 0, inbound: 0, pendingAck: 0 });
    }
    res.json({
      total: Number(statsRow.total),
      sent: Number(statsRow.sent),
      received: Number(statsRow.received),
      processed: Number(statsRow.processed),
      failed: Number(statsRow.failed),
      pending: Number(statsRow.pending),
      quarantined: Number(statsRow.quarantined),
      queued: Number(statsRow.queued),
      outbound: Number(statsRow.outbound),
      inbound: Number(statsRow.inbound),
      pendingAck: Number(pendingAckCount),
    });
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : "Internal error" });
  }
});

router.get("/edi/transactions", async (req: Request, res: Response) => {
  try {
    const partnerId = req.query.partnerId ? z.coerce.number().int().positive().parse(req.query.partnerId) : null;
    const status = typeof req.query.status === "string" && req.query.status !== "all" ? req.query.status : null;
    const direction = typeof req.query.direction === "string" && req.query.direction !== "all" ? req.query.direction : null;
    const limit = Math.min(z.coerce.number().default(100).parse(req.query.limit), 500);

    const conditions = [];
    if (partnerId) conditions.push(eq(ediTransactionLogsTable.tradingPartnerId, partnerId));
    if (status) conditions.push(eq(ediTransactionLogsTable.status, status));
    if (direction) conditions.push(eq(ediTransactionLogsTable.direction, direction));

    const rows = conditions.length > 0
      ? await db.select().from(ediTransactionLogsTable)
          .where(and(...conditions))
          .orderBy(desc(ediTransactionLogsTable.createdAt))
          .limit(limit)
      : await db.select().from(ediTransactionLogsTable)
          .orderBy(desc(ediTransactionLogsTable.createdAt))
          .limit(limit);

    res.json(rows);
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : "Internal error" });
  }
});

router.get("/edi/transactions/:id", async (req: Request, res: Response) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [tx] = await db.select().from(ediTransactionLogsTable).where(eq(ediTransactionLogsTable.id, id));
    if (!tx) return res.status(404).json({ message: "Not found" });
    res.json(tx);
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Bad request" });
  }
});

router.post("/edi/transactions/:id/retry", async (req: Request, res: Response) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const result = await retryEDITransaction(id);
    if (!result.success) return res.status(400).json({ message: result.error });
    res.json({ message: "Retry initiated" });
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Bad request" });
  }
});

router.post("/edi/send/purchase-order/:orderId", async (req: Request, res: Response) => {
  try {
    const orderId = z.coerce.number().int().positive().parse(req.params.orderId);
    const { tradingPartnerId, docType = "850" } = z.object({
      tradingPartnerId: z.coerce.number().int().positive(),
      docType: z.string().optional(),
    }).parse(req.body);

    const result = await generateOutboundEDI(orderId, docType, tradingPartnerId);
    if (!result.success) return res.status(400).json({ message: result.error });
    res.json({ message: "EDI document sent", transactionId: result.transactionId });
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Bad request" });
  }
});

router.post("/edi/receive", async (req: Request, res: Response) => {
  try {
    const { content, tradingPartnerId } = z.object({
      content: z.string().min(1),
      tradingPartnerId: z.coerce.number().int().positive(),
    }).parse(req.body);

    const result = await processInboundEDI(content, tradingPartnerId);
    if (!result.success) {
      return res.status(400).json({ message: result.error, transactionId: result.transactionId });
    }
    res.json({ message: "EDI document received and processed", transactionId: result.transactionId, createdRecord: result.createdRecord });
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Bad request" });
  }
});

router.post("/edi/webhook/:partnerId", async (req: Request, res: Response) => {
  try {
    const partnerId = z.coerce.number().int().positive().parse(req.params.partnerId);
    const [partner] = await db.select().from(ediTradingPartnersTable).where(eq(ediTradingPartnersTable.id, partnerId));
    if (!partner) return res.status(404).json({ message: "Trading partner not found" });

    const rawBodyBuf = (req as Request & { rawBody?: Buffer }).rawBody;
    const rawBodyStr: string = rawBodyBuf
      ? rawBodyBuf.toString("utf8")
      : typeof req.body === "string" && req.body.length > 0
        ? req.body
        : "";
    if (!rawBodyStr.trim()) {
      return res.status(400).json({ message: "Empty or missing EDI payload" });
    }

    if (!partner.webhookSecret) {
      return res.status(403).json({ message: "Webhook signature secret is not configured for this partner — inbound webhook delivery is disabled" });
    }
    const signature = req.headers["x-edi-signature"] as string | undefined;
    const plainSecret = decryptEdiSecret(partner.webhookSecret);
    if (!verifyWebhookSignature(rawBodyStr, signature, plainSecret)) {
      return res.status(401).json({ message: "Invalid webhook signature" });
    }

    const result = await processInboundEDI(rawBodyStr, partnerId);
    if (!result.success) {
      return res.status(422).json({ received: false, error: result.error, transactionId: result.transactionId });
    }
    res.json({ received: true, transactionId: result.transactionId, createdRecord: result.createdRecord });
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Bad request" });
  }
});

router.post("/edi/sftp/poll/:partnerId", async (req: Request, res: Response) => {
  try {
    const partnerId = z.coerce.number().int().positive().parse(req.params.partnerId);
    const pollResult = await pollSftpInbound(partnerId);
    res.json({
      ...pollResult,
      polledAt: new Date().toISOString(),
      message: pollResult.filesFound === 0
        ? "SFTP poll complete — no new EDI files found"
        : `SFTP poll complete — processed ${pollResult.filesProcessed}/${pollResult.filesFound} files`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "SFTP poll failed";
    res.status(400).json({ message: msg });
  }
});

router.get("/edi/sftp/queued", async (_req: Request, res: Response) => {
  try {
    const queued = await db.select().from(ediTransactionLogsTable)
      .where(and(
        eq(ediTransactionLogsTable.status, "queued"),
        eq(ediTransactionLogsTable.direction, "outbound"),
      ))
      .orderBy(desc(ediTransactionLogsTable.createdAt))
      .limit(100);
    res.json(queued);
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : "Internal error" });
  }
});

function verifyPickupApiKey(partner: typeof ediTradingPartnersTable.$inferSelect, headerKey: string | undefined): boolean {
  if (!partner.apiKey) return false;
  if (!headerKey) return false;
  const plainKey = decryptEdiSecret(partner.apiKey);
  const a = Buffer.from(plainKey, "utf8");
  const b = Buffer.from(headerKey, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

router.get("/edi/pickup/:partnerId", async (req: Request, res: Response) => {
  try {
    const partnerId = z.coerce.number().int().positive().parse(req.params.partnerId);
    const [partner] = await db.select().from(ediTradingPartnersTable).where(eq(ediTradingPartnersTable.id, partnerId));
    if (!partner) return res.status(404).json({ message: "Trading partner not found" });
    if (!partner.apiKey) {
      return res.status(403).json({ message: "API key is not configured for this partner — pickup is disabled" });
    }
    const headerKey = req.headers["x-edi-api-key"] as string | undefined;
    if (!verifyPickupApiKey(partner, headerKey)) {
      return res.status(401).json({ message: "Invalid or missing X-EDI-API-Key" });
    }
    const queued = await db.select().from(ediTransactionLogsTable)
      .where(and(
        eq(ediTransactionLogsTable.tradingPartnerId, partnerId),
        eq(ediTransactionLogsTable.status, "queued"),
        eq(ediTransactionLogsTable.direction, "outbound"),
      ))
      .orderBy(desc(ediTransactionLogsTable.createdAt))
      .limit(50);
    res.json({ partnerId, count: queued.length, documents: queued.map(r => ({ id: r.id, docType: r.docType, controlNumber: r.controlNumber, referenceNumber: r.referenceNumber, createdAt: r.createdAt, rawContent: r.rawContent })) });
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Bad request" });
  }
});

router.post("/edi/pickup/:logId/acknowledge", async (req: Request, res: Response) => {
  try {
    const logId = z.coerce.number().int().positive().parse(req.params.logId);
    const [log] = await db.select().from(ediTransactionLogsTable).where(eq(ediTransactionLogsTable.id, logId));
    if (!log) return res.status(404).json({ message: "Transaction not found" });
    if (log.tradingPartnerId == null) return res.status(400).json({ message: "Transaction has no associated partner" });
    const [partner] = await db.select().from(ediTradingPartnersTable).where(eq(ediTradingPartnersTable.id, log.tradingPartnerId));
    if (!partner?.apiKey) {
      return res.status(403).json({ message: "API key is not configured for this partner — pickup is disabled" });
    }
    const headerKey = req.headers["x-edi-api-key"] as string | undefined;
    if (!verifyPickupApiKey(partner, headerKey)) {
      return res.status(401).json({ message: "Invalid or missing X-EDI-API-Key" });
    }
    if (log.direction !== "outbound") return res.status(400).json({ message: "Only outbound transactions can be acknowledged via pickup" });
    if (log.status !== "queued") return res.status(409).json({ message: `Transaction is not in queued state (current: ${log.status})` });
    const [updated] = await db.update(ediTransactionLogsTable)
      .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
      .where(eq(ediTransactionLogsTable.id, logId))
      .returning();
    res.json({ acknowledged: true, transactionId: updated.id, status: updated.status });
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Bad request" });
  }
});

router.get("/edi/acknowledgments", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(ediAcknowledgmentsTable)
      .orderBy(desc(ediAcknowledgmentsTable.createdAt))
      .limit(200);
    res.json(rows);
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : "Internal error" });
  }
});

router.get("/edi/analytics", async (_req: Request, res: Response) => {
  try {
    const byPartnerRows = await db.execute<{
      partner_id: number; partner_name: string; total: string; sent: string; failed: string; processed: string;
    }>(sql`
      SELECT
        tp.id AS partner_id,
        tp.name AS partner_name,
        COUNT(tl.id)::text AS total,
        COUNT(tl.id) FILTER (WHERE tl.status = 'sent')::text AS sent,
        COUNT(tl.id) FILTER (WHERE tl.status = 'failed')::text AS failed,
        COUNT(tl.id) FILTER (WHERE tl.status = 'processed')::text AS processed
      FROM edi_trading_partners tp
      LEFT JOIN edi_transaction_logs tl ON tl.trading_partner_id = tp.id
      GROUP BY tp.id, tp.name
      HAVING COUNT(tl.id) > 0
      ORDER BY COUNT(tl.id) DESC
    `);

    const byDocTypeRows = await db.execute<{
      doc_type: string; doc_type_name: string; count: string;
    }>(sql`
      SELECT doc_type, doc_type_name, COUNT(*)::text AS count
      FROM edi_transaction_logs
      GROUP BY doc_type, doc_type_name
      ORDER BY COUNT(*) DESC
    `);

    const last30Days = await db.execute<{
      date: string; count: string; failed: string;
    }>(sql`
      SELECT
        DATE(created_at)::text AS date,
        COUNT(*)::text AS count,
        COUNT(*) FILTER (WHERE status = 'failed')::text AS failed
      FROM edi_transaction_logs
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at)
    `);

    const partnerRows = (byPartnerRows as { rows: typeof byPartnerRows }).rows ?? [];
    const docTypeRows = (byDocTypeRows as { rows: typeof byDocTypeRows }).rows ?? [];
    const dayRows = (last30Days as { rows: typeof last30Days }).rows ?? [];

    res.json({
      byPartner: partnerRows.map(r => ({
        partnerId: r.partner_id,
        partnerName: r.partner_name,
        total: Number(r.total),
        sent: Number(r.sent),
        failed: Number(r.failed),
        processed: Number(r.processed),
      })),
      byDocType: docTypeRows.map(r => ({
        docType: r.doc_type,
        docTypeName: r.doc_type_name || r.doc_type,
        count: Number(r.count),
      })),
      last30Days: dayRows.map(r => ({
        date: r.date,
        count: Number(r.count),
        failed: Number(r.failed),
      })),
    });
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : "Internal error" });
  }
});

export default router;
