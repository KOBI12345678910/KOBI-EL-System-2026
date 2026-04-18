import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle, Clock, DollarSign, ShieldAlert, CheckCircle2,
  ArrowRight, FileWarning, Ruler, PackageX, Ban, CloudRain,
  Wrench, Users, CalendarClock, TrendingUp, BarChart3, Activity
} from "lucide-react";

const FALLBACK_EXCEPTIONS = [
  { id: "EXC-001", insId: "INS-001", project: "מגדלי הים — חיפה", type: "סטיית מידות", severity: "גבוה", description: "פתח חלון קטן ב-3 ס\"מ מהתוכנית — קומה 7 צפון", responsible: "יוסי כהן", resolution: "חיתוך מחדש של מסגרת מותאמת", status: "בטיפול", cost: 2200 },
  { id: "EXC-002", insId: "INS-002", project: "פארק המדע — רחובות", type: "חומר לא תקין", severity: "קריטי", description: "זכוכית שכבתית הגיעה עם שריטות פנימיות — אצווה 4B", responsible: "שרה לוי", resolution: "החלפה מלאה — הזמנה דחופה מספק", status: "פתוח", cost: 4800 },
  { id: "EXC-003", insId: "INS-005", project: "קניון הדרום — באר שבע", type: "בעיית גישה", severity: "בינוני", description: "מעבר לכניסת משאית חסום ע\"י פיגומים קבלן שכן", responsible: "מיכל ברק", resolution: "תיאום פינוי פיגומים עד 10/04", status: "בטיפול", cost: 500 },
  { id: "EXC-004", insId: "INS-007", project: "בניין מגורים — נתניה", type: "בעיית בטיחות", severity: "קריטי", description: "חיווט חשמלי חשוף בתוך חלל קיר — סכנת התחשמלות", responsible: "רחל אברהם", resolution: "עצירת עבודה עד תיקון חשמלאי מוסמך", status: "פתוח", cost: 1200 },
  { id: "EXC-005", insId: "INS-004", project: "מלון ים התיכון", type: "שינוי לקוח", severity: "גבוה", description: "לקוח דורש שינוי מעקה מזכוכית שקופה לחלבית — קומה 12", responsible: "דוד מזרחי", resolution: "הזמנת זכוכית חלבית + עדכון תוכנית", status: "ממתין לאישור", cost: 3500 },
  { id: "EXC-006", insId: "INS-001", project: "מגדלי הים — חיפה", type: "מזג אוויר", severity: "בינוני", description: "רוחות חזקות צפויות — לא ניתן להרכיב בגובה מעל קומה 10", responsible: "יוסי כהן", resolution: "דחיית הרכבת קומות עליונות ליום שקט", status: "בטיפול", cost: 0 },
  { id: "EXC-007", insId: "INS-005", project: "קניון הדרום — באר שבע", type: "ציוד תקול", severity: "גבוה", description: "מכשיר קידוח SDS-Max תקול — לא ניתן לקדוח בבטון מזוין", responsible: "אורי דהן", resolution: "שליחת ציוד חלופי מהמחסן המרכזי", status: "נסגר", cost: 800 },
  { id: "EXC-008", insId: "INS-006", project: "משרדי הייטק — הרצליה פיתוח", type: "סטיית מידות", severity: "נמוך", description: "הפרש 5 מ\"מ במשקוף דלת — בטווח סובלנות מורחב", responsible: "עומר חדד", resolution: "התאמה במקום עם שים נוסף", status: "נסגר", cost: 150 },
  { id: "EXC-009", insId: "INS-003", project: "בית חכם — הרצליה", type: "כוח אדם", severity: "בינוני", description: "עובד מומחה דלתות חשמליות חולה — אין מחליף זמין", responsible: "איתן רוזנברג", resolution: "העברת עובד מצוות אפסילון ליום אחד", status: "נסגר", cost: 350 },
  { id: "EXC-010", insId: "INS-007", project: "בניין מגורים — נתניה", type: "חומר לא תקין", severity: "גבוה", description: "פרופיל אלומיניום מעוקם — 6 יחידות מתוך אצווה 12A", responsible: "רחל אברהם", resolution: "החזרה לספק + בקשת אצווה חדשה", status: "בטיפול", cost: 1800 },
  { id: "EXC-011", insId: "INS-004", project: "מלון ים התיכון", type: "בעיית גישה", severity: "נמוך", description: "מעלית שירות לא פעילה — העלאת חומרים ידנית לקומה 12", responsible: "אלון גולדשטיין", resolution: "תיאום מעלית זמנית עם הנהלת האתר", status: "נסגר", cost: 200 },
  { id: "EXC-012", insId: "INS-002", project: "פארק המדע — רחובות", type: "סטיית מידות", severity: "בינוני", description: "עמוד בטון מרכזי חורג 2 ס\"מ מהתוכנית — חוסם ויטרינה", responsible: "נועה פרידמן", resolution: "עיצוב מחדש של חיבור ויטרינה לעמוד", status: "ממתין לאישור", cost: 1000 },
];

const severityColor: Record<string, string> = {
  "קריטי": "bg-red-500/20 text-red-300",
  "גבוה": "bg-orange-500/20 text-orange-300",
  "בינוני": "bg-amber-500/20 text-amber-300",
  "נמוך": "bg-blue-500/20 text-blue-300",
};

const statusColor: Record<string, string> = {
  "פתוח": "bg-red-500/20 text-red-300",
  "בטיפול": "bg-yellow-500/20 text-yellow-300",
  "ממתין לאישור": "bg-purple-500/20 text-purple-300",
  "נסגר": "bg-emerald-500/20 text-emerald-300",
};

const typeIcon: Record<string, typeof AlertTriangle> = {
  "סטיית מידות": Ruler,
  "חומר לא תקין": PackageX,
  "בעיית גישה": Ban,
  "בעיית בטיחות": ShieldAlert,
  "שינוי לקוח": Users,
  "מזג אוויר": CloudRain,
  "ציוד תקול": Wrench,
  "כוח אדם": Users,
};

const openCount = FALLBACK_EXCEPTIONS.filter(e => e.status === "פתוח").length;
const criticalCount = FALLBACK_EXCEPTIONS.filter(e => e.severity === "קריטי").length;
const inProgressCount = FALLBACK_EXCEPTIONS.filter(e => e.status === "בטיפול").length;
const closedThisMonth = FALLBACK_EXCEPTIONS.filter(e => e.status === "נסגר").length;
const totalCost = FALLBACK_EXCEPTIONS.reduce((sum, e) => sum + e.cost, 0);

const FALLBACK_KPI_DATA = [
  { label: "חריגות פתוחות", value: "8", icon: FileWarning, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "קריטיות", value: String(criticalCount), icon: ShieldAlert, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "בטיפול", value: String(inProgressCount), icon: Clock, color: "text-yellow-400", bg: "bg-yellow-500/10" },
  { label: "נסגרו החודש", value: "12", icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "זמן טיפול ממוצע", value: "4.2", unit: "שעות", icon: CalendarClock, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "עלות חריגות", value: "₪14,500", icon: DollarSign, color: "text-orange-400", bg: "bg-orange-500/10" },
];

const typeCounts = FALLBACK_EXCEPTIONS.reduce<Record<string, number>>((acc, e) => {
  acc[e.type] = (acc[e.type] || 0) + 1;
  return acc;
}, {});

const paretoData = Object.entries(typeCounts)
  .map(([type, count]) => ({ type, count, pct: Math.round((count / FALLBACK_EXCEPTIONS.length) * 100) }))
  .sort((a, b) => b.count - a.count);

const FALLBACK_WORKFLOW_STEPS = [
  { label: "דיווח", icon: FileWarning, desc: "זיהוי ודיווח מהשטח", color: "text-red-400" },
  { label: "הערכה", icon: Activity, desc: "הערכת חומרה והשפעה", color: "text-orange-400" },
  { label: "אישור", icon: CheckCircle2, desc: "אישור תוכנית פתרון", color: "text-amber-400" },
  { label: "ביצוע", icon: Wrench, desc: "ביצוע תיקון / התאמה", color: "text-blue-400" },
  { label: "אימות", icon: ShieldAlert, desc: "אימות תוצאה ובדיקת איכות", color: "text-purple-400" },
  { label: "סגירה", icon: CheckCircle2, desc: "סגירה ותיעוד לקחים", color: "text-emerald-400" },
];

const FALLBACK_IMPACT_DATA = [
  { title: "השפעה על לו\"ז", icon: CalendarClock, color: "text-orange-400", bg: "bg-orange-500/10", metric: "3.5", unit: "ימי עיכוב מצטברים", details: [{ label: "INS-007 בניין מגורים", value: "1.5 ימים" }, { label: "INS-002 פארק המדע", value: "1.0 יום" }, { label: "INS-001 מגדלי הים", value: "0.5 יום" }, { label: "INS-004 מלון ים התיכון", value: "0.5 יום" }] },
  { title: "השפעה על עלות", icon: DollarSign, color: "text-red-400", bg: "bg-red-500/10", metric: "₪16,500", unit: "חריגה מתקציב", details: [{ label: "חומרים פגומים", value: "₪6,600" }, { label: "שינויי לקוח", value: "₪4,500" }, { label: "עבודה נוספת", value: "₪3,200" }, { label: "ציוד ושונות", value: "₪2,200" }] },
  { title: "השפעה על איכות", icon: TrendingUp, color: "text-blue-400", bg: "bg-blue-500/10", metric: "94.2%", unit: "ציון איכות ממוצע", details: [{ label: "התאמה למפרט", value: "96%" }, { label: "גימור ושלמות", value: "93%" }, { label: "בטיחות", value: "91%" }, { label: "שביעות רצון לקוח", value: "97%" }] },
];

export default function FieldExceptions() {
  const { data: exceptions = FALLBACK_EXCEPTIONS } = useQuery({
    queryKey: ["installation-exceptions"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/field-exceptions/exceptions");
      if (!res.ok) return FALLBACK_EXCEPTIONS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_EXCEPTIONS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: kpiData = FALLBACK_KPI_DATA } = useQuery({
    queryKey: ["installation-kpi-data"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/field-exceptions/kpi-data");
      if (!res.ok) return FALLBACK_KPI_DATA;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_KPI_DATA;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: workflowSteps = FALLBACK_WORKFLOW_STEPS } = useQuery({
    queryKey: ["installation-workflow-steps"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/field-exceptions/workflow-steps");
      if (!res.ok) return FALLBACK_WORKFLOW_STEPS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_WORKFLOW_STEPS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: impactData = FALLBACK_IMPACT_DATA } = useQuery({
    queryKey: ["installation-impact-data"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/field-exceptions/impact-data");
      if (!res.ok) return FALLBACK_IMPACT_DATA;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_IMPACT_DATA;
    },
    staleTime: 30_000,
    retry: 1,
  });


  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <AlertTriangle className="h-7 w-7 text-primary" /> חריגות וסטיות בשטח
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          טכנו-כל עוזי — ניהול חריגות | השפעה | תהליך טיפול | ניתוח מגמות
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-6 gap-3">
        {kpiData.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.bg} border-0 shadow-sm`}>
              <CardContent className="pt-3 pb-2 text-center px-2">
                <Icon className={`h-5 w-5 mx-auto ${kpi.color} mb-1`} />
                <p className="text-[10px] text-muted-foreground leading-tight">{kpi.label}</p>
                <p className={`text-2xl font-bold font-mono ${kpi.color}`}>
                  {kpi.value}
                  {kpi.unit && <span className="text-[10px] font-normal mr-1">{kpi.unit}</span>}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Resolution Workflow */}
      <Card className="border-0 shadow-sm bg-muted/20">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" /> תהליך טיפול בחריגות
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3 px-4">
          <div className="flex items-center justify-between gap-1">
            {workflowSteps.map((step, i) => {
              const StepIcon = step.icon;
              return (
                <div key={i} className="flex items-center gap-1 flex-1">
                  <div className="flex flex-col items-center text-center flex-1">
                    <div className={`rounded-full p-2 bg-background border ${step.color}`}>
                      <StepIcon className="h-4 w-4" />
                    </div>
                    <p className="text-[11px] font-semibold mt-1">{step.label}</p>
                    <p className="text-[9px] text-muted-foreground">{step.desc}</p>
                  </div>
                  {i < workflowSteps.length - 1 && (
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 -mt-3" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="open">
        <TabsList className="grid grid-cols-3 w-full max-w-lg">
          <TabsTrigger value="open" className="text-xs gap-1"><AlertTriangle className="h-3.5 w-3.5" /> פתוחות</TabsTrigger>
          <TabsTrigger value="history" className="text-xs gap-1"><Clock className="h-3.5 w-3.5" /> היסטוריה</TabsTrigger>
          <TabsTrigger value="analysis" className="text-xs gap-1"><BarChart3 className="h-3.5 w-3.5" /> ניתוח</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Open Exceptions ──────────────────────────── */}
        <TabsContent value="open">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">מזהה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">התקנה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פרויקט</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סוג חריגה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">חומרה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תיאור</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">אחראי</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פתרון מוצע</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סטטוס</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">עלות ₪</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exceptions.filter(e => e.status !== "נסגר").map((e) => {
                    const TypeIcon = typeIcon[e.type] || AlertTriangle;
                    return (
                      <TableRow key={e.id} className="text-xs">
                        <TableCell className="font-mono font-semibold text-primary">{e.id}</TableCell>
                        <TableCell className="font-mono text-muted-foreground">{e.insId}</TableCell>
                        <TableCell>{e.project}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1">
                            <TypeIcon className="h-3 w-3 shrink-0" />{e.type}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[9px] ${severityColor[e.severity] || "bg-gray-500/20 text-gray-300"}`}>{e.severity}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground" title={e.description}>{e.description}</TableCell>
                        <TableCell>{e.responsible}</TableCell>
                        <TableCell className="max-w-[180px] truncate text-muted-foreground" title={e.resolution}>{e.resolution}</TableCell>
                        <TableCell>
                          <Badge className={`text-[9px] ${statusColor[e.status] || "bg-gray-500/20 text-gray-300"}`}>{e.status}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-left">{e.cost > 0 ? `₪${e.cost.toLocaleString()}` : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: History (closed) ────────────────────────── */}
        <TabsContent value="history">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    {["מזהה","התקנה","פרויקט","סוג חריגה","חומרה","תיאור","אחראי","פתרון","סטטוס","עלות ₪"].map(h => (
                      <TableHead key={h} className="text-right text-[10px] font-semibold">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exceptions.filter(e => e.status === "נסגר").map((e) => {
                    const TypeIcon = typeIcon[e.type] || AlertTriangle;
                    return (
                      <TableRow key={e.id} className="text-xs">
                        <TableCell className="font-mono font-semibold text-primary">{e.id}</TableCell>
                        <TableCell className="font-mono text-muted-foreground">{e.insId}</TableCell>
                        <TableCell>{e.project}</TableCell>
                        <TableCell><span className="flex items-center gap-1"><TypeIcon className="h-3 w-3 shrink-0" />{e.type}</span></TableCell>
                        <TableCell><Badge className={`text-[9px] ${severityColor[e.severity]}`}>{e.severity}</Badge></TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground" title={e.description}>{e.description}</TableCell>
                        <TableCell>{e.responsible}</TableCell>
                        <TableCell className="max-w-[180px] truncate text-muted-foreground" title={e.resolution}>{e.resolution}</TableCell>
                        <TableCell><Badge className="text-[9px] bg-emerald-500/20 text-emerald-300">{e.status}</Badge></TableCell>
                        <TableCell className="font-mono text-left">{e.cost > 0 ? `₪${e.cost.toLocaleString()}` : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Analysis (Pareto breakdown) ─────────────── */}
        <TabsContent value="analysis">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" /> ניתוח פארטו — חריגות לפי סוג
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                {paretoData.map((item, i) => {
                  let cumPct = 0;
                  for (let j = 0; j <= i; j++) cumPct += paretoData[j].pct;
                  const TypeIcon = typeIcon[item.type] || AlertTriangle;
                  return (
                    <div key={item.type} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 font-medium">
                          <TypeIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          {item.type}
                        </span>
                        <span className="font-mono text-muted-foreground">
                          {item.count} ({item.pct}%) — מצטבר {cumPct}%
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={item.pct} className="h-2 flex-1" />
                        <span className="text-[10px] font-mono w-8 text-left">{item.pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Severity Distribution */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-primary" /> התפלגות לפי חומרה
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="grid grid-cols-4 gap-3">
                  {(["קריטי", "גבוה", "בינוני", "נמוך"] as const).map((sev) => {
                    const count = exceptions.filter(e => e.severity === sev).length;
                    const pct = Math.round((count / exceptions.length) * 100);
                    return (
                      <div key={sev} className="text-center space-y-1">
                        <Badge className={`text-xs px-3 py-1 ${severityColor[sev]}`}>{sev}</Badge>
                        <p className="text-2xl font-bold font-mono">{count}</p>
                        <p className="text-[10px] text-muted-foreground">{pct}% מהחריגות</p>
                        <Progress value={pct} className="h-1.5" />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Impact Analysis */}
      <div className="grid grid-cols-3 gap-4">
        {impactData.map((impact, i) => {
          const ImpactIcon = impact.icon;
          return (
            <Card key={i} className={`${impact.bg} border-0 shadow-sm`}>
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-semibold flex items-center gap-2">
                  <ImpactIcon className={`h-4 w-4 ${impact.color}`} />
                  {impact.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <p className={`text-3xl font-bold font-mono ${impact.color}`}>
                  {impact.metric}
                </p>
                <p className="text-[10px] text-muted-foreground mb-2">{impact.unit}</p>
                <div className="space-y-1.5">
                  {impact.details.map((d, j) => (
                    <div key={j} className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">{d.label}</span>
                      <span className="font-mono font-medium">{d.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}