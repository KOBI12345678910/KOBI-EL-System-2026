import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, DollarSign, BarChart3, Activity, Target,
  Heart, Users, Clock, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Gauge, Building2, Briefcase, RefreshCw, Calendar, Minus
} from "lucide-react";

interface DailySnapshot {
  date: string;
  revenue_today: string;
  costs_today: string;
  gross_profit_today: string;
  gross_margin_pct: number;
  cumulative_revenue_month: string;
  cumulative_costs_month: string;
  cumulative_profit_month: string;
  projects_closed_today: number;
  projects_value_today: string;
  avg_project_margin_pct: number;
}

interface HealthMetrics {
  date?: string;
  total_ar?: string;
  total_ap?: string;
  net_cash_position?: string;
  current_ratio?: number;
  quick_ratio?: number;
  debt_to_equity?: number;
  inventory_value?: string;
  monthly_burn_rate?: string;
  runway_months?: number;
  employee_count?: number;
  revenue_per_employee?: string;
  projects_in_progress?: number;
  overdue_projects?: number;
  customer_satisfaction_avg?: number;
}

interface MonthlySummary {
  month: string;
  total_revenue: string;
  total_costs: string;
  total_profit: string;
  margin_pct: number;
  projects_closed: number;
  projects_value: string;
  working_days: number;
}

interface DashboardData {
  today: DailySnapshot;
  yesterday: DailySnapshot | null;
  profit_change: number;
  month_summary: { revenue: string; costs: string; profit: string; days: number };
  health: HealthMetrics;
  trend_30_days: { date: string; gross_profit_today: string; gross_margin_pct: number }[];
}

const fmtILS = (v: number | string) => {
  const n = typeof v === "string" ? parseFloat(v) || 0 : v;
  return n.toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
};

const fmtPct = (v: number) => `${v.toFixed(1)}%`;

function GaugeCard({ label, value, max, unit, color, icon: Icon }: { label: string; value: number; max: number; unit?: string; color: string; icon: any }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="bg-white rounded-xl border p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-2"><Icon className="w-4 h-4" />{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{unit === "ILS" ? fmtILS(value) : unit === "%" ? fmtPct(value) : value.toFixed(1)}{unit && unit !== "ILS" && unit !== "%" ? ` ${unit}` : ""}</div>
      <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
        <div className={`h-2 rounded-full ${pct > 70 ? "bg-green-500" : pct > 40 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MiniTrendChart({ data, height = 60 }: { data: number[]; height?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 300;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${height - ((v - min) / range) * height}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }}>
      <polyline fill="none" stroke="#3b82f6" strokeWidth="2" points={points} />
      <polyline fill="url(#grad)" stroke="none" points={`0,${height} ${points} ${w},${height}`} />
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function DailyProfitMonitorPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [monthly, setMonthly] = useState<MonthlySummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [dashRes, monthRes] = await window.Promise.all([
        authFetch("/api/daily-profit/dashboard"),
        authFetch("/api/daily-profit/monthly-summary"),
      ]);
      setDashboard(await dashRes.json());
      setMonthly(await monthRes.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createSnapshot = async () => {
    // Quick manual snapshot creation for demo
    await authFetch("/api/daily-profit/snapshot", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        revenue_today: Math.round(Math.random() * 50000 + 20000),
        costs_today: Math.round(Math.random() * 30000 + 10000),
        projects_closed_today: Math.floor(Math.random() * 3),
        projects_value_today: Math.round(Math.random() * 100000),
        avg_project_margin_pct: Math.round(Math.random() * 20 + 15),
      }),
    });
    load();
  };

  if (loading) return <div className="p-8 text-center text-gray-400">טוען נתוני רווח יומי...</div>;

  const today = dashboard?.today;
  const profitToday = parseFloat(today?.gross_profit_today || "0");
  const revenueToday = parseFloat(today?.revenue_today || "0");
  const costsToday = parseFloat(today?.costs_today || "0");
  const profitChange = dashboard?.profit_change || 0;
  const marginToday = today?.gross_margin_pct || 0;
  const health = dashboard?.health || {};
  const trend = dashboard?.trend_30_days || [];
  const trendData = trend.map((t) => parseFloat(t.gross_profit_today) || 0);
  const monthRev = parseFloat(dashboard?.month_summary?.revenue || "0");
  const monthCost = parseFloat(dashboard?.month_summary?.costs || "0");
  const monthProfit = parseFloat(dashboard?.month_summary?.profit || "0");

  return (
    <div className="p-4 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="w-7 h-7 text-emerald-600" />
            רווח יומי ובריאות החברה
          </h1>
          <p className="text-sm text-gray-500 mt-1">מוניטור רווחיות בזמן אמת ומדדי בריאות ארגונית</p>
        </div>
        <button onClick={createSnapshot} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 text-sm">
          <RefreshCw className="w-4 h-4" /> צור תמונת מצב
        </button>
      </div>

      {/* Hero: Today's Profit */}
      <div className="bg-gradient-to-l from-emerald-600 to-emerald-800 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-emerald-200 text-sm mb-1">רווח גולמי היום</p>
            <div className="flex items-center gap-3">
              <span className="text-4xl font-bold">{fmtILS(profitToday)}</span>
              {profitChange !== 0 && (
                <span className={`flex items-center gap-1 text-sm px-2 py-1 rounded-full ${profitChange > 0 ? "bg-green-400/20 text-green-200" : "bg-red-400/20 text-red-200"}`}>
                  {profitChange > 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  {fmtILS(Math.abs(profitChange))} מאתמול
                </span>
              )}
            </div>
            <p className="text-emerald-200 text-sm mt-2">מרווח: {fmtPct(marginToday)}</p>
          </div>
          <div className="text-left space-y-1">
            <div className="text-sm"><span className="text-emerald-200">הכנסות:</span> <span className="font-semibold">{fmtILS(revenueToday)}</span></div>
            <div className="text-sm"><span className="text-emerald-200">עלויות:</span> <span className="font-semibold">{fmtILS(costsToday)}</span></div>
            <div className="text-sm"><span className="text-emerald-200">פרויקטים שנסגרו:</span> <span className="font-semibold">{today?.projects_closed_today || 0}</span></div>
          </div>
        </div>
      </div>

      {/* Monthly P&L + Trend */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Monthly P&L */}
        <div className="bg-white rounded-xl border p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2"><Calendar className="w-5 h-5 text-blue-500" /> סיכום חודשי</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-gray-600">הכנסות מצטבר</span>
              <span className="text-green-600 font-bold text-lg">{fmtILS(monthRev)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-gray-600">עלויות מצטבר</span>
              <span className="text-red-600 font-bold text-lg">{fmtILS(monthCost)}</span>
            </div>
            <div className="flex justify-between items-center py-3 bg-emerald-50 rounded-lg px-3">
              <span className="text-gray-800 font-semibold">רווח גולמי מצטבר</span>
              <span className={`font-bold text-2xl ${monthProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtILS(monthProfit)}</span>
            </div>
            <div className="text-xs text-gray-400 text-center">{dashboard?.month_summary?.days || 0} ימי עבודה החודש</div>
          </div>
        </div>

        {/* 30-day trend */}
        <div className="bg-white rounded-xl border p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-blue-500" /> מגמת רווח 30 יום</h3>
          {trendData.length > 1 ? (
            <MiniTrendChart data={trendData} height={120} />
          ) : (
            <div className="h-[120px] flex items-center justify-center text-gray-400 text-sm">אין מספיק נתונים למגמה</div>
          )}
          {trendData.length > 0 && (
            <div className="flex justify-between text-xs text-gray-400 mt-2">
              <span>{trend[0]?.date?.slice(5)}</span>
              <span>ממוצע: {fmtILS(trendData.reduce((a, b) => a + b, 0) / trendData.length)}</span>
              <span>{trend[trend.length - 1]?.date?.slice(5)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Health Metrics Gauges */}
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2"><Heart className="w-5 h-5 text-red-500" /> בריאות החברה</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <GaugeCard label="יחס שוטף" value={health.current_ratio || 0} max={3} color="text-blue-600" icon={Gauge} />
          <GaugeCard label="יחס מהיר" value={health.quick_ratio || 0} max={2} color="text-indigo-600" icon={Gauge} />
          <GaugeCard label="מסלול (חודשים)" value={health.runway_months || 0} max={24} unit="חודשים" color="text-emerald-600" icon={Clock} />
          <GaugeCard label="שריפה חודשית" value={parseFloat(health.monthly_burn_rate || "0")} max={500000} unit="ILS" color="text-orange-600" icon={TrendingDown} />
          <GaugeCard label="עובדים" value={health.employee_count || 0} max={100} color="text-purple-600" icon={Users} />
          <GaugeCard label="הכנסה/עובד" value={parseFloat(health.revenue_per_employee || "0")} max={50000} unit="ILS" color="text-teal-600" icon={DollarSign} />
          <GaugeCard label="פרויקטים פעילים" value={health.projects_in_progress || 0} max={50} color="text-blue-600" icon={Briefcase} />
          <GaugeCard label="שביעות רצון" value={health.customer_satisfaction_avg || 0} max={5} color="text-yellow-600" icon={Target} />
        </div>
      </div>

      {/* Financial Health */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="text-sm text-gray-500 mb-1">סה"כ חייבים (AR)</div>
          <div className="text-xl font-bold text-green-600">{fmtILS(health.total_ar || 0)}</div>
        </div>
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="text-sm text-gray-500 mb-1">סה"כ זכאים (AP)</div>
          <div className="text-xl font-bold text-red-600">{fmtILS(health.total_ap || 0)}</div>
        </div>
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="text-sm text-gray-500 mb-1">מצב מזומנים נטו</div>
          <div className={`text-xl font-bold ${parseFloat(health.net_cash_position || "0") >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtILS(health.net_cash_position || 0)}</div>
        </div>
      </div>

      {/* Monthly P&L Table */}
      {monthly.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
          <div className="p-4 border-b">
            <h3 className="font-semibold text-gray-800">סיכום חודשי - רווח והפסד</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-right p-3">חודש</th>
                <th className="text-right p-3">הכנסות</th>
                <th className="text-right p-3">עלויות</th>
                <th className="text-right p-3">רווח גולמי</th>
                <th className="text-right p-3">מרווח %</th>
                <th className="text-right p-3">פרויקטים</th>
                <th className="text-right p-3">ימי עבודה</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.month} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-medium">{m.month}</td>
                  <td className="p-3 text-green-600">{fmtILS(m.total_revenue)}</td>
                  <td className="p-3 text-red-600">{fmtILS(m.total_costs)}</td>
                  <td className={`p-3 font-bold ${parseFloat(m.total_profit) >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtILS(m.total_profit)}</td>
                  <td className="p-3">{m.margin_pct}%</td>
                  <td className="p-3">{m.projects_closed}</td>
                  <td className="p-3 text-gray-500">{m.working_days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Overdue Projects Warning */}
      {(health.overdue_projects || 0) > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0" />
          <div>
            <p className="font-medium text-red-800">{health.overdue_projects} פרויקטים באיחור</p>
            <p className="text-sm text-red-600">יש לבדוק ולטפל בפרויקטים שחרגו מלוח הזמנים</p>
          </div>
        </div>
      )}
    </div>
  );
}
