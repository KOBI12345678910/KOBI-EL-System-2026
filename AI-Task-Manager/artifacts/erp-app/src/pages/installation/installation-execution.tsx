import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Activity, MapPin, Users, Clock, AlertTriangle, CheckCircle, XCircle,
  Camera, Wrench, Truck, Eye, ShieldCheck, Package
} from "lucide-react";

/* ── Static mock data ─────────────────────────────────────────── */

const activeInstallations = [
  {
    id: "INS-101", project: "מגדלי הים — חיפה", address: "שד' הנשיא 45, חיפה",
    crew: "צוות אלפא", leader: "יוסי כהן", product: "חלונות אלומיניום Premium",
    startTime: "07:30", installed: 5, total: 8, currentStep: "הכנסת זכוכית",
    issues: 1, eta: "14:30", status: "בהתקנה", progress: 62,
  },
  {
    id: "INS-102", project: "פארק המדע — רחובות", address: "רח' הרצל 12, רחובות",
    crew: "צוות בטא", leader: "שרה לוי", product: "ויטרינות חזית 3m",
    startTime: "08:00", installed: 2, total: 4, currentStep: "התקנת מסגרות",
    issues: 0, eta: "15:00", status: "בהתקנה", progress: 50,
  },
  {
    id: "INS-103", project: "קניון הדרום — באר שבע", address: "שד' רגר 50, ב\"ש",
    crew: "צוות דלתא", leader: "מיכל ברק", product: "פרגולות אלומיניום",
    startTime: "07:15", installed: 2, total: 3, currentStep: "איטום",
    issues: 0, eta: "13:00", status: "בהתקנה", progress: 78,
  },
  {
    id: "INS-104", project: "מלון ים התיכון — ת\"א", address: "רח' הירקון 200, ת\"א",
    crew: "צוות גמא", leader: "רחל אברהם", product: "מעקות זכוכית קומה 12",
    startTime: "08:15", installed: 8, total: 16, currentStep: "הכנסת זכוכית",
    issues: 2, eta: "16:30", status: "ממתין לחלק", progress: 50,
  },
  {
    id: "INS-105", project: "משרדי הייטק — הרצליה פיתוח", address: "רח' המסגר 5, הרצליה",
    crew: "צוות אפסילון", leader: "ניר אשכנזי", product: "מחיצות זכוכית משרדיות",
    startTime: "07:45", installed: 0, total: 10, currentStep: "פריקה",
    issues: 0, eta: "16:00", status: "בפריקה", progress: 8,
  },
  {
    id: "INS-106", project: "בניין מגורים — נתניה", address: "רח' שמואלי 22, נתניה",
    crew: "צוות זטא", leader: "ליאור בן-דוד", product: "חלונות דגם Comfort",
    startTime: "09:00", installed: 10, total: 14, currentStep: "בדיקה",
    issues: 1, eta: "13:30", status: "בבדיקה", progress: 88,
  },
];

const timelineEvents = [
  { time: "06:00", installation: "INS-101", event: "יציאה מהמפעל — משאית 832-45-971", icon: "truck" },
  { time: "06:00", installation: "INS-103", event: "יציאה מהמפעל — טנדר 278-93-415", icon: "truck" },
  { time: "06:15", installation: "INS-102", event: "יציאה מהמפעל — משאית 541-27-683", icon: "truck" },
  { time: "07:15", installation: "INS-103", event: "הגעה לאתר — קניון הדרום, ב\"ש", icon: "arrive" },
  { time: "07:25", installation: "INS-101", event: "הגעה לאתר — מגדלי הים, חיפה", icon: "arrive" },
  { time: "07:30", installation: "INS-101", event: "תחילת פריקה — 8 חלונות Premium", icon: "unload" },
  { time: "08:00", installation: "INS-101", event: "תחילת התקנה — מסגרות חלונות קומה 5", icon: "install" },
  { time: "08:00", installation: "INS-103", event: "תחילת התקנה — עמודי תמיכה פרגולה", icon: "install" },
  { time: "08:10", installation: "INS-104", event: "הגעה לאתר — מלון ים התיכון, ת\"א", icon: "arrive" },
  { time: "09:00", installation: "INS-106", event: "הגעה לאתר — בניין מגורים, נתניה", icon: "arrive" },
  { time: "09:30", installation: "INS-104", event: "דיווח תקלה — חלק חיבור חסר, ממתין למשלוח", icon: "issue" },
  { time: "10:00", installation: "INS-101", event: "הכנסת זכוכית — חלון 3 מתוך 8", icon: "install" },
  { time: "10:30", installation: "INS-103", event: "שלב איטום — פרגולה 2 מתוך 3", icon: "install" },
  { time: "11:00", installation: "INS-106", event: "בדיקת QC — חלונות קומה 1-2 עברו", icon: "check" },
];

const installationItems = [
  { id: "ITM-001", insId: "INS-101", product: "חלון Premium 120x150", location: "קומה 5 — חדר שינה", installed: true, qcPassed: true, notes: "" },
  { id: "ITM-002", insId: "INS-101", product: "חלון Premium 180x150", location: "קומה 5 — סלון", installed: true, qcPassed: true, notes: "" },
  { id: "ITM-003", insId: "INS-101", product: "חלון Premium 120x150", location: "קומה 5 — מטבח", installed: true, qcPassed: false, notes: "איטום צריך תיקון" },
  { id: "ITM-004", insId: "INS-101", product: "חלון Premium 80x60", location: "קומה 5 — שירותים", installed: true, qcPassed: true, notes: "" },
  { id: "ITM-005", insId: "INS-101", product: "חלון Premium 200x220", location: "קומה 6 — סלון", installed: false, qcPassed: false, notes: "בהתקנה כרגע" },
  { id: "ITM-006", insId: "INS-101", product: "חלון Premium 80x120", location: "קומה 6 — ממ\"ד", installed: false, qcPassed: false, notes: "" },
  { id: "ITM-007", insId: "INS-102", product: "ויטרינה חזית 3m — A", location: "קומת קרקע — כניסה ראשית", installed: true, qcPassed: true, notes: "" },
  { id: "ITM-008", insId: "INS-102", product: "ויטרינה חזית 3m — B", location: "קומת קרקע — חזית דרומית", installed: true, qcPassed: true, notes: "" },
  { id: "ITM-009", insId: "INS-102", product: "ויטרינה חזית 3m — C", location: "קומת קרקע — חזית מערבית", installed: false, qcPassed: false, notes: "מסגרת מוכנה" },
  { id: "ITM-010", insId: "INS-104", product: "מעקה זכוכית 1.2m", location: "קומה 12 — מרפסת A1", installed: true, qcPassed: true, notes: "" },
  { id: "ITM-011", insId: "INS-104", product: "מעקה זכוכית 1.5m", location: "קומה 12 — לובי", installed: false, qcPassed: false, notes: "ממתין לחלק חיבור" },
];

const fieldIssues = [
  {
    id: "ISS-041", insId: "INS-101", description: "סדק בזכוכית חלון קומה 5 — שירותים — נדרשת החלפה",
    severity: "גבוהה", reportedBy: "יוסי כהן", time: "09:45", photos: 2, status: "פתוח",
  },
  {
    id: "ISS-042", insId: "INS-104", description: "חלק חיבור נירוסטה U חסר — 4 יחידות — לא הגיע במשלוח",
    severity: "גבוהה", reportedBy: "רחל אברהם", time: "09:30", photos: 1, status: "ממתין למשלוח",
  },
  {
    id: "ISS-043", insId: "INS-104", description: "מידת קיר בפועל קטנה ב-2 ס\"מ מהתוכנית — מרפסת B1",
    severity: "בינונית", reportedBy: "רחל אברהם", time: "10:15", photos: 3, status: "ממתין לאישור מהנדס",
  },
  {
    id: "ISS-044", insId: "INS-106", description: "צבע מסגרת חלון לא תואם — ח. שינה קומה 2 — גוון שונה מהמפרט",
    severity: "נמוכה", reportedBy: "ליאור בן-דוד", time: "10:45", photos: 2, status: "פתוח",
  },
];

/* ── Helpers ───────────────────────────────────────────────────── */

const liveStatusColor: Record<string, string> = {
  "בפריקה": "bg-amber-500/20 text-amber-300",
  "בהתקנה": "bg-blue-500/20 text-blue-300",
  "בבדיקה": "bg-cyan-500/20 text-cyan-300",
  "ממתין לחלק": "bg-red-500/20 text-red-300",
  "הפסקה": "bg-gray-500/20 text-gray-300",
};

const severityColor: Record<string, string> = {
  "גבוהה": "bg-red-500/20 text-red-300",
  "בינונית": "bg-amber-500/20 text-amber-300",
  "נמוכה": "bg-blue-500/20 text-blue-300",
};

const timelineIconMap: Record<string, typeof Truck> = {
  truck: Truck,
  arrive: MapPin,
  unload: Package,
  install: Wrench,
  issue: AlertTriangle,
  check: ShieldCheck,
};

const Check = ({ ok }: { ok: boolean }) =>
  ok
    ? <CheckCircle className="h-4 w-4 text-emerald-400 mx-auto" />
    : <XCircle className="h-4 w-4 text-red-400 mx-auto" />;

/* ── KPI strip ────────────────────────────────────────────────── */

const kpiData = [
  { label: "התקנות פעילות", value: 6, icon: Activity, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "צוותים בשטח", value: 6, icon: Users, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "יצאו מהמפעל", value: 2, icon: Truck, color: "text-sky-400", bg: "bg-sky-500/10" },
  { label: "ממתין ללקוח", value: 1, icon: Clock, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "תקלות פתוחות", value: 4, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "פריטים שהותקנו", value: 27, icon: CheckCircle, color: "text-teal-400", bg: "bg-teal-500/10" },
];

/* ── Component ────────────────────────────────────────────────── */

export default function InstallationExecution() {
  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-500/10 rounded-lg">
            <Activity className="h-6 w-6 text-green-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              ביצוע התקנות — LIVE
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
              </span>
            </h1>
            <p className="text-sm text-gray-400">טכנו-כל עוזי — מעקב שטח בזמן אמת | {new Date().toLocaleDateString("he-IL")} {new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</p>
          </div>
        </div>
        <Badge className="bg-green-500/20 text-green-300 text-sm px-3 py-1">
          <span className="relative flex h-2 w-2 ml-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
          </span>
          LIVE
        </Badge>
      </div>

      {/* ── Live Status Strip ────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiData.map((k) => (
          <Card key={k.label} className="bg-[#1e1e2e] border-gray-700/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${k.bg}`}>
                <k.icon className={`h-5 w-5 ${k.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{k.value}</p>
                <p className="text-xs text-gray-400">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <Tabs defaultValue="active" className="space-y-4">
        <TabsList className="bg-[#1e1e2e] border border-gray-700/50">
          <TabsTrigger value="active">התקנות פעילות</TabsTrigger>
          <TabsTrigger value="timeline">ציר זמן</TabsTrigger>
          <TabsTrigger value="items">מעקב פריטים</TabsTrigger>
          <TabsTrigger value="issues">תקלות שטח</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Active Installations Grid ───────────────── */}
        <TabsContent value="active">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeInstallations.map((ins) => (
              <Card key={ins.id} className="bg-[#1e1e2e] border-gray-700/50 hover:border-blue-500/40 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base text-white">{ins.id} — {ins.project}</CardTitle>
                    <Badge className={liveStatusColor[ins.status] || "bg-gray-500/20 text-gray-300"}>
                      {ins.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center gap-2 text-gray-400">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{ins.address}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-400">
                    <Users className="h-3.5 w-3.5" />
                    <span>{ins.crew} — ראש צוות: {ins.leader}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-400">
                    <Package className="h-3.5 w-3.5" />
                    <span>{ins.product}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-400">
                    <Clock className="h-3.5 w-3.5" />
                    <span>התחלה: {ins.startTime} | ETA סיום: {ins.eta}</span>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">הותקנו {ins.installed} / {ins.total} פריטים</span>
                      <span className="text-white font-medium">{ins.progress}%</span>
                    </div>
                    <Progress value={ins.progress} className="h-2" />
                  </div>

                  {/* Step + Issues */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1.5">
                      <Wrench className="h-3.5 w-3.5 text-blue-400" />
                      <span className="text-blue-300 text-xs font-medium">{ins.currentStep}</span>
                    </div>
                    {ins.issues > 0 ? (
                      <Badge className="bg-red-500/20 text-red-300 text-xs">
                        <AlertTriangle className="h-3 w-3 ml-1" />
                        {ins.issues} תקלות
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-500/20 text-emerald-300 text-xs">
                        <CheckCircle className="h-3 w-3 ml-1" />
                        תקין
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Tab 2: Timeline ────────────────────────────────── */}
        <TabsContent value="timeline">
          <Card className="bg-[#1e1e2e] border-gray-700/50">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Clock className="h-5 w-5 text-sky-400" />
                ציר זמן — היום
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative pr-6">
                {/* vertical line */}
                <div className="absolute right-2 top-0 bottom-0 w-0.5 bg-gray-700" />
                <div className="space-y-4">
                  {timelineEvents.map((ev, idx) => {
                    const Icon = timelineIconMap[ev.icon] || Activity;
                    const isIssue = ev.icon === "issue";
                    return (
                      <div key={idx} className="flex items-start gap-3 relative">
                        <div className={`z-10 p-1.5 rounded-full ${isIssue ? "bg-red-500/20" : "bg-[#2a2a3e]"} border ${isIssue ? "border-red-500/40" : "border-gray-600"}`}>
                          <Icon className={`h-3.5 w-3.5 ${isIssue ? "text-red-400" : "text-sky-400"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-gray-500 w-12">{ev.time}</span>
                            <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">{ev.installation}</Badge>
                          </div>
                          <p className={`text-sm mt-0.5 ${isIssue ? "text-red-300" : "text-gray-300"}`}>{ev.event}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Progress Tracking — Item Table ──────────── */}
        <TabsContent value="items">
          <Card className="bg-[#1e1e2e] border-gray-700/50">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Eye className="h-5 w-5 text-teal-400" />
                מעקב פריטים — כל ההתקנות
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-700/50">
                    <TableHead className="text-gray-400 text-right">מזהה פריט</TableHead>
                    <TableHead className="text-gray-400 text-right">התקנה</TableHead>
                    <TableHead className="text-gray-400 text-right">מוצר</TableHead>
                    <TableHead className="text-gray-400 text-right">מיקום מתוכנן</TableHead>
                    <TableHead className="text-gray-400 text-center">הותקן?</TableHead>
                    <TableHead className="text-gray-400 text-center">עבר QC?</TableHead>
                    <TableHead className="text-gray-400 text-right">הערות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {installationItems.map((item) => (
                    <TableRow key={item.id} className="border-gray-700/30 hover:bg-white/5">
                      <TableCell className="text-gray-300 font-mono text-xs">{item.id}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">{item.insId}</Badge>
                      </TableCell>
                      <TableCell className="text-gray-300 text-sm">{item.product}</TableCell>
                      <TableCell className="text-gray-400 text-sm">{item.location}</TableCell>
                      <TableCell className="text-center"><Check ok={item.installed} /></TableCell>
                      <TableCell className="text-center"><Check ok={item.qcPassed} /></TableCell>
                      <TableCell className="text-gray-500 text-xs max-w-[200px] truncate">{item.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 4: Field Issues ────────────────────────────── */}
        <TabsContent value="issues">
          <Card className="bg-[#1e1e2e] border-gray-700/50">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                תקלות שטח — בזמן אמת
                <Badge className="bg-red-500/20 text-red-300 text-xs mr-2">{fieldIssues.length} פתוחות</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {fieldIssues.map((issue) => (
                <Card key={issue.id} className="bg-[#262638] border-gray-700/40">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-gray-500">{issue.id}</span>
                          <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">{issue.insId}</Badge>
                          <Badge className={severityColor[issue.severity] || "bg-gray-500/20 text-gray-300"}>
                            {issue.severity}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-200">{issue.description}</p>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {issue.reportedBy}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {issue.time}
                          </span>
                          <span className="flex items-center gap-1">
                            <Camera className="h-3 w-3" />
                            {issue.photos} תמונות
                          </span>
                        </div>
                      </div>
                      <Badge className={
                        issue.status === "פתוח"
                          ? "bg-red-500/20 text-red-300"
                          : "bg-amber-500/20 text-amber-300"
                      }>
                        {issue.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
