import { useState, useEffect, useMemo, Fragment } from "react";
import { DollarSign, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2, Clock, AlertTriangle, ArrowUpDown, Hash, CreditCard, TrendingUp, Users, ChevronDown, ChevronUp, Wallet, Mail, FileWarning, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Printer, Send } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import ExportDropdown from "@/components/export-dropdown";
import { globalConfirm } from "@/components/confirm-dialog";
import { printPage, sendByEmail, generateEmailBody } from "@/lib/print-utils";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { useApiAction, ActionButton } from "@/hooks/use-api-action";
import { authFetch } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import { VAT_RATE } from "@/utils/money";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const statusMap: Record<string, { label: string; color: string }> = {
  open: { label: "פתוח", color: "bg-blue-100 text-blue-700" },
  partial: { label: "חלקי", color: "bg-yellow-100 text-yellow-700" },
  paid: { label: "נגבה", color: "bg-green-100 text-green-700" },
  overdue: { label: "באיחור", color: "bg-red-100 text-red-700" },
  written_off: { label: "נמחק", color: "bg-muted/50 text-muted-foreground" },
  cancelled: { label: "בוטל", color: "bg-muted/50 text-muted-foreground" },
};
const categoryMap: Record<string, string> = { products: "מוצרים", services: "שירותים", installation: "התקנה", maintenance: "תחזוקה", consulting: "ייעוץ", custom: "מותאם אישית", other: "אחר" };
const paymentMethodMap: Record<string, string> = { bank_transfer: "העברה בנקאית", check: "צ'ק", cash: "מזומן", credit_card: "כרטיס אשראי", standing_order: "הוראת קבע" };
const termsMap: Record<string, string> = { net_30: "שוטף+30", net_45: "שוטף+45", net_60: "שוטף+60", net_90: "שוטף+90", eom: "סוף חודש", immediate: "מיידי", cod: "מזומן במסירה" };
const dunningLabels: Record<number, { label: string; color: string }> = { 0: { label: "ללא", color: "text-muted-foreground" }, 1: { label: "תזכורת 1", color: "text-yellow-600" }, 2: { label: "התראה 2", color: "text-orange-600" }, 3: { label: "דרישה 3", color: "text-red-600" }, 4: { label: "משפטי", color: "text-red-800" } };

type TabType = "invoices" | "aging" | "customers" | "dunning";

export default function AccountsReceivablePage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [agingData, setAgingData] = useState<any[]>([]);
  const [topCustomers, setTopCustomers] = useState<any[]>([]);
  const [dunningLetters, setDunningLetters] = useState<any[]>([]);
  const [search, setSearch] = useState(""); const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("due_date"); const [sortDir, setSortDir] = useState<"asc"|"desc">("asc");
  const [showForm, setShowForm] = useState(false); const [editing, setEditing] = useState<any>(null); const [form, setForm] = useState<any>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [entryDunning, setEntryDunning] = useState<any[]>([]);
  const [showCollectForm, setShowCollectForm] = useState(false); const [collectForm, setCollectForm] = useState<any>({});
  const [collectingId, setCollectingId] = useState<number | null>(null);
  const [showDunningForm, setShowDunningForm] = useState(false); const [dunningTarget, setDunningTarget] = useState<any>(null);
  const [tab, setTab] = useState<TabType>("invoices");
  const [tableLoading, setTableLoading] = useState(true);
  const [arDetailView, setArDetailView] = useState<any>(null);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const { executeSave, executeDelete, loading: actionLoading } = useApiAction();
  const token = localStorage.getItem("token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = () => {
    setTableLoading(true);
    Promise.all([
      authFetch(`${API}/ar`, { headers }).then(r => r.json()).then(d => setItems(safeArray(d))),
      authFetch(`${API}/ar/stats`, { headers }).then(r => r.json()).then(d => setStats(d || {})),
      authFetch(`${API}/ar/aging`, { headers }).then(r => r.json()).then(d => setAgingData(safeArray(d))),
      authFetch(`${API}/ar/top-customers`, { headers }).then(r => r.json()).then(d => setTopCustomers(safeArray(d))),
      authFetch(`${API}/ar/dunning`, { headers }).then(r => r.json()).then(d => setDunningLetters(safeArray(d))),
    ]).finally(() => setTableLoading(false));
  };
  useEffect(load, []);

  const loadDetails = async (arId: number) => {
    if (expandedId === arId) { setExpandedId(null); setReceipts([]); setEntryDunning([]); return; }
    const [r1, r2] = await Promise.all([
      authFetch(`${API}/ar/${arId}/receipts`, { headers }).then(r => r.json()),
      authFetch(`${API}/ar/${arId}/dunning`, { headers }).then(r => r.json()),
    ]);
    setReceipts(safeArray(r1)); setEntryDunning(safeArray(r2));
    setExpandedId(arId);
  };

  const filtered = useMemo(() => {
    let f = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (!search || i.invoice_number?.toLowerCase().includes(search.toLowerCase()) || i.customer_name?.toLowerCase().includes(search.toLowerCase()) || i.ar_number?.toLowerCase().includes(search.toLowerCase()))
    );
    f.sort((a: any, b: any) => { const av = a[sortField], bv = b[sortField]; const cmp = typeof av === "number" ? av - bv : String(av||"").localeCompare(String(bv||"")); return sortDir === "asc" ? cmp : -cmp; });
    return f;
  }, [items, search, filterStatus, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ invoiceDate: new Date().toISOString().slice(0,10), currency: "ILS", status: "open", priority: "normal", dueDate: new Date(Date.now() + 30*86400000).toISOString().slice(0,10), paymentTerms: "net_30" });
    setShowForm(true);
  };
  const openEdit = (r: any) => {
    setEditing(r);
    setForm({ invoiceNumber: r.invoice_number, customerName: r.customer_name, customerPhone: r.customer_phone, customerEmail: r.customer_email, invoiceDate: r.invoice_date?.slice(0,10), dueDate: r.due_date?.slice(0,10), amount: r.amount, vatAmount: r.vat_amount, netAmount: r.net_amount, currency: r.currency, status: r.status, paymentTerms: r.payment_terms, description: r.description, category: r.category, notes: r.notes, priority: r.priority, glAccount: r.gl_account, costCenter: r.cost_center, department: r.department, projectName: r.project_name, salesperson: r.salesperson, contactPerson: r.contact_person, contactPhone: r.contact_phone, withholdingTax: r.withholding_tax, discountPercent: r.discount_percent, creditLimit: r.credit_limit, orderNumber: r.order_number, deliveryNote: r.delivery_note });
    setShowForm(true);
  };
  const save = async () => {
    const url = editing ? `${API}/ar/${editing.id}` : `${API}/ar`;
    await executeSave(() => fetch(url, { method: editing ? "PUT" : "POST", headers, body: JSON.stringify(form) }), !!editing, { successMessage: editing ? "חשבונית עודכנה" : "חשבונית נוצרה", onSuccess: () => { setShowForm(false); load(); } });
  };
  const remove = async (id: number) => {
    await executeDelete(() => authFetch(`${API}/ar/${id}`, { method: "DELETE", headers }), { confirm: "למחוק חשבונית?", successMessage: "חשבונית נמחקה", onSuccess: load });
  };

  const openCollect = (r: any) => { setCollectingId(r.id); setCollectForm({ amount: r.balance_due, receiptDate: new Date().toISOString().slice(0,10), paymentMethod: "bank_transfer" }); setShowCollectForm(true); };
  const submitCollect = async () => {
    if (!collectingId) return;
    await authFetch(`${API}/ar/${collectingId}/collect`, { method: "POST", headers, body: JSON.stringify(collectForm) });
    setShowCollectForm(false); setCollectingId(null);
    if (expandedId === collectingId) loadDetails(collectingId);
    load();
  };

  const openDunning = (r: any) => { setDunningTarget(r); setShowDunningForm(true); };
  const submitDunning = async () => {
    if (!dunningTarget) return;
    await authFetch(`${API}/ar/${dunningTarget.id}/dunning`, { method: "POST", headers, body: JSON.stringify({ status: "draft" }) });
    setShowDunningForm(false); setDunningTarget(null);
    if (expandedId === dunningTarget.id) loadDetails(dunningTarget.id);
    load();
  };

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("asc"); } };
  const daysOverdue = (dueDate: string) => { const diff = Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000); return diff > 0 ? diff : 0; };

  const kpis = [
    { label: "סה\"כ חשבוניות", value: fmt(stats.total || 0), icon: Hash, color: "text-blue-600" },
    { label: "פתוחות", value: fmt(stats.open_count || 0), icon: Clock, color: "text-blue-600" },
    { label: "באיחור", value: fmt(stats.overdue_count || 0), icon: AlertTriangle, color: "text-red-600" },
    { label: "נגבו", value: fmt(stats.paid_count || 0), icon: CheckCircle2, color: "text-green-600" },
    { label: "יתרת חוב", value: `₪${fmt(stats.total_balance || 0)}`, icon: DollarSign, color: "text-red-600" },
    { label: "נגבה", value: `₪${fmt(stats.total_collected || 0)}`, icon: Wallet, color: "text-green-600" },
    { label: "ימי איחור ממוצע", value: fmt(Math.round(stats.avg_days_overdue || 0)), icon: Clock, color: "text-orange-600" },
    { label: "לקוחות", value: fmt(stats.customer_count || 0), icon: Users, color: "text-indigo-600" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><TrendingUp className="text-green-600" /> חובות מלקוחות Enterprise (AR)</h1>
          <p className="text-muted-foreground mt-1">ניהול חשבוניות לקוחות, גביה, גיול חובות, מכתבי התראה (Dunning)</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={items} headers={{ ar_number: "AR#", invoice_number: "חשבונית", customer_name: "לקוח", amount: "סכום", paid_amount: "נגבה", balance_due: "יתרה", due_date: "לתשלום", status: "סטטוס", dunning_level: "דרגת התראה" }} filename={"accounts_receivable"} />
          <button onClick={() => printPage("חובות מלקוחות")} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm"><Printer size={16} /> הדפסה</button>
          <button onClick={() => sendByEmail("חובות מלקוחות - טכנו-כל עוזי", generateEmailBody("חובות מלקוחות", items, { ar_number: "AR#", customer_name: "לקוח", amount: "סכום", balance_due: "יתרה", status: "סטטוס" }))} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm"><Send size={16} /> שליחה</button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-green-600 text-foreground px-3 py-2 rounded-lg hover:bg-green-700 shadow-lg text-sm"><Plus size={16} /> חשבונית חדשה</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpis.map((kpi, i) => (<motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card rounded-xl shadow-sm border p-3"><kpi.icon className={`${kpi.color} mb-1`} size={20} /><div className="text-lg font-bold">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div></motion.div>))}
      </div>

      {items.length > 1 && (() => {
        const now = new Date();
        const cm = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
        const pm = (() => { const d = new Date(now.getFullYear(), now.getMonth()-1, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; })();
        const cq = Math.floor(now.getMonth()/3);
        const qMonths = (q: number, y: number) => [0,1,2].map(i => `${y}-${String(q*3+i+1).padStart(2,"0")}`);
        const cqMonths = qMonths(cq, now.getFullYear());
        const pqMonths = cq > 0 ? qMonths(cq-1, now.getFullYear()) : qMonths(3, now.getFullYear()-1);
        const sumPeriod = (months: string[]) => items.filter(i => months.some(m => (i.invoice_date || i.due_date)?.startsWith(m))).reduce((a, i) => ({ total: a.total + Number(i.amount||0), paid: a.paid + Number(i.paid_amount||0), balance: a.balance + Number(i.balance_due||0), count: a.count + 1 }), { total: 0, paid: 0, balance: 0, count: 0 });
        const curM = sumPeriod([cm]), prevM = sumPeriod([pm]);
        const curQ = sumPeriod(cqMonths), prevQ = sumPeriod(pqMonths);
        const pctChange = (c: number, p: number) => p === 0 ? (c > 0 ? 100 : 0) : Math.round(((c - p) / p) * 100);
        const Arrow = ({ val }: { val: number }) => val > 0 ? <span className="text-green-600 text-xs font-bold">▲ +{val}%</span> : val < 0 ? <span className="text-red-600 text-xs font-bold">▼ {val}%</span> : <span className="text-muted-foreground text-xs">—</span>;
        return (
          <div className="bg-card rounded-xl shadow-sm border p-4">
            <div className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">📊 השוואת תקופות</div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                <div className="text-[10px] text-muted-foreground mb-1">חוב: חודש נוכחי מול קודם</div>
                <div className="text-lg font-bold">₪{fmt(curM.total)}</div>
                <div className="text-xs text-muted-foreground">מול ₪{fmt(prevM.total)}</div>
                <Arrow val={pctChange(curM.total, prevM.total)} />
              </div>
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                <div className="text-[10px] text-muted-foreground mb-1">גביה: חודש נוכחי מול קודם</div>
                <div className="text-lg font-bold text-blue-700">₪{fmt(curM.paid)}</div>
                <div className="text-xs text-muted-foreground">מול ₪{fmt(prevM.paid)}</div>
                <Arrow val={pctChange(curM.paid, prevM.paid)} />
              </div>
              <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                <div className="text-[10px] text-muted-foreground mb-1">רבעון נוכחי מול קודם</div>
                <div className="text-lg font-bold">₪{fmt(curQ.total)}</div>
                <div className="text-xs text-muted-foreground">מול ₪{fmt(prevQ.total)}</div>
                <Arrow val={pctChange(curQ.total, prevQ.total)} />
              </div>
              <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
                <div className="text-[10px] text-muted-foreground mb-1">כמות: חודש נוכחי מול קודם</div>
                <div className="text-lg font-bold">{curM.count}</div>
                <div className="text-xs text-muted-foreground">מול {prevM.count}</div>
                <Arrow val={pctChange(curM.count, prevM.count)} />
              </div>
            </div>
          </div>
        );
      })()}

      {items.length > 0 && (() => {
        const months: Record<string, { month: string; amount: number; paid: number; balance: number; count: number }> = {};
        items.forEach(r => {
          const d = (r.due_date || r.invoice_date || r.created_at)?.slice(0, 7);
          if (!d) return;
          if (!months[d]) months[d] = { month: d, amount: 0, paid: 0, balance: 0, count: 0 };
          months[d].amount += Number(r.amount || 0);
          months[d].paid += Number(r.paid_amount || 0);
          months[d].balance += Number(r.balance_due || 0);
          months[d].count += 1;
        });
        const trendData = Object.values(months).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
        const heMonth = (m: string) => { const [y, mo] = m.split("-"); return `${mo}/${y.slice(2)}`; };
        return trendData.length > 1 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card rounded-xl shadow-sm border p-4">
              <div className="flex items-center gap-2 mb-3 text-sm font-bold text-foreground"><TrendingUp size={16} className="text-green-600" /> חובות לפי מועד פירעון</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="arGradAmt" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#16a34a" stopOpacity={0.3}/><stop offset="95%" stopColor="#16a34a" stopOpacity={0}/></linearGradient>
                    <linearGradient id="arGradPaid" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/><stop offset="95%" stopColor="#2563eb" stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tickFormatter={heMonth} tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v: number) => `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => `₪${fmt(v)}`} labelFormatter={heMonth} />
                  <Legend formatter={(v: string) => v === "amount" ? "סכום חוב" : v === "paid" ? "נגבה" : v} />
                  <Area type="monotone" dataKey="amount" stroke="#16a34a" fill="url(#arGradAmt)" strokeWidth={2} name="amount" />
                  <Area type="monotone" dataKey="paid" stroke="#2563eb" fill="url(#arGradPaid)" strokeWidth={2} name="paid" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-card rounded-xl shadow-sm border p-4">
              <div className="flex items-center gap-2 mb-3 text-sm font-bold text-foreground"><DollarSign size={16} className="text-red-600" /> יתרות פתוחות לפי חודש</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tickFormatter={heMonth} tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v: number) => `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => `₪${fmt(v)}`} labelFormatter={heMonth} />
                  <Bar dataKey="balance" fill="#ef4444" radius={[4, 4, 0, 0]} name="יתרה" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null;
      })()}

      <div className="flex gap-2 border-b">
        {([["invoices", "חשבוניות"], ["aging", "גיול חובות"], ["customers", "לקוחות מובילים"], ["dunning", "מכתבי התראה"]] as [TabType, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === key ? 'border-green-600 text-green-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{label}</button>
        ))}
      </div>

      {tab === "invoices" && (<>
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-0 sm:min-w-[200px]"><Search className="absolute right-3 top-2.5 text-muted-foreground" size={18} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לקוח/חשבונית/AR..." className="w-full pr-10 pl-4 py-2 border rounded-lg" /></div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2"><option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        </div>
        <BulkActions selectedIds={selectedIds} onClear={clear} entityName="חשבוניות לקוחות" actions={defaultBulkActions(selectedIds, clear, load, `${API}/ar`)} />
        <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b"><tr>
              <th className="px-2 py-3 w-8"><BulkCheckbox checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered)} partial={selectedIds.length > 0 && selectedIds.length < filtered.length} /></th>
              <th className="px-2 py-3 w-8"></th>
              {[{ key: "ar_number", label: "AR#" }, { key: "invoice_number", label: "חשבונית" }, { key: "customer_name", label: "לקוח" }, { key: "amount", label: "סכום" }, { key: "paid_amount", label: "נגבה" }, { key: "balance_due", label: "יתרה" }, { key: "due_date", label: "לתשלום" }, { key: "dunning_level", label: "התראה" }, { key: "status", label: "סטטוס" }].map(col => (
                <th key={col.key} className="px-2 py-3 text-right cursor-pointer hover:bg-muted/50 text-xs" onClick={() => toggleSort(col.key)}><div className="flex items-center gap-1">{col.label} <ArrowUpDown size={10} /></div></th>
              ))}
              <th className="px-2 py-3 text-right text-xs">פעולות</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan={11} className="text-center py-8 text-muted-foreground">אין חשבוניות לקוחות</td></tr> :
              pagination.paginate(filtered).map(r => {
                const overdue = daysOverdue(r.due_date);
                const effectiveStatus = (r.status === 'open' || r.status === 'partial') && overdue > 0 ? 'overdue' : r.status;
                return (
                <Fragment key={r.id}>
                  <tr className={`border-b hover:bg-green-50/30 ${expandedId === r.id ? 'bg-green-50/50' : ''} ${overdue > 0 && effectiveStatus === 'overdue' ? 'bg-red-50/20' : ''}`}>
                    <td className="px-2 py-2"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                    <td className="px-2 py-2"><button onClick={() => loadDetails(r.id)} className="p-1 hover:bg-blue-500/10 rounded">{expandedId === r.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button></td>
                    <td className="px-2 py-2 font-mono text-green-600 font-bold text-xs cursor-pointer hover:underline" onClick={() => { setArDetailView(r); setDetailTab("details"); }}>{r.ar_number || "-"}</td>
                    <td className="px-2 py-2 text-xs">{r.invoice_number}</td>
                    <td className="px-2 py-2 font-medium">{r.customer_name}</td>
                    <td className="px-2 py-2 font-bold">₪{fmt(r.amount)}</td>
                    <td className="px-2 py-2 text-green-600">₪{fmt(r.paid_amount)}</td>
                    <td className="px-2 py-2 text-red-600 font-bold">₪{fmt(r.balance_due)}</td>
                    <td className="px-2 py-2 text-xs">
                      <div>{r.due_date?.slice(0,10)}</div>
                      {overdue > 0 && <div className="text-red-500 text-[10px]">{overdue} ימים</div>}
                    </td>
                    <td className="px-2 py-2"><span className={`text-xs font-medium ${dunningLabels[r.dunning_level || 0]?.color || ''}`}>{dunningLabels[r.dunning_level || 0]?.label || '-'}</span></td>
                    <td className="px-2 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${statusMap[effectiveStatus]?.color || 'bg-muted/50'}`}>{statusMap[effectiveStatus]?.label || r.status}</span></td>
                    <td className="px-2 py-2">
                      <div className="flex gap-1">
                        {r.status !== 'paid' && r.status !== 'cancelled' && (<>
                          <button onClick={() => openCollect(r)} className="p-1 hover:bg-green-100 rounded text-green-600" title="גביה"><CreditCard size={13} /></button>
                          {overdue > 0 && !r.dunning_blocked && <button onClick={() => openDunning(r)} className="p-1 hover:bg-orange-100 rounded text-orange-600" title="מכתב התראה"><Mail size={13} /></button>}
                        </>)}
                        <button onClick={() => openEdit(r)} className="p-1 hover:bg-blue-500/10 rounded"><Edit2 size={13} /></button>
                        {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.customer_name || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1 hover:bg-red-500/10 rounded text-red-500"><Trash2 size={13} /></button>}
                      </div>
                    </td>
                  </tr>
                  {expandedId === r.id && (
                    <tr><td colSpan={11} className="p-0">
                      <div className="bg-green-50/30 border-t border-green-100 px-6 py-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
                          {r.customer_phone && <div><span className="text-muted-foreground">טלפון:</span> {r.customer_phone}</div>}
                          {r.customer_email && <div><span className="text-muted-foreground">אימייל:</span> {r.customer_email}</div>}
                          {r.salesperson && <div><span className="text-muted-foreground">איש מכירות:</span> {r.salesperson}</div>}
                          {r.cost_center && <div><span className="text-muted-foreground">מ.עלות:</span> {r.cost_center}</div>}
                          {r.payment_terms && <div><span className="text-muted-foreground">תנאים:</span> {termsMap[r.payment_terms] || r.payment_terms}</div>}
                          {r.order_number && <div><span className="text-muted-foreground">הזמנה:</span> {r.order_number}</div>}
                          {r.delivery_note && <div><span className="text-muted-foreground">ת.משלוח:</span> {r.delivery_note}</div>}
                          {Number(r.vat_amount) > 0 && <div><span className="text-muted-foreground">מע"מ:</span> ₪{fmt(r.vat_amount)}</div>}
                          {Number(r.credit_limit) > 0 && <div><span className="text-muted-foreground">מסגרת:</span> ₪{fmt(r.credit_limit)}</div>}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <div className="text-xs font-bold text-green-600 mb-2 flex items-center gap-1"><CreditCard size={14} /> קבלות/גביה</div>
                            {receipts.length === 0 ? <div className="text-xs text-muted-foreground">אין קבלות</div> :
                            <table className="w-full text-xs"><thead><tr className="border-b border-green-200"><th className="text-right py-1 px-2">מספר</th><th className="text-right py-1 px-2">תאריך</th><th className="text-right py-1 px-2">סכום</th><th className="text-right py-1 px-2">אמצעי</th></tr></thead>
                            <tbody>{receipts.map(p => (<tr key={p.id} className="border-b border-green-100/50"><td className="py-1 px-2 font-mono text-green-600">{p.receipt_number}</td><td className="py-1 px-2">{p.receipt_date?.slice(0,10)}</td><td className="py-1 px-2 font-bold text-green-600">₪{fmt(p.amount)}</td><td className="py-1 px-2">{paymentMethodMap[p.payment_method] || p.payment_method || "-"}</td></tr>))}</tbody></table>}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-orange-600 mb-2 flex items-center gap-1"><FileWarning size={14} /> מכתבי התראה</div>
                            {entryDunning.length === 0 ? <div className="text-xs text-muted-foreground">אין מכתבי התראה</div> :
                            <table className="w-full text-xs"><thead><tr className="border-b border-orange-200"><th className="text-right py-1 px-2">מספר</th><th className="text-right py-1 px-2">דרגה</th><th className="text-right py-1 px-2">תאריך</th><th className="text-right py-1 px-2">סכום</th><th className="text-right py-1 px-2">סטטוס</th></tr></thead>
                            <tbody>{entryDunning.map(d => (<tr key={d.id} className="border-b border-orange-100/50"><td className="py-1 px-2 font-mono text-orange-600">{d.dunning_number}</td><td className="py-1 px-2">{dunningLabels[d.dunning_level]?.label}</td><td className="py-1 px-2">{d.letter_date?.slice(0,10)}</td><td className="py-1 px-2 font-bold">₪{fmt(d.total_amount)}</td><td className="py-1 px-2"><span className={`px-1.5 py-0.5 rounded text-[10px] ${d.status === 'sent' ? 'bg-green-100 text-green-700' : d.status === 'draft' ? 'bg-muted/50' : 'bg-blue-100 text-blue-700'}`}>{d.status === 'sent' ? 'נשלח' : d.status === 'draft' ? 'טיוטה' : d.status}</span></td></tr>))}</tbody></table>}
                          </div>
                        </div>
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              );})}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-muted/50 border-t-2 border-border font-bold text-sm">
                <tr>
                  <td className="px-2 py-3"></td>
                  <td className="px-2 py-3" colSpan={3}>סה"כ ({filtered.length} שורות)</td>
                  <td className="px-2 py-3">₪{fmt(filtered.reduce((s, r) => s + Number(r.amount || 0), 0))}</td>
                  <td className="px-2 py-3 text-green-600">₪{fmt(filtered.reduce((s, r) => s + Number(r.paid_amount || 0), 0))}</td>
                  <td className="px-2 py-3 text-red-600">₪{fmt(filtered.reduce((s, r) => s + Number(r.balance_due || 0), 0))}</td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <SmartPagination pagination={pagination} />
      </>)}

      {tab === "aging" && (
        <div className="space-y-4">
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: "שוטף", value: `₪${fmt(stats.current_due || 0)}`, color: "bg-green-50 border-green-200" },
              { label: "30 יום", value: `₪${fmt(stats.overdue_30 || 0)}`, color: "bg-yellow-50 border-yellow-200" },
              { label: "60 יום", value: `₪${fmt(stats.overdue_60 || 0)}`, color: "bg-orange-50 border-orange-200" },
              { label: "90 יום", value: `₪${fmt(stats.overdue_90 || 0)}`, color: "bg-red-50 border-red-200" },
              { label: "120+ יום", value: `₪${fmt(stats.overdue_120_plus || 0)}`, color: "bg-red-100 border-red-300" },
            ].map((b, i) => <div key={i} className={`${b.color} rounded-xl border p-4 text-center`}><div className="text-xs text-muted-foreground mb-1">{b.label}</div><div className="text-lg font-bold">{b.value}</div></div>)}
          </div>
          <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b"><tr>
                <th className="px-3 py-3 text-right">לקוח</th><th className="px-3 py-3 text-right">חשבוניות</th>
                <th className="px-3 py-3 text-right">סה"כ יתרה</th><th className="px-3 py-3 text-right text-green-600">שוטף</th>
                <th className="px-3 py-3 text-right text-yellow-600">30</th><th className="px-3 py-3 text-right text-orange-600">60</th>
                <th className="px-3 py-3 text-right text-red-600">90</th><th className="px-3 py-3 text-right text-red-700">120+</th>
                <th className="px-3 py-3 text-right">התראה</th>
              </tr></thead>
              <tbody>
                {agingData.length === 0 ? <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">אין נתוני גיול</td></tr> :
                agingData.map((r, i) => (
                  <tr key={i} className="border-b hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{r.customer_name}</td>
                    <td className="px-3 py-2 text-center">{r.invoice_count}</td>
                    <td className="px-3 py-2 font-bold text-red-600">₪{fmt(r.total_balance)}</td>
                    <td className="px-3 py-2 text-green-600">{Number(r.current_amount) > 0 ? `₪${fmt(r.current_amount)}` : "-"}</td>
                    <td className="px-3 py-2 text-yellow-600">{Number(r.days_30) > 0 ? `₪${fmt(r.days_30)}` : "-"}</td>
                    <td className="px-3 py-2 text-orange-600">{Number(r.days_60) > 0 ? `₪${fmt(r.days_60)}` : "-"}</td>
                    <td className="px-3 py-2 text-red-600">{Number(r.days_90) > 0 ? `₪${fmt(r.days_90)}` : "-"}</td>
                    <td className="px-3 py-2 text-red-700 font-bold">{Number(r.days_120_plus) > 0 ? `₪${fmt(r.days_120_plus)}` : "-"}</td>
                    <td className="px-3 py-2"><span className={`text-xs ${dunningLabels[r.max_dunning_level || 0]?.color}`}>{dunningLabels[r.max_dunning_level || 0]?.label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "customers" && (
        <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b"><tr>
              <th className="px-3 py-3 text-right">#</th><th className="px-3 py-3 text-right">לקוח</th>
              <th className="px-3 py-3 text-right">חשבוניות</th><th className="px-3 py-3 text-right">סה"כ</th>
              <th className="px-3 py-3 text-right">נגבה</th><th className="px-3 py-3 text-right">יתרה</th>
              <th className="px-3 py-3 text-right">% גביה</th>
            </tr></thead>
            <tbody>
              {topCustomers.map((r, i) => (
                <tr key={i} className="border-b hover:bg-muted/30">
                  <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">{r.customer_name}</td>
                  <td className="px-3 py-2 text-center">{r.invoice_count}</td>
                  <td className="px-3 py-2 font-bold">₪{fmt(r.total_amount)}</td>
                  <td className="px-3 py-2 text-green-600">₪{fmt(r.total_collected)}</td>
                  <td className="px-3 py-2 text-red-600 font-bold">₪{fmt(r.total_balance)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-muted/50 rounded-full h-2"><div className="bg-green-500 h-2 rounded-full" style={{ width: `${Math.min(Number(r.collection_rate), 100)}%` }}></div></div>
                      <span className="text-xs">{r.collection_rate}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "dunning" && (
        <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b"><tr>
              <th className="px-3 py-3 text-right">מספר</th><th className="px-3 py-3 text-right">לקוח</th>
              <th className="px-3 py-3 text-right">דרגה</th><th className="px-3 py-3 text-right">תאריך</th>
              <th className="px-3 py-3 text-right">ימי איחור</th><th className="px-3 py-3 text-right">סכום חוב</th>
              <th className="px-3 py-3 text-right">ריבית</th><th className="px-3 py-3 text-right">סה"כ</th>
              <th className="px-3 py-3 text-right">סטטוס</th>
            </tr></thead>
            <tbody>
              {dunningLetters.length === 0 ? <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">אין מכתבי התראה</td></tr> :
              dunningLetters.map(d => (
                <tr key={d.id} className="border-b hover:bg-orange-50/30">
                  <td className="px-3 py-2 font-mono text-orange-600 font-bold text-xs">{d.dunning_number}</td>
                  <td className="px-3 py-2 font-medium">{d.customer_name}</td>
                  <td className="px-3 py-2"><span className={`font-medium ${dunningLabels[d.dunning_level]?.color}`}>{dunningLabels[d.dunning_level]?.label}</span></td>
                  <td className="px-3 py-2">{d.letter_date?.slice(0,10)}</td>
                  <td className="px-3 py-2 text-red-500">{d.days_overdue} ימים</td>
                  <td className="px-3 py-2">₪{fmt(d.due_amount)}</td>
                  <td className="px-3 py-2 text-orange-600">{Number(d.interest_amount) > 0 ? `₪${fmt(d.interest_amount)}` : "-"}</td>
                  <td className="px-3 py-2 font-bold text-red-600">₪{fmt(d.total_amount)}</td>
                  <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${d.status === 'sent' ? 'bg-green-100 text-green-700' : d.status === 'draft' ? 'bg-muted/50 text-muted-foreground' : 'bg-blue-100 text-blue-700'}`}>{d.status === 'sent' ? 'נשלח' : d.status === 'draft' ? 'טיוטה' : d.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">{editing ? "עריכת חשבונית לקוח" : "חשבונית לקוח חדשה"}</h2>
                <button onClick={() => setShowForm(false)}><X size={20} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium mb-1">שם לקוח *</label><input value={form.customerName || ""} onChange={e => setForm({ ...form, customerName: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">טלפון</label><input value={form.customerPhone || ""} onChange={e => setForm({ ...form, customerPhone: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">אימייל</label><input type="email" value={form.customerEmail || ""} onChange={e => setForm({ ...form, customerEmail: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מספר חשבונית *</label><input value={form.invoiceNumber || ""} onChange={e => setForm({ ...form, invoiceNumber: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">תאריך חשבונית *</label><input type="date" value={form.invoiceDate || ""} onChange={e => setForm({ ...form, invoiceDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">תאריך לתשלום *</label><input type="date" value={form.dueDate || ""} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">סכום כולל (₪) *</label><input type="number" step="0.01" value={form.amount || ""} onChange={e => { const amt = Number(e.target.value) || 0; setForm({ ...form, amount: e.target.value, vatAmount: (amt * VAT_RATE / (1 + VAT_RATE)).toFixed(2), netAmount: (amt / (1 + VAT_RATE)).toFixed(2) }); }} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מע"מ (₪)</label><input type="number" step="0.01" value={form.vatAmount || ""} onChange={e => setForm({ ...form, vatAmount: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">סכום נטו (₪)</label><input type="number" step="0.01" value={form.netAmount || ""} onChange={e => setForm({ ...form, netAmount: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">תנאי תשלום</label><select value={form.paymentTerms || ""} onChange={e => setForm({ ...form, paymentTerms: e.target.value })} className="w-full border rounded-lg px-3 py-2"><option value="">ללא</option>{Object.entries(termsMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">קטגוריה</label><select value={form.category || ""} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full border rounded-lg px-3 py-2"><option value="">ללא</option>{Object.entries(categoryMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">מטבע</label><select value={form.currency || "ILS"} onChange={e => setForm({ ...form, currency: e.target.value })} className="w-full border rounded-lg px-3 py-2"><option value="ILS">₪ שקל</option><option value="USD">$ דולר</option><option value="EUR">€ אירו</option></select></div>
                <div><label className="block text-sm font-medium mb-1">איש מכירות</label><input value={form.salesperson || ""} onChange={e => setForm({ ...form, salesperson: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מרכז עלות</label><input value={form.costCenter || ""} onChange={e => setForm({ ...form, costCenter: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מחלקה</label><input value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מסגרת אשראי (₪)</label><input type="number" step="0.01" value={form.creditLimit || ""} onChange={e => setForm({ ...form, creditLimit: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מס' הזמנה</label><input value={form.orderNumber || ""} onChange={e => setForm({ ...form, orderNumber: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">ת. משלוח</label><input value={form.deliveryNote || ""} onChange={e => setForm({ ...form, deliveryNote: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div className="col-span-3"><label className="block text-sm font-medium mb-1">תיאור</label><input value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div className="col-span-3"><label className="block text-sm font-medium mb-1">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2" /></div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={save} className="flex items-center gap-2 bg-green-600 text-foreground px-6 py-2 rounded-lg hover:bg-green-700"><Save size={16} /> {editing ? "עדכון" : "שמירה"}</button>
                <button onClick={() => setShowForm(false)} className="px-6 py-2 border rounded-lg hover:bg-muted/30">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCollectForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCollectForm(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2"><CreditCard className="text-green-600" /> רישום גביה</h2>
                <button onClick={() => setShowCollectForm(false)}><X size={20} /></button>
              </div>
              <div className="space-y-4">
                <div><label className="block text-sm font-medium mb-1">סכום גביה (₪) *</label><input type="number" step="0.01" value={collectForm.amount || ""} onChange={e => setCollectForm({ ...collectForm, amount: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-lg font-bold text-green-600" /></div>
                <div><label className="block text-sm font-medium mb-1">תאריך קבלה</label><input type="date" value={collectForm.receiptDate || ""} onChange={e => setCollectForm({ ...collectForm, receiptDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">אמצעי תשלום</label><select value={collectForm.paymentMethod || ""} onChange={e => setCollectForm({ ...collectForm, paymentMethod: e.target.value })} className="w-full border rounded-lg px-3 py-2"><option value="">ללא</option>{Object.entries(paymentMethodMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                {collectForm.paymentMethod === 'check' && <>
                  <div><label className="block text-sm font-medium mb-1">מספר צ'ק</label><input value={collectForm.checkNumber || ""} onChange={e => setCollectForm({ ...collectForm, checkNumber: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                  <div><label className="block text-sm font-medium mb-1">תאריך צ'ק</label><input type="date" value={collectForm.checkDate || ""} onChange={e => setCollectForm({ ...collectForm, checkDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                </>}
                <div><label className="block text-sm font-medium mb-1">אסמכתא</label><input value={collectForm.reference || ""} onChange={e => setCollectForm({ ...collectForm, reference: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={submitCollect} className="flex items-center gap-2 bg-green-600 text-foreground px-6 py-2 rounded-lg hover:bg-green-700"><Save size={16} /> גבה</button>
                <button onClick={() => setShowCollectForm(false)} className="px-6 py-2 border rounded-lg hover:bg-muted/30">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDunningForm && dunningTarget && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowDunningForm(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2"><FileWarning className="text-orange-600" /> מכתב התראה חדש</h2>
                <button onClick={() => setShowDunningForm(false)}><X size={20} /></button>
              </div>
              <div className="space-y-3 text-sm">
                <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
                  <div><strong>לקוח:</strong> {dunningTarget.customer_name}</div>
                  <div><strong>חשבונית:</strong> {dunningTarget.invoice_number}</div>
                  <div><strong>יתרת חוב:</strong> <span className="text-red-600 font-bold">₪{fmt(dunningTarget.balance_due)}</span></div>
                  <div><strong>ימי איחור:</strong> <span className="text-red-500">{daysOverdue(dunningTarget.due_date)} ימים</span></div>
                  <div><strong>דרגת התראה נוכחית:</strong> {dunningLabels[dunningTarget.dunning_level || 0]?.label}</div>
                  <div><strong>דרגה הבאה:</strong> <span className="font-bold text-orange-600">{dunningLabels[(dunningTarget.dunning_level || 0) + 1]?.label || `דרגה ${(dunningTarget.dunning_level || 0) + 1}`}</span></div>
                </div>
                <p className="text-muted-foreground">ייווצר מכתב התראה חדש ברמה הבאה. ניתן לשלוח את המכתב מטאב מכתבי התראה.</p>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={submitDunning} className="flex items-center gap-2 bg-orange-600 text-foreground px-6 py-2 rounded-lg hover:bg-orange-700"><FileWarning size={16} /> צור מכתב התראה</button>
                <button onClick={() => setShowDunningForm(false)} className="px-6 py-2 border rounded-lg hover:bg-muted/30">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {arDetailView && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setArDetailView(null); setDetailTab("details"); }}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b flex justify-between items-center">
                <h2 className="text-lg font-bold">{arDetailView.customer_name} - {arDetailView.ar_number}</h2>
                <button onClick={() => { setArDetailView(null); setDetailTab("details"); }} className="p-1 hover:bg-muted/50 rounded-lg"><X size={20} /></button>
              </div>
              <div className="flex border-b">{[{id:"details",label:"פרטים"},{id:"related",label:"רשומות קשורות"},{id:"attachments",label:"מסמכים"},{id:"history",label:"היסטוריה"}].map(t => (<button key={t.id} onClick={() => setDetailTab(t.id)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${detailTab === t.id ? "border-green-500 text-green-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>))}</div>
              {detailTab === "details" && <div className="p-5 grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground block">AR#</span><span className="font-bold text-green-600">{arDetailView.ar_number}</span></div>
                <div><span className="text-muted-foreground block">חשבונית</span><span>{arDetailView.invoice_number}</span></div>
                <div><span className="text-muted-foreground block">לקוח</span><span className="font-medium">{arDetailView.customer_name}</span></div>
                <div><span className="text-muted-foreground block">סכום</span><span className="font-bold">₪{fmt(arDetailView.amount)}</span></div>
                <div><span className="text-muted-foreground block">נגבה</span><span className="text-green-600">₪{fmt(arDetailView.paid_amount)}</span></div>
                <div><span className="text-muted-foreground block">יתרה</span><span className="text-red-600 font-bold">₪{fmt(arDetailView.balance_due)}</span></div>
                <div><span className="text-muted-foreground block">תאריך לתשלום</span><span>{arDetailView.due_date?.slice(0, 10)}</span></div>
                <div><span className="text-muted-foreground block">דרגת התראה</span><span className={dunningLabels[arDetailView.dunning_level || 0]?.color}>{dunningLabels[arDetailView.dunning_level || 0]?.label || "-"}</span></div>
                <div><span className="text-muted-foreground block">סטטוס</span><span className={`px-2 py-0.5 rounded-full text-xs ${statusMap[arDetailView.status]?.color || "bg-muted/50"}`}>{statusMap[arDetailView.status]?.label || arDetailView.status}</span></div>
                <div><span className="text-muted-foreground block">הערות</span><span>{arDetailView.notes || "-"}</span></div>
              </div>}
              {detailTab === "related" && <div className="p-5"><RelatedRecords tabs={[{key:"collections",label:"גביות",icon:"payments",endpoint:`${API}/ar/${arDetailView.id}/collections?limit=5`,columns:[{key:"collection_date",label:"תאריך"},{key:"amount",label:"סכום"},{key:"method",label:"אמצעי"},{key:"reference",label:"אסמכתא"}]}]} /></div>}
              {detailTab === "attachments" && <div className="p-5"><AttachmentsSection entityType="accounts-receivable" entityId={arDetailView.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="accounts-receivable" entityId={arDetailView.id} /></div>}
              <div className="p-5 border-t flex justify-end">
                <button onClick={() => { setArDetailView(null); setDetailTab("details"); }} className="px-4 py-2 border rounded-lg hover:bg-muted/30 text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
