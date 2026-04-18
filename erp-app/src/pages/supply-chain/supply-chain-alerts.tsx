import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Bell, AlertTriangle, ShieldAlert, Clock, RefreshCw, Package, Truck, FlaskConical,
  TrendingUp, AlertOctagon, Factory, FileText, Zap, Users, CheckCircle2, ArrowUpCircle,
  Eye, Search, SlidersHorizontal, BarChart3, CircleDot, ShieldCheck,
} from "lucide-react";

const FALLBACK_ALERTTYPES = [
  { label: "מחסור בחומר", icon: Package, count: 4, color: "bg-red-500/15 text-red-600" },
  { label: "עיכוב משלוח", icon: Truck, count: 3, color: "bg-amber-500/15 text-amber-600" },
  { label: "עצירת איכות", icon: FlaskConical, count: 2, color: "bg-purple-500/15 text-purple-600" },
  { label: "זינוק מחיר", icon: TrendingUp, count: 1, color: "bg-orange-500/15 text-orange-600" },
  { label: "סיכון חוסר מלאי", icon: AlertOctagon, count: 2, color: "bg-rose-500/15 text-rose-600" },
  { label: "תקלת ספק", icon: Users, count: 1, color: "bg-blue-500/15 text-blue-600" },
  { label: "עיכוב מכס", icon: FileText, count: 1, color: "bg-cyan-500/15 text-cyan-600" },
  { label: "עומס קיבולת", icon: Factory, count: 2, color: "bg-indigo-500/15 text-indigo-600" },
  { label: "חוזה פג תוקף", icon: ShieldCheck, count: 1, color: "bg-emerald-500/15 text-emerald-600" },
  { label: "גל ביקוש", icon: Zap, count: 1, color: "bg-pink-500/15 text-pink-600" },
];

type Severity = "critical" | "high" | "medium" | "low";

const severityConfig: Record<Severity, { label: string; cls: string }> = {
  critical: { label: "קריטי", cls: "bg-red-600 text-white" },
  high: { label: "גבוה", cls: "bg-orange-500/20 text-orange-700" },
  medium: { label: "בינוני", cls: "bg-amber-500/20 text-amber-700" },
  low: { label: "נמוך", cls: "bg-green-500/20 text-green-700" },
};

const FALLBACK_ACTIVEALERTS = [
  { id: "ALR-301", severity: "critical" as Severity, type: "מחסור בחומר", title: "מלאי זכוכית מחוסמת קריטי", desc: "מלאי ירד ל-2 ימי ייצור בלבד", entity: "Foshan Glass Co.", entityType: "ספק", created: "08/04 07:12", assignee: "דניאל כ." },
  { id: "ALR-300", severity: "critical" as Severity, type: "עיכוב משלוח", title: "משלוח אלומיניום תקוע בנמל", desc: "עיכוב של 12 יום בנמל חיפה - שביתה", entity: "HZ-2026-1187", entityType: "הזמנה", created: "07/04 15:30", assignee: "אורי מ." },
  { id: "ALR-299", severity: "critical" as Severity, type: "עצירת איכות", title: "אצווה פסולה - פרופילי אלומיניום", desc: "17% פסילה באצווה 8842 - חריגת מידות", entity: "קבוצת אלומיל", entityType: "ספק", created: "07/04 11:45", assignee: "שרון ב." },
  { id: "ALR-298", severity: "high" as Severity, type: "מחסור בחומר", title: "מלאי סיליקון נמוך", desc: "מלאי ל-5 ימים, נדרש הזמנה דחופה", entity: "סיליקון איטום 770", entityType: "מוצר", created: "07/04 09:00", assignee: "דניאל כ." },
  { id: "ALR-297", severity: "high" as Severity, type: "זינוק מחיר", title: "עליית מחיר אלומיניום 18%", desc: "מחיר LME עלה מ-$2,340 ל-$2,761 לטון", entity: "Schüco International", entityType: "ספק", created: "06/04 16:20", assignee: "רונית ד." },
  { id: "ALR-296", severity: "high" as Severity, type: "סיכון חוסר מלאי", title: "פרופיל תרמי צפוי להיגמר", desc: "צריכה גבוהה ב-40% מהתחזית", entity: "פרופיל תרמי TB-60", entityType: "מוצר", created: "06/04 14:10", assignee: "אורי מ." },
  { id: "ALR-295", severity: "high" as Severity, type: "עומס קיבולת", title: "קו חיתוך CNC בעומס מקסימלי", desc: "תפוסה 98% - צפוי עיכוב ב-6 הזמנות", entity: "קו ייצור 3", entityType: "קו ייצור", created: "06/04 10:00", assignee: "יוסי ת." },
  { id: "ALR-294", severity: "medium" as Severity, type: "עיכוב מכס", title: "עיכוב שחרור חומרי גלם ממכס", desc: "חסר אישור תקן ישראלי לאצווה", entity: "HZ-2026-1155", entityType: "הזמנה", created: "05/04 18:30", assignee: "רונית ד." },
  { id: "ALR-293", severity: "medium" as Severity, type: "תקלת ספק", title: "ספק איטום לא עומד בזמנים", desc: "3 הזמנות אחרונות באיחור של 4+ ימים", entity: "Tremco Illbruck", entityType: "ספק", created: "05/04 12:00", assignee: "דניאל כ." },
  { id: "ALR-292", severity: "medium" as Severity, type: "מחסור בחומר", title: "ברגי נירוסטה M8 - מלאי נמוך", desc: "מלאי ל-7 ימים, ספק רגיל באיחור", entity: "ברגי נירוסטה M8x30", entityType: "מוצר", created: "05/04 09:15", assignee: "שרון ב." },
  { id: "ALR-291", severity: "medium" as Severity, type: "עומס קיבולת", title: "מחלקת הרכבה בעומס יתר", desc: "12 פרויקטים פעילים במקום 8 מתוכננים", entity: "מחלקת הרכבה", entityType: "מחלקה", created: "04/04 16:45", assignee: "יוסי ת." },
  { id: "ALR-290", severity: "medium" as Severity, type: "חוזה פג תוקף", title: "חוזה מסגרת Schüco פג ב-30 יום", desc: "יש לחדש חוזה לפני 08/05/2026", entity: "Schüco International", entityType: "ספק", created: "04/04 08:00", assignee: "רונית ד." },
  { id: "ALR-289", severity: "low" as Severity, type: "גל ביקוש", title: "עלייה בביקוש לחלונות דו-כנפיים", desc: "גידול 25% בהזמנות מול חודש קודם", entity: "חלון דו-כנפי DK-200", entityType: "מוצר", created: "03/04 14:30", assignee: "אורי מ." },
  { id: "ALR-288", severity: "low" as Severity, type: "עיכוב משלוח", title: "עיכוב קל במשלוח זכוכית שטוחה", desc: "2 ימי עיכוב - שינוי מסלול ספינה", entity: "Guardian Glass", entityType: "ספק", created: "03/04 10:00", assignee: "דניאל כ." },
  { id: "ALR-287", severity: "low" as Severity, type: "סיכון חוסר מלאי", title: "גומיות EPDM - צריכה מעל הממוצע", desc: "צריכה 15% מעל ממוצע חודשי", entity: "גומיית EPDM 4x15", entityType: "מוצר", created: "02/04 11:20", assignee: "שרון ב." },
];

const FALLBACK_HISTORYALERTS = [
  { id: "ALR-286", type: "מחסור בחומר", title: "מלאי זכוכית LOW-E נמוך", resolved: "02/04 09:00", duration: "4.2 שעות", action: "הזמנה דחופה לספק חלופי", resolver: "דניאל כ." },
  { id: "ALR-285", type: "עיכוב משלוח", title: "עיכוב פרופילים מטורקיה", resolved: "01/04 17:30", duration: "18 שעות", action: "שינוי לשילוח אווירי", resolver: "אורי מ." },
  { id: "ALR-284", type: "עצירת איכות", title: "פסילת אצווה - גומיות", resolved: "01/04 14:00", duration: "6.5 שעות", action: "החלפת אצווה + זיכוי ספק", resolver: "שרון ב." },
  { id: "ALR-283", type: "זינוק מחיר", title: "עליית מחיר פוליקרבונט", resolved: "31/03 16:00", duration: "22 שעות", action: "מו\"מ מחיר + נעילת חוזה 6 חודשים", resolver: "רונית ד." },
  { id: "ALR-282", type: "מחסור בחומר", title: "ברגי פלדה M6 אזלו", resolved: "31/03 11:00", duration: "2.8 שעות", action: "רכישה מספק מקומי", resolver: "דניאל כ." },
  { id: "ALR-281", type: "עומס קיבולת", title: "קו כיפוף בעומס 100%", resolved: "30/03 15:30", duration: "8 שעות", action: "הפניית עבודה לקו 2 + משמרת נוספת", resolver: "יוסי ת." },
  { id: "ALR-280", type: "תקלת ספק", title: "ספק פרזול לא זמין", resolved: "30/03 10:00", duration: "36 שעות", action: "הפעלת ספק חלופי מאושר", resolver: "דניאל כ." },
  { id: "ALR-279", type: "עיכוב מכס", title: "שחרור זכוכיות ממכס אשדוד", resolved: "29/03 18:00", duration: "48 שעות", action: "הגשת מסמכי תקן + ליווי סוכן", resolver: "רונית ד." },
  { id: "ALR-278", type: "עיכוב משלוח", title: "משלוח חומרי אטימה באיחור", resolved: "29/03 12:00", duration: "5 שעות", action: "ספק שלח בשליח מיוחד", resolver: "אורי מ." },
  { id: "ALR-277", type: "מחסור בחומר", title: "חוסר בפרופיל AW-6060", resolved: "28/03 16:00", duration: "12 שעות", action: "שימוש בפרופיל חלופי מאושר", resolver: "שרון ב." },
  { id: "ALR-276", type: "סיכון חוסר מלאי", title: "חומר מילוי PU צפוי להיגמר", resolved: "28/03 09:30", duration: "3 שעות", action: "הזמנה מהירה הוגשה", resolver: "דניאל כ." },
  { id: "ALR-275", type: "עצירת איכות", title: "סטייה במידות זכוכית", resolved: "27/03 17:00", duration: "7 שעות", action: "כיול מכונת חיתוך + בדיקה חוזרת", resolver: "יוסי ת." },
  { id: "ALR-274", type: "גל ביקוש", title: "הזמנות דלתות כניסה +35%", resolved: "27/03 11:00", duration: "24 שעות", action: "הגדלת תכנון ייצור + הזמנת חומרים", resolver: "אורי מ." },
  { id: "ALR-273", type: "חוזה פג תוקף", title: "חידוש חוזה Guardian Glass", resolved: "26/03 14:00", duration: "72 שעות", action: "חתימת חוזה חדש ל-12 חודשים", resolver: "רונית ד." },
  { id: "ALR-272", type: "מחסור בחומר", title: "מלאי סיליקון שקוף נמוך", resolved: "26/03 10:00", duration: "5 שעות", action: "הזמנה מספק משני", resolver: "דניאל כ." },
  { id: "ALR-271", type: "עומס קיבולת", title: "מחלקת צביעה בעומס מלא", resolved: "25/03 16:00", duration: "10 שעות", action: "מיקור חוץ חלקי לצובע מאושר", resolver: "יוסי ת." },
  { id: "ALR-270", type: "עיכוב משלוח", title: "עיכוב חומר מגרמניה - חג", resolved: "25/03 09:00", duration: "96 שעות", action: "שימוש במלאי ביטחון + הזמנה מקומית", resolver: "אורי מ." },
  { id: "ALR-269", type: "תקלת ספק", title: "בעיות תקשורת עם ספק סיני", resolved: "24/03 15:00", duration: "14 שעות", action: "שיחת וידאו + מייל מפורט", resolver: "רונית ד." },
  { id: "ALR-268", type: "זינוק מחיר", title: "עליית מחיר נירוסטה 12%", resolved: "24/03 10:00", duration: "28 שעות", action: "רכישת מלאי אסטרטגי + חוזה", resolver: "דניאל כ." },
  { id: "ALR-267", type: "סיכון חוסר מלאי", title: "ידיות אלומיניום צפויות להיגמר", resolved: "23/03 14:00", duration: "6 שעות", action: "הזמנה מזורזת מספק מקומי", resolver: "שרון ב." },
];

const FALLBACK_THRESHOLDS = [
  { id: 1, name: "ימי מלאי מינימלי", desc: "התראה כשמלאי חומר יורד מתחת לסף", value: 5, unit: "ימים", triggers: 12, active: true },
  { id: 2, name: "סטיית Lead Time מקסימלית", desc: "התראה על חריגה מזמן אספקה מוסכם", value: 20, unit: "%", triggers: 8, active: true },
  { id: 3, name: "סף שינוי מחיר", desc: "התראה על שינוי מחיר חומר גלם", value: 10, unit: "%", triggers: 4, active: true },
  { id: 4, name: "רמת אזהרת OTD", desc: "התראה כשאמינות אספקת ספק יורדת", value: 85, unit: "%", triggers: 6, active: true },
  { id: 5, name: "סף פסילת איכות", desc: "התראה כשאחוז פסילה עולה על הסף", value: 5, unit: "%", triggers: 3, active: true },
  { id: 6, name: "תפוסת קו ייצור מקסימלית", desc: "התראה על עומס יתר בקו ייצור", value: 92, unit: "%", triggers: 7, active: true },
  { id: 7, name: "ימים לפקיעת חוזה", desc: "התראה לפני פקיעת חוזה ספק", value: 60, unit: "ימים", triggers: 2, active: true },
  { id: 8, name: "עיכוב מכס מקסימלי", desc: "התראה על עיכוב חריג בשחרור ממכס", value: 5, unit: "ימים", triggers: 3, active: false },
  { id: 9, name: "סף גידול ביקוש", desc: "התראה על גידול חריג בהזמנות", value: 25, unit: "%", triggers: 2, active: true },
  { id: 10, name: "כשלי ספק חוזרים", desc: "התראה כשספק נכשל מספר פעמים ברציפות", value: 3, unit: "פעמים", triggers: 1, active: false },
];

export default function SupplyChainAlertsPage() {
  const { data: apialertTypes } = useQuery({
    queryKey: ["/api/supply-chain/supply-chain-alerts/alerttypes"],
    queryFn: () => authFetch("/api/supply-chain/supply-chain-alerts/alerttypes").then(r => r.json()).catch(() => null),
  });
  const alertTypes = Array.isArray(apialertTypes) ? apialertTypes : (apialertTypes?.data ?? apialertTypes?.items ?? FALLBACK_ALERTTYPES);


  const { data: apiactiveAlerts } = useQuery({
    queryKey: ["/api/supply-chain/supply-chain-alerts/activealerts"],
    queryFn: () => authFetch("/api/supply-chain/supply-chain-alerts/activealerts").then(r => r.json()).catch(() => null),
  });
  const activeAlerts = Array.isArray(apiactiveAlerts) ? apiactiveAlerts : (apiactiveAlerts?.data ?? apiactiveAlerts?.items ?? FALLBACK_ACTIVEALERTS);


  const { data: apihistoryAlerts } = useQuery({
    queryKey: ["/api/supply-chain/supply-chain-alerts/historyalerts"],
    queryFn: () => authFetch("/api/supply-chain/supply-chain-alerts/historyalerts").then(r => r.json()).catch(() => null),
  });
  const historyAlerts = Array.isArray(apihistoryAlerts) ? apihistoryAlerts : (apihistoryAlerts?.data ?? apihistoryAlerts?.items ?? FALLBACK_HISTORYALERTS);


  const { data: apithresholds } = useQuery({
    queryKey: ["/api/supply-chain/supply-chain-alerts/thresholds"],
    queryFn: () => authFetch("/api/supply-chain/supply-chain-alerts/thresholds").then(r => r.json()).catch(() => null),
  });
  const thresholds = Array.isArray(apithresholds) ? apithresholds : (apithresholds?.data ?? apithresholds?.items ?? FALLBACK_THRESHOLDS);

  const criticalCount = activeAlerts.filter(a => a.severity === "critical").length;
  const resolvedToday = 5;
  const avgResolution = 14.2;
  const recurringCount = 4;

  const kpis = [
    { label: "התראות פעילות", value: activeAlerts.length, icon: Bell, color: "text-blue-600", bg: "bg-blue-500/10" },
    { label: "התראות קריטיות", value: criticalCount, icon: ShieldAlert, color: "text-red-600", bg: "bg-red-500/10" },
    { label: "נפתרו היום", value: resolvedToday, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-500/10" },
    { label: "זמן פתרון ממוצע", value: `${avgResolution} שעות`, icon: Clock, color: "text-amber-600", bg: "bg-amber-500/10" },
    { label: "התראות חוזרות", value: recurringCount, icon: RefreshCw, color: "text-purple-600", bg: "bg-purple-500/10" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <AlertTriangle className="h-7 w-7 text-amber-600" />
          התראות שרשרת אספקה — טכנו-כל עוזי
        </h1>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="חיפוש התראה..." className="pr-9 w-60" />
          </div>
          <Button variant="outline" size="sm"><SlidersHorizontal className="h-4 w-4 ml-1" /> סינון</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-4">
        {kpis.map((k, i) => (
          <Card key={i}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${k.bg}`}>
                  <k.icon className={`h-5 w-5 ${k.color}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className="text-xl font-bold">{k.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alert Types Grid */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-5 w-5" /> סוגי התראות</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-3">
            {alertTypes.map((t, i) => (
              <div key={i} className={`flex items-center gap-2 p-3 rounded-lg ${t.color}`}>
                <t.icon className="h-4 w-4 shrink-0" />
                <span className="text-sm font-medium truncate">{t.label}</span>
                <Badge variant="secondary" className="mr-auto text-xs">{t.count}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">התראות פעילות ({activeAlerts.length})</TabsTrigger>
          <TabsTrigger value="history">היסטוריה</TabsTrigger>
          <TabsTrigger value="thresholds">הגדרות סף</TabsTrigger>
        </TabsList>

        {/* Active Alerts */}
        <TabsContent value="active" className="space-y-3">
          {/* Severity breakdown bar */}
          <Card>
            <CardContent className="py-3">
              <div className="flex items-center gap-6 text-sm">
                <span className="text-muted-foreground font-medium">פילוח לפי חומרה:</span>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-600" />
                  <span>קריטי: {activeAlerts.filter(a => a.severity === "critical").length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-orange-500" />
                  <span>גבוה: {activeAlerts.filter(a => a.severity === "high").length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-amber-500" />
                  <span>בינוני: {activeAlerts.filter(a => a.severity === "medium").length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-green-500" />
                  <span>נמוך: {activeAlerts.filter(a => a.severity === "low").length}</span>
                </div>
                <div className="flex-1" />
                <span className="text-muted-foreground">סה״כ: {activeAlerts.length} התראות</span>
              </div>
            </CardContent>
          </Card>

          {activeAlerts.map((a) => (
            <Card key={a.id} className={a.severity === "critical" ? "border-red-400 bg-red-500/5" : ""}>
              <CardContent className="py-4">
                <div className="flex items-start gap-4">
                  <div className="pt-0.5">
                    <CircleDot className={`h-5 w-5 ${a.severity === "critical" ? "text-red-600" : a.severity === "high" ? "text-orange-500" : a.severity === "medium" ? "text-amber-500" : "text-green-500"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={severityConfig[a.severity].cls}>{severityConfig[a.severity].label}</Badge>
                      <Badge variant="outline" className="text-xs">{a.type}</Badge>
                      <span className="text-xs text-muted-foreground mr-auto">{a.id} &middot; {a.created}</span>
                    </div>
                    <p className="font-semibold text-sm">{a.title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{a.desc}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>{a.entityType}: <strong className="text-foreground">{a.entity}</strong></span>
                      <span>אחראי: <strong className="text-foreground">{a.assignee}</strong></span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" variant="outline"><Eye className="h-3.5 w-3.5 ml-1" /> אישור</Button>
                    <Button size="sm" variant="default"><CheckCircle2 className="h-3.5 w-3.5 ml-1" /> פתרון</Button>
                    <Button size="sm" variant="destructive"><ArrowUpCircle className="h-3.5 w-3.5 ml-1" /> הסלמה</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="space-y-4">
          {/* History stats summary */}
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="py-3 text-center">
                <p className="text-2xl font-bold text-green-600">{historyAlerts.length}</p>
                <p className="text-xs text-muted-foreground">נפתרו ב-30 יום</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3 text-center">
                <p className="text-2xl font-bold text-blue-600">18.3</p>
                <p className="text-xs text-muted-foreground">שעות פתרון ממוצע</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3 text-center">
                <p className="text-2xl font-bold text-amber-600">2.8</p>
                <p className="text-xs text-muted-foreground">שעות - הכי מהיר</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3 text-center">
                <p className="text-2xl font-bold text-red-600">96</p>
                <p className="text-xs text-muted-foreground">שעות - הכי ארוך</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-4">
              <div className="space-y-0 divide-y">
                {historyAlerts.map((h) => (
                  <div key={h.id} className="py-3 flex items-center gap-4">
                    <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-sm">{h.title}</span>
                        <Badge variant="outline" className="text-xs">{h.type}</Badge>
                        <span className="text-xs text-muted-foreground mr-auto">{h.id}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">פעולת פתרון: {h.action}</p>
                    </div>
                    <div className="text-left shrink-0 space-y-0.5">
                      <p className="text-xs font-medium">{h.resolved}</p>
                      <p className="text-xs text-muted-foreground">זמן פתרון: {h.duration}</p>
                      <p className="text-xs text-muted-foreground">פותר: {h.resolver}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Threshold Settings */}
        <TabsContent value="thresholds">
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-0 divide-y">
                {thresholds.map((t) => (
                  <div key={t.id} className="py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{t.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                    </div>
                    <div className="flex items-center gap-6 shrink-0">
                      <div className="text-center">
                        <p className="text-lg font-bold">{t.value}</p>
                        <p className="text-xs text-muted-foreground">{t.unit}</p>
                      </div>
                      <div className="text-center w-16">
                        <p className="text-sm font-medium">{t.triggers}</p>
                        <p className="text-xs text-muted-foreground">טריגרים</p>
                      </div>
                      <div className="w-20">
                        <Progress value={t.triggers * 10} className="h-1.5" />
                      </div>
                      <Switch checked={t.active} />
                      <Badge className={t.active ? "bg-green-500/20 text-green-700" : "bg-gray-200 text-gray-500"}>
                        {t.active ? "פעיל" : "מושבת"}
                      </Badge>
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
