import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { authFetch } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, AreaChart, Area,
} from "recharts";
import {
  ShieldAlert, AlertTriangle, TrendingUp, TrendingDown, Minus, Play,
  BarChart3, Activity, Zap, Target, Gauge, ArrowUp, ArrowDown,
  Loader2, Settings2, FlaskConical, GitBranch,
} from "lucide-react";

const API = "/api";

/* ── Types ─────────────────────────────────────────────── */
interface Risk {
  id: number;
  name: string;
  category: string;
  probability: number; // 1-5
  impact: number; // 1-5
  score: number;
  trend: "up" | "down" | "stable";
  status: "active" | "mitigated" | "monitoring" | "closed";
  owner: string;
}

interface SimulationResult {
  histogram: { bin: string; count: number }[];
  mean: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  var95: number;
  var99: number;
}

interface Scenario {
  id: number;
  name: string;
  description: string;
  variables: { name: string; base: number; adjusted: number }[];
  resultImpact: number;
}

interface StressTest {
  id: number;
  name: string;
  description: string;
  severity: "high" | "extreme" | "catastrophic";
  resilienceScore: number;
  estimatedLoss: number;
}

/* ── Helpers ───────────────────────────────────────────── */
const fmt = (v: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);

const categoryColors: Record<string, string> = {
  "תפעולי": "bg-blue-500",
  "פיננסי": "bg-green-500",
  "שוק": "bg-amber-500",
  "רגולטורי": "bg-purple-500",
  "טכנולוגי": "bg-cyan-500",
  "אסטרטגי": "bg-pink-500",
};

const statusLabels: Record<string, string> = {
  active: "פעיל",
  mitigated: "מוקטן",
  monitoring: "ניטור",
  closed: "סגור",
};

const statusVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "destructive",
  mitigated: "default",
  monitoring: "secondary",
  closed: "outline",
};

function matrixColor(prob: number, impact: number): string {
  const score = prob * impact;
  if (score >= 16) return "bg-red-600 text-foreground";
  if (score >= 10) return "bg-orange-500 text-foreground";
  if (score >= 5) return "bg-yellow-400 text-black";
  return "bg-green-500 text-foreground";
}

/* ── Mock data ─────────────────────────────────────────── */
function generateRisks(): Risk[] {
  const risks = [
    { name: "עלייה בעלויות חומרי גלם", category: "פיננסי", probability: 4, impact: 4, trend: "up" as const },
    { name: "שיבוש שרשרת אספקה", category: "תפעולי", probability: 3, impact: 5, trend: "stable" as const },
    { name: "שינויי רגולציה", category: "רגולטורי", probability: 2, impact: 4, trend: "up" as const },
    { name: "תקלת מערכות IT", category: "טכנולוגי", probability: 3, impact: 3, trend: "down" as const },
    { name: "כניסת מתחרה חדש", category: "שוק", probability: 4, impact: 3, trend: "up" as const },
    { name: "עזיבת עובדי מפתח", category: "תפעולי", probability: 3, impact: 4, trend: "stable" as const },
    { name: "תנודות מט\"ח", category: "פיננסי", probability: 5, impact: 3, trend: "up" as const },
    { name: "אובדן לקוח מרכזי", category: "אסטרטגי", probability: 2, impact: 5, trend: "down" as const },
    { name: "פריצת אבטחת מידע", category: "טכנולוגי", probability: 2, impact: 5, trend: "stable" as const },
    { name: "ירידה בביקוש", category: "שוק", probability: 3, impact: 4, trend: "up" as const },
  ];
  const statuses: Risk["status"][] = ["active", "monitoring", "active", "mitigated", "active", "monitoring", "active", "mitigated", "monitoring", "active"];
  const owners = ["דוד כהן", "שרה לוי", "אבי מזרחי", "מיכל ברק", "רון שמש"];
  return risks.map((r, i) => ({
    id: i + 1,
    ...r,
    score: r.probability * r.impact,
    status: statuses[i],
    owner: owners[i % owners.length],
  }));
}

function generateSimResult(): SimulationResult {
  const bins: { bin: string; count: number }[] = [];
  const values = [2, 5, 12, 25, 42, 68, 95, 120, 105, 85, 62, 40, 22, 10, 4];
  for (let i = 0; i < values.length; i++) {
    bins.push({ bin: `${(i * 50 + 500)}K`, count: values[i] });
  }
  return {
    histogram: bins,
    mean: 850000,
    p5: 550000,
    p25: 700000,
    p50: 840000,
    p75: 980000,
    p95: 1200000,
    var95: 1150000,
    var99: 1350000,
  };
}

function generateScenarios(): Scenario[] {
  return [
    {
      id: 1, name: "אופטימי", description: "צמיחה מואצת בשוק",
      variables: [
        { name: "גידול הכנסות", base: 10, adjusted: 25 },
        { name: "עלות חומרי גלם", base: 5, adjusted: 2 },
        { name: "שער דולר", base: 3.62, adjusted: 3.50 },
      ],
      resultImpact: 450000,
    },
    {
      id: 2, name: "בסיסי", description: "המשך מגמה נוכחית",
      variables: [
        { name: "גידול הכנסות", base: 10, adjusted: 10 },
        { name: "עלות חומרי גלם", base: 5, adjusted: 5 },
        { name: "שער דולר", base: 3.62, adjusted: 3.62 },
      ],
      resultImpact: 0,
    },
    {
      id: 3, name: "פסימי", description: "האטה כלכלית",
      variables: [
        { name: "גידול הכנסות", base: 10, adjusted: -5 },
        { name: "עלות חומרי גלם", base: 5, adjusted: 12 },
        { name: "שער דולר", base: 3.62, adjusted: 3.85 },
      ],
      resultImpact: -680000,
    },
  ];
}

function generateStressTests(): StressTest[] {
  return [
    { id: 1, name: "מלחמה ממושכת", description: "סגירת נמלים, עלייה בביטחון", severity: "catastrophic", resilienceScore: 42, estimatedLoss: 2500000 },
    { id: 2, name: "מיתון עולמי", description: "ירידת 30% בביקוש", severity: "extreme", resilienceScore: 58, estimatedLoss: 1800000 },
    { id: 3, name: "שיבוש שרשרת אספקה", description: "עיכוב 3 חודשים בייבוא", severity: "high", resilienceScore: 65, estimatedLoss: 1200000 },
    { id: 4, name: "מתקפת סייבר", description: "השבתת מערכות ל-2 שבועות", severity: "extreme", resilienceScore: 48, estimatedLoss: 950000 },
    { id: 5, name: "קריסת לקוח מרכזי", description: "אובדן 25% מההכנסות", severity: "high", resilienceScore: 55, estimatedLoss: 1400000 },
  ];
}

const riskTrendData = [
  { month: "אוק", total: 28, high: 8, medium: 12, low: 8 },
  { month: "נוב", total: 31, high: 9, medium: 14, low: 8 },
  { month: "דצמ", total: 29, high: 7, medium: 13, low: 9 },
  { month: "ינו", total: 33, high: 10, medium: 14, low: 9 },
  { month: "פבר", total: 30, high: 8, medium: 13, low: 9 },
  { month: "מרץ", total: 32, high: 9, medium: 13, low: 10 },
];

/* ── Component ─────────────────────────────────────────── */
export default function RiskManagementPage() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [simType, setSimType] = useState("revenue");
  const [simIterations, setSimIterations] = useState("10000");
  const [simRunning, setSimRunning] = useState(false);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);

  const { data: risksRaw } = useQuery({
    queryKey: ["risks"],
    queryFn: async () => {
      try {
        const res = await authFetch(`${API}/risks`);
        if (!res.ok) throw new Error();
        return await res.json();
      } catch {
        return null;
      }
    },
  });

  const risks: Risk[] = useMemo(() => risksRaw ?? generateRisks(), [risksRaw]);
  const scenarios = useMemo(() => generateScenarios(), []);
  const stressTests = useMemo(() => generateStressTests(), []);

  const runSimulation = () => {
    setSimRunning(true);
    setTimeout(() => {
      setSimResult(generateSimResult());
      setSimRunning(false);
    }, 1500);
  };

  /* KPIs */
  const totalRisks = risks.length;
  const highRisks = risks.filter((r) => r.score >= 16).length;
  const mediumRisks = risks.filter((r) => r.score >= 5 && r.score < 16).length;
  const avgScore = Math.round(risks.reduce((s, r) => s + r.score, 0) / totalRisks);

  /* 5x5 Matrix data */
  const matrixRisks = risks.reduce<Record<string, Risk[]>>((acc, r) => {
    const key = `${r.probability}-${r.impact}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  /* Category distribution */
  const categoryDist = risks.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + 1;
    return acc;
  }, {});
  const categoryData = Object.entries(categoryDist).map(([cat, count]) => ({ category: cat, count }));

  return (
    <div className="min-h-screen bg-background p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">ניהול סיכונים וסימולציות</h1>
        <p className="text-muted-foreground mt-1">מטריצת סיכונים, מונטה קרלו, תרחישים ומבחני קיצון</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/10"><ShieldAlert className="h-6 w-6 text-blue-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">סה"כ סיכונים</p>
              <p className="text-2xl font-bold">{totalRisks}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-red-500/10"><AlertTriangle className="h-6 w-6 text-red-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">סיכונים גבוהים</p>
              <p className="text-2xl font-bold text-red-500">{highRisks}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-500/10"><Activity className="h-6 w-6 text-amber-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">סיכונים בינוניים</p>
              <p className="text-2xl font-bold text-amber-500">{mediumRisks}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple-500/10"><Gauge className="h-6 w-6 text-purple-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">ציון ממוצע</p>
              <p className="text-2xl font-bold">{avgScore}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start flex-wrap">
          <TabsTrigger value="dashboard">לוח בקרה</TabsTrigger>
          <TabsTrigger value="register">רישום סיכונים</TabsTrigger>
          <TabsTrigger value="montecarlo">מונטה קרלו</TabsTrigger>
          <TabsTrigger value="scenarios">ניתוח תרחישים</TabsTrigger>
          <TabsTrigger value="stress">מבחני קיצון</TabsTrigger>
        </TabsList>

        {/* ── Dashboard Tab ──────────────────────────── */}
        <TabsContent value="dashboard" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 5x5 Risk Matrix */}
            <Card>
              <CardHeader>
                <CardTitle>מטריצת סיכונים 5x5</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <div className="absolute -right-6 top-1/2 -translate-y-1/2 -rotate-90 text-xs text-muted-foreground font-medium whitespace-nowrap">
                    השפעה ←
                  </div>
                  <div className="mr-4">
                    <div className="grid grid-cols-6 gap-1">
                      {/* Header row */}
                      <div className="text-center text-xs text-muted-foreground p-1"></div>
                      {[1, 2, 3, 4, 5].map((p) => (
                        <div key={p} className="text-center text-xs text-muted-foreground p-1">{p}</div>
                      ))}
                      {/* Matrix rows (impact 5 to 1) */}
                      {[5, 4, 3, 2, 1].map((impact) => (
                        <>
                          <div key={`label-${impact}`} className="text-center text-xs text-muted-foreground p-1 flex items-center justify-center">
                            {impact}
                          </div>
                          {[1, 2, 3, 4, 5].map((prob) => {
                            const key = `${prob}-${impact}`;
                            const cellRisks = matrixRisks[key] || [];
                            return (
                              <div
                                key={key}
                                className={`${matrixColor(prob, impact)} rounded-lg p-1.5 min-h-[40px] flex items-center justify-center text-xs font-bold transition-all hover:scale-105 cursor-default`}
                                title={cellRisks.map((r) => r.name).join(", ") || "אין סיכונים"}
                              >
                                {cellRisks.length > 0 ? cellRisks.length : ""}
                              </div>
                            );
                          })}
                        </>
                      ))}
                    </div>
                    <div className="text-center text-xs text-muted-foreground mt-2">→ הסתברות</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Category Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>התפלגות לפי קטגוריה</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="category" width={80} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Risk Trends */}
          <Card>
            <CardHeader>
              <CardTitle>מגמת סיכונים לאורך זמן</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={riskTrendData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="high" stackId="1" fill="#ef4444" stroke="#ef4444" name="גבוה" fillOpacity={0.6} />
                    <Area type="monotone" dataKey="medium" stackId="1" fill="#f59e0b" stroke="#f59e0b" name="בינוני" fillOpacity={0.6} />
                    <Area type="monotone" dataKey="low" stackId="1" fill="#22c55e" stroke="#22c55e" name="נמוך" fillOpacity={0.6} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Risk Register Tab ──────────────────────── */}
        <TabsContent value="register" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">שם סיכון</TableHead>
                    <TableHead className="text-center">קטגוריה</TableHead>
                    <TableHead className="text-center">הסתברות</TableHead>
                    <TableHead className="text-center">השפעה</TableHead>
                    <TableHead className="text-center">ציון</TableHead>
                    <TableHead className="text-center">מגמה</TableHead>
                    <TableHead className="text-center">סטטוס</TableHead>
                    <TableHead className="text-right">אחראי</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {risks.sort((a, b) => b.score - a.score).map((risk) => (
                    <TableRow key={risk.id}>
                      <TableCell className="font-medium">{risk.name}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={`${categoryColors[risk.category] || "bg-gray-500"} text-foreground`}>
                          {risk.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-mono">{risk.probability}/5</TableCell>
                      <TableCell className="text-center font-mono">{risk.impact}/5</TableCell>
                      <TableCell className="text-center">
                        <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full font-bold text-sm ${
                          risk.score >= 16 ? "bg-red-500/20 text-red-500" :
                          risk.score >= 10 ? "bg-orange-500/20 text-orange-500" :
                          risk.score >= 5 ? "bg-yellow-500/20 text-yellow-600" :
                          "bg-green-500/20 text-green-500"
                        }`}>
                          {risk.score}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {risk.trend === "up" && <ArrowUp className="h-4 w-4 text-red-500 mx-auto" />}
                        {risk.trend === "down" && <ArrowDown className="h-4 w-4 text-green-500 mx-auto" />}
                        {risk.trend === "stable" && <Minus className="h-4 w-4 text-muted-foreground mx-auto" />}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={statusVariants[risk.status]}>{statusLabels[risk.status]}</Badge>
                      </TableCell>
                      <TableCell>{risk.owner}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Monte Carlo Tab ────────────────────────── */}
        <TabsContent value="montecarlo" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FlaskConical className="h-5 w-5" /> סימולציית מונטה קרלו</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Parameters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">סוג סימולציה</label>
                  <Select value={simType} onValueChange={setSimType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="revenue">תחזית הכנסות</SelectItem>
                      <SelectItem value="costs">תחזית עלויות</SelectItem>
                      <SelectItem value="project">לוחות זמנים</SelectItem>
                      <SelectItem value="cashflow">תזרים מזומנים</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">מספר איטרציות</label>
                  <Input type="number" value={simIterations} onChange={(e) => setSimIterations(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <Button className="w-full" onClick={runSimulation} disabled={simRunning}>
                    {simRunning ? (
                      <><Loader2 className="h-4 w-4 ml-2 animate-spin" /> מריץ סימולציה...</>
                    ) : (
                      <><Play className="h-4 w-4 ml-2" /> הרץ סימולציה</>
                    )}
                  </Button>
                </div>
              </div>

              {/* Results */}
              {simResult && (
                <div className="space-y-6">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={simResult.histogram}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                        <XAxis dataKey="bin" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="תדירות" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "ממוצע", value: simResult.mean },
                      { label: "חציון (P50)", value: simResult.p50 },
                      { label: "VaR 95%", value: simResult.var95, color: "text-amber-500" },
                      { label: "VaR 99%", value: simResult.var99, color: "text-red-500" },
                    ].map((s) => (
                      <div key={s.label} className="bg-muted/50 rounded-lg p-4 text-center">
                        <p className="text-sm text-muted-foreground">{s.label}</p>
                        <p className={`text-xl font-bold font-mono ${s.color || ""}`}>{fmt(s.value)}</p>
                      </div>
                    ))}
                  </div>

                  <div className="bg-muted/30 rounded-xl p-5">
                    <h4 className="font-semibold mb-3">רווחי סמך</h4>
                    <div className="space-y-2">
                      {[
                        { label: "90% (P5-P95)", low: simResult.p5, high: simResult.p95 },
                        { label: "50% (P25-P75)", low: simResult.p25, high: simResult.p75 },
                      ].map((ci) => (
                        <div key={ci.label} className="flex items-center gap-4">
                          <span className="text-sm w-32">{ci.label}</span>
                          <div className="flex-1 bg-muted rounded-full h-6 relative overflow-hidden">
                            <div
                              className="absolute h-full bg-blue-500/30 rounded-full"
                              style={{
                                left: `${(ci.low / simResult.p95) * 80}%`,
                                width: `${((ci.high - ci.low) / simResult.p95) * 80}%`,
                              }}
                            />
                          </div>
                          <span className="text-sm font-mono w-48 text-left">
                            {fmt(ci.low)} – {fmt(ci.high)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!simResult && !simRunning && (
                <div className="text-center py-16 text-muted-foreground">
                  <FlaskConical className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>הגדר פרמטרים ולחץ "הרץ סימולציה" לקבלת תוצאות</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Scenarios Tab ──────────────────────────── */}
        <TabsContent value="scenarios" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {scenarios.map((sc) => (
              <Card key={sc.id} className={`border-t-4 ${
                sc.resultImpact > 0 ? "border-t-green-500" : sc.resultImpact < 0 ? "border-t-red-500" : "border-t-blue-500"
              }`}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{sc.name}</span>
                    <span className={`text-lg font-mono ${
                      sc.resultImpact > 0 ? "text-green-500" : sc.resultImpact < 0 ? "text-red-500" : "text-muted-foreground"
                    }`}>
                      {sc.resultImpact > 0 ? "+" : ""}{fmt(sc.resultImpact)}
                    </span>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{sc.description}</p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {sc.variables.map((v) => (
                      <div key={v.name} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>{v.name}</span>
                          <span className="font-mono">
                            <span className="text-muted-foreground">{v.base}</span>
                            {" → "}
                            <span className={v.adjusted > v.base ? "text-green-500" : v.adjusted < v.base ? "text-red-500" : ""}>
                              {v.adjusted}
                            </span>
                          </span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className={`h-full rounded-full ${v.adjusted >= v.base ? "bg-green-500" : "bg-red-500"}`}
                            style={{ width: `${Math.min((v.adjusted / (v.base * 2)) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Stress Tests Tab ───────────────────────── */}
        <TabsContent value="stress" className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {stressTests.map((st) => (
              <Card key={st.id}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-bold text-lg">{st.name}</h3>
                        <Badge variant={
                          st.severity === "catastrophic" ? "destructive" :
                          st.severity === "extreme" ? "secondary" : "outline"
                        }>
                          {st.severity === "catastrophic" ? "קטסטרופלי" : st.severity === "extreme" ? "קיצוני" : "גבוה"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{st.description}</p>
                    </div>
                    <div className="flex items-center gap-8">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">ציון חוסן</p>
                        <div className="relative w-16 h-16">
                          <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted" />
                            <circle
                              cx="18" cy="18" r="15.9" fill="none"
                              strokeWidth="2"
                              strokeDasharray={`${st.resilienceScore} ${100 - st.resilienceScore}`}
                              className={st.resilienceScore >= 60 ? "stroke-green-500" : st.resilienceScore >= 40 ? "stroke-amber-500" : "stroke-red-500"}
                            />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">
                            {st.resilienceScore}
                          </span>
                        </div>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">הפסד משוער</p>
                        <p className="text-xl font-bold font-mono text-red-500">{fmt(st.estimatedLoss)}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
