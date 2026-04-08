import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db } from "@workspace/db";
import { documentFoldersTable, documentFilesTable, documentTagsTable } from "@workspace/db/schema";
import { eq, and, or, desc, sql, ilike, SQL } from "drizzle-orm";
import { validateSession } from "../lib/auth";

const router: IRouter = Router();

const uploadsDir = path.join(process.cwd(), "uploads", "documents");
const thumbnailsDir = path.join(uploadsDir, "thumbnails");
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(thumbnailsDir, { recursive: true });

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
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`סוג קובץ לא נתמך: ${file.mimetype}`));
    }
  },
});

function requireAuth(req: Request, res: Response): string | null {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return userId;
}

function parseId(raw: string, res: Response): number | null {
  const id = parseInt(raw, 10);
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ error: "Invalid ID" });
    return null;
  }
  return id;
}

export async function seedDefaultDocumentFolders() {
  const existing = await db.select().from(documentFoldersTable).where(eq(documentFoldersTable.isSystem, true));
  if (existing.length > 0) return;

  const defaultFolders = [
    { name: "Sales", color: "#3b82f6", icon: "folder", isSystem: true, createdBy: "system" },
    { name: "Purchase", color: "#8b5cf6", icon: "folder", isSystem: true, createdBy: "system" },
    { name: "2026", color: "#10b981", icon: "folder", isSystem: true, createdBy: "system" },
    { name: "Annual Closing", color: "#f59e0b", icon: "folder", isSystem: true, createdBy: "system" },
    { name: "כספים", color: "#ef4444", icon: "folder", isSystem: true, createdBy: "system" },
    { name: "Bank", color: "#06b6d4", icon: "folder", isSystem: true, createdBy: "system" },
    { name: "Miscellaneous", color: "#6b7280", icon: "folder", isSystem: true, createdBy: "system" },
    { name: "Insurances", color: "#f97316", icon: "folder", isSystem: true, createdBy: "system" },
    { name: "חשבוני", color: "#84cc16", icon: "folder", isSystem: true, createdBy: "system" },
    { name: "הלוואות", color: "#ec4899", icon: "folder", isSystem: true, createdBy: "system" },
    { name: "דואר נכנס", color: "#14b8a6", icon: "folder", isSystem: true, createdBy: "system" },
    { name: "שיווק", color: "#a855f7", icon: "folder", isSystem: true, createdBy: "system" },
  ];

  for (const f of defaultFolders) {
    await db.insert(documentFoldersTable).values(f).onConflictDoNothing();
  }
}

function folderAccessCondition(userId: string): SQL {
  return or(
    eq(documentFoldersTable.isSystem, true),
    eq(documentFoldersTable.createdBy, userId)
  )!;
}

router.get("/document-folders", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const folders = await db
      .select()
      .from(documentFoldersTable)
      .where(and(
        eq(documentFoldersTable.isTrashed, false),
        folderAccessCondition(userId)
      ))
      .orderBy(documentFoldersTable.name);

    const fileCounts = await db
      .select({
        folderId: documentFilesTable.folderId,
        count: sql<number>`count(*)::int`,
      })
      .from(documentFilesTable)
      .where(and(
        eq(documentFilesTable.isTrashed, false),
        eq(documentFilesTable.uploadedBy, userId)
      ))
      .groupBy(documentFilesTable.folderId);

    const countMap: Record<number, number> = {};
    for (const r of fileCounts) {
      if (r.folderId !== null) countMap[r.folderId] = r.count;
    }

    res.json(folders.map(f => ({ ...f, fileCount: countMap[f.id] || 0 })));
  } catch {
    res.status(500).json({ error: "Failed to fetch folders" });
  }
});

router.post("/document-folders", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const { name, parentId, color, icon, description } = req.body as {
      name?: string;
      parentId?: number;
      color?: string;
      icon?: string;
      description?: string;
    };
    if (!name) return res.status(400).json({ error: "Name is required" });

    const [folder] = await db
      .insert(documentFoldersTable)
      .values({ name, parentId: parentId || null, color, icon, description, createdBy: userId })
      .returning();
    res.json(folder);
  } catch {
    res.status(500).json({ error: "Failed to create folder" });
  }
});

router.put("/document-folders/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const { name, color, icon, description, parentId } = req.body as {
      name?: string;
      color?: string;
      icon?: string;
      description?: string;
      parentId?: number;
    };

    const [existing] = await db.select().from(documentFoldersTable).where(eq(documentFoldersTable.id, id));
    if (!existing) return res.status(404).json({ error: "Folder not found" });
    if (existing.isSystem) return res.status(403).json({ error: "Cannot modify system folders" });
    if (existing.createdBy !== userId) return res.status(403).json({ error: "Access denied" });

    const [folder] = await db
      .update(documentFoldersTable)
      .set({ name, color, icon, description, parentId: parentId || null, updatedAt: new Date() })
      .where(eq(documentFoldersTable.id, id))
      .returning();
    res.json(folder);
  } catch {
    res.status(500).json({ error: "Failed to update folder" });
  }
});

router.delete("/document-folders/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;

    const [existing] = await db.select().from(documentFoldersTable).where(eq(documentFoldersTable.id, id));
    if (!existing) return res.status(404).json({ error: "Folder not found" });
    if (existing.isSystem) return res.status(400).json({ error: "Cannot delete system folder" });
    if (existing.createdBy !== userId) return res.status(403).json({ error: "Access denied" });

    await db
      .update(documentFoldersTable)
      .set({ isTrashed: true, updatedAt: new Date() })
      .where(eq(documentFoldersTable.id, id));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete folder" });
  }
});

router.get("/document-files", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const folderId = req.query.folderId ? parseInt(req.query.folderId as string) : null;
    const search = (req.query.search as string) || "";
    const trashed = req.query.trashed === "true";

    let where: SQL = and(
      eq(documentFilesTable.isTrashed, trashed),
      or(eq(documentFilesTable.uploadedBy, String(userId)), sql`${documentFilesTable.uploadedBy} IS NULL`)
    )!;

    if (folderId !== null) {
      where = and(where, eq(documentFilesTable.folderId, folderId))!;
    }

    if (search) {
      where = and(where, ilike(documentFilesTable.name, `%${search}%`))!;
    }

    const files = await db
      .select()
      .from(documentFilesTable)
      .where(where)
      .orderBy(desc(documentFilesTable.createdAt));

    res.json(files);
  } catch (err: any) {
    console.error("[document-files] Error:", err?.message || err);
    res.status(500).json({ error: "Failed to fetch files", detail: err?.message });
  }
});

const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];

router.post("/document-files/upload", (req: Request, res: Response, next: NextFunction) => {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  next();
}, upload.single("file"), async (req: Request, res: Response) => {
  const userId = req.userId!;
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const folderId = req.body.folderId ? parseInt(req.body.folderId as string) : null;
    const description = (req.body.description as string) || "";
    const tagsRaw = req.body.tags as string | undefined;
    const tags = tagsRaw ? tagsRaw.split(",").map(t => t.trim()).filter(Boolean) : [];

    let thumbnailPath: string | null = null;
    if (IMAGE_MIME_TYPES.includes(req.file.mimetype) && req.file.mimetype !== "image/svg+xml") {
      thumbnailPath = req.file.filename;
    }

    const [file] = await db
      .insert(documentFilesTable)
      .values({
        name: req.file.originalname,
        originalName: req.file.originalname,
        folderId,
        mimeType: req.file.mimetype,
        size: req.file.size,
        filePath: req.file.filename,
        thumbnailPath,
        description,
        tags,
        uploadedBy: userId,
      })
      .returning();

    res.json(file);
  } catch {
    res.status(500).json({ error: "Failed to upload file" });
  }
});

router.get("/document-files/:id/preview", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const [file] = await db
      .select()
      .from(documentFilesTable)
      .where(and(eq(documentFilesTable.id, id), eq(documentFilesTable.uploadedBy, userId)));

    if (!file) return res.status(404).json({ error: "File not found" });

    const previewFile = file.thumbnailPath || file.filePath;
    const fullPath = path.join(uploadsDir, previewFile);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "Preview not available" });

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    fs.createReadStream(fullPath).pipe(res);
  } catch {
    res.status(500).json({ error: "Failed to serve preview" });
  }
});

router.get("/document-files/:id/download", async (req: Request, res: Response) => {
  try {
    let userId: string | null = req.userId || null;

    if (!userId) {
      const tokenParam = req.query.token;
      if (typeof tokenParam === "string" && tokenParam.length > 0) {
        const { user, error } = await validateSession(tokenParam);
        if (error || !user) {
          res.status(401).json({ error: "Invalid token" });
          return;
        }
        userId = String((user as { id: number }).id);
      }
    }

    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const id = parseId(req.params.id, res);
    if (id === null) return;

    const [file] = await db
      .select()
      .from(documentFilesTable)
      .where(and(eq(documentFilesTable.id, id), eq(documentFilesTable.uploadedBy, userId)));

    if (!file) return res.status(404).json({ error: "File not found" });

    const filePath = path.join(uploadsDir, file.filePath);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found on disk" });

    res.download(filePath, file.originalName);
  } catch {
    res.status(500).json({ error: "Failed to download file" });
  }
});

router.delete("/document-files/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const permanent = req.query.permanent === "true";

    const [file] = await db
      .select()
      .from(documentFilesTable)
      .where(and(eq(documentFilesTable.id, id), eq(documentFilesTable.uploadedBy, userId)));

    if (!file) return res.status(404).json({ error: "File not found" });

    const holdCheck = await db.execute(sql`SELECT is_legal_hold FROM document_files WHERE id = ${id}`);
    if ((holdCheck.rows[0] as any)?.is_legal_hold) {
      return res.status(403).json({ error: "מסמך זה נמצא תחת עצירה משפטית ולא ניתן למחוק אותו" });
    }

    if (permanent) {
      const filePath = path.join(uploadsDir, file.filePath);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await db.delete(documentFilesTable).where(eq(documentFilesTable.id, id));
    } else {
      await db
        .update(documentFilesTable)
        .set({ isTrashed: true, updatedAt: new Date() })
        .where(eq(documentFilesTable.id, id));
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete file" });
  }
});

router.put("/document-files/:id/restore", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;

    const [file] = await db
      .select()
      .from(documentFilesTable)
      .where(and(eq(documentFilesTable.id, id), eq(documentFilesTable.uploadedBy, userId)));

    if (!file) return res.status(404).json({ error: "File not found" });

    await db
      .update(documentFilesTable)
      .set({ isTrashed: false, updatedAt: new Date() })
      .where(eq(documentFilesTable.id, id));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to restore file" });
  }
});

router.put("/document-files/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;

    const [existing] = await db
      .select()
      .from(documentFilesTable)
      .where(and(eq(documentFilesTable.id, id), eq(documentFilesTable.uploadedBy, userId)));

    if (!existing) return res.status(404).json({ error: "File not found" });

    const holdCheck = await db.execute(sql`SELECT is_legal_hold FROM document_files WHERE id = ${id}`);
    if ((holdCheck.rows[0] as any)?.is_legal_hold) {
      return res.status(403).json({ error: "מסמך זה נמצא תחת עצירה משפטית ולא ניתן לשנות אותו" });
    }

    const currentVersion = (existing as any).currentVersion || 1;
    const changeNote = `עדכון מטא-נתונים: ${[req.body.name && 'שם', req.body.folderId !== undefined && 'תיקייה', req.body.description && 'תיאור', req.body.tags && 'תגיות'].filter(Boolean).join(', ')}`;
    await db.execute(sql`
      INSERT INTO document_versions (file_id, version_number, file_path, original_name, size, mime_type, change_note, created_by)
      VALUES (${id}, ${currentVersion + 1}, ${existing.filePath}, ${existing.originalName}, ${existing.size}, ${existing.mimeType}, ${changeNote}, ${userId})
    `);

    const { name, folderId, description, tags } = req.body as {
      name?: string;
      folderId?: number | null;
      description?: string;
      tags?: string[];
    };

    const updateData: Partial<{ name: string; folderId: number | null; description: string; tags: string[]; updatedAt: Date }> = {
      updatedAt: new Date(),
    };
    if (name !== undefined) updateData.name = name;
    if (folderId !== undefined) updateData.folderId = folderId || null;
    if (description !== undefined) updateData.description = description;
    if (tags !== undefined) updateData.tags = tags;

    await db.execute(sql`UPDATE document_files SET current_version = ${currentVersion + 1} WHERE id = ${id}`);

    const [file] = await db
      .update(documentFilesTable)
      .set(updateData)
      .where(eq(documentFilesTable.id, id))
      .returning();

    res.json(file);
  } catch {
    res.status(500).json({ error: "Failed to update file" });
  }
});

router.get("/document-stats", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const [totalFoldersRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(documentFoldersTable)
      .where(and(eq(documentFoldersTable.isTrashed, false), folderAccessCondition(userId)));

    const [totalFilesRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(documentFilesTable)
      .where(and(eq(documentFilesTable.isTrashed, false), eq(documentFilesTable.uploadedBy, userId)));

    const [totalSizeRow] = await db
      .select({ total: sql<number>`coalesce(sum(size), 0)::bigint` })
      .from(documentFilesTable)
      .where(and(eq(documentFilesTable.isTrashed, false), eq(documentFilesTable.uploadedBy, userId)));

    const recentFiles = await db
      .select()
      .from(documentFilesTable)
      .where(and(eq(documentFilesTable.isTrashed, false), eq(documentFilesTable.uploadedBy, userId)))
      .orderBy(desc(documentFilesTable.createdAt))
      .limit(6);

    res.json({
      totalFolders: totalFoldersRow.count,
      totalFiles: totalFilesRow.count,
      totalSize: totalSizeRow.total,
      recentFiles,
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.get("/document-tags", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  try {
    const tags = await db.select().from(documentTagsTable).orderBy(documentTagsTable.name);
    res.json(tags);
  } catch {
    res.status(500).json({ error: "Failed to fetch tags" });
  }
});

router.post("/document-tags", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  try {
    const { name, color } = req.body as { name?: string; color?: string };
    if (!name) return res.status(400).json({ error: "Name is required" });

    const [tag] = await db
      .insert(documentTagsTable)
      .values({ name, color })
      .returning();
    res.json(tag);
  } catch {
    res.status(500).json({ error: "Failed to create tag" });
  }
});

router.put("/document-tags/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const { name, color } = req.body as { name?: string; color?: string };

    const [tag] = await db
      .update(documentTagsTable)
      .set({ name, color })
      .where(eq(documentTagsTable.id, id))
      .returning();
    res.json(tag);
  } catch {
    res.status(500).json({ error: "Failed to update tag" });
  }
});

router.delete("/document-tags/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    await db.delete(documentTagsTable).where(eq(documentTagsTable.id, id));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete tag" });
  }
});

export default router;
