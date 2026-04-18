import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  HardHat, MapPin, Clock, AlertTriangle, CheckCircle, TrendingUp,
  Users, Truck, Star, CalendarDays, Shield, DollarSign,
  Eye, BarChart3, ClipboardList, Calendar
} from "lucide-react";

const fmt = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);

const FALLBACK_ACTIVE_INSTALLATIONS = [
  { id: "INS-2461", project: "מגדלי הים — חלונות קומה 12", crew: "צוות אלפא — יוסי כהן", location: "הרצליה, רח׳ הנשיא 40", progress: 72, status: "בשטח", eta: "16:30", phone: "050-7712345" },
  { id: "INS-2462", project: "פרויקט אקו-טאואר — ויטרינות לובי", crew: "צוות בטא — מוחמד עאמר", location: "תל אביב, שד׳ רוטשילד 88", progress: 45, status: "בשטח", eta: "18:00", phone: "052-3345678" },
  { id: "INS-2463", project: "קניון הגליל — חזיתות זכוכית", crew: "צוות גמא — דני לוי", location: "נהריה, סמוך לכיכר העצמאות", progress: 15, status: "בדרך", eta: "10:30", phone: "054-9987654" },
  { id: "INS-2464", project: "בית חולים שערי צדק — דלתות אש", crew: "צוות דלתא — אבי מזרחי", location: "ירושלים, רח׳ יפו 12", progress: 88, status: "בשטח", eta: "14:00", phone: "050-2234567" },
  { id: "INS-2465", project: "שכונת הפארק — חלונות דירות", crew: "צוות אלפא-2 — ראובן בן דוד", location: "באר שבע, שכונת רמות", progress: 0, status: "ממתין", eta: "11:00", phone: "053-6654321" },
  { id: "INS-2466", project: "בניין משרדים רמת החייל — מחיצות", crew: "צוות בטא-2 — סאמר חורי", location: "תל אביב, רמת החייל", progress: 35, status: "בשטח", eta: "17:30", phone: "058-4412345" },
];
const FALLBACK_TODAY_SCHEDULE = [
  { time: "06:00", event: "טעינת משאית — פרויקט אקו-טאואר", crew: "צוות בטא", type: "loading" },
  { time: "06:30", event: "יציאה למגדלי הים — הרצליה", crew: "צוות אלפא", type: "dispatch" },
  { time: "07:00", event: "תחילת התקנה — מגדלי הים קומה 12", crew: "צוות אלפא", type: "install" },
  { time: "07:30", event: "הגעה לאקו-טאואר — פריקה והכנה", crew: "צוות בטא", type: "install" },
  { time: "10:00", event: "הפסקה + תדריך בטיחות — כל הצוותים", crew: "כלל", type: "break" },
  { time: "12:30", event: "מסירה ללקוח — בית חולים שערי צדק", crew: "צוות דלתא", type: "handover" },
  { time: "14:00", event: "יציאה לבאר שבע — שכונת הפארק", crew: "צוות אלפא-2", type: "dispatch" },
  { time: "16:00", event: "סיכום יומי + דיווח מנהל פרויקט", crew: "הנהלה", type: "summary" },
];
const FALLBACK_TEAM_PERFORMANCE = [
  { team: "צוות אלפא — יוסי כהן", completed: 38, avgDays: 2.1, quality: 96, rating: 4.8, costEfficiency: 92, speciality: "חלונות + ויטרינות" },
  { team: "צוות בטא — מוחמד עאמר", completed: 32, avgDays: 2.4, quality: 94, rating: 4.6, costEfficiency: 88, speciality: "חזיתות זכוכית" },
  { team: "צוות גמא — דני לוי", completed: 28, avgDays: 2.8, quality: 91, rating: 4.3, costEfficiency: 85, speciality: "מחיצות + קירות מסך" },
  { team: "צוות דלתא — אבי מזרחי", completed: 35, avgDays: 1.9, quality: 97, rating: 4.9, costEfficiency: 95, speciality: "דלתות אש + ביטחון" },
];
const FALLBACK_EXCEPTIONS = [
  { id: "EX-301", type: "מידות", severity: "גבוהה", site: "מגדלי הים — קומה 12", desc: "פתח חלון חריג ב-3 ס\"מ — דרוש חיתוך מיוחד", crew: "צוות אלפא", status: "בטיפול", date: "2026-04-08" },
  { id: "EX-302", type: "חומר", severity: "בינונית", site: "אקו-טאואר — לובי", desc: "זכוכית Low-E הגיעה עם שריטות — 4 יחידות", crew: "צוות בטא", status: "ממתין לחלופה", date: "2026-04-07" },
  { id: "EX-303", type: "גישה", severity: "גבוהה", site: "קניון הגליל — חזית צפון", desc: "פיגום לא מאושר — דרוש אישור מהנדס", crew: "צוות גמא", status: "עוצר עבודה", date: "2026-04-08" },
  { id: "EX-304", type: "בטיחות", severity: "קריטית", site: "בניין משרדים רמת החייל", desc: "חוסר ברתמות גובה — 2 עובדים", crew: "צוות בטא-2", status: "נפתר", date: "2026-04-06" },
  { id: "EX-305", type: "לקוח", severity: "בינונית", site: "שכונת הפארק — באר שבע", desc: "לקוח שינה צבע פרופיל ברגע האחרון", crew: "צוות אלפא-2", status: "ממתין לאישור", date: "2026-04-07" },
  { id: "EX-306", type: "מידות", severity: "נמוכה", site: "בית חולים שערי צדק", desc: "דלת אש רחבה ב-5 מ\"מ — מתאים עם אטם", crew: "צוות דלתא", status: "נסגר", date: "2026-04-05" },
];
const FALLBACK_WEEKLY_SCHEDULE = [
  { day: "ראשון 06/04", installations: [
    { project: "מגדלי הים — קומה 11", crew: "צוות אלפא", status: "הושלם" },
    { project: "אקו-טאואר — קומה 3", crew: "צוות בטא", status: "הושלם" },
  ]},
  { day: "שני 07/04", installations: [
    { project: "מגדלי הים — קומה 12", crew: "צוות אלפא", status: "בביצוע" },
    { project: "בית חולים שערי צדק", crew: "צוות דלתא", status: "בביצוע" },
  ]},
  { day: "שלישי 08/04", installations: [
    { project: "אקו-טאואר — ויטרינות לובי", crew: "צוות בטא", status: "בביצוע" },
    { project: "קניון הגליל — חזית צפון", crew: "צוות גמא", status: "ממתין לאישור" },
  ]},
  { day: "רביעי 09/04", installations: [
    { project: "שכונת הפארק — בניין A", crew: "צוות אלפא-2", status: "מתוכנן" },
    { project: "בניין משרדים רמת החייל", crew: "צוות בטא-2", status: "מתוכנן" },
  ]},
  { day: "חמישי 10/04", installations: [
    { project: "שכונת הפארק — בניין B", crew: "צוות אלפא-2", status: "מתוכנן" },
    { project: "מגדלי הים — קומה 13", crew: "צוות אלפא", status: "מתוכנן" },
  ]},
];
const statusColor = (s: string) => s === "בשטח" ? "bg-emerald-100 text-emerald-700" : s === "בדרך" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600";
const severityColor = (s: string) => s === "קריטית" ? "bg-red-100 text-red-700" : s === "גבוהה" ? "bg-orange-100 text-orange-700" : s === "בינונית" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600";
const weeklyStatusColor = (s: string) => s === "הושלם" ? "bg-emerald-100 text-emerald-700" : s === "בביצוע" ? "bg-blue-100 text-blue-700" : s === "ממתין לאישור" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600";
const typeIcon = (t: string) => t === "loading" ? "📦" : t === "dispatch" ? "🚛" : t === "install" ? "🔧" : t === "break" ? "☕" : t === "handover" ? "🤝" : "📋";

export default function InstallationCommandCenter() {
  const { data: activeInstallations = FALLBACK_ACTIVE_INSTALLATIONS } = useQuery({
    queryKey: ["installation-active-installations"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-command-center/active-installations");
      if (!res.ok) return FALLBACK_ACTIVE_INSTALLATIONS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_ACTIVE_INSTALLATIONS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: todaySchedule = FALLBACK_TODAY_SCHEDULE } = useQuery({
    queryKey: ["installation-today-schedule"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-command-center/today-schedule");
      if (!res.ok) return FALLBACK_TODAY_SCHEDULE;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_TODAY_SCHEDULE;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: teamPerformance = FALLBACK_TEAM_PERFORMANCE } = useQuery({
    queryKey: ["installation-team-performance"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-command-center/team-performance");
      if (!res.ok) return FALLBACK_TEAM_PERFORMANCE;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_TEAM_PERFORMANCE;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: exceptions = FALLBACK_EXCEPTIONS } = useQuery({
    queryKey: ["installation-exceptions"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-command-center/exceptions");
      if (!res.ok) return FALLBACK_EXCEPTIONS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_EXCEPTIONS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: weeklySchedule = FALLBACK_WEEKLY_SCHEDULE } = useQuery({
    queryKey: ["installation-weekly-schedule"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-command-center/weekly-schedule");
      if (!res.ok) return FALLBACK_WEEKLY_SCHEDULE;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_WEEKLY_SCHEDULE;
    },
    staleTime: 30_000,
    retry: 1,
  });


  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <HardHat className="h-7 w-7 text-primary" /> מרכז פיקוד התקנות
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">טכנו-כל עוזי | התקנות שטח | צוותים | חריגות | לו״ז שבועי</p>
        </div>
        <Badge className="bg-primary/10 text-primary text-xs px-3 py-1">
          <Clock className="h-3.5 w-3.5 ml-1 inline" />
          {new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </Badge>
      </div>

      {/* KPI Strip — 8 cards */}
      <div className="grid grid-cols-8 gap-2">
        {[
          { label: "התקנות פעילות", value: "6", icon: HardHat, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "ממתינות לתיאום", value: "4", icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "הושלמו החודש", value: "14", icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "חריגות פתוחות", value: "3", icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
          { label: "מוכנות אתר ממוצעת", value: "82%", icon: Shield, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "שביעות רצון לקוח", value: "4.6/5", icon: Star, color: "text-yellow-600", bg: "bg-yellow-50" },
          { label: "עלות ממוצעת להתקנה", value: fmt(18500), icon: DollarSign, color: "text-indigo-600", bg: "bg-indigo-50" },
          { label: "רווחיות התקנות", value: "28%", icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
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

      {/* Live Operations Map */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" /> מפת פעילות חיה — 6 התקנות פעילות
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-right text-[10px] font-semibold">מס׳</TableHead>
                <TableHead className="text-right text-[10px] font-semibold">פרויקט</TableHead>
                <TableHead className="text-right text-[10px] font-semibold">צוות</TableHead>
                <TableHead className="text-right text-[10px] font-semibold">מיקום</TableHead>
                <TableHead className="text-right text-[10px] font-semibold w-28">התקדמות</TableHead>
                <TableHead className="text-right text-[10px] font-semibold">סטטוס</TableHead>
                <TableHead className="text-right text-[10px] font-semibold">ETA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeInstallations.map(inst => (
                <TableRow key={inst.id} className={inst.status === "ממתין" ? "bg-gray-50/40" : ""}>
                  <TableCell className="font-mono text-[10px] text-primary">{inst.id}</TableCell>
                  <TableCell className="text-xs font-medium">{inst.project}</TableCell>
                  <TableCell className="text-[10px]">{inst.crew}</TableCell>
                  <TableCell className="text-[10px] text-muted-foreground">{inst.location}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Progress value={inst.progress} className={`h-2 w-16 ${inst.progress === 0 ? "[&>div]:bg-gray-300" : inst.progress > 80 ? "[&>div]:bg-emerald-500" : ""}`} />
                      <span className="text-[9px] font-mono">{inst.progress}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-[8px] ${statusColor(inst.status)}`}>{inst.status}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-[10px]">{inst.eta}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Today's Schedule Timeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" /> לוח זמנים יומי — היום
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {todaySchedule.map((ev, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5 border-b last:border-0">
                <span className="text-lg">{typeIcon(ev.type)}</span>
                <span className="font-mono text-xs font-bold w-12 shrink-0">{ev.time}</span>
                <div className="flex-1">
                  <p className="text-xs font-medium">{ev.event}</p>
                  <p className="text-[10px] text-muted-foreground">{ev.crew}</p>
                </div>
                <Badge className={`text-[8px] ${
                  ev.type === "install" ? "bg-emerald-100 text-emerald-700" :
                  ev.type === "dispatch" ? "bg-blue-100 text-blue-700" :
                  ev.type === "handover" ? "bg-purple-100 text-purple-700" :
                  ev.type === "loading" ? "bg-indigo-100 text-indigo-700" :
                  "bg-gray-100 text-gray-600"
                }`}>
                  {ev.type === "install" ? "התקנה" : ev.type === "dispatch" ? "יציאה" :
                   ev.type === "handover" ? "מסירה" : ev.type === "loading" ? "טעינה" :
                   ev.type === "break" ? "הפסקה" : "סיכום"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="grid grid-cols-4 w-full max-w-lg">
          <TabsTrigger value="overview" className="text-xs gap-1"><Eye className="h-3.5 w-3.5" /> סקירה</TabsTrigger>
          <TabsTrigger value="performance" className="text-xs gap-1"><BarChart3 className="h-3.5 w-3.5" /> ביצועים</TabsTrigger>
          <TabsTrigger value="exceptions" className="text-xs gap-1"><AlertTriangle className="h-3.5 w-3.5" /> חריגות ({exceptions.filter(e => e.status !== "נסגר").length})</TabsTrigger>
          <TabsTrigger value="weekly" className="text-xs gap-1"><Calendar className="h-3.5 w-3.5" /> לו״ז שבועי</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <Card className="border-blue-200 bg-blue-50/30">
              <CardHeader className="pb-1"><CardTitle className="text-xs text-blue-700">סטטוס התקנות</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {[
                  { label: "בביצוע", count: 6, pct: 25, color: "bg-blue-500" },
                  { label: "ממתינות לתיאום", count: 4, pct: 17, color: "bg-amber-500" },
                  { label: "הושלמו החודש", count: 14, pct: 58, color: "bg-emerald-500" },
                ].map((s, i) => (
                  <div key={i} className="space-y-0.5">
                    <div className="flex justify-between text-[10px]">
                      <span>{s.label}</span>
                      <span className="font-mono font-bold">{s.count}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${s.color} rounded-full`} style={{ width: `${s.pct}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="border-emerald-200 bg-emerald-50/30">
              <CardHeader className="pb-1"><CardTitle className="text-xs text-emerald-700">תוכנית השבוע</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                <div className="flex justify-between text-[10px]"><span>התקנות מתוכננות</span><span className="font-mono font-bold">10</span></div>
                <div className="flex justify-between text-[10px]"><span>צוותים פעילים</span><span className="font-mono font-bold">6</span></div>
                <div className="flex justify-between text-[10px]"><span>משאיות מוקצות</span><span className="font-mono font-bold">4</span></div>
                <div className="flex justify-between text-[10px]"><span>הכנסה צפויה</span><span className="font-mono font-bold">{fmt(185000)}</span></div>
                <div className="flex justify-between text-[10px]"><span>ימי עבודה בשטח</span><span className="font-mono font-bold">22</span></div>
              </CardContent>
            </Card>
            <Card className="border-red-200 bg-red-50/30">
              <CardHeader className="pb-1"><CardTitle className="text-xs text-red-700">התראות דחופות</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {[
                  { alert: "פיגום לא מאושר — קניון הגליל", severity: "קריטי" },
                  { alert: "חומר חסר — זכוכית Low-E לאקו-טאואר", severity: "גבוה" },
                  { alert: "שינוי מפרט — שכונת הפארק באר שבע", severity: "בינוני" },
                ].map((a, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <AlertTriangle className={`h-3 w-3 mt-0.5 shrink-0 ${i === 0 ? "text-red-500" : i === 1 ? "text-orange-500" : "text-amber-500"}`} />
                    <div>
                      <p className="text-[10px] font-medium">{a.alert}</p>
                      <p className="text-[9px] text-muted-foreground">{a.severity}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> ביצועי צוותים — שנתי מצטבר
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">צוות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">התמחות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">התקנות הושלמו</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">זמן ממוצע (ימים)</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">ציון איכות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">דירוג לקוח</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">יעילות עלות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamPerformance.map((t, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-medium">{t.team}</TableCell>
                      <TableCell className="text-[10px] text-muted-foreground">{t.speciality}</TableCell>
                      <TableCell className="font-mono text-xs text-center">{t.completed}</TableCell>
                      <TableCell className="font-mono text-xs text-center">{t.avgDays}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 justify-center">
                          <Progress value={t.quality} className={`h-2 w-12 ${t.quality >= 95 ? "[&>div]:bg-emerald-500" : t.quality >= 90 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500"}`} />
                          <span className="text-[9px] font-mono">{t.quality}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`text-xs font-bold ${t.rating >= 4.7 ? "text-emerald-600" : t.rating >= 4.4 ? "text-blue-600" : "text-amber-600"}`}>
                          {t.rating}
                        </span>
                        <Star className="h-3 w-3 inline text-yellow-500 mr-0.5" />
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[8px] ${t.costEfficiency >= 90 ? "bg-emerald-100 text-emerald-700" : t.costEfficiency >= 85 ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                          {t.costEfficiency}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Exceptions Tab */}
        <TabsContent value="exceptions">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" /> חריגות פתוחות — {exceptions.filter(e => e.status !== "נסגר").length} פעילות
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">מס׳</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סוג</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">חומרה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">אתר</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תיאור</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">צוות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סטטוס</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תאריך</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exceptions.map(ex => (
                    <TableRow key={ex.id} className={ex.severity === "קריטית" ? "bg-red-50/30" : ex.status === "עוצר עבודה" ? "bg-orange-50/30" : ""}>
                      <TableCell className="font-mono text-[10px] text-primary">{ex.id}</TableCell>
                      <TableCell>
                        <Badge className="text-[8px] bg-slate-100 text-slate-700">{ex.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[8px] ${severityColor(ex.severity)}`}>{ex.severity}</Badge>
                      </TableCell>
                      <TableCell className="text-[10px] font-medium">{ex.site}</TableCell>
                      <TableCell className="text-[10px] max-w-[200px]">{ex.desc}</TableCell>
                      <TableCell className="text-[10px]">{ex.crew}</TableCell>
                      <TableCell>
                        <Badge className={`text-[8px] ${
                          ex.status === "נסגר" ? "bg-emerald-100 text-emerald-700" :
                          ex.status === "נפתר" ? "bg-emerald-100 text-emerald-700" :
                          ex.status === "עוצר עבודה" ? "bg-red-100 text-red-700" :
                          ex.status === "בטיפול" ? "bg-blue-100 text-blue-700" :
                          "bg-amber-100 text-amber-700"
                        }`}>{ex.status}</Badge>
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground">{ex.date}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Weekly Schedule Tab */}
        <TabsContent value="weekly">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" /> לו״ז שבועי — 06/04 עד 10/04
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-3">
                {weeklySchedule.map((day, i) => (
                  <div key={i} className="border rounded-lg p-2">
                    <p className="text-xs font-bold text-center mb-2 pb-1 border-b">{day.day}</p>
                    <div className="space-y-2">
                      {day.installations.map((inst, j) => (
                        <div key={j} className="p-1.5 rounded bg-muted/30 space-y-1">
                          <p className="text-[10px] font-medium leading-tight">{inst.project}</p>
                          <div className="flex items-center gap-1">
                            <Truck className="h-2.5 w-2.5 text-muted-foreground" />
                            <span className="text-[9px] text-muted-foreground">{inst.crew}</span>
                          </div>
                          <Badge className={`text-[7px] ${weeklyStatusColor(inst.status)}`}>{inst.status}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
