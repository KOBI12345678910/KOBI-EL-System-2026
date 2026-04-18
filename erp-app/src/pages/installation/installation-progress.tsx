import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  BarChart3, Activity, Clock, AlertTriangle, CheckCircle, Users,
  TrendingUp, Calendar, Timer, ArrowRight, CircleDot, Target
} from "lucide-react";

/* ── Static mock data ─────────────────────────────────────────── */

const FALLBACK_ACTIVE_INSTALLATIONS = [
  { id: "INS-101", project: "מגדלי הים — חיפה", progress: 85, installed: 10, total: 12, daysElapsed: 2, daysPlanned: 3, status: "לפי לו\"ז", crew: "צוות אלפא", phase: "התקנה" },
  { id: "INS-102", project: "פארק המדע — רחובות", progress: 45, installed: 5, total: 11, daysElapsed: 3, daysPlanned: 4, status: "לפי לו\"ז", crew: "צוות בטא", phase: "התקנה" },
  { id: "INS-103", project: "קניון הדרום — ב\"ש", progress: 92, installed: 11, total: 12, daysElapsed: 3, daysPlanned: 3, status: "מקדים", crew: "צוות דלתא", phase: "בדיקה" },
  { id: "INS-104", project: "מלון ים התיכון — ת\"א", progress: 30, installed: 3, total: 10, daysElapsed: 3, daysPlanned: 2, status: "מאחר", crew: "צוות אלפא", phase: "פריקה" },
  { id: "INS-105", project: "בניין מגורים — נתניה", progress: 68, installed: 8, total: 12, daysElapsed: 2, daysPlanned: 3, status: "לפי לו\"ז", crew: "צוות גמא", phase: "איטום" },
  { id: "INS-106", project: "משרדי הייטק — הרצליה", progress: 55, installed: 6, total: 11, daysElapsed: 2, daysPlanned: 3, status: "מקדים", crew: "צוות בטא", phase: "התקנה" },
  { id: "INS-107", project: "בית ספר אורט — ת\"א", progress: 20, installed: 2, total: 10, daysElapsed: 2, daysPlanned: 2, status: "מאחר", crew: "צוות גמא", phase: "הכנה" },
  { id: "INS-108", project: "מרכז ספורט — ראשל\"צ", progress: 78, installed: 7, total: 9, daysElapsed: 2, daysPlanned: 3, status: "לפי לו\"ז", crew: "צוות דלתא", phase: "איטום" },
  { id: "INS-109", project: "וילה פרטית — כפר שמריהו", progress: 100, installed: 6, total: 6, daysElapsed: 1, daysPlanned: 1, status: "מקדים", crew: "צוות אפסילון", phase: "מסירה" },
  { id: "INS-110", project: "בית חכם — הרצליה", progress: 50, installed: 4, total: 8, daysElapsed: 1, daysPlanned: 2, status: "לפי לו\"ז", crew: "צוות זטא", phase: "התקנה" },
];

const FALLBACK_GANTT_DATA = [
  { id: "INS-101", project: "מגדלי הים — חיפה", plannedStart: 1, plannedEnd: 3, actualStart: 1, actualEnd: 2.5, status: "לפי לו\"ז" },
  { id: "INS-102", project: "פארק המדע — רחובות", plannedStart: 1, plannedEnd: 4, actualStart: 1, actualEnd: 3, status: "לפי לו\"ז" },
  { id: "INS-103", project: "קניון הדרום — ב\"ש", plannedStart: 1, plannedEnd: 3, actualStart: 1, actualEnd: 2.8, status: "מקדים" },
  { id: "INS-104", project: "מלון ים התיכון", plannedStart: 1, plannedEnd: 2, actualStart: 1, actualEnd: 3, status: "מאחר" },
  { id: "INS-105", project: "בניין מגורים — נתניה", plannedStart: 1, plannedEnd: 3, actualStart: 1, actualEnd: 2, status: "לפי לו\"ז" },
  { id: "INS-106", project: "משרדי הייטק — הרצליה", plannedStart: 2, plannedEnd: 4, actualStart: 2, actualEnd: 3, status: "מקדים" },
  { id: "INS-107", project: "בית ספר אורט — ת\"א", plannedStart: 1, plannedEnd: 2, actualStart: 1, actualEnd: 2.5, status: "מאחר" },
  { id: "INS-108", project: "מרכז ספורט — ראשל\"צ", plannedStart: 2, plannedEnd: 4, actualStart: 2, actualEnd: 3.5, status: "לפי לו\"ז" },
];

const FALLBACK_MILESTONE_DATA = [
  { id: "INS-101", project: "מגדלי הים — חיפה", milestones: [true, true, true, true, false, false, false] },
  { id: "INS-102", project: "פארק המדע — רחובות", milestones: [true, true, true, false, false, false, false] },
  { id: "INS-103", project: "קניון הדרום — ב\"ש", milestones: [true, true, true, true, true, true, false] },
  { id: "INS-104", project: "מלון ים התיכון", milestones: [true, true, false, false, false, false, false] },
  { id: "INS-105", project: "בניין מגורים — נתניה", milestones: [true, true, true, true, true, false, false] },
  { id: "INS-106", project: "משרדי הייטק — הרצליה", milestones: [true, true, true, false, false, false, false] },
  { id: "INS-107", project: "בית ספר אורט — ת\"א", milestones: [true, false, false, false, false, false, false] },
  { id: "INS-108", project: "מרכז ספורט — ראשל\"צ", milestones: [true, true, true, true, true, false, false] },
  { id: "INS-109", project: "וילה פרטית — כפר שמריהו", milestones: [true, true, true, true, true, true, true] },
  { id: "INS-110", project: "בית חכם — הרצליה", milestones: [true, true, true, false, false, false, false] },
];

const FALLBACK_MILESTONE_LABELS = ["הגעה לאתר", "פריקה", "התקנת מסגרות", "הכנסת זכוכית", "איטום", "בדיקה", "מסירה"];

const FALLBACK_DELAYED_INSTALLATIONS = [
  { id: "INS-104", project: "מלון ים התיכון — ת\"א", reason: "עיכוב בגישה לקומות עליונות — מנוף תפוס ע\"י קבלן שכן", impact: 1.5, corrective: "תיאום מנוף ייעודי ליום רביעי, עבודה במשמרת כפולה", responsible: "יוסי כהן — מנהל פרויקט" },
  { id: "INS-107", project: "בית ספר אורט — ת\"א", reason: "חומרי איטום לא הגיעו מהספק — עיכוב באספקה", impact: 1, corrective: "הזמנת חומר חלופי מספק משני, משלוח אקספרס", responsible: "שרה לוי — רכשת" },
  { id: "INS-112", project: "מרכז מסחרי — אשדוד", reason: "אי התאמה בין מידות באתר לתוכניות — דרוש מדידה מחדש", impact: 2, corrective: "צוות מדידות נשלח מחר, ייצור מותאם תוך 48 שעות", responsible: "אלון גולדשטיין — מהנדס שטח" },
];

/* ── Helpers ───────────────────────────────────────────────────── */

const statusColor: Record<string, string> = {
  "לפי לו\"ז": "bg-emerald-500/20 text-emerald-300",
  "מקדים": "bg-blue-500/20 text-blue-300",
  "מאחר": "bg-red-500/20 text-red-300",
};

const phaseColor: Record<string, string> = {
  "הכנה": "bg-gray-500/20 text-gray-300",
  "פריקה": "bg-violet-500/20 text-violet-300",
  "התקנה": "bg-blue-500/20 text-blue-300",
  "איטום": "bg-amber-500/20 text-amber-300",
  "בדיקה": "bg-cyan-500/20 text-cyan-300",
  "ניקוי": "bg-teal-500/20 text-teal-300",
  "מסירה": "bg-emerald-500/20 text-emerald-300",
};

const progressBarColor = (pct: number) => {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 50) return "bg-amber-500";
  return "bg-red-500";
};

const ganttBarColor = (status: string) => {
  if (status === "מקדים") return "bg-blue-500";
  if (status === "מאחר") return "bg-red-500";
  return "bg-emerald-500";
};

/* ── KPI data ─────────────────────────────────────────────────── */

const FALLBACK_KPI_DATA = [
  { label: "בביצוע", value: "6", icon: Activity, color: "text-yellow-400", bg: "bg-yellow-500/10" },
  { label: "לפי לו\"ז", value: "4", icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "מאחרות", value: "2", icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "הושלמו השבוע", value: "5", icon: Target, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "ממוצע התקדמות", value: "62%", icon: TrendingUp, color: "text-purple-400", bg: "bg-purple-500/10" },
];

/* ── Component ────────────────────────────────────────────────── */

export default function InstallationProgress() {
  const { data: activeInstallations = FALLBACK_ACTIVE_INSTALLATIONS } = useQuery({
    queryKey: ["installation-active-installations"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-progress/active-installations");
      if (!res.ok) return FALLBACK_ACTIVE_INSTALLATIONS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_ACTIVE_INSTALLATIONS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: ganttData = FALLBACK_GANTT_DATA } = useQuery({
    queryKey: ["installation-gantt-data"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-progress/gantt-data");
      if (!res.ok) return FALLBACK_GANTT_DATA;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_GANTT_DATA;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: milestoneData = FALLBACK_MILESTONE_DATA } = useQuery({
    queryKey: ["installation-milestone-data"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-progress/milestone-data");
      if (!res.ok) return FALLBACK_MILESTONE_DATA;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_MILESTONE_DATA;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: milestoneLabels = FALLBACK_MILESTONE_LABELS } = useQuery({
    queryKey: ["installation-milestone-labels"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-progress/milestone-labels");
      if (!res.ok) return FALLBACK_MILESTONE_LABELS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_MILESTONE_LABELS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: delayedInstallations = FALLBACK_DELAYED_INSTALLATIONS } = useQuery({
    queryKey: ["installation-delayed-installations"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-progress/delayed-installations");
      if (!res.ok) return FALLBACK_DELAYED_INSTALLATIONS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_DELAYED_INSTALLATIONS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: kpiData = FALLBACK_KPI_DATA } = useQuery({
    queryKey: ["installation-kpi-data"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-progress/kpi-data");
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
          <BarChart3 className="h-7 w-7 text-primary" /> מעקב התקדמות התקנות
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          טכנו-כל עוזי — מעקב בזמן אמת | ציר זמן | אבני דרך | ניתוח עיכובים
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-5 gap-3">
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

      {/* Tabs */}
      <Tabs defaultValue="progress">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="progress" className="text-xs gap-1"><Activity className="h-3.5 w-3.5" /> סקירת התקדמות</TabsTrigger>
          <TabsTrigger value="timeline" className="text-xs gap-1"><Calendar className="h-3.5 w-3.5" /> ציר זמן</TabsTrigger>
          <TabsTrigger value="milestones" className="text-xs gap-1"><CircleDot className="h-3.5 w-3.5" /> אבני דרך</TabsTrigger>
          <TabsTrigger value="delays" className="text-xs gap-1"><AlertTriangle className="h-3.5 w-3.5" /> ניתוח עיכובים</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Progress Overview ────────────────────────── */}
        <TabsContent value="progress">
          <div className="grid grid-cols-2 gap-3">
            {activeInstallations.map((ins) => (
              <Card key={ins.id} className="border shadow-sm">
                <CardContent className="p-4 space-y-3">
                  {/* Header row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-sm text-primary">{ins.id}</span>
                      <span className="text-sm font-medium">{ins.project}</span>
                    </div>
                    <Badge className={`text-[9px] ${statusColor[ins.status] || "bg-gray-500/20 text-gray-300"}`}>{ins.status}</Badge>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${progressBarColor(ins.progress)}`}
                          style={{ width: `${ins.progress}%` }}
                        />
                      </div>
                      <span className="text-sm font-bold font-mono w-10 text-left">{ins.progress}%</span>
                    </div>
                  </div>

                  {/* Details row */}
                  <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Target className="h-3 w-3" /> פריטים: <span className="font-mono font-medium text-foreground">{ins.installed}/{ins.total}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> ימים: <span className="font-mono font-medium text-foreground">{ins.daysElapsed}/{ins.daysPlanned}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" /> {ins.crew}
                    </span>
                    <Badge className={`text-[9px] ${phaseColor[ins.phase] || "bg-gray-500/20 text-gray-300"}`}>{ins.phase}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Tab 2: Gantt-like Timeline ──────────────────────── */}
        <TabsContent value="timeline">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Timer className="h-4 w-4 text-primary" /> ציר זמן — מתוכנן מול בפועל
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">כל יחידה = יום עבודה. פס עליון = מתוכנן, פס תחתון = בפועל</p>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              {/* Day labels */}
              <div className="flex items-center mr-44">
                {[1, 2, 3, 4, 5].map((d) => (
                  <div key={d} className="flex-1 text-center text-[10px] text-muted-foreground font-mono">יום {d}</div>
                ))}
              </div>

              {ganttData.map((g) => {
                const maxDays = 5;
                const plannedLeft = ((g.plannedStart - 1) / maxDays) * 100;
                const plannedWidth = ((g.plannedEnd - g.plannedStart + 1) / maxDays) * 100;
                const actualLeft = ((g.actualStart - 1) / maxDays) * 100;
                const actualWidth = ((g.actualEnd - g.actualStart + 1) / maxDays) * 100;

                return (
                  <div key={g.id} className="flex items-center gap-3">
                    <div className="w-40 shrink-0 text-left">
                      <span className="text-[10px] font-mono text-primary font-semibold">{g.id}</span>
                      <p className="text-[10px] text-muted-foreground truncate">{g.project}</p>
                    </div>
                    <div className="flex-1 space-y-1">
                      {/* Planned bar */}
                      <div className="relative h-3 bg-muted/30 rounded">
                        <div
                          className="absolute h-full bg-gray-400/40 rounded"
                          style={{ right: `${plannedLeft}%`, width: `${plannedWidth}%` }}
                        />
                      </div>
                      {/* Actual bar */}
                      <div className="relative h-3 bg-muted/30 rounded">
                        <div
                          className={`absolute h-full rounded ${ganttBarColor(g.status)}`}
                          style={{ right: `${actualLeft}%`, width: `${actualWidth}%` }}
                        />
                      </div>
                    </div>
                    <Badge className={`text-[8px] w-14 justify-center ${statusColor[g.status] || "bg-gray-500/20 text-gray-300"}`}>{g.status}</Badge>
                  </div>
                );
              })}

              {/* Legend */}
              <div className="flex items-center gap-6 pt-2 border-t border-muted/30">
                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="w-4 h-2 rounded bg-gray-400/40 inline-block" /> מתוכנן
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="w-4 h-2 rounded bg-emerald-500 inline-block" /> בפועל — לפי לו"ז
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="w-4 h-2 rounded bg-blue-500 inline-block" /> בפועל — מקדים
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="w-4 h-2 rounded bg-red-500 inline-block" /> בפועל — מאחר
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Milestone Tracking ───────────────────────── */}
        <TabsContent value="milestones">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">מס׳</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פרויקט</TableHead>
                    {milestoneLabels.map((label) => (
                      <TableHead key={label} className="text-center text-[10px] font-semibold">{label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {milestoneData.map((row) => (
                    <TableRow key={row.id} className="text-xs">
                      <TableCell className="font-mono font-semibold text-primary">{row.id}</TableCell>
                      <TableCell className="text-xs">{row.project}</TableCell>
                      {row.milestones.map((done, i) => (
                        <TableCell key={i} className="text-center">
                          {done ? (
                            <CheckCircle className="h-4 w-4 text-emerald-400 mx-auto" />
                          ) : (
                            <CircleDot className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 4: Delay Analysis ───────────────────────────── */}
        <TabsContent value="delays">
          <div className="space-y-3">
            {delayedInstallations.map((d) => (
              <Card key={d.id} className="border-red-500/20 bg-red-500/5">
                <CardContent className="p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-400" />
                      <span className="font-mono font-semibold text-sm text-primary">{d.id}</span>
                      <span className="text-sm font-medium">{d.project}</span>
                    </div>
                    <Badge className="bg-red-500/20 text-red-300 text-[9px]">עיכוב {d.impact} ימים</Badge>
                  </div>

                  {/* Details grid */}
                  <div className="grid grid-cols-3 gap-3 text-[11px]">
                    <div className="space-y-1">
                      <p className="text-muted-foreground font-medium">סיבת העיכוב</p>
                      <p className="text-foreground">{d.reason}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground font-medium">פעולה מתקנת</p>
                      <p className="text-foreground flex items-center gap-1">
                        <ArrowRight className="h-3 w-3 text-amber-400 shrink-0" /> {d.corrective}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground font-medium">אחראי</p>
                      <p className="text-foreground flex items-center gap-1">
                        <Users className="h-3 w-3 text-blue-400 shrink-0" /> {d.responsible}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
