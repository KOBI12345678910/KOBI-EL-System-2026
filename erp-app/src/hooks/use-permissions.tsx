import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";

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
  const { data: permissions = DEFAULT_PERMISSIONS, isLoading } = useQuery<ResolvedPermissions>({
    queryKey: ["my-permissions", userId],
    queryFn: async () => {
      if (userId) {
        const r = await authFetch(`${API_BASE}/platform/users/${userId}/permissions`);
        if (!r.ok) return DEFAULT_PERMISSIONS;
        return r.json();
      }
      const r = await authFetch(`${API_BASE}/platform/my-permissions`);
      if (!r.ok) return DEFAULT_PERMISSIONS;
      return r.json();
    },
    staleTime: 60000,
  });

  const canViewModule = (moduleId: number | string): boolean => {
    if (permissions.isSuperAdmin) return true;
    const mp = permissions.modules[String(moduleId)];
    return mp ? (mp.view || mp.manage) : false;
  };

  const canManageModule = (moduleId: number | string): boolean => {
    if (permissions.isSuperAdmin) return true;
    const mp = permissions.modules[String(moduleId)];
    return mp ? mp.manage : false;
  };

  const canCreateInModule = (moduleId: number | string): boolean => {
    if (permissions.isSuperAdmin) return true;
    const mp = permissions.modules[String(moduleId)];
    if (!mp) return false;
    if (mp.manage) return true;
    return mp.create ?? false;
  };

  const canEditInModule = (moduleId: number | string): boolean => {
    if (permissions.isSuperAdmin) return true;
    const mp = permissions.modules[String(moduleId)];
    if (!mp) return false;
    if (mp.manage) return true;
    return mp.edit ?? false;
  };

  const canDeleteInModule = (moduleId: number | string): boolean => {
    if (permissions.isSuperAdmin) return true;
    const mp = permissions.modules[String(moduleId)];
    if (!mp) return false;
    if (mp.manage) return true;
    return mp.delete ?? false;
  };

  const canAccessEntity = (entityId: number | string, action: "create" | "read" | "update" | "delete"): boolean => {
    if (permissions.isSuperAdmin) return true;
    const ep = permissions.entities[String(entityId)];
    return ep ? (ep[action] ?? false) : false;
  };

  const getFieldVisibility = (entityId: number | string, fieldSlug: string): FieldVisibility => {
    if (permissions.isSuperAdmin) return "write";
    const ef = permissions.fields[String(entityId)];
    if (!ef) return "write";
    return ef[fieldSlug] ?? "write";
  };

  const canExecuteAction = (actionId: number | string): boolean => {
    if (permissions.isSuperAdmin) return true;
    const ap = permissions.actions[String(actionId)];
    return ap ? ap.execute : false;
  };

  const hasBuilderAccess = (): boolean => {
    return permissions.isSuperAdmin || permissions.builderAccess;
  };

  return (
    <PermissionsContext.Provider value={{
      permissions,
      isLoading,
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
