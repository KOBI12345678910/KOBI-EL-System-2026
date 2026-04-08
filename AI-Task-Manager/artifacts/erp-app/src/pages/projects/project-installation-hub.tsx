import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  HardHat, CalendarCheck, CheckCircle2, XCircle, FileSignature, RotateCcw,
  Search, MapPin, Users, Wrench, AlertTriangle, Calendar, ClipboardList,
  Clock, ChevronLeft, ChevronRight, Shield, Phone, Camera
} from "lucide-react";

type VisitOutcome = "planned" | "completed" | "partial" | "failed" | "cancelled";
type VisitType = "measurement" | "prep" | "installation" | "repair" | "service";

const visits = [
  { id: "VIS-001", project: "מגדל הים — חיפה", type: "measurement" as VisitType, teamLead: "חיים ביטון", plannedDate: "2026-03-10", actualDate: "2026-03-10", outcome: "completed" as VisitOutcome, signedOff: true, issues: "" },
  { id: "VIS-002", project: "מגדל הים — חיפה", type: "installation" as VisitType, teamLead: "חיים ביטון", plannedDate: "2026-03-25", actualDate: "2026-03-26", outcome: "completed" as VisitOutcome, signedOff: true, issues: "" },
  { id: "VIS-003", project: "קניון עזריאלי — זכוכית", type: "measurement" as VisitType, teamLead: "דנה לוי", plannedDate: "2026-03-15", actualDate: "2026-03-15", outcome: "completed" as VisitOutcome, signedOff: true, issues: "" },
  { id: "VIS-004", project: "קניון עזריאלי — זכוכית", type: "prep" as VisitType, teamLead: "דנה לוי", plannedDate: "2026-04-05", actualDate: "2026-04-05", outcome: "completed" as VisitOutcome, signedOff: false, issues: "גישה לקומה 3 חסומה" },
  { id: "VIS-005", project: "בית ספר אורט — דלתות", type: "installation" as VisitType, teamLead: "עמוס רז", plannedDate: "2026-04-08", actualDate: "2026-04-08", outcome: "partial" as VisitOutcome, signedOff: false, issues: "חלק מהדלתות לא הגיעו" },
  { id: "VIS-006", project: "שיכון נוף — מעקות", type: "measurement" as VisitType, teamLead: "משה דיין", plannedDate: "2026-04-10", actualDate: null, outcome: "planned" as VisitOutcome, signedOff: false, issues: "" },
  { id: "VIS-007", project: "סינמה סיטי — פרגולות", type: "installation" as VisitType, teamLead: "חיים ביטון", plannedDate: "2026-04-12", actualDate: null, outcome: "planned" as VisitOutcome, signedOff: false, issues: "" },
  { id: "VIS-008", project: "מגדל רמת גן — שערים", type: "service" as VisitType, teamLead: "עמוס רז", plannedDate: "2026-03-28", actualDate: "2026-03-28", outcome: "completed" as VisitOutcome, signedOff: true, issues: "" },
  { id: "VIS-009", project: "וילה בן דוד — חלונות", type: "measurement" as VisitType, teamLead: "דנה לוי", plannedDate: "2026-04-14", actualDate: null, outcome: "planned" as VisitOutcome, signedOff: false, issues: "" },
  { id: "VIS-010", project: "משרדים הרצליה — קירות מסך", type: "prep" as VisitType, teamLead: "משה דיין", plannedDate: "2026-04-02", actualDate: "2026-04-02", outcome: "failed" as VisitOutcome, signedOff: false, issues: "האתר לא מוכן — פיגומים חסרים" },
  { id: "VIS-011", project: "משרדים הרצליה — קירות מסך", type: "prep" as VisitType, teamLead: "משה דיין", plannedDate: "2026-04-15", actualDate: null, outcome: "planned" as VisitOutcome, signedOff: false, issues: "" },
  { id: "VIS-012", project: "מגדל הים — חיפה", type: "repair" as VisitType, teamLead: "חיים ביטון", plannedDate: "2026-04-18", actualDate: null, outcome: "planned" as VisitOutcome, signedOff: false, issues: "" },
];

const weeklySchedule = [
  { day: "ראשון", date: "2026-04-05", visits: [{ time: "08:00", project: "קניון עזריאלי", type: "הכנה", team: "צוות דנה", address: "דרך מנחם בגין 132, ת״א" }] },
  { day: "שני", date: "2026-04-06", visits: [{ time: "07:30", project: "בית ספר אורט", type: "התקנה", team: "צוות עמוס", address: "רח׳ הרצל 45, נתניה" }] },
  { day: "שלישי", date: "2026-04-07", visits: [] },
  { day: "רביעי", date: "2026-04-08", visits: [
    { time: "08:00", project: "בית ספר אורט", type: "התקנה", team: "צוות עמוס", address: "רח׳ הרצל 45, נתניה" },
    { time: "09:00", project: "מגדל הים", type: "בדיקה", team: "צוות חיים", address: "שד׳ הנשיא 88, חיפה" }
  ]},
  { day: "חמישי", date: "2026-04-09", visits: [{ time: "07:00", project: "שיכון נוף", type: "מדידה", team: "צוות משה", address: "רח׳ הגפן 3, ראשל״צ" }] },
  { day: "שישי", date: "2026-04-10", visits: [{ time: "07:00", project: "שיכון נוף", type: "מדידה", team: "צוות משה", address: "רח׳ הגפן 3, ראשל״צ" }] },
];

const scheduleSummary = {
  totalThisWeek: 6,
  teamsDeployed: 3,
  installationDays: 4,
  emptyDays: 1,
};

const teams = [
  { name: "צוות חיים", leader: "חיים ביטון", members: 6, speciality: "חלונות ודלתות", currentProject: "מגדל הים — חיפה", status: "פעיל", load: 85, nextAvail: "2026-04-19", completedThisMonth: 4, phone: "050-1234567", rating: 4.8 },
  { name: "צוות דנה", leader: "דנה לוי", members: 5, speciality: "זכוכית חזיתית", currentProject: "קניון עזריאלי", status: "פעיל", load: 70, nextAvail: "2026-04-16", completedThisMonth: 2, phone: "052-9876543", rating: 4.5 },
  { name: "צוות עמוס", leader: "עמוס רז", members: 5, speciality: "פלדה ומתכת", currentProject: "בית ספר אורט", status: "פעיל", load: 60, nextAvail: "2026-04-10", completedThisMonth: 3, phone: "054-5551234", rating: 4.2 },
  { name: "צוות משה", leader: "משה דיין", members: 4, speciality: "מעקות ופרגולות", currentProject: "—", status: "זמין", load: 20, nextAvail: "2026-04-06", completedThisMonth: 1, phone: "053-7778899", rating: 4.6 },
];

const siteIssues = [
  { id: "ISS-001", visit: "VIS-004", project: "קניון עזריאלי", description: "גישה לקומה 3 חסומה — עבודות בטון", severity: "high", reportedBy: "דנה לוי", reportedDate: "2026-04-05", status: "open", resolution: "" },
  { id: "ISS-002", visit: "VIS-005", project: "בית ספר אורט", description: "חלק מהדלתות לא הגיעו מהמפעל", severity: "critical", reportedBy: "עמוס רז", reportedDate: "2026-04-08", status: "in_progress", resolution: "משלוח חוזר מתוכנן ל-12/04" },
  { id: "ISS-003", visit: "VIS-010", project: "משרדים הרצליה", description: "פיגומים חסרים — האתר לא מוכן", severity: "high", reportedBy: "משה דיין", reportedDate: "2026-04-02", status: "in_progress", resolution: "קבלן פיגומים מתואם ל-13/04" },
  { id: "ISS-004", visit: "VIS-002", project: "מגדל הים", description: "שריטה בזכוכית — חלון קומה 10", severity: "medium", reportedBy: "חיים ביטון", reportedDate: "2026-03-26", status: "resolved", resolution: "הוחלף ב-02/04" },
  { id: "ISS-005", visit: "VIS-002", project: "מגדל הים", description: "אטימות לקויה — חלון חדר שינה קומה 12", severity: "high", reportedBy: "חיים ביטון", reportedDate: "2026-03-27", status: "open", resolution: "" },
  { id: "ISS-006", visit: "VIS-008", project: "מגדל רמת גן", description: "חיישן שער חניון לא מגיב", severity: "medium", reportedBy: "עמוס רז", reportedDate: "2026-03-28", status: "resolved", resolution: "חיישן הוחלף — תקין" },
  { id: "ISS-007", visit: "VIS-005", project: "בית ספר אורט", description: "משקוף לא ישר — דלת כיתה 4", severity: "low", reportedBy: "עמוס רז", reportedDate: "2026-04-08", status: "open", resolution: "" },
];

const typeLabel: Record<VisitType, string> = { measurement: "מדידה", prep: "הכנה", installation: "התקנה", repair: "תיקון", service: "שירות" };
const typeColor: Record<VisitType, string> = { measurement: "bg-blue-100 text-blue-800", prep: "bg-amber-100 text-amber-800", installation: "bg-green-100 text-green-800", repair: "bg-red-100 text-red-800", service: "bg-purple-100 text-purple-800" };
const outcomeLabel: Record<VisitOutcome, string> = { planned: "מתוכנן", completed: "הושלם", partial: "חלקי", failed: "נכשל", cancelled: "בוטל" };
const outcomeColor: Record<VisitOutcome, string> = { planned: "bg-slate-100 text-slate-700", completed: "bg-green-100 text-green-800", partial: "bg-amber-100 text-amber-800", failed: "bg-red-100 text-red-800", cancelled: "bg-gray-100 text-gray-500" };
const sevColor: Record<string, string> = { critical: "bg-red-600 text-white", high: "bg-red-100 text-red-800", medium: "bg-amber-100 text-amber-800", low: "bg-slate-100 text-slate-700" };
const sevLabel: Record<string, string> = { critical: "קריטי", high: "גבוה", medium: "בינוני", low: "נמוך" };
const issueStatusLabel: Record<string, string> = { open: "פתוח", in_progress: "בטיפול", resolved: "נסגר" };
const issueStatusColor: Record<string, string> = { open: "bg-red-100 text-red-800", in_progress: "bg-amber-100 text-amber-800", resolved: "bg-green-100 text-green-800" };

export default function ProjectInstallationHub() {
  const [search, setSearch] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);

  const totalVisits = visits.length;
  const completedVisits = visits.filter(v => v.outcome === "completed").length;
  const plannedVisits = visits.filter(v => v.outcome === "planned").length;
  const failedVisits = visits.filter(v => v.outcome === "failed").length;
  const signedCount = visits.filter(v => v.signedOff).length;
  const completedForSign = visits.filter(v => v.outcome === "completed" || v.outcome === "partial").length;
  const signoffRate = completedForSign > 0 ? Math.round((signedCount / completedForSign) * 100) : 0;
  const returnVisits = visits.filter(v => v.type === "repair" || v.type === "service").length;

  const filtered = visits.filter(v =>
    v.project.includes(search) || v.teamLead.includes(search) || v.id.includes(search)
  );

  const kpis = [
    { label: "סה\"כ ביקורים", value: totalVisits, icon: HardHat, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "הושלמו", value: completedVisits, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
    { label: "מתוכננים", value: plannedVisits, icon: CalendarCheck, color: "text-indigo-600", bg: "bg-indigo-50" },
    { label: "נכשלו", value: failedVisits, icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
    { label: "אישור לקוח %", value: `${signoffRate}%`, icon: FileSignature, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "ביקורי חזרה", value: returnVisits, icon: RotateCcw, color: "text-orange-600", bg: "bg-orange-50" },
  ];

  return (
    <div dir="rtl" className="p-6 space-y-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">מרכז התקנות פרויקטים</h1>
          <p className="text-gray-500 mt-1">ניהול ביקורי התקנה, צוותים, לו\"ז ובעיות אתר — טכנו-כל עוזי</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Camera className="h-4 w-4 ml-1" />דוח תמונות</Button>
          <Button size="sm"><ClipboardList className="h-4 w-4 ml-1" />ביקור חדש</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className={`${k.bg} border-0`}>
            <CardContent className="p-4 flex items-center gap-3">
              <k.icon className={`h-8 w-8 ${k.color}`} />
              <div>
                <p className="text-2xl font-bold text-gray-900">{k.value}</p>
                <p className="text-xs text-gray-600">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="visits" className="space-y-4">
        <TabsList className="grid grid-cols-4 w-full max-w-xl">
          <TabsTrigger value="visits">ביקורים</TabsTrigger>
          <TabsTrigger value="schedule">לו״ז שבועי</TabsTrigger>
          <TabsTrigger value="teams">הקצאת צוותים</TabsTrigger>
          <TabsTrigger value="issues">בעיות אתר</TabsTrigger>
        </TabsList>

        {/* Tab 1: Visits */}
        <TabsContent value="visits" className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-gray-400" />
              <Input placeholder="חיפוש לפי פרויקט, ראש צוות, מזהה..." value={search} onChange={e => setSearch(e.target.value)} className="pr-10" />
            </div>
          </div>
          {/* Completion progress bar */}
          <Card className="bg-gradient-to-l from-green-50 to-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">התקדמות ביקורים כוללת</span>
                <span className="text-sm font-bold text-green-700">{completedVisits}/{totalVisits} הושלמו</span>
              </div>
              <Progress value={Math.round((completedVisits / totalVisits) * 100)} className="h-3" />
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />הושלמו: {completedVisits}</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />חלקי: {visits.filter(v => v.outcome === "partial").length}</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />מתוכננים: {plannedVisits}</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />נכשלו: {failedVisits}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="p-3 text-right font-medium">מזהה</th>
                      <th className="p-3 text-right font-medium">פרויקט</th>
                      <th className="p-3 text-right font-medium">סוג ביקור</th>
                      <th className="p-3 text-right font-medium">ראש צוות</th>
                      <th className="p-3 text-right font-medium">תאריך מתוכנן</th>
                      <th className="p-3 text-right font-medium">תאריך בפועל</th>
                      <th className="p-3 text-right font-medium">תוצאה</th>
                      <th className="p-3 text-right font-medium">אישור לקוח</th>
                      <th className="p-3 text-right font-medium">הערות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(v => (
                      <tr key={v.id} className="border-b hover:bg-gray-50 transition-colors">
                        <td className="p-3 font-mono text-xs">{v.id}</td>
                        <td className="p-3 font-medium">{v.project}</td>
                        <td className="p-3"><Badge className={`${typeColor[v.type]} border-0`}>{typeLabel[v.type]}</Badge></td>
                        <td className="p-3">{v.teamLead}</td>
                        <td className="p-3 text-gray-600">{v.plannedDate}</td>
                        <td className="p-3 text-gray-600">{v.actualDate ?? "—"}</td>
                        <td className="p-3"><Badge className={`${outcomeColor[v.outcome]} border-0`}>{outcomeLabel[v.outcome]}</Badge></td>
                        <td className="p-3 text-center">{v.signedOff ? <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto" /> : <span className="text-gray-300">—</span>}</td>
                        <td className="p-3 text-xs text-gray-500 max-w-[180px] truncate">{v.issues || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Weekly Schedule */}
        <TabsContent value="schedule" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Calendar className="h-5 w-5" />לו״ז התקנות — שבוע נוכחי</h2>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setWeekOffset(w => w - 1)}><ChevronRight className="h-4 w-4" /></Button>
              <span className="text-sm text-gray-500">שבוע {weekOffset === 0 ? "נוכחי" : weekOffset > 0 ? `+${weekOffset}` : weekOffset}</span>
              <Button variant="outline" size="icon" onClick={() => setWeekOffset(w => w + 1)}><ChevronLeft className="h-4 w-4" /></Button>
            </div>
          </div>

          {/* Schedule summary strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-blue-50 border-0">
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-blue-700">{scheduleSummary.totalThisWeek}</p>
                <p className="text-xs text-blue-600">ביקורים השבוע</p>
              </CardContent>
            </Card>
            <Card className="bg-indigo-50 border-0">
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-indigo-700">{scheduleSummary.teamsDeployed}</p>
                <p className="text-xs text-indigo-600">צוותים מוקצים</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50 border-0">
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-green-700">{scheduleSummary.installationDays}</p>
                <p className="text-xs text-green-600">ימי התקנה פעילים</p>
              </CardContent>
            </Card>
            <Card className="bg-amber-50 border-0">
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-amber-700">{scheduleSummary.emptyDays}</p>
                <p className="text-xs text-amber-600">ימים פנויים</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {weeklySchedule.map(day => (
              <Card key={day.day} className={day.visits.length === 0 ? "opacity-60" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      {day.day}
                      {day.visits.length > 0 && (
                        <Badge variant="outline" className="text-xs">{day.visits.length} ביקורים</Badge>
                      )}
                    </span>
                    <span className="text-xs text-gray-400 font-normal">{day.date}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {day.visits.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-3">אין ביקורים מתוכננים</p>
                  ) : (
                    day.visits.map((vis, i) => (
                      <div key={i} className="flex items-start gap-3 p-2 bg-blue-50 rounded-lg">
                        <Clock className="h-4 w-4 text-blue-500 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{vis.project}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">{vis.type}</Badge>
                            <span className="text-xs text-gray-500">{vis.time}</span>
                            <span className="text-xs text-gray-500">| {vis.team}</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />{vis.address}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 3: Team Allocation */}
        <TabsContent value="teams" className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Users className="h-5 w-5" />הקצאת צוותי התקנה</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {teams.map(t => (
              <Card key={t.name}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-indigo-500" />
                      {t.name}
                    </span>
                    <Badge className={t.status === "זמין" ? "bg-green-100 text-green-800 border-0" : "bg-blue-100 text-blue-800 border-0"}>{t.status}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-1"><Users className="h-3.5 w-3.5 text-gray-400" /><span className="text-gray-600">ראש צוות:</span><span className="font-medium">{t.leader}</span></div>
                    <div className="flex items-center gap-1"><HardHat className="h-3.5 w-3.5 text-gray-400" /><span className="text-gray-600">חברים:</span><span className="font-medium">{t.members}</span></div>
                    <div className="flex items-center gap-1"><Wrench className="h-3.5 w-3.5 text-gray-400" /><span className="text-gray-600">התמחות:</span><span className="font-medium">{t.speciality}</span></div>
                    <div className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-gray-400" /><span className="text-gray-600">פרויקט:</span><span className="font-medium">{t.currentProject}</span></div>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1 text-gray-500"><CheckCircle2 className="h-3.5 w-3.5 text-green-500" />הושלמו החודש: <strong className="text-gray-700">{t.completedThisMonth}</strong></span>
                    <span className="flex items-center gap-1 text-gray-500">
                      דירוג: <strong className="text-amber-600">{t.rating}</strong>/5
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>עומס עבודה</span>
                      <span className={t.load > 80 ? "text-red-600 font-semibold" : ""}>{t.load}%</span>
                    </div>
                    <Progress value={t.load} className="h-2" />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">זמינות הבאה: {t.nextAvail}</span>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" className="h-7 text-xs"><Phone className="h-3 w-3 ml-1" />{t.phone}</Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs"><Calendar className="h-3 w-3 ml-1" />תזמון</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Team capacity summary */}
          <Card className="bg-gradient-to-l from-indigo-50 to-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="font-semibold text-sm">סיכום כוח אדם</h3>
                  <p className="text-xs text-gray-500">סה״כ {teams.reduce((s, t) => s + t.members, 0)} מתקינים ב-{teams.length} צוותים | ממוצע עומס: {Math.round(teams.reduce((s, t) => s + t.load, 0) / teams.length)}%</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <p className="text-lg font-bold text-green-700">{teams.filter(t => t.status === "זמין").length}</p>
                    <p className="text-xs text-gray-500">זמינים</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-blue-700">{teams.filter(t => t.status === "פעיל").length}</p>
                    <p className="text-xs text-gray-500">פעילים</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-amber-700">{teams.reduce((s, t) => s + t.completedThisMonth, 0)}</p>
                    <p className="text-xs text-gray-500">הושלמו החודש</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Site Issues */}
        <TabsContent value="issues" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2"><AlertTriangle className="h-5 w-5" />בעיות אתר ומעקב פתרון</h2>
            <div className="flex gap-2">
              <Badge className="bg-red-100 text-red-800 border-0">פתוחות: {siteIssues.filter(i => i.status === "open").length}</Badge>
              <Badge className="bg-amber-100 text-amber-800 border-0">בטיפול: {siteIssues.filter(i => i.status === "in_progress").length}</Badge>
              <Badge className="bg-green-100 text-green-800 border-0">נסגרו: {siteIssues.filter(i => i.status === "resolved").length}</Badge>
            </div>
          </div>
          <div className="space-y-3">
            {siteIssues.map(issue => (
              <Card key={issue.id} className={issue.status === "resolved" ? "opacity-60" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-gray-400">{issue.id}</span>
                        <Badge className={`${sevColor[issue.severity]} border-0 text-xs`}>{sevLabel[issue.severity]}</Badge>
                        <Badge className={`${issueStatusColor[issue.status]} border-0 text-xs`}>{issueStatusLabel[issue.status]}</Badge>
                      </div>
                      <p className="font-medium text-sm">{issue.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{issue.project}</span>
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{issue.reportedBy}</span>
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{issue.reportedDate}</span>
                        <span className="font-mono">{issue.visit}</span>
                      </div>
                      {issue.resolution && (
                        <div className="mt-2 p-2 bg-green-50 rounded text-xs text-green-800 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>פתרון: {issue.resolution}</span>
                        </div>
                      )}
                    </div>
                    {issue.status !== "resolved" && (
                      <Button variant="outline" size="sm" className="mr-3 text-xs">עדכן סטטוס</Button>
                    )}
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