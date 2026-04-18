import { useAppStore } from '../store/useAppStore';
import { logout } from './auth';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3100';
const OPS_BASE = process.env.EXPO_PUBLIC_OPS_URL || 'http://localhost:3200';

function getToken(): string | null {
  return useAppStore.getState().token;
}

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extra,
  };
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    await logout();
    throw new Error('פג תוקף הסשן. אנא התחבר מחדש.');
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: `שגיאה ${response.status}` }));
    throw new Error(error.message || `שגיאה ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function apiGet<T = unknown>(path: string, useOps = false): Promise<T> {
  const base = useOps ? OPS_BASE : API_BASE;
  const response = await fetch(`${base}${path}`, {
    method: 'GET',
    headers: buildHeaders(),
  });
  return handleResponse<T>(response);
}

export async function apiPost<T = unknown>(
  path: string,
  body: unknown,
  useOps = false
): Promise<T> {
  const base = useOps ? OPS_BASE : API_BASE;
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  return handleResponse<T>(response);
}

export async function apiPut<T = unknown>(
  path: string,
  body: unknown,
  useOps = false
): Promise<T> {
  const base = useOps ? OPS_BASE : API_BASE;
  const response = await fetch(`${base}${path}`, {
    method: 'PUT',
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  return handleResponse<T>(response);
}

export async function apiPatch<T = unknown>(
  path: string,
  body: unknown,
  useOps = false
): Promise<T> {
  const base = useOps ? OPS_BASE : API_BASE;
  const response = await fetch(`${base}${path}`, {
    method: 'PATCH',
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  return handleResponse<T>(response);
}

// API endpoints
export const api = {
  // Auth
  login: (username: string, password: string) =>
    apiPost('/api/auth/login', { username, password }),

  // Dashboard
  getDashboardSnapshot: () => apiGet('/api/dashboard/snapshot'),

  // Work Orders
  getWorkOrders: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiGet(`/api/work-orders${query}`, true);
  },
  getWorkOrder: (id: string) => apiGet(`/api/work-orders/${id}`, true),
  createWorkOrder: (data: unknown) => apiPost('/api/work-orders', data, true),
  updateWorkOrderStatus: (id: string, status: string) =>
    apiPatch(`/api/work-orders/${id}/status`, { status }, true),

  // Employees
  getEmployees: () => apiGet('/api/employees', true),
  getEmployee: (id: string) => apiGet(`/api/employees/${id}`, true),

  // Projects
  getProjects: () => apiGet('/api/projects', true),
  getProject: (id: string) => apiGet(`/api/projects/${id}`, true),

  // Materials
  getMaterials: () => apiGet('/api/materials'),
  getMaterial: (id: string) => apiGet(`/api/materials/${id}`),

  // Finance
  getFinanceSummary: () => apiGet('/api/finance/summary'),
  getInvoices: () => apiGet('/api/finance/invoices'),

  // Alerts
  getAlerts: () => apiGet('/api/alerts'),
  acknowledgeAlert: (id: string) => apiPost(`/api/alerts/${id}/acknowledge`, {}),

  // AI
  chatKobi: (message: string, history: unknown[]) =>
    apiPost('/api/ai/chat', { assistant: 'kobi', message, history }),
  chatUzi: (message: string, history: unknown[]) =>
    apiPost('/api/ai/chat', { assistant: 'uzi', message, history }),
};

export default api;
