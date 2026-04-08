import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Bell, AlertTriangle, ShieldAlert, CheckCircle2, Clock, RefreshCcw,
  Search, FileWarning, FlaskConical, ShieldX, CalendarClock, FileCheck2,
  Award, Calculator, Cpu, GitPullRequest, SlidersHorizontal, TrendingUp,
} from "lucide-react";

// ── Alert type config ──
const alertTypes: Record<string, { label: string; icon: typeof Bell; color: string }> = {
  drawing_overdue: { label: "שרטוט באיחור", icon: FileWarning, color: "text-red-400" },
  standard_expiring: { label: "תקן פג תוקף", icon: ShieldAlert, color: "text-orange-400" },
  test_failure: { label: "כשל בדיקה", icon: FlaskConical, color: "text-red-300" },
  material_nonconformance: { label: "אי התאמת חומר", icon: ShieldX, color: "text-rose-400" },
  project_delay: { label: "עיכוב פרויקט", icon: CalendarClock, color: "text-amber-400" },
  review_overdue: { label: "סקירה באיחור", icon: FileCheck2, color: "text-yellow-400" },
  certification_expiring: { label: "הסמכה פגה", icon: Award, color: "text-purple-400" },
  calculation_error: { label: "שגיאת חישוב", icon: Calculator, color: "text-pink-400" },
  prototype_failure: { label: "כשל אב-טיפוס", icon: Cpu, color: "text-red-500" },
  ecn_pending: { label: "ECN ממתין", icon: GitPullRequest, color: "text-cyan-400" },
};

// ── Active alerts (12) ──
const activeAlerts = [
  { id: "ALR-301", type: "drawing_overdue", severity: "קריטי", desc: "שרטוט DWG-112 מפעל תעופה לוד -- איחור 5 ימים", assigned: "יוסי כהן", time: "2026-04-08 08:15" },
  { id: "ALR-302", type: "test_failure", severity: "קריטי", desc: "כשל בדיקת עומס פרופיל AL-6063 אצווה 78", assigned: "שרה לוי", time: "2026-04-08 07:42" },
  { id: "ALR-303", type: "material_nonconformance", severity: "קריטי", desc: "זכוכית מחוסמת LOT-445 לא עומדת בתקן EN-12150", assigned: "דוד מזרחי", time: "2026-04-08 06:30" },
  { id: "ALR-304", type: "standard_expiring", severity: "גבוה", desc: "תקן ISO 9001:2015 פג ב-15/04/2026 -- נדרש חידוש", assigned: "רחל אברהם", time: "2026-04-07 16:20" },
  { id: "ALR-305", type: "project_delay", severity: "גבוה", desc: "פרויקט מגדל מגורים ת\"א -- עיכוב 8 ימים בשלב ייצור", assigned: "אלון גולדשטיין", time: "2026-04-07 14:55" },
  { id: "ALR-306", type: "ecn_pending", severity: "גבוה", desc: "ECN-089 ממתין לאישור מנהל הנדסה 3 ימים", assigned: "מיכל ברק", time: "2026-04-07 11:30" },
  { id: "ALR-307", type: "review_overdue", severity: "בינוני", desc: "סקירת שרטוט DWG-108 מתחם ספורט נתניה -- 2 ימי איחור", assigned: "עומר חדד", time: "2026-04-07 09:10" },
  { id: "ALR-308", type: "certification_expiring", severity: "בינוני", desc: "הסמכת CE לקו ייצור 3 פגה ב-20/04/2026", assigned: "נועה פרידמן", time: "2026-04-06 17:45" },
  { id: "ALR-309", type: "calculation_error", severity: "בינוני", desc: "סטייה של 3.2% בחישוב עומס רוח קומה 18", assigned: "יוסי כהן", time: "2026-04-06 15:20" },
  { id: "ALR-310", type: "prototype_failure", severity: "גבוה", desc: "אב-טיפוס חלון חסין אש לא עבר בדיקת 60 דקות", assigned: "שרה לוי", time: "2026-04-06 12:00" },
  { id: "ALR-311", type: "drawing_overdue", severity: "נמוך", desc: "שרטוט התקנה DWG-115 קניון ירושלים -- איחור יום אחד", assigned: "דוד מזרחי", time: "2026-04-06 10:30" },
  { id: "ALR-312", type: "ecn_pending", severity: "נמוך", desc: "ECN-091 בית חולים אשדוד ממתין לאישור ספק", assigned: "רחל אברהם", time: "2026-04-05 16:40" },
];

// ── History (15 resolved) ──
const historyAlerts = [
  { id: "ALR-280", type: "drawing_overdue", desc: "שרטוט DWG-098 בניין משרדים רמת גן", resolved: "יוסי כהן", date: "2026-04-05", duration: "4 שעות" },
  { id: "ALR-281", type: "test_failure", desc: "כשל בדיקת אטימות חלון סדרה W-200", resolved: "שרה לוי", date: "2026-04-05", duration: "6 שעות" },
  { id: "ALR-282", type: "material_nonconformance", desc: "אלומיניום 6060 LOT-432 מחוץ לסבילות", resolved: "דוד מזרחי", date: "2026-04-04", duration: "2 ימים" },
  { id: "ALR-283", type: "project_delay", desc: "עיכוב שילוח פרויקט מפעל חיפה -- נפתר עם ספק חלופי", resolved: "אלון גולדשטיין", date: "2026-04-04", duration: "3 ימים" },
  { id: "ALR-284", type: "standard_expiring", desc: "חידוש תקן EN-1090 לציפוי אבקתי", resolved: "רחל אברהם", date: "2026-04-04", duration: "5 ימים" },
  { id: "ALR-285", type: "ecn_pending", desc: "ECN-085 שינוי פרופיל דלת כניסה אושר", resolved: "מיכל ברק", date: "2026-04-03", duration: "1 יום" },
  { id: "ALR-286", type: "review_overdue", desc: "סקירת מפרט טכני מרכז מסחרי באר שבע", resolved: "עומר חדד", date: "2026-04-03", duration: "8 שעות" },
  { id: "ALR-287", type: "calculation_error", desc: "תיקון חישוב משקל יחידת חיפוי קומה 12", resolved: "נועה פרידמן", date: "2026-04-03", duration: "3 שעות" },
  { id: "ALR-288", type: "certification_expiring", desc: "חידוש הסמכת מעבדה לבדיקות עומס", resolved: "יוסי כהן", date: "2026-04-02", duration: "7 ימים" },
  { id: "ALR-289", type: "prototype_failure", desc: "תיקון אב-טיפוס מנגנון פתיחה חשמלי", resolved: "שרה לוי", date: "2026-04-02", duration: "2 ימים" },
  { id: "ALR-290", type: "drawing_overdue", desc: "שרטוט ייצור DWG-095 מגדל מגורים", resolved: "דוד מזרחי", date: "2026-04-01", duration: "1 יום" },
  { id: "ALR-291", type: "material_nonconformance", desc: "זכוכית למינציה LOT-428 עובי חורג", resolved: "אלון גולדשטיין", date: "2026-04-01", duration: "12 שעות" },
  { id: "ALR-292", type: "test_failure", desc: "כשל בדיקת בידוד תרמי חלון סדרה T-400", resolved: "רחל אברהם", date: "2026-03-31", duration: "1 יום" },
  { id: "ALR-293", type: "ecn_pending", desc: "ECN-082 החלפת סוג אטם -- אושר", resolved: "מיכל ברק", date: "2026-03-31", duration: "5 שעות" },
  { id: "ALR-294", type: "project_delay", desc: "עיכוב הובלת מסגרות לאתר נתניה", resolved: "עומר חדד", date: "2026-03-30", duration: "2 ימים" },
];

// ── Threshold settings (10) ──
const thresholds = [
  { id: 1, name: "איחור שרטוט (ימים)", type: "drawing_overdue", value: 3, min: 1, max: 14 },
  { id: 2, name: "ימים לפני פקיעת תקן", type: "standard_expiring", value: 30, min: 7, max: 90 },
  { id: 3, name: "כשלי בדיקה מקסימום באצווה", type: "test_failure", value: 2, min: 1, max: 10 },
  { id: 4, name: "סטיית חומר מקסימלית (%)", type: "material_nonconformance", value: 5, min: 1, max: 15 },
  { id: 5, name: "ימי עיכוב פרויקט להתראה", type: "project_delay", value: 5, min: 1, max: 30 },
  { id: 6, name: "ימי איחור סקירה", type: "review_overdue", value: 2, min: 1, max: 7 },
  { id: 7, name: "ימים לפני פקיעת הסמכה", type: "certification_expiring", value: 45, min: 14, max: 120 },
  { id: 8, name: "סטיית חישוב מקסימלית (%)", type: "calculation_error", value: 2, min: 0.5, max: 10 },
  { id: 9, name: "כשלי אב-טיפוס לפני עצירה", type: "prototype_failure", value: 3, min: 1, max: 5 },
  { id: 10, name: "ימי המתנה ECN מקסימום", type: "ecn_pending", value: 5, min: 1, max: 14 },
];

// ── Helpers ──
const severityColor = (s: string) =>
  s === "קריטי" ? "bg-red-500/20 text-red-300"
  : s === "גבוה" ? "bg-orange-500/20 text-orange-300"
  : s === "בינוני" ? "bg-amber-500/20 text-amber-300"
  : "bg-blue-500/20 text-blue-300";

const th = "p-3 text-right text-muted-foreground font-medium text-xs";
const td = "p-3 text-sm";

export default function EngineeringAlertsPage() {
  const [tab, setTab] = useState("active");
  const [search, setSearch] = useState("");

  const filtered = activeAlerts.filter(a =>
    a.desc.includes(search) || a.assigned.includes(search) || a.id.includes(search)
  );

  const kpis = [
    { label: "התראות פעילות", value: "12", icon: Bell, color: "text-red-400" },
    { label: "קריטיות", value: "3", icon: ShieldAlert, color: "text-rose-400" },
    { label: "נפתרו היום", value: "5", icon: CheckCircle2, color: "text-green-400" },
    { label: "זמן פתרון ממוצע", value: "18 שע'", icon: Clock, color: "text-cyan-400" },
    { label: "חוזרות", value: "4", icon: RefreshCcw, color: "text-purple-400" },
  ];

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-red-400" />
            התראות הנדסה
          </h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי -- Engineering Alerts & Notifications</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש התראות..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pr-9 w-56 bg-card/60 border-border text-sm"
            />
          </div>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className="bg-card/80 border-border hover:border-border transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground">{k.label}</p>
                  <p className={`text-lg font-bold font-mono mt-1 ${k.color}`}>{k.value}</p>
                </div>
                <k.icon className={`h-5 w-5 ${k.color} opacity-60`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Resolution progress ── */}
      <Card className="bg-card/60 border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">שיעור פתרון התראות -- יעד 95%</span>
            <span className="text-sm font-mono text-green-400">82%</span>
          </div>
          <Progress value={82} className="h-2" />
        </CardContent>
      </Card>

      {/* ── Severity Distribution ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "קריטי", count: 3, color: "bg-red-500", pct: 25 },
          { label: "גבוה", count: 4, color: "bg-orange-500", pct: 33 },
          { label: "בינוני", count: 3, color: "bg-amber-500", pct: 25 },
          { label: "נמוך", count: 2, color: "bg-blue-500", pct: 17 },
        ].map((s, i) => (
          <Card key={i} className="bg-card/60 border-border">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <span className="text-sm font-bold font-mono text-foreground">{s.count}</span>
              </div>
              <div className="w-full bg-muted/30 rounded-full h-1.5">
                <div className={`${s.color} h-1.5 rounded-full`} style={{ width: `${s.pct}%` }} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="bg-card/60 border border-border w-full justify-start gap-1 p-1 h-auto flex-wrap">
          <TabsTrigger value="active" className="data-[state=active]:bg-red-600 data-[state=active]:text-white gap-1.5 text-xs">
            <Bell className="h-3.5 w-3.5" />התראות פעילות ({filtered.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-green-600 data-[state=active]:text-white gap-1.5 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5" />היסטוריה
          </TabsTrigger>
          <TabsTrigger value="thresholds" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs">
            <SlidersHorizontal className="h-3.5 w-3.5" />הגדרות סף
          </TabsTrigger>
        </TabsList>

        {/* ── Active Alerts Tab ── */}
        <TabsContent value="active">
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
              <th className={th}>מזהה</th><th className={th}>חומרה</th><th className={th}>סוג</th>
              <th className={th}>תיאור</th><th className={th}>אחראי</th><th className={th}>זמן</th>
            </tr></thead><tbody>
              {filtered.map((a, i) => {
                const t = alertTypes[a.type];
                const Icon = t.icon;
                return (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className={`${td} font-mono text-blue-400 font-bold`}>{a.id}</td>
                    <td className={td}><Badge className={`${severityColor(a.severity)} border-0 text-xs`}>{a.severity}</Badge></td>
                    <td className={td}>
                      <span className={`flex items-center gap-1.5 ${t.color}`}>
                        <Icon className="h-3.5 w-3.5" /><span className="text-xs">{t.label}</span>
                      </span>
                    </td>
                    <td className={`${td} text-muted-foreground max-w-[320px]`}>{a.desc}</td>
                    <td className={`${td} text-foreground font-medium`}>{a.assigned}</td>
                    <td className={`${td} font-mono text-muted-foreground text-xs`}>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{a.time}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody></table>
          </div></CardContent></Card>
        </TabsContent>

        {/* ── History Tab ── */}
        <TabsContent value="history">
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
              <th className={th}>מזהה</th><th className={th}>סוג</th><th className={th}>תיאור</th>
              <th className={th}>נפתר ע\"י</th><th className={th}>תאריך</th><th className={th}>זמן פתרון</th>
            </tr></thead><tbody>
              {historyAlerts.map((a, i) => {
                const t = alertTypes[a.type];
                const Icon = t.icon;
                return (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className={`${td} font-mono text-green-400 font-bold`}>{a.id}</td>
                    <td className={td}>
                      <span className={`flex items-center gap-1.5 ${t.color}`}>
                        <Icon className="h-3.5 w-3.5" /><span className="text-xs">{t.label}</span>
                      </span>
                    </td>
                    <td className={`${td} text-muted-foreground max-w-[320px]`}>{a.desc}</td>
                    <td className={`${td} text-foreground font-medium`}>{a.resolved}</td>
                    <td className={`${td} font-mono text-muted-foreground`}>{a.date}</td>
                    <td className={td}>
                      <Badge className="bg-green-500/20 text-green-300 border-0 text-xs">{a.duration}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody></table>
          </div></CardContent></Card>
        </TabsContent>

        {/* ── Thresholds Tab ── */}
        <TabsContent value="thresholds">
          <div className="grid gap-3">
            {thresholds.map(t => {
              const at = alertTypes[t.type];
              const Icon = at.icon;
              const pct = ((t.value - t.min) / (t.max - t.min)) * 100;
              return (
                <Card key={t.id} className="bg-card/80 border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${at.color}`} />
                        <span className="text-sm font-medium text-foreground">{t.name}</span>
                        <Badge className="bg-card border border-border text-muted-foreground text-[10px]">{at.label}</Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">מינימום: {t.min}</span>
                        <span className="text-sm font-bold font-mono text-blue-400">{t.value}</span>
                        <span className="text-xs text-muted-foreground">מקסימום: {t.max}</span>
                        <Button variant="outline" size="sm" className="h-7 text-xs border-border">
                          <TrendingUp className="h-3 w-3 ml-1" />עדכן
                        </Button>
                      </div>
                    </div>
                    <Progress value={pct} className="h-1.5" />
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
