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
  FileText, Shield, Search, ArrowUpDown, Eye, X, AlertTriangle, Plus,
  User, Edit, Trash2, LogIn, Download, Clock, CheckCircle, Lock,
  Save, RefreshCw
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || d?.logs || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const DetailField = ({ label, value, children }: any) => (
  <div><span className="text-xs text-muted-foreground">{label}</span><div className="text-sm text-foreground mt-0.5">{children || value || "—"}</div></div>
);

const ACTION_MAP: Record<string, { label: string; color: string; icon: any }> = {
  login: { label: "כניסה", color: "bg-green-500/20 text-green-400", icon: LogIn },
  logout: { label: "יציאה", color: "bg-muted/20 text-muted-foreground", icon: LogIn },
  create: { label: "יצירה", color: "bg-blue-500/20 text-blue-400", icon: Edit },
  update: { label: "עדכון", color: "bg-amber-500/20 text-amber-400", icon: Edit },
  delete: { label: "מחיקה", color: "bg-red-500/20 text-red-400", icon: Trash2 },
  view: { label: "צפייה", color: "bg-cyan-500/20 text-cyan-400", icon: Eye },
  export: { label: "ייצוא", color: "bg-purple-500/20 text-purple-400", icon: Download },
  permission_change: { label: "שינוי הרשאות", color: "bg-orange-500/20 text-orange-400", icon: Lock },
};

const SEVERITY_MAP: Record<string, { label: string; color: string }> = {
  info: { label: "מידע", color: "bg-blue-500/20 text-blue-400" },
  warning: { label: "אזהרה", color: "bg-amber-500/20 text-amber-400" },
  critical: { label: "קריטי", color: "bg-red-500/20 text-red-400" },
};



export default function AuditPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [sortField, setSortField] = useState("timestamp");
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
      const res = await authFetch(`${API}/crm/security/audit`);
      if (res.ok) { const d = safeArray(await res.json()); setItems(d.length > 0 ? d : MOCK_LOGS); }
      else setItems(MOCK_LOGS);
    } catch { setItems(MOCK_LOGS); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const filtered = useMemo(() => {
    let data = items.filter(r =>
      (!search || `${r.user} ${r.resource} ${r.details} ${r.ip}`.toLowerCase().includes(search.toLowerCase())) &&
      (filterAction === "all" || r.action === filterAction) &&
      (filterSeverity === "all" || r.severity === filterSeverity)
    );
    data.sort((a: any, b: any) => { const va = a[sortField] ?? ""; const vb = b[sortField] ?? ""; const c = String(va).localeCompare(String(vb)); return sortDir === "asc" ? c : -c; });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterAction, filterSeverity, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ user: "", action: "view", resource: "", severity: "info", details: "", ip: "" });
    setShowForm(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({ user: r.user, action: r.action, resource: r.resource, severity: r.severity, details: r.details, ip: r.ip });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/crm/security/audit/${editing.id}` : `${API}/crm/security/audit`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false);
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק רשומת ביקורת זו?")) {
      await authFetch(`${API}/crm/security/audit/${id}`, { method: "DELETE" });
      load();
    }
  };

  const kpis = [
    { label: 'סה"כ רשומות', value: fmt(items.length), icon: FileText, color: "text-blue-400" },
    { label: "כניסות", value: fmt(items.filter(r => r.action === "login").length), icon: LogIn, color: "text-green-400" },
    { label: "שינויים", value: fmt(items.filter(r => ["create","update","delete"].includes(r.action)).length), icon: Edit, color: "text-amber-400" },
    { label: "ייצואים", value: fmt(items.filter(r => r.action === "export").length), icon: Download, color: "text-purple-400" },
    { label: "קריטיים", value: fmt(items.filter(r => r.severity === "critical").length), icon: AlertTriangle, color: "text-red-400" },
    { label: "משתמשים", value: fmt(new Set(items.map(r => r.user)).size), icon: User, color: "text-cyan-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Shield className="text-red-400 w-6 h-6" />יומן ביקורת</h1>
          <p className="text-sm text-muted-foreground mt-1">מעקב פעולות משתמשים — אבטחה ובקרה</p>
        </div>
        <div className="flex gap-2">
          <ExportDropdown data={filtered} headers={{ timestamp: "זמן", user: "משתמש", action: "פעולה", resource: "משאב", ip: "IP", severity: "חומרה", details: "פרטים" }} filename="audit_log" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> רשומה חדשה</button>
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
        <div className="relative flex-1 min-w-0 max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש משתמש, משאב, IP..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הפעולות</option>{Object.entries(ACTION_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
        <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל החומרות</option>{Object.entries(SEVERITY_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
        <span className="text-sm text-muted-foreground">{filtered.length} רשומות</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={() => setSelectedIds([])} entityName="audit" actions={defaultBulkActions(selectedIds, () => setSelectedIds([]), load, `${API}/crm/security/audit`)} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><FileText className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין רשומות</p><p className="text-sm mt-1">{search || filterAction !== "all" ? "נסה לשנות את הסינון" : "אין רשומות ביומן"}</p>{!(search) && <button onClick={() => openCreate()} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 text-sm font-medium flex items-center gap-2 mx-auto"><Plus className="w-4 h-4" />רשומה חדשה</button>}</div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
            {[["timestamp","זמן"],["user","משתמש"],["action","פעולה"],["resource","משאב"],["ip","IP"],["severity","חומרה"]].map(([f,l])=>(
              <th key={f} onClick={()=>toggleSort(f)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{l}<ArrowUpDown className="w-3 h-3" /></div></th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
          </tr></thead><tbody>
            {pagination.paginate(filtered).map(r=>(
              <tr key={r.id} className={`border-b border-border/20 hover:bg-muted/20 transition-colors ${r.severity==="critical"?"bg-red-500/5":""}`}>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.timestamp?.slice(0,16).replace("T"," ")||"—"}</td>
                <td className="px-4 py-3 text-foreground">{r.user}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${ACTION_MAP[r.action]?.color||""}`}>{ACTION_MAP[r.action]?.label||r.action}</Badge></td>
                <td className="px-4 py-3 text-muted-foreground">{r.resource||"—"}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground" dir="ltr">{r.ip||"—"}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${SEVERITY_MAP[r.severity]?.color||""}`}>{SEVERITY_MAP[r.severity]?.label||r.severity}</Badge></td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={()=>setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg" title="צפייה"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={()=>openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכה"><Edit className="w-3.5 h-3.5 text-blue-400" /></button>
                  {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.details || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg" title="מחיקה"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
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
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Shield className="w-5 h-5 text-red-400" />פירוט פעולה</h2><button onClick={()=>setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="זמן" value={viewDetail.timestamp?.slice(0,16).replace("T"," ")} />
                <DetailField label="משתמש" value={viewDetail.user} />
                <DetailField label="פעולה"><Badge className={ACTION_MAP[viewDetail.action]?.color}>{ACTION_MAP[viewDetail.action]?.label}</Badge></DetailField>
                <DetailField label="משאב" value={viewDetail.resource} />
                <DetailField label="כתובת IP" value={viewDetail.ip} />
                <DetailField label="חומרה"><Badge className={SEVERITY_MAP[viewDetail.severity]?.color}>{SEVERITY_MAP[viewDetail.severity]?.label}</Badge></DetailField>
                <DetailField label="דפדפן" value={viewDetail.user_agent} />
                <DetailField label="מזהה" value={viewDetail.id ? String(viewDetail.id) : undefined} />
                <div className="col-span-2"><DetailField label="פרטים" value={viewDetail.details} /></div>
              </div>
              <div className="border-t border-border">
                  <div className="flex gap-2 p-3 border-b border-border/50">
                    {[{id:"details",label:"פרטים"},{id:"activity",label:"פעילות"},{id:"related",label:"קשורים"}].map(tab=>(
                      <button key={tab.id} onClick={()=>setDetailTab(tab.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${detailTab===tab.id?"bg-primary text-primary-foreground":"text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>
                    ))}
                  </div>
                  {detailTab === "activity" && <div className="p-4"><ActivityLog entityType="audit" entityId={viewDetail.id} /></div>}
                  {detailTab === "related" && <div className="p-4"><RelatedRecords entityType="audit" entityId={viewDetail.id} /></div>}
                </div>
                <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={()=>{setViewDetail(null);openEdit(viewDetail);}} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30"><Edit className="w-3.5 h-3.5 inline ml-1" /> עריכה</button>
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
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת רשומה" : "רשומת ביקורת חדשה"}</h2>
                <button onClick={()=>setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">משתמש *</label>
                    <input value={form.user||""} onChange={e=>setForm({...form,user:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="user@company.com" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">פעולה *</label>
                    <select value={form.action||"view"} onChange={e=>setForm({...form,action:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(ACTION_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">משאב *</label>
                    <input value={form.resource||""} onChange={e=>setForm({...form,resource:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="שם המשאב" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">חומרה</label>
                    <select value={form.severity||"info"} onChange={e=>setForm({...form,severity:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(SEVERITY_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">כתובת IP</label>
                    <input value={form.ip||""} onChange={e=>setForm({...form,ip:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="192.168.1.1" dir="ltr" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">פרטים</label>
                  <textarea rows={3} value={form.details||""} onChange={e=>setForm({...form,details:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" placeholder="פרטים נוספים" />
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
        <ActivityLog entityType="audit" entityId="all" />
        <RelatedRecords entityType="audit" entityId="all" />
      </div>
    </div>
  );
}
