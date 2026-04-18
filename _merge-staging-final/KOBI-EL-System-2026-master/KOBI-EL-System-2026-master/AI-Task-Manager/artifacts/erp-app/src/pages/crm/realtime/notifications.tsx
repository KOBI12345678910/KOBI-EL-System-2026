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
  Bell, Search, ArrowUpDown, Eye, X, AlertTriangle, CheckCircle, Plus,
  Mail, Phone, MessageSquare, Clock, BellRing, BellOff, Trash2,
  Edit2, Save, Send
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || d?.notifications || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const DetailField = ({ label, value, children }: any) => (
  <div><span className="text-xs text-muted-foreground">{label}</span><div className="text-sm text-foreground mt-0.5">{children || value || "—"}</div></div>
);

const TYPE_MAP: Record<string, { label: string; color: string }> = {
  info: { label: "מידע", color: "bg-blue-500/20 text-blue-400" },
  warning: { label: "אזהרה", color: "bg-amber-500/20 text-amber-400" },
  error: { label: "שגיאה", color: "bg-red-500/20 text-red-400" },
  success: { label: "הצלחה", color: "bg-green-500/20 text-green-400" },
  reminder: { label: "תזכורת", color: "bg-purple-500/20 text-purple-400" },
};

const CHANNEL_MAP: Record<string, string> = {
  push: "Push",
  email: 'דוא"ל',
  sms: "SMS",
  in_app: "באפליקציה",
};

export default function NotificationsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterRead, setFilterRead] = useState("all");
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`${API}/notifications`);
      if (res.ok) setItems(safeArray(await res.json()).map((r: any, i: number) => ({ ...r, id: r.id || i + 1 })));
    } catch (e: any) { setError(e.message || "שגיאה"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const markRead = async (id: number) => {
    try { await authFetch(`${API}/notifications/${id}/read`, { method: "POST" }); } catch {}
    setItems(prev => prev.map(it => it.id === id ? { ...it, is_read: true } : it));
  };

  const markAllRead = async () => {
    try { await authFetch(`${API}/notifications/read-all`, { method: "POST" }); } catch {}
    setItems(prev => prev.map(it => ({ ...it, is_read: true })));
  };

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const filtered = useMemo(() => {
    let data = items.filter(r =>
      (!search || `${r.title} ${r.message} ${r.type}`.toLowerCase().includes(search.toLowerCase())) &&
      (filterType === "all" || r.type === filterType) &&
      (filterRead === "all" || (filterRead === "unread" ? !r.is_read : r.is_read))
    );
    data.sort((a: any, b: any) => { const va = a[sortField] ?? ""; const vb = b[sortField] ?? ""; const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb)); return sortDir === "asc" ? c : -c; });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterType, filterRead, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ title: "", message: "", type: "info", channel: "in_app" });
    setShowForm(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({ title: r.title || "", message: r.message || "", type: r.type || "info", channel: r.channel || "in_app" });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/notifications/${editing.id}` : `${API}/notifications`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false);
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק התראה זו?")) {
      await authFetch(`${API}/notifications/${id}`, { method: "DELETE" });
      load();
    }
  };

  const unreadCount = items.filter(r => !r.is_read).length;
  const kpis = [
    { label: 'סה"כ התראות', value: fmt(items.length), icon: Bell, color: "text-blue-400" },
    { label: "לא נקראו", value: fmt(unreadCount), icon: BellRing, color: "text-red-400" },
    { label: "נקראו", value: fmt(items.filter(r => r.is_read).length), icon: CheckCircle, color: "text-green-400" },
    { label: "אזהרות", value: fmt(items.filter(r => r.type === "warning").length), icon: AlertTriangle, color: "text-amber-400" },
    { label: "שגיאות", value: fmt(items.filter(r => r.type === "error").length), icon: AlertTriangle, color: "text-red-400" },
    { label: "תזכורות", value: fmt(items.filter(r => r.type === "reminder").length), icon: Clock, color: "text-purple-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Bell className="text-amber-400 w-6 h-6" />מרכז התראות</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול וצפייה בכל ההתראות במקום אחד</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {unreadCount > 0 && <button onClick={markAllRead} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm"><CheckCircle className="w-4 h-4" /> סמן הכל כנקרא</button>}
          <ExportDropdown data={filtered} headers={{ created_at: "זמן", type: "סוג", title: "כותרת", message: "הודעה", is_read: "נקרא" }} filename="notifications" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> התראה חדשה</button>
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
        <div className="relative flex-1 min-w-0 max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש בכותרת, הודעה..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסוגים</option>{Object.entries(TYPE_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
        <select value={filterRead} onChange={e => setFilterRead(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">הכל</option><option value="unread">לא נקראו</option><option value="read">נקראו</option></select>
        <span className="text-sm text-muted-foreground">{filtered.length} התראות</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={() => setSelectedIds([])} entityName="notifications" actions={defaultBulkActions(selectedIds, () => setSelectedIds([]), load, `${API}/crm/realtime/notifications`)} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><BellOff className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין התראות</p><p className="text-sm mt-1">{search || filterType !== "all" || filterRead !== "all" ? "נסה לשנות את הסינון" : "כל ההתראות נקראו"}</p>{!(search || filterType !== "all") && <button onClick={() => openCreate()} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 text-sm font-medium flex items-center gap-2 mx-auto"><Plus className="w-4 h-4" />התראה חדשה</button>}</div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
            {[["created_at","זמן"],["type","סוג"],["title","כותרת"],["message","הודעה"],["is_read","סטטוס"]].map(([f,l])=>(
              <th key={f} onClick={()=>toggleSort(f)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{l}<ArrowUpDown className="w-3 h-3" /></div></th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
          </tr></thead><tbody>
            {pagination.paginate(filtered).map(r=>(
              <tr key={r.id} className={`border-b border-border/20 hover:bg-muted/20 transition-colors ${!r.is_read ? "bg-primary/5" : ""}`}>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.created_at?.slice(0,16).replace("T"," ")||"—"}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${TYPE_MAP[r.type]?.color||"bg-muted/20 text-muted-foreground"}`}>{TYPE_MAP[r.type]?.label||r.type||"מידע"}</Badge></td>
                <td className="px-4 py-3 font-medium text-foreground">{r.title||"—"}</td>
                <td className="px-4 py-3 text-muted-foreground max-w-[250px] truncate">{r.message||"—"}</td>
                <td className="px-4 py-3">{r.is_read ? <Badge className="text-[10px] bg-green-500/20 text-green-400">נקרא</Badge> : <Badge className="text-[10px] bg-red-500/20 text-red-400">חדש</Badge>}</td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={()=>setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg" title="צפייה"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  {!r.is_read && <button onClick={()=>markRead(r.id)} className="p-1.5 hover:bg-muted rounded-lg" title="סמן כנקרא"><CheckCircle className="w-3.5 h-3.5 text-green-400" /></button>}
                  <button onClick={()=>openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכה"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                  {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.type || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg" title="מחיקה"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
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
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Bell className="w-5 h-5 text-amber-400" />{viewDetail.title}</h2><button onClick={()=>setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="זמן" value={viewDetail.created_at?.slice(0,16).replace("T"," ")} />
                <DetailField label="סוג"><Badge className={TYPE_MAP[viewDetail.type]?.color}>{TYPE_MAP[viewDetail.type]?.label||viewDetail.type}</Badge></DetailField>
                <DetailField label="ערוץ" value={CHANNEL_MAP[viewDetail.channel] || viewDetail.channel} />
                <DetailField label="סטטוס">{viewDetail.is_read ? <Badge className="bg-green-500/20 text-green-400">נקרא</Badge> : <Badge className="bg-red-500/20 text-red-400">חדש</Badge>}</DetailField>
                <div className="col-span-2"><DetailField label="הודעה" value={viewDetail.message} /></div>
                <div className="col-span-2"><DetailField label="נתונים נוספים" value={viewDetail.metadata ? JSON.stringify(viewDetail.metadata) : undefined} /></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                {!viewDetail.is_read && <button onClick={()=>{markRead(viewDetail.id);setViewDetail({...viewDetail,is_read:true});}} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm">סמן כנקרא</button>}
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
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת התראה" : "התראה חדשה"}</h2>
                <button onClick={()=>setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">כותרת *</label>
                  <input value={form.title||""} onChange={e=>setForm({...form,title:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="כותרת ההתראה" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג</label>
                    <select value={form.type||"info"} onChange={e=>setForm({...form,type:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(TYPE_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">ערוץ</label>
                    <select value={form.channel||"in_app"} onChange={e=>setForm({...form,channel:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(CHANNEL_MAP).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">הודעה *</label>
                  <textarea rows={4} value={form.message||""} onChange={e=>setForm({...form,message:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" placeholder="תוכן ההתראה" />
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={()=>setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50"><Save className="w-4 h-4" />{saving?"שולח...":"שלח"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ActivityLog entityType="notifications" entityId="all" />
        <RelatedRecords entityType="notifications" entityId="all" />
      </div>
    </div>
  );
}
