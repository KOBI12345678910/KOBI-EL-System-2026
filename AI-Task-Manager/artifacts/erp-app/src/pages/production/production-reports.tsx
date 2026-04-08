import { useState, useEffect, useMemo } from "react";
import {
  BarChart3, Factory, DollarSign, Gauge, Search, Plus, Edit2, Trash2, X,
  ArrowUpDown, TrendingUp, Clock, Target, Eye, AlertTriangle
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
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);

const statusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-muted/20 text-muted-foreground" },
  published: { label: "פורסם", color: "bg-green-500/20 text-green-400" },
  approved: { label: "מאושר", color: "bg-blue-500/20 text-blue-400" },
  cancelled: { label: "בוטל", color: "bg-red-500/20 text-red-400" },
};
const REPORT_TYPES: Record<string, string> = { daily: "יומי", weekly: "שבועי", monthly: "חודשי", quarterly: "רבעוני", custom: "מותאם" };

const reportStatuses = [
  { key: "draft", label: "טיוטה", color: "bg-muted/20 text-muted-foreground" },
  { key: "published", label: "פורסם", color: "bg-green-500/20 text-green-400" },
  { key: "approved", label: "מאושר", color: "bg-blue-500/20 text-blue-400" },
];
const reportTransitions = [
  { from: "draft", to: "published", label: "פרסם", requireConfirm: true },
  { from: "published", to: "approved", label: "אשר" },
  { from: "published", to: "draft", label: "החזר לטיוטה" },
];

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return <div><div className="text-xs text-muted-foreground mb-1">{label}</div><div className="text-sm text-foreground">{children || value || "—"}</div></div>;
}

export default function ProductionReportsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("report_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();

  const validation = useFormValidation({
    reportType: { required: true, message: "סוג דוח חובה" },
  });

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [iRes, sRes] = await Promise.all([authFetch(`${API}/production-reports`), authFetch(`${API}/production-reports/stats`)]);
      if (iRes.ok) setItems(safeArray(await iRes.json()));
      if (sRes.ok) setStats((await sRes.json()) || {});
    } catch (e: any) { setError(e.message || "שגיאה בטעינת נתונים"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(r =>
      (filterStatus === "all" || r.status === filterStatus) &&
      (!search || [r.report_number, r.production_line, r.report_type].some(f => f?.toLowerCase().includes(search.toLowerCase())))
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

  const openCreate = () => { setEditing(null); setForm({ status: "draft", reportType: "daily", reportDate: new Date().toISOString().slice(0, 10), totalUnitsProduced: 0, totalUnitsPlanned: 0, defectiveUnits: 0, oee: 0 }); validation.clearErrors(); setShowForm(true); };
  const openEdit = (r: any) => { setEditing(r); setForm({ reportType: r.report_type, reportDate: r.report_date, periodStart: r.period_start, periodEnd: r.period_end, productionLine: r.production_line, totalUnitsProduced: r.total_units_produced, totalUnitsPlanned: r.total_units_planned, defectiveUnits: r.defective_units, costPerUnit: r.cost_per_unit, totalCost: r.total_cost, laborHours: r.labor_hours, machineHours: r.machine_hours, oee: r.oee, availability: r.availability, performance: r.performance, quality: r.quality, downtimeHours: r.downtime_hours, status: r.status, preparedBy: r.prepared_by, notes: r.notes }); validation.clearErrors(); setShowForm(true); };

  const save = async () => {
    if (!validation.validate(form)) return;
    setSaving(true);
    try { const url = editing ? `${API}/production-reports/${editing.id}` : `${API}/production-reports`; const res = await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); if (!res.ok) { const e = await res.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה")); setSaving(false); return; } setShowForm(false); load(); } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
    setSaving(false);
  };
  const remove = async (id: number) => { if (await globalConfirm("למחוק דוח?")) { await authFetch(`${API}/production-reports/${id}`, { method: "DELETE" }); load(); } };

  const handleStatusTransition = async (newStatus: string) => {
    if (!viewDetail) return;
    await authFetch(`${API}/production-reports/${viewDetail.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }) });
    load(); setViewDetail({ ...viewDetail, status: newStatus });
  };

  const kpis = [
    { label: "יחידות שיוצרו", value: fmt(stats.total_units || 0), icon: Factory, color: "text-blue-400" },
    { label: "עלות ליחידה", value: fmtC(Math.round(Number(stats.avg_cost_per_unit) || 0)), icon: DollarSign, color: "text-green-400" },
    { label: "OEE ממוצע", value: `${Number(stats.avg_oee || 0).toFixed(1)}%`, icon: Gauge, color: "text-cyan-400" },
    { label: "זמינות", value: `${Number(stats.avg_availability || 0).toFixed(1)}%`, icon: TrendingUp, color: "text-emerald-400" },
    { label: "ביצועים", value: `${Number(stats.avg_performance || 0).toFixed(1)}%`, icon: Target, color: "text-purple-400" },
    { label: "סה\"כ דוחות", value: fmt(stats.total || items.length), icon: BarChart3, color: "text-amber-400" },
  ];

  const columns = [
    { key: "report_number", label: "מספר" }, { key: "report_type", label: "סוג" },
    { key: "report_date", label: "תאריך" }, { key: "production_line", label: "קו" },
    { key: "total_units_produced", label: "יוצר" }, { key: "oee", label: "OEE" },
    { key: "cost_per_unit", label: "עלות/יח'" }, { key: "status", label: "סטטוס" },
  ];

  const relatedTabs = viewDetail ? [
    { key: "work-orders", label: "הזמנות עבודה", icon: Factory, endpoint: `${API}/work-orders?reportId=${viewDetail.id}`, columns: [{ key: "order_number", label: "מספר" }, { key: "product_name", label: "מוצר" }, { key: "status", label: "סטטוס" }], emptyMessage: "אין הזמנות" },
    { key: "inspections", label: "בדיקות איכות", icon: Target, endpoint: `${API}/qc-inspections?reportId=${viewDetail.id}`, columns: [{ key: "inspection_number", label: "מספר" }, { key: "result", label: "תוצאה" }, { key: "inspector_name", label: "בודק" }], emptyMessage: "אין בדיקות" },
  ] : [];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><BarChart3 className="text-amber-400 w-6 h-6" /> דוחות ייצור</h1>
          <p className="text-sm text-muted-foreground mt-1">דוחות ביצוע, עלויות ואיכות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ report_number: "מספר", report_type: "סוג", report_date: "תאריך", production_line: "קו", total_units_produced: "יוצר", oee: "OEE", status: "סטטוס" }} filename="production_reports" />
          <WritePermissionGate module="production">
            <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> דוח חדש</button>
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש דוח, קו ייצור..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
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
        <div className="text-center py-16 text-muted-foreground"><BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">לא נמצאו דוחות ייצור</p></div>
      ) : (<>
        <BulkActions items={filtered} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
          defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/production-reports/${id}`, { method: "DELETE" }))); load(); }),
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
                    <td className="px-4 py-3 font-mono text-xs text-amber-400 font-bold">{r.report_number}</td>
                    <td className="px-4 py-3"><Badge className="text-[10px] bg-cyan-500/20 text-cyan-400">{REPORT_TYPES[r.report_type] || r.report_type}</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.report_date || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.production_line || "—"}</td>
                    <td className="px-4 py-3 text-foreground font-medium">{fmt(r.total_units_produced || 0)}</td>
                    <td className={`px-4 py-3 font-bold ${Number(r.oee) >= 85 ? "text-green-400" : Number(r.oee) >= 65 ? "text-amber-400" : "text-red-400"}`}>{Number(r.oee || 0).toFixed(1)}%</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtC(Number(r.cost_per_unit) || 0)}</td>
                    <td className="px-4 py-3"><Badge className={`text-[10px] ${statusMap[r.status]?.color || ""}`}>{statusMap[r.status]?.label || r.status}</Badge></td>
                    <td className="px-4 py-3"><div className="flex gap-1">
                      <button onClick={() => { setDetailTab("details"); setViewDetail(r); }} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <WritePermissionGate module="production">
                        <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                        {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.report_number || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
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
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><BarChart3 className="w-5 h-5 text-amber-400" /> דוח {viewDetail.report_number}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
                <>
                  <div className="p-4"><StatusTransition currentStatus={viewDetail.status} statuses={reportStatuses} transitions={reportTransitions} onTransition={handleStatusTransition} entityId={viewDetail.id} compact /></div>
                  <div className="p-5 grid grid-cols-2 gap-4">
                    <DetailField label="מספר" value={viewDetail.report_number} />
                    <DetailField label="סוג" value={REPORT_TYPES[viewDetail.report_type] || viewDetail.report_type} />
                    <DetailField label="תאריך" value={viewDetail.report_date} />
                    <DetailField label="קו ייצור" value={viewDetail.production_line} />
                    <DetailField label="יחידות שיוצרו" value={fmt(viewDetail.total_units_produced || 0)} />
                    <DetailField label="יחידות מתוכננות" value={fmt(viewDetail.total_units_planned || 0)} />
                    <DetailField label="יחידות פגומות" value={fmt(viewDetail.defective_units || 0)} />
                    <DetailField label="OEE" value={`${Number(viewDetail.oee || 0).toFixed(1)}%`} />
                    <DetailField label="זמינות" value={`${Number(viewDetail.availability || 0).toFixed(1)}%`} />
                    <DetailField label="ביצועים" value={`${Number(viewDetail.performance || 0).toFixed(1)}%`} />
                    <DetailField label="איכות" value={`${Number(viewDetail.quality || 0).toFixed(1)}%`} />
                    <DetailField label="עלות ליחידה" value={fmtC(Number(viewDetail.cost_per_unit) || 0)} />
                    <DetailField label="שעות השבתה" value={String(viewDetail.downtime_hours || 0)} />
                    <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge></DetailField>
                    <DetailField label="הוכן ע״י" value={viewDetail.prepared_by} />
                    <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
                  </div>
                </>
              )}
              {detailTab === "related" && <div className="p-4"><RelatedRecords tabs={relatedTabs} /></div>}
              {detailTab === "docs" && <div className="p-4"><AttachmentsSection entityType="production-report" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-4"><ActivityLog entityType="production-report" entityId={viewDetail.id} /></div>}
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
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת דוח ייצור" : "דוח ייצור חדש"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 space-y-4"><div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5"><RequiredMark />סוג דוח</label><select value={form.reportType || "daily"} onChange={e => setForm({ ...form, reportType: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(REPORT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><FormFieldError error={validation.errors.reportType} /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך</label><input type="date" value={form.reportDate || ""} onChange={e => setForm({ ...form, reportDate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">קו ייצור</label><input value={form.productionLine || ""} onChange={e => setForm({ ...form, productionLine: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">יחידות שיוצרו</label><input type="number" value={form.totalUnitsProduced || 0} onChange={e => setForm({ ...form, totalUnitsProduced: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">יחידות מתוכננות</label><input type="number" value={form.totalUnitsPlanned || 0} onChange={e => setForm({ ...form, totalUnitsPlanned: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">יחידות פגומות</label><input type="number" value={form.defectiveUnits || 0} onChange={e => setForm({ ...form, defectiveUnits: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">OEE (%)</label><input type="number" value={form.oee || 0} onChange={e => setForm({ ...form, oee: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">עלות ליחידה</label><input type="number" value={form.costPerUnit || 0} onChange={e => setForm({ ...form, costPerUnit: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">שעות השבתה</label><input type="number" value={form.downtimeHours || 0} onChange={e => setForm({ ...form, downtimeHours: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label><select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">הוכן ע״י</label><input value={form.preparedBy || ""} onChange={e => setForm({ ...form, preparedBy: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
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
