import { createContext, useContext } from "react";

export interface AuthContextType {
  user: Record<string, unknown> | null;
  token: string | null;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType>({ user: null, token: null, logout: () => {} });
export const useAuth = () => useContext(AuthContext);
