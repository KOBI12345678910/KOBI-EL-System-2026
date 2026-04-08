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
  Lock, Shield, Search, ArrowUpDown, Eye, X, AlertTriangle, Plus,
  Key, CheckCircle, XCircle, Database, FileText, Server, RefreshCw,
  Edit2, Trash2, Save
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const DetailField = ({ label, value, children }: any) => (
  <div><span className="text-xs text-muted-foreground">{label}</span><div className="text-sm text-foreground mt-0.5">{children || value || "—"}</div></div>
);

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  encrypted: { label: "מוצפן", color: "bg-green-500/20 text-green-400" },
  partial: { label: "חלקי", color: "bg-amber-500/20 text-amber-400" },
  unencrypted: { label: "לא מוצפן", color: "bg-red-500/20 text-red-400" },
  rotating: { label: "מסובב מפתח", color: "bg-blue-500/20 text-blue-400" },
};

const ALGORITHM_OPTIONS = ["AES-256", "RSA-2048", "SHA-256", "PBKDF2", "ChaCha20"];



const SENSITIVITY_MAP: Record<string, { label: string; color: string }> = {
  critical: { label: "קריטי", color: "bg-red-500/20 text-red-400" },
  high: { label: "גבוה", color: "bg-orange-500/20 text-orange-400" },
  medium: { label: "בינוני", color: "bg-amber-500/20 text-amber-400" },
  low: { label: "נמוך", color: "bg-green-500/20 text-green-400" },
};

export default function EncryptionPage() {
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
  const [filterSensitivity, setFilterSensitivity] = useState("all");
  const [sortField, setSortField] = useState("field_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`${API}/crm/security/encryption`);
      if (res.ok) { const d = safeArray(await res.json()); setItems(d.length > 0 ? d : MOCK_FIELDS); }
      else setItems(MOCK_FIELDS);
    } catch { setItems(MOCK_FIELDS); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("asc"); } };

  const filtered = useMemo(() => {
    let data = items.filter(r =>
      (!search || `${r.field_name} ${r.table} ${r.algorithm}`.toLowerCase().includes(search.toLowerCase())) &&
      (filterStatus === "all" || r.status === filterStatus) &&
      (filterSensitivity === "all" || r.sensitivity === filterSensitivity)
    );
    data.sort((a: any, b: any) => { const va = a[sortField] ?? ""; const vb = b[sortField] ?? ""; const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb)); return sortDir === "asc" ? c : -c; });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, filterSensitivity, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ field_name: "", table: "", algorithm: "AES-256", status: "unencrypted", key_rotation: "", sensitivity: "medium", records: 0 });
    setShowForm(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({ field_name: r.field_name, table: r.table, algorithm: r.algorithm, status: r.status, key_rotation: r.key_rotation, sensitivity: r.sensitivity || "medium", records: r.records || 0 });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/crm/security/encryption/${editing.id}` : `${API}/crm/security/encryption`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false);
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק הגדרת הצפנה זו?")) {
      await authFetch(`${API}/crm/security/encryption/${id}`, { method: "DELETE" });
      load();
    }
  };

  const encryptedCount = items.filter(r => r.status === "encrypted").length;
  const coveragePercent = items.length > 0 ? Math.round((encryptedCount / items.length) * 100) : 0;

  const kpis = [
    { label: 'סה"כ שדות', value: fmt(items.length), icon: Database, color: "text-blue-400" },
    { label: "מוצפנים", value: fmt(encryptedCount), icon: CheckCircle, color: "text-green-400" },
    { label: "לא מוצפנים", value: fmt(items.filter(r => r.status === "unencrypted").length), icon: XCircle, color: "text-red-400" },
    { label: "כיסוי הצפנה", value: `${coveragePercent}%`, icon: Shield, color: "text-purple-400" },
    { label: "רשומות מוגנות", value: fmt(items.filter(r => r.status === "encrypted").reduce((s, r) => s + (r.records || 0), 0)), icon: Lock, color: "text-cyan-400" },
    { label: "אלגוריתמים", value: fmt(new Set(items.map(r => r.algorithm)).size), icon: Key, color: "text-amber-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Lock className="text-green-400 w-6 h-6" />הגדרות הצפנה</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול הצפנת שדות רגישים — AES-256, RSA-2048</p>
        </div>
        <div className="flex gap-2">
          <ExportDropdown data={filtered} headers={{ field_name: "שדה", table: "טבלה", algorithm: "אלגוריתם", status: "סטטוס", key_rotation: "סיבוב", records: "רשומות" }} filename="encryption_settings" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> שדה חדש</button>
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
        <div className="relative flex-1 min-w-0 max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש שדה, טבלה, אלגוריתם..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסטטוסים</option>{Object.entries(STATUS_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
        <select value={filterSensitivity} onChange={e => setFilterSensitivity(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הרגישויות</option>{Object.entries(SENSITIVITY_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
        <span className="text-sm text-muted-foreground">{filtered.length} שדות</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={() => setSelectedIds([])} entityName="encryption" actions={defaultBulkActions(selectedIds, () => setSelectedIds([]), load, `${API}/crm/security/encryption`)} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Lock className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין שדות</p><p className="text-sm mt-1">{search || filterStatus !== "all" ? "נסה לשנות את הסינון" : "הוסף שדה להצפנה"}</p>{!(search || filterStatus !== "all") && <button onClick={() => openCreate()} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 text-sm font-medium flex items-center gap-2 mx-auto"><Plus className="w-4 h-4" />שדה חדש</button>}</div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
            {[["field_name","שדה"],["table","טבלה"],["algorithm","אלגוריתם"],["sensitivity","רגישות"],["key_rotation","סיבוב מפתח"],["records","רשומות"],["status","סטטוס"]].map(([f,l])=>(
              <th key={f} onClick={()=>toggleSort(f)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{l}<ArrowUpDown className="w-3 h-3" /></div></th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
          </tr></thead><tbody>
            {pagination.paginate(filtered).map(r=>(
              <tr key={r.id} className={`border-b border-border/20 hover:bg-muted/20 transition-colors ${r.status==="unencrypted"?"bg-red-500/5":""}`}>
                <td className="px-4 py-3 font-medium text-foreground flex items-center gap-2"><Lock className="w-3.5 h-3.5 text-muted-foreground" />{r.field_name}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.table}</td>
                <td className="px-4 py-3"><Badge className="text-[10px] bg-blue-500/20 text-blue-400 font-mono">{r.algorithm}</Badge></td>
                <td className="px-4 py-3">{r.sensitivity ? <Badge className={`text-[10px] ${SENSITIVITY_MAP[r.sensitivity]?.color || ""}`}>{SENSITIVITY_MAP[r.sensitivity]?.label || r.sensitivity}</Badge> : "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.key_rotation||"—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{fmt(r.records||0)}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${STATUS_MAP[r.status]?.color||""}`}>{STATUS_MAP[r.status]?.label||r.status}</Badge></td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={()=>setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg" title="צפייה"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={()=>openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכה"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                  {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.algorithm || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg" title="מחיקה"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                </div></td>
              </tr>
            ))}
          </tbody></table>
        </div></div>
        <SmartPagination pagination={pagination} />

        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><Shield className="w-4 h-4 text-green-400" /> סקירת כיסוי הצפנה</h3>
          <div className="space-y-3">
            {Object.entries(STATUS_MAP).map(([k, v]) => {
              const count = items.filter(r => r.status === k).length;
              return (
                <div key={k} className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground w-24">{v.label}</span>
                  <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${k === "encrypted" ? "bg-green-500" : k === "partial" ? "bg-amber-500" : k === "unencrypted" ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${items.length > 0 ? (count / items.length) * 100 : 0}%` }} />
                  </div>
                  <span className="text-sm text-foreground font-bold w-8">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={()=>setViewDetail(null)}>
            <motion.div initial={{scale:0.95}} animate={{scale:1}} exit={{scale:0.95}} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e=>e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Lock className="w-5 h-5 text-green-400" />{viewDetail.field_name} — הצפנה</h2><button onClick={()=>setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="שדה" value={viewDetail.field_name} />
                <DetailField label="טבלה" value={viewDetail.table} />
                <DetailField label="אלגוריתם" value={viewDetail.algorithm} />
                <DetailField label="סיבוב מפתח" value={viewDetail.key_rotation} />
                <DetailField label="סיבוב אחרון" value={viewDetail.last_rotated} />
                <DetailField label="רשומות" value={fmt(viewDetail.records||0)} />
                <DetailField label="רגישות">{viewDetail.sensitivity ? <Badge className={SENSITIVITY_MAP[viewDetail.sensitivity]?.color}>{SENSITIVITY_MAP[viewDetail.sensitivity]?.label}</Badge> : <span>—</span>}</DetailField>
                <DetailField label="סטטוס"><Badge className={STATUS_MAP[viewDetail.status]?.color}>{STATUS_MAP[viewDetail.status]?.label}</Badge></DetailField>
              </div>
              <div className="border-t border-border">
                  <div className="flex gap-2 p-3 border-b border-border/50">
                    {[{id:"details",label:"פרטים"},{id:"activity",label:"פעילות"},{id:"related",label:"קשורים"}].map(tab=>(
                      <button key={tab.id} onClick={()=>setDetailTab(tab.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${detailTab===tab.id?"bg-primary text-primary-foreground":"text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>
                    ))}
                  </div>
                  {detailTab === "activity" && <div className="p-4"><ActivityLog entityType="encryption" entityId={viewDetail.id} /></div>}
                  {detailTab === "related" && <div className="p-4"><RelatedRecords entityType="encryption" entityId={viewDetail.id} /></div>}
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
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת שדה הצפנה" : "שדה הצפנה חדש"}</h2>
                <button onClick={()=>setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">שם שדה *</label>
                    <input value={form.field_name||""} onChange={e=>setForm({...form,field_name:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="כרטיס אשראי" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">טבלה *</label>
                    <input value={form.table||""} onChange={e=>setForm({...form,table:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="customers" dir="ltr" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">אלגוריתם *</label>
                    <select value={form.algorithm||"AES-256"} onChange={e=>setForm({...form,algorithm:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {ALGORITHM_OPTIONS.map(a=><option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                    <select value={form.status||"unencrypted"} onChange={e=>setForm({...form,status:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(STATUS_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">רגישות</label>
                    <select value={form.sensitivity||"medium"} onChange={e=>setForm({...form,sensitivity:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(SENSITIVITY_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">סיבוב מפתח</label>
                    <input value={form.key_rotation||""} onChange={e=>setForm({...form,key_rotation:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="90 ימים" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">מספר רשומות</label>
                    <input type="number" min={0} value={form.records??""} onChange={e=>setForm({...form,records:Number(e.target.value)})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
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
        <ActivityLog entityType="encryption" entityId="all" />
        <RelatedRecords entityType="encryption" entityId="all" />
      </div>
    </div>
  );
}
