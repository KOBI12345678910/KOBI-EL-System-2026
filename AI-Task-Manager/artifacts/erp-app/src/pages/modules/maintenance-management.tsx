import { usePermissions } from "@/hooks/use-permissions";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import {
  Wrench, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2, Clock,
  AlertTriangle, ArrowUpDown, Settings, DollarSign, Timer, Eye, Factory, Copy
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

interface MaintenanceOrder {
  id: number; order_number: string; maintenance_type: string; title: string;
  description: string; priority: string; status: string; equipment_name: string;
  equipment_code: string; department: string; assigned_to: string;
  scheduled_date: string; downtime_hours: number; parts_cost: number;
  labor_cost: number; total_cost: number; failure_cause: string; solution: string;
  is_recurring: boolean; vendor_name: string; notes: string;
}

const typeMap: Record<string, string> = { preventive: "מונעת", corrective: "מתקנת", predictive: "חזויה", emergency: "חירום", calibration: "כיול", inspection: "בדיקה", overhaul: "שיפוץ" };
const priorityMap: Record<string, { label: string; color: string }> = { critical: { label: "קריטי", color: "bg-red-500/20 text-red-400" }, high: { label: "גבוה", color: "bg-orange-500/20 text-orange-400" }, medium: { label: "רגיל", color: "bg-blue-500/20 text-blue-400" }, low: { label: "נמוך", color: "bg-muted/20 text-muted-foreground" } };
const statusMap: Record<string, { label: string; color: string }> = { open: { label: "פתוח", color: "bg-yellow-500/20 text-yellow-400" }, assigned: { label: "שויך", color: "bg-blue-500/20 text-blue-400" }, in_progress: { label: "בביצוע", color: "bg-indigo-500/20 text-indigo-400" }, waiting_parts: { label: "ממתין לחלקים", color: "bg-orange-500/20 text-orange-400" }, completed: { label: "הושלם", color: "bg-green-500/20 text-green-400" }, cancelled: { label: "בוטל", color: "bg-muted/20 text-muted-foreground" } };

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

export default function MaintenanceManagementPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<MaintenanceOrder[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortField, setSortField] = useState("scheduled_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MaintenanceOrder | null>(null);
  const [viewDetail, setViewDetail] = useState<MaintenanceOrder | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [r1, r2] = await Promise.all([authFetch(`${API}/maintenance-orders`), authFetch(`${API}/maintenance-orders/stats`)]);
      if (r1.ok) setItems(safeArray(await r1.json()));
      if (r2.ok) setStats((await r2.json()) || {});
    } catch (e: any) { setError(e.message || "שגיאה בטעינת נתונים"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (filterType === "all" || i.maintenance_type === filterType) &&
      (!search || [i.order_number, i.title, i.equipment_name].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => { const va = a[sortField] ?? ""; const vb = b[sortField] ?? ""; const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he"); return sortDir === "asc" ? c : -c; });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, filterType, sortField, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ maintenanceType: "corrective", priority: "medium", status: "open", scheduledDate: new Date().toISOString().slice(0, 10) }); setShowForm(true); };
  const openEdit = (r: MaintenanceOrder) => { setEditing(r); setForm({ maintenanceType: r.maintenance_type, title: r.title, description: r.description, priority: r.priority, status: r.status, equipmentName: r.equipment_name, equipmentCode: r.equipment_code, department: r.department, assignedTo: r.assigned_to, scheduledDate: r.scheduled_date?.slice(0, 10), downtimeHours: r.downtime_hours, partsCost: r.parts_cost, laborCost: r.labor_cost, failureCause: r.failure_cause, solution: r.solution, isRecurring: r.is_recurring, vendorName: r.vendor_name, notes: r.notes }); setShowForm(true); };

  const save = async () => {
    if (!form.title) { alert("שדה חובה: כותרת הזמנת תחזוקה"); return; }
    setSaving(true);
    try {
      const url = editing ? `${API}/maintenance-orders/${editing.id}` : `${API}/maintenance-orders`;
      const res = await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה")); setSaving(false); return; }
      setShowForm(false); load();
    } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
    setSaving(false);
  };

  const remove = async (id: number) => {
    const item = items.find((x: any) => x.id === id);
    if (await globalConfirm("למחוק הזמנת תחזוקה?", { itemName: item?.title || String(id), entityType: "הזמנת תחזוקה" })) { await authFetch(`${API}/maintenance-orders/${id}`, { method: "DELETE" }); load(); }
  };

  const kpis = [
    { label: "סה\"כ הזמנות", value: fmt(stats.total || items.length), icon: Wrench, color: "text-blue-400" },
    { label: "פתוחות", value: fmt(stats.open_count || 0), icon: Clock, color: "text-yellow-400" },
    { label: "בביצוע", value: fmt(stats.in_progress || 0), icon: Settings, color: "text-indigo-400" },
    { label: "הושלמו", value: fmt(stats.completed || 0), icon: CheckCircle2, color: "text-green-400" },
    { label: "שעות השבתה", value: fmt(stats.total_downtime || 0), icon: Timer, color: "text-purple-400" },
    { label: "עלות כוללת", value: `₪${fmt(stats.total_cost || 0)}`, icon: DollarSign, color: "text-emerald-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Wrench className="text-orange-400 w-6 h-6" />ניהול תחזוקה</h1>
          <p className="text-sm text-muted-foreground mt-1">תחזוקה מונעת ומתקנת, מעקב ציוד, חלקי חילוף</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ order_number: "מספר", maintenance_type: "סוג", title: "כותרת", priority: "עדיפות", equipment_name: "ציוד", assigned_to: "אחראי", scheduled_date: "מתוכנן", total_cost: "עלות", status: "סטטוס" }} filename="maintenance_orders" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-orange-600 text-foreground px-4 py-2.5 rounded-xl hover:bg-orange-700 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> הזמנת תחזוקה</button>
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
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסוגים</option>{Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="הזמנות תחזוקה" actions={defaultBulkActions(selectedIds, clear, load, `${API}/maintenance-orders`)} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Wrench className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין הזמנות תחזוקה</p></div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
            <th className="px-2 py-3 text-center w-10"><BulkCheckbox checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered)} partial={selectedIds.length > 0 && selectedIds.length < filtered.length} /></th>
            {[["order_number","מספר"],["maintenance_type","סוג"],["title","כותרת"],["priority","עדיפות"],["equipment_name","ציוד"],["assigned_to","אחראי"],["scheduled_date","מתוכנן"],["total_cost","עלות"],["status","סטטוס"]].map(([f,l]) => (
              <th key={f} onClick={() => toggleSort(f)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{l}<ArrowUpDown className="w-3 h-3" /></div></th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
          </tr></thead><tbody>
            {pagination.paginate(filtered).map(r => (
              <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                <td className="px-2 py-3 text-center"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="px-4 py-3 font-mono text-xs text-orange-400 font-bold">{r.order_number}</td>
                <td className="px-4 py-3 text-muted-foreground">{typeMap[r.maintenance_type] || r.maintenance_type}{r.is_recurring && <span className="text-xs text-blue-400 mr-1">🔄</span>}</td>
                <td className="px-4 py-3 font-medium text-foreground max-w-[180px] truncate">{r.title}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${priorityMap[r.priority]?.color || ""}`}>{priorityMap[r.priority]?.label || r.priority}</Badge></td>
                <td className="px-4 py-3 text-muted-foreground">{r.equipment_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.assigned_to || "—"}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.scheduled_date?.slice(0, 10) || "—"}</td>
                <td className="px-4 py-3 text-emerald-400 font-bold">₪{fmt(r.total_cost)}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${statusMap[r.status]?.color || ""}`}>{statusMap[r.status]?.label || r.status}</Badge></td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                  <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/maintenance-orders`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                  {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.title || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                </div></td>
              </tr>
            ))}
          </tbody></table>
        </div></div>
        <SmartPagination pagination={pagination} />
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Wrench className="w-5 h-5 text-orange-400" />{viewDetail.order_number}</h2><button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"attachments",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t=>(
                  <button key={t.key} onClick={()=>setDetailTab(t.key)} className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${detailTab===t.key?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="מספר" value={viewDetail.order_number} />
                <DetailField label="כותרת" value={viewDetail.title} />
                <DetailField label="סוג" value={typeMap[viewDetail.maintenance_type] || viewDetail.maintenance_type} />
                <DetailField label="עדיפות"><Badge className={priorityMap[viewDetail.priority]?.color}>{priorityMap[viewDetail.priority]?.label}</Badge></DetailField>
                <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label}</Badge></DetailField>
                <DetailField label="ציוד" value={viewDetail.equipment_name} />
                <DetailField label="קוד ציוד" value={viewDetail.equipment_code} />
                <DetailField label="מחלקה" value={viewDetail.department} />
                <DetailField label="אחראי" value={viewDetail.assigned_to} />
                <DetailField label="מתוכנן" value={viewDetail.scheduled_date?.slice(0, 10)} />
                <DetailField label="שעות השבתה" value={String(viewDetail.downtime_hours || 0)} />
                <DetailField label="עלות חלקים" value={`₪${fmt(viewDetail.parts_cost)}`} />
                <DetailField label="עלות עבודה" value={`₪${fmt(viewDetail.labor_cost)}`} />
                <DetailField label="עלות כוללת" value={`₪${fmt(viewDetail.total_cost)}`} />
                <DetailField label="ספק" value={viewDetail.vendor_name} />
                <DetailField label="חוזרת" value={viewDetail.is_recurring ? "כן" : "לא"} />
                <div className="col-span-2"><DetailField label="סיבת תקלה" value={viewDetail.failure_cause} /></div>
                <div className="col-span-2"><DetailField label="פתרון" value={viewDetail.solution} /></div>
                <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
              </div>
              )}
              {detailTab === "related" && (
                <div className="p-5"><RelatedRecords tabs={[
                  { key: "assets", label: "נכסים", endpoint: `${API}/fixed-assets?maintenanceId=${viewDetail.id}`, columns: [{ key: "asset_number", label: "מספר" }, { key: "asset_name", label: "שם" }] },
                  { key: "parts", label: "חלקי חילוף", endpoint: `${API}/raw-materials?maintenanceId=${viewDetail.id}`, columns: [{ key: "materialNumber", label: "מספר" }, { key: "materialName", label: "שם" }] },
                ]} /></div>
              )}
              {detailTab === "attachments" && (
                <div className="p-5"><AttachmentsSection entityType="maintenance-order" entityId={viewDetail.id} /></div>
              )}
              {detailTab === "history" && (
                <div className="p-5"><ActivityLog entityType="maintenance-order" entityId={viewDetail.id} /></div>
              )}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30"><Edit2 className="w-3.5 h-3.5 inline ml-1" />עריכה</button>
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת תחזוקה" : "הזמנת תחזוקה חדשה"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">כותרת *</label><input value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג</label><select value={form.maintenanceType || "corrective"} onChange={e => setForm({ ...form, maintenanceType: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">עדיפות</label><select value={form.priority || "medium"} onChange={e => setForm({ ...form, priority: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(priorityMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">ציוד *</label><input value={form.equipmentName || ""} onChange={e => setForm({ ...form, equipmentName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label><select value={form.status || "open"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">אחראי</label><input value={form.assignedTo || ""} onChange={e => setForm({ ...form, assignedTo: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מתוכנן</label><input type="date" value={form.scheduledDate || ""} onChange={e => setForm({ ...form, scheduledDate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">עלות חלקים</label><input type="number" step="0.01" value={form.partsCost || ""} onChange={e => setForm({ ...form, partsCost: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">עלות עבודה</label><input type="number" step="0.01" value={form.laborCost || ""} onChange={e => setForm({ ...form, laborCost: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">סיבת תקלה</label><textarea value={form.failureCause || ""} onChange={e => setForm({ ...form, failureCause: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              </div>
              <div className="p-5 border-t border-border flex gap-3">
                <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-orange-600 text-foreground px-6 py-2.5 rounded-xl hover:bg-orange-700 text-sm font-medium disabled:opacity-50"><Save className="w-4 h-4" />{saving ? "שומר..." : editing ? "עדכון" : "שמירה"}</button>
                <button onClick={() => setShowForm(false)} className="px-4 py-2.5 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
