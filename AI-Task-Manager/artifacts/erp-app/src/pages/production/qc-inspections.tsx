import { useState, useEffect, useMemo } from "react";
import {
  Shield, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2,
  XCircle, Clock, AlertTriangle, Eye, ArrowUpDown, Filter,
  FileText, ClipboardCheck, BarChart3, Wrench, Package,
  Award, ChevronDown, ChevronRight, List, Settings2, Copy
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { printPage } from "@/lib/print-utils";
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

type PageTab = "inspections" | "plans";
type InspType = "incoming" | "in-process" | "final" | "all";

interface Inspection {
  id: number;
  inspection_number: string;
  work_order_id: number;
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
  plan_id?: number;
  plan_name?: string;
  material_id?: number;
  material_name?: string;
  supplier_id?: number;
  supplier_name?: string;
  sample_size?: number;
  disposition?: string;
  certificate_id?: number;
  result_count?: number;
  results_passed?: number;
  results_failed?: number;
  results?: InspectionResult[];
}

interface InspectionResult {
  id: number;
  inspection_id: number;
  plan_item_id?: number;
  item_name?: string;
  measured_value?: number;
  min_value?: number;
  max_value?: number;
  target_value?: number;
  unit?: string;
  result: string;
  notes?: string;
}

interface InspectionPlan {
  id: number;
  plan_name: string;
  plan_code?: string;
  inspection_type: string;
  material_name?: string;
  supplier_name?: string;
  sample_size: number;
  acceptance_level: number;
  is_active: boolean;
  item_count?: number;
  items?: PlanItem[];
}

interface PlanItem {
  id?: number;
  item_name: string;
  parameter_type: string;
  min_value?: number;
  max_value?: number;
  target_value?: number;
  unit?: string;
  test_method?: string;
  is_required: boolean;
}

const typeMap: Record<string, { label: string; color: string }> = {
  incoming: { label: "בדיקת כניסה", color: "bg-blue-500/20 text-blue-400" },
  "in-process": { label: "בדיקת תהליך", color: "bg-amber-500/20 text-amber-400" },
  final: { label: "בדיקה סופית", color: "bg-purple-500/20 text-purple-400" },
  dimensional: { label: "ממדית", color: "bg-cyan-500/20 text-cyan-400" },
  visual: { label: "חזותית", color: "bg-emerald-500/20 text-emerald-400" },
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

const dispositionMap: Record<string, { label: string; color: string }> = {
  pending: { label: "ממתין", color: "bg-yellow-500/20 text-yellow-400" },
  accept: { label: "קבל", color: "bg-green-500/20 text-green-400" },
  reject: { label: "דחה", color: "bg-red-500/20 text-red-400" },
  quarantine: { label: "הסגר", color: "bg-orange-500/20 text-orange-400" },
  rework: { label: "תיקון", color: "bg-amber-500/20 text-amber-400" },
  conditional_accept: { label: "קבלה מותנית", color: "bg-blue-500/20 text-blue-400" },
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
  { from: "in_progress", to: "passed", label: "עבר בהצלחה", requireConfirm: true, confirmMessage: "האם לסמן כעבר?" },
  { from: "in_progress", to: "failed", label: "נכשל", requireConfirm: true, confirmMessage: "האם לסמן ככשלון?" },
  { from: "passed", to: "closed", label: "סגור" },
  { from: "failed", to: "closed", label: "סגור" },
];

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return <div><div className="text-xs text-muted-foreground mb-1">{label}</div><div className="text-sm text-foreground">{children || value || "—"}</div></div>;
}

export default function QCInspectionsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [pageTab, setPageTab] = useState<PageTab>("inspections");
  const [typeTab, setTypeTab] = useState<InspType>("all");
  const [items, setItems] = useState<Inspection[]>([]);
  const [plans, setPlans] = useState<InspectionPlan[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterResult, setFilterResult] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("inspection_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Inspection | null>(null);
  const [viewDetail, setViewDetail] = useState<Inspection | null>(null);
  const [detailFull, setDetailFull] = useState<Inspection | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<InspectionPlan | null>(null);
  const [planForm, setPlanForm] = useState<any>({});
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [showDisposition, setShowDisposition] = useState(false);
  const [showResultForm, setShowResultForm] = useState(false);
  const [resultForm, setResultForm] = useState<any>({});
  const [selectedPlanDetail, setSelectedPlanDetail] = useState<InspectionPlan | null>(null);
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();

  const validation = useFormValidation({
    inspector: { required: true, minLength: 2, message: "שם בודק חובה" },
    inspectionType: { required: true, message: "סוג בדיקה חובה" },
    inspectionDate: { required: true, message: "תאריך חובה" },
  });

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const typeFilter = typeTab !== "all" ? `?type=${typeTab}` : "";
      const [itemsRes, statsRes, plansRes] = await Promise.all([
        authFetch(`${API}/qc-inspections${typeFilter}`),
        authFetch(`${API}/qc-inspections/stats`),
        authFetch(`${API}/inspection-plans`),
      ]);
      if (itemsRes.ok) setItems(safeArray(await itemsRes.json()));
      if (statsRes.ok) setStats((await statsRes.json()) || {});
      if (plansRes.ok) setPlans(safeArray(await plansRes.json()));
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [typeTab]);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterResult === "all" || i.result === filterResult) &&
      (filterStatus === "all" || i.status === filterStatus) &&
      (!search || [i.inspection_number, i.inspector, i.batch_reference, i.material_name, i.supplier_name]
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

  const paged = pagination.paginate(filtered);

  const openCreate = () => {
    setEditing(null);
    setForm({
      inspectionDate: new Date().toISOString().slice(0, 10),
      inspectionType: typeTab !== "all" ? typeTab : "in-process",
      result: "pending", status: "pending", defectsFound: 0, sampleSize: 1,
    });
    validation.clearErrors();
    setShowForm(true);
  };

  const openEdit = (r: Inspection) => {
    setEditing(r);
    setForm({
      workOrderId: r.work_order_id, batchReference: r.batch_reference,
      inspectionDate: r.inspection_date?.slice(0, 10), inspector: r.inspector,
      inspectionType: r.inspection_type, result: r.result,
      defectsFound: r.defects_found, defectDescription: r.defect_description,
      correctiveAction: r.corrective_action, status: r.status, notes: r.notes,
      planId: r.plan_id, materialName: r.material_name, supplierName: r.supplier_name,
      sampleSize: r.sample_size, disposition: r.disposition,
    });
    validation.clearErrors();
    setShowForm(true);
  };

  const save = async () => {
    if (!validation.validate(form)) return;
    setSaving(true);
    try {
      const url = editing ? `${API}/qc-inspections/${editing.id}` : `${API}/qc-inspections`;
      const res = await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה")); setSaving(false); return; }
      setShowForm(false); load();
    } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק בדיקת QC זו? פעולה זו אינה ניתנת לביטול.")) {
      await authFetch(`${API}/qc-inspections/${id}`, { method: "DELETE" }); load();
    }
  };

  const handleStatusTransition = async (newStatus: string) => {
    if (!viewDetail) return;
    await authFetch(`${API}/qc-inspections/${viewDetail.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }),
    });
    load(); setViewDetail({ ...viewDetail, status: newStatus });
  };

  const openDetail = async (r: Inspection) => {
    setDetailTab("details"); setViewDetail(r);
    try {
      const res = await authFetch(`${API}/qc-inspections/${r.id}`);
      if (res.ok) setDetailFull(await res.json());
    } catch {}
  };

  const handleDisposition = async (disposition: string, notes: string) => {
    if (!viewDetail) return;
    await authFetch(`${API}/qc-inspections/${viewDetail.id}/disposition`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ disposition, notes }),
    });
    setShowDisposition(false); load();
    setViewDetail(null);
  };

  const saveResult = async () => {
    if (!viewDetail) return;
    setSaving(true);
    try {
      const res = await authFetch(`${API}/qc-inspections/${viewDetail.id}/results`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(resultForm),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה")); setSaving(false); return; }
      setShowResultForm(false); setResultForm({});
      const r2 = await authFetch(`${API}/qc-inspections/${viewDetail.id}`);
      if (r2.ok) setDetailFull(await r2.json());
      load();
    } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
    setSaving(false);
  };

  const savePlan = async () => {
    if (!planForm.planName) { alert("שדה חובה: שם תוכנית הבדיקה"); return; }
    setSaving(true);
    try {
      const url = editingPlan ? `${API}/inspection-plans/${editingPlan.id}` : `${API}/inspection-plans`;
      const res = await authFetch(url, {
        method: editingPlan ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...planForm, items: planItems }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה")); setSaving(false); return; }
      setShowPlanForm(false); load();
    } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
    setSaving(false);
  };

  const deletePlan = async (id: number) => {
    if (await globalConfirm("למחוק תוכנית בדיקה זו?")) {
      await authFetch(`${API}/inspection-plans/${id}`, { method: "DELETE" }); load();
    }
  };

  const clonePlan = async (plan: InspectionPlan) => {
    await authFetch(`${API}/inspection-plans/${plan.id}/clone`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
    }); load();
  };

  const openPlanDetail = async (plan: InspectionPlan) => {
    try {
      const res = await authFetch(`${API}/inspection-plans/${plan.id}`);
      if (res.ok) setSelectedPlanDetail(await res.json());
    } catch {}
  };

  const passRate = Number(stats.total || 0) > 0
    ? ((Number(stats.passed || 0) / Number(stats.total)) * 100).toFixed(1) : "0";

  const kpis = [
    { label: "סה\"כ בדיקות", value: fmt(stats.total || items.length), icon: Shield, color: "text-blue-400" },
    { label: "בדיקות כניסה", value: fmt(stats.incoming_count || 0), icon: Package, color: "text-cyan-400" },
    { label: "בתהליך", value: fmt(stats.in_process_count || 0), icon: Wrench, color: "text-amber-400" },
    { label: "בדיקות סופיות", value: fmt(stats.final_count || 0), icon: Award, color: "text-purple-400" },
    { label: "שיעור הצלחה", value: `${passRate}%`, icon: BarChart3, color: "text-emerald-400" },
    { label: "סה\"כ ליקויים", value: fmt(stats.total_defects || 0), icon: AlertTriangle, color: "text-orange-400" },
  ];

  const columns = [
    { key: "inspection_number", label: "מספר בדיקה" },
    { key: "inspection_type", label: "סוג" },
    { key: "inspection_date", label: "תאריך" },
    { key: "batch_reference", label: "אצווה" },
    { key: "material_name", label: "חומר / מוצר" },
    { key: "inspector", label: "בודק" },
    { key: "result", label: "תוצאה" },
    { key: "disposition", label: "הנחיה" },
    { key: "status", label: "סטטוס" },
  ];

  const typeTabs: { key: InspType; label: string; icon: any }[] = [
    { key: "all", label: "הכל", icon: List },
    { key: "incoming", label: "בדיקת כניסה", icon: Package },
    { key: "in-process", label: "תהליך", icon: Wrench },
    { key: "final", label: "בדיקה סופית", icon: Award },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="text-green-400 w-6 h-6" /> בדיקות איכות (QC)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">בדיקות כניסה, תהליך וסופי · תוכניות בדיקה · רישום תוצאות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered}
            headers={{ inspection_number: "מספר", inspection_type: "סוג", inspection_date: "תאריך", inspector: "בודק", batch_reference: "אצווה", result: "תוצאה", status: "סטטוס" }}
            filename="qc_inspections" />
          <WritePermissionGate module="production">
            <button onClick={() => { setEditingPlan(null); setPlanForm({ inspectionType: "incoming", sampleSize: 1 }); setPlanItems([]); setShowPlanForm(true); }}
              className="flex items-center gap-2 bg-muted/30 text-muted-foreground px-4 py-2.5 rounded-xl hover:bg-muted/50 shadow text-sm font-medium border border-border">
              <FileText className="w-4 h-4" /> תוכנית חדשה
            </button>
            <button onClick={openCreate}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
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
            <div className="text-xl font-bold text-foreground">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-1 border-b border-border/50">
        {[{ key: "inspections" as PageTab, label: "בדיקות", icon: ClipboardCheck },
          { key: "plans" as PageTab, label: "תוכניות בדיקה", icon: FileText }].map(t => (
          <button key={t.key} onClick={() => setPageTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${pageTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {pageTab === "inspections" && (
        <>
          <div className="flex gap-1 flex-wrap">
            {typeTabs.map(t => (
              <button key={t.key} onClick={() => setTypeTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${typeTab === t.key ? "bg-primary text-primary-foreground" : "bg-muted/20 text-muted-foreground hover:bg-muted/40"}`}>
                <t.icon className="w-3.5 h-3.5" />{t.label}
              </button>
            ))}
          </div>

          <div className="flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי מספר, בודק, אצווה..."
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
              <ClipboardCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">אין בדיקות QC</p>
              <p className="text-sm mt-1">{search || filterResult !== "all" ? "נסה לשנות את הסינון" : "לחץ על 'בדיקה חדשה' כדי להתחיל"}</p>
            </div>
          ) : (<>
            <BulkActions items={filtered} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
              defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/qc-inspections/${id}`, { method: "DELETE" }))); load(); }),
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
                          <div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div>
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
                        <td className="px-4 py-3"><Badge className={`text-[10px] ${typeMap[r.inspection_type]?.color || "bg-muted/20 text-muted-foreground"}`}>{typeMap[r.inspection_type]?.label || r.inspection_type}</Badge></td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{r.inspection_date?.slice(0, 10)}</td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{r.batch_reference || "—"}</td>
                        <td className="px-4 py-3 text-foreground text-xs max-w-[120px] truncate">{r.material_name || "—"}</td>
                        <td className="px-4 py-3 text-foreground">{r.inspector || "—"}</td>
                        <td className="px-4 py-3"><Badge className={`text-[10px] ${resultMap[r.result]?.color || "bg-muted/20 text-muted-foreground"}`}>{resultMap[r.result]?.label || r.result}</Badge></td>
                        <td className="px-4 py-3"><Badge className={`text-[10px] ${dispositionMap[r.disposition || "pending"]?.color || "bg-muted/20 text-muted-foreground"}`}>{dispositionMap[r.disposition || "pending"]?.label || r.disposition || "ממתין"}</Badge></td>
                        <td className="px-4 py-3"><Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>{statusMap[r.status]?.label || r.status}</Badge></td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => openDetail(r)} className="p-1.5 hover:bg-muted rounded-lg" title="צפייה"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                            <WritePermissionGate module="production">
                              <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכה"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button><button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/qc-inspections`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                              {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק '${r.inspection_number}'?`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg" title="מחיקה"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
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
        </>
      )}

      {pageTab === "plans" && (
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input placeholder="חיפוש תוכניות..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          {plans.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">אין תוכניות בדיקה</p>
              <p className="text-sm mt-1">לחץ על 'תוכנית חדשה' כדי להגדיר תוכנית</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {plans.map(plan => (
                <motion.div key={plan.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-card border border-border/50 rounded-2xl p-4 hover:border-primary/30 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-foreground text-sm">{plan.plan_name}</h3>
                      {plan.plan_code && <p className="text-xs text-muted-foreground font-mono">{plan.plan_code}</p>}
                    </div>
                    <Badge className={`text-[10px] ${typeMap[plan.inspection_type]?.color || "bg-muted/20 text-muted-foreground"}`}>
                      {typeMap[plan.inspection_type]?.label || plan.inspection_type}
                    </Badge>
                  </div>
                  <div className="space-y-1.5 text-xs text-muted-foreground mb-3">
                    {plan.material_name && <p>חומר: <span className="text-foreground">{plan.material_name}</span></p>}
                    {plan.supplier_name && <p>ספק: <span className="text-foreground">{plan.supplier_name}</span></p>}
                    <p>גודל דגימה: <span className="text-foreground">{plan.sample_size}</span></p>
                    <p>פריטי בדיקה: <span className="text-foreground">{plan.item_count || 0}</span></p>
                    <p>רמת קבלה: <span className="text-foreground">{plan.acceptance_level}%</span></p>
                  </div>
                  <div className="flex gap-1.5 pt-2 border-t border-border/30">
                    <button onClick={() => openPlanDetail(plan)} className="flex-1 px-2 py-1.5 text-xs bg-muted/20 rounded-lg hover:bg-muted/40 text-center">
                      <Eye className="w-3 h-3 inline ml-1" />פרטים
                    </button>
                    <WritePermissionGate module="production">
                      <button onClick={() => { setEditingPlan(plan); setPlanForm({ planName: plan.plan_name, planCode: plan.plan_code, inspectionType: plan.inspection_type, materialName: plan.material_name, supplierName: plan.supplier_name, sampleSize: plan.sample_size, acceptanceLevel: plan.acceptance_level }); setPlanItems([]); setShowPlanForm(true); }}
                        className="px-2 py-1.5 text-xs bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20">
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button onClick={() => clonePlan(plan)} className="px-2 py-1.5 text-xs bg-emerald-500/10 text-emerald-400 rounded-lg hover:bg-emerald-500/20" title="שכפל">
                        <Plus className="w-3 h-3" />
                      </button>
                      <button onClick={async()=>{if(await globalConfirm("למחוק תוכנית זו?"))deletePlan(plan.id)}}
                        className="px-2 py-1.5 text-xs bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </WritePermissionGate>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Inspection Detail Modal ─── */}
      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Shield className="w-5 h-5 text-green-400" /> בדיקה {viewDetail.inspection_number}
                  <Badge className={`text-[10px] ml-2 ${typeMap[viewDetail.inspection_type]?.color}`}>{typeMap[viewDetail.inspection_type]?.label || viewDetail.inspection_type}</Badge>
                </h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50 overflow-x-auto">
                {[{key:"details",label:"פרטים"},{key:"results",label:"תוצאות בדיקה"},{key:"disposition",label:"הנחיה"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)}
                    className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
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
                    <DetailField label="חומר / מוצר" value={viewDetail.material_name} />
                    <DetailField label="ספק" value={viewDetail.supplier_name} />
                    <DetailField label="גודל דגימה" value={String(viewDetail.sample_size || 1)} />
                    <DetailField label="תוצאה"><Badge className={`text-[10px] ${resultMap[viewDetail.result]?.color}`}>{resultMap[viewDetail.result]?.label || viewDetail.result}</Badge></DetailField>
                    <DetailField label="הנחיה"><Badge className={`text-[10px] ${dispositionMap[viewDetail.disposition || "pending"]?.color}`}>{dispositionMap[viewDetail.disposition || "pending"]?.label || "ממתין"}</Badge></DetailField>
                    <DetailField label="ליקויים" value={String(viewDetail.defects_found || 0)} />
                    <DetailField label="סטטוס"><Badge className={`text-[10px] ${statusMap[viewDetail.status]?.color}`}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge></DetailField>
                    {viewDetail.plan_name && <DetailField label="תוכנית בדיקה" value={viewDetail.plan_name} />}
                    {viewDetail.defect_description && <div className="col-span-2"><DetailField label="תיאור ליקוי" value={viewDetail.defect_description} /></div>}
                    {viewDetail.corrective_action && <div className="col-span-2"><DetailField label="פעולה מתקנת" value={viewDetail.corrective_action} /></div>}
                    {viewDetail.notes && <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>}
                  </div>
                </>
              )}

              {detailTab === "results" && (
                <div className="p-5 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-foreground">תוצאות בדיקה</h3>
                    <WritePermissionGate module="production">
                      <button onClick={() => { setResultForm({}); setShowResultForm(true); }}
                        className="flex items-center gap-1.5 text-xs bg-primary/20 text-primary px-3 py-1.5 rounded-lg hover:bg-primary/30">
                        <Plus className="w-3 h-3" /> הוסף תוצאה
                      </button>
                    </WritePermissionGate>
                  </div>
                  {(detailFull?.results || []).length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <ClipboardCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>אין תוצאות רשומות</p>
                      <p className="text-xs mt-1">לחץ על "הוסף תוצאה" לרישום מדידה</p>
                    </div>
                  ) : (
                    <div className="border border-border/30 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/20">
                          <tr>
                            <th className="px-3 py-2 text-right text-xs text-muted-foreground font-medium">פרמטר</th>
                            <th className="px-3 py-2 text-right text-xs text-muted-foreground font-medium">ערך מדוד</th>
                            <th className="px-3 py-2 text-right text-xs text-muted-foreground font-medium">טווח</th>
                            <th className="px-3 py-2 text-right text-xs text-muted-foreground font-medium">תוצאה</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(detailFull?.results || []).map((r, i) => (
                            <tr key={i} className="border-t border-border/20">
                              <td className="px-3 py-2 text-foreground">{r.item_name || `פריט ${i + 1}`}</td>
                              <td className="px-3 py-2 font-mono text-foreground">{r.measured_value != null ? `${r.measured_value} ${r.unit || ""}` : "—"}</td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">
                                {r.min_value != null || r.max_value != null
                                  ? `${r.min_value ?? "—"} — ${r.max_value ?? "—"} ${r.unit || ""}`
                                  : "—"}
                              </td>
                              <td className="px-3 py-2"><Badge className={`text-[10px] ${resultMap[r.result]?.color || "bg-muted/20 text-muted-foreground"}`}>{resultMap[r.result]?.label || r.result}</Badge></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {detailTab === "disposition" && (
                <div className="p-5 space-y-4">
                  <h3 className="font-semibold text-foreground">הנחיה לפריט הנבדק</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(dispositionMap).filter(([k]) => k !== "pending").map(([key, val]) => (
                      <button key={key} onClick={async () => {
                        if (await globalConfirm(`להגדיר הנחיה: ${val.label}?`)) {
                          await handleDisposition(key, "");
                        }
                      }} className={`p-4 rounded-xl border text-right transition-all hover:scale-105 ${viewDetail.disposition === key ? "border-primary bg-primary/10" : "border-border/30 bg-card/50 hover:border-border"}`}>
                        <div className={`text-sm font-semibold ${val.color.replace("bg-", "text-").split(" ")[0]}`}>{val.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {key === "accept" ? "הפריט עומד בכל הדרישות" :
                           key === "reject" ? "הפריט אינו עומד בדרישות" :
                           key === "quarantine" ? "הפריט מועבר להסגר לבדיקה נוספת" :
                           key === "rework" ? "הפריט מחזיר לתיקון" :
                           "קבלה בכפוף לתנאים מוגדרים"}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {detailTab === "docs" && <div className="p-5"><AttachmentsSection entityType="qc_inspection" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="qc_inspection" entityId={viewDetail.id} /></div>}

              <div className="p-5 border-t border-border flex justify-end gap-2">
                <WritePermissionGate module="production">
                  <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }}
                    className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30">
                    <Edit2 className="w-3.5 h-3.5 inline ml-1" />עריכה
                  </button>
                </WritePermissionGate>
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Add Result Modal ─── */}
      <AnimatePresence>
        {showResultForm && viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => setShowResultForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">הוספת תוצאת בדיקה</h2>
                <button onClick={() => setShowResultForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                {detailFull?.results && detailFull.results.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">פריט תוכנית</label>
                    <select value={resultForm.planItemId || ""} onChange={e => setResultForm({ ...resultForm, planItemId: e.target.value || null })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      <option value="">ללא פריט מוגדר</option>
                      {(detailFull?.results || []).map((item: any) => (
                        <option key={item.plan_item_id} value={item.plan_item_id}>{item.item_name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">ערך מדוד</label>
                  <input type="number" step="any" value={resultForm.measuredValue || ""} onChange={e => setResultForm({ ...resultForm, measuredValue: e.target.value })}
                    placeholder="הזן ערך מספרי"
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תוצאה</label>
                  <select value={resultForm.result || "pending"} onChange={e => setResultForm({ ...resultForm, result: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {Object.entries(resultMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label>
                  <textarea value={resultForm.notes || ""} onChange={e => setResultForm({ ...resultForm, notes: e.target.value })}
                    rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowResultForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={saveResult} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50">
                  <Save className="w-4 h-4" />{saving ? "שומר..." : "שמור תוצאה"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Plan Detail Modal ─── */}
      <AnimatePresence>
        {selectedPlanDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setSelectedPlanDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{selectedPlanDetail.plan_name}</h2>
                <button onClick={() => setSelectedPlanDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <DetailField label="קוד תוכנית" value={selectedPlanDetail.plan_code || "—"} />
                  <DetailField label="סוג בדיקה" value={typeMap[selectedPlanDetail.inspection_type]?.label || selectedPlanDetail.inspection_type} />
                  <DetailField label="חומר" value={selectedPlanDetail.material_name || "—"} />
                  <DetailField label="ספק" value={selectedPlanDetail.supplier_name || "—"} />
                  <DetailField label="גודל דגימה" value={String(selectedPlanDetail.sample_size)} />
                  <DetailField label="רמת קבלה" value={`${selectedPlanDetail.acceptance_level}%`} />
                </div>
                {(selectedPlanDetail.items || []).length > 0 && (
                  <div>
                    <h3 className="font-semibold text-foreground mb-3">פריטי בדיקה</h3>
                    <div className="border border-border/30 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/20">
                          <tr>
                            <th className="px-3 py-2 text-right text-xs text-muted-foreground">פרמטר</th>
                            <th className="px-3 py-2 text-right text-xs text-muted-foreground">סוג</th>
                            <th className="px-3 py-2 text-right text-xs text-muted-foreground">מינימום</th>
                            <th className="px-3 py-2 text-right text-xs text-muted-foreground">מקסימום</th>
                            <th className="px-3 py-2 text-right text-xs text-muted-foreground">יחידה</th>
                            <th className="px-3 py-2 text-right text-xs text-muted-foreground">חובה</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(selectedPlanDetail.items || []).map((item, i) => (
                            <tr key={i} className="border-t border-border/20">
                              <td className="px-3 py-2 text-foreground">{item.item_name}</td>
                              <td className="px-3 py-2 text-muted-foreground text-xs">{item.parameter_type}</td>
                              <td className="px-3 py-2 font-mono text-xs">{item.min_value ?? "—"}</td>
                              <td className="px-3 py-2 font-mono text-xs">{item.max_value ?? "—"}</td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">{item.unit || "—"}</td>
                              <td className="px-3 py-2">{item.is_required ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-5 border-t border-border flex justify-end">
                <button onClick={() => setSelectedPlanDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
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
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת בדיקה" : "בדיקת QC חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5"><RequiredMark />סוג בדיקה</label>
                  <select value={form.inspectionType || "in-process"} onChange={e => setForm({ ...form, inspectionType: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5"><RequiredMark />תאריך</label>
                  <input type="date" value={form.inspectionDate || ""} onChange={e => setForm({ ...form, inspectionDate: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  <FormFieldError error={validation.errors.inspectionDate} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5"><RequiredMark />בודק</label>
                  <input value={form.inspector || ""} onChange={e => setForm({ ...form, inspector: e.target.value })}
                    placeholder="שם הבודק"
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  <FormFieldError error={validation.errors.inspector} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תוכנית בדיקה</label>
                  <select value={form.planId || ""} onChange={e => setForm({ ...form, planId: e.target.value || null })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    <option value="">ללא תוכנית</option>
                    {plans.filter(p => p.inspection_type === form.inspectionType || true).map(p => (
                      <option key={p.id} value={p.id}>{p.plan_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">חומר / מוצר</label>
                  <input value={form.materialName || ""} onChange={e => setForm({ ...form, materialName: e.target.value })}
                    placeholder="שם חומר/מוצר"
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">ספק</label>
                  <input value={form.supplierName || ""} onChange={e => setForm({ ...form, supplierName: e.target.value })}
                    placeholder="שם ספק"
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">אצווה / LOT</label>
                  <input value={form.batchReference || ""} onChange={e => setForm({ ...form, batchReference: e.target.value })}
                    placeholder="מספר אצווה"
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">גודל דגימה</label>
                  <input type="number" value={form.sampleSize || 1} onChange={e => setForm({ ...form, sampleSize: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תוצאה</label>
                  <select value={form.result || "pending"} onChange={e => setForm({ ...form, result: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {Object.entries(resultMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                  <select value={form.status || "pending"} onChange={e => setForm({ ...form, status: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">מספר ליקויים</label>
                  <input type="number" value={form.defectsFound || 0} onChange={e => setForm({ ...form, defectsFound: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">הנחיה</label>
                  <select value={form.disposition || "pending"} onChange={e => setForm({ ...form, disposition: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {Object.entries(dispositionMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור ליקוי</label>
                  <textarea value={form.defectDescription || ""} onChange={e => setForm({ ...form, defectDescription: e.target.value })}
                    rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">פעולה מתקנת</label>
                  <textarea value={form.correctiveAction || ""} onChange={e => setForm({ ...form, correctiveAction: e.target.value })}
                    rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label>
                  <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })}
                    rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50">
                  <Save className="w-4 h-4" />{saving ? "שומר..." : "שמור"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Plan Form Modal ─── */}
      <AnimatePresence>
        {showPlanForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowPlanForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editingPlan ? "עריכת תוכנית" : "תוכנית בדיקה חדשה"}</h2>
                <button onClick={() => setShowPlanForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">שם תוכנית *</label>
                    <input value={planForm.planName || ""} onChange={e => setPlanForm({ ...planForm, planName: e.target.value })}
                      placeholder="שם תוכנית הבדיקה"
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">קוד תוכנית</label>
                    <input value={planForm.planCode || ""} onChange={e => setPlanForm({ ...planForm, planCode: e.target.value })}
                      placeholder="IP-001"
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג בדיקה</label>
                    <select value={planForm.inspectionType || "incoming"} onChange={e => setPlanForm({ ...planForm, inspectionType: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">חומר/מוצר</label>
                    <input value={planForm.materialName || ""} onChange={e => setPlanForm({ ...planForm, materialName: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">ספק</label>
                    <input value={planForm.supplierName || ""} onChange={e => setPlanForm({ ...planForm, supplierName: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">גודל דגימה</label>
                    <input type="number" value={planForm.sampleSize || 1} onChange={e => setPlanForm({ ...planForm, sampleSize: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">רמת קבלה (%)</label>
                    <input type="number" step="0.1" value={planForm.acceptanceLevel || 0} onChange={e => setPlanForm({ ...planForm, acceptanceLevel: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium text-muted-foreground">פריטי בדיקה</label>
                    <button onClick={() => setPlanItems([...planItems, { item_name: "", parameter_type: "measurement", is_required: true }])}
                      className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
                      <Plus className="w-3 h-3" /> הוסף פריט
                    </button>
                  </div>
                  <div className="space-y-2">
                    {planItems.map((item, i) => (
                      <div key={i} className="border border-border/30 rounded-xl p-3 space-y-2">
                        <div className="flex gap-2">
                          <input value={item.item_name} onChange={e => { const ni = [...planItems]; ni[i] = { ...ni[i], item_name: e.target.value }; setPlanItems(ni); }}
                            placeholder="שם פרמטר" className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm" />
                          <select value={item.parameter_type} onChange={e => { const ni = [...planItems]; ni[i] = { ...ni[i], parameter_type: e.target.value }; setPlanItems(ni); }}
                            className="bg-background border border-border rounded-lg px-3 py-2 text-sm">
                            <option value="measurement">מדידה</option>
                            <option value="visual">חזותי</option>
                            <option value="pass_fail">עובר/נכשל</option>
                          </select>
                          <button onClick={() => setPlanItems(planItems.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          <input type="number" step="any" value={item.min_value || ""} onChange={e => { const ni = [...planItems]; ni[i] = { ...ni[i], min_value: Number(e.target.value) }; setPlanItems(ni); }}
                            placeholder="מינימום" className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs" />
                          <input type="number" step="any" value={item.max_value || ""} onChange={e => { const ni = [...planItems]; ni[i] = { ...ni[i], max_value: Number(e.target.value) }; setPlanItems(ni); }}
                            placeholder="מקסימום" className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs" />
                          <input value={item.unit || ""} onChange={e => { const ni = [...planItems]; ni[i] = { ...ni[i], unit: e.target.value }; setPlanItems(ni); }}
                            placeholder="יחידה (mm, kg...)" className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs" />
                          <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            <input type="checkbox" checked={item.is_required} onChange={e => { const ni = [...planItems]; ni[i] = { ...ni[i], is_required: e.target.checked }; setPlanItems(ni); }} />
                            חובה
                          </label>
                        </div>
                      </div>
                    ))}
                    {planItems.length === 0 && (
                      <div className="text-center py-4 text-muted-foreground text-sm border border-dashed border-border/30 rounded-xl">
                        לחץ "הוסף פריט" להגדרת פרמטרי בדיקה
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowPlanForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={savePlan} disabled={saving || !planForm.planName} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50">
                  <Save className="w-4 h-4" />{saving ? "שומר..." : "שמור תוכנית"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
