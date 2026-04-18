import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen, Plus, Search, RefreshCw, ChevronDown, ChevronLeft, Save, X,
  AlertTriangle, CheckCircle2, TrendingUp, FileText, Calendar, Trash2, PlusCircle
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

const API = "/api";
const fmt = (v: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);
const fmtNum = (v: number) => new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 }).format(v);
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("he-IL") : "—";

const statusLabels: Record<string, string> = { posted: "רשום", draft: "טיוטה", voided: "מבוטל", pending: "ממתין" };
const statusColors: Record<string, string> = {
  posted: "bg-green-500/15 text-green-400 border-green-500/30",
  draft: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  voided: "bg-red-500/15 text-red-400 border-red-500/30",
  pending: "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

interface JournalLine {
  id: string;
  accountNumber: string;
  accountName: string;
  accountId?: number | null;
  description: string;
  debitAmount: number;
  creditAmount: number;
}

function newLine(): JournalLine {
  return { id: crypto.randomUUID(), accountNumber: "", accountName: "", accountId: null, description: "", debitAmount: 0, creditAmount: 0 };
}

function AccountDropdown({ value, onChange, accounts }: { value: string; onChange: (acc: any) => void; accounts: any[] }) {
  const [search, setSearch] = useState(value);
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    if (!search) return accounts.slice(0, 20);
    const s = search.toLowerCase();
    return accounts.filter(a =>
      (a.account_number || "").toLowerCase().includes(s) ||
      (a.account_name || "").toLowerCase().includes(s) ||
      (a.account_name_he || "").toLowerCase().includes(s)
    ).slice(0, 20);
  }, [search, accounts]);

  return (
    <div className="relative">
      <Input
        value={search}
        onChange={e => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="חשבון..."
        className="bg-slate-900 border-slate-700 h-8 text-xs"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-64 bg-card border border-slate-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {filtered.map((a: any) => (
            <button key={a.id} type="button"
              className="w-full px-3 py-1.5 text-right text-xs text-foreground hover:bg-slate-700 flex items-center gap-2"
              onMouseDown={() => { onChange(a); setSearch(`${a.account_number} — ${a.account_name_he || a.account_name}`); setOpen(false); }}>
              <span className="text-cyan-400 font-mono">{a.account_number}</span>
              <span className="truncate">{a.account_name_he || a.account_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function KPICard({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: any; color: string }) {
  return (
    <Card className="bg-slate-900/60 border-slate-700/40 hover:border-slate-600/50 transition-colors">
      <CardContent className="p-3 flex items-start gap-3">
        <div className={`p-2 rounded-lg bg-slate-800/60 ${color}`}><Icon className="w-4 h-4" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-lg font-bold text-foreground truncate">{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function JournalDetailLines({ entryId }: { entryId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["journal-lines", entryId],
    queryFn: async () => {
      const r = await authFetch(`${API}/journal-entries/${entryId}/lines`);
      const d = await r.json();
      return Array.isArray(d) ? d : (d?.data || d?.lines || []);
    },
  });

  if (isLoading) return <div className="p-3 text-center text-muted-foreground text-xs">טוען שורות...</div>;
  const lines = data || [];
  if (lines.length === 0) return <div className="p-3 text-center text-muted-foreground text-xs">אין שורות פירוט</div>;

  const totalDebit = lines.reduce((s: number, l: any) => s + Number(l.debit_amount || 0), 0);
  const totalCredit = lines.reduce((s: number, l: any) => s + Number(l.credit_amount || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return (
    <div className="bg-slate-950/50 border-t border-slate-700/30">
      <table className="w-full text-xs">
        <thead><tr className="bg-slate-800/40 border-b border-slate-700/30">
          <th className="p-2 text-right text-muted-foreground font-medium">מס׳ חשבון</th>
          <th className="p-2 text-right text-muted-foreground font-medium">שם חשבון</th>
          <th className="p-2 text-right text-muted-foreground font-medium">תיאור</th>
          <th className="p-2 text-right text-muted-foreground font-medium">חיוב (דביט)</th>
          <th className="p-2 text-right text-muted-foreground font-medium">זיכוי (קרדיט)</th>
        </tr></thead>
        <tbody>
          {lines.map((line: any, i: number) => (
            <tr key={line.id || i} className="border-b border-slate-800/30 hover:bg-slate-800/20">
              <td className="p-2 text-cyan-400 font-mono">{line.account_number || "—"}</td>
              <td className="p-2 text-foreground">{line.account_name || "—"}</td>
              <td className="p-2 text-muted-foreground">{line.description || "—"}</td>
              <td className="p-2 text-emerald-400 font-mono text-left" dir="ltr">{Number(line.debit_amount || 0) > 0 ? fmtNum(Number(line.debit_amount)) : ""}</td>
              <td className="p-2 text-red-400 font-mono text-left" dir="ltr">{Number(line.credit_amount || 0) > 0 ? fmtNum(Number(line.credit_amount)) : ""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr className="bg-slate-800/40 border-t border-slate-700">
          <td colSpan={3} className="p-2 text-xs font-bold text-foreground">סה״כ</td>
          <td className="p-2 text-emerald-400 font-mono font-bold text-left" dir="ltr">{fmtNum(totalDebit)}</td>
          <td className="p-2 text-red-400 font-mono font-bold text-left" dir="ltr">{fmtNum(totalCredit)}</td>
        </tr>
        {!balanced && (
          <tr><td colSpan={5} className="p-2 text-center text-red-400 text-xs font-bold bg-red-500/10">⚠ פקודה לא מאוזנת — הפרש: {fmtNum(Math.abs(totalDebit - totalCredit))}</td></tr>
        )}</tfoot>
      </table>
    </div>
  );
}

function NewEntryForm({ onClose, onSuccess, accounts }: { onClose: () => void; onSuccess: () => void; accounts: any[] }) {
  const [form, setForm] = useState({
    entry_date: new Date().toISOString().split("T")[0],
    description: "",
    reference: "",
    notes: "",
  });
  const [lines, setLines] = useState<JournalLine[]>([
    { ...newLine(), debitAmount: 0, creditAmount: 0 },
    { ...newLine(), debitAmount: 0, creditAmount: 0 },
  ]);
  const [mutError, setMutError] = useState("");

  const totalDebit = lines.reduce((s, l) => s + (l.debitAmount || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.creditAmount || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const createMutation = useMutation({
    mutationFn: async (body: any) => {
      const r = await authFetch(`${API}/journal-entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => null);
        throw new Error(err?.error || "שגיאה ביצירת פקודת יומן");
      }
      const entry = await r.json();
      if (entry?.id) {
        const linePayload = lines
          .filter(l => l.debitAmount > 0 || l.creditAmount > 0)
          .map((l, idx) => ({
            lineNumber: idx + 1,
            accountNumber: l.accountNumber,
            accountName: l.accountName,
            accountId: l.accountId || null,
            description: l.description || form.description,
            debitAmount: l.debitAmount,
            creditAmount: l.creditAmount,
          }));
        if (linePayload.length > 0) {
          await authFetch(`${API}/journal-entries/${entry.id}/lines`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(linePayload),
          });
        }
      }
      return entry;
    },
    onSuccess: () => { setMutError(""); onSuccess(); onClose(); },
    onError: (err: Error) => { setMutError(err.message); },
  });

  const updateLine = (id: string, field: keyof JournalLine, value: any) => {
    setLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  const addLine = () => setLines(prev => [...prev, newLine()]);
  const removeLine = (id: string) => setLines(prev => prev.length > 2 ? prev.filter(l => l.id !== id) : prev);

  const warnings: string[] = [];
  if (!form.description) warnings.push("חסר תיאור");
  if (lines.filter(l => l.debitAmount > 0 || l.creditAmount > 0).length < 2) warnings.push("נדרשות לפחות 2 שורות עם סכומים");
  if (totalDebit > 0 && !balanced) warnings.push(`אי-איזון: חיוב ${fmtNum(totalDebit)} ≠ זיכוי ${fmtNum(totalCredit)} (הפרש: ${fmtNum(Math.abs(totalDebit - totalCredit))})`);

  const canSave = form.description && balanced && !createMutation.isPending;

  return (
    <Card className="bg-slate-900/80 border-slate-600/50">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-foreground flex items-center gap-2"><Plus className="w-4 h-4 text-blue-400" />פקודת יומן חדשה — רישום כפול</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div><Label className="text-xs text-muted-foreground">תאריך</Label>
            <Input type="date" value={form.entry_date} onChange={e => setForm({ ...form, entry_date: e.target.value })} className="bg-slate-800 border-slate-700 h-8 text-sm" /></div>
          <div className="col-span-2"><Label className="text-xs text-muted-foreground">תיאור *</Label>
            <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="תיאור הפעולה" className="bg-slate-800 border-slate-700 h-8 text-sm" /></div>
          <div><Label className="text-xs text-muted-foreground">אסמכתא</Label>
            <Input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="INV-001" className="bg-slate-800 border-slate-700 h-8 text-sm" /></div>
        </div>

        <div className="bg-slate-950/40 rounded-lg border border-slate-700/50 overflow-hidden">
          <div className="bg-slate-800/40 border-b border-slate-700/50 px-3 py-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">שורות פקודה (רישום כפול)</span>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-emerald-400">חיוב: {fmtNum(totalDebit)}</span>
              <span className="text-red-400">זיכוי: {fmtNum(totalCredit)}</span>
              <span className={balanced ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                {balanced ? "✓ מאוזן" : `⚠ הפרש: ${fmtNum(Math.abs(totalDebit - totalCredit))}`}
              </span>
            </div>
          </div>
          <table className="w-full text-xs">
            <thead><tr className="bg-slate-800/30 border-b border-slate-700/30">
              <th className="p-2 text-right text-muted-foreground font-medium w-6">#</th>
              <th className="p-2 text-right text-muted-foreground font-medium">חשבון</th>
              <th className="p-2 text-right text-muted-foreground font-medium">תיאור שורה</th>
              <th className="p-2 text-right text-muted-foreground font-medium w-32">חיוב (₪)</th>
              <th className="p-2 text-right text-muted-foreground font-medium w-32">זיכוי (₪)</th>
              <th className="p-2 w-8"></th>
            </tr></thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={line.id} className="border-b border-slate-800/30">
                  <td className="p-2 text-muted-foreground text-center">{idx + 1}</td>
                  <td className="p-1">
                    <AccountDropdown
                      value={line.accountNumber ? `${line.accountNumber} — ${line.accountName}` : ""}
                      accounts={accounts}
                      onChange={(a: any) => {
                        updateLine(line.id, "accountNumber", a.account_number || "");
                        updateLine(line.id, "accountName", a.account_name_he || a.account_name || "");
                        updateLine(line.id, "accountId", a.id || null);
                      }}
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      value={line.description}
                      onChange={e => updateLine(line.id, "description", e.target.value)}
                      placeholder="תיאור..."
                      className="bg-slate-900 border-slate-700 h-8 text-xs"
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={line.debitAmount || ""}
                      onChange={e => {
                        const v = Number(e.target.value) || 0;
                        updateLine(line.id, "debitAmount", v);
                        if (v > 0) updateLine(line.id, "creditAmount", 0);
                      }}
                      className="bg-slate-900 border-slate-700 h-8 text-xs text-emerald-400 font-mono text-left"
                      dir="ltr"
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={line.creditAmount || ""}
                      onChange={e => {
                        const v = Number(e.target.value) || 0;
                        updateLine(line.id, "creditAmount", v);
                        if (v > 0) updateLine(line.id, "debitAmount", 0);
                      }}
                      className="bg-slate-900 border-slate-700 h-8 text-xs text-red-400 font-mono text-left"
                      dir="ltr"
                    />
                  </td>
                  <td className="p-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-300"
                      onClick={() => removeLine(line.id)} disabled={lines.length <= 2}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-2 border-t border-slate-700/30 flex justify-between items-center">
            <Button variant="ghost" size="sm" className="text-blue-400 hover:text-blue-300 text-xs gap-1" onClick={addLine}>
              <PlusCircle className="w-3.5 h-3.5" />הוסף שורה
            </Button>
          </div>
        </div>

        <div><Label className="text-xs text-muted-foreground">הערות</Label>
          <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="הערות נוספות" className="bg-slate-800 border-slate-700 h-8 text-sm" /></div>

        {warnings.length > 0 && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-2">
            {warnings.map((w, i) => <p key={i} className="text-[10px] text-yellow-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{w}</p>)}
          </div>
        )}
        {mutError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded p-2">
            <p className="text-[10px] text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{mutError}</p>
          </div>
        )}

        <div className="flex items-center justify-end border-t border-slate-700/40 pt-3">
          <Button size="sm" disabled={!canSave}
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => createMutation.mutate({
              entryDate: form.entry_date,
              description: form.description,
              reference: form.reference,
              amount: totalDebit,
              notes: form.notes,
              status: "posted",
              entryType: "standard",
            })}>
            <Save className="w-3.5 h-3.5 mr-1" />{createMutation.isPending ? "שומר..." : "שמור פקודה"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function JournalPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showNewEntry, setShowNewEntry] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [detailTab, setDetailTab] = useState("details");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();

  const { data: entriesData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["journal-entries-page"],
    queryFn: async () => {
      const r = await authFetch(`${API}/journal-entries`);
      if (!r.ok) throw new Error("שגיאה בטעינת פקודות יומן");
      const d = await r.json();
      return Array.isArray(d) ? d : (d?.data || d?.items || []);
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["journal-stats-page"],
    queryFn: async () => {
      const r = await authFetch(`${API}/journal-entries/stats`);
      if (!r.ok) throw new Error("שגיאה בטעינת סטטיסטיקות");
      return r.json();
    },
  });

  const { data: accountsData } = useQuery({
    queryKey: ["financial-accounts-journal"],
    queryFn: async () => {
      const r = await authFetch(`${API}/finance/financial_accounts?limit=500&sort=account_number&order=asc`);
      const d = await r.json();
      return Array.isArray(d) ? d : (d?.data || []);
    },
  });

  const accounts = accountsData || [];
  const entries = entriesData || [];

  const filtered = useMemo(() => {
    let list = entries;
    if (statusFilter !== "all") list = list.filter((e: any) => e.status === statusFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((e: any) =>
        (e.description || "").toLowerCase().includes(s) ||
        (e.entry_number || "").toLowerCase().includes(s) ||
        (e.reference || "").toLowerCase().includes(s) ||
        (e.debit_account_name || "").toLowerCase().includes(s) ||
        (e.credit_account_name || "").toLowerCase().includes(s)
      );
    }
    if (dateFrom) list = list.filter((e: any) => e.entry_date >= dateFrom);
    if (dateTo) list = list.filter((e: any) => e.entry_date <= dateTo);
    return list;
  }, [entries, statusFilter, search, dateFrom, dateTo]);

  const totalAmount = filtered.reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
  const postedCount = filtered.filter((e: any) => e.status === "posted").length;

  return (
    <div className="space-y-4 p-4 max-w-7xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-400" />יומן — פקודות יומן
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">רישום כפול (Double-Entry Bookkeeping) — סגנון חשבשבת</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="border-slate-600" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => setShowNewEntry(v => !v)}>
            <Plus className="w-3.5 h-3.5 mr-1" />פקודה חדשה
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
        <KPICard label={'סה"כ פקודות'} value={String(stats?.total || entries.length)} sub={`${postedCount} רשומות`} icon={BookOpen} color="text-blue-400" />
        <KPICard label={'סה"כ סכום'} value={fmt(Number(stats?.total_amount || totalAmount))} icon={TrendingUp} color="text-emerald-400" />
        <KPICard label="רשומות" value={String(stats?.posted || postedCount)} icon={CheckCircle2} color="text-green-400" />
        <KPICard label="טיוטות" value={String(stats?.drafts || 0)} icon={FileText} color="text-yellow-400" />
        <KPICard label="החודש" value={fmt(Number(stats?.month_amount || 0))} icon={Calendar} color="text-cyan-400" />
        <KPICard label="לא מאוזנות" value={String(stats?.unbalanced || 0)} icon={AlertTriangle} color={Number(stats?.unbalanced || 0) > 0 ? "text-red-400" : "text-muted-foreground"} />
      </div>

      {showNewEntry && (
        <NewEntryForm
          accounts={accounts}
          onClose={() => setShowNewEntry(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["journal-entries-page"] });
            qc.invalidateQueries({ queryKey: ["journal-stats-page"] });
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="חיפוש לפי תיאור, אסמכתא, חשבון..." value={search} onChange={e => setSearch(e.target.value)}
            className="bg-slate-800 border-slate-700 h-8 text-xs pr-8" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-foreground h-8">
          <option value="all">כל הסטטוסים</option>
          <option value="posted">רשום</option>
          <option value="draft">טיוטה</option>
          <option value="voided">מבוטל</option>
        </select>
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="מתאריך"
          className="bg-slate-800 border-slate-700 h-8 text-xs w-36" />
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="עד תאריך"
          className="bg-slate-800 border-slate-700 h-8 text-xs w-36" />
        {(search || statusFilter !== "all" || dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter("all"); setDateFrom(""); setDateTo(""); }}>
            <X className="w-3.5 h-3.5 mr-1" />נקה
          </Button>
        )}
      </div>

      <BulkActions items={filtered} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
        defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/journal-entries/${id}`, { method: "DELETE" }))); refetch(); }),
        defaultBulkActions.export(async (ids) => { const csv = filtered.filter((e: any) => ids.includes(String(e.id))).map((e: any) => `${e.entry_number},${e.description},${e.amount},${e.status}`).join("\n"); const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "journal.csv"; a.click(); }),
      ]} />

      {isLoading ? (
        <div className="p-12 text-center text-muted-foreground">טוען פקודות יומן...</div>
      ) : isError ? (
        <div className="p-12 text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-red-400 text-sm">שגיאה בטעינת פקודות יומן</p>
          <p className="text-muted-foreground text-xs mt-1">{(error as Error)?.message || "שגיאה לא ידועה"}</p>
          <Button variant="outline" size="sm" className="mt-3 border-slate-600" onClick={() => refetch()}>נסה שוב</Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground">
          <BookOpen className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm">{entries.length === 0 ? "אין פקודות יומן" : "לא נמצאו תוצאות לסינון"}</p>
        </div>
      ) : (
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-0">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-slate-700/40 bg-slate-800/30">
                <th className="p-2.5 w-[30px]"><BulkCheckbox items={filtered} selectedIds={selectedIds} onToggleAll={(ids) => toggleAll(ids)} type="header" /></th>
                <th className="p-2.5 text-right text-muted-foreground font-medium w-[30px]"></th>
                <th className="p-2.5 text-right text-muted-foreground font-medium w-[100px]">מס׳ פקודה</th>
                <th className="p-2.5 text-right text-muted-foreground font-medium w-[85px]">תאריך</th>
                <th className="p-2.5 text-right text-muted-foreground font-medium">תיאור</th>
                <th className="p-2.5 text-right text-muted-foreground font-medium w-[80px]">אסמכתא</th>
                <th className="p-2.5 text-right text-muted-foreground font-medium w-[120px]">חשבון חיוב</th>
                <th className="p-2.5 text-right text-muted-foreground font-medium w-[120px]">חשבון זיכוי</th>
                <th className="p-2.5 text-right text-muted-foreground font-medium w-[100px]">סכום</th>
                <th className="p-2.5 text-right text-muted-foreground font-medium w-[70px]">סטטוס</th>
              </tr></thead>
              <tbody>
                {filtered.map((entry: any) => {
                  const isExpanded = expandedId === entry.id;
                  return (
                    <React.Fragment key={entry.id}>
                      <tr
                        className={`border-b border-slate-800/40 hover:bg-slate-800/20 cursor-pointer ${isExpanded ? "bg-slate-800/30" : ""}`}
                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      >
                        <td className="p-2.5" onClick={e => e.stopPropagation()}><BulkCheckbox id={String(entry.id)} isSelected={isSelected(String(entry.id))} onToggle={() => toggle(String(entry.id))} type="row" /></td>
                        <td className="p-2.5 text-muted-foreground">
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                        </td>
                        <td className="p-2.5 text-cyan-400 font-mono font-bold">{entry.entry_number || `#${entry.id}`}</td>
                        <td className="p-2.5 text-slate-300">{fmtDate(entry.entry_date)}</td>
                        <td className="p-2.5 text-foreground font-medium truncate max-w-[200px]">{entry.description}</td>
                        <td className="p-2.5 text-muted-foreground font-mono text-[10px]">{entry.reference || "—"}</td>
                        <td className="p-2.5 text-emerald-400 text-[11px]">{entry.debit_account_name || "—"}</td>
                        <td className="p-2.5 text-red-400 text-[11px]">{entry.credit_account_name || "—"}</td>
                        <td className="p-2.5 font-mono font-bold text-foreground text-left" dir="ltr">{fmt(Number(entry.amount || 0))}</td>
                        <td className="p-2.5">
                          <Badge className={`text-[10px] ${statusColors[entry.status] || "bg-muted/15 text-muted-foreground"}`}>
                            {statusLabels[entry.status] || entry.status}
                          </Badge>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={10} className="p-0">
                            <div className="bg-slate-950/30 border-t border-b border-slate-700/30 p-3 space-y-2">
                              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                                <div><span className="text-muted-foreground">סוג: </span><span className="text-foreground">{entry.entry_type || "standard"}</span></div>
                                <div><span className="text-muted-foreground">שנת כספים: </span><span className="text-foreground">{entry.fiscal_year || "—"}</span></div>
                                <div><span className="text-muted-foreground">תקופה: </span><span className="text-foreground">{entry.fiscal_period || "—"}</span></div>
                                <div><span className="text-muted-foreground">נוצר ע״י: </span><span className="text-foreground">{entry.created_by_name || "—"}</span></div>
                                {entry.notes && <div className="col-span-4"><span className="text-muted-foreground">הערות: </span><span className="text-slate-300">{entry.notes}</span></div>}
                              </div>
                              <JournalDetailLines entryId={entry.id} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot><tr className="bg-slate-800/50 border-t-2 border-slate-600">
                <td colSpan={8} className="p-2.5 text-foreground font-bold">{'סה"כ'} {filtered.length} פקודות</td>
                <td className="p-2.5 font-mono font-bold text-emerald-400 text-left" dir="ltr">{fmt(totalAmount)}</td>
                <td></td>
              </tr></tfoot>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground">{filtered.length} מתוך {entries.length} פקודות</p>
        <p className="text-[10px] text-muted-foreground">יומן — רישום כפול — סגנון חשבשבת</p>
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
                    <div><div className="text-xs text-muted-foreground mb-1">חשבון חיוב</div><div className="text-sm text-emerald-400">{selectedItem.debit_account_name || "-"}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">חשבון זיכוי</div><div className="text-sm text-red-400">{selectedItem.credit_account_name || "-"}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">אסמכתא</div><div className="text-sm text-foreground">{selectedItem.reference || "-"}</div></div>
                  </div>
                  <JournalDetailLines entryId={selectedItem.id} />
                </div>
              )}
              {detailTab === "related" && <RelatedRecords entityType="journal-entries" entityId={selectedItem.id} tabs={[{ key: "lines", label: "שורות פירוט", endpoint: `${API}/journal-entries/${selectedItem.id}/lines` }, { key: "accounts", label: "חשבונות", endpoint: `${API}/chart-of-accounts?journal_entry_id=${selectedItem.id}` }]} />}
              {detailTab === "docs" && <AttachmentsSection entityType="journal-entries" entityId={selectedItem.id} />}
              {detailTab === "history" && <ActivityLog entityType="journal-entries" entityId={selectedItem.id} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
