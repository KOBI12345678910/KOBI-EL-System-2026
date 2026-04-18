import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import {
  Filter, Plus, X, Search, BarChart3, Users, Target, Star,
  ArrowUpDown, Eye, AlertTriangle, Zap, TrendingUp
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || d?.leads || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);

type FilterCondition = { field: string; op: string; value: string };

const FIELDS_OPTIONS = ["שם לקוח", "ערך עסקה", "סטטוס ליד", "מקור", "עיר", "תאריך יצירה", "מנהל תיק", "ציון AI"];
const OPS = { string: ["מכיל", "לא מכיל", "שווה ל", "מתחיל ב"], number: ["גדול מ", "קטן מ", "שווה ל", "בין"], date: ["אחרי", "לפני", "בין"] };

const categoryMap: Record<string, { label: string; color: string }> = {
  hot: { label: "חם", color: "bg-red-500/20 text-red-400" },
  warm: { label: "פושר", color: "bg-amber-500/20 text-amber-400" },
  cold: { label: "קר", color: "bg-blue-500/20 text-blue-400" },
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}
    </div>
  );
}

export default function FiltersPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [filters, setFilters] = useState<FilterCondition[]>([
    { field: "ציון AI", op: "גדול מ", value: "70" },
    { field: "סטטוס ליד", op: "שווה ל", value: "חם" },
  ]);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const pagination = useSmartPagination(25);

  const addFilter = () => setFilters(prev => [...prev, { field: FIELDS_OPTIONS[0], op: "מכיל", value: "" }]);
  const removeFilter = (i: number) => setFilters(prev => prev.filter((_, fi) => fi !== i));
  const updateFilter = (i: number, field: keyof FilterCondition, val: string) => setFilters(prev => prev.map((f, fi) => fi === i ? { ...f, [field]: val } : f));

  const applyFilters = async () => {
    setLoading(true);
    setSearched(true);
    setError(null);
    try {
      const res = await authFetch(`${API}/crm/leads/scored`);
      const d = await res.json();
      let leads = d.leads || safeArray(d);
      for (const f of filters) {
        if (!f.value.trim()) continue;
        leads = leads.filter((lead: any) => {
          if (f.field === "ציון AI") {
            const val = Number(f.value);
            if (f.op === "גדול מ") return lead.score > val;
            if (f.op === "קטן מ") return lead.score < val;
            if (f.op === "שווה ל") return lead.score === val;
          }
          if (f.field === "סטטוס ליד") {
            const sm: Record<string, string> = { "חם": "hot", "פושר": "warm", "קר": "cold" };
            if (f.op === "שווה ל") return lead.category === (sm[f.value] || f.value);
          }
          if (f.field === "שם לקוח") {
            if (f.op === "מכיל") return lead.name?.includes(f.value);
            if (f.op === "שווה ל") return lead.name === f.value;
          }
          if (f.field === "מקור") {
            if (f.op === "שווה ל") return lead.source === f.value;
            if (f.op === "מכיל") return lead.source?.includes(f.value);
          }
          return true;
        });
      }
      setResults(leads);
    } catch (e: any) {
      setError(e.message || "שגיאה");
      setResults([]);
    }
    setLoading(false);
  };

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let data = results.filter(r =>
      !search || [r.name, r.company, r.source].some(f => f?.toLowerCase().includes(search.toLowerCase()))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [results, search, sortField, sortDir]);

  const hotCount = results.filter(r => r.category === "hot").length;
  const warmCount = results.filter(r => r.category === "warm").length;
  const avgScore = results.length > 0 ? Math.round(results.reduce((s, r) => s + (r.score || 0), 0) / results.length) : 0;

  const kpis = [
    { label: "תוצאות", value: fmt(results.length), icon: BarChart3, color: "text-blue-400" },
    { label: "לידים חמים", value: fmt(hotCount), icon: Zap, color: "text-red-400" },
    { label: "לידים פושרים", value: fmt(warmCount), icon: TrendingUp, color: "text-amber-400" },
    { label: "ציון ממוצע", value: fmt(avgScore), icon: Star, color: "text-purple-400" },
    { label: "תנאי סינון", value: fmt(filters.length), icon: Filter, color: "text-cyan-400" },
    { label: "שדות זמינים", value: fmt(FIELDS_OPTIONS.length), icon: Target, color: "text-emerald-400" },
  ];

  const QUICK = [
    { label: "לידים חמים", filters: [{ field: "סטטוס ליד", op: "שווה ל", value: "חם" }] },
    { label: "ציון AI מעל 80", filters: [{ field: "ציון AI", op: "גדול מ", value: "80" }] },
    { label: "ציון AI מעל 70", filters: [{ field: "ציון AI", op: "גדול מ", value: "70" }] },
    { label: "לידים פושרים", filters: [{ field: "סטטוס ליד", op: "שווה ל", value: "פושר" }] },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Filter className="text-rose-400 w-6 h-6" />
            Advanced Filters
          </h1>
          <p className="text-sm text-muted-foreground mt-1">סינון מתקדם רב-ממדי — בנה שאילתות מורכבות בקלות</p>
        </div>
        <ExportDropdown data={filtered} headers={{ name: "שם", company: "חברה", source: "מקור", score: "ציון", category: "קטגוריה", budget: "תקציב" }} filename="filtered_leads" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} />
            <div className="text-xl font-bold text-foreground">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="bg-card border border-border/50 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-foreground flex items-center gap-2"><Filter className="w-4 h-4 text-rose-400" /> תנאי סינון</h3>
          <button onClick={addFilter} className="flex items-center gap-1 text-xs px-3 py-1.5 bg-primary/20 text-primary rounded-lg"><Plus className="w-3.5 h-3.5" /> הוסף תנאי</button>
        </div>
        <div className="space-y-2">
          {filters.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-10 text-center flex-shrink-0">{i === 0 ? "WHERE" : "AND"}</span>
              <select value={f.field} onChange={e => updateFilter(i, "field", e.target.value)} className="bg-muted border border-border rounded-lg px-3 py-2 text-sm flex-1">{FIELDS_OPTIONS.map(opt => <option key={opt}>{opt}</option>)}</select>
              <select value={f.op} onChange={e => updateFilter(i, "op", e.target.value)} className="bg-muted border border-border rounded-lg px-3 py-2 text-sm flex-shrink-0">{[...OPS.string, ...OPS.number].map(op => <option key={op}>{op}</option>)}</select>
              <input value={f.value} onChange={e => updateFilter(i, "value", e.target.value)} className="bg-muted border border-border rounded-lg px-3 py-2 text-sm flex-1" placeholder="ערך..." />
              <button onClick={() => removeFilter(i)} className="p-1.5 hover:bg-red-500/20 rounded-lg text-red-400 flex-shrink-0"><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-3 items-center flex-wrap">
          <button onClick={applyFilters} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm">
            <Search className="w-4 h-4" /> {loading ? "מסנן..." : "הפעל סינון"}
          </button>
          {QUICK.map((q, i) => (
            <button key={i} onClick={() => { setFilters(q.filters); }} className="text-xs px-3 py-1.5 rounded-lg bg-muted text-muted-foreground border border-border hover:text-foreground">{q.label}</button>
          ))}
        </div>
      </div>

      {searched && (
        <>
          <div className="flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש בתוצאות..."
                className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <span className="text-sm text-muted-foreground">{filtered.length} תוצאות | סוננו לפי {filters.filter(f => f.value.trim()).length} תנאים</span>
          </div>

          {error ? (
            <div className="text-center py-16 text-red-400">
              <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">שגיאה</p><p className="text-sm mt-1">{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Filter className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">אין תוצאות</p>
              <p className="text-sm mt-1">נסה לשנות את תנאי הסינון</p>
            </div>
          ) : (<>
            <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b border-border/50">
                    <tr>
                      {[{ key: "name", label: "שם" }, { key: "company", label: "חברה" }, { key: "source", label: "מקור" }, { key: "score", label: "ציון AI" }, { key: "category", label: "קטגוריה" }, { key: "budget", label: "תקציב" }].map(col => (
                        <th key={col.key} onClick={() => toggleSort(col.key)}
                          className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                          <div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div>
                        </th>
                      ))}
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagination.paginate(filtered).map((r, idx) => (
                      <tr key={r.id || idx} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground">{r.name || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.company || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.source || "—"}</td>
                        <td className="px-4 py-3"><span className={`font-bold ${(r.score || 0) >= 80 ? "text-green-400" : (r.score || 0) >= 60 ? "text-amber-400" : "text-muted-foreground"}`}>{r.score || 0}</span></td>
                        <td className="px-4 py-3"><Badge className={`text-[10px] ${categoryMap[r.category]?.color || "bg-muted/20 text-muted-foreground"}`}>{categoryMap[r.category]?.label || r.category || "—"}</Badge></td>
                        <td className="px-4 py-3 text-green-400">{r.budget > 0 ? fmtC(r.budget) : "—"}</td>
                        <td className="px-4 py-3"><button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <SmartPagination pagination={pagination} />
          </>)}
        </>
      )}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{viewDetail.name}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="שם" value={viewDetail.name} />
                <DetailField label="חברה" value={viewDetail.company} />
                <DetailField label="מקור" value={viewDetail.source} />
                <DetailField label="ציון AI" value={String(viewDetail.score || 0)} />
                <DetailField label="קטגוריה"><Badge className={categoryMap[viewDetail.category]?.color}>{categoryMap[viewDetail.category]?.label || viewDetail.category}</Badge></DetailField>
                <DetailField label="תקציב" value={viewDetail.budget > 0 ? fmtC(viewDetail.budget) : undefined} />
              </div>
              <div className="p-5 border-t border-border flex justify-end">
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="filters" entityId="all" />
        <RelatedRecords entityType="filters" entityId="all" />
      </div>
    </div>
  );
}