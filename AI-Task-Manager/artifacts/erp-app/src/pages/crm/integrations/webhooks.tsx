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
  Globe, Plus, Pencil, Trash2, Search, ArrowUpDown, Eye, X, AlertTriangle,
  CheckCircle, XCircle, Activity, Zap, Clock, Copy, Server, Send
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  inactive: { label: "לא פעיל", color: "bg-muted/20 text-muted-foreground" },
  error: { label: "שגיאה", color: "bg-red-500/20 text-red-400" },
  paused: { label: "מושהה", color: "bg-amber-500/20 text-amber-400" },
};

const EVENTS = ["lead.created", "lead.updated", "deal.won", "deal.lost", "customer.created", "invoice.paid", "payment.received", "task.completed"];



function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

const emptyForm: any = { name: "", url: "", event: "lead.created", status: "active", secret: "" };


const MOCK_WEBHOOKS: any[] = [];
export default function WebhooksPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("deliveries");
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
      const res = await authFetch(`${API}/crm/integrations/webhooks`);
      if (res.ok) { const d = await res.json(); setItems(safeArray(d).length > 0 ? safeArray(d) : MOCK_WEBHOOKS); }
      else setItems(MOCK_WEBHOOKS);
    } catch { setItems(MOCK_WEBHOOKS); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    try { await authFetch(`${API}/crm/integrations/webhooks${editItem ? `/${editItem.id}` : ""}`, { method: editItem ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); } catch {}
    if (editItem) setItems(prev => prev.map(it => it.id === editItem.id ? { ...it, ...form } : it));
    else setItems(prev => [...prev, { id: Date.now(), ...form, deliveries: 0, success_rate: 100, last_triggered: "—" }]);
    setShowForm(false); setEditItem(null); setForm(emptyForm);
  };

  const handleDelete = async (id: number) => {
    const ok = await globalConfirm({ title: "מחיקת Webhook", message: "למחוק webhook?", confirmText: "מחק", variant: "destructive" });
    if (!ok) return;
    setItems(prev => prev.filter(it => it.id !== id));
  };

  const openEdit = (r: any) => { setEditItem(r); setForm({ name: r.name, url: r.url, event: r.event, status: r.status }); setShowForm(true); };
  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const filtered = useMemo(() => {
    let data = items.filter(r => (!search || `${r.name} ${r.url} ${r.event}`.toLowerCase().includes(search.toLowerCase())) && (filterStatus === "all" || r.status === filterStatus));
    data.sort((a: any, b: any) => { const va = a[sortField] ?? ""; const vb = b[sortField] ?? ""; const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb)); return sortDir === "asc" ? c : -c; });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, sortField, sortDir]);

  const totalDeliveries = items.reduce((s, r) => s + (r.deliveries || 0), 0);
  const avgSuccess = items.length > 0 ? (items.reduce((s, r) => s + (r.success_rate || 0), 0) / items.length).toFixed(1) : "0";

  const kpis = [
    { label: "סה\"כ Webhooks", value: fmt(items.length), icon: Globe, color: "text-blue-400" },
    { label: "פעילים", value: fmt(items.filter(r => r.status === "active").length), icon: CheckCircle, color: "text-green-400" },
    { label: "שגיאות", value: fmt(items.filter(r => r.status === "error").length), icon: XCircle, color: "text-red-400" },
    { label: "משלוחים", value: fmt(totalDeliveries), icon: Send, color: "text-cyan-400" },
    { label: "הצלחה ממוצעת", value: `${avgSuccess}%`, icon: Activity, color: "text-purple-400" },
    { label: "אירועים", value: fmt(new Set(items.map(r => r.event)).size), icon: Zap, color: "text-amber-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Globe className="text-purple-400 w-6 h-6" />Webhooks</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול Webhooks — התראות אירועים חיצוניים</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setEditItem(null); setForm(emptyForm); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm"><Plus className="w-4 h-4" /> Webhook חדש</button>
          <ExportDropdown data={filtered} headers={{ name: "שם", url: "URL", event: "אירוע", deliveries: "משלוחים", success_rate: "הצלחה%", status: "סטטוס" }} filename="webhooks" />
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
        <div className="relative flex-1 min-w-0 max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסטטוסים</option>{Object.entries(STATUS_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={() => setSelectedIds([])} entityName="webhooks" actions={defaultBulkActions(selectedIds, () => setSelectedIds([]), load, `${API}/crm/integrations/webhooks`)} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Globe className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין webhooks</p></div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
            {[["name","שם"],["event","אירוע"],["deliveries","משלוחים"],["success_rate","הצלחה%"],["last_triggered","הפעלה אחרונה"],["status","סטטוס"]].map(([f,l])=>(
              <th key={f} onClick={()=>toggleSort(f)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{l}<ArrowUpDown className="w-3 h-3" /></div></th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
          </tr></thead><tbody>
            {pagination.paginate(filtered).map(r=>(
              <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                <td className="px-4 py-3"><Badge className="text-[10px] bg-blue-500/20 text-blue-400 font-mono">{r.event}</Badge></td>
                <td className="px-4 py-3 text-muted-foreground">{fmt(r.deliveries||0)}</td>
                <td className="px-4 py-3"><span className={Number(r.success_rate)>=95?"text-green-400":"text-red-400"}>{Number(r.success_rate||0).toFixed(1)}%</span></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.last_triggered||"—"}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${STATUS_MAP[r.status]?.color||""}`}>{STATUS_MAP[r.status]?.label||r.status}</Badge></td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={()=>setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
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
                <DetailField label="שם" value={viewDetail.name} />
                <DetailField label="אירוע"><Badge className="bg-blue-500/20 text-blue-400 font-mono text-xs">{viewDetail.event}</Badge></DetailField>
                <div className="col-span-2"><DetailField label="URL" value={viewDetail.url} /></div>
                <DetailField label="משלוחים" value={fmt(viewDetail.deliveries)} />
                <DetailField label="הצלחה" value={`${Number(viewDetail.success_rate).toFixed(1)}%`} />
                <DetailField label="הפעלה אחרונה" value={viewDetail.last_triggered} />
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
              <div className="p-5 border-b border-border"><h2 className="text-lg font-bold text-foreground">{editItem?"עריכת Webhook":"Webhook חדש"}</h2></div>
              <div className="p-5 space-y-4">
                <div><label className="text-xs text-muted-foreground">שם *</label><input className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.name||""} onChange={e=>setForm({...form,name:e.target.value})} /></div>
                <div><label className="text-xs text-muted-foreground">URL *</label><input className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1 font-mono" value={form.url||""} onChange={e=>setForm({...form,url:e.target.value})} placeholder="https://..." /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs text-muted-foreground">אירוע</label><select className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.event} onChange={e=>setForm({...form,event:e.target.value})}>{EVENTS.map(e=><option key={e} value={e}>{e}</option>)}</select></div>
                  <div><label className="text-xs text-muted-foreground">סטטוס</label><select className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{Object.entries(STATUS_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
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
        <ActivityLog entityType="webhooks" entityId="all" />
        <RelatedRecords entityType="webhooks" entityId="all" />
      </div>
    </div>
  );
}
