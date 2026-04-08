import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { authFetch } from "@/lib/utils";
import {
  Activity, Play, BarChart3, AlertTriangle, Target, Zap, Plus,
  TrendingDown, TrendingUp, Percent, Shield, Clock, History,
  Settings2, Eye, Download, Trash2, Copy, GitCompare, ArrowUpRight,
  ArrowDownRight, Minus, Info, RefreshCw, CheckCircle, XCircle,
  TriangleAlert, Layers, Sigma, Hash, ChevronDown, ChevronRight
} from "lucide-react";

// ============================================================
// TYPES
// ============================================================
interface MCVariable {
  variableName: string;
  variableLabel: string;
  distributionType: string;
  paramMean: number;
  paramStdDev: number;
  paramMin?: number;
  paramMax?: number;
  paramMode?: number;
  paramAlpha?: number;
  paramBeta?: number;
  paramDrift?: number;
  paramVolatility?: number;
  paramMeanReversion?: number;
  paramJumpIntensity?: number;
  baseValue?: number;
  isPercentage?: boolean;
}

interface MCRun {
  id: number;
  name: string;
  modelType: string;
  scenarioCount: number;
  status: string;
  durationMs: number;
  convergenceAchieved: boolean;
  convergenceAtScenario?: number;
  createdAt: string;
}

interface MCRunDetail {
  run: MCRun;
  variables: MCVariable[];
  results: any[];
  percentiles: { percentile: number; value: number }[];
  riskOutput: any;
  sensitivity: any[];
  convergence: { scenarioNumber: number; runningMean: number; runningStdDev: number; standardError: number }[];
  timeSeries: any[];
}

// ============================================================
// CONSTANTS
// ============================================================
const MODEL_TYPES = [
  { value: "cashflow_forecast", label: "תחזית תזרים מזומנים", icon: "💰" },
  { value: "project_profitability", label: "רווחיות פרויקט", icon: "📊" },
  { value: "customer_payment_delay", label: "עיכוב תשלומי לקוחות", icon: "⏳" },
  { value: "supplier_cost_inflation", label: "עליית עלויות ספקים", icon: "📈" },
  { value: "revenue_variability", label: "שונות הכנסות", icon: "📉" },
  { value: "margin_variability", label: "שונות מרווחים", icon: "🎯" },
  { value: "working_capital", label: "הון חוזר", icon: "🏦" },
  { value: "liquidity_runway", label: "מסלול נזילות", icon: "🛫" },
  { value: "portfolio_of_projects", label: "תיק פרויקטים", icon: "📁" },
  { value: "full_company_pnl", label: 'רווח והפסד חברה מלא', icon: "🏢" },
];

const DISTRIBUTIONS = [
  { value: "normal", label: "Normal", labelHe: "גאוסיאני", params: ["mean", "stdDev"] },
  { value: "lognormal", label: "Log-Normal", labelHe: "לוג-נורמלי", params: ["mean", "stdDev"] },
  { value: "triangular", label: "Triangular", labelHe: "משולש", params: ["min", "mode", "max"] },
  { value: "uniform", label: "Uniform", labelHe: "אחיד", params: ["min", "max"] },
  { value: "beta", label: "Beta", labelHe: "בטא", params: ["alpha", "beta", "min", "max"] },
  { value: "gamma", label: "Gamma", labelHe: "גמא", params: ["alpha", "beta"] },
  { value: "weibull", label: "Weibull", labelHe: "וייבול", params: ["alpha", "beta"] },
  { value: "poisson", label: "Poisson", labelHe: "פואסון", params: ["lambda"] },
  { value: "jump_diffusion", label: "Jump Diffusion", labelHe: "דיפוזיית קפיצות (Merton)", params: ["drift", "volatility", "jumpIntensity", "jumpMean", "jumpVol"] },
  { value: "mean_reverting", label: "Mean Reverting", labelHe: "חזרה לממוצע (O-U)", params: ["mean", "volatility", "meanReversion"] },
  { value: "custom_empirical", label: "Custom Empirical", labelHe: "אמפירי", params: [] },
];

const STRESS_DIMENSIONS = [
  { field: "revenue_drop", label: "ירידת הכנסות", default: -20, unit: "%", min: -80, max: 0, step: 5 },
  { field: "raw_material_increase", label: "עליית חומרי גלם", default: 15, unit: "%", min: 0, max: 100, step: 5 },
  { field: "payroll_increase", label: "עליית שכר", default: 10, unit: "%", min: 0, max: 50, step: 2 },
  { field: "collection_delay", label: "עיכוב גבייה", default: 30, unit: "ימים", min: 0, max: 180, step: 5 },
  { field: "supplier_failure", label: "כשל ספק", default: 1, unit: "ספקים", min: 0, max: 5, step: 1 },
  { field: "fx_move", label: 'תנועת מט"ח', default: 10, unit: "%", min: -30, max: 30, step: 1 },
  { field: "financing_cost_increase", label: "עליית עלות מימון", default: 2, unit: "%", min: 0, max: 10, step: 0.5 },
  { field: "project_delay", label: "עיכוב פרויקט", default: 60, unit: "ימים", min: 0, max: 365, step: 15 },
  { field: "cancellation_rate", label: "שיעור ביטולים", default: 15, unit: "%", min: 0, max: 50, step: 5 },
];

const fmt = (v: number, unit?: string) => {
  if (unit === "%") return `${v.toFixed(2)}%`;
  if (Math.abs(v) >= 1000000) return `₪${(v / 1000000).toFixed(2)}M`;
  if (Math.abs(v) >= 1000) return `₪${(v / 1000).toFixed(0)}K`;
  return `₪${v.toLocaleString("he-IL")}`;
};

// ============================================================
// DISTRIBUTION VISUALIZATION
// ============================================================
function DistributionPreview({ type, params }: { type: string; params: MCVariable }) {
  const bars = useMemo(() => {
    const count = 40;
    const data: number[] = [];
    for (let i = 0; i < count; i++) {
      const x = (i - count / 2) / (count / 6);
      let y = 0;
      switch (type) {
        case "normal": y = Math.exp(-0.5 * x * x); break;
        case "lognormal": y = x > -count / 2 ? Math.exp(-0.5 * Math.pow(Math.log(Math.max(0.01, (i / count) * 3)), 2)) / Math.max(0.01, (i / count) * 3) : 0; break;
        case "uniform": y = (i >= count * 0.2 && i <= count * 0.8) ? 0.8 : 0; break;
        case "triangular": y = i < count / 2 ? (i / (count / 2)) : (1 - (i - count / 2) / (count / 2)); break;
        case "beta": y = Math.pow(i / count, 1.5) * Math.pow(1 - i / count, 3); break;
        default: y = Math.exp(-0.5 * x * x);
      }
      data.push(Math.max(0, y));
    }
    const maxY = Math.max(...data);
    return data.map(v => maxY > 0 ? (v / maxY) * 100 : 0);
  }, [type]);

  return (
    <div className="h-12 flex items-end gap-[1px]">
      {bars.map((h, i) => (
        <div key={i} className="flex-1 bg-primary/60 rounded-t" style={{ height: `${h}%`, minHeight: h > 0 ? "1px" : "0" }} />
      ))}
    </div>
  );
}

// ============================================================
// TORNADO CHART
// ============================================================
function TornadoChart({ sensitivity }: { sensitivity: any[] }) {
  if (!sensitivity || sensitivity.length === 0) return <p className="text-center text-muted-foreground py-8">אין נתוני רגישות</p>;

  const maxSwing = Math.max(...sensitivity.map(s => Math.abs(Number(s.swingWidth || 0))));

  return (
    <div className="space-y-2">
      {sensitivity.slice(0, 10).map((s: any, i: number) => {
        const swing = Number(s.swingWidth || 0);
        const barWidth = maxSwing > 0 ? (Math.abs(swing) / maxSwing) * 100 : 0;
        const r2 = (Number(s.contributionToVariance || 0) * 100).toFixed(1);

        return (
          <div key={i} className="flex items-center gap-3">
            <div className="w-32 text-xs text-left truncate font-medium" title={s.variableLabel}>
              #{s.rank} {s.variableLabel}
            </div>
            <div className="flex-1 flex items-center gap-1">
              <div className="w-1/2 flex justify-end">
                <div className="h-6 bg-red-400 rounded-r" style={{ width: `${barWidth / 2}%`, minWidth: barWidth > 0 ? "2px" : "0" }} />
              </div>
              <div className="w-px h-8 bg-border" />
              <div className="w-1/2">
                <div className="h-6 bg-emerald-400 rounded-l" style={{ width: `${barWidth / 2}%`, minWidth: barWidth > 0 ? "2px" : "0" }} />
              </div>
            </div>
            <div className="w-16 text-xs font-mono text-left">R²={r2}%</div>
          </div>
        );
      })}
      <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
        <div className="w-32" />
        <div className="flex-1 flex justify-between px-2">
          <span>← ירידה</span>
          <span>Baseline</span>
          <span>עלייה →</span>
        </div>
        <div className="w-16" />
      </div>
    </div>
  );
}

// ============================================================
// CONVERGENCE CHART
// ============================================================
function ConvergenceChart({ convergence }: { convergence: any[] }) {
  if (!convergence || convergence.length === 0) return <p className="text-center text-muted-foreground py-8">אין נתוני convergence</p>;

  const maxMean = Math.max(...convergence.map(c => Number(c.runningMean)));
  const minMean = Math.min(...convergence.map(c => Number(c.runningMean)));
  const range = maxMean - minMean || 1;

  return (
    <div className="space-y-2">
      <div className="h-32 flex items-end gap-[2px] border-b border-l relative">
        {convergence.map((c: any, i: number) => {
          const mean = Number(c.runningMean);
          const h = ((mean - minMean) / range) * 100;
          const se = Number(c.standardError);
          const isConverged = Math.abs(mean) > 0 && se / Math.abs(mean) < 0.001;
          return (
            <div
              key={i}
              className={`flex-1 rounded-t transition-all ${isConverged ? "bg-emerald-500" : "bg-primary/50"}`}
              style={{ height: `${Math.max(2, h)}%` }}
              title={`Scenario ${c.scenarioNumber}: Mean=${fmt(mean)} SE=${fmt(se)}`}
            />
          );
        })}
        {/* Final mean line */}
        <div className="absolute left-0 right-0 border-t border-dashed border-emerald-500"
          style={{ bottom: `${((Number(convergence[convergence.length - 1]?.runningMean || 0) - minMean) / range) * 100}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>0</span>
        <span>{convergence[convergence.length - 1]?.scenarioNumber?.toLocaleString()} תרחישים</span>
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function MonteCarloEngine() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("config");
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [showVariableEditor, setShowVariableEditor] = useState(false);

  // Config state
  const [config, setConfig] = useState({
    name: "",
    modelType: "cashflow_forecast",
    scenarioCount: 50000,
    seed: Math.floor(Math.random() * 2147483647),
    convergenceThreshold: 0.001,
    antithetic: true,
    timeHorizonMonths: 12,
    periodGranularity: "monthly" as const,
    correlationMethod: "cholesky" as const,
  });

  const [variables, setVariables] = useState<MCVariable[]>([
    { variableName: "revenue", variableLabel: "הכנסות חודשיות", distributionType: "normal", paramMean: 400000, paramStdDev: 60000 },
    { variableName: "cogs", variableLabel: "עלות מכר", distributionType: "normal", paramMean: 240000, paramStdDev: 35000 },
    { variableName: "opex", variableLabel: "הוצאות תפעוליות", distributionType: "normal", paramMean: 85000, paramStdDev: 12000 },
    { variableName: "collection_days", variableLabel: "ימי גבייה", distributionType: "triangular", paramMean: 45, paramStdDev: 10, paramMin: 20, paramMax: 90, paramMode: 42 },
    { variableName: "fx_rate", variableLabel: 'שער מט"ח EUR/ILS', distributionType: "mean_reverting", paramMean: 3.82, paramStdDev: 0, paramVolatility: 0.08, paramMeanReversion: 0.5 },
  ]);

  const [stressValues, setStressValues] = useState<Record<string, number>>(
    Object.fromEntries(STRESS_DIMENSIONS.map(d => [d.field, d.default]))
  );

  // API queries
  const { data: runs } = useQuery({
    queryKey: ["/api/fin/quant/monte-carlo/runs"],
    queryFn: () => authFetch("/api/fin/quant/monte-carlo/runs").then(r => r.json()),
  });

  const { data: runDetail } = useQuery({
    queryKey: ["/api/fin/quant/monte-carlo/runs", selectedRunId],
    queryFn: () => selectedRunId ? authFetch(`/api/fin/quant/monte-carlo/runs/${selectedRunId}`).then(r => r.json()) : null,
    enabled: !!selectedRunId,
  });

  // Run mutation
  const runMutation = useMutation({
    mutationFn: (payload: any) =>
      authFetch("/api/fin/quant/monte-carlo/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(r => r.json()),
    onSuccess: (data) => {
      setSelectedRunId(data.runId);
      setActiveTab("results");
      queryClient.invalidateQueries({ queryKey: ["/api/fin/quant/monte-carlo/runs"] });
    },
  });

  const stressMutation = useMutation({
    mutationFn: (payload: any) =>
      authFetch("/api/fin/quant/stress-tests/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(r => r.json()),
  });

  // Computed
  const detail = runDetail as MCRunDetail | null;
  const result = detail?.results?.[0];
  const risk = detail?.riskOutput;

  const handleRun = () => {
    runMutation.mutate({
      name: config.name || `${MODEL_TYPES.find(m => m.value === config.modelType)?.label} - ${new Date().toLocaleDateString("he-IL")}`,
      modelType: config.modelType,
      scenarioCount: config.scenarioCount,
      seed: config.seed,
      convergenceThreshold: config.convergenceThreshold,
      antithetic: config.antithetic,
      outputMetricName: "net_cashflow",
      outputMetricLabel: "תזרים נטו",
      variables: variables.map(v => ({
        type: v.distributionType,
        mean: v.paramMean,
        stdDev: v.paramStdDev,
        min: v.paramMin,
        max: v.paramMax,
        mode: v.paramMode,
        alpha: v.paramAlpha,
        beta: v.paramBeta,
        drift: v.paramDrift,
        volatility: v.paramVolatility,
        meanReversion: v.paramMeanReversion,
        jumpIntensity: v.paramJumpIntensity,
      })),
      outputFormula: "revenue - cogs - opex",
      thresholds: { loss: 0, margin: 50000 },
    });
  };

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-7 w-7 text-primary" /> Monte Carlo Engine v2.0
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            סימולציות מוסדיות | {config.scenarioCount.toLocaleString()} תרחישים | Cholesky | VaR/CVaR | Tornado
          </p>
        </div>
        <div className="flex items-center gap-2">
          {detail?.run && (
            <Badge variant={detail.run.convergenceAchieved ? "default" : "secondary"} className="font-mono">
              {detail.run.convergenceAchieved ? <CheckCircle className="h-3 w-3 ml-1" /> : <RefreshCw className="h-3 w-3 ml-1" />}
              {detail.run.status} | {detail.run.durationMs}ms
            </Badge>
          )}
          <Button onClick={handleRun} disabled={runMutation.isPending} className="gap-2">
            {runMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {runMutation.isPending ? "מריץ..." : "הרץ סימולציה"}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-7 w-full">
          <TabsTrigger value="config" className="gap-1"><Settings2 className="h-3.5 w-3.5" /> הגדרות</TabsTrigger>
          <TabsTrigger value="variables" className="gap-1"><Layers className="h-3.5 w-3.5" /> משתנים</TabsTrigger>
          <TabsTrigger value="results" className="gap-1"><BarChart3 className="h-3.5 w-3.5" /> תוצאות</TabsTrigger>
          <TabsTrigger value="risk" className="gap-1"><Shield className="h-3.5 w-3.5" /> סיכון</TabsTrigger>
          <TabsTrigger value="sensitivity" className="gap-1"><Target className="h-3.5 w-3.5" /> רגישות</TabsTrigger>
          <TabsTrigger value="convergence" className="gap-1"><Sigma className="h-3.5 w-3.5" /> Convergence</TabsTrigger>
          <TabsTrigger value="stress" className="gap-1"><Zap className="h-3.5 w-3.5" /> Stress</TabsTrigger>
        </TabsList>

        {/* =============== CONFIG TAB =============== */}
        <TabsContent value="config" className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">מודל</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">שם הרצה</Label>
                  <Input value={config.name} onChange={e => setConfig({ ...config, name: e.target.value })} placeholder="אוטומטי אם ריק" />
                </div>
                <div>
                  <Label className="text-xs">סוג מודל</Label>
                  <Select value={config.modelType} onValueChange={v => setConfig({ ...config, modelType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MODEL_TYPES.map(m => (
                        <SelectItem key={m.value} value={m.value}>{m.icon} {m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">פרמטרים</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">מספר תרחישים</Label>
                  <Select value={String(config.scenarioCount)} onValueChange={v => setConfig({ ...config, scenarioCount: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[10000, 25000, 50000, 100000, 250000, 500000].map(n => (
                        <SelectItem key={n} value={String(n)}>{n.toLocaleString()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Seed (לשחזור)</Label>
                  <Input type="number" value={config.seed} onChange={e => setConfig({ ...config, seed: Number(e.target.value) })} />
                </div>
                <div>
                  <Label className="text-xs">Convergence Threshold</Label>
                  <Input type="number" step="0.0001" value={config.convergenceThreshold} onChange={e => setConfig({ ...config, convergenceThreshold: Number(e.target.value) })} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">אופטימיזציות</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Antithetic Variates</Label>
                  <Switch checked={config.antithetic} onCheckedChange={v => setConfig({ ...config, antithetic: v })} />
                </div>
                <div>
                  <Label className="text-xs">Correlation Method</Label>
                  <Select value={config.correlationMethod} onValueChange={v => setConfig({ ...config, correlationMethod: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="cholesky">Cholesky</SelectItem>
                      <SelectItem value="copula">Copula</SelectItem>
                      <SelectItem value="empirical">Empirical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Period Granularity</Label>
                  <Select value={config.periodGranularity} onValueChange={v => setConfig({ ...config, periodGranularity: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">יומי</SelectItem>
                      <SelectItem value="weekly">שבועי</SelectItem>
                      <SelectItem value="monthly">חודשי</SelectItem>
                      <SelectItem value="quarterly">רבעוני</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Run History */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2"><History className="h-4 w-4" /> היסטוריית הרצות</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-48">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-right text-xs">שם</TableHead>
                      <TableHead className="text-right text-xs">מודל</TableHead>
                      <TableHead className="text-right text-xs">תרחישים</TableHead>
                      <TableHead className="text-right text-xs">זמן</TableHead>
                      <TableHead className="text-right text-xs">Convergence</TableHead>
                      <TableHead className="text-right text-xs">תאריך</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(runs || []).map((run: MCRun) => (
                      <TableRow
                        key={run.id}
                        className={`cursor-pointer hover:bg-accent ${selectedRunId === run.id ? "bg-primary/5" : ""}`}
                        onClick={() => { setSelectedRunId(run.id); setActiveTab("results"); }}
                      >
                        <TableCell className="text-xs font-medium">{run.name}</TableCell>
                        <TableCell className="text-xs">{MODEL_TYPES.find(m => m.value === run.modelType)?.icon}</TableCell>
                        <TableCell className="text-xs font-mono">{run.scenarioCount.toLocaleString()}</TableCell>
                        <TableCell className="text-xs font-mono">{run.durationMs}ms</TableCell>
                        <TableCell>
                          {run.convergenceAchieved
                            ? <Badge variant="outline" className="text-[10px] text-emerald-600">✓ {run.convergenceAtScenario?.toLocaleString()}</Badge>
                            : <Badge variant="outline" className="text-[10px] text-amber-600">—</Badge>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(run.createdAt).toLocaleDateString("he-IL")}</TableCell>
                      </TableRow>
                    ))}
                    {(!runs || runs.length === 0) && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground text-xs py-4">אין הרצות. לחץ "הרץ סימולציה"</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* =============== VARIABLES TAB =============== */}
        <TabsContent value="variables" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2"><Layers className="h-4 w-4" /> משתני קלט ({variables.length})</h3>
            <Button size="sm" variant="outline" onClick={() => setVariables([...variables, {
              variableName: `var_${variables.length + 1}`,
              variableLabel: `משתנה ${variables.length + 1}`,
              distributionType: "normal",
              paramMean: 0,
              paramStdDev: 1,
            }])}>
              <Plus className="h-3.5 w-3.5 ml-1" /> הוסף משתנה
            </Button>
          </div>

          {variables.map((v, i) => (
            <Card key={i} className="border-l-4 border-l-primary/50">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="grid grid-cols-3 gap-3 flex-1">
                    <div>
                      <Label className="text-xs">שם משתנה</Label>
                      <Input value={v.variableLabel} onChange={e => {
                        const next = [...variables];
                        next[i] = { ...v, variableLabel: e.target.value };
                        setVariables(next);
                      }} />
                    </div>
                    <div>
                      <Label className="text-xs">ID</Label>
                      <Input value={v.variableName} className="font-mono" onChange={e => {
                        const next = [...variables];
                        next[i] = { ...v, variableName: e.target.value };
                        setVariables(next);
                      }} />
                    </div>
                    <div>
                      <Label className="text-xs">התפלגות</Label>
                      <Select value={v.distributionType} onValueChange={val => {
                        const next = [...variables];
                        next[i] = { ...v, distributionType: val };
                        setVariables(next);
                      }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DISTRIBUTIONS.map(d => (
                            <SelectItem key={d.value} value={d.value}>
                              <span className="font-mono text-xs">{d.label}</span> — {d.labelHe}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="mr-2" onClick={() => setVariables(variables.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>

                <div className="grid grid-cols-5 gap-3">
                  {v.distributionType === "normal" || v.distributionType === "lognormal" ? (<>
                    <div><Label className="text-xs">Mean (μ)</Label><Input type="number" value={v.paramMean} onChange={e => { const next = [...variables]; next[i] = { ...v, paramMean: Number(e.target.value) }; setVariables(next); }} /></div>
                    <div><Label className="text-xs">Std Dev (σ)</Label><Input type="number" value={v.paramStdDev} onChange={e => { const next = [...variables]; next[i] = { ...v, paramStdDev: Number(e.target.value) }; setVariables(next); }} /></div>
                  </>) : v.distributionType === "triangular" ? (<>
                    <div><Label className="text-xs">Min</Label><Input type="number" value={v.paramMin} onChange={e => { const next = [...variables]; next[i] = { ...v, paramMin: Number(e.target.value) }; setVariables(next); }} /></div>
                    <div><Label className="text-xs">Mode</Label><Input type="number" value={v.paramMode} onChange={e => { const next = [...variables]; next[i] = { ...v, paramMode: Number(e.target.value) }; setVariables(next); }} /></div>
                    <div><Label className="text-xs">Max</Label><Input type="number" value={v.paramMax} onChange={e => { const next = [...variables]; next[i] = { ...v, paramMax: Number(e.target.value) }; setVariables(next); }} /></div>
                  </>) : v.distributionType === "mean_reverting" || v.distributionType === "jump_diffusion" ? (<>
                    <div><Label className="text-xs">Mean (μ)</Label><Input type="number" value={v.paramMean} onChange={e => { const next = [...variables]; next[i] = { ...v, paramMean: Number(e.target.value) }; setVariables(next); }} /></div>
                    <div><Label className="text-xs">Volatility (σ)</Label><Input type="number" step="0.01" value={v.paramVolatility || 0} onChange={e => { const next = [...variables]; next[i] = { ...v, paramVolatility: Number(e.target.value) }; setVariables(next); }} /></div>
                    <div><Label className="text-xs">Mean Reversion (θ)</Label><Input type="number" step="0.1" value={v.paramMeanReversion || 0} onChange={e => { const next = [...variables]; next[i] = { ...v, paramMeanReversion: Number(e.target.value) }; setVariables(next); }} /></div>
                  </>) : (<>
                    <div><Label className="text-xs">Min</Label><Input type="number" value={v.paramMin} onChange={e => { const next = [...variables]; next[i] = { ...v, paramMin: Number(e.target.value) }; setVariables(next); }} /></div>
                    <div><Label className="text-xs">Max</Label><Input type="number" value={v.paramMax} onChange={e => { const next = [...variables]; next[i] = { ...v, paramMax: Number(e.target.value) }; setVariables(next); }} /></div>
                  </>)}
                  <div className="col-span-2">
                    <Label className="text-xs">Preview</Label>
                    <DistributionPreview type={v.distributionType} params={v} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* =============== RESULTS TAB =============== */}
        <TabsContent value="results" className="space-y-4">
          {!result ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">הרץ סימולציה או בחר הרצה מההיסטוריה</CardContent></Card>
          ) : (<>
            {/* Stats Cards */}
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: "Mean (μ)", value: fmt(Number(result.mean)), color: "border-blue-200 bg-blue-50/50" },
                { label: "Median (P50)", value: fmt(Number(result.median)), color: "border-green-200 bg-green-50/50" },
                { label: "Std Dev (σ)", value: fmt(Number(result.stdDev)), color: "border-amber-200 bg-amber-50/50" },
                { label: "Range", value: `${fmt(Number(result.min))} — ${fmt(Number(result.max))}`, color: "border-purple-200 bg-purple-50/50" },
                { label: "CI 95%", value: `${fmt(Number(result.confidenceInterval95Low))} — ${fmt(Number(result.confidenceInterval95High))}`, color: "border-indigo-200 bg-indigo-50/50" },
              ].map((card, i) => (
                <Card key={i} className={card.color}>
                  <CardContent className="pt-4 pb-3 text-center">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{card.label}</p>
                    <p className="text-lg font-bold font-mono mt-1">{card.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Distribution + Stats */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">התפלגות — {detail?.run?.scenarioCount?.toLocaleString()} תרחישים</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-40 flex items-end gap-[1px] justify-center">
                    {detail?.percentiles?.map((p: any, i: number) => {
                      const range = Number(result.max) - Number(result.min);
                      const h = range > 0 ? ((Number(p.value) - Number(result.min)) / range) * 100 : 50;
                      const isVaR = Number(p.percentile) === 5;
                      return (
                        <div key={i} className={`flex-1 rounded-t ${isVaR ? "bg-red-500" : Number(p.value) < 0 ? "bg-red-300" : "bg-primary/60"}`}
                          style={{ height: `${Math.max(3, h)}%` }}
                          title={`P${p.percentile}: ${fmt(Number(p.value))}`}
                        />
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">סטטיסטיקות מלאות</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                    {[
                      ["Skewness", Number(result.skewness)?.toFixed(4)],
                      ["Kurtosis", Number(result.kurtosis)?.toFixed(4)],
                      ["Excess Kurtosis", Number(result.excessKurtosis)?.toFixed(4)],
                      ["IQR", fmt(Number(result.interquartileRange))],
                      ["MAD", fmt(Number(result.meanAbsoluteDeviation))],
                      ["CV", `${(Number(result.coefficientOfVariation) * 100).toFixed(2)}%`],
                      ["Std Error", fmt(Number(result.standardError))],
                      ["Normality (JB)", result.isNormalDistributed ? "✓ Normal" : "✗ Non-Normal"],
                    ].map(([label, value], i) => (
                      <div key={i} className="flex justify-between py-1 border-b border-dashed">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-mono font-medium">{value}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Percentiles Table */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Percentiles</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      {detail?.percentiles?.map((p: any) => (
                        <TableHead key={p.percentile} className="text-center text-[10px] px-1">P{p.percentile}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      {detail?.percentiles?.map((p: any) => (
                        <TableCell key={p.percentile} className={`text-center text-[10px] font-mono px-1 ${Number(p.value) < 0 ? "text-red-600 font-bold" : ""}`}>
                          {fmt(Number(p.value))}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>)}
        </TabsContent>

        {/* =============== RISK TAB =============== */}
        <TabsContent value="risk" className="space-y-4">
          {!risk ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">הרץ סימולציה כדי לראות מדדי סיכון</CardContent></Card>
          ) : (<>
            <div className="grid grid-cols-4 gap-3">
              <Card className="border-red-200 bg-red-50/30">
                <CardContent className="pt-4 text-center">
                  <p className="text-[10px] text-muted-foreground font-medium">P(Loss)</p>
                  <p className="text-2xl font-bold font-mono text-red-700">{(Number(risk.probabilityOfLoss) * 100).toFixed(2)}%</p>
                </CardContent>
              </Card>
              <Card className="border-amber-200 bg-amber-50/30">
                <CardContent className="pt-4 text-center">
                  <p className="text-[10px] text-muted-foreground font-medium">VaR 95%</p>
                  <p className="text-2xl font-bold font-mono text-amber-700">{fmt(Number(risk.valueAtRisk95))}</p>
                </CardContent>
              </Card>
              <Card className="border-purple-200 bg-purple-50/30">
                <CardContent className="pt-4 text-center">
                  <p className="text-[10px] text-muted-foreground font-medium">ES 95% (CVaR)</p>
                  <p className="text-2xl font-bold font-mono text-purple-700">{fmt(Number(risk.expectedShortfall95))}</p>
                </CardContent>
              </Card>
              <Card className="border-blue-200 bg-blue-50/30">
                <CardContent className="pt-4 text-center">
                  <p className="text-[10px] text-muted-foreground font-medium">Max Drawdown</p>
                  <p className="text-2xl font-bold font-mono text-blue-700">{fmt(Number(risk.maxDrawdown))}</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">מדדי סיכון מלאים</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-x-8 gap-y-2 text-xs">
                  {[
                    ["P(Negative Cash)", `${(Number(risk.probabilityOfNegativeCash) * 100).toFixed(3)}%`],
                    ["P(Loss)", `${(Number(risk.probabilityOfLoss) * 100).toFixed(3)}%`],
                    ["P(Margin Breach)", risk.probabilityOfMarginBreach ? `${(Number(risk.probabilityOfMarginBreach) * 100).toFixed(3)}%` : "N/A"],
                    ["P(Covenant Breach)", risk.probabilityOfCovenantBreach ? `${(Number(risk.probabilityOfCovenantBreach) * 100).toFixed(3)}%` : "N/A"],
                    ["VaR 90%", fmt(Number(risk.valueAtRisk90))],
                    ["VaR 95%", fmt(Number(risk.valueAtRisk95))],
                    ["VaR 99%", fmt(Number(risk.valueAtRisk99))],
                    ["VaR 99.5%", fmt(Number(risk.valueAtRisk995))],
                    ["ES 90%", fmt(Number(risk.expectedShortfall90))],
                    ["ES 95%", fmt(Number(risk.expectedShortfall95))],
                    ["ES 99%", fmt(Number(risk.expectedShortfall99))],
                    ["Max Drawdown", fmt(Number(risk.maxDrawdown))],
                    ["Avg Drawdown", fmt(Number(risk.avgDrawdown))],
                    ["Tail Ratio (Left)", Number(risk.tailRatioLeft)?.toFixed(3)],
                    ["Tail Ratio (Right)", Number(risk.tailRatioRight)?.toFixed(3)],
                    ["Gain/Loss Ratio", Number(risk.gainToLossRatio)?.toFixed(3)],
                    ["Conditional Mean Loss", fmt(Number(risk.conditionalMeanLoss))],
                    ["Conditional Mean Gain", fmt(Number(risk.conditionalMeanGain))],
                    ["Loss Scenarios", `${risk.lossScenarioCount?.toLocaleString()} (${((risk.lossScenarioCount / (detail?.run?.scenarioCount || 1)) * 100).toFixed(1)}%)`],
                    ["Gain Scenarios", `${risk.gainScenarioCount?.toLocaleString()} (${((risk.gainScenarioCount / (detail?.run?.scenarioCount || 1)) * 100).toFixed(1)}%)`],
                  ].map(([label, value], i) => (
                    <div key={i} className="flex justify-between py-1.5 border-b border-dashed">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-mono font-semibold">{value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>)}
        </TabsContent>

        {/* =============== SENSITIVITY TAB =============== */}
        <TabsContent value="sensitivity" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4" /> Tornado Chart — ניתוח רגישות</CardTitle>
              <CardDescription>השפעת כל משתנה על התוצאה (±1σ)</CardDescription>
            </CardHeader>
            <CardContent>
              <TornadoChart sensitivity={detail?.sensitivity || []} />
            </CardContent>
          </Card>

          {detail?.sensitivity && detail.sensitivity.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">פירוט רגישות</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-right text-xs">#</TableHead>
                      <TableHead className="text-right text-xs">משתנה</TableHead>
                      <TableHead className="text-right text-xs">Correlation</TableHead>
                      <TableHead className="text-right text-xs">R²</TableHead>
                      <TableHead className="text-right text-xs">Low (−1σ)</TableHead>
                      <TableHead className="text-right text-xs">High (+1σ)</TableHead>
                      <TableHead className="text-right text-xs">Swing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.sensitivity.map((s: any) => (
                      <TableRow key={s.rank}>
                        <TableCell className="font-mono text-xs">{s.rank}</TableCell>
                        <TableCell className="text-xs font-medium">{s.variableLabel}</TableCell>
                        <TableCell className={`font-mono text-xs ${Number(s.correlationWithOutput) > 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {Number(s.correlationWithOutput)?.toFixed(4)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{(Number(s.contributionToVariance) * 100).toFixed(2)}%</TableCell>
                        <TableCell className="font-mono text-xs text-red-600">{fmt(Number(s.lowOutputValue))}</TableCell>
                        <TableCell className="font-mono text-xs text-emerald-600">{fmt(Number(s.highOutputValue))}</TableCell>
                        <TableCell className="font-mono text-xs font-bold">{fmt(Number(s.swingWidth))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* =============== CONVERGENCE TAB =============== */}
        <TabsContent value="convergence" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Sigma className="h-4 w-4" /> Convergence Monitor</CardTitle>
                {detail?.run?.convergenceAchieved && (
                  <Badge className="bg-emerald-100 text-emerald-700">
                    <CheckCircle className="h-3 w-3 ml-1" />
                    Converged @ {detail.run.convergenceAtScenario?.toLocaleString()} scenarios
                  </Badge>
                )}
              </div>
              <CardDescription>מעקב יציבות הממוצע כפונקציה של מספר התרחישים</CardDescription>
            </CardHeader>
            <CardContent>
              <ConvergenceChart convergence={detail?.convergence || []} />
            </CardContent>
          </Card>

          {detail?.convergence && detail.convergence.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">נתוני Convergence</CardTitle></CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="max-h-64">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-right text-xs">Scenarios</TableHead>
                        <TableHead className="text-right text-xs">Running Mean</TableHead>
                        <TableHead className="text-right text-xs">Std Dev</TableHead>
                        <TableHead className="text-right text-xs">Std Error</TableHead>
                        <TableHead className="text-right text-xs">SE/Mean</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.convergence.map((c: any, i: number) => {
                        const ratio = Math.abs(Number(c.runningMean)) > 0 ? Number(c.standardError) / Math.abs(Number(c.runningMean)) : 1;
                        return (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">{Number(c.scenarioNumber).toLocaleString()}</TableCell>
                            <TableCell className="font-mono text-xs">{fmt(Number(c.runningMean))}</TableCell>
                            <TableCell className="font-mono text-xs">{fmt(Number(c.runningStdDev))}</TableCell>
                            <TableCell className="font-mono text-xs">{fmt(Number(c.standardError))}</TableCell>
                            <TableCell className="font-mono text-xs">
                              <Badge variant="outline" className={ratio < 0.001 ? "text-emerald-600" : ratio < 0.01 ? "text-amber-600" : "text-red-600"}>
                                {(ratio * 100).toFixed(4)}%
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* =============== STRESS TAB =============== */}
        <TabsContent value="stress" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4" /> מבחן קיצון — 9 ממדים</CardTitle>
              <CardDescription>הגדר ערכי קיצון והרץ baseline vs stressed</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {STRESS_DIMENSIONS.map(dim => (
                <div key={dim.field} className="flex items-center gap-4">
                  <span className="text-sm w-36 font-medium">{dim.label}</span>
                  <Slider
                    value={[stressValues[dim.field]]}
                    onValueChange={([v]) => setStressValues({ ...stressValues, [dim.field]: v })}
                    min={dim.min}
                    max={dim.max}
                    step={dim.step}
                    className="flex-1"
                  />
                  <span className="font-mono text-sm w-20 text-left">
                    {stressValues[dim.field] > 0 ? "+" : ""}{stressValues[dim.field]}{dim.unit}
                  </span>
                </div>
              ))}
            </CardContent>
            <div className="p-4 border-t">
              <Button
                className="w-full"
                onClick={() => stressMutation.mutate({
                  name: `Stress Test ${new Date().toLocaleDateString("he-IL")}`,
                  stressDimensions: stressValues,
                })}
                disabled={stressMutation.isPending}
              >
                {stressMutation.isPending ? <RefreshCw className="h-4 w-4 ml-2 animate-spin" /> : <Zap className="h-4 w-4 ml-2" />}
                הרץ מבחן קיצון
              </Button>
            </div>
          </Card>

          {stressMutation.data && (
            <Card className="border-amber-200">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">תוצאות Stress Test</CardTitle>
                  <Badge className={
                    stressMutation.data.severity === "severe" ? "bg-red-100 text-red-700"
                    : stressMutation.data.severity === "high" ? "bg-orange-100 text-orange-700"
                    : stressMutation.data.severity === "moderate" ? "bg-amber-100 text-amber-700"
                    : "bg-green-100 text-green-700"
                  }>{stressMutation.data.severity}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  {[
                    ["שינוי ב-Mean", `${stressMutation.data.impact.meanDeltaPercent?.toFixed(2)}%`],
                    ["שינוי ב-VaR 95%", fmt(stressMutation.data.impact.var95Delta)],
                    ["שינוי ב-P(Loss)", `${(stressMutation.data.impact.probLossDelta * 100)?.toFixed(3)}%`],
                  ].map(([label, value], i) => (
                    <div key={i} className="flex justify-between py-1.5 border-b">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-mono font-bold text-red-600">{value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
