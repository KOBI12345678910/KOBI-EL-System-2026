import { useState, useEffect, useMemo } from "react";
import {
  FolderTree, Search, Plus, Edit2, Trash2, X, CheckCircle2, Clock, FileText,
  ChevronDown, ChevronRight, Eye, ArrowUpDown, AlertTriangle, Layers, Wrench
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
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const statusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-yellow-500/20 text-yellow-400" },
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  obsolete: { label: "מיושן", color: "bg-red-500/20 text-red-400" },
};

const bomStatuses = [
  { key: "draft", label: "טיוטה", color: "bg-yellow-500/20 text-yellow-400" },
  { key: "active", label: "פעיל", color: "bg-green-500/20 text-green-400" },
  { key: "obsolete", label: "מיושן", color: "bg-red-500/20 text-red-400" },
];
const bomTransitions = [
  { from: "draft", to: "active", label: "הפעל", requireConfirm: true, confirmMessage: "להפעיל את ה-BOM?" },
  { from: "active", to: "obsolete", label: "סמן כמיושן", requireConfirm: true },
];

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return <div><div className="text-xs text-muted-foreground mb-1">{label}</div><div className="text-sm text-foreground">{children || value || "—"}</div></div>;
}

export default function BomManagerPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("bom_number");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [selectedBom, setSelectedBom] = useState<number | null>(null);
  const [bomLines, setBomLines] = useState<any[]>([]);
  const [showLineForm, setShowLineForm] = useState(false);
  const [editingLine, setEditingLine] = useState<any>(null);
  const [lineForm, setLineForm] = useState<any>({});
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();

  const validation = useFormValidation({
    name: { required: true, minLength: 2, message: "שם BOM חובה" },
  });

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [iRes, sRes] = await Promise.all([authFetch(`${API}/bom-headers`), authFetch(`${API}/bom-headers/stats`)]);
      if (iRes.ok) setItems(safeArray(await iRes.json()));
      if (sRes.ok) setStats((await sRes.json()) || {});
    } catch (e: any) { setError(e.message || "שגיאה בטעינת נתונים"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const loadLines = async (bomId: number) => {
    try { const r = await authFetch(`${API}/bom-lines/${bomId}`); if (r.ok) setBomLines(safeArray(await r.json())); } catch {}
  };

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (!search || [i.bom_number, i.name, i.product_name].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, sortField, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ version: "1.0", status: "draft" }); validation.clearErrors(); setShowForm(true); };
  const openEdit = (r: any) => { setEditing(r); setForm({ name: r.name, productName: r.product_name, productSku: r.product_sku, version: r.version, status: r.status, description: r.description, totalCost: r.total_cost }); validation.clearErrors(); setShowForm(true); };
  const save = async () => {
    if (!validation.validate(form)) return;
    setSaving(true);
    try { const url = editing ? `${API}/bom-headers/${editing.id}` : `${API}/bom-headers`; const res = await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); if (!res.ok) { const e = await res.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה")); setSaving(false); return; } setShowForm(false); load(); } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
    setSaving(false);
  };
  const remove = async (id: number) => { if (await globalConfirm("למחוק עץ מוצר?")) { await authFetch(`${API}/bom-headers/${id}`, { method: "DELETE" }); load(); } };

  const selectBom = (id: number) => { setSelectedBom(id); loadLines(id); };
  const openCreateLine = () => { setEditingLine(null); setLineForm({ quantity: 1, unit: "יחידה", level: 1, unitCost: 0 }); setShowLineForm(true); };
  const openEditLine = (l: any) => { setEditingLine(l); setLineForm({ componentName: l.component_name, componentSku: l.component_sku, quantity: l.quantity, unit: l.unit, unitCost: l.unit_cost, level: l.level, notes: l.notes }); setShowLineForm(true); };
  const saveLine = async () => {
    if (!lineForm.componentName) { alert("שדה חובה: שם רכיב"); return; }
    try { const url = editingLine ? `${API}/bom-lines/${editingLine.id}` : `${API}/bom-lines`; const body = editingLine ? lineForm : { ...lineForm, bomHeaderId: selectedBom }; const res = await authFetch(url, { method: editingLine ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!res.ok) { const e = await res.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה")); return; } setShowLineForm(false); loadLines(selectedBom!); } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
  };
  const removeLine = async (id: number) => { if (await globalConfirm("למחוק רכיב?")) { await authFetch(`${API}/bom-lines/${id}`, { method: "DELETE" }); loadLines(selectedBom!); } };

  const handleStatusTransition = async (newStatus: string) => {
    if (!viewDetail) return;
    await authFetch(`${API}/bom-headers/${viewDetail.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }) });
    load(); setViewDetail({ ...viewDetail, status: newStatus });
  };

  const kpis = [
    { label: "סה\"כ BOMs", value: fmt(stats.total || items.length), icon: FolderTree, color: "text-blue-400" },
    { label: "פעילים", value: fmt(stats.active || 0), icon: CheckCircle2, color: "text-green-400" },
    { label: "טיוטות", value: fmt(stats.draft || 0), icon: Clock, color: "text-yellow-400" },
    { label: "מיושנים", value: fmt(stats.obsolete || 0), icon: FileText, color: "text-red-400" },
  ];

  const columns = [
    { key: "bom_number", label: "מספר" }, { key: "name", label: "שם" }, { key: "product_name", label: "מוצר" },
    { key: "version", label: "גרסה" }, { key: "status", label: "סטטוס" }, { key: "line_count", label: "רכיבים" },
  ];

  const paged = pagination.paginate(filtered);

  const relatedTabs = viewDetail ? [
    { key: "materials", label: "חומרי גלם", icon: Layers, endpoint: `${API}/bom-lines/${viewDetail.id}`, columns: [{ key: "component_name", label: "רכיב" }, { key: "quantity", label: "כמות" }, { key: "unit_cost", label: "עלות" }], emptyMessage: "אין רכיבים" },
    { key: "work-orders", label: "הזמנות עבודה", icon: FolderTree, endpoint: `${API}/production-work-orders?bomId=${viewDetail.id}`, columns: [{ key: "order_number", label: "מספר" }, { key: "product_name", label: "מוצר" }, { key: "status", label: "סטטוס" }], emptyMessage: "אין הזמנות עבודה" },
    { key: "cost", label: "פירוט עלויות", icon: FileText, endpoint: `${API}/bom-lines/${viewDetail.id}`, columns: [{ key: "component_name", label: "רכיב" }, { key: "unit_cost", label: "עלות יחידה" }, { key: "quantity", label: "כמות" }], emptyMessage: "אין נתוני עלות" },
  ] : [];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><FolderTree className="text-blue-400 w-6 h-6" /> ניהול עצי מוצר (BOM)</h1>
          <p className="text-sm text-muted-foreground mt-1">עצי מוצר, רכיבים, גרסאות וניהול רמות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={items} headers={{ bom_number: "מספר", name: "שם", product_name: "מוצר", version: "גרסה", status: "סטטוס", total_cost: "עלות", line_count: "רכיבים" }} filename="bom_headers" />
          <WritePermissionGate module="production">
            <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> BOM חדש</button>
          </WritePermissionGate>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} /><div className="text-xl font-bold text-foreground">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
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
      ) : (<>
        <BulkActions items={filtered} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
          defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/bom-headers/${id}`, { method: "DELETE" }))); load(); }),
          defaultBulkActions.export(async () => {}),
        ]} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
            <div className="p-3 bg-muted/30 border-b border-border/50 font-semibold text-foreground">רשימת BOMs</div>
            <div className="overflow-auto max-h-[500px]">
              <table className="w-full text-sm">
                <thead className="bg-muted/20 sticky top-0"><tr>
                  <th className="px-2 py-2 w-8"><BulkCheckbox checked={selectedIds.length === paged.length && paged.length > 0} partial={selectedIds.length > 0 && selectedIds.length < paged.length} onChange={() => toggleAll(paged)} /></th>
                  {columns.map(col => (<th key={col.key} onClick={() => toggleSort(col.key)} className="px-3 py-2 text-right text-xs font-medium text-muted-foreground cursor-pointer"><div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div></th>))}
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                </tr></thead>
                <tbody>
                  {filtered.length === 0 ? <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">לא נמצאו BOMs</td></tr> :
                  paged.map(r => (
                    <tr key={r.id} className={`border-b border-border/20 hover:bg-muted/20 cursor-pointer ${selectedBom === r.id ? 'bg-primary/10' : ''}`} onClick={() => selectBom(r.id)}>
                      <td className="px-2 py-2" onClick={e => e.stopPropagation()}><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                      <td className="px-3 py-2 font-mono text-xs text-blue-400">{r.bom_number}</td>
                      <td className="px-3 py-2 text-foreground font-medium">{r.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.product_name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.version}</td>
                      <td className="px-3 py-2"><Badge className={`text-[10px] ${statusMap[r.status]?.color || ''}`}>{statusMap[r.status]?.label || r.status}</Badge></td>
                      <td className="px-3 py-2 text-muted-foreground">{r.line_count}</td>
                      <td className="px-3 py-2"><div className="flex gap-1">
                        <button onClick={(e) => { e.stopPropagation(); setDetailTab("details"); setViewDetail(r); }} className="p-1 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        <WritePermissionGate module="production">
                          <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="p-1 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                          <button onClick={(e) => { e.stopPropagation(); remove(r.id); }} className="p-1 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                        </WritePermissionGate>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <SmartPagination pagination={pagination} />
          </div>

          <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
            <div className="p-3 bg-muted/30 border-b border-border/50 font-semibold text-foreground flex justify-between items-center">
              <span>רכיבים {selectedBom ? `(BOM #${items.find(i => i.id === selectedBom)?.bom_number})` : ''}</span>
              {selectedBom && <WritePermissionGate module="production"><button onClick={openCreateLine} className="flex items-center gap-1 bg-green-500/20 text-green-400 px-2 py-1 rounded-lg text-xs hover:bg-green-500/30"><Plus className="w-3 h-3" /> רכיב</button></WritePermissionGate>}
            </div>
            <div className="overflow-auto max-h-[500px]">
              {selectedBom ? (
                <table className="w-full text-sm">
                  <thead className="bg-muted/20 sticky top-0"><tr><th className="px-3 py-2 text-right text-xs text-muted-foreground">רכיב</th><th className="px-3 py-2 text-right text-xs text-muted-foreground">מק״ט</th><th className="px-3 py-2 text-right text-xs text-muted-foreground">כמות</th><th className="px-3 py-2 text-right text-xs text-muted-foreground">יחידה</th><th className="px-3 py-2 text-right text-xs text-muted-foreground">עלות</th><th className="px-3 py-2 text-right text-xs text-muted-foreground">סה״כ</th><th className="px-3 py-2 text-right text-xs text-muted-foreground">פעולות</th></tr></thead>
                  <tbody>{bomLines.map(l => (
                    <tr key={l.id} className="border-b border-border/20 hover:bg-muted/20">
                      <td className="px-3 py-2 text-foreground">{l.component_name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{l.component_sku}</td>
                      <td className="px-3 py-2 text-muted-foreground">{fmt(l.quantity)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{l.unit}</td>
                      <td className="px-3 py-2 text-muted-foreground">₪{fmt(l.unit_cost)}</td>
                      <td className="px-3 py-2 text-green-400">₪{fmt(Number(l.quantity) * Number(l.unit_cost))}</td>
                      <td className="px-3 py-2"><div className="flex gap-1">
                        <button onClick={() => openEditLine(l)} className="p-1 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                        <button onClick={() => removeLine(l.id)} className="p-1 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                      </div></td>
                    </tr>
                  ))}</tbody>
                </table>
              ) : <div className="p-8 text-center text-muted-foreground"><Layers className="w-8 h-8 mx-auto mb-2 opacity-30" />בחר BOM כדי לצפות ברכיבים</div>}
            </div>
          </div>
        </div>
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><FolderTree className="w-5 h-5 text-blue-400" /> BOM {viewDetail.bom_number}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
                <>
                  <div className="p-4"><StatusTransition currentStatus={viewDetail.status} statuses={bomStatuses} transitions={bomTransitions} onTransition={handleStatusTransition} entityId={viewDetail.id} compact /></div>
                  <div className="p-5 grid grid-cols-2 gap-4">
                    <DetailField label="מספר" value={viewDetail.bom_number} />
                    <DetailField label="שם" value={viewDetail.name} />
                    <DetailField label="מוצר" value={viewDetail.product_name} />
                    <DetailField label="מק״ט" value={viewDetail.product_sku} />
                    <DetailField label="גרסה" value={viewDetail.version} />
                    <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge></DetailField>
                    <DetailField label="עלות כוללת" value={`₪${fmt(viewDetail.total_cost || 0)}`} />
                    <DetailField label="רכיבים" value={String(viewDetail.line_count || 0)} />
                    <div className="col-span-2"><DetailField label="תיאור" value={viewDetail.description} /></div>
                  </div>
                </>
              )}
              {detailTab === "related" && <div className="p-4"><RelatedRecords tabs={relatedTabs} /></div>}
              {detailTab === "docs" && <div className="p-4"><AttachmentsSection entityType="bom" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-4"><ActivityLog entityType="bom" entityId={viewDetail.id} /></div>}
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
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת BOM" : "BOM חדש"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5"><RequiredMark />שם</label><input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /><FormFieldError error={validation.errors.name} /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מוצר</label><input value={form.productName || ""} onChange={e => setForm({ ...form, productName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מק״ט</label><input value={form.productSku || ""} onChange={e => setForm({ ...form, productSku: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">גרסה</label><input value={form.version || ""} onChange={e => setForm({ ...form, version: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label><select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור</label><textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" rows={2} /></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2"><button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button><button onClick={save} disabled={saving} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50">{saving ? "שומר..." : "שמירה"}</button></div>
            </motion.div>
          </motion.div>
        )}
        {showLineForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowLineForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editingLine ? "עריכת רכיב" : "רכיב חדש"}</h2><button onClick={() => setShowLineForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">שם רכיב</label><input value={lineForm.componentName || ""} onChange={e => setLineForm({ ...lineForm, componentName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מק״ט</label><input value={lineForm.componentSku || ""} onChange={e => setLineForm({ ...lineForm, componentSku: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">כמות</label><input type="number" value={lineForm.quantity || ""} onChange={e => setLineForm({ ...lineForm, quantity: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">יחידה</label><input value={lineForm.unit || ""} onChange={e => setLineForm({ ...lineForm, unit: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">עלות ליחידה</label><input type="number" value={lineForm.unitCost || ""} onChange={e => setLineForm({ ...lineForm, unitCost: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">רמה</label><input type="number" value={lineForm.level || ""} onChange={e => setLineForm({ ...lineForm, level: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label><textarea value={lineForm.notes || ""} onChange={e => setLineForm({ ...lineForm, notes: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" rows={2} /></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2"><button onClick={() => setShowLineForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button><button onClick={saveLine} className="px-4 py-2 bg-green-600 text-foreground rounded-lg text-sm hover:bg-green-700">שמירה</button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
