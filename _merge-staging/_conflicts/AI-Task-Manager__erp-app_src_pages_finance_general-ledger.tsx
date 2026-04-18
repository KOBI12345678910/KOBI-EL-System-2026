import { useState, useEffect, useMemo } from "react";
import { BookOpen, Search, Plus, Edit2, Trash2, X, Save, Hash, Calendar, CheckCircle2, DollarSign, Clock, ArrowUpDown, FileText, Layers, TrendingUp, TrendingDown, Filter, BarChart3 , Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Printer, Send } from "lucide-react";
import ExportDropdown from "@/components/export-dropdown";
import { printPage, sendByEmail, generateEmailBody } from "@/lib/print-utils";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { useApiAction } from "@/hooks/use-api-action";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const statusMap: Record<string, { label: string; color: string }> = {
  posted: { label: "רשום", color: "bg-green-100 text-green-700" },
  draft: { label: "טיוטה", color: "bg-muted/50 text-foreground" },
  reversed: { label: "מבוטל", color: "bg-red-100 text-red-700" },
};

const accountTypeMap: Record<string, string> = {
  asset: "נכסים", liability: "התחייבויות", equity: "הון עצמי",
  revenue: "הכנסות", expense: "הוצאות",
};

const sourceTypeMap: Record<string, string> = { 
  invoice: "חשבונית", 
  payment: "תשלום", 
  receipt: "קבלה", 
  purchase: "רכש", 
  payroll: "שכר", 
  depreciation: "פחת", 
  adjustment: "התאמה", 
  manual: "ידנית", 
  bank: "בנק", 
  journal: "פקודת יומן",
  journal_entry: "פקודת יומן",
  opening: "יתרת פתיחה",
};

type TabType = "entries" | "by-account" | "by-period";

export default function GeneralLedgerPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [byAccount, setByAccount] = useState<any[]>([]);
  const [byPeriod, setByPeriod] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [detailTab, setDetailTab] = useState("details");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const [filterAccount, setFilterAccount] = useState("all");
  const [sortField, setSortField] = useState("entry_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [tab, setTab] = useState<TabType>("entries");
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const [tableLoading, setTableLoading] = useState(true);
  const pagination = useSmartPagination(25);
  const { executeSave, executeDelete, execute, loading: actionLoading } = useApiAction();

  const load = () => {
    setTableLoading(true);
    Promise.all([
      authFetch(`${API}/general-ledger${filterAccount && filterAccount !== 'all' ? `?account_id=${filterAccount}` : ''}`, { headers }).then(r => r.json()).then(d => setEntries(safeArray(d))),
      authFetch(`${API}/general-ledger/stats`, { headers }).then(r => r.json()).then(d => setStats(d || {})),
      authFetch(`${API}/general-ledger/by-account`, { headers }).then(r => r.json()).then(d => setByAccount(safeArray(d))),
      authFetch(`${API}/general-ledger/by-period`, { headers }).then(r => r.json()).then(d => setByPeriod(safeArray(d))),
      authFetch(`${API}/chart-of-accounts`, { headers }).then(r => r.json()).then(d => setAccounts(safeArray(d)))
    ]).finally(() => setTableLoading(false));
  };
  useEffect(load, [filterAccount]);

  const filtered = useMemo(() => {
    let f = entries.filter(e =>
      !search || e.entry_number?.toLowerCase().includes(search.toLowerCase()) ||
      e.account_name?.toLowerCase().includes(search.toLowerCase()) ||
      e.account_number?.toLowerCase().includes(search.toLowerCase()) ||
      e.description?.toLowerCase().includes(search.toLowerCase()) ||
      e.reference?.toLowerCase().includes(search.toLowerCase())
    );
    f.sort((a: any, b: any) => {
      const av = a[sortField], bv = b[sortField];
      const cmp = typeof av === "number" ? av - bv : String(av || "").localeCompare(String(bv || ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return f;
  }, [entries, search, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ entryDate: new Date().toISOString().slice(0, 10), currency: "ILS", exchangeRate: 1, status: "posted", fiscalYear: new Date().getFullYear(), fiscalPeriod: new Date().getMonth() + 1 });
    setShowForm(true);
  };
  const openEdit = (r: any) => {
    setEditing(r);
    setForm({ 
      entryDate: r.entry_date?.slice(0, 10), 
      accountNumber: r.account_number, 
      accountName: r.account_name, 
      accountType: r.account_type, 
      description: r.description, 
      reference: r.reference, 
      sourceDocument: r.source_document, 
      sourceType: r.source_type, 
      debit: r.debit || r.debit_amount, 
      credit: r.credit || r.credit_amount, 
      currency: r.currency, 
      fiscalYear: r.fiscal_year, 
      fiscalPeriod: r.fiscal_period, 
      costCenter: r.cost_center, 
      department: r.department, 
      projectName: r.project_name, 
      counterpartAccount: r.counterpart_account,
      status: r.status, 
      notes: r.notes 
    });
    setShowForm(true);
  };
  const save = async () => { const url = editing ? `${API}/general-ledger/${editing.id}` : `${API}/general-ledger`; await executeSave(url, editing ? "PUT" : "POST", form, editing ? "עודכן בהצלחה" : "נוצר בהצלחה", () => { setShowForm(false); load(); }); };
  const remove = async (id: number) => { await executeDelete(`${API}/general-ledger/${id}`, "למחוק רשומה?", () => { load(); }); };
  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const handleAccountSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const acc = accounts.find((a: any) => a.account_number === e.target.value);
    if (acc) setForm({ ...form, accountNumber: acc.account_number, accountName: acc.account_name_he || acc.account_name, accountType: acc.account_type, accountId: acc.id });
    else setForm({ ...form, accountNumber: "", accountName: "" });
  };

  const kpis = [
    { label: "סה\"כ רשומות", value: fmt(stats.total || 0), icon: Hash, color: "text-blue-600" },
    { label: "תנועות החודש", value: fmt(stats.month_entries || 0), icon: Calendar, color: "text-purple-600" },
    { label: "רשומות", value: fmt(stats.posted_count || 0), icon: CheckCircle2, color: "text-green-600" },
    { label: "סה\"כ חובה", value: `₪${fmt(stats.total_debit || 0)}`, icon: TrendingUp, color: "text-blue-600" },
    { label: "סה\"כ זכות", value: `₪${fmt(stats.total_credit || 0)}`, icon: TrendingDown, color: "text-red-600" },
    { label: "יתרת ספר", value: `₪${fmt(stats.net_balance || 0)}`, icon: DollarSign, color: "text-emerald-600" },
    { label: "חשבונות", value: fmt(stats.account_count || 0), icon: Layers, color: "text-indigo-600" },
    { label: "לא מותאמות", value: fmt(stats.unreconciled || 0), icon: Clock, color: "text-orange-600" },
  ];

  const monthNames: Record<string, string> = { "01": "ינואר", "02": "פברואר", "03": "מרץ", "04": "אפריל", "05": "מאי", "06": "יוני", "07": "יולי", "08": "אוגוסט", "09": "ספטמבר", "10": "אוקטובר", "11": "נובמבר", "12": "דצמבר" };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><BookOpen className="text-indigo-600" /> ספר ראשי (General Ledger)</h1>
          <p className="text-muted-foreground mt-1">צפייה בכל תנועות החשבונאות, סינון לפי חשבון ותקופה</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={entries} headers={{ entry_number: "מספר", entry_date: "תאריך", account_number: "חשבון", account_name: "שם חשבון", debit: "חובה", credit: "זכות", balance: "יתרה", description: "תיאור", reference: "אסמכתא", status: "סטטוס" }} filename={"general_ledger"} />
          <button onClick={() => printPage("ספר ראשי")} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm"><Printer size={16} /> הדפסה</button>
          <button onClick={() => sendByEmail("ספר ראשי", generateEmailBody("ספר ראשי", entries, { entry_number: "מספר", account_name: "חשבון", debit: "חובה", credit: "זכות" }))} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm"><Send size={16} /> שליחה</button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-indigo-600 text-foreground px-3 py-2 rounded-lg hover:bg-indigo-700 shadow-lg text-sm"><Plus size={16} /> רשומה חדשה</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card rounded-xl shadow-sm border p-3">
            <kpi.icon className={`${kpi.color} mb-1`} size={20} />
            <div className="text-lg font-bold">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-2 border-b">
        {([["entries", "תנועות"], ["by-account", "לפי חשבון"], ["by-period", "לפי תקופה"]] as [TabType, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{label}</button>
        ))}
      </div>

      {tab === "entries" && (<>
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-0 sm:min-w-[200px]"><Search className="absolute right-3 top-2.5 text-muted-foreground" size={18} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש מספר/חשבון/תיאור..." className="w-full pr-10 pl-4 py-2 border rounded-lg" /></div>
          <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} className="border rounded-lg px-3 py-2 max-w-[200px]">
            <option value="all">כל החשבונות</option>
            {accounts.filter((a: any) => !a.is_group).map((a: any) => <option key={a.id} value={a.account_number}>{a.account_number} - {a.account_name_he || a.account_name}</option>)}
          </select>
        </div>

        <div className="bg-card rounded-xl shadow-sm border overflow-x-auto relative">
        {tableLoading && (
          <div className="absolute inset-0 bg-card/60 backdrop-blur-[1px] flex items-center justify-center z-10">
            <div className="flex items-center gap-2 bg-card border rounded-lg px-4 py-2 shadow-lg"><Loader2 className="w-4 h-4 animate-spin text-amber-600" /><span className="text-sm">טוען נתונים...</span></div>
          </div>
        )}
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b"><tr>
              {[
                { key: "entry_number", label: "מספר" }, { key: "entry_date", label: "תאריך" },
                { key: "account_number", label: "חשבון" }, { key: "account_name", label: "שם חשבון" },
                { key: "description", label: "תיאור" }, { key: "reference", label: "אסמכתא" }, 
                { key: "debit", label: "חובה" }, { key: "credit", label: "זכות" }, 
                { key: "balance", label: "יתרה" }, { key: "source_type", label: "מקור" }, 
                { key: "status", label: "סטטוס" },
              ].map(col => (
                <th key={col.key} className="px-2 py-3 text-right cursor-pointer hover:bg-muted/50 text-xs" onClick={() => toggleSort(col.key)}>
                  <div className="flex items-center gap-1">{col.label} <ArrowUpDown size={10} /></div>
                </th>
              ))}
              <th className="px-2 py-3 text-right text-xs">פעולות</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan={12} className="text-center py-8 text-muted-foreground">אין תנועות בספר הראשי</td></tr> :
              filtered.map(r => (
                <tr key={r.id} className="border-b hover:bg-indigo-50/30">
                  <td className="px-2 py-2 font-mono text-indigo-600 font-bold text-xs">{r.entry_number}</td>
                  <td className="px-2 py-2 text-xs">{r.entry_date?.slice(0, 10)}</td>
                  <td className="px-2 py-2 font-mono text-xs">{r.account_number}</td>
                  <td className="px-2 py-2 font-medium text-xs">{r.account_name}</td>
                  <td className="px-2 py-2 max-w-[150px] truncate text-xs">{r.description || "-"}</td>
                  <td className="px-2 py-2 text-xs">{r.reference || "-"}</td>
                  <td className="px-2 py-2 text-blue-600 font-bold">{Number(r.debit || r.debit_amount) > 0 ? `₪${fmt(r.debit || r.debit_amount)}` : ""}</td>
                  <td className="px-2 py-2 text-red-600 font-bold">{Number(r.credit || r.credit_amount) > 0 ? `₪${fmt(r.credit || r.credit_amount)}` : ""}</td>
                  <td className={`px-2 py-2 font-bold ${Number(r.balance) >= 0 ? 'text-green-600' : 'text-red-600'}`}>₪{fmt(r.balance)}</td>
                  <td className="px-2 py-2 text-xs">{sourceTypeMap[r.source_type] || r.source_type || "-"}</td>
                  <td className="px-2 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${statusMap[r.status]?.color || 'bg-muted/50'}`}>{statusMap[r.status]?.label || r.status}</span></td>

                  <td className="px-2 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(r)} className="p-1 hover:bg-blue-500/10 rounded"><Edit2 size={13} /></button>
                      <button onClick={() => remove(r.id)} className="p-1 hover:bg-red-500/10 rounded text-red-500"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      <SmartPagination pagination={pagination} />
        <div className="text-sm text-muted-foreground">סה"כ: {filtered.length} תנועות</div>
      </>)}

      {tab === "by-account" && (
        <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b"><tr>
              <th className="px-3 py-3 text-right">מספר חשבון</th><th className="px-3 py-3 text-right">שם חשבון</th>
              <th className="px-3 py-3 text-right">סוג</th>
              <th className="px-3 py-3 text-right">תנועות</th><th className="px-3 py-3 text-right text-blue-600">חובה</th>
              <th className="px-3 py-3 text-right text-red-600">זכות</th><th className="px-3 py-3 text-right">יתרה</th>
              <th className="px-3 py-3 text-right">תנועה ראשונה</th><th className="px-3 py-3 text-right">תנועה אחרונה</th>
            </tr></thead>
            <tbody>
              {byAccount.length === 0 ? <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">אין נתונים</td></tr> :
              byAccount.map((r: any, i: number) => (
                <tr key={i} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => { setFilterAccount(r.account_number); setTab("entries"); }}>
                  <td className="px-3 py-2 font-mono text-indigo-600 font-bold">{r.account_number}</td>
                  <td className="px-3 py-2 font-medium">{r.account_name}</td>
                  <td className="px-3 py-2 text-xs">{accountTypeMap[r.account_type] || r.account_type}</td>
                  <td className="px-3 py-2 text-center">{r.entry_count}</td>
                  <td className="px-3 py-2 text-blue-600 font-bold">₪{fmt(r.total_debit)}</td>
                  <td className="px-3 py-2 text-red-600 font-bold">₪{fmt(r.total_credit)}</td>
                  <td className={`px-3 py-2 font-bold ${Number(r.balance) >= 0 ? 'text-green-600' : 'text-red-600'}`}>₪{fmt(r.balance)}</td>
                  <td className="px-3 py-2 text-xs">{r.first_entry?.slice(0, 10)}</td>
                  <td className="px-3 py-2 text-xs">{r.last_entry?.slice(0, 10)}</td>
                </tr>
              ))}
              {byAccount.length > 0 && (
                <tr className="font-bold bg-muted/50">
                  <td colSpan={3} className="px-3 py-2">סה"כ</td>
                  <td className="px-3 py-2 text-center">{byAccount.reduce((s: number, r: any) => s + Number(r.entry_count || 0), 0)}</td>
                  <td className="px-3 py-2 text-blue-700">₪{fmt(byAccount.reduce((s: number, r: any) => s + Number(r.total_debit || 0), 0))}</td>
                  <td className="px-3 py-2 text-red-700">₪{fmt(byAccount.reduce((s: number, r: any) => s + Number(r.total_credit || 0), 0))}</td>
                  <td className="px-3 py-2">₪{fmt(byAccount.reduce((s: number, r: any) => s + Number(r.balance || 0), 0))}</td>
                  <td colSpan={2}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "by-period" && (
        <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b"><tr>
              <th className="px-3 py-3 text-right">תקופה</th><th className="px-3 py-3 text-right">שנה</th>
              <th className="px-3 py-3 text-right">תנועות</th><th className="px-3 py-3 text-right text-blue-600">חובה</th>
              <th className="px-3 py-3 text-right text-red-600">זכות</th><th className="px-3 py-3 text-right">נטו</th>
            </tr></thead>
            <tbody>
              {byPeriod.length === 0 ? <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">אין נתונים</td></tr> :
              byPeriod.map((r, i) => {
                const net = Number(r.net || 0);
                return (
                  <tr key={i} className="border-b hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{monthNames[String(r.fiscal_period).padStart(2, '0')] || r.period}</td>
                    <td className="px-3 py-2">{r.fiscal_year}</td>
                    <td className="px-3 py-2 text-center">{r.entry_count}</td>
                    <td className="px-3 py-2 text-blue-600 font-bold">₪{fmt(r.total_debit)}</td>
                    <td className="px-3 py-2 text-red-600 font-bold">₪{fmt(r.total_credit)}</td>
                    <td className={`px-3 py-2 font-bold ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>₪{fmt(net)}</td>
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
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">{editing ? "עריכת רשומה" : "רשומה חדשה בספר ראשי"}</h2>
                <button onClick={() => setShowForm(false)}><X size={20} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium mb-1">חשבון *</label>
                  <select value={form.accountNumber || ""} onChange={handleAccountSelect} className="w-full border rounded-lg px-3 py-2">
                    <option value="">בחר חשבון</option>
                    {accounts.filter((a: any) => !a.is_group).map((a: any) => <option key={a.id} value={a.account_number}>{a.account_number} - {a.account_name_he || a.account_name}</option>)}
                  </select>
                </div>
                <div><label className="block text-sm font-medium mb-1">תאריך *</label><input type="date" value={form.entryDate || ""} onChange={e => setForm({ ...form, entryDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">סטטוס</label>
                  <select value={form.status || "posted"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                    {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2"><label className="block text-sm font-medium mb-1">תיאור</label><input value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">אסמכתא</label><input value={form.reference || ""} onChange={e => setForm({ ...form, reference: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">סכום חובה (₪)</label><input type="number" step="0.01" value={form.debit || ""} onChange={e => setForm({ ...form, debit: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">סכום זכות (₪)</label><input type="number" step="0.01" value={form.credit || ""} onChange={e => setForm({ ...form, credit: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>

                <div><label className="block text-sm font-medium mb-1">סוג מקור</label>
                  <select value={form.sourceType || ""} onChange={e => setForm({ ...form, sourceType: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                    <option value="">ללא</option>
                    {Object.entries(sourceTypeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div><label className="block text-sm font-medium mb-1">מסמך מקור</label><input value={form.sourceDocument || ""} onChange={e => setForm({ ...form, sourceDocument: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">חשבון נגדי</label><input value={form.counterpartAccount || ""} onChange={e => setForm({ ...form, counterpartAccount: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מרכז עלות</label><input value={form.costCenter || ""} onChange={e => setForm({ ...form, costCenter: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מחלקה</label><input value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">פרויקט</label><input value={form.projectName || ""} onChange={e => setForm({ ...form, projectName: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">שנה כספית</label><input type="number" value={form.fiscalYear || ""} onChange={e => setForm({ ...form, fiscalYear: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">תקופה</label><input type="number" min="1" max="12" value={form.fiscalPeriod || ""} onChange={e => setForm({ ...form, fiscalPeriod: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>

                <div className="col-span-3"><label className="block text-sm font-medium mb-1">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={2} /></div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg hover:bg-muted/30">ביטול</button>
                <button onClick={save} className="flex items-center gap-2 bg-indigo-600 text-foreground px-6 py-2 rounded-lg hover:bg-indigo-700 shadow-sm"><Save size={16} /> {editing ? "עדכון" : "שמירה"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedItem(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-slate-700">
              <h2 className="text-xl font-bold text-foreground">פקודת ספר ראשי #{selectedItem.entry_number || selectedItem.id}</h2>
              <button onClick={() => setSelectedItem(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="flex border-b border-border/50">
              {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
              ))}
            </div>
            <div className="p-6">
              {detailTab === "details" && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div><div className="text-xs text-muted-foreground mb-1">תאריך</div><div className="text-sm text-foreground">{selectedItem.entry_date}</div></div>
                  <div><div className="text-xs text-muted-foreground mb-1">תיאור</div><div className="text-sm text-foreground">{selectedItem.description}</div></div>
                  <div><div className="text-xs text-muted-foreground mb-1">חשבון</div><div className="text-sm text-foreground">{selectedItem.account_name || "-"}</div></div>
                  <div><div className="text-xs text-muted-foreground mb-1">חובה</div><div className="text-sm text-green-400 font-bold">₪{Number(selectedItem.debit_amount || 0).toLocaleString()}</div></div>
                  <div><div className="text-xs text-muted-foreground mb-1">זכות</div><div className="text-sm text-red-400 font-bold">₪{Number(selectedItem.credit_amount || 0).toLocaleString()}</div></div>
                  <div><div className="text-xs text-muted-foreground mb-1">אסמכתא</div><div className="text-sm text-foreground">{selectedItem.reference || "-"}</div></div>
                </div>
              )}
              {detailTab === "related" && <RelatedRecords entityType="general-ledger" entityId={selectedItem.id} tabs={[{ key: "journal-entries", label: "פקודות יומן", endpoint: `${API}/journal-entries?gl_entry_id=${selectedItem.id}` }, { key: "accounts", label: "חשבונות", endpoint: `${API}/chart-of-accounts?gl_entry_id=${selectedItem.id}` }]} />}
              {detailTab === "docs" && <AttachmentsSection entityType="general-ledger" entityId={selectedItem.id} />}
              {detailTab === "history" && <ActivityLog entityType="general-ledger" entityId={selectedItem.id} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
