import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import {
  Wrench, Cpu, AlertTriangle, Clock, TrendingUp, CheckCircle2, Plus, Settings,
  CalendarDays, Activity, DollarSign, BarChart3, X, Search, Filter, RefreshCw,
  ChevronDown, ChevronUp, Trash2, Edit, Eye, AlertCircle, Timer, Gauge, PieChart,
  ListChecks, FileText, Cog, ArrowUpDown, Package, MapPin, Building2, Users, Zap,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart as RePieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadarChart,
  Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, AreaChart, Area,
} from "recharts";

type Tab = "dashboard" | "equipment" | "pm-schedules" | "work-orders" | "analytics";

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}

function KpiCard({ title, value, icon, color, subtitle }: KpiCardProps) {
  return (
    <div className={`rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-4 flex items-start gap-3`}>
      <div className={`p-2.5 rounded-lg ${color}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-zinc-400 truncate">{title}</p>
        <p className="text-xl font-bold text-zinc-100 mt-0.5">{value}</p>
        {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-400",
  maintenance: "bg-amber-500/20 text-amber-400",
  down: "bg-red-500/20 text-red-400",
  retired: "bg-zinc-500/20 text-zinc-400",
  open: "bg-blue-500/20 text-blue-400",
  in_progress: "bg-amber-500/20 text-amber-400",
  completed: "bg-emerald-500/20 text-emerald-400",
  waiting_parts: "bg-purple-500/20 text-purple-400",
  cancelled: "bg-zinc-500/20 text-zinc-400",
};

const STATUS_LABELS: Record<string, string> = {
  active: "פעיל",
  maintenance: "בתחזוקה",
  down: "מושבת",
  retired: "פורק",
  open: "פתוח",
  in_progress: "בביצוע",
  completed: "הושלם",
  waiting_parts: "ממתין לחלקים",
  cancelled: "בוטל",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400",
  high: "bg-orange-500/20 text-orange-400",
  medium: "bg-yellow-500/20 text-yellow-400",
  low: "bg-green-500/20 text-green-400",
};

const PRIORITY_LABELS: Record<string, string> = {
  critical: "קריטי",
  high: "גבוה",
  medium: "בינוני",
  low: "נמוך",
};

const CHART_COLORS = ["#3b82f6", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

function Badge({ text, color }: { text: string; color: string }) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{text}</span>;
}

function StatusBadge({ status }: { status: string }) {
  return <Badge text={STATUS_LABELS[status] || status} color={STATUS_COLORS[status] || "bg-zinc-600 text-zinc-300"} />;
}

function PriorityBadge({ priority }: { priority: string }) {
  return <Badge text={PRIORITY_LABELS[priority] || priority} color={PRIORITY_COLORS[priority] || "bg-zinc-600 text-zinc-300"} />;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("he-IL"); } catch { return "—"; }
}

function formatCurrency(v: number | string | null): string {
  const n = Number(v || 0);
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);
}

function formatNum(v: number | string | null, decimals = 1): string {
  return Number(v || 0).toFixed(decimals);
}

export default function CmmsDashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const queryClient = useQueryClient();

  const { data: dashboard } = useQuery({
    queryKey: ["cmms-dashboard"],
    queryFn: async () => {
      const r = await authFetch("/api/cmms/dashboard");
      return r.json();
    },
    refetchInterval: 30000,
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const r = await authFetch("/api/cmms/seed", { method: "POST" });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmms-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-equipment"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-pm-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-work-orders"] });
    },
  });

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: "לוח בקרה", icon: <Gauge className="w-4 h-4" /> },
    { id: "equipment", label: "ציוד ומכונות", icon: <Cpu className="w-4 h-4" /> },
    { id: "pm-schedules", label: "תחזוקה מונעת", icon: <CalendarDays className="w-4 h-4" /> },
    { id: "work-orders", label: "קריאות שירות", icon: <Wrench className="w-4 h-4" /> },
    { id: "analytics", label: "אנליטיקה", icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Wrench className="w-7 h-7 text-blue-400" />
            מערכת CMMS — תחזוקת ציוד
          </h1>
          <p className="text-sm text-zinc-400 mt-1">ניהול תחזוקה ממוחשבת — ציוד, תחזוקה מונעת, קריאות שירות ואנליטיקה</p>
        </div>
        <button
          onClick={() => seedMutation.mutate()}
          disabled={seedMutation.isPending}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${seedMutation.isPending ? "animate-spin" : ""}`} />
          {seedMutation.isPending ? "מאתחל..." : "אתחל נתוני דמו"}
        </button>
      </div>

      <div className="flex gap-1 bg-zinc-800/50 rounded-lg p-1 border border-zinc-700/50 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-blue-600 text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "dashboard" && <DashboardTab dashboard={dashboard} />}
      {activeTab === "equipment" && <EquipmentTab />}
      {activeTab === "pm-schedules" && <PMSchedulesTab />}
      {activeTab === "work-orders" && <WorkOrdersTab />}
      {activeTab === "analytics" && <AnalyticsTab dashboard={dashboard} />}
    </div>
  );
}

function DashboardTab({ dashboard }: { dashboard: Record<string, unknown> | undefined }) {
  if (!dashboard) return <div className="text-center py-12 text-zinc-400">טוען...</div>;

  const eq = (dashboard.equipment || {}) as Record<string, unknown>;
  const wo = (dashboard.workOrders || {}) as Record<string, unknown>;
  const mtbf = Number(dashboard.mtbf || 0);
  const mttr = Number(dashboard.mttr || 0);
  const recentWo = (Array.isArray(dashboard.recentWorkOrders) ? dashboard.recentWorkOrders : []) as Record<string, unknown>[];
  const upcomingPm = (Array.isArray(dashboard.upcomingPm) ? dashboard.upcomingPm : []) as Record<string, unknown>[];
  const downEq = (Array.isArray(dashboard.downEquipment) ? dashboard.downEquipment : []) as Record<string, unknown>[];
  const monthlyCosts = (Array.isArray(dashboard.monthlyCosts) ? dashboard.monthlyCosts : []) as Record<string, unknown>[];
  const failureTypes = (Array.isArray(dashboard.failureTypes) ? dashboard.failureTypes : []) as Record<string, unknown>[];
  const todayCount = Number(dashboard.todayCount || 0);
  const thisWeekCount = Number(dashboard.thisWeekCount || 0);
  const weeklySchedule = (Array.isArray(dashboard.weeklySchedule) ? dashboard.weeklySchedule : []) as Record<string, unknown>[];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <KpiCard title="ציוד פעיל" value={String(eq.active || 0)} icon={<Cpu className="w-5 h-5 text-emerald-400" />} color="bg-emerald-500/10" subtitle={`${eq.total_equipment || 0} סה״כ`} />
        <KpiCard title="בתחזוקה / מושבת" value={`${eq.in_maintenance || 0} / ${eq.down || 0}`} icon={<AlertTriangle className="w-5 h-5 text-amber-400" />} color="bg-amber-500/10" />
        <KpiCard title="תחזוקה היום" value={String(todayCount)} icon={<CalendarDays className="w-5 h-5 text-orange-400" />} color="bg-orange-500/10" />
        <KpiCard title="תחזוקה השבוע" value={String(thisWeekCount)} icon={<CalendarDays className="w-5 h-5 text-indigo-400" />} color="bg-indigo-500/10" />
        <KpiCard title="קריאות פתוחות" value={String(wo.open_work_orders || 0)} icon={<Wrench className="w-5 h-5 text-blue-400" />} color="bg-blue-500/10" subtitle={`${wo.critical_open || 0} קריטי`} />
        <KpiCard title="MTBF" value={`${formatNum(mtbf, 0)} שעות`} icon={<TrendingUp className="w-5 h-5 text-cyan-400" />} color="bg-cyan-500/10" subtitle="זמן ממוצע בין תקלות" />
        <KpiCard title="MTTR" value={`${formatNum(mttr)} שעות`} icon={<Timer className="w-5 h-5 text-purple-400" />} color="bg-purple-500/10" subtitle="זמן ממוצע לתיקון" />
        <KpiCard title="עלות חודשית" value={formatCurrency(Number(wo.monthly_cost || 0))} icon={<DollarSign className="w-5 h-5 text-green-400" />} color="bg-green-500/10" subtitle={`${formatNum(Number(wo.monthly_downtime || 0), 0)} שעות השבתה`} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
          <h3 className="text-base font-semibold text-zinc-100 mb-4 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-blue-400" />
            קריאות שירות פתוחות
          </h3>
          {recentWo.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-6">אין קריאות פתוחות</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {recentWo.map((wo) => (
                <div key={String(wo.id)} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/60 border border-zinc-700/40">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="text-xs font-mono text-zinc-500">{String(wo.wo_number || "")}</div>
                    <div className="min-w-0">
                      <p className="text-sm text-zinc-200 truncate">{String(wo.title || "")}</p>
                      <p className="text-xs text-zinc-500">{String(wo.equipment_name || "—")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <PriorityBadge priority={String(wo.priority || "medium")} />
                    <StatusBadge status={String(wo.status || "open")} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
            <h3 className="text-base font-semibold text-zinc-100 mb-4 flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-amber-400" />
              תחזוקה מונעת קרובה
            </h3>
            {upcomingPm.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-4">אין תחזוקה מתוכננת</p>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {upcomingPm.map((pm) => {
                  const dueDate = new Date(String(pm.next_due));
                  const isOverdue = dueDate < new Date();
                  return (
                    <div key={String(pm.id)} className={`p-2.5 rounded-lg border ${isOverdue ? "border-red-500/40 bg-red-500/5" : "border-zinc-700/40 bg-zinc-800/60"}`}>
                      <p className="text-sm text-zinc-200 truncate">{String(pm.equipment_name || pm.title || "")}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-zinc-500">{String(pm.assigned_to || "—")}</span>
                        <span className={`text-xs ${isOverdue ? "text-red-400 font-medium" : "text-zinc-400"}`}>
                          {formatDate(String(pm.next_due))}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {downEq.length > 0 && (
            <div className="rounded-xl border border-red-500/30 bg-zinc-900/80 p-5">
              <h3 className="text-base font-semibold text-red-400 mb-3 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                ציוד מושבת
              </h3>
              <div className="space-y-2">
                {downEq.map((eq) => (
                  <div key={String(eq.id)} className="flex items-center justify-between p-2 rounded bg-zinc-800/60">
                    <div>
                      <p className="text-sm text-zinc-200">{String(eq.name || "")}</p>
                      <p className="text-xs text-zinc-500">{String(eq.location || "")}</p>
                    </div>
                    <StatusBadge status={String(eq.status || "down")} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
        <h3 className="text-base font-semibold text-zinc-100 mb-4 flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-indigo-400" />
          לוח תחזוקה שבועי
        </h3>
        {weeklySchedule.length === 0 ? (
          <p className="text-zinc-500 text-sm text-center py-6">אין עבודות מתוכננות השבוע</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700/50">
                  <th className="text-right text-xs text-zinc-400 pb-2 px-2">מספר</th>
                  <th className="text-right text-xs text-zinc-400 pb-2 px-2">כותרת</th>
                  <th className="text-right text-xs text-zinc-400 pb-2 px-2">ציוד</th>
                  <th className="text-right text-xs text-zinc-400 pb-2 px-2">תאריך</th>
                  <th className="text-right text-xs text-zinc-400 pb-2 px-2">אחראי</th>
                  <th className="text-right text-xs text-zinc-400 pb-2 px-2">עדיפות</th>
                  <th className="text-right text-xs text-zinc-400 pb-2 px-2">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {weeklySchedule.map((wo) => (
                  <tr key={String(wo.id)} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="py-2 px-2 text-xs font-mono text-zinc-500">{String(wo.wo_number || "")}</td>
                    <td className="py-2 px-2 text-zinc-200">{String(wo.title || "")}</td>
                    <td className="py-2 px-2 text-zinc-400">{String(wo.equipment_name || "—")}</td>
                    <td className="py-2 px-2 text-zinc-400">{formatDate(String(wo.scheduled_date || ""))}</td>
                    <td className="py-2 px-2 text-zinc-400">{String(wo.assigned_to || "—")}</td>
                    <td className="py-2 px-2"><PriorityBadge priority={String(wo.priority || "medium")} /></td>
                    <td className="py-2 px-2"><StatusBadge status={String(wo.status || "open")} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
          <h3 className="text-base font-semibold text-zinc-100 mb-4">עלויות תחזוקה חודשיות</h3>
          {monthlyCosts.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={monthlyCosts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", direction: "rtl" }} />
                <Area type="monotone" dataKey="cost" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} name="עלות (₪)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-8">אין נתונים</p>
          )}
        </div>

        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
          <h3 className="text-base font-semibold text-zinc-100 mb-4">התפלגות סוגי תקלות</h3>
          {failureTypes.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <RePieChart>
                <Pie
                  data={failureTypes.map((f, i) => ({ name: String(f.type), value: Number(f.count), fill: CHART_COLORS[i % CHART_COLORS.length] }))}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={85}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {failureTypes.map((_f, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", direction: "rtl" }} />
              </RePieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-8">אין נתונים</p>
          )}
        </div>
      </div>
    </div>
  );
}

function EquipmentTab() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Record<string, unknown> | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: equipment = [] } = useQuery({
    queryKey: ["cmms-equipment"],
    queryFn: async () => {
      const r = await authFetch("/api/cmms/equipment");
      const j = await r.json();
      return Array.isArray(j) ? j : j.data || j.items || [];
    },
  });

  const { data: history } = useQuery({
    queryKey: ["cmms-equipment-history", expandedId],
    queryFn: async () => {
      if (!expandedId) return null;
      const r = await authFetch(`/api/cmms/equipment/${expandedId}/history`);
      return r.json();
    },
    enabled: !!expandedId,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const id = data.id;
      const url = id ? `/api/cmms/equipment/${id}` : "/api/cmms/equipment";
      const r = await authFetch(url, { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmms-equipment"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-dashboard"] });
      setShowForm(false);
      setEditItem(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`/api/cmms/equipment/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmms-equipment"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-dashboard"] });
    },
  });

  const filtered = (equipment as Record<string, unknown>[]).filter((eq) => {
    const matchSearch = !searchTerm || String(eq.name || "").includes(searchTerm) || String(eq.equipment_number || "").includes(searchTerm) || String(eq.manufacturer || "").includes(searchTerm);
    const matchStatus = statusFilter === "all" || eq.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="חיפוש ציוד..."
              className="bg-zinc-800 border border-zinc-700 rounded-lg pr-10 pl-4 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 w-64"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="all">כל הסטטוסים</option>
            <option value="active">פעיל</option>
            <option value="maintenance">בתחזוקה</option>
            <option value="down">מושבת</option>
            <option value="retired">פורק</option>
          </select>
        </div>
        <button onClick={() => { setEditItem(null); setShowForm(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded-lg text-sm font-medium flex items-center gap-2">
          <Plus className="w-4 h-4" /> הוסף ציוד
        </button>
      </div>

      {showForm && <EquipmentForm item={editItem} onSave={(d) => saveMutation.mutate(d)} onCancel={() => { setShowForm(false); setEditItem(null); }} saving={saveMutation.isPending} />}

      <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700/60 bg-zinc-800/50">
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">מספר</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">שם</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">קטגוריה</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">יצרן / דגם</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">מיקום</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">קריטיות</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">סטטוס</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">תחזוקה הבאה</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((eq) => {
                const isExpanded = expandedId === Number(eq.id);
                return (
                  <EquipmentRow
                    key={String(eq.id)}
                    eq={eq}
                    isExpanded={isExpanded}
                    history={isExpanded ? history : null}
                    onToggle={() => setExpandedId(isExpanded ? null : Number(eq.id))}
                    onEdit={() => { setEditItem(eq); setShowForm(true); }}
                    onDelete={() => { if (confirm("למחוק ציוד זה?")) deleteMutation.mutate(Number(eq.id)); }}
                  />
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="text-center py-8 text-zinc-500">לא נמצא ציוד</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function EquipmentRow({ eq, isExpanded, history, onToggle, onEdit, onDelete }: {
  eq: Record<string, unknown>;
  isExpanded: boolean;
  history: Record<string, unknown> | null;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const nextMaint = eq.next_maintenance_date ? new Date(String(eq.next_maintenance_date)) : null;
  const isOverdue = nextMaint && nextMaint < new Date();

  return (
    <>
      <tr className="border-b border-zinc-800/60 hover:bg-zinc-800/30 cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-3 font-mono text-xs text-zinc-400">{String(eq.equipment_number || "")}</td>
        <td className="px-4 py-3 text-zinc-200 font-medium">{String(eq.name || "")}</td>
        <td className="px-4 py-3 text-zinc-400">{String(eq.category || "—")}</td>
        <td className="px-4 py-3 text-zinc-400 text-xs">{String(eq.manufacturer || "")} {String(eq.model || "")}</td>
        <td className="px-4 py-3 text-zinc-400 text-xs">{String(eq.location || "—")}</td>
        <td className="px-4 py-3"><PriorityBadge priority={String(eq.criticality || "medium")} /></td>
        <td className="px-4 py-3"><StatusBadge status={String(eq.status || "active")} /></td>
        <td className={`px-4 py-3 text-xs ${isOverdue ? "text-red-400 font-medium" : "text-zinc-400"}`}>
          {formatDate(String(eq.next_maintenance_date || ""))}
          {isOverdue && " ⚠"}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button onClick={onEdit} className="p-1.5 rounded hover:bg-zinc-700/60 text-zinc-400 hover:text-zinc-200"><Edit className="w-3.5 h-3.5" /></button>
            <button onClick={onDelete} className="p-1.5 rounded hover:bg-zinc-700/60 text-zinc-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            <button onClick={onToggle} className="p-1.5 rounded hover:bg-zinc-700/60 text-zinc-400">{isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={9} className="bg-zinc-800/20 px-6 py-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-zinc-500 mb-1">פרטים טכניים</p>
                {eq.image_url && (
                  <img src={String(eq.image_url)} alt={String(eq.name || "")} className="max-h-24 rounded-lg border border-zinc-700/40 object-contain mb-2" />
                )}
                <div className="space-y-1 text-xs">
                  <p className="text-zinc-300">מספר סידורי: <span className="text-zinc-400">{String(eq.serial_number || "—")}</span></p>
                  <p className="text-zinc-300">מחלקה: <span className="text-zinc-400">{String(eq.department || "—")}</span></p>
                  <p className="text-zinc-300">קו ייצור: <span className="text-zinc-400">{String(eq.production_line || "—")}</span></p>
                  <p className="text-zinc-300">שעות שימוש: <span className="text-zinc-400">{formatNum(Number(eq.hours_used || 0), 0)}</span></p>
                  <p className="text-zinc-300">עלות רכישה: <span className="text-zinc-400">{formatCurrency(Number(eq.purchase_cost || 0))}</span></p>
                  <p className="text-zinc-300">תאריך רכישה: <span className="text-zinc-400">{formatDate(String(eq.purchase_date || ""))}</span></p>
                </div>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">היסטוריית קריאות שירות</p>
                {history && Array.isArray((history as Record<string, unknown>).workOrders) ? (
                  <div className="space-y-1 max-h-[150px] overflow-y-auto">
                    {((history as Record<string, unknown>).workOrders as Record<string, unknown>[]).slice(0, 5).map((wo) => (
                      <div key={String(wo.id)} className="flex items-center justify-between text-xs p-1.5 rounded bg-zinc-800/60">
                        <span className="text-zinc-300 truncate">{String(wo.title || "")}</span>
                        <StatusBadge status={String(wo.status || "")} />
                      </div>
                    ))}
                    {((history as Record<string, unknown>).workOrders as Record<string, unknown>[]).length === 0 && (
                      <p className="text-zinc-500 text-xs">אין היסטוריה</p>
                    )}
                  </div>
                ) : (
                  <p className="text-zinc-500 text-xs">טוען...</p>
                )}
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">לוחות תחזוקה מונעת</p>
                {history && Array.isArray((history as Record<string, unknown>).pmSchedules) ? (
                  <div className="space-y-1 max-h-[150px] overflow-y-auto">
                    {((history as Record<string, unknown>).pmSchedules as Record<string, unknown>[]).map((pm) => (
                      <div key={String(pm.id)} className="text-xs p-1.5 rounded bg-zinc-800/60">
                        <p className="text-zinc-300 truncate">{String(pm.title || "")}</p>
                        <p className="text-zinc-500">הבא: {formatDate(String(pm.next_due || ""))}</p>
                      </div>
                    ))}
                    {((history as Record<string, unknown>).pmSchedules as Record<string, unknown>[]).length === 0 && (
                      <p className="text-zinc-500 text-xs">אין לוחות PM</p>
                    )}
                  </div>
                ) : (
                  <p className="text-zinc-500 text-xs">טוען...</p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function EquipmentForm({ item, onSave, onCancel, saving }: {
  item: Record<string, unknown> | null;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Record<string, unknown>>({
    id: item?.id || undefined,
    name: item?.name || "",
    category: item?.category || "",
    manufacturer: item?.manufacturer || "",
    model: item?.model || "",
    serialNumber: item?.serial_number || "",
    location: item?.location || "",
    department: item?.department || "",
    productionLine: item?.production_line || "",
    status: item?.status || "active",
    purchaseDate: item?.purchase_date ? String(item.purchase_date).slice(0, 10) : "",
    purchaseCost: item?.purchase_cost || 0,
    criticality: item?.criticality || "medium",
    hoursUsed: item?.hours_used || 0,
    nextMaintenanceDate: item?.next_maintenance_date ? String(item.next_maintenance_date).slice(0, 10) : "",
    imageUrl: item?.image_url || "",
    notes: item?.notes || "",
  });

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-zinc-100">{item ? "עריכת ציוד" : "ציוד חדש"}</h3>
        <button onClick={onCancel} className="p-1 text-zinc-400 hover:text-zinc-200"><X className="w-5 h-5" /></button>
      </div>
      {form.imageUrl && (
        <div className="flex justify-center">
          <img src={String(form.imageUrl)} alt={String(form.name || "")} className="max-h-40 rounded-lg border border-zinc-700/40 object-contain" />
        </div>
      )}
      <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-3">
        {[
          { label: "שם", key: "name", required: true },
          { label: "קטגוריה", key: "category" },
          { label: "יצרן", key: "manufacturer" },
          { label: "דגם", key: "model" },
          { label: "מספר סידורי", key: "serialNumber" },
          { label: "מיקום", key: "location" },
          { label: "מחלקה", key: "department" },
          { label: "קו ייצור", key: "productionLine" },
          { label: "כתובת תמונה (URL)", key: "imageUrl" },
        ].map((f) => (
          <div key={f.key}>
            <label className="block text-xs text-zinc-400 mb-1">{f.label}{f.required && " *"}</label>
            <input value={String(form[f.key] || "")} onChange={(e) => set(f.key, e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
          </div>
        ))}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">סטטוס</label>
          <select value={String(form.status)} onChange={(e) => set("status", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="active">פעיל</option>
            <option value="maintenance">בתחזוקה</option>
            <option value="down">מושבת</option>
            <option value="retired">פורק</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">קריטיות</label>
          <select value={String(form.criticality)} onChange={(e) => set("criticality", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="low">נמוך</option>
            <option value="medium">בינוני</option>
            <option value="high">גבוה</option>
            <option value="critical">קריטי</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">עלות רכישה</label>
          <input type="number" value={Number(form.purchaseCost || 0)} onChange={(e) => set("purchaseCost", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">שעות שימוש</label>
          <input type="number" value={Number(form.hoursUsed || 0)} onChange={(e) => set("hoursUsed", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">תאריך רכישה</label>
          <input type="date" value={String(form.purchaseDate || "")} onChange={(e) => set("purchaseDate", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">תחזוקה הבאה</label>
          <input type="date" value={String(form.nextMaintenanceDate || "")} onChange={(e) => set("nextMaintenanceDate", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-zinc-400 mb-1">הערות</label>
        <textarea value={String(form.notes || "")} onChange={(e) => set("notes", e.target.value)} rows={2} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-sm">ביטול</button>
        <button onClick={() => onSave(form)} disabled={saving || !form.name} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded-lg text-sm font-medium disabled:opacity-50">
          {saving ? "שומר..." : item ? "עדכן" : "צור"}
        </button>
      </div>
    </div>
  );
}

function PMSchedulesTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Record<string, unknown> | null>(null);

  const { data: schedules = [] } = useQuery({
    queryKey: ["cmms-pm-schedules"],
    queryFn: async () => {
      const r = await authFetch("/api/cmms/pm-schedules");
      const j = await r.json();
      return Array.isArray(j) ? j : j.data || j.items || [];
    },
  });

  const { data: equipment = [] } = useQuery({
    queryKey: ["cmms-equipment"],
    queryFn: async () => {
      const r = await authFetch("/api/cmms/equipment");
      const j = await r.json();
      return Array.isArray(j) ? j : j.data || j.items || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const id = data.id;
      const url = id ? `/api/cmms/pm-schedules/${id}` : "/api/cmms/pm-schedules";
      const r = await authFetch(url, { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmms-pm-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-dashboard"] });
      setShowForm(false);
      setEditItem(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`/api/cmms/pm-schedules/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmms-pm-schedules"] });
    },
  });

  const FREQ_LABELS: Record<string, string> = { daily: "יומי", weekly: "שבועי", monthly: "חודשי", quarterly: "רבעוני", yearly: "שנתי" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-amber-400" />
          לוחות תחזוקה מונעת (PM)
        </h3>
        <button onClick={() => { setEditItem(null); setShowForm(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded-lg text-sm font-medium flex items-center gap-2">
          <Plus className="w-4 h-4" /> לוח חדש
        </button>
      </div>

      {showForm && (
        <PMScheduleForm
          item={editItem}
          equipment={equipment as Record<string, unknown>[]}
          onSave={(d) => saveMutation.mutate(d)}
          onCancel={() => { setShowForm(false); setEditItem(null); }}
          saving={saveMutation.isPending}
        />
      )}

      <div className="grid gap-3">
        {(schedules as Record<string, unknown>[]).map((pm) => {
          const nextDue = pm.next_due ? new Date(String(pm.next_due)) : null;
          const isOverdue = nextDue && nextDue < new Date();
          const daysUntil = nextDue ? Math.ceil((nextDue.getTime() - Date.now()) / 86400000) : null;

          let checklist: { task: string; done: boolean }[] = [];
          try {
            const parsed = typeof pm.checklist === "string" ? JSON.parse(pm.checklist) : pm.checklist;
            if (Array.isArray(parsed)) checklist = parsed;
          } catch { /* ignore */ }

          return (
            <div key={String(pm.id)} className={`rounded-xl border ${isOverdue ? "border-red-500/40" : "border-zinc-700/60"} bg-zinc-900/80 p-4`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-zinc-500">{String(pm.schedule_number || "")}</span>
                    <h4 className="text-sm font-semibold text-zinc-200 truncate">{String(pm.title || "")}</h4>
                    <PriorityBadge priority={String(pm.priority || "medium")} />
                    {pm.is_active === false && <Badge text="לא פעיל" color="bg-zinc-600 text-zinc-300" />}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-zinc-400 flex-wrap">
                    <span className="flex items-center gap-1"><Cpu className="w-3.5 h-3.5" />{String(pm.equipment_name || "—")}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{FREQ_LABELS[String(pm.frequency)] || pm.frequency} ({pm.frequency_days} ימים)</span>
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{String(pm.assigned_to || "—")}</span>
                    <span className="flex items-center gap-1"><Timer className="w-3.5 h-3.5" />{formatNum(Number(pm.estimated_hours || 0))} שעות</span>
                  </div>
                  {checklist.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {checklist.map((c, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50 flex items-center gap-1">
                          <ListChecks className="w-3 h-3" />{c.task}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className={`text-xs font-medium px-2 py-1 rounded ${isOverdue ? "bg-red-500/20 text-red-400" : daysUntil !== null && daysUntil <= 7 ? "bg-amber-500/20 text-amber-400" : "bg-zinc-700 text-zinc-300"}`}>
                    {isOverdue ? `באיחור (${Math.abs(daysUntil || 0)} ימים)` : daysUntil !== null ? `בעוד ${daysUntil} ימים` : "—"}
                  </div>
                  <p className="text-xs text-zinc-500">{formatDate(String(pm.next_due || ""))}</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setEditItem(pm); setShowForm(true); }} className="p-1.5 rounded hover:bg-zinc-700/60 text-zinc-400 hover:text-zinc-200"><Edit className="w-3.5 h-3.5" /></button>
                    <button onClick={() => { if (confirm("למחוק לוח תחזוקה זה?")) deleteMutation.mutate(Number(pm.id)); }} className="p-1.5 rounded hover:bg-zinc-700/60 text-zinc-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {(schedules as Record<string, unknown>[]).length === 0 && (
          <div className="text-center py-12 text-zinc-500">אין לוחות תחזוקה מונעת</div>
        )}
      </div>
    </div>
  );
}

function parsePartsUsed(raw: unknown): { name: string; qty: number }[] {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) return parsed;
  } catch { /* ignore */ }
  return [];
}

function parseChecklist(raw: unknown): { task: string; done: boolean }[] {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) return parsed;
  } catch { /* ignore */ }
  return [];
}

function PMScheduleForm({ item, equipment, onSave, onCancel, saving }: {
  item: Record<string, unknown> | null;
  equipment: Record<string, unknown>[];
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Record<string, unknown>>({
    id: item?.id || undefined,
    equipmentId: item?.equipment_id || "",
    title: item?.title || "",
    description: item?.description || "",
    frequency: item?.frequency || "monthly",
    frequencyDays: item?.frequency_days || 30,
    assignedTo: item?.assigned_to || "",
    estimatedHours: item?.estimated_hours || 1,
    nextDue: item?.next_due ? String(item.next_due).slice(0, 10) : "",
    isActive: item?.is_active !== false,
    priority: item?.priority || "medium",
    frequencyHours: item?.frequency_hours || 0,
    checklist: parseChecklist(item?.checklist),
  });
  const [newTask, setNewTask] = useState("");

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const addChecklistItem = () => {
    if (!newTask.trim()) return;
    const cl = [...(form.checklist as { task: string; done: boolean }[]), { task: newTask.trim(), done: false }];
    set("checklist", cl);
    setNewTask("");
  };

  const removeChecklistItem = (i: number) => {
    const cl = (form.checklist as { task: string; done: boolean }[]).filter((_x, idx) => idx !== i);
    set("checklist", cl);
  };

  return (
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-zinc-100">{item ? "עריכת לוח PM" : "לוח PM חדש"}</h3>
        <button onClick={onCancel} className="p-1 text-zinc-400 hover:text-zinc-200"><X className="w-5 h-5" /></button>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">כותרת *</label>
          <input value={String(form.title || "")} onChange={(e) => set("title", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">ציוד</label>
          <select value={String(form.equipmentId || "")} onChange={(e) => set("equipmentId", e.target.value ? Number(e.target.value) : "")} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="">— בחר ציוד —</option>
            {equipment.map((eq) => <option key={String(eq.id)} value={String(eq.id)}>{String(eq.name)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">תדירות</label>
          <select value={String(form.frequency)} onChange={(e) => set("frequency", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="daily">יומי</option>
            <option value="weekly">שבועי</option>
            <option value="monthly">חודשי</option>
            <option value="quarterly">רבעוני</option>
            <option value="yearly">שנתי</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">כל (ימים)</label>
          <input type="number" value={Number(form.frequencyDays || 30)} onChange={(e) => set("frequencyDays", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">כל (שעות ריצה)</label>
          <input type="number" value={Number(form.frequencyHours || 0)} onChange={(e) => set("frequencyHours", Number(e.target.value))} placeholder="0 = לא פעיל" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">אחראי</label>
          <input value={String(form.assignedTo || "")} onChange={(e) => set("assignedTo", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">שעות מוערכות</label>
          <input type="number" step="0.5" value={Number(form.estimatedHours || 1)} onChange={(e) => set("estimatedHours", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">עדיפות</label>
          <select value={String(form.priority)} onChange={(e) => set("priority", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="low">נמוך</option>
            <option value="medium">בינוני</option>
            <option value="high">גבוה</option>
            <option value="critical">קריטי</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">ביצוע הבא</label>
          <input type="date" value={String(form.nextDue || "")} onChange={(e) => set("nextDue", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-zinc-400 mb-1">צ'ק ליסט</label>
        <div className="flex items-center gap-2 mb-2">
          <input value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addChecklistItem()} placeholder="הוסף משימה..." className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500" />
          <button onClick={addChecklistItem} className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-zinc-200 text-sm"><Plus className="w-4 h-4" /></button>
        </div>
        <div className="space-y-1">
          {(form.checklist as { task: string; done: boolean }[]).map((c, i) => (
            <div key={i} className="flex items-center justify-between p-2 rounded bg-zinc-800/60 border border-zinc-700/40">
              <span className="text-sm text-zinc-300 flex items-center gap-2"><ListChecks className="w-3.5 h-3.5 text-zinc-500" />{c.task}</span>
              <button onClick={() => removeChecklistItem(i)} className="text-zinc-500 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-sm">ביטול</button>
        <button onClick={() => onSave(form)} disabled={saving || !form.title} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded-lg text-sm font-medium disabled:opacity-50">
          {saving ? "שומר..." : item ? "עדכן" : "צור"}
        </button>
      </div>
    </div>
  );
}

function WorkOrdersTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Record<string, unknown> | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: workOrders = [] } = useQuery({
    queryKey: ["cmms-work-orders", statusFilter],
    queryFn: async () => {
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const r = await authFetch(`/api/cmms/work-orders${params}`);
      const j = await r.json();
      return Array.isArray(j) ? j : j.data || j.items || [];
    },
  });

  const { data: equipment = [] } = useQuery({
    queryKey: ["cmms-equipment"],
    queryFn: async () => {
      const r = await authFetch("/api/cmms/equipment");
      const j = await r.json();
      return Array.isArray(j) ? j : j.data || j.items || [];
    },
  });

  const { data: woStats } = useQuery({
    queryKey: ["cmms-wo-stats"],
    queryFn: async () => {
      const r = await authFetch("/api/cmms/work-orders/stats");
      return r.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const id = data.id;
      const url = id ? `/api/cmms/work-orders/${id}` : "/api/cmms/work-orders";
      const r = await authFetch(url, { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmms-work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-wo-stats"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-dashboard"] });
      setShowForm(false);
      setEditItem(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`/api/cmms/work-orders/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmms-work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-wo-stats"] });
    },
  });

  const stats = woStats as Record<string, unknown> | undefined;

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard title="פתוחות" value={String(stats.open_count || 0)} icon={<AlertCircle className="w-5 h-5 text-blue-400" />} color="bg-blue-500/10" />
          <KpiCard title="בביצוע" value={String(stats.in_progress || 0)} icon={<Wrench className="w-5 h-5 text-amber-400" />} color="bg-amber-500/10" />
          <KpiCard title="ממתין לחלקים" value={String(stats.waiting_parts || 0)} icon={<Package className="w-5 h-5 text-purple-400" />} color="bg-purple-500/10" />
          <KpiCard title="הושלמו" value={String(stats.completed || 0)} icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />} color="bg-emerald-500/10" />
          <KpiCard title="זמן ממוצע תיקון" value={`${formatNum(Number(stats.avg_repair_time || 0))} שעות`} icon={<Timer className="w-5 h-5 text-cyan-400" />} color="bg-cyan-500/10" />
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {["all", "open", "in_progress", "waiting_parts", "completed"].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? "bg-blue-600 text-zinc-100" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>
              {s === "all" ? "הכל" : STATUS_LABELS[s] || s}
            </button>
          ))}
        </div>
        <button onClick={() => { setEditItem(null); setShowForm(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded-lg text-sm font-medium flex items-center gap-2">
          <Plus className="w-4 h-4" /> קריאה חדשה
        </button>
      </div>

      {showForm && (
        <WorkOrderForm
          item={editItem}
          equipment={equipment as Record<string, unknown>[]}
          onSave={(d) => saveMutation.mutate(d)}
          onCancel={() => { setShowForm(false); setEditItem(null); }}
          saving={saveMutation.isPending}
        />
      )}

      <div className="space-y-2">
        {(workOrders as Record<string, unknown>[]).map((wo) => {
          const isExpanded = expandedId === Number(wo.id);
          let checklist: { task: string; done: boolean }[] = [];
          try {
            const parsed = typeof wo.checklist === "string" ? JSON.parse(String(wo.checklist)) : wo.checklist;
            if (Array.isArray(parsed)) checklist = parsed;
          } catch { /* ignore */ }

          return (
            <div key={String(wo.id)} className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 overflow-hidden">
              <div className="p-4 flex items-start justify-between gap-3 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : Number(wo.id))}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-zinc-500">{String(wo.wo_number || "")}</span>
                    <h4 className="text-sm font-semibold text-zinc-200 truncate">{String(wo.title || "")}</h4>
                    <PriorityBadge priority={String(wo.priority || "medium")} />
                    <StatusBadge status={String(wo.status || "open")} />
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-zinc-400 flex-wrap">
                    <span className="flex items-center gap-1"><Cpu className="w-3.5 h-3.5" />{String(wo.equipment_name || "—")}</span>
                    <span>{String(wo.work_type || "") === "corrective" ? "תיקון" : wo.work_type === "preventive" ? "מונעת" : "חירום"}</span>
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{String(wo.assigned_to || "—")}</span>
                    {Number(wo.total_cost || 0) > 0 && <span className="flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" />{formatCurrency(Number(wo.total_cost))}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {wo.status !== "completed" && wo.status !== "cancelled" && (
                    <>
                      {wo.status === "open" && (
                        <button onClick={() => saveMutation.mutate({ id: wo.id, status: "in_progress" })} className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs hover:bg-amber-500/30">התחל</button>
                      )}
                      {wo.status === "in_progress" && (
                        <button onClick={() => saveMutation.mutate({ id: wo.id, status: "completed" })} className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-xs hover:bg-emerald-500/30">סיים</button>
                      )}
                    </>
                  )}
                  <button onClick={() => { setEditItem(wo); setShowForm(true); }} className="p-1.5 rounded hover:bg-zinc-700/60 text-zinc-400 hover:text-zinc-200"><Edit className="w-3.5 h-3.5" /></button>
                  <button onClick={() => { if (confirm("למחוק קריאה זו?")) deleteMutation.mutate(Number(wo.id)); }} className="p-1.5 rounded hover:bg-zinc-700/60 text-zinc-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-zinc-700/40 bg-zinc-800/20 p-4 space-y-3">
                  <div className="grid md:grid-cols-3 gap-4 text-xs">
                    <div className="space-y-1">
                      <p className="text-zinc-500 font-medium">פרטי תקלה</p>
                      <p className="text-zinc-300">סוג תקלה: <span className="text-zinc-400">{String(wo.failure_type || "—")}</span></p>
                      <p className="text-zinc-300">תיאור: <span className="text-zinc-400">{String(wo.failure_description || wo.description || "—")}</span></p>
                      <p className="text-zinc-300">פתרון: <span className="text-zinc-400">{String(wo.solution || "—")}</span></p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-zinc-500 font-medium">זמנים</p>
                      <p className="text-zinc-300">שעות מוערכות: <span className="text-zinc-400">{formatNum(Number(wo.estimated_hours || 0))}</span></p>
                      <p className="text-zinc-300">שעות בפועל: <span className="text-zinc-400">{formatNum(Number(wo.actual_hours || 0))}</span></p>
                      <p className="text-zinc-300">שעות השבתה: <span className="text-zinc-400">{formatNum(Number(wo.downtime_hours || 0))}</span></p>
                      <p className="text-zinc-300">נפתח: <span className="text-zinc-400">{formatDate(String(wo.created_at || ""))}</span></p>
                      {wo.completed_at && <p className="text-zinc-300">הושלם: <span className="text-zinc-400">{formatDate(String(wo.completed_at))}</span></p>}
                    </div>
                    <div className="space-y-1">
                      <p className="text-zinc-500 font-medium">עלויות וחלקים</p>
                      <p className="text-zinc-300">חלקים: <span className="text-zinc-400">{formatCurrency(Number(wo.parts_cost || 0))}</span></p>
                      <p className="text-zinc-300">עבודה: <span className="text-zinc-400">{formatCurrency(Number(wo.labor_cost || 0))}</span></p>
                      <p className="text-zinc-300 font-medium">סה&quot;כ: <span className="text-zinc-200">{formatCurrency(Number(wo.total_cost || 0))}</span></p>
                      {parsePartsUsed(wo.parts_used).length > 0 && (
                        <div className="mt-2">
                          <p className="text-zinc-500 text-xs mb-1">חלקים שנוצלו:</p>
                          {parsePartsUsed(wo.parts_used).map((p, pi) => (
                            <p key={pi} className="text-zinc-400 flex items-center gap-1"><Package className="w-3 h-3 text-zinc-500" />{p.name} x{p.qty}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {checklist.length > 0 && (
                    <div>
                      <p className="text-xs text-zinc-500 font-medium mb-1">צ&apos;ק ליסט</p>
                      <div className="space-y-1">
                        {checklist.map((c, i) => (
                          <label key={i} className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer p-1.5 rounded hover:bg-zinc-700/30">
                            <input
                              type="checkbox"
                              checked={c.done}
                              onChange={() => {
                                const updated = checklist.map((item, idx) => idx === i ? { ...item, done: !item.done } : item);
                                saveMutation.mutate({ id: wo.id, checklist: updated });
                              }}
                              className="rounded border-zinc-600"
                            />
                            <span className={c.done ? "line-through text-zinc-500" : ""}>{c.task}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {(workOrders as Record<string, unknown>[]).length === 0 && (
          <div className="text-center py-12 text-zinc-500">אין קריאות שירות</div>
        )}
      </div>
    </div>
  );
}

function WorkOrderForm({ item, equipment, onSave, onCancel, saving }: {
  item: Record<string, unknown> | null;
  equipment: Record<string, unknown>[];
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Record<string, unknown>>({
    id: item?.id || undefined,
    equipmentId: item?.equipment_id || "",
    title: item?.title || "",
    description: item?.description || "",
    workType: item?.work_type || "corrective",
    priority: item?.priority || "medium",
    status: item?.status || "open",
    reportedBy: item?.reported_by || "",
    assignedTo: item?.assigned_to || "",
    failureType: item?.failure_type || "",
    failureDescription: item?.failure_description || "",
    solution: item?.solution || "",
    estimatedHours: item?.estimated_hours || 0,
    actualHours: item?.actual_hours || 0,
    downtimeHours: item?.downtime_hours || 0,
    partsCost: item?.parts_cost || 0,
    laborCost: item?.labor_cost || 0,
    totalCost: item?.total_cost || 0,
    scheduledDate: item?.scheduled_date ? String(item.scheduled_date).slice(0, 10) : "",
    notes: item?.notes || "",
    checklist: parseChecklist(item?.checklist),
    partsUsed: parsePartsUsed(item?.parts_used),
  });
  const [newTask, setNewTask] = useState("");
  const [newPartName, setNewPartName] = useState("");
  const [newPartQty, setNewPartQty] = useState(1);

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const addChecklistItem = () => {
    if (!newTask.trim()) return;
    set("checklist", [...(form.checklist as { task: string; done: boolean }[]), { task: newTask.trim(), done: false }]);
    setNewTask("");
  };

  const addPart = () => {
    if (!newPartName.trim()) return;
    const parts = [...(form.partsUsed as { name: string; qty: number }[]), { name: newPartName.trim(), qty: newPartQty }];
    set("partsUsed", parts);
    setNewPartName("");
    setNewPartQty(1);
  };

  const removePart = (i: number) => {
    set("partsUsed", (form.partsUsed as { name: string; qty: number }[]).filter((_x, idx) => idx !== i));
  };

  return (
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-zinc-100">{item ? "עריכת קריאה" : "קריאת שירות חדשה"}</h3>
        <button onClick={onCancel} className="p-1 text-zinc-400 hover:text-zinc-200"><X className="w-5 h-5" /></button>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">כותרת *</label>
          <input value={String(form.title || "")} onChange={(e) => set("title", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">ציוד</label>
          <select value={String(form.equipmentId || "")} onChange={(e) => set("equipmentId", e.target.value ? Number(e.target.value) : "")} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="">— בחר ציוד —</option>
            {equipment.map((eq) => <option key={String(eq.id)} value={String(eq.id)}>{String(eq.name)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">סוג</label>
          <select value={String(form.workType)} onChange={(e) => set("workType", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="corrective">תיקון</option>
            <option value="preventive">מונעת</option>
            <option value="emergency">חירום</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">עדיפות</label>
          <select value={String(form.priority)} onChange={(e) => set("priority", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="low">נמוך</option>
            <option value="medium">בינוני</option>
            <option value="high">גבוה</option>
            <option value="critical">קריטי</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">סטטוס</label>
          <select value={String(form.status)} onChange={(e) => set("status", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="open">פתוח</option>
            <option value="in_progress">בביצוע</option>
            <option value="waiting_parts">ממתין לחלקים</option>
            <option value="completed">הושלם</option>
            <option value="cancelled">בוטל</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">סוג תקלה</label>
          <select value={String(form.failureType || "")} onChange={(e) => set("failureType", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="">— בחר —</option>
            <option value="מכני">מכני</option>
            <option value="חשמלי">חשמלי</option>
            <option value="הידראולי">הידראולי</option>
            <option value="פנאומטי">פנאומטי</option>
            <option value="בלאי">בלאי</option>
            <option value="קליברציה">קליברציה</option>
            <option value="תוכנה">תוכנה</option>
            <option value="חימום">חימום</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">מדווח</label>
          <input value={String(form.reportedBy || "")} onChange={(e) => set("reportedBy", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">אחראי</label>
          <input value={String(form.assignedTo || "")} onChange={(e) => set("assignedTo", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">תאריך מתוכנן</label>
          <input type="date" value={String(form.scheduledDate || "")} onChange={(e) => set("scheduledDate", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">שעות מוערכות</label>
          <input type="number" step="0.5" value={Number(form.estimatedHours || 0)} onChange={(e) => set("estimatedHours", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">שעות בפועל</label>
          <input type="number" step="0.5" value={Number(form.actualHours || 0)} onChange={(e) => set("actualHours", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">שעות השבתה</label>
          <input type="number" step="0.5" value={Number(form.downtimeHours || 0)} onChange={(e) => set("downtimeHours", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">עלות חלקים</label>
          <input type="number" value={Number(form.partsCost || 0)} onChange={(e) => set("partsCost", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">עלות עבודה</label>
          <input type="number" value={Number(form.laborCost || 0)} onChange={(e) => set("laborCost", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">עלות כוללת</label>
          <input type="number" value={Number(form.totalCost || 0)} onChange={(e) => set("totalCost", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">תיאור תקלה</label>
          <textarea value={String(form.failureDescription || "")} onChange={(e) => set("failureDescription", e.target.value)} rows={2} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">פתרון</label>
          <textarea value={String(form.solution || "")} onChange={(e) => set("solution", e.target.value)} rows={2} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">חלקים שנוצלו</label>
          <div className="flex items-center gap-2 mb-2">
            <input value={newPartName} onChange={(e) => setNewPartName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPart()} placeholder="שם חלק..." className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500" />
            <input type="number" min={1} value={newPartQty} onChange={(e) => setNewPartQty(Math.max(1, Number(e.target.value)))} className="w-20 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
            <button onClick={addPart} className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-zinc-200 text-sm"><Plus className="w-4 h-4" /></button>
          </div>
          <div className="space-y-1">
            {(form.partsUsed as { name: string; qty: number }[]).map((p, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded bg-zinc-800/60 border border-zinc-700/40">
                <span className="text-sm text-zinc-300 flex items-center gap-2"><Package className="w-3.5 h-3.5 text-zinc-500" />{p.name} <span className="text-zinc-500">x{p.qty}</span></span>
                <button onClick={() => removePart(i)} className="text-zinc-500 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">צ'ק ליסט</label>
          <div className="flex items-center gap-2 mb-2">
            <input value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addChecklistItem()} placeholder="הוסף משימה..." className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500" />
            <button onClick={addChecklistItem} className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-zinc-200 text-sm"><Plus className="w-4 h-4" /></button>
          </div>
          <div className="space-y-1">
            {(form.checklist as { task: string; done: boolean }[]).map((c, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded bg-zinc-800/60 border border-zinc-700/40">
                <span className="text-sm text-zinc-300">{c.task}</span>
                <button onClick={() => set("checklist", (form.checklist as { task: string; done: boolean }[]).filter((_x, idx) => idx !== i))} className="text-zinc-500 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-sm">ביטול</button>
        <button onClick={() => onSave(form)} disabled={saving || !form.title} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded-lg text-sm font-medium disabled:opacity-50">
          {saving ? "שומר..." : item ? "עדכן" : "צור"}
        </button>
      </div>
    </div>
  );
}

function AnalyticsTab({ dashboard }: { dashboard: Record<string, unknown> | undefined }) {
  if (!dashboard) return <div className="text-center py-12 text-zinc-400">טוען...</div>;

  const monthlyCosts = (Array.isArray(dashboard.monthlyCosts) ? dashboard.monthlyCosts : []) as Record<string, unknown>[];
  const failureTypes = (Array.isArray(dashboard.failureTypes) ? dashboard.failureTypes : []) as Record<string, unknown>[];
  const equipmentMtbf = (Array.isArray(dashboard.equipmentMtbf) ? dashboard.equipmentMtbf : []) as Record<string, unknown>[];
  const mtbf = Number(dashboard.mtbf || 0);
  const mttr = Number(dashboard.mttr || 0);
  const eq = (dashboard.equipment || {}) as Record<string, unknown>;
  const wo = (dashboard.workOrders || {}) as Record<string, unknown>;

  const availability = Number(eq.total_equipment || 0) > 0
    ? ((Number(eq.active || 0) / Number(eq.total_equipment || 1)) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="MTBF (ממוצע)" value={`${formatNum(mtbf, 0)} שעות`} icon={<TrendingUp className="w-5 h-5 text-cyan-400" />} color="bg-cyan-500/10" subtitle="זמן ממוצע בין תקלות" />
        <KpiCard title="MTTR (ממוצע)" value={`${formatNum(mttr)} שעות`} icon={<Timer className="w-5 h-5 text-purple-400" />} color="bg-purple-500/10" subtitle="זמן ממוצע לתיקון" />
        <KpiCard title="זמינות ציוד" value={`${availability}%`} icon={<Gauge className="w-5 h-5 text-emerald-400" />} color="bg-emerald-500/10" />
        <KpiCard title="השבתה חודשית" value={`${formatNum(Number(wo.monthly_downtime || 0), 0)} שעות`} icon={<Clock className="w-5 h-5 text-red-400" />} color="bg-red-500/10" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
          <h3 className="text-base font-semibold text-zinc-100 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            MTBF לפי ציוד (שעות)
          </h3>
          {equipmentMtbf.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={equipmentMtbf} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 10 }} />
                <YAxis dataKey="name" type="category" width={120} tick={{ fill: "#9ca3af", fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", direction: "rtl" }} />
                <Bar dataKey="mtbf_hours" fill="#3b82f6" name="MTBF (שעות)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-12">אין מספיק נתוני תקלות לחישוב MTBF</p>
          )}
        </div>

        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
          <h3 className="text-base font-semibold text-zinc-100 mb-4 flex items-center gap-2">
            <Timer className="w-5 h-5 text-purple-400" />
            MTTR לפי ציוד (שעות)
          </h3>
          {equipmentMtbf.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={equipmentMtbf} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 10 }} />
                <YAxis dataKey="name" type="category" width={120} tick={{ fill: "#9ca3af", fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", direction: "rtl" }} />
                <Bar dataKey="mttr_hours" fill="#8b5cf6" name="MTTR (שעות)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-12">אין מספיק נתונים</p>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
          <h3 className="text-base font-semibold text-zinc-100 mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-400" />
            מגמת עלויות תחזוקה (12 חודשים)
          </h3>
          {monthlyCosts.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={monthlyCosts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", direction: "rtl" }} />
                <Line type="monotone" dataKey="cost" stroke="#10b981" strokeWidth={2} dot={{ fill: "#10b981" }} name="עלות (₪)" />
                <Line type="monotone" dataKey="count" stroke="#f59e0b" strokeWidth={2} dot={{ fill: "#f59e0b" }} name="כמות קריאות" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-12">אין נתוני עלויות</p>
          )}
        </div>

        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
          <h3 className="text-base font-semibold text-zinc-100 mb-4 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-orange-400" />
            התפלגות סוגי תקלות
          </h3>
          {failureTypes.length > 0 ? (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="60%" height={250}>
                <RePieChart>
                  <Pie
                    data={failureTypes.map((f, i) => ({ name: String(f.type), value: Number(f.count), fill: CHART_COLORS[i % CHART_COLORS.length] }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={80}
                    dataKey="value"
                  >
                    {failureTypes.map((_f, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", direction: "rtl" }} />
                </RePieChart>
              </ResponsiveContainer>
              <div className="space-y-2 flex-1">
                {failureTypes.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="text-zinc-300 truncate">{String(f.type)}</span>
                    <span className="text-zinc-500 mr-auto">{String(f.count)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-12">אין נתוני תקלות</p>
          )}
        </div>
      </div>

      {equipmentMtbf.length > 0 && (
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
          <h3 className="text-base font-semibold text-zinc-100 mb-4">סקירת אמינות ציוד</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700/60">
                  <th className="text-right px-4 py-2 text-xs text-zinc-400 font-medium">ציוד</th>
                  <th className="text-right px-4 py-2 text-xs text-zinc-400 font-medium">מספר</th>
                  <th className="text-right px-4 py-2 text-xs text-zinc-400 font-medium">תקלות</th>
                  <th className="text-right px-4 py-2 text-xs text-zinc-400 font-medium">MTBF (שעות)</th>
                  <th className="text-right px-4 py-2 text-xs text-zinc-400 font-medium">MTTR (שעות)</th>
                  <th className="text-right px-4 py-2 text-xs text-zinc-400 font-medium">זמינות</th>
                </tr>
              </thead>
              <tbody>
                {equipmentMtbf.map((eq, i) => {
                  const mtbfH = Number(eq.mtbf_hours || 0);
                  const mttrH = Number(eq.mttr_hours || 0);
                  const avail = mtbfH > 0 ? ((mtbfH / (mtbfH + mttrH)) * 100).toFixed(1) : "—";
                  return (
                    <tr key={i} className="border-b border-zinc-800/60 hover:bg-zinc-800/30">
                      <td className="px-4 py-2 text-zinc-200">{String(eq.name)}</td>
                      <td className="px-4 py-2 font-mono text-xs text-zinc-400">{String(eq.equipment_number)}</td>
                      <td className="px-4 py-2 text-zinc-300">{String(eq.failure_count)}</td>
                      <td className="px-4 py-2 text-zinc-300">{formatNum(mtbfH, 0)}</td>
                      <td className="px-4 py-2 text-zinc-300">{formatNum(mttrH)}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs font-medium ${Number(avail) >= 95 ? "text-emerald-400" : Number(avail) >= 85 ? "text-amber-400" : "text-red-400"}`}>
                          {avail}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
