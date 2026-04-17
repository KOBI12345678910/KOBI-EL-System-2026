import { create } from 'zustand';

interface User {
  id: string;
  username: string;
  name: string;
  role: string;
  email?: string;
}

interface AppState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  notificationsCount: number;
  isLoading: boolean;

  setAuth: (user: User, token: string) => void;
  logout: () => void;
  setNotificationsCount: (count: number) => void;
  setLoading: (loading: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  notificationsCount: 0,
  isLoading: false,

  setAuth: (user: User, token: string) =>
    set({ user, token, isAuthenticated: true }),

  logout: () =>
    set({ user: null, token: null, isAuthenticated: false, notificationsCount: 0 }),

  setNotificationsCount: (count: number) =>
    set({ notificationsCount: count }),

  setLoading: (loading: boolean) =>
    set({ isLoading: loading }),
}));
