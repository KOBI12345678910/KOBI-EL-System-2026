import { useState, useEffect, useMemo } from "react";
import {
  Banknote, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2,
  Clock, AlertTriangle, ArrowUpDown, DollarSign, Eye, CreditCard, Hash,
  Printer, Mail, Send, Landmark, Ban, RotateCcw, FileText, Receipt,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { globalConfirm } from "@/components/confirm-dialog";
import { printPage, sendByEmail, generateEmailBody } from "@/lib/print-utils";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { authFetch } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

interface Payment {
  id: number; payment_number: string; payment_date: string; customer_name: string;
  customer_tax_id: string; invoice_number: string; amount: number; currency: string;
  payment_method: string; reference_number: string; check_number: string;
  bank_name: string; bank_account: string;
  status: string; notes: string; created_at?: string;
}

const statusConfig: Record<string, { label: string; color: string; next?: string[] }> = {
  pending: { label: "ממתין", color: "bg-amber-500/20 text-amber-300", next: ["completed", "cancelled"] },
  completed: { label: "בוצע", color: "bg-emerald-500/20 text-emerald-300" },
  cancelled: { label: "בוטל", color: "bg-muted text-muted-foreground/60" },
  bounced: { label: "חזר", color: "bg-red-500/20 text-red-300", next: ["pending"] },
};

const methodOptions = [
  { value: "cash", label: "מזומן", icon: DollarSign },
  { value: "check", label: "שיק", icon: FileText },
  { value: "bank_transfer", label: "העברה בנקאית", icon: Landmark },
  { value: "credit_card", label: "כרטיס אשראי", icon: CreditCard },
  { value: "direct_debit", label: "הוראת קבע", icon: RotateCcw },
  { value: "bit", label: "ביט", icon: Banknote },
];
const methodMap: Record<string, string> = Object.fromEntries(methodOptions.map(o => [o.value, o.label]));

const BANK_ACCOUNTS = [
  { value: "leumi_612_28847521", label: "לאומי — סניף 612, חשבון 28-847521" },
  { value: "hapoalim_532_12334890", label: "הפועלים — סניף 532, חשבון 12-334890" },
  { value: "discount_071_55192847", label: "דיסקונט — סניף 071, חשבון 55-192847" },
  { value: "mizrahi_423_90556123", label: "מזרחי-טפחות — סניף 423, חשבון 90-556123" },
];

const KNOWN_CUSTOMERS = ["שמעון בניין ופיתוח בע\"מ", "אדריכלות גולן ושות", "קבוצת אלרם בנייה", "עמוס קבלנות כללית", "נדל\"ן הגליל בע\"מ", "ברזילי קונסטרוקציות", "חברת בניין הנגב", "פרויקט-ליין בע\"מ", "אלומיניום פרו התקנות", "זוהר עיצוב ואדריכלות", "מגורי השרון בע\"מ", "תעשיות בן-ארי", "חיים כהן קבלנות", "דניאל הנדסת מבנים", "מרכזי מסחר ישראל", "בנייני הים התיכון", "אופק נכסים והשקעות", "גלעד פרויקטים", "מפעלי מתכת השפלה", "רשת חנויות גביש", "טופז הנדסה אזרחית", "א.ב. בנייה ופיתוח", "שקד אדריכלים", "בנייני עתיד בע\"מ", "יוסף לוי נכסים"];

export default function CustomerPaymentsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<Payment[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterMethod, setFilterMethod] = useState("all");
  const [sortField, setSortField] = useState("payment_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [viewDetail, setViewDetail] = useState<Payment | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        authFetch(`${API}/finance/customer-payments`),
        authFetch(`${API}/finance/customer-payments/stats`),
      ]);
      if (r1.ok) setItems(safeArray(await r1.json()));
      if (r2.ok) setStats((await r2.json()) || {});
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return KNOWN_CUSTOMERS;
    return KNOWN_CUSTOMERS.filter(c => c.includes(customerSearch));
  }, [customerSearch]);

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (filterMethod === "all" || i.payment_method === filterMethod) &&
      (!search || [i.payment_number, i.customer_name, i.reference_number, i.invoice_number]
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
    setCustomerSearch("");
    setShowForm(true);
  };

  const openEdit = (r: Payment) => {
    setEditing(r);
    setForm({
      paymentDate: r.payment_date?.slice(0, 10), customerName: r.customer_name,
      customerTaxId: r.customer_tax_id, invoiceNumber: r.invoice_number,
      amount: r.amount, currency: r.currency, paymentMethod: r.payment_method,
      referenceNumber: r.reference_number, checkNumber: r.check_number,
      bankAccount: r.bank_name || r.bank_account || "",
      status: r.status, notes: r.notes,
    });
    setCustomerSearch(r.customer_name || "");
    setShowForm(true);
  };

  const save = async () => {
    if (!form.customerName || !form.amount) return;
    setSaving(true);
    try {
      const url = editing ? `${API}/finance/customer-payments/${editing.id}` : `${API}/finance/customer-payments`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    await authFetch(`${API}/finance/customer-payments/${id}`, { method: "DELETE" });
    load();
  };

  const af = [filterStatus !== "all", filterMethod !== "all"].filter(Boolean).length;

  const kpis = [
    { label: "סה״כ קבלות", value: fmtInt(stats.total || items.length), icon: Receipt, color: "text-blue-400", bg: "from-blue-500/15 to-blue-600/5 border-blue-500/20" },
    { label: "ממתינים", value: fmtInt(stats.pending || items.filter(i => i.status === "pending").length), icon: Clock, color: "text-amber-400", bg: "from-amber-500/15 to-amber-600/5 border-amber-500/20" },
    { label: "בוצעו", value: fmtInt(stats.completed || items.filter(i => i.status === "completed").length), icon: CheckCircle2, color: "text-emerald-400", bg: "from-emerald-500/15 to-emerald-600/5 border-emerald-500/20" },
    { label: "חזרו", value: fmtInt(stats.bounced || items.filter(i => i.status === "bounced").length), icon: AlertTriangle, color: "text-red-400", bg: "from-red-500/15 to-red-600/5 border-red-500/20" },
    { label: "סכום כולל", value: `₪${fmtInt(stats.total_amount || items.reduce((s, i) => s + Number(i.amount || 0), 0))}`, icon: DollarSign, color: "text-cyan-400", bg: "from-cyan-500/15 to-cyan-600/5 border-cyan-500/20" },
    { label: "נגבה בפועל", value: `₪${fmtInt(stats.completed_amount || items.filter(i => i.status === "completed").reduce((s, i) => s + Number(i.amount || 0), 0))}`, icon: Banknote, color: "text-purple-400", bg: "from-purple-500/15 to-purple-600/5 border-purple-500/20" },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Receipt className="text-blue-400" /> קבלות</h1>
          <p className="text-sm text-muted-foreground mt-1">תשלומים שהתקבלו מלקוחות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ payment_number: "מספר", payment_date: "תאריך", customer_name: "לקוח", invoice_number: "חשבונית", payment_method: "אמצעי", amount: "סכום", status: "סטטוס" }} filename="receipts" />
          <Button variant="outline" onClick={() => printPage("קבלות")} className="border-border text-muted-foreground gap-1"><Printer className="h-4 w-4" />הדפסה</Button>
          <Button variant="outline" onClick={() => sendByEmail("קבלות - טכנו-כל עוזי", generateEmailBody("קבלות", filtered, { payment_number: "מספר", customer_name: "לקוח", amount: "סכום", status: "סטטוס" }))} className="border-border text-muted-foreground gap-1"><Send className="h-4 w-4" />שליחה</Button>
          <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 gap-1"><Plus className="h-4 w-4" />קבלה חדשה</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi, i) => (
          <Card key={i} className={`bg-gradient-to-br ${kpi.bg}`}>
            <CardContent className="p-4">
              <kpi.icon className={`${kpi.color} mb-1.5 h-5 w-5`} />
              <p className={`text-lg font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card/60 border-border"><CardContent className="p-3"><div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => { setSearch(e.target.value); pagination.setPage(1); }} placeholder="חיפוש לפי מספר, לקוח, אסמכתא..." className="pr-9 bg-input border-border text-foreground" /></div>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); pagination.setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל הסטטוסים</option>{Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select value={filterMethod} onChange={e => { setFilterMethod(e.target.value); pagination.setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל האמצעים</option>{methodOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        {af > 0 && <Button variant="ghost" size="sm" onClick={() => { setFilterStatus("all"); setFilterMethod("all"); setSearch(""); }} className="text-red-400 hover:text-red-300 gap-1"><X className="h-3 w-3" />נקה ({af})</Button>}
      </div></CardContent></Card>

      <BulkActions items={filtered} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
        defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/finance/customer-payments/${id}`, { method: "DELETE" }))); load(); }),
        defaultBulkActions.export(async (ids) => { const sel = filtered.filter(i => ids.includes(String(i.id))); const csv = "מספר,תאריך,לקוח,חשבונית,אמצעי,סכום,סטטוס\n" + sel.map(r => `${r.payment_number},${r.payment_date?.slice(0, 10)},${r.customer_name},${r.invoice_number},${methodMap[r.payment_method] || r.payment_method},${r.amount},${statusConfig[r.status]?.label || r.status}`).join("\n"); const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "receipts.csv"; a.click(); }),
      ]} />

      <Card className="bg-card/80 border-border"><CardContent className="p-0">
        <div className="overflow-x-auto relative">
          {loading && <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center z-10"><div className="flex items-center gap-2 bg-card border border-border rounded-lg px-4 py-2 shadow-lg"><Clock className="w-4 h-4 animate-spin text-blue-400" /><span className="text-sm text-foreground">טוען קבלות...</span></div></div>}
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-background/50">
              <th className="px-3 py-3 w-10"><input type="checkbox" className="rounded" onChange={() => toggleAll(filtered)} /></th>
              {[{ key: "payment_number", label: "מספר" }, { key: "payment_date", label: "תאריך" }, { key: "customer_name", label: "לקוח" }, { key: "invoice_number", label: "חשבונית מקושרת" }, { key: "payment_method", label: "אמצעי תשלום" }, { key: "reference_number", label: "אסמכתא" }, { key: "amount", label: "סכום" }, { key: "status", label: "סטטוס" }].map(col => (
                <th key={col.key} className="px-3 py-3 text-right text-muted-foreground font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort(col.key)}><div className="flex items-center gap-1 text-xs">{col.label}<ArrowUpDown className="h-3 w-3" /></div></th>
              ))}
              <th className="px-3 py-3 text-center text-muted-foreground font-medium text-xs">פעולות</th>
            </tr></thead>
            <tbody>
              {!loading && pagination.paginate(filtered).length === 0 ? (
                <tr><td colSpan={10} className="p-16 text-center"><div className="flex flex-col items-center gap-4">{(af > 0 || search) ? <Search className="h-12 w-12 text-muted-foreground" /> : <Receipt className="h-12 w-12 text-muted-foreground" />}<p className="text-lg font-medium text-muted-foreground">{(af > 0 || search) ? "לא נמצאו תוצאות" : "עדיין אין קבלות"}</p><p className="text-sm text-muted-foreground/60">{(af > 0 || search) ? "נסה לשנות את מונחי החיפוש או הסינון" : "צור קבלה ראשונה"}</p>{!(af > 0 || search) && <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 gap-2 mt-2"><Plus className="h-4 w-4" />קבלה חדשה</Button>}</div></td></tr>
              ) : pagination.paginate(filtered).map(r => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setViewDetail(r)}>
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}><input type="checkbox" checked={isSelected(String(r.id))} onChange={() => toggle(String(r.id))} className="rounded" /></td>
                  <td className="px-3 py-2.5 font-mono text-xs text-blue-400 font-bold">{r.payment_number}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.payment_date?.slice(0, 10)}</td>
                  <td className="px-3 py-2.5 text-foreground font-medium max-w-[150px] truncate">{r.customer_name}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-emerald-400">{r.invoice_number || "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{methodMap[r.payment_method] || r.payment_method}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs font-mono">{r.reference_number || r.check_number || "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-sm text-emerald-400 font-bold">₪{fmt(r.amount)}</td>
                  <td className="px-3 py-2.5"><Badge className={`${statusConfig[r.status]?.color || "bg-muted"} border-0 text-[10px]`}>{statusConfig[r.status]?.label || r.status}</Badge></td>
                  <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => setViewDetail(r)}><Eye className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-blue-400" onClick={() => openEdit(r)}><Edit2 className="h-3.5 w-3.5" /></Button>
                      {isSuperAdmin && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400" onClick={async () => { if (await globalConfirm(`למחוק את קבלה '${r.payment_number}'? פעולה זו אינה ניתנת לביטול.`)) remove(r.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot><tr className="border-t-2 border-border bg-background/50 font-bold text-sm">
                <td className="px-3 py-3" /><td className="px-3 py-3 text-foreground" colSpan={6}>סה״כ ({filtered.length} קבלות)</td>
                <td className="px-3 py-3 font-mono text-emerald-400">₪{fmt(filtered.reduce((s, r) => s + Number(r.amount || 0), 0))}</td>
                <td colSpan={2} />
              </tr></tfoot>
            )}
          </table>
        </div>
      </CardContent></Card>
      <SmartPagination pagination={pagination} />

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת קבלה" : "קבלה חדשה"}</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}><X className="h-4 w-4" /></Button>
              </div>
              <div className="p-4 space-y-5">
                <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">פרטי קבלה</h3></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-muted-foreground text-xs">תאריך *</Label><Input type="date" value={form.paymentDate || ""} onChange={e => setForm({ ...form, paymentDate: e.target.value })} className="bg-input border-border text-foreground mt-1" /></div>
                  <div><Label className="text-muted-foreground text-xs">סטטוס</Label><select value={form.status || "pending"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">{Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                </div>

                <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">פרטי לקוח</h3></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative">
                    <Label className="text-muted-foreground text-xs">לקוח *</Label>
                    <Input value={customerSearch} onChange={e => { setCustomerSearch(e.target.value); setForm({ ...form, customerName: e.target.value }); setShowCustomerDropdown(true); }} onFocus={() => setShowCustomerDropdown(true)} placeholder="הקלד שם לקוח..." className="bg-input border-border text-foreground mt-1" />
                    {showCustomerDropdown && filteredCustomers.length > 0 && (
                      <div className="absolute z-20 top-full mt-1 w-full bg-card border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                        {filteredCustomers.map((c, i) => (
                          <button key={i} onClick={() => { setForm({ ...form, customerName: c }); setCustomerSearch(c); setShowCustomerDropdown(false); }} className="w-full px-3 py-2 text-right text-sm text-foreground hover:bg-muted transition-colors">{c}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div><Label className="text-muted-foreground text-xs">ח.פ / ע.מ</Label><Input value={form.customerTaxId || ""} onChange={e => setForm({ ...form, customerTaxId: e.target.value })} placeholder="515123456" className="bg-input border-border text-foreground mt-1" /></div>
                </div>

                <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">פרטי תשלום</h3></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-muted-foreground text-xs">סכום (₪) *</Label><Input type="number" step={0.01} value={form.amount || ""} onChange={e => setForm({ ...form, amount: e.target.value })} className="bg-input border-border text-foreground mt-1 font-mono" /></div>
                  <div>
                    <Label className="text-muted-foreground text-xs">אמצעי תשלום *</Label>
                    <select value={form.paymentMethod || "bank_transfer"} onChange={e => setForm({ ...form, paymentMethod: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                      {methodOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div><Label className="text-muted-foreground text-xs">חשבונית מקושרת</Label><Input value={form.invoiceNumber || ""} onChange={e => setForm({ ...form, invoiceNumber: e.target.value })} placeholder="INV-2026-XXXX" className="bg-input border-border text-foreground mt-1 font-mono" /></div>
                  <div><Label className="text-muted-foreground text-xs">מס׳ אסמכתא</Label><Input value={form.referenceNumber || ""} onChange={e => setForm({ ...form, referenceNumber: e.target.value })} className="bg-input border-border text-foreground mt-1" /></div>
                  {form.paymentMethod === "check" && (
                    <div><Label className="text-muted-foreground text-xs">מספר שיק</Label><Input value={form.checkNumber || ""} onChange={e => setForm({ ...form, checkNumber: e.target.value })} className="bg-input border-border text-foreground mt-1 font-mono" /></div>
                  )}
                  <div className={form.paymentMethod === "check" ? "" : "col-span-2"}>
                    <Label className="text-muted-foreground text-xs">חשבון בנק</Label>
                    <select value={form.bankAccount || ""} onChange={e => setForm({ ...form, bankAccount: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                      <option value="">בחר חשבון...</option>
                      {BANK_ACCOUNTS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                  </div>
                </div>

                {Number(form.amount) > 0 && (
                  <div className="bg-input rounded-lg border border-emerald-500/20 p-4 flex items-center justify-between">
                    <span className="text-muted-foreground text-sm">סכום לקבלה</span>
                    <span className="text-2xl font-bold font-mono text-emerald-400">₪{fmt(form.amount)}</span>
                  </div>
                )}

                <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">הערות</h3></div>
                <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground resize-none" placeholder="הערות..." />
              </div>
              <div className="flex items-center gap-2 p-4 border-t border-border justify-end">
                <Button variant="outline" onClick={() => setShowForm(false)} className="border-border">ביטול</Button>
                <Button onClick={save} disabled={saving || !form.customerName || !form.amount} className="bg-blue-600 hover:bg-blue-700 gap-1"><Save className="h-4 w-4" />{saving ? "שומר..." : editing ? "עדכן" : "שמור"}</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {viewDetail && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setViewDetail(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-foreground">קבלה {viewDetail.payment_number}</h2>
                <Badge className={`${statusConfig[viewDetail.status]?.color || "bg-muted"} border-0`}>{statusConfig[viewDetail.status]?.label || viewDetail.status}</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setViewDetail(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { l: "מספר קבלה", v: viewDetail.payment_number },
                  { l: "תאריך", v: viewDetail.payment_date?.slice(0, 10) },
                  { l: "לקוח", v: viewDetail.customer_name },
                  { l: "ח.פ/ע.מ", v: viewDetail.customer_tax_id || "—" },
                  { l: "חשבונית מקושרת", v: viewDetail.invoice_number || "—" },
                  { l: "אמצעי תשלום", v: methodMap[viewDetail.payment_method] || viewDetail.payment_method },
                  { l: "אסמכתא", v: viewDetail.reference_number || viewDetail.check_number || "—" },
                  { l: "חשבון בנק", v: viewDetail.bank_name || viewDetail.bank_account || "—" },
                ].map((d, i) => (
                  <div key={i} className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">{d.l}</p><p className="text-foreground mt-1 font-medium text-sm">{d.v}</p></div>
                ))}
              </div>

              <div className="bg-input rounded-lg border border-emerald-500/20 p-4 flex items-center justify-between">
                <span className="text-muted-foreground">סכום שהתקבל</span>
                <span className="text-2xl font-bold font-mono text-emerald-400">₪{fmt(viewDetail.amount)}</span>
              </div>

              {viewDetail.notes && <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground mb-1">הערות</p><p className="text-sm text-foreground">{viewDetail.notes}</p></div>}

              {statusConfig[viewDetail.status]?.next && (
                <div>
                  <h3 className="text-sm font-semibold text-blue-400 mb-2">שנה סטטוס</h3>
                  <div className="flex gap-2 flex-wrap">
                    {statusConfig[viewDetail.status]?.next?.map(nextStatus => (
                      <Button key={nextStatus} variant="outline" size="sm" className={`border-border gap-1 ${nextStatus === "completed" ? "text-emerald-400 border-emerald-500/30" : nextStatus === "cancelled" ? "text-red-400 border-red-500/30" : "text-amber-400 border-amber-500/30"}`} onClick={async () => {
                        await authFetch(`${API}/finance/customer-payments/${viewDetail.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: nextStatus }) });
                        load();
                        setViewDetail(null);
                      }}>
                        {nextStatus === "completed" && <CheckCircle2 className="h-3 w-3" />}
                        {nextStatus === "cancelled" && <Ban className="h-3 w-3" />}
                        {nextStatus === "pending" && <Clock className="h-3 w-3" />}
                        {statusConfig[nextStatus]?.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-border justify-end">
              <Button variant="outline" className="border-border gap-1" onClick={() => printPage(`קבלה ${viewDetail.payment_number}`)}><Printer className="h-4 w-4" />הדפסה</Button>
              <Button variant="outline" className="border-purple-500/30 text-purple-300 gap-1" onClick={() => sendByEmail(`קבלה ${viewDetail.payment_number}`, `קבלה: ${viewDetail.payment_number}\nלקוח: ${viewDetail.customer_name}\nסכום: ₪${fmt(viewDetail.amount)}`)}><Mail className="h-4 w-4" />שלח במייל</Button>
              <Button onClick={() => { openEdit(viewDetail); setViewDetail(null); }} className="bg-blue-600 hover:bg-blue-700 gap-1"><Edit2 className="h-4 w-4" />ערוך</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
