import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authFetch } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";
import {
  Wallet, TrendingUp, TrendingDown, Building2, DollarSign, CreditCard,
  ArrowUpRight, ArrowDownRight, AlertCircle, CheckCircle2, Clock,
  Landmark, PiggyBank, Receipt, Users, Banknote, Activity,
} from "lucide-react";

const API = "/api";

/* ── Types ─────────────────────────────────────────────── */
interface FinancialSummary {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  currentRatio: number;
  cashPosition: number;
  cashChange: number;
  revenueThisMonth: number;
  revenueChange: number;
  expensesThisMonth: number;
  expensesChange: number;
}

interface Receivable {
  id: number;
  customer: string;
  amount: number;
  dueDate: string;
  daysOverdue: number;
  invoiceNumber: string;
}

interface Payable {
  id: number;
  supplier: string;
  amount: number;
  dueDate: string;
  daysUntilDue: number;
  invoiceNumber: string;
}

interface CashFlowWeek {
  week: string;
  inflow: number;
  outflow: number;
  net: number;
  balance: number;
}

interface HealthIndicator {
  name: string;
  value: string;
  status: "green" | "yellow" | "red";
  description: string;
}

/* ── Helpers ───────────────────────────────────────────── */
const fmt = (v: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);

const fmtK = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${v < 0 ? "-" : ""}${(abs / 1_000_000).toFixed(1)}M ₪`;
  if (abs >= 1_000) return `${v < 0 ? "-" : ""}${(abs / 1_000).toFixed(0)}K ₪`;
  return fmt(v);
};

const trafficLight: Record<string, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
};

const trafficLightBg: Record<string, string> = {
  green: "bg-green-500/10 border-green-500/20",
  yellow: "bg-yellow-500/10 border-yellow-500/20",
  red: "bg-red-500/10 border-red-500/20",
};

/* ── Mock data ─────────────────────────────────────────── */
function generateSummary(): FinancialSummary {
  return {
    totalAssets: 12_450_000,
    totalLiabilities: 4_820_000,
    netWorth: 7_630_000,
    currentRatio: 2.14,
    cashPosition: 3_280_000,
    cashChange: 8.5,
    revenueThisMonth: 1_850_000,
    revenueChange: 12.3,
    expensesThisMonth: 1_420_000,
    expensesChange: -3.2,
  };
}

function generateReceivables(): Receivable[] {
  const customers = [
    "רשת סופר-פארם", "טמבור בע\"מ", "אלביט מערכות", "שטראוס גרופ",
    "אמות השקעות", "מנורה מבטחים", "אלקטרה בנייה", "רמי לוי",
    "ויקטורי סופרמרקט", "פלאפון תקשורת",
  ];
  return customers.map((customer, i) => ({
    id: i + 1,
    customer,
    amount: Math.floor(Math.random() * 200000) + 15000,
    dueDate: new Date(Date.now() - (i < 5 ? (i * 10 + 5) : -(i * 8)) * 86400000).toISOString().slice(0, 10),
    daysOverdue: i < 5 ? i * 10 + 5 : 0,
    invoiceNumber: `INV-2026-${String(1200 + i).padStart(4, "0")}`,
  }));
}

function generatePayables(): Payable[] {
  const suppliers = [
    "Shenzhen Tech Co.", "מפעלי ברזל הצפון", "אריזות דניאל", "מובילי הדרום",
    "כימיקלים ישראל", "חשמל ואלקטרוניקה", "דלק אנרגיות", "ציוד משרדי פלוס",
  ];
  return suppliers.map((supplier, i) => ({
    id: i + 1,
    supplier,
    amount: Math.floor(Math.random() * 150000) + 8000,
    dueDate: new Date(Date.now() + (i * 7 + 3) * 86400000).toISOString().slice(0, 10),
    daysUntilDue: i * 7 + 3,
    invoiceNumber: `BILL-2026-${String(500 + i).padStart(4, "0")}`,
  }));
}

function generateCashFlow(): CashFlowWeek[] {
  const weeks: CashFlowWeek[] = [];
  let balance = 3_280_000;
  for (let i = 0; i < 12; i++) {
    const inflow = Math.floor(Math.random() * 300000) + 250000;
    const outflow = Math.floor(Math.random() * 280000) + 200000;
    const net = inflow - outflow;
    balance += net;
    const weekDate = new Date(Date.now() + i * 7 * 86400000);
    weeks.push({
      week: `ש' ${i + 1}`,
      inflow,
      outflow,
      net,
      balance,
    });
  }
  return weeks;
}

function generateHealthIndicators(): HealthIndicator[] {
  return [
    { name: "יחס שוטף", value: "2.14", status: "green", description: "יחס מעל 1.5 - מצב נזילות טוב" },
    { name: "יחס מהיר", value: "1.62", status: "green", description: "נזילות גבוהה ללא מלאי" },
    { name: "חוב להון", value: "0.63", status: "green", description: "רמת מינוף סבירה" },
    { name: "ימי גביה ממוצע", value: "38", status: "yellow", description: "מומלץ לקצר ל-30 יום" },
    { name: "ימי ספקים ממוצע", value: "42", status: "green", description: "תנאי תשלום סבירים" },
    { name: "שולי רווח גולמי", value: "34%", status: "green", description: "מרווח יציב" },
    { name: "שולי רווח תפעולי", value: "12%", status: "yellow", description: "מומלץ לשפר יעילות" },
    { name: "כיסוי ריבית", value: "4.8x", status: "green", description: "יכולת שירות חוב טובה" },
    { name: "תזרים חופשי", value: "חיובי", status: "green", description: "תזרים חיובי 3 חודשים ברצף" },
    { name: "חשיפת לקוח", value: "22%", status: "red", description: "תלות גבוהה בלקוח אחד, מעל 20%" },
  ];
}

function generateRevenueExpenseTrend() {
  const months = ["אוק", "נוב", "דצמ", "ינו", "פבר", "מרץ"];
  return months.map((m, i) => ({
    month: m,
    revenue: 1_500_000 + Math.floor(Math.random() * 400000),
    expenses: 1_200_000 + Math.floor(Math.random() * 300000),
  }));
}

const LIQUIDITY_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899"];

/* ── Component ─────────────────────────────────────────── */
export default function CompanyFinancialsPage() {
  const [activeTab, setActiveTab] = useState("overview");

  const { data: summaryRaw } = useQuery({
    queryKey: ["company-financials"],
    queryFn: async () => {
      try {
        const res = await authFetch(`${API}/company-financials`);
        if (!res.ok) throw new Error();
        return await res.json();
      } catch {
        return null;
      }
    },
  });

  const { data: receivablesRaw } = useQuery({
    queryKey: ["receivables"],
    queryFn: async () => {
      try {
        const res = await authFetch(`${API}/receivables`);
        if (!res.ok) throw new Error();
        return await res.json();
      } catch {
        return null;
      }
    },
  });

  const { data: payablesRaw } = useQuery({
    queryKey: ["payables"],
    queryFn: async () => {
      try {
        const res = await authFetch(`${API}/payables`);
        if (!res.ok) throw new Error();
        return await res.json();
      } catch {
        return null;
      }
    },
  });

  const summary: FinancialSummary = useMemo(() => summaryRaw ?? generateSummary(), [summaryRaw]);
  const receivables: Receivable[] = useMemo(() => receivablesRaw ?? generateReceivables(), [receivablesRaw]);
  const payables: Payable[] = useMemo(() => payablesRaw ?? generatePayables(), [payablesRaw]);
  const cashFlow = useMemo(() => generateCashFlow(), []);
  const healthIndicators = useMemo(() => generateHealthIndicators(), []);
  const revExpTrend = useMemo(() => generateRevenueExpenseTrend(), []);

  const totalReceivables = receivables.reduce((s, r) => s + r.amount, 0);
  const overdueReceivables = receivables.filter((r) => r.daysOverdue > 0);
  const totalOverdue = overdueReceivables.reduce((s, r) => s + r.amount, 0);
  const totalPayables = payables.reduce((s, p) => s + p.amount, 0);

  const liquidityData = [
    { name: "מזומן", value: 3_280_000 },
    { name: "פיקדונות", value: 1_500_000 },
    { name: "ני\"ע סחירים", value: 800_000 },
    { name: "אשראי זמין", value: 2_000_000 },
    { name: "חובות לגביה", value: totalReceivables },
  ];

  return (
    <div className="min-h-screen bg-background p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">מצב פיננסי בזמן אמת</h1>
        <p className="text-muted-foreground mt-1">נכסים, התחייבויות, נזילות ותזרים מזומנים</p>
      </div>

      {/* Big Number KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="border-t-4 border-t-blue-500">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <Building2 className="h-5 w-5 text-blue-500" />
              <span className="text-sm text-muted-foreground">סה"כ נכסים</span>
            </div>
            <p className="text-2xl font-bold">{fmtK(summary.totalAssets)}</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-red-500">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <CreditCard className="h-5 w-5 text-red-500" />
              <span className="text-sm text-muted-foreground">סה"כ התחייבויות</span>
            </div>
            <p className="text-2xl font-bold">{fmtK(summary.totalLiabilities)}</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-green-500">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <Landmark className="h-5 w-5 text-green-500" />
              <span className="text-sm text-muted-foreground">הון עצמי</span>
            </div>
            <p className="text-2xl font-bold text-green-500">{fmtK(summary.netWorth)}</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-purple-500">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <Activity className="h-5 w-5 text-purple-500" />
              <span className="text-sm text-muted-foreground">יחס שוטף</span>
            </div>
            <p className="text-2xl font-bold">{summary.currentRatio.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-amber-500">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <Wallet className="h-5 w-5 text-amber-500" />
              <span className="text-sm text-muted-foreground">מזומן</span>
            </div>
            <p className="text-2xl font-bold">{fmtK(summary.cashPosition)}</p>
            <span className={`text-xs flex items-center gap-1 mt-1 ${summary.cashChange >= 0 ? "text-green-500" : "text-red-500"}`}>
              {summary.cashChange >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {summary.cashChange > 0 ? "+" : ""}{summary.cashChange}%
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview">סקירה כללית</TabsTrigger>
          <TabsTrigger value="receivables">חייבים (מי חייב לנו)</TabsTrigger>
          <TabsTrigger value="payables">זכאים (למי אנחנו חייבים)</TabsTrigger>
          <TabsTrigger value="cashflow">תחזית תזרים</TabsTrigger>
          <TabsTrigger value="health">בריאות פיננסית</TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ───────────────────────────── */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue vs Expenses Trend */}
            <Card>
              <CardHeader>
                <CardTitle>הכנסות מול הוצאות (6 חודשים)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revExpTrend}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(v) => fmtK(v)} />
                      <Tooltip formatter={(v: number) => fmt(v)} />
                      <Legend />
                      <Bar dataKey="revenue" fill="#22c55e" name="הכנסות" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="expenses" fill="#ef4444" name="הוצאות" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Liquidity Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>פירוט נזילות</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={liquidityData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {liquidityData.map((_, i) => (
                          <Cell key={i} fill={LIQUIDITY_COLORS[i % LIQUIDITY_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmt(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-green-500/5 border-green-500/20">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">הכנסות החודש</p>
                    <p className="text-2xl font-bold">{fmtK(summary.revenueThisMonth)}</p>
                  </div>
                  <Badge className="bg-green-500 text-foreground">
                    <TrendingUp className="h-3 w-3 ml-1" />+{summary.revenueChange}%
                  </Badge>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-red-500/5 border-red-500/20">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">הוצאות החודש</p>
                    <p className="text-2xl font-bold">{fmtK(summary.expensesThisMonth)}</p>
                  </div>
                  <Badge className="bg-green-500 text-foreground">
                    <TrendingDown className="h-3 w-3 ml-1" />{summary.expensesChange}%
                  </Badge>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-blue-500/5 border-blue-500/20">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">רווח תפעולי</p>
                    <p className="text-2xl font-bold text-green-500">
                      {fmtK(summary.revenueThisMonth - summary.expensesThisMonth)}
                    </p>
                  </div>
                  <Banknote className="h-8 w-8 text-blue-500 opacity-50" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Receivables Tab ────────────────────────── */}
        <TabsContent value="receivables" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="p-3 rounded-xl bg-blue-500/10"><Receipt className="h-6 w-6 text-blue-500" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">סה"כ חייבים</p>
                  <p className="text-2xl font-bold">{fmt(totalReceivables)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="p-3 rounded-xl bg-red-500/10"><AlertCircle className="h-6 w-6 text-red-500" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">חובות באיחור</p>
                  <p className="text-2xl font-bold text-red-500">{fmt(totalOverdue)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="p-3 rounded-xl bg-amber-500/10"><Clock className="h-6 w-6 text-amber-500" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">לקוחות באיחור</p>
                  <p className="text-2xl font-bold text-amber-500">{overdueReceivables.length}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> מי חייב לנו</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">לקוח</TableHead>
                    <TableHead className="text-right">מס' חשבונית</TableHead>
                    <TableHead className="text-center">סכום</TableHead>
                    <TableHead className="text-center">תאריך פירעון</TableHead>
                    <TableHead className="text-center">ימי איחור</TableHead>
                    <TableHead className="text-center">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receivables.sort((a, b) => b.daysOverdue - a.daysOverdue).map((r) => (
                    <TableRow key={r.id} className={r.daysOverdue > 30 ? "bg-red-500/5" : ""}>
                      <TableCell className="font-medium">{r.customer}</TableCell>
                      <TableCell className="font-mono text-sm">{r.invoiceNumber}</TableCell>
                      <TableCell className="text-center font-mono font-bold">{fmt(r.amount)}</TableCell>
                      <TableCell className="text-center font-mono">{r.dueDate}</TableCell>
                      <TableCell className="text-center">
                        {r.daysOverdue > 0 ? (
                          <span className={`font-bold ${r.daysOverdue > 30 ? "text-red-500" : r.daysOverdue > 14 ? "text-amber-500" : "text-yellow-600"}`}>
                            {r.daysOverdue} ימים
                          </span>
                        ) : (
                          <span className="text-green-500">בזמן</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {r.daysOverdue > 30 ? (
                          <Badge variant="destructive">חריג</Badge>
                        ) : r.daysOverdue > 0 ? (
                          <Badge variant="secondary">באיחור</Badge>
                        ) : (
                          <Badge variant="outline">תקין</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Payables Tab ───────────────────────────── */}
        <TabsContent value="payables" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="p-3 rounded-xl bg-purple-500/10"><CreditCard className="h-6 w-6 text-purple-500" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">סה"כ זכאים</p>
                  <p className="text-2xl font-bold">{fmt(totalPayables)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="p-3 rounded-xl bg-amber-500/10"><Clock className="h-6 w-6 text-amber-500" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">תשלומים ב-7 ימים הקרובים</p>
                  <p className="text-2xl font-bold text-amber-500">
                    {fmt(payables.filter((p) => p.daysUntilDue <= 7).reduce((s, p) => s + p.amount, 0))}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" /> למי אנחנו חייבים</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">ספק</TableHead>
                    <TableHead className="text-right">מס' חשבונית</TableHead>
                    <TableHead className="text-center">סכום</TableHead>
                    <TableHead className="text-center">תאריך פירעון</TableHead>
                    <TableHead className="text-center">ימים לתשלום</TableHead>
                    <TableHead className="text-center">דחיפות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payables.sort((a, b) => a.daysUntilDue - b.daysUntilDue).map((p) => (
                    <TableRow key={p.id} className={p.daysUntilDue <= 3 ? "bg-amber-500/5" : ""}>
                      <TableCell className="font-medium">{p.supplier}</TableCell>
                      <TableCell className="font-mono text-sm">{p.invoiceNumber}</TableCell>
                      <TableCell className="text-center font-mono font-bold">{fmt(p.amount)}</TableCell>
                      <TableCell className="text-center font-mono">{p.dueDate}</TableCell>
                      <TableCell className="text-center">
                        <span className={`font-bold ${p.daysUntilDue <= 3 ? "text-red-500" : p.daysUntilDue <= 7 ? "text-amber-500" : "text-green-500"}`}>
                          {p.daysUntilDue} ימים
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {p.daysUntilDue <= 3 ? (
                          <Badge variant="destructive">דחוף</Badge>
                        ) : p.daysUntilDue <= 7 ? (
                          <Badge variant="secondary">קרוב</Badge>
                        ) : (
                          <Badge variant="outline">רגיל</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Cash Flow Tab ──────────────────────────── */}
        <TabsContent value="cashflow" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>תחזית תזרים מזומנים (12 שבועות)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cashFlow}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis dataKey="week" />
                    <YAxis tickFormatter={(v) => fmtK(v)} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Legend />
                    <Area type="monotone" dataKey="balance" fill="#3b82f6" stroke="#3b82f6" fillOpacity={0.1} name="יתרה" strokeWidth={2} />
                    <Area type="monotone" dataKey="inflow" fill="#22c55e" stroke="#22c55e" fillOpacity={0.15} name="כניסות" />
                    <Area type="monotone" dataKey="outflow" fill="#ef4444" stroke="#ef4444" fillOpacity={0.15} name="יציאות" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">שבוע</TableHead>
                    <TableHead className="text-center">כניסות</TableHead>
                    <TableHead className="text-center">יציאות</TableHead>
                    <TableHead className="text-center">נטו</TableHead>
                    <TableHead className="text-center">יתרה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cashFlow.map((w) => (
                    <TableRow key={w.week}>
                      <TableCell className="font-medium">{w.week}</TableCell>
                      <TableCell className="text-center font-mono text-green-500">{fmtK(w.inflow)}</TableCell>
                      <TableCell className="text-center font-mono text-red-500">{fmtK(w.outflow)}</TableCell>
                      <TableCell className="text-center">
                        <span className={`font-mono font-bold ${w.net >= 0 ? "text-green-500" : "text-red-500"}`}>
                          {w.net >= 0 ? "+" : ""}{fmtK(w.net)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center font-mono font-bold">{fmtK(w.balance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Health Indicators Tab ──────────────────── */}
        <TabsContent value="health" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {healthIndicators.map((ind) => (
              <Card key={ind.name} className={`border ${trafficLightBg[ind.status]}`}>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className={`w-4 h-4 rounded-full ${trafficLight[ind.status]} animate-pulse`} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{ind.name}</span>
                      <span className="font-mono font-bold text-lg">{ind.value}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{ind.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-2 border-primary/20">
            <CardContent className="p-6">
              <h3 className="font-bold text-lg mb-4">סיכום בריאות פיננסית</h3>
              <div className="grid grid-cols-3 gap-6 text-center">
                <div>
                  <div className="w-20 h-20 mx-auto rounded-full bg-green-500/10 flex items-center justify-center mb-2">
                    <CheckCircle2 className="h-10 w-10 text-green-500" />
                  </div>
                  <p className="font-bold text-2xl text-green-500">{healthIndicators.filter((h) => h.status === "green").length}</p>
                  <p className="text-sm text-muted-foreground">תקין</p>
                </div>
                <div>
                  <div className="w-20 h-20 mx-auto rounded-full bg-yellow-500/10 flex items-center justify-center mb-2">
                    <AlertCircle className="h-10 w-10 text-yellow-500" />
                  </div>
                  <p className="font-bold text-2xl text-yellow-500">{healthIndicators.filter((h) => h.status === "yellow").length}</p>
                  <p className="text-sm text-muted-foreground">דורש תשומת לב</p>
                </div>
                <div>
                  <div className="w-20 h-20 mx-auto rounded-full bg-red-500/10 flex items-center justify-center mb-2">
                    <AlertCircle className="h-10 w-10 text-red-500" />
                  </div>
                  <p className="font-bold text-2xl text-red-500">{healthIndicators.filter((h) => h.status === "red").length}</p>
                  <p className="text-sm text-muted-foreground">קריטי</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
