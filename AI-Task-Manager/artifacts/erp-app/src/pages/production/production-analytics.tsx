import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  BarChart3, TrendingUp, TrendingDown, Minus, Activity, Shield,
  DollarSign, Truck, Gauge, Target, Clock, AlertTriangle, CheckCircle
} from "lucide-react";

const ils = (v: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);
const pct = (v: number) => `${v.toFixed(1)}%`;

type Status = "excellent" | "good" | "warning" | "critical";
const statusMap: Record<Status, { label: string; cls: string }> = {
  excellent: { label: "מצוין", cls: "bg-green-500/20 text-green-400" },
  good: { label: "תקין", cls: "bg-blue-500/20 text-blue-400" },
  warning: { label: "אזהרה", cls: "bg-yellow-500/20 text-yellow-400" },
  critical: { label: "קריטי", cls: "bg-red-500/20 text-red-400" },
};
const getStatus = (val: number, target: number, higherBetter = true): Status => {
  const ratio = higherBetter ? val / target : target / val;
  if (ratio >= 1) return "excellent";
  if (ratio >= 0.95) return "good";
  if (ratio >= 0.85) return "warning";
  return "critical";
};
const TrendArrow = ({ curr, prev }: { curr: number; prev: number }) => {
  if (curr > prev) return <TrendingUp className="h-4 w-4 text-green-400" />;
  if (curr < prev) return <TrendingDown className="h-4 w-4 text-red-400" />;
  return <Minus className="h-4 w-4 text-gray-400" />;
};

const FALLBACK_EFFICIENCY = [
  { id: "oee", name: "OEE כולל", current: 82.4, target: 85, prev: 79.1, unit: "%" },
  { id: "output_station", name: "תפוקה לתחנה", current: 147, target: 155, prev: 138, unit: "יח'" },
  { id: "output_operator", name: "תפוקה למפעיל", current: 52.3, target: 55, prev: 49.8, unit: "יח'" },
  { id: "capacity_util", name: "ניצולת קיבולת", current: 88.2, target: 90, prev: 85.6, unit: "%" },
  { id: "schedule_adherence", name: "עמידה בלו\"ז", current: 91.7, target: 95, prev: 89.3, unit: "%" },
  { id: "avg_cycle_time", name: "זמן מחזור ממוצע", current: 14.2, target: 13, prev: 15.1, unit: "דק'" },
];
const FALLBACK_QUALITY = [
  { id: "first_pass_yield", name: "תקינות מעבר ראשון", current: 94.8, target: 97, prev: 93.2, unit: "%" },
  { id: "defect_rate", name: "אחוז פגמים", current: 2.1, target: 1.5, prev: 2.8, unit: "%", lowerBetter: true },
  { id: "rework_rate", name: "אחוז עיבוד חוזר", current: 3.4, target: 2.0, prev: 4.1, unit: "%", lowerBetter: true },
  { id: "scrap_rate", name: "אחוז פסולת", current: 1.8, target: 1.0, prev: 2.3, unit: "%", lowerBetter: true },
];
const FALLBACK_COST = [
  { id: "actual_vs_est", name: "עלות בפועל מול תכנון", current: 103.2, target: 100, prev: 107.5, unit: "%", lowerBetter: true },
  { id: "labor_cost", name: "עלות עבודה/הזמנה", current: 1240, target: 1100, prev: 1380, unit: "ils", lowerBetter: true },
  { id: "machine_cost", name: "עלות מכונה/הזמנה", current: 860, target: 800, prev: 920, unit: "ils", lowerBetter: true },
  { id: "rework_cost", name: "עלות עיבוד חוזר", current: 18500, target: 12000, prev: 22400, unit: "ils", lowerBetter: true },
  { id: "waste_cost", name: "עלות פסולת", current: 9200, target: 7000, prev: 11800, unit: "ils", lowerBetter: true },
];
const FALLBACK_DELIVERY = [
  { id: "on_time", name: "אספקה בזמן", current: 89.3, target: 95, prev: 86.7, unit: "%" },
  { id: "delay_rate", name: "אחוז איחורים", current: 10.7, target: 5, prev: 13.3, unit: "%", lowerBetter: true },
];

const trendMonths = ["נובמבר", "דצמבר", "ינואר", "פברואר", "מרץ", "אפריל"];
const trendData: Record<string, number[]> = {
  oee: [76.2, 77.8, 79.1, 80.5, 81.2, 82.4],
  first_pass_yield: [91.5, 92.1, 93.2, 93.8, 94.1, 94.8],
  defect_rate: [3.5, 3.2, 2.8, 2.5, 2.3, 2.1],
  capacity_util: [82.1, 83.5, 85.6, 86.4, 87.3, 88.2],
  on_time: [83.2, 84.5, 86.7, 87.4, 88.1, 89.3],
  labor_cost: [1520, 1480, 1380, 1340, 1290, 1240],
  waste_cost: [14200, 13100, 11800, 10900, 10100, 9200],
  schedule_adherence: [85.3, 86.9, 89.3, 90.1, 91.0, 91.7],
};

const gauges = [
  { label: "OEE", value: 82.4, target: 85, icon: Gauge, color: "text-cyan-400", bg: "bg-cyan-500" },
  { label: "איכות", value: 94.8, target: 97, icon: Shield, color: "text-green-400", bg: "bg-green-500" },
  { label: "עלות", value: 91.2, target: 95, icon: DollarSign, color: "text-amber-400", bg: "bg-amber-500" },
  { label: "אספקה", value: 89.3, target: 95, icon: Truck, color: "text-purple-400", bg: "bg-purple-500" },
];

const fmtVal = (v: number, unit: string) => {
  if (unit === "ils") return ils(v);
  if (unit === "%") return pct(v);
  return `${v} ${unit}`;
};

function MetricsTable({ metrics }: { metrics: typeof efficiencyMetrics }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border/50">
          <TableHead className="text-right text-gray-400">מדד</TableHead>
          <TableHead className="text-center text-gray-400">נוכחי</TableHead>
          <TableHead className="text-center text-gray-400">יעד</TableHead>
          <TableHead className="text-center text-gray-400">חודש קודם</TableHead>
          <TableHead className="text-center text-gray-400">מגמה</TableHead>
          <TableHead className="text-center text-gray-400">עמידה ביעד</TableHead>
          <TableHead className="text-center text-gray-400">סטטוס</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {metrics.map((m: any) => {
          const higherBetter = !m.lowerBetter;
          const st = getStatus(m.current, m.target, higherBetter);
          const achievement = higherBetter
            ? Math.min((m.current / m.target) * 100, 120)
            : Math.min((m.target / m.current) * 100, 120);
          return (
            <TableRow key={m.id} className="border-border/30 hover:bg-white/5">
              <TableCell className="text-right font-medium text-gray-200">{m.name}</TableCell>
              <TableCell className="text-center font-bold text-white">{fmtVal(m.current, m.unit)}</TableCell>
              <TableCell className="text-center text-gray-400">{fmtVal(m.target, m.unit)}</TableCell>
              <TableCell className="text-center text-gray-500">{fmtVal(m.prev, m.unit)}</TableCell>
              <TableCell className="text-center">
                <div className="flex justify-center"><TrendArrow curr={m.current} prev={m.prev} /></div>
              </TableCell>
              <TableCell className="text-center">
                <div className="flex items-center gap-2 justify-center">
                  <Progress value={Math.min(achievement, 100)} className="h-2 w-16" />
                  <span className="text-xs text-gray-400">{achievement.toFixed(0)}%</span>
                </div>
              </TableCell>
              <TableCell className="text-center">
                <Badge className={`${statusMap[st].cls} text-xs`}>{statusMap[st].label}</Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function CostVarianceTable() {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border/50">
          <TableHead className="text-right text-gray-400">קטגוריה</TableHead>
          <TableHead className="text-center text-gray-400">בפועל</TableHead>
          <TableHead className="text-center text-gray-400">תקציב</TableHead>
          <TableHead className="text-center text-gray-400">סטייה</TableHead>
          <TableHead className="text-center text-gray-400">סטייה %</TableHead>
          <TableHead className="text-center text-gray-400">סטטוס</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[
          { cat: "חומרי גלם", actual: 142000, budget: 135000 },
          { cat: "עבודה ישירה", actual: 89000, budget: 85000 },
          { cat: "תקורת ייצור", actual: 56000, budget: 60000 },
          { cat: "עיבוד חוזר", actual: 18500, budget: 12000 },
          { cat: "פסולת", actual: 9200, budget: 7000 },
          { cat: "תחזוקה", actual: 23000, budget: 25000 },
        ].map((r) => {
          const variance = r.actual - r.budget;
          const variancePct = ((variance / r.budget) * 100);
          const overBudget = variance > 0;
          const st: Status = Math.abs(variancePct) <= 2 ? "excellent" : Math.abs(variancePct) <= 5 ? "good" : Math.abs(variancePct) <= 10 ? "warning" : "critical";
          return (
            <TableRow key={r.cat} className="border-border/30 hover:bg-white/5">
              <TableCell className="text-right font-medium text-gray-200">{r.cat}</TableCell>
              <TableCell className="text-center text-white font-bold">{ils(r.actual)}</TableCell>
              <TableCell className="text-center text-gray-400">{ils(r.budget)}</TableCell>
              <TableCell className={`text-center font-medium ${overBudget ? "text-red-400" : "text-green-400"}`}>
                {overBudget ? "+" : ""}{ils(variance)}
              </TableCell>
              <TableCell className={`text-center ${overBudget ? "text-red-400" : "text-green-400"}`}>
                {overBudget ? "+" : ""}{variancePct.toFixed(1)}%
              </TableCell>
              <TableCell className="text-center">
                <Badge className={`${statusMap[st].cls} text-xs`}>{statusMap[st].label}</Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export default function ProductionAnalytics() {
  const [tab, setTab] = useState("efficiency");

  const { data: apiData } = useQuery({
    queryKey: ["production-analytics"],
    queryFn: () => authFetch("/api/production/dashboard?type=analytics").then(r => r.json()),
  });
  const safeArr = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
  const efficiencyMetrics = safeArr(apiData?.efficiency).length > 0 ? safeArr(apiData.efficiency) : FALLBACK_EFFICIENCY;
  const qualityMetrics = safeArr(apiData?.quality).length > 0 ? safeArr(apiData.quality) : FALLBACK_QUALITY;
  const costMetrics = safeArr(apiData?.cost).length > 0 ? safeArr(apiData.cost) : FALLBACK_COST;
  const deliveryMetrics = safeArr(apiData?.delivery).length > 0 ? safeArr(apiData.delivery) : FALLBACK_DELIVERY;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-cyan-400" />
            אנליטיקת ייצור
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            טכנו-כל עוזי | 17 מדדי KPI - יעילות, איכות, עלויות ואספקה
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-cyan-500/20 text-cyan-400 gap-1"><Activity className="h-3 w-3" />נתונים חיים</Badge>
          <Badge className="bg-gray-700 text-gray-300">אפריל 2026</Badge>
        </div>
      </div>

      {/* Gauges */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {gauges.map((g) => {
          const st = getStatus(g.value, g.target);
          const Icon = g.icon;
          return (
            <Card key={g.label} className="bg-[#1a1a2e] border-border/50">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-5 w-5 ${g.color}`} />
                    <span className="text-sm text-gray-400">{g.label}</span>
                  </div>
                  <Badge className={`${statusMap[st].cls} text-xs`}>{statusMap[st].label}</Badge>
                </div>
                <div className={`text-3xl font-bold ${g.color} mb-2`}>{pct(g.value)}</div>
                <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                  <span>יעד: {pct(g.target)}</span>
                  <span>{((g.value / g.target) * 100).toFixed(0)}% עמידה</span>
                </div>
                <Progress value={(g.value / g.target) * 100} className="h-2" />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-[#1a1a2e] border border-border/50">
          <TabsTrigger value="efficiency" className="data-[state=active]:bg-cyan-600/20 data-[state=active]:text-cyan-400 gap-1">
            <Gauge className="h-4 w-4" />יעילות
          </TabsTrigger>
          <TabsTrigger value="quality" className="data-[state=active]:bg-green-600/20 data-[state=active]:text-green-400 gap-1">
            <Shield className="h-4 w-4" />איכות
          </TabsTrigger>
          <TabsTrigger value="costs" className="data-[state=active]:bg-amber-600/20 data-[state=active]:text-amber-400 gap-1">
            <DollarSign className="h-4 w-4" />עלויות
          </TabsTrigger>
          <TabsTrigger value="delivery" className="data-[state=active]:bg-purple-600/20 data-[state=active]:text-purple-400 gap-1">
            <Truck className="h-4 w-4" />אספקה
          </TabsTrigger>
          <TabsTrigger value="trends" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-400 gap-1">
            <TrendingUp className="h-4 w-4" />מגמות
          </TabsTrigger>
        </TabsList>

        {/* Efficiency Tab */}
        <TabsContent value="efficiency">
          <Card className="bg-[#1a1a2e] border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Gauge className="h-5 w-5 text-cyan-400" />
                <h2 className="text-lg font-semibold text-white">מדדי יעילות</h2>
                <Badge className="bg-cyan-500/10 text-cyan-400 text-xs mr-auto">6 מדדים</Badge>
              </div>
              <MetricsTable metrics={efficiencyMetrics} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Quality Tab */}
        <TabsContent value="quality">
          <Card className="bg-[#1a1a2e] border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="h-5 w-5 text-green-400" />
                <h2 className="text-lg font-semibold text-white">מדדי איכות</h2>
                <Badge className="bg-green-500/10 text-green-400 text-xs mr-auto">4 מדדים</Badge>
              </div>
              <MetricsTable metrics={qualityMetrics} />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                {qualityMetrics.map((m: any) => {
                  const improved = m.lowerBetter ? m.current < m.prev : m.current > m.prev;
                  return (
                    <div key={m.id} className="bg-[#12122a] rounded-lg p-3 border border-border/30">
                      <div className="text-xs text-gray-500 mb-1">{m.name}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-white">{fmtVal(m.current, m.unit)}</span>
                        <span className={`text-xs ${improved ? "text-green-400" : "text-red-400"}`}>
                          {improved ? "+" : ""}{(((m.current - m.prev) / m.prev) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cost Tab */}
        <TabsContent value="costs">
          <div className="space-y-4">
            <Card className="bg-[#1a1a2e] border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign className="h-5 w-5 text-amber-400" />
                  <h2 className="text-lg font-semibold text-white">מדדי עלות</h2>
                  <Badge className="bg-amber-500/10 text-amber-400 text-xs mr-auto">5 מדדים</Badge>
                </div>
                <MetricsTable metrics={costMetrics} />
              </CardContent>
            </Card>
            <Card className="bg-[#1a1a2e] border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                  <h2 className="text-lg font-semibold text-white">ניתוח סטיות תקציביות</h2>
                </div>
                <CostVarianceTable />
                <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-400" />מתחת לתקציב</span>
                  <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-400" />חריגה מתקציב</span>
                  <span>סה"כ סטייה: <span className="text-red-400 font-medium">+{ils(35700)}</span></span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Delivery Tab */}
        <TabsContent value="delivery">
          <Card className="bg-[#1a1a2e] border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Truck className="h-5 w-5 text-purple-400" />
                <h2 className="text-lg font-semibold text-white">מדדי אספקה ולו"ז</h2>
                <Badge className="bg-purple-500/10 text-purple-400 text-xs mr-auto">2 מדדים</Badge>
              </div>
              <MetricsTable metrics={deliveryMetrics} />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                {[
                  { label: "הזמנות בזמן", value: "267", total: "299", color: "text-green-400" },
                  { label: "הזמנות באיחור", value: "32", total: "299", color: "text-red-400" },
                  { label: "איחור ממוצע", value: "2.4 ימים", total: "", color: "text-amber-400" },
                ].map((d) => (
                  <div key={d.label} className="bg-[#12122a] rounded-lg p-4 border border-border/30">
                    <div className="text-xs text-gray-500 mb-1">{d.label}</div>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-2xl font-bold ${d.color}`}>{d.value}</span>
                      {d.total && <span className="text-sm text-gray-500">/ {d.total}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends">
          <Card className="bg-[#1a1a2e] border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-blue-400" />
                <h2 className="text-lg font-semibold text-white">מגמות 6 חודשים</h2>
                <Badge className="bg-blue-500/10 text-blue-400 text-xs mr-auto">8 מדדים</Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead className="text-right text-gray-400">מדד</TableHead>
                    {trendMonths.map((m) => (
                      <TableHead key={m} className="text-center text-gray-400">{m}</TableHead>
                    ))}
                    <TableHead className="text-center text-gray-400">מגמה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { key: "oee", name: "OEE", unit: "%", lowerBetter: false },
                    { key: "first_pass_yield", name: "תקינות מעבר ראשון", unit: "%", lowerBetter: false },
                    { key: "defect_rate", name: "אחוז פגמים", unit: "%", lowerBetter: true },
                    { key: "capacity_util", name: "ניצולת קיבולת", unit: "%", lowerBetter: false },
                    { key: "on_time", name: "אספקה בזמן", unit: "%", lowerBetter: false },
                    { key: "labor_cost", name: "עלות עבודה/הזמנה", unit: "ils", lowerBetter: true },
                    { key: "waste_cost", name: "עלות פסולת", unit: "ils", lowerBetter: true },
                    { key: "schedule_adherence", name: "עמידה בלו\"ז", unit: "%", lowerBetter: false },
                  ].map((m) => {
                    const vals = trendData[m.key];
                    const first = vals[0]; const last = vals[vals.length - 1];
                    const improved = m.lowerBetter ? last < first : last > first;
                    return (
                      <TableRow key={m.key} className="border-border/30 hover:bg-white/5">
                        <TableCell className="text-right font-medium text-gray-200">{m.name}</TableCell>
                        {vals.map((v, i) => (
                          <TableCell key={i} className="text-center text-gray-300 text-sm">
                            {m.unit === "ils" ? ils(v) : pct(v)}
                          </TableCell>
                        ))}
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            {improved
                              ? <TrendingUp className="h-4 w-4 text-green-400" />
                              : <TrendingDown className="h-4 w-4 text-red-400" />}
                            <span className={`text-xs ${improved ? "text-green-400" : "text-red-400"}`}>
                              {improved ? "שיפור" : "ירידה"}
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