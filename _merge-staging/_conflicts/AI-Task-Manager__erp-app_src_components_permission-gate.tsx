import { useState, useEffect, createContext, useContext } from "react";
import { ShieldAlert, Lock, LogIn } from "lucide-react";
import { authFetch } from "@/lib/utils";

interface UserPermissions {
  role: string;
  modules: string[];
  permissions: string[];
  isSuperAdmin: boolean;
}

const PermissionContext = createContext<UserPermissions>({
  role: "user",
  modules: [],
  permissions: [],
  isSuperAdmin: false,
});

export function usePermissions() {
  return useContext(PermissionContext);
}

export function PermissionProvider({ children }: { children: React.ReactNode }) {
  const [perms, setPerms] = useState<UserPermissions>({ role: "user", modules: [], permissions: [], isSuperAdmin: false });

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/auth/me");
        if (res.ok) {
          const user = await res.json();
          setPerms({
            role: user.role || user.jobTitle || "user",
            modules: user.modules || [],
            permissions: user.permissions || [],
            isSuperAdmin: user.isSuperAdmin || user.is_super_admin || false,
          });
        }
      } catch {}
    })();
  }, []);

  return <PermissionContext.Provider value={perms}>{children}</PermissionContext.Provider>;
}

interface PermissionGateProps {
  children: React.ReactNode;
  requiredModule?: string;
  requiredPermission?: string;
  requiredRole?: string;
  fallback?: React.ReactNode;
  showFallback?: boolean;
}

export default function PermissionGate({ children, requiredModule, requiredPermission, requiredRole, fallback, showFallback = true }: PermissionGateProps) {
  const perms = usePermissions();

  if (perms.isSuperAdmin) return <>{children}</>;

  let hasAccess = true;
  if (requiredModule && !perms.modules.includes(requiredModule)) hasAccess = false;
  if (requiredPermission && !perms.permissions.includes(requiredPermission)) hasAccess = false;
  if (requiredRole && perms.role !== requiredRole) hasAccess = false;

  if (hasAccess) return <>{children}</>;

  if (fallback) return <>{fallback}</>;
  if (!showFallback) return null;

  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <div className="p-4 bg-red-500/10 rounded-2xl mb-4"><ShieldAlert className="w-12 h-12 text-red-400" /></div>
      <h2 className="text-lg font-bold text-foreground mb-2">אין הרשאה</h2>
      <p className="text-sm text-muted-foreground max-w-sm">אין לך הרשאה לצפות בתוכן זה. פנה למנהל המערכת לקבלת גישה.</p>
      {requiredModule && <p className="text-xs text-muted-foreground/60 mt-2 flex items-center gap-1"><Lock className="w-3 h-3" />נדרש מודול: {requiredModule}</p>}
      {requiredPermission && <p className="text-xs text-muted-foreground/60 mt-1 flex items-center gap-1"><Lock className="w-3 h-3" />נדרשת הרשאה: {requiredPermission}</p>}
    </div>
  );
}

export function WritePermissionGate({ children, module: mod, fallback }: { children: React.ReactNode; module?: string; fallback?: React.ReactNode }) {
  const perms = usePermissions();
  if (perms.isSuperAdmin) return <>{children}</>;
  if (mod && !perms.permissions.includes(`${mod}:write`)) {
    return fallback ? <>{fallback}</> : null;
  }
  return <>{children}</>;
}
