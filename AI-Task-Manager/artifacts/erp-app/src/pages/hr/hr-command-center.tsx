import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Users, DollarSign, TrendingUp, TrendingDown, Clock, CheckCircle,
  AlertTriangle, Calendar, Award, Target, BarChart3, UserCheck,
  UserX, Briefcase, GraduationCap, Heart, Shield, Star
} from "lucide-react";

const kpis = {
  totalEmployees: 68,
  activeEmployees: 65,
  onLeave: 3,
  departments: 8,
  avgTenureYears: 4.2,
  turnoverRate: 8.5,
  attendanceRate: 94.2,
  avgSalary: 14500,
  totalPayroll: 985000,
  openPositions: 4,
  pendingReviews: 12,
  trainingHoursAvg: 18,
  satisfactionScore: 78,
  costPerEmployee: 18200,
};

const departments = [
  { name: "ייצור", headcount: 22, budget: 380000, actual: 365000, attendance: 96, turnover: 5.2, satisfaction: 72, openPositions: 1 },
  { name: "מכירות", headcount: 8, budget: 145000, actual: 152000, attendance: 92, turnover: 12.5, satisfaction: 82, openPositions: 1 },
  { name: "הנדסה", headcount: 12, budget: 210000, actual: 198000, attendance: 95, turnover: 4.1, satisfaction: 85, openPositions: 2 },
  { name: "אדמיניסטרציה", headcount: 6, budget: 85000, actual: 82000, attendance: 97, turnover: 2.0, satisfaction: 80, openPositions: 0 },
  { name: "רכש ולוגיסטיקה", headcount: 5, budget: 72000, actual: 70000, attendance: 93, turnover: 8.0, satisfaction: 75, openPositions: 0 },
  { name: "פיננסים", headcount: 4, budget: 68000, actual: 65000, attendance: 98, turnover: 0, satisfaction: 88, openPositions: 0 },
  { name: "IT", headcount: 3, budget: 52000, actual: 48000, attendance: 95, turnover: 0, satisfaction: 90, openPositions: 0 },
  { name: "שירות לקוחות", headcount: 5, budget: 65000, actual: 68000, attendance: 89, turnover: 18.0, satisfaction: 65, openPositions: 0 },
];

const recentEvents = [
  { date: "2026-04-08", type: "absence", employee: "רונית לוי", detail: "יום מחלה", department: "מכירות" },
  { date: "2026-04-08", type: "late", employee: "יוסי אברהם", detail: "איחור 45 דקות", department: "מכירות" },
  { date: "2026-04-07", type: "leave_request", employee: "דני כהן", detail: "חופשה 14-18/04", department: "מכירות" },
  { date: "2026-04-07", type: "review_due", employee: "שרה גולד", detail: "הערכת ביצועים רבעונית", department: "מכירות" },
  { date: "2026-04-06", type: "training", employee: "צוות הנדסה", detail: "הכשרה - מערכות חדשות", department: "הנדסה" },
  { date: "2026-04-05", type: "hire", employee: "מיכאל ברק", detail: "עובד חדש - מנהל פרויקטים", department: "הנדסה" },
  { date: "2026-04-04", type: "termination_risk", employee: "אלון דוד", detail: "ביצועים ירודים - שיחת אזהרה 3", department: "מכירות" },
];

const topPerformers = [
  { name: "דני כהן", dept: "מכירות", score: 95, revenue: 1896000, attendance: 99, tenure: 5.2 },
  { name: "נועה שמיר", dept: "הנדסה", score: 92, revenue: 0, attendance: 98, tenure: 3.8 },
  { name: "אור ברק", dept: "ייצור", score: 88, revenue: 0, attendance: 100, tenure: 6.1 },
];

const atRiskEmployees = [
  { name: "אלון דוד", dept: "מכירות", risk: "termination", reason: "ROI שלילי, 0 סגירות, burn rate 62%", tenure: 1.2 },
  { name: "שרה גולד", dept: "מכירות", risk: "probation", reason: "burn rate 40%, conversion 1.8%", tenure: 0.8 },
  { name: "רינת כץ", dept: "שירות לקוחות", risk: "flight_risk", reason: "שביעות רצון 45, ביקשה מידע על תפקיד אחר", tenure: 2.5 },
];

const fmt = (v: number) => v >= 1000000 ? `₪${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `₪${(v / 1000).toFixed(0)}K` : `₪${v.toLocaleString()}`;

const eventIcon = (type: string) => {
  switch (type) {
    case "absence": return <UserX className="h-3.5 w-3.5 text-red-500" />;
    case "late": return <Clock className="h-3.5 w-3.5 text-amber-500" />;
    case "leave_request": return <Calendar className="h-3.5 w-3.5 text-blue-500" />;
    case "review_due": return <Star className="h-3.5 w-3.5 text-purple-500" />;
    case "training": return <GraduationCap className="h-3.5 w-3.5 text-indigo-500" />;
    case "hire": return <UserCheck className="h-3.5 w-3.5 text-emerald-500" />;
    case "termination_risk": return <AlertTriangle className="h-3.5 w-3.5 text-red-600" />;
    default: return <Users className="h-3.5 w-3.5" />;
  }
};

export default function HRCommandCenter() {
  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-7 w-7 text-primary" /> HR Command Center
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">עובדים | נוכחות | שכר | ביצועים | גיוס | סיכוני עזיבה</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-8 gap-2">
        {[
          { label: "עובדים", value: `${kpis.activeEmployees}/${kpis.totalEmployees}`, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "שכר חודשי", value: fmt(kpis.totalPayroll), icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "נוכחות", value: `${kpis.attendanceRate}%`, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Turnover", value: `${kpis.turnoverRate}%`, icon: TrendingDown, color: kpis.turnoverRate > 10 ? "text-red-600" : "text-amber-600", bg: kpis.turnoverRate > 10 ? "bg-red-50" : "bg-amber-50" },
          { label: "משרות פתוחות", value: String(kpis.openPositions), icon: Briefcase, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "הערכות ממתינות", value: String(kpis.pendingReviews), icon: Star, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "שביעות רצון", value: `${kpis.satisfactionScore}/100`, icon: Heart, color: kpis.satisfactionScore >= 75 ? "text-emerald-600" : "text-amber-600", bg: kpis.satisfactionScore >= 75 ? "bg-emerald-50" : "bg-amber-50" },
          { label: "עלות לעובד", value: fmt(kpis.costPerEmployee), icon: Target, color: "text-indigo-600", bg: "bg-indigo-50" },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.bg}/40 border-0 shadow-sm`}>
              <CardContent className="pt-2 pb-1.5 text-center px-1">
                <Icon className={`h-3.5 w-3.5 mx-auto ${kpi.color} mb-0.5`} />
                <p className="text-[8px] text-muted-foreground leading-tight">{kpi.label}</p>
                <p className={`text-sm font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="departments">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="departments" className="text-xs gap-1"><BarChart3 className="h-3.5 w-3.5" /> מחלקות</TabsTrigger>
          <TabsTrigger value="events" className="text-xs gap-1"><Calendar className="h-3.5 w-3.5" /> אירועים</TabsTrigger>
          <TabsTrigger value="top" className="text-xs gap-1"><Award className="h-3.5 w-3.5" /> מצטיינים</TabsTrigger>
          <TabsTrigger value="risk" className="text-xs gap-1"><AlertTriangle className="h-3.5 w-3.5" /> סיכונים</TabsTrigger>
          <TabsTrigger value="payroll" className="text-xs gap-1"><DollarSign className="h-3.5 w-3.5" /> שכר</TabsTrigger>
        </TabsList>

        {/* Departments */}
        <TabsContent value="departments">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">מחלקה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">עובדים</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תקציב</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">בפועל</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סטייה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">נוכחות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">Turnover</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">שביעות רצון</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פתוחות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departments.sort((a, b) => b.headcount - a.headcount).map((dept, i) => {
                    const variance = ((dept.actual - dept.budget) / dept.budget * 100);
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium text-xs">{dept.name}</TableCell>
                        <TableCell className="font-mono text-xs">{dept.headcount}</TableCell>
                        <TableCell className="font-mono text-[10px] text-muted-foreground">{fmt(dept.budget)}</TableCell>
                        <TableCell className="font-mono text-[10px]">{fmt(dept.actual)}</TableCell>
                        <TableCell>
                          <Badge className={`font-mono text-[8px] ${variance <= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                            {variance > 0 ? "+" : ""}{variance.toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell className={`font-mono text-[10px] ${dept.attendance >= 95 ? "text-emerald-600" : dept.attendance >= 90 ? "text-amber-600" : "text-red-600"}`}>
                          {dept.attendance}%
                        </TableCell>
                        <TableCell className={`font-mono text-[10px] ${dept.turnover > 10 ? "text-red-600 font-bold" : ""}`}>
                          {dept.turnover}%
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Progress value={dept.satisfaction} className={`h-1.5 w-12 ${dept.satisfaction < 70 ? "[&>div]:bg-red-500" : ""}`} />
                            <span className="text-[9px] font-mono">{dept.satisfaction}</span>
                          </div>
                        </TableCell>
                        <TableCell className={`font-mono text-xs ${dept.openPositions > 0 ? "text-purple-600 font-bold" : ""}`}>
                          {dept.openPositions || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Events */}
        <TabsContent value="events">
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-2">
                {recentEvents.map((ev, i) => (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border ${ev.type === "termination_risk" ? "border-red-200 bg-red-50/30" : "border-border"}`}>
                    {eventIcon(ev.type)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{ev.employee}</span>
                        <Badge variant="outline" className="text-[8px]">{ev.department}</Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{ev.detail}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{ev.date}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Top Performers */}
        <TabsContent value="top">
          <Card>
            <CardContent className="pt-4">
              {topPerformers.map((tp, i) => (
                <div key={i} className="flex items-center gap-4 py-3 border-b last:border-0">
                  <div className="text-2xl font-bold text-amber-500 w-8">#{i + 1}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold">{tp.name}</p>
                      <Badge variant="outline" className="text-[9px]">{tp.dept}</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Score: {tp.score} | נוכחות: {tp.attendance}% | ותק: {tp.tenure} שנים
                      {tp.revenue > 0 && ` | הכנסות: ${fmt(tp.revenue)}`}
                    </p>
                  </div>
                  <Badge className="bg-emerald-100 text-emerald-700">{tp.score}/100</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* At Risk */}
        <TabsContent value="risk">
          <Card>
            <CardContent className="pt-4">
              {atRiskEmployees.map((emp, i) => (
                <div key={i} className="flex items-center gap-4 p-3 rounded-lg border border-red-200 bg-red-50/20 mb-2">
                  <AlertTriangle className="h-6 w-6 text-red-500 shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold">{emp.name}</p>
                      <Badge variant="outline" className="text-[9px]">{emp.dept}</Badge>
                      <Badge className={`text-[8px] ${emp.risk === "termination" ? "bg-red-100 text-red-700" : emp.risk === "probation" ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700"}`}>
                        {emp.risk === "termination" ? "🚨 סיום העסקה" : emp.risk === "probation" ? "⚠️ ניסיון" : "📉 סיכון עזיבה"}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-red-600 mt-0.5">{emp.reason}</p>
                    <p className="text-[9px] text-muted-foreground">ותק: {emp.tenure} שנים</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payroll */}
        <TabsContent value="payroll">
          <div className="grid grid-cols-3 gap-4">
            <Card className="border-blue-200">
              <CardContent className="pt-5 text-center">
                <DollarSign className="h-8 w-8 mx-auto text-blue-600 mb-2" />
                <p className="text-sm text-blue-700">שכר חודשי כולל</p>
                <p className="text-3xl font-bold font-mono text-blue-800">{fmt(kpis.totalPayroll)}</p>
                <p className="text-xs text-blue-600">{kpis.activeEmployees} עובדים</p>
              </CardContent>
            </Card>
            <Card className="border-emerald-200">
              <CardContent className="pt-5 text-center">
                <Target className="h-8 w-8 mx-auto text-emerald-600 mb-2" />
                <p className="text-sm text-emerald-700">שכר ממוצע</p>
                <p className="text-3xl font-bold font-mono text-emerald-800">{fmt(kpis.avgSalary)}</p>
              </CardContent>
            </Card>
            <Card className="border-purple-200">
              <CardContent className="pt-5 text-center">
                <BarChart3 className="h-8 w-8 mx-auto text-purple-600 mb-2" />
                <p className="text-sm text-purple-700">עלות לעובד (כוללת)</p>
                <p className="text-3xl font-bold font-mono text-purple-800">{fmt(kpis.costPerEmployee)}</p>
                <p className="text-xs text-purple-600">כולל שכר + נלוות + תקורות</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
