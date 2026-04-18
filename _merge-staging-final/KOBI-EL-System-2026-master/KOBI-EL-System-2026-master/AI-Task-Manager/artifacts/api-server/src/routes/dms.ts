import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { documentFilesTable, documentFoldersTable } from "@workspace/db/schema";
import { eq, and, or, desc, sql, ilike, inArray, isNull, isNotNull } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const router: IRouter = Router();

const uploadsDir = path.join(process.cwd(), "uploads", "documents");
fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, unique + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error(`סוג קובץ לא נתמך: ${file.mimetype}`));
  },
});

function requireAuth(req: Request, res: Response): string | null {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return null; }
  return userId;
}

function parseId(raw: string, res: Response): number | null {
  const id = parseInt(raw, 10);
  if (isNaN(id) || id <= 0) { res.status(400).json({ error: "Invalid ID" }); return null; }
  return id;
}

async function q(query: ReturnType<typeof sql>): Promise<any[]> {
  const result = await db.execute(query);
  return result.rows as any[];
}

async function qOne(query: ReturnType<typeof sql>): Promise<any | null> {
  const rows = await q(query);
  return rows[0] || null;
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function checkLegalHold(file: any, res: Response): boolean {
  if (file.is_legal_hold) {
    res.status(403).json({ error: "מסמך זה נמצא תחת עצירה משפטית ולא ניתן לשנות אותו" });
    return true;
  }
  return false;
}

async function isAdminOrManager(userId: string): Promise<boolean> {
  const user = await qOne(sql`SELECT role FROM users WHERE id = ${userId}`);
  return user && (user.role === "admin" || user.role === "manager" || user.role === "superadmin");
}

async function canAccessFile(userId: string, fileId: number): Promise<boolean> {
  if (await isAdminOrManager(userId)) return true;
  const file = await qOne(sql`SELECT uploaded_by FROM document_files WHERE id = ${fileId}`);
  return file && file.uploaded_by === userId;
}

async function createAutoVersion(fileId: number, file: any, userId: string, changeNote: string): Promise<void> {
  const currentVersion = file.current_version || 1;
  const newVersion = currentVersion + 1;

  await db.execute(sql`
    INSERT INTO document_versions (file_id, version_number, file_path, original_name, size, mime_type, change_note, created_by)
    VALUES (${fileId}, ${newVersion}, ${file.file_path || file.filePath}, ${file.original_name || file.originalName}, ${file.size}, ${file.mime_type || file.mimeType}, ${changeNote}, ${userId})
  `);

  await db.execute(sql`
    UPDATE document_files SET current_version = ${newVersion}, updated_at = NOW() WHERE id = ${fileId}
  `);
}

async function evaluateRoutingRules(file: any, workflow: any): Promise<string | null> {
  const rules = workflow.routing_rules || [];
  for (const rule of rules) {
    if (rule.condition === "size_above" && file.size > (rule.threshold || 0)) {
      return rule.assignTo || null;
    }
    if (rule.condition === "classification" && file.classification === rule.value) {
      return rule.assignTo || null;
    }
    if (rule.condition === "folder" && file.folder_id?.toString() === rule.value?.toString()) {
      return rule.assignTo || null;
    }
    if (rule.condition === "mime_type" && (file.mime_type || "").includes(rule.value || "")) {
      return rule.assignTo || null;
    }
  }
  return null;
}

router.get("/dms/search", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const search = (req.query.q as string) || "";
    const folderId = req.query.folderId ? parseInt(req.query.folderId as string) : null;
    const classification = req.query.classification as string;
    const tags = req.query.tags as string;
    const approvalStatus = req.query.approvalStatus as string;
    const legalHold = req.query.legalHold === "true";
    const module = req.query.module as string;

    const isAdmin = await isAdminOrManager(userId);
    const chunks: any[] = [];

    chunks.push(sql`SELECT df.*, f.name as folder_name, f.color as folder_color
      FROM document_files df
      LEFT JOIN document_folders f ON df.folder_id = f.id
      WHERE df.is_trashed = FALSE`);

    if (!isAdmin) {
      chunks.push(sql` AND df.uploaded_by = ${userId}`);
    }

    if (search) {
      const likeVal = `%${search}%`;
      chunks.push(sql` AND (
        df.name ILIKE ${likeVal} OR
        df.description ILIKE ${likeVal} OR
        df.ocr_text ILIKE ${likeVal} OR
        to_tsvector('simple', coalesce(df.name,'') || ' ' || coalesce(df.description,'') || ' ' || coalesce(df.ocr_text,'')) @@ plainto_tsquery('simple', ${search}) OR
        to_tsvector('english', coalesce(df.name,'') || ' ' || coalesce(df.description,'') || ' ' || coalesce(df.ocr_text,'')) @@ plainto_tsquery('english', ${search})
      )`);
    }

    if (folderId !== null) {
      chunks.push(sql` AND df.folder_id = ${folderId}`);
    }

    if (classification) {
      chunks.push(sql` AND df.classification = ${classification}`);
    }

    if (approvalStatus) {
      chunks.push(sql` AND df.approval_status = ${approvalStatus}`);
    }

    if (legalHold) {
      chunks.push(sql` AND df.is_legal_hold = TRUE`);
    }

    if (module) {
      chunks.push(sql` AND df.module = ${module}`);
    }

    if (tags) {
      const tagList = tags.split(",").map(t => t.trim()).filter(Boolean);
      for (const tag of tagList) {
        chunks.push(sql` AND ${tag} = ANY(df.tags)`);
      }
    }

    chunks.push(sql` ORDER BY df.created_at DESC LIMIT 100`);

    const finalQuery = sql.join(chunks, sql.raw(""));
    const result = await db.execute(finalQuery);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to search documents", detail: err?.message });
  }
});

router.get("/dms/files/:id/versions", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;

    if (!(await canAccessFile(userId, id))) {
      return res.status(403).json({ error: "אין לך הרשאה לצפות בגרסאות קובץ זה" });
    }

    const versions = await q(sql`
      SELECT * FROM document_versions
      WHERE file_id = ${id}
      ORDER BY version_number DESC
    `);

    res.json(versions);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch versions", detail: err?.message });
  }
});

router.post("/dms/files/:id/versions", upload.single("file"), async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;

    if (!(await canAccessFile(userId, id))) {
      return res.status(403).json({ error: "אין לך הרשאה להעלות גרסה לקובץ זה" });
    }

    const file = await qOne(sql`SELECT * FROM document_files WHERE id = ${id}`);
    if (!file) return res.status(404).json({ error: "File not found" });

    if (checkLegalHold(file, res)) return;

    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const changeNote = (req.body.changeNote as string) || "";
    const newVersion = (file.current_version || 1) + 1;

    await db.execute(sql`
      INSERT INTO document_versions (file_id, version_number, file_path, original_name, size, mime_type, change_note, created_by)
      VALUES (${id}, ${newVersion}, ${req.file.filename}, ${req.file.originalname}, ${req.file.size}, ${req.file.mimetype}, ${changeNote}, ${userId})
    `);

    await db.execute(sql`
      UPDATE document_files
      SET file_path = ${req.file.filename}, original_name = ${req.file.originalname}, size = ${req.file.size}, mime_type = ${req.file.mimetype}, current_version = ${newVersion}, updated_at = NOW()
      WHERE id = ${id}
    `);

    const version = await qOne(sql`
      SELECT * FROM document_versions WHERE file_id = ${id} AND version_number = ${newVersion}
    `);

    res.json(version);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to create version", detail: err?.message });
  }
});

router.get("/dms/files/:id/versions/:v1/diff/:v2", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;

    if (!(await canAccessFile(userId, id))) {
      return res.status(403).json({ error: "אין לך הרשאה לצפות בהשוואת גרסאות זו" });
    }

    const v1 = parseInt(req.params.v1, 10);
    const v2 = parseInt(req.params.v2, 10);
    if (isNaN(v1) || isNaN(v2)) return res.status(400).json({ error: "Invalid version numbers" });

    const version1 = await qOne(sql`
      SELECT * FROM document_versions WHERE file_id = ${id} AND version_number = ${v1}
    `);
    const version2 = await qOne(sql`
      SELECT * FROM document_versions WHERE file_id = ${id} AND version_number = ${v2}
    `);

    if (!version1 || !version2) return res.status(404).json({ error: "One or both versions not found" });

    const changes: Array<{ field: string; from: any; to: any }> = [];

    if (version1.original_name !== version2.original_name) {
      changes.push({ field: "original_name", from: version1.original_name, to: version2.original_name });
    }
    if (version1.size !== version2.size) {
      changes.push({ field: "size", from: version1.size, to: version2.size });
    }
    if (version1.mime_type !== version2.mime_type) {
      changes.push({ field: "mime_type", from: version1.mime_type, to: version2.mime_type });
    }

    let textDiff: { from: string; to: string } | null = null;
    const textTypes = ["text/plain", "text/csv", "application/json"];
    if (textTypes.includes(version1.mime_type) && textTypes.includes(version2.mime_type)) {
      try {
        const path1 = path.join(uploadsDir, version1.file_path);
        const path2 = path.join(uploadsDir, version2.file_path);
        if (fs.existsSync(path1) && fs.existsSync(path2)) {
          const text1 = fs.readFileSync(path1, "utf-8").substring(0, 50000);
          const text2 = fs.readFileSync(path2, "utf-8").substring(0, 50000);
          textDiff = { from: text1, to: text2 };
        }
      } catch {}
    }

    res.json({
      fileId: id,
      version1: { number: v1, name: version1.original_name, size: version1.size, mimeType: version1.mime_type, changeNote: version1.change_note, createdBy: version1.created_by, createdAt: version1.created_at },
      version2: { number: v2, name: version2.original_name, size: version2.size, mimeType: version2.mime_type, changeNote: version2.change_note, createdBy: version2.created_by, createdAt: version2.created_at },
      metadataChanges: changes,
      textDiff,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to generate diff", detail: err?.message });
  }
});

router.post("/dms/files/:id/rollback/:versionNumber", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;

    if (!(await canAccessFile(userId, id))) {
      return res.status(403).json({ error: "אין לך הרשאה לשחזר גרסה לקובץ זה" });
    }

    const versionNumber = parseInt(req.params.versionNumber, 10);

    const file = await qOne(sql`SELECT * FROM document_files WHERE id = ${id}`);
    if (!file) return res.status(404).json({ error: "File not found" });
    if (checkLegalHold(file, res)) return;

    const targetVersion = await qOne(sql`
      SELECT * FROM document_versions WHERE file_id = ${id} AND version_number = ${versionNumber}
    `);
    if (!targetVersion) return res.status(404).json({ error: "Version not found" });

    const newVersion = (file.current_version || 1) + 1;
    const changeNote = `שחזור מגרסה ${versionNumber}`;

    await db.execute(sql`
      INSERT INTO document_versions (file_id, version_number, file_path, original_name, size, mime_type, change_note, created_by)
      VALUES (${id}, ${newVersion}, ${targetVersion.file_path}, ${targetVersion.original_name}, ${targetVersion.size}, ${targetVersion.mime_type}, ${changeNote}, ${userId})
    `);

    await db.execute(sql`
      UPDATE document_files
      SET file_path = ${targetVersion.file_path}, original_name = ${targetVersion.original_name},
          size = ${targetVersion.size}, mime_type = ${targetVersion.mime_type},
          current_version = ${newVersion}, updated_at = NOW()
      WHERE id = ${id}
    `);

    res.json({ success: true, newVersion });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to rollback", detail: err?.message });
  }
});

router.get("/dms/approvals/inbox", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const approvals = await q(sql`
      SELECT da.*, df.name as file_name, df.mime_type as file_mime_type, df.size as file_size,
             df.folder_id, f.name as folder_name
      FROM dms_document_approvals da
      JOIN document_files df ON da.file_id = df.id
      LEFT JOIN document_folders f ON df.folder_id = f.id
      WHERE da.status = 'pending'
        AND (da.assigned_to = ${userId} OR da.assigned_to IS NULL)
      ORDER BY da.created_at DESC
    `);
    res.json(approvals);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch approval inbox", detail: err?.message });
  }
});

router.get("/dms/approvals", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const fileId = req.query.fileId ? parseInt(req.query.fileId as string) : null;

    let rows;
    if (fileId) {
      rows = await q(sql`
        SELECT da.*, df.name as file_name
        FROM dms_document_approvals da
        JOIN document_files df ON da.file_id = df.id
        WHERE da.file_id = ${fileId}
          AND (da.assigned_to = ${userId} OR da.requested_by = ${userId} OR da.assigned_to IS NULL)
        ORDER BY da.created_at DESC
      `);
    } else {
      rows = await q(sql`
        SELECT da.*, df.name as file_name
        FROM dms_document_approvals da
        JOIN document_files df ON da.file_id = df.id
        WHERE da.assigned_to = ${userId} OR da.requested_by = ${userId} OR da.assigned_to IS NULL
        ORDER BY da.created_at DESC
        LIMIT 200
      `);
    }
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch approvals", detail: err?.message });
  }
});

router.post("/dms/approvals/request", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const { fileId, workflowId, assignedTo, stepName, dueDate, comments } = req.body;
    if (!fileId) return res.status(400).json({ error: "fileId is required" });

    const file = await qOne(sql`SELECT * FROM document_files WHERE id = ${fileId}`);
    if (!file) return res.status(404).json({ error: "File not found" });
    if (checkLegalHold(file, res)) return;

    let steps: any[] = [];
    let routedAssignee = assignedTo;
    let currentStepIndex = 0;

    if (workflowId) {
      const workflow = await qOne(sql`SELECT * FROM document_approval_workflows WHERE id = ${workflowId} AND is_active = TRUE`);
      if (workflow) {
        steps = workflow.steps || [];
        const routeResult = await evaluateRoutingRules(file, workflow);
        if (routeResult && !assignedTo) {
          routedAssignee = routeResult;
        }
      }
    }

    const totalSteps = Math.max(steps.length, 1);
    const firstStep = steps.length > 0 ? steps[0] : null;
    const effectiveStepName = firstStep?.name || stepName || "אישור מסמך";
    const effectiveAssignee = firstStep?.assignee || routedAssignee || null;
    const escalationHours = firstStep?.escalationHours || null;
    const escalationAt = escalationHours ? new Date(Date.now() + escalationHours * 3600000).toISOString() : null;

    const [approval] = (await db.execute(sql`
      INSERT INTO dms_document_approvals (file_id, workflow_id, step_name, assigned_to, due_date, comments, requested_by, status, current_step, total_steps, escalation_deadline)
      VALUES (${fileId}, ${workflowId || null}, ${effectiveStepName}, ${effectiveAssignee}, ${dueDate || null}, ${comments || null}, ${userId}, 'pending', ${currentStepIndex}, ${totalSteps}, ${escalationAt}::timestamptz)
      RETURNING *
    `)).rows as any[];

    await db.execute(sql`
      UPDATE document_files SET approval_status = 'pending', approval_workflow_id = ${workflowId || null}, updated_at = NOW() WHERE id = ${fileId}
    `);

    res.json(approval);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to create approval request", detail: err?.message });
  }
});

router.post("/dms/approvals/:id/approve", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;

    const { comments } = req.body;

    const approval = await qOne(sql`SELECT * FROM dms_document_approvals WHERE id = ${id}`);
    if (!approval) return res.status(404).json({ error: "Approval not found" });
    if (approval.status !== "pending") return res.status(400).json({ error: "Approval is not pending" });

    if (approval.assigned_to && approval.assigned_to !== userId) {
      return res.status(403).json({ error: "אין לך הרשאה לאשר בקשה זו" });
    }

    const currentStep = approval.current_step || 0;
    const totalSteps = approval.total_steps || 1;
    const nextStep = currentStep + 1;

    if (nextStep < totalSteps && approval.workflow_id) {
      const workflow = await qOne(sql`SELECT * FROM document_approval_workflows WHERE id = ${approval.workflow_id}`);
      const steps = workflow?.steps || [];
      const nextStepDef = steps[nextStep];

      if (nextStepDef) {
        const escalationHours = nextStepDef.escalationHours || null;
        const escalationAt = escalationHours ? new Date(Date.now() + escalationHours * 3600000).toISOString() : null;

        await db.execute(sql`
          UPDATE dms_document_approvals
          SET current_step = ${nextStep}, step_name = ${nextStepDef.name || `שלב ${nextStep + 1}`},
              assigned_to = ${nextStepDef.assignee || null}, escalation_deadline = ${escalationAt}::timestamptz,
              updated_at = NOW()
          WHERE id = ${id}
        `);

        await db.execute(sql`
          INSERT INTO dms_approval_audit_log (approval_id, action, action_by, step_index, step_name, comments, created_at)
          VALUES (${id}, 'step_approved', ${userId}, ${currentStep}, ${approval.step_name}, ${comments || null}, NOW())
        `);

        return res.json({ success: true, status: "advanced_to_next_step", nextStep: nextStep, totalSteps });
      }
    }

    await db.execute(sql`
      UPDATE dms_document_approvals
      SET status = 'approved', action_by = ${userId}, action_at = NOW(), comments = ${comments || null}, updated_at = NOW()
      WHERE id = ${id}
    `);

    await db.execute(sql`
      INSERT INTO dms_approval_audit_log (approval_id, action, action_by, step_index, step_name, comments, created_at)
      VALUES (${id}, 'approved', ${userId}, ${currentStep}, ${approval.step_name}, ${comments || null}, NOW())
    `);

    await db.execute(sql`
      UPDATE document_files SET approval_status = 'approved', updated_at = NOW() WHERE id = ${approval.file_id}
    `);

    res.json({ success: true, status: "approved" });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to approve", detail: err?.message });
  }
});

router.post("/dms/approvals/:id/reject", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;

    const { comments } = req.body;
    if (!comments) return res.status(400).json({ error: "Comments are required for rejection" });

    const approval = await qOne(sql`SELECT * FROM dms_document_approvals WHERE id = ${id}`);
    if (!approval) return res.status(404).json({ error: "Approval not found" });
    if (approval.status !== "pending") return res.status(400).json({ error: "Approval is not pending" });

    if (approval.assigned_to && approval.assigned_to !== userId) {
      return res.status(403).json({ error: "אין לך הרשאה לדחות בקשה זו" });
    }

    await db.execute(sql`
      UPDATE dms_document_approvals
      SET status = 'rejected', action_by = ${userId}, action_at = NOW(), comments = ${comments}, updated_at = NOW()
      WHERE id = ${id}
    `);

    await db.execute(sql`
      INSERT INTO dms_approval_audit_log (approval_id, action, action_by, step_index, step_name, comments, created_at)
      VALUES (${id}, 'rejected', ${userId}, ${approval.current_step || 0}, ${approval.step_name}, ${comments}, NOW())
    `);

    await db.execute(sql`
      UPDATE document_files SET approval_status = 'rejected', updated_at = NOW() WHERE id = ${approval.file_id}
    `);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to reject", detail: err?.message });
  }
});

router.get("/dms/approvals/:id/audit-log", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;

    const approval = await qOne(sql`SELECT * FROM dms_document_approvals WHERE id = ${id}`);
    if (!approval) return res.status(404).json({ error: "Approval not found" });
    if (approval.assigned_to && approval.assigned_to !== userId && approval.requested_by !== userId) {
      return res.status(403).json({ error: "אין לך הרשאה לצפות ביומן פעולות זה" });
    }

    const logs = await q(sql`
      SELECT * FROM dms_approval_audit_log WHERE approval_id = ${id} ORDER BY created_at ASC
    `);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch audit log", detail: err?.message });
  }
});

router.get("/dms/approval-workflows", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  try {
    const workflows = await q(sql`SELECT * FROM document_approval_workflows WHERE is_active = TRUE ORDER BY name`);
    res.json(workflows);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch workflows", detail: err?.message });
  }
});

router.post("/dms/approval-workflows", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const { name, description, steps, routingRules } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });

    const [wf] = (await db.execute(sql`
      INSERT INTO document_approval_workflows (name, description, steps, routing_rules, created_by)
      VALUES (${name}, ${description || null}, ${JSON.stringify(steps || [])}::jsonb, ${JSON.stringify(routingRules || [])}::jsonb, ${userId})
      RETURNING *
    `)).rows as any[];

    res.json(wf);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to create workflow", detail: err?.message });
  }
});

router.post("/dms/share-links", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const { fileId, expiresInDays, allowDownload, requireWatermark, maxViews } = req.body;
    if (!fileId) return res.status(400).json({ error: "fileId is required" });

    if (!(await canAccessFile(userId, parseInt(fileId)))) {
      return res.status(403).json({ error: "אין לך הרשאה לשתף קובץ זה" });
    }

    const file = await qOne(sql`SELECT * FROM document_files WHERE id = ${fileId}`);
    if (!file) return res.status(404).json({ error: "File not found" });

    const token = generateToken();
    let expiresAt: string | null = null;
    if (expiresInDays) {
      const d = new Date();
      d.setDate(d.getDate() + parseInt(expiresInDays));
      expiresAt = d.toISOString();
    }

    const [link] = (await db.execute(sql`
      INSERT INTO document_share_links (file_id, token, created_by, expires_at, allow_download, require_watermark, max_views)
      VALUES (${fileId}, ${token}, ${userId}, ${expiresAt}::timestamptz, ${allowDownload !== false}, ${!!requireWatermark}, ${maxViews || null})
      RETURNING *
    `)).rows as any[];

    res.json({ ...link, shareUrl: `/api/dms/shared/${token}` });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to create share link", detail: err?.message });
  }
});

router.get("/dms/share-links", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const fileId = req.query.fileId ? parseInt(req.query.fileId as string) : null;
    const isAdmin = await isAdminOrManager(userId);

    let rows;
    if (fileId) {
      if (isAdmin) {
        rows = await q(sql`SELECT dsl.*, df.name as file_name FROM document_share_links dsl JOIN document_files df ON dsl.file_id = df.id WHERE dsl.file_id = ${fileId} ORDER BY dsl.created_at DESC`);
      } else {
        rows = await q(sql`SELECT dsl.*, df.name as file_name FROM document_share_links dsl JOIN document_files df ON dsl.file_id = df.id WHERE dsl.file_id = ${fileId} AND dsl.created_by = ${userId} ORDER BY dsl.created_at DESC`);
      }
    } else {
      if (isAdmin) {
        rows = await q(sql`SELECT dsl.*, df.name as file_name FROM document_share_links dsl JOIN document_files df ON dsl.file_id = df.id ORDER BY dsl.created_at DESC LIMIT 100`);
      } else {
        rows = await q(sql`SELECT dsl.*, df.name as file_name FROM document_share_links dsl JOIN document_files df ON dsl.file_id = df.id WHERE dsl.created_by = ${userId} ORDER BY dsl.created_at DESC LIMIT 100`);
      }
    }
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch share links", detail: err?.message });
  }
});

router.delete("/dms/share-links/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;

    const link = await qOne(sql`SELECT * FROM document_share_links WHERE id = ${id}`);
    if (!link) return res.status(404).json({ error: "Share link not found" });

    const isAdmin = await isAdminOrManager(userId);
    if (!isAdmin && link.created_by !== userId) {
      return res.status(403).json({ error: "אין לך הרשאה לבטל קישור שיתוף זה" });
    }

    await db.execute(sql`UPDATE document_share_links SET is_active = FALSE WHERE id = ${id}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to deactivate share link", detail: err?.message });
  }
});

router.get("/dms/shared/:token", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const link = await qOne(sql`
      SELECT dsl.*, df.name as file_name, df.mime_type, df.file_path, df.original_name, df.size
      FROM document_share_links dsl
      JOIN document_files df ON dsl.file_id = df.id
      WHERE dsl.token = ${token} AND dsl.is_active = TRUE
    `);

    if (!link) return res.status(404).json({ error: "קישור לא נמצא או לא פעיל" });

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      await db.execute(sql`UPDATE document_share_links SET is_active = FALSE WHERE token = ${token}`);
      return res.status(410).json({ error: "קישור פג תוקף" });
    }

    if (link.max_views && link.view_count >= link.max_views) {
      return res.status(403).json({ error: "הקישור הגיע למגבלת הצפיות" });
    }

    const accessEntry = { ip: req.ip, userAgent: req.get("user-agent"), at: new Date().toISOString() };
    await db.execute(sql`
      UPDATE document_share_links
      SET view_count = view_count + 1,
          access_log = access_log || ${JSON.stringify(accessEntry)}::jsonb
      WHERE token = ${token}
    `);

    const filePath = path.join(uploadsDir, link.file_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "קובץ לא נמצא" });

    if (link.allow_download) {
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(link.original_name)}"`);
    } else {
      res.setHeader("Content-Disposition", "inline");
    }
    res.setHeader("Content-Type", link.mime_type);

    if (link.require_watermark && link.mime_type === "text/plain") {
      const content = fs.readFileSync(filePath, "utf-8");
      const watermarkLine = `\n--- מסמך מסומן - נצפה על ידי ${accessEntry.ip} בתאריך ${accessEntry.at} ---\n`;
      res.send(watermarkLine + content + watermarkLine);
      return;
    }

    if (link.require_watermark) {
      res.setHeader("X-Watermark", "true");
      res.setHeader("X-Watermark-Text", `Shared document - viewed by ${accessEntry.ip} at ${accessEntry.at}`);
    }

    if (!link.allow_download) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
    }

    fs.createReadStream(filePath).pipe(res);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to serve shared document", detail: err?.message });
  }
});

router.get("/dms/share-links/:token/info", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const link = await qOne(sql`
      SELECT dsl.id, dsl.token, dsl.expires_at, dsl.allow_download, dsl.require_watermark, dsl.max_views, dsl.view_count, dsl.is_active, dsl.created_at,
             df.name as file_name, df.mime_type, df.size
      FROM document_share_links dsl
      JOIN document_files df ON dsl.file_id = df.id
      WHERE dsl.token = ${token}
    `);
    if (!link) return res.status(404).json({ error: "Not found" });
    res.json(link);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to get link info", detail: err?.message });
  }
});

router.post("/dms/files/:id/legal-hold", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const isAdmin = await isAdminOrManager(userId);
    if (!isAdmin) return res.status(403).json({ error: "נדרשת הרשאת מנהל להפעלת עצירה משפטית" });

    const id = parseId(req.params.id, res);
    if (id === null) return;

    const { caseName } = req.body;
    if (!caseName) return res.status(400).json({ error: "caseName is required" });

    await db.execute(sql`
      UPDATE document_files
      SET is_legal_hold = TRUE, legal_hold_case = ${caseName}, legal_hold_at = NOW(), legal_hold_by = ${userId}, updated_at = NOW()
      WHERE id = ${id}
    `);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to apply legal hold", detail: err?.message });
  }
});

router.post("/dms/files/:id/release-hold", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const isAdmin = await isAdminOrManager(userId);
    if (!isAdmin) return res.status(403).json({ error: "נדרשת הרשאת מנהל לשחרור עצירה משפטית" });

    const id = parseId(req.params.id, res);
    if (id === null) return;

    const { releaseNote } = req.body;

    await db.execute(sql`
      UPDATE document_files
      SET is_legal_hold = FALSE, legal_hold_case = NULL, legal_hold_at = NULL, legal_hold_by = NULL, updated_at = NOW()
      WHERE id = ${id}
    `);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to release legal hold", detail: err?.message });
  }
});

router.get("/dms/legal-holds", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const isAdmin = await isAdminOrManager(userId);
    if (!isAdmin) return res.status(403).json({ error: "נדרשת הרשאת מנהל לצפות בעצירות משפטיות" });

    const holds = await q(sql`SELECT * FROM document_legal_holds ORDER BY created_at DESC`);
    res.json(holds);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch legal holds", detail: err?.message });
  }
});

router.post("/dms/legal-holds", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const isAdmin = await isAdminOrManager(userId);
    if (!isAdmin) return res.status(403).json({ error: "נדרשת הרשאת מנהל ליצירת עצירה משפטית" });

    const { caseName, description, fileIds } = req.body;
    if (!caseName) return res.status(400).json({ error: "caseName is required" });

    const [hold] = (await db.execute(sql`
      INSERT INTO document_legal_holds (case_name, description, created_by, status)
      VALUES (${caseName}, ${description || null}, ${userId}, 'active')
      RETURNING *
    `)).rows as any[];

    if (Array.isArray(fileIds) && fileIds.length > 0) {
      for (const fId of fileIds) {
        await db.execute(sql`
          UPDATE document_files
          SET is_legal_hold = TRUE, legal_hold_case = ${caseName}, legal_hold_at = NOW(), legal_hold_by = ${userId}, updated_at = NOW()
          WHERE id = ${fId}
        `);
      }
    }

    res.json({ hold, filesAffected: fileIds?.length || 0 });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to create legal hold", detail: err?.message });
  }
});

router.post("/dms/legal-holds/:id/release", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const isAdmin = await isAdminOrManager(userId);
    if (!isAdmin) return res.status(403).json({ error: "נדרשת הרשאת מנהל לשחרור עצירה משפטית" });

    const id = parseId(req.params.id, res);
    if (id === null) return;

    const { releaseNote } = req.body;

    const hold = await qOne(sql`SELECT * FROM document_legal_holds WHERE id = ${id}`);
    if (!hold) return res.status(404).json({ error: "Legal hold not found" });
    if (hold.status !== "active") return res.status(400).json({ error: "Legal hold is not active" });

    await db.execute(sql`
      UPDATE document_legal_holds
      SET status = 'released', released_by = ${userId}, released_at = NOW(), release_note = ${releaseNote || null}, updated_at = NOW()
      WHERE id = ${id}
    `);

    await db.execute(sql`
      UPDATE document_files
      SET is_legal_hold = FALSE, legal_hold_case = NULL, legal_hold_at = NULL, legal_hold_by = NULL, updated_at = NOW()
      WHERE legal_hold_case = ${hold.case_name}
    `);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to release legal hold", detail: err?.message });
  }
});

router.get("/dms/files-on-hold", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const isAdmin = await isAdminOrManager(userId);
    if (!isAdmin) return res.status(403).json({ error: "נדרשת הרשאת מנהל" });
    const caseName = req.query.caseName as string;
    let rows;
    if (caseName) {
      rows = await q(sql`
        SELECT df.*, f.name as folder_name FROM document_files df
        LEFT JOIN document_folders f ON df.folder_id = f.id
        WHERE df.is_legal_hold = TRUE AND df.legal_hold_case = ${caseName}
        ORDER BY df.legal_hold_at DESC
      `);
    } else {
      rows = await q(sql`
        SELECT df.*, f.name as folder_name FROM document_files df
        LEFT JOIN document_folders f ON df.folder_id = f.id
        WHERE df.is_legal_hold = TRUE
        ORDER BY df.legal_hold_at DESC
      `);
    }
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch files on hold", detail: err?.message });
  }
});

router.get("/dms/stats", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  try {
    const stats = await qOne(sql`
      SELECT
        (SELECT COUNT(*) FROM document_files WHERE is_trashed = FALSE)::int as "totalFiles",
        (SELECT COUNT(*) FROM dms_document_approvals WHERE status = 'pending')::int as "pendingApprovals",
        (SELECT COUNT(*) FROM document_files WHERE is_legal_hold = TRUE)::int as "legalHoldFiles",
        (SELECT COUNT(*) FROM document_share_links WHERE is_active = TRUE)::int as "activeShareLinks"
    `);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch stats", detail: err?.message });
  }
});

router.post("/dms/files/:id/ocr", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;

    if (!(await canAccessFile(userId, id))) {
      return res.status(403).json({ error: "אין לך הרשאה להפעיל OCR על קובץ זה" });
    }

    const file = await qOne(sql`SELECT * FROM document_files WHERE id = ${id}`);
    if (!file) return res.status(404).json({ error: "File not found" });

    await db.execute(sql`
      UPDATE document_files SET ocr_status = 'processing', updated_at = NOW() WHERE id = ${id}
    `);

    const filePath = path.join(uploadsDir, file.file_path);
    const extractedText = await extractTextFromFile(filePath, file.mime_type, file.original_name);

    let classification = file.classification || "internal";
    const textLower = extractedText.toLowerCase();
    if (textLower.includes("חשבונית") || textLower.includes("invoice")) classification = "financial";
    else if (textLower.includes("חוזה") || textLower.includes("contract") || textLower.includes("הסכם")) classification = "legal";
    else if (textLower.includes("דו\"ח") || textLower.includes("report")) classification = "report";

    await db.execute(sql`
      UPDATE document_files
      SET ocr_text = ${extractedText}, ocr_status = 'completed', classification = ${classification}, updated_at = NOW()
      WHERE id = ${id}
    `);

    res.json({ success: true, extractedLength: extractedText.length, classification });
  } catch (err: any) {
    await db.execute(sql`UPDATE document_files SET ocr_status = 'failed' WHERE id = ${parseInt(req.params.id)}`).catch(() => {});
    res.status(500).json({ error: "OCR processing failed", detail: err?.message });
  }
});

router.post("/dms/files/:id/auto-version", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;

    if (!(await canAccessFile(userId, id))) {
      return res.status(403).json({ error: "אין לך הרשאה ליצור גרסה אוטומטית" });
    }

    const file = await qOne(sql`SELECT * FROM document_files WHERE id = ${id}`);
    if (!file) return res.status(404).json({ error: "File not found" });
    if (checkLegalHold(file, res)) return;

    const changeNote = (req.body.changeNote as string) || "עדכון אוטומטי";
    await createAutoVersion(id, file, userId, changeNote);

    res.json({ success: true, newVersion: (file.current_version || 1) + 1 });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to auto-version", detail: err?.message });
  }
});

async function processEscalations(): Promise<number> {
  try {
    const overdue = await q(sql`
      SELECT da.*, df.name as file_name
      FROM dms_document_approvals da
      JOIN document_files df ON da.file_id = df.id
      WHERE da.status = 'pending'
        AND da.escalation_deadline IS NOT NULL
        AND da.escalation_deadline < NOW()
    `);

    let escalated = 0;
    for (const approval of overdue) {
      const currentStep = approval.current_step || 0;
      const totalSteps = approval.total_steps || 1;

      let escalateTo: string | null = null;
      if (approval.workflow_id) {
        const workflow = await qOne(sql`SELECT * FROM document_approval_workflows WHERE id = ${approval.workflow_id}`);
        const steps = workflow?.steps || [];
        const currentStepDef = steps[currentStep];
        escalateTo = currentStepDef?.escalateTo || null;
      }

      if (escalateTo) {
        const newDeadline = new Date(Date.now() + 24 * 3600000).toISOString();
        await db.execute(sql`
          UPDATE dms_document_approvals
          SET assigned_to = ${escalateTo}, escalation_deadline = ${newDeadline}::timestamptz, updated_at = NOW()
          WHERE id = ${approval.id}
        `);
      } else {
        await db.execute(sql`
          UPDATE dms_document_approvals
          SET escalation_deadline = NULL, updated_at = NOW()
          WHERE id = ${approval.id}
        `);
      }

      await db.execute(sql`
        INSERT INTO dms_approval_audit_log (approval_id, action, action_by, step_index, step_name, comments, created_at)
        VALUES (${approval.id}, 'escalated', 'system', ${currentStep}, ${approval.step_name}, ${escalateTo ? `הועבר ל-${escalateTo} בעקבות חריגת זמן` : 'אזהרת חריגת זמן'}, NOW())
      `);
      escalated++;
    }
    return escalated;
  } catch (err: any) {
    console.error("[DMS-Escalation] Error processing escalations:", err?.message);
    return 0;
  }
}

const ESCALATION_INTERVAL = 15 * 60 * 1000;
setInterval(async () => {
  const count = await processEscalations();
  if (count > 0) console.log(`[DMS-Escalation] Processed ${count} overdue approvals`);
}, ESCALATION_INTERVAL);

router.post("/dms/escalations/process", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const isAdmin = await isAdminOrManager(userId);
    if (!isAdmin) return res.status(403).json({ error: "נדרשת הרשאת מנהל" });

    const count = await processEscalations();
    res.json({ success: true, escalated: count });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to process escalations", detail: err?.message });
  }
});

async function extractTextFromFile(filePath: string, mimeType: string, originalName: string): Promise<string> {
  if (mimeType === "text/plain" || mimeType === "text/csv") {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8").substring(0, 50000);
    }
  }

  if (mimeType === "application/pdf") {
    try {
      const pdfParse = (await import("pdf-parse")).default;
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return (data.text || "").substring(0, 50000);
    } catch (err: any) {
      console.warn(`[DMS-OCR] PDF extraction failed for ${originalName}: ${err?.message}`);
      return `[שגיאה בחילוץ טקסט מ-PDF: ${originalName}]`;
    }
  }

  if ((mimeType || "").startsWith("image/")) {
    try {
      const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL;
      const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      if (!baseUrl || !apiKey) {
        console.warn("[DMS-OCR] No AI API configured for image OCR");
        return "";
      }
      const imageData = fs.readFileSync(filePath);
      const base64Image = imageData.toString("base64");
      const dataUri = `data:${mimeType};base64,${base64Image}`;

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are an OCR assistant. Extract all visible text from the image. Return only the extracted text, preserving layout where possible. Support Hebrew and English text." },
            { role: "user", content: [
              { type: "image_url", image_url: { url: dataUri } },
              { type: "text", text: "Extract all text from this image." }
            ]}
          ],
          max_tokens: 4096
        })
      });

      if (response.ok) {
        const data = await response.json() as any;
        return (data.choices?.[0]?.message?.content || "").substring(0, 50000);
      }
      console.warn(`[DMS-OCR] AI vision OCR failed: ${response.status}`);
      return "";
    } catch (err: any) {
      console.warn(`[DMS-OCR] Image OCR failed for ${originalName}: ${err?.message}`);
      return "";
    }
  }

  return "";
}

export default router;
