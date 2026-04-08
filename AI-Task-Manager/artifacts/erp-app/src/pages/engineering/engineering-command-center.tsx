import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Cog, FileText, ClipboardCheck, GitBranch, ShieldCheck, AlertTriangle,
  Users, FlaskConical, Pencil, Search, TrendingUp, TrendingDown,
  Clock, Target, BarChart3, Layers, CheckCircle, ArrowUpRight
} from "lucide-react";

const kpis = {
  activeProjects: 12,
  openDrawings: 34,
  pendingReviews: 8,
  ecnOpen: 5,
  standardsCompliance: 96.4,
  overdueTasks: 3,
  engineersUtilization: 87,
  prototypeTests: 4,
};

const topProjects = [
  { id: "ENG-1001", name: "פרופיל אלומיניום דגם Ultra-X", client: "קבוצת אלון", phase: "עיצוב מפורט", progress: 72, priority: "critical", deadline: "2026-04-18", engineer: "יוסי כהן" },
  { id: "ENG-1002", name: "מערכת חלונות תרמית 3G", client: "אמות השקעות", phase: "בדיקות אב-טיפוס", progress: 55, priority: "high", deadline: "2026-04-22", engineer: "דנה לוי" },
  { id: "ENG-1003", name: "דלת הזזה חשמלית Pro", client: "שיכון ובינוי", phase: "תכנון מוקדם", progress: 30, priority: "high", deadline: "2026-05-01", engineer: "אורן מזרחי" },
  { id: "ENG-1004", name: "מעקה זכוכית מחוסמת 12mm", client: 'נדל"ן פלוס', phase: "סקירה הנדסית", progress: 88, priority: "medium", deadline: "2026-04-12", engineer: "רונית שמש" },
  { id: "ENG-1005", name: "פרגולת אלומיניום מתקפלת", client: "גינות ירוקות", phase: "עיצוב מפורט", progress: 45, priority: "medium", deadline: "2026-04-28", engineer: "עמית בר" },
];

const recentDrawings = [
  { id: "DWG-4501", name: "חתך פרופיל Ultra-X — גרסה 3.2", project: "ENG-1001", author: "יוסי כהן", date: "2026-04-08", status: "review" },
  { id: "DWG-4502", name: "פרט חיבור תרמי — צומת פינתי", project: "ENG-1002", author: "דנה לוי", date: "2026-04-07", status: "approved" },
  { id: "DWG-4503", name: "מנגנון הזזה — תרשים הרכבה", project: "ENG-1003", author: "אורן מזרחי", date: "2026-04-07", status: "draft" },
  { id: "DWG-4504", name: "מעקה זכוכית — פרט עיגון רצפה", project: "ENG-1004", author: "רונית שמש", date: "2026-04-06", status: "review" },
  { id: "DWG-4505", name: "פרגולה — שרטוט כללי 1:50", project: "ENG-1005", author: "עמית בר", date: "2026-04-06", status: "draft" },
  { id: "DWG-4506", name: "חתך דלת חשמלית — מסילה עליונה", project: "ENG-1003", author: "אורן מזרחי", date: "2026-04-05", status: "approved" },
];

const urgentTasks = [
  { task: "עדכון מפרט חומרים Ultra-X לפי ECN-078", project: "ENG-1001", assignee: "יוסי כהן", due: "2026-04-09", status: "overdue" },
  { task: "בדיקת עמידות רוח — דוח סופי", project: "ENG-1002", assignee: "דנה לוי", due: "2026-04-10", status: "urgent" },
  { task: "אישור שרטוט מעקה לפני ייצור", project: "ENG-1004", assignee: "רונית שמש", due: "2026-04-10", status: "urgent" },
  { task: "סקירת תאימות לתקן ישראלי 1142", project: "ENG-1003", assignee: "אורן מזרחי", due: "2026-04-08", status: "overdue" },
  { task: "חישוב עומסים מחדש — פרגולה", project: "ENG-1005", assignee: "עמית בר", due: "2026-04-11", status: "pending" },
];

const allProjects = [
  { id: "ENG-1001", name: "פרופיל אלומיניום דגם Ultra-X", phase: "עיצוב מפורט", progress: 72, priority: "critical", deadline: "2026-04-18", engineer: "יוסי כהן", drawings: 8, ecn: 2 },
  { id: "ENG-1002", name: "מערכת חלונות תרמית 3G", phase: "בדיקות אב-טיפוס", progress: 55, priority: "high", deadline: "2026-04-22", engineer: "דנה לוי", drawings: 5, ecn: 1 },
  { id: "ENG-1003", name: "דלת הזזה חשמלית Pro", phase: "תכנון מוקדם", progress: 30, priority: "high", deadline: "2026-05-01", engineer: "אורן מזרחי", drawings: 3, ecn: 0 },
  { id: "ENG-1004", name: "מעקה זכוכית מחוסמת 12mm", phase: "סקירה הנדסית", progress: 88, priority: "medium", deadline: "2026-04-12", engineer: "רונית שמש", drawings: 4, ecn: 1 },
  { id: "ENG-1005", name: "פרגולת אלומיניום מתקפלת", phase: "עיצוב מפורט", progress: 45, priority: "medium", deadline: "2026-04-28", engineer: "עמית בר", drawings: 2, ecn: 0 },
  { id: "ENG-1006", name: "ויטרינה חנות דגם S-Glass", phase: "ייצור ניסיוני", progress: 92, priority: "low", deadline: "2026-04-14", engineer: "יוסי כהן", drawings: 6, ecn: 0 },
  { id: "ENG-1007", name: "מחיצת משרד אקוסטית", phase: "תכנון מוקדם", progress: 15, priority: "medium", deadline: "2026-05-10", engineer: "דנה לוי", drawings: 1, ecn: 0 },
  { id: "ENG-1008", name: "גגון כניסה מעוצב — פלדה+זכוכית", phase: "עיצוב מפורט", progress: 60, priority: "high", deadline: "2026-04-25", engineer: "טל אביב", drawings: 3, ecn: 1 },
  { id: "ENG-1009", name: "מערכת תריסים חשמלית", phase: "בדיקות אב-טיפוס", progress: 68, priority: "medium", deadline: "2026-04-20", engineer: "שירה דוד", drawings: 4, ecn: 0 },
  { id: "ENG-1010", name: "חיפוי אלומיניום לבניין מגורים", phase: "סקירה הנדסית", progress: 40, priority: "high", deadline: "2026-05-05", engineer: "אורן מזרחי", drawings: 2, ecn: 0 },
  { id: "ENG-1011", name: "דלת כניסה מאובטחת RC3", phase: "תכנון מוקדם", progress: 20, priority: "critical", deadline: "2026-05-15", engineer: "טל אביב", drawings: 1, ecn: 0 },
  { id: "ENG-1012", name: "חלון צליל-בידוד 42dB", phase: "עיצוב מפורט", progress: 50, priority: "medium", deadline: "2026-05-08", engineer: "שירה דוד", drawings: 3, ecn: 0 },
];

const engineers = [
  { name: "יוסי כהן", role: "מהנדס בכיר — אלומיניום", projects: 2, tasks: 7, utilization: 95, status: "overloaded", completedMonth: 12 },
  { name: "דנה לוי", role: "מהנדסת — תרמיקה וחלונות", projects: 2, tasks: 5, utilization: 88, status: "active", completedMonth: 9 },
  { name: "אורן מזרחי", role: "מהנדס — מנגנונים ופלדה", projects: 2, tasks: 6, utilization: 92, status: "active", completedMonth: 11 },
  { name: "רונית שמש", role: "מהנדסת — זכוכית ומעקות", projects: 1, tasks: 4, utilization: 78, status: "active", completedMonth: 8 },
  { name: "עמית בר", role: "מהנדס זוטר — מבנים", projects: 1, tasks: 3, utilization: 72, status: "available", completedMonth: 6 },
  { name: "טל אביב", role: "מהנדס — פלדה וביטחון", projects: 2, tasks: 5, utilization: 90, status: "active", completedMonth: 10 },
  { name: "שירה דוד", role: "מהנדסת — אקוסטיקה ובידוד", projects: 2, tasks: 4, utilization: 85, status: "active", completedMonth: 7 },
  { name: "נועם אלון", role: "מהנדס — CAD ושרטוט", projects: 1, tasks: 6, utilization: 82, status: "active", completedMonth: 14 },
];

const monthlyMetrics = [
  { month: "ינואר", drawingsCompleted: 28, ecnClosed: 4, reviewCycles: 2.1, onTimeDelivery: 91, defectsFound: 3, standardsScore: 94 },
  { month: "פברואר", drawingsCompleted: 32, ecnClosed: 6, reviewCycles: 1.8, onTimeDelivery: 93, defectsFound: 2, standardsScore: 95 },
  { month: "מרץ", drawingsCompleted: 35, ecnClosed: 5, reviewCycles: 1.6, onTimeDelivery: 95, defectsFound: 1, standardsScore: 96 },
  { month: "אפריל*", drawingsCompleted: 14, ecnClosed: 2, reviewCycles: 1.5, onTimeDelivery: 97, defectsFound: 0, standardsScore: 96.4 },
];

const phaseColor = (phase: string) => {
  if (phase === "תכנון מוקדם") return "bg-slate-100 text-slate-700";
  if (phase === "עיצוב מפורט") return "bg-blue-100 text-blue-700";
  if (phase === "סקירה הנדסית") return "bg-purple-100 text-purple-700";
  if (phase === "בדיקות אב-טיפוס") return "bg-amber-100 text-amber-700";
  if (phase === "ייצור ניסיוני") return "bg-emerald-100 text-emerald-700";
  return "bg-gray-100 text-gray-700";
};

const priorityBadge = (p: string) => {
  if (p === "critical") return <Badge className="bg-red-600 text-white text-[10px]">קריטי</Badge>;
  if (p === "high") return <Badge className="bg-orange-500 text-white text-[10px]">גבוה</Badge>;
  if (p === "medium") return <Badge className="bg-blue-500 text-white text-[10px]">בינוני</Badge>;
  return <Badge variant="secondary" className="text-[10px]">נמוך</Badge>;
};

const statusBadge = (s: string) => {
  if (s === "overdue") return <Badge className="bg-red-600 text-white text-[10px]">באיחור</Badge>;
  if (s === "urgent") return <Badge className="bg-orange-500 text-white text-[10px]">דחוף</Badge>;
  if (s === "pending") return <Badge className="bg-blue-500 text-white text-[10px]">ממתין</Badge>;
  if (s === "review") return <Badge className="bg-purple-500 text-white text-[10px]">בבדיקה</Badge>;
  if (s === "approved") return <Badge className="bg-emerald-600 text-white text-[10px]">מאושר</Badge>;
  if (s === "draft") return <Badge variant="secondary" className="text-[10px]">טיוטה</Badge>;
  return <Badge variant="outline" className="text-[10px]">{s}</Badge>;
};

const utilizationColor = (u: number) => {
  if (u >= 90) return "text-red-600";
  if (u >= 75) return "text-amber-600";
  return "text-emerald-600";
};

const utilizationBg = (u: number) => {
  if (u >= 90) return "bg-red-500";
  if (u >= 75) return "bg-amber-500";
  return "bg-emerald-500";
};

export default function EngineeringCommandCenter() {
  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Cog className="h-7 w-7 text-primary" /> מרכז פיקוד הנדסה
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            פרויקטים | שרטוטים | ECN | תקנים | משאבים | אב-טיפוס
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="חיפוש פרויקט / שרטוט..." className="pr-8 w-56 text-sm" />
          </div>
          <Button size="sm" className="gap-1"><Pencil className="h-3.5 w-3.5" /> פרויקט חדש</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-8 gap-2">
        {[
          { label: "פרויקטים פעילים", value: String(kpis.activeProjects), icon: Layers, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "שרטוטים פתוחים", value: String(kpis.openDrawings), icon: FileText, color: "text-indigo-600", bg: "bg-indigo-50" },
          { label: "ממתינים לסקירה", value: String(kpis.pendingReviews), icon: ClipboardCheck, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "ECN פתוחים", value: String(kpis.ecnOpen), icon: GitBranch, color: "text-orange-600", bg: "bg-orange-50" },
          { label: "עמידה בתקנים", value: `${kpis.standardsCompliance}%`, icon: ShieldCheck, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "משימות באיחור", value: String(kpis.overdueTasks), icon: AlertTriangle, color: kpis.overdueTasks > 0 ? "text-red-600" : "text-emerald-600", bg: kpis.overdueTasks > 0 ? "bg-red-50" : "bg-emerald-50" },
          { label: "ניצולת מהנדסים", value: `${kpis.engineersUtilization}%`, icon: Users, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "בדיקות אב-טיפוס", value: String(kpis.prototypeTests), icon: FlaskConical, color: "text-cyan-600", bg: "bg-cyan-50" },
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

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="grid grid-cols-4 w-full max-w-lg">
          <TabsTrigger value="overview" className="text-xs gap-1"><BarChart3 className="h-3.5 w-3.5" /> סקירה</TabsTrigger>
          <TabsTrigger value="projects" className="text-xs gap-1"><Layers className="h-3.5 w-3.5" /> פרויקטים</TabsTrigger>
          <TabsTrigger value="resources" className="text-xs gap-1"><Users className="h-3.5 w-3.5" /> הקצאת משאבים</TabsTrigger>
          <TabsTrigger value="performance" className="text-xs gap-1"><Target className="h-3.5 w-3.5" /> ביצועים</TabsTrigger>
        </TabsList>

        {/* ===== OVERVIEW TAB ===== */}
        <TabsContent value="overview" className="space-y-4 mt-3">
          <div className="grid grid-cols-3 gap-4">
            {/* Top Projects */}
            <Card className="col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Layers className="h-4 w-4" /> פרויקטים מובילים</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {topProjects.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg border bg-muted/30 hover:bg-muted/60 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">{p.id}</span>
                        {priorityBadge(p.priority)}
                        <Badge className={`${phaseColor(p.phase)} text-[10px]`}>{p.phase}</Badge>
                      </div>
                      <p className="text-sm font-medium truncate mt-0.5">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground">{p.client} | {p.engineer} | עד {p.deadline}</p>
                    </div>
                    <div className="w-24 text-center">
                      <p className="text-xs font-bold">{p.progress}%</p>
                      <Progress value={p.progress} className="h-1.5 mt-1" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Urgent Tasks */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" /> משימות דחופות</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {urgentTasks.map((t, i) => (
                  <div key={i} className="p-2 rounded-lg border bg-muted/30 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-muted-foreground">{t.project}</span>
                      {statusBadge(t.status)}
                    </div>
                    <p className="text-xs font-medium leading-snug">{t.task}</p>
                    <p className="text-[10px] text-muted-foreground">{t.assignee} | עד {t.due}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Recent Drawings */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> שרטוטים אחרונים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {recentDrawings.map((d) => (
                  <div key={d.id} className="p-2.5 rounded-lg border bg-muted/20 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-muted-foreground">{d.id}</span>
                      {statusBadge(d.status)}
                    </div>
                    <p className="text-xs font-medium leading-snug">{d.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{d.author} | {d.project} | {d.date}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== PROJECTS TAB ===== */}
        <TabsContent value="projects" className="space-y-4 mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Layers className="h-4 w-4" /> כל הפרויקטים הפעילים ({allProjects.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {allProjects.map((p) => (
                  <div key={p.id} className="p-3 rounded-lg border bg-muted/20 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">{p.id}</span>
                        {priorityBadge(p.priority)}
                      </div>
                      <Badge className={`${phaseColor(p.phase)} text-[10px]`}>{p.phase}</Badge>
                    </div>
                    <p className="text-sm font-semibold mt-1">{p.name}</p>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-[11px] text-muted-foreground">
                        <Users className="inline h-3 w-3 ml-0.5" /> {p.engineer}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        <Clock className="inline h-3 w-3 ml-0.5" /> עד {p.deadline}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex-1">
                        <Progress value={p.progress} className="h-1.5" />
                      </div>
                      <span className="text-xs font-bold w-9 text-left">{p.progress}%</span>
                    </div>
                    <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground">
                      <span><FileText className="inline h-3 w-3 ml-0.5" /> {p.drawings} שרטוטים</span>
                      {p.ecn > 0 && <span className="text-orange-600"><GitBranch className="inline h-3 w-3 ml-0.5" /> {p.ecn} ECN</span>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== RESOURCES TAB ===== */}
        <TabsContent value="resources" className="space-y-4 mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> הקצאת משאבים — צוות הנדסה ({engineers.length} מהנדסים)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {engineers.map((e, i) => (
                  <div key={i} className="p-3 rounded-lg border bg-muted/20 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <p className="text-sm font-semibold">{e.name}</p>
                        <p className="text-[11px] text-muted-foreground">{e.role}</p>
                      </div>
                      <Badge className={
                        e.status === "overloaded" ? "bg-red-100 text-red-700 text-[10px]" :
                        e.status === "available" ? "bg-emerald-100 text-emerald-700 text-[10px]" :
                        "bg-blue-100 text-blue-700 text-[10px]"
                      }>
                        {e.status === "overloaded" ? "עומס יתר" : e.status === "available" ? "פנוי" : "פעיל"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                      <div className="p-1.5 rounded bg-muted/50">
                        <p className="text-[10px] text-muted-foreground">פרויקטים</p>
                        <p className="text-sm font-bold">{e.projects}</p>
                      </div>
                      <div className="p-1.5 rounded bg-muted/50">
                        <p className="text-[10px] text-muted-foreground">משימות</p>
                        <p className="text-sm font-bold">{e.tasks}</p>
                      </div>
                      <div className="p-1.5 rounded bg-muted/50">
                        <p className="text-[10px] text-muted-foreground">הושלמו החודש</p>
                        <p className="text-sm font-bold">{e.completedMonth}</p>
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-[10px] mb-0.5">
                        <span className="text-muted-foreground">ניצולת</span>
                        <span className={`font-bold ${utilizationColor(e.utilization)}`}>{e.utilization}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full ${utilizationBg(e.utilization)} transition-all`} style={{ width: `${e.utilization}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Summary Bar */}
          <div className="grid grid-cols-4 gap-3">
            <Card className="bg-blue-50/40 border-0 shadow-sm">
              <CardContent className="pt-3 pb-2 text-center">
                <p className="text-[10px] text-muted-foreground">ממוצע ניצולת</p>
                <p className="text-lg font-bold text-blue-600">{Math.round(engineers.reduce((s, e) => s + e.utilization, 0) / engineers.length)}%</p>
              </CardContent>
            </Card>
            <Card className="bg-red-50/40 border-0 shadow-sm">
              <CardContent className="pt-3 pb-2 text-center">
                <p className="text-[10px] text-muted-foreground">עומס יתר</p>
                <p className="text-lg font-bold text-red-600">{engineers.filter(e => e.status === "overloaded").length}</p>
              </CardContent>
            </Card>
            <Card className="bg-emerald-50/40 border-0 shadow-sm">
              <CardContent className="pt-3 pb-2 text-center">
                <p className="text-[10px] text-muted-foreground">זמינים</p>
                <p className="text-lg font-bold text-emerald-600">{engineers.filter(e => e.status === "available").length}</p>
              </CardContent>
            </Card>
            <Card className="bg-indigo-50/40 border-0 shadow-sm">
              <CardContent className="pt-3 pb-2 text-center">
                <p className="text-[10px] text-muted-foreground">סה"כ משימות</p>
                <p className="text-lg font-bold text-indigo-600">{engineers.reduce((s, e) => s + e.tasks, 0)}</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===== PERFORMANCE TAB ===== */}
        <TabsContent value="performance" className="space-y-4 mt-3">
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "שרטוטים הושלמו (אפריל)", value: "14", trend: "+12%", up: true, icon: FileText, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "ECN נסגרו (אפריל)", value: "2", trend: "לפי יעד", up: true, icon: GitBranch, color: "text-orange-600", bg: "bg-orange-50" },
              { label: "מחזורי סקירה (ממוצע)", value: "1.5", trend: "-29%", up: true, icon: ClipboardCheck, color: "text-purple-600", bg: "bg-purple-50" },
              { label: "אספקה בזמן", value: "97%", trend: "+2%", up: true, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50" },
            ].map((m, i) => {
              const Icon = m.icon;
              return (
                <Card key={i} className={`${m.bg}/40 border-0 shadow-sm`}>
                  <CardContent className="pt-3 pb-2 text-center">
                    <Icon className={`h-5 w-5 mx-auto ${m.color} mb-1`} />
                    <p className="text-[10px] text-muted-foreground">{m.label}</p>
                    <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
                    <div className="flex items-center justify-center gap-1 mt-0.5">
                      {m.up ? <TrendingUp className="h-3 w-3 text-emerald-500" /> : <TrendingDown className="h-3 w-3 text-red-500" />}
                      <span className={`text-[10px] ${m.up ? "text-emerald-600" : "text-red-600"}`}>{m.trend}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" /> מדדים חודשיים — 2026</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs">
                      <th className="text-right py-2 font-medium">חודש</th>
                      <th className="text-center py-2 font-medium">שרטוטים שהושלמו</th>
                      <th className="text-center py-2 font-medium">ECN נסגרו</th>
                      <th className="text-center py-2 font-medium">מחזורי סקירה</th>
                      <th className="text-center py-2 font-medium">אספקה בזמן</th>
                      <th className="text-center py-2 font-medium">ליקויים שנמצאו</th>
                      <th className="text-center py-2 font-medium">ציון תקנים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyMetrics.map((m, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2 font-medium">{m.month}</td>
                        <td className="py-2 text-center font-mono">{m.drawingsCompleted}</td>
                        <td className="py-2 text-center font-mono">{m.ecnClosed}</td>
                        <td className="py-2 text-center font-mono">{m.reviewCycles}</td>
                        <td className="py-2 text-center">
                          <span className={m.onTimeDelivery >= 95 ? "text-emerald-600 font-bold" : "text-amber-600 font-bold"}>{m.onTimeDelivery}%</span>
                        </td>
                        <td className="py-2 text-center">
                          <span className={m.defectsFound === 0 ? "text-emerald-600 font-bold" : "text-amber-600 font-bold"}>{m.defectsFound}</span>
                        </td>
                        <td className="py-2 text-center">
                          <span className={m.standardsScore >= 96 ? "text-emerald-600 font-bold" : "text-blue-600 font-bold"}>{m.standardsScore}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Trend Summary */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-0 shadow-sm bg-emerald-50/40">
              <CardContent className="pt-3 pb-2">
                <div className="flex items-center gap-2 mb-1">
                  <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                  <p className="text-xs font-semibold text-emerald-700">מגמות חיוביות</p>
                </div>
                <ul className="text-[11px] text-muted-foreground space-y-0.5 mr-6">
                  <li>מחזורי סקירה ירדו ב-29% מתחילת השנה</li>
                  <li>אספקה בזמן עלתה מ-91% ל-97%</li>
                  <li>ליקויי תכנון ירדו לאפס באפריל</li>
                </ul>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-amber-50/40">
              <CardContent className="pt-3 pb-2">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <p className="text-xs font-semibold text-amber-700">נקודות לשיפור</p>
                </div>
                <ul className="text-[11px] text-muted-foreground space-y-0.5 mr-6">
                  <li>ניצולת מהנדס בכיר (יוסי) חורגת מ-90%</li>
                  <li>5 ECN פתוחים — יעד: מקסימום 3</li>
                  <li>3 משימות באיחור דורשות טיפול מיידי</li>
                </ul>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-blue-50/40">
              <CardContent className="pt-3 pb-2">
                <div className="flex items-center gap-2 mb-1">
                  <Target className="h-4 w-4 text-blue-600" />
                  <p className="text-xs font-semibold text-blue-700">יעדים לאפריל</p>
                </div>
                <ul className="text-[11px] text-muted-foreground space-y-0.5 mr-6">
                  <li>השלמת 36 שרטוטים (נותרו 22)</li>
                  <li>סגירת כל 5 ה-ECN הפתוחים</li>
                  <li>שמירה על ציון תקנים מעל 96%</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}