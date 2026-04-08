import { useState, useEffect, useMemo, useCallback } from "react";
import { FileText, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2, Clock, AlertTriangle, ArrowUpDown, DollarSign, Send as SendIcon, Eye, Loader2, TrendingUp, BarChart3, Printer, Send, Download, Package, Hash, Copy, Mail, ChevronLeft, ChevronRight, MoreHorizontal, Ban, Table } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import ExportDropdown from "@/components/export-dropdown";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { printPage, sendByEmail, generateEmailBody } from "@/lib/print-utils";
import { generatePDF } from "@/lib/pdf-utils";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { useApiAction, ActionButton } from "@/hooks/use-api-action";
import { authFetch, formatAgorot } from "@/lib/utils";
import { NullSafe } from "@/lib/null-safety";
import { VAT_RATE } from "@/utils/money";
import { useToast } from "@/hooks/use-toast";
import ActivityLog from "@/components/activity-log";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
// J-03: Null Safety - all display values use fallbacks
const fmt = (v: any) => NullSafe.number(v, 0).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (v: any) => NullSafe.number(v, 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const VAT_PERCENT = Math.round(VAT_RATE * 100);

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  lineTotal: number;
}

interface Invoice {
  id: number; invoice_number: string; invoice_type: string; invoice_date: string; due_date: string;
  customer_name: string; customer_tax_id: string; status: string; currency: string;
  subtotal: number; discount_amount: number; before_vat: number; vat_rate: number;
  vat_amount: number; total_amount: number; amount_paid: number; balance_due: number;
  payment_terms: string; payment_method: string; po_number: string; salesperson: string;
  item_description: string; notes: string;
}

const typeMap: Record<string, string> = { tax_invoice: "חשבונית מס", tax_receipt: "חשבונית מס/קבלה", proforma: "פרופורמה", delivery_note: "תעודת משלוח", price_quote: "הצעת מחיר", receipt: "קבלה", tax_invoice_receipt: "חשבונית מס קבלה" };
const statusConfig: Record<string, { label: string; color: string; next?: string[] }> = {
  draft: { label: "טיוטה", color: "bg-muted text-muted-foreground", next: ["sent", "cancelled"] },
  sent: { label: "נשלח", color: "bg-blue-500/20 text-blue-300", next: ["partial", "paid", "overdue", "cancelled"] },
  partial: { label: "שולם חלקית", color: "bg-amber-500/20 text-amber-300", next: ["paid", "overdue"] },
  paid: { label: "שולם", color: "bg-emerald-500/20 text-emerald-300" },
  overdue: { label: "באיחור", color: "bg-red-500/20 text-red-300", next: ["partial", "paid", "cancelled"] },
  cancelled: { label: "בוטל", color: "bg-muted text-muted-foreground/60" },
};
const paymentTermsOptions = [
  { value: "immediate", label: "מיידי" },
  { value: "net_7", label: "שוטף+7" },
  { value: "net_14", label: "שוטף+14" },
  { value: "net_30", label: "שוטף+30" },
  { value: "net_45", label: "שוטף+45" },
  { value: "net_60", label: "שוטף+60" },
  { value: "net_90", label: "שוטף+90" },
  { value: "advance_50", label: "50% מקדמה" },
  { value: "eom", label: "סוף חודש" },
  { value: "custom", label: "מותאם" },
];
const paymentTermsMap: Record<string, string> = Object.fromEntries(paymentTermsOptions.map(o => [o.value, o.label]));
const KNOWN_CUSTOMERS = ["שמעון בניין ופיתוח בע\"מ", "אדריכלות גולן ושות", "קבוצת אלרם בנייה", "עמוס קבלנות כללית", "נדל\"ן הגליל בע\"מ", "ברזילי קונסטרוקציות", "חברת בניין הנגב", "פרויקט-ליין בע\"מ", "אלומיניום פרו התקנות", "זוהר עיצוב ואדריכלות", "מגורי השרון בע\"מ", "תעשיות בן-ארי", "חיים כהן קבלנות", "דניאל הנדסת מבנים", "מרכזי מסחר ישראל", "בנייני הים התיכון", "אופק נכסים והשקעות", "גלעד פרויקטים", "מפעלי מתכת השפלה", "רשת חנויות גביש", "טופז הנדסה אזרחית", "א.ב. בנייה ופיתוח", "שקד אדריכלים", "בנייני עתיד בע\"מ", "יוסף לוי נכסים"];

function generateInvoiceNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const seq = String(Math.floor(1000 + Math.random() * 9000));
  return `INV-${y}-${seq}`;
}

function calcLineTotal(item: LineItem): number {
  const gross = item.quantity * item.unitPrice;
  const discount = gross * (item.discountPct / 100);
  return Math.round((gross - discount) * 100) / 100;
}

function newLineItem(): LineItem {
  return { id: crypto.randomUUID(), description: "", quantity: 1, unitPrice: 0, discountPct: 0, lineTotal: 0 };
}

export default function InvoicesPage() {
  const { toast } = useToast();
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortField, setSortField] = useState("invoice_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [form, setForm] = useState<any>({});
  const [lineItems, setLineItems] = useState<LineItem[]>([newLineItem()]);
  const [tableLoading, setTableLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<Invoice | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [mainTab, setMainTab] = useState<"invoices"|"aging">("invoices");
  const [agingData, setAgingData] = useState<any[]>([]);
  const [agingLoading, setAgingLoading] = useState(false);
  const pagination = useSmartPagination(25);
  const { executeSave, executeDelete, loading: actionLoading } = useApiAction();
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const token = localStorage.getItem("token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = () => {
    setTableLoading(true);
    Promise.all([
      authFetch(`${API}/customer-invoices`, { headers }).then(r => r.json()).then(d => setItems(safeArray(d))),
      authFetch(`${API}/customer-invoices/stats`, { headers }).then(r => r.json()).then(d => setStats(d || {})),
    ]).finally(() => setTableLoading(false));
  };

  const loadAging = () => {
    setAgingLoading(true);
    authFetch(`${API}/ar/aging`, { headers }).then(r => r.json()).then(d => setAgingData(Array.isArray(d) ? d : [])).finally(() => setAgingLoading(false));
  };

  useEffect(load, []);
  useEffect(() => { if (mainTab === "aging" && agingData.length === 0) loadAging(); }, [mainTab]);

  const filtered = useMemo(() => {
    let f = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (filterType === "all" || i.invoice_type === filterType) &&
      (!search || i.invoice_number?.toLowerCase().includes(search.toLowerCase()) || i.customer_name?.toLowerCase().includes(search.toLowerCase()) || i.po_number?.toLowerCase().includes(search.toLowerCase()))
    );
    f.sort((a: any, b: any) => { const av = a[sortField], bv = b[sortField]; const cmp = typeof av === "number" ? av - bv : String(av || "").localeCompare(String(bv || "")); return sortDir === "asc" ? cmp : -cmp; });
    return f;
  }, [items, search, filterStatus, filterType, sortField, sortDir]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return KNOWN_CUSTOMERS;
    return KNOWN_CUSTOMERS.filter(c => c.includes(customerSearch));
  }, [customerSearch]);

  const subtotal = useMemo(() => lineItems.reduce((s, li) => s + li.lineTotal, 0), [lineItems]);
  const vatAmount = useMemo(() => Math.round(subtotal * (VAT_PERCENT / 100) * 100) / 100, [subtotal]);
  const totalAmount = useMemo(() => Math.round((subtotal + vatAmount) * 100) / 100, [subtotal, vatAmount]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      invoiceNumber: generateInvoiceNumber(),
      invoiceType: "tax_invoice",
      invoiceDate: new Date().toISOString().slice(0, 10),
      status: "draft",
      currency: "ILS",
      vatRate: VAT_PERCENT,
      paymentTerms: "net_30",
      customerName: "",
      notes: "",
    });
    setLineItems([newLineItem()]);
    setCustomerSearch("");
    setShowForm(true);
  };

  const openEdit = (r: Invoice) => {
    setEditing(r);
    const parsedLines: LineItem[] = (() => {
      try {
        const parsed = JSON.parse(r.item_description || "[]");
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
      if (r.item_description) return [{ id: crypto.randomUUID(), description: r.item_description, quantity: 1, unitPrice: r.subtotal, discountPct: 0, lineTotal: r.subtotal }];
      return [newLineItem()];
    })();
    setForm({
      invoiceNumber: r.invoice_number,
      invoiceType: r.invoice_type,
      invoiceDate: r.invoice_date?.slice(0, 10),
      dueDate: r.due_date?.slice(0, 10),
      customerName: r.customer_name,
      customerTaxId: r.customer_tax_id,
      status: r.status,
      currency: r.currency,
      vatRate: r.vat_rate || VAT_PERCENT,
      amountPaid: r.amount_paid,
      paymentTerms: r.payment_terms,
      paymentMethod: r.payment_method,
      poNumber: r.po_number,
      salesperson: r.salesperson,
      notes: r.notes,
    });
    setLineItems(parsedLines);
    setCustomerSearch(r.customer_name || "");
    setShowForm(true);
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: any) => {
    setLineItems(prev => prev.map(li => {
      if (li.id !== id) return li;
      const updated = { ...li, [field]: value };
      updated.lineTotal = calcLineTotal(updated);
      return updated;
    }));
  };

  const addLineItem = () => setLineItems(prev => [...prev, newLineItem()]);
  const removeLineItem = (id: string) => setLineItems(prev => prev.length > 1 ? prev.filter(li => li.id !== id) : prev);

  const save = async () => {
    if (!form.customerName) return;
    const payload = {
      ...form,
      subtotal,
      beforeVat: subtotal,
      vatRate: VAT_PERCENT,
      vatAmount,
      totalAmount,
      balanceDue: totalAmount - (Number(form.amountPaid) || 0),
      itemDescription: JSON.stringify(lineItems),
    };
    const url = editing ? `${API}/customer-invoices/${editing.id}` : `${API}/customer-invoices`;
    await executeSave(
      () => authFetch(url, { method: editing ? "PUT" : "POST", headers, body: JSON.stringify(payload) }),
      !!editing,
      { successMessage: editing ? "חשבונית עודכנה בהצלחה" : "חשבונית נוצרה בהצלחה", onSuccess: () => { setShowForm(false); load(); } }
    );
  };

  const remove = async (id: number) => {
    await executeDelete(() => authFetch(`${API}/customer-invoices/${id}`, { method: "DELETE", headers }), { confirm: false, successMessage: "חשבונית נמחקה בהצלחה", onSuccess: load });
  };

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };
  const af = [filterStatus !== "all", filterType !== "all"].filter(Boolean).length;

  const kpis = [
    { label: "סה״כ חשבוניות", value: fmtInt(stats.total || items.length), icon: FileText, color: "text-blue-400", bg: "from-blue-500/15 to-blue-600/5 border-blue-500/20" },
    { label: "שולמו", value: fmtInt(stats.paid || items.filter(i => i.status === "paid").length), icon: CheckCircle2, color: "text-emerald-400", bg: "from-emerald-500/15 to-emerald-600/5 border-emerald-500/20" },
    { label: "באיחור", value: fmtInt(stats.overdue || items.filter(i => i.status === "overdue").length), icon: AlertTriangle, color: "text-red-400", bg: "from-red-500/15 to-red-600/5 border-red-500/20" },
    { label: "טיוטות", value: fmtInt(stats.drafts || items.filter(i => i.status === "draft").length), icon: Clock, color: "text-muted-foreground", bg: "from-[#2a2a3e]/50 to-[#2a2a3e]/20 border-border" },
    { label: "סה״כ חיוב", value: `₪${fmtInt(stats.total_invoiced || items.reduce((s, i) => s + Number(i.total_amount || 0), 0))}`, icon: DollarSign, color: "text-cyan-400", bg: "from-cyan-500/15 to-cyan-600/5 border-cyan-500/20" },
    { label: "יתרה פתוחה", value: `₪${fmtInt(stats.total_outstanding || items.reduce((s, i) => s + Number(i.balance_due || 0), 0))}`, icon: DollarSign, color: "text-amber-400", bg: "from-amber-500/15 to-amber-600/5 border-amber-500/20" },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><FileText className="text-emerald-400" /> חשבוניות לקוחות</h1>
          <p className="text-sm text-muted-foreground mt-1">חשבוניות מס, קבלות, פרופורמה, תעודות משלוח</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={items} headers={{ invoice_number: "מספר", invoice_type: "סוג", invoice_date: "תאריך", customer_name: "לקוח", subtotal: "סכום", vat_amount: "מע״מ", total_amount: "סה״כ", amount_paid: "שולם", balance_due: "יתרה", status: "סטטוס" }} filename="invoices" />
          <Button variant="outline" onClick={() => printPage("חשבוניות")} className="border-border text-muted-foreground gap-1"><Printer className="h-4 w-4" />הדפסה</Button>
          <Button variant="outline" onClick={() => sendByEmail("חשבוניות - טכנו-כל עוזי", generateEmailBody("חשבוניות", items, { invoice_number: "מספר", customer_name: "לקוח", total_amount: "סכום", status: "סטטוס" }))} className="border-border text-muted-foreground gap-1"><Send className="h-4 w-4" />שליחה</Button>
          <Button onClick={() => { window.print && window.print(); }} variant="outline" className="border-border text-purple-300 gap-1"><Download className="h-4 w-4" />PDF</Button>
          <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700 gap-1"><Plus className="h-4 w-4" />חשבונית חדשה</Button>
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

      <div className="flex gap-2 border-b border-border">
        {([["invoices","חשבוניות", FileText], ["aging","דוח גיל חובות", Table]] as [string, string, any][]).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setMainTab(key as any)} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 ${mainTab === key ? "border-emerald-500 text-emerald-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {mainTab === "aging" && (
        <Card className="bg-card/80 border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><Table className="w-4 h-4 text-amber-400" />דוח גיל חובות לפי לקוח</h3>
              <Button variant="outline" size="sm" className="border-border text-muted-foreground text-xs" onClick={loadAging}>רענן</Button>
            </div>
            {agingLoading ? (
              <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />טוען דוח גיל חובות...</div>
            ) : agingData.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">אין נתוני חובות פתוחים</div>
            ) : (<>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-background/50 border-b border-border">
                    <th className="px-3 py-2.5 text-right text-muted-foreground font-medium">לקוח</th>
                    <th className="px-3 py-2.5 text-right text-muted-foreground font-medium">חשבוניות</th>
                    <th className="px-3 py-2.5 text-right text-emerald-400 font-medium">שוטף</th>
                    <th className="px-3 py-2.5 text-right text-yellow-400 font-medium">1–30 יום</th>
                    <th className="px-3 py-2.5 text-right text-orange-400 font-medium">31–60 יום</th>
                    <th className="px-3 py-2.5 text-right text-red-400 font-medium">61–90 יום</th>
                    <th className="px-3 py-2.5 text-right text-red-600 font-medium">90+ יום</th>
                    <th className="px-3 py-2.5 text-right text-foreground font-bold">סה״כ יתרה</th>
                  </tr></thead>
                  <tbody>
                    {agingData.map((row: any, i: number) => {
                      const total = Number(row.total_balance || 0);
                      const critical = Number(row.days_90 || 0) + Number(row.days_120_plus || 0);
                      return (
                        <tr key={i} className={`border-b border-border/50 hover:bg-muted/30 ${critical > 0 ? "bg-red-500/5" : ""}`}>
                          <td className="px-3 py-2 text-foreground font-medium">{row.customer_name}</td>
                          <td className="px-3 py-2 text-center text-muted-foreground">{row.invoice_count}</td>
                          <td className="px-3 py-2 font-mono text-emerald-400">{Number(row.current_amount || 0) > 0 ? `₪${fmtInt(row.current_amount)}` : "—"}</td>
                          <td className="px-3 py-2 font-mono text-yellow-400">{Number(row.days_30 || 0) > 0 ? `₪${fmtInt(row.days_30)}` : "—"}</td>
                          <td className="px-3 py-2 font-mono text-orange-400">{Number(row.days_60 || 0) > 0 ? `₪${fmtInt(row.days_60)}` : "—"}</td>
                          <td className="px-3 py-2 font-mono text-red-400">{Number(row.days_90 || 0) > 0 ? `₪${fmtInt(row.days_90)}` : "—"}</td>
                          <td className="px-3 py-2 font-mono text-red-600 font-bold">{Number(row.days_120_plus || 0) > 0 ? `₪${fmtInt(row.days_120_plus)}` : "—"}</td>
                          <td className="px-3 py-2 font-mono font-bold text-foreground">₪{fmtInt(total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot><tr className="bg-background/50 border-t-2 border-border">
                    <td className="px-3 py-2.5 text-foreground font-bold" colSpan={2}>סה״כ ({agingData.length} לקוחות)</td>
                    <td className="px-3 py-2.5 font-mono text-emerald-400 font-bold">₪{fmtInt(agingData.reduce((s: number, r: any) => s + Number(r.current_amount || 0), 0))}</td>
                    <td className="px-3 py-2.5 font-mono text-yellow-400 font-bold">₪{fmtInt(agingData.reduce((s: number, r: any) => s + Number(r.days_30 || 0), 0))}</td>
                    <td className="px-3 py-2.5 font-mono text-orange-400 font-bold">₪{fmtInt(agingData.reduce((s: number, r: any) => s + Number(r.days_60 || 0), 0))}</td>
                    <td className="px-3 py-2.5 font-mono text-red-400 font-bold">₪{fmtInt(agingData.reduce((s: number, r: any) => s + Number(r.days_90 || 0), 0))}</td>
                    <td className="px-3 py-2.5 font-mono text-red-600 font-bold">₪{fmtInt(agingData.reduce((s: number, r: any) => s + Number(r.days_120_plus || 0), 0))}</td>
                    <td className="px-3 py-2.5 font-mono text-foreground font-bold">₪{fmtInt(agingData.reduce((s: number, r: any) => s + Number(r.total_balance || 0), 0))}</td>
                  </tr></tfoot>
                </table>
              </div>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                {[
                  { label: "שוטף", key: "current_amount", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
                  { label: "1–30 יום", key: "days_30", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30" },
                  { label: "31–60 יום", key: "days_60", color: "text-orange-400 bg-orange-500/10 border-orange-500/30" },
                  { label: "61–90 יום", key: "days_90", color: "text-red-400 bg-red-500/10 border-red-500/30" },
                  { label: "90+ יום", key: "days_120_plus", color: "text-red-600 bg-red-700/10 border-red-700/30" },
                ].map(b => {
                  const total = agingData.reduce((s: number, r: any) => s + Number(r.total_balance || 0), 0);
                  const val = agingData.reduce((s: number, r: any) => s + Number(r[b.key] || 0), 0);
                  const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                  return (
                    <div key={b.key} className={`rounded-lg p-3 border ${b.color}`}>
                      <p className="font-semibold">{b.label}</p>
                      <p className="font-mono font-bold text-sm">₪{fmtInt(val)}</p>
                      <p className="text-muted-foreground">{pct}%</p>
                    </div>
                  );
                })}
              </div>
            </>)}
          </CardContent>
        </Card>
      )}

      {mainTab === "invoices" && items.length > 1 && (() => {
        const now = new Date();
        const months: Record<string, { month: string; total: number; vat: number; paid: number; balance: number; count: number }> = {};
        items.forEach(inv => {
          const d = inv.invoice_date?.slice(0, 7);
          if (!d) return;
          if (!months[d]) months[d] = { month: d, total: 0, vat: 0, paid: 0, balance: 0, count: 0 };
          months[d].total += Number(inv.total_amount || 0);
          months[d].vat += Number(inv.vat_amount || 0);
          months[d].paid += Number(inv.amount_paid || 0);
          months[d].balance += Number(inv.balance_due || 0);
          months[d].count += 1;
        });
        const trendData = Object.values(months).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
        const heMonth = (m: string) => { const [y, mo] = m.split("-"); return `${mo}/${y.slice(2)}`; };
        const tooltipStyle = { backgroundColor: "#1a1a2e", border: "1px solid #2a2a3e", borderRadius: "8px" };
        return trendData.length > 1 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-card/80 border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground"><TrendingUp className="h-4 w-4 text-emerald-400" /> מגמת הכנסות חודשית</div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="invGradTotal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                      <linearGradient id="invGradPaid" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                    <XAxis dataKey="month" tickFormatter={heMonth} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#2a2a3e" }} />
                    <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#2a2a3e" }} />
                    <Tooltip formatter={(v: number) => `₪${fmt(v)}`} labelFormatter={heMonth} contentStyle={tooltipStyle} />
                    <Legend formatter={(v: string) => <span className="text-xs text-muted-foreground">{v === "total" ? "סה״כ חשבוניות" : "נגבה"}</span>} />
                    <Area type="monotone" dataKey="total" stroke="#10b981" fill="url(#invGradTotal)" strokeWidth={2} name="total" />
                    <Area type="monotone" dataKey="paid" stroke="#3b82f6" fill="url(#invGradPaid)" strokeWidth={2} name="paid" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="bg-card/80 border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground"><BarChart3 className="h-4 w-4 text-amber-400" /> מע״מ ויתרות</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                    <XAxis dataKey="month" tickFormatter={heMonth} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#2a2a3e" }} />
                    <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#2a2a3e" }} />
                    <Tooltip formatter={(v: number) => `₪${fmt(v)}`} labelFormatter={heMonth} contentStyle={tooltipStyle} />
                    <Legend formatter={(v: string) => <span className="text-xs text-muted-foreground">{v === "vat" ? "מע״מ" : "יתרה"}</span>} />
                    <Bar dataKey="vat" fill="#f59e0b" radius={[4, 4, 0, 0]} name="vat" />
                    <Bar dataKey="balance" fill="#ef4444" radius={[4, 4, 0, 0]} name="balance" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        ) : null;
      })()}

      {mainTab === "invoices" && <Card className="bg-card/60 border-border"><CardContent className="p-3"><div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => { setSearch(e.target.value); pagination.setPage(1); }} placeholder="חיפוש לפי מספר, לקוח, הזמנה..." className="pr-9 bg-input border-border text-foreground" /></div>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); pagination.setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל הסטטוסים</option>{Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select value={filterType} onChange={e => { setFilterType(e.target.value); pagination.setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל הסוגים</option>{Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        {af > 0 && <Button variant="ghost" size="sm" onClick={() => { setFilterStatus("all"); setFilterType("all"); setSearch(""); }} className="text-red-400 hover:text-red-300 gap-1"><X className="h-3 w-3" />נקה ({af})</Button>}
      </div></CardContent></Card>}

      {mainTab === "invoices" && <BulkActions items={filtered} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
        defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/customer-invoices/${id}`, { method: "DELETE", headers }))); load(); }),
        defaultBulkActions.export(async (ids) => { const selected = filtered.filter(i => ids.includes(String(i.id))); const csv = "מספר,סוג,תאריך,לקוח,סכום,מע״מ,סה״כ,שולם,יתרה,סטטוס\n" + selected.map(i => `${i.invoice_number},${typeMap[i.invoice_type] || i.invoice_type},${i.invoice_date?.slice(0, 10)},${i.customer_name},${i.subtotal},${i.vat_amount},${i.total_amount},${i.amount_paid},${i.balance_due},${statusConfig[i.status]?.label || i.status}`).join("\n"); const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "invoices.csv"; a.click(); }),
      ]} />}

      {mainTab === "invoices" && <Card className="bg-card/80 border-border"><CardContent className="p-0">
        <div className="overflow-x-auto relative">
          {tableLoading && <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center z-10"><div className="flex items-center gap-2 bg-card border border-border rounded-lg px-4 py-2 shadow-lg"><Loader2 className="w-4 h-4 animate-spin text-emerald-400" /><span className="text-sm text-foreground">טוען חשבוניות...</span></div></div>}
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-background/50">
              <th className="px-3 py-3 w-10"><input type="checkbox" className="rounded" onChange={() => toggleAll(filtered)} /></th>
              {[{ key: "invoice_number", label: "מספר" }, { key: "invoice_type", label: "סוג" }, { key: "invoice_date", label: "תאריך" }, { key: "customer_name", label: "לקוח" }, { key: "subtotal", label: "סכום" }, { key: "vat_amount", label: "מע״מ" }, { key: "total_amount", label: "סה״כ" }, { key: "balance_due", label: "יתרה" }, { key: "due_date", label: "לתשלום" }, { key: "status", label: "סטטוס" }].map(col => (
                <th key={col.key} className="px-3 py-3 text-right text-muted-foreground font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort(col.key)}><div className="flex items-center gap-1 text-xs">{col.label}<ArrowUpDown className="h-3 w-3" /></div></th>
              ))}
              <th className="px-3 py-3 text-center text-muted-foreground font-medium text-xs">פעולות</th>
            </tr></thead>
            <tbody>
              {!tableLoading && pagination.paginate(filtered).length === 0 ? (
                <tr><td colSpan={12} className="p-16 text-center"><div className="flex flex-col items-center gap-4">{(af > 0 || search) ? <Search className="h-12 w-12 text-muted-foreground" /> : <FileText className="h-12 w-12 text-muted-foreground" />}<p className="text-lg font-medium text-muted-foreground">{(af > 0 || search) ? "לא נמצאו תוצאות" : "עדיין אין חשבוניות"}</p><p className="text-sm text-muted-foreground/60">{(af > 0 || search) ? "נסה לשנות את מונחי החיפוש או הסינון" : "צור חשבונית ראשונה"}</p>{!(af > 0 || search) && <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700 gap-2 mt-2"><Plus className="h-4 w-4" />חשבונית חדשה</Button>}</div></td></tr>
              ) : pagination.paginate(filtered).map(r => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setSelectedItem(r)}>
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}><input type="checkbox" checked={isSelected(String(r.id))} onChange={() => toggle(String(r.id))} className="rounded" /></td>
                  <td className="px-3 py-2.5 font-mono text-xs text-emerald-400 font-bold">{r.invoice_number}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{typeMap[r.invoice_type] || r.invoice_type}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.invoice_date?.slice(0, 10)}</td>
                  <td className="px-3 py-2.5 text-foreground font-medium max-w-[150px] truncate">{r.customer_name}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">₪{fmt(r.subtotal)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">₪{fmt(r.vat_amount)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs font-bold text-foreground">₪{fmt(r.total_amount)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs"><span className={Number(r.balance_due) > 0 ? "text-red-400 font-bold" : "text-emerald-400"}>₪{fmt(r.balance_due)}</span></td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.due_date?.slice(0, 10) || "—"}</td>
                  <td className="px-3 py-2.5"><Badge className={`${statusConfig[r.status]?.color || "bg-muted"} border-0 text-[10px]`}>{statusConfig[r.status]?.label || r.status}</Badge></td>
                  <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => setSelectedItem(r)}><Eye className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-blue-400" onClick={() => openEdit(r)}><Edit2 className="h-3.5 w-3.5" /></Button>
                      {isSuperAdmin && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400" onClick={async () => { if (await globalConfirm(`למחוק את חשבונית '${r.invoice_number}'? פעולה זו אינה ניתנת לביטול.`)) remove(r.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot><tr className="border-t-2 border-border bg-background/50 font-bold text-sm">
                <td className="px-3 py-3" /><td className="px-3 py-3 text-foreground" colSpan={4}>סה״כ ({filtered.length} חשבוניות)</td>
                <td className="px-3 py-3 font-mono text-xs text-foreground">₪{fmt(filtered.reduce((s, r) => s + Number(r.subtotal || 0), 0))}</td>
                <td className="px-3 py-3 font-mono text-xs text-muted-foreground">₪{fmt(filtered.reduce((s, r) => s + Number(r.vat_amount || 0), 0))}</td>
                <td className="px-3 py-3 font-mono text-xs text-emerald-400">₪{fmt(filtered.reduce((s, r) => s + Number(r.total_amount || 0), 0))}</td>
                <td className="px-3 py-3 font-mono text-xs text-red-400">₪{fmt(filtered.reduce((s, r) => s + Number(r.balance_due || 0), 0))}</td>
                <td colSpan={3} />
              </tr></tfoot>
            )}
          </table>
        </div>
      </CardContent></Card>}
      {mainTab === "invoices" && <SmartPagination pagination={pagination} />}

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת חשבונית" : "חשבונית חדשה"}</h2>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-0 font-mono text-xs">{form.invoiceNumber}</Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}><X className="h-4 w-4" /></Button>
              </div>

              <div className="p-4 space-y-5">
                <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">פרטי חשבונית</h3></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><Label className="text-muted-foreground text-xs">סוג מסמך *</Label><select value={form.invoiceType || "tax_invoice"} onChange={e => setForm({ ...form, invoiceType: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">{Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                  <div><Label className="text-muted-foreground text-xs">מספר חשבונית</Label><Input value={form.invoiceNumber || ""} readOnly className="bg-input border-border text-emerald-400 font-mono mt-1" /></div>
                  <div><Label className="text-muted-foreground text-xs">תאריך *</Label><Input type="date" value={form.invoiceDate || ""} onChange={e => setForm({ ...form, invoiceDate: e.target.value })} className="bg-input border-border text-foreground mt-1" /></div>
                  <div><Label className="text-muted-foreground text-xs">סטטוס</Label><select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">{Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                </div>

                <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">פרטי לקוח</h3></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="col-span-2 relative">
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
                  <div><Label className="text-muted-foreground text-xs">מס׳ הזמנה (PO)</Label><Input value={form.poNumber || ""} onChange={e => setForm({ ...form, poNumber: e.target.value })} className="bg-input border-border text-foreground mt-1" /></div>
                </div>

                <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">תנאי תשלום</h3></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><Label className="text-muted-foreground text-xs">תנאי תשלום</Label><select value={form.paymentTerms || "net_30"} onChange={e => setForm({ ...form, paymentTerms: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">{paymentTermsOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                  <div><Label className="text-muted-foreground text-xs">לתשלום עד</Label><Input type="date" value={form.dueDate || ""} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="bg-input border-border text-foreground mt-1" /></div>
                  <div><Label className="text-muted-foreground text-xs">אמצעי תשלום</Label><select value={form.paymentMethod || ""} onChange={e => setForm({ ...form, paymentMethod: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1"><option value="">בחר...</option><option value="bank_transfer">העברה בנקאית</option><option value="check">שיק</option><option value="cash">מזומן</option><option value="credit_card">כרטיס אשראי</option><option value="bit">ביט</option></select></div>
                  <div><Label className="text-muted-foreground text-xs">איש מכירות</Label><Input value={form.salesperson || ""} onChange={e => setForm({ ...form, salesperson: e.target.value })} className="bg-input border-border text-foreground mt-1" /></div>
                </div>

                <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">שורות פריטים</h3></div>
                <div className="bg-input rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border bg-card/50">
                      <th className="px-3 py-2 text-right text-muted-foreground text-xs font-medium w-8">#</th>
                      <th className="px-3 py-2 text-right text-muted-foreground text-xs font-medium">תיאור</th>
                      <th className="px-3 py-2 text-right text-muted-foreground text-xs font-medium w-20">כמות</th>
                      <th className="px-3 py-2 text-right text-muted-foreground text-xs font-medium w-28">מחיר יחידה (₪)</th>
                      <th className="px-3 py-2 text-right text-muted-foreground text-xs font-medium w-20">הנחה %</th>
                      <th className="px-3 py-2 text-right text-muted-foreground text-xs font-medium w-28">סה״כ שורה (₪)</th>
                      <th className="px-3 py-2 w-10" />
                    </tr></thead>
                    <tbody>
                      {lineItems.map((li, idx) => (
                        <tr key={li.id} className="border-b border-border/50">
                          <td className="px-3 py-2 text-muted-foreground text-xs">{idx + 1}</td>
                          <td className="px-3 py-1"><Input value={li.description} onChange={e => updateLineItem(li.id, "description", e.target.value)} placeholder="תיאור פריט..." className="bg-transparent border-0 text-foreground h-8 px-1 text-sm" /></td>
                          <td className="px-3 py-1"><Input type="number" min={0} step={1} value={li.quantity || ""} onChange={e => updateLineItem(li.id, "quantity", Number(e.target.value) || 0)} className="bg-transparent border-0 text-foreground h-8 px-1 text-sm font-mono text-center" /></td>
                          <td className="px-3 py-1"><Input type="number" min={0} step={0.01} value={li.unitPrice || ""} onChange={e => updateLineItem(li.id, "unitPrice", Number(e.target.value) || 0)} className="bg-transparent border-0 text-foreground h-8 px-1 text-sm font-mono text-center" /></td>
                          <td className="px-3 py-1"><Input type="number" min={0} max={100} step={0.5} value={li.discountPct || ""} onChange={e => updateLineItem(li.id, "discountPct", Number(e.target.value) || 0)} className="bg-transparent border-0 text-foreground h-8 px-1 text-sm font-mono text-center" /></td>
                          <td className="px-3 py-2 font-mono text-sm text-emerald-400 text-right">₪{fmt(li.lineTotal)}</td>
                          <td className="px-3 py-2"><Button variant="ghost" size="sm" onClick={() => removeLineItem(li.id)} className="h-6 w-6 p-0 text-red-400 hover:text-red-300" disabled={lineItems.length <= 1}><X className="h-3 w-3" /></Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="p-2 border-t border-border">
                    <Button variant="ghost" size="sm" onClick={addLineItem} className="text-blue-400 hover:text-blue-300 gap-1 text-xs"><Plus className="h-3 w-3" />הוסף שורה</Button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <div className="w-full max-w-sm bg-input rounded-lg border border-border p-4 space-y-3">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">סכום ביניים</span><span className="text-foreground font-mono">₪{fmt(subtotal)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">מע״מ ({VAT_PERCENT}%)</span><span className="text-amber-400 font-mono">₪{fmt(vatAmount)}</span></div>
                    <hr className="border-border" />
                    <div className="flex justify-between text-lg font-bold"><span className="text-foreground">סה״כ לתשלום</span><span className="text-emerald-400 font-mono">₪{fmt(totalAmount)}</span></div>
                    {Number(form.amountPaid) > 0 && <>
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">שולם</span><span className="text-blue-400 font-mono">₪{fmt(form.amountPaid)}</span></div>
                      <div className="flex justify-between text-sm font-bold"><span className="text-red-400">יתרה</span><span className="text-red-400 font-mono">₪{fmt(totalAmount - Number(form.amountPaid))}</span></div>
                    </>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-muted-foreground text-xs">שולם (₪)</Label><Input type="number" step={0.01} value={form.amountPaid || ""} onChange={e => setForm({ ...form, amountPaid: e.target.value })} className="bg-input border-border text-foreground mt-1" /></div>
                </div>

                <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">הערות</h3></div>
                <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground resize-none" placeholder="הערות לחשבונית..." />
              </div>

              <div className="flex items-center gap-2 p-4 border-t border-border justify-end">
                <Button variant="outline" onClick={() => setShowForm(false)} className="border-border">ביטול</Button>
                <Button variant="outline" className="border-blue-500/30 text-blue-300 gap-1"><Printer className="h-4 w-4" />הדפסה</Button>
                <Button variant="outline" className="border-purple-500/30 text-purple-300 gap-1"><Mail className="h-4 w-4" />שלח במייל</Button>
                <Button onClick={save} disabled={actionLoading || !form.customerName} className="bg-emerald-600 hover:bg-emerald-700 gap-1"><Save className="h-4 w-4" />{editing ? "עדכן" : "שמור"}</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setSelectedItem(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-foreground">{selectedItem.invoice_number}</h2>
                <Badge className={`${statusConfig[selectedItem.status]?.color || "bg-muted"} border-0`}>{statusConfig[selectedItem.status]?.label || selectedItem.status}</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedItem(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { l: "סוג", v: typeMap[selectedItem.invoice_type] || selectedItem.invoice_type },
                  { l: "לקוח", v: selectedItem.customer_name },
                  { l: "ח.פ/ע.מ", v: selectedItem.customer_tax_id || "—" },
                  { l: "תאריך", v: selectedItem.invoice_date?.slice(0, 10) },
                  { l: "לתשלום עד", v: selectedItem.due_date?.slice(0, 10) || "—" },
                  { l: "תנאי תשלום", v: paymentTermsMap[selectedItem.payment_terms] || selectedItem.payment_terms || "—" },
                  { l: "אמצעי תשלום", v: selectedItem.payment_method || "—" },
                  { l: "מס׳ הזמנה", v: selectedItem.po_number || "—" },
                ].map((d, i) => (
                  <div key={i} className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">{d.l}</p><p className="text-foreground mt-1 font-medium text-sm">{d.v}</p></div>
                ))}
              </div>

              {(() => {
                let parsedLines: any[] = [];
                try { parsedLines = JSON.parse(selectedItem.item_description || "[]"); } catch {}
                if (!Array.isArray(parsedLines) || parsedLines.length === 0) {
                  if (selectedItem.item_description) parsedLines = [{ description: selectedItem.item_description, quantity: 1, unitPrice: selectedItem.subtotal, discountPct: 0, lineTotal: selectedItem.subtotal }];
                }
                return parsedLines.length > 0 ? (
                  <div>
                    <h3 className="text-sm font-semibold text-blue-400 mb-2">שורות פריטים</h3>
                    <div className="bg-input rounded-lg border border-border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b border-border">
                          <th className="px-3 py-2 text-right text-muted-foreground text-xs">#</th>
                          <th className="px-3 py-2 text-right text-muted-foreground text-xs">תיאור</th>
                          <th className="px-3 py-2 text-right text-muted-foreground text-xs">כמות</th>
                          <th className="px-3 py-2 text-right text-muted-foreground text-xs">מחיר יחידה</th>
                          <th className="px-3 py-2 text-right text-muted-foreground text-xs">הנחה %</th>
                          <th className="px-3 py-2 text-right text-muted-foreground text-xs">סה״כ</th>
                        </tr></thead>
                        <tbody>
                          {parsedLines.map((li: any, i: number) => (
                            <tr key={i} className="border-b border-border/50">
                              <td className="px-3 py-2 text-muted-foreground text-xs">{i + 1}</td>
                              <td className="px-3 py-2 text-foreground">{li.description}</td>
                              <td className="px-3 py-2 font-mono text-xs">{li.quantity}</td>
                              <td className="px-3 py-2 font-mono text-xs">₪{fmt(li.unitPrice)}</td>
                              <td className="px-3 py-2 font-mono text-xs">{li.discountPct || 0}%</td>
                              <td className="px-3 py-2 font-mono text-xs text-emerald-400">₪{fmt(li.lineTotal)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null;
              })()}

              <div className="flex justify-end">
                <div className="w-full max-w-xs bg-input rounded-lg border border-border p-4 space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">סכום ביניים</span><span className="text-foreground font-mono">₪{fmt(selectedItem.subtotal)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">מע״מ ({selectedItem.vat_rate || VAT_PERCENT}%)</span><span className="text-amber-400 font-mono">₪{fmt(selectedItem.vat_amount)}</span></div>
                  <hr className="border-border" />
                  <div className="flex justify-between font-bold"><span className="text-foreground">סה״כ</span><span className="text-emerald-400 font-mono">₪{fmt(selectedItem.total_amount)}</span></div>
                  {Number(selectedItem.amount_paid) > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">שולם</span><span className="text-blue-400 font-mono">₪{fmt(selectedItem.amount_paid)}</span></div>}
                  {Number(selectedItem.balance_due) > 0 && <div className="flex justify-between text-sm font-bold"><span className="text-red-400">יתרה</span><span className="text-red-400 font-mono">₪{fmt(selectedItem.balance_due)}</span></div>}
                </div>
              </div>

              {selectedItem.notes && <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground mb-1">הערות</p><p className="text-sm text-foreground">{selectedItem.notes}</p></div>}

              {statusConfig[selectedItem.status]?.next && (
                <div>
                  <h3 className="text-sm font-semibold text-blue-400 mb-2">שנה סטטוס</h3>
                  <div className="flex gap-2 flex-wrap">
                    {statusConfig[selectedItem.status]?.next?.map(nextStatus => (
                      <Button key={nextStatus} variant="outline" size="sm" className={`border-border gap-1 ${nextStatus === "paid" ? "text-emerald-400 border-emerald-500/30" : nextStatus === "cancelled" ? "text-red-400 border-red-500/30" : "text-blue-400 border-blue-500/30"}`} onClick={async () => {
                        const confirmed = await globalConfirm({
                          title: `האם להשנות סטטוס ל${statusConfig[nextStatus]?.label}?`,
                          message: `חשבונית ${selectedItem.invoice_number} תשונה ל${statusConfig[nextStatus]?.label}`,
                          okText: "כן, שנה",
                          cancelText: "ביטול"
                        });
                        if (!confirmed) return;
                        try {
                          await authFetch(`${API}/customer-invoices/${selectedItem.id}`, { method: "PUT", headers, body: JSON.stringify({ status: nextStatus }) });
                          toast({
                            title: "סטטוס שונה בהצלחה",
                            description: `חשבונית ${selectedItem.invoice_number} שונתה ל${statusConfig[nextStatus]?.label}`,
                            variant: "default"
                          });
                          load();
                          setSelectedItem(null);
                        } catch (error) {
                          toast({
                            title: "שגיאה בשינוי סטטוס",
                            description: "אנא נסה שנית",
                            variant: "destructive"
                          });
                        }
                      }}>
                        {nextStatus === "sent" && <SendIcon className="h-3 w-3" />}
                        {nextStatus === "paid" && <CheckCircle2 className="h-3 w-3" />}
                        {nextStatus === "partial" && <DollarSign className="h-3 w-3" />}
                        {nextStatus === "overdue" && <AlertTriangle className="h-3 w-3" />}
                        {nextStatus === "cancelled" && <Ban className="h-3 w-3" />}
                        {statusConfig[nextStatus]?.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-border justify-end">
              <Button variant="outline" className="border-border gap-1" onClick={() => printPage(`חשבונית ${selectedItem.invoice_number}`)}><Printer className="h-4 w-4" />הדפסה</Button>
              <Button variant="outline" className="border-purple-500/30 text-purple-300 gap-1" onClick={() => {
                let parsedLines: any[] = [];
                try { parsedLines = JSON.parse(selectedItem.item_description || "[]"); } catch {}
                if (!Array.isArray(parsedLines) || parsedLines.length === 0) {
                  if (selectedItem.item_description) parsedLines = [{ description: selectedItem.item_description, quantity: 1, unitPrice: selectedItem.subtotal, discountPct: 0, lineTotal: selectedItem.subtotal }];
                }
                generatePDF({
                  type: "invoice",
                  number: selectedItem.invoice_number,
                  date: selectedItem.invoice_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
                  customer: {
                    name: selectedItem.customer_name,
                    phone: "",
                    email: "",
                    address: ""
                  },
                  items: parsedLines.map((li: any) => ({
                    description: li.description,
                    quantity: li.quantity || 1,
                    unit_price: Math.round((li.unitPrice || 0) * 100),
                    total: Math.round((li.lineTotal || 0) * 100)
                  })),
                  subtotal: Math.round((selectedItem.subtotal || 0) * 100),
                  vat_amount: Math.round((selectedItem.vat_amount || 0) * 100),
                  total: Math.round((selectedItem.total_amount || 0) * 100)
                });
              }}><Download className="h-4 w-4" />PDF</Button>
              <Button variant="outline" className="border-purple-500/30 text-purple-300 gap-1" onClick={() => sendByEmail(`חשבונית ${selectedItem.invoice_number}`, `חשבונית: ${selectedItem.invoice_number}\nלקוח: ${selectedItem.customer_name}\nסכום: ₪${fmt(selectedItem.total_amount)}`)}><Mail className="h-4 w-4" />שלח במייל</Button>
              <Button onClick={() => { openEdit(selectedItem); setSelectedItem(null); }} className="bg-blue-600 hover:bg-blue-700 gap-1"><Edit2 className="h-4 w-4" />ערוך</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
