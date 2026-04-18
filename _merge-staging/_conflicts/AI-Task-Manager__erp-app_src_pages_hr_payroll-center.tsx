import { useState, useEffect, useMemo } from "react";
import {
  Calculator, Users, Wallet, TrendingUp, DollarSign, Clock, AlertTriangle, UserCheck,
  Hammer, Wrench, CalendarX2, Building2, ChevronDown, ChevronUp, Search, Download,
  FileText, Plus, ArrowUpDown, Briefcase, MapPin, BadgePercent, Receipt
} from "lucide-react";
import ExportDropdown from "@/components/export-dropdown";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import StatusTransition from "@/components/status-transition";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtCur = (v: any) => `₪${fmt(v)}`;
const monthNames = ["", "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const absStatusMap: Record<string, { label: string; color: string; icon: any }> = {
  absent: { label: "לא הגיע", color: "bg-red-100 text-red-700", icon: CalendarX2 },
  sick: { label: "מחלה", color: "bg-orange-100 text-orange-700", icon: AlertTriangle },
  late: { label: "איחור", color: "bg-yellow-100 text-yellow-700", icon: Clock },
  vacation: { label: "חופש", color: "bg-blue-100 text-blue-700", icon: CalendarX2 },
};
const payStatusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-muted/50 text-foreground" },
  approved: { label: "מאושר", color: "bg-green-100 text-green-700" },
  paid: { label: "שולם", color: "bg-emerald-100 text-emerald-700" },
  pending: { label: "ממתין", color: "bg-yellow-100 text-yellow-700" },
};
const workTypeMap: Record<string, string> = { production: "ייצור", installation: "התקנה", service: "שירות" };

type Tab = "overview" | "employees" | "contractors" | "attendance" | "worklog";

export default function PayrollCenterPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [dashboard, setDashboard] = useState<any>(null);
  const [empRecords, setEmpRecords] = useState<any[]>([]);
  const [contRecords, setContRecords] = useState<any[]>([]);
  const [workLogs, setWorkLogs] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [expandedEmp, setExpandedEmp] = useState<number | null>(null);
  const [expandedCont, setExpandedCont] = useState<number | null>(null);
  const [sortField, setSortField] = useState("gross_salary");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [detailTab, setDetailTab] = useState("details");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const bulk = useBulkSelection();
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = () => {
    authFetch(`${API}/payroll/dashboard?month=${month}&year=${year}`, { headers })
      .then(r => r.json()).then(d => setDashboard(d)).catch(() => setDashboard(null));
    authFetch(`${API}/payroll/employees?month=${month}&year=${year}`, { headers })
      .then(r => r.json()).then(d => setEmpRecords(Array.isArray(d) ? d : [])).catch(() => setEmpRecords([]));
    authFetch(`${API}/payroll/contractors?month=${month}&year=${year}`, { headers })
      .then(r => r.json()).then(d => setContRecords(Array.isArray(d) ? d : [])).catch(() => setContRecords([]));
    authFetch(`${API}/payroll/contractor-work-log`, { headers })
      .then(r => r.json()).then(d => setWorkLogs(Array.isArray(d) ? d : [])).catch(() => setWorkLogs([]));
  };
  useEffect(load, [month, year]);

  const d = dashboard;
  const toggleSort = (f: string) => { if (sortField === f) setSortDir(p => p === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const filteredEmp = useMemo(() => {
    let f = empRecords.filter(e =>
      !search || e.employee_name?.includes(search) || e.department?.includes(search) || e.record_number?.includes(search)
    );
    f.sort((a: any, b: any) => {
      const av = Number(a[sortField]) || 0, bv = Number(b[sortField]) || 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return f;
  }, [empRecords, search, sortField, sortDir]);

  const filteredCont = useMemo(() => {
    return contRecords.filter(c =>
      !search || c.contractor_name?.includes(search) || c.work_order_number?.includes(search) || c.description?.includes(search)
    );
  }, [contRecords, search]);

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "overview", label: "סקירה כללית", icon: TrendingUp },
    { id: "employees", label: "שכר עובדים", icon: Users },
    { id: "contractors", label: "קבלנים", icon: Hammer },
    { id: "attendance", label: "היעדרויות", icon: CalendarX2 },
    { id: "worklog", label: "יומן עבודה", icon: FileText },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><Wallet className="text-emerald-600" /> מרכז שכר — עובדים וקבלנים</h1>
          <p className="text-muted-foreground mt-1">שכר, ניכויים, נוכחות, עבודת קבלנים — נתונים מעודכנים מכל המערכת</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
            {monthNames.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <ExportDropdown data={empRecords} headers={{ employee_name: "עובד", department: "מחלקה", base_salary: "בסיס", gross_salary: "ברוטו", net_salary: "נטו", overtime_pay: 'שנ"ג', total_deductions: "ניכויים", employer_cost: "עלות מעסיק" }} filename={`payroll-${year}-${month}`} />
        </div>
      </div>

      <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? "bg-card shadow text-emerald-700" : "text-muted-foreground hover:text-foreground"}`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      <BulkActions selectedIds={bulk.selectedIds} onClear={bulk.clearAll} entityName="תלושי שכר" actions={defaultBulkActions} />
      {tab === "overview" && d && <OverviewTab d={d} month={month} year={year} />}
      {tab === "employees" && <EmployeesTab records={filteredEmp} search={search} setSearch={setSearch} sortField={sortField} toggleSort={toggleSort} sortDir={sortDir} expandedId={expandedEmp} setExpandedId={setExpandedEmp} bulk={bulk} detailTab={detailTab} setDetailTab={setDetailTab} />}
      {tab === "contractors" && <ContractorsTab records={filteredCont} search={search} setSearch={setSearch} expandedId={expandedCont} setExpandedId={setExpandedCont} month={month} year={year} bulk={bulk} detailTab={detailTab} setDetailTab={setDetailTab} />}
      {tab === "attendance" && d && <AttendanceTab absentees={d.absentees || []} attendance={d.attendance} />}
      {tab === "worklog" && <WorkLogTab logs={workLogs} />}
    </div>
  );
}

function KPI({ label, value, sub, icon: Icon, color, trend }: any) {
  return (
    <div className="bg-card rounded-xl border p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <Icon className={`w-5 h-5 ${color}`} />
        {trend && <span className={`text-xs px-2 py-0.5 rounded-full ${trend > 0 ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>{trend > 0 ? "↑" : "↓"} {Math.abs(trend)}%</span>}
      </div>
      <p className="text-lg sm:text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function OverviewTab({ d, month, year }: { d: any; month: number; year: number }) {
  const emp = d.employees || {};
  const cont = d.contractors || {};
  const att = d.attendance || {};

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-gradient-to-l from-emerald-600 to-teal-700 rounded-2xl p-6 text-foreground">
        <div className="flex items-center gap-3 mb-4">
          <Calculator className="w-8 h-8" />
          <div>
            <h2 className="text-xl font-bold">סיכום שכר — {monthNames[month]} {year}</h2>
            <p className="text-emerald-100 text-sm">עובדים + קבלנים • נתונים מעודכנים</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card/10 rounded-xl p-3">
            <p className="text-emerald-100 text-xs">סה"כ עלות משולבת</p>
            <p className="text-lg sm:text-2xl font-bold">{fmtCur(d.totalCombined)}</p>
          </div>
          <div className="bg-card/10 rounded-xl p-3">
            <p className="text-emerald-100 text-xs">ברוטו עובדים</p>
            <p className="text-lg sm:text-2xl font-bold">{fmtCur(emp.totalGross)}</p>
            <p className="text-emerald-200 text-xs">{emp.count} עובדים</p>
          </div>
          <div className="bg-card/10 rounded-xl p-3">
            <p className="text-emerald-100 text-xs">ברוטו קבלנים</p>
            <p className="text-lg sm:text-2xl font-bold">{fmtCur(cont.totalGross)}</p>
            <p className="text-emerald-200 text-xs">{cont.count} קבלנים</p>
          </div>
          <div className="bg-card/10 rounded-xl p-3">
            <p className="text-emerald-100 text-xs">עלות מעסיק</p>
            <p className="text-lg sm:text-2xl font-bold">{fmtCur(emp.employerCost)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <KPI label="נטו עובדים" value={fmtCur(emp.totalNet)} icon={Wallet} color="text-blue-600" />
        <KPI label="ממוצע ברוטו" value={fmtCur(emp.avgGross)} icon={DollarSign} color="text-indigo-600" />
        <KPI label="שעות נוספות" value={fmt(emp.overtimeHours)} sub={fmtCur(emp.overtimePay)} icon={Clock} color="text-amber-600" />
        <KPI label="בונוסים" value={fmtCur(emp.totalBonus)} icon={BadgePercent} color="text-purple-600" />
        <KPI label="עמלות" value={fmtCur(emp.totalCommission)} icon={Receipt} color="text-pink-600" />
        <KPI label="היעדרויות" value={att.absences} sub={`${att.sickDays} מחלה`} icon={CalendarX2} color="text-red-600" />
        <KPI label="ניכוי מס קבלנים" value={fmtCur(cont.totalTax)} icon={Building2} color="text-muted-foreground" />
        <KPI label="שעות קבלנים" value={fmt(cont.totalHours)} icon={Hammer} color="text-orange-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl border p-5">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Building2 className="text-blue-600 w-5 h-5" /> פילוח לפי מחלקה</h3>
          <div className="space-y-3">
            {(d.departmentBreakdown || []).map((dept: any, i: number) => {
              const pct = emp.totalGross > 0 ? (Number(dept.total_gross) / emp.totalGross * 100) : 0;
              return (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{dept.department}</span>
                    <span className="text-muted-foreground">{dept.count} עובדים • {fmtCur(dept.total_gross)}</span>
                  </div>
                  <div className="h-2.5 bg-muted/50 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-card rounded-xl border p-5">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Hammer className="text-orange-600 w-5 h-5" /> פילוח קבלנים</h3>
          {(d.contractorBreakdown || []).length === 0 ? (
            <p className="text-muted-foreground text-center py-8">אין עבודת קבלנים בתקופה זו</p>
          ) : (
            <div className="space-y-3">
              {(d.contractorBreakdown || []).map((c: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold text-sm">{c.contractor_name?.charAt(0)}</div>
                    <div>
                      <p className="font-medium text-sm">{c.contractor_name}</p>
                      <p className="text-xs text-muted-foreground">{workTypeMap[c.work_type] || c.work_type} • {c.jobs} עבודות • {fmt(c.total_hours)} שעות</p>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm">{fmtCur(c.total_gross)}</p>
                    <p className="text-xs text-muted-foreground">נטו: {fmtCur(c.total_net)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {(d.absentees || []).length > 0 && (
        <div className="bg-card rounded-xl border p-5">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><CalendarX2 className="text-red-600 w-5 h-5" /> היעדרויות החודש ({d.absentees.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {(d.absentees || []).slice(0, 12).map((a: any, i: number) => {
              const s = absStatusMap[a.status] || absStatusMap.absent;
              return (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                  <s.icon className="w-4 h-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.employee_name}</p>
                    <p className="text-xs text-muted-foreground">{a.department} • {a.attendance_date?.slice(0, 10)}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function EmployeesTab({ records, search, setSearch, sortField, toggleSort, sortDir, expandedId, setExpandedId, bulk, detailTab, setDetailTab }: any) {
  const SortBtn = ({ field, label }: { field: string; label: string }) => (
    <button onClick={() => toggleSort(field)} className={`flex items-center gap-1 text-xs ${sortField === field ? "text-emerald-700 font-bold" : "text-muted-foreground"}`}>
      {label} <ArrowUpDown size={12} />
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש עובד, מחלקה..." className="w-full pr-10 pl-4 py-2 border rounded-lg text-sm" />
        </div>
        <span className="text-sm text-muted-foreground">{records.length} תלושים</span>
      </div>

      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="grid grid-cols-[30px_2fr_1fr_1fr_1fr_1fr_1fr_1fr_80px] gap-2 px-4 py-3 bg-muted/30 border-b text-xs font-medium text-muted-foreground">
          <span><BulkCheckbox checked={bulk?.isAllSelected(records)} indeterminate={bulk?.isSomeSelected(records)} onChange={() => bulk?.toggleAll(records)} /></span>
          <span>עובד</span>
          <SortBtn field="base_salary" label="בסיס" />
          <SortBtn field="gross_salary" label="ברוטו" />
          <SortBtn field="total_deductions" label="ניכויים" />
          <SortBtn field="net_salary" label="נטו" />
          <SortBtn field="overtime_pay" label='שנ"ג' />
          <SortBtn field="employer_cost" label="עלות מעסיק" />
          <span>פרטים</span>
        </div>
        {records.map((r: any) => (
          <div key={r.id}>
            <div className="grid grid-cols-[30px_2fr_1fr_1fr_1fr_1fr_1fr_1fr_80px] gap-2 px-4 py-3 border-b hover:bg-muted/30 items-center text-sm cursor-pointer" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
              <div onClick={e => e.stopPropagation()}><BulkCheckbox checked={bulk?.isSelected(r.id)} onChange={() => bulk?.toggle(r.id)} /></div>
              <div>
                <p className="font-medium">{r.employee_name}</p>
                <p className="text-xs text-muted-foreground">{r.department} • {r.job_title || r.record_number}</p>
              </div>
              <span>{fmtCur(r.base_salary)}</span>
              <span className="font-bold text-emerald-700">{fmtCur(r.gross_salary)}</span>
              <span className="text-red-600">{fmtCur(r.total_deductions)}</span>
              <span className="font-bold">{fmtCur(r.net_salary)}</span>
              <span className="text-amber-600">{Number(r.overtime_pay) > 0 ? fmtCur(r.overtime_pay) : "—"}</span>
              <span className="text-purple-600">{fmtCur(r.employer_cost)}</span>
              <button className="text-muted-foreground hover:text-muted-foreground">{expandedId === r.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
            </div>
            {expandedId === r.id && (
              <div className="px-6 py-4 bg-muted/30 border-b">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">בונוס</p>
                    <p className="font-medium">{fmtCur(r.bonus)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">עמלות</p>
                    <p className="font-medium">{fmtCur(r.commission)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">שעות נוספות</p>
                    <p className="font-medium">{r.overtime_hours || 0} שעות</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">נסיעות</p>
                    <p className="font-medium">{fmtCur(r.travel_allowance)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">מס הכנסה</p>
                    <p className="font-medium text-red-600">{fmtCur(r.income_tax)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">ביטוח לאומי</p>
                    <p className="font-medium">{fmtCur(r.national_insurance)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">פנסיה (עובד)</p>
                    <p className="font-medium">{fmtCur(r.pension_employee)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">פנסיה (מעסיק)</p>
                    <p className="font-medium">{fmtCur(r.pension_employer)}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  {Number(r.absence_days) > 0 && <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full">🚫 {r.absence_days} ימי היעדרות</span>}
                  {Number(r.sick_days) > 0 && <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full">🤒 {r.sick_days} ימי מחלה</span>}
                  {Number(r.late_days) > 0 && <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full">⏰ {r.late_days} איחורים ({r.total_late_minutes} דק')</span>}
                  {Number(r.vacation_days) > 0 && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full">🏖️ {r.vacation_days} ימי חופש</span>}
                  {Number(r.completed_work_orders) > 0 && <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full">✅ {r.completed_work_orders} פקודות עבודה</span>}
                </div>
                {r.notes && <p className="mt-2 text-xs text-muted-foreground bg-card rounded p-2 border">{r.notes}</p>}
                <div className="flex border-b border-border/50 mt-3">
                  {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                    <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-3 py-2 text-xs font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                  ))}
                </div>
                {detailTab === "related" && <div className="mt-2"><RelatedRecords entityType="payroll" entityId={r.id} relations={[{key:"employees",label:"עובדים",icon:"Users"},{key:"deductions",label:"ניכויים",icon:"DollarSign"}]} /></div>}
                {detailTab === "docs" && <div className="mt-2"><AttachmentsSection entityType="payroll" entityId={r.id} /></div>}
                {detailTab === "history" && <div className="mt-2"><ActivityLog entityType="payroll" entityId={r.id} /></div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ContractorsTab({ records, search, setSearch, expandedId, setExpandedId, month, year, bulk, detailTab, setDetailTab }: any) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש קבלן, פקודה..." className="w-full pr-10 pl-4 py-2 border rounded-lg text-sm" />
        </div>
        <span className="text-sm text-muted-foreground">{records.length} עבודות • {monthNames[month]} {year}</span>
      </div>

      {records.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border">
          <Hammer className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-muted-foreground">אין עבודות קבלנים בתקופה זו</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((r: any) => (
            <div key={r.id} className="bg-card rounded-xl border overflow-hidden hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between px-5 py-4 cursor-pointer" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                <div className="flex items-center gap-4">
                  <div onClick={e => e.stopPropagation()}><BulkCheckbox checked={bulk?.isSelected(r.id)} onChange={() => bulk?.toggle(r.id)} /></div>
                  <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold">{r.contractor_name?.charAt(0)}</div>
                  <div>
                    <p className="font-medium">{r.contractor_name}</p>
                    <p className="text-xs text-muted-foreground">{r.work_order_number} • {workTypeMap[r.work_type] || r.work_type} • {r.specialization || ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-left">
                    <p className="font-bold text-emerald-700">{fmtCur(r.gross_amount)}</p>
                    <p className="text-xs text-muted-foreground">נטו: {fmtCur(r.net_amount)}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${payStatusMap[r.status]?.color || "bg-muted/50"}`}>{payStatusMap[r.status]?.label || r.status}</span>
                  {expandedId === r.id ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
                </div>
              </div>
              {expandedId === r.id && (
                <div className="px-5 py-4 bg-muted/30 border-t">
                  <p className="text-sm mb-3">{r.description}</p>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                    <div><p className="text-xs text-muted-foreground">תאריך</p><p className="font-medium">{r.work_date?.slice(0, 10)}</p></div>
                    <div><p className="text-xs text-muted-foreground">כמות</p><p className="font-medium">{fmt(r.quantity)} {r.unit}</p></div>
                    <div><p className="text-xs text-muted-foreground">תעריף</p><p className="font-medium">{fmtCur(r.rate)}</p></div>
                    <div><p className="text-xs text-muted-foreground">שעות</p><p className="font-medium">{fmt(r.hours_worked)}</p></div>
                    <div><p className="text-xs text-muted-foreground">ניכוי מס במקור</p><p className="font-medium text-red-600">{fmtCur(r.withholding_tax)}</p></div>
                  </div>
                  {r.notes && <p className="mt-3 text-xs text-muted-foreground bg-card rounded p-2 border">{r.notes}</p>}
                  <div className="flex border-b border-border/50 mt-3">
                    {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                      <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-3 py-2 text-xs font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                    ))}
                  </div>
                  {detailTab === "related" && <div className="mt-2"><RelatedRecords entityType="contractor-payroll" entityId={r.id} relations={[{key:"contractors",label:"קבלנים",icon:"Briefcase"},{key:"work-orders",label:"פקודות עבודה",icon:"FileText"}]} /></div>}
                  {detailTab === "docs" && <div className="mt-2"><AttachmentsSection entityType="contractor-payroll" entityId={r.id} /></div>}
                  {detailTab === "history" && <div className="mt-2"><ActivityLog entityType="contractor-payroll" entityId={r.id} /></div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AttendanceTab({ absentees, attendance }: { absentees: any[]; attendance: any }) {
  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    absentees.forEach(a => {
      const name = a.employee_name;
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(a);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [absentees]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPI label="היעדרויות" value={attendance?.absences || 0} icon={CalendarX2} color="text-red-600" />
        <KPI label="ימי מחלה" value={attendance?.sickDays || 0} icon={AlertTriangle} color="text-orange-600" />
        <KPI label="איחורים" value={attendance?.lateCount || 0} sub={`${attendance?.totalLateMinutes || 0} דק' סה"כ`} icon={Clock} color="text-yellow-600" />
        <KPI label="ימי חופש" value={attendance?.vacations || 0} icon={UserCheck} color="text-blue-600" />
        <KPI label="נוכחות" value={attendance?.present || 0} icon={Users} color="text-green-600" />
      </div>

      <div className="bg-card rounded-xl border p-5">
        <h3 className="font-bold text-lg mb-4">פירוט לפי עובד</h3>
        {grouped.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">אין היעדרויות בתקופה זו</p>
        ) : (
          <div className="space-y-4">
            {grouped.map(([name, events]) => (
              <div key={name} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-700 font-bold text-sm">{name.charAt(0)}</div>
                    <div>
                      <p className="font-medium text-sm">{name}</p>
                      <p className="text-xs text-muted-foreground">{events[0]?.department}</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-red-600">{events.length} אירועים</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {events.map((e: any, i: number) => {
                    const s = absStatusMap[e.status] || absStatusMap.absent;
                    return (
                      <div key={i} className={`text-xs px-2 py-1 rounded-lg ${s.color} flex items-center gap-1`}>
                        {s.label} • {e.attendance_date?.slice(5, 10)}
                        {e.notes && <span className="text-[10px] opacity-75">({e.notes})</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WorkLogTab({ logs }: { logs: any[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg flex items-center gap-2"><FileText className="text-muted-foreground w-5 h-5" /> יומן עבודת קבלנים — כל התקופות</h3>
        <span className="text-sm text-muted-foreground">{logs.length} רשומות</span>
      </div>

      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="grid grid-cols-[1.5fr_2fr_1fr_1fr_1fr_1fr_80px] gap-2 px-4 py-3 bg-muted/30 border-b text-xs font-medium text-muted-foreground">
          <span>קבלן</span>
          <span>תיאור</span>
          <span>תאריך</span>
          <span>ברוטו</span>
          <span>מס במקור</span>
          <span>נטו</span>
          <span>סטטוס</span>
        </div>
        {logs.map((l: any) => (
          <div key={l.id} className="grid grid-cols-[1.5fr_2fr_1fr_1fr_1fr_1fr_80px] gap-2 px-4 py-3 border-b hover:bg-muted/30 items-center text-sm">
            <div>
              <p className="font-medium">{l.contractor_name}</p>
              <p className="text-xs text-muted-foreground">{l.log_number} • {workTypeMap[l.work_type] || l.work_type}</p>
            </div>
            <p className="text-xs text-muted-foreground truncate">{l.description}</p>
            <span className="text-xs">{l.work_date?.slice(0, 10)}</span>
            <span className="font-bold text-emerald-700">{fmtCur(l.gross_amount)}</span>
            <span className="text-red-600">{fmtCur(l.withholding_tax)}</span>
            <span className="font-bold">{fmtCur(l.net_amount)}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full text-center ${payStatusMap[l.status]?.color || "bg-muted/50"}`}>{payStatusMap[l.status]?.label || l.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
