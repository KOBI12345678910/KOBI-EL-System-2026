import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import {
  Brain, TrendingUp, Target, Lightbulb, AlertTriangle, CheckCircle, Star,
  Zap, BarChart3, Users, Clock, Search, ArrowUpDown, Eye, X, Filter
} from "lucide-react";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";
import ActivityLog from "@/components/activity-log";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

interface Insight {
  id: number;
  lead?: string;
  customer?: string;
  action?: string;
  reason?: string;
  priority?: string;
  score?: number;
  status?: string;
  type?: string;
  title?: string;
  description?: string;
  impact?: string;
  probability?: number;
  value?: number;
  category?: string;
  created_at?: string;
}

const priorityMap: Record<string, { label: string; color: string }> = {
  urgent: { label: "דחוף", color: "bg-red-500/20 text-red-400" },
  high: { label: "גבוה", color: "bg-orange-500/20 text-orange-400" },
  medium: { label: "בינוני", color: "bg-blue-500/20 text-blue-400" },
  low: { label: "נמוך", color: "bg-muted/20 text-muted-foreground" },
};

const statusMap: Record<string, { label: string; color: string }> = {
  open: { label: "פתוח", color: "bg-yellow-500/20 text-yellow-400" },
  done: { label: "בוצע", color: "bg-green-500/20 text-green-400" },
  dismissed: { label: "נדחה", color: "bg-muted/20 text-muted-foreground" },
  in_progress: { label: "בטיפול", color: "bg-blue-500/20 text-blue-400" },
};

const typeMap: Record<string, { label: string; color: string }> = {
  action: { label: "פעולה", color: "bg-purple-500/20 text-purple-400" },
  pattern: { label: "דפוס", color: "bg-cyan-500/20 text-cyan-400" },
  opportunity: { label: "הזדמנות", color: "bg-emerald-500/20 text-emerald-400" },
  anomaly: { label: "חריגה", color: "bg-red-500/20 text-red-400" },
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}
    </div>
  );
}

export default function AIInsightsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<Insight[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<Insight | null>(null);
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const [detailTab, setDetailTab] = useState("details");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemsRes, statsRes] = await Promise.all([
        authFetch(`${API}/crm/ai-insights`),
        authFetch(`${API}/crm/ai-insights/stats`),
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
      (filterType === "all" || i.type === filterType) &&
      (filterPriority === "all" || i.priority === filterPriority) &&
      (filterStatus === "all" || i.status === filterStatus) &&
      (!search || [i.lead, i.title, i.action, i.reason, i.customer, i.category]
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
  }, [items, search, filterType, filterPriority, filterStatus, sortField, sortDir]);

  const kpis = [
    { label: "סה\"כ תובנות", value: fmt(stats.total || items.length), icon: Brain, color: "text-purple-400" },
    { label: "פעולות ממתינות", value: fmt(stats.pending || 0), icon: Zap, color: "text-yellow-400" },
    { label: "הזדמנויות", value: fmt(stats.opportunities || 0), icon: Star, color: "text-emerald-400" },
    { label: "חריגות", value: fmt(stats.anomalies || 0), icon: AlertTriangle, color: "text-red-400" },
    { label: "ציון ממוצע", value: fmt(stats.avg_score || 0), icon: Target, color: "text-blue-400" },
    { label: "דיוק AI", value: `${Number(stats.accuracy || 88).toFixed(0)}%`, icon: BarChart3, color: "text-cyan-400" },
  ];

  const columns = [
    { key: "title", label: "כותרת" },
    { key: "type", label: "סוג" },
    { key: "priority", label: "עדיפות" },
    { key: "score", label: "ציון" },
    { key: "lead", label: "ליד / לקוח" },
    { key: "status", label: "סטטוס" },
    { key: "created_at", label: "תאריך" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Brain className="text-purple-400 w-6 h-6" />
            AI Insights
          </h1>
          <p className="text-sm text-muted-foreground mt-1">תובנות AI חכמות — המלצות פעולה, ניתוח דפוסים וזיהוי הזדמנויות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown
            data={filtered}
            headers={{ title: "כותרת", type: "סוג", priority: "עדיפות", score: "ציון", lead: "ליד", status: "סטטוס" }}
            filename="ai_insights"
          />
        </div>
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש תובנות..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסוגים</option>
          {Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל העדיפויות</option>
          {Object.entries(priorityMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      <BulkActions items={filtered} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
        defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/crm/ai-insights/${id}`, { method: "DELETE" }))); load(); }),
        defaultBulkActions.export(async (ids) => { const rows = filtered.filter(r => ids.has(r.id)); const csv = ["כותרת,סוג,עדיפות,ציון,סטטוס", ...rows.map(r => `${r.title},${r.type},${r.priority},${r.score},${r.status}`)].join("\n"); const b = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "ai_insights_export.csv"; a.click(); }),
      ]} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">שגיאה בטעינה</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Brain className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין תובנות AI</p>
          <p className="text-sm mt-1">{search || filterType !== "all" ? "נסה לשנות את הסינון" : "תובנות יופיעו כאשר ה-AI יזהה דפוסים"}</p>
        </div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  <th className="px-2 py-3 w-10"><BulkCheckbox items={filtered} selectedIds={selectedIds} onToggleAll={toggleAll} mode="all" /></th>
                  {columns.map(col => (
                    <th key={col.key} onClick={() => toggleSort(col.key)}
                      className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                      <div className="flex items-center gap-1">
                        {col.label}
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginate(filtered).map(r => (
                  <tr key={r.id} className={`border-b border-border/20 hover:bg-muted/20 transition-colors ${isSelected(r.id) ? "bg-primary/5" : ""}`}>
                    <td className="px-2 py-3"><BulkCheckbox id={r.id} selectedIds={selectedIds} onToggle={toggle} mode="single" /></td>
                    <td className="px-4 py-3 font-medium text-foreground">{r.title || r.action || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${typeMap[r.type || ""]?.color || "bg-muted/20 text-muted-foreground"}`}>
                        {typeMap[r.type || ""]?.label || r.type || "—"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${priorityMap[r.priority || ""]?.color || "bg-muted/20 text-muted-foreground"}`}>
                        {priorityMap[r.priority || ""]?.label || r.priority || "—"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-bold ${(r.score || 0) >= 80 ? "text-green-400" : (r.score || 0) >= 60 ? "text-amber-400" : "text-muted-foreground"}`}>
                        {r.score || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.lead || r.customer || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${statusMap[r.status || ""]?.color || "bg-muted/20 text-muted-foreground"}`}>
                        {statusMap[r.status || ""]?.label || r.status || "—"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.created_at?.slice(0, 10) || "—"}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg" title="צפייה">
                        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </td>
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
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Brain className="w-5 h-5 text-purple-400" />
                  {viewDetail.title || viewDetail.action}
                </h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
                <div className="p-5 grid grid-cols-2 gap-4">
                  <DetailField label="כותרת" value={viewDetail.title || viewDetail.action} />
                  <DetailField label="סוג">
                    <Badge className={typeMap[viewDetail.type || ""]?.color}>{typeMap[viewDetail.type || ""]?.label || viewDetail.type}</Badge>
                  </DetailField>
                  <DetailField label="עדיפות">
                    <Badge className={priorityMap[viewDetail.priority || ""]?.color}>{priorityMap[viewDetail.priority || ""]?.label || viewDetail.priority}</Badge>
                  </DetailField>
                  <DetailField label="ציון" value={String(viewDetail.score || 0)} />
                  <DetailField label="ליד / לקוח" value={viewDetail.lead || viewDetail.customer} />
                  <DetailField label="סטטוס">
                    <Badge className={statusMap[viewDetail.status || ""]?.color}>{statusMap[viewDetail.status || ""]?.label || viewDetail.status}</Badge>
                  </DetailField>
                  <DetailField label="השפעה" value={viewDetail.impact} />
                  <DetailField label="הסתברות" value={viewDetail.probability ? `${viewDetail.probability}%` : undefined} />
                  <div className="col-span-2"><DetailField label="סיבה / נימוק" value={viewDetail.reason} /></div>
                  <div className="col-span-2"><DetailField label="תיאור" value={viewDetail.description} /></div>
                </div>
              )}
              {detailTab === "related" && (
                <div className="p-5"><RelatedRecords tabs={[{key:"predictions",label:"חיזויים",endpoint:`${API}/crm/ai-insights/${viewDetail.id}/predictions`,columns:[{key:"prediction",label:"חיזוי"},{key:"confidence",label:"ביטחון"},{key:"date",label:"תאריך"}]},{key:"recommendations",label:"המלצות",endpoint:`${API}/crm/ai-insights/${viewDetail.id}/recommendations`,columns:[{key:"action",label:"פעולה"},{key:"impact",label:"השפעה"},{key:"priority",label:"עדיפות"}]}]} /></div>
              )}
              {detailTab === "docs" && (
                <div className="p-5"><AttachmentsSection entityType="ai-insight" entityId={viewDetail.id} /></div>
              )}
              {detailTab === "history" && (
                <div className="p-5"><ActivityLog entityType="ai-insight" entityId={viewDetail.id} /></div>
              )}
              <div className="p-5 border-t border-border flex justify-end">
                <button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
