import React, { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2, Download, FileText, BarChart3, Settings, Landmark, Edit2, Plus, Trash2, RefreshCw,
  HelpCircle, CheckCircle2, AlertTriangle, X, Save, BookOpen, Calculator, Receipt, CreditCard,
  ArrowUpDown, TrendingUp, TrendingDown, DollarSign, FileSpreadsheet, Search, Filter,
  ChevronLeft, ChevronRight, Percent, Scale, Wallet, Clock, Calendar, ArrowRight,
  PieChart, List, LayoutGrid, Eye, Printer, ClipboardList, Shield, AlertCircle, Hash
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import StatusTransition from "@/components/status-transition";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || d?.rows || []);
const fmt = (v: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);
const fmtNum = (v: number) => new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 }).format(v);
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("he-IL") : "—";

type Tab = "dashboard" | "journal" | "ledger" | "chart" | "balance" | "pnl" | "trial" | "reports" | "vat" | "bank" | "settings";

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: "dashboard", label: "לוח בקרה", icon: LayoutGrid },
  { id: "journal", label: "תנועות יומן", icon: BookOpen },
  { id: "ledger", label: "כרטסת", icon: FileSpreadsheet },
  { id: "chart", label: "מפתח חשבונות", icon: List },
  { id: "balance", label: "מאזן", icon: Scale },
  { id: "pnl", label: "רווח והפסד", icon: BarChart3 },
  { id: "trial", label: "מאזן בוחן", icon: Scale },
  { id: "reports", label: "דוחות כספיים", icon: BarChart3 },
  { id: "vat", label: 'מע"מ ומיסים', icon: Percent },
  { id: "bank", label: "בנקים", icon: Landmark },
  { id: "settings", label: "הגדרות", icon: Settings },
];

function KPICard({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: any; color: string }) {
  return (
    <Card className="bg-slate-900/60 border-slate-700/40 hover:border-slate-600/50 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className={`text-xl font-bold font-mono mt-1 ${color}`}>{value}</p>
            {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`w-9 h-9 rounded-lg bg-slate-800/80 flex items-center justify-center`}>
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardTab() {
  const { data: overview } = useQuery({
    queryKey: ["finance-overview"],
    queryFn: async () => { const r = await authFetch(`${API}/financial-reports/overview`); return r.json(); },
  });
  const { data: glStats } = useQuery({
    queryKey: ["gl-stats"],
    queryFn: async () => { const r = await authFetch(`${API}/general-ledger/stats`); return r.json(); },
  });
  const { data: arStats } = useQuery({
    queryKey: ["ar-stats"],
    queryFn: async () => { const r = await authFetch(`${API}/ar/stats`); return r.json(); },
  });
  const { data: apStats } = useQuery({
    queryKey: ["ap-stats"],
    queryFn: async () => { const r = await authFetch(`${API}/ap/stats`); return r.json(); },
  });

  const totalAR = arStats?.totalOutstanding || overview?.accountsReceivable?.total || 0;
  const totalAP = apStats?.totalOutstanding || overview?.accountsPayable?.total || 0;
  const totalDebit = glStats?.totalDebit || 0;
  const totalCredit = glStats?.totalCredit || 0;
  const revenue = overview?.revenue || overview?.incomeStatement?.revenue || 0;
  const expenses = overview?.expenses || overview?.incomeStatement?.expenses || 0;
  const netIncome = revenue - expenses;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label="הכנסות" value={fmt(revenue)} icon={TrendingUp} color="text-emerald-400" />
        <KPICard label="הוצאות" value={fmt(expenses)} icon={TrendingDown} color="text-red-400" />
        <KPICard label="רווח נקי" value={fmt(netIncome)} icon={DollarSign} color={netIncome >= 0 ? "text-emerald-400" : "text-red-400"} />
        <KPICard label="תזרים מזומנים" value={fmt(overview?.cashBalance || 0)} icon={Wallet} color="text-blue-400" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label="חייבים (AR)" value={fmt(totalAR)} sub={`${arStats?.overdueCount || 0} באיחור`} icon={Receipt} color="text-orange-400" />
        <KPICard label="זכאים (AP)" value={fmt(totalAP)} sub={`${apStats?.overdueCount || 0} באיחור`} icon={CreditCard} color="text-purple-400" />
        <KPICard label={'סה"כ חיוב'} value={fmt(totalDebit)} icon={ArrowUpDown} color="text-cyan-400" />
        <KPICard label={'סה"כ זיכוי'} value={fmt(totalCredit)} icon={ArrowUpDown} color="text-pink-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-blue-400" />מועדי הגשה קרובים</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: 'דיווח מע"מ חודשי', date: "15 בחודש הבא", type: 'מע"מ', urgent: true },
              { label: "מקדמות מס הכנסה", date: "15 בחודש הבא", type: "מס הכנסה", urgent: false },
              { label: "דוח ניכויים (856)", date: "15 בחודש הבא", type: "ניכויים", urgent: false },
              { label: "תשלום ביטוח לאומי", date: "15 בחודש הבא", type: 'בט"ל', urgent: false },
              { label: "דוח שנתי מס הכנסה", date: "31 במאי", type: "שנתי", urgent: false },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-800/40 last:border-0">
                <div className="flex items-center gap-2">
                  {item.urgent ? <AlertCircle className="w-3.5 h-3.5 text-orange-400" /> : <Calendar className="w-3.5 h-3.5 text-muted-foreground" />}
                  <span className="text-sm text-slate-300">{item.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-slate-700/30 text-muted-foreground text-[9px]">{item.type}</Badge>
                  <span className="text-xs text-muted-foreground">{item.date}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ClipboardList className="w-4 h-4 text-emerald-400" />פעולות מהירות</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {[
              { label: "הפקת חשבונית", icon: Receipt, href: "/finance/income" },
              { label: "רישום הוצאה", icon: CreditCard, href: "/finance/expenses" },
              { label: "פקודת יומן", icon: BookOpen, href: "/finance/journal-entries" },
              { label: "התאמת בנק", icon: Landmark, href: "/finance/bank-reconciliation" },
              { label: "דוח רווח והפסד", icon: BarChart3, href: "/finance/profit-loss" },
              { label: "מאזן", icon: Scale, href: "/finance/balance-sheet" },
              { label: 'דוח מע"מ', icon: Percent, href: "/finance/vat-report" },
              { label: "גביית לקוחות", icon: DollarSign, href: "/finance/accounts-receivable" },
            ].map((action, i) => (
              <a key={i} href={action.href}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-800/30 hover:bg-slate-800/60 border border-slate-700/30 hover:border-slate-600/50 transition-colors">
                <action.icon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="text-xs text-slate-300">{action.label}</span>
              </a>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function JournalDetailLines({ entryId, lines, debitName, creditName, description, amount }: { entryId: number; lines?: any[]; debitName: string; creditName: string; description: string; amount: number }) {
  const hasApiLines = lines && lines.length > 0;
  const displayLines = hasApiLines ? lines : [
    { line_number: 1, account_name: debitName || "—", description, debit_amount: amount, credit_amount: 0 },
    { line_number: 2, account_name: creditName || "—", description, debit_amount: 0, credit_amount: amount },
  ];
  const sumDebit = displayLines.reduce((s: number, l: any) => s + Number(l.debit_amount || 0), 0);
  const sumCredit = displayLines.reduce((s: number, l: any) => s + Number(l.credit_amount || 0), 0);
  const isBalanced = Math.abs(sumDebit - sumCredit) < 0.01;

  return (
    <div className="border border-slate-700/40 rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead><tr className="bg-slate-800/50 border-b border-slate-700/30">
          <th className="p-2 text-right text-muted-foreground w-[40px]">שורה</th>
          <th className="p-2 text-right text-muted-foreground">חשבון</th>
          <th className="p-2 text-right text-muted-foreground">תיאור</th>
          <th className="p-2 text-right text-muted-foreground w-[100px]">חיוב (₪)</th>
          <th className="p-2 text-right text-muted-foreground w-[100px]">זיכוי (₪)</th>
        </tr></thead>
        <tbody>
          {!lines && (
            <tr><td colSpan={5} className="p-2 text-center text-muted-foreground text-[10px]">טוען שורות...</td></tr>
          )}
          {displayLines.map((l: any, i: number) => {
            const dAmt = Number(l.debit_amount || 0);
            const cAmt = Number(l.credit_amount || 0);
            return (
              <tr key={l.id || i} className="border-b border-slate-800/30">
                <td className="p-2 text-muted-foreground font-mono text-center">{l.line_number || i + 1}</td>
                <td className="p-2 font-medium">
                  <span className={dAmt > 0 ? "text-emerald-400" : "text-red-400"}>
                    {l.account_number ? `${l.account_number} — ` : ""}{l.account_name || "—"}
                  </span>
                </td>
                <td className="p-2 text-slate-300">{l.description || description}</td>
                <td className="p-2 text-emerald-400 font-mono font-bold text-left" dir="ltr">{dAmt > 0 ? fmtNum(dAmt) : ""}</td>
                <td className="p-2 text-red-400 font-mono font-bold text-left" dir="ltr">{cAmt > 0 ? fmtNum(cAmt) : ""}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot><tr className="bg-slate-800/40 border-t border-slate-600">
          <td colSpan={3} className="p-2 text-foreground font-bold flex items-center gap-2">
            {'סה"כ'}
            {isBalanced ? (
              <span className="text-[9px] text-emerald-400 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" />מאוזן</span>
            ) : (
              <span className="text-[9px] text-yellow-400 flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" />לא מאוזן</span>
            )}
          </td>
          <td className="p-2 text-emerald-400 font-mono font-bold text-left" dir="ltr">{fmtNum(sumDebit)}</td>
          <td className="p-2 text-red-400 font-mono font-bold text-left" dir="ltr">{fmtNum(sumCredit)}</td>
        </tr></tfoot>
      </table>
    </div>
  );
}

function JournalTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedLines, setExpandedLines] = useState<Record<number, any[]>>({});
  const [showNewEntry, setShowNewEntry] = useState(false);
  const [newEntry, setNewEntry] = useState({ description: "", reference: "", entryDate: new Date().toISOString().slice(0, 10), debitAccountName: "", creditAccountName: "", amount: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const journalValidation = useFormValidation({ description: { required: true }, amount: { required: true, min: 0 } });

  const { data: entries, isLoading, refetch } = useQuery({
    queryKey: ["journal-entries"],
    queryFn: async () => { const r = await authFetch(`${API}/journal-entries`); const d = await r.json(); return safeArray(d); },
  });
  const { data: stats } = useQuery({
    queryKey: ["journal-stats"],
    queryFn: async () => { const r = await authFetch(`${API}/journal-entries/stats`); return r.json(); },
  });
  const { data: accounts } = useQuery({
    queryKey: ["coa-for-journal"],
    queryFn: async () => { const r = await authFetch(`${API}/chart-of-accounts`); const d = await r.json(); return safeArray(d); },
  });

  const loadLines = async (entryId: number) => {
    try {
      const r = await authFetch(`${API}/journal-entries/${entryId}/lines`);
      const d = await r.json();
      setExpandedLines(prev => ({ ...prev, [entryId]: safeArray(d) }));
    } catch { setExpandedLines(prev => ({ ...prev, [entryId]: [] })); }
  };

  const toggleExpand = (id: number) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!expandedLines[id]) loadLines(id);
  };

  const filtered = useMemo(() => {
    let items = entries || [];
    if (search) items = items.filter((e: any) =>
      (e.description || "").includes(search) ||
      (e.entry_number || "").toString().includes(search) ||
      (e.reference || "").includes(search) ||
      (e.debit_account_name || "").includes(search) ||
      (e.credit_account_name || "").includes(search)
    );
    if (statusFilter) items = items.filter((e: any) => e.status === statusFilter);
    return items;
  }, [entries, search, statusFilter]);

  const totalDebit = filtered.reduce((s: number, e: any) => s + Number(e.amount || e.total_debit || 0), 0);
  const totalCredit = filtered.reduce((s: number, e: any) => s + Number(e.amount || e.total_credit || 0), 0);

  const canSave = newEntry.description && newEntry.amount && Number(newEntry.amount) > 0 && newEntry.debitAccountName && newEntry.creditAccountName && newEntry.debitAccountName !== newEntry.creditAccountName;

  const handleCreate = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await authFetch(`${API}/journal-entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: newEntry.description,
          reference: newEntry.reference || null,
          entryDate: newEntry.entryDate,
          debitAccountName: newEntry.debitAccountName || null,
          creditAccountName: newEntry.creditAccountName || null,
          amount: Number(newEntry.amount),
          notes: newEntry.notes || null,
          status: "draft",
        }),
      });
      setShowNewEntry(false);
      setNewEntry({ description: "", reference: "", entryDate: new Date().toISOString().slice(0, 10), debitAccountName: "", creditAccountName: "", amount: "", notes: "" });
      refetch();
    } catch {}
    setSaving(false);
  };

  const handlePost = async (id: number) => {
    await authFetch(`${API}/journal-entries/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "posted" }),
    });
    refetch();
  };

  const statusLabels: Record<string, string> = { posted: "רשום", draft: "טיוטה", void: "מבוטל", reversed: "מבוטל", pending_approval: "ממתין", approved: "מאושר" };
  const statusColors: Record<string, string> = { posted: "bg-green-500/15 text-green-400", draft: "bg-yellow-500/15 text-yellow-400", void: "bg-red-500/15 text-red-400", reversed: "bg-red-500/15 text-red-400", pending_approval: "bg-blue-500/15 text-blue-400", approved: "bg-emerald-500/15 text-emerald-400" };
  const entryTypeLabels: Record<string, string> = { standard: "רגילה", adjusting: "התאמה", closing: "סגירה", opening: "פתיחה", reversal: "ביטול", recurring: "חוזרת" };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2"><BookOpen className="w-4 h-4 text-emerald-400" />יומן — פקודות יומן (הנה״ח כפולה)</h3>
        <div className="flex items-center gap-2">
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowNewEntry(!showNewEntry)}>
            <Plus className="w-3.5 h-3.5 ml-1" />פקודת יומן חדשה
          </Button>
          <Button variant="outline" size="sm" className="border-slate-600" onClick={() => refetch()}><RefreshCw className="w-3.5 h-3.5" /></Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
          <KPICard label={'סה"כ פקודות'} value={String(stats.total || 0)} icon={BookOpen} color="text-foreground" />
          <KPICard label="רשומות" value={String(stats.posted || 0)} icon={CheckCircle2} color="text-green-400" />
          <KPICard label="טיוטות" value={String(stats.drafts || 0)} icon={Edit2} color="text-yellow-400" />
          <KPICard label="חיובים החודש" value={fmt(Number(stats.month_amount || 0))} icon={TrendingUp} color="text-emerald-400" />
          <KPICard label={'סה"כ חיוב'} value={fmt(Number(stats.total_debit || stats.total_amount || 0))} icon={ArrowUpDown} color="text-cyan-400" />
          <KPICard label={'סה"כ זיכוי'} value={fmt(Number(stats.total_credit || stats.total_amount || 0))} icon={ArrowUpDown} color="text-pink-400" />
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} className="bg-slate-800 border-slate-700 pr-9 text-sm" placeholder="חיפוש לפי תיאור, מספר, אסמכתא, חשבון..." />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-foreground">
          <option value="">כל הסטטוסים</option>
          <option value="draft">טיוטה</option>
          <option value="posted">רשום</option>
          <option value="void">מבוטל</option>
          <option value="reversed">סטורנו</option>
        </select>
      </div>

      {showNewEntry && (
        <Card className="bg-slate-800/50 border-emerald-500/30">
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-emerald-400 flex items-center gap-2"><Plus className="w-4 h-4" />פקודת יומן חדשה — הנה״ח כפולה</CardTitle>
              <button onClick={() => setShowNewEntry(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div><Label className="text-xs text-muted-foreground">תאריך *</Label><Input type="date" value={newEntry.entryDate} onChange={e => setNewEntry({ ...newEntry, entryDate: e.target.value })} className="bg-slate-900 border-slate-600 mt-1 text-sm" /></div>
              <div className="col-span-2 lg:col-span-1"><Label className="text-xs text-muted-foreground">תיאור *</Label><Input value={newEntry.description} onChange={e => setNewEntry({ ...newEntry, description: e.target.value })} className="bg-slate-900 border-slate-600 mt-1 text-sm" placeholder="תיאור הפקודה" /></div>
              <div><Label className="text-xs text-muted-foreground">אסמכתא</Label><Input value={newEntry.reference} onChange={e => setNewEntry({ ...newEntry, reference: e.target.value })} className="bg-slate-900 border-slate-600 mt-1 text-sm font-mono" placeholder="INV-001" /></div>
              <div><Label className="text-xs text-muted-foreground">סכום (₪) *</Label><Input type="number" value={newEntry.amount} onChange={e => setNewEntry({ ...newEntry, amount: e.target.value })} className="bg-slate-900 border-slate-600 mt-1 text-sm font-mono" placeholder="0.00" /></div>
            </div>

            <div className="border border-slate-700/50 rounded-lg p-3 bg-slate-900/30">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">תנועה כפולה — חיוב / זיכוי</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="border-l border-slate-700/40 pl-4">
                  <p className="text-xs font-medium text-emerald-400 mb-1.5 flex items-center gap-1"><ArrowUpDown className="w-3 h-3" />חשבון חיוב (ח׳)</p>
                  <select value={newEntry.debitAccountName} onChange={e => setNewEntry({ ...newEntry, debitAccountName: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-foreground">
                    <option value="">בחר חשבון לחיוב...</option>
                    {(accounts || []).filter((a: any) => !a.is_group).map((a: any) => (
                      <option key={a.id} value={a.account_name}>{a.account_number} — {a.account_name}</option>
                    ))}
                  </select>
                  {newEntry.amount && <p className="text-sm font-mono text-emerald-400 mt-2 text-left" dir="ltr">{fmtNum(Number(newEntry.amount))} ₪</p>}
                </div>
                <div>
                  <p className="text-xs font-medium text-red-400 mb-1.5 flex items-center gap-1"><ArrowUpDown className="w-3 h-3" />חשבון זיכוי (ז׳)</p>
                  <select value={newEntry.creditAccountName} onChange={e => setNewEntry({ ...newEntry, creditAccountName: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-foreground">
                    <option value="">בחר חשבון לזיכוי...</option>
                    {(accounts || []).filter((a: any) => !a.is_group).map((a: any) => (
                      <option key={a.id} value={a.account_name}>{a.account_number} — {a.account_name}</option>
                    ))}
                  </select>
                  {newEntry.amount && <p className="text-sm font-mono text-red-400 mt-2 text-left" dir="ltr">{fmtNum(Number(newEntry.amount))} ₪</p>}
                </div>
              </div>
            </div>

            <div><Label className="text-xs text-muted-foreground">הערות</Label><Input value={newEntry.notes} onChange={e => setNewEntry({ ...newEntry, notes: e.target.value })} className="bg-slate-900 border-slate-600 mt-1 text-sm" placeholder="הערות נוספות..." /></div>

            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleCreate} disabled={saving || !canSave}>
                <Save className="w-3.5 h-3.5 ml-1" />שמור כטיוטה
              </Button>
              <Button size="sm" variant="outline" className="border-slate-600" onClick={() => setShowNewEntry(false)}>ביטול</Button>
              {!canSave && (newEntry.description || newEntry.amount) && (
                <span className="text-[10px] text-yellow-400/70 mr-auto flex items-center gap-1"><AlertTriangle className="w-3 h-3" />
                  {!newEntry.debitAccountName || !newEntry.creditAccountName ? "נדרש חשבון חיוב וזיכוי" : newEntry.debitAccountName === newEntry.creditAccountName ? "חשבון חיוב וזיכוי חייבים להיות שונים" : "מלא את כל שדות החובה"}
                </span>
              )}
              {canSave && (
                <span className="text-[10px] text-emerald-400/70 mr-auto flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />פקודה מאוזנת</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">טוען פקודות יומן...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground"><BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>אין פקודות יומן</p><p className="text-xs mt-1">צור פקודת יומן ראשונה</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-slate-700/40 bg-slate-800/30">
                  <th className="p-2 w-[20px]"></th>
                  <th className="p-2 text-right text-muted-foreground font-medium w-[100px]">מס׳ פקודה</th>
                  <th className="p-2 text-right text-muted-foreground font-medium w-[80px]">תאריך</th>
                  <th className="p-2 text-right text-muted-foreground font-medium w-[80px]">אסמכתא</th>
                  <th className="p-2 text-right text-muted-foreground font-medium">תיאור</th>
                  <th className="p-2 text-right text-muted-foreground font-medium w-[130px]">חשבון חיוב</th>
                  <th className="p-2 text-right text-muted-foreground font-medium w-[130px]">חשבון זיכוי</th>
                  <th className="p-2 text-right text-muted-foreground font-medium w-[90px]">סכום (₪)</th>
                  <th className="p-2 text-right text-muted-foreground font-medium w-[50px]">סוג</th>
                  <th className="p-2 text-right text-muted-foreground font-medium w-[60px]">סטטוס</th>
                  <th className="p-2 text-right text-muted-foreground font-medium w-[60px]">פעולות</th>
                </tr></thead>
                <tbody>
                  {filtered.slice(0, 100).map((e: any) => {
                    const isExpanded = expandedId === e.id;
                    const amt = Number(e.amount || e.total_debit || 0);
                    return [
                      <tr key={e.id} className={`border-b border-slate-800/40 hover:bg-slate-800/20 cursor-pointer ${isExpanded ? "bg-slate-800/30" : ""}`}
                        onClick={() => toggleExpand(e.id)}>
                        <td className="p-2 text-center">
                          <span className={`text-muted-foreground text-[10px] transition-transform inline-block ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                        </td>
                        <td className="p-2 text-cyan-400 font-mono font-bold">{e.entry_number || `#${e.id}`}</td>
                        <td className="p-2 text-slate-300">{fmtDate(e.entry_date)}</td>
                        <td className="p-2 text-muted-foreground font-mono text-[10px]">{e.reference || "—"}</td>
                        <td className="p-2 text-foreground truncate max-w-[200px]">{e.description}</td>
                        <td className="p-2">
                          <span className="text-emerald-400 text-[10px] bg-emerald-500/10 px-1.5 py-0.5 rounded">{e.debit_account_name || "—"}</span>
                        </td>
                        <td className="p-2">
                          <span className="text-red-400 text-[10px] bg-red-500/10 px-1.5 py-0.5 rounded">{e.credit_account_name || "—"}</span>
                        </td>
                        <td className="p-2 text-foreground font-mono font-bold text-left" dir="ltr">{fmtNum(amt)}</td>
                        <td className="p-2"><span className="text-muted-foreground text-[10px]">{entryTypeLabels[e.entry_type] || e.entry_type || "רגילה"}</span></td>
                        <td className="p-2">
                          <Badge className={`text-[9px] ${statusColors[e.status] || "bg-slate-700/30 text-muted-foreground"}`}>
                            {statusLabels[e.status] || e.status}
                          </Badge>
                        </td>
                        <td className="p-2" onClick={ev => ev.stopPropagation()}>
                          {e.status === "draft" && (
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-green-400 hover:bg-green-500/10" onClick={() => handlePost(e.id)}>
                              <CheckCircle2 className="w-3 h-3 ml-0.5" />רשום
                            </Button>
                          )}
                        </td>
                      </tr>,
                      isExpanded && (
                        <tr key={`detail-${e.id}`} className="bg-slate-800/20">
                          <td colSpan={11} className="p-0">
                            <div className="p-3 border-r-2 border-emerald-500/30 mr-4">
                              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                                <div><p className="text-[10px] text-muted-foreground">מס׳ פקודה</p><p className="text-sm font-mono text-cyan-400">{e.entry_number}</p></div>
                                <div><p className="text-[10px] text-muted-foreground">נוצר ע״י</p><p className="text-sm text-slate-300">{e.created_by_name || "מערכת"}</p></div>
                                <div><p className="text-[10px] text-muted-foreground">שנת כספים</p><p className="text-sm text-slate-300">{e.fiscal_year || "—"} / תקופה {e.fiscal_period || "—"}</p></div>
                                <div><p className="text-[10px] text-muted-foreground">מטבע</p><p className="text-sm text-slate-300">{e.currency || "ILS"} {Number(e.exchange_rate || 1) !== 1 ? `(שער: ${e.exchange_rate})` : ""}</p></div>
                              </div>

                              <JournalDetailLines entryId={e.id} lines={expandedLines[e.id]} debitName={e.debit_account_name} creditName={e.credit_account_name} description={e.description} amount={amt} />

                              {e.notes && <p className="text-[10px] text-muted-foreground mt-2">הערות: {e.notes}</p>}
                              <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                                <span>נוצר: {fmtDate(e.created_at)}</span>
                                {e.posted_at && <span>| רשום: {fmtDate(e.posted_at)}</span>}
                                {e.approved_at && <span>| אושר: {fmtDate(e.approved_at)} ע״י {e.approved_by_name}</span>}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )
                    ];
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-800/60 border-t-2 border-slate-600">
                    <td colSpan={5} className="p-2.5 text-foreground font-bold">{'סה"כ'} ({filtered.length} פקודות)</td>
                    <td className="p-2.5 text-emerald-400 font-mono font-bold text-left" dir="ltr">{fmtNum(totalDebit)}</td>
                    <td className="p-2.5 text-red-400 font-mono font-bold text-left" dir="ltr">{fmtNum(totalCredit)}</td>
                    <td className="p-2.5 text-foreground font-mono font-bold text-left" dir="ltr">{fmtNum(totalDebit)}</td>
                    <td colSpan={3}>
                      {totalDebit === totalCredit ? (
                        <span className="text-[9px] text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />מאוזן</span>
                      ) : (
                        <span className="text-[9px] text-yellow-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />לא מאוזן</span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground">{filtered.length} פקודות יומן</p>
        <p className="text-[10px] text-muted-foreground">יומן הנה״ח כפולה — סגנון חשבשבת</p>
      </div>

      {selectedItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedItem(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-slate-700">
              <h2 className="text-xl font-bold text-foreground">פקודת יומן {selectedItem.entry_number || `#${selectedItem.id}`}</h2>
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
                  <StatusTransition currentStatus={selectedItem.status} statuses={[{key:"draft",label:"טיוטה",color:"bg-yellow-500"},{key:"posted",label:"רשום",color:"bg-green-500"},{key:"voided",label:"מבוטל",color:"bg-red-500"}]} onTransition={async (s) => { await authFetch(`${API}/journal-entries/${selectedItem.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s }) }); refetch(); setSelectedItem({ ...selectedItem, status: s }); }} />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div><div className="text-xs text-muted-foreground mb-1">תאריך</div><div className="text-sm text-foreground">{fmtDate(selectedItem.entry_date)}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">תיאור</div><div className="text-sm text-foreground">{selectedItem.description}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">סכום</div><div className="text-sm text-foreground font-bold">{fmt(Number(selectedItem.amount || 0))}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">אסמכתא</div><div className="text-sm text-foreground">{selectedItem.reference || "-"}</div></div>
                  </div>
                </div>
              )}
              {detailTab === "related" && <RelatedRecords entityType="journal-entries" entityId={selectedItem.id} tabs={[{ key: "lines", label: "שורות", endpoint: `${API}/journal-entries/${selectedItem.id}/lines` }]} />}
              {detailTab === "docs" && <AttachmentsSection entityType="journal-entries" entityId={selectedItem.id} />}
              {detailTab === "history" && <ActivityLog entityType="journal-entries" entityId={selectedItem.id} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LedgerTab() {
  const [selectedAccount, setSelectedAccount] = useState("");
  const [viewMode, setViewMode] = useState<"transactions" | "accounts" | "periods">("transactions");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  const { data: accounts } = useQuery({
    queryKey: ["chart-of-accounts-ledger"],
    queryFn: async () => { const r = await authFetch(`${API}/chart-of-accounts`); const d = await r.json(); return safeArray(d); },
  });
  const { data: glData, isLoading, refetch } = useQuery({
    queryKey: ["gl-entries", selectedAccount, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedAccount) params.set("account", selectedAccount);
      if (dateFrom) params.set("from_date", dateFrom);
      if (dateTo) params.set("to_date", dateTo);
      const r = await authFetch(`${API}/general-ledger?${params.toString()}`);
      const d = await r.json();
      return { data: safeArray(d.data || d), total: d.total || 0 };
    },
  });
  const { data: stats } = useQuery({
    queryKey: ["gl-stats"],
    queryFn: async () => { const r = await authFetch(`${API}/general-ledger/stats`); return r.json(); },
  });
  const { data: accountSummary } = useQuery({
    queryKey: ["gl-by-account"],
    queryFn: async () => { const r = await authFetch(`${API}/general-ledger/by-account`); return safeArray(r.json ? await r.json() : r); },
    enabled: viewMode === "accounts",
  });
  const { data: periodSummary } = useQuery({
    queryKey: ["gl-by-period"],
    queryFn: async () => { const r = await authFetch(`${API}/general-ledger/by-period`); return safeArray(r.json ? await r.json() : r); },
    enabled: viewMode === "periods",
  });

  const glEntries = glData?.data || [];
  const filtered = useMemo(() => {
    if (!search) return glEntries;
    return glEntries.filter((e: any) =>
      (e.description || "").includes(search) ||
      (e.account_name || "").includes(search) ||
      (e.account_number || "").includes(search) ||
      (e.reference || "").includes(search) ||
      (e.entry_number || "").includes(search)
    );
  }, [glEntries, search]);

  const totalDebit = filtered.reduce((s: number, e: any) => s + Number(e.debit_amount || 0), 0);
  const totalCredit = filtered.reduce((s: number, e: any) => s + Number(e.credit_amount || 0), 0);

  const viewTabs = [
    { id: "transactions" as const, label: "תנועות", icon: FileSpreadsheet },
    { id: "accounts" as const, label: "לפי חשבון", icon: List },
    { id: "periods" as const, label: "לפי תקופה", icon: Calendar },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-blue-400" />ספר ראשי — כרטסת חשבון</h3>
        <Button variant="outline" size="sm" className="border-slate-600" onClick={() => refetch()}><RefreshCw className="w-3.5 h-3.5" /></Button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          <KPICard label={'סה"כ תנועות'} value={String(stats.total || 0)} icon={FileSpreadsheet} color="text-foreground" />
          <KPICard label="חשבונות פעילים" value={String(stats.accounts_used || stats.account_count || 0)} icon={List} color="text-cyan-400" />
          <KPICard label={'סה"כ חיוב'} value={fmt(Number(stats.total_debit || 0))} icon={TrendingUp} color="text-emerald-400" />
          <KPICard label={'סה"כ זיכוי'} value={fmt(Number(stats.total_credit || 0))} icon={TrendingDown} color="text-red-400" />
          <KPICard label="יתרה נטו" value={fmt(Number(stats.net_balance || 0))} icon={Scale} color="text-blue-400" />
        </div>
      )}

      <div className="flex gap-1 bg-slate-800/50 rounded-lg p-0.5">
        {viewTabs.map(t => (
          <button key={t.id} onClick={() => setViewMode(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${viewMode === t.id ? "bg-blue-600 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>

      {viewMode === "transactions" && (
        <>
          <div className="flex gap-2 flex-wrap">
            <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}
              className="flex-1 min-w-[200px] bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-foreground">
              <option value="">כל החשבונות</option>
              {(accounts || []).filter((a: any) => !a.is_group).map((a: any) => (
                <option key={a.id} value={a.account_number || a.id}>{a.account_number} — {a.account_name}</option>
              ))}
            </select>
            <div className="relative"><Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} className="bg-slate-800 border-slate-700 pr-8 text-sm w-[180px]" placeholder="חיפוש..." /></div>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-slate-800 border-slate-700 text-sm w-[140px]" placeholder="מתאריך" />
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-slate-800 border-slate-700 text-sm w-[140px]" placeholder="עד תאריך" />
          </div>

          {selectedAccount && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 flex items-center gap-2">
              <span className="text-blue-400 text-xs font-medium">כרטסת חשבון:</span>
              <span className="text-foreground text-sm font-mono">{selectedAccount}</span>
              <span className="text-muted-foreground text-xs">— {(accounts || []).find((a: any) => a.account_number === selectedAccount)?.account_name || ""}</span>
              <button onClick={() => setSelectedAccount("")} className="mr-auto text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">טוען ספר ראשי...</div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground"><FileSpreadsheet className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>אין תנועות בספר הראשי</p><p className="text-xs mt-1">בחר חשבון או הוסף פקודות יומן</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-slate-700/40 bg-slate-800/30">
                      <th className="p-2 text-right text-muted-foreground font-medium w-[80px]">תאריך</th>
                      <th className="p-2 text-right text-muted-foreground font-medium w-[100px]">מס׳ רשומה</th>
                      <th className="p-2 text-right text-muted-foreground font-medium w-[70px]">אסמכתא</th>
                      <th className="p-2 text-right text-muted-foreground font-medium w-[70px]">חשבון</th>
                      <th className="p-2 text-right text-muted-foreground font-medium">שם חשבון</th>
                      <th className="p-2 text-right text-muted-foreground font-medium">תיאור</th>
                      <th className="p-2 text-right text-muted-foreground font-medium w-[90px]">חיוב (₪)</th>
                      <th className="p-2 text-right text-muted-foreground font-medium w-[90px]">זיכוי (₪)</th>
                      <th className="p-2 text-right text-muted-foreground font-medium w-[100px]">יתרה מצטברת</th>
                    </tr></thead>
                    <tbody>
                      {(() => {
                        let running = 0;
                        return filtered.slice(0, 200).map((e: any, i: number) => {
                          const dAmt = Number(e.debit_amount || 0);
                          const cAmt = Number(e.credit_amount || 0);
                          running += dAmt - cAmt;
                          return (
                            <tr key={e.id || i} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                              <td className="p-2 text-slate-300">{fmtDate(e.entry_date)}</td>
                              <td className="p-2 text-cyan-400 font-mono text-[10px]">{e.entry_number || "—"}</td>
                              <td className="p-2 text-muted-foreground font-mono text-[10px]">{e.reference || e.source_document || "—"}</td>
                              <td className="p-2 text-cyan-400 font-mono font-bold">{e.account_number}</td>
                              <td className="p-2 text-foreground">{e.account_name}</td>
                              <td className="p-2 text-slate-300 truncate max-w-[180px]">{e.description || "—"}</td>
                              <td className="p-2 text-emerald-400 font-mono text-left" dir="ltr">{dAmt > 0 ? fmtNum(dAmt) : ""}</td>
                              <td className="p-2 text-red-400 font-mono text-left" dir="ltr">{cAmt > 0 ? fmtNum(cAmt) : ""}</td>
                              <td className={`p-2 font-mono font-bold text-left ${running >= 0 ? "text-emerald-400" : "text-red-400"}`} dir="ltr">{fmtNum(running)}</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                    <tfoot><tr className="bg-slate-800/50 border-t-2 border-slate-600">
                      <td colSpan={6} className="p-2 text-foreground font-bold">{'סה"כ'} ({filtered.length} תנועות)</td>
                      <td className="p-2 text-emerald-400 font-mono font-bold text-left" dir="ltr">{fmtNum(totalDebit)}</td>
                      <td className="p-2 text-red-400 font-mono font-bold text-left" dir="ltr">{fmtNum(totalCredit)}</td>
                      <td className={`p-2 font-mono font-bold text-left ${totalDebit - totalCredit >= 0 ? "text-emerald-400" : "text-red-400"}`} dir="ltr">
                        {fmtNum(totalDebit - totalCredit)}
                        {Math.abs(totalDebit - totalCredit) < 0.01 && <span className="text-[9px] text-emerald-400/60 mr-1">מאוזן</span>}
                      </td>
                    </tr></tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {viewMode === "accounts" && (
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm text-blue-400 flex items-center gap-2"><List className="w-4 h-4" />סיכום לפי חשבון — ספר ראשי</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!accountSummary || accountSummary.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">אין נתונים</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-slate-700/40 bg-slate-800/30">
                    <th className="p-2 text-right text-muted-foreground font-medium w-[80px]">מס׳ חשבון</th>
                    <th className="p-2 text-right text-muted-foreground font-medium">שם חשבון</th>
                    <th className="p-2 text-right text-muted-foreground font-medium w-[60px]">סוג</th>
                    <th className="p-2 text-right text-muted-foreground font-medium w-[60px]">תנועות</th>
                    <th className="p-2 text-right text-muted-foreground font-medium w-[100px]">{'סה"כ חיוב'}</th>
                    <th className="p-2 text-right text-muted-foreground font-medium w-[100px]">{'סה"כ זיכוי'}</th>
                    <th className="p-2 text-right text-muted-foreground font-medium w-[100px]">יתרה</th>
                    <th className="p-2 text-right text-muted-foreground font-medium w-[80px]">תנועה ראשונה</th>
                    <th className="p-2 text-right text-muted-foreground font-medium w-[80px]">תנועה אחרונה</th>
                  </tr></thead>
                  <tbody>
                    {accountSummary.map((a: any, i: number) => {
                      const bal = Number(a.balance || 0);
                      const typeLabels: Record<string, string> = { asset: "נכס", liability: "התחייבות", equity: "הון", revenue: "הכנסה", expense: "הוצאה" };
                      return (
                        <tr key={a.account_number || i} className="border-b border-slate-800/40 hover:bg-slate-800/20 cursor-pointer"
                          onClick={() => { setSelectedAccount(a.account_number); setViewMode("transactions"); }}>
                          <td className="p-2 text-cyan-400 font-mono font-bold">{a.account_number}</td>
                          <td className="p-2 text-foreground font-medium">{a.account_name}</td>
                          <td className="p-2"><Badge className="text-[9px] bg-slate-700/40 text-muted-foreground">{typeLabels[a.account_type] || a.account_type || "—"}</Badge></td>
                          <td className="p-2 text-slate-300 text-center">{a.entry_count}</td>
                          <td className="p-2 text-emerald-400 font-mono text-left" dir="ltr">{fmtNum(Number(a.total_debit || 0))}</td>
                          <td className="p-2 text-red-400 font-mono text-left" dir="ltr">{fmtNum(Number(a.total_credit || 0))}</td>
                          <td className={`p-2 font-mono font-bold text-left ${bal >= 0 ? "text-emerald-400" : "text-red-400"}`} dir="ltr">{fmtNum(bal)}</td>
                          <td className="p-2 text-muted-foreground text-[10px]">{fmtDate(a.first_entry)}</td>
                          <td className="p-2 text-muted-foreground text-[10px]">{fmtDate(a.last_entry)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot><tr className="bg-slate-800/50 border-t-2 border-slate-600">
                    <td colSpan={4} className="p-2 text-foreground font-bold">{'סה"כ'} ({accountSummary.length} חשבונות)</td>
                    <td className="p-2 text-emerald-400 font-mono font-bold text-left" dir="ltr">{fmtNum(accountSummary.reduce((s: number, a: any) => s + Number(a.total_debit || 0), 0))}</td>
                    <td className="p-2 text-red-400 font-mono font-bold text-left" dir="ltr">{fmtNum(accountSummary.reduce((s: number, a: any) => s + Number(a.total_credit || 0), 0))}</td>
                    <td className="p-2 text-foreground font-mono font-bold text-left" dir="ltr">{fmtNum(accountSummary.reduce((s: number, a: any) => s + Number(a.balance || 0), 0))}</td>
                    <td colSpan={2}></td>
                  </tr></tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {viewMode === "periods" && (
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm text-blue-400 flex items-center gap-2"><Calendar className="w-4 h-4" />סיכום לפי תקופה — ספר ראשי</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!periodSummary || periodSummary.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">אין נתונים</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-slate-700/40 bg-slate-800/30">
                    <th className="p-2.5 text-right text-muted-foreground font-medium">שנה</th>
                    <th className="p-2.5 text-right text-muted-foreground font-medium">תקופה</th>
                    <th className="p-2.5 text-right text-muted-foreground font-medium">מס׳ תנועות</th>
                    <th className="p-2.5 text-right text-muted-foreground font-medium">{'סה"כ חיוב'}</th>
                    <th className="p-2.5 text-right text-muted-foreground font-medium">{'סה"כ זיכוי'}</th>
                    <th className="p-2.5 text-right text-muted-foreground font-medium">יתרה נטו</th>
                  </tr></thead>
                  <tbody>
                    {periodSummary.map((p: any, i: number) => {
                      const monthNames = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
                      const net = Number(p.net || p.balance || 0);
                      return (
                        <tr key={i} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                          <td className="p-2.5 text-foreground font-mono">{p.fiscal_year}</td>
                          <td className="p-2.5 text-slate-300">{monthNames[(p.fiscal_period || 1) - 1] || p.fiscal_period}</td>
                          <td className="p-2.5 text-slate-300 text-center">{p.entry_count}</td>
                          <td className="p-2.5 text-emerald-400 font-mono text-left" dir="ltr">{fmtNum(Number(p.total_debit || 0))}</td>
                          <td className="p-2.5 text-red-400 font-mono text-left" dir="ltr">{fmtNum(Number(p.total_credit || 0))}</td>
                          <td className={`p-2.5 font-mono font-bold text-left ${net >= 0 ? "text-emerald-400" : "text-red-400"}`} dir="ltr">{fmtNum(net)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground">{filtered.length} תנועות בספר הראשי</p>
        <p className="text-[10px] text-muted-foreground">ספר ראשי — סגנון חשבשבת</p>
      </div>
    </div>
  );
}

function ChartOfAccountsTab() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ account_number: "", account_name: "", account_type: "expense", normal_balance: "debit", opening_balance: "0", parent_account_id: "", is_group: false });
  const [saving, setSaving] = useState(false);

  const { data: accounts, isLoading, refetch } = useQuery({
    queryKey: ["chart-of-accounts-full"],
    queryFn: async () => { const r = await authFetch(`${API}/chart-of-accounts`); const d = await r.json(); return safeArray(d); },
  });
  const { data: stats } = useQuery({
    queryKey: ["coa-stats"],
    queryFn: async () => { const r = await authFetch(`${API}/chart-of-accounts/stats`); return r.json(); },
  });

  const typeLabels: Record<string, string> = { asset: "נכסים", liability: "התחייבויות", equity: "הון עצמי", revenue: "הכנסות", expense: "הוצאות" };
  const typeColors: Record<string, string> = { asset: "text-blue-400", liability: "text-red-400", equity: "text-purple-400", revenue: "text-emerald-400", expense: "text-orange-400" };
  const typeBgColors: Record<string, string> = { asset: "bg-blue-500/10 border-blue-500/20", liability: "bg-red-500/10 border-red-500/20", equity: "bg-purple-500/10 border-purple-500/20", revenue: "bg-emerald-500/10 border-emerald-500/20", expense: "bg-orange-500/10 border-orange-500/20" };
  const subtypeLabels: Record<string, string> = { current_asset: "שוטף", fixed_asset: "קבוע", bank: "בנק", cash: "קופה", receivable: "חייבים", inventory: "מלאי", current_liability: "שוטף", long_term_liability: "ארוך טווח", payable: "זכאים", tax: "מיסים", direct_revenue: "ישירות", other_revenue: "אחרות", cogs: "עלות המכר", operating: "תפעולי", admin: "הנהלה", marketing: "שיווק", financial: "מימון" };

  const filtered = useMemo(() => {
    let items = accounts || [];
    if (typeFilter) items = items.filter((a: any) => a.account_type === typeFilter);
    if (search) items = items.filter((a: any) =>
      (a.account_number || "").includes(search) ||
      (a.account_name || "").includes(search) ||
      (a.account_name_en || "").toLowerCase().includes(search.toLowerCase())
    );
    return items;
  }, [accounts, typeFilter, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    const order = ["asset", "liability", "equity", "revenue", "expense"];
    order.forEach(t => { groups[t] = []; });
    filtered.forEach((a: any) => {
      const t = a.account_type || "expense";
      if (!groups[t]) groups[t] = [];
      groups[t].push(a);
    });
    return Object.entries(groups).filter(([, items]) => items.length > 0);
  }, [filtered]);

  const toggleGroup = (type: string) => {
    const next = new Set(collapsedGroups);
    if (next.has(type)) next.delete(type); else next.add(type);
    setCollapsedGroups(next);
  };

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (accounts || []).forEach((a: any) => { counts[a.account_type] = (counts[a.account_type] || 0) + 1; });
    return counts;
  }, [accounts]);

  const handleAddAccount = async () => {
    setSaving(true);
    try {
      await authFetch(`${API}/chart-of-accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountNumber: addForm.account_number,
          accountName: addForm.account_name,
          accountType: addForm.account_type,
          normalBalance: addForm.normal_balance,
          openingBalance: Number(addForm.opening_balance) || 0,
          parentAccountId: addForm.parent_account_id ? Number(addForm.parent_account_id) : null,
          isGroup: addForm.is_group,
        }),
      });
      setShowAddForm(false);
      setAddForm({ account_number: "", account_name: "", account_type: "expense", normal_balance: "debit", opening_balance: "0", parent_account_id: "", is_group: false });
      refetch();
    } catch {}
    setSaving(false);
  };

  const totalOpeningBal = (accounts || []).reduce((s: number, a: any) => s + Number(a.opening_balance || 0), 0);
  const totalCurrentBal = (accounts || []).reduce((s: number, a: any) => s + Number(a.current_balance || 0), 0);
  const totalDebit = (accounts || []).reduce((s: number, a: any) => s + Number(a.debit_total || 0), 0);
  const totalCredit = (accounts || []).reduce((s: number, a: any) => s + Number(a.credit_total || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2"><List className="w-4 h-4 text-cyan-400" />ספר חשבונות — מפתח חשבונות</h3>
        <div className="flex items-center gap-2">
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowAddForm(!showAddForm)}><Plus className="w-3.5 h-3.5 ml-1" />חשבון חדש</Button>
          <Button variant="outline" size="sm" className="border-slate-600" onClick={() => refetch()}><RefreshCw className="w-3.5 h-3.5" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        {(["asset", "liability", "equity", "revenue", "expense"] as const).map(key => (
          <button key={key} onClick={() => setTypeFilter(typeFilter === key ? "" : key)}
            className={`rounded-lg border p-2.5 text-center transition-all ${typeFilter === key ? typeBgColors[key] + " ring-1 ring-offset-0" : "bg-slate-900/60 border-slate-700/40 hover:border-slate-600"}`}>
            <p className="text-[10px] text-muted-foreground">{typeLabels[key]}</p>
            <p className={`text-lg font-bold ${typeColors[key]}`}>{typeCounts[key] || 0}</p>
            {stats && <p className="text-[9px] text-muted-foreground font-mono">{fmt(Number(stats[`total_${key}s`] || stats[`total_${key}`] || 0))}</p>}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} className="bg-slate-800 border-slate-700 pr-9 text-sm" placeholder="חיפוש לפי מספר חשבון, שם, או שם באנגלית..." />
        </div>
        {(typeFilter || search) && (
          <Button variant="outline" size="sm" className="border-slate-600" onClick={() => { setTypeFilter(""); setSearch(""); }}>
            <X className="w-3.5 h-3.5 ml-1" />נקה
          </Button>
        )}
      </div>

      {showAddForm && (
        <Card className="bg-slate-800/50 border-emerald-500/30">
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-emerald-400">הוספת חשבון חדש</CardTitle>
              <button onClick={() => setShowAddForm(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
          </CardHeader>
          <CardContent className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div><Label className="text-xs text-muted-foreground">מספר חשבון *</Label><Input value={addForm.account_number} onChange={e => setAddForm({ ...addForm, account_number: e.target.value })} className="bg-slate-900 border-slate-600 mt-1 text-sm font-mono" placeholder="1000" /></div>
            <div className="col-span-2 lg:col-span-1"><Label className="text-xs text-muted-foreground">שם חשבון *</Label><Input value={addForm.account_name} onChange={e => setAddForm({ ...addForm, account_name: e.target.value })} className="bg-slate-900 border-slate-600 mt-1 text-sm" placeholder="שם החשבון" /></div>
            <div><Label className="text-xs text-muted-foreground">סוג</Label>
              <select value={addForm.account_type} onChange={e => setAddForm({ ...addForm, account_type: e.target.value })} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm mt-1 text-foreground">
                {Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div><Label className="text-xs text-muted-foreground">צד רגיל</Label>
              <select value={addForm.normal_balance} onChange={e => setAddForm({ ...addForm, normal_balance: e.target.value })} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm mt-1 text-foreground">
                <option value="debit">חיוב</option><option value="credit">זיכוי</option>
              </select>
            </div>
            <div><Label className="text-xs text-muted-foreground">יתרת פתיחה</Label><Input type="number" value={addForm.opening_balance} onChange={e => setAddForm({ ...addForm, opening_balance: e.target.value })} className="bg-slate-900 border-slate-600 mt-1 text-sm font-mono" /></div>
            <div className="flex items-center gap-2 mt-5">
              <input type="checkbox" checked={addForm.is_group} onChange={e => setAddForm({ ...addForm, is_group: e.target.checked })} className="rounded bg-slate-900 border-slate-600" />
              <Label className="text-xs text-muted-foreground">חשבון קבוצה (כותרת)</Label>
            </div>
            <div className="flex gap-2 items-end">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleAddAccount} disabled={saving || !addForm.account_number || !addForm.account_name}><Save className="w-3.5 h-3.5 ml-1" />שמור</Button>
              <Button size="sm" variant="outline" className="border-slate-600" onClick={() => setShowAddForm(false)}>ביטול</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">טוען ספר חשבונות...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground"><List className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>לא נמצאו חשבונות</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-slate-700/40 bg-slate-800/30">
                  <th className="p-2 text-right text-muted-foreground font-medium w-[90px]">מספר חשבון</th>
                  <th className="p-2 text-right text-muted-foreground font-medium">שם חשבון</th>
                  <th className="p-2 text-right text-muted-foreground font-medium w-[80px]">שם EN</th>
                  <th className="p-2 text-right text-muted-foreground font-medium w-[70px]">תת-סוג</th>
                  <th className="p-2 text-right text-muted-foreground font-medium w-[50px]">צד</th>
                  <th className="p-2 text-right text-muted-foreground font-medium w-[50px]">מטבע</th>
                  <th className="p-2 text-right text-muted-foreground font-medium w-[90px]">יתרת פתיחה</th>
                  <th className="p-2 text-right text-muted-foreground font-medium w-[80px]">חיוב</th>
                  <th className="p-2 text-right text-muted-foreground font-medium w-[80px]">זיכוי</th>
                  <th className="p-2 text-right text-muted-foreground font-medium w-[90px]">יתרה נוכחית</th>
                  <th className="p-2 text-right text-muted-foreground font-medium w-[40px]">סטטוס</th>
                </tr></thead>
                <tbody>
                  {grouped.map(([type, items]) => {
                    const isCollapsed = collapsedGroups.has(type);
                    const groupBalance = items.reduce((s: number, a: any) => s + Number(a.current_balance || 0), 0);
                    return [
                      <tr key={`group-${type}`}
                        className={`border-b border-slate-700/50 cursor-pointer hover:bg-slate-800/40 ${typeBgColors[type] || "bg-slate-800/20"}`}
                        onClick={() => toggleGroup(type)}>
                        <td colSpan={6} className="p-2.5">
                          <div className="flex items-center gap-2">
                            <span className={`transition-transform text-muted-foreground ${isCollapsed ? "" : "rotate-90"}`}>▶</span>
                            <span className={`font-bold text-sm ${typeColors[type]}`}>{typeLabels[type] || type}</span>
                            <Badge className="bg-slate-700/40 text-muted-foreground text-[9px]">{items.length} חשבונות</Badge>
                          </div>
                        </td>
                        <td className="p-2.5 text-muted-foreground font-mono text-left" dir="ltr">{fmtNum(items.reduce((s: number, a: any) => s + Number(a.opening_balance || 0), 0))}</td>
                        <td className="p-2.5 text-emerald-400/60 font-mono text-left" dir="ltr">{fmtNum(items.reduce((s: number, a: any) => s + Number(a.debit_total || 0), 0))}</td>
                        <td className="p-2.5 text-red-400/60 font-mono text-left" dir="ltr">{fmtNum(items.reduce((s: number, a: any) => s + Number(a.credit_total || 0), 0))}</td>
                        <td className={`p-2.5 font-mono font-bold text-left ${groupBalance >= 0 ? "text-emerald-400" : "text-red-400"}`} dir="ltr">{fmtNum(groupBalance)}</td>
                        <td></td>
                      </tr>,
                      ...(!isCollapsed ? items.map((a: any) => {
                        const indent = Math.min(Number(a.hierarchy_level || 1) - 1, 4);
                        const isGroup = a.is_group;
                        const bal = Number(a.current_balance || 0);
                        return (
                          <tr key={a.id} className={`border-b border-slate-800/30 hover:bg-slate-800/20 ${isGroup ? "bg-slate-800/10" : ""}`}>
                            <td className="p-2 font-mono">
                              <span className={`${isGroup ? "text-foreground font-bold" : "text-cyan-400"}`}>
                                {a.account_number}
                              </span>
                            </td>
                            <td className="p-2">
                              <div style={{ paddingRight: `${indent * 16}px` }} className="flex items-center gap-1.5">
                                {isGroup && <span className="text-muted-foreground text-[10px]">▸</span>}
                                <span className={isGroup ? "text-foreground font-semibold" : "text-slate-200"}>{a.account_name}</span>
                                {a.is_system_account && <Badge className="bg-blue-500/10 text-blue-400 text-[8px] px-1">מערכת</Badge>}
                                {a.locked && <Badge className="bg-red-500/10 text-red-400 text-[8px] px-1">נעול</Badge>}
                              </div>
                            </td>
                            <td className="p-2 text-muted-foreground text-[10px] truncate max-w-[100px]">{a.account_name_en || ""}</td>
                            <td className="p-2"><span className="text-muted-foreground text-[10px]">{subtypeLabels[a.account_subtype] || a.account_subtype || ""}</span></td>
                            <td className="p-2 text-muted-foreground text-[10px]">{a.normal_balance === "debit" ? "ח׳" : a.normal_balance === "credit" ? "ז׳" : ""}</td>
                            <td className="p-2 text-muted-foreground text-[10px] font-mono">{a.currency || "ILS"}</td>
                            <td className="p-2 text-muted-foreground font-mono text-left" dir="ltr">{Number(a.opening_balance || 0) !== 0 ? fmtNum(Number(a.opening_balance)) : <span className="text-foreground">0</span>}</td>
                            <td className="p-2 font-mono text-left" dir="ltr"><span className={Number(a.debit_total || 0) > 0 ? "text-emerald-400" : "text-foreground"}>{Number(a.debit_total || 0) > 0 ? fmtNum(Number(a.debit_total)) : "0"}</span></td>
                            <td className="p-2 font-mono text-left" dir="ltr"><span className={Number(a.credit_total || 0) > 0 ? "text-red-400" : "text-foreground"}>{Number(a.credit_total || 0) > 0 ? fmtNum(Number(a.credit_total)) : "0"}</span></td>
                            <td className={`p-2 font-mono font-bold text-left ${bal > 0 ? "text-emerald-400" : bal < 0 ? "text-red-400" : "text-muted-foreground"}`} dir="ltr">{bal !== 0 ? fmtNum(bal) : "0"}</td>
                            <td className="p-2">
                              {a.status === "active" || a.is_active ?
                                <span className="flex items-center gap-0.5 text-green-400"><CheckCircle2 className="w-3 h-3" /></span> :
                                <span className="flex items-center gap-0.5 text-muted-foreground"><X className="w-3 h-3" /></span>
                              }
                            </td>
                          </tr>
                        );
                      }) : [])
                    ];
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-800/60 border-t-2 border-slate-600">
                    <td colSpan={6} className="p-2.5 text-foreground font-bold">{'סה"כ כל החשבונות'}</td>
                    <td className="p-2.5 text-slate-300 font-mono font-bold text-left" dir="ltr">{fmtNum(totalOpeningBal)}</td>
                    <td className="p-2.5 text-emerald-400 font-mono font-bold text-left" dir="ltr">{fmtNum(totalDebit)}</td>
                    <td className="p-2.5 text-red-400 font-mono font-bold text-left" dir="ltr">{fmtNum(totalCredit)}</td>
                    <td className={`p-2.5 font-mono font-bold text-left ${totalCurrentBal >= 0 ? "text-emerald-400" : "text-red-400"}`} dir="ltr">{fmtNum(totalCurrentBal)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground">{filtered.length} / {(accounts || []).length} חשבונות</p>
        <p className="text-[10px] text-muted-foreground">ספר חשבונות — Summit Style</p>
      </div>
    </div>
  );
}

function BalanceSheetSection({ title, titleColor, items, typeLabels }: { title: string; titleColor: string; items: any[]; typeLabels: Record<string, string> }) {
  const total = items.reduce((s: number, a: any) => s + Number(a.balance || 0), 0);
  const nonZero = items.filter((a: any) => Number(a.balance || 0) !== 0 || Number(a.total_debit || 0) > 0 || Number(a.total_credit || 0) > 0);
  const zeroCount = items.length - nonZero.length;

  return (
    <Card className="bg-slate-900/50 border-slate-700/50">
      <CardHeader className="pb-1 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className={`text-sm ${titleColor} flex items-center gap-2`}><Scale className="w-4 h-4" />{title} ({items.length})</CardTitle>
          <span className={`text-sm font-mono font-bold ${total >= 0 ? "text-emerald-400" : "text-red-400"}`} dir="ltr">{fmt(total)}</span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-slate-700/40 bg-slate-800/30">
            <th className="p-2 text-right text-muted-foreground font-medium w-[70px]">מס׳ חשבון</th>
            <th className="p-2 text-right text-muted-foreground font-medium">שם חשבון</th>
            <th className="p-2 text-right text-muted-foreground font-medium w-[80px]">סוג משנה</th>
            <th className="p-2 text-right text-muted-foreground font-medium w-[90px]">חיוב</th>
            <th className="p-2 text-right text-muted-foreground font-medium w-[90px]">זיכוי</th>
            <th className="p-2 text-right text-muted-foreground font-medium w-[100px]">יתרה</th>
          </tr></thead>
          <tbody>
            {nonZero.map((a: any, i: number) => {
              const bal = Number(a.balance || 0);
              return (
                <tr key={a.account_number || i} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                  <td className="p-2 text-cyan-400 font-mono font-bold">{a.account_number}</td>
                  <td className="p-2 text-foreground">{a.account_name}</td>
                  <td className="p-2 text-muted-foreground text-[10px]">{typeLabels[a.account_subtype] || a.account_subtype || "—"}</td>
                  <td className="p-2 text-emerald-400 font-mono text-left" dir="ltr">{Number(a.total_debit || 0) > 0 ? fmtNum(Number(a.total_debit)) : ""}</td>
                  <td className="p-2 text-red-400 font-mono text-left" dir="ltr">{Number(a.total_credit || 0) > 0 ? fmtNum(Number(a.total_credit)) : ""}</td>
                  <td className={`p-2 font-mono font-bold text-left ${bal >= 0 ? "text-emerald-400" : "text-red-400"}`} dir="ltr">{fmtNum(bal)}</td>
                </tr>
              );
            })}
            {zeroCount > 0 && (
              <tr className="border-b border-slate-800/40"><td colSpan={6} className="p-1.5 text-center text-muted-foreground text-[10px]">{zeroCount} חשבונות עם יתרה אפס</td></tr>
            )}
          </tbody>
          <tfoot><tr className="bg-slate-800/50 border-t-2 border-slate-600">
            <td colSpan={3} className="p-2 text-foreground font-bold">{'סה"כ'} {title}</td>
            <td className="p-2 text-emerald-400 font-mono font-bold text-left" dir="ltr">{fmtNum(items.reduce((s: number, a: any) => s + Number(a.total_debit || 0), 0))}</td>
            <td className="p-2 text-red-400 font-mono font-bold text-left" dir="ltr">{fmtNum(items.reduce((s: number, a: any) => s + Number(a.total_credit || 0), 0))}</td>
            <td className={`p-2 font-mono font-bold text-left ${total >= 0 ? "text-emerald-400" : "text-red-400"}`} dir="ltr">{fmtNum(total)}</td>
          </tr></tfoot>
        </table>
      </CardContent>
    </Card>
  );
}

function BalanceSheetTab() {
  const currentYear = new Date().getFullYear();
  const [fiscalYear, setFiscalYear] = useState(currentYear);
  const [compareYear, setCompareYear] = useState<number | null>(null);

  const { data: bsData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["balance-sheet", fiscalYear, compareYear],
    queryFn: async () => {
      const params = new URLSearchParams({ fiscal_year: String(fiscalYear) });
      if (compareYear) params.set("compare_year", String(compareYear));
      const r = await authFetch(`${API}/financial-reports/balance-sheet?${params.toString()}`);
      return r.json();
    },
  });

  const summary = bsData?.summary;
  const assets = bsData?.assets || [];
  const liabilities = bsData?.liabilities || [];
  const equity = bsData?.equity || [];
  const isBalanced = summary?.isBalanced;

  const subtypeLabels: Record<string, string> = {
    cash: "מזומנים", bank: "בנקים", receivable: "חייבים", inventory: "מלאי", prepaid: "מראש",
    fixed_asset: "רכוש קבוע", intangible: "נכסים בלתי מוחשיים", investment: "השקעות",
    current_asset: "שוטף", non_current_asset: "לא שוטף",
    payable: "זכאים", accrued: "הפרשות", loan: "הלוואות", tax_payable: "מיסים",
    current_liability: "שוטף", non_current_liability: "לא שוטף",
    retained_earnings: "עודפים", capital: "הון מניות", reserves: "קרנות",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2"><Scale className="w-4 h-4 text-blue-400" />מאזן — דו״ח מצב כספי</h3>
        <div className="flex items-center gap-2">
          <select value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-foreground">
            {[currentYear, currentYear - 1, currentYear - 2].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select value={compareYear || ""} onChange={e => setCompareYear(e.target.value ? Number(e.target.value) : null)}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-foreground">
            <option value="">ללא השוואה</option>
            {[currentYear - 1, currentYear - 2, currentYear - 3].map(y => (
              <option key={y} value={y}>השוואה ל-{y}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" className="border-slate-600" onClick={() => refetch()}><RefreshCw className="w-3.5 h-3.5" /></Button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">טוען מאזן...</div>
      ) : isError ? (
        <div className="p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-red-400 text-sm">שגיאה בטעינת המאזן</p>
          <p className="text-muted-foreground text-xs mt-1">{(error as Error)?.message || "שגיאה לא ידועה"}</p>
          <Button variant="outline" size="sm" className="mt-3 border-slate-600" onClick={() => refetch()}>נסה שוב</Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <KPICard label={'סה"כ נכסים'} value={fmt(summary?.totalAssets || 0)} icon={TrendingUp} color="text-emerald-400" />
            <KPICard label={'סה"כ התחייבויות'} value={fmt(summary?.totalLiabilities || 0)} icon={TrendingDown} color="text-red-400" />
            <KPICard label="הון עצמי" value={fmt(summary?.totalEquity || 0)} icon={Wallet} color="text-blue-400" />
            <KPICard label="התח׳ + הון" value={fmt(summary?.liabilitiesAndEquity || 0)}
              sub={isBalanced ? "מאזן מאוזן" : `הפרש: ${fmt(Math.abs((summary?.totalAssets || 0) - (summary?.liabilitiesAndEquity || 0)))}`}
              icon={isBalanced ? CheckCircle2 : AlertTriangle}
              color={isBalanced ? "text-emerald-400" : "text-yellow-400"} />
          </div>

          <div className={`rounded-lg p-3 flex items-center justify-between ${isBalanced ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-yellow-500/10 border border-yellow-500/20"}`}>
            <div className="flex items-center gap-3">
              {isBalanced ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-yellow-400" />}
              <div>
                <p className={`text-sm font-medium ${isBalanced ? "text-emerald-400" : "text-yellow-400"}`}>
                  {isBalanced ? "המאזן מאוזן" : "המאזן אינו מאוזן"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  נכסים ({fmt(summary?.totalAssets || 0)}) {isBalanced ? "=" : "≠"} התחייבויות + הון ({fmt(summary?.liabilitiesAndEquity || 0)})
                </p>
              </div>
            </div>
            <div className="text-left" dir="ltr">
              <p className="text-lg font-mono font-bold text-foreground">{fmt(summary?.totalAssets || 0)}</p>
              <p className="text-[10px] text-muted-foreground">שנת {fiscalYear}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="space-y-3">
              <BalanceSheetSection title="נכסים" titleColor="text-emerald-400" items={assets} typeLabels={subtypeLabels} />
            </div>
            <div className="space-y-3">
              <BalanceSheetSection title="התחייבויות" titleColor="text-red-400" items={liabilities} typeLabels={subtypeLabels} />
              <BalanceSheetSection title="הון עצמי" titleColor="text-blue-400" items={equity} typeLabels={subtypeLabels} />
            </div>
          </div>

          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardContent className="p-3">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">{'סה"כ נכסים'}</p>
                  <p className="text-lg font-mono font-bold text-emerald-400" dir="ltr">{fmt(summary?.totalAssets || 0)}</p>
                </div>
                <div className="flex items-center justify-center">
                  <span className={`text-2xl font-bold ${isBalanced ? "text-emerald-400" : "text-yellow-400"}`}>{isBalanced ? "=" : "≠"}</span>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">התח׳ ({fmt(summary?.totalLiabilities || 0)}) + הון ({fmt(summary?.totalEquity || 0)})</p>
                  <p className="text-lg font-mono font-bold text-blue-400" dir="ltr">{fmt(summary?.liabilitiesAndEquity || 0)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">{assets.length + liabilities.length + equity.length} חשבונות מאזניים</p>
            <p className="text-[10px] text-muted-foreground">מאזן שנת {fiscalYear} — סגנון חשבשבת</p>
          </div>
        </>
      )}
    </div>
  );
}

function PnLSection({ title, titleColor, icon: SIcon, items, subtypeLabels }: { title: string; titleColor: string; icon: any; items: any[]; subtypeLabels: Record<string, string> }) {
  const total = items.reduce((s: number, a: any) => s + Math.abs(Number(a.amount || 0)), 0);
  const nonZero = items.filter((a: any) => Math.abs(Number(a.amount || 0)) > 0);
  const zeroCount = items.length - nonZero.length;
  const grouped: Record<string, any[]> = {};
  for (const item of nonZero) {
    const sub = item.account_subtype || "other";
    if (!grouped[sub]) grouped[sub] = [];
    grouped[sub].push(item);
  }

  return (
    <Card className="bg-slate-900/50 border-slate-700/50">
      <CardHeader className="pb-1 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className={`text-sm ${titleColor} flex items-center gap-2`}><SIcon className="w-4 h-4" />{title} ({items.length})</CardTitle>
          <span className={`text-sm font-mono font-bold ${titleColor}`} dir="ltr">{fmt(total)}</span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-slate-700/40 bg-slate-800/30">
            <th className="p-2 text-right text-muted-foreground font-medium w-[70px]">מס׳ חשבון</th>
            <th className="p-2 text-right text-muted-foreground font-medium">שם חשבון</th>
            <th className="p-2 text-right text-muted-foreground font-medium w-[90px]">קטגוריה</th>
            <th className="p-2 text-right text-muted-foreground font-medium w-[110px]">סכום</th>
            <th className="p-2 text-right text-muted-foreground font-medium w-[60px]">% מסה״כ</th>
          </tr></thead>
          <tbody>
            {Object.entries(grouped).map(([subtype, accts]) => {
              const subTotal = accts.reduce((s: number, a: any) => s + Math.abs(Number(a.amount || 0)), 0);
              return (
                <React.Fragment key={subtype}>
                  <tr className="bg-slate-800/20 border-b border-slate-800/40">
                    <td colSpan={3} className="p-1.5 pr-3 text-muted-foreground font-medium text-[11px]">{subtypeLabels[subtype] || subtype}</td>
                    <td className={`p-1.5 font-mono text-left font-medium ${titleColor}`} dir="ltr">{fmtNum(subTotal)}</td>
                    <td className="p-1.5 text-muted-foreground text-left font-mono" dir="ltr">{total > 0 ? (subTotal / total * 100).toFixed(1) + "%" : "—"}</td>
                  </tr>
                  {accts.map((a: any) => {
                    const amt = Math.abs(Number(a.amount || 0));
                    return (
                      <tr key={a.account_number} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                        <td className="p-2 text-cyan-400 font-mono font-bold">{a.account_number}</td>
                        <td className="p-2 text-foreground">{a.account_name}</td>
                        <td className="p-2 text-muted-foreground text-[10px]">{subtypeLabels[a.account_subtype] || a.account_subtype || "—"}</td>
                        <td className={`p-2 font-mono text-left ${titleColor}`} dir="ltr">{fmtNum(amt)}</td>
                        <td className="p-2 text-muted-foreground text-left font-mono" dir="ltr">{total > 0 ? (amt / total * 100).toFixed(1) + "%" : "—"}</td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
            {zeroCount > 0 && (
              <tr className="border-b border-slate-800/40"><td colSpan={5} className="p-1.5 text-center text-muted-foreground text-[10px]">{zeroCount} חשבונות ללא תנועה</td></tr>
            )}
          </tbody>
          <tfoot><tr className="bg-slate-800/50 border-t-2 border-slate-600">
            <td colSpan={3} className="p-2 text-foreground font-bold">{'סה"כ'} {title}</td>
            <td className={`p-2 font-mono font-bold text-left ${titleColor}`} dir="ltr">{fmt(total)}</td>
            <td className="p-2 text-muted-foreground font-mono text-left" dir="ltr">100%</td>
          </tr></tfoot>
        </table>
      </CardContent>
    </Card>
  );
}

function ProfitLossTab() {
  const currentYear = new Date().getFullYear();
  const [fiscalYear, setFiscalYear] = useState(currentYear);
  const [periodFrom, setPeriodFrom] = useState(1);
  const [periodTo, setPeriodTo] = useState(12);

  const { data: plData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["profit-loss", fiscalYear, periodFrom, periodTo],
    queryFn: async () => {
      const params = new URLSearchParams({
        fiscal_year: String(fiscalYear),
        period_from: String(periodFrom),
        period_to: String(periodTo),
      });
      const r = await authFetch(`${API}/financial-reports/profit-loss?${params.toString()}`);
      return r.json();
    },
  });

  const summary = plData?.summary;
  const revenues = plData?.revenues || [];
  const expenses = plData?.expenses || [];
  const totalRevenue = summary?.totalRevenue || 0;
  const totalExpenses = summary?.totalExpenses || 0;
  const netIncome = summary?.netIncome || 0;
  const margin = summary?.margin || 0;
  const isProfit = netIncome >= 0;

  const monthNames = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];

  const subtypeLabels: Record<string, string> = {
    direct_revenue: "הכנסות ישירות", other_revenue: "הכנסות אחרות", service_revenue: "הכנסות שירות",
    interest_income: "הכנסות ריבית", rental_income: "הכנסות שכירות",
    cogs: "עלות המכר", operating: "תפעולי", admin: "הנהלה וכלליות", marketing: "שיווק ומכירות",
    financial: "הוצאות מימון", depreciation: "פחת", salary: "שכר עבודה",
    rent: "שכירות", utilities: "חשמל ומים", insurance: "ביטוח", taxes: "מיסים",
    other: "אחרות",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2"><BarChart3 className="w-4 h-4 text-emerald-400" />דוח רווח והפסד</h3>
        <div className="flex items-center gap-2">
          <select value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-foreground">
            {[currentYear, currentYear - 1, currentYear - 2].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select value={periodFrom} onChange={e => setPeriodFrom(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-foreground">
            {monthNames.map((m, i) => <option key={i} value={i + 1}>מ-{m}</option>)}
          </select>
          <select value={periodTo} onChange={e => setPeriodTo(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-foreground">
            {monthNames.map((m, i) => <option key={i} value={i + 1}>עד-{m}</option>)}
          </select>
          <Button variant="outline" size="sm" className="border-slate-600" onClick={() => refetch()}><RefreshCw className="w-3.5 h-3.5" /></Button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">טוען דוח רווח והפסד...</div>
      ) : isError ? (
        <div className="p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-red-400 text-sm">שגיאה בטעינת הדוח</p>
          <p className="text-muted-foreground text-xs mt-1">{(error as Error)?.message || "שגיאה לא ידועה"}</p>
          <Button variant="outline" size="sm" className="mt-3 border-slate-600" onClick={() => refetch()}>נסה שוב</Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <KPICard label={'סה"כ הכנסות'} value={fmt(totalRevenue)} icon={TrendingUp} color="text-emerald-400" />
            <KPICard label={'סה"כ הוצאות'} value={fmt(totalExpenses)} icon={TrendingDown} color="text-red-400" />
            <KPICard label={isProfit ? "רווח נקי" : "הפסד נקי"} value={fmt(Math.abs(netIncome))}
              sub={`${margin.toFixed(1)}% שיעור רווחיות`}
              icon={isProfit ? TrendingUp : TrendingDown}
              color={isProfit ? "text-emerald-400" : "text-red-400"} />
            <KPICard label="שיעור רווחיות" value={`${margin.toFixed(1)}%`}
              sub={totalRevenue > 0 ? `מתוך ${fmt(totalRevenue)}` : "אין הכנסות"}
              icon={PieChart}
              color={margin > 0 ? "text-emerald-400" : margin < 0 ? "text-red-400" : "text-muted-foreground"} />
          </div>

          <div className={`rounded-lg p-3 flex items-center justify-between ${isProfit ? "bg-emerald-500/10 border border-emerald-500/20" : netIncome === 0 ? "bg-muted/10 border border-slate-500/20" : "bg-red-500/10 border border-red-500/20"}`}>
            <div className="flex items-center gap-3">
              {isProfit ? <TrendingUp className="w-5 h-5 text-emerald-400" /> : netIncome === 0 ? <Scale className="w-5 h-5 text-muted-foreground" /> : <TrendingDown className="w-5 h-5 text-red-400" />}
              <div>
                <p className={`text-sm font-medium ${isProfit ? "text-emerald-400" : netIncome === 0 ? "text-muted-foreground" : "text-red-400"}`}>
                  {isProfit ? "רווח לתקופה" : netIncome === 0 ? "לא נרשמו תנועות" : "הפסד לתקופה"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  הכנסות ({fmt(totalRevenue)}) פחות הוצאות ({fmt(totalExpenses)})
                </p>
              </div>
            </div>
            <div className="text-left" dir="ltr">
              <p className={`text-lg font-mono font-bold ${isProfit ? "text-emerald-400" : netIncome === 0 ? "text-muted-foreground" : "text-red-400"}`}>{fmt(Math.abs(netIncome))}</p>
              <p className="text-[10px] text-muted-foreground">{monthNames[periodFrom - 1]} — {monthNames[periodTo - 1]} {fiscalYear}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <PnLSection title="הכנסות" titleColor="text-emerald-400" icon={TrendingUp} items={revenues} subtypeLabels={subtypeLabels} />
            <PnLSection title="הוצאות" titleColor="text-red-400" icon={TrendingDown} items={expenses} subtypeLabels={subtypeLabels} />
          </div>

          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardContent className="p-3">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-slate-700/30">
                    <td className="py-2 text-foreground font-medium">{'סה"כ הכנסות'}</td>
                    <td className="py-2 text-emerald-400 font-mono font-bold text-left" dir="ltr">{fmt(totalRevenue)}</td>
                  </tr>
                  <tr className="border-b border-slate-700/30">
                    <td className="py-2 text-foreground font-medium">{'סה"כ הוצאות'}</td>
                    <td className="py-2 text-red-400 font-mono font-bold text-left" dir="ltr">({fmt(totalExpenses)})</td>
                  </tr>
                  {totalRevenue > 0 && totalExpenses > 0 && (
                    <tr className="border-b border-slate-700/30">
                      <td className="py-2 text-muted-foreground">רווח גולמי</td>
                      <td className="py-2 text-slate-300 font-mono text-left" dir="ltr">{fmt(totalRevenue - totalExpenses)}</td>
                    </tr>
                  )}
                  <tr className="bg-slate-800/40">
                    <td className="py-2 text-foreground font-bold">{isProfit ? "רווח נקי" : "הפסד נקי"}</td>
                    <td className={`py-2 font-mono font-bold text-left text-lg ${isProfit ? "text-emerald-400" : "text-red-400"}`} dir="ltr">{fmt(netIncome)}</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">{revenues.length + expenses.length} חשבונות תוצאתיים</p>
            <p className="text-[10px] text-muted-foreground">תקופה {monthNames[periodFrom - 1]}—{monthNames[periodTo - 1]} {fiscalYear} — סגנון חשבשבת</p>
          </div>
        </>
      )}
    </div>
  );
}

function TrialBalanceTab() {
  const currentYear = new Date().getFullYear();
  const [fiscalYear, setFiscalYear] = useState(currentYear);
  const [showZero, setShowZero] = useState(false);
  const [search, setSearch] = useState("");

  const { data: tbData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["trial-balance", fiscalYear],
    queryFn: async () => {
      const r = await authFetch(`${API}/financial-reports/trial-balance?fiscal_year=${fiscalYear}`);
      return r.json();
    },
  });

  const accounts: any[] = tbData?.accounts || [];
  const summary = tbData?.summary;

  const typeLabels: Record<string, string> = { asset: "נכסים", liability: "התחייבויות", equity: "הון עצמי", revenue: "הכנסות", expense: "הוצאות" };
  const typeColors: Record<string, string> = { asset: "text-blue-400", liability: "text-red-400", equity: "text-purple-400", revenue: "text-emerald-400", expense: "text-orange-400" };

  const filtered = useMemo(() => {
    let list = accounts;
    if (!showZero) {
      list = list.filter((a: any) => {
        const d = Number(a.period_debit || a.debit_total || 0);
        const c = Number(a.period_credit || a.credit_total || 0);
        const b = Number(a.current_balance || a.opening_balance || 0);
        return d > 0 || c > 0 || b !== 0;
      });
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((a: any) => (a.account_number || "").includes(s) || (a.account_name || "").toLowerCase().includes(s));
    }
    return list;
  }, [accounts, showZero, search]);

  const grouped = useMemo(() => {
    const order = ["asset", "liability", "equity", "revenue", "expense"];
    const groups: Record<string, any[]> = {};
    for (const a of filtered) {
      const t = a.account_type || "other";
      if (!groups[t]) groups[t] = [];
      groups[t].push(a);
    }
    const sorted: [string, any[]][] = [];
    for (const t of order) {
      if (groups[t]) sorted.push([t, groups[t]]);
    }
    for (const [t, arr] of Object.entries(groups)) {
      if (!order.includes(t)) sorted.push([t, arr]);
    }
    return sorted;
  }, [filtered]);

  const totalDebit = summary?.totalDebit ?? filtered.reduce((s: number, a: any) => s + Number(a.period_debit || a.debit_total || 0), 0);
  const totalCredit = summary?.totalCredit ?? filtered.reduce((s: number, a: any) => s + Number(a.period_credit || a.credit_total || 0), 0);
  const difference = summary?.difference ?? Math.abs(totalDebit - totalCredit);
  const isBalanced = summary?.isBalanced ?? (difference < 0.01);
  const activeCount = filtered.length;
  const zeroCount = accounts.length - filtered.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2"><Scale className="w-4 h-4 text-amber-400" />מאזן בוחן</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="חיפוש חשבון..." value={search} onChange={e => setSearch(e.target.value)}
              className="bg-slate-800 border-slate-700 h-8 text-xs pr-8 w-40" />
          </div>
          <select value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-foreground">
            {[currentYear, currentYear - 1, currentYear - 2].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <Button variant={showZero ? "default" : "outline"} size="sm" className={showZero ? "bg-slate-700" : "border-slate-600"}
            onClick={() => setShowZero(!showZero)}>
            <Eye className="w-3.5 h-3.5 mr-1" />{showZero ? "הסתר אפסים" : "הצג אפסים"}
          </Button>
          <Button variant="outline" size="sm" className="border-slate-600" onClick={() => refetch()}><RefreshCw className="w-3.5 h-3.5" /></Button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">טוען מאזן בוחן...</div>
      ) : isError ? (
        <div className="p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-red-400 text-sm">שגיאה בטעינת מאזן בוחן</p>
          <p className="text-muted-foreground text-xs mt-1">{(error as Error)?.message || "שגיאה לא ידועה"}</p>
          <Button variant="outline" size="sm" className="mt-3 border-slate-600" onClick={() => refetch()}>נסה שוב</Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <KPICard label={'סה"כ חיוב'} value={fmt(totalDebit)} icon={TrendingUp} color="text-emerald-400" />
            <KPICard label={'סה"כ זיכוי'} value={fmt(totalCredit)} icon={TrendingDown} color="text-red-400" />
            <KPICard label="חשבונות פעילים" value={String(activeCount)} sub={`מתוך ${accounts.length}`} icon={List} color="text-blue-400" />
            <KPICard label="מצב איזון" value={isBalanced ? "מאוזן" : "לא מאוזן"}
              sub={isBalanced ? "חיוב = זיכוי" : `הפרש: ${fmt(difference)}`}
              icon={isBalanced ? CheckCircle2 : AlertTriangle}
              color={isBalanced ? "text-emerald-400" : "text-yellow-400"} />
          </div>

          <div className={`rounded-lg p-3 flex items-center justify-between ${isBalanced ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-yellow-500/10 border border-yellow-500/20"}`}>
            <div className="flex items-center gap-3">
              {isBalanced ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-yellow-400" />}
              <div>
                <p className={`text-sm font-medium ${isBalanced ? "text-emerald-400" : "text-yellow-400"}`}>
                  {isBalanced ? "מאזן בוחן מאוזן" : "מאזן בוחן לא מאוזן"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  חיוב ({fmt(totalDebit)}) {isBalanced ? "=" : "≠"} זיכוי ({fmt(totalCredit)})
                </p>
              </div>
            </div>
            <div className="text-left" dir="ltr">
              <p className="text-lg font-mono font-bold text-foreground">{fmt(totalDebit)}</p>
              <p className="text-[10px] text-muted-foreground">שנת {fiscalYear}</p>
            </div>
          </div>

          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-slate-700/40 bg-slate-800/30">
                  <th className="p-2 text-right text-muted-foreground font-medium w-[70px]">מס׳ חשבון</th>
                  <th className="p-2 text-right text-muted-foreground font-medium">שם חשבון</th>
                  <th className="p-2 text-right text-muted-foreground font-medium w-[80px]">סוג</th>
                  <th className="p-2 text-right text-muted-foreground font-medium w-[90px]">יתרת פתיחה</th>
                  <th className="p-2 text-right text-muted-foreground font-medium w-[90px]">חיוב</th>
                  <th className="p-2 text-right text-muted-foreground font-medium w-[90px]">זיכוי</th>
                  <th className="p-2 text-right text-muted-foreground font-medium w-[100px]">יתרה</th>
                </tr></thead>
                <tbody>
                  {grouped.map(([type, accts]) => {
                    const typeDebit = accts.reduce((s: number, a: any) => s + Number(a.period_debit || a.debit_total || 0), 0);
                    const typeCredit = accts.reduce((s: number, a: any) => s + Number(a.period_credit || a.credit_total || 0), 0);
                    return (
                      <React.Fragment key={type}>
                        <tr className="bg-slate-800/30 border-b border-slate-700/40">
                          <td colSpan={4} className={`p-2 font-bold text-sm ${typeColors[type] || "text-muted-foreground"}`}>{typeLabels[type] || type} ({accts.length})</td>
                          <td className="p-2 text-emerald-400 font-mono font-bold text-left" dir="ltr">{typeDebit > 0 ? fmtNum(typeDebit) : ""}</td>
                          <td className="p-2 text-red-400 font-mono font-bold text-left" dir="ltr">{typeCredit > 0 ? fmtNum(typeCredit) : ""}</td>
                          <td></td>
                        </tr>
                        {accts.map((a: any) => {
                          const d = Number(a.period_debit || a.debit_total || 0);
                          const c = Number(a.period_credit || a.credit_total || 0);
                          const bal = Number(a.current_balance || 0);
                          const ob = Number(a.opening_balance || 0);
                          return (
                            <tr key={a.account_number} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                              <td className="p-2 text-cyan-400 font-mono font-bold">{a.account_number}</td>
                              <td className="p-2 text-foreground">{a.account_name}</td>
                              <td className="p-2 text-muted-foreground text-[10px]">{a.normal_balance === "debit" ? "חיוב" : a.normal_balance === "credit" ? "זיכוי" : "—"}</td>
                              <td className="p-2 text-muted-foreground font-mono text-left" dir="ltr">{ob !== 0 ? fmtNum(ob) : ""}</td>
                              <td className="p-2 text-emerald-400 font-mono text-left" dir="ltr">{d > 0 ? fmtNum(d) : ""}</td>
                              <td className="p-2 text-red-400 font-mono text-left" dir="ltr">{c > 0 ? fmtNum(c) : ""}</td>
                              <td className={`p-2 font-mono font-bold text-left ${bal >= 0 ? "text-emerald-400" : "text-red-400"}`} dir="ltr">{bal !== 0 ? fmtNum(bal) : ""}</td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot><tr className="bg-slate-800/50 border-t-2 border-slate-600">
                  <td colSpan={4} className="p-2 text-foreground font-bold">{'סה"כ מאזן בוחן'}</td>
                  <td className="p-2 text-emerald-400 font-mono font-bold text-left" dir="ltr">{fmtNum(totalDebit)}</td>
                  <td className="p-2 text-red-400 font-mono font-bold text-left" dir="ltr">{fmtNum(totalCredit)}</td>
                  <td className={`p-2 font-mono font-bold text-left ${isBalanced ? "text-emerald-400" : "text-yellow-400"}`} dir="ltr">{isBalanced ? "=" : fmtNum(difference)}</td>
                </tr></tfoot>
              </table>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">{activeCount} חשבונות פעילים{zeroCount > 0 && !showZero ? ` (${zeroCount} עם יתרה אפס מוסתרים)` : ""}</p>
            <p className="text-[10px] text-muted-foreground">מאזן בוחן שנת {fiscalYear} — סגנון חשבשבת</p>
          </div>
        </>
      )}
    </div>
  );
}

function ReportsTab() {
  const reports = [
    { label: "רווח והפסד", desc: "דוח הכנסות והוצאות לתקופה", icon: BarChart3, href: "/finance/profit-loss", color: "text-emerald-400" },
    { label: "מאזן", desc: "מצב נכסים, התחייבויות והון", icon: Scale, href: "/finance/balance-sheet", color: "text-blue-400" },
    { label: "תזרים מזומנים", desc: "ניתוח זרימת כספים", icon: TrendingUp, href: "/finance/cash-flow", color: "text-cyan-400" },
    { label: "גיול חובות (Aging)", desc: "ניתוח חובות לפי גיל", icon: Clock, href: "/finance/aging-report", color: "text-orange-400" },
    { label: "חייבים (AR)", desc: "יתרות לקוחות ופירוט חובות", icon: Receipt, href: "/finance/accounts-receivable", color: "text-yellow-400" },
    { label: "זכאים (AP)", desc: "יתרות ספקים וחובות לתשלום", icon: CreditCard, href: "/finance/accounts-payable", color: "text-purple-400" },
    { label: "דוח הכנסות-הוצאות", desc: "ניתוח מפורט של הכנסות והוצאות", icon: PieChart, href: "/finance/income-expenses-report", color: "text-pink-400" },
    { label: "רווח תפעולי", desc: "ניתוח רווחיות תפעולית", icon: TrendingUp, href: "/finance/operational-profit", color: "text-lime-400" },
    { label: 'ספר גדול (ג"ל)', desc: "כל התנועות הכספיות", icon: FileSpreadsheet, href: "/finance/general-ledger", color: "text-indigo-400" },
    { label: "רכוש קבוע ופחת", desc: "רשימת נכסים ולוח פחת", icon: Building2, href: "/finance/fixed-assets", color: "text-amber-400" },
    { label: "מרכזי עלות", desc: "ניתוח עלויות לפי מרכז", icon: PieChart, href: "/finance/cost-centers", color: "text-teal-400" },
    { label: "תקציבים", desc: "מעקב תקציבי וביצוע", icon: Calculator, href: "/finance/budgets", color: "text-rose-400" },
  ];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-foreground flex items-center gap-2"><BarChart3 className="w-4 h-4 text-emerald-400" />דוחות כספיים</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {reports.map((r, i) => (
          <a key={i} href={r.href}>
            <Card className="bg-slate-900/50 border-slate-700/50 hover:border-slate-600/50 transition-colors cursor-pointer h-full">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-800/80 flex items-center justify-center flex-shrink-0">
                  <r.icon className={`w-5 h-5 ${r.color}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{r.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{r.desc}</p>
                </div>
              </CardContent>
            </Card>
          </a>
        ))}
      </div>
    </div>
  );
}

function VATTab() {
  const [vatCalc, setVatCalc] = useState({ amount: "", rate: "17" });
  const vatAmount = Number(vatCalc.amount || 0) * (Number(vatCalc.rate) / 100);
  const totalWithVat = Number(vatCalc.amount || 0) + vatAmount;
  const amountBeforeVat = Number(vatCalc.amount || 0) / (1 + Number(vatCalc.rate) / 100);
  const vatFromTotal = Number(vatCalc.amount || 0) - amountBeforeVat;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-foreground flex items-center gap-2"><Percent className="w-4 h-4 text-orange-400" />ניהול מע״מ ומיסים</h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2"><CardTitle className="text-sm">מחשבון מע״מ</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">סכום (₪)</Label>
              <Input type="number" value={vatCalc.amount} onChange={e => setVatCalc({ ...vatCalc, amount: e.target.value })} className="bg-slate-800 border-slate-700 mt-1" placeholder="0.00" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">שיעור מע״מ (%)</Label>
              <Input type="number" value={vatCalc.rate} onChange={e => setVatCalc({ ...vatCalc, rate: e.target.value })} className="bg-slate-800 border-slate-700 mt-1" />
            </div>
            {Number(vatCalc.amount) > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-700/40">
                <div className="text-xs text-muted-foreground">הוספת מע״מ:</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-800/50 rounded p-2"><p className="text-[10px] text-muted-foreground">מע״מ</p><p className="text-sm font-mono text-orange-400">{fmtNum(vatAmount)}</p></div>
                  <div className="bg-slate-800/50 rounded p-2"><p className="text-[10px] text-muted-foreground">סה״כ כולל</p><p className="text-sm font-mono text-emerald-400">{fmtNum(totalWithVat)}</p></div>
                </div>
                <div className="text-xs text-muted-foreground mt-2">חילוץ מע״מ מסכום כולל:</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-800/50 rounded p-2"><p className="text-[10px] text-muted-foreground">לפני מע״מ</p><p className="text-sm font-mono text-blue-400">{fmtNum(amountBeforeVat)}</p></div>
                  <div className="bg-slate-800/50 rounded p-2"><p className="text-[10px] text-muted-foreground">המע״מ</p><p className="text-sm font-mono text-orange-400">{fmtNum(vatFromTotal)}</p></div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2"><CardTitle className="text-sm">דוחות מס ומע״מ</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: 'דוח מע"מ חודשי / דו-חודשי', href: "/finance/vat-report", icon: Percent },
              { label: "ניהול מס הכנסה", href: "/finance/tax-management", icon: Shield },
              { label: "ניכוי מס במקור", href: "/finance/withholding-tax", icon: FileText },
              { label: "דוח 856 (ניכויים)", href: "#", icon: FileSpreadsheet },
              { label: "דוח שנתי לרשות המסים", href: "#", icon: ClipboardList },
            ].map((r, i) => (
              <a key={i} href={r.href}
                className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 hover:bg-slate-800/60 border border-slate-700/30 hover:border-slate-600/50 transition-colors">
                <r.icon className="w-4 h-4 text-orange-400 flex-shrink-0" />
                <span className="text-sm text-slate-300">{r.label}</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground mr-auto" />
              </a>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardHeader className="pb-2"><CardTitle className="text-sm">מחשבון ניכוי מס במקור</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "ספקים (30%)", rate: 30, desc: "שירותים ועבודה" },
              { label: "קבלנים (25%)", rate: 25, desc: "עבודות בנייה" },
              { label: "עצמאים (שכר סופרים 20%)", rate: 20, desc: "בעלי אישור פטור" },
            ].map((w, i) => (
              <div key={i} className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                <p className="text-xs text-foreground font-medium">{w.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{w.desc}</p>
                {Number(vatCalc.amount) > 0 && (
                  <p className="text-sm font-mono text-red-400 mt-2">ניכוי: {fmtNum(Number(vatCalc.amount) * w.rate / 100)} ₪</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BankTab() {
  const { data: bankAccounts, isLoading, refetch } = useQuery({
    queryKey: ["bank-accounts-ent"],
    queryFn: async () => { const r = await authFetch(`${API}/bank-accounts-enterprise`); const d = await r.json(); return safeArray(d); },
  });

  const totalBalance = (bankAccounts || []).filter((a: any) => a.is_active).reduce((s: number, a: any) => s + Number(a.current_balance || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2"><Landmark className="w-4 h-4 text-blue-400" />חשבונות בנק</h3>
        <div className="flex gap-2">
          <a href="/finance/bank-reconciliation"><Button variant="outline" size="sm" className="border-slate-600"><ArrowUpDown className="w-3.5 h-3.5 ml-1" />התאמת בנק</Button></a>
          <Button variant="outline" size="sm" className="border-slate-600" onClick={() => refetch()}><RefreshCw className="w-3.5 h-3.5" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <KPICard label="חשבונות" value={String((bankAccounts || []).length)} icon={Hash} color="text-foreground" />
        <KPICard label="יתרה כוללת" value={fmt(totalBalance)} icon={DollarSign} color={totalBalance >= 0 ? "text-emerald-400" : "text-red-400"} />
        <KPICard label="פעילים" value={String((bankAccounts || []).filter((a: any) => a.is_active).length)} icon={CheckCircle2} color="text-green-400" />
      </div>

      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">טוען חשבונות...</div>
          ) : (bankAccounts || []).length === 0 ? (
            <div className="p-8 text-center text-muted-foreground"><Landmark className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>אין חשבונות בנק</p></div>
          ) : (
            <table className="w-full text-xs">
              <thead><tr className="border-b border-slate-700/40 bg-slate-800/30">
                <th className="p-2.5 text-right text-muted-foreground font-medium">בנק</th>
                <th className="p-2.5 text-right text-muted-foreground font-medium">סניף</th>
                <th className="p-2.5 text-right text-muted-foreground font-medium">חשבון</th>
                <th className="p-2.5 text-right text-muted-foreground font-medium">סוג</th>
                <th className="p-2.5 text-right text-muted-foreground font-medium">מטבע</th>
                <th className="p-2.5 text-right text-muted-foreground font-medium">יתרה</th>
                <th className="p-2.5 text-right text-muted-foreground font-medium">סטטוס</th>
              </tr></thead>
              <tbody>
                {(bankAccounts || []).map((a: any) => (
                  <tr key={a.id} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                    <td className="p-2.5 text-foreground font-medium">{a.bank_name}</td>
                    <td className="p-2.5 text-muted-foreground font-mono">{a.branch_number || "—"}</td>
                    <td className="p-2.5 text-muted-foreground font-mono">{a.account_number || "—"}</td>
                    <td className="p-2.5"><Badge className="bg-slate-700/30 text-slate-300 text-[9px]">{a.account_type}</Badge></td>
                    <td className="p-2.5 text-muted-foreground">{a.currency || "ILS"}</td>
                    <td className={`p-2.5 font-mono font-bold ${Number(a.current_balance) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(Number(a.current_balance || 0))}</td>
                    <td className="p-2.5"><span className={`flex items-center gap-1 text-[10px] ${a.is_active ? "text-green-400" : "text-muted-foreground"}`}>{a.is_active ? <CheckCircle2 className="w-3 h-3" /> : <X className="w-3 h-3" />}{a.is_active ? "פעיל" : "לא פעיל"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsTab() {
  const [settings, setSettings] = useState({ vatRate: "17", incomeTaxRate: "23", fiscalYear: "calendar", invoicePrefix: "INV", nextInvoiceNum: "1", companyName: "טכנו-כל עוזי", companyId: "", accountantName: "", accountantPhone: "", accountantEmail: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const s = localStorage.getItem("erp_accounting_settings");
    if (s) try { setSettings({ ...settings, ...JSON.parse(s) }); } catch {}
  }, []);

  const save = () => {
    localStorage.setItem("erp_accounting_settings", JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-foreground flex items-center gap-2"><Settings className="w-4 h-4 text-muted-foreground" />הגדרות הנהלת חשבונות</h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2"><CardTitle className="text-sm">פרטי חברה</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <div><Label className="text-xs text-muted-foreground">שם החברה</Label><Input value={settings.companyName} onChange={e => setSettings({ ...settings, companyName: e.target.value })} className="bg-slate-800 border-slate-700 mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">ח.פ. / ע.מ.</Label><Input value={settings.companyId} onChange={e => setSettings({ ...settings, companyId: e.target.value })} className="bg-slate-800 border-slate-700 mt-1" /></div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2"><CardTitle className="text-sm">רואה חשבון / יועץ מס</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <div><Label className="text-xs text-muted-foreground">שם</Label><Input value={settings.accountantName} onChange={e => setSettings({ ...settings, accountantName: e.target.value })} className="bg-slate-800 border-slate-700 mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">טלפון</Label><Input value={settings.accountantPhone} onChange={e => setSettings({ ...settings, accountantPhone: e.target.value })} className="bg-slate-800 border-slate-700 mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">דוא״ל</Label><Input value={settings.accountantEmail} onChange={e => setSettings({ ...settings, accountantEmail: e.target.value })} className="bg-slate-800 border-slate-700 mt-1" /></div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2"><CardTitle className="text-sm">מיסוי</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <div><Label className="text-xs text-muted-foreground">שיעור מע״מ (%)</Label><Input value={settings.vatRate} onChange={e => setSettings({ ...settings, vatRate: e.target.value })} className="bg-slate-800 border-slate-700 mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">שיעור מס הכנסה (%)</Label><Input value={settings.incomeTaxRate} onChange={e => setSettings({ ...settings, incomeTaxRate: e.target.value })} className="bg-slate-800 border-slate-700 mt-1" /></div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2"><CardTitle className="text-sm">חשבוניות</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <div><Label className="text-xs text-muted-foreground">קידומת חשבוניות</Label><Input value={settings.invoicePrefix} onChange={e => setSettings({ ...settings, invoicePrefix: e.target.value })} className="bg-slate-800 border-slate-700 mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">מספר חשבונית הבאה</Label><Input type="number" value={settings.nextInvoiceNum} onChange={e => setSettings({ ...settings, nextInvoiceNum: e.target.value })} className="bg-slate-800 border-slate-700 mt-1" /></div>
            <div>
              <Label className="text-xs text-muted-foreground">שנת כספים</Label>
              <select value={settings.fiscalYear} onChange={e => setSettings({ ...settings, fiscalYear: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm mt-1 text-foreground">
                <option value="calendar">ינואר–דצמבר (שנה קלנדרית)</option>
                <option value="april">אפריל–מרץ</option>
                <option value="july">יולי–יוני</option>
              </select>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={save}><Save className="w-4 h-4 ml-2" />שמור הגדרות</Button>
        {saved && <span className="flex items-center gap-1.5 text-sm text-green-400"><CheckCircle2 className="w-4 h-4" />נשמר בהצלחה</span>}
      </div>
    </div>
  );
}

export default function AccountingPortalPage() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="w-6 h-6 text-emerald-400" /> הנהלת חשבונות
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">מערכת הנהלת חשבונות כפולה מלאה — בסגנון חשבשבת / Summit</p>
        </div>
        <Badge className="bg-emerald-500/15 text-emerald-400 text-xs">הנה״ח כפולה</Badge>
      </div>

      <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1 flex-wrap overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs transition-colors whitespace-nowrap ${
              activeTab === tab.id ? "bg-slate-700 text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-slate-700/50"
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "dashboard" && <DashboardTab />}
      {activeTab === "journal" && <JournalTab />}
      {activeTab === "ledger" && <LedgerTab />}
      {activeTab === "chart" && <ChartOfAccountsTab />}
      {activeTab === "balance" && <BalanceSheetTab />}
      {activeTab === "pnl" && <ProfitLossTab />}
      {activeTab === "trial" && <TrialBalanceTab />}
      {activeTab === "reports" && <ReportsTab />}
      {activeTab === "vat" && <VATTab />}
      {activeTab === "bank" && <BankTab />}
      {activeTab === "settings" && <SettingsTab />}
    </div>
  );
}
