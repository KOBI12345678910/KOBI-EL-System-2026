import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { claudeAuditLogsTable } from "@workspace/db/schema";

function deriveActionType(method: string, path: string): string {
  if (path.includes("test-connection")) return "connection_test";
  if (path.includes("health")) return "health_check";
  if (path.includes("/builder/")) {
    const resource = path.split("/builder/")[1]?.split("/")[0] || "unknown";
    return `builder_${method === "POST" ? "create" : "update"}_${resource}`;
  }
  if (path.includes("/dev-support/")) {
    const endpoint = path.split("/dev-support/")[1]?.split("/")[0] || "unknown";
    return `dev_support_${endpoint}`;
  }
  if (path.includes("status")) return "status_check";
  if (path.includes("models")) return "models_list";
  if (path.includes("sessions") && method === "POST") return "session_create";
  if (path.includes("sessions")) return "session_list";
  if (path.includes("logs")) return "audit_query";
  return `${method.toLowerCase()}_request`;
}

export function claudeAuditMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  let responseCaptured = false;

  function logAudit(outputSummary?: string) {
    if (responseCaptured) return;
    responseCaptured = true;

    const responseTimeMs = Date.now() - startTime;

    db.insert(claudeAuditLogsTable)
      .values({
        actionType: deriveActionType(req.method, req.path),
        caller: req.ip || "unknown",
        targetApi: req.path,
        httpMethod: req.method,
        httpPath: req.originalUrl,
        inputSummary: req.body && Object.keys(req.body).length > 0
          ? JSON.stringify(req.body).substring(0, 500)
          : null,
        outputSummary: outputSummary ? outputSummary.substring(0, 500) : null,
        status: res.statusCode >= 400 ? "error" : "success",
        statusCode: res.statusCode,
        responseTimeMs,
      })
      .then(() => {})
      .catch((err) => {
        console.error("Failed to log Claude audit:", err);
      });
  }

  res.json = function (body: any) {
    logAudit(typeof body === "object" ? JSON.stringify(body).substring(0, 500) : String(body));
    return originalJson(body);
  } as any;

  res.send = function (body: any) {
    logAudit(typeof body === "string" ? body.substring(0, 500) : undefined);
    return originalSend(body);
  } as any;

  next();
}
