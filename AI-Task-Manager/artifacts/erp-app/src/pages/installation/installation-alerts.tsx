import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Bell, AlertTriangle, AlertOctagon, Info, CloudRain, Package,
  Users, Wrench, DollarSign, Clock, ShieldAlert, CheckCircle,
  XCircle, MapPin, PhoneCall, CalendarDays, Settings, Filter,
  ChevronLeft, Construction
} from "lucide-react";

/* ── Alert type definitions ──────────────────────────────────── */

const alertTypes = [
  { key: "site-not-ready", label: "אתר לא מוכן להתקנה מחר", icon: MapPin, color: "text-red-400", bg: "bg-red-500/20" },
  { key: "missing-materials", label: "חומרים חסרים להתקנה", icon: Package, color: "text-red-400", bg: "bg-red-500/20" },
  { key: "crew-unassigned", label: "צוות לא שובץ", icon: Users, color: "text-orange-400", bg: "bg-orange-500/20" },
  { key: "equipment-unavailable", label: "ציוד לא זמין", icon: Construction, color: "text-orange-400", bg: "bg-orange-500/20" },
  { key: "cost-overrun", label: "חריגת עלות >10%", icon: DollarSign, color: "text-amber-400", bg: "bg-amber-500/20" },
  { key: "schedule-delay", label: "איחור בלו\"ז >2 ימים", icon: Clock, color: "text-amber-400", bg: "bg-amber-500/20" },
  { key: "qc-failure", label: "כשל QC — דורש תיקון", icon: ShieldAlert, color: "text-red-400", bg: "bg-red-500/20" },
  { key: "weather-risk", label: "מזג אוויר — סיכון להתקנה", icon: CloudRain, color: "text-blue-400", bg: "bg-blue-500/20" },
  { key: "customer-no-signoff", label: "לקוח לא אישר מסירה", icon: XCircle, color: "text-orange-400", bg: "bg-orange-500/20" },
  { key: "urgent-service-call", label: "קריאת שירות חוזרת דחופה", icon: PhoneCall, color: "text-red-400", bg: "bg-red-500/20" },
];

/* ── Mock alert data ─────────────────────────────────────────── */

const alerts = [
  { id: 1, type: "site-not-ready", title: "אתר לא מוכן — מלון רויאל אילת", desc: "עבודות שלד טרם הושלמו וגישה לקומות 4-6 חסומה. לא ניתן להתחיל התקנה מחר כמתוכנן.", ins: "INS-107", project: "מלון רויאל — אילת", time: "לפני 2 שעות", severity: "קריטי", action: "לתאם עם קבלן ראשי דחיפות או לדחות התקנה" },
  { id: 2, type: "missing-materials", title: "חומרי איטום חסרים — מגדל חיפה", desc: "אספקת חומרי איטום מספק מרכזי מתעכבת ב-3 ימים. מלאי באתר מספיק ל-40% מהעבודה.", ins: "INS-103", project: "מגדל המשרדים — חיפה", time: "לפני 3 שעות", severity: "קריטי", action: "לחפש ספק חלופי או להתחיל התקנה חלקית" },
  { id: 3, type: "qc-failure", title: "כשל QC — חלונות קומה 3 לא עוברים אטימות", desc: "בדיקת אטימות מים נכשלה ב-3 מתוך 8 חלונות בקומה 3. נדרש פירוק ותיקון איטום.", ins: "INS-001", project: "מגדלי הים — חיפה", time: "לפני 4 שעות", severity: "קריטי", action: "לשלוח צוות תיקון ולבצע בדיקה חוזרת תוך 48 שעות" },
  { id: 4, type: "urgent-service-call", title: "קריאת שירות חוזרת — דלת הזזה תקועה", desc: "לקוח מדווח שדלת הזזה חשמלית תקועה בפתיחה מלאה. זו קריאה שלישית על אותה דלת.", ins: "INS-003", project: "בית חכם — הרצליה", time: "לפני שעה", severity: "קריטי", action: "לשלוח טכנאי בכיר להחלפת מנוע + מסילה" },
  { id: 5, type: "crew-unassigned", title: "צוות לא שובץ — פארק המדע רחובות", desc: "התקנה מתוכננת ל-11/04 וטרם שובץ צוות. צוות בטא ואפסילון זמינים.", ins: "INS-002", project: "פארק המדע — רחובות", time: "אתמול", severity: "אזהרה", action: "לשבץ צוות בטא או אפסילון מיידית" },
  { id: 6, type: "equipment-unavailable", title: "מנוף 20 טון לא זמין — מלון ים התיכון", desc: "המנוף המוזמן תפוס בפרויקט אחר עד 15/04. ההתקנה דורשת הרמה לקומה 12.", ins: "INS-004", project: "מלון ים התיכון", time: "אתמול", severity: "אזהרה", action: "להזמין מנוף חלופי מחברת שלב או לדחות ל-16/04" },
  { id: 7, type: "cost-overrun", title: "חריגת עלות 14% — קניון הדרום", desc: "עלויות בפועל חורגות ב-14% מהתקציב בעיקר בגלל שעות נוספות ותיקונים בשטח.", ins: "INS-005", project: "קניון הדרום — באר שבע", time: "לפני 5 שעות", severity: "אזהרה", action: "לעדכן הנהלה ולבקש אישור תקציב נוסף" },
  { id: 8, type: "schedule-delay", title: "איחור 3 ימים — בניין מגורים נתניה", desc: "ההתקנה באיחור של 3 ימים בגלל חריגת מידות בפתחים שדרשה התאמות ייצור.", ins: "INS-007", project: "בניין מגורים — נתניה", time: "לפני 6 שעות", severity: "אזהרה", action: "לעדכן לקוח ולהגדיל צוות להשלמת הפער" },
  { id: 9, type: "customer-no-signoff", title: "לקוח לא אישר מסירה — מרכז ספורט", desc: "ההתקנה הושלמה לפני 5 ימים אך הלקוח טרם חתם על פרוטוקול מסירה בגלל הערה על ציר.", ins: "INS-008", project: "מרכז ספורט — ראשל\"צ", time: "לפני יומיים", severity: "אזהרה", action: "לתאם ביקור תיקון ציר + חתימה על פרוטוקול" },
  { id: 10, type: "weather-risk", title: "סערה צפויה — סיכון להתקנה חיצונית", desc: "תחזית גשם כבד ורוחות 60 קמ\"ש ב-10-11/04. סיכון לעבודות גובה ולהרמת זכוכית.", ins: "INS-001", project: "מגדלי הים — חיפה", time: "לפני שעתיים", severity: "אזהרה", action: "להכין תוכנית גיבוי — עבודות פנים בלבד או דחייה" },
  { id: 11, type: "missing-materials", title: "ברגי נירוסטה חסרים — משרדי הייטק", desc: "חסרים 200 ברגי נירוסטה M8 לחיבור מחיצות זכוכית. זמן אספקה רגיל 5 ימים.", ins: "INS-006", project: "משרדי הייטק — הרצליה פיתוח", time: "הבוקר", severity: "מידע", action: "להזמין דחוף מספק מקומי — אספקה תוך יום" },
  { id: 12, type: "site-not-ready", title: "חיבור חשמל חסר — בית ספר דרור", desc: "חיבור חשמל זמני 32A טרם אושר על ידי חברת חשמל. ניתן לעבוד עם גנרטור.", ins: "INS-106", project: "בית הספר דרור — באר שבע", time: "לפני 3 ימים", severity: "מידע", action: "להמשיך עם גנרטור ולעקוב מול חח\"י" },
  { id: 13, type: "cost-overrun", title: "חריגת עלות 11% — מרכז רפואי", desc: "עלויות שינוע והרמה גבוהות מהתקציב ב-11% בגלל מיקום מורכב.", ins: "INS-108", project: "מרכז רפואי — פתח תקווה", time: "אתמול", severity: "מידע", action: "לתעד ולהוסיף לתחשיב פרויקטים דומים" },
  { id: 14, type: "schedule-delay", title: "התקנה מאחרת יום — משרדי ענן רעננה", desc: "צוות סיים מוקדם בפרויקט קודם ויתחיל מחר במקום היום. איחור של יום אחד בלבד.", ins: "INS-110", project: "משרדי חברת ענן — רעננה", time: "הבוקר", severity: "מידע", action: "לעדכן לקוח על שינוי לו\"ז ליום אחד" },
  { id: 15, type: "qc-failure", title: "שריטות בזכוכית — מגדלי אשדוד", desc: "נמצאו שריטות קלות בלוח זכוכית אחד מתוך 12 שהותקנו. הלקוח ביקש החלפה.", ins: "INS-109", project: "מגדלי הים התיכון — אשדוד", time: "לפני יומיים", severity: "מידע", action: "להזמין לוח זכוכית חלופי ולתאם החלפה" },
];

const closedAlerts = [
  { id: 101, type: "crew-unassigned", title: "צוות שובץ — מגדלי הים חיפה", closedAt: "06/04/2026", closedBy: "יוסי כהן", resolution: "צוות אלפא שובץ בהצלחה" },
  { id: 102, type: "missing-materials", title: "חומרים הגיעו — קניון הדרום", closedAt: "05/04/2026", closedBy: "עומר חדד", resolution: "אספקה התקבלה מספק חלופי" },
  { id: 103, type: "weather-risk", title: "מזג אוויר — סערה עברה", closedAt: "04/04/2026", closedBy: "מערכת", resolution: "התחזית עודכנה — ניתן להמשיך כרגיל" },
  { id: 104, type: "customer-no-signoff", title: "לקוח אישר — פארק הייטק הרצליה", closedAt: "03/04/2026", closedBy: "שרה לוי", resolution: "פרוטוקול מסירה נחתם" },
  { id: 105, type: "cost-overrun", title: "חריגה אושרה — מגדלי אקרו", closedAt: "02/04/2026", closedBy: "הנהלה", resolution: "תקציב נוסף אושר ע\"י מנכ\"ל" },
];

/* ── Threshold settings ──────────────────────────────────────── */

const thresholdSettings = [
  { type: "אתר לא מוכן להתקנה מחר", threshold: "24 שעות לפני ההתקנה", enabled: true, channel: "SMS + מערכת" },
  { type: "חומרים חסרים להתקנה", threshold: "48 שעות לפני ההתקנה", enabled: true, channel: "מערכת + דוא\"ל" },
  { type: "צוות לא שובץ", threshold: "72 שעות לפני ההתקנה", enabled: true, channel: "מערכת" },
  { type: "ציוד לא זמין", threshold: "48 שעות לפני ההתקנה", enabled: true, channel: "מערכת + דוא\"ל" },
  { type: "חריגת עלות >10%", threshold: "10% מעל תקציב", enabled: true, channel: "מערכת + דוא\"ל" },
  { type: "איחור בלו\"ז >2 ימים", threshold: "2 ימי איחור", enabled: true, channel: "מערכת" },
  { type: "כשל QC — דורש תיקון", threshold: "מיידי", enabled: true, channel: "SMS + מערכת + דוא\"ל" },
  { type: "מזג אוויר — סיכון להתקנה", threshold: "רוח >50 קמ\"ש או גשם כבד", enabled: true, channel: "SMS + מערכת" },
  { type: "לקוח לא אישר מסירה", threshold: "3 ימים לאחר השלמה", enabled: false, channel: "מערכת" },
  { type: "קריאת שירות חוזרת דחופה", threshold: "קריאה שנייה על אותו פריט", enabled: true, channel: "SMS + מערכת + דוא\"ל" },
];

/* ── Helpers ──────────────────────────────────────────────────── */

const severityColor: Record<string, string> = {
  "קריטי": "bg-red-600/20 text-red-300",
  "אזהרה": "bg-orange-500/20 text-orange-300",
  "מידע": "bg-blue-500/20 text-blue-300",
};

const severityIcon: Record<string, typeof AlertOctagon> = {
  "קריטי": AlertOctagon,
  "אזהרה": AlertTriangle,
  "מידע": Info,
};

const severityBorder: Record<string, string> = {
  "קריטי": "border-r-4 border-r-red-500",
  "אזהרה": "border-r-4 border-r-orange-500",
  "מידע": "border-r-4 border-r-blue-500",
};

const getAlertType = (key: string) => alertTypes.find(t => t.key === key);

/* ── KPI summary ─────────────────────────────────────────────── */

const kpiData = [
  { label: "התראות פעילות", value: 15, icon: Bell, color: "text-primary", bg: "bg-primary/10" },
  { label: "קריטיות", value: alerts.filter(a => a.severity === "קריטי").length, icon: AlertOctagon, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "אזהרות", value: alerts.filter(a => a.severity === "אזהרה").length, icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-500/10" },
  { label: "מידע", value: alerts.filter(a => a.severity === "מידע").length, icon: Info, color: "text-blue-400", bg: "bg-blue-500/10" },
];

/* ── Component ───────────────────────────────────────────────── */

export default function InstallationAlerts() {
  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Bell className="h-7 w-7 text-primary" /> התראות התקנה
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          טכנו-כל עוזי — מרכז התראות חכם | סוגי התראות | ניהול סף
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-3">
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

      {/* Alert types overview strip */}
      <Card className="border-0 bg-muted/30">
        <CardContent className="pt-3 pb-2 px-4">
          <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
            <Filter className="h-3.5 w-3.5" /> סוגי התראות
          </p>
          <div className="flex flex-wrap gap-2">
            {alertTypes.map((at) => {
              const Icon = at.icon;
              const count = alerts.filter(a => a.type === at.key).length;
              return (
                <Badge key={at.key} variant="outline" className={`text-[10px] gap-1 ${count > 0 ? "" : "opacity-40"}`}>
                  <Icon className={`h-3 w-3 ${at.color}`} />
                  {at.label}
                  {count > 0 && <span className="font-mono font-bold mr-0.5">({count})</span>}
                </Badge>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="active">
        <TabsList className="grid grid-cols-3 w-full max-w-xl">
          <TabsTrigger value="active" className="text-xs gap-1"><Bell className="h-3.5 w-3.5" /> פעילות ({alerts.length})</TabsTrigger>
          <TabsTrigger value="closed" className="text-xs gap-1"><CheckCircle className="h-3.5 w-3.5" /> נסגרו</TabsTrigger>
          <TabsTrigger value="settings" className="text-xs gap-1"><Settings className="h-3.5 w-3.5" /> הגדרות</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Active Alerts ─────────────────────────────── */}
        <TabsContent value="active">
          <div className="space-y-3">
            {alerts.map((alert) => {
              const aType = getAlertType(alert.type);
              const SevIcon = severityIcon[alert.severity] || Info;
              const TypeIcon = aType?.icon || Bell;
              return (
                <Card key={alert.id} className={`${severityBorder[alert.severity] || ""} hover:bg-muted/20 transition-colors`}>
                  <CardContent className="pt-3 pb-3 px-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-1.5">
                        {/* Title row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <TypeIcon className={`h-4 w-4 ${aType?.color || "text-muted-foreground"} shrink-0`} />
                          <span className="font-semibold text-sm">{alert.title}</span>
                          <Badge className={`${severityColor[alert.severity] || "bg-gray-500/20 text-gray-300"} text-[10px] border-0 gap-0.5`}>
                            <SevIcon className="h-3 w-3" />
                            {alert.severity}
                          </Badge>
                        </div>
                        {/* Description */}
                        <p className="text-xs text-muted-foreground leading-relaxed">{alert.desc}</p>
                        {/* Metadata row */}
                        <div className="flex items-center gap-4 text-[10px] text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-0.5">
                            <span className="font-mono text-primary font-semibold">{alert.ins}</span>
                          </span>
                          <span className="flex items-center gap-0.5">
                            <MapPin className="h-3 w-3" /> {alert.project}
                          </span>
                          <span className="flex items-center gap-0.5">
                            <Clock className="h-3 w-3" /> {alert.time}
                          </span>
                        </div>
                        {/* Action required */}
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge variant="outline" className="text-[10px] gap-0.5 text-amber-300 border-amber-500/30">
                            <ChevronLeft className="h-3 w-3" />
                            פעולה נדרשת:
                          </Badge>
                          <span className="text-[11px] font-medium">{alert.action}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Severity breakdown bar */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            {(["קריטי", "אזהרה", "מידע"] as const).map((sev) => {
              const count = alerts.filter(a => a.severity === sev).length;
              const pct = Math.round((count / alerts.length) * 100);
              const colors: Record<string, { text: string; prog: string; bg: string }> = {
                "קריטי": { text: "text-red-400", prog: "[&>div]:bg-red-500", bg: "bg-red-500/10" },
                "אזהרה": { text: "text-orange-400", prog: "[&>div]:bg-orange-500", bg: "bg-orange-500/10" },
                "מידע": { text: "text-blue-400", prog: "[&>div]:bg-blue-500", bg: "bg-blue-500/10" },
              };
              const c = colors[sev];
              return (
                <Card key={sev} className={`${c.bg} border-0`}>
                  <CardContent className="pt-3 pb-2 text-center">
                    <p className="text-[10px] text-muted-foreground">{sev}</p>
                    <p className={`text-xl font-bold font-mono ${c.text}`}>{count}</p>
                    <Progress value={pct} className={`h-1.5 mt-1 ${c.prog}`} />
                    <p className={`text-[10px] font-mono mt-0.5 ${c.text}`}>{pct}%</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ── Tab 2: Closed Alerts ─────────────────────────────── */}
        <TabsContent value="closed">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-400" />
                התראות שנסגרו
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {closedAlerts.length} התראות נסגרו בשבוע האחרון
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold w-8">#</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סוג</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">כותרת</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">נסגר בתאריך</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">נסגר ע"י</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פתרון</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closedAlerts.map((ca, i) => {
                    const aType = getAlertType(ca.type);
                    const TypeIcon = aType?.icon || Bell;
                    return (
                      <TableRow key={ca.id} className="hover:bg-muted/20 text-xs">
                        <TableCell className="font-mono text-muted-foreground">{i + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <TypeIcon className={`h-3.5 w-3.5 ${aType?.color || "text-muted-foreground"}`} />
                            <span className="text-[10px]">{aType?.label || ca.type}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{ca.title}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <CalendarDays className="h-3 w-3" />
                            {ca.closedAt}
                          </div>
                        </TableCell>
                        <TableCell>{ca.closedBy}</TableCell>
                        <TableCell className="text-muted-foreground max-w-xs">{ca.resolution}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Settings / Threshold Config ───────────────── */}
        <TabsContent value="settings">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                הגדרות סף התראות
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                הגדרת סף הפעלה וערוץ שליחה לכל סוג התראה
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold w-8">#</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סוג התראה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סף הפעלה</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">פעיל</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">ערוץ שליחה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {thresholdSettings.map((ts, i) => (
                    <TableRow key={i} className="hover:bg-muted/20 text-xs">
                      <TableCell className="font-mono text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{ts.type}</TableCell>
                      <TableCell className="text-muted-foreground">{ts.threshold}</TableCell>
                      <TableCell className="text-center">
                        {ts.enabled
                          ? <CheckCircle className="h-4 w-4 text-emerald-400 mx-auto" />
                          : <XCircle className="h-4 w-4 text-red-400 mx-auto" />
                        }
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{ts.channel}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
