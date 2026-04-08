import { usePermissions } from "@/hooks/use-permissions";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import ImportButton from "@/components/import-button";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import {
  Shield, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2, Clock,
  AlertTriangle, ArrowUpDown, XCircle, Eye, Wrench, BarChart3, Hash, Copy
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

interface QualityInspection {
  id: number; inspection_number: string; inspection_type: string; inspection_date: string;
  product_name: string; product_code: string; batch_number: string; inspector_name: string;
  sample_size: number; accepted_count: number; rejected_count: number; severity: string;
  result: string; corrective_action: string; disposition: string; cost_of_quality: number;
  supplier_name: string; notes: string;
}

const typeMap: Record<string, string> = { incoming: "כניסה", in_process: "תהליך", final: "סופי", audit: "ביקורת", customer_complaint: "תלונת לקוח", supplier_audit: "ביקורת ספק", calibration: "כיול" };
const resultMap: Record<string, { label: string; color: string }> = { pending: { label: "ממתין", color: "bg-yellow-500/20 text-yellow-400" }, pass: { label: "עבר", color: "bg-green-500/20 text-green-400" }, fail: { label: "נכשל", color: "bg-red-500/20 text-red-400" }, conditional: { label: "מותנה", color: "bg-orange-500/20 text-orange-400" }, hold: { label: "מוקפא", color: "bg-blue-500/20 text-blue-400" } };
const severityMap: Record<string, { label: string; color: string }> = { critical: { label: "קריטי", color: "bg-red-500/20 text-red-400" }, major: { label: "משמעותי", color: "bg-orange-500/20 text-orange-400" }, minor: { label: "קל", color: "bg-yellow-500/20 text-yellow-400" }, cosmetic: { label: "קוסמטי", color: "bg-blue-500/20 text-blue-400" }, none: { label: "ללא", color: "bg-green-500/20 text-green-400" } };
const dispositionMap: Record<string, string> = { pending: "ממתין", accepted: "מאושר", rejected: "נדחה", rework: "תיקון", scrap: "גרט", return_to_supplier: "החזר לספק", use_as_is: "שימוש כמות שהוא" };

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

export default function QualityControlPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<QualityInspection[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterResult, setFilterResult] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortField, setSortField] = useState("inspection_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<QualityInspection | null>(null);
  const [viewDetail, setViewDetail] = useState<QualityInspection | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const bulk = useBulkSelection();
  const formValidation = useFormValidation({
    inspectionType: { required: true, message: "סוג בדיקה נדרש" },
    inspectionDate: { required: true, message: "תאריך נדרש" },
    productName: { required: true, message: "שם מוצר נדרש" },
    inspectorName: { required: true, message: "שם בודק נדרש" },
  });

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [r1, r2] = await Promise.all([authFetch(`${API}/quality-inspections`), authFetch(`${API}/quality-inspections/stats`)]);
      if (r1.ok) setItems(safeArray(await r1.json()));
      if (r2.ok) setStats((await r2.json()) || {});
    } catch (e: any) { setError(e.message || "שגיאה בטעינת נתונים"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterResult === "all" || i.result === filterResult) &&
      (filterType === "all" || i.inspection_type === filterType) &&
      (!search || [i.inspection_number, i.product_name, i.inspector_name, i.batch_number].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => { const va = a[sortField] ?? ""; const vb = b[sortField] ?? ""; const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he"); return sortDir === "asc" ? c : -c; });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterResult, filterType, sortField, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ inspectionDate: new Date().toISOString().slice(0, 10), inspectionType: "incoming", severity: "minor", result: "pending", disposition: "pending", sampleSize: 1 }); setShowForm(true); };
  const openEdit = (r: QualityInspection) => { setEditing(r); setForm({ inspectionType: r.inspection_type, inspectionDate: r.inspection_date?.slice(0, 10), productName: r.product_name, productCode: r.product_code, batchNumber: r.batch_number, inspectorName: r.inspector_name, sampleSize: r.sample_size, acceptedCount: r.accepted_count, rejectedCount: r.rejected_count, severity: r.severity, result: r.result, correctiveAction: r.corrective_action, disposition: r.disposition, costOfQuality: r.cost_of_quality, supplierName: r.supplier_name, notes: r.notes }); setShowForm(true); };

  const save = async () => {
    if (!form.productName) { alert("שדה חובה: שם מוצר"); return; }
    if (!form.inspectionDate) { alert("שדה חובה: תאריך בדיקה"); return; }
    setSaving(true);
    try {
      const url = editing ? `${API}/quality-inspections/${editing.id}` : `${API}/quality-inspections`;
      const res = await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה")); setSaving(false); return; }
      setShowForm(false); load();
    } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
    setSaving(false);
  };

  const remove = async (id: number) => {
    const item = items.find((x: any) => x.id === id);
    if (await globalConfirm("למחוק בדיקת איכות?", { itemName: item?.inspection_number || String(id), entityType: "בדיקת איכות" })) { await authFetch(`${API}/quality-inspections/${id}`, { method: "DELETE" }); load(); }
  };

  const kpis = [
    { label: "סה\"כ בדיקות", value: fmt(stats.total || items.length), icon: Shield, color: "text-blue-400" },
    { label: "עברו", value: fmt(stats.passed || 0), icon: CheckCircle2, color: "text-green-400" },
    { label: "נכשלו", value: fmt(stats.failed || 0), icon: XCircle, color: "text-red-400" },
    { label: "ממתינות", value: fmt(stats.pending || 0), icon: Clock, color: "text-yellow-400" },
    { label: "שיעור קבלה", value: `${Number(stats.avg_acceptance_rate || 0).toFixed(1)}%`, icon: BarChart3, color: "text-emerald-400" },
    { label: "עלות איכות", value: `₪${fmt(stats.total_quality_cost || 0)}`, icon: Hash, color: "text-purple-400" },
  ];

  const columns = [
    { key: "inspection_number", label: "מספר" }, { key: "inspection_type", label: "סוג" },
    { key: "inspection_date", label: "תאריך" }, { key: "product_name", label: "מוצר" },
    { key: "batch_number", label: "אצוות" }, { key: "inspector_name", label: "בודק" },
    { key: "severity", label: "חומרה" }, { key: "result", label: "תוצאה" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Shield className="text-green-400 w-6 h-6" />בקרת איכות</h1>
          <p className="text-sm text-muted-foreground mt-1">בדיקות כניסה, תהליך וסופי, פעולות מתקנות, עלות איכות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ImportButton apiRoute="/api/quality-inspections" onSuccess={load} />
          <ExportDropdown data={filtered} headers={{ inspection_number: "מספר", inspection_type: "סוג", inspection_date: "תאריך", product_name: "מוצר", batch_number: "אצוות", inspector_name: "בודק", severity: "חומרה", result: "תוצאה" }} filename="quality_inspections" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> בדיקה חדשה</button>
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
        <select value={filterResult} onChange={e => setFilterResult(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל התוצאות</option>{Object.entries(resultMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסוגים</option>{Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Shield className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין בדיקות איכות</p><p className="text-sm mt-1">{search || filterResult !== "all" ? "נסה לשנות את הסינון" : "לחץ על 'בדיקה חדשה'"}</p>{!(search || filterResult !== "all" || filterType !== "all") && <button onClick={() => openCreate()} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 text-sm font-medium flex items-center gap-2 mx-auto"><Plus className="w-4 h-4" />בדיקה חדשה</button>}</div>
      ) : (<>
        <BulkActions items={filtered} selectedIds={bulk.selectedIds} onSelectionChange={bulk.setSelectedIds} actions={[
          defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/quality-inspections/${id}`, { method: "DELETE" }))); load(); }),
          defaultBulkActions.export(async (ids) => { const d = filtered.filter(r => ids.includes(r.id)); const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "quality_inspections.json"; a.click(); }),
        ]} />
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
            <th className="px-2 py-3 w-10"><BulkCheckbox checked={bulk.selectedIds.length === filtered.length && filtered.length > 0} partial={bulk.selectedIds.length > 0 && bulk.selectedIds.length < filtered.length} onChange={() => bulk.toggleAll(filtered)} /></th>
            {columns.map(col => (<th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div></th>))}
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
          </tr></thead><tbody>
            {pagination.paginate(filtered).map(r => (
              <tr key={r.id} className={`border-b border-border/20 hover:bg-muted/20 transition-colors ${bulk.isSelected(r.id) ? "bg-primary/5" : ""}`}>
                <td className="px-2 py-3"><BulkCheckbox checked={bulk.isSelected(r.id)} onChange={() => bulk.toggle(r.id)} /></td>
                <td className="px-4 py-3 font-mono text-xs text-green-400 font-bold">{r.inspection_number}</td>
                <td className="px-4 py-3"><Badge className="text-[10px] bg-muted/20 text-slate-300">{typeMap[r.inspection_type] || r.inspection_type}</Badge></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.inspection_date?.slice(0, 10)}</td>
                <td className="px-4 py-3 text-foreground max-w-[150px] truncate">{r.product_name || "—"}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.batch_number || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.inspector_name || "—"}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${severityMap[r.severity]?.color || ""}`}>{severityMap[r.severity]?.label || r.severity}</Badge></td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${resultMap[r.result]?.color || ""}`}>{resultMap[r.result]?.label || r.result}</Badge></td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                  <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/quality-inspections`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                  {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.inspection_number || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
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
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Shield className="w-5 h-5 text-green-400" />בדיקה {viewDetail.inspection_number}</h2><button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="מספר" value={viewDetail.inspection_number} />
                <DetailField label="סוג" value={typeMap[viewDetail.inspection_type] || viewDetail.inspection_type} />
                <DetailField label="תאריך" value={viewDetail.inspection_date?.slice(0, 10)} />
                <DetailField label="מוצר" value={viewDetail.product_name} />
                <DetailField label="קוד מוצר" value={viewDetail.product_code} />
                <DetailField label="אצוות" value={viewDetail.batch_number} />
                <DetailField label="בודק" value={viewDetail.inspector_name} />
                <DetailField label="ספק" value={viewDetail.supplier_name} />
                <DetailField label="דגימה" value={`${viewDetail.accepted_count || 0}/${viewDetail.sample_size || 0}`} />
                <DetailField label="חומרה"><Badge className={severityMap[viewDetail.severity]?.color}>{severityMap[viewDetail.severity]?.label || viewDetail.severity}</Badge></DetailField>
                <DetailField label="תוצאה"><Badge className={resultMap[viewDetail.result]?.color}>{resultMap[viewDetail.result]?.label || viewDetail.result}</Badge></DetailField>
                <DetailField label="הנחיה" value={dispositionMap[viewDetail.disposition] || viewDetail.disposition} />
                <DetailField label="עלות איכות" value={viewDetail.cost_of_quality ? `₪${fmt(viewDetail.cost_of_quality)}` : "—"} />
                <div className="col-span-2"><DetailField label="פעולה מתקנת" value={viewDetail.corrective_action} /></div>
                <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
              </div>}
              {detailTab === "related" && <div className="p-5"><RelatedRecords tabs={[
                { key: "products", label: "מוצרים", endpoint: `/api/product-catalog?search=${encodeURIComponent(viewDetail.product_name || "")}`, columns: [{ key: "productName", label: "שם מוצר" }, { key: "productNumber", label: "מק\"ט" }, { key: "status", label: "סטטוס" }], emptyMessage: "אין מוצרים קשורים" },
                { key: "inspections", label: "בדיקות נוספות", endpoint: `/api/quality-inspections?productName=${encodeURIComponent(viewDetail.product_name || "")}`, columns: [{ key: "inspection_number", label: "מספר" }, { key: "inspection_date", label: "תאריך" }, { key: "result", label: "תוצאה" }], emptyMessage: "אין בדיקות נוספות" },
              ]} /></div>}
              {detailTab === "docs" && <div className="p-5"><AttachmentsSection entityType="quality_inspection" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="quality_inspection" entityId={viewDetail.id} /></div>}
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
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת בדיקה" : "בדיקת איכות חדשה"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג בדיקה *</label><select value={form.inspectionType || "incoming"} onChange={e => setForm({ ...form, inspectionType: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך *</label><input type="date" value={form.inspectionDate || ""} onChange={e => setForm({ ...form, inspectionDate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">שם מוצר *</label><input value={form.productName || ""} onChange={e => setForm({ ...form, productName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">קוד מוצר</label><input value={form.productCode || ""} onChange={e => setForm({ ...form, productCode: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">אצוות</label><input value={form.batchNumber || ""} onChange={e => setForm({ ...form, batchNumber: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">בודק *</label><input value={form.inspectorName || ""} onChange={e => setForm({ ...form, inspectorName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">דגימה</label><input type="number" value={form.sampleSize || ""} onChange={e => setForm({ ...form, sampleSize: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תקין</label><input type="number" value={form.acceptedCount || ""} onChange={e => setForm({ ...form, acceptedCount: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">חומרה</label><select value={form.severity || "minor"} onChange={e => setForm({ ...form, severity: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(severityMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תוצאה</label><select value={form.result || "pending"} onChange={e => setForm({ ...form, result: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(resultMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">הנחיה</label><select value={form.disposition || "pending"} onChange={e => setForm({ ...form, disposition: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(dispositionMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">עלות איכות</label><input type="number" step="0.01" value={form.costOfQuality || ""} onChange={e => setForm({ ...form, costOfQuality: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">פעולה מתקנת</label><textarea value={form.correctiveAction || ""} onChange={e => setForm({ ...form, correctiveAction: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              </div>
              <div className="p-5 border-t border-border flex gap-3">
                <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl hover:bg-primary/90 text-sm font-medium disabled:opacity-50"><Save className="w-4 h-4" />{saving ? "שומר..." : editing ? "עדכון" : "שמירה"}</button>
                <button onClick={() => setShowForm(false)} className="px-4 py-2.5 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
