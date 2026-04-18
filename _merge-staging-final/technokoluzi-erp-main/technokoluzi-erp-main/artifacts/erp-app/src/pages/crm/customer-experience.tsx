import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import {
  Heart, Users, MessageSquare, Star, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle, Clock, Plus, RefreshCw, Eye,
  Phone, Mail, MessageCircle, Video, Globe, MapPin, BarChart3,
  ThumbsUp, ThumbsDown, Minus, UserCheck, Shield, Target,
  Activity, Smile, Frown, Meh, Send, ArrowRight
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, AreaChart, Area
} from "recharts";

interface Dashboard { nps: any; health: any; journeys: any; touchpoints: any; atRiskCustomers: any[]; }
interface Journey { id: number; customer_id: number; customer_name: string; journey_type: string; current_stage: string; started_at: string; completed_at: string; health_score: number; assigned_csm: string; }
interface NpsSurvey { id: number; customer_id: number; customer_name: string; score: number; category: string; feedback: string; project_name: string; sent_at: string; responded_at: string; }
interface HealthScore { id: number; customer_id: number; customer_name: string; overall_score: number; engagement_score: number; satisfaction_score: number; financial_score: number; risk_level: string; calculated_at: string; }

const CHANNEL_ICONS: Record<string, any> = { email: Mail, phone: Phone, whatsapp: MessageCircle, portal: Globe, meeting: Users, site_visit: MapPin, video_call: Video, chat: MessageSquare, social_media: Globe };
const RISK_COLORS: Record<string, string> = { low: "text-emerald-400", medium: "text-yellow-400", high: "text-orange-400", critical: "text-red-400" };
const RISK_BG: Record<string, string> = { low: "bg-emerald-500/20", medium: "bg-yellow-500/20", high: "bg-orange-500/20", critical: "bg-red-500/20" };
const NPS_COLORS = { promoter: "#10B981", passive: "#EAB308", detractor: "#EF4444" };

function formatDate(d: string) { return d ? new Date(d).toLocaleDateString("he-IL") : "-"; }

function NpsGauge({ score, size = 120 }: { score: number; size?: number }) {
  const color = score >= 50 ? "#10B981" : score >= 0 ? "#EAB308" : "#EF4444";
  const r = size * 0.38;
  const circ = 2 * Math.PI * r;
  const norm = (score + 100) / 200; // NPS goes from -100 to 100
  const offset = circ - norm * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={8} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-1000" />
      </svg>
      <div className="absolute flex items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-3xl font-bold" style={{ color }}>{score}</span>
      </div>
      <span className="text-xs text-muted-foreground">NPS Score</span>
    </div>
  );
}

function HealthBar({ score, label }: { score: number; label: string }) {
  const color = score >= 75 ? "bg-emerald-500" : score >= 50 ? "bg-yellow-500" : score >= 25 ? "bg-orange-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{score}</span>
      </div>
      <div className="w-full h-2 bg-background rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export default function CustomerExperiencePage() {
  const [tab, setTab] = useState<"dashboard" | "journeys" | "nps" | "health">("dashboard");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [npsSurveys, setNpsSurveys] = useState<NpsSurvey[]>([]);
  const [healthScores, setHealthScores] = useState<HealthScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddJourney, setShowAddJourney] = useState(false);
  const [newJourney, setNewJourney] = useState({ customer_id: "", customer_name: "", journey_type: "onboarding", assigned_csm: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, jrnRes, npsRes, hsRes] = await Promise.all([
        authFetch("/api/cem/dashboard"), authFetch("/api/cem/journeys"),
        authFetch("/api/cem/nps"), authFetch("/api/cem/health-scores")
      ]);
      setDashboard(await dashRes.json()); setJourneys(await jrnRes.json());
      setNpsSurveys(await npsRes.json()); setHealthScores(await hsRes.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addJourney = async () => {
    await authFetch("/api/cem/journeys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newJourney) });
    setShowAddJourney(false); setNewJourney({ customer_id: "", customer_name: "", journey_type: "onboarding", assigned_csm: "" }); load();
  };

  const d = dashboard;
  const npsScore = Number(d?.nps?.nps_score || 0);
  const healthData = d?.health ? [
    { name: "בריא", value: Number(d.health.healthy || 0), color: "#10B981" },
    { name: "דורש תשומת לב", value: Number(d.health.needs_attention || 0), color: "#EAB308" },
    { name: "בסיכון", value: Number(d.health.at_risk || 0), color: "#F97316" },
    { name: "קריטי", value: Number(d.health.critical || 0), color: "#EF4444" },
  ].filter(x => x.value > 0) : [];

  const radarData = healthScores.length > 0 ? (() => {
    const avg = (field: keyof HealthScore) => Math.round(healthScores.reduce((s, h) => s + Number(h[field] || 0), 0) / healthScores.length);
    return [
      { subject: "מעורבות", value: avg("engagement_score") },
      { subject: "שביעות רצון", value: avg("satisfaction_score") },
      { subject: "פיננסי", value: avg("financial_score") },
      { subject: "ציון כללי", value: avg("overall_score") },
    ];
  })() : [];

  return (
    <div className="min-h-screen bg-background text-foreground p-4 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center">
            <Heart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">ניהול חוויית לקוח</h1>
            <p className="text-sm text-muted-foreground">Customer Experience Management</p>
          </div>
        </div>
        <button onClick={load} className="p-2 rounded-lg bg-card hover:bg-accent transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-card rounded-lg p-1">
        {([["dashboard", "דשבורד", BarChart3], ["journeys", "מסעות לקוח", ArrowRight], ["nps", "NPS", Star], ["health", "בריאות לקוחות", Shield]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key as any)} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${tab === key ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* DASHBOARD */}
      {tab === "dashboard" && d && (
        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              { label: "ציון NPS", value: npsScore, icon: Star, color: "from-yellow-500/20" },
              { label: "סקרים נשלחו", value: d.nps?.total_surveys || 0, icon: Send, color: "from-blue-500/20" },
              { label: "מקדמים", value: d.nps?.promoters || 0, icon: ThumbsUp, color: "from-emerald-500/20" },
              { label: "מלעיזים", value: d.nps?.detractors || 0, icon: ThumbsDown, color: "from-red-500/20" },
              { label: "לקוחות בסיכון", value: (d.atRiskCustomers || []).length, icon: AlertTriangle, color: "from-orange-500/20" },
              { label: "נקודות מגע (שבוע)", value: d.touchpoints?.this_week || 0, icon: MessageSquare, color: "from-purple-500/20" },
            ].map((kpi, i) => (
              <div key={i} className={`bg-gradient-to-br ${kpi.color} to-transparent border border-border/50 rounded-xl p-3`}>
                <div className="flex items-center gap-2 mb-1"><kpi.icon className="w-4 h-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">{kpi.label}</span></div>
                <div className="text-2xl font-bold">{Number(kpi.value).toLocaleString()}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* NPS Distribution */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3">התפלגות NPS</h3>
              <div className="flex items-center justify-center mb-3 relative" style={{ height: 130 }}>
                <NpsGauge score={npsScore} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-emerald-500/10 rounded-lg p-2"><div className="text-lg font-bold text-emerald-400">{d.nps?.promoters || 0}</div><div className="text-[10px] text-muted-foreground">מקדמים (9-10)</div></div>
                <div className="bg-yellow-500/10 rounded-lg p-2"><div className="text-lg font-bold text-yellow-400">{d.nps?.passives || 0}</div><div className="text-[10px] text-muted-foreground">פסיביים (7-8)</div></div>
                <div className="bg-red-500/10 rounded-lg p-2"><div className="text-lg font-bold text-red-400">{d.nps?.detractors || 0}</div><div className="text-[10px] text-muted-foreground">מלעיזים (0-6)</div></div>
              </div>
            </div>

            {/* Health Distribution */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3">בריאות לקוחות</h3>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={healthData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={3}>
                    {healthData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 justify-center mt-1">
                {healthData.map((e, i) => (
                  <span key={i} className="flex items-center gap-1 text-xs"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: e.color }} />{e.name}: {e.value}</span>
                ))}
              </div>
            </div>

            {/* Radar Chart */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3">ממדי חוויה (ממוצע)</h3>
              {radarData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="rgba(255,255,255,0.1)" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 9 }} />
                    <Radar dataKey="value" stroke="#EC4899" fill="#EC4899" fillOpacity={0.2} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-muted-foreground text-center py-8">אין נתוני בריאות</p>}
            </div>
          </div>

          {/* At-Risk Customers */}
          {(d.atRiskCustomers || []).length > 0 && (
            <div className="bg-card border border-orange-500/30 rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-400" />לקוחות בסיכון</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {d.atRiskCustomers.map((c: any, i: number) => (
                  <div key={i} className={`border rounded-lg p-3 ${RISK_BG[c.risk_level]} border-border/50`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">{c.customer_name || `לקוח #${c.customer_id}`}</span>
                      <span className={`text-xs font-semibold ${RISK_COLORS[c.risk_level]}`}>{c.overall_score}/100</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {(c.risk_factors || []).slice(0, 2).map((f: string, j: number) => <div key={j}>- {f}</div>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* JOURNEYS TAB */}
      {tab === "journeys" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">מסעות לקוח ({journeys.length})</h3>
            <button onClick={() => setShowAddJourney(true)} className="flex items-center gap-1 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm"><Plus className="w-4 h-4" />מסע חדש</button>
          </div>
          {showAddJourney && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <input placeholder="מזהה לקוח" className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={newJourney.customer_id} onChange={e => setNewJourney({ ...newJourney, customer_id: e.target.value })} />
                <input placeholder="שם לקוח" className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={newJourney.customer_name} onChange={e => setNewJourney({ ...newJourney, customer_name: e.target.value })} />
                <select className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={newJourney.journey_type} onChange={e => setNewJourney({ ...newJourney, journey_type: e.target.value })}>
                  {["onboarding", "project", "support", "renewal", "upsell", "expansion", "recovery"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input placeholder="CSM" className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={newJourney.assigned_csm} onChange={e => setNewJourney({ ...newJourney, assigned_csm: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <button onClick={addJourney} className="bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-sm">שמור</button>
                <button onClick={() => setShowAddJourney(false)} className="bg-accent px-4 py-1.5 rounded-lg text-sm">ביטול</button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {journeys.map(j => (
              <div key={j.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <UserCheck className="w-5 h-5 text-pink-400" />
                    <div>
                      <div className="font-medium">{j.customer_name || `לקוח #${j.customer_id}`}</div>
                      <div className="text-xs text-muted-foreground">{j.journey_type} - {j.current_stage}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-center"><div className={`text-lg font-bold ${j.health_score >= 70 ? "text-emerald-400" : j.health_score >= 40 ? "text-yellow-400" : "text-red-400"}`}>{j.health_score}</div><div className="text-[10px] text-muted-foreground">בריאות</div></div>
                    {j.completed_at ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : <Clock className="w-5 h-5 text-yellow-400" />}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>CSM: {j.assigned_csm || "-"}</span>
                  <span>התחלה: {formatDate(j.started_at)}</span>
                  {j.completed_at && <span>סיום: {formatDate(j.completed_at)}</span>}
                </div>
              </div>
            ))}
            {journeys.length === 0 && <p className="text-center text-muted-foreground py-8">אין מסעות לקוח</p>}
          </div>
        </div>
      )}

      {/* NPS TAB */}
      {tab === "nps" && (
        <div className="space-y-4">
          <h3 className="font-semibold">סקרי NPS ({npsSurveys.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-right">
                  <th className="px-3 py-2">לקוח</th><th className="px-3 py-2">פרויקט</th><th className="px-3 py-2">ציון</th>
                  <th className="px-3 py-2">קטגוריה</th><th className="px-3 py-2">משוב</th><th className="px-3 py-2">נשלח</th><th className="px-3 py-2">נענה</th>
                </tr>
              </thead>
              <tbody>
                {npsSurveys.map(s => (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-accent/50">
                    <td className="px-3 py-2">{s.customer_name || `#${s.customer_id}`}</td>
                    <td className="px-3 py-2">{s.project_name || "-"}</td>
                    <td className="px-3 py-2"><span className={`font-bold ${s.score >= 9 ? "text-emerald-400" : s.score >= 7 ? "text-yellow-400" : s.score != null ? "text-red-400" : "text-muted-foreground"}`}>{s.score ?? "-"}</span></td>
                    <td className="px-3 py-2">{s.category ? <span className={`px-2 py-0.5 rounded text-xs ${s.category === "promoter" ? "bg-emerald-500/20 text-emerald-400" : s.category === "passive" ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"}`}>{s.category}</span> : "-"}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate">{s.feedback || "-"}</td>
                    <td className="px-3 py-2 text-xs">{formatDate(s.sent_at)}</td>
                    <td className="px-3 py-2 text-xs">{s.responded_at ? formatDate(s.responded_at) : <span className="text-yellow-400">ממתין</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* HEALTH TAB */}
      {tab === "health" && (
        <div className="space-y-4">
          <h3 className="font-semibold">ציוני בריאות לקוחות ({healthScores.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {healthScores.map(h => (
              <div key={h.id} className={`bg-card border rounded-xl p-4 ${RISK_BG[h.risk_level]} border-border/50`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium">{h.customer_name || `לקוח #${h.customer_id}`}</span>
                  <span className={`text-2xl font-bold ${RISK_COLORS[h.risk_level]}`}>{h.overall_score}</span>
                </div>
                <div className="space-y-2">
                  <HealthBar score={h.engagement_score} label="מעורבות" />
                  <HealthBar score={h.satisfaction_score} label="שביעות רצון" />
                  <HealthBar score={h.financial_score} label="פיננסי" />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span className={`px-2 py-0.5 rounded ${RISK_BG[h.risk_level]} ${RISK_COLORS[h.risk_level]}`}>{h.risk_level}</span>
                  <span>{formatDate(h.calculated_at)}</span>
                </div>
              </div>
            ))}
            {healthScores.length === 0 && <p className="text-center text-muted-foreground py-8 col-span-full">אין ציוני בריאות - חשב ציון ללקוח</p>}
          </div>
        </div>
      )}
    </div>
  );
}
