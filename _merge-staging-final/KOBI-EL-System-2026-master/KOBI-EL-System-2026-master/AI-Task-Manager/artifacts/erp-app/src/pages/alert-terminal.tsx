import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell, AlertTriangle, ShieldCheck, ClipboardList, Settings, GitBranch,
  Activity, TrendingUp, CheckCheck, Archive, Trash2, Search, X,
  ChevronLeft, ChevronRight, ExternalLink, RefreshCw, Calendar,
  ShoppingCart, Ship, BarChart3, Wrench, Plus, Factory, Users, Boxes,
  DollarSign, Truck,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { authFetch } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API_BASE = "/api";

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  anomaly: { label: "חריגה", icon: AlertTriangle, color: "text-amber-400" },
  task: { label: "משימה", icon: ClipboardList, color: "text-blue-400" },
  approval: { label: "אישור", icon: ShieldCheck, color: "text-purple-400" },
  system: { label: "מערכת", icon: Settings, color: "text-muted-foreground" },
  workflow: { label: "Workflow", icon: GitBranch, color: "text-emerald-400" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  critical: { label: "קריטי", color: "text-red-400", bg: "bg-red-500/20 border-red-500/30", dot: "bg-red-500" },
  high: { label: "גבוה", color: "text-orange-400", bg: "bg-orange-500/20 border-orange-500/30", dot: "bg-orange-500" },
  normal: { label: "רגיל", color: "text-blue-400", bg: "bg-blue-500/20 border-blue-500/30", dot: "bg-blue-400" },
  low: { label: "נמוך", color: "text-muted-foreground", bg: "bg-muted/20 border-slate-500/30", dot: "bg-muted" },
};

const MODULE_HEALTH_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "רכש": ShoppingCart,
  "ייצור": Factory,
  "משלוחים": Truck,
  "תקציב": DollarSign,
  "מלאי": Boxes,
  "אישורים": ShieldCheck,
  "איכות": CheckCheck,
  "עובדים": Users,
};

const MODULE_HEALTH_ROUTES: Record<string, string> = {
  "רכש": "/purchase-orders",
  "ייצור": "/work-orders",
  "משלוחים": "/suppliers",
  "תקציב": "/finance/budgets",
  "מלאי": "/raw-materials",
  "אישורים": "/purchase-approvals",
  "איכות": "/work-orders",
  "עובדים": "/hr/employees",
};

interface NotificationItem {
  id: number;
  type: string;
  title: string;
  message: string;
  userId: number | null;
  priority: string;
  category: string;
  actionUrl: string | null;
  metadata: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
  archivedAt: string | null;
}

interface DashboardStats {
  totalUnread: number;
  totalCritical: number;
  byType: Array<{ type: string; count: number }>;
  trends: Array<{ day: string; count: number }>;
  moduleHealth: Array<{ module: string; count: number; status: "green" | "yellow" | "red" }>;
}

export default function AlertTerminalPage() {
  const queryClient = useQueryClient();
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [, navigate] = useLocation();
  const [filters, setFilters] = useState({
    category: "all",
    priority: "all",
    isRead: "all",
    search: "",
    archived: "false",
    dateFrom: "",
    dateTo: "",
  });
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAlert, setNewAlert] = useState({ title: "", message: "", priority: "normal", category: "system", actionUrl: "", type: "manual_alert" });
  const pageSize = 20;

  const queryParams = new URLSearchParams();
  if (filters.category !== "all") queryParams.set("category", filters.category);
  if (filters.priority !== "all") queryParams.set("priority", filters.priority);
  if (filters.isRead !== "all") queryParams.set("isRead", filters.isRead);
  if (filters.search) queryParams.set("search", filters.search);
  if (filters.dateFrom) queryParams.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) queryParams.set("dateTo", filters.dateTo);
  queryParams.set("archived", filters.archived);
  queryParams.set("limit", String(pageSize));
  queryParams.set("offset", String(page * pageSize));

  const { data: dashStats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["alert-terminal-stats"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/notifications/dashboard-stats`);
      if (!r.ok) return {} as DashboardStats;
      return r.json();
    },
    refetchInterval: 30000,
  });

  const { data, isLoading } = useQuery<{ notifications: NotificationItem[]; total: number }>({
    queryKey: ["alert-terminal-feed", filters, page],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/notifications?${queryParams.toString()}`);
      if (!r.ok) return { notifications: [], total: 0 };
      return r.json();
    },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["alert-terminal-stats"] });
    queryClient.invalidateQueries({ queryKey: ["alert-terminal-feed"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    queryClient.invalidateQueries({ queryKey: ["notification-stats"] });
  };

  const markReadMutation = useMutation({
    mutationFn: async (id: number) => authFetch(`${API_BASE}/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: invalidateAll,
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: number) => authFetch(`${API_BASE}/notifications/${id}/archive`, { method: "PATCH" }),
    onSuccess: invalidateAll,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => authFetch(`${API_BASE}/notifications/${id}`, { method: "DELETE" }),
    onSuccess: invalidateAll,
  });

  const bulkActionMutation = useMutation({
    mutationFn: async ({ ids, action }: { ids: number[]; action: string }) =>
      authFetch(`${API_BASE}/notifications/bulk-action`, { method: "POST", body: JSON.stringify({ ids, action }) }),
    onSuccess: () => { invalidateAll(); setSelectedIds(new Set()); },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => authFetch(`${API_BASE}/notifications/mark-all-read`, { method: "PATCH", body: JSON.stringify({}) }),
    onSuccess: invalidateAll,
  });

  const triggerCheckMutation = useMutation({
    mutationFn: async () => authFetch(`${API_BASE}/notifications/trigger-check`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: invalidateAll,
  });

  const createAlertMutation = useMutation({
    mutationFn: async (alertData: typeof newAlert) =>
      authFetch(`${API_BASE}/notifications`, {
        method: "POST",
        body: JSON.stringify(alertData),
      }),
    onSuccess: () => {
      invalidateAll();
      setShowAddForm(false);
      setNewAlert({ title: "", message: "", priority: "normal", category: "system", actionUrl: "", type: "manual_alert" });
    },
  });

  const notifications = data?.notifications || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);
  const selectedArray = Array.from(selectedIds);

  function formatTime(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "עכשיו";
    if (minutes < 60) return `לפני ${minutes} דקות`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `לפני ${hours} שעות`;
    const days = Math.floor(hours / 24);
    return `לפני ${days} ימים`;
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === notifications.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(notifications.map(n => n.id)));
  }

  const trendData = (dashStats?.trends || []).map(t => ({
    day: new Date(t.day).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" }),
    count: t.count,
  }));

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center border border-red-500/20">
            <Activity className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold">טרמינל התראות</h1>
            <p className="text-sm text-muted-foreground">ניטור בזמן אמת של כל החריגות והאיחורים</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-sm text-blue-400 hover:text-blue-300 transition-colors border border-blue-500/30"
          >
            <Plus className="w-4 h-4" />
            הוסף התראה
          </button>
          <button
            onClick={() => triggerCheckMutation.mutate()}
            disabled={triggerCheckMutation.isPending}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/5 hover:bg-card/10 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${triggerCheckMutation.isPending ? "animate-spin" : ""}`} />
            סריקת מערכת
          </button>
          <Link href="/notification-routing" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/5 hover:bg-card/10 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <Settings className="w-4 h-4" />
            הגדרות ניתוב
          </Link>
        </div>
      </div>

      {showAddForm && (
        <div className="bg-card border border-blue-500/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm flex items-center gap-2"><Plus className="w-4 h-4 text-blue-400" /> הוספת התראה ידנית</h3>
            <button onClick={() => setShowAddForm(false)} className="p-1 rounded hover:bg-card/10"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">כותרת</label>
              <input value={newAlert.title} onChange={e => setNewAlert(a => ({ ...a, title: e.target.value }))}
                placeholder="כותרת ההתראה" className="w-full px-3 py-2 bg-card/5 border border-border/50 rounded-lg text-sm focus:outline-none focus:border-blue-500/50" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">עדיפות</label>
                <select value={newAlert.priority} onChange={e => setNewAlert(a => ({ ...a, priority: e.target.value }))}
                  className="w-full px-3 py-2 bg-card/5 border border-border/50 rounded-lg text-sm focus:outline-none">
                  <option value="low">נמוך</option>
                  <option value="normal">רגיל</option>
                  <option value="high">גבוה</option>
                  <option value="critical">קריטי</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">קטגוריה</label>
                <select value={newAlert.category} onChange={e => setNewAlert(a => ({ ...a, category: e.target.value }))}
                  className="w-full px-3 py-2 bg-card/5 border border-border/50 rounded-lg text-sm focus:outline-none">
                  <option value="anomaly">חריגה</option>
                  <option value="task">משימה</option>
                  <option value="approval">אישור</option>
                  <option value="system">מערכת</option>
                  <option value="workflow">Workflow</option>
                </select>
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">תיאור</label>
            <textarea value={newAlert.message} onChange={e => setNewAlert(a => ({ ...a, message: e.target.value }))}
              placeholder="תיאור מפורט של ההתראה..." rows={2}
              className="w-full px-3 py-2 bg-card/5 border border-border/50 rounded-lg text-sm focus:outline-none focus:border-blue-500/50 resize-none" />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">קישור (אופציונלי):</label>
              <input value={newAlert.actionUrl} onChange={e => setNewAlert(a => ({ ...a, actionUrl: e.target.value }))}
                placeholder="/work-orders" className="px-3 py-1.5 bg-card/5 border border-border/50 rounded-lg text-xs focus:outline-none w-40" />
            </div>
            <button
              onClick={() => { if (newAlert.title && newAlert.message) createAlertMutation.mutate(newAlert); }}
              disabled={!newAlert.title || !newAlert.message || createAlertMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-foreground text-sm font-semibold transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {createAlertMutation.isPending ? "שולח..." : "שלח התראה"}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">התראות פתוחות</span>
            <Bell className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-xl sm:text-3xl font-bold text-blue-400">{statsLoading ? "..." : dashStats?.totalUnread || 0}</div>
        </div>
        <div className="bg-card border border-red-500/20 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">קריטיות</span>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-xl sm:text-3xl font-bold text-red-400">{statsLoading ? "..." : dashStats?.totalCritical || 0}</div>
        </div>
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">מודולים בריאים</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl sm:text-3xl font-bold text-emerald-400">
            {statsLoading ? "..." : (dashStats?.moduleHealth || []).filter(m => m.status === "green").length}
          </div>
        </div>
        <div className="bg-card border border-orange-500/20 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">מודולים בבעיה</span>
            <AlertTriangle className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-xl sm:text-3xl font-bold text-orange-400">
            {statsLoading ? "..." : (dashStats?.moduleHealth || []).filter(m => m.status !== "green").length}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card border border-border/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">מגמת התראות — 30 יום אחרון</span>
          </div>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={trendData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="alertGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", fontSize: "12px" }}
                  labelStyle={{ color: "#94a3b8" }}
                  itemStyle={{ color: "#60a5fa" }}
                />
                <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} fill="url(#alertGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
              {statsLoading ? "טוען..." : "אין נתוני מגמה"}
            </div>
          )}
        </div>

        <div className="bg-card border border-border/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">בריאות מודולים</span>
          </div>
          <div className="space-y-2">
            {statsLoading ? (
              <div className="text-sm text-muted-foreground">טוען...</div>
            ) : (dashStats?.moduleHealth || []).map(({ module, count, status }) => {
              const Icon = MODULE_HEALTH_ICONS[module] || Activity;
              const route = MODULE_HEALTH_ROUTES[module] || "/";
              const statusColor = status === "green" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                : status === "yellow" ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
                : "text-red-400 bg-red-500/10 border-red-500/20";
              const dotColor = status === "green" ? "bg-emerald-500" : status === "yellow" ? "bg-yellow-500" : "bg-red-500";
              return (
                <button key={module} onClick={() => navigate(route)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all hover:scale-[1.02] cursor-pointer ${statusColor}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${dotColor} ${status !== "green" ? "animate-pulse" : ""}`} />
                    <Icon className="w-3.5 h-3.5" />
                    <span className="text-xs">{module}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold">{count > 0 ? `${count} פתוחות` : "תקין"}</span>
                    <ChevronLeft className="w-3 h-3 opacity-50" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {dashStats && dashStats.byType.length > 0 && (
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">התראות לפי סוג</span>
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={dashStats.byType.slice(0, 8)} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="type" tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", fontSize: "12px" }}
                labelStyle={{ color: "#94a3b8" }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {dashStats.byType.slice(0, 8).map((_, idx) => (
                  <Cell key={idx} fill={["#3b82f6", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6", "#f97316", "#06b6d4", "#ec4899"][idx % 8]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-card/[0.02]">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">פיד התראות</span>
            <span className="text-xs text-muted-foreground">{total} סה"כ</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="חיפוש..."
                value={filters.search}
                onChange={e => { setFilters(f => ({ ...f, search: e.target.value })); setPage(0); }}
                className="pl-2 pr-8 py-1.5 bg-card/5 border border-border/50 rounded-lg text-xs focus:outline-none w-40"
              />
            </div>
            <select
              value={filters.category}
              onChange={e => { setFilters(f => ({ ...f, category: e.target.value })); setPage(0); }}
              className="px-2 py-1.5 bg-card/5 border border-border/50 rounded-lg text-xs focus:outline-none"
            >
              <option value="all">כל הקטגוריות</option>
              {Object.entries(CATEGORY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select
              value={filters.priority}
              onChange={e => { setFilters(f => ({ ...f, priority: e.target.value })); setPage(0); }}
              className="px-2 py-1.5 bg-card/5 border border-border/50 rounded-lg text-xs focus:outline-none"
            >
              <option value="all">כל העדיפויות</option>
              <option value="critical">קריטי</option>
              <option value="high">גבוה</option>
              <option value="normal">רגיל</option>
              <option value="low">נמוך</option>
            </select>
            <select
              value={filters.isRead}
              onChange={e => { setFilters(f => ({ ...f, isRead: e.target.value })); setPage(0); }}
              className="px-2 py-1.5 bg-card/5 border border-border/50 rounded-lg text-xs focus:outline-none"
            >
              <option value="all">הכל</option>
              <option value="false">לא נקראו</option>
              <option value="true">נקראו</option>
            </select>
            <div className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <input type="date" value={filters.dateFrom} onChange={e => { setFilters(f => ({ ...f, dateFrom: e.target.value })); setPage(0); }}
                className="px-2 py-1 bg-card/5 border border-border/50 rounded-lg text-xs focus:outline-none w-28" />
              <input type="date" value={filters.dateTo} onChange={e => { setFilters(f => ({ ...f, dateTo: e.target.value })); setPage(0); }}
                className="px-2 py-1 bg-card/5 border border-border/50 rounded-lg text-xs focus:outline-none w-28" />
              {(filters.dateFrom || filters.dateTo) && (
                <button onClick={() => setFilters(f => ({ ...f, dateFrom: "", dateTo: "" }))} className="p-1 rounded hover:bg-card/5">
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 py-2 border-b border-border/20 bg-card/[0.01]">
          <input
            type="checkbox"
            checked={selectedIds.size === notifications.length && notifications.length > 0}
            onChange={toggleSelectAll}
            className="rounded border-border/50"
          />
          {selectedIds.size > 0 ? (
            <>
              <span className="text-xs text-muted-foreground">{selectedIds.size} נבחרו:</span>
              <button onClick={() => bulkActionMutation.mutate({ ids: selectedArray, action: "read" })}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20">
                <CheckCheck className="w-3 h-3" /> סמן כנקרא
              </button>
              <button onClick={() => bulkActionMutation.mutate({ ids: selectedArray, action: "archive" })}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20">
                <Archive className="w-3 h-3" /> ארכיון
              </button>
              <button onClick={async () => { if (window.globalConfirm(`למחוק ${selectedIds.size} התראות?`)) bulkActionMutation.mutate({ ids: selectedArray, action: "delete" }); }}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-red-500/10 text-red-400 hover:bg-red-500/20">
                <Trash2 className="w-3 h-3" /> מחק
              </button>
            </>
          ) : (
            <>
              <button onClick={() => markAllReadMutation.mutate()}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-card/5 text-muted-foreground hover:bg-card/10">
                <CheckCheck className="w-3 h-3" /> סמן הכל
              </button>
              <span className="text-xs text-muted-foreground">עמוד {page + 1}/{totalPages || 1} ({total} סה"כ)</span>
            </>
          )}
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-30 animate-pulse" />
            <p>טוען התראות...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Bell className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-lg font-medium mb-1">אין התראות</p>
            <p className="text-sm">הכל תקין!</p>
          </div>
        ) : (
          notifications.map(notification => {
            const catConfig = CATEGORY_CONFIG[notification.category] || CATEGORY_CONFIG.system;
            const prioConfig = PRIORITY_CONFIG[notification.priority] || PRIORITY_CONFIG.normal;
            const CatIcon = catConfig.icon;

            return (
              <div
                key={notification.id}
                className={`flex items-start gap-3 px-4 py-3 border-b border-border/20 hover:bg-card/[0.02] transition-colors ${!notification.isRead ? "bg-primary/[0.03]" : ""}`}
              >
                <input type="checkbox" checked={selectedIds.has(notification.id)} onChange={() => toggleSelect(notification.id)} className="mt-1 rounded border-border/50" />
                <div className={`mt-0.5 p-1.5 rounded-lg ${prioConfig.bg} border flex-shrink-0`}>
                  <CatIcon className={`w-4 h-4 ${catConfig.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className={`text-sm ${!notification.isRead ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                      {notification.title}
                    </p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${prioConfig.bg} ${prioConfig.color}`}>
                      {prioConfig.label}
                    </span>
                    {!notification.isRead && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{notification.message}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-muted-foreground/60">{formatTime(notification.createdAt)}</span>
                    <span className={`text-[10px] ${catConfig.color}`}>{catConfig.label}</span>
                    <span className="text-[10px] text-muted-foreground/40 font-mono">{notification.type}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {notification.actionUrl && (
                    <Link href={notification.actionUrl} className="p-1.5 rounded-lg hover:bg-card/5 text-muted-foreground hover:text-foreground transition-colors" title="עבור">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  )}
                  {!notification.isRead && (
                    <button onClick={() => markReadMutation.mutate(notification.id)} className="p-1.5 rounded-lg hover:bg-card/5 text-muted-foreground hover:text-foreground transition-colors" title="נקרא">
                      <CheckCheck className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button onClick={() => archiveMutation.mutate(notification.id)} className="p-1.5 rounded-lg hover:bg-card/5 text-muted-foreground hover:text-foreground transition-colors" title="ארכיון">
                    <Archive className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteMutation.mutate(notification.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors" title="מחק">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-2 rounded-lg hover:bg-card/5 disabled:opacity-30 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-sm text-muted-foreground">עמוד {page + 1} מתוך {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-2 rounded-lg hover:bg-card/5 disabled:opacity-30 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
