import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Receipt, Download, Plus, Search, Filter, Printer, Upload, MoreHorizontal,
  ChevronRight, ChevronLeft, ArrowUpDown, ArrowUp, ArrowDown, X, Save,
  Eye, Edit2, Trash2, Copy, FileSpreadsheet, TrendingUp, TrendingDown,
  Users, DollarSign, Calendar, CheckCircle2, AlertTriangle, Clock,
  FileText, Send, RefreshCw, ChevronsUpDown, AlertCircle, Loader2
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import ImportButton from "@/components/import-button";

const fmt = (v: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v / 100);
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("he-IL") : "—";

type SortField = "employee" | "month" | "gross" | "net" | "status" | "department";
type SortDir = "asc" | "desc";

interface Payslip {
  id: string;
  employee: string;
  employeeId: string;
  department: string;
  month: string;
  gross: number;
  net: number;
  tax: number;
  socialSecurity: number;
  pension: number;
  overtime: number;
  status: string;
  [key: string]: unknown;
}

const STATUSES = ["טיוטה", "ממתין לאישור", "מאושר", "נשלח", "שולם"] as const;
const STATUS_COLORS: Record<string, string> = {
  "טיוטה": "bg-gray-500/20 text-gray-300",
  "ממתין לאישור": "bg-yellow-500/20 text-yellow-300",
  "מאושר": "bg-blue-500/20 text-blue-300",
  "נשלח": "bg-purple-500/20 text-purple-300",
  "שולם": "bg-green-500/20 text-green-300",
};
const DEPARTMENTS = ["ייצור", "הנהלה", "כספים", "שיווק", "לוגיסטיקה", "טכנולוגיה", "משאבי אנוש", "מכירות"];
const MONTHS = ["ינואר 2026", "פברואר 2026", "מרץ 2026"];



export default function Payslips() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [data, setData] = useState<Payslip[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Payslip>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("employee");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let d: Payslip[] = [...data];
    if (search) {
      const s = search.toLowerCase();
      d = d.filter(r => (r.employee || "").toLowerCase().includes(s) || (r.id || "").toString().toLowerCase().includes(s) || (r.employeeId || "").toLowerCase().includes(s));
    }
    if (statusFilter !== "all") d = d.filter(r => r.status === statusFilter);
    if (deptFilter !== "all") d = d.filter(r => r.department === deptFilter);
    if (monthFilter !== "all") d = d.filter(r => r.month === monthFilter);
    d.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "employee": cmp = (a.employee || "").localeCompare(b.employee || ""); break;
        case "month": cmp = (a.month || "").localeCompare(b.month || ""); break;
        case "gross": cmp = (a.gross || 0) - (b.gross || 0); break;
        case "net": cmp = (a.net || 0) - (b.net || 0); break;
        case "status": cmp = STATUSES.indexOf(a.status as never) - STATUSES.indexOf(b.status as never); break;
        case "department": cmp = (a.department || "").localeCompare(b.department || ""); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return d;
  }, [data, search, statusFilter, deptFilter, monthFilter, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const pageData = filtered.slice((page - 1) * perPage, page * perPage);
  const allSelected = pageData.length > 0 && pageData.every(r => selected.has(r.id));

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronsUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-blue-400" /> : <ArrowDown className="h-3 w-3 text-blue-400" />;
  };

  const totalGross = filtered.reduce((s, r) => s + r.gross, 0);
  const totalNet = filtered.reduce((s, r) => s + r.net, 0);
  const totalTax = filtered.reduce((s, r) => s + r.tax, 0);
  const paidCount = filtered.filter(r => r.status === "שולם").length;
  const pendingCount = filtered.filter(r => r.status === "ממתין לאישור").length;
  const avgGross = filtered.length ? totalGross / filtered.length : 0;

  const kpis = [
    { label: "סה\"כ תלושים", value: String(filtered.length), icon: Receipt, color: "text-blue-400", trend: "+12", trendUp: true },
    { label: "סה\"כ ברוטו", value: fmt(totalGross), icon: DollarSign, color: "text-emerald-400", trend: "+5.2%", trendUp: true },
    { label: "סה\"כ נטו", value: fmt(totalNet), icon: DollarSign, color: "text-cyan-400", trend: "+4.8%", trendUp: true },
    { label: "סה\"כ מס", value: fmt(totalTax), icon: FileText, color: "text-orange-400", trend: "+3.1%", trendUp: false },
    { label: "שולמו", value: String(paidCount), icon: CheckCircle2, color: "text-green-400", trend: `${Math.round(paidCount / Math.max(1, filtered.length) * 100)}%`, trendUp: true },
    { label: "ממתינים", value: String(pendingCount), icon: Clock, color: "text-yellow-400", trend: String(pendingCount), trendUp: false },
  ];

  const load = useCallback(async () => {
    try {
      const res = await authFetch("/api/hr/payslips");
      if (res.ok) {
        const json = await res.json();
        setData(Array.isArray(json) ? (json as Payslip[]) : ((json.data ?? []) as Payslip[]));
      }
    } catch (e) { setError(e instanceof Error ? e.message : "שגיאת רשת"); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeFilters = [statusFilter !== "all", deptFilter !== "all", monthFilter !== "all"].filter(Boolean).length;
  const clearFilters = () => { setStatusFilter("all"); setDeptFilter("all"); setMonthFilter("all"); setSearch(""); };

  const detailRecord = showDetail ? data.find(r => r.id === showDetail) : null;
  const handleSave = async () => {
    setSaving(true);
    try {
      const method = editId ? "PUT" : "POST";
      const url = editId ? `/api/hr/payslips/${editId}` : "/api/hr/payslips";
      const res = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json().catch(() => ({} as { error?: string })); throw new Error(e.error || "שגיאה בשמירה"); }
      setShowCreate(false); setEditId(null); setForm({});
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "שגיאה בשמירה"); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await authFetch(`/api/hr/payslips/${id}`, { method: "DELETE" });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "שגיאה במחיקה"); }
  };


  return (
    <div className="p-6 space-y-4" dir="rtl">
      {error && <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400"><AlertCircle className="h-4 w-4 flex-shrink-0" /><span className="text-sm">{error}</span><button onClick={() => setError(null)} className="mr-auto"><X className="h-4 w-4" /></button></div>}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Receipt className="h-6 w-6 text-blue-400" />
            תלושי שכר
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול תלושי שכר, חישוב ברוטו-נטו והפצה לעובדים</p>
        </div>
        <div className="flex gap-2">
          <ImportButton apiRoute="/api/hr/payslips" onSuccess={load} />
          <Button variant="outline" size="sm" className="border-border text-gray-300 gap-1"><FileSpreadsheet className="h-4 w-4" />ייצוא Excel</Button>
          <Button variant="outline" size="sm" className="border-border text-gray-300 gap-1"><Download className="h-4 w-4" />ייצוא PDF</Button>
          <Button variant="outline" size="sm" className="border-border text-gray-300 gap-1"><Printer className="h-4 w-4" />הדפסה</Button>
          <Button onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-700 gap-2"><Plus className="h-4 w-4" />תלוש חדש</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className="bg-card/80 border-border hover:border-border transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground">{k.label}</p>
                  <p className={`text-lg font-bold font-mono mt-1 ${k.color}`}>{k.value}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {k.trendUp ? <TrendingUp className="h-3 w-3 text-green-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}
                    <span className={`text-[10px] ${k.trendUp ? "text-green-400" : "text-red-400"}`}>{k.trend}</span>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-input flex items-center justify-center">
                  <k.icon className={`w-4 h-4 ${k.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search & Filters */}
      <Card className="bg-card/60 border-border">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="חיפוש לפי שם עובד, מזהה תלוש..." className="pr-9 bg-input border-border text-foreground" />
            </div>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל הסטטוסים</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל המחלקות</option>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={monthFilter} onChange={e => { setMonthFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל החודשים</option>
              {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            {activeFilters > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-red-400 hover:text-red-300 gap-1">
                <X className="h-3 w-3" />נקה הכל ({activeFilters})
              </Button>
            )}
          </div>
          {activeFilters > 0 && (
            <div className="flex gap-2 mt-2">
              {statusFilter !== "all" && <Badge variant="secondary" className="gap-1">{statusFilter}<X className="h-3 w-3 cursor-pointer" onClick={() => setStatusFilter("all")} /></Badge>}
              {deptFilter !== "all" && <Badge variant="secondary" className="gap-1">{deptFilter}<X className="h-3 w-3 cursor-pointer" onClick={() => setDeptFilter("all")} /></Badge>}
              {monthFilter !== "all" && <Badge variant="secondary" className="gap-1">{monthFilter}<X className="h-3 w-3 cursor-pointer" onClick={() => setMonthFilter("all")} /></Badge>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
          <span className="text-sm text-blue-300">{selected.size} תלושים נבחרו</span>
          <Button size="sm" variant="outline" className="border-blue-500/30 text-blue-300 gap-1"><Send className="h-3 w-3" />שלח תלושים</Button>
          <Button size="sm" variant="outline" className="border-blue-500/30 text-blue-300 gap-1"><CheckCircle2 className="h-3 w-3" />אשר</Button>
          <Button size="sm" variant="outline" className="border-blue-500/30 text-blue-300 gap-1"><Download className="h-3 w-3" />הורד PDF</Button>
          <Button size="sm" variant="outline" className="border-red-500/30 text-red-300 gap-1"><Trash2 className="h-3 w-3" />מחק</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="text-gray-400 mr-auto">בטל בחירה</Button>
        </div>
      )}

      {/* Data Table */}
      <Card className="bg-card/80 border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background/50">
                  <th className="p-3 w-10"><input type="checkbox" checked={allSelected} onChange={() => { if (allSelected) setSelected(new Set()); else setSelected(new Set(pageData.map(r => r.id))); }} className="rounded" /></th>
                  <th className="p-3 text-right text-muted-foreground font-medium">מזהה</th>
                  <th className="p-3 text-right text-muted-foreground font-medium cursor-pointer select-none" onClick={() => toggleSort("employee")}><div className="flex items-center gap-1">עובד<SortIcon field="employee" /></div></th>
                  <th className="p-3 text-right text-muted-foreground font-medium cursor-pointer select-none" onClick={() => toggleSort("department")}><div className="flex items-center gap-1">מחלקה<SortIcon field="department" /></div></th>
                  <th className="p-3 text-right text-muted-foreground font-medium cursor-pointer select-none" onClick={() => toggleSort("month")}><div className="flex items-center gap-1">חודש<SortIcon field="month" /></div></th>
                  <th className="p-3 text-right text-muted-foreground font-medium cursor-pointer select-none" onClick={() => toggleSort("gross")}><div className="flex items-center gap-1">ברוטו<SortIcon field="gross" /></div></th>
                  <th className="p-3 text-right text-muted-foreground font-medium">מס</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">ביטוח לאומי</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">פנסיה</th>
                  <th className="p-3 text-right text-muted-foreground font-medium cursor-pointer select-none" onClick={() => toggleSort("net")}><div className="flex items-center gap-1">נטו<SortIcon field="net" /></div></th>
                  <th className="p-3 text-right text-muted-foreground font-medium">שעות נוספות</th>
                  <th className="p-3 text-right text-muted-foreground font-medium cursor-pointer select-none" onClick={() => toggleSort("status")}><div className="flex items-center gap-1">סטטוס<SortIcon field="status" /></div></th>
                  <th className="p-3 text-center text-muted-foreground font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map(row => (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="p-3"><input type="checkbox" checked={selected.has(row.id)} onChange={() => { const s = new Set(selected); s.has(row.id) ? s.delete(row.id) : s.add(row.id); setSelected(s); }} className="rounded" /></td>
                    <td className="p-3 font-mono text-xs text-blue-400">{row.id}</td>
                    <td className="p-3">
                      <div className="font-medium text-foreground">{row.employee}</div>
                      <div className="text-xs text-muted-foreground">{row.employeeId}</div>
                    </td>
                    <td className="p-3 text-muted-foreground">{row.department}</td>
                    <td className="p-3 text-muted-foreground">{row.month}</td>
                    <td className="p-3 font-mono text-foreground">{fmt(row.gross)}</td>
                    <td className="p-3 font-mono text-red-400 text-xs">{fmt(row.tax)}</td>
                    <td className="p-3 font-mono text-orange-400 text-xs">{fmt(row.socialSecurity)}</td>
                    <td className="p-3 font-mono text-purple-400 text-xs">{fmt(row.pension)}</td>
                    <td className="p-3 font-mono font-bold text-emerald-400">{fmt(row.net)}</td>
                    <td className="p-3 text-center text-muted-foreground">{row.overtime}h</td>
                    <td className="p-3"><Badge className={`${STATUS_COLORS[row.status]} border-0 text-xs`}>{row.status}</Badge></td>
                    <td className="p-3 text-center">
                      <div className="relative inline-block">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setMenuOpen(menuOpen === row.id ? null : row.id)}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                        {menuOpen === row.id && (
                          <div className="absolute left-0 top-8 z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[160px]" onMouseLeave={() => setMenuOpen(null)}>
                            <button onClick={() => { setShowDetail(row.id); setMenuOpen(null); }} className="w-full px-3 py-2 text-right text-sm text-foreground hover:bg-muted flex items-center gap-2"><Eye className="h-4 w-4" />צפייה</button>
                            <button onClick={() => { setEditId(row.id); setShowCreate(true); setMenuOpen(null); }} className="w-full px-3 py-2 text-right text-sm text-foreground hover:bg-muted flex items-center gap-2"><Edit2 className="h-4 w-4" />עריכה</button>
                            <button onClick={async () => { const res = await duplicateRecord("/api/hr/payslips", row.id, { defaultStatus: "טיוטה" }); if (res.ok) { setMenuOpen(null); load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="w-full px-3 py-2 text-right text-sm text-foreground hover:bg-muted flex items-center gap-2"><Copy className="h-4 w-4" />שכפול</button>
                            <button className="w-full px-3 py-2 text-right text-sm text-foreground hover:bg-muted flex items-center gap-2"><Send className="h-4 w-4" />שלח לעובד</button>
                            <button className="w-full px-3 py-2 text-right text-sm text-foreground hover:bg-muted flex items-center gap-2"><Download className="h-4 w-4" />הורד PDF</button>
                            <hr className="border-border my-1" />
                            {isSuperAdmin && <button onClick={async () => { if (await globalConfirm(`למחוק תלוש?`)) { await authFetch(`/api/hr/payslips/${row.id}`, { method: "DELETE" }); setMenuOpen(null); load(); } }} className="w-full px-3 py-2 text-right text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"><Trash2 className="h-4 w-4" />מחיקה</button>}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          <div className="flex items-center justify-between p-3 border-t border-border">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>מציג {((page - 1) * perPage) + 1}-{Math.min(page * perPage, filtered.length)} מתוך {filtered.length} תוצאות</span>
              <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }} className="bg-input border border-border rounded px-2 py-1 text-xs text-foreground">
                {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} שורות</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-8 w-8 p-0"><ChevronRight className="h-4 w-4" /></Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = page <= 3 ? i + 1 : page + i - 2;
                if (p > totalPages || p < 1) return null;
                return <Button key={p} variant={p === page ? "default" : "ghost"} size="sm" onClick={() => setPage(p)} className={`h-8 w-8 p-0 ${p === page ? "bg-blue-600" : ""}`}>{p}</Button>;
              })}
              <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="h-8 w-8 p-0"><ChevronLeft className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => { setShowCreate(false); setEditId(null); }}>
          <div className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground">{editId ? "עריכת תלוש שכר" : "תלוש שכר חדש"}</h2>
              <Button variant="ghost" size="sm" onClick={() => { setShowCreate(false); setEditId(null); }}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-6">
              <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">פרטי עובד</h3></div>
              <div className="grid grid-cols-3 gap-4">
                <div><Label className="text-muted-foreground text-xs">עובד *</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1"><option>בחר עובד...</option>{[...new Map(data.filter(r => r.employeeId).map(r => [r.employeeId, r] as [string, Payslip])).values()].map(r => <option key={r.employeeId}>{r.employee} ({r.employeeId})</option>)}</select></div>
                <div><Label className="text-muted-foreground text-xs">מחלקה *</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1"><option>בחר מחלקה...</option>{DEPARTMENTS.map(d => <option key={d}>{d}</option>)}</select></div>
                <div><Label className="text-muted-foreground text-xs">חודש שכר *</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1"><option>בחר חודש...</option>{MONTHS.map(m => <option key={m}>{m}</option>)}</select></div>
              </div>

              <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">הכנסות</h3></div>
              <div className="grid grid-cols-3 gap-4">
                <div><Label className="text-muted-foreground text-xs">שכר בסיס (ברוטו) *</Label><Input type="number" placeholder="0.00" className="bg-input border-border text-foreground mt-1" /></div>
                <div><Label className="text-muted-foreground text-xs">שעות נוספות</Label><Input type="number" placeholder="0" className="bg-input border-border text-foreground mt-1" /></div>
                <div><Label className="text-muted-foreground text-xs">תשלום שעות נוספות</Label><Input type="number" placeholder="0.00" className="bg-input border-border text-foreground mt-1" /></div>
                <div><Label className="text-muted-foreground text-xs">בונוס</Label><Input type="number" placeholder="0.00" className="bg-input border-border text-foreground mt-1" /></div>
                <div><Label className="text-muted-foreground text-xs">קצובת נסיעות</Label><Input type="number" placeholder="0.00" className="bg-input border-border text-foreground mt-1" /></div>
                <div><Label className="text-muted-foreground text-xs">קצובת ארוחות</Label><Input type="number" placeholder="0.00" className="bg-input border-border text-foreground mt-1" /></div>
              </div>

              <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">ניכויים</h3></div>
              <div className="grid grid-cols-3 gap-4">
                <div><Label className="text-muted-foreground text-xs">מס הכנסה</Label><Input type="number" placeholder="0.00" className="bg-input border-border text-foreground mt-1" /></div>
                <div><Label className="text-muted-foreground text-xs">ביטוח לאומי</Label><Input type="number" placeholder="0.00" className="bg-input border-border text-foreground mt-1" /></div>
                <div><Label className="text-muted-foreground text-xs">ביטוח בריאות</Label><Input type="number" placeholder="0.00" className="bg-input border-border text-foreground mt-1" /></div>
                <div><Label className="text-muted-foreground text-xs">פנסיה עובד</Label><Input type="number" placeholder="0.00" className="bg-input border-border text-foreground mt-1" /></div>
                <div><Label className="text-muted-foreground text-xs">קרן השתלמות</Label><Input type="number" placeholder="0.00" className="bg-input border-border text-foreground mt-1" /></div>
                <div><Label className="text-muted-foreground text-xs">ניכויים אחרים</Label><Input type="number" placeholder="0.00" className="bg-input border-border text-foreground mt-1" /></div>
              </div>

              <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">תשלום</h3></div>
              <div className="grid grid-cols-3 gap-4">
                <div><Label className="text-muted-foreground text-xs">תאריך תשלום *</Label><Input type="date" className="bg-input border-border text-foreground mt-1" /></div>
                <div><Label className="text-muted-foreground text-xs">חשבון בנק</Label><Input placeholder="בנק-סניף-חשבון" className="bg-input border-border text-foreground mt-1" /></div>
                <div><Label className="text-muted-foreground text-xs">סטטוס</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">{STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
              </div>
              <div><Label className="text-muted-foreground text-xs">הערות</Label><textarea rows={3} placeholder="הערות נוספות..." className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" /></div>
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-border justify-end">
              <Button variant="outline" onClick={() => { setShowCreate(false); setEditId(null); }} className="border-border">ביטול</Button>
              <Button variant="outline" className="border-blue-500/30 text-blue-300">שמור והמשך</Button>
              <Button className="bg-blue-600 hover:bg-blue-700 gap-1"><Save className="h-4 w-4" />{editId ? "עדכן" : "שמור"}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Detail View Modal */}
      {detailRecord && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowDetail(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-foreground">תלוש שכר — {detailRecord.id}</h2>
                <Badge className={`${STATUS_COLORS[detailRecord.status]} border-0`}>{detailRecord.status}</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowDetail(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-blue-400 border-b border-border pb-2">פרטי עובד</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-muted-foreground">שם:</span><span className="text-foreground mr-2">{detailRecord.employee}</span></div>
                    <div><span className="text-muted-foreground">מזהה:</span><span className="text-foreground mr-2">{detailRecord.employeeId}</span></div>
                    <div><span className="text-muted-foreground">מחלקה:</span><span className="text-foreground mr-2">{detailRecord.department}</span></div>
                    <div><span className="text-muted-foreground">חודש:</span><span className="text-foreground mr-2">{detailRecord.month}</span></div>
                    <div><span className="text-muted-foreground">חשבון בנק:</span><span className="text-foreground mr-2 font-mono text-xs">{detailRecord.bankAccount}</span></div>
                    <div><span className="text-muted-foreground">תאריך תשלום:</span><span className="text-foreground mr-2">{fmtDate(detailRecord.payDate)}</span></div>
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-emerald-400 border-b border-border pb-2">סיכום כספי</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">שכר בסיס (ברוטו)</span><span className="font-mono text-foreground">{fmt(detailRecord.gross)}</span></div>
                    {detailRecord.bonus > 0 && <div className="flex justify-between"><span className="text-muted-foreground">בונוס</span><span className="font-mono text-green-400">+{fmt(detailRecord.bonus)}</span></div>}
                    <div className="flex justify-between"><span className="text-muted-foreground">שעות נוספות ({detailRecord.overtime}h)</span><span className="font-mono text-green-400">+{fmt(detailRecord.overtimePay)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">קצובת נסיעות</span><span className="font-mono text-green-400">+{fmt(detailRecord.travelAllowance)}</span></div>
                    <hr className="border-border" />
                    <div className="flex justify-between"><span className="text-muted-foreground">מס הכנסה</span><span className="font-mono text-red-400">-{fmt(detailRecord.tax)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">ביטוח לאומי</span><span className="font-mono text-red-400">-{fmt(detailRecord.socialSecurity)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">פנסיה</span><span className="font-mono text-red-400">-{fmt(detailRecord.pension)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">ביטוח בריאות</span><span className="font-mono text-red-400">-{fmt(detailRecord.healthInsurance)}</span></div>
                    <hr className="border-border" />
                    <div className="flex justify-between font-bold"><span className="text-foreground">נטו לתשלום</span><span className="font-mono text-emerald-400 text-lg">{fmt(detailRecord.net)}</span></div>
                  </div>
                </div>
              </div>
              {detailRecord.notes && <div className="bg-input rounded-lg p-3"><p className="text-xs text-muted-foreground">הערות</p><p className="text-sm text-foreground mt-1">{detailRecord.notes}</p></div>}

              <h3 className="text-sm font-semibold text-blue-400 border-b border-border pb-2">היסטוריית פעולות</h3>
              <div className="space-y-2">
                {[
                  { time: "14:32", date: fmtDate(detailRecord.createdAt), action: "תלוש נוצר", user: "מערכת" },
                  { time: "15:10", date: fmtDate(detailRecord.createdAt), action: "נשלח לאישור מנהל", user: "חשבות שכר" },
                  { time: "09:45", date: fmtDate(detailRecord.payDate), action: "אושר ע\"י מנהל כספים", user: "דוד כהן" },
                ].map((a, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm p-2 rounded bg-background/50">
                    <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground text-xs min-w-[60px]">{a.time}</span>
                    <span className="text-muted-foreground text-xs min-w-[80px]">{a.date}</span>
                    <span className="text-foreground">{a.action}</span>
                    <span className="text-muted-foreground mr-auto">{a.user}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-border justify-end">
              <Button variant="outline" className="border-border gap-1"><Printer className="h-4 w-4" />הדפסה</Button>
              <Button variant="outline" className="border-border gap-1"><Download className="h-4 w-4" />הורד PDF</Button>
              <Button variant="outline" className="border-border gap-1"><Send className="h-4 w-4" />שלח לעובד</Button>
              <Button onClick={() => { setEditId(detailRecord.id); setShowDetail(null); setShowCreate(true); }} className="bg-blue-600 hover:bg-blue-700 gap-1"><Edit2 className="h-4 w-4" />ערוך</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
