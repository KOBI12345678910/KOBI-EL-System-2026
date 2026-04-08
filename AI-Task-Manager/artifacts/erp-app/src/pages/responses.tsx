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
  MessageSquare, Search, ArrowUpDown, AlertTriangle, Eye, X, Plus,
  CheckCircle2, AlertCircle, Clock, Hash, Zap, Star, Edit2, Trash2,
  Save, BarChart3, TrendingUp
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const DetailField = ({ label, value, children }: any) => (
  <div><span className="text-xs text-muted-foreground">{label}</span><div className="text-sm text-foreground mt-0.5">{children || value || "—"}</div></div>
);

function formatDate(d: string): string {
  return new Date(d).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const reasonMap: Record<string, { label: string; color: string }> = {
  stop: { label: "הושלם", color: "bg-green-500/20 text-green-400" },
  length: { label: "חריגת אורך", color: "bg-amber-500/20 text-amber-400" },
  content_filter: { label: "סינון תוכן", color: "bg-red-500/20 text-red-400" },
  tool_calls: { label: "קריאת כלי", color: "bg-blue-500/20 text-blue-400" },
  error: { label: "שגיאה", color: "bg-red-500/20 text-red-400" },
};

export default function ResponsesPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterReason, setFilterReason] = useState("all");
  const [filterRating, setFilterRating] = useState("all");
  const [sortField, setSortField] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(25);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`${API}/ai-responses`);
      if (res.ok) setItems(safeArray(await res.json()));
      else throw new Error("שגיאה בטעינת תגובות");
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterReason === "all" || i.finishReason === filterReason) &&
      (filterRating === "all" || (filterRating === "rated" ? i.rating > 0 : !i.rating)) &&
      (!search || [i.content, i.feedback, String(i.queryId)].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterReason, filterRating, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ queryId: "", content: "", finishReason: "stop", tokensUsed: 0, responseTimeMs: 0, feedback: "", rating: 0 });
    setShowForm(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({
      queryId: r.queryId || "",
      content: r.content || "",
      finishReason: r.finishReason || "stop",
      tokensUsed: r.tokensUsed || 0,
      responseTimeMs: r.responseTimeMs || 0,
      feedback: r.feedback || "",
      rating: r.rating || 0,
    });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/ai-responses/${editing.id}` : `${API}/ai-responses`;
      await authFetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setShowForm(false);
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק תגובה זו? פעולה זו אינה ניתנת לביטול.")) {
      await authFetch(`${API}/ai-responses/${id}`, { method: "DELETE" });
      load();
    }
  };

  const totalTokens = items.reduce((sum, r) => sum + (r.tokensUsed || 0), 0);
  const avgResponseTime = items.length > 0 ? Math.round(items.reduce((sum, r) => sum + (r.responseTimeMs || 0), 0) / items.length) : 0;
  const completedCount = items.filter(r => r.finishReason === "stop").length;
  const avgRating = items.filter(r => r.rating > 0).length > 0
    ? (items.filter(r => r.rating > 0).reduce((s, r) => s + r.rating, 0) / items.filter(r => r.rating > 0).length).toFixed(1)
    : "—";

  const kpis = [
    { label: `סה"כ תגובות`, value: fmt(items.length), icon: Hash, color: "text-emerald-400" },
    { label: "הושלמו בהצלחה", value: fmt(completedCount), icon: CheckCircle2, color: "text-green-400" },
    { label: `סה"כ טוקנים`, value: fmt(totalTokens), icon: Zap, color: "text-amber-400" },
    { label: "זמן תגובה ממוצע", value: `${avgResponseTime}ms`, icon: Clock, color: "text-blue-400" },
    { label: "דירוג ממוצע", value: String(avgRating), icon: Star, color: "text-yellow-400" },
    { label: "שיעור הצלחה", value: items.length > 0 ? `${((completedCount / items.length) * 100).toFixed(1)}%` : "0%", icon: TrendingUp, color: "text-purple-400" },
  ];

  const finishReasons = useMemo(() => [...new Set(items.map(i => i.finishReason).filter(Boolean))], [items]);

  const columns = [
    { key: "id", label: "#" },
    { key: "queryId", label: "שאילתה" },
    { key: "createdAt", label: "תאריך" },
    { key: "finishReason", label: "סיבת סיום" },
    { key: "tokensUsed", label: "טוקנים" },
    { key: "responseTimeMs", label: "זמן תגובה" },
    { key: "rating", label: "דירוג" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="text-emerald-400 w-6 h-6" /> תגובות AI
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מעקב אחר כל התשובות שהתקבלו ממנועי הבינה המלאכותית</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ createdAt: "תאריך", queryId: "שאילתה", finishReason: "סיום", tokensUsed: "טוקנים", responseTimeMs: "זמן", rating: "דירוג" }} filename="ai_responses" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> תגובה חדשה
          </button>
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש בתגובות..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterReason} onChange={e => setFilterReason(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסיבות</option>
          {finishReasons.map(r => <option key={r} value={r}>{reasonMap[r]?.label || r}</option>)}
        </select>
        <select value={filterRating} onChange={e => setFilterRating(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הדירוגים</option>
          <option value="rated">עם דירוג</option>
          <option value="unrated">ללא דירוג</option>
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">{error}</p>
          <button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין תגובות</p>
          <p className="text-sm mt-1">{search || filterReason !== "all" ? "נסה לשנות את הסינון" : "טרם התקבלו תגובות ממנועי AI"}</p>
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
                      <div className="flex items-center gap-1">
                        {col.label}
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">תוכן</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginate(filtered).map(r => {
                  const reasonCfg = reasonMap[r.finishReason] || { label: r.finishReason || "לא ידוע", color: "bg-muted/20 text-muted-foreground" };
                  return (
                    <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-emerald-400 font-bold">#{r.id}</td>
                      <td className="px-4 py-3 text-xs text-blue-400">#{r.queryId}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{r.createdAt ? formatDate(r.createdAt) : "—"}</td>
                      <td className="px-4 py-3">
                        <Badge className={`text-[10px] ${reasonCfg.color}`}>{reasonCfg.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-amber-400">{fmt(r.tokensUsed || 0)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{r.responseTimeMs || 0}ms</td>
                      <td className="px-4 py-3">
                        {r.rating > 0 ? (
                          <div className="flex gap-0.5">{[1,2,3,4,5].map(s => <Star key={s} className={`w-3 h-3 ${s <= r.rating ? "text-amber-400 fill-amber-400" : "text-muted-foreground"}`} />)}</div>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">{r.content?.slice(0, 80) || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg" title="צפייה"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                          <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכה"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                          {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.queryId || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg" title="מחיקה"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
                  <MessageSquare className="w-5 h-5 text-emerald-400" /> תגובה #{viewDetail.id}
                </h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="מזהה תגובה" value={`#${viewDetail.id}`} />
                <DetailField label="שאילתה" value={`#${viewDetail.queryId}`} />
                <DetailField label="תאריך" value={viewDetail.createdAt ? formatDate(viewDetail.createdAt) : undefined} />
                <DetailField label="סיבת סיום">
                  <Badge className={(reasonMap[viewDetail.finishReason] || { color: "bg-muted/20 text-muted-foreground" }).color}>
                    {(reasonMap[viewDetail.finishReason] || { label: viewDetail.finishReason || "לא ידוע" }).label}
                  </Badge>
                </DetailField>
                <DetailField label="טוקנים" value={fmt(viewDetail.tokensUsed || 0)} />
                <DetailField label="זמן תגובה" value={viewDetail.responseTimeMs ? `${viewDetail.responseTimeMs}ms` : undefined} />
                {viewDetail.rating > 0 && (
                  <DetailField label="דירוג">
                    <div className="flex gap-0.5">{[1,2,3,4,5].map(s => <Star key={s} className={`w-4 h-4 ${s <= viewDetail.rating ? "text-amber-400 fill-amber-400" : "text-muted-foreground"}`} />)}</div>
                  </DetailField>
                )}
                <div className="col-span-2">
                  <DetailField label="תוכן">
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto bg-background rounded-xl p-3 border border-border/50">{viewDetail.content}</div>
                  </DetailField>
                </div>
                {viewDetail.feedback && <div className="col-span-2"><DetailField label="משוב" value={viewDetail.feedback} /></div>}
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30">
                  <Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה
                </button>
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת תגובה" : "תגובה חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">מזהה שאילתה *</label>
                    <input type="number" value={form.queryId || ""} onChange={e => setForm({ ...form, queryId: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="מזהה שאילתה" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">סיבת סיום</label>
                    <select value={form.finishReason || "stop"} onChange={e => setForm({ ...form, finishReason: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(reasonMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">טוקנים</label>
                    <input type="number" min={0} value={form.tokensUsed ?? ""} onChange={e => setForm({ ...form, tokensUsed: Number(e.target.value) })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">זמן תגובה (ms)</label>
                    <input type="number" min={0} value={form.responseTimeMs ?? ""} onChange={e => setForm({ ...form, responseTimeMs: Number(e.target.value) })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">דירוג (1-5)</label>
                    <input type="number" min={0} max={5} value={form.rating ?? ""} onChange={e => setForm({ ...form, rating: Number(e.target.value) })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תוכן התגובה *</label>
                  <textarea rows={5} value={form.content || ""} onChange={e => setForm({ ...form, content: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" placeholder="תוכן התגובה מה-AI" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">משוב</label>
                  <textarea rows={2} value={form.feedback || ""} onChange={e => setForm({ ...form, feedback: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" placeholder="משוב על התגובה" />
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                  <Save className="w-4 h-4" /> {saving ? "שומר..." : editing ? "עדכון" : "שמירה"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
