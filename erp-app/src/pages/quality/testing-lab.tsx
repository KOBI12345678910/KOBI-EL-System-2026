import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FlaskConical, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2, XCircle,
  Clock, AlertTriangle, Eye, ArrowUpDown, Award, FileCheck, ChevronRight
} from "lucide-react";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import AttachmentsSection from "@/components/attachments-section";
import StatusTransition from "@/components/status-transition";
import { WritePermissionGate } from "@/components/permission-gate";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);

interface FinalInspection {
  id: number;
  inspection_number: string;
  batch_reference?: string;
  material_name?: string;
  supplier_name?: string;
  inspection_date?: string;
  inspector?: string;
  result: string;
  status: string;
  disposition?: string;
  defects_found?: number;
  notes?: string;
  certificate_id?: number;
  results?: TestResult[];
  plan_name?: string;
  result_count?: number;
  results_passed?: number;
  results_failed?: number;
}

interface TestResult {
  id: number;
  item_name?: string;
  measured_value?: number;
  min_value?: number;
  max_value?: number;
  unit?: string;
  result: string;
  notes?: string;
}

const resultMap: Record<string, { label: string; color: string }> = {
  pending: { label: "ממתין", color: "bg-yellow-500/20 text-yellow-400" },
  pass: { label: "עבר", color: "bg-green-500/20 text-green-400" },
  fail: { label: "נכשל", color: "bg-red-500/20 text-red-400" },
  conditional: { label: "מותנה", color: "bg-orange-500/20 text-orange-400" },
};

const statusMap: Record<string, { label: string; color: string }> = {
  pending: { label: "ממתין", color: "bg-yellow-500/20 text-yellow-400" },
  in_progress: { label: "בביצוע", color: "bg-blue-500/20 text-blue-400" },
  passed: { label: "עבר", color: "bg-green-500/20 text-green-400" },
  failed: { label: "נכשל", color: "bg-red-500/20 text-red-400" },
  closed: { label: "סגור", color: "bg-muted/20 text-muted-foreground" },
};

const qcStatuses = Object.entries(statusMap).map(([key, val]) => ({ key, ...val }));
const qcTransitions = [
  { from: "pending", to: "in_progress", label: "התחל בדיקה" },
  { from: "in_progress", to: "passed", label: "עבר בהצלחה", requireConfirm: true },
  { from: "in_progress", to: "failed", label: "נכשל", requireConfirm: true },
  { from: "passed", to: "closed", label: "סגור" },
  { from: "failed", to: "closed", label: "סגור" },
];

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return <div><div className="text-xs text-muted-foreground mb-1">{label}</div><div className="text-sm text-foreground">{children || value || "—"}</div></div>;
}

export default function TestingLabPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<FinalInspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterResult, setFilterResult] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("inspection_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FinalInspection | null>(null);
  const [viewDetail, setViewDetail] = useState<FinalInspection | null>(null);
  const [detailFull, setDetailFull] = useState<FinalInspection | null>(null);
  const [detailTab, setDetailTab] = useState("details");
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [showResultForm, setShowResultForm] = useState(false);
  const [resultForm, setResultForm] = useState<any>({});
  const [showCertForm, setShowCertForm] = useState(false);
  const [certSaving, setCertSaving] = useState(false);
  const [certForm, setCertForm] = useState<any>({});
  const pagination = useSmartPagination(25);

  const validation = useFormValidation({
    inspector: { required: true, message: "שם בודק חובה" },
    inspectionDate: { required: true, message: "תאריך חובה" },
  });

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`${API}/qc-inspections?type=final`);
      if (res.ok) setItems(safeArray(await res.json()));
    } catch (e: any) { setError(e.message); }
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
      (filterStatus === "all" || i.status === filterStatus) &&
      (!search || [i.inspection_number, i.inspector, i.batch_reference, i.material_name]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterResult, filterStatus, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ inspectionType: "final", inspectionDate: new Date().toISOString().slice(0, 10), result: "pending", status: "pending", sampleSize: 1 });
    validation.clearErrors();
    setShowForm(true);
  };

  const openEdit = (r: FinalInspection) => {
    setEditing(r);
    setForm({
      inspectionType: "final", inspector: r.inspector, inspectionDate: r.inspection_date?.slice(0, 10),
      batchReference: r.batch_reference, materialName: r.material_name, supplierName: r.supplier_name,
      result: r.result, status: r.status, defectsFound: r.defects_found, notes: r.notes,
    });
    validation.clearErrors();
    setShowForm(true);
  };

  const save = async () => {
    if (!validation.validate(form)) return;
    setSaving(true);
    try {
      const url = editing ? `${API}/qc-inspections/${editing.id}` : `${API}/qc-inspections`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק בדיקה סופית זו?")) {
      await authFetch(`${API}/qc-inspections/${id}`, { method: "DELETE" }); load();
    }
  };

  const openDetail = async (r: FinalInspection) => {
    setDetailTab("details"); setViewDetail(r);
    try {
      const res = await authFetch(`${API}/qc-inspections/${r.id}`);
      if (res.ok) setDetailFull(await res.json());
    } catch {}
  };

  const handleStatusTransition = async (newStatus: string) => {
    if (!viewDetail) return;
    await authFetch(`${API}/qc-inspections/${viewDetail.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }),
    });
    load(); setViewDetail({ ...viewDetail, status: newStatus });
  };

  const saveResult = async () => {
    if (!viewDetail) return;
    setSaving(true);
    try {
      await authFetch(`${API}/qc-inspections/${viewDetail.id}/results`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(resultForm),
      });
      setShowResultForm(false); setResultForm({});
      const res = await authFetch(`${API}/qc-inspections/${viewDetail.id}`);
      if (res.ok) setDetailFull(await res.json());
      load();
    } catch {}
    setSaving(false);
  };

  const generateCertificate = async () => {
    if (!viewDetail) return;
    setCertSaving(true);
    try {
      const testResults = (detailFull?.results || []).map(r => ({
        parameterName: r.item_name || "פרמטר",
        measuredValue: r.measured_value,
        minValue: r.min_value,
        maxValue: r.max_value,
        unit: r.unit,
        result: r.result,
        notes: r.notes,
      }));
      const payload = {
        inspectionId: viewDetail.id,
        certType: certForm.certType || "CoC",
        batchReference: viewDetail.batch_reference || certForm.batchReference,
        productName: certForm.productName || viewDetail.material_name,
        materialName: viewDetail.material_name,
        supplierName: viewDetail.supplier_name,
        inspectorName: viewDetail.inspector,
        testResults,
        overallResult: viewDetail.result === "pass" ? "pass" : viewDetail.result === "fail" ? "fail" : "pending",
        remarks: certForm.remarks,
      };
      const res = await authFetch(`${API}/quality-certificates`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (res.ok) {
        setShowCertForm(false); setCertForm({});
        load();
        alert("תעודת האיכות נוצרה בהצלחה!");
      }
    } catch {}
    setCertSaving(false);
  };

  const passCount = items.filter(i => i.result === "pass").length;
  const failCount = items.filter(i => i.result === "fail").length;
  const pendingCount = items.filter(i => i.result === "pending").length;
  const certCount = items.filter(i => i.certificate_id).length;

  const kpis = [
    { label: "סה\"כ בדיקות סופיות", value: items.length, icon: FlaskConical, color: "text-purple-400" },
    { label: "עברו", value: passCount, icon: CheckCircle2, color: "text-green-400" },
    { label: "נכשלו", value: failCount, icon: XCircle, color: "text-red-400" },
    { label: "ממתינות", value: pendingCount, icon: Clock, color: "text-yellow-400" },
    { label: "תעודות שהונפקו", value: certCount, icon: Award, color: "text-blue-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <FlaskConical className="text-purple-400 w-6 h-6" /> מעבדת בדיקות — בדיקות סופיות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ביצוע פרוטוקולי בדיקה · רישום תוצאות · הנפקת תעודות איכות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered}
            headers={{ inspection_number: "מספר", inspection_date: "תאריך", inspector: "בודק", material_name: "חומר", result: "תוצאה", status: "סטטוס" }}
            filename="final_inspections" />
          <WritePermissionGate module="production">
            <button onClick={openCreate}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
              <Plus className="w-4 h-4" /> בדיקה סופית חדשה
            </button>
          </WritePermissionGate>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} />
            <div className="text-xl font-bold text-foreground">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
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
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
          <div className="animate-pulse"><div className="h-12 bg-muted/20" />{Array.from({length:5}).map((_,i)=><div key={i} className="h-14 border-t border-border/20 bg-muted/10" />)}</div>
        </div>
      ) : error ? (
        <div className="text-center py-16 text-red-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>{error}</p>
          <button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FlaskConical className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין בדיקות סופיות</p>
          <p className="text-sm mt-1">לחץ על "בדיקה סופית חדשה" להתחיל</p>
        </div>
      ) : (
        <>
          <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border/50">
                  <tr>
                    {[
                      { key: "inspection_number", label: "מספר" },
                      { key: "inspection_date", label: "תאריך" },
                      { key: "material_name", label: "חומר / מוצר" },
                      { key: "batch_reference", label: "אצווה" },
                      { key: "inspector", label: "בודק" },
                      { key: "result_count", label: "בדיקות" },
                      { key: "result", label: "תוצאה" },
                      { key: "status", label: "סטטוס" },
                    ].map(col => (
                      <th key={col.key} onClick={() => toggleSort(col.key)}
                        className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                        <div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.paginate(filtered).map(r => (
                    <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-purple-400 font-bold">{r.inspection_number}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{r.inspection_date?.slice(0, 10)}</td>
                      <td className="px-4 py-3 text-foreground text-xs max-w-[130px] truncate">{r.material_name || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{r.batch_reference || "—"}</td>
                      <td className="px-4 py-3 text-foreground">{r.inspector || "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs font-medium">
                          <span className="text-green-400">{r.results_passed || 0}</span>
                          <span className="text-muted-foreground">/</span>
                          <span className="text-muted-foreground">{r.result_count || 0}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3"><Badge className={`text-[10px] ${resultMap[r.result]?.color || "bg-muted/20 text-muted-foreground"}`}>{resultMap[r.result]?.label || r.result}</Badge></td>
                      <td className="px-4 py-3"><Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>{statusMap[r.status]?.label || r.status}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => openDetail(r)} className="p-1.5 hover:bg-muted rounded-lg" title="פרטים"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                          <WritePermissionGate module="production">
                            <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכה"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                            {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm("למחוק?"))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg" title="מחיקה"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
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
        </>
      )}

      {/* ─── Detail Modal ─── */}
      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <FlaskConical className="w-5 h-5 text-purple-400" /> {viewDetail.inspection_number}
                </h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50 overflow-x-auto">
                {[{key:"details",label:"פרטים"},{key:"tests",label:"תוצאות בדיקה"},{key:"certificate",label:"תעודה"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)}
                    className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>

              {detailTab === "details" && (
                <>
                  <div className="p-4"><StatusTransition currentStatus={viewDetail.status} statuses={qcStatuses} transitions={qcTransitions} onTransition={handleStatusTransition} entityId={viewDetail.id} compact /></div>
                  <div className="p-5 grid grid-cols-2 gap-4">
                    <DetailField label="מספר" value={viewDetail.inspection_number} />
                    <DetailField label="תאריך" value={viewDetail.inspection_date?.slice(0, 10)} />
                    <DetailField label="בודק" value={viewDetail.inspector} />
                    <DetailField label="חומר / מוצר" value={viewDetail.material_name} />
                    <DetailField label="ספק" value={viewDetail.supplier_name} />
                    <DetailField label="אצווה / LOT" value={viewDetail.batch_reference} />
                    <DetailField label="תוצאה"><Badge className={`text-[10px] ${resultMap[viewDetail.result]?.color}`}>{resultMap[viewDetail.result]?.label || viewDetail.result}</Badge></DetailField>
                    <DetailField label="סטטוס"><Badge className={`text-[10px] ${statusMap[viewDetail.status]?.color}`}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge></DetailField>
                    {viewDetail.certificate_id && <div className="col-span-2"><DetailField label="תעודת איכות"><span className="text-green-400 flex items-center gap-1"><Award className="w-4 h-4" /> הונפקה (מספר: {viewDetail.certificate_id})</span></DetailField></div>}
                    {viewDetail.notes && <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>}
                  </div>
                </>
              )}

              {detailTab === "tests" && (
                <div className="p-5 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-foreground">תוצאות בדיקה</h3>
                    <WritePermissionGate module="production">
                      <button onClick={() => { setResultForm({}); setShowResultForm(true); }}
                        className="text-xs bg-primary/20 text-primary px-3 py-1.5 rounded-lg hover:bg-primary/30 flex items-center gap-1">
                        <Plus className="w-3 h-3" /> הוסף תוצאה
                      </button>
                    </WritePermissionGate>
                  </div>
                  {(detailFull?.results || []).length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <FlaskConical className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>אין תוצאות רשומות</p>
                    </div>
                  ) : (
                    <div className="border border-border/30 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/20">
                          <tr>
                            <th className="px-3 py-2 text-right text-xs text-muted-foreground">בדיקה</th>
                            <th className="px-3 py-2 text-right text-xs text-muted-foreground">ערך מדוד</th>
                            <th className="px-3 py-2 text-right text-xs text-muted-foreground">קריטריון</th>
                            <th className="px-3 py-2 text-right text-xs text-muted-foreground">תוצאה</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(detailFull?.results || []).map((r, i) => (
                            <tr key={i} className="border-t border-border/20">
                              <td className="px-3 py-2 text-foreground">{r.item_name || `בדיקה ${i + 1}`}</td>
                              <td className="px-3 py-2 font-mono text-foreground">{r.measured_value != null ? `${r.measured_value}${r.unit ? ` ${r.unit}` : ""}` : "—"}</td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">
                                {(r.min_value != null || r.max_value != null) ? `${r.min_value ?? "—"} — ${r.max_value ?? "—"}${r.unit ? ` ${r.unit}` : ""}` : "—"}
                              </td>
                              <td className="px-3 py-2">
                                <Badge className={`text-[10px] ${resultMap[r.result]?.color || "bg-muted/20"}`}>{resultMap[r.result]?.label || r.result}</Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {detailTab === "certificate" && (
                <div className="p-5 space-y-4">
                  {viewDetail.certificate_id ? (
                    <div className="text-center py-8">
                      <Award className="w-12 h-12 mx-auto mb-3 text-yellow-400" />
                      <p className="text-foreground font-semibold">תעודת איכות הונפקה</p>
                      <p className="text-sm text-muted-foreground mt-1">מספר תעודה: {viewDetail.certificate_id}</p>
                      <button
                        onClick={() => window.open(`/quality/test-certificates`, "_blank")}
                        className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm hover:bg-primary/30">
                        <FileCheck className="w-4 h-4 inline ml-1" />צפה בתעודות
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="bg-muted/10 rounded-xl p-4 border border-border/30">
                        <p className="text-sm text-foreground font-medium mb-2">הנפקת תעודת איכות</p>
                        <p className="text-xs text-muted-foreground">צור תעודת Certificate of Conformance (CoC) או Certificate of Quality (CoQ) לאצווה זו</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג תעודה</label>
                          <select value={certForm.certType || "CoC"} onChange={e => setCertForm({ ...certForm, certType: e.target.value })}
                            className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                            <option value="CoC">CoC — Certificate of Conformance</option>
                            <option value="CoQ">CoQ — Certificate of Quality</option>
                            <option value="MTC">MTC — Mill Test Certificate</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-1.5">שם מוצר</label>
                          <input value={certForm.productName || viewDetail.material_name || ""} onChange={e => setCertForm({ ...certForm, productName: e.target.value })}
                            className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות לתעודה</label>
                          <textarea value={certForm.remarks || ""} onChange={e => setCertForm({ ...certForm, remarks: e.target.value })}
                            rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
                        </div>
                      </div>
                      <WritePermissionGate module="production">
                        <button onClick={generateCertificate} disabled={certSaving}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-xl hover:bg-yellow-500/30 text-sm font-medium disabled:opacity-50">
                          <Award className="w-4 h-4" />{certSaving ? "מנפיק תעודה..." : "הנפק תעודת איכות"}
                        </button>
                      </WritePermissionGate>
                    </div>
                  )}
                </div>
              )}

              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="qc_inspection" entityId={viewDetail.id} /></div>}

              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Result Form Modal ─── */}
      <AnimatePresence>
        {showResultForm && viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => setShowResultForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="font-bold text-foreground">הוספת תוצאת בדיקה</h2>
                <button onClick={() => setShowResultForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">שם הבדיקה</label>
                  <input value={resultForm.itemName || ""} onChange={e => setResultForm({ ...resultForm, itemName: e.target.value })}
                    placeholder="לדוג: מבחן מתח / בדיקת ממדים" className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">ערך מדוד</label>
                  <input type="number" step="any" value={resultForm.measuredValue || ""} onChange={e => setResultForm({ ...resultForm, measuredValue: e.target.value })}
                    placeholder="הזן ערך" className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">תוצאה</label>
                  <select value={resultForm.result || "pass"} onChange={e => setResultForm({ ...resultForm, result: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {Object.entries(resultMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">הערות</label>
                  <textarea value={resultForm.notes || ""} onChange={e => setResultForm({ ...resultForm, notes: e.target.value })}
                    rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowResultForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={saveResult} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50">
                  <Save className="w-4 h-4" />{saving ? "שומר..." : "שמור"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Inspection Form Modal ─── */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת בדיקה סופית" : "בדיקה סופית חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5"><RequiredMark />תאריך</label>
                  <input type="date" value={form.inspectionDate || ""} onChange={e => setForm({ ...form, inspectionDate: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  <FormFieldError error={validation.errors.inspectionDate} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5"><RequiredMark />בודק</label>
                  <input value={form.inspector || ""} onChange={e => setForm({ ...form, inspector: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  <FormFieldError error={validation.errors.inspector} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">חומר / מוצר</label>
                  <input value={form.materialName || ""} onChange={e => setForm({ ...form, materialName: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">ספק</label>
                  <input value={form.supplierName || ""} onChange={e => setForm({ ...form, supplierName: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">אצווה / LOT</label>
                  <input value={form.batchReference || ""} onChange={e => setForm({ ...form, batchReference: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תוצאה</label>
                  <select value={form.result || "pending"} onChange={e => setForm({ ...form, result: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {Object.entries(resultMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label>
                  <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })}
                    rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50">
                  <Save className="w-4 h-4" />{saving ? "שומר..." : "שמור"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
