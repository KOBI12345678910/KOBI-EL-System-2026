import { useState, useEffect, useMemo } from "react";
import {
  BookOpen, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2, Eye,
  Clock, AlertTriangle, ArrowUpDown, DollarSign, Printer, Send,
  Mail, Ban, TrendingUp, TrendingDown, BarChart3, Loader2,
  ArrowLeftRight, FileText, Hash, RotateCcw, Scale, Columns,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, PieChart, Pie, Cell } from "recharts";
import ExportDropdown from "@/components/export-dropdown";
import { globalConfirm } from "@/components/confirm-dialog";
import { printPage, sendByEmail } from "@/lib/print-utils";
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

interface JournalEntry {
  id: number; transaction_number: string; transaction_date: string;
  account_number: string; account_name: string; transaction_type: string;
  debit_amount: number; credit_amount: number; description: string;
  reference: string; journal_entry_ref: string;
  fiscal_year: number; fiscal_period: number; status: string; notes: string;
  created_at: string;
}
interface JournalLine { id: string; accountNumber: string; accountName: string; description: string; debit: number; credit: number; }
interface Account { id: number; account_number: string; account_name: string; account_type: string; }

const statusConfig: Record<string, { label: string; color: string }> = {
  posted: { label: "רשום", color: "bg-green-500/20 text-green-300" },
  draft: { label: "טיוטה", color: "bg-amber-500/20 text-amber-300" },
  pending: { label: "ממתין לאישור", color: "bg-blue-500/20 text-blue-300" },
  reversed: { label: "סטורנו", color: "bg-red-500/20 text-red-300" },
  voided: { label: "מבוטל", color: "bg-muted text-muted-foreground/60" },
};

const ACCOUNT_TYPES: Record<string, string> = { asset: "נכסים", liability: "התחייבויות", equity: "הון עצמי", revenue: "הכנסות", expense: "הוצאות", bank: "בנק", cash: "קופה" };
const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];

function newLine(): JournalLine {
  return { id: crypto.randomUUID(), accountNumber: "", accountName: "", description: "", debit: 0, credit: 0 };
}

export default function JournalTransactionsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortField, setSortField] = useState("transaction_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [form, setForm] = useState<any>({});
  const [lines, setLines] = useState<JournalLine[]>([newLine(), newLine()]);
  const [tableLoading, setTableLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<JournalEntry | null>(null);
  const [accountSearch, setAccountSearch] = useState("");
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const token = localStorage.getItem("token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = () => {
    setTableLoading(true);
    Promise.all([
      authFetch(`${API}/finance/journal-transactions`, { headers }).then(r => r.json()).then(d => setItems(safeArray(d))),
      authFetch(`${API}/chart-of-accounts`, { headers }).then(r => r.json()).then(d => setAccounts(safeArray(d))).catch(() => {}),
    ]).finally(() => setTableLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    let f = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (filterType === "all" || i.transaction_type === filterType) &&
      (!search || i.transaction_number?.toLowerCase().includes(search.toLowerCase()) || i.account_number?.toLowerCase().includes(search.toLowerCase()) || i.account_name?.toLowerCase().includes(search.toLowerCase()) || i.description?.toLowerCase().includes(search.toLowerCase()) || i.reference?.toLowerCase().includes(search.toLowerCase()))
    );
    f.sort((a: any, b: any) => { const av = a[sortField], bv = b[sortField]; const cmp = typeof av === "number" ? av - bv : String(av || "").localeCompare(String(bv || "")); return sortDir === "asc" ? cmp : -cmp; });
    return f;
  }, [items, search, filterStatus, filterType, sortField, sortDir]);

  const filteredAccounts = useMemo(() => {
    if (!accountSearch) return accounts.slice(0, 20);
    return accounts.filter(a => a.account_number?.includes(accountSearch) || a.account_name?.includes(accountSearch)).slice(0, 15);
  }, [accounts, accountSearch]);

  const totalDebit = useMemo(() => lines.reduce((s, l) => s + (Number(l.debit) || 0), 0), [lines]);
  const totalCredit = useMemo(() => lines.reduce((s, l) => s + (Number(l.credit) || 0), 0), [lines]);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const openCreate = () => {
    setEditing(null);
    setForm({ transactionDate: new Date().toISOString().slice(0, 10), status: "draft", fiscalYear: new Date().getFullYear(), fiscalPeriod: new Date().getMonth() + 1, description: "", reference: "", notes: "" });
    setLines([newLine(), newLine()]);
    setShowForm(true);
  };

  const openEdit = (r: JournalEntry) => {
    setEditing(r);
    setForm({
      transactionNumber: r.transaction_number, transactionDate: r.transaction_date?.slice(0, 10),
      status: r.status, fiscalYear: r.fiscal_year, fiscalPeriod: r.fiscal_period,
      description: r.description, reference: r.reference, notes: r.notes,
    });
    const parsedLines: JournalLine[] = [{ id: crypto.randomUUID(), accountNumber: r.account_number || "", accountName: r.account_name || "", description: r.description || "", debit: Number(r.debit_amount) || 0, credit: Number(r.credit_amount) || 0 }];
    if (parsedLines[0].debit > 0) parsedLines.push({ id: crypto.randomUUID(), accountNumber: "", accountName: "", description: "", debit: 0, credit: parsedLines[0].debit });
    else if (parsedLines[0].credit > 0) parsedLines.push({ id: crypto.randomUUID(), accountNumber: "", accountName: "", description: "", debit: parsedLines[0].credit, credit: 0 });
    else parsedLines.push(newLine());
    setLines(parsedLines);
    setShowForm(true);
  };

  const updateLine = (id: string, field: keyof JournalLine, value: any) => {
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      if (field === "debit" && Number(value) > 0) updated.credit = 0;
      if (field === "credit" && Number(value) > 0) updated.debit = 0;
      return updated;
    }));
  };

  const selectAccount = (lineId: string, acc: Account) => {
    setLines(prev => prev.map(l => l.id === lineId ? { ...l, accountNumber: acc.account_number, accountName: acc.account_name } : l));
    setActiveLineId(null); setAccountSearch("");
  };

  const addLine = () => setLines(prev => [...prev, newLine()]);
  const removeLine = (id: string) => setLines(prev => prev.length > 2 ? prev.filter(l => l.id !== id) : prev);

  const save = async () => {
    if (!isBalanced && lines.length > 1) return;
    setSaving(true);
    const firstDebitLine = lines.find(l => l.debit > 0) || lines[0];
    const payload = {
      transaction_date: form.transactionDate, account_number: firstDebitLine.accountNumber,
      account_name: firstDebitLine.accountName, transaction_type: firstDebitLine.debit > 0 ? "debit" : "credit",
      debit_amount: totalDebit, credit_amount: totalCredit, description: form.description || lines.map(l => l.description).filter(Boolean).join("; "),
      reference: form.reference, fiscal_year: form.fiscalYear, fiscal_period: form.fiscalPeriod,
      status: form.status, notes: form.notes,
    };
    const url = editing ? `${API}/finance/journal-transactions/${editing.id}` : `${API}/finance/journal-transactions`;
    try {
      await authFetch(url, { method: editing ? "PUT" : "POST", headers, body: JSON.stringify(payload) });
      setShowForm(false); load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    await authFetch(`${API}/finance/journal-transactions/${id}`, { method: "DELETE", headers });
    load();
  };

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };
  const af = [filterStatus !== "all", filterType !== "all"].filter(Boolean).length;

  const totals = useMemo(() => {
    const totalD = items.reduce((s, i) => s + (Number(i.debit_amount) || 0), 0);
    const totalC = items.reduce((s, i) => s + (Number(i.credit_amount) || 0), 0);
    return { debit: totalD, credit: totalC, balance: totalD - totalC, posted: items.filter(i => i.status === "posted").length, draft: items.filter(i => i.status === "draft").length, reversed: items.filter(i => i.status === "reversed").length };
  }, [items]);

  const kpis = [
    { label: "סה״כ תנועות", value: fmtInt(items.length), icon: BookOpen, color: "text-blue-400", bg: "from-blue-500/15 to-blue-600/5 border-blue-500/20" },
    { label: "סה״כ חיוב", value: `₪${fmtInt(totals.debit)}`, icon: TrendingUp, color: "text-emerald-400", bg: "from-emerald-500/15 to-emerald-600/5 border-emerald-500/20" },
    { label: "סה״כ זיכוי", value: `₪${fmtInt(totals.credit)}`, icon: TrendingDown, color: "text-red-400", bg: "from-red-500/15 to-red-600/5 border-red-500/20" },
    { label: "מאזן", value: `₪${fmtInt(Math.abs(totals.balance))}`, icon: Scale, color: Math.abs(totals.balance) < 1 ? "text-green-400" : "text-amber-400", bg: Math.abs(totals.balance) < 1 ? "from-green-500/15 to-green-600/5 border-green-500/20" : "from-amber-500/15 to-amber-600/5 border-amber-500/20" },
    { label: "רשומות", value: fmtInt(totals.posted), icon: CheckCircle2, color: "text-green-400", bg: "from-green-500/15 to-green-600/5 border-green-500/20" },
    { label: "טיוטות", value: fmtInt(totals.draft), icon: Clock, color: "text-amber-400", bg: "from-amber-500/15 to-amber-600/5 border-amber-500/20" },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><BookOpen className="text-blue-400" /> יומן תנועות</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול פקודות יומן — חיוב/זיכוי, קודי חשבון, בקרת איזון</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={items} headers={{ transaction_number: "מספר", transaction_date: "תאריך", account_number: "חשבון", account_name: "שם חשבון", debit_amount: "חיוב", credit_amount: "זיכוי", description: "תיאור", reference: "אסמכתא", status: "סטטוס" }} filename="journal_entries" />
          <Button variant="outline" onClick={() => printPage("יומן תנועות")} className="border-border text-muted-foreground gap-1"><Printer className="h-4 w-4" />הדפסה</Button>
          <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 gap-1"><Plus className="h-4 w-4" />פקודת יומן חדשה</Button>
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
        const months: Record<string, { month: string; debit: number; credit: number }> = {};
        items.forEach(t => {
          const d = t.transaction_date?.slice(0, 7);
          if (!d) return;
          if (!months[d]) months[d] = { month: d, debit: 0, credit: 0 };
          months[d].debit += Number(t.debit_amount || 0);
          months[d].credit += Number(t.credit_amount || 0);
        });
        const trendData = Object.values(months).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
        const heMonth = (m: string) => { const [y, mo] = m.split("-"); return `${mo}/${y.slice(2)}`; };
        const ts = { backgroundColor: "#1a1a2e", border: "1px solid #2a2a3e", borderRadius: "8px" };

        const acctSummary: Record<string, { name: string; total: number }> = {};
        items.forEach(t => {
          const key = t.account_number || "unknown";
          if (!acctSummary[key]) acctSummary[key] = { name: t.account_name || key, total: 0 };
          acctSummary[key].total += (Number(t.debit_amount) || 0) + (Number(t.credit_amount) || 0);
        });
        const pieData = Object.entries(acctSummary).sort((a, b) => b[1].total - a[1].total).slice(0, 7).map(([k, v]) => ({ name: v.name || k, value: v.total }));

        return trendData.length > 1 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-card/80 border-border"><CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground"><BarChart3 className="h-4 w-4 text-blue-400" /> חיוב מול זיכוי לפי חודש</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                  <XAxis dataKey="month" tickFormatter={heMonth} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#2a2a3e" }} />
                  <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#2a2a3e" }} />
                  <Tooltip formatter={(v: number) => `₪${fmt(v)}`} labelFormatter={heMonth} contentStyle={ts} />
                  <Legend formatter={(v: string) => <span className="text-xs text-muted-foreground">{v === "debit" ? "חיוב" : "זיכוי"}</span>} />
                  <Bar dataKey="debit" fill="#10b981" radius={[4, 4, 0, 0]} name="debit" />
                  <Bar dataKey="credit" fill="#ef4444" radius={[4, 4, 0, 0]} name="credit" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent></Card>
            {pieData.length > 1 && (
              <Card className="bg-card/80 border-border"><CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground"><Columns className="h-4 w-4 text-purple-400" /> חלוקה לפי חשבון (Top 7)</div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                      {pieData.map((_e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => `₪${fmt(v)}`} contentStyle={ts} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 mt-2 justify-center">{pieData.map((p, i) => <span key={i} className="text-[10px] text-muted-foreground flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />{p.name}</span>)}</div>
              </CardContent></Card>
            )}
          </div>
        ) : null;
      })()}

      <Card className="bg-card/60 border-border"><CardContent className="p-3"><div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => { setSearch(e.target.value); pagination.setPage(1); }} placeholder="חיפוש לפי מספר, חשבון, תיאור, אסמכתא..." className="pr-9 bg-input border-border text-foreground" /></div>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); pagination.setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל הסטטוסים</option>{Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select value={filterType} onChange={e => { setFilterType(e.target.value); pagination.setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל הסוגים</option><option value="debit">חיוב</option><option value="credit">זיכוי</option></select>
        {af > 0 && <Button variant="ghost" size="sm" onClick={() => { setFilterStatus("all"); setFilterType("all"); setSearch(""); }} className="text-red-400 hover:text-red-300 gap-1"><X className="h-3 w-3" />נקה</Button>}
      </div></CardContent></Card>

      <BulkActions items={filtered} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
        defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/finance/journal-transactions/${id}`, { method: "DELETE", headers }))); load(); }),
        defaultBulkActions.export(async (ids) => { const sel = filtered.filter(i => ids.includes(String(i.id))); const csv = "מספר,תאריך,חשבון,שם חשבון,חיוב,זיכוי,תיאור,אסמכתא,סטטוס\n" + sel.map(i => `${i.transaction_number},${i.transaction_date?.slice(0, 10)},${i.account_number},${i.account_name},${i.debit_amount},${i.credit_amount},${i.description},${i.reference},${statusConfig[i.status]?.label || i.status}`).join("\n"); const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "journal_entries.csv"; a.click(); }),
      ]} />

      <Card className="bg-card/80 border-border"><CardContent className="p-0">
        <div className="overflow-x-auto relative">
          {tableLoading && <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center z-10"><div className="flex items-center gap-2 bg-card border border-border rounded-lg px-4 py-2 shadow-lg"><Loader2 className="w-4 h-4 animate-spin text-blue-400" /><span className="text-sm text-foreground">טוען תנועות יומן...</span></div></div>}
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-background/50">
              <th className="px-3 py-3 w-10"><input type="checkbox" className="rounded" onChange={() => toggleAll(filtered)} /></th>
              {[{ key: "transaction_number", label: "מספר" }, { key: "transaction_date", label: "תאריך" }, { key: "account_number", label: "חשבון" }, { key: "account_name", label: "שם חשבון" }, { key: "debit_amount", label: "חיוב (₪)" }, { key: "credit_amount", label: "זיכוי (₪)" }, { key: "description", label: "תיאור" }, { key: "reference", label: "אסמכתא" }, { key: "status", label: "סטטוס" }].map(col => (
                <th key={col.key} className="px-3 py-3 text-right text-muted-foreground font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort(col.key)}><div className="flex items-center gap-1 text-xs">{col.label}<ArrowUpDown className="h-3 w-3" /></div></th>
              ))}
              <th className="px-3 py-3 text-center text-muted-foreground font-medium text-xs">פעולות</th>
            </tr></thead>
            <tbody>
              {!tableLoading && pagination.paginate(filtered).length === 0 ? (
                <tr><td colSpan={11} className="p-16 text-center"><div className="flex flex-col items-center gap-4">{(af > 0 || search) ? <Search className="h-12 w-12 text-muted-foreground" /> : <BookOpen className="h-12 w-12 text-muted-foreground" />}<p className="text-lg font-medium text-muted-foreground">{(af > 0 || search) ? "לא נמצאו תוצאות" : "עדיין אין תנועות ביומן"}</p><p className="text-sm text-muted-foreground/60">{(af > 0 || search) ? "נסה לשנות את הסינון" : "צור פקודת יומן ראשונה"}</p>{!(af > 0 || search) && <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 gap-2 mt-2"><Plus className="h-4 w-4" />פקודת יומן חדשה</Button>}</div></td></tr>
              ) : pagination.paginate(filtered).map(r => {
                const d = Number(r.debit_amount) || 0;
                const c = Number(r.credit_amount) || 0;
                return (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setSelectedItem(r)}>
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}><input type="checkbox" checked={isSelected(String(r.id))} onChange={() => toggle(String(r.id))} className="rounded" /></td>
                    <td className="px-3 py-2.5 font-mono text-xs text-blue-400 font-bold">{r.transaction_number}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.transaction_date?.slice(0, 10)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-cyan-400">{r.account_number || "—"}</td>
                    <td className="px-3 py-2.5 text-foreground text-xs max-w-[120px] truncate">{r.account_name || "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{d > 0 ? <span className="text-emerald-400 font-bold">₪{fmt(d)}</span> : <span className="text-muted-foreground/40">—</span>}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{c > 0 ? <span className="text-red-400 font-bold">₪{fmt(c)}</span> : <span className="text-muted-foreground/40">—</span>}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[160px] truncate">{r.description || "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{r.reference || "—"}</td>
                    <td className="px-3 py-2.5"><Badge className={`${statusConfig[r.status]?.color || "bg-muted"} border-0 text-[10px]`}>{statusConfig[r.status]?.label || r.status}</Badge></td>
                    <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => setSelectedItem(r)}><Eye className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-blue-400" onClick={() => openEdit(r)}><Edit2 className="h-3.5 w-3.5" /></Button>
                        {isSuperAdmin && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400" onClick={async () => { if (await globalConfirm(`למחוק את תנועת יומן '${r.transaction_number}'? פעולה זו אינה ניתנת לביטול.`)) remove(r.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot><tr className="border-t-2 border-border bg-background/50 font-bold text-sm">
                <td className="px-3 py-3" /><td className="px-3 py-3 text-foreground" colSpan={4}>סה״כ ({filtered.length} תנועות)</td>
                <td className="px-3 py-3 font-mono text-xs text-emerald-400">₪{fmt(filtered.reduce((s, r) => s + (Number(r.debit_amount) || 0), 0))}</td>
                <td className="px-3 py-3 font-mono text-xs text-red-400">₪{fmt(filtered.reduce((s, r) => s + (Number(r.credit_amount) || 0), 0))}</td>
                <td colSpan={4} className="px-3 py-3">
                  {(() => { const d = filtered.reduce((s, r) => s + (Number(r.debit_amount) || 0), 0); const c = filtered.reduce((s, r) => s + (Number(r.credit_amount) || 0), 0); const bal = Math.abs(d - c); return bal < 0.01 ? <span className="flex items-center gap-1 text-green-400 text-xs"><CheckCircle2 className="h-3 w-3" />מאוזן</span> : <span className="flex items-center gap-1 text-amber-400 text-xs"><AlertTriangle className="h-3 w-3" />הפרש: ₪{fmt(bal)}</span>; })()}
                </td>
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
                  <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת פקודת יומן" : "פקודת יומן חדשה"}</h2>
                  {editing && <Badge className="bg-blue-500/20 text-blue-300 border-0 font-mono text-xs">{form.transactionNumber}</Badge>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}><X className="h-4 w-4" /></Button>
              </div>
              <div className="p-4 space-y-5">
                <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">פרטי פקודה</h3></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><Label className="text-muted-foreground text-xs">תאריך *</Label><Input type="date" value={form.transactionDate || ""} onChange={e => setForm({ ...form, transactionDate: e.target.value })} className="bg-input border-border text-foreground mt-1" /></div>
                  <div><Label className="text-muted-foreground text-xs">שנת כספים</Label><Input type="number" value={form.fiscalYear || ""} onChange={e => setForm({ ...form, fiscalYear: Number(e.target.value) })} className="bg-input border-border text-foreground mt-1 font-mono" /></div>
                  <div><Label className="text-muted-foreground text-xs">תקופה</Label><select value={form.fiscalPeriod || 1} onChange={e => setForm({ ...form, fiscalPeriod: Number(e.target.value) })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></div>
                  <div><Label className="text-muted-foreground text-xs">סטטוס</Label><select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">{Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-muted-foreground text-xs">תיאור כללי</Label><Input value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="תיאור הפקודה..." className="bg-input border-border text-foreground mt-1" /></div>
                  <div><Label className="text-muted-foreground text-xs">אסמכתא</Label><Input value={form.reference || ""} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="מספר מסמך מקור..." className="bg-input border-border text-foreground mt-1 font-mono" /></div>
                </div>

                <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">שורות חיוב/זיכוי</h3></div>
                <div className="bg-input rounded-lg border border-border overflow-visible">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border bg-card/50">
                      <th className="px-3 py-2 text-right text-muted-foreground text-xs font-medium w-8">#</th>
                      <th className="px-3 py-2 text-right text-muted-foreground text-xs font-medium w-28">קוד חשבון</th>
                      <th className="px-3 py-2 text-right text-muted-foreground text-xs font-medium">שם חשבון</th>
                      <th className="px-3 py-2 text-right text-muted-foreground text-xs font-medium">תיאור</th>
                      <th className="px-3 py-2 text-right text-muted-foreground text-xs font-medium w-28">חיוב (₪)</th>
                      <th className="px-3 py-2 text-right text-muted-foreground text-xs font-medium w-28">זיכוי (₪)</th>
                      <th className="px-3 py-2 w-10" />
                    </tr></thead>
                    <tbody>
                      {lines.map((li, idx) => (
                        <tr key={li.id} className="border-b border-border/50">
                          <td className="px-3 py-2 text-muted-foreground text-xs">{idx + 1}</td>
                          <td className="px-3 py-1 relative">
                            <Input value={li.accountNumber} onChange={e => { updateLine(li.id, "accountNumber", e.target.value); setAccountSearch(e.target.value); setActiveLineId(li.id); }} onFocus={() => { setActiveLineId(li.id); setAccountSearch(li.accountNumber); }} placeholder="קוד..." className="bg-transparent border-0 text-cyan-400 h-8 px-1 text-sm font-mono" />
                            {activeLineId === li.id && filteredAccounts.length > 0 && (
                              <div className="absolute z-30 top-full mt-0 right-0 w-72 bg-card border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                {filteredAccounts.map(a => (
                                  <button key={a.id} onClick={() => selectAccount(li.id, a)} className="w-full px-3 py-2 text-right text-sm hover:bg-muted transition-colors flex items-center gap-2 border-b border-border/30">
                                    <span className="font-mono text-xs text-cyan-400 min-w-[60px]">{a.account_number}</span>
                                    <span className="text-foreground text-xs truncate flex-1">{a.account_name}</span>
                                    <span className="text-muted-foreground text-[10px]">{ACCOUNT_TYPES[a.account_type] || a.account_type}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-1"><Input value={li.accountName} onChange={e => updateLine(li.id, "accountName", e.target.value)} placeholder="שם חשבון..." className="bg-transparent border-0 text-foreground h-8 px-1 text-sm" /></td>
                          <td className="px-3 py-1"><Input value={li.description} onChange={e => updateLine(li.id, "description", e.target.value)} placeholder="תיאור..." className="bg-transparent border-0 text-foreground h-8 px-1 text-sm" /></td>
                          <td className="px-3 py-1"><Input type="number" min={0} step={0.01} value={li.debit || ""} onChange={e => updateLine(li.id, "debit", Number(e.target.value) || 0)} className="bg-transparent border-0 text-emerald-400 h-8 px-1 text-sm font-mono text-center" /></td>
                          <td className="px-3 py-1"><Input type="number" min={0} step={0.01} value={li.credit || ""} onChange={e => updateLine(li.id, "credit", Number(e.target.value) || 0)} className="bg-transparent border-0 text-red-400 h-8 px-1 text-sm font-mono text-center" /></td>
                          <td className="px-3 py-2"><Button variant="ghost" size="sm" onClick={() => removeLine(li.id)} className="h-6 w-6 p-0 text-red-400 hover:text-red-300" disabled={lines.length <= 2}><X className="h-3 w-3" /></Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="p-2 border-t border-border flex items-center justify-between">
                    <Button variant="ghost" size="sm" onClick={addLine} className="text-blue-400 hover:text-blue-300 gap-1 text-xs"><Plus className="h-3 w-3" />הוסף שורה</Button>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-muted-foreground">סה״כ חיוב: <span className="text-emerald-400 font-mono font-bold">₪{fmt(totalDebit)}</span></span>
                      <span className="text-xs text-muted-foreground">סה״כ זיכוי: <span className="text-red-400 font-mono font-bold">₪{fmt(totalCredit)}</span></span>
                      {isBalanced ? (
                        <Badge className="bg-green-500/20 text-green-300 border-0 gap-1"><CheckCircle2 className="h-3 w-3" />מאוזן</Badge>
                      ) : (
                        <Badge className="bg-red-500/20 text-red-300 border-0 gap-1"><AlertTriangle className="h-3 w-3" />הפרש: ₪{fmt(Math.abs(totalDebit - totalCredit))}</Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">הערות</h3></div>
                <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground resize-none" placeholder="הערות לפקודת יומן..." />
              </div>
              <div className="flex items-center gap-2 p-4 border-t border-border justify-between">
                <div>{!isBalanced && <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />הפקודה לא מאוזנת — חיוב וזיכוי חייבים להיות שווים</p>}</div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowForm(false)} className="border-border">ביטול</Button>
                  <Button onClick={save} disabled={saving || (!isBalanced && lines.length > 1)} className="bg-blue-600 hover:bg-blue-700 gap-1"><Save className="h-4 w-4" />{saving ? "שומר..." : editing ? "עדכן" : "שמור"}</Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setSelectedItem(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-foreground">{selectedItem.transaction_number}</h2>
                <Badge className={`${statusConfig[selectedItem.status]?.color || "bg-muted"} border-0`}>{statusConfig[selectedItem.status]?.label || selectedItem.status}</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedItem(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { l: "תאריך", v: selectedItem.transaction_date?.slice(0, 10) },
                  { l: "שנת כספים", v: String(selectedItem.fiscal_year || "—") },
                  { l: "תקופה", v: String(selectedItem.fiscal_period || "—") },
                  { l: "אסמכתא", v: selectedItem.reference || "—" },
                  { l: "קוד חשבון", v: selectedItem.account_number || "—" },
                  { l: "שם חשבון", v: selectedItem.account_name || "—" },
                ].map((d, i) => (
                  <div key={i} className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">{d.l}</p><p className="text-foreground mt-1 font-medium text-sm">{d.v}</p></div>
                ))}
              </div>

              <div className="bg-input rounded-lg border border-border p-4">
                <div className="grid grid-cols-2 gap-6">
                  <div className="text-center">
                    <p className="text-[11px] text-muted-foreground mb-1">חיוב</p>
                    <p className="text-2xl font-bold font-mono text-emerald-400">₪{fmt(selectedItem.debit_amount)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[11px] text-muted-foreground mb-1">זיכוי</p>
                    <p className="text-2xl font-bold font-mono text-red-400">₪{fmt(selectedItem.credit_amount)}</p>
                  </div>
                </div>
                <hr className="border-border my-3" />
                <div className="flex items-center justify-center gap-2">
                  {Math.abs(Number(selectedItem.debit_amount) - Number(selectedItem.credit_amount)) < 0.01 ? (
                    <Badge className="bg-green-500/20 text-green-300 border-0 gap-1"><CheckCircle2 className="h-3 w-3" />מאוזן</Badge>
                  ) : (
                    <Badge className="bg-amber-500/20 text-amber-300 border-0 gap-1"><AlertTriangle className="h-3 w-3" />הפרש: ₪{fmt(Math.abs(Number(selectedItem.debit_amount) - Number(selectedItem.credit_amount)))}</Badge>
                  )}
                </div>
              </div>

              {selectedItem.description && <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground mb-1">תיאור</p><p className="text-sm text-foreground">{selectedItem.description}</p></div>}
              {selectedItem.notes && <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground mb-1">הערות</p><p className="text-sm text-foreground">{selectedItem.notes}</p></div>}

              {selectedItem.status === "posted" && (
                <Button variant="outline" size="sm" className="border-red-500/30 text-red-400 gap-1" onClick={async () => {
                  await authFetch(`${API}/finance/journal-transactions/${selectedItem.id}`, { method: "PUT", headers, body: JSON.stringify({ status: "reversed" }) });
                  load(); setSelectedItem(null);
                }}><RotateCcw className="h-3 w-3" />סטורנו</Button>
              )}
              {selectedItem.status === "draft" && (
                <Button variant="outline" size="sm" className="border-green-500/30 text-green-400 gap-1" onClick={async () => {
                  await authFetch(`${API}/finance/journal-transactions/${selectedItem.id}`, { method: "PUT", headers, body: JSON.stringify({ status: "posted" }) });
                  load(); setSelectedItem(null);
                }}><CheckCircle2 className="h-3 w-3" />רשום</Button>
              )}
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-border justify-end">
              <Button variant="outline" className="border-border gap-1" onClick={() => printPage(`פקודת יומן ${selectedItem.transaction_number}`)}><Printer className="h-4 w-4" />הדפסה</Button>
              <Button onClick={() => { openEdit(selectedItem); setSelectedItem(null); }} className="bg-blue-600 hover:bg-blue-700 gap-1"><Edit2 className="h-4 w-4" />ערוך</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
