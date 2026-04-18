import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Calendar, Users, Clock, AlertTriangle, CheckCircle, ArrowLeftRight,
  CalendarDays, CalendarRange, BarChart3, Zap, Timer, ShieldAlert
} from "lucide-react";

/* ── Static mock data ─────────────────────────────────────────── */

const FALLBACK_TEAMS = ["צוות אלפא", "צוות בטא", "צוות גמא", "צוות דלתא"] as const;

const FALLBACK_WEEK_DAYS = [
  { key: "sun", label: "ראשון", date: "06/04" },
  { key: "mon", label: "שני", date: "07/04" },
  { key: "tue", label: "שלישי", date: "08/04" },
  { key: "wed", label: "רביעי", date: "09/04" },
  { key: "thu", label: "חמישי", date: "10/04" },
  { key: "fri", label: "שישי", date: "11/04" },
  { key: "sat", label: "שבת", date: "12/04" },
];

type CellEntry = { project: string; time: string; status: "מאושר" | "טנטטיבי" | "בביצוע" | "" };

const calendarGrid: Record<string, Record<string, CellEntry>> = {
  "צוות אלפא": {
    sun: { project: "מגדלי הים — חיפה", time: "07:00-15:00", status: "בביצוע" },
    mon: { project: "מגדלי הים — חיפה", time: "07:00-15:00", status: "בביצוע" },
    tue: { project: "מגדלי הים — חיפה", time: "07:00-12:00", status: "מאושר" },
    wed: { project: "", time: "", status: "" },
    thu: { project: "מלון ים התיכון", time: "08:00-16:00", status: "מאושר" },
    fri: { project: "מלון ים התיכון", time: "07:00-13:00", status: "מאושר" },
    sat: { project: "", time: "", status: "" },
  },
  "צוות בטא": {
    sun: { project: "", time: "", status: "" },
    mon: { project: "פארק המדע — רחובות", time: "08:00-16:00", status: "מאושר" },
    tue: { project: "פארק המדע — רחובות", time: "08:00-16:00", status: "מאושר" },
    wed: { project: "פארק המדע — רחובות", time: "08:00-12:00", status: "מאושר" },
    thu: { project: "משרדי הייטק — הרצליה", time: "07:30-15:30", status: "טנטטיבי" },
    fri: { project: "משרדי הייטק — הרצליה", time: "07:30-13:00", status: "טנטטיבי" },
    sat: { project: "", time: "", status: "" },
  },
  "צוות גמא": {
    sun: { project: "בניין מגורים — נתניה", time: "07:00-15:00", status: "בביצוע" },
    mon: { project: "בניין מגורים — נתניה", time: "07:00-15:00", status: "מאושר" },
    tue: { project: "", time: "", status: "" },
    wed: { project: "בית חכם — הרצליה", time: "08:00-16:00", status: "טנטטיבי" },
    thu: { project: "בית חכם — הרצליה", time: "08:00-16:00", status: "טנטטיבי" },
    fri: { project: "", time: "", status: "" },
    sat: { project: "", time: "", status: "" },
  },
  "צוות דלתא": {
    sun: { project: "קניון הדרום — ב\"ש", time: "06:30-14:30", status: "בביצוע" },
    mon: { project: "קניון הדרום — ב\"ש", time: "06:30-14:30", status: "בביצוע" },
    tue: { project: "קניון הדרום — ב\"ש", time: "06:30-14:30", status: "מאושר" },
    wed: { project: "קניון הדרום — ב\"ש", time: "06:30-12:00", status: "מאושר" },
    thu: { project: "", time: "", status: "" },
    fri: { project: "מרכז ספורט — ראשל\"צ", time: "07:00-13:00", status: "טנטטיבי" },
    sat: { project: "", time: "", status: "" },
  },
};

const FALLBACK_SCHEDULING_QUEUE = [
  { id: "SCH-001", priority: "דחוף", project: "מגדלי הים — חיפה", product: "חלונות אלומיניום Premium", requestedDate: "2026-04-08", crewPref: "צוות אלפא", duration: "3 ימים", dependencies: "חומרים באתר", status: "שובץ" },
  { id: "SCH-002", priority: "דחוף", project: "קניון הדרום — ב\"ש", product: "פרגולות אלומיניום", requestedDate: "2026-04-06", crewPref: "צוות דלתא", duration: "4 ימים", dependencies: "אישור קונסטרוקטור", status: "שובץ" },
  { id: "SCH-003", priority: "רגיל", project: "פארק המדע — רחובות", product: "ויטרינות חזית 3m", requestedDate: "2026-04-07", crewPref: "צוות בטא", duration: "2.5 ימים", dependencies: "מנוף באתר", status: "שובץ" },
  { id: "SCH-004", priority: "רגיל", project: "מלון ים התיכון", product: "מעקות זכוכית קומה 12", requestedDate: "2026-04-10", crewPref: "צוות אלפא", duration: "2 ימים", dependencies: "גישה לקומה 12", status: "שובץ" },
  { id: "SCH-005", priority: "רגיל", project: "משרדי הייטק — הרצליה", product: "מחיצות זכוכית משרדיות", requestedDate: "2026-04-10", crewPref: "צוות בטא", duration: "2 ימים", dependencies: "אין", status: "ממתין לאישור" },
  { id: "SCH-006", priority: "רגיל", project: "בניין מגורים — נתניה", product: "חלונות דגם Comfort", requestedDate: "2026-04-06", crewPref: "צוות גמא", duration: "2 ימים", dependencies: "פילוס רצפה", status: "שובץ" },
  { id: "SCH-007", priority: "נמוך", project: "בית חכם — הרצליה", product: "דלתות הזזה חשמליות", requestedDate: "2026-04-09", crewPref: "צוות גמא", duration: "2 ימים", dependencies: "חשמלאי באתר", status: "ממתין לאישור" },
  { id: "SCH-008", priority: "נמוך", project: "מרכז ספורט — ראשל\"צ", product: "דלתות אש + מסגרות", requestedDate: "2026-04-11", crewPref: "צוות דלתא", duration: "1 יום", dependencies: "אין", status: "טנטטיבי" },
  { id: "SCH-009", priority: "דחוף", project: "בית ספר אורט — ת\"א", product: "חלונות בטיחותיים כיתות", requestedDate: "2026-04-09", crewPref: "ללא העדפה", duration: "3 ימים", dependencies: "חופשת פסח — תיאום", status: "ממתין לאישור" },
  { id: "SCH-010", priority: "נמוך", project: "וילה פרטית — כפר שמריהו", product: "פרגולה ביומטרית", requestedDate: "2026-04-14", crewPref: "ללא העדפה", duration: "1.5 ימים", dependencies: "אישור ועד בית", status: "ממתין לאישור" },
];

const FALLBACK_CONFLICTS = [
  {
    id: "CON-1",
    description: "צוות אלפא משובץ לשני פרויקטים ב-10/04",
    affected: ["מגדלי הים — חיפה (07:00-12:00)", "מלון ים התיכון (08:00-16:00)"],
    suggestion: "להקדים סיום מגדלי הים ל-09/04 או לדחות מלון ים התיכון ל-11:00",
  },
  {
    id: "CON-2",
    description: "בית ספר אורט דורש צוות ב-09/04 — כל הצוותים תפוסים",
    affected: ["בית ספר אורט — ת\"א (SCH-009)", "צוות גמא: בניין מגורים — נתניה", "צוות דלתא: קניון הדרום — ב\"ש"],
    suggestion: "לשבץ צוות גמא מ-10/04 (יום פנוי) או לגייס צוות חיצוני",
  },
  {
    id: "CON-3",
    description: "מנוף נדרש בו-זמנית בפארק המדע ובמלון ים התיכון (10/04)",
    affected: ["פארק המדע — רחובות (מנוף 25 טון)", "מלון ים התיכון (מנוף 40 טון)"],
    suggestion: "להזמין מנוף נוסף מקבלן משנה או לפצל למשמרות בוקר/צהריים",
  },
];

const FALLBACK_MONTHLY_OVERVIEW = [
  { week: "שבוע 14 (31/03-04/04)", planned: 5, completed: 5, cancelled: 0 },
  { week: "שבוע 15 (06/04-11/04)", planned: 8, completed: 0, cancelled: 0 },
  { week: "שבוע 16 (13/04-18/04)", planned: 6, completed: 0, cancelled: 1 },
  { week: "שבוע 17 (20/04-25/04)", planned: 4, completed: 0, cancelled: 0 },
];

const FALLBACK_TEAM_UTILIZATION = [
  { team: "צוות אלפא", scheduled: 37, available: 45, pct: 82 },
  { team: "צוות בטא", scheduled: 32, available: 45, pct: 71 },
  { team: "צוות גמא", scheduled: 34, available: 45, pct: 76 },
  { team: "צוות דלתא", scheduled: 37.5, available: 45, pct: 83 },
];

/* ── Helpers ───────────────────────────────────────────────────── */

const cellStatusColor: Record<string, string> = {
  "מאושר": "bg-emerald-500/20 text-emerald-300",
  "טנטטיבי": "bg-amber-500/20 text-amber-300",
  "בביצוע": "bg-blue-500/20 text-blue-300",
};

const priorityColor: Record<string, string> = {
  "דחוף": "bg-red-500/20 text-red-300",
  "רגיל": "bg-blue-500/20 text-blue-300",
  "נמוך": "bg-gray-500/20 text-gray-400",
};

const queueStatusColor: Record<string, string> = {
  "שובץ": "bg-emerald-500/20 text-emerald-300",
  "ממתין לאישור": "bg-amber-500/20 text-amber-300",
  "טנטטיבי": "bg-purple-500/20 text-purple-300",
};

/* ── KPI cards ────────────────────────────────────────────────── */

const FALLBACK_KPI_DATA = [
  { label: "מתוכנן השבוע", value: "8", icon: CalendarDays, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "שובצו צוותים", value: "6", icon: Users, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "ממתינים לאישור", value: "2", icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "התנגשויות בלו\"ז", value: "1", icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "ממוצע ימי המתנה", value: "3.2", icon: Timer, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "ניצולת צוותים", value: "78%", icon: BarChart3, color: "text-cyan-400", bg: "bg-cyan-500/10" },
];

/* ── Component ────────────────────────────────────────────────── */

export default function InstallationScheduling() {
  const { data: teams = FALLBACK_TEAMS } = useQuery({
    queryKey: ["installation-teams"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-scheduling/teams");
      if (!res.ok) return FALLBACK_TEAMS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_TEAMS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: weekDays = FALLBACK_WEEK_DAYS } = useQuery({
    queryKey: ["installation-week-days"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-scheduling/week-days");
      if (!res.ok) return FALLBACK_WEEK_DAYS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_WEEK_DAYS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: schedulingQueue = FALLBACK_SCHEDULING_QUEUE } = useQuery({
    queryKey: ["installation-scheduling-queue"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-scheduling/scheduling-queue");
      if (!res.ok) return FALLBACK_SCHEDULING_QUEUE;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_SCHEDULING_QUEUE;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: conflicts = FALLBACK_CONFLICTS } = useQuery({
    queryKey: ["installation-conflicts"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-scheduling/conflicts");
      if (!res.ok) return FALLBACK_CONFLICTS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_CONFLICTS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: monthlyOverview = FALLBACK_MONTHLY_OVERVIEW } = useQuery({
    queryKey: ["installation-monthly-overview"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-scheduling/monthly-overview");
      if (!res.ok) return FALLBACK_MONTHLY_OVERVIEW;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_MONTHLY_OVERVIEW;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: teamUtilization = FALLBACK_TEAM_UTILIZATION } = useQuery({
    queryKey: ["installation-team-utilization"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-scheduling/team-utilization");
      if (!res.ok) return FALLBACK_TEAM_UTILIZATION;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_TEAM_UTILIZATION;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: kpiData = FALLBACK_KPI_DATA } = useQuery({
    queryKey: ["installation-kpi-data"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-scheduling/kpi-data");
      if (!res.ok) return FALLBACK_KPI_DATA;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_KPI_DATA;
    },
    staleTime: 30_000,
    retry: 1,
  });


  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Calendar className="h-7 w-7 text-primary" /> תיאום וזימון התקנות
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          טכנו-כל עוזי — לו״ז שבועי | תור שיבוץ | התנגשויות | ניצולת צוותים
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-6 gap-3">
        {kpiData.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.bg} border-0 shadow-sm`}>
              <CardContent className="pt-3 pb-2 text-center px-2">
                <Icon className={`h-5 w-5 mx-auto ${kpi.color} mb-1`} />
                <p className="text-[10px] text-muted-foreground leading-tight">{kpi.label}</p>
                <p className={`text-2xl font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Weekly Calendar View */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-blue-400" /> לוח שבועי — שבוע 15 (06/04–12/04/2026)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-right text-[10px] font-semibold w-28">צוות</TableHead>
                {weekDays.map(d => (
                  <TableHead key={d.key} className="text-center text-[10px] font-semibold">
                    {d.label}<br /><span className="text-muted-foreground">{d.date}</span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map(team => (
                <TableRow key={team} className="hover:bg-muted/20">
                  <TableCell className="text-xs font-medium">{team}</TableCell>
                  {weekDays.map(d => {
                    const cell = calendarGrid[team]?.[d.key];
                    if (!cell || !cell.project) {
                      return (
                        <TableCell key={d.key} className="text-center text-[10px] text-muted-foreground">
                          —
                        </TableCell>
                      );
                    }
                    return (
                      <TableCell key={d.key} className="text-center p-1">
                        <div className="text-[10px] font-medium leading-tight">{cell.project}</div>
                        <div className="text-[9px] text-muted-foreground">{cell.time}</div>
                        <Badge className={`text-[8px] px-1 py-0 mt-0.5 ${cellStatusColor[cell.status] || ""}`}>
                          {cell.status}
                        </Badge>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Scheduling Queue */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-400" /> תור שיבוץ התקנות
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-right text-[10px] font-semibold">מס׳</TableHead>
                <TableHead className="text-right text-[10px] font-semibold">עדיפות</TableHead>
                <TableHead className="text-right text-[10px] font-semibold">פרויקט</TableHead>
                <TableHead className="text-right text-[10px] font-semibold">סוג מוצר</TableHead>
                <TableHead className="text-right text-[10px] font-semibold">תאריך מבוקש</TableHead>
                <TableHead className="text-right text-[10px] font-semibold">העדפת צוות</TableHead>
                <TableHead className="text-right text-[10px] font-semibold">משך משוער</TableHead>
                <TableHead className="text-right text-[10px] font-semibold">תלויות</TableHead>
                <TableHead className="text-right text-[10px] font-semibold">סטטוס</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedulingQueue.map(row => (
                <TableRow key={row.id} className="hover:bg-muted/20">
                  <TableCell className="text-xs font-mono">{row.id}</TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] ${priorityColor[row.priority] || ""}`}>{row.priority}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{row.project}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.product}</TableCell>
                  <TableCell className="text-xs font-mono">{row.requestedDate}</TableCell>
                  <TableCell className="text-xs">{row.crewPref}</TableCell>
                  <TableCell className="text-xs">{row.duration}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.dependencies}</TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] ${queueStatusColor[row.status] || ""}`}>{row.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Conflict Resolution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-400" /> פתרון התנגשויות בלו״ז
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {conflicts.map(c => (
            <div key={c.id} className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <Badge className="bg-red-500/20 text-red-300 text-[10px]">{c.id}</Badge>
                <span className="text-xs font-semibold">{c.description}</span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">מושפעים: </span>
                {c.affected.join(" | ")}
              </div>
              <div className="text-[11px]">
                <span className="font-medium text-emerald-400">פתרון מוצע: </span>
                <span className="text-muted-foreground">{c.suggestion}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="weekly">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="weekly" className="text-xs gap-1"><CalendarDays className="h-3.5 w-3.5" /> שבועי</TabsTrigger>
          <TabsTrigger value="monthly" className="text-xs gap-1"><CalendarRange className="h-3.5 w-3.5" /> חודשי</TabsTrigger>
          <TabsTrigger value="utilization" className="text-xs gap-1"><BarChart3 className="h-3.5 w-3.5" /> ניצולת</TabsTrigger>
        </TabsList>

        {/* ── Tab: Weekly Detail ───────────────────────────── */}
        <TabsContent value="weekly">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">פירוט שבועי — שבוע 15</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {teams.map(team => {
                const days = weekDays.filter(d => calendarGrid[team]?.[d.key]?.project);
                const totalHours = days.length * 7.5;
                return (
                  <div key={team} className="rounded-lg border p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">{team}</span>
                      <span className="text-[10px] text-muted-foreground">{days.length} ימי עבודה | ~{totalHours} שעות</span>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {weekDays.map(d => {
                        const cell = calendarGrid[team]?.[d.key];
                        const active = cell && cell.project;
                        return (
                          <div
                            key={d.key}
                            className={`text-[9px] rounded px-2 py-1 text-center min-w-[70px] ${
                              active ? "bg-blue-500/10 text-blue-300" : "bg-muted/30 text-muted-foreground"
                            }`}
                          >
                            <div className="font-medium">{d.label}</div>
                            {active ? <div className="truncate max-w-[80px]">{cell!.project}</div> : <div>—</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Monthly Overview ────────────────────────── */}
        <TabsContent value="monthly">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">סקירה חודשית — אפריל 2026</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">שבוע</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">מתוכננות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">הושלמו</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">בוטלו</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold w-40">התקדמות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyOverview.map((w, i) => {
                    const pct = w.planned > 0 ? Math.round((w.completed / w.planned) * 100) : 0;
                    return (
                      <TableRow key={i} className="hover:bg-muted/20">
                        <TableCell className="text-xs">{w.week}</TableCell>
                        <TableCell className="text-xs font-mono text-center">{w.planned}</TableCell>
                        <TableCell className="text-xs font-mono text-center">{w.completed}</TableCell>
                        <TableCell className="text-xs font-mono text-center">{w.cancelled}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={pct} className="h-2 flex-1" />
                            <span className="text-[10px] font-mono text-muted-foreground w-8">{pct}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Team Utilization ────────────────────────── */}
        <TabsContent value="utilization">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">ניצולת צוותים — שבוע 15</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {teamUtilization.map(t => (
                <div key={t.team} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">{t.team}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {t.scheduled} / {t.available} שעות ({t.pct}%)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress
                      value={t.pct}
                      className={`h-3 flex-1 ${t.pct >= 80 ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500"}`}
                    />
                    <Badge className={`text-[9px] px-1.5 ${
                      t.pct >= 80 ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300"
                    }`}>
                      {t.pct >= 80 ? "עומס גבוה" : "תקין"}
                    </Badge>
                  </div>
                </div>
              ))}
              <div className="rounded-lg border p-3 mt-2 bg-muted/20">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 className="h-4 w-4 text-cyan-400" />
                  <span className="text-xs font-semibold">סיכום ניצולת כוללת</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground">סה״כ שעות משובצות</p>
                    <p className="text-lg font-bold font-mono text-blue-400">
                      {teamUtilization.reduce((a, t) => a + t.scheduled, 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">סה״כ שעות זמינות</p>
                    <p className="text-lg font-bold font-mono text-emerald-400">
                      {teamUtilization.reduce((a, t) => a + t.available, 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">ניצולת ממוצעת</p>
                    <p className="text-lg font-bold font-mono text-cyan-400">
                      {Math.round(teamUtilization.reduce((a, t) => a + t.pct, 0) / teamUtilization.length)}%
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}