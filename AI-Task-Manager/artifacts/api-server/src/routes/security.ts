import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { invalidateIpFilterCache } from "../lib/ip-filter";
import { invalidateDynamicRateLimitCache } from "../lib/dynamic-rate-limit";
import { encrypt } from "../lib/webhook-verify";
import rateLimit from "express-rate-limit";
import crypto from "crypto";

const router = Router();

function requireAdmin(req: Request, res: Response, next: () => void) {
  if (!req.permissions?.isSuperAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

// ─── IP Rules ──────────────────────────────────────────────────────────────

router.get("/security/ip-rules", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM security_ip_rules ORDER BY created_at DESC`
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/security/ip-rules", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { ip_address, rule_type, description } = req.body;
    if (!ip_address || !rule_type) {
      res.status(400).json({ error: "ip_address and rule_type are required" });
      return;
    }
    if (!["whitelist", "blacklist"].includes(rule_type)) {
      res.status(400).json({ error: "rule_type must be whitelist or blacklist" });
      return;
    }
    const { rows } = await pool.query(
      `INSERT INTO security_ip_rules (ip_address, rule_type, description, is_active)
       VALUES ($1, $2, $3, true) RETURNING *`,
      [ip_address, rule_type, description || null]
    );
    invalidateIpFilterCache();
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.put("/security/ip-rules/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { ip_address, rule_type, description, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE security_ip_rules SET ip_address = COALESCE($1, ip_address),
       rule_type = COALESCE($2, rule_type), description = COALESCE($3, description),
       is_active = COALESCE($4, is_active), updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [ip_address, rule_type, description, is_active, req.params.id]
    );
    if (rows.length === 0) { res.status(404).json({ error: "Rule not found" }); return; }
    invalidateIpFilterCache();
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.delete("/security/ip-rules/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM security_ip_rules WHERE id = $1`, [req.params.id]);
    invalidateIpFilterCache();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/security/ip-rules/import", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rules } = req.body;
    if (!Array.isArray(rules)) { res.status(400).json({ error: "rules must be an array" }); return; }
    let inserted = 0;
    for (const rule of rules) {
      if (!rule.ip_address || !rule.rule_type) continue;
      await pool.query(
        `INSERT INTO security_ip_rules (ip_address, rule_type, description, is_active)
         VALUES ($1, $2, $3, true) ON CONFLICT (ip_address, rule_type) DO NOTHING`,
        [rule.ip_address, rule.rule_type, rule.description || null]
      );
      inserted++;
    }
    invalidateIpFilterCache();
    res.json({ inserted });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Geo Rules ─────────────────────────────────────────────────────────────

router.get("/security/geo-rules", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM security_geo_rules ORDER BY country_name`);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/security/geo-rules", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { country_code, country_name, rule_type } = req.body;
    if (!country_code || !rule_type) { res.status(400).json({ error: "country_code and rule_type required" }); return; }
    if (!["allow", "deny"].includes(rule_type)) { res.status(400).json({ error: "rule_type must be allow or deny" }); return; }
    const { rows } = await pool.query(
      `INSERT INTO security_geo_rules (country_code, country_name, rule_type, is_active)
       VALUES ($1, $2, $3, true) ON CONFLICT (country_code) DO UPDATE
       SET rule_type = $3, country_name = COALESCE($2, security_geo_rules.country_name), is_active = true, updated_at = NOW()
       RETURNING *`,
      [country_code.toUpperCase(), country_name || country_code, rule_type]
    );
    invalidateIpFilterCache();
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.delete("/security/geo-rules/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM security_geo_rules WHERE id = $1`, [req.params.id]);
    invalidateIpFilterCache();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Blocked Attempts Log ──────────────────────────────────────────────────

router.get("/security/blocked-attempts", requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string || "100", 10), 500);
    const { rows } = await pool.query(
      `SELECT * FROM security_blocked_attempts ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Vulnerabilities ───────────────────────────────────────────────────────

router.get("/security/vulnerabilities", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM security_vulnerabilities ORDER BY created_at DESC`);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/security/vulnerabilities", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, description, severity, category, affected_component, cve_id, assigned_to, scanner_source } = req.body;
    if (!title || !severity) { res.status(400).json({ error: "title and severity required" }); return; }
    if (!["critical", "high", "medium", "low", "info"].includes(severity)) {
      res.status(400).json({ error: "Invalid severity" }); return;
    }
    const { rows } = await pool.query(
      `INSERT INTO security_vulnerabilities (title, description, severity, category, affected_component, cve_id, assigned_to, scanner_source, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open') RETURNING *`,
      [title, description || null, severity, category || "general", affected_component || null, cve_id || null, assigned_to || null, scanner_source || "manual"]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.put("/security/vulnerabilities/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, description, severity, status, assigned_to, remediation_notes, resolved_at } = req.body;
    const { rows } = await pool.query(
      `UPDATE security_vulnerabilities SET
       title = COALESCE($1, title), description = COALESCE($2, description),
       severity = COALESCE($3, severity), status = COALESCE($4, status),
       assigned_to = COALESCE($5, assigned_to), remediation_notes = COALESCE($6, remediation_notes),
       resolved_at = COALESCE($7, resolved_at), updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [title, description, severity, status, assigned_to, remediation_notes, resolved_at, req.params.id]
    );
    if (rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.delete("/security/vulnerabilities/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM security_vulnerabilities WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Rate Limit Config ─────────────────────────────────────────────────────

router.get("/security/rate-limit-config", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM security_rate_limit_config ORDER BY endpoint_pattern`);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/security/rate-limit-config", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { endpoint_pattern, max_requests, window_seconds, scope, description } = req.body;
    if (!endpoint_pattern || !max_requests || !window_seconds) {
      res.status(400).json({ error: "endpoint_pattern, max_requests, window_seconds required" }); return;
    }
    const { rows } = await pool.query(
      `INSERT INTO security_rate_limit_config (endpoint_pattern, max_requests, window_seconds, scope, description, is_active)
       VALUES ($1, $2, $3, $4, $5, true) ON CONFLICT (endpoint_pattern) DO UPDATE
       SET max_requests = $2, window_seconds = $3, scope = $4, description = $5, updated_at = NOW()
       RETURNING *`,
      [endpoint_pattern, max_requests, window_seconds, scope || "per_user", description || null]
    );
    invalidateDynamicRateLimitCache();
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.delete("/security/rate-limit-config/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM security_rate_limit_config WHERE id = $1`, [req.params.id]);
    invalidateDynamicRateLimitCache();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── CORS Policy ───────────────────────────────────────────────────────────

router.get("/security/cors-policy", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM security_cors_policy ORDER BY id`);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/security/cors-policy", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { origin, description } = req.body;
    if (!origin) { res.status(400).json({ error: "origin required" }); return; }
    const { rows } = await pool.query(
      `INSERT INTO security_cors_policy (origin, description, is_active)
       VALUES ($1, $2, true) ON CONFLICT (origin) DO UPDATE SET is_active = true, updated_at = NOW()
       RETURNING *`,
      [origin, description || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.delete("/security/cors-policy/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM security_cors_policy WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Webhook Signing ───────────────────────────────────────────────────────

router.get("/security/webhook-secrets", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, endpoint_path, is_active, created_at, last_used_at FROM security_webhook_secrets ORDER BY created_at DESC`
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/security/webhook-secrets", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, endpoint_path } = req.body;
    if (!name || !endpoint_path) { res.status(400).json({ error: "name and endpoint_path required" }); return; }
    const secret = `whsec_${crypto.randomBytes(32).toString("hex")}`;
    // Store the secret encrypted (using AES-256-GCM or plain if APP_SECRET_KEY not set)
    // so the server can verify HMAC signatures on incoming webhook requests.
    const secretEncrypted = encrypt(secret);
    const { rows } = await pool.query(
      `INSERT INTO security_webhook_secrets (name, endpoint_path, secret_hash, is_active)
       VALUES ($1, $2, $3, true) RETURNING id, name, endpoint_path, is_active, created_at`,
      [name, endpoint_path, secretEncrypted]
    );
    res.status(201).json({ ...rows[0], secret, message: "Store the secret — it will not be shown again" });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.delete("/security/webhook-secrets/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM security_webhook_secrets WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Security Dashboard Stats ──────────────────────────────────────────────

router.get("/security/dashboard-stats", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [
      ipRules,
      geoRules,
      blockedLast24h,
      vulnerabilities,
      apiKeys,
      rateLimitConfig,
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*) as total, SUM(CASE WHEN rule_type='blacklist' THEN 1 ELSE 0 END) as blacklisted, SUM(CASE WHEN rule_type='whitelist' THEN 1 ELSE 0 END) as whitelisted FROM security_ip_rules WHERE is_active = true`),
      pool.query(`SELECT COUNT(*) as total, SUM(CASE WHEN rule_type='deny' THEN 1 ELSE 0 END) as denied FROM security_geo_rules WHERE is_active = true`),
      pool.query(`SELECT COUNT(*) as total FROM security_blocked_attempts WHERE created_at > NOW() - INTERVAL '24 hours'`),
      pool.query(`SELECT severity, status, COUNT(*) as count FROM security_vulnerabilities GROUP BY severity, status`),
      pool.query(`SELECT COUNT(*) as total, SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active FROM api_keys`),
      pool.query(`SELECT COUNT(*) as total FROM security_rate_limit_config WHERE is_active = true`),
    ]);

    const vulnSummary = { critical: 0, high: 0, medium: 0, low: 0, info: 0, open: 0, resolved: 0 };
    for (const row of vulnerabilities.rows as any[]) {
      vulnSummary[row.severity as keyof typeof vulnSummary] = (vulnSummary[row.severity as keyof typeof vulnSummary] || 0) + parseInt(row.count);
      if (row.status === "open" || row.status === "in_progress") vulnSummary.open += parseInt(row.count);
      if (row.status === "resolved") vulnSummary.resolved += parseInt(row.count);
    }

    const totalVulns = vulnSummary.critical + vulnSummary.high + vulnSummary.medium + vulnSummary.low + vulnSummary.info;
    let securityScore = 100;
    securityScore -= vulnSummary.critical * 20;
    securityScore -= vulnSummary.high * 10;
    securityScore -= vulnSummary.medium * 5;
    securityScore -= vulnSummary.low * 2;
    securityScore = Math.max(0, Math.min(100, securityScore));

    res.json({
      securityScore,
      ipRules: {
        total: parseInt(ipRules.rows[0]?.total || "0"),
        blacklisted: parseInt(ipRules.rows[0]?.blacklisted || "0"),
        whitelisted: parseInt(ipRules.rows[0]?.whitelisted || "0"),
      },
      geoRules: {
        total: parseInt(geoRules.rows[0]?.total || "0"),
        denied: parseInt(geoRules.rows[0]?.denied || "0"),
      },
      blockedLast24h: parseInt(blockedLast24h.rows[0]?.total || "0"),
      vulnerabilities: vulnSummary,
      totalVulnerabilities: totalVulns,
      apiKeys: {
        total: parseInt(apiKeys.rows[0]?.total || "0"),
        active: parseInt(apiKeys.rows[0]?.active || "0"),
      },
      rateLimitRules: parseInt(rateLimitConfig.rows[0]?.total || "0"),
    });
  } catch (err) {
    logger.error("[security] dashboard-stats error:", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
