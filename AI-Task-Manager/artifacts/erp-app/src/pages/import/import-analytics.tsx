import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  BarChart3, DollarSign, TrendingUp, TrendingDown, Globe, Ship,
  ShieldAlert, Clock, Users, ArrowLeftRight, Target, AlertTriangle,
  Truck, Package, Percent, CalendarClock
} from "lucide-react";

// ── 1. Spend by supplier ─────────────────────────────────────────────
const spendBySupplier = [
  { supplier: "Zhongshan Glass Ltd.", country: "סין", spend: "$312,000", pct: 28, trend: "+12%", up: true },
  { supplier: "Schüco International KG", country: "גרמניה", spend: "$248,000", pct: 22, trend: "+5%", up: true },
  { supplier: "Alumil S.A.", country: "טורקיה", spend: "$195,000", pct: 17, trend: "-3%", up: false },
  { supplier: "Vitrum SpA", country: "איטליה", spend: "$164,000", pct: 15, trend: "+8%", up: true },
  { supplier: "AGC Glass Europe", country: "בלגיה", spend: "$135,000", pct: 12, trend: "+2%", up: true },
  { supplier: "Vidrio España S.L.", country: "ספרד", spend: "$67,000", pct: 6, trend: "-7%", up: false },
];

// ── 2. Spend by country ──────────────────────────────────────────────
const spendByCountry = [
  { country: "סין", flag: "\u{1F1E8}\u{1F1F3}", spend: "$312,000", orders: 14, avgLead: "32 יום" },
  { country: "גרמניה", flag: "\u{1F1E9}\u{1F1EA}", spend: "$248,000", orders: 8, avgLead: "18 יום" },
  { country: "טורקיה", flag: "\u{1F1F9}\u{1F1F7}", spend: "$195,000", orders: 11, avgLead: "14 יום" },
  { country: "איטליה", flag: "\u{1F1EE}\u{1F1F9}", spend: "$164,000", orders: 6, avgLead: "21 יום" },
  { country: "בלגיה", flag: "\u{1F1E7}\u{1F1EA}", spend: "$135,000", orders: 5, avgLead: "19 יום" },
  { country: "ספרד", flag: "\u{1F1EA}\u{1F1F8}", spend: "$67,000", orders: 3, avgLead: "16 יום" },
];

// ── 3. Landed cost trend ─────────────────────────────────────────────
const landedCostTrend = [
  { month: "נוב 2025", total: "₪1,850K", freight: "₪185K", customs: "₪148K", insurance: "₪37K", overhead: "₪92K" },
  { month: "דצמ 2025", total: "₪2,010K", freight: "₪201K", customs: "₪161K", insurance: "₪40K", overhead: "₪100K" },
  { month: "ינו 2026", total: "₪1,920K", freight: "₪192K", customs: "₪154K", insurance: "₪38K", overhead: "₪96K" },
  { month: "פבר 2026", total: "₪2,150K", freight: "₪215K", customs: "₪172K", insurance: "₪43K", overhead: "₪108K" },
  { month: "מרץ 2026", total: "₪2,080K", freight: "₪208K", customs: "₪166K", insurance: "₪42K", overhead: "₪104K" },
  { month: "אפר 2026", total: "₪2,100K", freight: "₪210K", customs: "₪168K", insurance: "₪42K", overhead: "₪105K" },
];

// ── 4. Freight trend ─────────────────────────────────────────────────
const freightTrend = [
  { route: "סין → אשדוד (ימי)", q1: "$4,200/TEU", q2: "$4,800/TEU", change: "+14%", up: true },
  { route: "גרמניה → חיפה (אווירי)", q1: "$8.50/kg", q2: "$9.20/kg", change: "+8%", up: true },
  { route: "טורקיה → אשדוד (ימי)", q1: "$1,800/TEU", q2: "$1,650/TEU", change: "-8%", up: false },
  { route: "איטליה → חיפה (יבשתי)", q1: "$3,200/משלוח", q2: "$3,400/משלוח", change: "+6%", up: true },
  { route: "בלגיה → אשדוד (ימי)", q1: "$3,600/TEU", q2: "$3,750/TEU", change: "+4%", up: true },
];

// ── 5. Customs analysis ──────────────────────────────────────────────
const customsAnalysis = [
  { category: "זכוכית שטוחה", hsCode: "7005.29", dutyRate: "8%", totalDuty: "₪86,400", exemptions: "הסכם EU" },
  { category: "פרופילי אלומיניום", hsCode: "7604.29", dutyRate: "6%", totalDuty: "₪62,100", exemptions: "—" },
  { category: "חומרי אטימה", hsCode: "3214.10", dutyRate: "12%", totalDuty: "₪18,700", exemptions: "—" },
  { category: "ברגים וחיבורים", hsCode: "7318.15", dutyRate: "4%", totalDuty: "₪8,200", exemptions: "הסכם טורקיה" },
  { category: "ציפויים", hsCode: "3208.90", dutyRate: "10%", totalDuty: "₪12,300", exemptions: "—" },
];

// ── 6. Delay analysis ────────────────────────────────────────────────
const delayAnalysis = [
  { cause: "עיכוב בנמל מוצא", count: 7, avgDays: 4.2, impact: "₪38,500" },
  { cause: "מסמכים חסרים/שגויים", count: 5, avgDays: 3.1, impact: "₪24,000" },
  { cause: "בדיקת מכס ישראל", count: 4, avgDays: 2.8, impact: "₪19,200" },
  { cause: "עיכוב ספק", count: 3, avgDays: 6.5, impact: "₪42,000" },
  { cause: "גודש בנמל יעד", count: 2, avgDays: 1.5, impact: "₪8,400" },
];

// ── 7. Supplier performance ──────────────────────────────────────────
const supplierPerformance = [
  { supplier: "Zhongshan Glass Ltd.", onTime: 82, quality: 94, docAccuracy: 88, score: 88, grade: "A-" },
  { supplier: "Schüco International KG", onTime: 96, quality: 99, docAccuracy: 97, score: 97, grade: "A+" },
  { supplier: "Alumil S.A.", onTime: 90, quality: 91, docAccuracy: 85, score: 89, grade: "A-" },
  { supplier: "Vitrum SpA", onTime: 75, quality: 93, docAccuracy: 80, score: 83, grade: "B+" },
  { supplier: "AGC Glass Europe", onTime: 92, quality: 97, docAccuracy: 94, score: 94, grade: "A" },
  { supplier: "Vidrio España S.L.", onTime: 88, quality: 90, docAccuracy: 82, score: 87, grade: "B+" },
];

// ── 8. Cycle time ────────────────────────────────────────────────────
const cycleTime = [
  { stage: "הזמנה → יציאה מספק", avg: "8.2 ימים", best: "5 ימים", worst: "14 ימים" },
  { stage: "מעבר ימי/אווירי", avg: "18.5 ימים", best: "4 ימים", worst: "35 ימים" },
  { stage: "הגעה → שחרור מכס", avg: "3.1 ימים", best: "1 יום", worst: "7 ימים" },
  { stage: "שחרור → קבלה למחסן", avg: "1.4 ימים", best: "0.5 יום", worst: "3 ימים" },
  { stage: "סה\"כ Lead Time", avg: "31.2 ימים", best: "12 ימים", worst: "52 ימים" },
];

// ── 9. Actual vs estimated ───────────────────────────────────────────
const actualVsEstimated = [
  { order: "PO-5498", estimated: "$65,000", actual: "$67,200", diff: "+$2,200", pct: "+3.4%", over: true },
  { order: "PO-5497", estimated: "$33,700", actual: "$32,900", diff: "-$800", pct: "-2.4%", over: false },
  { order: "PO-5494", estimated: "$91,000", actual: "$98,500", diff: "+$7,500", pct: "+8.2%", over: true },
  { order: "PO-5490", estimated: "$48,200", actual: "$47,800", diff: "-$400", pct: "-0.8%", over: false },
  { order: "PO-5488", estimated: "$128,000", actual: "$135,600", diff: "+$7,600", pct: "+5.9%", over: true },
];

// ── 10. Profitability impact ─────────────────────────────────────────
const profitabilityImpact = [
  { product: "חלון אלומיניום 160x120", importCost: "₪1,250", landedCost: "₪1,680", salePrice: "₪2,800", margin: "40%" },
  { product: "דלת זכוכית מחוסמת", importCost: "₪2,800", landedCost: "₪3,640", salePrice: "₪5,900", margin: "38%" },
  { product: "ויטרינה קבועה 200x250", importCost: "₪3,400", landedCost: "₪4,420", salePrice: "₪7,200", margin: "39%" },
  { product: "תריס אלומיניום חשמלי", importCost: "₪890", landedCost: "₪1,160", salePrice: "₪2,100", margin: "45%" },
  { product: "מעקה זכוכית 100ס\"מ", importCost: "₪1,100", landedCost: "₪1,430", salePrice: "₪2,400", margin: "40%" },
];

const gradeColor = (g: string) => {
  if (g.startsWith("A+")) return "text-emerald-300 bg-emerald-500/20 border-emerald-500/30";
  if (g.startsWith("A")) return "text-green-300 bg-green-500/20 border-green-500/30";
  if (g.startsWith("B")) return "text-yellow-300 bg-yellow-500/20 border-yellow-500/30";
  return "text-red-300 bg-red-500/20 border-red-500/30";
};

export default function ImportAnalytics() {
  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-violet-500/10">
          <BarChart3 className="h-6 w-6 text-violet-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">אנליטיקת יבוא</h1>
          <p className="text-slate-400 text-sm">טכנו-כל עוזי — 10 דוחות ניתוח יבוא מתקדמים</p>
        </div>
      </div>

      {/* ── KPI row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {[
          { label: "סה\"כ הוצאות יבוא", value: "$1.12M", icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: "Landed Cost ממוצע", value: "130%", icon: Percent, color: "text-purple-400", bg: "bg-purple-500/10" },
          { label: "עיכובים ממוצעים", value: "3.4 ימים", icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
          { label: "ציון ספקים ממוצע", value: "90/100", icon: Target, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "מרווח ממוצע", value: "40.4%", icon: TrendingUp, color: "text-cyan-400", bg: "bg-cyan-500/10" },
        ].map((k, i) => (
          <Card key={i} className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${k.bg}`}>
                <k.icon className={`h-5 w-5 ${k.color}`} />
              </div>
              <div>
                <p className="text-xs text-slate-400">{k.label}</p>
                <p className="text-lg font-bold text-white">{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Tabs ────────────────────────────────────────────────── */}
      <Tabs defaultValue="spend" className="space-y-4">
        <TabsList className="bg-slate-800/50 border border-slate-700">
          <TabsTrigger value="spend" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300">
            <DollarSign className="h-4 w-4 ml-1" /> הוצאות
          </TabsTrigger>
          <TabsTrigger value="trends" className="data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-300">
            <TrendingUp className="h-4 w-4 ml-1" /> מגמות
          </TabsTrigger>
          <TabsTrigger value="performance" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300">
            <Users className="h-4 w-4 ml-1" /> ביצועים
          </TabsTrigger>
          <TabsTrigger value="comparison" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-300">
            <ArrowLeftRight className="h-4 w-4 ml-1" /> השוואה
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Spend ──────────────────────────────────────── */}
        <TabsContent value="spend" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Spend by supplier */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-3"><CardTitle className="text-white text-sm flex items-center gap-2"><Package className="h-4 w-4 text-blue-400" /> הוצאות לפי ספק</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow className="border-slate-700"><TableHead className="text-slate-400 text-right">ספק</TableHead><TableHead className="text-slate-400 text-right">מדינה</TableHead><TableHead className="text-slate-400 text-right">הוצאה</TableHead><TableHead className="text-slate-400 text-right">%</TableHead><TableHead className="text-slate-400 text-right">מגמה</TableHead></TableRow></TableHeader>
                  <TableBody>{spendBySupplier.map((r, i) => (
                    <TableRow key={i} className="border-slate-700/50"><TableCell className="text-slate-300 text-sm">{r.supplier}</TableCell><TableCell className="text-slate-400 text-sm">{r.country}</TableCell><TableCell className="text-white font-semibold">{r.spend}</TableCell><TableCell><Progress value={r.pct} className="h-2 w-16" /></TableCell><TableCell className={r.up ? "text-red-400" : "text-emerald-400"}>{r.trend}</TableCell></TableRow>
                  ))}</TableBody>
                </Table>
              </CardContent>
            </Card>
            {/* Spend by country */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-3"><CardTitle className="text-white text-sm flex items-center gap-2"><Globe className="h-4 w-4 text-teal-400" /> הוצאות לפי מדינה</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow className="border-slate-700"><TableHead className="text-slate-400 text-right">מדינה</TableHead><TableHead className="text-slate-400 text-right">הוצאה</TableHead><TableHead className="text-slate-400 text-right">הזמנות</TableHead><TableHead className="text-slate-400 text-right">Lead Time ממוצע</TableHead></TableRow></TableHeader>
                  <TableBody>{spendByCountry.map((r, i) => (
                    <TableRow key={i} className="border-slate-700/50"><TableCell className="text-slate-300">{r.flag} {r.country}</TableCell><TableCell className="text-white font-semibold">{r.spend}</TableCell><TableCell className="text-slate-300">{r.orders}</TableCell><TableCell className="text-slate-400">{r.avgLead}</TableCell></TableRow>
                  ))}</TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
          {/* Customs analysis */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3"><CardTitle className="text-white text-sm flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-amber-400" /> ניתוח מכס לפי קטגוריה</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow className="border-slate-700"><TableHead className="text-slate-400 text-right">קטגוריה</TableHead><TableHead className="text-slate-400 text-right">קוד HS</TableHead><TableHead className="text-slate-400 text-right">שיעור מכס</TableHead><TableHead className="text-slate-400 text-right">סה\"כ מכס</TableHead><TableHead className="text-slate-400 text-right">פטורים</TableHead></TableRow></TableHeader>
                <TableBody>{customsAnalysis.map((r, i) => (
                  <TableRow key={i} className="border-slate-700/50"><TableCell className="text-slate-300">{r.category}</TableCell><TableCell className="text-blue-400 font-mono text-sm">{r.hsCode}</TableCell><TableCell className="text-amber-300">{r.dutyRate}</TableCell><TableCell className="text-white font-semibold">{r.totalDuty}</TableCell><TableCell className="text-slate-400">{r.exemptions}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Trends ─────────────────────────────────────── */}
        <TabsContent value="trends" className="space-y-4">
          {/* Landed cost trend */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3"><CardTitle className="text-white text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-purple-400" /> מגמת Landed Cost (6 חודשים)</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow className="border-slate-700"><TableHead className="text-slate-400 text-right">חודש</TableHead><TableHead className="text-slate-400 text-right">סה\"כ</TableHead><TableHead className="text-slate-400 text-right">הובלה</TableHead><TableHead className="text-slate-400 text-right">מכס</TableHead><TableHead className="text-slate-400 text-right">ביטוח</TableHead><TableHead className="text-slate-400 text-right">תקורה</TableHead></TableRow></TableHeader>
                <TableBody>{landedCostTrend.map((r, i) => (
                  <TableRow key={i} className="border-slate-700/50"><TableCell className="text-slate-300">{r.month}</TableCell><TableCell className="text-white font-bold">{r.total}</TableCell><TableCell className="text-cyan-400">{r.freight}</TableCell><TableCell className="text-amber-400">{r.customs}</TableCell><TableCell className="text-blue-400">{r.insurance}</TableCell><TableCell className="text-slate-400">{r.overhead}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Freight trend */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-3"><CardTitle className="text-white text-sm flex items-center gap-2"><Ship className="h-4 w-4 text-cyan-400" /> מגמת עלויות הובלה</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow className="border-slate-700"><TableHead className="text-slate-400 text-right">מסלול</TableHead><TableHead className="text-slate-400 text-right">Q1</TableHead><TableHead className="text-slate-400 text-right">Q2</TableHead><TableHead className="text-slate-400 text-right">שינוי</TableHead></TableRow></TableHeader>
                  <TableBody>{freightTrend.map((r, i) => (
                    <TableRow key={i} className="border-slate-700/50"><TableCell className="text-slate-300 text-sm">{r.route}</TableCell><TableCell className="text-slate-400">{r.q1}</TableCell><TableCell className="text-white">{r.q2}</TableCell><TableCell className={r.up ? "text-red-400" : "text-emerald-400"}>{r.change}</TableCell></TableRow>
                  ))}</TableBody>
                </Table>
              </CardContent>
            </Card>
            {/* Delay analysis */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-3"><CardTitle className="text-white text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-400" /> ניתוח עיכובים</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow className="border-slate-700"><TableHead className="text-slate-400 text-right">סיבה</TableHead><TableHead className="text-slate-400 text-right">מקרים</TableHead><TableHead className="text-slate-400 text-right">ממוצע ימים</TableHead><TableHead className="text-slate-400 text-right">עלות</TableHead></TableRow></TableHeader>
                  <TableBody>{delayAnalysis.map((r, i) => (
                    <TableRow key={i} className="border-slate-700/50"><TableCell className="text-slate-300">{r.cause}</TableCell><TableCell className="text-white">{r.count}</TableCell><TableCell className="text-amber-300">{r.avgDays}</TableCell><TableCell className="text-red-400">{r.impact}</TableCell></TableRow>
                  ))}</TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Tab: Performance ────────────────────────────────── */}
        <TabsContent value="performance" className="space-y-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3"><CardTitle className="text-white text-sm flex items-center gap-2"><Users className="h-4 w-4 text-blue-400" /> ביצועי ספקים</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow className="border-slate-700"><TableHead className="text-slate-400 text-right">ספק</TableHead><TableHead className="text-slate-400 text-right">עמידה בזמנים</TableHead><TableHead className="text-slate-400 text-right">איכות</TableHead><TableHead className="text-slate-400 text-right">דיוק מסמכים</TableHead><TableHead className="text-slate-400 text-right">ציון</TableHead><TableHead className="text-slate-400 text-right">דירוג</TableHead></TableRow></TableHeader>
                <TableBody>{supplierPerformance.map((r, i) => (
                  <TableRow key={i} className="border-slate-700/50">
                    <TableCell className="text-slate-300">{r.supplier}</TableCell>
                    <TableCell><div className="flex items-center gap-2"><Progress value={r.onTime} className="h-2 w-16" /><span className="text-slate-400 text-sm">{r.onTime}%</span></div></TableCell>
                    <TableCell><div className="flex items-center gap-2"><Progress value={r.quality} className="h-2 w-16" /><span className="text-slate-400 text-sm">{r.quality}%</span></div></TableCell>
                    <TableCell><div className="flex items-center gap-2"><Progress value={r.docAccuracy} className="h-2 w-16" /><span className="text-slate-400 text-sm">{r.docAccuracy}%</span></div></TableCell>
                    <TableCell className="text-white font-bold">{r.score}</TableCell>
                    <TableCell><Badge className={gradeColor(r.grade)}>{r.grade}</Badge></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </CardContent>
          </Card>
          {/* Cycle time */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3"><CardTitle className="text-white text-sm flex items-center gap-2"><CalendarClock className="h-4 w-4 text-indigo-400" /> זמני מחזור יבוא</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow className="border-slate-700"><TableHead className="text-slate-400 text-right">שלב</TableHead><TableHead className="text-slate-400 text-right">ממוצע</TableHead><TableHead className="text-slate-400 text-right">מיטבי</TableHead><TableHead className="text-slate-400 text-right">גרוע ביותר</TableHead></TableRow></TableHeader>
                <TableBody>{cycleTime.map((r, i) => (
                  <TableRow key={i} className={`border-slate-700/50 ${i === cycleTime.length - 1 ? "bg-slate-700/30 font-bold" : ""}`}><TableCell className="text-slate-300">{r.stage}</TableCell><TableCell className="text-white">{r.avg}</TableCell><TableCell className="text-emerald-400">{r.best}</TableCell><TableCell className="text-red-400">{r.worst}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Comparison ─────────────────────────────────── */}
        <TabsContent value="comparison" className="space-y-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3"><CardTitle className="text-white text-sm flex items-center gap-2"><ArrowLeftRight className="h-4 w-4 text-amber-400" /> בפועל מול אומדן — Landed Cost</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow className="border-slate-700"><TableHead className="text-slate-400 text-right">הזמנה</TableHead><TableHead className="text-slate-400 text-right">אומדן</TableHead><TableHead className="text-slate-400 text-right">בפועל</TableHead><TableHead className="text-slate-400 text-right">הפרש</TableHead><TableHead className="text-slate-400 text-right">% סטייה</TableHead></TableRow></TableHeader>
                <TableBody>{actualVsEstimated.map((r, i) => (
                  <TableRow key={i} className="border-slate-700/50"><TableCell className="text-blue-400 font-mono">{r.order}</TableCell><TableCell className="text-slate-300">{r.estimated}</TableCell><TableCell className="text-white font-semibold">{r.actual}</TableCell><TableCell className={r.over ? "text-red-400" : "text-emerald-400"}>{r.diff}</TableCell><TableCell className={r.over ? "text-red-400" : "text-emerald-400"}>{r.pct}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            </CardContent>
          </Card>
          {/* Profitability impact */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3"><CardTitle className="text-white text-sm flex items-center gap-2"><Target className="h-4 w-4 text-green-400" /> השפעת עלות יבוא על רווחיות</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow className="border-slate-700"><TableHead className="text-slate-400 text-right">מוצר</TableHead><TableHead className="text-slate-400 text-right">עלות יבוא</TableHead><TableHead className="text-slate-400 text-right">Landed Cost</TableHead><TableHead className="text-slate-400 text-right">מחיר מכירה</TableHead><TableHead className="text-slate-400 text-right">מרווח</TableHead></TableRow></TableHeader>
                <TableBody>{profitabilityImpact.map((r, i) => (
                  <TableRow key={i} className="border-slate-700/50"><TableCell className="text-slate-300">{r.product}</TableCell><TableCell className="text-slate-400">{r.importCost}</TableCell><TableCell className="text-amber-300">{r.landedCost}</TableCell><TableCell className="text-white font-semibold">{r.salePrice}</TableCell><TableCell className="text-emerald-400 font-bold">{r.margin}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
