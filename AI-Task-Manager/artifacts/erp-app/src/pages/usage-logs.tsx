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
  Activity, Search, ArrowUpDown, AlertTriangle, Eye, X, Plus,
  DollarSign, Clock, Zap, Hash, Cpu, CheckCircle2, XCircle, User,
  Edit2, Trash2, Save, TrendingUp, BarChart3
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const DetailField = ({ label, value, children }: any) => (
  <div><span className="text-xs text-muted-foreground">{label}</span><div className="text-sm text-foreground mt-0.5">{children || value || "—"}</div></div>
);

function formatDate(d: string): string {
  return new Date(d).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function UsageLogsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterModel, setFilterModel] = useState("all");
  const [sortField, setSortField] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(50);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`${API}/ai-usage-logs`);
      if (res.ok) setItems(safeArray(await res.json()));
      else throw new Error("שגיאה בטעינת יומני שימוש");
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };

  const modelNames = useMemo(() => [...new Set(items.map(i => i.modelName).filter(Boolean))], [items]);

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterStatus === "all" || (filterStatus === "success" ? i.success !== false : i.success === false)) &&
      (filterModel === "all" || i.modelName === filterModel) &&
      (!search || [i.modelName, i.userName, i.errorMessage].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, filterModel, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ modelName: "", userName: "", inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: "0", responseTimeMs: 0, success: true, statusCode: 200, errorMessage: "" });
    setShowForm(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({
      modelName: r.modelName || "",
      userName: r.userName || "",
      inputTokens: r.inputTokens || 0,
      outputTokens: r.outputTokens || 0,
      totalTokens: r.totalTokens || 0,
      cost: r.cost || "0",
      responseTimeMs: r.responseTimeMs || 0,
      success: r.success !== false,
      statusCode: r.statusCode || 200,
      errorMessage: r.errorMessage || "",
    });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/ai-usage-logs/${editing.id}` : `${API}/ai-usage-logs`;
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
    if (await globalConfirm("למחוק יומן שימוש זה? פעולה זו אינה ניתנת לביטול.")) {
      await authFetch(`${API}/ai-usage-logs/${id}`, { method: "DELETE" });
      load();
    }
  };

  const totalTokens = useMemo(() => items.reduce((sum, l) => sum + (l.totalTokens || 0), 0), [items]);
  const totalCost = useMemo(() => items.reduce((sum, l) => sum + parseFloat(l.cost || "0"), 0), [items]);
  const avgResponseTime = useMemo(() => items.length > 0 ? Math.round(items.reduce((sum, l) => sum + (l.responseTimeMs || 0), 0) / items.length) : 0, [items]);
  const successRate = useMemo(() => items.length > 0 ? ((items.filter(l => l.success !== false).length / items.length) * 100).toFixed(1) : "0", [items]);
  const successCount = useMemo(() => items.filter(l => l.success !== false).length, [items]);
  const errorCount = useMemo(() => items.filter(l => l.success === false).length, [items]);

  const kpis = [
    { label: `סה"כ שימושים`, value: fmt(items.length), icon: Hash, color: "text-violet-400" },
    { label: `סה"כ טוקנים`, value: fmt(totalTokens), icon: Zap, color: "text-amber-400" },
    { label: "עלות כוללת", value: `$${totalCost.toFixed(4)}`, icon: DollarSign, color: "text-green-400" },
    { label: "זמן תגובה ממוצע", value: `${avgResponseTime}ms`, icon: Clock, color: "text-blue-400" },
    { label: "הצלחות", value: fmt(successCount), icon: CheckCircle2, color: "text-emerald-400" },
    { label: "שגיאות", value: fmt(errorCount), icon: XCircle, color: "text-red-400" },
  ];

  const columns = [
    { key: "createdAt", label: "תאריך" },
    { key: "modelName", label: "מודל" },
    { key: "userName", label: "משתמש" },
    { key: "inputTokens", label: "קלט" },
    { key: "outputTokens", label: "פלט" },
    { key: "totalTokens", label: `סה"כ` },
    { key: "cost", label: "עלות" },
    { key: "responseTimeMs", label: "זמן" },
    { key: "success", label: "סטטוס" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Activity className="text-violet-400 w-6 h-6" /> יומני שימוש AI
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מעקב מדויק אחר צריכת טוקנים ועלויות · שיעור הצלחה: {successRate}%</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ createdAt: "תאריך", modelName: "מודל", userName: "משתמש", inputTokens: "קלט", outputTokens: "פלט", totalTokens: "סהכ", cost: "עלות", responseTimeMs: "זמן" }} filename="usage_logs" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> יומן חדש
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי מודל או משתמש..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          <option value="success">הצלחה</option>
          <option value="error">שגיאה</option>
        </select>
        <select value={filterModel} onChange={e => setFilterModel(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל המודלים</option>
          {modelNames.map(m => <option key={m} value={m}>{m}</option>)}
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
          <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין יומני שימוש</p>
          <p className="text-sm mt-1">{search || filterStatus !== "all" || filterModel !== "all" ? "נסה לשנות את הסינון" : "טרם נרשמו שימושים במנועי AI"}</p>
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
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginate(filtered).map(r => (
                  <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{r.createdAt ? formatDate(r.createdAt) : "—"}</td>
                    <td className="px-4 py-3 text-xs text-blue-400 font-medium">{r.modelName || `Model #${r.modelId}`}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1"><User className="w-3 h-3" />{r.userName || "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-cyan-400">{fmt(r.inputTokens || 0)}</td>
                    <td className="px-4 py-3 text-xs font-mono text-emerald-400">{fmt(r.outputTokens || 0)}</td>
                    <td className="px-4 py-3 text-xs font-mono text-foreground font-bold">{fmt(r.totalTokens || 0)}</td>
                    <td className="px-4 py-3 text-xs font-mono text-emerald-400 font-bold">${parseFloat(r.cost || "0").toFixed(5)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{r.responseTimeMs || 0}ms</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${r.success !== false ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                        {r.success !== false ? "הצלחה" : "שגיאה"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg" title="צפייה"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכה"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                        {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.modelId || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg" title="מחיקה"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                      </div>
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
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Activity className="w-5 h-5 text-violet-400" /> פרטי שימוש
                </h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="תאריך" value={viewDetail.createdAt ? formatDate(viewDetail.createdAt) : undefined} />
                <DetailField label="מודל" value={viewDetail.modelName || `Model #${viewDetail.modelId}`} />
                <DetailField label="משתמש" value={viewDetail.userName} />
                <DetailField label="סטטוס">
                  <Badge className={viewDetail.success !== false ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}>
                    {viewDetail.success !== false ? "הצלחה" : "שגיאה"}
                  </Badge>
                </DetailField>
                <DetailField label="טוקני קלט" value={fmt(viewDetail.inputTokens || 0)} />
                <DetailField label="טוקני פלט" value={fmt(viewDetail.outputTokens || 0)} />
                <DetailField label={'סה"כ טוקנים'} value={fmt(viewDetail.totalTokens || 0)} />
                <DetailField label="עלות" value={`$${parseFloat(viewDetail.cost || "0").toFixed(5)}`} />
                <DetailField label="זמן תגובה" value={`${viewDetail.responseTimeMs || 0}ms`} />
                <DetailField label="קוד תגובה" value={String(viewDetail.statusCode || "")} />
                {viewDetail.errorMessage && <div className="col-span-2"><DetailField label="שגיאה" value={viewDetail.errorMessage} /></div>}
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
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת יומן" : "יומן שימוש חדש"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">שם מודל *</label>
                    <input value={form.modelName || ""} onChange={e => setForm({ ...form, modelName: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="moonshot-v1-128k, claude-3..." />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">משתמש</label>
                    <input value={form.userName || ""} onChange={e => setForm({ ...form, userName: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="שם משתמש" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">טוקני קלט</label>
                    <input type="number" min={0} value={form.inputTokens ?? ""} onChange={e => setForm({ ...form, inputTokens: Number(e.target.value) })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">טוקני פלט</label>
                    <input type="number" min={0} value={form.outputTokens ?? ""} onChange={e => setForm({ ...form, outputTokens: Number(e.target.value) })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">{'סה"כ טוקנים'}</label>
                    <input type="number" min={0} value={form.totalTokens ?? ""} onChange={e => setForm({ ...form, totalTokens: Number(e.target.value) })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">עלות ($)</label>
                    <input value={form.cost || ""} onChange={e => setForm({ ...form, cost: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="0.001" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">זמן תגובה (ms)</label>
                    <input type="number" min={0} value={form.responseTimeMs ?? ""} onChange={e => setForm({ ...form, responseTimeMs: Number(e.target.value) })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">קוד תגובה</label>
                    <input type="number" value={form.statusCode ?? ""} onChange={e => setForm({ ...form, statusCode: Number(e.target.value) })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="200" />
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <input type="checkbox" checked={form.success !== false} onChange={e => setForm({ ...form, success: e.target.checked })}
                      className="rounded border-border" />
                    <label className="text-sm text-muted-foreground">הצלחה</label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">הודעת שגיאה</label>
                  <textarea rows={2} value={form.errorMessage || ""} onChange={e => setForm({ ...form, errorMessage: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" placeholder="תיאור השגיאה (אם קיימת)" />
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
