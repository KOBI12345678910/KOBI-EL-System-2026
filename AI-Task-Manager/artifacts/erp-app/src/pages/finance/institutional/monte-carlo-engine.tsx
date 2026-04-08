import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Activity, Play, BarChart3, AlertTriangle, Target, Zap,
  TrendingDown, TrendingUp, Percent, Shield, Clock
} from "lucide-react";

const MODEL_TYPES = [
  { value: "cashflow_forecast", label: "תחזית תזרים מזומנים" },
  { value: "project_profitability", label: "רווחיות פרויקט" },
  { value: "customer_payment_delay", label: "עיכוב תשלומי לקוחות" },
  { value: "supplier_cost_inflation", label: "עליית עלויות ספקים" },
  { value: "revenue_variability", label: "שונות הכנסות" },
  { value: "margin_variability", label: "שונות מרווחים" },
  { value: "working_capital", label: "הון חוזר" },
  { value: "liquidity_runway", label: "מסלול נזילות" },
  { value: "portfolio_of_projects", label: "תיק פרויקטים" },
  { value: "full_company_pnl", label: "רווח והפסד חברה מלא" },
];

const DISTRIBUTIONS = [
  { value: "normal", label: "Normal (גאוסיאני)" },
  { value: "lognormal", label: "Log-Normal" },
  { value: "triangular", label: "Triangular (משולש)" },
  { value: "uniform", label: "Uniform (אחיד)" },
  { value: "beta", label: "Beta" },
  { value: "custom_empirical", label: "Custom Empirical" },
];

// Simulated completed run
const completedRun = {
  id: 1,
  name: "תחזית תזרים Q2 2026",
  model: "cashflow_forecast",
  scenarios: 50000,
  distribution: "normal",
  duration: "8.4 שניות",
  results: {
    metric: "Net Cashflow (₪)",
    mean: 1250000,
    median: 1180000,
    stdDev: 420000,
    min: -380000,
    max: 3200000,
    skewness: 0.42,
    kurtosis: 3.18,
  },
  percentiles: [
    { p: 1, value: -180000 },
    { p: 5, value: 220000 },
    { p: 10, value: 450000 },
    { p: 25, value: 890000 },
    { p: 50, value: 1180000 },
    { p: 75, value: 1560000 },
    { p: 90, value: 1890000 },
    { p: 95, value: 2120000 },
    { p: 99, value: 2680000 },
  ],
  riskOutputs: {
    probNegativeCash: 2.3,
    probLoss: 4.8,
    probMarginBreach: 8.1,
    probCovenantBreach: 1.2,
    var95: 220000,
    var99: -180000,
    es95: 80000,
    es99: -120000,
    maxDrawdown: -380000,
  },
};

const stressDimensions = [
  { name: "ירידת הכנסות", field: "revenue_drop", default: -20, unit: "%" },
  { name: "עליית חומרי גלם", field: "raw_material_increase", default: 15, unit: "%" },
  { name: "עליית שכר", field: "payroll_increase", default: 10, unit: "%" },
  { name: "עיכוב גבייה", field: "collection_delay", default: 30, unit: "ימים" },
  { name: "כשל ספק", field: "supplier_failure", default: 1, unit: "ספקים" },
  { name: "תנועת מט\"ח", field: "fx_move", default: 10, unit: "%" },
  { name: "עליית עלות מימון", field: "financing_cost_increase", default: 2, unit: "%" },
  { name: "עיכוב פרויקט", field: "project_delay", default: 60, unit: "ימים" },
  { name: "שיעור ביטולים", field: "cancellation_rate", default: 15, unit: "%" },
];

export default function MonteCarloEngine() {
  const [model, setModel] = useState("cashflow_forecast");
  const [scenarios, setScenarios] = useState("50000");
  const [distribution, setDistribution] = useState("normal");
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState("results");

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-7 w-7 text-primary" /> מנוע Monte Carlo
          </h1>
          <p className="text-sm text-muted-foreground mt-1">סימולציות רב-תרחישיות | VaR | Expected Shortfall | Stress Testing</p>
        </div>
        <Badge variant="outline" className="text-base px-4 py-2 font-mono">
          {Number(scenarios).toLocaleString()} תרחישים
        </Badge>
      </div>

      {/* Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">הגדרת סימולציה</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">מודל</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODEL_TYPES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">מספר תרחישים</Label>
              <Select value={scenarios} onValueChange={setScenarios}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10000">10,000</SelectItem>
                  <SelectItem value="50000">50,000</SelectItem>
                  <SelectItem value="100000">100,000</SelectItem>
                  <SelectItem value="500000">500,000</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">התפלגות</Label>
              <Select value={distribution} onValueChange={setDistribution}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DISTRIBUTIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button className="w-full h-10" disabled={isRunning}>
                <Play className="h-4 w-4 ml-2" />
                {isRunning ? "מריץ..." : "הרץ סימולציה"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-xl">
          <TabsTrigger value="results">תוצאות</TabsTrigger>
          <TabsTrigger value="percentiles">Percentiles</TabsTrigger>
          <TabsTrigger value="risk">מדדי סיכון</TabsTrigger>
          <TabsTrigger value="stress">Stress Test</TabsTrigger>
        </TabsList>

        {/* Results */}
        <TabsContent value="results" className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <Card className="border-blue-200">
              <CardContent className="pt-5 text-center">
                <p className="text-xs text-muted-foreground font-medium">Mean (ממוצע)</p>
                <p className="text-2xl font-bold font-mono text-blue-700">₪{completedRun.results.mean.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="border-green-200">
              <CardContent className="pt-5 text-center">
                <p className="text-xs text-muted-foreground font-medium">Median (חציון)</p>
                <p className="text-2xl font-bold font-mono text-green-700">₪{completedRun.results.median.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="border-amber-200">
              <CardContent className="pt-5 text-center">
                <p className="text-xs text-muted-foreground font-medium">Std Dev (σ)</p>
                <p className="text-2xl font-bold font-mono text-amber-700">₪{completedRun.results.stdDev.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="border-purple-200">
              <CardContent className="pt-5 text-center">
                <p className="text-xs text-muted-foreground font-medium">Range</p>
                <p className="text-lg font-bold font-mono text-purple-700">
                  ₪{(completedRun.results.min / 1000).toFixed(0)}K — ₪{(completedRun.results.max / 1000).toFixed(0)}K
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">סטטיסטיקות התפלגות</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-x-12 gap-y-3">
                {[
                  { label: "Mean", value: `₪${completedRun.results.mean.toLocaleString()}` },
                  { label: "Median", value: `₪${completedRun.results.median.toLocaleString()}` },
                  { label: "Standard Deviation", value: `₪${completedRun.results.stdDev.toLocaleString()}` },
                  { label: "Variance", value: `₪${(completedRun.results.stdDev ** 2).toLocaleString()}` },
                  { label: "Minimum", value: `₪${completedRun.results.min.toLocaleString()}` },
                  { label: "Maximum", value: `₪${completedRun.results.max.toLocaleString()}` },
                  { label: "Skewness", value: completedRun.results.skewness.toFixed(3) },
                  { label: "Kurtosis", value: completedRun.results.kurtosis.toFixed(3) },
                ].map((item, i) => (
                  <div key={i} className="flex justify-between py-1.5 border-b border-dashed">
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                    <span className="text-sm font-mono font-semibold">{item.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Distribution Visualization Placeholder */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">התפלגות התוצאות — {completedRun.scenarios.toLocaleString()} תרחישים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48 flex items-end gap-[2px] justify-center">
                {Array.from({ length: 60 }, (_, i) => {
                  const x = (i - 30) / 10;
                  const height = Math.exp(-0.5 * x * x) * 100;
                  const isNegative = i < 12;
                  const isVar = i === 8;
                  return (
                    <div
                      key={i}
                      className={`w-2 rounded-t transition-all ${isVar ? "bg-red-500" : isNegative ? "bg-red-300" : "bg-blue-400"}`}
                      style={{ height: `${height}%` }}
                      title={isVar ? "VaR 95%" : ""}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-2 px-4">
                <span>₪{completedRun.results.min.toLocaleString()}</span>
                <span className="text-red-500 font-medium">← VaR 95%</span>
                <span>Mean: ₪{completedRun.results.mean.toLocaleString()}</span>
                <span>₪{completedRun.results.max.toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Percentiles */}
        <TabsContent value="percentiles">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">התפלגות Percentiles</CardTitle>
              <CardDescription>ערכים לפי אחוזוני ההתפלגות</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-right font-semibold">Percentile</TableHead>
                    <TableHead className="text-right font-semibold">ערך</TableHead>
                    <TableHead className="text-right font-semibold">פירוש</TableHead>
                    <TableHead className="text-right font-semibold">ויזואלי</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completedRun.percentiles.map((p) => {
                    const range = completedRun.results.max - completedRun.results.min;
                    const barWidth = ((p.value - completedRun.results.min) / range) * 100;
                    const isNegative = p.value < 0;
                    return (
                      <TableRow key={p.p}>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-sm">P{p.p}</Badge>
                        </TableCell>
                        <TableCell className={`font-mono font-bold text-base ${isNegative ? "text-red-600" : "text-emerald-700"}`}>
                          ₪{p.value.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {p.p}% מהתרחישים מתחת לערך זה
                        </TableCell>
                        <TableCell>
                          <div className="w-48 h-3 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${isNegative ? "bg-red-400" : "bg-blue-400"}`}
                              style={{ width: `${Math.max(2, barWidth)}%` }}
                            />
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

        {/* Risk Outputs */}
        <TabsContent value="risk" className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card className="border-red-200 bg-red-50/30">
              <CardContent className="pt-5 text-center">
                <AlertTriangle className="h-6 w-6 mx-auto text-red-500 mb-2" />
                <p className="text-xs text-muted-foreground font-medium">P(Loss)</p>
                <p className="text-3xl font-bold font-mono text-red-700">{completedRun.riskOutputs.probLoss}%</p>
              </CardContent>
            </Card>
            <Card className="border-amber-200 bg-amber-50/30">
              <CardContent className="pt-5 text-center">
                <Shield className="h-6 w-6 mx-auto text-amber-500 mb-2" />
                <p className="text-xs text-muted-foreground font-medium">VaR 95%</p>
                <p className="text-3xl font-bold font-mono text-amber-700">₪{completedRun.riskOutputs.var95.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="border-purple-200 bg-purple-50/30">
              <CardContent className="pt-5 text-center">
                <TrendingDown className="h-6 w-6 mx-auto text-purple-500 mb-2" />
                <p className="text-xs text-muted-foreground font-medium">Expected Shortfall 95%</p>
                <p className="text-3xl font-bold font-mono text-purple-700">₪{completedRun.riskOutputs.es95.toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">מדדי סיכון מלאים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-x-12 gap-y-3">
                {[
                  { label: "P(Negative Cash)", value: `${completedRun.riskOutputs.probNegativeCash}%`, status: completedRun.riskOutputs.probNegativeCash > 5 ? "critical" : "good" },
                  { label: "P(Loss)", value: `${completedRun.riskOutputs.probLoss}%`, status: completedRun.riskOutputs.probLoss > 10 ? "critical" : "good" },
                  { label: "P(Margin Breach)", value: `${completedRun.riskOutputs.probMarginBreach}%`, status: completedRun.riskOutputs.probMarginBreach > 10 ? "warning" : "good" },
                  { label: "P(Covenant Breach)", value: `${completedRun.riskOutputs.probCovenantBreach}%`, status: completedRun.riskOutputs.probCovenantBreach > 5 ? "critical" : "good" },
                  { label: "VaR 95%", value: `₪${completedRun.riskOutputs.var95.toLocaleString()}` },
                  { label: "VaR 99%", value: `₪${completedRun.riskOutputs.var99.toLocaleString()}` },
                  { label: "Expected Shortfall 95%", value: `₪${completedRun.riskOutputs.es95.toLocaleString()}` },
                  { label: "Expected Shortfall 99%", value: `₪${completedRun.riskOutputs.es99.toLocaleString()}` },
                  { label: "Maximum Drawdown", value: `₪${completedRun.riskOutputs.maxDrawdown.toLocaleString()}` },
                ].map((item, i) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b border-dashed">
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-semibold">{item.value}</span>
                      {item.status && (
                        item.status === "good"
                          ? <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">OK</Badge>
                          : item.status === "warning"
                            ? <Badge className="bg-amber-100 text-amber-700 text-[10px]">!</Badge>
                            : <Badge className="bg-red-100 text-red-700 text-[10px]">!!</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stress Test */}
        <TabsContent value="stress">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">מבחן קיצון — ממדי Stress</CardTitle>
              <CardDescription>הגדר ערכי קיצון לכל ממד והרץ מבחן</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-right font-semibold">ממד</TableHead>
                    <TableHead className="text-right font-semibold">ערך ברירת מחדל</TableHead>
                    <TableHead className="text-right font-semibold">יחידה</TableHead>
                    <TableHead className="text-right font-semibold">ערך מותאם</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stressDimensions.map((dim) => (
                    <TableRow key={dim.field}>
                      <TableCell className="font-medium">{dim.name}</TableCell>
                      <TableCell className="font-mono">{dim.default > 0 ? "+" : ""}{dim.default}</TableCell>
                      <TableCell className="text-muted-foreground">{dim.unit}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          defaultValue={dim.default}
                          className="w-24 h-8 text-sm font-mono"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
            <div className="p-4 border-t">
              <Button className="w-full">
                <Zap className="h-4 w-4 ml-2" /> הרץ מבחן קיצון
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
