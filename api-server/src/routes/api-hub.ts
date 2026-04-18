import { Router, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { existsSync, statSync, accessSync, constants as fsConstants } from "fs";
import { join } from "path";

const router = Router();

function svcResult(name: string, ok: boolean, message: string, latencyMs?: number, extra?: Record<string, any>) {
  return {
    name,
    status: ok ? "ok" as const : (extra?.configured === false ? "warning" as const : "error" as const),
    message,
    latencyMs: latencyMs ?? 0,
    lastChecked: new Date().toISOString(),
    ...extra,
  };
}

function isUnsafeUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (!["http:", "https:"].includes(u.protocol)) return true;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") return true;
    if (host.startsWith("10.") || host.startsWith("192.168.") || host.startsWith("169.254.")) return true;
    if (host.endsWith(".internal") || host.endsWith(".local")) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
    if (/^fc[0-9a-f]{2}:/i.test(host) || /^fd[0-9a-f]{2}:/i.test(host)) return true;
    return false;
  } catch {
    return true;
  }
}

function buildHeaders(conn: any): Record<string, string> {
  const h: Record<string, string> = { "User-Agent": "TechnoKolUzi-ERP/1.0" };
  if (conn.headers) {
    try {
      const parsed = typeof conn.headers === "string" ? JSON.parse(conn.headers) : conn.headers;
      Object.assign(h, parsed);
    } catch {}
  }
  if (conn.auth_type === "bearer" && conn.auth_config) {
    try {
      const cfg = typeof conn.auth_config === "string" ? JSON.parse(conn.auth_config) : conn.auth_config;
      if (cfg.token) h["Authorization"] = `Bearer ${cfg.token}`;
    } catch {}
  } else if (conn.auth_type === "api-key" && conn.auth_config) {
    try {
      const cfg = typeof conn.auth_config === "string" ? JSON.parse(conn.auth_config) : conn.auth_config;
      if (cfg.header_name && cfg.key) h[cfg.header_name] = cfg.key;
    } catch {}
  }
  return h;
}

async function probeUrl(url: string, method: string, headers: Record<string, string>, timeoutMs: number): Promise<{ ok: boolean; status: number; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const r = await fetch(url, {
      method: ["POST", "HEAD"].includes(method) ? method : "GET",
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { ok: r.status >= 200 && r.status < 400, status: r.status, latencyMs: Date.now() - start };
  } catch (e: any) {
    return { ok: false, status: 0, latencyMs: Date.now() - start, error: e.name === "AbortError" || e.name === "TimeoutError" ? "Timeout" : e.message };
  }
}

async function retryConnection(conn: any, testUrl: string, headers: Record<string, string>): Promise<{ fixed: boolean; action?: string }> {
  const method = ["POST", "HEAD"].includes(conn.method) ? conn.method : "GET";

  for (let attempt = 1; attempt <= 3; attempt++) {
    await new Promise(r => setTimeout(r, attempt * 1000));
    const result = await probeUrl(testUrl, method, headers, (conn.timeout_ms || 15000) + attempt * 5000);
    if (result.ok) {
      await pool.query(
        `UPDATE api_connections SET last_test_at = NOW(), last_test_status = 'success', last_test_latency_ms = $1, updated_at = NOW() WHERE id = $2`,
        [result.latencyMs, conn.id]
      );
      await pool.query(
        `INSERT INTO api_connection_logs (connection_id, action, status, latency_ms, details) VALUES ($1, 'auto-fix', 'success', $2, $3)`,
        [conn.id, result.latencyMs, `תוקן — ניסיון ${attempt}`]
      );
      return { fixed: true, action: `תוקן בניסיון חוזר #${attempt}` };
    }
  }

  const altProto = testUrl.startsWith("http://")
    ? testUrl.replace("http://", "https://")
    : testUrl.replace("https://", "http://");
  if (!isUnsafeUrl(altProto)) {
    const altResult = await probeUrl(altProto, "GET", headers, 10000);
    if (altResult.ok) {
      const newBase = conn.health_endpoint ? altProto.replace(conn.health_endpoint, "") : altProto;
      await pool.query(
        `UPDATE api_connections SET base_url = $1, last_test_at = NOW(), last_test_status = 'success', updated_at = NOW() WHERE id = $2`,
        [newBase, conn.id]
      );
      await pool.query(
        `INSERT INTO api_connection_logs (connection_id, action, status, details) VALUES ($1, 'auto-fix', 'success', $2)`,
        [conn.id, `תוקן — שינוי פרוטוקול`]
      );
      return { fixed: true, action: "תוקן — שינוי פרוטוקול" };
    }
  }

  return { fixed: false };
}

router.get("/hub/status", async (_req: Request, res: Response) => {
  try {
    const startTime = Date.now();

    const system: any[] = [];

    const apiStart = Date.now();
    try {
      const r = await fetch("http://localhost:8080/api/health", { signal: AbortSignal.timeout(5000) });
      const ok = r.status >= 200 && r.status < 400;
      system.push(svcResult("ERP API Server", ok, ok ? "שרת פעיל ותקין" : `HTTP ${r.status}`, Date.now() - apiStart));
    } catch (e: any) {
      system.push(svcResult("ERP API Server", false, e.message, Date.now() - apiStart));
    }

    const dbStart = Date.now();
    try {
      await pool.query("SELECT 1");
      system.push(svcResult("PostgreSQL Database", true, "מסד נתונים פעיל", Date.now() - dbStart));
    } catch (e: any) {
      system.push(svcResult("PostgreSQL Database", false, e.message, Date.now() - dbStart));
    }

    const uploadsDir = join(process.cwd(), "uploads");
    const subDirs = ["documents", "kobi", "exports"];
    try {
      const exists = existsSync(uploadsDir);
      let writable = false;
      if (exists) { try { accessSync(uploadsDir, fsConstants.W_OK); writable = true; } catch {} }
      const activeSubs = subDirs.filter(d => existsSync(join(uploadsDir, d)));
      const ok = exists && writable;
      system.push(svcResult("Storage (Uploads)", ok, ok ? `תיקייה פעילה — ${activeSubs.length} תתי-תיקיות` : (exists ? "תיקייה קיימת אך לא ניתנת לכתיבה" : "תיקיית uploads לא קיימת"), 0, { path: uploadsDir, writable, subfolders: activeSubs }));
    } catch (e: any) {
      system.push(svcResult("Storage (Uploads)", false, e.message));
    }

    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;
    if (gmailUser && gmailPass) {
      const eStart = Date.now();
      try {
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.default.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });
        await transporter.verify();
        system.push(svcResult("Email (SMTP/Gmail)", true, `SMTP מחובר — ${gmailUser}`, Date.now() - eStart, { account: gmailUser }));
      } catch (e: any) {
        system.push(svcResult("Email (SMTP/Gmail)", false, e.message, Date.now() - eStart, { account: gmailUser }));
      }
    } else {
      system.push(svcResult("Email (SMTP/Gmail)", false, "חסר GMAIL_USER או GMAIL_APP_PASSWORD", 0, { configured: false }));
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      const gStart = Date.now();
      try {
        const gr = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`, { signal: AbortSignal.timeout(8000) });
        system.push(svcResult("Google AI (Gemini)", gr.ok, gr.ok ? "Gemini API פעיל" : `HTTP ${gr.status}`, Date.now() - gStart));
      } catch (e: any) {
        system.push(svcResult("Google AI (Gemini)", false, e.message, Date.now() - gStart));
      }
    } else {
      system.push(svcResult("Google AI (Gemini)", false, "GEMINI_API_KEY לא מוגדר", 0, { configured: false }));
    }

    const n8n: any = { name: "n8n Workflow Engine", ok: false, configured: false };
    let n8nUrl: string | undefined;
    let n8nKey: string | undefined;
    let n8nWebhookUrl: string | undefined;
    try {
      const { rows: s1 } = await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_url' LIMIT 1`);
      const { rows: s2 } = await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_api_key' LIMIT 1`);
      const { rows: s3 } = await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_webhook_url' LIMIT 1`);
      n8nUrl = s1[0]?.value;
      n8nKey = s2[0]?.value;
      n8nWebhookUrl = s3[0]?.value;
    } catch {}
    if (!n8nWebhookUrl) {
      n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || undefined;
    }
    if (!n8nUrl || !n8nKey) {
      try {
        const { rows } = await pool.query(`SELECT * FROM api_connections WHERE LOWER(name) LIKE '%n8n%' AND is_active = true LIMIT 1`);
        if (rows[0]) {
          n8nUrl = rows[0].base_url;
          try {
            const cfg = typeof rows[0].auth_config === "string" ? JSON.parse(rows[0].auth_config) : rows[0].auth_config;
            n8nKey = cfg?.token || cfg?.key || cfg?.api_key;
          } catch {}
        }
      } catch {}
    }
    if (n8nUrl && n8nKey) {
      const endpoint = `${n8nUrl.replace(/\/+$/, "")}/api/v1/workflows`;
      if (isUnsafeUrl(endpoint)) {
        n8n.error = "כתובת n8n פנימית — חסומה מטעמי אבטחה";
      } else {
        n8n.configured = true;
        const nStart = Date.now();
        try {
          const nr = await fetch(endpoint, {
            headers: { "X-N8N-API-KEY": n8nKey, "Accept": "application/json" },
            signal: AbortSignal.timeout(8000),
          });
          n8n.latencyMs = Date.now() - nStart;
          if (nr.ok) {
            const data = await nr.json();
            const wfs = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
            n8n.ok = true;
            n8n.workflows = wfs.length;
            n8n.activeWorkflows = wfs.filter((w: any) => w.active).length;
          } else {
            n8n.error = `HTTP ${nr.status}`;
          }
        } catch (e: any) {
          n8n.latencyMs = Date.now() - nStart;
          n8n.error = e.name === "AbortError" || e.name === "TimeoutError" ? "Timeout" : e.message;
        }
      }
    } else {
      n8n.error = "לא מוגדר — חסר URL או API Key";
    }
    if (n8nWebhookUrl) {
      n8n.webhookUrl = n8nWebhookUrl;
    }

    const { rows: allConns } = await pool.query(`SELECT * FROM api_connections ORDER BY id`);

    const connections: any[] = [];
    const fixes: any[] = [];

    await Promise.allSettled(allConns.map(async (conn: any) => {
      const testUrl = conn.health_endpoint
        ? `${conn.base_url.replace(/\/$/, "")}${conn.health_endpoint}`
        : conn.base_url;

      if (isUnsafeUrl(testUrl)) {
        connections.push({ id: conn.id, name: conn.name, category: conn.category, ok: false, skipped: true, reason: "כתובת פנימית" });
        return;
      }

      const headers = buildHeaders(conn);
      const result = await probeUrl(testUrl, conn.method || "GET", headers, conn.timeout_ms || 15000);

      await pool.query(
        `UPDATE api_connections SET last_test_at = NOW(), last_test_status = $1, last_test_latency_ms = $2, updated_at = NOW() WHERE id = $3`,
        [result.ok ? "success" : "error", result.latencyMs, conn.id]
      );
      await pool.query(
        `INSERT INTO api_connection_logs (connection_id, action, status, latency_ms, response_code, details) VALUES ($1, 'hub-scan', $2, $3, $4, $5)`,
        [conn.id, result.ok ? "success" : "error", result.latencyMs, result.status || null, result.ok ? "תקין" : (result.error || `HTTP ${result.status}`)]
      );

      const entry: any = {
        id: conn.id,
        name: conn.name,
        category: conn.category,
        url: conn.base_url,
        ok: result.ok,
        status: result.status,
        latencyMs: result.latencyMs,
      };
      if (result.error) entry.error = result.error;

      if (result.ok && !conn.is_active) {
        await pool.query(`UPDATE api_connections SET is_active = true, updated_at = NOW() WHERE id = $1`, [conn.id]);
        fixes.push({ id: conn.id, name: conn.name, action: "הופעל מחדש — תקין", severity: "info" });
        entry.fixed = "הופעל מחדש";
      }

      if (!result.ok && conn.is_active) {
        const fix = await retryConnection(conn, testUrl, headers);
        if (fix.fixed) {
          entry.ok = true;
          entry.fixed = fix.action;
          entry.error = undefined;
          fixes.push({ id: conn.id, name: conn.name, action: fix.action!, severity: "success" });
        } else {
          fixes.push({ id: conn.id, name: conn.name, action: "נכשל — דורש טיפול ידני", severity: "error" });
        }
      }

      connections.push(entry);
    }));

    const healthy = connections.filter(c => c.ok).length;
    const broken = connections.filter(c => !c.ok && !c.skipped).length;
    const skipped = connections.filter(c => c.skipped).length;
    const allSystemOk = system.every(s => s.ok);

    res.json({
      overallHealth: allSystemOk && broken === 0 ? "healthy" : broken > 0 ? "degraded" : "warning",
      scannedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      system,
      n8n,
      summary: {
        total: allConns.length,
        healthy,
        broken,
        skipped,
        fixesApplied: fixes.filter(f => f.severity !== "error").length,
      },
      connections,
      fixes,
    });
  } catch (err: any) {
    logger.error("[API Hub] status check failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/hub/n8n/status", async (_req: Request, res: Response) => {
  try {
    let n8nUrl: string | undefined;
    let n8nKey: string | undefined;
    let source: string | undefined;

    try {
      const { rows: s1 } = await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_url' LIMIT 1`);
      const { rows: s2 } = await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_api_key' LIMIT 1`);
      if (s1[0]?.value && s2[0]?.value) {
        n8nUrl = s1[0].value;
        n8nKey = s2[0].value;
        source = "system_settings";
      }
    } catch {}

    if (!n8nUrl || !n8nKey) {
      try {
        const { rows } = await pool.query(`SELECT * FROM api_connections WHERE LOWER(name) LIKE '%n8n%' AND is_active = true LIMIT 1`);
        if (rows[0]) {
          n8nUrl = rows[0].base_url;
          source = "api_connections";
          try {
            const cfg = typeof rows[0].auth_config === "string" ? JSON.parse(rows[0].auth_config) : rows[0].auth_config;
            n8nKey = cfg?.token || cfg?.key || cfg?.api_key;
          } catch {}
        }
      } catch {}
    }

    if (!n8nUrl || !n8nKey) {
      return res.json({
        service: "n8n Workflow Engine",
        ok: false,
        configured: false,
        source: null,
        error: "לא מוגדר — חסר URL או API Key",
        help: "הגדר n8n_url ו-n8n_api_key בהגדרות מערכת, או צור חיבור API בשם n8n",
      });
    }

    const cleanUrl = n8nUrl.replace(/\/+$/, "");
    const workflowsEndpoint = `${cleanUrl}/api/v1/workflows`;

    if (isUnsafeUrl(workflowsEndpoint)) {
      return res.json({ service: "n8n Workflow Engine", ok: false, configured: true, source, error: "כתובת פנימית — חסומה מטעמי אבטחה" });
    }

    const start = Date.now();
    const headers = { "X-N8N-API-KEY": n8nKey, "Accept": "application/json" };

    const [wfRes, execRes] = await Promise.allSettled([
      fetch(workflowsEndpoint, { headers, signal: AbortSignal.timeout(8000) }),
      fetch(`${cleanUrl}/api/v1/executions?limit=5`, { headers, signal: AbortSignal.timeout(8000) }),
    ]);

    const latencyMs = Date.now() - start;
    const result: any = { service: "n8n Workflow Engine", configured: true, source, url: cleanUrl, latencyMs };

    if (wfRes.status === "fulfilled" && wfRes.value.ok) {
      const data = await wfRes.value.json();
      const wfs = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      result.ok = true;
      result.workflows = {
        total: wfs.length,
        active: wfs.filter((w: any) => w.active).length,
        inactive: wfs.filter((w: any) => !w.active).length,
      };
    } else {
      result.ok = false;
      if (wfRes.status === "rejected") {
        result.error = wfRes.reason?.name === "AbortError" || wfRes.reason?.name === "TimeoutError" ? "Timeout" : wfRes.reason?.message;
      } else {
        result.error = `HTTP ${wfRes.value.status}`;
      }
    }

    if (execRes.status === "fulfilled" && execRes.value.ok) {
      try {
        const execData = await execRes.value.json();
        const execs = Array.isArray(execData?.data) ? execData.data : (Array.isArray(execData) ? execData : []);
        result.recentExecutions = execs.slice(0, 5).map((e: any) => ({
          id: e.id,
          workflowId: e.workflowId,
          status: e.status || (e.finished ? "success" : e.stoppedAt ? "error" : "running"),
          startedAt: e.startedAt,
          finishedAt: e.stoppedAt || e.finishedAt,
        }));
      } catch {}
    }

    res.json(result);
  } catch (err: any) {
    logger.error("[API Hub] n8n status check failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/hub/n8n/connect", async (req: Request, res: Response) => {
  try {
    const { url, api_key, webhook_url } = req.body;
    if (!url || !api_key) {
      return res.status(400).json({ ok: false, error: "חסר url ו/או api_key" });
    }

    const cleanUrl = url.replace(/\/+$/, "");
    const workflowsEndpoint = `${cleanUrl}/api/v1/workflows`;

    if (isUnsafeUrl(workflowsEndpoint)) {
      return res.status(400).json({ ok: false, error: "כתובת n8n פנימית — חסומה מטעמי אבטחה" });
    }

    const start = Date.now();
    let workflowCount = 0;
    let activeCount = 0;
    try {
      const r = await fetch(workflowsEndpoint, {
        headers: { "X-N8N-API-KEY": api_key, "Accept": "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) {
        const statusText = r.status === 401 ? "מפתח API שגוי" : r.status === 403 ? "אין הרשאה" : `HTTP ${r.status}`;
        return res.json({ ok: false, error: `חיבור נכשל — ${statusText}`, latencyMs: Date.now() - start });
      }
      const data = await r.json();
      const wfs = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      workflowCount = wfs.length;
      activeCount = wfs.filter((w: any) => w.active).length;
    } catch (e: any) {
      const msg = e.name === "AbortError" || e.name === "TimeoutError" ? "Timeout — n8n לא הגיב" : e.message;
      return res.json({ ok: false, error: msg, latencyMs: Date.now() - start });
    }
    const latencyMs = Date.now() - start;

    const q = pool.query.bind(pool);
    await q(`INSERT INTO system_settings (key, value) VALUES ('n8n_url', $1) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`, [cleanUrl]);
    await q(`INSERT INTO system_settings (key, value) VALUES ('n8n_api_key', $1) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`, [api_key]);

    if (webhook_url) {
      if (isUnsafeUrl(webhook_url)) {
        return res.status(400).json({ ok: false, error: "כתובת webhook פנימית — חסומה מטעמי אבטחה" });
      }
      await q(`INSERT INTO system_settings (key, value) VALUES ('n8n_webhook_url', $1) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`, [webhook_url]);
    }

    const { rows: existing } = await q(`SELECT id FROM api_connections WHERE LOWER(name) LIKE '%n8n%' LIMIT 1`);
    if (existing.length === 0) {
      await q(
        `INSERT INTO api_connections (name, base_url, category, auth_type, auth_config, health_endpoint, is_active, last_test_at, last_test_status, last_test_latency_ms)
         VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), 'success', $7)`,
        ["n8n Workflow Engine", cleanUrl, "automation", "api-key", JSON.stringify({ header_name: "X-N8N-API-KEY", key: api_key }), "/api/v1/workflows", latencyMs]
      );
    } else {
      await q(
        `UPDATE api_connections SET base_url = $1, auth_config = $2, is_active = true, last_test_at = NOW(), last_test_status = 'success', last_test_latency_ms = $3, updated_at = NOW() WHERE id = $4`,
        [cleanUrl, JSON.stringify({ header_name: "X-N8N-API-KEY", key: api_key }), latencyMs, existing[0].id]
      );
    }

    let webhookTest: any = undefined;
    if (webhook_url) {
      try {
        const wr = await fetch(webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "erp.connection.test", source: "TechnoKolUzi-ERP", timestamp: new Date().toISOString() }),
          signal: AbortSignal.timeout(8000),
        });
        webhookTest = { ok: wr.status >= 200 && wr.status < 400, status: wr.status };
      } catch (e: any) {
        webhookTest = { ok: false, error: e.message };
      }
    }

    res.json({
      ok: true,
      message: "n8n חובר בהצלחה",
      latencyMs,
      workflows: { total: workflowCount, active: activeCount },
      savedTo: { system_settings: true, api_connections: true },
      webhook: webhookTest || null,
    });
  } catch (err: any) {
    logger.error("[API Hub] n8n connect failed:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/hub/connect-all", async (_req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    const results: any[] = [];

    const erpResult = await (async () => {
      const s = Date.now();
      try {
        const r = await fetch("http://localhost:8080/api/health", { signal: AbortSignal.timeout(5000) });
        const ok = r.status >= 200 && r.status < 400;
        return svcResult("ERP API Server", ok, ok ? "שרת פעיל ותקין" : `HTTP ${r.status}`, Date.now() - s);
      } catch (e: any) {
        return svcResult("ERP API Server", false, e.message, Date.now() - s);
      }
    })();
    results.push(erpResult);

    const dbResult = await (async () => {
      const s = Date.now();
      try {
        await pool.query("SELECT 1");
        return svcResult("PostgreSQL Database", true, "מסד נתונים פעיל", Date.now() - s);
      } catch (e: any) {
        return svcResult("PostgreSQL Database", false, e.message, Date.now() - s);
      }
    })();
    results.push(dbResult);

    const storageResult = (() => {
      const uploadsDir = join(process.cwd(), "uploads");
      const subDirs = ["documents", "kobi", "exports"];
      try {
        const exists = existsSync(uploadsDir);
        let writable = false;
        if (exists) { try { accessSync(uploadsDir, fsConstants.W_OK); writable = true; } catch {} }
        const activeSubs = subDirs.filter(d => existsSync(join(uploadsDir, d)));
        const ok = exists && writable;
        return svcResult("Storage (Uploads)", ok, ok ? `תיקייה פעילה — ${activeSubs.length} תתי-תיקיות` : "תיקייה לא זמינה");
      } catch (e: any) {
        return svcResult("Storage (Uploads)", false, e.message);
      }
    })();
    results.push(storageResult);

    const emailResult = await (async () => {
      const gmailUser = process.env.GMAIL_USER;
      const gmailPass = process.env.GMAIL_APP_PASSWORD;
      if (!gmailUser || !gmailPass) {
        return svcResult("Email (SMTP/Gmail)", false, "חסר GMAIL_USER או GMAIL_APP_PASSWORD", 0, { configured: false });
      }
      const s = Date.now();
      try {
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.default.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });
        await transporter.verify();
        return svcResult("Email (SMTP/Gmail)", true, `SMTP מחובר — ${gmailUser}`, Date.now() - s, { account: gmailUser });
      } catch (e: any) {
        return svcResult("Email (SMTP/Gmail)", false, e.message, Date.now() - s, { account: gmailUser });
      }
    })();
    results.push(emailResult);

    const geminiResult = await (async () => {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) {
        return svcResult("Google AI (Gemini)", false, "GEMINI_API_KEY לא מוגדר", 0, { configured: false });
      }
      const s = Date.now();
      try {
        const gr = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`, { signal: AbortSignal.timeout(8000) });
        return svcResult("Google AI (Gemini)", gr.ok, gr.ok ? "Gemini API פעיל" : `HTTP ${gr.status}`, Date.now() - s);
      } catch (e: any) {
        return svcResult("Google AI (Gemini)", false, e.message, Date.now() - s);
      }
    })();
    results.push(geminiResult);

    let n8nUrl: string | undefined;
    let n8nKey: string | undefined;
    try {
      const { rows: s1 } = await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_url' LIMIT 1`);
      const { rows: s2 } = await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_api_key' LIMIT 1`);
      n8nUrl = s1[0]?.value;
      n8nKey = s2[0]?.value;
    } catch {}
    if (!n8nUrl || !n8nKey) {
      try {
        const { rows } = await pool.query(`SELECT * FROM api_connections WHERE LOWER(name) LIKE '%n8n%' AND is_active = true LIMIT 1`);
        if (rows[0]) {
          n8nUrl = rows[0].base_url;
          try { const cfg = typeof rows[0].auth_config === "string" ? JSON.parse(rows[0].auth_config) : rows[0].auth_config; n8nKey = cfg?.token || cfg?.key || cfg?.api_key; } catch {}
        }
      } catch {}
    }
    const n8nResult = await (async () => {
      if (!n8nUrl || !n8nKey) {
        return svcResult("n8n Workflow Engine", false, "לא מוגדר — חסר URL או API Key", 0, { configured: false });
      }
      const endpoint = `${n8nUrl.replace(/\/+$/, "")}/api/v1/workflows`;
      if (isUnsafeUrl(endpoint)) {
        return svcResult("n8n Workflow Engine", false, "כתובת פנימית — חסומה");
      }
      const s = Date.now();
      try {
        const nr = await fetch(endpoint, { headers: { "X-N8N-API-KEY": n8nKey!, "Accept": "application/json" }, signal: AbortSignal.timeout(8000) });
        if (nr.ok) {
          const data = await nr.json();
          const wfs = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
          return svcResult("n8n Workflow Engine", true, `n8n פעיל — ${wfs.length} workflows`, Date.now() - s);
        }
        return svcResult("n8n Workflow Engine", false, `HTTP ${nr.status}`, Date.now() - s);
      } catch (e: any) {
        return svcResult("n8n Workflow Engine", false, e.message, Date.now() - s);
      }
    })();
    results.push(n8nResult);

    const { rows: allConns } = await pool.query(`SELECT * FROM api_connections WHERE is_active = true ORDER BY id`);
    const connResults: any[] = [];
    const fixes: any[] = [];

    await Promise.allSettled(allConns.map(async (conn: any) => {
      const testUrl = conn.health_endpoint ? `${conn.base_url.replace(/\/$/, "")}${conn.health_endpoint}` : conn.base_url;
      if (isUnsafeUrl(testUrl)) {
        connResults.push(svcResult(conn.name, false, "כתובת פנימית — דילוג", 0, { id: conn.id, skipped: true }));
        return;
      }
      const headers = buildHeaders(conn);
      const result = await probeUrl(testUrl, conn.method || "GET", headers, conn.timeout_ms || 15000);
      await pool.query(
        `UPDATE api_connections SET last_test_at = NOW(), last_test_status = $1, last_test_latency_ms = $2, updated_at = NOW() WHERE id = $3`,
        [result.ok ? "success" : "error", result.latencyMs, conn.id]
      );

      if (result.ok) {
        connResults.push(svcResult(conn.name, true, "חיבור תקין", result.latencyMs, { id: conn.id }));
      } else {
        const fix = await retryConnection(conn, testUrl, headers);
        if (fix.fixed) {
          connResults.push(svcResult(conn.name, true, fix.action!, result.latencyMs, { id: conn.id, fixed: true }));
          fixes.push({ id: conn.id, name: conn.name, action: fix.action });
        } else {
          connResults.push(svcResult(conn.name, false, result.error || `HTTP ${result.status}`, result.latencyMs, { id: conn.id }));
          fixes.push({ id: conn.id, name: conn.name, action: "נכשל — דורש טיפול ידני", severity: "error" });
        }
      }
    }));

    const allResults = [...results, ...connResults];
    const connected = allResults.filter(r => r.status === "ok").length;
    const warnings = allResults.filter(r => r.status === "warning").length;
    const errors = allResults.filter(r => r.status === "error").length;

    res.json({
      ok: errors === 0,
      message: errors === 0
        ? (warnings > 0 ? `${connected} שירותים מחוברים, ${warnings} לא מוגדרים` : `כל ${connected} השירותים מחוברים בהצלחה!`)
        : `${errors} שירותים תקולים, ${connected} מחוברים`,
      durationMs: Date.now() - startTime,
      connectedAt: new Date().toISOString(),
      summary: { total: allResults.length, connected, warnings, errors, fixesApplied: fixes.filter(f => f.severity !== "error").length },
      services: results,
      connections: connResults,
      fixes,
    });
  } catch (err: any) {
    logger.error("[API Hub] connect-all failed:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/hub/test/:service", async (req: Request, res: Response) => {
  try {
    const service = decodeURIComponent(req.params.service).toLowerCase();

    if (service === "erp" || service === "api" || service === "erp-api") {
      const start = Date.now();
      try {
        const r = await fetch("http://localhost:8080/api/health", { signal: AbortSignal.timeout(5000) });
        const ok = r.status >= 200 && r.status < 400;
        return res.json(svcResult("ERP API Server", ok, ok ? "שרת פעיל ותקין" : `HTTP ${r.status}`, Date.now() - start));
      } catch (e: any) {
        return res.json(svcResult("ERP API Server", false, e.message, Date.now() - start));
      }
    }

    if (service === "db" || service === "database" || service === "postgresql" || service === "postgres") {
      const start = Date.now();
      try {
        await pool.query("SELECT 1");
        return res.json(svcResult("PostgreSQL Database", true, "מסד נתונים פעיל", Date.now() - start));
      } catch (e: any) {
        return res.json(svcResult("PostgreSQL Database", false, e.message, Date.now() - start));
      }
    }

    if (service === "storage" || service === "uploads" || service === "files") {
      const uploadsDir = join(process.cwd(), "uploads");
      const subDirs = ["documents", "kobi", "exports"];
      try {
        const exists = existsSync(uploadsDir);
        let writable = false;
        if (exists) { try { accessSync(uploadsDir, fsConstants.W_OK); writable = true; } catch {} }
        const activeSubs = subDirs.filter(d => existsSync(join(uploadsDir, d)));
        const ok = exists && writable;
        return res.json(svcResult("Storage (Uploads)", ok, ok ? `תיקייה פעילה — ${activeSubs.length} תתי-תיקיות` : (exists ? "לא ניתנת לכתיבה" : "תיקייה לא קיימת"), 0, { path: uploadsDir, writable, subfolders: activeSubs }));
      } catch (e: any) {
        return res.json(svcResult("Storage (Uploads)", false, e.message));
      }
    }

    if (service === "email" || service === "smtp" || service === "gmail" || service === "nodemailer") {
      const gmailUser = process.env.GMAIL_USER;
      const gmailPass = process.env.GMAIL_APP_PASSWORD;
      if (!gmailUser || !gmailPass) {
        return res.json(svcResult("Email (SMTP/Gmail)", false, "חסר GMAIL_USER או GMAIL_APP_PASSWORD", 0, { configured: false }));
      }
      const start = Date.now();
      try {
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.default.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });
        await transporter.verify();
        return res.json(svcResult("Email (SMTP/Gmail)", true, `SMTP מחובר — ${gmailUser}`, Date.now() - start, { account: gmailUser }));
      } catch (e: any) {
        return res.json(svcResult("Email (SMTP/Gmail)", false, e.message, Date.now() - start, { account: gmailUser }));
      }
    }

    if (service === "gemini" || service === "google-ai" || service === "google_ai") {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) {
        return res.json(svcResult("Google AI (Gemini)", false, "GEMINI_API_KEY לא מוגדר", 0, { configured: false }));
      }
      const start = Date.now();
      try {
        const gr = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`, { signal: AbortSignal.timeout(8000) });
        const latencyMs = Date.now() - start;
        if (gr.ok) {
          const data = await gr.json();
          const models = Array.isArray(data?.models) ? data.models.map((m: any) => m.name) : [];
          return res.json(svcResult("Google AI (Gemini)", true, `Gemini API פעיל — ${models.length} מודלים`, latencyMs, { modelsAvailable: models.length }));
        }
        return res.json(svcResult("Google AI (Gemini)", false, gr.status === 400 ? "מפתח API שגוי" : `HTTP ${gr.status}`, latencyMs));
      } catch (e: any) {
        return res.json(svcResult("Google AI (Gemini)", false, e.message, Date.now() - start));
      }
    }

    if (service === "n8n") {
      let n8nUrl: string | undefined;
      let n8nKey: string | undefined;
      try {
        const { rows: s1 } = await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_url' LIMIT 1`);
        const { rows: s2 } = await pool.query(`SELECT value FROM system_settings WHERE key = 'n8n_api_key' LIMIT 1`);
        n8nUrl = s1[0]?.value;
        n8nKey = s2[0]?.value;
      } catch {}
      if (!n8nUrl || !n8nKey) {
        try {
          const { rows } = await pool.query(`SELECT * FROM api_connections WHERE LOWER(name) LIKE '%n8n%' AND is_active = true LIMIT 1`);
          if (rows[0]) {
            n8nUrl = rows[0].base_url;
            try {
              const cfg = typeof rows[0].auth_config === "string" ? JSON.parse(rows[0].auth_config) : rows[0].auth_config;
              n8nKey = cfg?.token || cfg?.key || cfg?.api_key;
            } catch {}
          }
        } catch {}
      }
      if (!n8nUrl || !n8nKey) {
        return res.json(svcResult("n8n Workflow Engine", false, "לא מוגדר — חסר URL או API Key", 0, { configured: false }));
      }
      const endpoint = `${n8nUrl.replace(/\/+$/, "")}/api/v1/workflows`;
      if (isUnsafeUrl(endpoint)) {
        return res.json(svcResult("n8n Workflow Engine", false, "כתובת פנימית — חסומה"));
      }
      const start = Date.now();
      try {
        const nr = await fetch(endpoint, { headers: { "X-N8N-API-KEY": n8nKey, "Accept": "application/json" }, signal: AbortSignal.timeout(8000) });
        const latencyMs = Date.now() - start;
        if (nr.ok) {
          const data = await nr.json();
          const wfs = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
          const active = wfs.filter((w: any) => w.active).length;
          return res.json(svcResult("n8n Workflow Engine", true, `n8n פעיל — ${wfs.length} workflows (${active} פעילים)`, latencyMs, { workflows: wfs.length, activeWorkflows: active }));
        }
        return res.json(svcResult("n8n Workflow Engine", false, `HTTP ${nr.status}`, latencyMs));
      } catch (e: any) {
        return res.json(svcResult("n8n Workflow Engine", false, e.message, Date.now() - start));
      }
    }

    const { rows } = await pool.query(
      `SELECT * FROM api_connections WHERE LOWER(name) LIKE $1 OR id::text = $1 OR LOWER(category) = $1 LIMIT 1`,
      [`%${service}%`]
    );
    if (!rows[0]) {
      return res.status(404).json(svcResult(req.params.service, false, `שירות "${req.params.service}" לא נמצא`));
    }

    const conn = rows[0];
    const testUrl = conn.health_endpoint
      ? `${conn.base_url.replace(/\/$/, "")}${conn.health_endpoint}`
      : conn.base_url;

    if (isUnsafeUrl(testUrl)) {
      return res.json(svcResult(conn.name, false, "כתובת פנימית — דילוג", 0, { id: conn.id, skipped: true }));
    }

    const headers = buildHeaders(conn);
    const result = await probeUrl(testUrl, conn.method || "GET", headers, conn.timeout_ms || 15000);

    await pool.query(
      `UPDATE api_connections SET last_test_at = NOW(), last_test_status = $1, last_test_latency_ms = $2, updated_at = NOW() WHERE id = $3`,
      [result.ok ? "success" : "error", result.latencyMs, conn.id]
    );
    await pool.query(
      `INSERT INTO api_connection_logs (connection_id, action, status, latency_ms, response_code, details) VALUES ($1, 'hub-test', $2, $3, $4, $5)`,
      [conn.id, result.ok ? "success" : "error", result.latencyMs, result.status || null, result.ok ? "תקין" : (result.error || `HTTP ${result.status}`)]
    );

    let finalOk = result.ok;
    let msg = result.ok ? "חיבור תקין" : (result.error || `HTTP ${result.status}`);
    const extra: any = { id: conn.id, category: conn.category, url: conn.base_url };

    if (!result.ok && conn.is_active) {
      const fix = await retryConnection(conn, testUrl, headers);
      if (fix.fixed) {
        finalOk = true;
        msg = fix.action!;
        extra.fixed = true;
      }
    }

    res.json(svcResult(conn.name, finalOk, msg, result.latencyMs, extra));
  } catch (err: any) {
    logger.error("[API Hub] test service failed:", err.message);
    res.status(500).json(svcResult("unknown", false, err.message));
  }
});

export default router;
