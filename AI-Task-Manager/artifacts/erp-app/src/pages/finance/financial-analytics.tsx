import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, RefreshCw, Loader2,
  BarChart3, Activity, Users, ShoppingCart
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtC = (v: any) => `₪${fmt(v)}`;
const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-right" dir="rtl">
      <p className="text-sm font-medium text-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="text-foreground font-bold">{fmtC(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function FinancialAnalytics() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [profitability, setProfitability] = useState<any>(null);
  const [revenue, setRevenue] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"month" | "quarter" | "year">("year");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, p, r] = await Promise.all([
        authFetch("/api/finance-control/dashboard").then(res => res.ok ? res.json() : null),
        authFetch("/api/finance-control/profitability-analysis").then(res => res.ok ? res.json() : null),
        authFetch(`/api/finance-control/revenue-tracking?period=${period}`).then(res => res.ok ? res.json() : null),
      ]);
      setDashboard(d);
      setProfitability(p);
      setRevenue(r);
    } catch {}
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const kpis = useMemo(() => {
    if (!dashboard) return [];
    const d = dashboard;
    const totalRevenue = Number(d.revenue?.total_revenue || 0);
    const totalExpenses = Number(d.expenses?.total_expenses || 0);
    const netIncome = Number(d.netIncome || 0);
    const totalAR = Number(d.receivable?.total_ar || 0);
    return [
      { label: "הכנסות", value: fmtC(totalRevenue), icon: TrendingUp, color: "text-green-400", bg: "from-green-500/15 to-green-600/5", border: "border-green-500/20" },
      { label: "הוצאות", value: fmtC(totalExpenses), icon: TrendingDown, color: "text-red-400", bg: "from-red-500/15 to-red-600/5", border: "border-red-500/20" },
      { label: "רווח נקי", value: fmtC(netIncome), icon: DollarSign, color: netIncome >= 0 ? "text-blue-400" : "text-red-400", bg: "from-blue-500/15 to-blue-600/5", border: "border-blue-500/20" },
      { label: "חייבים (AR)", value: fmtC(totalAR), icon: Users, color: "text-amber-400", bg: "from-amber-500/15 to-amber-600/5", border: "border-amber-500/20" },
    ];
  }, [dashboard]);

  const byMonthData = useMemo(() => {
    const monthly = revenue?.byMonth || [];
    if (monthly.length > 0) return monthly;
    const months = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יוני", "יולי", "אוג", "ספט", "אוק", "נוב", "דצמ"];
    return months.map(m => ({ month: m, income: 0, expenses: 0 }));
  }, [revenue]);

  const byCustomerData = useMemo(() => {
    const top = revenue?.byCustomer || [];
    return top.slice(0, 8).map((c: any) => ({
      name: (c.name || c.customer_name || "").substring(0, 15),
      value: Number(c.total || c.revenue || c.amount || 0),
    }));
  }, [revenue]);

  const byProductData = useMemo(() => {
    const top = profitability?.byProduct || [];
    return top.slice(0, 8).map((p: any) => ({
      name: (p.name || p.product_name || "").substring(0, 15),
      value: Number(p.revenue || p.total || 0),
    }));
  }, [profitability]);

  const cashflowData = useMemo(() => {
    if (!dashboard?.cashflow) return [];
    const cf = dashboard.cashflow;
    return [
      { name: "כניסות", value: Number(cf.total_inflow || 0) },
      { name: "יציאות", value: Number(cf.total_outflow || 0) },
    ];
  }, [dashboard]);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><BarChart3 className="h-6 w-6 text-blue-400" />ניתוח פיננסי</h1>
          <p className="text-sm text-muted-foreground mt-1">ניתוח נתונים פיננסיים, גרפים ומגמות</p>
        </div>
        <div className="flex items-center gap-2">
          {(["month", "quarter", "year"] as const).map(p => (
            <Button key={p} variant={period === p ? "default" : "outline"} size="sm" onClick={() => setPeriod(p)}
              className={period === p ? "bg-blue-600 hover:bg-blue-700" : "border-border text-muted-foreground"}>
              {p === "month" ? "חודש" : p === "quarter" ? "רבעון" : "שנה"}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="border-border">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-blue-400" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {kpis.map((kpi, i) => (
              <Card key={i} className={`bg-gradient-to-br ${kpi.bg} ${kpi.border}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
                  <p className={`text-xl font-bold font-mono mt-1 ${kpi.color}`}>{kpi.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-card/80 border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Activity className="h-4 w-4 text-cyan-400" />הכנסות לפי חודש
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={byMonthData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="faIncGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                      <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#2a2a3e" }} />
                      <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={{ stroke: "#2a2a3e" }} tickFormatter={v => `₪${(v / 1000).toFixed(0)}K`} width={65} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="income" name="הכנסות" stroke="#22c55e" fill="url(#faIncGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/80 border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-amber-400" />תזרים מזומנים
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={cashflowData.filter(d => d.value > 0)} dataKey="value" nameKey="name"
                        cx="50%" cy="50%" outerRadius={90} strokeWidth={0}>
                        {cashflowData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => fmtC(v)} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", direction: "rtl" }} />
                      <Legend formatter={(val) => <span className="text-xs text-muted-foreground">{val}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                  {cashflowData.every(d => d.value === 0) && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <p className="text-sm text-muted-foreground">אין נתוני תזרים</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {byCustomerData.length > 0 && (
              <Card className="bg-card/80 border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Users className="h-4 w-4 text-purple-400" />הכנסות לפי לקוח
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={byCustomerData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                        <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={{ stroke: "#2a2a3e" }} />
                        <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={{ stroke: "#2a2a3e" }} tickFormatter={v => `₪${(v / 1000).toFixed(0)}K`} width={65} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="value" name="הכנסות" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={32} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {byProductData.length > 0 && (
              <Card className="bg-card/80 border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-orange-400" />הכנסות לפי מוצר
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={byProductData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                        <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={{ stroke: "#2a2a3e" }} />
                        <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={{ stroke: "#2a2a3e" }} tickFormatter={v => `₪${(v / 1000).toFixed(0)}K`} width={65} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="value" name="הכנסות" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={32} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {byCustomerData.length === 0 && byProductData.length === 0 && (
              <Card className="bg-card/80 border-border col-span-2">
                <CardContent className="p-8 text-center text-muted-foreground">
                  <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-lg font-medium">אין נתוני אנליטיקה</p>
                  <p className="text-sm mt-1">הוסף נתונים פיננסיים כדי לראות את הניתוח</p>
                </CardContent>
              </Card>
            )}
          </div>

          {dashboard?.bankBalances && dashboard.bankBalances.length > 0 && (
            <Card className="bg-card/80 border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-foreground">יתרות בנקאיות</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {dashboard.bankBalances.map((b: any, i: number) => (
                    <div key={i} className="bg-input rounded-lg p-3">
                      <p className="text-sm font-medium text-foreground">{b.account_name}</p>
                      <p className="text-xs text-muted-foreground">{b.bank_name} - {b.account_number}</p>
                      <p className={`text-lg font-bold font-mono mt-2 ${Number(b.balance) >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {fmtC(b.balance)}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
