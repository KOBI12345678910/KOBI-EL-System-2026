import { useState, useEffect, useMemo } from "react";
import {
  RotateCcw, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2,
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
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

interface Refund {
  id: number; refund_number: string; refund_date: string; customer_name: string;
  customer_tax_id: string; original_invoice_number: string; reason: string;
  reason_description: string; status: string; currency: string; subtotal: number;
  vat_rate: number; vat_amount: number; total_amount: number; refund_method: string;
  notes: string; created_at?: string;
}

const reasonMap: Record<string, string> = {
  return: "החזרת סחורה", defect: "פגם/ליקוי", overcharge: "חיוב יתר",
  discount: "הנחה", cancellation: "ביטול", price_adjustment: "עדכון מחיר",
  duplicate: "כפילות", other: "אחר",
};
const statusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-muted/20 text-muted-foreground" },
  pending: { label: "ממתין", color: "bg-yellow-500/20 text-yellow-400" },
  approved: { label: "מאושר", color: "bg-blue-500/20 text-blue-400" },
  processed: { label: "בוצע", color: "bg-green-500/20 text-green-400" },
  cancelled: { label: "בוטל", color: "bg-red-500/20 text-red-400" },
};
const methodMap: Record<string, string> = {
  bank_transfer: "העברה בנקאית", check: "צ'ק", cash: "מזומן",
  credit_card: "כרטיס אשראי", credit_note: "הודעת זיכוי",
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

export default function CustomerRefundsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<Refund[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("refund_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Refund | null>(null);
  const [viewDetail, setViewDetail] = useState<Refund | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected, isAllSelected } = useBulkSelection();
  const [detailTab, setDetailTab] = useState("details");

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [r1, r2] = await Promise.all([
        authFetch(`${API}/finance/customer-refunds`),
        authFetch(`${API}/finance/customer-refunds/stats`),
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
      (!search || [i.refund_number, i.customer_name, i.original_invoice_number]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "", vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [items, search, filterStatus, sortField, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ refundDate: new Date().toISOString().slice(0, 10), reason: "return", status: "draft", currency: "ILS", vatRate: 17, refundMethod: "bank_transfer" }); setShowForm(true); };
  const openEdit = (r: Refund) => { setEditing(r); setForm({ refundDate: r.refund_date?.slice(0, 10), customerName: r.customer_name, customerTaxId: r.customer_tax_id, originalInvoiceNumber: r.original_invoice_number, reason: r.reason, reasonDescription: r.reason_description, status: r.status, currency: r.currency, subtotal: r.subtotal, vatRate: r.vat_rate, vatAmount: r.vat_amount, totalAmount: r.total_amount, refundMethod: r.refund_method, notes: r.notes }); setShowForm(true); };
  const save = async () => {
    if (!form.customerName) { alert("שדה חובה: שם לקוח"); return; }
    if (!form.refundDate) { alert("שדה חובה: תאריך החזר"); return; }
    setSaving(true);
    try {
      const url = editing ? `${API}/finance/customer-refunds/${editing.id}` : `${API}/finance/customer-refunds`;
      const res = await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה")); setSaving(false); return; }
      setShowForm(false); load();
    } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
    setSaving(false);
  };
  const remove = async (id: number) => {
    if (await globalConfirm("למחוק החזר? פעולה זו אינה ניתנת לביטול.")) {
      await authFetch(`${API}/finance/customer-refunds/${id}`, { method: "DELETE" }); load();
    }
  };

  const kpis = [
    { label: "סה\"כ החזרים", value: fmt(stats.total || items.length), icon: Hash, color: "text-orange-400" },
    { label: "ממתינות", value: fmt(stats.pending || 0), icon: Clock, color: "text-yellow-400" },
    { label: "מאושרות", value: fmt(stats.approved || 0), icon: CheckCircle2, color: "text-blue-400" },
    { label: "בוצעו", value: fmt(stats.processed || 0), icon: CheckCircle2, color: "text-green-400" },
    { label: "ערך כולל", value: `₪${fmt(stats.total_amount || 0)}`, icon: DollarSign, color: "text-red-400" },
    { label: "הוחזר בפועל", value: `₪${fmt(stats.total_processed || 0)}`, icon: RotateCcw, color: "text-emerald-400" },
  ];

  const columns = [
    { key: "refund_number", label: "מספר" }, { key: "refund_date", label: "תאריך" },
    { key: "customer_name", label: "לקוח" }, { key: "original_invoice_number", label: "חשבונית מקור" },
    { key: "reason", label: "סיבה" }, { key: "total_amount", label: "סה\"כ" },
    { key: "status", label: "סטטוס" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><RotateCcw className="text-orange-400 w-6 h-6" /> החזרים כספיים — לקוחות</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול החזרים כספיים ללקוחות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ refund_number: "מספר", refund_date: "תאריך", customer_name: "לקוח", original_invoice_number: "חשבונית מקור", reason: "סיבה", total_amount: "סכום", status: "סטטוס" }} filename="customer_refunds" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> החזר חדש</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi, i) => (<motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4"><kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} /><div className="text-xl font-bold text-foreground">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div></motion.div>))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="החזרים" actions={defaultBulkActions(selectedIds, clear, load, `${API}/finance/customer-refunds`)} />

      {loading ? (<div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (<div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (<div className="text-center py-16 text-muted-foreground"><RotateCcw className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>אין החזרים</p></div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border/50"><tr><th className="px-4 py-3 w-10"><BulkCheckbox checked={isAllSelected(filtered.map(r => r.id))} onChange={() => toggleAll(filtered.map(r => r.id))} /></th>{columns.map(col => (<th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div></th>))}<th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th></tr></thead>
          <tbody>{pagination.paginate(filtered).map(r => (
            <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
              <td className="px-4 py-3"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
              <td className="px-4 py-3 font-mono text-xs text-orange-400 font-bold">{r.refund_number}</td>
              <td className="px-4 py-3 text-muted-foreground text-xs">{r.refund_date?.slice(0, 10)}</td>
              <td className="px-4 py-3 text-foreground">{r.customer_name}</td>
              <td className="px-4 py-3 font-mono text-blue-400 text-xs">{r.original_invoice_number || "—"}</td>
              <td className="px-4 py-3 text-muted-foreground">{reasonMap[r.reason] || r.reason}</td>
              <td className="px-4 py-3 text-red-400 font-bold">₪{fmt(r.total_amount)}</td>
              <td className="px-4 py-3"><Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>{statusMap[r.status]?.label || r.status}</Badge></td>
              <td className="px-4 py-3"><div className="flex gap-1">
                <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.customer_name || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
              </div></td>
            </tr>
          ))}</tbody></table></div></div>
        <SmartPagination pagination={pagination} />
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">החזר {viewDetail.refund_number}</h2><button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="flex border-b border-border">
                {[{k:"details",l:"פרטים"},{k:"related",l:"רשומות קשורות"},{k:"attachments",l:"מסמכים"},{k:"history",l:"היסטוריה"}].map(t=>(
                  <button key={t.k} onClick={()=>setDetailTab(t.k)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${detailTab===t.k?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground"}`}>{t.l}</button>
                ))}
              </div>
              {detailTab === "details" && (
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="מספר" value={viewDetail.refund_number} /><DetailField label="תאריך" value={viewDetail.refund_date?.slice(0, 10)} />
                <DetailField label="לקוח" value={viewDetail.customer_name} /><DetailField label="ח.פ/ע.מ" value={viewDetail.customer_tax_id} />
                <DetailField label="חשבונית מקור" value={viewDetail.original_invoice_number} /><DetailField label="סיבה" value={reasonMap[viewDetail.reason] || viewDetail.reason} />
                <DetailField label="אמצעי החזר" value={methodMap[viewDetail.refund_method] || viewDetail.refund_method} /><DetailField label="סכום" value={`₪${fmt(viewDetail.subtotal)}`} />
                <DetailField label={'מע"מ'} value={`₪${fmt(viewDetail.vat_amount)}`} /><DetailField label={'סה"כ'} value={`₪${fmt(viewDetail.total_amount)}`} />
                <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge></DetailField>
                <div className="col-span-2"><DetailField label="פירוט" value={viewDetail.reason_description} /></div>
                <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
              </div>
              )}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="customer-refund" entityId={viewDetail.id} /></div>}
              {detailTab === "attachments" && <div className="p-5"><AttachmentsSection entityType="customer-refund" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="customer-refund" entityId={viewDetail.id} /></div>}
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
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת החזר" : "החזר חדש"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 space-y-4"><div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">לקוח *</label><input value={form.customerName || ""} onChange={e => setForm({ ...form, customerName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">ח.פ/ע.מ</label><input value={form.customerTaxId || ""} onChange={e => setForm({ ...form, customerTaxId: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך</label><input type="date" value={form.refundDate || ""} onChange={e => setForm({ ...form, refundDate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">חשבונית מקור</label><input value={form.originalInvoiceNumber || ""} onChange={e => setForm({ ...form, originalInvoiceNumber: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סיבה</label><select value={form.reason || "return"} onChange={e => setForm({ ...form, reason: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(reasonMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">אמצעי החזר</label><select value={form.refundMethod || "bank_transfer"} onChange={e => setForm({ ...form, refundMethod: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(methodMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label><select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סכום (₪)</label><input type="number" step="0.01" value={form.subtotal || ""} onChange={e => { const sub = Number(e.target.value) || 0; const vr = Number(form.vatRate) || 17; const va = sub * (vr / 100); setForm({ ...form, subtotal: e.target.value, vatAmount: Math.round(va * 100) / 100, totalAmount: Math.round((sub + va) * 100) / 100 }); }} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מע"מ %</label><input type="number" value={form.vatRate ?? 17} onChange={e => setForm({ ...form, vatRate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סה"כ</label><input type="number" value={form.totalAmount || ""} readOnly className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm opacity-60 font-bold" /></div>
              </div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">פירוט הסיבה</label><textarea value={form.reasonDescription || ""} onChange={e => setForm({ ...form, reasonDescription: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              </div>
              <div className="p-5 border-t border-border flex gap-3">
                <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl hover:bg-primary/90 text-sm font-medium disabled:opacity-50"><Save className="w-4 h-4" /> {saving ? "שומר..." : editing ? "עדכון" : "שמירה"}</button>
                <button onClick={() => setShowForm(false)} className="px-6 py-2.5 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
