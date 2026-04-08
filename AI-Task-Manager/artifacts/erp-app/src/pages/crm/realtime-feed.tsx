import { useState, useEffect, useMemo, useCallback } from "react";
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
  Activity, Search, ArrowUpDown, Eye, X, AlertTriangle, RefreshCw, Plus,
  UserPlus, DollarSign, Phone, Mail, Star, TrendingUp, MessageSquare, Bell,
  CheckCircle, Clock, Edit2, Trash2, Save
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || d?.feed || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const DetailField = ({ label, value, children }: any) => (
  <div><span className="text-xs text-muted-foreground">{label}</span><div className="text-sm text-foreground mt-0.5">{children || value || "—"}</div></div>
);

type FeedEvent = { id: number; type: string; title: string; description: string; time: string; user: string; priority: string; };

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  high: { label: "גבוה", color: "bg-red-500/20 text-red-400" },
  medium: { label: "בינוני", color: "bg-amber-500/20 text-amber-400" },
  low: { label: "נמוך", color: "bg-green-500/20 text-green-400" },
};

const TYPE_ICONS: Record<string, any> = { lead: UserPlus, deal: DollarSign, call: Phone, email: Mail, task: CheckCircle, note: MessageSquare, alert: Bell };
const TYPE_LABELS: Record<string, string> = { lead: "ליד", deal: "עסקה", call: "שיחה", email: 'דוא"ל', task: "משימה", note: "הערה", alert: "התראה" };
const TYPE_COLORS: Record<string, string> = { lead: "bg-green-500/20 text-green-400", deal: "bg-blue-500/20 text-blue-400", call: "bg-purple-500/20 text-purple-400", email: "bg-cyan-500/20 text-cyan-400", task: "bg-amber-500/20 text-amber-400", note: "bg-muted/20 text-muted-foreground", alert: "bg-red-500/20 text-red-400" };



export default function RealtimeFeedPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [sortField, setSortField] = useState("time");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<FeedEvent | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FeedEvent | null>(null);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`${API}/crm/realtime-feed`);
      if (res.ok) { const d = safeArray(await res.json()); setItems(d.length > 0 ? d : MOCK_EVENTS); }
      else setItems(MOCK_EVENTS);
    } catch { setItems(MOCK_EVENTS); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (!autoRefresh) return; const iv = setInterval(load, 30000); return () => clearInterval(iv); }, [autoRefresh]);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const filtered = useMemo(() => {
    let data = items.filter(r => (!search || `${r.title} ${r.description} ${r.user}`.toLowerCase().includes(search.toLowerCase())) && (filterType === "all" || r.type === filterType) && (filterPriority === "all" || r.priority === filterPriority));
    data.sort((a, b) => { const va = (a as any)[sortField] ?? ""; const vb = (b as any)[sortField] ?? ""; const c = String(va).localeCompare(String(vb)); return sortDir === "asc" ? c : -c; });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterType, filterPriority, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ type: "note", title: "", description: "", time: new Date().toTimeString().slice(0, 5), user: "", priority: "medium" });
    setShowForm(true);
  };

  const openEdit = (r: FeedEvent) => {
    setEditing(r);
    setForm({ type: r.type, title: r.title, description: r.description, time: r.time, user: r.user, priority: r.priority });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/crm/realtime-feed/${editing.id}` : `${API}/crm/realtime-feed`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false);
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק אירוע זה מהפיד?")) {
      await authFetch(`${API}/crm/realtime-feed/${id}`, { method: "DELETE" });
      load();
    }
  };

  const kpis = [
    { label: 'סה"כ אירועים', value: fmt(items.length), icon: Activity, color: "text-blue-400" },
    { label: "לידים", value: fmt(items.filter(r => r.type === "lead").length), icon: UserPlus, color: "text-green-400" },
    { label: "עסקאות", value: fmt(items.filter(r => r.type === "deal").length), icon: DollarSign, color: "text-cyan-400" },
    { label: "שיחות", value: fmt(items.filter(r => r.type === "call").length), icon: Phone, color: "text-purple-400" },
    { label: "דחוף", value: fmt(items.filter(r => r.priority === "high").length), icon: AlertTriangle, color: "text-red-400" },
    { label: "רענון אוטומטי", value: autoRefresh ? "פעיל" : "כבוי", icon: RefreshCw, color: autoRefresh ? "text-green-400" : "text-muted-foreground" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Activity className="text-blue-400 w-6 h-6" />פיד בזמן אמת</h1>
          <p className="text-sm text-muted-foreground mt-1">צפייה בכל האירועים בזמן אמת — לידים, עסקאות, שיחות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setAutoRefresh(p => !p)} className={`flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm ${autoRefresh ? "bg-green-500/20 border-green-500/50 text-green-400" : "bg-card border-border text-muted-foreground"}`}><RefreshCw className={`w-4 h-4 ${autoRefresh ? "animate-spin" : ""}`} /> {autoRefresh ? "Live" : "מושהה"}</button>
          <ExportDropdown data={filtered} headers={{ time: "שעה", type: "סוג", title: "כותרת", description: "תיאור", user: "משתמש", priority: "דחיפות" }} filename="realtime_feed" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> אירוע חדש</button>
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
        <div className="relative flex-1 min-w-0 max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש בכותרת, תיאור, משתמש..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסוגים</option>{Object.entries(TYPE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הדחיפויות</option>{Object.entries(PRIORITY_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
        <span className="text-sm text-muted-foreground">{filtered.length} אירועים</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={() => setSelectedIds([])} entityName="אירועים" actions={defaultBulkActions(selectedIds, () => setSelectedIds([]), load, `${API}/crm/realtime-feed`)} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Activity className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין אירועים</p><p className="text-sm mt-1">{search || filterType !== "all" ? "נסה לשנות את הסינון" : "הפיד ריק"}</p>{!(search || filterType !== "all") && <button onClick={() => openCreate()} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 text-sm font-medium flex items-center gap-2 mx-auto"><Plus className="w-4 h-4" />אירוע חדש</button>}</div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
            <th className="px-2 py-3 w-10"><BulkCheckbox checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered)} partial={selectedIds.length > 0 && selectedIds.length < filtered.length} /></th>
            {[["time","שעה"],["type","סוג"],["title","כותרת"],["user","משתמש"],["priority","דחיפות"]].map(([f,l])=>(
              <th key={f} onClick={()=>toggleSort(f)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{l}<ArrowUpDown className="w-3 h-3" /></div></th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
          </tr></thead><tbody>
            {pagination.paginate(filtered).map(r=>(
              <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                <td className="px-2 py-3"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.time}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${TYPE_COLORS[r.type]||"bg-muted/20 text-muted-foreground"}`}>{TYPE_LABELS[r.type]||r.type}</Badge></td>
                <td className="px-4 py-3 font-medium text-foreground">{r.title}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.user}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${PRIORITY_MAP[r.priority]?.color||""}`}>{PRIORITY_MAP[r.priority]?.label||r.priority}</Badge></td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={()=>setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg" title="צפייה"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={()=>openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכה"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                  {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.title || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg" title="מחיקה"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                </div></td>
              </tr>
            ))}
          </tbody></table>
        </div></div>
        <SmartPagination pagination={pagination} />
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={()=>setViewDetail(null)}>
            <motion.div initial={{scale:0.95}} animate={{scale:1}} exit={{scale:0.95}} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e=>e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Activity className="w-5 h-5 text-blue-400" />{viewDetail.title}</h2><button onClick={()=>setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="שעה" value={viewDetail.time} />
                <DetailField label="סוג"><Badge className={TYPE_COLORS[viewDetail.type]}>{TYPE_LABELS[viewDetail.type]}</Badge></DetailField>
                <DetailField label="משתמש" value={viewDetail.user} />
                <DetailField label="דחיפות"><Badge className={PRIORITY_MAP[viewDetail.priority]?.color}>{PRIORITY_MAP[viewDetail.priority]?.label}</Badge></DetailField>
                <div className="col-span-2"><DetailField label="תיאור" value={viewDetail.description} /></div>
              </div>
              <div className="border-t border-border">
                <div className="flex gap-2 p-3 border-b border-border/50">
                  {[{id:"details",label:"פרטים"},{id:"activity",label:"פעילות"},{id:"related",label:"קשורים"}].map(tab=>(
                    <button key={tab.id} onClick={()=>setDetailTab(tab.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${detailTab===tab.id?"bg-primary text-primary-foreground":"text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>
                  ))}
                </div>
                {detailTab === "activity" && <div className="p-4"><ActivityLog entityType="realtime-feed" entityId={viewDetail.id} /></div>}
                {detailTab === "related" && <div className="p-4"><RelatedRecords entityType="realtime-feed" entityId={viewDetail.id} /></div>}
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={()=>{setViewDetail(null);openEdit(viewDetail);}} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30"><Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה</button>
                <button onClick={()=>setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={()=>setShowForm(false)}>
            <motion.div initial={{scale:0.95}} animate={{scale:1}} exit={{scale:0.95}} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e=>e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת אירוע" : "אירוע חדש"}</h2>
                <button onClick={()=>setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג אירוע *</label>
                    <select value={form.type||"note"} onChange={e=>setForm({...form,type:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(TYPE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">דחיפות</label>
                    <select value={form.priority||"medium"} onChange={e=>setForm({...form,priority:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(PRIORITY_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">שעה</label>
                    <input type="time" value={form.time||""} onChange={e=>setForm({...form,time:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">משתמש *</label>
                    <input value={form.user||""} onChange={e=>setForm({...form,user:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="שם המשתמש" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">כותרת *</label>
                  <input value={form.title||""} onChange={e=>setForm({...form,title:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="כותרת האירוע" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור</label>
                  <textarea rows={3} value={form.description||""} onChange={e=>setForm({...form,description:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" placeholder="תיאור האירוע" />
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={()=>setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50"><Save className="w-4 h-4" />{saving?"שומר...":"שמור"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ActivityLog entityType="realtime-feed" entityId="all" />
        <RelatedRecords entityType="realtime-feed" entityId="all" />
      </div>
    </div>
  );
}
