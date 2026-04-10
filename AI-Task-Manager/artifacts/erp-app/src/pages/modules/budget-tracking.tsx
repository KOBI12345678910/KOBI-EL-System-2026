import { useState, useMemo } from "react";
import ImportButton from "@/components/import-button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  Search, Plus, Edit2, Trash2, X, Save, Eye, BarChart3,
  Target, Wallet, PieChart, Calendar, Users, Clock,
  ArrowUpRight, ArrowDownRight, Building2, Hash, Copy
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";

interface Budget {
  id: number;
  budgetNumber: string | null;
  budgetName: string;
  budgetType: string;
  fiscalYear: number;
  fiscalMonth: number | null;
  category: string;
  department: string | null;
  budgetedAmount: string;
  actualAmount: string;
  committedAmount: string;
  forecastAmount: string;
  variance: string | null;
  remainingAmount: string | null;
  utilizationPct: string | null;
  projectId: number | null;
  status: string;
  approvedBy: string | null;
  approvedDate: string | null;
  alertThreshold80: boolean;
  alertThreshold90: boolean;
  alertThreshold100: boolean;
  responsiblePerson: string | null;
  priority: string | null;
  tags: string | null;
  notes: string | null;
  createdAt: string;
}

const BUDGET_TYPES = ["תפעולי", "הון", "פרויקט", "מחלקתי", "שיווק", "מו\"פ", "אחר"];
const CATEGORIES = ["חומרי גלם", "שכר", "שכירות", "שירותים", "ציוד", "תחזוקה", "שיווק", "הובלה", "ביטוח", "אחר"];
const DEPARTMENTS = ["ייצור", "רכש", "מכירות", "כספים", "הנהלה", "לוגיסטיקה", "שיווק", "מו\"פ", "אחר"];
const PRIORITIES = ["נמוכה", "רגילה", "גבוהה", "דחוף"];
const STATUSES = ["טיוטה", "פעיל", "מוקפא", "סגור"];
const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

type ViewMode = "dashboard" | "list" | "departments" | "alerts";

function utilizationColor(pct: number): string {
  if (pct >= 100) return "text-red-400";
  if (pct >= 90) return "text-red-400";
  if (pct >= 80) return "text-amber-400";
  if (pct >= 60) return "text-yellow-400";
  return "text-green-400";
}

function utilizationBg(pct: number): string {
  if (pct >= 100) return "bg-red-500";
  if (pct >= 90) return "bg-red-500";
  if (pct >= 80) return "bg-amber-500";
  if (pct >= 60) return "bg-yellow-500";
  return "bg-green-500";
}

function alertBadge(pct: number) {
  if (pct >= 100) return <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse">חריגה!</span>;
  if (pct >= 90) return <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-400 border border-red-500/30">90%+</span>;
  if (pct >= 80) return <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30">80%+</span>;
  return null;
}

function statusColor(status: string): string {
  const c: Record<string, string> = {
    "טיוטה": "bg-muted/20 text-muted-foreground border-gray-500/30",
    "פעיל": "bg-green-500/20 text-green-400 border-green-500/30",
    "מוקפא": "bg-blue-500/20 text-blue-400 border-blue-500/30",
    "סגור": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  };
  return c[status] || "bg-muted/20 text-muted-foreground border-gray-500/30";
}

function priorityColor(p: string | null): string {
  const c: Record<string, string> = {
    "דחוף": "text-red-400",
    "גבוהה": "text-amber-400",
    "רגילה": "text-blue-400",
    "נמוכה": "text-muted-foreground",
  };
  return c[p || ""] || "text-muted-foreground";
}


const load: any[] = [];
export default function BudgetTrackingPage() {
  const qc = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear());
  const [deptFilter, setDeptFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);
  const [detailTab, setDetailTab] = useState("details");
  const bulk = useBulkSelection();
  const formValidation = useFormValidation({ budgetName: { required: true, message: "שם תקציב נדרש" }, totalAmount: { required: true, message: "סכום נדרש" } });

  const { data: budgetsRaw, isLoading } = useQuery({
    queryKey: ["budgets"],
    queryFn: async () => { const r = await authFetch(`${API}/budgets`); return r.json(); },
  });
  const budgets: Budget[] = Array.isArray(budgetsRaw) ? budgetsRaw : (budgetsRaw?.data || budgetsRaw?.items || []);

  const filtered = useMemo(() => {
    return budgets.filter(b => {
      const matchSearch = !search || b.budgetName.includes(search) || (b.budgetNumber || "").includes(search) || (b.department || "").includes(search);
      const matchStatus = statusFilter === "all" || b.status === statusFilter;
      const matchYear = b.fiscalYear === yearFilter;
      const matchDept = deptFilter === "all" || b.department === deptFilter;
      return matchSearch && matchStatus && matchYear && matchDept;
    });
  }, [budgets, search, statusFilter, yearFilter, deptFilter]);

  const kpis = useMemo(() => {
    const yearBudgets = budgets.filter(b => b.fiscalYear === yearFilter && b.status === "פעיל");
    const totalBudget = yearBudgets.reduce((s, b) => s + parseFloat(b.budgetedAmount || "0"), 0);
    const totalActual = yearBudgets.reduce((s, b) => s + parseFloat(b.actualAmount || "0"), 0);
    const totalCommitted = yearBudgets.reduce((s, b) => s + parseFloat(b.committedAmount || "0"), 0);
    const totalForecast = yearBudgets.reduce((s, b) => s + parseFloat(b.forecastAmount || "0"), 0);
    const totalRemaining = totalBudget - totalActual - totalCommitted;
    const overallUtilization = totalBudget > 0 ? (totalActual / totalBudget * 100) : 0;
    const over100 = yearBudgets.filter(b => {
      const pct = parseFloat(b.budgetedAmount || "0") > 0 ? (parseFloat(b.actualAmount || "0") / parseFloat(b.budgetedAmount || "0") * 100) : 0;
      return pct >= 100;
    }).length;
    const alert80 = yearBudgets.filter(b => {
      const pct = parseFloat(b.budgetedAmount || "0") > 0 ? (parseFloat(b.actualAmount || "0") / parseFloat(b.budgetedAmount || "0") * 100) : 0;
      return pct >= 80 && pct < 100;
    }).length;
    return { totalBudget, totalActual, totalCommitted, totalForecast, totalRemaining, overallUtilization, over100, alert80, count: yearBudgets.length };
  }, [budgets, yearFilter]);

  const departmentSummary = useMemo(() => {
    const depts: Record<string, { budget: number; actual: number; committed: number; count: number }> = {};
    budgets.filter(b => b.fiscalYear === yearFilter && b.status === "פעיל").forEach(b => {
      const dept = b.department || "ללא מחלקה";
      if (!depts[dept]) depts[dept] = { budget: 0, actual: 0, committed: 0, count: 0 };
      depts[dept].budget += parseFloat(b.budgetedAmount || "0");
      depts[dept].actual += parseFloat(b.actualAmount || "0");
      depts[dept].committed += parseFloat(b.committedAmount || "0");
      depts[dept].count++;
    });
    return Object.entries(depts).map(([name, data]) => ({
      name,
      ...data,
      utilization: data.budget > 0 ? (data.actual / data.budget * 100) : 0,
      remaining: data.budget - data.actual - data.committed,
    })).sort((a, b) => b.utilization - a.utilization);
  }, [budgets, yearFilter]);

  const alertBudgets = useMemo(() => {
    return budgets
      .filter(b => b.fiscalYear === yearFilter && b.status === "פעיל")
      .map(b => {
        const budgeted = parseFloat(b.budgetedAmount || "0");
        const actual = parseFloat(b.actualAmount || "0");
        const pct = budgeted > 0 ? (actual / budgeted * 100) : 0;
        return { ...b, pct };
      })
      .filter(b => b.pct >= 80)
      .sort((a, b) => b.pct - a.pct);
  }, [budgets, yearFilter]);

  const [form, setForm] = useState<any>({});

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const url = data.id ? `${API}/budgets/${data.id}` : `${API}/budgets`;
      const method = data.id ? "PUT" : "POST";
      const r = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["budgets"] }); setShowForm(false); setEditingBudget(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/budgets/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Delete failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgets"] }),
  });

  function resetForm() {
    return {
      budgetName: "", budgetType: "תפעולי", fiscalYear: yearFilter, fiscalMonth: "",
      category: "חומרי גלם", department: "", budgetedAmount: "", actualAmount: "0",
      committedAmount: "0", forecastAmount: "0", status: "טיוטה",
      approvedBy: "", approvedDate: "", responsiblePerson: "", priority: "רגילה",
      alertThreshold80: true, alertThreshold90: true, alertThreshold100: true,
      tags: "", notes: "",
    };
  }

  function openForm(b?: Budget) {
    if (b) {
      setEditingBudget(b);
      setForm({
        budgetName: b.budgetName, budgetType: b.budgetType, fiscalYear: b.fiscalYear,
        fiscalMonth: b.fiscalMonth ?? "", category: b.category, department: b.department || "",
        budgetedAmount: b.budgetedAmount, actualAmount: b.actualAmount || "0",
        committedAmount: b.committedAmount || "0", forecastAmount: b.forecastAmount || "0",
        status: b.status, approvedBy: b.approvedBy || "", approvedDate: b.approvedDate || "",
        responsiblePerson: b.responsiblePerson || "", priority: b.priority || "רגילה",
        alertThreshold80: b.alertThreshold80, alertThreshold90: b.alertThreshold90,
        alertThreshold100: b.alertThreshold100, tags: b.tags || "", notes: b.notes || "",
      });
    } else {
      setEditingBudget(null);
      setForm(resetForm());
    }
    setShowForm(true);
  }

  function handleSubmit() {
    const payload = { ...form };
    if (editingBudget) payload.id = editingBudget.id;
    saveMutation.mutate(payload);
  }

  const years = useMemo(() => {
    const yrs = new Set(budgets.map(b => b.fiscalYear));
    yrs.add(new Date().getFullYear());
    yrs.add(new Date().getFullYear() + 1);
    return Array.from(yrs).sort((a, b) => b - a);
  }, [budgets]);

  const tabs: { key: ViewMode; label: string; icon: any }[] = [
    { key: "dashboard", label: "דשבורד", icon: BarChart3 },
    { key: "list", label: "רשימת תקציבים", icon: Wallet },
    { key: "departments", label: "לפי מחלקה", icon: Building2 },
    { key: "alerts", label: "התראות", icon: AlertTriangle },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-foreground p-4 md:p-6" dir="rtl">
      <div className="max-w-[1600px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/20 rounded-xl border border-emerald-500/30">
              <DollarSign className="text-emerald-400" size={28} />
            </div>
            <div>
              <h1 className="text-lg sm:text-2xl font-bold">מעקב תקציב</h1>
              <p className="text-muted-foreground text-sm">הקצאת תקציב לפי מחלקה, מעקב הוצאות, תחזיות והתראות</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select value={yearFilter} onChange={e => setYearFilter(parseInt(e.target.value))}
              className="bg-muted/60 border border-border rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:border-emerald-500/50 focus:outline-none">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <ImportButton apiRoute="/api/budgets" onSuccess={() => qc.invalidateQueries({ queryKey: ["budgets"] })} />
            <button onClick={() => openForm()} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-medium transition-colors">
              <Plus size={18} /> תקציב חדש
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: "סה\"כ תקציב", value: `₪${(kpis.totalBudget / 1000).toFixed(0)}K`, icon: Wallet, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
            { label: "ביצוע בפועל", value: `₪${(kpis.totalActual / 1000).toFixed(0)}K`, icon: TrendingUp, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
            { label: "מחויב", value: `₪${(kpis.totalCommitted / 1000).toFixed(0)}K`, icon: Clock, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
            { label: "נותר", value: `₪${(kpis.totalRemaining / 1000).toFixed(0)}K`, icon: Target, color: kpis.totalRemaining >= 0 ? "text-green-400" : "text-red-400", bg: kpis.totalRemaining >= 0 ? "bg-green-500/10 border-green-500/20" : "bg-red-500/10 border-red-500/20" },
            { label: "ניצול כללי", value: `${kpis.overallUtilization.toFixed(1)}%`, icon: PieChart, color: utilizationColor(kpis.overallUtilization), bg: "bg-muted/10 border-gray-500/20" },
            { label: "תחזית", value: `₪${(kpis.totalForecast / 1000).toFixed(0)}K`, icon: TrendingUp, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
            { label: "חריגות", value: kpis.over100, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
            { label: "התראות 80%+", value: kpis.alert80, icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
          ].map((k, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={`${k.bg} border rounded-xl p-3 text-center`}>
              <k.icon className={`${k.color} mx-auto mb-1`} size={20} />
              <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
              <div className="text-[10px] text-muted-foreground">{k.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Tabs & Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-1 bg-muted/50 rounded-xl p-1 border border-border/50">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setViewMode(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === t.key ? "bg-emerald-600 text-foreground shadow-lg" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
                <t.icon size={16} /> {t.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש תקציב..."
              className="w-full bg-muted/60 border border-border rounded-lg pr-10 pl-4 py-2.5 text-sm text-foreground placeholder-gray-500 focus:border-emerald-500/50 focus:outline-none" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="bg-muted/60 border border-border rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:border-emerald-500/50 focus:outline-none">
            <option value="all">כל הסטטוסים</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
            className="bg-muted/60 border border-border rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:border-emerald-500/50 focus:outline-none">
            <option value="all">כל המחלקות</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {viewMode === "dashboard" && (
            <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4 sm:space-y-6">
              {/* Overall Utilization Bar */}
              <div className="bg-muted/40 border border-border/50 rounded-xl p-5">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><PieChart className="text-emerald-400" size={20} /> ניצול תקציב כללי — {yearFilter}</h3>
                <div className="relative h-8 bg-muted/50 rounded-full overflow-hidden mb-2">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(kpis.overallUtilization, 100)}%` }} transition={{ duration: 1 }}
                    className={`h-full ${utilizationBg(kpis.overallUtilization)} rounded-full`} />
                  {/* 80% marker */}
                  <div className="absolute top-0 bottom-0 border-l-2 border-amber-400/70 border-dashed" style={{ left: "80%" }}>
                    <span className="absolute -top-5 -translate-x-1/2 text-[10px] text-amber-400">80%</span>
                  </div>
                  {/* 90% marker */}
                  <div className="absolute top-0 bottom-0 border-l-2 border-red-400/70 border-dashed" style={{ left: "90%" }}>
                    <span className="absolute -top-5 -translate-x-1/2 text-[10px] text-red-400">90%</span>
                  </div>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>תקציב: ₪{kpis.totalBudget.toLocaleString()}</span>
                  <span>ביצוע: ₪{kpis.totalActual.toLocaleString()} ({kpis.overallUtilization.toFixed(1)}%)</span>
                  <span>נותר: ₪{kpis.totalRemaining.toLocaleString()}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Category Breakdown */}
                <div className="bg-muted/40 border border-border/50 rounded-xl p-5">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><BarChart3 className="text-blue-400" size={20} /> לפי קטגוריה</h3>
                  <div className="space-y-3">
                    {(() => {
                      const cats: Record<string, { budget: number; actual: number }> = {};
                      filtered.forEach(b => {
                        if (!cats[b.category]) cats[b.category] = { budget: 0, actual: 0 };
                        cats[b.category].budget += parseFloat(b.budgetedAmount || "0");
                        cats[b.category].actual += parseFloat(b.actualAmount || "0");
                      });
                      return Object.entries(cats).sort((a, b) => b[1].budget - a[1].budget).map(([cat, data]) => {
                        const pct = data.budget > 0 ? (data.actual / data.budget * 100) : 0;
                        return (
                          <div key={cat}>
                            <div className="flex justify-between text-sm mb-1">
                              <span>{cat}</span>
                              <span className={utilizationColor(pct)}>{pct.toFixed(0)}% | ₪{data.actual.toLocaleString()} / ₪{data.budget.toLocaleString()}</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(pct, 100)}%` }} transition={{ duration: 0.6 }}
                                className={`h-full ${utilizationBg(pct)} rounded-full`} />
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Department Summary */}
                <div className="bg-muted/40 border border-border/50 rounded-xl p-5">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Building2 className="text-purple-400" size={20} /> לפי מחלקה</h3>
                  <div className="space-y-3">
                    {departmentSummary.slice(0, 8).map(dept => (
                      <div key={dept.name} className="flex items-center gap-3">
                        <span className="text-sm w-24 truncate text-gray-300">{dept.name}</span>
                        <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden relative">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(dept.utilization, 100)}%` }} transition={{ duration: 0.6 }}
                            className={`h-full ${utilizationBg(dept.utilization)} rounded-full`} />
                        </div>
                        <span className={`text-xs w-12 text-left font-bold ${utilizationColor(dept.utilization)}`}>{dept.utilization.toFixed(0)}%</span>
                        {dept.utilization >= 80 && alertBadge(dept.utilization)}
                      </div>
                    ))}
                    {departmentSummary.length === 0 && <p className="text-muted-foreground text-center">אין נתונים</p>}
                  </div>
                </div>
              </div>

              {/* Alert Section */}
              {alertBudgets.length > 0 && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-5">
                  <h3 className="text-lg font-bold mb-3 flex items-center gap-2 text-red-400"><AlertTriangle size={20} /> תקציבים דורשים תשומת לב ({alertBudgets.length})</h3>
                  <div className="space-y-2">
                    {alertBudgets.slice(0, 10).map(b => (
                      <div key={b.id} className="flex items-center justify-between bg-background/60 rounded-lg p-3 border border-border/30 cursor-pointer hover:border-red-500/30" onClick={() => setSelectedBudget(b)}>
                        <div className="flex items-center gap-3">
                          <AlertTriangle size={16} className={utilizationColor(b.pct)} />
                          <div>
                            <span className="font-medium">{b.budgetName}</span>
                            <span className="text-xs text-muted-foreground mr-2">({b.department || "—"})</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">₪{parseFloat(b.actualAmount || "0").toLocaleString()} / ₪{parseFloat(b.budgetedAmount || "0").toLocaleString()}</span>
                          {alertBadge(b.pct)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Budgets Table */}
              <div className="bg-muted/40 border border-border/50 rounded-xl p-5">
                <h3 className="text-lg font-bold mb-4">תקציבים — {yearFilter}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-right py-3 px-2 text-muted-foreground font-medium">שם תקציב</th>
                        <th className="text-right py-3 px-2 text-muted-foreground font-medium">מחלקה</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">קטגוריה</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">תקציב</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">ביצוע</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">ניצול</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">נותר</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">סטטוס</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">פעולות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(0, 20).map(b => {
                        const budgeted = parseFloat(b.budgetedAmount || "0");
                        const actual = parseFloat(b.actualAmount || "0");
                        const committed = parseFloat(b.committedAmount || "0");
                        const pct = budgeted > 0 ? (actual / budgeted * 100) : 0;
                        const remaining = budgeted - actual - committed;
                        return (
                          <tr key={b.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                            <td className="py-3 px-2">
                              <div className="font-medium">{b.budgetName}</div>
                              {b.budgetNumber && <div className="text-xs text-muted-foreground font-mono">{b.budgetNumber}</div>}
                            </td>
                            <td className="py-3 px-2 text-gray-300">{b.department || "—"}</td>
                            <td className="py-3 px-2 text-center text-xs text-gray-300">{b.category}</td>
                            <td className="py-3 px-2 text-center text-blue-400 font-medium">₪{budgeted.toLocaleString()}</td>
                            <td className="py-3 px-2 text-center">₪{actual.toLocaleString()}</td>
                            <td className="py-3 px-2 text-center">
                              <div className="flex items-center gap-2 justify-center">
                                <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                  <div className={`h-full ${utilizationBg(pct)} rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
                                </div>
                                <span className={`text-xs font-bold ${utilizationColor(pct)}`}>{pct.toFixed(0)}%</span>
                                {alertBadge(pct)}
                              </div>
                            </td>
                            <td className={`py-3 px-2 text-center ${remaining >= 0 ? "text-green-400" : "text-red-400"}`}>₪{remaining.toLocaleString()}</td>
                            <td className="py-3 px-2 text-center"><span className={`px-2 py-1 rounded-full text-xs border ${statusColor(b.status)}`}>{b.status}</span></td>
                            <td className="py-3 px-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => setSelectedBudget(b)} className="p-1.5 hover:bg-muted rounded-lg"><Eye size={14} className="text-muted-foreground" /></button>
                                <button onClick={() => openForm(b)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 size={14} className="text-blue-400" /></button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/budgets`, b.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                                {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק תקציב זה?", { itemName: b.name || b.title || String(b.id), entityType: "תקציב" }); if (ok) deleteMutation.mutate(b.id); }} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 size={14} className="text-red-400" /></button>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filtered.length === 0 && <p className="text-muted-foreground text-center py-8">אין תקציבים לשנה {yearFilter}</p>}
                </div>
              </div>
            </motion.div>
          )}

          {viewMode === "list" && (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <BulkActions bulk={bulk} actions={defaultBulkActions} entityName="תקציבים" />
              {filtered.map(b => {
                const budgeted = parseFloat(b.budgetedAmount || "0");
                const actual = parseFloat(b.actualAmount || "0");
                const committed = parseFloat(b.committedAmount || "0");
                const pct = budgeted > 0 ? (actual / budgeted * 100) : 0;
                const remaining = budgeted - actual - committed;
                return (
                  <motion.div key={b.id} layout className={`bg-muted/40 border border-border/50 rounded-xl p-4 hover:border-emerald-500/30 transition-all ${bulk.isSelected(b.id) ? "ring-1 ring-primary/50 bg-primary/5" : ""}`}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div onClick={e => e.stopPropagation()}><BulkCheckbox bulk={bulk} id={b.id} /></div>
                        <div className={`p-2.5 rounded-xl ${pct >= 90 ? "bg-red-500/10 border border-red-500/20" : pct >= 80 ? "bg-amber-500/10 border border-amber-500/20" : "bg-emerald-500/10 border border-emerald-500/20"}`}>
                          <DollarSign className={pct >= 90 ? "text-red-400" : pct >= 80 ? "text-amber-400" : "text-emerald-400"} size={22} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{b.budgetName}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs border ${statusColor(b.status)}`}>{b.status}</span>
                            {alertBadge(pct)}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                            {b.budgetNumber && <span className="font-mono">{b.budgetNumber}</span>}
                            <span>{b.department || "ללא מחלקה"}</span>
                            <span>{b.category}</span>
                            <span className={priorityColor(b.priority)}>{b.priority}</span>
                            {b.fiscalMonth && <span>{MONTHS[b.fiscalMonth - 1]}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-5">
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">תקציב</div>
                          <div className="font-bold text-blue-400">₪{budgeted.toLocaleString()}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">ביצוע</div>
                          <div className="font-bold">₪{actual.toLocaleString()}</div>
                        </div>
                        <div className="text-center min-w-[80px]">
                          <div className="text-xs text-muted-foreground">ניצול</div>
                          <div className="flex items-center gap-1">
                            <div className="w-12 h-2 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full ${utilizationBg(pct)} rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <span className={`text-xs font-bold ${utilizationColor(pct)}`}>{pct.toFixed(0)}%</span>
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">נותר</div>
                          <div className={`font-bold ${remaining >= 0 ? "text-green-400" : "text-red-400"}`}>₪{remaining.toLocaleString()}</div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => setSelectedBudget(b)} className="p-1.5 hover:bg-muted rounded-lg"><Eye size={15} className="text-muted-foreground" /></button>
                          <button onClick={() => openForm(b)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 size={15} className="text-blue-400" /></button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/budgets`, b.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                          {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק תקציב זה?", { itemName: b.name || b.title || String(b.id), entityType: "תקציב" }); if (ok) deleteMutation.mutate(b.id); }} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 size={15} className="text-red-400" /></button>}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              {filtered.length === 0 && <p className="text-muted-foreground text-center py-12">אין תקציבים</p>}
            </motion.div>
          )}

          {viewMode === "departments" && (
            <motion.div key="departments" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <p className="text-muted-foreground text-sm">סיכום הקצאת תקציב וניצול לפי מחלקות — {yearFilter}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {departmentSummary.map(dept => (
                  <div key={dept.name} className="bg-muted/40 border border-border/50 rounded-xl p-5 hover:border-emerald-500/30 transition-all">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-bold flex items-center gap-2">
                        <Building2 size={18} className="text-purple-400" />
                        {dept.name}
                      </h4>
                      <span className="text-xs text-muted-foreground">{dept.count} תקציבים</span>
                    </div>
                    <div className="relative h-4 bg-muted/50 rounded-full overflow-hidden mb-3">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(dept.utilization, 100)}%` }} transition={{ duration: 0.8 }}
                        className={`h-full ${utilizationBg(dept.utilization)} rounded-full`} />
                      <div className="absolute top-0 bottom-0 border-l-2 border-amber-400/50 border-dashed" style={{ left: "80%" }} />
                      <div className="absolute top-0 bottom-0 border-l-2 border-red-400/50 border-dashed" style={{ left: "90%" }} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-background/50 rounded-lg p-2 text-center">
                        <div className="text-xs text-muted-foreground">תקציב</div>
                        <div className="font-bold text-blue-400">₪{dept.budget.toLocaleString()}</div>
                      </div>
                      <div className="bg-background/50 rounded-lg p-2 text-center">
                        <div className="text-xs text-muted-foreground">ביצוע</div>
                        <div className="font-bold">₪{dept.actual.toLocaleString()}</div>
                      </div>
                      <div className="bg-background/50 rounded-lg p-2 text-center">
                        <div className="text-xs text-muted-foreground">ניצול</div>
                        <div className={`font-bold ${utilizationColor(dept.utilization)}`}>{dept.utilization.toFixed(1)}%</div>
                      </div>
                      <div className="bg-background/50 rounded-lg p-2 text-center">
                        <div className="text-xs text-muted-foreground">נותר</div>
                        <div className={`font-bold ${dept.remaining >= 0 ? "text-green-400" : "text-red-400"}`}>₪{dept.remaining.toLocaleString()}</div>
                      </div>
                    </div>
                    {dept.utilization >= 80 && (
                      <div className="mt-2 text-center">{alertBadge(dept.utilization)}</div>
                    )}
                  </div>
                ))}
              </div>
              {departmentSummary.length === 0 && <p className="text-muted-foreground text-center py-12">אין נתונים לפי מחלקות</p>}
            </motion.div>
          )}

          {viewMode === "alerts" && (
            <motion.div key="alerts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
                  <AlertTriangle className="text-red-400 mx-auto mb-1" size={24} />
                  <div className="text-lg sm:text-2xl font-bold text-red-400">{alertBudgets.filter(b => b.pct >= 100).length}</div>
                  <div className="text-sm text-muted-foreground">חריגה (100%+)</div>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
                  <AlertTriangle className="text-amber-400 mx-auto mb-1" size={24} />
                  <div className="text-lg sm:text-2xl font-bold text-amber-400">{alertBudgets.filter(b => b.pct >= 90 && b.pct < 100).length}</div>
                  <div className="text-sm text-muted-foreground">קריטי (90-100%)</div>
                </div>
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-center">
                  <AlertTriangle className="text-yellow-400 mx-auto mb-1" size={24} />
                  <div className="text-lg sm:text-2xl font-bold text-yellow-400">{alertBudgets.filter(b => b.pct >= 80 && b.pct < 90).length}</div>
                  <div className="text-sm text-muted-foreground">אזהרה (80-90%)</div>
                </div>
              </div>

              <div className="bg-muted/40 border border-border/50 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/60">
                      <th className="text-right py-3 px-3 text-muted-foreground font-medium">תקציב</th>
                      <th className="text-right py-3 px-3 text-muted-foreground font-medium">מחלקה</th>
                      <th className="text-center py-3 px-3 text-muted-foreground font-medium">תקציב</th>
                      <th className="text-center py-3 px-3 text-muted-foreground font-medium">ביצוע</th>
                      <th className="text-center py-3 px-3 text-muted-foreground font-medium">ניצול</th>
                      <th className="text-center py-3 px-3 text-muted-foreground font-medium">חריגה</th>
                      <th className="text-center py-3 px-3 text-muted-foreground font-medium">רמה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertBudgets.map(b => {
                      const budgeted = parseFloat(b.budgetedAmount || "0");
                      const actual = parseFloat(b.actualAmount || "0");
                      const over = actual - budgeted;
                      return (
                        <tr key={b.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedBudget(b)}>
                          <td className="py-3 px-3">
                            <div className="font-medium">{b.budgetName}</div>
                            {b.budgetNumber && <div className="text-xs text-muted-foreground font-mono">{b.budgetNumber}</div>}
                          </td>
                          <td className="py-3 px-3 text-gray-300">{b.department || "—"}</td>
                          <td className="py-3 px-3 text-center text-blue-400">₪{budgeted.toLocaleString()}</td>
                          <td className="py-3 px-3 text-center">₪{actual.toLocaleString()}</td>
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                <div className={`h-full ${utilizationBg(b.pct)} rounded-full`} style={{ width: `${Math.min(b.pct, 100)}%` }} />
                              </div>
                              <span className={`text-xs font-bold ${utilizationColor(b.pct)}`}>{b.pct.toFixed(0)}%</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            {over > 0 ? <span className="text-red-400 font-bold">₪{over.toLocaleString()}</span> : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-3 px-3 text-center">{alertBadge(b.pct)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {alertBudgets.length === 0 && <p className="text-muted-foreground text-center py-8">אין התראות — כל התקציבים תקינים</p>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Detail Modal */}
        <AnimatePresence>
          {selectedBudget && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setSelectedBudget(null)}>
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="bg-background border border-border rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
                {(() => {
                  const b = selectedBudget;
                  const budgeted = parseFloat(b.budgetedAmount || "0");
                  const actual = parseFloat(b.actualAmount || "0");
                  const committed = parseFloat(b.committedAmount || "0");
                  const forecast = parseFloat(b.forecastAmount || "0");
                  const pct = budgeted > 0 ? (actual / budgeted * 100) : 0;
                  const remaining = budgeted - actual - committed;
                  return (
                    <>
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-bold flex items-center gap-2">
                          <DollarSign className="text-emerald-400" size={22} />
                          {b.budgetName}
                        </h3>
                        <button onClick={() => setSelectedBudget(null)} className="p-2 hover:bg-muted rounded-lg"><X size={20} /></button>
                      </div>

                      <div className="flex border-b border-border mb-6">
                        {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                          <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-emerald-500 text-emerald-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                        ))}
                      </div>

                      {detailTab === "details" && (<>
                      {/* Utilization Bar */}
                      <div className="mb-6">
                        <div className="relative h-6 bg-muted/50 rounded-full overflow-hidden mb-1">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(pct, 100)}%` }} transition={{ duration: 0.8 }}
                            className={`h-full ${utilizationBg(pct)} rounded-full`} />
                          <div className="absolute top-0 bottom-0 border-l-2 border-amber-400/50 border-dashed" style={{ left: "80%" }} />
                          <div className="absolute top-0 bottom-0 border-l-2 border-red-400/50 border-dashed" style={{ left: "90%" }} />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>0%</span>
                          <span className={`font-bold ${utilizationColor(pct)}`}>{pct.toFixed(1)}% ניצול</span>
                          <span>100%</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-center">
                          <div className="text-xs text-muted-foreground">תקציב</div>
                          <div className="font-bold text-blue-400">₪{budgeted.toLocaleString()}</div>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3 text-center">
                          <div className="text-xs text-muted-foreground">ביצוע</div>
                          <div className="font-bold">₪{actual.toLocaleString()}</div>
                        </div>
                        <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 text-center">
                          <div className="text-xs text-muted-foreground">מחויב</div>
                          <div className="font-bold text-purple-400">₪{committed.toLocaleString()}</div>
                        </div>
                        <div className={`${remaining >= 0 ? "bg-green-500/10 border-green-500/20" : "bg-red-500/10 border-red-500/20"} border rounded-lg p-3 text-center`}>
                          <div className="text-xs text-muted-foreground">נותר</div>
                          <div className={`font-bold ${remaining >= 0 ? "text-green-400" : "text-red-400"}`}>₪{remaining.toLocaleString()}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4 text-sm">
                        <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">סטטוס:</span> <span className={`mr-2 px-2 py-0.5 rounded-full text-xs border ${statusColor(b.status)}`}>{b.status}</span></div>
                        <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">סוג:</span> <span className="font-medium mr-2">{b.budgetType}</span></div>
                        <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">קטגוריה:</span> <span className="font-medium mr-2">{b.category}</span></div>
                        <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">מחלקה:</span> <span className="font-medium mr-2">{b.department || "—"}</span></div>
                        <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">שנה:</span> <span className="font-medium mr-2">{b.fiscalYear}</span> {b.fiscalMonth && <span className="text-xs">({MONTHS[b.fiscalMonth - 1]})</span>}</div>
                        <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">עדיפות:</span> <span className={`font-medium mr-2 ${priorityColor(b.priority)}`}>{b.priority || "רגילה"}</span></div>
                      </div>

                      {forecast > 0 && (
                        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-3 mb-4">
                          <div className="flex items-center gap-2">
                            <TrendingUp size={16} className="text-cyan-400" />
                            <span className="text-sm text-muted-foreground">תחזית:</span>
                            <span className="font-bold text-cyan-400">₪{forecast.toLocaleString()}</span>
                            {forecast > budgeted && <span className="text-xs text-red-400 mr-2">חריגה צפויה: ₪{(forecast - budgeted).toLocaleString()}</span>}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4 text-sm">
                        <div className="bg-muted/50 rounded-lg p-2 text-center">
                          <div className="text-xs text-muted-foreground">התראה 80%</div>
                          <div className={b.alertThreshold80 ? "text-amber-400" : "text-muted-foreground"}>{b.alertThreshold80 ? "פעיל" : "כבוי"}</div>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-2 text-center">
                          <div className="text-xs text-muted-foreground">התראה 90%</div>
                          <div className={b.alertThreshold90 ? "text-red-400" : "text-muted-foreground"}>{b.alertThreshold90 ? "פעיל" : "כבוי"}</div>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-2 text-center">
                          <div className="text-xs text-muted-foreground">התראה 100%</div>
                          <div className={b.alertThreshold100 ? "text-red-400" : "text-muted-foreground"}>{b.alertThreshold100 ? "פעיל" : "כבוי"}</div>
                        </div>
                      </div>

                      {(b.approvedBy || b.responsiblePerson) && (
                        <div className="bg-muted/40 rounded-lg p-3 mb-4 text-sm">
                          {b.approvedBy && <div><span className="text-muted-foreground">אושר ע\"י:</span> <span className="mr-2">{b.approvedBy}</span> {b.approvedDate && <span className="text-muted-foreground">({b.approvedDate})</span>}</div>}
                          {b.responsiblePerson && <div><span className="text-muted-foreground">אחראי:</span> <span className="mr-2">{b.responsiblePerson}</span></div>}
                        </div>
                      )}

                      {b.notes && (
                        <div className="bg-muted/40 rounded-lg p-3">
                          <div className="text-xs text-muted-foreground mb-1">הערות</div>
                          <p className="text-sm">{b.notes}</p>
                        </div>
                      )}
                      </>)}

                      {detailTab === "related" && (
                        <RelatedRecords entityType="budgets" entityId={b.id} relations={[
                          { key: "purchase-orders", label: "הזמנות רכש", endpoint: "/api/purchase-orders" },
                        ]} />
                      )}
                      {detailTab === "docs" && (
                        <AttachmentsSection entityType="budgets" entityId={b.id} />
                      )}
                      {detailTab === "history" && (
                        <ActivityLog entityType="budgets" entityId={b.id} />
                      )}
                    </>
                  );
                })()}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form Modal */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="bg-background border border-border rounded-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold">{editingBudget ? `עריכת תקציב` : "תקציב חדש"}</h3>
                  <button onClick={() => setShowForm(false)} className="p-2 hover:bg-muted rounded-lg"><X size={20} /></button>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <label className="text-xs text-muted-foreground mb-1 block">שם תקציב *</label>
                      <input value={form.budgetName} onChange={e => setForm({ ...form, budgetName: e.target.value })} placeholder="שם התקציב"
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-emerald-500/50 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">סוג</label>
                      <select value={form.budgetType} onChange={e => setForm({ ...form, budgetType: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-emerald-500/50 focus:outline-none">
                        {BUDGET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">שנת תקציב *</label>
                      <input type="number" value={form.fiscalYear} onChange={e => setForm({ ...form, fiscalYear: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-emerald-500/50 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">חודש (אופציונלי)</label>
                      <select value={form.fiscalMonth} onChange={e => setForm({ ...form, fiscalMonth: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-emerald-500/50 focus:outline-none">
                        <option value="">שנתי</option>
                        {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">קטגוריה *</label>
                      <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-emerald-500/50 focus:outline-none">
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">מחלקה</label>
                      <select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-emerald-500/50 focus:outline-none">
                        <option value="">בחר...</option>
                        {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Financial */}
                  <div className="bg-muted/40 rounded-xl p-4 border border-border/50">
                    <h4 className="font-bold text-sm mb-3 flex items-center gap-2"><DollarSign className="text-emerald-400" size={16} /> סכומים</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">סכום תקציב (₪) *</label>
                        <input type="number" value={form.budgetedAmount} onChange={e => setForm({ ...form, budgetedAmount: e.target.value })}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-emerald-500/50 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">ביצוע בפועל (₪)</label>
                        <input type="number" value={form.actualAmount} onChange={e => setForm({ ...form, actualAmount: e.target.value })}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-emerald-500/50 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">מחויב (₪)</label>
                        <input type="number" value={form.committedAmount} onChange={e => setForm({ ...form, committedAmount: e.target.value })}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-emerald-500/50 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">תחזית (₪)</label>
                        <input type="number" value={form.forecastAmount} onChange={e => setForm({ ...form, forecastAmount: e.target.value })}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-emerald-500/50 focus:outline-none" />
                      </div>
                    </div>
                  </div>

                  {/* Alerts */}
                  <div className="bg-muted/40 rounded-xl p-4 border border-border/50">
                    <h4 className="font-bold text-sm mb-3 flex items-center gap-2"><AlertTriangle className="text-amber-400" size={16} /> סף התראות</h4>
                    <div className="flex gap-6">
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.alertThreshold80} onChange={e => setForm({ ...form, alertThreshold80: e.target.checked })} /> התראה ב-80%</label>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.alertThreshold90} onChange={e => setForm({ ...form, alertThreshold90: e.target.checked })} /> התראה ב-90%</label>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.alertThreshold100} onChange={e => setForm({ ...form, alertThreshold100: e.target.checked })} /> התראה ב-100%</label>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">סטטוס</label>
                      <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-emerald-500/50 focus:outline-none">
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">עדיפות</label>
                      <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-emerald-500/50 focus:outline-none">
                        {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">אחראי</label>
                      <input value={form.responsiblePerson} onChange={e => setForm({ ...form, responsiblePerson: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-emerald-500/50 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">אישר</label>
                      <input value={form.approvedBy} onChange={e => setForm({ ...form, approvedBy: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-emerald-500/50 focus:outline-none" />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">הערות</label>
                    <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                      className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-emerald-500/50 focus:outline-none resize-none" />
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-border rounded-lg text-gray-300 hover:bg-muted transition-colors">ביטול</button>
                    <button onClick={handleSubmit} disabled={saveMutation.isPending || !form.budgetName || !form.budgetedAmount}
                      className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-muted disabled:text-muted-foreground rounded-lg font-medium transition-colors">
                      <Save size={16} /> {saveMutation.isPending ? "שומר..." : editingBudget ? "עדכון" : "שמירה"}
                    </button>
                  </div>
                  {saveMutation.isError && <p className="text-red-400 text-sm text-center">{(saveMutation.error as Error).message}</p>}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
