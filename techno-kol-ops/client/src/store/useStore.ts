import { create } from 'zustand';

interface WorkOrder {
  id: string;
  client_name: string;
  product: string;
  material_primary: string;
  category: string;
  price: number;
  status: string;
  progress: number;
  delivery_date: string;
  open_date: string;
  assigned_employees: string[];
}

interface Alert {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  entity_type: string;
  entity_id: string;
  is_resolved: boolean;
  created_at: string;
}

interface FactorySnapshot {
  activeOrders: WorkOrder[];
  attendance: { factory: number; field: number; absent: number; total: number };
  materialAlerts: number;
  openAlerts: Alert[];
  monthlyRevenue: number;
  monthlyCosts: number;
  utilizationPct: number;
  recentEvents: any[];
}

interface StoreState {
  // Auth
  token: string | null;
  user: any | null;
  setAuth: (token: string, user: any) => void;
  logout: () => void;

  // WebSocket
  wsConnected: boolean;
  setWsConnected: (v: boolean) => void;

  // Snapshot
  snapshot: FactorySnapshot | null;
  setSnapshot: (s: FactorySnapshot) => void;

  // Alerts
  alerts: Alert[];
  setAlerts: (a: Alert[]) => void;
  addAlert: (a: Alert) => void;
  resolveAlert: (id: string) => void;

  // UI
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
}

export const useStore = create<StoreState>((set) => ({
  token: localStorage.getItem('tk_token'),
  user: JSON.parse(localStorage.getItem('tk_user') || 'null'),
  setAuth: (token, user) => {
    localStorage.setItem('tk_token', token);
    localStorage.setItem('tk_user', JSON.stringify(user));
    set({ token, user });
  },
  logout: () => {
    localStorage.removeItem('tk_token');
    localStorage.removeItem('tk_user');
    set({ token: null, user: null });
  },

  wsConnected: false,
  setWsConnected: (v) => set({ wsConnected: v }),

  snapshot: null,
  setSnapshot: (s) => set({ snapshot: s }),

  alerts: [],
  setAlerts: (a) => set({ alerts: a }),
  addAlert: (a) => set((state) => ({ alerts: [a, ...state.alerts] })),
  resolveAlert: (id) => set((state) => ({
    alerts: state.alerts.map(a => a.id === id ? { ...a, is_resolved: true } : a)
  })),

  sidebarOpen: true,
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
}));
