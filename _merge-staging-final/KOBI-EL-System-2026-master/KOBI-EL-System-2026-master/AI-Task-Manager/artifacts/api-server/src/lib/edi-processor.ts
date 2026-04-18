import { createHmac, timingSafeEqual, createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { db } from "@workspace/db";
import {
  ediTradingPartnersTable,
  ediDocumentMappingsTable,
  ediTransactionLogsTable,
  ediAcknowledgmentsTable,
  purchaseOrdersTable,
  purchaseOrderItemsTable,
  suppliersTable,
} from "@workspace/db/schema";
import { eq, and, sql, isNull } from "drizzle-orm";

export type EdiFormat = "X12" | "EDIFACT";
export type EdiDirection = "outbound" | "inbound";

const EDI_SECRET_KEY_RAW = process.env.EDI_SECRET_ENCRYPTION_KEY;
const EDI_KEY_AVAILABLE = !!EDI_SECRET_KEY_RAW;
if (!EDI_KEY_AVAILABLE && process.env.NODE_ENV === "production") {
  console.warn("[edi] WARNING: EDI_SECRET_ENCRYPTION_KEY not set — EDI encryption operations will be unavailable until the key is configured.");
}
const EDI_SECRET_KEY = EDI_KEY_AVAILABLE
  ? scryptSync(EDI_SECRET_KEY_RAW!, "edi-salt-v1", 32)
  : scryptSync("edi-dev-only-key-do-not-use-in-prod", "edi-salt-v1", 32);

const ENCRYPTED_PREFIX = "enc:v1:";

export function encryptEdiSecret(plaintext: string): string {
  if (!EDI_KEY_AVAILABLE && process.env.NODE_ENV === "production") {
    throw new Error("[edi] EDI_SECRET_ENCRYPTION_KEY not configured — cannot encrypt secrets in production");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", EDI_SECRET_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENCRYPTED_PREFIX + Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptEdiSecret(ciphertext: string): string {
  if (!EDI_KEY_AVAILABLE && process.env.NODE_ENV === "production" && ciphertext.startsWith(ENCRYPTED_PREFIX)) {
    throw new Error("[edi] EDI_SECRET_ENCRYPTION_KEY not configured — cannot decrypt secrets in production");
  }
  if (!ciphertext.startsWith(ENCRYPTED_PREFIX)) return ciphertext;
  const data = Buffer.from(ciphertext.slice(ENCRYPTED_PREFIX.length), "base64");
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", EDI_SECRET_KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

type SftpFileEntry = { name: string; type: string; size: number };
type SftpClientInstance = {
  connect(config: Record<string, unknown>): Promise<void>;
  list(path: string): Promise<SftpFileEntry[]>;
  get(path: string): Promise<Buffer | NodeJS.ReadableStream | string>;
  put(input: Buffer | NodeJS.ReadableStream | string, remotePath: string): Promise<void>;
  delete(path: string): Promise<void>;
  end(): void;
};
type SftpClientConstructor = new () => SftpClientInstance;

function getSftpClient(): SftpClientConstructor {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("ssh2-sftp-client") as SftpClientConstructor;
}

interface ParsedEDIData {
  docType: string;
  controlNumber: string | null;
  referenceNumber: string;
  invoiceNumber?: string;
  totalAmount?: number;
  segments: Record<string, { name?: string }>;
  items: Array<{
    lineNumber: string;
    quantity: number;
    unitPrice: number;
    itemCode: string;
    description?: string;
  }>;
}

type TradingPartner = typeof ediTradingPartnersTable.$inferSelect;

interface MappingRow {
  id: number;
  docType: string;
  ediFormat: string;
  direction: string;
  mappingConfig: unknown;
  transformationRules: unknown;
  validationRules: unknown;
  isActive: boolean;
}

function generateControlNumber(): string {
  return String(Date.now()).slice(-9).padStart(9, "0");
}

function applyMappingConfig(
  rawData: Record<string, unknown>,
  mappingConfig: unknown,
  direction: "inbound" | "outbound" = "outbound"
): Record<string, unknown> {
  if (!mappingConfig || typeof mappingConfig !== "object") return rawData;
  const config = mappingConfig as Record<string, string>;
  const result: Record<string, unknown> = { ...rawData };
  for (const [ediField, erpField] of Object.entries(config)) {
    if (typeof erpField !== "string") continue;
    if (direction === "inbound") {
      if (ediField in rawData) result[erpField] = rawData[ediField];
    } else {
      if (erpField in rawData) result[ediField] = rawData[erpField];
    }
  }
  return result;
}

function buildX12_850(
  order: Record<string, unknown>,
  items: Record<string, unknown>[],
  supplier: Record<string, unknown> | null,
  controlNumber: string,
  _mapping?: MappingRow | null
): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const timeStr = now.toTimeString().slice(0, 5).replace(":", "");
  const supplierId = String(order.supplierId || "").padEnd(15);
  const supplierTaxId = String(supplier?.taxId || "UNKNOWN").padEnd(15);
  const isa = `ISA*00*          *00*          *01*${supplierTaxId}*01*${supplierId}*${dateStr.slice(2)}*${timeStr}*|*00401*${controlNumber}*0*P*>~`;
  const gs = `GS*PO*SENDER*RECEIVER*${dateStr}*${timeStr}*1*X*004010~`;
  const st = `ST*850*0001~`;
  const orderNumber = String(order.orderNumber || "");
  const beg = `BEG*00*NE*${orderNumber}**${dateStr}~`;
  const currency = `CUR*BY*${String(order.currency || "ILS")}~`;
  const seg: string[] = [isa, gs, st, beg, currency];
  if (order.paymentTerms) seg.push(`ITD*01***${order.paymentTerms}~`);
  if (order.shippingAddress) seg.push(`N3*${String(order.shippingAddress).slice(0, 55)}~`);
  items.forEach((item, i) => {
    const lineNum = (i + 1) * 10;
    const qty = String(item.quantity || "1");
    const price = String(item.unitPrice || "0");
    const code = String(item.itemCode || String(item.itemDescription || "").slice(0, 30));
    const desc = String(item.itemDescription || "").slice(0, 80);
    seg.push(`PO1*${lineNum}*${qty}*EA*${price}**VP*${code}~`);
    seg.push(`PID*F****${desc}~`);
  });
  const segCount = seg.length - 2 + 2;
  seg.push(`CTT*${items.length}~`);
  seg.push(`SE*${segCount}*0001~`);
  seg.push(`GE*1*1~`);
  seg.push(`IEA*1*${controlNumber}~`);
  return seg.join("\n");
}

function buildEDIFACT_ORDERS(
  order: Record<string, unknown>,
  items: Record<string, unknown>[],
  supplier: Record<string, unknown> | null,
  controlNumber: string,
  _mapping?: MappingRow | null
): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const timeStr = now.toTimeString().slice(0, 5).replace(":", "");
  const orderNumber = String(order.orderNumber || "");
  const shippingAddr = String(order.shippingAddress || "BUYER").slice(0, 35);
  const supplierName = String(supplier?.name || "SUPPLIER").slice(0, 35);
  const lines: string[] = [
    `UNB+UNOA:2+SENDER+RECEIVER+${dateStr.slice(2)}:${timeStr}+${controlNumber}`,
    `UNH+1+ORDERS:D:96A:UN`,
    `BGM+220+${orderNumber}+9`,
    `DTM+137:${dateStr}:102`,
    `NAD+BY+++${shippingAddr}`,
    `NAD+SE+++${supplierName}`,
    `CUX+2:${String(order.currency || "ILS")}:4`,
  ];
  items.forEach((item, i) => {
    lines.push(`LIN+${i + 1}++${String(item.itemCode || "")}:SA`);
    lines.push(`IMD+F++:::${String(item.itemDescription || "").slice(0, 35)}`);
    lines.push(`QTY+21:${String(item.quantity || "1")}:PCE`);
    lines.push(`PRI+AAA:${String(item.unitPrice || "0")}`);
  });
  lines.push(`UNS+S`);
  lines.push(`CNT+2:${items.length}`);
  lines.push(`UNT+${lines.length + 1}+1`);
  lines.push(`UNZ+1+${controlNumber}`);
  return lines.join("'\n") + "'";
}

export async function generateOutboundEDI(
  orderId: number,
  docType: string,
  tradingPartnerId: number
): Promise<{ success: boolean; transactionId?: number; error?: string }> {
  try {
    const [order] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, orderId));
    if (!order) return { success: false, error: "Purchase order not found" };

    const items = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.orderId, orderId));
    const [supplier] = order.supplierId
      ? await db.select().from(suppliersTable).where(eq(suppliersTable.id, order.supplierId))
      : [null];
    const [partner] = await db.select().from(ediTradingPartnersTable).where(eq(ediTradingPartnersTable.id, tradingPartnerId));

    if (!partner) return { success: false, error: "Trading partner not found" };
    if (!partner.isActive) return { success: false, error: "Trading partner is inactive" };

    const format = partner.ediFormat as EdiFormat;
    const normalizedDocType = docType === "ORDERS" ? "ORDERS" : docType === "850" ? "850" : docType;
    const [mapping] = await db.select().from(ediDocumentMappingsTable)
      .where(and(
        eq(ediDocumentMappingsTable.tradingPartnerId, tradingPartnerId),
        eq(ediDocumentMappingsTable.direction, "outbound"),
        eq(ediDocumentMappingsTable.docType, normalizedDocType),
        eq(ediDocumentMappingsTable.ediFormat, format),
        eq(ediDocumentMappingsTable.isActive, true),
      ))
      .limit(1);

    const [partnerDefaultMapping] = mapping ? [mapping] : await db.select().from(ediDocumentMappingsTable)
      .where(and(
        eq(ediDocumentMappingsTable.tradingPartnerId, tradingPartnerId),
        eq(ediDocumentMappingsTable.direction, "outbound"),
        eq(ediDocumentMappingsTable.isDefault, true),
        eq(ediDocumentMappingsTable.isActive, true),
      ))
      .limit(1);

    const [globalDefaultMapping] = (mapping ?? partnerDefaultMapping) ? [undefined] : await db.select().from(ediDocumentMappingsTable)
      .where(and(
        isNull(ediDocumentMappingsTable.tradingPartnerId),
        eq(ediDocumentMappingsTable.direction, "outbound"),
        eq(ediDocumentMappingsTable.docType, normalizedDocType),
        eq(ediDocumentMappingsTable.ediFormat, format),
        eq(ediDocumentMappingsTable.isActive, true),
      ))
      .limit(1);

    const mappingForDoc = mapping ?? partnerDefaultMapping ?? globalDefaultMapping ?? null;

    let orderData: Record<string, unknown> = { ...order };
    if (mappingForDoc?.mappingConfig) {
      orderData = applyMappingConfig(orderData, mappingForDoc.mappingConfig);
    }
    const controlNumber = generateControlNumber();
    let rawContent = "";
    if (docType === "850" || docType === "ORDERS") {
      rawContent = format === "EDIFACT"
        ? buildEDIFACT_ORDERS(orderData, items as Record<string, unknown>[], supplier as Record<string, unknown> | null, controlNumber, mappingForDoc)
        : buildX12_850(orderData, items as Record<string, unknown>[], supplier as Record<string, unknown> | null, controlNumber, mappingForDoc);
    } else {
      rawContent = `EDI ${docType} for Order ${String(order.orderNumber)} (format: ${format}, controlNumber: ${controlNumber})`;
    }
    const [logEntry] = await db.insert(ediTransactionLogsTable).values({
      tradingPartnerId,
      docType,
      docTypeName: getDocTypeName(docType),
      direction: "outbound",
      status: "pending",
      controlNumber,
      referenceType: "purchase_order",
      referenceId: orderId,
      referenceNumber: String(order.orderNumber),
      rawContent,
      parsedData: { orderId, orderNumber: order.orderNumber, itemCount: items.length },
      fileSizeBytes: rawContent.length,
    }).returning();

    await deliverEDI(partner, rawContent, logEntry.id);
    return { success: true, transactionId: logEntry.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[edi-processor] generateOutboundEDI error:", msg);
    return { success: false, error: msg };
  }
}

export async function triggerOutboundEDIForPO(orderId: number): Promise<void> {
  try {
    const [order] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, orderId));
    if (!order) return;

    const activePartners = await db.select().from(ediTradingPartnersTable)
      .where(eq(ediTradingPartnersTable.isActive, true));

    const matchingPartner = activePartners.find(
      p => p.supplierId === order.supplierId
    );

    if (!matchingPartner) {
      console.log(`[edi] No EDI partner found for supplier ${order.supplierId}, skipping outbound EDI for PO ${order.orderNumber}`);
      return;
    }

    const format = matchingPartner.ediFormat;
    const docType = format === "EDIFACT" ? "ORDERS" : "850";
    const result = await generateOutboundEDI(orderId, docType, matchingPartner.id);
    if (result.success) {
      console.log(`[edi] Outbound EDI 850 sent for PO ${order.orderNumber} via partner ${matchingPartner.name}`);
    } else {
      console.error(`[edi] Failed to send EDI for PO ${order.orderNumber}: ${result.error}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[edi] triggerOutboundEDIForPO error:", msg);
  }
}

export function validateOutboundUrl(rawUrl: string): void {
  const url = new URL(rawUrl);
  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("EDI outbound URL must use http or https protocol");
  }
  const normalizedHost = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const blockedExact = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "::"];
  const blockedSuffixes = [".internal", ".local", ".localhost"];
  if (
    blockedExact.includes(normalizedHost) ||
    blockedSuffixes.some(s => normalizedHost.endsWith(s)) ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalizedHost) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalizedHost) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(normalizedHost) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(normalizedHost) ||
    /^169\.254\.\d{1,3}\.\d{1,3}$/.test(normalizedHost) ||
    /^fc00:/i.test(normalizedHost) ||
    /^fd[0-9a-f]{2}:/i.test(normalizedHost) ||
    normalizedHost === "0000:0000:0000:0000:0000:0000:0000:0001" ||
    normalizedHost.startsWith("::ffff:127.") ||
    normalizedHost.startsWith("::ffff:10.") ||
    normalizedHost.startsWith("::ffff:192.168.")
  ) {
    throw new Error("EDI outbound URL targets a private/internal network address");
  }
}

export function verifyWebhookSignature(
  body: string,
  receivedSignature: string | undefined,
  secret: string
): boolean {
  if (!receivedSignature) return false;
  try {
    const expected = createHmac("sha256", secret).update(body, "utf8").digest("hex");
    const expectedBuf = Buffer.from(expected, "hex");
    const sig = receivedSignature.startsWith("sha256=")
      ? receivedSignature.slice(7)
      : receivedSignature;
    const receivedBuf = Buffer.from(sig.padEnd(expected.length, "0"), "hex");
    if (expectedBuf.length !== receivedBuf.length) return false;
    return timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}

async function deliverEDI(partner: TradingPartner, content: string, logId: number): Promise<void> {
  try {
    if (partner.protocol === "webhook" && partner.webhookUrl) {
      const webhookUrl = partner.webhookUrl;
      validateOutboundUrl(webhookUrl);

      const headers: Record<string, string> = {
        "Content-Type": "text/plain",
        "X-EDI-Partner": partner.ediId ?? "",
      };

      if (partner.webhookSecret) {
        const rawSecret = decryptEdiSecret(partner.webhookSecret);
        const sig = createHmac("sha256", rawSecret).update(content, "utf8").digest("hex");
        headers["X-EDI-Signature"] = `sha256=${sig}`;
      }

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: content,
        signal: AbortSignal.timeout(10000),
      });
      const status = response.ok ? "sent" : "failed";
      await db.update(ediTransactionLogsTable).set({
        status,
        sentAt: new Date(),
        errorMessage: response.ok ? null : `HTTP ${response.status}: ${response.statusText}`,
        updatedAt: new Date(),
      }).where(eq(ediTransactionLogsTable.id, logId));
    } else if (partner.protocol === "as2") {
      if (!partner.as2Url) {
        await db.update(ediTransactionLogsTable).set({
          status: "failed",
          errorMessage: "AS2 URL not configured",
          updatedAt: new Date(),
        }).where(eq(ediTransactionLogsTable.id, logId));
        return;
      }
      validateOutboundUrl(partner.as2Url);
      const as2Headers: Record<string, string> = {
        "Content-Type": "application/edi-x12",
        "AS2-Version": "1.2",
        "AS2-From": partner.as2FromId ?? partner.ediId ?? "EDI-SENDER",
        "AS2-To": partner.as2ToId ?? "EDI-RECEIVER",
        "Message-ID": `<${Date.now()}.${logId}@edi.erp>`,
        "MIME-Version": "1.0",
      };
      const as2Response = await fetch(partner.as2Url, {
        method: "POST",
        headers: as2Headers,
        body: content,
        signal: AbortSignal.timeout(15000),
      });
      const as2Status = as2Response.ok ? "sent" : "failed";
      await db.update(ediTransactionLogsTable).set({
        status: as2Status,
        sentAt: new Date(),
        errorMessage: as2Response.ok ? null : `AS2 HTTP ${as2Response.status}: ${as2Response.statusText}`,
        updatedAt: new Date(),
      }).where(eq(ediTransactionLogsTable.id, logId));
      console.log(`[edi] AS2 outbound: log=${logId} status=${as2Status} http=${as2Response.status}`);
    } else if (partner.protocol === "sftp") {
      if (!partner.sftpHost) {
        await db.update(ediTransactionLogsTable).set({
          status: "failed",
          errorMessage: "SFTP host not configured",
          updatedAt: new Date(),
        }).where(eq(ediTransactionLogsTable.id, logId));
        return;
      }
      const outboundPath = partner.sftpOutboundPath ?? "/outbound";
      const filename = `edi_${logId}_${Date.now()}.edi`;
      const remotePath = `${outboundPath}/${filename}`;
      try {
        const sftpOut: SftpClientInstance = new (getSftpClient())();
        await sftpOut.connect({
          host: partner.sftpHost,
          port: partner.sftpPort ?? 22,
          username: partner.sftpUsername ?? "edi",
          ...(partner.sftpPassword ? { password: decryptEdiSecret(partner.sftpPassword) } : {}),
          readyTimeout: 10000,
        });
        try {
          await sftpOut.put(Buffer.from(content, "utf8"), remotePath);
          await db.update(ediTransactionLogsTable).set({
            status: "sent",
            sentAt: new Date(),
            updatedAt: new Date(),
          }).where(eq(ediTransactionLogsTable.id, logId));
          console.log(`[edi] SFTP outbound delivered: log=${logId} remote=${remotePath}`);
        } finally {
          sftpOut.end();
        }
      } catch (sftpErr: unknown) {
        const msg = sftpErr instanceof Error ? sftpErr.message : String(sftpErr);
        await db.update(ediTransactionLogsTable).set({
          status: "failed",
          errorMessage: `SFTP upload failed: ${msg}`,
          updatedAt: new Date(),
        }).where(eq(ediTransactionLogsTable.id, logId));
        console.error(`[edi] SFTP outbound failed: log=${logId} error=${msg}`);
      }
    } else {
      await db.update(ediTransactionLogsTable).set({
        status: "queued",
        updatedAt: new Date(),
      }).where(eq(ediTransactionLogsTable.id, logId));
      console.log(`[edi] API outbound queued for pickup: log=${logId} partner=${partner.id}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.update(ediTransactionLogsTable).set({
      status: "failed",
      errorMessage: msg,
      updatedAt: new Date(),
    }).where(eq(ediTransactionLogsTable.id, logId));
  }
}

export async function processInboundEDI(
  content: string,
  tradingPartnerId: number
): Promise<{ success: boolean; transactionId?: number; createdRecord?: { type: string; id: number | null } | null; error?: string }> {
  try {
    const [partner] = await db.select().from(ediTradingPartnersTable).where(eq(ediTradingPartnersTable.id, tradingPartnerId));
    const partnerFormat = (partner?.ediFormat as EdiFormat) ?? "X12";

    if (!isValidEDIEnvelope(content)) {
      const [logEntry] = await db.insert(ediTransactionLogsTable).values({
        tradingPartnerId,
        docType: "UNKNOWN",
        direction: "inbound",
        status: "quarantined",
        rawContent: content.slice(0, 2000),
        errorMessage: "Content does not contain a valid X12 (ISA*) or EDIFACT (UNB+) envelope — quarantined",
        receivedAt: new Date(),
        fileSizeBytes: content.length,
      }).returning();
      return { success: false, transactionId: logEntry.id, error: "Invalid EDI envelope: missing ISA* or UNB+ header" };
    }

    const docType = detectDocType(content);
    const parsedData = parseEDIContent(content, docType);

    if (!parsedData) {
      const [logEntry] = await db.insert(ediTransactionLogsTable).values({
        tradingPartnerId,
        docType: "UNKNOWN",
        direction: "inbound",
        status: "quarantined",
        rawContent: content,
        errorMessage: "Unable to parse EDI document",
        receivedAt: new Date(),
        fileSizeBytes: content.length,
      }).returning();
      return { success: false, transactionId: logEntry.id, error: "Unable to parse EDI document" };
    }

    const [mappingRow] = await db.select().from(ediDocumentMappingsTable)
      .where(and(
        eq(ediDocumentMappingsTable.tradingPartnerId, tradingPartnerId),
        eq(ediDocumentMappingsTable.direction, "inbound"),
        eq(ediDocumentMappingsTable.docType, docType),
        eq(ediDocumentMappingsTable.ediFormat, partnerFormat),
        eq(ediDocumentMappingsTable.isActive, true),
      ))
      .limit(1);

    const [partnerDefaultMappingRow] = mappingRow ? [mappingRow] : await db.select().from(ediDocumentMappingsTable)
      .where(and(
        eq(ediDocumentMappingsTable.tradingPartnerId, tradingPartnerId),
        eq(ediDocumentMappingsTable.direction, "inbound"),
        eq(ediDocumentMappingsTable.isDefault, true),
        eq(ediDocumentMappingsTable.isActive, true),
      ))
      .limit(1);

    const [globalDefaultMappingRow] = (mappingRow ?? partnerDefaultMappingRow) ? [undefined] : await db.select().from(ediDocumentMappingsTable)
      .where(and(
        isNull(ediDocumentMappingsTable.tradingPartnerId),
        eq(ediDocumentMappingsTable.direction, "inbound"),
        eq(ediDocumentMappingsTable.docType, docType),
        eq(ediDocumentMappingsTable.ediFormat, partnerFormat),
        eq(ediDocumentMappingsTable.isActive, true),
      ))
      .limit(1);

    const activeMapping = mappingRow ?? partnerDefaultMappingRow ?? globalDefaultMappingRow ?? null;

    let finalData: Record<string, unknown> = { ...parsedData };
    if (activeMapping?.mappingConfig) {
      finalData = applyMappingConfig(finalData, activeMapping.mappingConfig, "inbound");
    }

    const [logEntry] = await db.insert(ediTransactionLogsTable).values({
      tradingPartnerId,
      docType,
      docTypeName: getDocTypeName(docType),
      direction: "inbound",
      status: "received",
      controlNumber: parsedData.controlNumber ?? null,
      rawContent: content,
      parsedData: finalData,
      receivedAt: new Date(),
      fileSizeBytes: content.length,
    }).returning();

    let recordResult: EdiRecordResult | null = null;

    if (docType === "997" || docType === "CONTRL") {
      await handleInboundAcknowledgment(parsedData, tradingPartnerId, logEntry.id);
    } else if (docType === "810" || docType === "INVOIC") {
      recordResult = await createSupplierInvoiceFromEDI(parsedData, tradingPartnerId);
    } else if (docType === "856" || docType === "DESADV") {
      recordResult = await createASNFromEDI(parsedData, tradingPartnerId);
    }

    const recordFailed = recordResult !== null && !recordResult.ok;
    const updatedStatus = (docType === "997" || docType === "CONTRL")
      ? "processed"
      : recordFailed
        ? "failed"
        : (recordResult?.ok ? "processed" : "received");

    await db.update(ediTransactionLogsTable).set({
      status: updatedStatus,
      processedAt: new Date(),
      createdRecordType: (recordResult && recordResult.ok) ? recordResult.type : null,
      createdRecordId: (recordResult && recordResult.ok) ? recordResult.id : null,
      errorMessage: recordFailed ? (recordResult as { ok: false; error: string }).error : null,
      updatedAt: new Date(),
    }).where(eq(ediTransactionLogsTable.id, logEntry.id));

    if (recordFailed) {
      const err = (recordResult as { ok: false; type: string; error: string }).error;
      return { success: false, transactionId: logEntry.id, error: err };
    }

    if (docType !== "997" && docType !== "CONTRL") {
      await db.insert(ediAcknowledgmentsTable).values({
        transactionLogId: logEntry.id,
        tradingPartnerId,
        ackType: "997",
        status: "sent",
        acceptedSets: 1,
        rejectedSets: 0,
        receivedAt: new Date(),
      });
    }

    const createdRecord = (recordResult?.ok) ? { type: recordResult.type, id: recordResult.id } : null;
    return { success: true, transactionId: logEntry.id, createdRecord };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[edi-processor] processInboundEDI error:", msg);
    return { success: false, error: msg };
  }
}

function isValidEDIEnvelope(content: string): boolean {
  const trimmed = content.trim();
  const upper = trimmed.toUpperCase();
  const hasX12 = upper.startsWith("ISA*") || upper.includes("\nISA*") || upper.includes("\rISA*");
  const hasEDIFACT = upper.startsWith("UNB+") || upper.includes("\nUNB+") || upper.includes("'\nUNB+") || upper.includes("'UNB+");
  return hasX12 || hasEDIFACT;
}

function detectDocType(content: string): string {
  const upper = content.toUpperCase();
  const isEDIFACT = upper.includes("UNB+") || upper.includes("UNH+");
  if (isEDIFACT) {
    if (upper.includes("CONTRL")) return "CONTRL";
    if (upper.includes("INVOIC")) return "INVOIC";
    if (upper.includes("DESADV")) return "DESADV";
    if (upper.includes("ORDERS")) return "ORDERS";
  }
  if (upper.includes("ST*810")) return "810";
  if (upper.includes("ST*856")) return "856";
  if (upper.includes("ST*850")) return "850";
  if (upper.includes("ST*997")) return "997";
  return "UNKNOWN";
}

function parseEDIContent(content: string, docType: string): ParsedEDIData | null {
  try {
    const lines = content.split(/[\n\r']+/).map(l => l.trim()).filter(Boolean);
    const result: ParsedEDIData = { docType, controlNumber: null, referenceNumber: "", segments: {}, items: [] };

    for (const line of lines) {
      const parts = line.split(/[*+]/);
      const segId = parts[0];

      if (segId === "ISA") {
        result.controlNumber = parts[13]?.trim() ?? generateControlNumber();
      } else if (segId === "UNB") {
        result.controlNumber = parts[5]?.trim() ?? generateControlNumber();
      } else if (segId === "GS") {
        if (!result.segments.gs) result.segments.gs = { name: parts[6] ?? "" };
      } else if (segId === "AK1") {
        result.referenceNumber = parts[2]?.trim() ?? "";
        result.segments.ack = { name: parts[1] ?? "" };
      } else if (segId === "UCF" || segId === "UCI") {
        if (!result.referenceNumber) result.referenceNumber = parts[2]?.trim() ?? parts[1]?.trim() ?? "";
      } else if (segId === "BEG" || segId === "BGM") {
        result.referenceNumber = parts[3] ?? parts[2] ?? "";
        if (segId === "BGM") result.invoiceNumber = parts[2] ?? parts[3] ?? "";
        result.segments.header = { name: result.referenceNumber };
      } else if (segId === "BIG") {
        result.invoiceNumber = parts[2] ?? "";
      } else if (segId === "N1" || segId === "NAD") {
        const qualifier = parts[1] ?? "";
        result.segments[qualifier] = { name: parts[2] ?? "" };
      } else if (segId === "PO1" || segId === "LIN") {
        result.items.push({
          lineNumber: parts[1] ?? String(result.items.length + 1),
          quantity: parseFloat(parts[2] ?? "1") || 1,
          unitPrice: parseFloat(parts[4] ?? "0"),
          itemCode: parts[7] ?? parts[3] ?? "",
        });
      } else if (segId === "PID" || segId === "IMD") {
        if (result.items.length > 0) {
          result.items[result.items.length - 1].description = parts[4] ?? parts[3] ?? "";
        }
      } else if (segId === "TDS") {
        result.totalAmount = parseFloat((parts[1] ?? "0").replace(/[^0-9.]/g, "")) / 100;
      } else if (segId === "MOA") {
        result.totalAmount = parseFloat(parts[2] ?? "0");
      }
    }
    return result;
  } catch {
    return null;
  }
}

type EdiRecordResult =
  | { ok: true; type: string; id: number | null }
  | { ok: false; type: string; error: string };

async function createSupplierInvoiceFromEDI(
  parsedData: ParsedEDIData,
  tradingPartnerId: number
): Promise<EdiRecordResult> {
  const [partner] = await db.select().from(ediTradingPartnersTable).where(eq(ediTradingPartnersTable.id, tradingPartnerId));
  const supplierId = partner?.supplierId ?? null;
  const invoiceNumber = parsedData.invoiceNumber || parsedData.referenceNumber || `EDI-INV-${Date.now()}`;
  const totalAmount = parsedData.totalAmount ?? 0;

  const result = await db.execute<{ id: number }>(sql`
    INSERT INTO accounts_payable (
      supplier_id, supplier_name, invoice_number, amount, currency,
      paid_amount, balance_due, invoice_date, due_date, status, description, category
    )
    VALUES (
      ${supplierId}, ${partner?.name ?? "Unknown Supplier"},
      ${invoiceNumber}, ${totalAmount}, 'ILS',
      0, ${totalAmount},
      CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
      'open',
      ${"EDI Invoice " + invoiceNumber},
      'רכש'
    )
    ON CONFLICT DO NOTHING
    RETURNING id
  `);
  const rows = (result as { rows: { id: number }[] }).rows ?? [];
  const id = rows[0]?.id ?? null;
  console.log(`[edi] Created supplier invoice ${invoiceNumber} id=${id} from EDI 810 (partner ${tradingPartnerId})`);
  return { ok: true, type: "supplier_invoice", id };
}

async function createASNFromEDI(
  parsedData: ParsedEDIData,
  tradingPartnerId: number
): Promise<EdiRecordResult> {
  const [partner] = await db.select().from(ediTradingPartnersTable).where(eq(ediTradingPartnersTable.id, tradingPartnerId));
  const asnNumber = parsedData.referenceNumber || `EDI-ASN-${Date.now()}`;
  const supplierId = partner?.supplierId ?? null;

  if (!supplierId) {
    return { ok: false, type: "advance_shipment_notice", error: `Trading partner ${tradingPartnerId} has no linked supplierId — cannot create goods receipt` };
  }

  const result = await db.execute<{ id: number }>(sql`
    INSERT INTO goods_receipts (
      receipt_number, supplier_id, supplier_name,
      receipt_date, status, notes
    )
    VALUES (
      ${asnNumber}, ${supplierId}, ${partner?.name ?? "Unknown Supplier"},
      CURRENT_DATE, 'חדש',
      ${"נוצר אוטומטית מ-ASN (EDI " + asnNumber + ")"}
    )
    ON CONFLICT DO NOTHING
    RETURNING id
  `);
  const rows = (result as { rows: { id: number }[] }).rows ?? [];
  const id = rows[0]?.id ?? null;
  console.log(`[edi] Created goods receipt ${asnNumber} id=${id} from EDI 856 ASN (partner ${tradingPartnerId})`);
  return { ok: true, type: "advance_shipment_notice", id };
}

async function handleInboundAcknowledgment(
  parsedData: ParsedEDIData,
  tradingPartnerId: number,
  ackLogId: number
): Promise<void> {
  try {
    const candidateControlNumbers: string[] = [];
    if (parsedData.referenceNumber) candidateControlNumbers.push(parsedData.referenceNumber);
    if (parsedData.controlNumber && parsedData.controlNumber !== parsedData.referenceNumber) {
      candidateControlNumbers.push(parsedData.controlNumber);
    }

    let linkedTransactionId: number | null = null;
    for (const candidate of candidateControlNumbers) {
      if (!candidate) continue;
      const [matching] = await db.select().from(ediTransactionLogsTable)
        .where(and(
          eq(ediTransactionLogsTable.tradingPartnerId, tradingPartnerId),
          eq(ediTransactionLogsTable.direction, "outbound"),
          eq(ediTransactionLogsTable.controlNumber, candidate),
        ))
        .limit(1);

      if (matching) {
        linkedTransactionId = matching.id;
        await db.update(ediTransactionLogsTable).set({
          acknowledgedAt: new Date(),
          status: "acknowledged",
          updatedAt: new Date(),
        }).where(eq(ediTransactionLogsTable.id, matching.id));
        break;
      }
    }

    await db.insert(ediAcknowledgmentsTable).values({
      transactionLogId: linkedTransactionId ?? ackLogId,
      tradingPartnerId,
      ackType: parsedData.docType === "CONTRL" ? "CONTRL" : "997",
      status: "received",
      controlNumber: parsedData.controlNumber ?? null,
      acceptedSets: 1,
      rejectedSets: 0,
      receivedAt: new Date(),
    });

    console.log(`[edi] Inbound 997/CONTRL processed — linked to outbound tx ${linkedTransactionId ?? "none"} (candidates: ${candidateControlNumbers.join(", ")})`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[edi] handleInboundAcknowledgment error:", msg);
  }
}

function getDocTypeName(docType: string): string {
  const names: Record<string, string> = {
    "850": "Purchase Order",
    "ORDERS": "Purchase Order",
    "810": "Invoice",
    "INVOIC": "Invoice",
    "856": "Advance Ship Notice",
    "DESADV": "Despatch Advice",
    "997": "Functional Acknowledgment",
    "CONTRL": "Control Message",
  };
  return names[docType] ?? docType;
}

export interface SftpPollResult {
  partnerId: number;
  partnerName: string;
  filesFound: number;
  filesProcessed: number;
  filesFailed: number;
  filesQuarantined: number;
  transactionIds: number[];
  errors: string[];
}

export async function pollSftpInbound(partnerId: number): Promise<SftpPollResult> {
  const result: SftpPollResult = {
    partnerId,
    partnerName: "",
    filesFound: 0,
    filesProcessed: 0,
    filesFailed: 0,
    filesQuarantined: 0,
    transactionIds: [],
    errors: [],
  };

  const [partner] = await db.select().from(ediTradingPartnersTable).where(eq(ediTradingPartnersTable.id, partnerId));
  if (!partner) throw new Error("Trading partner not found");
  if (!partner.isActive) throw new Error("Trading partner is inactive");
  if (partner.protocol !== "sftp") throw new Error("Trading partner does not use SFTP protocol");
  if (!partner.sftpHost) throw new Error("SFTP host not configured");

  result.partnerName = partner.name;

  const sftpHost = partner.sftpHost;
  const sftpPort = partner.sftpPort ?? 22;
  const sftpUser = partner.sftpUsername ?? "edi";
  const sftpPassword = partner.sftpPassword ? decryptEdiSecret(partner.sftpPassword) : undefined;
  const inboundPath = partner.sftpInboundPath ?? "/inbound";

  const sftp: SftpClientInstance = new (getSftpClient())();
  try {
    await sftp.connect({
      host: sftpHost,
      port: sftpPort,
      username: sftpUser,
      ...(sftpPassword ? { password: sftpPassword } : {}),
      readyTimeout: 10000,
    });

    const fileList = await sftp.list(inboundPath);
    const ediFiles = fileList.filter(
      f => f.type === "-" && f.size > 0 && /\.(edi|x12|edifact|txt|dat)$/i.test(f.name)
    );
    result.filesFound = ediFiles.length;

    for (const file of ediFiles) {
      const filePath = `${inboundPath}/${file.name}`;
      try {
        const raw = await sftp.get(filePath);
        const content = typeof raw === "string" ? raw : Buffer.isBuffer(raw) ? raw.toString("utf8") : await streamToString(raw as NodeJS.ReadableStream);

        const { success, transactionId, error } = await processInboundEDI(content, partnerId);

        if (success && transactionId) {
          result.filesProcessed++;
          result.transactionIds.push(transactionId);
          await sftp.delete(filePath).catch(() => {});
        } else {
          result.filesQuarantined++;
          result.errors.push(`${file.name}: ${error ?? "parse error"}`);
          await db.execute(sql`
            UPDATE edi_transaction_logs SET status = 'quarantined'
            WHERE id = ${transactionId ?? -1}
          `).catch(() => {});
        }
      } catch (fileErr: unknown) {
        result.filesFailed++;
        result.errors.push(`${file.name}: ${fileErr instanceof Error ? fileErr.message : String(fileErr)}`);
      }
    }
  } finally {
    sftp.end();
    await db.update(ediTradingPartnersTable)
      .set({ lastContactAt: new Date(), updatedAt: new Date() })
      .where(eq(ediTradingPartnersTable.id, partnerId));
  }

  return result;
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function retryEDITransaction(transactionId: number): Promise<{ success: boolean; error?: string }> {
  try {
    const [tx] = await db.select().from(ediTransactionLogsTable).where(eq(ediTransactionLogsTable.id, transactionId));
    if (!tx) return { success: false, error: "Transaction not found" };
    if (tx.retryCount >= tx.maxRetries) return { success: false, error: "Max retries exceeded" };

    const [partner] = tx.tradingPartnerId
      ? await db.select().from(ediTradingPartnersTable).where(eq(ediTradingPartnersTable.id, tx.tradingPartnerId))
      : [null];
    if (!partner) return { success: false, error: "Trading partner not found" };

    await db.update(ediTransactionLogsTable).set({
      retryCount: tx.retryCount + 1,
      status: "pending",
      updatedAt: new Date(),
    }).where(eq(ediTransactionLogsTable.id, transactionId));

    if (tx.direction === "outbound" && tx.rawContent) {
      await deliverEDI(partner, tx.rawContent, transactionId);
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}
