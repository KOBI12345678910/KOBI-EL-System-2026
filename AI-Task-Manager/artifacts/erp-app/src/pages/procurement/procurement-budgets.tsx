import { useState } from "react";
import {
  Wallet, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  ShieldAlert, BarChart3, Calendar, Layers, ArrowUpRight, ArrowDownRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";

const fmt = (v: number) => new Intl.NumberFormat("he-IL").format(v);
const fmtCur = (v: number) => "\u20AA" + new Intl.NumberFormat("he-IL").format(v);

type BudgetStatus = "on_track" | "at_risk" | "over_budget";

const statusConfig: Record<BudgetStatus, { label: string; bg: string; text: string; border: string }> = {
  on_track: { label: "במסלול", bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/30" },
  at_risk: { label: "בסיכון", bg: "bg-yellow-500/20", text: "text-yellow-400", border: "border-yellow-500/30" },
  over_budget: { label: "חריגה", bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/30" },
};

const budgetCategories = [
  { category: "חומרי גלם", key: "raw_materials", annual: 4_200_000, q1: 1_050_000, q2: 1_100_000, q3: 1_000_000, q4: 1_050_000, spent: 2_280_000, status: "on_track" as BudgetStatus },
  { category: "ייצור", key: "production", annual: 2_800_000, q1: 700_000, q2: 750_000, q3: 680_000, q4: 670_000, spent: 1_620_000, status: "at_risk" as BudgetStatus },
  { category: "שירותים", key: "services", annual: 1_500_000, q1: 375_000, q2: 380_000, q3: 370_000, q4: 375_000, spent: 810_000, status: "on_track" as BudgetStatus },
  { category: "יבוא", key: "import", annual: 1_850_000, q1: 460_000, q2: 480_000, q3: 450_000, q4: 460_000, spent: 1_120_000, status: "over_budget" as BudgetStatus },
  { category: "תחזוקה", key: "maintenance", annual: 960_000, q1: 240_000, q2: 245_000, q3: 235_000, q4: 240_000, spent: 498_000, status: "on_track" as BudgetStatus },
  { category: "אביזרים", key: "accessories", annual: 680_000, q1: 170_000, q2: 175_000, q3: 165_000, q4: 170_000, spent: 392_000, status: "at_risk" as BudgetStatus },
  { category: "לוגיסטיקה", key: "logistics", annual: 720_000, q1: 180_000, q2: 185_000, q3: 175_000, q4: 180_000, spent: 378_000, status: "on_track" as BudgetStatus },
  { category: "ציוד בטיחות", key: "safety", annual: 340_000, q1: 85_000, q2: 88_000, q3: 82_000, q4: 85_000, spent: 195_000, status: "over_budget" as BudgetStatus },
];

const totalAnnual = budgetCategories.reduce((s, c) => s + c.annual, 0);
const totalSpent = budgetCategories.reduce((s, c) => s + c.spent, 0);
const totalRemaining = totalAnnual - totalSpent;
const utilization = Math.round((totalSpent / totalAnnual) * 100);
const overBudgetItems = budgetCategories.filter(c => c.status === "over_budget").length;
const underBudgetCats = budgetCategories.filter(c => {
  const expectedPct = 50;
  const actualPct = (c.spent / c.annual) * 100;
  return actualPct < expectedPct - 10;
}).length;

const monthlyBreakdown = [
  { month: "ינואר 2026", budget: 1_004_000, actual: 985_200, variance: -1.9 },
  { month: "פברואר 2026", budget: 1_004_000, actual: 1_042_500, variance: 3.8 },
  { month: "מרץ 2026", budget: 1_004_000, actual: 1_018_700, variance: 1.5 },
  { month: "אפריל 2026", budget: 1_038_000, actual: 1_095_300, variance: 5.5 },
  { month: "מאי 2026", budget: 1_038_000, actual: 1_012_400, variance: -2.5 },
  { month: "יוני 2026", budget: 1_038_000, actual: 1_138_900, variance: 9.7 },
];

const projectBudgets = [
  { project: "קו ייצור חדש - אלומיניום", budget: 850_000, spent: 612_000, completion: 68, owner: "אבי כהן" },
  { project: "שדרוג מערכת הצביעה", budget: 420_000, spent: 395_000, completion: 88, owner: "דנה לוי" },
  { project: "מחסן אוטומטי - שלב ב'", budget: 1_200_000, spent: 780_000, completion: 55, owner: "יוסי מזרחי" },
  { project: "ציוד בדיקות איכות", budget: 310_000, spent: 298_000, completion: 92, owner: "מירב שרון" },
  { project: "התייעלות אנרגטית", budget: 560_000, spent: 245_000, completion: 40, owner: "רון ברק" },
  { project: "מערכת בטיחות חדשה", budget: 380_000, spent: 410_000, completion: 100, owner: "נועם גל" },
];

const overBudgetAlerts = [
  { category: "יבוא", item: "משלוח אלומיניום מסין", budgeted: 480_000, actual: 562_000, overage: 82_000, impact: "עיכוב תזרים Q3", severity: "high" as const, date: "2026-03-28" },
  { category: "ציוד בטיחות", item: "מערכת כיבוי אש חדשה", budgeted: 85_000, actual: 118_000, overage: 33_000, impact: "חריגה מתקציב שנתי", severity: "high" as const, date: "2026-04-02" },
  { category: "ייצור", item: "חלפים למכונת CNC", budgeted: 45_000, actual: 58_200, overage: 13_200, impact: "חריגה רבעונית", severity: "medium" as const, date: "2026-03-15" },
  { category: "אביזרים", item: "ברגים מיוחדים - הזמנת חירום", budgeted: 12_000, actual: 19_500, overage: 7_500, impact: "חיוב נוסף לא מתוכנן", severity: "low" as const, date: "2026-04-05" },
  { category: "יבוא", item: "עמלות מכס ומיסים", budgeted: 120_000, actual: 148_300, overage: 28_300, impact: "עלות נלווית לא צפויה", severity: "medium" as const, date: "2026-02-20" },
  { category: "ייצור", item: "שמני סיכה תעשייתיים", budgeted: 28_000, actual: 34_600, overage: 6_600, impact: "עליית מחירי סחורות", severity: "low" as const, date: "2026-03-10" },
];

const severityConfig = {
  high: { label: "גבוהה", bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/30" },
  medium: { label: "בינונית", bg: "bg-yellow-500/20", text: "text-yellow-400", border: "border-yellow-500/30" },
  low: { label: "נמוכה", bg: "bg-blue-500/20", text: "text-blue-400", border: "border-blue-500/30" },
};

const kpis = [
  { label: "תקציב שנתי", value: fmtCur(totalAnnual), icon: Wallet, color: "from-blue-600 to-blue-800" },
  { label: "הוצאות מצטבר YTD", value: fmtCur(totalSpent), icon: BarChart3, color: "from-purple-600 to-purple-800" },
  { label: "יתרה", value: fmtCur(totalRemaining), icon: CheckCircle2, color: "from-emerald-600 to-emerald-800" },
  { label: "ניצול תקציב", value: `${utilization}%`, icon: TrendingUp, color: "from-cyan-600 to-cyan-800" },
  { label: "פריטים בחריגה", value: String(overBudgetItems), icon: AlertTriangle, color: "from-red-600 to-red-800" },
  { label: "קטגוריות מתחת לתקציב", value: String(underBudgetCats), icon: ShieldAlert, color: "from-amber-600 to-amber-800" },
];

export default function ProcurementBudgets() {
  const [activeTab, setActiveTab] = useState("annual");

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Wallet className="w-7 h-7 text-blue-400" />
        <h1 className="text-2xl font-bold text-foreground">תקציבי רכש</h1>
        <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-xs">טכנו-כל עוזי</Badge>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map((k, i) => (
          <div key={i} className={`rounded-xl bg-gradient-to-br ${k.color} p-4 border border-white/10`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-foreground/70">{k.label}</div>
                <div className="text-lg font-bold text-foreground mt-1">{k.value}</div>
              </div>
              <k.icon className="w-7 h-7 text-foreground/30" />
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/60">
          <TabsTrigger value="annual">תקציב שנתי</TabsTrigger>
          <TabsTrigger value="monthly">חודשי</TabsTrigger>
          <TabsTrigger value="projects">לפי פרויקט</TabsTrigger>
          <TabsTrigger value="overages">חריגות</TabsTrigger>
        </TabsList>

        {/* Tab 1: Annual Budget by Category */}
        <TabsContent value="annual">
          <Card className="border-border/50 bg-muted/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-400" />
                תקציב שנתי לפי קטגוריה — 2026
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="text-right font-semibold text-gray-300">קטגוריה</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">תקציב שנתי</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">Q1</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">Q2</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">Q3</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">Q4</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">הוצאות בפועל</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">יתרה</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">ניצול</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {budgetCategories.map((row, i) => {
                    const remaining = row.annual - row.spent;
                    const pct = Math.round((row.spent / row.annual) * 100);
                    const st = statusConfig[row.status];
                    return (
                      <TableRow key={i} className="hover:bg-muted/30">
                        <TableCell className="font-medium text-foreground">{row.category}</TableCell>
                        <TableCell className="text-gray-200 font-semibold">{fmtCur(row.annual)}</TableCell>
                        <TableCell className="text-gray-400 text-sm">{fmtCur(row.q1)}</TableCell>
                        <TableCell className="text-gray-400 text-sm">{fmtCur(row.q2)}</TableCell>
                        <TableCell className="text-gray-400 text-sm">{fmtCur(row.q3)}</TableCell>
                        <TableCell className="text-gray-400 text-sm">{fmtCur(row.q4)}</TableCell>
                        <TableCell className="text-gray-200">{fmtCur(row.spent)}</TableCell>
                        <TableCell className={remaining < 0 ? "text-red-400 font-semibold" : "text-emerald-400"}>{fmtCur(remaining)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={Math.min(pct, 100)} className="h-2 w-16" />
                            <span className={`text-xs ${pct > 90 ? "text-red-400" : pct > 75 ? "text-yellow-400" : "text-emerald-400"}`}>{pct}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs border ${st.bg} ${st.text} ${st.border}`}>{st.label}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {/* Totals Row */}
                  <TableRow className="bg-muted/40 font-bold">
                    <TableCell className="text-foreground">סה״כ</TableCell>
                    <TableCell className="text-foreground">{fmtCur(totalAnnual)}</TableCell>
                    <TableCell className="text-gray-300 text-sm">{fmtCur(budgetCategories.reduce((s, c) => s + c.q1, 0))}</TableCell>
                    <TableCell className="text-gray-300 text-sm">{fmtCur(budgetCategories.reduce((s, c) => s + c.q2, 0))}</TableCell>
                    <TableCell className="text-gray-300 text-sm">{fmtCur(budgetCategories.reduce((s, c) => s + c.q3, 0))}</TableCell>
                    <TableCell className="text-gray-300 text-sm">{fmtCur(budgetCategories.reduce((s, c) => s + c.q4, 0))}</TableCell>
                    <TableCell className="text-foreground">{fmtCur(totalSpent)}</TableCell>
                    <TableCell className="text-emerald-400">{fmtCur(totalRemaining)}</TableCell>
                    <TableCell>
                      <span className={`text-xs font-bold ${utilization > 90 ? "text-red-400" : "text-emerald-400"}`}>{utilization}%</span>
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Monthly Breakdown */}
        <TabsContent value="monthly">
          <Card className="border-border/50 bg-muted/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                פירוט חודשי — תקציב מול ביצוע
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="text-right font-semibold text-gray-300">חודש</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">תקציב</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">בפועל</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">הפרש</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">סטייה %</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">מגמה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyBreakdown.map((row, i) => {
                    const diff = row.actual - row.budget;
                    const isOver = diff > 0;
                    return (
                      <TableRow key={i} className="hover:bg-muted/30">
                        <TableCell className="font-medium text-foreground">{row.month}</TableCell>
                        <TableCell className="text-gray-300">{fmtCur(row.budget)}</TableCell>
                        <TableCell className="text-gray-200 font-semibold">{fmtCur(row.actual)}</TableCell>
                        <TableCell className={isOver ? "text-red-400" : "text-emerald-400"}>
                          {isOver ? "+" : ""}{fmtCur(diff)}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs border ${
                            isOver
                              ? "bg-red-500/20 text-red-400 border-red-500/30"
                              : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          }`}>
                            {row.variance > 0 ? "+" : ""}{row.variance}%
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {isOver
                              ? <ArrowUpRight className="w-4 h-4 text-red-400" />
                              : <ArrowDownRight className="w-4 h-4 text-emerald-400" />}
                            <span className={`text-xs ${isOver ? "text-red-400" : "text-emerald-400"}`}>
                              {isOver ? "חריגה" : "חיסכון"}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Cumulative Bar */}
              <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
                <div className="text-sm font-medium text-gray-300 mb-3">מגמת ניצול מצטבר</div>
                <div className="space-y-2">
                  {monthlyBreakdown.map((row, i) => {
                    const cumBudget = monthlyBreakdown.slice(0, i + 1).reduce((s, r) => s + r.budget, 0);
                    const cumActual = monthlyBreakdown.slice(0, i + 1).reduce((s, r) => s + r.actual, 0);
                    const pct = Math.round((cumActual / cumBudget) * 100);
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 w-24 text-right">{row.month.split(" ")[0]}</span>
                        <div className="flex-1 h-5 bg-muted/50 rounded-full overflow-hidden relative">
                          <div className="absolute inset-0 bg-blue-900/30 rounded-full" style={{ width: "100%" }} />
                          <div className={`h-full rounded-full transition-all ${pct > 100 ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${Math.min(pct, 110)}%` }} />
                        </div>
                        <span className={`text-xs w-12 ${pct > 100 ? "text-red-400" : "text-gray-300"}`}>{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: By Project */}
        <TabsContent value="projects">
          <Card className="border-border/50 bg-muted/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Layers className="w-5 h-5 text-purple-400" />
                תקציב לפי פרויקט
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="text-right font-semibold text-gray-300">פרויקט</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">אחראי</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">תקציב</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">הוצאות</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">יתרה</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">ניצול</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">התקדמות</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projectBudgets.map((row, i) => {
                    const remaining = row.budget - row.spent;
                    const budgetPct = Math.round((row.spent / row.budget) * 100);
                    const isOver = remaining < 0;
                    const status: BudgetStatus = isOver ? "over_budget" : budgetPct > 85 ? "at_risk" : "on_track";
                    const st = statusConfig[status];
                    return (
                      <TableRow key={i} className="hover:bg-muted/30">
                        <TableCell className="font-medium text-foreground">{row.project}</TableCell>
                        <TableCell className="text-gray-300">{row.owner}</TableCell>
                        <TableCell className="text-gray-200">{fmtCur(row.budget)}</TableCell>
                        <TableCell className="text-gray-200">{fmtCur(row.spent)}</TableCell>
                        <TableCell className={isOver ? "text-red-400 font-semibold" : "text-emerald-400"}>{fmtCur(remaining)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={Math.min(budgetPct, 100)} className="h-2 w-16" />
                            <span className={`text-xs ${budgetPct > 95 ? "text-red-400" : budgetPct > 80 ? "text-yellow-400" : "text-emerald-400"}`}>{budgetPct}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={row.completion} className="h-2 w-16" />
                            <span className="text-xs text-gray-400">{row.completion}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs border ${st.bg} ${st.text} ${st.border}`}>{st.label}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Over-Budget Alerts */}
        <TabsContent value="overages">
          <Card className="border-border/50 bg-muted/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                התראות חריגות תקציב
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="text-right font-semibold text-gray-300">קטגוריה</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">פריט</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">תוכנן</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">בפועל</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">חריגה</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">חומרה</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">השפעה</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">תאריך</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overBudgetAlerts.map((row, i) => {
                    const sv = severityConfig[row.severity];
                    const overPct = Math.round((row.overage / row.budgeted) * 100);
                    return (
                      <TableRow key={i} className="hover:bg-muted/30">
                        <TableCell className="font-medium text-foreground">{row.category}</TableCell>
                        <TableCell className="text-gray-200">{row.item}</TableCell>
                        <TableCell className="text-gray-300">{fmtCur(row.budgeted)}</TableCell>
                        <TableCell className="text-gray-200 font-semibold">{fmtCur(row.actual)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span className="text-red-400 font-semibold">{fmtCur(row.overage)}</span>
                            <span className="text-xs text-red-400/70">(+{overPct}%)</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs border ${sv.bg} ${sv.text} ${sv.border}`}>{sv.label}</Badge>
                        </TableCell>
                        <TableCell className="text-gray-400 text-sm max-w-[180px] truncate">{row.impact}</TableCell>
                        <TableCell className="text-gray-400 text-sm">{row.date}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Impact Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                  <div className="text-xs text-red-400/70 mb-1">סה״כ חריגות</div>
                  <div className="text-xl font-bold text-red-400">{fmtCur(overBudgetAlerts.reduce((s, a) => s + a.overage, 0))}</div>
                </div>
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
                  <div className="text-xs text-yellow-400/70 mb-1">חריגות גבוהות</div>
                  <div className="text-xl font-bold text-yellow-400">{overBudgetAlerts.filter(a => a.severity === "high").length} פריטים</div>
                </div>
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
                  <div className="text-xs text-blue-400/70 mb-1">חריגה ממוצעת</div>
                  <div className="text-xl font-bold text-blue-400">{fmtCur(Math.round(overBudgetAlerts.reduce((s, a) => s + a.overage, 0) / overBudgetAlerts.length))}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}