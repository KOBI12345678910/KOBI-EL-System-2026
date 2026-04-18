import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { rolePermissionsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireSuperAdmin } from "../../lib/permission-middleware";
import { invalidateRolePermissions } from "../../lib/metadata-cache";

const router: IRouter = Router();

router.get("/platform/role-permissions", async (req, res) => {
  try {
    const { roleId, moduleId, entityId } = req.query;
    let query = db.select().from(rolePermissionsTable);
    const conditions = [];
    if (roleId) conditions.push(eq(rolePermissionsTable.roleId, Number(roleId)));
    if (moduleId) conditions.push(eq(rolePermissionsTable.moduleId, Number(moduleId)));
    if (entityId) conditions.push(eq(rolePermissionsTable.entityId, Number(entityId)));
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    const permissions = await query;
    res.json(permissions);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/role-permissions", requireSuperAdmin, async (req, res) => {
  try {
    const { roleId, entityId, moduleId, action, isAllowed, conditions, settings } = req.body;
    if (!roleId || !action) return res.status(400).json({ message: "roleId and action are required" });
    const [permission] = await db.insert(rolePermissionsTable).values({
      roleId,
      entityId: entityId || null,
      moduleId: moduleId || null,
      action,
      isAllowed: isAllowed !== false,
      conditions: conditions || {},
      settings: settings || {},
    }).returning();
    invalidateRolePermissions();
    res.status(201).json(permission);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/role-permissions/bulk", requireSuperAdmin, async (req, res) => {
  try {
    const { roleId, permissions: permList } = req.body;
    if (!roleId || !Array.isArray(permList)) {
      return res.status(400).json({ message: "roleId and permissions array are required" });
    }
    const result = await db.transaction(async (tx) => {
      await tx.delete(rolePermissionsTable).where(eq(rolePermissionsTable.roleId, roleId));
      if (permList.length === 0) return [];
      return tx.insert(rolePermissionsTable)
        .values(permList.map((p: any) => ({
          roleId,
          entityId: p.entityId || null,
          moduleId: p.moduleId || null,
          action: p.action,
          isAllowed: p.isAllowed !== false,
          conditions: p.conditions || {},
          settings: p.settings || {},
        })))
        .returning();
    });
    invalidateRolePermissions();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/role-permissions/:id", requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { isAllowed, conditions, settings } = req.body;
    const [permission] = await db.update(rolePermissionsTable)
      .set({
        ...(isAllowed !== undefined && { isAllowed }),
        ...(conditions !== undefined && { conditions }),
        ...(settings !== undefined && { settings }),
      })
      .where(eq(rolePermissionsTable.id, id))
      .returning();
    if (!permission) return res.status(404).json({ message: "Permission not found" });
    invalidateRolePermissions();
    res.json(permission);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/role-permissions/:id", requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(rolePermissionsTable).where(eq(rolePermissionsTable.id, id));
    invalidateRolePermissions();
    res.json({ message: "Deleted" });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
