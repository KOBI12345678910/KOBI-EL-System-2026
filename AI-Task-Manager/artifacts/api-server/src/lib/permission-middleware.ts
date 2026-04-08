import type { Request, Response, NextFunction, RequestHandler } from "express";
import {
  resolveUserPermissions,
  checkModuleAccess,
  checkModuleCrud,
  checkEntityAccess,
  checkBuilderAccess,
  filterFieldsForRead,
  validateWriteFields,
  checkActionAccess,
  checkAnyRoleAssignments,
  logPermissionDenied,
  type ResolvedPermissions,
} from "./permission-engine";
import { validateSession } from "./auth";
import { withCircuitBreaker } from "@workspace/db";
import { setSentryUser, clearSentryUser } from "./sentry";

const permissionsCache = new Map<string, { permissions: ResolvedPermissions; expiresAt: number }>();
const PERM_CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 200;

function getCachedPermissions(userId: string): ResolvedPermissions | null {
  const entry = permissionsCache.get(userId);
  if (entry && entry.expiresAt > Date.now()) return entry.permissions;
  if (entry) permissionsCache.delete(userId);
  return null;
}

function setCachedPermissions(userId: string, permissions: ResolvedPermissions): void {
  if (permissionsCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = permissionsCache.keys().next().value;
    if (firstKey) permissionsCache.delete(firstKey);
  }
  permissionsCache.set(userId, { permissions, expiresAt: Date.now() + PERM_CACHE_TTL_MS });
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      permissions?: ResolvedPermissions;
      rawBody?: Buffer;
      apiKeyId?: number;
    }
  }
}

export const attachPermissions: RequestHandler = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    let userId = "";

    const authHeader = req.headers.authorization;
    let tokenValue: string | undefined;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      tokenValue = authHeader.substring(7);
    } else if ((req.path === "/chat/stream" || req.path === "/live-ops/stream") && req.query.token) {
      tokenValue = String(req.query.token);
    }

    if (tokenValue) {
      try {
        const result = await validateSession(tokenValue);
        if (result.user && "id" in result.user && result.user.id) {
          userId = String(result.user.id);
        }
      } catch (e) {
        console.error("[attachPermissions] Token validation failed:", e instanceof Error ? e.message : e);
      }
    }

    const isDev = process.env.NODE_ENV !== "production";

    if (userId) {
      req.userId = userId;
    } else if (!req.userId) {
      req.userId = "";
    }
    if (req.userId) {
      const userId = req.userId;
      const cached = getCachedPermissions(userId);
      if (cached) {
        req.permissions = cached;
        const role = cached.isSuperAdmin ? "super_admin" : (cached.roles[0] ?? "user");
        setSentryUser(Number(userId), role);
        return next();
      }
      try {
        req.permissions = await withCircuitBreaker(
          "resolveUserPermissions",
          () => resolveUserPermissions(userId)
        );
        setCachedPermissions(userId, req.permissions);
        const role = req.permissions.isSuperAdmin ? "super_admin" : (req.permissions.roles[0] ?? "user");
        setSentryUser(Number(userId), role);
      } catch (permErr) {
        console.error("[attachPermissions] resolveUserPermissions failed:", permErr instanceof Error ? permErr.message : permErr);
        if (isDev) {
          req.permissions = {
            isSuperAdmin: true,
            builderAccess: true,
            roles: ["__dev__"],
            roleIds: [],
            department: null,
            modules: {},
            entities: {},
            fields: {},
            actions: {},
          };
        } else {
          req.permissions = {
            isSuperAdmin: false,
            builderAccess: false,
            roles: [],
            roleIds: [],
            department: null,
            modules: {},
            entities: {},
            fields: {},
            actions: {},
          };
        }
      }
    } else {
      clearSentryUser();
      let hasAnyAssignments = false;
      try {
        hasAnyAssignments = await withCircuitBreaker(
          "checkAnyRoleAssignments",
          () => checkAnyRoleAssignments()
        );
      } catch (checkErr) {
        console.error("[attachPermissions] checkAnyRoleAssignments failed (circuit-breaker or error):", checkErr instanceof Error ? checkErr.message : checkErr);
      }
      if (hasAnyAssignments) {
        req.permissions = {
          isSuperAdmin: false,
          builderAccess: false,
          roles: [],
          roleIds: [],
          department: null,
          modules: {},
          entities: {},
          fields: {},
          actions: {},
        };
      } else {
        req.permissions = {
          isSuperAdmin: isDev,
          builderAccess: isDev,
          roles: isDev ? ["__dev__"] : [],
          roleIds: [],
          department: null,
          modules: {},
          entities: {},
          fields: {},
          actions: {},
        };
      }
    }
    next();
  } catch (err) {
    next(err);
  }
};

export function requireModuleAccess(level: "view" | "manage" = "view") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const permissions = req.permissions;
    if (!permissions) {
      return res.status(403).json({ message: "Access denied: no permissions resolved" });
    }

    const moduleId = (req.params.moduleId || req.params.id) as string;
    if (!moduleId) {
      return next();
    }

    if (!checkModuleAccess(permissions, moduleId, level)) {
      await logPermissionDenied(req.userId || "", `module_${level}`, undefined, undefined, { moduleId: String(moduleId) });
      return res.status(403).json({
        message: `Access denied: insufficient ${level} permissions for module ${moduleId}`,
      });
    }

    return next();
  };
}

export function requireEntityAccess(action: "create" | "read" | "update" | "delete") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const permissions = req.permissions;
    if (!permissions) {
      return res.status(403).json({ message: "Access denied: no permissions resolved" });
    }

    const entityId = req.params.entityId as string;
    if (!entityId) {
      return next();
    }

    if (!checkEntityAccess(permissions, entityId, action)) {
      await logPermissionDenied(req.userId || "", `entity_${action}`, Number(entityId));
      return res.status(403).json({
        message: `Access denied: no ${action} permission for entity ${entityId}`,
      });
    }

    return next();
  };
}

export function requireBuilderAccess(req: Request, res: Response, next: NextFunction) {
  const permissions = req.permissions;
  if (!permissions) {
    return res.status(403).json({ message: "Access denied: no permissions resolved" });
  }

  if (!checkBuilderAccess(permissions)) {
    logPermissionDenied(req.userId || "", "builder_access");
    return res.status(403).json({ message: "Access denied: builder access required" });
  }

  return next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const permissions = req.permissions;
  if (!permissions || !permissions.isSuperAdmin) {
    logPermissionDenied(req.userId || "", "super_admin");
    return res.status(403).json({ message: "Access denied: super admin access required" });
  }
  return next();
}

export function requireModuleCrud(action: "create" | "edit" | "delete") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const permissions = req.permissions;
    if (!permissions) {
      return res.status(403).json({ message: "Access denied: no permissions resolved" });
    }

    const moduleId = (req.params.moduleId || req.params.id) as string;
    if (!moduleId) {
      return next();
    }

    if (!checkModuleCrud(permissions, moduleId, action)) {
      await logPermissionDenied(req.userId || "", `module_${action}`, undefined, undefined, { moduleId: String(moduleId) });
      return res.status(403).json({
        message: `Access denied: no ${action} permission for module ${moduleId}`,
      });
    }

    return next();
  };
}

export function requireActionAccess(req: Request, res: Response, next: NextFunction) {
  const permissions = req.permissions;
  if (!permissions) {
    return res.status(403).json({ message: "Access denied: no permissions resolved" });
  }

  const actionId = (req.params.actionId || req.params.id) as string;
  if (!actionId) {
    return next();
  }

  if (!checkActionAccess(permissions, actionId)) {
    logPermissionDenied(req.userId || "", "action_execute", undefined, undefined, { actionId: String(actionId) });
    return res.status(403).json({
      message: `Access denied: no execute permission for action ${actionId}`,
    });
  }

  return next();
}

export function filterRecordFields(entityId: number | string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const permissions = req.permissions;
    if (!permissions) return next();

    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      if (body && body.records && Array.isArray(body.records)) {
        body.records = body.records.map((record: any) => {
          if (record.data && typeof record.data === "object") {
            record.data = filterFieldsForRead(permissions, entityId, record.data);
          }
          return record;
        });
      } else if (body && body.data && typeof body.data === "object" && body.id) {
        body.data = filterFieldsForRead(permissions, entityId, body.data);
      }
      return originalJson(body);
    };

    next();
  };
}

export function rejectWriteToReadOnlyFields(entityId: number | string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const permissions = req.permissions;
    if (!permissions) return next();

    if (req.body?.data && typeof req.body.data === "object") {
      const violations = validateWriteFields(permissions, entityId, req.body.data);
      if (violations.length > 0) {
        return res.status(403).json({
          message: `Access denied: cannot write to restricted fields: ${violations.join(", ")}`,
          restrictedFields: violations,
        });
      }
    }

    next();
  };
}
