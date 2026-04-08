import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Target, ArrowRight, AlertTriangle, Shield, Activity, Zap, Info,
  TrendingDown, BarChart3, Layers, Eye, Clock, ChevronDown, ChevronUp
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Cell, ZAxis, BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Legend, ComposedChart, Line, ReferenceLine, Area, AreaChart
} from "recharts";

const RISK_ITEMS = [
  { id: 1, name: "ירידת ביקוש חדה", category: "שוק", probability: 85, impact: 90, score: 76.5, trend: "up", velocity: "high", owner: "מנכ\"ל", status: "active", residual: 45, controls: 3 },
  { id: 2, name: "עליית מחירי אלומיניום", category: "חומרי גלם", probability: 70, impact: 75, score: 52.5, trend: "stable", velocity: "medium", owner: "רכש", status: "monitored", residual: 35, controls: 4 },
  { id: 3, name: "תקלת ציוד מרכזי", category: "תפעולי", probability: 55, impact: 65, score: 35.8, trend: "down", velocity: "high", owner: "מנהל מפעל", status: "mitigated", residual: 20, controls: 5 },
  { id: 4, name: "חובות אבודים", category: "אשראי", probability: 50, impact: 60, score: 30.0, trend: "up", velocity: "low", owner: "כספים", status: "active", residual: 25, controls: 2 },
  { id: 5, name: "עליית מחירי ברזל", category: "חומרי גלם", probability: 65, impact: 55, score: 35.8, trend: "stable", velocity: "medium", owner: "רכש", status: "monitored", residual: 30, controls: 3 },
  { id: 6, name: "מחסור עובדים מקצועיים", category: "תפעולי", probability: 60, impact: 50, score: 30.0, trend: "up", velocity: "low", owner: "HR", status: "active", residual: 28, controls: 2 },
  { id: 7, name: "שינויי רגולציה בנייה", category: "רגולציה", probability: 40, impact: 55, score: 22.0, trend: "stable", velocity: "low", owner: "משפטי", status: "monitored", residual: 18, controls: 1 },
  { id: 8, name: "פיחות שקל", category: 'מטח', probability: 35, impact: 30, score: 10.5, trend: "stable", velocity: "high", owner: "כספים", status: "monitored", residual: 8, controls: 1 },
  { id: 9, name: "שריפה / נזק מבני", category: "תפעולי", probability: 15, impact: 95, score: 14.3, trend: "stable", velocity: "high", owner: "בטיחות", status: "mitigated", residual: 5, controls: 6 },
  { id: 10, name: "עליית מחירי נירוסטה", category: "חומרי גלם", probability: 55, impact: 50, score: 27.5, trend: "down", velocity: "medium", owner: "רכש", status: "monitored", residual: 22, controls: 3 },
  { id: 11, name: "תביעה משפטית", category: "משפטי", probability: 20, impact: 70, score: 14.0, trend: "stable", velocity: "low", owner: "משפטי", status: "monitored", residual: 10, controls: 2 },
  { id: 12, name: "סייבר / IT", category: "תפעולי", probability: 25, impact: 45, score: 11.3, trend: "up", velocity: "high", owner: "IT", status: "active", residual: 9, controls: 3 },
  { id: 13, name: "עליית מחירי זכוכית", category: "חומרי גלם", probability: 45, impact: 40, score: 18.0, trend: "stable", velocity: "medium", owner: "רכש", status: "monitored", residual: 14, controls: 2 },
];

const MITIGATION = [
  {
    name: "גיוון ספקים אסטרטגי",
    risks: ["אלומיניום", "ברזל", "נירוסטה", "זכוכית"],
    cost: 45000, reduction: 28, timeline: "3-6 חודשים",
    status: "active", roi: 24.8, effectiveness: 85,
    actions: ["מיפוי 3+ ספקים לכל חומר", "הסכמי Framework", "מלאי ביטחון 30 יום", "דשבורד מחירים real-time"]
  },
  {
    name: "חוזים ארוכי טווח + Forward",
    risks: ["חומרי גלם", 'מטח'],
    cost: 30000, reduction: 35, timeline: "1-3 חודשים",
    status: "active", roi: 36.3, effectiveness: 78,
    actions: ["Forward 6 חודשים על אלומיניום", "חוזה שנתי ברזל עם תקרה", "גידור מט\"ח 50%", "סקירה רבעונית"]
  },
  {
    name: "ביטוח מקיף ומתקדם",
    risks: ["שריפה", "תביעה", "ציוד"],
    cost: 120000, reduction: 65, timeline: "1 חודש",
    status: "active", roi: 19.2, effectiveness: 92,
    actions: ["ביטוח רכוש All Risks", "ביטוח אחריות מקצועית", "ביטוח אובדן רווחים", "ביטוח סייבר"]
  },
  {
    name: "ניהול אשראי מתקדם",
    risks: ["חובות אבודים", "תזרים"],
    cost: 25000, reduction: 40, timeline: "2-4 חודשים",
    status: "planned", roi: 39.2, effectiveness: 72,
    actions: ["דירוג אשראי לקוחות (A-D)", "מקדמות 30%+ לדירוג C-D", "מעקב 60+ יום", "בי\"ח לחובות מסופקים"]
  },
  {
    name: "תחזוקה מונעת + IoT",
    risks: ["תקלת ציוד", "השבתה"],
    cost: 80000, reduction: 55, timeline: "6-12 חודשים",
    status: "planned", roi: 25.6, effectiveness: 88,
    actions: ["חיישני IoT על ציוד קריטי", "תוכנת CMMS", "תוכנית PM רבעונית", "אנליטיקה חזויה"]
  },
];

const APPETITE_RADAR = [
  { dim: "ביקוש/שוק", current: 76, appetite: 40, capacity: 90 },
  { dim: "חומרי גלם", current: 52, appetite: 50, capacity: 80 },
  { dim: "תפעולי", current: 36, appetite: 35, capacity: 70 },
  { dim: "אשראי", current: 30, appetite: 25, capacity: 60 },
  { dim: 'מטח', current: 11, appetite: 20, capacity: 50 },
  { dim: "רגולציה", current: 22, appetite: 30, capacity: 55 },
  { dim: "משפטי", current: 14, appetite: 20, capacity: 45 },
  { dim: "IT/סייבר", current: 11, appetite: 15, capacity: 40 },
];

const API = "/api";
const token = () => localStorage.getItem("erp_token") || localStorage.getItem("erp_token") || "";
const authHeaders = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });

type KriItem = { kri: string; current: number; threshold: number; limit: number; unit: string; status: string };

const DEFAULT_KRI: KriItem[] = [
  { kri: "ימי חייבים ממוצע", current: 0, threshold: 60, limit: 90, unit: "ימים", status: "ok" },
  { kri: "מרווח גולמי", current: 0, threshold: 15, limit: 10, unit: "%", status: "ok" },
  { kri: "תזרים חופשי/חודשי", current: 0, threshold: 50, limit: 0, unit: "K₪", status: "ok" },
  { kri: "הכנסות (K₪)", current: 0, threshold: 100, limit: 50, unit: "K₪", status: "ok" },
  { kri: "הוצאות (K₪)", current: 0, threshold: 400, limit: 600, unit: "K₪", status: "ok" },
];

export default function BlackRockRiskMatrix() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState("matrix");
  const [expandedMit, setExpandedMit] = useState<number | null>(null);
  const [kriData, setKriData] = useState<KriItem[]>(DEFAULT_KRI);

  useEffect(() => {
    const load = async () => {
      try {
        const [incRes, expRes] = await Promise.allSettled([
          authFetch(`${API}/finance/income?limit=100`, { headers: authHeaders() }).then(r => r.json()),
          authFetch(`${API}/finance/expenses?limit=100`, { headers: authHeaders() }).then(r => r.json()),
        ]);
        const income = (incRes.status === "fulfilled" && Array.isArray(incRes.value)) ? incRes.value : [];
        const expenses = (expRes.status === "fulfilled" && Array.isArray(expRes.value)) ? expRes.value : [];

        const totalInc = income.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
        const totalExp = expenses.reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
        const grossMargin = totalInc > 0 ? ((totalInc - totalExp) / totalInc * 100) : 0;
        const cashFlow = totalInc - totalExp;

        const built: KriItem[] = [
          { kri: "מרווח גולמי", current: parseFloat(grossMargin.toFixed(1)), threshold: 15, limit: 10, unit: "%", status: grossMargin < 10 ? "critical" : grossMargin < 15 ? "warning" : "ok" },
          { kri: "תזרים חופשי (K₪)", current: parseFloat((cashFlow / 1000).toFixed(1)), threshold: 50, limit: 0, unit: "K₪", status: cashFlow < 0 ? "critical" : cashFlow < 50000 ? "warning" : "ok" },
          { kri: "הכנסות (K₪)", current: parseFloat((totalInc / 1000).toFixed(0)), threshold: 100, limit: 50, unit: "K₪", status: totalInc < 50000 ? "warning" : "ok" },
          { kri: "הוצאות (K₪)", current: parseFloat((totalExp / 1000).toFixed(0)), threshold: 400, limit: 600, unit: "K₪", status: totalExp > 600000 ? "warning" : "ok" },
          { kri: "יחס הוצ'/הכנ'", current: totalInc > 0 ? parseFloat((totalExp / totalInc * 100).toFixed(1)) : 0, threshold: 85, limit: 95, unit: "%", status: totalInc > 0 && (totalExp / totalInc) > 0.95 ? "warning" : "ok" },
        ];
        if (built.length > 0) setKriData(built);
      } catch {}
    };
    load();
  }, []);

  const scatterData = RISK_ITEMS.map(r => ({
    x: r.probability, y: r.impact, z: r.score, name: r.name,
    color: r.score >= 50 ? "#ef4444" : r.score >= 25 ? "#f97316" : r.score >= 15 ? "#eab308" : "#22c55e",
  }));

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate("/finance/blackrock-2026")}>
            <ArrowRight className="w-4 h-4" />
          </Button>
          <Target className="w-5 h-5 text-purple-400" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Enterprise Risk Matrix</h1>
            <p className="text-[10px] text-muted-foreground">ISO 31000 / COSO ERM Framework | 13 סיכונים | KRI Dashboard | Risk Appetite</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px] font-mono">
            {RISK_ITEMS.filter(r => r.score >= 50).length} CRITICAL
          </Badge>
          <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px] font-mono">
            {RISK_ITEMS.filter(r => r.score >= 25 && r.score < 50).length} HIGH
          </Badge>
          <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 text-[10px] font-mono">
            {RISK_ITEMS.filter(r => r.score >= 15 && r.score < 25).length} MEDIUM
          </Badge>
          <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[10px] font-mono">
            {RISK_ITEMS.filter(r => r.score < 15).length} LOW
          </Badge>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-slate-800/50 border border-slate-700/50">
          <TabsTrigger value="matrix" className="text-xs data-[state=active]:bg-purple-600">Heat Map</TabsTrigger>
          <TabsTrigger value="register" className="text-xs data-[state=active]:bg-purple-600">Risk Register</TabsTrigger>
          <TabsTrigger value="kri" className="text-xs data-[state=active]:bg-purple-600">KRI Dashboard</TabsTrigger>
          <TabsTrigger value="appetite" className="text-xs data-[state=active]:bg-purple-600">Risk Appetite</TabsTrigger>
          <TabsTrigger value="mitigation" className="text-xs data-[state=active]:bg-purple-600">מיטיגציה</TabsTrigger>
        </TabsList>

        <TabsContent value="matrix" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="bg-slate-900/50 border-slate-700/40 lg:col-span-2">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="w-4 h-4 text-purple-400" />
                  Risk Heat Map — הסתברות × השפעה
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-2">
                <ResponsiveContainer width="100%" height={350}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis type="number" dataKey="x" name="הסתברות" domain={[0, 100]} stroke="#475569" fontSize={10}
                      label={{ value: "הסתברות %", position: "bottom", fill: "#475569", fontSize: 10 }}
                    />
                    <YAxis type="number" dataKey="y" name="השפעה" domain={[0, 100]} stroke="#475569" fontSize={10}
                      label={{ value: "השפעה %", angle: -90, position: "insideLeft", fill: "#475569", fontSize: 10 }}
                    />
                    <ZAxis type="number" dataKey="z" range={[80, 400]} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 10, direction: "rtl" }}
                      formatter={(_: any, name: string) => [name === "x" ? "הסתברות" : name === "y" ? "השפעה" : `ציון: ${_}`, ""]}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ""}
                    />
                    <ReferenceLine x={50} stroke="#475569" strokeDasharray="5 5" />
                    <ReferenceLine y={50} stroke="#475569" strokeDasharray="5 5" />
                    <Scatter data={scatterData} shape="circle">
                      {scatterData.map((e, i) => <Cell key={i} fill={e.color} opacity={0.8} />)}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
                <div className="flex items-center justify-center gap-4 mt-2">
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-red-500" /><span className="text-[10px] text-muted-foreground">קריטי (&gt;50)</span></div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-orange-500" /><span className="text-[10px] text-muted-foreground">גבוה (25-50)</span></div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-yellow-500" /><span className="text-[10px] text-muted-foreground">בינוני (15-25)</span></div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-green-500" /><span className="text-[10px] text-muted-foreground">נמוך (&lt;15)</span></div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-700/40">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-sm">Inherent vs Residual Risk</CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-2">
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={RISK_ITEMS.slice(0, 8)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis type="number" domain={[0, 80]} stroke="#475569" fontSize={9} />
                    <YAxis type="category" dataKey="name" stroke="#475569" fontSize={8} width={100} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 10, direction: "rtl" }} />
                    <Bar dataKey="score" name="Inherent" fill="#ef4444" radius={[0, 3, 3, 0]} opacity={0.6} />
                    <Bar dataKey="residual" name="Residual" fill="#22c55e" radius={[0, 3, 3, 0]} opacity={0.6} />
                    <Legend wrapperStyle={{ fontSize: 10, direction: "rtl" }} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="register" className="mt-4">
          <Card className="bg-slate-900/50 border-slate-700/40">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm">Risk Register — רישום סיכונים מלא (13 פריטים)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/40 bg-slate-800/20">
                    <th className="p-2 text-right text-muted-foreground">#</th>
                    <th className="p-2 text-right text-muted-foreground">סיכון</th>
                    <th className="p-2 text-right text-muted-foreground">קטגוריה</th>
                    <th className="p-2 text-right text-muted-foreground">P%</th>
                    <th className="p-2 text-right text-muted-foreground">I%</th>
                    <th className="p-2 text-right text-muted-foreground">ציון</th>
                    <th className="p-2 text-right text-muted-foreground">Residual</th>
                    <th className="p-2 text-right text-muted-foreground">מגמה</th>
                    <th className="p-2 text-right text-muted-foreground">מהירות</th>
                    <th className="p-2 text-right text-muted-foreground">בקרות</th>
                    <th className="p-2 text-right text-muted-foreground">אחראי</th>
                    <th className="p-2 text-right text-muted-foreground">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {RISK_ITEMS.map((r) => (
                    <tr key={r.id} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                      <td className="p-2 text-muted-foreground">{r.id}</td>
                      <td className="p-2 text-foreground font-medium">{r.name}</td>
                      <td className="p-2"><Badge className="bg-slate-700/30 text-slate-300 text-[9px]">{r.category}</Badge></td>
                      <td className="p-2 text-slate-300 font-mono">{r.probability}</td>
                      <td className="p-2 text-slate-300 font-mono">{r.impact}</td>
                      <td className="p-2 font-mono font-bold">
                        <span className={r.score >= 50 ? "text-red-400" : r.score >= 25 ? "text-orange-400" : r.score >= 15 ? "text-yellow-400" : "text-green-400"}>
                          {r.score.toFixed(1)}
                        </span>
                      </td>
                      <td className="p-2 text-green-400 font-mono">{r.residual}</td>
                      <td className="p-2">
                        {r.trend === "up" ? <span className="text-red-400">▲</span> : r.trend === "down" ? <span className="text-green-400">▼</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-2">
                        <Badge className={
                          r.velocity === "high" ? "bg-red-500/15 text-red-400 text-[9px]" :
                          r.velocity === "medium" ? "bg-yellow-500/15 text-yellow-400 text-[9px]" :
                          "bg-green-500/15 text-green-400 text-[9px]"
                        }>{r.velocity === "high" ? "מהיר" : r.velocity === "medium" ? "בינוני" : "איטי"}</Badge>
                      </td>
                      <td className="p-2 text-blue-400 font-mono">{r.controls}</td>
                      <td className="p-2 text-muted-foreground">{r.owner}</td>
                      <td className="p-2">
                        <Badge className={
                          r.status === "active" ? "bg-red-500/15 text-red-400 text-[9px]" :
                          r.status === "monitored" ? "bg-yellow-500/15 text-yellow-400 text-[9px]" :
                          "bg-green-500/15 text-green-400 text-[9px]"
                        }>{r.status === "active" ? "פעיל" : r.status === "monitored" ? "מנוטר" : "ממותן"}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kri" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {kriData.map((k, i) => (
              <Card key={i} className={`bg-slate-900/50 border-slate-700/40 ${k.status === "warning" ? "border-l-2 border-l-yellow-500" : ""}`}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-muted-foreground">{k.kri}</span>
                    {k.status === "warning" && <AlertTriangle className="w-3 h-3 text-yellow-400" />}
                  </div>
                  <div className={`text-xl font-bold font-mono ${k.status === "warning" ? "text-yellow-400" : "text-green-400"}`}>
                    {k.current}{k.unit === "%" || k.unit === "ימים" ? "" : " "}
                    <span className="text-sm">{k.unit}</span>
                  </div>
                  <div className="mt-2 w-full h-1.5 bg-slate-800 rounded-full overflow-hidden relative">
                    {k.limit > 0 && <div className="absolute h-full bg-yellow-500/30 rounded-full" style={{ left: `${Math.min((k.threshold / k.limit) * 100, 95)}%`, width: `${Math.min(((k.limit - k.threshold) / k.limit) * 100, 10)}%` }} />}
                    <div className={`h-full rounded-full ${k.status === "warning" || k.status === "critical" ? "bg-yellow-500" : "bg-green-500"}`}
                      style={{ width: k.limit > 0 ? `${Math.min((Math.abs(k.current) / Math.abs(k.limit)) * 100, 100)}%` : "50%" }}
                    />
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-[8px] text-green-400">סף: {k.threshold}</span>
                    <span className="text-[8px] text-red-400">לימיט: {k.limit}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="appetite" className="space-y-4 mt-4">
          <Card className="bg-slate-900/50 border-slate-700/40">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="w-4 h-4 text-purple-400" />
                Risk Appetite Framework — חשיפה נוכחית vs סף סבילות vs קיבולת
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              <ResponsiveContainer width="100%" height={350}>
                <RadarChart data={APPETITE_RADAR}>
                  <PolarGrid stroke="#334155" />
                  <PolarAngleAxis dataKey="dim" stroke="#94a3b8" fontSize={10} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} stroke="#334155" fontSize={8} tickCount={5} />
                  <Radar name="חשיפה נוכחית" dataKey="current" stroke="#ef4444" fill="#ef4444" fillOpacity={0.15} strokeWidth={2} />
                  <Radar name="סף סבילות" dataKey="appetite" stroke="#eab308" fill="#eab308" fillOpacity={0.05} strokeWidth={1.5} strokeDasharray="5 5" />
                  <Radar name="קיבולת מקסימלית" dataKey="capacity" stroke="#475569" fill="none" strokeWidth={1} strokeDasharray="3 3" />
                  <Legend wrapperStyle={{ fontSize: 10, direction: "rtl" }} />
                </RadarChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 px-2">
                {APPETITE_RADAR.filter(a => a.current > a.appetite).map((a, i) => (
                  <div key={i} className="bg-red-500/5 border border-red-500/20 rounded p-2">
                    <div className="text-[9px] text-red-400 font-medium">{a.dim}</div>
                    <div className="text-[10px] text-muted-foreground">חריגה: +{a.current - a.appetite} נק&apos;</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mitigation" className="space-y-3 mt-4">
          {MITIGATION.map((m, i) => (
            <Card key={i} className="bg-slate-900/50 border-slate-700/40">
              <CardContent className="p-0">
                <div className="p-3 flex items-center justify-between cursor-pointer hover:bg-slate-800/20 transition-colors"
                  onClick={() => setExpandedMit(expandedMit === i ? null : i)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${m.status === "active" ? "bg-green-500/15" : "bg-yellow-500/15"}`}>
                      <Shield className={`w-4 h-4 ${m.status === "active" ? "text-green-400" : "text-yellow-400"}`} />
                    </div>
                    <div>
                      <div className="text-sm text-foreground font-medium">{m.name}</div>
                      <div className="text-[10px] text-muted-foreground">{m.risks.join(" · ")} | {m.timeline}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-[8px] text-muted-foreground">עלות</div>
                      <div className="text-xs text-slate-300 font-mono">₪{(m.cost / 1000).toFixed(0)}K</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[8px] text-muted-foreground">הפחתה</div>
                      <div className="text-xs text-green-400 font-mono">{m.reduction}%</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[8px] text-muted-foreground">ROI</div>
                      <div className="text-xs text-blue-400 font-mono">{m.roi}%</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[8px] text-muted-foreground">אפקטיביות</div>
                      <div className="text-xs font-mono" style={{ color: m.effectiveness >= 85 ? "#22c55e" : m.effectiveness >= 70 ? "#eab308" : "#ef4444" }}>
                        {m.effectiveness}%
                      </div>
                    </div>
                    <Badge className={m.status === "active" ? "bg-green-500/15 text-green-400 text-[9px]" : "bg-yellow-500/15 text-yellow-400 text-[9px]"}>
                      {m.status === "active" ? "פעיל" : "מתוכנן"}
                    </Badge>
                    {expandedMit === i ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>
                {expandedMit === i && (
                  <div className="px-3 pb-3 pt-1 border-t border-slate-800/40">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {m.actions.map((a, j) => (
                        <div key={j} className="bg-slate-800/30 rounded p-2 flex items-start gap-2">
                          <div className="w-4 h-4 rounded bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-[8px] text-blue-400 font-bold">{j + 1}</span>
                          </div>
                          <span className="text-[10px] text-slate-300">{a}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-4">רשומות קשורות</h3>
          <RelatedRecords entityType="blackrock-risk-matrix" entityId="dashboard" />
        </div>
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-4">היסטוריית פעילות</h3>
          <ActivityLog entityType="blackrock-risk-matrix" entityId="dashboard" />
        </div>
      </div>
    </div>
  );
}
