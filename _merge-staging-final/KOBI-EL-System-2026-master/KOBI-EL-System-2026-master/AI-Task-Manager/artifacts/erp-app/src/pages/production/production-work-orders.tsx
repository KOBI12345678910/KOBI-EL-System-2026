import { useState, useEffect, useMemo } from "react";
import {
  ClipboardList, Search, Plus, Edit2, Trash2, X, CheckCircle2, Clock,
  AlertTriangle, PlayCircle, Eye, ArrowUpDown, Shield, Wrench, Copy
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import ImportButton from "@/components/import-button";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import StatusTransition from "@/components/status-transition";
import { WritePermissionGate } from "@/components/permission-gate";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const statusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-muted/20 text-muted-foreground" },
  planned: { label: "מתוכנן", color: "bg-blue-500/20 text-blue-400" },
  "in-progress": { label: "בביצוע", color: "bg-yellow-500/20 text-yellow-400" },
  in_progress: { label: "בביצוע", color: "bg-yellow-500/20 text-yellow-400" },
  quality_check: { label: "בקרת איכות", color: "bg-purple-500/20 text-purple-400" },
  completed: { label: "הושלם", color: "bg-green-500/20 text-green-400" },
  closed: { label: "סגור", color: "bg-muted/20 text-muted-foreground" },
  cancelled: { label: "בוטל", color: "bg-red-500/20 text-red-400" },
};
const priorityMap: Record<string, { label: string; color: string }> = {
  low: { label: "נמוך", color: "bg-muted/20 text-muted-foreground" },
  medium: { label: "בינוני", color: "bg-blue-500/20 text-blue-400" },
  high: { label: "גבוה", color: "bg-orange-500/20 text-orange-400" },
  critical: { label: "קריטי", color: "bg-red-500/20 text-red-400" },
};

const woStatuses = [
  { key: "draft", label: "טיוטה", color: "bg-muted/20 text-muted-foreground" },
  { key: "planned", label: "מתוכנן", color: "bg-blue-500/20 text-blue-400" },
  { key: "in-progress", label: "בביצוע", color: "bg-yellow-500/20 text-yellow-400" },
  { key: "quality_check", label: "בקרת איכות", color: "bg-purple-500/20 text-purple-400" },
  { key: "completed", label: "הושלם", color: "bg-green-500/20 text-green-400" },
  { key: "closed", label: "סגור", color: "bg-muted/20 text-muted-foreground" },
];
const woTransitions = [
  { from: "draft", to: "planned", label: "תכנן" },
  { from: "planned", to: "in-progress", label: "התחל ייצור" },
  { from: "in-progress", to: "quality_check", label: "העבר לבקרת איכות", requireConfirm: true },
  { from: "quality_check", to: "completed", label: "אשר והשלם", requireConfirm: true },
  { from: "completed", to: "closed", label: "סגור" },
];

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return <div><div className="text-xs text-muted-foreground mb-1">{label}</div><div className="text-sm text-foreground">{children || value || "—"}</div></div>;
}

export default function ProductionWorkOrdersPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("planned_start");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [boms, setBoms] = useState<any[]>([]);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();

  const validation = useFormValidation({
    productName: { required: true, minLength: 2, message: "שם מוצר חובה" },
  });

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [iRes, sRes, bRes] = await Promise.all([
        authFetch(`${API}/production-work-orders`), authFetch(`${API}/production-work-orders/stats`), authFetch(`${API}/bom-headers`),
      ]);
      if (iRes.ok) setItems(safeArray(await iRes.json()));
      if (sRes.ok) setStats((await sRes.json()) || {});
      if (bRes.ok) setBoms(safeArray(await bRes.json()));
    } catch (e: any) { setError(e.message || "שגיאה בטעינת נתונים"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (!search || [i.order_number, i.product_name, i.assigned_to].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, sortField, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ status: "planned", priority: "medium", plannedStart: new Date().toISOString().slice(0, 10) }); validation.clearErrors(); setShowForm(true); };
  const openEdit = (r: any) => { setEditing(r); setForm({ productName: r.product_name, bomId: r.bom_id, plannedStart: r.planned_start?.slice(0, 10), plannedEnd: r.planned_end?.slice(0, 10), actualStart: r.actual_start?.slice(0, 10), actualEnd: r.actual_end?.slice(0, 10), quantityPlanned: r.quantity_planned, quantityProduced: r.quantity_produced, status: r.status, assignedTo: r.assigned_to, priority: r.priority, notes: r.notes }); validation.clearErrors(); setShowForm(true); };

  const save = async () => {
    if (!validation.validate(form)) return;
    setSaving(true);
    try { const url = editing ? `${API}/production-work-orders/${editing.id}` : `${API}/production-work-orders`; const res = await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); if (!res.ok) { const e = await res.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה")); setSaving(false); return; } setShowForm(false); load(); } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
    setSaving(false);
  };
  const remove = async (id: number) => { if (await globalConfirm("למחוק הזמנת עבודה?")) { await authFetch(`${API}/production-work-orders/${id}`, { method: "DELETE" }); load(); } };

  const handleStatusTransition = async (newStatus: string) => {
    if (!viewDetail) return;
    await authFetch(`${API}/production-work-orders/${viewDetail.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }) });
    load();
    setViewDetail({ ...viewDetail, status: newStatus });
  };

  const completion = stats.total_planned > 0 ? ((Number(stats.total_produced) / Number(stats.total_planned)) * 100).toFixed(1) : "0";
  const kpis = [
    { label: "סה\"כ הזמנות", value: fmt(stats.total || items.length), icon: ClipboardList, color: "text-blue-400" },
    { label: "מתוכננות", value: fmt(stats.planned || 0), icon: Clock, color: "text-blue-400" },
    { label: "בביצוע", value: fmt(stats.in_progress || 0), icon: PlayCircle, color: "text-yellow-400" },
    { label: "הושלמו", value: fmt(stats.completed || 0), icon: CheckCircle2, color: "text-green-400" },
    { label: "שיעור השלמה", value: `${completion}%`, icon: CheckCircle2, color: "text-emerald-400" },
  ];

  const columns = [
    { key: "order_number", label: "מספר" }, { key: "product_name", label: "מוצר" },
    { key: "planned_start", label: "התחלה" }, { key: "planned_end", label: "סיום" },
    { key: "quantity_planned", label: "מתוכנן" }, { key: "quantity_produced", label: "יוצר" },
    { key: "priority", label: "עדיפות" }, { key: "status", label: "סטטוס" },
  ];

  const paged = pagination.paginate(filtered);

  const relatedTabs = viewDetail ? [
    { key: "qc", label: "בדיקות QC", icon: Shield, endpoint: `${API}/qc-inspections?workOrderId=${viewDetail.id}`, columns: [{ key: "inspection_number", label: "מספר" }, { key: "result", label: "תוצאה" }, { key: "inspector", label: "בודק" }], emptyMessage: "אין בדיקות QC" },
    { key: "bom", label: "רכיבי BOM", icon: ClipboardList, endpoint: `${API}/bom-lines/${viewDetail.bom_id || 0}`, columns: [{ key: "component_name", label: "רכיב" }, { key: "quantity", label: "כמות" }, { key: "unit", label: "יחידה" }], emptyMessage: "אין רכיבי BOM" },
    { key: "machines", label: "מכונות", icon: Wrench, endpoint: `${API}/machines?workOrderId=${viewDetail.id}`, columns: [{ key: "name", label: "מכונה" }, { key: "status", label: "סטטוס" }, { key: "location", label: "מיקום" }], emptyMessage: "אין מכונות מוקצות" },
  ] : [];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><ClipboardList className="text-indigo-400 w-6 h-6" /> הזמנות עבודה ייצור</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול הזמנות עבודה, מעקב סטטוס ותפוקה</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ImportButton apiRoute="/api/production-work-orders" onSuccess={load} />
          <ExportDropdown data={filtered} headers={{ order_number: "מספר", product_name: "מוצר", status: "סטטוס", quantity_planned: "מתוכנן", quantity_produced: "יוצר", assigned_to: "אחראי", priority: "עדיפות" }} filename="production_work_orders" />
          <WritePermissionGate module="production">
            <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> הזמנה חדשה</button>
          </WritePermissionGate>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} /><div className="text-xl font-bold text-foreground">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">לא נמצאו הזמנות עבודה</p></div>
      ) : (<>
        <BulkActions items={filtered} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
          defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/production-work-orders/${id}`, { method: "DELETE" }))); load(); }),
          defaultBulkActions.export(async () => {}),
        ]} />
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50"><tr>
                <th className="px-2 py-3 w-8"><BulkCheckbox checked={selectedIds.length === paged.length && paged.length > 0} partial={selectedIds.length > 0 && selectedIds.length < paged.length} onChange={() => toggleAll(paged)} /></th>
                {columns.map(col => (<th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div></th>))}
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">אחראי</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
              </tr></thead>
              <tbody>
                {paged.map(r => (
                  <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="px-2 py-3"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-indigo-400 font-bold">{r.order_number}</td>
                    <td className="px-4 py-3 text-foreground font-medium">{r.product_name}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.planned_start?.slice(0, 10) || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.planned_end?.slice(0, 10) || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmt(r.quantity_planned)}</td>
                    <td className="px-4 py-3 text-foreground font-medium">{fmt(r.quantity_produced)}</td>
                    <td className="px-4 py-3"><Badge className={`text-[10px] ${priorityMap[r.priority]?.color || ""}`}>{priorityMap[r.priority]?.label || r.priority}</Badge></td>
                    <td className="px-4 py-3"><Badge className={`text-[10px] ${statusMap[r.status]?.color || ""}`}>{statusMap[r.status]?.label || r.status}</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground">{r.assigned_to || "—"}</td>
                    <td className="px-4 py-3"><div className="flex gap-1">
                      <button onClick={() => { setDetailTab("details"); setViewDetail(r); }} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                      <button title="שכפול" onClick={async () => { const _dup = await duplicateRecord(`${API}/production-work-orders`, r.id); if (_dup.ok) { load(); } else { alert("שגיאה בשכפול: " + _dup.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                      {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.product_name || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <SmartPagination pagination={pagination} />
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><ClipboardList className="w-5 h-5 text-indigo-400" /> הזמנה {viewDetail.order_number}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
                <>
                  <div className="p-4"><StatusTransition currentStatus={viewDetail.status} statuses={woStatuses} transitions={woTransitions} onTransition={handleStatusTransition} entityId={viewDetail.id} compact /></div>
                  <div className="p-5 grid grid-cols-2 gap-4">
                    <DetailField label="מספר" value={viewDetail.order_number} />
                    <DetailField label="מוצר" value={viewDetail.product_name} />
                    <DetailField label="BOM" value={viewDetail.bom_name} />
                    <DetailField label="אחראי" value={viewDetail.assigned_to} />
                    <DetailField label="התחלה מתוכננת" value={viewDetail.planned_start?.slice(0, 10)} />
                    <DetailField label="סיום מתוכנן" value={viewDetail.planned_end?.slice(0, 10)} />
                    <DetailField label="התחלה בפועל" value={viewDetail.actual_start?.slice(0, 10)} />
                    <DetailField label="סיום בפועל" value={viewDetail.actual_end?.slice(0, 10)} />
                    <DetailField label="כמות מתוכננת" value={fmt(viewDetail.quantity_planned)} />
                    <DetailField label="כמות שיוצרה" value={fmt(viewDetail.quantity_produced)} />
                    <DetailField label="עדיפות"><Badge className={priorityMap[viewDetail.priority]?.color}>{priorityMap[viewDetail.priority]?.label || viewDetail.priority}</Badge></DetailField>
                    <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge></DetailField>
                    <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
                  </div>
                </>
              )}
              {detailTab === "related" && <div className="p-4"><RelatedRecords tabs={relatedTabs} /></div>}
              {detailTab === "docs" && <div className="p-4"><AttachmentsSection entityType="work-order" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-4"><ActivityLog entityType="work-order" entityId={viewDetail.id} /></div>}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm"><Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה</button>
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת הזמנת עבודה" : "הזמנת עבודה חדשה"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 space-y-4"><div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5"><RequiredMark />מוצר</label><input value={form.productName || ""} onChange={e => setForm({ ...form, productName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /><FormFieldError error={validation.errors.productName} /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">BOM</label><select value={form.bomId || ""} onChange={e => setForm({ ...form, bomId: e.target.value || null })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm"><option value="">ללא</option>{boms.map(b => <option key={b.id} value={b.id}>{b.name} ({b.bom_number})</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">עדיפות</label><select value={form.priority || "medium"} onChange={e => setForm({ ...form, priority: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(priorityMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">התחלה מתוכננת</label><input type="date" value={form.plannedStart || ""} onChange={e => setForm({ ...form, plannedStart: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סיום מתוכנן</label><input type="date" value={form.plannedEnd || ""} onChange={e => setForm({ ...form, plannedEnd: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">כמות מתוכננת</label><input type="number" value={form.quantityPlanned || ""} onChange={e => setForm({ ...form, quantityPlanned: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">כמות שיוצרה</label><input type="number" value={form.quantityProduced || ""} onChange={e => setForm({ ...form, quantityProduced: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label><select value={form.status || "planned"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">אחראי</label><input value={form.assignedTo || ""} onChange={e => setForm({ ...form, assignedTo: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              </div></div>
              <div className="p-5 border-t border-border flex justify-end gap-2"><button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button><button onClick={save} disabled={saving} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50">{saving ? "שומר..." : "שמירה"}</button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
