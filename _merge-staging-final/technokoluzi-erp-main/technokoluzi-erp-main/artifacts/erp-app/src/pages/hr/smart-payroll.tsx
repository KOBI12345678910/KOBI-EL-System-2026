import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import {
  Calculator, DollarSign, Users, FileText, Play, CheckCircle, Plus, Trash2,
  TrendingUp, Building2, Briefcase, Clock, RefreshCw, ChevronDown, ChevronUp
} from "lucide-react";

interface PayrollRun {
  id: number;
  period: string;
  run_date: string;
  total_gross: string;
  total_deductions: string;
  total_net: string;
  total_employer_cost: string;
  status: string;
  approved_by: string | null;
  notes: string | null;
  created_at: string;
  entries?: PayrollEntry[];
}

interface PayrollEntry {
  id: number;
  run_id: number;
  employee_id: number;
  employee_name: string;
  employee_type: string;
  base_salary: string;
  hours_worked: string;
  overtime_hours: string;
  overtime_rate: string;
  projects_count: number;
  total_project_value: string;
  commission_rate: number;
  commission_amount: string;
  bonus: string;
  gross_pay: string;
  income_tax: string;
  social_security: string;
  health_insurance: string;
  pension_employee: string;
  pension_employer: string;
  severance_fund: string;
  total_deductions: string;
  net_pay: string;
  employer_total_cost: string;
}

interface ContractorPayment {
  id: number;
  contractor_name: string;
  payment_model: string;
  projects: any[];
  total_amount: string;
  vat_amount: string;
  total_with_vat: string;
  invoice_number: string;
  status: string;
}

interface Dashboard {
  latestRun: PayrollRun | null;
  runs: PayrollRun[];
  totalEmployees: number;
  avgSalary: number;
  totalContractors: number;
  totalGross: number;
  totalNet: number;
  totalEmployerCost: number;
}

const fmtILS = (v: number | string) => {
  const n = typeof v === "string" ? parseFloat(v) || 0 : v;
  return n.toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
};

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  calculated: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  paid: "bg-purple-100 text-purple-700",
};

const statusLabels: Record<string, string> = {
  draft: "טיוטה",
  calculated: "מחושב",
  approved: "מאושר",
  paid: "שולם",
};

const empTypeLabels: Record<string, string> = {
  salaried: "שכיר",
  hourly: "שעתי",
  contractor_pct: "קבלן %",
  contractor_meter: "קבלן מטר",
};

export default function SmartPayrollPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [contractors, setContractors] = useState<ContractorPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"runs" | "entries" | "contractors">("runs");
  const [showNewRun, setShowNewRun] = useState(false);
  const [showNewEntry, setShowNewEntry] = useState(false);
  const [showNewContractor, setShowNewContractor] = useState(false);
  const [newPeriod, setNewPeriod] = useState(new Date().toISOString().slice(0, 7));

  const [entryForm, setEntryForm] = useState({
    employee_name: "", employee_type: "salaried", base_salary: "",
    hours_worked: "", overtime_hours: "", overtime_rate: "1.25",
    projects_count: "", total_project_value: "", commission_rate: "", bonus: "",
  });

  const [contractorForm, setContractorForm] = useState({
    contractor_name: "", payment_model: "percentage", invoice_number: "",
    projects: [{ project_name: "", value: "", meters: "", rate: "", amount: "" }],
  });

  const loadDashboard = useCallback(async () => {
    try {
      const res = await authFetch("/api/payroll/dashboard");
      const data = await res.json();
      setDashboard(data);
      setRuns(data.runs || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const loadEntries = async (runId: number) => {
    const res = await authFetch(`/api/payroll/runs/${runId}`);
    const data = await res.json();
    setSelectedRun(data);
    setEntries(data.entries || []);
    setTab("entries");
    // Load contractors
    const cRes = await authFetch(`/api/payroll/contractors/${runId}`);
    setContractors(await cRes.json());
  };

  const createRun = async () => {
    await authFetch("/api/payroll/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period: newPeriod }) });
    setShowNewRun(false);
    loadDashboard();
  };

  const calculateRun = async (runId: number) => {
    setLoading(true);
    const res = await authFetch(`/api/payroll/runs/${runId}/calculate`, { method: "POST" });
    const data = await res.json();
    setSelectedRun(data);
    setEntries(data.entries || []);
    loadDashboard();
    setLoading(false);
  };

  const approveRun = async (runId: number) => {
    await authFetch(`/api/payroll/runs/${runId}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approved_by: "Admin" }) });
    loadDashboard();
    if (selectedRun) loadEntries(runId);
  };

  const addEntry = async () => {
    if (!selectedRun) return;
    await authFetch(`/api/payroll/runs/${selectedRun.id}/entries`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...entryForm, employee_id: Date.now() }),
    });
    setShowNewEntry(false);
    setEntryForm({ employee_name: "", employee_type: "salaried", base_salary: "", hours_worked: "", overtime_hours: "", overtime_rate: "1.25", projects_count: "", total_project_value: "", commission_rate: "", bonus: "" });
    loadEntries(selectedRun.id);
  };

  const deleteEntry = async (entryId: number) => {
    await authFetch(`/api/payroll/entries/${entryId}`, { method: "DELETE" });
    if (selectedRun) loadEntries(selectedRun.id);
  };

  const addContractorPayment = async () => {
    if (!selectedRun) return;
    await authFetch("/api/payroll/contractor-payment", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...contractorForm, run_id: selectedRun.id, contractor_id: Date.now() }),
    });
    setShowNewContractor(false);
    setContractorForm({ contractor_name: "", payment_model: "percentage", invoice_number: "", projects: [{ project_name: "", value: "", meters: "", rate: "", amount: "" }] });
    const cRes = await authFetch(`/api/payroll/contractors/${selectedRun.id}`);
    setContractors(await cRes.json());
  };

  if (loading && !dashboard) return <div className="p-8 text-center text-gray-400">טוען נתוני שכר...</div>;

  return (
    <div className="p-4 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calculator className="w-7 h-7 text-blue-600" />
            מחשבון שכר חכם
          </h1>
          <p className="text-sm text-gray-500 mt-1">חישוב שכר ישראלי - מס הכנסה, ביטוח לאומי, בריאות, פנסיה</p>
        </div>
        <button onClick={() => setShowNewRun(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
          <Plus className="w-4 h-4" /> ריצת שכר חדשה
        </button>
      </div>

      {/* Dashboard Cards */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Users className="w-4 h-4" /> עובדים</div>
            <div className="text-2xl font-bold">{dashboard.totalEmployees}</div>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><DollarSign className="w-4 h-4" /> ברוטו כולל</div>
            <div className="text-2xl font-bold text-blue-600">{fmtILS(dashboard.totalGross)}</div>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><TrendingUp className="w-4 h-4" /> נטו כולל</div>
            <div className="text-2xl font-bold text-green-600">{fmtILS(dashboard.totalNet)}</div>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Building2 className="w-4 h-4" /> עלות מעסיק</div>
            <div className="text-2xl font-bold text-orange-600">{fmtILS(dashboard.totalEmployerCost)}</div>
          </div>
        </div>
      )}

      {/* New Run Modal */}
      {showNewRun && (
        <div className="bg-white rounded-xl border p-6 shadow-md">
          <h3 className="text-lg font-semibold mb-4">ריצת שכר חדשה</h3>
          <div className="flex gap-4 items-end">
            <div>
              <label className="block text-sm text-gray-600 mb-1">תקופה</label>
              <input type="month" value={newPeriod} onChange={(e) => setNewPeriod(e.target.value)} className="border rounded-lg px-3 py-2" />
            </div>
            <button onClick={createRun} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">צור</button>
            <button onClick={() => setShowNewRun(false)} className="text-gray-500 px-4 py-2">ביטול</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button onClick={() => setTab("runs")} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === "runs" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}>
          ריצות שכר ({runs.length})
        </button>
        {selectedRun && (
          <>
            <button onClick={() => setTab("entries")} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === "entries" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}>
              פירוט שכר ({entries.length})
            </button>
            <button onClick={() => setTab("contractors")} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === "contractors" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}>
              קבלנים ({contractors.length})
            </button>
          </>
        )}
      </div>

      {/* Runs Table */}
      {tab === "runs" && (
        <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-right p-3">תקופה</th>
                <th className="text-right p-3">תאריך</th>
                <th className="text-right p-3">ברוטו</th>
                <th className="text-right p-3">ניכויים</th>
                <th className="text-right p-3">נטו</th>
                <th className="text-right p-3">עלות מעסיק</th>
                <th className="text-right p-3">סטטוס</th>
                <th className="text-right p-3">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => loadEntries(r.id)}>
                  <td className="p-3 font-medium">{r.period}</td>
                  <td className="p-3 text-gray-500">{r.run_date?.slice(0, 10)}</td>
                  <td className="p-3">{fmtILS(r.total_gross)}</td>
                  <td className="p-3 text-red-600">{fmtILS(r.total_deductions)}</td>
                  <td className="p-3 text-green-600 font-medium">{fmtILS(r.total_net)}</td>
                  <td className="p-3 text-orange-600">{fmtILS(r.total_employer_cost)}</td>
                  <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[r.status] || ""}`}>{statusLabels[r.status] || r.status}</span></td>
                  <td className="p-3">
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => calculateRun(r.id)} className="p-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100" title="חשב"><Play className="w-3.5 h-3.5" /></button>
                      {r.status === "calculated" && <button onClick={() => approveRun(r.id)} className="p-1.5 bg-green-50 text-green-600 rounded hover:bg-green-100" title="אשר"><CheckCircle className="w-3.5 h-3.5" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
              {runs.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-gray-400">אין ריצות שכר</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Entries Table */}
      {tab === "entries" && selectedRun && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-700">ריצת שכר: {selectedRun.period} <span className={`px-2 py-0.5 rounded-full text-xs ${statusColors[selectedRun.status]}`}>{statusLabels[selectedRun.status]}</span></h3>
            <div className="flex gap-2">
              <button onClick={() => calculateRun(selectedRun.id)} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700"><Play className="w-3.5 h-3.5" /> חשב שכר</button>
              <button onClick={() => setShowNewEntry(true)} className="flex items-center gap-1 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-200"><Plus className="w-3.5 h-3.5" /> הוסף עובד</button>
            </div>
          </div>

          {showNewEntry && (
            <div className="bg-blue-50 rounded-xl p-4 space-y-3 border border-blue-200">
              <h4 className="font-medium text-blue-800">הוספת עובד לריצה</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <input placeholder="שם עובד" value={entryForm.employee_name} onChange={(e) => setEntryForm({ ...entryForm, employee_name: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
                <select value={entryForm.employee_type} onChange={(e) => setEntryForm({ ...entryForm, employee_type: e.target.value })} className="border rounded-lg px-3 py-2 text-sm">
                  <option value="salaried">שכיר</option>
                  <option value="hourly">שעתי</option>
                  <option value="contractor_pct">קבלן %</option>
                  <option value="contractor_meter">קבלן מטר</option>
                </select>
                <input type="number" placeholder="שכר בסיס" value={entryForm.base_salary} onChange={(e) => setEntryForm({ ...entryForm, base_salary: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
                <input type="number" placeholder="שעות עבודה" value={entryForm.hours_worked} onChange={(e) => setEntryForm({ ...entryForm, hours_worked: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
                <input type="number" placeholder="שעות נוספות" value={entryForm.overtime_hours} onChange={(e) => setEntryForm({ ...entryForm, overtime_hours: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
                <input type="number" placeholder="בונוס" value={entryForm.bonus} onChange={(e) => setEntryForm({ ...entryForm, bonus: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
                <input type="number" placeholder="שווי פרויקטים" value={entryForm.total_project_value} onChange={(e) => setEntryForm({ ...entryForm, total_project_value: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
                <input type="number" placeholder="עמלה %" value={entryForm.commission_rate} onChange={(e) => setEntryForm({ ...entryForm, commission_rate: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-2">
                <button onClick={addEntry} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm">הוסף</button>
                <button onClick={() => setShowNewEntry(false)} className="text-gray-500 text-sm">ביטול</button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-right p-2">שם</th>
                  <th className="text-right p-2">סוג</th>
                  <th className="text-right p-2">בסיס</th>
                  <th className="text-right p-2">נוספות</th>
                  <th className="text-right p-2">בונוס</th>
                  <th className="text-right p-2">ברוטו</th>
                  <th className="text-right p-2">מס הכנסה</th>
                  <th className="text-right p-2">ב.ל.</th>
                  <th className="text-right p-2">בריאות</th>
                  <th className="text-right p-2">פנסיה</th>
                  <th className="text-right p-2">ניכויים</th>
                  <th className="text-right p-2 text-green-700 font-bold">נטו</th>
                  <th className="text-right p-2 text-orange-700">עלות מעסיק</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t hover:bg-gray-50">
                    <td className="p-2 font-medium">{e.employee_name}</td>
                    <td className="p-2"><span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{empTypeLabels[e.employee_type] || e.employee_type}</span></td>
                    <td className="p-2">{fmtILS(e.base_salary)}</td>
                    <td className="p-2">{parseFloat(e.overtime_hours) || 0}h</td>
                    <td className="p-2">{fmtILS(e.bonus)}</td>
                    <td className="p-2 font-medium">{fmtILS(e.gross_pay)}</td>
                    <td className="p-2 text-red-600">{fmtILS(e.income_tax)}</td>
                    <td className="p-2 text-red-500">{fmtILS(e.social_security)}</td>
                    <td className="p-2 text-red-500">{fmtILS(e.health_insurance)}</td>
                    <td className="p-2 text-red-500">{fmtILS(e.pension_employee)}</td>
                    <td className="p-2 text-red-700 font-medium">{fmtILS(e.total_deductions)}</td>
                    <td className="p-2 text-green-700 font-bold">{fmtILS(e.net_pay)}</td>
                    <td className="p-2 text-orange-600">{fmtILS(e.employer_total_cost)}</td>
                    <td className="p-2"><button onClick={() => deleteEntry(e.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
                {entries.length === 0 && <tr><td colSpan={14} className="p-8 text-center text-gray-400">אין רשומות - הוסף עובדים</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Contractors Tab */}
      {tab === "contractors" && selectedRun && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-700">תשלומי קבלנים - {selectedRun.period}</h3>
            <button onClick={() => setShowNewContractor(true)} className="flex items-center gap-1 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-200"><Plus className="w-3.5 h-3.5" /> הוסף קבלן</button>
          </div>

          {showNewContractor && (
            <div className="bg-orange-50 rounded-xl p-4 space-y-3 border border-orange-200">
              <h4 className="font-medium text-orange-800">חישוב תשלום קבלן</h4>
              <div className="grid grid-cols-3 gap-3">
                <input placeholder="שם קבלן" value={contractorForm.contractor_name} onChange={(e) => setContractorForm({ ...contractorForm, contractor_name: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
                <select value={contractorForm.payment_model} onChange={(e) => setContractorForm({ ...contractorForm, payment_model: e.target.value })} className="border rounded-lg px-3 py-2 text-sm">
                  <option value="percentage">אחוז מפרויקט</option>
                  <option value="per_meter">לפי מטר</option>
                  <option value="fixed">סכום קבוע</option>
                </select>
                <input placeholder="מספר חשבונית" value={contractorForm.invoice_number} onChange={(e) => setContractorForm({ ...contractorForm, invoice_number: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
              </div>
              {contractorForm.projects.map((p, i) => (
                <div key={i} className="grid grid-cols-5 gap-2">
                  <input placeholder="שם פרויקט" value={p.project_name} onChange={(e) => { const ps = [...contractorForm.projects]; ps[i].project_name = e.target.value; setContractorForm({ ...contractorForm, projects: ps }); }} className="border rounded px-2 py-1.5 text-sm" />
                  <input type="number" placeholder="שווי" value={p.value} onChange={(e) => { const ps = [...contractorForm.projects]; ps[i].value = e.target.value; setContractorForm({ ...contractorForm, projects: ps }); }} className="border rounded px-2 py-1.5 text-sm" />
                  <input type="number" placeholder="מטרים" value={p.meters} onChange={(e) => { const ps = [...contractorForm.projects]; ps[i].meters = e.target.value; setContractorForm({ ...contractorForm, projects: ps }); }} className="border rounded px-2 py-1.5 text-sm" />
                  <input type="number" placeholder="תעריף" value={p.rate} onChange={(e) => { const ps = [...contractorForm.projects]; ps[i].rate = e.target.value; setContractorForm({ ...contractorForm, projects: ps }); }} className="border rounded px-2 py-1.5 text-sm" />
                  <button onClick={() => { const ps = contractorForm.projects.filter((_, j) => j !== i); setContractorForm({ ...contractorForm, projects: ps.length ? ps : [{ project_name: "", value: "", meters: "", rate: "", amount: "" }] }); }} className="text-red-400"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              <button onClick={() => setContractorForm({ ...contractorForm, projects: [...contractorForm.projects, { project_name: "", value: "", meters: "", rate: "", amount: "" }] })} className="text-sm text-blue-600">+ פרויקט נוסף</button>
              <div className="flex gap-2">
                <button onClick={addContractorPayment} className="bg-orange-600 text-white px-4 py-1.5 rounded-lg text-sm">חשב ושמור</button>
                <button onClick={() => setShowNewContractor(false)} className="text-gray-500 text-sm">ביטול</button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-right p-3">קבלן</th>
                  <th className="text-right p-3">מודל</th>
                  <th className="text-right p-3">סכום</th>
                  <th className="text-right p-3">מע"מ</th>
                  <th className="text-right p-3">סה"כ כולל מע"מ</th>
                  <th className="text-right p-3">חשבונית</th>
                  <th className="text-right p-3">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {contractors.map((c) => (
                  <tr key={c.id} className="border-t hover:bg-gray-50">
                    <td className="p-3 font-medium">{c.contractor_name}</td>
                    <td className="p-3">{c.payment_model === "percentage" ? "אחוז" : c.payment_model === "per_meter" ? "מטר" : "קבוע"}</td>
                    <td className="p-3">{fmtILS(c.total_amount)}</td>
                    <td className="p-3 text-gray-500">{fmtILS(c.vat_amount)}</td>
                    <td className="p-3 font-bold text-blue-700">{fmtILS(c.total_with_vat)}</td>
                    <td className="p-3">{c.invoice_number || "-"}</td>
                    <td className="p-3"><span className="bg-gray-100 px-2 py-0.5 rounded text-xs">{c.status}</span></td>
                  </tr>
                ))}
                {contractors.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-gray-400">אין תשלומי קבלנים</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
