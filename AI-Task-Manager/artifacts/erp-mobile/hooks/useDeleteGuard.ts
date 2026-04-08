import { useAuth } from "@/contexts/AuthContext";

export const CONFIRM_WORD = "מחק";

export function useDeleteGuard() {
  const { user } = useAuth();
  const isSuperAdmin = user?.isSuperAdmin === true;
  const canDelete = isSuperAdmin;

  return { canDelete, isSuperAdmin };
}
