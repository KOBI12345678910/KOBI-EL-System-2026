import { Router, type IRouter } from "express";
import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { systemPermissionsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

interface ClaudeCapabilityPolicy {
  capability: string;
  requiresApproval: boolean;
  allowedRoles: string[];
  protectionLevel: "public" | "protected" | "sensitive";
}

const CAPABILITY_POLICIES: ClaudeCapabilityPolicy[] = [
  { capability: "read_metadata", requiresApproval: false, allowedRoles: ["admin", "developer", "viewer"], protectionLevel: "public" },
  { capability: "read_records", requiresApproval: false, allowedRoles: ["admin", "developer", "viewer"], protectionLevel: "public" },
  { capability: "create_module", requiresApproval: false, allowedRoles: ["admin", "developer"], protectionLevel: "protected" },
  { capability: "update_module", requiresApproval: false, allowedRoles: ["admin", "developer"], protectionLevel: "protected" },
  { capability: "delete_module", requiresApproval: true, allowedRoles: ["admin"], protectionLevel: "sensitive" },
  { capability: "create_entity", requiresApproval: false, allowedRoles: ["admin", "developer"], protectionLevel: "protected" },
  { capability: "update_entity", requiresApproval: false, allowedRoles: ["admin", "developer"], protectionLevel: "protected" },
  { capability: "delete_entity", requiresApproval: true, allowedRoles: ["admin"], protectionLevel: "sensitive" },
  { capability: "create_field", requiresApproval: false, allowedRoles: ["admin", "developer"], protectionLevel: "protected" },
  { capability: "update_field", requiresApproval: false, allowedRoles: ["admin", "developer"], protectionLevel: "protected" },
  { capability: "delete_field", requiresApproval: true, allowedRoles: ["admin"], protectionLevel: "sensitive" },
  { capability: "publish_module", requiresApproval: true, allowedRoles: ["admin"], protectionLevel: "sensitive" },
  { capability: "manage_permissions", requiresApproval: true, allowedRoles: ["admin"], protectionLevel: "sensitive" },
  { capability: "manage_api_keys", requiresApproval: true, allowedRoles: ["admin"], protectionLevel: "sensitive" },
  { capability: "manage_workflows", requiresApproval: false, allowedRoles: ["admin", "developer"], protectionLevel: "protected" },
  { capability: "manage_forms", requiresApproval: false, allowedRoles: ["admin", "developer"], protectionLevel: "protected" },
  { capability: "manage_views", requiresApproval: false, allowedRoles: ["admin", "developer"], protectionLevel: "protected" },
  { capability: "bulk_operations", requiresApproval: true, allowedRoles: ["admin"], protectionLevel: "sensitive" },
  { capability: "export_data", requiresApproval: false, allowedRoles: ["admin", "developer"], protectionLevel: "protected" },
];

router.get("/claude/security/policies", async (_req, res) => {
  res.json({
    policies: CAPABILITY_POLICIES,
    totalPolicies: CAPABILITY_POLICIES.length,
    protectionLevels: {
      public: CAPABILITY_POLICIES.filter((p) => p.protectionLevel === "public").length,
      protected: CAPABILITY_POLICIES.filter((p) => p.protectionLevel === "protected").length,
      sensitive: CAPABILITY_POLICIES.filter((p) => p.protectionLevel === "sensitive").length,
    },
  });
});

router.post("/claude/security/check-permission", async (req, res) => {
  const { role, capability, entityId, moduleId } = req.body;

  if (!role || !capability) {
    res.status(400).json({ error: "role and capability are required" });
    return;
  }

  const policy = CAPABILITY_POLICIES.find((p) => p.capability === capability);
  if (!policy) {
    res.json({ allowed: false, reason: "unknown_capability", capability, role });
    return;
  }

  if (!policy.allowedRoles.includes(role)) {
    res.json({ allowed: false, reason: "role_not_allowed", capability, role, allowedRoles: policy.allowedRoles });
    return;
  }

  if (entityId || moduleId) {
    const conditions = [eq(systemPermissionsTable.role, role)];
    if (entityId) conditions.push(eq(systemPermissionsTable.entityId, entityId));
    if (moduleId) conditions.push(eq(systemPermissionsTable.moduleId, moduleId));

    const perms = await db.select().from(systemPermissionsTable).where(and(...conditions));
    const actionPerm = perms.find((p) => p.action === capability || p.action === "*");
    if (actionPerm && !actionPerm.isAllowed) {
      res.json({ allowed: false, reason: "explicitly_denied", capability, role });
      return;
    }
  }

  res.json({
    allowed: true,
    requiresApproval: policy.requiresApproval,
    protectionLevel: policy.protectionLevel,
    capability,
    role,
  });
});

router.post("/claude/security/authorize-action", async (req, res) => {
  const { role, action, targetType, targetId } = req.body;

  if (!role || !action) {
    res.status(400).json({ error: "role and action are required" });
    return;
  }

  const policy = CAPABILITY_POLICIES.find((p) => p.capability === action);
  if (!policy) {
    res.json({ authorized: false, reason: "unknown_action" });
    return;
  }

  if (!policy.allowedRoles.includes(role)) {
    res.json({ authorized: false, reason: "insufficient_role", requiredRoles: policy.allowedRoles });
    return;
  }

  if (policy.requiresApproval) {
    res.json({ authorized: false, reason: "requires_approval", action, protectionLevel: policy.protectionLevel });
    return;
  }

  res.json({ authorized: true, action, role, protectionLevel: policy.protectionLevel });
});

router.get("/claude/security/roles", async (_req, res) => {
  const roles = ["admin", "developer", "viewer"];

  const roleSummaries = roles.map((role) => {
    const allowed = CAPABILITY_POLICIES.filter((p) => p.allowedRoles.includes(role));
    return {
      role,
      capabilities: allowed.map((p) => p.capability),
      capabilityCount: allowed.length,
      canApprove: role === "admin",
    };
  });

  res.json({ roles: roleSummaries });
});

router.get("/claude/security/protected-configs", async (_req, res) => {
  const protectedItems = CAPABILITY_POLICIES.filter((p) => p.protectionLevel === "sensitive");

  res.json({
    protectedCapabilities: protectedItems.map((p) => ({
      capability: p.capability,
      requiresApproval: p.requiresApproval,
      allowedRoles: p.allowedRoles,
    })),
    protectionRules: [
      { rule: "DRAFT_ONLY_WRITES", description: "All metadata writes create draft versions only" },
      { rule: "PUBLISH_REQUIRES_APPROVAL", description: "Publishing requires admin approval" },
      { rule: "DELETE_REQUIRES_APPROVAL", description: "Deletion of modules, entities, and fields requires approval" },
      { rule: "API_KEY_PROTECTION", description: "API key management is restricted to admins" },
      { rule: "PERMISSION_PROTECTION", description: "Permission changes require admin role" },
      { rule: "AUDIT_ALL_ACTIONS", description: "All Claude actions are audit-logged" },
    ],
  });
});

export function claudeSecurityMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const role = (req.headers["x-claude-role"] as string) || "developer";
  (req as any).claudeRole = role;
  (req as any).claudeUserId = req.headers["x-claude-user-id"] || "system";
  next();
}

export default router;
