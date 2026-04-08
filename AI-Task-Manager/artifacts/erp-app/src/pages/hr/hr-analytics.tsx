import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  BarChart3, Users, TrendingDown, TrendingUp, DollarSign, Clock,
  CalendarDays, GraduationCap, Star, UserPlus, AlertTriangle,
  CheckCircle, Building2, ArrowUpRight, ArrowDownRight
} from "lucide-react";

const fmtCur = (v: number) => `₪${v.toLocaleString("he-IL")}`;

/* ────── KPI Data ────── */
const kpiData = [
  { label: 'סה"כ עובדים', value: "48", sub: "+3 מתחילת שנה", icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
  { label: "שיעור תחלופה", value: "8.5%", sub: "ירידה מ-11.2%", icon: TrendingDown, color: "text-amber-600", bg: "bg-amber-50" },
  { label: 'עלות כ"א ל-עובד', value: "₪18,500", sub: "+2.3% YoY", icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
  { label: "ימי היעדרות ממוצע", value: "3.2", sub: "ימים/חודש", icon: CalendarDays, color: "text-red-600", bg: "bg-red-50" },
  { label: "שעות נוספות", value: "12%", sub: "מסה\"כ שעות", icon: Clock, color: "text-purple-600", bg: "bg-purple-50" },
  { label: "שביעות רצון", value: "3.9/5", sub: "סקר רבעוני", icon: Star, color: "text-yellow-600", bg: "bg-yellow-50" },
  { label: "זמן גיוס ממוצע", value: "28 ימים", sub: "שיפור מ-35", icon: UserPlus, color: "text-indigo-600", bg: "bg-indigo-50" },
  { label: "השלמת הדרכות", value: "82%", sub: "יעד: 90%", icon: GraduationCap, color: "text-teal-600", bg: "bg-teal-50" },
];

/* ────── Headcount Trend (12 months) ────── */
const headcountTrend = [
  { month: "מאי 25", total: 44, hires: 1, exits: 0, net: 1 },
  { month: "יוני 25", total: 44, hires: 0, exits: 0, net: 0 },
  { month: "יולי 25", total: 45, hires: 2, exits: 1, net: 1 },
  { month: "אוג׳ 25", total: 45, hires: 1, exits: 1, net: 0 },
  { month: "ספט׳ 25", total: 46, hires: 2, exits: 1, net: 1 },
  { month: "אוק׳ 25", total: 46, hires: 0, exits: 0, net: 0 },
  { month: "נוב׳ 25", total: 45, hires: 0, exits: 1, net: -1 },
  { month: "דצמ׳ 25", total: 45, hires: 1, exits: 1, net: 0 },
  { month: "ינו׳ 26", total: 46, hires: 2, exits: 1, net: 1 },
  { month: "פבר׳ 26", total: 47, hires: 1, exits: 0, net: 1 },
  { month: "מרץ 26", total: 48, hires: 2, exits: 1, net: 1 },
  { month: "אפר׳ 26", total: 48, hires: 0, exits: 0, net: 0 },
];

/* ────── Turnover Analysis ────── */
const turnoverByDept = [
  { dept: "ייצור", rate: 6.5, exits: 2, headcount: 18 },
  { dept: "מכירות", rate: 14.3, exits: 1, headcount: 7 },
  { dept: "הנדסה", rate: 0, exits: 0, headcount: 6 },
  { dept: "אדמיניסטרציה", rate: 0, exits: 0, headcount: 4 },
  { dept: "רכש ולוגיסטיקה", rate: 25.0, exits: 1, headcount: 4 },
  { dept: "שירות לקוחות", rate: 33.3, exits: 1, headcount: 3 },
  { dept: "פיננסים", rate: 0, exits: 0, headcount: 3 },
  { dept: "IT", rate: 0, exits: 0, headcount: 3 },
];

const turnoverByTenure = [
  { tenure: "0-1 שנה", count: 2, pct: 40 },
  { tenure: "1-3 שנים", count: 2, pct: 40 },
  { tenure: "3-5 שנים", count: 1, pct: 20 },
  { tenure: "5+ שנים", count: 0, pct: 0 },
];

const turnoverByReason = [
  { reason: "הזדמנות חיצונית", count: 2, pct: 40 },
  { reason: "שחיקה / עומס", count: 1, pct: 20 },
  { reason: "חוסר קידום", count: 1, pct: 20 },
  { reason: "מעבר דירה", count: 1, pct: 20 },
];

/* ────── Cost Analysis ────── */
const costByDept = [
  { dept: "ייצור", headcount: 18, totalCost: 306000, avgSalary: 14200, overtimeCost: 28000, benefits: 45000 },
  { dept: "מכירות", headcount: 7, totalCost: 147000, avgSalary: 16800, overtimeCost: 8500, benefits: 18000 },
  { dept: "הנדסה", headcount: 6, totalCost: 156000, avgSalary: 22500, overtimeCost: 12000, benefits: 16500 },
  { dept: "אדמיניסטרציה", headcount: 4, totalCost: 68000, avgSalary: 13500, overtimeCost: 2000, benefits: 12000 },
  { dept: "רכש ולוגיסטיקה", headcount: 4, totalCost: 64000, avgSalary: 13000, overtimeCost: 4500, benefits: 10000 },
  { dept: "שירות לקוחות", headcount: 3, totalCost: 42000, avgSalary: 11500, overtimeCost: 3000, benefits: 7500 },
  { dept: "פיננסים", headcount: 3, totalCost: 57000, avgSalary: 16000, overtimeCost: 1500, benefits: 8000 },
  { dept: "IT", headcount: 3, totalCost: 60000, avgSalary: 17000, overtimeCost: 5000, benefits: 8000 },
];

/* ────── Attendance Patterns ────── */
const absenceByMonth = [
  { month: "ינו׳", days: 3.8 }, { month: "פבר׳", days: 3.5 }, { month: "מרץ", days: 2.9 },
  { month: "אפר׳", days: 3.2 }, { month: "מאי", days: 2.4 }, { month: "יוני", days: 2.1 },
  { month: "יולי", days: 2.8 }, { month: "אוג׳", days: 4.5 }, { month: "ספט׳", days: 3.6 },
  { month: "אוק׳", days: 3.1 }, { month: "נוב׳", days: 2.7 }, { month: "דצמ׳", days: 3.4 },
];

const absenceByDept = [
  { dept: "ייצור", avgDays: 3.8, sickDays: 2.1, vacationDays: 1.2, otherDays: 0.5 },
  { dept: "מכירות", avgDays: 2.9, sickDays: 1.4, vacationDays: 1.1, otherDays: 0.4 },
  { dept: "הנדסה", avgDays: 2.2, sickDays: 0.8, vacationDays: 1.0, otherDays: 0.4 },
  { dept: "אדמיניסטרציה", avgDays: 2.5, sickDays: 1.0, vacationDays: 1.2, otherDays: 0.3 },
  { dept: "רכש ולוגיסטיקה", avgDays: 3.1, sickDays: 1.5, vacationDays: 1.2, otherDays: 0.4 },
  { dept: "שירות לקוחות", avgDays: 4.2, sickDays: 2.0, vacationDays: 1.5, otherDays: 0.7 },
  { dept: "פיננסים", avgDays: 1.8, sickDays: 0.6, vacationDays: 0.9, otherDays: 0.3 },
  { dept: "IT", avgDays: 2.0, sickDays: 0.7, vacationDays: 0.8, otherDays: 0.5 },
];

const absenceByDay = [
  { day: "ראשון", avgAbsent: 4.8 }, { day: "שני", avgAbsent: 3.2 },
  { day: "שלישי", avgAbsent: 2.5 }, { day: "רביעי", avgAbsent: 2.3 },
  { day: "חמישי", avgAbsent: 3.9 },
];

/* ────── Training Completion ────── */
const trainingByDept = [
  { dept: "ייצור", completion: 78, enrolled: 18, completed: 14 },
  { dept: "מכירות", completion: 86, enrolled: 7, completed: 6 },
  { dept: "הנדסה", completion: 92, enrolled: 6, completed: 5 },
  { dept: "אדמיניסטרציה", completion: 100, enrolled: 4, completed: 4 },
  { dept: "רכש ולוגיסטיקה", completion: 75, enrolled: 4, completed: 3 },
  { dept: "שירות לקוחות", completion: 67, enrolled: 3, completed: 2 },
  { dept: "פיננסים", completion: 100, enrolled: 3, completed: 3 },
  { dept: "IT", completion: 100, enrolled: 3, completed: 3 },
];

const trainingByTopic = [
  { topic: "בטיחות בעבודה", completion: 95, participants: 48, hours: 4 },
  { topic: "הפעלת מכונות CNC", completion: 72, participants: 12, hours: 16 },
  { topic: "ניהול איכות ISO", completion: 88, participants: 20, hours: 8 },
  { topic: "שירות לקוחות", completion: 80, participants: 10, hours: 6 },
  { topic: "אקסל מתקדם", completion: 65, participants: 15, hours: 12 },
  { topic: "בריאות תעסוקתית", completion: 90, participants: 48, hours: 2 },
  { topic: "מנהיגות וניהול", completion: 83, participants: 8, hours: 20 },
  { topic: "סייבר ואבטחת מידע", completion: 77, participants: 30, hours: 4 },
];

/* ────── Mini Bar Chart ────── */
function MiniBarChart({ data, valueKey, labelKey, maxVal, color = "bg-blue-500" }: {
  data: any[]; valueKey: string; labelKey: string; maxVal?: number; color?: string;
}) {
  const max = maxVal || Math.max(...data.map(d => d[valueKey]));
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-16 text-muted-foreground text-left truncate">{d[labelKey]}</span>
          <div className="flex-1 bg-muted/30 rounded-full h-4 relative overflow-hidden">
            <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${(d[valueKey] / max) * 100}%` }} />
          </div>
          <span className="w-10 text-left font-medium">{typeof d[valueKey] === "number" && d[valueKey] % 1 !== 0 ? d[valueKey].toFixed(1) : d[valueKey]}</span>
        </div>
      ))}
    </div>
  );
}

export default function HRAnalyticsPage() {
  const [activeTab, setActiveTab] = useState("headcount");

  const totalLaborCost = costByDept.reduce((s, d) => s + d.totalCost, 0);
  const totalHeadcount = costByDept.reduce((s, d) => s + d.headcount, 0);

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-primary" /> אנליטיקת משאבי אנוש
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">טכנו-כל עוזי | כ"א · תחלופה · עלויות · נוכחות · הדרכות · מגמות</p>
        </div>
        <Badge variant="outline" className="text-xs">עדכון: אפריל 2026</Badge>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-8 gap-2">
        {kpiData.map((k, i) => (
          <Card key={i} className="border-0 shadow-sm">
            <CardContent className="p-3 text-center">
              <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${k.bg} mb-1.5`}>
                <k.icon className={`h-4 w-4 ${k.color}`} />
              </div>
              <div className="text-lg font-bold">{k.value}</div>
              <div className="text-[10px] text-muted-foreground leading-tight">{k.label}</div>
              <div className="text-[9px] text-muted-foreground/70 mt-0.5">{k.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="headcount">כ"א</TabsTrigger>
          <TabsTrigger value="turnover">תחלופה</TabsTrigger>
          <TabsTrigger value="costs">עלויות</TabsTrigger>
          <TabsTrigger value="attendance">נוכחות</TabsTrigger>
          <TabsTrigger value="training">הדרכות</TabsTrigger>
          <TabsTrigger value="trends">מגמות</TabsTrigger>
        </TabsList>

        {/* ═══════ TAB: Headcount ═══════ */}
        <TabsContent value="headcount" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> מגמת כ"א - 12 חודשים אחרונים</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">חודש</TableHead>
                    <TableHead className="text-center">סה"כ עובדים</TableHead>
                    <TableHead className="text-center">קליטות</TableHead>
                    <TableHead className="text-center">עזיבות</TableHead>
                    <TableHead className="text-center">שינוי נטו</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {headcountTrend.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{row.month}</TableCell>
                      <TableCell className="text-center">{row.total}</TableCell>
                      <TableCell className="text-center">
                        {row.hires > 0 && <Badge className="bg-emerald-500/20 text-emerald-600 text-xs">+{row.hires}</Badge>}
                        {row.hires === 0 && <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.exits > 0 && <Badge className="bg-red-500/20 text-red-600 text-xs">-{row.exits}</Badge>}
                        {row.exits === 0 && <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.net > 0 && <span className="text-emerald-600 flex items-center justify-center gap-0.5"><ArrowUpRight className="h-3 w-3" />+{row.net}</span>}
                        {row.net < 0 && <span className="text-red-600 flex items-center justify-center gap-0.5"><ArrowDownRight className="h-3 w-3" />{row.net}</span>}
                        {row.net === 0 && <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex gap-6 mt-3 text-xs text-muted-foreground border-t pt-3">
                <span>סה"כ קליטות (12 חודשים): <strong className="text-emerald-600">12</strong></span>
                <span>סה"כ עזיבות: <strong className="text-red-600">6</strong></span>
                <span>צמיחה נטו: <strong className="text-blue-600">+6 (+13.6%)</strong></span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════ TAB: Turnover ═══════ */}
        <TabsContent value="turnover" className="space-y-4 mt-4">
          <div className="grid grid-cols-3 gap-4">
            {/* By Department */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">תחלופה לפי מחלקה</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right text-xs">מחלקה</TableHead>
                      <TableHead className="text-center text-xs">עובדים</TableHead>
                      <TableHead className="text-center text-xs">עזיבות</TableHead>
                      <TableHead className="text-center text-xs">שיעור</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {turnoverByDept.map((d, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-medium">{d.dept}</TableCell>
                        <TableCell className="text-center text-xs">{d.headcount}</TableCell>
                        <TableCell className="text-center text-xs">{d.exits}</TableCell>
                        <TableCell className="text-center text-xs">
                          <Badge className={d.rate > 15 ? "bg-red-500/20 text-red-600" : d.rate > 8 ? "bg-amber-500/20 text-amber-600" : "bg-emerald-500/20 text-emerald-600"}>
                            {d.rate}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* By Tenure */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">תחלופה לפי ותק</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {turnoverByTenure.map((t, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1">
                      <span>{t.tenure}</span>
                      <span className="font-medium">{t.count} עזיבות ({t.pct}%)</span>
                    </div>
                    <Progress value={t.pct} className="h-2" />
                  </div>
                ))}
                <div className="text-xs text-muted-foreground border-t pt-2 mt-2">
                  <AlertTriangle className="h-3 w-3 inline ml-1 text-amber-500" />
                  80% מהעזיבות בטווח 0-3 שנות ותק
                </div>
              </CardContent>
            </Card>

            {/* By Reason */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">סיבות עזיבה</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {turnoverByReason.map((r, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1">
                      <span>{r.reason}</span>
                      <span className="font-medium">{r.count} ({r.pct}%)</span>
                    </div>
                    <Progress value={r.pct} className="h-2" />
                  </div>
                ))}
                <div className="text-xs text-muted-foreground border-t pt-2 mt-2">
                  סה"כ עזיבות ב-12 חודשים אחרונים: <strong>5</strong>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════ TAB: Costs ═══════ */}
        <TabsContent value="costs" className="space-y-4 mt-4">
          <div className="grid grid-cols-4 gap-3 mb-4">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 text-center">
                <div className="text-xs text-muted-foreground">עלות כ"א חודשית</div>
                <div className="text-xl font-bold text-emerald-600">{fmtCur(totalLaborCost)}</div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 text-center">
                <div className="text-xs text-muted-foreground">שכר ממוצע</div>
                <div className="text-xl font-bold">{fmtCur(Math.round(totalLaborCost / totalHeadcount))}</div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 text-center">
                <div className="text-xs text-muted-foreground">עלות שעות נוספות</div>
                <div className="text-xl font-bold text-purple-600">{fmtCur(costByDept.reduce((s, d) => s + d.overtimeCost, 0))}</div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 text-center">
                <div className="text-xs text-muted-foreground">הטבות ונלוות</div>
                <div className="text-xl font-bold text-blue-600">{fmtCur(costByDept.reduce((s, d) => s + d.benefits, 0))}</div>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4" /> עלות כ"א לפי מחלקה</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מחלקה</TableHead>
                    <TableHead className="text-center">עובדים</TableHead>
                    <TableHead className="text-center">עלות כוללת</TableHead>
                    <TableHead className="text-center">שכר ממוצע</TableHead>
                    <TableHead className="text-center">שעות נוספות</TableHead>
                    <TableHead className="text-center">הטבות</TableHead>
                    <TableHead className="text-center">% מתקציב</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costByDept.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{d.dept}</TableCell>
                      <TableCell className="text-center">{d.headcount}</TableCell>
                      <TableCell className="text-center font-medium">{fmtCur(d.totalCost)}</TableCell>
                      <TableCell className="text-center">{fmtCur(d.avgSalary)}</TableCell>
                      <TableCell className="text-center">{fmtCur(d.overtimeCost)}</TableCell>
                      <TableCell className="text-center">{fmtCur(d.benefits)}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center gap-1">
                          <Progress value={(d.totalCost / totalLaborCost) * 100} className="h-2 flex-1" />
                          <span className="text-xs w-10 text-left">{((d.totalCost / totalLaborCost) * 100).toFixed(1)}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════ TAB: Attendance ═══════ */}
        <TabsContent value="attendance" className="space-y-4 mt-4">
          <div className="grid grid-cols-3 gap-4">
            {/* By Month */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> היעדרויות לפי חודש</CardTitle></CardHeader>
              <CardContent>
                <MiniBarChart data={absenceByMonth} valueKey="days" labelKey="month" color="bg-red-400" />
              </CardContent>
            </Card>

            {/* By Department */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> היעדרויות לפי מחלקה</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right text-xs">מחלקה</TableHead>
                      <TableHead className="text-center text-xs">ממוצע</TableHead>
                      <TableHead className="text-center text-xs">מחלה</TableHead>
                      <TableHead className="text-center text-xs">חופשה</TableHead>
                      <TableHead className="text-center text-xs">אחר</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {absenceByDept.map((d, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-medium">{d.dept}</TableCell>
                        <TableCell className="text-center text-xs">
                          <Badge className={d.avgDays > 3.5 ? "bg-red-500/20 text-red-600" : d.avgDays > 2.5 ? "bg-amber-500/20 text-amber-600" : "bg-emerald-500/20 text-emerald-600"}>
                            {d.avgDays}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-xs">{d.sickDays}</TableCell>
                        <TableCell className="text-center text-xs">{d.vacationDays}</TableCell>
                        <TableCell className="text-center text-xs">{d.otherDays}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* By Day of Week */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> היעדרויות לפי יום</CardTitle></CardHeader>
              <CardContent>
                <MiniBarChart data={absenceByDay} valueKey="avgAbsent" labelKey="day" color="bg-amber-400" />
                <div className="text-xs text-muted-foreground border-t pt-2 mt-3">
                  <AlertTriangle className="h-3 w-3 inline ml-1 text-amber-500" />
                  ימי ראשון וחמישי מראים שיעור היעדרות גבוה יותר
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════ TAB: Training ═══════ */}
        <TabsContent value="training" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            {/* By Department */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><GraduationCap className="h-3.5 w-3.5" /> השלמת הדרכות לפי מחלקה</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right text-xs">מחלקה</TableHead>
                      <TableHead className="text-center text-xs">רשומים</TableHead>
                      <TableHead className="text-center text-xs">סיימו</TableHead>
                      <TableHead className="text-center text-xs">אחוז השלמה</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trainingByDept.map((d, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-medium">{d.dept}</TableCell>
                        <TableCell className="text-center text-xs">{d.enrolled}</TableCell>
                        <TableCell className="text-center text-xs">{d.completed}</TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1.5">
                            <Progress value={d.completion} className="h-2 flex-1" />
                            <span className={`text-xs w-10 text-left font-medium ${d.completion >= 90 ? "text-emerald-600" : d.completion >= 75 ? "text-amber-600" : "text-red-600"}`}>
                              {d.completion}%
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* By Topic */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" /> השלמה לפי נושא</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {trainingByTopic.map((t, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1">
                      <span>{t.topic}</span>
                      <span className="text-muted-foreground">{t.participants} משתתפים · {t.hours} שעות</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Progress value={t.completion} className="h-2 flex-1" />
                      <span className={`text-xs w-10 text-left font-medium ${t.completion >= 90 ? "text-emerald-600" : t.completion >= 75 ? "text-amber-600" : "text-red-600"}`}>
                        {t.completion}%
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════ TAB: Trends ═══════ */}
        <TabsContent value="trends" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> מגמות עיקריות</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "צמיחת כ\"א", value: "+13.6%", detail: "מ-42 ל-48 עובדים ב-12 חודשים", trend: "up", color: "text-emerald-600" },
                  { label: "ירידה בתחלופה", value: "-24%", detail: "מ-11.2% ל-8.5% שנתי", trend: "up", color: "text-emerald-600" },
                  { label: "עלייה בעלות כ\"א", value: "+8.2%", detail: "עלות ממוצעת לעובד עלתה ל-₪18,500", trend: "down", color: "text-amber-600" },
                  { label: "שיפור בנוכחות", value: "+3.1%", detail: "שיעור נוכחות עלה ל-94.2%", trend: "up", color: "text-emerald-600" },
                  { label: "שביעות רצון", value: "+0.4", detail: "מ-3.5 ל-3.9 מתוך 5", trend: "up", color: "text-emerald-600" },
                  { label: "זמן גיוס", value: "-20%", detail: "מ-35 ימים ל-28 ימים בממוצע", trend: "up", color: "text-emerald-600" },
                ].map((t, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20">
                    {t.trend === "up"
                      ? <ArrowUpRight className={`h-4 w-4 ${t.color}`} />
                      : <ArrowDownRight className={`h-4 w-4 ${t.color}`} />}
                    <div className="flex-1">
                      <div className="text-xs font-medium">{t.label}</div>
                      <div className="text-[10px] text-muted-foreground">{t.detail}</div>
                    </div>
                    <span className={`text-sm font-bold ${t.color}`}>{t.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> נקודות לתשומת לב</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[
                  { severity: "high", title: "תחלופה גבוהה בשירות לקוחות", detail: "33.3% — גבוה פי 4 מהממוצע. נדרשת בדיקת שחיקה ותנאים", badge: "דחוף" },
                  { severity: "high", title: "השלמת הדרכות נמוכה בשירות לקוחות", detail: "67% בלבד — הנמוכה מכל המחלקות. עשויה לקשר לתחלופה", badge: "דחוף" },
                  { severity: "medium", title: "עלות שעות נוספות גבוהה בהנדסה", detail: "₪12,000/חודש — הגבוהה ביותר. לשקול גיוס נוסף", badge: "בינוני" },
                  { severity: "medium", title: "היעדרויות גבוהות בימי ראשון", detail: "4.8 היעדרויות ביום ממוצע — 109% מעל ימי שלישי", badge: "בינוני" },
                  { severity: "low", title: "יעד הדרכות לא מושג", detail: "82% מתוך יעד 90%. פער של 8% נקודות", badge: "נמוך" },
                  { severity: "low", title: "80% עזיבות בוותק 0-3 שנים", detail: "נדרש חיזוק תוכנית קליטה ומנטורינג לעובדים חדשים", badge: "נמוך" },
                ].map((a, i) => (
                  <div key={i} className={`p-2 rounded-lg border-r-2 ${a.severity === "high" ? "border-r-red-500 bg-red-500/5" : a.severity === "medium" ? "border-r-amber-500 bg-amber-500/5" : "border-r-blue-500 bg-blue-500/5"}`}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium">{a.title}</span>
                      <Badge className={`text-[9px] px-1 py-0 ${a.severity === "high" ? "bg-red-500/20 text-red-600" : a.severity === "medium" ? "bg-amber-500/20 text-amber-600" : "bg-blue-500/20 text-blue-600"}`}>
                        {a.badge}
                      </Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground">{a.detail}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}