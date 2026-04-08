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
  Activity, Search, ArrowUpDown, Eye, X, AlertTriangle, RefreshCw, Plus,
  UserPlus, DollarSign, Phone, Mail, Star, Clock, TrendingUp, MessageSquare,
  Edit2, Trash2, Save
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || d?.feed || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const DetailField = ({ label, value, children }: any) => (
  <div><span className="text-xs text-muted-foreground">{label}</span><div className="text-sm text-foreground mt-0.5">{children || value || "—"}</div></div>
);

const TYPE_MAP: Record<string, { label: string; color: string; icon: any }> = {
  lead_created: { label: "ליד חדש", color: "bg-green-500/20 text-green-400", icon: UserPlus },
  deal_closed: { label: "עסקה נסגרה", color: "bg-blue-500/20 text-blue-400", icon: DollarSign },
  call_made: { label: "שיחה", color: "bg-purple-500/20 text-purple-400", icon: Phone },
  email_sent: { label: 'דוא"ל', color: "bg-cyan-500/20 text-cyan-400", icon: Mail },
  note_added: { label: "הערה", color: "bg-amber-500/20 text-amber-400", icon: MessageSquare },
  status_change: { label: "שינוי סטטוס", color: "bg-orange-500/20 text-orange-400", icon: TrendingUp },
};

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  high: { label: "גבוה", color: "bg-red-500/20 text-red-400" },
  medium: { label: "בינוני", color: "bg-amber-500/20 text-amber-400" },
  low: { label: "נמוך", color: "bg-green-500/20 text-green-400" },
};

export default function FeedsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
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
      const res = await authFetch(`${API}/crm/activity-feed`);
      if (res.ok) setItems(safeArray(await res.json()).map((r: any, i: number) => ({ ...r, id: r.id || i + 1 })));
    } catch (e: any) { setError(e.message || "שגיאה"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const filtered = useMemo(() => {
    let data = items.filter(r =>
      (!search || `${r.description} ${r.user_name} ${r.entity_type}`.toLowerCase().includes(search.toLowerCase())) &&
      (filterType === "all" || r.activity_type === filterType) &&
      (filterPriority === "all" || r.priority === filterPriority)
    );
    data.sort((a: any, b: any) => { const va = a[sortField] ?? ""; const vb = b[sortField] ?? ""; const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb)); return sortDir === "asc" ? c : -c; });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterType, filterPriority, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ activity_type: "note_added", description: "", user_name: "", entity_type: "", priority: "medium" });
    setShowForm(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({ activity_type: r.activity_type || "", description: r.description || "", user_name: r.user_name || "", entity_type: r.entity_type || "", priority: r.priority || "medium" });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/crm/activity-feed/${editing.id}` : `${API}/crm/activity-feed`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false);
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק פעילות זו? פעולה זו אינה ניתנת לביטול.")) {
      await authFetch(`${API}/crm/activity-feed/${id}`, { method: "DELETE" });
      load();
    }
  };

  const typeCount = (t: string) => items.filter(r => r.activity_type === t).length;
  const kpis = [
    { label: 'סה"כ פעילויות', value: fmt(items.length), icon: Activity, color: "text-blue-400" },
    { label: "לידים חדשים", value: fmt(typeCount("lead_created")), icon: UserPlus, color: "text-green-400" },
    { label: "עסקאות", value: fmt(typeCount("deal_closed")), icon: DollarSign, color: "text-cyan-400" },
    { label: "שיחות", value: fmt(typeCount("call_made")), icon: Phone, color: "text-purple-400" },
    { label: "מיילים", value: fmt(typeCount("email_sent")), icon: Mail, color: "text-amber-400" },
    { label: "אחרון", value: items[0]?.created_at?.slice(11, 16) || "—", icon: Clock, color: "text-orange-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Activity className="text-green-400 w-6 h-6" />פיד פעילות</h1>
          <p className="text-sm text-muted-foreground mt-1">מעקב פעילויות בזמן אמת — לידים, עסקאות, שיחות</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border rounded-xl text-sm hover:bg-muted"><RefreshCw className="w-4 h-4" /> רענן</button>
          <ExportDropdown data={filtered} headers={{ created_at: "זמן", activity_type: "סוג", user_name: "משתמש", description: "תיאור", entity_type: "ישות", priority: "דחיפות" }} filename="activity_feed" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> פעילות חדשה</button>
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
        <div className="relative flex-1 min-w-0 max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי תיאור, משתמש, ישות..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסוגים</option>{Object.entries(TYPE_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הדחיפויות</option>{Object.entries(PRIORITY_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
        <span className="text-sm text-muted-foreground">{filtered.length} פעילויות</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={() => setSelectedIds([])} entityName="feeds" actions={defaultBulkActions(selectedIds, () => setSelectedIds([]), load, `${API}/crm/realtime/feeds`)} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Activity className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין פעילויות</p><p className="text-sm mt-1">{search || filterType !== "all" ? "נסה לשנות את הסינון" : "לחץ על פעילות חדשה כדי להתחיל"}</p>{!(search || filterType !== "all") && <button onClick={() => openCreate()} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 text-sm font-medium flex items-center gap-2 mx-auto"><Plus className="w-4 h-4" />פעילות חדשה</button>}</div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
            {[["created_at","זמן"],["activity_type","סוג"],["user_name","משתמש"],["description","תיאור"],["entity_type","ישות"],["priority","דחיפות"]].map(([f,l])=>(
              <th key={f} onClick={()=>toggleSort(f)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{l}<ArrowUpDown className="w-3 h-3" /></div></th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
          </tr></thead><tbody>
            {pagination.paginate(filtered).map(r=>(
              <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.created_at?.slice(0,16).replace("T"," ")||"—"}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${TYPE_MAP[r.activity_type]?.color||"bg-muted/20 text-muted-foreground"}`}>{TYPE_MAP[r.activity_type]?.label||r.activity_type||"—"}</Badge></td>
                <td className="px-4 py-3 text-foreground">{r.user_name||"—"}</td>
                <td className="px-4 py-3 text-muted-foreground max-w-[300px] truncate">{r.description||"—"}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.entity_type||"—"}</td>
                <td className="px-4 py-3">{r.priority ? <Badge className={`text-[10px] ${PRIORITY_MAP[r.priority]?.color || ""}`}>{PRIORITY_MAP[r.priority]?.label || r.priority}</Badge> : "—"}</td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={()=>setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg" title="צפייה"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={()=>openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכה"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                  {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.entity_type || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg" title="מחיקה"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
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
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Activity className="w-5 h-5 text-green-400" />פירוט פעילות</h2><button onClick={()=>setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="זמן" value={viewDetail.created_at?.slice(0,16).replace("T"," ")} />
                <DetailField label="סוג"><Badge className={TYPE_MAP[viewDetail.activity_type]?.color}>{TYPE_MAP[viewDetail.activity_type]?.label||viewDetail.activity_type}</Badge></DetailField>
                <DetailField label="משתמש" value={viewDetail.user_name} />
                <DetailField label="ישות" value={viewDetail.entity_type} />
                <DetailField label="דחיפות">{viewDetail.priority ? <Badge className={PRIORITY_MAP[viewDetail.priority]?.color}>{PRIORITY_MAP[viewDetail.priority]?.label}</Badge> : <span>—</span>}</DetailField>
                <DetailField label="מזהה ישות" value={viewDetail.entity_id ? String(viewDetail.entity_id) : undefined} />
                <div className="col-span-2"><DetailField label="תיאור" value={viewDetail.description} /></div>
                <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
              </div>
              <div className="border-t border-border">
                  <div className="flex gap-2 p-3 border-b border-border/50">
                    {[{id:"details",label:"פרטים"},{id:"activity",label:"פעילות"},{id:"related",label:"קשורים"}].map(tab=>(
                      <button key={tab.id} onClick={()=>setDetailTab(tab.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${detailTab===tab.id?"bg-primary text-primary-foreground":"text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>
                    ))}
                  </div>
                  {detailTab === "activity" && <div className="p-4"><ActivityLog entityType="feeds" entityId={viewDetail.id} /></div>}
                  {detailTab === "related" && <div className="p-4"><RelatedRecords entityType="feeds" entityId={viewDetail.id} /></div>}
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
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת פעילות" : "פעילות חדשה"}</h2>
                <button onClick={()=>setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג פעילות *</label>
                    <select value={form.activity_type||""} onChange={e=>setForm({...form,activity_type:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(TYPE_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">דחיפות</label>
                    <select value={form.priority||"medium"} onChange={e=>setForm({...form,priority:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(PRIORITY_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">שם משתמש *</label>
                    <input value={form.user_name||""} onChange={e=>setForm({...form,user_name:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="שם המשתמש" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג ישות</label>
                    <input value={form.entity_type||""} onChange={e=>setForm({...form,entity_type:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="ליד / עסקה / לקוח" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור *</label>
                  <textarea rows={3} value={form.description||""} onChange={e=>setForm({...form,description:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" placeholder="תיאור הפעילות" />
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={()=>setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50">
                  <Save className="w-4 h-4" />{saving ? "שומר..." : "שמור"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ActivityLog entityType="feeds" entityId="all" />
        <RelatedRecords entityType="feeds" entityId="all" />
      </div>
    </div>
  );
}
