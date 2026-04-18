import express, { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { pool } from "@workspace/db";
import { sql } from "drizzle-orm";
import crypto from "crypto";
import PDFDocument from "pdfkit";

const router: IRouter = Router();
const logger = console;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function requireAuth(req: Request, res: Response): string | null {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return userId;
}

const PUBLIC_PATHS = [
  "/e-signature/sign/",
  "/e-signature/decline/",
  "/e-signature-webhook/",
];

router.use((req: Request, res: Response, next: any) => {
  const isPublic = PUBLIC_PATHS.some(p => req.path.startsWith(p));
  if (isPublic) return next();
  if (!req.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
});

function generateInvitationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

interface SignerInviteParams {
  workflowId: number;
  signatureId: number;
  contractId?: number | null;
  signeeName: string;
  signeeEmail: string;
  signatureField: string;
  provider: string;
  invitationToken: string;
  expiresAt: Date;
}

async function getContractDocumentBase64(contractId: number | null): Promise<string> {
  if (!contractId) {
    const placeholder = `<html><body dir="rtl"><h1>מסמך חוזה</h1><p>מסמך זה דורש חתימה.</p></body></html>`;
    return Buffer.from(placeholder).toString("base64");
  }
  const contractRow = await db.execute(
    sql`SELECT c.contract_number, c.title, c.description, c.vendor, c.customer, c.amount, c.currency,
               c.start_date, c.end_date, c.contract_type, c.metadata, c.created_at,
               csig.workflow_id,
               esw.template_id
        FROM contracts c
        LEFT JOIN contract_signatures csig ON csig.contract_id = c.id
        LEFT JOIN e_signature_workflow esw ON esw.id = csig.workflow_id
        WHERE c.id = ${contractId}
        LIMIT 1`
  ).catch(() => ({ rows: [] }));
  if ((contractRow as { rows: unknown[] }).rows.length > 0) {
    const c = (contractRow as { rows: unknown[] }).rows[0] as {
      contract_number?: string; title?: string; description?: string; vendor?: string;
      customer?: string; amount?: string; currency?: string; start_date?: string;
      end_date?: string; contract_type?: string; metadata?: unknown; created_at?: string;
      template_id?: number;
    };
    const mergeData: Record<string, string> = {
      contract_number: c.contract_number || "",
      contract_date: c.created_at ? new Date(c.created_at).toLocaleDateString("he-IL") : new Date().toLocaleDateString("he-IL"),
      contract_value: c.amount ? String(c.amount) : "",
      currency: c.currency || "₪",
      start_date: c.start_date || "",
      end_date: c.end_date || "",
      customer_name: c.customer || "",
      supplier_name: c.vendor || "",
      company_name: c.vendor || "",
      title: c.title || "",
    };
    const metadata = c.metadata ? (typeof c.metadata === "string" ? JSON.parse(c.metadata) : c.metadata) as Record<string, string> : {};
    Object.assign(mergeData, metadata);
    let content: string;
    if (c.template_id) {
      const tplRow = await db.execute(sql`SELECT template_content FROM contract_templates WHERE id = ${c.template_id}`).catch(() => ({ rows: [] }));
      const tpl = (tplRow as { rows: unknown[] }).rows[0] as { template_content?: string } | undefined;
      content = tpl?.template_content || `<html><body dir="rtl"><h1>${c.title || "מסמך חוזה"}</h1><p>${c.description || ""}</p></body></html>`;
    } else {
      content = `<html><body dir="rtl"><h1>${c.title || "מסמך חוזה"}</h1><p>חוזה מס': ${mergeData.contract_number}</p><p>לקוח: ${mergeData.customer_name}</p><p>ספק: ${mergeData.supplier_name}</p><p>ערך: ${mergeData.contract_value} ${mergeData.currency}</p></body></html>`;
    }
    for (const [k, v] of Object.entries(mergeData)) {
      content = content.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
    }
    return Buffer.from(content).toString("base64");
  }
  return Buffer.from("<html><body dir=\"rtl\"><h1>מסמך חוזה</h1><p>מסמך זה דורש חתימה.</p></body></html>").toString("base64");
}

async function invokeDocuSignApi(params: SignerInviteParams, apiKey: string, accountId: string): Promise<{ externalId: string }> {
  const envelopeId = `ds_env_${crypto.randomBytes(16).toString("hex")}`;
  const signingUrl = `${process.env.APP_BASE_URL || ""}/api/e-signature/sign/${params.invitationToken}`;
  const documentBase64 = await getContractDocumentBase64(params.contractId || null);
  const envelopePayload = {
    emailSubject: `חתימה נדרשת: ${params.signatureField}`,
    status: "sent",
    recipients: {
      signers: [{
        email: params.signeeEmail,
        name: params.signeeName,
        recipientId: "1",
        routingOrder: "1",
        clientUserId: String(params.signatureId),
        embeddedRecipientStartURL: signingUrl,
        tabs: {
          signHereTabs: [{ anchorString: `{{${params.signatureField}}}`, anchorYOffset: "0", anchorXOffset: "0", anchorUnits: "pixels" }],
        },
      }],
    },
    documents: [{ documentId: "1", name: "contract.html", fileExtension: "html", documentBase64 }],
  };
  const baseUrl = process.env.DOCUSIGN_API_BASE_URL || "https://demo.docusign.net/restapi";
  const response = await fetch(`${baseUrl}/v2.1/accounts/${accountId}/envelopes`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(envelopePayload),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DocuSign API error: ${response.status} ${err}`);
  }
  const data = await response.json();
  return { externalId: (data as { envelopeId?: string }).envelopeId || envelopeId };
}

async function invokeAdobeSignApi(params: SignerInviteParams, apiKey: string): Promise<{ externalId: string }> {
  const signingUrl = `${process.env.APP_BASE_URL || ""}/api/e-signature/sign/${params.invitationToken}`;
  const baseUrl = process.env.ADOBE_SIGN_API_BASE_URL || "https://api.na4.adobesign.com/api/rest/v6";

  const documentBase64 = await getContractDocumentBase64(params.contractId || null);
  const documentBuffer = Buffer.from(documentBase64, "base64");
  const formData = new FormData();
  formData.append("File", new Blob([documentBuffer], { type: "text/html" }), "contract.html");
  formData.append("Mime-Type", "text/html");
  formData.append("File-Name", "contract.html");
  const transientUpload = await fetch(`${baseUrl}/transientDocuments`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
    body: formData,
  });

  let fileInfos: Array<{ transientDocumentId?: string; url?: string }> = [];
  if (transientUpload.ok) {
    const td = await transientUpload.json() as { transientDocumentId?: string };
    if (td.transientDocumentId) fileInfos = [{ transientDocumentId: td.transientDocumentId }];
  }
  if (fileInfos.length === 0) {
    fileInfos = [{ url: `${process.env.APP_BASE_URL || ""}/contract-preview/${params.workflowId}` }];
  }

  const agreementPayload = {
    name: `חתימה — ${params.signatureField}`,
    state: "IN_PROCESS",
    participantSetsInfo: [{
      order: 1,
      role: "SIGNER",
      memberInfos: [{ email: params.signeeEmail, name: params.signeeName }],
    }],
    fileInfos,
    signatureType: "ESIGN",
    redirectUri: signingUrl,
  };
  const response = await fetch(`${baseUrl}/agreements`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(agreementPayload),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Adobe Sign API error: ${response.status} ${err}`);
  }
  const data = await response.json() as { id?: string };
  return { externalId: data.id || `adobe_agr_${crypto.randomBytes(16).toString("hex")}` };
}

async function invokeGovIlEsignApi(params: SignerInviteParams, endpoint: string): Promise<{ externalId: string }> {
  const sessionId = `govil_${crypto.randomBytes(16).toString("hex")}`;
  const signingUrl = `${process.env.APP_BASE_URL || ""}/api/e-signature/sign/${params.invitationToken}`;
  const sessionPayload = {
    signeeEmail: params.signeeEmail,
    signeeName: params.signeeName,
    callbackUrl: signingUrl,
    sessionId,
    signatureField: params.signatureField,
    workflowId: params.workflowId,
  };
  const response = await fetch(`${endpoint}/initiate-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Gov-API-Key": process.env.GOV_IL_API_KEY || "" },
    body: JSON.stringify(sessionPayload),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`gov.il e-sign API error: ${response.status} ${err}`);
  }
  const data = await response.json() as { sessionId?: string };
  return { externalId: data.sessionId || sessionId };
}

async function sendProviderInvite(params: SignerInviteParams): Promise<{ externalId?: string; providerStatus: string }> {
  const { provider, signeeEmail, invitationToken, workflowId } = params;
  const signingUrl = `${process.env.APP_BASE_URL || "https://app.example.com"}/api/e-signature/sign/${invitationToken}`;

  switch (provider) {
    case "docusign": {
      const apiKey = process.env.DOCUSIGN_API_KEY;
      const accountId = process.env.DOCUSIGN_ACCOUNT_ID;
      if (!apiKey || !accountId) {
        throw new Error(
          "DocuSign is not configured: DOCUSIGN_API_KEY and DOCUSIGN_ACCOUNT_ID environment variables are required. " +
          "Set these in your environment or choose 'local' provider instead."
        );
      }
      const { externalId } = await invokeDocuSignApi(params, apiKey, accountId);
      logger.info(`[E-Sign] DocuSign: envelope created ${externalId} for ${signeeEmail}, workflow ${workflowId}`);
      return { externalId, providerStatus: "sent" };
    }

    case "adobe_sign": {
      const apiKey = process.env.ADOBE_SIGN_API_KEY;
      if (!apiKey) {
        throw new Error(
          "Adobe Sign is not configured: ADOBE_SIGN_API_KEY environment variable is required. " +
          "Set this in your environment or choose 'local' provider instead."
        );
      }
      const { externalId } = await invokeAdobeSignApi(params, apiKey);
      logger.info(`[E-Sign] Adobe Sign: agreement created ${externalId} for ${signeeEmail}, workflow ${workflowId}`);
      return { externalId, providerStatus: "sent" };
    }

    case "gov_il": {
      const govIlEndpoint = process.env.GOV_IL_ESIGN_ENDPOINT;
      if (!govIlEndpoint) {
        throw new Error(
          "gov.il e-signature is not configured: GOV_IL_ESIGN_ENDPOINT environment variable is required. " +
          "Set this in your environment or choose 'local' provider instead."
        );
      }
      const { externalId } = await invokeGovIlEsignApi(params, govIlEndpoint);
      logger.info(`[E-Sign] gov.il: session initiated ${externalId} for ${signeeEmail}, workflow ${workflowId}`);
      return { externalId, providerStatus: "awaiting_id_auth" };
    }

    case "local":
    default: {
      logger.info(`[E-Sign] Local: invitation link generated for ${signeeEmail}: ${signingUrl}`);
      return { providerStatus: "invited" };
    }
  }
}

function timingSafeHexCompare(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a, "hex");
    const bBuf = Buffer.from(b, "hex");
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

function verifyDocuSignWebhook(req: Request, rawBody: string): boolean {
  const secret = process.env.DOCUSIGN_HMAC_KEY || process.env.ESIGN_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("[E-Sign Webhook] DocuSign: DOCUSIGN_HMAC_KEY not set — rejecting webhook");
    return false;
  }
  const header = (req.headers["x-docusign-signature-1"] || "") as string;
  if (!header) {
    logger.warn("[E-Sign Webhook] DocuSign: x-docusign-signature-1 header missing");
    return false;
  }
  const expectedHmac = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  return expectedHmac === header;
}

function verifyAdobeSignWebhook(req: Request, rawBody: string): boolean {
  const secret = process.env.ADOBE_SIGN_WEBHOOK_SECRET || process.env.ESIGN_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("[E-Sign Webhook] Adobe Sign: ADOBE_SIGN_WEBHOOK_SECRET not set — rejecting webhook");
    return false;
  }
  const header = (req.headers["x-adobesign-clientid"] || "") as string;
  const xSignature = (req.headers["x-adobe-signature"] || "") as string;
  if (!xSignature) {
    if (!header) {
      logger.warn("[E-Sign Webhook] Adobe Sign: no signature header present");
      return false;
    }
    const expectedId = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    return timingSafeHexCompare(expectedId, header);
  }
  const expectedHmac = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return timingSafeHexCompare(expectedHmac, xSignature);
}

function verifyGovIlWebhook(req: Request, rawBody: string): boolean {
  const secret = process.env.GOV_IL_WEBHOOK_SECRET || process.env.ESIGN_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("[E-Sign Webhook] gov.il: GOV_IL_WEBHOOK_SECRET not set — rejecting webhook");
    return false;
  }
  const header = (req.headers["x-govil-signature"] || "") as string;
  if (!header) {
    logger.warn("[E-Sign Webhook] gov.il: x-govil-signature header missing");
    return false;
  }
  const expectedHmac = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return timingSafeHexCompare(expectedHmac, header);
}

function verifyWebhookSignature(provider: string, req: Request, rawBody: string): boolean {
  switch (provider) {
    case "docusign":
      return verifyDocuSignWebhook(req, rawBody);
    case "adobe_sign":
      return verifyAdobeSignWebhook(req, rawBody);
    case "gov_il":
      return verifyGovIlWebhook(req, rawBody);
    default: {
      const secret = process.env.ESIGN_WEBHOOK_SECRET;
      if (!secret) {
        logger.error(`[E-Sign Webhook] Unknown provider ${provider}: ESIGN_WEBHOOK_SECRET not set — rejecting`);
        return false;
      }
      const header = (req.headers["x-signature"] || "") as string;
      if (!header) {
        logger.warn(`[E-Sign Webhook] Unknown provider ${provider}: x-signature header missing`);
        return false;
      }
      const expectedHmac = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
      return timingSafeHexCompare(expectedHmac, header);
    }
  }
}

type WebhookSigInfo = {
  id: number; workflow_id: number | null; contract_id: number | null;
  signee_name: string; signee_email: string;
  template_id: number | null; workflow_name: string | null;
};

async function generateSignedDocHtmlForWebhook(sig: WebhookSigInfo, provider: string): Promise<string> {
  const timestamp = new Date().toISOString();
  const footer = `<hr/><p style="font-size:11px;color:#666;text-align:center">נחתם דיגיטלית דרך ${provider} | ${timestamp} | חותם: ${sig.signee_name}</p>`;

  if (sig.contract_id) {
    const contractRow = await db.execute(
      sql`SELECT c.contract_number, c.title, c.description, c.vendor, c.customer,
                 c.amount, c.currency, c.start_date, c.end_date, c.metadata, c.created_at
          FROM contracts c WHERE c.id = ${sig.contract_id}`
    ).catch(() => ({ rows: [] as unknown[] }));
    type ContractRow = { contract_number?: string; title?: string; description?: string; vendor?: string; customer?: string; amount?: number; currency?: string; start_date?: string; end_date?: string; metadata?: unknown; created_at?: string };
    if (contractRow.rows.length > 0) {
      const c = contractRow.rows[0] as ContractRow;
      const mergeData: Record<string, string> = {
        contract_number: c.contract_number || "", contract_date: c.created_at ? new Date(c.created_at).toLocaleDateString("he-IL") : "",
        contract_value: c.amount ? String(c.amount) : "", currency: c.currency || "₪",
        start_date: c.start_date || "", end_date: c.end_date || "",
        customer_name: c.customer || "", supplier_name: c.vendor || "",
      };
      const metadata = c.metadata ? (typeof c.metadata === "string" ? JSON.parse(c.metadata) : c.metadata) as Record<string, string> : {};
      Object.assign(mergeData, metadata);
      let content: string;
      if (sig.template_id) {
        const tplRow = await db.execute(sql`SELECT template_content FROM contract_templates WHERE id = ${sig.template_id}`).catch(() => ({ rows: [] as unknown[] }));
        const tpl = tplRow.rows[0] as { template_content?: string } | undefined;
        content = tpl?.template_content || `<html><body dir="rtl"><h1>${c.title || "מסמך חוזה"}</h1><p>${c.description || ""}</p></body></html>`;
      } else {
        content = `<html><body dir="rtl"><h1>${c.title || "מסמך חוזה"}</h1><p>חוזה מס': ${mergeData.contract_number}</p><p>לקוח: ${mergeData.customer_name}</p><p>ספק: ${mergeData.supplier_name}</p><p>ערך: ${mergeData.contract_value} ${mergeData.currency}</p></body></html>`;
      }
      for (const [k, v] of Object.entries(mergeData)) {
        content = content.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
      }
      return `${content}${footer}`;
    }
  }

  if (sig.template_id) {
    const tplRow = await db.execute(sql`SELECT template_content, name FROM contract_templates WHERE id = ${sig.template_id}`).catch(() => ({ rows: [] as unknown[] }));
    const tpl = tplRow.rows[0] as { template_content?: string; name?: string } | undefined;
    if (tpl?.template_content) {
      return `${tpl.template_content}${footer}`;
    }
  }

  return `<html><body dir="rtl" style="font-family:Arial;padding:40px"><h1>אישור חתימה דיגיטלית</h1><p>חותם: ${sig.signee_name} (${sig.signee_email})</p><p>תאריך: ${timestamp}</p><p>ספק חתימה: ${provider}</p><p>תהליך: ${sig.workflow_name || ""}</p>${footer}</body></html>`;
}

export async function eSignatureWebhookHandler(req: Request, res: Response): Promise<void> {
  const { provider } = req.params as { provider: string };
  try {
    const rawBodyBuffer = (req as Request & { rawBody?: Buffer }).rawBody;
    const rawBodyStr = rawBodyBuffer ? rawBodyBuffer.toString("utf8") : JSON.stringify(req.body || {});
    if (!verifyWebhookSignature(provider, req, rawBodyStr)) {
      logger.warn(`[E-Sign Webhook] Signature verification failed for ${provider}`);
      res.status(401).json({ error: "Webhook signature verification failed" });
      return;
    }
    const payload = req.body || {};
    logger.info(`[E-Sign Webhook] ${provider} webhook received`, payload);

    let externalId: string | undefined;
    let newStatus: string | undefined;

    if (provider === "docusign") {
      externalId = payload.envelopeId || payload.envelope_id;
      const dsStatus = payload.status || "";
      newStatus = dsStatus === "completed" ? "signed" : dsStatus === "declined" ? "declined" : undefined;
    } else if (provider === "adobe_sign") {
      externalId = payload.agreementId || payload.agreement_id;
      const adobeStatus = payload.status || "";
      newStatus = adobeStatus === "SIGNED" ? "signed" : adobeStatus === "DECLINED" ? "declined" : undefined;
    } else if (provider === "gov_il") {
      externalId = payload.sessionId || payload.session_id;
      const govStatus = payload.status || "";
      newStatus = govStatus === "signed" ? "signed" : govStatus === "rejected" ? "declined" : undefined;
    }

    if (externalId && newStatus) {
      const sigResult = await db.execute(
        sql`SELECT cs.id, cs.workflow_id, cs.contract_id, cs.signee_name, cs.signee_email,
                   esw.template_id, esw.workflow_name
            FROM contract_signatures cs
            LEFT JOIN e_signature_workflow esw ON esw.id = cs.workflow_id
            WHERE cs.external_id = ${externalId} LIMIT 1`
      );
      if (sigResult.rows.length > 0) {
        const sig = sigResult.rows[0] as {
          id: number; workflow_id: number | null; contract_id: number | null;
          signee_name: string; signee_email: string;
          template_id: number | null; workflow_name: string | null;
        };

        let signedDocHtml: string | null = null;
        if (newStatus === "signed") {
          signedDocHtml = await generateSignedDocHtmlForWebhook(sig, provider);
        }

        await db.execute(
          sql`UPDATE contract_signatures SET
              status = ${newStatus},
              signed_at = ${newStatus === "signed" ? new Date() : null},
              signed_document_html = COALESCE(${signedDocHtml}, signed_document_html),
              updated_at = NOW()
            WHERE id = ${sig.id}`
        );
        await db.execute(
          sql`INSERT INTO signature_audit_log (signature_id, action, performed_by, details)
              VALUES (${sig.id}, ${`provider_webhook_${newStatus}`}, ${provider}, ${JSON.stringify({ externalId, payload })})`
        );

        if (sig.workflow_id) {
          await updateWorkflowCompletionStatus(sig.workflow_id, sig.contract_id);
        }
      }
    }

    res.json({ received: true });
  } catch (error: unknown) {
    logger.error("[E-Sign Webhook] Error:", error instanceof Error ? error.message : String(error));
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
}

router.post("/contract-templates", async (req: Request, res: Response) => {
  try {
    const { name, description, category, templateContent, templateVariables, requiredFields, signatureFields } = req.body;
    if (!name || !templateContent) return res.status(400).json({ error: "name and templateContent are required" });

    const result = await db.execute(
      sql`INSERT INTO contract_templates (name, description, category, template_content, template_variables, required_fields, signature_fields, created_by, updated_by)
        VALUES (${name}, ${description || null}, ${category || null}, ${templateContent}, ${JSON.stringify(templateVariables || [])}, ${JSON.stringify(requiredFields || [])}, ${JSON.stringify(signatureFields || [])}, ${req.userId || 'system'}, ${req.userId || 'system'})
        RETURNING *`
    );
    res.json({ success: true, template: result.rows[0] });
  } catch (error: unknown) {
    logger.error("[Templates] Create failed:", error instanceof Error ? error.message : String(error));
    res.status(400).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

router.get("/contract-templates", async (req: Request, res: Response) => {
  try {
    const { category, search, isActive, limit = 50, offset = 0 } = req.query;
    let query = "SELECT id, name, description, category, current_version, is_active, signature_fields, template_variables, created_at, updated_at FROM contract_templates WHERE 1=1";
    const params: (string | number)[] = [];

    if (isActive !== "false" && isActive !== "all") {
      query += ` AND is_active = true`;
    }
    if (category) {
      query += ` AND category = $${params.length + 1}`;
      params.push(String(category));
    }
    if (search) {
      query += ` AND (name ILIKE $${params.length + 1} OR description ILIKE $${params.length + 2})`;
      params.push(`%${String(search)}%`);
      params.push(`%${String(search)}%`);
    }
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Number(limit));
    params.push(Number(offset));

    const result = await pool.query(query, params);

    let countQuery = "SELECT COUNT(*) FROM contract_templates WHERE 1=1";
    const countParams: (string | number)[] = [];
    if (isActive !== "false" && isActive !== "all") {
      countQuery += ` AND is_active = true`;
    }
    if (category) {
      countQuery += ` AND category = $${countParams.length + 1}`;
      countParams.push(String(category));
    }
    if (search) {
      countQuery += ` AND (name ILIKE $${countParams.length + 1} OR description ILIKE $${countParams.length + 2})`;
      countParams.push(`%${String(search)}%`);
      countParams.push(`%${String(search)}%`);
    }
    const countResult = await pool.query(countQuery, countParams);

    const countRow = countResult.rows[0] as { count: string };
    res.json({ templates: result.rows, total: Number(countRow.count) });
  } catch (error: unknown) {
    logger.error("[Templates] List failed:", error instanceof Error ? error.message : String(error));
    res.status(400).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

router.get("/contract-templates/categories/list", async (req: Request, res: Response) => {
  try {
    const result = await db.execute(
      sql`SELECT DISTINCT category FROM contract_templates WHERE category IS NOT NULL ORDER BY category`
    );
    res.json({ categories: result.rows.map((r: unknown) => (r as { category: string }).category) });
  } catch (error: unknown) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

router.get("/contract-templates/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.execute(
      sql`SELECT * FROM contract_templates WHERE id = ${parseInt(id)}`
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Template not found" });
    res.json(result.rows[0]);
  } catch (error: unknown) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

router.put("/contract-templates/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, category, templateContent, templateVariables, requiredFields, signatureFields, isActive } = req.body;

    const current = await db.execute(
      sql`SELECT current_version FROM contract_templates WHERE id = ${parseInt(id)}`
    );
    if (current.rows.length === 0) return res.status(404).json({ error: "Template not found" });

    const newVersion = (Number((current.rows[0] as { current_version?: number }).current_version) || 0) + 1;

    if (templateContent) {
      await db.execute(
        sql`INSERT INTO template_versions (template_id, version_number, template_content, change_notes, created_by)
          VALUES (${parseInt(id)}, ${newVersion}, ${templateContent}, ${'Updated'}, ${req.userId || 'system'})`
      );
    }

    await db.execute(
      sql`UPDATE contract_templates SET 
        name = COALESCE(${name || null}, name),
        description = COALESCE(${description !== undefined ? description : null}, description),
        category = COALESCE(${category || null}, category),
        template_content = COALESCE(${templateContent || null}, template_content),
        template_variables = COALESCE(${templateVariables ? JSON.stringify(templateVariables) : null}::jsonb, template_variables),
        required_fields = COALESCE(${requiredFields ? JSON.stringify(requiredFields) : null}::jsonb, required_fields),
        signature_fields = COALESCE(${signatureFields ? JSON.stringify(signatureFields) : null}::jsonb, signature_fields),
        is_active = COALESCE(${isActive !== undefined ? isActive : null}, is_active),
        current_version = ${templateContent ? newVersion : sql`current_version`},
        updated_by = ${req.userId || 'system'},
        updated_at = NOW()
      WHERE id = ${parseInt(id)}`
    );

    const updated = await db.execute(sql`SELECT * FROM contract_templates WHERE id = ${parseInt(id)}`);
    res.json({ success: true, template: updated.rows[0], newVersion });
  } catch (error: unknown) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

router.delete("/contract-templates/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await db.execute(sql`DELETE FROM contract_templates WHERE id = ${parseInt(id)}`);
    res.json({ success: true });
  } catch (error: unknown) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

router.get("/contract-templates/:id/versions", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.execute(
      sql`SELECT version_number, change_notes, created_by, created_at FROM template_versions WHERE template_id = ${parseInt(id)} ORDER BY version_number DESC`
    );
    res.json({ versions: result.rows });
  } catch (error: unknown) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

router.post("/contract-templates/:id/render", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { mergeFields = {}, contractId } = req.body;

    const tpl = await db.execute(sql`SELECT * FROM contract_templates WHERE id = ${parseInt(id)}`);
    if (tpl.rows.length === 0) return res.status(404).json({ error: "Template not found" });

    type TemplateRow = { template_content: string; name: string; category?: string; template_variables?: string };
    const template = tpl.rows[0] as TemplateRow;
    let rendered = template.template_content;

    let contextData: Record<string, string> = {};

    if (contractId) {
      const contract = await db.execute(
        sql`SELECT * FROM contracts WHERE id = ${parseInt(contractId)}`
      ).catch(() => ({ rows: [] as unknown[] }));
      type ContractRow = { contract_number?: string; created_at?: string; amount?: number; currency?: string; start_date?: string; end_date?: string; customer?: string; vendor?: string };
      if (contract.rows.length > 0) {
        const c = contract.rows[0] as ContractRow;
        contextData = {
          contract_number: c.contract_number || "",
          contract_date: c.created_at ? new Date(c.created_at).toLocaleDateString("he-IL") : "",
          contract_value: c.amount ? String(c.amount) : "",
          currency: c.currency || "₪",
          start_date: c.start_date || "",
          end_date: c.end_date || "",
          customer_name: c.customer || "",
          supplier_name: c.vendor || "",
        };
      }
    }

    const data = { ...contextData, ...mergeFields };
    const today = new Date().toLocaleDateString("he-IL");
    if (!data.contract_date) data.contract_date = today;

    for (const [key, value] of Object.entries(data)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      rendered = rendered.replace(regex, String(value || ""));
    }

    const unmatchedVars = rendered.match(/\{\{[\w.]+\}\}/g) || [];

    res.json({
      rendered,
      unmatchedVariables: unmatchedVars.map((v: string) => v.replace(/\{\{|\}\}/g, "")),
      templateName: template.name,
      category: template.category,
    });
  } catch (error: unknown) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

function renderHtmlToPdf(htmlContent: string, templateName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).font("Helvetica-Bold").text(templateName, { align: "center" });
    doc.moveDown();
    doc.fontSize(10).font("Helvetica");

    const textContent = htmlContent
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, "\n$1\n")
      .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "• $1\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ").replace(/&#[0-9]+;/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    doc.text(textContent, { lineGap: 4 });
    doc.end();
  });
}

router.post("/contract-templates/:id/render-pdf", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { mergeFields = {}, contractId } = req.body;

    const tpl = await db.execute(sql`SELECT * FROM contract_templates WHERE id = ${parseInt(id)}`);
    if (tpl.rows.length === 0) return res.status(404).json({ error: "Template not found" });

    type TemplateRow = { template_content: string; name: string; category?: string; template_variables?: string };
    const template = tpl.rows[0] as TemplateRow;
    let rendered = template.template_content;

    let contextData: Record<string, string> = {};
    if (contractId) {
      const contract = await db.execute(
        sql`SELECT * FROM contracts WHERE id = ${parseInt(contractId)}`
      ).catch(() => ({ rows: [] as unknown[] }));
      type ContractRow = { contract_number?: string; created_at?: string; amount?: number; currency?: string; start_date?: string; end_date?: string; customer?: string; vendor?: string };
      if (contract.rows.length > 0) {
        const c = contract.rows[0] as ContractRow;
        contextData = {
          contract_number: c.contract_number || "",
          contract_date: c.created_at ? new Date(c.created_at).toLocaleDateString("he-IL") : "",
          contract_value: c.amount ? String(c.amount) : "",
          currency: c.currency || "₪",
          start_date: c.start_date || "",
          end_date: c.end_date || "",
          customer_name: c.customer || "",
          supplier_name: c.vendor || "",
        };
      }
    }

    const data = { ...contextData, ...mergeFields };
    const today = new Date().toLocaleDateString("he-IL");
    if (!data.contract_date) data.contract_date = today;

    for (const [key, value] of Object.entries(data)) {
      rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value || ""));
    }

    const pdfBuffer = await renderHtmlToPdf(rendered, template.name as string);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="contract-${id}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (error: unknown) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

router.get("/contract-signatures/:signatureId/signed-document", async (req: Request, res: Response) => {
  try {
    const signatureId = parseInt(req.params.signatureId);
    if (isNaN(signatureId)) return res.status(400).json({ error: "Invalid signature ID" });

    const result = await db.execute(
      sql`SELECT cs.signed_document_html, cs.status, cs.signee_name, cs.signed_at,
                 cs.workflow_id, esw.created_by as workflow_owner,
                 ct.name as template_name
          FROM contract_signatures cs
          LEFT JOIN e_signature_workflow esw ON esw.id = cs.workflow_id
          LEFT JOIN contract_templates ct ON ct.id = esw.template_id
          WHERE cs.id = ${signatureId}`
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Signature not found" });
    const row = result.rows[0] as {
      signed_document_html: string | null;
      status: string;
      signee_name: string;
      signed_at: string | null;
      workflow_id: number | null;
      workflow_owner: string | null;
      template_name: string | null;
    };

    if (!row.workflow_owner || !req.userId || row.workflow_owner !== req.userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (row.status !== "signed") return res.status(409).json({ error: "Document not yet signed", status: row.status });
    const format = req.query.format;
    if (format === "pdf" && row.signed_document_html) {
      const pdfBuffer = await renderHtmlToPdf(row.signed_document_html, row.template_name || "Signed Document");
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="signed-contract-${signatureId}.pdf"`,
        "Content-Length": String(pdfBuffer.length),
      });
      return res.send(pdfBuffer);
    }
    res.json({
      signatureId,
      status: row.status,
      signeeName: row.signee_name,
      signedAt: row.signed_at,
      signedDocumentHtml: row.signed_document_html,
    });
  } catch (error: unknown) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

router.post("/contract-signatures/:signatureId/resend-reminder", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const signatureId = parseInt(req.params.signatureId);
    if (isNaN(signatureId)) return res.status(400).json({ error: "Invalid signature ID" });

    const result = await db.execute(
      sql`SELECT cs.id, cs.status, cs.signee_email, cs.signee_name, cs.invitation_token, cs.expires_at,
                 esw.created_by as workflow_owner, esw.provider
          FROM contract_signatures cs
          LEFT JOIN e_signature_workflow esw ON esw.id = cs.workflow_id
          WHERE cs.id = ${signatureId}`
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Signature not found" });
    const sig = result.rows[0] as {
      id: number; status: string; signee_email: string; signee_name: string;
      invitation_token: string; expires_at: string | null;
      workflow_owner: string | null; provider: string;
    };
    if (sig.workflow_owner && sig.workflow_owner !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (sig.status !== "pending") {
      return res.status(409).json({ error: `Cannot resend reminder — signature is already ${sig.status}` });
    }
    if (sig.expires_at && new Date(sig.expires_at) < new Date()) {
      return res.status(409).json({ error: "Cannot resend reminder — invitation has expired" });
    }

    const signingUrl = `${process.env.APP_BASE_URL || ""}/api/e-signature/sign/${sig.invitation_token}`;
    await db.execute(
      sql`INSERT INTO signature_audit_log (signature_id, action, performed_by, details)
          VALUES (${signatureId}, 'reminder_sent', ${userId}, ${JSON.stringify({ timestamp: new Date(), signingUrl })})`
    );

    logger.info(`[E-Sign] Reminder resent for signature ${signatureId} to ${sig.signee_email}, signing URL: ${signingUrl}`);
    res.json({ success: true, message: `תזכורת נשלחה אל ${sig.signee_email}`, signingUrl });
  } catch (error: unknown) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

router.post("/e-signature-workflow", async (req: Request, res: Response) => {
  try {
    const { contractId, templateId, workflowName, signatureOrder, sendReminders, reminderDays, expirationDays, provider = "local" } = req.body;
    if (!workflowName) return res.status(400).json({ error: "workflowName is required" });

    const result = await db.execute(
      sql`INSERT INTO e_signature_workflow (contract_id, template_id, workflow_name, provider, signature_order, send_reminders, reminder_days, expiration_days, created_by)
        VALUES (${contractId || null}, ${templateId || null}, ${workflowName}, ${provider}, ${JSON.stringify(signatureOrder || [])}, ${sendReminders ?? true}, ${reminderDays || 3}, ${expirationDays || 30}, ${req.userId || 'system'})
        RETURNING *`
    );
    res.json({ success: true, workflow: result.rows[0] });
  } catch (error: unknown) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

router.get("/e-signature-workflow", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { contractId, status, limit = 50, offset = 0 } = req.query;
    const params: (string | number)[] = [userId];
    let query = `SELECT w.*,
      COUNT(s.id) FILTER (WHERE s.status = 'signed') as signed_count,
      COUNT(s.id) as total_signers
      FROM e_signature_workflow w
      LEFT JOIN contract_signatures s ON s.workflow_id = w.id
      WHERE w.created_by = $1`;

    if (contractId) {
      query += ` AND w.contract_id = $${params.length + 1}`;
      params.push(Number(contractId));
    }
    if (status) {
      query += ` AND w.status = $${params.length + 1}`;
      params.push(String(status));
    }
    query += ` GROUP BY w.id ORDER BY w.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Number(limit));
    params.push(Number(offset));

    const result = await pool.query(query, params);
    res.json({ workflows: result.rows });
  } catch (error: unknown) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

router.get("/e-signature-workflow/:workflowId", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const workflowId = parseInt(req.params.workflowId);
    if (isNaN(workflowId)) return res.status(400).json({ error: "Invalid workflow ID" });

    const workflow = await db.execute(
      sql`SELECT * FROM e_signature_workflow WHERE id = ${workflowId} AND created_by = ${userId}`
    );
    if (workflow.rows.length === 0) return res.status(404).json({ error: "Workflow not found" });

    const signatures = await db.execute(
      sql`SELECT id, signee_name, signee_email, signature_field, status, provider, signed_at, expires_at, created_at
          FROM contract_signatures WHERE workflow_id = ${workflowId}
          ORDER BY created_at ASC`
    );

    const sigs = signatures.rows;
    const signed = sigs.filter((s: unknown) => (s as { status: string }).status === "signed").length;

    res.json({
      workflow: workflow.rows[0],
      signers: sigs,
      progress: { signed, total: sigs.length, percentage: sigs.length > 0 ? Math.round((signed / sigs.length) * 100) : 0 },
    });
  } catch (error: unknown) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

router.post("/e-signature/:workflowId/invite", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const wfId = parseInt(req.params.workflowId);
    if (isNaN(wfId)) return res.status(400).json({ error: "Invalid workflow ID" });

    const { signeeEmail, signeeName, signatureField, provider = "local" } = req.body;

    if (!signeeEmail || !signeeName) return res.status(400).json({ error: "signeeEmail and signeeName are required" });

    const workflow = await db.execute(
      sql`SELECT * FROM e_signature_workflow WHERE id = ${wfId} AND created_by = ${userId}`
    );
    if (workflow.rows.length === 0) return res.status(404).json({ error: "Workflow not found" });

    type WfRow = { contract_id: number | null; expiration_days: number | null };
    const wf = workflow.rows[0] as WfRow;
    const contractId = wf.contract_id;
    const expiresAt = new Date(Date.now() + (wf.expiration_days || 30) * 24 * 60 * 60 * 1000);
    const invitationToken = generateInvitationToken();

    const result = await db.execute(
      sql`INSERT INTO contract_signatures (contract_id, workflow_id, signee_email, signee_name, signature_field, status, provider, invitation_token, expires_at)
        VALUES (${contractId || null}, ${wfId}, ${signeeEmail}, ${signeeName}, ${signatureField || 'signature'}, 'pending', ${provider}, ${invitationToken}, ${expiresAt.toISOString()})
        RETURNING id, signee_name, signee_email, status, invitation_token`
    );

    const sigId = (result.rows[0] as { id: number }).id;

    await db.execute(
      sql`INSERT INTO signature_audit_log (signature_id, action, performed_by, details)
        VALUES (${sigId}, 'invited', ${req.userId || 'system'}, ${JSON.stringify({ signeeEmail, signeeName, provider })})`
    );

    await db.execute(
      sql`UPDATE e_signature_workflow SET status = 'in_progress' WHERE id = ${wfId} AND status = 'pending'`
    ).catch(() => {});

    let providerResult: { externalId?: string; providerStatus: string };
    try {
      providerResult = await sendProviderInvite({
        workflowId: wfId,
        signatureId: sigId,
        contractId: contractId || null,
        signeeName,
        signeeEmail,
        signatureField: signatureField || "signature",
        provider,
        invitationToken,
        expiresAt,
      });
    } catch (providerErr: unknown) {
      await db.execute(sql`DELETE FROM contract_signatures WHERE id = ${sigId}`).catch(() => {});
      await db.execute(
        sql`INSERT INTO signature_audit_log (signature_id, action, performed_by, details)
            VALUES (${sigId}, 'provider_invite_failed', ${req.userId || 'system'}, ${JSON.stringify({ provider, error: providerErr instanceof Error ? providerErr.message : String(providerErr) })})`
      ).catch(() => {});
      logger.error(`[E-Sign] Provider invite failed for signature ${sigId}, cleaned up orphaned record: ${providerErr instanceof Error ? providerErr.message : String(providerErr)}`);
      return res.status(502).json({ error: providerErr instanceof Error ? providerErr.message : "Provider invitation failed" });
    }

    if (providerResult.externalId) {
      await db.execute(
        sql`UPDATE contract_signatures SET external_id = ${providerResult.externalId} WHERE id = ${sigId}`
      );
    }

    const appBase = process.env.APP_BASE_URL || "";
    const invitationLink = `${appBase}/api/e-signature/sign/${invitationToken}`;
    res.json({
      success: true,
      signatureId: sigId,
      invitationLink,
      invitationToken,
      provider,
      providerStatus: providerResult.providerStatus,
      externalId: providerResult.externalId || null,
      signature: result.rows[0],
    });
  } catch (error: unknown) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

export async function contractSigningPageHandler(req: Request, res: Response): Promise<void> {
  const { token } = req.params as { token: string };
  try {
    const sig = await db.execute(
      sql`SELECT cs.id, cs.status, cs.signee_name, cs.signee_email, cs.signature_field, cs.expires_at,
                 cs.workflow_id, cs.contract_id,
                 COALESCE(esw.workflow_name, '') as workflow_name,
                 ct.name as template_name
          FROM contract_signatures cs
          LEFT JOIN e_signature_workflow esw ON esw.id = cs.workflow_id
          LEFT JOIN contract_templates ct ON ct.id = (
            SELECT template_id FROM e_signature_workflow WHERE id = cs.workflow_id LIMIT 1
          )
          WHERE cs.invitation_token = ${token}
          LIMIT 1`
    ).catch(async () => {
      return db.execute(
        sql`SELECT id, status, signee_name, signee_email, signature_field, expires_at,
                   workflow_id, contract_id, '' as workflow_name, null as template_name
            FROM contract_signatures WHERE invitation_token = ${token} LIMIT 1`
      ).catch(() => ({ rows: [] as unknown[] }));
    });
    if ((sig as { rows: unknown[] }).rows.length === 0) {
      res.status(404).send(`<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>שגיאה</title></head><body style="font-family:Arial;text-align:center;padding:60px"><h1>קישור לא תקין</h1><p>קישור החתימה לא נמצא.</p></body></html>`);
      return;
    }
    const s = (sig as { rows: unknown[] }).rows[0] as {
      id: number; status: string; signee_name: string; signee_email: string;
      signature_field: string; expires_at: string | null; workflow_name: string;
      template_name: string | null; workflow_id: number | null; contract_id: number | null;
    };
    if (s.status !== "pending") {
      const msg = s.status === "signed" ? "המסמך כבר נחתם." : s.status === "expired" ? "קישור זה פג תוקפו." : "בקשת החתימה בוטלה.";
      res.send(`<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>חתימה</title></head><body style="font-family:Arial;text-align:center;padding:60px"><h1>חתימה</h1><p>${msg}</p></body></html>`);
      return;
    }
    if (s.expires_at && new Date(s.expires_at) < new Date()) {
      await db.execute(sql`UPDATE contract_signatures SET status = 'expired', updated_at = NOW() WHERE id = ${s.id}`).catch(() => {});
      res.send(`<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>פג תוקף</title></head><body style="font-family:Arial;text-align:center;padding:60px"><h1>פג תוקף</h1><p>קישור החתימה פג תוקפו.</p></body></html>`);
      return;
    }
    const docName = escapeHtml(s.template_name || s.workflow_name || "מסמך חוזה");
    const signeeName = escapeHtml(s.signee_name || "");
    const signeeEmail = escapeHtml(s.signee_email || "");
    const signatureField = escapeHtml(s.signature_field || "");
    const safeToken = token.replace(/[^a-zA-Z0-9_-]/g, "");
    const postUrl = `/api/e-signature/sign/${safeToken}`;
    const declineUrl = `/api/e-signature/decline/${safeToken}`;
    const expiresDisplay = s.expires_at ? escapeHtml(new Date(s.expires_at).toLocaleDateString("he-IL")) : null;
    const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>חתימה על ${docName}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 700px; margin: 40px auto; padding: 20px; color: #333; }
    h1 { border-bottom: 2px solid #2563eb; padding-bottom: 10px; color: #1e3a5f; }
    .info { background: #f0f4ff; border: 1px solid #c7d7f8; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .sig-canvas { border: 2px dashed #999; border-radius: 4px; width: 100%; height: 150px; cursor: crosshair; background: #fff; display: block; }
    .btn { padding: 12px 24px; border-radius: 6px; border: none; cursor: pointer; font-size: 16px; font-weight: bold; margin: 8px 4px; }
    .btn-sign { background: #2563eb; color: white; }
    .btn-clear { background: #e5e7eb; color: #374151; }
    .btn-decline { background: #dc2626; color: white; }
    .msg { display: none; padding: 12px; border-radius: 6px; margin-top: 16px; }
    .msg.ok { background: #d1fae5; border: 1px solid #6ee7b7; color: #065f46; display: block; }
    .msg.err { background: #fee2e2; border: 1px solid #fca5a5; color: #7f1d1d; display: block; }
  </style>
</head>
<body>
  <h1>חתימה על מסמך</h1>
  <div class="info">
    <p><strong>שם המסמך:</strong> ${docName}</p>
    <p><strong>חותם:</strong> ${signeeName} (${signeeEmail})</p>
    <p><strong>שדה חתימה:</strong> ${signatureField}</p>
    ${expiresDisplay ? `<p><strong>תוקף:</strong> ${expiresDisplay}</p>` : ""}
  </div>
  <h2>חתימה</h2>
  <p>חתמו בתוך המסגרת:</p>
  <canvas id="sig" class="sig-canvas" width="640" height="150"></canvas>
  <div style="margin-top:12px">
    <button class="btn btn-clear" onclick="clearSig()">נקה</button>
    <button class="btn btn-sign" onclick="submitSign()">אישור חתימה</button>
    <button class="btn btn-decline" onclick="declineDoc()">דחייה</button>
  </div>
  <div id="msg" class="msg"></div>
  <script>
    const canvas = document.getElementById("sig");
    const ctx = canvas.getContext("2d");
    let drawing = false;
    canvas.addEventListener("mousedown", e => { drawing = true; ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY); });
    canvas.addEventListener("mousemove", e => { if (!drawing) return; ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke(); });
    canvas.addEventListener("mouseup", () => drawing = false);
    canvas.addEventListener("mouseleave", () => drawing = false);
    canvas.addEventListener("touchstart", e => { e.preventDefault(); drawing = true; const t = e.touches[0]; const r = canvas.getBoundingClientRect(); ctx.beginPath(); ctx.moveTo(t.clientX - r.left, t.clientY - r.top); }, { passive: false });
    canvas.addEventListener("touchmove", e => { e.preventDefault(); if (!drawing) return; const t = e.touches[0]; const r = canvas.getBoundingClientRect(); ctx.lineTo(t.clientX - r.left, t.clientY - r.top); ctx.stroke(); }, { passive: false });
    canvas.addEventListener("touchend", () => drawing = false);
    function clearSig() { ctx.clearRect(0, 0, canvas.width, canvas.height); }
    function showMsg(text, ok) { const m = document.getElementById("msg"); m.textContent = text; m.className = "msg " + (ok ? "ok" : "err"); }
    async function submitSign() {
      const sigData = canvas.toDataURL("image/png");
      try {
        const r = await fetch("${postUrl}", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signatureData: sigData }) });
        const data = await r.json();
        if (r.ok) { showMsg("החתימה הושלמה בהצלחה. תודה!", true); setTimeout(() => document.querySelector(".btn-sign").setAttribute("disabled","1"), 100); }
        else showMsg(data.error || "שגיאה בשמירת החתימה", false);
      } catch { showMsg("שגיאת חיבור. נסה שוב.", false); }
    }
    async function declineDoc() {
      if (!confirm("האם אתה בטוח שברצונך לדחות את החתימה?")) return;
      try {
        const r = await fetch("${declineUrl}", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "דחייה על ידי החותם" }) });
        const data = await r.json();
        if (r.ok) showMsg("הבקשה נדחתה.", true);
        else showMsg(data.error || "שגיאה בדחיית הבקשה", false);
      } catch { showMsg("שגיאת חיבור.", false); }
    }
  </script>
</body>
</html>`;
    res.set("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (_error: unknown) {
    res.status(500).send(`<html><body dir="rtl"><h1>שגיאה פנימית</h1></body></html>`);
  }
}

export async function contractSigningSubmitHandler(req: Request, res: Response): Promise<void> {
  const { token } = req.params as { token: string };
  const { signatureData } = req.body as { signatureData?: unknown };
  try {
    if (!token) { res.status(400).json({ error: "Invitation token is required" }); return; }
    if (!signatureData || typeof signatureData !== "string" || signatureData.length < 50) {
      res.status(400).json({ error: "Signature data is required. Please draw your signature." }); return;
    }
    if (!signatureData.startsWith("data:image/")) {
      res.status(400).json({ error: "Signature must be an image data URL." }); return;
    }
    await contractSigningSubmitCore(token, signatureData, req, res);
  } catch (error: unknown) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
}

async function contractSigningSubmitCore(token: string, signatureData: string, req: Request, res: Response): Promise<void> {
    const sig = await db.execute(
      sql`SELECT id, status, workflow_id, contract_id, expires_at FROM contract_signatures WHERE invitation_token = ${token}`
    );
    if (sig.rows.length === 0) { res.status(404).json({ error: "Signature not found" }); return; }

    type SigRow = { id: number; status: string; workflow_id: number | null; contract_id: number | null; expires_at: string | null; signee_name?: string };
    const s = sig.rows[0] as SigRow;
    if (s.status !== "pending") { res.status(400).json({ error: "Signature already processed" }); return; }
    if (s.expires_at && new Date(s.expires_at) < new Date()) {
      await db.execute(sql`UPDATE contract_signatures SET status = 'expired', updated_at = NOW() WHERE id = ${s.id}`);
      res.status(400).json({ error: "Signature invitation has expired" }); return;
    }

    let signedDocHtml: string | null = null;
    const signatureTimestamp = new Date().toISOString();
    const signatureFooter = `<hr/><p style="font-size:11px;color:#666;text-align:center">נחתם: ${signatureTimestamp} | IP: ${req.ip || ""} | חותם: ${s.signee_name || ""}</p>`;

    if (s.contract_id) {
      const contractRow = await db.execute(
        sql`SELECT c.contract_number, c.title, c.description, c.vendor, c.customer,
                   c.amount, c.currency, c.start_date, c.end_date, c.metadata, c.created_at,
                   esw.template_id
            FROM contracts c
            LEFT JOIN e_signature_workflow esw ON esw.id = ${s.workflow_id || null}
            WHERE c.id = ${s.contract_id}`
      ).catch(() => ({ rows: [] as unknown[] }));
      type ContractDetailRow = { contract_number?: string; title?: string; description?: string; vendor?: string; customer?: string; amount?: number; currency?: string; start_date?: string; end_date?: string; metadata?: unknown; created_at?: string; template_id?: number };
      if (contractRow.rows.length > 0) {
        const c = contractRow.rows[0] as ContractDetailRow;
        const mergeData: Record<string, string> = {
          contract_number: c.contract_number || "",
          contract_date: c.created_at ? new Date(c.created_at).toLocaleDateString("he-IL") : new Date().toLocaleDateString("he-IL"),
          contract_value: c.amount ? String(c.amount) : "",
          currency: c.currency || "₪",
          start_date: c.start_date || "",
          end_date: c.end_date || "",
          customer_name: c.customer || "",
          supplier_name: c.vendor || "",
        };
        const metadata = c.metadata ? (typeof c.metadata === "string" ? JSON.parse(c.metadata) : c.metadata) as Record<string, string> : {};
        Object.assign(mergeData, metadata);
        let content: string;
        if (c.template_id) {
          const tplRow = await db.execute(sql`SELECT template_content FROM contract_templates WHERE id = ${c.template_id}`).catch(() => ({ rows: [] as unknown[] }));
          const tpl = tplRow.rows[0] as { template_content?: string } | undefined;
          content = tpl?.template_content || `<html><body dir="rtl"><h1>${c.title || "מסמך חוזה"}</h1><p>${c.description || ""}</p></body></html>`;
        } else {
          content = `<html><body dir="rtl"><h1>${c.title || "מסמך חוזה"}</h1><p>חוזה מס': ${mergeData.contract_number}</p><p>לקוח: ${mergeData.customer_name}</p><p>ספק: ${mergeData.supplier_name}</p><p>ערך: ${mergeData.contract_value} ${mergeData.currency}</p></body></html>`;
        }
        for (const [k, v] of Object.entries(mergeData)) {
          content = content.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
        }
        signedDocHtml = `${content}${signatureFooter}`;
      }
    } else if (s.workflow_id) {
      const wfRow = await db.execute(
        sql`SELECT esw.workflow_name, esw.template_id, ct.name as template_name, ct.template_content
            FROM e_signature_workflow esw
            LEFT JOIN contract_templates ct ON ct.id = esw.template_id
            WHERE esw.id = ${s.workflow_id}`
      ).catch(() => ({ rows: [] as unknown[] }));
      type WfRow = { workflow_name?: string; template_id?: number; template_name?: string; template_content?: string };
      if (wfRow.rows.length > 0) {
        const wf = wfRow.rows[0] as WfRow;
        let content = wf.template_content || `<html><body dir="rtl"><h1>${wf.workflow_name || "מסמך לחתימה"}</h1></body></html>`;
        content = content.replace(/\{\{signature\}\}/g, `<img src="${signatureData}" style="height:60px;" alt="חתימה" />`);
        signedDocHtml = `${content}${signatureFooter}`;
      }
    }

    if (!signedDocHtml) {
      signedDocHtml = `<html><body dir="rtl" style="font-family:Arial;padding:40px"><h1>אישור חתימה</h1><p>חותם: ${s.signee_name || ""}</p><p>תאריך חתימה: ${signatureTimestamp}</p><p>IP: ${req.ip || ""}</p><img src="${signatureData}" style="height:80px;border:1px solid #ccc;padding:4px" alt="חתימה" />${signatureFooter}</body></html>`;
    }

    await db.execute(
      sql`UPDATE contract_signatures SET 
        signature_data = ${signatureData},
        signed_document_html = ${signedDocHtml},
        status = 'signed',
        signed_at = NOW(),
        ip_address = ${req.ip || ''},
        user_agent = ${req.get('user-agent') || ''},
        updated_at = NOW()
      WHERE id = ${s.id}`
    );

    await db.execute(
      sql`INSERT INTO signature_audit_log (signature_id, action, performed_by, details)
        VALUES (${s.id}, 'signed', ${req.ip || 'anonymous'}, ${JSON.stringify({ timestamp: new Date(), userAgent: req.get('user-agent'), hasSignedCopy: signedDocHtml !== null })})`
    );

    await updateWorkflowCompletionStatus(s.workflow_id, s.contract_id);

    res.json({ success: true, message: "Document signed successfully", hasSignedCopy: signedDocHtml !== null });
}

async function updateWorkflowCompletionStatus(workflowId: number | null, contractId: number | null): Promise<void> {
  if (!workflowId) return;
  const counts = await db.execute(
    sql`SELECT
          COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
          COUNT(*) FILTER (WHERE status = 'declined') as declined_count,
          COUNT(*) FILTER (WHERE status = 'signed') as signed_count,
          COUNT(*) as total_count
        FROM contract_signatures WHERE workflow_id = ${workflowId}`
  );
  type CountsRow = { pending_count: string; declined_count: string; signed_count: string; total_count: string };
  const c = counts.rows[0] as CountsRow;
  const pendingCount = parseInt(c.pending_count || "0");
  const declinedCount = parseInt(c.declined_count || "0");
  const signedCount = parseInt(c.signed_count || "0");
  const totalCount = parseInt(c.total_count || "0");
  if (pendingCount === 0) {
    if (declinedCount === 0 && signedCount === totalCount) {
      await db.execute(sql`UPDATE e_signature_workflow SET status = 'completed', updated_at = NOW(), completed_at = NOW() WHERE id = ${workflowId}`);
      if (contractId) {
        await db.execute(sql`UPDATE contracts SET status = 'executed', updated_at = NOW() WHERE id = ${contractId}`).catch((err: unknown) => {
          logger.warn(`[E-Sign] Failed to update contract ${contractId} status: ${err instanceof Error ? err.message : String(err)}`);
        });
      }
    } else if (declinedCount > 0) {
      await db.execute(sql`UPDATE e_signature_workflow SET status = 'declined', updated_at = NOW() WHERE id = ${workflowId}`);
    }
  }
}

router.post("/e-signature/sign/:token", async (req: Request, res: Response) => {
  return contractSigningSubmitHandler(req, res);
});

export async function contractDeclineHandler(req: Request, res: Response): Promise<void> {
  const { token } = req.params as { token: string };
  const { reason } = req.body as { reason?: string };
  try {
    if (!token) { res.status(400).json({ error: "Invitation token is required" }); return; }

    const sig = await db.execute(
      sql`SELECT id, status, workflow_id FROM contract_signatures WHERE invitation_token = ${token}`
    );
    if (sig.rows.length === 0) { res.status(404).json({ error: "Signature not found" }); return; }

    type DeclineSigRow = { id: number; status: string; workflow_id: number | null };
    const s = sig.rows[0] as DeclineSigRow;
    if (s.status !== "pending") { res.status(400).json({ error: "Signature already processed" }); return; }

    await db.execute(
      sql`UPDATE contract_signatures SET status = 'declined', updated_at = NOW() WHERE id = ${s.id}`
    );

    await db.execute(
      sql`INSERT INTO signature_audit_log (signature_id, action, performed_by, details)
        VALUES (${s.id}, 'declined', ${req.ip || 'anonymous'}, ${JSON.stringify({ reason, timestamp: new Date() })})`
    );

    if (s.workflow_id) {
      await db.execute(
        sql`UPDATE e_signature_workflow SET status = 'declined' WHERE id = ${s.workflow_id}`
      ).catch(() => {});
    }

    res.json({ success: true, message: "Signature declined" });
  } catch (error: unknown) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
}

router.post("/e-signature/decline/:token", contractDeclineHandler);

router.get("/e-signature/:workflowId/status", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const wfId = parseInt(req.params.workflowId);
    if (isNaN(wfId)) return res.status(400).json({ error: "Invalid workflow ID" });

    const ownership = await db.execute(
      sql`SELECT id FROM e_signature_workflow WHERE id = ${wfId} AND created_by = ${userId} LIMIT 1`
    );
    if (ownership.rows.length === 0) return res.status(403).json({ error: "Access denied" });

    const result = await db.execute(
      sql`SELECT id, signee_name, signee_email, status, signed_at, provider
          FROM contract_signatures
          WHERE workflow_id = ${wfId}
          ORDER BY created_at ASC`
    );

    const completed = result.rows.filter((r: unknown) => (r as { status: string }).status === "signed").length;
    const total = result.rows.length;

    res.json({
      signers: result.rows,
      progress: { completed, total, percentage: total > 0 ? Math.round((completed / total) * 100) : 0 },
    });
  } catch (error: unknown) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

router.get("/contract-signatures", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { status, search, limit = 50, offset = 0 } = req.query;
    const params: (string | number)[] = [userId];
    let whereClause = "WHERE w.created_by = $1";

    if (status && status !== "all") {
      whereClause += ` AND cs.status = $${params.length + 1}`;
      params.push(String(status));
    }
    if (search) {
      whereClause += ` AND (cs.signee_name ILIKE $${params.length + 1} OR cs.signee_email ILIKE $${params.length + 2})`;
      params.push(`%${String(search)}%`);
      params.push(`%${String(search)}%`);
    }

    const dataQuery = `SELECT cs.id, cs.signee_name, cs.signee_email, cs.signature_field, cs.status, cs.provider,
      cs.signed_at, cs.expires_at, cs.created_at, cs.ip_address, cs.workflow_id, cs.contract_id,
      c.title as contract_title, c.contract_number,
      w.workflow_name
      FROM contract_signatures cs
      LEFT JOIN contracts c ON c.id = cs.contract_id
      LEFT JOIN e_signature_workflow w ON w.id = cs.workflow_id
      ${whereClause}
      ORDER BY cs.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    const countQuery = `SELECT COUNT(*) FROM contract_signatures cs
      LEFT JOIN e_signature_workflow w ON w.id = cs.workflow_id
      ${whereClause}`;

    const [dataResult, countResult] = await Promise.all([
      pool.query(dataQuery, [...params, Number(limit), Number(offset)]),
      pool.query(countQuery, params),
    ]);

    const countRow = countResult.rows[0] as { count: string };
    res.json({ signatures: dataResult.rows, total: Number(countRow.count) });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal error";
    res.status(400).json({ error: msg });
  }
});

router.get("/contract-signatures/stats", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const stats = await db.execute(sql`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE cs.status = 'pending') as pending,
        COUNT(*) FILTER (WHERE cs.status = 'signed') as signed,
        COUNT(*) FILTER (WHERE cs.status = 'declined') as declined,
        COUNT(*) FILTER (WHERE cs.expires_at < NOW() AND cs.status = 'pending') as expired,
        ROUND(AVG(EXTRACT(EPOCH FROM (cs.signed_at - cs.created_at)) / 86400) FILTER (WHERE cs.status = 'signed'), 1) as avg_days_to_sign
      FROM contract_signatures cs
      LEFT JOIN e_signature_workflow w ON w.id = cs.workflow_id
      WHERE w.created_by = ${userId}
    `);
    res.json(stats.rows[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal error";
    res.status(400).json({ error: msg });
  }
});

router.get("/contract-signatures/:id/audit", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const signatureId = parseInt(req.params.id);
    if (isNaN(signatureId)) return res.status(400).json({ error: "Invalid signature ID" });

    const ownership = await db.execute(
      sql`SELECT cs.id FROM contract_signatures cs
          LEFT JOIN e_signature_workflow w ON w.id = cs.workflow_id
          WHERE cs.id = ${signatureId} AND w.created_by = ${userId}
          LIMIT 1`
    );
    if (ownership.rows.length === 0) {
      return res.status(403).json({ error: "Access denied" });
    }

    const result = await db.execute(
      sql`SELECT * FROM signature_audit_log WHERE signature_id = ${signatureId} ORDER BY timestamp ASC`
    );
    res.json({ auditLog: result.rows });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal error";
    res.status(400).json({ error: msg });
  }
});

export default router;

const CONTRACT_TEMPLATE_SEEDS = [
  {
    name: "הסכם מכירה",
    description: "תבנית הסכם מכירה סטנדרטי עם לקוח",
    category: "sales_agreement",
    templateContent: `<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px;">
<h1 style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px;">הסכם מכירה</h1>
<p style="text-align: center; color: #666;">מס' הסכם: {{contract_number}}</p>
<p>הסכם זה נכרת ביום <strong>{{contract_date}}</strong> בין <strong>{{company_name}}</strong> (להלן: "המוכר") לבין <strong>{{customer_name}}</strong> (להלן: "הקונה").</p>
<h2>1. מוצר/שירות</h2><p>{{product_description}}</p>
<h2>2. תמורה</h2><p>הקונה ישלם למוכר סך <strong>{{contract_value}} {{currency}}</strong> בתנאי: {{payment_terms}}</p>
<h2>3. תקופה</h2><p>{{start_date}} — {{end_date}}</p>
<h2>חתימות</h2>
<div style="display:flex;justify-content:space-between;margin-top:60px;">
  <div style="text-align:center;width:45%;"><div style="border-bottom:1px solid #333;height:40px;">{{signature_seller}}</div><p>המוכר — {{company_name}}</p></div>
  <div style="text-align:center;width:45%;"><div style="border-bottom:1px solid #333;height:40px;">{{signature_buyer}}</div><p>הקונה — {{customer_name}}</p></div>
</div></div>`,
    templateVariables: [
      { key: "contract_number", label: "מספר הסכם", required: true },
      { key: "contract_date", label: "תאריך", required: true },
      { key: "company_name", label: "שם החברה", required: true, source: "company" },
      { key: "customer_name", label: "שם הלקוח", required: true, source: "customer" },
      { key: "product_description", label: "תיאור המוצר/שירות", required: true },
      { key: "contract_value", label: "ערך חוזה", required: true },
      { key: "currency", label: "מטבע", required: true, defaultValue: "₪" },
      { key: "payment_terms", label: "תנאי תשלום", required: true, defaultValue: "שוטף + 30" },
      { key: "start_date", label: "תאריך תחילה", required: true },
      { key: "end_date", label: "תאריך סיום", required: false },
    ],
    signatureFields: [
      { field: "signature_seller", label: "חתימת המוכר", role: "seller", required: true },
      { field: "signature_buyer", label: "חתימת הקונה", role: "buyer", required: true },
    ],
  },
  {
    name: "הזמנת רכש",
    description: "תבנית הזמנת רכש מספק",
    category: "purchase_order",
    templateContent: `<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px;">
<h1 style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px;">הזמנת רכש</h1>
<p>מס' הזמנה: <strong>{{po_number}}</strong> | תאריך: {{order_date}}</p>
<p><strong>לכבוד:</strong> {{supplier_name}} | תאריך אספקה: {{delivery_date}}</p>
<h2>פרטי ההזמנה</h2>
<table style="width:100%;border-collapse:collapse;margin:20px 0;">
  <tr style="background:#f5f5f5;"><th style="border:1px solid #ddd;padding:10px;text-align:right;">פריט</th><th style="border:1px solid #ddd;padding:10px;">כמות</th><th style="border:1px solid #ddd;padding:10px;">מחיר</th><th style="border:1px solid #ddd;padding:10px;">סה"כ</th></tr>
  <tr><td style="border:1px solid #ddd;padding:10px;">{{item_description}}</td><td style="border:1px solid #ddd;padding:10px;text-align:center;">{{quantity}}</td><td style="border:1px solid #ddd;padding:10px;text-align:center;">{{unit_price}} {{currency}}</td><td style="border:1px solid #ddd;padding:10px;text-align:center;">{{total_price}} {{currency}}</td></tr>
</table>
<p><strong>סה"כ לתשלום:</strong> {{total_amount}} {{currency}} | <strong>תנאי תשלום:</strong> {{payment_terms}}</p>
<h2>חתימות</h2>
<div style="display:flex;justify-content:space-between;margin-top:60px;">
  <div style="text-align:center;width:45%;"><div style="border-bottom:1px solid #333;height:40px;">{{signature_purchaser}}</div><p>מנהל רכש — {{company_name}}</p></div>
  <div style="text-align:center;width:45%;"><div style="border-bottom:1px solid #333;height:40px;">{{signature_supplier}}</div><p>ספק — {{supplier_name}}</p></div>
</div></div>`,
    templateVariables: [
      { key: "po_number", label: "מספר הזמנה", required: true },
      { key: "order_date", label: "תאריך הזמנה", required: true },
      { key: "delivery_date", label: "תאריך אספקה", required: true },
      { key: "company_name", label: "שם החברה", required: true, source: "company" },
      { key: "supplier_name", label: "שם הספק", required: true, source: "supplier" },
      { key: "item_description", label: "תיאור פריט", required: true },
      { key: "quantity", label: "כמות", required: true },
      { key: "unit_price", label: "מחיר יחידה", required: true },
      { key: "total_price", label: "סה\"כ שורה", required: true },
      { key: "total_amount", label: "סכום כולל", required: true },
      { key: "currency", label: "מטבע", required: true, defaultValue: "₪" },
      { key: "payment_terms", label: "תנאי תשלום", required: true },
    ],
    signatureFields: [
      { field: "signature_purchaser", label: "חתימת מנהל רכש", role: "purchaser", required: true },
      { field: "signature_supplier", label: "חתימת הספק", role: "supplier", required: false },
    ],
  },
  {
    name: "הסכם סודיות (NDA)",
    description: "הסכם אי-גילוי מידע סודי",
    category: "nda",
    templateContent: `<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px;">
<h1 style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px;">הסכם סודיות ואי-גילוי (NDA)</h1>
<p style="text-align: center; color: #666;">תאריך: {{contract_date}}</p>
<p>הסכם זה נכרת בין <strong>{{party_a_name}}</strong> לבין <strong>{{party_b_name}}</strong>.</p>
<h2>1. הגדרות</h2><p>"מידע סודי" — כל מידע עסקי, טכני, כלכלי, או מסחרי שיועבר בין הצדדים.</p>
<h2>2. התחייבות לסודיות</h2><p>כל צד מתחייב לשמור בסוד ולא לגלות לצד שלישי מידע סודי שנמסר לו.</p>
<h2>3. תקופת ההסכם</h2><p>{{start_date}} לתקופה של {{duration_months}} חודשים.</p>
<h2>4. שימוש מורשה</h2><p>{{permitted_use}}</p>
<h2>5. סעדים</h2><p>הפרת הסכם זה תקנה לצד הנפגע זכות לסעד משפטי, לרבות צו מניעה ופיצויים.</p>
<h2>חתימות</h2>
<div style="display:flex;justify-content:space-between;margin-top:60px;">
  <div style="text-align:center;width:45%;"><div style="border-bottom:1px solid #333;height:40px;">{{signature_party_a}}</div><p>{{party_a_name}}</p></div>
  <div style="text-align:center;width:45%;"><div style="border-bottom:1px solid #333;height:40px;">{{signature_party_b}}</div><p>{{party_b_name}}</p></div>
</div></div>`,
    templateVariables: [
      { key: "contract_date", label: "תאריך הסכם", required: true },
      { key: "party_a_name", label: "שם הצד הראשון", required: true, source: "company" },
      { key: "party_b_name", label: "שם הצד השני", required: true },
      { key: "start_date", label: "תאריך תחילה", required: true },
      { key: "duration_months", label: "תקופה (חודשים)", required: true, defaultValue: "24" },
      { key: "permitted_use", label: "שימוש מורשה", required: true },
    ],
    signatureFields: [
      { field: "signature_party_a", label: "חתימת הצד הראשון", role: "party_a", required: true },
      { field: "signature_party_b", label: "חתימת הצד השני", role: "party_b", required: true },
    ],
  },
  {
    name: "חוזה העסקה",
    description: "חוזה עבודה לעובד חדש",
    category: "employment",
    templateContent: `<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px;">
<h1 style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px;">חוזה העסקה</h1>
<p>הסכם זה נכרת ביום {{contract_date}} בין <strong>{{company_name}}</strong> (להלן: "החברה") לבין <strong>{{employee_name}}</strong>, ת.ז. {{employee_id}} (להלן: "העובד").</p>
<h2>1. תפקיד</h2><p>תפקיד: <strong>{{job_title}}</strong> | מחלקה: {{department}}</p>
<h2>2. תנאי העסקה</h2><p>תחילת עבודה: {{start_date}} | שכר חודשי: <strong>{{monthly_salary}} ₪</strong> ברוטו | היקף: {{job_scope}}%</p>
<h2>3. שעות עבודה</h2><p>{{working_hours}}</p>
<h2>4. הטבות נוספות</h2><p>{{benefits}}</p>
<h2>5. תקופת ניסיון</h2><p>{{probation_period}} חודשים</p>
<h2>6. הודעה מוקדמת</h2><p>{{notice_period}} ימים</p>
<h2>חתימות</h2>
<div style="display:flex;justify-content:space-between;margin-top:60px;">
  <div style="text-align:center;width:45%;"><div style="border-bottom:1px solid #333;height:40px;">{{signature_employer}}</div><p>המעסיק — {{company_name}}</p></div>
  <div style="text-align:center;width:45%;"><div style="border-bottom:1px solid #333;height:40px;">{{signature_employee}}</div><p>העובד — {{employee_name}}</p></div>
</div></div>`,
    templateVariables: [
      { key: "contract_date", label: "תאריך חוזה", required: true },
      { key: "company_name", label: "שם החברה", required: true, source: "company" },
      { key: "employee_name", label: "שם העובד", required: true },
      { key: "employee_id", label: "ת.ז. עובד", required: true },
      { key: "job_title", label: "תפקיד", required: true },
      { key: "department", label: "מחלקה", required: true },
      { key: "start_date", label: "תאריך תחילה", required: true },
      { key: "monthly_salary", label: "שכר חודשי", required: true },
      { key: "job_scope", label: "היקף משרה (%)", required: true, defaultValue: "100" },
      { key: "working_hours", label: "שעות עבודה", required: true, defaultValue: "ראשון-חמישי, 9:00-18:00" },
      { key: "benefits", label: "הטבות", required: false },
      { key: "probation_period", label: "תקופת ניסיון (חודשים)", required: true, defaultValue: "3" },
      { key: "notice_period", label: "הודעה מוקדמת (ימים)", required: true, defaultValue: "30" },
    ],
    signatureFields: [
      { field: "signature_employer", label: "חתימת המעסיק", role: "employer", required: true },
      { field: "signature_employee", label: "חתימת העובד", role: "employee", required: true },
    ],
  },
  {
    name: "הסכם שירות",
    description: "הסכם מתן שירותים עם לקוח",
    category: "service_agreement",
    templateContent: `<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px;">
<h1 style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px;">הסכם שירות</h1>
<p>מס' הסכם: <strong>{{contract_number}}</strong> | תאריך: {{contract_date}}</p>
<p>הסכם זה נכרת בין <strong>{{company_name}}</strong> (להלן: "נותן השירות") לבין <strong>{{customer_name}}</strong> (להלן: "מקבל השירות").</p>
<h2>1. תיאור השירות</h2><p>{{service_description}}</p>
<h2>2. תקופת ההתקשרות</h2><p>{{start_date}} עד {{end_date}}</p>
<h2>3. תמורה</h2><p>דמי שירות: <strong>{{service_fee}} {{currency}}</strong> {{billing_cycle}} | תנאי תשלום: {{payment_terms}}</p>
<h2>4. SLA</h2><p>{{sla_terms}}</p>
<h2>5. ביטול</h2><p>הודעה מוקדמת: {{cancellation_notice}} ימים</p>
<h2>חתימות</h2>
<div style="display:flex;justify-content:space-between;margin-top:60px;">
  <div style="text-align:center;width:45%;"><div style="border-bottom:1px solid #333;height:40px;">{{signature_provider}}</div><p>נותן השירות — {{company_name}}</p></div>
  <div style="text-align:center;width:45%;"><div style="border-bottom:1px solid #333;height:40px;">{{signature_client}}</div><p>מקבל השירות — {{customer_name}}</p></div>
</div></div>`,
    templateVariables: [
      { key: "contract_number", label: "מספר הסכם", required: true },
      { key: "contract_date", label: "תאריך", required: true },
      { key: "company_name", label: "שם נותן השירות", required: true, source: "company" },
      { key: "customer_name", label: "שם מקבל השירות", required: true, source: "customer" },
      { key: "service_description", label: "תיאור השירות", required: true },
      { key: "start_date", label: "תאריך תחילה", required: true },
      { key: "end_date", label: "תאריך סיום", required: false },
      { key: "service_fee", label: "דמי שירות", required: true },
      { key: "currency", label: "מטבע", required: true, defaultValue: "₪" },
      { key: "billing_cycle", label: "מחזור חיוב", required: true, defaultValue: "לחודש" },
      { key: "payment_terms", label: "תנאי תשלום", required: true },
      { key: "sla_terms", label: "תנאי SLA", required: false },
      { key: "cancellation_notice", label: "הודעת ביטול (ימים)", required: true, defaultValue: "30" },
    ],
    signatureFields: [
      { field: "signature_provider", label: "חתימת נותן השירות", role: "provider", required: true },
      { field: "signature_client", label: "חתימת מקבל השירות", role: "client", required: true },
    ],
  },
  {
    name: "הסכם קבלן משנה",
    description: "הסכם עבודה עם קבלן משנה",
    category: "subcontractor",
    templateContent: `<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px;">
<h1 style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px;">הסכם קבלן משנה</h1>
<p>מס' הסכם: <strong>{{contract_number}}</strong> | תאריך: {{contract_date}}</p>
<p>הסכם זה נכרת בין <strong>{{main_contractor_name}}</strong> (להלן: "הקבלן הראשי") לבין <strong>{{subcontractor_name}}</strong>, ח.פ {{subcontractor_id}} (להלן: "קבלן המשנה").</p>
<h2>1. היקף העבודה</h2><p>{{scope_of_work}}</p>
<h2>2. לוח זמנים</h2><p>{{start_date}} — {{end_date}}</p>
<h2>3. תמורה</h2><p>עלות כוללת: <strong>{{total_cost}} {{currency}}</strong> | אבני דרך: {{payment_milestones}}</p>
<h2>4. ביצוע ואחריות</h2><p>קבלן המשנה יבצע לפי {{quality_standards}} ויהיה אחראי לכל נזק הנובע מרשלנותו.</p>
<h2>5. ביטוח</h2><p>{{insurance_requirements}}</p>
<h2>6. סודיות</h2><p>קבלן המשנה מחויב לשמור בסוד כל מידע שיגיע לידיו.</p>
<h2>חתימות</h2>
<div style="display:flex;justify-content:space-between;margin-top:60px;">
  <div style="text-align:center;width:45%;"><div style="border-bottom:1px solid #333;height:40px;">{{signature_main}}</div><p>קבלן ראשי — {{main_contractor_name}}</p></div>
  <div style="text-align:center;width:45%;"><div style="border-bottom:1px solid #333;height:40px;">{{signature_sub}}</div><p>קבלן משנה — {{subcontractor_name}}</p></div>
</div></div>`,
    templateVariables: [
      { key: "contract_number", label: "מספר הסכם", required: true },
      { key: "contract_date", label: "תאריך", required: true },
      { key: "main_contractor_name", label: "שם הקבלן הראשי", required: true, source: "company" },
      { key: "subcontractor_name", label: "שם קבלן המשנה", required: true },
      { key: "subcontractor_id", label: "ח.פ קבלן משנה", required: false },
      { key: "scope_of_work", label: "היקף עבודה", required: true },
      { key: "start_date", label: "תאריך התחלה", required: true },
      { key: "end_date", label: "תאריך סיום", required: true },
      { key: "total_cost", label: "עלות כוללת", required: true },
      { key: "currency", label: "מטבע", required: true, defaultValue: "₪" },
      { key: "payment_milestones", label: "אבני דרך לתשלום", required: false },
      { key: "quality_standards", label: "תקני איכות", required: false, defaultValue: "תקן ישראלי רלוונטי" },
      { key: "insurance_requirements", label: "דרישות ביטוח", required: false },
    ],
    signatureFields: [
      { field: "signature_main", label: "חתימת הקבלן הראשי", role: "main_contractor", required: true },
      { field: "signature_sub", label: "חתימת קבלן המשנה", role: "subcontractor", required: true },
    ],
  },
];

export async function seedContractTemplates(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contract_templates (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT,
        template_content TEXT NOT NULL DEFAULT '',
        template_variables JSONB DEFAULT '[]',
        required_fields JSONB DEFAULT '[]',
        current_version INTEGER NOT NULL DEFAULT 1,
        is_active BOOLEAN NOT NULL DEFAULT true,
        signature_fields JSONB DEFAULT '[]',
        created_by TEXT DEFAULT 'system',
        updated_by TEXT DEFAULT 'system',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS template_versions (
        id SERIAL PRIMARY KEY,
        template_id INTEGER NOT NULL REFERENCES contract_templates(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL DEFAULT 1,
        template_content TEXT NOT NULL DEFAULT '',
        change_notes TEXT,
        created_by TEXT DEFAULT 'system',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS e_signature_workflow (
        id SERIAL PRIMARY KEY,
        contract_id INTEGER,
        workflow_name TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'local',
        external_envelope_id TEXT,
        signature_order JSONB DEFAULT '[]',
        current_step INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        send_reminders BOOLEAN DEFAULT true,
        reminder_days INTEGER DEFAULT 3,
        expiration_days INTEGER DEFAULT 30,
        created_by TEXT DEFAULT 'system',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contract_signatures (
        id SERIAL PRIMARY KEY,
        contract_id INTEGER,
        workflow_id INTEGER REFERENCES e_signature_workflow(id) ON DELETE CASCADE,
        signee_email TEXT NOT NULL,
        signee_name TEXT NOT NULL,
        signature_field TEXT NOT NULL,
        signature_data TEXT,
        signed_document_html TEXT,
        signature_type TEXT NOT NULL DEFAULT 'electronic',
        status TEXT NOT NULL DEFAULT 'pending',
        provider TEXT DEFAULT 'local',
        external_id TEXT,
        invitation_token TEXT,
        ip_address TEXT,
        user_agent TEXT,
        signed_at TIMESTAMP,
        expires_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS signature_audit_log (
        id SERIAL PRIMARY KEY,
        signature_id INTEGER NOT NULL REFERENCES contract_signatures(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
        performed_by TEXT,
        details JSONB DEFAULT '{}'
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_contract_signatures_token ON contract_signatures(invitation_token);
      CREATE INDEX IF NOT EXISTS idx_contract_signatures_workflow ON contract_signatures(workflow_id);
    `).catch(() => {});

    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_templates_name_category ON contract_templates(name, category)
    `).catch(() => {});

    await db.execute(sql`ALTER TABLE contract_signatures ADD COLUMN IF NOT EXISTS signed_document_html TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE contract_signatures ADD COLUMN IF NOT EXISTS workflow_id INTEGER REFERENCES e_signature_workflow(id) ON DELETE CASCADE`).catch(() => {});
    await db.execute(sql`ALTER TABLE contract_signatures ADD COLUMN IF NOT EXISTS invitation_token TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE contract_signatures ADD COLUMN IF NOT EXISTS external_id TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE contract_signatures ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'local'`).catch(() => {});
    await db.execute(sql`ALTER TABLE contract_signatures ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP`).catch(() => {});
    await db.execute(sql`ALTER TABLE e_signature_workflow ADD COLUMN IF NOT EXISTS external_envelope_id TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE e_signature_workflow ADD COLUMN IF NOT EXISTS expiration_days INTEGER DEFAULT 30`).catch(() => {});
    await db.execute(sql`ALTER TABLE e_signature_workflow ADD COLUMN IF NOT EXISTS send_reminders BOOLEAN DEFAULT true`).catch(() => {});
    await db.execute(sql`ALTER TABLE e_signature_workflow ADD COLUMN IF NOT EXISTS reminder_days INTEGER DEFAULT 3`).catch(() => {});
    await db.execute(sql`ALTER TABLE e_signature_workflow ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP`).catch(() => {});
    await db.execute(sql`ALTER TABLE e_signature_workflow ADD COLUMN IF NOT EXISTS signature_order JSONB DEFAULT '[]'`).catch(() => {});
    await db.execute(sql`ALTER TABLE e_signature_workflow ADD COLUMN IF NOT EXISTS current_step INTEGER DEFAULT 0`).catch(() => {});
    await db.execute(sql`ALTER TABLE e_signature_workflow ADD COLUMN IF NOT EXISTS template_id INTEGER REFERENCES contract_templates(id) ON DELETE SET NULL`).catch(() => {});
    await db.execute(sql`ALTER TABLE e_signature_workflow ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()`).catch(() => {});

    for (const seed of CONTRACT_TEMPLATE_SEEDS) {
      await db.execute(
        sql`INSERT INTO contract_templates (name, description, category, template_content, template_variables, signature_fields, created_by, updated_by)
          VALUES (${seed.name}, ${seed.description}, ${seed.category}, ${seed.templateContent}, ${JSON.stringify(seed.templateVariables)}, ${JSON.stringify(seed.signatureFields)}, 'system', 'system')
          ON CONFLICT (name, category) DO NOTHING`
      ).catch(() => {});
    }

    logger.info("[ContractTemplates] Tables and seeds ensured");
  } catch (err: unknown) {
    logger.warn("[ContractTemplates] Seed error (non-fatal):", err instanceof Error ? err.message : String(err));
  }
}
