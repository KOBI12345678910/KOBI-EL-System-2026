import { useState, useEffect, useMemo } from "react";
import {
  FileText, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2,
  Clock, AlertTriangle, ArrowUpDown, DollarSign, Eye, Hash, Send as SendIcon, Copy
} from "lucide-react";
import { EmptyState } from "@/components/ui/unified-states";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import ImportButton from "@/components/import-button";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { authFetch } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import { duplicateRecord } from "@/lib/duplicate-record";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import StatusTransition from "@/components/status-transition";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

interface Invoice {
  id: number; invoice_number: string; invoice_type: string; invoice_date: string;
  due_date: string; customer_name: string; customer_tax_id: string; status: string;
  currency: string; subtotal: number; discount_amount: number; before_vat: number;
  vat_rate: number; vat_amount: number; total_amount: number; amount_paid: number;
  balance_due: number; payment_terms: string; payment_method: string; po_number: string;
  salesperson: string; item_description: string; notes: string; created_at?: string;
}

const typeMap: Record<string, string> = {
  tax_invoice: "חשבונית מס", tax_receipt: "חשבונית מס/קבלה", proforma: "פרופורמה",
  delivery_note: "תעודת משלוח", price_quote: "הצעת מחיר", receipt: "קבלה",
  tax_invoice_receipt: "חשבונית מס קבלה",
};
const statusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-muted/20 text-muted-foreground" },
  sent: { label: "נשלח", color: "bg-blue-500/20 text-blue-400" },
  viewed: { label: "נצפה", color: "bg-indigo-500/20 text-indigo-400" },
  partial: { label: "שולם חלקית", color: "bg-yellow-500/20 text-yellow-400" },
  paid: { label: "שולם", color: "bg-green-500/20 text-green-400" },
  overdue: { label: "באיחור", color: "bg-red-500/20 text-red-400" },
  cancelled: { label: "בוטל", color: "bg-muted/20 text-muted-foreground" },
  disputed: { label: "במחלוקת", color: "bg-orange-500/20 text-orange-400" },
};
const paymentTermsMap: Record<string, string> = {
  immediate: "מיידי", net_15: "שוטף+15", net_30: "שוטף+30",
  net_45: "שוטף+45", net_60: "שוטף+60", net_90: "שוטף+90", eom: "סוף חודש",
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

export default function CustomerInvoicesPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [detailTab, setDetailTab] = useState("details");
  const [selectedItem, setSelectedItem] = useState<Invoice | null>(null);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const [items, setItems] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortField, setSortField] = useState("invoice_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [viewDetail, setViewDetail] = useState<Invoice | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const pagination = useSmartPagination(25);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [r1, r2] = await Promise.all([
        authFetch(`${API}/finance/customer-invoices`),
        authFetch(`${API}/finance/customer-invoices/stats`),
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
      (filterType === "all" || i.invoice_type === filterType) &&
      (!search || [i.invoice_number, i.customer_name, i.po_number]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "", vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [items, search, filterStatus, filterType, sortField, sortDir]);

  const recalc = (f: any) => {
    const sub = Number(f.subtotal) || 0, disc = Number(f.discountAmount) || 0, bv = sub - disc;
    const vr = Number(f.vatRate) || 17, va = bv * (vr / 100);
    return { ...f, beforeVat: bv, vatAmount: Math.round(va * 100) / 100, totalAmount: Math.round((bv + va) * 100) / 100 };
  };

  const openCreate = () => { setEditing(null); setForm({ invoiceType: "tax_invoice", invoiceDate: new Date().toISOString().slice(0, 10), status: "draft", currency: "ILS", vatRate: 17, paymentTerms: "net_30" }); setFormErrors({}); setShowForm(true); };
  const openEdit = (r: Invoice) => { setEditing(r); setForm({ invoiceType: r.invoice_type, invoiceDate: r.invoice_date?.slice(0, 10), dueDate: r.due_date?.slice(0, 10), customerName: r.customer_name, customerTaxId: r.customer_tax_id, status: r.status, currency: r.currency, subtotal: r.subtotal, discountAmount: r.discount_amount, beforeVat: r.before_vat, vatRate: r.vat_rate, vatAmount: r.vat_amount, totalAmount: r.total_amount, amountPaid: r.amount_paid, paymentTerms: r.payment_terms, salesperson: r.salesperson, poNumber: r.po_number, itemDescription: r.item_description, notes: r.notes }); setFormErrors({}); setShowForm(true); };

  const save = async () => {
    const errs: Record<string, string> = {};
    if (!form.customerName || !String(form.customerName).trim()) {
      errs.customerName = "שם לקוח הוא שדה חובה";
    } else if (String(form.customerName).length > 150) {
      errs.customerName = "שם לקוח לא יכול לעלות על 150 תווים";
    }
    if (!form.invoiceDate) {
      errs.invoiceDate = "תאריך חשבונית הוא שדה חובה";
    }
    if (form.dueDate && form.invoiceDate && form.dueDate < form.invoiceDate) {
      errs.dueDate = "תאריך פירעון חייב להיות לאחר תאריך החשבונית";
    }
    if (form.subtotal !== undefined && form.subtotal !== "" && (isNaN(Number(form.subtotal)) || Number(form.subtotal) < 0)) {
      errs.subtotal = "סכום חייב להיות מספר חיובי";
    }
    if (form.customerTaxId && String(form.customerTaxId).length > 20) {
      errs.customerTaxId = "ח.פ/ע.מ לא יכול לעלות על 20 תווים";
    }
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      const url = editing ? `${API}/finance/customer-invoices/${editing.id}` : `${API}/finance/customer-invoices`;
      const res = await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData.errors) setFormErrors(errData.errors);
        else setFormErrors({ _general: errData.message || errData.error || "שגיאה בשמירה" });
        setSaving(false);
        return;
      }
      setShowForm(false);
      setFormErrors({});
      load();
    } catch (e: any) {
      setFormErrors({ _general: e.message || "שגיאה בשמירה" });
    }
    setSaving(false);
  };
  const remove = async (id: number) => {
    if (await globalConfirm("למחוק חשבונית?")) {
      await authFetch(`${API}/finance/customer-invoices/${id}`, { method: "DELETE" }); load();
    }
  };

  const kpis = [
    { label: "סה\"כ חשבוניות", value: fmt(stats.total || items.length), icon: Hash, color: "text-emerald-400" },
    { label: "נשלחו", value: fmt(stats.sent || 0), icon: SendIcon, color: "text-blue-400" },
    { label: "שולמו", value: fmt(stats.paid || 0), icon: CheckCircle2, color: "text-green-400" },
    { label: "באיחור", value: fmt(stats.overdue || 0), icon: AlertTriangle, color: "text-red-400" },
    { label: "סה\"כ חיוב", value: `₪${fmt(stats.total_invoiced || 0)}`, icon: DollarSign, color: "text-indigo-400" },
    { label: "יתרה פתוחה", value: `₪${fmt(stats.total_outstanding || 0)}`, icon: DollarSign, color: "text-red-400" },
  ];

  const columns = [
    { key: "invoice_number", label: "מספר" }, { key: "invoice_type", label: "סוג" },
    { key: "invoice_date", label: "תאריך" }, { key: "customer_name", label: "לקוח" },
    { key: "total_amount", label: "סה\"כ" }, { key: "balance_due", label: "יתרה" },
    { key: "status", label: "סטטוס" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><FileText className="text-emerald-400 w-6 h-6" /> חשבוניות לקוחות</h1>
          <p className="text-sm text-muted-foreground mt-1">חשבוניות מס, קבלות, פרופורמה ותעודות משלוח</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ImportButton apiRoute="/api/finance/customer-invoices" onSuccess={load} />
          <ExportDropdown data={filtered} headers={{ invoice_number: "מספר", invoice_type: "סוג", invoice_date: "תאריך", customer_name: "לקוח", total_amount: "סה\"כ", balance_due: "יתרה", status: "סטטוס" }} filename="customer_invoices" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> חשבונית חדשה</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi, i) => (<motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4"><kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} /><div className="text-xl font-bold text-foreground">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div></motion.div>))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסוגים</option>{Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {loading ? (<div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (<div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="עדיין אין חשבוניות במערכת"
          subtitle="צור את החשבונית הראשונה שלך ותתחיל לנהל את החיובים ללקוחות"
          ctaLabel="➕ צור חשבונית ראשונה"
          onCtaClick={openCreate}
        />
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border/50"><tr>{columns.map(col => (<th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div></th>))}<th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th></tr></thead>
          <tbody>{pagination.paginate(filtered).map(r => (
            <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
              <td className="px-4 py-3 font-mono text-xs text-emerald-400 font-bold">{r.invoice_number}</td>
              <td className="px-4 py-3 text-muted-foreground text-xs">{typeMap[r.invoice_type] || r.invoice_type}</td>
              <td className="px-4 py-3 text-muted-foreground text-xs">{r.invoice_date?.slice(0, 10)}</td>
              <td className="px-4 py-3 text-foreground max-w-[150px] truncate">{r.customer_name}</td>
              <td className="px-4 py-3 font-bold text-foreground">₪{fmt(r.total_amount)}</td>
              <td className="px-4 py-3"><span className={Number(r.balance_due) > 0 ? "text-red-400 font-bold" : "text-green-400"}>₪{fmt(r.balance_due)}</span></td>
              <td className="px-4 py-3"><Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>{statusMap[r.status]?.label || r.status}</Badge></td>
              <td className="px-4 py-3"><div className="flex gap-1">
                <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                <button title="שכפול" onClick={async () => { const _dup = await duplicateRecord(`${API}/finance/customer-invoices`, r.id); if (_dup.ok) { load(); } else { alert("שגיאה בשכפול: " + _dup.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
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
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">חשבונית {viewDetail.invoice_number}</h2><button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="מספר" value={viewDetail.invoice_number} /><DetailField label="סוג" value={typeMap[viewDetail.invoice_type] || viewDetail.invoice_type} />
                <DetailField label="לקוח" value={viewDetail.customer_name} /><DetailField label="ח.פ/ע.מ" value={viewDetail.customer_tax_id} />
                <DetailField label="תאריך" value={viewDetail.invoice_date?.slice(0, 10)} /><DetailField label="לתשלום עד" value={viewDetail.due_date?.slice(0, 10)} />
                <DetailField label="סכום" value={`₪${fmt(viewDetail.subtotal)}`} /><DetailField label="הנחה" value={`₪${fmt(viewDetail.discount_amount)}`} />
                <DetailField label={'מע"מ'} value={`₪${fmt(viewDetail.vat_amount)} (${viewDetail.vat_rate}%)`} /><DetailField label={'סה"כ'} value={`₪${fmt(viewDetail.total_amount)}`} />
                <DetailField label="שולם" value={`₪${fmt(viewDetail.amount_paid)}`} /><DetailField label="יתרה" value={`₪${fmt(viewDetail.balance_due)}`} />
                <DetailField label="תנאי תשלום" value={paymentTermsMap[viewDetail.payment_terms] || viewDetail.payment_terms} /><DetailField label="מוכר" value={viewDetail.salesperson} />
                <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge></DetailField>
                <div className="col-span-2"><DetailField label="תיאור" value={viewDetail.item_description} /></div>
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת חשבונית" : "חשבונית לקוח חדשה"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 space-y-4"><div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג חשבונית</label><select value={form.invoiceType || "tax_invoice"} onChange={e => setForm({ ...form, invoiceType: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label><select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">לקוח <span className="text-red-400">*</span></label><input value={form.customerName || ""} onChange={e => { setForm({ ...form, customerName: e.target.value }); setFormErrors(p => ({ ...p, customerName: "" })); }} maxLength={150} className={`w-full bg-background border rounded-xl px-3 py-2.5 text-sm ${formErrors.customerName ? "border-red-500" : "border-border"}`} />{formErrors.customerName && <p className="text-xs text-red-400 mt-1">{formErrors.customerName}</p>}</div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">ח.פ/ע.מ</label><input value={form.customerTaxId || ""} onChange={e => { setForm({ ...form, customerTaxId: e.target.value }); setFormErrors(p => ({ ...p, customerTaxId: "" })); }} maxLength={20} className={`w-full bg-background border rounded-xl px-3 py-2.5 text-sm ${formErrors.customerTaxId ? "border-red-500" : "border-border"}`} />{formErrors.customerTaxId && <p className="text-xs text-red-400 mt-1">{formErrors.customerTaxId}</p>}</div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך <span className="text-red-400">*</span></label><input type="date" value={form.invoiceDate || ""} onChange={e => { setForm({ ...form, invoiceDate: e.target.value }); setFormErrors(p => ({ ...p, invoiceDate: "" })); }} className={`w-full bg-background border rounded-xl px-3 py-2.5 text-sm ${formErrors.invoiceDate ? "border-red-500" : "border-border"}`} />{formErrors.invoiceDate && <p className="text-xs text-red-400 mt-1">{formErrors.invoiceDate}</p>}</div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">לתשלום עד</label><input type="date" value={form.dueDate || ""} onChange={e => { setForm({ ...form, dueDate: e.target.value }); setFormErrors(p => ({ ...p, dueDate: "" })); }} className={`w-full bg-background border rounded-xl px-3 py-2.5 text-sm ${formErrors.dueDate ? "border-red-500" : "border-border"}`} />{formErrors.dueDate && <p className="text-xs text-red-400 mt-1">{formErrors.dueDate}</p>}</div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תנאי תשלום</label><select value={form.paymentTerms || "net_30"} onChange={e => setForm({ ...form, paymentTerms: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(paymentTermsMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מוכר</label><input value={form.salesperson || ""} onChange={e => setForm({ ...form, salesperson: e.target.value })} maxLength={100} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סכום (₪)</label><input type="number" step="0.01" min={0} value={form.subtotal || ""} onChange={e => { setForm(recalc({ ...form, subtotal: e.target.value })); setFormErrors(p => ({ ...p, subtotal: "" })); }} className={`w-full bg-background border rounded-xl px-3 py-2.5 text-sm ${formErrors.subtotal ? "border-red-500" : "border-border"}`} />{formErrors.subtotal && <p className="text-xs text-red-400 mt-1">{formErrors.subtotal}</p>}</div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">הנחה (₪)</label><input type="number" step="0.01" min={0} value={form.discountAmount || ""} onChange={e => setForm(recalc({ ...form, discountAmount: e.target.value }))} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מע"מ %</label><input type="number" min={0} max={100} value={form.vatRate ?? 17} onChange={e => setForm(recalc({ ...form, vatRate: e.target.value }))} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סה"כ</label><input type="number" value={form.totalAmount || ""} readOnly className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm opacity-60 font-bold" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">שולם (₪)</label><input type="number" step="0.01" min={0} value={form.amountPaid || ""} onChange={e => setForm({ ...form, amountPaid: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מס' הזמנה</label><input value={form.poNumber || ""} onChange={e => setForm({ ...form, poNumber: e.target.value })} maxLength={50} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              </div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור פריטים</label><textarea value={form.itemDescription || ""} onChange={e => setForm({ ...form, itemDescription: e.target.value })} rows={2} maxLength={1000} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} maxLength={500} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              {formErrors._general && <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 rounded-xl px-3 py-2"><AlertTriangle className="w-4 h-4 flex-shrink-0" />{formErrors._general}</div>}
              </div>
              <div className="p-5 border-t border-border flex gap-3">
                <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl hover:bg-primary/90 text-sm font-medium disabled:opacity-50"><Save className="w-4 h-4" /> {saving ? "שומר..." : editing ? "עדכון" : "שמירה"}</button>
                <button onClick={() => { setShowForm(false); setFormErrors({}); }} className="px-6 py-2.5 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedItem(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-slate-700">
              <h2 className="text-xl font-bold text-foreground">חשבונית לקוח #{selectedItem.invoice_number || selectedItem.id}</h2>
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
                  <StatusTransition currentStatus={selectedItem.status} statuses={[{key:"draft",label:"טיוטה",color:"bg-muted"},{key:"sent",label:"נשלח",color:"bg-blue-500"},{key:"paid",label:"שולם",color:"bg-green-500"},{key:"overdue",label:"באיחור",color:"bg-red-500"},{key:"cancelled",label:"מבוטל",color:"bg-muted"}]} onTransition={async (s) => { await authFetch(`${API}/customer-invoices/${selectedItem.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s }) }); load(); setSelectedItem({ ...selectedItem, status: s }); }} />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div><div className="text-xs text-muted-foreground mb-1">לקוח</div><div className="text-sm text-foreground">{selectedItem.customer_name || "-"}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">סכום</div><div className="text-sm text-foreground font-bold">₪{Number(selectedItem.total_amount || selectedItem.amount || 0).toLocaleString()}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">תאריך</div><div className="text-sm text-foreground">{selectedItem.invoice_date}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">תאריך פירעון</div><div className="text-sm text-foreground">{selectedItem.due_date || "-"}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">תיאור</div><div className="text-sm text-foreground">{selectedItem.description || "-"}</div></div>
                  </div>
                </div>
              )}
              {detailTab === "related" && <RelatedRecords entityType="customer-invoices" entityId={selectedItem.id} tabs={[{ key: "payments", label: "תשלומים", endpoint: `${API}/customer-payments?invoice_id=${selectedItem.id}` }, { key: "credit-notes", label: "זיכויים", endpoint: `${API}/credit-notes?invoice_id=${selectedItem.id}` }]} />}
              {detailTab === "docs" && <AttachmentsSection entityType="customer-invoices" entityId={selectedItem.id} />}
              {detailTab === "history" && <ActivityLog entityType="customer-invoices" entityId={selectedItem.id} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
