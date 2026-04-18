import { usePermissions } from "@/hooks/use-permissions";
import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import {
  Sparkles, Search, ArrowUpDown, Eye, X, AlertTriangle, Edit2, Trash2, Plus, Save,
  TrendingUp, Target, Bot, Zap, Clock, BarChart3, CheckCircle, Lightbulb, Copy
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || d?.insights || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const DetailField = ({ label, value, children }: any) => (
  <div><span className="text-xs text-muted-foreground">{label}</span><div className="text-sm text-foreground mt-0.5">{children || value || "—"}</div></div>
);

const TYPE_MAP: Record<string, { label: string; color: string }> = {
  price_trend: { label: "מגמת מחיר", color: "bg-emerald-500/20 text-emerald-400" },
  stock_alert: { label: "התראת מלאי", color: "bg-red-500/20 text-red-400" },
  supplier_recommendation: { label: "המלצת ספק", color: "bg-blue-500/20 text-blue-400" },
  cost_saving: { label: "חיסכון עלויות", color: "bg-green-500/20 text-green-400" },
  risk_alert: { label: "התראת סיכון", color: "bg-orange-500/20 text-orange-400" },
  optimization: { label: "אופטימיזציה", color: "bg-purple-500/20 text-purple-400" },
  forecast: { label: "תחזית", color: "bg-cyan-500/20 text-cyan-400" },
};

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  high: { label: "גבוה", color: "bg-red-500/20 text-red-400" },
  medium: { label: "בינוני", color: "bg-amber-500/20 text-amber-400" },
  low: { label: "נמוך", color: "bg-green-500/20 text-green-400" },
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  new: { label: "חדש", color: "bg-blue-500/20 text-blue-400" },
  reviewed: { label: "נבדק", color: "bg-amber-500/20 text-amber-400" },
  applied: { label: "יושם", color: "bg-green-500/20 text-green-400" },
  dismissed: { label: "נדחה", color: "bg-muted/20 text-muted-foreground" },
};




const MOCK_INSIGHTS: any[] = [];
export default function ProcurementAIPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`${API}/procurement-ai`);
      if (res.ok) { const d = safeArray(await res.json()); setItems(d.length > 0 ? d : MOCK_INSIGHTS); }
      else setItems(MOCK_INSIGHTS);
    } catch { setItems(MOCK_INSIGHTS); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const filtered = useMemo(() => {
    let data = items.filter(r =>
      (!search || `${r.title} ${r.description}`.toLowerCase().includes(search.toLowerCase())) &&
      (filterType === "all" || r.type === filterType) &&
      (filterPriority === "all" || r.priority === filterPriority) &&
      (filterStatus === "all" || r.status === filterStatus)
    );
    data.sort((a: any, b: any) => { const va = a[sortField] ?? ""; const vb = b[sortField] ?? ""; const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb)); return sortDir === "asc" ? c : -c; });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterType, filterPriority, filterStatus, sortField, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ type: "price_trend", title: "", description: "", priority: "medium", status: "new", confidence: 80, potential_saving: 0 }); setShowForm(true); };
  const openEdit = (r: any) => { setEditing(r); setForm({ type: r.type, title: r.title, description: r.description, priority: r.priority, status: r.status, confidence: r.confidence, potential_saving: r.potential_saving }); setShowForm(true); };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/procurement-ai/${editing.id}` : `${API}/procurement-ai`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    const item = items.find((x: any) => x.id === id);
    if (await globalConfirm("למחוק תובנה זו?", { itemName: item?.title || String(id), entityType: "תובנת רכש" })) {
      await authFetch(`${API}/procurement-ai/${id}`, { method: "DELETE" }); load();
    }
  };

  const totalSavings = items.reduce((s, r) => s + (r.potential_saving || 0), 0);
  const avgConfidence = items.length > 0 ? (items.reduce((s, r) => s + (r.confidence || 0), 0) / items.length).toFixed(0) : "0";
  const newCount = items.filter(r => r.status === "new").length;
  const appliedCount = items.filter(r => r.status === "applied").length;

  const kpis = [
    { label: "תובנות AI", value: fmt(items.length), icon: Sparkles, color: "text-purple-400" },
    { label: "חדשות", value: fmt(newCount), icon: Lightbulb, color: "text-blue-400" },
    { label: "יושמו", value: fmt(appliedCount), icon: CheckCircle, color: "text-green-400" },
    { label: "חיסכון פוטנציאלי", value: `₪${fmt(totalSavings)}`, icon: TrendingUp, color: "text-emerald-400" },
    { label: "רמת ביטחון", value: `${avgConfidence}%`, icon: Target, color: "text-cyan-400" },
    { label: "דחופות", value: fmt(items.filter(r => r.priority === "high").length), icon: AlertTriangle, color: "text-red-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Sparkles className="text-purple-400 w-6 h-6" />בינה מלאכותית לרכש</h1>
          <p className="text-sm text-muted-foreground mt-1">תובנות AI, מגמות מחירים, התראות חכמות והמלצות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ type: "סוג", title: "כותרת", description: "תיאור", priority: "דחיפות", confidence: "ביטחון%", potential_saving: "חיסכון", status: "סטטוס" }} filename="procurement_ai" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> תובנה חדשה</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} /><div className="text-xl font-bold text-foreground">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש תובנות..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסוגים</option>{Object.entries(TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הדחיפויות</option>{Object.entries(PRIORITY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסטטוסים</option>{Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <span className="text-sm text-muted-foreground">{filtered.length} תובנות</span>
      </div>

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין תובנות AI</p><p className="text-sm mt-1">התובנות יופיעו כאשר יצטברו מספיק נתוני רכש</p></div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
            {[["type","סוג"],["title","כותרת"],["priority","דחיפות"],["confidence","ביטחון"],["potential_saving","חיסכון"],["status","סטטוס"],["created_at","תאריך"]].map(([f,l]) => (
              <th key={f} onClick={() => toggleSort(f)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{l}<ArrowUpDown className="w-3 h-3" /></div></th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
          </tr></thead><tbody>
            {pagination.paginate(filtered).map(r => (
              <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3"><Badge className={`text-[10px] ${TYPE_MAP[r.type]?.color || "bg-muted/20 text-muted-foreground"}`}>{TYPE_MAP[r.type]?.label || r.type}</Badge></td>
                <td className="px-4 py-3 font-medium text-foreground max-w-[200px] truncate">{r.title}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${PRIORITY_MAP[r.priority]?.color || ""}`}>{PRIORITY_MAP[r.priority]?.label || r.priority}</Badge></td>
                <td className="px-4 py-3"><span className={`font-mono text-sm ${(r.confidence || 0) >= 80 ? "text-green-400" : "text-amber-400"}`}>{r.confidence || 0}%</span></td>
                <td className="px-4 py-3 text-emerald-400 font-medium">{r.potential_saving ? `₪${fmt(r.potential_saving)}` : "—"}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${STATUS_MAP[r.status]?.color || ""}`}>{STATUS_MAP[r.status]?.label || r.status}</Badge></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.created_at?.slice(0, 10)}</td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                  <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/procurement-ai`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                  {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.title || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                </div></td>
              </tr>
            ))}
          </tbody></table>
        </div></div>
        <SmartPagination pagination={pagination} />
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Sparkles className="w-5 h-5 text-purple-400" />{viewDetail.title}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="סוג"><Badge className={TYPE_MAP[viewDetail.type]?.color}>{TYPE_MAP[viewDetail.type]?.label || viewDetail.type}</Badge></DetailField>
                <DetailField label="דחיפות"><Badge className={PRIORITY_MAP[viewDetail.priority]?.color}>{PRIORITY_MAP[viewDetail.priority]?.label}</Badge></DetailField>
                <DetailField label="רמת ביטחון" value={`${viewDetail.confidence || 0}%`} />
                <DetailField label="חיסכון פוטנציאלי" value={viewDetail.potential_saving ? `₪${fmt(viewDetail.potential_saving)}` : "—"} />
                <DetailField label="סטטוס"><Badge className={STATUS_MAP[viewDetail.status]?.color}>{STATUS_MAP[viewDetail.status]?.label}</Badge></DetailField>
                <DetailField label="תאריך" value={viewDetail.created_at?.slice(0, 10)} />
                <div className="col-span-2"><DetailField label="תיאור" value={viewDetail.description} /></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30"><Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה</button>
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת תובנה" : "תובנה חדשה"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 space-y-4">
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">כותרת *</label><input value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="כותרת התובנה" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג</label>
                    <select value={form.type || "price_trend"} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">דחיפות</label>
                    <select value={form.priority || "medium"} onChange={e => setForm({ ...form, priority: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(PRIORITY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">רמת ביטחון (%)</label><input type="number" min={0} max={100} value={form.confidence ?? 80} onChange={e => setForm({ ...form, confidence: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">חיסכון פוטנציאלי (₪)</label><input type="number" min={0} value={form.potential_saving ?? 0} onChange={e => setForm({ ...form, potential_saving: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                </div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                  <select value={form.status || "new"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור</label><textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm h-24 resize-none" placeholder="תיאור מפורט" /></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving || !form.title} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"><Save className="w-4 h-4" />{saving ? "שומר..." : editing ? "עדכון" : "יצירה"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="תובנות AI" actions={defaultBulkActions(selectedIds, clear, load, `${API}/procurement-ai`)} />

      <ActivityLog entityType="procurement-ai" />
    </div>
  );
}
