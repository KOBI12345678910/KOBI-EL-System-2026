import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  ShieldCheck, ClipboardCheck, Bug, FileWarning, Wrench, ShieldAlert,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, XCircle, Clock,
} from "lucide-react";

const fmt = (v: number) => "₪" + v.toLocaleString("he-IL");

const FALLBACK_INSPECTIONS = [
  { wo: "WO-4010", stage: "חומר נכנס", item: "פלדה 304L", qty: 500, result: "עבר", defects: 0, inspector: "יוסי כהן" },
  { wo: "WO-4011", stage: "בתהליך", item: "גליל אלומיניום 6061", qty: 200, result: "עבר", defects: 0, inspector: "שרה לוי" },
  { wo: "WO-4012", stage: "בדיקה סופית", item: "מארז בקר T-200", qty: 120, result: "נכשל", defects: 3, inspector: "דוד מזרחי" },
  { wo: "WO-4013", stage: "חומר נכנס", item: "רכיב אלקטרוני IC-55", qty: 1000, result: "עבר", defects: 0, inspector: "רחל אברהם" },
  { wo: "WO-4014", stage: "בתהליך", item: "לוח מעגל PCB-8L", qty: 300, result: "מותנה", defects: 1, inspector: "אלון גולדשטיין" },
  { wo: "WO-4015", stage: "בדיקה סופית", item: "חיישן לחץ PS-90", qty: 80, result: "עבר", defects: 0, inspector: "מיכל ברק" },
  { wo: "WO-4016", stage: "חומר נכנס", item: "פולימר ABS-750", qty: 2000, result: "נכשל", defects: 5, inspector: "עומר חדד" },
  { wo: "WO-4017", stage: "בתהליך", item: "צינור נירוסטה DN50", qty: 150, result: "עבר", defects: 0, inspector: "נועה פרידמן" },
];

const FALLBACK_DEFECTS = [
  { type: "סדק פני שטח", station: "CNC-03", product: "מארז בקר T-200", severity: "קריטי", rootCause: "כלי שחוק", freq: 12 },
  { type: "סטייה מימדית", station: "עיבוד-01", product: "ציר הנעה SH-40", severity: "מז'ורי", rootCause: "כיול לקוי", freq: 8 },
  { type: "גימור לא אחיד", station: "צביעה-02", product: "פנל קדמי FP-15", severity: "מינורי", rootCause: "לחות גבוהה", freq: 15 },
  { type: "הלחמה קרה", station: "SMT-01", product: "לוח מעגל PCB-8L", severity: "קריטי", rootCause: "טמפרטורה נמוכה", freq: 6 },
  { type: "שריטות", station: "הרכבה-04", product: "חיישן לחץ PS-90", severity: "מינורי", rootCause: "טיפול ידני", freq: 20 },
  { type: "עיוות תרמי", station: "תנור-02", product: "פולימר ABS-750", severity: "מז'ורי", rootCause: "פרופיל חום שגוי", freq: 4 },
  { type: "חוסר רכיב", station: "הרכבה-02", product: "בקר תעשייתי IC-55", severity: "קריטי", rootCause: "טעות BOM", freq: 3 },
];

const FALLBACK_NCRS = [
  { id: "NCR-001", item: "מארז בקר T-200", desc: "סדקים ב-3 יחידות אחרי בדיקה סופית", disposition: "תיקון", cost: 4500 },
  { id: "NCR-002", item: "לוח מעגל PCB-8L", desc: "הלחמות קרות בכרטיסי בקרה", disposition: "תיקון", cost: 2800 },
  { id: "NCR-003", item: "פולימר ABS-750", desc: "חומר גלם לא עומד במפרט ספיגה", disposition: "גריטה", cost: 12000 },
  { id: "NCR-004", item: "ציר הנעה SH-40", desc: "סטייה של 0.15 מ\"מ מהמפרט", disposition: "קבלה בהנחה", cost: 800 },
  { id: "NCR-005", item: "פנל קדמי FP-15", desc: "גימור צבע לא אחיד באצווה 2210", disposition: "תיקון", cost: 3200 },
  { id: "NCR-006", item: "חיישן לחץ PS-90", desc: "קריאות לא יציבות ב-5% מהמדגם", disposition: "גריטה", cost: 6500 },
  { id: "NCR-007", item: "בקר תעשייתי IC-55", desc: "רכיב חסר בהרכבה סופית", disposition: "תיקון", cost: 1500 },
  { id: "NCR-008", item: "צינור נירוסטה DN50", desc: "סימני חלודה על פני השטח", disposition: "החזרה לספק", cost: 9200 },
];

const FALLBACK_REWORK = [
  { origWo: "WO-4012", reworkWo: "RW-501", reason: "סדקים במארז", station: "CNC-03", operator: "יוסי כהן", hours: 6.5, cost: 1950, status: "בעבודה" },
  { origWo: "WO-4014", reworkWo: "RW-502", reason: "הלחמות קרות", station: "SMT-01", operator: "שרה לוי", hours: 4.0, cost: 1200, status: "הושלם" },
  { origWo: "WO-4016", reworkWo: "RW-503", reason: "עיוות תרמי", station: "תנור-02", operator: "דוד מזרחי", hours: 3.0, cost: 900, status: "ממתין" },
  { origWo: "WO-4019", reworkWo: "RW-504", reason: "גימור לא אחיד", station: "צביעה-02", operator: "רחל אברהם", hours: 5.0, cost: 1500, status: "בעבודה" },
  { origWo: "WO-4021", reworkWo: "RW-505", reason: "חוסר רכיב", station: "הרכבה-02", operator: "אלון גולדשטיין", hours: 2.0, cost: 600, status: "הושלם" },
  { origWo: "WO-4023", reworkWo: "RW-506", reason: "סטייה מימדית", station: "עיבוד-01", operator: "מיכל ברק", hours: 8.0, cost: 2400, status: "בעבודה" },
  { origWo: "WO-4025", reworkWo: "RW-507", reason: "שריטות פני שטח", station: "הרכבה-04", operator: "עומר חדד", hours: 1.5, cost: 450, status: "ממתין" },
];

const FALLBACK_PREVENTIONS = [
  { issue: "סדקי פני שטח חוזרים ב-CNC", rootCause: "כלי חיתוך שחוקים", action: "הוספת מעקב אוטומטי לשחיקת כלים", responsible: "יוסי כהן", verifyDate: "2026-04-15", status: "בוצע" },
  { issue: "הלחמות קרות ב-SMT", rootCause: "טמפרטורת ריפלו נמוכה", action: "עדכון פרופיל טמפרטורה + כיול חודשי", responsible: "שרה לוי", verifyDate: "2026-04-20", status: "בתהליך" },
  { issue: "סטייה מימדית בצירים", rootCause: "כיול מכונה לא תקין", action: "כיול שבועי + תיקון נוהל", responsible: "דוד מזרחי", verifyDate: "2026-04-10", status: "בוצע" },
  { issue: "עיוות תרמי בפולימר", rootCause: "פרופיל חום שגוי בתנור", action: "מיפוי תרמי מחדש + חיישנים נוספים", responsible: "רחל אברהם", verifyDate: "2026-04-25", status: "ממתין" },
  { issue: "גימור צבע לא אחיד", rootCause: "לחות גבוהה בתא ריסוס", action: "התקנת מערכת בקרת אקלים", responsible: "אלון גולדשטיין", verifyDate: "2026-05-01", status: "בתהליך" },
  { issue: "חוסר רכיבים בהרכבה", rootCause: "טעות ב-BOM גרסה ישנה", action: "נעילת BOM + אימות אוטומטי", responsible: "מיכל ברק", verifyDate: "2026-04-12", status: "בוצע" },
  { issue: "חלודה בצינורות נירוסטה", rootCause: "אחסון לקוי במחסן ספק", action: "ביקורת ספק + עדכון מפרט אריזה", responsible: "עומר חדד", verifyDate: "2026-05-05", status: "ממתין" },
];

const sevColor = (s: string) =>
  s === "קריטי" ? "bg-red-500/20 text-red-300" : s === "מז'ורי" ? "bg-orange-500/20 text-orange-300" : "bg-yellow-500/20 text-yellow-300";
const resColor = (r: string) =>
  r === "עבר" ? "bg-green-500/20 text-green-300" : r === "נכשל" ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300";
const dispColor = (d: string) =>
  d === "תיקון" ? "bg-blue-500/20 text-blue-300" : d === "גריטה" ? "bg-red-500/20 text-red-300" : d === "קבלה בהנחה" ? "bg-yellow-500/20 text-yellow-300" : "bg-purple-500/20 text-purple-300";
const rwColor = (s: string) =>
  s === "הושלם" ? "bg-green-500/20 text-green-300" : s === "בעבודה" ? "bg-blue-500/20 text-blue-300" : "bg-gray-500/20 text-gray-300";
const prevColor = (s: string) =>
  s === "בוצע" ? "bg-green-500/20 text-green-300" : s === "בתהליך" ? "bg-blue-500/20 text-blue-300" : "bg-gray-500/20 text-gray-300";

const th = "p-3 text-right text-muted-foreground font-medium text-xs";
const td = "p-3 text-sm";

export default function QualityDefectsRework() {
  const [tab, setTab] = useState("inspections");

  const { data: apiData } = useQuery({
    queryKey: ["production-quality-defects"],
    queryFn: () => authFetch("/api/production/quality").then(r => r.json()),
  });
  const safeArr = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
  const inspections = safeArr(apiData?.inspections).length > 0 ? safeArr(apiData.inspections) : FALLBACK_INSPECTIONS;
  const defects = safeArr(apiData?.defects).length > 0 ? safeArr(apiData.defects) : FALLBACK_DEFECTS;
  const ncrs = safeArr(apiData?.ncrs).length > 0 ? safeArr(apiData.ncrs) : FALLBACK_NCRS;
  const reworkJobs = safeArr(apiData?.rework).length > 0 ? safeArr(apiData.rework) : FALLBACK_REWORK;
  const preventions = safeArr(apiData?.preventions).length > 0 ? safeArr(apiData.preventions) : FALLBACK_PREVENTIONS;

  const kpis = [
    { label: "בדיקות היום", value: "34", icon: ClipboardCheck, color: "text-blue-400", trend: "+8", up: true },
    { label: "First Pass Yield", value: "92.4%", icon: CheckCircle2, color: "text-green-400", trend: "+1.2%", up: true },
    { label: "שיעור פגמים", value: "3.1%", icon: Bug, color: "text-red-400", trend: "-0.4%", up: true },
    { label: "NCR פעילים", value: "8", icon: FileWarning, color: "text-orange-400", trend: "+2", up: false },
    { label: "עבודות תיקון", value: "7", icon: Wrench, color: "text-cyan-400", trend: "-1", up: true },
    { label: "עלות תיקונים", value: fmt(9000), icon: AlertTriangle, color: "text-amber-400", trend: "-15%", up: true },
  ];

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-blue-400" />
            בקרת איכות, פגמים ותיקונים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי -- QC, Defect Logging, NCR, Rework & Prevention</p>
        </div>
      </div>

      {/* KPI cards */}
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

      {/* Yield progress bar */}
      <Card className="bg-card/60 border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">First Pass Yield -- יעד 95%</span>
            <span className="text-sm font-mono text-green-400">92.4%</span>
          </div>
          <Progress value={92.4} className="h-2" />
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="bg-card/60 border border-border w-full justify-start gap-1 p-1 h-auto flex-wrap">
          <TabsTrigger value="inspections" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><ClipboardCheck className="h-3.5 w-3.5" />בדיקות</TabsTrigger>
          <TabsTrigger value="defects" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><Bug className="h-3.5 w-3.5" />פגמים</TabsTrigger>
          <TabsTrigger value="ncr" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><FileWarning className="h-3.5 w-3.5" />NCR</TabsTrigger>
          <TabsTrigger value="rework" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><Wrench className="h-3.5 w-3.5" />תיקונים</TabsTrigger>
          <TabsTrigger value="prevention" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><ShieldAlert className="h-3.5 w-3.5" />מניעה</TabsTrigger>
        </TabsList>

        {/* Inspections tab */}
        <TabsContent value="inspections">
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
              <th className={th}>הזמנת עבודה</th><th className={th}>שלב</th><th className={th}>פריט</th>
              <th className={th}>כמות</th><th className={th}>תוצאה</th><th className={th}>פגמים</th><th className={th}>בודק</th>
            </tr></thead><tbody>
              {inspections.map((r, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className={`${td} font-mono text-blue-400`}>{r.wo}</td>
                  <td className={td}><Badge className="bg-indigo-500/20 text-indigo-300 border-0 text-xs">{r.stage}</Badge></td>
                  <td className={`${td} text-foreground font-medium`}>{r.item}</td>
                  <td className={`${td} font-mono text-muted-foreground text-center`}>{r.qty.toLocaleString()}</td>
                  <td className={td}><Badge className={`${resColor(r.result)} border-0 text-xs`}>{r.result}</Badge></td>
                  <td className={`${td} font-mono text-center ${r.defects > 0 ? "text-red-400" : "text-muted-foreground"}`}>{r.defects}</td>
                  <td className={`${td} text-muted-foreground`}>{r.inspector}</td>
                </tr>
              ))}
            </tbody></table>
          </div></CardContent></Card>
        </TabsContent>

        {/* Defects tab */}
        <TabsContent value="defects">
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
              <th className={th}>סוג פגם</th><th className={th}>תחנה</th><th className={th}>מוצר</th>
              <th className={th}>חומרה</th><th className={th}>גורם שורש</th><th className={th}>תדירות</th>
            </tr></thead><tbody>
              {defects.map((r, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className={`${td} text-foreground font-medium`}>{r.type}</td>
                  <td className={`${td} font-mono text-cyan-400`}>{r.station}</td>
                  <td className={`${td} text-muted-foreground`}>{r.product}</td>
                  <td className={td}><Badge className={`${sevColor(r.severity)} border-0 text-xs`}>{r.severity}</Badge></td>
                  <td className={`${td} text-muted-foreground`}>{r.rootCause}</td>
                  <td className={`${td} font-mono text-center`}>
                    <span className={r.freq >= 10 ? "text-red-400 font-bold" : "text-muted-foreground"}>{r.freq}</span>
                  </td>
                </tr>
              ))}
            </tbody></table>
          </div></CardContent></Card>
        </TabsContent>

        {/* NCR tab */}
        <TabsContent value="ncr">
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
              <th className={th}>מספר NCR</th><th className={th}>פריט</th><th className={th}>תיאור</th>
              <th className={th}>החלטה</th><th className={th}>עלות</th>
            </tr></thead><tbody>
              {ncrs.map((r, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className={`${td} font-mono text-blue-400 font-bold`}>{r.id}</td>
                  <td className={`${td} text-foreground font-medium`}>{r.item}</td>
                  <td className={`${td} text-muted-foreground max-w-[300px]`}>{r.desc}</td>
                  <td className={td}><Badge className={`${dispColor(r.disposition)} border-0 text-xs`}>{r.disposition}</Badge></td>
                  <td className={`${td} font-mono text-red-400`}>{fmt(r.cost)}</td>
                </tr>
              ))}
            </tbody></table>
          </div></CardContent></Card>
        </TabsContent>

        {/* Rework tab */}
        <TabsContent value="rework">
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
              <th className={th}>WO מקורי</th><th className={th}>WO תיקון</th><th className={th}>סיבה</th>
              <th className={th}>תחנה</th><th className={th}>מפעיל</th><th className={th}>שעות</th>
              <th className={th}>עלות</th><th className={th}>סטטוס</th>
            </tr></thead><tbody>
              {reworkJobs.map((r, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className={`${td} font-mono text-muted-foreground`}>{r.origWo}</td>
                  <td className={`${td} font-mono text-blue-400 font-bold`}>{r.reworkWo}</td>
                  <td className={`${td} text-foreground font-medium`}>{r.reason}</td>
                  <td className={`${td} font-mono text-cyan-400`}>{r.station}</td>
                  <td className={`${td} text-muted-foreground`}>{r.operator}</td>
                  <td className={`${td} font-mono text-center text-muted-foreground`}>{r.hours}</td>
                  <td className={`${td} font-mono text-red-400`}>{fmt(r.cost)}</td>
                  <td className={td}><Badge className={`${rwColor(r.status)} border-0 text-xs`}>{r.status}</Badge></td>
                </tr>
              ))}
            </tbody></table>
          </div></CardContent></Card>
        </TabsContent>

        {/* Prevention tab */}
        <TabsContent value="prevention">
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
              <th className={th}>בעיה</th><th className={th}>גורם שורש</th><th className={th}>פעולה</th>
              <th className={th}>אחראי</th><th className={th}>תאריך אימות</th><th className={th}>סטטוס</th>
            </tr></thead><tbody>
              {preventions.map((r, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className={`${td} text-foreground font-medium`}>{r.issue}</td>
                  <td className={`${td} text-muted-foreground`}>{r.rootCause}</td>
                  <td className={`${td} text-muted-foreground max-w-[280px]`}>{r.action}</td>
                  <td className={`${td} text-muted-foreground`}>{r.responsible}</td>
                  <td className={`${td} font-mono text-muted-foreground`}>{new Date(r.verifyDate).toLocaleDateString("he-IL")}</td>
                  <td className={td}><Badge className={`${prevColor(r.status)} border-0 text-xs`}>{r.status}</Badge></td>
                </tr>
              ))}
            </tbody></table>
          </div></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
