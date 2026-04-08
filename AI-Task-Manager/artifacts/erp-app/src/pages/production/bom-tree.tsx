import { useState, useEffect, useMemo } from "react";
import {
  FolderTree, Package, Layers, DollarSign, Search, Plus, Edit2, Trash2, X,
  ArrowUpDown, FileText, Clock, Eye, AlertTriangle
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
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  inactive: { label: "לא פעיל", color: "bg-red-500/20 text-red-400" },
  under_review: { label: "בבדיקה", color: "bg-amber-500/20 text-amber-400" },
};
const LEVELS = ["top", "sub", "component"];
const LEVEL_LABELS: Record<string, string> = { top: "ראשי", sub: "תת-הרכבה", component: "רכיב" };

const bomTreeStatuses = [
  { key: "draft", label: "טיוטה", color: "bg-muted/20 text-muted-foreground" },
  { key: "under_review", label: "בבדיקה", color: "bg-amber-500/20 text-amber-400" },
  { key: "active", label: "פעיל", color: "bg-green-500/20 text-green-400" },
  { key: "inactive", label: "לא פעיל", color: "bg-red-500/20 text-red-400" },
];
const bomTreeTransitions = [
  { from: "draft", to: "under_review", label: "שלח לבדיקה" },
  { from: "under_review", to: "active", label: "אשר והפעל", requireConfirm: true },
  { from: "under_review", to: "draft", label: "החזר לטיוטה" },
  { from: "active", to: "inactive", label: "השבת", requireConfirm: true },
];

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return <div><div className="text-xs text-muted-foreground mb-1">{label}</div><div className="text-sm text-foreground">{children || value || "—"}</div></div>;
}

export default function BomTreePage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("product_name");
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
    productName: { required: true, minLength: 2, message: "שם מוצר חובה" },
  });

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [iRes, sRes] = await Promise.all([authFetch(`${API}/bom-tree`), authFetch(`${API}/bom-tree/stats`)]);
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
      (!search || [r.product_name, r.product_code, r.bom_number, r.preferred_supplier].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, sortField, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ status: "draft", bomLevel: "top", version: "1.0", quantityPerUnit: 1, unit: "unit" }); validation.clearErrors(); setShowForm(true); };
  const openEdit = (r: any) => { setEditing(r); setForm({ productName: r.product_name, productCode: r.product_code, version: r.version, bomLevel: r.bom_level, materialCost: r.material_cost, laborCost: r.labor_cost, overheadCost: r.overhead_cost, rolledUpCost: r.rolled_up_cost, preferredSupplier: r.preferred_supplier, leadTimeDays: r.lead_time_days, status: r.status, notes: r.notes }); validation.clearErrors(); setShowForm(true); };

  const save = async () => {
    if (!validation.validate(form)) return;
    setSaving(true);
    try { const url = editing ? `${API}/bom-tree/${editing.id}` : `${API}/bom-tree`; const res = await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); if (!res.ok) { const e = await res.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה")); setSaving(false); return; } setShowForm(false); load(); } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
    setSaving(false);
  };
  const remove = async (id: number) => { if (await globalConfirm("למחוק רכיב BOM?")) { await authFetch(`${API}/bom-tree/${id}`, { method: "DELETE" }); load(); } };

  const handleStatusTransition = async (newStatus: string) => {
    if (!viewDetail) return;
    await authFetch(`${API}/bom-tree/${viewDetail.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }) });
    load(); setViewDetail({ ...viewDetail, status: newStatus });
  };

  const kpis = [
    { label: "סה\"כ מוצרים", value: fmt(stats.total || items.length), icon: Package, color: "text-blue-400" },
    { label: "רכיבים ייחודיים", value: fmt(stats.unique_products || 0), icon: Layers, color: "text-cyan-400" },
    { label: "עלות ממוצעת", value: fmtC(Math.round(Number(stats.avg_cost) || 0)), icon: DollarSign, color: "text-green-400" },
    { label: "פעילים", value: fmt(stats.active || 0), icon: FolderTree, color: "text-emerald-400" },
    { label: "טיוטות", value: fmt(stats.drafts || 0), icon: FileText, color: "text-muted-foreground" },
    { label: "בבדיקה", value: fmt(stats.under_review || 0), icon: Clock, color: "text-amber-400" },
  ];

  const columns = [
    { key: "bom_number", label: "מספר" }, { key: "product_name", label: "מוצר" },
    { key: "product_code", label: "מק\"ט" }, { key: "bom_level", label: "רמה" },
    { key: "rolled_up_cost", label: "עלות מצטברת" }, { key: "preferred_supplier", label: "ספק" },
    { key: "status", label: "סטטוס" },
  ];

  const paged = pagination.paginate(filtered);

  const relatedTabs = viewDetail ? [
    { key: "components", label: "רכיבים", icon: Layers, endpoint: `${API}/bom-tree?parentId=${viewDetail.id}`, columns: [{ key: "product_name", label: "מוצר" }, { key: "bom_level", label: "רמה" }, { key: "rolled_up_cost", label: "עלות" }], emptyMessage: "אין רכיבים" },
    { key: "suppliers", label: "ספקים", icon: Package, endpoint: `${API}/suppliers?productCode=${viewDetail.product_code || ""}`, columns: [{ key: "name", label: "ספק" }, { key: "contact_person", label: "איש קשר" }, { key: "phone", label: "טלפון" }], emptyMessage: "אין ספקים" },
  ] : [];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><FolderTree className="text-cyan-400 w-6 h-6" /> עץ מוצר (BOM)</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול היררכי של רכיבי מוצר ועלויות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ bom_number: "מספר", product_name: "מוצר", product_code: "מק\"ט", bom_level: "רמה", rolled_up_cost: "עלות מצטברת", preferred_supplier: "ספק", status: "סטטוס" }} filename="bom_tree" />
          <WritePermissionGate module="production">
            <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> רכיב חדש</button>
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={'חיפוש מוצר, מק"ט...'} className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה בטעינה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><FolderTree className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">לא נמצאו רכיבי BOM</p></div>
      ) : (<>
        <BulkActions items={filtered} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
          defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/bom-tree/${id}`, { method: "DELETE" }))); load(); }),
          defaultBulkActions.export(async () => {}),
        ]} />
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50"><tr>
                <th className="px-2 py-3 w-8"><BulkCheckbox checked={selectedIds.length === paged.length && paged.length > 0} partial={selectedIds.length > 0 && selectedIds.length < paged.length} onChange={() => toggleAll(paged)} /></th>
                {columns.map(col => (
                  <th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                    <div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div></th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
              </tr></thead>
              <tbody>
                {paged.map(r => (
                  <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="px-2 py-3"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-cyan-400 font-bold">{r.bom_number}</td>
                    <td className="px-4 py-3 text-foreground font-medium">{r.product_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.product_code || "—"}</td>
                    <td className="px-4 py-3"><Badge className="text-[10px] bg-purple-500/20 text-purple-400">{LEVEL_LABELS[r.bom_level] || r.bom_level}</Badge></td>
                    <td className="px-4 py-3 text-green-400 font-medium">{fmtC(Number(r.rolled_up_cost) || 0)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.preferred_supplier || "—"}</td>
                    <td className="px-4 py-3"><Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>{statusMap[r.status]?.label || r.status}</Badge></td>
                    <td className="px-4 py-3"><div className="flex gap-1">
                      <button onClick={() => { setDetailTab("details"); setViewDetail(r); }} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <WritePermissionGate module="production">
                        <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                        {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.product_name || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
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
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><FolderTree className="w-5 h-5 text-cyan-400" /> BOM {viewDetail.bom_number}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
                <>
                  <div className="p-4"><StatusTransition currentStatus={viewDetail.status} statuses={bomTreeStatuses} transitions={bomTreeTransitions} onTransition={handleStatusTransition} entityId={viewDetail.id} compact /></div>
                  <div className="p-5 grid grid-cols-2 gap-4">
                    <DetailField label="מספר BOM" value={viewDetail.bom_number} />
                    <DetailField label="שם מוצר" value={viewDetail.product_name} />
                    <DetailField label="מק״ט" value={viewDetail.product_code} />
                    <DetailField label="גרסה" value={viewDetail.version} />
                    <DetailField label="רמת BOM" value={LEVEL_LABELS[viewDetail.bom_level] || viewDetail.bom_level} />
                    <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge></DetailField>
                    <DetailField label="עלות חומרים" value={fmtC(Number(viewDetail.material_cost) || 0)} />
                    <DetailField label="עלות עבודה" value={fmtC(Number(viewDetail.labor_cost) || 0)} />
                    <DetailField label="עלות תקורה" value={fmtC(Number(viewDetail.overhead_cost) || 0)} />
                    <DetailField label="עלות מצטברת" value={fmtC(Number(viewDetail.rolled_up_cost) || 0)} />
                    <DetailField label="ספק מועדף" value={viewDetail.preferred_supplier} />
                    <DetailField label="זמן אספקה (ימים)" value={String(viewDetail.lead_time_days || 0)} />
                    <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
                  </div>
                </>
              )}
              {detailTab === "related" && <div className="p-4"><RelatedRecords tabs={relatedTabs} /></div>}
              {detailTab === "docs" && <div className="p-4"><AttachmentsSection entityType="bom-tree" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-4"><ActivityLog entityType="bom-tree" entityId={viewDetail.id} /></div>}
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
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת רכיב BOM" : "רכיב BOM חדש"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4"><div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5"><RequiredMark />שם מוצר</label>
                  <input value={form.productName || ""} onChange={e => setForm({ ...form, productName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /><FormFieldError error={validation.errors.productName} /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מק״ט</label>
                  <input value={form.productCode || ""} onChange={e => setForm({ ...form, productCode: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">גרסה</label>
                  <input value={form.version || "1.0"} onChange={e => setForm({ ...form, version: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">רמת BOM</label>
                  <select value={form.bomLevel || "top"} onChange={e => setForm({ ...form, bomLevel: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {LEVELS.map(l => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                  <select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">עלות חומרים</label>
                  <input type="number" value={form.materialCost || 0} onChange={e => setForm({ ...form, materialCost: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">עלות עבודה</label>
                  <input type="number" value={form.laborCost || 0} onChange={e => setForm({ ...form, laborCost: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">עלות תקורה</label>
                  <input type="number" value={form.overheadCost || 0} onChange={e => setForm({ ...form, overheadCost: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">ספק מועדף</label>
                  <input value={form.preferredSupplier || ""} onChange={e => setForm({ ...form, preferredSupplier: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">זמן אספקה (ימים)</label>
                  <input type="number" value={form.leadTimeDays || 0} onChange={e => setForm({ ...form, leadTimeDays: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              </div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label>
                <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div></div>
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
