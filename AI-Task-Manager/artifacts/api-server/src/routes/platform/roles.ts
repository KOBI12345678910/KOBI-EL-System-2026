import { Router, type IRouter } from "express";
import { db, withCircuitBreaker } from "@workspace/db";
import { platformRolesTable, roleAssignmentsTable, dataScopeRulesTable, moduleEntitiesTable, platformModulesTable } from "@workspace/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { resolveUserPermissions, invalidateAssignmentCache } from "../../lib/permission-engine";
import { invalidateRolePermissions } from "../../lib/metadata-cache";
import { requireSuperAdmin, requireBuilderAccess } from "../../lib/permission-middleware";
import { DEPARTMENT_ROLE_TEMPLATES, DEPARTMENTS } from "../../lib/department-role-templates";

const router: IRouter = Router();

const CreateRoleBody = z.object({
  name: z.string().min(1),
  nameHe: z.string().optional(),
  nameEn: z.string().optional(),
  slug: z.string().min(1),
  description: z.string().optional(),
  color: z.string().optional(),
  isSystem: z.boolean().optional(),
  isActive: z.boolean().optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

const UpdateRoleBody = CreateRoleBody.partial();

router.get("/platform/roles", async (_req, res) => {
  try {
    const roles = await db.select().from(platformRolesTable).orderBy(asc(platformRolesTable.name));
    res.json(roles);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/roles", requireSuperAdmin, async (req, res) => {
  try {
    const body = CreateRoleBody.parse(req.body);
    const [role] = await db.insert(platformRolesTable).values(body).returning();
    res.status(201).json(role);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    if (err?.code === "23505") return res.status(409).json({ message: "Role name or slug already exists" });
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/roles/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [role] = await db.select().from(platformRolesTable).where(eq(platformRolesTable.id, id));
    if (!role) return res.status(404).json({ message: "Role not found" });
    res.json(role);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/roles/:id", requireSuperAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = UpdateRoleBody.parse(req.body);
    const [role] = await db.update(platformRolesTable).set({ ...body, updatedAt: new Date() }).where(eq(platformRolesTable.id, id)).returning();
    if (!role) return res.status(404).json({ message: "Role not found" });
    invalidateRolePermissions();
    res.json(role);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    if (err?.code === "23505") return res.status(409).json({ message: "Role name or slug already exists" });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/roles/:id", requireSuperAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [role] = await db.select().from(platformRolesTable).where(eq(platformRolesTable.id, id));
    if (role?.isSystem) return res.status(403).json({ message: "Cannot delete system role" });
    await db.delete(platformRolesTable).where(eq(platformRolesTable.id, id));
    invalidateRolePermissions();
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/roles/:id/clone", requireSuperAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [source] = await db.select().from(platformRolesTable).where(eq(platformRolesTable.id, id));
    if (!source) return res.status(404).json({ message: "Role not found" });

    const { name, nameHe, nameEn, slug } = req.body;
    const newSlug = slug || `${source.slug}-copy-${Date.now()}`;
    const newName = name || `${source.name} (Copy)`;

    const [cloned] = await db.insert(platformRolesTable).values({
      name: newName,
      nameHe: nameHe || (source.nameHe ? `${source.nameHe} (העתק)` : null),
      nameEn: nameEn || (source.nameEn ? `${source.nameEn} (Copy)` : null),
      slug: newSlug,
      description: source.description,
      color: source.color,
      isSystem: false,
      isActive: source.isActive,
      parentRoleId: source.id,
      settings: source.settings,
    }).returning();

    res.status(201).json(cloned);
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ message: "Role name or slug already exists" });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/roles/:id/parent", requireSuperAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { parentRoleId } = req.body;

    if (parentRoleId === id) {
      return res.status(400).json({ message: "A role cannot be its own parent" });
    }

    const [role] = await db.update(platformRolesTable)
      .set({ parentRoleId: parentRoleId || null, updatedAt: new Date() })
      .where(eq(platformRolesTable.id, id))
      .returning();

    if (!role) return res.status(404).json({ message: "Role not found" });
    invalidateRolePermissions();
    res.json(role);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/role-assignments/bulk", requireSuperAdmin, async (req, res) => {
  try {
    const body = z.object({
      roleId: z.number(),
      userIds: z.array(z.string()),
      assignedBy: z.string().optional(),
    }).parse(req.body);

    const insertions = body.userIds.map(userId => ({
      roleId: body.roleId,
      userId,
      assignedBy: body.assignedBy,
    }));

    const results = [];
    for (const insert of insertions) {
      try {
        const [result] = await db.insert(roleAssignmentsTable).values(insert).returning();
        results.push(result);
      } catch {
      }
    }

    invalidateAssignmentCache();
    res.json({ assigned: results.length, total: body.userIds.length });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/roles/:roleId/assignments", async (req, res) => {
  try {
    const roleId = Number(req.params.roleId);
    const assignments = await db.select().from(roleAssignmentsTable).where(eq(roleAssignmentsTable.roleId, roleId));
    res.json(assignments);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/role-assignments", requireSuperAdmin, async (req, res) => {
  try {
    const body = z.object({ roleId: z.number(), userId: z.string(), assignedBy: z.string().optional() }).parse(req.body);
    const [assignment] = await db.insert(roleAssignmentsTable).values(body).returning();
    invalidateAssignmentCache();
    res.status(201).json(assignment);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/role-assignments/:id", requireSuperAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(roleAssignmentsTable).where(eq(roleAssignmentsTable.id, id));
    invalidateAssignmentCache();
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/role-assignments/user/:userId", requireSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const body = z.object({ roleId: z.number(), assignedBy: z.string().optional() }).parse(req.body);
    await db.delete(roleAssignmentsTable).where(eq(roleAssignmentsTable.userId, userId));
    const [assignment] = await db.insert(roleAssignmentsTable).values({
      roleId: body.roleId,
      userId,
      assignedBy: body.assignedBy,
    }).returning();
    invalidateAssignmentCache();
    res.json(assignment);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/users/:userId/permissions", requireSuperAdmin, async (req, res) => {
  try {
    const userId = req.params.userId;
    const permissions = await resolveUserPermissions(userId);
    res.json(permissions);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/my-permissions", async (req, res) => {
  try {
    if (req.permissions) {
      return res.json(req.permissions);
    }
    const userId = req.userId || "";
    const permissions = await withCircuitBreaker(
      "resolveUserPermissions",
      () => resolveUserPermissions(userId),
      4000
    );
    res.json(permissions);
  } catch (err: any) {
    const isTimeout = err.message?.toLowerCase().includes("timeout") || err.message?.toLowerCase().includes("circuit");
    res.status(isTimeout ? 503 : 500).json({ message: err.message });
  }
});

router.get("/platform/role-assignments", requireSuperAdmin, async (_req, res) => {
  try {
    const assignments = await db.select().from(roleAssignmentsTable).orderBy(asc(roleAssignmentsTable.createdAt));
    res.json(assignments);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/departments", (_req, res) => {
  res.json(DEPARTMENTS);
});

router.get("/platform/role-templates", (_req, res) => {
  res.json(DEPARTMENT_ROLE_TEMPLATES);
});

router.post("/platform/role-templates/seed", requireSuperAdmin, async (req, res) => {
  try {
    const { slugs } = req.body;
    const templatesToSeed = slugs && Array.isArray(slugs)
      ? DEPARTMENT_ROLE_TEMPLATES.filter(t => slugs.includes(t.slug))
      : DEPARTMENT_ROLE_TEMPLATES;

    const created: Record<string, unknown>[] = [];
    const skipped: string[] = [];

    const allModules = await db.select({ id: platformModulesTable.id, slug: platformModulesTable.slug })
      .from(platformModulesTable);
    const moduleSlugToId = new Map(allModules.map(m => [m.slug, m.id]));

    const allEntities = await db.select({ id: moduleEntitiesTable.id, slug: moduleEntitiesTable.slug })
      .from(moduleEntitiesTable);
    const entitySlugToId = new Map(allEntities.map(e => [e.slug, e.id]));

    for (const template of templatesToSeed) {
      const [existing] = await db.select().from(platformRolesTable).where(eq(platformRolesTable.slug, template.slug));
      if (existing) {
        skipped.push(template.slug);
        continue;
      }

      const resolvedModules: Record<string, { view: boolean; manage: boolean }> = {};
      for (const [slug, perm] of Object.entries(template.settings.modules)) {
        const modId = moduleSlugToId.get(slug);
        if (modId) {
          resolvedModules[String(modId)] = perm;
        }
        resolvedModules[slug] = perm;
      }

      const resolvedEntities: Record<string, { create: boolean; read: boolean; update: boolean; delete: boolean }> = {};
      for (const [slug, perm] of Object.entries(template.settings.entities)) {
        const entId = entitySlugToId.get(slug);
        if (entId) {
          resolvedEntities[String(entId)] = perm;
        }
        resolvedEntities[slug] = perm;
      }

      const resolvedSettings = {
        ...template.settings,
        modules: resolvedModules,
        entities: resolvedEntities,
      };

      const [role] = await db.insert(platformRolesTable).values({
        name: template.name,
        nameHe: template.nameHe,
        nameEn: template.nameEn,
        slug: template.slug,
        description: template.description,
        color: template.color,
        isSystem: false,
        isActive: true,
        settings: resolvedSettings,
      }).returning();
      created.push(role);

      const isManagerRole = template.slug.includes("manager") || template.slug.includes("admin") || template.slug.includes("general");
      const entitySlugs = Object.keys(template.settings.entities);
      for (const entitySlug of entitySlugs) {
        const entityId = entitySlugToId.get(entitySlug);
        if (entityId) {
          if (isManagerRole) {
            await db.insert(dataScopeRulesTable).values({
              roleId: role.id,
              entityId,
              scopeType: "all",
              description: `Full access for ${template.nameEn} on ${entitySlug}`,
              isActive: true,
            });
          } else {
            await db.insert(dataScopeRulesTable).values({
              roleId: role.id,
              entityId,
              scopeType: "department",
              field: "department",
              value: "{{current_user_department}}",
              description: `Department-scoped access for ${template.nameEn} on ${entitySlug}`,
              isActive: true,
            });
          }
        }
      }
    }

    res.json({ created, skipped, message: `נוצרו ${created.length} תפקידים, דולגו ${skipped.length}` });
  } catch (err) {
    res.status(500).json({ message: err instanceof Error ? err.message : "שגיאה ביצירת תבניות" });
  }
});

export default router;
