import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  BarChart3, TrendingUp, TrendingDown, Users, Clock, Target,
  Lightbulb, Shield, Wrench, BrainCircuit, Award, CheckCircle2,
  AlertTriangle, Search, Download, Calendar, Minus,
} from "lucide-react";

/* ── helpers ── */
const pct = (v: number) => `${v.toFixed(1)}%`;
const months6 = ["נובמבר", "דצמבר", "ינואר", "פברואר", "מרץ", "אפריל"];

type Status = "excellent" | "good" | "warning" | "critical";
const statusMap: Record<Status, { label: string; cls: string }> = {
  excellent: { label: "מצוין", cls: "bg-green-500/20 text-green-400" },
  good:      { label: "תקין", cls: "bg-blue-500/20 text-blue-400" },
  warning:   { label: "אזהרה", cls: "bg-yellow-500/20 text-yellow-400" },
  critical:  { label: "קריטי", cls: "bg-red-500/20 text-red-400" },
};
const getStatus = (val: number, target: number, higherBetter = true): Status => {
  const ratio = higherBetter ? val / target : target / val;
  if (ratio >= 1) return "excellent";
  if (ratio >= 0.93) return "good";
  if (ratio >= 0.82) return "warning";
  return "critical";
};

/* ── KPI data ── */
const kpis = [
  { label: "פרויקטים שהושלמו", value: "47", icon: CheckCircle2, color: "text-green-400", trend: "+8", up: true },
  { label: "משך פרויקט ממוצע", value: "18 יום", icon: Clock, color: "text-blue-400", trend: "-3", up: true },
  { label: "פרודוקטיביות מהנדסים", value: "92%", icon: Users, color: "text-purple-400", trend: "+4%", up: true },
  { label: "דיוק עיצוב", value: "96.8%", icon: Target, color: "text-cyan-400", trend: "+1.2%", up: true },
  { label: "חיסכון מאופטימיזציה", value: "₪284K", icon: TrendingUp, color: "text-amber-400", trend: "+₪42K", up: true },
  { label: "פטנטים / חידושים", value: "6", icon: Lightbulb, color: "text-pink-400", trend: "+2", up: true },
];

/* ── Tab 1: Productivity ── */
const engineers = [
  { name: "יוסי כהן", hours: 168, output: 14, completion: 93, specialty: "שרטוט ייצור" },
  { name: "שרה לוי", hours: 172, output: 16, completion: 97, specialty: "שרטוט התקנה" },
  { name: "דוד מזרחי", hours: 160, output: 12, completion: 88, specialty: "מדידות שטח" },
  { name: "רחל אברהם", hours: 165, output: 15, completion: 95, specialty: "שרטוט ייצור" },
  { name: "אלון גולדשטיין", hours: 158, output: 11, completion: 84, specialty: "שרטוט התקנה" },
  { name: "מיכל ברק", hours: 175, output: 17, completion: 98, specialty: "מפרטים טכניים" },
  { name: "עומר חדד", hours: 162, output: 13, completion: 91, specialty: "שרטוט ייצור" },
  { name: "נועה פרידמן", hours: 170, output: 15, completion: 94, specialty: "שרטוט התקנה" },
];
const productivityTrend = [
  { month: "נובמבר", hours: 1220, output: 92, completion: 86 },
  { month: "דצמבר", hours: 1245, output: 97, completion: 88 },
  { month: "ינואר", hours: 1260, output: 101, completion: 89 },
  { month: "פברואר", hours: 1280, output: 106, completion: 91 },
  { month: "מרץ", hours: 1300, output: 110, completion: 92 },
  { month: "אפריל", hours: 1330, output: 113, completion: 93 },
];

/* ── Tab 2: Quality ── */
const qualityData = [
  { metric: "שגיאות שנמצאו בבדיקה", review: 28, production: 4, target: "< 5 בייצור" },
  { metric: "סטיות מידות (> 2 מ\"מ)", review: 12, production: 2, target: "< 3 בייצור" },
  { metric: "חוסר התאמה לתקן", review: 6, production: 1, target: "0 בייצור" },
  { metric: "שגיאות חומר/פרופיל", review: 9, production: 1, target: "< 2 בייצור" },
  { metric: "בעיות ממשק בין מערכות", review: 5, production: 2, target: "< 2 בייצור" },
];
const qualityKpis = [
  { label: "שיעור עיבוד חוזר", value: 3.2, target: 2.0, prev: 4.1, unit: "%", lowerBetter: true },
  { label: "תקינות מעבר ראשון", value: 96.8, target: 98, prev: 95.2, unit: "%" },
  { label: "שגיאות לכל 100 שרטוטים", value: 2.4, target: 1.5, prev: 3.1, unit: "", lowerBetter: true },
  { label: "זמן ממוצע לתיקון שגיאה", value: 1.8, target: 1.0, prev: 2.4, unit: "שע'", lowerBetter: true },
];
const qualityTrend = [
  { month: "נובמבר", rework: 5.8, fpy: 92.1, errors: 4.2 },
  { month: "דצמבר", rework: 5.1, fpy: 93.0, errors: 3.8 },
  { month: "ינואר", rework: 4.1, fpy: 95.2, errors: 3.1 },
  { month: "פברואר", rework: 3.8, fpy: 95.8, errors: 2.9 },
  { month: "מרץ", rework: 3.5, fpy: 96.2, errors: 2.6 },
  { month: "אפריל", rework: 3.2, fpy: 96.8, errors: 2.4 },
];

/* ── Tab 3: Innovation ── */
const innovations = [
  { name: "פרופיל תרמי משולב", type: "מוצר חדש", savings: 45000, status: "הושלם", engineer: "מיכל ברק" },
  { name: "מערכת חיתוך אוטומטית V2", type: "שיפור תהליך", savings: 78000, status: "הושלם", engineer: "יוסי כהן" },
  { name: "זיגוג משולש לבידוד אקוסטי", type: "מוצר חדש", savings: 32000, status: "בפיתוח", engineer: "שרה לוי" },
  { name: "אופטימיזציית חיתוך CNC", type: "שיפור תהליך", savings: 56000, status: "הושלם", engineer: "עומר חדד" },
  { name: "פרופיל אלומיניום קל משקל", type: "מוצר חדש", savings: 41000, status: "בפיתוח", engineer: "רחל אברהם" },
  { name: "תבנית הרכבה מודולרית", type: "שיפור תהליך", savings: 32000, status: "הושלם", engineer: "דוד מזרחי" },
];
const innovationSummary = [
  { label: "מוצרים חדשים שפותחו", value: 4, icon: Lightbulb },
  { label: "שיפורים שיושמו", value: 9, icon: Wrench },
  { label: "חיסכון כולל מאופטימיזציה", value: "₪284,000", icon: TrendingUp },
  { label: "פטנטים שהוגשו", value: 2, icon: Award },
];

/* ── Tab 4: Resource Utilization ── */
const workload = [
  { name: "יוסי כהן", allocated: 95, projects: 4, overtime: 12 },
  { name: "שרה לוי", allocated: 88, projects: 3, overtime: 6 },
  { name: "דוד מזרחי", allocated: 72, projects: 2, overtime: 0 },
  { name: "רחל אברהם", allocated: 91, projects: 4, overtime: 8 },
  { name: "אלון גולדשטיין", allocated: 65, projects: 2, overtime: 0 },
  { name: "מיכל ברק", allocated: 98, projects: 5, overtime: 15 },
  { name: "עומר חדד", allocated: 80, projects: 3, overtime: 4 },
  { name: "נועה פרידמן", allocated: 85, projects: 3, overtime: 5 },
];
const skills = [
  { skill: "AutoCAD", level: "מתקדם", count: 8 },
  { skill: "SolidWorks", level: "מתקדם", count: 5 },
  { skill: "חישובי קונסטרוקציה", level: "מתקדם", count: 4 },
  { skill: "BIM / Revit", level: "בינוני", count: 3 },
  { skill: "תכנון CNC", level: "מתקדם", count: 6 },
  { skill: "ניהול פרויקטים", level: "בינוני", count: 4 },
  { skill: "אנליזת FEA", level: "בסיסי", count: 2 },
  { skill: "תקינה ותקנים (ISO)", level: "מתקדם", count: 5 },
];
const trainingNeeds = [
  { topic: "BIM / Revit מתקדם", priority: "גבוהה", engineers: 5, hours: 40 },
  { topic: "אנליזת FEA", priority: "גבוהה", engineers: 6, hours: 32 },
  { topic: "תקן ISO 9001 עדכני", priority: "בינונית", engineers: 8, hours: 16 },
  { topic: "Python לאוטומציה הנדסית", priority: "בינונית", engineers: 4, hours: 24 },
  { topic: "ניהול פרויקטים PMP", priority: "נמוכה", engineers: 3, hours: 48 },
];

const th = "p-3 text-right text-muted-foreground font-medium text-xs";
const td = "p-3 text-sm";

const loadColor = (v: number) =>
  v >= 95 ? "text-red-400" : v >= 85 ? "text-amber-400" : v >= 70 ? "text-green-400" : "text-blue-400";
const loadBg = (v: number) =>
  v >= 95 ? "bg-red-500" : v >= 85 ? "bg-amber-500" : v >= 70 ? "bg-green-500" : "bg-blue-500";
const prioColor = (s: string) =>
  s === "גבוהה" ? "bg-red-500/20 text-red-300" : s === "בינונית" ? "bg-amber-500/20 text-amber-300" : "bg-blue-500/20 text-blue-300";
const skillColor = (s: string) =>
  s === "מתקדם" ? "bg-green-500/20 text-green-300" : s === "בינוני" ? "bg-amber-500/20 text-amber-300" : "bg-blue-500/20 text-blue-300";

export default function EngineeringAnalyticsPage() {
  const [tab, setTab] = useState("productivity");
  const [search, setSearch] = useState("");

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-cyan-400" />
            אנליטיקת מחלקת הנדסה
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            טכנו-כל עוזי | פרודוקטיביות, איכות, חדשנות וניצולת משאבים
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9 w-48 h-9 bg-card/60 border-border text-sm"
            />
          </div>
          <Button variant="outline" size="sm" className="gap-1 h-9">
            <Download className="h-4 w-4" /> ייצוא
          </Button>
          <Badge className="bg-cyan-500/20 text-cyan-400 gap-1"><Calendar className="h-3 w-3" />אפריל 2026</Badge>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className="bg-card/80 border-border hover:border-border/80 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground">{k.label}</p>
                  <p className={`text-lg font-bold font-mono mt-1 ${k.color}`}>{k.value}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {k.up ? <TrendingUp className="h-3 w-3 text-green-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}
                    <span className={`text-[10px] ${k.up ? "text-green-400" : "text-red-400"}`}>{k.trend}</span>
                  </div>
                </div>
                <k.icon className={`h-5 w-5 ${k.color} opacity-60`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-card/60 border border-border">
          <TabsTrigger value="productivity" className="gap-1 text-xs"><Users className="h-3.5 w-3.5" />פרודוקטיביות</TabsTrigger>
          <TabsTrigger value="quality" className="gap-1 text-xs"><Shield className="h-3.5 w-3.5" />איכות</TabsTrigger>
          <TabsTrigger value="innovation" className="gap-1 text-xs"><Lightbulb className="h-3.5 w-3.5" />חדשנות</TabsTrigger>
          <TabsTrigger value="resources" className="gap-1 text-xs"><BrainCircuit className="h-3.5 w-3.5" />ניצולת משאבים</TabsTrigger>
        </TabsList>

        {/* ═══ Tab 1: Productivity ═══ */}
        <TabsContent value="productivity" className="space-y-4 mt-4">
          {/* 6-month trend */}
          <Card className="bg-card/60 border-border">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">מגמת פרודוקטיביות -- 6 חודשים</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border/50">
                    <th className={th}>חודש</th>
                    <th className={th}>שעות צוות</th>
                    <th className={th}>תפוקה (שרטוטים)</th>
                    <th className={th}>% השלמת פרויקטים</th>
                    <th className={th}>מגמה</th>
                  </tr></thead>
                  <tbody>
                    {productivityTrend.map((r, i) => (
                      <tr key={r.month} className="border-b border-border/20 hover:bg-white/5">
                        <td className={`${td} font-medium text-gray-200`}>{r.month}</td>
                        <td className={`${td} text-center font-mono`}>{r.hours.toLocaleString()}</td>
                        <td className={`${td} text-center font-mono text-cyan-400`}>{r.output}</td>
                        <td className={`${td} text-center`}>
                          <div className="flex items-center gap-2 justify-center">
                            <Progress value={r.completion} className="h-2 w-16" />
                            <span className="text-xs text-gray-400">{r.completion}%</span>
                          </div>
                        </td>
                        <td className={`${td} text-center`}>
                          {i > 0 ? (
                            r.output > productivityTrend[i - 1].output
                              ? <TrendingUp className="h-4 w-4 text-green-400 mx-auto" />
                              : r.output < productivityTrend[i - 1].output
                              ? <TrendingDown className="h-4 w-4 text-red-400 mx-auto" />
                              : <Minus className="h-4 w-4 text-gray-400 mx-auto" />
                          ) : <Minus className="h-4 w-4 text-gray-400 mx-auto" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Per-engineer table */}
          <Card className="bg-card/60 border-border">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">ביצועי מהנדסים -- אפריל 2026</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border/50">
                    <th className={th}>מהנדס</th>
                    <th className={th}>התמחות</th>
                    <th className={th}>שעות</th>
                    <th className={th}>תפוקה</th>
                    <th className={th}>% השלמה</th>
                    <th className={th}>סטטוס</th>
                  </tr></thead>
                  <tbody>
                    {engineers.filter(e => !search || e.name.includes(search) || e.specialty.includes(search)).map((e) => {
                      const st = getStatus(e.completion, 95);
                      return (
                        <tr key={e.name} className="border-b border-border/20 hover:bg-white/5">
                          <td className={`${td} font-medium text-gray-200`}>{e.name}</td>
                          <td className={`${td} text-gray-400`}>{e.specialty}</td>
                          <td className={`${td} text-center font-mono`}>{e.hours}</td>
                          <td className={`${td} text-center font-mono text-cyan-400`}>{e.output}</td>
                          <td className={`${td} text-center`}>
                            <div className="flex items-center gap-2 justify-center">
                              <Progress value={e.completion} className="h-2 w-14" />
                              <span className="text-xs text-gray-400">{e.completion}%</span>
                            </div>
                          </td>
                          <td className={`${td} text-center`}>
                            <Badge className={`${statusMap[st].cls} text-xs`}>{statusMap[st].label}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Tab 2: Quality ═══ */}
        <TabsContent value="quality" className="space-y-4 mt-4">
          {/* Quality KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {qualityKpis.map((q) => {
              const st = getStatus(q.value, q.target, !q.lowerBetter);
              const achieve = q.lowerBetter
                ? Math.min((q.target / q.value) * 100, 120)
                : Math.min((q.value / q.target) * 100, 120);
              return (
                <Card key={q.label} className="bg-card/60 border-border">
                  <CardContent className="p-4">
                    <p className="text-[11px] text-muted-foreground">{q.label}</p>
                    <p className="text-xl font-bold font-mono mt-1 text-foreground">
                      {q.value}{q.unit && ` ${q.unit}`}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] text-gray-500">יעד: {q.target}{q.unit && ` ${q.unit}`}</span>
                      <Badge className={`${statusMap[st].cls} text-[10px]`}>{statusMap[st].label}</Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Progress value={Math.min(achieve, 100)} className="h-1.5 flex-1" />
                      <span className="text-[10px] text-gray-400">{achieve.toFixed(0)}%</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Errors: review vs production */}
          <Card className="bg-card/60 border-border">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">שגיאות שנמצאו -- בדיקה מול ייצור</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border/50">
                    <th className={th}>סוג שגיאה</th>
                    <th className={th}>נמצא בבדיקה</th>
                    <th className={th}>נמצא בייצור</th>
                    <th className={th}>יעד</th>
                    <th className={th}>יעילות סינון</th>
                  </tr></thead>
                  <tbody>
                    {qualityData.map((q) => {
                      const filterRate = q.review + q.production > 0
                        ? (q.review / (q.review + q.production)) * 100 : 0;
                      return (
                        <tr key={q.metric} className="border-b border-border/20 hover:bg-white/5">
                          <td className={`${td} font-medium text-gray-200`}>{q.metric}</td>
                          <td className={`${td} text-center font-mono text-green-400`}>{q.review}</td>
                          <td className={`${td} text-center font-mono text-red-400`}>{q.production}</td>
                          <td className={`${td} text-center text-gray-400`}>{q.target}</td>
                          <td className={`${td} text-center`}>
                            <div className="flex items-center gap-2 justify-center">
                              <Progress value={filterRate} className="h-2 w-16" />
                              <span className="text-xs text-gray-400">{filterRate.toFixed(0)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Quality trend */}
          <Card className="bg-card/60 border-border">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">מגמת איכות -- 6 חודשים</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border/50">
                    <th className={th}>חודש</th>
                    <th className={th}>% עיבוד חוזר</th>
                    <th className={th}>% תקינות מעבר ראשון</th>
                    <th className={th}>שגיאות / 100 שרטוטים</th>
                  </tr></thead>
                  <tbody>
                    {qualityTrend.map((r) => (
                      <tr key={r.month} className="border-b border-border/20 hover:bg-white/5">
                        <td className={`${td} font-medium text-gray-200`}>{r.month}</td>
                        <td className={`${td} text-center font-mono ${r.rework <= 3.5 ? "text-green-400" : "text-amber-400"}`}>{pct(r.rework)}</td>
                        <td className={`${td} text-center font-mono ${r.fpy >= 96 ? "text-green-400" : "text-amber-400"}`}>{pct(r.fpy)}</td>
                        <td className={`${td} text-center font-mono ${r.errors <= 2.5 ? "text-green-400" : "text-amber-400"}`}>{r.errors.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Tab 3: Innovation ═══ */}
        <TabsContent value="innovation" className="space-y-4 mt-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {innovationSummary.map((s) => (
              <Card key={s.label} className="bg-card/60 border-border">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <s.icon className="h-5 w-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">{s.label}</p>
                    <p className="text-lg font-bold font-mono text-foreground">{s.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Innovations table */}
          <Card className="bg-card/60 border-border">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">פרויקטי חדשנות ואופטימיזציה</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border/50">
                    <th className={th}>שם הפרויקט</th>
                    <th className={th}>סוג</th>
                    <th className={th}>מהנדס אחראי</th>
                    <th className={th}>חיסכון (₪)</th>
                    <th className={th}>סטטוס</th>
                  </tr></thead>
                  <tbody>
                    {innovations.map((inn) => (
                      <tr key={inn.name} className="border-b border-border/20 hover:bg-white/5">
                        <td className={`${td} font-medium text-gray-200`}>{inn.name}</td>
                        <td className={`${td} text-center`}>
                          <Badge className={inn.type === "מוצר חדש" ? "bg-purple-500/20 text-purple-300" : "bg-blue-500/20 text-blue-300"}>
                            {inn.type}
                          </Badge>
                        </td>
                        <td className={`${td} text-center text-gray-300`}>{inn.engineer}</td>
                        <td className={`${td} text-center font-mono text-green-400`}>₪{inn.savings.toLocaleString()}</td>
                        <td className={`${td} text-center`}>
                          <Badge className={inn.status === "הושלם" ? "bg-green-500/20 text-green-300" : "bg-amber-500/20 text-amber-300"}>
                            {inn.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 pt-3 border-t border-border/30 flex items-center justify-between text-xs text-muted-foreground">
                <span>סה"כ חיסכון שנתי: <span className="text-green-400 font-mono font-bold">₪284,000</span></span>
                <span>יעד שנתי: ₪300,000 | עמידה: <span className="text-amber-400 font-mono">94.7%</span></span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Tab 4: Resource Utilization ═══ */}
        <TabsContent value="resources" className="space-y-4 mt-4">
          {/* Workload distribution */}
          <Card className="bg-card/60 border-border">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">חלוקת עומסים -- מהנדסים</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border/50">
                    <th className={th}>מהנדס</th>
                    <th className={th}>הקצאה</th>
                    <th className={th}>פרויקטים</th>
                    <th className={th}>שעות נוספות</th>
                    <th className={th}>מצב</th>
                  </tr></thead>
                  <tbody>
                    {workload.map((w) => (
                      <tr key={w.name} className="border-b border-border/20 hover:bg-white/5">
                        <td className={`${td} font-medium text-gray-200`}>{w.name}</td>
                        <td className={`${td}`}>
                          <div className="flex items-center gap-2">
                            <Progress value={w.allocated} className={`h-2 w-20`} />
                            <span className={`text-xs font-mono ${loadColor(w.allocated)}`}>{w.allocated}%</span>
                          </div>
                        </td>
                        <td className={`${td} text-center font-mono`}>{w.projects}</td>
                        <td className={`${td} text-center font-mono ${w.overtime > 10 ? "text-red-400" : w.overtime > 5 ? "text-amber-400" : "text-gray-400"}`}>
                          {w.overtime > 0 ? `${w.overtime} שע'` : "—"}
                        </td>
                        <td className={`${td} text-center`}>
                          <Badge className={
                            w.allocated >= 95 ? "bg-red-500/20 text-red-300"
                            : w.allocated >= 85 ? "bg-amber-500/20 text-amber-300"
                            : "bg-green-500/20 text-green-300"
                          }>
                            {w.allocated >= 95 ? "עומס יתר" : w.allocated >= 85 ? "עומס גבוה" : "תקין"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 pt-3 border-t border-border/30 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-400" /> עומס יתר: 2 מהנדסים</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-amber-400" /> ממוצע הקצאה: 84.3%</span>
                <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-400" /> שעות נוספות חודשיות: 50 שע'</span>
              </div>
            </CardContent>
          </Card>

          {/* Skills matrix + Training needs side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-card/60 border-border">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">מטריצת מיומנויות</h3>
                <div className="space-y-2">
                  {skills.map((s) => (
                    <div key={s.skill} className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">{s.skill}</span>
                      <div className="flex items-center gap-2">
                        <Badge className={`${skillColor(s.level)} text-[10px]`}>{s.level}</Badge>
                        <span className="text-xs text-gray-500 font-mono w-16 text-left">{s.count} מהנדסים</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/60 border-border">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">צרכי הדרכה</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border/50">
                      <th className={th}>נושא</th>
                      <th className={th}>עדיפות</th>
                      <th className={th}>משתתפים</th>
                      <th className={th}>שעות</th>
                    </tr></thead>
                    <tbody>
                      {trainingNeeds.map((t) => (
                        <tr key={t.topic} className="border-b border-border/20 hover:bg-white/5">
                          <td className={`${td} text-gray-200`}>{t.topic}</td>
                          <td className={`${td} text-center`}>
                            <Badge className={`${prioColor(t.priority)} text-[10px]`}>{t.priority}</Badge>
                          </td>
                          <td className={`${td} text-center font-mono`}>{t.engineers}</td>
                          <td className={`${td} text-center font-mono text-gray-400`}>{t.hours}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
