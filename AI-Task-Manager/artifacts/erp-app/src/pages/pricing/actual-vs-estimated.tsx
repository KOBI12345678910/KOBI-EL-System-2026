import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  GitCompare, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  BarChart3, Lightbulb, ChevronDown, ChevronUp, Target, Brain,
} from "lucide-react";

const fmt = (v: number) => v.toLocaleString("he-IL");
const pct = (est: number, act: number) => est === 0 ? 0 : Math.round(((act - est) / est) * 100);

type Project = {
  id: number; name: string; client: string; estimated: number; actual: number;
  status: "accurate" | "over" | "under"; completedDate: string;
  categories: { name: string; estimated: number; actual: number }[];
};

const FALLBACK_PROJECTS: Project[] = [
  {
    id: 1, name: "שער חשמלי תעשייתי - מפעל שטראוס", client: "שטראוס גרופ",
    estimated: 87500, actual: 94200, status: "over", completedDate: "2026-03-15",
    categories: [
      { name: "חומר גלם - פלדה", estimated: 22000, actual: 24800 },
      { name: "ריתוך", estimated: 8500, actual: 9700 },
      { name: "צביעה אלקטרוסטטית", estimated: 6200, actual: 5900 },
      { name: "מנוע חשמלי", estimated: 12000, actual: 12000 },
      { name: "אלקטרוניקה ובקרה", estimated: 9800, actual: 11200 },
      { name: "עבודת הרכבה", estimated: 7500, actual: 8100 },
      { name: "הובלה והתקנה", estimated: 4500, actual: 5200 },
      { name: "תקורה ורווח", estimated: 17000, actual: 17300 },
    ],
  },
  {
    id: 2, name: "מעקה בטיחות נירוסטה - קניון עזריאלי", client: "עזריאלי קבוצה",
    estimated: 124000, actual: 119500, status: "under", completedDate: "2026-02-28",
    categories: [
      { name: "חומר גלם - נירוסטה 316", estimated: 38000, actual: 35200 },
      { name: "חיתוך לייזר", estimated: 12500, actual: 12800 },
      { name: "כיפוף CNC", estimated: 8000, actual: 7600 },
      { name: "ריתוך TIG", estimated: 14000, actual: 13500 },
      { name: "ליטוש ומירור", estimated: 9500, actual: 9200 },
      { name: "עבודת הרכבה", estimated: 11000, actual: 10800 },
      { name: "הובלה והתקנה", estimated: 8000, actual: 7900 },
      { name: "תקורה ורווח", estimated: 23000, actual: 22500 },
    ],
  },
  {
    id: 3, name: "מבנה פלדה - מחסן לוגיסטי", client: "שופרסל לוגיסטיקה",
    estimated: 345000, actual: 341200, status: "accurate", completedDate: "2026-01-20",
    categories: [
      { name: "חומר גלם - פלדה", estimated: 98000, actual: 97500 },
      { name: "חיתוך וניסור", estimated: 18000, actual: 18200 },
      { name: "ריתוך", estimated: 42000, actual: 41800 },
      { name: "גלוון חם", estimated: 28000, actual: 27500 },
      { name: "בולונים וחיבורים", estimated: 12000, actual: 12400 },
      { name: "הרכבה באתר", estimated: 45000, actual: 44500 },
      { name: "מנוף והובלה", estimated: 32000, actual: 31200 },
      { name: "תקורה ורווח", estimated: 70000, actual: 68100 },
    ],
  },
  {
    id: 4, name: "דלת אש EI60 - בית חולים איכילוב", client: "מרכז רפואי סוראסקי",
    estimated: 56000, actual: 63800, status: "over", completedDate: "2026-03-02",
    categories: [
      { name: "חומר גלם - פלדה אל-חלד", estimated: 14000, actual: 16200 },
      { name: "חומר מילוי עמיד אש", estimated: 8500, actual: 10100 },
      { name: "ריתוך מוסמך", estimated: 6000, actual: 7200 },
      { name: "צביעה תעשייתית", estimated: 4500, actual: 4800 },
      { name: "אביזרי בטיחות", estimated: 7000, actual: 8500 },
      { name: "בדיקות תקן ואישורים", estimated: 5000, actual: 6200 },
      { name: "התקנה מוסמכת", estimated: 3500, actual: 3800 },
      { name: "תקורה ורווח", estimated: 7500, actual: 7000 },
    ],
  },
  {
    id: 5, name: "גדר מתכת דקורטיבית - וילה הרצליה", client: "לקוח פרטי",
    estimated: 42000, actual: 40800, status: "accurate", completedDate: "2026-02-10",
    categories: [
      { name: "חומר גלם - ברזל יצוק", estimated: 11000, actual: 10800 },
      { name: "עיצוב וחיתוך CNC", estimated: 5500, actual: 5400 },
      { name: "ריתוך", estimated: 4800, actual: 4900 },
      { name: "צביעה אלקטרוסטטית", estimated: 3800, actual: 3700 },
      { name: "עבודת הרכבה", estimated: 5200, actual: 5100 },
      { name: "הובלה והתקנה", estimated: 3200, actual: 3000 },
      { name: "תקורה ורווח", estimated: 8500, actual: 7900 },
    ],
  },
  {
    id: 6, name: "מערכת מדפים תעשייתיים - אמזון ישראל", client: "אמזון ישראל",
    estimated: 198000, actual: 215400, status: "over", completedDate: "2026-01-05",
    categories: [
      { name: "חומר גלם - פלדה מגולוונת", estimated: 62000, actual: 68000 },
      { name: "חיתוך ועיגול", estimated: 15000, actual: 16200 },
      { name: "ריתוך רובוטי", estimated: 18000, actual: 19500 },
      { name: "גלוון", estimated: 14000, actual: 15800 },
      { name: "חיבורים ובורגים", estimated: 8000, actual: 9200 },
      { name: "הרכבה באתר", estimated: 25000, actual: 28500 },
      { name: "הובלה", estimated: 16000, actual: 18200 },
      { name: "תקורה ורווח", estimated: 40000, actual: 40000 },
    ],
  },
  {
    id: 7, name: "סולם חירום - מגדל מגורים תל אביב", client: "אפריקה ישראל",
    estimated: 78000, actual: 76500, status: "accurate", completedDate: "2026-03-22",
    categories: [
      { name: "חומר גלם - פלדה", estimated: 21000, actual: 20800 },
      { name: "חיתוך", estimated: 5500, actual: 5400 },
      { name: "ריתוך", estimated: 12000, actual: 11800 },
      { name: "גלוון חם", estimated: 9000, actual: 8900 },
      { name: "אביזרי בטיחות", estimated: 6500, actual: 6400 },
      { name: "הרכבה והתקנה", estimated: 9000, actual: 8800 },
      { name: "הובלה במנוף", estimated: 5000, actual: 4800 },
      { name: "תקורה ורווח", estimated: 10000, actual: 9600 },
    ],
  },
  {
    id: 8, name: "פרגולה ממוחשבת - משרדי הייטק", client: "אירונסורס טכנולוגיות",
    estimated: 67000, actual: 71300, status: "over", completedDate: "2025-12-18",
    categories: [
      { name: "חומר גלם - אלומיניום", estimated: 16000, actual: 17500 },
      { name: "חיתוך CNC", estimated: 7000, actual: 7200 },
      { name: "ריתוך", estimated: 5500, actual: 6100 },
      { name: "ציפוי אנודייז", estimated: 8000, actual: 8400 },
      { name: "מנוע ובקרה", estimated: 9500, actual: 10800 },
      { name: "חיישנים ואוטומציה", estimated: 6000, actual: 6800 },
      { name: "התקנה", estimated: 5000, actual: 5200 },
      { name: "תקורה ורווח", estimated: 10000, actual: 9300 },
    ],
  },
];

const FALLBACK_INSIGHTS = [
  { text: "עלות ריתוך מוערכת חסר ב-12% בממוצע — יש לעדכן תעריף שעתי מ-180 ל-200 ₪/שעה", severity: "high" as const, category: "ריתוך" },
  { text: "חומר גלם — פלדה: דיוק של 94%. העלאת מקדם בטחון מ-3% ל-5% תשפר עוד", severity: "medium" as const, category: "חומר גלם" },
  { text: "עלויות הובלה והתקנה חורגות ב-15% כשהפרויקט מעל 200,000 ₪ — להוסיף מדרגה", severity: "high" as const, category: "הובלה" },
  { text: "אביזרי בטיחות (דלתות אש, סולמות) — חריגה ממוצעת של 18%. ספקים עדכנו מחירון", severity: "high" as const, category: "אביזרים" },
  { text: "עלות צביעה אלקטרוסטטית מדויקת ב-97% — אין צורך בשינוי", severity: "low" as const, category: "צביעה" },
  { text: "עבודות הרכבה באתר — דיוק של 95%. ביצועים מצוינים", severity: "low" as const, category: "הרכבה" },
  { text: "פרויקטים עם אלקטרוניקה ובקרה חורגים ב-14% — יש לעדכן את מאגר הרכיבים", severity: "medium" as const, category: "אלקטרוניקה" },
  { text: "גלוון חם — ירידת מחירים של 4% לא עודכנה בתמחור. להוזיל מקדם", severity: "medium" as const, category: "גלוון" },
];

const FALLBACK_TREND_DATA = [
  { month: "אוק׳ 25", accuracy: 88, overBudget: 4, underBudget: 2 },
  { month: "נוב׳ 25", accuracy: 89, overBudget: 3, underBudget: 3 },
  { month: "דצמ׳ 25", accuracy: 91, overBudget: 3, underBudget: 2 },
  { month: "ינו׳ 26", accuracy: 90, overBudget: 4, underBudget: 1 },
  { month: "פבר׳ 26", accuracy: 93, overBudget: 2, underBudget: 3 },
  { month: "מרץ 26", accuracy: 94, overBudget: 2, underBudget: 2 },
];

const statusConfig = {
  accurate: { label: "מדויק", color: "bg-green-500/20 text-green-400 border-green-500/30", icon: CheckCircle2 },
  over: { label: "חריגה", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: TrendingUp },
  under: { label: "מתחת לצפי", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: TrendingDown },
};

export default function ActualVsEstimated() {

  const { data: apiData } = useQuery({
    queryKey: ["actual_vs_estimated"],
    queryFn: () => authFetch("/api/pricing/actual-vs-estimated").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const projects = apiData?.projects ?? FALLBACK_PROJECTS;
  const insights = apiData?.insights ?? FALLBACK_INSIGHTS;
  const trendData = apiData?.trendData ?? FALLBACK_TREND_DATA;
  const [tab, setTab] = useState("projects");
  const [expanded, setExpanded] = useState<number | null>(null);

  const totalProjects = projects.length;
  const avgVariance = Math.round(projects.reduce((s, p) => s + Math.abs(pct(p.estimated, p.actual)), 0) / totalProjects);
  const overBudget = projects.filter(p => p.status === "over").length;
  const underBudget = projects.filter(p => p.status === "under").length;

  const categoryAccuracy: Record<string, { total: number; count: number }> = {};
  projects.forEach(p => p.categories.forEach(c => {
    const key = c.name.split(" - ")[0].split(" ו")[0].trim();
    if (!categoryAccuracy[key]) categoryAccuracy[key] = { total: 0, count: 0 };
    categoryAccuracy[key].total += Math.abs(pct(c.estimated, c.actual));
    categoryAccuracy[key].count += 1;
  }));
  const sorted = Object.entries(categoryAccuracy).map(([k, v]) => ({ name: k, avg: Math.round(v.total / v.count) })).sort((a, b) => a.avg - b.avg);
  const bestCat = sorted[0]?.name || "—";
  const worstCat = sorted[sorted.length - 1]?.name || "—";

  const kpis = [
    { label: "פרויקטים שנותחו", value: totalProjects, icon: BarChart3, color: "text-blue-400" },
    { label: "סטיה ממוצעת", value: `${avgVariance}%`, icon: Target, color: "text-yellow-400" },
    { label: "חריגה בתקציב", value: overBudget, icon: TrendingUp, color: "text-red-400" },
    { label: "מתחת לתקציב", value: underBudget, icon: TrendingDown, color: "text-green-400" },
    { label: "הקטגוריה המדויקת ביותר", value: bestCat, icon: CheckCircle2, color: "text-emerald-400", small: true },
    { label: "הקטגוריה הכי בעייתית", value: worstCat, icon: AlertTriangle, color: "text-orange-400", small: true },
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/30">
          <GitCompare className="w-6 h-6 text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">בפועל מול צפי — למידת תמחור</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי | ניתוח סטיות ולמידה מתמשכת לשיפור דיוק התמחור</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className="bg-card border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <k.icon className={`w-4 h-4 ${k.color}`} />
                <span className="text-xs text-muted-foreground">{k.label}</span>
              </div>
              <p className={`font-bold ${(k as any).small ? "text-sm" : "text-xl"}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/30 border border-border/50">
          <TabsTrigger value="projects">סיכום פרויקטים</TabsTrigger>
          <TabsTrigger value="detail">פירוט</TabsTrigger>
          <TabsTrigger value="insights">תובנות</TabsTrigger>
          <TabsTrigger value="trends">מגמות</TabsTrigger>
        </TabsList>

        {/* ---- Projects Tab ---- */}
        <TabsContent value="projects" className="space-y-2 mt-4">
          <Card className="bg-card border-border/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 text-muted-foreground text-xs">
                    <th className="p-3 text-right font-medium">פרויקט</th>
                    <th className="p-3 text-right font-medium">לקוח</th>
                    <th className="p-3 text-right font-medium">עלות צפויה</th>
                    <th className="p-3 text-right font-medium">עלות בפועל</th>
                    <th className="p-3 text-right font-medium">סטיה ₪</th>
                    <th className="p-3 text-right font-medium">סטיה %</th>
                    <th className="p-3 text-right font-medium">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map(p => {
                    const diff = p.actual - p.estimated;
                    const variance = pct(p.estimated, p.actual);
                    const sc = statusConfig[p.status];
                    return (
                      <tr key={p.id} className="border-b border-border/20 hover:bg-muted/10 transition-colors cursor-pointer"
                        onClick={() => { setExpanded(expanded === p.id ? null : p.id); setTab("detail"); }}>
                        <td className="p-3 font-medium">{p.name}</td>
                        <td className="p-3 text-muted-foreground">{p.client}</td>
                        <td className="p-3">{fmt(p.estimated)} ₪</td>
                        <td className="p-3">{fmt(p.actual)} ₪</td>
                        <td className={`p-3 font-medium ${diff > 0 ? "text-red-400" : diff < 0 ? "text-green-400" : ""}`}>
                          {diff > 0 ? "+" : ""}{fmt(diff)} ₪
                        </td>
                        <td className={`p-3 font-medium ${variance > 3 ? "text-red-400" : variance < -3 ? "text-green-400" : "text-muted-foreground"}`}>
                          {variance > 0 ? "+" : ""}{variance}%
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className={sc.color}>
                            <sc.icon className="w-3 h-3 ml-1" />{sc.label}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ---- Detail Tab ---- */}
        <TabsContent value="detail" className="space-y-3 mt-4">
          {projects.map(p => {
            const isOpen = expanded === p.id;
            const diff = p.actual - p.estimated;
            const variance = pct(p.estimated, p.actual);
            return (
              <Card key={p.id} className="bg-card border-border/50">
                <CardHeader className="cursor-pointer p-4" onClick={() => setExpanded(isOpen ? null : p.id)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={statusConfig[p.status].color}>{statusConfig[p.status].label}</Badge>
                      <CardTitle className="text-base">{p.name}</CardTitle>
                      <span className="text-xs text-muted-foreground">| {p.client}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm">צפי: <strong>{fmt(p.estimated)} ₪</strong></span>
                      <span className="text-sm">בפועל: <strong>{fmt(p.actual)} ₪</strong></span>
                      <span className={`text-sm font-bold ${diff > 0 ? "text-red-400" : "text-green-400"}`}>
                        {variance > 0 ? "+" : ""}{variance}%
                      </span>
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </CardHeader>
                {isOpen && (
                  <CardContent className="px-4 pb-4 space-y-2">
                    {p.categories.map((c, ci) => {
                      const catDiff = c.actual - c.estimated;
                      const catVar = pct(c.estimated, c.actual);
                      const maxVal = Math.max(c.estimated, c.actual);
                      const estPct = maxVal === 0 ? 0 : (c.estimated / maxVal) * 100;
                      const actPct = maxVal === 0 ? 0 : (c.actual / maxVal) * 100;
                      return (
                        <div key={ci} className="grid grid-cols-12 gap-2 items-center py-2 border-b border-border/10 last:border-0">
                          <div className="col-span-3 text-sm font-medium">{c.name}</div>
                          <div className="col-span-4 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground w-12">צפי</span>
                              <div className="flex-1 h-3 bg-muted/20 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500/70 rounded-full" style={{ width: `${estPct}%` }} />
                              </div>
                              <span className="text-xs w-20 text-left">{fmt(c.estimated)} ₪</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground w-12">בפועל</span>
                              <div className="flex-1 h-3 bg-muted/20 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${catDiff > 0 ? "bg-red-500/70" : "bg-green-500/70"}`} style={{ width: `${actPct}%` }} />
                              </div>
                              <span className="text-xs w-20 text-left">{fmt(c.actual)} ₪</span>
                            </div>
                          </div>
                          <div className="col-span-2 text-center">
                            <span className={`text-sm font-medium ${catDiff > 0 ? "text-red-400" : catDiff < 0 ? "text-green-400" : "text-muted-foreground"}`}>
                              {catDiff > 0 ? "+" : ""}{fmt(catDiff)} ₪
                            </span>
                          </div>
                          <div className="col-span-2 text-center">
                            <Badge variant="outline" className={
                              Math.abs(catVar) <= 3 ? "bg-green-500/10 text-green-400 border-green-500/30"
                                : catVar > 0 ? "bg-red-500/10 text-red-400 border-red-500/30"
                                : "bg-blue-500/10 text-blue-400 border-blue-500/30"
                            }>
                              {catVar > 0 ? "+" : ""}{catVar}%
                            </Badge>
                          </div>
                          <div className="col-span-1">
                            <Progress value={100 - Math.min(Math.abs(catVar), 30) * (100 / 30)}
                              className="h-2 [&>div]:bg-emerald-500" />
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </TabsContent>

        {/* ---- Insights Tab ---- */}
        <TabsContent value="insights" className="space-y-4 mt-4">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold">המערכת למדה ש...</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {insights.map((ins, i) => (
              <Card key={i} className={`bg-card border-border/50 ${
                ins.severity === "high" ? "border-r-2 border-r-red-500"
                  : ins.severity === "medium" ? "border-r-2 border-r-yellow-500"
                  : "border-r-2 border-r-green-500"
              }`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Lightbulb className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                      ins.severity === "high" ? "text-red-400" : ins.severity === "medium" ? "text-yellow-400" : "text-green-400"
                    }`} />
                    <div className="space-y-2">
                      <p className="text-sm leading-relaxed">{ins.text}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs bg-muted/20">{ins.category}</Badge>
                        <Badge variant="outline" className={`text-xs ${
                          ins.severity === "high" ? "bg-red-500/10 text-red-400 border-red-500/30"
                            : ins.severity === "medium" ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
                            : "bg-green-500/10 text-green-400 border-green-500/30"
                        }`}>
                          {ins.severity === "high" ? "דחיפות גבוהה" : ins.severity === "medium" ? "דחיפות בינונית" : "תקין"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="bg-card border-border/50 mt-4">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="w-4 h-4 text-blue-400" />
                המלצות לשיפור תמחור
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                "לעדכן תעריף ריתוך מ-180 ₪/שעה ל-200 ₪/שעה בכל סוגי הפרויקטים",
                "להוסיף 5% מקדם בטחון לפרויקטים הכוללים אלקטרוניקה ובקרה",
                "לעדכן מחירון אביזרי בטיחות מספקים — העלאה ממוצעת של 18%",
                "להפחית מקדם גלוון ב-4% בהתאם למחירי שוק עדכניים",
                "להוסיף מדרגת הובלה נפרדת לפרויקטים מעל 200,000 ₪",
              ].map((rec, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-muted/10 rounded-lg border border-border/30">
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-xs text-blue-400 font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <span className="text-sm">{rec}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- Trends Tab ---- */}
        <TabsContent value="trends" className="space-y-4 mt-4">
          <Card className="bg-card border-border/50">
            <CardHeader>
              <CardTitle className="text-base">מגמת דיוק תמחור — 6 חודשים אחרונים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {trendData.map((t, i) => (
                  <div key={i} className="grid grid-cols-12 gap-3 items-center">
                    <div className="col-span-2 text-sm font-medium">{t.month}</div>
                    <div className="col-span-6">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-6 bg-muted/20 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-l from-emerald-500 to-emerald-600 rounded-full flex items-center justify-end px-2"
                            style={{ width: `${t.accuracy}%` }}>
                            <span className="text-xs font-bold text-white">{t.accuracy}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="col-span-2 text-center">
                      <span className="text-xs text-red-400">{t.overBudget} חריגות</span>
                    </div>
                    <div className="col-span-2 text-center">
                      <span className="text-xs text-blue-400">{t.underBudget} מתחת</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-3 gap-3">
            <Card className="bg-card border-border/50">
              <CardContent className="p-4 text-center">
                <TrendingUp className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-emerald-400">+6%</p>
                <p className="text-xs text-muted-foreground mt-1">שיפור דיוק ב-6 חודשים</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border/50">
              <CardContent className="p-4 text-center">
                <TrendingDown className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-blue-400">-50%</p>
                <p className="text-xs text-muted-foreground mt-1">ירידה בחריגות תקציב</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border/50">
              <CardContent className="p-4 text-center">
                <CheckCircle2 className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-purple-400">94%</p>
                <p className="text-xs text-muted-foreground mt-1">דיוק נוכחי — שיא חברה</p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card border-border/50">
            <CardHeader>
              <CardTitle className="text-base">דיוק לפי קטגוריה</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {sorted.map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm w-36 truncate">{c.name}</span>
                  <div className="flex-1 h-4 bg-muted/20 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${
                      c.avg <= 3 ? "bg-emerald-500" : c.avg <= 8 ? "bg-yellow-500" : "bg-red-500"
                    }`} style={{ width: `${Math.min(100 - c.avg, 100)}%` }} />
                  </div>
                  <span className={`text-sm font-medium w-16 text-left ${
                    c.avg <= 3 ? "text-emerald-400" : c.avg <= 8 ? "text-yellow-400" : "text-red-400"
                  }`}>
                    {100 - c.avg}% דיוק
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
