import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * Fetches the current user's permission codes via `governance.get_my_permissions()`
 * and exposes a `hasPermission(code)` helper for the UI.
 */
export const usePermissions = () => {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPermissions = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_my_permissions");
      if (error) throw error;
      setPermissions(data || []);
    } catch (err) {
      console.error("[usePermissions] load failed", err);
      setPermissions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  const hasPermission = useMemo(() => {
    const set = new Set(permissions);
    return (permissionCode: string) => set.has(permissionCode);
  }, [permissions]);

  const hasAnyPermission = useMemo(() => {
    const set = new Set(permissions);
    return (...codes: string[]) => codes.some((c) => set.has(c));
  }, [permissions]);

  return {
    permissions,
    hasPermission,
    hasAnyPermission,
    loading,
    reload: loadPermissions,
  };
};
