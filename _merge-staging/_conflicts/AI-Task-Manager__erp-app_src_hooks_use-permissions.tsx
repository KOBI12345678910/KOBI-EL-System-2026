import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { AlertTriangle, RefreshCw } from "lucide-react";

const API_BASE = "/api";

export interface ModulePermission {
  view: boolean;
  manage: boolean;
  create?: boolean;
  edit?: boolean;
  delete?: boolean;
}

export interface EntityPermission {
  create: boolean;
  read: boolean;
  update: boolean;
  delete: boolean;
}

export type FieldVisibility = "write" | "read" | "hidden";

export interface ActionPermission {
  execute: boolean;
}

export interface ResolvedPermissions {
  isSuperAdmin: boolean;
  builderAccess: boolean;
  roles: string[];
  roleIds: number[];
  department: string | null;
  modules: Record<string, ModulePermission>;
  entities: Record<string, EntityPermission>;
  fields: Record<string, Record<string, FieldVisibility>>;
  actions: Record<string, ActionPermission>;
}

const DEFAULT_PERMISSIONS: ResolvedPermissions = {
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

interface PermissionsContextValue {
  permissions: ResolvedPermissions;
  isLoading: boolean;
  permissionsFailed: boolean;
  canViewModule: (moduleId: number | string) => boolean;
  canManageModule: (moduleId: number | string) => boolean;
  canCreateInModule: (moduleId: number | string) => boolean;
  canEditInModule: (moduleId: number | string) => boolean;
  canDeleteInModule: (moduleId: number | string) => boolean;
  canAccessEntity: (entityId: number | string, action: "create" | "read" | "update" | "delete") => boolean;
  getFieldVisibility: (entityId: number | string, fieldSlug: string) => FieldVisibility;
  canExecuteAction: (actionId: number | string) => boolean;
  hasBuilderAccess: () => boolean;
}

const PermissionsContext = createContext<PermissionsContextValue>({
  permissions: DEFAULT_PERMISSIONS,
  isLoading: true,
  permissionsFailed: false,
  canViewModule: () => false,
  canManageModule: () => false,
  canCreateInModule: () => false,
  canEditInModule: () => false,
  canDeleteInModule: () => false,
  canAccessEntity: () => false,
  getFieldVisibility: () => "hidden",
  canExecuteAction: () => false,
  hasBuilderAccess: () => false,
});

export function PermissionsProvider({ userId, children }: { userId?: string; children: ReactNode }) {
  const [permissionsFailed, setPermissionsFailed] = useState(false);

  const { data: permissions = DEFAULT_PERMISSIONS, isLoading, refetch } = useQuery<ResolvedPermissions>({
    queryKey: ["my-permissions", userId],
    queryFn: async () => {
      try {
        const url = userId
          ? `${API_BASE}/platform/users/${userId}/permissions`
          : `${API_BASE}/platform/my-permissions`;
        const r = await authFetch(url);
        if (!r.ok) {
          // Dev fallback: if API unavailable, grant superAdmin for UI preview
          if (import.meta.env.DEV) {
            setPermissionsFailed(false);
            return { ...DEFAULT_PERMISSIONS, isSuperAdmin: true, builderAccess: true, roles: ["super-admin"] };
          }
          setPermissionsFailed(true);
          return DEFAULT_PERMISSIONS;
        }
        setPermissionsFailed(false);
        return r.json();
      } catch {
        // Dev fallback: if API unavailable, grant superAdmin for UI preview
        if (import.meta.env.DEV) {
          setPermissionsFailed(false);
          return { ...DEFAULT_PERMISSIONS, isSuperAdmin: true, builderAccess: true, roles: ["super-admin"] };
        }
        setPermissionsFailed(true);
        return DEFAULT_PERMISSIONS;
      }
    },
    staleTime: 60000,
    retry: 1,
  });

  useEffect(() => {
    if (permissionsFailed) {
      console.error("[Permissions] Failed to load permissions — access is blocked (fail-closed)");
    }
  }, [permissionsFailed]);

  const canViewModule = (moduleId: number | string): boolean => {
    if (permissionsFailed) return false;
    if (permissions.isSuperAdmin) return true;
    const mp = permissions.modules[String(moduleId)];
    if (!mp) return false;
    return mp.view || mp.manage;
  };

  const canManageModule = (moduleId: number | string): boolean => {
    if (permissionsFailed) return false;
    if (permissions.isSuperAdmin) return true;
    const mp = permissions.modules[String(moduleId)];
    return mp ? mp.manage : false;
  };

  const canCreateInModule = (moduleId: number | string): boolean => {
    if (permissionsFailed) return false;
    if (permissions.isSuperAdmin) return true;
    const mp = permissions.modules[String(moduleId)];
    if (!mp) return false;
    if (mp.manage) return true;
    return mp.create ?? false;
  };

  const canEditInModule = (moduleId: number | string): boolean => {
    if (permissionsFailed) return false;
    if (permissions.isSuperAdmin) return true;
    const mp = permissions.modules[String(moduleId)];
    if (!mp) return false;
    if (mp.manage) return true;
    return mp.edit ?? false;
  };

  const canDeleteInModule = (moduleId: number | string): boolean => {
    if (permissionsFailed) return false;
    if (permissions.isSuperAdmin) return true;
    const mp = permissions.modules[String(moduleId)];
    if (!mp) return false;
    if (mp.manage) return true;
    return mp.delete ?? false;
  };

  const canAccessEntity = (entityId: number | string, action: "create" | "read" | "update" | "delete"): boolean => {
    if (permissionsFailed) return false;
    if (permissions.isSuperAdmin) return true;
    const ep = permissions.entities[String(entityId)];
    return ep ? (ep[action] ?? false) : false;
  };

  const getFieldVisibility = (entityId: number | string, fieldSlug: string): FieldVisibility => {
    if (permissionsFailed) return "hidden";
    if (permissions.isSuperAdmin) return "write";
    const ef = permissions.fields[String(entityId)];
    if (!ef) return "write";
    return ef[fieldSlug] ?? "write";
  };

  const canExecuteAction = (actionId: number | string): boolean => {
    if (permissionsFailed) return false;
    if (permissions.isSuperAdmin) return true;
    const ap = permissions.actions[String(actionId)];
    return ap ? ap.execute : false;
  };

  const hasBuilderAccess = (): boolean => {
    if (permissionsFailed) return false;
    return permissions.isSuperAdmin || permissions.builderAccess;
  };

  if (!isLoading && permissionsFailed) {
    return (
      <div
        role="alert"
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0e1a",
          color: "#f9fafb",
          direction: "rtl",
          gap: "16px",
          padding: "32px",
        }}
      >
        <AlertTriangle style={{ width: 48, height: 48, color: "#f59e0b" }} />
        <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>לא ניתן לטעון הרשאות</h1>
        <p style={{ color: "#9ca3af", textAlign: "center", maxWidth: 400, margin: 0 }}>
          המערכת לא הצליחה לטעון את הרשאות הגישה שלך. הגישה לכל המודולים חסומה כדי להגן על המידע.
          <br />
          פנה למנהל המערכת אם הבעיה נמשכת.
        </p>
        <button
          onClick={() => { setPermissionsFailed(false); refetch(); }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 20px",
            background: "#1d4ed8",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          <RefreshCw style={{ width: 16, height: 16 }} />
          נסה שוב
        </button>
      </div>
    );
  }

  return (
    <PermissionsContext.Provider value={{
      permissions,
      isLoading,
      permissionsFailed,
      canViewModule,
      canManageModule,
      canCreateInModule,
      canEditInModule,
      canDeleteInModule,
      canAccessEntity,
      getFieldVisibility,
      canExecuteAction,
      hasBuilderAccess,
    }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}
