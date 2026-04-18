import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Bell, AlertTriangle, Clock, FileX, PenTool, ShieldAlert, Link2,
  HardDrive, ClipboardList, Eye, CheckCircle2, XCircle, Settings,
  AlertOctagon, Timer, Archive, FileWarning, Unlink,
} from "lucide-react";

/* ── alert type definitions ── */

const FALLBACK_ALERT_TYPES = [
  { type: "expired", label: "מסמך פג תוקף", icon: FileX, count: 3, color: "bg-red-600" },
  { type: "pending-sign", label: "חתימה ממתינה מעל 48 שעות", icon: PenTool, count: 2, color: "bg-orange-600" },
  { type: "sla-breach", label: "אישור ממתין מעל SLA", icon: Timer, count: 2, color: "bg-amber-600" },
  { type: "old-version", label: "גרסה ישנה בשימוש", icon: Archive, count: 2, color: "bg-purple-600" },
  { type: "orphan", label: "מסמך יתום (לא מקושר)", icon: Unlink, count: 2, color: "bg-slate-600" },
  { type: "storage", label: "אחסון קרוב למכסה", icon: HardDrive, count: 1, color: "bg-cyan-600" },
  { type: "checklist-gap", label: "מסמך חסר בצ'קליסט", icon: ClipboardList, count: 1, color: "bg-teal-600" },
  { type: "secret-access", label: "גישה חריגה למסמך סודי", icon: ShieldAlert, count: 2, color: "bg-rose-600" },
];

/* ── alerts data ── */

const FALLBACK_ALERTS = [
  { id: "ALR-001", type: "expired", title: "תעודת ISO 9001 פגה", description: "תעודה פגה ב-01/04/2026, יש לחדש מול מכון התקנים", doc: "DOC-620", time: "לפני 7 ימים", severity: "קריטי", action: "חדש תעודה" },
  { id: "ALR-002", type: "expired", title: "אישור רגולציה משרד הכלכלה", description: "אישור יצוא פג תוקף, חובה לחידוש לפני משלוח הבא", doc: "DOC-833", time: "לפני 3 ימים", severity: "קריטי", action: "הגש בקשה" },
  { id: "ALR-003", type: "pending-sign", title: "חוזה ספק מתכת כללי — חתימת מנכ״ל", description: "חוזה ממתין לחתימת דוד לוי כבר 72 שעות", doc: "DOC-301", time: "לפני 72 שעות", severity: "קריטי", action: "שלח תזכורת" },
  { id: "ALR-004", type: "pending-sign", title: "נספח בטיחות פרויקט אלפא", description: "נספח ממתין לחתימת מנהל בטיחות מזה 56 שעות", doc: "DOC-445", time: "לפני 56 שעות", severity: "אזהרה", action: "שלח תזכורת" },
  { id: "ALR-005", type: "sla-breach", title: "הצעת מחיר פרויקט דלתא — SLA 24 שעות", description: "אישור מנהל מכירות חרג מ-SLA ב-18 שעות", doc: "DOC-118", time: "חריגה 18 שעות", severity: "קריטי", action: "העבר להנהלה" },
  { id: "ALR-006", type: "sla-breach", title: "אישור דוח תפעול חודשי — SLA 48 שעות", description: "דוח מרץ ממתין לאישור סמנכ״ל תפעול 52 שעות", doc: "DOC-512", time: "חריגה 4 שעות", severity: "אזהרה", action: "שלח תזכורת" },
  { id: "ALR-007", type: "old-version", title: "מפרט טכני PCB-8L — Rev B בשימוש", description: "קו ייצור 3 עדיין משתמש ב-Rev B במקום Rev C עדכני", doc: "DOC-205", time: "לפני 5 ימים", severity: "אזהרה", action: "עדכן גרסה" },
  { id: "ALR-008", type: "old-version", title: "נוהל בדיקת כניסה v1.2 פעיל", description: "נוהל ישן פעיל במחסן, גרסה v2.0 אושרה אך לא הופצה", doc: "DOC-390", time: "לפני 12 יום", severity: "אזהרה", action: "הפץ גרסה" },
  { id: "ALR-009", type: "orphan", title: "שרטוט מסגרת T-400 v2.1 — לא מקושר", description: "שרטוט הועלה אך לא קושר לפרויקט או הזמנת עבודה", doc: "DOC-715", time: "לפני 3 ימים", severity: "מידע", action: "קשר מסמך" },
  { id: "ALR-010", type: "orphan", title: "סריקת חשבונית ספק לא מזוהה", description: "קובץ סרוק ללא מטא-דאטה, לא משויך לספק או הזמנה", doc: "DOC-891", time: "לפני 5 ימים", severity: "מידע", action: "סווג ידנית" },
  { id: "ALR-011", type: "storage", title: "אחסון מחלקת הנדסה — 92% מהמכסה", description: "נפח 92GB מתוך 100GB, בעיקר קבצי CAD ו-3D כבדים", doc: "—", time: "עכשיו", severity: "אזהרה", action: "נקה קבצים" },
  { id: "ALR-012", type: "checklist-gap", title: "צ'קליסט פרויקט בטא — חסר אישור בטיחות", description: "צ'קליסט השלמת פרויקט חסר מסמך אישור בטיחות חשמל", doc: "CHK-044", time: "לפני יום", severity: "אזהרה", action: "העלה מסמך" },
  { id: "ALR-013", type: "secret-access", title: "גישה חריגה — דוח שכר הנהלה", description: "משתמש ממחלקת רכש ניסה לגשת למסמך סודי ברמה 4", doc: "DOC-SEC-012", time: "לפני שעתיים", severity: "קריטי", action: "בדוק אירוע" },
  { id: "ALR-014", type: "secret-access", title: "הורדה חשודה — תיק משפטי לקוח", description: "הורדה של 3 מסמכים סודיים ב-2 דקות ממכשיר לא מוכר", doc: "DOC-SEC-018", time: "לפני 4 שעות", severity: "קריטי", action: "חסום גישה" },
  { id: "ALR-015", type: "expired", title: "רישיון תוכנת ERP — פג תוקף", description: "רישיון שנתי פג ב-05/04/2026, יש לחדש לפני נעילה", doc: "LIC-008", time: "לפני 3 ימים", severity: "מידע", action: "חדש רישיון" },
];

const FALLBACK_CLOSED_ALERTS = [
  { id: "ALR-C01", title: "תעודת כיול מד לחץ חודשה", closedBy: "רחל אברהם", closedAt: "2026-04-06", severity: "אזהרה" },
  { id: "ALR-C02", title: "חתימת הזמנת רכש PO-2244 הושלמה", closedBy: "יוסי כהן", closedAt: "2026-04-05", severity: "אזהרה" },
  { id: "ALR-C03", title: "מסמך יתום סווג לקטגוריית ייצור", closedBy: "מערכת אוטומטית", closedAt: "2026-04-05", severity: "מידע" },
  { id: "ALR-C04", title: "גרסה ישנה של BOM הוחלפה בקו 2", closedBy: "אלון גולדשטיין", closedAt: "2026-04-04", severity: "אזהרה" },
  { id: "ALR-C05", title: "אירוע גישה חריגה נבדק — שגיאת הרשאה", closedBy: "מנהל מערכת", closedAt: "2026-04-03", severity: "קריטי" },
  { id: "ALR-C06", title: "אחסון מחלקת מכירות נוקה — ירד ל-68%", closedBy: "שרה מזרחי", closedAt: "2026-04-02", severity: "אזהרה" },
  { id: "ALR-C07", title: "צ'קליסט פרויקט גמא הושלם — כל המסמכים קיימים", closedBy: "נועה פרידמן", closedAt: "2026-04-01", severity: "מידע" },
  { id: "ALR-C08", title: "חוזה ספק חשמל נחתם ואושר", closedBy: "דוד לוי", closedAt: "2026-03-31", severity: "קריטי" },
];

const FALLBACK_THRESHOLDS = [
  { rule: "מסמך פג תוקף", trigger: "0 ימים לאחר תפוגה", notify: "בעל המסמך + מנהל", severity: "קריטי", enabled: true },
  { rule: "חתימה ממתינה", trigger: "48 שעות", notify: "החותם + מנהל ישיר", severity: "אזהרה", enabled: true },
  { rule: "אישור חורג מ-SLA", trigger: "מעבר ל-SLA שהוגדר", notify: "מנהל תהליך + הנהלה", severity: "קריטי", enabled: true },
  { rule: "גרסה ישנה בשימוש", trigger: "גרסה חדשה זמינה 48 שעות", notify: "משתמשי הגרסה הישנה", severity: "אזהרה", enabled: true },
  { rule: "מסמך יתום", trigger: "72 שעות ללא קישור", notify: "מעלה המסמך", severity: "מידע", enabled: true },
  { rule: "אחסון קרוב למכסה", trigger: "85% מנפח מוקצה", notify: "מנהל IT + מנהל מחלקה", severity: "אזהרה", enabled: true },
  { rule: "מסמך חסר בצ'קליסט", trigger: "24 שעות לפני deadline", notify: "מנהל פרויקט", severity: "אזהרה", enabled: true },
  { rule: "גישה חריגה למסמך סודי", trigger: "מיידי", notify: "מנהל אבטחת מידע + CISO", severity: "קריטי", enabled: false },
  { rule: "מסמך ללא גיבוי", trigger: "7 ימים ללא גיבוי", notify: "מנהל IT", severity: "אזהרה", enabled: true },
  { rule: "תפוגת רישיון תוכנה", trigger: "30 יום לפני תפוגה", notify: "מנהל IT + רכש", severity: "מידע", enabled: true },
];

/* ── helpers ── */

const alertIcon = (type: string) => {
  const map: Record<string, React.ReactNode> = {
    "expired": <FileX className="h-4 w-4" />,
    "pending-sign": <PenTool className="h-4 w-4" />,
    "sla-breach": <Timer className="h-4 w-4" />,
    "old-version": <Archive className="h-4 w-4" />,
    "orphan": <Unlink className="h-4 w-4" />,
    "storage": <HardDrive className="h-4 w-4" />,
    "checklist-gap": <ClipboardList className="h-4 w-4" />,
    "secret-access": <ShieldAlert className="h-4 w-4" />,
  };
  return map[type] ?? <AlertTriangle className="h-4 w-4" />;
};

const severityBadge = (s: string) => {
  if (s === "קריטי") return <Badge className="bg-red-600 text-white text-xs">{s}</Badge>;
  if (s === "אזהרה") return <Badge className="bg-amber-100 text-amber-700 text-xs">{s}</Badge>;
  return <Badge className="bg-blue-100 text-blue-700 text-xs">{s}</Badge>;
};

const severityBorder = (s: string) => {
  if (s === "קריטי") return "border-red-200 bg-red-50/30";
  if (s === "אזהרה") return "border-amber-200 bg-amber-50/30";
  return "border-blue-200 bg-blue-50/30";
};

/* ── component ── */

export default function DocumentAlertsPage() {

  const { data: apiData } = useQuery({
    queryKey: ["document_alerts"],
    queryFn: () => authFetch("/api/documents/document-alerts").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const alertTypes = apiData?.alertTypes ?? FALLBACK_ALERT_TYPES;
  const alerts = apiData?.alerts ?? FALLBACK_ALERTS;
  const closedAlerts = apiData?.closedAlerts ?? FALLBACK_CLOSED_ALERTS;
  const thresholds = apiData?.thresholds ?? FALLBACK_THRESHOLDS;
  const [tab, setTab] = useState("active");

  const summary = [
    { label: "התראות פעילות", value: 18, icon: Bell, accent: "text-red-600", bg: "bg-red-100" },
    { label: "קריטיות", value: 5, icon: AlertOctagon, accent: "text-red-600", bg: "bg-red-100" },
    { label: "אזהרות", value: 8, icon: AlertTriangle, accent: "text-amber-600", bg: "bg-amber-100" },
    { label: "מידע", value: 5, icon: FileWarning, accent: "text-blue-600", bg: "bg-blue-100" },
  ];

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-red-100 p-2.5 rounded-xl"><Bell className="h-6 w-6 text-red-600" /></div>
          <div>
            <h1 className="text-2xl font-bold">התראות מסמכים</h1>
            <p className="text-sm text-muted-foreground">טכנו-כל עוזי — מערכת התראות וניטור אירועי מסמכים בזמן אמת</p>
          </div>
        </div>
        <Badge className="bg-red-100 text-red-700"><AlertTriangle className="h-3.5 w-3.5 ml-1" />5 התראות קריטיות פתוחות</Badge>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-4 gap-4">
        {summary.map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`${s.bg} p-2 rounded-lg`}><s.icon className={`h-5 w-5 ${s.accent}`} /></div>
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={`text-xl font-bold ${s.accent}`}>{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alert Types Breakdown */}
      <Card>
        <CardContent className="p-4">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><Eye className="h-4 w-4 text-slate-600" />פירוט לפי סוג התראה</h2>
          <div className="grid grid-cols-4 gap-3">
            {alertTypes.map(at => {
              const pct = Math.round((at.count / 15) * 100);
              return (
                <div key={at.type} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/40">
                  <div className={`${at.color} text-white p-1.5 rounded-md`}><at.icon className="h-3.5 w-3.5" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{at.label}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Progress value={pct} className="h-1.5 flex-1" />
                      <span className="text-xs font-bold">{at.count}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Critical Alert Banner */}
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertOctagon className="h-5 w-5 text-red-600" />
            <h2 className="font-semibold text-red-800">התראות קריטיות הדורשות טיפול מיידי</h2>
            <Badge className="bg-red-600 text-white text-xs mr-2">5</Badge>
          </div>
          <p className="text-sm text-red-700">
            ישנן 5 התראות ברמת חומרה קריטית שטרם טופלו. תעודת ISO פגת תוקף, חוזה ממתין לחתימה 72 שעות, חריגת SLA בהצעת מחיר ו-2 אירועי גישה חריגה למסמכים סודיים.
          </p>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="active"><Bell className="h-4 w-4 ml-1" />פעילות</TabsTrigger>
          <TabsTrigger value="closed"><CheckCircle2 className="h-4 w-4 ml-1" />נסגרו</TabsTrigger>
          <TabsTrigger value="thresholds"><Settings className="h-4 w-4 ml-1" />הגדרות סף</TabsTrigger>
        </TabsList>

        {/* Active Alerts */}
        <TabsContent value="active" className="space-y-3">
          {alerts.map(a => (
            <Card key={a.id} className={severityBorder(a.severity)}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 p-1.5 rounded-md ${a.severity === "קריטי" ? "bg-red-100 text-red-600" : a.severity === "אזהרה" ? "bg-amber-100 text-amber-600" : "bg-blue-100 text-blue-600"}`}>
                    {alertIcon(a.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground">{a.id}</span>
                      {severityBadge(a.severity)}
                      <span className="font-semibold text-sm">{a.title}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{a.description}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Link2 className="h-3 w-3" />{a.doc}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{a.time}</span>
                    </div>
                  </div>
                  <button className="shrink-0 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors">
                    {a.action}
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Closed Alerts */}
        <TabsContent value="closed">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מזהה</TableHead>
                    <TableHead className="text-right">התראה</TableHead>
                    <TableHead className="text-right">חומרה</TableHead>
                    <TableHead className="text-right">נסגר ע״י</TableHead>
                    <TableHead className="text-right">תאריך סגירה</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closedAlerts.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.id}</TableCell>
                      <TableCell className="text-sm">{c.title}</TableCell>
                      <TableCell>{severityBadge(c.severity)}</TableCell>
                      <TableCell className="text-sm">{c.closedBy}</TableCell>
                      <TableCell className="text-xs">{c.closedAt}</TableCell>
                      <TableCell><Badge className="bg-emerald-100 text-emerald-700 text-xs"><CheckCircle2 className="h-3 w-3 ml-1" />נסגר</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Threshold Settings */}
        <TabsContent value="thresholds">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Settings className="h-5 w-5 text-slate-600" />
                <h3 className="font-semibold">הגדרות סף והתראות</h3>
                <Badge variant="secondary" className="mr-auto">{thresholds.filter(t => t.enabled).length} כללים פעילים</Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">כלל</TableHead>
                    <TableHead className="text-right">סף הפעלה</TableHead>
                    <TableHead className="text-right">הודעה ל</TableHead>
                    <TableHead className="text-right">חומרה</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {thresholds.map((t, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-sm">{t.rule}</TableCell>
                      <TableCell className="text-sm">{t.trigger}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.notify}</TableCell>
                      <TableCell>{severityBadge(t.severity)}</TableCell>
                      <TableCell>
                        {t.enabled
                          ? <Badge className="bg-emerald-100 text-emerald-700 text-xs"><CheckCircle2 className="h-3 w-3 ml-1" />פעיל</Badge>
                          : <Badge className="bg-slate-100 text-slate-500 text-xs"><XCircle className="h-3 w-3 ml-1" />מושבת</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4 inline ml-1 text-amber-600" />
                שינויים בהגדרות סף ייכנסו לתוקף מיידית. התראות קריטיות נשלחות גם ב-SMS למנהלים מוגדרים.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
