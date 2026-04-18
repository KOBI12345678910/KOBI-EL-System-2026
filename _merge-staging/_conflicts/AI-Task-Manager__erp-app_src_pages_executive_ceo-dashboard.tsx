import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";
import { useLocation } from "wouter";
import {
  TrendingUp, TrendingDown, DollarSign, Factory, Users, ShoppingCart,
  BarChart3, RefreshCw, Clock, AlertTriangle, Lightbulb, CheckCircle2,
  Briefcase, Target, Gauge, Building2, Package, FileText, ClipboardList
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

function fmtCurrency(v: number) {
  if (Math.abs(v) >= 1_000_000) return `₪${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `₪${(v / 1_000).toFixed(0)}K`;
  return `₪${v.toLocaleString("he-IL")}`;
}

function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  const months = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יונ", "יול", "אוג", "ספט", "אוק", "נוב", "דצמ"];
  return months[parseInt(mo) - 1] || mo;
}

function useCountUp(target: number, duration = 800) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);
  useEffect(() => {
    const from = prevRef.current;
    const start = performance.now();
    let raf: number;
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (target - from) * eased);
      setDisplay(current);
      if (progress < 1) { raf = requestAnimationFrame(animate); }
      else { prevRef.current = target; }
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return display;
}

function AnimatedValue({ value, prefix = "", suffix = "", className = "" }: { value: number; prefix?: string; suffix?: string; className?: string }) {
  const animated = useCountUp(value);
  return <span className={className}>{prefix}{animated.toLocaleString("he-IL")}{suffix}</span>;
}

interface DashboardData {
  timestamp: string;
  kpis: {
    revenue: { value: number; prevValue: number; change: number; total: number; label: string };
    expenses: { value: number; prevValue: number; change: number; total: number; label: string };
    profit: { value: number; prevValue: number; change: number; total: number; label: string };
    orders: { value: number; label: string };
    production: { value: number; completed: number; inProgress: number; total: number; label: string };
    customers: { value: number; total: number; newThisMonth: number; newPrevMonth: number; change: number; label: string };
    employees: { value: number; total: number; label: string };
    quality: { value: number; total: number; passed: number; label: string };
  };
  charts: {
    monthlyTrend: Array<{ month: string; revenue: number; expenses: number; profit: number; orders: number }>;
    expensesByCategory: Array<{ name: string; value: number }>;
    productionBreakdown: Array<{ name: string; value: number; color: string }>;
  };
  details: {
    invoices: { total: number; paid: number; amount: number; paidAmount: number; overdue: number; overdueAmount: number };
    purchasing: { orders: number; amount: number };
    leads: { total: number; converted: number; conversionRate: number };
    projects: { total: number; active: number; budget: number };
    bankBalance: number;
    quotations: { total: number; amount: number; won: number; winRate: number };
    productionWo: { completed: number; prevCompleted: number; change: number };
  };
  profitMargin: number;
  aiInsights: string[];
}

function KpiCard({ icon: Icon, label, value, rawValue, change, color, sub, sparkData, prefix = "", suffix = "" }: {
  icon: any; label: string; value: string; rawValue?: number; change?: number; color: string; sub?: string;
  sparkData?: number[]; prefix?: string; suffix?: string;
}) {
  const isPositive = (change ?? 0) >= 0;
  return (
    <Card className="bg-card/80 border-border hover:border-border transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/5">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className={`p-2 rounded-lg bg-gradient-to-br ${color}`}>
            <Icon className="h-4 w-4 text-foreground" />
          </div>
          {change !== undefined && (
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${isPositive ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
              {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {change > 0 ? "+" : ""}{change}%
            </div>
          )}
        </div>
        <p className="text-xl font-bold text-foreground font-mono mt-1">
          {rawValue !== undefined ? <AnimatedValue value={rawValue} prefix={prefix} suffix={suffix} /> : value}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
        {sparkData && sparkData.length > 0 && (
          <div className="mt-2 h-8">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData.map((v, i) => ({ v, i }))}>
                <defs>
                  <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke={isPositive ? "#10b981" : "#ef4444"} strokeWidth={1.5} fill={`url(#spark-${label})`} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-sm" dir="rtl">
      <p className="text-muted-foreground mb-1 font-medium">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="text-foreground font-mono">{fmtCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-sm" dir="rtl">
      <p className="text-foreground font-medium">{payload[0].name}</p>
      <p className="text-muted-foreground font-mono">{fmtCurrency(payload[0].value)}</p>
    </div>
  );
}

export default function CeoDashboard() {
  const queryClient = useQueryClient();
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [, setLocation] = useLocation();

  const { data, isLoading: loading, error: queryError } = useQuery<DashboardData | null>({
    queryKey: ["ceo-dashboard"],
    queryFn: async () => {
      const res = await authFetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/executive/ceo-dashboard`);
      if (!res.ok) throw new Error(`שגיאה ${res.status}`);
      setLastRefresh(new Date());
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const error = queryError ? (queryError as Error).message || "שגיאה בטעינת נתונים" : null;

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-muted-foreground">טוען לוח מנכ"ל...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <AlertTriangle className="h-12 w-12 text-red-400" />
          <p className="text-red-400">{error}</p>
          <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["ceo-dashboard"] })} className="bg-blue-600 hover:bg-blue-700">נסה שוב</Button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { kpis, charts, details, aiInsights } = data;
  const sparkRevenue = charts.monthlyTrend.map(m => m.revenue);
  const sparkExpenses = charts.monthlyTrend.map(m => m.expenses);
  const sparkProfit = charts.monthlyTrend.map(m => m.profit);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#111128] to-[#0a0a1a] p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl shadow-lg shadow-blue-500/20">
            <BarChart3 className="w-6 h-6 text-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">לוח מנכ"ל</h1>
            <p className="text-sm text-muted-foreground">TECHNO-KOL UZI — Executive Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {lastRefresh.toLocaleTimeString("he-IL")}
          </span>
          <Button variant="outline" size="sm" onClick={() => setLocation("/executive/scorecard")} className="border-blue-500/30 text-blue-300 gap-1 bg-blue-500/10 hover:bg-blue-500/20">
            <ClipboardList className="h-3.5 w-3.5" />
            כרטיס ניקוד
          </Button>
          <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["ceo-dashboard"] })} className="border-border text-gray-300 gap-1">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            רענון
          </Button>
        </div>
      </div>

      {aiInsights.length > 0 && (
        <Card className="bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-foreground">תובנות מנכ"ל</h3>
              <Badge className="bg-blue-500/20 text-blue-300 border-0 text-[10px]">AI</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {aiInsights.map((insight, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  {insight.includes("ירידה") || insight.includes("עלייה") || insight.includes("באיחור") || insight.includes("נמוכה") ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                  )}
                  <span className="text-muted-foreground">{insight}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={DollarSign} label={kpis.revenue.label} value="" rawValue={kpis.revenue.value} prefix="₪"
          change={kpis.revenue.change} color="from-emerald-600 to-emerald-700"
          sub={`סה"כ: ${fmtCurrency(kpis.revenue.total)}`} sparkData={sparkRevenue} />
        <KpiCard icon={TrendingDown} label={kpis.expenses.label} value="" rawValue={kpis.expenses.value} prefix="₪"
          change={kpis.expenses.change} color="from-red-600 to-red-700"
          sub={`סה"כ: ${fmtCurrency(kpis.expenses.total)}`} sparkData={sparkExpenses} />
        <KpiCard icon={Target} label={kpis.profit.label} value="" rawValue={kpis.profit.value} prefix="₪"
          change={kpis.profit.change} color="from-blue-600 to-blue-700"
          sub={`מרווח: ${data.profitMargin}%`} sparkData={sparkProfit} />
        <KpiCard icon={ShoppingCart} label={kpis.orders.label} value="" rawValue={kpis.orders.value}
          color="from-indigo-600 to-indigo-700"
          sub={`הצעות: ${details.quotations.total} • המרה: ${details.quotations.winRate}%`} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Factory} label={kpis.production.label} value="" rawValue={kpis.production.value} suffix="%"
          color="from-amber-600 to-amber-700"
          sub={`${kpis.production.completed} הושלמו • ${kpis.production.inProgress} בביצוע`} />
        <KpiCard icon={Users} label={kpis.customers.label} value="" rawValue={kpis.customers.value}
          change={kpis.customers.change} color="from-cyan-600 to-cyan-700"
          sub={`חדשים החודש: ${kpis.customers.newThisMonth}`} />
        <KpiCard icon={Briefcase} label={kpis.employees.label} value="" rawValue={kpis.employees.value}
          color="from-purple-600 to-purple-700"
          sub={`סה"כ: ${kpis.employees.total}`} />
        <KpiCard icon={Gauge} label={kpis.quality.label} value="" rawValue={kpis.quality.value} suffix="%"
          color="from-teal-600 to-teal-700"
          sub={`${kpis.quality.passed}/${kpis.quality.total} בדיקות`} />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-400" />
                  מגמת הכנסות והוצאות — 12 חודשים
                </h3>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={charts.monthlyTrend.map(m => ({ ...m, label: fmtMonth(m.month) }))}>
                    <defs>
                      <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gProf" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                    <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#2a2a3e" }} />
                    <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#2a2a3e" }} tickFormatter={(v) => fmtCurrency(v)} width={70} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ paddingTop: 10 }} formatter={(v: string) => <span className="text-xs text-muted-foreground">{v}</span>} />
                    <Area type="monotone" dataKey="revenue" name="הכנסות" stroke="#3b82f6" strokeWidth={2} fill="url(#gRev)" dot={false} activeDot={{ r: 4, fill: "#3b82f6" }} />
                    <Area type="monotone" dataKey="expenses" name="הוצאות" stroke="#ef4444" strokeWidth={2} fill="url(#gExp)" dot={false} activeDot={{ r: 4, fill: "#ef4444" }} />
                    <Line type="monotone" dataKey="profit" name="רווח" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-4">
          <Card className="bg-card/80 border-border h-full">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
                <DollarSign className="h-4 w-4 text-purple-400" />
                פילוח הוצאות
              </h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={charts.expensesByCategory} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                      paddingAngle={2} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={{ stroke: "#4a4a6e", strokeWidth: 1 }}>
                      {charts.expensesByCategory.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 mt-2 max-h-[120px] overflow-y-auto">
                {charts.expensesByCategory.slice(0, 6).map((cat, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-muted-foreground">{cat.name}</span>
                    </div>
                    <span className="text-foreground font-mono">{fmtCurrency(cat.value)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
                <Factory className="h-4 w-4 text-amber-400" />
                ניצולת ייצור
                <span className="text-xs text-amber-400 font-mono mr-auto">{kpis.production.value}%</span>
              </h3>
              {charts.productionBreakdown.length > 0 ? (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={charts.productionBreakdown} layout="vertical" barCategoryGap={8}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" horizontal={false} />
                      <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={{ stroke: "#2a2a3e" }} />
                      <YAxis type="category" dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={{ stroke: "#2a2a3e" }} width={60} />
                      <Tooltip
                        contentStyle={{ background: "#1a1a2e", border: "1px solid #2a2a3e", borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ color: "#9ca3af" }}
                        formatter={(value: number, name: string) => [value, "פקודות"]}
                      />
                      <Bar dataKey="value" name="כמות" radius={[0, 4, 4, 0]}>
                        {charts.productionBreakdown.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center">
                  <div className="text-center">
                    <Factory className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">אין נתוני ייצור</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-6">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
                <BarChart3 className="h-4 w-4 text-indigo-400" />
                הזמנות חודשיות
              </h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.monthlyTrend.map(m => ({ ...m, label: fmtMonth(m.month) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                    <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={{ stroke: "#2a2a3e" }} />
                    <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={{ stroke: "#2a2a3e" }} />
                    <Tooltip
                      contentStyle={{ background: "#1a1a2e", border: "1px solid #2a2a3e", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: "#9ca3af" }}
                      formatter={(value: number) => [value, "הזמנות"]}
                    />
                    <Bar dataKey="orders" name="הזמנות" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { icon: Building2, label: "יתרת בנק", value: fmtCurrency(details.bankBalance), color: "text-blue-400", bg: "bg-blue-500/10" },
          { icon: FileText, label: "חשבוניות באיחור", value: String(details.invoices.overdue), color: details.invoices.overdue > 0 ? "text-red-400" : "text-emerald-400", bg: details.invoices.overdue > 0 ? "bg-red-500/10" : "bg-emerald-500/10" },
          { icon: Package, label: "הזמנות רכש", value: String(details.purchasing.orders), color: "text-orange-400", bg: "bg-orange-500/10" },
          { icon: Users, label: "לידים", value: `${details.leads.total}`, color: "text-cyan-400", bg: "bg-cyan-500/10" },
          { icon: Briefcase, label: "פרויקטים פעילים", value: String(details.projects.active), color: "text-purple-400", bg: "bg-purple-500/10" },
          { icon: Target, label: "המרת לידים", value: `${details.leads.conversionRate}%`, color: "text-emerald-400", bg: "bg-emerald-500/10" },
        ].map((item, i) => (
          <Card key={i} className="bg-card/60 border-border hover:border-border transition-colors">
            <CardContent className="p-3 text-center">
              <div className={`w-10 h-10 rounded-lg ${item.bg} flex items-center justify-center mx-auto mb-2`}>
                <item.icon className={`h-5 w-5 ${item.color}`} />
              </div>
              <p className={`text-lg font-bold font-mono ${item.color}`}>{item.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{item.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card/60 border-border">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-emerald-400" />
            תזרים מזומנים — הכנסות מול הוצאות
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts.monthlyTrend.map(m => ({ ...m, label: fmtMonth(m.month) }))}>
                <defs>
                  <linearGradient id="gCashIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gCashOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={{ stroke: "#2a2a3e" }} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={{ stroke: "#2a2a3e" }} tickFormatter={(v) => fmtCurrency(v)} width={65} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ paddingTop: 8 }} formatter={(v: string) => <span className="text-xs text-muted-foreground">{v}</span>} />
                <Area type="monotone" dataKey="revenue" name="הכנסות" stroke="#10b981" strokeWidth={2} fill="url(#gCashIn)" />
                <Area type="monotone" dataKey="expenses" name="הוצאות" stroke="#ef4444" strokeWidth={2} fill="url(#gCashOut)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
