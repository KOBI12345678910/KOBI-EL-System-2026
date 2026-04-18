import { db } from "@workspace/db";
import {
  integrationConnectionsTable,
  integrationEndpointsTable,
  integrationWebhooksTable,
  integrationSyncLogsTable,
  entityRecordsTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { type InferSelectModel } from "drizzle-orm";
import dns from "node:dns/promises";
import net from "node:net";

type ConnectionRow = InferSelectModel<typeof integrationConnectionsTable>;
type EndpointRow = InferSelectModel<typeof integrationEndpointsTable>;

interface FieldMapping {
  source: string;
  target: string;
  transform?: string;
  direction?: "request" | "response";
}

const BLOCKED_HOSTS = new Set([
  "localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]",
  "metadata.google.internal", "169.254.169.254",
]);

function extractIpv4FromMappedIpv6(addr: string): string | null {
  const stripped = addr.replace(/^\[|\]$/g, "");
  const mappedMatch = stripped.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (mappedMatch) return mappedMatch[1];
  const hexMapped = stripped.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16);
    const lo = parseInt(hexMapped[2], 16);
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }
  return null;
}

function isPrivateIp(rawAddr: string): boolean {
  const addr = rawAddr.replace(/^\[|\]$/g, "").replace(/%.*$/, "").toLowerCase();

  if (addr === "::1" || addr === "::" || addr === "0.0.0.0" || addr === "localhost") return true;

  const mappedV4 = extractIpv4FromMappedIpv6(addr);
  if (mappedV4) return isPrivateIpv4(mappedV4);

  if (net.isIPv4(addr)) return isPrivateIpv4(addr);

  if (/^f[cd]/i.test(addr)) return true;
  if (/^fe80/i.test(addr)) return true;
  if (/^ff0[0-9a-f]/i.test(addr)) return true;
  if (addr === "::ffff:0:0" || addr.startsWith("::ffff:0:")) return true;

  return false;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

async function validateUrl(urlStr: string): Promise<{ valid: boolean; reason?: string }> {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { valid: false, reason: "Only http and https protocols are allowed" };
    }
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (BLOCKED_HOSTS.has(hostname) || BLOCKED_HOSTS.has(parsed.hostname.toLowerCase())) {
      return { valid: false, reason: "Target host is not allowed" };
    }
    if (isPrivateIp(hostname)) {
      return { valid: false, reason: "Target must not be a private network address" };
    }

    if (!net.isIP(hostname)) {
      try {
        const addresses4 = await dns.resolve4(hostname).catch(() => [] as string[]);
        const addresses6 = await dns.resolve6(hostname).catch(() => [] as string[]);
        const allAddresses = [...addresses4, ...addresses6];

        if (allAddresses.length === 0) {
          return { valid: false, reason: "Could not resolve hostname" };
        }

        for (const addr of allAddresses) {
          if (isPrivateIp(addr)) {
            return { valid: false, reason: "Target hostname resolves to a private network address" };
          }
        }
      } catch {
        return { valid: false, reason: "DNS resolution failed" };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: "Invalid URL" };
  }
}

const MAX_REDIRECTS = 5;

async function safeFetch(url: string, init: RequestInit): Promise<Response> {
  let currentUrl = url;
  let redirectCount = 0;

  while (redirectCount <= MAX_REDIRECTS) {
    const response = await fetch(currentUrl, { ...init, redirect: "manual" });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirect with no Location header");

      const nextUrl = new URL(location, currentUrl).toString();
      const check = await validateUrl(nextUrl);
      if (!check.valid) {
        throw new Error(`Redirect to blocked target: ${check.reason}`);
      }

      currentUrl = nextUrl;
      redirectCount++;
      continue;
    }

    return response;
  }

  throw new Error("Too many redirects");
}

export function buildAuthHeaders(conn: ConnectionRow): Record<string, string> {
  const headers: Record<string, string> = {};
  const auth = (conn.authConfig as Record<string, string>) || {};

  switch (conn.authMethod) {
    case "api_key":
      if (auth.headerName && auth.apiKey) {
        headers[auth.headerName] = auth.apiKey;
      }
      break;
    case "bearer":
      if (auth.token) {
        headers["Authorization"] = `Bearer ${auth.token}`;
      }
      break;
    case "basic":
      if (auth.username) {
        const encoded = Buffer.from(`${auth.username}:${auth.password || ""}`).toString("base64");
        headers["Authorization"] = `Basic ${encoded}`;
      }
      break;
  }

  return headers;
}

export function buildRequestHeaders(conn: ConnectionRow, endpoint?: EndpointRow): Record<string, string> {
  const authHeaders = buildAuthHeaders(conn);
  const defaultHeaders = (conn.defaultHeaders as Record<string, string>) || {};
  const endpointHeaders = endpoint ? (endpoint.requestHeaders as Record<string, string>) || {} : {};

  return {
    "Content-Type": "application/json",
    "Accept": "application/json",
    ...defaultHeaders,
    ...authHeaders,
    ...endpointHeaders,
  };
}

export function applyFieldMapping(
  sourceData: Record<string, unknown>,
  mapping: FieldMapping[],
  direction: "import" | "export"
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  const filteredMapping = mapping.filter(m => {
    if (!m.direction) return true;
    if (direction === "import") return m.direction === "response";
    if (direction === "export") return m.direction === "request";
    return true;
  });

  for (const map of filteredMapping) {
    const sourceKey = direction === "import" ? map.source : map.target;
    const targetKey = direction === "import" ? map.target : map.source;

    const value = getNestedValue(sourceData, sourceKey);
    if (value !== undefined) {
      result[targetKey] = applyTransform(value, map.transform);
    }
  }

  return result;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function applyTransform(value: unknown, transform?: string): unknown {
  if (!transform) return value;
  switch (transform) {
    case "string":
      return String(value ?? "");
    case "number":
      return Number(value) || 0;
    case "boolean":
      return Boolean(value);
    case "date":
      return value ? new Date(String(value)).toISOString() : null;
    case "lowercase":
      return String(value ?? "").toLowerCase();
    case "uppercase":
      return String(value ?? "").toUpperCase();
    case "trim":
      return String(value ?? "").trim();
    default:
      return value;
  }
}

function extractArrayData(responseData: unknown): Record<string, unknown>[] {
  if (Array.isArray(responseData)) return responseData;
  if (responseData && typeof responseData === "object") {
    const obj = responseData as Record<string, unknown>;
    for (const key of ["data", "results", "items", "records", "rows", "entries", "list"]) {
      if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
    }
    for (const val of Object.values(obj)) {
      if (Array.isArray(val)) return val as Record<string, unknown>[];
    }
  }
  return [responseData as Record<string, unknown>];
}

interface PaginationInfo {
  nextUrl?: string;
  hasMore: boolean;
}

function detectPagination(responseData: unknown, currentUrl: string): PaginationInfo {
  if (!responseData || typeof responseData !== "object") return { hasMore: false };
  const obj = responseData as Record<string, unknown>;

  if (typeof obj.next === "string" && obj.next) {
    return { nextUrl: obj.next, hasMore: true };
  }
  if (typeof obj.next_page_url === "string" && obj.next_page_url) {
    return { nextUrl: obj.next_page_url, hasMore: true };
  }
  if (typeof obj.nextPageToken === "string" && obj.nextPageToken) {
    const url = new URL(currentUrl);
    url.searchParams.set("pageToken", obj.nextPageToken);
    return { nextUrl: url.toString(), hasMore: true };
  }
  if (typeof obj.cursor === "string" && obj.cursor) {
    const url = new URL(currentUrl);
    url.searchParams.set("cursor", obj.cursor);
    return { nextUrl: url.toString(), hasMore: true };
  }

  const pagination = obj.pagination || obj.meta || obj.paging;
  if (pagination && typeof pagination === "object") {
    const p = pagination as Record<string, unknown>;
    if (typeof p.next === "string" && p.next) {
      return { nextUrl: p.next, hasMore: true };
    }
    if (typeof p.next_cursor === "string" && p.next_cursor) {
      const url = new URL(currentUrl);
      url.searchParams.set("cursor", p.next_cursor);
      return { nextUrl: url.toString(), hasMore: true };
    }
    if (typeof p.page === "number" && typeof p.totalPages === "number" && p.page < p.totalPages) {
      const url = new URL(currentUrl);
      url.searchParams.set("page", String(p.page + 1));
      return { nextUrl: url.toString(), hasMore: true };
    }
  }

  return { hasMore: false };
}

export async function testConnection(connectionId: number): Promise<{ success: boolean; status?: number; message: string; responseTime?: number }> {
  const [conn] = await db.select().from(integrationConnectionsTable)
    .where(eq(integrationConnectionsTable.id, connectionId));

  if (!conn) return { success: false, message: "Connection not found" };

  const urlCheck = await validateUrl(conn.baseUrl);
  if (!urlCheck.valid) return { success: false, message: urlCheck.reason! };

  const headers = buildRequestHeaders(conn);
  const startTime = Date.now();

  try {
    const response = await safeFetch(conn.baseUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(15000),
    });

    const responseTime = Date.now() - startTime;

    await db.insert(integrationSyncLogsTable).values({
      connectionId,
      direction: "test",
      status: response.ok ? "completed" : "failed",
      recordsProcessed: 0,
      recordsFailed: response.ok ? 0 : 1,
      errorMessage: response.ok ? null : `Server returned ${response.status} ${response.statusText}`,
      details: {
        type: "connection_test",
        method: "GET",
        path: conn.baseUrl,
        statusCode: response.status,
        responseTime,
      },
      completedAt: new Date(),
    });

    return {
      success: response.ok,
      status: response.status,
      message: response.ok ? "Connection successful" : `Server returned ${response.status} ${response.statusText}`,
      responseTime,
    };
  } catch (err: unknown) {
    const responseTime = Date.now() - startTime;
    const error = err instanceof Error ? err : new Error(String(err));

    await db.insert(integrationSyncLogsTable).values({
      connectionId,
      direction: "test",
      status: "failed",
      recordsProcessed: 0,
      recordsFailed: 1,
      errorMessage: error.name === "TimeoutError" ? "Connection timed out after 15 seconds" : error.message,
      details: {
        type: "connection_test",
        method: "GET",
        path: conn.baseUrl,
        responseTime,
      },
      completedAt: new Date(),
    });

    return {
      success: false,
      message: error.name === "TimeoutError" ? "Connection timed out after 15 seconds" : error.message,
      responseTime,
    };
  }
}

export async function executeSync(
  connectionId: number,
  endpointId: number,
  direction?: string
): Promise<{ logId: number; recordsProcessed: number; recordsFailed: number; errors: Array<{ error: string; row?: number }> }> {
  const [conn] = await db.select().from(integrationConnectionsTable)
    .where(eq(integrationConnectionsTable.id, connectionId));
  if (!conn) throw new Error("Connection not found");

  const [endpoint] = await db.select().from(integrationEndpointsTable)
    .where(and(
      eq(integrationEndpointsTable.id, endpointId),
      eq(integrationEndpointsTable.connectionId, connectionId)
    ));
  if (!endpoint) throw new Error("Endpoint not found or does not belong to this connection");

  const syncDirection = direction || endpoint.syncDirection || "import";
  const fieldMapping = (endpoint.fieldMapping as FieldMapping[]) || [];

  const [log] = await db.insert(integrationSyncLogsTable).values({
    connectionId,
    endpointId,
    direction: syncDirection,
    status: "running",
    recordsProcessed: 0,
    recordsFailed: 0,
  }).returning();

  try {
    let totalProcessed = 0;
    let allErrors: Array<{ error: string; row?: number }> = [];
    let httpStatusCode: number | undefined;
    let httpResponseTime: number | undefined;

    if (syncDirection === "import" || syncDirection === "bidirectional") {
      const result = await executeImportSync(conn, endpoint, fieldMapping);
      totalProcessed += result.recordsProcessed;
      allErrors = allErrors.concat(result.errors);
      httpStatusCode = result.statusCode;
      httpResponseTime = result.responseTime;
    }

    if (syncDirection === "export" || syncDirection === "bidirectional") {
      const result = await executeExportSync(conn, endpoint, fieldMapping);
      totalProcessed += result.recordsProcessed;
      allErrors = allErrors.concat(result.errors);
      if (!httpStatusCode) {
        httpStatusCode = result.statusCode;
        httpResponseTime = result.responseTime;
      }
    }

    if (syncDirection !== "import" && syncDirection !== "export" && syncDirection !== "bidirectional") {
      throw new Error(`Unsupported sync direction: ${syncDirection}`);
    }

    await db.update(integrationSyncLogsTable).set({
      status: allErrors.length > 0 && totalProcessed === 0 ? "failed" : "completed",
      recordsProcessed: totalProcessed,
      recordsFailed: allErrors.length,
      errorMessage: allErrors.length > 0 ? allErrors.map(e => e.error).join("; ").slice(0, 1000) : null,
      details: {
        errors: allErrors,
        method: endpoint.method || "GET",
        path: endpoint.path,
        statusCode: httpStatusCode,
        responseTime: httpResponseTime,
      },
      completedAt: new Date(),
    }).where(eq(integrationSyncLogsTable.id, log.id));

    await db.update(integrationConnectionsTable)
      .set({ lastSyncAt: new Date() })
      .where(eq(integrationConnectionsTable.id, connectionId));

    return { logId: log.id, recordsProcessed: totalProcessed, recordsFailed: allErrors.length, errors: allErrors };
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    await db.update(integrationSyncLogsTable).set({
      status: "failed",
      errorMessage: error.message,
      completedAt: new Date(),
    }).where(eq(integrationSyncLogsTable.id, log.id));

    return { logId: log.id, recordsProcessed: 0, recordsFailed: 0, errors: [{ error: error.message }] };
  }
}

const MAX_PAGES = 50;

async function executeImportSync(
  conn: ConnectionRow,
  endpoint: EndpointRow,
  fieldMapping: FieldMapping[]
): Promise<{ recordsProcessed: number; errors: Array<{ error: string; row?: number }>; statusCode?: number; responseTime?: number }> {
  if (!endpoint.entityId) throw new Error("Endpoint has no entity mapping configured");

  let currentUrl = `${conn.baseUrl.replace(/\/$/, "")}${endpoint.path}`;
  const urlCheck = await validateUrl(currentUrl);
  if (!urlCheck.valid) throw new Error(`URL validation failed: ${urlCheck.reason}`);

  const headers = buildRequestHeaders(conn, endpoint);
  let recordsProcessed = 0;
  const errors: Array<{ error: string; row?: number }> = [];
  let pageCount = 0;
  let firstStatusCode: number | undefined;
  let firstResponseTime: number | undefined;

  while (currentUrl && pageCount < MAX_PAGES) {
    pageCount++;

    const fetchStart = Date.now();
    const response = await safeFetch(currentUrl, {
      method: endpoint.method || "GET",
      headers,
      body: endpoint.method !== "GET" && endpoint.requestBody ? JSON.stringify(endpoint.requestBody) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    if (pageCount === 1) {
      firstStatusCode = response.status;
      firstResponseTime = Date.now() - fetchStart;
    }

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const responseData = await response.json();
    const items = extractArrayData(responseData);

    for (let i = 0; i < items.length; i++) {
      try {
        const responseMappings = fieldMapping.filter(m => !m.direction || m.direction === "response");
        const mappedData = responseMappings.length > 0
          ? applyFieldMapping(items[i], fieldMapping, "import")
          : items[i];

        if (Object.keys(mappedData).length === 0) continue;

        await db.insert(entityRecordsTable).values({
          entityId: endpoint.entityId,
          data: mappedData,
          status: "draft",
        });

        recordsProcessed++;
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        errors.push({ row: recordsProcessed + errors.length + 1, error: error.message });
      }
    }

    const pagination = detectPagination(responseData, currentUrl);
    if (!pagination.hasMore || !pagination.nextUrl) break;

    const nextUrlCheck = await validateUrl(pagination.nextUrl);
    if (!nextUrlCheck.valid) break;
    currentUrl = pagination.nextUrl;
  }

  return { recordsProcessed, errors, statusCode: firstStatusCode, responseTime: firstResponseTime };
}

async function executeExportSync(
  conn: ConnectionRow,
  endpoint: EndpointRow,
  fieldMapping: FieldMapping[]
): Promise<{ recordsProcessed: number; errors: Array<{ error: string; row?: number }>; statusCode?: number; responseTime?: number }> {
  if (!endpoint.entityId) throw new Error("Endpoint has no entity mapping configured");

  const records = await db.select().from(entityRecordsTable)
    .where(eq(entityRecordsTable.entityId, endpoint.entityId));

  const url = `${conn.baseUrl.replace(/\/$/, "")}${endpoint.path}`;
  const urlCheck = await validateUrl(url);
  if (!urlCheck.valid) throw new Error(`URL validation failed: ${urlCheck.reason}`);

  const headers = buildRequestHeaders(conn, endpoint);

  let recordsProcessed = 0;
  const errors: Array<{ error: string; row?: number }> = [];
  let firstStatusCode: number | undefined;
  let firstResponseTime: number | undefined;

  for (let i = 0; i < records.length; i++) {
    try {
      const recordData = (records[i].data as Record<string, unknown>) || {};
      const requestMappings = fieldMapping.filter(m => !m.direction || m.direction === "request");
      const payload = requestMappings.length > 0
        ? applyFieldMapping(recordData, fieldMapping, "export")
        : recordData;

      const fetchStart = Date.now();
      const response = await safeFetch(url, {
        method: endpoint.method === "GET" ? "POST" : endpoint.method,
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      if (i === 0) {
        firstStatusCode = response.status;
        firstResponseTime = Date.now() - fetchStart;
      }

      if (!response.ok) {
        errors.push({ row: i + 1, error: `API returned ${response.status}` });
      } else {
        recordsProcessed++;
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      errors.push({ row: i + 1, error: error.message });
    }
  }

  return { recordsProcessed, errors, statusCode: firstStatusCode, responseTime: firstResponseTime };
}

export async function processInboundWebhook(
  webhookSlug: string,
  payload: Record<string, unknown>,
  secret?: string
): Promise<{ success: boolean; message: string; recordId?: number }> {
  const webhooks = await db.select().from(integrationWebhooksTable)
    .where(eq(integrationWebhooksTable.slug, webhookSlug));

  const webhook = webhooks[0];
  if (!webhook) return { success: false, message: "Webhook not found" };
  if (!webhook.isActive) return { success: false, message: "Webhook is disabled" };

  if (webhook.webhookSecret && secret !== webhook.webhookSecret) {
    return { success: false, message: "Invalid webhook secret" };
  }

  if (!webhook.entityId) return { success: false, message: "No entity mapped to this webhook" };

  const fieldMapping = (webhook.fieldMapping as FieldMapping[]) || [];
  const mappedData = fieldMapping.length > 0
    ? applyFieldMapping(payload, fieldMapping, "import")
    : payload;

  if (Object.keys(mappedData).length === 0) {
    return { success: false, message: "No data mapped from webhook payload" };
  }

  const [log] = await db.insert(integrationSyncLogsTable).values({
    connectionId: webhook.connectionId,
    webhookId: webhook.id,
    direction: "inbound_webhook",
    status: "running",
    recordsProcessed: 0,
    recordsFailed: 0,
  }).returning();

  try {
    const eventType = webhook.eventType || "create";

    if (eventType === "create" || eventType === "custom") {
      const [record] = await db.insert(entityRecordsTable).values({
        entityId: webhook.entityId,
        data: mappedData,
        status: "draft",
      }).returning();

      await db.update(integrationSyncLogsTable).set({
        status: "completed",
        recordsProcessed: 1,
        completedAt: new Date(),
        details: { recordId: record.id, eventType },
      }).where(eq(integrationSyncLogsTable.id, log.id));

      return { success: true, message: "Record created", recordId: record.id };
    }

    const lookupKey = fieldMapping.find(m => m.transform === "lookup_key");

    if (eventType === "update") {
      const records = await db.select().from(entityRecordsTable)
        .where(eq(entityRecordsTable.entityId, webhook.entityId));

      let targetRecord: typeof records[number] | undefined;

      if (lookupKey) {
        targetRecord = records.find(r => {
          const data = r.data as Record<string, unknown>;
          return String(data[lookupKey.target]) === String(mappedData[lookupKey.target]);
        });
      }

      if (targetRecord) {
        const existingData = (targetRecord.data as Record<string, unknown>) || {};
        await db.update(entityRecordsTable).set({
          data: { ...existingData, ...mappedData },
          updatedAt: new Date(),
        }).where(eq(entityRecordsTable.id, targetRecord.id));

        await db.update(integrationSyncLogsTable).set({
          status: "completed",
          recordsProcessed: 1,
          completedAt: new Date(),
          details: { recordId: targetRecord.id, eventType, action: "updated" },
        }).where(eq(integrationSyncLogsTable.id, log.id));

        return { success: true, message: "Record updated", recordId: targetRecord.id };
      } else {
        const [record] = await db.insert(entityRecordsTable).values({
          entityId: webhook.entityId,
          data: mappedData,
          status: "draft",
        }).returning();

        await db.update(integrationSyncLogsTable).set({
          status: "completed",
          recordsProcessed: 1,
          completedAt: new Date(),
          details: { recordId: record.id, eventType, action: "created_new" },
        }).where(eq(integrationSyncLogsTable.id, log.id));

        return { success: true, message: "Record created (no matching record for update)", recordId: record.id };
      }
    }

    if (eventType === "delete") {
      const records = await db.select().from(entityRecordsTable)
        .where(eq(entityRecordsTable.entityId, webhook.entityId));

      let targetRecord: typeof records[number] | undefined;

      if (lookupKey) {
        targetRecord = records.find(r => {
          const data = r.data as Record<string, unknown>;
          return String(data[lookupKey.target]) === String(mappedData[lookupKey.target]);
        });
      }

      if (targetRecord) {
        await db.delete(entityRecordsTable).where(eq(entityRecordsTable.id, targetRecord.id));

        await db.update(integrationSyncLogsTable).set({
          status: "completed",
          recordsProcessed: 1,
          completedAt: new Date(),
          details: { recordId: targetRecord.id, eventType, action: "deleted" },
        }).where(eq(integrationSyncLogsTable.id, log.id));

        return { success: true, message: "Record deleted", recordId: targetRecord.id };
      } else {
        await db.update(integrationSyncLogsTable).set({
          status: "completed",
          recordsProcessed: 0,
          completedAt: new Date(),
          details: { eventType, action: "no_match_found" },
        }).where(eq(integrationSyncLogsTable.id, log.id));

        return { success: true, message: "No matching record found to delete" };
      }
    }

    await db.update(integrationSyncLogsTable).set({
      status: "failed",
      recordsFailed: 1,
      errorMessage: `Unsupported event type: ${eventType}`,
      completedAt: new Date(),
    }).where(eq(integrationSyncLogsTable.id, log.id));

    return { success: false, message: `Unsupported event type: ${eventType}` };
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    await db.update(integrationSyncLogsTable).set({
      status: "failed",
      recordsFailed: 1,
      errorMessage: error.message,
      completedAt: new Date(),
    }).where(eq(integrationSyncLogsTable.id, log.id));

    return { success: false, message: error.message };
  }
}
