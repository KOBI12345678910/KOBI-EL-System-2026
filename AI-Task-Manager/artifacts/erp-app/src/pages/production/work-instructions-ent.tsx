import { useState, useEffect, useMemo } from "react";
import {
  FileText, BookOpen, Clock, CheckCircle, Search, Plus, Edit2, Trash2, X,
  ArrowUpDown, Users, AlertTriangle, Eye, Wrench
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
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  under_review: { label: "בבדיקה", color: "bg-amber-500/20 text-amber-400" },
  archived: { label: "בארכיון", color: "bg-blue-500/20 text-blue-400" },
};
const SKILL_LEVELS: Record<string, string> = { basic: "בסיסי", intermediate: "בינוני", advanced: "מתקדם", expert: "מומחה" };
const CATEGORIES = ["production", "assembly", "finishing", "packaging", "testing"];
const CATEGORY_LABELS: Record<string, string> = { production: "ייצור", assembly: "הרכבה", finishing: "גימור", packaging: "אריזה", testing: "בדיקות" };

const wiStatuses = [
  { key: "draft", label: "טיוטה", color: "bg-muted/20 text-muted-foreground" },
  { key: "under_review", label: "בבדיקה", color: "bg-amber-500/20 text-amber-400" },
  { key: "active", label: "פעיל", color: "bg-green-500/20 text-green-400" },
  { key: "archived", label: "בארכיון", color: "bg-blue-500/20 text-blue-400" },
];
const wiTransitions = [
  { from: "draft", to: "under_review", label: "שלח לבדיקה" },
  { from: "under_review", to: "active", label: "אשר והפעל", requireConfirm: true },
  { from: "under_review", to: "draft", label: "החזר לטיוטה" },
  { from: "active", to: "archived", label: "העבר לארכיון", requireConfirm: true },
];

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return <div><div className="text-xs text-muted-foreground mb-1">{label}</div><div className="text-sm text-foreground">{children || value || "—"}</div></div>;
}

export default function WorkInstructionsEntPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [sortField, setSortField] = useState("updated_at");
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
    title: { required: true, minLength: 2, message: "כותרת חובה" },
  });

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [iRes, sRes] = await Promise.all([authFetch(`${API}/work-instructions`), authFetch(`${API}/work-instructions/stats`)]);
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
      (filterCategory === "all" || r.category === filterCategory) &&
      (!search || [r.title, r.instruction_number, r.product_name, r.department]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, filterCategory, sortField, sortDir]);

  const paged = pagination.paginate(filtered);

  const openCreate = () => { setEditing(null); setForm({ status: "draft", category: "production", skillLevel: "basic", version: "1.0", estimatedTime: 0 }); validation.clearErrors(); setShowForm(true); };
  const openEdit = (r: any) => { setEditing(r); setForm({ title: r.title, productName: r.product_name, productCode: r.product_code, version: r.version, department: r.department, category: r.category, safetyNotes: r.safety_notes, qualityRequirements: r.quality_requirements, toolsRequired: r.tools_required, estimatedTime: r.estimated_time, skillLevel: r.skill_level, status: r.status, notes: r.notes }); validation.clearErrors(); setShowForm(true); };

  const save = async () => {
    if (!validation.validate(form)) return;
    setSaving(true);
    try { const url = editing ? `${API}/work-instructions/${editing.id}` : `${API}/work-instructions`; const res = await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); if (!res.ok) { const e = await res.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה")); setSaving(false); return; } setShowForm(false); load(); } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
    setSaving(false);
  };
  const remove = async (id: number) => { if (await globalConfirm("למחוק הוראת עבודה?")) { await authFetch(`${API}/work-instructions/${id}`, { method: "DELETE" }); load(); } };

  const handleStatusTransition = async (newStatus: string) => {
    if (!viewDetail) return;
    await authFetch(`${API}/work-instructions/${viewDetail.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }) });
    load(); setViewDetail({ ...viewDetail, status: newStatus });
  };

  const kpis = [
    { label: "סה\"כ הוראות", value: fmt(stats.total || items.length), icon: FileText, color: "text-blue-400" },
    { label: "פעילות", value: fmt(stats.active || 0), icon: CheckCircle, color: "text-green-400" },
    { label: "טיוטות", value: fmt(stats.drafts || 0), icon: BookOpen, color: "text-muted-foreground" },
    { label: "עודכנו לאחרונה", value: fmt(stats.recent_updates || 0), icon: Clock, color: "text-cyan-400" },
    { label: "מחלקות", value: fmt(stats.departments || 0), icon: Users, color: "text-purple-400" },
    { label: "בארכיון", value: fmt(stats.archived || 0), icon: AlertTriangle, color: "text-amber-400" },
  ];

  const columns = [
    { key: "instruction_number", label: "מספר" }, { key: "title", label: "כותרת" },
    { key: "product_name", label: "מוצר" }, { key: "department", label: "מחלקה" },
    { key: "category", label: "קטגוריה" }, { key: "skill_level", label: "רמה" },
    { key: "estimated_time", label: "זמן (דק')" }, { key: "status", label: "סטטוס" },
  ];

  const relatedTabs = viewDetail ? [
    { key: "products", label: "מוצרים", icon: Wrench, endpoint: `${API}/bom-tree?productName=${viewDetail.product_name || ""}`, columns: [{ key: "product_name", label: "מוצר" }, { key: "bom_level", label: "רמה" }, { key: "status", label: "סטטוס" }], emptyMessage: "אין מוצרים" },
    { key: "steps", label: "שלבים", icon: FileText, endpoint: `${API}/work-instructions?parentId=${viewDetail.id}`, columns: [{ key: "instruction_number", label: "מספר" }, { key: "title", label: "כותרת" }, { key: "estimated_time", label: "זמן" }], emptyMessage: "אין שלבים" },
  ] : [];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><FileText className="text-blue-400 w-6 h-6" /> הוראות עבודה</h1>
          <p className="text-sm text-muted-foreground mt-1">הנחיות ייצור שלב-אחר-שלב</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ instruction_number: "מספר", title: "כותרת", product_name: "מוצר", department: "מחלקה", category: "קטגוריה", skill_level: "רמה", estimated_time: "זמן", status: "סטטוס" }} filename="work_instructions" />
          <WritePermissionGate module="production">
            <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> הוראה חדשה</button>
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש הוראת עבודה..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הקטגוריות</option>{CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה בטעינה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><FileText className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין הוראות עבודה</p><p className="text-sm mt-1">{search || filterStatus !== "all" ? "נסה לשנות את הסינון" : "לחץ על הוראה חדשה כדי להתחיל"}</p>{!(search || filterStatus !== "all" || filterCategory !== "all") && <button onClick={() => openCreate()} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 text-sm font-medium flex items-center gap-2 mx-auto"><Plus className="w-4 h-4" />הוראה חדשה</button>}</div>
      ) : (<>
        <BulkActions items={filtered} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
          defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/work-instructions/${id}`, { method: "DELETE" }))); load(); }),
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
                    <td className="px-4 py-3 font-mono text-xs text-blue-400 font-bold">{r.instruction_number}</td>
                    <td className="px-4 py-3 text-foreground font-medium">{r.title}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.product_name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.department || "—"}</td>
                    <td className="px-4 py-3"><Badge className="text-[10px] bg-cyan-500/20 text-cyan-400">{CATEGORY_LABELS[r.category] || r.category}</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground">{SKILL_LEVELS[r.skill_level] || r.skill_level}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.estimated_time || 0}</td>
                    <td className="px-4 py-3"><Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>{statusMap[r.status]?.label || r.status}</Badge></td>
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
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><FileText className="w-5 h-5 text-blue-400" /> הוראה {viewDetail.instruction_number}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
                <>
                  <div className="p-4"><StatusTransition currentStatus={viewDetail.status} statuses={wiStatuses} transitions={wiTransitions} onTransition={handleStatusTransition} entityId={viewDetail.id} compact /></div>
                  <div className="p-5 grid grid-cols-2 gap-4">
                    <DetailField label="מספר" value={viewDetail.instruction_number} />
                    <DetailField label="כותרת" value={viewDetail.title} />
                    <DetailField label="מוצר" value={viewDetail.product_name} />
                    <DetailField label="מק״ט" value={viewDetail.product_code} />
                    <DetailField label="מחלקה" value={viewDetail.department} />
                    <DetailField label="קטגוריה" value={CATEGORY_LABELS[viewDetail.category] || viewDetail.category} />
                    <DetailField label="רמת מיומנות" value={SKILL_LEVELS[viewDetail.skill_level] || viewDetail.skill_level} />
                    <DetailField label="גרסה" value={viewDetail.version} />
                    <DetailField label="זמן משוער (דק')" value={String(viewDetail.estimated_time || 0)} />
                    <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge></DetailField>
                    <div className="col-span-2"><DetailField label="כלים נדרשים" value={viewDetail.tools_required} /></div>
                    <div className="col-span-2"><DetailField label="דרישות איכות" value={viewDetail.quality_requirements} /></div>
                    <div className="col-span-2"><DetailField label="הערות בטיחות" value={viewDetail.safety_notes} /></div>
                    <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
                  </div>
                </>
              )}
              {detailTab === "related" && <div className="p-4"><RelatedRecords tabs={relatedTabs} /></div>}
              {detailTab === "docs" && <div className="p-4"><AttachmentsSection entityType="work-instruction" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-4"><ActivityLog entityType="work-instruction" entityId={viewDetail.id} /></div>}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30"><Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה</button>
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
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת הוראת עבודה" : "הוראת עבודה חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4"><div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5"><RequiredMark />כותרת</label><input value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /><FormFieldError error={validation.errors.title} /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מוצר</label><input value={form.productName || ""} onChange={e => setForm({ ...form, productName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מק״ט</label><input value={form.productCode || ""} onChange={e => setForm({ ...form, productCode: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מחלקה</label><input value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">גרסה</label><input value={form.version || "1.0"} onChange={e => setForm({ ...form, version: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">קטגוריה</label><select value={form.category || "production"} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">רמת מיומנות</label><select value={form.skillLevel || "basic"} onChange={e => setForm({ ...form, skillLevel: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(SKILL_LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">זמן משוער (דק')</label><input type="number" value={form.estimatedTime || 0} onChange={e => setForm({ ...form, estimatedTime: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label><select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">כלים נדרשים</label><input value={form.toolsRequired || ""} onChange={e => setForm({ ...form, toolsRequired: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">דרישות איכות</label><input value={form.qualityRequirements || ""} onChange={e => setForm({ ...form, qualityRequirements: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות בטיחות</label><input value={form.safetyNotes || ""} onChange={e => setForm({ ...form, safetyNotes: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              </div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div></div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50">{saving ? "שומר..." : "שמירה"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
