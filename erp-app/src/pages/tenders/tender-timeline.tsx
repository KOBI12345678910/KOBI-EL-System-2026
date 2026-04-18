import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  FileText, Clock, AlertTriangle, Timer, CheckCircle2, CalendarDays,
  ListChecks, Route, Search, ChevronLeft, ChevronRight, Flag, User,
  ArrowUpCircle, Shield, Target
} from "lucide-react";

const FALLBACK_MILESTONE_LABELS = ["פרסום", "סיור קבלנים", "שאלות הבהרה", "הגשה", "הערכה", "הכרזה"];

const FALLBACK_TENDERS = [
  { id: "TND-101", name: "חיפוי אלומיניום - בניין עירייה", client: "עיריית חיפה", milestones: ["2026-03-01","2026-03-10","2026-03-18","2026-04-15","2026-04-25","2026-05-10"], current: 3, progress: 58 },
  { id: "TND-102", name: "חלונות זכוכית - פרויקט מגדלים", client: "אזורים", milestones: ["2026-03-05","2026-03-12","2026-03-20","2026-04-10","2026-04-20","2026-05-01"], current: 4, progress: 72 },
  { id: "TND-103", name: "מעקות מתכת - קניון הגליל", client: "ביג מרכזי מסחר", milestones: ["2026-03-10","2026-03-15","2026-03-25","2026-04-12","2026-04-30","2026-05-15"], current: 3, progress: 50 },
  { id: "TND-104", name: "דלתות אלומיניום - בית חולים", client: "שערי צדק", milestones: ["2026-02-20","2026-03-01","2026-03-10","2026-04-08","2026-04-18","2026-05-05"], current: 3, progress: 55 },
  { id: "TND-105", name: "פסי אלומיניום - רכבת קלה", client: "נת\"ע", milestones: ["2026-03-15","2026-03-22","2026-04-01","2026-04-20","2026-05-05","2026-05-20"], current: 2, progress: 35 },
  { id: "TND-106", name: "ויטרינות זכוכית - משרדי הייטק", client: "מליסרון", milestones: ["2026-03-20","2026-03-28","2026-04-05","2026-04-22","2026-05-08","2026-05-25"], current: 2, progress: 30 },
  { id: "TND-107", name: "גגות מתכת - מפעל ייצור", client: "תעשיות כימיות", milestones: ["2026-02-15","2026-02-25","2026-03-05","2026-03-25","2026-04-10","2026-04-28"], current: 5, progress: 85 },
  { id: "TND-108", name: "מחיצות אלומיניום - בנק", client: "בנק הפועלים", milestones: ["2026-03-08","2026-03-16","2026-03-24","2026-04-14","2026-04-28","2026-05-12"], current: 3, progress: 48 },
];

const FALLBACK_TASKS = [
  { id: 1, task: "איסוף מסמכי כשירות - TND-101", assignee: "רונית כהן", deadline: "2026-04-05", status: "done" },
  { id: 2, task: "סיור באתר - TND-101", assignee: "אבי לוי", deadline: "2026-03-10", status: "done" },
  { id: 3, task: "חישוב תמחיר עבודה - TND-101", assignee: "דני שרון", deadline: "2026-04-10", status: "progress" },
  { id: 4, task: "כתיבת הצעה טכנית - TND-101", assignee: "מיכל דוד", deadline: "2026-04-12", status: "progress" },
  { id: 5, task: "סקירה משפטית - TND-102", assignee: "עו\"ד ברק", deadline: "2026-04-08", status: "overdue" },
  { id: 6, task: "חתימת מנכ\"ל - TND-102", assignee: "עוזי אל", deadline: "2026-04-09", status: "pending" },
  { id: 7, task: "איסוף אישורי בטיחות - TND-103", assignee: "יוסי מזרחי", deadline: "2026-04-06", status: "done" },
  { id: 8, task: "סיור באתר - TND-103", assignee: "אבי לוי", deadline: "2026-03-15", status: "done" },
  { id: 9, task: "חישוב תמחיר חומרים - TND-103", assignee: "דני שרון", deadline: "2026-04-09", status: "progress" },
  { id: 10, task: "הכנת כתב כמויות - TND-104", assignee: "שירה נחום", deadline: "2026-04-07", status: "done" },
  { id: 11, task: "כתיבת הצעה כספית - TND-104", assignee: "דני שרון", deadline: "2026-04-06", status: "overdue" },
  { id: 12, task: "סקירה הנדסית - TND-105", assignee: "מהנדס ראשי", deadline: "2026-04-14", status: "pending" },
  { id: 13, task: "איסוף תעודות ISO - TND-105", assignee: "רונית כהן", deadline: "2026-04-11", status: "progress" },
  { id: 14, task: "סיור באתר - TND-106", assignee: "אבי לוי", deadline: "2026-03-28", status: "done" },
  { id: 15, task: "כתיבת הצעה טכנית - TND-106", assignee: "מיכל דוד", deadline: "2026-04-18", status: "pending" },
  { id: 16, task: "חישוב תמחיר שינוע - TND-107", assignee: "דני שרון", deadline: "2026-03-20", status: "done" },
  { id: 17, task: "ביקורת איכות סופית - TND-107", assignee: "יוסי מזרחי", deadline: "2026-04-08", status: "progress" },
  { id: 18, task: "סקירה משפטית - TND-108", assignee: "עו\"ד ברק", deadline: "2026-04-12", status: "pending" },
  { id: 19, task: "איסוף ערבויות בנקאיות - TND-108", assignee: "רונית כהן", deadline: "2026-04-13", status: "pending" },
  { id: 20, task: "חתימה והגשה פיזית - TND-108", assignee: "עוזי אל", deadline: "2026-04-14", status: "pending" },
];

const FALLBACK_CRITICAL_TENDERS = [
  { id: "TND-102", name: "חלונות זכוכית - פרויקט מגדלים", deadline: "2026-04-10", daysLeft: 2, risk: "high", reason: "סקירה משפטית באיחור - חסרה חתימת מנכ\"ל", mitigation: "העברת סקירה לעו\"ד חלופי, תיאום חתימה דחוף" },
  { id: "TND-104", name: "דלתות אלומיניום - בית חולים", deadline: "2026-04-08", daysLeft: 0, risk: "critical", reason: "הצעה כספית לא הושלמה, דד-ליין היום", mitigation: "גיוס צוות נוסף לסיום מיידי, הגשה ידנית עד 16:00" },
  { id: "TND-103", name: "מעקות מתכת - קניון הגליל", deadline: "2026-04-12", daysLeft: 4, risk: "medium", reason: "חישוב תמחיר בעיכוב, ממתין לאישור ספק", mitigation: "שימוש במחירון קודם + מרווח ביטחון 5%" },
  { id: "TND-108", name: "מחיצות אלומיניום - בנק", deadline: "2026-04-14", daysLeft: 6, risk: "medium", reason: "3 משימות תלויות בשרשרת - סקירה, ערבות, הגשה", mitigation: "עבודה מקבילה על ערבות בנקאית, תיאום מול הבנק" },
];

const statusBadge = (s: string) => {
  switch (s) {
    case "done": return <Badge className="bg-green-500/20 text-green-700">הושלם</Badge>;
    case "progress": return <Badge className="bg-blue-500/20 text-blue-700">בביצוע</Badge>;
    case "overdue": return <Badge className="bg-red-500/20 text-red-700">באיחור</Badge>;
    case "pending": return <Badge className="bg-gray-500/20 text-gray-600">ממתין</Badge>;
    default: return null;
  }
};

const riskBadge = (r: string) => {
  switch (r) {
    case "critical": return <Badge className="bg-red-600 text-white">קריטי</Badge>;
    case "high": return <Badge className="bg-orange-500/20 text-orange-700">גבוה</Badge>;
    case "medium": return <Badge className="bg-yellow-500/20 text-yellow-700">בינוני</Badge>;
    default: return null;
  }
};

const FALLBACK_CALENDAR_EVENTS = [
  { day: 8, label: "דד-ליין TND-104", type: "deadline" },
  { day: 10, label: "הגשה TND-102", type: "deadline" },
  { day: 10, label: "סיור TND-105", type: "milestone" },
  { day: 12, label: "הגשה TND-103", type: "deadline" },
  { day: 14, label: "הגשה TND-108", type: "deadline" },
  { day: 15, label: "הגשה TND-101", type: "deadline" },
  { day: 18, label: "הערכה TND-104", type: "milestone" },
  { day: 20, label: "הגשה TND-105", type: "deadline" },
  { day: 22, label: "הגשה TND-106", type: "deadline" },
  { day: 25, label: "הערכה TND-101", type: "milestone" },
  { day: 28, label: "הערכה TND-108", type: "milestone" },
  { day: 30, label: "הערכה TND-103", type: "milestone" },
];

const daysInMonth = 30;
const monthName = "אפריל 2026";
const FALLBACK_DAY_NAMES = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];
const startDay = 3; // April 2026 starts on Wednesday (index 3)

export default function TenderTimelinePage() {
  const { data: milestoneLabels = FALLBACK_MILESTONE_LABELS } = useQuery({
    queryKey: ["tenders-milestone-labels"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-timeline/milestone-labels");
      if (!res.ok) return FALLBACK_MILESTONE_LABELS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_MILESTONE_LABELS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: tenders = FALLBACK_TENDERS } = useQuery({
    queryKey: ["tenders-tenders"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-timeline/tenders");
      if (!res.ok) return FALLBACK_TENDERS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_TENDERS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: tasks = FALLBACK_TASKS } = useQuery({
    queryKey: ["tenders-tasks"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-timeline/tasks");
      if (!res.ok) return FALLBACK_TASKS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_TASKS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: criticalTenders = FALLBACK_CRITICAL_TENDERS } = useQuery({
    queryKey: ["tenders-critical-tenders"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-timeline/critical-tenders");
      if (!res.ok) return FALLBACK_CRITICAL_TENDERS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_CRITICAL_TENDERS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: calendarEvents = FALLBACK_CALENDAR_EVENTS } = useQuery({
    queryKey: ["tenders-calendar-events"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-timeline/calendar-events");
      if (!res.ok) return FALLBACK_CALENDAR_EVENTS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_CALENDAR_EVENTS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: dayNames = FALLBACK_DAY_NAMES } = useQuery({
    queryKey: ["tenders-day-names"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-timeline/day-names");
      if (!res.ok) return FALLBACK_DAY_NAMES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_DAY_NAMES;
    },
    staleTime: 30_000,
    retry: 1,
  });


  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("timeline");

  const filteredTasks = tasks.filter(t =>
    t.task.includes(search) || t.assignee.includes(search)
  );

  const kpis = {
    active: tenders.length,
    upcoming: 4,
    overdue: tasks.filter(t => t.status === "overdue").length,
    avgPrep: 18,
    onTime: 87,
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Route className="h-7 w-7 text-blue-600" /> ציר זמן ואבני דרך - מכרזים
        </h1>
        <div className="flex gap-2">
          <Input placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)} className="w-56" />
          <Button variant="outline"><Search className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-4">
        <Card className="border-blue-200">
          <CardContent className="pt-5 text-center">
            <FileText className="h-6 w-6 mx-auto text-blue-500 mb-1" />
            <p className="text-sm text-muted-foreground">מכרזים פעילים</p>
            <p className="text-3xl font-bold text-blue-600">{kpis.active}</p>
          </CardContent>
        </Card>
        <Card className="border-orange-200">
          <CardContent className="pt-5 text-center">
            <Clock className="h-6 w-6 mx-auto text-orange-500 mb-1" />
            <p className="text-sm text-muted-foreground">דד-ליין קרוב (7 ימים)</p>
            <p className="text-3xl font-bold text-orange-600">{kpis.upcoming}</p>
          </CardContent>
        </Card>
        <Card className="border-red-200">
          <CardContent className="pt-5 text-center">
            <AlertTriangle className="h-6 w-6 mx-auto text-red-500 mb-1" />
            <p className="text-sm text-muted-foreground">משימות באיחור</p>
            <p className="text-3xl font-bold text-red-600">{kpis.overdue}</p>
          </CardContent>
        </Card>
        <Card className="border-purple-200">
          <CardContent className="pt-5 text-center">
            <Timer className="h-6 w-6 mx-auto text-purple-500 mb-1" />
            <p className="text-sm text-muted-foreground">ממוצע הכנה (ימים)</p>
            <p className="text-3xl font-bold text-purple-600">{kpis.avgPrep}</p>
          </CardContent>
        </Card>
        <Card className="border-green-200">
          <CardContent className="pt-5 text-center">
            <CheckCircle2 className="h-6 w-6 mx-auto text-green-500 mb-1" />
            <p className="text-sm text-muted-foreground">הגשה בזמן %</p>
            <p className="text-3xl font-bold text-green-600">{kpis.onTime}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="timeline" className="gap-1"><Route className="h-4 w-4" /> ציר זמן</TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1"><CalendarDays className="h-4 w-4" /> לוח שנה</TabsTrigger>
          <TabsTrigger value="tasks" className="gap-1"><ListChecks className="h-4 w-4" /> משימות</TabsTrigger>
          <TabsTrigger value="critical" className="gap-1"><AlertTriangle className="h-4 w-4" /> נתיב קריטי</TabsTrigger>
        </TabsList>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="space-y-3 mt-4">
          {tenders.map(t => (
            <Card key={t.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono">{t.id}</Badge>
                    <span className="font-semibold">{t.name}</span>
                    <span className="text-sm text-muted-foreground">| {t.client}</span>
                  </div>
                  <span className="text-sm font-medium text-blue-600">{t.progress}%</span>
                </div>
                <Progress value={t.progress} className="h-2 mb-3" />
                <div className="flex justify-between">
                  {milestoneLabels.map((label, i) => (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                        i < t.current ? "bg-green-500 text-white border-green-500" :
                        i === t.current ? "bg-blue-500 text-white border-blue-500 animate-pulse" :
                        "bg-gray-100 text-gray-400 border-gray-300"
                      }`}>
                        {i < t.current ? "✓" : i + 1}
                      </div>
                      <span className={`text-xs ${i <= t.current ? "font-semibold text-gray-800" : "text-gray-400"}`}>{label}</span>
                      <span className="text-[10px] text-muted-foreground">{t.milestones[i]?.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Calendar Tab */}
        <TabsContent value="calendar" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm"><ChevronRight className="h-4 w-4" /></Button>
                <CardTitle className="text-lg">{monthName}</CardTitle>
                <Button variant="ghost" size="sm"><ChevronLeft className="h-4 w-4" /></Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {dayNames.map(d => (
                  <div key={d} className="text-center text-sm font-semibold text-muted-foreground py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: startDay }).map((_, i) => <div key={`e-${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                  const evts = calendarEvents.filter(e => e.day === day);
                  const isToday = day === 8;
                  return (
                    <div key={day} className={`min-h-[72px] border rounded-md p-1 text-xs ${isToday ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}>
                      <div className={`font-bold mb-0.5 ${isToday ? "text-blue-600" : ""}`}>{day}</div>
                      {evts.map((ev, ei) => (
                        <div key={ei} className={`rounded px-1 py-0.5 mb-0.5 truncate ${
                          ev.type === "deadline" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                        }`}>
                          {ev.label}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-3 text-xs">
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-100 border border-red-300" /> דד-ליין הגשה</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-blue-100 border border-blue-300" /> אבן דרך</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <ListChecks className="h-5 w-5" /> משימות הכנה ({filteredTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredTasks.map(t => (
                  <div key={t.id} className="flex items-center justify-between border rounded-lg px-4 py-3 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`w-2 h-2 rounded-full ${
                        t.status === "done" ? "bg-green-500" :
                        t.status === "progress" ? "bg-blue-500" :
                        t.status === "overdue" ? "bg-red-500" : "bg-gray-400"
                      }`} />
                      <span className={`font-medium ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>{t.task}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <User className="h-3.5 w-3.5" /> {t.assignee}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5" /> {t.deadline}
                      </div>
                      {statusBadge(t.status)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-4 mt-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-green-500" /> הושלם: {tasks.filter(t=>t.status==="done").length}</span>
                <span className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-blue-500" /> בביצוע: {tasks.filter(t=>t.status==="progress").length}</span>
                <span className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-red-500" /> באיחור: {tasks.filter(t=>t.status==="overdue").length}</span>
                <span className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-gray-400" /> ממתין: {tasks.filter(t=>t.status==="pending").length}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Critical Path Tab */}
        <TabsContent value="critical" className="space-y-4 mt-4">
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3 border border-red-200">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-semibold">{criticalTenders.length} מכרזים בסיכון להחמצת דד-ליין - נדרשת פעולה מיידית</span>
          </div>
          {criticalTenders.map(ct => (
            <Card key={ct.id} className={`border-r-4 ${
              ct.risk === "critical" ? "border-r-red-600" : ct.risk === "high" ? "border-r-orange-500" : "border-r-yellow-500"
            }`}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono">{ct.id}</Badge>
                    <span className="font-semibold">{ct.name}</span>
                    {riskBadge(ct.risk)}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Flag className="h-4 w-4 text-red-500" />
                    <span className="font-medium">{ct.deadline}</span>
                    <Badge variant={ct.daysLeft === 0 ? "destructive" : "secondary"}>
                      {ct.daysLeft === 0 ? "היום!" : `${ct.daysLeft} ימים`}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-red-50 rounded-lg p-3">
                    <div className="flex items-center gap-1 text-sm font-semibold text-red-700 mb-1">
                      <Target className="h-4 w-4" /> סיבת הסיכון
                    </div>
                    <p className="text-sm text-red-600">{ct.reason}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3">
                    <div className="flex items-center gap-1 text-sm font-semibold text-green-700 mb-1">
                      <Shield className="h-4 w-4" /> תוכנית מיטיגציה
                    </div>
                    <p className="text-sm text-green-600">{ct.mitigation}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant={ct.risk === "critical" ? "destructive" : "outline"}>
                    <ArrowUpCircle className="h-3.5 w-3.5 ml-1" /> הסלם לממונה
                  </Button>
                  <Button size="sm" variant="outline">
                    <CalendarDays className="h-3.5 w-3.5 ml-1" /> תזמון ישיבת חירום
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}