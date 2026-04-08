import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";

const API = "/api";

export interface PlatformModule {
  id: number;
  name: string;
  nameHe?: string | null;
  nameEn?: string | null;
  slug: string;
  moduleKey?: string | null;
  description?: string | null;
  icon?: string;
  color?: string;
  category?: string;
  parentModuleId?: number | null;
  status?: string;
  version?: number;
  settings?: any;
  sortOrder?: number;
  isSystem?: boolean;
  showInSidebar?: boolean;
  showInDashboard?: boolean;
  permissionsScope?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  entities?: any[];
  recordCount?: number;
}

export const PLATFORM_MODULES_QUERY_KEY = ["platform", "modules"] as const;

export function usePlatformModules() {
  const { data: modules = [], isLoading, isError, error } = useQuery<PlatformModule[]>({
    queryKey: PLATFORM_MODULES_QUERY_KEY,
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/modules`);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : (data?.data || []);
    },
    staleTime: 5 * 60 * 1000,
  });

  return { modules, isLoading, isError, error };
}
