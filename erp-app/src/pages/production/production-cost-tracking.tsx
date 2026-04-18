import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  Lightbulb, BarChart3, Layers, BookOpen, Wrench, Package, Hammer,
  Users, Cpu, ArrowUpRight, ArrowDownRight, Target, Percent
} from "lucide-react";

const fmt = (v: number) => `${v < 0 ? "-" : ""}₪${Math.abs(v).toLocaleString("he-IL")}`;
const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

type JobStatus = "accurate" | "over" | "under";

interface Job {
  wo: string; product: string; estimatedCost: number;
  actualMaterial: number; actualLabor: number; actualMachine: number;
  actualSubcontractor: number; actualRework: number; totalActual: number;
  varianceNis: number; variancePct: number; status: JobStatus;
}

const FALLBACK_JOBS: Job[] = [
  { wo: "WO-2501", product: "שער חשמלי דגם Premium", estimatedCost: 18500, actualMaterial: 7200, actualLabor: 4800, actualMachine: 2100, actualSubcontractor: 1500, actualRework: 350, totalActual: 15950, varianceNis: -2550, variancePct: -13.8, status: "under" },
  { wo: "WO-2502", product: "פרגולה אלומיניום 4x5", estimatedCost: 24000, actualMaterial: 9800, actualLabor: 6200, actualMachine: 3500, actualSubcontractor: 2800, actualRework: 2100, totalActual: 24400, varianceNis: 400, variancePct: 1.7, status: "accurate" },
  { wo: "WO-2503", product: "מעקה נירוסטה 12 מטר", estimatedCost: 14200, actualMaterial: 6100, actualLabor: 3900, actualMachine: 1800, actualSubcontractor: 0, actualRework: 1800, totalActual: 13600, varianceNis: -600, variancePct: -4.2, status: "accurate" },
  { wo: "WO-2504", product: "דלת כניסה מפלדה", estimatedCost: 8900, actualMaterial: 3400, actualLabor: 2600, actualMachine: 1200, actualSubcontractor: 800, actualRework: 0, totalActual: 8000, varianceNis: -900, variancePct: -10.1, status: "under" },
  { wo: "WO-2505", product: "חלון אלומיניום כפול", estimatedCost: 6200, actualMaterial: 2800, actualLabor: 1900, actualMachine: 900, actualSubcontractor: 0, actualRework: 400, totalActual: 6000, varianceNis: -200, variancePct: -3.2, status: "accurate" },
  { wo: "WO-2506", product: "גדר מתכת דקורטיבית", estimatedCost: 11500, actualMaterial: 4800, actualLabor: 3200, actualMachine: 1600, actualSubcontractor: 1200, actualRework: 1950, totalActual: 12750, varianceNis: 1250, variancePct: 10.9, status: "over" },
  { wo: "WO-2507", product: "מדרגות ברזל ספירלה", estimatedCost: 32000, actualMaterial: 12500, actualLabor: 8400, actualMachine: 4200, actualSubcontractor: 3800, actualRework: 3600, totalActual: 32500, varianceNis: 500, variancePct: 1.6, status: "accurate" },
  { wo: "WO-2508", product: "תריס גלילה חשמלי", estimatedCost: 5400, actualMaterial: 2100, actualLabor: 1500, actualMachine: 700, actualSubcontractor: 600, actualRework: 0, totalActual: 4900, varianceNis: -500, variancePct: -9.3, status: "under" },
  { wo: "WO-2509", product: "פרופיל Pro-X 100mm", estimatedCost: 16800, actualMaterial: 7400, actualLabor: 4100, actualMachine: 2300, actualSubcontractor: 0, actualRework: 2800, totalActual: 16600, varianceNis: -200, variancePct: -1.2, status: "accurate" },
  { wo: "WO-2510", product: "קונסטרוקציה תעשייתית", estimatedCost: 45000, actualMaterial: 18200, actualLabor: 11500, actualMachine: 6800, actualSubcontractor: 5200, actualRework: 4100, totalActual: 45800, varianceNis: 800, variancePct: 1.8, status: "accurate" },
];

const FALLBACK_TREND_DATA = [
  { month: "נוב 2025", estimated: 168000, actual: 172000, variance: 2.4 },
  { month: "דצמ 2025", estimated: 155000, actual: 149000, variance: -3.9 },
  { month: "ינו 2026", estimated: 178000, actual: 183000, variance: 2.8 },
  { month: "פבר 2026", estimated: 162000, actual: 158000, variance: -2.5 },
  { month: "מרץ 2026", estimated: 185000, actual: 181000, variance: -2.2 },
  { month: "אפר 2026", estimated: 182500, actual: 180500, variance: -1.1 },
];

const FALLBACK_INSIGHTS = [
  { text: "ריתוך שערים עולה 8% יותר מהצפי — מומלץ לעדכן תמחור קטגוריית שערים", type: "warning" as const, impact: "₪1,200/חודש" },
  { text: "חומרי גלם מדויקים ב-96% — המודל לומד היטב", type: "success" as const, impact: "חיסכון ₪3,100" },
  { text: "עלות עיבוד חוזר בגדרות דקורטיביות חריגה — 15% מהעלות הכוללת", type: "error" as const, impact: "₪1,950 עודף" },
  { text: "עלות קבלני משנה ירדה ב-12% — הפנמת עבודות ריתוך משתלמת", type: "success" as const, impact: "חיסכון ₪2,400" },
  { text: "עלות מכונות בפרויקטי ספירלה גבוהה ב-6% — צריך כיול נוסף", type: "warning" as const, impact: "₪850/עבודה" },
  { text: "תמחור דלתות פלדה שמרני מדי — הרווח גבוה ב-10% מהצפי", type: "info" as const, impact: "עדכון מחירון" },
];

const statusConfig: Record<JobStatus, { label: string; cls: string }> = {
  accurate: { label: "מדויק (±5%)", cls: "bg-emerald-500/20 text-emerald-400" },
  over: { label: "חריגה", cls: "bg-red-500/20 text-red-400" },
  under: { label: "מתחת לצפי", cls: "bg-blue-500/20 text-blue-400" },
};

const insightIcon: Record<string, string> = {
  warning: "text-amber-400",
  success: "text-emerald-400",
  error: "text-red-400",
  info: "text-blue-400",
};

export default function ProductionCostTracking() {
  const [activeTab, setActiveTab] = useState("jobs");

  const { data: apiData } = useQuery({
    queryKey: ["production-cost-tracking"],
    queryFn: () => authFetch("/api/production/costing").then(r => r.json()),
  });
  const safeArr = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
  const jobs: Job[] = safeArr(apiData?.jobs).length > 0 ? safeArr(apiData.jobs) : FALLBACK_JOBS;
  const trendData = safeArr(apiData?.trendData).length > 0 ? safeArr(apiData.trendData) : FALLBACK_TREND_DATA;
  const insights = safeArr(apiData?.insights).length > 0 ? safeArr(apiData.insights) : FALLBACK_INSIGHTS;

  const totalThisMonth = jobs.reduce((s, j) => s + j.totalActual, 0);
  const avgCostPerJob = Math.round(totalThisMonth / jobs.length);
  const totalEstimated = jobs.reduce((s, j) => s + j.estimatedCost, 0);
  const overallVariancePct = ((totalThisMonth - totalEstimated) / totalEstimated * 100);
  const totalRework = jobs.reduce((s, j) => s + j.actualRework, 0);
  const totalWaste = 4850;
  const learningAccuracy = 94.2;
  const categoryBudgets = [
    { name: "חומרי גלם", icon: Package, actual: jobs.reduce((s, j) => s + j.actualMaterial, 0), budget: 78000, color: "bg-blue-500" },
    { name: "עבודה", icon: Users, actual: jobs.reduce((s, j) => s + j.actualLabor, 0), budget: 52000, color: "bg-cyan-500" },
    { name: "מכונות", icon: Cpu, actual: jobs.reduce((s, j) => s + j.actualMachine, 0), budget: 27000, color: "bg-purple-500" },
    { name: "קבלני משנה", icon: Wrench, actual: jobs.reduce((s, j) => s + j.actualSubcontractor, 0), budget: 18000, color: "bg-amber-500" },
    { name: "עיבוד חוזר", icon: Hammer, actual: totalRework, budget: 8000, color: "bg-red-500" },
  ];

  const maxTrend = Math.max(...trendData.flatMap((t: any) => [t.estimated, t.actual]));

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <DollarSign className="h-7 w-7 text-emerald-400" /> מעקב עלויות ייצור
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          טכנו-כל עוזי — עלות בפועל מול הערכה, משוב לתמחור
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "עלות ייצור החודש", value: fmt(totalThisMonth), color: "text-emerald-400", icon: DollarSign, trend: "+3.2%", up: false },
          { label: "עלות ממוצעת לעבודה", value: fmt(avgCostPerJob), color: "text-blue-400", icon: BarChart3, trend: "-1.5%", up: true },
          { label: "סטייה מול הערכה", value: pct(overallVariancePct), color: Math.abs(overallVariancePct) <= 5 ? "text-emerald-400" : "text-red-400", icon: Percent, trend: "שיפור", up: true },
          { label: "עלות עיבוד חוזר", value: fmt(totalRework), color: "text-red-400", icon: Hammer, trend: "+12%", up: false },
          { label: "עלות פחת/בזבוז", value: fmt(totalWaste), color: "text-amber-400", icon: AlertTriangle, trend: "-4%", up: true },
          { label: "דיוק למידה", value: `${learningAccuracy}%`, color: "text-purple-400", icon: Target, trend: "+2.1%", up: true },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className="bg-card/80 border-border hover:border-border/80 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
                    <p className={`text-lg font-bold font-mono mt-1 ${kpi.color}`}>{kpi.value}</p>
                    <div className="flex items-center gap-1 mt-1">
                      {kpi.up ? <TrendingUp className="h-3 w-3 text-emerald-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}
                      <span className={`text-[10px] ${kpi.up ? "text-emerald-400" : "text-red-400"}`}>{kpi.trend}</span>
                    </div>
                  </div>
                  <Icon className={`h-5 w-5 ${kpi.color} opacity-40`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="jobs" className="text-xs gap-1"><Layers className="h-3.5 w-3.5" /> עלויות לפי עבודה</TabsTrigger>
          <TabsTrigger value="breakdown" className="text-xs gap-1"><BarChart3 className="h-3.5 w-3.5" /> פירוט</TabsTrigger>
          <TabsTrigger value="trends" className="text-xs gap-1"><TrendingUp className="h-3.5 w-3.5" /> מגמות</TabsTrigger>
          <TabsTrigger value="learning" className="text-xs gap-1"><BookOpen className="h-3.5 w-3.5" /> למידה</TabsTrigger>
        </TabsList>

        {/* Tab 1: Cost per Job */}
        <TabsContent value="jobs" className="mt-4">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-background/50">
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">WO</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">מוצר</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">הערכה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">חומרים</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">עבודה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">מכונות</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">קב"מ</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">עיבוד חוזר</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">סה"כ בפועל</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">סטייה ₪</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">סטייה %</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">סטטוס</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map(j => (
                      <TableRow key={j.wo} className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${j.status === "over" ? "bg-red-500/5" : ""}`}>
                        <TableCell className="font-mono text-xs text-blue-400">{j.wo}</TableCell>
                        <TableCell className="text-xs font-medium text-foreground max-w-[160px] truncate">{j.product}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{fmt(j.estimatedCost)}</TableCell>
                        <TableCell className="font-mono text-xs text-blue-300">{fmt(j.actualMaterial)}</TableCell>
                        <TableCell className="font-mono text-xs text-cyan-300">{fmt(j.actualLabor)}</TableCell>
                        <TableCell className="font-mono text-xs text-purple-300">{fmt(j.actualMachine)}</TableCell>
                        <TableCell className="font-mono text-xs text-amber-300">{j.actualSubcontractor > 0 ? fmt(j.actualSubcontractor) : "—"}</TableCell>
                        <TableCell className="font-mono text-xs text-red-300">{j.actualRework > 0 ? fmt(j.actualRework) : "—"}</TableCell>
                        <TableCell className="font-mono text-xs font-semibold text-emerald-400">{fmt(j.totalActual)}</TableCell>
                        <TableCell className={`font-mono text-xs ${j.varianceNis > 0 ? "text-red-400" : "text-emerald-400"}`}>
                          <span className="flex items-center gap-0.5">
                            {j.varianceNis > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                            {fmt(j.varianceNis)}
                          </span>
                        </TableCell>
                        <TableCell className={`font-mono text-xs ${j.variancePct > 0 ? "text-red-400" : "text-emerald-400"}`}>{pct(j.variancePct)}</TableCell>
                        <TableCell><Badge className={`${statusConfig[j.status].cls} border-0 text-[9px]`}>{statusConfig[j.status].label}</Badge></TableCell>
                      </TableRow>
                    ))}
                    {/* Summary row */}
                    <TableRow className="border-t-2 border-border bg-muted/20 font-semibold">
                      <TableCell className="text-xs text-muted-foreground">סה"כ</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{jobs.length} עבודות</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{fmt(totalEstimated)}</TableCell>
                      <TableCell className="font-mono text-xs text-blue-300">{fmt(jobs.reduce((s, j) => s + j.actualMaterial, 0))}</TableCell>
                      <TableCell className="font-mono text-xs text-cyan-300">{fmt(jobs.reduce((s, j) => s + j.actualLabor, 0))}</TableCell>
                      <TableCell className="font-mono text-xs text-purple-300">{fmt(jobs.reduce((s, j) => s + j.actualMachine, 0))}</TableCell>
                      <TableCell className="font-mono text-xs text-amber-300">{fmt(jobs.reduce((s, j) => s + j.actualSubcontractor, 0))}</TableCell>
                      <TableCell className="font-mono text-xs text-red-300">{fmt(totalRework)}</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-emerald-400">{fmt(totalThisMonth)}</TableCell>
                      <TableCell className={`font-mono text-xs ${totalThisMonth - totalEstimated > 0 ? "text-red-400" : "text-emerald-400"}`}>{fmt(totalThisMonth - totalEstimated)}</TableCell>
                      <TableCell className={`font-mono text-xs ${overallVariancePct > 0 ? "text-red-400" : "text-emerald-400"}`}>{pct(overallVariancePct)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Category Breakdown */}
        <TabsContent value="breakdown" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Budget vs Actual Progress Bars */}
            <Card className="bg-card/80 border-border">
              <CardContent className="p-5 space-y-5">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-blue-400" /> תקציב מול בפועל — לפי קטגוריה
                </h3>
                {categoryBudgets.map((cat, i) => {
                  const Icon = cat.icon;
                  const ratio = (cat.actual / cat.budget) * 100;
                  const overBudget = ratio > 100;
                  return (
                    <div key={i} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-foreground">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          {cat.name}
                        </span>
                        <span className="font-mono text-muted-foreground">
                          {fmt(cat.actual)} / {fmt(cat.budget)}
                          <span className={`mr-2 ${overBudget ? "text-red-400" : "text-emerald-400"}`}>
                            ({ratio.toFixed(0)}%)
                          </span>
                        </span>
                      </div>
                      <div className="relative h-3 bg-muted/30 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${overBudget ? "bg-red-500" : cat.color}`}
                          style={{ width: `${Math.min(ratio, 100)}%` }}
                        />
                        {overBudget && (
                          <div
                            className="absolute top-0 h-full bg-red-500/40 rounded-l-none rounded-r-full animate-pulse"
                            style={{ right: "0", width: `${ratio - 100}%` }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
                <div className="border-t border-border pt-3 mt-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">סה"כ</span>
                    <span className="font-mono font-semibold text-foreground">
                      {fmt(categoryBudgets.reduce((s, c) => s + c.actual, 0))} / {fmt(categoryBudgets.reduce((s, c) => s + c.budget, 0))}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Pie-style breakdown cards */}
            <Card className="bg-card/80 border-border">
              <CardContent className="p-5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Layers className="h-4 w-4 text-purple-400" /> התפלגות עלויות — אפריל 2026
                </h3>
                {categoryBudgets.map((cat, i) => {
                  const Icon = cat.icon;
                  const share = ((cat.actual / totalThisMonth) * 100).toFixed(1);
                  return (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors">
                      <div className={`w-2 h-8 rounded-full ${cat.color}`} />
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-foreground">{cat.name}</span>
                          <span className="text-xs font-mono text-muted-foreground">{share}%</span>
                        </div>
                        <Progress value={Number(share)} className="h-1.5 mt-1" />
                      </div>
                      <span className="font-mono text-xs font-semibold text-foreground min-w-[70px] text-left">{fmt(cat.actual)}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Per-Job cost KPIs */}
            <Card className="bg-card/80 border-border lg:col-span-2">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Target className="h-4 w-4 text-emerald-400" /> עלות ממוצעת לעבודה — לפי קטגוריה
                </h3>
                <div className="grid grid-cols-5 gap-3">
                  {[
                    { label: "חומרים", value: Math.round(jobs.reduce((s, j) => s + j.actualMaterial, 0) / jobs.length), color: "text-blue-400", bg: "bg-blue-500/10" },
                    { label: "עבודה", value: Math.round(jobs.reduce((s, j) => s + j.actualLabor, 0) / jobs.length), color: "text-cyan-400", bg: "bg-cyan-500/10" },
                    { label: "מכונות", value: Math.round(jobs.reduce((s, j) => s + j.actualMachine, 0) / jobs.length), color: "text-purple-400", bg: "bg-purple-500/10" },
                    { label: "קב\"מ", value: Math.round(jobs.reduce((s, j) => s + j.actualSubcontractor, 0) / jobs.length), color: "text-amber-400", bg: "bg-amber-500/10" },
                    { label: "עיבוד חוזר", value: Math.round(totalRework / jobs.length), color: "text-red-400", bg: "bg-red-500/10" },
                  ].map((item, i) => (
                    <div key={i} className={`rounded-lg p-3 text-center ${item.bg}`}>
                      <p className="text-[10px] text-muted-foreground">{item.label}</p>
                      <p className={`text-base font-bold font-mono mt-0.5 ${item.color}`}>{fmt(item.value)}</p>
                      <p className="text-[9px] text-muted-foreground mt-0.5">ממוצע/עבודה</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 3: 6-Month Trends */}
        <TabsContent value="trends" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="bg-card/80 border-border lg:col-span-2">
              <CardContent className="p-5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-400" /> מגמת עלויות — 6 חודשים אחרונים
                </h3>
                {trendData.map((t, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground min-w-[70px]">{t.month}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-muted-foreground">הערכה: <span className="font-mono text-foreground">{fmt(t.estimated)}</span></span>
                        <span className="text-muted-foreground">בפועל: <span className="font-mono text-foreground">{fmt(t.actual)}</span></span>
                        <Badge className={`text-[9px] border-0 ${Math.abs(t.variance) <= 3 ? "bg-emerald-500/20 text-emerald-400" : t.variance > 0 ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"}`}>
                          {t.variance > 0 ? "+" : ""}{t.variance}%
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 h-5">
                      <div className="flex-1 relative h-4 bg-muted/20 rounded overflow-hidden">
                        <div className="absolute top-0 h-2 bg-blue-500/60 rounded" style={{ width: `${(t.estimated / maxTrend) * 100}%` }} />
                        <div className="absolute top-2 h-2 bg-emerald-500/60 rounded" style={{ width: `${(t.actual / maxTrend) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-4 text-[10px] text-muted-foreground pt-2 border-t border-border">
                  <span className="flex items-center gap-1"><span className="w-3 h-2 bg-blue-500/60 rounded inline-block" /> הערכה</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-2 bg-emerald-500/60 rounded inline-block" /> בפועל</span>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="bg-card/80 border-border">
                <CardContent className="p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">סיכום מגמות</h3>
                  {[
                    { label: "ממוצע סטייה (6 חודשים)", value: `${(trendData.reduce((s, t) => s + Math.abs(t.variance), 0) / trendData.length).toFixed(1)}%`, color: "text-amber-400" },
                    { label: "חודש הכי מדויק", value: "מרץ 2026", color: "text-emerald-400" },
                    { label: "חודש הכי חורג", value: "ינואר 2026", color: "text-red-400" },
                    { label: "כיוון מגמה", value: "שיפור", color: "text-emerald-400" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between py-1 border-b border-border/50 last:border-0">
                      <span className="text-xs text-muted-foreground">{item.label}</span>
                      <span className={`text-xs font-semibold font-mono ${item.color}`}>{item.value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="bg-card/80 border-border">
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-2">דיוק לפי קטגוריה</h3>
                  {[
                    { cat: "חומרי גלם", accuracy: 96, color: "bg-emerald-500" },
                    { cat: "עבודה", accuracy: 91, color: "bg-cyan-500" },
                    { cat: "מכונות", accuracy: 88, color: "bg-purple-500" },
                    { cat: "קב\"מ", accuracy: 85, color: "bg-amber-500" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2 py-1.5">
                      <span className="text-[10px] text-muted-foreground min-w-[60px]">{item.cat}</span>
                      <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.accuracy}%` }} />
                      </div>
                      <span className="text-[10px] font-mono text-foreground min-w-[30px] text-left">{item.accuracy}%</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Tab 4: Learning / Feedback to Pricing */}
        <TabsContent value="learning" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="bg-card/80 border-border lg:col-span-2">
              <CardContent className="p-5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-400" /> תובנות מייצור
                </h3>
                <p className="text-xs text-muted-foreground">משוב אוטומטי מנתוני ייצור לעדכון מודל התמחור</p>
                <div className="space-y-2.5">
                  {insights.map((ins, i) => (
                    <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                      ins.type === "error" ? "border-red-500/30 bg-red-500/5" :
                      ins.type === "warning" ? "border-amber-500/30 bg-amber-500/5" :
                      ins.type === "success" ? "border-emerald-500/30 bg-emerald-500/5" :
                      "border-blue-500/30 bg-blue-500/5"
                    }`}>
                      {ins.type === "error" ? <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${insightIcon[ins.type]}`} /> :
                       ins.type === "warning" ? <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${insightIcon[ins.type]}`} /> :
                       ins.type === "success" ? <CheckCircle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${insightIcon[ins.type]}`} /> :
                       <Lightbulb className={`h-4 w-4 mt-0.5 flex-shrink-0 ${insightIcon[ins.type]}`} />}
                      <div className="flex-1">
                        <p className="text-xs text-foreground leading-relaxed">{ins.text}</p>
                        <span className="text-[10px] text-muted-foreground mt-1 inline-block">השפעה: {ins.impact}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="bg-card/80 border-border">
                <CardContent className="p-4 text-center space-y-2">
                  <Target className="h-8 w-8 text-purple-400 mx-auto" />
                  <p className="text-[10px] text-muted-foreground">דיוק מודל תמחור</p>
                  <p className="text-3xl font-bold font-mono text-purple-400">{learningAccuracy}%</p>
                  <div className="flex items-center justify-center gap-1 text-emerald-400">
                    <TrendingUp className="h-3 w-3" />
                    <span className="text-[10px]">+2.1% מהחודש שעבר</span>
                  </div>
                  <Progress value={learningAccuracy} className="h-2 mt-2" />
                </CardContent>
              </Card>

              <Card className="bg-card/80 border-border">
                <CardContent className="p-4 space-y-2.5">
                  <h3 className="text-sm font-semibold text-foreground">סטטוס דיוק</h3>
                  {[
                    { label: "עבודות מדויקות (±5%)", count: jobs.filter(j => j.status === "accurate").length, total: jobs.length, color: "text-emerald-400" },
                    { label: "חריגה כלפי מעלה", count: jobs.filter(j => j.status === "over").length, total: jobs.length, color: "text-red-400" },
                    { label: "מתחת לצפי", count: jobs.filter(j => j.status === "under").length, total: jobs.length, color: "text-blue-400" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                      <span className="text-xs text-muted-foreground">{item.label}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold font-mono ${item.color}`}>{item.count}</span>
                        <span className="text-[10px] text-muted-foreground">/{item.total}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="bg-card/80 border-border">
                <CardContent className="p-4 space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">המלצות לתמחור</h3>
                  {[
                    "עדכן +8% לקטגוריית שערים",
                    "הורד -5% לדלתות פלדה",
                    "הוסף 3% תקורה לגדרות דקורטיביות",
                  ].map((rec, i) => (
                    <div key={i} className="flex items-center gap-2 py-1.5">
                      <span className="w-1.5 h-1.5 bg-amber-400 rounded-full flex-shrink-0" />
                      <span className="text-[11px] text-foreground">{rec}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
