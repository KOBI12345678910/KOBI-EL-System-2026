import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";

interface AuthRequest extends Request {
  user?: { id: number; username: string; role?: string };
}

const router = Router();

async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  req.user = result.user;
  next();
}

router.use("/documents", requireAuth as any);

// ── Auto-create tables ──
async function ensureTables() {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS document_templates (
      id SERIAL PRIMARY KEY,
      template_name VARCHAR(255) NOT NULL,
      template_type VARCHAR(32) DEFAULT 'quote' CHECK (template_type IN ('quote','invoice','contract','work_order','delivery_note','measurement_report','installation_report','warranty_certificate','receipt')),
      content_html TEXT,
      variables JSONB DEFAULT '[]'::jsonb,
      header_html TEXT,
      footer_html TEXT,
      css TEXT,
      language VARCHAR(8) DEFAULT 'he',
      version INT DEFAULT 1,
      status VARCHAR(12) DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS generated_documents (
      id SERIAL PRIMARY KEY,
      template_id INT REFERENCES document_templates(id),
      entity_type VARCHAR(64),
      entity_id INT,
      title VARCHAR(255),
      generated_html TEXT,
      pdf_url TEXT,
      variables_used JSONB DEFAULT '{}'::jsonb,
      generated_by INT,
      sent_to_email VARCHAR(255),
      sent_to_whatsapp VARCHAR(32),
      status VARCHAR(16) DEFAULT 'generated' CHECK (status IN ('generated','sent','viewed','signed')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS document_signatures (
      id SERIAL PRIMARY KEY,
      document_id INT NOT NULL REFERENCES generated_documents(id) ON DELETE CASCADE,
      signer_name VARCHAR(255),
      signer_email VARCHAR(255),
      signer_phone VARCHAR(32),
      signer_role VARCHAR(24) DEFAULT 'customer' CHECK (signer_role IN ('customer','employee','supplier','contractor')),
      signature_data TEXT,
      signed_at TIMESTAMPTZ,
      ip_address VARCHAR(64),
      status VARCHAR(12) DEFAULT 'pending' CHECK (status IN ('pending','signed','declined'))
    );
  `));
}
ensureTables().catch(e => console.error("document-templates table init error:", e));

interface QRow { [key: string]: unknown }
async function q(query: string): Promise<QRow[]> {
  try { const r = await db.execute(sql.raw(query)); return (r.rows || []) as QRow[]; }
  catch (e: any) { console.error("document-templates query error:", e.message); return []; }
}

// ── Templates CRUD ──
router.get("/documents/templates", async (req: Request, res: Response) => {
  try {
    const { type, status } = req.query;
    let where = "WHERE 1=1";
    if (type) where += ` AND template_type = '${type}'`;
    if (status) where += ` AND status = '${status}'`;
    const rows = await q(`SELECT * FROM document_templates ${where} ORDER BY created_at DESC`);
    res.json({ templates: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/documents/templates/:id", async (req: Request, res: Response) => {
  try {
    const rows = await q(`SELECT * FROM document_templates WHERE id = ${Number(req.params.id)}`);
    if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ template: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/documents/templates", async (req: Request, res: Response) => {
  try {
    const { template_name, template_type, content_html, variables, header_html, footer_html, css, language } = req.body;
    const rows = await q(`
      INSERT INTO document_templates (template_name, template_type, content_html, variables, header_html, footer_html, css, language)
      VALUES ('${(template_name||'').replace(/'/g,"''")}', '${template_type||'quote'}',
        '${(content_html||'').replace(/'/g,"''")}', '${JSON.stringify(variables||[])}',
        ${header_html ? `'${header_html.replace(/'/g,"''")}'` : 'NULL'},
        ${footer_html ? `'${footer_html.replace(/'/g,"''")}'` : 'NULL'},
        ${css ? `'${css.replace(/'/g,"''")}'` : 'NULL'}, '${language||'he'}')
      RETURNING *
    `);
    res.json({ template: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/documents/templates/:id", async (req: Request, res: Response) => {
  try {
    const { template_name, template_type, content_html, variables, header_html, footer_html, css, language, status } = req.body;
    const sets: string[] = [];
    if (template_name) sets.push(`template_name = '${template_name.replace(/'/g,"''")}'`);
    if (template_type) sets.push(`template_type = '${template_type}'`);
    if (content_html !== undefined) sets.push(`content_html = '${content_html.replace(/'/g,"''")}'`);
    if (variables) sets.push(`variables = '${JSON.stringify(variables)}'`);
    if (header_html !== undefined) sets.push(`header_html = '${header_html.replace(/'/g,"''")}'`);
    if (footer_html !== undefined) sets.push(`footer_html = '${footer_html.replace(/'/g,"''")}'`);
    if (css !== undefined) sets.push(`css = '${css.replace(/'/g,"''")}'`);
    if (language) sets.push(`language = '${language}'`);
    if (status) sets.push(`status = '${status}'`);
    sets.push("version = version + 1");
    const rows = await q(`UPDATE document_templates SET ${sets.join(", ")} WHERE id = ${Number(req.params.id)} RETURNING *`);
    res.json({ template: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/documents/templates/:id", async (req: Request, res: Response) => {
  try { await q(`UPDATE document_templates SET status = 'archived' WHERE id = ${Number(req.params.id)}`); res.json({ success: true }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Generate document ──
router.post("/documents/generate", async (req: Request, res: Response) => {
  try {
    const { template_id, entity_type, entity_id, title, variables } = req.body;
    if (!template_id) { res.status(400).json({ error: "template_id required" }); return; }
    const tmpl = await q(`SELECT * FROM document_templates WHERE id = ${template_id}`);
    if (!tmpl.length) { res.status(404).json({ error: "Template not found" }); return; }
    const t = tmpl[0];
    let html = String(t.content_html || "");
    const vars = variables || {};
    // Replace variables {{var_name}} in template
    for (const [key, val] of Object.entries(vars)) {
      html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(val));
    }
    const headerHtml = String(t.header_html || "");
    const footerHtml = String(t.footer_html || "");
    const cssText = String(t.css || "");
    const fullHtml = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><style>${cssText}</style></head><body>${headerHtml}${html}${footerHtml}</body></html>`;
    const user = (req as AuthRequest).user;
    const rows = await q(`
      INSERT INTO generated_documents (template_id, entity_type, entity_id, title, generated_html, variables_used, generated_by)
      VALUES (${template_id}, ${entity_type ? `'${entity_type}'` : 'NULL'}, ${entity_id || 'NULL'},
        '${(title||'מסמך').replace(/'/g,"''")}', '${fullHtml.replace(/'/g,"''")}',
        '${JSON.stringify(vars)}', ${user?.id || 'NULL'})
      RETURNING *
    `);
    res.json({ document: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Generated documents list ──
router.get("/documents/generated", async (req: Request, res: Response) => {
  try {
    const { status, entity_type, template_id } = req.query;
    let where = "WHERE 1=1";
    if (status) where += ` AND d.status = '${status}'`;
    if (entity_type) where += ` AND d.entity_type = '${entity_type}'`;
    if (template_id) where += ` AND d.template_id = ${Number(template_id)}`;
    const rows = await q(`
      SELECT d.*, t.template_name, t.template_type
      FROM generated_documents d
      LEFT JOIN document_templates t ON t.id = d.template_id
      ${where}
      ORDER BY d.created_at DESC LIMIT 200
    `);
    res.json({ documents: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/documents/generated/:id", async (req: Request, res: Response) => {
  try {
    const rows = await q(`
      SELECT d.*, t.template_name, t.template_type
      FROM generated_documents d
      LEFT JOIN document_templates t ON t.id = d.template_id
      WHERE d.id = ${Number(req.params.id)}
    `);
    if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ document: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Send document ──
router.post("/documents/send/:documentId", async (req: Request, res: Response) => {
  try {
    const did = Number(req.params.documentId);
    const { email, whatsapp } = req.body;
    const sets: string[] = ["status = 'sent'"];
    if (email) sets.push(`sent_to_email = '${email}'`);
    if (whatsapp) sets.push(`sent_to_whatsapp = '${whatsapp}'`);
    const rows = await q(`UPDATE generated_documents SET ${sets.join(", ")} WHERE id = ${did} RETURNING *`);
    res.json({ document: rows[0], sent_via: email ? "email" : "whatsapp" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Sign document ──
router.post("/documents/sign/:documentId", async (req: Request, res: Response) => {
  try {
    const did = Number(req.params.documentId);
    const { signer_name, signer_email, signer_phone, signer_role, signature_data, ip_address } = req.body;
    const rows = await q(`
      INSERT INTO document_signatures (document_id, signer_name, signer_email, signer_phone, signer_role, signature_data, signed_at, ip_address, status)
      VALUES (${did}, '${(signer_name||'').replace(/'/g,"''")}', ${signer_email ? `'${signer_email}'` : 'NULL'},
        ${signer_phone ? `'${signer_phone}'` : 'NULL'}, '${signer_role||'customer'}',
        '${(signature_data||'').replace(/'/g,"''")}', NOW(), ${ip_address ? `'${ip_address}'` : 'NULL'}, 'signed')
      RETURNING *
    `);
    await q(`UPDATE generated_documents SET status = 'signed' WHERE id = ${did}`);
    res.json({ signature: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Get signatures ──
router.get("/documents/signatures/:documentId", async (req: Request, res: Response) => {
  try {
    const rows = await q(`SELECT * FROM document_signatures WHERE document_id = ${Number(req.params.documentId)} ORDER BY signed_at DESC`);
    res.json({ signatures: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Generate PDF (simulate) ──
router.post("/documents/pdf/:documentId", async (req: Request, res: Response) => {
  try {
    const did = Number(req.params.documentId);
    const pdfUrl = `/api/documents/pdf-file/${did}.pdf`;
    await q(`UPDATE generated_documents SET pdf_url = '${pdfUrl}' WHERE id = ${did}`);
    res.json({ pdf_url: pdfUrl, status: "generated" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Dashboard ──
router.get("/documents/dashboard", async (_req: Request, res: Response) => {
  try {
    const totalTemplates = await q(`SELECT COUNT(*)::int as count FROM document_templates WHERE status != 'archived'`);
    const totalGenerated = await q(`SELECT COUNT(*)::int as count FROM generated_documents`);
    const todayGenerated = await q(`SELECT COUNT(*)::int as count FROM generated_documents WHERE created_at >= CURRENT_DATE`);
    const byType = await q(`SELECT t.template_type, COUNT(d.id)::int as count FROM generated_documents d JOIN document_templates t ON t.id = d.template_id GROUP BY t.template_type ORDER BY count DESC`);
    const byStatus = await q(`SELECT status, COUNT(*)::int as count FROM generated_documents GROUP BY status`);
    const pendingSigs = await q(`SELECT COUNT(*)::int as count FROM document_signatures WHERE status = 'pending'`);
    const signedToday = await q(`SELECT COUNT(*)::int as count FROM document_signatures WHERE status = 'signed' AND signed_at >= CURRENT_DATE`);
    res.json({
      total_templates: Number(totalTemplates[0]?.count) || 0,
      total_generated: Number(totalGenerated[0]?.count) || 0,
      generated_today: Number(todayGenerated[0]?.count) || 0,
      documents_by_type: byType,
      documents_by_status: byStatus,
      pending_signatures: Number(pendingSigs[0]?.count) || 0,
      signed_today: Number(signedToday[0]?.count) || 0,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
