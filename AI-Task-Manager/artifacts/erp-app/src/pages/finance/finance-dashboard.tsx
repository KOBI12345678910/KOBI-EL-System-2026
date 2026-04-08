import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from "recharts";
import {
  DollarSign, TrendingUp, TrendingDown, CreditCard, Landmark,
  AlertTriangle, ArrowUpRight, ArrowDownRight, Building2, Users,
  FileText, Receipt, Truck, Clock, CheckCircle2,
  Wallet, PiggyBank, BarChart3, Activity,
  Repeat, Settings,
  BookOpen, ShieldCheck, Calculator,
  FileEdit, History, Eye, Mail, ArrowDown, ArrowUp, RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";

const fmt = (v: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v / 100);
const fmtK = (v: number) => {
  const abs = Math.abs(v / 100);
  if (abs >= 1_000_000) return `${v >= 0 ? "" : "-"}₪${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${v >= 0 ? "" : "-"}₪${(abs / 1_000).toFixed(0)}K`;
  return fmt(v);
};
const fmtDirect = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${v >= 0 ? "" : "-"}₪${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${v >= 0 ? "" : "-"}₪${(abs / 1_000).toFixed(0)}K`;
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);
};
const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

const PIE_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#6b7280", "#ef4444"];

const BANK_ICONS = [Landmark, Building2, Wallet, PiggyBank];
const BANK_COLORS = [
  { color: "from-blue-500/20 to-blue-600/10 border-blue-500/30", textColor: "text-blue-400" },
  { color: "from-red-500/20 to-red-600/10 border-red-500/30", textColor: "text-red-400" },
  { color: "from-green-500/20 to-green-600/10 border-green-500/30", textColor: "text-green-400" },
  { color: "from-purple-500/20 to-purple-600/10 border-purple-500/30", textColor: "text-purple-400" },
];

type TileItem = { icon: any; label: string; href: string; color: string; desc: string };

const MODULE_TILES: TileItem[] = [
  { icon: DollarSign, label: "הכנסות", href: "/finance/income", color: "from-yellow-400 to-yellow-500", desc: "ניהול הכנסות ומסמכים" },
  { icon: CreditCard, label: "סליקת אשראי", href: "/finance/credit-card-processing", color: "from-blue-400 to-blue-500", desc: "סליקה וחיובים" },
  { icon: Building2, label: "הנהלת חשבונות", href: "/finance/accounting-portal", color: "from-emerald-400 to-emerald-500", desc: "פורטל רו״ח" },
  { icon: Receipt, label: "הוצאות", href: "/finance/expense-breakdown", color: "from-red-400 to-red-500", desc: "ניהול הוצאות" },
  { icon: Truck, label: "ספקים", href: "/finance/accounts-payable", color: "from-orange-400 to-orange-500", desc: "חובות לספקים" },
  { icon: Users, label: "לקוחות", href: "/finance/accounts-receivable", color: "from-purple-400 to-purple-500", desc: "חייבים ולקוחות" },
  { icon: Repeat, label: "הוראות קבע", href: "/finance/standing-orders", color: "from-indigo-400 to-indigo-500", desc: "חיובים מחזוריים" },
  { icon: BarChart3, label: "דוחות מנהלים", href: "/finance/reports", color: "from-violet-400 to-violet-500", desc: "תקציר מנהלים" },
  { icon: BookOpen, label: "תנועות יומן", href: "/finance/journal-transactions", color: "from-sky-400 to-sky-500", desc: "רישום תנועות" },
  { icon: ShieldCheck, label: "בקרה חשבונאית", href: "/finance/audit-control", color: "from-rose-400 to-rose-500", desc: "ביקורת ובקרה" },
  { icon: Calculator, label: "לוח פחת", href: "/finance/depreciation-schedule", color: "from-stone-400 to-stone-500", desc: "לוח זמנים פחת" },
  { icon: Landmark, label: "ניתוח הלוואות", href: "/finance/loan-analysis", color: "from-emerald-300 to-emerald-400", desc: "ניהול הלוואות" },
  { icon: FileEdit, label: "פקודות התאמה", href: "/finance/adjusting-entries", color: "from-blue-300 to-blue-400", desc: "רישומי התאמה" },
  { icon: History, label: "מעקב שינויים", href: "/finance/change-tracking", color: "from-zinc-400 to-zinc-500", desc: "היסטוריית שינויים" },
  { icon: Settings, label: "הגדרות", href: "/finance/settings", color: "from-gray-400 to-gray-500", desc: "הגדרות חשבונאות" },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-right" dir="rtl">
      <p className="text-sm font-medium text-foreground mb-2">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />{entry.name}</span>
          <span className="font-mono text-foreground">{fmtDirect(entry.value)}</span>
        </div>
      ))}
    </div>
  );
};

function EmptyState({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <FileText className="h-8 w-8 text-muted-foreground/30 mb-2" />
      <p className="text-sm text-muted-foreground">{title}</p>
      {desc && <p className="text-xs text-muted-foreground/70 mt-1">{desc}</p>}
    </div>
  );
}

export default function FinanceDashboard() {
  const [period, setPeriod] = useState<"month" | "quarter" | "year">("month");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["finance-dashboard"],
    queryFn: async () => {
      const res = await authFetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/finance/dashboard`);
      if (!res.ok) throw new Error(`שגיאה ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-muted-foreground">טוען דשבורד כספים...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <AlertTriangle className="h-12 w-12 text-red-400" />
          <p className="text-red-400">שגיאה בטעינת הנתונים</p>
          <Button onClick={() => refetch()} className="bg-blue-600 hover:bg-blue-700">נסה שוב</Button>
        </div>
      </div>
    );
  }

  const kpis = data?.kpis || {
    currentMonthRevenue: 0, prevMonthRevenue: 0, revenueChange: 0,
    currentMonthExpense: 0, prevMonthExpense: 0, expenseChange: 0,
    netProfit: 0, prevNetProfit: 0, profitChange: 0,
    totalBankBalance: 0, bankCount: 0,
  };
  const cashFlowData = data?.cashFlowData || [];
  const topCustomers: any[] = data?.topCustomers || [];
  const topSuppliers: any[] = data?.topSuppliers || [];
  const recentTransactions: any[] = data?.recentTransactions || [];
  const overdueInvoices: any[] = data?.overdueInvoices || [];
  const bankAccounts: any[] = data?.bankAccounts || [];
  const expenseBreakdown: any[] = data?.expenseBreakdown || [];

  const totalOverdue = overdueInvoices.reduce((s: number, i: any) => s + (i.amount || 0), 0);
  const criticalCount = overdueInvoices.filter((i: any) => i.status === "critical").length;

  const revenueVsExpense = cashFlowData.map((d: any) => ({
    month: d.monthShort || d.month,
    revenue: d.income,
    expenses: d.expense,
  }));

  const hasData = data?.hasData ?? false;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">דשבורד כספים</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {hasData ? "נתונים בזמן אמת מהמערכת" : "אין נתונים — הכנס נתונים למערכת כדי לראות סיכום כאן"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-muted-foreground gap-1">
            <RefreshCw className="h-3.5 w-3.5" />
            רענון
          </Button>
          {(["month", "quarter", "year"] as const).map(p => (
            <Button key={p} variant={period === p ? "default" : "outline"} size="sm" onClick={() => setPeriod(p)} className={period === p ? "bg-blue-600 hover:bg-blue-700" : "border-border text-muted-foreground"}>
              {p === "month" ? "חודשי" : p === "quarter" ? "רבעוני" : "שנתי"}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-emerald-500/15 to-emerald-600/5 border-emerald-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="h-5 w-5 text-emerald-400" />
              <Badge className={`text-[10px] px-1.5 py-0.5 border-0 ${kpis.revenueChange > 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
                {kpis.revenueChange > 0 ? <ArrowUpRight className="h-3 w-3 inline" /> : <ArrowDownRight className="h-3 w-3 inline" />}{pct(kpis.revenueChange)}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">הכנסות החודש</p>
            <p className="text-xl font-bold text-emerald-400 font-mono mt-1">{fmtDirect(kpis.currentMonthRevenue)}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500/15 to-red-600/5 border-red-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Receipt className="h-5 w-5 text-red-400" />
              <Badge className={`text-[10px] px-1.5 py-0.5 border-0 ${kpis.expenseChange < 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
                {kpis.expenseChange < 0 ? <ArrowDownRight className="h-3 w-3 inline" /> : <ArrowUpRight className="h-3 w-3 inline" />}{pct(kpis.expenseChange)}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">הוצאות החודש</p>
            <p className="text-xl font-bold text-red-400 font-mono mt-1">{fmtDirect(kpis.currentMonthExpense)}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/15 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="h-5 w-5 text-blue-400" />
              <Badge className={`text-[10px] px-1.5 py-0.5 border-0 ${kpis.profitChange > 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
                {kpis.profitChange > 0 ? <ArrowUpRight className="h-3 w-3 inline" /> : <ArrowDownRight className="h-3 w-3 inline" />}{pct(kpis.profitChange)}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">רווח נקי</p>
            <p className={`text-xl font-bold font-mono mt-1 ${kpis.netProfit >= 0 ? "text-blue-400" : "text-red-400"}`}>{fmtDirect(kpis.netProfit)}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/15 to-amber-600/5 border-amber-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Landmark className="h-5 w-5 text-amber-400" />
              <Badge className="text-[10px] px-1.5 py-0.5 border-0 bg-amber-500/20 text-amber-300">{kpis.bankCount} חשבונות</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">יתרות בנקים</p>
            <p className="text-xl font-bold text-amber-400 font-mono mt-1">{fmtDirect(kpis.totalBankBalance)}</p>
          </CardContent>
        </Card>
      </div>

      {bankAccounts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {bankAccounts.slice(0, 4).map((acc: any, i: number) => {
            const BankIcon = BANK_ICONS[i % BANK_ICONS.length];
            const colors = BANK_COLORS[i % BANK_COLORS.length];
            return (
              <Card key={i} className={`bg-gradient-to-br ${colors.color}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <BankIcon className={`h-4 w-4 ${colors.textColor}`} />
                      <span className="text-sm font-medium text-foreground">{acc.bank}</span>
                    </div>
                    {acc.branch && <span className="text-[10px] text-muted-foreground">סניף {acc.branch}</span>}
                  </div>
                  {acc.account && <p className="text-[11px] text-muted-foreground mb-1">חשבון {acc.account}</p>}
                  <p className={`text-lg font-bold font-mono ${colors.textColor}`}>{fmtDirect(acc.balance)}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="bg-card/80 border-border">
          <CardContent className="p-4">
            <EmptyState title="אין חשבונות בנק פעילים" desc="הוסף חשבונות בנק למערכת" />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card/80 border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2"><Activity className="h-4 w-4 text-cyan-400" />תזרים מזומנים — 6 חודשים</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {cashFlowData.length > 0 ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cashFlowData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                    <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#2a2a3e" }} />
                    <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={{ stroke: "#2a2a3e" }} tickFormatter={(v) => fmtDirect(v)} width={70} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend formatter={(v) => <span className="text-xs text-muted-foreground">{v}</span>} />
                    <Area type="monotone" dataKey="income" name="הכנסות" stroke="#10b981" fill="url(#incGrad)" strokeWidth={2} />
                    <Area type="monotone" dataKey="expense" name="הוצאות" stroke="#ef4444" fill="url(#expGrad)" strokeWidth={2} />
                    <Area type="monotone" dataKey="net" name="נטו" stroke="#3b82f6" fill="url(#netGrad)" strokeWidth={2} strokeDasharray="5 5" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[280px] flex items-center justify-center">
                <EmptyState title="אין נתוני תזרים" desc="בצע הזמנות מכירה ורכש כדי לראות תזרים" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/80 border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2"><BarChart3 className="h-4 w-4 text-violet-400" />הכנסות מול הוצאות</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {revenueVsExpense.length > 0 ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueVsExpense} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                    <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#2a2a3e" }} />
                    <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={{ stroke: "#2a2a3e" }} tickFormatter={(v) => fmtDirect(v)} width={70} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend formatter={(v) => <span className="text-xs text-muted-foreground">{v}</span>} />
                    <Bar dataKey="revenue" name="הכנסות" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
                    <Bar dataKey="expenses" name="הוצאות" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[280px] flex items-center justify-center">
                <EmptyState title="אין נתוני הכנסות/הוצאות" desc="בצע הזמנות מכירה ורכש כדי לראות נתונים" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="bg-card/80 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2"><Users className="h-4 w-4 text-purple-400" />טופ 5 לקוחות לפי הכנסה</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {topCustomers.length > 0 ? (
              <div className="space-y-3">
                {topCustomers.map((c: any, i: number) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-foreground truncate">{c.name}</p>
                        <p className="text-sm font-mono text-emerald-400 flex-shrink-0 mr-2">{fmtDirect(c.revenue)}</p>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <div className="flex-1 bg-muted rounded-full h-1.5 ml-2">
                          <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${topCustomers[0]?.revenue > 0 ? (c.revenue / topCustomers[0].revenue) * 100 : 0}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">{c.invoices} הזמנות</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="אין נתוני לקוחות" desc="בצע הזמנות מכירה כדי לראות לקוחות מובילים" />
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/80 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2"><Truck className="h-4 w-4 text-orange-400" />טופ 5 ספקים לפי הוצאה</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {topSuppliers.length > 0 ? (
              <div className="space-y-3">
                {topSuppliers.map((s: any, i: number) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-300 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-foreground truncate">{s.name}</p>
                        <p className="text-sm font-mono text-red-400 flex-shrink-0 mr-2">{fmtDirect(s.spend)}</p>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <div className="flex-1 bg-muted rounded-full h-1.5 ml-2">
                          <div className="bg-orange-500 h-1.5 rounded-full" style={{ width: `${topSuppliers[0]?.spend > 0 ? (s.spend / topSuppliers[0].spend) * 100 : 0}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">{s.orders} הזמנות</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="אין נתוני ספקים" desc="בצע הזמנות רכש כדי לראות ספקים מובילים" />
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/80 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2"><Receipt className="h-4 w-4 text-amber-400" />פילוח הוצאות</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {expenseBreakdown.length > 0 ? (
              <>
                <div className="h-[160px] flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart width={160} height={160}>
                      <Pie data={expenseBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} strokeWidth={0}>
                        {expenseBreakdown.map((_e: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmtDirect(v)} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", direction: "rtl" }} itemStyle={{ color: "hsl(var(--foreground))" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-1.5 mt-1">
                  {expenseBreakdown.map((e: any, i: number) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-muted-foreground truncate">{e.name}</span>
                      <span className="text-foreground font-mono mr-auto">{e.percent}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[200px] flex items-center justify-center">
                <EmptyState title="אין נתוני הוצאות" desc="בצע הזמנות רכש כדי לראות פילוח" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/80 border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              חשבוניות באיחור
              {overdueInvoices.length > 0 && (
                <>
                  <Badge className="bg-red-500/20 text-red-300 border-0 text-[10px] mr-1">{overdueInvoices.length} פתוחות</Badge>
                  {criticalCount > 0 && <Badge className="bg-red-600/30 text-red-200 border-0 text-[10px]">{criticalCount} קריטי</Badge>}
                </>
              )}
            </CardTitle>
            {overdueInvoices.length > 0 && <p className="text-sm font-mono text-red-400">{fmtDirect(totalOverdue)} סה״כ</p>}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {overdueInvoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium text-xs">חשבונית</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium text-xs">לקוח</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium text-xs">סכום</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium text-xs">תאריך פירעון</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium text-xs">ימי איחור</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium text-xs">חומרה</th>
                    <th className="text-center py-2 px-3 text-muted-foreground font-medium text-xs">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueInvoices.map((inv: any) => (
                    <tr key={inv.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-xs text-blue-400">{inv.id}</td>
                      <td className="py-2.5 px-3 text-foreground">{inv.customer}</td>
                      <td className="py-2.5 px-3 font-mono text-red-400">{fmtDirect(inv.amount)}</td>
                      <td className="py-2.5 px-3 text-muted-foreground text-xs">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("he-IL") : ""}</td>
                      <td className="py-2.5 px-3">
                        <span className={`font-mono text-xs ${inv.daysOverdue > 30 ? "text-red-400" : inv.daysOverdue > 14 ? "text-amber-400" : "text-yellow-400"}`}>{inv.daysOverdue} ימים</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge className={`text-[10px] border-0 ${inv.status === "critical" ? "bg-red-500/20 text-red-300" : inv.status === "warning" ? "bg-amber-500/20 text-amber-300" : "bg-yellow-500/20 text-yellow-300"}`}>
                          {inv.status === "critical" ? "קריטי" : inv.status === "warning" ? "אזהרה" : "מעקב"}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"><Eye className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-blue-400"><Mail className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <p className="text-sm text-emerald-400">אין חשבוניות באיחור</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card/80 border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2"><Clock className="h-4 w-4 text-cyan-400" />תנועות אחרונות</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {recentTransactions.length > 0 ? (
            <div className="space-y-2">
              {recentTransactions.map((txn: any) => (
                <div key={txn.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-background/50 hover:bg-muted/30 transition-colors">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${txn.type === "income" ? "bg-emerald-500/20" : "bg-red-500/20"}`}>
                    {txn.type === "income" ? <ArrowDown className="h-4 w-4 text-emerald-400" /> : <ArrowUp className="h-4 w-4 text-red-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{txn.desc}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{txn.date}</span>
                      <span className="text-[10px] text-muted-foreground">•</span>
                      <span className="text-[10px] text-muted-foreground">{txn.method}</span>
                      <span className="text-[10px] text-muted-foreground">•</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{txn.id}</span>
                    </div>
                  </div>
                  <p className={`text-sm font-mono flex-shrink-0 ${txn.amount >= 0 ? "text-emerald-400" : "text-red-400"}`}>{txn.amount >= 0 ? "+" : ""}{fmtDirect(Math.abs(txn.amount))}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="אין תנועות אחרונות" desc="בצע הזמנות מכירה ורכש כדי לראות תנועות" />
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">מודולי כספים</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {MODULE_TILES.map((tile, idx) => (
            <Link key={idx} href={tile.href}>
              <Card className="bg-card/60 border-border hover:border-border transition-all cursor-pointer group h-full">
                <CardContent className="p-3 flex flex-col items-center text-center gap-2">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tile.color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                    <tile.icon className="w-5 h-5 text-foreground" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">{tile.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{tile.desc}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
