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
  Code2, Plus, Pencil, Trash2, Search, ArrowUpDown, Eye, X, AlertTriangle,
  Key, Copy, CheckCircle, Clock, Zap, Server, Shield, Activity
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const METHOD_MAP: Record<string, { color: string }> = {
  GET: { color: "bg-green-500/20 text-green-400" },
  POST: { color: "bg-blue-500/20 text-blue-400" },
  PUT: { color: "bg-amber-500/20 text-amber-400" },
  PATCH: { color: "bg-purple-500/20 text-purple-400" },
  DELETE: { color: "bg-red-500/20 text-red-400" },
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  inactive: { label: "לא פעיל", color: "bg-muted/20 text-muted-foreground" },
  deprecated: { label: "הוצא משימוש", color: "bg-red-500/20 text-red-400" },
  beta: { label: "בטא", color: "bg-purple-500/20 text-purple-400" },
};



const MOCK_KEYS = [
  { id: 1, name: "Production Key", key: "sk_prod_****...a8f2", created: "2024-01-15", status: "active", calls: 15240 },
  { id: 2, name: "Staging Key", key: "sk_stage_****...b3c1", created: "2024-02-20", status: "active", calls: 3200 },
  { id: 3, name: "Dev Key", key: "sk_dev_****...d7e4", created: "2024-03-10", status: "active", calls: 890 },
];

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

const emptyForm: any = { path: "", method: "GET", description: "", status: "active", rate_limit: 1000, auth: "Bearer Token" };

export default function RestApiPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [keys, setKeys] = useState<any[]>(MOCK_KEYS);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterMethod, setFilterMethod] = useState("all");
  const [sortField, setSortField] = useState("calls_today");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/crm/integrations/rest-api`);
      if (res.ok) { const d = await res.json(); setItems(safeArray(d).length > 0 ? safeArray(d) : MOCK_ENDPOINTS); }
      else setItems(MOCK_ENDPOINTS);
    } catch { setItems(MOCK_ENDPOINTS); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    try { await authFetch(`${API}/crm/integrations/rest-api${editItem ? `/${editItem.id}` : ""}`, { method: editItem ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); } catch {}
    if (editItem) setItems(prev => prev.map(it => it.id === editItem.id ? { ...it, ...form } : it));
    else setItems(prev => [...prev, { id: Date.now(), ...form, calls_today: 0, avg_response: 0 }]);
    setShowForm(false); setEditItem(null); setForm(emptyForm);
  };

  const handleDelete = async (id: number) => {
    const ok = await globalConfirm({ title: "מחיקת Endpoint", message: "למחוק endpoint?", confirmText: "מחק", variant: "destructive" });
    if (!ok) return;
    setItems(prev => prev.filter(it => it.id !== id));
  };

  const openEdit = (r: any) => { setEditItem(r); setForm({ path: r.path, method: r.method, description: r.description, status: r.status, rate_limit: r.rate_limit, auth: r.auth }); setShowForm(true); };
  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const filtered = useMemo(() => {
    let data = items.filter(r => (!search || `${r.path} ${r.description} ${r.method}`.toLowerCase().includes(search.toLowerCase())) && (filterMethod === "all" || r.method === filterMethod));
    data.sort((a: any, b: any) => { const va = a[sortField] ?? ""; const vb = b[sortField] ?? ""; const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb)); return sortDir === "asc" ? c : -c; });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterMethod, sortField, sortDir]);

  const totalCalls = items.reduce((s, r) => s + (r.calls_today || 0), 0);
  const avgResponse = items.length > 0 ? Math.round(items.reduce((s, r) => s + (r.avg_response || 0), 0) / items.length) : 0;

  const kpis = [
    { label: "Endpoints", value: fmt(items.length), icon: Code2, color: "text-blue-400" },
    { label: "פעילים", value: fmt(items.filter(r => r.status === "active").length), icon: CheckCircle, color: "text-green-400" },
    { label: "קריאות היום", value: fmt(totalCalls), icon: Activity, color: "text-cyan-400" },
    { label: "תגובה ממוצעת", value: `${avgResponse}ms`, icon: Zap, color: "text-amber-400" },
    { label: "מפתחות API", value: fmt(keys.length), icon: Key, color: "text-purple-400" },
    { label: "Rate Limit", value: `${fmt(items.reduce((s, r) => s + (r.rate_limit || 0), 0))}/hr`, icon: Shield, color: "text-orange-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Code2 className="text-green-400 w-6 h-6" />REST API</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול Endpoints, מפתחות API ומעקב שימוש</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setEditItem(null); setForm(emptyForm); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm"><Plus className="w-4 h-4" /> Endpoint חדש</button>
          <ExportDropdown data={filtered} headers={{ method: "Method", path: "Path", description: "תיאור", calls_today: "קריאות", avg_response: "תגובה(ms)", status: "סטטוס" }} filename="rest_api" />
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
        <div className="relative flex-1 min-w-0 max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש endpoint..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterMethod} onChange={e => setFilterMethod(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל המתודות</option>{Object.keys(METHOD_MAP).map(m=><option key={m} value={m}>{m}</option>)}</select>
        <span className="text-sm text-muted-foreground">{filtered.length} endpoints</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={() => setSelectedIds([])} entityName="rest-api" actions={defaultBulkActions(selectedIds, () => setSelectedIds([]), load, `${API}/crm/integrations/rest-api`)} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Code2 className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין endpoints</p></div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
            {[["method","Method"],["path","Path"],["description","תיאור"],["calls_today","קריאות"],["avg_response","תגובה"],["status","סטטוס"]].map(([f,l])=>(
              <th key={f} onClick={()=>toggleSort(f)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{l}<ArrowUpDown className="w-3 h-3" /></div></th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
          </tr></thead><tbody>
            {pagination.paginate(filtered).map(r=>(
              <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3"><Badge className={`text-[10px] font-mono ${METHOD_MAP[r.method]?.color||""}`}>{r.method}</Badge></td>
                <td className="px-4 py-3 font-mono text-xs text-foreground">{r.path}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.description||"—"}</td>
                <td className="px-4 py-3 text-cyan-400 font-medium">{fmt(r.calls_today||0)}</td>
                <td className="px-4 py-3"><span className={Number(r.avg_response)>200?"text-red-400":"text-green-400"}>{r.avg_response||0}ms</span></td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${STATUS_MAP[r.status]?.color||""}`}>{STATUS_MAP[r.status]?.label||r.status}</Badge></td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={()=>setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={()=>openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Pencil className="w-3.5 h-3.5 text-blue-400" /></button>
                  {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.method || r.id}'? פעולה זו אינה ניתנת לביטול.`))handleDelete(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                </div></td>
              </tr>
            ))}
          </tbody></table>
        </div></div>
        <SmartPagination pagination={pagination} />

        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="font-bold text-foreground mb-3 flex items-center gap-2"><Key className="w-4 h-4 text-purple-400" /> מפתחות API</h3>
          <div className="space-y-2">
            {keys.map(k => (
              <div key={k.id} className="flex items-center justify-between bg-muted/30 rounded-xl px-4 py-3">
                <div><div className="text-sm font-medium text-foreground">{k.name}</div><div className="text-xs text-muted-foreground font-mono">{k.key}</div></div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{fmt(k.calls)} קריאות</span>
                  <Badge className={STATUS_MAP[k.status]?.color}>{STATUS_MAP[k.status]?.label}</Badge>
                  <button className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-muted-foreground" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={()=>setViewDetail(null)}>
            <motion.div initial={{scale:0.95}} animate={{scale:1}} exit={{scale:0.95}} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e=>e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground"><Badge className={METHOD_MAP[viewDetail.method]?.color}>{viewDetail.method}</Badge> {viewDetail.path}</h2><button onClick={()=>setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="תיאור" value={viewDetail.description} />
                <DetailField label="אימות" value={viewDetail.auth} />
                <DetailField label="קריאות היום" value={fmt(viewDetail.calls_today)} />
                <DetailField label="תגובה ממוצעת" value={`${viewDetail.avg_response}ms`} />
                <DetailField label="Rate Limit" value={`${fmt(viewDetail.rate_limit)}/שעה`} />
                <DetailField label="סטטוס"><Badge className={STATUS_MAP[viewDetail.status]?.color}>{STATUS_MAP[viewDetail.status]?.label}</Badge></DetailField>
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
              <div className="p-5 border-b border-border"><h2 className="text-lg font-bold text-foreground">{editItem?"עריכת Endpoint":"Endpoint חדש"}</h2></div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div><label className="text-xs text-muted-foreground">Method</label><select className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.method} onChange={e=>setForm({...form,method:e.target.value})}>{Object.keys(METHOD_MAP).map(m=><option key={m}>{m}</option>)}</select></div>
                  <div className="col-span-2"><label className="text-xs text-muted-foreground">Path *</label><input className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1 font-mono" value={form.path||""} onChange={e=>setForm({...form,path:e.target.value})} /></div>
                </div>
                <div><label className="text-xs text-muted-foreground">תיאור</label><input className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.description||""} onChange={e=>setForm({...form,description:e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs text-muted-foreground">סטטוס</label><select className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{Object.entries(STATUS_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
                  <div><label className="text-xs text-muted-foreground">Rate Limit</label><input type="number" className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.rate_limit||1000} onChange={e=>setForm({...form,rate_limit:Number(e.target.value)})} /></div>
                </div>
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
        <ActivityLog entityType="rest-api" entityId="all" />
        <RelatedRecords entityType="rest-api" entityId="all" />
      </div>
    </div>
  );
}
