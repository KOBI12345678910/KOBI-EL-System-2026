import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useLocation } from "wouter";
import {
  Brain, ArrowRight, Lightbulb, AlertTriangle, TrendingUp, Shield,
  DollarSign, CheckCircle, Star, Zap, Target, ChevronDown, ChevronUp,
  Clock, Activity, BarChart3, Layers, Eye, Lock, Gauge, Factory
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, Cell, ComposedChart, Line, Area, AreaChart, PieChart, Pie, ReferenceLine
} from "recharts";

function fmt(val: number) {
  if (Math.abs(val) >= 1000000) return `₪${(val / 1000000).toFixed(2)}M`;
  if (Math.abs(val) >= 1000) return `₪${(val / 1000).toFixed(0)}K`;
  return `₪${val.toFixed(0)}`;
}

const FALLBACK_RECOMMENDATIONS = [
  {
    id: 1, title: "הסכמי Forward על אלומיניום — 12 חודשים",
    category: "חומרי גלם", priority: "critical", confidence: 94,
    impact: 346500, cost: 45000, roi: 670, timeline: "מיידי",
    risk: "נעילת מחיר גבוה אם מחירים יורדים",
    aiReasoning: "מודל ML זיהה מגמת עלייה ב-LME אלומיניום (R²=0.87). הסתברות 73% לעלייה של 15%+ ב-6 חודשים. Forward 12M חוסך ₪347K בציפיות.",
    actions: [
      { step: "סקר ספקים + ציטוטי Forward", duration: "1 שבוע", status: "ready" },
      { step: "חתימת חוזה Forward 12M", duration: "2 שבועות", status: "pending" },
      { step: "הגדרת מנגנון Roll-over", duration: "1 שבוע", status: "pending" },
      { step: "מעקב חודשי + P&L ניטור", duration: "שוטף", status: "pending" },
    ],
    metrics: { sharpeImprovement: 0.12, varReduction: 10.4, lossReduction: 4.2 },
  },
  {
    id: 2, title: "גיוון לקוחות — הפחתת ריכוזיות TOP3 ל-35%",
    category: "ביקוש", priority: "critical", confidence: 91,
    impact: 270000, cost: 80000, roi: 237, timeline: "12-24 חודשים",
    risk: "עלויות שיווק גבוהות, תקופת הסתגלות",
    aiReasoning: "ריכוזיות 48% ב-TOP3 חורגת מסף 40%. מודל קורלציה מראה תלות של 0.82 בביקוש בנייה. פיזור ל-7+ לקוחות משמעותיים מפחית VaR ב-15.6%.",
    actions: [
      { step: "מיפוי סגמנטים חדשים (רפואי, Hi-Tech)", duration: "1 חודש", status: "ready" },
      { step: "פיתוח יכולות ייצור חדשות", duration: "3 חודשים", status: "pending" },
      { step: "גיוס 5 לקוחות חדשים", duration: "6 חודשים", status: "pending" },
      { step: "הגעה ליעד 35% ריכוזיות", duration: "12-24 חודשים", status: "pending" },
    ],
    metrics: { sharpeImprovement: 0.18, varReduction: 15.6, lossReduction: 7.8 },
  },
  {
    id: 3, title: "מערכת IoT + תחזוקה מונעת חזויה",
    category: "תפעולי", priority: "high", confidence: 88,
    impact: 325000, cost: 80000, roi: 306, timeline: "6-12 חודשים",
    risk: "עקומת למידה, עלויות התקנה, false positives",
    aiReasoning: "ניתוח 36 חודשים של downtime מראה 16 ימי השבתה/שנה בעלות ₪450K. מודל ML חוזה 55% מתקלות 72 שעות מראש. הפחתה צפויה ל-7 ימים.",
    actions: [
      { step: "התקנת חיישני IoT על 12 מכונות", duration: "2 חודשים", status: "ready" },
      { step: "הטמעת CMMS + אנליטיקה", duration: "3 חודשים", status: "pending" },
      { step: "אימון מודל ML חזוי", duration: "3 חודשים", status: "pending" },
      { step: "Full Production + KPI monitoring", duration: "שוטף", status: "pending" },
    ],
    metrics: { sharpeImprovement: 0.08, varReduction: 10.1, lossReduction: 5.5 },
  },
  {
    id: 4, title: "דירוג אשראי פנימי + ביטוח אשראי",
    category: "אשראי", priority: "high", confidence: 86,
    impact: 196000, cost: 25000, roi: 684, timeline: "3-6 חודשים",
    risk: "התנגדות לקוחות לדרישות מקדמה",
    aiReasoning: "6.2% חובות 90+ (מעל סף 5%). מודל scoring מבוסס 14 פרמטרים מזהה 78% מברירות מחדל. ביטוח אשראי TOP20 חוסך ₪196K/שנה.",
    actions: [
      { step: "בניית מודל Scoring (14 פרמטרים)", duration: "2 שבועות", status: "ready" },
      { step: "דירוג כל הלקוחות A-D", duration: "2 שבועות", status: "pending" },
      { step: "הטמעת מדיניות מקדמות", duration: "1 חודש", status: "pending" },
      { step: "רכישת ביטוח אשראי TOP20", duration: "1 חודש", status: "pending" },
    ],
    metrics: { sharpeImprovement: 0.06, varReduction: 5.9, lossReduction: 3.1 },
  },
  {
    id: 5, title: "אופטימיזציית מרווח — תמחור דינמי",
    category: "רווחיות", priority: "high", confidence: 84,
    impact: 150000, cost: 35000, roi: 328, timeline: "3 חודשים",
    risk: "התנגדות לקוחות לתמחור חדש",
    aiReasoning: "מרווח גולמי 18.5% נמוך מממוצע ענפי (22%). מודל Elasticity מראה גמישות -0.6 — ניתן להעלות 8% ללא אובדן ביקוש משמעותי.",
    actions: [
      { step: "ניתוח גמישות ביקוש לכל סגמנט", duration: "2 שבועות", status: "ready" },
      { step: "בניית מודל תמחור דינמי", duration: "1 חודש", status: "pending" },
      { step: "Pilot על 20% מהפרויקטים", duration: "2 חודשים", status: "pending" },
      { step: "Roll-out מלא + A/B testing", duration: "שוטף", status: "pending" },
    ],
    metrics: { sharpeImprovement: 0.14, varReduction: 3.2, lossReduction: 2.5 },
  },
  {
    id: 6, title: 'גידור מטח — Forward USD/ILS',
    category: 'מטח', priority: "medium", confidence: 79,
    impact: 40000, cost: 8000, roi: 400, timeline: "מיידי",
    risk: "עלות Forward, תנודתיות שקל",
    aiReasoning: "חשיפה של ₪131K לשינויי מט\"ח. מודל GARCH חוזה תנודתיות 8.5% ב-6 חודשים. Forward 50% מהחשיפה חוסך ₪40K expected.",
    actions: [
      { step: "מיפוי חשיפות מט\"ח", duration: "1 שבוע", status: "ready" },
      { step: "פתיחת Forward 6M על 50%", duration: "1 שבוע", status: "pending" },
      { step: "Rolling quarterly", duration: "שוטף", status: "pending" },
      { step: "סקירה + התאמת hedge ratio", duration: "רבעוני", status: "pending" },
    ],
    metrics: { sharpeImprovement: 0.02, varReduction: 1.2, lossReduction: 0.8 },
  },
  {
    id: 7, title: "רזרבה נזילה אסטרטגית — Cash Buffer",
    category: "נזילות", priority: "medium", confidence: 82,
    impact: 180000, cost: 50000, roi: 260, timeline: "3 חודשים",
    risk: "עלות הזדמנות, נזילות מוגבלת",
    aiReasoning: "תזרים חופשי ₪85K/חודש נמוך מדי ל-VaR 95% חודשי (₪278K). רזרבה של 3 חודשי הוצאות (₪1.18M) נותנת Survival Ratio של 4.25.",
    actions: [
      { step: "הגדרת יעד רזרבה — ₪1.18M", duration: "מיידי", status: "ready" },
      { step: "חיסכון חודשי ₪50K", duration: "שוטף", status: "pending" },
      { step: "מסגרת אשראי ₪500K stand-by", duration: "1 חודש", status: "pending" },
      { step: "סקירה רבעונית של Buffer", duration: "שוטף", status: "pending" },
    ],
    metrics: { sharpeImprovement: 0.04, varReduction: 0, lossReduction: 8.5 },
  },
  {
    id: 8, title: "ביטוח סייבר + DR Plan",
    category: "IT", priority: "medium", confidence: 76,
    impact: 85000, cost: 35000, roi: 143, timeline: "3-6 חודשים",
    risk: "עלות פרמיה, מורכבות טכנית",
    aiReasoning: "ציון סיכון סייבר 11.3 עולה. מגמה ▲ עם 47% עלייה באירועי Ransomware בתעשייה. DR Plan + ביטוח ₪2M חוסך ₪85K expected.",
    actions: [
      { step: "סקר אבטחת מידע", duration: "2 שבועות", status: "ready" },
      { step: "הטמעת Backup + DR", duration: "1 חודש", status: "pending" },
      { step: "רכישת ביטוח סייבר ₪2M", duration: "2 שבועות", status: "pending" },
      { step: "תרגיל DR שנתי", duration: "שנתי", status: "pending" },
    ],
    metrics: { sharpeImprovement: 0.01, varReduction: 1.8, lossReduction: 1.2 },
  },
];

const PRIORITY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: "bg-red-500/15", text: "text-red-400", label: "CRITICAL" },
  high: { bg: "bg-orange-500/15", text: "text-orange-400", label: "HIGH" },
  medium: { bg: "bg-yellow-500/15", text: "text-yellow-400", label: "MEDIUM" },
};

const IMPACT_CHART = RECOMMENDATIONS.map(r => ({
  name: r.title.substring(0, 25) + "...",
  impact: r.impact / 1000,
  cost: r.cost / 1000,
  roi: r.roi,
  confidence: r.confidence,
}));

const FALLBACK_PORTFOLIO_EFFECT = [
  { metric: "VaR 95%", before: 3330, after: 2420, unit: "K₪" },
  { metric: "P(הפסד)", before: 30.86, after: 18.4, unit: "%" },
  { metric: "Sharpe", before: 0.44, after: 0.79, unit: "" },
  { metric: "Sortino", before: 0.62, after: 1.14, unit: "" },
  { metric: "Max DD", before: 34.6, after: 21.2, unit: "%" },
  { metric: "E[Profit]", before: 210, after: 395, unit: "K₪" },
];


const RECOMMENDATIONS = FALLBACK_RECOMMENDATIONS;

export default function BlackRockAI() {
  const { data: blackrockaiData } = useQuery({
    queryKey: ["blackrock-ai"],
    queryFn: () => authFetch("/api/finance/blackrock_ai"),
    staleTime: 5 * 60 * 1000,
  });

  const RECOMMENDATIONS = blackrockaiData ?? FALLBACK_RECOMMENDATIONS;
  const PORTFOLIO_EFFECT = FALLBACK_PORTFOLIO_EFFECT;

  const [, navigate] = useLocation();
  const [tab, setTab] = useState("recommendations");
  const [expanded, setExpanded] = useState<number | null>(0);
  const [filter, setFilter] = useState("all");

  const filtered = filter === "all" ? RECOMMENDATIONS :
    RECOMMENDATIONS.filter(r => r.priority === filter);

  const totalImpact = RECOMMENDATIONS.reduce((s, r) => s + r.impact, 0);
  const totalCost = RECOMMENDATIONS.reduce((s, r) => s + r.cost, 0);
  const avgConfidence = (RECOMMENDATIONS.reduce((s, r) => s + r.confidence, 0) / RECOMMENDATIONS.length).toFixed(0);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate("/finance/blackrock-2026")}>
            <ArrowRight className="w-4 h-4" />
          </Button>
          <Brain className="w-5 h-5 text-yellow-400" />
          <div>
            <h1 className="text-xl font-bold text-foreground">AI Risk Intelligence Engine</h1>
            <p className="text-[10px] text-muted-foreground">Machine Learning + Monte Carlo + Factor Analysis | 8 המלצות מתועדפות | Portfolio Optimization</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 text-[10px] font-mono">
            <Brain className="w-3 h-3 ml-1" />CONFIDENCE: {avgConfidence}%
          </Badge>
          <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[10px] font-mono">
            TOTAL IMPACT: {fmt(totalImpact)}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {[
          { l: "Total Impact", v: fmt(totalImpact), c: "text-green-400" },
          { l: "Total Cost", v: fmt(totalCost), c: "text-orange-400" },
          { l: "Net Benefit", v: fmt(totalImpact - totalCost), c: "text-blue-400" },
          { l: "Portfolio ROI", v: `${((totalImpact / totalCost - 1) * 100).toFixed(0)}%`, c: "text-emerald-400" },
          { l: "Avg Confidence", v: `${avgConfidence}%`, c: "text-yellow-400" },
          { l: "VaR Reduction", v: "27.3%", c: "text-purple-400" },
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
          <TabsTrigger value="recommendations" className="text-xs data-[state=active]:bg-yellow-600">המלצות AI</TabsTrigger>
          <TabsTrigger value="impact" className="text-xs data-[state=active]:bg-yellow-600">Impact Analysis</TabsTrigger>
          <TabsTrigger value="portfolio" className="text-xs data-[state=active]:bg-yellow-600">Portfolio Effect</TabsTrigger>
        </TabsList>

        <TabsContent value="recommendations" className="space-y-3 mt-4">
          <div className="flex gap-2 mb-2">
            {[
              { key: "all", label: "הכל (8)" },
              { key: "critical", label: "CRITICAL (2)" },
              { key: "high", label: "HIGH (3)" },
              { key: "medium", label: "MEDIUM (3)" },
            ].map(f => (
              <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "outline"}
                className={`text-[10px] h-6 px-2 ${filter === f.key ? "bg-blue-600 text-foreground" : "text-muted-foreground"}`}
                onClick={() => setFilter(f.key)}
              >{f.label}</Button>
            ))}
          </div>

          {filtered.map((r) => {
            const pc = PRIORITY_COLORS[r.priority];
            return (
              <Card key={r.id} className={`bg-slate-900/50 border-slate-700/40 ${expanded === r.id ? "border-yellow-500/30" : ""}`}>
                <CardContent className="p-0">
                  <div className="p-3 flex items-center justify-between cursor-pointer hover:bg-slate-800/20 transition-colors"
                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center relative">
                        <Brain className="w-5 h-5 text-yellow-400" />
                        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-900 flex items-center justify-center">
                          <span className="text-[8px] text-yellow-400 font-bold">{r.id}</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-foreground font-medium">{r.title}</div>
                        <div className="text-[10px] text-muted-foreground">{r.category} | {r.timeline}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-center"><div className="text-[8px] text-muted-foreground">Impact</div><div className="text-xs text-green-400 font-mono">{fmt(r.impact)}</div></div>
                      <div className="text-center"><div className="text-[8px] text-muted-foreground">ROI</div><div className="text-xs text-blue-400 font-mono">{r.roi}%</div></div>
                      <div className="text-center"><div className="text-[8px] text-muted-foreground">Confidence</div><div className="text-xs font-mono" style={{ color: r.confidence >= 90 ? "#22c55e" : r.confidence >= 80 ? "#eab308" : "#f97316" }}>{r.confidence}%</div></div>
                      <Badge className={`${pc.bg} ${pc.text} text-[9px]`}>{pc.label}</Badge>
                      {expanded === r.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {expanded === r.id && (
                    <div className="px-4 pb-4 border-t border-slate-800/40 pt-3 space-y-3">
                      <div className="bg-yellow-500/5 border border-yellow-500/20 rounded p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Brain className="w-3 h-3 text-yellow-400" />
                          <span className="text-[10px] text-yellow-400 font-medium">AI REASONING</span>
                        </div>
                        <p className="text-xs text-slate-300">{r.aiReasoning}</p>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {r.actions.map((a, j) => (
                          <div key={j} className={`rounded p-2 border ${a.status === "ready" ? "bg-green-500/5 border-green-500/20" : "bg-slate-800/30 border-slate-700/30"}`}>
                            <div className="flex items-center gap-1.5 mb-1">
                              <div className={`w-5 h-5 rounded flex items-center justify-center ${a.status === "ready" ? "bg-green-500/15" : "bg-slate-700/30"}`}>
                                <span className={`text-[9px] font-bold ${a.status === "ready" ? "text-green-400" : "text-muted-foreground"}`}>{j + 1}</span>
                              </div>
                              <Badge className={a.status === "ready" ? "bg-green-500/15 text-green-400 text-[8px]" : "bg-slate-700/30 text-muted-foreground text-[8px]"}>
                                {a.status === "ready" ? "READY" : "PENDING"}
                              </Badge>
                            </div>
                            <div className="text-[10px] text-foreground">{a.step}</div>
                            <div className="text-[9px] text-muted-foreground mt-0.5">{a.duration}</div>
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="bg-slate-800/30 rounded p-2">
                          <span className="text-[8px] text-muted-foreground">עלות</span>
                          <div className="text-sm text-orange-400 font-mono">{fmt(r.cost)}</div>
                        </div>
                        <div className="bg-slate-800/30 rounded p-2">
                          <span className="text-[8px] text-muted-foreground">Sharpe +</span>
                          <div className="text-sm text-green-400 font-mono">+{r.metrics.sharpeImprovement.toFixed(2)}</div>
                        </div>
                        <div className="bg-slate-800/30 rounded p-2">
                          <span className="text-[8px] text-muted-foreground">VaR Reduction</span>
                          <div className="text-sm text-purple-400 font-mono">{r.metrics.varReduction}%</div>
                        </div>
                        <div className="bg-slate-800/30 rounded p-2">
                          <span className="text-[8px] text-muted-foreground">P(Loss) Reduction</span>
                          <div className="text-sm text-blue-400 font-mono">{r.metrics.lossReduction}%</div>
                        </div>
                      </div>

                      <div className="bg-red-500/5 border border-red-500/20 rounded p-2">
                        <div className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-red-400" /><span className="text-[10px] text-red-400">סיכון:</span></div>
                        <p className="text-[10px] text-muted-foreground">{r.risk}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="impact" className="space-y-4 mt-4">
          <Card className="bg-slate-900/50 border-slate-700/40">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-green-400" />
                Cost vs Impact Analysis (K₪)
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={IMPACT_CHART}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" stroke="#475569" fontSize={8} angle={-20} textAnchor="end" height={60} />
                  <YAxis yAxisId="left" stroke="#475569" fontSize={9} tickFormatter={v => `₪${v}K`} />
                  <YAxis yAxisId="right" orientation="left" stroke="#3b82f6" fontSize={9} tickFormatter={v => `${v}%`} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 10, direction: "rtl" }} />
                  <Bar yAxisId="left" dataKey="impact" name="Impact (K₪)" fill="#22c55e" radius={[3, 3, 0, 0]} opacity={0.7} />
                  <Bar yAxisId="left" dataKey="cost" name="Cost (K₪)" fill="#f97316" radius={[3, 3, 0, 0]} opacity={0.5} />
                  <Line yAxisId="right" type="monotone" dataKey="roi" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="ROI %" />
                  <Legend wrapperStyle={{ fontSize: 10, direction: "rtl" }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-700/40">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm">Confidence & Prioritization Matrix</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/40 bg-slate-800/20">
                    <th className="p-2 text-right text-muted-foreground">#</th>
                    <th className="p-2 text-right text-muted-foreground">המלצה</th>
                    <th className="p-2 text-right text-muted-foreground">Impact</th>
                    <th className="p-2 text-right text-muted-foreground">Cost</th>
                    <th className="p-2 text-right text-muted-foreground">ROI</th>
                    <th className="p-2 text-right text-muted-foreground">Confidence</th>
                    <th className="p-2 text-right text-muted-foreground">VaR Red.</th>
                    <th className="p-2 text-right text-muted-foreground">Sharpe +</th>
                    <th className="p-2 text-right text-muted-foreground">P(Loss) Red.</th>
                    <th className="p-2 text-right text-muted-foreground">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {RECOMMENDATIONS.map((r: any) => {
                    const pc = r.priority === "critical"
                      ? { bg: "bg-red-500/20", text: "text-red-400", label: "קריטי" }
                      : r.priority === "high"
                      ? { bg: "bg-orange-500/20", text: "text-orange-400", label: "גבוה" }
                      : { bg: "bg-blue-500/20", text: "text-blue-400", label: "רגיל" };
                    return (
                      <tr key={r.id} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                        <td className="p-2 text-muted-foreground">{r.id}</td>
                        <td className="p-2 text-foreground text-[10px]">{r.title.substring(0, 35)}...</td>
                        <td className="p-2 text-green-400 font-mono">{fmt(r.impact)}</td>
                        <td className="p-2 text-orange-400 font-mono">{fmt(r.cost)}</td>
                        <td className="p-2 text-blue-400 font-mono">{r.roi}%</td>
                        <td className="p-2 font-mono" style={{ color: r.confidence >= 90 ? "#22c55e" : r.confidence >= 80 ? "#eab308" : "#f97316" }}>{r.confidence}%</td>
                        <td className="p-2 text-purple-400 font-mono">{r.metrics.varReduction}%</td>
                        <td className="p-2 text-cyan-400 font-mono">+{r.metrics.sharpeImprovement.toFixed(2)}</td>
                        <td className="p-2 text-blue-400 font-mono">{r.metrics.lossReduction}%</td>
                        <td className="p-2"><Badge className={`${pc.bg} ${pc.text} text-[9px]`}>{pc.label}</Badge></td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-800/30 border-t border-slate-700/50">
                    <td className="p-2 text-foreground font-bold" colSpan={2}>TOTAL PORTFOLIO</td>
                    <td className="p-2 text-green-400 font-mono font-bold">{fmt(totalImpact)}</td>
                    <td className="p-2 text-orange-400 font-mono font-bold">{fmt(totalCost)}</td>
                    <td className="p-2 text-blue-400 font-mono font-bold">{((totalImpact / totalCost - 1) * 100).toFixed(0)}%</td>
                    <td className="p-2 text-yellow-400 font-mono font-bold">{avgConfidence}%</td>
                    <td className="p-2 text-purple-400 font-mono font-bold">27.3%</td>
                    <td className="p-2 text-cyan-400 font-mono font-bold">+0.35</td>
                    <td className="p-2 text-blue-400 font-mono font-bold">12.4%</td>
                    <td className="p-2"></td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="portfolio" className="space-y-4 mt-4">
          <Card className="bg-slate-900/50 border-slate-700/40">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Portfolio Optimization — Before vs After All Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {PORTFOLIO_EFFECT.map((p, i) => (
                  <div key={i} className="bg-slate-800/30 rounded-lg p-3 text-center">
                    <div className="text-[9px] text-muted-foreground uppercase mb-1">{p.metric}</div>
                    <div className="text-xs text-red-400 font-mono line-through">{p.before}{p.unit}</div>
                    <div className="text-lg text-green-400 font-mono font-bold">{p.after}{p.unit}</div>
                    <div className="text-[10px] text-emerald-400 mt-1">
                      {p.metric === "Sharpe" || p.metric === "Sortino" || p.metric === "E[Profit]"
                        ? `+${((p.after / p.before - 1) * 100).toFixed(0)}%`
                        : `-${((1 - p.after / p.before) * 100).toFixed(0)}%`}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-700/40">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm">Before / After — השוואה גרפית</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={PORTFOLIO_EFFECT}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="metric" stroke="#475569" fontSize={10} />
                  <YAxis stroke="#475569" fontSize={10} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 10, direction: "rtl" }} />
                  <Bar dataKey="before" name="לפני AI" fill="#ef4444" radius={[3, 3, 0, 0]} opacity={0.6} />
                  <Bar dataKey="after" name="אחרי AI" fill="#22c55e" radius={[3, 3, 0, 0]} opacity={0.6} />
                  <Legend wrapperStyle={{ fontSize: 10, direction: "rtl" }} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-yellow-500/10 to-emerald-500/10 border-yellow-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="w-5 h-5 text-yellow-400" />
                <span className="text-sm text-foreground font-medium">AI Executive Summary</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                יישום כל 8 ההמלצות מפחית VaR 95% מ-₪3.33M ל-₪2.42M (הפחתה של 27.3%), 
                מוריד את הסתברות ההפסד מ-30.86% ל-18.4%, ומשפר את Sharpe Ratio מ-0.44 ל-0.79. 
                עלות כוללת: ₪358K. חיסכון שנתי צפוי: ₪1.59M. ROI פורטפוליו: 345%. 
                הרווח הנקי הצפוי עולה מ-₪210K ל-₪395K (+88%). 
                עדיפות: תחילה Forward Contracts (ROI 670%) ודירוג אשראי (ROI 684%), ואח"כ גיוון לקוחות ו-IoT.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-4">רשומות קשורות</h3>
          <RelatedRecords entityType="blackrock-ai" entityId="dashboard" />
        </div>
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-4">היסטוריית פעילות</h3>
          <ActivityLog entityType="blackrock-ai" entityId="dashboard" />
        </div>
      </div>
    </div>
  );
}
