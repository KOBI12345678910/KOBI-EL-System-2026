import { useState, useEffect, useMemo } from "react";
import {
  Shield, CheckCircle, XCircle, Clock, Search, Plus, Edit2, Trash2, X,
  ArrowUpDown, DollarSign, AlertTriangle, Target, Eye, Copy
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

const resultMap: Record<string, { label: string; color: string }> = {
  pending: { label: "ממתין", color: "bg-muted/20 text-muted-foreground" },
  pass: { label: "עבר", color: "bg-green-500/20 text-green-400" },
  fail: { label: "נכשל", color: "bg-red-500/20 text-red-400" },
  conditional: { label: "מותנה", color: "bg-amber-500/20 text-amber-400" },
};
const SEVERITY_MAP: Record<string, string> = { minor: "קל", major: "משמעותי", critical: "קריטי" };
const TYPES: Record<string, string> = { incoming: "נכנס", in_process: "בתהליך", final: "סופי", audit: "ביקורת" };

const qcStatuses = [
  { key: "pending", label: "ממתין", color: "bg-muted/20 text-muted-foreground" },
  { key: "pass", label: "עבר", color: "bg-green-500/20 text-green-400" },
  { key: "fail", label: "נכשל", color: "bg-red-500/20 text-red-400" },
  { key: "conditional", label: "מותנה", color: "bg-amber-500/20 text-amber-400" },
];
const qcTransitions = [
  { from: "pending", to: "pass", label: "סמן כעבר", requireConfirm: true },
  { from: "pending", to: "fail", label: "סמן ככישלון", requireConfirm: true },
  { from: "pending", to: "conditional", label: "אישור מותנה" },
  { from: "fail", to: "pending", label: "בדוק מחדש" },
  { from: "conditional", to: "pass", label: "אשר סופי" },
];

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return <div><div className="text-xs text-muted-foreground mb-1">{label}</div><div className="text-sm text-foreground">{children || value || "—"}</div></div>;
}

export default function QualityControlEntPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterResult, setFilterResult] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortField, setSortField] = useState("inspection_date");
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
    productName: { required: true, minLength: 2, message: "שם מוצר חובה" },
  });

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [iRes, sRes] = await Promise.all([authFetch(`${API}/quality-control-ent`), authFetch(`${API}/quality-control-ent/stats`)]);
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
      (filterResult === "all" || r.result === filterResult) &&
      (filterType === "all" || r.inspection_type === filterType) &&
      (!search || [r.product_name, r.inspection_number, r.batch_number, r.inspector_name]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterResult, filterType, sortField, sortDir]);

  const paged = pagination.paginate(filtered);

  const openCreate = () => { setEditing(null); setForm({ inspectionType: "incoming", result: "pending", severity: "minor", sampleSize: 1, acceptedCount: 0, rejectedCount: 0, costOfQuality: 0, inspectionDate: new Date().toISOString().slice(0, 10) }); validation.clearErrors(); setShowForm(true); };
  const openEdit = (r: any) => { setEditing(r); setForm({ inspectionType: r.inspection_type, inspectionDate: r.inspection_date, productName: r.product_name, productCode: r.product_code, batchNumber: r.batch_number, orderReference: r.order_reference, supplierName: r.supplier_name, inspectorName: r.inspector_name, sampleSize: r.sample_size, acceptedCount: r.accepted_count, rejectedCount: r.rejected_count, defectType: r.defect_type, severity: r.severity, result: r.result, correctiveAction: r.corrective_action, preventiveAction: r.preventive_action, reworkRequired: r.rework_required, costOfQuality: r.cost_of_quality, notes: r.notes }); validation.clearErrors(); setShowForm(true); };

  const save = async () => {
    if (!validation.validate(form)) return;
    setSaving(true);
    try { const url = editing ? `${API}/quality-control-ent/${editing.id}` : `${API}/quality-control-ent`; const res = await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); if (!res.ok) { const e = await res.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה")); setSaving(false); return; } setShowForm(false); load(); } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
    setSaving(false);
  };
  const remove = async (id: number) => { if (await globalConfirm("למחוק בדיקת איכות?")) { await authFetch(`${API}/quality-control-ent/${id}`, { method: "DELETE" }); load(); } };

  const handleStatusTransition = async (newResult: string) => {
    if (!viewDetail) return;
    await authFetch(`${API}/quality-control-ent/${viewDetail.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ result: newResult }) });
    load(); setViewDetail({ ...viewDetail, result: newResult });
  };

  const passRate = Number(stats.pass_rate || 0).toFixed(1);
  const kpis = [
    { label: "סה\"כ בדיקות", value: fmt(stats.total || items.length), icon: Shield, color: "text-blue-400" },
    { label: "שיעור מעבר", value: `${passRate}%`, icon: Target, color: "text-green-400" },
    { label: "עברו", value: fmt(stats.passed || 0), icon: CheckCircle, color: "text-emerald-400" },
    { label: "נכשלו", value: fmt(stats.failed || 0), icon: XCircle, color: "text-red-400" },
    { label: "ממוצע פגמים", value: Number(stats.avg_defects || 0).toFixed(1), icon: AlertTriangle, color: "text-amber-400" },
    { label: "עלות איכות", value: fmtC(Math.round(Number(stats.total_quality_cost) || 0)), icon: DollarSign, color: "text-purple-400" },
  ];

  const columns = [
    { key: "inspection_number", label: "מספר" }, { key: "inspection_date", label: "תאריך" },
    { key: "product_name", label: "מוצר" }, { key: "inspection_type", label: "סוג" },
    { key: "sample_size", label: "דגימה" }, { key: "accepted_count", label: "מאושרים" },
    { key: "rejected_count", label: "נדחו" }, { key: "severity", label: "חומרה" },
    { key: "result", label: "תוצאה" },
  ];

  const relatedTabs = viewDetail ? [
    { key: "inspections", label: "בדיקות קשורות", icon: Shield, endpoint: `${API}/qc-inspections?productName=${viewDetail.product_name || ""}`, columns: [{ key: "inspection_number", label: "מספר" }, { key: "result", label: "תוצאה" }, { key: "inspector_name", label: "בודק" }], emptyMessage: "אין בדיקות" },
    { key: "standards", label: "תקנים", icon: Target, endpoint: `${API}/quality-control-ent?batchNumber=${viewDetail.batch_number || ""}`, columns: [{ key: "inspection_number", label: "מספר" }, { key: "inspection_type", label: "סוג" }, { key: "result", label: "תוצאה" }], emptyMessage: "אין תקנים" },
    { key: "ncrs", label: "אי-התאמות", icon: AlertTriangle, endpoint: `${API}/quality-control-ent?result=fail&batchNumber=${viewDetail.batch_number || ""}`, columns: [{ key: "inspection_number", label: "מספר" }, { key: "defect_type", label: "סוג פגם" }, { key: "corrective_action", label: "פעולה מתקנת" }], emptyMessage: "אין אי-התאמות" },
  ] : [];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Shield className="text-green-400 w-6 h-6" /> בקרת איכות Enterprise</h1>
          <p className="text-sm text-muted-foreground mt-1">בדיקות, דגימות ואי-התאמות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ inspection_number: "מספר", inspection_date: "תאריך", product_name: "מוצר", inspection_type: "סוג", sample_size: "דגימה", result: "תוצאה", severity: "חומרה" }} filename="quality_control_ent" />
          <WritePermissionGate module="production">
            <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> בדיקה חדשה</button>
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש מוצר, אצווה..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterResult} onChange={e => setFilterResult(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל התוצאות</option>{Object.entries(resultMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
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
        <div className="text-center py-16 text-muted-foreground"><Shield className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין בדיקות איכות</p></div>
      ) : (<>
        <BulkActions items={filtered} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
          defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/quality-control-ent/${id}`, { method: "DELETE" }))); load(); }),
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
                    <td className="px-4 py-3 font-mono text-xs text-green-400 font-bold">{r.inspection_number}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.inspection_date || "—"}</td>
                    <td className="px-4 py-3 text-foreground font-medium">{r.product_name || "—"}</td>
                    <td className="px-4 py-3"><Badge className="text-[10px] bg-cyan-500/20 text-cyan-400">{TYPES[r.inspection_type] || r.inspection_type}</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground">{r.sample_size}</td>
                    <td className="px-4 py-3 text-green-400">{r.accepted_count}</td>
                    <td className="px-4 py-3 text-red-400">{r.rejected_count}</td>
                    <td className="px-4 py-3 text-muted-foreground">{SEVERITY_MAP[r.severity] || r.severity}</td>
                    <td className="px-4 py-3"><Badge className={`text-[10px] ${resultMap[r.result]?.color || ""}`}>{resultMap[r.result]?.label || r.result}</Badge></td>
                    <td className="px-4 py-3"><div className="flex gap-1">
                      <button onClick={() => { setDetailTab("details"); setViewDetail(r); }} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <WritePermissionGate module="production">
                        <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button><button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/quality-control-ent`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                        {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.id || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
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
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Shield className="w-5 h-5 text-green-400" /> בדיקה {viewDetail.inspection_number}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
                <>
                  <div className="p-4"><StatusTransition currentStatus={viewDetail.result} statuses={qcStatuses} transitions={qcTransitions} onTransition={handleStatusTransition} entityId={viewDetail.id} compact /></div>
                  <div className="p-5 grid grid-cols-2 gap-4">
                    <DetailField label="מספר" value={viewDetail.inspection_number} />
                    <DetailField label="תאריך" value={viewDetail.inspection_date} />
                    <DetailField label="מוצר" value={viewDetail.product_name} />
                    <DetailField label="מק״ט" value={viewDetail.product_code} />
                    <DetailField label="אצווה" value={viewDetail.batch_number} />
                    <DetailField label="סוג" value={TYPES[viewDetail.inspection_type] || viewDetail.inspection_type} />
                    <DetailField label="בודק" value={viewDetail.inspector_name} />
                    <DetailField label="ספק" value={viewDetail.supplier_name} />
                    <DetailField label="גודל דגימה" value={String(viewDetail.sample_size || 0)} />
                    <DetailField label="מאושרים" value={String(viewDetail.accepted_count || 0)} />
                    <DetailField label="נדחו" value={String(viewDetail.rejected_count || 0)} />
                    <DetailField label="חומרה" value={SEVERITY_MAP[viewDetail.severity] || viewDetail.severity} />
                    <DetailField label="תוצאה"><Badge className={resultMap[viewDetail.result]?.color}>{resultMap[viewDetail.result]?.label || viewDetail.result}</Badge></DetailField>
                    <DetailField label="עלות איכות" value={fmtC(Number(viewDetail.cost_of_quality) || 0)} />
                    <div className="col-span-2"><DetailField label="פעולה מתקנת" value={viewDetail.corrective_action} /></div>
                    <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
                  </div>
                </>
              )}
              {detailTab === "related" && <div className="p-4"><RelatedRecords tabs={relatedTabs} /></div>}
              {detailTab === "docs" && <div className="p-4"><AttachmentsSection entityType="quality-control" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-4"><ActivityLog entityType="quality-control" entityId={viewDetail.id} /></div>}
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
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת בדיקת איכות" : "בדיקת איכות חדשה"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 space-y-4"><div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג בדיקה</label><select value={form.inspectionType || "incoming"} onChange={e => setForm({ ...form, inspectionType: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך</label><input type="date" value={form.inspectionDate || ""} onChange={e => setForm({ ...form, inspectionDate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5"><RequiredMark />מוצר</label><input value={form.productName || ""} onChange={e => setForm({ ...form, productName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /><FormFieldError error={validation.errors.productName} /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מק״ט</label><input value={form.productCode || ""} onChange={e => setForm({ ...form, productCode: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">אצווה</label><input value={form.batchNumber || ""} onChange={e => setForm({ ...form, batchNumber: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">בודק</label><input value={form.inspectorName || ""} onChange={e => setForm({ ...form, inspectorName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">גודל דגימה</label><input type="number" value={form.sampleSize || 1} onChange={e => setForm({ ...form, sampleSize: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תוצאה</label><select value={form.result || "pending"} onChange={e => setForm({ ...form, result: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(resultMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מאושרים</label><input type="number" value={form.acceptedCount || 0} onChange={e => setForm({ ...form, acceptedCount: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">נדחו</label><input type="number" value={form.rejectedCount || 0} onChange={e => setForm({ ...form, rejectedCount: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">חומרה</label><select value={form.severity || "minor"} onChange={e => setForm({ ...form, severity: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(SEVERITY_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">עלות איכות</label><input type="number" value={form.costOfQuality || 0} onChange={e => setForm({ ...form, costOfQuality: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">פעולה מתקנת</label><input value={form.correctiveAction || ""} onChange={e => setForm({ ...form, correctiveAction: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
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
