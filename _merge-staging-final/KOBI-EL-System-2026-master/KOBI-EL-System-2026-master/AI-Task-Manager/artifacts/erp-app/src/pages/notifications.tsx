import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell, Search, Archive, Trash2, CheckCheck, AlertTriangle, ClipboardList,
  ShieldCheck, Settings, GitBranch, ChevronLeft, ChevronRight, ExternalLink,
  X, Calendar, ThumbsUp, ThumbsDown, Eye, Package, Zap, CheckCircle2,
  Filter, Mail, MailOpen
} from "lucide-react";
import { Link } from "wouter";
import { authFetch } from "@/lib/utils";
import AISmartNotifications from "@/components/ai/ai-smart-notifications";
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

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: "קריטי", color: "text-red-400", bg: "bg-red-500/20 border-red-500/30" },
  high: { label: "גבוה", color: "text-orange-400", bg: "bg-orange-500/20 border-orange-500/30" },
  normal: { label: "רגיל", color: "text-blue-400", bg: "bg-blue-500/20 border-blue-500/30" },
  low: { label: "נמוך", color: "text-muted-foreground", bg: "bg-muted/20 border-slate-500/30" },
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
  moduleId: number | null;
  recordId: number | null;
  isRead: boolean;
  createdAt: string;
  archivedAt: string | null;
}

function getInlineActions(notification: NotificationItem): Array<{ label: string; action: string; icon: React.ComponentType<any>; color: string }> {
  const type = notification.type;
  const category = notification.category;

  if (category === "approval" || type.includes("approval") || type.includes("overdue_approval")) {
    return [
      { label: "אשר", action: "approve", icon: ThumbsUp, color: "bg-green-500/10 text-green-400 hover:bg-green-500/20" },
      { label: "דחה", action: "reject", icon: ThumbsDown, color: "bg-red-500/10 text-red-400 hover:bg-red-500/20" },
    ];
  }

  if (type.includes("anomaly") || category === "anomaly" || type.includes("overdue") || type.includes("low") || type.includes("open_ncr")) {
    return [
      { label: "אשר קבלה", action: "acknowledge", icon: CheckCircle2, color: "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20" },
    ];
  }

  return [];
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    category: "all",
    priority: "all",
    isRead: "all",
    search: "",
    archived: "false",
    dateFrom: "",
    dateTo: "",
  });
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [showDigestSettings, setShowDigestSettings] = useState(false);
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [actionLoading, setActionLoading] = useState<number | null>(null);
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

  const { data, isLoading } = useQuery<{ notifications: NotificationItem[]; total: number }>({
    queryKey: ["notifications-page", filters, page],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/notifications?${queryParams.toString()}`);
      if (!r.ok) throw new Error("Failed to fetch");
      return r.json();
    },
  });

  const { data: stats } = useQuery<{
    unread: number;
    critical: number;
    byCategory: Record<string, number>;
    byPriority: Record<string, number>;
  }>({
    queryKey: ["notification-stats"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/notifications/stats`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const { data: digestSettings } = useQuery({
    queryKey: ["digest-settings"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/platform/notification-digest/settings`);
      if (!r.ok) return null;
      return r.json();
    },
    enabled: showDigestSettings,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["notifications-page"] });
    queryClient.invalidateQueries({ queryKey: ["notification-stats"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
  };

  const markReadMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API_BASE}/notifications/${id}/read`, { method: "PATCH" });
    },
    onSuccess: invalidateAll,
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API_BASE}/notifications/${id}/archive`, { method: "PATCH" });
    },
    onSuccess: invalidateAll,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API_BASE}/notifications/${id}`, { method: "DELETE" });
    },
    onSuccess: invalidateAll,
  });

  const bulkActionMutation = useMutation({
    mutationFn: async ({ ids, action }: { ids: number[]; action: string }) => {
      await authFetch(`${API_BASE}/notifications/bulk-action`, {
        method: "POST",
        body: JSON.stringify({ ids, action }),
      });
    },
    onSuccess: () => {
      invalidateAll();
      setSelectedIds(new Set());
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await authFetch(`${API_BASE}/notifications/mark-all-read`, { method: "PATCH", body: JSON.stringify({}) });
    },
    onSuccess: invalidateAll,
  });

  const archiveAllMutation = useMutation({
    mutationFn: async () => {
      await authFetch(`${API_BASE}/notifications/archive-all`, { method: "PATCH", body: JSON.stringify({}) });
    },
    onSuccess: invalidateAll,
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      await authFetch(`${API_BASE}/notifications/delete-all`, { method: "DELETE", body: JSON.stringify({}) });
    },
    onSuccess: () => {
      invalidateAll();
      setSelectedIds(new Set());
    },
  });

  const handleInlineAction = async (notificationId: number, action: string) => {
    setActionLoading(notificationId);
    try {
      const r = await authFetch(`${API_BASE}/platform/notification-action/${notificationId}`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      const result = await r.json();
      if (result.success) {
        invalidateAll();
      }
    } catch {}
    setActionLoading(null);
  };

  const notifications = data?.notifications || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  function formatTime(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleDateString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === notifications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(notifications.map((n) => n.id)));
    }
  }

  const selectedArray = Array.from(selectedIds);

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <Bell className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold">מרכז התראות</h1>
            <p className="text-sm text-muted-foreground">
              {stats ? `${stats.unread} לא נקראו · ${stats.critical} קריטיות` : "טוען..."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AISmartNotifications notifications={notifications} />
          <button
            onClick={() => setShowDigestSettings(!showDigestSettings)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/5 hover:bg-card/10 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Mail className="w-4 h-4" />
            <span className="hidden sm:inline">תקציר יומי</span>
          </button>
          <Link href="/notification-preferences" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/5 hover:bg-card/10 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">הגדרות</span>
          </Link>
        </div>
      </div>

      {showDigestSettings && (
        <DigestSettingsPanel onClose={() => setShowDigestSettings(false)} />
      )}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => {
            const count = stats.byCategory[key] || 0;
            const Icon = cfg.icon;
            return (
              <button
                key={key}
                onClick={() => setFilters((f) => ({ ...f, category: f.category === key ? "all" : key }))}
                className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${
                  filters.category === key
                    ? "bg-primary/10 border-primary/30"
                    : "bg-card border-border/50 hover:bg-card/5"
                }`}
              >
                <Icon className={`w-4 h-4 ${cfg.color}`} />
                <span className="text-sm">{cfg.label}</span>
                <span className={`mr-auto text-xs font-bold ${count > 0 ? cfg.color : "text-muted-foreground"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="חיפוש בהתראות..."
            value={filters.search}
            onChange={(e) => {
              setFilters((f) => ({ ...f, search: e.target.value }));
              setPage(0);
            }}
            className="w-full pl-3 pr-10 py-2 bg-card border border-border/50 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {filters.search && (
            <button onClick={() => setFilters((f) => ({ ...f, search: "" }))} className="absolute left-3 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        <select
          value={filters.priority}
          onChange={(e) => { setFilters((f) => ({ ...f, priority: e.target.value })); setPage(0); }}
          className="px-3 py-2 bg-card border border-border/50 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="all">כל העדיפויות</option>
          <option value="critical">קריטי</option>
          <option value="high">גבוה</option>
          <option value="normal">רגיל</option>
          <option value="low">נמוך</option>
        </select>

        <select
          value={filters.isRead}
          onChange={(e) => { setFilters((f) => ({ ...f, isRead: e.target.value })); setPage(0); }}
          className="px-3 py-2 bg-card border border-border/50 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="all">הכל</option>
          <option value="false">לא נקראו</option>
          <option value="true">נקראו</option>
        </select>

        <select
          value={filters.archived}
          onChange={(e) => { setFilters((f) => ({ ...f, archived: e.target.value })); setPage(0); }}
          className="px-3 py-2 bg-card border border-border/50 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="false">פעילות</option>
          <option value="true">ארכיון</option>
          <option value="all">הכל</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">מתאריך:</span>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => { setFilters((f) => ({ ...f, dateFrom: e.target.value })); setPage(0); }}
            className="px-2 py-1.5 bg-card border border-border/50 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="text-xs text-muted-foreground">עד:</span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => { setFilters((f) => ({ ...f, dateTo: e.target.value })); setPage(0); }}
            className="px-2 py-1.5 bg-card border border-border/50 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {(filters.dateFrom || filters.dateTo) && (
            <button
              onClick={() => setFilters((f) => ({ ...f, dateFrom: "", dateTo: "" }))}
              className="p-1 rounded hover:bg-card/5"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {selectedIds.size > 0 ? (
          <>
            <span className="text-xs text-muted-foreground ml-2">
              {selectedIds.size} נבחרו:
            </span>
            <button
              onClick={() => bulkActionMutation.mutate({ ids: selectedArray, action: "read" })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              סמן כנקרא
            </button>
            <button
              onClick={() => bulkActionMutation.mutate({ ids: selectedArray, action: "archive" })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 transition-colors"
            >
              <Archive className="w-3.5 h-3.5" />
              העבר לארכיון
            </button>
            {isSuperAdmin && <button
              onClick={async () => { const ok = await globalConfirm(`למחוק ${selectedIds.size} התראות?`); if (ok) bulkActionMutation.mutate({ ids: selectedArray, action: "delete" }); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              מחק נבחרים
            </button>}
          </>
        ) : (
          <>
            <button onClick={() => markAllReadMutation.mutate()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-card/5 hover:bg-card/10 text-muted-foreground hover:text-foreground transition-colors">
              <CheckCheck className="w-3.5 h-3.5" />
              סמן הכל כנקרא
            </button>
            <button onClick={() => archiveAllMutation.mutate()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-card/5 hover:bg-card/10 text-muted-foreground hover:text-foreground transition-colors">
              <Archive className="w-3.5 h-3.5" />
              העבר הכל לארכיון
            </button>
            {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק את כל ההתראות?"); if (ok) deleteAllMutation.mutate(); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
              מחק הכל
            </button>}
          </>
        )}
      </div>

      <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border/20">
                <div className="w-8 h-8 rounded-lg bg-muted/20 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 rounded bg-muted/20" />
                  <div className="h-3 w-2/3 rounded bg-muted/15" />
                  <div className="h-2 w-1/4 rounded bg-muted/10" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Bell className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-lg font-medium mb-1">אין התראות</p>
            <p className="text-sm">
              {filters.category !== "all" || filters.priority !== "all" || filters.search || filters.dateFrom || filters.dateTo
                ? "נסה לשנות את הסינון"
                : "הכל בסדר!"}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center px-4 py-2 border-b border-border/30 bg-card/[0.02]">
              <input
                type="checkbox"
                checked={selectedIds.size === notifications.length && notifications.length > 0}
                onChange={toggleSelectAll}
                className="rounded border-border/50 ml-3"
              />
              <span className="text-xs text-muted-foreground">
                {total} התראות (עמוד {page + 1} מתוך {totalPages})
              </span>
            </div>

            {notifications.map((notification) => {
              const catConfig = CATEGORY_CONFIG[notification.category] || CATEGORY_CONFIG.system;
              const prioConfig = PRIORITY_CONFIG[notification.priority] || PRIORITY_CONFIG.normal;
              const CatIcon = catConfig.icon;
              const inlineActions = getInlineActions(notification);
              const isActionPending = actionLoading === notification.id;

              return (
                <div
                  key={notification.id}
                  className={`flex items-start gap-3 px-4 py-3 border-b border-border/20 hover:bg-card/[0.02] transition-colors ${
                    !notification.isRead ? "bg-primary/[0.03]" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(notification.id)}
                    onChange={() => toggleSelect(notification.id)}
                    className="mt-1 rounded border-border/50"
                  />

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
                      {!notification.isRead && (
                        <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{notification.message}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[10px] text-muted-foreground/60">
                        {formatTime(notification.createdAt)}
                      </span>
                      <span className={`text-[10px] ${catConfig.color}`}>
                        {catConfig.label}
                      </span>
                    </div>

                    {inlineActions.length > 0 && (
                      <div className="flex items-center gap-2 mt-2">
                        {inlineActions.map((act) => {
                          const ActionIcon = act.icon;
                          return (
                            <button
                              key={act.action}
                              onClick={() => handleInlineAction(notification.id, act.action)}
                              disabled={isActionPending}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${act.color}`}
                            >
                              <ActionIcon className="w-3 h-3" />
                              {act.label}
                            </button>
                          );
                        })}
                        {notification.actionUrl && (
                          <Link href={notification.actionUrl} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-card/10 text-muted-foreground hover:text-foreground transition-colors">
                            <ExternalLink className="w-3 h-3" />
                            {notification.category === "approval" ? "פרטים" : notification.type.includes("order") ? "צפה בהזמנה" : "עבור"}
                          </Link>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {notification.actionUrl && inlineActions.length === 0 && (
                      <Link href={notification.actionUrl} className="p-1.5 rounded-lg hover:bg-card/5 text-muted-foreground hover:text-foreground transition-colors" title="עבור לרשומה">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    )}
                    {!notification.isRead && (
                      <button onClick={() => markReadMutation.mutate(notification.id)} className="p-1.5 rounded-lg hover:bg-card/5 text-muted-foreground hover:text-foreground transition-colors" title="סמן כנקרא">
                        <MailOpen className="w-3.5 h-3.5" />
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
            })}
          </>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="p-2 rounded-lg hover:bg-card/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-sm text-muted-foreground">
            עמוד {page + 1} מתוך {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="p-2 rounded-lg hover:bg-card/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function DigestSettingsPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["digest-settings"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/platform/notification-digest/settings`);
      if (!r.ok) return null;
      return r.json();
    },
  });

  const { data: preview } = useQuery({
    queryKey: ["digest-preview"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/platform/notification-digest/preview`);
      if (!r.ok) return null;
      return r.json();
    },
  });

  const [form, setForm] = useState({
    enabled: false,
    frequency: "daily",
    scheduleTime: "08:00",
    minPriority: "normal",
  });

  if (settings && !saving) {
    if (form.enabled !== settings.enabled || form.frequency !== settings.frequency) {
      setForm({
        enabled: settings.enabled ?? false,
        frequency: settings.frequency || "daily",
        scheduleTime: settings.scheduleTime || "08:00",
        minPriority: settings.minPriority || "normal",
      });
    }
  }

  const save = async () => {
    setSaving(true);
    try {
      await authFetch(`${API_BASE}/platform/notification-digest/settings`, {
        method: "PUT",
        body: JSON.stringify(form),
      });
      queryClient.invalidateQueries({ queryKey: ["digest-settings"] });
    } catch {}
    setSaving(false);
  };

  return (
    <div className="bg-card border border-border/50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-blue-400" />
          <h3 className="font-semibold">הגדרות תקציר התראות</h3>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg">
          <X className="w-4 h-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="py-4 text-center text-muted-foreground text-sm">טוען...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium">הפעל תקציר יומי</label>
              <button
                onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${form.enabled ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground"}`}
              >
                {form.enabled ? "מופעל" : "כבוי"}
              </button>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">תדירות</label>
              <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm">
                <option value="daily">יומי</option>
                <option value="weekly">שבועי</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">שעת שליחה</label>
              <input type="time" value={form.scheduleTime} onChange={e => setForm(f => ({ ...f, scheduleTime: e.target.value }))} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">עדיפות מינימלית</label>
              <select value={form.minPriority} onChange={e => setForm(f => ({ ...f, minPriority: e.target.value }))} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm">
                <option value="low">נמוך ומעלה</option>
                <option value="normal">רגיל ומעלה</option>
                <option value="high">גבוה ומעלה</option>
                <option value="critical">קריטי בלבד</option>
              </select>
            </div>
            <button onClick={save} disabled={saving} className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium disabled:opacity-50">
              {saving ? "שומר..." : "שמור הגדרות"}
            </button>
          </div>

          {preview && (
            <div className="bg-muted/20 rounded-xl p-4">
              <h4 className="text-xs font-medium text-muted-foreground mb-3">תצוגה מקדימה (24 שעות אחרונות)</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">סה״כ לא נקראו</span>
                  <span className="font-semibold">{preview.total}</span>
                </div>
                {Object.entries(preview.byPriority || {}).map(([p, count]) => (
                  <div key={p} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{PRIORITY_CONFIG[p]?.label || p}</span>
                    <span className={PRIORITY_CONFIG[p]?.color || ""}>{String(count)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
