import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { systemPermissionsTable } from "@workspace/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const CreatePermissionBody = z.object({
  entityId: z.number().optional(),
  moduleId: z.number().optional(),
  role: z.string().min(1),
  action: z.string().min(1),
  isAllowed: z.boolean().default(true),
  conditions: z.record(z.string(), z.any()).optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

const UpdatePermissionBody = CreatePermissionBody.partial();

router.get("/platform/permissions", async (req, res) => {
  try {
    const role = req.query.role as string;
    const moduleId = req.query.moduleId ? Number(req.query.moduleId) : undefined;
    const entityId = req.query.entityId ? Number(req.query.entityId) : undefined;

    let query = db.select().from(systemPermissionsTable).orderBy(asc(systemPermissionsTable.role)).$dynamic();

    if (role) query = query.where(eq(systemPermissionsTable.role, role));
    if (moduleId) query = query.where(eq(systemPermissionsTable.moduleId, moduleId));
    if (entityId) query = query.where(eq(systemPermissionsTable.entityId, entityId));

    const permissions = await query;
    res.json(permissions);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/permissions", async (req, res) => {
  try {
    const body = CreatePermissionBody.parse(req.body);
    const [perm] = await db.insert(systemPermissionsTable).values(body).returning();
    res.status(201).json(perm);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/permissions/bulk", async (req, res) => {
  try {
    const body = z.object({
      role: z.string().min(1),
      permissions: z.array(z.object({
        moduleId: z.number().optional(),
        entityId: z.number().optional(),
        action: z.string().min(1),
        isAllowed: z.boolean().default(true),
      })),
    }).parse(req.body);

    await db.delete(systemPermissionsTable).where(eq(systemPermissionsTable.role, body.role));

    const values = body.permissions.map(p => ({
      role: body.role,
      moduleId: p.moduleId,
      entityId: p.entityId,
      action: p.action,
      isAllowed: p.isAllowed,
    }));

    if (values.length > 0) {
      await db.insert(systemPermissionsTable).values(values);
    }

    const updated = await db.select().from(systemPermissionsTable).where(eq(systemPermissionsTable.role, body.role));
    res.json(updated);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/permissions/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = UpdatePermissionBody.parse(req.body);
    const [perm] = await db.update(systemPermissionsTable).set(body).where(eq(systemPermissionsTable.id, id)).returning();
    if (!perm) return res.status(404).json({ message: "Permission not found" });
    res.json(perm);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/permissions/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(systemPermissionsTable).where(eq(systemPermissionsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/permissions/check", async (req, res) => {
  try {
    const role = req.query.role as string;
    const action = req.query.action as string;
    const moduleId = req.query.moduleId ? Number(req.query.moduleId) : undefined;
    const entityId = req.query.entityId ? Number(req.query.entityId) : undefined;

    if (!role || !action) {
      return res.status(400).json({ message: "role and action are required" });
    }

    const conditions = [
      eq(systemPermissionsTable.role, role),
      eq(systemPermissionsTable.action, action),
    ];
    if (moduleId) conditions.push(eq(systemPermissionsTable.moduleId, moduleId));
    if (entityId) conditions.push(eq(systemPermissionsTable.entityId, entityId));

    const [perm] = await db.select().from(systemPermissionsTable).where(and(...conditions));

    res.json({ allowed: perm?.isAllowed ?? false });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
