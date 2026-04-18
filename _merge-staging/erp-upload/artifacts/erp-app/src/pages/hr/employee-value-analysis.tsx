import { useState, useEffect, useCallback } from "react";
import {
  Users, TrendingUp, TrendingDown, AlertTriangle, Award, DollarSign,
  BarChart3, Star, RefreshCw, Search, Eye, ArrowUpDown, ShieldAlert
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from "recharts";

const API = "/api/employee-value";
const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

interface Metric {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_type: string;
  department: string;
  total_revenue_generated: string;
  total_cost: string;
  net_value: string;
  projects_count: number;
  avg_project_value: string;
  on_time_rate: number;
  quality_score: number;
  customer_satisfaction_avg: number;
  risk_score: number;
  ranking?: string;
}

interface DashboardData {
  summary: any;
  byType: any[];
  topPerformers: any[];
}

export default function EmployeeValueAnalysis() {
  const [tab, setTab] = useState<"dashboard" | "rankings" | "comparison" | "risk">("dashboard");
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [rankings, setRankings] = useState<Metric[]>([]);
  const [riskReport, setRiskReport] = useState<Metric[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [employeeProjects, setEmployeeProjects] = useState<any[]>([]);
  const [employeePayments, setEmployeePayments] = useState<any[]>([]);
  const [sortBy, setSortBy] = useState("net_value");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const fmt = (n: any) => Number(n || 0).toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
  const pct = (n: any) => `${Number(n || 0).toFixed(1)}%`;

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [mR, dR, rankR, riskR] = await Promise.all([
        authFetch(`${API}/metrics`),
        authFetch(`${API}/dashboard`),
        authFetch(`${API}/rankings?sort=${sortBy}`),
        authFetch(`${API}/risk-report`),
      ]);
      const [mD, dD, rankD, riskD] = await Promise.all([mR.json(), dR.json(), rankR.json(), riskR.json()]);
      setMetrics(mD.metrics || []);
      setDashboard(dD);
      setRankings(rankD.rankings || []);
      setRiskReport(riskD.atRisk || []);
    } catch { /* */ }
    setLoading(false);
  }, [sortBy]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const selectEmployee = async (employeeId: number) => {
    try {
      const [mR, pR, payR] = await Promise.all([
        authFetch(`${API}/metrics/${employeeId}`),
        authFetch(`${API}/projects/${employeeId}`),
        authFetch(`${API}/payments/${employeeId}`),
      ]);
      const [mD, pD, payD] = await Promise.all([mR.json(), pR.json(), payR.json()]);
      setSelectedEmployee(mD.metrics);
      setEmployeeProjects(pD.projects || []);
      setEmployeePayments(payD.payments || []);
    } catch { /* */ }
  };

  const recalculateAll = async () => {
    setLoading(true);
    try {
      await authFetch(`${API}/calculate-all`, { method: "POST" });
      await loadAll();
    } catch { /* */ }
    setLoading(false);
  };

  const typeLabel = (t: string) => {
    switch (t) {
      case "salaried": return "שכיר";
      case "manufacturer": return "יצרן";
      case "installer": return "מתקין";
      case "sales_agent": return "סוכן מכירות";
      default: return t;
    }
  };

  const riskBadge = (score: number) => {
    if (score >= 70) return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">סיכון גבוה</span>;
    if (score >= 40) return <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">סיכון בינוני</span>;
    return <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">תקין</span>;
  };

  const filteredMetrics = metrics.filter((m) =>
    !search || (m.employee_name || "").includes(search) || (m.department || "").includes(search)
  );

  return (
    <div dir="rtl" className="p-4 space-y-4 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">ניתוח שווי עובד</h1>
          <p className="text-sm text-gray-500">ניתוח ביצועים, רווחיות ושווי של כל עובד/קבלן</p>
        </div>
        <div className="flex gap-2">
          <button onClick={recalculateAll} disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium flex items-center gap-1">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> חשב מחדש
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-lg p-1 border shadow-sm w-fit">
        {[
          { key: "dashboard", label: "דשבורד", icon: <BarChart3 className="w-4 h-4" /> },
          { key: "rankings", label: "דירוגים", icon: <Award className="w-4 h-4" /> },
          { key: "comparison", label: "השוואה", icon: <ArrowUpDown className="w-4 h-4" /> },
          { key: "risk", label: "דוח סיכון", icon: <ShieldAlert className="w-4 h-4" /> },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${tab === t.key ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Dashboard */}
      {tab === "dashboard" && dashboard && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "סה\"כ עובדים", value: dashboard.summary.total_employees, icon: <Users className="w-5 h-5" />, color: "blue" },
              { label: "שווי נקי כולל", value: fmt(dashboard.summary.total_net_value), icon: <DollarSign className="w-5 h-5" />, color: "green" },
              { label: "איכות ממוצעת", value: pct(dashboard.summary.avg_quality), icon: <Star className="w-5 h-5" />, color: "amber" },
              { label: "סיכון גבוה", value: dashboard.summary.high_risk_count, icon: <AlertTriangle className="w-5 h-5" />, color: "red" },
            ].map((kpi, i) => (
              <div key={i} className="bg-white rounded-xl border p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">{kpi.label}</span>
                  <div className={`text-${kpi.color}-600`}>{kpi.icon}</div>
                </div>
                <div className="text-2xl font-bold text-gray-800">{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* By type chart */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <h3 className="font-semibold mb-3">שווי נקי לפי סוג</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={dashboard.byType.map((t: any) => ({ ...t, name: typeLabel(t.employee_type) }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip formatter={(v: any) => fmt(v)} />
                  <Bar dataKey="total_net_value" fill="#3b82f6" radius={[4, 4, 0, 0]} name="שווי נקי" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <h3 className="font-semibold mb-3">חלוקה לפי סוג</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={dashboard.byType.map((t: any) => ({ name: typeLabel(t.employee_type), value: Number(t.count) }))}
                    cx="50%" cy="50%" outerRadius={80} dataKey="value" label>
                    {dashboard.byType.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top performers */}
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Award className="w-4 h-4 text-amber-500" /> מובילים</h3>
            <div className="grid md:grid-cols-5 gap-2">
              {dashboard.topPerformers.map((p: any, i: number) => (
                <div key={i} className="border rounded-lg p-3 text-center cursor-pointer hover:shadow-md transition"
                  onClick={() => selectEmployee(p.employee_id)}>
                  <div className="text-2xl font-bold text-amber-500">#{i + 1}</div>
                  <div className="font-medium text-sm mt-1">{p.employee_name}</div>
                  <div className="text-xs text-gray-500">{typeLabel(p.employee_type)}</div>
                  <div className="text-sm font-bold text-green-600 mt-1">{fmt(p.net_value)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Rankings */}
      {tab === "rankings" && (
        <div className="space-y-3">
          <div className="flex gap-2 items-center">
            <span className="text-sm text-gray-600">מיין לפי:</span>
            {[
              { key: "net_value", label: "שווי נקי" },
              { key: "quality_score", label: "איכות" },
              { key: "on_time_rate", label: "בזמן" },
              { key: "total_revenue_generated", label: "הכנסות" },
            ].map((s) => (
              <button key={s.key} onClick={() => setSortBy(s.key)}
                className={`px-3 py-1 rounded-lg text-sm border ${sortBy === s.key ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                {s.label}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-right px-4 py-3 font-medium">#</th>
                  <th className="text-right px-4 py-3 font-medium">שם</th>
                  <th className="text-right px-4 py-3 font-medium">סוג</th>
                  <th className="text-right px-4 py-3 font-medium">הכנסות</th>
                  <th className="text-right px-4 py-3 font-medium">עלות</th>
                  <th className="text-right px-4 py-3 font-medium">שווי נקי</th>
                  <th className="text-right px-4 py-3 font-medium">פרויקטים</th>
                  <th className="text-right px-4 py-3 font-medium">איכות</th>
                  <th className="text-right px-4 py-3 font-medium">בזמן</th>
                  <th className="text-right px-4 py-3 font-medium">סיכון</th>
                  <th className="text-center px-4 py-3 font-medium">פרטים</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((r, i) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-bold text-amber-600">{r.ranking || i + 1}</td>
                    <td className="px-4 py-3 font-medium">{r.employee_name}</td>
                    <td className="px-4 py-3 text-xs">{typeLabel(r.employee_type)}</td>
                    <td className="px-4 py-3 text-green-600">{fmt(r.total_revenue_generated)}</td>
                    <td className="px-4 py-3 text-red-600">{fmt(r.total_cost)}</td>
                    <td className="px-4 py-3 font-bold">{fmt(r.net_value)}</td>
                    <td className="px-4 py-3">{r.projects_count}</td>
                    <td className="px-4 py-3">{pct(r.quality_score)}</td>
                    <td className="px-4 py-3">{pct(r.on_time_rate)}</td>
                    <td className="px-4 py-3">{riskBadge(r.risk_score)}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => selectEmployee(r.employee_id)} className="text-blue-600 hover:text-blue-800">
                        <Eye className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Comparison */}
      {tab === "comparison" && (
        <div className="space-y-3">
          <div className="relative w-72">
            <Search className="w-4 h-4 absolute right-3 top-2.5 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש עובד..." className="pr-9 pl-3 py-2 border rounded-lg text-sm w-full" />
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredMetrics.map((m) => {
              const netVal = Number(m.net_value);
              return (
                <div key={m.id} className="bg-white rounded-xl border p-4 shadow-sm hover:shadow-md transition cursor-pointer"
                  onClick={() => selectEmployee(m.employee_id)}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-bold text-gray-800">{m.employee_name}</div>
                      <div className="text-xs text-gray-500">{typeLabel(m.employee_type)} | {m.department}</div>
                    </div>
                    {riskBadge(m.risk_score)}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500 text-xs">שווי נקי</span>
                      <div className={`font-bold ${netVal >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(m.net_value)}</div>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">פרויקטים</span>
                      <div className="font-bold">{m.projects_count}</div>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">איכות</span>
                      <div className="font-bold">{pct(m.quality_score)}</div>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">בזמן</span>
                      <div className="font-bold">{pct(m.on_time_rate)}</div>
                    </div>
                  </div>

                  {/* Mini bar */}
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>הכנסות</span>
                      <span>עלות</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                      <div className="bg-green-500 h-full" style={{
                        width: `${Math.min(100, Number(m.total_revenue_generated) > 0 ?
                          (Number(m.net_value) / Number(m.total_revenue_generated)) * 100 : 0)}%`
                      }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Risk Report */}
      {tab === "risk" && (
        <div className="space-y-3">
          <div className="bg-red-50 rounded-xl border border-red-200 p-4">
            <h3 className="font-semibold text-red-800 mb-1 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> דוח סיכון - עובדים בירידת ביצועים
            </h3>
            <p className="text-sm text-red-600 mb-3">עובדים עם ציון סיכון גבוה, איכות נמוכה, או אחוז עמידה בזמנים נמוך</p>
          </div>

          {riskReport.length === 0 ? (
            <div className="bg-white rounded-xl border p-8 text-center text-gray-400">אין עובדים בסיכון כרגע</div>
          ) : (
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-right px-4 py-3 font-medium">שם</th>
                    <th className="text-right px-4 py-3 font-medium">סוג</th>
                    <th className="text-right px-4 py-3 font-medium">ציון סיכון</th>
                    <th className="text-right px-4 py-3 font-medium">איכות</th>
                    <th className="text-right px-4 py-3 font-medium">בזמן</th>
                    <th className="text-right px-4 py-3 font-medium">שווי נקי</th>
                    <th className="text-right px-4 py-3 font-medium">סיבות</th>
                  </tr>
                </thead>
                <tbody>
                  {riskReport.map((r) => {
                    const reasons: string[] = [];
                    if (r.risk_score >= 40) reasons.push("ירידה בביצועים");
                    if (r.on_time_rate < 60) reasons.push("עמידה בזמנים נמוכה");
                    if (r.quality_score < 70) reasons.push("איכות נמוכה");
                    return (
                      <tr key={r.id} className="border-b hover:bg-red-50">
                        <td className="px-4 py-3 font-medium">{r.employee_name}</td>
                        <td className="px-4 py-3">{typeLabel(r.employee_type)}</td>
                        <td className="px-4 py-3">{riskBadge(r.risk_score)}</td>
                        <td className="px-4 py-3">{pct(r.quality_score)}</td>
                        <td className="px-4 py-3">{pct(r.on_time_rate)}</td>
                        <td className="px-4 py-3 font-bold">{fmt(r.net_value)}</td>
                        <td className="px-4 py-3 text-xs text-red-600">{reasons.join(", ")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Employee Detail Modal */}
      {selectedEmployee && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelectedEmployee(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between rounded-t-2xl">
              <div>
                <h2 className="text-lg font-bold">{selectedEmployee.employee_name}</h2>
                <p className="text-sm text-gray-500">{typeLabel(selectedEmployee.employee_type)} | {selectedEmployee.department}</p>
              </div>
              <div className="flex items-center gap-3">
                {riskBadge(selectedEmployee.risk_score)}
                <button onClick={() => setSelectedEmployee(null)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">X</button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* KPI cards */}
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {[
                  { label: "הכנסות", value: fmt(selectedEmployee.total_revenue_generated), color: "green" },
                  { label: "עלות", value: fmt(selectedEmployee.total_cost), color: "red" },
                  { label: "שווי נקי", value: fmt(selectedEmployee.net_value), color: "blue" },
                  { label: "פרויקטים", value: selectedEmployee.projects_count, color: "purple" },
                  { label: "איכות", value: pct(selectedEmployee.quality_score), color: "amber" },
                  { label: "בזמן", value: pct(selectedEmployee.on_time_rate), color: "teal" },
                ].map((k, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-3 text-center border">
                    <div className="text-xs text-gray-500">{k.label}</div>
                    <div className={`text-lg font-bold text-${k.color}-600`}>{k.value}</div>
                  </div>
                ))}
              </div>

              {/* Projects history */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="font-semibold mb-3">היסטוריית פרויקטים</h3>
                {employeeProjects.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4">אין פרויקטים</p>
                ) : (
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {employeeProjects.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between bg-white rounded-lg p-2 border text-sm">
                        <div>
                          <span className="font-medium">{p.project_name}</span>
                          <span className="text-gray-400 mx-2">|</span>
                          <span className="text-gray-500">{p.customer_name}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-gray-400">{p.payment_type === "percentage" ? `${p.payment_rate}%` : `${fmt(p.payment_rate)}/מ'`}</span>
                          <span className="font-medium text-green-600">{fmt(p.payment_amount)}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === "completed" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                            {p.status === "completed" ? "הושלם" : "פעיל"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Payment history */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="font-semibold mb-3">היסטוריית תשלומים</h3>
                {employeePayments.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4">אין תשלומים</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-500 text-xs border-b">
                        <th className="text-right py-2">תקופה</th>
                        <th className="text-right py-2">בסיס</th>
                        <th className="text-right py-2">בונוס</th>
                        <th className="text-right py-2">ניכויים</th>
                        <th className="text-right py-2">סה"כ</th>
                        <th className="text-right py-2">סטטוס</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employeePayments.map((p: any) => (
                        <tr key={p.id} className="border-b">
                          <td className="py-2">{p.period}</td>
                          <td className="py-2">{fmt(p.base_amount)}</td>
                          <td className="py-2 text-green-600">{fmt(p.bonus_amount)}</td>
                          <td className="py-2 text-red-600">{fmt(p.deductions)}</td>
                          <td className="py-2 font-bold">{fmt(p.total_amount)}</td>
                          <td className="py-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                              {p.status === "paid" ? "שולם" : "ממתין"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
