import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { existsSync, accessSync, constants as fsConstants } from "fs";
import { join } from "path";

const router = Router();

async function askGeminiForDiagnosis(failures: Array<{ name: string; issue: string; context?: any }>): Promise<Array<{ name: string; diagnosis: string; suggestedFix: string; autoFixable: boolean; fixAction: string }>> {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  if (!baseUrl || !apiKey || failures.length === 0) return failures.map(f => ({ name: f.name, diagnosis: f.issue, suggestedFix: "בדיקה ידנית נדרשת", autoFixable: false, fixAction: "manual_review" }));

  try {
    const prompt = `אתה מומחה IT לתשתיות ERP. מערכת ERP של מפעל מתכת/זכוכית/אלומיניום (טכנו-כל עוזי) בדקה אינטגרציות ומצאה את השגיאות הבאות.
לכל שגיאה תן: diagnosis (אבחנה בעברית), suggestedFix (הצעת תיקון בעברית), autoFixable (true/false), fixAction (retry/fix_headers/change_timeout/disable/manual_review), reason (סיבת הפעולה).
החזר JSON array בלבד, בלי markdown.

שגיאות:
${failures.map((f, i) => `${i + 1}. שירות: ${f.name}, שגיאה: ${f.issue}${f.context ? `, context: ${JSON.stringify(f.context)}` : ""}`).join("\n")}`;

    const cleanBase = baseUrl.replace(/\/$/, "");
    const resp = await fetch(`${cleanBase}/models/gemini-2.5-flash:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8192 }
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      throw new Error(`Gemini HTTP ${resp.status}: ${errBody.substring(0, 200)}`);
    }
    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Empty Gemini response");

    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return failures.map((f, i) => ({
      name: f.name,
      diagnosis: arr[i]?.diagnosis || f.issue,
      suggestedFix: arr[i]?.suggestedFix || "בדיקה ידנית",
      autoFixable: arr[i]?.autoFixable === true,
      fixAction: arr[i]?.fixAction || "manual_review"
    }));
  } catch (err: any) {
    logger.warn("[AI Diagnose] Gemini call failed, using fallback:", { error: err.message });
    return failures.map(f => ({ name: f.name, diagnosis: f.issue, suggestedFix: "Gemini לא זמין — בדיקה ידנית נדרשת", autoFixable: false, fixAction: "manual_review" }));
  }
}

function isUnsafeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(host)) return true;
    if (host.endsWith(".internal") || host.endsWith(".local")) return true;
    if (/^10\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^192\.168\./.test(host)) return true;
    if (host.startsWith("169.254.")) return true;
    return false;
  } catch { return true; }
}

async function checkService(name: string, checker: () => Promise<{ ok: boolean; message: string; latencyMs?: number; extras?: any }>) {
  const start = Date.now();
  try {
    const result = await checker();
    return {
      name,
      status: result.ok ? "ok" as const : "error" as const,
      message: result.message,
      latencyMs: result.latencyMs ?? (Date.now() - start),
      lastChecked: new Date().toISOString(),
      ...result.extras,
    };
  } catch (e: any) {
    return {
      name,
      status: "error" as const,
      message: e.message || "Unknown error",
      latencyMs: Date.now() - start,
      lastChecked: new Date().toISOString(),
    };
  }
}

async function attemptAutoFix(serviceId: number, issue: string, fixAction: string, fixFn: () => Promise<boolean>): Promise<{ fixed: boolean; action: string }> {
  try {
    const fixed = await fixFn();
    await pool.query(
      `INSERT INTO integration_autofix_log (service_id, issue, fix_action, fix_result) VALUES ($1, $2, $3, $4)`,
      [serviceId, issue, fixAction, fixed ? "success" : "failed"]
    );
    if (fixed) {
      await pool.query(`UPDATE integration_services SET fix_attempts = fix_attempts + 1, last_error = NULL, status = 'connected', updated_at = NOW() WHERE id = $1`, [serviceId]);
    }
    return { fixed, action: fixAction };
  } catch {
    return { fixed: false, action: fixAction };
  }
}

const builtinCheckers: Record<string, () => Promise<{ ok: boolean; message: string; latencyMs?: number; extras?: any }>> = {
  "ERP API Server": async () => {
    const s = Date.now();
    const r = await fetch("http://localhost:8080/api/health", { signal: AbortSignal.timeout(5000) });
    return { ok: r.ok, message: r.ok ? "שרת פעיל ותקין" : `HTTP ${r.status}`, latencyMs: Date.now() - s };
  },
  "PostgreSQL Database": async () => {
    const s = Date.now();
    await pool.query("SELECT 1");
    return { ok: true, message: "מסד נתונים פעיל", latencyMs: Date.now() - s };
  },
  "Storage (Uploads)": async () => {
    const uploadsDir = join(process.cwd(), "uploads");
    const exists = existsSync(uploadsDir);
    let writable = false;
    if (exists) { try { accessSync(uploadsDir, fsConstants.W_OK); writable = true; } catch {} }
    const subs = ["documents", "kobi", "exports"].filter(d => existsSync(join(uploadsDir, d)));
    const ok = exists && writable;
    return { ok, message: ok ? `תיקייה פעילה — ${subs.length} תתי-תיקיות` : "תיקייה לא זמינה" };
  },
  "Email (SMTP/Gmail)": async () => {
    const gu = process.env.GMAIL_USER, gp = process.env.GMAIL_APP_PASSWORD;
    if (!gu || !gp) return { ok: false, message: "חסר GMAIL_USER או GMAIL_APP_PASSWORD", extras: { configured: false } };
    const s = Date.now();
    const nm = await import("nodemailer");
    const t = nm.default.createTransport({ service: "gmail", auth: { user: gu, pass: gp } });
    await t.verify();
    return { ok: true, message: `SMTP מחובר — ${gu}`, latencyMs: Date.now() - s, extras: { account: gu } };
  },
  "Google AI (Gemini)": async () => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return { ok: false, message: "GEMINI_API_KEY לא מוגדר", extras: { configured: false } };
    const s = Date.now();
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, { signal: AbortSignal.timeout(8000) });
    return { ok: r.ok, message: r.ok ? "Gemini API פעיל" : `HTTP ${r.status}`, latencyMs: Date.now() - s };
  },
  "n8n Workflow Engine": async () => {
    let url: string | undefined, key: string | undefined;
    try {
      const { rows: s1 } = await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_url' LIMIT 1`);
      const { rows: s2 } = await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_api_key' LIMIT 1`);
      url = s1[0]?.value; key = s2[0]?.value;
    } catch {}
    if (!url || !key) {
      try {
        const { rows } = await pool.query(`SELECT * FROM api_connections WHERE LOWER(name) LIKE '%n8n%' AND is_active = true LIMIT 1`);
        if (rows[0]) {
          url = rows[0].base_url;
          try { const cfg = typeof rows[0].auth_config === "string" ? JSON.parse(rows[0].auth_config) : rows[0].auth_config; key = cfg?.token || cfg?.key || cfg?.api_key; } catch {}
        }
      } catch {}
    }
    if (!url || !key) return { ok: false, message: "לא מוגדר — חסר URL או API Key", extras: { configured: false } };
    const endpoint = `${url.replace(/\/+$/, "")}/api/v1/workflows`;
    if (isUnsafeUrl(endpoint)) return { ok: false, message: "כתובת פנימית — חסומה" };
    const s = Date.now();
    const r = await fetch(endpoint, { headers: { "X-N8N-API-KEY": key, "Accept": "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { ok: false, message: `HTTP ${r.status}`, latencyMs: Date.now() - s };
    const data = await r.json();
    const wfs = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
    return { ok: true, message: `n8n פעיל — ${wfs.length} workflows`, latencyMs: Date.now() - s, extras: { workflows: wfs.length, activeWorkflows: wfs.filter((w: any) => w.active).length } };
  },
};

router.get("/integration-hub/status", async (_req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    const systemResults = await Promise.all(
      Object.entries(builtinCheckers).map(([name, checker]) => checkService(name, checker))
    );

    const { rows: dbServices } = await pool.query(`SELECT * FROM integration_services WHERE is_active = true ORDER BY id`);
    const externalResults: any[] = [];
    await Promise.allSettled(dbServices.map(async (svc: any) => {
      if (!svc.base_url) {
        externalResults.push({ name: svc.name, status: "warning", message: "חסר URL", lastChecked: new Date().toISOString() });
        return;
      }
      const testUrl = svc.health_endpoint ? `${svc.base_url.replace(/\/$/, "")}${svc.health_endpoint}` : svc.base_url;
      if (isUnsafeUrl(testUrl)) {
        externalResults.push({ name: svc.name, status: "warning", message: "כתובת פנימית — דילוג", lastChecked: new Date().toISOString() });
        return;
      }
      const s = Date.now();
      try {
        const headers: Record<string, string> = { "Accept": "application/json" };
        if (svc.auth_type === "bearer" && svc.auth_config?.token) headers["Authorization"] = `Bearer ${svc.auth_config.token}`;
        if (svc.auth_type === "api_key" && svc.auth_config?.header && svc.auth_config?.key) headers[svc.auth_config.header] = svc.auth_config.key;
        const r = await fetch(testUrl, { headers, signal: AbortSignal.timeout(svc.metadata?.timeout_ms || 10000) });
        const latencyMs = Date.now() - s;
        await pool.query(`UPDATE integration_services SET status = $1, last_check_at = NOW(), last_check_latency_ms = $2, last_error = $3, updated_at = NOW() WHERE id = $4`,
          [r.ok ? "connected" : "error", latencyMs, r.ok ? null : `HTTP ${r.status}`, svc.id]);
        externalResults.push({ id: svc.id, name: svc.name, status: r.ok ? "ok" : "error", message: r.ok ? "מחובר" : `HTTP ${r.status}`, latencyMs, lastChecked: new Date().toISOString(), type: svc.type, category: svc.category });
      } catch (e: any) {
        const latencyMs = Date.now() - s;
        await pool.query(`UPDATE integration_services SET status = 'error', last_check_at = NOW(), last_check_latency_ms = $1, last_error = $2, updated_at = NOW() WHERE id = $3`,
          [latencyMs, e.message, svc.id]);
        externalResults.push({ id: svc.id, name: svc.name, status: "error", message: e.message, latencyMs, lastChecked: new Date().toISOString(), type: svc.type, category: svc.category });
      }
    }));

    const { rows: webhooks } = await pool.query(`SELECT * FROM integration_webhooks WHERE is_active = true ORDER BY id`);
    const { rows: recentEvents } = await pool.query(`SELECT * FROM integration_events ORDER BY created_at DESC LIMIT 20`);
    const { rows: recentFixes } = await pool.query(`SELECT * FROM integration_autofix_log ORDER BY created_at DESC LIMIT 10`);

    let webhookUrl: string | undefined;
    try {
      const { rows } = await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_webhook_url' LIMIT 1`);
      webhookUrl = rows[0]?.value;
    } catch {}
    if (!webhookUrl) webhookUrl = process.env.N8N_WEBHOOK_URL || undefined;

    const allResults = [...systemResults, ...externalResults];
    const ok = allResults.filter(r => r.status === "ok").length;
    const warn = allResults.filter(r => r.status === "warning").length;
    const err = allResults.filter(r => r.status === "error").length;

    res.json({
      overallHealth: err > 0 ? "degraded" : (warn > 0 ? "warning" : "healthy"),
      summary: { total: allResults.length, connected: ok, warnings: warn, errors: err },
      durationMs: Date.now() - startTime,
      system: systemResults,
      integrations: externalResults,
      webhooks: webhooks.map((w: any) => ({ id: w.id, name: w.name, url: w.url, eventType: w.event_type, lastTriggered: w.last_triggered_at, triggerCount: w.trigger_count, lastStatus: w.last_status })),
      recentEvents: recentEvents.map((e: any) => ({ id: e.id, eventType: e.event_type, direction: e.direction, status: e.status, responseCode: e.response_code, latencyMs: e.latency_ms, createdAt: e.created_at })),
      recentFixes: recentFixes.map((f: any) => ({ id: f.id, issue: f.issue, action: f.fix_action, result: f.fix_result, createdAt: f.created_at })),
      webhookUrl,
    });
  } catch (err: any) {
    logger.error("[Integration Hub] status failed:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/integration-hub/connect-all-fix", async (_req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    const results: any[] = [];
    const fixes: any[] = [];

    for (const [name, checker] of Object.entries(builtinCheckers)) {
      const result = await checkService(name, checker);
      if (result.status === "error" && !(result as any).configured === false) {
        const fix = { name, issue: result.message, action: "ניסיון חיבור מחדש", fixed: false };
        try {
          const retry = await checkService(name, checker);
          if (retry.status === "ok") { fix.fixed = true; fix.action = "חיבור מחדש הצליח"; result.status = "ok" as any; result.message = retry.message; }
        } catch {}
        fixes.push(fix);
      }
      results.push(result);
    }

    const { rows: dbServices } = await pool.query(`SELECT * FROM integration_services WHERE is_active = true ORDER BY id`);
    const extResults: any[] = [];
    await Promise.allSettled(dbServices.map(async (svc: any) => {
      if (!svc.base_url || isUnsafeUrl(svc.base_url)) {
        extResults.push({ name: svc.name, status: "warning", message: "לא ניתן לבדוק" });
        return;
      }
      const testUrl = svc.health_endpoint ? `${svc.base_url.replace(/\/$/, "")}${svc.health_endpoint}` : svc.base_url;
      const headers: Record<string, string> = { "Accept": "application/json" };
      if (svc.auth_type === "bearer" && svc.auth_config?.token) headers["Authorization"] = `Bearer ${svc.auth_config.token}`;
      if (svc.auth_type === "api_key" && svc.auth_config?.header && svc.auth_config?.key) headers[svc.auth_config.header] = svc.auth_config.key;
      const s = Date.now();
      try {
        let r = await fetch(testUrl, { headers, signal: AbortSignal.timeout(10000) });
        let latencyMs = Date.now() - s;
        if (!r.ok && svc.auto_fix_enabled) {
          const fix = { name: svc.name, issue: `HTTP ${r.status}`, action: "", fixed: false };
          if (r.status === 401 || r.status === 403) {
            fix.action = "בדיקת אימות — נדרש עדכון ידני";
          } else {
            try {
              const s2 = Date.now();
              r = await fetch(testUrl, { headers, signal: AbortSignal.timeout(15000) });
              latencyMs = Date.now() - s2;
              if (r.ok) { fix.fixed = true; fix.action = "חיבור מחדש הצליח (ניסיון שני)"; }
              else fix.action = `נכשל שוב — HTTP ${r.status}`;
            } catch (e2: any) { fix.action = `ניסיון שני נכשל: ${e2.message}`; }
          }
          fixes.push(fix);
          await pool.query(`INSERT INTO integration_autofix_log (service_id, issue, fix_action, fix_result) VALUES ($1, $2, $3, $4)`,
            [svc.id, fix.issue, fix.action, fix.fixed ? "success" : "failed"]);
        }
        await pool.query(`UPDATE integration_services SET status = $1, last_check_at = NOW(), last_check_latency_ms = $2, last_error = $3, updated_at = NOW() WHERE id = $4`,
          [r.ok ? "connected" : "error", latencyMs, r.ok ? null : `HTTP ${r.status}`, svc.id]);
        extResults.push({ id: svc.id, name: svc.name, status: r.ok ? "ok" : "error", message: r.ok ? "מחובר" : `HTTP ${r.status}`, latencyMs });
      } catch (e: any) {
        await pool.query(`UPDATE integration_services SET status = 'error', last_check_at = NOW(), last_error = $1, updated_at = NOW() WHERE id = $2`, [e.message, svc.id]);
        extResults.push({ id: svc.id, name: svc.name, status: "error", message: e.message });
        fixes.push({ name: svc.name, issue: e.message, action: "חיבור נכשל", fixed: false });
      }
    }));

    let webhookSent = false;
    let webhookUrl: string | undefined;
    let webhookResponse: any = null;
    let webhookStatusCode: number | null = null;
    let webhookLatencyMs: number | null = null;
    let webhookError: string | null = null;
    try {
      const { rows } = await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_webhook_url' LIMIT 1`);
      webhookUrl = rows[0]?.value;
    } catch {}
    if (!webhookUrl) webhookUrl = process.env.N8N_WEBHOOK_URL || undefined;

    if (webhookUrl && !isUnsafeUrl(webhookUrl)) {
      try {
        const payload = { event: "erp_connected", system: "techno-kol-uzi", timestamp: new Date().toISOString() };
        const ws = Date.now();
        const wr = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });
        webhookLatencyMs = Date.now() - ws;
        webhookSent = wr.ok;
        webhookStatusCode = wr.status;
        try { webhookResponse = await wr.text(); } catch {}
        try { webhookResponse = JSON.parse(webhookResponse); } catch {}
        await pool.query(
          `INSERT INTO integration_events (event_type, direction, status, payload, response, response_code, latency_ms) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          ["erp_connected", "outgoing", wr.ok ? "sent" : "failed", JSON.stringify(payload), JSON.stringify(webhookResponse), wr.status, webhookLatencyMs]
        );
      } catch (e: any) {
        webhookError = e.message;
        await pool.query(
          `INSERT INTO integration_events (event_type, direction, status, payload, error) VALUES ($1, $2, $3, $4, $5)`,
          ["erp_connected", "outgoing", "failed", JSON.stringify({ event: "erp_connected" }), e.message]
        );
      }
    }

    const allResults = [...results, ...extResults];
    const connected = allResults.filter(r => r.status === "ok").length;
    const warnings = allResults.filter(r => r.status === "warning").length;
    const errors = allResults.filter(r => r.status === "error").length;

    res.json({
      ok: errors === 0,
      message: errors === 0
        ? (warnings > 0 ? `${connected} שירותים מחוברים, ${warnings} לא מוגדרים` : `כל ${connected} השירותים מחוברים!`)
        : `${errors} שגיאות, ${connected} מחוברים`,
      durationMs: Date.now() - startTime,
      connectedAt: new Date().toISOString(),
      summary: { total: allResults.length, connected, warnings, errors, fixesApplied: fixes.filter(f => f.fixed).length },
      system: results,
      integrations: extResults,
      fixes,
      webhookSent,
      webhookUrl: webhookUrl || null,
      webhookStatusCode,
      webhookLatencyMs,
      webhookResponse,
      webhookError,
    });
  } catch (err: any) {
    logger.error("[Integration Hub] connect-all-fix failed:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/integration-hub/webhook/send", async (req: Request, res: Response) => {
  try {
    const { url, payload, method = "POST" } = req.body;
    if (!url) return res.status(400).json({ ok: false, error: "חסר URL" });
    if (isUnsafeUrl(url)) return res.status(400).json({ ok: false, error: "כתובת פנימית — חסומה" });
    const s = Date.now();
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || { event: "test", system: "techno-kol-uzi", timestamp: new Date().toISOString() }),
      signal: AbortSignal.timeout(15000),
    });
    const latencyMs = Date.now() - s;
    let responseBody: any = null;
    try { responseBody = await r.text(); } catch {}
    await pool.query(
      `INSERT INTO integration_events (event_type, direction, status, payload, response, response_code, latency_ms) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [payload?.event || "manual_send", "outgoing", r.ok ? "sent" : "failed", JSON.stringify(payload || {}), JSON.stringify({ body: responseBody }), r.status, latencyMs]
    );
    res.json({ ok: r.ok, status: r.status, latencyMs, response: responseBody });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/integration-hub/webhook/save", async (req: Request, res: Response) => {
  try {
    const { webhookUrl } = req.body;
    if (!webhookUrl) return res.status(400).json({ ok: false, error: "חסר URL" });
    if (isUnsafeUrl(webhookUrl)) return res.status(400).json({ ok: false, error: "כתובת פנימית — חסומה" });
    await pool.query(`INSERT INTO system_settings (key, value) VALUES ('n8n_webhook_url', $1) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`, [webhookUrl]);
    res.json({ ok: true, message: "Webhook URL נשמר בהצלחה" });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/integration-hub/webhooks", async (req: Request, res: Response) => {
  try {
    const { name, url, event_type, secret, retry_count } = req.body;
    if (!name || !url) return res.status(400).json({ ok: false, error: "חסר שם או URL" });
    if (isUnsafeUrl(url)) return res.status(400).json({ ok: false, error: "כתובת פנימית — חסומה" });
    const crypto = await import("crypto");
    const uniqueId = `wh_${crypto.randomBytes(16).toString("hex")}`;

    let colCheck: string[] = [];
    try {
      const { rows: cols } = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'integration_webhooks' AND column_name IN ('url','webhook_url')`);
      colCheck = cols.map((c: any) => c.column_name);
    } catch {}
    const urlCol = colCheck.includes("webhook_url") ? "webhook_url" : "url";

    let connId = null;
    try {
      const { rows: conns } = await pool.query(`SELECT id FROM integration_services ORDER BY id LIMIT 1`);
      connId = conns[0]?.id || null;
    } catch {}
    if (!connId) {
      try {
        const { rows: conns } = await pool.query(`SELECT id FROM api_connections ORDER BY id LIMIT 1`);
        connId = conns[0]?.id || null;
      } catch {}
    }

    const { rows } = await pool.query(
      `INSERT INTO integration_webhooks (name, ${urlCol}, event_type, secret, retry_count, unique_id, is_active, connection_id) VALUES ($1,$2,$3,$4,$5,$6,true,$7) RETURNING *`,
      [name, url, event_type || "*", secret || null, retry_count || 3, uniqueId, connId]
    );
    res.json({ ok: true, webhook: rows[0] });
  } catch (err: any) {
    logger.error("[Integration Hub] create webhook failed:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/integration-hub/webhooks", async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM integration_webhooks ORDER BY created_at DESC`);
    const safe = rows.map((w: any) => {
      const { secret, webhook_secret, secret_key, headers, payload_template, ...rest } = w;
      return { ...rest, hasSecret: !!(secret || webhook_secret || secret_key) };
    });
    res.json(safe);
  } catch (err: any) {
    logger.error("[Integration Hub] webhooks list failed:", err.message);
    res.status(500).json({ ok: false, error: "Failed to fetch webhooks" });
  }
});

router.put("/integration-hub/webhooks/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, url, event_type, secret, retry_count, is_active } = req.body;
    if (url && isUnsafeUrl(url)) return res.status(400).json({ ok: false, error: "כתובת פנימית — חסומה" });

    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    if (name !== undefined) { sets.push(`name=$${idx++}`); vals.push(name); }
    if (url !== undefined) {
      let colCheck: string[] = [];
      try {
        const { rows: cols } = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='integration_webhooks' AND column_name IN ('url','webhook_url')`);
        colCheck = cols.map((c: any) => c.column_name);
      } catch {}
      const urlCol = colCheck.includes("webhook_url") ? "webhook_url" : "url";
      sets.push(`${urlCol}=$${idx++}`); vals.push(url);
    }
    if (event_type !== undefined) { sets.push(`event_type=$${idx++}`); vals.push(event_type); }
    if (secret !== undefined) { sets.push(`secret=$${idx++}`); vals.push(secret); }
    if (retry_count !== undefined) { sets.push(`retry_count=$${idx++}`); vals.push(retry_count); }
    if (is_active !== undefined) { sets.push(`is_active=$${idx++}`); vals.push(is_active); }
    sets.push(`updated_at=NOW()`);

    if (sets.length <= 1) return res.status(400).json({ ok: false, error: "לא נשלחו שדות לעדכון" });
    vals.push(parseInt(id));
    const { rows } = await pool.query(
      `UPDATE integration_webhooks SET ${sets.join(", ")} WHERE id=$${idx} RETURNING *`,
      vals
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: "Webhook לא נמצא" });
    const { secret: _s, webhook_secret: _ws, secret_key: _sk, ...safe } = rows[0];
    res.json({ ok: true, webhook: { ...safe, hasSecret: !!(_s || _ws || _sk) } });
  } catch (err: any) {
    logger.error("[Integration Hub] update webhook failed:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete("/integration-hub/webhooks/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM integration_webhooks WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/integration-hub/webhooks/:id/logs", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const { rows: wh } = await pool.query(`SELECT id, name FROM integration_webhooks WHERE id = $1`, [parseInt(id)]);
    if (!wh.length) return res.status(404).json({ ok: false, error: "Webhook לא נמצא" });
    const { rows } = await pool.query(
      `SELECT * FROM integration_events WHERE webhook_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [parseInt(id), limit]
    );
    res.json({ ok: true, webhook: wh[0], logs: rows, count: rows.length });
  } catch (err: any) {
    logger.error("[Integration Hub] webhook logs failed:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/integration-hub/webhooks/:id/test", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(`SELECT * FROM integration_webhooks WHERE id = $1`, [id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: "Webhook לא נמצא" });
    const wh = rows[0];
    const whUrl = wh.url || wh.webhook_url;
    if (!whUrl) return res.status(400).json({ ok: false, error: "Webhook ללא URL" });
    if (isUnsafeUrl(whUrl)) return res.status(400).json({ ok: false, error: "כתובת פנימית — חסומה" });
    const payload = { event: "test_ping", webhook_id: wh.unique_id, system: "techno-kol-uzi", timestamp: new Date().toISOString() };
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    try { const h = typeof wh.headers === "string" ? JSON.parse(wh.headers) : wh.headers; if (h && typeof h === "object") Object.assign(headers, h); } catch {}
    const whSecret = wh.secret || wh.webhook_secret || wh.secret_key;
    if (whSecret) headers["X-Webhook-Secret"] = whSecret;
    const s = Date.now();
    const r = await fetch(whUrl, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
    const latencyMs = Date.now() - s;
    let responseBody: any = null;
    try { responseBody = await r.text(); } catch {}
    try {
      await pool.query(`UPDATE integration_webhooks SET last_triggered = NOW(), last_status = $1 WHERE id = $2`, [r.ok ? "sent" : "failed", id]);
    } catch {
      try { await pool.query(`UPDATE integration_webhooks SET last_triggered_at = NOW(), last_status = $1 WHERE id = $2`, [r.ok ? "sent" : "failed", id]); } catch {}
    }
    await pool.query(
      `INSERT INTO integration_events (webhook_id, event_type, direction, status, payload, response, response_code, latency_ms) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, "test_ping", "outgoing", r.ok ? "sent" : "failed", JSON.stringify(payload), JSON.stringify({ body: responseBody }), r.status, latencyMs]
    );
    res.json({ ok: r.ok, status: r.status, latencyMs, response: responseBody });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/integration-hub/webhooks/:token/receive", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { rows } = await pool.query(
      `SELECT id, name, event_type, secret, is_active FROM integration_webhooks WHERE unique_id = $1 LIMIT 1`,
      [token]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: "Webhook not found" });
    const wh = rows[0];
    if (!wh.is_active) return res.status(410).json({ ok: false, error: "Webhook disabled" });

    if (wh.secret) {
      const sig = req.headers["x-webhook-signature"] || req.headers["x-webhook-secret"];
      if (!sig || sig !== wh.secret) {
        return res.status(401).json({ ok: false, error: "Invalid signature" });
      }
    }

    const payload = req.body || {};
    const eventType = payload.event || payload.event_type || req.headers["x-event-type"] || "incoming";

    await pool.query(
      `INSERT INTO integration_events (webhook_id, event_type, direction, status, payload) VALUES ($1,$2,'incoming','received',$3)`,
      [wh.id, eventType, JSON.stringify(payload)]
    );
    await pool.query(
      `UPDATE integration_webhooks SET trigger_count = trigger_count + 1, last_triggered_at = NOW(), last_status = 'received' WHERE id = $1`,
      [wh.id]
    );

    res.json({ ok: true, received: true, webhook: wh.name, event: eventType });
  } catch (err: any) {
    logger.error("[Integration Hub] webhook receive failed:", err.message);
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

router.get("/integration-hub/mcp/servers", async (_req: Request, res: Response) => {
  try {
    const servers: any[] = [];
    try {
      const { rows } = await pool.query(`SELECT value FROM system_settings WHERE key = 'mcp_servers' LIMIT 1`);
      if (rows[0]?.value) {
        const parsed = typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value;
        if (Array.isArray(parsed)) servers.push(...parsed);
      }
    } catch {}
    const mcpSkillsDir = join(process.cwd(), ".local", "mcp_skills");
    if (existsSync(mcpSkillsDir)) {
      const { readdirSync } = await import("fs");
      const dirs = readdirSync(mcpSkillsDir, { withFileTypes: true }).filter(d => d.isDirectory());
      for (const dir of dirs) {
        const skillFile = join(mcpSkillsDir, dir.name, "SKILL.md");
        if (existsSync(skillFile)) {
          const existing = servers.find(s => s.id === dir.name);
          if (!existing) {
            servers.push({ id: dir.name, name: dir.name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()), type: "mcp", status: "discovered", skillPath: skillFile });
          }
        }
      }
    }
    const safe = servers.map((s: any) => ({ id: s.id, name: s.name, type: s.type, status: s.status, url: s.url || null, skillPath: s.skillPath || null, addedAt: s.addedAt || null, hasAuth: !!s.auth }));
    res.json({ ok: true, servers: safe, count: safe.length });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: "Failed to fetch MCP servers" });
  }
});

router.post("/integration-hub/mcp/servers", async (req: Request, res: Response) => {
  try {
    const { name, url, type, auth } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: "חסר שם שרת" });
    let servers: any[] = [];
    try {
      const { rows } = await pool.query(`SELECT value FROM system_settings WHERE key = 'mcp_servers' LIMIT 1`);
      if (rows[0]?.value) servers = typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value;
    } catch {}
    const newServer = { id: `mcp_${Date.now()}`, name, url: url || null, type: type || "custom-mcp", auth: auth || null, status: "configured", addedAt: new Date().toISOString() };
    servers.push(newServer);
    await pool.query(`INSERT INTO system_settings (key, value) VALUES ('mcp_servers', $1) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`, [JSON.stringify(servers)]);
    res.json({ ok: true, server: newServer });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete("/integration-hub/mcp/servers/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    let servers: any[] = [];
    try {
      const { rows } = await pool.query(`SELECT value FROM system_settings WHERE key = 'mcp_servers' LIMIT 1`);
      if (rows[0]?.value) servers = typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value;
    } catch {}
    servers = servers.filter(s => s.id !== id);
    await pool.query(`INSERT INTO system_settings (key, value) VALUES ('mcp_servers', $1) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`, [JSON.stringify(servers)]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/integration-hub/mcp/tools", async (_req: Request, res: Response) => {
  try {
    const tools = [
      {
        name: "erp_get_customers",
        description: "חיפוש והצגת רשימת לקוחות מה-ERP",
        category: "crm",
        inputSchema: {
          type: "object",
          properties: {
            search: { type: "string", description: "חיפוש לפי שם או מספר לקוח" },
            limit: { type: "number", description: "מספר תוצאות מקסימלי", default: 20 }
          }
        },
        endpoint: "/api/customers",
        method: "GET"
      },
      {
        name: "erp_get_customer",
        description: "הצגת פרטי לקוח לפי מזהה",
        category: "crm",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "number", description: "מזהה לקוח" }
          },
          required: ["id"]
        },
        endpoint: "/api/customers/:id",
        method: "GET"
      },
      {
        name: "erp_get_products",
        description: "חיפוש והצגת רשימת מוצרים/פריטים",
        category: "inventory",
        inputSchema: {
          type: "object",
          properties: {
            search: { type: "string", description: "חיפוש לפי שם מוצר או מק\"ט" },
            category: { type: "string", description: "סינון לפי קטגוריה" },
            limit: { type: "number", default: 20 }
          }
        },
        endpoint: "/api/products",
        method: "GET"
      },
      {
        name: "erp_get_sales_orders",
        description: "הצגת הזמנות מכירה",
        category: "sales",
        inputSchema: {
          type: "object",
          properties: {
            status: { type: "string", description: "סטטוס הזמנה: draft, confirmed, shipped, delivered, cancelled" },
            customer_id: { type: "number", description: "מזהה לקוח לסינון" },
            limit: { type: "number", default: 20 }
          }
        },
        endpoint: "/api/sales-orders",
        method: "GET"
      },
      {
        name: "erp_create_sales_order",
        description: "יצירת הזמנת מכירה חדשה",
        category: "sales",
        inputSchema: {
          type: "object",
          properties: {
            customer_id: { type: "number", description: "מזהה לקוח" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  product_id: { type: "number" },
                  quantity: { type: "number" },
                  unit_price: { type: "number" }
                },
                required: ["product_id", "quantity", "unit_price"]
              }
            },
            notes: { type: "string" }
          },
          required: ["customer_id", "items"]
        },
        endpoint: "/api/sales-orders",
        method: "POST"
      },
      {
        name: "erp_get_purchase_orders",
        description: "הצגת הזמנות רכש",
        category: "purchasing",
        inputSchema: {
          type: "object",
          properties: {
            status: { type: "string" },
            supplier_id: { type: "number" },
            limit: { type: "number", default: 20 }
          }
        },
        endpoint: "/api/purchase-orders",
        method: "GET"
      },
      {
        name: "erp_get_invoices",
        description: "הצגת חשבוניות",
        category: "finance",
        inputSchema: {
          type: "object",
          properties: {
            status: { type: "string", description: "draft, sent, paid, overdue, cancelled" },
            customer_id: { type: "number" },
            limit: { type: "number", default: 20 }
          }
        },
        endpoint: "/api/invoices",
        method: "GET"
      },
      {
        name: "erp_get_inventory",
        description: "הצגת מלאי נוכחי",
        category: "inventory",
        inputSchema: {
          type: "object",
          properties: {
            warehouse_id: { type: "number", description: "מזהה מחסן" },
            product_id: { type: "number", description: "מזהה מוצר" },
            low_stock: { type: "boolean", description: "הצג רק פריטים במלאי נמוך" }
          }
        },
        endpoint: "/api/inventory",
        method: "GET"
      },
      {
        name: "erp_get_suppliers",
        description: "הצגת רשימת ספקים",
        category: "purchasing",
        inputSchema: {
          type: "object",
          properties: {
            search: { type: "string" },
            limit: { type: "number", default: 20 }
          }
        },
        endpoint: "/api/suppliers",
        method: "GET"
      },
      {
        name: "erp_get_production_orders",
        description: "הצגת פקודות ייצור",
        category: "production",
        inputSchema: {
          type: "object",
          properties: {
            status: { type: "string", description: "planned, in_progress, completed, cancelled" },
            limit: { type: "number", default: 20 }
          }
        },
        endpoint: "/api/production-orders",
        method: "GET"
      },
      {
        name: "erp_get_quotes",
        description: "הצגת הצעות מחיר",
        category: "sales",
        inputSchema: {
          type: "object",
          properties: {
            status: { type: "string" },
            customer_id: { type: "number" },
            limit: { type: "number", default: 20 }
          }
        },
        endpoint: "/api/quotes",
        method: "GET"
      },
      {
        name: "erp_get_delivery_notes",
        description: "הצגת תעודות משלוח",
        category: "logistics",
        inputSchema: {
          type: "object",
          properties: {
            status: { type: "string" },
            limit: { type: "number", default: 20 }
          }
        },
        endpoint: "/api/delivery-notes",
        method: "GET"
      },
      {
        name: "erp_dashboard_stats",
        description: "סטטיסטיקות דשבורד — סיכום מכירות, הזמנות פתוחות, מלאי נמוך",
        category: "analytics",
        inputSchema: {
          type: "object",
          properties: {
            period: { type: "string", description: "today, week, month, year", default: "month" }
          }
        },
        endpoint: "/api/dashboard/stats",
        method: "GET"
      },
      {
        name: "erp_create_task",
        description: "יצירת משימה חדשה במערכת",
        category: "tasks",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "כותרת המשימה" },
            description: { type: "string", description: "תיאור המשימה" },
            priority: { type: "string", description: "low, medium, high, urgent", default: "medium" },
            assigned_to: { type: "number", description: "מזהה עובד אחראי" },
            due_date: { type: "string", description: "תאריך יעד (YYYY-MM-DD)" }
          },
          required: ["title"]
        },
        endpoint: "/api/tasks",
        method: "POST"
      },
      {
        name: "erp_get_tasks",
        description: "הצגת רשימת משימות",
        category: "tasks",
        inputSchema: {
          type: "object",
          properties: {
            status: { type: "string", description: "pending, in_progress, completed, cancelled" },
            priority: { type: "string" },
            assigned_to: { type: "number" },
            limit: { type: "number", default: 20 }
          }
        },
        endpoint: "/api/tasks",
        method: "GET"
      }
    ];

    const categories = [...new Set(tools.map(t => t.category))];
    res.json({
      ok: true,
      protocol: "MCP",
      version: "1.0",
      server: "Techno-Kol Uzi ERP",
      tools,
      categories,
      count: tools.length
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: "Failed to list MCP tools" });
  }
});

router.get("/integration-hub/mcp/schema", async (_req: Request, res: Response) => {
  try {
    const tables = await pool.query(`
      SELECT c.relname AS table_name,
        json_agg(json_build_object(
          'column', a.attname,
          'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
          'nullable', NOT a.attnotnull
        ) ORDER BY a.attnum) AS columns
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      GROUP BY c.relname
      ORDER BY c.relname
    `);

    const schema = tables.rows.map((r: any) => ({
      table: r.table_name,
      columns: r.columns
    }));

    res.json({
      ok: true,
      protocol: "MCP",
      version: "1.0",
      server: {
        name: "Techno-Kol Uzi ERP",
        description: "מערכת ERP למפעל מתכת/זכוכית/אלומיניום — טכנו-כל עוזי",
        vendor: "Techno-Kol Uzi",
        capabilities: ["tools", "schema", "execute"]
      },
      schema,
      tableCount: schema.length
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: "Failed to fetch MCP schema" });
  }
});

router.post("/integration-hub/mcp/execute", async (req: Request, res: Response) => {
  try {
    const { tool, params } = req.body;
    if (!tool) return res.status(400).json({ ok: false, error: "חסר שם כלי" });

    const toolDefs: Record<string, { endpoint: string; method: string }> = {
      erp_get_customers: { endpoint: "/api/customers", method: "GET" },
      get_customers: { endpoint: "/api/customers", method: "GET" },
      erp_get_customer: { endpoint: "/api/customers/:id", method: "GET" },
      get_customer: { endpoint: "/api/customers/:id", method: "GET" },
      erp_get_products: { endpoint: "/api/products", method: "GET" },
      get_products: { endpoint: "/api/products", method: "GET" },
      erp_get_sales_orders: { endpoint: "/api/sales-orders", method: "GET" },
      get_orders: { endpoint: "/api/sales-orders", method: "GET" },
      get_sales_orders: { endpoint: "/api/sales-orders", method: "GET" },
      erp_create_task: { endpoint: "/api/project-tasks", method: "POST" },
      create_task: { endpoint: "/api/project-tasks", method: "POST" },
      erp_get_tasks: { endpoint: "/api/project-tasks", method: "GET" },
      get_tasks: { endpoint: "/api/project-tasks", method: "GET" },
      erp_create_sales_order: { endpoint: "/api/sales-orders", method: "POST" },
      create_sales_order: { endpoint: "/api/sales-orders", method: "POST" },
      erp_get_purchase_orders: { endpoint: "/api/purchase-orders", method: "GET" },
      get_purchase_orders: { endpoint: "/api/purchase-orders", method: "GET" },
      erp_get_invoices: { endpoint: "/api/invoices", method: "GET" },
      get_invoices: { endpoint: "/api/invoices", method: "GET" },
      erp_get_inventory: { endpoint: "/api/raw-materials", method: "GET" },
      get_inventory: { endpoint: "/api/raw-materials", method: "GET" },
      erp_get_suppliers: { endpoint: "/api/suppliers", method: "GET" },
      get_suppliers: { endpoint: "/api/suppliers", method: "GET" },
      erp_get_production_orders: { endpoint: "/api/production-orders", method: "GET" },
      get_production_orders: { endpoint: "/api/production-orders", method: "GET" },
      erp_get_quotes: { endpoint: "/api/quotes", method: "GET" },
      get_quotes: { endpoint: "/api/quotes", method: "GET" },
      erp_get_delivery_notes: { endpoint: "/api/delivery-notes", method: "GET" },
      get_delivery_notes: { endpoint: "/api/delivery-notes", method: "GET" },
      erp_dashboard_stats: { endpoint: "/api/dashboard-stats", method: "GET" },
      get_dashboard_stats: { endpoint: "/api/dashboard-stats", method: "GET" },
    };

    const def = toolDefs[tool];
    if (!def) return res.status(404).json({ ok: false, error: `כלי לא נמצא: ${tool}` });

    let endpoint = def.endpoint;
    if (params?.id) endpoint = endpoint.replace(":id", String(params.id));

    const baseUrl = `http://localhost:${process.env.PORT || 8080}`;
    const url = new URL(endpoint, baseUrl);
    if (def.method === "GET" && params) {
      for (const [k, v] of Object.entries(params)) {
        if (k !== "id" && v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }

    const authHeader = req.headers.authorization;
    const fetchOpts: any = {
      method: def.method,
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {})
      }
    };
    if (def.method === "POST" && params) {
      fetchOpts.body = JSON.stringify(params);
    }

    const start = Date.now();
    const resp = await fetch(url.toString(), fetchOpts);
    const latencyMs = Date.now() - start;
    const data = await resp.json();

    await pool.query(
      `INSERT INTO integration_events (service_name, event_type, direction, status, payload, created_at)
       VALUES ($1, $2, 'internal', $3, $4, NOW())`,
      ["mcp_bridge", `tool:${tool}`, resp.ok ? "success" : "error", JSON.stringify({ params, status: resp.status, latencyMs })]
    ).catch(() => {});
    await pool.query(
      `INSERT INTO mcp_calls (tool, params, result, status, duration_ms) VALUES ($1, $2, $3, $4, $5)`,
      [tool, JSON.stringify(params), JSON.stringify(data), resp.ok ? "success" : "error", latencyMs]
    ).catch(() => {});

    res.json({ ok: resp.ok, tool, latencyMs, status: resp.status, result: data });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/integration-hub/services", async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM integration_services ORDER BY id`);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/integration-hub/services", async (req: Request, res: Response) => {
  try {
    const { name, type, category, base_url, auth_type, auth_config, health_endpoint, webhook_url } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: "חסר שם שירות" });
    const { rows } = await pool.query(
      `INSERT INTO integration_services (name, type, category, base_url, auth_type, auth_config, health_endpoint, webhook_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, type || "api", category, base_url, auth_type || "none", JSON.stringify(auth_config || {}), health_endpoint, webhook_url]
    );
    res.json({ ok: true, service: rows[0] });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/integration-hub/events", async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM integration_events ORDER BY created_at DESC LIMIT 50`);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/integration-hub/mcp/calls", async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM mcp_calls ORDER BY created_at DESC LIMIT 50`);
    res.json({ ok: true, calls: rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/integration-hub/webhook-logs", async (req: Request, res: Response) => {
  try {
    const webhookId = req.query.webhook_id;
    const where = webhookId ? `WHERE webhook_id = ${parseInt(String(webhookId))}` : "";
    const { rows } = await pool.query(`SELECT * FROM webhook_logs ${where} ORDER BY created_at DESC LIMIT 50`);
    res.json({ ok: true, logs: rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/integration-hub/event-bus/emit", async (req: Request, res: Response) => {
  try {
    const { event, payload } = req.body;
    if (!event) return res.status(400).json({ ok: false, error: "חסר סוג אירוע" });
    await pool.query(`INSERT INTO integration_events (event_type, direction, status, payload) VALUES ($1, 'internal', 'emitted', $2)`, [event, JSON.stringify(payload || {})]);
    const { rows: webhooks } = await pool.query(`SELECT * FROM integration_webhooks WHERE is_active = true AND (event_type = $1 OR event_type = '*' OR event_type IS NULL)`, [event]);
    const results: any[] = [];
    for (const wh of webhooks) {
      const url = wh.webhook_url || wh.url;
      if (!url || isUnsafeUrl(url)) { results.push({ webhook: wh.name || wh.webhook_name, ok: false, error: "URL חסר או חסום" }); continue; }
      const s = Date.now();
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        const bodyStr = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
        if (wh.secret || wh.secret_key) {
          const crypto = await import("crypto");
          headers["x-webhook-signature"] = crypto.createHmac("sha256", wh.secret || wh.secret_key).update(bodyStr).digest("hex");
        }
        const r = await fetch(url, { method: "POST", headers, body: bodyStr, signal: AbortSignal.timeout(15000) });
        const latencyMs = Date.now() - s;
        let respBody: any = null;
        try { respBody = await r.text(); } catch {}
        await pool.query(`INSERT INTO webhook_logs (webhook_id, webhook_name, payload, response_status, response_body, latency_ms) VALUES ($1, $2, $3, $4, $5, $6)`,
          [wh.id, wh.name || wh.webhook_name, JSON.stringify({ event, payload }), r.status, respBody, latencyMs]).catch(() => {});
        await pool.query(`UPDATE integration_webhooks SET last_triggered = NOW(), last_status = $1 WHERE id = $2`, [r.ok ? "success" : `error_${r.status}`, wh.id]).catch(() => {});
        results.push({ webhook: wh.name || wh.webhook_name, ok: r.ok, status: r.status, latencyMs });
      } catch (err: any) {
        const latencyMs = Date.now() - s;
        await pool.query(`INSERT INTO webhook_logs (webhook_id, webhook_name, payload, response_status, error, latency_ms) VALUES ($1, $2, $3, $4, $5, $6)`,
          [wh.id, wh.name || wh.webhook_name, JSON.stringify({ event, payload }), 0, err.message, latencyMs]).catch(() => {});
        results.push({ webhook: wh.name || wh.webhook_name, ok: false, error: err.message });
      }
    }
    res.json({ ok: true, event, webhooksNotified: results.length, results });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

router.get("/integration-hub/autofix-log", async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`SELECT af.*, s.name as service_name FROM integration_autofix_log af LEFT JOIN integration_services s ON af.service_id = s.id ORDER BY af.created_at DESC LIMIT 30`);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/integration-hub/n8n/config", async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`SELECT key, value FROM system_settings WHERE key IN ('n8n_url', 'n8n_api_key', 'n8n_webhook_url', 'n8n_incoming_secret') ORDER BY key`);
    const cfg: Record<string, string> = {};
    rows.forEach((r: any) => { cfg[r.key] = r.value; });
    let status = "disconnected";
    let workflows: any[] = [];
    if (cfg.n8n_url && cfg.n8n_api_key) {
      try {
        const endpoint = `${cfg.n8n_url.replace(/\/$/, "")}/api/v1/workflows`;
        const r = await fetch(endpoint, { headers: { "X-N8N-API-KEY": cfg.n8n_api_key, "Accept": "application/json" }, signal: AbortSignal.timeout(8000) });
        if (r.ok) {
          const data = await r.json();
          workflows = (data.data || data || []).map((w: any) => ({ id: w.id, name: w.name, active: w.active, createdAt: w.createdAt, updatedAt: w.updatedAt }));
          status = "connected";
        } else { status = `error_${r.status}`; }
      } catch (e: any) { status = `error: ${e.message}`; }
    }
    res.json({ ok: true, config: { url: cfg.n8n_url || null, hasApiKey: !!cfg.n8n_api_key, webhookUrl: cfg.n8n_webhook_url || null, hasIncomingSecret: !!cfg.n8n_incoming_secret }, status, workflows, totalWorkflows: workflows.length, activeWorkflows: workflows.filter((w: any) => w.active).length });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/integration-hub/n8n/config", async (req: Request, res: Response) => {
  try {
    const { url, apiKey, webhookUrl, incomingSecret } = req.body;
    const updates: string[] = [];
    if (url !== undefined) {
      if (url === "" || url === null) { await pool.query(`DELETE FROM system_settings WHERE key = 'n8n_url'`); updates.push("URL נמחק"); }
      else { if (isUnsafeUrl(url)) return res.status(400).json({ ok: false, error: "כתובת פנימית — חסומה" }); await pool.query(`INSERT INTO system_settings (key, value) VALUES ('n8n_url', $1) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`, [url.replace(/\/$/, "")]); updates.push("URL"); }
    }
    if (apiKey !== undefined) {
      if (apiKey === "" || apiKey === null) { await pool.query(`DELETE FROM system_settings WHERE key = 'n8n_api_key'`); updates.push("API Key נמחק"); }
      else { await pool.query(`INSERT INTO system_settings (key, value) VALUES ('n8n_api_key', $1) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`, [apiKey]); updates.push("API Key"); }
    }
    if (webhookUrl !== undefined) {
      if (webhookUrl === "" || webhookUrl === null) { await pool.query(`DELETE FROM system_settings WHERE key = 'n8n_webhook_url'`); updates.push("Webhook URL נמחק"); }
      else { if (isUnsafeUrl(webhookUrl)) return res.status(400).json({ ok: false, error: "כתובת webhook פנימית — חסומה" }); await pool.query(`INSERT INTO system_settings (key, value) VALUES ('n8n_webhook_url', $1) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`, [webhookUrl]); updates.push("Webhook URL"); }
    }
    if (incomingSecret !== undefined) {
      if (incomingSecret === "" || incomingSecret === null) { await pool.query(`DELETE FROM system_settings WHERE key = 'n8n_incoming_secret'`); updates.push("Incoming Secret נמחק"); }
      else { await pool.query(`INSERT INTO system_settings (key, value) VALUES ('n8n_incoming_secret', $1) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`, [incomingSecret]); updates.push("Incoming Secret"); }
    }
    res.json({ ok: true, message: updates.length > 0 ? `עודכן: ${updates.join(", ")}` : "אין שינויים" });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

async function handleN8nWorkflows(req: Request, res: Response) {
  try {
    const { rows: s1 } = await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_url' LIMIT 1`);
    const { rows: s2 } = await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_api_key' LIMIT 1`);
    const url = s1[0]?.value; const key = s2[0]?.value;
    if (!url || !key) return res.status(400).json({ ok: false, error: "n8n לא מוגדר — הגדר URL ו-API Key" });
    const endpoint = `${url.replace(/\/$/, "")}/api/v1/workflows`;
    const r = await fetch(endpoint, { headers: { "X-N8N-API-KEY": key, "Accept": "application/json" }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return res.status(r.status).json({ ok: false, error: `n8n HTTP ${r.status}` });
    const data = await r.json();
    const workflows = (data.data || data || []).map((w: any) => ({ id: w.id, name: w.name, active: w.active, createdAt: w.createdAt, updatedAt: w.updatedAt, nodes: w.nodes?.length || 0, tags: w.tags || [] }));
    res.json({ ok: true, workflows, total: workflows.length, active: workflows.filter((w: any) => w.active).length });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
router.get("/integration-hub/n8n/workflows", handleN8nWorkflows);
router.get("/integrations/n8n/workflows", handleN8nWorkflows);

router.post("/integration-hub/n8n/trigger", async (req: Request, res: Response) => {
  try {
    const { workflowId, data: triggerData } = req.body;
    if (!workflowId) return res.status(400).json({ ok: false, error: "חסר workflowId" });
    const { rows: s1 } = await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_url' LIMIT 1`);
    const { rows: s2 } = await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_api_key' LIMIT 1`);
    const url = s1[0]?.value; const key = s2[0]?.value;
    if (!url || !key) return res.status(400).json({ ok: false, error: "n8n לא מוגדר" });
    const endpoint = `${url.replace(/\/$/, "")}/api/v1/workflows/${encodeURIComponent(workflowId)}/run`;
    const s = Date.now();
    const r = await fetch(endpoint, { method: "POST", headers: { "X-N8N-API-KEY": key, "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify({ data: triggerData || {} }), signal: AbortSignal.timeout(30000) });
    const latencyMs = Date.now() - s;
    let responseBody: any = null;
    try { responseBody = await r.json(); } catch { try { responseBody = await r.text(); } catch {} }
    await pool.query(
      `INSERT INTO integration_events (event_type, direction, status, payload, response, response_code, latency_ms) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ["n8n_trigger", "outgoing", r.ok ? "sent" : "failed", JSON.stringify({ workflowId, data: triggerData }), JSON.stringify(responseBody), r.status, latencyMs]
    ).catch(() => {});
    if (!r.ok) return res.status(r.status).json({ ok: false, error: `n8n HTTP ${r.status}`, response: responseBody, latencyMs });
    res.json({ ok: true, message: `Workflow ${workflowId} הורץ בהצלחה`, executionId: responseBody?.data?.id || responseBody?.id, response: responseBody, latencyMs });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/integration-hub/n8n/webhook-trigger", async (req: Request, res: Response) => {
  try {
    const { webhookPath, data: triggerData } = req.body;
    if (!webhookPath) return res.status(400).json({ ok: false, error: "חסר webhookPath" });
    const { rows: s1 } = await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_url' LIMIT 1`);
    const url = s1[0]?.value;
    if (!url) return res.status(400).json({ ok: false, error: "n8n URL לא מוגדר" });
    const webhookUrl = `${url.replace(/\/$/, "")}/webhook/${webhookPath.replace(/^\//, "")}`;
    if (isUnsafeUrl(webhookUrl)) return res.status(400).json({ ok: false, error: "כתובת פנימית — חסומה" });
    const s = Date.now();
    const r = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "techno-kol-uzi-erp", timestamp: new Date().toISOString(), ...(triggerData || {}) }),
      signal: AbortSignal.timeout(15000)
    });
    const latencyMs = Date.now() - s;
    let responseBody: any = null;
    try { responseBody = await r.text(); } catch {}
    await pool.query(
      `INSERT INTO integration_events (event_type, direction, status, payload, response, response_code, latency_ms) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ["n8n_webhook_trigger", "outgoing", r.ok ? "sent" : "failed", JSON.stringify({ webhookPath, data: triggerData }), JSON.stringify({ body: responseBody }), r.status, latencyMs]
    ).catch(() => {});
    res.json({ ok: r.ok, status: r.status, latencyMs, response: responseBody });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/integration-hub/n8n/executions", async (req: Request, res: Response) => {
  try {
    const { rows: s1 } = await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_url' LIMIT 1`);
    const { rows: s2 } = await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_api_key' LIMIT 1`);
    const url = s1[0]?.value; const key = s2[0]?.value;
    if (!url || !key) return res.status(400).json({ ok: false, error: "n8n לא מוגדר" });
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const workflowId = req.query.workflowId as string;
    let endpoint = `${url.replace(/\/$/, "")}/api/v1/executions?limit=${limit}`;
    if (workflowId) endpoint += `&workflowId=${workflowId}`;
    const r = await fetch(endpoint, { headers: { "X-N8N-API-KEY": key, "Accept": "application/json" }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return res.status(r.status).json({ ok: false, error: `n8n HTTP ${r.status}` });
    const data = await r.json();
    const executions = (data.data || data || []).map((e: any) => ({ id: e.id, workflowId: e.workflowId, status: e.status || (e.finished ? "success" : "running"), startedAt: e.startedAt, stoppedAt: e.stoppedAt, mode: e.mode }));
    res.json({ ok: true, executions, total: executions.length });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/integration-hub/n8n/event-map", async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`SELECT key, value FROM system_settings WHERE key = 'n8n_event_map' LIMIT 1`);
    const eventMap = rows[0]?.value ? (typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value) : [];
    res.json({ ok: true, mappings: eventMap });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/integration-hub/n8n/event-map", async (req: Request, res: Response) => {
  try {
    const { mappings } = req.body;
    if (!Array.isArray(mappings)) return res.status(400).json({ ok: false, error: "mappings חייב להיות מערך" });
    for (const m of mappings) {
      if (!m.erpEvent || !m.n8nTarget) return res.status(400).json({ ok: false, error: "כל mapping חייב לכלול erpEvent ו-n8nTarget" });
    }
    await pool.query(`INSERT INTO system_settings (key, value) VALUES ('n8n_event_map', $1) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`, [JSON.stringify(mappings)]);
    res.json({ ok: true, message: `${mappings.length} מיפויים נשמרו`, mappings });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/integration-hub/incoming", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const { rows } = await pool.query(
      `SELECT * FROM integration_events WHERE direction = 'incoming' ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

async function handleAiAutoConnect(req: Request, res: Response) {
  const startTime = Date.now();
  try {
    const results: any[] = [];
    const fixes: any[] = [];

    for (const [name, checker] of Object.entries(builtinCheckers)) {
      const result = await checkService(name, checker);
      if (result.status === "error") {
        const fix = { name, issue: result.message, action: "ניסיון חיבור מחדש", fixed: false };
        try {
          const retry = await checkService(name, checker);
          if (retry.status === "ok") { fix.fixed = true; fix.action = "AI תיקן — חיבור מחדש הצליח"; result.status = "ok" as any; result.message = retry.message; }
        } catch {}
        fixes.push(fix);
      }
      results.push(result);
    }

    const { rows: dbServices } = await pool.query(`SELECT * FROM integration_services WHERE is_active = true ORDER BY id`);
    for (const svc of dbServices) {
      if (!svc.base_url || isUnsafeUrl(svc.base_url)) {
        results.push({ name: svc.name, status: "warning", message: "לא ניתן לבדוק — URL לא מוגדר" });
        continue;
      }
      const testUrl = svc.health_endpoint ? `${svc.base_url.replace(/\/$/, "")}${svc.health_endpoint}` : svc.base_url;
      const headers: Record<string, string> = { "Accept": "application/json" };
      if (svc.auth_type === "bearer" && svc.auth_config?.token) headers["Authorization"] = `Bearer ${svc.auth_config.token}`;
      if (svc.auth_type === "api_key" && svc.auth_config?.header && svc.auth_config?.key) headers[svc.auth_config.header] = svc.auth_config.key;
      const s = Date.now();
      try {
        let r = await fetch(testUrl, { headers, signal: AbortSignal.timeout(10000) });
        const latencyMs = Date.now() - s;
        if (!r.ok) {
          const fix = { name: svc.name, issue: `HTTP ${r.status}`, action: "", fixed: false };
          if (r.status === 401 || r.status === 403) {
            fix.action = "AI: בעיית אימות — נדרש עדכון token";
          } else {
            try {
              r = await fetch(testUrl, { headers, signal: AbortSignal.timeout(15000) });
              if (r.ok) { fix.fixed = true; fix.action = "AI תיקן — חיבור מחדש הצליח"; }
              else fix.action = `AI: נכשל שוב — HTTP ${r.status}`;
            } catch (e2: any) { fix.action = `AI: ניסיון שני נכשל: ${e2.message}`; }
          }
          fixes.push(fix);
          await pool.query(`INSERT INTO integration_autofix_log (service_id, issue, fix_action, fix_result) VALUES ($1, $2, $3, $4)`,
            [svc.id, fix.issue, fix.action, fix.fixed ? "success" : "failed"]).catch(() => {});
        }
        await pool.query(`UPDATE integration_services SET status = $1, last_check_at = NOW(), last_check_latency_ms = $2, last_error = $3, updated_at = NOW() WHERE id = $4`,
          [r.ok ? "connected" : "error", latencyMs, r.ok ? null : `HTTP ${r.status}`, svc.id]).catch(() => {});
        results.push({ id: svc.id, name: svc.name, status: r.ok ? "ok" : "error", message: r.ok ? "מחובר" : `HTTP ${r.status}`, latencyMs });
      } catch (e: any) {
        await pool.query(`UPDATE integration_services SET status = 'error', last_check_at = NOW(), last_error = $1, updated_at = NOW() WHERE id = $2`, [e.message, svc.id]).catch(() => {});
        results.push({ id: svc.id, name: svc.name, status: "error", message: e.message });
        fixes.push({ name: svc.name, issue: e.message, action: "AI: חיבור נכשל", fixed: false });
      }
    }

    const { rows: webhooks } = await pool.query(`SELECT * FROM integration_webhooks LIMIT 50`).catch(() => ({ rows: [] }));
    const webhookStatus = { total: webhooks.length, active: webhooks.filter((w: any) => w.is_active !== false).length };

    let mcpServers: any[] = [];
    try {
      const { rows } = await pool.query(`SELECT value FROM system_settings WHERE key = 'mcp_servers' LIMIT 1`);
      if (rows[0]?.value) mcpServers = typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value;
    } catch {}

    const unfixedFailures = fixes.filter(f => !f.fixed);
    let aiDiagnoses: any[] = [];
    if (unfixedFailures.length > 0) {
      const geminiResults = await askGeminiForDiagnosis(unfixedFailures.map(f => ({ name: f.name, issue: f.issue })));
      aiDiagnoses = geminiResults;
      for (let i = 0; i < unfixedFailures.length; i++) {
        const gResult = geminiResults[i];
        if (gResult) {
          unfixedFailures[i].action = `AI (Gemini): ${gResult.diagnosis} — ${gResult.suggestedFix}`;
          if (gResult.autoFixable) {
            const svcResult = results.find(r => r.name === unfixedFailures[i].name);
            const action = gResult.fixAction;
            if (action === "retry") {
              const checker = (builtinCheckers as any)[unfixedFailures[i].name];
              if (checker && svcResult) {
                try {
                  const retry = await checkService(unfixedFailures[i].name, checker);
                  if (retry.status === "ok") {
                    unfixedFailures[i].fixed = true;
                    unfixedFailures[i].action = `AI (Gemini) תיקן: ${gResult.suggestedFix}`;
                    svcResult.status = "ok";
                    svcResult.message = retry.message;
                  }
                } catch {}
              }
            } else if (action === "fix_headers" && svcResult?.id) {
              try {
                const { rows: [svc] } = await pool.query(`SELECT auth_config, base_url, health_endpoint, auth_type FROM integration_services WHERE id = $1`, [svcResult.id]);
                if (svc?.auth_config) {
                  const cfg = typeof svc.auth_config === "string" ? JSON.parse(svc.auth_config) : svc.auth_config;
                  cfg._gemini_fixed = true;
                  await pool.query(`UPDATE integration_services SET auth_config = $1, updated_at = NOW() WHERE id = $2`, [JSON.stringify(cfg), svcResult.id]);
                  unfixedFailures[i].action = `AI (Gemini): תיקן headers — ${gResult.suggestedFix}`;
                }
                if (svc?.base_url && !isUnsafeUrl(svc.base_url)) {
                  const verifyUrl = svc.health_endpoint ? `${svc.base_url.replace(/\/$/, "")}${svc.health_endpoint}` : svc.base_url;
                  const hdrs: Record<string, string> = { "Accept": "application/json" };
                  if (svc.auth_type === "bearer" && svc.auth_config?.token) hdrs["Authorization"] = `Bearer ${svc.auth_config.token}`;
                  if (svc.auth_type === "api_key" && svc.auth_config?.header && svc.auth_config?.key) hdrs[svc.auth_config.header] = svc.auth_config.key;
                  try {
                    const vr = await fetch(verifyUrl, { headers: hdrs, signal: AbortSignal.timeout(10000) });
                    if (vr.ok) {
                      unfixedFailures[i].fixed = true;
                      unfixedFailures[i].action = `AI (Gemini) תיקן headers ואימת מחדש: ${gResult.suggestedFix}`;
                      svcResult.status = "ok"; svcResult.message = "AI תיקן ואימת — מחובר";
                      await pool.query(`UPDATE integration_services SET status = 'connected', last_check_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = $1`, [svcResult.id]).catch(() => {});
                    }
                  } catch {}
                }
              } catch {}
            } else if (action === "change_timeout" && svcResult?.id) {
              try {
                await pool.query(`UPDATE integration_services SET timeout_ms = GREATEST(COALESCE(timeout_ms, 10000), 30000), updated_at = NOW() WHERE id = $1`, [svcResult.id]);
                unfixedFailures[i].action = `AI (Gemini): הגדיל timeout — ${gResult.suggestedFix}`;
                const { rows: [svc] } = await pool.query(`SELECT base_url, health_endpoint, auth_type, auth_config FROM integration_services WHERE id = $1`, [svcResult.id]);
                if (svc?.base_url && !isUnsafeUrl(svc.base_url)) {
                  const verifyUrl = svc.health_endpoint ? `${svc.base_url.replace(/\/$/, "")}${svc.health_endpoint}` : svc.base_url;
                  const hdrs: Record<string, string> = { "Accept": "application/json" };
                  if (svc.auth_type === "bearer" && svc.auth_config?.token) hdrs["Authorization"] = `Bearer ${svc.auth_config.token}`;
                  if (svc.auth_type === "api_key" && svc.auth_config?.header && svc.auth_config?.key) hdrs[svc.auth_config.header] = svc.auth_config.key;
                  try {
                    const vr = await fetch(verifyUrl, { headers: hdrs, signal: AbortSignal.timeout(30000) });
                    if (vr.ok) {
                      unfixedFailures[i].fixed = true;
                      unfixedFailures[i].action = `AI (Gemini) הגדיל timeout ואימת מחדש: ${gResult.suggestedFix}`;
                      svcResult.status = "ok"; svcResult.message = "AI תיקן timeout ואימת — מחובר";
                      await pool.query(`UPDATE integration_services SET status = 'connected', last_check_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = $1`, [svcResult.id]).catch(() => {});
                    }
                  } catch {}
                }
              } catch {}
            } else if (action === "disable" && svcResult?.id) {
              try {
                await pool.query(`UPDATE integration_services SET is_active = false, status = 'disabled', updated_at = NOW() WHERE id = $1`, [svcResult.id]);
                unfixedFailures[i].fixed = true;
                unfixedFailures[i].action = `AI (Gemini): השבית שירות — ${gResult.suggestedFix}`;
                if (svcResult) { svcResult.status = "disabled"; svcResult.message = "AI השבית עקב תקלה מתמשכת"; }
              } catch {}
            }
          }
        }
        await pool.query(`INSERT INTO integration_autofix_log (service_id, issue, fix_action, fix_result) VALUES ($1, $2, $3, $4)`,
          [null, unfixedFailures[i].issue, unfixedFailures[i].action, unfixedFailures[i].fixed ? "success" : "ai_diagnosed"]).catch(() => {});
      }
    }

    const connected = results.filter(r => r.status === "ok").length;
    const warnings = results.filter(r => r.status === "warning").length;
    const errors = results.filter(r => r.status === "error").length;

    res.json({
      ok: errors === 0,
      message: errors === 0
        ? `AI חיבר הכל — ${connected} שירותים פעילים`
        : `AI (Gemini) אבחן ${errors} בעיות, תיקן ${fixes.filter(f => f.fixed).length}`,
      durationMs: Date.now() - startTime,
      summary: { total: results.length, connected, warnings, errors, fixesApplied: fixes.filter(f => f.fixed).length },
      services: results,
      fixes,
      aiDiagnoses,
      webhooks: webhookStatus,
      mcpServers: { total: mcpServers.length },
      aiActions: fixes.map(f => ({ service: f.name, issue: f.issue, action: f.action, resolved: f.fixed }))
    });
  } catch (err: any) {
    logger.error("[Integration Hub] ai/auto-connect failed:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}
router.post("/integration-hub/ai/auto-connect", handleAiAutoConnect);
router.post("/integrations/ai/auto-connect", handleAiAutoConnect);

async function handleAiDiagnose(req: Request, res: Response) {
  try {
    const { issue, service_name, context } = req.body;
    if (!issue) return res.status(400).json({ ok: false, error: "חסר תיאור בעיה" });

    const knownPatterns: Array<{ pattern: RegExp; category: string; diagnosis: string; fix: string; autoFixable: boolean; fixAction?: string }> = [
      { pattern: /timeout|ETIMEDOUT|ECONNREFUSED/i, category: "connectivity", diagnosis: "שירות לא מגיב — בעיית חיבור או שרת לא זמין", fix: "בדוק שהשירות פועל, בדוק חיבור רשת, ודא שה-firewall לא חוסם", autoFixable: true, fixAction: "restart_service" },
      { pattern: /401|unauthorized|authentication/i, category: "auth", diagnosis: "בעיית אימות — token פג תוקף או פרטי גישה שגויים", fix: "חדש את ה-token, בדוק API key, ודא שההרשאות נכונות", autoFixable: true, fixAction: "refresh_token" },
      { pattern: /403|forbidden|permission/i, category: "auth", diagnosis: "אין הרשאה — למשתמש אין גישה למשאב", fix: "בדוק הרשאות המשתמש, ודא שה-role נכון, בדוק IP whitelist", autoFixable: false },
      { pattern: /404|not found/i, category: "config", diagnosis: "משאב לא נמצא — URL שגוי או משאב נמחק", fix: "בדוק את ה-URL, ודא שהמשאב קיים, בדוק routing", autoFixable: false },
      { pattern: /500|internal server|crash/i, category: "server", diagnosis: "שגיאת שרת פנימית — בעיה בקוד או בתשתית", fix: "בדוק לוגים של השרת, בדוק DB connection, בדוק זיכרון", autoFixable: true, fixAction: "restart_service" },
      { pattern: /429|rate.?limit|throttl/i, category: "rate_limit", diagnosis: "חריגה ממגבלת קצב — יותר מדי בקשות", fix: "הפחת תדירות בקשות, הוסף delay בין קריאות, שדרג חבילת API", autoFixable: true, fixAction: "apply_rate_limit_backoff" },
      { pattern: /SSL|TLS|certificate/i, category: "security", diagnosis: "בעיית אבטחת SSL/TLS — תעודה פגה או לא תקינה", fix: "חדש תעודת SSL, בדוק chain of trust, ודא תאריך תוקף", autoFixable: false },
      { pattern: /database|DB|postgres|query|SQL/i, category: "database", diagnosis: "בעיית מסד נתונים — חיבור או שאילתא נכשלו", fix: "בדוק חיבור DB, בדוק pool connections, ודא schema תקין", autoFixable: true, fixAction: "reset_db_pool" },
      { pattern: /webhook|callback|hook/i, category: "webhook", diagnosis: "בעיית webhook — endpoint לא מגיב או מחזיר שגיאה", fix: "בדוק URL של ה-webhook, ודא שהשרת מקבל POST, בדוק payload format", autoFixable: true, fixAction: "retry_webhook" },
      { pattern: /sync|replication|mismatch/i, category: "sync", diagnosis: "בעיית סנכרון — נתונים לא מסונכרנים בין מערכות", fix: "הרץ סנכרון מחדש, בדוק conflict resolution, ודא timestamps", autoFixable: true, fixAction: "force_sync" },
      { pattern: /memory|heap|OOM/i, category: "resources", diagnosis: "בעיית זיכרון — שימוש חורג מהמותר", fix: "הגדל מגבלת זיכרון, בדוק memory leaks, אופטם שאילתות", autoFixable: true, fixAction: "restart_service" },
      { pattern: /disk|storage|space/i, category: "resources", diagnosis: "בעיית אחסון — דיסק מלא או כמעט מלא", fix: "נקה קבצים זמניים, מחק לוגים ישנים, הגדל שטח אחסון", autoFixable: true, fixAction: "cleanup_temp_files" }
    ];

    let diagnosis = "בעיה לא מזוהה — נדרשת בדיקה ידנית";
    let fix = "בדוק לוגים מפורטים של השירות, נסה לשחזר את הבעיה, פנה לתמיכה טכנית";
    let category = "unknown";
    let autoFixable = false;
    let fixAction: string | null = null;
    let confidence = 0.3;

    for (const p of knownPatterns) {
      if (p.pattern.test(issue) || (context && p.pattern.test(JSON.stringify(context)))) {
        diagnosis = p.diagnosis;
        fix = p.fix;
        category = p.category;
        autoFixable = p.autoFixable;
        fixAction = p.fixAction || null;
        confidence = 0.85;
        break;
      }
    }

    const { rows: relatedEvents } = await pool.query(
      `SELECT event_type, status, COUNT(*) as count FROM integration_events 
       WHERE created_at > NOW() - INTERVAL '24 hours' 
       GROUP BY event_type, status ORDER BY count DESC LIMIT 5`
    );

    let geminiDiagnosis: any = null;
    if (confidence < 0.8) {
      const geminiResults = await askGeminiForDiagnosis([{ name: service_name || "unknown", issue, context }]);
      if (geminiResults[0] && geminiResults[0].diagnosis !== issue) {
        geminiDiagnosis = geminiResults[0];
        diagnosis = geminiResults[0].diagnosis;
        fix = geminiResults[0].suggestedFix;
        autoFixable = geminiResults[0].autoFixable;
        fixAction = geminiResults[0].fixAction;
        confidence = 0.9;
        category = "ai_analyzed";
      }
    }

    const result = {
      ok: true,
      diagnosis: {
        issue,
        service: service_name || null,
        category,
        diagnosis,
        suggestedFix: fix,
        autoFixable,
        fixAction,
        confidence,
        aiPowered: !!geminiDiagnosis,
        relatedEvents,
        analyzedAt: new Date().toISOString()
      }
    };

    await pool.query(
      `INSERT INTO integration_autofix_log (service_id, issue, fix_action, fix_result) VALUES ($1, $2, $3, $4)`,
      [null, issue, fixAction || "manual_review", JSON.stringify(result.diagnosis)]
    ).catch(() => {});

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
router.post("/integration-hub/ai/diagnose", handleAiDiagnose);
router.post("/integrations/ai/diagnose", handleAiDiagnose);

router.post("/integrations/n8n/connect", async (req: Request, res: Response) => {
  try {
    const { webhookUrl, url, apiKey } = req.body;
    if (url) {
      if (isUnsafeUrl(url)) return res.status(400).json({ ok: false, error: "כתובת פנימית — חסומה" });
      await pool.query(`INSERT INTO system_settings (key, value) VALUES ('n8n_url', $1) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`, [url.replace(/\/$/, "")]);
    }
    if (apiKey) {
      await pool.query(`INSERT INTO system_settings (key, value) VALUES ('n8n_api_key', $1) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`, [apiKey]);
    }
    if (webhookUrl) {
      if (isUnsafeUrl(webhookUrl)) return res.status(400).json({ ok: false, error: "כתובת webhook פנימית — חסומה" });
      await pool.query(`INSERT INTO system_settings (key, value) VALUES ('n8n_webhook_url', $1) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`, [webhookUrl]);
    }
    let status = "disconnected";
    const finalUrl = url || (await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_url' LIMIT 1`)).rows[0]?.value;
    const finalKey = apiKey || (await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_api_key' LIMIT 1`)).rows[0]?.value;
    if (finalUrl && finalKey) {
      try {
        const r = await fetch(`${finalUrl.replace(/\/$/, "")}/api/v1/workflows`, { headers: { "X-N8N-API-KEY": finalKey, "Accept": "application/json" }, signal: AbortSignal.timeout(8000) });
        status = r.ok ? "connected" : `error_${r.status}`;
      } catch { status = "error"; }
    }
    res.json({ ok: true, message: "n8n מחובר בהצלחה", status });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

router.post("/integrations/n8n/trigger/:workflow", async (req: Request, res: Response) => {
  try {
    const workflowId = req.params.workflow;
    const triggerData = req.body.data || req.body;
    const { rows: s1 } = await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_url' LIMIT 1`);
    const { rows: s2 } = await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_api_key' LIMIT 1`);
    const url = s1[0]?.value; const key = s2[0]?.value;
    if (!url || !key) return res.status(400).json({ ok: false, error: "n8n לא מוגדר — הגדר URL ו-API Key" });
    const endpoint = `${url.replace(/\/$/, "")}/api/v1/workflows/${encodeURIComponent(workflowId)}/run`;
    const s = Date.now();
    const r = await fetch(endpoint, { method: "POST", headers: { "X-N8N-API-KEY": key, "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify({ data: triggerData || {} }), signal: AbortSignal.timeout(30000) });
    const latencyMs = Date.now() - s;
    let responseBody: any = null;
    try { responseBody = await r.json(); } catch { try { responseBody = await r.text(); } catch {} }
    await pool.query(
      `INSERT INTO integration_events (event_type, direction, status, payload, response, response_code, latency_ms) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ["n8n_trigger", "outgoing", r.ok ? "sent" : "failed", JSON.stringify({ workflowId, data: triggerData }), JSON.stringify(responseBody), r.status, latencyMs]
    ).catch(() => {});
    if (!r.ok) return res.status(r.status).json({ ok: false, error: `n8n HTTP ${r.status}`, response: responseBody, latencyMs });
    res.json({ ok: true, message: `Workflow ${workflowId} הורץ בהצלחה`, executionId: responseBody?.data?.id || responseBody?.id, response: responseBody, latencyMs });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

async function handleN8nSync(req: Request, res: Response) {
  try {
    const { entities } = req.body;
    const syncTypes = entities || ["customers", "products", "orders", "inventory"];
    const { rows: s1 } = await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_url' LIMIT 1`);
    const { rows: s2 } = await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_api_key' LIMIT 1`);
    const { rows: s3 } = await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_webhook_url' LIMIT 1`);
    const webhookUrl = s3[0]?.value;
    const n8nUrl = s1[0]?.value; const n8nKey = s2[0]?.value;
    if (!webhookUrl && !n8nUrl) return res.status(400).json({ ok: false, error: "n8n \u05DC\u05D0 \u05DE\u05D5\u05D2\u05D3\u05E8 \u2014 \u05D4\u05D2\u05D3\u05E8 webhook URL \u05D0\u05D5 n8n URL" });

    const results: any[] = [];
    const baseUrl = `http://localhost:${process.env.PORT || 8080}`;
    const authHeader = req.headers.authorization;

    for (const entity of syncTypes) {
      const entityMap: Record<string, string> = { customers: "/api/customers", products: "/api/products", orders: "/api/sales-orders", inventory: "/api/raw-materials", suppliers: "/api/suppliers", invoices: "/api/invoices" };
      const ep = entityMap[entity];
      if (!ep) { results.push({ entity, ok: false, error: "\u05E1\u05D5\u05D2 \u05DC\u05D0 \u05DE\u05D5\u05DB\u05E8" }); continue; }
      try {
        const dataResp = await fetch(`${baseUrl}${ep}?limit=100`, { headers: { ...(authHeader ? { Authorization: authHeader } : {}), "Accept": "application/json" } });
        if (!dataResp.ok) { results.push({ entity, ok: false, error: `HTTP ${dataResp.status}` }); continue; }
        const data = await dataResp.json();
        const items = Array.isArray(data) ? data : data.data || data.customers || data.products || data.orders || data.items || [];
        const targetUrl = webhookUrl ? `${webhookUrl.replace(/\/$/, "")}/erp-sync` : `${n8nUrl!.replace(/\/$/, "")}/webhook/erp-sync`;
        if (isUnsafeUrl(targetUrl)) { results.push({ entity, ok: false, error: "URL \u05D7\u05E1\u05D5\u05DD" }); continue; }
        const s = Date.now();
        const syncResp = await fetch(targetUrl, { method: "POST", headers: { "Content-Type": "application/json", ...(n8nKey ? { "X-N8N-API-KEY": n8nKey } : {}) }, body: JSON.stringify({ entity, count: items.length, data: items, syncedAt: new Date().toISOString() }), signal: AbortSignal.timeout(30000) });
        const latencyMs = Date.now() - s;
        await pool.query(`INSERT INTO integration_events (event_type, direction, status, payload, response_code, latency_ms) VALUES ($1, $2, $3, $4, $5, $6)`,
          [`n8n_sync_${entity}`, "outgoing", syncResp.ok ? "sent" : "failed", JSON.stringify({ entity, count: items.length }), syncResp.status, latencyMs]).catch(() => {});
        results.push({ entity, ok: syncResp.ok, count: items.length, latencyMs, status: syncResp.status });
      } catch (err: any) { results.push({ entity, ok: false, error: err.message }); }
    }
    const synced = results.filter(r => r.ok).length;
    res.json({ ok: synced > 0, message: `${synced}/${results.length} \u05E1\u05D5\u05D2\u05D9 \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05E1\u05D5\u05E0\u05DB\u05E8\u05E0\u05D5 \u05DC-n8n`, results, syncedAt: new Date().toISOString() });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
}
router.post("/integrations/n8n/sync", handleN8nSync);
router.post("/integration-hub/n8n/sync", handleN8nSync);

export default router;
