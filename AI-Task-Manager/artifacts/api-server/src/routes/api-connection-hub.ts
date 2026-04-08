import { Router, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

const router = Router();

const q = async (sql: string, params: any[] = []) => pool.query(sql, params);

const redactSecrets = (row: any) => {
  const copy = { ...row };
  if (copy.auth_config) copy.auth_config = "***";
  return copy;
};

router.get("/api-connections", async (_req: Request, res: Response) => {
  try {
    const { rows } = await q(`SELECT * FROM api_connections ORDER BY created_at DESC`);
    res.json(rows.map(redactSecrets));
  } catch (err: any) {
    logger.error("[API Hub] list failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/api-connections/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rows } = await q(`SELECT * FROM api_connections WHERE id = $1`, [id]);
    if (!rows.length) return res.status(404).json({ error: "חיבור לא נמצא" });
    res.json(redactSecrets(rows[0]));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api-connections", async (req: Request, res: Response) => {
  try {
    const {
      name, description, base_url, auth_type, auth_config,
      headers, category, method, health_endpoint, is_active,
      timeout_ms, retry_count, rate_limit_rpm,
    } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "שם החיבור הוא שדה חובה" });
    if (!base_url?.trim()) return res.status(400).json({ error: "כתובת URL היא שדה חובה" });

    const { rows } = await pool.query(
      `INSERT INTO api_connections
        (name, description, base_url, auth_type, auth_config, headers, category, method, health_endpoint, is_active, timeout_ms, retry_count, rate_limit_rpm)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        name, description || null, base_url, auth_type || "none",
        auth_config ? JSON.stringify(auth_config) : null,
        headers ? JSON.stringify(headers) : null,
        category || "general", method || "GET", health_endpoint || null,
        is_active !== false, timeout_ms || 30000, retry_count || 3, rate_limit_rpm || 60,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    logger.error("[API Hub] create failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put("/api-connections/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name, description, base_url, auth_type, auth_config,
      headers, category, method, health_endpoint, is_active,
      timeout_ms, retry_count, rate_limit_rpm,
    } = req.body;

    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    const maybeSet = (col: string, val: any) => {
      if (val !== undefined) { sets.push(`${col} = $${idx++}`); vals.push(val); }
    };
    maybeSet("name", name);
    maybeSet("description", description);
    maybeSet("base_url", base_url);
    maybeSet("auth_type", auth_type);
    if (auth_config !== undefined) { sets.push(`auth_config = $${idx++}`); vals.push(auth_config ? JSON.stringify(auth_config) : null); }
    if (headers !== undefined) { sets.push(`headers = $${idx++}`); vals.push(headers ? JSON.stringify(headers) : null); }
    maybeSet("category", category);
    maybeSet("method", method);
    maybeSet("health_endpoint", health_endpoint);
    if (is_active !== undefined) { sets.push(`is_active = $${idx++}`); vals.push(is_active); }
    maybeSet("timeout_ms", timeout_ms);
    maybeSet("retry_count", retry_count);
    maybeSet("rate_limit_rpm", rate_limit_rpm);

    if (sets.length === 0) return res.status(400).json({ error: "לא סופקו שדות לעדכון" });
    sets.push("updated_at = NOW()");
    vals.push(id);

    const { rows } = await pool.query(
      `UPDATE api_connections SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      vals,
    );
    if (!rows.length) return res.status(404).json({ error: "חיבור לא נמצא" });
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api-connections/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await q(`DELETE FROM api_connections WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api-connections/:id/test", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rows } = await q(`SELECT * FROM api_connections WHERE id = $1`, [id]);
    if (!rows.length) return res.status(404).json({ error: "חיבור לא נמצא" });

    const conn = rows[0];
    const testUrl = conn.health_endpoint
      ? `${conn.base_url.replace(/\/$/, "")}${conn.health_endpoint}`
      : conn.base_url;

    if (isUnsafeUrl(testUrl)) {
      return res.status(400).json({ ok: false, error: "כתובת URL לא תקינה או פנימית" });
    }

    const startTime = Date.now();
    let testHeaders: Record<string, string> = { "User-Agent": "TechnoKolUzi-ERP/1.0" };

    if (conn.headers) {
      try {
        const parsed = typeof conn.headers === "string" ? JSON.parse(conn.headers) : conn.headers;
        testHeaders = { ...testHeaders, ...parsed };
      } catch {}
    }

    if (conn.auth_type === "bearer" && conn.auth_config) {
      try {
        const cfg = typeof conn.auth_config === "string" ? JSON.parse(conn.auth_config) : conn.auth_config;
        if (cfg.token) testHeaders["Authorization"] = `Bearer ${cfg.token}`;
      } catch {}
    } else if (conn.auth_type === "api-key" && conn.auth_config) {
      try {
        const cfg = typeof conn.auth_config === "string" ? JSON.parse(conn.auth_config) : conn.auth_config;
        if (cfg.header_name && cfg.key) testHeaders[cfg.header_name] = cfg.key;
      } catch {}
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), conn.timeout_ms || 30000);

    try {
      const fetchMethod = ["POST", "HEAD"].includes(conn.method) ? conn.method : "GET";
      const response = await fetch(testUrl, {
        method: fetchMethod,
        headers: testHeaders,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const latencyMs = Date.now() - startTime;
      const status = response.status;
      const ok = status >= 200 && status < 400;

      await q(
        `UPDATE api_connections SET last_test_at = NOW(), last_test_status = $1, last_test_latency_ms = $2, updated_at = NOW() WHERE id = $3`,
        [ok ? "success" : "error", latencyMs, id]
      );

      await q(
        `INSERT INTO api_connection_logs (connection_id, action, status, latency_ms, response_code, details)
         VALUES ($1, 'test', $2, $3, $4, $5)`,
        [id, ok ? "success" : "error", latencyMs, status, ok ? "חיבור תקין" : `HTTP ${status}`]
      );

      res.json({ ok, status, latencyMs, url: testUrl });
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      const latencyMs = Date.now() - startTime;
      const msg = fetchErr.name === "AbortError" ? "Timeout" : fetchErr.message;

      await q(
        `UPDATE api_connections SET last_test_at = NOW(), last_test_status = 'error', last_test_latency_ms = $1, updated_at = NOW() WHERE id = $2`,
        [latencyMs, id]
      );
      await q(
        `INSERT INTO api_connection_logs (connection_id, action, status, latency_ms, details)
         VALUES ($1, 'test', 'error', $2, $3)`,
        [id, latencyMs, msg]
      );

      res.json({ ok: false, status: 0, latencyMs, url: testUrl, error: msg });
    }
  } catch (err: any) {
    logger.error("[API Hub] test failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/api-connections/:id/logs", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const { rows } = await q(
      `SELECT * FROM api_connection_logs WHERE connection_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [id, limit]
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const SYSTEM_PROBES = [
  { name: "ERP API Server", category: "erp", url: "http://localhost:8080/api/health", method: "GET" },
  { name: "PostgreSQL Database", category: "erp", check: "db" },
];

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

async function testSingleConnection(conn: any): Promise<any> {
  const testUrl = conn.health_endpoint
    ? `${conn.base_url.replace(/\/$/, "")}${conn.health_endpoint}`
    : conn.base_url;

  if (isUnsafeUrl(testUrl)) {
    return { id: conn.id, name: conn.name, ok: false, error: "כתובת פנימית או לא תקינה", latencyMs: 0, skipped: true };
  }

  const startTime = Date.now();
  let testHeaders: Record<string, string> = { "User-Agent": "TechnoKolUzi-ERP/1.0" };
  if (conn.headers) {
    try {
      const h = typeof conn.headers === "string" ? JSON.parse(conn.headers) : conn.headers;
      testHeaders = { ...testHeaders, ...h };
    } catch {}
  }
  if (conn.auth_type === "bearer" && conn.auth_config) {
    try {
      const cfg = typeof conn.auth_config === "string" ? JSON.parse(conn.auth_config) : conn.auth_config;
      if (cfg.token) testHeaders["Authorization"] = `Bearer ${cfg.token}`;
    } catch {}
  } else if (conn.auth_type === "api-key" && conn.auth_config) {
    try {
      const cfg = typeof conn.auth_config === "string" ? JSON.parse(conn.auth_config) : conn.auth_config;
      if (cfg.header_name && cfg.key) testHeaders[cfg.header_name] = cfg.key;
    } catch {}
  }

  try {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), conn.timeout_ms || 15000);
    const fetchMethod = ["POST", "HEAD"].includes(conn.method) ? conn.method : "GET";
    const response = await fetch(testUrl, { method: fetchMethod, headers: testHeaders, signal: controller.signal });
    clearTimeout(to);
    const latencyMs = Date.now() - startTime;
    const ok = response.status >= 200 && response.status < 400;

    await q(
      `UPDATE api_connections SET last_test_at = NOW(), last_test_status = $1, last_test_latency_ms = $2, updated_at = NOW() WHERE id = $3`,
      [ok ? "success" : "error", latencyMs, conn.id]
    );
    await q(
      `INSERT INTO api_connection_logs (connection_id, action, status, latency_ms, response_code, details) VALUES ($1, 'scan-all', $2, $3, $4, $5)`,
      [conn.id, ok ? "success" : "error", latencyMs, response.status, ok ? "סריקה כללית — תקין" : `סריקה כללית — HTTP ${response.status}`]
    );

    return { id: conn.id, name: conn.name, ok, status: response.status, latencyMs, url: testUrl };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const msg = err.name === "AbortError" ? "Timeout" : err.message;
    await q(
      `UPDATE api_connections SET last_test_at = NOW(), last_test_status = 'error', last_test_latency_ms = $1, updated_at = NOW() WHERE id = $2`,
      [latencyMs, conn.id]
    );
    await q(
      `INSERT INTO api_connection_logs (connection_id, action, status, latency_ms, details) VALUES ($1, 'scan-all', 'error', $2, $3)`,
      [conn.id, latencyMs, `סריקה כללית — ${msg}`]
    );
    return { id: conn.id, name: conn.name, ok: false, latencyMs, error: msg, url: testUrl };
  }
}

router.post("/api-connections/scan-all", async (req: Request, res: Response) => {
  try {
    const autoFix = req.body?.auto_fix !== false;
    const startTime = Date.now();
    const results: any[] = [];
    const fixes: any[] = [];

    const systemResults: any[] = [];
    for (const probe of SYSTEM_PROBES) {
      if (probe.check === "db") {
        const dbStart = Date.now();
        try {
          await pool.query("SELECT 1");
          systemResults.push({ name: probe.name, category: probe.category, ok: true, latencyMs: Date.now() - dbStart });
        } catch (e: any) {
          systemResults.push({ name: probe.name, category: probe.category, ok: false, error: e.message, latencyMs: Date.now() - dbStart });
        }
        continue;
      }
      const probeStart = Date.now();
      try {
        const r = await fetch(probe.url!, { method: probe.method || "GET", signal: AbortSignal.timeout(5000) });
        systemResults.push({ name: probe.name, category: probe.category, ok: r.status >= 200 && r.status < 400, status: r.status, latencyMs: Date.now() - probeStart });
      } catch (e: any) {
        systemResults.push({ name: probe.name, category: probe.category, ok: false, error: e.message, latencyMs: Date.now() - probeStart });
      }
    }

    const n8nResult: any = { name: "n8n Workflow Engine", category: "n8n", ok: false, checked: false };
    try {
      let n8nUrl: string | undefined;
      let n8nKey: string | undefined;
      try {
        const { rows: settingsRows } = await q(`SELECT value FROM system_settings WHERE key = 'n8n_url' LIMIT 1`);
        const { rows: keyRows } = await q(`SELECT value FROM system_settings WHERE key = 'n8n_api_key' LIMIT 1`);
        n8nUrl = settingsRows[0]?.value;
        n8nKey = keyRows[0]?.value;
      } catch {}

      if (!n8nUrl || !n8nKey) {
        const { rows: connRows } = await q(`SELECT * FROM api_connections WHERE LOWER(name) LIKE '%n8n%' AND is_active = true LIMIT 1`);
        if (connRows[0]) {
          n8nUrl = connRows[0].base_url;
          if (connRows[0].auth_config) {
            try {
              const cfg = typeof connRows[0].auth_config === "string" ? JSON.parse(connRows[0].auth_config) : connRows[0].auth_config;
              n8nKey = cfg.token || cfg.key || cfg.api_key;
            } catch {}
          }
        }
      }
      if (n8nUrl && n8nKey) {
        const n8nEndpoint = `${n8nUrl.replace(/\/+$/, "")}/api/v1/workflows`;
        if (isUnsafeUrl(n8nEndpoint)) {
          n8nResult.error = "כתובת n8n אינה מותרת (כתובת פנימית)";
        } else {
          n8nResult.checked = true;
        }
        const nStart = Date.now();
        if (n8nResult.checked) try {
          const nr = await fetch(n8nEndpoint, {
            headers: { "X-N8N-API-KEY": n8nKey, "Accept": "application/json" },
            signal: AbortSignal.timeout(8000),
          });
          n8nResult.latencyMs = Date.now() - nStart;
          if (nr.ok) {
            const data = await nr.json();
            const wfs = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
            n8nResult.ok = true;
            n8nResult.workflowCount = wfs.length;
            n8nResult.activeWorkflows = wfs.filter((w: any) => w.active).length;
          } else {
            n8nResult.error = `HTTP ${nr.status}`;
          }
        } catch (e: any) {
          n8nResult.latencyMs = Date.now() - nStart;
          n8nResult.error = e.name === "AbortError" || e.name === "TimeoutError" ? "Timeout" : e.message;
        }
      } else {
        n8nResult.error = "n8n לא מוגדר — חסר URL או מפתח API בהגדרות המערכת";
      }
    } catch {
      n8nResult.error = "לא ניתן לבדוק הגדרות n8n";
    }

    const { rows: allConnections } = await q(`SELECT * FROM api_connections ORDER BY id`);

    const connectionResults = await Promise.allSettled(
      allConnections.map((c: any) => testSingleConnection(c))
    );

    for (const r of connectionResults) {
      if (r.status === "fulfilled") results.push(r.value);
      else results.push({ ok: false, error: r.reason?.message || "שגיאה לא צפויה" });
    }

    if (autoFix) {
      for (const r of results) {
        if (!r.id) continue;
        const conn = allConnections.find((c: any) => c.id === r.id);
        if (!conn) continue;

        if (r.ok && !conn.is_active) {
          await q(`UPDATE api_connections SET is_active = true, updated_at = NOW() WHERE id = $1`, [conn.id]);
          fixes.push({ id: conn.id, name: conn.name, action: "הופעל מחדש — החיבור תקין" });
        }

        if (!r.ok && conn.is_active && !r.skipped) {
          const retryOk = await retryWithFixes(conn);
          if (retryOk) {
            r.ok = true;
            r.error = undefined;
            r.fixed = true;
            fixes.push({ id: conn.id, name: conn.name, action: "תוקן — ניסיון חוזר הצליח" });
          } else {
            fixes.push({ id: conn.id, name: conn.name, action: "נכשל — סומן לטיפול ידני", severity: "error" });
          }
        }
      }
    }

    const totalMs = Date.now() - startTime;
    const healthy = results.filter((r: any) => r.ok).length;
    const broken = results.filter((r: any) => !r.ok && !r.skipped).length;
    const skipped = results.filter((r: any) => r.skipped).length;

    res.json({
      summary: {
        total: allConnections.length,
        healthy,
        broken,
        skipped,
        fixesApplied: fixes.length,
        durationMs: totalMs,
        scannedAt: new Date().toISOString(),
      },
      system: systemResults,
      n8n: n8nResult,
      connections: results,
      fixes,
    });
  } catch (err: any) {
    logger.error("[API Hub] scan-all failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

async function retryWithFixes(conn: any): Promise<boolean> {
  const testUrl = conn.health_endpoint
    ? `${conn.base_url.replace(/\/$/, "")}${conn.health_endpoint}`
    : conn.base_url;

  let testHeaders: Record<string, string> = { "User-Agent": "TechnoKolUzi-ERP/1.0" };
  if (conn.headers) {
    try {
      const h = typeof conn.headers === "string" ? JSON.parse(conn.headers) : conn.headers;
      testHeaders = { ...testHeaders, ...h };
    } catch {}
  }
  if (conn.auth_type === "bearer" && conn.auth_config) {
    try {
      const cfg = typeof conn.auth_config === "string" ? JSON.parse(conn.auth_config) : conn.auth_config;
      if (cfg.token) testHeaders["Authorization"] = `Bearer ${cfg.token}`;
    } catch {}
  } else if (conn.auth_type === "api-key" && conn.auth_config) {
    try {
      const cfg = typeof conn.auth_config === "string" ? JSON.parse(conn.auth_config) : conn.auth_config;
      if (cfg.header_name && cfg.key) testHeaders[cfg.header_name] = cfg.key;
    } catch {}
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), (conn.timeout_ms || 15000) + attempt * 5000);
      const r = await fetch(testUrl, {
        method: ["POST", "HEAD"].includes(conn.method) ? conn.method : "GET",
        headers: testHeaders,
        signal: controller.signal,
      });
      clearTimeout(to);
      if (r.status >= 200 && r.status < 400) {
        await q(
          `UPDATE api_connections SET last_test_at = NOW(), last_test_status = 'success', last_test_latency_ms = 0, updated_at = NOW() WHERE id = $1`,
          [conn.id]
        );
        await q(
          `INSERT INTO api_connection_logs (connection_id, action, status, details) VALUES ($1, 'auto-fix', 'success', $2)`,
          [conn.id, `תוקן אוטומטית בניסיון ${attempt}`]
        );
        return true;
      }
    } catch {}
  }

  let urlVariants = [testUrl];
  if (testUrl.startsWith("http://")) urlVariants.push(testUrl.replace("http://", "https://"));
  else if (testUrl.startsWith("https://")) urlVariants.push(testUrl.replace("https://", "http://"));

  for (const variant of urlVariants.slice(1)) {
    try {
      if (isUnsafeUrl(variant)) continue;
      const r = await fetch(variant, { method: "GET", headers: testHeaders, signal: AbortSignal.timeout(10000) });
      if (r.status >= 200 && r.status < 400) {
        await q(`UPDATE api_connections SET base_url = $1, last_test_at = NOW(), last_test_status = 'success', updated_at = NOW() WHERE id = $2`, [
          conn.health_endpoint ? variant.replace(conn.health_endpoint, "") : variant, conn.id,
        ]);
        await q(
          `INSERT INTO api_connection_logs (connection_id, action, status, details) VALUES ($1, 'auto-fix', 'success', $2)`,
          [conn.id, `תוקן אוטומטית — שינוי פרוטוקול ל-${parsed.protocol}`]
        );
        return true;
      }
    } catch {}
  }

  return false;
}

router.get("/api-connections-stats", async (_req: Request, res: Response) => {
  try {
    const { rows } = await q(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE is_active) AS active,
        COUNT(*) FILTER (WHERE NOT is_active) AS inactive,
        COUNT(*) FILTER (WHERE last_test_status = 'success') AS healthy,
        COUNT(*) FILTER (WHERE last_test_status = 'error') AS unhealthy,
        COUNT(*) FILTER (WHERE last_test_status IS NULL) AS untested,
        COUNT(DISTINCT category) AS categories
      FROM api_connections
    `);
    res.json(rows[0] || {});
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
