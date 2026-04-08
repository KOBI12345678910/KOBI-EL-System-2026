import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Bell, AlertTriangle, AlertOctagon, ShieldAlert, Clock, CheckCircle2,
  Wrench, Package, Gauge, Bug, RotateCcw, UserX, Rocket, CalendarClock,
  Activity, Settings, XCircle, Timer,
} from "lucide-react";

type Severity = "critical" | "high" | "medium" | "low";
type AlertType = "material_shortage" | "station_over_capacity" | "delayed_work_order" | "machine_breakdown"
  | "quality_failure" | "high_scrap_rate" | "repeated_rework" | "operator_no_progress"
  | "urgent_project_not_released" | "expected_finish_date_slip";

interface PAlert {
  id: string; type: AlertType; severity: Severity; title: string; description: string;
  station?: string; wo?: string; time: string; resolved: boolean; action: string;
}

const sevCfg: Record<Severity, { label: string; cls: string; icon: typeof AlertTriangle }> = {
  critical: { label: "קריטי", cls: "bg-red-500/20 text-red-300 border-red-500/40", icon: AlertOctagon },
  high: { label: "גבוה", cls: "bg-orange-500/20 text-orange-300 border-orange-500/40", icon: AlertTriangle },
  medium: { label: "בינוני", cls: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40", icon: ShieldAlert },
  low: { label: "נמוך", cls: "bg-blue-500/20 text-blue-300 border-blue-500/40", icon: Bell },
};

const typeLabel: Record<AlertType, string> = {
  material_shortage: "מחסור חומר", station_over_capacity: "עומס יתר בתחנה",
  delayed_work_order: "הזמנה באיחור", machine_breakdown: "תקלת מכונה",
  quality_failure: "כשל איכות", high_scrap_rate: "פסולת גבוהה",
  repeated_rework: "עיבוד חוזר חוזר", operator_no_progress: "מפעיל ללא התקדמות",
  urgent_project_not_released: "פרויקט דחוף לא שוחרר", expected_finish_date_slip: "החלקת תאריך סיום",
};
const typeIcon: Record<AlertType, typeof Bell> = {
  material_shortage: Package, station_over_capacity: Gauge, delayed_work_order: Clock,
  machine_breakdown: Wrench, quality_failure: Bug, high_scrap_rate: XCircle,
  repeated_rework: RotateCcw, operator_no_progress: UserX,
  urgent_project_not_released: Rocket, expected_finish_date_slip: CalendarClock,
};

const FALLBACK_ALERTS: PAlert[] = [
  { id: "ALR-001", type: "machine_breakdown", severity: "critical", title: "תקלת מכונה CNC-03",
    description: "ציר Z נתקע - עצירה מלאה. טכנאי בדרך, ETA 45 דק'.", station: "CNC-03", wo: "WO-4010", time: "08:12", resolved: false, action: "שלח טכנאי חירום" },
  { id: "ALR-002", type: "material_shortage", severity: "critical", title: "מחסור פלדה 304L",
    description: "מלאי מספיק ל-2 שעות בלבד. הזמנת חירום נדרשת.", station: "מחסן-01", wo: "WO-4011", time: "07:45", resolved: false, action: "הזמנת חירום מספק" },
  { id: "ALR-003", type: "quality_failure", severity: "critical", title: "כשל בדיקת איכות - מארז T-200",
    description: "3 יחידות נכשלו בבדיקה סופית. סדקים פני שטח.", station: "QC-01", wo: "WO-4012", time: "09:30", resolved: false, action: "עצור קו + בדיקת שורש" },
  { id: "ALR-004", type: "station_over_capacity", severity: "high", title: "עומס יתר תחנת ריתוך-02",
    description: "ניצולת 118% - 6 הזמנות בתור. זמן המתנה ממוצע 3.2 שעות.", station: "ריתוך-02", time: "08:55", resolved: false, action: "העבר הזמנות לריתוך-03" },
  { id: "ALR-005", type: "delayed_work_order", severity: "high", title: "הזמנה WO-4015 באיחור של 2 ימים",
    description: "חיישן לחץ PS-90 - עיכוב בשלב הרכבה. לקוח דורש עדכון.", station: "הרכבה-04", wo: "WO-4015", time: "07:30", resolved: false, action: "עדכן לקוח + האץ ייצור" },
  { id: "ALR-006", type: "high_scrap_rate", severity: "high", title: "פסולת 8.2% בתחנת חיתוך",
    description: "חריגה מ-3% נורמה. בעיית כיול בלייזר.", station: "חיתוך-01", wo: "WO-4018", time: "10:15", resolved: false, action: "כיול מיידי + בדיקת חומר" },
  { id: "ALR-007", type: "repeated_rework", severity: "medium", title: "עיבוד חוזר חוזר - לוח PCB-8L",
    description: "3 סבבי עיבוד חוזר על אותו פריט. חשד לבעיה מערכתית.", station: "SMT-01", wo: "WO-4014", time: "11:00", resolved: false, action: "ניתוח שורש בעיה + עצירת ייצור" },
  { id: "ALR-008", type: "operator_no_progress", severity: "medium", title: "מפעיל ללא התקדמות - הרכבה-02",
    description: "אין דיווח התקדמות מאז 06:30. משמרת בוקר.", station: "הרכבה-02", time: "09:45", resolved: false, action: "בדוק מול ראש משמרת" },
  { id: "ALR-009", type: "urgent_project_not_released", severity: "high", title: "פרויקט דחוף PRJ-220 לא שוחרר",
    description: "מועד אספקה בעוד 5 ימים, הוראות עבודה טרם אושרו.", wo: "PRJ-220", time: "08:00", resolved: false, action: "אשר הוראות + שחרר לייצור" },
  { id: "ALR-010", type: "expected_finish_date_slip", severity: "medium", title: "החלקת סיום WO-4020 ב-3 ימים",
    description: "צפי סיום נדחה מ-10/04 ל-13/04 בגלל עיכוב חומרים.", wo: "WO-4020", time: "10:30", resolved: false, action: "עדכן לו\"ז + הודע ללקוח" },
  { id: "ALR-011", type: "material_shortage", severity: "medium", title: "מלאי נמוך - רכיב IC-55",
    description: "נותרו 120 יחידות, צריכה יומית 80. מספיק ל-1.5 ימים.", station: "מחסן-01", wo: "WO-4013", time: "11:20", resolved: false, action: "הזמן מספק משני" },
  { id: "ALR-012", type: "machine_breakdown", severity: "low", title: "התראת תחזוקה - משאבה הידראולית",
    description: "רטט חריג במשאבה. עדיין פעילה, דורשת בדיקה בסיום משמרת.", station: "CNC-05", time: "12:00", resolved: false, action: "תזמן בדיקה סוף משמרת" },
];

const FALLBACK_RESOLVED: PAlert[] = [
  { id: "ALR-R01", type: "machine_breakdown", severity: "critical", title: "תקלת מנוע תחנת שיוף-01",
    description: "מנוע ראשי כבה. הוחלף תוך 90 דקות.", station: "שיוף-01", time: "06:30", resolved: true, action: "הוחלף מנוע" },
  { id: "ALR-R02", type: "quality_failure", severity: "high", title: "סטייה מימדית בציר SH-40",
    description: "סטייה 0.15 מ\"מ. כיול מחדש של מכונה.", station: "עיבוד-01", wo: "WO-4009", time: "07:00", resolved: true, action: "כויל מחדש" },
  { id: "ALR-R03", type: "delayed_work_order", severity: "medium", title: "WO-4008 הושלמה באיחור קל",
    description: "איחור של 4 שעות - הושלם. לקוח עודכן.", wo: "WO-4008", time: "14:00", resolved: true, action: "סגור + עדכן" },
];

const FALLBACK_RULES = [
  { name: "מחסור חומר", condition: "מלאי < צריכה של 2 ימים", severity: "critical" as Severity, active: true },
  { name: "עומס תחנה", condition: "ניצולת > 100%", severity: "high" as Severity, active: true },
  { name: "איחור הזמנה", condition: "חריגה > 24 שעות מלו\"ז", severity: "high" as Severity, active: true },
  { name: "תקלת מכונה", condition: "סטטוס מכונה = DOWN", severity: "critical" as Severity, active: true },
  { name: "כשל איכות", condition: "תוצאת QC = נכשל", severity: "critical" as Severity, active: true },
  { name: "פסולת גבוהה", condition: "אחוז פסולת > 5%", severity: "high" as Severity, active: true },
  { name: "עיבוד חוזר חוזר", condition: "סבבי rework >= 3", severity: "medium" as Severity, active: true },
  { name: "מפעיל ללא התקדמות", condition: "אין דיווח > 2 שעות", severity: "medium" as Severity, active: true },
  { name: "פרויקט דחוף לא שוחרר", condition: "אספקה < 7 ימים + לא שוחרר", severity: "high" as Severity, active: true },
  { name: "החלקת תאריך סיום", condition: "צפי סיום > מתוכנן + 2 ימים", severity: "medium" as Severity, active: false },
];

/* KPIs are computed inside the component */

function AlertCard({ alert }: { alert: PAlert }) {
  const sev = sevCfg[alert.severity];
  const TIcon = typeIcon[alert.type];
  const SIcon = sev.icon;
  return (
    <Card className={`border ${alert.severity === "critical" ? "border-red-500/60 bg-red-950/20" : alert.severity === "high" ? "border-orange-500/40 bg-orange-950/10" : "border-border"}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`p-1.5 rounded ${sev.cls}`}><TIcon className="h-4 w-4" /></div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{alert.title}</p>
              <p className="text-xs text-muted-foreground">{alert.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge className={`${sev.cls} text-[10px] px-1.5`}><SIcon className="h-3 w-3 mr-1" />{sev.label}</Badge>
            <Badge variant="outline" className="text-[10px] px-1.5">{typeLabel[alert.type]}</Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{alert.description}</p>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          {alert.station && <span className="flex items-center gap-1"><Gauge className="h-3 w-3" />{alert.station}</span>}
          {alert.wo && <span className="flex items-center gap-1"><Activity className="h-3 w-3" />{alert.wo}</span>}
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{alert.time}</span>
        </div>
        <div className={`text-xs font-medium px-2 py-1 rounded ${alert.resolved ? "bg-green-500/15 text-green-400" : "bg-amber-500/15 text-amber-400"}`}>
          {alert.resolved ? "נפתר" : "פעולה נדרשת"}: {alert.action}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProductionAlerts() {
  const [tab, setTab] = useState("active");

  const { data: apiData } = useQuery({
    queryKey: ["production-alerts"],
    queryFn: () => authFetch("/api/production/quality?type=alerts").then(r => r.json()),
  });
  const safeArr = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
  const alerts: PAlert[] = safeArr(apiData?.alerts).length > 0 ? safeArr(apiData.alerts) : FALLBACK_ALERTS;
  const resolvedAlerts: PAlert[] = safeArr(apiData?.resolved).length > 0 ? safeArr(apiData.resolved) : FALLBACK_RESOLVED;
  const rules = safeArr(apiData?.rules).length > 0 ? safeArr(apiData.rules) : FALLBACK_RULES;

  const activeAlerts = alerts.filter((a: any) => !a.resolved);
  const criticalCount = activeAlerts.filter((a: any) => a.severity === "critical").length;
  const highCount = activeAlerts.filter((a: any) => a.severity === "high").length;
  const mediumCount = activeAlerts.filter((a: any) => a.severity === "medium").length;

  const kpis = [
    { label: "התראות פעילות", value: activeAlerts.length, icon: Bell, color: "text-red-400", bg: "bg-red-500" },
    { label: "קריטיות", value: criticalCount, icon: AlertOctagon, color: "text-red-400", bg: "bg-red-500" },
    { label: "גבוהות", value: highCount, icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-500" },
    { label: "בינוניות", value: mediumCount, icon: ShieldAlert, color: "text-yellow-400", bg: "bg-yellow-500" },
    { label: "נפתרו היום", value: resolvedAlerts.length, icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500" },
    { label: "זמן פתרון ממוצע", value: "47 דק'", icon: Timer, color: "text-cyan-400", bg: "bg-cyan-500" },
  ];

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <Bell className="h-7 w-7 text-red-400" />
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 animate-ping" />
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">התראות ייצור</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי | ניטור התראות בזמן אמת</p>
        </div>
        <Badge className="bg-red-500/20 text-red-300 mr-auto text-sm">{activeAlerts.length} פעילות</Badge>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map(k => {
          const I = k.icon;
          return (
            <Card key={k.label}>
              <CardContent className="p-4 text-center space-y-1">
                <I className={`h-5 w-5 mx-auto ${k.color}`} />
                <p className="text-2xl font-bold">{k.value}</p>
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <Progress value={typeof k.value === "number" ? Math.min((k.value / activeAlerts.length) * 100, 100) : 75} className={`h-1 ${k.bg}`} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Severity Distribution + Recent Timeline */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-400" />התפלגות חומרה</p>
            {(["critical", "high", "medium", "low"] as Severity[]).map(s => {
              const count = activeAlerts.filter(a => a.severity === s).length;
              const pctVal = activeAlerts.length ? (count / activeAlerts.length) * 100 : 0;
              return (
                <div key={s} className="flex items-center gap-3">
                  <Badge className={`${sevCfg[s].cls} text-[10px] w-14 justify-center`}>{sevCfg[s].label}</Badge>
                  <Progress value={pctVal} className={`h-2 flex-1 ${s === "critical" ? "bg-red-500" : s === "high" ? "bg-orange-500" : s === "medium" ? "bg-yellow-500" : "bg-blue-500"}`} />
                  <span className="text-xs text-muted-foreground w-12 text-left">{count} ({pctVal.toFixed(0)}%)</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-semibold flex items-center gap-2"><Clock className="h-4 w-4 text-cyan-400" />ציר זמן אחרון</p>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {[...alerts].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 6).map(a => (
                <div key={a.id} className="flex items-center gap-2 text-xs border-b border-border/40 pb-1.5">
                  <span className="text-muted-foreground w-10 shrink-0">{a.time}</span>
                  <span className={`h-2 w-2 rounded-full shrink-0 ${a.severity === "critical" ? "bg-red-500" : a.severity === "high" ? "bg-orange-500" : a.severity === "medium" ? "bg-yellow-500" : "bg-blue-500"}`} />
                  <span className="truncate">{a.title}</span>
                  <Badge className={`${sevCfg[a.severity].cls} text-[9px] px-1 shrink-0`}>{sevCfg[a.severity].label}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="active" className="gap-1"><Bell className="h-3.5 w-3.5" />פעילות ({activeAlerts.length})</TabsTrigger>
          <TabsTrigger value="critical" className="gap-1"><AlertOctagon className="h-3.5 w-3.5" />קריטיות ({criticalCount})</TabsTrigger>
          <TabsTrigger value="history" className="gap-1"><CheckCircle2 className="h-3.5 w-3.5" />היסטוריה</TabsTrigger>
          <TabsTrigger value="rules" className="gap-1"><Settings className="h-3.5 w-3.5" />כללים</TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {activeAlerts.map(a => <AlertCard key={a.id} alert={a} />)}
          </div>
        </TabsContent>

        <TabsContent value="critical">
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {activeAlerts.filter(a => a.severity === "critical").map(a => <AlertCard key={a.id} alert={a} />)}
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-400" />
            <span className="text-sm text-muted-foreground">סה"כ נפתרו היום: {resolvedAlerts.length} | זמן פתרון ממוצע: 47 דק'</span>
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {resolvedAlerts.map(a => <AlertCard key={a.id} alert={a} />)}
          </div>
        </TabsContent>

        <TabsContent value="rules">
          <div className="mb-3 grid grid-cols-2 md:grid-cols-5 gap-2">
            {Object.entries(
              activeAlerts.reduce((acc, a) => { acc[a.type] = (acc[a.type] || 0) + 1; return acc; }, {} as Record<string, number>)
            ).map(([t, c]) => (
              <div key={t} className="flex items-center gap-1.5 text-xs bg-muted/30 rounded px-2 py-1.5">
                {(() => { const I = typeIcon[t as AlertType]; return <I className="h-3 w-3 text-muted-foreground" />; })()}
                <span className="text-muted-foreground">{typeLabel[t as AlertType]}</span>
                <Badge variant="outline" className="text-[9px] mr-auto">{c}</Badge>
              </div>
            ))}
          </div>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/30">
                  <th className="p-3 text-right font-medium text-xs text-muted-foreground">שם כלל</th>
                  <th className="p-3 text-right font-medium text-xs text-muted-foreground">תנאי הפעלה</th>
                  <th className="p-3 text-right font-medium text-xs text-muted-foreground">חומרה</th>
                  <th className="p-3 text-right font-medium text-xs text-muted-foreground">סטטוס</th>
                </tr></thead>
                <tbody>
                  {rules.map((r, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-3 font-medium">{r.name}</td>
                      <td className="p-3 text-muted-foreground">{r.condition}</td>
                      <td className="p-3"><Badge className={`${sevCfg[r.severity].cls} text-[10px]`}>{sevCfg[r.severity].label}</Badge></td>
                      <td className="p-3"><Badge className={r.active ? "bg-green-500/20 text-green-300" : "bg-gray-500/20 text-gray-400"}>{r.active ? "פעיל" : "מושבת"}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}