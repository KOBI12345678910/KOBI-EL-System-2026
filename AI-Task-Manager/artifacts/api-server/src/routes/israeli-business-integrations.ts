import { Router, Request, Response as ExpressResponse, NextFunction } from "express";
import { pool } from "@workspace/db";
import dns from "node:dns/promises";
import net from "node:net";
import crypto from "node:crypto";
import { VAT_RATE } from "../constants";

const DEFAULT_DEV_KEY = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";
if (!process.env.CREDENTIAL_ENCRYPTION_KEY && process.env.NODE_ENV === "production") {
  throw new Error("[israeli-biz] CREDENTIAL_ENCRYPTION_KEY must be set in production");
}
const CREDENTIAL_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY || DEFAULT_DEV_KEY;
if (!process.env.CREDENTIAL_ENCRYPTION_KEY) {
  console.warn("[israeli-biz] WARNING: CREDENTIAL_ENCRYPTION_KEY not set, using default dev key.");
}
const KEY_BUF = Buffer.from(CREDENTIAL_KEY.padEnd(64, "0").slice(0, 64), "hex");

function encryptCredential(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY_BUF, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString("hex") + ":" + tag.toString("hex") + ":" + encrypted.toString("hex");
}

function decryptCredential(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) return ciphertext;
  const iv = Buffer.from(parts[0], "hex");
  const tag = Buffer.from(parts[1], "hex");
  const encrypted = Buffer.from(parts[2], "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY_BUF, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

const router = Router();

const BLOCKED_HOSTS = new Set([
  "localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]",
  "metadata.google.internal", "169.254.169.254",
]);

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  if (a === 127 || a === 10 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

function isPrivateIp(rawAddr: string): boolean {
  const addr = rawAddr.replace(/^\[|\]$/g, "").replace(/%.*$/, "").toLowerCase();
  if (addr === "::1" || addr === "::" || addr === "0.0.0.0" || addr === "localhost") return true;
  const mappedMatch = addr.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (mappedMatch) return isPrivateIpv4(mappedMatch[1]);
  if (net.isIPv4(addr)) return isPrivateIpv4(addr);
  if (/^f[cd]/i.test(addr)) return true;
  if (/^fe80/i.test(addr)) return true;
  return false;
}

async function validateExternalUrl(urlStr: string): Promise<{ valid: boolean; reason?: string }> {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { valid: false, reason: "רק פרוטוקולי http/https מותרים" };
    }
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (BLOCKED_HOSTS.has(hostname)) {
      return { valid: false, reason: "כתובת יעד חסומה" };
    }
    if (isPrivateIp(hostname)) {
      return { valid: false, reason: "אסור לגשת לכתובות רשת פנימיות" };
    }
    if (!net.isIP(hostname)) {
      try {
        const addresses4 = await dns.resolve4(hostname).catch(() => [] as string[]);
        const addresses6 = await dns.resolve6(hostname).catch(() => [] as string[]);
        const allAddresses = [...addresses4, ...addresses6];
        if (allAddresses.length === 0) return { valid: false, reason: "לא ניתן לפתור שם מארח" };
        for (const addr of allAddresses) {
          if (isPrivateIp(addr)) return { valid: false, reason: "שם מארח מצביע לכתובת רשת פנימית" };
        }
      } catch {
        return { valid: false, reason: "שגיאת DNS" };
      }
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: "כתובת URL לא תקינה" };
  }
}

async function safeFetch(url: string, init: RequestInit & { signal?: AbortSignal }): Promise<Response> {
  const check = await validateExternalUrl(url);
  if (!check.valid) throw new Error(`SSRF blocked: ${check.reason}`);
  const response = await fetch(url, { ...init, redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (location) {
      const redirectCheck = await validateExternalUrl(new URL(location, url).toString());
      if (!redirectCheck.valid) throw new Error(`SSRF blocked on redirect: ${redirectCheck.reason}`);
    }
  }
  return response;
}

function requireAuth(req: Request, res: ExpressResponse, next: NextFunction): void {
  const userId = (req as Record<string, unknown>).userId;
  if (!userId) {
    res.status(401).json({ error: "נדרש אימות" });
    return;
  }
  next();
}

router.use("/israeli-biz", requireAuth);

const q = async (text: string, params?: unknown[]) => {
  const r = await pool.query(text, params);
  return r.rows;
};

const q1 = async (text: string, params?: unknown[]) => {
  const r = await pool.query(text, params);
  return r.rows[0] || null;
};

async function ensureTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS israeli_accounting_connectors (
        id SERIAL PRIMARY KEY,
        provider VARCHAR(50) NOT NULL,
        display_name VARCHAR(200) NOT NULL,
        api_url TEXT,
        api_key TEXT,
        api_secret TEXT,
        company_id VARCHAR(100),
        username VARCHAR(200),
        password_encrypted TEXT,
        extra_config JSONB DEFAULT '{}',
        sync_invoices BOOLEAN DEFAULT true,
        sync_journal_entries BOOLEAN DEFAULT true,
        sync_customers BOOLEAN DEFAULT true,
        sync_suppliers BOOLEAN DEFAULT true,
        sync_tax_data BOOLEAN DEFAULT true,
        field_mapping JSONB DEFAULT '{}',
        last_sync_at TIMESTAMP,
        last_sync_status VARCHAR(30),
        last_sync_message TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS israeli_bank_connections (
        id SERIAL PRIMARY KEY,
        bank_code VARCHAR(10) NOT NULL,
        bank_name VARCHAR(200) NOT NULL,
        branch_number VARCHAR(10),
        account_number VARCHAR(20),
        erp_bank_account_id INTEGER,
        import_format VARCHAR(20) DEFAULT 'csv',
        auto_reconcile BOOLEAN DEFAULT true,
        reconcile_tolerance_agorot INTEGER DEFAULT 100,
        masav_sender_id VARCHAR(20),
        masav_sender_name VARCHAR(200),
        masav_institution_code VARCHAR(10),
        last_import_at TIMESTAMP,
        last_import_count INTEGER DEFAULT 0,
        last_sync_at TIMESTAMP,
        last_sync_status VARCHAR(50),
        last_sync_message TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      ALTER TABLE israeli_bank_connections ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP;
      ALTER TABLE israeli_bank_connections ADD COLUMN IF NOT EXISTS last_sync_status VARCHAR(50);
      ALTER TABLE israeli_bank_connections ADD COLUMN IF NOT EXISTS last_sync_message TEXT;

      CREATE TABLE IF NOT EXISTS israeli_bank_transactions (
        id SERIAL PRIMARY KEY,
        bank_connection_id INTEGER REFERENCES israeli_bank_connections(id) ON DELETE CASCADE,
        transaction_date DATE NOT NULL,
        value_date DATE,
        description TEXT,
        reference VARCHAR(100),
        amount_agorot INTEGER NOT NULL,
        balance_agorot INTEGER,
        transaction_type VARCHAR(50),
        counterparty VARCHAR(200),
        matched_invoice_id INTEGER,
        matched_payment_id INTEGER,
        reconciliation_status VARCHAR(30) DEFAULT 'unmatched',
        import_batch VARCHAR(50),
        raw_data JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS israeli_masav_files (
        id SERIAL PRIMARY KEY,
        file_number VARCHAR(50) UNIQUE,
        file_type VARCHAR(20) DEFAULT 'payment',
        sender_id VARCHAR(20),
        sender_name VARCHAR(200),
        institution_code VARCHAR(10),
        total_records INTEGER DEFAULT 0,
        total_amount_agorot BIGINT DEFAULT 0,
        creation_date DATE DEFAULT CURRENT_DATE,
        value_date DATE,
        status VARCHAR(30) DEFAULT 'draft',
        file_content TEXT,
        records JSONB DEFAULT '[]',
        notes TEXT,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS israeli_payment_gateways (
        id SERIAL PRIMARY KEY,
        provider VARCHAR(50) NOT NULL,
        display_name VARCHAR(200) NOT NULL,
        terminal_number VARCHAR(50),
        api_key TEXT,
        api_secret TEXT,
        merchant_id VARCHAR(100),
        extra_config JSONB DEFAULT '{}',
        supports_charge BOOLEAN DEFAULT true,
        supports_refund BOOLEAN DEFAULT true,
        supports_tokenize BOOLEAN DEFAULT true,
        supports_recurring BOOLEAN DEFAULT false,
        currency VARCHAR(10) DEFAULT 'ILS',
        is_test_mode BOOLEAN DEFAULT true,
        webhook_url TEXT,
        last_transaction_at TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS israeli_payment_transactions (
        id SERIAL PRIMARY KEY,
        gateway_id INTEGER REFERENCES israeli_payment_gateways(id) ON DELETE SET NULL,
        transaction_type VARCHAR(30) NOT NULL DEFAULT 'charge',
        amount_agorot INTEGER NOT NULL,
        currency VARCHAR(10) DEFAULT 'ILS',
        status VARCHAR(30) DEFAULT 'pending',
        card_last4 VARCHAR(4),
        card_type VARCHAR(20),
        card_token VARCHAR(200),
        approval_number VARCHAR(50),
        transaction_id_external VARCHAR(200),
        customer_name VARCHAR(200),
        customer_email VARCHAR(200),
        customer_phone VARCHAR(50),
        customer_id_number VARCHAR(20),
        installments INTEGER DEFAULT 1,
        description TEXT,
        error_message TEXT,
        raw_response JSONB DEFAULT '{}',
        linked_invoice_id INTEGER,
        linked_order_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS israeli_sync_history (
        id SERIAL PRIMARY KEY,
        source VARCHAR(100) NOT NULL,
        direction VARCHAR(30) NOT NULL,
        status VARCHAR(30) NOT NULL,
        records_processed INTEGER DEFAULT 0,
        records_failed INTEGER DEFAULT 0,
        error_message TEXT,
        details JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS israeli_tax_reports (
        id SERIAL PRIMARY KEY,
        report_type VARCHAR(50) NOT NULL,
        report_period VARCHAR(20),
        tax_year INTEGER,
        tax_month INTEGER,
        total_sales_agorot BIGINT DEFAULT 0,
        total_purchases_agorot BIGINT DEFAULT 0,
        vat_on_sales_agorot BIGINT DEFAULT 0,
        vat_on_purchases_agorot BIGINT DEFAULT 0,
        vat_payable_agorot BIGINT DEFAULT 0,
        withholding_tax_agorot BIGINT DEFAULT 0,
        report_data JSONB DEFAULT '{}',
        status VARCHAR(30) DEFAULT 'draft',
        submitted_at TIMESTAMP,
        confirmation_number VARCHAR(100),
        generated_file TEXT,
        notes TEXT,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[israeli-biz] ensureTables error:", err.message);
  }

  const integrationSlugs = [
    { slug: "accounting-hashavshevet", name: "חשבשבת", type: "accounting" },
    { slug: "accounting-rivhit", name: "רווחית", type: "accounting" },
    { slug: "accounting-heshbonit-mas", name: "חשבונית מס", type: "accounting" },
    { slug: "accounting-cheshbon", name: "חשבון", type: "accounting" },
    { slug: "bank-import", name: "ייבוא בנק", type: "banking" },
    { slug: "masav-generate", name: "מסב", type: "banking" },
    { slug: "payment-tranzila", name: "טרנזילה", type: "payment" },
    { slug: "payment-cardcom", name: "CardCom", type: "payment" },
    { slug: "payment-paypal", name: "PayPal", type: "payment" },
    { slug: "payment-icredit", name: "iCredit", type: "payment" },
    { slug: "tax-report", name: "דוחות מס", type: "tax" },
  ];
  try {
    for (const s of integrationSlugs) {
      await pool.query(
        `INSERT INTO integration_connections (name, slug, service_type, base_url, auth_method)
         VALUES ($1, $2, $3, 'https://placeholder', 'none')
         ON CONFLICT (slug) DO NOTHING`,
        [s.name, s.slug, s.type]
      );
    }
  } catch {
  }
}

export { ensureTables as ensureIsraeliBizTables };

async function logSync(source: string, direction: string, status: string, details: Record<string, unknown>) {
  const errorMsg = details.error ? String(details.error) : (details.errors && Array.isArray(details.errors) && details.errors.length > 0 ? (details.errors as string[]).join('; ') : null);
  try {
    await pool.query(
      `INSERT INTO israeli_sync_history (source, direction, status, records_processed, records_failed, error_message, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [source, direction, status,
       Number(details.recordsProcessed || 0), Number(details.recordsFailed || 0),
       errorMsg, JSON.stringify(details)]
    );
  } catch (e: unknown) {
    console.error("[israeli-biz] logSync error:", e instanceof Error ? e.message : String(e));
  }
  try {
    const slugMap: Record<string, string> = {
      hashavshevet: "accounting-hashavshevet", rivhit: "accounting-rivhit",
      "heshbonit-mas": "accounting-heshbonit-mas", cheshbon: "accounting-cheshbon",
      tranzila: "payment-tranzila", cardcom: "payment-cardcom",
      paypal: "payment-paypal", icredit: "payment-icredit",
    };
    let slug = source;
    if (source.startsWith("accounting-")) slug = source;
    else if (source.startsWith("payment-")) slug = source;
    else if (source === "bank-import" || source === "masav-generate" || source === "tax-report") slug = source;
    else {
      const base = source.replace(/^(accounting|payment|bank|tax)-/, "");
      if (slugMap[base]) slug = slugMap[base];
    }
    await pool.query(
      `INSERT INTO integration_sync_logs (connection_id, direction, status, records_processed, records_failed, error_message, details, started_at, completed_at)
       SELECT c.id, $2, $3, $4, $5, $6, $7, NOW(), NOW()
       FROM integration_connections c WHERE c.slug = $1 LIMIT 1`,
      [slug, direction, status,
       Number(details.recordsProcessed || 0), Number(details.recordsFailed || 0),
       errorMsg, JSON.stringify(details)]
    );
  } catch {
  }
}

function decryptRowCredentials(row: Record<string, unknown>): Record<string, unknown> {
  const credFields = ["api_key", "api_secret", "password_encrypted"];
  const result = { ...row };
  for (const field of credFields) {
    if (result[field] && typeof result[field] === "string") {
      try { result[field] = decryptCredential(result[field] as string); } catch { /* leave as-is if not encrypted (legacy data) */ }
    }
  }
  return result;
}

function maskCredential(value: unknown): string | null {
  if (!value || typeof value !== "string") return null;
  if (value.length <= 6) return "***";
  return value.slice(0, 3) + "***" + value.slice(-3);
}

function sanitizeConnectorRow(row: Record<string, unknown>): Record<string, unknown> {
  const safe = { ...row };
  if (safe.api_key) safe.api_key = maskCredential(safe.api_key);
  if (safe.api_secret) safe.api_secret = maskCredential(safe.api_secret);
  if (safe.password_encrypted) safe.password_encrypted = "***";
  return safe;
}

function sanitizeGatewayRow(row: Record<string, unknown>): Record<string, unknown> {
  const safe = { ...row };
  if (safe.api_key) safe.api_key = maskCredential(safe.api_key);
  if (safe.api_secret) safe.api_secret = maskCredential(safe.api_secret);
  if (safe.terminal_password) safe.terminal_password = "***";
  return safe;
}


router.get("/israeli-biz/accounting/connectors", async (_req: Request, res: ExpressResponse) => {
  try {
    const rows = await q("SELECT id, provider, display_name, api_url, company_id, username, sync_invoices, sync_journal_entries, sync_customers, sync_suppliers, sync_tax_data, field_mapping, last_sync_at, last_sync_status, last_sync_message, is_active, created_at, updated_at FROM israeli_accounting_connectors ORDER BY created_at DESC");
    res.json(rows);
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.get("/israeli-biz/accounting/connectors/:id", async (req: Request, res: ExpressResponse) => {
  try {
    const row = await q1("SELECT id, provider, display_name, api_url, company_id, username, sync_invoices, sync_journal_entries, sync_customers, sync_suppliers, sync_tax_data, field_mapping, last_sync_at, last_sync_status, last_sync_message, is_active, extra_config, created_at, updated_at FROM israeli_accounting_connectors WHERE id = $1", [String(req.params.id)]);
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.post("/israeli-biz/accounting/connectors", async (req: Request, res: ExpressResponse) => {
  try {
    const { provider, displayName, apiUrl, apiKey, apiSecret, companyId, username, password,
            syncInvoices, syncJournalEntries, syncCustomers, syncSuppliers, syncTaxData, fieldMapping, extraConfig } = req.body;
    if (apiUrl) {
      const urlCheck = await validateExternalUrl(apiUrl);
      if (!urlCheck.valid) return res.status(400).json({ error: `כתובת URL לא תקינה: ${urlCheck.reason}` });
    }
    const r = await pool.query(
      `INSERT INTO israeli_accounting_connectors (provider, display_name, api_url, api_key, api_secret, company_id, username, password_encrypted,
        sync_invoices, sync_journal_entries, sync_customers, sync_suppliers, sync_tax_data, field_mapping, extra_config)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [provider, displayName, apiUrl,
       apiKey ? encryptCredential(apiKey) : null,
       apiSecret ? encryptCredential(apiSecret) : null,
       companyId, username,
       password ? encryptCredential(password) : null,
       syncInvoices ?? true, syncJournalEntries ?? true, syncCustomers ?? true, syncSuppliers ?? true, syncTaxData ?? true,
       JSON.stringify(fieldMapping || {}), JSON.stringify(extraConfig || {})]
    );
    await logSync(`accounting-${provider}`, "setup", "completed", { action: "connector_created", provider });
    res.status(201).json(sanitizeConnectorRow(r.rows[0] as Record<string, unknown>));
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.put("/israeli-biz/accounting/connectors/:id", async (req: Request, res: ExpressResponse) => {
  try {
    const { displayName, apiUrl, apiKey, apiSecret, companyId, username, password,
            syncInvoices, syncJournalEntries, syncCustomers, syncSuppliers, syncTaxData, fieldMapping, extraConfig, isActive } = req.body;
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    const add = (col: string, val: unknown) => { if (val !== undefined) { sets.push(`${col} = $${idx++}`); vals.push(val); } };
    add("display_name", displayName);
    add("api_url", apiUrl);
    if (apiKey && !String(apiKey).includes("****")) add("api_key", encryptCredential(String(apiKey)));
    if (apiSecret && !String(apiSecret).includes("****")) add("api_secret", encryptCredential(String(apiSecret)));
    add("company_id", companyId);
    add("username", username);
    if (password && !String(password).includes("****")) add("password_encrypted", encryptCredential(String(password)));
    add("sync_invoices", syncInvoices);
    add("sync_journal_entries", syncJournalEntries);
    add("sync_customers", syncCustomers);
    add("sync_suppliers", syncSuppliers);
    add("sync_tax_data", syncTaxData);
    if (fieldMapping !== undefined) add("field_mapping", JSON.stringify(fieldMapping));
    if (extraConfig !== undefined) add("extra_config", JSON.stringify(extraConfig));
    add("is_active", isActive);
    sets.push(`updated_at = NOW()`);
    vals.push(String(req.params.id));
    const r = await pool.query(`UPDATE israeli_accounting_connectors SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`, vals);
    if (!r.rows[0]) return res.status(404).json({ error: "לא נמצא" });
    res.json(sanitizeConnectorRow(r.rows[0] as Record<string, unknown>));
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.delete("/israeli-biz/accounting/connectors/:id", async (req: Request, res: ExpressResponse) => {
  try {
    await pool.query("DELETE FROM israeli_accounting_connectors WHERE id = $1", [String(req.params.id)]);
    res.json({ success: true });
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.post("/israeli-biz/accounting/connectors/:id/test", async (req: Request, res: ExpressResponse) => {
  try {
    const rawRow = await q1("SELECT * FROM israeli_accounting_connectors WHERE id = $1", [String(req.params.id)]);
    if (!rawRow) return res.status(404).json({ error: "לא נמצא" });
    const row = decryptRowCredentials(rawRow as Record<string, unknown>);
    const provider = String(row.provider);
    let success = false;
    let message = "";
    const startTime = Date.now();

    if (provider === "hashavshevet") {
      if (!row.api_url || !row.api_key) {
        message = "חסר URL או API Key עבור חשבשבת";
      } else {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const resp = await safeFetch(`${row.api_url}/api/v1/ping`, {
            headers: { "Authorization": `Bearer ${row.api_key}`, "Accept": "application/json" },
            signal: controller.signal,
          });
          clearTimeout(timeout);
          success = resp.ok;
          message = success ? `חיבור לחשבשבת הצליח (${resp.status}) - ${Date.now() - startTime}ms` : `שגיאה: ${resp.status}`;
        } catch (e: unknown) {
          message = `שגיאת חיבור: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
    } else if (provider === "rivhit") {
      if (!row.api_url || !row.api_key) {
        message = "חסר URL או API Key עבור רווחית";
      } else {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const resp = await safeFetch(`${row.api_url}/api/account/info`, {
            headers: { "api-key": String(row.api_key), "Accept": "application/json" },
            signal: controller.signal,
          });
          clearTimeout(timeout);
          success = resp.ok;
          message = success ? `חיבור לרווחית הצליח (${resp.status}) - ${Date.now() - startTime}ms` : `שגיאה: ${resp.status}`;
        } catch (e: unknown) {
          message = `שגיאת חיבור: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
    } else if (provider === "heshbonit-mas" || provider === "cheshbon") {
      if (!row.api_url || (!row.api_key && !row.username)) {
        message = "חסרים פרטי התחברות";
      } else {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const resp = await safeFetch(`${row.api_url}/api/health`, {
            headers: {
              ...(row.api_key ? { "Authorization": `Bearer ${row.api_key}` } : {}),
              "Accept": "application/json",
            },
            signal: controller.signal,
          });
          clearTimeout(timeout);
          success = resp.ok;
          const label = provider === "heshbonit-mas" ? "חשבונית מס" : "חשבון";
          message = success ? `חיבור ל${label} הצליח (${resp.status}) - ${Date.now() - startTime}ms` : `שגיאה: ${resp.status}`;
        } catch (e: unknown) {
          message = `שגיאת חיבור: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
    } else {
      message = `ספק לא מוכר: ${provider}`;
    }

    await pool.query("UPDATE israeli_accounting_connectors SET last_sync_at = NOW(), last_sync_status = $1, last_sync_message = $2 WHERE id = $3",
      [success ? "success" : "failed", message, String(req.params.id)]);
    await logSync(`accounting-${provider}`, "test", success ? "completed" : "failed", { provider, responseTime: Date.now() - startTime });
    res.json({ success, message, responseTime: Date.now() - startTime });
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.post("/israeli-biz/accounting/connectors/:id/sync", async (req: Request, res: ExpressResponse) => {
  try {
    const rawRow = await q1("SELECT * FROM israeli_accounting_connectors WHERE id = $1", [String(req.params.id)]);
    if (!rawRow) return res.status(404).json({ error: "לא נמצא" });
    const row = decryptRowCredentials(rawRow as Record<string, unknown>);
    const provider = String(row.provider);
    const direction = String(req.body.direction || "import");
    const entities = (req.body.entities as string[]) || ["invoices", "journal_entries"];

    let recordsProcessed = 0;
    let recordsFailed = 0;
    const errors: string[] = [];

    for (const entity of entities) {
      try {
        if (direction === "import" || direction === "bidirectional") {
          if (provider === "hashavshevet" && row.api_url && row.api_key) {
            const endpointMap: Record<string, string> = {
              invoices: "/api/v1/invoices",
              journal_entries: "/api/v1/journal-entries",
              customers: "/api/v1/accounts?type=customer",
              suppliers: "/api/v1/accounts?type=supplier",
            };
            const endpoint = endpointMap[entity];
            if (endpoint) {
              try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 30000);
                const resp = await safeFetch(`${row.api_url}${endpoint}`, {
                  headers: { "Authorization": `Bearer ${row.api_key}`, "Accept": "application/json" },
                  signal: controller.signal,
                });
                clearTimeout(timeout);
                if (resp.ok) {
                  const data = await resp.json() as Record<string, unknown>;
                  const items = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : Array.isArray(data.items) ? data.items : Array.isArray(data.results) ? data.results : []);
                  recordsProcessed += items.length;
                } else {
                  errors.push(`${entity}: HTTP ${resp.status}`);
                  recordsFailed++;
                }
              } catch (e: unknown) {
                errors.push(`${entity}: ${e instanceof Error ? e.message : String(e)}`);
                recordsFailed++;
              }
            }
          } else if (provider === "rivhit" && row.api_url && row.api_key) {
            const endpointMap: Record<string, string> = {
              invoices: "/api/documents",
              journal_entries: "/api/journal",
              customers: "/api/customers",
              suppliers: "/api/suppliers",
            };
            const endpoint = endpointMap[entity];
            if (endpoint) {
              try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 30000);
                const resp = await safeFetch(`${row.api_url}${endpoint}`, {
                  headers: { "api-key": String(row.api_key), "Accept": "application/json" },
                  signal: controller.signal,
                });
                clearTimeout(timeout);
                if (resp.ok) {
                  const data = await resp.json() as Record<string, unknown>;
                  const items = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : Array.isArray(data.items) ? data.items : []);
                  recordsProcessed += items.length;
                } else {
                  errors.push(`${entity}: HTTP ${resp.status}`);
                  recordsFailed++;
                }
              } catch (e: unknown) {
                errors.push(`${entity}: ${e instanceof Error ? e.message : String(e)}`);
                recordsFailed++;
              }
            }
          } else {
            recordsProcessed += 0;
          }
        }
        if (direction === "export" || direction === "bidirectional") {
          if (provider === "hashavshevet" && row.api_url && row.api_key) {
            const exportEndpoints: Record<string, string> = {
              invoices: "/api/v1/invoices",
              journal_entries: "/api/v1/journal-entries",
              customers: "/api/v1/accounts",
              suppliers: "/api/v1/accounts",
            };
            const endpoint = exportEndpoints[entity];
            if (endpoint) {
              const erpTableMap: Record<string, string> = {
                invoices: "income_documents",
                journal_entries: "journal_entries",
                customers: "contacts",
                suppliers: "contacts",
              };
              const erpTable = erpTableMap[entity];
              if (erpTable) {
                try {
                  const erpRows = await q(`SELECT * FROM ${erpTable} WHERE updated_at >= NOW() - INTERVAL '24 hours' LIMIT 100`);
                  for (const erpRow of erpRows) {
                    try {
                      const controller = new AbortController();
                      const timeout = setTimeout(() => controller.abort(), 15000);
                      const resp = await safeFetch(`${row.api_url}${endpoint}`, {
                        method: "POST",
                        headers: { "Authorization": `Bearer ${row.api_key}`, "Content-Type": "application/json" },
                        body: JSON.stringify(erpRow),
                        signal: controller.signal,
                      });
                      clearTimeout(timeout);
                      if (resp.ok) { recordsProcessed++; } else { recordsFailed++; errors.push(`export ${entity} ${erpRow.id}: HTTP ${resp.status}`); }
                    } catch (e: unknown) { recordsFailed++; errors.push(`export ${entity}: ${e instanceof Error ? e.message : String(e)}`); }
                  }
                } catch (e: unknown) { errors.push(`export ${entity}: ${e instanceof Error ? e.message : String(e)}`); }
              }
            }
          } else if (provider === "rivhit" && row.api_url && row.api_key) {
            const exportEndpoints: Record<string, string> = {
              invoices: "/api/documents",
              journal_entries: "/api/journal",
              customers: "/api/customers",
              suppliers: "/api/suppliers",
            };
            const endpoint = exportEndpoints[entity];
            if (endpoint) {
              const erpTableMap: Record<string, string> = {
                invoices: "income_documents",
                journal_entries: "journal_entries",
                customers: "contacts",
                suppliers: "contacts",
              };
              const erpTable = erpTableMap[entity];
              if (erpTable) {
                try {
                  const erpRows = await q(`SELECT * FROM ${erpTable} WHERE updated_at >= NOW() - INTERVAL '24 hours' LIMIT 100`);
                  for (const erpRow of erpRows) {
                    try {
                      const controller = new AbortController();
                      const timeout = setTimeout(() => controller.abort(), 15000);
                      const resp = await safeFetch(`${row.api_url}${endpoint}`, {
                        method: "POST",
                        headers: { "api-key": String(row.api_key), "Content-Type": "application/json" },
                        body: JSON.stringify(erpRow),
                        signal: controller.signal,
                      });
                      clearTimeout(timeout);
                      if (resp.ok) { recordsProcessed++; } else { recordsFailed++; errors.push(`export ${entity} ${erpRow.id}: HTTP ${resp.status}`); }
                    } catch (e: unknown) { recordsFailed++; errors.push(`export ${entity}: ${e instanceof Error ? e.message : String(e)}`); }
                  }
                } catch (e: unknown) { errors.push(`export ${entity}: ${e instanceof Error ? e.message : String(e)}`); }
              }
            }
          }
        }
      } catch (e: unknown) {
        errors.push(`${entity}: ${e instanceof Error ? e.message : String(e)}`);
        recordsFailed++;
      }
    }

    const status = recordsFailed > 0 && recordsProcessed === 0 ? "failed" : "completed";
    await pool.query("UPDATE israeli_accounting_connectors SET last_sync_at = NOW(), last_sync_status = $1, last_sync_message = $2 WHERE id = $3",
      [status, errors.length > 0 ? errors.join("; ") : `סונכרנו ${recordsProcessed} רשומות`, String(req.params.id)]);
    await logSync(`accounting-${provider}`, direction, status, { recordsProcessed, recordsFailed, errors, entities });

    res.json({ success: status !== "failed", recordsProcessed, recordsFailed, errors });
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});


router.get("/israeli-biz/bank/connections", async (_req: Request, res: ExpressResponse) => {
  try {
    const rows = await q("SELECT * FROM israeli_bank_connections ORDER BY created_at DESC");
    res.json(rows);
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.post("/israeli-biz/bank/connections", async (req: Request, res: ExpressResponse) => {
  try {
    const { bankCode, bankName, branchNumber, accountNumber, erpBankAccountId, importFormat,
            autoReconcile, reconcileToleranceAgorot, masavSenderId, masavSenderName, masavInstitutionCode } = req.body;
    const r = await pool.query(
      `INSERT INTO israeli_bank_connections (bank_code, bank_name, branch_number, account_number, erp_bank_account_id,
        import_format, auto_reconcile, reconcile_tolerance_agorot, masav_sender_id, masav_sender_name, masav_institution_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [bankCode, bankName, branchNumber, accountNumber, erpBankAccountId,
       importFormat || "csv", autoReconcile ?? true, reconcileToleranceAgorot ?? 100,
       masavSenderId, masavSenderName, masavInstitutionCode]
    );
    res.status(201).json(r.rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.put("/israeli-biz/bank/connections/:id", async (req: Request, res: ExpressResponse) => {
  try {
    const { bankName, branchNumber, accountNumber, erpBankAccountId, importFormat,
            autoReconcile, reconcileToleranceAgorot, masavSenderId, masavSenderName, masavInstitutionCode, isActive } = req.body;
    const r = await pool.query(
      `UPDATE israeli_bank_connections SET
        bank_name = COALESCE($1, bank_name), branch_number = COALESCE($2, branch_number),
        account_number = COALESCE($3, account_number), erp_bank_account_id = COALESCE($4, erp_bank_account_id),
        import_format = COALESCE($5, import_format), auto_reconcile = COALESCE($6, auto_reconcile),
        reconcile_tolerance_agorot = COALESCE($7, reconcile_tolerance_agorot),
        masav_sender_id = COALESCE($8, masav_sender_id), masav_sender_name = COALESCE($9, masav_sender_name),
        masav_institution_code = COALESCE($10, masav_institution_code), is_active = COALESCE($11, is_active),
        updated_at = NOW()
       WHERE id = $12 RETURNING *`,
      [bankName, branchNumber, accountNumber, erpBankAccountId, importFormat,
       autoReconcile, reconcileToleranceAgorot, masavSenderId, masavSenderName, masavInstitutionCode, isActive, String(req.params.id)]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.delete("/israeli-biz/bank/connections/:id", async (req: Request, res: ExpressResponse) => {
  try {
    await pool.query("DELETE FROM israeli_bank_connections WHERE id = $1", [String(req.params.id)]);
    res.json({ success: true });
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.post("/israeli-biz/bank/connections/:id/test", async (req: Request, res: ExpressResponse) => {
  try {
    const row = await q1("SELECT * FROM israeli_bank_connections WHERE id = $1", [String(req.params.id)]);
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    const startTime = Date.now();
    let success = false;
    let message = "";
    const bankCode = String(row.bank_code);
    const bankApiUrls: Record<string, string> = {
      "12": "https://online.bankhapoalim.co.il",
      "10": "https://online.leumi.co.il",
      "11": "https://start.telebank.co.il",
      "20": "https://online.mizrahi-tefahot.co.il",
    };
    const bankUrl = bankApiUrls[bankCode];
    if (!bankUrl) {
      message = `קוד בנק ${bankCode} לא נתמך לבדיקת חיבור`;
    } else {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const resp = await safeFetch(bankUrl, { signal: controller.signal });
        clearTimeout(timeout);
        success = resp.ok || resp.status === 403;
        message = success ? `בנק ${row.bank_name || bankCode} זמין (${Date.now() - startTime}ms)` : `שגיאה: ${resp.status}`;
      } catch (e: unknown) {
        message = `שגיאת חיבור: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    await pool.query("UPDATE israeli_bank_connections SET last_sync_at = NOW(), last_sync_status = $1, last_sync_message = $2 WHERE id = $3",
      [success ? "success" : "failed", message, String(req.params.id)]);
    await logSync(`bank-${bankCode}`, "test", success ? "completed" : "failed", { bankCode, responseTime: Date.now() - startTime });
    res.json({ success, message, responseTime: Date.now() - startTime });
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.get("/israeli-biz/bank/transactions", async (req: Request, res: ExpressResponse) => {
  try {
    const { connectionId, status, limit = "100", offset = "0" } = req.query;
    let where = "WHERE 1=1";
    const params: unknown[] = [];
    let idx = 1;
    if (connectionId) { where += ` AND bank_connection_id = $${idx++}`; params.push(String(connectionId)); }
    if (status) { where += ` AND reconciliation_status = $${idx++}`; params.push(String(status)); }
    const rows = await q(`SELECT t.*, bc.bank_name, bc.account_number FROM israeli_bank_transactions t
      LEFT JOIN israeli_bank_connections bc ON bc.id = t.bank_connection_id
      ${where} ORDER BY t.transaction_date DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, Math.min(Number(limit) || 100, 500), Math.max(Number(offset) || 0, 0)]);
    const countR = await q1(`SELECT COUNT(*) as total FROM israeli_bank_transactions ${where}`, params);
    res.json({ data: rows, total: Number(countR?.total || 0) });
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

router.post("/israeli-biz/bank/import", async (req: Request, res: ExpressResponse) => {
  try {
    const { connectionId, format, data, fileName } = req.body;
    if (!connectionId || !data) return res.status(400).json({ error: "חסר connectionId או data" });

    const conn = await q1("SELECT * FROM israeli_bank_connections WHERE id = $1", [connectionId]);
    if (!conn) return res.status(404).json({ error: "חיבור בנק לא נמצא" });

    const importFormat = format || String(conn.import_format) || "csv";
    const batchId = `IMP-${Date.now()}`;
    let imported = 0;
    let failed = 0;
    const errors: string[] = [];

    if (importFormat === "csv") {
      const lines = String(data).split("\n").filter((l: string) => l.trim());
      const headers = parseCSVLine(lines[0]).map((h: string) => h.toLowerCase().replace(/[^a-z0-9_]/g, "_"));

      for (let i = 1; i < lines.length; i++) {
        try {
          const vals = parseCSVLine(lines[i]);
          const row: Record<string, string> = {};
          headers.forEach((h: string, idx: number) => { row[h] = vals[idx] || ""; });

          const dateStr = row.date || row.transaction_date || row.value_date || row.taarich || "";
          const desc = row.description || row.details || row.teur || row.memo || "";
          const amountStr = row.amount || row.sum || row.schum || "0";
          const balanceStr = row.balance || row.running_balance || row.yitra || "";
          const ref = row.reference || row.ref || row.check_number || row.asmachta || "";

          const amount = Math.round(parseFloat(amountStr.replace(/[^\d.-]/g, "")) * 100) || 0;
          const balance = balanceStr ? Math.round(parseFloat(balanceStr.replace(/[^\d.-]/g, "")) * 100) : null;

          let txDate = dateStr;
          if (/^\d{2}[./-]\d{2}[./-]\d{4}$/.test(dateStr)) {
            const parts = dateStr.split(/[./-]/);
            txDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
          }

          await pool.query(
            `INSERT INTO israeli_bank_transactions (bank_connection_id, transaction_date, description, reference, amount_agorot, balance_agorot, transaction_type, import_batch, raw_data)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [connectionId, txDate || new Date().toISOString().split("T")[0], desc, ref, amount, balance,
             amount >= 0 ? "credit" : "debit", batchId, JSON.stringify(row)]
          );
          imported++;
        } catch (e: unknown) {
          errors.push(`שורה ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
          failed++;
        }
      }
    } else if (importFormat === "ofx") {
      const txRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
      let match;
      while ((match = txRegex.exec(String(data))) !== null) {
        try {
          const block = match[1];
          const getField = (name: string) => {
            const m = new RegExp(`<${name}>([^<\\n]+)`, "i").exec(block);
            return m ? m[1].trim() : "";
          };
          const dtPosted = getField("DTPOSTED");
          const amount = Math.round(parseFloat(getField("TRNAMT") || "0") * 100);
          const desc = getField("NAME") || getField("MEMO") || "";
          const ref = getField("FITID") || getField("CHECKNUM") || "";
          const trnType = getField("TRNTYPE") || "";

          let txDate = new Date().toISOString().split("T")[0];
          if (dtPosted.length >= 8) {
            txDate = `${dtPosted.slice(0, 4)}-${dtPosted.slice(4, 6)}-${dtPosted.slice(6, 8)}`;
          }

          await pool.query(
            `INSERT INTO israeli_bank_transactions (bank_connection_id, transaction_date, description, reference, amount_agorot, transaction_type, import_batch, raw_data)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [connectionId, txDate, desc, ref, amount, trnType.toLowerCase() || (amount >= 0 ? "credit" : "debit"), batchId, JSON.stringify({ dtPosted, trnType, amount: getField("TRNAMT"), name: desc })]
          );
          imported++;
        } catch (e: unknown) {
          errors.push(`OFX: ${e instanceof Error ? e.message : String(e)}`);
          failed++;
        }
      }
    }

    await pool.query("UPDATE israeli_bank_connections SET last_import_at = NOW(), last_import_count = $1 WHERE id = $2",
      [imported, connectionId]);
    await logSync("bank-import", "import", failed > 0 && imported === 0 ? "failed" : "completed",
      { recordsProcessed: imported, recordsFailed: failed, errors, format: importFormat, fileName, batchId });

    res.json({ success: imported > 0, imported, failed, errors, batchId });
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.post("/israeli-biz/bank/reconcile", async (req: Request, res: ExpressResponse) => {
  try {
    const { connectionId } = req.body;
    if (!connectionId) return res.status(400).json({ error: "חסר connectionId" });

    const conn = await q1("SELECT * FROM israeli_bank_connections WHERE id = $1", [connectionId]);
    if (!conn) return res.status(404).json({ error: "חיבור בנק לא נמצא" });
    const toleranceAgorot = Number(conn.reconcile_tolerance_agorot) || 100;

    const unmatched = await q(
      `SELECT * FROM israeli_bank_transactions WHERE bank_connection_id = $1 AND reconciliation_status = 'unmatched' ORDER BY transaction_date DESC`,
      [connectionId]
    );

    let matched = 0;
    let suggested = 0;

    for (const tx of unmatched) {
      const amountAgorot = Number(tx.amount_agorot);
      const amountNIS = amountAgorot / 100;

      const invoiceMatch = await q1(
        `SELECT id, invoice_number, balance_due FROM accounts_receivable
         WHERE ABS(balance_due - $1) <= $2 AND status NOT IN ('paid','cancelled')
         ORDER BY ABS(balance_due - $1) ASC LIMIT 1`,
        [Math.abs(amountNIS), toleranceAgorot / 100]
      );

      if (invoiceMatch) {
        await pool.query(
          `UPDATE israeli_bank_transactions SET matched_invoice_id = $1, reconciliation_status = 'matched' WHERE id = $2`,
          [invoiceMatch.id, tx.id]
        );
        matched++;
      } else {
        const payableMatch = await q1(
          `SELECT id, invoice_number, balance_due FROM accounts_payable
           WHERE ABS(balance_due - $1) <= $2 AND status NOT IN ('paid','cancelled')
           ORDER BY ABS(balance_due - $1) ASC LIMIT 1`,
          [Math.abs(amountNIS), toleranceAgorot / 100]
        );
        if (payableMatch) {
          await pool.query(
            `UPDATE israeli_bank_transactions SET matched_invoice_id = $1, reconciliation_status = 'suggested' WHERE id = $2`,
            [payableMatch.id, tx.id]
          );
          suggested++;
        }
      }
    }

    await logSync("bank-reconcile", "reconcile", "completed", { recordsProcessed: matched + suggested, matched, suggested, total: unmatched.length });
    res.json({ success: true, total: unmatched.length, matched, suggested, unmatched: unmatched.length - matched - suggested });
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.put("/israeli-biz/bank/transactions/:id/reconcile", async (req: Request, res: ExpressResponse) => {
  try {
    const { status, matchedInvoiceId, matchedPaymentId } = req.body;
    const r = await pool.query(
      `UPDATE israeli_bank_transactions SET reconciliation_status = $1, matched_invoice_id = $2, matched_payment_id = $3 WHERE id = $4 RETURNING *`,
      [status || "matched", matchedInvoiceId || null, matchedPaymentId || null, String(req.params.id)]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

function formatMasavRecord(record: { bankCode: string; branchNumber: string; accountNumber: string; idNumber: string; name: string; amountAgorot: number; reference: string }): string {
  const padRight = (s: string, len: number) => s.slice(0, len).padEnd(len, " ");
  const padLeft = (s: string, len: number) => s.slice(0, len).padStart(len, "0");

  return [
    padLeft(record.bankCode, 2),
    padLeft(record.branchNumber, 3),
    padLeft(record.accountNumber, 9),
    padLeft(record.idNumber, 9),
    padRight(record.name, 16),
    padLeft(String(Math.abs(record.amountAgorot)), 13),
    padLeft(record.reference, 16),
  ].join("");
}

router.get("/israeli-biz/masav/files", async (_req: Request, res: ExpressResponse) => {
  try {
    const rows = await q("SELECT id, file_number, file_type, sender_id, sender_name, total_records, total_amount_agorot, creation_date, value_date, status, notes, created_at FROM israeli_masav_files ORDER BY created_at DESC");
    res.json(rows);
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.post("/israeli-biz/masav/generate", async (req: Request, res: ExpressResponse) => {
  try {
    const { connectionId, valueDate, records: paymentRecords, notes } = req.body;
    if (!connectionId || !paymentRecords || !Array.isArray(paymentRecords) || paymentRecords.length === 0) {
      return res.status(400).json({ error: "חסר connectionId או רשומות תשלום" });
    }

    const conn = await q1("SELECT * FROM israeli_bank_connections WHERE id = $1", [connectionId]);
    if (!conn) return res.status(404).json({ error: "חיבור בנק לא נמצא" });

    const senderId = String(conn.masav_sender_id || "000000000");
    const senderName = String(conn.masav_sender_name || "COMPANY");
    const institutionCode = String(conn.masav_institution_code || "00");

    const fileNum = `MSV-${Date.now().toString(36).toUpperCase()}`;
    const vDate = valueDate || new Date().toISOString().split("T")[0];
    const vDateFormatted = vDate.replace(/-/g, "").slice(2);

    const padRight = (s: string, len: number) => s.slice(0, len).padEnd(len, " ");
    const padLeft = (s: string, len: number) => s.slice(0, len).padStart(len, "0");

    const headerRecord = [
      "1",
      padLeft(senderId, 9),
      padRight(senderName, 16),
      padLeft(institutionCode, 2),
      vDateFormatted,
      padLeft("1", 4),
      padLeft(String(paymentRecords.length), 7),
    ].join("");

    const detailLines: string[] = [];
    let totalAmountAgorot = 0;

    for (const rec of paymentRecords) {
      const amount = Math.round(Number(rec.amountAgorot || (rec.amount ? rec.amount * 100 : 0)));
      totalAmountAgorot += Math.abs(amount);
      detailLines.push(formatMasavRecord({
        bankCode: String(rec.bankCode || ""),
        branchNumber: String(rec.branchNumber || ""),
        accountNumber: String(rec.accountNumber || ""),
        idNumber: String(rec.idNumber || ""),
        name: String(rec.name || ""),
        amountAgorot: amount,
        reference: String(rec.reference || ""),
      }));
    }

    const trailerRecord = [
      "9",
      padLeft(String(paymentRecords.length), 7),
      padLeft(String(totalAmountAgorot), 15),
    ].join("");

    const fileContent = [headerRecord, ...detailLines, trailerRecord].join("\n");

    const r = await pool.query(
      `INSERT INTO israeli_masav_files (file_number, file_type, sender_id, sender_name, institution_code,
        total_records, total_amount_agorot, value_date, status, file_content, records, notes)
       VALUES ($1, 'payment', $2, $3, $4, $5, $6, $7, 'draft', $8, $9, $10) RETURNING *`,
      [fileNum, senderId, senderName, institutionCode, paymentRecords.length,
       totalAmountAgorot, vDate, fileContent, JSON.stringify(paymentRecords), notes]
    );

    await logSync("masav-generate", "export", "completed", { recordsProcessed: paymentRecords.length, fileNumber: fileNum, totalAmountAgorot });
    res.json({ success: true, file: r.rows[0] });
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.get("/israeli-biz/masav/files/:id/download", async (req: Request, res: ExpressResponse) => {
  try {
    const row = await q1("SELECT * FROM israeli_masav_files WHERE id = $1", [String(req.params.id)]);
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${row.file_number}.masav"`);
    res.send(row.file_content);
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.put("/israeli-biz/masav/files/:id/status", async (req: Request, res: ExpressResponse) => {
  try {
    const { status } = req.body;
    const r = await pool.query("UPDATE israeli_masav_files SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *", [status, String(req.params.id)]);
    if (!r.rows[0]) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});


router.get("/israeli-biz/payment/gateways", async (_req: Request, res: ExpressResponse) => {
  try {
    const rows = await q("SELECT id, provider, display_name, terminal_number, merchant_id, supports_charge, supports_refund, supports_tokenize, supports_recurring, currency, is_test_mode, webhook_url, last_transaction_at, is_active, created_at FROM israeli_payment_gateways ORDER BY created_at DESC");
    res.json(rows);
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.post("/israeli-biz/payment/gateways", async (req: Request, res: ExpressResponse) => {
  try {
    const { provider, displayName, terminalNumber, apiKey, apiSecret, merchantId, extraConfig,
            supportsCharge, supportsRefund, supportsTokenize, supportsRecurring, currency, isTestMode, webhookUrl } = req.body;
    const r = await pool.query(
      `INSERT INTO israeli_payment_gateways (provider, display_name, terminal_number, api_key, api_secret, merchant_id, extra_config,
        supports_charge, supports_refund, supports_tokenize, supports_recurring, currency, is_test_mode, webhook_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [provider, displayName, terminalNumber,
       apiKey ? encryptCredential(apiKey) : null,
       apiSecret ? encryptCredential(apiSecret) : null,
       merchantId, JSON.stringify(extraConfig || {}),
       supportsCharge ?? true, supportsRefund ?? true, supportsTokenize ?? true, supportsRecurring ?? false,
       currency || "ILS", isTestMode ?? true, webhookUrl]
    );
    res.status(201).json(sanitizeGatewayRow(r.rows[0] as Record<string, unknown>));
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.put("/israeli-biz/payment/gateways/:id", async (req: Request, res: ExpressResponse) => {
  try {
    const { displayName, terminalNumber, apiKey, apiSecret, merchantId, extraConfig,
            supportsCharge, supportsRefund, supportsTokenize, supportsRecurring, currency, isTestMode, webhookUrl, isActive } = req.body;
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    const add = (col: string, val: unknown) => { if (val !== undefined) { sets.push(`${col} = $${idx++}`); vals.push(val); } };
    add("display_name", displayName);
    add("terminal_number", terminalNumber);
    if (apiKey && !String(apiKey).includes("****")) add("api_key", encryptCredential(String(apiKey)));
    if (apiSecret && !String(apiSecret).includes("****")) add("api_secret", encryptCredential(String(apiSecret)));
    add("merchant_id", merchantId);
    if (extraConfig !== undefined) add("extra_config", JSON.stringify(extraConfig));
    add("supports_charge", supportsCharge);
    add("supports_refund", supportsRefund);
    add("supports_tokenize", supportsTokenize);
    add("supports_recurring", supportsRecurring);
    add("currency", currency);
    add("is_test_mode", isTestMode);
    add("webhook_url", webhookUrl);
    add("is_active", isActive);
    sets.push("updated_at = NOW()");
    vals.push(String(req.params.id));
    const r = await pool.query(`UPDATE israeli_payment_gateways SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`, vals);
    if (!r.rows[0]) return res.status(404).json({ error: "לא נמצא" });
    res.json(sanitizeGatewayRow(r.rows[0] as Record<string, unknown>));
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.delete("/israeli-biz/payment/gateways/:id", async (req: Request, res: ExpressResponse) => {
  try {
    await pool.query("DELETE FROM israeli_payment_gateways WHERE id = $1", [String(req.params.id)]);
    res.json({ success: true });
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.post("/israeli-biz/payment/gateways/:id/test", async (req: Request, res: ExpressResponse) => {
  try {
    const rawGwRow = await q1("SELECT * FROM israeli_payment_gateways WHERE id = $1", [String(req.params.id)]);
    if (!rawGwRow) return res.status(404).json({ error: "לא נמצא" });
    const row = decryptRowCredentials(rawGwRow as Record<string, unknown>);
    const provider = String(row.provider);
    let success = false;
    let message = "";
    const startTime = Date.now();

    if (provider === "tranzila") {
      success = !!(row.terminal_number && row.api_key);
      message = success ? `הגדרות Tranzila תקינות (טרמינל: ${row.terminal_number})` : "חסר מספר טרמינל או API Key";
      if (success && row.api_key) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const resp = await fetch(`https://secure5.tranzila.com/${row.terminal_number}/json`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ TranzilaPW: row.api_key, tranmode: "VK" }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          success = resp.ok;
          message = success ? `חיבור ל-Tranzila הצליח - ${Date.now() - startTime}ms` : `שגיאה: ${resp.status}`;
        } catch (e: unknown) {
          message = `שגיאת חיבור: ${e instanceof Error ? e.message : String(e)}`;
          success = false;
        }
      }
    } else if (provider === "cardcom") {
      success = !!(row.terminal_number && row.api_key);
      message = success ? `הגדרות CardCom תקינות (טרמינל: ${row.terminal_number})` : "חסר מספר טרמינל או API Name";
    } else if (provider === "paypal") {
      success = !!(row.api_key && row.api_secret);
      message = success ? "הגדרות PayPal תקינות" : "חסר Client ID או Secret";
      if (success) {
        try {
          const baseUrl = row.is_test_mode ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
          const cred = Buffer.from(`${row.api_key}:${row.api_secret}`).toString("base64");
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const resp = await fetch(`${baseUrl}/v1/oauth2/token`, {
            method: "POST",
            headers: { "Authorization": `Basic ${cred}`, "Content-Type": "application/x-www-form-urlencoded" },
            body: "grant_type=client_credentials",
            signal: controller.signal,
          });
          clearTimeout(timeout);
          success = resp.ok;
          message = success ? `חיבור ל-PayPal הצליח - ${Date.now() - startTime}ms` : `שגיאה: ${resp.status}`;
        } catch (e: unknown) {
          message = `שגיאת חיבור: ${e instanceof Error ? e.message : String(e)}`;
          success = false;
        }
      }
    } else {
      message = `ספק לא מוכר: ${provider}`;
    }

    await pool.query("UPDATE israeli_payment_gateways SET last_transaction_at = NOW() WHERE id = $1", [String(req.params.id)]);
    await logSync(`payment-${provider}`, "test", success ? "completed" : "failed", { provider, responseTime: Date.now() - startTime });
    res.json({ success, message, responseTime: Date.now() - startTime });
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.post("/israeli-biz/payment/tokenize", async (req: Request, res: ExpressResponse) => {
  try {
    const { gatewayId } = req.body;
    if (!gatewayId) return res.status(400).json({ error: "חסר gatewayId" });
    const rawGw = await q1("SELECT * FROM israeli_payment_gateways WHERE id = $1 AND is_active = true", [gatewayId]);
    if (!rawGw) return res.status(404).json({ error: "שער תשלום לא נמצא או לא פעיל" });
    const gw = decryptRowCredentials(rawGw as Record<string, unknown>);
    const provider = String(gw.provider);

    if (provider === "tranzila") {
      res.json({
        redirectUrl: `https://direct.tranzila.com/${gw.terminal_number}/iframe.html`,
        provider,
        method: "redirect",
        instructions: "הפנה לקוח לעמוד הטוקניזציה של טרנזילה. הטוקן יוחזר ב-callback"
      });
    } else if (provider === "cardcom") {
      try {
        const body = {
          TerminalNumber: gw.terminal_number,
          ApiName: gw.api_key,
          ReturnValue: "Token",
          Operation: 4,
        };
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const resp = await fetch("https://secure.cardcom.solutions/api/v11/LowProfile/Create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const data = await resp.json() as Record<string, unknown>;
        if (data.LowProfileCode) {
          res.json({ redirectUrl: String(data.Url || ""), lowProfileCode: data.LowProfileCode, provider, method: "iframe" });
        } else {
          res.status(400).json({ error: `CardCom tokenize error: ${data.Description || "unknown"}` });
        }
      } catch (e: unknown) {
        res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
      }
    } else if (provider === "paypal") {
      res.json({ provider, method: "client_sdk", instructions: "השתמש ב-PayPal JS SDK ליצירת טוקן בצד הלקוח" });
    } else {
      res.status(400).json({ error: `ספק ${provider} אינו תומך בטוקניזציה` });
    }
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.post("/israeli-biz/payment/direct-debit", async (req: Request, res: ExpressResponse) => {
  try {
    const { gatewayId, amountAgorot, currency, bankCode, branchCode, accountNumber,
            customerName, customerIdNumber, description, linkedInvoiceId } = req.body;
    if (!gatewayId || !amountAgorot || !bankCode || !branchCode || !accountNumber) {
      res.status(400).json({ error: "נדרש gatewayId, amountAgorot, bankCode, branchCode, accountNumber" });
      return;
    }
    const rawGw = await q1("SELECT * FROM israeli_payment_gateways WHERE id = $1 AND is_active = true", [gatewayId]);
    if (!rawGw) { res.status(404).json({ error: "שער תשלום לא נמצא או לא פעיל" }); return; }
    const gw = decryptRowCredentials(rawGw as Record<string, unknown>);
    const provider = String(gw.provider);

    const externalId = `DD-${Date.now().toString(36).toUpperCase()}`;
    const status = "pending_approval";

    const r = await pool.query(
      `INSERT INTO israeli_payment_transactions
       (gateway_id, transaction_type, amount_agorot, currency, status, transaction_id_external,
        customer_name, customer_id_number, description, linked_invoice_id, raw_response)
       VALUES ($1, 'direct_debit', $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [gatewayId, amountAgorot, currency || "ILS", status, externalId,
       customerName || null, customerIdNumber || null,
       description || `חיוב הרשאה - ${bankCode}/${branchCode}/${accountNumber}`,
       linkedInvoiceId || null,
       JSON.stringify({ bankCode, branchCode, accountNumber, provider })]
    );

    await logSync(`payment-${provider}`, "direct-debit", "completed",
      { recordsProcessed: 1, amountAgorot, bankCode, branchCode });

    const txRow = r.rows[0] as Record<string, unknown>;
    delete txRow.card_token;
    delete txRow.raw_response;
    res.json({ success: true, transaction: txRow });
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.post("/israeli-biz/payment/charge", async (req: Request, res: ExpressResponse) => {
  try {
    const { gatewayId, amountAgorot, currency, cardToken, paypalOrderId,
            customerName, customerEmail, customerPhone, customerIdNumber, installments, description, linkedInvoiceId, linkedOrderId } = req.body;

    if (!gatewayId || !amountAgorot) return res.status(400).json({ error: "חסר gatewayId או סכום" });

    const rawGw = await q1("SELECT * FROM israeli_payment_gateways WHERE id = $1 AND is_active = true", [gatewayId]);
    if (!rawGw) return res.status(404).json({ error: "שער תשלום לא נמצא או לא פעיל" });
    const gw = decryptRowCredentials(rawGw as Record<string, unknown>);
    const provider = String(gw.provider);

    if (provider !== "paypal" && !cardToken) {
      return res.status(400).json({ error: "נדרש טוקן כרטיס (cardToken). יש לבצע טוקניזציה תחילה" });
    }

    let status = "pending";
    let approvalNumber = "";
    let externalTxId = "";
    let errorMessage = "";
    let rawResponse: Record<string, unknown> = {};
    const cardLast4 = cardToken ? String(cardToken).slice(-4) : "";

    if (provider === "tranzila") {
      try {
        const body: Record<string, unknown> = {
          TranzilaPW: gw.api_key,
          sum: Number(amountAgorot) / 100,
          currency: currency === "USD" ? 2 : 1,
          tranmode: "A",
          TranzilaTK: cardToken,
        };
        if (installments && installments > 1) { body.Installments = installments; }
        if (customerIdNumber) { body.contact = customerIdNumber; }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        const resp = await fetch(`https://secure5.tranzila.com/${gw.terminal_number}/json`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        rawResponse = await resp.json() as Record<string, unknown>;
        if (rawResponse.Response === "000" || rawResponse.Response === 0) {
          status = "approved";
          approvalNumber = String(rawResponse.ConfirmationCode || "");
          externalTxId = String(rawResponse.index || rawResponse.Index || "");
        } else {
          status = "declined";
          errorMessage = `Tranzila error: ${rawResponse.Response}`;
        }
      } catch (e: unknown) {
        status = "error";
        errorMessage = e instanceof Error ? e.message : String(e);
      }
    } else if (provider === "cardcom") {
      try {
        const body: Record<string, unknown> = {
          TerminalNumber: gw.terminal_number,
          ApiName: gw.api_key,
          SumToBill: Number(amountAgorot) / 100,
          CoinID: currency === "USD" ? 2 : 1,
          Operation: 1,
        };
        body.Token = cardToken;
        if (installments && installments > 1) { body.NumOfPayments = installments; }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        const resp = await fetch("https://secure.cardcom.solutions/api/v11/LowProfile/Create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        rawResponse = await resp.json() as Record<string, unknown>;
        if (rawResponse.ResponseCode === 0) {
          status = "approved";
          approvalNumber = String(rawResponse.ApprovalNumber || "");
          externalTxId = String(rawResponse.InternalDealNumber || "");
        } else {
          status = "declined";
          errorMessage = `CardCom: ${rawResponse.Description || rawResponse.ResponseCode}`;
        }
      } catch (e: unknown) {
        status = "error";
        errorMessage = e instanceof Error ? e.message : String(e);
      }
    } else if (provider === "paypal") {
      try {
        const baseUrl = gw.is_test_mode ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
        const cred = Buffer.from(`${gw.api_key}:${gw.api_secret}`).toString("base64");
        const tokenController = new AbortController();
        const tokenTimeout = setTimeout(() => tokenController.abort(), 15000);
        const tokenResp = await fetch(`${baseUrl}/v1/oauth2/token`, {
          method: "POST",
          headers: { "Authorization": `Basic ${cred}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: "grant_type=client_credentials",
          signal: tokenController.signal,
        });
        clearTimeout(tokenTimeout);
        if (!tokenResp.ok) {
          status = "error";
          errorMessage = `PayPal auth failed: ${tokenResp.status}`;
        } else {
          const tokenData = await tokenResp.json() as Record<string, unknown>;
          const accessToken = String(tokenData.access_token || "");

          if (paypalOrderId) {
            const captureController = new AbortController();
            const captureTimeout = setTimeout(() => captureController.abort(), 30000);
            const captureResp = await fetch(`${baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`, {
              method: "POST",
              headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
              signal: captureController.signal,
            });
            clearTimeout(captureTimeout);
            rawResponse = await captureResp.json() as Record<string, unknown>;
            if (captureResp.ok && rawResponse.status === "COMPLETED") {
              status = "approved";
              externalTxId = String(rawResponse.id || paypalOrderId);
              const captures = rawResponse.purchase_units as Array<Record<string, unknown>> | undefined;
              if (captures?.[0]) {
                const payments = captures[0].payments as Record<string, unknown> | undefined;
                const captureList = payments?.captures as Array<Record<string, unknown>> | undefined;
                approvalNumber = captureList?.[0]?.id ? String(captureList[0].id) : externalTxId;
              }
            } else {
              status = "error";
              errorMessage = `PayPal capture failed: ${captureResp.status}`;
            }
          } else {
            const orderBody = {
              intent: "CAPTURE",
              purchase_units: [{
                amount: { currency_code: currency || "ILS", value: (Number(amountAgorot) / 100).toFixed(2) },
                description: description || "Payment",
              }],
            };
            const orderController = new AbortController();
            const orderTimeout = setTimeout(() => orderController.abort(), 30000);
            const orderResp = await fetch(`${baseUrl}/v2/checkout/orders`, {
              method: "POST",
              headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
              body: JSON.stringify(orderBody),
              signal: orderController.signal,
            });
            clearTimeout(orderTimeout);
            rawResponse = await orderResp.json() as Record<string, unknown>;
            if (orderResp.ok && rawResponse.id) {
              status = "pending_approval";
              externalTxId = String(rawResponse.id);
              approvalNumber = externalTxId;
            } else {
              status = "error";
              errorMessage = `PayPal order create failed: ${orderResp.status}`;
            }
          }
        }
      } catch (e: unknown) {
        status = "error";
        errorMessage = e instanceof Error ? e.message : String(e);
      }
    } else {
      return res.status(400).json({ error: `ספק לא נתמך: ${provider}` });
    }

    const r = await pool.query(
      `INSERT INTO israeli_payment_transactions (gateway_id, transaction_type, amount_agorot, currency, status,
        card_last4, card_type, card_token, approval_number, transaction_id_external,
        customer_name, customer_email, customer_phone, customer_id_number,
        installments, description, error_message, raw_response, linked_invoice_id, linked_order_id)
       VALUES ($1,'charge',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [gatewayId, amountAgorot, currency || "ILS", status,
       cardLast4, "", cardToken || null, approvalNumber, externalTxId,
       customerName, customerEmail, customerPhone, customerIdNumber,
       installments || 1, description, errorMessage || null, JSON.stringify(rawResponse),
       linkedInvoiceId || null, linkedOrderId || null]
    );

    await pool.query("UPDATE israeli_payment_gateways SET last_transaction_at = NOW() WHERE id = $1", [gatewayId]);
    const chargeSuccess = status === "approved" || status === "pending_approval";
    await logSync(`payment-${provider}`, "charge", chargeSuccess ? "completed" : "failed",
      { recordsProcessed: chargeSuccess ? 1 : 0, recordsFailed: !chargeSuccess ? 1 : 0, amountAgorot, status });

    const txRow = r.rows[0] as Record<string, unknown>;
    delete txRow.card_token;
    delete txRow.raw_response;
    res.json({ success: chargeSuccess, transaction: txRow });
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.post("/israeli-biz/payment/refund", async (req: Request, res: ExpressResponse) => {
  try {
    const { transactionId, amountAgorot, reason } = req.body;
    if (!transactionId) return res.status(400).json({ error: "חסר transactionId" });

    const origTx = await q1("SELECT * FROM israeli_payment_transactions WHERE id = $1", [transactionId]);
    if (!origTx) return res.status(404).json({ error: "עסקה מקורית לא נמצאה" });
    if (origTx.status !== "approved" && origTx.status !== "pending_approval") {
      return res.status(400).json({ error: "ניתן לזכות רק עסקאות שאושרו" });
    }

    const refundAmount = amountAgorot || origTx.amount_agorot;
    const rawGw = await q1("SELECT * FROM israeli_payment_gateways WHERE id = $1", [origTx.gateway_id]);
    if (!rawGw) return res.status(404).json({ error: "שער תשלום לא נמצא" });
    const gw = decryptRowCredentials(rawGw as Record<string, unknown>);
    const provider = String(gw.provider);
    let refundStatus = "pending";
    let refundExternalId = "";
    let refundError = "";

    if (provider === "tranzila") {
      try {
        const body: Record<string, unknown> = {
          TranzilaPW: gw.api_key,
          sum: Number(refundAmount) / 100,
          currency: origTx.currency === "USD" ? 2 : 1,
          tranmode: "C",
          index: origTx.transaction_id_external,
        };
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        const resp = await fetch(`https://secure5.tranzila.com/${gw.terminal_number}/json`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const data = await resp.json() as Record<string, unknown>;
        if (data.Response === "000" || data.Response === 0) {
          refundStatus = "approved";
          refundExternalId = String(data.index || data.Index || "");
        } else {
          refundStatus = "declined";
          refundError = `Tranzila refund error: ${data.Response}`;
        }
      } catch (e: unknown) {
        refundStatus = "error";
        refundError = e instanceof Error ? e.message : String(e);
      }
    } else if (provider === "cardcom") {
      try {
        const body = {
          TerminalNumber: gw.terminal_number,
          ApiName: gw.api_key,
          SumToBill: Number(refundAmount) / 100,
          Operation: 2,
          DealNumber: origTx.transaction_id_external,
        };
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        const resp = await fetch("https://secure.cardcom.solutions/api/v11/LowProfile/Create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const data = await resp.json() as Record<string, unknown>;
        if (data.ResponseCode === 0) {
          refundStatus = "approved";
          refundExternalId = String(data.InternalDealNumber || "");
        } else {
          refundStatus = "declined";
          refundError = `CardCom refund: ${data.Description || data.ResponseCode}`;
        }
      } catch (e: unknown) {
        refundStatus = "error";
        refundError = e instanceof Error ? e.message : String(e);
      }
    } else if (provider === "paypal") {
      try {
        const baseUrl = gw.is_test_mode ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
        const cred = Buffer.from(`${gw.api_key}:${gw.api_secret}`).toString("base64");
        const tokenResp = await fetch(`${baseUrl}/v1/oauth2/token`, {
          method: "POST",
          headers: { "Authorization": `Basic ${cred}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: "grant_type=client_credentials",
        });
        if (tokenResp.ok) {
          const tokenData = await tokenResp.json() as Record<string, unknown>;
          const accessToken = String(tokenData.access_token || "");
          const captureId = origTx.approval_number || origTx.transaction_id_external;
          const refundResp = await fetch(`${baseUrl}/v2/payments/captures/${captureId}/refund`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              amount: { value: (Number(refundAmount) / 100).toFixed(2), currency_code: origTx.currency || "ILS" },
              note_to_payer: reason || "Refund",
            }),
          });
          const refundData = await refundResp.json() as Record<string, unknown>;
          if (refundResp.ok && refundData.status === "COMPLETED") {
            refundStatus = "approved";
            refundExternalId = String(refundData.id || "");
          } else {
            refundStatus = "declined";
            refundError = `PayPal refund: ${refundResp.status}`;
          }
        } else {
          refundStatus = "error";
          refundError = `PayPal auth failed: ${tokenResp.status}`;
        }
      } catch (e: unknown) {
        refundStatus = "error";
        refundError = e instanceof Error ? e.message : String(e);
      }
    } else {
      return res.status(400).json({ error: `ספק לא נתמך לזיכוי: ${provider}` });
    }

    const r = await pool.query(
      `INSERT INTO israeli_payment_transactions (gateway_id, transaction_type, amount_agorot, currency, status,
        card_last4, approval_number, transaction_id_external, customer_name, description, error_message, linked_invoice_id)
       VALUES ($1, 'refund', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [origTx.gateway_id, refundAmount, origTx.currency, refundStatus, origTx.card_last4,
       refundExternalId || `REF-${Date.now().toString(36).toUpperCase()}`, origTx.transaction_id_external,
       origTx.customer_name, reason || `זיכוי עבור עסקה ${origTx.id}`, refundError || null, origTx.linked_invoice_id]
    );

    if (refundStatus === "approved") {
      await pool.query("UPDATE israeli_payment_transactions SET status = 'refunded' WHERE id = $1", [transactionId]);
    }

    const success = refundStatus === "approved";
    await logSync(`payment-${provider}`, "refund", success ? "completed" : "failed",
      { recordsProcessed: success ? 1 : 0, recordsFailed: success ? 0 : 1, amountAgorot: refundAmount, originalTxId: transactionId, error: refundError || undefined });
    res.json({ success, refund: sanitizeGatewayRow(r.rows[0] as Record<string, unknown>) });
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.get("/israeli-biz/payment/transactions", async (req: Request, res: ExpressResponse) => {
  try {
    const { gatewayId, type, status: txStatus, limit = "100", offset = "0" } = req.query;
    let where = "WHERE 1=1";
    const params: unknown[] = [];
    let idx = 1;
    if (gatewayId) { where += ` AND t.gateway_id = $${idx++}`; params.push(String(gatewayId)); }
    if (type) { where += ` AND t.transaction_type = $${idx++}`; params.push(String(type)); }
    if (txStatus) { where += ` AND t.status = $${idx++}`; params.push(String(txStatus)); }
    const rows = await q(
      `SELECT t.id, t.gateway_id, t.transaction_type, t.amount_agorot, t.currency, t.status,
        t.card_last4, t.card_type, t.approval_number, t.transaction_id_external,
        t.customer_name, t.customer_email, t.customer_phone, t.customer_id_number,
        t.installments, t.description, t.error_message, t.linked_invoice_id, t.linked_order_id,
        t.created_at, t.updated_at,
        g.display_name as gateway_name, g.provider as gateway_provider
       FROM israeli_payment_transactions t
       LEFT JOIN israeli_payment_gateways g ON g.id = t.gateway_id
       ${where} ORDER BY t.created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, Math.min(Number(limit) || 100, 500), Math.max(Number(offset) || 0, 0)]
    );
    const countR = await q1(`SELECT COUNT(*) as total FROM israeli_payment_transactions t ${where}`, params);
    res.json({ data: rows, total: Number(countR?.total || 0) });
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});


router.get("/israeli-biz/tax/reports", async (_req: Request, res: ExpressResponse) => {
  try {
    const rows = await q("SELECT * FROM israeli_tax_reports ORDER BY created_at DESC");
    res.json(rows);
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.post("/israeli-biz/tax/reports/generate", async (req: Request, res: ExpressResponse) => {
  try {
    const { reportType, taxYear, taxMonth } = req.body;
    if (!reportType) return res.status(400).json({ error: "חסר סוג דוח" });

    const year = taxYear || new Date().getFullYear();
    const month = taxMonth || new Date().getMonth() + 1;
    const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const periodEnd = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;

    let salesAgorot = 0;
    let purchasesAgorot = 0;
    let vatOnSales = 0;
    let vatOnPurchases = 0;
    let withholdingTax = 0;

    if (reportType === "vat" || reportType === "vat_detailed") {
      const salesData = await q1(
        `SELECT COALESCE(SUM(COALESCE(total_with_vat, amount, 0)),0) as total_sales,
                COALESCE(SUM(COALESCE(vat_amount, 0)),0) as total_vat
         FROM income_documents WHERE invoice_date >= $1 AND invoice_date < $2 AND status NOT IN ('cancelled','draft')`,
        [periodStart, periodEnd]
      );
      const purchaseData = await q1(
        `SELECT COALESCE(SUM(COALESCE(amount, 0)),0) as total_purchases,
                COALESCE(SUM(COALESCE(vat_amount, amount * ${VAT_RATE}, 0)),0) as total_vat
         FROM accounts_payable WHERE invoice_date >= $1 AND invoice_date < $2 AND status NOT IN ('cancelled')`,
        [periodStart, periodEnd]
      );
      salesAgorot = Math.round(Number(salesData?.total_sales || 0) * 100);
      purchasesAgorot = Math.round(Number(purchaseData?.total_purchases || 0) * 100);
      vatOnSales = Math.round(Number(salesData?.total_vat || 0) * 100);
      vatOnPurchases = Math.round(Number(purchaseData?.total_vat || 0) * 100);
    }

    if (reportType === "withholding" || reportType === "withholding_856") {
      const whData = await q1(
        `SELECT COALESCE(SUM(COALESCE(amount, 0)),0) as total FROM withholding_tax WHERE created_at >= $1 AND created_at < $2`,
        [periodStart, periodEnd]
      );
      withholdingTax = Math.round(Number(whData?.total || 0) * 100);
    }

    const vatPayable = vatOnSales - vatOnPurchases;
    const reportPeriod = `${year}-${String(month).padStart(2, "0")}`;

    const r = await pool.query(
      `INSERT INTO israeli_tax_reports (report_type, report_period, tax_year, tax_month,
        total_sales_agorot, total_purchases_agorot, vat_on_sales_agorot, vat_on_purchases_agorot,
        vat_payable_agorot, withholding_tax_agorot, report_data, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft', $12) RETURNING *`,
      [reportType, reportPeriod, year, month,
       salesAgorot, purchasesAgorot, vatOnSales, vatOnPurchases,
       vatPayable, withholdingTax,
       JSON.stringify({ periodStart, periodEnd, generatedAt: new Date().toISOString() }),
       req.userId || null]
    );

    await logSync("tax-reports", "generate", "completed", { recordsProcessed: 1, reportType, reportPeriod });
    res.json({ success: true, report: r.rows[0] });
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.put("/israeli-biz/tax/reports/:id/status", async (req: Request, res: ExpressResponse) => {
  try {
    const { status, confirmationNumber } = req.body;
    const sets = ["status = $1", "updated_at = NOW()"];
    const vals: unknown[] = [status];
    if (status === "submitted") { sets.push("submitted_at = NOW()"); }
    if (confirmationNumber) { sets.push(`confirmation_number = $${vals.length + 1}`); vals.push(confirmationNumber); }
    vals.push(String(req.params.id));
    const r = await pool.query(`UPDATE israeli_tax_reports SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING *`, vals);
    if (!r.rows[0]) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});


router.get("/israeli-biz/sync-history", async (req: Request, res: ExpressResponse) => {
  try {
    const { source, limit = "50", offset = "0" } = req.query;
    let where = "";
    const params: unknown[] = [];
    if (source) { where = "WHERE source = $1"; params.push(String(source)); }
    const rows = await q(
      `SELECT * FROM israeli_sync_history ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, Math.min(Number(limit) || 50, 200), Math.max(Number(offset) || 0, 0)]
    );
    const countR = await q1(`SELECT COUNT(*) as total FROM israeli_sync_history ${where}`, params);
    res.json({ data: rows, total: Number(countR?.total || 0) });
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.get("/israeli-biz/dashboard", async (_req: Request, res: ExpressResponse) => {
  try {
    const [accountingCount, bankCount, gatewayCount, recentTxCount, unreconciledCount, pendingTaxCount, masavCount] = await Promise.all([
      q1("SELECT COUNT(*) as c FROM israeli_accounting_connectors WHERE is_active = true"),
      q1("SELECT COUNT(*) as c FROM israeli_bank_connections WHERE is_active = true"),
      q1("SELECT COUNT(*) as c FROM israeli_payment_gateways WHERE is_active = true"),
      q1("SELECT COUNT(*) as c FROM israeli_payment_transactions WHERE created_at >= NOW() - INTERVAL '30 days'"),
      q1("SELECT COUNT(*) as c FROM israeli_bank_transactions WHERE reconciliation_status = 'unmatched'"),
      q1("SELECT COUNT(*) as c FROM israeli_tax_reports WHERE status = 'draft'"),
      q1("SELECT COUNT(*) as c FROM israeli_masav_files WHERE status = 'draft'"),
    ]);
    res.json({
      accountingConnectors: Number(accountingCount?.c || 0),
      bankConnections: Number(bankCount?.c || 0),
      paymentGateways: Number(gatewayCount?.c || 0),
      recentTransactions: Number(recentTxCount?.c || 0),
      unreconciledTransactions: Number(unreconciledCount?.c || 0),
      pendingTaxReports: Number(pendingTaxCount?.c || 0),
      draftMasavFiles: Number(masavCount?.c || 0),
    });
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

export default router;
