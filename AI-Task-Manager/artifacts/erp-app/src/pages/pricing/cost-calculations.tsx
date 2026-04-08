import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calculator, Search, Plus, Edit2, Trash2, X, Save, Eye, ArrowUpDown,
  AlertTriangle, DollarSign, TrendingUp, Package, CheckCircle2, Target,
  Layers, BarChart3
} from "lucide-react";
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
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const DetailField = ({ label, value, children }: any) => (
  <div><span className="text-xs text-muted-foreground">{label}</span><div className="text-sm text-foreground mt-0.5">{children || value || "—"}</div></div>
);

const statusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-muted/20 text-muted-foreground" },
  calculated: { label: "מחושב", color: "bg-blue-500/20 text-blue-400" },
  approved: { label: "מאושר", color: "bg-green-500/20 text-green-400" },
  updated: { label: "עודכן", color: "bg-yellow-500/20 text-yellow-400" },
  archived: { label: "בארכיון", color: "bg-muted/20 text-muted-foreground" },
};

const categoryMap: Record<string, string> = {
  raw_material: "חומר גלם", finished: "מוצר מוגמר", semi_finished: "חצי מוגמר",
  packaging: "אריזה", service: "שירות", other: "אחר",
};

export default function CostCalculationsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(25);
  const [detailTab, setDetailTab] = useState("details");
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const { errors, validate, clearErrors } = useFormValidation<any>({
    product_name: { required: true, minLength: 2, message: "שם מוצר חובה" },
  });

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`${API}/pricing/cost-calculations`);
      if (res.ok) setItems(safeArray(await res.json()));
      else throw new Error("שגיאה בטעינת נתונים");
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (filterCategory === "all" || i.category === filterCategory) &&
      (!search || [i.product_name, i.sku, i.category, i.calc_number]
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
  }, [items, search, filterStatus, filterCategory, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ status: "draft", category: "finished" });
    setShowForm(true);
  };
  const openEdit = (r: any) => {
    setEditing(r);
    setForm({ ...r });
    setShowForm(true);
  };
  const save = async () => {
    if (!validate(form)) return;
    setSaving(true);
    try {
      const url = editing ? `${API}/pricing/cost-calculations/${editing.id}` : `${API}/pricing/cost-calculations`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false);
      load();
    } catch {}
    setSaving(false);
  };
  const remove = async (id: number) => {
    if (await globalConfirm("למחוק חישוב עלות זה? פעולה זו אינה ניתנת לביטול.")) {
      await authFetch(`${API}/pricing/cost-calculations/${id}`, { method: "DELETE" });
      load();
    }
  };

  const avgCost = items.length ? items.reduce((s, i) => s + (i.total_cost || 0), 0) / items.length : 0;
  const avgMargin = items.length ? items.reduce((s, i) => s + (i.margin || 0), 0) / items.length : 0;

  const kpis = [
    { label: 'סה"כ חישובים', value: fmt(items.length), icon: Calculator, color: "text-blue-400" },
    { label: "מאושרים", value: fmt(items.filter(i => i.status === "approved").length), icon: CheckCircle2, color: "text-green-400" },
    { label: "עלות ממוצעת", value: `₪${fmt(avgCost)}`, icon: DollarSign, color: "text-emerald-400" },
    { label: "מרווח ממוצע", value: `${avgMargin.toFixed(1)}%`, icon: Target, color: "text-purple-400" },
  ];

  const columns = [
    { key: "calc_number", label: "מספר" },
    { key: "product_name", label: "מוצר" },
    { key: "sku", label: 'מק"ט' },
    { key: "material_cost", label: "חומרים" },
    { key: "labor_cost", label: "עבודה" },
    { key: "overhead_cost", label: "תקורה" },
    { key: "total_cost", label: 'סה"כ' },
    { key: "margin", label: "מרווח%" },
    { key: "status", label: "סטטוס" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Calculator className="text-blue-400 w-6 h-6" />
            חישובי עלות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">חישוב עלויות מוצרים, חומרי גלם ותקורות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown
            data={filtered}
            headers={{ product_name: "מוצר", sku: "מקט", material_cost: "חומרים", labor_cost: "עבודה", overhead_cost: "תקורה", total_cost: "סהכ", margin: "מרווח%", status: "סטטוס" }}
            filename="cost_calculations"
          />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> חישוב חדש
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={'חיפוש לפי מוצר, מק"ט...'}
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הקטגוריות</option>
          {Object.entries(categoryMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="חישובי עלות" actions={defaultBulkActions(selectedIds, clear, load, `${API}/pricing/cost-calculations`)} />

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
          <Calculator className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין חישובי עלות</p>
          <p className="text-sm mt-1">{search || filterStatus !== "all" ? "נסה לשנות את הסינון" : "לחץ על 'חישוב חדש' כדי להתחיל"}</p>
        </div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
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
                {pagination.paginate(filtered).map(r => (
                  <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                  <td className="px-2 py-3"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-blue-400 font-bold">{r.calc_number || "—"}</td>
                    <td className="px-4 py-3 text-foreground font-medium">{r.product_name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono">{r.sku || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">₪{fmt(r.material_cost)}</td>
                    <td className="px-4 py-3 text-muted-foreground">₪{fmt(r.labor_cost)}</td>
                    <td className="px-4 py-3 text-muted-foreground">₪{fmt(r.overhead_cost)}</td>
                    <td className="px-4 py-3 text-emerald-400 font-bold">₪{fmt(r.total_cost)}</td>
                    <td className="px-4 py-3 text-purple-400">{r.margin ? `${r.margin}%` : "—"}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>
                        {statusMap[r.status]?.label || r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg" title="צפייה"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכה"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                        {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.id || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg" title="מחיקה"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setViewDetail(null); setDetailTab("details"); }}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-blue-400" />
                  {viewDetail.product_name}
                </h2>
                <button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="מוצר" value={viewDetail.product_name} />
                <DetailField label={'מק"ט'} value={viewDetail.sku} />
                <DetailField label="מספר חישוב" value={viewDetail.calc_number} />
                <DetailField label="קטגוריה" value={categoryMap[viewDetail.category] || viewDetail.category} />
                <DetailField label="עלות חומרים" value={`₪${fmt(viewDetail.material_cost)}`} />
                <DetailField label="עלות עבודה" value={`₪${fmt(viewDetail.labor_cost)}`} />
                <DetailField label="תקורה" value={`₪${fmt(viewDetail.overhead_cost)}`} />
                <DetailField label="עלות כוללת" value={`₪${fmt(viewDetail.total_cost)}`} />
                <DetailField label="מרווח" value={viewDetail.margin ? `${viewDetail.margin}%` : undefined} />
                <DetailField label="מחיר מכירה" value={viewDetail.selling_price ? `₪${fmt(viewDetail.selling_price)}` : undefined} />
                <DetailField label="סטטוס">
                  <Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge>
                </DetailField>
                <DetailField label="תאריך חישוב" value={viewDetail.created_at?.slice(0, 10)} />
                <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
              </div>
              )}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="cost-calculation" entityId={viewDetail.id} /></div>}
              {detailTab === "docs" && <div className="p-5"><AttachmentsSection entityType="cost-calculation" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="cost-calculation" entityId={viewDetail.id} /></div>}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30">
                  <Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה
                </button>
                <button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
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
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת חישוב" : "חישוב עלות חדש"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">מוצר *</label>
                    <input value={form.product_name || ""} onChange={e => setForm({ ...form, product_name: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="שם המוצר" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">{'מק"ט'}</label>
                    <input value={form.sku || ""} onChange={e => setForm({ ...form, sku: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="SKU" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">קטגוריה</label>
                    <select value={form.category || "finished"} onChange={e => setForm({ ...form, category: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(categoryMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">עלות חומרים (₪)</label>
                    <input type="number" value={form.material_cost || ""} onChange={e => setForm({ ...form, material_cost: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">עלות עבודה (₪)</label>
                    <input type="number" value={form.labor_cost || ""} onChange={e => setForm({ ...form, labor_cost: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">תקורה (₪)</label>
                    <input type="number" value={form.overhead_cost || ""} onChange={e => setForm({ ...form, overhead_cost: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">מרווח (%)</label>
                    <input type="number" value={form.margin || ""} onChange={e => setForm({ ...form, margin: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">מחיר מכירה (₪)</label>
                    <input type="number" value={form.selling_price || ""} onChange={e => setForm({ ...form, selling_price: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                    <select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label>
                    <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="הערות נוספות" />
                  </div>
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving} className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50">
                  <Save className="w-3.5 h-3.5 inline ml-1" /> {editing ? "עדכון" : "שמירה"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
