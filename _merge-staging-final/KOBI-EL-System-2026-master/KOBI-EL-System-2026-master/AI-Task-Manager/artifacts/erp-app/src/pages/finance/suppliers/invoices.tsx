import { useState, useEffect, useMemo } from "react";
import {
  FileText, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2,
  Clock, AlertTriangle, ArrowUpDown, DollarSign, Eye, Printer, Send,
  Mail, Ban, ShieldCheck, Package, Truck, TrendingUp, BarChart3, Loader2,
  ClipboardCheck, UserCheck, ThumbsUp, ThumbsDown, Copy,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import ExportDropdown from "@/components/export-dropdown";
import ImportButton from "@/components/import-button";
import { globalConfirm } from "@/components/confirm-dialog";
import { printPage, sendByEmail, generateEmailBody } from "@/lib/print-utils";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { authFetch } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import { VAT_RATE } from "@/utils/money";
import { duplicateRecord } from "@/lib/duplicate-record";
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
const VAT_PERCENT = Math.round(VAT_RATE * 100);

interface LineItem { id: string; description: string; quantity: number; unitPrice: number; discountPct: number; lineTotal: number; }
interface SupplierInvoice {
  id: number; invoice_number: string; invoice_date: string; due_date: string;
  supplier_name: string; supplier_tax_id: string; status: string; currency: string;
  subtotal: number; vat_rate: number; vat_amount: number; total_amount: number;
  amount_paid: number; balance_due: number; payment_terms: string;
  po_number: string; item_description: string; notes: string;
  approved_by: string; approved_date: string;
}

const statusConfig: Record<string, { label: string; color: string; next?: string[] }> = {
  draft: { label: "טיוטה", color: "bg-muted text-muted-foreground", next: ["received"] },
  received: { label: "התקבל", color: "bg-blue-500/20 text-blue-300", next: ["verified", "disputed", "cancelled"] },
  verified: { label: "אומת", color: "bg-indigo-500/20 text-indigo-300", next: ["approved", "disputed"] },
  approved: { label: "מאושר לתשלום", color: "bg-emerald-500/20 text-emerald-300", next: ["partial", "paid"] },
  partial: { label: "שולם חלקית", color: "bg-amber-500/20 text-amber-300", next: ["paid"] },
  paid: { label: "שולם", color: "bg-green-500/20 text-green-300" },
  overdue: { label: "באיחור", color: "bg-red-500/20 text-red-300", next: ["partial", "paid", "disputed"] },
  disputed: { label: "במחלוקת", color: "bg-orange-500/20 text-orange-300", next: ["verified", "cancelled"] },
  cancelled: { label: "בוטל", color: "bg-muted text-muted-foreground/60" },
};

const paymentTermsOptions = [
  { value: "immediate", label: "מיידי" }, { value: "net_7", label: "שוטף+7" },
  { value: "net_14", label: "שוטף+14" }, { value: "net_30", label: "שוטף+30" },
  { value: "net_45", label: "שוטף+45" }, { value: "net_60", label: "שוטף+60" },
  { value: "net_90", label: "שוטף+90" }, { value: "eom", label: "סוף חודש" },
];
const paymentTermsMap: Record<string, string> = Object.fromEntries(paymentTermsOptions.map(o => [o.value, o.label]));

const KNOWN_SUPPLIERS = ["אלומיטל סחר בע\"מ", "ברזלניה הצפון בע\"מ", "זכוכית פרמיום ישראל", "נירוסטה מוביל בע\"מ", "כימיקלים ואיטום דרום", "מחברים ופתרונות בע\"מ", "פרופיל מאסטר אלומיניום", "תרבות ציפוי מתקדמת", "גלגלים ומסילות מתכת", "ייצור מתכות מרכז", "חוטי ריתוך ותוספים", "כלים ומכשור תעשייתי", "גזים תעשייתיים מרכז", "ציוד מגן ובטיחות", "אריזה ולוגיסטיקה פרו", "Hydro Aluminium ASA", "Pilkington Glass Germany GmbH", "Outokumpu Stainless AB", "Sapa Extrusions Sp. z o.o.", "Guangdong Aluminium Co. Ltd"];

function calcLineTotal(li: LineItem): number {
  const gross = li.quantity * li.unitPrice;
  return Math.round((gross - gross * (li.discountPct / 100)) * 100) / 100;
}
function newLineItem(): LineItem {
  return { id: crypto.randomUUID(), description: "", quantity: 1, unitPrice: 0, discountPct: 0, lineTotal: 0 };
}

export default function SupplierInvoicesPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<SupplierInvoice[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("invoice_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SupplierInvoice | null>(null);
  const [form, setForm] = useState<any>({});
  const [lineItems, setLineItems] = useState<LineItem[]>([newLineItem()]);
  const [tableLoading, setTableLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<SupplierInvoice | null>(null);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const token = localStorage.getItem("token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = () => {
    setTableLoading(true);
    Promise.all([
      authFetch(`${API}/supplier-invoices`, { headers }).then(r => r.json()).then(d => setItems(safeArray(d))),
      authFetch(`${API}/supplier-invoices/stats`, { headers }).then(r => r.json()).then(d => setStats(d || {})),
    ]).finally(() => setTableLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    let f = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (!search || i.invoice_number?.toLowerCase().includes(search.toLowerCase()) || i.supplier_name?.toLowerCase().includes(search.toLowerCase()) || i.po_number?.toLowerCase().includes(search.toLowerCase()))
    );
    f.sort((a: any, b: any) => { const av = a[sortField], bv = b[sortField]; const cmp = typeof av === "number" ? av - bv : String(av || "").localeCompare(String(bv || "")); return sortDir === "asc" ? cmp : -cmp; });
    return f;
  }, [items, search, filterStatus, sortField, sortDir]);

  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch) return KNOWN_SUPPLIERS;
    return KNOWN_SUPPLIERS.filter(s => s.includes(supplierSearch));
  }, [supplierSearch]);

  const subtotal = useMemo(() => lineItems.reduce((s, li) => s + li.lineTotal, 0), [lineItems]);
  const vatAmount = useMemo(() => Math.round(subtotal * (VAT_PERCENT / 100) * 100) / 100, [subtotal]);
  const totalAmount = useMemo(() => Math.round((subtotal + vatAmount) * 100) / 100, [subtotal, vatAmount]);

  const openCreate = () => {
    setEditing(null);
    setForm({ invoiceDate: new Date().toISOString().slice(0, 10), status: "draft", currency: "ILS", vatRate: VAT_PERCENT, paymentTerms: "net_30", supplierName: "", notes: "" });
    setLineItems([newLineItem()]);
    setSupplierSearch("");
    setShowForm(true);
  };

  const openEdit = (r: SupplierInvoice) => {
    setEditing(r);
    const parsedLines: LineItem[] = (() => {
      try { const p = JSON.parse(r.item_description || "[]"); if (Array.isArray(p) && p.length > 0) return p; } catch {}
      if (r.item_description) return [{ id: crypto.randomUUID(), description: r.item_description, quantity: 1, unitPrice: r.subtotal, discountPct: 0, lineTotal: r.subtotal }];
      return [newLineItem()];
    })();
    setForm({
      invoiceNumber: r.invoice_number, invoiceDate: r.invoice_date?.slice(0, 10),
      dueDate: r.due_date?.slice(0, 10), supplierName: r.supplier_name,
      supplierTaxId: r.supplier_tax_id, status: r.status, currency: r.currency,
      vatRate: r.vat_rate || VAT_PERCENT, amountPaid: r.amount_paid,
      paymentTerms: r.payment_terms, poNumber: r.po_number, notes: r.notes,
    });
    setLineItems(parsedLines);
    setSupplierSearch(r.supplier_name || "");
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

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const save = async () => {
    const errors: Record<string, string> = {};
    if (!form.supplierName || !form.supplierName.trim()) errors.supplierName = "שדה חובה — יש לבחור ספק";
    if (!form.invoiceDate) errors.invoiceDate = "שדה חובה — יש להזין תאריך חשבונית";
    if (lineItems.every(li => !li.description)) errors.lines = "יש להזין לפחות פריט אחד עם תיאור";
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});
    setSaving(true);
    const payload = {
      ...form, subtotal, beforeVat: subtotal, vatRate: VAT_PERCENT, vatAmount, totalAmount,
      balanceDue: totalAmount - (Number(form.amountPaid) || 0),
      itemDescription: JSON.stringify(lineItems),
    };
    const url = editing ? `${API}/supplier-invoices/${editing.id}` : `${API}/supplier-invoices`;
    try {
      const res = await authFetch(url, { method: editing ? "PUT" : "POST", headers, body: JSON.stringify(payload) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה לא ידועה")); setSaving(false); return; }
      setShowForm(false); load();
    } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
    setSaving(false);
  };

  const remove = async (id: number) => {
    await authFetch(`${API}/supplier-invoices/${id}`, { method: "DELETE", headers });
    load();
  };

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };
  const af = [filterStatus !== "all"].filter(Boolean).length;

  const kpis = [
    { label: "סה״כ חשבוניות", value: fmtInt(stats.total || items.length), icon: FileText, color: "text-blue-400", bg: "from-blue-500/15 to-blue-600/5 border-blue-500/20" },
    { label: "ממתינות לאישור", value: fmtInt(items.filter(i => i.status === "received" || i.status === "verified").length), icon: ClipboardCheck, color: "text-indigo-400", bg: "from-indigo-500/15 to-indigo-600/5 border-indigo-500/20" },
    { label: "מאושרות", value: fmtInt(items.filter(i => i.status === "approved").length), icon: ShieldCheck, color: "text-emerald-400", bg: "from-emerald-500/15 to-emerald-600/5 border-emerald-500/20" },
    { label: "באיחור", value: fmtInt(items.filter(i => i.status === "overdue").length), icon: AlertTriangle, color: "text-red-400", bg: "from-red-500/15 to-red-600/5 border-red-500/20" },
    { label: "סה״כ חיוב", value: `₪${fmtInt(items.reduce((s, i) => s + Number(i.total_amount || 0), 0))}`, icon: DollarSign, color: "text-amber-400", bg: "from-amber-500/15 to-amber-600/5 border-amber-500/20" },
    { label: "יתרה לתשלום", value: `₪${fmtInt(items.reduce((s, i) => s + Number(i.balance_due || 0), 0))}`, icon: DollarSign, color: "text-red-400", bg: "from-red-500/15 to-red-600/5 border-red-500/20" },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Truck className="text-orange-400" /> חשבוניות ספקים</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול חשבוניות ספק, התאמה להזמנות רכש, אישור תשלום</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ImportButton apiRoute="/api/supplier-invoices" onSuccess={load} />
          <ExportDropdown data={items} headers={{ invoice_number: "מספר", invoice_date: "תאריך", supplier_name: "ספק", po_number: "הזמנה", subtotal: "סכום", vat_amount: "מע״מ", total_amount: "סה״כ", amount_paid: "שולם", balance_due: "יתרה", status: "סטטוס" }} filename="supplier_invoices" />
          <Button variant="outline" onClick={() => printPage("חשבוניות ספקים")} className="border-border text-muted-foreground gap-1"><Printer className="h-4 w-4" />הדפסה</Button>
          <Button onClick={openCreate} className="bg-orange-600 hover:bg-orange-700 gap-1"><Plus className="h-4 w-4" />חשבונית ספק חדשה</Button>
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

      {items.length > 1 && (() => {
        const months: Record<string, { month: string; total: number; vat: number; paid: number; balance: number }> = {};
        items.forEach(inv => {
          const d = inv.invoice_date?.slice(0, 7);
          if (!d) return;
          if (!months[d]) months[d] = { month: d, total: 0, vat: 0, paid: 0, balance: 0 };
          months[d].total += Number(inv.total_amount || 0);
          months[d].vat += Number(inv.vat_amount || 0);
          months[d].paid += Number(inv.amount_paid || 0);
          months[d].balance += Number(inv.balance_due || 0);
        });
        const trendData = Object.values(months).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
        const heMonth = (m: string) => { const [y, mo] = m.split("-"); return `${mo}/${y.slice(2)}`; };
        const ts = { backgroundColor: "#1a1a2e", border: "1px solid #2a2a3e", borderRadius: "8px" };
        return trendData.length > 1 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-card/80 border-border"><CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground"><TrendingUp className="h-4 w-4 text-orange-400" /> מגמת הוצאות לספקים</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendData}>
                  <defs><linearGradient id="siGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.3} /><stop offset="95%" stopColor="#f97316" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                  <XAxis dataKey="month" tickFormatter={heMonth} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#2a2a3e" }} />
                  <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#2a2a3e" }} />
                  <Tooltip formatter={(v: number) => `₪${fmt(v)}`} labelFormatter={heMonth} contentStyle={ts} />
                  <Area type="monotone" dataKey="total" stroke="#f97316" fill="url(#siGrad)" strokeWidth={2} name="סה״כ" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent></Card>
            <Card className="bg-card/80 border-border"><CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground"><BarChart3 className="h-4 w-4 text-red-400" /> שולם מול יתרה</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                  <XAxis dataKey="month" tickFormatter={heMonth} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#2a2a3e" }} />
                  <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#2a2a3e" }} />
                  <Tooltip formatter={(v: number) => `₪${fmt(v)}`} labelFormatter={heMonth} contentStyle={ts} />
                  <Legend formatter={(v: string) => <span className="text-xs text-muted-foreground">{v === "paid" ? "שולם" : "יתרה"}</span>} />
                  <Bar dataKey="paid" fill="#10b981" radius={[4, 4, 0, 0]} name="paid" />
                  <Bar dataKey="balance" fill="#ef4444" radius={[4, 4, 0, 0]} name="balance" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent></Card>
          </div>
        ) : null;
      })()}

      <Card className="bg-card/60 border-border"><CardContent className="p-3"><div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => { setSearch(e.target.value); pagination.setPage(1); }} placeholder="חיפוש לפי מספר, ספק, הזמנה..." className="pr-9 bg-input border-border text-foreground" /></div>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); pagination.setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל הסטטוסים</option>{Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        {af > 0 && <Button variant="ghost" size="sm" onClick={() => { setFilterStatus("all"); setSearch(""); }} className="text-red-400 hover:text-red-300 gap-1"><X className="h-3 w-3" />נקה</Button>}
      </div></CardContent></Card>

      <BulkActions items={filtered} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
        defaultBulkActions.duplicate(async (ids) => { for (const id of ids) { await duplicateRecord(`${API}/supplier-invoices`, id, { defaultStatus: "draft" }); } load(); }),
        defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/supplier-invoices/${id}`, { method: "DELETE", headers }))); load(); }),
        defaultBulkActions.export(async (ids) => { const sel = filtered.filter(i => ids.includes(String(i.id))); const csv = "מספר,תאריך,ספק,הזמנה,סכום,מע״מ,סה״כ,שולם,יתרה,סטטוס\n" + sel.map(i => `${i.invoice_number},${i.invoice_date?.slice(0, 10)},${i.supplier_name},${i.po_number || ""},${i.subtotal},${i.vat_amount},${i.total_amount},${i.amount_paid},${i.balance_due},${statusConfig[i.status]?.label || i.status}`).join("\n"); const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "supplier_invoices.csv"; a.click(); }),
      ]} />

      <Card className="bg-card/80 border-border"><CardContent className="p-0">
        <div className="overflow-x-auto relative">
          {tableLoading && <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center z-10"><div className="flex items-center gap-2 bg-card border border-border rounded-lg px-4 py-2 shadow-lg"><Loader2 className="w-4 h-4 animate-spin text-orange-400" /><span className="text-sm text-foreground">טוען חשבוניות ספקים...</span></div></div>}
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-background/50">
              <th className="px-3 py-3 w-10"><input type="checkbox" className="rounded" onChange={() => toggleAll(filtered)} /></th>
              {[{ key: "invoice_number", label: "מספר" }, { key: "invoice_date", label: "תאריך" }, { key: "supplier_name", label: "ספק" }, { key: "po_number", label: "הזמנת רכש" }, { key: "subtotal", label: "סכום" }, { key: "vat_amount", label: "מע״מ" }, { key: "total_amount", label: "סה״כ" }, { key: "balance_due", label: "יתרה" }, { key: "due_date", label: "לתשלום" }, { key: "status", label: "סטטוס" }].map(col => (
                <th key={col.key} className="px-3 py-3 text-right text-muted-foreground font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort(col.key)}><div className="flex items-center gap-1 text-xs">{col.label}<ArrowUpDown className="h-3 w-3" /></div></th>
              ))}
              <th className="px-3 py-3 text-center text-muted-foreground font-medium text-xs">פעולות</th>
            </tr></thead>
            <tbody>
              {!tableLoading && pagination.paginate(filtered).length === 0 ? (
                <tr><td colSpan={12} className="p-16 text-center"><div className="flex flex-col items-center gap-4">{(af > 0 || search) ? <Search className="h-12 w-12 text-muted-foreground" /> : <Truck className="h-12 w-12 text-muted-foreground" />}<p className="text-lg font-medium text-muted-foreground">{(af > 0 || search) ? "לא נמצאו תוצאות" : "עדיין אין חשבוניות ספקים"}</p><p className="text-sm text-muted-foreground/60">{(af > 0 || search) ? "נסה לשנות את הסינון" : "צור חשבונית ספק ראשונה"}</p>{!(af > 0 || search) && <Button onClick={openCreate} className="bg-orange-600 hover:bg-orange-700 gap-2 mt-2"><Plus className="h-4 w-4" />חשבונית ספק חדשה</Button>}</div></td></tr>
              ) : pagination.paginate(filtered).map(r => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setSelectedItem(r)}>
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}><input type="checkbox" checked={isSelected(String(r.id))} onChange={() => toggle(String(r.id))} className="rounded" /></td>
                  <td className="px-3 py-2.5 font-mono text-xs text-orange-400 font-bold">{r.invoice_number}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.invoice_date?.slice(0, 10)}</td>
                  <td className="px-3 py-2.5 text-foreground font-medium max-w-[140px] truncate">{r.supplier_name}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-blue-400">{r.po_number || "—"}</td>
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
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-slate-300" title="שכפול" onClick={async () => { const _dup = await duplicateRecord(`${API}/supplier-invoices`, r.id); if (_dup.ok) { load(); } else { alert("שגיאה בשכפול: " + _dup.error); } }}><Copy className="h-3.5 w-3.5" /></Button>
                      {isSuperAdmin && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400" onClick={async () => { if (await globalConfirm(`למחוק את חשבונית ספק '${r.invoice_number}'? פעולה זו אינה ניתנת לביטול.`)) remove(r.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>}
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
                <td className="px-3 py-3 font-mono text-xs text-orange-400">₪{fmt(filtered.reduce((s, r) => s + Number(r.total_amount || 0), 0))}</td>
                <td className="px-3 py-3 font-mono text-xs text-red-400">₪{fmt(filtered.reduce((s, r) => s + Number(r.balance_due || 0), 0))}</td>
                <td colSpan={3} />
              </tr></tfoot>
            )}
          </table>
        </div>
      </CardContent></Card>
      <SmartPagination pagination={pagination} />

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת חשבונית ספק" : "חשבונית ספק חדשה"}</h2>
                  {editing && <Badge className="bg-orange-500/20 text-orange-300 border-0 font-mono text-xs">{form.invoiceNumber}</Badge>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}><X className="h-4 w-4" /></Button>
              </div>
              <div className="p-4 space-y-5">
                {Object.keys(formErrors).length > 0 && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400 space-y-1">
                    {Object.values(formErrors).map((e, i) => <div key={i}>⚠ {e}</div>)}
                  </div>
                )}
                <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">פרטי חשבונית</h3></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><Label className="text-muted-foreground text-xs">תאריך *</Label><Input type="date" value={form.invoiceDate || ""} onChange={e => setForm({ ...form, invoiceDate: e.target.value })} className="bg-input border-border text-foreground mt-1" /></div>
                  <div><Label className="text-muted-foreground text-xs">לתשלום עד</Label><Input type="date" value={form.dueDate || ""} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="bg-input border-border text-foreground mt-1" /></div>
                  <div><Label className="text-muted-foreground text-xs">תנאי תשלום</Label><select value={form.paymentTerms || "net_30"} onChange={e => setForm({ ...form, paymentTerms: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">{paymentTermsOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                  <div><Label className="text-muted-foreground text-xs">סטטוס</Label><select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">{Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                </div>

                <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">פרטי ספק</h3></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="col-span-2 relative">
                    <Label className="text-muted-foreground text-xs">ספק *</Label>
                    <Input value={supplierSearch} onChange={e => { setSupplierSearch(e.target.value); setForm({ ...form, supplierName: e.target.value }); setShowSupplierDropdown(true); }} onFocus={() => setShowSupplierDropdown(true)} placeholder="הקלד שם ספק..." className="bg-input border-border text-foreground mt-1" />
                    {showSupplierDropdown && filteredSuppliers.length > 0 && (
                      <div className="absolute z-20 top-full mt-1 w-full bg-card border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                        {filteredSuppliers.map((s, i) => (
                          <button key={i} onClick={() => { setForm({ ...form, supplierName: s }); setSupplierSearch(s); setShowSupplierDropdown(false); }} className="w-full px-3 py-2 text-right text-sm text-foreground hover:bg-muted transition-colors">{s}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div><Label className="text-muted-foreground text-xs">ח.פ / ע.מ ספק</Label><Input value={form.supplierTaxId || ""} onChange={e => setForm({ ...form, supplierTaxId: e.target.value })} className="bg-input border-border text-foreground mt-1" /></div>
                  <div><Label className="text-muted-foreground text-xs">הזמנת רכש (PO)</Label><Input value={form.poNumber || ""} onChange={e => setForm({ ...form, poNumber: e.target.value })} placeholder="PO-2026-XXXX" className="bg-input border-border text-foreground mt-1 font-mono" /></div>
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
                          <td className="px-3 py-2 font-mono text-sm text-orange-400 text-right">₪{fmt(li.lineTotal)}</td>
                          <td className="px-3 py-2"><Button variant="ghost" size="sm" onClick={() => removeLineItem(li.id)} className="h-6 w-6 p-0 text-red-400 hover:text-red-300" disabled={lineItems.length <= 1}><X className="h-3 w-3" /></Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="p-2 border-t border-border"><Button variant="ghost" size="sm" onClick={addLineItem} className="text-blue-400 hover:text-blue-300 gap-1 text-xs"><Plus className="h-3 w-3" />הוסף שורה</Button></div>
                </div>

                <div className="flex justify-end">
                  <div className="w-full max-w-sm bg-input rounded-lg border border-border p-4 space-y-3">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">סכום ביניים</span><span className="text-foreground font-mono">₪{fmt(subtotal)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">מע״מ ({VAT_PERCENT}%)</span><span className="text-amber-400 font-mono">₪{fmt(vatAmount)}</span></div>
                    <hr className="border-border" />
                    <div className="flex justify-between text-lg font-bold"><span className="text-foreground">סה״כ לתשלום</span><span className="text-orange-400 font-mono">₪{fmt(totalAmount)}</span></div>
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
                <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground resize-none" placeholder="הערות לחשבונית ספק..." />
              </div>
              <div className="flex items-center gap-2 p-4 border-t border-border justify-end">
                <Button variant="outline" onClick={() => setShowForm(false)} className="border-border">ביטול</Button>
                <Button onClick={save} disabled={saving} className="bg-orange-600 hover:bg-orange-700 gap-1"><Save className="h-4 w-4" />{saving ? "שומר..." : editing ? "עדכן" : "שמור"}</Button>
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
                {selectedItem.po_number && <Badge className="bg-blue-500/20 text-blue-300 border-0 text-[10px] font-mono">PO: {selectedItem.po_number}</Badge>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedItem(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { l: "ספק", v: selectedItem.supplier_name },
                  { l: "ח.פ/ע.מ", v: selectedItem.supplier_tax_id || "—" },
                  { l: "תאריך חשבונית", v: selectedItem.invoice_date?.slice(0, 10) },
                  { l: "לתשלום עד", v: selectedItem.due_date?.slice(0, 10) || "—" },
                  { l: "תנאי תשלום", v: paymentTermsMap[selectedItem.payment_terms] || selectedItem.payment_terms || "—" },
                  { l: "הזמנת רכש", v: selectedItem.po_number || "—" },
                ].map((d, i) => (
                  <div key={i} className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">{d.l}</p><p className="text-foreground mt-1 font-medium text-sm">{d.v}</p></div>
                ))}
              </div>

              {selectedItem.po_number && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex items-center gap-3">
                  <Package className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <div><p className="text-sm text-foreground font-medium">מותאם להזמנת רכש {selectedItem.po_number}</p><p className="text-[11px] text-muted-foreground">חשבונית זו מקושרת להזמנת רכש</p></div>
                </div>
              )}

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
                        <tbody>{parsedLines.map((li: any, i: number) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="px-3 py-2 text-muted-foreground text-xs">{i + 1}</td>
                            <td className="px-3 py-2 text-foreground">{li.description}</td>
                            <td className="px-3 py-2 font-mono text-xs">{li.quantity}</td>
                            <td className="px-3 py-2 font-mono text-xs">₪{fmt(li.unitPrice)}</td>
                            <td className="px-3 py-2 font-mono text-xs">{li.discountPct || 0}%</td>
                            <td className="px-3 py-2 font-mono text-xs text-orange-400">₪{fmt(li.lineTotal)}</td>
                          </tr>
                        ))}</tbody>
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
                  <div className="flex justify-between font-bold"><span className="text-foreground">סה״כ</span><span className="text-orange-400 font-mono">₪{fmt(selectedItem.total_amount)}</span></div>
                  {Number(selectedItem.amount_paid) > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">שולם</span><span className="text-blue-400 font-mono">₪{fmt(selectedItem.amount_paid)}</span></div>}
                  {Number(selectedItem.balance_due) > 0 && <div className="flex justify-between text-sm font-bold"><span className="text-red-400">יתרה</span><span className="text-red-400 font-mono">₪{fmt(selectedItem.balance_due)}</span></div>}
                </div>
              </div>

              {selectedItem.notes && <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground mb-1">הערות</p><p className="text-sm text-foreground">{selectedItem.notes}</p></div>}

              {statusConfig[selectedItem.status]?.next && (
                <div>
                  <h3 className="text-sm font-semibold text-blue-400 mb-2">תהליך אישור</h3>
                  <div className="flex gap-2 flex-wrap">
                    {statusConfig[selectedItem.status]?.next?.map(ns => (
                      <Button key={ns} variant="outline" size="sm" className={`border-border gap-1 ${ns === "approved" ? "text-emerald-400 border-emerald-500/30" : ns === "verified" ? "text-indigo-400 border-indigo-500/30" : ns === "paid" ? "text-green-400 border-green-500/30" : ns === "cancelled" || ns === "disputed" ? "text-red-400 border-red-500/30" : "text-amber-400 border-amber-500/30"}`} onClick={async () => {
                        await authFetch(`${API}/supplier-invoices/${selectedItem.id}`, { method: "PUT", headers, body: JSON.stringify({ status: ns }) });
                        load(); setSelectedItem(null);
                      }}>
                        {ns === "received" && <Package className="h-3 w-3" />}
                        {ns === "verified" && <ClipboardCheck className="h-3 w-3" />}
                        {ns === "approved" && <ThumbsUp className="h-3 w-3" />}
                        {ns === "paid" && <CheckCircle2 className="h-3 w-3" />}
                        {ns === "partial" && <DollarSign className="h-3 w-3" />}
                        {ns === "disputed" && <AlertTriangle className="h-3 w-3" />}
                        {ns === "cancelled" && <Ban className="h-3 w-3" />}
                        {statusConfig[ns]?.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-border justify-end">
              <Button variant="outline" className="border-border gap-1" onClick={() => printPage(`חשבונית ספק ${selectedItem.invoice_number}`)}><Printer className="h-4 w-4" />הדפסה</Button>
              <Button variant="outline" className="border-purple-500/30 text-purple-300 gap-1" onClick={() => sendByEmail(`חשבונית ספק ${selectedItem.invoice_number}`, `חשבונית: ${selectedItem.invoice_number}\nספק: ${selectedItem.supplier_name}\nסכום: ₪${fmt(selectedItem.total_amount)}`)}><Mail className="h-4 w-4" />שלח במייל</Button>
              <Button onClick={() => { openEdit(selectedItem); setSelectedItem(null); }} className="bg-blue-600 hover:bg-blue-700 gap-1"><Edit2 className="h-4 w-4" />ערוך</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
