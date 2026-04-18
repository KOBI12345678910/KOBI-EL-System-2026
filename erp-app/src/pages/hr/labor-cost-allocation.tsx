import { useState, useEffect, useMemo, useCallback } from "react";
import {
  GitBranch, Plus, Trash2, Save, Search, BarChart2, Building2,
  Briefcase, Factory, X, Loader2, AlertTriangle, CheckCircle2,
  RefreshCw, DollarSign, Users, TrendingUp, PieChart
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const API = "/api";
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtCur = (v: any) => `₪${fmt(v)}`;
const monthNames = ["", "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

const COST_CENTER_TYPES = [
  { value: "department", label: "מחלקה", icon: Building2 },
  { value: "project", label: "פרויקט", icon: Briefcase },
  { value: "production_order", label: "פקודת ייצור", icon: Factory },
];

const COLORS = ["bg-blue-500", "bg-emerald-500", "bg-purple-500", "bg-amber-500", "bg-red-500", "bg-cyan-500", "bg-pink-500"];

interface Allocation {
  id: number;
  employee_id: number;
  employee_name: string;
  period: string;
  cost_center_type: string;
  cost_center_id: string;
  cost_center_name: string;
  allocation_pct: number;
  allocated_gross: number;
  allocated_net: number;
  allocated_employer_cost: number;
  allocated_total_cost: number;
  notes?: string;
}

type AllocationMode = "percentage" | "hours";

interface AllocationSplit {
  costCenterType: string;
  costCenterId: string;
  costCenterName: string;
  allocationPct: number;
  allocationHours?: number;
}

function AllocationEditor({ employeeId, employeeName, period, grossSalary, netSalary, employerCost, onClose, onSaved }: {
  employeeId: number; employeeName: string; period: string;
  grossSalary: number; netSalary: number; employerCost: number;
  onClose: () => void; onSaved: () => void;
}) {
  const totalCost = grossSalary + employerCost;
  const [mode, setMode] = useState<AllocationMode>("percentage");
  const [totalHours, setTotalHours] = useState(182);
  const [splits, setSplits] = useState<AllocationSplit[]>([
    { costCenterType: "department", costCenterId: "", costCenterName: "", allocationPct: 100, allocationHours: 182 }
  ]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const computedSplits = splits.map(sp => {
    if (mode === "hours") {
      const hrs = Number(sp.allocationHours || 0);
      const pct = totalHours > 0 ? +(hrs / totalHours * 100).toFixed(2) : 0;
      return { ...sp, allocationPct: pct };
    }
    return sp;
  });

  const totalPct = computedSplits.reduce((s, sp) => s + sp.allocationPct, 0);
  const isValid = Math.abs(totalPct - 100) < 0.5;

  const addSplit = () => setSplits(p => [...p, { costCenterType: "department", costCenterId: "", costCenterName: "", allocationPct: 0, allocationHours: 0 }]);
  const removeSplit = (i: number) => setSplits(p => p.filter((_, idx) => idx !== i));
  const updateSplit = (i: number, k: keyof AllocationSplit, v: any) => setSplits(p => p.map((s, idx) => idx === i ? { ...s, [k]: v } : s));
  const distribute = () => {
    if (mode === "hours") {
      const hrs = Math.floor(totalHours / splits.length);
      const remainder = totalHours - hrs * (splits.length - 1);
      setSplits(p => p.map((s, i) => ({ ...s, allocationHours: i === p.length - 1 ? remainder : hrs })));
    } else {
      const pct = Math.floor(10000 / splits.length) / 100;
      const remainder = +(100 - pct * (splits.length - 1)).toFixed(2);
      setSplits(p => p.map((s, i) => ({ ...s, allocationPct: i === p.length - 1 ? remainder : pct })));
    }
  };

  const save = async () => {
    if (!isValid) { toast({ title: "שגיאה", description: `סך האחוזים חייב להיות 100% (כרגע: ${totalPct.toFixed(1)}%)`, variant: "destructive" }); return; }
    setLoading(true);
    try {
      const payload = computedSplits.map(sp => ({
        employeeId, employeeName, period,
        costCenterType: sp.costCenterType,
        costCenterId: sp.costCenterId || sp.costCenterName,
        costCenterName: sp.costCenterName,
        allocationPct: sp.allocationPct,
        allocationHours: mode === "hours" ? sp.allocationHours : undefined,
        allocatedGross: +(grossSalary * sp.allocationPct / 100).toFixed(2),
        allocatedNet: +(netSalary * sp.allocationPct / 100).toFixed(2),
        allocatedEmployerCost: +(employerCost * sp.allocationPct / 100).toFixed(2),
        allocatedTotalCost: +(totalCost * sp.allocationPct / 100).toFixed(2),
      }));
      const r = await authFetch(`${API}/payroll/labor-cost-allocations`, { method: "POST", headers, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast({ title: "נשמר", description: d.message });
      onSaved();
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
        className="bg-card border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b flex justify-between items-center">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2"><GitBranch size={18} className="text-blue-500" />הקצאת עלות עבודה</h2>
            <p className="text-sm text-muted-foreground">{employeeName} • {period}</p>
          </div>
          <button onClick={onClose} className="hover:bg-muted p-1 rounded-lg"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-5" dir="rtl">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
              <div className="text-xs text-emerald-600 mb-1">ברוטו</div>
              <div className="font-bold text-emerald-700 text-lg">{fmtCur(grossSalary)}</div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
              <div className="text-xs text-blue-600 mb-1">נטו</div>
              <div className="font-bold text-blue-700 text-lg">{fmtCur(netSalary)}</div>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
              <div className="text-xs text-purple-600 mb-1">עלות מעסיק</div>
              <div className="font-bold text-purple-700 text-lg">{fmtCur(employerCost)}</div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm">הקצאות ({splits.length})</h3>
              <div className="flex gap-1 bg-muted rounded-lg p-0.5 text-xs">
                <button onClick={() => setMode("percentage")}
                  className={`px-2 py-1 rounded-md font-medium transition-all ${mode === "percentage" ? "bg-card shadow text-blue-700" : "text-muted-foreground"}`}>
                  לפי %
                </button>
                <button onClick={() => setMode("hours")}
                  className={`px-2 py-1 rounded-md font-medium transition-all ${mode === "hours" ? "bg-card shadow text-blue-700" : "text-muted-foreground"}`}>
                  לפי שעות
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={distribute} className="text-xs text-blue-600 hover:underline">חלק שווה</button>
              <button onClick={addSplit} className="flex items-center gap-1 text-xs bg-blue-600 text-foreground px-3 py-1.5 rounded-lg hover:bg-blue-700">
                <Plus size={12} />הוסף
              </button>
            </div>
          </div>

          {mode === "hours" && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
              <label className="text-xs text-amber-700 font-medium whitespace-nowrap">סה"כ שעות בחודש:</label>
              <input type="number" min="1" max="300" value={totalHours} onChange={e => setTotalHours(Math.max(1, parseInt(e.target.value) || 182))}
                className="w-24 bg-white border border-amber-200 rounded-lg px-2 py-1 text-sm" />
              <span className="text-xs text-amber-600">האחוזים יחושבו אוטומטית</span>
            </div>
          )}

          <div className="space-y-3">
            {splits.map((sp, i) => {
              const computed = computedSplits[i];
              const amt = totalCost * computed.allocationPct / 100;
              return (
                <div key={i} className="bg-muted/30 rounded-xl p-4 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">סוג מרכז עלות</label>
                      <select value={sp.costCenterType} onChange={e => updateSplit(i, "costCenterType", e.target.value)}
                        className="w-full bg-background border rounded-lg px-2 py-2 text-sm">
                        {COST_CENTER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">שם</label>
                      <input value={sp.costCenterName} onChange={e => updateSplit(i, "costCenterName", e.target.value)}
                        placeholder="שם מרכז עלות..." className="w-full bg-background border rounded-lg px-2 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">
                        {mode === "hours" ? "שעות" : "אחוז הקצאה"}
                      </label>
                      <div className="flex items-center gap-2">
                        {mode === "hours" ? (
                          <input type="number" min="0" max={totalHours} step="0.5" value={sp.allocationHours || 0}
                            onChange={e => updateSplit(i, "allocationHours", Math.max(0, Number(e.target.value)))}
                            className="w-full bg-background border rounded-lg px-2 py-2 text-sm" />
                        ) : (
                          <input type="number" min="0" max="100" step="0.5" value={sp.allocationPct}
                            onChange={e => updateSplit(i, "allocationPct", Math.min(100, Math.max(0, Number(e.target.value))))}
                            className="w-full bg-background border rounded-lg px-2 py-2 text-sm" />
                        )}
                        <button onClick={() => removeSplit(i)} className="p-2 hover:bg-red-100 rounded-lg text-red-500"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${COLORS[i % COLORS.length]} rounded-full transition-all`} style={{ width: `${Math.min(100, computed.allocationPct)}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{computed.allocationPct.toFixed(1)}% {mode === "hours" && sp.allocationHours ? `(${sp.allocationHours} שע')` : ""}</span>
                    <span className="font-medium text-foreground">עלות: {fmtCur(amt)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className={`flex items-center gap-2 p-3 rounded-xl border text-sm ${isValid ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
            {isValid ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            סה"כ: {totalPct.toFixed(1)}% {isValid ? "— תקין" : `— חסרים ${(100 - totalPct).toFixed(1)}%`}
          </div>

          <div className="flex gap-3 justify-end">
            <button onClick={onClose} className="px-4 py-2 bg-muted rounded-xl text-sm">ביטול</button>
            <button onClick={save} disabled={loading || !isValid}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-foreground rounded-xl text-sm hover:bg-blue-700 disabled:opacity-50">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {loading ? "שומר..." : "שמור הקצאות"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function LaborCostAllocationPage() {
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [report, setReport] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"allocations" | "report" | "employees">("allocations");
  const [editorEmp, setEditorEmp] = useState<any>(null);
  const { toast } = useToast();

  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await authFetch(`${API}/payroll/migrate`, { method: "POST", headers });
      const [allocR, reportR, empR] = await Promise.all([
        authFetch(`${API}/payroll/labor-cost-allocations?period=${period}`, { headers }),
        authFetch(`${API}/payroll/labor-cost-report?period=${period}`, { headers }),
        authFetch(`${API}/payroll/run-employees?month=${parseInt(period.split("-")[1])}&year=${parseInt(period.split("-")[0])}`, { headers }),
      ]);
      if (allocR.ok) setAllocations(await allocR.json());
      if (reportR.ok) setReport(await reportR.json());
      if (empR.ok) {
        const d = await empR.json();
        setEmployees(Array.isArray(d) ? d : []);
      }
    } catch {}
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const [py, pm] = period.split("-");

  const filteredAllocations = useMemo(() => {
    if (!search) return allocations;
    const s = search.toLowerCase();
    return allocations.filter(a => a.employee_name?.toLowerCase().includes(s) || a.cost_center_name?.toLowerCase().includes(s));
  }, [allocations, search]);

  const totalAllocated = report.reduce((s, r) => s + Number(r.total_cost || 0), 0);

  const groupedAllocations = useMemo(() => {
    const groups: Record<string, Allocation[]> = {};
    filteredAllocations.forEach(a => {
      if (!groups[a.employee_name]) groups[a.employee_name] = [];
      groups[a.employee_name].push(a);
    });
    return groups;
  }, [filteredAllocations]);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><GitBranch className="text-blue-600" />הקצאת עלות עבודה</h1>
          <p className="text-muted-foreground text-sm mt-1">פיצול עלות שכר לפי פרויקטים, מחלקות ופקודות ייצור</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={parseInt(pm)} onChange={e => setPeriod(`${py}-${String(e.target.value).padStart(2,"0")}`)} className="border rounded-xl px-3 py-2 text-sm bg-background">
            {monthNames.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select value={py} onChange={e => setPeriod(`${e.target.value}-${pm}`)} className="border rounded-xl px-3 py-2 text-sm bg-background">
            {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={load} className="p-2 hover:bg-muted rounded-xl border"><RefreshCw size={16} /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "עובדים מוקצים", value: String(Object.keys(groupedAllocations).length), icon: Users, color: "text-blue-600" },
          { label: "עלות מוקצית", value: fmtCur(totalAllocated), icon: DollarSign, color: "text-emerald-600" },
          { label: "מרכזי עלות", value: String(report.length), icon: Building2, color: "text-purple-600" },
          { label: "תקופה", value: `${monthNames[parseInt(pm)]} ${py}`, icon: TrendingUp, color: "text-orange-600" },
        ].map((kpi, i) => (
          <div key={i} className="bg-card border rounded-xl p-4">
            <kpi.icon size={18} className={`${kpi.color} mb-2`} />
            <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
        {[
          { id: "allocations", label: "הקצאות" },
          { id: "report", label: "דוח לפי מרכז עלות" },
          { id: "employees", label: "עובדים לא מוקצים" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? "bg-card shadow text-blue-700" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "allocations" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute right-3 top-2.5 text-muted-foreground" size={16} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש עובד, מרכז עלות..."
                className="w-full pr-10 pl-4 py-2 border rounded-xl text-sm bg-background" />
            </div>
          </div>

          {loading ? (
            <div className="h-40 flex items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : Object.keys(groupedAllocations).length === 0 ? (
            <div className="bg-card border rounded-2xl p-16 text-center">
              <GitBranch className="text-muted-foreground mx-auto mb-4" size={48} />
              <p className="text-muted-foreground mb-2">אין הקצאות לתקופה זו</p>
              <p className="text-xs text-muted-foreground">עבור לטאב "עובדים לא מוקצים" להגדרת הקצאות</p>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(groupedAllocations).map(([empName, empallocations]) => {
                const total = empallocations.reduce((s, a) => s + Number(a.allocated_total_cost), 0);
                return (
                  <div key={empName} className="bg-card border rounded-xl overflow-hidden">
                    <div className="px-5 py-3 bg-muted/30 flex justify-between items-center">
                      <div className="font-bold">{empName}</div>
                      <div className="text-sm text-muted-foreground">עלות: <span className="font-bold text-foreground">{fmtCur(total)}</span></div>
                    </div>
                    <div className="p-4 space-y-2">
                      {empallocations.map((a, i) => {
                        const TypeIcon = COST_CENTER_TYPES.find(t => t.value === a.cost_center_type)?.icon || Building2;
                        return (
                          <div key={a.id} className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${COLORS[i % COLORS.length]}`} />
                            <TypeIcon size={14} className="text-muted-foreground" />
                            <span className="text-sm flex-1">{a.cost_center_name}</span>
                            <span className="text-sm font-medium">{a.allocation_pct}%</span>
                            <span className="text-sm text-muted-foreground">{fmtCur(a.allocated_total_cost)}</span>
                          </div>
                        );
                      })}
                      <div className="h-2 bg-muted rounded-full overflow-hidden flex mt-2">
                        {empallocations.map((a, i) => (
                          <div key={i} className={`h-full ${COLORS[i % COLORS.length]}`} style={{ width: `${a.allocation_pct}%` }} title={`${a.cost_center_name}: ${a.allocation_pct}%`} />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "report" && (
        <div className="bg-card border rounded-2xl">
          <div className="p-4 border-b">
            <h3 className="font-bold flex items-center gap-2"><BarChart2 size={16} />דוח עלות לפי מרכז עלות</h3>
          </div>
          {report.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">אין נתונים לתקופה זו</div>
          ) : (
            <div>
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-3 bg-muted/30 text-xs text-muted-foreground font-medium">
                <span>מרכז עלות</span>
                <span>סוג</span>
                <span>עובדים</span>
                <span>עלות ברוטו</span>
                <span>עלות כוללת</span>
              </div>
              {report.map((r: any, i) => {
                const TypeIcon = COST_CENTER_TYPES.find(t => t.value === r.cost_center_type)?.icon || Building2;
                const pct = totalAllocated > 0 ? (Number(r.total_cost) / totalAllocated * 100) : 0;
                return (
                  <div key={i} className="px-4 py-3 border-t hover:bg-muted/20">
                    <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 items-center text-sm">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${COLORS[i % COLORS.length]}`} />
                        <TypeIcon size={14} className="text-muted-foreground" />
                        <span className="font-medium">{r.cost_center_name || "לא ידוע"}</span>
                      </div>
                      <span className="text-muted-foreground text-xs">{COST_CENTER_TYPES.find(t => t.value === r.cost_center_type)?.label}</span>
                      <span>{r.employee_count}</span>
                      <span className="text-emerald-600 font-medium">{fmtCur(r.total_gross)}</span>
                      <div>
                        <span className="font-bold">{fmtCur(r.total_cost)}</span>
                        <div className="h-1.5 bg-muted rounded-full mt-1">
                          <div className={`h-full rounded-full ${COLORS[i % COLORS.length]}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "employees" && (
        <div className="bg-card border rounded-2xl">
          <div className="p-4 border-b">
            <h3 className="font-bold flex items-center gap-2"><Users size={16} />עובדים לתקופה — הגדר הקצאות</h3>
          </div>
          {loading ? (
            <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-muted-foreground" /></div>
          ) : employees.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">אין רשומות שכר לתקופה זו</div>
          ) : (
            <div>
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_100px] gap-2 px-4 py-3 bg-muted/30 text-xs text-muted-foreground font-medium">
                <span>עובד</span>
                <span>ברוטו</span>
                <span>נטו</span>
                <span>עלות מעסיק</span>
                <span>הקצאה</span>
                <span>פעולה</span>
              </div>
              {employees.map((emp: any) => {
                const empAllocations = allocations.filter(a => a.employee_name === emp.employee_name);
                const hasAllocation = empAllocations.length > 0;
                return (
                  <div key={emp.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_100px] gap-2 px-4 py-3 border-t hover:bg-muted/20 items-center text-sm">
                    <div>
                      <div className="font-medium">{emp.employee_name}</div>
                      <div className="text-xs text-muted-foreground">{emp.department}</div>
                    </div>
                    <span className="text-emerald-600">{fmtCur(emp.gross_salary)}</span>
                    <span>{fmtCur(emp.net_salary)}</span>
                    <span className="text-purple-600">{fmtCur(emp.employer_cost)}</span>
                    <div>
                      {hasAllocation ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-600">
                          <CheckCircle2 size={12} />{empAllocations.length} הקצאות
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">לא מוקצה</span>
                      )}
                    </div>
                    <button
                      onClick={() => setEditorEmp({ id: emp.employee_id_ref || emp.id, name: emp.employee_name, gross: emp.gross_salary, net: emp.net_salary, employer: emp.employer_cost })}
                      className="flex items-center gap-1 text-xs bg-blue-600 text-foreground px-3 py-1.5 rounded-lg hover:bg-blue-700">
                      <GitBranch size={12} />הקצה
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {editorEmp && (
          <AllocationEditor
            employeeId={editorEmp.id}
            employeeName={editorEmp.name}
            period={period}
            grossSalary={Number(editorEmp.gross) || 0}
            netSalary={Number(editorEmp.net) || 0}
            employerCost={Number(editorEmp.employer) || 0}
            onClose={() => setEditorEmp(null)}
            onSaved={() => { load(); setTab("allocations"); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
