import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import {
  Plus, Trash2, X, AlertTriangle, CheckCircle, Clock,
  Activity, TrendingUp, TrendingDown, Target, Shield,
  BarChart3, RefreshCw, Settings, Eye, Filter, Zap,
  AlarmClock, FileText, Building2, Edit2
} from "lucide-react";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

interface SlaDefinition {
  id: number;
  name: string;
  description: string | null;
  sla_type: string;
  entity_type: string | null;
  department: string | null;
  metric_unit: string;
  target_value: number;
  warning_threshold_pct: number;
  breach_threshold_pct: number;
  business_hours_only: boolean;
  escalation_chain_name: string | null;
  is_active: boolean;
  active_count: number;
  breach_count: number;
}

interface SlaTracking {
  id: number;
  sla_id: number;
  sla_name: string;
  sla_type: string;
  entity_type: string;
  record_id: number | null;
  record_label: string | null;
  department: string | null;
  started_at: string;
  deadline_at: string;
  resolved_at: string | null;
  status: string;
  elapsed_hours_now: number;
  hours_remaining: number;
  remaining_pct: number;
  target_value: number;
  warning_threshold_pct: number;
  breach_threshold_pct: number;
}

interface DashboardData {
  summary: {
    active_count: number;
    breached_count: number;
    resolved_count: number;
    approaching_breach_count: number;
    avg_compliance_pct: number;
  };
  byType: any[];
  recentBreaches: SlaTracking[];
  approaching: SlaTracking[];
  trendData: any[];
}

const SLA_TYPES = [
  { value: "response", label: "זמן תגובה", color: "blue" },
  { value: "resolution", label: "זמן טיפול", color: "green" },
  { value: "uptime", label: "זמינות", color: "purple" },
  { value: "delivery", label: "זמן אספקה", color: "orange" },
  { value: "custom", label: "מותאם", color: "gray" },
];

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; cls: string }> = {
    active: { label: "פעיל", cls: "bg-blue-500/10 text-blue-400" },
    resolved: { label: "טופל", cls: "bg-green-500/10 text-green-400" },
    breached: { label: "חריגה", cls: "bg-red-500/10 text-red-400" },
    warning: { label: "אזהרה", cls: "bg-yellow-500/10 text-yellow-500" },
  };
  const cfg = configs[status] || { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

function ComplianceGauge({ pct, size = "md" }: { pct: number; size?: "sm" | "md" | "lg" }) {
  const clampedPct = Math.min(100, Math.max(0, pct || 0));
  const color = clampedPct >= 90 ? "#22c55e" : clampedPct >= 70 ? "#eab308" : "#ef4444";
  const radius = size === "lg" ? 52 : size === "sm" ? 28 : 40;
  const strokeWidth = size === "lg" ? 8 : size === "sm" ? 5 : 6;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clampedPct / 100) * circumference;
  const svgSize = (radius + strokeWidth + 4) * 2;

  return (
    <div className="flex flex-col items-center">
      <svg width={svgSize} height={svgSize} className="-rotate-90">
        <circle cx={svgSize / 2} cy={svgSize / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-muted/30" />
        <circle cx={svgSize / 2} cy={svgSize / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.5s ease" }} />
      </svg>
      <span className={`font-bold ${size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-lg"} -mt-${size === "sm" ? "8" : "10"}`}
        style={{ color, marginTop: -(svgSize * 0.55) }}>
        {Math.round(clampedPct)}%
      </span>
    </div>
  );
}

function SlaProgressBar({ tracking }: { tracking: SlaTracking }) {
  const elapsedPct = tracking.target_value > 0
    ? Math.min(100, (tracking.elapsed_hours_now / tracking.target_value) * 100)
    : 0;
  const isBreached = tracking.status === "breached" || elapsedPct >= tracking.breach_threshold_pct;
  const isWarning = elapsedPct >= tracking.warning_threshold_pct;
  const barColor = isBreached ? "bg-red-500" : isWarning ? "bg-yellow-500" : "bg-green-500";

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>{Math.round(tracking.elapsed_hours_now)}ש' עברו</span>
        <span>{tracking.hours_remaining > 0 ? `${Math.round(tracking.hours_remaining)}ש' נותרו` : "חריגה!"}</span>
      </div>
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(100, elapsedPct)}%` }} />
      </div>
    </div>
  );
}

export default function SlaDashboard() {
  const queryClient = useQueryClient();
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [activeTab, setActiveTab] = useState<"dashboard" | "definitions" | "tracking">("dashboard");
  const [showCreateSla, setShowCreateSla] = useState(false);
  const [showCreateTracking, setShowCreateTracking] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [editingSla, setEditingSla] = useState<SlaDefinition | null>(null);

  const { data: dashboard, isLoading: dashboardLoading, refetch: refetchDashboard } = useQuery<DashboardData>({
    queryKey: ["sla-dashboard"],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/sla-dashboard`);
      if (!r.ok) return { summary: {}, byType: [], recentBreaches: [], approaching: [], trendData: [] } as any;
      return r.json();
    },
    refetchInterval: 60_000,
  });

  const { data: definitions = [] } = useQuery<SlaDefinition[]>({
    queryKey: ["sla-definitions"],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/sla-definitions`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: tracking = [] } = useQuery<SlaTracking[]>({
    queryKey: ["sla-tracking", filterStatus],
    queryFn: async () => {
      const params = filterStatus !== "all" ? `?status=${filterStatus}` : "";
      const r = await authFetch(`${API}/platform/sla-tracking${params}`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: activeTab === "tracking",
  });

  const deleteSla = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/platform/sla-definitions/${id}`, { method: "DELETE" });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sla-definitions"] }); queryClient.invalidateQueries({ queryKey: ["sla-dashboard"] }); },
  });

  const resolveTracking = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/platform/sla-tracking/${id}/resolve`, { method: "POST" });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sla-tracking"] }); queryClient.invalidateQueries({ queryKey: ["sla-dashboard"] }); },
  });

  const summary = dashboard?.summary || {};
  const totalResolved = Number(summary.resolved_count || 0);
  const totalBreached = Number(summary.breached_count || 0);
  const complianceRate = totalResolved + totalBreached > 0
    ? Math.round((totalResolved / (totalResolved + totalBreached)) * 100)
    : Number(summary.avg_compliance_pct || 100);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ניהול SLA</h1>
          <p className="text-muted-foreground mt-1">עקוב אחר הסכמי רמת שירות, ציות ביצועים והפרות</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetchDashboard()} className="p-2.5 hover:bg-muted rounded-xl transition-colors" title="רענן">
            <RefreshCw className="w-4 h-4" />
          </button>
          {activeTab === "definitions" && (
            <button onClick={() => setShowCreateSla(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
              <Plus className="w-4 h-4" />
              הגדרת SLA חדשה
            </button>
          )}
          {activeTab === "tracking" && (
            <button onClick={() => setShowCreateTracking(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
              <Plus className="w-4 h-4" />
              מעקב חדש
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 bg-muted rounded-xl p-1 w-fit">
        {[
          { key: "dashboard", label: "לוח בקרה", icon: BarChart3 },
          { key: "definitions", label: "הגדרות SLA", icon: Settings },
          { key: "tracking", label: "מעקב פעיל", icon: Activity },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === key ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "dashboard" && (
        <>
          {dashboardLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "SLA פעילים", value: summary.active_count || 0, icon: Activity, color: "blue" },
                  { label: "ציות ממוצע", value: `${complianceRate}%`, icon: Shield, color: "green" },
                  { label: "הפרות", value: summary.breached_count || 0, icon: AlertTriangle, color: "red" },
                  { label: "מתקרבים להפרה", value: summary.approaching_breach_count || 0, icon: AlarmClock, color: "yellow" },
                ].map(({ label, value, icon: Icon, color }, i) => (
                  <motion.div key={label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    className="bg-card border border-border rounded-2xl p-5">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${
                      color === "blue" ? "bg-blue-500/10" : color === "green" ? "bg-green-500/10" : color === "red" ? "bg-red-500/10" : "bg-yellow-500/10"
                    }`}>
                      <Icon className={`w-5 h-5 ${
                        color === "blue" ? "text-blue-400" : color === "green" ? "text-green-400" : color === "red" ? "text-red-400" : "text-yellow-500"
                      }`} />
                    </div>
                    <div className="text-2xl font-bold">{value}</div>
                    <div className="text-sm text-muted-foreground mt-1">{label}</div>
                  </motion.div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-card border border-border rounded-2xl p-5">
                  <h2 className="font-semibold mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    SLA מתקרבים להפרה
                  </h2>
                  {(dashboard?.approaching || []).length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
                      <p className="text-sm">אין SLA מתקרבים להפרה</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(dashboard?.approaching || []).slice(0, 5).map((item: any) => (
                        <div key={item.id} className="p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-sm">{item.sla_name}</span>
                            <span className="text-xs text-yellow-500">{Math.max(0, Math.round(item.hours_remaining))}ש' נותרו</span>
                          </div>
                          <div className="text-xs text-muted-foreground mb-2">{item.entity_type} {item.record_label ? `· ${item.record_label}` : ""}</div>
                          <SlaProgressBar tracking={item} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-card border border-border rounded-2xl p-5">
                  <h2 className="font-semibold mb-4 flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary" />
                    ציות לפי סוג SLA
                  </h2>
                  {(dashboard?.byType || []).length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <p className="text-sm">אין נתוני ציות להצגה</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(dashboard?.byType || []).map((type: any, i: number) => {
                        const total = Number(type.active) + Number(type.resolved) + Number(type.breached);
                        const compliance = Number(type.avg_compliance || 0);
                        return (
                          <div key={i} className="flex items-center gap-4">
                            <div className="flex-1">
                              <div className="flex justify-between mb-1">
                                <span className="text-sm font-medium">{type.name}</span>
                                <span className="text-sm text-muted-foreground">{total} רשומות</span>
                              </div>
                              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, compliance)}%` }} />
                              </div>
                            </div>
                            <div className="text-sm font-bold w-12 text-right">{Math.round(compliance)}%</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {(dashboard?.recentBreaches || []).length > 0 && (
                <div className="bg-card border border-border rounded-2xl p-5">
                  <h2 className="font-semibold mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    הפרות אחרונות
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-right text-muted-foreground border-b border-border">
                          <th className="pb-2 font-medium">SLA</th>
                          <th className="pb-2 font-medium">ישות</th>
                          <th className="pb-2 font-medium">מחלקה</th>
                          <th className="pb-2 font-medium">הדד-ליין</th>
                          <th className="pb-2 font-medium">סטטוס</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {(dashboard?.recentBreaches || []).map((breach: any) => (
                          <tr key={breach.id} className="text-right">
                            <td className="py-2">{breach.sla_name}</td>
                            <td className="py-2 text-muted-foreground">{breach.entity_type}</td>
                            <td className="py-2 text-muted-foreground">{breach.department || "—"}</td>
                            <td className="py-2 text-muted-foreground">{new Date(breach.deadline_at).toLocaleString("he-IL")}</td>
                            <td className="py-2"><StatusBadge status={breach.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {(dashboard?.trendData || []).length > 0 && (
                <div className="bg-card border border-border rounded-2xl p-5">
                  <h2 className="font-semibold mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    מגמת 30 ימים
                  </h2>
                  <div className="flex items-end gap-1 h-24">
                    {(dashboard?.trendData || []).map((d: any, i: number) => {
                      const total = Number(d.total || 0);
                      const maxTotal = Math.max(...(dashboard?.trendData || []).map((x: any) => Number(x.total || 0)), 1);
                      const height = total > 0 ? Math.max(4, (total / maxTotal) * 100) : 2;
                      const breachedPct = total > 0 ? (Number(d.breached) / total) : 0;
                      return (
                        <div key={i} title={`${new Date(d.day).toLocaleDateString("he-IL")}: ${total} רשומות, ${d.breached} הפרות`}
                          className="flex-1 flex flex-col justify-end min-w-0">
                          <div style={{ height: `${height}%` }}
                            className={`w-full rounded-sm ${breachedPct > 0.3 ? "bg-red-500/70" : breachedPct > 0.1 ? "bg-yellow-500/70" : "bg-primary/70"}`} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-2">
                    <span>{dashboard?.trendData?.length ? new Date((dashboard.trendData[0] as any).day).toLocaleDateString("he-IL") : ""}</span>
                    <span>{dashboard?.trendData?.length ? new Date((dashboard.trendData[dashboard.trendData.length - 1] as any).day).toLocaleDateString("he-IL") : ""}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {activeTab === "definitions" && (
        <div className="space-y-3">
          {definitions.length === 0 ? (
            <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
              <Shield className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">אין הגדרות SLA</h3>
              <p className="text-muted-foreground mb-6">הגדר הסכמי רמת שירות למדידת ביצועי הצוות</p>
              <button onClick={() => setShowCreateSla(true)} className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium">
                <Plus className="w-5 h-5" />
                הגדרת SLA ראשונה
              </button>
            </div>
          ) : definitions.map((sla, i) => {
            const typeInfo = SLA_TYPES.find(t => t.value === sla.sla_type) || SLA_TYPES[4];
            return (
              <motion.div key={sla.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      typeInfo.color === "blue" ? "bg-blue-500/10" : typeInfo.color === "green" ? "bg-green-500/10" : typeInfo.color === "purple" ? "bg-purple-500/10" : typeInfo.color === "orange" ? "bg-orange-500/10" : "bg-muted"
                    }`}>
                      <Shield className={`w-5 h-5 ${
                        typeInfo.color === "blue" ? "text-blue-400" : typeInfo.color === "green" ? "text-green-400" : typeInfo.color === "purple" ? "text-purple-400" : typeInfo.color === "orange" ? "text-orange-400" : "text-muted-foreground"
                      }`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{sla.name}</h3>
                        <span className="px-2 py-0.5 text-xs bg-muted text-muted-foreground rounded-full">{typeInfo.label}</span>
                        {!sla.is_active && <span className="px-2 py-0.5 text-xs bg-muted text-muted-foreground rounded-full">לא פעיל</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>יעד: {sla.target_value} {sla.metric_unit === "hours" ? "שעות" : sla.metric_unit}</span>
                        {sla.entity_type && <span>· {sla.entity_type}</span>}
                        {sla.department && <span>· {sla.department}</span>}
                        <span>· {Number(sla.active_count)} פעילים, {Number(sla.breach_count)} הפרות</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditingSla(sla)} className="p-2 hover:bg-muted rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button onClick={async () => {
                      if (await globalConfirm("למחוק הגדרת SLA?")) deleteSla.mutate(sla.id);
                    }} className="p-2 hover:bg-destructive/10 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {activeTab === "tracking" && (
        <>
          <div className="flex gap-2 flex-wrap">
            {["all", "active", "warning", "breached", "resolved"].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${filterStatus === s ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>
                {s === "all" ? "הכל" : s === "active" ? "פעיל" : s === "warning" ? "אזהרה" : s === "breached" ? "הפרה" : "טופל"}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {tracking.length === 0 ? (
              <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
                <Activity className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">אין רשומות מעקב</h3>
                <p className="text-muted-foreground">התחל מעקב SLA על רשומות ספציפיות</p>
              </div>
            ) : tracking.map((item, i) => (
              <motion.div key={item.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                className={`bg-card border rounded-2xl p-4 ${item.status === "breached" ? "border-red-500/30" : item.hours_remaining < 2 ? "border-yellow-500/30" : "border-border"}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.sla_name}</span>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {item.entity_type}
                      {item.record_label && ` · ${item.record_label}`}
                      {item.department && ` · ${item.department}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right text-xs text-muted-foreground">
                      <div>דדליין: {new Date(item.deadline_at).toLocaleString("he-IL")}</div>
                    </div>
                    {item.status === "active" && (
                      <button onClick={() => resolveTracking.mutate(item.id)}
                        className="flex items-center gap-1 px-2 py-1.5 bg-green-500/10 text-green-400 rounded-lg text-xs font-medium hover:bg-green-500/20 transition-colors">
                        <CheckCircle className="w-3.5 h-3.5" />
                        סמן כטופל
                      </button>
                    )}
                  </div>
                </div>
                {item.status === "active" && <SlaProgressBar tracking={item} />}
              </motion.div>
            ))}
          </div>
        </>
      )}

      <AnimatePresence>
        {showCreateSla && (
          <CreateSlaModal
            onClose={() => setShowCreateSla(false)}
            onSuccess={() => { setShowCreateSla(false); queryClient.invalidateQueries({ queryKey: ["sla-definitions"] }); queryClient.invalidateQueries({ queryKey: ["sla-dashboard"] }); }}
          />
        )}
        {editingSla && (
          <CreateSlaModal
            existing={editingSla}
            onClose={() => setEditingSla(null)}
            onSuccess={() => { setEditingSla(null); queryClient.invalidateQueries({ queryKey: ["sla-definitions"] }); queryClient.invalidateQueries({ queryKey: ["sla-dashboard"] }); }}
          />
        )}
        {showCreateTracking && (
          <CreateTrackingModal
            definitions={definitions}
            onClose={() => setShowCreateTracking(false)}
            onSuccess={() => { setShowCreateTracking(false); queryClient.invalidateQueries({ queryKey: ["sla-tracking"] }); queryClient.invalidateQueries({ queryKey: ["sla-dashboard"] }); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function CreateSlaModal({ existing, onClose, onSuccess }: { existing?: SlaDefinition; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    name: existing?.name || "",
    description: existing?.description || "",
    slaType: existing?.sla_type || "response",
    entityType: existing?.entity_type || "",
    department: existing?.department || "",
    metricUnit: existing?.metric_unit || "hours",
    targetValue: existing?.target_value || 24,
    warningThresholdPct: existing?.warning_threshold_pct || 80,
    breachThresholdPct: existing?.breach_threshold_pct || 100,
    businessHoursOnly: existing?.business_hours_only || false,
    businessHoursStart: 8,
    businessHoursEnd: 17,
  });
  const [isLoading, setIsLoading] = useState(false);

  const save = async () => {
    if (!form.name) return;
    setIsLoading(true);
    try {
      const url = existing ? `${API}/platform/sla-definitions/${existing.id}` : `${API}/platform/sla-definitions`;
      await authFetch(url, {
        method: existing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      onSuccess();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">{existing ? "ערוך הגדרת SLA" : "הגדרת SLA חדשה"}</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">שם</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">תיאור</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">סוג SLA</label>
              <select value={form.slaType} onChange={e => setForm(f => ({ ...f, slaType: e.target.value }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                {SLA_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">יחידת מדידה</label>
              <select value={form.metricUnit} onChange={e => setForm(f => ({ ...f, metricUnit: e.target.value }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="hours">שעות</option>
                <option value="minutes">דקות</option>
                <option value="days">ימים</option>
                <option value="percent">אחוז</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">ערך יעד</label>
              <input type="number" min={0} value={form.targetValue} onChange={e => setForm(f => ({ ...f, targetValue: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">סף אזהרה (%)</label>
              <input type="number" min={0} max={100} value={form.warningThresholdPct} onChange={e => setForm(f => ({ ...f, warningThresholdPct: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">סף הפרה (%)</label>
              <input type="number" min={0} max={200} value={form.breachThresholdPct} onChange={e => setForm(f => ({ ...f, breachThresholdPct: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">סוג ישות</label>
              <input value={form.entityType} onChange={e => setForm(f => ({ ...f, entityType: e.target.value }))} placeholder="הזמנה, תמיכה..."
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">מחלקה</label>
              <input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="רכש, תמיכה..."
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.businessHoursOnly} onChange={e => setForm(f => ({ ...f, businessHoursOnly: e.target.checked }))} className="w-4 h-4" />
            <span className="text-sm">חשב רק בשעות עבודה</span>
          </label>
          {form.businessHoursOnly && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">שעת התחלה</label>
                <input type="number" min={0} max={23} value={form.businessHoursStart} onChange={e => setForm(f => ({ ...f, businessHoursStart: Number(e.target.value) }))}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">שעת סיום</label>
                <input type="number" min={0} max={23} value={form.businessHoursEnd} onChange={e => setForm(f => ({ ...f, businessHoursEnd: Number(e.target.value) }))}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={save} disabled={!form.name || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50">
            {isLoading ? "שומר..." : existing ? "שמור שינויים" : "צור הגדרה"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function CreateTrackingModal({ definitions, onClose, onSuccess }: { definitions: SlaDefinition[]; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ slaId: "", entityType: "", recordLabel: "", department: "" });
  const [isLoading, setIsLoading] = useState(false);

  const create = async () => {
    if (!form.slaId || !form.entityType) return;
    setIsLoading(true);
    try {
      await authFetch(`${API}/platform/sla-tracking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slaId: Number(form.slaId), entityType: form.entityType, recordLabel: form.recordLabel, department: form.department }),
      });
      onSuccess();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">מעקב SLA חדש</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">הגדרת SLA</label>
            <select value={form.slaId} onChange={e => setForm(f => ({ ...f, slaId: e.target.value }))}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              <option value="">בחר הגדרה...</option>
              {definitions.map(d => <option key={d.id} value={d.id}>{d.name} ({d.target_value} {d.metric_unit === "hours" ? "ש'" : d.metric_unit})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">סוג ישות</label>
            <input value={form.entityType} onChange={e => setForm(f => ({ ...f, entityType: e.target.value }))} placeholder="הזמנה, תמיכה..."
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">תווית רשומה</label>
            <input value={form.recordLabel} onChange={e => setForm(f => ({ ...f, recordLabel: e.target.value }))} placeholder="מספר הזמנה, נושא..."
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">מחלקה</label>
            <input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="רכש, תמיכה..."
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
        </div>
        <div className="flex gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={create} disabled={!form.slaId || !form.entityType || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50">
            {isLoading ? "שומר..." : "התחל מעקב"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
