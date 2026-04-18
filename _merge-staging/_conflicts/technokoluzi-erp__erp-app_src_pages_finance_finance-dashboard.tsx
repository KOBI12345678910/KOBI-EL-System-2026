import { useState, useMemo } from "react";
import { Link } from "wouter";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from "recharts";
import {
  DollarSign, TrendingUp, TrendingDown, CreditCard, Landmark,
  AlertTriangle, ArrowUpRight, ArrowDownRight, Building2, Users,
  FileText, Receipt, Truck, Clock, CheckCircle2, XCircle,
  Wallet, PiggyBank, BarChart3, Activity, ChevronLeft,
  Bot, Settings, Repeat, Zap, Mail, Send, Code, Scan,
  UserPlus, FileSpreadsheet, Plus, ArrowUp, ArrowDown,
  BookOpen, ShieldCheck, FolderOpen, Package, Calculator,
  FileEdit, ClipboardList, History, BanknoteIcon, Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const fmt = (v: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v / 100);
const fmtK = (v: number) => {
  const abs = Math.abs(v / 100);
  if (abs >= 1_000_000) return `${v > 0 ? "" : "-"}₪${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${v > 0 ? "" : "-"}₪${(abs / 1_000).toFixed(0)}K`;
  return fmt(v);
};
const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

const MONTHS_HE = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

const CASH_FLOW_DATA = [
  { month: "אוקטובר", income: 285000000, expense: 210000000, net: 75000000 },
  { month: "נובמבר", income: 310000000, expense: 225000000, net: 85000000 },
  { month: "דצמבר", income: 340000000, expense: 260000000, net: 80000000 },
  { month: "ינואר", income: 295000000, expense: 230000000, net: 65000000 },
  { month: "פברואר", income: 325000000, expense: 240000000, net: 85000000 },
  { month: "מרץ", income: 380000000, expense: 255000000, net: 125000000 },
];

const REVENUE_VS_EXPENSE = [
  { month: "אוקט׳", revenue: 285000000, expenses: 210000000 },
  { month: "נוב׳", revenue: 310000000, expenses: 225000000 },
  { month: "דצמ׳", revenue: 340000000, expenses: 260000000 },
  { month: "ינו׳", revenue: 295000000, expenses: 230000000 },
  { month: "פבר׳", revenue: 325000000, expenses: 240000000 },
  { month: "מרץ", revenue: 380000000, expenses: 255000000 },
];

const TOP_CUSTOMERS = [
  { name: "מפעלי פלדה בע\"מ", revenue: 48500000, invoices: 24, trend: 12.3 },
  { name: "אלומיניום ישראל", revenue: 42300000, invoices: 18, trend: 8.7 },
  { name: "זכוכית הנגב", revenue: 36800000, invoices: 15, trend: -2.1 },
  { name: "בניין ופיתוח מזרחי", revenue: 31200000, invoices: 12, trend: 15.4 },
  { name: "קבוצת שמיר תעשיות", revenue: 28900000, invoices: 20, trend: 5.8 },
];

const TOP_SUPPLIERS = [
  { name: "מחסני הפלדה", spend: 38200000, orders: 32, trend: 6.2 },
  { name: "אלקו חומרי גלם", spend: 29800000, orders: 28, trend: -3.4 },
  { name: "טורבו מתכות", spend: 24500000, orders: 22, trend: 11.1 },
  { name: "גלאס-טק בע\"מ", spend: 21300000, orders: 16, trend: 4.5 },
  { name: "ברזל הצפון", spend: 18700000, orders: 14, trend: -1.8 },
];

const OVERDUE_INVOICES = [
  { id: "INV-2026-0847", customer: "זכוכית הנגב", amount: 4250000, dueDate: "2026-02-15", daysOverdue: 37, status: "critical" },
  { id: "INV-2026-0892", customer: "בניין ופיתוח מזרחי", amount: 3180000, dueDate: "2026-02-28", daysOverdue: 24, status: "warning" },
  { id: "INV-2026-0923", customer: "אלומיניום ישראל", amount: 2890000, dueDate: "2026-03-05", daysOverdue: 19, status: "warning" },
  { id: "INV-2026-0956", customer: "קבוצת שמיר תעשיות", amount: 1950000, dueDate: "2026-03-10", daysOverdue: 14, status: "info" },
  { id: "INV-2026-0978", customer: "מפעלי פלדה בע\"מ", amount: 5620000, dueDate: "2026-03-12", daysOverdue: 12, status: "info" },
  { id: "INV-2026-1003", customer: "תעשיות ברזל עמק", amount: 1280000, dueDate: "2026-03-15", daysOverdue: 9, status: "info" },
];

const BANK_ACCOUNTS = [
  { bank: "לאומי", branch: "612", account: "28-847521", balance: 285400000, currency: "ILS", icon: Landmark, color: "from-blue-500/20 to-blue-600/10 border-blue-500/30", textColor: "text-blue-400" },
  { bank: "הפועלים", branch: "532", account: "12-334890", balance: 142800000, currency: "ILS", icon: Building2, color: "from-red-500/20 to-red-600/10 border-red-500/30", textColor: "text-red-400" },
  { bank: "דיסקונט", branch: "071", account: "55-192847", balance: 98600000, currency: "ILS", icon: Wallet, color: "from-green-500/20 to-green-600/10 border-green-500/30", textColor: "text-green-400" },
  { bank: "מזרחי-טפחות", branch: "423", account: "90-556123", balance: 67300000, currency: "ILS", icon: PiggyBank, color: "from-purple-500/20 to-purple-600/10 border-purple-500/30", textColor: "text-purple-400" },
];

const EXPENSE_BREAKDOWN = [
  { name: "חומרי גלם", value: 42, color: "#3b82f6" },
  { name: "שכר עובדים", value: 28, color: "#8b5cf6" },
  { name: "לוגיסטיקה", value: 12, color: "#10b981" },
  { name: "תפעול", value: 10, color: "#f59e0b" },
  { name: "אחר", value: 8, color: "#6b7280" },
];

const RECENT_TRANSACTIONS = [
  { id: "TXN-4821", type: "income", desc: "תשלום מלקוח — מפעלי פלדה", amount: 12500000, date: "24/03/2026", method: "העברה בנקאית" },
  { id: "TXN-4820", type: "expense", desc: "רכישת חומרי גלם — מחסני הפלדה", amount: -8340000, date: "24/03/2026", method: "שיק" },
  { id: "TXN-4819", type: "income", desc: "תשלום מלקוח — אלומיניום ישראל", amount: 6780000, date: "23/03/2026", method: "אשראי" },
  { id: "TXN-4818", type: "expense", desc: "משכורות חודש מרץ", amount: -24500000, date: "23/03/2026", method: "העברה בנקאית" },
  { id: "TXN-4817", type: "expense", desc: "חשמל וגז — חברת החשמל", amount: -3200000, date: "22/03/2026", method: "הו\"ק" },
  { id: "TXN-4816", type: "income", desc: "תשלום מלקוח — זכוכית הנגב", amount: 9100000, date: "22/03/2026", method: "העברה בנקאית" },
];

const CASHFLOW_FORECAST = [
  { month: "אפריל", projected: 92000000, actual: null },
  { month: "מאי", projected: 88000000, actual: null },
  { month: "יוני", projected: 105000000, actual: null },
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
    <div className="bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg p-3 shadow-xl text-right" dir="rtl">
      <p className="text-sm font-medium text-white mb-2">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />{entry.name}</span>
          <span className="font-mono text-white">{fmtK(entry.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function FinanceDashboard() {
  const [period, setPeriod] = useState<"month" | "quarter" | "year">("month");

  const totalBankBalance = useMemo(() => BANK_ACCOUNTS.reduce((s, a) => s + a.balance, 0), []);
  const totalOverdue = useMemo(() => OVERDUE_INVOICES.reduce((s, i) => s + i.amount, 0), []);
  const criticalCount = OVERDUE_INVOICES.filter(i => i.status === "critical").length;
  const currentMonthRevenue = 380000000;
  const prevMonthRevenue = 325000000;
  const revenueChange = ((currentMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100;
  const currentMonthExpense = 255000000;
  const prevMonthExpense = 240000000;
  const expenseChange = ((currentMonthExpense - prevMonthExpense) / prevMonthExpense) * 100;
  const netProfit = currentMonthRevenue - currentMonthExpense;
  const prevNetProfit = prevMonthRevenue - prevMonthExpense;
  const profitChange = ((netProfit - prevNetProfit) / prevNetProfit) * 100;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">דשבורד כספים</h1>
          <p className="text-sm text-muted-foreground mt-1">סקירה כלכלית — מרץ 2026</p>
        </div>
        <div className="flex items-center gap-2">
          {(["month", "quarter", "year"] as const).map(p => (
            <Button key={p} variant={period === p ? "default" : "outline"} size="sm" onClick={() => setPeriod(p)} className={period === p ? "bg-blue-600 hover:bg-blue-700" : "border-[#2a2a3e] text-muted-foreground"}>
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
              <Badge className={`text-[10px] px-1.5 py-0.5 border-0 ${revenueChange > 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
                {revenueChange > 0 ? <ArrowUpRight className="h-3 w-3 inline" /> : <ArrowDownRight className="h-3 w-3 inline" />}{pct(revenueChange)}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">הכנסות החודש</p>
            <p className="text-xl font-bold text-emerald-400 font-mono mt-1">{fmtK(currentMonthRevenue)}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500/15 to-red-600/5 border-red-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Receipt className="h-5 w-5 text-red-400" />
              <Badge className={`text-[10px] px-1.5 py-0.5 border-0 ${expenseChange < 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
                {expenseChange < 0 ? <ArrowDownRight className="h-3 w-3 inline" /> : <ArrowUpRight className="h-3 w-3 inline" />}{pct(expenseChange)}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">הוצאות החודש</p>
            <p className="text-xl font-bold text-red-400 font-mono mt-1">{fmtK(currentMonthExpense)}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/15 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="h-5 w-5 text-blue-400" />
              <Badge className={`text-[10px] px-1.5 py-0.5 border-0 ${profitChange > 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
                {profitChange > 0 ? <ArrowUpRight className="h-3 w-3 inline" /> : <ArrowDownRight className="h-3 w-3 inline" />}{pct(profitChange)}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">רווח נקי</p>
            <p className="text-xl font-bold text-blue-400 font-mono mt-1">{fmtK(netProfit)}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/15 to-amber-600/5 border-amber-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Landmark className="h-5 w-5 text-amber-400" />
              <Badge className="text-[10px] px-1.5 py-0.5 border-0 bg-amber-500/20 text-amber-300">{BANK_ACCOUNTS.length} חשבונות</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">יתרות בנקים</p>
            <p className="text-xl font-bold text-amber-400 font-mono mt-1">{fmtK(totalBankBalance)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {BANK_ACCOUNTS.map((acc, i) => (
          <Card key={i} className={`bg-gradient-to-br ${acc.color}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <acc.icon className={`h-4 w-4 ${acc.textColor}`} />
                  <span className="text-sm font-medium text-white">{acc.bank}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">סניף {acc.branch}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mb-1">חשבון {acc.account}</p>
              <p className={`text-lg font-bold font-mono ${acc.textColor}`}>{fmtK(acc.balance)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-[#1a1a2e]/80 border-[#2a2a3e]">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2"><Activity className="h-4 w-4 text-cyan-400" />תזרים מזומנים — 6 חודשים</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={CASH_FLOW_DATA} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                  <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={{ stroke: "#2a2a3e" }} tickFormatter={(v) => fmtK(v)} width={70} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend formatter={(v) => <span className="text-xs text-muted-foreground">{v}</span>} />
                  <Area type="monotone" dataKey="income" name="הכנסות" stroke="#10b981" fill="url(#incGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="expense" name="הוצאות" stroke="#ef4444" fill="url(#expGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="net" name="נטו" stroke="#3b82f6" fill="url(#netGrad)" strokeWidth={2} strokeDasharray="5 5" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#1a1a2e]/80 border-[#2a2a3e]">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2"><BarChart3 className="h-4 w-4 text-violet-400" />הכנסות מול הוצאות</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={REVENUE_VS_EXPENSE} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                  <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#2a2a3e" }} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={{ stroke: "#2a2a3e" }} tickFormatter={(v) => fmtK(v)} width={70} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend formatter={(v) => <span className="text-xs text-muted-foreground">{v}</span>} />
                  <Bar dataKey="revenue" name="הכנסות" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="expenses" name="הוצאות" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="bg-[#1a1a2e]/80 border-[#2a2a3e]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2"><Users className="h-4 w-4 text-purple-400" />טופ 5 לקוחות לפי הכנסה</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {TOP_CUSTOMERS.map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-white truncate">{c.name}</p>
                      <p className="text-sm font-mono text-emerald-400 flex-shrink-0 mr-2">{fmtK(c.revenue)}</p>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex-1 bg-[#2a2a3e] rounded-full h-1.5 ml-2">
                        <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${(c.revenue / TOP_CUSTOMERS[0].revenue) * 100}%` }} />
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-[10px] text-muted-foreground">{c.invoices} חשב׳</span>
                        <span className={`text-[10px] ${c.trend > 0 ? "text-emerald-400" : "text-red-400"}`}>{pct(c.trend)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#1a1a2e]/80 border-[#2a2a3e]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2"><Truck className="h-4 w-4 text-orange-400" />טופ 5 ספקים לפי הוצאה</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {TOP_SUPPLIERS.map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-300 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-white truncate">{s.name}</p>
                      <p className="text-sm font-mono text-red-400 flex-shrink-0 mr-2">{fmtK(s.spend)}</p>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex-1 bg-[#2a2a3e] rounded-full h-1.5 ml-2">
                        <div className="bg-orange-500 h-1.5 rounded-full" style={{ width: `${(s.spend / TOP_SUPPLIERS[0].spend) * 100}%` }} />
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-[10px] text-muted-foreground">{s.orders} הזמנות</span>
                        <span className={`text-[10px] ${s.trend < 0 ? "text-emerald-400" : "text-red-400"}`}>{pct(s.trend)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#1a1a2e]/80 border-[#2a2a3e]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2"><Receipt className="h-4 w-4 text-amber-400" />פילוח הוצאות</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[160px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={EXPENSE_BREAKDOWN} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} strokeWidth={0}>
                    {EXPENSE_BREAKDOWN.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #2a2a3e", borderRadius: "8px", direction: "rtl" }} itemStyle={{ color: "#fff" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-1">
              {EXPENSE_BREAKDOWN.map((e, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: e.color }} />
                  <span className="text-muted-foreground truncate">{e.name}</span>
                  <span className="text-white font-mono mr-auto">{e.value}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-[#1a1a2e]/80 border-[#2a2a3e]">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              חשבוניות באיחור
              <Badge className="bg-red-500/20 text-red-300 border-0 text-[10px] mr-1">{OVERDUE_INVOICES.length} פתוחות</Badge>
              {criticalCount > 0 && <Badge className="bg-red-600/30 text-red-200 border-0 text-[10px]">{criticalCount} קריטי</Badge>}
            </CardTitle>
            <p className="text-sm font-mono text-red-400">{fmt(totalOverdue)} סה״כ</p>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a3e]">
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
                {OVERDUE_INVOICES.map((inv) => (
                  <tr key={inv.id} className="border-b border-[#2a2a3e]/50 hover:bg-[#2a2a3e]/30 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-xs text-blue-400">{inv.id}</td>
                    <td className="py-2.5 px-3 text-white">{inv.customer}</td>
                    <td className="py-2.5 px-3 font-mono text-red-400">{fmt(inv.amount)}</td>
                    <td className="py-2.5 px-3 text-muted-foreground text-xs">{new Date(inv.dueDate).toLocaleDateString("he-IL")}</td>
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
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-white"><Eye className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-blue-400"><Mail className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#1a1a2e]/80 border-[#2a2a3e]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-white flex items-center gap-2"><Clock className="h-4 w-4 text-cyan-400" />תנועות אחרונות</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            {RECENT_TRANSACTIONS.map((txn) => (
              <div key={txn.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-[#0a0a1a]/50 hover:bg-[#2a2a3e]/30 transition-colors">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${txn.type === "income" ? "bg-emerald-500/20" : "bg-red-500/20"}`}>
                  {txn.type === "income" ? <ArrowDown className="h-4 w-4 text-emerald-400" /> : <ArrowUp className="h-4 w-4 text-red-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{txn.desc}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">{txn.date}</span>
                    <span className="text-[10px] text-muted-foreground">•</span>
                    <span className="text-[10px] text-muted-foreground">{txn.method}</span>
                    <span className="text-[10px] text-muted-foreground">•</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{txn.id}</span>
                  </div>
                </div>
                <p className={`text-sm font-mono flex-shrink-0 ${txn.amount > 0 ? "text-emerald-400" : "text-red-400"}`}>{txn.amount > 0 ? "+" : ""}{fmtK(txn.amount)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold text-white mb-4">מודולי כספים</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {MODULE_TILES.map((tile, idx) => (
            <Link key={idx} href={tile.href}>
              <Card className="bg-[#1a1a2e]/60 border-[#2a2a3e] hover:border-[#3a3a5e] transition-all cursor-pointer group h-full">
                <CardContent className="p-3 flex flex-col items-center text-center gap-2">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tile.color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                    <tile.icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-white">{tile.label}</p>
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
