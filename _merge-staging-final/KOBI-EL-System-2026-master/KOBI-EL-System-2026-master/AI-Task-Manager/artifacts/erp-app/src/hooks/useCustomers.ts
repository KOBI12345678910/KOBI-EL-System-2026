import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";

const API = "/api";

export interface Customer {
  id: number;
  name?: string;
  company_name?: string;
  customer_name?: string;
  customerName?: string;
  status?: string;
  is_active?: boolean;
  [key: string]: any;
}

export const CUSTOMERS_QUERY_KEY = ["customers"] as const;

export function useCustomers() {
  const { data: customers = [], isLoading, isError, error } = useQuery<Customer[]>({
    queryKey: CUSTOMERS_QUERY_KEY,
    queryFn: async () => {
      const r = await authFetch(`${API}/customers?limit=1000`);
      if (!r.ok) return [];
      const data = await r.json();
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.data)) return data.data;
      return [];
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return { customers, isLoading, isError, error };
}
