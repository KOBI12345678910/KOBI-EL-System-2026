import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Wrench, Clock, AlertTriangle, CheckCircle, TrendingUp,
  TrendingDown, CalendarDays, Activity, Timer, Shield, Zap, Settings
} from "lucide-react";

/* ───── Fallback KPIs ───── */
const FALLBACK_KPIS = [
  { label: "משימות תחזוקה מונעת", value: "12", sub: "3 דחופות", icon: CalendarDays, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "תקלות פעילות", value: "2", sub: "קו C + קו F", icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
  { label: 'השבתה היום (שעות)', value: "3.8", sub: "מתוכנן: 1.5 | לא: 2.3", icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "זמינות תחנות", value: "87.5%", sub: "7/8 פעילות", icon: Activity, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "MTBF (ימים)", value: "18.4", sub: "ממוצע בין תקלות", icon: Shield, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "MTTR (שעות)", value: "2.1", sub: "זמן תיקון ממוצע", icon: Timer, color: "text-cyan-400", bg: "bg-cyan-500/10" },
];

/* ───── Fallback Preventive Maintenance ───── */
const FALLBACK_PREVENTIVE = [
  { station: "קו A — חיתוך", task: "החלפת להבים", freq: "שבועי", lastDone: "2026-04-01", nextDue: "2026-04-08", status: "due" },
  { station: "קו B — כיפוף", task: "שימון מסילות", freq: "יומי", lastDone: "2026-04-07", nextDue: "2026-04-08", status: "due" },
  { station: "קו C — ריתוך", task: "כיול טמפרטורה", freq: "חודשי", lastDone: "2026-03-10", nextDue: "2026-04-10", status: "upcoming" },
  { station: "קו D — הרכבה", task: "בדיקת מומנט", freq: "שבועי", lastDone: "2026-04-07", nextDue: "2026-04-14", status: "ok" },
  { station: "קו E — צביעה", task: "ניקוי פילטרים", freq: "יומי", lastDone: "2026-04-07", nextDue: "2026-04-08", status: "due" },
  { station: "קו F — אריזה", task: "בדיקת חיישנים", freq: "חודשי", lastDone: "2026-03-15", nextDue: "2026-04-15", status: "ok" },
  { station: "קו G — איכות", task: "כיול מכשירי מדידה", freq: "רבעוני", lastDone: "2026-01-10", nextDue: "2026-04-10", status: "upcoming" },
  { station: "קו A — חיתוך", task: "בדיקת לחץ הידראולי", freq: "חודשי", lastDone: "2026-03-08", nextDue: "2026-04-08", status: "overdue" },
];

/* ───── Fallback Breakdown Events ───── */
const FALLBACK_BREAKDOWNS = [
  { station: "קו C — ריתוך", start: "2026-04-08 07:15", duration: "2.5 שעות", cause: "כשל במנוע סרוו", tech: "יוסי כהן", resolution: "החלפת מנוע", impact: "גבוה" },
  { station: "קו F — אריזה", start: "2026-04-08 10:30", duration: "1.0 שעות", cause: "חיישן קרבה תקול", tech: "מוחמד חסן", resolution: "החלפת חיישן", impact: "בינוני" },
  { station: "קו A — חיתוך", start: "2026-04-07 14:00", duration: "3.0 שעות", cause: "שבר להב ראשי", tech: "דוד לוי", resolution: "החלפת להב + כיול", impact: "גבוה" },
  { station: "קו B — כיפוף", start: "2026-04-06 09:45", duration: "0.5 שעות", cause: "חסימת חומר גלם", tech: "יוסי כהן", resolution: "פינוי חסימה", impact: "נמוך" },
  { station: "קו E — צביעה", start: "2026-04-05 11:20", duration: "4.0 שעות", cause: "תקלת מדחס אוויר", tech: "אלי ברק", resolution: "תיקון שסתום + בדיקת לחץ", impact: "גבוה" },
  { station: "קו D — הרכבה", start: "2026-04-04 16:00", duration: "1.5 שעות", cause: "תקלת PLC", tech: "מוחמד חסן", resolution: "איפוס + עדכון תוכנה", impact: "בינוני" },
  { station: "קו G — איכות", start: "2026-04-03 08:30", duration: "0.8 שעות", cause: "תקלת מצלמה", tech: "דוד לוי", resolution: "כיול מחדש", impact: "נמוך" },
];

/* ───── Fallback Downtime Log ───── */
const FALLBACK_DOWNTIME_LOG = [
  { station: "קו C — ריתוך", type: "unplanned", start: "07:15", end: "09:45", duration: "2.5h", reason: "כשל מנוע סרוו" },
  { station: "קו F — אריזה", type: "unplanned", start: "10:30", end: "11:30", duration: "1.0h", reason: "חיישן קרבה תקול" },
  { station: "קו A — חיתוך", type: "planned", start: "06:00", end: "06:30", duration: "0.5h", reason: "תחזוקה מונעת — להבים" },
  { station: "קו E — צביעה", type: "planned", start: "06:00", end: "07:00", duration: "1.0h", reason: "ניקוי פילטרים" },
  { station: "קו B — כיפוף", type: "break", start: "12:00", end: "12:30", duration: "0.5h", reason: "הפסקת צהריים" },
  { station: "קו D — הרכבה", type: "break", start: "12:00", end: "12:30", duration: "0.5h", reason: "הפסקת צהריים" },
  { station: "קו G — איכות", type: "planned", start: "13:00", end: "13:30", duration: "0.5h", reason: "כיול מכשירי מדידה" },
  { station: "קו A — חיתוך", type: "unplanned", start: "14:00", end: "14:20", duration: "0.3h", reason: "אזעקת בטיחות — איפוס" },
];

/* ───── Fallback Station Availability ───── */
const FALLBACK_STATIONS = [
  { name: "קו A — חיתוך", avail: 91, uptime: 14.6, downtime: 1.4, trend: "up" },
  { name: "קו B — כיפוף", avail: 96, uptime: 15.4, downtime: 0.6, trend: "up" },
  { name: "קו C — ריתוך", avail: 72, uptime: 11.5, downtime: 4.5, trend: "down" },
  { name: "קו D — הרכבה", avail: 94, uptime: 15.0, downtime: 1.0, trend: "stable" },
  { name: "קו E — צביעה", avail: 88, uptime: 14.1, downtime: 1.9, trend: "down" },
  { name: "קו F — אריזה", avail: 85, uptime: 13.6, downtime: 2.4, trend: "up" },
  { name: "קו G — איכות", avail: 93, uptime: 14.9, downtime: 1.1, trend: "stable" },
  { name: "קו H — גמר", avail: 97, uptime: 15.5, downtime: 0.5, trend: "up" },
];

const statusStyle: Record<string, { label: string; cls: string }> = {
  due: { label: "נדרש היום", cls: "bg-amber-500/20 text-amber-400" },
  overdue: { label: "באיחור", cls: "bg-red-500/20 text-red-400" },
  upcoming: { label: "קרוב", cls: "bg-blue-500/20 text-blue-400" },
  ok: { label: "תקין", cls: "bg-emerald-500/20 text-emerald-400" },
};

const typeStyle: Record<string, { label: string; cls: string }> = {
  planned: { label: "מתוכנן", cls: "bg-blue-500/20 text-blue-400" },
  unplanned: { label: "לא מתוכנן", cls: "bg-red-500/20 text-red-400" },
  break: { label: "הפסקה", cls: "bg-zinc-500/20 text-zinc-400" },
};

const impactStyle: Record<string, string> = {
  "גבוה": "bg-red-500/20 text-red-400",
  "בינוני": "bg-amber-500/20 text-amber-400",
  "נמוך": "bg-emerald-500/20 text-emerald-400",
};

const TH = "text-right text-[10px] font-semibold";
const TD = "text-xs";

export default function MaintenanceDowntime() {
  const { data: apiData } = useQuery({
    queryKey: ["production-maintenance-downtime"],
    queryFn: () => authFetch("/api/production/machines?type=downtime").then(r => r.json()),
  });
  const safeArr = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
  const kpis = (apiData as any)?.kpis || FALLBACK_KPIS;
  const preventive = safeArr(apiData?.preventive).length > 0 ? safeArr(apiData.preventive) : FALLBACK_PREVENTIVE;
  const breakdowns = safeArr(apiData?.breakdowns).length > 0 ? safeArr(apiData.breakdowns) : FALLBACK_BREAKDOWNS;
  const downtimeLog = safeArr(apiData?.downtimeLog).length > 0 ? safeArr(apiData.downtimeLog) : FALLBACK_DOWNTIME_LOG;
  const stations = safeArr(apiData?.stations).length > 0 ? safeArr(apiData.stations) : FALLBACK_STATIONS;

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Wrench className="h-7 w-7 text-primary" /> תחזוקה והשבתות
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">טכנו-כל עוזי — ניהול תחזוקה מונעת, תקלות, השבתות וזמינות תחנות</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-6 gap-2">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <Card key={i} className={`${k.bg} border-0 shadow-sm`}>
              <CardContent className="pt-3 pb-2 text-center px-2">
                <Icon className={`h-4 w-4 mx-auto ${k.color} mb-1`} />
                <p className="text-[9px] text-muted-foreground leading-tight">{k.label}</p>
                <p className={`text-lg font-bold font-mono ${k.color}`}>{k.value}</p>
                <p className="text-[8px] text-muted-foreground">{k.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="preventive">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="preventive" className="text-xs gap-1"><CalendarDays className="h-3.5 w-3.5" /> תחזוקה מונעת</TabsTrigger>
          <TabsTrigger value="breakdowns" className="text-xs gap-1"><AlertTriangle className="h-3.5 w-3.5" /> תקלות</TabsTrigger>
          <TabsTrigger value="downtime" className="text-xs gap-1"><Clock className="h-3.5 w-3.5" /> יומן השבתה</TabsTrigger>
          <TabsTrigger value="availability" className="text-xs gap-1"><Activity className="h-3.5 w-3.5" /> זמינות</TabsTrigger>
        </TabsList>

        {/* Tab 1 — Preventive Maintenance */}
        <TabsContent value="preventive">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className={TH}>תחנה</TableHead>
                    <TableHead className={TH}>משימה</TableHead>
                    <TableHead className={TH}>תדירות</TableHead>
                    <TableHead className={TH}>בוצע לאחרונה</TableHead>
                    <TableHead className={TH}>מועד הבא</TableHead>
                    <TableHead className={TH}>סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preventive.map((r, i) => (
                    <TableRow key={i} className={r.status === "overdue" ? "bg-red-500/5" : ""}>
                      <TableCell className={`${TD} font-medium`}>{r.station}</TableCell>
                      <TableCell className={TD}>{r.task}</TableCell>
                      <TableCell className={TD}>{r.freq}</TableCell>
                      <TableCell className="text-[10px] font-mono">{r.lastDone}</TableCell>
                      <TableCell className="text-[10px] font-mono">{r.nextDue}</TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${statusStyle[r.status].cls}`}>{statusStyle[r.status].label}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2 — Breakdown Events */}
        <TabsContent value="breakdowns">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className={TH}>תחנה</TableHead>
                    <TableHead className={TH}>התחלה</TableHead>
                    <TableHead className={TH}>משך</TableHead>
                    <TableHead className={TH}>סיבה</TableHead>
                    <TableHead className={TH}>טכנאי</TableHead>
                    <TableHead className={TH}>פתרון</TableHead>
                    <TableHead className={TH}>השפעה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {breakdowns.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className={`${TD} font-medium`}>{r.station}</TableCell>
                      <TableCell className="text-[10px] font-mono">{r.start}</TableCell>
                      <TableCell className="text-[10px] font-mono">{r.duration}</TableCell>
                      <TableCell className={TD}>{r.cause}</TableCell>
                      <TableCell className={TD}>{r.tech}</TableCell>
                      <TableCell className={TD}>{r.resolution}</TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${impactStyle[r.impact]}`}>{r.impact}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3 — Downtime Log */}
        <TabsContent value="downtime">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className={TH}>תחנה</TableHead>
                    <TableHead className={TH}>סוג</TableHead>
                    <TableHead className={TH}>התחלה</TableHead>
                    <TableHead className={TH}>סיום</TableHead>
                    <TableHead className={TH}>משך</TableHead>
                    <TableHead className={TH}>סיבה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {downtimeLog.map((r, i) => (
                    <TableRow key={i} className={r.type === "unplanned" ? "bg-red-500/5" : ""}>
                      <TableCell className={`${TD} font-medium`}>{r.station}</TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${typeStyle[r.type].cls}`}>{typeStyle[r.type].label}</Badge>
                      </TableCell>
                      <TableCell className="text-[10px] font-mono">{r.start}</TableCell>
                      <TableCell className="text-[10px] font-mono">{r.end}</TableCell>
                      <TableCell className="text-[10px] font-mono">{r.duration}</TableCell>
                      <TableCell className={TD}>{r.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4 — Station Availability */}
        <TabsContent value="availability">
          <div className="grid grid-cols-4 gap-3">
            {stations.map((s, i) => {
              const avColor = s.avail >= 90 ? "text-emerald-400" : s.avail >= 80 ? "text-amber-400" : "text-red-400";
              const barColor = s.avail >= 90 ? "[&>div]:bg-emerald-500" : s.avail >= 80 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500";
              const TrendIcon = s.trend === "up" ? TrendingUp : s.trend === "down" ? TrendingDown : Activity;
              const trendColor = s.trend === "up" ? "text-emerald-400" : s.trend === "down" ? "text-red-400" : "text-zinc-400";
              return (
                <Card key={i} className="border-zinc-700/50">
                  <CardHeader className="pb-1 pt-3 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{s.name}</CardTitle>
                      <TrendIcon className={`h-3.5 w-3.5 ${trendColor}`} />
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 space-y-2">
                    <div className="text-center">
                      <span className={`text-3xl font-bold font-mono ${avColor}`}>{s.avail}%</span>
                      <span className="text-[10px] text-muted-foreground block">זמינות</span>
                    </div>
                    <Progress value={s.avail} className={`h-2 ${barColor}`} />
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="text-center">
                        <p className="text-muted-foreground">פעילות</p>
                        <p className="font-mono font-bold text-emerald-400">{s.uptime}h</p>
                      </div>
                      <div className="text-center">
                        <p className="text-muted-foreground">השבתה</p>
                        <p className="font-mono font-bold text-red-400">{s.downtime}h</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
