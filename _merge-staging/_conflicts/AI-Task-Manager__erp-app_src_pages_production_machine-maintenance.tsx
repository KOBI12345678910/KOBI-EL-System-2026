import { useState, useEffect, useMemo } from "react";
import {
  Wrench, Calendar, DollarSign, Clock, Search, Plus, Edit2, Trash2, X,
  ArrowUpDown, AlertTriangle, CheckCircle, Settings, Gauge, Eye, Copy
} from "lucide-react";
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
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import StatusTransition from "@/components/status-transition";
import { WritePermissionGate } from "@/components/permission-gate";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);

const statusMap: Record<string, { label: string; color: string }> = {
  scheduled: { label: "מתוכנן", color: "bg-blue-500/20 text-blue-400" },
  in_progress: { label: "בביצוע", color: "bg-cyan-500/20 text-cyan-400" },
  completed: { label: "הושלם", color: "bg-green-500/20 text-green-400" },
  cancelled: { label: "בוטל", color: "bg-muted/20 text-muted-foreground" },
  overdue: { label: "באיחור", color: "bg-red-500/20 text-red-400" },
};
const TYPES: Record<string, string> = { preventive: "מונעת", corrective: "מתקנת", predictive: "חזויה", emergency: "חירום" };
const FREQUENCIES: Record<string, string> = { daily: "יומי", weekly: "שבועי", monthly: "חודשי", quarterly: "רבעוני", yearly: "שנתי" };
const PRIORITIES: Record<string, string> = { low: "נמוכה", medium: "רגילה", high: "גבוהה", critical: "קריטית" };

const maintStatuses = [
  { key: "scheduled", label: "מתוכנן", color: "bg-blue-500/20 text-blue-400" },
  { key: "in_progress", label: "בביצוע", color: "bg-cyan-500/20 text-cyan-400" },
  { key: "completed", label: "הושלם", color: "bg-green-500/20 text-green-400" },
  { key: "overdue", label: "באיחור", color: "bg-red-500/20 text-red-400" },
];
const maintTransitions = [
  { from: "scheduled", to: "in_progress", label: "התחל ביצוע" },
  { from: "in_progress", to: "completed", label: "סיים", requireConfirm: true },
  { from: "scheduled", to: "overdue", label: "סמן כמאחר" },
  { from: "overdue", to: "in_progress", label: "התחל ביצוע" },
];

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return <div><div className="text-xs text-muted-foreground mb-1">{label}</div><div className="text-sm text-foreground">{children || value || "—"}</div></div>;
}

export default function MachineMaintenancePage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortField, setSortField] = useState("scheduled_date");
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
    machineName: { required: true, minLength: 2, message: "שם מכונה חובה" },
    title: { required: true, minLength: 2, message: "כותרת חובה" },
  });

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [iRes, sRes] = await Promise.all([authFetch(`${API}/machine-maintenance`), authFetch(`${API}/machine-maintenance/stats`)]);
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
      (filterType === "all" || r.maintenance_type === filterType) &&
      (!search || [r.machine_name, r.maintenance_number, r.title, r.machine_code]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, filterType, sortField, sortDir]);

  const paged = pagination.paginate(filtered);

  const openCreate = () => { setEditing(null); setForm({ status: "scheduled", maintenanceType: "preventive", frequency: "monthly", priority: "medium", estimatedHours: 0 }); validation.clearErrors(); setShowForm(true); };
  const openEdit = (r: any) => { setEditing(r); setForm({ machineName: r.machine_name, machineCode: r.machine_code, location: r.location, maintenanceType: r.maintenance_type, title: r.title, description: r.description, frequency: r.frequency, priority: r.priority, status: r.status, scheduledDate: r.scheduled_date, completedDate: r.completed_date, assignedTo: r.assigned_to, estimatedHours: r.estimated_hours, actualHours: r.actual_hours, partsCost: r.parts_cost, laborCost: r.labor_cost, totalCost: r.total_cost, downtimeHours: r.downtime_hours, partsUsed: r.parts_used, findings: r.findings, nextMaintenanceDate: r.next_maintenance_date, notes: r.notes }); validation.clearErrors(); setShowForm(true); };

  const save = async () => {
    if (!validation.validate(form)) return;
    setSaving(true);
    try { const url = editing ? `${API}/machine-maintenance/${editing.id}` : `${API}/machine-maintenance`; const res = await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); if (!res.ok) { const e = await res.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה")); setSaving(false); return; } setShowForm(false); load(); } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
    setSaving(false);
  };
  const remove = async (id: number) => { if (await globalConfirm("למחוק תחזוקה?")) { await authFetch(`${API}/machine-maintenance/${id}`, { method: "DELETE" }); load(); } };

  const handleStatusTransition = async (newStatus: string) => {
    if (!viewDetail) return;
    await authFetch(`${API}/machine-maintenance/${viewDetail.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }) });
    load(); setViewDetail({ ...viewDetail, status: newStatus });
  };

  const kpis = [
    { label: "סה\"כ תחזוקות", value: fmt(stats.total || items.length), icon: Wrench, color: "text-blue-400" },
    { label: "מתוכננות", value: fmt(stats.scheduled || 0), icon: Calendar, color: "text-cyan-400" },
    { label: "קרובות", value: fmt(stats.upcoming || 0), icon: AlertTriangle, color: "text-amber-400" },
    { label: "הושלמו", value: fmt(stats.completed || 0), icon: CheckCircle, color: "text-green-400" },
    { label: "עלות חודשית", value: fmtC(Math.round(Number(stats.monthly_cost) || 0)), icon: DollarSign, color: "text-purple-400" },
    { label: "השבתה (שע')", value: Number(stats.total_downtime || 0).toFixed(1), icon: Clock, color: "text-red-400" },
  ];

  const columns = [
    { key: "maintenance_number", label: "מספר" }, { key: "machine_name", label: "מכונה" },
    { key: "title", label: "כותרת" }, { key: "maintenance_type", label: "סוג" },
    { key: "scheduled_date", label: "תאריך" }, { key: "priority", label: "עדיפות" },
    { key: "total_cost", label: "עלות" }, { key: "status", label: "סטטוס" },
  ];

  const relatedTabs = viewDetail ? [
    { key: "machines", label: "מכונה", icon: Settings, endpoint: `${API}/machines?name=${viewDetail.machine_name || ""}`, columns: [{ key: "name", label: "שם" }, { key: "machine_type", label: "סוג" }, { key: "status", label: "סטטוס" }], emptyMessage: "אין נתוני מכונה" },
    { key: "work-orders", label: "הזמנות עבודה", icon: Wrench, endpoint: `${API}/work-orders?machine=${viewDetail.machine_name || ""}`, columns: [{ key: "order_number", label: "מספר" }, { key: "product_name", label: "מוצר" }, { key: "status", label: "סטטוס" }], emptyMessage: "אין הזמנות" },
    { key: "parts", label: "חלפים", icon: Gauge, endpoint: `${API}/raw-materials?type=spare_part`, columns: [{ key: "material_name", label: "חלק" }, { key: "current_stock", label: "מלאי" }, { key: "unit", label: "יחידה" }], emptyMessage: "אין חלפים" },
  ] : [];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Wrench className="text-orange-400 w-6 h-6" /> תחזוקת מכונות</h1>
          <p className="text-sm text-muted-foreground mt-1">תחזוקה מתוכננת, תיקונים והיסטוריה</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ maintenance_number: "מספר", machine_name: "מכונה", title: "כותרת", maintenance_type: "סוג", scheduled_date: "תאריך", priority: "עדיפות", total_cost: "עלות", status: "סטטוס" }} filename="machine_maintenance" />
          <WritePermissionGate module="production">
            <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> תחזוקה חדשה</button>
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש מכונה, תחזוקה..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסוגים</option>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Wrench className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">לא נמצאו רשומות תחזוקה</p></div>
      ) : (<>
        <BulkActions items={filtered} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
          defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/machine-maintenance/${id}`, { method: "DELETE" }))); load(); }),
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
                    <td className="px-4 py-3 font-mono text-xs text-orange-400 font-bold">{r.maintenance_number}</td>
                    <td className="px-4 py-3 text-foreground font-medium">{r.machine_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.title}</td>
                    <td className="px-4 py-3"><Badge className="text-[10px] bg-purple-500/20 text-purple-400">{TYPES[r.maintenance_type] || r.maintenance_type}</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.scheduled_date || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{PRIORITIES[r.priority] || r.priority}</td>
                    <td className="px-4 py-3 text-green-400">{fmtC(Number(r.total_cost) || 0)}</td>
                    <td className="px-4 py-3"><Badge className={`text-[10px] ${statusMap[r.status]?.color || ""}`}>{statusMap[r.status]?.label || r.status}</Badge></td>
                    <td className="px-4 py-3"><div className="flex gap-1">
                      <button onClick={() => { setDetailTab("details"); setViewDetail(r); }} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <WritePermissionGate module="production">
                        <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button><button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/machine-maintenance`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                        {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.machine_name || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
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
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Wrench className="w-5 h-5 text-orange-400" /> תחזוקה {viewDetail.maintenance_number}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
                <>
                  <div className="p-4"><StatusTransition currentStatus={viewDetail.status} statuses={maintStatuses} transitions={maintTransitions} onTransition={handleStatusTransition} entityId={viewDetail.id} compact /></div>
                  <div className="p-5 grid grid-cols-2 gap-4">
                    <DetailField label="מספר" value={viewDetail.maintenance_number} />
                    <DetailField label="מכונה" value={viewDetail.machine_name} />
                    <DetailField label="קוד מכונה" value={viewDetail.machine_code} />
                    <DetailField label="מיקום" value={viewDetail.location} />
                    <DetailField label="כותרת" value={viewDetail.title} />
                    <DetailField label="סוג" value={TYPES[viewDetail.maintenance_type] || viewDetail.maintenance_type} />
                    <DetailField label="תדירות" value={FREQUENCIES[viewDetail.frequency] || viewDetail.frequency} />
                    <DetailField label="עדיפות" value={PRIORITIES[viewDetail.priority] || viewDetail.priority} />
                    <DetailField label="תאריך מתוכנן" value={viewDetail.scheduled_date} />
                    <DetailField label="תאריך ביצוע" value={viewDetail.completed_date} />
                    <DetailField label="אחראי" value={viewDetail.assigned_to} />
                    <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge></DetailField>
                    <DetailField label="שעות משוערות" value={String(viewDetail.estimated_hours || 0)} />
                    <DetailField label="שעות בפועל" value={String(viewDetail.actual_hours || 0)} />
                    <DetailField label="עלות חלפים" value={fmtC(Number(viewDetail.parts_cost) || 0)} />
                    <DetailField label="עלות עבודה" value={fmtC(Number(viewDetail.labor_cost) || 0)} />
                    <DetailField label="עלות כוללת" value={fmtC(Number(viewDetail.total_cost) || 0)} />
                    <DetailField label="שעות השבתה" value={String(viewDetail.downtime_hours || 0)} />
                    <DetailField label="תחזוקה הבאה" value={viewDetail.next_maintenance_date} />
                    <div className="col-span-2"><DetailField label="ממצאים" value={viewDetail.findings} /></div>
                    <div className="col-span-2"><DetailField label="תיאור" value={viewDetail.description} /></div>
                    <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
                  </div>
                </>
              )}
              {detailTab === "related" && <div className="p-4"><RelatedRecords tabs={relatedTabs} /></div>}
              {detailTab === "docs" && <div className="p-4"><AttachmentsSection entityType="machine-maintenance" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-4"><ActivityLog entityType="machine-maintenance" entityId={viewDetail.id} /></div>}
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
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת תחזוקה" : "תחזוקה חדשה"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 space-y-4"><div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5"><RequiredMark />שם מכונה</label><input value={form.machineName || ""} onChange={e => setForm({ ...form, machineName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /><FormFieldError error={validation.errors.machineName} /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">קוד מכונה</label><input value={form.machineCode || ""} onChange={e => setForm({ ...form, machineCode: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5"><RequiredMark />כותרת</label><input value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /><FormFieldError error={validation.errors.title} /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג</label><select value={form.maintenanceType || "preventive"} onChange={e => setForm({ ...form, maintenanceType: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תדירות</label><select value={form.frequency || "monthly"} onChange={e => setForm({ ...form, frequency: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(FREQUENCIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">עדיפות</label><select value={form.priority || "medium"} onChange={e => setForm({ ...form, priority: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label><select value={form.status || "scheduled"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך מתוכנן</label><input type="date" value={form.scheduledDate || ""} onChange={e => setForm({ ...form, scheduledDate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">אחראי</label><input value={form.assignedTo || ""} onChange={e => setForm({ ...form, assignedTo: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">שעות משוערות</label><input type="number" value={form.estimatedHours || 0} onChange={e => setForm({ ...form, estimatedHours: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">עלות חלפים</label><input type="number" value={form.partsCost || 0} onChange={e => setForm({ ...form, partsCost: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">עלות עבודה</label><input type="number" value={form.laborCost || 0} onChange={e => setForm({ ...form, laborCost: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
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
