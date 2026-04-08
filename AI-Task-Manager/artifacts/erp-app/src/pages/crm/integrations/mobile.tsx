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
  Smartphone, Search, ArrowUpDown, Eye, X, AlertTriangle, Plus,
  CheckCircle, Clock, Download, Users, WifiOff, RefreshCw, Star,
  Edit2, Trash2, Save, Settings, Shield
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const DetailField = ({ label, value, children }: any) => (
  <div><span className="text-xs text-muted-foreground">{label}</span><div className="text-sm text-foreground mt-0.5">{children || value || "—"}</div></div>
);

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  synced: { label: "מסונכרן", color: "bg-green-500/20 text-green-400" },
  pending: { label: "ממתין", color: "bg-amber-500/20 text-amber-400" },
  offline: { label: "לא מקוון", color: "bg-muted/20 text-muted-foreground" },
  error: { label: "שגיאה", color: "bg-red-500/20 text-red-400" },
};



export default function MobileIntegrationsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("users");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`${API}/crm/integrations/mobile`);
      if (res.ok) { const d = await res.json(); setItems(safeArray(d).length > 0 ? safeArray(d) : MOCK_PLATFORMS); }
      else setItems(MOCK_PLATFORMS);
    } catch { setItems(MOCK_PLATFORMS); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const filtered = useMemo(() => {
    let data = items.filter(r => (!search || `${r.platform} ${r.version}`.toLowerCase().includes(search.toLowerCase())) && (filterStatus === "all" || r.status === filterStatus));
    data.sort((a: any, b: any) => { const va = a[sortField] ?? ""; const vb = b[sortField] ?? ""; const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb)); return sortDir === "asc" ? c : -c; });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ platform: "", version: "", status: "pending", users: 0, downloads: 0, rating: 0, minOsVersion: "", pushEnabled: false });
    setShowForm(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({ platform: r.platform, version: r.version, status: r.status, users: r.users || 0, downloads: r.downloads || 0, rating: r.rating || 0, minOsVersion: r.minOsVersion || "", pushEnabled: r.pushEnabled || false });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/crm/integrations/mobile/${editing.id}` : `${API}/crm/integrations/mobile`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false);
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק פלטפורמה זו?")) {
      await authFetch(`${API}/crm/integrations/mobile/${id}`, { method: "DELETE" });
      load();
    }
  };

  const totalUsers = items.reduce((s, r) => s + (r.users || 0), 0);
  const totalDownloads = items.reduce((s, r) => s + (r.downloads || 0), 0);
  const avgRating = items.length > 0 ? (items.reduce((s, r) => s + (r.rating || 0), 0) / items.length).toFixed(1) : "0";
  const syncedCount = items.filter(r => r.status === "synced").length;

  const kpis = [
    { label: "פלטפורמות", value: fmt(items.length), icon: Smartphone, color: "text-blue-400" },
    { label: "מסונכרנות", value: fmt(syncedCount), icon: CheckCircle, color: "text-green-400" },
    { label: "משתמשים פעילים", value: fmt(totalUsers), icon: Users, color: "text-cyan-400" },
    { label: "הורדות", value: fmt(totalDownloads), icon: Download, color: "text-purple-400" },
    { label: "דירוג ממוצע", value: avgRating, icon: Star, color: "text-amber-400" },
    { label: "לא מקוון", value: fmt(items.filter(r => r.status === "offline").length), icon: WifiOff, color: "text-red-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Smartphone className="text-cyan-400 w-6 h-6" />אינטגרציות מובייל</h1>
          <p className="text-sm text-muted-foreground mt-1">סנכרון אפליקציות מובייל — iOS, Android ו-PWA</p>
        </div>
        <div className="flex gap-2">
          <ExportDropdown data={filtered} headers={{ platform: "פלטפורמה", version: "גרסה", users: "משתמשים", downloads: "הורדות", rating: "דירוג", status: "סטטוס" }} filename="mobile_integrations" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> פלטפורמה חדשה</button>
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
        <div className="relative flex-1 min-w-0 max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש פלטפורמה, גרסה..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסטטוסים</option>{Object.entries(STATUS_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
        <button onClick={load} className="flex items-center gap-1 px-3 py-2.5 bg-card border border-border rounded-xl text-sm hover:bg-muted"><RefreshCw className="w-4 h-4" /> רענן</button>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={() => setSelectedIds([])} entityName="mobile" actions={defaultBulkActions(selectedIds, () => setSelectedIds([]), load, `${API}/crm/integrations/mobile`)} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Smartphone className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין פלטפורמות</p><p className="text-sm mt-1">{search || filterStatus !== "all" ? "נסה לשנות את הסינון" : "הוסף פלטפורמה חדשה"}</p>{!(search || filterStatus !== "all") && <button onClick={() => openCreate()} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 text-sm font-medium flex items-center gap-2 mx-auto"><Plus className="w-4 h-4" />פלטפורמה חדשה</button>}</div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
            {[["platform","פלטפורמה"],["version","גרסה"],["users","משתמשים"],["downloads","הורדות"],["rating","דירוג"],["lastSync","סנכרון"],["status","סטטוס"]].map(([f,l])=>(
              <th key={f} onClick={()=>toggleSort(f)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{l}<ArrowUpDown className="w-3 h-3" /></div></th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
          </tr></thead><tbody>
            {pagination.paginate(filtered).map(r=>(
              <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground"><span className="ml-2">{r.icon}</span>{r.platform}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.version||"—"}</td>
                <td className="px-4 py-3 text-cyan-400 font-medium">{fmt(r.users||0)}</td>
                <td className="px-4 py-3 text-muted-foreground">{fmt(r.downloads||0)}</td>
                <td className="px-4 py-3"><span className="text-amber-400">{"★".repeat(Math.round(r.rating||0))}</span> <span className="text-xs text-muted-foreground">{r.rating}</span></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.lastSync||"—"}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${STATUS_MAP[r.status]?.color||""}`}>{STATUS_MAP[r.status]?.label||r.status}</Badge></td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={()=>setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg" title="צפייה"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={()=>openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכה"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                  {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.id || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg" title="מחיקה"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
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
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{viewDetail.icon} {viewDetail.platform}</h2><button onClick={()=>setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="פלטפורמה" value={viewDetail.platform} />
                <DetailField label="גרסה" value={viewDetail.version} />
                <DetailField label="משתמשים" value={fmt(viewDetail.users||0)} />
                <DetailField label="הורדות" value={fmt(viewDetail.downloads||0)} />
                <DetailField label="דירוג" value={String(viewDetail.rating||0)} />
                <DetailField label="סנכרון אחרון" value={viewDetail.lastSync} />
                <DetailField label="גרסת מערכת הפעלה" value={viewDetail.minOsVersion} />
                <DetailField label="התראות Push">{viewDetail.pushEnabled ? <Badge className="bg-green-500/20 text-green-400">פעיל</Badge> : <Badge className="bg-red-500/20 text-red-400">כבוי</Badge>}</DetailField>
                <DetailField label="סטטוס"><Badge className={STATUS_MAP[viewDetail.status]?.color}>{STATUS_MAP[viewDetail.status]?.label}</Badge></DetailField>
              </div>
              <div className="border-t border-border">
                  <div className="flex gap-2 p-3 border-b border-border/50">
                    {[{id:"details",label:"פרטים"},{id:"activity",label:"פעילות"},{id:"related",label:"קשורים"}].map(tab=>(
                      <button key={tab.id} onClick={()=>setDetailTab(tab.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${detailTab===tab.id?"bg-primary text-primary-foreground":"text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>
                    ))}
                  </div>
                  {detailTab === "activity" && <div className="p-4"><ActivityLog entityType="mobile" entityId={viewDetail.id} /></div>}
                  {detailTab === "related" && <div className="p-4"><RelatedRecords entityType="mobile" entityId={viewDetail.id} /></div>}
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
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת פלטפורמה" : "פלטפורמה חדשה"}</h2>
                <button onClick={()=>setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">שם פלטפורמה *</label>
                    <input value={form.platform||""} onChange={e=>setForm({...form,platform:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="iOS / Android / PWA" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">גרסה *</label>
                    <input value={form.version||""} onChange={e=>setForm({...form,version:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="v2.0.0" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                    <select value={form.status||"pending"} onChange={e=>setForm({...form,status:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(STATUS_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">גרסת OS מינימלית</label>
                    <input value={form.minOsVersion||""} onChange={e=>setForm({...form,minOsVersion:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="iOS 15+" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">משתמשים</label>
                    <input type="number" min={0} value={form.users??""} onChange={e=>setForm({...form,users:Number(e.target.value)})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">הורדות</label>
                    <input type="number" min={0} value={form.downloads??""} onChange={e=>setForm({...form,downloads:Number(e.target.value)})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={form.pushEnabled||false} onChange={e=>setForm({...form,pushEnabled:e.target.checked})} className="rounded" />
                  <label className="text-sm text-muted-foreground">הפעל התראות Push</label>
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
        <ActivityLog entityType="mobile" entityId="all" />
        <RelatedRecords entityType="mobile" entityId="all" />
      </div>
    </div>
  );
}
