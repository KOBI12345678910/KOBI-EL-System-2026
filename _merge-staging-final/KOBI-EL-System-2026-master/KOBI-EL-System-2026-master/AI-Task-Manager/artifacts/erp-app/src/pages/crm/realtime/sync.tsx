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
  RefreshCw, Search, ArrowUpDown, Eye, X, AlertTriangle, Plus,
  Smartphone, Monitor, Laptop, CheckCircle, Clock, WifiOff,
  Database, HardDrive, Edit2, Trash2, Save, Zap
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || d?.devices || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const DetailField = ({ label, value, children }: any) => (
  <div><span className="text-xs text-muted-foreground">{label}</span><div className="text-sm text-foreground mt-0.5">{children || value || "—"}</div></div>
);

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  synced: { label: "מסונכרן", color: "bg-green-500/20 text-green-400" },
  syncing: { label: "מסנכרן", color: "bg-blue-500/20 text-blue-400" },
  pending: { label: "ממתין", color: "bg-amber-500/20 text-amber-400" },
  error: { label: "שגיאה", color: "bg-red-500/20 text-red-400" },
  offline: { label: "לא מקוון", color: "bg-muted/20 text-muted-foreground" },
};

const TYPE_MAP: Record<string, { label: string; icon: any }> = {
  smartphone: { label: "טלפון", icon: Smartphone },
  desktop: { label: "מחשב שולחני", icon: Monitor },
  laptop: { label: "מחשב נייד", icon: Laptop },
  tablet: { label: "טאבלט", icon: Smartphone },
  server: { label: "שרת", icon: HardDrive },
};

export default function SyncPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortField, setSortField] = useState("last_sync");
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
      const [r1, r2] = await Promise.all([authFetch(`${API}/crm-sync-devices`), authFetch(`${API}/crm-sync-devices/stats`)]);
      if (r1.ok) setItems(safeArray(await r1.json()));
      if (r2.ok) setStats((await r2.json()) || {});
    } catch (e: any) { setError(e.message || "שגיאה"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const filtered = useMemo(() => {
    let data = items.filter(r =>
      (!search || `${r.device_name} ${r.device_type} ${r.user_name} ${r.device_number}`.toLowerCase().includes(search.toLowerCase())) &&
      (filterStatus === "all" || r.sync_status === filterStatus) &&
      (filterType === "all" || r.device_type === filterType)
    );
    data.sort((a: any, b: any) => { const va = a[sortField] ?? ""; const vb = b[sortField] ?? ""; const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb)); return sortDir === "asc" ? c : -c; });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, filterType, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ device_name: "", device_type: "smartphone", user_name: "", sync_status: "pending", app_version: "", ip_address: "" });
    setShowForm(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({ device_name: r.device_name, device_type: r.device_type, user_name: r.user_name, sync_status: r.sync_status, app_version: r.app_version || "", ip_address: r.ip_address || "" });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/crm-sync-devices/${editing.id}` : `${API}/crm-sync-devices`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false);
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק מכשיר זה מהסנכרון?")) {
      await authFetch(`${API}/crm-sync-devices/${id}`, { method: "DELETE" });
      load();
    }
  };

  const syncedCount = items.filter(r => r.sync_status === "synced").length;
  const kpis = [
    { label: 'סה"כ מכשירים', value: fmt(stats.total || items.length), icon: Monitor, color: "text-blue-400" },
    { label: "מסונכרנים", value: fmt(stats.synced_count || syncedCount), icon: CheckCircle, color: "text-green-400" },
    { label: "ממתינים", value: fmt(stats.pending_count || items.filter(r => r.sync_status === "pending").length), icon: Clock, color: "text-amber-400" },
    { label: "שגיאות", value: fmt(stats.error_count || items.filter(r => r.sync_status === "error").length), icon: AlertTriangle, color: "text-red-400" },
    { label: "לא מקוונים", value: fmt(stats.offline_count || items.filter(r => r.sync_status === "offline").length), icon: WifiOff, color: "text-muted-foreground" },
    { label: "רשומות מסונכרנות", value: fmt(stats.total_records || items.reduce((s, r) => s + (r.records_synced || 0), 0)), icon: Database, color: "text-cyan-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><RefreshCw className="text-cyan-400 w-6 h-6" />סנכרון נתונים</h1>
          <p className="text-sm text-muted-foreground mt-1">מעקב סנכרון מכשירים — סטטוס ורשומות</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border rounded-xl text-sm hover:bg-muted"><RefreshCw className="w-4 h-4" /> רענן</button>
          <ExportDropdown data={filtered} headers={{ device_number: "מספר", device_name: "מכשיר", device_type: "סוג", user_name: "משתמש", records_synced: "רשומות", sync_status: "סטטוס" }} filename="sync_devices" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> מכשיר חדש</button>
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
        <div className="relative flex-1 min-w-0 max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש מכשיר, משתמש..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסטטוסים</option>{Object.entries(STATUS_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסוגים</option>{Object.entries(TYPE_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
        <span className="text-sm text-muted-foreground">{filtered.length} מכשירים</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={() => setSelectedIds([])} entityName="sync" actions={defaultBulkActions(selectedIds, () => setSelectedIds([]), load, `${API}/crm/realtime/sync`)} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><RefreshCw className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין מכשירים</p><p className="text-sm mt-1">{search || filterStatus !== "all" ? "נסה לשנות את הסינון" : "הוסף מכשיר חדש"}</p>{!(search || filterType !== "all" || filterStatus !== "all") && <button onClick={() => openCreate()} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 text-sm font-medium flex items-center gap-2 mx-auto"><Plus className="w-4 h-4" />מכשיר חדש</button>}</div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
            {[["device_number","מספר"],["device_name","מכשיר"],["device_type","סוג"],["user_name","משתמש"],["records_synced","רשומות"],["last_sync","סנכרון אחרון"],["sync_status","סטטוס"]].map(([f,l])=>(
              <th key={f} onClick={()=>toggleSort(f)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{l}<ArrowUpDown className="w-3 h-3" /></div></th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
          </tr></thead><tbody>
            {pagination.paginate(filtered).map(r=>{
              const TypeIcon = TYPE_MAP[r.device_type]?.icon || Monitor;
              return (
                <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.device_number||"—"}</td>
                  <td className="px-4 py-3 font-medium text-foreground flex items-center gap-2"><TypeIcon className="w-4 h-4 text-muted-foreground" />{r.device_name||"—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{TYPE_MAP[r.device_type]?.label || r.device_type || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.user_name||"—"}</td>
                  <td className="px-4 py-3 text-cyan-400">{fmt(r.records_synced||0)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{r.last_sync?.slice(0,16).replace("T"," ")||"—"}</td>
                  <td className="px-4 py-3"><Badge className={`text-[10px] ${STATUS_MAP[r.sync_status]?.color||""}`}>{STATUS_MAP[r.sync_status]?.label||r.sync_status}</Badge></td>
                  <td className="px-4 py-3"><div className="flex gap-1">
                    <button onClick={()=>setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg" title="צפייה"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    <button onClick={()=>openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכה"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                    {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.user_name || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg" title="מחיקה"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                  </div></td>
                </tr>
              );
            })}
          </tbody></table>
        </div></div>
        <SmartPagination pagination={pagination} />
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={()=>setViewDetail(null)}>
            <motion.div initial={{scale:0.95}} animate={{scale:1}} exit={{scale:0.95}} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e=>e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground flex items-center gap-2"><RefreshCw className="w-5 h-5 text-cyan-400" />{viewDetail.device_name}</h2><button onClick={()=>setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="מספר מכשיר" value={viewDetail.device_number} />
                <DetailField label="מכשיר" value={viewDetail.device_name} />
                <DetailField label="סוג" value={TYPE_MAP[viewDetail.device_type]?.label || viewDetail.device_type} />
                <DetailField label="משתמש" value={viewDetail.user_name} />
                <DetailField label="רשומות מסונכרנות" value={fmt(viewDetail.records_synced||0)} />
                <DetailField label="סנכרון אחרון" value={viewDetail.last_sync?.slice(0,16).replace("T"," ")} />
                <DetailField label="גרסה" value={viewDetail.app_version} />
                <DetailField label="כתובת IP" value={viewDetail.ip_address} />
                <DetailField label="סטטוס"><Badge className={STATUS_MAP[viewDetail.sync_status]?.color}>{STATUS_MAP[viewDetail.sync_status]?.label}</Badge></DetailField>
              </div>
              <div className="border-t border-border">
                  <div className="flex gap-2 p-3 border-b border-border/50">
                    {[{id:"details",label:"פרטים"},{id:"activity",label:"פעילות"},{id:"related",label:"קשורים"}].map(tab=>(
                      <button key={tab.id} onClick={()=>setDetailTab(tab.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${detailTab===tab.id?"bg-primary text-primary-foreground":"text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>
                    ))}
                  </div>
                  {detailTab === "activity" && <div className="p-4"><ActivityLog entityType="sync" entityId={viewDetail.id} /></div>}
                  {detailTab === "related" && <div className="p-4"><RelatedRecords entityType="sync" entityId={viewDetail.id} /></div>}
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
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת מכשיר" : "מכשיר חדש"}</h2>
                <button onClick={()=>setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">שם מכשיר *</label>
                    <input value={form.device_name||""} onChange={e=>setForm({...form,device_name:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="שם המכשיר" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג מכשיר *</label>
                    <select value={form.device_type||"smartphone"} onChange={e=>setForm({...form,device_type:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(TYPE_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">משתמש *</label>
                    <input value={form.user_name||""} onChange={e=>setForm({...form,user_name:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="שם המשתמש" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                    <select value={form.sync_status||"pending"} onChange={e=>setForm({...form,sync_status:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(STATUS_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">גרסת אפליקציה</label>
                    <input value={form.app_version||""} onChange={e=>setForm({...form,app_version:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="v2.0.0" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">כתובת IP</label>
                    <input value={form.ip_address||""} onChange={e=>setForm({...form,ip_address:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="192.168.1.1" dir="ltr" />
                  </div>
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
        <ActivityLog entityType="sync" entityId="all" />
        <RelatedRecords entityType="sync" entityId="all" />
      </div>
    </div>
  );
}
