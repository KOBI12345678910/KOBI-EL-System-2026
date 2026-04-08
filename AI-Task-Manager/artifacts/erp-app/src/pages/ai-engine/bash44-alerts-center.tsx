import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Bell, AlertTriangle, CheckCircle2, Clock, RefreshCw, Search, Download,
  ShieldAlert, Brain, Bot, Users, Package, DollarSign, Wrench, TrendingUp,
  ArrowUpCircle, BarChart3, Repeat, Eye, Zap, Activity, FileWarning
} from "lucide-react";

type Severity = "critical" | "high" | "medium" | "low";
const SEV: Record<Severity, { he: string; cls: string }> = {
  critical: { he: "קריטי", cls: "bg-red-500/20 text-red-300 border-red-500/30" },
  high: { he: "גבוה", cls: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  medium: { he: "בינוני", cls: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
  low: { he: "נמוך", cls: "bg-green-500/20 text-green-300 border-green-500/30" },
};

const kpis = [
  { label: "התראות פתוחות", value: "12", icon: Bell, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  { label: "התראות קריטיות", value: "3", icon: ShieldAlert, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  { label: "נפתרו היום", value: "8", icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  { label: "זמן פתרון ממוצע", value: "42 דק׳", icon: Clock, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  { label: "התראות חוזרות", value: "5", icon: Repeat, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
];

const openAlerts = [
  { id: "ALR-1001", agent: "סוכן מלאי", entityType: "מוצר", entityId: "SKU-2281", type: "חריגה", severity: "critical" as Severity, title: "מלאי אפס - מוצר ביקוש", message: "מוצר SKU-2281 הגיע למלאי 0 למרות 14 הזמנות ממתינות", role: "מנהל מלאי", time: "08:12" },
  { id: "ALR-1002", agent: "סוכן כספים", entityType: "חשבונית", entityId: "INV-9982", type: "חריגה פיננסית", severity: "critical" as Severity, title: "חשבונית ללא כיסוי תקציבי", message: "חשבונית בסך ₪87,400 חורגת מתקציב המחלקה ב-34%", role: "סמנכ״ל כספים", time: "08:45" },
  { id: "ALR-1003", agent: "סוכן ייצור", entityType: "קו ייצור", entityId: "LINE-03", type: "השבתה", severity: "critical" as Severity, title: "קו ייצור 3 - השבתת חירום", message: "זוהתה תקלה בחיישן טמפרטורה, ייצור נעצר אוטומטית", role: "מנהל ייצור", time: "09:02" },
  { id: "ALR-1004", agent: "סוכן מכירות", entityType: "עסקה", entityId: "DL-4455", type: "סיכון", severity: "high" as Severity, title: "עסקה בסיכון נטישה", message: "לקוח לא הגיב 12 ימים, סיכוי סגירה ירד ל-18%", role: "מנהל מכירות", time: "09:30" },
  { id: "ALR-1005", agent: "סוכן איכות", entityType: "אצוות", entityId: "BT-0078", type: "פגם", severity: "high" as Severity, title: "שיעור פגמים חורג מ-SLA", message: "אצוות BT-0078 עם 8.4% פגמים — סף מותר 3%", role: "מנהל איכות", time: "09:51" },
  { id: "ALR-1006", agent: "סוכן רכש", entityType: "הזמנת רכש", entityId: "PO-3310", type: "עיכוב", severity: "high" as Severity, title: "ספק מאחר באספקה 6 ימים", message: "הזמנה PO-3310 מספק 'מתכת-פלוס' טרם הגיעה", role: "מנהל רכש", time: "10:15" },
  { id: "ALR-1007", agent: "סוכן HR", entityType: "עובד", entityId: "EMP-1120", type: "אנומליה", severity: "medium" as Severity, title: "נוכחות חריגה - עובד מפתח", message: "עובד EMP-1120 לא נרשם 3 ימים ברצף ללא אישור", role: "מנהל משאבי אנוש", time: "10:40" },
  { id: "ALR-1008", agent: "סוכן מלאי", entityType: "מחסן", entityId: "WH-02", type: "קיבולת", severity: "medium" as Severity, title: "מחסן 2 מתקרב לקיבולת מלאה", message: "תפוסה 91% — צפי להגיע ל-100% תוך 48 שעות", role: "מנהל לוגיסטיקה", time: "11:05" },
  { id: "ALR-1009", agent: "סוכן שירות", entityType: "פנייה", entityId: "TK-7821", type: "SLA", severity: "medium" as Severity, title: "חריגה מזמן SLA", message: "פנייה TK-7821 פתוחה 48 שעות — SLA הוא 24 שעות", role: "מנהל שירות", time: "11:28" },
  { id: "ALR-1010", agent: "סוכן כספים", entityType: "לקוח", entityId: "CUS-0445", type: "אשראי", severity: "medium" as Severity, title: "לקוח חרג ממסגרת אשראי", message: "לקוח CUS-0445 חורג ב-₪23,100 ממסגרת ₪150,000", role: "מנהל אשראי", time: "12:00" },
  { id: "ALR-1011", agent: "סוכן ייצור", entityType: "מכונה", entityId: "MC-205", type: "תחזוקה", severity: "low" as Severity, title: "תחזוקה מונעת בעוד 3 ימים", message: "מכונה MC-205 מתוזמנת לתחזוקה ב-11/04 — יש לתאם", role: "טכנאי ראשי", time: "12:30" },
  { id: "ALR-1012", agent: "סוכן מכירות", entityType: "הצעת מחיר", entityId: "QT-2210", type: "תפוגה", severity: "low" as Severity, title: "הצעת מחיר פגת תוקף מחר", message: "הצעה QT-2210 בסך ₪64,000 תפוג ב-09/04", role: "נציג מכירות", time: "13:10" },
];

const resolvedAlerts = [
  { id: "ALR-0985", agent: "סוכן מלאי", title: "מלאי מינימלי - ברגים M8", severity: "high" as Severity, opened: "07:15", closed: "07:42", duration: "27 דק׳", resolver: "מערכת אוטומטית" },
  { id: "ALR-0986", agent: "סוכן כספים", title: "תשלום כפול לספק", severity: "critical" as Severity, opened: "07:30", closed: "08:05", duration: "35 דק׳", resolver: "דנה כהן" },
  { id: "ALR-0987", agent: "סוכן ייצור", title: "לחץ שמן חריג - מכבש A1", severity: "high" as Severity, opened: "07:48", closed: "08:20", duration: "32 דק׳", resolver: "יוסי מזרחי" },
  { id: "ALR-0988", agent: "סוכן שירות", title: "פניית VIP לא טופלה", severity: "critical" as Severity, opened: "08:00", closed: "08:18", duration: "18 דק׳", resolver: "רוני אברהם" },
  { id: "ALR-0989", agent: "סוכן מכירות", title: "ירידת 30% בפניות אתר", severity: "medium" as Severity, opened: "08:10", closed: "09:15", duration: "65 דק׳", resolver: "שירה לוי" },
  { id: "ALR-0990", agent: "סוכן רכש", title: "מחיר ספק עלה ב-15%", severity: "medium" as Severity, opened: "08:25", closed: "09:00", duration: "35 דק׳", resolver: "מערכת אוטומטית" },
  { id: "ALR-0991", agent: "סוכן איכות", title: "דגימה נכשלה - חומר גלם", severity: "high" as Severity, opened: "08:40", closed: "09:22", duration: "42 דק׳", resolver: "אלי בן-דוד" },
  { id: "ALR-0992", agent: "סוכן HR", title: "חוסר בצוות משמרת לילה", severity: "medium" as Severity, opened: "06:00", closed: "06:45", duration: "45 דק׳", resolver: "מיכל שמעוני" },
  { id: "ALR-0993", agent: "סוכן מלאי", title: "פער ספירת מלאי מחסן 1", severity: "low" as Severity, opened: "07:00", closed: "08:30", duration: "90 דק׳", resolver: "אורן דהן" },
  { id: "ALR-0994", agent: "סוכן כספים", title: "העברה בנקאית נדחתה", severity: "high" as Severity, opened: "09:05", closed: "09:35", duration: "30 דק׳", resolver: "טל פרידמן" },
  { id: "ALR-0995", agent: "סוכן ייצור", title: "סטיית טמפרטורה בתנור", severity: "medium" as Severity, opened: "09:20", closed: "10:10", duration: "50 דק׳", resolver: "יוסי מזרחי" },
  { id: "ALR-0996", agent: "סוכן מכירות", title: "עסקה גדולה ללא אישור מנהל", severity: "high" as Severity, opened: "09:40", closed: "10:02", duration: "22 דק׳", resolver: "שירה לוי" },
  { id: "ALR-0997", agent: "סוכן שירות", title: "5 פניות באותו נושא", severity: "medium" as Severity, opened: "10:00", closed: "10:45", duration: "45 דק׳", resolver: "מערכת אוטומטית" },
  { id: "ALR-0998", agent: "סוכן רכש", title: "חוזה ספק פג תוקף", severity: "low" as Severity, opened: "10:15", closed: "11:00", duration: "45 דק׳", resolver: "דנה כהן" },
  { id: "ALR-0999", agent: "סוכן איכות", title: "סטיית מידות ברכיב X", severity: "low" as Severity, opened: "10:30", closed: "11:45", duration: "75 דק׳", resolver: "אלי בן-דוד" },
];

const agentGroups = [
  { agent: "סוכן מלאי", icon: Package, color: "text-amber-400", count: 3, critical: 1, high: 1, medium: 1, low: 0 },
  { agent: "סוכן כספים", icon: DollarSign, color: "text-emerald-400", count: 2, critical: 1, high: 0, medium: 1, low: 0 },
  { agent: "סוכן ייצור", icon: Wrench, color: "text-blue-400", count: 2, critical: 1, high: 0, medium: 0, low: 1 },
  { agent: "סוכן מכירות", icon: TrendingUp, color: "text-rose-400", count: 2, critical: 0, high: 1, medium: 0, low: 1 },
  { agent: "סוכן איכות", icon: ShieldAlert, color: "text-violet-400", count: 1, critical: 0, high: 1, medium: 0, low: 0 },
  { agent: "סוכן רכש", icon: FileWarning, color: "text-cyan-400", count: 1, critical: 0, high: 1, medium: 0, low: 0 },
  { agent: "סוכן שירות", icon: Users, color: "text-pink-400", count: 1, critical: 0, high: 0, medium: 1, low: 0 },
  { agent: "סוכן HR", icon: Users, color: "text-orange-400", count: 1, critical: 0, high: 0, medium: 1, low: 0 },
];

const patterns = [
  { pattern: "מלאי אפס במוצרי ביקוש", freq: 14, trend: "עולה", lastWeek: 9, entity: "SKU-2281, SKU-1190, SKU-3345", agent: "סוכן מלאי", severity: "critical" as Severity, suggestion: "הפעלת מנגנון הזמנה אוטומטית כשמלאי יורד מתחת ל-20 יח׳" },
  { pattern: "חריגת SLA בפניות שירות", freq: 11, trend: "יציב", lastWeek: 10, entity: "TK-7821, TK-7654, TK-7590", agent: "סוכן שירות", severity: "high" as Severity, suggestion: "הוספת נציג נוסף למשמרת בוקר + אסקלציה אוטומטית ב-18 שעות" },
  { pattern: "סטיית טמפרטורה בציוד ייצור", freq: 8, trend: "עולה", lastWeek: 5, entity: "MC-205, MC-118, LINE-03", agent: "סוכן ייצור", severity: "high" as Severity, suggestion: "התקנת חיישנים משניים + כיול חודשי אוטומטי" },
  { pattern: "ספקים מאחרים באספקה", freq: 7, trend: "יציב", lastWeek: 7, entity: "PO-3310, PO-3288, PO-3275", agent: "סוכן רכש", severity: "medium" as Severity, suggestion: "הוספת קנסות איחור לחוזים + ספק גיבוי לפריטים קריטיים" },
  { pattern: "פגמים חוזרים באצוות ייצור", freq: 6, trend: "יורד", lastWeek: 8, entity: "BT-0078, BT-0065", agent: "סוכן איכות", severity: "medium" as Severity, suggestion: "בדיקת חומרי גלם בכניסה + תיקון פרמטרי מכונה" },
];
const topEntities = [
  { entity: "SKU-2281", type: "מוצר", alerts: 9, lastAlert: "08:12", agents: "מלאי, מכירות" },
  { entity: "LINE-03", type: "קו ייצור", alerts: 7, lastAlert: "09:02", agents: "ייצור, איכות" },
  { entity: "CUS-0445", type: "לקוח", alerts: 5, lastAlert: "12:00", agents: "כספים, מכירות" },
  { entity: "MC-205", type: "מכונה", alerts: 4, lastAlert: "12:30", agents: "ייצור" },
  { entity: "PO-3310", type: "הזמנת רכש", alerts: 3, lastAlert: "10:15", agents: "רכש, מלאי" },
];
const trendData = [
  { day: "ראשון", total: 18, critical: 4, resolved: 15 },
  { day: "שני", total: 22, critical: 5, resolved: 19 },
  { day: "שלישי", total: 15, critical: 2, resolved: 14 },
  { day: "רביעי", total: 20, critical: 3, resolved: 17 },
  { day: "חמישי", total: 25, critical: 6, resolved: 20 },
  { day: "שישי", total: 12, critical: 1, resolved: 12 },
  { day: "היום", total: 20, critical: 3, resolved: 8 },
];
const TC: Record<string, string> = { "עולה": "text-red-400", "יורד": "text-emerald-400", "יציב": "text-blue-400" };

export default function Bash44AlertsCenter() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("open");

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500 to-amber-600 flex items-center justify-center">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">מרכז התראות AI</h1>
            <p className="text-sm text-muted-foreground">טכנו-כל עוזי — ניהול התראות חכם מכל סוכני הבינה</p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="חיפוש התראה..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 w-56 bg-background/50" />
          </div>
          <Button variant="outline" size="sm"><RefreshCw className="w-4 h-4 ml-1" />רענון</Button>
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />יצוא</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpis.map((k, i) => (
          <Card key={i} className={`border ${k.bg}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <k.icon className={`w-5 h-5 ${k.color}`} />
                <span className="text-xs text-muted-foreground">{k.label}</span>
              </div>
              <div className="text-2xl font-bold text-foreground">{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-card/50 border border-border/50 p-1">
          <TabsTrigger value="open" className="gap-1.5"><Bell className="w-4 h-4" />התראות פתוחות</TabsTrigger>
          <TabsTrigger value="resolved" className="gap-1.5"><CheckCircle2 className="w-4 h-4" />נפתרו</TabsTrigger>
          <TabsTrigger value="agents" className="gap-1.5"><Bot className="w-4 h-4" />לפי סוכן</TabsTrigger>
          <TabsTrigger value="patterns" className="gap-1.5"><BarChart3 className="w-4 h-4" />דפוסים</TabsTrigger>
        </TabsList>

        {/* Tab 1 - Open Alerts */}
        <TabsContent value="open" className="space-y-3">
          {openAlerts.filter(a => !search || a.title.includes(search) || a.id.includes(search) || a.agent.includes(search)).map(a => (
            <Card key={a.id} className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground">{a.id}</span>
                      <Badge className={SEV[a.severity].cls + " border text-xs"}>{SEV[a.severity].he}</Badge>
                      <Badge variant="outline" className="text-xs">{a.type}</Badge>
                      <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-300 border-blue-500/30">{a.agent}</Badge>
                    </div>
                    <div className="text-sm font-semibold text-foreground">{a.title}</div>
                    <div className="text-xs text-muted-foreground">{a.message}</div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>ישות: <span className="text-foreground font-medium">{a.entityType} {a.entityId}</span></span>
                      <span>אחראי: <span className="text-foreground font-medium">{a.role}</span></span>
                      <span>נפתח: <span className="text-foreground font-medium">{a.time}</span></span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 min-w-[90px]">
                    <Button size="sm" variant="outline" className="text-xs h-7"><Eye className="w-3 h-3 ml-1" />אישור</Button>
                    <Button size="sm" className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="w-3 h-3 ml-1" />פתרון</Button>
                    <Button size="sm" variant="outline" className="text-xs h-7 text-red-400 border-red-500/30 hover:bg-red-500/10"><ArrowUpCircle className="w-3 h-3 ml-1" />הסלמה</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Tab 2 - Resolved */}
        <TabsContent value="resolved" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" />התראות שנפתרו היום — {resolvedAlerts.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/30 text-xs text-muted-foreground">
                      <th className="text-right py-2 px-2">מזהה</th>
                      <th className="text-right py-2 px-2">סוכן</th>
                      <th className="text-right py-2 px-2">כותרת</th>
                      <th className="text-right py-2 px-2">חומרה</th>
                      <th className="text-right py-2 px-2">נפתח</th>
                      <th className="text-right py-2 px-2">נסגר</th>
                      <th className="text-right py-2 px-2">משך</th>
                      <th className="text-right py-2 px-2">נפתר ע״י</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resolvedAlerts.filter(a => !search || a.title.includes(search) || a.id.includes(search)).map(a => (
                      <tr key={a.id} className="border-b border-border/20 hover:bg-muted/20">
                        <td className="py-2 px-2 font-mono text-xs text-muted-foreground">{a.id}</td>
                        <td className="py-2 px-2 text-xs">{a.agent}</td>
                        <td className="py-2 px-2 text-xs font-medium text-foreground">{a.title}</td>
                        <td className="py-2 px-2"><Badge className={SEV[a.severity].cls + " border text-xs"}>{SEV[a.severity].he}</Badge></td>
                        <td className="py-2 px-2 text-xs">{a.opened}</td>
                        <td className="py-2 px-2 text-xs">{a.closed}</td>
                        <td className="py-2 px-2 text-xs font-medium">{a.duration}</td>
                        <td className="py-2 px-2 text-xs">{a.resolver}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3 - By Agent */}
        <TabsContent value="agents" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {agentGroups.map((g, i) => (
              <Card key={i} className="bg-card/50 border-border/50">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <g.icon className={`w-5 h-5 ${g.color}`} />
                      <span className="text-sm font-semibold text-foreground">{g.agent}</span>
                    </div>
                    <Badge variant="outline" className="text-xs">{g.count} התראות</Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="rounded bg-red-500/10 p-1.5">
                      <div className="text-sm font-bold text-red-400">{g.critical}</div>
                      <div className="text-[10px] text-muted-foreground">קריטי</div>
                    </div>
                    <div className="rounded bg-orange-500/10 p-1.5">
                      <div className="text-sm font-bold text-orange-400">{g.high}</div>
                      <div className="text-[10px] text-muted-foreground">גבוה</div>
                    </div>
                    <div className="rounded bg-yellow-500/10 p-1.5">
                      <div className="text-sm font-bold text-yellow-400">{g.medium}</div>
                      <div className="text-[10px] text-muted-foreground">בינוני</div>
                    </div>
                    <div className="rounded bg-green-500/10 p-1.5">
                      <div className="text-sm font-bold text-green-400">{g.low}</div>
                      <div className="text-[10px] text-muted-foreground">נמוך</div>
                    </div>
                  </div>
                  <Progress value={(g.critical * 100 + g.high * 60 + g.medium * 30 + g.low * 10) / Math.max(g.count, 1)} className="h-2" />
                  <div className="text-xs text-muted-foreground text-center">
                    רמת דחיפות כוללת: <span className={g.critical > 0 ? "text-red-400 font-medium" : g.high > 0 ? "text-orange-400 font-medium" : "text-emerald-400 font-medium"}>
                      {g.critical > 0 ? "קריטית" : g.high > 0 ? "גבוהה" : "תקינה"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {/* Agent alert list */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Bot className="w-4 h-4 text-blue-400" />סיכום פעילות סוכנים — 7 ימים אחרונים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/30 text-xs text-muted-foreground">
                      <th className="text-right py-2 px-2">סוכן</th>
                      <th className="text-right py-2 px-2">התראות שנוצרו</th>
                      <th className="text-right py-2 px-2">נפתרו אוטומטית</th>
                      <th className="text-right py-2 px-2">זמן פתרון ממוצע</th>
                      <th className="text-right py-2 px-2">דיוק</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { agent: "סוכן מלאי", created: 28, auto: 18, avg: "25 דק׳", acc: 94 },
                      { agent: "סוכן כספים", created: 19, auto: 8, avg: "38 דק׳", acc: 97 },
                      { agent: "סוכן ייצור", created: 24, auto: 15, avg: "31 דק׳", acc: 91 },
                      { agent: "סוכן מכירות", created: 15, auto: 6, avg: "52 דק׳", acc: 88 },
                      { agent: "סוכן איכות", created: 12, auto: 5, avg: "44 דק׳", acc: 95 },
                      { agent: "סוכן רכש", created: 10, auto: 4, avg: "48 דק׳", acc: 92 },
                      { agent: "סוכן שירות", created: 16, auto: 10, avg: "33 דק׳", acc: 90 },
                      { agent: "סוכן HR", created: 8, auto: 3, avg: "55 דק׳", acc: 86 },
                    ].map((r, i) => (
                      <tr key={i} className="border-b border-border/20 hover:bg-muted/20">
                        <td className="py-2 px-2 font-medium text-foreground">{r.agent}</td>
                        <td className="py-2 px-2">{r.created}</td>
                        <td className="py-2 px-2">{r.auto} <span className="text-muted-foreground text-xs">({Math.round(r.auto / r.created * 100)}%)</span></td>
                        <td className="py-2 px-2">{r.avg}</td>
                        <td className="py-2 px-2"><Badge variant="outline" className={r.acc >= 93 ? "text-emerald-400 border-emerald-500/30" : r.acc >= 88 ? "text-blue-400 border-blue-500/30" : "text-amber-400 border-amber-500/30"}>{r.acc}%</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4 - Patterns */}
        <TabsContent value="patterns" className="space-y-4">
          {/* Recurring patterns */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Repeat className="w-4 h-4 text-violet-400" />דפוסי התראות חוזרים</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {patterns.map((p, i) => (
                <div key={i} className="p-3 rounded-lg bg-background/30 border border-border/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={SEV[p.severity].cls + " border text-xs"}>{SEV[p.severity].he}</Badge>
                      <span className="text-sm font-semibold text-foreground">{p.pattern}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">מגמה:</span>
                      <span className={TC[p.trend] || "text-muted-foreground"}>{p.trend}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>תדירות: <span className="text-foreground font-medium">{p.freq} בשבוע</span></span>
                    <span>שבוע שעבר: <span className="text-foreground font-medium">{p.lastWeek}</span></span>
                    <span>סוכן: <span className="text-foreground font-medium">{p.agent}</span></span>
                  </div>
                  <div className="text-xs text-muted-foreground">ישויות: <span className="text-foreground">{p.entity}</span></div>
                  <div className="flex items-center gap-2 p-2 rounded bg-violet-500/5 border border-violet-500/20">
                    <Brain className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    <span className="text-xs text-violet-300">{p.suggestion}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Trend */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4 text-cyan-400" />מגמת התראות — שבוע נוכחי</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {trendData.map((d, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className="min-w-[50px] text-muted-foreground">{d.day}</span>
                    <div className="flex-1 flex items-center gap-1">
                      <div className="h-4 rounded bg-blue-500/30" style={{ width: `${d.total * 3}px` }} />
                      <div className="h-4 rounded bg-red-500/40" style={{ width: `${d.critical * 8}px` }} />
                    </div>
                    <span className="text-foreground font-medium min-w-[20px]">{d.total}</span>
                    <span className="text-red-400 min-w-[20px]">{d.critical}</span>
                    <span className="text-emerald-400 min-w-[20px]">{d.resolved}</span>
                  </div>
                ))}
                <div className="flex items-center gap-4 text-[10px] text-muted-foreground mt-2 pt-2 border-t border-border/30">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-500/30" />סה״כ</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-500/40" />קריטיות</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500/40" />נפתרו</span>
                </div>
              </CardContent>
            </Card>

            {/* Top Entities */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Zap className="w-4 h-4 text-amber-400" />ישויות עם הכי הרבה התראות</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {topEntities.map((e, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-background/30 border border-border/30">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-amber-500/10 flex items-center justify-center text-xs font-bold text-amber-400">{i + 1}</div>
                      <div>
                        <div className="text-sm font-medium text-foreground">{e.entity}</div>
                        <div className="text-xs text-muted-foreground">{e.type} — סוכנים: {e.agents}</div>
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-bold text-foreground">{e.alerts} התראות</div>
                      <div className="text-xs text-muted-foreground">אחרונה: {e.lastAlert}</div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
