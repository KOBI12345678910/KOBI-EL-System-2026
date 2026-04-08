import { useState, useEffect, useMemo, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import {
  Building2, TrendingUp, DollarSign, Users, Percent,
  Search, RefreshCw, ChevronDown, ChevronUp, Loader2,
  PieChart as PieChartIcon, BarChart2
} from "lucide-react";

const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtCur = (v: any) => `₪${fmt(v)}`;
const monthNames = ["", "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

const COMPONENT_COLORS = [
  { key: "pension", label: "פנסיה (6.5%)", color: "#8b5cf6" },
  { key: "severance", label: "פיצויים (8.33%)", color: "#f59e0b" },
  { key: "bl", label: "ביטוח לאומי", color: "#3b82f6" },
  { key: "edFund", label: "קרן השתלמות (7.5%)", color: "#10b981" },
];

function MiniPieChart({ pension, severance, bl, edFund, totalGross }: any) {
  const segments = [
    { value: pension, color: "#8b5cf6" },
    { value: severance, color: "#f59e0b" },
    { value: bl, color: "#3b82f6" },
    { value: edFund, color: "#10b981" },
    { value: totalGross, color: "#e5e7eb" },
  ];
  const total = segments.reduce((s, sg) => s + Number(sg.value || 0), 0);
  if (total === 0) return <div className="w-16 h-16 rounded-full bg-muted" />;

  let cumulative = 0;
  const r = 16;
  const cx = 20, cy = 20;
  const circles: JSX.Element[] = [];

  segments.forEach((seg, i) => {
    const pct = Number(seg.value || 0) / total;
    const startAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    cumulative += pct;
    const endAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    if (pct === 0) return;
    if (pct >= 0.999) {
      circles.push(<circle key={i} cx={cx} cy={cy} r={r} fill={seg.color} />);
      return;
    }
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = pct > 0.5 ? 1 : 0;
    circles.push(
      <path key={i} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`} fill={seg.color} />
    );
  });

  return (
    <svg width="40" height="40" viewBox="0 0 40 40">
      {circles}
    </svg>
  );
}

export default function EmployerCost() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [employees, setEmployees] = useState<any[]>([]);
  const [deptSummary, setDeptSummary] = useState<any[]>([]);
  const [grandTotals, setGrandTotals] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedDept, setExpandedDept] = useState<string | null>(null);
  const [tab, setTab] = useState<"employees" | "departments">("departments");

  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const period = `${year}-${String(month).padStart(2, "0")}`;
      const [empR, sumR] = await Promise.all([
        authFetch(`/api/payroll/employer-cost-summary?period=${period}`, { headers }),
        authFetch(`/api/payroll/employer-cost-summary`, { headers }),
      ]);
      if (empR.ok) {
        const d = await empR.json();
        setEmployees(d.employees || []);
        setDeptSummary(d.departmentSummary || []);
      }
      if (sumR.ok) {
        const d = await sumR.json();
        setGrandTotals(d.grandTotals || {});
        if (!empR.ok) setDeptSummary(d.departmentSummary || []);
      }
    } catch {}
    setLoading(false);
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search) return employees;
    const s = search.toLowerCase();
    return employees.filter(e => e.employee_name?.toLowerCase().includes(s) || e.department?.toLowerCase().includes(s));
  }, [employees, search]);

  const totalEmployerCost = employees.reduce((s, e) => s + Number(e.total_employer_cost || 0), 0);
  const totalGross = employees.reduce((s, e) => s + Number(e.gross_salary || 0), 0);
  const totalCostToEmployer = employees.reduce((s, e) => s + Number(e.total_cost_to_employer || 0), 0);
  const totalPension = employees.reduce((s, e) => s + Number(e.pension_employer || 0), 0);
  const totalSeverance = employees.reduce((s, e) => s + Number(e.severance_fund || 0), 0);
  const totalBL = employees.reduce((s, e) => s + Number(e.bituach_leumi_employer || 0), 0);
  const totalEdFund = employees.reduce((s, e) => s + Number(e.education_fund_employer || 0), 0);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="text-orange-500" />דוח עלות מעסיק</h1>
          <p className="text-muted-foreground text-sm mt-1">פנסיה, ביטוח לאומי, פיצויים, קרן השתלמות — עלות מלאה לפי עובד ומחלקה</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={month} onChange={e => setMonth(+e.target.value)} className="border rounded-xl px-3 py-2 text-sm bg-background">
            {monthNames.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(+e.target.value)} className="border rounded-xl px-3 py-2 text-sm bg-background">
            {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={load} className="p-2 border rounded-xl hover:bg-muted"><RefreshCw size={16} /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "ברוטו כולל", value: fmtCur(totalGross), icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "עלות מעסיק", value: fmtCur(totalEmployerCost), icon: Building2, color: "text-orange-600", bg: "bg-orange-50" },
          { label: "עלות כוללת", value: fmtCur(totalCostToEmployer || totalGross + totalEmployerCost), icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "עובדים", value: String(employees.length), icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
        ].map((kpi, i) => (
          <div key={i} className={`rounded-xl border p-4 ${kpi.bg}`}>
            <kpi.icon size={20} className={`${kpi.color} mb-2`} />
            <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </div>
        ))}
      </div>

      {totalEmployerCost > 0 && (
        <div className="bg-card border rounded-2xl p-5">
          <h3 className="font-bold mb-4 flex items-center gap-2"><PieChartIcon size={16} />פילוח עלות מעסיק</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "פנסיה (6.5%)", value: totalPension, color: "#8b5cf6", bg: "bg-violet-50 border-violet-200" },
              { label: "פיצויים (8.33%)", value: totalSeverance, color: "#f59e0b", bg: "bg-amber-50 border-amber-200" },
              { label: "ביטוח לאומי", value: totalBL, color: "#3b82f6", bg: "bg-blue-50 border-blue-200" },
              { label: "קרן השתלמות (7.5%)", value: totalEdFund, color: "#10b981", bg: "bg-emerald-50 border-emerald-200" },
            ].map((item, i) => {
              const pct = totalEmployerCost > 0 ? (item.value / totalEmployerCost * 100) : 0;
              return (
                <div key={i} className={`rounded-xl border p-3 ${item.bg}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium" style={{ color: item.color }}>{item.label}</span>
                    <span className="text-xs font-bold" style={{ color: item.color }}>{pct.toFixed(1)}%</span>
                  </div>
                  <div className="text-lg font-bold">{fmtCur(item.value)}</div>
                  <div className="h-1.5 bg-white rounded-full mt-2 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: item.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
        {[{ id: "departments", label: "לפי מחלקה" }, { id: "employees", label: "לפי עובד" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? "bg-card shadow text-orange-700" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "departments" && (
        <div className="bg-card border rounded-2xl">
          <div className="p-4 border-b"><h3 className="font-bold flex items-center gap-2"><BarChart2 size={16} />סיכום לפי מחלקה</h3></div>
          {loading ? (
            <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-muted-foreground" /></div>
          ) : deptSummary.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">אין נתונים לתקופה זו</div>
          ) : (
            <div>
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-3 bg-muted/30 text-xs text-muted-foreground font-medium">
                <span>מחלקה</span>
                <span>עובדים</span>
                <span>ברוטו</span>
                <span>פנסיה</span>
                <span>פיצויים</span>
                <span>ביט"ל</span>
                <span>עלות מעסיק</span>
              </div>
              {deptSummary.map((d: any, i) => (
                <div key={i} className="px-4 py-3 border-t hover:bg-muted/20 grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-2 items-center text-sm">
                  <span className="font-medium">{d.department || "כללי"}</span>
                  <span>{d.count || d.emp_count}</span>
                  <span className="text-emerald-600">{fmtCur(d.totalGross || d.total_gross)}</span>
                  <span className="text-violet-600">{fmtCur(d.pension || d.totalPension || d.total_pension)}</span>
                  <span className="text-amber-600">{fmtCur(d.severance || d.totalSeverance || d.total_severance)}</span>
                  <span className="text-blue-600">{fmtCur(d.bl || d.totalBL || d.total_bl_employer)}</span>
                  <span className="font-bold text-orange-600">{fmtCur(d.totalEmployerCost || d.total_employer_cost)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "employees" && (
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute right-3 top-2.5 text-muted-foreground" size={16} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש עובד..."
              className="w-full pr-10 pl-4 py-2 border rounded-xl text-sm bg-background" />
          </div>
          <div className="bg-card border rounded-2xl">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-3 bg-muted/30 text-xs text-muted-foreground font-medium">
              <span>עובד</span>
              <span>ברוטו</span>
              <span>פנסיה</span>
              <span>פיצויים</span>
              <span>ביט"ל</span>
              <span>קה"ש</span>
              <span>עלות מעסיק</span>
            </div>
            {loading ? (
              <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">אין נתונים לתקופה זו</div>
            ) : (
              filtered.map((emp: any, i) => {
                const pct = totalCostToEmployer > 0 ? (Number(emp.total_cost_to_employer) / totalCostToEmployer * 100) : 0;
                return (
                  <div key={i} className="px-4 py-3 border-t hover:bg-muted/20">
                    <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-2 items-center text-sm">
                      <div>
                        <div className="font-medium">{emp.employee_name}</div>
                        <div className="text-xs text-muted-foreground">{emp.department}</div>
                      </div>
                      <span className="text-emerald-600">{fmtCur(emp.gross_salary)}</span>
                      <span className="text-violet-600">{fmtCur(emp.pension_employer)}</span>
                      <span className="text-amber-600">{fmtCur(emp.severance_fund || emp.severance_contrib)}</span>
                      <span className="text-blue-600">{fmtCur(emp.bituach_leumi_employer)}</span>
                      <span className="text-emerald-600">{fmtCur(emp.education_fund_employer)}</span>
                      <div>
                        <div className="font-bold text-orange-600">{fmtCur(emp.total_employer_cost)}</div>
                        <div className="h-1.5 bg-muted rounded-full mt-1">
                          <div className="h-full bg-orange-400 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
