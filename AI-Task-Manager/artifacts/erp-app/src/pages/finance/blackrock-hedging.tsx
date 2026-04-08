import { useState } from "react";
import { useLocation } from "wouter";
import {
  Shield, ArrowRight, DollarSign, TrendingUp, Activity, AlertTriangle,
  CheckCircle, XCircle, Clock, Percent, Target, BarChart3, Layers,
  Zap, Brain, Lock, Unlock, Eye, ChevronDown, ChevronUp
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
  ComposedChart, Line, Cell, AreaChart, Area, PieChart, Pie, ReferenceLine
} from "recharts";

function fmt(val: number) {
  if (Math.abs(val) >= 1000000) return `₪${(val / 1000000).toFixed(2)}M`;
  if (Math.abs(val) >= 1000) return `₪${(val / 1000).toFixed(0)}K`;
  return `₪${val.toFixed(0)}`;
}

const STRATEGIES = [
  {
    id: 1, name: "Forward Contracts — חומרי גלם", type: "Forward",
    cost: 45000, annualSaving: 346500, netBenefit: 301500, roi: 670,
    riskReduction: 28, varReduction: 23.6, hedgeRatio: 60,
    coverage: ["אלומיניום", "ברזל", "נירוסטה"],
    status: "active", effectiveness: 85, maturity: "6-12 חודשים",
    greeks: { delta: -0.62, gamma: 0.04, theta: -12.5, vega: 8.3 },
    details: "חוזי Forward על 60% מצריכת חומרי גלם. נעילת מחיר ל-6 חודשים עם אופציית הארכה.",
    actions: ["Forward 6M אלומיניום — 60% נפח", "Forward 12M ברזל — 50% נפח", "Forward 6M נירוסטה — 40% נפח", "סקירה חודשית + Roll"]
  },
  {
    id: 2, name: "ביטוח מקיף All Risks", type: "Insurance",
    cost: 120000, annualSaving: 580000, netBenefit: 460000, roi: 383,
    riskReduction: 65, varReduction: 17.4, hedgeRatio: 85,
    coverage: ["שריפה", "רעידת אדמה", "גניבה", "אובדן רווחים"],
    status: "active", effectiveness: 92, maturity: "שנתי",
    greeks: { delta: -0.85, gamma: 0, theta: -328.8, vega: 0 },
    details: "פוליסת All Risks מורחבת כולל BI. כיסוי עד ₪15M. השתתפות עצמית ₪50K.",
    actions: ["פוליסת רכוש All Risks — ₪15M", "BI — 12 חודשים אובדן רווחים", "אחריות מקצועית — ₪5M", "סייבר — ₪2M"]
  },
  {
    id: 3, name: "גיוון לקוחות אסטרטגי", type: "Diversification",
    cost: 80000, annualSaving: 270000, netBenefit: 190000, roi: 237,
    riskReduction: 35, varReduction: 15.6, hedgeRatio: 45,
    coverage: ["ריכוזיות לקוח", "ביקוש", "תעשייתי"],
    status: "active", effectiveness: 78, maturity: "12-24 חודשים",
    greeks: { delta: -0.45, gamma: 0.02, theta: 0, vega: 5.1 },
    details: "הפחתת תלות ב-TOP3 מ-48% ל-35%. חדירה לסגמנטים חדשים: רפואי, Hi-Tech, אנרגיה.",
    actions: ["הרחבה לסגמנט רפואי", "פיתוח לקוחות Hi-Tech", "שיווק לפרויקטי אנרגיה", "מגבלת 15% ללקוח"]
  },
  {
    id: 4, name: "ניהול אשראי מתקדם", type: "Credit",
    cost: 25000, annualSaving: 196000, netBenefit: 171000, roi: 684,
    riskReduction: 40, varReduction: 5.9, hedgeRatio: 55,
    coverage: ["חובות אבודים", "תזרים", "אשראי"],
    status: "planned", effectiveness: 72, maturity: "3-6 חודשים",
    greeks: { delta: -0.55, gamma: 0.03, theta: -6.8, vega: 3.2 },
    details: "מערכת דירוג פנימית A-D. מקדמות חובה לדירוג C-D. ביטוח אשראי ל-TOP20.",
    actions: ["דירוג אשראי לקוחות A-D", "מקדמות 30%+ דירוג C-D", "ביטוח אשראי TOP20", "מעקב 60+ יום"]
  },
  {
    id: 5, name: "תחזוקה מונעת + IoT", type: "Operational",
    cost: 80000, annualSaving: 325000, netBenefit: 245000, roi: 306,
    riskReduction: 55, varReduction: 10.1, hedgeRatio: 70,
    coverage: ["תקלות ציוד", "השבתה", "איכות"],
    status: "planned", effectiveness: 88, maturity: "6-12 חודשים",
    greeks: { delta: -0.70, gamma: 0.01, theta: 0, vega: 2.5 },
    details: "חיישני IoT על 12 מכונות קריטיות. אנליטיקה חזויה. CMMS ראשוני.",
    actions: ["חיישני IoT — 12 מכונות", "תוכנת CMMS + PM", "אנליטיקה חזויה ML", "טכנאי dedicated"]
  },
];

const BEFORE_AFTER = [
  { category: "חומרי גלם", before: 23.6, after: 14.2 },
  { category: "ביקוש", before: 44.4, after: 35.8 },
  { category: "תפעולי", before: 18.2, after: 8.2 },
  { category: "אשראי", before: 11.5, after: 6.9 },
  { category: 'מטח', before: 2.3, after: 1.4 },
];

const COVERAGE_RADAR = [
  { risk: "חומרי גלם", covered: 60, target: 80 },
  { risk: "ביקוש/שוק", covered: 45, target: 70 },
  { risk: "תפעולי", covered: 70, target: 85 },
  { risk: "אשראי", covered: 55, target: 75 },
  { risk: 'מטח', covered: 40, target: 60 },
  { risk: "ביטוח/פיזי", covered: 85, target: 90 },
  { risk: "משפטי", covered: 50, target: 70 },
  { risk: "סייבר", covered: 30, target: 60 },
];

const EFFICIENCY = [
  { month: "01", hedgedVar: 2800, unhedgedVar: 3330, savings: 530 },
  { month: "02", hedgedVar: 2650, unhedgedVar: 3330, savings: 680 },
  { month: "03", hedgedVar: 2900, unhedgedVar: 3450, savings: 550 },
  { month: "04", hedgedVar: 2750, unhedgedVar: 3500, savings: 750 },
  { month: "05", hedgedVar: 2600, unhedgedVar: 3380, savings: 780 },
  { month: "06", hedgedVar: 2700, unhedgedVar: 3420, savings: 720 },
  { month: "07", hedgedVar: 2850, unhedgedVar: 3550, savings: 700 },
  { month: "08", hedgedVar: 2950, unhedgedVar: 3600, savings: 650 },
  { month: "09", hedgedVar: 2700, unhedgedVar: 3400, savings: 700 },
  { month: "10", hedgedVar: 2550, unhedgedVar: 3350, savings: 800 },
  { month: "11", hedgedVar: 2500, unhedgedVar: 3300, savings: 800 },
  { month: "12", hedgedVar: 2450, unhedgedVar: 3280, savings: 830 },
];

export default function BlackRockHedging() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState("strategies");
  const [expandedStrategy, setExpandedStrategy] = useState<number | null>(0);

  const totalCost = STRATEGIES.reduce((s, t) => s + t.cost, 0);
  const totalSaving = STRATEGIES.reduce((s, t) => s + t.annualSaving, 0);
  const totalNet = STRATEGIES.reduce((s, t) => s + t.netBenefit, 0);
  const avgROI = ((totalSaving / totalCost - 1) * 100).toFixed(0);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate("/finance/blackrock-2026")}>
            <ArrowRight className="w-4 h-4" />
          </Button>
          <Shield className="w-5 h-5 text-blue-400" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Hedging & Risk Mitigation</h1>
            <p className="text-[10px] text-muted-foreground">5 אסטרטגיות גידור | Greeks Analysis | Hedge Effectiveness | Before/After VaR</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {[
          { l: "עלות שנתית", v: fmt(totalCost), c: "text-orange-400" },
          { l: "חיסכון שנתי", v: fmt(totalSaving), c: "text-green-400" },
          { l: "Net Benefit", v: fmt(totalNet), c: "text-blue-400" },
          { l: "ROI כולל", v: `${avgROI}%`, c: "text-emerald-400" },
          { l: "VaR הפחתה", v: "27.3%", c: "text-purple-400" },
          { l: "כיסוי ממוצע", v: "63%", c: "text-cyan-400" },
        ].map((k, i) => (
          <Card key={i} className="bg-slate-900/60 border-slate-700/40">
            <CardContent className="p-2">
              <div className="text-[8px] text-muted-foreground uppercase tracking-wider">{k.l}</div>
              <div className={`text-base font-bold font-mono ${k.c}`}>{k.v}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-slate-800/50 border border-slate-700/50">
          <TabsTrigger value="strategies" className="text-xs data-[state=active]:bg-blue-600">אסטרטגיות</TabsTrigger>
          <TabsTrigger value="greeks" className="text-xs data-[state=active]:bg-blue-600">Greeks & Sensitivities</TabsTrigger>
          <TabsTrigger value="effectiveness" className="text-xs data-[state=active]:bg-blue-600">Hedge Effectiveness</TabsTrigger>
          <TabsTrigger value="coverage" className="text-xs data-[state=active]:bg-blue-600">כיסוי & VaR</TabsTrigger>
        </TabsList>

        <TabsContent value="strategies" className="space-y-3 mt-4">
          {STRATEGIES.map((s, i) => (
            <Card key={i} className={`bg-slate-900/50 border-slate-700/40 ${expandedStrategy === i ? "border-blue-500/30" : ""}`}>
              <CardContent className="p-0">
                <div className="p-3 flex items-center justify-between cursor-pointer hover:bg-slate-800/20 transition-colors"
                  onClick={() => setExpandedStrategy(expandedStrategy === i ? null : i)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.status === "active" ? "bg-green-500/15" : "bg-yellow-500/15"}`}>
                      <Shield className={`w-5 h-5 ${s.status === "active" ? "text-green-400" : "text-yellow-400"}`} />
                    </div>
                    <div>
                      <div className="text-sm text-foreground font-medium">{s.name}</div>
                      <div className="text-[10px] text-muted-foreground">{s.type} | {s.maturity} | {s.coverage.join(", ")}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-center"><div className="text-[8px] text-muted-foreground">עלות</div><div className="text-xs text-orange-400 font-mono">{fmt(s.cost)}</div></div>
                    <div className="text-center"><div className="text-[8px] text-muted-foreground">חיסכון</div><div className="text-xs text-green-400 font-mono">{fmt(s.annualSaving)}</div></div>
                    <div className="text-center"><div className="text-[8px] text-muted-foreground">ROI</div><div className="text-xs text-blue-400 font-mono">{s.roi}%</div></div>
                    <div className="text-center"><div className="text-[8px] text-muted-foreground">הפחתה</div><div className="text-xs text-purple-400 font-mono">{s.riskReduction}%</div></div>
                    <Badge className={s.status === "active" ? "bg-green-500/15 text-green-400 text-[9px]" : "bg-yellow-500/15 text-yellow-400 text-[9px]"}>
                      {s.status === "active" ? "ACTIVE" : "PLANNED"}
                    </Badge>
                    {expandedStrategy === i ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>
                {expandedStrategy === i && (
                  <div className="px-4 pb-4 border-t border-slate-800/40 pt-3 space-y-3">
                    <p className="text-xs text-slate-300">{s.details}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {s.actions.map((a, j) => (
                        <div key={j} className="bg-slate-800/30 rounded p-2 flex items-start gap-2">
                          <div className="w-5 h-5 rounded bg-blue-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-[9px] text-blue-400 font-bold">{j + 1}</span>
                          </div>
                          <span className="text-[10px] text-slate-300">{a}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-4">
                      <div className="bg-slate-800/30 rounded p-2 flex-1">
                        <span className="text-[9px] text-muted-foreground">Hedge Ratio</span>
                        <div className="w-full h-1.5 bg-slate-700 rounded-full mt-1 overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${s.hedgeRatio}%` }} />
                        </div>
                        <span className="text-[10px] text-blue-400 font-mono">{s.hedgeRatio}%</span>
                      </div>
                      <div className="bg-slate-800/30 rounded p-2 flex-1">
                        <span className="text-[9px] text-muted-foreground">Effectiveness</span>
                        <div className="w-full h-1.5 bg-slate-700 rounded-full mt-1 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${s.effectiveness}%`, background: s.effectiveness >= 85 ? "#22c55e" : s.effectiveness >= 70 ? "#eab308" : "#ef4444" }} />
                        </div>
                        <span className="text-[10px] font-mono" style={{ color: s.effectiveness >= 85 ? "#22c55e" : s.effectiveness >= 70 ? "#eab308" : "#ef4444" }}>{s.effectiveness}%</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="greeks" className="space-y-4 mt-4">
          <Card className="bg-slate-900/50 border-slate-700/40">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-400" />
                Greeks Analysis — רגישות הגידור
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">Delta = רגישות למחיר | Gamma = שינוי Delta | Theta = דעיכת זמן | Vega = רגישות לתנודתיות</p>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/40 bg-slate-800/20">
                    <th className="p-2.5 text-right text-muted-foreground">אסטרטגיה</th>
                    <th className="p-2.5 text-right text-muted-foreground">Type</th>
                    <th className="p-2.5 text-center text-muted-foreground">Δ Delta</th>
                    <th className="p-2.5 text-center text-muted-foreground">Γ Gamma</th>
                    <th className="p-2.5 text-center text-muted-foreground">Θ Theta</th>
                    <th className="p-2.5 text-center text-muted-foreground">ν Vega</th>
                    <th className="p-2.5 text-right text-muted-foreground">Interpretation</th>
                  </tr>
                </thead>
                <tbody>
                  {STRATEGIES.map((s, i) => (
                    <tr key={i} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                      <td className="p-2.5 text-foreground font-medium">{s.name}</td>
                      <td className="p-2.5"><Badge className="bg-slate-700/30 text-slate-300 text-[9px]">{s.type}</Badge></td>
                      <td className="p-2.5 text-center font-mono">
                        <span className={s.greeks.delta < -0.5 ? "text-green-400" : "text-yellow-400"}>{s.greeks.delta.toFixed(2)}</span>
                      </td>
                      <td className="p-2.5 text-center font-mono text-slate-300">{s.greeks.gamma.toFixed(2)}</td>
                      <td className="p-2.5 text-center font-mono">
                        <span className={s.greeks.theta < 0 ? "text-red-400" : "text-green-400"}>{s.greeks.theta.toFixed(1)}</span>
                      </td>
                      <td className="p-2.5 text-center font-mono text-blue-400">{s.greeks.vega.toFixed(1)}</td>
                      <td className="p-2.5 text-[10px] text-muted-foreground">
                        {Math.abs(s.greeks.delta) > 0.7 ? "הגנה חזקה מפני שינויי מחיר" :
                         Math.abs(s.greeks.delta) > 0.4 ? "הגנה בינונית — partial hedge" :
                         "הגנה חלקית — monitored"}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-800/30 border-t border-slate-700/50">
                    <td className="p-2.5 text-foreground font-bold">Portfolio Total</td>
                    <td className="p-2.5"></td>
                    <td className="p-2.5 text-center font-mono text-green-400 font-bold">
                      {(STRATEGIES.reduce((s, t) => s + t.greeks.delta, 0) / STRATEGIES.length).toFixed(2)}
                    </td>
                    <td className="p-2.5 text-center font-mono text-slate-300">
                      {(STRATEGIES.reduce((s, t) => s + t.greeks.gamma, 0) / STRATEGIES.length).toFixed(2)}
                    </td>
                    <td className="p-2.5 text-center font-mono text-red-400">
                      {STRATEGIES.reduce((s, t) => s + t.greeks.theta, 0).toFixed(1)}
                    </td>
                    <td className="p-2.5 text-center font-mono text-blue-400">
                      {(STRATEGIES.reduce((s, t) => s + t.greeks.vega, 0) / STRATEGIES.length).toFixed(1)}
                    </td>
                    <td className="p-2.5"></td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="effectiveness" className="space-y-4 mt-4">
          <Card className="bg-slate-900/50 border-slate-700/40">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-400" />
                Hedge Effectiveness — Hedged vs Unhedged VaR (K₪)
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={EFFICIENCY}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="month" stroke="#475569" fontSize={10} />
                  <YAxis stroke="#475569" fontSize={10} tickFormatter={v => `₪${v}K`} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 10, direction: "rtl" }} />
                  <Area type="monotone" dataKey="savings" fill="#22c55e" fillOpacity={0.1} stroke="none" name="חיסכון" />
                  <Line type="monotone" dataKey="unhedgedVar" stroke="#ef4444" strokeWidth={2} dot={false} name="Unhedged VaR" />
                  <Line type="monotone" dataKey="hedgedVar" stroke="#22c55e" strokeWidth={2.5} dot={false} name="Hedged VaR" />
                  <Legend wrapperStyle={{ fontSize: 10, direction: "rtl" }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-700/40">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm">Before / After — השפעת גידור על VaR Decomposition</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={BEFORE_AFTER}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="category" stroke="#475569" fontSize={10} />
                  <YAxis stroke="#475569" fontSize={10} tickFormatter={v => `${v}%`} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 10, direction: "rtl" }}
                    formatter={(v: number) => [`${v}%`, ""]}
                  />
                  <Bar dataKey="before" name="לפני גידור" fill="#ef4444" radius={[3, 3, 0, 0]} opacity={0.6} />
                  <Bar dataKey="after" name="אחרי גידור" fill="#22c55e" radius={[3, 3, 0, 0]} opacity={0.6} />
                  <Legend wrapperStyle={{ fontSize: 10, direction: "rtl" }} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="coverage" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-slate-900/50 border-slate-700/40">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="w-4 h-4 text-cyan-400" />
                  Hedging Coverage Radar — כיסוי נוכחי vs יעד
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-2">
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={COVERAGE_RADAR}>
                    <PolarGrid stroke="#334155" />
                    <PolarAngleAxis dataKey="risk" stroke="#94a3b8" fontSize={9} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} stroke="#334155" tickCount={5} fontSize={8} />
                    <Radar name="כיסוי נוכחי" dataKey="covered" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} />
                    <Radar name="יעד" dataKey="target" stroke="#22c55e" fill="none" strokeWidth={1.5} strokeDasharray="5 5" />
                    <Legend wrapperStyle={{ fontSize: 10, direction: "rtl" }} />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-700/40">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-sm">Coverage Gap Analysis</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="space-y-3">
                  {COVERAGE_RADAR.map((c, i) => {
                    const gap = c.target - c.covered;
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-foreground">{c.risk}</span>
                          <span className={`text-[10px] font-mono ${gap > 20 ? "text-red-400" : gap > 10 ? "text-yellow-400" : "text-green-400"}`}>
                            {c.covered}% / {c.target}% (gap: {gap}%)
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden relative">
                          <div className="absolute h-full bg-slate-700/50 rounded-full" style={{ width: `${c.target}%` }} />
                          <div className={`h-full rounded-full ${gap > 20 ? "bg-red-500" : gap > 10 ? "bg-yellow-500" : "bg-green-500"}`}
                            style={{ width: `${c.covered}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-4">רשומות קשורות</h3>
          <RelatedRecords entityType="blackrock-hedging" entityId="dashboard" />
        </div>
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-4">היסטוריית פעילות</h3>
          <ActivityLog entityType="blackrock-hedging" entityId="dashboard" />
        </div>
      </div>
    </div>
  );
}
