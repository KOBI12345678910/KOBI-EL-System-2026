import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Download, Printer, TrendingUp, TrendingDown, DollarSign,
  Calculator, Building2, BarChart3, PieChart, Target, Landmark
} from "lucide-react";

const FALLBACK_KPIS = [
  { title: "הכנסות שנתיות", value: "₪18,450,000", icon: TrendingUp, color: "text-green-400", bg: "bg-green-500/10", change: "+12.3%", changeUp: true },
  { title: "הוצאות שנתיות", value: "₪14,280,000", icon: TrendingDown, color: "text-red-400", bg: "bg-red-500/10", change: "+8.1%", changeUp: false },
  { title: "רווח נקי", value: "₪4,170,000", icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/10", change: "+22.6%", changeUp: true },
  { title: "הפרשה למס", value: "₪962,100", icon: Calculator, color: "text-orange-400", bg: "bg-orange-500/10", change: "23%", changeUp: false },
];

const FALLBACK_PL_SUMMARY = [
  { category: "הכנסות ממכירות", q1: 4120000, q2: 4580000, q3: 4950000, q4: 4800000, total: 18450000, pct: 100 },
  { category: "עלות המכר", q1: -2460000, q2: -2710000, q3: -2980000, q4: -2850000, total: -11000000, pct: -59.6 },
  { category: "רווח גולמי", q1: 1660000, q2: 1870000, q3: 1970000, q4: 1950000, total: 7450000, pct: 40.4 },
  { category: "הוצאות הנהלה וכלליות", q1: -320000, q2: -340000, q3: -355000, q4: -365000, total: -1380000, pct: -7.5 },
  { category: "הוצאות מכירה ושיווק", q1: -210000, q2: -235000, q3: -245000, q4: -260000, total: -950000, pct: -5.1 },
  { category: "הוצאות מימון", q1: -95000, q2: -98000, q3: -102000, q4: -105000, total: -400000, pct: -2.2 },
  { category: "הוצאות פחת", q1: -130000, q2: -132000, q3: -135000, q4: -153000, total: -550000, pct: -3.0 },
  { category: "רווח תפעולי", q1: 905000, q2: 1065000, q3: 1133000, q4: 1067000, total: 4170000, pct: 22.6 },
  { category: "הפרשה למס (23%)", q1: -208150, q2: -244950, q3: -260590, q4: -248410, total: -962100, pct: -5.2 },
  { category: "רווח נקי", q1: 696850, q2: 820050, q3: 872410, q4: 818590, total: 3207900, pct: 17.4 },
];

const FALLBACK_QUARTERLY_BREAKDOWN = [
  { quarter: "Q1 2026", revenue: 4120000, cogs: 2460000, grossMargin: "40.3%", opex: 755000, ebitda: 1035000, netIncome: 696850 },
  { quarter: "Q2 2026", revenue: 4580000, cogs: 2710000, grossMargin: "40.8%", opex: 805000, ebitda: 1197000, netIncome: 820050 },
  { quarter: "Q3 2026", revenue: 4950000, cogs: 2980000, grossMargin: "39.8%", opex: 837000, ebitda: 1268000, netIncome: 872410 },
  { quarter: "Q4 2026", revenue: 4800000, cogs: 2850000, grossMargin: "40.6%", opex: 883000, ebitda: 1220000, netIncome: 818590 },
];

const FALLBACK_DEPARTMENT_EXPENSES = [
  { dept: "ייצור", budget: 8200000, actual: 8050000, variance: 150000, pct: 56.4 },
  { dept: "הנהלה וכלליות", budget: 1450000, actual: 1380000, variance: 70000, pct: 9.7 },
  { dept: "מכירות ושיווק", budget: 1000000, actual: 950000, variance: 50000, pct: 6.7 },
  { dept: "מחקר ופיתוח", budget: 620000, actual: 645000, variance: -25000, pct: 4.5 },
  { dept: "לוגיסטיקה ושינוע", budget: 780000, actual: 810000, variance: -30000, pct: 5.7 },
  { dept: "בקרת איכות", budget: 420000, actual: 395000, variance: 25000, pct: 2.8 },
  { dept: "תחזוקה", budget: 550000, actual: 580000, variance: -30000, pct: 4.1 },
  { dept: "משאבי אנוש", budget: 380000, actual: 365000, variance: 15000, pct: 2.6 },
  { dept: "מימון", budget: 410000, actual: 400000, variance: 10000, pct: 2.8 },
  { dept: "IT", budget: 350000, actual: 340000, variance: 10000, pct: 2.4 },
];

const FALLBACK_TAX_COMPUTATION = [
  { item: "רווח לפני מס", amount: 4170000 },
  { item: "הוצאות לא מוכרות", amount: 125000 },
  { item: "הכנסות פטורות", amount: -82000 },
  { item: "הפרשי עיתוי", amount: -45000 },
  { item: "הכנסה חייבת", amount: 4168000 },
  { item: "שיעור מס חברות (23%)", amount: 958640 },
  { item: "זיכויי מס", amount: -32000 },
  { item: "מקדמות ששולמו", amount: -680000 },
  { item: "יתרה לתשלום", amount: 246640 },
];

const fmt = (n: number) => {
  const abs = Math.abs(n);
  const str = "₪" + abs.toLocaleString("he-IL");
  return n < 0 ? `(${str})` : str;
};

export default function ReportFiscalPage() {
  const { data: reportfiscalData } = useQuery({
    queryKey: ["report-fiscal"],
    queryFn: () => authFetch("/api/reports/report_fiscal"),
    staleTime: 5 * 60 * 1000,
  });

  const kpis = reportfiscalData ?? FALLBACK_KPIS;
  const departmentExpenses = FALLBACK_DEPARTMENT_EXPENSES;
  const plSummary = FALLBACK_PL_SUMMARY;
  const quarterlyBreakdown = FALLBACK_QUARTERLY_BREAKDOWN;
  const taxComputation = FALLBACK_TAX_COMPUTATION;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">דוח שנת מס פיסקלית</h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי | שנת המס 2026 - ינואר עד דצמבר</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Printer className="w-4 h-4 ml-1" />הדפסה</Button>
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />יצוא PDF</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <Card key={i} className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={`p-2 rounded-lg ${kpi.bg}`}>
                  <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                </div>
                <span className={`text-xs font-medium ${kpi.changeUp ? "text-green-400" : "text-red-400"}`}>{kpi.change}</span>
              </div>
              <div className="text-xl font-bold text-foreground">{kpi.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{kpi.title}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pl" className="space-y-4">
        <TabsList className="bg-card/50 border border-border/50">
          <TabsTrigger value="pl">דוח רווח והפסד</TabsTrigger>
          <TabsTrigger value="quarterly">פירוט רבעוני</TabsTrigger>
          <TabsTrigger value="departments">הוצאות מחלקתיות</TabsTrigger>
          <TabsTrigger value="tax">חישוב מס</TabsTrigger>
        </TabsList>

        {/* P&L Summary */}
        <TabsContent value="pl">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-400" />
                  דוח רווח והפסד - שנת 2026
                </CardTitle>
                <Badge className="bg-green-500/20 text-green-300">רווח נקי: 17.4%</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">סעיף</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">Q1</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">Q2</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">Q3</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">Q4</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סה״כ שנתי</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plSummary.map((row, i) => {
                      const isHeader = ["רווח גולמי", "רווח תפעולי", "רווח נקי"].includes(row.category);
                      return (
                        <tr key={i} className={`border-b border-border/30 hover:bg-card/30 transition-colors ${isHeader ? "bg-card/20 font-bold" : ""}`}>
                          <td className={`p-3 ${isHeader ? "text-foreground font-bold" : "text-foreground"}`}>{row.category}</td>
                          <td className={`p-3 ${row.q1 < 0 ? "text-red-400" : "text-foreground"}`}>{fmt(row.q1)}</td>
                          <td className={`p-3 ${row.q2 < 0 ? "text-red-400" : "text-foreground"}`}>{fmt(row.q2)}</td>
                          <td className={`p-3 ${row.q3 < 0 ? "text-red-400" : "text-foreground"}`}>{fmt(row.q3)}</td>
                          <td className={`p-3 ${row.q4 < 0 ? "text-red-400" : "text-foreground"}`}>{fmt(row.q4)}</td>
                          <td className={`p-3 font-bold ${row.total < 0 ? "text-red-400" : "text-foreground"}`}>{fmt(row.total)}</td>
                          <td className={`p-3 ${row.pct < 0 ? "text-red-400" : "text-green-400"}`}>{row.pct}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Quarterly Breakdown */}
        <TabsContent value="quarterly">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="w-4 h-4 text-purple-400" />
                פירוט רבעוני - 2026
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {quarterlyBreakdown.map((q, i) => (
                  <Card key={i} className="bg-background/30 border-border/30">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-bold text-foreground">{q.quarter}</span>
                        <Badge className="bg-blue-500/20 text-blue-300">מרווח גולמי: {q.grossMargin}</Badge>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">הכנסות</span><span className="font-medium text-green-400">{fmt(q.revenue)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">עלות המכר</span><span className="font-medium text-red-400">{fmt(-q.cogs)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">הוצאות תפעוליות</span><span className="font-medium text-orange-400">{fmt(-q.opex)}</span></div>
                        <div className="border-t border-border/30 pt-2 flex justify-between"><span className="text-muted-foreground">EBITDA</span><span className="font-bold text-blue-400">{fmt(q.ebitda)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">רווח נקי</span><span className="font-bold text-emerald-400">{fmt(q.netIncome)}</span></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Quarterly Trend */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-foreground">מגמת הכנסות רבעונית</h4>
                {quarterlyBreakdown.map((q, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground w-20 shrink-0">{q.quarter}</span>
                    <div className="flex-1">
                      <Progress value={(q.revenue / 5200000) * 100} className="h-4" />
                    </div>
                    <span className="text-sm font-medium text-foreground w-28 text-left">{fmt(q.revenue)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Department Expenses */}
        <TabsContent value="departments">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-400" />
                הוצאות לפי מחלקה - 2026
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מחלקה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תקציב</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">בפועל</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סטייה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">% מסה״כ</th>
                      <th className="text-right p-3 text-muted-foreground font-medium w-40">ניצול</th>
                    </tr>
                  </thead>
                  <tbody>
                    {departmentExpenses.map((dept, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3 font-medium text-foreground">{dept.dept}</td>
                        <td className="p-3 text-foreground">{fmt(dept.budget)}</td>
                        <td className="p-3 text-foreground">{fmt(dept.actual)}</td>
                        <td className={`p-3 font-medium ${dept.variance >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {dept.variance >= 0 ? "+" : ""}{fmt(dept.variance)}
                        </td>
                        <td className="p-3 text-muted-foreground">{dept.pct}%</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Progress value={(dept.actual / dept.budget) * 100} className="h-2 flex-1" />
                            <span className="text-xs text-muted-foreground w-10">{Math.round((dept.actual / dept.budget) * 100)}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border/50 bg-card/30">
                      <td className="p-3 font-bold text-foreground">סה״כ</td>
                      <td className="p-3 font-bold text-foreground">{fmt(departmentExpenses.reduce((s, d) => s + d.budget, 0))}</td>
                      <td className="p-3 font-bold text-foreground">{fmt(departmentExpenses.reduce((s, d) => s + d.actual, 0))}</td>
                      <td className="p-3 font-bold text-green-400">{fmt(departmentExpenses.reduce((s, d) => s + d.variance, 0))}</td>
                      <td className="p-3 font-bold text-muted-foreground">100%</td>
                      <td className="p-3"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tax Computation */}
        <TabsContent value="tax">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Landmark className="w-4 h-4 text-orange-400" />
                חישוב מס שנתי - 2026
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">סעיף</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סכום</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxComputation.map((row, i) => {
                      const isTotal = row.item === "יתרה לתשלום" || row.item === "הכנסה חייבת";
                      return (
                        <tr key={i} className={`border-b border-border/30 hover:bg-card/30 transition-colors ${isTotal ? "bg-card/20" : ""}`}>
                          <td className={`p-3 ${isTotal ? "font-bold" : ""} text-foreground`}>{row.item}</td>
                          <td className={`p-3 ${isTotal ? "font-bold" : ""} ${row.amount < 0 ? "text-red-400" : "text-foreground"}`}>{fmt(row.amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Tax Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <Card className="bg-background/30 border-border/30">
                  <CardContent className="p-4 text-center">
                    <Calculator className="w-6 h-6 text-orange-400 mx-auto mb-2" />
                    <div className="text-lg font-bold text-foreground">23%</div>
                    <div className="text-xs text-muted-foreground">שיעור מס חברות</div>
                  </CardContent>
                </Card>
                <Card className="bg-background/30 border-border/30">
                  <CardContent className="p-4 text-center">
                    <DollarSign className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                    <div className="text-lg font-bold text-foreground">₪680,000</div>
                    <div className="text-xs text-muted-foreground">מקדמות ששולמו</div>
                  </CardContent>
                </Card>
                <Card className="bg-background/30 border-border/30">
                  <CardContent className="p-4 text-center">
                    <Landmark className="w-6 h-6 text-red-400 mx-auto mb-2" />
                    <div className="text-lg font-bold text-red-400">₪246,640</div>
                    <div className="text-xs text-muted-foreground">יתרה לתשלום</div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
