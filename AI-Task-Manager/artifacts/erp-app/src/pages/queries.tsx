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
  CheckCircle2, XCircle, Clock, Hash, Calendar, Filter, Edit2,
  Trash2, Save, Cpu, TrendingUp, BarChart3
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

const statusLabels: Record<string, { label: string; color: string }> = {
  completed: { label: "הושלם", color: "bg-green-500/20 text-green-400" },
  pending: { label: "ממתין", color: "bg-amber-500/20 text-amber-400" },
  error: { label: "שגיאה", color: "bg-red-500/20 text-red-400" },
  processing: { label: "מעבד", color: "bg-blue-500/20 text-blue-400" },
  cancelled: { label: "בוטל", color: "bg-muted/20 text-muted-foreground" },
};

export default function QueriesPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
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
  const pagination = useSmartPagination(25);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [qRes, mRes] = await Promise.all([
        authFetch(`${API}/ai-queries`),
        authFetch(`${API}/ai-models`).catch(() => null),
      ]);
      if (qRes.ok) setItems(safeArray(await qRes.json()));
      else throw new Error("שגיאה בטעינת שאילתות");
      if (mRes?.ok) setModels(safeArray(await mRes.json()));
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const modelMap = useMemo(() => new Map(models.map(m => [m.id, m])), [models]);

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (filterModel === "all" || String(i.modelId) === filterModel) &&
      (!search || [i.prompt, i.systemPrompt, String(i.id)].some(f => f?.toLowerCase().includes(search.toLowerCase())))
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
    setForm({ modelId: models[0]?.id || "", prompt: "", systemPrompt: "", status: "pending", temperature: 0.7, maxTokens: 1000 });
    setShowForm(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({
      modelId: r.modelId || "",
      prompt: r.prompt || "",
      systemPrompt: r.systemPrompt || "",
      status: r.status || "pending",
      temperature: r.temperature || 0.7,
      maxTokens: r.maxTokens || 1000,
    });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/ai-queries/${editing.id}` : `${API}/ai-queries`;
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
    if (await globalConfirm("למחוק שאילתה זו? פעולה זו אינה ניתנת לביטול.")) {
      await authFetch(`${API}/ai-queries/${id}`, { method: "DELETE" });
      load();
    }
  };

  const completedCount = items.filter(q => q.status === "completed").length;
  const pendingCount = items.filter(q => q.status === "pending").length;
  const errorCount = items.filter(q => q.status === "error").length;
  const processingCount = items.filter(q => q.status === "processing").length;
  const successRate = items.length > 0 ? ((completedCount / items.length) * 100).toFixed(1) : "0";

  const kpis = [
    { label: `סה"כ שאילתות`, value: fmt(items.length), icon: Hash, color: "text-blue-400" },
    { label: "הושלמו", value: fmt(completedCount), icon: CheckCircle2, color: "text-green-400" },
    { label: "ממתינות", value: fmt(pendingCount), icon: Clock, color: "text-amber-400" },
    { label: "בעיבוד", value: fmt(processingCount), icon: Cpu, color: "text-blue-400" },
    { label: "שגיאות", value: fmt(errorCount), icon: XCircle, color: "text-red-400" },
    { label: "שיעור הצלחה", value: `${successRate}%`, icon: TrendingUp, color: "text-emerald-400" },
  ];

  const columns = [
    { key: "id", label: "#" },
    { key: "modelId", label: "מודל" },
    { key: "createdAt", label: "תאריך" },
    { key: "status", label: "סטטוס" },
    { key: "prompt", label: "שאילתה" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="text-blue-400 w-6 h-6" /> שאילתות AI
          </h1>
          <p className="text-sm text-muted-foreground mt-1">כל השאילתות שנשלחו למנועי הבינה המלאכותית</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ createdAt: "תאריך", modelId: "מודל", status: "סטטוס", prompt: "שאילתה" }} filename="ai_queries" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> שאילתה חדשה
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש בשאילתות..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterModel} onChange={e => setFilterModel(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל המודלים</option>
          {models.map(m => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
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
          <p className="font-medium">אין שאילתות</p>
          <p className="text-sm mt-1">{search || filterStatus !== "all" || filterModel !== "all" ? "נסה לשנות את הסינון" : "טרם נשלחו שאילתות למנועי AI"}</p>
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
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">System Prompt</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginate(filtered).map(r => {
                  const model = modelMap.get(r.modelId);
                  const cfg = statusLabels[r.status] || statusLabels.pending;
                  return (
                    <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-blue-400 font-bold">#{r.id}</td>
                      <td className="px-4 py-3">
                        <Badge className="text-[10px] bg-blue-500/20 text-blue-400">{model?.name || `Model #${r.modelId}`}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1"><Calendar className="w-3 h-3" />{r.createdAt ? formatDate(r.createdAt) : "—"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-[10px] ${cfg.color}`}>{cfg.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[250px] truncate">{r.prompt?.slice(0, 100) || "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[150px] truncate">{r.systemPrompt?.slice(0, 60) || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg" title="צפייה"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                          <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכה"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                          {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.modelId || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg" title="מחיקה"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
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
                  <MessageSquare className="w-5 h-5 text-blue-400" /> שאילתה #{viewDetail.id}
                </h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <DetailField label="מזהה" value={`#${viewDetail.id}`} />
                  <DetailField label="מודל" value={modelMap.get(viewDetail.modelId)?.name || `Model #${viewDetail.modelId}`} />
                  <DetailField label="תאריך" value={viewDetail.createdAt ? formatDate(viewDetail.createdAt) : undefined} />
                  <DetailField label="סטטוס">
                    <Badge className={(statusLabels[viewDetail.status] || statusLabels.pending).color}>
                      {(statusLabels[viewDetail.status] || statusLabels.pending).label}
                    </Badge>
                  </DetailField>
                  {viewDetail.temperature !== undefined && <DetailField label="טמפרטורה" value={String(viewDetail.temperature)} />}
                  {viewDetail.maxTokens !== undefined && <DetailField label="מקסימום טוקנים" value={fmt(viewDetail.maxTokens)} />}
                </div>
                {viewDetail.systemPrompt && (
                  <div>
                    <span className="text-xs text-muted-foreground">System Prompt</span>
                    <div className="text-sm text-muted-foreground bg-muted/30 rounded-xl p-3 border border-border/50 whitespace-pre-wrap mt-0.5">{viewDetail.systemPrompt}</div>
                  </div>
                )}
                <div>
                  <span className="text-xs text-muted-foreground">שאילתה</span>
                  <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed bg-background rounded-xl p-3 border border-border/50 max-h-[300px] overflow-y-auto mt-0.5">{viewDetail.prompt}</div>
                </div>
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
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת שאילתה" : "שאילתה חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">מודל *</label>
                    <select value={form.modelId || ""} onChange={e => setForm({ ...form, modelId: Number(e.target.value) })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      <option value="">בחר מודל</option>
                      {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                    <select value={form.status || "pending"} onChange={e => setForm({ ...form, status: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">טמפרטורה</label>
                    <input type="number" step={0.1} min={0} max={2} value={form.temperature ?? ""} onChange={e => setForm({ ...form, temperature: parseFloat(e.target.value) })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">מקסימום טוקנים</label>
                    <input type="number" min={1} value={form.maxTokens ?? ""} onChange={e => setForm({ ...form, maxTokens: Number(e.target.value) })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">System Prompt</label>
                  <textarea rows={3} value={form.systemPrompt || ""} onChange={e => setForm({ ...form, systemPrompt: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" placeholder="הוראות מערכת (אופציונלי)" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">שאילתה *</label>
                  <textarea rows={5} value={form.prompt || ""} onChange={e => setForm({ ...form, prompt: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" placeholder="כתוב את השאילתה כאן..." />
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
