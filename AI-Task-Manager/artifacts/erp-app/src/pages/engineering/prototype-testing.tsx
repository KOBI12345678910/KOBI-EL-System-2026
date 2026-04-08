import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  FlaskConical, CheckCircle2, Clock, AlertTriangle, TrendingUp,
  Microscope, CalendarDays, Wrench, Search, ShieldCheck, Wind,
  Droplets, Thermometer, Volume2, Flame, Target, Zap, Sun,
} from "lucide-react";

// ── Prototypes ──
const FALLBACK_PROTOTYPES = [
  { id: "PRT-001", name: "פרופיל תרמי 78 מ\"מ", material: "אלומיניום 6063-T5", stage: "אושר", designer: "יוסי כהן", startDate: "2026-01-15", progress: 100, tests: 6 },
  { id: "PRT-002", name: "חלון הזזה כפול אטום", material: "אלומיניום + זכוכית כפולה", stage: "בבדיקה", designer: "שרה לוי", startDate: "2026-02-10", progress: 72, tests: 4 },
  { id: "PRT-003", name: "דלת כניסה משוריינת", material: "פלדה + אלומיניום", stage: "ייצור", designer: "דוד מזרחי", startDate: "2026-03-01", progress: 45, tests: 0 },
  { id: "PRT-004", name: "קיר מסך מבודד אקוסטי", material: "אלומיניום + זכוכית למינציה", stage: "קונספט", designer: "רחל אברהם", startDate: "2026-03-20", progress: 15, tests: 0 },
  { id: "PRT-005", name: "תריס חשמלי חוסם שמש", material: "אלומיניום אנודייז", stage: "בבדיקה", designer: "אלון גולדשטיין", startDate: "2026-02-25", progress: 68, tests: 3 },
  { id: "PRT-006", name: "מעקה זכוכית ללא מסגרת", material: "זכוכית מחוסמת 12 מ\"מ", stage: "נדחה", designer: "מיכל ברק", startDate: "2026-01-08", progress: 90, tests: 5 },
  { id: "PRT-007", name: "פרגולת אלומיניום מתקפלת", material: "אלומיניום 6061", stage: "ייצור", designer: "עומר חדד", startDate: "2026-03-10", progress: 38, tests: 0 },
  { id: "PRT-008", name: "חלון ציר עליון חסין אש", material: "פלדה + זכוכית אש", stage: "בבדיקה", designer: "נועה פרידמן", startDate: "2026-02-18", progress: 60, tests: 2 },
];

// ── Test Results ──
const FALLBACK_TESTRESULTS = [
  { id: "TST-001", prototype: "PRT-001", test: "עמידות לרוח", standard: "EN 12210", result: "C5/B5", pass: true, date: "2026-03-15", tester: "מעבדת עמידות" },
  { id: "TST-002", prototype: "PRT-001", test: "אטימות מים", standard: "EN 12208", result: "E1050", pass: true, date: "2026-03-17", tester: "מעבדת עמידות" },
  { id: "TST-003", prototype: "PRT-002", test: "חדירות אוויר", standard: "EN 12207", result: "Class 4", pass: true, date: "2026-03-22", tester: "מעבדת אטימות" },
  { id: "TST-004", prototype: "PRT-002", test: "בידוד אקוסטי", standard: "EN ISO 10140", result: "Rw=42dB", pass: true, date: "2026-03-25", tester: "מעבדת אקוסטיקה" },
  { id: "TST-005", prototype: "PRT-001", test: "מחזורי תרמיים", standard: "EN 13420", result: "1000 מחזורים", pass: true, date: "2026-03-20", tester: "מעבדת חומרים" },
  { id: "TST-006", prototype: "PRT-006", test: "עמידות לחבטה", standard: "EN 12600", result: "1B1 נכשל", pass: false, date: "2026-02-28", tester: "מעבדת בטיחות" },
  { id: "TST-007", prototype: "PRT-005", test: "ריסוס מלח (קורוזיה)", standard: "ASTM B117", result: "720 שעות", pass: true, date: "2026-03-30", tester: "מעבדת חומרים" },
  { id: "TST-008", prototype: "PRT-006", test: "חשיפת UV", standard: "ASTM G154", result: "500 שעות - דהייה", pass: false, date: "2026-03-02", tester: "מעבדת חומרים" },
  { id: "TST-009", prototype: "PRT-001", test: "סיבולת מכנית", standard: "EN 12400", result: "Class 3 - 20,000", pass: true, date: "2026-03-28", tester: "מעבדת מכניקה" },
  { id: "TST-010", prototype: "PRT-008", test: "עמידות אש", standard: "EN 1634-1", result: "EI60", pass: true, date: "2026-04-01", tester: "מעבדת אש" },
  { id: "TST-011", prototype: "PRT-002", test: "פריצה בכוח", standard: "EN 1627", result: "RC3", pass: true, date: "2026-04-03", tester: "מעבדת בטיחות" },
  { id: "TST-012", prototype: "PRT-006", test: "עמידות בליסטית", standard: "EN 1063", result: "BR2 נכשל", pass: false, date: "2026-03-05", tester: "מעבדת בטיחות" },
];

// ── Test Schedule ──
const FALLBACK_SCHEDULE = [
  { date: "2026-04-10", prototype: "PRT-003", test: "עמידות לרוח", lab: "מעבדת עמידות", priority: "גבוהה" },
  { date: "2026-04-12", prototype: "PRT-005", test: "חדירות אוויר", lab: "מעבדת אטימות", priority: "רגילה" },
  { date: "2026-04-14", prototype: "PRT-003", test: "אטימות מים", lab: "מעבדת עמידות", priority: "גבוהה" },
  { date: "2026-04-16", prototype: "PRT-008", test: "בידוד אקוסטי", lab: "מעבדת אקוסטיקה", priority: "דחופה" },
  { date: "2026-04-18", prototype: "PRT-007", test: "ריסוס מלח (קורוזיה)", lab: "מעבדת חומרים", priority: "רגילה" },
  { date: "2026-04-20", prototype: "PRT-005", test: "חשיפת UV", lab: "מעבדת חומרים", priority: "רגילה" },
  { date: "2026-04-22", prototype: "PRT-003", test: "סיבולת מכנית", lab: "מעבדת מכניקה", priority: "גבוהה" },
  { date: "2026-04-25", prototype: "PRT-007", test: "עמידות לרוח", lab: "מעבדת עמידות", priority: "רגילה" },
];

// ── Lab Equipment ──
const FALLBACK_EQUIPMENT = [
  { id: "EQP-01", name: "תא לחץ רוח", lab: "מעבדת עמידות", lastCal: "2026-02-01", nextCal: "2026-08-01", status: "תקין" },
  { id: "EQP-02", name: "מערכת ריסוס מים", lab: "מעבדת עמידות", lastCal: "2026-01-15", nextCal: "2026-07-15", status: "תקין" },
  { id: "EQP-03", name: "מד חדירות אוויר", lab: "מעבדת אטימות", lastCal: "2025-12-20", nextCal: "2026-06-20", status: "דרוש כיול" },
  { id: "EQP-04", name: "חדר אקוסטי מבודד", lab: "מעבדת אקוסטיקה", lastCal: "2026-03-01", nextCal: "2026-09-01", status: "תקין" },
  { id: "EQP-05", name: "תא מחזורים תרמיים", lab: "מעבדת חומרים", lastCal: "2026-01-10", nextCal: "2026-07-10", status: "תקין" },
  { id: "EQP-06", name: "מכונת חבטה / פנדולום", lab: "מעבדת בטיחות", lastCal: "2025-11-20", nextCal: "2026-05-20", status: "דרוש כיול" },
  { id: "EQP-07", name: "תא ריסוס מלח", lab: "מעבדת חומרים", lastCal: "2026-03-15", nextCal: "2026-09-15", status: "תקין" },
  { id: "EQP-08", name: "מאיץ UV (QUV)", lab: "מעבדת חומרים", lastCal: "2026-02-20", nextCal: "2026-08-20", status: "בתיקון" },
  { id: "EQP-09", name: "מכונת מתיחה אוניברסלית", lab: "מעבדת מכניקה", lastCal: "2026-03-05", nextCal: "2026-09-05", status: "תקין" },
  { id: "EQP-10", name: "כבשן בדיקת אש", lab: "מעבדת אש", lastCal: "2026-01-25", nextCal: "2026-07-25", status: "תקין" },
];

// ── Badge helpers ──
const stageColor = (s: string) =>
  s === "אושר" ? "bg-green-500/20 text-green-300"
  : s === "בבדיקה" ? "bg-amber-500/20 text-amber-300"
  : s === "ייצור" ? "bg-blue-500/20 text-blue-300"
  : s === "קונספט" ? "bg-purple-500/20 text-purple-300"
  : "bg-red-500/20 text-red-300"; // נדחה

const passColor = (p: boolean) => p ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300";

const prioColor = (s: string) =>
  s === "דחופה" ? "bg-red-500/20 text-red-300"
  : s === "גבוהה" ? "bg-orange-500/20 text-orange-300"
  : "bg-blue-500/20 text-blue-300";

const eqStatusColor = (s: string) =>
  s === "תקין" ? "bg-green-500/20 text-green-300"
  : s === "דרוש כיול" ? "bg-amber-500/20 text-amber-300"
  : "bg-red-500/20 text-red-300";

const testIcon = (t: string) => {
  if (t.includes("רוח")) return Wind;
  if (t.includes("מים")) return Droplets;
  if (t.includes("אקוסטי")) return Volume2;
  if (t.includes("תרמי")) return Thermometer;
  if (t.includes("אש")) return Flame;
  if (t.includes("UV") || t.includes("חשיפ")) return Sun;
  if (t.includes("בליסטי") || t.includes("פריצה")) return ShieldCheck;
  return Target;
};

const th = "p-3 text-right text-muted-foreground font-medium text-xs";
const td = "p-3 text-sm";

export default function PrototypeTestingPage() {
  const { data: apiprototypes } = useQuery({
    queryKey: ["/api/engineering/prototype-testing/prototypes"],
    queryFn: () => authFetch("/api/engineering/prototype-testing/prototypes").then(r => r.json()).catch(() => null),
  });
  const prototypes = Array.isArray(apiprototypes) ? apiprototypes : (apiprototypes?.data ?? apiprototypes?.items ?? FALLBACK_PROTOTYPES);


  const { data: apitestResults } = useQuery({
    queryKey: ["/api/engineering/prototype-testing/testresults"],
    queryFn: () => authFetch("/api/engineering/prototype-testing/testresults").then(r => r.json()).catch(() => null),
  });
  const testResults = Array.isArray(apitestResults) ? apitestResults : (apitestResults?.data ?? apitestResults?.items ?? FALLBACK_TESTRESULTS);


  const { data: apischedule } = useQuery({
    queryKey: ["/api/engineering/prototype-testing/schedule"],
    queryFn: () => authFetch("/api/engineering/prototype-testing/schedule").then(r => r.json()).catch(() => null),
  });
  const schedule = Array.isArray(apischedule) ? apischedule : (apischedule?.data ?? apischedule?.items ?? FALLBACK_SCHEDULE);


  const { data: apiequipment } = useQuery({
    queryKey: ["/api/engineering/prototype-testing/equipment"],
    queryFn: () => authFetch("/api/engineering/prototype-testing/equipment").then(r => r.json()).catch(() => null),
  });
  const equipment = Array.isArray(apiequipment) ? apiequipment : (apiequipment?.data ?? apiequipment?.items ?? FALLBACK_EQUIPMENT);

  const [tab, setTab] = useState("prototypes");
  const [search, setSearch] = useState("");

  const totalTests = testResults.length;
  const passed = testResults.filter(t => t.pass).length;
  const passRate = Math.round((passed / totalTests) * 100);

  const kpis = [
    { label: "אבות טיפוס פעילים", value: prototypes.filter(p => p.stage !== "נדחה" && p.stage !== "אושר").length.toString(), icon: FlaskConical, color: "text-blue-400" },
    { label: "בדיקות שהושלמו", value: totalTests.toString(), icon: CheckCircle2, color: "text-green-400" },
    { label: "אחוז עמידה", value: `${passRate}%`, icon: TrendingUp, color: "text-emerald-400" },
    { label: "בדיקות ממתינות", value: schedule.length.toString(), icon: Clock, color: "text-amber-400" },
    { label: "זמן פיתוח ממוצע", value: "47 יום", icon: CalendarDays, color: "text-purple-400" },
  ];

  const filteredPrototypes = prototypes.filter(p =>
    !search || p.name.includes(search) || p.id.includes(search) || p.material.includes(search)
  );
  const filteredTests = testResults.filter(t =>
    !search || t.test.includes(search) || t.prototype.includes(search) || t.standard.includes(search)
  );

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Microscope className="h-6 w-6 text-blue-400" />
            פיתוח ובדיקות אב טיפוס
          </h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי -- Prototype Development & Testing</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש..."
            className="pr-9 bg-card/60 border-border text-sm h-9"
          />
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

      {/* ── Pass-rate Progress ── */}
      <Card className="bg-card/60 border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">שיעור עמידה בבדיקות -- יעד 85%</span>
            <span className={`text-sm font-mono ${passRate >= 85 ? "text-green-400" : "text-amber-400"}`}>{passRate}%</span>
          </div>
          <Progress value={passRate} className="h-2" />
        </CardContent>
      </Card>

      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="bg-card/60 border border-border w-full justify-start gap-1 p-1 h-auto flex-wrap">
          <TabsTrigger value="prototypes" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><FlaskConical className="h-3.5 w-3.5" />אבות טיפוס</TabsTrigger>
          <TabsTrigger value="results" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><CheckCircle2 className="h-3.5 w-3.5" />תוצאות בדיקות</TabsTrigger>
          <TabsTrigger value="schedule" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><CalendarDays className="h-3.5 w-3.5" />לוח בדיקות</TabsTrigger>
          <TabsTrigger value="equipment" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><Wrench className="h-3.5 w-3.5" />ציוד מעבדה</TabsTrigger>
        </TabsList>

        {/* ── Prototypes Tab ── */}
        <TabsContent value="prototypes">
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
              <th className={th}>מספר</th><th className={th}>שם אב טיפוס</th><th className={th}>חומר</th>
              <th className={th}>שלב</th><th className={th}>מעצב</th><th className={th}>התחלה</th>
              <th className={th}>התקדמות</th><th className={th}>בדיקות</th>
            </tr></thead><tbody>
              {filteredPrototypes.map((r, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className={`${td} font-mono text-blue-400 font-bold`}>{r.id}</td>
                  <td className={`${td} text-foreground font-medium`}>{r.name}</td>
                  <td className={`${td} text-muted-foreground`}>{r.material}</td>
                  <td className={td}><Badge className={`${stageColor(r.stage)} border-0 text-xs`}>{r.stage}</Badge></td>
                  <td className={`${td} text-muted-foreground`}>{r.designer}</td>
                  <td className={`${td} font-mono text-muted-foreground text-xs`}>{r.startDate}</td>
                  <td className={td}>
                    <div className="flex items-center gap-2 min-w-[100px]">
                      <Progress value={r.progress} className="h-1.5 flex-1" />
                      <span className="text-xs font-mono text-muted-foreground w-8">{r.progress}%</span>
                    </div>
                  </td>
                  <td className={`${td} text-center font-mono`}>
                    {r.tests > 0
                      ? <Badge className="bg-cyan-500/20 text-cyan-300 border-0 text-xs">{r.tests}</Badge>
                      : <span className="text-muted-foreground text-xs">--</span>}
                  </td>
                </tr>
              ))}
            </tbody></table>
          </div></CardContent></Card>
        </TabsContent>

        {/* ── Test Results Tab ── */}
        <TabsContent value="results">
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
              <th className={th}>מספר</th><th className={th}>אב טיפוס</th><th className={th}>סוג בדיקה</th>
              <th className={th}>תקן</th><th className={th}>תוצאה</th><th className={th}>עמידה</th>
              <th className={th}>תאריך</th><th className={th}>מעבדה</th>
            </tr></thead><tbody>
              {filteredTests.map((r, i) => {
                const Icon = testIcon(r.test);
                return (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className={`${td} font-mono text-blue-400 font-bold`}>{r.id}</td>
                    <td className={`${td} font-mono text-purple-400`}>{r.prototype}</td>
                    <td className={`${td} text-foreground font-medium`}>
                      <span className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5 text-muted-foreground" />{r.test}</span>
                    </td>
                    <td className={`${td} font-mono text-xs text-muted-foreground`}>{r.standard}</td>
                    <td className={`${td} font-mono text-sm`}>{r.result}</td>
                    <td className={td}>
                      <Badge className={`${passColor(r.pass)} border-0 text-xs`}>
                        {r.pass ? "עבר" : "נכשל"}
                      </Badge>
                    </td>
                    <td className={`${td} font-mono text-muted-foreground text-xs`}>{r.date}</td>
                    <td className={`${td} text-muted-foreground text-xs`}>{r.tester}</td>
                  </tr>
                );
              })}
            </tbody></table>
          </div></CardContent></Card>
        </TabsContent>

        {/* ── Schedule Tab ── */}
        <TabsContent value="schedule">
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
              <th className={th}>תאריך</th><th className={th}>אב טיפוס</th><th className={th}>סוג בדיקה</th>
              <th className={th}>מעבדה</th><th className={th}>עדיפות</th><th className={th}>סטטוס</th>
            </tr></thead><tbody>
              {schedule.map((r, i) => {
                const Icon = testIcon(r.test);
                const isOverdue = new Date(r.date) < new Date("2026-04-08");
                return (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className={`${td} font-mono text-sm`}>
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                        {r.date}
                      </span>
                    </td>
                    <td className={`${td} font-mono text-purple-400 font-bold`}>{r.prototype}</td>
                    <td className={`${td} text-foreground font-medium`}>
                      <span className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5 text-muted-foreground" />{r.test}</span>
                    </td>
                    <td className={`${td} text-muted-foreground`}>{r.lab}</td>
                    <td className={td}><Badge className={`${prioColor(r.priority)} border-0 text-xs`}>{r.priority}</Badge></td>
                    <td className={td}>
                      <Badge className={`${isOverdue ? "bg-red-500/20 text-red-300" : "bg-cyan-500/20 text-cyan-300"} border-0 text-xs`}>
                        {isOverdue ? "באיחור" : "מתוכנן"}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody></table>
          </div></CardContent></Card>
          <div className="flex justify-end mt-3">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <CalendarDays className="h-3.5 w-3.5" />
              תזמון בדיקה חדשה
            </Button>
          </div>
        </TabsContent>

        {/* ── Lab Equipment Tab ── */}
        <TabsContent value="equipment">
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
              <th className={th}>מספר</th><th className={th}>ציוד</th><th className={th}>מעבדה</th>
              <th className={th}>כיול אחרון</th><th className={th}>כיול הבא</th><th className={th}>מצב</th>
            </tr></thead><tbody>
              {equipment.map((r, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className={`${td} font-mono text-blue-400 font-bold`}>{r.id}</td>
                  <td className={`${td} text-foreground font-medium`}>
                    <span className="flex items-center gap-1.5"><Wrench className="h-3.5 w-3.5 text-muted-foreground" />{r.name}</span>
                  </td>
                  <td className={`${td} text-muted-foreground`}>{r.lab}</td>
                  <td className={`${td} font-mono text-muted-foreground text-xs`}>{r.lastCal}</td>
                  <td className={`${td} font-mono text-xs`}>
                    <span className={new Date(r.nextCal) < new Date("2026-07-01") ? "text-amber-400" : "text-muted-foreground"}>
                      {r.nextCal}
                    </span>
                  </td>
                  <td className={td}><Badge className={`${eqStatusColor(r.status)} border-0 text-xs`}>{r.status}</Badge></td>
                </tr>
              ))}
            </tbody></table>
          </div></CardContent></Card>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card className="bg-card/60 border-border">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">ציוד תקין</p>
                  <p className="text-lg font-bold font-mono text-green-400">{equipment.filter(e => e.status === "תקין").length}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/60 border-border">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">דרוש כיול</p>
                  <p className="text-lg font-bold font-mono text-amber-400">{equipment.filter(e => e.status === "דרוש כיול").length}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/60 border-border">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">בתיקון</p>
                  <p className="text-lg font-bold font-mono text-red-400">{equipment.filter(e => e.status === "בתיקון").length}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
