import { useState, useEffect, useMemo } from "react";
import {
  Calendar, Factory, Target, TrendingUp, Search, Plus, Edit2, Trash2, X,
  ArrowUpDown, Clock, AlertTriangle, Gauge, Eye
} from "lucide-react";
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
  in_progress: { label: "בביצוע", color: "bg-cyan-500/20 text-cyan-400" },
  completed: { label: "הושלם", color: "bg-green-500/20 text-green-400" },
  delayed: { label: "באיחור", color: "bg-red-500/20 text-red-400" },
  cancelled: { label: "בוטל", color: "bg-muted/20 text-muted-foreground" },
};
const PRIORITIES: Record<string, string> = { low: "נמוכה", medium: "רגילה", high: "גבוהה", critical: "קריטית" };

const planStatuses = [
  { key: "draft", label: "טיוטה", color: "bg-muted/20 text-muted-foreground" },
  { key: "planned", label: "מתוכנן", color: "bg-blue-500/20 text-blue-400" },
  { key: "in_progress", label: "בביצוע", color: "bg-cyan-500/20 text-cyan-400" },
  { key: "completed", label: "הושלם", color: "bg-green-500/20 text-green-400" },
  { key: "delayed", label: "באיחור", color: "bg-red-500/20 text-red-400" },
];
const planTransitions = [
  { from: "draft", to: "planned", label: "תכנן" },
  { from: "planned", to: "in_progress", label: "התחל ביצוע", requireConfirm: true },
  { from: "in_progress", to: "completed", label: "סיים", requireConfirm: true },
  { from: "in_progress", to: "delayed", label: "סמן כמאחר" },
  { from: "delayed", to: "in_progress", label: "חזור לביצוע" },
];

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return <div><div className="text-xs text-muted-foreground mb-1">{label}</div><div className="text-sm text-foreground">{children || value || "—"}</div></div>;
}

export default function ProductionPlanningPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("start_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();

  const validation = useFormValidation({
    title: { required: true, minLength: 2, message: "כותרת חובה" },
  });

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [iRes, sRes] = await Promise.all([authFetch(`${API}/production-planning`), authFetch(`${API}/production-planning/stats`)]);
      if (iRes.ok) setItems(safeArray(await iRes.json()));
      if (sRes.ok) setStats((await sRes.json()) || {});
    } catch (e: any) { setError(e.message || "שגיאה בטעינת נתונים"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(r =>
      (filterStatus === "all" || r.status === filterStatus) &&
      (!search || [r.title, r.plan_number, r.product_name, r.production_line]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, sortField, sortDir]);

  const paged = pagination.paginate(filtered);

  const openCreate = () => { setEditing(null); setForm({ status: "draft", priority: "medium", plannedQuantity: 0, unit: "unit" }); validation.clearErrors(); setShowForm(true); };
  const openEdit = (r: any) => { setEditing(r); setForm({ title: r.title, productName: r.product_name, productCode: r.product_code, productionLine: r.production_line, plannedQuantity: r.planned_quantity, actualQuantity: r.actual_quantity, unit: r.unit, startDate: r.start_date, endDate: r.end_date, priority: r.priority, status: r.status, assignedTo: r.assigned_to, shiftPattern: r.shift_pattern, bottleneck: r.bottleneck, utilizationPercent: r.utilization_percent, onTimePercent: r.on_time_percent, notes: r.notes }); validation.clearErrors(); setShowForm(true); };

  const save = async () => {
    if (!validation.validate(form)) return;
    setSaving(true);
    try { const url = editing ? `${API}/production-planning/${editing.id}` : `${API}/production-planning`; const res = await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); if (!res.ok) { const e = await res.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה")); setSaving(false); return; } setShowForm(false); load(); } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
    setSaving(false);
  };
  const remove = async (id: number) => { if (await globalConfirm("למחוק תכנון?")) { await authFetch(`${API}/production-planning/${id}`, { method: "DELETE" }); load(); } };

  const handleStatusTransition = async (newStatus: string) => {
    if (!viewDetail) return;
    await authFetch(`${API}/production-planning/${viewDetail.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }) });
    load(); setViewDetail({ ...viewDetail, status: newStatus });
  };

  const kpis = [
    { label: "סה\"כ תכניות", value: fmt(stats.total || items.length), icon: Calendar, color: "text-blue-400" },
    { label: "בביצוע", value: fmt(stats.in_progress || 0), icon: Factory, color: "text-cyan-400" },
    { label: "ניצולת ממוצעת", value: `${Number(stats.avg_utilization || 0).toFixed(1)}%`, icon: Gauge, color: "text-green-400" },
    { label: "עמידה בזמנים", value: `${Number(stats.avg_on_time || 0).toFixed(1)}%`, icon: Target, color: "text-emerald-400" },
    { label: "באיחור", value: fmt(stats.delayed || 0), icon: AlertTriangle, color: "text-red-400" },
    { label: "כמות מתוכננת", value: fmt(stats.total_planned || 0), icon: TrendingUp, color: "text-purple-400" },
  ];

  const columns = [
    { key: "plan_number", label: "מספר" }, { key: "title", label: "כותרת" },
    { key: "production_line", label: "קו ייצור" }, { key: "planned_quantity", label: "מתוכנן" },
    { key: "actual_quantity", label: "בפועל" }, { key: "start_date", label: "התחלה" },
    { key: "priority", label: "עדיפות" }, { key: "status", label: "סטטוס" },
  ];

  const relatedTabs = viewDetail ? [
    { key: "work-orders", label: "הזמנות עבודה", icon: Factory, endpoint: `${API}/work-orders?planId=${viewDetail.id}`, columns: [{ key: "order_number", label: "מספר" }, { key: "product_name", label: "מוצר" }, { key: "status", label: "סטטוס" }], emptyMessage: "אין הזמנות עבודה" },
    { key: "resources", label: "משאבים", icon: Target, endpoint: `${API}/machines?line=${viewDetail.production_line || ""}`, columns: [{ key: "name", label: "שם" }, { key: "machine_type", label: "סוג" }, { key: "status", label: "סטטוס" }], emptyMessage: "אין משאבים" },
    { key: "schedules", label: "לוח זמנים", icon: Clock, endpoint: `${API}/production-planning?parentId=${viewDetail.id}`, columns: [{ key: "plan_number", label: "מספר" }, { key: "title", label: "כותרת" }, { key: "start_date", label: "התחלה" }], emptyMessage: "אין פריטי לוח זמנים" },
  ] : [];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Calendar className="text-blue-400 w-6 h-6" /> תכנון ייצור</h1>
          <p className="text-sm text-muted-foreground mt-1">תכנון לוח זמנים, הקצאת קווי ייצור ותעדוף</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ plan_number: "מספר", title: "כותרת", production_line: "קו", planned_quantity: "מתוכנן", actual_quantity: "בפועל", start_date: "התחלה", priority: "עדיפות", status: "סטטוס" }} filename="production_planning" />
          <WritePermissionGate module="production">
            <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> תכנית חדשה</button>
          </WritePermissionGate>
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
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש תכנית, מוצר..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
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
        <div className="text-center py-16 text-muted-foreground"><Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">לא נמצאו תכניות ייצור</p></div>
      ) : (<>
        <BulkActions items={filtered} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
          defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/production-planning/${id}`, { method: "DELETE" }))); load(); }),
          defaultBulkActions.export(async () => {}),
        ]} />
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50"><tr>
                <th className="px-2 py-3 w-8"><BulkCheckbox checked={selectedIds.length === paged.length && paged.length > 0} partial={selectedIds.length > 0 && selectedIds.length < paged.length} onChange={() => toggleAll(paged)} /></th>
                {columns.map(col => (<th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div></th>))}
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
              </tr></thead>
              <tbody>
                {paged.map(r => (
                  <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="px-2 py-3"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-blue-400 font-bold">{r.plan_number}</td>
                    <td className="px-4 py-3 text-foreground font-medium">{r.title}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.production_line || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmt(r.planned_quantity || 0)}</td>
                    <td className={`px-4 py-3 font-medium ${(r.actual_quantity || 0) >= (r.planned_quantity || 0) ? "text-green-400" : "text-amber-400"}`}>{fmt(r.actual_quantity || 0)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.start_date?.slice(0, 10) || "—"}</td>
                    <td className="px-4 py-3"><Badge className="text-[10px] bg-purple-500/20 text-purple-400">{PRIORITIES[r.priority] || r.priority}</Badge></td>
                    <td className="px-4 py-3"><Badge className={`text-[10px] ${statusMap[r.status]?.color || ""}`}>{statusMap[r.status]?.label || r.status}</Badge></td>
                    <td className="px-4 py-3"><div className="flex gap-1">
                      <button onClick={() => { setDetailTab("details"); setViewDetail(r); }} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <WritePermissionGate module="production">
                        <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                        {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.title || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                      </WritePermissionGate>
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
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Calendar className="w-5 h-5 text-blue-400" /> תכנית {viewDetail.plan_number}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
                <>
                  <div className="p-4"><StatusTransition currentStatus={viewDetail.status} statuses={planStatuses} transitions={planTransitions} onTransition={handleStatusTransition} entityId={viewDetail.id} compact /></div>
                  <div className="p-5 grid grid-cols-2 gap-4">
                    <DetailField label="מספר" value={viewDetail.plan_number} />
                    <DetailField label="כותרת" value={viewDetail.title} />
                    <DetailField label="מוצר" value={viewDetail.product_name} />
                    <DetailField label="קו ייצור" value={viewDetail.production_line} />
                    <DetailField label="כמות מתוכננת" value={fmt(viewDetail.planned_quantity || 0)} />
                    <DetailField label="כמות בפועל" value={fmt(viewDetail.actual_quantity || 0)} />
                    <DetailField label="תאריך התחלה" value={viewDetail.start_date?.slice(0, 10)} />
                    <DetailField label="תאריך סיום" value={viewDetail.end_date?.slice(0, 10)} />
                    <DetailField label="עדיפות" value={PRIORITIES[viewDetail.priority] || viewDetail.priority} />
                    <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge></DetailField>
                    <DetailField label="אחראי" value={viewDetail.assigned_to} />
                    <DetailField label="ניצולת" value={`${viewDetail.utilization_percent || 0}%`} />
                    <DetailField label="צוואר בקבוק" value={viewDetail.bottleneck} />
                    <DetailField label="עמידה בזמנים" value={`${viewDetail.on_time_percent || 0}%`} />
                    <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
                  </div>
                </>
              )}
              {detailTab === "related" && <div className="p-4"><RelatedRecords tabs={relatedTabs} /></div>}
              {detailTab === "docs" && <div className="p-4"><AttachmentsSection entityType="production-planning" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-4"><ActivityLog entityType="production-planning" entityId={viewDetail.id} /></div>}
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
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת תכנית ייצור" : "תכנית ייצור חדשה"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 space-y-4"><div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5"><RequiredMark />כותרת</label><input value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /><FormFieldError error={validation.errors.title} /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">קו ייצור</label><input value={form.productionLine || ""} onChange={e => setForm({ ...form, productionLine: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מוצר</label><input value={form.productName || ""} onChange={e => setForm({ ...form, productName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">כמות מתוכננת</label><input type="number" value={form.plannedQuantity || 0} onChange={e => setForm({ ...form, plannedQuantity: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">כמות בפועל</label><input type="number" value={form.actualQuantity || 0} onChange={e => setForm({ ...form, actualQuantity: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך התחלה</label><input type="date" value={form.startDate || ""} onChange={e => setForm({ ...form, startDate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך סיום</label><input type="date" value={form.endDate || ""} onChange={e => setForm({ ...form, endDate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">עדיפות</label><select value={form.priority || "medium"} onChange={e => setForm({ ...form, priority: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label><select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">אחראי</label><input value={form.assignedTo || ""} onChange={e => setForm({ ...form, assignedTo: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">ניצולת (%)</label><input type="number" value={form.utilizationPercent || 0} onChange={e => setForm({ ...form, utilizationPercent: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              </div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div></div>
              <div className="p-5 border-t border-border flex justify-end gap-2"><button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button><button onClick={save} disabled={saving} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50">{saving ? "שומר..." : "שמירה"}</button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
