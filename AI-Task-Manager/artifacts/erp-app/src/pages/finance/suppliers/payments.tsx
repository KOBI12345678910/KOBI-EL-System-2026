import { useState, useEffect, useMemo } from "react";
import {
  Banknote, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2,
  Clock, AlertTriangle, ArrowUpDown, DollarSign, Eye, Hash
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { authFetch } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import StatusTransition from "@/components/status-transition";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

interface SupplierPayment {
  id: number; payment_number: string; payment_date: string; supplier_name: string;
  supplier_tax_id: string; invoice_number: string; amount: number; currency: string;
  payment_method: string; reference_number: string; check_number: string;
  status: string; notes: string; created_at?: string;
}

const statusMap: Record<string, { label: string; color: string }> = {
  pending: { label: "ממתין", color: "bg-yellow-500/20 text-yellow-400" },
  approved: { label: "מאושר", color: "bg-blue-500/20 text-blue-400" },
  completed: { label: "בוצע", color: "bg-green-500/20 text-green-400" },
  cancelled: { label: "בוטל", color: "bg-muted/20 text-muted-foreground" },
  bounced: { label: "חזר", color: "bg-red-500/20 text-red-400" },
};
const methodMap: Record<string, string> = {
  bank_transfer: "העברה בנקאית", check: "צ'ק", cash: "מזומן",
  credit_card: "כרטיס אשראי", direct_debit: "הוראת קבע", other: "אחר",
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

export default function SupplierPaymentsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [detailTab, setDetailTab] = useState("details");
  const [selectedItem, setSelectedItem] = useState<SupplierPayment | null>(null);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const [items, setItems] = useState<SupplierPayment[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterMethod, setFilterMethod] = useState("all");
  const [sortField, setSortField] = useState("payment_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SupplierPayment | null>(null);
  const [viewDetail, setViewDetail] = useState<SupplierPayment | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(25);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [r1, r2] = await Promise.all([
        authFetch(`${API}/finance/supplier-payments`),
        authFetch(`${API}/finance/supplier-payments/stats`),
      ]);
      if (r1.ok) setItems(safeArray(await r1.json()));
      if (r2.ok) setStats((await r2.json()) || {});
    } catch (e: any) { setError(e.message || "שגיאה בטעינת נתונים"); }
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
      (filterMethod === "all" || i.payment_method === filterMethod) &&
      (!search || [i.payment_number, i.supplier_name, i.reference_number, i.invoice_number]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "", vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [items, search, filterStatus, filterMethod, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ paymentDate: new Date().toISOString().slice(0, 10), status: "pending", currency: "ILS", paymentMethod: "bank_transfer" });
    setShowForm(true);
  };
  const openEdit = (r: SupplierPayment) => {
    setEditing(r);
    setForm({
      paymentDate: r.payment_date?.slice(0, 10), supplierName: r.supplier_name,
      supplierTaxId: r.supplier_tax_id, invoiceNumber: r.invoice_number,
      amount: r.amount, currency: r.currency, paymentMethod: r.payment_method,
      referenceNumber: r.reference_number, checkNumber: r.check_number,
      status: r.status, notes: r.notes,
    });
    setShowForm(true);
  };
  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/finance/supplier-payments/${editing.id}` : `${API}/finance/supplier-payments`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
    } catch {}
    setSaving(false);
  };
  const remove = async (id: number) => {
    if (await globalConfirm("למחוק תשלום ספק? פעולה זו אינה ניתנת לביטול.")) {
      await authFetch(`${API}/finance/supplier-payments/${id}`, { method: "DELETE" });
      load();
    }
  };

  const kpis = [
    { label: "סה\"כ תשלומים", value: fmt(stats.total || items.length), icon: Hash, color: "text-purple-400" },
    { label: "ממתינים", value: fmt(stats.pending || 0), icon: Clock, color: "text-yellow-400" },
    { label: "מאושרים", value: fmt(stats.approved || 0), icon: CheckCircle2, color: "text-blue-400" },
    { label: "בוצעו", value: fmt(stats.completed || 0), icon: CheckCircle2, color: "text-green-400" },
    { label: "סכום כולל", value: `₪${fmt(stats.total_amount || 0)}`, icon: DollarSign, color: "text-indigo-400" },
    { label: "בוצע בפועל", value: `₪${fmt(stats.completed_amount || 0)}`, icon: Banknote, color: "text-emerald-400" },
  ];

  const columns = [
    { key: "payment_number", label: "מספר" }, { key: "payment_date", label: "תאריך" },
    { key: "supplier_name", label: "ספק" }, { key: "invoice_number", label: "חשבונית" },
    { key: "payment_method", label: "אמצעי" }, { key: "amount", label: "סכום" },
    { key: "status", label: "סטטוס" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Banknote className="text-purple-400 w-6 h-6" /> תשלומי ספקים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">תשלומים שבוצעו לספקים</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ payment_number: "מספר", payment_date: "תאריך", supplier_name: "ספק", invoice_number: "חשבונית", payment_method: "אמצעי", amount: "סכום", status: "סטטוס" }} filename="supplier_payments" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> תשלום ספק חדש
          </button>
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

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי מספר, ספק, אסמכתא..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterMethod} onChange={e => setFilterMethod(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל האמצעים</option>
          {Object.entries(methodMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">שגיאה בטעינה</p><p className="text-sm mt-1">{error}</p>
          <button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Banknote className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין תשלומי ספקים</p>
          <p className="text-sm mt-1">{search || filterStatus !== "all" ? "נסה לשנות את הסינון" : "לחץ על 'תשלום ספק חדש' כדי להתחיל"}</p>
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
                      <div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginate(filtered).map(r => (
                  <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-purple-400 font-bold">{r.payment_number}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.payment_date?.slice(0, 10)}</td>
                    <td className="px-4 py-3 text-foreground">{r.supplier_name}</td>
                    <td className="px-4 py-3 font-mono text-blue-400 text-xs">{r.invoice_number || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{methodMap[r.payment_method] || r.payment_method}</td>
                    <td className="px-4 py-3 text-red-400 font-bold">₪{fmt(r.amount)}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>
                        {statusMap[r.status]?.label || r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                        {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.supplier_name || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
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
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Banknote className="w-5 h-5 text-purple-400" /> תשלום {viewDetail.payment_number}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="מספר תשלום" value={viewDetail.payment_number} />
                <DetailField label="תאריך" value={viewDetail.payment_date?.slice(0, 10)} />
                <DetailField label="ספק" value={viewDetail.supplier_name} />
                <DetailField label="ח.פ/ע.מ" value={viewDetail.supplier_tax_id} />
                <DetailField label="חשבונית" value={viewDetail.invoice_number} />
                <DetailField label="אמצעי תשלום" value={methodMap[viewDetail.payment_method] || viewDetail.payment_method} />
                <DetailField label="סכום" value={`₪${fmt(viewDetail.amount)}`} />
                <DetailField label="אסמכתא" value={viewDetail.reference_number || viewDetail.check_number} />
                <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge></DetailField>
                <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
              </div>
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת תשלום ספק" : "תשלום ספק חדש"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">ספק *</label>
                    <input value={form.supplierName || ""} onChange={e => setForm({ ...form, supplierName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">ח.פ/ע.מ</label>
                    <input value={form.supplierTaxId || ""} onChange={e => setForm({ ...form, supplierTaxId: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך</label>
                    <input type="date" value={form.paymentDate || ""} onChange={e => setForm({ ...form, paymentDate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">חשבונית</label>
                    <input value={form.invoiceNumber || ""} onChange={e => setForm({ ...form, invoiceNumber: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סכום (₪) *</label>
                    <input type="number" step="0.01" value={form.amount || ""} onChange={e => setForm({ ...form, amount: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">אמצעי תשלום</label>
                    <select value={form.paymentMethod || "bank_transfer"} onChange={e => setForm({ ...form, paymentMethod: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(methodMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                    <select value={form.status || "pending"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">אסמכתא</label>
                    <input value={form.referenceNumber || ""} onChange={e => setForm({ ...form, referenceNumber: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                </div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label>
                  <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              </div>
              <div className="p-5 border-t border-border flex gap-3">
                <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl hover:bg-primary/90 text-sm font-medium disabled:opacity-50">
                  <Save className="w-4 h-4" /> {saving ? "שומר..." : editing ? "עדכון" : "שמירה"}
                </button>
                <button onClick={() => setShowForm(false)} className="px-6 py-2.5 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedItem(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-slate-700">
              <h2 className="text-xl font-bold text-foreground">תשלום ספק #{selectedItem.payment_number || selectedItem.id}</h2>
              <button onClick={() => setSelectedItem(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="flex border-b border-border/50">
              {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
              ))}
            </div>
            <div className="p-6">
              {detailTab === "details" && (
                <div className="space-y-4">
                  <StatusTransition currentStatus={selectedItem.status} statuses={[{key:"pending",label:"ממתין",color:"bg-yellow-500"},{key:"approved",label:"מאושר",color:"bg-blue-500"},{key:"processed",label:"בוצע",color:"bg-green-500"},{key:"failed",label:"נכשל",color:"bg-red-500"}]} onTransition={async (s) => { await authFetch(`${API}/supplier-payments/${selectedItem.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s }) }); load(); setSelectedItem({ ...selectedItem, status: s }); }} />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div><div className="text-xs text-muted-foreground mb-1">ספק</div><div className="text-sm text-foreground">{selectedItem.supplier_name || "-"}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">סכום</div><div className="text-sm text-red-400 font-bold">₪{Number(selectedItem.amount || 0).toLocaleString()}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">תאריך</div><div className="text-sm text-foreground">{selectedItem.payment_date}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">אמצעי תשלום</div><div className="text-sm text-foreground">{selectedItem.payment_method || "-"}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">אסמכתא</div><div className="text-sm text-foreground">{selectedItem.reference || "-"}</div></div>
                  </div>
                </div>
              )}
              {detailTab === "related" && <RelatedRecords entityType="supplier-payments" entityId={selectedItem.id} tabs={[{ key: "invoices", label: "חשבוניות", endpoint: `${API}/supplier-invoices?payment_id=${selectedItem.id}` }]} />}
              {detailTab === "docs" && <AttachmentsSection entityType="supplier-payments" entityId={selectedItem.id} />}
              {detailTab === "history" && <ActivityLog entityType="supplier-payments" entityId={selectedItem.id} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
