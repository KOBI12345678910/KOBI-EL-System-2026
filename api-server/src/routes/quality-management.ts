import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

function s(v: unknown): string {
  if (v === null || v === undefined || v === "") return "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

function safeInt(v: unknown, fallback = 0): number {
  const n = parseInt(String(v), 10);
  return isNaN(n) ? fallback : n;
}

function safeDate(v: unknown): string {
  if (!v) return "NULL";
  const str = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return `'${str}'`;
  }
  return "NULL";
}

async function q(query: string): Promise<Record<string, unknown>[]> {
  try {
    const r = await db.execute(sql.raw(query));
    const rows = (r as unknown as { rows?: Record<string, unknown>[] }).rows;
    return rows || [];
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[QMS] query error:", msg);
    return [];
  }
}

async function ensureTables() {
  await q(`CREATE TABLE IF NOT EXISTS quality_policies (
    id SERIAL PRIMARY KEY,
    policy_number VARCHAR(32) UNIQUE,
    title VARCHAR(300) NOT NULL,
    content TEXT,
    scope TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    version_label VARCHAR(20) DEFAULT '1.0',
    status VARCHAR(30) DEFAULT 'draft',
    is_current BOOLEAN DEFAULT false,
    parent_id INTEGER,
    author VARCHAR(200),
    approved_by VARCHAR(200),
    approved_at TIMESTAMP,
    effective_date DATE,
    review_date DATE,
    change_summary TEXT,
    tags TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS quality_objectives (
    id SERIAL PRIMARY KEY,
    objective_number VARCHAR(32) UNIQUE,
    title VARCHAR(300) NOT NULL,
    description TEXT,
    policy_id INTEGER REFERENCES quality_policies(id) ON DELETE SET NULL,
    target_value VARCHAR(100),
    current_value VARCHAR(100),
    unit VARCHAR(50),
    due_date DATE,
    owner VARCHAR(200),
    department VARCHAR(200),
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(30) DEFAULT 'active',
    progress INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS quality_documents (
    id SERIAL PRIMARY KEY,
    document_number VARCHAR(50) UNIQUE,
    title VARCHAR(300) NOT NULL,
    document_type VARCHAR(50) NOT NULL DEFAULT 'procedure',
    category VARCHAR(100),
    description TEXT,
    content TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    revision_label VARCHAR(20) DEFAULT 'A',
    status VARCHAR(30) DEFAULT 'draft',
    iso_standard VARCHAR(100),
    department VARCHAR(200),
    owner VARCHAR(200),
    author VARCHAR(200),
    effective_date DATE,
    review_date DATE,
    expiry_date DATE,
    change_summary TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS document_approvals (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES quality_documents(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL DEFAULT 1,
    approver_name VARCHAR(200) NOT NULL,
    approver_role VARCHAR(100),
    status VARCHAR(30) DEFAULT 'pending',
    comments TEXT,
    acted_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS document_distribution (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES quality_documents(id) ON DELETE CASCADE,
    recipient_name VARCHAR(200) NOT NULL,
    recipient_email VARCHAR(300),
    recipient_department VARCHAR(200),
    sent_at TIMESTAMP DEFAULT NOW(),
    acknowledged_at TIMESTAMP,
    acknowledgment_notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS document_revisions (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES quality_documents(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    revision_label VARCHAR(20),
    title VARCHAR(300),
    content TEXT,
    change_summary TEXT,
    changed_by VARCHAR(200),
    status VARCHAR(30),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS iso_certifications (
    id SERIAL PRIMARY KEY,
    standard VARCHAR(50) NOT NULL,
    scope TEXT,
    certification_body VARCHAR(300),
    certificate_number VARCHAR(100),
    status VARCHAR(30) DEFAULT 'active',
    issue_date DATE,
    expiry_date DATE,
    last_audit_date DATE,
    next_audit_date DATE,
    auditor VARCHAR(200),
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);
}

ensureTables().catch((e: unknown) => console.error("[QMS] ensureTables error:", e instanceof Error ? e.message : e));

// ─────────────────────────────────────────────
// ISO Certifications
// ─────────────────────────────────────────────
router.get("/api/quality/certifications", async (_req: Request, res: Response) => {
  const rows = await q(`SELECT * FROM iso_certifications WHERE is_active = true ORDER BY standard`);
  res.json(rows);
});

router.post("/api/quality/certifications", async (req: Request, res: Response) => {
  const b = req.body || {};
  const rows = await q(`INSERT INTO iso_certifications (standard, scope, certification_body, certificate_number, status, issue_date, expiry_date, last_audit_date, next_audit_date, auditor, notes)
    VALUES (${s(b.standard)}, ${s(b.scope)}, ${s(b.certificationBody)}, ${s(b.certificateNumber)}, ${s(b.status || "active")}, ${safeDate(b.issueDate)}, ${safeDate(b.expiryDate)}, ${safeDate(b.lastAuditDate)}, ${safeDate(b.nextAuditDate)}, ${s(b.auditor)}, ${s(b.notes)})
    RETURNING *`);
  res.json(rows[0] || {});
});

router.put("/api/quality/certifications/:id", async (req: Request, res: Response) => {
  const id = safeInt(req.params.id);
  const b = req.body || {};
  const rows = await q(`UPDATE iso_certifications SET standard=${s(b.standard)}, scope=${s(b.scope)}, certification_body=${s(b.certificationBody)}, certificate_number=${s(b.certificateNumber)}, status=${s(b.status)}, issue_date=${safeDate(b.issueDate)}, expiry_date=${safeDate(b.expiryDate)}, last_audit_date=${safeDate(b.lastAuditDate)}, next_audit_date=${safeDate(b.nextAuditDate)}, auditor=${s(b.auditor)}, notes=${s(b.notes)}, updated_at=NOW()
    WHERE id=${id} RETURNING *`);
  res.json(rows[0] || {});
});

router.delete("/api/quality/certifications/:id", async (req: Request, res: Response) => {
  const id = safeInt(req.params.id);
  await q(`UPDATE iso_certifications SET is_active=false, updated_at=NOW() WHERE id=${id}`);
  res.json({ success: true });
});

// ─────────────────────────────────────────────
// Quality Policies
// ─────────────────────────────────────────────
router.get("/api/quality/policies", async (_req: Request, res: Response) => {
  const rows = await q(`SELECT * FROM quality_policies WHERE is_active = true ORDER BY id DESC`);
  res.json(rows);
});

router.post("/api/quality/policies", async (req: Request, res: Response) => {
  const b = req.body || {};
  // Generate policy number
  const cnt = await q(`SELECT COUNT(*) as c FROM quality_policies`);
  const num = safeInt((cnt[0] as any)?.c, 0) + 1;
  const policyNumber = `QP-${String(num).padStart(4, "0")}`;

  // Mark previous as not current if setting this as current
  if (b.isCurrent) {
    await q(`UPDATE quality_policies SET is_current=false WHERE is_active=true`);
  }

  const rows = await q(`INSERT INTO quality_policies (policy_number, title, content, scope, version, version_label, status, is_current, author, approved_by, effective_date, review_date, change_summary, tags)
    VALUES (${s(policyNumber)}, ${s(b.title)}, ${s(b.content)}, ${s(b.scope)}, 1, ${s(b.versionLabel || "1.0")}, ${s(b.status || "draft")}, ${b.isCurrent ? "true" : "false"}, ${s(b.author)}, ${s(b.approvedBy)}, ${safeDate(b.effectiveDate)}, ${safeDate(b.reviewDate)}, ${s(b.changeSummary)}, ${s(b.tags)})
    RETURNING *`);
  res.json(rows[0] || {});
});

router.put("/api/quality/policies/:id", async (req: Request, res: Response) => {
  const id = safeInt(req.params.id);
  const b = req.body || {};

  if (b.isCurrent) {
    await q(`UPDATE quality_policies SET is_current=false WHERE is_active=true`);
  }

  const rows = await q(`UPDATE quality_policies SET title=${s(b.title)}, content=${s(b.content)}, scope=${s(b.scope)}, status=${s(b.status)}, is_current=${b.isCurrent ? "true" : "false"}, author=${s(b.author)}, approved_by=${s(b.approvedBy)}, approved_at=${b.approvedAt ? `'${b.approvedAt}'` : "NULL"}, effective_date=${safeDate(b.effectiveDate)}, review_date=${safeDate(b.reviewDate)}, change_summary=${s(b.changeSummary)}, tags=${s(b.tags)}, updated_at=NOW()
    WHERE id=${id} RETURNING *`);
  res.json(rows[0] || {});
});

router.post("/api/quality/policies/:id/new-version", async (req: Request, res: Response) => {
  const id = safeInt(req.params.id);
  const b = req.body || {};

  // Get current policy
  const current = await q(`SELECT * FROM quality_policies WHERE id=${id} AND is_active=true`);
  if (!current[0]) return res.status(404).json({ error: "Policy not found" });

  const pol = current[0] as any;
  const newVersion = safeInt(pol.version, 1) + 1;
  const newLabel = b.versionLabel || `${newVersion}.0`;

  // Archive old
  await q(`UPDATE quality_policies SET is_current=false, status='archived', updated_at=NOW() WHERE id=${id}`);

  // Create new version
  const cnt = await q(`SELECT COUNT(*) as c FROM quality_policies`);
  const num = safeInt((cnt[0] as any)?.c, 0) + 1;
  const policyNumber = `QP-${String(num).padStart(4, "0")}`;

  const rows = await q(`INSERT INTO quality_policies (policy_number, title, content, scope, version, version_label, status, is_current, parent_id, author, approved_by, effective_date, review_date, change_summary, tags)
    VALUES (${s(policyNumber)}, ${s(b.title || pol.title)}, ${s(b.content || pol.content)}, ${s(b.scope || pol.scope)}, ${newVersion}, ${s(newLabel)}, ${s(b.status || "draft")}, false, ${id}, ${s(b.author || pol.author)}, ${s(b.approvedBy || pol.approved_by)}, ${safeDate(b.effectiveDate || pol.effective_date)}, ${safeDate(b.reviewDate || pol.review_date)}, ${s(b.changeSummary)}, ${s(b.tags || pol.tags)})
    RETURNING *`);
  res.json(rows[0] || {});
});

router.get("/api/quality/policies/:id/history", async (req: Request, res: Response) => {
  const id = safeInt(req.params.id);
  // Traverse parent chain
  const rows = await q(`WITH RECURSIVE policy_chain AS (
    SELECT * FROM quality_policies WHERE id=${id} AND is_active=true
    UNION ALL
    SELECT p.* FROM quality_policies p INNER JOIN policy_chain pc ON p.id = pc.parent_id WHERE p.is_active=true
  ) SELECT * FROM policy_chain ORDER BY version DESC`);
  res.json(rows);
});

router.delete("/api/quality/policies/:id", async (req: Request, res: Response) => {
  const id = safeInt(req.params.id);
  await q(`UPDATE quality_policies SET is_active=false, updated_at=NOW() WHERE id=${id}`);
  res.json({ success: true });
});

// ─────────────────────────────────────────────
// Quality Objectives
// ─────────────────────────────────────────────
router.get("/api/quality/objectives", async (_req: Request, res: Response) => {
  const rows = await q(`SELECT qo.*, qp.title as policy_title FROM quality_objectives qo LEFT JOIN quality_policies qp ON qp.id = qo.policy_id WHERE qo.is_active = true ORDER BY qo.id DESC`);
  res.json(rows);
});

router.post("/api/quality/objectives", async (req: Request, res: Response) => {
  const b = req.body || {};
  const cnt = await q(`SELECT COUNT(*) as c FROM quality_objectives`);
  const num = safeInt((cnt[0] as any)?.c, 0) + 1;
  const objNumber = `OBJ-${String(num).padStart(4, "0")}`;

  const rows = await q(`INSERT INTO quality_objectives (objective_number, title, description, policy_id, target_value, current_value, unit, due_date, owner, department, priority, status, progress)
    VALUES (${s(objNumber)}, ${s(b.title)}, ${s(b.description)}, ${b.policyId ? safeInt(b.policyId) : "NULL"}, ${s(b.targetValue)}, ${s(b.currentValue)}, ${s(b.unit)}, ${safeDate(b.dueDate)}, ${s(b.owner)}, ${s(b.department)}, ${s(b.priority || "medium")}, ${s(b.status || "active")}, ${safeInt(b.progress, 0)})
    RETURNING *`);
  res.json(rows[0] || {});
});

router.put("/api/quality/objectives/:id", async (req: Request, res: Response) => {
  const id = safeInt(req.params.id);
  const b = req.body || {};
  const rows = await q(`UPDATE quality_objectives SET title=${s(b.title)}, description=${s(b.description)}, policy_id=${b.policyId ? safeInt(b.policyId) : "NULL"}, target_value=${s(b.targetValue)}, current_value=${s(b.currentValue)}, unit=${s(b.unit)}, due_date=${safeDate(b.dueDate)}, owner=${s(b.owner)}, department=${s(b.department)}, priority=${s(b.priority)}, status=${s(b.status)}, progress=${safeInt(b.progress, 0)}, updated_at=NOW()
    WHERE id=${id} RETURNING *`);
  res.json(rows[0] || {});
});

router.delete("/api/quality/objectives/:id", async (req: Request, res: Response) => {
  const id = safeInt(req.params.id);
  await q(`UPDATE quality_objectives SET is_active=false, updated_at=NOW() WHERE id=${id}`);
  res.json({ success: true });
});

// ─────────────────────────────────────────────
// Quality Documents
// ─────────────────────────────────────────────
router.get("/api/quality/documents", async (_req: Request, res: Response) => {
  const rows = await q(`SELECT qd.*, 
    (SELECT COUNT(*) FROM document_approvals da WHERE da.document_id=qd.id AND da.is_active=true) as approval_steps,
    (SELECT COUNT(*) FROM document_approvals da WHERE da.document_id=qd.id AND da.status='approved' AND da.is_active=true) as approved_steps,
    (SELECT COUNT(*) FROM document_distribution dd WHERE dd.document_id=qd.id AND dd.is_active=true) as distribution_count,
    (SELECT COUNT(*) FROM document_distribution dd WHERE dd.document_id=qd.id AND dd.acknowledged_at IS NOT NULL AND dd.is_active=true) as acknowledged_count
    FROM quality_documents qd WHERE qd.is_active = true ORDER BY qd.id DESC`);
  res.json(rows);
});

router.get("/api/quality/documents/:id", async (req: Request, res: Response) => {
  const id = safeInt(req.params.id);
  const docs = await q(`SELECT * FROM quality_documents WHERE id=${id} AND is_active=true`);
  if (!docs[0]) return res.status(404).json({ error: "Not found" });

  const approvals = await q(`SELECT * FROM document_approvals WHERE document_id=${id} AND is_active=true ORDER BY step_order`);
  const distribution = await q(`SELECT * FROM document_distribution WHERE document_id=${id} AND is_active=true ORDER BY sent_at DESC`);
  const revisions = await q(`SELECT * FROM document_revisions WHERE document_id=${id} ORDER BY version DESC`);

  res.json({ ...docs[0], approvals, distribution, revisions });
});

router.post("/api/quality/documents", async (req: Request, res: Response) => {
  const b = req.body || {};
  const cnt = await q(`SELECT COUNT(*) as c FROM quality_documents`);
  const num = safeInt((cnt[0] as any)?.c, 0) + 1;
  const docNumber = `QD-${String(num).padStart(4, "0")}`;

  const rows = await q(`INSERT INTO quality_documents (document_number, title, document_type, category, description, content, version, revision_label, status, iso_standard, department, owner, author, effective_date, review_date, expiry_date, change_summary)
    VALUES (${s(docNumber)}, ${s(b.title)}, ${s(b.documentType || "procedure")}, ${s(b.category)}, ${s(b.description)}, ${s(b.content)}, 1, ${s(b.revisionLabel || "A")}, ${s(b.status || "draft")}, ${s(b.isoStandard)}, ${s(b.department)}, ${s(b.owner)}, ${s(b.author)}, ${safeDate(b.effectiveDate)}, ${safeDate(b.reviewDate)}, ${safeDate(b.expiryDate)}, ${s(b.changeSummary)})
    RETURNING *`);

  const doc = rows[0] as any;

  // Save initial revision
  if (doc?.id) {
    await q(`INSERT INTO document_revisions (document_id, version, revision_label, title, content, change_summary, changed_by, status)
      VALUES (${doc.id}, 1, ${s(b.revisionLabel || "A")}, ${s(b.title)}, ${s(b.content)}, ${s("Initial version")}, ${s(b.author)}, ${s(b.status || "draft")})`);
  }

  res.json(doc || {});
});

router.put("/api/quality/documents/:id", async (req: Request, res: Response) => {
  const id = safeInt(req.params.id);
  const b = req.body || {};

  // Get current doc
  const curr = await q(`SELECT * FROM quality_documents WHERE id=${id}`);
  const doc = curr[0] as any;
  if (!doc) return res.status(404).json({ error: "Not found" });

  const rows = await q(`UPDATE quality_documents SET title=${s(b.title)}, document_type=${s(b.documentType)}, category=${s(b.category)}, description=${s(b.description)}, content=${s(b.content)}, iso_standard=${s(b.isoStandard)}, department=${s(b.department)}, owner=${s(b.owner)}, author=${s(b.author)}, effective_date=${safeDate(b.effectiveDate)}, review_date=${safeDate(b.reviewDate)}, expiry_date=${safeDate(b.expiryDate)}, change_summary=${s(b.changeSummary)}, updated_at=NOW()
    WHERE id=${id} RETURNING *`);
  res.json(rows[0] || {});
});

router.delete("/api/quality/documents/:id", async (req: Request, res: Response) => {
  const id = safeInt(req.params.id);
  await q(`UPDATE quality_documents SET is_active=false, updated_at=NOW() WHERE id=${id}`);
  res.json({ success: true });
});

// New version of document
router.post("/api/quality/documents/:id/new-version", async (req: Request, res: Response) => {
  const id = safeInt(req.params.id);
  const b = req.body || {};

  const curr = await q(`SELECT * FROM quality_documents WHERE id=${id} AND is_active=true`);
  const doc = curr[0] as any;
  if (!doc) return res.status(404).json({ error: "Not found" });

  const newVersion = safeInt(doc.version, 1) + 1;
  // Increment revision label: A -> B -> C ...
  const currentLabel = String(doc.revision_label || "A");
  const charCode = currentLabel.charCodeAt(0) + 1;
  const newLabel = b.revisionLabel || String.fromCharCode(charCode > 90 ? 65 : charCode);

  // Archive old revision
  await q(`UPDATE quality_documents SET status='superseded', updated_at=NOW() WHERE id=${id}`);

  const rows = await q(`INSERT INTO quality_documents (document_number, title, document_type, category, description, content, version, revision_label, status, iso_standard, department, owner, author, effective_date, review_date, expiry_date, change_summary)
    VALUES (${s(doc.document_number + `-R${newVersion}`)}, ${s(b.title || doc.title)}, ${s(doc.document_type)}, ${s(doc.category)}, ${s(b.description || doc.description)}, ${s(b.content || doc.content)}, ${newVersion}, ${s(newLabel)}, ${s("draft")}, ${s(doc.iso_standard)}, ${s(doc.department)}, ${s(doc.owner)}, ${s(b.author || doc.author)}, ${safeDate(b.effectiveDate || doc.effective_date)}, ${safeDate(b.reviewDate || doc.review_date)}, ${safeDate(doc.expiry_date)}, ${s(b.changeSummary)})
    RETURNING *`);

  const newDoc = rows[0] as any;
  if (newDoc?.id) {
    await q(`INSERT INTO document_revisions (document_id, version, revision_label, title, content, change_summary, changed_by, status)
      VALUES (${newDoc.id}, ${newVersion}, ${s(newLabel)}, ${s(newDoc.title)}, ${s(newDoc.content)}, ${s(b.changeSummary)}, ${s(b.author || doc.author)}, 'draft')`);
  }

  res.json(newDoc || {});
});

// ─────────────────────────────────────────────
// Document Approval Workflow
// ─────────────────────────────────────────────
router.get("/api/quality/documents/:id/approvals", async (req: Request, res: Response) => {
  const id = safeInt(req.params.id);
  const rows = await q(`SELECT * FROM document_approvals WHERE document_id=${id} AND is_active=true ORDER BY step_order`);
  res.json(rows);
});

router.post("/api/quality/documents/:id/approvals", async (req: Request, res: Response) => {
  const id = safeInt(req.params.id);
  const b = req.body || {};
  const rows = await q(`INSERT INTO document_approvals (document_id, step_order, approver_name, approver_role, status)
    VALUES (${id}, ${safeInt(b.stepOrder, 1)}, ${s(b.approverName)}, ${s(b.approverRole)}, 'pending')
    RETURNING *`);
  res.json(rows[0] || {});
});

router.put("/api/quality/documents/:docId/approvals/:approvalId", async (req: Request, res: Response) => {
  const approvalId = safeInt(req.params.approvalId);
  const b = req.body || {};
  const docId = safeInt(req.params.docId);

  const rows = await q(`UPDATE document_approvals SET status=${s(b.status)}, comments=${s(b.comments)}, acted_at=NOW(), updated_at=NOW()
    WHERE id=${approvalId} RETURNING *`);

  // Check if all approved -> update doc status
  if (b.status === "approved") {
    const steps = await q(`SELECT * FROM document_approvals WHERE document_id=${docId} AND is_active=true`);
    const allApproved = steps.every((st: any) => st.status === "approved");
    if (allApproved) {
      await q(`UPDATE quality_documents SET status='approved', updated_at=NOW() WHERE id=${docId}`);
    }
  } else if (b.status === "rejected") {
    await q(`UPDATE quality_documents SET status='rejected', updated_at=NOW() WHERE id=${docId}`);
  }

  res.json(rows[0] || {});
});

// Submit document for review
router.post("/api/quality/documents/:id/submit", async (req: Request, res: Response) => {
  const id = safeInt(req.params.id);
  await q(`UPDATE quality_documents SET status='in_review', updated_at=NOW() WHERE id=${id}`);
  res.json({ success: true });
});

// Publish document
router.post("/api/quality/documents/:id/publish", async (req: Request, res: Response) => {
  const id = safeInt(req.params.id);
  const b = req.body || {};
  await q(`UPDATE quality_documents SET status='published', effective_date=${safeDate(b.effectiveDate) !== "NULL" ? safeDate(b.effectiveDate) : "CURRENT_DATE"}, updated_at=NOW() WHERE id=${id}`);
  // Save to revisions as published
  const doc = await q(`SELECT * FROM quality_documents WHERE id=${id}`);
  if (doc[0]) {
    const d = doc[0] as any;
    await q(`INSERT INTO document_revisions (document_id, version, revision_label, title, content, change_summary, changed_by, status)
      VALUES (${id}, ${safeInt(d.version)}, ${s(d.revision_label)}, ${s(d.title)}, ${s(d.content)}, ${s("Published")}, ${s(b.publishedBy)}, 'published')`);
  }
  res.json({ success: true });
});

// ─────────────────────────────────────────────
// Document Distribution
// ─────────────────────────────────────────────
router.get("/api/quality/documents/:id/distribution", async (req: Request, res: Response) => {
  const id = safeInt(req.params.id);
  const rows = await q(`SELECT * FROM document_distribution WHERE document_id=${id} AND is_active=true ORDER BY sent_at DESC`);
  res.json(rows);
});

router.post("/api/quality/documents/:id/distribution", async (req: Request, res: Response) => {
  const id = safeInt(req.params.id);
  const b = req.body || {};
  const rows = await q(`INSERT INTO document_distribution (document_id, recipient_name, recipient_email, recipient_department, sent_at)
    VALUES (${id}, ${s(b.recipientName)}, ${s(b.recipientEmail)}, ${s(b.recipientDepartment)}, NOW())
    RETURNING *`);
  res.json(rows[0] || {});
});

router.post("/api/quality/documents/:docId/distribution/:distId/acknowledge", async (req: Request, res: Response) => {
  const distId = safeInt(req.params.distId);
  const b = req.body || {};
  const rows = await q(`UPDATE document_distribution SET acknowledged_at=NOW(), acknowledgment_notes=${s(b.notes)}, updated_at=NOW()
    WHERE id=${distId} RETURNING *`);
  res.json(rows[0] || {});
});

// ─────────────────────────────────────────────
// Document Revisions
// ─────────────────────────────────────────────
router.get("/api/quality/documents/:id/revisions", async (req: Request, res: Response) => {
  const id = safeInt(req.params.id);
  const rows = await q(`SELECT * FROM document_revisions WHERE document_id=${id} ORDER BY version DESC`);
  res.json(rows);
});

export default router;
