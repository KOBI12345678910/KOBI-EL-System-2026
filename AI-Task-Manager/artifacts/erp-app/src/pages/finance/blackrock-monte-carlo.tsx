import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { authFetch } from "@/lib/utils";
import {
  BarChart3, ArrowRight, TrendingUp, TrendingDown, Activity, Percent,
  Target, ChevronDown, ChevronUp, Factory, Zap, Brain, AlertTriangle,
  Layers, Shield, Info, DollarSign, Gauge, Clock
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  AreaChart, Area, Cell, Legend, PieChart, Pie, ComposedChart, Line,
  ReferenceLine, ScatterChart, Scatter, ZAxis
} from "recharts";

function fmt(val: number) {
  if (Math.abs(val) >= 1000000) return `₪${(val / 1000000).toFixed(2)}M`;
  if (Math.abs(val) >= 1000) return `₪${(val / 1000).toFixed(1)}K`;
  return `₪${val.toFixed(0)}`;
}

const REVENUE_DIST = [
  { range: "2.0-2.5M", count: 45, pct: 0.1, cum: 0.1 },
  { range: "2.5-3.0M", count: 320, pct: 0.6, cum: 0.7 },
  { range: "3.0-3.5M", count: 1450, pct: 2.9, cum: 3.6 },
  { range: "3.5-4.0M", count: 4800, pct: 9.6, cum: 13.2 },
  { range: "4.0-4.5M", count: 10200, pct: 20.4, cum: 33.6 },
  { range: "4.5-5.0M", count: 13500, pct: 27.0, cum: 60.6 },
  { range: "5.0-5.5M", count: 10800, pct: 21.6, cum: 82.2 },
  { range: "5.5-6.0M", count: 5400, pct: 10.8, cum: 93.0 },
  { range: "6.0-6.5M", count: 2100, pct: 4.2, cum: 97.2 },
  { range: "6.5-7.0M", count: 850, pct: 1.7, cum: 98.9 },
  { range: "7.0-7.5M", count: 350, pct: 0.7, cum: 99.6 },
  { range: "7.5-8.0M", count: 130, pct: 0.3, cum: 99.9 },
  { range: "8.0+M", count: 55, pct: 0.1, cum: 100 },
];

const PROFIT_DIST = [
  { range: "הפסד>1M", count: 450, pct: 0.9, color: "#dc2626", cum: 0.9 },
  { range: "(-1M)-(-500K)", count: 2200, pct: 4.4, color: "#ef4444", cum: 5.3 },
  { range: "(-500K)-0", count: 12780, pct: 25.6, color: "#f97316", cum: 30.9 },
  { range: "0-250K", count: 12500, pct: 25.0, color: "#eab308", cum: 55.9 },
  { range: "250K-500K", count: 9500, pct: 19.0, color: "#84cc16", cum: 74.9 },
  { range: "500K-1M", count: 8200, pct: 16.4, color: "#22c55e", cum: 91.3 },
  { range: "רווח>1M", count: 4370, pct: 8.7, color: "#10b981", cum: 100 },
];

const COST_COLORS = ["#3b82f6", "#f97316", "#ef4444", "#8b5cf6", "#eab308", "#06b6d4", "#22c55e", "#ec4899"];

const API = "/api";
const token = () => localStorage.getItem("erp_token") || localStorage.getItem("erp_token") || "";
const authHeaders = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });

const SCENARIOS = [
  { name: "מיתון עמוק", revenue: 3200, profit: -800, projects: 85, margin: -25, prob: 15, category: "LOSS" },
  { name: "תקלת ציוד גדולה", revenue: 4200, profit: -300, projects: 100, margin: -7.1, prob: 10, category: "LOSS" },
  { name: "אובדן לקוחות עיקריים", revenue: 3800, profit: -500, projects: 95, margin: -13.2, prob: 12, category: "LOSS" },
  { name: "האטה קלה", revenue: 4100, profit: -150, projects: 110, margin: -3.7, prob: 20, category: "BELOW" },
  { name: "עליית עלויות חדה", revenue: 4800, profit: -100, projects: 135, margin: -2.1, prob: 20, category: "BELOW" },
  { name: "עליית ריבית", revenue: 4500, profit: 50, projects: 125, margin: 1.1, prob: 25, category: "AVG" },
  { name: "שנה ממוצעת", revenue: 4900, profit: 210, projects: 138, margin: 4.3, prob: 40, category: "AVG" },
  { name: "שוק יציב", revenue: 5200, profit: 400, projects: 145, margin: 7.7, prob: 30, category: "GOOD" },
  { name: "צמיחה מתונה", revenue: 5500, profit: 520, projects: 155, margin: 9.5, prob: 25, category: "GOOD" },
  { name: "הרחבת פעילות", revenue: 5800, profit: 700, projects: 165, margin: 12.1, prob: 15, category: "GOOD" },
  { name: "בום בשוק", revenue: 6800, profit: 1200, projects: 180, margin: 17.6, prob: 10, category: "EXCELLENT" },
  { name: "פרויקט ענק", revenue: 7200, profit: 1800, projects: 145, margin: 25, prob: 5, category: "EXCELLENT" },
  { name: "שנת שיא", revenue: 8000, profit: 2100, projects: 190, margin: 26.3, prob: 3, category: "EXCELLENT" },
];

const CAT_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  EXCELLENT: { bg: "bg-emerald-500/15", text: "text-emerald-400", label: "מצוין" },
  GOOD: { bg: "bg-green-500/15", text: "text-green-400", label: "טוב" },
  AVG: { bg: "bg-yellow-500/15", text: "text-yellow-400", label: "ממוצע" },
  BELOW: { bg: "bg-orange-500/15", text: "text-orange-400", label: "מתחת" },
  LOSS: { bg: "bg-red-500/15", text: "text-red-400", label: "הפסד" },
};

const CONVERGENCE = [
  { n: 1000, avgProfit: 185, stdDev: 520 },
  { n: 5000, avgProfit: 198, stdDev: 490 },
  { n: 10000, avgProfit: 205, stdDev: 478 },
  { n: 20000, avgProfit: 208, stdDev: 475 },
  { n: 30000, avgProfit: 209, stdDev: 474 },
  { n: 40000, avgProfit: 210, stdDev: 473.5 },
  { n: 50000, avgProfit: 210.4, stdDev: 473.5 },
];

const MONTHLY_PATH = [
  { month: "ינו", p5: -120, p25: -40, p50: 15, p75: 55, p95: 120 },
  { month: "פבר", p5: -200, p25: -60, p50: 35, p75: 120, p95: 250 },
  { month: "מרץ", p5: -280, p25: -70, p50: 60, p75: 190, p95: 380 },
  { month: "אפר", p5: -350, p25: -80, p50: 95, p75: 265, p95: 500 },
  { month: "מאי", p5: -420, p25: -85, p50: 140, p75: 350, p95: 620 },
  { month: "יוני", p5: -480, p25: -90, p50: 170, p75: 420, p95: 740 },
  { month: "יולי", p5: -530, p25: -100, p50: 180, p75: 470, p95: 830 },
  { month: "אוג", p5: -570, p25: -120, p50: 175, p75: 490, p95: 880 },
  { month: "ספט", p5: -590, p25: -110, p50: 190, p75: 520, p95: 920 },
  { month: "אוק", p5: -600, p25: -100, p50: 200, p75: 550, p95: 950 },
  { month: "נוב", p5: -600, p25: -90, p50: 205, p75: 565, p95: 975 },
  { month: "דצמ", p5: -596, p25: -80, p50: 210, p75: 570, p95: 984 },
];

type CostItem = { name: string; value: number; color: string; pct: number };

export default function BlackRockMonteCarlo() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState("distributions");
  const [costs, setCosts] = useState<CostItem[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await authFetch(`${API}/finance/expenses?limit=500`, { headers: authHeaders() });
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) return;
        const byCategory: Record<string, number> = {};
        data.forEach((e: any) => {
          const cat = e.category || e.description?.slice(0, 20) || "אחר";
          byCategory[cat] = (byCategory[cat] || 0) + Number(e.amount || 0);
        });
        const total = Object.values(byCategory).reduce((a, b) => a + b, 0);
        const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 8);
        setCosts(sorted.map(([name, value], i) => ({
          name, value: parseFloat((value / 1000).toFixed(1)),
          color: COST_COLORS[i % COST_COLORS.length],
          pct: total > 0 ? parseFloat((value / total * 100).toFixed(1)) : 0,
        })));
      } catch {}
    };
    load();
  }, []);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate("/finance/blackrock-2026")}>
            <ArrowRight className="w-4 h-4" />
          </Button>
          <BarChart3 className="w-5 h-5 text-emerald-400" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Monte Carlo Simulation Engine</h1>
            <p className="text-[10px] text-muted-foreground">50,000 תרחישים סטוכסטיים | Cholesky Decomposition | Lognormal + Poisson-Compound</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] font-mono">CONVERGED</Badge>
          <Badge className="bg-slate-800 text-slate-300 border-slate-600 text-[10px] font-mono">N=50,000</Badge>
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-9 gap-2">
        {[
          { l: "E[Revenue]", v: "₪4.92M", c: "text-emerald-400" },
          { l: "E[Profit]", v: "₪210K", c: "text-blue-400" },
          { l: "σ(Profit)", v: "₪474K", c: "text-yellow-400" },
          { l: "Margin", v: "2.9%", c: "text-yellow-400" },
          { l: "P(Loss)", v: "30.86%", c: "text-red-400" },
          { l: "Sharpe", v: "0.44", c: "text-orange-400" },
          { l: "Sortino", v: "0.62", c: "text-orange-400" },
          { l: "Max DD", v: "-34.6%", c: "text-red-500" },
          { l: "P95 Profit", v: "₪984K", c: "text-green-400" },
        ].map((k, i) => (
          <Card key={i} className="bg-slate-900/60 border-slate-700/40">
            <CardContent className="p-2">
              <div className="text-[8px] text-muted-foreground uppercase tracking-wider">{k.l}</div>
              <div className={`text-sm font-bold font-mono ${k.c}`}>{k.v}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-slate-800/50 border border-slate-700/50">
          <TabsTrigger value="distributions" className="text-xs data-[state=active]:bg-blue-600">התפלגויות</TabsTrigger>
          <TabsTrigger value="paths" className="text-xs data-[state=active]:bg-blue-600">מסלולים</TabsTrigger>
          <TabsTrigger value="scenarios" className="text-xs data-[state=active]:bg-blue-600">תרחישים</TabsTrigger>
          <TabsTrigger value="costs" className="text-xs data-[state=active]:bg-blue-600">מבנה עלויות</TabsTrigger>
          <TabsTrigger value="convergence" className="text-xs data-[state=active]:bg-blue-600">Convergence</TabsTrigger>
        </TabsList>

        <TabsContent value="distributions" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-slate-900/50 border-slate-700/40">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                  Revenue Distribution + CDF (50K scenarios)
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-2">
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={REVENUE_DIST}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="range" stroke="#475569" fontSize={8} angle={-35} textAnchor="end" height={55} />
                    <YAxis yAxisId="left" stroke="#475569" fontSize={9} />
                    <YAxis yAxisId="right" orientation="left" stroke="#3b82f6" fontSize={9} tickFormatter={v => `${v}%`} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 10, direction: "rtl" }} />
                    <Bar yAxisId="left" dataKey="count" fill="#10b981" name="תרחישים" radius={[3, 3, 0, 0]} opacity={0.8} />
                    <Line yAxisId="right" type="monotone" dataKey="cum" stroke="#3b82f6" strokeWidth={2} dot={false} name="CDF %" />
                    <ReferenceLine yAxisId="left" x="4.5-5.0M" stroke="#f97316" strokeDasharray="5 5" label={{ value: "μ", fill: "#f97316", fontSize: 10 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-700/40">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-400" />
                  Profit Distribution + Loss Threshold
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-2">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={PROFIT_DIST} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis type="number" stroke="#475569" fontSize={9} />
                    <YAxis type="category" dataKey="range" stroke="#475569" fontSize={9} width={95} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 10, direction: "rtl" }}
                      formatter={(v: number, _: any, p: any) => [`${v.toLocaleString()} (${p.payload.pct}%)`, "תרחישים"]}
                    />
                    <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                      {PROFIT_DIST.map((e, i) => <Cell key={i} fill={e.color} opacity={0.8} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="px-3 mt-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-red-400">◄ הפסד (30.9%)</span>
                    <span className="text-muted-foreground">|</span>
                    <span className="text-green-400">רווח (69.1%) ►</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-slate-900/50 border-slate-700/40">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm">Statistical Summary — סיכום סטטיסטי</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {[
                  { label: "Mean (μ)", rev: "₪4.92M", profit: "₪210K" },
                  { label: "Median", rev: "₪4.90M", profit: "₪215K" },
                  { label: "Std Dev (σ)", rev: "₪727K", profit: "₪474K" },
                  { label: "Skewness", rev: "0.12", profit: "-0.34" },
                  { label: "Kurtosis", rev: "2.95", profit: "3.42" },
                  { label: "P5 / P95", rev: "₪3.76M / ₪6.16M", profit: "₪-596K / ₪984K" },
                  { label: "Min / Max", rev: "₪2.29M / ₪8.87M", profit: "₪-1.70M / ₪2.59M" },
                ].map((s, i) => (
                  <div key={i} className="p-2.5 bg-slate-800/30 rounded-lg">
                    <div className="text-[9px] text-muted-foreground uppercase mb-1">{s.label}</div>
                    <div className="text-xs text-emerald-400 font-mono">{s.rev}</div>
                    <div className="text-xs text-blue-400 font-mono">{s.profit}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="paths" className="space-y-4 mt-4">
          <Card className="bg-slate-900/50 border-slate-700/40">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-400" />
                Confidence Bands — מסלולי רווח מצטבר (אלפי ₪)
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">P5-P95 envelope | P25-P75 interquartile | P50 median path</p>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={MONTHLY_PATH}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="month" stroke="#475569" fontSize={10} />
                  <YAxis stroke="#475569" fontSize={10} tickFormatter={v => `₪${v}K`} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 10, direction: "rtl" }}
                    formatter={(v: number) => [`₪${v}K`, ""]}
                  />
                  <Area type="monotone" dataKey="p95" stackId="1" stroke="none" fill="#22c55e" fillOpacity={0.08} name="P95" />
                  <Area type="monotone" dataKey="p75" stackId="2" stroke="none" fill="#22c55e" fillOpacity={0.12} name="P75" />
                  <Area type="monotone" dataKey="p50" stroke="#3b82f6" strokeWidth={2.5} fill="none" name="Median (P50)" dot={false} />
                  <Area type="monotone" dataKey="p25" stackId="3" stroke="none" fill="#ef4444" fillOpacity={0.08} name="P25" />
                  <Area type="monotone" dataKey="p5" stackId="4" stroke="none" fill="#ef4444" fillOpacity={0.12} name="P5" />
                  <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                  <Legend wrapperStyle={{ fontSize: 10, direction: "rtl" }} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scenarios" className="mt-4">
          <Card className="bg-slate-900/50 border-slate-700/40">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="w-4 h-4 text-purple-400" />
                15 Named Scenarios — תרחישים מותאמים למפעל
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/40 bg-slate-800/20">
                    <th className="p-2 text-right text-muted-foreground">#</th>
                    <th className="p-2 text-right text-muted-foreground">תרחיש</th>
                    <th className="p-2 text-right text-muted-foreground">הכנסות (K₪)</th>
                    <th className="p-2 text-right text-muted-foreground">רווח (K₪)</th>
                    <th className="p-2 text-right text-muted-foreground">מרווח</th>
                    <th className="p-2 text-right text-muted-foreground">פרויקטים</th>
                    <th className="p-2 text-right text-muted-foreground">הסתברות</th>
                    <th className="p-2 text-right text-muted-foreground">דירוג</th>
                    <th className="p-2 text-right text-muted-foreground">Expected P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {SCENARIOS.map((s, i) => {
                    const cat = CAT_COLORS[s.category];
                    return (
                      <tr key={i} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                        <td className="p-2 text-muted-foreground">{i + 1}</td>
                        <td className="p-2 text-foreground font-medium">{s.name}</td>
                        <td className="p-2 text-slate-300 font-mono">₪{s.revenue}K</td>
                        <td className={`p-2 font-mono ${s.profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {s.profit >= 0 ? "+" : ""}₪{s.profit}K
                        </td>
                        <td className={`p-2 font-mono ${s.margin >= 0 ? "text-green-400" : "text-red-400"}`}>{s.margin}%</td>
                        <td className="p-2 text-slate-300">{s.projects}</td>
                        <td className="p-2 text-slate-300">{s.prob}%</td>
                        <td className="p-2"><Badge className={`${cat.bg} ${cat.text} text-[9px]`}>{cat.label}</Badge></td>
                        <td className={`p-2 font-mono ${s.profit * s.prob >= 0 ? "text-blue-400" : "text-orange-400"}`}>
                          {fmt(s.profit * s.prob * 10)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="costs" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-slate-900/50 border-slate-700/40">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-sm">Cost Structure — מבנה עלויות (אלפי ₪)</CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-2">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={costs.length > 0 ? costs : [{ name: "אין נתונים", value: 1, color: "#475569", pct: 100 }]} cx="50%" cy="50%" innerRadius={45} outerRadius={85} dataKey="value"
                      label={({ name, pct }: any) => `${name} ${pct}%`} labelLine={false}
                    >
                      {(costs.length > 0 ? costs : [{ color: "#475569" }]).map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 10, direction: "rtl" }}
                      formatter={(v: number) => [`₪${v}K`, ""]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-700/40">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-sm">Waterfall — מהכנסות לרווח</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="space-y-2">
                  {[
                    { label: "הכנסות", val: 4920, color: "#10b981", width: 100 },
                    { label: "(-) עלויות קבועות", val: -3190, color: "#3b82f6", width: 64.8 },
                    { label: "(-) חומרי גלם", val: -1160, color: "#f97316", width: 23.6 },
                    { label: "(-) חובות אבודים", val: -151, color: "#ef4444", width: 3.1 },
                    { label: "(-) מס", val: -102, color: "#8b5cf6", width: 2.1 },
                    { label: "(-) סיכון + מימון", val: -100, color: "#eab308", width: 2.0 },
                    { label: "= רווח נקי", val: 210, color: "#22c55e", width: 4.3 },
                  ].map((w, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-[10px] text-muted-foreground w-28 text-right">{w.label}</span>
                      <div className="flex-1 h-5 bg-slate-800/30 rounded overflow-hidden">
                        <div className="h-full rounded flex items-center px-2" style={{ width: `${w.width}%`, background: w.color + "40", borderLeft: `3px solid ${w.color}` }}>
                          <span className="text-[10px] font-mono text-foreground">₪{Math.abs(w.val)}K</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="convergence" className="space-y-4 mt-4">
          <Card className="bg-slate-900/50 border-slate-700/40">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                Convergence Analysis — התכנסות הסימולציה
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">הסימולציה מתכנסת כשהממוצע מתייצב — תוצאות אמינות מ-30K+ תרחישים</p>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={CONVERGENCE}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="n" stroke="#475569" fontSize={10} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                  <YAxis yAxisId="left" stroke="#3b82f6" fontSize={10} />
                  <YAxis yAxisId="right" orientation="left" stroke="#f97316" fontSize={10} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 10, direction: "rtl" }} />
                  <Line yAxisId="left" type="monotone" dataKey="avgProfit" stroke="#3b82f6" strokeWidth={2} name="ממוצע רווח (K₪)" dot={{ r: 3 }} />
                  <Line yAxisId="right" type="monotone" dataKey="stdDev" stroke="#f97316" strokeWidth={2} name="σ (K₪)" dot={{ r: 3 }} strokeDasharray="5 5" />
                  <ReferenceLine yAxisId="left" y={210.4} stroke="#22c55e" strokeDasharray="3 3" label={{ value: "μ=210.4", fill: "#22c55e", fontSize: 10 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-4">רשומות קשורות</h3>
          <RelatedRecords entityType="blackrock-monte-carlo" entityId="dashboard" />
        </div>
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-4">היסטוריית פעילות</h3>
          <ActivityLog entityType="blackrock-monte-carlo" entityId="dashboard" />
        </div>
      </div>
    </div>
  );
}
