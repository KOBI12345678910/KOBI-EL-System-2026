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
  Zap, Plus, Pencil, Trash2, Search, ArrowUpDown, Eye, X, AlertTriangle,
  Play, Pause, CheckCircle, Clock, Target, Activity, Mail, Bell
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  paused: { label: "מושהה", color: "bg-amber-500/20 text-amber-400" },
  draft: { label: "טיוטה", color: "bg-muted/20 text-muted-foreground" },
  error: { label: "שגיאה", color: "bg-red-500/20 text-red-400" },
};

const TRIGGER_TYPES = ["lead_score_change", "deal_stage_change", "overdue_payment", "new_lead", "customer_inactive", "task_overdue", "email_bounce", "meeting_scheduled"];
const ACTION_TYPES = ["send_email", "send_sms", "create_task", "notify_user", "update_field", "webhook", "create_note"];

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

const emptyForm: any = { name: "", description: "", trigger_event: "new_lead", action_type: "notify_user", status: "active", conditions: "" };

export default function TriggersPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [r1, r2] = await Promise.all([authFetch(`${API}/crm-automations`), authFetch(`${API}/crm-automations/stats`)]);
      if (r1.ok) setItems(safeArray(await r1.json()));
      if (r2.ok) setStats((await r2.json()) || {});
    } catch (e: any) { setError(e.message || "שגיאה"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    const url = editItem ? `${API}/crm-automations/${editItem.id}` : `${API}/crm-automations`;
    try {
      await authFetch(url, { method: editItem ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); setEditItem(null); setForm(emptyForm); load();
    } catch {}
  };

  const handleDelete = async (id: number) => {
    const ok = await globalConfirm({ title: "מחיקת טריגר", message: "למחוק טריגר?", confirmText: "מחק", variant: "destructive" });
    if (!ok) return;
    try { await authFetch(`${API}/crm-automations/${id}`, { method: "DELETE" }); load(); } catch {}
  };

  const toggleStatus = async (r: any) => {
    const newStatus = r.status === "active" ? "paused" : "active";
    try { await authFetch(`${API}/crm-automations/${r.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...r, status: newStatus }) }); load(); } catch {}
  };

  const openEdit = (r: any) => { setEditItem(r); setForm({ name: r.name, description: r.description, trigger_event: r.trigger_event, action_type: r.action_type, status: r.status, conditions: r.conditions }); setShowForm(true); };
  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const filtered = useMemo(() => {
    let data = items.filter(r => (!search || `${r.name} ${r.automation_number} ${r.trigger_event} ${r.action_type}`.toLowerCase().includes(search.toLowerCase())) && (filterStatus === "all" || r.status === filterStatus));
    data.sort((a: any, b: any) => { const va = a[sortField] ?? ""; const vb = b[sortField] ?? ""; const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb)); return sortDir === "asc" ? c : -c; });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, sortField, sortDir]);

  const kpis = [
    { label: "סה\"כ טריגרים", value: fmt(stats.total || items.length), icon: Zap, color: "text-blue-400" },
    { label: "פעילים", value: fmt(stats.active_count || items.filter(r => r.status === "active").length), icon: CheckCircle, color: "text-green-400" },
    { label: "מושהים", value: fmt(stats.paused_count || items.filter(r => r.status === "paused").length), icon: Pause, color: "text-amber-400" },
    { label: "הפעלות היום", value: fmt(stats.today_executions || 0), icon: Activity, color: "text-cyan-400" },
    { label: "הפעלות החודש", value: fmt(stats.month_executions || 0), icon: Target, color: "text-purple-400" },
    { label: "שגיאות", value: fmt(stats.error_count || 0), icon: AlertTriangle, color: "text-red-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Zap className="text-amber-400 w-6 h-6" />טריגרים ואוטומציות</h1>
          <p className="text-sm text-muted-foreground mt-1">הגדרת אוטומציות — כאשר קורה X, בצע Y</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setEditItem(null); setForm(emptyForm); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm"><Plus className="w-4 h-4" /> טריגר חדש</button>
          <ExportDropdown data={filtered} headers={{ automation_number: "מספר", name: "שם", trigger_event: "אירוע", action_type: "פעולה", execution_count: "הפעלות", status: "סטטוס" }} filename="triggers" />
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
        <div className="relative flex-1 min-w-0 max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש טריגרים..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסטטוסים</option>{Object.entries(STATUS_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
        <span className="text-sm text-muted-foreground">{filtered.length} טריגרים</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={() => setSelectedIds([])} entityName="triggers" actions={defaultBulkActions(selectedIds, () => setSelectedIds([]), load, `${API}/crm/realtime/triggers`)} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Zap className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין טריגרים</p></div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
            {[["automation_number","מספר"],["name","שם"],["trigger_event","אירוע"],["action_type","פעולה"],["execution_count","הפעלות"],["status","סטטוס"]].map(([f,l])=>(
              <th key={f} onClick={()=>toggleSort(f)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{l}<ArrowUpDown className="w-3 h-3" /></div></th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
          </tr></thead><tbody>
            {pagination.paginate(filtered).map(r=>(
              <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.automation_number||"—"}</td>
                <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                <td className="px-4 py-3"><Badge className="text-[10px] bg-blue-500/20 text-blue-400 font-mono">{r.trigger_event||"—"}</Badge></td>
                <td className="px-4 py-3"><Badge className="text-[10px] bg-purple-500/20 text-purple-400 font-mono">{r.action_type||"—"}</Badge></td>
                <td className="px-4 py-3 text-cyan-400">{fmt(r.execution_count||0)}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${STATUS_MAP[r.status]?.color||""}`}>{STATUS_MAP[r.status]?.label||r.status}</Badge></td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={()=>setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={()=>toggleStatus(r)} className="p-1.5 hover:bg-muted rounded-lg">{r.status==="active"?<Pause className="w-3.5 h-3.5 text-amber-400" />:<Play className="w-3.5 h-3.5 text-green-400" />}</button>
                  <button onClick={()=>openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Pencil className="w-3.5 h-3.5 text-blue-400" /></button>
                  {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.name || r.id}'? פעולה זו אינה ניתנת לביטול.`))handleDelete(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
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
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{viewDetail.name}</h2><button onClick={()=>setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="מספר" value={viewDetail.automation_number} />
                <DetailField label="אירוע" value={viewDetail.trigger_event} />
                <DetailField label="פעולה" value={viewDetail.action_type} />
                <DetailField label="הפעלות" value={fmt(viewDetail.execution_count||0)} />
                <DetailField label="סטטוס"><Badge className={STATUS_MAP[viewDetail.status]?.color}>{STATUS_MAP[viewDetail.status]?.label}</Badge></DetailField>
                <DetailField label="הפעלה אחרונה" value={viewDetail.last_executed_at?.slice(0,16).replace("T"," ")||"—"} />
                <div className="col-span-2"><DetailField label="תיאור" value={viewDetail.description} /></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end"><button onClick={()=>setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={()=>{setShowForm(false);setEditItem(null);}}>
            <motion.div initial={{scale:0.95}} animate={{scale:1}} exit={{scale:0.95}} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e=>e.stopPropagation()}>
              <div className="p-5 border-b border-border"><h2 className="text-lg font-bold text-foreground">{editItem?"עריכת טריגר":"טריגר חדש"}</h2></div>
              <div className="p-5 space-y-4">
                <div><label className="text-xs text-muted-foreground">שם *</label><input className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.name||""} onChange={e=>setForm({...form,name:e.target.value})} /></div>
                <div><label className="text-xs text-muted-foreground">תיאור</label><textarea rows={2} className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.description||""} onChange={e=>setForm({...form,description:e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs text-muted-foreground">אירוע</label><select className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.trigger_event} onChange={e=>setForm({...form,trigger_event:e.target.value})}>{TRIGGER_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                  <div><label className="text-xs text-muted-foreground">פעולה</label><select className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.action_type} onChange={e=>setForm({...form,action_type:e.target.value})}>{ACTION_TYPES.map(a=><option key={a} value={a}>{a}</option>)}</select></div>
                </div>
                <div><label className="text-xs text-muted-foreground">סטטוס</label><select className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{Object.entries(STATUS_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={()=>{setShowForm(false);setEditItem(null);}} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={handleSave} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm">שמירה</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ActivityLog entityType="triggers" entityId="all" />
        <RelatedRecords entityType="triggers" entityId="all" />
      </div>
    </div>
  );
}
