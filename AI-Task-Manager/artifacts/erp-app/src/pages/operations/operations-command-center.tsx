import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Gauge, Clock, AlertTriangle, TrendingUp, Factory, Timer,
  CheckCircle, Package, Zap, DollarSign, Users, BarChart3
} from "lucide-react";

const fmt = (v: number) => new Intl.NumberFormat("he-IL").format(v);
const fmtCurrency = (v: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);

const kpis = [
  { label: "OEE כולל", value: "84.2%", delta: "+1.8%", trend: "up", icon: Gauge, color: "text-emerald-400" },
  { label: "השבתה %", value: "6.3%", delta: "-0.5%", trend: "up", icon: Clock, color: "text-amber-400" },
  { label: "אספקה בזמן", value: "93.7%", delta: "+2.1%", trend: "up", icon: CheckCircle, color: "text-emerald-400" },
  { label: "איכות", value: "98.6%", delta: "+0.3%", trend: "up", icon: TrendingUp, color: "text-emerald-400" },
  { label: "תפוקה / שעה", value: "127", delta: "+8", trend: "up", icon: Zap, color: "text-blue-400" },
  { label: "Cycle Time", value: "4.7 דק׳", delta: "-0.2", trend: "up", icon: Timer, color: "text-purple-400" },
];

const productionLines = [
  { name: "קו A — אלומיניום פרופילים", status: "פעיל", oee: 91, throughput: 142, uptime: 97.2, defects: 0.4, shift: "בוקר", operator: "יוסי כהן" },
  { name: "קו B — זכוכית מחוסמת", status: "פעיל", oee: 86, throughput: 118, uptime: 93.5, defects: 0.9, shift: "בוקר", operator: "דוד לוי" },
  { name: "קו C — ריתוך ברזל", status: "אזהרה", oee: 72, throughput: 95, uptime: 84.1, defects: 2.1, shift: "בוקר", operator: "משה אברהם" },
  { name: "קו D — הרכבה וגימור", status: "פעיל", oee: 88, throughput: 134, uptime: 95.8, defects: 0.6, shift: "בוקר", operator: "אילן פרץ" },
  { name: "קו E — חיתוך CNC", status: "מושבת", oee: 0, throughput: 0, uptime: 0, defects: 0, shift: "תחזוקה", operator: "—" },
];

const costData = [
  { product: "פרופיל Pro-X 100mm", material: 28.50, labor: 12.40, overhead: 8.20, total: 49.10, target: 47.00, variance: 4.5 },
  { product: "זכוכית מחוסמת 8mm", material: 85.00, labor: 22.30, overhead: 15.60, total: 122.90, target: 120.00, variance: 2.4 },
  { product: "מסגרת ברזל דגם B", material: 42.00, labor: 35.80, overhead: 18.50, total: 96.30, target: 90.00, variance: 7.0 },
  { product: "חלון Premium 1.2x1.5", material: 156.00, labor: 68.40, overhead: 32.00, total: 256.40, target: 250.00, variance: 2.6 },
  { product: "דלת הזזה 2.4m", material: 210.00, labor: 95.00, overhead: 45.00, total: 350.00, target: 340.00, variance: 2.9 },
];

const bottlenecks = [
  { station: "תחנת ריתוך #3", line: "קו C", waitTime: 18, impact: "גבוה", cause: "מכונה ישנה — מהירות מופחתת ב-30%", lostUnits: 42, recommendation: "החלפת ראש ריתוך / שדרוג מכונה" },
  { station: "תחנת חיתוך CNC", line: "קו E", waitTime: 0, impact: "קריטי", cause: "תקלה במנוע ציר Y — ממתין לחלק חילוף", lostUnits: 280, recommendation: "הזמנת חלק דחופה (ETA 2 ימים)" },
  { station: "אזור אריזה", line: "קו D", waitTime: 12, impact: "בינוני", cause: "מחסור בכוח אדם — חסר עובד אחד", lostUnits: 18, recommendation: "גיוס עובד זמני / שעות נוספות" },
  { station: "תנור חיסום", line: "קו B", waitTime: 8, impact: "נמוך", cause: "זמן חימום ראשוני ארוך בתחילת משמרת", lostUnits: 6, recommendation: "הפעלה אוטומטית 30 דק׳ לפני משמרת" },
];

const shiftData = [
  { shift: "בוקר (06:00–14:00)", manager: "רונן שמעוני", oee: 87.5, output: 580, target: 600, quality: 99.1, incidents: 1, downtime: 22 },
  { shift: "צהריים (14:00–22:00)", manager: "אבי גולדשטיין", oee: 82.3, output: 520, target: 580, quality: 98.4, incidents: 2, downtime: 38 },
  { shift: "לילה (22:00–06:00)", manager: "סרגיי קוזלוב", oee: 76.8, output: 410, target: 500, quality: 97.8, incidents: 0, downtime: 55 },
];

const statusBadge = (status: string) => {
  if (status === "פעיל") return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[9px]">פעיל</Badge>;
  if (status === "אזהרה") return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[9px]">אזהרה</Badge>;
  return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[9px]">מושבת</Badge>;
};

const impactBadge = (impact: string) => {
  if (impact === "קריטי") return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[9px]">קריטי</Badge>;
  if (impact === "גבוה") return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[9px]">גבוה</Badge>;
  if (impact === "בינוני") return <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30 text-[9px]">בינוני</Badge>;
  return <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30 text-[9px]">נמוך</Badge>;
};

export default function OperationsCommandCenter() {
  return (
    <div className="p-6 space-y-5 bg-slate-900 min-h-screen" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Factory className="h-7 w-7 text-blue-400" /> מרכז פיקוד תפעול
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">טכנו-כל עוזי — OEE | קווי ייצור | עלויות | צווארי בקבוק | משמרות</p>
        </div>
        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs px-3 py-1">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1.5 animate-pulse" /> מערכת פעילה
        </Badge>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-6 gap-3">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className="bg-slate-800/50 border-slate-700">
              <CardContent className="pt-3 pb-2.5 px-3">
                <div className="flex items-center justify-between mb-1">
                  <Icon className={`h-4 w-4 ${kpi.color}`} />
                  <span className={`text-[10px] font-mono ${kpi.trend === "up" ? "text-emerald-400" : "text-red-400"}`}>
                    {kpi.delta}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">{kpi.label}</p>
                <p className={`text-lg font-bold font-mono text-white`}>{kpi.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="lines">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl bg-slate-800/80 border border-slate-700">
          <TabsTrigger value="lines" className="text-xs gap-1 text-slate-300 data-[state=active]:text-white"><Factory className="h-3.5 w-3.5" /> קווי ייצור</TabsTrigger>
          <TabsTrigger value="costs" className="text-xs gap-1 text-slate-300 data-[state=active]:text-white"><DollarSign className="h-3.5 w-3.5" /> עלויות</TabsTrigger>
          <TabsTrigger value="bottlenecks" className="text-xs gap-1 text-slate-300 data-[state=active]:text-white"><AlertTriangle className="h-3.5 w-3.5" /> צווארי בקבוק</TabsTrigger>
          <TabsTrigger value="shifts" className="text-xs gap-1 text-slate-300 data-[state=active]:text-white"><Users className="h-3.5 w-3.5" /> משמרות</TabsTrigger>
        </TabsList>

        {/* Production Lines */}
        <TabsContent value="lines">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-white">סטטוס קווי ייצור — זמן אמת</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">קו ייצור</TableHead>
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">סטטוס</TableHead>
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">OEE</TableHead>
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">תפוקה / שעה</TableHead>
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">Uptime</TableHead>
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">פחת %</TableHead>
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">משמרת</TableHead>
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">מפעיל</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productionLines.map((line, i) => (
                    <TableRow key={i} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="text-xs text-white font-medium">{line.name}</TableCell>
                      <TableCell>{statusBadge(line.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={line.oee} className={`h-2 w-14 bg-slate-700 ${line.oee >= 85 ? "[&>div]:bg-emerald-500" : line.oee >= 75 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500"}`} />
                          <span className={`font-mono text-[10px] ${line.oee >= 85 ? "text-emerald-400" : line.oee >= 75 ? "text-amber-400" : "text-red-400"}`}>{line.oee}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-slate-300">{fmt(line.throughput)}</TableCell>
                      <TableCell className={`font-mono text-[10px] ${line.uptime >= 95 ? "text-emerald-400" : "text-amber-400"}`}>{line.uptime}%</TableCell>
                      <TableCell className={`font-mono text-[10px] ${line.defects <= 1 ? "text-emerald-400" : "text-red-400"}`}>{line.defects}%</TableCell>
                      <TableCell className="text-[10px] text-slate-300">{line.shift}</TableCell>
                      <TableCell className="text-[10px] text-slate-300">{line.operator}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cost per Unit */}
        <TabsContent value="costs">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-white">ניתוח עלות ליחידה — מוצרים עיקריים</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">מוצר</TableHead>
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">חומר גלם</TableHead>
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">עבודה</TableHead>
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">תקורה</TableHead>
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">סה״כ ליח׳</TableHead>
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">יעד</TableHead>
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">סטייה %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costData.map((item, i) => (
                    <TableRow key={i} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="text-xs text-white font-medium">{item.product}</TableCell>
                      <TableCell className="font-mono text-[10px] text-slate-300">{fmtCurrency(item.material)}</TableCell>
                      <TableCell className="font-mono text-[10px] text-slate-300">{fmtCurrency(item.labor)}</TableCell>
                      <TableCell className="font-mono text-[10px] text-slate-300">{fmtCurrency(item.overhead)}</TableCell>
                      <TableCell className="font-mono text-[10px] text-white font-bold">{fmtCurrency(item.total)}</TableCell>
                      <TableCell className="font-mono text-[10px] text-slate-400">{fmtCurrency(item.target)}</TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] font-mono ${item.variance <= 3 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : item.variance <= 5 ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>
                          +{item.variance}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bottlenecks */}
        <TabsContent value="bottlenecks">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-white">מעקב צווארי בקבוק — ניתוח השפעה</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">תחנה</TableHead>
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">קו</TableHead>
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">המתנה (דק׳)</TableHead>
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">השפעה</TableHead>
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">סיבה</TableHead>
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">יח׳ אבודות</TableHead>
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">המלצה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bottlenecks.map((b, i) => (
                    <TableRow key={i} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="text-xs text-white font-medium">{b.station}</TableCell>
                      <TableCell className="text-[10px] text-slate-300">{b.line}</TableCell>
                      <TableCell className={`font-mono text-[10px] ${b.waitTime >= 15 ? "text-red-400" : b.waitTime >= 8 ? "text-amber-400" : "text-slate-300"}`}>{fmt(b.waitTime)}</TableCell>
                      <TableCell>{impactBadge(b.impact)}</TableCell>
                      <TableCell className="text-[10px] text-slate-300 max-w-48 truncate">{b.cause}</TableCell>
                      <TableCell className="font-mono text-[10px] text-red-400">{fmt(b.lostUnits)}</TableCell>
                      <TableCell className="text-[10px] text-blue-400 max-w-40 truncate">{b.recommendation}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Shifts */}
        <TabsContent value="shifts">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-white">ביצועי משמרות — סיכום יומי</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">משמרת</TableHead>
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">מנהל</TableHead>
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">OEE</TableHead>
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">תפוקה / יעד</TableHead>
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">איכות</TableHead>
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">תקריות</TableHead>
                    <TableHead className="text-right text-[10px] text-slate-400 font-semibold">השבתה (דק׳)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shiftData.map((s, i) => (
                    <TableRow key={i} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="text-xs text-white font-medium">{s.shift}</TableCell>
                      <TableCell className="text-[10px] text-slate-300">{s.manager}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={s.oee} className={`h-2 w-14 bg-slate-700 ${s.oee >= 85 ? "[&>div]:bg-emerald-500" : s.oee >= 75 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500"}`} />
                          <span className={`font-mono text-[10px] ${s.oee >= 85 ? "text-emerald-400" : s.oee >= 75 ? "text-amber-400" : "text-red-400"}`}>{s.oee}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-slate-300">{fmt(s.output)} / {fmt(s.target)}</TableCell>
                      <TableCell className={`font-mono text-[10px] ${s.quality >= 99 ? "text-emerald-400" : s.quality >= 98 ? "text-amber-400" : "text-red-400"}`}>{s.quality}%</TableCell>
                      <TableCell className={`font-mono text-[10px] ${s.incidents === 0 ? "text-emerald-400" : "text-amber-400"}`}>{s.incidents}</TableCell>
                      <TableCell className={`font-mono text-[10px] ${s.downtime <= 30 ? "text-emerald-400" : s.downtime <= 45 ? "text-amber-400" : "text-red-400"}`}>{s.downtime}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
