import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Calculator, Play, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp,
  Clock, Users, DollarSign, TrendingUp, Wallet, Percent, Building2,
  X, Loader2, Edit2, BarChart2, ArrowRight, FileText, Check, Ban,
  RefreshCw, Eye
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const API = "/api";
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtCur = (v: any) => `₪${fmt(v)}`;
const monthNames = ["", "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  draft:      { label: "טיוטה",    color: "text-gray-600",    bg: "bg-gray-100",    icon: Clock },
  calculated: { label: "חושב",     color: "text-blue-700",    bg: "bg-blue-100",    icon: Calculator },
  reviewed:   { label: "נסקר",     color: "text-amber-700",   bg: "bg-amber-100",   icon: Eye },
  approved:   { label: "מאושר",   color: "text-green-700",   bg: "bg-green-100",   icon: CheckCircle2 },
  finalized:  { label: "הסתיים",  color: "text-emerald-700", bg: "bg-emerald-100", icon: Check },
  cancelled:  { label: "בוטל",    color: "text-red-700",     bg: "bg-red-100",     icon: Ban },
};

type RunStatus = "draft" | "calculated" | "reviewed" | "approved" | "finalized" | "cancelled";

const WORKFLOW_STEPS: { key: RunStatus; label: string; next?: RunStatus; action?: string }[] = [
  { key: "draft",      label: "טיוטה",   next: "calculated", action: "חשב שכר" },
  { key: "calculated", label: "חושב",    next: "reviewed",   action: "סמן כנסקר" },
  { key: "reviewed",   label: "נסקר",    next: "approved",   action: "אשר" },
  { key: "approved",   label: "מאושר",   next: "finalized",  action: "סיים וצור תלושים" },
  { key: "finalized",  label: "הסתיים" },
];

interface CalcRun {
  id: number;
  run_number: string;
  period: string;
  period_year: number;
  period_month: number;
  status: RunStatus;
  calculated_by?: string;
  approved_by?: string;
  employee_count: number;
  total_gross: number;
  total_net: number;
  total_employer_cost: number;
  total_cost_to_employer: number;
  created_at: string;
}

interface EmpCalc {
  id: number;
  employee_name: string;
  department: string;
  job_title: string;
  base_salary: number;
  overtime_pay: number;
  bonus: number;
  commission: number;
  travel_allowance: number;
  allowances: number;
  convalescence_pay: number;
  gross_salary: number;
  income_tax: number;
  tax_credit_points_value: number;
  bituach_leumi_employee: number;
  health_insurance_employee: number;
  pension_employee: number;
  education_fund_employee: number;
  total_deductions: number;
  net_salary: number;
  pension_employer: number;
  severance_contrib: number;
  bituach_leumi_employer: number;
  education_fund_employer: number;
  total_employer_cost: number;
  total_cost_to_employer: number;
  line_items?: any[];
  adjustment_notes?: string;
}

function RunStatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] || statusConfig.draft;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
      <cfg.icon size={12} />{cfg.label}
    </span>
  );
}

function WorkflowProgress({ status }: { status: RunStatus }) {
  const steps = WORKFLOW_STEPS.filter(s => s.key !== "cancelled");
  const currentIdx = steps.findIndex(s => s.key === status);
  return (
    <div className="flex items-center gap-1">
      {steps.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={step.key} className="flex items-center gap-1">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all
              ${done ? "bg-emerald-500 text-foreground" : active ? "bg-blue-500 text-foreground ring-2 ring-blue-300" : "bg-muted text-muted-foreground"}`}>
              {done ? <Check size={12} /> : i + 1}
            </div>
            {i < steps.length - 1 && <div className={`w-6 h-0.5 ${done ? "bg-emerald-400" : "bg-muted"}`} />}
          </div>
        );
      })}
    </div>
  );
}

function CreateRunModal({ onClose, onCreated }: { onClose: () => void; onCreated: (run: CalcRun) => void }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const create = async () => {
    setLoading(true);
    try {
      await authFetch(`${API}/payroll/migrate`, { method: "POST", headers });
      const r = await authFetch(`${API}/payroll/calculation-runs`, { method: "POST", headers, body: JSON.stringify({ month, year }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "שגיאה");
      toast({ title: "ריצת שכר נוצרה", description: data.message });
      onCreated(data.run);
      onClose();
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
        className="bg-card border rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b flex justify-between items-center">
          <h2 className="font-bold text-lg flex items-center gap-2"><Play className="text-emerald-500" size={18} />ריצת שכר חדשה</h2>
          <button onClick={onClose} className="hover:bg-muted p-1 rounded-lg"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4" dir="rtl">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">חודש</label>
              <select value={month} onChange={e => setMonth(+e.target.value)} className="w-full bg-background border rounded-xl px-3 py-2 text-sm">
                {monthNames.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">שנה</label>
              <select value={year} onChange={e => setYear(+e.target.value)} className="w-full bg-background border rounded-xl px-3 py-2 text-sm">
                {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-xs text-blue-400">
            <AlertTriangle size={12} className="inline ml-1" />
            יווצר תיק שכר לתקופה {monthNames[month]} {year}. לאחר מכן תוכל לחשב, לסקור ולאשר.
          </div>
          <button onClick={create} disabled={loading} className="w-full bg-emerald-600 text-foreground py-2.5 rounded-xl hover:bg-emerald-700 font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {loading ? "יוצר..." : "צור ריצת שכר"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function AdjustModal({ calc, runId, onClose, onSaved }: { calc: EmpCalc; runId: number; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>({
    bonus: calc.bonus, commission: calc.commission, overtimePay: calc.overtime_pay,
    overtimeHours: Number((calc as any).overtime_hours || 0),
    allowances: calc.allowances, travelAllowance: calc.travel_allowance, adjustmentNotes: calc.adjustment_notes || ""
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const save = async () => {
    setLoading(true);
    try {
      const r = await authFetch(`${API}/payroll/calculation-runs/${runId}/employee/${calc.id}`, { method: "PUT", headers, body: JSON.stringify(form) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      toast({ title: "עדכון בוצע", description: "חישוב השכר עודכן" });
      onSaved();
      onClose();
    } catch (e: any) { toast({ title: "שגיאה", description: e.message, variant: "destructive" }); }
    setLoading(false);
  };

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
        className="bg-card border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b flex justify-between items-center">
          <h2 className="font-bold text-lg flex items-center gap-2"><Edit2 size={18} className="text-blue-500" />עריכת חישוב — {calc.employee_name}</h2>
          <button onClick={onClose} className="hover:bg-muted p-1 rounded-lg"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4" dir="rtl">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: "שעות נוספות", key: "overtimeHours" },
              { label: "תשלום שע\"נ", key: "overtimePay" },
              { label: "בונוס", key: "bonus" },
              { label: "עמלות", key: "commission" },
              { label: "תוספות", key: "allowances" },
              { label: "נסיעות", key: "travelAllowance" },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs text-muted-foreground mb-1 block">{f.label}</label>
                <input type="number" value={form[f.key] || 0} onChange={e => set(f.key, Number(e.target.value))}
                  className="w-full bg-background border rounded-xl px-3 py-2 text-sm" />
              </div>
            ))}
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">הערות התאמה</label>
            <textarea value={form.adjustmentNotes} onChange={e => set("adjustmentNotes", e.target.value)}
              rows={2} className="w-full bg-background border rounded-xl px-3 py-2 text-sm resize-none" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="px-4 py-2 bg-muted rounded-lg text-sm">ביטול</button>
            <button onClick={save} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-foreground rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}שמור
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function PayslipDetailModal({ calc, period, runId, onClose }: { calc: EmpCalc; period: string; runId?: number; onClose: () => void }) {
  const [py, pm] = period.split("-");
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
        className="bg-white text-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6" dir="rtl">
          <div className="flex justify-between items-start border-b-2 border-border pb-4 mb-5">
            <div>
              <h1 className="text-2xl font-bold">תלוש שכר</h1>
              <p className="text-sm text-gray-500">מנוע שכר ישראלי • שנת מס 2025</p>
            </div>
            <div className="text-left text-sm">
              <div className="font-bold text-lg">{monthNames[parseInt(pm)]} {py}</div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-1"><X size={18} /></button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-xl p-4 mb-5">
            <div><div className="text-xs text-gray-400">שם עובד</div><div className="font-bold text-xl">{calc.employee_name}</div></div>
            <div><div className="text-xs text-gray-400">מחלקה</div><div className="font-medium">{calc.department}</div></div>
            <div><div className="text-xs text-gray-400">תפקיד</div><div className="font-medium">{calc.job_title || "—"}</div></div>
            <div><div className="text-xs text-gray-400">תקופה</div><div className="font-medium">{monthNames[parseInt(pm)]} {py}</div></div>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-5">
            <div>
              <h3 className="font-bold text-sm bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3 text-emerald-700">הכנסות</h3>
              <div className="space-y-1.5 text-sm">
                {[
                  ["שכר בסיס", calc.base_salary],
                  calc.overtime_pay > 0 && ["שעות נוספות", calc.overtime_pay],
                  calc.bonus > 0 && ["בונוס", calc.bonus],
                  calc.commission > 0 && ["עמלות", calc.commission],
                  calc.travel_allowance > 0 && ["נסיעות", calc.travel_allowance],
                  calc.allowances > 0 && ["תוספות", calc.allowances],
                  calc.convalescence_pay > 0 && ["דמי הבראה", calc.convalescence_pay],
                ].filter(Boolean).map((row: any, i) => (
                  <div key={i} className="flex justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-600">{row[0]}</span>
                    <span className="font-medium">{fmtCur(row[1])}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 font-bold text-emerald-700 border-t-2 border-emerald-200 text-base">
                  <span>סה"כ ברוטו</span><span>{fmtCur(calc.gross_salary)}</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-bold text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3 text-red-700">ניכויים (עובד)</h3>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-600">מס הכנסה</span>
                  <span className="font-medium text-red-600">{fmtCur(calc.income_tax)}</span>
                </div>
                {calc.tax_credit_points_value > 0 && (
                  <div className="flex justify-between py-0.5 text-xs">
                    <span className="text-gray-400 pr-3">זיכוי נקודות</span>
                    <span className="text-emerald-600">−{fmtCur(calc.tax_credit_points_value)}</span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-600">ביטוח לאומי</span>
                  <span className="font-medium text-red-600">{fmtCur(calc.bituach_leumi_employee)}</span>
                </div>
                {(calc.health_insurance_employee || 0) > 0 && (
                  <div className="flex justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-600">ביטוח בריאות ממלכתי</span>
                    <span className="font-medium text-red-600">{fmtCur(calc.health_insurance_employee)}</span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-600">פנסיה (עובד 6%)</span>
                  <span className="font-medium text-red-600">{fmtCur(calc.pension_employee)}</span>
                </div>
                {calc.education_fund_employee > 0 && (
                  <div className="flex justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-600">קרן השתלמות (עובד 2.5%)</span>
                    <span className="font-medium text-red-600">{fmtCur(calc.education_fund_employee)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 font-bold text-red-700 border-t-2 border-red-200 text-base">
                  <span>סה"כ ניכויים</span><span>{fmtCur(calc.total_deductions)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-blue-600 text-foreground rounded-xl p-5 text-center mb-5">
            <div className="text-sm opacity-80">שכר נטו לתשלום</div>
            <div className="text-4xl font-bold mt-1">{fmtCur(calc.net_salary)}</div>
          </div>

          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
            <h3 className="font-bold text-sm text-purple-700 mb-3">עלות מעסיק (מחוץ לתלוש)</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-xs text-gray-500">ביטוח לאומי (מעסיק)</div><div className="font-medium">{fmtCur(calc.bituach_leumi_employer)}</div></div>
              <div><div className="text-xs text-gray-500">פנסיה (מעסיק 6.5%)</div><div className="font-medium">{fmtCur(calc.pension_employer)}</div></div>
              <div><div className="text-xs text-gray-500">פיצויים (8.33%)</div><div className="font-medium">{fmtCur(calc.severance_contrib)}</div></div>
              {calc.education_fund_employer > 0 && <div><div className="text-xs text-gray-500">קרן השתלמות (מעסיק 7.5%)</div><div className="font-medium">{fmtCur(calc.education_fund_employer)}</div></div>}
              <div className="col-span-2 border-t border-purple-200 pt-2">
                <div className="flex justify-between font-bold text-purple-700">
                  <span>עלות מעסיק</span><span>{fmtCur(calc.total_employer_cost)}</span>
                </div>
                <div className="flex justify-between font-bold text-purple-900 text-lg mt-1">
                  <span>עלות כוללת למעסיק</span><span>{fmtCur(calc.total_cost_to_employer)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 pb-5 flex gap-2 border-t pt-4">
          {runId && calc.id && (
            <a href={`/api/payroll/calculation-runs/${runId}/payslip/${calc.id}/pdf`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-foreground rounded-lg text-sm hover:bg-blue-700">
              <FileText size={14} />הורד PDF
            </a>
          )}
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground rounded-lg text-sm hover:bg-muted">
            <FileText size={14} />הדפסה
          </button>
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">סגור</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function PayrollEnginePage() {
  const [runs, setRuns] = useState<CalcRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<CalcRun | null>(null);
  const [calculations, setCalculations] = useState<EmpCalc[]>([]);
  const [loading, setLoading] = useState(false);
  const [calcsLoading, setCalcsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [adjustCalc, setAdjustCalc] = useState<EmpCalc | null>(null);
  const [payslipCalc, setPayslipCalc] = useState<EmpCalc | null>(null);
  const { toast } = useToast();

  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const loadRuns = useCallback(async () => {
    setLoading(true);
    try {
      await authFetch(`${API}/payroll/migrate`, { method: "POST", headers });
      const r = await authFetch(`${API}/payroll/calculation-runs`, { headers });
      if (r.ok) { const d = await r.json(); setRuns(Array.isArray(d) ? d : []); }
    } catch {}
    setLoading(false);
  }, []);

  const loadRunDetail = useCallback(async (runId: number) => {
    setCalcsLoading(true);
    try {
      const r = await authFetch(`${API}/payroll/calculation-runs/${runId}`, { headers });
      if (r.ok) {
        const d = await r.json();
        setCalculations(d.calculations || []);
        setSelectedRun(d.run);
      }
    } catch {}
    setCalcsLoading(false);
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  const runAction = async (action: string, runId: number, extra?: object) => {
    setActionLoading(action);
    try {
      let endpoint = "";
      if (action === "calculate") endpoint = `${API}/payroll/calculation-runs/${runId}/calculate`;
      else if (action === "review") endpoint = `${API}/payroll/calculation-runs/${runId}/review`;
      else if (action === "approve") endpoint = `${API}/payroll/calculation-runs/${runId}/approve`;
      else if (action === "finalize") endpoint = `${API}/payroll/calculation-runs/${runId}/finalize`;
      else if (action === "cancel") endpoint = `${API}/payroll/calculation-runs/${runId}/cancel`;

      const r = await authFetch(endpoint, { method: "POST", headers, body: JSON.stringify(extra || {}) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast({ title: "פעולה בוצעה", description: d.message });
      await loadRuns();
      if (selectedRun?.id === runId) await loadRunDetail(runId);
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
    setActionLoading(null);
  };

  const filteredCalcs = useMemo(() => {
    if (!search) return calculations;
    const s = search.toLowerCase();
    return calculations.filter(c => c.employee_name?.toLowerCase().includes(s) || c.department?.toLowerCase().includes(s));
  }, [calculations, search]);

  const canCalculate = selectedRun && ["draft", "calculated"].includes(selectedRun.status);
  const canReview = selectedRun?.status === "calculated";
  const canApprove = selectedRun && ["calculated", "reviewed"].includes(selectedRun.status);
  const canFinalize = selectedRun?.status === "approved";
  const canCancel = selectedRun && !["finalized", "cancelled"].includes(selectedRun.status);
  const canEdit = selectedRun && !["approved", "finalized", "cancelled"].includes(selectedRun.status);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Calculator className="text-emerald-600" />מנוע שכר ישראלי</h1>
          <p className="text-muted-foreground text-sm mt-1">חישוב שכר מלא לפי חוקי מס ישראלים 2025 — מס הכנסה, ביטוח לאומי, פנסיה, קרן השתלמות</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-emerald-600 text-foreground px-4 py-2 rounded-xl hover:bg-emerald-700 shadow font-medium text-sm">
          <Play size={16} />ריצת שכר חדשה
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">ריצות שכר</h2>
            <button onClick={loadRuns} className="p-1.5 hover:bg-muted rounded-lg"><RefreshCw size={14} /></button>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-20 bg-muted/50 rounded-xl animate-pulse" />)}
            </div>
          ) : runs.length === 0 ? (
            <div className="bg-card border rounded-xl p-8 text-center">
              <Calculator className="text-muted-foreground mx-auto mb-3" size={36} />
              <p className="text-muted-foreground text-sm">אין ריצות שכר עדיין</p>
              <button onClick={() => setShowCreate(true)} className="mt-3 text-sm text-emerald-600 hover:underline">צור ריצה ראשונה</button>
            </div>
          ) : (
            <div className="space-y-2">
              {runs.map(run => (
                <div key={run.id}
                  onClick={() => { setSelectedRun(run); loadRunDetail(run.id); }}
                  className={`bg-card border rounded-xl p-4 cursor-pointer hover:shadow-md transition-all ${selectedRun?.id === run.id ? "ring-2 ring-blue-500 border-blue-300" : ""}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-bold text-sm">{run.run_number}</div>
                      <div className="text-xs text-muted-foreground">{monthNames[run.period_month]} {run.period_year}</div>
                    </div>
                    <RunStatusBadge status={run.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">עובדים: </span><span className="font-medium">{run.employee_count}</span></div>
                    <div><span className="text-muted-foreground">ברוטו: </span><span className="font-medium text-emerald-600">{fmtCur(run.total_gross)}</span></div>
                    <div><span className="text-muted-foreground">נטו: </span><span className="font-medium">{fmtCur(run.total_net)}</span></div>
                    <div><span className="text-muted-foreground">עלות כוללת: </span><span className="font-medium text-purple-600">{fmtCur(run.total_cost_to_employer)}</span></div>
                  </div>
                  <div className="mt-3">
                    <WorkflowProgress status={run.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          {!selectedRun ? (
            <div className="bg-card border rounded-2xl p-12 text-center">
              <BarChart2 className="text-muted-foreground mx-auto mb-4" size={48} />
              <p className="text-muted-foreground">בחר ריצת שכר כדי לצפות בפרטים</p>
            </div>
          ) : (
            <>
              <div className="bg-card border rounded-2xl p-5">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="font-bold text-xl">{selectedRun.run_number}</h2>
                      <RunStatusBadge status={selectedRun.status} />
                    </div>
                    <p className="text-sm text-muted-foreground">{monthNames[selectedRun.period_month]} {selectedRun.period_year} • {selectedRun.employee_count} עובדים</p>
                  </div>
                  <WorkflowProgress status={selectedRun.status} />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                  {[
                    { label: "סה\"כ ברוטו", value: selectedRun.total_gross, color: "text-emerald-600", icon: TrendingUp },
                    { label: "סה\"כ נטו", value: selectedRun.total_net, color: "text-blue-600", icon: Wallet },
                    { label: "עלות מעסיק", value: selectedRun.total_employer_cost, color: "text-purple-600", icon: Building2 },
                    { label: "עלות כוללת", value: selectedRun.total_cost_to_employer, color: "text-orange-600", icon: DollarSign },
                  ].map((kpi, i) => (
                    <div key={i} className="bg-muted/30 rounded-xl p-3">
                      <kpi.icon size={16} className={`${kpi.color} mb-1`} />
                      <div className={`font-bold text-lg ${kpi.color}`}>{fmtCur(kpi.value)}</div>
                      <div className="text-xs text-muted-foreground">{kpi.label}</div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  {canCalculate && (
                    <button onClick={() => runAction("calculate", selectedRun.id)} disabled={!!actionLoading}
                      className="flex items-center gap-2 bg-blue-600 text-foreground px-4 py-2 rounded-xl hover:bg-blue-700 text-sm font-medium disabled:opacity-50">
                      {actionLoading === "calculate" ? <Loader2 size={14} className="animate-spin" /> : <Calculator size={14} />}
                      {actionLoading === "calculate" ? "מחשב..." : "חשב שכר"}
                    </button>
                  )}
                  {canReview && (
                    <button onClick={() => runAction("review", selectedRun.id)} disabled={!!actionLoading}
                      className="flex items-center gap-2 bg-amber-600 text-foreground px-4 py-2 rounded-xl hover:bg-amber-700 text-sm font-medium disabled:opacity-50">
                      {actionLoading === "review" ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                      {actionLoading === "review" ? "מסמן..." : "סמן כנסקר"}
                    </button>
                  )}
                  {canApprove && (
                    <button onClick={() => runAction("approve", selectedRun.id)} disabled={!!actionLoading}
                      className="flex items-center gap-2 bg-green-600 text-foreground px-4 py-2 rounded-xl hover:bg-green-700 text-sm font-medium disabled:opacity-50">
                      {actionLoading === "approve" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      {actionLoading === "approve" ? "מאשר..." : "אשר ריצה"}
                    </button>
                  )}
                  {canFinalize && (
                    <button onClick={() => runAction("finalize", selectedRun.id)} disabled={!!actionLoading}
                      className="flex items-center gap-2 bg-emerald-700 text-foreground px-4 py-2 rounded-xl hover:bg-emerald-800 text-sm font-medium disabled:opacity-50">
                      {actionLoading === "finalize" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      {actionLoading === "finalize" ? "מסיים..." : "סיים וצור תלושים"}
                    </button>
                  )}
                  {canCancel && (
                    <button onClick={() => runAction("cancel", selectedRun.id)} disabled={!!actionLoading}
                      className="flex items-center gap-2 bg-red-600/10 text-red-600 border border-red-200 px-4 py-2 rounded-xl hover:bg-red-50 text-sm font-medium disabled:opacity-50">
                      {actionLoading === "cancel" ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
                      בטל ריצה
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-card border rounded-2xl">
                <div className="p-4 border-b flex items-center justify-between">
                  <h3 className="font-bold flex items-center gap-2"><Users size={16} />חישובים לפי עובד ({filteredCalcs.length})</h3>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש עובד..." className="bg-background border rounded-lg px-3 py-1.5 text-sm w-48" />
                </div>

                {calcsLoading ? (
                  <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-muted-foreground" /></div>
                ) : filteredCalcs.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    {selectedRun.status === "draft" ? "לחץ על 'חשב שכר' כדי להריץ את החישוב" : "אין עובדים"}
                  </div>
                ) : (
                  <div>
                    <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_80px] gap-2 px-4 py-2 bg-muted/30 text-xs text-muted-foreground font-medium">
                      <span>עובד</span>
                      <span>ברוטו</span>
                      <span>ניכויים</span>
                      <span>נטו</span>
                      <span>עלות מעסיק</span>
                      <span>פעולות</span>
                    </div>
                    {filteredCalcs.map(calc => (
                      <div key={calc.id}>
                        <div
                          className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_80px] gap-2 px-4 py-3 border-t hover:bg-muted/20 items-center text-sm cursor-pointer"
                          onClick={() => setExpandedId(expandedId === calc.id ? null : calc.id)}>
                          <div>
                            <div className="font-medium">{calc.employee_name}</div>
                            <div className="text-xs text-muted-foreground">{calc.department}</div>
                          </div>
                          <span className="font-medium text-emerald-700">{fmtCur(calc.gross_salary)}</span>
                          <span className="text-red-600">{fmtCur(calc.total_deductions)}</span>
                          <span className="font-bold">{fmtCur(calc.net_salary)}</span>
                          <span className="text-purple-600">{fmtCur(calc.total_employer_cost)}</span>
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <button onClick={() => setPayslipCalc(calc)} className="p-1 hover:bg-blue-100 rounded text-blue-600"><Eye size={14} /></button>
                            {canEdit && <button onClick={() => setAdjustCalc(calc)} className="p-1 hover:bg-amber-100 rounded text-amber-600"><Edit2 size={14} /></button>}
                            <button className="p-1 hover:bg-muted rounded text-muted-foreground" onClick={() => setExpandedId(expandedId === calc.id ? null : calc.id)}>
                              {expandedId === calc.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                          </div>
                        </div>
                        {expandedId === calc.id && (
                          <div className="px-4 py-3 bg-muted/20 border-t">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                              <div className="bg-card rounded-lg p-2"><p className="text-muted-foreground">שכר בסיס</p><p className="font-medium">{fmtCur(calc.base_salary)}</p></div>
                              <div className="bg-card rounded-lg p-2"><p className="text-muted-foreground">מס הכנסה</p><p className="font-medium text-red-600">{fmtCur(calc.income_tax)}</p></div>
                              <div className="bg-card rounded-lg p-2"><p className="text-muted-foreground">ביט"ל + בריאות</p><p className="font-medium text-red-600">{fmtCur(calc.bituach_leumi_employee)}</p></div>
                              <div className="bg-card rounded-lg p-2"><p className="text-muted-foreground">פנסיה (עובד)</p><p className="font-medium text-red-600">{fmtCur(calc.pension_employee)}</p></div>
                              <div className="bg-card rounded-lg p-2"><p className="text-muted-foreground">קה"ש (עובד)</p><p className="font-medium text-red-600">{fmtCur(calc.education_fund_employee)}</p></div>
                              <div className="bg-card rounded-lg p-2"><p className="text-muted-foreground">פנסיה (מעסיק)</p><p className="font-medium text-purple-600">{fmtCur(calc.pension_employer)}</p></div>
                              <div className="bg-card rounded-lg p-2"><p className="text-muted-foreground">פיצויים</p><p className="font-medium text-purple-600">{fmtCur(calc.severance_contrib)}</p></div>
                              <div className="bg-card rounded-lg p-2"><p className="text-muted-foreground">ביט"ל (מעסיק)</p><p className="font-medium text-purple-600">{fmtCur(calc.bituach_leumi_employer)}</p></div>
                            </div>
                            {calc.adjustment_notes && (
                              <div className="mt-2 text-xs bg-amber-50 border border-amber-200 rounded-lg p-2 text-amber-700">
                                הערה: {calc.adjustment_notes}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showCreate && <CreateRunModal onClose={() => setShowCreate(false)} onCreated={(run) => { loadRuns(); setSelectedRun(run); loadRunDetail(run.id); }} />}
        {adjustCalc && selectedRun && (
          <AdjustModal calc={adjustCalc} runId={selectedRun.id} onClose={() => setAdjustCalc(null)} onSaved={() => loadRunDetail(selectedRun.id)} />
        )}
        {payslipCalc && selectedRun && (
          <PayslipDetailModal calc={payslipCalc} period={selectedRun.period} runId={selectedRun.id} onClose={() => setPayslipCalc(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
