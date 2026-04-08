import { useState, useEffect, useMemo } from "react";
import { DollarSign, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2, Clock, AlertTriangle, ArrowUpDown, Users, Calculator, TrendingUp, Wallet, Building2, CreditCard, Percent, Loader2, Play, FileText, Printer, Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useToast } from "@/hooks/use-toast";
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
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtCur = (v: any) => `₪${fmt(v)}`;

interface PayrollRecord {
  id: number; record_number: string; employee_name: string; employee_id_ref: number;
  period_month: number; period_year: number; base_salary: number; overtime_hours: number;
  overtime_pay: number; bonus: number; commission: number; allowances: number; travel_allowance: number;
  gross_salary: number; income_tax: number; national_insurance: number; health_insurance: number;
  pension_employee: number; pension_employer: number; severance_fund: number; education_fund: number;
  other_deductions: number; total_deductions: number; net_salary: number; employer_cost: number;
  bank_name: string; bank_branch: string; bank_account: string; payment_method: string;
  status: string; approved_by: string; payment_date: string; department: string; notes: string;
}

const statusMap: Record<string, { label: string; color: string }> = {
  draft:      { label: "טיוטה",  color: "bg-muted/50 text-foreground" },
  calculated: { label: "חושב",   color: "bg-blue-100 text-blue-700" },
  approved:   { label: "מאושר", color: "bg-green-100 text-green-700" },
  paid:       { label: "שולם",  color: "bg-emerald-100 text-emerald-700" },
  cancelled:  { label: "בוטל",  color: "bg-red-100 text-red-700" },
};
const payMethodMap: Record<string, string> = { bank_transfer: "העברה בנקאית", check: "צ'ק", cash: "מזומן", other: "אחר" };
const monthNames = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

function PayslipModal({ record, onClose }: { record: PayrollRecord; onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-white text-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6" dir="rtl">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-border pb-4 mb-5">
            <div>
              <h1 className="text-xl font-bold">תלוש שכר</h1>
              <p className="text-sm text-gray-500">Payslip</p>
            </div>
            <div className="text-left text-sm">
              <div className="font-bold">{record.record_number}</div>
              <div className="text-gray-500">{monthNames[(record.period_month||1)-1]} {record.period_year}</div>
            </div>
          </div>

          {/* Employee info */}
          <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-xl p-4 mb-5">
            <div>
              <div className="text-xs text-gray-400">שם עובד</div>
              <div className="font-bold text-lg">{record.employee_name}</div>
            </div>
            {record.department && <div>
              <div className="text-xs text-gray-400">מחלקה</div>
              <div className="font-medium">{record.department}</div>
            </div>}
            {record.payment_date && <div>
              <div className="text-xs text-gray-400">תאריך תשלום</div>
              <div className="font-medium">{record.payment_date?.slice(0, 10)}</div>
            </div>}
            <div>
              <div className="text-xs text-gray-400">אופן תשלום</div>
              <div className="font-medium">{payMethodMap[record.payment_method] || record.payment_method}</div>
            </div>
          </div>

          {/* Earnings + Deductions table */}
          <div className="grid grid-cols-2 gap-6 mb-5">
            <div>
              <h3 className="font-bold text-sm bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 mb-2 text-emerald-700">הכנסות</h3>
              <div className="space-y-1 text-sm">
                {[
                  ["שכר בסיס", record.base_salary],
                  record.overtime_pay > 0 && [`שעות נוספות (${record.overtime_hours}h)`, record.overtime_pay],
                  record.bonus > 0 && ["בונוס", record.bonus],
                  record.commission > 0 && ["עמלות", record.commission],
                  record.allowances > 0 && ["תוספות", record.allowances],
                  record.travel_allowance > 0 && ["נסיעות", record.travel_allowance],
                ].filter(Boolean).map((row: any, i) => (
                  <div key={i} className="flex justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-600">{row[0]}</span>
                    <span className="font-medium">{fmtCur(row[1])}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 font-bold text-emerald-700 border-t-2 border-emerald-200">
                  <span>ברוטו</span><span>{fmtCur(record.gross_salary)}</span>
                </div>
              </div>
            </div>
            <div>
              <h3 className="font-bold text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 mb-2 text-red-700">ניכויים</h3>
              <div className="space-y-1 text-sm">
                {[
                  record.income_tax > 0 && ["מס הכנסה", record.income_tax],
                  record.national_insurance > 0 && ["ביטוח לאומי", record.national_insurance],
                  record.health_insurance > 0 && ["ביטוח בריאות", record.health_insurance],
                  record.pension_employee > 0 && ["פנסיה (עובד)", record.pension_employee],
                  record.other_deductions > 0 && ["ניכויים אחרים", record.other_deductions],
                ].filter(Boolean).map((row: any, i) => (
                  <div key={i} className="flex justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-600">{row[0]}</span>
                    <span className="font-medium text-red-600">{fmtCur(row[1])}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 font-bold text-red-700 border-t-2 border-red-200">
                  <span>סה"כ ניכויים</span><span>{fmtCur(record.total_deductions)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Employer cost */}
          {(record.pension_employer > 0 || record.severance_fund > 0 || record.education_fund > 0) && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-5">
              <h3 className="font-bold text-sm text-purple-700 mb-2">עלות מעסיק</h3>
              <div className="grid grid-cols-3 gap-3 text-sm">
                {record.pension_employer > 0 && <div><div className="text-gray-500 text-xs">פנסיה מעסיק</div><div className="font-medium">{fmtCur(record.pension_employer)}</div></div>}
                {record.severance_fund > 0 && <div><div className="text-gray-500 text-xs">פיצויים</div><div className="font-medium">{fmtCur(record.severance_fund)}</div></div>}
                {record.education_fund > 0 && <div><div className="text-gray-500 text-xs">קרן השתלמות</div><div className="font-medium">{fmtCur(record.education_fund)}</div></div>}
                <div><div className="text-gray-500 text-xs">עלות כוללת</div><div className="font-bold text-purple-700">{fmtCur(record.employer_cost)}</div></div>
              </div>
            </div>
          )}

          {/* Net amount */}
          <div className="bg-blue-600 text-foreground rounded-xl p-4 text-center mb-5">
            <div className="text-sm opacity-80">שכר נטו לתשלום</div>
            <div className="text-3xl font-bold mt-1">{fmtCur(record.net_salary)}</div>
          </div>

          {/* Bank details */}
          {(record.bank_name || record.bank_account) && (
            <div className="border rounded-xl p-3 text-sm text-gray-600">
              <span className="font-medium">פרטי בנק: </span>
              {record.bank_name} {record.bank_branch && `סניף ${record.bank_branch}`} {record.bank_account && `חשבון ${record.bank_account}`}
            </div>
          )}
        </div>
        <div className="px-6 pb-5 flex gap-2 border-t border-gray-100 pt-4" dir="rtl">
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground rounded-lg text-sm hover:bg-muted">
            <Printer size={14} /> הדפסה
          </button>
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">סגור</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function RunPayrollModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [dept, setDept] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();
  const token = localStorage.getItem("erp_token") || "";

  const runPayroll = async () => {
    setRunning(true);
    try {
      const r = await authFetch(`${API}/hr/payroll/run`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ month, year, department: dept || undefined }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "שגיאה בהרצת שכר");
      setResult(data);
      toast({ title: "הרצת שכר הושלמה", description: `נוצרו ${data.created || 0} תלושים` });
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
    setRunning(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-border flex justify-between items-center">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Play className="w-5 h-5 text-emerald-500" /> הרצת שכר
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4" dir="rtl">
          {!result ? (<>
            <p className="text-sm text-muted-foreground">מערכת השכר תחשב ותיצור תלושי שכר לכל העובדים לפי השעות, שכר הבסיס, ומדיניות הניכויים הרשומים במערכת.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">חודש</label>
                <select value={month} onChange={e => setMonth(+e.target.value)} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                  {monthNames.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">שנה</label>
                <input type="number" value={year} onChange={e => setYear(+e.target.value)} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">מחלקה (אופציונלי)</label>
                <input value={dept} onChange={e => setDept(e.target.value)} placeholder="כל המחלקות" className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
              </div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5 inline ml-1" />
              הרצת שכר תיצור תלושי שכר חדשים לתקופה זו. ניתן לסקור ולערוך לפני אישור תשלום.
            </div>
            <button onClick={runPayroll} disabled={running}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-foreground py-3 rounded-xl hover:bg-emerald-700 disabled:opacity-50 font-medium">
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {running ? "מריץ שכר..." : "הרץ שכר"}
            </button>
          </>) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-semibold">הרצת שכר הושלמה!</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "תלושים שנוצרו", value: result.created || 0, color: "text-emerald-400" },
                  { label: "סה\"כ ברוטו", value: fmtCur(result.totalGross || 0), color: "text-blue-400" },
                  { label: "סה\"כ ניכויים", value: fmtCur(result.totalDeductions || 0), color: "text-red-400" },
                  { label: "סה\"כ נטו", value: fmtCur(result.totalNet || 0), color: "text-purple-400" },
                ].map((item, i) => (
                  <div key={i} className="bg-muted/20 rounded-xl p-3">
                    <div className="text-xs text-muted-foreground">{item.label}</div>
                    <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => { onDone(); onClose(); }} className="w-full bg-emerald-600 text-foreground py-2.5 rounded-xl hover:bg-emerald-700 font-medium text-sm">
                סגור ורענן
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function PayrollPage() {
  const [items, setItems] = useState<PayrollRecord[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterDept, setFilterDept] = useState("all");
  const [sortField, setSortField] = useState("period_year");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PayrollRecord | null>(null);
  const [form, setForm] = useState<any>({});
  const [expandedId, setExpandedId] = useState<number|null>(null);
  const [detailTab, setDetailTab] = useState("details");
  const [showRunPayroll, setShowRunPayroll] = useState(false);
  const [payslipRecord, setPayslipRecord] = useState<PayrollRecord | null>(null);
  const bulk = useBulkSelection();
  const { toast } = useToast();
  const formValidation = useFormValidation({
    employee_name: [{ type: "required", message: "שם עובד נדרש" }],
    period_month: [{ type: "required", message: "חודש נדרש" }],
    period_year: [{ type: "required", message: "שנה נדרשת" }],
  });
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const [tableLoading, setTableLoading] = useState(true);
  const pagination = useSmartPagination(25);
  const { executeSave, executeDelete } = useApiAction();

  const load = () => {
    setTableLoading(true);
    Promise.all([
      authFetch(`${API}/payroll-records`, { headers }).then(r => r.json()).then(d => setItems(safeArray(d))).catch(() => {}),
      authFetch(`${API}/payroll-records/stats`, { headers }).then(r => r.json()).then(d => setStats(d || {})).catch(() => {})
    ]).finally(() => setTableLoading(false));
  };
  useEffect(load, []);

  const departments = useMemo(() => {
    const set = new Set<string>();
    items.forEach(r => { if (r.department) set.add(r.department); });
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    let f = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (filterDept === "all" || i.department === filterDept) &&
      (filterMonth === "all" || `${i.period_year}-${i.period_month}` === filterMonth) &&
      (!search || i.record_number?.toLowerCase().includes(search.toLowerCase()) || i.employee_name?.toLowerCase().includes(search.toLowerCase()) || i.department?.toLowerCase().includes(search.toLowerCase()))
    );
    f.sort((a: any, b: any) => { const av = a[sortField], bv = b[sortField]; const cmp = typeof av === "number" ? av - bv : String(av||"").localeCompare(String(bv||"")); return sortDir === "asc" ? cmp : -cmp; });
    return f;
  }, [items, search, filterStatus, filterMonth, filterDept, sortField, sortDir]);

  const months = useMemo(() => {
    const set = new Set<string>();
    items.forEach(i => set.add(`${i.period_year}-${i.period_month}`));
    return Array.from(set).sort().reverse();
  }, [items]);

  const now = new Date();
  const openCreate = () => { setEditing(null); setForm({ periodMonth: now.getMonth()+1, periodYear: now.getFullYear(), status: "draft", paymentMethod: "bank_transfer", baseSalary: 0, overtimeHours: 0, overtimePay: 0, bonus: 0, commission: 0, allowances: 0, travelAllowance: 0, incomeTax: 0, nationalInsurance: 0, healthInsurance: 0, pensionEmployee: 0, pensionEmployer: 0, severanceFund: 0, educationFund: 0, otherDeductions: 0 }); setShowForm(true); };
  const openEdit = (r: PayrollRecord) => { setEditing(r); setForm({ employeeName: r.employee_name, periodMonth: r.period_month, periodYear: r.period_year, baseSalary: r.base_salary, overtimeHours: r.overtime_hours, overtimePay: r.overtime_pay, bonus: r.bonus, commission: r.commission, allowances: r.allowances, travelAllowance: r.travel_allowance, incomeTax: r.income_tax, nationalInsurance: r.national_insurance, healthInsurance: r.health_insurance, pensionEmployee: r.pension_employee, pensionEmployer: r.pension_employer, severanceFund: r.severance_fund, educationFund: r.education_fund, otherDeductions: r.other_deductions, bankName: r.bank_name, bankBranch: r.bank_branch, bankAccount: r.bank_account, paymentMethod: r.payment_method, status: r.status, approvedBy: r.approved_by, paymentDate: r.payment_date?.slice(0,10), department: r.department, notes: r.notes }); setShowForm(true); };
  const save = async () => { const url = editing ? `${API}/payroll-records/${editing.id}` : `${API}/payroll-records`; await executeSave(url, editing ? "PUT" : "POST", form, editing ? "עודכן בהצלחה" : "נוצר בהצלחה", () => { setShowForm(false); load(); }); };
  const remove = async (id: number) => { await executeDelete(`${API}/payroll-records/${id}`, "למחוק רשומה?", () => { load(); }); };
  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const kpis = [
    { label: "סה\"כ תלושים", value: fmt(stats.total || 0), icon: Calculator, color: "text-blue-600", bg: "bg-blue-500/10" },
    { label: "ברוטו כולל", value: fmtCur(stats.total_gross || 0), icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-500/10" },
    { label: "נטו כולל", value: fmtCur(stats.total_net || 0), icon: Wallet, color: "text-blue-600", bg: "bg-blue-500/10" },
    { label: "ניכויים כולל", value: fmtCur(stats.total_deductions_sum || 0), icon: Percent, color: "text-red-600", bg: "bg-red-500/10" },
    { label: "עלות מעסיק", value: fmtCur(stats.total_employer_cost || 0), icon: Building2, color: "text-purple-600", bg: "bg-purple-500/10" },
    { label: "ממוצע ברוטו", value: fmtCur(stats.avg_gross || 0), icon: DollarSign, color: "text-indigo-600", bg: "bg-indigo-500/10" },
    { label: "שולמו", value: fmt(stats.paid || 0), icon: CheckCircle2, color: "text-green-600", bg: "bg-green-500/10" },
    { label: "עובדים", value: fmt(stats.unique_employees || 0), icon: Users, color: "text-orange-600", bg: "bg-orange-500/10" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><Calculator className="text-emerald-600" /> ניהול שכר</h1>
          <p className="text-muted-foreground mt-1 text-sm">תלושי שכר, ניכויים, עלות מעסיק, היסטוריית תשלומים</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowRunPayroll(true)}
            className="flex items-center gap-1.5 bg-emerald-600 text-foreground px-3 py-2 rounded-lg hover:bg-emerald-700 shadow text-sm font-medium">
            <Play size={15} /> הרץ שכר
          </button>
          <ExportDropdown data={items} headers={{ record_number: "מספר", employee_name: "עובד", period_month: "חודש", period_year: "שנה", base_salary: "בסיס", gross_salary: "ברוטו", total_deductions: "ניכויים", net_salary: "נטו", employer_cost: "עלות מעסיק", status: "סטטוס" }} filename={"payroll"} />
          <button onClick={() => printPage("שכר")} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm"><Printer size={16} /> הדפסה</button>
          <button onClick={() => sendByEmail("שכר", generateEmailBody("שכר", items, { record_number: "מספר", employee_name: "עובד", gross_salary: "ברוטו", net_salary: "נטו", status: "סטטוס" }))} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm"><Send size={16} /> שליחה</button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 text-foreground px-3 py-2 rounded-lg hover:bg-blue-700 shadow-lg text-sm"><Plus size={16} /> תלוש חדש</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className={`rounded-xl shadow-sm border p-3 ${kpi.bg}`}>
            <kpi.icon className={`${kpi.color} mb-1`} size={20} />
            <div className="text-lg font-bold">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
          <Search className="absolute right-3 top-2.5 text-muted-foreground" size={18} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש עובד, מחלקה..." className="w-full pr-10 pl-4 py-2 border rounded-lg" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2">
          <option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="border rounded-lg px-3 py-2">
          <option value="all">כל התקופות</option>
          {months.map(m => { const [y, mo] = m.split("-"); return <option key={m} value={m}>{monthNames[parseInt(mo)-1]} {y}</option>; })}
        </select>
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="border rounded-lg px-3 py-2">
          <option value="all">כל המחלקות</option>{departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <BulkActions selectedIds={bulk.selectedIds} onClear={bulk.clearAll} entityName="תלושי שכר" actions={defaultBulkActions} />

      {/* Table */}
      <div className="bg-card rounded-xl shadow-sm border overflow-x-auto relative">
        {tableLoading && (
          <div className="absolute inset-0 bg-card/60 backdrop-blur-[1px] flex items-center justify-center z-10">
            <div className="flex items-center gap-2 bg-card border rounded-lg px-4 py-2 shadow-lg"><Loader2 className="w-4 h-4 animate-spin text-emerald-600" /><span className="text-sm">טוען...</span></div>
          </div>
        )}
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b"><tr>
            <th className="px-2 py-3 w-10"><BulkCheckbox checked={bulk.isAllSelected(filtered)} indeterminate={bulk.isSomeSelected(filtered)} onChange={() => bulk.toggleAll(filtered)} /></th>
            {[
              { key: "record_number", label: "מספר" },
              { key: "employee_name", label: "עובד" },
              { key: "department", label: "מחלקה" },
              { key: "period_month", label: "תקופה" },
              { key: "base_salary", label: "בסיס" },
              { key: "gross_salary", label: "ברוטו" },
              { key: "total_deductions", label: "ניכויים" },
              { key: "net_salary", label: "נטו" },
              { key: "employer_cost", label: "עלות מעסיק" },
              { key: "status", label: "סטטוס" },
            ].map(col => (
              <th key={col.key} className="px-3 py-3 text-right cursor-pointer hover:bg-muted/50 whitespace-nowrap" onClick={() => toggleSort(col.key)}>
                <div className="flex items-center gap-1">{col.label} <ArrowUpDown size={12} /></div>
              </th>
            ))}
            <th className="px-3 py-3 text-right">פעולות</th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={12} className="text-center py-8 text-muted-foreground">אין רשומות שכר</td></tr> :
            filtered.map(r => (
              <>
              <tr key={r.id} className="border-b hover:bg-emerald-50/30 cursor-pointer" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                <td className="px-2 py-2" onClick={e => e.stopPropagation()}><BulkCheckbox checked={bulk.isSelected(r.id)} onChange={() => bulk.toggle(r.id)} /></td>
                <td className="px-3 py-2 font-mono text-emerald-600 font-bold text-xs">{r.record_number}</td>
                <td className="px-3 py-2 font-medium whitespace-nowrap">{r.employee_name}</td>
                <td className="px-3 py-2 text-muted-foreground text-xs">{r.department || "—"}</td>
                <td className="px-3 py-2">{monthNames[(r.period_month||1)-1]} {r.period_year}</td>
                <td className="px-3 py-2">{fmtCur(r.base_salary)}</td>
                <td className="px-3 py-2 font-bold text-emerald-600">{fmtCur(r.gross_salary)}</td>
                <td className="px-3 py-2 text-red-600">{fmtCur(r.total_deductions)}</td>
                <td className="px-3 py-2 font-bold text-blue-600">{fmtCur(r.net_salary)}</td>
                <td className="px-3 py-2 text-purple-600">{fmtCur(r.employer_cost)}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${statusMap[r.status]?.color || "bg-muted/50"}`}>
                    {statusMap[r.status]?.label || r.status}
                  </span>
                </td>
                <td className="px-3 py-2"><div className="flex gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setPayslipRecord(r)} className="p-1 hover:bg-blue-500/10 rounded" title="תלוש"><FileText size={13} className="text-blue-500" /></button>
                  <button onClick={() => openEdit(r)} className="p-1 hover:bg-blue-500/10 rounded"><Edit2 size={13} /></button>
                  <button onClick={() => remove(r.id)} className="p-1 hover:bg-red-500/10 rounded text-red-500"><Trash2 size={13} /></button>
                </div></td>
              </tr>
              {expandedId === r.id && (
                <tr key={`exp-${r.id}`} className="bg-muted/10">
                  <td colSpan={12} className="px-6 py-4">
                    <div className="flex border-b border-border/50 mb-3">
                      {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                        <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-emerald-500 text-emerald-500" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                      ))}
                    </div>
                    {detailTab === "details" && <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div className="space-y-1">
                        <div className="font-bold text-muted-foreground mb-2">סטטוס</div>
                        <StatusTransition currentStatus={r.status}
                          statusMap={{"draft":"טיוטה","calculated":"חושב","approved":"מאושר","paid":"שולם","cancelled":"בוטל"}}
                          transitions={{"draft":["calculated"],"calculated":["approved"],"approved":["paid"]}}
                          onTransition={async (s) => { await authFetch(`${API}/payroll-records/${r.id}`, { method: "PUT", headers, body: JSON.stringify({status: s}) }); load(); }} />
                        <div className="mt-4">
                          <button onClick={() => setPayslipRecord(r)} className="flex items-center gap-1.5 text-blue-500 text-xs border border-blue-500/30 px-2 py-1 rounded hover:bg-blue-500/10">
                            <FileText size={12} /> הצג תלוש
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="font-bold text-muted-foreground mb-2">הכנסות</div>
                        <div className="flex justify-between"><span>שכר בסיס:</span><span>{fmtCur(r.base_salary)}</span></div>
                        <div className="flex justify-between"><span>שעות נוספות ({r.overtime_hours||0}h):</span><span>{fmtCur(r.overtime_pay)}</span></div>
                        <div className="flex justify-between"><span>בונוס:</span><span>{fmtCur(r.bonus)}</span></div>
                        <div className="flex justify-between"><span>עמלות:</span><span>{fmtCur(r.commission)}</span></div>
                        <div className="flex justify-between"><span>תוספות:</span><span>{fmtCur(r.allowances)}</span></div>
                        <div className="flex justify-between"><span>נסיעות:</span><span>{fmtCur(r.travel_allowance)}</span></div>
                        <div className="flex justify-between font-bold border-t pt-1"><span>ברוטו:</span><span className="text-emerald-600">{fmtCur(r.gross_salary)}</span></div>
                      </div>
                      <div className="space-y-1">
                        <div className="font-bold text-muted-foreground mb-2">ניכויי עובד</div>
                        <div className="flex justify-between"><span>מס הכנסה:</span><span className="text-red-600">{fmtCur(r.income_tax)}</span></div>
                        <div className="flex justify-between"><span>ביטוח לאומי:</span><span className="text-red-600">{fmtCur(r.national_insurance)}</span></div>
                        <div className="flex justify-between"><span>ביטוח בריאות:</span><span className="text-red-600">{fmtCur(r.health_insurance)}</span></div>
                        <div className="flex justify-between"><span>פנסיה עובד:</span><span className="text-red-600">{fmtCur(r.pension_employee)}</span></div>
                        <div className="flex justify-between"><span>ניכויים אחרים:</span><span className="text-red-600">{fmtCur(r.other_deductions)}</span></div>
                        <div className="flex justify-between font-bold border-t pt-1"><span>סה"כ ניכויים:</span><span className="text-red-600">{fmtCur(r.total_deductions)}</span></div>
                      </div>
                      <div className="space-y-1">
                        <div className="font-bold text-muted-foreground mb-2">תשלום</div>
                        <div className="flex justify-between font-bold text-lg"><span>נטו:</span><span className="text-blue-600">{fmtCur(r.net_salary)}</span></div>
                        <div className="flex justify-between"><span>עלות מעסיק:</span><span className="text-purple-600">{fmtCur(r.employer_cost)}</span></div>
                        {r.bank_name && <div className="flex justify-between"><span>בנק:</span><span>{r.bank_name}</span></div>}
                        {r.bank_account && <div className="flex justify-between"><span>חשבון:</span><span>{r.bank_account}</span></div>}
                        <div className="flex justify-between"><span>אופן:</span><span>{payMethodMap[r.payment_method] || r.payment_method}</span></div>
                        {r.payment_date && <div className="flex justify-between"><span>תאריך:</span><span>{r.payment_date?.slice(0,10)}</span></div>}
                      </div>
                    </div>}
                    {detailTab === "related" && <RelatedRecords entityType="payroll-records" entityId={r.id} relations={[{key:"employees",label:"עובדים",icon:"Users"},{key:"deductions",label:"ניכויים",icon:"DollarSign"}]} />}
                    {detailTab === "docs" && <AttachmentsSection entityType="payroll-records" entityId={r.id} />}
                    {detailTab === "history" && <ActivityLog entityType="payroll-records" entityId={r.id} />}
                  </td>
                </tr>
              )}
              </>
            ))}
          </tbody>
        </table>
      </div>
      <SmartPagination pagination={pagination} />
      <div className="text-sm text-muted-foreground">סה"כ: {filtered.length} תלושים</div>

      {/* Modals */}
      <AnimatePresence>
        {showRunPayroll && <RunPayrollModal onClose={() => setShowRunPayroll(false)} onDone={load} />}
      </AnimatePresence>
      <AnimatePresence>
        {payslipRecord && <PayslipModal record={payslipRecord} onClose={() => setPayslipRecord(null)} />}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">{editing ? "עריכת תלוש שכר" : "תלוש שכר חדש"}</h2><button onClick={() => setShowForm(false)}><X size={20} /></button></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="col-span-3"><label className="block text-sm font-medium mb-1">שם עובד *</label><input value={form.employeeName || ""} onChange={e => setForm({ ...form, employeeName: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">חודש</label><select value={form.periodMonth || 1} onChange={e => setForm({ ...form, periodMonth: parseInt(e.target.value) })} className="w-full border rounded-lg px-3 py-2">{monthNames.map((m, i) => <option key={i} value={i+1}>{m}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">שנה</label><input type="number" value={form.periodYear || now.getFullYear()} onChange={e => setForm({ ...form, periodYear: parseInt(e.target.value) })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מחלקה</label><input value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>

                <div className="col-span-3 border-t pt-3"><div className="text-sm font-bold text-emerald-600 mb-2">הכנסות</div></div>
                <div><label className="block text-sm font-medium mb-1">שכר בסיס *</label><input type="number" step="0.01" value={form.baseSalary || ""} onChange={e => setForm({ ...form, baseSalary: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">שעות נוספות</label><input type="number" step="0.5" value={form.overtimeHours || ""} onChange={e => setForm({ ...form, overtimeHours: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">תשלום נוספות</label><input type="number" step="0.01" value={form.overtimePay || ""} onChange={e => setForm({ ...form, overtimePay: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">בונוס</label><input type="number" step="0.01" value={form.bonus || ""} onChange={e => setForm({ ...form, bonus: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">עמלות</label><input type="number" step="0.01" value={form.commission || ""} onChange={e => setForm({ ...form, commission: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">תוספות</label><input type="number" step="0.01" value={form.allowances || ""} onChange={e => setForm({ ...form, allowances: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">נסיעות</label><input type="number" step="0.01" value={form.travelAllowance || ""} onChange={e => setForm({ ...form, travelAllowance: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>

                <div className="col-span-3 border-t pt-3"><div className="text-sm font-bold text-red-600 mb-2">ניכויים</div></div>
                <div><label className="block text-sm font-medium mb-1">מס הכנסה</label><input type="number" step="0.01" value={form.incomeTax || ""} onChange={e => setForm({ ...form, incomeTax: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">ביטוח לאומי</label><input type="number" step="0.01" value={form.nationalInsurance || ""} onChange={e => setForm({ ...form, nationalInsurance: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">ביטוח בריאות</label><input type="number" step="0.01" value={form.healthInsurance || ""} onChange={e => setForm({ ...form, healthInsurance: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">פנסיה עובד</label><input type="number" step="0.01" value={form.pensionEmployee || ""} onChange={e => setForm({ ...form, pensionEmployee: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">ניכויים אחרים</label><input type="number" step="0.01" value={form.otherDeductions || ""} onChange={e => setForm({ ...form, otherDeductions: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>

                <div className="col-span-3 border-t pt-3"><div className="text-sm font-bold text-purple-600 mb-2">עלות מעסיק</div></div>
                <div><label className="block text-sm font-medium mb-1">פנסיה מעסיק</label><input type="number" step="0.01" value={form.pensionEmployer || ""} onChange={e => setForm({ ...form, pensionEmployer: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">פיצויים</label><input type="number" step="0.01" value={form.severanceFund || ""} onChange={e => setForm({ ...form, severanceFund: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">קרן השתלמות</label><input type="number" step="0.01" value={form.educationFund || ""} onChange={e => setForm({ ...form, educationFund: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>

                <div className="col-span-3 border-t pt-3"><div className="text-sm font-bold text-muted-foreground mb-2">פרטי תשלום</div></div>
                <div><label className="block text-sm font-medium mb-1">בנק</label><input value={form.bankName || ""} onChange={e => setForm({ ...form, bankName: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">סניף</label><input value={form.bankBranch || ""} onChange={e => setForm({ ...form, bankBranch: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">חשבון</label><input value={form.bankAccount || ""} onChange={e => setForm({ ...form, bankAccount: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">אופן תשלום</label><select value={form.paymentMethod || "bank_transfer"} onChange={e => setForm({ ...form, paymentMethod: e.target.value })} className="w-full border rounded-lg px-3 py-2">{Object.entries(payMethodMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">סטטוס</label><select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full border rounded-lg px-3 py-2">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">תאריך תשלום</label><input type="date" value={form.paymentDate || ""} onChange={e => setForm({ ...form, paymentDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div className="col-span-3"><label className="block text-sm font-medium mb-1">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2" /></div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={save} className="flex items-center gap-2 bg-emerald-600 text-foreground px-6 py-2 rounded-lg hover:bg-emerald-700"><Save size={16} /> {editing ? "עדכון" : "שמירה"}</button>
                <button onClick={() => setShowForm(false)} className="px-6 py-2 border rounded-lg hover:bg-muted/30">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
