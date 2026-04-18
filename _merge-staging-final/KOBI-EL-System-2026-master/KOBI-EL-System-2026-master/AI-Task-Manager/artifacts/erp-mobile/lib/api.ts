import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "erp_auth_token";

function getBaseUrl(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) {
    return `https://${domain}/api`;
  }
  if (__DEV__) {
    return "http://localhost:3000/api";
  }
  return "/api";
}

export const API_BASE = getBaseUrl();

export async function getStoredToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setStoredToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } catch (e) {
    console.warn("Failed to store token:", e);
  }
}

export async function removeStoredToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch (e) {
    console.warn("Failed to remove token:", e);
  }
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const url = `${API_BASE}${endpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = body.error || body.message || `Request failed: ${res.status}`;
      throw new Error(msg);
    }

    if (res.status === 204 || res.headers.get("content-length") === "0") {
      return {} as T;
    }

    const text = await res.text();
    if (!text || text.trim() === "") {
      return {} as T;
    }

    return JSON.parse(text);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("הבקשה נכשלה - timeout");
    }
    throw err;
  }
}

interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  fullNameHe?: string;
  email: string;
  phone?: string;
  department?: string;
  jobTitle?: string;
  isSuperAdmin?: boolean;
  isActive?: boolean;
}

export async function login(username: string, password: string) {
  const data = await apiRequest<{
    token: string;
    user: AuthUser;
    message: string;
  }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  await setStoredToken(data.token);
  return data;
}

export async function getMe() {
  return apiRequest<{ user: AuthUser }>("/auth/me");
}

export async function logout() {
  try {
    await apiRequest("/auth/logout", { method: "POST" });
  } finally {
    await removeStoredToken();
  }
}

export async function getModules() {
  return apiRequest<any[]>("/platform/modules");
}

export async function getModule(id: number) {
  return apiRequest<any>(`/platform/modules/${id}`);
}

export async function getEntities(moduleId: number) {
  return apiRequest<any[]>(`/platform/entities?moduleId=${moduleId}`);
}

export async function getEntityRecords(entityId: number, params?: {
  limit?: number;
  offset?: number;
  search?: string;
  sortField?: string;
  sortDir?: string;
  filters?: string;
}) {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  if (params?.search) query.set("search", params.search);
  if (params?.sortField) query.set("sortField", params.sortField);
  if (params?.sortDir) query.set("sortDir", params.sortDir);
  if (params?.filters) query.set("filters", params.filters);
  const qs = query.toString();
  return apiRequest<any>(`/platform/entities/${entityId}/records${qs ? `?${qs}` : ""}`);
}

export async function getRecord(entityId: number, recordId: number) {
  return apiRequest<any>(`/platform/entities/${entityId}/records/${recordId}`);
}

export async function updateRecord(entityId: number, recordId: number, data: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/platform/entities/${entityId}/records/${recordId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function createRecord(entityId: number, data: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/platform/entities/${entityId}/records`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteRecord(entityId: number, recordId: number) {
  return apiRequest<{ success: boolean }>(`/platform/records/${recordId}`, {
    method: "DELETE",
  });
}

export async function getApprovalRequests(params?: { status?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiRequest<any[]>(`/platform/approval-requests${qs ? `?${qs}` : ""}`);
}

export async function approveRequest(id: number, comments?: string) {
  return apiRequest<any>(`/platform/approval-requests/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ comments }),
  });
}

export async function rejectRequest(id: number, comments?: string) {
  return apiRequest<any>(`/platform/approval-requests/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ comments }),
  });
}

export async function getNotifications(params?: {
  limit?: number;
  offset?: number;
  isRead?: string;
  category?: string;
}) {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  if (params?.isRead) query.set("isRead", params.isRead);
  if (params?.category) query.set("category", params.category);
  const qs = query.toString();
  return apiRequest<any>(`/notifications${qs ? `?${qs}` : ""}`);
}

export async function markNotificationRead(id: number) {
  return apiRequest<any>(`/notifications/${id}/read`, { method: "PUT" });
}

export async function markAllNotificationsRead() {
  return apiRequest<any>("/notifications/read-all", { method: "PUT" });
}

export async function getMessages(params?: { limit?: number; offset?: number }) {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  const qs = query.toString();
  return apiRequest<any>(`/platform/messaging/messages${qs ? `?${qs}` : ""}`);
}

export async function getEntityFields(entityId: number) {
  return apiRequest<any[]>(`/platform/entities/${entityId}/fields`);
}

export async function getAuthStats() {
  return apiRequest<{ totalUsers: number }>("/auth/stats");
}

export async function sendClaudeMessage(params: {
  message: string;
  channel?: string;
  conversationId?: number;
}) {
  return apiRequest<any>("/claude/chat/send", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function sendKimiMessage(params: {
  messages: Array<{ role: string; content: string }>;
  model?: string;
}) {
  return apiRequest<any>("/kimi/chat", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function getDocumentFolders() {
  return apiRequest<any[]>("/document-folders");
}

export async function getDocumentFiles(params?: {
  folderId?: number;
  search?: string;
  trashed?: boolean;
}) {
  const query = new URLSearchParams();
  if (params?.folderId) query.set("folderId", String(params.folderId));
  if (params?.search) query.set("search", params.search);
  if (params?.trashed) query.set("trashed", "true");
  const qs = query.toString();
  return apiRequest<any[]>(`/document-files${qs ? `?${qs}` : ""}`);
}

export async function uploadDocumentFile(formData: FormData) {
  const token = await AsyncStorage.getItem("erp_auth_token");
  const url = `${API_BASE}/document-files/upload`;
  const res = await fetch(url, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Upload failed: ${res.status}`);
  }
  return res.json();
}

export async function getDocumentDownloadUrl(fileId: number): Promise<string> {
  const token = await AsyncStorage.getItem("erp_auth_token");
  const base = `${API_BASE}/document-files/${fileId}/download`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

export async function updateCurrentUser(data: {
  fullName?: string;
  email?: string;
  phone?: string;
}) {
  const me = await apiRequest<{ user: { id: number } }>("/auth/me");
  return apiRequest<{ user: unknown; message: string }>(`/auth/users/${me.user.id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function changePassword(data: {
  currentPassword: string;
  newPassword: string;
}) {
  return apiRequest<{ message: string }>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getReportData(reportId: string, params?: { period?: string }) {
  const query = new URLSearchParams();
  if (params?.period) query.set("period", params.period);
  const qs = query.toString();
  return apiRequest<any>(`/reports-center/${reportId}${qs ? `?${qs}` : ""}`);
}

export async function getUsers(params?: { search?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiRequest<{ users: Record<string, unknown>[]; count: number }>(`/auth/users${qs ? `?${qs}` : ""}`);
}

export async function updateUserRole(userId: number, role: string) {
  const isSuperAdmin = role === "admin";
  return apiRequest<Record<string, unknown>>(`/auth/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify({ isSuperAdmin }),
  });
}

export async function getDashboardStats() {
  const [modules, approvals, notifications] = await Promise.all([
    getModules().catch(() => []),
    getApprovalRequests({ status: "pending", limit: 100 }).catch(() => []),
    getNotifications({ limit: 100, isRead: "false" }).catch(() => ({ notifications: [], total: 0 })),
  ]);
  return {
    totalModules: modules.length,
    pendingApprovals: Array.isArray(approvals) ? approvals.length : 0,
    unreadNotifications: typeof notifications === "object" && "total" in notifications ? notifications.total : 0,
    modules: modules.slice(0, 8),
  };
}

export async function getEntitySlugMap(): Promise<Record<string, number>> {
  return apiRequest<Record<string, number>>("/platform/entities/slug-map");
}

export async function getFinanceDashboard() {
  return apiRequest<any>("/finance/dashboard");
}

export async function getFinanceTable(table: string, params?: {
  limit?: number;
  offset?: number;
  search?: string;
  status?: string;
}) {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  if (params?.search) query.set("search", params.search);
  if (params?.status) query.set("status", params.status);
  const qs = query.toString();
  return apiRequest<any>(`/finance/${table}${qs ? `?${qs}` : ""}`);
}

export async function createFinanceRecord(table: string, data: any) {
  return apiRequest<any>(`/finance/${table}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateFinanceRecord(table: string, id: number, data: any) {
  return apiRequest<any>(`/finance/${table}/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// ======== HR ========
export async function getHRDashboard() {
  return apiRequest<any>("/hr/dashboard");
}

export async function getEmployees(params?: { search?: string; department?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.department) query.set("department", params.department);
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiRequest<any>(`/hr/employees${qs ? `?${qs}` : ""}`);
}

export async function getEmployee(id: number) {
  return apiRequest<any>(`/hr/employees/${id}`);
}

export async function getAttendanceSummary(params?: { month?: string; year?: string }) {
  const query = new URLSearchParams();
  if (params?.month) query.set("month", params.month);
  if (params?.year) query.set("year", params.year);
  const qs = query.toString();
  return apiRequest<any>(`/hr/attendance/summary${qs ? `?${qs}` : ""}`);
}

export async function getShiftsSchedule(params?: { week?: string }) {
  const query = new URLSearchParams();
  if (params?.week) query.set("week", params.week);
  const qs = query.toString();
  return apiRequest<any>(`/hr/shifts/schedule${qs ? `?${qs}` : ""}`);
}

export async function getDepartments() {
  return apiRequest<any>("/hr/departments");
}

// ======== PRODUCTION ========
export async function getWorkOrders(params?: { status?: string; limit?: number; since?: string }) {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.since) query.set("updated_after", params.since);
  const qs = query.toString();
  return apiRequest<any[]>(`/work-orders${qs ? `?${qs}` : ""}`);
}

export async function getWorkOrderStats() {
  return apiRequest<any>("/work-orders/stats");
}

export async function updateWorkOrder(id: number, data: any) {
  return apiRequest<any>(`/work-orders/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function getQualityInspections(params?: { limit?: number }) {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiRequest<any[]>(`/quality-inspections${qs ? `?${qs}` : ""}`);
}

export async function getQualityStats() {
  return apiRequest<any>("/quality-inspections/stats");
}

// ======== PROCUREMENT ========
export async function getPurchaseOrders(params?: { status?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiRequest<any[]>(`/purchase-orders${qs ? `?${qs}` : ""}`);
}

export async function getPurchaseOrder(id: number) {
  return apiRequest<any>(`/purchase-orders/${id}`);
}

export async function updatePurchaseOrder(id: number, data: any) {
  return apiRequest<any>(`/purchase-orders/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function getSuppliers(params?: { search?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiRequest<any[]>(`/suppliers${qs ? `?${qs}` : ""}`);
}

export async function getSupplier(id: number) {
  return apiRequest<any>(`/suppliers/${id}`);
}

export async function getRawMaterials(params?: { search?: string; limit?: number; since?: string }) {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.since) query.set("updated_after", params.since);
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiRequest<any[]>(`/raw-materials${qs ? `?${qs}` : ""}`);
}

export async function getInventoryAlerts() {
  return apiRequest<any[]>("/inventory-alerts");
}

// ======== PROJECTS ========
export async function getProjects(params?: { status?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiRequest<any[]>(`/projects-module${qs ? `?${qs}` : ""}`);
}

export async function getProject(id: number) {
  return apiRequest<any>(`/projects-module/${id}`);
}

export async function getProjectTasks(params?: { projectId?: number; status?: string; assignee?: string }) {
  const query = new URLSearchParams();
  if (params?.projectId) query.set("projectId", String(params.projectId));
  if (params?.status) query.set("status", params.status);
  if (params?.assignee) query.set("assignee", params.assignee);
  const qs = query.toString();
  return apiRequest<any[]>(`/project-tasks${qs ? `?${qs}` : ""}`);
}

export async function getProjectTask(id: number) {
  return apiRequest<any>(`/project-tasks/${id}`);
}

export async function updateProjectTask(id: number, data: any) {
  return apiRequest<any>(`/project-tasks/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function getProjectMilestones(params?: { projectId?: number }) {
  const query = new URLSearchParams();
  if (params?.projectId) query.set("projectId", String(params.projectId));
  const qs = query.toString();
  return apiRequest<any[]>(`/project-milestones${qs ? `?${qs}` : ""}`);
}

export async function getCrmDashboard() {
  return apiRequest<any>("/crm/dashboard");
}

export async function getCrmLeads() {
  return apiRequest<any>("/crm/leads");
}

export async function getCrmCustomers(params?: { search?: string; limit?: number; since?: string }) {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.since) query.set("updated_after", params.since);
  const qs = query.toString();
  return apiRequest<any>(`/crm/customers${qs ? `?${qs}` : ""}`);
}

export async function getMarketingCampaigns() {
  const data = await apiRequest<any>("/marketing/campaigns");
  return Array.isArray(data) ? data : (data?.data || data?.items || []);
}

export async function getMarketingCampaignStats() {
  return apiRequest<any>("/marketing/campaigns/stats");
}

export async function createMarketingCampaign(data: any) {
  return apiRequest<any>("/marketing/campaigns", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateMarketingCampaign(id: number, data: any) {
  return apiRequest<any>(`/marketing/campaigns/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteMarketingCampaign(id: number) {
  return apiRequest<any>(`/marketing/campaigns/${id}`, {
    method: "DELETE",
  });
}

export async function getMarketingContentCalendar() {
  const data = await apiRequest<any>("/marketing/content-calendar");
  return Array.isArray(data) ? data : (data?.data || data?.items || []);
}

export async function getMarketingContentCalendarStats() {
  return apiRequest<any>("/marketing/content-calendar/stats");
}

export async function getMarketingEmailCampaigns() {
  const data = await apiRequest<any>("/marketing/email");
  return Array.isArray(data) ? data : (data?.data || data?.items || []);
}

export async function getMarketingEmailStats() {
  return apiRequest<any>("/marketing/email/stats");
}

export async function getMarketingSocialMedia() {
  const data = await apiRequest<any>("/marketing/social-media");
  return Array.isArray(data) ? data : (data?.data || data?.items || []);
}

export async function getMarketingSocialMediaStats() {
  return apiRequest<any>("/marketing/social-media/stats");
}

export async function getMarketingBudget() {
  const data = await apiRequest<any>("/marketing/budget");
  return Array.isArray(data) ? data : (data?.data || data?.items || []);
}

export async function getMarketingBudgetStats() {
  return apiRequest<any>("/marketing/budget/stats");
}

// ======== FIELD OPERATIONS ========
export async function fieldGpsClock(data: { action: string; latitude?: number; longitude?: number; accuracy?: number; notes?: string }) {
  return apiRequest<{ success: boolean; message: string }>("/field-ops/gps-clock", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getFieldGpsClockStatus() {
  return apiRequest<{ isClockedIn: boolean; lastRecord: Record<string, unknown> | null }>("/field-ops/gps-clock/status");
}

export async function getFieldGpsClockHistory(params?: { limit?: number }) {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiRequest<{ records: Record<string, unknown>[] }>(`/field-ops/gps-clock/history${qs ? `?${qs}` : ""}`);
}

export async function getFieldTeamLocations() {
  return apiRequest<{ members: Record<string, unknown>[] }>("/field-ops/gps-clock/team");
}

export async function getLocationPings(params?: { userId?: number; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.userId) query.set("userId", String(params.userId));
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiRequest<{ pings: Record<string, unknown>[] }>(`/field-ops/location-pings${qs ? `?${qs}` : ""}`);
}

export async function sendLocationPing(data: { latitude: number; longitude: number; accuracy?: number }) {
  return apiRequest<{ success: boolean }>("/field-ops/location-ping", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function createVisitLog(data: { customerId?: number; customerName?: string; notes?: string; photos?: string[]; latitude?: number; longitude?: number; orderData?: Record<string, unknown> }) {
  return apiRequest<{ success: boolean; visit: Record<string, unknown> }>("/field-ops/visit-logs", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getVisitLogs(params?: { limit?: number }) {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiRequest<{ visits: Record<string, unknown>[] }>(`/field-ops/visit-logs${qs ? `?${qs}` : ""}`);
}

export async function createProductionReport(data: { workOrderId?: number; type: string; quantityProduced?: number; reasonCode?: string; reasonText?: string; severity?: string; description?: string; photos?: string[] }) {
  return apiRequest<{ success: boolean; report: Record<string, unknown> }>("/field-ops/production-reports", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getFieldProductionReports(params?: { limit?: number }) {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiRequest<{ reports: Record<string, unknown>[] }>(`/field-ops/production-reports${qs ? `?${qs}` : ""}`);
}

export async function getMaintenanceOrders(params?: { status?: string }) {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  const qs = query.toString();
  return apiRequest<{ orders: Record<string, unknown>[] }>(`/field-ops/maintenance-orders${qs ? `?${qs}` : ""}`);
}

export async function getMaintenanceOrder(id: number) {
  return apiRequest<{ order: Record<string, unknown> }>(`/field-ops/maintenance-orders/${id}`);
}

export async function updateMaintenanceOrder(id: number, data: Record<string, unknown>) {
  return apiRequest<{ success: boolean; order: Record<string, unknown> }>(`/field-ops/maintenance-orders/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function getFieldScanHistory(params?: { limit?: number }) {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiRequest<{ scans: Record<string, unknown>[] }>(`/field-ops/scan-history${qs ? `?${qs}` : ""}`);
}

export async function saveFieldScan(data: { barcode: string; itemName?: string; itemCode?: string; action?: string; result?: string }) {
  return apiRequest<{ success: boolean; scan: Record<string, unknown> }>("/field-ops/scan-history", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function createOnsiteOrder(data: {
  customerId?: number;
  customerName?: string;
  items: { name: string; quantity: number; priceAgorot: number; productId?: number; itemNumber?: string }[];
  totalAgorot: number;
  notes?: string;
}) {
  return apiRequest<{ success: boolean; orderId: number | null }>("/field-ops/onsite-order", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getProductCatalog(params?: { search?: string; limit?: number; since?: string }) {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.since) query.set("updated_after", params.since);
  const qs = query.toString();
  return apiRequest<{ products: Record<string, unknown>[] }>(`/field-ops/product-catalog${qs ? `?${qs}` : ""}`);
}

export async function lookupBarcode(code: string) {
  return apiRequest<{ found: boolean; source: string | null; item: Record<string, unknown> | null; message?: string }>(`/field-ops/barcode-lookup/${encodeURIComponent(code)}`);
}

export async function getFieldCustomerDetail(customerId: number) {
  return apiRequest<{ customer: Record<string, unknown>; recentOrders: Record<string, unknown>[] }>(`/field-ops/customer-detail/${customerId}`);
}

// ======== WAREHOUSE (WMS) ========

export interface WmsPickItem {
  id: number;
  itemCode: string;
  itemDescription: string;
  barcode?: string | null;
  requestedQuantity: number;
  pickedQuantity: number;
  status: string;
  shortReason?: string | null;
  locationCode?: string | null;
  substitutionBarcode?: string | null;
  substitutionItemCode?: string | null;
  substitutionQuantity?: number | null;
}

export interface WmsPickList {
  id: number;
  listNumber: string;
  orderNumber?: string;
  customerName?: string;
  priority?: string;
  status: string;
  items: WmsPickItem[];
}

export interface WmsCountItem {
  itemCode: string;
  itemDescription: string;
  barcode?: string;
  systemQuantity: number;
  countedQuantity: number;
  variance: number;
  unit: string;
  varianceNote?: string | null;
  variancePhotoUri?: string | null;
  locationCode?: string;
}

export interface WmsCountTask {
  id: number;
  zone: string;
  locationCode: string;
  description?: string;
  status: string;
  assignedDate?: string;
}

export interface WmsPutawayItem {
  id: number;
  receiptId: number;
  receiptNumber?: string;
  itemCode: string;
  itemDescription: string;
  barcode?: string;
  quantity: number;
  unit: string;
  suggestedLocation?: string;
  status: string;
  confirmedLocation?: string;
  overrideReason?: string | null;
}

export interface WmsTransferItem {
  itemDescription: string;
  itemCode: string;
  barcode: string;
  quantity: number;
  unit: string;
  confirmedAtSource: boolean;
  confirmedAtDestination: boolean;
}

export interface WmsMaterialScan {
  id: number;
  material_name: string;
  material_number: string;
  barcode?: string | null;
  unit?: string;
  quantity_on_hand?: number;
  quantity?: number;
}

export interface WmsPurchaseOrder {
  id: number;
  order_number: string;
  supplier_name?: string;
  supplier_id?: number;
  status: string;
  items: Array<{
    id: number;
    materialId: number | null;
    materialName: string;
    materialNumber: string;
    barcode: string | null;
    itemCode: string | null;
    itemDescription: string;
    quantity: string;
    receivedQuantity: string;
    unit: string;
  }>;
}

export async function getWMSPickLists(params?: { status?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiRequest<{ pickLists: WmsPickList[] } | WmsPickList[]>(`/warehouse-intelligence/pick-lists${qs ? `?${qs}` : ""}`);
}

export async function submitPickList(data: { pickListId: number; listNumber: string; items: WmsPickItem[] }) {
  return apiRequest<{ success: boolean; message?: string }>("/warehouse-intelligence/pick-complete", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function createStockTransfer(data: { sourceWarehouse: string; destinationWarehouse: string; notes?: string; items: WmsTransferItem[] }) {
  return apiRequest<{ transferId?: number; id?: number; success?: boolean }>("/warehouse-intelligence/stock-transfer", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function confirmStockTransfer(data: { transferId?: string | number | null; destinationWarehouse: string; items: WmsTransferItem[] }) {
  return apiRequest<{ success: boolean; message?: string }>("/warehouse-intelligence/stock-transfer-confirm", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getCountTasks(params?: { status?: string; zone?: string }) {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.zone) query.set("zone", params.zone);
  const qs = query.toString();
  return apiRequest<{ tasks: WmsCountTask[] } | WmsCountTask[]>(`/warehouse-intelligence/count-tasks${qs ? `?${qs}` : ""}`);
}

export async function submitCycleCount(data: { taskId: number; locationCode: string; zone: string; items: WmsCountItem[] }) {
  return apiRequest<{ success: boolean; message?: string }>("/warehouse-intelligence/count-submit", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getPutawayAssignments(params?: { receiptId?: number; status?: string }) {
  const query = new URLSearchParams();
  if (params?.receiptId) query.set("receiptId", String(params.receiptId));
  if (params?.status) query.set("status", params.status);
  const qs = query.toString();
  return apiRequest<{ assignments: WmsPutawayItem[] } | WmsPutawayItem[]>(`/warehouse-intelligence/putaway-assignments${qs ? `?${qs}` : ""}`);
}

export async function confirmPutaway(data: { assignmentId: number; receiptId: number; itemCode: string; quantity: number; confirmedLocation: string; suggestedLocation: string; overrideReason?: string | null }) {
  return apiRequest<{ success: boolean; message?: string }>("/warehouse-intelligence/putaway-confirm", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function scanMaterial(barcode: string) {
  return apiRequest<WmsMaterialScan>(`/warehouse-intelligence/scan-material/${encodeURIComponent(barcode)}`);
}

export async function scanPO(code: string) {
  return apiRequest<WmsPurchaseOrder>(`/warehouse-intelligence/scan-po/${encodeURIComponent(code)}`);
}
