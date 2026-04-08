import { useState, useEffect, useMemo } from "react";
import { DollarSign, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2, Clock, AlertTriangle, ArrowUpDown, Hash, CreditCard, TrendingDown, Users, Calendar, ChevronDown, ChevronUp, BarChart3, Wallet, Loader2 } from "lucide-react";
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
  paid: { label: "שולם", color: "bg-green-100 text-green-700" },
  overdue: { label: "באיחור", color: "bg-red-100 text-red-700" },
  cancelled: { label: "בוטל", color: "bg-muted/50 text-muted-foreground" },
};
const categoryMap: Record<string, string> = { materials: "חומרי גלם", services: "שירותים", equipment: "ציוד", subcontractor: "קבלן משנה", utilities: "חשמל/מים", rent: "שכירות", insurance: "ביטוח", maintenance: "תחזוקה", transport: "הובלה", other: "אחר" };
const paymentMethodMap: Record<string, string> = { bank_transfer: "העברה בנקאית", check: "צ'ק", cash: "מזומן", credit_card: "כרטיס אשראי", standing_order: "הוראת קבע" };
const termsMap: Record<string, string> = { "net_30": "שוטף+30", "net_45": "שוטף+45", "net_60": "שוטף+60", "net_90": "שוטף+90", "eom": "סוף חודש", "immediate": "מיידי", "cod": "מזומן במסירה" };
const priorityMap: Record<string, { label: string; color: string }> = { high: { label: "גבוה", color: "text-red-600" }, normal: { label: "רגיל", color: "text-muted-foreground" }, low: { label: "נמוך", color: "text-green-600" } };

type TabType = "invoices" | "aging" | "suppliers";

export default function AccountsPayablePage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [agingData, setAgingData] = useState<any[]>([]);
  const [topSuppliers, setTopSuppliers] = useState<any[]>([]);
  const [search, setSearch] = useState(""); const [filterStatus, setFilterStatus] = useState("all"); const [filterCategory, setFilterCategory] = useState("all");
  const [sortField, setSortField] = useState("due_date"); const [sortDir, setSortDir] = useState<"asc"|"desc">("asc");
  const [showForm, setShowForm] = useState(false); const [editing, setEditing] = useState<any>(null); const [form, setForm] = useState<any>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [showPayForm, setShowPayForm] = useState(false); const [payForm, setPayForm] = useState<any>({});
  const [payingId, setPayingId] = useState<number | null>(null);
  const [tab, setTab] = useState<TabType>("invoices");
  const [tableLoading, setTableLoading] = useState(true);
  const [apDetailView, setApDetailView] = useState<any>(null);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const { executeSave, executeDelete, loading: actionLoading } = useApiAction();
  const token = localStorage.getItem("token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = () => {
    setTableLoading(true);
    Promise.all([
      authFetch(`${API}/ap`, { headers }).then(r => r.json()).then(d => setItems(safeArray(d))),
      authFetch(`${API}/ap/stats`, { headers }).then(r => r.json()).then(d => setStats(d || {})),
      authFetch(`${API}/ap/aging`, { headers }).then(r => r.json()).then(d => setAgingData(safeArray(d))),
      authFetch(`${API}/ap/top-suppliers`, { headers }).then(r => r.json()).then(d => setTopSuppliers(safeArray(d))),
    ]).finally(() => setTableLoading(false));
  };
  useEffect(load, []);

  const loadPayments = async (apId: number) => {
    if (expandedId === apId) { setExpandedId(null); setPayments([]); return; }
    const r = await authFetch(`${API}/ap/${apId}/payments`, { headers });
    setPayments(safeArray(await r.json()));
    setExpandedId(apId);
  };

  const filtered = useMemo(() => {
    let f = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (filterCategory === "all" || i.category === filterCategory) &&
      (!search || i.invoice_number?.toLowerCase().includes(search.toLowerCase()) || i.supplier_name?.toLowerCase().includes(search.toLowerCase()) || i.ap_number?.toLowerCase().includes(search.toLowerCase()) || i.description?.toLowerCase().includes(search.toLowerCase()))
    );
    f.sort((a: any, b: any) => { const av = a[sortField], bv = b[sortField]; const cmp = typeof av === "number" ? av - bv : String(av||"").localeCompare(String(bv||"")); return sortDir === "asc" ? cmp : -cmp; });
    return f;
  }, [items, search, filterStatus, filterCategory, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      invoiceDate: new Date().toISOString().slice(0,10), currency: "ILS", status: "open", priority: "normal",
      dueDate: new Date(Date.now() + 30*86400000).toISOString().slice(0,10), paymentTerms: "net_30",
    });
    setShowForm(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({
      invoiceNumber: r.invoice_number, supplierName: r.supplier_name, supplierId: r.supplier_id,
      invoiceDate: r.invoice_date?.slice(0,10), dueDate: r.due_date?.slice(0,10),
      amount: r.amount, vatAmount: r.vat_amount, netAmount: r.net_amount,
      currency: r.currency, status: r.status, paymentTerms: r.payment_terms,
      description: r.description, category: r.category, notes: r.notes, priority: r.priority,
      glAccount: r.gl_account, glAccountName: r.gl_account_name,
      costCenter: r.cost_center, department: r.department, projectName: r.project_name,
      paymentMethod: r.payment_method, contactPerson: r.contact_person,
      contactPhone: r.contact_phone, contactEmail: r.contact_email,
      withholdingTax: r.withholding_tax, discountPercent: r.discount_percent,
      threeWayMatch: r.three_way_match, poMatched: r.po_matched, grnMatched: r.grn_matched,
    });
    setShowForm(true);
  };

  const save = async () => {
    const url = editing ? `${API}/ap/${editing.id}` : `${API}/ap`;
    await executeSave(() => fetch(url, { method: editing ? "PUT" : "POST", headers, body: JSON.stringify(form) }), !!editing, { successMessage: editing ? "חשבונית ספק עודכנה" : "חשבונית ספק נוצרה", onSuccess: () => { setShowForm(false); load(); } });
  };

  const remove = async (id: number) => {
    await executeDelete(() => authFetch(`${API}/ap/${id}`, { method: "DELETE", headers }), { confirm: "למחוק חשבונית ספק?", successMessage: "חשבונית ספק נמחקה", onSuccess: load });
  };

  const openPayment = (r: any) => {
    setPayingId(r.id);
    setPayForm({ amount: r.balance_due, paymentDate: new Date().toISOString().slice(0,10), paymentMethod: "bank_transfer" });
    setShowPayForm(true);
  };

  const submitPayment = async () => {
    if (!payingId) return;
    await authFetch(`${API}/ap/${payingId}/pay`, { method: "POST", headers, body: JSON.stringify(payForm) });
    setShowPayForm(false); setPayingId(null);
    if (expandedId === payingId) loadPayments(payingId);
    load();
  };

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("asc"); }
  };

  const daysOverdue = (dueDate: string) => {
    const diff = Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000);
    return diff > 0 ? diff : 0;
  };

  const kpis = [
    { label: "סה\"כ חשבוניות", value: fmt(stats.total || 0), icon: Hash, color: "text-blue-600" },
    { label: "פתוחות", value: fmt(stats.open_count || 0), icon: Clock, color: "text-blue-600" },
    { label: "באיחור", value: fmt(stats.overdue_count || 0), icon: AlertTriangle, color: "text-red-600" },
    { label: "שולמו", value: fmt(stats.paid_count || 0), icon: CheckCircle2, color: "text-green-600" },
    { label: "סה\"כ חוב", value: `₪${fmt(stats.total_balance || 0)}`, icon: DollarSign, color: "text-red-600" },
    { label: "שולם", value: `₪${fmt(stats.total_paid || 0)}`, icon: Wallet, color: "text-green-600" },
    { label: "מע\"מ", value: `₪${fmt(stats.total_vat || 0)}`, icon: TrendingDown, color: "text-purple-600" },
    { label: "ספקים", value: fmt(stats.supplier_count || 0), icon: Users, color: "text-indigo-600" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><DollarSign className="text-red-600" /> חובות לספקים Enterprise (AP)</h1>
          <p className="text-muted-foreground mt-1">ניהול חשבוניות ספקים, תשלומים חלקיים, גיול חובות, 3-Way Match</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={items} headers={{ ap_number: "מספר AP", invoice_number: "חשבונית", supplier_name: "ספק", amount: "סכום", paid_amount: "שולם", balance_due: "יתרה", due_date: "לתשלום", status: "סטטוס", category: "קטגוריה" }} filename={"accounts_payable"} />
          <button onClick={() => printPage("חובות לספקים")} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm"><Printer size={16} /> הדפסה</button>
          <button onClick={() => sendByEmail("חובות לספקים - טכנו-כל עוזי", generateEmailBody("חובות לספקים", items, { ap_number: "מספר", supplier_name: "ספק", amount: "סכום", balance_due: "יתרה", status: "סטטוס" }))} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm"><Send size={16} /> שליחה</button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-red-600 text-foreground px-3 py-2 rounded-lg hover:bg-red-700 shadow-lg text-sm"><Plus size={16} /> חשבונית חדשה</button>
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
        const Arrow = ({ val }: { val: number }) => val > 0 ? <span className="text-red-600 text-xs font-bold">▲ +{val}%</span> : val < 0 ? <span className="text-green-600 text-xs font-bold">▼ {val}%</span> : <span className="text-muted-foreground text-xs">—</span>;
        return (
          <div className="bg-card rounded-xl shadow-sm border p-4">
            <div className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">📊 השוואת תקופות</div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-rose-50 rounded-lg p-3 border border-rose-200">
                <div className="text-[10px] text-muted-foreground mb-1">חוב ספקים: חודש נוכחי מול קודם</div>
                <div className="text-lg font-bold text-rose-700">₪{fmt(curM.total)}</div>
                <div className="text-xs text-muted-foreground">מול ₪{fmt(prevM.total)}</div>
                <Arrow val={pctChange(curM.total, prevM.total)} />
              </div>
              <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                <div className="text-[10px] text-muted-foreground mb-1">שולם: חודש נוכחי מול קודם</div>
                <div className="text-lg font-bold text-green-700">₪{fmt(curM.paid)}</div>
                <div className="text-xs text-muted-foreground">מול ₪{fmt(prevM.paid)}</div>
                <Arrow val={pctChange(curM.paid, prevM.paid)} />
              </div>
              <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                <div className="text-[10px] text-muted-foreground mb-1">רבעון נוכחי מול קודם</div>
                <div className="text-lg font-bold text-rose-700">₪{fmt(curQ.total)}</div>
                <div className="text-xs text-muted-foreground">מול ₪{fmt(prevQ.total)}</div>
                <Arrow val={pctChange(curQ.total, prevQ.total)} />
              </div>
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
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
              <div className="flex items-center gap-2 mb-3 text-sm font-bold text-foreground"><TrendingDown size={16} className="text-red-600" /> התחייבויות לפי מועד פירעון</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="apGradAmt" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#dc2626" stopOpacity={0.3}/><stop offset="95%" stopColor="#dc2626" stopOpacity={0}/></linearGradient>
                    <linearGradient id="apGradPaid" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#16a34a" stopOpacity={0.3}/><stop offset="95%" stopColor="#16a34a" stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tickFormatter={heMonth} tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v: number) => `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => `₪${fmt(v)}`} labelFormatter={heMonth} />
                  <Legend formatter={(v: string) => v === "amount" ? "סכום חוב" : v === "paid" ? "שולם" : v} />
                  <Area type="monotone" dataKey="amount" stroke="#dc2626" fill="url(#apGradAmt)" strokeWidth={2} name="amount" />
                  <Area type="monotone" dataKey="paid" stroke="#16a34a" fill="url(#apGradPaid)" strokeWidth={2} name="paid" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-card rounded-xl shadow-sm border p-4">
              <div className="flex items-center gap-2 mb-3 text-sm font-bold text-foreground"><BarChart3 size={16} className="text-amber-600" /> יתרות פתוחות לספקים</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tickFormatter={heMonth} tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v: number) => `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => `₪${fmt(v)}`} labelFormatter={heMonth} />
                  <Bar dataKey="balance" fill="#f59e0b" radius={[4, 4, 0, 0]} name="יתרה" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null;
      })()}

      <div className="flex gap-2 border-b">
        {([["invoices", "חשבוניות"], ["aging", "גיול חובות"], ["suppliers", "ספקים מובילים"]] as [TabType, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === key ? 'border-red-600 text-red-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{label}</button>
        ))}
      </div>

      {tab === "invoices" && (
        <>
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-0 sm:min-w-[200px]"><Search className="absolute right-3 top-2.5 text-muted-foreground" size={18} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש ספק/חשבונית/AP..." className="w-full pr-10 pl-4 py-2 border rounded-lg" /></div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2"><option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="border rounded-lg px-3 py-2"><option value="all">כל הקטגוריות</option>{Object.entries(categoryMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </div>

          <BulkActions selectedIds={selectedIds} onClear={clear} entityName="חשבוניות ספקים" actions={defaultBulkActions(selectedIds, clear, load, `${API}/ap`)} />
          <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b"><tr>
                <th className="px-2 py-3 w-8"><BulkCheckbox checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered)} partial={selectedIds.length > 0 && selectedIds.length < filtered.length} /></th>
                <th className="px-2 py-3 w-8"></th>
                {[{ key: "ap_number", label: "AP#" }, { key: "invoice_number", label: "חשבונית" }, { key: "supplier_name", label: "ספק" }, { key: "amount", label: "סכום" }, { key: "paid_amount", label: "שולם" }, { key: "balance_due", label: "יתרה" }, { key: "due_date", label: "לתשלום" }, { key: "category", label: "קטגוריה" }, { key: "status", label: "סטטוס" }].map(col => (
                  <th key={col.key} className="px-2 py-3 text-right cursor-pointer hover:bg-muted/50 text-xs" onClick={() => toggleSort(col.key)}><div className="flex items-center gap-1">{col.label} <ArrowUpDown size={10} /></div></th>
                ))}
                <th className="px-2 py-3 text-right text-xs">פעולות</th>
              </tr></thead>
              <tbody>
                {filtered.length === 0 ? <tr><td colSpan={11} className="text-center py-8 text-muted-foreground">אין חשבוניות ספקים</td></tr> :
                pagination.paginate(filtered).map(r => {
                  const overdue = daysOverdue(r.due_date);
                  const effectiveStatus = (r.status === 'open' || r.status === 'partial') && overdue > 0 ? 'overdue' : r.status;
                  return (
                  <tbody key={r.id}>
                    <tr className={`border-b hover:bg-red-50/30 ${expandedId === r.id ? 'bg-red-50/50' : ''} ${overdue > 0 && effectiveStatus === 'overdue' ? 'bg-red-50/20' : ''}`}>
                      <td className="px-2 py-2"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                      <td className="px-2 py-2"><button onClick={() => loadPayments(r.id)} className="p-1 hover:bg-blue-500/10 rounded">{expandedId === r.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button></td>
                      <td className="px-2 py-2 font-mono text-red-600 font-bold text-xs cursor-pointer hover:underline" onClick={() => { setApDetailView(r); setDetailTab("details"); }}>{r.ap_number || "-"}</td>
                      <td className="px-2 py-2 text-xs">{r.invoice_number}</td>
                      <td className="px-2 py-2 font-medium">{r.supplier_name}</td>
                      <td className="px-2 py-2 font-bold">₪{fmt(r.amount)}</td>
                      <td className="px-2 py-2 text-green-600">₪{fmt(r.paid_amount)}</td>
                      <td className="px-2 py-2 text-red-600 font-bold">₪{fmt(r.balance_due)}</td>
                      <td className="px-2 py-2 text-xs">
                        <div>{r.due_date?.slice(0,10)}</div>
                        {overdue > 0 && <div className="text-red-500 text-[10px]">{overdue} ימים איחור</div>}
                      </td>
                      <td className="px-2 py-2 text-xs">{categoryMap[r.category] || r.category || "-"}</td>
                      <td className="px-2 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${statusMap[effectiveStatus]?.color || 'bg-muted/50'}`}>{statusMap[effectiveStatus]?.label || r.status}</span></td>
                      <td className="px-2 py-2">
                        <div className="flex gap-1">
                          {r.status !== 'paid' && r.status !== 'cancelled' && (
                            <button onClick={() => openPayment(r)} className="p-1 hover:bg-green-100 rounded text-green-600" title="תשלום"><CreditCard size={13} /></button>
                          )}
                          <button onClick={() => openEdit(r)} className="p-1 hover:bg-blue-500/10 rounded"><Edit2 size={13} /></button>
                          {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.supplier_name || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1 hover:bg-red-500/10 rounded text-red-500"><Trash2 size={13} /></button>}
                        </div>
                      </td>
                    </tr>
                    {expandedId === r.id && (
                      <tr>
                        <td colSpan={11} className="p-0">
                          <div className="bg-red-50/30 border-t border-red-100 px-6 py-3">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
                              {r.cost_center && <div><span className="text-muted-foreground">מרכז עלות:</span> {r.cost_center}</div>}
                              {r.department && <div><span className="text-muted-foreground">מחלקה:</span> {r.department}</div>}
                              {r.payment_terms && <div><span className="text-muted-foreground">תנאי תשלום:</span> {termsMap[r.payment_terms] || r.payment_terms}</div>}
                              {r.payment_method && <div><span className="text-muted-foreground">אמצעי:</span> {paymentMethodMap[r.payment_method] || r.payment_method}</div>}
                              {r.contact_person && <div><span className="text-muted-foreground">איש קשר:</span> {r.contact_person}</div>}
                              {r.contact_phone && <div><span className="text-muted-foreground">טלפון:</span> {r.contact_phone}</div>}
                              {r.vat_amount > 0 && <div><span className="text-muted-foreground">מע"מ:</span> ₪{fmt(r.vat_amount)}</div>}
                              {r.withholding_tax > 0 && <div><span className="text-muted-foreground">ניכוי במקור:</span> ₪{fmt(r.withholding_tax)}</div>}
                              {r.three_way_match && <div><span className="text-muted-foreground">3-Way:</span> <span className={r.po_matched && r.grn_matched ? 'text-green-600' : 'text-orange-500'}>{r.po_matched ? '✓' : '✗'} PO {r.grn_matched ? '✓' : '✗'} GRN</span></div>}
                            </div>
                            <div className="text-xs font-bold text-red-600 mb-2 flex items-center gap-1"><CreditCard size={14} /> היסטוריית תשלומים</div>
                            {payments.length === 0 ? (
                              <div className="text-sm text-muted-foreground py-1">אין תשלומים עדיין</div>
                            ) : (
                              <table className="w-full text-xs">
                                <thead><tr className="border-b border-red-200">
                                  <th className="text-right py-1 px-2">מספר</th><th className="text-right py-1 px-2">תאריך</th>
                                  <th className="text-right py-1 px-2">סכום</th><th className="text-right py-1 px-2">אמצעי</th>
                                  <th className="text-right py-1 px-2">אסמכתא</th><th className="text-right py-1 px-2">שולם ע"י</th>
                                </tr></thead>
                                <tbody>{payments.map(p => (
                                  <tr key={p.id} className="border-b border-red-100/50">
                                    <td className="py-1 px-2 font-mono text-green-600">{p.payment_number}</td>
                                    <td className="py-1 px-2">{p.payment_date?.slice(0,10)}</td>
                                    <td className="py-1 px-2 font-bold text-green-600">₪{fmt(p.amount)}</td>
                                    <td className="py-1 px-2">{paymentMethodMap[p.payment_method] || p.payment_method || "-"}</td>
                                    <td className="py-1 px-2">{p.reference || "-"}</td>
                                    <td className="py-1 px-2">{p.created_by_name || "-"}</td>
                                  </tr>
                                ))}</tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                );})}
              </tbody>
              {filtered.length > 0 && (
                <tfoot className="bg-muted/50 border-t-2 border-border font-bold text-sm">
                  <tr>
                    <td className="px-2 py-3" colSpan={4}>סה"כ ({filtered.length} שורות)</td>
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
        </>
      )}

      {tab === "aging" && (
        <div className="space-y-4">
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: "שוטף", value: `₪${fmt(stats.due_30 || 0)}`, color: "bg-green-50 border-green-200" },
              { label: "30 יום", value: `₪${fmt(stats.overdue_30 || 0)}`, color: "bg-yellow-50 border-yellow-200" },
              { label: "60 יום", value: `₪${fmt(stats.overdue_60 || 0)}`, color: "bg-orange-50 border-orange-200" },
              { label: "90 יום", value: `₪${fmt(stats.overdue_90 || 0)}`, color: "bg-red-50 border-red-200" },
              { label: "120+ יום", value: `₪${fmt(stats.overdue_120_plus || 0)}`, color: "bg-red-100 border-red-300" },
            ].map((b, i) => <div key={i} className={`${b.color} rounded-xl border p-4 text-center`}><div className="text-xs text-muted-foreground mb-1">{b.label}</div><div className="text-lg font-bold">{b.value}</div></div>)}
          </div>
          <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b"><tr>
                <th className="px-3 py-3 text-right">ספק</th>
                <th className="px-3 py-3 text-right">חשבוניות</th>
                <th className="px-3 py-3 text-right">סה"כ יתרה</th>
                <th className="px-3 py-3 text-right text-green-600">שוטף</th>
                <th className="px-3 py-3 text-right text-yellow-600">30 יום</th>
                <th className="px-3 py-3 text-right text-orange-600">60 יום</th>
                <th className="px-3 py-3 text-right text-red-600">90 יום</th>
                <th className="px-3 py-3 text-right text-red-700">120+</th>
              </tr></thead>
              <tbody>
                {agingData.length === 0 ? <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">אין נתוני גיול</td></tr> :
                agingData.map((r, i) => (
                  <tr key={i} className="border-b hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{r.supplier_name}</td>
                    <td className="px-3 py-2 text-center">{r.invoice_count}</td>
                    <td className="px-3 py-2 font-bold text-red-600">₪{fmt(r.total_balance)}</td>
                    <td className="px-3 py-2 text-green-600">{Number(r.current_amount) > 0 ? `₪${fmt(r.current_amount)}` : "-"}</td>
                    <td className="px-3 py-2 text-yellow-600">{Number(r.days_30) > 0 ? `₪${fmt(r.days_30)}` : "-"}</td>
                    <td className="px-3 py-2 text-orange-600">{Number(r.days_60) > 0 ? `₪${fmt(r.days_60)}` : "-"}</td>
                    <td className="px-3 py-2 text-red-600">{Number(r.days_90) > 0 ? `₪${fmt(r.days_90)}` : "-"}</td>
                    <td className="px-3 py-2 text-red-700 font-bold">{Number(r.days_120_plus) > 0 ? `₪${fmt(r.days_120_plus)}` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "suppliers" && (
        <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b"><tr>
              <th className="px-3 py-3 text-right">#</th>
              <th className="px-3 py-3 text-right">ספק</th>
              <th className="px-3 py-3 text-right">חשבוניות</th>
              <th className="px-3 py-3 text-right">סה"כ סכום</th>
              <th className="px-3 py-3 text-right">שולם</th>
              <th className="px-3 py-3 text-right">יתרה</th>
              <th className="px-3 py-3 text-right">% מסה"כ</th>
            </tr></thead>
            <tbody>
              {topSuppliers.map((r, i) => {
                const totalAll = topSuppliers.reduce((s, x) => s + Number(x.total_amount || 0), 0);
                const pct = totalAll > 0 ? (Number(r.total_amount) / totalAll * 100) : 0;
                return (
                  <tr key={i} className="border-b hover:bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{r.supplier_name}</td>
                    <td className="px-3 py-2 text-center">{r.invoice_count}</td>
                    <td className="px-3 py-2 font-bold">₪{fmt(r.total_amount)}</td>
                    <td className="px-3 py-2 text-green-600">₪{fmt(r.total_paid)}</td>
                    <td className="px-3 py-2 text-red-600 font-bold">₪{fmt(r.total_balance)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-muted/50 rounded-full h-2"><div className="bg-red-500 h-2 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }}></div></div>
                        <span className="text-xs">{pct.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">{editing ? "עריכת חשבונית ספק" : "חשבונית ספק חדשה"}</h2>
                <button onClick={() => setShowForm(false)}><X size={20} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium mb-1">שם ספק *</label><input value={form.supplierName || ""} onChange={e => setForm({ ...form, supplierName: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מספר חשבונית *</label><input value={form.invoiceNumber || ""} onChange={e => setForm({ ...form, invoiceNumber: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">סטטוס</label><select value={form.status || "open"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full border rounded-lg px-3 py-2">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">תאריך חשבונית *</label><input type="date" value={form.invoiceDate || ""} onChange={e => setForm({ ...form, invoiceDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">תאריך לתשלום *</label><input type="date" value={form.dueDate || ""} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">תנאי תשלום</label><select value={form.paymentTerms || ""} onChange={e => setForm({ ...form, paymentTerms: e.target.value })} className="w-full border rounded-lg px-3 py-2"><option value="">ללא</option>{Object.entries(termsMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">סכום כולל (₪) *</label><input type="number" step="0.01" value={form.amount || ""} onChange={e => { const amt = Number(e.target.value) || 0; setForm({ ...form, amount: e.target.value, vatAmount: (amt * VAT_RATE / (1 + VAT_RATE)).toFixed(2), netAmount: (amt / (1 + VAT_RATE)).toFixed(2) }); }} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מע"מ (₪)</label><input type="number" step="0.01" value={form.vatAmount || ""} onChange={e => setForm({ ...form, vatAmount: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">סכום נטו (₪)</label><input type="number" step="0.01" value={form.netAmount || ""} onChange={e => setForm({ ...form, netAmount: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מטבע</label><select value={form.currency || "ILS"} onChange={e => setForm({ ...form, currency: e.target.value })} className="w-full border rounded-lg px-3 py-2"><option value="ILS">₪ שקל</option><option value="USD">$ דולר</option><option value="EUR">€ אירו</option></select></div>
                <div><label className="block text-sm font-medium mb-1">קטגוריה</label><select value={form.category || ""} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full border rounded-lg px-3 py-2"><option value="">ללא</option>{Object.entries(categoryMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">עדיפות</label><select value={form.priority || "normal"} onChange={e => setForm({ ...form, priority: e.target.value })} className="w-full border rounded-lg px-3 py-2">{Object.entries(priorityMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">אמצעי תשלום</label><select value={form.paymentMethod || ""} onChange={e => setForm({ ...form, paymentMethod: e.target.value })} className="w-full border rounded-lg px-3 py-2"><option value="">ללא</option>{Object.entries(paymentMethodMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">ניכוי במקור (₪)</label><input type="number" step="0.01" value={form.withholdingTax || ""} onChange={e => setForm({ ...form, withholdingTax: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">% הנחה</label><input type="number" step="0.1" value={form.discountPercent || ""} onChange={e => setForm({ ...form, discountPercent: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">חשבון GL</label><input value={form.glAccount || ""} onChange={e => setForm({ ...form, glAccount: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מרכז עלות</label><input value={form.costCenter || ""} onChange={e => setForm({ ...form, costCenter: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מחלקה</label><input value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">איש קשר</label><input value={form.contactPerson || ""} onChange={e => setForm({ ...form, contactPerson: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">טלפון</label><input value={form.contactPhone || ""} onChange={e => setForm({ ...form, contactPhone: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">אימייל</label><input type="email" value={form.contactEmail || ""} onChange={e => setForm({ ...form, contactEmail: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div className="flex items-end gap-3 pb-1">
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.threeWayMatch || false} onChange={e => setForm({ ...form, threeWayMatch: e.target.checked })} className="w-4 h-4" /><span className="text-sm">3-Way Match</span></label>
                  {form.threeWayMatch && <>
                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.poMatched || false} onChange={e => setForm({ ...form, poMatched: e.target.checked })} className="w-4 h-4" /><span className="text-xs">PO</span></label>
                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.grnMatched || false} onChange={e => setForm({ ...form, grnMatched: e.target.checked })} className="w-4 h-4" /><span className="text-xs">GRN</span></label>
                  </>}
                </div>
                <div className="col-span-3"><label className="block text-sm font-medium mb-1">תיאור</label><input value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div className="col-span-3"><label className="block text-sm font-medium mb-1">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2" /></div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={save} className="flex items-center gap-2 bg-red-600 text-foreground px-6 py-2 rounded-lg hover:bg-red-700"><Save size={16} /> {editing ? "עדכון" : "שמירה"}</button>
                <button onClick={() => setShowForm(false)} className="px-6 py-2 border rounded-lg hover:bg-muted/30">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPayForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowPayForm(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2"><CreditCard className="text-green-600" /> רישום תשלום</h2>
                <button onClick={() => setShowPayForm(false)}><X size={20} /></button>
              </div>
              <div className="space-y-4">
                <div><label className="block text-sm font-medium mb-1">סכום תשלום (₪) *</label><input type="number" step="0.01" value={payForm.amount || ""} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-lg font-bold text-green-600" /></div>
                <div><label className="block text-sm font-medium mb-1">תאריך תשלום</label><input type="date" value={payForm.paymentDate || ""} onChange={e => setPayForm({ ...payForm, paymentDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">אמצעי תשלום</label><select value={payForm.paymentMethod || ""} onChange={e => setPayForm({ ...payForm, paymentMethod: e.target.value })} className="w-full border rounded-lg px-3 py-2"><option value="">ללא</option>{Object.entries(paymentMethodMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                {payForm.paymentMethod === 'check' && <div><label className="block text-sm font-medium mb-1">מספר צ'ק</label><input value={payForm.checkNumber || ""} onChange={e => setPayForm({ ...payForm, checkNumber: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>}
                <div><label className="block text-sm font-medium mb-1">אסמכתא</label><input value={payForm.reference || ""} onChange={e => setPayForm({ ...payForm, reference: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">הערות</label><textarea value={payForm.notes || ""} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2" /></div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={submitPayment} className="flex items-center gap-2 bg-green-600 text-foreground px-6 py-2 rounded-lg hover:bg-green-700"><Save size={16} /> שלם</button>
                <button onClick={() => setShowPayForm(false)} className="px-6 py-2 border rounded-lg hover:bg-muted/30">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {apDetailView && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setApDetailView(null); setDetailTab("details"); }}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b flex justify-between items-center">
                <h2 className="text-lg font-bold">{apDetailView.supplier_name} - {apDetailView.ap_number}</h2>
                <button onClick={() => { setApDetailView(null); setDetailTab("details"); }} className="p-1 hover:bg-muted/50 rounded-lg"><X size={20} /></button>
              </div>
              <div className="flex border-b">{[{id:"details",label:"פרטים"},{id:"related",label:"רשומות קשורות"},{id:"attachments",label:"מסמכים"},{id:"history",label:"היסטוריה"}].map(t => (<button key={t.id} onClick={() => setDetailTab(t.id)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${detailTab === t.id ? "border-red-500 text-red-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>))}</div>
              {detailTab === "details" && <div className="p-5 grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground block">AP#</span><span className="font-bold text-red-600">{apDetailView.ap_number}</span></div>
                <div><span className="text-muted-foreground block">חשבונית</span><span>{apDetailView.invoice_number}</span></div>
                <div><span className="text-muted-foreground block">ספק</span><span className="font-medium">{apDetailView.supplier_name}</span></div>
                <div><span className="text-muted-foreground block">סכום</span><span className="font-bold">₪{fmt(apDetailView.amount)}</span></div>
                <div><span className="text-muted-foreground block">שולם</span><span className="text-green-600">₪{fmt(apDetailView.paid_amount)}</span></div>
                <div><span className="text-muted-foreground block">יתרה</span><span className="text-red-600 font-bold">₪{fmt(apDetailView.balance_due)}</span></div>
                <div><span className="text-muted-foreground block">תאריך לתשלום</span><span>{apDetailView.due_date?.slice(0, 10)}</span></div>
                <div><span className="text-muted-foreground block">קטגוריה</span><span>{categoryMap[apDetailView.category] || apDetailView.category || "-"}</span></div>
                <div><span className="text-muted-foreground block">סטטוס</span><span className={`px-2 py-0.5 rounded-full text-xs ${statusMap[apDetailView.status]?.color || "bg-muted/50"}`}>{statusMap[apDetailView.status]?.label || apDetailView.status}</span></div>
                <div><span className="text-muted-foreground block">הערות</span><span>{apDetailView.notes || "-"}</span></div>
              </div>}
              {detailTab === "related" && <div className="p-5"><RelatedRecords tabs={[{key:"payments",label:"תשלומים",icon:"payments",endpoint:`${API}/ap/${apDetailView.id}/payments?limit=5`,columns:[{key:"payment_date",label:"תאריך"},{key:"amount",label:"סכום"},{key:"method",label:"אמצעי"},{key:"reference",label:"אסמכתא"}]}]} /></div>}
              {detailTab === "attachments" && <div className="p-5"><AttachmentsSection entityType="accounts-payable" entityId={apDetailView.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="accounts-payable" entityId={apDetailView.id} /></div>}
              <div className="p-5 border-t flex justify-end">
                <button onClick={() => { setApDetailView(null); setDetailTab("details"); }} className="px-4 py-2 border rounded-lg hover:bg-muted/30 text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
