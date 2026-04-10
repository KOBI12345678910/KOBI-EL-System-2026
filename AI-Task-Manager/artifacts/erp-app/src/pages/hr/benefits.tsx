import { useState, useEffect, useMemo } from "react";
import {
  Heart, Search, Plus, Edit2, Trash2, X, Save, Hash, CheckCircle2,
  Clock, AlertTriangle, ArrowUpDown, Users, DollarSign, Shield, Building2,
  Download, Printer, Send, Eye, ChevronLeft, TrendingUp, Percent,
  FileText, Calendar, Filter, BarChart3, UserPlus
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
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
import StatusTransition from "@/components/status-transition";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtCurrency = (v: any) => "₪" + Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const token = () => localStorage.getItem("erp_token") || "";
const headers = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });

interface BenefitPlan {
  id: number; plan_number: string; plan_name: string; plan_type: string; description: string;
  provider_name: string; provider_contact: string; employer_contribution: number; employee_contribution: number;
  currency: string; coverage_details: string; eligibility_criteria: string; waiting_period_days: number;
  is_mandatory: boolean; effective_date: string; expiry_date: string; renewal_date: string;
  max_participants: number; current_participants: number; status: string; notes: string;
}

interface EmployeeBenefit {
  id: number; enrollment_number: string; employee_name: string; department: string;
  plan_id: number; plan_name: string; plan_type: string; provider_name: string;
  enrollment_date: string; effective_date: string; end_date: string;
  employer_cost: number; employee_cost: number; coverage_level: string;
  dependents_count: number; status: string; notes: string;
}

const planTypeMap: Record<string, { label: string; color: string; icon: string }> = {
  health: { label: "בריאות", color: "bg-red-500/20 text-red-400", icon: "+" },
  pension: { label: "פנסיה", color: "bg-blue-500/20 text-blue-400", icon: "₪" },
  insurance: { label: "ביטוח", color: "bg-purple-500/20 text-purple-400", icon: "🛡" },
  education: { label: "השתלמות", color: "bg-green-500/20 text-green-400", icon: "📚" },
  wellness: { label: "רווחה", color: "bg-pink-500/20 text-pink-400", icon: "💪" },
  transportation: { label: "נסיעות", color: "bg-orange-500/20 text-orange-400", icon: "🚗" },
  meals: { label: "ארוחות", color: "bg-amber-500/20 text-amber-400", icon: "🍽" },
  childcare: { label: "מעון", color: "bg-cyan-500/20 text-cyan-400", icon: "👶" },
  other: { label: "אחר", color: "bg-muted/20 text-muted-foreground", icon: "📋" },
};

const statusMap: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  inactive: { label: "לא פעיל", color: "bg-muted/20 text-muted-foreground" },
  draft: { label: "טיוטה", color: "bg-yellow-500/20 text-yellow-400" },
  archived: { label: "ארכיון", color: "bg-muted/20 text-muted-foreground" },
};

const enrollStatusMap: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  pending: { label: "ממתין", color: "bg-yellow-500/20 text-yellow-400" },
  cancelled: { label: "בוטל", color: "bg-red-500/20 text-red-400" },
  expired: { label: "פג תוקף", color: "bg-muted/20 text-muted-foreground" },
};

const coverageLevelMap: Record<string, string> = {
  individual: "אישי", couple: "זוגי", family: "משפחתי", parent_child: "הורה+ילד"
};


const exportToExcel: any[] = [];
export default function BenefitsPage() {
  const [tab, setTab] = useState<"plans" | "enrollments" | "analytics">("plans");
  const [plans, setPlans] = useState<BenefitPlan[]>([]);
  const [enrollments, setEnrollments] = useState<EmployeeBenefit[]>([]);
  const [planStats, setPlanStats] = useState<any>({});
  const [enrollStats, setEnrollStats] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [formMode, setFormMode] = useState<"plan" | "enrollment">("plan");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const bulk = useBulkSelection();
  const formValidation = useFormValidation({
    plan_name: [{ type: "required", message: "שם תוכנית נדרש" }],
    plan_type: [{ type: "required", message: "סוג תוכנית נדרש" }],
    provider_name: [{ type: "required", message: "שם ספק נדרש" }],
  });
  const [tableLoading, setTableLoading] = useState(true);
  const pagination = useSmartPagination(25);
  const { executeSave, executeDelete, execute, loading: actionLoading } = useApiAction();

  const load = () => {
    setTableLoading(true);
    const h = headers();
    Promise.all([
      authFetch(`${API}/benefit-plans`, { headers: h }).then(r => r.json()).then(d => setPlans(safeArray(d))).catch(() => {}),
      authFetch(`${API}/benefit-plans/stats`, { headers: h }).then(r => r.json()).then(d => setPlanStats(d || {})).catch(() => {}),
      authFetch(`${API}/employee-benefits`, { headers: h }).then(r => r.json()).then(d => setEnrollments(safeArray(d))).catch(() => {}),
      authFetch(`${API}/employee-benefits/stats`, { headers: h }).then(r => r.json()).then(d => setEnrollStats(d || {})).catch(() => {})
    ]).finally(() => setTableLoading(false));
  };
  useEffect(load, []);

  const filteredPlans = useMemo(() => {
    let f = plans.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (filterType === "all" || i.plan_type === filterType) &&
      (!search || i.plan_number?.toLowerCase().includes(search.toLowerCase()) ||
        i.plan_name?.toLowerCase().includes(search.toLowerCase()) ||
        i.provider_name?.toLowerCase().includes(search.toLowerCase()))
    );
    f.sort((a: any, b: any) => {
      const av = a[sortField], bv = b[sortField];
      const cmp = typeof av === "number" ? av - bv : String(av || "").localeCompare(String(bv || ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return f;
  }, [plans, search, filterStatus, filterType, sortField, sortDir]);

  const filteredEnrollments = useMemo(() => {
    let f = enrollments.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (filterType === "all" || i.plan_type === filterType) &&
      (!search || i.enrollment_number?.toLowerCase().includes(search.toLowerCase()) ||
        i.employee_name?.toLowerCase().includes(search.toLowerCase()) ||
        i.plan_name?.toLowerCase().includes(search.toLowerCase()))
    );
    f.sort((a: any, b: any) => {
      const av = a[sortField], bv = b[sortField];
      const cmp = typeof av === "number" ? av - bv : String(av || "").localeCompare(String(bv || ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return f;
  }, [enrollments, search, filterStatus, filterType, sortField, sortDir]);

  const openCreatePlan = () => {
    setFormMode("plan"); setEditing(null);
    setForm({ planType: "health", status: "draft", currency: "ILS", employerContribution: 0, employeeContribution: 0, waitingPeriodDays: 0, isMandatory: false, currentParticipants: 0 });
    setShowForm(true);
  };

  const openEditPlan = (r: BenefitPlan) => {
    setFormMode("plan"); setEditing(r);
    setForm({
      planName: r.plan_name, planType: r.plan_type, description: r.description,
      providerName: r.provider_name, providerContact: r.provider_contact,
      employerContribution: r.employer_contribution, employeeContribution: r.employee_contribution,
      currency: r.currency, coverageDetails: r.coverage_details, eligibilityCriteria: r.eligibility_criteria,
      waitingPeriodDays: r.waiting_period_days, isMandatory: r.is_mandatory,
      effectiveDate: r.effective_date?.slice(0, 10), expiryDate: r.expiry_date?.slice(0, 10),
      renewalDate: r.renewal_date?.slice(0, 10), maxParticipants: r.max_participants,
      currentParticipants: r.current_participants, status: r.status, notes: r.notes
    });
    setShowForm(true);
  };

  const openCreateEnrollment = () => {
    setFormMode("enrollment"); setEditing(null);
    setForm({ enrollmentDate: new Date().toISOString().slice(0, 10), coverageLevel: "individual", status: "pending", employerCost: 0, employeeCost: 0, dependentsCount: 0 });
    setShowForm(true);
  };

  const openEditEnrollment = (r: EmployeeBenefit) => {
    setFormMode("enrollment"); setEditing(r);
    setForm({
      employeeName: r.employee_name, department: r.department, planId: r.plan_id,
      enrollmentDate: r.enrollment_date?.slice(0, 10), effectiveDate: r.effective_date?.slice(0, 10),
      endDate: r.end_date?.slice(0, 10), employerCost: r.employer_cost, employeeCost: r.employee_cost,
      coverageLevel: r.coverage_level, dependentsCount: r.dependents_count, status: r.status, notes: r.notes
    });
    setShowForm(true);
  };

  const save = async () => { const isPlan = formMode === "plan"; const base = isPlan ? "benefit-plans" : "employee-benefits"; const url = editing ? `${API}/${base}/${editing.id}` : `${API}/${base}`; await executeSave(url, editing ? "PUT" : "POST", form, editing ? "עודכן בהצלחה" : "נוצר בהצלחה", () => { setShowForm(false); load(); }, headers()); };

  const removePlan = async (id: number) => { await executeDelete(`${API}/benefit-plans/${id}`, "למחוק תוכנית הטבה?", () => { load(); }, headers()); };

  const removeEnrollment = async (id: number) => { await executeDelete(`${API}/employee-benefits/${id}`, "למחוק רישום הטבה?", () => { load(); }, headers()); };

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };

  const currentItems = tab === "plans" ? filteredPlans : filteredEnrollments;

  const totalEmployerCost = useMemo(() => {
    return enrollments.filter(e => e.status === "active").reduce((sum, e) => sum + (e.employer_cost || 0), 0);
  }, [enrollments]);

  const totalEmployeeCost = useMemo(() => {
    return enrollments.filter(e => e.status === "active").reduce((sum, e) => sum + (e.employee_cost || 0), 0);
  }, [enrollments]);

  const typeBreakdown = useMemo(() => {
    const map: Record<string, { count: number; cost: number }> = {};
    plans.forEach(p => {
      const type = p.plan_type || "other";
      if (!map[type]) map[type] = { count: 0, cost: 0 };
      map[type].count++;
      map[type].cost += (p.employer_contribution || 0);
    });
    return Object.entries(map).sort((a, b) => b[1].cost - a[1].cost);
  }, [plans]);

  const kpis = [
    { label: "תוכניות פעילות", value: fmt(planStats.active || 0), icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10" },
    { label: "סה\"כ תוכניות", value: fmt(planStats.total || 0), icon: Hash, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "עובדים מבוטחים", value: fmt(enrollStats.enrolled_employees || 0), icon: Users, color: "text-indigo-400", bg: "bg-indigo-500/10" },
    { label: "רישומים פעילים", value: fmt(enrollStats.active || 0), icon: Shield, color: "text-teal-400", bg: "bg-teal-500/10" },
    { label: "ממתינים", value: fmt(enrollStats.pending || 0), icon: Clock, color: "text-yellow-400", bg: "bg-yellow-500/10" },
    { label: "עלות מעסיק חודשית", value: fmtCurrency(totalEmployerCost), icon: DollarSign, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "ספקים", value: fmt(planStats.providers_count || 0), icon: Building2, color: "text-orange-400", bg: "bg-orange-500/10" },
    { label: "חובה", value: fmt(planStats.mandatory_count || 0), icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
  ];

  const exportData = () => {
    exportToExcel(currentItems as any[], tab === "plans" ? {
      plan_number: "מספר", plan_name: "שם", plan_type: "סוג", provider_name: "ספק",
      employer_contribution: "עלות מעסיק", status: "סטטוס"
    } : {
      enrollment_number: "מספר", employee_name: "עובד", plan_name: "תוכנית",
      employer_cost: "עלות מעסיק", status: "סטטוס"
    }, tab === "plans" ? "benefit_plans" : "employee_benefits");
  };

  const inputCls = "w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";
  const labelCls = "block text-sm font-medium text-muted-foreground mb-1";

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/hr" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
          משאבי אנוש
        </Link>
        <span>/</span>
        <span className="text-foreground">ניהול הטבות</span>
      </div>

      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-3">
            <Heart className="w-7 h-7 text-rose-400" />
            ניהול הטבות
          </h1>
          <p className="text-muted-foreground mt-1">תוכניות הטבות, ביטוחים, פנסיה, רווחה ורישום עובדים</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportData} className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border rounded-xl text-sm hover:border-primary/50 transition-colors">
            <Download className="w-4 h-4" /> ייצוא
          </button>
          <button onClick={() => printPage("ניהול הטבות - טכנו-כל עוזי")} className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border rounded-xl text-sm hover:border-primary/50 transition-colors">
            <Printer className="w-4 h-4" /> הדפסה
          </button>
          <button onClick={() => sendByEmail("ניהול הטבות - טכנו-כל עוזי", generateEmailBody("הטבות", currentItems as any[], tab === "plans" ? { plan_number: "מספר", plan_name: "שם", plan_type: "סוג", status: "סטטוס" } : { enrollment_number: "מספר", employee_name: "עובד", plan_name: "תוכנית", status: "סטטוס" }))} className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border rounded-xl text-sm hover:border-primary/50 transition-colors">
            <Send className="w-4 h-4" /> שליחה
          </button>
          {tab === "plans" ? (
            <button onClick={openCreatePlan} className="flex items-center gap-2 bg-rose-600 text-foreground px-4 py-2 rounded-xl hover:bg-rose-700 shadow-lg text-sm font-medium">
              <Plus className="w-4 h-4" /> תוכנית חדשה
            </button>
          ) : tab === "enrollments" ? (
            <button onClick={openCreateEnrollment} className="flex items-center gap-2 bg-rose-600 text-foreground px-4 py-2 rounded-xl hover:bg-rose-700 shadow-lg text-sm font-medium">
              <UserPlus className="w-4 h-4" /> רישום עובד
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className={`${kpi.bg} rounded-xl border border-border/50 p-3`}
          >
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-1.5`} />
            <div className="text-lg font-bold text-foreground">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-1 p-1 bg-card border border-border/50 rounded-xl w-fit">
        {[
          { key: "plans" as const, label: "תוכניות הטבות", count: plans.length, icon: FileText },
          { key: "enrollments" as const, label: "רישום עובדים", count: enrollments.length, icon: Users },
          { key: "analytics" as const, label: "ניתוח ותובנות", count: null, icon: BarChart3 },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setFilterStatus("all"); setFilterType("all"); setSearch(""); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            {t.count !== null && (
              <span className={`px-1.5 py-0.5 rounded-md text-xs ${tab === t.key ? "bg-primary/30" : "bg-muted"}`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {tab !== "analytics" && (
        <div className="flex gap-3 flex-wrap items-center">
          <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
            <option value="all">כל הסטטוסים</option>
            {Object.entries(tab === "plans" ? statusMap : enrollStatusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
            <option value="all">כל הסוגים</option>
            {Object.entries(planTypeMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <span className="text-sm text-muted-foreground">
            {tab === "plans" ? filteredPlans.length : filteredEnrollments.length} תוצאות
          </span>
        </div>
      )}

      <BulkActions selectedIds={bulk.selectedIds} onClear={bulk.clearAll} entityName="הטבות" actions={defaultBulkActions} />

      {tab === "plans" && (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50">
              <tr>
                <th className="px-2 py-3 w-10"><BulkCheckbox checked={bulk.isAllSelected(filteredPlans)} indeterminate={bulk.isSomeSelected(filteredPlans)} onChange={() => bulk.toggleAll(filteredPlans)} /></th>
                {[
                  { key: "plan_number", label: "מספר" },
                  { key: "plan_name", label: "שם תוכנית" },
                  { key: "plan_type", label: "סוג" },
                  { key: "provider_name", label: "ספק" },
                  { key: "employer_contribution", label: "עלות מעסיק" },
                  { key: "employee_contribution", label: "עלות עובד" },
                  { key: "current_participants", label: "משתתפים" },
                  { key: "effective_date", label: "תוקף מ-" },
                  { key: "status", label: "סטטוס" },
                ].map(col => (
                  <th key={col.key} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => toggleSort(col.key)}>
                    <div className="flex items-center gap-1">
                      {col.label}
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlans.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-12 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>אין תוכניות הטבות</p>
                </td></tr>
              ) : pagination.paginate(filteredPlans).map(r => (
                <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                  <td className="px-2 py-3"><BulkCheckbox checked={bulk.isSelected(r.id)} onChange={() => bulk.toggle(r.id)} /></td>
                  <td className="px-4 py-3 font-mono text-xs text-rose-400 font-bold">{r.plan_number}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{r.plan_name}</div>
                    {r.description && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{r.description}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={`text-[10px] ${planTypeMap[r.plan_type]?.color || "bg-muted/20 text-muted-foreground"}`}>
                      {planTypeMap[r.plan_type]?.label || r.plan_type}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.provider_name || "—"}</td>
                  <td className="px-4 py-3 font-bold text-foreground">{fmtCurrency(r.employer_contribution)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtCurrency(r.employee_contribution)}</td>
                  <td className="px-4 py-3">
                    <span className="text-foreground">{r.current_participants || 0}</span>
                    {r.max_participants ? <span className="text-muted-foreground">/{r.max_participants}</span> : ""}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{r.effective_date?.slice(0, 10) || "—"}</td>
                  <td className="px-4 py-3">
                    <Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>
                      {statusMap[r.status]?.label || r.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg" title="צפייה"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={() => openEditPlan(r)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכה"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                      <button onClick={() => removePlan(r.id)} className="p-1.5 hover:bg-muted rounded-lg" title="מחיקה"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <SmartPagination pagination={pagination} />
      </>)}

      {tab === "enrollments" && (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50">
              <tr>
                <th className="px-2 py-3 w-10"><BulkCheckbox checked={bulk.isAllSelected(filteredEnrollments)} indeterminate={bulk.isSomeSelected(filteredEnrollments)} onChange={() => bulk.toggleAll(filteredEnrollments)} /></th>
                {[
                  { key: "enrollment_number", label: "מספר" },
                  { key: "employee_name", label: "עובד" },
                  { key: "department", label: "מחלקה" },
                  { key: "plan_name", label: "תוכנית" },
                  { key: "plan_type", label: "סוג" },
                  { key: "coverage_level", label: "כיסוי" },
                  { key: "employer_cost", label: "עלות מעסיק" },
                  { key: "enrollment_date", label: "תאריך רישום" },
                  { key: "status", label: "סטטוס" },
                ].map(col => (
                  <th key={col.key} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => toggleSort(col.key)}>
                    <div className="flex items-center gap-1">
                      {col.label}
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filteredEnrollments.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-12 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>אין רישומי הטבות</p>
                </td></tr>
              ) : pagination.paginate(filteredEnrollments).map(r => (
                <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                  <td className="px-2 py-3"><BulkCheckbox checked={bulk.isSelected(r.id)} onChange={() => bulk.toggle(r.id)} /></td>
                  <td className="px-4 py-3 font-mono text-xs text-rose-400 font-bold">{r.enrollment_number}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {(r.employee_name || "?").charAt(0)}
                      </div>
                      <span className="font-medium text-foreground">{r.employee_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.department || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.plan_name || "—"}</td>
                  <td className="px-4 py-3">
                    <Badge className={`text-[10px] ${planTypeMap[r.plan_type]?.color || "bg-muted/20 text-muted-foreground"}`}>
                      {planTypeMap[r.plan_type]?.label || r.plan_type || "—"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{coverageLevelMap[r.coverage_level] || r.coverage_level}</td>
                  <td className="px-4 py-3 font-bold text-foreground">{fmtCurrency(r.employer_cost)}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{r.enrollment_date?.slice(0, 10)}</td>
                  <td className="px-4 py-3">
                    <Badge className={`text-[10px] ${enrollStatusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>
                      {enrollStatusMap[r.status]?.label || r.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg" title="צפייה"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={() => openEditEnrollment(r)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכה"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                      <button onClick={() => removeEnrollment(r.id)} className="p-1.5 hover:bg-muted rounded-lg" title="מחיקה"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <SmartPagination pagination={pagination} />
      </>)}

      {tab === "analytics" && (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-card border border-border/50 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
                <DollarSign className="w-4 h-4 text-purple-400" /> סיכום עלויות חודשי
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-border/20">
                  <span className="text-sm text-muted-foreground">עלות מעסיק כוללת</span>
                  <span className="text-lg font-bold text-foreground">{fmtCurrency(totalEmployerCost)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/20">
                  <span className="text-sm text-muted-foreground">עלות עובדים כוללת</span>
                  <span className="text-lg font-bold text-foreground">{fmtCurrency(totalEmployeeCost)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/20">
                  <span className="text-sm text-muted-foreground">עלות כוללת</span>
                  <span className="text-lg font-bold text-rose-400">{fmtCurrency(totalEmployerCost + totalEmployeeCost)}</span>
                </div>
                {enrollments.filter(e => e.status === "active").length > 0 && (
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground">ממוצע לעובד</span>
                    <span className="text-lg font-bold text-foreground">
                      {fmtCurrency(totalEmployerCost / enrollments.filter(e => e.status === "active").length)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-card border border-border/50 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-blue-400" /> פילוח לפי סוג
              </h3>
              <div className="space-y-2">
                {typeBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">אין נתונים</p>
                ) : typeBreakdown.map(([type, data]) => {
                  const maxCost = Math.max(...typeBreakdown.map(([, d]) => d.cost), 1);
                  const pct = (data.cost / maxCost) * 100;
                  return (
                    <div key={type}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">{planTypeMap[type]?.label || type}</span>
                        <span className="text-foreground font-medium">{data.count} תוכניות | {fmtCurrency(data.cost)}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-card border border-border/50 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-green-400" /> מדדים עיקריים
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-border/20">
                  <span className="text-sm text-muted-foreground">שיעור השתתפות</span>
                  <span className="text-lg font-bold text-green-400">
                    {plans.length > 0 ? Math.round((enrollments.filter(e => e.status === "active").length / Math.max(plans.reduce((s, p) => s + (p.max_participants || 50), 0), 1)) * 100) : 0}%
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/20">
                  <span className="text-sm text-muted-foreground">תוכניות חובה</span>
                  <span className="text-lg font-bold text-foreground">{plans.filter(p => p.is_mandatory).length}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/20">
                  <span className="text-sm text-muted-foreground">ממתינים לאישור</span>
                  <span className="text-lg font-bold text-yellow-400">{enrollments.filter(e => e.status === "pending").length}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-muted-foreground">פג תוקף</span>
                  <span className="text-lg font-bold text-red-400">{enrollments.filter(e => e.status === "expired").length}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border/50 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-teal-400" /> סיכום ספקים
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {(() => {
                const providers: Record<string, { count: number; cost: number; types: string[] }> = {};
                plans.filter(p => p.provider_name).forEach(p => {
                  if (!providers[p.provider_name]) providers[p.provider_name] = { count: 0, cost: 0, types: [] };
                  providers[p.provider_name].count++;
                  providers[p.provider_name].cost += (p.employer_contribution || 0);
                  if (!providers[p.provider_name].types.includes(p.plan_type)) providers[p.provider_name].types.push(p.plan_type);
                });
                return Object.entries(providers).sort((a, b) => b[1].cost - a[1].cost).map(([name, data]) => (
                  <div key={name} className="bg-muted/30 rounded-xl p-3 border border-border/30">
                    <div className="font-medium text-foreground text-sm">{name}</div>
                    <div className="text-xs text-muted-foreground mt-1">{data.count} תוכניות</div>
                    <div className="text-sm font-bold text-purple-400 mt-1">{fmtCurrency(data.cost)}</div>
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {data.types.map(t => (
                        <Badge key={t} className={`text-[9px] ${planTypeMap[t]?.color || "bg-muted/20 text-muted-foreground"}`}>
                          {planTypeMap[t]?.label || t}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ));
              })()}
              {plans.filter(p => p.provider_name).length === 0 && (
                <p className="text-sm text-muted-foreground col-span-full">אין ספקים רשומים</p>
              )}
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center p-5 border-b border-border">
                <h2 className="text-lg font-bold text-foreground">
                  {viewDetail.plan_name || viewDetail.employee_name || "פרטים"}
                </h2>
                <button onClick={() => setViewDetail(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && <div className="p-5 space-y-3">
                {Object.entries(viewDetail).filter(([k]) => !["id", "created_at", "updated_at"].includes(k)).map(([key, val]) => (
                  <div key={key} className="flex justify-between py-1.5 border-b border-border/20">
                    <span className="text-sm text-muted-foreground">{key.replace(/_/g, " ")}</span>
                    <span className="text-sm text-foreground max-w-[60%] text-left truncate">{String(val ?? "—")}</span>
                  </div>
                ))}
              </div>}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="benefits" entityId={viewDetail.id} relations={[{key:"employees",label:"עובדים",icon:"Users"},{key:"plans",label:"תוכניות",icon:"Heart"}]} /></div>}
              {detailTab === "docs" && <div className="p-5"><AttachmentsSection entityType="benefits" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="benefits" entityId={viewDetail.id} /></div>}
            </motion.div>
          </motion.div>
        )}

        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-foreground">
                  {editing ? "עריכה" : formMode === "plan" ? "תוכנית הטבה חדשה" : "רישום עובד להטבה"}
                </h2>
                <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>

              {formMode === "plan" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className={labelCls}>שם תוכנית *</label><input value={form.planName || ""} onChange={e => setForm({ ...form, planName: e.target.value })} className={inputCls} /></div>
                  <div><label className={labelCls}>סוג תוכנית *</label><select value={form.planType || "health"} onChange={e => setForm({ ...form, planType: e.target.value })} className={inputCls}>{Object.entries(planTypeMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                  <div><label className={labelCls}>ספק</label><input value={form.providerName || ""} onChange={e => setForm({ ...form, providerName: e.target.value })} className={inputCls} /></div>
                  <div><label className={labelCls}>איש קשר ספק</label><input value={form.providerContact || ""} onChange={e => setForm({ ...form, providerContact: e.target.value })} className={inputCls} /></div>
                  <div><label className={labelCls}>עלות מעסיק (₪)</label><input type="number" value={form.employerContribution || ""} onChange={e => setForm({ ...form, employerContribution: e.target.value })} className={inputCls} /></div>
                  <div><label className={labelCls}>עלות עובד (₪)</label><input type="number" value={form.employeeContribution || ""} onChange={e => setForm({ ...form, employeeContribution: e.target.value })} className={inputCls} /></div>
                  <div><label className={labelCls}>תוקף מ-</label><input type="date" value={form.effectiveDate || ""} onChange={e => setForm({ ...form, effectiveDate: e.target.value })} className={inputCls} /></div>
                  <div><label className={labelCls}>תוקף עד</label><input type="date" value={form.expiryDate || ""} onChange={e => setForm({ ...form, expiryDate: e.target.value })} className={inputCls} /></div>
                  <div><label className={labelCls}>תאריך חידוש</label><input type="date" value={form.renewalDate || ""} onChange={e => setForm({ ...form, renewalDate: e.target.value })} className={inputCls} /></div>
                  <div><label className={labelCls}>סטטוס</label><select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })} className={inputCls}>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                  <div><label className={labelCls}>ימי המתנה</label><input type="number" value={form.waitingPeriodDays || ""} onChange={e => setForm({ ...form, waitingPeriodDays: e.target.value })} className={inputCls} /></div>
                  <div><label className={labelCls}>מקסימום משתתפים</label><input type="number" value={form.maxParticipants || ""} onChange={e => setForm({ ...form, maxParticipants: e.target.value })} className={inputCls} /></div>
                  <div className="flex items-center gap-2 col-span-2"><input type="checkbox" checked={form.isMandatory || false} onChange={e => setForm({ ...form, isMandatory: e.target.checked })} className="rounded" /><label className="text-sm font-medium">תוכנית חובה</label></div>
                  <div className="col-span-2"><label className={labelCls}>תיאור</label><textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className={inputCls} /></div>
                  <div className="col-span-2"><label className={labelCls}>פרטי כיסוי</label><textarea value={form.coverageDetails || ""} onChange={e => setForm({ ...form, coverageDetails: e.target.value })} rows={2} className={inputCls} /></div>
                  <div className="col-span-2"><label className={labelCls}>הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className={inputCls} /></div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className={labelCls}>שם עובד *</label><input value={form.employeeName || ""} onChange={e => setForm({ ...form, employeeName: e.target.value })} className={inputCls} /></div>
                  <div><label className={labelCls}>מחלקה</label><input value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} className={inputCls} /></div>
                  <div><label className={labelCls}>תוכנית הטבה *</label><select value={form.planId || ""} onChange={e => setForm({ ...form, planId: Number(e.target.value) })} className={inputCls}><option value="">בחר תוכנית</option>{plans.filter(p => p.status === "active").map(p => <option key={p.id} value={p.id}>{p.plan_name} ({planTypeMap[p.plan_type]?.label || p.plan_type})</option>)}</select></div>
                  <div><label className={labelCls}>רמת כיסוי</label><select value={form.coverageLevel || "individual"} onChange={e => setForm({ ...form, coverageLevel: e.target.value })} className={inputCls}>{Object.entries(coverageLevelMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                  <div><label className={labelCls}>תאריך רישום *</label><input type="date" value={form.enrollmentDate || ""} onChange={e => setForm({ ...form, enrollmentDate: e.target.value })} className={inputCls} /></div>
                  <div><label className={labelCls}>תוקף מ-</label><input type="date" value={form.effectiveDate || ""} onChange={e => setForm({ ...form, effectiveDate: e.target.value })} className={inputCls} /></div>
                  <div><label className={labelCls}>עלות מעסיק (₪)</label><input type="number" value={form.employerCost || ""} onChange={e => setForm({ ...form, employerCost: e.target.value })} className={inputCls} /></div>
                  <div><label className={labelCls}>עלות עובד (₪)</label><input type="number" value={form.employeeCost || ""} onChange={e => setForm({ ...form, employeeCost: e.target.value })} className={inputCls} /></div>
                  <div><label className={labelCls}>מספר תלויים</label><input type="number" value={form.dependentsCount || ""} onChange={e => setForm({ ...form, dependentsCount: e.target.value })} className={inputCls} /></div>
                  <div><label className={labelCls}>סטטוס</label><select value={form.status || "pending"} onChange={e => setForm({ ...form, status: e.target.value })} className={inputCls}>{Object.entries(enrollStatusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                  <div className="col-span-2"><label className={labelCls}>הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className={inputCls} /></div>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button onClick={save} className="flex items-center gap-2 bg-rose-600 text-foreground px-6 py-2.5 rounded-xl hover:bg-rose-700 font-medium text-sm">
                  <Save className="w-4 h-4" /> {editing ? "עדכון" : "שמירה"}
                </button>
                <button onClick={() => setShowForm(false)} className="px-6 py-2.5 border border-border rounded-xl hover:bg-muted text-sm">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
