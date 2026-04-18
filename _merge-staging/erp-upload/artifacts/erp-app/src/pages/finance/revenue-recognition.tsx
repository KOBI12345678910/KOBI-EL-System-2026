import { useState, useEffect, useMemo, useCallback } from "react";
import {
  TrendingUp, Search, Plus, Edit2, Trash2, X, Save, Eye, Calendar,
  FileText, DollarSign, Hash, Clock, Target, CheckCircle2, AlertTriangle,
  ArrowUpDown, RefreshCw, BarChart3, Calculator, BookOpen, ChevronDown,
  Building2, Milestone, Timer, PieChart, Activity, Layers
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, LineChart, Line, PieChart as RechartsPie, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";

// ---------------------------------------------------------------------------
//  Constants & Helpers
// ---------------------------------------------------------------------------
const API = "/api/revenue-recognition";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtCurrency = (v: any) =>
  Number(v || 0).toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
const fmtPct = (v: any) => `${Number(v || 0).toFixed(1)}%`;
const fmtDate = (v: any) => v ? new Date(v).toLocaleDateString("he-IL") : "—";

const COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#ef4444", "#a855f7", "#f97316", "#14b8a6"];

const statusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-gray-500/20 text-gray-400" },
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  completed: { label: "הושלם", color: "bg-blue-500/20 text-blue-400" },
  cancelled: { label: "בוטל", color: "bg-red-500/20 text-red-400" },
  suspended: { label: "מושהה", color: "bg-yellow-500/20 text-yellow-400" },
  pending_approval: { label: "ממתין לאישור", color: "bg-orange-500/20 text-orange-400" },
};

const methodMap: Record<string, { label: string; icon: any }> = {
  over_time: { label: "לאורך זמן", icon: Timer },
  point_in_time: { label: "נקודת זמן", icon: Target },
  milestone: { label: "אבני דרך", icon: Milestone },
};

const obligationStatusMap: Record<string, { label: string; color: string }> = {
  pending: { label: "ממתין", color: "bg-yellow-500/20 text-yellow-400" },
  in_progress: { label: "בביצוע", color: "bg-blue-500/20 text-blue-400" },
  completed: { label: "הושלם", color: "bg-green-500/20 text-green-400" },
  cancelled: { label: "בוטל", color: "bg-red-500/20 text-red-400" },
};

const scheduleStatusMap: Record<string, { label: string; color: string }> = {
  scheduled: { label: "מתוזמן", color: "bg-yellow-500/20 text-yellow-400" },
  recognized: { label: "הוכר", color: "bg-green-500/20 text-green-400" },
  deferred: { label: "נדחה", color: "bg-orange-500/20 text-orange-400" },
  reversed: { label: "בוטל", color: "bg-red-500/20 text-red-400" },
};

const jeStatusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-gray-500/20 text-gray-400" },
  posted: { label: "נרשם", color: "bg-green-500/20 text-green-400" },
  reversed: { label: "בוטל", color: "bg-red-500/20 text-red-400" },
};

const monthNames = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

// ---------------------------------------------------------------------------
//  Interfaces
// ---------------------------------------------------------------------------
interface Contract {
  id: number;
  contract_number: string;
  customer_id: string;
  customer_name: string;
  contract_name: string;
  description: string;
  contract_value: number;
  currency: string;
  start_date: string;
  end_date: string;
  signing_date: string;
  recognition_method: string;
  status: string;
  recognized_amount: number;
  deferred_amount: number;
  unbilled_amount: number;
  billed_amount: number;
  cost_center: string;
  project_id: string;
  department: string;
  account_manager: string;
  notes: string;
  tags: string;
  obligation_count: number;
  schedule_count: number;
  journal_count: number;
  created_at: string;
}

interface Obligation {
  id: number;
  contract_id: number;
  obligation_number: string;
  description: string;
  obligation_type: string;
  standalone_price: number;
  allocated_price: number;
  recognized_amount: number;
  recognition_method: string;
  satisfaction_method: string;
  progress_measure: string;
  progress_pct: number;
  start_date: string;
  end_date: string;
  milestone_name: string;
  milestone_criteria: string;
  is_distinct: boolean;
  is_series: boolean;
  status: string;
  cost_to_complete: number;
  cost_incurred: number;
  notes: string;
  contract_number?: string;
  contract_name?: string;
  customer_name?: string;
}

interface Schedule {
  id: number;
  contract_id: number;
  obligation_id: number;
  schedule_number: string;
  period_start: string;
  period_end: string;
  fiscal_year: number;
  fiscal_month: number;
  fiscal_quarter: number;
  scheduled_amount: number;
  recognized_amount: number;
  cumulative_recognized: number;
  deferred_amount: number;
  status: string;
  is_posted: boolean;
  contract_number?: string;
  contract_name?: string;
  customer_name?: string;
  obligation_description?: string;
}

interface JournalEntry {
  id: number;
  entry_number: string;
  contract_id: number;
  entry_date: string;
  fiscal_year: number;
  fiscal_month: number;
  description: string;
  debit_account: string;
  debit_account_name: string;
  credit_account: string;
  credit_account_name: string;
  amount: number;
  entry_type: string;
  status: string;
  contract_number?: string;
  customer_name?: string;
}

interface DashboardData {
  summary: any;
  monthly_trend: any[];
  quarterly_summary: any[];
  by_method: any[];
  top_customers: any[];
  upcoming_recognitions: any[];
  recent_journal_entries: any[];
  expiring_contracts: any[];
}

// ---------------------------------------------------------------------------
//  Sub-components
// ---------------------------------------------------------------------------
function KpiCard({ title, value, subtitle, icon: Icon, color = "indigo" }: any) {
  const colorMap: Record<string, string> = {
    indigo: "from-indigo-500/20 to-indigo-600/10 border-indigo-500/30",
    green: "from-green-500/20 to-green-600/10 border-green-500/30",
    amber: "from-amber-500/20 to-amber-600/10 border-amber-500/30",
    cyan: "from-cyan-500/20 to-cyan-600/10 border-cyan-500/30",
    red: "from-red-500/20 to-red-600/10 border-red-500/30",
    purple: "from-purple-500/20 to-purple-600/10 border-purple-500/30",
  };
  return (
    <div className={`bg-gradient-to-br ${colorMap[color] || colorMap.indigo} border rounded-xl p-4`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{title}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {subtitle && <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>}
    </div>
  );
}

function StatusBadge({ status, map }: { status: string; map: Record<string, { label: string; color: string }> }) {
  const s = map[status] || { label: status, color: "bg-gray-500/20 text-gray-400" };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>{s.label}</span>;
}

function MethodBadge({ method }: { method: string }) {
  const m = methodMap[method] || { label: method, icon: Clock };
  const Icon = m.icon;
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="h-3 w-3" /> {m.label}
    </span>
  );
}

function ProgressBar({ value, max, className = "" }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className={`h-2 bg-white/10 rounded-full overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-green-500" : pct >= 70 ? "bg-blue-500" : "bg-indigo-500"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function SortHeader({ label, field, sortField, sortDir, onClick }: any) {
  return (
    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-white select-none"
      onClick={() => onClick(field)}>
      <span className="flex items-center gap-1">
        {label}
        {sortField === field && <ArrowUpDown className="h-3 w-3" />}
      </span>
    </th>
  );
}

// ---------------------------------------------------------------------------
//  Main Page Component
// ---------------------------------------------------------------------------
export default function RevenueRecognitionPage() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "contracts" | "obligations" | "schedules" | "journal">("dashboard");
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterMethod, setFilterMethod] = useState("all");
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Contract | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  // Obligation form
  const [showObForm, setShowObForm] = useState(false);
  const [editingOb, setEditingOb] = useState<Obligation | null>(null);
  const [obForm, setObForm] = useState<any>({});

  // Detail view
  const [viewContract, setViewContract] = useState<any>(null);

  // Calculating
  const [calculating, setCalculating] = useState(false);

  // ------- Data Loading -------
  const loadContracts = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/contracts`);
      if (res.ok) setContracts(safeArray(await res.json()));
    } catch {}
  }, []);

  const loadObligations = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/performance-obligations`);
      if (res.ok) setObligations(safeArray(await res.json()));
    } catch {}
  }, []);

  const loadSchedules = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/schedules`);
      if (res.ok) setSchedules(safeArray(await res.json()));
    } catch {}
  }, []);

  const loadJournalEntries = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/journal-entries`);
      if (res.ok) setJournalEntries(safeArray(await res.json()));
    } catch {}
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/dashboard`);
      if (res.ok) setDashboard(await res.json());
    } catch {}
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadContracts(), loadObligations(), loadSchedules(), loadJournalEntries(), loadDashboard()]);
    } catch (e: any) {
      setError(e.message || "שגיאה בטעינת נתונים");
    }
    setLoading(false);
  }, [loadContracts, loadObligations, loadSchedules, loadJournalEntries, loadDashboard]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ------- Contract CRUD -------
  const openContractForm = (c?: Contract) => {
    if (c) {
      setEditing(c);
      setForm({
        contract_name: c.contract_name, customer_name: c.customer_name, customer_id: c.customer_id,
        description: c.description, contract_value: c.contract_value, currency: c.currency,
        start_date: c.start_date?.slice(0, 10), end_date: c.end_date?.slice(0, 10),
        signing_date: c.signing_date?.slice(0, 10), recognition_method: c.recognition_method,
        status: c.status, cost_center: c.cost_center, project_id: c.project_id,
        department: c.department, account_manager: c.account_manager, notes: c.notes, tags: c.tags,
      });
    } else {
      setEditing(null);
      setForm({
        recognition_method: "over_time", status: "draft", currency: "ILS",
        start_date: new Date().toISOString().slice(0, 10),
      });
    }
    setShowForm(true);
  };

  const saveContract = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/contracts/${editing.id}` : `${API}/contracts`;
      const method = editing ? "PUT" : "POST";
      const res = await authFetch(url, { method, body: JSON.stringify(form) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "שגיאה בשמירה");
      setShowForm(false);
      await loadAll();
    } catch (e: any) {
      setError(e.message);
    }
    setSaving(false);
  };

  const deleteContract = async (id: number) => {
    if (!confirm("למחוק חוזה זה? כל הנתונים המשויכים יימחקו.")) return;
    try {
      await authFetch(`${API}/contracts/${id}`, { method: "DELETE" });
      await loadAll();
    } catch {}
  };

  // ------- Obligation CRUD -------
  const openObForm = (contractId: number, ob?: Obligation) => {
    if (ob) {
      setEditingOb(ob);
      setObForm({
        contract_id: ob.contract_id, description: ob.description, obligation_type: ob.obligation_type,
        standalone_price: ob.standalone_price, recognition_method: ob.recognition_method,
        satisfaction_method: ob.satisfaction_method, progress_measure: ob.progress_measure,
        progress_pct: ob.progress_pct, start_date: ob.start_date?.slice(0, 10),
        end_date: ob.end_date?.slice(0, 10), milestone_name: ob.milestone_name,
        milestone_criteria: ob.milestone_criteria, is_distinct: ob.is_distinct,
        status: ob.status, cost_to_complete: ob.cost_to_complete, cost_incurred: ob.cost_incurred,
        notes: ob.notes,
      });
    } else {
      setEditingOb(null);
      setObForm({
        contract_id: contractId, recognition_method: "over_time", status: "pending",
        obligation_type: "performance", satisfaction_method: "output", progress_measure: "time_elapsed",
        is_distinct: true,
      });
    }
    setShowObForm(true);
  };

  const saveObligation = async () => {
    setSaving(true);
    try {
      const url = editingOb ? `${API}/performance-obligations/${editingOb.id}` : `${API}/performance-obligations`;
      const method = editingOb ? "PUT" : "POST";
      const res = await authFetch(url, { method, body: JSON.stringify(obForm) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "שגיאה בשמירה");
      setShowObForm(false);
      await loadAll();
    } catch (e: any) {
      setError(e.message);
    }
    setSaving(false);
  };

  const deleteObligation = async (id: number) => {
    if (!confirm("למחוק התחייבות ביצוע זו?")) return;
    try {
      await authFetch(`${API}/performance-obligations/${id}`, { method: "DELETE" });
      await loadAll();
    } catch {}
  };

  // ------- Calculate Recognition -------
  const calculateRecognition = async (contractId: number) => {
    setCalculating(true);
    try {
      const res = await authFetch(`${API}/calculate`, {
        method: "POST",
        body: JSON.stringify({ contract_id: contractId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "שגיאה בחישוב");
      await loadAll();
    } catch (e: any) {
      setError(e.message);
    }
    setCalculating(false);
  };

  const calculateAll = async () => {
    setCalculating(true);
    try {
      const active = contracts.filter(c => c.status === "active");
      for (const c of active) {
        await authFetch(`${API}/calculate`, {
          method: "POST",
          body: JSON.stringify({ contract_id: c.id }),
        });
      }
      await loadAll();
    } catch (e: any) {
      setError(e.message);
    }
    setCalculating(false);
  };

  // ------- Sort/Filter -------
  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const filteredContracts = useMemo(() => {
    let data = contracts.filter(c =>
      (filterStatus === "all" || c.status === filterStatus) &&
      (filterMethod === "all" || c.recognition_method === filterMethod) &&
      (!search || [c.contract_name, c.customer_name, c.contract_number].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [contracts, filterStatus, filterMethod, search, sortField, sortDir]);

  // ------- View Contract Detail -------
  const openDetail = async (c: Contract) => {
    try {
      const res = await authFetch(`${API}/contracts/${c.id}`);
      if (res.ok) setViewContract(await res.json());
    } catch {}
  };

  // ===========================================================================
  //  TABS
  // ===========================================================================
  const tabs = [
    { key: "dashboard", label: "לוח בקרה", icon: BarChart3 },
    { key: "contracts", label: "חוזים", icon: FileText },
    { key: "obligations", label: "התחייבויות ביצוע", icon: Layers },
    { key: "schedules", label: "לוח הכרה", icon: Calendar },
    { key: "journal", label: "פקודות יומן", icon: BookOpen },
  ];

  // ===========================================================================
  //  RENDER
  // ===========================================================================
  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white p-4 md:p-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-7 w-7 text-indigo-400" />
            הכרה בהכנסות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ASC 606 / IFRS 15 - מודל חמשת השלבים להכרה בהכנסות
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadAll} disabled={loading}
            className="flex items-center gap-1 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            רענון
          </button>
          {activeTab === "contracts" && (
            <>
              <button onClick={calculateAll} disabled={calculating}
                className="flex items-center gap-1 px-3 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 rounded-lg text-sm transition">
                <Calculator className={`h-4 w-4 ${calculating ? "animate-spin" : ""}`} />
                חשב הכל
              </button>
              <button onClick={() => openContractForm()}
                className="flex items-center gap-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm transition">
                <Plus className="h-4 w-4" />
                חוזה חדש
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center gap-2 text-sm text-red-400">
            <AlertTriangle className="h-4 w-4" />
            {error}
            <button onClick={() => setError(null)} className="mr-auto"><X className="h-4 w-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white/5 rounded-xl p-1 overflow-x-auto">
        {tabs.map(t => {
          const Icon = t.icon;
          const active = activeTab === t.key;
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key as any)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap
                ${active ? "bg-indigo-600 text-white" : "text-muted-foreground hover:text-white hover:bg-white/5"}`}>
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ================================================================= */}
      {/*  DASHBOARD TAB                                                    */}
      {/* ================================================================= */}
      {activeTab === "dashboard" && dashboard && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <KpiCard title="ערך חוזים כולל" value={fmtCurrency(dashboard.summary.total_contract_value)} icon={DollarSign} color="indigo" />
            <KpiCard title="הכנסה שהוכרה" value={fmtCurrency(dashboard.summary.total_recognized)} icon={CheckCircle2} color="green" />
            <KpiCard title="הכנסה נדחית" value={fmtCurrency(dashboard.summary.total_deferred)} icon={Clock} color="amber" />
            <KpiCard title="חוזים פעילים" value={fmt(dashboard.summary.active_contracts)} icon={FileText} color="cyan" />
            <KpiCard title="סך חוזים" value={fmt(dashboard.summary.total_contracts)} icon={Hash} color="purple" />
            <KpiCard title="ממוצע הכרה" value={fmtPct(dashboard.summary.avg_recognition_pct)} icon={PieChart} color="green" />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Monthly Trend */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                <Activity className="h-4 w-4 text-indigo-400" />
                מגמת הכרה חודשית - {new Date().getFullYear()}
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={(dashboard.monthly_trend || []).map((m: any) => ({
                  ...m, name: monthNames[(m.fiscal_month || 1) - 1],
                  recognized: Number(m.recognized || 0),
                  scheduled: Number(m.scheduled || 0),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="name" tick={{ fill: "#999", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#999", fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, direction: "rtl" }}
                    formatter={(v: any) => fmtCurrency(v)} />
                  <Area type="monotone" dataKey="scheduled" name="מתוזמן" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} />
                  <Area type="monotone" dataKey="recognized" name="הוכר" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.25} />
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* By Method Pie */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                <PieChart className="h-4 w-4 text-cyan-400" />
                לפי שיטת הכרה
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <RechartsPie>
                  <Pie data={(dashboard.by_method || []).map((m: any) => ({
                    name: methodMap[m.recognition_method]?.label || m.recognition_method,
                    value: Number(m.total_value || 0),
                    count: m.count,
                  }))} cx="50%" cy="50%" outerRadius={100} innerRadius={50}
                    dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {(dashboard.by_method || []).map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, direction: "rtl" }}
                    formatter={(v: any) => fmtCurrency(v)} />
                </RechartsPie>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Quarterly + Top Customers */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Quarterly */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-amber-400" />
                סיכום רבעוני
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={(dashboard.quarterly_summary || []).map((q: any) => ({
                  name: `Q${q.fiscal_quarter}`,
                  recognized: Number(q.recognized || 0),
                  scheduled: Number(q.scheduled || 0),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="name" tick={{ fill: "#999" }} />
                  <YAxis tick={{ fill: "#999", fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, direction: "rtl" }}
                    formatter={(v: any) => fmtCurrency(v)} />
                  <Bar dataKey="recognized" name="הוכר" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="scheduled" name="מתוזמן" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Top Customers */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-green-400" />
                לקוחות מובילים
              </h3>
              <div className="space-y-3 max-h-[250px] overflow-y-auto">
                {(dashboard.top_customers || []).map((c: any, i: number) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-400">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{c.customer_name || "לא ידוע"}</div>
                      <div className="text-xs text-muted-foreground">{c.contracts} חוזים</div>
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-medium">{fmtCurrency(c.total_value)}</div>
                      <ProgressBar value={Number(c.recognized || 0)} max={Number(c.total_value || 1)} className="w-20 mt-1" />
                    </div>
                  </div>
                ))}
                {!(dashboard.top_customers || []).length && (
                  <p className="text-sm text-muted-foreground text-center py-8">אין נתונים</p>
                )}
              </div>
            </div>
          </div>

          {/* Upcoming + Expiring */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-indigo-400" />
                הכרות עתידיות (90 יום)
              </h3>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {(dashboard.upcoming_recognitions || []).map((s: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-white/5 rounded-lg text-sm">
                    <div>
                      <span className="font-medium">{s.contract_name}</span>
                      <span className="text-muted-foreground mr-2">{fmtDate(s.period_start)}</span>
                    </div>
                    <span className="font-medium text-indigo-400">{fmtCurrency(s.scheduled_amount)}</span>
                  </div>
                ))}
                {!(dashboard.upcoming_recognitions || []).length && (
                  <p className="text-sm text-muted-foreground text-center py-6">אין הכרות מתוזמנות</p>
                )}
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                חוזים שפגים בקרוב (60 יום)
              </h3>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {(dashboard.expiring_contracts || []).map((c: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-white/5 rounded-lg text-sm">
                    <div>
                      <span className="font-medium">{c.contract_name}</span>
                      <span className="text-muted-foreground mr-2">{c.customer_name}</span>
                    </div>
                    <span className="text-amber-400">{fmtDate(c.end_date)}</span>
                  </div>
                ))}
                {!(dashboard.expiring_contracts || []).length && (
                  <p className="text-sm text-muted-foreground text-center py-6">אין חוזים שפגים בקרוב</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "dashboard" && !dashboard && !loading && (
        <div className="text-center py-20 text-muted-foreground">
          <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>אין נתונים להצגה</p>
        </div>
      )}

      {/* ================================================================= */}
      {/*  CONTRACTS TAB                                                     */}
      {/* ================================================================= */}
      {activeTab === "contracts" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש חוזה, לקוח..."
                className="w-full bg-white/5 border border-white/10 rounded-lg pr-9 pl-3 py-2 text-sm" />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm">
              <option value="all">כל הסטטוסים</option>
              {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filterMethod} onChange={e => setFilterMethod(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm">
              <option value="all">כל השיטות</option>
              {Object.entries(methodMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          {/* Table */}
          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <SortHeader label="מספר חוזה" field="contract_number" sortField={sortField} sortDir={sortDir} onClick={toggleSort} />
                    <SortHeader label="שם חוזה" field="contract_name" sortField={sortField} sortDir={sortDir} onClick={toggleSort} />
                    <SortHeader label="לקוח" field="customer_name" sortField={sortField} sortDir={sortDir} onClick={toggleSort} />
                    <SortHeader label="ערך חוזה" field="contract_value" sortField={sortField} sortDir={sortDir} onClick={toggleSort} />
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">הוכר</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">נדחה</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">שיטה</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">סטטוס</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">התקדמות</th>
                    <SortHeader label="תאריך התחלה" field="start_date" sortField={sortField} sortDir={sortDir} onClick={toggleSort} />
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredContracts.map(c => {
                    const pct = Number(c.contract_value) > 0 ? (Number(c.recognized_amount) / Number(c.contract_value)) * 100 : 0;
                    return (
                      <tr key={c.id} className="hover:bg-white/5 transition">
                        <td className="px-3 py-2 font-mono text-xs text-indigo-400">{c.contract_number}</td>
                        <td className="px-3 py-2 font-medium max-w-[200px] truncate">{c.contract_name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{c.customer_name || "—"}</td>
                        <td className="px-3 py-2 font-medium">{fmtCurrency(c.contract_value)}</td>
                        <td className="px-3 py-2 text-green-400">{fmtCurrency(c.recognized_amount)}</td>
                        <td className="px-3 py-2 text-amber-400">{fmtCurrency(c.deferred_amount)}</td>
                        <td className="px-3 py-2"><MethodBadge method={c.recognition_method} /></td>
                        <td className="px-3 py-2"><StatusBadge status={c.status} map={statusMap} /></td>
                        <td className="px-3 py-2 w-28">
                          <div className="flex items-center gap-2">
                            <ProgressBar value={pct} max={100} className="flex-1" />
                            <span className="text-xs text-muted-foreground w-10">{fmtPct(pct)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{fmtDate(c.start_date)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <button onClick={() => openDetail(c)} className="p-1 hover:bg-white/10 rounded" title="פרטים">
                              <Eye className="h-3.5 w-3.5 text-cyan-400" />
                            </button>
                            <button onClick={() => calculateRecognition(c.id)} disabled={calculating}
                              className="p-1 hover:bg-white/10 rounded" title="חשב הכרה">
                              <Calculator className="h-3.5 w-3.5 text-amber-400" />
                            </button>
                            <button onClick={() => openObForm(c.id)} className="p-1 hover:bg-white/10 rounded" title="הוסף התחייבות">
                              <Plus className="h-3.5 w-3.5 text-green-400" />
                            </button>
                            <button onClick={() => openContractForm(c)} className="p-1 hover:bg-white/10 rounded" title="ערוך">
                              <Edit2 className="h-3.5 w-3.5 text-blue-400" />
                            </button>
                            <button onClick={() => deleteContract(c.id)} className="p-1 hover:bg-white/10 rounded" title="מחק">
                              <Trash2 className="h-3.5 w-3.5 text-red-400" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!filteredContracts.length && (
                    <tr><td colSpan={11} className="text-center py-12 text-muted-foreground">
                      {loading ? "טוען..." : "אין חוזים להצגה"}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t border-white/5 text-xs text-muted-foreground">
              {filteredContracts.length} חוזים מתוך {contracts.length}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/*  OBLIGATIONS TAB                                                   */}
      {/* ================================================================= */}
      {activeTab === "obligations" && (
        <div className="space-y-4">
          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">מספר</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">חוזה</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">תיאור</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">מחיר עצמאי</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">מחיר שהוקצה</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">הוכר</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">שיטה</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">התקדמות</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">סטטוס</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {obligations.map(ob => (
                    <tr key={ob.id} className="hover:bg-white/5 transition">
                      <td className="px-3 py-2 font-mono text-xs text-indigo-400">{ob.obligation_number}</td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">
                        {ob.contract_number} - {ob.contract_name}
                      </td>
                      <td className="px-3 py-2 max-w-[200px] truncate">{ob.description}</td>
                      <td className="px-3 py-2">{fmtCurrency(ob.standalone_price)}</td>
                      <td className="px-3 py-2 text-cyan-400">{fmtCurrency(ob.allocated_price)}</td>
                      <td className="px-3 py-2 text-green-400">{fmtCurrency(ob.recognized_amount)}</td>
                      <td className="px-3 py-2"><MethodBadge method={ob.recognition_method} /></td>
                      <td className="px-3 py-2 w-24">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={Number(ob.progress_pct)} max={100} className="flex-1" />
                          <span className="text-xs text-muted-foreground">{fmtPct(ob.progress_pct)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2"><StatusBadge status={ob.status} map={obligationStatusMap} /></td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openObForm(ob.contract_id, ob)} className="p-1 hover:bg-white/10 rounded">
                            <Edit2 className="h-3.5 w-3.5 text-blue-400" />
                          </button>
                          <button onClick={() => deleteObligation(ob.id)} className="p-1 hover:bg-white/10 rounded">
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!obligations.length && (
                    <tr><td colSpan={10} className="text-center py-12 text-muted-foreground">
                      {loading ? "טוען..." : "אין התחייבויות ביצוע"}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/*  SCHEDULES TAB                                                     */}
      {/* ================================================================= */}
      {activeTab === "schedules" && (
        <div className="space-y-4">
          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">מספר</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">חוזה</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">לקוח</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">תקופה</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">שנה/רבעון</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">מתוזמן</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">הוכר</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">נדחה</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">מצטבר</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">סטטוס</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">נרשם</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {schedules.map(s => (
                    <tr key={s.id} className="hover:bg-white/5 transition">
                      <td className="px-3 py-2 font-mono text-xs text-indigo-400">{s.schedule_number}</td>
                      <td className="px-3 py-2 text-xs">{s.contract_number}</td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">{s.customer_name || "—"}</td>
                      <td className="px-3 py-2 text-xs">{fmtDate(s.period_start)} - {fmtDate(s.period_end)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{s.fiscal_year}/Q{s.fiscal_quarter}</td>
                      <td className="px-3 py-2">{fmtCurrency(s.scheduled_amount)}</td>
                      <td className="px-3 py-2 text-green-400">{fmtCurrency(s.recognized_amount)}</td>
                      <td className="px-3 py-2 text-amber-400">{fmtCurrency(s.deferred_amount)}</td>
                      <td className="px-3 py-2 text-cyan-400">{fmtCurrency(s.cumulative_recognized)}</td>
                      <td className="px-3 py-2"><StatusBadge status={s.status} map={scheduleStatusMap} /></td>
                      <td className="px-3 py-2">
                        {s.is_posted
                          ? <CheckCircle2 className="h-4 w-4 text-green-400" />
                          : <Clock className="h-4 w-4 text-muted-foreground" />}
                      </td>
                    </tr>
                  ))}
                  {!schedules.length && (
                    <tr><td colSpan={11} className="text-center py-12 text-muted-foreground">
                      {loading ? "טוען..." : 'אין לוח הכרה - לחץ "חשב הכל" כדי ליצור'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t border-white/5 text-xs text-muted-foreground">
              {schedules.length} שורות לוח הכרה
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/*  JOURNAL ENTRIES TAB                                               */}
      {/* ================================================================= */}
      {activeTab === "journal" && (
        <div className="space-y-4">
          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">מספר פקודה</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">תאריך</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">חוזה</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">לקוח</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">תיאור</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">חובה</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">זכות</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">סכום</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">סטטוס</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {journalEntries.map(je => (
                    <tr key={je.id} className="hover:bg-white/5 transition">
                      <td className="px-3 py-2 font-mono text-xs text-indigo-400">{je.entry_number}</td>
                      <td className="px-3 py-2 text-xs">{fmtDate(je.entry_date)}</td>
                      <td className="px-3 py-2 text-xs">{je.contract_number || "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{je.customer_name || "—"}</td>
                      <td className="px-3 py-2 max-w-[250px] truncate text-xs">{je.description}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className="text-red-400">{je.debit_account}</span>
                        <span className="text-muted-foreground mr-1">{je.debit_account_name}</span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span className="text-green-400">{je.credit_account}</span>
                        <span className="text-muted-foreground mr-1">{je.credit_account_name}</span>
                      </td>
                      <td className="px-3 py-2 font-medium">{fmtCurrency(je.amount)}</td>
                      <td className="px-3 py-2"><StatusBadge status={je.status} map={jeStatusMap} /></td>
                    </tr>
                  ))}
                  {!journalEntries.length && (
                    <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">
                      {loading ? "טוען..." : "אין פקודות יומן"}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t border-white/5 text-xs text-muted-foreground">
              {journalEntries.length} פקודות יומן |
              סך חובה: {fmtCurrency(journalEntries.reduce((s, j) => s + Number(j.amount || 0), 0))} |
              סך זכות: {fmtCurrency(journalEntries.reduce((s, j) => s + Number(j.amount || 0), 0))}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/*  CONTRACT FORM MODAL                                               */}
      {/* ================================================================= */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-10 px-4 overflow-y-auto">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-[#12122a] border border-white/10 rounded-2xl w-full max-w-2xl mb-10">
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <h2 className="text-lg font-bold">{editing ? "עריכת חוזה" : "חוזה חדש"}</h2>
                <button onClick={() => setShowForm(false)}><X className="h-5 w-5" /></button>
              </div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground">שם חוזה *</label>
                    <input value={form.contract_name || ""} onChange={e => setForm({ ...form, contract_name: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">שם לקוח</label>
                    <input value={form.customer_name || ""} onChange={e => setForm({ ...form, customer_name: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">מזהה לקוח</label>
                    <input value={form.customer_id || ""} onChange={e => setForm({ ...form, customer_id: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">ערך חוזה *</label>
                    <input type="number" value={form.contract_value || ""} onChange={e => setForm({ ...form, contract_value: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">תאריך התחלה *</label>
                    <input type="date" value={form.start_date || ""} onChange={e => setForm({ ...form, start_date: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">תאריך סיום</label>
                    <input type="date" value={form.end_date || ""} onChange={e => setForm({ ...form, end_date: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">תאריך חתימה</label>
                    <input type="date" value={form.signing_date || ""} onChange={e => setForm({ ...form, signing_date: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">מטבע</label>
                    <select value={form.currency || "ILS"} onChange={e => setForm({ ...form, currency: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1">
                      <option value="ILS">ILS</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">שיטת הכרה *</label>
                    <select value={form.recognition_method || "over_time"} onChange={e => setForm({ ...form, recognition_method: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1">
                      <option value="over_time">לאורך זמן (Over Time)</option>
                      <option value="point_in_time">נקודת זמן (Point in Time)</option>
                      <option value="milestone">אבני דרך (Milestone)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">סטטוס</label>
                    <select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1">
                      {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">מרכז עלות</label>
                    <input value={form.cost_center || ""} onChange={e => setForm({ ...form, cost_center: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">מחלקה</label>
                    <input value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">מנהל חשבון</label>
                    <input value={form.account_manager || ""} onChange={e => setForm({ ...form, account_manager: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">תגיות</label>
                    <input value={form.tags || ""} onChange={e => setForm({ ...form, tags: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1"
                      placeholder="מופרדות בפסיק" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">תיאור</label>
                  <textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1" rows={2} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">הערות</label>
                  <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1" rows={2} />
                </div>
              </div>
              <div className="flex justify-end gap-2 p-4 border-t border-white/10">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm">ביטול</button>
                <button onClick={saveContract} disabled={saving}
                  className="flex items-center gap-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm">
                  <Save className="h-4 w-4" />
                  {saving ? "שומר..." : (editing ? "עדכן" : "צור")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================================================================= */}
      {/*  OBLIGATION FORM MODAL                                             */}
      {/* ================================================================= */}
      <AnimatePresence>
        {showObForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-10 px-4 overflow-y-auto">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-[#12122a] border border-white/10 rounded-2xl w-full max-w-2xl mb-10">
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <h2 className="text-lg font-bold">{editingOb ? "עריכת התחייבות ביצוע" : "התחייבות ביצוע חדשה"}</h2>
                <button onClick={() => setShowObForm(false)}><X className="h-5 w-5" /></button>
              </div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="text-xs text-muted-foreground">תיאור התחייבות *</label>
                    <input value={obForm.description || ""} onChange={e => setObForm({ ...obForm, description: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">מחיר עצמאי (SSP)</label>
                    <input type="number" value={obForm.standalone_price || ""} onChange={e => setObForm({ ...obForm, standalone_price: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">שיטת הכרה</label>
                    <select value={obForm.recognition_method || "over_time"} onChange={e => setObForm({ ...obForm, recognition_method: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1">
                      <option value="over_time">לאורך זמן</option>
                      <option value="point_in_time">נקודת זמן</option>
                      <option value="milestone">אבני דרך</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">שיטת מדידה</label>
                    <select value={obForm.progress_measure || "time_elapsed"} onChange={e => setObForm({ ...obForm, progress_measure: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1">
                      <option value="time_elapsed">זמן שחלף</option>
                      <option value="cost_to_cost">עלות לעלות</option>
                      <option value="units_delivered">יחידות שסופקו</option>
                      <option value="milestones">אבני דרך</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">סטטוס</label>
                    <select value={obForm.status || "pending"} onChange={e => setObForm({ ...obForm, status: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1">
                      {Object.entries(obligationStatusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">תאריך התחלה</label>
                    <input type="date" value={obForm.start_date || ""} onChange={e => setObForm({ ...obForm, start_date: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">תאריך סיום</label>
                    <input type="date" value={obForm.end_date || ""} onChange={e => setObForm({ ...obForm, end_date: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1" />
                  </div>
                  {obForm.recognition_method === "milestone" && (
                    <>
                      <div>
                        <label className="text-xs text-muted-foreground">שם אבן דרך</label>
                        <input value={obForm.milestone_name || ""} onChange={e => setObForm({ ...obForm, milestone_name: e.target.value })}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">אחוז התקדמות</label>
                        <input type="number" min="0" max="100" value={obForm.progress_pct || ""}
                          onChange={e => setObForm({ ...obForm, progress_pct: e.target.value })}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1" />
                      </div>
                    </>
                  )}
                  {obForm.progress_measure === "cost_to_cost" && (
                    <>
                      <div>
                        <label className="text-xs text-muted-foreground">עלות שנצברה</label>
                        <input type="number" value={obForm.cost_incurred || ""} onChange={e => setObForm({ ...obForm, cost_incurred: e.target.value })}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">עלות להשלמה</label>
                        <input type="number" value={obForm.cost_to_complete || ""} onChange={e => setObForm({ ...obForm, cost_to_complete: e.target.value })}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1" />
                      </div>
                    </>
                  )}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">הערות</label>
                  <textarea value={obForm.notes || ""} onChange={e => setObForm({ ...obForm, notes: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1" rows={2} />
                </div>
              </div>
              <div className="flex justify-end gap-2 p-4 border-t border-white/10">
                <button onClick={() => setShowObForm(false)} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm">ביטול</button>
                <button onClick={saveObligation} disabled={saving}
                  className="flex items-center gap-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm">
                  <Save className="h-4 w-4" />
                  {saving ? "שומר..." : (editingOb ? "עדכן" : "צור")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================================================================= */}
      {/*  CONTRACT DETAIL MODAL                                             */}
      {/* ================================================================= */}
      <AnimatePresence>
        {viewContract && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-6 px-4 overflow-y-auto">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-[#12122a] border border-white/10 rounded-2xl w-full max-w-4xl mb-10">
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <div>
                  <h2 className="text-lg font-bold">{viewContract.contract_name}</h2>
                  <span className="text-xs text-muted-foreground">{viewContract.contract_number}</span>
                </div>
                <button onClick={() => setViewContract(null)}><X className="h-5 w-5" /></button>
              </div>
              <div className="p-4 space-y-6">
                {/* Contract Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">ערך חוזה</div>
                    <div className="text-lg font-bold">{fmtCurrency(viewContract.contract_value)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">הוכר</div>
                    <div className="text-lg font-bold text-green-400">{fmtCurrency(viewContract.recognized_amount)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">נדחה</div>
                    <div className="text-lg font-bold text-amber-400">{fmtCurrency(viewContract.deferred_amount)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">סטטוס</div>
                    <StatusBadge status={viewContract.status} map={statusMap} />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><span className="text-muted-foreground">לקוח:</span> {viewContract.customer_name || "—"}</div>
                  <div><span className="text-muted-foreground">שיטה:</span> <MethodBadge method={viewContract.recognition_method} /></div>
                  <div><span className="text-muted-foreground">התחלה:</span> {fmtDate(viewContract.start_date)}</div>
                  <div><span className="text-muted-foreground">סיום:</span> {fmtDate(viewContract.end_date)}</div>
                </div>

                {/* Obligations */}
                {viewContract.obligations?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-2 flex items-center gap-1">
                      <Layers className="h-4 w-4 text-indigo-400" />
                      התחייבויות ביצוע ({viewContract.obligations.length})
                    </h3>
                    <div className="space-y-2">
                      {viewContract.obligations.map((ob: any) => (
                        <div key={ob.id} className="bg-white/5 rounded-lg p-3 flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-sm">{ob.description}</div>
                            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                              <span>SSP: {fmtCurrency(ob.standalone_price)}</span>
                              <span>הוקצה: {fmtCurrency(ob.allocated_price)}</span>
                              <MethodBadge method={ob.recognition_method} />
                            </div>
                          </div>
                          <div className="text-left ml-4">
                            <div className="text-sm font-medium text-green-400">{fmtCurrency(ob.recognized_amount)}</div>
                            <ProgressBar value={Number(ob.progress_pct)} max={100} className="w-20 mt-1" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent Journal Entries */}
                {viewContract.journal_entries?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-2 flex items-center gap-1">
                      <BookOpen className="h-4 w-4 text-cyan-400" />
                      פקודות יומן ({viewContract.journal_entries.length})
                    </h3>
                    <div className="max-h-[200px] overflow-y-auto space-y-1">
                      {viewContract.journal_entries.slice(0, 10).map((je: any) => (
                        <div key={je.id} className="bg-white/5 rounded-lg p-2 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-indigo-400">{je.entry_number}</span>
                            <span className="text-muted-foreground">{fmtDate(je.entry_date)}</span>
                          </div>
                          <span className="font-medium">{fmtCurrency(je.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 p-4 border-t border-white/10">
                <button onClick={() => calculateRecognition(viewContract.id)} disabled={calculating}
                  className="flex items-center gap-1 px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 rounded-lg text-sm">
                  <Calculator className="h-4 w-4" />
                  חשב הכרה
                </button>
                <button onClick={() => { setViewContract(null); openContractForm(viewContract); }}
                  className="flex items-center gap-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm">
                  <Edit2 className="h-4 w-4" />
                  ערוך חוזה
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading Overlay */}
      {loading && !contracts.length && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-8 w-8 animate-spin text-indigo-400" />
        </div>
      )}
    </div>
  );
}
