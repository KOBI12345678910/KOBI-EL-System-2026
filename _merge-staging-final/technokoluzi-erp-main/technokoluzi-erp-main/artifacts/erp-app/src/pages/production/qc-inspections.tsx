import { useState, useEffect, useMemo } from "react";
import {
  Shield, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2,
  XCircle, Clock, AlertTriangle, Eye, ArrowUpDown, Filter,
  FileText, ClipboardCheck, BarChart3, Wrench
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { printPage } from "@/lib/print-utils";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
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

interface Inspection {
  id: number;
  inspection_number: string;
  work_order_id: number;
  work_order_number?: string;
  batch_reference: string;
  inspection_date: string;
  inspector: string;
  inspection_type: string;
  result: string;
  defects_found: number;
  defect_description: string;
  corrective_action: string;
  status: string;
  notes: string;
  created_at?: string;
  updated_at?: string;
}

const typeMap: Record<string, { label: string; color: string }> = {
  incoming: { label: "בדיקת כניסה", color: "bg-blue-500/20 text-blue-400" },
  "in-process": { label: "בדיקת תהליך", color: "bg-amber-500/20 text-amber-400" },
  final: { label: "בדיקה סופית", color: "bg-purple-500/20 text-purple-400" },
  dimensional: { label: "בדיקה ממדית", color: "bg-cyan-500/20 text-cyan-400" },
  visual: { label: "בדיקה חזותית", color: "bg-emerald-500/20 text-emerald-400" },
};

const resultMap: Record<string, { label: string; color: string }> = {
  pending: { label: "ממתין", color: "bg-yellow-500/20 text-yellow-400" },
  pass: { label: "עבר", color: "bg-green-500/20 text-green-400" },
  fail: { label: "נכשל", color: "bg-red-500/20 text-red-400" },
  conditional: { label: "אישור מותנה", color: "bg-orange-500/20 text-orange-400" },
};

const statusMap: Record<string, { label: string; color: string }> = {
  pending: { label: "ממתין", color: "bg-yellow-500/20 text-yellow-400" },
  in_progress: { label: "בביצוע", color: "bg-blue-500/20 text-blue-400" },
  passed: { label: "עבר", color: "bg-green-500/20 text-green-400" },
  failed: { label: "נכשל", color: "bg-red-500/20 text-red-400" },
  closed: { label: "סגור", color: "bg-muted/20 text-muted-foreground" },
};

const qcStatuses = [
  { key: "pending", label: "ממתין", color: "bg-yellow-500/20 text-yellow-400" },
  { key: "in_progress", label: "בביצוע", color: "bg-blue-500/20 text-blue-400" },
  { key: "passed", label: "עבר", color: "bg-green-500/20 text-green-400" },
  { key: "failed", label: "נכשל", color: "bg-red-500/20 text-red-400" },
  { key: "closed", label: "סגור", color: "bg-muted/20 text-muted-foreground" },
];

const qcTransitions = [
  { from: "pending", to: "in_progress", label: "התחל בדיקה" },
  { from: "in_progress", to: "passed", label: "עבר בהצלחה", requireConfirm: true, confirmMessage: "האם לסמן את הבדיקה כעברה?" },
  { from: "in_progress", to: "failed", label: "נכשל", requireConfirm: true, confirmMessage: "האם לסמן את הבדיקה ככשלון?" },
  { from: "passed", to: "closed", label: "סגור" },
  { from: "failed", to: "closed", label: "סגור" },
];

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return <div><div className="text-xs text-muted-foreground mb-1">{label}</div><div className="text-sm text-white">{children || value || "—"}</div></div>;
}

export default function QCInspectionsPage() {
  const [items, setItems] = useState<Inspection[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterResult, setFilterResult] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("inspection_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Inspection | null>(null);
  const [viewDetail, setViewDetail] = useState<Inspection | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();

  const validation = useFormValidation({
    inspector: { required: true, minLength: 2, message: "שם בודק חובה" },
    inspectionType: { required: true, message: "סוג בדיקה חובה" },
    inspectionDate: { required: true, message: "תאריך חובה" },
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemsRes, statsRes] = await Promise.all([
        authFetch(`${API}/qc-inspections`),
        authFetch(`${API}/qc-inspections/stats`),
      ]);
      if (itemsRes.ok) setItems(safeArray(await itemsRes.json()));
      if (statsRes.ok) setStats((await statsRes.json()) || {});
    } catch (e: any) {
      setError(e.message || "שגיאה בטעינת נתונים");
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterResult === "all" || i.result === filterResult) &&
      (filterType === "all" || i.inspection_type === filterType) &&
      (filterStatus === "all" || i.status === filterStatus) &&
      (!search || [i.inspection_number, i.inspector, i.batch_reference, i.defect_description]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterResult, filterType, filterStatus, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      inspectionDate: new Date().toISOString().slice(0, 10),
      inspectionType: "in-process",
      result: "pending",
      status: "pending",
      defectsFound: 0,
    });
    validation.clearErrors();
    setShowForm(true);
  };

  const openEdit = (r: Inspection) => {
    setEditing(r);
    setForm({
      workOrderId: r.work_order_id,
      batchReference: r.batch_reference,
      inspectionDate: r.inspection_date?.slice(0, 10),
      inspector: r.inspector,
      inspectionType: r.inspection_type,
      result: r.result,
      defectsFound: r.defects_found,
      defectDescription: r.defect_description,
      correctiveAction: r.corrective_action,
      status: r.status,
      notes: r.notes,
    });
    validation.clearErrors();
    setShowForm(true);
  };

  const save = async () => {
    if (!validation.validate(form)) return;
    setSaving(true);
    try {
      const url = editing ? `${API}/qc-inspections/${editing.id}` : `${API}/qc-inspections`;
      await authFetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setShowForm(false);
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק בדיקת QC זו? פעולה זו אינה ניתנת לביטול.")) {
      await authFetch(`${API}/qc-inspections/${id}`, { method: "DELETE" });
      load();
    }
  };

  const handleStatusTransition = async (newStatus: string) => {
    if (!viewDetail) return;
    await authFetch(`${API}/qc-inspections/${viewDetail.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    load();
    setViewDetail({ ...viewDetail, status: newStatus });
  };

  const passRate = Number(stats.total || 0) > 0
    ? ((Number(stats.passed || 0) / Number(stats.total)) * 100).toFixed(1) : "0";

  const kpis = [
    { label: "סה\"כ בדיקות", value: fmt(stats.total || items.length), icon: Shield, color: "text-blue-400" },
    { label: "עברו בהצלחה", value: fmt(stats.passed || 0), icon: CheckCircle2, color: "text-green-400" },
    { label: "נכשלו", value: fmt(stats.failed || 0), icon: XCircle, color: "text-red-400" },
    { label: "ממתינות", value: fmt(stats.pending || 0), icon: Clock, color: "text-yellow-400" },
    { label: "שיעור הצלחה", value: `${passRate}%`, icon: BarChart3, color: "text-emerald-400" },
    { label: "סה\"כ ליקויים", value: fmt(stats.total_defects || 0), icon: AlertTriangle, color: "text-orange-400" },
  ];

  const columns = [
    { key: "inspection_number", label: "מספר בדיקה" },
    { key: "inspection_type", label: "סוג" },
    { key: "inspection_date", label: "תאריך" },
    { key: "batch_reference", label: "אצווה / LOT" },
    { key: "inspector", label: "בודק" },
    { key: "result", label: "תוצאה" },
    { key: "defects_found", label: "ליקויים" },
    { key: "status", label: "סטטוס" },
  ];

  const paged = pagination.paginate(filtered);

  const relatedTabs = viewDetail ? [
    {
      key: "work-orders",
      label: "הזמנות עבודה",
      icon: ClipboardCheck,
      endpoint: `${API}/production-work-orders?qcInspectionId=${viewDetail.id}`,
      columns: [
        { key: "order_number", label: "מספר" },
        { key: "product_name", label: "מוצר" },
        { key: "status", label: "סטטוס" },
      ],
      badge: (row: any) => statusMap[row.status] ? { label: statusMap[row.status].label, color: statusMap[row.status].color } : null,
      emptyMessage: "אין הזמנות עבודה קשורות",
    },
    {
      key: "materials",
      label: "חומרים",
      icon: FileText,
      endpoint: `${API}/raw-materials?batchReference=${viewDetail.batch_reference || ""}`,
      columns: [
        { key: "material_name", label: "חומר" },
        { key: "current_stock", label: "מלאי" },
        { key: "unit", label: "יחידה" },
      ],
      emptyMessage: "אין חומרים קשורים",
    },
    {
      key: "corrective",
      label: "פעולות מתקנות",
      icon: Wrench,
      endpoint: `${API}/qc-inspections?workOrderId=${viewDetail.work_order_id || 0}`,
      columns: [
        { key: "inspection_number", label: "מספר" },
        { key: "corrective_action", label: "פעולה מתקנת" },
        { key: "result", label: "תוצאה" },
      ],
      emptyMessage: "אין פעולות מתקנות",
    },
  ] : [];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="text-green-400 w-6 h-6" />
            בדיקות איכות (QC)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">בדיקות איכות לפי הזמנות עבודה, אצוות ייצור ותקנים</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown
            data={filtered}
            headers={{
              inspection_number: "מספר", inspection_type: "סוג", inspection_date: "תאריך",
              inspector: "בודק", batch_reference: "אצווה", result: "תוצאה",
              defects_found: "ליקויים", status: "סטטוס",
            }}
            filename="qc_inspections"
          />
          <WritePermissionGate module="production">
            <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
              <Plus className="w-4 h-4" /> בדיקה חדשה
            </button>
          </WritePermissionGate>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} />
            <div className="text-xl font-bold text-white">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי מספר, בודק, אצווה..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסוגים</option>
          {Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterResult} onChange={e => setFilterResult(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל התוצאות</option>
          {Object.entries(resultMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">שגיאה בטעינה</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ClipboardCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין בדיקות QC</p>
          <p className="text-sm mt-1">{search || filterResult !== "all" || filterType !== "all" ? "נסה לשנות את הסינון" : "לחץ על 'בדיקה חדשה' כדי להתחיל"}</p>
        </div>
      ) : (<>
        <BulkActions items={filtered} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
          defaultBulkActions.delete(async (ids) => { for (const id of ids) await authFetch(`${API}/qc-inspections/${id}`, { method: "DELETE" }); load(); }),
          defaultBulkActions.export(async () => {}),
        ]} />
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  <th className="px-2 py-3 w-8"><BulkCheckbox checked={selectedIds.length === paged.length && paged.length > 0} partial={selectedIds.length > 0 && selectedIds.length < paged.length} onChange={() => toggleAll(paged)} /></th>
                  {columns.map(col => (
                    <th key={col.key} onClick={() => toggleSort(col.key)}
                      className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                      <div className="flex items-center gap-1">
                        {col.label}
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {paged.map(r => (
                  <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="px-2 py-3"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-green-400 font-bold">{r.inspection_number}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${typeMap[r.inspection_type]?.color || "bg-muted/20 text-muted-foreground"}`}>
                        {typeMap[r.inspection_type]?.label || r.inspection_type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.inspection_date?.slice(0, 10)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.batch_reference || "—"}</td>
                    <td className="px-4 py-3 text-white">{r.inspector || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${resultMap[r.result]?.color || "bg-muted/20 text-muted-foreground"}`}>
                        {resultMap[r.result]?.label || r.result}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-bold ${(r.defects_found || 0) > 0 ? "text-red-400" : "text-green-400"}`}>
                        {r.defects_found || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>
                        {statusMap[r.status]?.label || r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => { setDetailTab("details"); setViewDetail(r); }} className="p-1.5 hover:bg-muted rounded-lg" title="צפייה"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        <WritePermissionGate module="production">
                          <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכה"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                          <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.inspection_number || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg" title="מחיקה"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                        </WritePermissionGate>
                      </div>
                    </td>
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-green-400" />
                  בדיקה {viewDetail.inspection_number}
                </h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-white"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
                <>
                  <div className="p-4">
                    <StatusTransition currentStatus={viewDetail.status} statuses={qcStatuses} transitions={qcTransitions} onTransition={handleStatusTransition} entityId={viewDetail.id} compact />
                  </div>
                  <div className="p-5 grid grid-cols-2 gap-4">
                    <DetailField label="מספר בדיקה" value={viewDetail.inspection_number} />
                    <DetailField label="סוג בדיקה" value={typeMap[viewDetail.inspection_type]?.label || viewDetail.inspection_type} />
                    <DetailField label="תאריך" value={viewDetail.inspection_date?.slice(0, 10)} />
                    <DetailField label="בודק" value={viewDetail.inspector} />
                    <DetailField label="אצווה / LOT" value={viewDetail.batch_reference} />
                    <DetailField label="הזמנת עבודה" value={viewDetail.work_order_number || String(viewDetail.work_order_id || "—")} />
                    <DetailField label="תוצאה">
                      <Badge className={resultMap[viewDetail.result]?.color}>{resultMap[viewDetail.result]?.label || viewDetail.result}</Badge>
                    </DetailField>
                    <DetailField label="סטטוס">
                      <Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge>
                    </DetailField>
                    <DetailField label="מספר ליקויים" value={String(viewDetail.defects_found || 0)} />
                    <DetailField label="תאריך יצירה" value={viewDetail.created_at?.slice(0, 10)} />
                    <div className="col-span-2"><DetailField label="תיאור ליקויים" value={viewDetail.defect_description} /></div>
                    <div className="col-span-2"><DetailField label="פעולה מתקנת" value={viewDetail.corrective_action} /></div>
                    <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
                  </div>
                </>
              )}
              {detailTab === "related" && <div className="p-4"><RelatedRecords tabs={relatedTabs} /></div>}
              {detailTab === "docs" && <div className="p-4"><AttachmentsSection entityType="qc-inspection" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-4"><ActivityLog entityType="qc-inspection" entityId={viewDetail.id} /></div>}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30">
                  <Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה
                </button>
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-white">{editing ? "עריכת בדיקה" : "בדיקת QC חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5"><RequiredMark />סוג בדיקה</label>
                    <select value={form.inspectionType || "in-process"} onChange={e => setForm({ ...form, inspectionType: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <FormFieldError error={validation.errors.inspectionType} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5"><RequiredMark />תאריך בדיקה</label>
                    <input type="date" value={form.inspectionDate || ""} onChange={e => setForm({ ...form, inspectionDate: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                    <FormFieldError error={validation.errors.inspectionDate} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">אצווה / LOT</label>
                    <input value={form.batchReference || ""} onChange={e => setForm({ ...form, batchReference: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="מספר אצווה" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5"><RequiredMark />שם הבודק</label>
                    <input value={form.inspector || ""} onChange={e => setForm({ ...form, inspector: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="שם הבודק" />
                    <FormFieldError error={validation.errors.inspector} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">תוצאה</label>
                    <select value={form.result || "pending"} onChange={e => setForm({ ...form, result: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(resultMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">מספר ליקויים</label>
                    <input type="number" min={0} value={form.defectsFound ?? ""} onChange={e => setForm({ ...form, defectsFound: Number(e.target.value) })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                    <select value={form.status || "pending"} onChange={e => setForm({ ...form, status: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">הזמנת עבודה</label>
                    <input type="number" value={form.workOrderId || ""} onChange={e => setForm({ ...form, workOrderId: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="מספר הזמנה" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור ליקויים</label>
                  <textarea value={form.defectDescription || ""} onChange={e => setForm({ ...form, defectDescription: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" rows={2} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">פעולה מתקנת</label>
                  <textarea value={form.correctiveAction || ""} onChange={e => setForm({ ...form, correctiveAction: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" rows={2} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label>
                  <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" rows={2} />
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50">
                  {saving ? "שומר..." : "שמירה"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
