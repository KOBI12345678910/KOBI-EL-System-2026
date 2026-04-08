import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { Readable } from "stream";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

interface RequestUploadUrlBody {
  fileName: string;
  contentType: string;
  size?: number;
  folder?: string;
}

interface RequestUploadUrlResponse {
  uploadUrl: string;
  objectKey: string;
  publicUrl: string;
}
import { setObjectAclPolicy, getObjectAclPolicy, ObjectPermission } from "../lib/objectAcl";
import { validateSession } from "../lib/auth";
import { validateExternalSession } from "../lib/external-auth";
import { db } from "@workspace/db";
import { supplierDocumentsTable } from "@workspace/db/schema";
import { eq, and, like } from "drizzle-orm";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

interface AuthResult {
  userId?: string;
  supplierId?: number;
  isInternal: boolean;
}

async function resolveAuth(req: Request): Promise<AuthResult | null> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;

  const internal = await validateSession(token);
  if (internal.user) {
    return { userId: String((internal.user as Record<string, unknown>).id || ""), isInternal: true };
  }

  const external = await validateExternalSession(token);
  if (external.user) {
    const u = external.user as Record<string, unknown>;
    return {
      userId: String(u.id || ""),
      supplierId: u.linkedEntityId != null ? Number(u.linkedEntityId) : undefined,
      isInternal: false,
    };
  }

  return null;
}

async function requireAuthenticated(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = await resolveAuth(req);
  if (!auth) {
    res.status(401).json({ error: "אימות נדרש" });
    return;
  }
  (req as Request & { authResult: AuthResult }).authResult = auth;
  next();
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 * After upload, ACL policy is set asynchronously to mark the owner.
 * Requires authenticated session (internal or portal user).
 */
router.post(
  "/storage/uploads/request-url",
  requireAuthenticated as (req: Request, res: Response, next: NextFunction) => void,
  async (req: Request, res: Response) => {
    const auth = (req as Request & { authResult: AuthResult }).authResult;

    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid required fields" });
      return;
    }

    try {
      const { name, size, contentType } = parsed.data;

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      const ownerId = auth.userId || "anonymous";

      setObjectAclAfterUpload(objectPath, ownerId).catch(() => {});

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      req.log?.error({ err: error }, "Error generating upload URL");
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  }
);

async function setObjectAclAfterUpload(objectPath: string, ownerId: string): Promise<void> {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, attempt * 2000));
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      await setObjectAclPolicy(objectFile, {
        owner: ownerId,
        visibility: "private",
      });
      return;
    } catch (err) {
      if (attempt === maxAttempts) {
        console.error(`[storage] Failed to set ACL for ${objectPath} after ${maxAttempts} attempts:`, err instanceof Error ? err.message : String(err));
      }
    }
  }
}

export async function ensureObjectAclForOwner(objectPath: string, ownerId: string): Promise<boolean> {
  try {
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const existing = await getObjectAclPolicy(objectFile);
    if (existing) {
      return existing.owner === ownerId;
    }
    await setObjectAclPolicy(objectFile, { owner: ownerId, visibility: "private" });
    return true;
  } catch (err) {
    console.error(`[storage] ensureObjectAclForOwner failed for ${objectPath}:`, err instanceof Error ? err.message : String(err));
    return false;
  }
}

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log?.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve private object entities from PRIVATE_OBJECT_DIR.
 * Requires authenticated session.
 * Internal users may access all objects.
 * Portal (supplier) users may only access objects linked to their supplier's documents.
 */
router.get(
  "/storage/objects/*path",
  requireAuthenticated as (req: Request, res: Response, next: NextFunction) => void,
  async (req: Request, res: Response) => {
    const auth = (req as Request & { authResult: AuthResult }).authResult;

    try {
      const raw = req.params.path;
      const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
      const objectPath = `/objects/${wildcardPath}`;
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

      if (!auth.isInternal) {
        const supplierId = auth.supplierId;
        const userId = auth.userId || "";

        const aclPolicy = await getObjectAclPolicy(objectFile).catch(() => null);

        let aclOwnerMatch = false;
        if (aclPolicy && aclPolicy.owner === userId) {
          aclOwnerMatch = true;
        }

        let supplierDocMatch = false;
        if (supplierId) {
          const docs = await db
            .select({ id: supplierDocumentsTable.id })
            .from(supplierDocumentsTable)
            .where(
              and(
                eq(supplierDocumentsTable.supplierId, supplierId),
                like(supplierDocumentsTable.fileUrl, `%${objectPath}%`)
              )
            )
            .limit(1);
          if (docs.length > 0) supplierDocMatch = true;
        }

        if (!(aclOwnerMatch || supplierDocMatch)) {
          res.status(403).json({ error: "אין הרשאה לגשת לקובץ זה" });
          return;
        }
      }

      const response = await objectStorageService.downloadObject(objectFile);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        req.log?.warn({ err: error }, "Object not found");
        res.status(404).json({ error: "Object not found" });
        return;
      }
      req.log?.error({ err: error }, "Error serving object");
      res.status(500).json({ error: "Failed to serve object" });
    }
  }
);

export default router;
