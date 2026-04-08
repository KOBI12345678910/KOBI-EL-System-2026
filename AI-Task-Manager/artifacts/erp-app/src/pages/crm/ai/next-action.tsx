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
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import {
  Target, Brain, Phone, Mail, Calendar, FileText, CheckCircle, Clock,
  Star, Zap, Search, ArrowUpDown, Eye, X, AlertTriangle, BarChart3
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);

interface Action {
  id: number;
  customer?: string;
  company?: string;
  score?: number;
  action?: string;
  urgency?: string;
  reason?: string;
  timeframe?: string;
  probability?: number;
  value?: number;
  status?: string;
  created_at?: string;
}

const urgencyMap: Record<string, { label: string; color: string }> = {
  now: { label: "עכשיו", color: "bg-red-500/20 text-red-400" },
  today: { label: "היום", color: "bg-amber-500/20 text-amber-400" },
  tomorrow: { label: "מחר", color: "bg-blue-500/20 text-blue-400" },
  this_week: { label: "השבוע", color: "bg-green-500/20 text-green-400" },
};

const statusMap: Record<string, { label: string; color: string }> = {
  pending: { label: "ממתין", color: "bg-yellow-500/20 text-yellow-400" },
  completed: { label: "הושלם", color: "bg-green-500/20 text-green-400" },
  skipped: { label: "דולג", color: "bg-muted/20 text-muted-foreground" },
  in_progress: { label: "בביצוע", color: "bg-blue-500/20 text-blue-400" },
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}
    </div>
  );
}

export default function NextActionPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<Action[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterUrgency, setFilterUrgency] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<Action | null>(null);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemsRes, statsRes] = await Promise.all([
        authFetch(`${API}/crm/ai/next-action`),
        authFetch(`${API}/crm/ai/next-action/stats`),
      ]);
      if (itemsRes.ok) setItems(safeArray(await itemsRes.json()));
      if (statsRes.ok) setStats((await statsRes.json()) || {});
    } catch (e: any) {
      setError(e.message || "שגיאה בטעינת נתונים");
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterUrgency === "all" || i.urgency === filterUrgency) &&
      (filterStatus === "all" || i.status === filterStatus) &&
      (!search || [i.customer, i.company, i.action, i.reason]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterUrgency, filterStatus, sortField, sortDir]);

  const kpis = [
    { label: "פעולות ממתינות", value: fmt(stats.pending || 0), icon: Target, color: "text-amber-400" },
    { label: "הושלמו היום", value: fmt(stats.completed_today || 0), icon: CheckCircle, color: "text-green-400" },
    { label: "ערך בסיכון", value: fmtC(stats.value_at_risk || 0), icon: AlertTriangle, color: "text-red-400" },
    { label: "דיוק המלצות", value: `${Number(stats.accuracy || 88).toFixed(0)}%`, icon: Brain, color: "text-purple-400" },
    { label: "ציון ממוצע", value: fmt(stats.avg_score || 0), icon: Star, color: "text-yellow-400" },
    { label: "סה\"כ פעולות", value: fmt(stats.total || items.length), icon: BarChart3, color: "text-cyan-400" },
  ];

  const columns = [
    { key: "customer", label: "לקוח" },
    { key: "action", label: "פעולה מומלצת" },
    { key: "urgency", label: "דחיפות" },
    { key: "score", label: "ציון" },
    { key: "probability", label: "הסתברות" },
    { key: "value", label: "ערך" },
    { key: "status", label: "סטטוס" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Target className="text-amber-400 w-6 h-6" />
            Next Best Action
          </h1>
          <p className="text-sm text-muted-foreground mt-1">AI ממליץ על הפעולה הבאה האידיאלית לכל לקוח בזמן הנכון</p>
        </div>
        <ExportDropdown data={filtered} headers={{ customer: "לקוח", action: "פעולה", urgency: "דחיפות", score: "ציון", probability: "הסתברות", value: "ערך", status: "סטטוס" }} filename="next_best_action" />
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

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי לקוח, פעולה..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterUrgency} onChange={e => setFilterUrgency(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל רמות הדחיפות</option>
          {Object.entries(urgencyMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={() => setSelectedIds([])} entityName="next-action" actions={defaultBulkActions(selectedIds, () => setSelectedIds([]), load, `${API}/crm/ai/next-action`)} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">שגיאה בטעינה</p><p className="text-sm mt-1">{error}</p>
          <button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Target className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין המלצות פעולה</p>
          <p className="text-sm mt-1">{search ? "נסה לשנות את הסינון" : "המלצות יופיעו כאשר ה-AI ינתח את הנתונים"}</p>
        </div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  {columns.map(col => (
                    <th key={col.key} onClick={() => toggleSort(col.key)}
                      className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                      <div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginate(filtered).map(r => (
                  <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3"><div className="font-medium text-foreground">{r.customer || "—"}</div><div className="text-xs text-muted-foreground">{r.company || ""}</div></td>
                    <td className="px-4 py-3 text-amber-400 font-medium">{r.action || "—"}</td>
                    <td className="px-4 py-3"><Badge className={`text-[10px] ${urgencyMap[r.urgency || ""]?.color || "bg-muted/20 text-muted-foreground"}`}>{urgencyMap[r.urgency || ""]?.label || r.urgency || "—"}</Badge></td>
                    <td className="px-4 py-3"><span className={`font-bold ${(r.score || 0) >= 80 ? "text-green-400" : (r.score || 0) >= 60 ? "text-amber-400" : "text-muted-foreground"}`}>{r.score || 0}</span></td>
                    <td className="px-4 py-3 text-blue-400">{r.probability ? `${r.probability}%` : "—"}</td>
                    <td className="px-4 py-3 text-green-400 font-medium">{r.value ? fmtC(r.value) : "—"}</td>
                    <td className="px-4 py-3"><Badge className={`text-[10px] ${statusMap[r.status || ""]?.color || "bg-muted/20 text-muted-foreground"}`}>{statusMap[r.status || ""]?.label || r.status || "—"}</Badge></td>
                    <td className="px-4 py-3"><button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <SmartPagination pagination={pagination} />
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Target className="w-5 h-5 text-amber-400" />{viewDetail.customer} — {viewDetail.action}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="לקוח" value={viewDetail.customer} />
                <DetailField label="חברה" value={viewDetail.company} />
                <DetailField label="פעולה מומלצת" value={viewDetail.action} />
                <DetailField label="דחיפות"><Badge className={urgencyMap[viewDetail.urgency || ""]?.color}>{urgencyMap[viewDetail.urgency || ""]?.label || viewDetail.urgency}</Badge></DetailField>
                <DetailField label="ציון AI" value={String(viewDetail.score || 0)} />
                <DetailField label="הסתברות סגירה" value={viewDetail.probability ? `${viewDetail.probability}%` : undefined} />
                <DetailField label="ערך עסקה" value={viewDetail.value ? fmtC(viewDetail.value) : undefined} />
                <DetailField label="מסגרת זמן" value={viewDetail.timeframe} />
                <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status || ""]?.color}>{statusMap[viewDetail.status || ""]?.label || viewDetail.status}</Badge></DetailField>
                <div className="col-span-2"><DetailField label="סיבה / נימוק AI" value={viewDetail.reason} /></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end">
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ActivityLog entityType="next-action" entityId="all" />
        <RelatedRecords entityType="next-action" entityId="all" />
      </div>
    </div>
  );
}
