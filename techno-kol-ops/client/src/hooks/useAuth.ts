import { useCallback, useMemo } from "react";
import { useStore } from "../store/useStore";

export interface AuthUser {
  id?: string;
  email?: string;
  username?: string;
  role?: string;
  [key: string]: unknown;
}

/**
 * Thin auth hook that wraps the Zustand store.
 * Components import `useAuth()` instead of touching the store directly.
 */
export function useAuth() {
  const token = useStore((s) => s.token);
  const storeUser = useStore((s) => s.user);
  const storeLogout = useStore((s) => s.logout);

  const user: AuthUser | null = useMemo(
    () => (token && storeUser ? storeUser : null),
    [token, storeUser]
  );

  const logout = useCallback(() => {
    storeLogout();
  }, [storeLogout]);

  return { user, token, logout } as const;
}
