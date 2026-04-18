import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Ruler, PenLine, FileCheck, MapPin, GitBranch, ClipboardList,
  TrendingUp, TrendingDown, Clock, CheckCircle2, AlertTriangle,
} from "lucide-react";

/* ── submodules covered ──
   technical_drawings, revision_control, drawing_approvals,
   measurement_files, site_measurements, technical_specs,
   cutting_instructions, installation_drawings,
   customer_approval_on_drawings, change_orders, engineering_tasks
*/

// ── Drawings ──
const FALLBACK_DRAWINGS = [
  { id: "DWG-101", project: "בניין משרדים רמת גן", type: "שרטוט ייצור", rev: "C", status: "approved", designer: "יוסי כהן" },
  { id: "DWG-102", project: "מפעל אלקטרוניקה חיפה", type: "שרטוט התקנה", rev: "B", status: "review", designer: "שרה לוי" },
  { id: "DWG-103", project: "מרכז מסחרי באר שבע", type: "שרטוט מדידות", rev: "A", status: "draft", designer: "דוד מזרחי" },
  { id: "DWG-104", project: "בית חולים אשדוד", type: "שרטוט ייצור", rev: "D", status: "released", designer: "רחל אברהם" },
  { id: "DWG-105", project: "מגדל מגורים תל אביב", type: "שרטוט התקנה", rev: "A", status: "draft", designer: "אלון גולדשטיין" },
  { id: "DWG-106", project: "מפעל תעופה לוד", type: "שרטוט מדידות", rev: "B", status: "approved", designer: "מיכל ברק" },
  { id: "DWG-107", project: "קניון ירושלים", type: "שרטוט ייצור", rev: "C", status: "review", designer: "עומר חדד" },
  { id: "DWG-108", project: "מתחם ספורט נתניה", type: "שרטוט התקנה", rev: "A", status: "released", designer: "נועה פרידמן" },
];

// ── Site Measurements ──
const FALLBACK_MEASUREMENTS = [
  { project: "בניין משרדים רמת גן", date: "2026-04-01", technician: "יוסי כהן", status: "הושלם", linkedDwg: "DWG-101" },
  { project: "מפעל אלקטרוניקה חיפה", date: "2026-04-03", technician: "שרה לוי", status: "ממתין לאישור", linkedDwg: "DWG-102" },
  { project: "מרכז מסחרי באר שבע", date: "2026-04-05", technician: "דוד מזרחי", status: "בתהליך", linkedDwg: "DWG-103" },
  { project: "בית חולים אשדוד", date: "2026-04-02", technician: "רחל אברהם", status: "הושלם", linkedDwg: "DWG-104" },
  { project: "מגדל מגורים תל אביב", date: "2026-04-06", technician: "אלון גולדשטיין", status: "ממתין לאישור", linkedDwg: "DWG-105" },
  { project: "מפעל תעופה לוד", date: "2026-04-04", technician: "מיכל ברק", status: "הושלם", linkedDwg: "DWG-106" },
  { project: "קניון ירושלים", date: "2026-04-07", technician: "עומר חדד", status: "בתהליך", linkedDwg: "DWG-107" },
  { project: "מתחם ספורט נתניה", date: "2026-04-08", technician: "נועה פרידמן", status: "ממתין לאישור", linkedDwg: "DWG-108" },
];

// ── Change Orders ──
const FALLBACK_CHANGEORDERS = [
  { id: "ECO-001", project: "בניין משרדים רמת גן", desc: "שינוי מידות חלון ראשי", impact: "גבוה", requester: "לקוח", status: "אושר" },
  { id: "ECO-002", project: "מפעל אלקטרוניקה חיפה", desc: "החלפת סוג פרופיל דלתות", impact: "בינוני", requester: "הנדסה", status: "בבדיקה" },
  { id: "ECO-003", project: "מרכז מסחרי באר שבע", desc: "הוספת חלון נוסף בקומה 3", impact: "גבוה", requester: "אדריכל", status: "ממתין" },
  { id: "ECO-004", project: "בית חולים אשדוד", desc: "שינוי זכוכית למעבדה", impact: "נמוך", requester: "הנדסה", status: "אושר" },
  { id: "ECO-005", project: "מגדל מגורים תל אביב", desc: "עדכון מפרט בידוד תרמי", impact: "בינוני", requester: "לקוח", status: "נדחה" },
  { id: "ECO-006", project: "מפעל תעופה לוד", desc: "שינוי כיוון פתיחת שער", impact: "גבוה", requester: "בטיחות", status: "בבדיקה" },
  { id: "ECO-007", project: "קניון ירושלים", desc: "החלפת חיפוי חיצוני", impact: "בינוני", requester: "אדריכל", status: "אושר" },
  { id: "ECO-008", project: "מתחם ספורט נתניה", desc: "תוספת מערכת איוורור", impact: "נמוך", requester: "הנדסה", status: "ממתין" },
];

// ── Engineering Tasks ──
const FALLBACK_TASKS = [
  { task: "עדכון מפרט טכני פרויקט רמת גן", project: "בניין משרדים רמת גן", assignee: "יוסי כהן", priority: "גבוהה", due: "2026-04-10", status: "בעבודה" },
  { task: "בדיקת תאימות שרטוטים לתקן", project: "מפעל אלקטרוניקה חיפה", assignee: "שרה לוי", priority: "דחופה", due: "2026-04-09", status: "בעבודה" },
  { task: "הכנת הוראות חיתוך אצווה 45", project: "מרכז מסחרי באר שבע", assignee: "דוד מזרחי", priority: "רגילה", due: "2026-04-15", status: "ממתין" },
  { task: "אישור לקוח על שרטוט התקנה", project: "בית חולים אשדוד", assignee: "רחל אברהם", priority: "גבוהה", due: "2026-04-11", status: "בעבודה" },
  { task: "הכנת שרטוט מדידות שטח", project: "מגדל מגורים תל אביב", assignee: "אלון גולדשטיין", priority: "רגילה", due: "2026-04-18", status: "ממתין" },
  { task: "סקירת שינויים ECO-006", project: "מפעל תעופה לוד", assignee: "מיכל ברק", priority: "דחופה", due: "2026-04-09", status: "בעבודה" },
  { task: "עדכון ספריית פרופילים", project: "קניון ירושלים", assignee: "עומר חדד", priority: "רגילה", due: "2026-04-20", status: "הושלם" },
  { task: "הפקת דוח סטיות מידות", project: "מתחם ספורט נתניה", assignee: "נועה פרידמן", priority: "גבוהה", due: "2026-04-12", status: "בעבודה" },
];

// ── badge color helpers ──
const dwgStatusColor = (s: string) =>
  s === "approved" ? "bg-green-500/20 text-green-300"
  : s === "released" ? "bg-blue-500/20 text-blue-300"
  : s === "review" ? "bg-amber-500/20 text-amber-300"
  : "bg-gray-500/20 text-gray-300";

const dwgStatusLabel = (s: string) =>
  s === "approved" ? "מאושר" : s === "released" ? "שוחרר" : s === "review" ? "בבדיקה" : "טיוטה";

const measColor = (s: string) =>
  s === "הושלם" ? "bg-green-500/20 text-green-300"
  : s === "ממתין לאישור" ? "bg-amber-500/20 text-amber-300"
  : "bg-blue-500/20 text-blue-300";

const impactColor = (s: string) =>
  s === "גבוה" ? "bg-red-500/20 text-red-300"
  : s === "בינוני" ? "bg-orange-500/20 text-orange-300"
  : "bg-green-500/20 text-green-300";

const ecoStatusColor = (s: string) =>
  s === "אושר" ? "bg-green-500/20 text-green-300"
  : s === "נדחה" ? "bg-red-500/20 text-red-300"
  : s === "בבדיקה" ? "bg-amber-500/20 text-amber-300"
  : "bg-gray-500/20 text-gray-300";

const prioColor = (s: string) =>
  s === "דחופה" ? "bg-red-500/20 text-red-300"
  : s === "גבוהה" ? "bg-orange-500/20 text-orange-300"
  : "bg-blue-500/20 text-blue-300";

const taskStatusColor = (s: string) =>
  s === "הושלם" ? "bg-green-500/20 text-green-300"
  : s === "בעבודה" ? "bg-blue-500/20 text-blue-300"
  : "bg-gray-500/20 text-gray-300";

const th = "p-3 text-right text-muted-foreground font-medium text-xs";
const td = "p-3 text-sm";

export default function EngineeringOffice() {
  const { data: apidrawings } = useQuery({
    queryKey: ["/api/engineering/engineering-office/drawings"],
    queryFn: () => authFetch("/api/engineering/engineering-office/drawings").then(r => r.json()).catch(() => null),
  });
  const drawings = Array.isArray(apidrawings) ? apidrawings : (apidrawings?.data ?? apidrawings?.items ?? FALLBACK_DRAWINGS);


  const { data: apimeasurements } = useQuery({
    queryKey: ["/api/engineering/engineering-office/measurements"],
    queryFn: () => authFetch("/api/engineering/engineering-office/measurements").then(r => r.json()).catch(() => null),
  });
  const measurements = Array.isArray(apimeasurements) ? apimeasurements : (apimeasurements?.data ?? apimeasurements?.items ?? FALLBACK_MEASUREMENTS);


  const { data: apichangeOrders } = useQuery({
    queryKey: ["/api/engineering/engineering-office/changeorders"],
    queryFn: () => authFetch("/api/engineering/engineering-office/changeorders").then(r => r.json()).catch(() => null),
  });
  const changeOrders = Array.isArray(apichangeOrders) ? apichangeOrders : (apichangeOrders?.data ?? apichangeOrders?.items ?? FALLBACK_CHANGEORDERS);


  const { data: apitasks } = useQuery({
    queryKey: ["/api/engineering/engineering-office/tasks"],
    queryFn: () => authFetch("/api/engineering/engineering-office/tasks").then(r => r.json()).catch(() => null),
  });
  const tasks = Array.isArray(apitasks) ? apitasks : (apitasks?.data ?? apitasks?.items ?? FALLBACK_TASKS);

  const [tab, setTab] = useState("drawings");

  const kpis = [
    { label: "שרטוטים פעילים", value: "48", icon: PenLine, color: "text-blue-400", trend: "+6", up: true },
    { label: "ממתינים לאישור", value: "12", icon: FileCheck, color: "text-amber-400", trend: "+3", up: false },
    { label: "רוויזיות החודש", value: "23", icon: GitBranch, color: "text-purple-400", trend: "+5", up: true },
    { label: "מדידות שטח ממתינות", value: "5", icon: MapPin, color: "text-cyan-400", trend: "-2", up: true },
    { label: "שינויים פתוחים", value: "8", icon: AlertTriangle, color: "text-red-400", trend: "+2", up: false },
    { label: "משימות הנדסה פעילות", value: "14", icon: ClipboardList, color: "text-green-400", trend: "+1", up: true },
  ];

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Ruler className="h-6 w-6 text-blue-400" />
            משרד טכני / הנדסה
          </h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי -- Technical & Engineering Office</p>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className="bg-card/80 border-border hover:border-border transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground">{k.label}</p>
                  <p className={`text-lg font-bold font-mono mt-1 ${k.color}`}>{k.value}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {k.up ? <TrendingUp className="h-3 w-3 text-green-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}
                    <span className={`text-[10px] ${k.up ? "text-green-400" : "text-red-400"}`}>{k.trend}</span>
                  </div>
                </div>
                <k.icon className={`h-5 w-5 ${k.color} opacity-60`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Approval progress ── */}
      <Card className="bg-card/60 border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">שרטוטים מאושרים -- יעד 90%</span>
            <span className="text-sm font-mono text-green-400">75%</span>
          </div>
          <Progress value={75} className="h-2" />
        </CardContent>
      </Card>

      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="bg-card/60 border border-border w-full justify-start gap-1 p-1 h-auto flex-wrap">
          <TabsTrigger value="drawings" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><PenLine className="h-3.5 w-3.5" />שרטוטים</TabsTrigger>
          <TabsTrigger value="measurements" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><MapPin className="h-3.5 w-3.5" />מדידות</TabsTrigger>
          <TabsTrigger value="changes" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><GitBranch className="h-3.5 w-3.5" />שינויים</TabsTrigger>
          <TabsTrigger value="tasks" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><ClipboardList className="h-3.5 w-3.5" />משימות</TabsTrigger>
        </TabsList>

        {/* ── Drawings Tab ── */}
        <TabsContent value="drawings">
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
              <th className={th}>מספר שרטוט</th><th className={th}>פרויקט</th><th className={th}>סוג</th>
              <th className={th}>רוויזיה</th><th className={th}>סטטוס</th><th className={th}>שרטט</th>
            </tr></thead><tbody>
              {drawings.map((r, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className={`${td} font-mono text-blue-400 font-bold`}>{r.id}</td>
                  <td className={`${td} text-foreground font-medium`}>{r.project}</td>
                  <td className={td}><Badge className="bg-indigo-500/20 text-indigo-300 border-0 text-xs">{r.type}</Badge></td>
                  <td className={`${td} font-mono text-center text-purple-400`}>{r.rev}</td>
                  <td className={td}><Badge className={`${dwgStatusColor(r.status)} border-0 text-xs`}>{dwgStatusLabel(r.status)}</Badge></td>
                  <td className={`${td} text-muted-foreground`}>{r.designer}</td>
                </tr>
              ))}
            </tbody></table>
          </div></CardContent></Card>
        </TabsContent>

        {/* ── Measurements Tab ── */}
        <TabsContent value="measurements">
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
              <th className={th}>פרויקט</th><th className={th}>תאריך</th><th className={th}>טכנאי</th>
              <th className={th}>סטטוס</th><th className={th}>שרטוט מקושר</th>
            </tr></thead><tbody>
              {measurements.map((r, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className={`${td} text-foreground font-medium`}>{r.project}</td>
                  <td className={`${td} font-mono text-muted-foreground`}>{r.date}</td>
                  <td className={`${td} text-muted-foreground`}>{r.technician}</td>
                  <td className={td}><Badge className={`${measColor(r.status)} border-0 text-xs`}>{r.status}</Badge></td>
                  <td className={`${td} font-mono text-blue-400`}>{r.linkedDwg}</td>
                </tr>
              ))}
            </tbody></table>
          </div></CardContent></Card>
        </TabsContent>

        {/* ── Change Orders Tab ── */}
        <TabsContent value="changes">
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
              <th className={th}>מספר ECO</th><th className={th}>פרויקט</th><th className={th}>תיאור</th>
              <th className={th}>השפעה</th><th className={th}>מבקש</th><th className={th}>סטטוס</th>
            </tr></thead><tbody>
              {changeOrders.map((r, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className={`${td} font-mono text-blue-400 font-bold`}>{r.id}</td>
                  <td className={`${td} text-foreground font-medium`}>{r.project}</td>
                  <td className={`${td} text-muted-foreground max-w-[280px]`}>{r.desc}</td>
                  <td className={td}><Badge className={`${impactColor(r.impact)} border-0 text-xs`}>{r.impact}</Badge></td>
                  <td className={`${td} text-muted-foreground`}>{r.requester}</td>
                  <td className={td}><Badge className={`${ecoStatusColor(r.status)} border-0 text-xs`}>{r.status}</Badge></td>
                </tr>
              ))}
            </tbody></table>
          </div></CardContent></Card>
        </TabsContent>

        {/* ── Engineering Tasks Tab ── */}
        <TabsContent value="tasks">
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
              <th className={th}>משימה</th><th className={th}>פרויקט</th><th className={th}>אחראי</th>
              <th className={th}>עדיפות</th><th className={th}>תאריך יעד</th><th className={th}>סטטוס</th>
            </tr></thead><tbody>
              {tasks.map((r, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className={`${td} text-foreground font-medium`}>{r.task}</td>
                  <td className={`${td} text-muted-foreground`}>{r.project}</td>
                  <td className={`${td} text-muted-foreground`}>{r.assignee}</td>
                  <td className={td}><Badge className={`${prioColor(r.priority)} border-0 text-xs`}>{r.priority}</Badge></td>
                  <td className={`${td} font-mono text-muted-foreground`}>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{r.due}</span>
                  </td>
                  <td className={td}><Badge className={`${taskStatusColor(r.status)} border-0 text-xs`}>{r.status}</Badge></td>
                </tr>
              ))}
            </tbody></table>
          </div></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
