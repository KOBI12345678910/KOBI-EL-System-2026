import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import {
  TrendingUp, TrendingDown, Target, BarChart3, Activity,
  DollarSign, AlertTriangle, CheckCircle, Clock, Zap,
  ArrowUpRight, ArrowDownRight, Brain, Shield, Sigma,
  Gauge, Eye, RefreshCw, Layers, Calendar
} from "lucide-react";
import { authFetch } from "@/lib/utils";

// ============================================================
// FORECAST DATA
// ============================================================
const FALLBACK_MONTHLY_FORECAST = [
  { month: "אפריל 26", bestCase: 620000, expected: 485000, worstCase: 320000, actual: null, riskAdjusted: 445000, confidence: 0.88 },
  { month: "מאי 26", bestCase: 750000, expected: 580000, worstCase: 380000, actual: null, riskAdjusted: 528000, confidence: 0.82 },
  { month: "יוני 26", bestCase: 680000, expected: 520000, worstCase: 340000, actual: null, riskAdjusted: 475000, confidence: 0.78 },
  { month: "יולי 26", bestCase: 580000, expected: 420000, worstCase: 250000, actual: null, riskAdjusted: 378000, confidence: 0.72 },
  { month: "אוגוסט 26", bestCase: 550000, expected: 400000, worstCase: 220000, actual: null, riskAdjusted: 356000, confidence: 0.68 },
  { month: "ספטמבר 26", bestCase: 720000, expected: 540000, worstCase: 310000, actual: null, riskAdjusted: 486000, confidence: 0.65 },
];

const FALLBACK_HISTORICAL_ACCURACY = [
  { period: "ינואר 26", predicted: 420000, actual: 445000, error: 5.6, withinBand: true },
  { period: "פברואר 26", predicted: 380000, actual: 365000, error: -4.1, withinBand: true },
  { period: "מרץ 26", predicted: 510000, actual: 485000, error: -4.9, withinBand: true },
];

const FALLBACK_PIPELINE_SCENARIOS = {
  committed: { value: 1680000, deals: 3, label: "מחויב (P>80%)", color: "bg-emerald-500" },
  likely: { value: 1470000, deals: 4, label: "סביר (P 50-80%)", color: "bg-blue-500" },
  upside: { value: 1520000, deals: 3, label: "אפשרי (P 20-50%)", color: "bg-amber-500" },
  longShot: { value: 1200000, deals: 2, label: "סיכוי נמוך (P<20%)", color: "bg-gray-400" },
};

const FALLBACK_CHURN_PREDICTIONS = [
  { customer: "סופרגז אנרגיה", probability: 0.92, ltvAtRisk: 380000, signals: ["חוב 115 ימים", "אין תקשורת 90 ימים", "health=5"], preventionAction: "גבייה משפטית" },
  { customer: "רשת פתאל", probability: 0.80, ltvAtRisk: 550000, signals: ["הפסדנו עסקה למתחרה", "health=15"], preventionAction: "פגישת הנהלה + הצעה משופרת" },
  { customer: "עיריית חולון", probability: 0.45, ltvAtRisk: 650000, signals: ["אין פעילות 60 ימים", "איחור תשלום 92 ימים"], preventionAction: "פגישת חידוש קשר" },
];

const FALLBACK_GROWTH_PROJECTIONS = [
  { customer: "קבוצת אלון", currentRevenue: 485000, projected12m: 1450000, growth: 199, drivers: ["מגדל B ₪850K", "שדרוג חלונות ₪120K", "חוזה שנתי"] },
  { customer: "אמות השקעות", currentRevenue: 210000, projected12m: 680000, growth: 224, drivers: ["משרדי הרצליה ₪480K", "פרויקטים חדשים"] },
  { customer: "BIG מרכזי קניות", currentRevenue: 0, projected12m: 400000, growth: 999, drivers: ["ליד חדש ₪1.2M", "P(Close)=25%", "weighted=₪300K"] },
];

const FALLBACK_AGENT_FORECASTS = [
  { agent: "דני כהן", committed: 680000, pipeline: 1850000, weighted: 885000, target: 1500000, coverageRatio: 1.23, onTrack: true },
  { agent: "מיכל לוי", committed: 320000, pipeline: 1040000, weighted: 465000, target: 1200000, coverageRatio: 0.87, onTrack: false },
  { agent: "יוסי אברהם", committed: 112000, pipeline: 560000, weighted: 198000, target: 800000, coverageRatio: 0.70, onTrack: false },
];

const fmt = (v: number) => v >= 1000000 ? `₪${(v / 1000000).toFixed(2)}M` : v >= 1000 ? `₪${(v / 1000).toFixed(0)}K` : `₪${v}`;

export default function PredictiveForecasting() {
  const { data: apiForecast } = useQuery<{
    monthlyForecast: typeof FALLBACK_MONTHLY_FORECAST;
    historicalAccuracy: typeof FALLBACK_HISTORICAL_ACCURACY;
    pipelineScenarios: typeof FALLBACK_PIPELINE_SCENARIOS;
    churnPredictions: typeof FALLBACK_CHURN_PREDICTIONS;
    growthProjections: typeof FALLBACK_GROWTH_PROJECTIONS;
    agentForecasts: typeof FALLBACK_AGENT_FORECASTS;
  }>({
    queryKey: ["crm-predictive-forecasting"],
    queryFn: async () => { const res = await authFetch("/api/crm/forecasting"); if (!res.ok) throw new Error("API error"); return res.json(); },
  });
  const monthlyForecast = apiForecast?.monthlyForecast ?? FALLBACK_MONTHLY_FORECAST;
  const historicalAccuracy = apiForecast?.historicalAccuracy ?? FALLBACK_HISTORICAL_ACCURACY;
  const pipelineScenarios = apiForecast?.pipelineScenarios ?? FALLBACK_PIPELINE_SCENARIOS;
  const churnPredictions = apiForecast?.churnPredictions ?? FALLBACK_CHURN_PREDICTIONS;
  const growthProjections = apiForecast?.growthProjections ?? FALLBACK_GROWTH_PROJECTIONS;
  const agentForecasts = apiForecast?.agentForecasts ?? FALLBACK_AGENT_FORECASTS;

  const totalBest = monthlyForecast.reduce((s, m) => s + m.bestCase, 0);
  const totalExpected = monthlyForecast.reduce((s, m) => s + m.expected, 0);
  const totalWorst = monthlyForecast.reduce((s, m) => s + m.worstCase, 0);
  const totalRiskAdj = monthlyForecast.reduce((s, m) => s + m.riskAdjusted, 0);
  const avgConfidence = monthlyForecast.reduce((s, m) => s + m.confidence, 0) / monthlyForecast.length;
  const avgAccuracy = historicalAccuracy.reduce((s, h) => s + Math.abs(h.error), 0) / historicalAccuracy.length;
  const churnAtRisk = churnPredictions.reduce((s, c) => s + c.ltvAtRisk * c.probability, 0);

  const [confidenceAdj, setConfidenceAdj] = useState([80]);

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="h-7 w-7 text-primary" /> Predictive Forecasting
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            6 מודלים חיזוי | 3 תרחישים | Risk-Adjusted | Churn | Growth | Backtesting
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            Accuracy: ±{avgAccuracy.toFixed(1)}%
          </Badge>
          <Button variant="outline" size="sm"><RefreshCw className="h-3.5 w-3.5 ml-1" /> Reforecast</Button>
        </div>
      </div>

      {/* Scenario KPIs */}
      <div className="grid grid-cols-6 gap-2">
        {[
          { label: "Best Case (6M)", value: fmt(totalBest), color: "text-emerald-600", bg: "bg-emerald-50", icon: TrendingUp },
          { label: "Expected (6M)", value: fmt(totalExpected), color: "text-blue-600", bg: "bg-blue-50", icon: Target },
          { label: "Worst Case (6M)", value: fmt(totalWorst), color: "text-red-600", bg: "bg-red-50", icon: TrendingDown },
          { label: "Risk-Adjusted", value: fmt(totalRiskAdj), color: "text-purple-600", bg: "bg-purple-50", icon: Shield },
          { label: "Avg Confidence", value: `${(avgConfidence * 100).toFixed(0)}%`, color: "text-indigo-600", bg: "bg-indigo-50", icon: Gauge },
          { label: "Churn Value at Risk", value: fmt(churnAtRisk), color: "text-red-600", bg: "bg-red-50", icon: AlertTriangle },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.bg}/40 border-0 shadow-sm`}>
              <CardContent className="pt-2 pb-1.5 text-center px-2">
                <Icon className={`h-4 w-4 mx-auto ${kpi.color} mb-0.5`} />
                <p className="text-[8px] text-muted-foreground leading-tight">{kpi.label}</p>
                <p className={`text-sm font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="forecast">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="forecast" className="text-xs gap-1"><BarChart3 className="h-3.5 w-3.5" /> תחזית הכנסות</TabsTrigger>
          <TabsTrigger value="pipeline" className="text-xs gap-1"><Layers className="h-3.5 w-3.5" /> Pipeline Scenarios</TabsTrigger>
          <TabsTrigger value="churn" className="text-xs gap-1"><AlertTriangle className="h-3.5 w-3.5" /> חיזוי נטישה</TabsTrigger>
          <TabsTrigger value="growth" className="text-xs gap-1"><TrendingUp className="h-3.5 w-3.5" /> חיזוי צמיחה</TabsTrigger>
          <TabsTrigger value="accuracy" className="text-xs gap-1"><Target className="h-3.5 w-3.5" /> Backtesting</TabsTrigger>
        </TabsList>

        {/* Revenue Forecast */}
        <TabsContent value="forecast" className="space-y-4">
          {/* Fan Chart Visualization */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">תחזית הכנסות — 6 חודשים | Fan Chart</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48 flex items-end gap-3 justify-around">
                {monthlyForecast.map((m, i) => {
                  const maxVal = Math.max(...monthlyForecast.map(f => f.bestCase));
                  const bestH = (m.bestCase / maxVal) * 100;
                  const expH = (m.expected / maxVal) * 100;
                  const worstH = (m.worstCase / maxVal) * 100;
                  return (
                    <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
                      <span className="text-[8px] font-mono text-emerald-600">{fmt(m.bestCase)}</span>
                      <div className="w-full relative" style={{ height: `${bestH}%` }}>
                        <div className="absolute inset-x-0 bottom-0 bg-emerald-200/50 rounded-t" style={{ height: "100%" }} />
                        <div className="absolute inset-x-1 bottom-0 bg-blue-400/60 rounded-t" style={{ height: `${(expH / bestH) * 100}%` }} />
                        <div className="absolute inset-x-2 bottom-0 bg-red-300/50 rounded-t" style={{ height: `${(worstH / bestH) * 100}%` }} />
                        <div className="absolute inset-x-0 bg-primary/80 rounded" style={{ bottom: `${(expH / bestH) * 100 - 2}%`, height: "3px" }} />
                      </div>
                      <span className="text-[8px] text-muted-foreground">{m.month}</span>
                      <Badge variant="outline" className="text-[7px] font-mono">{(m.confidence * 100).toFixed(0)}%</Badge>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-center gap-6 mt-3 text-[9px]">
                <span className="flex items-center gap-1"><div className="w-3 h-2 bg-emerald-200/70 rounded" /> Best Case</span>
                <span className="flex items-center gap-1"><div className="w-3 h-2 bg-blue-400/70 rounded" /> Expected</span>
                <span className="flex items-center gap-1"><div className="w-3 h-2 bg-red-300/70 rounded" /> Worst Case</span>
                <span className="flex items-center gap-1"><div className="w-3 h-1 bg-primary rounded" /> Risk-Adjusted</span>
              </div>
            </CardContent>
          </Card>

          {/* Forecast Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">חודש</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">Best Case</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">Expected</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">Worst Case</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">Risk-Adjusted</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">Spread</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyForecast.map((m, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-medium">{m.month}</TableCell>
                      <TableCell className="font-mono text-[10px] text-emerald-600">{fmt(m.bestCase)}</TableCell>
                      <TableCell className="font-mono text-[10px] font-bold text-blue-700">{fmt(m.expected)}</TableCell>
                      <TableCell className="font-mono text-[10px] text-red-600">{fmt(m.worstCase)}</TableCell>
                      <TableCell className="font-mono text-[10px] font-bold text-purple-700">{fmt(m.riskAdjusted)}</TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground">{fmt(m.bestCase - m.worstCase)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Progress value={m.confidence * 100} className="h-1.5 w-12" />
                          <span className="text-[9px] font-mono">{(m.confidence * 100).toFixed(0)}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-primary/5 font-bold border-t-2">
                    <TableCell className="text-xs">סה"כ 6M</TableCell>
                    <TableCell className="font-mono text-[10px] text-emerald-600">{fmt(totalBest)}</TableCell>
                    <TableCell className="font-mono text-[10px] text-blue-700">{fmt(totalExpected)}</TableCell>
                    <TableCell className="font-mono text-[10px] text-red-600">{fmt(totalWorst)}</TableCell>
                    <TableCell className="font-mono text-[10px] text-purple-700">{fmt(totalRiskAdj)}</TableCell>
                    <TableCell className="font-mono text-[10px]">{fmt(totalBest - totalWorst)}</TableCell>
                    <TableCell className="font-mono text-[10px]">{(avgConfidence * 100).toFixed(0)}%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pipeline Scenarios */}
        <TabsContent value="pipeline" className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Pipeline Coverage by Probability Band</CardTitle></CardHeader>
            <CardContent>
              {/* Stacked bar */}
              <div className="flex h-12 rounded-lg overflow-hidden mb-4">
                {Object.entries(pipelineScenarios).map(([key, sc]) => {
                  const total = Object.values(pipelineScenarios).reduce((s, v) => s + v.value, 0);
                  const pct = (sc.value / total) * 100;
                  return (
                    <div key={key} className={`${sc.color} flex items-center justify-center text-white text-[9px] font-bold`} style={{ width: `${pct}%` }}>
                      {pct > 10 && `${sc.label.split("(")[0].trim()}`}
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-4 gap-3">
                {Object.entries(pipelineScenarios).map(([key, sc]) => (
                  <Card key={key} className="border-0 shadow-sm">
                    <CardContent className="pt-3 pb-2 text-center">
                      <div className={`w-3 h-3 rounded-full ${sc.color} mx-auto mb-1`} />
                      <p className="text-[9px] text-muted-foreground">{sc.label}</p>
                      <p className="text-lg font-bold font-mono">{fmt(sc.value)}</p>
                      <p className="text-[9px] text-muted-foreground">{sc.deals} עסקאות</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Agent Coverage */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Pipeline Coverage per Agent</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">סוכן</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">Committed</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">Pipeline כולל</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">Weighted</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">יעד</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">Coverage Ratio</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentForecasts.map((af, i) => (
                    <TableRow key={i} className={!af.onTrack ? "bg-red-50/20" : ""}>
                      <TableCell className="text-xs font-medium">{af.agent}</TableCell>
                      <TableCell className="font-mono text-[10px] text-emerald-600">{fmt(af.committed)}</TableCell>
                      <TableCell className="font-mono text-[10px]">{fmt(af.pipeline)}</TableCell>
                      <TableCell className="font-mono text-[10px] font-bold text-blue-700">{fmt(af.weighted)}</TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground">{fmt(af.target)}</TableCell>
                      <TableCell>
                        <Badge className={`font-mono text-[9px] ${af.coverageRatio >= 1 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                          {af.coverageRatio.toFixed(2)}x
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {af.onTrack
                          ? <Badge className="bg-emerald-100 text-emerald-700 text-[9px]"><CheckCircle className="h-2.5 w-2.5 ml-0.5" />On Track</Badge>
                          : <Badge className="bg-red-100 text-red-700 text-[9px]"><AlertTriangle className="h-2.5 w-2.5 ml-0.5" />Gap</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Churn Prediction */}
        <TabsContent value="churn">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" /> Churn Prediction — לקוחות בסיכון נטישה</CardTitle>
              <CardDescription>LTV at Risk: {fmt(churnAtRisk)} (probability-weighted)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {churnPredictions.sort((a, b) => b.probability * b.ltvAtRisk - a.probability * a.ltvAtRisk).map((cp, i) => (
                  <div key={i} className={`p-4 rounded-lg border ${cp.probability > 0.7 ? "border-red-300 bg-red-50/30" : cp.probability > 0.4 ? "border-amber-300 bg-amber-50/20" : "border-border"}`}>
                    <div className="flex items-start gap-4">
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center text-sm font-bold text-white ${cp.probability > 0.7 ? "bg-red-500" : cp.probability > 0.4 ? "bg-amber-500" : "bg-blue-500"}`}>
                        {(cp.probability * 100).toFixed(0)}%
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm">{cp.customer}</h3>
                          <Badge className="bg-red-100 text-red-700 text-[9px] font-mono">LTV at Risk: {fmt(cp.ltvAtRisk)}</Badge>
                          <Badge className="bg-purple-100 text-purple-700 text-[9px] font-mono">Weighted: {fmt(cp.ltvAtRisk * cp.probability)}</Badge>
                        </div>
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {cp.signals.map((s, si) => (
                            <Badge key={si} variant="outline" className="text-[8px] text-red-600 border-red-200">{s}</Badge>
                          ))}
                        </div>
                        <div className="mt-2 p-2 rounded bg-primary/5 border border-primary/20">
                          <div className="flex items-center gap-1.5">
                            <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
                            <p className="text-[10px] text-primary font-medium">פעולת מניעה: {cp.preventionAction}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Growth Projection */}
        <TabsContent value="growth">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-500" /> חיזוי צמיחה — 12 חודשים</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">לקוח</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">הכנסה נוכחית (YTD)</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תחזית 12M</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">צמיחה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">Drivers</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {growthProjections.sort((a, b) => b.projected12m - a.projected12m).map((gp, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-xs">{gp.customer}</TableCell>
                      <TableCell className="font-mono text-[10px]">{fmt(gp.currentRevenue)}</TableCell>
                      <TableCell className="font-mono text-[10px] font-bold text-emerald-700">{fmt(gp.projected12m)}</TableCell>
                      <TableCell>
                        <Badge className="bg-emerald-100 text-emerald-700 text-[9px] font-mono">
                          <ArrowUpRight className="h-2.5 w-2.5 ml-0.5" />+{gp.growth > 500 ? "∞" : gp.growth}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {gp.drivers.map((d, di) => <Badge key={di} variant="outline" className="text-[7px]">{d}</Badge>)}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Backtesting */}
        <TabsContent value="accuracy">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4 text-blue-500" /> Backtesting — דיוק תחזיות</CardTitle>
                <Badge className="bg-blue-100 text-blue-700 font-mono">MAPE: ±{avgAccuracy.toFixed(1)}%</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">תקופה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תחזית</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">בפועל</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">שגיאה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">בתוך Band?</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historicalAccuracy.map((h, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-medium">{h.period}</TableCell>
                      <TableCell className="font-mono text-[10px]">{fmt(h.predicted)}</TableCell>
                      <TableCell className="font-mono text-[10px] font-bold">{fmt(h.actual)}</TableCell>
                      <TableCell className={`font-mono text-[10px] ${Math.abs(h.error) < 5 ? "text-emerald-600" : "text-amber-600"}`}>
                        {h.error > 0 ? "+" : ""}{h.error.toFixed(1)}%
                      </TableCell>
                      <TableCell>
                        {h.withinBand
                          ? <CheckCircle className="h-4 w-4 text-emerald-500" />
                          : <XCircle className="h-4 w-4 text-red-500" />}
                      </TableCell>
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
