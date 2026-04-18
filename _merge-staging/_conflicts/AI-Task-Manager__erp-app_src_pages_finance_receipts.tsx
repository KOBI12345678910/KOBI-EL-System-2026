import { useState, useEffect, useMemo } from "react";
import {
  Receipt, Search, Plus, CheckCircle2, Clock, AlertTriangle, ArrowUpDown, DollarSign,
  X, Save, Loader2, Printer, Send, TrendingUp, Hash, Eye, Edit2, Trash2, Copy
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import { duplicateRecord } from "@/lib/duplicate-record";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ExportDropdown from "@/components/export-dropdown";
import { printPage } from "@/lib/print-utils";
import { globalConfirm } from "@/components/confirm-dialog";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { useApiAction } from "@/hooks/use-api-action";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const KNOWN_CUSTOMERS = ["שמעון בניין ופיתוח בע\"מ", "אדריכלות גולן ושות", "קבוצת אלרם בנייה", "עמוס קבלנות כללית", "נדל\"ן הגליל בע\"מ", "ברזילי קונסטרוקציות", "חברת בניין הנגב", "פרויקט-ליין בע\"מ", "אלומיניום פרו התקנות", "זוהר עיצוב ואדריכלות", "מגורי השרון בע\"מ", "תעשיות בן-ארי", "חיים כהן קבלנות", "דניאל הנדסת מבנים", "מרכזי מסחר ישראל"];

const paymentMethods = [
  { value: "bank_transfer", label: "העברה בנקאית" },
  { value: "check", label: "שיק" },
  { value: "cash", label: "מזומן" },
  { value: "credit_card", label: "כרטיס אשראי" },
  { value: "bit", label: "ביט" },
  { value: "standing_order", label: "הוראת קבע" },
];
const paymentMethodMap = Object.fromEntries(paymentMethods.map(m => [m.value, m.label]));

const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-muted text-muted-foreground" },
  confirmed: { label: "מאושר", color: "bg-emerald-500/20 text-emerald-300" },
  partial: { label: "חלקי", color: "bg-amber-500/20 text-amber-300" },
  paid: { label: "שולם", color: "bg-blue-500/20 text-blue-300" },
  cancelled: { label: "בוטל", color: "bg-red-500/20 text-red-300/60" },
};

function generateReceiptNumber(): string {
  const now = new Date();
  return `RCP-${now.getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;
}

export default function ReceiptsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterMethod, setFilterMethod] = useState("all");
  const [sortField, setSortField] = useState("receipt_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [tableLoading, setTableLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustDropdown, setShowCustDropdown] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [showInvoiceDropdown, setShowInvoiceDropdown] = useState(false);
  const pagination = useSmartPagination(25);
  const { executeSave, executeDelete, loading: actionLoading } = useApiAction();
  const token = localStorage.getItem("token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = () => {
    setTableLoading(true);
    Promise.all([
      authFetch(`${API}/ar-receipts`, { headers }).then(r => r.json()).then(d => setItems(safeArray(d))).catch(() => setItems([])),
      authFetch(`${API}/customer-invoices`, { headers }).then(r => r.json()).then(d => setInvoices(safeArray(d))).catch(() => setInvoices([])),
    ]).finally(() => setTableLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    let f = items.filter(r =>
      (filterStatus === "all" || r.status === filterStatus) &&
      (filterMethod === "all" || r.payment_method === filterMethod) &&
      (!search || r.receipt_number?.toLowerCase().includes(search.toLowerCase()) ||
        r.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
        r.invoice_number?.toLowerCase().includes(search.toLowerCase()))
    );
    f.sort((a: any, b: any) => {
      const av = a[sortField], bv = b[sortField];
      const cmp = typeof av === "number" ? av - bv : String(av || "").localeCompare(String(bv || ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return f;
  }, [items, search, filterStatus, filterMethod, sortField, sortDir]);

  const filteredCustomers = KNOWN_CUSTOMERS.filter(c => c.includes(customerSearch));
  const filteredInvoices = invoices.filter(inv =>
    !invoiceSearch || inv.invoice_number?.includes(invoiceSearch) || inv.customer_name?.includes(invoiceSearch)
  ).slice(0, 10);

  const totalReceived = filtered.reduce((s: number, r: any) => s + Number(r.amount_received || 0), 0);
  const totalPending = filtered.filter(r => r.status === "draft" || r.status === "partial").reduce((s: number, r: any) => s + Number(r.balance_remaining || 0), 0);

  const openCreate = () => {
    setEditing(null);
    setForm({
      receiptNumber: generateReceiptNumber(),
      receiptDate: new Date().toISOString().slice(0, 10),
      status: "confirmed",
      paymentMethod: "bank_transfer",
      currency: "ILS",
      vatRate: 17,
    });
    setCustomerSearch("");
    setInvoiceSearch("");
    setShowForm(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({
      receiptNumber: r.receipt_number,
      receiptDate: r.receipt_date?.slice(0, 10),
      customerName: r.customer_name,
      invoiceNumber: r.invoice_number,
      invoiceId: r.invoice_id,
      amountReceived: r.amount_received,
      balanceRemaining: r.balance_remaining,
      paymentMethod: r.payment_method,
      referenceNumber: r.reference_number,
      notes: r.notes,
      status: r.status,
      currency: r.currency || "ILS",
      vatRate: r.vat_rate || 17,
    });
    setCustomerSearch(r.customer_name || "");
    setInvoiceSearch(r.invoice_number || "");
    setShowForm(true);
  };

  const save = async () => {
    if (!form.customerName || !form.amountReceived) return;
    const url = editing ? `${API}/ar-receipts/${editing.id}` : `${API}/ar-receipts`;
    const payload = {
      ...form,
      amount: form.amountReceived,
      vatAmount: (Number(form.amountReceived) * Number(form.vatRate || 17)) / (100 + Number(form.vatRate || 17)),
    };
    await executeSave(
      () => authFetch(url, { method: editing ? "PUT" : "POST", headers, body: JSON.stringify(payload) }),
      !!editing,
      { successMessage: editing ? "קבלה עודכנה בהצלחה" : "קבלה נוצרה בהצלחה", onSuccess: () => { setShowForm(false); load(); } }
    );
  };

  const remove = async (id: number) => {
    if (!await globalConfirm("למחוק קבלה זו? פעולה זו אינה ניתנת לביטול.")) return;
    await executeDelete(() => authFetch(`${API}/ar-receipts/${id}`, { method: "DELETE", headers }), { confirm: false, onSuccess: load });
  };

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };

  const kpis = [
    { label: "סה״כ קבלות", value: fmtInt(items.length), icon: Receipt, color: "text-blue-400", bg: "from-blue-500/15 to-blue-600/5 border-blue-500/20" },
    { label: "קבלות מאושרות", value: fmtInt(items.filter(r => r.status === "confirmed" || r.status === "paid").length), icon: CheckCircle2, color: "text-emerald-400", bg: "from-emerald-500/15 to-emerald-600/5 border-emerald-500/20" },
    { label: "סה״כ התקבל", value: `₪${fmtInt(items.reduce((s, r) => s + Number(r.amount_received || 0), 0))}`, icon: DollarSign, color: "text-cyan-400", bg: "from-cyan-500/15 to-cyan-600/5 border-cyan-500/20" },
    { label: "יתרה לגבייה", value: `₪${fmtInt(items.filter(r => r.status !== "cancelled").reduce((s, r) => s + Number(r.balance_remaining || 0), 0))}`, icon: AlertTriangle, color: "text-amber-400", bg: "from-amber-500/15 to-amber-600/5 border-amber-500/20" },
    { label: "טיוטות", value: fmtInt(items.filter(r => r.status === "draft").length), icon: Clock, color: "text-muted-foreground", bg: "from-[#2a2a3e]/50 to-[#2a2a3e]/20 border-border" },
    { label: "תשלומים חלקיים", value: fmtInt(items.filter(r => r.status === "partial").length), icon: TrendingUp, color: "text-purple-400", bg: "from-purple-500/15 to-purple-600/5 border-purple-500/20" },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Receipt className="text-emerald-400" /> קבלות</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול קבלות — תשלומים חלקיים ומלאים מלקוחות, מקושר לחשבוניות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={items} headers={{ receipt_number: "מספר", receipt_date: "תאריך", customer_name: "לקוח", invoice_number: "חשבונית", amount_received: "סכום", payment_method: "אמצעי תשלום", status: "סטטוס" }} filename="receipts" />
          <Button variant="outline" onClick={() => printPage("קבלות")} className="border-border text-muted-foreground gap-1"><Printer className="h-4 w-4" />הדפסה</Button>
          <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700 gap-1"><Plus className="h-4 w-4" />קבלה חדשה</Button>
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

      <Card className="bg-card/60 border-border">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => { setSearch(e.target.value); pagination.setPage(1); }} placeholder="חיפוש לפי מספר קבלה, לקוח, חשבונית..." className="pr-9 bg-input border-border text-foreground" />
            </div>
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); pagination.setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל הסטטוסים</option>
              {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filterMethod} onChange={e => { setFilterMethod(e.target.value); pagination.setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל אמצעי תשלום</option>
              {paymentMethods.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/80 border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto relative">
            {tableLoading && (
              <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center z-10">
                <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-4 py-2 shadow-lg">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" /><span className="text-sm text-foreground">טוען קבלות...</span>
                </div>
              </div>
            )}
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-background/50">
                {[
                  { key: "receipt_number", label: "מספר קבלה" }, { key: "receipt_date", label: "תאריך" },
                  { key: "customer_name", label: "לקוח" }, { key: "invoice_number", label: "חשבונית" },
                  { key: "amount_received", label: "סכום שהתקבל" }, { key: "balance_remaining", label: "יתרה לגבייה" },
                  { key: "payment_method", label: "אמצעי תשלום" }, { key: "status", label: "סטטוס" },
                ].map(col => (
                  <th key={col.key} className="px-3 py-3 text-right text-muted-foreground font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort(col.key)}>
                    <div className="flex items-center gap-1 text-xs">{col.label}<ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                ))}
                <th className="px-3 py-3 text-center text-muted-foreground font-medium text-xs">פעולות</th>
              </tr></thead>
              <tbody>
                {!tableLoading && pagination.paginate(filtered).length === 0 ? (
                  <tr><td colSpan={9} className="p-16 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <Receipt className="h-12 w-12 text-muted-foreground" />
                      <p className="text-lg font-medium text-muted-foreground">
                        {items.length === 0 ? "עדיין אין קבלות" : "לא נמצאו תוצאות"}
                      </p>
                      {items.length === 0 && <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700 gap-2 mt-2"><Plus className="h-4 w-4" />קבלה חדשה</Button>}
                    </div>
                  </td></tr>
                ) : pagination.paginate(filtered).map((r: any) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setSelectedItem(r)}>
                    <td className="px-3 py-2.5 font-mono text-xs text-emerald-400 font-bold">{r.receipt_number || `#${r.id}`}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.receipt_date?.slice(0, 10)}</td>
                    <td className="px-3 py-2.5 text-foreground font-medium max-w-[150px] truncate">{r.customer_name || "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-blue-400 font-mono">{r.invoice_number || "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-emerald-400 font-bold">₪{fmt(r.amount_received)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">
                      <span className={Number(r.balance_remaining || 0) > 0 ? "text-amber-400 font-bold" : "text-emerald-400"}>
                        ₪{fmt(r.balance_remaining || 0)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{paymentMethodMap[r.payment_method] || r.payment_method || "—"}</td>
                    <td className="px-3 py-2.5">
                      <Badge className={`${statusConfig[r.status]?.color || "bg-muted"} border-0 text-[10px]`}>
                        {statusConfig[r.status]?.label || r.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => setSelectedItem(r)}><Eye className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-blue-400" onClick={() => openEdit(r)}><Edit2 className="h-3.5 w-3.5" /></Button>
                    <Button title="שכפול" variant="ghost" size="sm" className="p-1 hover:bg-muted rounded text-muted-foreground" onClick={async () => { const res = await duplicateRecord(`${API}/ar-receipts`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }}><Copy className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400" onClick={() => remove(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {filtered.length > 0 && (
                <tfoot><tr className="border-t-2 border-border bg-background/50 font-bold text-sm">
                  <td className="px-3 py-3 text-foreground" colSpan={4}>סה״כ ({filtered.length} קבלות)</td>
                  <td className="px-3 py-3 font-mono text-xs text-emerald-400">₪{fmt(totalReceived)}</td>
                  <td className="px-3 py-3 font-mono text-xs text-amber-400">₪{fmt(totalPending)}</td>
                  <td colSpan={3} />
                </tr></tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
      <SmartPagination pagination={pagination} />

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת קבלה" : "קבלה חדשה"}</h2>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-0 font-mono text-xs">{form.receiptNumber}</Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}><X className="h-4 w-4" /></Button>
              </div>
              <div className="p-4 space-y-5">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><Label className="text-muted-foreground text-xs">מספר קבלה</Label><Input value={form.receiptNumber || ""} readOnly className="bg-input border-border text-emerald-400 font-mono mt-1" /></div>
                  <div><Label className="text-muted-foreground text-xs">תאריך *</Label><Input type="date" value={form.receiptDate || ""} onChange={e => setForm({ ...form, receiptDate: e.target.value })} className="bg-input border-border text-foreground mt-1" /></div>
                  <div><Label className="text-muted-foreground text-xs">סטטוס</Label>
                    <select value={form.status || "confirmed"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                      {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">פרטי לקוח</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <Label className="text-muted-foreground text-xs">לקוח *</Label>
                    <Input value={customerSearch} onChange={e => { setCustomerSearch(e.target.value); setForm({ ...form, customerName: e.target.value }); setShowCustDropdown(true); }} onFocus={() => setShowCustDropdown(true)} placeholder="הקלד שם לקוח..." className="bg-input border-border text-foreground mt-1" />
                    {showCustDropdown && filteredCustomers.length > 0 && (
                      <div className="absolute z-20 top-full mt-1 w-full bg-card border border-border rounded-lg shadow-xl max-h-36 overflow-y-auto">
                        {filteredCustomers.map((c, i) => (
                          <button key={i} onClick={() => { setForm({ ...form, customerName: c }); setCustomerSearch(c); setShowCustDropdown(false); }} className="w-full px-3 py-2 text-right text-sm text-foreground hover:bg-muted">{c}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <Label className="text-muted-foreground text-xs">חשבונית קשורה</Label>
                    <Input value={invoiceSearch} onChange={e => { setInvoiceSearch(e.target.value); setShowInvoiceDropdown(true); }} onFocus={() => setShowInvoiceDropdown(true)} placeholder="חיפוש חשבונית..." className="bg-input border-border text-foreground mt-1" />
                    {showInvoiceDropdown && filteredInvoices.length > 0 && (
                      <div className="absolute z-20 top-full mt-1 w-full bg-card border border-border rounded-lg shadow-xl max-h-36 overflow-y-auto">
                        {filteredInvoices.map((inv: any, i: number) => (
                          <button key={i} onClick={() => {
                            setForm({ ...form, invoiceNumber: inv.invoice_number, invoiceId: inv.id, customerName: inv.customer_name, amountReceived: inv.balance_due, balanceRemaining: 0 });
                            setCustomerSearch(inv.customer_name || "");
                            setInvoiceSearch(inv.invoice_number);
                            setShowInvoiceDropdown(false);
                            setShowCustDropdown(false);
                          }} className="w-full px-3 py-2 text-right text-sm text-foreground hover:bg-muted flex items-center justify-between">
                            <span className="text-emerald-400 font-mono text-xs">{inv.invoice_number}</span>
                            <span className="text-xs text-muted-foreground">{inv.customer_name} — ₪{fmt(inv.balance_due)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">פרטי תשלום</h3></div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><Label className="text-muted-foreground text-xs">סכום שהתקבל (₪) *</Label>
                    <Input type="number" min={0} step={0.01} value={form.amountReceived || ""} onChange={e => setForm({ ...form, amountReceived: e.target.value })} className="bg-input border-border text-emerald-400 font-mono mt-1" placeholder="0.00" /></div>
                  <div><Label className="text-muted-foreground text-xs">יתרה לגבייה (₪)</Label>
                    <Input type="number" min={0} step={0.01} value={form.balanceRemaining || ""} onChange={e => setForm({ ...form, balanceRemaining: e.target.value })} className="bg-input border-border text-amber-400 font-mono mt-1" placeholder="0.00" /></div>
                  <div><Label className="text-muted-foreground text-xs">אמצעי תשלום</Label>
                    <select value={form.paymentMethod || "bank_transfer"} onChange={e => setForm({ ...form, paymentMethod: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                      {paymentMethods.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div><Label className="text-muted-foreground text-xs">מס׳ אסמכתא</Label><Input value={form.referenceNumber || ""} onChange={e => setForm({ ...form, referenceNumber: e.target.value })} className="bg-input border-border text-foreground mt-1" placeholder="שיק / עסקה / העברה" /></div>
                  <div><Label className="text-muted-foreground text-xs">מטבע</Label>
                    <select value={form.currency || "ILS"} onChange={e => setForm({ ...form, currency: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                      <option value="ILS">₪ שקל (ILS)</option><option value="USD">$ דולר (USD)</option><option value="EUR">€ יורו (EUR)</option>
                    </select>
                  </div>
                  <div><Label className="text-muted-foreground text-xs">שיעור מע״מ (%)</Label><Input type="number" min={0} max={30} value={form.vatRate || 17} onChange={e => setForm({ ...form, vatRate: e.target.value })} className="bg-input border-border text-foreground mt-1" /></div>
                </div>

                {Number(form.amountReceived) > 0 && (
                  <div className="bg-input rounded-lg border border-border p-4 space-y-2 max-w-xs mr-auto">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">סכום ברוטו</span><span className="font-mono text-foreground">₪{fmt(form.amountReceived)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">מע״מ ({form.vatRate || 17}%)</span><span className="font-mono text-amber-400">₪{fmt((Number(form.amountReceived) * Number(form.vatRate || 17)) / (100 + Number(form.vatRate || 17)))}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">נטו</span><span className="font-mono text-emerald-400">₪{fmt(Number(form.amountReceived) - (Number(form.amountReceived) * Number(form.vatRate || 17)) / (100 + Number(form.vatRate || 17)))}</span></div>
                    {Number(form.balanceRemaining || 0) > 0 && (
                      <div className="flex justify-between text-sm border-t border-border pt-2"><span className="text-amber-400 font-bold">יתרה לגבייה</span><span className="font-mono text-amber-400">₪{fmt(form.balanceRemaining)}</span></div>
                    )}
                  </div>
                )}

                <div><Label className="text-muted-foreground text-xs">הערות</Label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground resize-none mt-1" placeholder="הערות לקבלה..." /></div>
              </div>
              <div className="flex items-center gap-2 p-4 border-t border-border justify-end">
                <Button variant="outline" onClick={() => setShowForm(false)} className="border-border">ביטול</Button>
                <Button onClick={save} disabled={actionLoading || !form.customerName || !form.amountReceived} className="bg-emerald-600 hover:bg-emerald-700 gap-1">
                  <Save className="h-4 w-4" />{editing ? "עדכן" : "שמור קבלה"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setSelectedItem(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-foreground">{selectedItem.receipt_number || `קבלה #${selectedItem.id}`}</h2>
                <Badge className={`${statusConfig[selectedItem.status]?.color || "bg-muted"} border-0`}>{statusConfig[selectedItem.status]?.label || selectedItem.status}</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedItem(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { l: "לקוח", v: selectedItem.customer_name || "—" },
                  { l: "חשבונית קשורה", v: selectedItem.invoice_number || "—" },
                  { l: "תאריך", v: selectedItem.receipt_date?.slice(0, 10) },
                  { l: "סכום שהתקבל", v: `₪${fmt(selectedItem.amount_received)}` },
                  { l: "יתרה לגבייה", v: `₪${fmt(selectedItem.balance_remaining || 0)}` },
                  { l: "אמצעי תשלום", v: paymentMethodMap[selectedItem.payment_method] || selectedItem.payment_method || "—" },
                  { l: "מס׳ אסמכתא", v: selectedItem.reference_number || "—" },
                  { l: "מטבע", v: selectedItem.currency || "ILS" },
                ].map((d, i) => (
                  <div key={i} className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">{d.l}</p><p className="text-foreground mt-1 font-medium text-sm">{d.v}</p></div>
                ))}
              </div>
              {selectedItem.notes && <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground mb-1">הערות</p><p className="text-sm text-foreground">{selectedItem.notes}</p></div>}
              <div className="flex items-center gap-2 pt-2">
                <Button variant="outline" className="border-border gap-1" onClick={() => printPage(`קבלה ${selectedItem.receipt_number}`)}><Printer className="h-4 w-4" />הדפסה</Button>
                <Button onClick={() => { openEdit(selectedItem); setSelectedItem(null); }} className="bg-blue-600 hover:bg-blue-700 gap-1"><Edit2 className="h-4 w-4" />ערוך</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
