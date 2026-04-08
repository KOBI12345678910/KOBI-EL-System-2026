import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Star, ChevronLeft, TrendingUp, TrendingDown, DollarSign, Users, BarChart3, Activity, Target, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authJson } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const API = "/api";
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function KPICard({ title, value, subtitle, icon: Icon, color, trend }: any) {
  return (
    <Card className={`bg-gradient-to-br ${color}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{title}</p>
            <p className="text-lg sm:text-2xl font-bold text-foreground">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className="p-2 rounded-xl bg-slate-800/50">
            <Icon className="w-5 h-5 text-slate-300" />
          </div>
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 mt-3 text-xs font-medium ${trend >= 0 ? "text-green-400" : "text-red-400"}`}>
            {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend)}% לעומת אשתקד
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ExecutiveSummaryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["executive-summary"],
    queryFn: async () => {
      try {
        return await authJson(`${API}/reports-center/financial`);
      } catch {
        return {};
      }
    },
  });

  const { data: hubData } = useQuery({
    queryKey: ["hub-stats-exec"],
    queryFn: async () => {
      try {
        return await authJson(`${API}/reports-center/hub`);
      } catch {
        return { stats: {} };
      }
    },
  });

  const MONTHS_HE = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יוני", "יולי", "אוג", "ספט", "אוק", "נוב", "דצמ"];
  const monthly = (data?.monthly || []).map((m: any, idx: number) => ({
    month: MONTHS_HE[idx] || `${idx + 1}`,
    income: Number(m.income || 0),
    expenses: Number(m.expenses || 0),
    profit: Number(m.profit || 0),
  }));

  const stats = hubData?.stats || {};
  const totalIncome = Number(data?.totalIncome || 0);
  const totalExpenses = Number(data?.totalExpenses || 0);
  const grossProfit = Number(data?.grossProfit || 0);
  const profitMargin = Number(data?.profitMargin || 0);
  const cashFlow = data?.cashFlow || {};

  const topCustomers = (data?.topCustomers || []).slice(0, 5);

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/reports/financial" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
          דוחות כספיים
        </Link>
        <span>/</span>
        <span className="text-foreground">תקציר מנהלים</span>
      </div>

      <div>
        <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
          <Star className="w-6 h-6 text-yellow-400" /> תקציר מנהלים — Executive Summary
        </h1>
        <p className="text-muted-foreground mt-1">KPIs כספיים עיקריים בתצוגה ניהולית עליונה</p>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">טוען נתונים...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard
              title="סה&quot;כ הכנסות"
              value={`₪${fmt(totalIncome)}`}
              icon={TrendingUp}
              color="from-green-500/15 to-green-600/5 border-green-500/25"
            />
            <KPICard
              title="רווח גולמי"
              value={`₪${fmt(grossProfit)}`}
              icon={DollarSign}
              color={grossProfit >= 0 ? "from-emerald-500/15 to-emerald-600/5 border-emerald-500/25" : "from-red-500/15 to-red-600/5 border-red-500/25"}
            />
            <KPICard
              title="שולי רווח"
              value={`${profitMargin}%`}
              icon={BarChart3}
              color="from-violet-500/15 to-violet-600/5 border-violet-500/25"
            />
            <KPICard
              title="מזומן נוכחי"
              value={`₪${fmt(cashFlow.currentCash)}`}
              icon={Wallet}
              color="from-blue-500/15 to-blue-600/5 border-blue-500/25"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-slate-900/50 border-slate-700/50">
              <CardContent className="p-4 text-center">
                <Users className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
                <p className="text-lg sm:text-2xl font-bold text-foreground">{stats.customers || 0}</p>
                <p className="text-xs text-muted-foreground">לקוחות פעילים</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-700/50">
              <CardContent className="p-4 text-center">
                <Activity className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                <p className="text-lg sm:text-2xl font-bold text-foreground">{stats.invoices || 0}</p>
                <p className="text-xs text-muted-foreground">חשבוניות</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-700/50">
              <CardContent className="p-4 text-center">
                <Target className="w-6 h-6 text-amber-400 mx-auto mb-2" />
                <p className="text-lg sm:text-2xl font-bold text-foreground">₪{fmt(cashFlow.upcomingReceivables)}</p>
                <p className="text-xs text-muted-foreground">צפי גבייה 30 יום</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-700/50">
              <CardContent className="p-4 text-center">
                <TrendingDown className="w-6 h-6 text-red-400 mx-auto mb-2" />
                <p className="text-lg sm:text-2xl font-bold text-foreground">₪{fmt(totalExpenses)}</p>
                <p className="text-xs text-muted-foreground">סה"כ הוצאות</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-slate-900/50 border-slate-700/50">
              <CardHeader><CardTitle className="text-base">מגמת ביצועים — שנה שוטפת</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={monthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                    <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }} formatter={(v: number) => [`₪${fmt(v)}`, ""]} />
                    <Area type="monotone" dataKey="income" stroke="#10b981" fill="#10b981" fillOpacity={0.1} name="הכנסות" />
                    <Area type="monotone" dataKey="profit" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.1} name="רווח" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-700/50">
              <CardHeader><CardTitle className="text-base">לקוחות מובילים — Top 5</CardTitle></CardHeader>
              <CardContent>
                {topCustomers.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">אין נתוני לקוחות</p>
                ) : (
                  <div className="space-y-3">
                    {topCustomers.map((c: any, i: number) => {
                      const pct = totalIncome > 0 ? Math.round((Number(c.value) / totalIncome) * 100) : 0;
                      const colors = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444"];
                      return (
                        <div key={i}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-slate-300 font-medium">{c.name}</span>
                            <span className="text-foreground">₪{fmt(c.value)} ({pct}%)</span>
                          </div>
                          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: colors[i] }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border-slate-600/50">
            <CardHeader>
              <CardTitle className="text-base text-yellow-400">סיכום ניהולי</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs mb-2 font-medium uppercase tracking-wide">ביצועים פיננסיים</p>
                  <ul className="space-y-1.5">
                    <li className="flex justify-between"><span className="text-slate-300">הכנסות שנה שוטפת</span><span className="text-green-400 font-medium">₪{fmt(totalIncome)}</span></li>
                    <li className="flex justify-between"><span className="text-slate-300">רווח גולמי</span><span className={`font-medium ${grossProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>₪{fmt(grossProfit)}</span></li>
                    <li className="flex justify-between"><span className="text-slate-300">שולי רווח</span><span className="text-violet-400 font-medium">{profitMargin}%</span></li>
                  </ul>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-2 font-medium uppercase tracking-wide">נזילות ותזרים</p>
                  <ul className="space-y-1.5">
                    <li className="flex justify-between"><span className="text-slate-300">מזומן נוכחי</span><span className="text-blue-400 font-medium">₪{fmt(cashFlow.currentCash)}</span></li>
                    <li className="flex justify-between"><span className="text-slate-300">צפי קבלות</span><span className="text-green-400 font-medium">₪{fmt(cashFlow.upcomingReceivables)}</span></li>
                    <li className="flex justify-between"><span className="text-slate-300">צפי תשלומים</span><span className="text-red-400 font-medium">₪{fmt(cashFlow.upcomingPayables)}</span></li>
                  </ul>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-2 font-medium uppercase tracking-wide">סטטיסטיקות מערכת</p>
                  <ul className="space-y-1.5">
                    <li className="flex justify-between"><span className="text-slate-300">לקוחות פעילים</span><span className="text-cyan-400 font-medium">{stats.customers || 0}</span></li>
                    <li className="flex justify-between"><span className="text-slate-300">חשבוניות</span><span className="text-cyan-400 font-medium">{stats.invoices || 0}</span></li>
                    <li className="flex justify-between"><span className="text-slate-300">עובדים</span><span className="text-cyan-400 font-medium">{stats.employees || 0}</span></li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
