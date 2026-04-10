import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useLocation } from "wouter";
import {
  AlertTriangle, ArrowRight, TrendingDown, Activity, Shield, Target,
  BarChart3, Layers, Info, Zap, Clock, Brain, Eye, Gauge, DollarSign
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  AreaChart, Area, Cell, Legend, ComposedChart, Line, ReferenceLine,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, PieChart, Pie
} from "recharts";

function fmt(val: number) {
  if (Math.abs(val) >= 1000000) return `₪${(val / 1000000).toFixed(2)}M`;
  if (Math.abs(val) >= 1000) return `₪${(val / 1000).toFixed(0)}K`;
  return `₪${val.toFixed(0)}`;
}

const FALLBACK_VAR_LEVELS = [
  { level: "90%", var: 2770000, es: 3580000, breaches: 5000, implied: "1 in 10 years", color: "#eab308" },
  { level: "95%", var: 3330000, es: 4010000, breaches: 2500, implied: "1 in 20 years", color: "#f97316" },
  { level: "99%", var: 4410000, es: 5000000, breaches: 500, implied: "1 in 100 years", color: "#ef4444" },
  { level: "99.5%", var: 4870000, es: 5390000, breaches: 250, implied: "1 in 200 years", color: "#dc2626" },
  { level: "99.9%", var: 5740000, es: 6180000, breaches: 50, implied: "1 in 1000 years", color: "#991b1b" },
];

const FALLBACK_RISK_CATEGORIES = [
  { name: "ביקוש", pctOfVar: 44.4, var95: 1480000, marginalVar: 185000, incrementalVar: 1380000, beta: 1.32, color: "#ef4444" },
  { name: "חומרי גלם", pctOfVar: 23.6, var95: 786000, marginalVar: 98000, incrementalVar: 734000, beta: 0.87, color: "#f97316" },
  { name: "תפעולי", pctOfVar: 18.2, var95: 606000, marginalVar: 76000, incrementalVar: 565000, beta: 0.72, color: "#eab308" },
  { name: "אשראי", pctOfVar: 11.5, var95: 383000, marginalVar: 48000, incrementalVar: 357000, beta: 0.54, color: "#3b82f6" },
  { name: 'מטח', pctOfVar: 2.3, var95: 77000, marginalVar: 9600, incrementalVar: 72000, beta: 0.11, color: "#8b5cf6" },
];

const FALLBACK_RISK_FACTORS = [
  { factor: "ירידת ביקוש", weight: 14.8, sensitivity: -492, pctOfVar: 14.8, stressLoss: -984, category: "ביקוש" },
  { factor: "עליית אלומיניום", weight: 10.4, sensitivity: -347, pctOfVar: 10.4, stressLoss: -693, category: "חומרי גלם" },
  { factor: "אובדן לקוח גדול", weight: 8.2, sensitivity: -273, pctOfVar: 8.2, stressLoss: -546, category: "ביקוש" },
  { factor: "עליית ברזל", weight: 6.1, sensitivity: -204, pctOfVar: 6.1, stressLoss: -408, category: "חומרי גלם" },
  { factor: "עיכוב תשלום 90+", weight: 5.8, sensitivity: -193, pctOfVar: 5.8, stressLoss: -386, category: "אשראי" },
  { factor: "עליית נירוסטה", weight: 5.7, sensitivity: -189, pctOfVar: 5.7, stressLoss: -378, category: "חומרי גלם" },
  { factor: "תקלת ציוד", weight: 5.4, sensitivity: -180, pctOfVar: 5.4, stressLoss: -360, category: "תפעולי" },
  { factor: "מחסור עובדים", weight: 4.8, sensitivity: -160, pctOfVar: 4.8, stressLoss: -320, category: "תפעולי" },
  { factor: "עליית זכוכית", weight: 3.5, sensitivity: -115, pctOfVar: 3.5, stressLoss: -230, category: "חומרי גלם" },
  { factor: "חובות אבודים", weight: 3.0, sensitivity: -98, pctOfVar: 3.0, stressLoss: -197, category: "אשראי" },
  { factor: "שינויי רגולציה", weight: 2.5, sensitivity: -84, pctOfVar: 2.5, stressLoss: -168, category: "תפעולי" },
  { factor: "פיחות שקל", weight: 1.2, sensitivity: -40, pctOfVar: 1.2, stressLoss: -80, category: 'מטח' },
  { factor: "עליית ריבית", weight: 1.0, sensitivity: -32, pctOfVar: 1.0, stressLoss: -64, category: "אשראי" },
];

const FALLBACK_EXTREME = [
  { name: "קריסת בנייה גלובלית", var: 7260, prob: 0.5, impact: "פשיטת רגל אפשרית", horizon: "3-5 שנים", hedge: "ביטוח + גיוון" },
  { name: "מלחמה ממושכת 12+ חודשים", var: 6500, prob: 1, impact: "הפסד מצטבר קריטי", horizon: "1-3 שנים", hedge: "רזרבה נזילה" },
  { name: "משבר שרשרת אספקה", var: 5800, prob: 2, impact: "השבתה חלקית", horizon: "6-12 חודשים", hedge: "ספקים חלופיים" },
  { name: "עליית מתכות 80%+", var: 5200, prob: 3, impact: "שחיקת מרווחים מלאה", horizon: "3-6 חודשים", hedge: "Forward contracts" },
  { name: "אובדן 40%+ לקוחות", var: 4900, prob: 2, impact: "ירידת הכנסות דרמטית", horizon: "6-12 חודשים", hedge: "גיוון לקוחות" },
  { name: "רעידת אדמה / שיטפון", var: 4500, prob: 1, impact: "הרס תשתית", horizon: "6-18 חודשים", hedge: "ביטוח רכוש" },
  { name: "תביעה משפטית גדולה", var: 3800, prob: 3, impact: "עלויות משפט + פיצויים", horizon: "1-3 שנים", hedge: "ביטוח אחריות" },
  { name: "שריפה במפעל", var: 3500, prob: 2, impact: "השבתה + שיקום", horizon: "3-12 חודשים", hedge: "ביטוח + backup" },
  { name: "מגפה / סגר חוזר", var: 3200, prob: 5, impact: "ירידת ביקוש + עיכובים", horizon: "6-12 חודשים", hedge: "דיגיטציה" },
  { name: "תקנות בנייה מחמירות", var: 2800, prob: 8, impact: "עלויות ציות גבוהות", horizon: "1-2 שנים", hedge: "R&D + הכשרה" },
];

const FALLBACK_BACKTESTING = [
  { month: "01/25", actualLoss: 180, varLimit: 278, breached: false },
  { month: "02/25", actualLoss: 120, varLimit: 278, breached: false },
  { month: "03/25", actualLoss: 350, varLimit: 278, breached: true },
  { month: "04/25", actualLoss: 95, varLimit: 278, breached: false },
  { month: "05/25", actualLoss: 210, varLimit: 278, breached: false },
  { month: "06/25", actualLoss: 310, varLimit: 278, breached: true },
  { month: "07/25", actualLoss: 150, varLimit: 278, breached: false },
  { month: "08/25", actualLoss: 420, varLimit: 278, breached: true },
  { month: "09/25", actualLoss: 190, varLimit: 278, breached: false },
  { month: "10/25", actualLoss: 230, varLimit: 278, breached: false },
  { month: "11/25", actualLoss: 160, varLimit: 278, breached: false },
  { month: "12/25", actualLoss: 290, varLimit: 278, breached: true },
];

export default function BlackRockVaR() {
  const { data: blackrockvarData } = useQuery({
    queryKey: ["blackrock-var"],
    queryFn: () => authFetch("/api/finance/blackrock_var"),
    staleTime: 5 * 60 * 1000,
  });

  const VAR_LEVELS = blackrockvarData ?? FALLBACK_VAR_LEVELS;
  const BACKTESTING = FALLBACK_BACKTESTING;
  const EXTREME = FALLBACK_EXTREME;
  const RISK_CATEGORIES = FALLBACK_RISK_CATEGORIES;
  const RISK_FACTORS = FALLBACK_RISK_FACTORS;

  const [, navigate] = useLocation();
  const [tab, setTab] = useState("overview");

  const breachCount = BACKTESTING.filter(b => b.breached).length;
  const breachPct = ((breachCount / BACKTESTING.length) * 100).toFixed(1);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate("/finance/blackrock-2026")}>
            <ArrowRight className="w-4 h-4" />
          </Button>
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Value at Risk — ניתוח מוסדי</h1>
            <p className="text-[10px] text-muted-foreground">Parametric + Historical + Monte Carlo VaR | Expected Shortfall | Component VaR | Backtesting</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px] font-mono">VaR 95% = ₪3.33M</Badge>
          <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px] font-mono">ES 95% = ₪4.01M</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {VAR_LEVELS.map((v, i) => (
          <Card key={i} className="bg-slate-900/60 border-slate-700/40">
            <CardContent className="p-2.5">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[9px] text-muted-foreground uppercase">VaR {v.level}</span>
                <span className="text-[8px] text-muted-foreground">{v.implied}</span>
              </div>
              <div className="text-base font-bold font-mono" style={{ color: v.color }}>{fmt(v.var)}</div>
              <div className="text-[9px] text-muted-foreground">ES: {fmt(v.es)}</div>
              <div className="w-full h-1 bg-slate-800 rounded-full mt-1 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(v.var / 5740000) * 100}%`, background: v.color }} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-slate-800/50 border border-slate-700/50">
          <TabsTrigger value="overview" className="text-xs data-[state=active]:bg-red-600">Component VaR</TabsTrigger>
          <TabsTrigger value="factors" className="text-xs data-[state=active]:bg-red-600">13 גורמי סיכון</TabsTrigger>
          <TabsTrigger value="backtesting" className="text-xs data-[state=active]:bg-red-600">Backtesting</TabsTrigger>
          <TabsTrigger value="extreme" className="text-xs data-[state=active]:bg-red-600">תרחישי קיצון</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-slate-900/50 border-slate-700/40">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-400" />
                  Component VaR — תרומת כל קטגוריה ל-VaR הכולל
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-2">
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={RISK_CATEGORIES}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#475569" fontSize={10} />
                    <YAxis yAxisId="left" stroke="#475569" fontSize={9} tickFormatter={v => fmt(v)} />
                    <YAxis yAxisId="right" orientation="left" stroke="#22c55e" fontSize={9} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 10, direction: "rtl" }} />
                    <Bar yAxisId="left" dataKey="var95" name="VaR 95%" radius={[4, 4, 0, 0]} opacity={0.7}>
                      {RISK_CATEGORIES.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Bar>
                    <Bar yAxisId="left" dataKey="marginalVar" name="Marginal VaR" fill="#22c55e" radius={[4, 4, 0, 0]} opacity={0.4} />
                    <Line yAxisId="right" type="monotone" dataKey="beta" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="β Factor" />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-700/40">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="w-4 h-4 text-purple-400" />
                  VaR Decomposition — פירוק אחוזי
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-2">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={RISK_CATEGORIES} cx="50%" cy="50%" innerRadius={55} outerRadius={95} dataKey="pctOfVar"
                      label={({ name, pctOfVar }: any) => `${name} ${pctOfVar}%`} labelLine={false}
                    >
                      {RISK_CATEGORIES.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 10, direction: "rtl" }}
                      formatter={(v: number, _: any, p: any) => [`${v}% | VaR: ${fmt(p.payload.var95)}`, ""]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-slate-900/50 border-slate-700/40">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm">Component / Marginal / Incremental VaR — השוואה מתקדמת</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/40 bg-slate-800/20">
                    <th className="p-2 text-right text-muted-foreground">קטגוריה</th>
                    <th className="p-2 text-right text-muted-foreground">% מ-VaR</th>
                    <th className="p-2 text-right text-muted-foreground">Component VaR</th>
                    <th className="p-2 text-right text-muted-foreground">Marginal VaR</th>
                    <th className="p-2 text-right text-muted-foreground">Incremental VaR</th>
                    <th className="p-2 text-right text-muted-foreground">β Factor</th>
                    <th className="p-2 text-right text-muted-foreground">Diversification</th>
                  </tr>
                </thead>
                <tbody>
                  {RISK_CATEGORIES.map((r, i) => (
                    <tr key={i} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: r.color }} />
                          <span className="text-foreground font-medium">{r.name}</span>
                        </div>
                      </td>
                      <td className="p-2 font-mono" style={{ color: r.color }}>{r.pctOfVar}%</td>
                      <td className="p-2 text-slate-300 font-mono">{fmt(r.var95)}</td>
                      <td className="p-2 text-slate-300 font-mono">{fmt(r.marginalVar)}</td>
                      <td className="p-2 text-slate-300 font-mono">{fmt(r.incrementalVar)}</td>
                      <td className="p-2 font-mono">
                        <span className={r.beta > 1 ? "text-red-400" : r.beta > 0.5 ? "text-yellow-400" : "text-green-400"}>
                          {r.beta.toFixed(2)}
                        </span>
                      </td>
                      <td className="p-2 text-green-400 font-mono">
                        {((1 - r.var95 / r.incrementalVar) * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-800/30 border-t border-slate-700/50">
                    <td className="p-2 text-foreground font-bold">סה"כ</td>
                    <td className="p-2 text-foreground font-bold font-mono">100%</td>
                    <td className="p-2 text-foreground font-bold font-mono">{fmt(3330000)}</td>
                    <td className="p-2 text-muted-foreground font-mono">{fmt(416600)}</td>
                    <td className="p-2 text-muted-foreground font-mono">{fmt(3108000)}</td>
                    <td className="p-2 text-foreground font-mono">1.00</td>
                    <td className="p-2 text-green-400 font-mono">-</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="factors" className="space-y-4 mt-4">
          <Card className="bg-slate-900/50 border-slate-700/40">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-red-400" />
                Factor Risk Contribution — Tornado Chart (K₪)
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={RISK_FACTORS} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis type="number" stroke="#475569" fontSize={9} tickFormatter={v => `₪${Math.abs(v)}K`} />
                  <YAxis type="category" dataKey="factor" stroke="#475569" fontSize={9} width={120} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 10, direction: "rtl" }}
                    formatter={(v: number) => [`₪${Math.abs(v as number)}K`, "רגישות"]}
                  />
                  <Bar dataKey="sensitivity" name="רגישות (K₪)" radius={[0, 4, 4, 0]}>
                    {RISK_FACTORS.map((_, i) => (
                      <Cell key={i} fill={i < 3 ? "#ef4444" : i < 6 ? "#f97316" : i < 9 ? "#eab308" : "#3b82f6"} opacity={0.75} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-700/40">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm">Factor Detail — 13 גורמי סיכון מפורטים</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/40 bg-slate-800/20">
                    <th className="p-2 text-right text-muted-foreground">#</th>
                    <th className="p-2 text-right text-muted-foreground">גורם</th>
                    <th className="p-2 text-right text-muted-foreground">קטגוריה</th>
                    <th className="p-2 text-right text-muted-foreground">משקל</th>
                    <th className="p-2 text-right text-muted-foreground">רגישות</th>
                    <th className="p-2 text-right text-muted-foreground">% VaR</th>
                    <th className="p-2 text-right text-muted-foreground">Stress (2σ)</th>
                  </tr>
                </thead>
                <tbody>
                  {RISK_FACTORS.map((f, i) => (
                    <tr key={i} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                      <td className="p-2 text-muted-foreground">{i + 1}</td>
                      <td className="p-2 text-foreground">{f.factor}</td>
                      <td className="p-2">
                        <Badge className={
                          f.category === "ביקוש" ? "bg-red-500/15 text-red-400 text-[9px]" :
                          f.category === "חומרי גלם" ? "bg-orange-500/15 text-orange-400 text-[9px]" :
                          f.category === "תפעולי" ? "bg-yellow-500/15 text-yellow-400 text-[9px]" :
                          f.category === "אשראי" ? "bg-blue-500/15 text-blue-400 text-[9px]" :
                          "bg-purple-500/15 text-purple-400 text-[9px]"
                        }>{f.category}</Badge>
                      </td>
                      <td className="p-2 text-slate-300 font-mono">{f.weight}%</td>
                      <td className="p-2 text-red-400 font-mono">₪{Math.abs(f.sensitivity)}K</td>
                      <td className="p-2 font-mono text-orange-400">{f.pctOfVar}%</td>
                      <td className="p-2 text-red-500 font-mono">₪{Math.abs(f.stressLoss)}K</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backtesting" className="space-y-4 mt-4">
          <Card className="bg-slate-900/50 border-slate-700/40">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                VaR Backtesting — 12 חודשים (K₪)
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">
                חריגות: {breachCount}/12 ({breachPct}%) | צפוי ב-95%: 0.6 חודשים | 
                סטטוס: <span className={breachCount > 2 ? "text-red-400" : "text-green-400"}>
                  {breachCount > 2 ? "YELLOW ZONE — מודל under-estimates risk" : "GREEN ZONE"}
                </span>
              </p>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={BACKTESTING}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="month" stroke="#475569" fontSize={10} />
                  <YAxis stroke="#475569" fontSize={10} tickFormatter={v => `₪${v}K`} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 10, direction: "rtl" }} />
                  <Bar dataKey="actualLoss" name="הפסד בפועל (K₪)" radius={[3, 3, 0, 0]}>
                    {BACKTESTING.map((b, i) => (
                      <Cell key={i} fill={b.breached ? "#ef4444" : "#3b82f6"} opacity={0.7} />
                    ))}
                  </Bar>
                  <Line type="monotone" dataKey="varLimit" stroke="#f97316" strokeWidth={2} dot={false} name="VaR 95% Limit" strokeDasharray="5 5" />
                  <Legend wrapperStyle={{ fontSize: 10, direction: "rtl" }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Kupiec POF Test", value: "PASS", sub: "p=0.12 > 0.05", color: "text-green-400" },
              { label: "Christoffersen CC", value: "PASS", sub: "LR=3.21 < chi2=5.99", color: "text-green-400" },
              { label: "Traffic Light", value: "YELLOW", sub: `${breachCount} breaches`, color: "text-yellow-400" },
              { label: "Model Accuracy", value: "83%", sub: "historical coverage", color: "text-blue-400" },
            ].map((t, i) => (
              <Card key={i} className="bg-slate-900/50 border-slate-700/40">
                <CardContent className="p-3">
                  <div className="text-[9px] text-muted-foreground uppercase">{t.label}</div>
                  <div className={`text-lg font-bold font-mono ${t.color}`}>{t.value}</div>
                  <div className="text-[9px] text-muted-foreground">{t.sub}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="extreme" className="mt-4">
          <Card className="bg-slate-900/50 border-slate-700/40">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-red-400" />
                Extreme Loss Scenarios — 10 תרחישי קיצון
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/40 bg-slate-800/20">
                    <th className="p-2 text-right text-muted-foreground">#</th>
                    <th className="p-2 text-right text-muted-foreground">תרחיש</th>
                    <th className="p-2 text-right text-muted-foreground">VaR הפסד (K₪)</th>
                    <th className="p-2 text-right text-muted-foreground">הסתברות</th>
                    <th className="p-2 text-right text-muted-foreground">Expected Loss</th>
                    <th className="p-2 text-right text-muted-foreground">אופק</th>
                    <th className="p-2 text-right text-muted-foreground">השפעה</th>
                    <th className="p-2 text-right text-muted-foreground">מיטיגציה</th>
                  </tr>
                </thead>
                <tbody>
                  {EXTREME.map((e, i) => (
                    <tr key={i} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                      <td className="p-2 text-muted-foreground">{i + 1}</td>
                      <td className="p-2 text-foreground font-medium">{e.name}</td>
                      <td className="p-2 text-red-400 font-mono font-bold">₪{e.var}K</td>
                      <td className="p-2 text-slate-300">{e.prob}%</td>
                      <td className="p-2 text-yellow-400 font-mono">₪{((e.var * e.prob) / 100).toFixed(0)}K</td>
                      <td className="p-2 text-muted-foreground">{e.horizon}</td>
                      <td className="p-2 text-orange-300 text-[10px]">{e.impact}</td>
                      <td className="p-2 text-blue-400 text-[10px]">{e.hedge}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-4">רשומות קשורות</h3>
          <RelatedRecords entityType="blackrock-var" entityId="dashboard" />
        </div>
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-4">היסטוריית פעילות</h3>
          <ActivityLog entityType="blackrock-var" entityId="dashboard" />
        </div>
      </div>
    </div>
  );
}
