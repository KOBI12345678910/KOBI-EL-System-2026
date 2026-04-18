import { useState, useEffect, useMemo } from "react";
import {
  Users, Search, Filter, RefreshCw, ArrowUpDown, UserCheck, UserX,
  AlertTriangle, Activity, Briefcase
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const roleLabels: Record<string, string> = {
  developer: "מפתח",
  designer: "מעצב",
  pm: "מנהל פרויקט",
  qa: "QA",
  devops: "DevOps",
  analyst: "אנליסט",
  architect: "ארכיטקט",
  consultant: "יועץ",
};

function UtilizationBar({ pct }: { pct: number }) {
  const clampedPct = Math.min(pct, 150);
  const barWidth = Math.min(pct, 100);
  const overflowWidth = pct > 100 ? Math.min(pct - 100, 50) : 0;
  const color = pct > 100 ? "bg-red-500" : pct >= 80 ? "bg-yellow-500" : "bg-emerald-500";
  const textColor = pct > 100 ? "text-red-400" : pct >= 80 ? "text-yellow-400" : "text-emerald-400";

  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-4 bg-muted/50 rounded-full overflow-hidden relative">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.min(barWidth, 100)}%` }} />
        {overflowWidth > 0 && (
          <div className="absolute top-0 right-0 h-full bg-red-500/40 rounded-full animate-pulse"
            style={{ width: `${(overflowWidth / 50) * 100}%` }} />
        )}
      </div>
      <span className={`text-xs font-bold w-12 text-left ${textColor}`}>{pct}%</span>
    </div>
  );
}

function AllocationHeatCell({ value }: { value: number }) {
  const bg = value > 100 ? "bg-red-500/30 text-red-300" :
    value >= 80 ? "bg-yellow-500/20 text-yellow-300" :
    value >= 50 ? "bg-emerald-500/20 text-emerald-300" :
    value > 0 ? "bg-blue-500/10 text-blue-300" : "bg-muted/30 text-gray-500";
  return (
    <td className={`px-3 py-2 text-center text-xs font-medium ${bg} transition-colors`}>
      {value > 0 ? `${value}%` : "—"}
    </td>
  );
}

export default function ResourcePlanningPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("allocation_pct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/projects-sap/resource-planning`);
      if (res.ok) setItems(safeArray(await res.json()));
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let arr = [...items];
    if (search) {
      const s = search.toLowerCase();
      arr = arr.filter(i => (i.resource_name || "").toLowerCase().includes(s) || (i.project_name || "").toLowerCase().includes(s));
    }
    if (filterType !== "all") arr = arr.filter(i => i.role === filterType || i.resource_type === filterType);
    if (filterStatus === "overloaded") arr = arr.filter(i => (i.allocation_pct || 0) > 100);
    else if (filterStatus === "optimal") arr = arr.filter(i => (i.allocation_pct || 0) >= 80 && (i.allocation_pct || 0) <= 100);
    else if (filterStatus === "available") arr = arr.filter(i => (i.allocation_pct || 0) < 80);

    arr.sort((a, b) => {
      const av = a[sortField], bv = b[sortField];
      const cmp = typeof av === "number" ? av - bv : String(av || "").localeCompare(String(bv || ""), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [items, search, filterType, filterStatus, sortField, sortDir]);

  const kpi = useMemo(() => {
    const total = items.length;
    const allocated = items.filter(i => (i.allocation_pct || 0) > 0).length;
    const overloaded = items.filter(i => (i.allocation_pct || 0) > 100).length;
    const available = items.filter(i => (i.allocation_pct || 0) < 80).length;
    return { total, allocated, overloaded, available };
  }, [items]);

  const kpis = [
    { icon: Users, label: 'סה"כ משאבים', value: fmt(kpi.total), color: "from-blue-600 to-blue-800" },
    { icon: UserCheck, label: "מוקצים", value: fmt(kpi.allocated), color: "from-purple-600 to-purple-800" },
    { icon: AlertTriangle, label: "עומס יתר", value: fmt(kpi.overloaded), color: "from-red-600 to-red-800" },
    { icon: UserX, label: "פנויים", value: fmt(kpi.available), color: "from-emerald-600 to-emerald-800" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">תכנון משאבים</h1>
        <button onClick={load} className="p-2 rounded-lg bg-muted hover:bg-muted text-gray-300">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <div key={i} className={`rounded-xl bg-gradient-to-br ${k.color} p-4 border border-white/10`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-foreground/70">{k.label}</div>
                <div className="text-2xl font-bold text-foreground mt-1">{k.value}</div>
              </div>
              <k.icon className="w-8 h-8 text-foreground/30" />
            </div>
          </div>
        ))}
      </div>

      {/* Utilization Summary */}
      <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
        <h2 className="text-sm font-medium text-gray-300 mb-3">מפת ניצולת</h2>
        <div className="flex gap-4 text-xs">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500" /> מעל 100% - עומס יתר</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500" /> 80-100% - אופטימלי</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500" /> מתחת 80% - פנוי</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="חיפוש משאב או פרויקט..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pr-10 pl-3 py-2 rounded-lg border border-border bg-muted/50 text-foreground text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-gray-400" />
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground text-sm">
            <option value="all">כל הסוגים</option>
            {Object.entries(roleLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground text-sm">
            <option value="all">כל הסטטוסים</option>
            <option value="overloaded">עומס יתר (&gt;100%)</option>
            <option value="optimal">אופטימלי (80-100%)</option>
            <option value="available">פנוי (&lt;80%)</option>
          </select>
        </div>
        <span className="text-sm text-gray-400">{filtered.length} משאבים</span>
      </div>

      {/* Heatmap-style Resource Table */}
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr>
                {[
                  { key: "resource_name", label: "שם משאב" },
                  { key: "role", label: "תפקיד" },
                  { key: "project_name", label: "פרויקט" },
                  { key: "allocation_pct", label: "הקצאה %" },
                  { key: "planned_hours", label: "שעות מתוכננות" },
                  { key: "actual_hours", label: "שעות בפועל" },
                  { key: "utilization", label: "ניצולת" },
                ].map(col => (
                  <th key={col.key} onClick={() => toggleSort(col.key)}
                    className="px-4 py-3 text-right font-medium text-gray-300 cursor-pointer hover:text-foreground whitespace-nowrap">
                    <div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3 opacity-40" /></div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">טוען נתונים...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">לא נמצאו משאבים</td></tr>
              ) : filtered.map((item, idx) => {
                const alloc = item.allocation_pct || 0;
                const rowBg = alloc > 100 ? "bg-red-500/5" : alloc >= 80 ? "bg-yellow-500/5" : "";
                return (
                  <tr key={item.id || idx} className={`hover:bg-muted/30 transition-colors ${rowBg}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${alloc > 100 ? "bg-red-500" : alloc >= 80 ? "bg-yellow-500" : "bg-emerald-500"}`} />
                        <span className="text-foreground font-medium">{item.resource_name || "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className="bg-gray-500/20 text-gray-300 border border-border text-xs">
                        {roleLabels[item.role] || item.role || "—"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{item.project_name || "—"}</td>
                    <td className="px-4 py-3 min-w-[180px]">
                      <UtilizationBar pct={alloc} />
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-center">{item.planned_hours ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-400 text-center">{item.actual_hours ?? "—"}</td>
                    <td className="px-4 py-3 min-w-[120px]">
                      {item.actual_hours && item.planned_hours ? (
                        <div className="flex items-center gap-1">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${(item.actual_hours / item.planned_hours) > 1 ? "bg-red-500" : "bg-blue-500"}`}
                              style={{ width: `${Math.min((item.actual_hours / item.planned_hours) * 100, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400">{Math.round((item.actual_hours / item.planned_hours) * 100)}%</span>
                        </div>
                      ) : <span className="text-gray-500">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
