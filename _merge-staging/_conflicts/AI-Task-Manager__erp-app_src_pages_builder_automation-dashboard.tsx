import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { usePlatformModules } from "@/hooks/usePlatformModules";
import {
  Activity, CheckCircle, XCircle, AlertTriangle, Clock, RefreshCw,
  Search, Filter, ChevronDown, ChevronUp, Eye, Zap, ArrowRight,
  BarChart3, TrendingUp, Package, ShoppingCart, Users, FileText,
  ArrowLeftRight, Layers, Play, X, ChevronLeft, Loader2, Bell,
  Calendar, Truck, UserPlus, UserMinus, Target, Phone, ClipboardCheck,
  CreditCard, FileCheck, Receipt
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

const API = "/api";

interface ExecutionLog {
  id: number;
  automationId: number | null;
  workflowId: number | null;
  executionType: string;
  entityId: number | null;
  triggerEvent: string;
  triggerRecordId: number | null;
  status: string;
  stepsExecuted: any[];
  result: any;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface SyncHandler {
  name: string;
  description: string;
  active: boolean;
}

interface SyncStatus {
  totalSyncs: number;
  recentSyncs: number;
  successRate: number;
  handlers: SyncHandler[];
}

interface SyncHistoryItem {
  handler: string;
  success: boolean;
  details?: Record<string, any>;
  error?: string;
  timestamp: string;
}

interface ExecutionStats {
  total: number;
  last24h: number;
  last7d: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  successRate: number;
}

interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  categoryLabel: string;
  icon: string;
  triggerType: string;
  triggerEntitySlug: string;
  tags: string[];
}

interface TemplateCategory {
  label: string;
  templates: AutomationTemplate[];
}

interface PlatformModule {
  id: number;
  name: string;
  slug: string;
}

const ICON_MAP: Record<string, any> = {
  ShoppingCart, Receipt, CreditCard, Package, Truck, FileCheck,
  UserPlus, UserMinus, Calendar, Target, Phone, ClipboardCheck,
};

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  completed: { bg: "bg-green-500/10", text: "text-green-400", label: "הושלם" },
  running: { bg: "bg-blue-500/10", text: "text-blue-400", label: "רץ" },
  failed: { bg: "bg-red-500/10", text: "text-red-400", label: "נכשל" },
  paused: { bg: "bg-yellow-500/10", text: "text-yellow-400", label: "מושהה" },
  rejected: { bg: "bg-orange-500/10", text: "text-orange-400", label: "נדחה" },
};

const TYPE_LABELS: Record<string, string> = {
  automation: "אוטומציה",
  workflow: "תהליך",
  scheduled: "מתוזמן",
  on_schedule: "מתוזמן",
};

export default function AutomationDashboard() {
  const [activeTab, setActiveTab] = useState<"overview" | "logs" | "sync" | "templates">("overview");

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold">מרכז אוטומציות</h1>
          <p className="text-muted-foreground mt-1">מעקב, היסטוריה, תבניות וסנכרון בין מודולים</p>
        </div>
      </div>

      <div className="flex bg-muted rounded-xl p-0.5 w-fit">
        {[
          { key: "overview" as const, label: "סקירה כללית", icon: BarChart3 },
          { key: "logs" as const, label: "היסטוריית הרצות", icon: Activity },
          { key: "sync" as const, label: "סנכרון מודולים", icon: ArrowLeftRight },
          { key: "templates" as const, label: "תבניות", icon: Layers },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === key ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && <OverviewTab />}
      {activeTab === "logs" && <LogsTab />}
      {activeTab === "sync" && <SyncTab />}
      {activeTab === "templates" && <TemplatesTab />}
    </div>
  );
}

function OverviewTab() {
  const queryClient = useQueryClient();
  const [confirmAutomation, setConfirmAutomation] = useState<AutomationSummary | null>(null);

  const runNowMutation = useMutation({
    mutationFn: async (automationId: number) => {
      const r = await authFetch(`${API}/platform/automations/${automationId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!r.ok) throw new Error("שגיאה בהרצה");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["execution-logs"] });
      queryClient.invalidateQueries({ queryKey: ["recent-execution-logs"] });
      queryClient.invalidateQueries({ queryKey: ["execution-stats"] });
    },
  });

  const { data: stats } = useQuery<ExecutionStats>({
    queryKey: ["execution-stats"],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/execution-stats`);
      if (!r.ok) return { total: 0, last24h: 0, last7d: 0, byStatus: {}, byType: {}, successRate: 100 };
      return r.json();
    },
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const { data: syncStatus } = useQuery<SyncStatus>({
    queryKey: ["sync-status"],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/sync-status`);
      if (!r.ok) return { totalSyncs: 0, recentSyncs: 0, successRate: 100, handlers: [] };
      return r.json();
    },
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const { data: recentLogs = [] } = useQuery<ExecutionLog[]>({
    queryKey: ["recent-execution-logs"],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/execution-logs?limit=10`);
      if (!r.ok) return [];
      const data = await r.json();
      return data.logs || [];
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });

  interface AutomationSummary {
    id: number;
    name: string;
    triggerType: string;
    runCount: number;
    lastRunAt: string | null;
    isActive: boolean;
    actions?: Array<{ type: string }>;
  }

  const { data: activeAutomations = [] } = useQuery<AutomationSummary[]>({
    queryKey: ["active-automations-overview"],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/automations`);
      if (!r.ok) return [];
      const list: AutomationSummary[] = await r.json();
      return list.filter((a) => a.isActive);
    },
    staleTime: 60000,
  });

  const statCards = [
    {
      label: "סה״כ הרצות",
      value: stats?.total || 0,
      icon: Activity,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "24 שעות אחרונות",
      value: stats?.last24h || 0,
      icon: Clock,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
    },
    {
      label: "7 ימים אחרונים",
      value: stats?.last7d || 0,
      icon: TrendingUp,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
    },
    {
      label: "אחוז הצלחה",
      value: `${(stats?.successRate || 100).toFixed(0)}%`,
      icon: CheckCircle,
      color: "text-green-400",
      bg: "bg-green-500/10",
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-card border border-border rounded-2xl p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${card.color}`} />
                </div>
              </div>
              <div className="text-lg sm:text-2xl font-bold">{card.value}</div>
              <div className="text-sm text-muted-foreground mt-1">{card.label}</div>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            לפי סטטוס
          </h3>
          <div className="space-y-3">
            {Object.entries(stats?.byStatus || {}).map(([status, count]) => {
              const statusInfo = STATUS_COLORS[status] || { bg: "bg-muted", text: "text-muted-foreground", label: status };
              const total = stats?.total || 1;
              const pct = ((count as number) / total) * 100;
              return (
                <div key={status} className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded-lg ${statusInfo.bg} ${statusInfo.text} min-w-[60px] text-center`}>
                    {statusInfo.label}
                  </span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${status === "completed" ? "bg-green-500" : status === "failed" ? "bg-red-500" : status === "running" ? "bg-blue-500" : "bg-yellow-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium min-w-[40px] text-left">{count as number}</span>
                </div>
              );
            })}
            {Object.keys(stats?.byStatus || {}).length === 0 && (
              <p className="text-muted-foreground text-sm text-center py-4">אין נתונים עדיין</p>
            )}
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-primary" />
            סנכרון מודולים
          </h3>
          <div className="space-y-2.5">
            {(syncStatus?.handlers || []).map((handler) => (
              <div key={handler.name} className="flex items-center justify-between p-2.5 bg-muted/50 rounded-xl">
                <div className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full ${handler.active ? "bg-green-400 animate-pulse" : "bg-muted-foreground"}`} />
                  <span className="text-sm">{handler.description}</span>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${handler.active ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground"}`}>
                  {handler.active ? "פעיל" : "כבוי"}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border">
            <div className="text-center flex-1">
              <div className="text-lg font-bold">{syncStatus?.recentSyncs || 0}</div>
              <div className="text-xs text-muted-foreground">סנכרונים (24ש)</div>
            </div>
            <div className="text-center flex-1">
              <div className="text-lg font-bold">{(syncStatus?.successRate || 100).toFixed(0)}%</div>
              <div className="text-xs text-muted-foreground">אחוז הצלחה</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          הרצות אחרונות
        </h3>
        <div className="space-y-2">
          {recentLogs.map((log) => {
            const statusInfo = STATUS_COLORS[log.status] || STATUS_COLORS.completed;
            return (
              <div key={log.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg ${statusInfo.bg} flex items-center justify-center`}>
                    {log.status === "completed" ? <CheckCircle className={`w-4 h-4 ${statusInfo.text}`} /> :
                     log.status === "failed" ? <XCircle className={`w-4 h-4 ${statusInfo.text}`} /> :
                     log.status === "running" ? <Loader2 className={`w-4 h-4 ${statusInfo.text} animate-spin`} /> :
                     <AlertTriangle className={`w-4 h-4 ${statusInfo.text}`} />}
                  </div>
                  <div>
                    <div className="text-sm font-medium">
                      {(log.result as any)?.workflowName || (log.result as any)?.automationName || `הרצה #${log.id}`}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>{TYPE_LABELS[log.executionType] || log.executionType}</span>
                      <span>·</span>
                      <span>{log.triggerEvent}</span>
                      {log.triggerRecordId && (
                        <>
                          <span>·</span>
                          <span>רשומה #{log.triggerRecordId}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded-lg ${statusInfo.bg} ${statusInfo.text}`}>
                    {statusInfo.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(log.startedAt).toLocaleString("he-IL", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                  </span>
                </div>
              </div>
            );
          })}
          {recentLogs.length === 0 && (
            <p className="text-muted-foreground text-sm text-center py-8">אין הרצות אחרונות</p>
          )}
        </div>
      </div>

      {activeAutomations.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Play className="w-5 h-5 text-green-400" />
            אוטומציות פעילות — הרצה ידנית
          </h3>
          <div className="space-y-2">
            {activeAutomations.slice(0, 8).map((automation) => (
              <div key={automation.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-green-400" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{automation.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {automation.triggerType} · הורץ {automation.runCount ?? 0} פעמים
                      {automation.lastRunAt && ` · ${new Date(automation.lastRunAt).toLocaleString("he-IL", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}`}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setConfirmAutomation(automation)}
                  disabled={runNowMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-foreground rounded-lg text-xs font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  <Play className="w-3 h-3" />
                  הרץ עכשיו
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <AlertDialog open={!!confirmAutomation} onOpenChange={(v) => { if (!v) setConfirmAutomation(null); }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                <Play className="text-green-400" size={24} />
              </div>
              <div className="flex-1 pt-1">
                <AlertDialogTitle className="text-lg font-bold">הרצת אוטומציה</AlertDialogTitle>
                <AlertDialogDescription className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {confirmAutomation && (
                    <>
                      <span className="block font-medium text-foreground mb-1">{confirmAutomation.name}</span>
                      {confirmAutomation.actions && confirmAutomation.actions.length > 0 ? (
                        <span>
                          האוטומציה תבצע {confirmAutomation.actions.length} פעולות: {confirmAutomation.actions.map((a) => a.type).join(", ")}.
                          <br />
                        </span>
                      ) : null}
                      האם להריץ את האוטומציה כעת?
                    </>
                  )}
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2 sm:flex-row-reverse mt-2">
            <AlertDialogAction
              onClick={() => {
                if (confirmAutomation) {
                  runNowMutation.mutate(confirmAutomation.id);
                  setConfirmAutomation(null);
                }
              }}
              disabled={runNowMutation.isPending}
              className="px-5 py-2.5 rounded-lg font-medium text-sm bg-green-600 text-foreground hover:bg-green-700 transition-all disabled:opacity-50"
            >
              הרץ עכשיו
            </AlertDialogAction>
            <AlertDialogCancel
              onClick={() => setConfirmAutomation(null)}
              className="px-5 py-2.5 rounded-lg font-medium text-sm bg-card border border-border text-foreground hover:bg-muted/30"
            >
              ביטול
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LogsTab() {
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(0);
  const [expandedLog, setExpandedLog] = useState<number | null>(null);
  const limit = 20;

  const { data, isLoading, refetch } = useQuery<{ logs: ExecutionLog[]; total: number }>({
    queryKey: ["execution-logs", statusFilter, typeFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(page * limit));
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("type", typeFilter);
      const r = await authFetch(`${API}/platform/execution-logs?${params}`);
      if (!r.ok) return { logs: [], total: 0 };
      return r.json();
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const logs = data?.logs || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">כל הסטטוסים</option>
            <option value="completed">הושלם</option>
            <option value="failed">נכשל</option>
            <option value="running">רץ</option>
            <option value="paused">מושהה</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">כל הסוגים</option>
            <option value="automation">אוטומציה</option>
            <option value="workflow">תהליך</option>
            <option value="scheduled">מתוזמן</option>
          </select>
        </div>

        <button onClick={() => refetch()} className="flex items-center gap-1.5 px-3 py-2 bg-muted rounded-xl text-sm hover:bg-muted/80 transition-colors mr-auto">
          <RefreshCw className="w-4 h-4" />
          רענן
        </button>

        <span className="text-sm text-muted-foreground">
          {total} תוצאות
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
          <Activity className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">אין הרצות</h3>
          <p className="text-muted-foreground">אוטומציות ותהליכים שירוצו יופיעו כאן</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const statusInfo = STATUS_COLORS[log.status] || STATUS_COLORS.completed;
            const isExpanded = expandedLog === log.id;
            const steps = Array.isArray(log.stepsExecuted) ? log.stepsExecuted : [];
            const duration = log.completedAt
              ? Math.round((new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime()) / 1000)
              : null;

            return (
              <div key={log.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                <button
                  onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-right"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl ${statusInfo.bg} flex items-center justify-center`}>
                      {log.status === "completed" ? <CheckCircle className={`w-4.5 h-4.5 ${statusInfo.text}`} /> :
                       log.status === "failed" ? <XCircle className={`w-4.5 h-4.5 ${statusInfo.text}`} /> :
                       log.status === "running" ? <Loader2 className={`w-4.5 h-4.5 ${statusInfo.text} animate-spin`} /> :
                       <AlertTriangle className={`w-4.5 h-4.5 ${statusInfo.text}`} />}
                    </div>
                    <div>
                      <div className="font-medium text-sm">
                        {(log.result as any)?.workflowName || (log.result as any)?.automationName || `הרצה #${log.id}`}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                        <span className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-medium">
                          {TYPE_LABELS[log.executionType] || log.executionType}
                        </span>
                        <span>{log.triggerEvent}</span>
                        {log.triggerRecordId && <span>רשומה #{log.triggerRecordId}</span>}
                        {duration !== null && <span>{duration}ש</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${statusInfo.bg} ${statusInfo.text}`}>
                      {statusInfo.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.startedAt).toLocaleString("he-IL")}
                    </span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-border"
                    >
                      <div className="p-4 space-y-3">
                        {log.errorMessage && (
                          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400">
                            <span className="font-medium">שגיאה: </span>{log.errorMessage}
                          </div>
                        )}

                        {steps.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2">שלבים שבוצעו ({steps.length})</h4>
                            <div className="space-y-1.5">
                              {steps.map((step: any, idx: number) => (
                                <div key={idx} className="flex items-center gap-2.5 p-2 bg-muted/30 rounded-lg text-sm">
                                  <span className="text-xs text-muted-foreground font-mono w-5">{idx + 1}</span>
                                  {step.success ? (
                                    <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                                  ) : (
                                    <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                  )}
                                  <span className="font-medium">{step.action}</span>
                                  {step.branchPath && (
                                    <span className="text-xs text-purple-400 px-1.5 py-0.5 bg-purple-500/10 rounded">
                                      ← {step.branchPath}
                                    </span>
                                  )}
                                  {step.error && (
                                    <span className="text-xs text-red-400 truncate max-w-xs">{step.error}</span>
                                  )}
                                  {step.details && (
                                    <span className="text-xs text-muted-foreground truncate max-w-xs">
                                      {JSON.stringify(step.details).slice(0, 100)}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
                          <span>התחלה: {new Date(log.startedAt).toLocaleString("he-IL")}</span>
                          {log.completedAt && <span>סיום: {new Date(log.completedAt).toLocaleString("he-IL")}</span>}
                          {log.entityId && <span>ישות: #{log.entityId}</span>}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 bg-muted rounded-lg text-sm disabled:opacity-50 hover:bg-muted/80"
          >
            הקודם
          </button>
          <span className="text-sm text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 bg-muted rounded-lg text-sm disabled:opacity-50 hover:bg-muted/80"
          >
            הבא
          </button>
        </div>
      )}
    </div>
  );
}

function SyncTab() {
  const { data: syncStatus } = useQuery<SyncStatus>({
    queryKey: ["sync-status-detail"],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/sync-status`);
      if (!r.ok) return { totalSyncs: 0, recentSyncs: 0, successRate: 100, handlers: [] };
      return r.json();
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const { data: syncHistory = [] } = useQuery<SyncHistoryItem[]>({
    queryKey: ["sync-history"],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/sync-history`);
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const HANDLER_ICONS: Record<string, any> = {
    procurement_to_inventory: Package,
    lead_to_customer: Target,
    employee_status_change: Users,
    supplier_invoice_to_ap: FileText,
    sales_order_to_invoice: ShoppingCart,
    inventory_low_stock: AlertTriangle,
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-2xl p-5 text-center">
          <div className="text-xl sm:text-3xl font-bold text-primary">{syncStatus?.totalSyncs || 0}</div>
          <div className="text-sm text-muted-foreground mt-1">סה״כ סנכרונים</div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5 text-center">
          <div className="text-xl sm:text-3xl font-bold text-blue-400">{syncStatus?.recentSyncs || 0}</div>
          <div className="text-sm text-muted-foreground mt-1">24 שעות אחרונות</div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5 text-center">
          <div className={`text-xl sm:text-3xl font-bold ${(syncStatus?.successRate || 100) >= 90 ? "text-green-400" : "text-yellow-400"}`}>
            {(syncStatus?.successRate || 100).toFixed(0)}%
          </div>
          <div className="text-sm text-muted-foreground mt-1">אחוז הצלחה</div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          מנגנוני סנכרון פעילים
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(syncStatus?.handlers || []).map((handler) => {
            const Icon = HANDLER_ICONS[handler.name] || ArrowLeftRight;
            return (
              <div key={handler.name} className="flex items-center gap-3 p-4 bg-muted/30 rounded-xl border border-border/50">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${handler.active ? "bg-green-500/10" : "bg-muted"}`}>
                  <Icon className={`w-5 h-5 ${handler.active ? "text-green-400" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{handler.description}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{handler.name.replace(/_/g, " ")}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${handler.active ? "bg-green-400 animate-pulse" : "bg-muted-foreground"}`} />
                  <span className={`text-xs font-medium ${handler.active ? "text-green-400" : "text-muted-foreground"}`}>
                    {handler.active ? "פעיל" : "כבוי"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          היסטוריית סנכרונים
        </h3>
        {syncHistory.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            אין סנכרונים עדיין. סנכרונים יופיעו כאשר נתונים יזרמו בין מודולים.
          </p>
        ) : (
          <div className="space-y-2">
            {syncHistory.slice(0, 50).map((item, idx) => {
              const Icon = HANDLER_ICONS[item.handler] || ArrowLeftRight;
              return (
                <div key={idx} className="flex items-center gap-3 p-3 bg-muted/20 rounded-xl">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.success ? "bg-green-500/10" : "bg-red-500/10"}`}>
                    {item.success ? (
                      <Icon className="w-4 h-4 text-green-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{item.handler.replace(/_/g, " ")}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {item.details ? JSON.stringify(item.details).slice(0, 80) : item.error || ""}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(item.timestamp).toLocaleString("he-IL", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TemplatesTab() {
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [applyingTemplate, setApplyingTemplate] = useState<AutomationTemplate | null>(null);

  const { data: templateData } = useQuery<{ templates: AutomationTemplate[]; categories: Record<string, TemplateCategory> }>({
    queryKey: ["automation-templates"],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/automation-templates`);
      if (!r.ok) return { templates: [], categories: {} };
      return r.json();
    },
  });

  const { modules } = usePlatformModules();

  const categories = templateData?.categories || {};
  const templates = templateData?.templates || [];
  const filtered = selectedCategory ? templates.filter((t) => t.category === selectedCategory) : templates;

  const CATEGORY_ICONS: Record<string, any> = {
    "order-to-cash": ShoppingCart,
    "procure-to-pay": Package,
    "hire-to-retire": Users,
    crm: Target,
    production: ClipboardCheck,
  };

  const CATEGORY_COLORS: Record<string, string> = {
    "order-to-cash": "bg-blue-500/10 text-blue-400 border-blue-500/30",
    "procure-to-pay": "bg-purple-500/10 text-purple-400 border-purple-500/30",
    "hire-to-retire": "bg-green-500/10 text-green-400 border-green-500/30",
    crm: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    production: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
            !selectedCategory ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:border-primary/30"
          }`}
        >
          הכל ({templates.length})
        </button>
        {Object.entries(categories).map(([key, cat]) => {
          const Icon = CATEGORY_ICONS[key] || Layers;
          return (
            <button
              key={key}
              onClick={() => setSelectedCategory(selectedCategory === key ? null : key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                selectedCategory === key
                  ? CATEGORY_COLORS[key] || "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border hover:border-primary/30"
              }`}
            >
              <Icon className="w-4 h-4" />
              {cat.label} ({cat.templates.length})
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((template, i) => {
          const Icon = ICON_MAP[template.icon] || Zap;
          const catColor = CATEGORY_COLORS[template.category] || "bg-muted text-muted-foreground border-border";
          return (
            <motion.div
              key={template.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="bg-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-all flex flex-col"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${catColor.split(" ").slice(0, 1).join(" ")}`}>
                  <Icon className={`w-5 h-5 ${catColor.split(" ").slice(1, 2).join(" ")}`} />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{template.name}</h3>
                  <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mt-1 ${catColor}`}>
                    {template.categoryLabel}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mb-4 flex-1">{template.description}</p>
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {template.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => setApplyingTemplate(template)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
                >
                  <Play className="w-3 h-3" />
                  החל
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {applyingTemplate && (
          <ApplyTemplateModal
            template={applyingTemplate}
            modules={modules}
            onClose={() => setApplyingTemplate(null)}
            onApplied={() => {
              setApplyingTemplate(null);
              queryClient.invalidateQueries({ queryKey: ["automations"] });
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ApplyTemplateModal({
  template,
  modules,
  onClose,
  onApplied,
}: {
  template: AutomationTemplate;
  modules: PlatformModule[];
  onClose: () => void;
  onApplied: () => void;
}) {
  const [selectedModule, setSelectedModule] = useState<number | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState("");

  const handleApply = async () => {
    if (!selectedModule) return;
    setIsApplying(true);
    setError("");
    try {
      const r = await authFetch(`${API}/platform/automation-templates/${template.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId: selectedModule }),
      });
      if (!r.ok) {
        const data = await r.json();
        throw new Error(data.message || "Failed to apply template");
      }
      onApplied();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.95 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">החלת תבנית</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-muted/30 rounded-xl p-4 mb-4">
          <h3 className="font-semibold text-sm">{template.name}</h3>
          <p className="text-xs text-muted-foreground mt-1">{template.description}</p>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">בחר מודול יעד</label>
          <div className="grid grid-cols-2 gap-2">
            {modules.map((mod) => (
              <button
                key={mod.id}
                onClick={() => setSelectedModule(mod.id)}
                className={`p-3 rounded-xl border text-sm text-right transition-all ${
                  selectedModule === mod.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-primary/30"
                }`}
              >
                {mod.name}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400 mb-4">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleApply}
            disabled={!selectedModule || isApplying}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {isApplying ? "מחיל..." : "החל תבנית"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80">
            ביטול
          </button>
        </div>

        <p className="text-xs text-muted-foreground mt-3 text-center">
          התבנית תיצור אוטומציה חדשה במצב כבוי. תוכל לערוך אותה לפני הפעלה.
        </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="automation-dashboard" />
        <RelatedRecords entityType="automation-dashboard" />
      </div>
      </motion.div>
    </motion.div>
  );
}
