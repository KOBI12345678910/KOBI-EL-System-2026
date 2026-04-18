import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  BarChart3, TrendingUp, Clock, DollarSign, Target, CheckCircle2,
  AlertTriangle, Filter, X, ChevronDown, Users, Calendar,
  FolderKanban, Activity
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api";
const safeArr = (d: any) => Array.isArray(d) ? d : (d?.projects || d?.data || []);

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "on-hold": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
  cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
};

const HEALTH_ICONS: Record<string, any> = {
  ok: <CheckCircle2 size={12} className="text-emerald-400" />,
  warning: <AlertTriangle size={12} className="text-amber-400" />,
  over: <AlertTriangle size={12} className="text-red-400" />,
  late: <AlertTriangle size={12} className="text-red-400" />,
};

function HealthBadge({ health, label }: { health: string; label: string }) {
  const colors: Record<string, string> = {
    ok: "bg-emerald-500/20 text-emerald-400",
    warning: "bg-amber-500/20 text-amber-400",
    over: "bg-red-500/20 text-red-400",
    late: "bg-red-500/20 text-red-400",
  };
  return (
    <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${colors[health] || "bg-gray-500/20 text-gray-400"}`}>
      {HEALTH_ICONS[health]}
      {label}
    </span>
  );
}

function ProjectCard({ p }: { p: any }) {
  const budgetPct = p.budget > 0 ? Math.min((p.spent / p.budget) * 100, 200) : 0;
  const completion = parseFloat(p.completion_pct || "0");
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-background border border-border rounded-xl p-4 hover:border-border transition-all"
    >
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="font-semibold text-foreground text-sm">{p.project_name || p.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{p.customer_name || p.client || "—"}</div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs border ${STATUS_COLORS[p.status] || "bg-gray-500/20 text-gray-400 border-gray-500/30"}`}>
          {p.status}
        </span>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted-foreground">השלמה</span>
          <span className="text-foreground font-medium">{completion.toFixed(0)}%</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${Math.min(completion, 100)}%` }}
          />
        </div>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted-foreground">תקציב</span>
          <span className={`font-medium ${budgetPct > 110 ? "text-red-400" : budgetPct > 90 ? "text-amber-400" : "text-emerald-400"}`}>
            {budgetPct.toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${budgetPct > 110 ? "bg-red-500" : budgetPct > 90 ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${Math.min(budgetPct, 100)}%` }}
          />
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <HealthBadge health={p.budget_health} label="תקציב" />
        <HealthBadge health={p.schedule_health} label="לוח זמנים" />
        {p.open_tasks > 0 && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-400">
            <Clock size={10} />
            {p.open_tasks} משימות
          </span>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-border/60 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div>
          <span className="block">תקציב</span>
          <span className="text-foreground font-medium">₪{Number(p.budget || 0).toLocaleString()}</span>
        </div>
        <div>
          <span className="block">מנהל</span>
          <span className="text-foreground font-medium">{p.manager_name || p.owner || "—"}</span>
        </div>
      </div>
    </motion.div>
  );
}

function ResourceHeatmap() {
  const { data } = useQuery({
    queryKey: ["portfolio-resource-heatmap"],
    queryFn: async () => { const r = await authFetch(`${API}/portfolio-resource-heatmap`); return r.json(); },
  });

  const weeks: string[] = data?.weeks || [];
  const resources: any[] = data?.resources || [];

  if (!resources.length) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        אין נתוני ניצולת משאבים להצגה
      </div>
    );
  }

  const getColor = (pct: number) => {
    if (pct === 0) return "bg-muted";
    if (pct <= 60) return "bg-emerald-500/40";
    if (pct <= 100) return "bg-blue-500/60";
    if (pct <= 130) return "bg-amber-500/70";
    return "bg-red-500/80";
  };

  return (
    <div className="overflow-x-auto">
      <table className="text-xs w-full min-w-[600px]">
        <thead>
          <tr>
            <th className="text-right text-muted-foreground font-medium py-2 pr-3 min-w-[140px]">משאב</th>
            {weeks.map(w => (
              <th key={w} className="text-center text-muted-foreground font-medium py-2 px-1 min-w-[50px]">
                {w.slice(5, 10)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {resources.map((r: any) => (
            <tr key={r.name}>
              <td className="text-foreground pr-3 py-1.5 font-medium truncate max-w-[140px]">{r.name}</td>
              {weeks.map(w => {
                const pct = r.weeks[w] || 0;
                return (
                  <td key={w} className="px-1 py-1.5 text-center">
                    <div
                      title={`${pct}%`}
                      className={`w-8 h-6 mx-auto rounded-sm ${getColor(pct)} flex items-center justify-center`}
                    >
                      {pct > 0 && <span className="text-[9px] text-foreground font-bold">{Math.round(pct)}</span>}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-muted inline-block" />0%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500/40 inline-block" />1-60%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-500/60 inline-block" />61-100%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-500/70 inline-block" />101-130%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500/80 inline-block" />&gt;130%</span>
      </div>
    </div>
  );
}

const SORT_OPTIONS = [
  { value: "created_at", label: "תאריך יצירה" },
  { value: "name", label: "שם פרויקט" },
  { value: "start_date", label: "תאריך התחלה" },
  { value: "end_date", label: "תאריך סיום" },
  { value: "status", label: "סטטוס" },
  { value: "completion_pct", label: "% השלמה" },
  { value: "manager", label: "מנהל" },
  { value: "customer", label: "לקוח" },
];

export default function PortfolioDashboardPage() {
  const [tab, setTab] = useState<"grid" | "heatmap">("grid");
  const [filters, setFilters] = useState<any>({});
  const [showFilters, setShowFilters] = useState(false);
  const [tempFilters, setTempFilters] = useState<any>({});
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"ASC" | "DESC">("DESC");

  const params = new URLSearchParams();
  if (filters.manager) params.set("manager", filters.manager);
  if (filters.customer) params.set("customer", filters.customer);
  if (filters.type) params.set("type", filters.type);
  if (filters.status) params.set("status", filters.status);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  params.set("sortBy", sortBy);
  params.set("sortDir", sortDir);

  const { data: portfolio } = useQuery({
    queryKey: ["portfolio-dashboard", filters, sortBy, sortDir],
    queryFn: async () => {
      const r = await authFetch(`${API}/portfolio-dashboard?${params.toString()}`);
      return r.json();
    },
  });

  const { data: kpis } = useQuery({
    queryKey: ["portfolio-kpis"],
    queryFn: async () => { const r = await authFetch(`${API}/portfolio-kpis`); return r.json(); },
  });

  const projects = safeArr(portfolio);
  const kpiData = kpis || { total: 0, active: 0, onTimeRate: 100, onBudgetRate: 100, avgCompletion: 0, totalRevenuePipeline: 0 };

  const applyFilters = () => {
    setFilters({ ...tempFilters });
    setShowFilters(false);
  };

  const clearFilters = () => {
    setFilters({});
    setTempFilters({});
    setShowFilters(false);
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FolderKanban className="text-blue-400" size={28} />
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-foreground">דשבורד תיק פרויקטים</h1>
            <p className="text-xs text-muted-foreground mt-0.5">סקירה כוללת של כל הפרויקטים</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground"
          >
            {SORT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          <button
            onClick={() => setSortDir(d => d === "ASC" ? "DESC" : "ASC")}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm bg-muted border border-border text-gray-300"
            title={sortDir === "ASC" ? "סדר עולה" : "סדר יורד"}
          >
            <ChevronDown size={14} className={`transition-transform ${sortDir === "ASC" ? "rotate-180" : ""}`} />
          </button>
          <button
            onClick={() => { setTempFilters({ ...filters }); setShowFilters(s => !s); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${activeFilterCount > 0 ? "bg-blue-600/20 text-blue-400 border-blue-500/30" : "bg-muted text-gray-300 border-border"}`}
          >
            <Filter size={14} />
            סינון
            {activeFilterCount > 0 && <span className="bg-blue-500 text-foreground text-xs rounded-full px-1.5">{activeFilterCount}</span>}
          </button>
        </div>
      </div>

      {showFilters && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-background border border-border rounded-xl p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { key: "manager", label: "מנהל פרויקט", type: "text" },
              { key: "customer", label: "לקוח", type: "text" },
              { key: "type", label: "סוג", type: "text" },
              { key: "status", label: "סטטוס", type: "select", options: ["planning", "active", "on-hold", "completed", "cancelled"] },
              { key: "dateFrom", label: "מתאריך", type: "date" },
              { key: "dateTo", label: "עד תאריך", type: "date" },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs text-muted-foreground mb-1 block">{f.label}</label>
                {f.type === "select" ? (
                  <select
                    value={tempFilters[f.key] || ""}
                    onChange={e => setTempFilters({ ...tempFilters, [f.key]: e.target.value })}
                    className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                  >
                    <option value="">הכל</option>
                    {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    type={f.type}
                    value={tempFilters[f.key] || ""}
                    onChange={e => setTempFilters({ ...tempFilters, [f.key]: e.target.value })}
                    className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={applyFilters} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm">
              החל סינון
            </button>
            <button onClick={clearFilters} className="px-4 py-2 bg-muted hover:bg-muted text-gray-300 rounded-lg text-sm">
              נקה
            </button>
          </div>
        </motion.div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "סה\"כ פרויקטים", value: kpiData.total, icon: FolderKanban, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
          { label: "פרויקטים פעילים", value: kpiData.active, icon: Activity, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
          { label: "בזמן", value: `${kpiData.onTimeRate}%`, icon: Clock, color: "text-sky-400", bg: "bg-sky-500/10 border-sky-500/20" },
          { label: "בתקציב", value: `${kpiData.onBudgetRate}%`, icon: DollarSign, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
          { label: "השלמה ממוצעת", value: `${kpiData.avgCompletion}%`, icon: Target, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
          { label: "צינור הכנסות", value: `₪${Number((kpiData.totalRevenuePipeline || 0) / 1000).toFixed(0)}K`, icon: TrendingUp, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
        ].map((k, i) => (
          <div key={i} className={`${k.bg} border rounded-xl p-3 text-center`}>
            <k.icon className={`${k.color} mx-auto mb-1.5`} size={20} />
            <div className={`text-lg font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([["grid", "כרטיסי פרויקטים", BarChart3], ["heatmap", "מפת ניצולת משאבים", Users]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key as any)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === key ? "border-blue-500 text-blue-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {tab === "grid" && (
        <div>
          <div className="text-xs text-muted-foreground mb-3">{projects.length} פרויקטים</div>
          {projects.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FolderKanban size={40} className="mx-auto mb-3 opacity-30" />
              <p>אין פרויקטים להצגה</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {projects.map((p: any) => <ProjectCard key={p.id} p={p} />)}
            </div>
          )}
        </div>
      )}

      {tab === "heatmap" && (
        <div className="bg-background border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Users size={16} className="text-blue-400" />
            מפת ניצולת משאבים לפי שבוע
          </h2>
          <ResourceHeatmap />
        </div>
      )}
    </div>
  );
}
