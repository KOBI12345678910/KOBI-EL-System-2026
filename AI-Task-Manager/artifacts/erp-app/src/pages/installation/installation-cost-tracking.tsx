import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Calculator, TrendingUp, TrendingDown, Users, Package, Truck,
  Wrench, AlertTriangle, Lightbulb, DollarSign, BarChart3,
  ArrowUpRight, ArrowDownRight, Minus, ParkingCircle, ShieldCheck
} from "lucide-react";

/* ── Helpers ───────────────────────────────────────────────────── */

const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);

const fmtCurrency = (n: number) => `₪${fmt(n)}`;

const fmtPct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

/* ── Static mock data ─────────────────────────────────────────── */

const FALLBACK_KPI_DATA = [
  { label: "עלות כוללת החודש", value: 148500, format: "currency", icon: Calculator, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "תקציב מאושר", value: 165000, format: "currency", icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "ניצול תקציב", value: 90, format: "pct", icon: BarChart3, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "חריגות עלות", value: 8200, format: "currency", icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "עלות ממוצעת להתקנה", value: 18500, format: "currency", icon: TrendingUp, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: 'עלות ל-מ"ר', value: 145, format: "currency", icon: Package, color: "text-cyan-400", bg: "bg-cyan-500/10" },
];

const FALLBACK_INSTALLATIONS = [
  { id: "INS-301", project: "מגדלי הים — חיפה", planned: 22000, actual: 21400, labor: 9200, materials: 5800, transport: 2600, equipment: 2400, misc: 1400, status: "בתקציב" },
  { id: "INS-302", project: "פארק המדע — רחובות", planned: 18500, actual: 19200, labor: 8100, materials: 4500, transport: 3100, equipment: 2200, misc: 1300, status: "חריגה קלה" },
  { id: "INS-303", project: "בית חכם — הרצליה", planned: 15000, actual: 14800, labor: 6400, materials: 4100, transport: 1800, equipment: 1500, misc: 1000, status: "בתקציב" },
  { id: "INS-304", project: "מלון ים התיכון", planned: 28000, actual: 31200, labor: 12800, materials: 7600, transport: 4200, equipment: 4800, misc: 1800, status: "חריגה משמעותית" },
  { id: "INS-305", project: "קניון הדרום — באר שבע", planned: 16000, actual: 15700, labor: 6800, materials: 4200, transport: 2400, equipment: 1400, misc: 900, status: "בתקציב" },
  { id: "INS-306", project: "משרדי הייטק — הרצליה פיתוח", planned: 12500, actual: 13100, labor: 5600, materials: 3400, transport: 1800, equipment: 1500, misc: 800, status: "חריגה קלה" },
  { id: "INS-307", project: "בניין מגורים — נתניה", planned: 9800, actual: 9500, labor: 4100, materials: 2800, transport: 1200, equipment: 800, misc: 600, status: "בתקציב" },
  { id: "INS-308", project: "מרכז ספורט — ראשל\"צ", planned: 14200, actual: 13800, labor: 5900, materials: 3800, transport: 1700, equipment: 1600, misc: 800, status: "בתקציב" },
  { id: "INS-309", project: "בית ספר אורט — פ\"ת", planned: 11000, actual: 11500, labor: 4800, materials: 3200, transport: 1500, equipment: 1200, misc: 800, status: "חריגה קלה" },
  { id: "INS-310", project: "מגורי יוקרה — סביון", planned: 19500, actual: 18200, labor: 7800, materials: 5100, transport: 2200, equipment: 2000, misc: 1100, status: "בתקציב" },
];

const statusColor: Record<string, string> = {
  "בתקציב": "bg-emerald-500/20 text-emerald-300",
  "חריגה קלה": "bg-amber-500/20 text-amber-300",
  "חריגה משמעותית": "bg-red-500/20 text-red-300",
};

const FALLBACK_COST_CATEGORIES = [
  {
    name: "כוח אדם",
    subtitle: "שעות x תעריף",
    icon: Users,
    planned: 62500,
    actual: 71500,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    details: "352 שעות | תעריף ממוצע ₪203/שעה",
  },
  {
    name: "חומרי עזר",
    subtitle: "איטום, ברגים, אביזרים",
    icon: Package,
    planned: 40200,
    actual: 44500,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    details: "סיליקון, ברגי נירוסטה, עוגנים, דיבלים, EPDM",
  },
  {
    name: "הובלה ושינוע",
    subtitle: "משאיות + מלגזות",
    icon: Truck,
    planned: 19800,
    actual: 22500,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    details: "18 נסיעות | ממוצע 42 ק\"מ",
  },
  {
    name: "ציוד מיוחד",
    subtitle: "מנוף, פיגומים, סלים",
    icon: Wrench,
    planned: 17500,
    actual: 19400,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    details: "מנוף 50 טון x3 ימים | פיגום 8 קומות",
  },
  {
    name: "עלויות נלוות",
    subtitle: 'חניה, אש"ל, בטיחות',
    icon: ShieldCheck,
    planned: 7500,
    actual: 7800,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    details: 'ממוצע ₪85/יום לעובד | כולל ציוד בטיחות',
  },
];

const FALLBACK_MONTHLY_TREND = [
  { month: "נובמבר", actual: 132000, budget: 140000 },
  { month: "דצמבר", actual: 141500, budget: 145000 },
  { month: "ינואר", actual: 128000, budget: 150000 },
  { month: "פברואר", actual: 155200, budget: 155000 },
  { month: "מרץ", actual: 162800, budget: 160000 },
  { month: "אפריל", actual: 148500, budget: 165000 },
];

const FALLBACK_INSIGHTS = [
  { text: "עלות הובלה עלתה 15% — שקול ספק חלופי או מיזוג נסיעות באשכולות גיאוגרפיים", type: "warning", icon: Truck },
  { text: 'עלות כ"א בפרויקט INS-304 חורגת ב-22% — נדרש ניתוח שעות נוספות מול תכולה', type: "critical", icon: Users },
  { text: 'פרויקטים בטווח 30 ק"מ ממרכז הלוגיסטיקה חוסכים 18% בהובלה — תעדוף אזורי', type: "positive", icon: TrendingDown },
  { text: "רכש אביזרים מרוכז (מעל ₪10K/הזמנה) מפחית עלות חומרים ב-12% בממוצע", type: "info", icon: Lightbulb },
];

const insightColor: Record<string, string> = {
  warning: "border-amber-500/30 bg-amber-500/5",
  critical: "border-red-500/30 bg-red-500/5",
  positive: "border-emerald-500/30 bg-emerald-500/5",
  info: "border-blue-500/30 bg-blue-500/5",
};

const insightIconColor: Record<string, string> = {
  warning: "text-amber-400",
  critical: "text-red-400",
  positive: "text-emerald-400",
  info: "text-blue-400",
};

/* ── Bar helpers for trend chart ──────────────────────────────── */

const trendMax = Math.max(...FALLBACK_MONTHLY_TREND.flatMap(m => [m.actual, m.budget]));

const DeviationArrow = ({ planned, actual }: { planned: number; actual: number }) => {
  const diff = actual - planned;
  const pct = ((diff / planned) * 100);
  if (Math.abs(pct) < 0.5) return <Minus className="h-3.5 w-3.5 text-gray-400 inline" />;
  if (diff > 0) return <span className="text-red-400 text-xs font-medium flex items-center gap-0.5"><ArrowUpRight className="h-3.5 w-3.5" />{fmtPct(pct)}</span>;
  return <span className="text-emerald-400 text-xs font-medium flex items-center gap-0.5"><ArrowDownRight className="h-3.5 w-3.5" />{fmtPct(pct)}</span>;
};

/* ── Component ─────────────────────────────────────────────────── */

export default function InstallationCostTracking() {
  const { data: kpiData = FALLBACK_KPI_DATA } = useQuery({
    queryKey: ["installation-kpi-data"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-cost-tracking/kpi-data");
      if (!res.ok) return FALLBACK_KPI_DATA;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_KPI_DATA;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: installations = FALLBACK_INSTALLATIONS } = useQuery({
    queryKey: ["installation-installations"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-cost-tracking/installations");
      if (!res.ok) return FALLBACK_INSTALLATIONS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_INSTALLATIONS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: costCategories = FALLBACK_COST_CATEGORIES } = useQuery({
    queryKey: ["installation-cost-categories"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-cost-tracking/cost-categories");
      if (!res.ok) return FALLBACK_COST_CATEGORIES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_COST_CATEGORIES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: monthlyTrend = FALLBACK_MONTHLY_TREND } = useQuery({
    queryKey: ["installation-monthly-trend"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-cost-tracking/monthly-trend");
      if (!res.ok) return FALLBACK_MONTHLY_TREND;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_MONTHLY_TREND;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: insights = FALLBACK_INSIGHTS } = useQuery({
    queryKey: ["installation-insights"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-cost-tracking/insights");
      if (!res.ok) return FALLBACK_INSIGHTS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_INSIGHTS;
    },
    staleTime: 30_000,
    retry: 1,
  });


  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Calculator className="h-7 w-7 text-primary" /> מעקב עלויות התקנה
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          טכנו-כל עוזי — פירוט עלויות | קטגוריות | מגמות | תובנות
        </p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-6 gap-3">
        {kpiData.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.bg} border-0`}>
              <CardContent className="p-4 flex items-center gap-3">
                <Icon className={`h-8 w-8 ${kpi.color}`} />
                <div>
                  <p className="text-[11px] text-muted-foreground leading-none">{kpi.label}</p>
                  <p className="text-lg font-bold mt-0.5">
                    {kpi.format === "currency" ? fmtCurrency(kpi.value) : kpi.format === "pct" ? `${kpi.value}%` : fmt(kpi.value)}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="breakdown" className="space-y-4">
        <TabsList>
          <TabsTrigger value="breakdown">פירוט עלויות להתקנה</TabsTrigger>
          <TabsTrigger value="categories">קטגוריות עלות</TabsTrigger>
          <TabsTrigger value="trend">מגמה חודשית</TabsTrigger>
          <TabsTrigger value="insights">תובנות AI</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Cost Breakdown per Installation ────────────── */}
        <TabsContent value="breakdown">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">פירוט עלויות לפי התקנה — אפריל 2026</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right w-[90px]">מזהה</TableHead>
                    <TableHead className="text-right">פרויקט</TableHead>
                    <TableHead className="text-right">מתוכנן</TableHead>
                    <TableHead className="text-right">בפועל</TableHead>
                    <TableHead className="text-right">סטייה</TableHead>
                    <TableHead className="text-right">כ"א</TableHead>
                    <TableHead className="text-right">חומרים</TableHead>
                    <TableHead className="text-right">הובלה</TableHead>
                    <TableHead className="text-right">ציוד</TableHead>
                    <TableHead className="text-right">שונות</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {installations.map((ins) => {
                    const diff = ins.actual - ins.planned;
                    const diffPct = ((diff / ins.planned) * 100);
                    return (
                      <TableRow key={ins.id}>
                        <TableCell className="font-mono text-xs">{ins.id}</TableCell>
                        <TableCell className="font-medium text-sm">{ins.project}</TableCell>
                        <TableCell className="text-sm">{fmtCurrency(ins.planned)}</TableCell>
                        <TableCell className="text-sm font-semibold">{fmtCurrency(ins.actual)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start">
                            <span className={`text-xs font-medium ${diff > 0 ? "text-red-400" : diff < 0 ? "text-emerald-400" : "text-gray-400"}`}>
                              {diff > 0 ? "+" : ""}{fmtCurrency(diff)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">({fmtPct(diffPct)})</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtCurrency(ins.labor)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtCurrency(ins.materials)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtCurrency(ins.transport)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtCurrency(ins.equipment)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtCurrency(ins.misc)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${statusColor[ins.status] ?? ""}`}>
                            {ins.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Cost Categories ───────────────────────────── */}
        <TabsContent value="categories">
          <div className="grid grid-cols-5 gap-4">
            {costCategories.map((cat, i) => {
              const Icon = cat.icon;
              const diff = cat.actual - cat.planned;
              const diffPct = ((diff / cat.planned) * 100);
              const usagePct = Math.min(100, Math.round((cat.actual / cat.planned) * 100));
              return (
                <Card key={i} className={`${cat.bg} border-0`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Icon className={`h-5 w-5 ${cat.color}`} />
                      {cat.name}
                    </CardTitle>
                    <p className="text-[10px] text-muted-foreground">{cat.subtitle}</p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">מתוכנן</span>
                      <span>{fmtCurrency(cat.planned)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">בפועל</span>
                      <span className="font-semibold">{fmtCurrency(cat.actual)}</span>
                    </div>
                    <Progress value={usagePct} className="h-2" />
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-muted-foreground">{usagePct}% ניצול</span>
                      <DeviationArrow planned={cat.planned} actual={cat.actual} />
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">סטייה</span>
                      <span className={diff > 0 ? "text-red-400 font-medium" : "text-emerald-400 font-medium"}>
                        {diff > 0 ? "+" : ""}{fmtCurrency(diff)}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground border-t border-white/5 pt-2 mt-1">{cat.details}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ── Tab 3: Monthly Cost Trend ────────────────────────── */}
        <TabsContent value="trend">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">מגמת עלויות — 6 חודשים אחרונים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Legend */}
                <div className="flex gap-6 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-sm bg-blue-500 inline-block" /> בפועל
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-sm bg-emerald-500/40 border border-emerald-400 inline-block" /> תקציב
                  </span>
                </div>
                {/* Bar Chart */}
                <div className="space-y-3">
                  {monthlyTrend.map((m, i) => {
                    const actualW = (m.actual / trendMax) * 100;
                    const budgetW = (m.budget / trendMax) * 100;
                    const overBudget = m.actual > m.budget;
                    return (
                      <div key={i} className="grid grid-cols-[80px_1fr_160px] items-center gap-3">
                        <span className="text-sm font-medium text-right">{m.month}</span>
                        <div className="relative h-8">
                          {/* Budget bar (background) */}
                          <div
                            className="absolute inset-y-0 right-0 bg-emerald-500/15 border border-emerald-500/30 rounded"
                            style={{ width: `${budgetW}%` }}
                          />
                          {/* Actual bar (foreground) */}
                          <div
                            className={`absolute inset-y-0 right-0 rounded ${overBudget ? "bg-red-500/30" : "bg-blue-500/40"}`}
                            style={{ width: `${actualW}%` }}
                          />
                        </div>
                        <div className="flex gap-3 text-xs">
                          <span className={overBudget ? "text-red-400 font-semibold" : "text-blue-400 font-semibold"}>
                            {fmtCurrency(m.actual)}
                          </span>
                          <span className="text-muted-foreground">/ {fmtCurrency(m.budget)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Summary row */}
                <div className="grid grid-cols-3 gap-4 border-t border-white/5 pt-4 mt-2">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">סה"כ בפועל (6 חודשים)</p>
                    <p className="text-lg font-bold">{fmtCurrency(monthlyTrend.reduce((s, m) => s + m.actual, 0))}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">סה"כ תקציב (6 חודשים)</p>
                    <p className="text-lg font-bold">{fmtCurrency(monthlyTrend.reduce((s, m) => s + m.budget, 0))}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">סטייה מצטברת</p>
                    {(() => {
                      const totalActual = monthlyTrend.reduce((s, m) => s + m.actual, 0);
                      const totalBudget = monthlyTrend.reduce((s, m) => s + m.budget, 0);
                      const cumDiff = totalActual - totalBudget;
                      return (
                        <p className={`text-lg font-bold ${cumDiff > 0 ? "text-red-400" : "text-emerald-400"}`}>
                          {cumDiff > 0 ? "+" : ""}{fmtCurrency(cumDiff)}
                        </p>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 4: AI Learning Insights ──────────────────────── */}
        <TabsContent value="insights">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-amber-400" /> תובנות חכמות — ניתוח עלויות
              </CardTitle>
              <p className="text-xs text-muted-foreground">תובנות מבוססות AI על בסיס נתוני 6 חודשים אחרונים</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {insights.map((insight, i) => {
                const Icon = insight.icon;
                return (
                  <div
                    key={i}
                    className={`flex items-start gap-3 p-4 rounded-lg border ${insightColor[insight.type]}`}
                  >
                    <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${insightIconColor[insight.type]}`} />
                    <p className="text-sm leading-relaxed">{insight.text}</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
