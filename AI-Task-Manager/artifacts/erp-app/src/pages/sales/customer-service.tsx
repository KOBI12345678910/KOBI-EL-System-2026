import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import ActivityLog from "@/components/activity-log";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import RelatedRecords from "@/components/related-records";
import {
  Headphones, Search, Plus, Edit2, Trash2, X, Save, Eye, ArrowUpDown, AlertTriangle,
  Clock, CheckCircle2, Timer, MessageSquare, Copy
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  open: { label: "פתוח", color: "bg-blue-500/20 text-blue-400" },
  "in-progress": { label: "בטיפול", color: "bg-amber-500/20 text-amber-400" },
  resolved: { label: "נפתר", color: "bg-green-500/20 text-green-400" },
  closed: { label: "סגור", color: "bg-muted/20 text-muted-foreground" },
};
const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  low: { label: "נמוך", color: "bg-muted/20 text-muted-foreground" },
  medium: { label: "בינוני", color: "bg-blue-500/20 text-blue-400" },
  high: { label: "גבוה", color: "bg-orange-500/20 text-orange-400" },
  urgent: { label: "דחוף", color: "bg-red-500/20 text-red-400" },
};
const CATEGORIES = ["תמיכה טכנית", "חיוב", "החזרה", "תלונה", "שאלה כללית", "התקנה", "אחריות", "אחר"];

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return <div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>;
}

export default function CustomerService() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [iRes, sRes] = await Promise.all([
        authFetch(`${API}/sales/tickets`),
        authFetch(`${API}/sales/tickets/stats`).catch(() => null),
      ]);
      if (iRes.ok) setItems(safeArray(await iRes.json()));
      else throw new Error("שגיאה בטעינת פניות");
      if (sRes?.ok) setStats(await sRes.json());
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (filterPriority === "all" || i.priority === filterPriority) &&
      (!search || [i.ticket_number, i.subject, i.customer_name, i.category].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, filterPriority, sortField, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ status: "open", priority: "medium", category: "שאלה כללית" }); setShowForm(true); };
  const openEdit = (r: any) => { setEditing(r); setForm({ customerName: r.customer_name, subject: r.subject, description: r.description, category: r.category, priority: r.priority, status: r.status, assignedTo: r.assigned_to, resolutionNotes: r.resolution_notes }); setShowForm(true); };
  const save = async () => {
    if (!form.customerName) { alert("שדה חובה: שם לקוח"); return; }
    if (!form.subject) { alert("שדה חובה: נושא הפנייה"); return; }
    setSaving(true);
    try {
      const url = editing ? `${API}/sales/tickets/${editing.id}` : `${API}/sales/tickets`;
      const res = await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה")); setSaving(false); return; }
      setShowForm(false); load();
    } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
    setSaving(false);
  };
  const remove = async (id: number) => {
    if (await globalConfirm("למחוק פנייה?")) { await authFetch(`${API}/sales/tickets/${id}`, { method: "DELETE" }); load(); }
  };

  const avgResHours = Number(stats.avg_resolution_hours || 0);
  const avgResDisplay = avgResHours > 24 ? `${(avgResHours / 24).toFixed(1)} ימים` : `${avgResHours.toFixed(1)} שעות`;
  const kpis = [
    { label: "סה\"כ פניות", value: fmt(stats.total || items.length), icon: Headphones, color: "text-blue-400" },
    { label: "פתוחות", value: fmt(stats.open_count || items.filter(i => i.status === "open").length), icon: Clock, color: "text-amber-400" },
    { label: "נפתרו", value: fmt(stats.resolved || items.filter(i => i.status === "resolved").length), icon: CheckCircle2, color: "text-green-400" },
    { label: "זמן טיפול ממוצע", value: avgResDisplay, icon: Timer, color: "text-purple-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Headphones className="text-blue-400 w-6 h-6" /> שירות לקוחות</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול פניות לקוחות ומעקב טיפול</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ ticket_number: "מספר", customer_name: "לקוח", subject: "נושא", category: "קטגוריה", priority: "עדיפות", status: "סטטוס" }} filename="customer_service" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> פנייה חדשה</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} /><div className="text-xl font-bold text-foreground">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש פנייה..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>{Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל העדיפויות</option>{Object.entries(PRIORITY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Headphones className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין פניות</p></div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50"><tr>
              {[{ key: "ticket_number", label: "מספר" }, { key: "customer_name", label: "לקוח" }, { key: "subject", label: "נושא" }, { key: "category", label: "קטגוריה" }, { key: "priority", label: "עדיפות" }, { key: "status", label: "סטטוס" }, { key: "assigned_to", label: "מטפל" }, { key: "created_at", label: "נוצר" }].map(col => (
                <th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div></th>
              ))}
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
            </tr></thead>
            <tbody>{pagination.paginate(filtered).map(r => (
              <tr key={r.id} className={`border-b border-border/20 hover:bg-muted/20 transition-colors ${r.priority === "urgent" ? "border-r-2 border-r-red-500" : r.priority === "high" ? "border-r-2 border-r-orange-500" : ""}`}>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.ticket_number || "—"}</td>
                <td className="px-4 py-3 text-foreground font-medium">{r.customer_name || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.subject || "—"}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.category || "—"}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${PRIORITY_MAP[r.priority]?.color || "bg-muted/50"}`}>{PRIORITY_MAP[r.priority]?.label || r.priority}</Badge></td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${STATUS_MAP[r.status]?.color || "bg-muted/50"}`}>{STATUS_MAP[r.status]?.label || r.status}</Badge></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.assigned_to || "—"}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.created_at?.slice(0, 10) || "—"}</td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button><button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/sales/tickets`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                  {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.id || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div></div>
        <SmartPagination pagination={pagination} />
      </>)}

      <AnimatePresence>{viewDetail && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">פרטי פנייה #{viewDetail.ticket_number}</h2><button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="p-5 grid grid-cols-2 gap-4">
              <DetailField label="לקוח" value={viewDetail.customer_name} />
              <DetailField label="נושא" value={viewDetail.subject} />
              <DetailField label="קטגוריה" value={viewDetail.category} />
              <DetailField label="עדיפות"><Badge className={PRIORITY_MAP[viewDetail.priority]?.color}>{PRIORITY_MAP[viewDetail.priority]?.label}</Badge></DetailField>
              <DetailField label="סטטוס"><Badge className={STATUS_MAP[viewDetail.status]?.color}>{STATUS_MAP[viewDetail.status]?.label}</Badge></DetailField>
              <DetailField label="מטפל" value={viewDetail.assigned_to} />
              <div className="col-span-2"><DetailField label="תיאור" value={viewDetail.description} /></div>
              {viewDetail.resolution_notes && <div className="col-span-2"><DetailField label="הערות פתרון" value={viewDetail.resolution_notes} /></div>}
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm"><Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה</button>
              <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
            </div>
          </motion.div>
        </motion.div>
      )}</AnimatePresence>

      <AnimatePresence>{showForm && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת פנייה" : "פנייה חדשה"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="p-5 grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">שם לקוח</label><input value={form.customerName || ""} onChange={e => setForm({ ...form, customerName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">נושא *</label><input value={form.subject || ""} onChange={e => setForm({ ...form, subject: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">קטגוריה</label><select value={form.category || ""} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm"><option value="">בחר</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">עדיפות</label><select value={form.priority || "medium"} onChange={e => setForm({ ...form, priority: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(PRIORITY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label><select value={form.status || "open"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מטפל</label><input value={form.assignedTo || ""} onChange={e => setForm({ ...form, assignedTo: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור</label><textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              {(form.status === "resolved" || form.status === "closed") && (
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות פתרון</label><textarea value={form.resolutionNotes || ""} onChange={e => setForm({ ...form, resolutionNotes: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              )}
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
              <button onClick={save} disabled={saving} className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50"><Save className="w-3.5 h-3.5 inline ml-1" /> {editing ? "עדכון" : "שמירה"}</button>
            </div>
          </motion.div>
        </motion.div>
      )}</AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="customer-service" entityId="all" />
        <RelatedRecords entityType="customer-service" entityId="all" />
      </div>
    </div>
  );
}