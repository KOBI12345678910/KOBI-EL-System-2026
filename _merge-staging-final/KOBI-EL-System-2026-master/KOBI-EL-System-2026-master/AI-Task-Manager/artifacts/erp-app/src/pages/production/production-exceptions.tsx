import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  AlertOctagon, AlertTriangle, ShieldAlert, Clock, CheckCircle2,
  Wrench, Package, Bug, Ruler, Timer, UserX, Zap,
  Activity, Gauge, DollarSign, TrendingDown, BarChart3,
} from "lucide-react";

type Severity = "critical" | "high" | "medium" | "low";
type ExType = "material_shortage" | "machine_breakdown" | "quality_failure"
  | "wrong_dimensions" | "delay_event" | "operator_issue" | "urgent_priority_override";

interface Exception {
  id: string; type: ExType; severity: Severity; title: string; description: string;
  station: string; wo: string; reportedBy: string; time: string; impact: string;
  resolutionStatus: "open" | "in_progress" | "resolved"; costImpact: number;
  lossHours: number;
}

const sevCfg: Record<Severity, { label: string; cls: string; icon: typeof AlertTriangle }> = {
  critical: { label: "קריטי", cls: "bg-red-500/20 text-red-300 border-red-500/40", icon: AlertOctagon },
  high: { label: "גבוה", cls: "bg-orange-500/20 text-orange-300 border-orange-500/40", icon: AlertTriangle },
  medium: { label: "בינוני", cls: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40", icon: ShieldAlert },
  low: { label: "נמוך", cls: "bg-blue-500/20 text-blue-300 border-blue-500/40", icon: ShieldAlert },
};

const typeLabel: Record<ExType, string> = {
  material_shortage: "מחסור חומר", machine_breakdown: "תקלת מכונה", quality_failure: "כשל איכות",
  wrong_dimensions: "מידות שגויות", delay_event: "אירוע עיכוב", operator_issue: "בעיית מפעיל",
  urgent_priority_override: "דריסת עדיפות דחופה",
};
const typeIcon: Record<ExType, typeof AlertTriangle> = {
  material_shortage: Package, machine_breakdown: Wrench, quality_failure: Bug,
  wrong_dimensions: Ruler, delay_event: Timer, operator_issue: UserX,
  urgent_priority_override: Zap,
};

const statusLabel: Record<string, { text: string; cls: string }> = {
  open: { text: "פתוח", cls: "bg-red-500/15 text-red-400" },
  in_progress: { text: "בטיפול", cls: "bg-amber-500/15 text-amber-400" },
  resolved: { text: "נפתר", cls: "bg-green-500/15 text-green-400" },
};

const FALLBACK_EXCEPTIONS: Exception[] = [
  { id: "EXC-001", type: "material_shortage", severity: "critical", title: "מחסור פלדה 304L - עצירת קו",
    description: "מלאי מספיק לשעה אחת בלבד. ספק ראשי עדכן על עיכוב של 48 שעות.", station: "מחסן-01", wo: "WO-4010",
    reportedBy: "יוסי כהן", time: "07:15", impact: "עצירת 2 קווי ייצור", resolutionStatus: "open", costImpact: 18500, lossHours: 6.0 },
  { id: "EXC-002", type: "machine_breakdown", severity: "critical", title: "תקלת CNC-03 - ציר Z נתקע",
    description: "הצטברות שבבים גרמה לנעילת ציר Z. חלק חלופי בדרך מחיפה.", station: "CNC-03", wo: "WO-4011",
    reportedBy: "דוד מזרחי", time: "08:22", impact: "עצירה מלאה של תחנה", resolutionStatus: "in_progress", costImpact: 12300, lossHours: 4.5 },
  { id: "EXC-003", type: "quality_failure", severity: "critical", title: "כשל בדיקת לחץ - חיישן PS-90",
    description: "5 מתוך 20 יחידות במדגם נכשלו בבדיקת לחץ 150 בר. חשד לאצווה פגומה.", station: "QC-01", wo: "WO-4012",
    reportedBy: "מיכל ברק", time: "09:40", impact: "עצירת שחרור אצווה 2240", resolutionStatus: "open", costImpact: 22000, lossHours: 3.0 },
  { id: "EXC-004", type: "wrong_dimensions", severity: "high", title: "סטייה מימדית 0.3 מ\"מ - ציר SH-40",
    description: "סטייה מעבר לטולרנס של ±0.1 מ\"מ. 12 יחידות פסולות מתוך 50.", station: "עיבוד-01", wo: "WO-4013",
    reportedBy: "אלון גולדשטיין", time: "10:05", impact: "24% פסולת באצווה", resolutionStatus: "in_progress", costImpact: 8700, lossHours: 2.0 },
  { id: "EXC-005", type: "delay_event", severity: "high", title: "עיכוב אספקת אלומיניום 6061",
    description: "ספק עדכן על עיכוב של 3 ימי עבודה. משפיע על 4 הזמנות עבודה.", station: "מחסן-02", wo: "WO-4014",
    reportedBy: "שרה לוי", time: "07:50", impact: "דחיית 4 הזמנות ב-3 ימים", resolutionStatus: "open", costImpact: 15200, lossHours: 0 },
  { id: "EXC-006", type: "operator_issue", severity: "medium", title: "מפעיל לא מוסמך הופעל על ריתוך TIG",
    description: "נמצא שמפעיל ללא הסמכה תקפה הפעיל תחנת ריתוך. עצירה מיידית.", station: "ריתוך-02", wo: "WO-4015",
    reportedBy: "רחל אברהם", time: "11:30", impact: "חשד לריתוכים לא תקינים ב-8 יח'", resolutionStatus: "in_progress", costImpact: 5400, lossHours: 1.5 },
  { id: "EXC-007", type: "urgent_priority_override", severity: "critical", title: "דריסת עדיפות - הזמנת ביטחון PRJ-220",
    description: "הזמנת ביטחון דחופה קודמה ל-WO-4016. הקפיצה גורמת לדחיית 3 הזמנות.", station: "הרכבה-04", wo: "WO-4016",
    reportedBy: "עומר חדד", time: "08:00", impact: "דחיית 3 הזמנות ב-2 ימים", resolutionStatus: "open", costImpact: 9800, lossHours: 0 },
  { id: "EXC-008", type: "machine_breakdown", severity: "high", title: "דליפת שמן הידראולי - פרסה 200T",
    description: "דליפה איטית זוהתה. מכונה עובדת ב-60% הספק עד לתיקון.", station: "עיבוד-03", wo: "WO-4017",
    reportedBy: "נועה פרידמן", time: "09:10", impact: "הפחתת 40% תפוקה בתחנה", resolutionStatus: "in_progress", costImpact: 6100, lossHours: 3.0 },
  { id: "EXC-009", type: "quality_failure", severity: "medium", title: "גימור צבע לא אחיד - פנל FP-15",
    description: "לחות גבוהה בתא ריסוס גרמה לכתמים ב-15 יחידות.", station: "צביעה-02", wo: "WO-4018",
    reportedBy: "יוסי כהן", time: "13:20", impact: "עיבוד חוזר ל-15 יח'", resolutionStatus: "open", costImpact: 3200, lossHours: 2.5 },
  { id: "EXC-010", type: "wrong_dimensions", severity: "low", title: "סטייה קלה בחיתוך - צינור DN50",
    description: "סטייה של 0.05 מ\"מ, בתוך טולרנס מורחב. דורש אישור מהנדס.", station: "חיתוך-01", wo: "WO-4019",
    reportedBy: "דוד מזרחי", time: "14:00", impact: "ממתין לאישור חריגה", resolutionStatus: "in_progress", costImpact: 800, lossHours: 0.5 },
  { id: "EXC-011", type: "delay_event", severity: "medium", title: "איחור כניסת משמרת לילה - 3 מפעילים",
    description: "3 מפעילים לא הגיעו למשמרת. חלופות מגויסות.", station: "הרכבה-02", wo: "WO-4020",
    reportedBy: "שרה לוי", time: "22:15", impact: "50% כוח אדם בהרכבה", resolutionStatus: "resolved", costImpact: 4100, lossHours: 3.0 },
  { id: "EXC-012", type: "material_shortage", severity: "high", title: "מחסור רכיב IC-55 - 120 יח' נותרו",
    description: "צריכה יומית 80 יח'. מלאי מספיק ל-1.5 ימים. הזמנת חירום בוצעה.", station: "מחסן-01", wo: "WO-4021",
    reportedBy: "רחל אברהם", time: "10:45", impact: "סיכון עצירה תוך 36 שעות", resolutionStatus: "resolved", costImpact: 2400, lossHours: 0 },
];

/* KPIs computed inside component */

function ExceptionCard({ ex }: { ex: Exception }) {
  const sev = sevCfg[ex.severity];
  const TIcon = typeIcon[ex.type];
  const st = statusLabel[ex.resolutionStatus];
  return (
    <Card className={`border ${ex.severity === "critical" ? "border-red-500/60 bg-red-950/20" : ex.severity === "high" ? "border-orange-500/40 bg-orange-950/10" : "border-border"}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`p-1.5 rounded ${sev.cls}`}><TIcon className="h-4 w-4" /></div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{ex.title}</p>
              <p className="text-xs text-muted-foreground">{ex.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge className={`${sev.cls} text-[10px] px-1.5`}>{sev.label}</Badge>
            <Badge variant="outline" className="text-[10px] px-1.5">{typeLabel[ex.type]}</Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{ex.description}</p>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1"><Gauge className="h-3 w-3" />{ex.station}</span>
          <span className="flex items-center gap-1"><Activity className="h-3 w-3" />{ex.wo}</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{ex.time}</span>
          <span className="flex items-center gap-1"><UserX className="h-3 w-3" />{ex.reportedBy}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-orange-400 flex items-center gap-1"><TrendingDown className="h-3 w-3" />{ex.impact}</span>
          {ex.costImpact > 0 && <span className="text-yellow-400 mr-auto">₪{ex.costImpact.toLocaleString("he-IL")}</span>}
        </div>
        <div className={`text-xs font-medium px-2 py-1 rounded ${st.cls}`}>{st.text}</div>
      </CardContent>
    </Card>
  );
}

export default function ProductionExceptions() {
  const [tab, setTab] = useState("active");

  const { data: apiData } = useQuery({
    queryKey: ["production-exceptions"],
    queryFn: () => authFetch("/api/production/quality?type=exceptions").then(r => r.json()),
  });
  const safeArr = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
  const exceptions: Exception[] = safeArr(apiData).length > 0 ? safeArr(apiData) : FALLBACK_EXCEPTIONS;

  const openExceptions = exceptions.filter((e: any) => e.resolutionStatus !== "resolved");
  const criticalCount = openExceptions.filter((e: any) => e.severity === "critical").length;
  const resolvedToday = exceptions.filter((e: any) => e.resolutionStatus === "resolved").length;
  const totalLoss = exceptions.reduce((s: number, e: any) => s + e.lossHours, 0);
  const totalCost = exceptions.reduce((s: number, e: any) => s + e.costImpact, 0);
  const kpis = [
    { label: "חריגות פתוחות", value: openExceptions.length, icon: AlertOctagon, color: "text-red-400", bg: "bg-red-500" },
    { label: "קריטיות", value: criticalCount, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500" },
    { label: "נפתרו היום", value: resolvedToday, icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500" },
    { label: "זמן פתרון ממוצע", value: "52 דק'", icon: Clock, color: "text-cyan-400", bg: "bg-cyan-500" },
    { label: "שעות אובדן ייצור", value: totalLoss.toFixed(1), icon: TrendingDown, color: "text-orange-400", bg: "bg-orange-500" },
    { label: "השפעת עלות ₪", value: "₪" + totalCost.toLocaleString("he-IL"), icon: DollarSign, color: "text-yellow-400", bg: "bg-yellow-500" },
  ];
  const stations = [...new Set(exceptions.map((e: any) => e.station))];

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="relative">
          <AlertOctagon className="h-7 w-7 text-red-400" />
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 animate-ping" />
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">חריגות ייצור</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי | ניהול ומעקב חריגות בזמן אמת</p>
        </div>
        <Badge className="bg-red-500/20 text-red-300 mr-auto text-sm">{openExceptions.length} פתוחות</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map(k => {
          const I = k.icon;
          return (
            <Card key={k.label}>
              <CardContent className="p-4 text-center space-y-1">
                <I className={`h-5 w-5 mx-auto ${k.color}`} />
                <p className="text-2xl font-bold">{k.value}</p>
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <Progress value={typeof k.value === "number" ? Math.min((k.value / Math.max(openExceptions.length, 1)) * 100, 100) : 65} className={`h-1 ${k.bg}`} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-400" />התפלגות חומרה</p>
            {(["critical", "high", "medium", "low"] as Severity[]).map(s => {
              const count = openExceptions.filter(e => e.severity === s).length;
              const pct = openExceptions.length ? (count / openExceptions.length) * 100 : 0;
              return (
                <div key={s} className="flex items-center gap-3">
                  <Badge className={`${sevCfg[s].cls} text-[10px] w-14 justify-center`}>{sevCfg[s].label}</Badge>
                  <Progress value={pct} className={`h-2 flex-1 ${s === "critical" ? "bg-red-500" : s === "high" ? "bg-orange-500" : s === "medium" ? "bg-yellow-500" : "bg-blue-500"}`} />
                  <span className="text-xs text-muted-foreground w-12 text-left">{count} ({pct.toFixed(0)}%)</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-semibold flex items-center gap-2"><Clock className="h-4 w-4 text-cyan-400" />ציר זמן אחרון</p>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {[...exceptions].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 6).map(e => (
                <div key={e.id} className="flex items-center gap-2 text-xs border-b border-border/40 pb-1.5">
                  <span className="text-muted-foreground w-10 shrink-0">{e.time}</span>
                  <span className={`h-2 w-2 rounded-full shrink-0 ${e.severity === "critical" ? "bg-red-500" : e.severity === "high" ? "bg-orange-500" : e.severity === "medium" ? "bg-yellow-500" : "bg-blue-500"}`} />
                  <span className="truncate">{e.title}</span>
                  <Badge className={`${sevCfg[e.severity].cls} text-[9px] px-1 shrink-0`}>{sevCfg[e.severity].label}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="active" className="gap-1"><AlertOctagon className="h-3.5 w-3.5" />פעילות ({openExceptions.length})</TabsTrigger>
          <TabsTrigger value="types" className="gap-1"><BarChart3 className="h-3.5 w-3.5" />סוגים</TabsTrigger>
          <TabsTrigger value="stations" className="gap-1"><Gauge className="h-3.5 w-3.5" />תחנות</TabsTrigger>
          <TabsTrigger value="history" className="gap-1"><CheckCircle2 className="h-3.5 w-3.5" />היסטוריה</TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {openExceptions.map(e => <ExceptionCard key={e.id} ex={e} />)}
          </div>
        </TabsContent>

        <TabsContent value="types">
          <div className="space-y-4">
            {(Object.keys(typeLabel) as ExType[]).map(t => {
              const items = exceptions.filter(e => e.type === t);
              if (!items.length) return null;
              const TI = typeIcon[t];
              const openCount = items.filter(e => e.resolutionStatus !== "resolved").length;
              return (
                <Card key={t}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TI className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold text-sm">{typeLabel[t]}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{items.length} סה"כ</Badge>
                        {openCount > 0 && <Badge className="bg-red-500/20 text-red-300 text-[10px]">{openCount} פתוחות</Badge>}
                      </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-2">
                      {items.map(e => (
                        <div key={e.id} className="flex items-center gap-2 text-xs bg-muted/20 rounded p-2">
                          <span className={`h-2 w-2 rounded-full shrink-0 ${e.severity === "critical" ? "bg-red-500" : e.severity === "high" ? "bg-orange-500" : e.severity === "medium" ? "bg-yellow-500" : "bg-blue-500"}`} />
                          <span className="truncate flex-1">{e.title}</span>
                          <Badge className={`${statusLabel[e.resolutionStatus].cls} text-[9px] px-1`}>{statusLabel[e.resolutionStatus].text}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="stations">
          <div className="space-y-3">
            {stations.map(st => {
              const items = exceptions.filter(e => e.station === st);
              const openCount = items.filter(e => e.resolutionStatus !== "resolved").length;
              const stCost = items.reduce((s, e) => s + e.costImpact, 0);
              return (
                <Card key={st}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm flex items-center gap-2"><Gauge className="h-4 w-4 text-blue-400" />{st}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{items.length} חריגות</Badge>
                        {openCount > 0 && <Badge className="bg-red-500/20 text-red-300 text-[10px]">{openCount} פתוחות</Badge>}
                        <Badge className="bg-yellow-500/15 text-yellow-400 text-[10px]">₪{stCost.toLocaleString("he-IL")}</Badge>
                      </div>
                    </div>
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-border/40">
                        <th className="py-1.5 text-right text-muted-foreground font-medium">מזהה</th>
                        <th className="py-1.5 text-right text-muted-foreground font-medium">סוג</th>
                        <th className="py-1.5 text-right text-muted-foreground font-medium">חומרה</th>
                        <th className="py-1.5 text-right text-muted-foreground font-medium">סטטוס</th>
                        <th className="py-1.5 text-right text-muted-foreground font-medium">עלות</th>
                      </tr></thead>
                      <tbody>
                        {items.map(e => (
                          <tr key={e.id} className="border-b border-border/20 last:border-0">
                            <td className="py-1.5 font-medium">{e.id}</td>
                            <td className="py-1.5">{typeLabel[e.type]}</td>
                            <td className="py-1.5"><Badge className={`${sevCfg[e.severity].cls} text-[9px] px-1`}>{sevCfg[e.severity].label}</Badge></td>
                            <td className="py-1.5"><Badge className={`${statusLabel[e.resolutionStatus].cls} text-[9px] px-1`}>{statusLabel[e.resolutionStatus].text}</Badge></td>
                            <td className="py-1.5 text-yellow-400">₪{e.costImpact.toLocaleString("he-IL")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-400" />
            <span className="text-sm text-muted-foreground">סה"כ נפתרו היום: {resolvedToday} | זמן פתרון ממוצע: 52 דק'</span>
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {exceptions.filter(e => e.resolutionStatus === "resolved").map(e => <ExceptionCard key={e.id} ex={e} />)}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
