import { useState, useMemo, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import {
  DollarSign, Percent, Target, TrendingUp, Plus, Edit, Trash2, Search,
  BarChart3, Users, Award, Calculator, Play, CheckCircle, Clock, XCircle,
  ArrowUpDown, Loader2, X, Eye, FileText, Zap, CreditCard, ChevronDown
} from "lucide-react";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const getHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("erp_token") || ""}` });
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);
const pct = (n: number) => `${n.toFixed(1)}%`;

type CommissionPlan = {
  id: number;
  name: string;
  type: "flat" | "tiered" | "quota" | "split";
  baseRate: number;
  quota: number;
  cap: number;
  status: "active" | "draft" | "archived";
  description: string;
  salespeople: number;
  createdAt: string;
};

type CommissionRecord = {
  id: number;
  salesperson: string;
  period: string;
  planName: string;
  salesAmount: number;
  commissionAmount: number;
  quotaAttainment: number;
  status: "calculated" | "approved" | "paid" | "disputed";
  paidDate: string | null;
};

const PLAN_TYPE_MAP: Record<string, { label: string; color: string }> = {
  flat: { label: "אחיד", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  tiered: { label: "מדורג", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  quota: { label: "מכסה", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  split: { label: "מפוצל", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
};

const PLAN_STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  draft: { label: "טיוטה", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  archived: { label: "ארכיון", color: "bg-muted/20 text-muted-foreground border-gray-500/30" },
};

const RECORD_STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  calculated: { label: "חושב", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Calculator },
  approved: { label: "אושר", color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: CheckCircle },
  paid: { label: "שולם", color: "bg-green-500/20 text-green-400 border-green-500/30", icon: CreditCard },
  disputed: { label: "מערער", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: XCircle },
};

const INITIAL_PLANS: CommissionPlan[] = [
  { id: 1, name: "תוכנית מכירות בסיסית", type: "flat", baseRate: 5, quota: 100000, cap: 15000, status: "active", description: "עמלה אחידה 5% על כל מכירה", salespeople: 12, createdAt: "2025-01-01" },
  { id: 2, name: "תוכנית מדורגת בכירים", type: "tiered", baseRate: 3, quota: 250000, cap: 50000, status: "active", description: "3-8% לפי רמת מכירות", salespeople: 5, createdAt: "2025-01-01" },
  { id: 3, name: "תוכנית מכסה חודשית", type: "quota", baseRate: 7, quota: 150000, cap: 25000, status: "active", description: "7% אחרי השגת מכסה", salespeople: 8, createdAt: "2025-03-01" },
  { id: 4, name: "תוכנית מפוצלת צוותית", type: "split", baseRate: 4, quota: 200000, cap: 20000, status: "active", description: "חלוקת עמלה בין חברי צוות", salespeople: 6, createdAt: "2025-06-01" },
  { id: 5, name: "תוכנית Q1 2026", type: "tiered", baseRate: 4, quota: 300000, cap: 60000, status: "draft", description: "תוכנית חדשה לרבעון ראשון", salespeople: 0, createdAt: "2026-01-15" },
  { id: 6, name: "תוכנית ישנה 2024", type: "flat", baseRate: 6, quota: 80000, cap: 12000, status: "archived", description: "תוכנית שנת 2024 — לא פעילה", salespeople: 0, createdAt: "2024-01-01" },
];

const INITIAL_RECORDS: CommissionRecord[] = [
  { id: 1, salesperson: "יוסי כהן", period: "2026-03", planName: "תוכנית מכירות בסיסית", salesAmount: 185000, commissionAmount: 9250, quotaAttainment: 185.0, status: "calculated", paidDate: null },
  { id: 2, salesperson: "שרה לוי", period: "2026-03", planName: "תוכנית מדורגת בכירים", salesAmount: 312000, commissionAmount: 21840, quotaAttainment: 124.8, status: "approved", paidDate: null },
  { id: 3, salesperson: "דוד מזרחי", period: "2026-03", planName: "תוכנית מכסה חודשית", salesAmount: 165000, commissionAmount: 11550, quotaAttainment: 110.0, status: "calculated", paidDate: null },
  { id: 4, salesperson: "רחל אברהם", period: "2026-03", planName: "תוכנית מכירות בסיסית", salesAmount: 92000, commissionAmount: 4600, quotaAttainment: 92.0, status: "calculated", paidDate: null },
  { id: 5, salesperson: "אלון גולדשטיין", period: "2026-02", planName: "תוכנית מדורגת בכירים", salesAmount: 278000, commissionAmount: 16680, quotaAttainment: 111.2, status: "paid", paidDate: "2026-03-10" },
  { id: 6, salesperson: "מיכל דהן", period: "2026-02", planName: "תוכנית מכסה חודשית", salesAmount: 140000, commissionAmount: 9800, quotaAttainment: 93.3, status: "paid", paidDate: "2026-03-10" },
  { id: 7, salesperson: "עומר ביטון", period: "2026-02", planName: "תוכנית מפוצלת צוותית", salesAmount: 210000, commissionAmount: 8400, quotaAttainment: 105.0, status: "paid", paidDate: "2026-03-10" },
  { id: 8, salesperson: "יוסי כהן", period: "2026-02", planName: "תוכנית מכירות בסיסית", salesAmount: 145000, commissionAmount: 7250, quotaAttainment: 145.0, status: "paid", paidDate: "2026-03-10" },
  { id: 9, salesperson: "נועם פרידמן", period: "2026-03", planName: "תוכנית מכירות בסיסית", salesAmount: 55000, commissionAmount: 2750, quotaAttainment: 55.0, status: "disputed", paidDate: null },
];

export default function CommissionManagement() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [activeTab, setActiveTab] = useState<"plans" | "records">("plans");
  const [plans, setPlans] = useState<CommissionPlan[]>([]);
  const [records, setRecords] = useState<CommissionRecord[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPeriod, setFilterPeriod] = useState("");
  const [filterRecStatus, setFilterRecStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CommissionPlan | null>(null);
  const [form, setForm] = useState<any>({});
  const [tableLoading, setTableLoading] = useState(true);
  const [runningCalc, setRunningCalc] = useState(false);
  const [sortField, setSortField] = useState<string>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const validation = useFormValidation({ name: { required: true }, type: { required: true } });

  const load = useCallback(() => {
    setTableLoading(true);
    Promise.all([
      authFetch(`${API}/crm-sap/commission-plans`, { headers: getHeaders() }).then(r => r.json()).then(d => setPlans(Array.isArray(d) ? d : INITIAL_PLANS)).catch(() => setPlans(INITIAL_PLANS)),
      authFetch(`${API}/crm-sap/commission-records`, { headers: getHeaders() }).then(r => r.json()).then(d => setRecords(Array.isArray(d) ? d : INITIAL_RECORDS)).catch(() => setRecords(INITIAL_RECORDS)),
    ]).finally(() => setTableLoading(false));
  }, []);
  useEffect(load, [load]);

  const planStats = useMemo(() => ({
    totalPlans: plans.length,
    activePlans: plans.filter(p => p.status === "active").length,
    totalSalespeople: plans.reduce((s, p) => s + p.salespeople, 0),
    totalQuota: plans.filter(p => p.status === "active").reduce((s, p) => s + p.quota, 0),
  }), [plans]);

  const recStats = useMemo(() => ({
    totalRecords: records.length,
    totalSales: records.reduce((s, r) => s + r.salesAmount, 0),
    totalCommission: records.reduce((s, r) => s + r.commissionAmount, 0),
    avgAttainment: records.length ? records.reduce((s, r) => s + r.quotaAttainment, 0) / records.length : 0,
    pendingApproval: records.filter(r => r.status === "calculated").length,
    totalPaid: records.filter(r => r.status === "paid").reduce((s, r) => s + r.commissionAmount, 0),
  }), [records]);

  const filteredPlans = useMemo(() => {
    let f = plans.filter(r => {
      if (search && !`${r.name} ${r.description}`.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterType && r.type !== filterType) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      return true;
    });
    return f;
  }, [plans, search, filterType, filterStatus]);

  const filteredRecords = useMemo(() => {
    let f = records.filter(r => {
      if (search && !`${r.salesperson} ${r.planName}`.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterPeriod && r.period !== filterPeriod) return false;
      if (filterRecStatus && r.status !== filterRecStatus) return false;
      return true;
    });
    f.sort((a: any, b: any) => {
      const va = a[sortField], vb = b[sortField];
      const cmp = typeof va === "number" ? va - vb : String(va || "").localeCompare(String(vb || ""), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return f;
  }, [records, search, filterPeriod, filterRecStatus, sortField, sortDir]);

  const periods = useMemo(() => [...new Set(records.map(r => r.period))].sort().reverse(), [records]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", type: "flat", baseRate: 5, quota: 100000, cap: 15000, status: "draft", description: "" });
    validation.reset();
    setShowForm(true);
  };
  const openEdit = (p: CommissionPlan) => {
    setEditing(p);
    setForm({ name: p.name, type: p.type, baseRate: p.baseRate, quota: p.quota, cap: p.cap, status: p.status, description: p.description });
    validation.reset();
    setShowForm(true);
  };

  const save = async () => {
    if (!validation.validateAll(form)) return;
    try {
      const url = editing ? `${API}/crm-sap/commission-plans/${editing.id}` : `${API}/crm-sap/commission-plans`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: getHeaders(), body: JSON.stringify(form) });
      setShowForm(false);
      load();
    } catch {
      if (editing) {
        setPlans(prev => prev.map(p => p.id === editing.id ? { ...p, ...form } : p));
      } else {
        setPlans(prev => [...prev, { id: Date.now(), ...form, salespeople: 0, createdAt: new Date().toISOString().slice(0, 10) }]);
      }
      setShowForm(false);
    }
  };

  const removePlan = async (id: number) => {
    if (!(await globalConfirm("האם למחוק את תוכנית העמלות?"))) return;
    try { await authFetch(`${API}/crm-sap/commission-plans/${id}`, { method: "DELETE", headers: getHeaders() }); } catch {}
    setPlans(prev => prev.filter(p => p.id !== id));
  };

  const runCommission = async () => {
    setRunningCalc(true);
    try {
      await authFetch(`${API}/crm-sap/commission-records/calculate`, { method: "POST", headers: getHeaders(), body: JSON.stringify({ period: "2026-03" }) });
      load();
    } catch {
      // demo - just update status
    }
    setTimeout(() => setRunningCalc(false), 1500);
  };

  const approveRecord = async (id: number) => {
    try { await authFetch(`${API}/crm-sap/commission-records/${id}/approve`, { method: "POST", headers: getHeaders() }); } catch {}
    setRecords(prev => prev.map(r => r.id === id ? { ...r, status: "approved" } : r));
  };

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };
  const SortIcon = ({ field }: { field: string }) => (
    <ArrowUpDown className={`inline w-3 h-3 mr-1 cursor-pointer ${sortField === field ? "text-primary" : "text-muted-foreground"}`} />
  );

  const attColor = (v: number) => v >= 100 ? "text-green-400" : v >= 80 ? "text-blue-400" : v >= 60 ? "text-amber-400" : "text-red-400";

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><DollarSign className="w-7 h-7 text-primary" /> ניהול עמלות</h1>
          <p className="text-muted-foreground mt-1">תוכניות עמלות, חישוב ומעקב תשלומים</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={runCommission} disabled={runningCalc} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-foreground rounded-lg hover:bg-amber-700 transition disabled:opacity-50">
            {runningCalc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} הרצת חישוב עמלות
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition">
            <Plus className="w-4 h-4" /> תוכנית חדשה
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {[
          { label: "תוכניות פעילות", value: `${planStats.activePlans}/${planStats.totalPlans}`, icon: FileText, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "נציגי מכירות", value: fmt(planStats.totalSalespeople), icon: Users, color: "text-purple-400", bg: "bg-purple-500/10" },
          { label: "סה\"כ מכירות", value: fmtC(recStats.totalSales), icon: TrendingUp, color: "text-cyan-400", bg: "bg-cyan-500/10" },
          { label: "סה\"כ עמלות", value: fmtC(recStats.totalCommission), icon: DollarSign, color: "text-green-400", bg: "bg-green-500/10" },
          { label: "ממוצע השגת יעד", value: pct(recStats.avgAttainment), icon: Target, color: recStats.avgAttainment >= 80 ? "text-green-400" : "text-amber-400", bg: recStats.avgAttainment >= 80 ? "bg-green-500/10" : "bg-amber-500/10" },
          { label: "ממתינים לאישור", value: fmt(recStats.pendingApproval), icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
        ].map((c, i) => (
          <div key={i} className={`rounded-xl border border-border/50 p-4 ${c.bg}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">{c.label}</span>
              <c.icon className={`w-5 h-5 ${c.color}`} />
            </div>
            <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([["plans", "תוכניות עמלות", FileText], ["records", "רשומות עמלות", BarChart3]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => { setActiveTab(key); setSearch(""); setFilterType(""); setFilterStatus(""); setFilterPeriod(""); setFilterRecStatus(""); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${activeTab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={activeTab === "plans" ? "חיפוש תוכנית..." : "חיפוש איש מכירות..."} className="w-full pr-10 pl-4 py-2 rounded-lg border border-border bg-card text-sm" />
        </div>
        {activeTab === "plans" ? (
          <>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-sm">
              <option value="">כל הסוגים</option>
              {Object.entries(PLAN_TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-sm">
              <option value="">כל הסטטוסים</option>
              {Object.entries(PLAN_STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </>
        ) : (
          <>
            <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-sm">
              <option value="">כל התקופות</option>
              {periods.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={filterRecStatus} onChange={e => setFilterRecStatus(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-sm">
              <option value="">כל הסטטוסים</option>
              {Object.entries(RECORD_STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </>
        )}
      </div>

      {/* Plans Table */}
      {activeTab === "plans" && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  <th className="p-3 text-right font-medium">שם תוכנית</th>
                  <th className="p-3 text-center font-medium">סוג</th>
                  <th className="p-3 text-center font-medium">שיעור בסיסי</th>
                  <th className="p-3 text-right font-medium">מכסה</th>
                  <th className="p-3 text-right font-medium">תקרה</th>
                  <th className="p-3 text-center font-medium">נציגים</th>
                  <th className="p-3 text-center font-medium">סטטוס</th>
                  <th className="p-3 text-center font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {tableLoading ? (
                  <tr><td colSpan={8} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td></tr>
                ) : filteredPlans.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">לא נמצאו תוכניות</td></tr>
                ) : filteredPlans.map(p => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20 transition">
                    <td className="p-3">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.description}</div>
                    </td>
                    <td className="p-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs border ${PLAN_TYPE_MAP[p.type]?.color}`}>{PLAN_TYPE_MAP[p.type]?.label}</span></td>
                    <td className="p-3 text-center font-mono">{p.baseRate}%</td>
                    <td className="p-3 font-mono text-xs">{fmtC(p.quota)}</td>
                    <td className="p-3 font-mono text-xs">{fmtC(p.cap)}</td>
                    <td className="p-3 text-center">{p.salespeople}</td>
                    <td className="p-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs border ${PLAN_STATUS_MAP[p.status]?.color}`}>{PLAN_STATUS_MAP[p.status]?.label}</span></td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-muted/30" title="עריכה"><Edit className="w-4 h-4" /></button>
                        <button onClick={() => removePlan(p.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400" title="מחיקה"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-border text-xs text-muted-foreground">מציג {filteredPlans.length} תוכניות</div>
        </div>
      )}

      {/* Records Table */}
      {activeTab === "records" && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  <th className="p-3 text-right font-medium cursor-pointer" onClick={() => toggleSort("salesperson")}>איש מכירות <SortIcon field="salesperson" /></th>
                  <th className="p-3 text-center font-medium cursor-pointer" onClick={() => toggleSort("period")}>תקופה <SortIcon field="period" /></th>
                  <th className="p-3 text-right font-medium">תוכנית</th>
                  <th className="p-3 text-right font-medium cursor-pointer" onClick={() => toggleSort("salesAmount")}>סכום מכירות <SortIcon field="salesAmount" /></th>
                  <th className="p-3 text-right font-medium cursor-pointer" onClick={() => toggleSort("commissionAmount")}>סכום עמלה <SortIcon field="commissionAmount" /></th>
                  <th className="p-3 text-center font-medium cursor-pointer" onClick={() => toggleSort("quotaAttainment")}>% השגת מכסה <SortIcon field="quotaAttainment" /></th>
                  <th className="p-3 text-center font-medium">סטטוס</th>
                  <th className="p-3 text-center font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {tableLoading ? (
                  <tr><td colSpan={8} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td></tr>
                ) : filteredRecords.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">לא נמצאו רשומות</td></tr>
                ) : filteredRecords.map(r => {
                  const st = RECORD_STATUS_MAP[r.status];
                  const StIcon = st?.icon || Clock;
                  return (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20 transition">
                      <td className="p-3 font-medium">{r.salesperson}</td>
                      <td className="p-3 text-center font-mono text-xs">{r.period}</td>
                      <td className="p-3 text-xs">{r.planName}</td>
                      <td className="p-3 font-mono text-xs">{fmtC(r.salesAmount)}</td>
                      <td className="p-3 font-mono text-xs font-bold text-green-400">{fmtC(r.commissionAmount)}</td>
                      <td className="p-3 text-center">
                        <span className={`font-bold ${attColor(r.quotaAttainment)}`}>{pct(r.quotaAttainment)}</span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${st?.color}`}>
                          <StIcon className="w-3 h-3" />{st?.label}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {r.status === "calculated" && (
                          <button onClick={() => approveRecord(r.id)} className="px-2 py-1 text-xs rounded bg-green-600/20 text-green-400 hover:bg-green-600/30 transition">אישור</button>
                        )}
                        {r.status === "paid" && r.paidDate && (
                          <span className="text-xs text-muted-foreground">שולם {r.paidDate}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
            <span>מציג {filteredRecords.length} רשומות</span>
            <span>סה"כ עמלות: <span className="text-green-400 font-bold">{fmtC(filteredRecords.reduce((s, r) => s + r.commissionAmount, 0))}</span></span>
          </div>
        </div>
      )}

      {/* Plan Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card rounded-2xl border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{editing ? "עריכת תוכנית עמלות" : "תוכנית עמלות חדשה"}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-muted/30"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-sm font-medium">שם תוכנית <RequiredMark /></label>
                <input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                <FormFieldError error={validation.errors.name} />
              </div>
              <div>
                <label className="text-sm font-medium">סוג <RequiredMark /></label>
                <select value={form.type || "flat"} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm">
                  {Object.entries(PLAN_TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <FormFieldError error={validation.errors.type} />
              </div>
              <div>
                <label className="text-sm font-medium">סטטוס</label>
                <select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm">
                  {Object.entries(PLAN_STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">שיעור בסיסי (%)</label>
                <input type="number" min={0} max={100} step={0.5} value={form.baseRate || 0} onChange={e => setForm({ ...form, baseRate: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">מכסה (₪)</label>
                <input type="number" min={0} value={form.quota || 0} onChange={e => setForm({ ...form, quota: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium">תקרת עמלה (₪)</label>
                <input type="number" min={0} value={form.cap || 0} onChange={e => setForm({ ...form, cap: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium">תיאור</label>
                <textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted/30 transition">ביטול</button>
              <button onClick={save} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition">{editing ? "עדכון" : "יצירה"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
