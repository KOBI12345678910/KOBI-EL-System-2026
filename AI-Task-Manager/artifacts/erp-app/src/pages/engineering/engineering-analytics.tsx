import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  BarChart3, TrendingUp, TrendingDown, Users, Clock, Target,
  Lightbulb, Shield, Wrench, BrainCircuit, Award, CheckCircle2,
  AlertTriangle, Search, Download, Calendar, Minus,
} from "lucide-react";

const pct = (v: number) => `${v.toFixed(1)}%`;
type Status = "excellent" | "good" | "warning" | "critical";
const stMap: Record<Status, { l: string; c: string }> = {
  excellent: { l: "מצוין", c: "bg-green-500/20 text-green-400" },
  good: { l: "תקין", c: "bg-blue-500/20 text-blue-400" },
  warning: { l: "אזהרה", c: "bg-yellow-500/20 text-yellow-400" },
  critical: { l: "קריטי", c: "bg-red-500/20 text-red-400" },
};
const getSt = (v: number, t: number, hb = true): Status => {
  const r = hb ? v / t : t / v;
  return r >= 1 ? "excellent" : r >= 0.93 ? "good" : r >= 0.82 ? "warning" : "critical";
};

const kpis = [
  { label: "פרויקטים שהושלמו", value: "47", icon: CheckCircle2, color: "text-green-400", trend: "+8", up: true },
  { label: "משך פרויקט ממוצע", value: "18 יום", icon: Clock, color: "text-blue-400", trend: "-3", up: true },
  { label: "פרודוקטיביות מהנדסים", value: "92%", icon: Users, color: "text-purple-400", trend: "+4%", up: true },
  { label: "דיוק עיצוב", value: "96.8%", icon: Target, color: "text-cyan-400", trend: "+1.2%", up: true },
  { label: "חיסכון מאופטימיזציה", value: "₪284K", icon: TrendingUp, color: "text-amber-400", trend: "+₪42K", up: true },
  { label: "פטנטים / חידושים", value: "6", icon: Lightbulb, color: "text-pink-400", trend: "+2", up: true },
];

const engineers = [
  { name: "יוסי כהן", hours: 168, output: 14, completion: 93, spec: "שרטוט ייצור" },
  { name: "שרה לוי", hours: 172, output: 16, completion: 97, spec: "שרטוט התקנה" },
  { name: "דוד מזרחי", hours: 160, output: 12, completion: 88, spec: "מדידות שטח" },
  { name: "רחל אברהם", hours: 165, output: 15, completion: 95, spec: "שרטוט ייצור" },
  { name: "אלון גולדשטיין", hours: 158, output: 11, completion: 84, spec: "שרטוט התקנה" },
  { name: "מיכל ברק", hours: 175, output: 17, completion: 98, spec: "מפרטים טכניים" },
  { name: "עומר חדד", hours: 162, output: 13, completion: 91, spec: "שרטוט ייצור" },
  { name: "נועה פרידמן", hours: 170, output: 15, completion: 94, spec: "שרטוט התקנה" },
];
const prodTrend = [
  { m: "נובמבר", h: 1220, o: 92, c: 86 }, { m: "דצמבר", h: 1245, o: 97, c: 88 },
  { m: "ינואר", h: 1260, o: 101, c: 89 }, { m: "פברואר", h: 1280, o: 106, c: 91 },
  { m: "מרץ", h: 1300, o: 110, c: 92 }, { m: "אפריל", h: 1330, o: 113, c: 93 },
];

const qualityData = [
  { metric: "שגיאות שנמצאו בבדיקה", review: 28, prod: 4, target: "< 5 בייצור" },
  { metric: "סטיות מידות (> 2 מ\"מ)", review: 12, prod: 2, target: "< 3 בייצור" },
  { metric: "חוסר התאמה לתקן", review: 6, prod: 1, target: "0 בייצור" },
  { metric: "שגיאות חומר/פרופיל", review: 9, prod: 1, target: "< 2 בייצור" },
  { metric: "בעיות ממשק בין מערכות", review: 5, prod: 2, target: "< 2 בייצור" },
];
const qKpis = [
  { label: "שיעור עיבוד חוזר", val: 3.2, target: 2.0, unit: "%", lb: true },
  { label: "תקינות מעבר ראשון", val: 96.8, target: 98, unit: "%" },
  { label: "שגיאות / 100 שרטוטים", val: 2.4, target: 1.5, unit: "", lb: true },
  { label: "זמן תיקון ממוצע", val: 1.8, target: 1.0, unit: "שע'", lb: true },
];
const qTrend = [
  { m: "נובמבר", rw: 5.8, fpy: 92.1, er: 4.2 }, { m: "דצמבר", rw: 5.1, fpy: 93.0, er: 3.8 },
  { m: "ינואר", rw: 4.1, fpy: 95.2, er: 3.1 }, { m: "פברואר", rw: 3.8, fpy: 95.8, er: 2.9 },
  { m: "מרץ", rw: 3.5, fpy: 96.2, er: 2.6 }, { m: "אפריל", rw: 3.2, fpy: 96.8, er: 2.4 },
];

const innovations = [
  { name: "פרופיל תרמי משולב", type: "מוצר חדש", savings: 45000, status: "הושלם", eng: "מיכל ברק" },
  { name: "מערכת חיתוך אוטומטית V2", type: "שיפור תהליך", savings: 78000, status: "הושלם", eng: "יוסי כהן" },
  { name: "זיגוג משולש לבידוד אקוסטי", type: "מוצר חדש", savings: 32000, status: "בפיתוח", eng: "שרה לוי" },
  { name: "אופטימיזציית חיתוך CNC", type: "שיפור תהליך", savings: 56000, status: "הושלם", eng: "עומר חדד" },
  { name: "פרופיל אלומיניום קל משקל", type: "מוצר חדש", savings: 41000, status: "בפיתוח", eng: "רחל אברהם" },
  { name: "תבנית הרכבה מודולרית", type: "שיפור תהליך", savings: 32000, status: "הושלם", eng: "דוד מזרחי" },
];
const innSummary = [
  { label: "מוצרים חדשים שפותחו", value: 4, icon: Lightbulb },
  { label: "שיפורים שיושמו", value: 9, icon: Wrench },
  { label: "חיסכון כולל מאופטימיזציה", value: "₪284,000", icon: TrendingUp },
  { label: "פטנטים שהוגשו", value: 2, icon: Award },
];

const workload = [
  { name: "יוסי כהן", alloc: 95, proj: 4, ot: 12 }, { name: "שרה לוי", alloc: 88, proj: 3, ot: 6 },
  { name: "דוד מזרחי", alloc: 72, proj: 2, ot: 0 }, { name: "רחל אברהם", alloc: 91, proj: 4, ot: 8 },
  { name: "אלון גולדשטיין", alloc: 65, proj: 2, ot: 0 }, { name: "מיכל ברק", alloc: 98, proj: 5, ot: 15 },
  { name: "עומר חדד", alloc: 80, proj: 3, ot: 4 }, { name: "נועה פרידמן", alloc: 85, proj: 3, ot: 5 },
];
const skillsMatrix = [
  { skill: "AutoCAD", level: "מתקדם", count: 8 }, { skill: "SolidWorks", level: "מתקדם", count: 5 },
  { skill: "חישובי קונסטרוקציה", level: "מתקדם", count: 4 }, { skill: "BIM / Revit", level: "בינוני", count: 3 },
  { skill: "תכנון CNC", level: "מתקדם", count: 6 }, { skill: "ניהול פרויקטים", level: "בינוני", count: 4 },
  { skill: "אנליזת FEA", level: "בסיסי", count: 2 }, { skill: "תקינה ותקנים (ISO)", level: "מתקדם", count: 5 },
];
const training = [
  { topic: "BIM / Revit מתקדם", prio: "גבוהה", engs: 5, hrs: 40 },
  { topic: "אנליזת FEA", prio: "גבוהה", engs: 6, hrs: 32 },
  { topic: "תקן ISO 9001 עדכני", prio: "בינונית", engs: 8, hrs: 16 },
  { topic: "Python לאוטומציה הנדסית", prio: "בינונית", engs: 4, hrs: 24 },
  { topic: "ניהול פרויקטים PMP", prio: "נמוכה", engs: 3, hrs: 48 },
];

const TH = "p-2.5 text-right text-muted-foreground font-medium text-xs";
const TD = "p-2.5 text-sm";
const loadClr = (v: number) => v >= 95 ? "text-red-400" : v >= 85 ? "text-amber-400" : v >= 70 ? "text-green-400" : "text-blue-400";
const prioClr = (s: string) => s === "גבוהה" ? "bg-red-500/20 text-red-300" : s === "בינונית" ? "bg-amber-500/20 text-amber-300" : "bg-blue-500/20 text-blue-300";
const skillClr = (s: string) => s === "מתקדם" ? "bg-green-500/20 text-green-300" : s === "בינוני" ? "bg-amber-500/20 text-amber-300" : "bg-blue-500/20 text-blue-300";

export default function EngineeringAnalyticsPage() {
  const [tab, setTab] = useState("productivity");
  const [search, setSearch] = useState("");

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-cyan-400" />אנליטיקת מחלקת הנדסה
          </h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי | פרודוקטיביות, איכות, חדשנות וניצולת משאבים</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="חיפוש..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9 w-48 h-9 bg-card/60 border-border text-sm" />
          </div>
          <Button variant="outline" size="sm" className="gap-1 h-9"><Download className="h-4 w-4" />ייצוא</Button>
          <Badge className="bg-cyan-500/20 text-cyan-400 gap-1"><Calendar className="h-3 w-3" />אפריל 2026</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className="bg-card/80 border-border hover:border-border/80 transition-colors">
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

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-card/60 border border-border">
          <TabsTrigger value="productivity" className="gap-1 text-xs"><Users className="h-3.5 w-3.5" />פרודוקטיביות</TabsTrigger>
          <TabsTrigger value="quality" className="gap-1 text-xs"><Shield className="h-3.5 w-3.5" />איכות</TabsTrigger>
          <TabsTrigger value="innovation" className="gap-1 text-xs"><Lightbulb className="h-3.5 w-3.5" />חדשנות</TabsTrigger>
          <TabsTrigger value="resources" className="gap-1 text-xs"><BrainCircuit className="h-3.5 w-3.5" />ניצולת משאבים</TabsTrigger>
        </TabsList>

        {/* ═══ Productivity ═══ */}
        <TabsContent value="productivity" className="space-y-4 mt-4">
          <Card className="bg-card/60 border-border"><CardContent className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">מגמת פרודוקטיביות -- 6 חודשים</h3>
            <table className="w-full text-sm"><thead><tr className="border-b border-border/50">
              <th className={TH}>חודש</th><th className={TH}>שעות צוות</th><th className={TH}>תפוקה (שרטוטים)</th><th className={TH}>% השלמה</th><th className={TH}>מגמה</th>
            </tr></thead><tbody>
              {prodTrend.map((r, i) => (
                <tr key={r.m} className="border-b border-border/20 hover:bg-white/5">
                  <td className={`${TD} font-medium text-gray-200`}>{r.m}</td>
                  <td className={`${TD} text-center font-mono`}>{r.h.toLocaleString()}</td>
                  <td className={`${TD} text-center font-mono text-cyan-400`}>{r.o}</td>
                  <td className={`${TD} text-center`}><div className="flex items-center gap-2 justify-center"><Progress value={r.c} className="h-2 w-16" /><span className="text-xs text-gray-400">{r.c}%</span></div></td>
                  <td className={`${TD} text-center`}>{i > 0 && r.o > prodTrend[i-1].o ? <TrendingUp className="h-4 w-4 text-green-400 mx-auto" /> : i > 0 && r.o < prodTrend[i-1].o ? <TrendingDown className="h-4 w-4 text-red-400 mx-auto" /> : <Minus className="h-4 w-4 text-gray-400 mx-auto" />}</td>
                </tr>
              ))}
            </tbody></table>
          </CardContent></Card>
          <Card className="bg-card/60 border-border"><CardContent className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">ביצועי מהנדסים -- אפריל 2026</h3>
            <table className="w-full text-sm"><thead><tr className="border-b border-border/50">
              <th className={TH}>מהנדס</th><th className={TH}>התמחות</th><th className={TH}>שעות</th><th className={TH}>תפוקה</th><th className={TH}>% השלמה</th><th className={TH}>סטטוס</th>
            </tr></thead><tbody>
              {engineers.filter(e => !search || e.name.includes(search) || e.spec.includes(search)).map((e) => {
                const st = getSt(e.completion, 95);
                return (
                  <tr key={e.name} className="border-b border-border/20 hover:bg-white/5">
                    <td className={`${TD} font-medium text-gray-200`}>{e.name}</td>
                    <td className={`${TD} text-gray-400`}>{e.spec}</td>
                    <td className={`${TD} text-center font-mono`}>{e.hours}</td>
                    <td className={`${TD} text-center font-mono text-cyan-400`}>{e.output}</td>
                    <td className={`${TD} text-center`}><div className="flex items-center gap-2 justify-center"><Progress value={e.completion} className="h-2 w-14" /><span className="text-xs text-gray-400">{e.completion}%</span></div></td>
                    <td className={`${TD} text-center`}><Badge className={`${stMap[st].c} text-xs`}>{stMap[st].l}</Badge></td>
                  </tr>);
              })}
            </tbody></table>
          </CardContent></Card>
        </TabsContent>

        {/* ═══ Quality ═══ */}
        <TabsContent value="quality" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {qKpis.map((q) => {
              const st = getSt(q.val, q.target, !q.lb);
              const ach = q.lb ? Math.min((q.target / q.val) * 100, 120) : Math.min((q.val / q.target) * 100, 120);
              return (
                <Card key={q.label} className="bg-card/60 border-border"><CardContent className="p-4">
                  <p className="text-[11px] text-muted-foreground">{q.label}</p>
                  <p className="text-xl font-bold font-mono mt-1 text-foreground">{q.val}{q.unit && ` ${q.unit}`}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] text-gray-500">יעד: {q.target}{q.unit && ` ${q.unit}`}</span>
                    <Badge className={`${stMap[st].c} text-[10px]`}>{stMap[st].l}</Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-2"><Progress value={Math.min(ach, 100)} className="h-1.5 flex-1" /><span className="text-[10px] text-gray-400">{ach.toFixed(0)}%</span></div>
                </CardContent></Card>);
            })}
          </div>
          <Card className="bg-card/60 border-border"><CardContent className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">שגיאות -- בדיקה מול ייצור</h3>
            <table className="w-full text-sm"><thead><tr className="border-b border-border/50">
              <th className={TH}>סוג שגיאה</th><th className={TH}>נמצא בבדיקה</th><th className={TH}>נמצא בייצור</th><th className={TH}>יעד</th><th className={TH}>יעילות סינון</th>
            </tr></thead><tbody>
              {qualityData.map((q) => {
                const fr = q.review + q.prod > 0 ? (q.review / (q.review + q.prod)) * 100 : 0;
                return (
                  <tr key={q.metric} className="border-b border-border/20 hover:bg-white/5">
                    <td className={`${TD} font-medium text-gray-200`}>{q.metric}</td>
                    <td className={`${TD} text-center font-mono text-green-400`}>{q.review}</td>
                    <td className={`${TD} text-center font-mono text-red-400`}>{q.prod}</td>
                    <td className={`${TD} text-center text-gray-400`}>{q.target}</td>
                    <td className={`${TD} text-center`}><div className="flex items-center gap-2 justify-center"><Progress value={fr} className="h-2 w-16" /><span className="text-xs text-gray-400">{fr.toFixed(0)}%</span></div></td>
                  </tr>);
              })}
            </tbody></table>
          </CardContent></Card>
          <Card className="bg-card/60 border-border"><CardContent className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">מגמת איכות -- 6 חודשים</h3>
            <table className="w-full text-sm"><thead><tr className="border-b border-border/50">
              <th className={TH}>חודש</th><th className={TH}>% עיבוד חוזר</th><th className={TH}>% תקינות מעבר ראשון</th><th className={TH}>שגיאות / 100 שרטוטים</th>
            </tr></thead><tbody>
              {qTrend.map((r) => (
                <tr key={r.m} className="border-b border-border/20 hover:bg-white/5">
                  <td className={`${TD} font-medium text-gray-200`}>{r.m}</td>
                  <td className={`${TD} text-center font-mono ${r.rw <= 3.5 ? "text-green-400" : "text-amber-400"}`}>{pct(r.rw)}</td>
                  <td className={`${TD} text-center font-mono ${r.fpy >= 96 ? "text-green-400" : "text-amber-400"}`}>{pct(r.fpy)}</td>
                  <td className={`${TD} text-center font-mono ${r.er <= 2.5 ? "text-green-400" : "text-amber-400"}`}>{r.er.toFixed(1)}</td>
                </tr>))}
            </tbody></table>
          </CardContent></Card>
        </TabsContent>

        {/* ═══ Innovation ═══ */}
        <TabsContent value="innovation" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {innSummary.map((s) => (
              <Card key={s.label} className="bg-card/60 border-border"><CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10"><s.icon className="h-5 w-5 text-amber-400" /></div>
                <div><p className="text-[11px] text-muted-foreground">{s.label}</p><p className="text-lg font-bold font-mono text-foreground">{s.value}</p></div>
              </CardContent></Card>
            ))}
          </div>
          <Card className="bg-card/60 border-border"><CardContent className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">פרויקטי חדשנות ואופטימיזציה</h3>
            <table className="w-full text-sm"><thead><tr className="border-b border-border/50">
              <th className={TH}>שם הפרויקט</th><th className={TH}>סוג</th><th className={TH}>מהנדס אחראי</th><th className={TH}>חיסכון (₪)</th><th className={TH}>סטטוס</th>
            </tr></thead><tbody>
              {innovations.map((inn) => (
                <tr key={inn.name} className="border-b border-border/20 hover:bg-white/5">
                  <td className={`${TD} font-medium text-gray-200`}>{inn.name}</td>
                  <td className={`${TD} text-center`}><Badge className={inn.type === "מוצר חדש" ? "bg-purple-500/20 text-purple-300" : "bg-blue-500/20 text-blue-300"}>{inn.type}</Badge></td>
                  <td className={`${TD} text-center text-gray-300`}>{inn.eng}</td>
                  <td className={`${TD} text-center font-mono text-green-400`}>₪{inn.savings.toLocaleString()}</td>
                  <td className={`${TD} text-center`}><Badge className={inn.status === "הושלם" ? "bg-green-500/20 text-green-300" : "bg-amber-500/20 text-amber-300"}>{inn.status}</Badge></td>
                </tr>))}
            </tbody></table>
            <div className="mt-3 pt-3 border-t border-border/30 flex items-center justify-between text-xs text-muted-foreground">
              <span>סה"כ חיסכון שנתי: <span className="text-green-400 font-mono font-bold">₪284,000</span></span>
              <span>יעד שנתי: ₪300,000 | עמידה: <span className="text-amber-400 font-mono">94.7%</span></span>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* ═══ Resource Utilization ═══ */}
        <TabsContent value="resources" className="space-y-4 mt-4">
          <Card className="bg-card/60 border-border"><CardContent className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">חלוקת עומסים -- מהנדסים</h3>
            <table className="w-full text-sm"><thead><tr className="border-b border-border/50">
              <th className={TH}>מהנדס</th><th className={TH}>הקצאה</th><th className={TH}>פרויקטים</th><th className={TH}>שעות נוספות</th><th className={TH}>מצב</th>
            </tr></thead><tbody>
              {workload.map((w) => (
                <tr key={w.name} className="border-b border-border/20 hover:bg-white/5">
                  <td className={`${TD} font-medium text-gray-200`}>{w.name}</td>
                  <td className={TD}><div className="flex items-center gap-2"><Progress value={w.alloc} className="h-2 w-20" /><span className={`text-xs font-mono ${loadClr(w.alloc)}`}>{w.alloc}%</span></div></td>
                  <td className={`${TD} text-center font-mono`}>{w.proj}</td>
                  <td className={`${TD} text-center font-mono ${w.ot > 10 ? "text-red-400" : w.ot > 5 ? "text-amber-400" : "text-gray-400"}`}>{w.ot > 0 ? `${w.ot} שע'` : "—"}</td>
                  <td className={`${TD} text-center`}><Badge className={w.alloc >= 95 ? "bg-red-500/20 text-red-300" : w.alloc >= 85 ? "bg-amber-500/20 text-amber-300" : "bg-green-500/20 text-green-300"}>{w.alloc >= 95 ? "עומס יתר" : w.alloc >= 85 ? "עומס גבוה" : "תקין"}</Badge></td>
                </tr>))}
            </tbody></table>
            <div className="mt-3 pt-3 border-t border-border/30 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-400" />עומס יתר: 2</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-amber-400" />ממוצע הקצאה: 84.3%</span>
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-400" />שעות נוספות: 50 שע'</span>
            </div>
          </CardContent></Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-card/60 border-border"><CardContent className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">מטריצת מיומנויות</h3>
              <div className="space-y-2">
                {skillsMatrix.map((s) => (
                  <div key={s.skill} className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">{s.skill}</span>
                    <div className="flex items-center gap-2">
                      <Badge className={`${skillClr(s.level)} text-[10px]`}>{s.level}</Badge>
                      <span className="text-xs text-gray-500 font-mono w-16 text-left">{s.count} מהנדסים</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent></Card>
            <Card className="bg-card/60 border-border"><CardContent className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">צרכי הדרכה</h3>
              <table className="w-full text-sm"><thead><tr className="border-b border-border/50">
                <th className={TH}>נושא</th><th className={TH}>עדיפות</th><th className={TH}>משתתפים</th><th className={TH}>שעות</th>
              </tr></thead><tbody>
                {training.map((t) => (
                  <tr key={t.topic} className="border-b border-border/20 hover:bg-white/5">
                    <td className={`${TD} text-gray-200`}>{t.topic}</td>
                    <td className={`${TD} text-center`}><Badge className={`${prioClr(t.prio)} text-[10px]`}>{t.prio}</Badge></td>
                    <td className={`${TD} text-center font-mono`}>{t.engs}</td>
                    <td className={`${TD} text-center font-mono text-gray-400`}>{t.hrs}</td>
                  </tr>))}
              </tbody></table>
            </CardContent></Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Department Summary Footer ── */}
      <Card className="bg-card/40 border-border">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">ציון פרודוקטיביות</p>
              <p className="text-lg font-bold font-mono text-green-400 mt-1">92/100</p>
              <Progress value={92} className="h-1.5 mt-1" />
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">ציון איכות</p>
              <p className="text-lg font-bold font-mono text-cyan-400 mt-1">88/100</p>
              <Progress value={88} className="h-1.5 mt-1" />
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">ציון חדשנות</p>
              <p className="text-lg font-bold font-mono text-amber-400 mt-1">85/100</p>
              <Progress value={85} className="h-1.5 mt-1" />
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">ציון ניצולת משאבים</p>
              <p className="text-lg font-bold font-mono text-purple-400 mt-1">84/100</p>
              <Progress value={84} className="h-1.5 mt-1" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-border/30 text-center">
            <span className="text-xs text-muted-foreground">
              ציון כולל מחלקת הנדסה:
              <span className="text-foreground font-bold font-mono mx-1">87.3 / 100</span>
              --
              <Badge className="bg-green-500/20 text-green-400 text-[10px] mr-1">מגמת שיפור</Badge>
              עדכון אחרון: 08/04/2026
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
