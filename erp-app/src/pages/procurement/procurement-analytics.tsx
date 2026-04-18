import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import {
  PieChart, TrendingUp, TrendingDown, DollarSign, Clock, Target,
  BarChart3, Truck, ArrowUpRight, ArrowDownRight, Minus
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";

const API = "/api";

const fmt = (v: number) => new Intl.NumberFormat("he-IL").format(v);
const fmtCur = (v: number) => "₪" + new Intl.NumberFormat("he-IL").format(v);

const TrendIcon = ({ val }: { val: number }) =>
  val > 0 ? <ArrowUpRight className="w-4 h-4 text-red-400" /> :
  val < 0 ? <ArrowDownRight className="w-4 h-4 text-emerald-400" /> :
  <Minus className="w-4 h-4 text-gray-400" />;

const FALLBACK_SUPPLIER_SPENDING = [
  { name: "אלומיניום ישראל בע\"מ", total: 2_847_500, pct: 28.2, orders: 142, avg: 20_053, trend: 5.2 },
  { name: "מתכות הגליל", total: 1_635_000, pct: 16.2, orders: 89, avg: 18_371, trend: -2.1 },
  { name: "זכוכית השרון", total: 1_290_400, pct: 12.8, orders: 67, avg: 19_260, trend: 8.4 },
  { name: "פלדת עוזי", total: 985_200, pct: 9.8, orders: 54, avg: 18_244, trend: -0.5 },
  { name: "ברגים ומחברים מרכז", total: 742_300, pct: 7.4, orders: 198, avg: 3_749, trend: 1.8 },
  { name: "חומרי איטום דרום", total: 610_800, pct: 6.1, orders: 45, avg: 13_573, trend: -3.6 },
  { name: "צבעים תעשייתיים ת\"א", total: 498_600, pct: 4.9, orders: 38, avg: 13_121, trend: 12.1 },
  { name: "ציוד בטיחות אופק", total: 435_200, pct: 4.3, orders: 72, avg: 6_044, trend: 0.0 },
];

const FALLBACK_COST_TREND = [
  { month: "נובמבר 2025", materials: 620_400, services: 185_200, equipment: 94_300, total: 899_900, change: -1.2 },
  { month: "דצמבר 2025", materials: 710_800, services: 192_600, equipment: 112_500, total: 1_015_900, change: 12.9 },
  { month: "ינואר 2026", materials: 685_300, services: 178_400, equipment: 88_700, total: 952_400, change: -6.3 },
  { month: "פברואר 2026", materials: 740_200, services: 201_300, equipment: 105_600, total: 1_047_100, change: 9.9 },
  { month: "מרץ 2026", materials: 695_100, services: 189_800, equipment: 97_200, total: 982_100, change: -6.2 },
  { month: "אפריל 2026", materials: 758_400, services: 210_500, equipment: 118_900, total: 1_087_800, change: 10.8 },
];

const FALLBACK_EFFICIENCY_METRICS = [
  { category: "אלומיניום גולמי", cycleTime: 4.2, approvalTime: 1.1, deliveryAccuracy: 96.5, onBudget: 92.3 },
  { category: "זכוכית מחוסמת", cycleTime: 6.8, approvalTime: 1.5, deliveryAccuracy: 89.2, onBudget: 87.1 },
  { category: "פרופילי מתכת", cycleTime: 3.5, approvalTime: 0.8, deliveryAccuracy: 97.8, onBudget: 95.4 },
  { category: "חומרי צביעה", cycleTime: 2.1, approvalTime: 0.5, deliveryAccuracy: 99.1, onBudget: 98.2 },
  { category: "אטמים ובידוד", cycleTime: 5.4, approvalTime: 1.3, deliveryAccuracy: 91.7, onBudget: 88.9 },
  { category: "ברגים ומחברים", cycleTime: 1.8, approvalTime: 0.3, deliveryAccuracy: 99.5, onBudget: 97.8 },
  { category: "ציוד בטיחות", cycleTime: 7.2, approvalTime: 2.1, deliveryAccuracy: 85.3, onBudget: 82.6 },
  { category: "אריזה ומשלוח", cycleTime: 2.9, approvalTime: 0.6, deliveryAccuracy: 94.8, onBudget: 93.1 },
];

const FALLBACK_QUARTER_COMPARISON = [
  { metric: "סה\"כ הוצאות רכש", q1: 2_874_500, q2: 3_117_900, change: 8.5 },
  { metric: "מספר הזמנות רכש", q1: 387, q2: 418, change: 8.0 },
  { metric: "ממוצע הזמנה", q1: 7_428, q2: 7_459, change: 0.4 },
  { metric: "זמן מחזור ממוצע (ימים)", q1: 4.8, q2: 4.2, change: -12.5 },
  { metric: "דיוק אספקה %", q1: 91.2, q2: 94.6, change: 3.7 },
  { metric: "חיסכון מול תקציב %", q1: 6.8, q2: 8.4, change: 23.5 },
  { metric: "ספקים פעילים", q1: 24, q2: 27, change: 12.5 },
  { metric: "החזרות וזיכויים", q1: 42_600, q2: 31_200, change: -26.8 },
];

const kpis = [
  { label: "הוצאות מצטבר YTD", value: fmtCur(10_095_000), icon: DollarSign, color: "from-blue-600 to-blue-800" },
  { label: "ממוצע הזמנה", value: fmtCur(7_459), icon: BarChart3, color: "from-purple-600 to-purple-800" },
  { label: "חיסכון עלויות", value: "8.4%", icon: TrendingDown, color: "from-emerald-600 to-emerald-800" },
  { label: "ספק מוביל - הוצאות", value: fmtCur(2_847_500), icon: Truck, color: "from-amber-600 to-amber-800" },
  { label: "זמן מחזור ממוצע", value: "4.2 ימים", icon: Clock, color: "from-cyan-600 to-cyan-800" },
  { label: "ציון יעילות רכש", value: "87.3", icon: Target, color: "from-pink-600 to-pink-800" },
];

export default function ProcurementAnalytics() {
  const [activeTab, setActiveTab] = useState("spending");

  const { data: apiData } = useQuery({
    queryKey: ["procurement-analytics"],
    queryFn: async () => {
      const res = await authFetch(`${API}/procurement/analytics`);
      if (!res.ok) throw new Error("Failed to fetch procurement analytics");
      return res.json();
    },
  });

  const supplierSpending = apiData?.supplierSpending ?? FALLBACK_SUPPLIER_SPENDING;
  const costTrend = apiData?.costTrend ?? FALLBACK_COST_TREND;
  const efficiencyMetrics = apiData?.efficiencyMetrics ?? FALLBACK_EFFICIENCY_METRICS;
  const quarterComparison = apiData?.quarterComparison ?? FALLBACK_QUARTER_COMPARISON;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <PieChart className="w-7 h-7 text-blue-400" />
        <h1 className="text-2xl font-bold text-foreground">אנליטיקת רכש</h1>
        <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-xs">טכנו-כל עוזי</Badge>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map((k, i) => (
          <div key={i} className={`rounded-xl bg-gradient-to-br ${k.color} p-4 border border-white/10`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-foreground/70">{k.label}</div>
                <div className="text-lg font-bold text-foreground mt-1">{k.value}</div>
              </div>
              <k.icon className="w-7 h-7 text-foreground/30" />
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/60">
          <TabsTrigger value="spending">הוצאות לפי ספק</TabsTrigger>
          <TabsTrigger value="trend">מגמת עלויות</TabsTrigger>
          <TabsTrigger value="efficiency">ביצועי רכש</TabsTrigger>
          <TabsTrigger value="compare">השוואה</TabsTrigger>
        </TabsList>

        {/* Tab 1: Spending by Supplier */}
        <TabsContent value="spending">
          <Card className="border-border/50 bg-muted/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-blue-400" />
                הוצאות לפי ספק — מצטבר שנתי
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="text-right font-semibold text-gray-300">ספק</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">סה״כ הוצאות</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">% מסה״כ</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">הזמנות</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">ממוצע הזמנה</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">מגמה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supplierSpending.map((s, i) => (
                    <TableRow key={i} className="hover:bg-muted/30">
                      <TableCell className="font-medium text-foreground">{s.name}</TableCell>
                      <TableCell className="text-gray-200">{fmtCur(s.total)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={s.pct} className="h-2 w-20" />
                          <span className="text-xs text-gray-400">{s.pct}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-300">{fmt(s.orders)}</TableCell>
                      <TableCell className="text-gray-300">{fmtCur(s.avg)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <TrendIcon val={s.trend} />
                          <span className={`text-xs ${s.trend > 0 ? "text-red-400" : s.trend < 0 ? "text-emerald-400" : "text-gray-400"}`}>
                            {s.trend > 0 ? "+" : ""}{s.trend}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Cost Trend */}
        <TabsContent value="trend">
          <Card className="border-border/50 bg-muted/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                מגמת עלויות — 6 חודשים אחרונים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="text-right font-semibold text-gray-300">חודש</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">חומרי גלם</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">שירותים</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">ציוד</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">סה״כ</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">שינוי %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costTrend.map((row, i) => (
                    <TableRow key={i} className="hover:bg-muted/30">
                      <TableCell className="font-medium text-foreground">{row.month}</TableCell>
                      <TableCell className="text-gray-300">{fmtCur(row.materials)}</TableCell>
                      <TableCell className="text-gray-300">{fmtCur(row.services)}</TableCell>
                      <TableCell className="text-gray-300">{fmtCur(row.equipment)}</TableCell>
                      <TableCell className="text-gray-200 font-semibold">{fmtCur(row.total)}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs border ${
                          row.change > 0
                            ? "bg-red-500/20 text-red-400 border-red-500/30"
                            : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                        }`}>
                          {row.change > 0 ? "+" : ""}{row.change}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Procurement Efficiency */}
        <TabsContent value="efficiency">
          <Card className="border-border/50 bg-muted/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="w-5 h-5 text-purple-400" />
                ביצועי רכש לפי קטגוריה
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="text-right font-semibold text-gray-300">קטגוריה</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">זמן מחזור (ימים)</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">זמן אישור (ימים)</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">דיוק אספקה %</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">עמידה בתקציב %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {efficiencyMetrics.map((row, i) => (
                    <TableRow key={i} className="hover:bg-muted/30">
                      <TableCell className="font-medium text-foreground">{row.category}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-200">{row.cycleTime}</span>
                          <Badge className={`text-xs border ${
                            row.cycleTime <= 3 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                            row.cycleTime <= 5 ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
                            "bg-red-500/20 text-red-400 border-red-500/30"
                          }`}>
                            {row.cycleTime <= 3 ? "מהיר" : row.cycleTime <= 5 ? "סביר" : "איטי"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-300">{row.approvalTime}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={row.deliveryAccuracy} className="h-2 w-16" />
                          <span className={`text-xs ${row.deliveryAccuracy >= 95 ? "text-emerald-400" : row.deliveryAccuracy >= 90 ? "text-yellow-400" : "text-red-400"}`}>
                            {row.deliveryAccuracy}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={row.onBudget} className="h-2 w-16" />
                          <span className={`text-xs ${row.onBudget >= 95 ? "text-emerald-400" : row.onBudget >= 90 ? "text-yellow-400" : "text-red-400"}`}>
                            {row.onBudget}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Quarter Comparison */}
        <TabsContent value="compare">
          <Card className="border-border/50 bg-muted/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-amber-400" />
                השוואת רבעונים — Q1 מול Q2 2026
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="text-right font-semibold text-gray-300">מדד</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">Q1 2026</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">Q2 2026</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">שינוי %</TableHead>
                    <TableHead className="text-right font-semibold text-gray-300">מגמה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quarterComparison.map((row, i) => {
                    const isMonetary = row.q1 > 1000;
                    const fmtVal = (v: number) => isMonetary ? fmtCur(v) : fmt(v);
                    const positive = row.metric.includes("חיסכון") || row.metric.includes("דיוק") ? row.change > 0 :
                                     row.metric.includes("זמן") || row.metric.includes("החזרות") ? row.change < 0 :
                                     row.change < 0;
                    return (
                      <TableRow key={i} className="hover:bg-muted/30">
                        <TableCell className="font-medium text-foreground">{row.metric}</TableCell>
                        <TableCell className="text-gray-300">{fmtVal(row.q1)}</TableCell>
                        <TableCell className="text-gray-200 font-semibold">{fmtVal(row.q2)}</TableCell>
                        <TableCell>
                          <Badge className={`text-xs border ${
                            positive
                              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                              : "bg-red-500/20 text-red-400 border-red-500/30"
                          }`}>
                            {row.change > 0 ? "+" : ""}{row.change}%
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {positive
                              ? <TrendingUp className="w-4 h-4 text-emerald-400" />
                              : <TrendingDown className="w-4 h-4 text-red-400" />}
                            <span className={`text-xs ${positive ? "text-emerald-400" : "text-red-400"}`}>
                              {positive ? "שיפור" : "הרעה"}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
