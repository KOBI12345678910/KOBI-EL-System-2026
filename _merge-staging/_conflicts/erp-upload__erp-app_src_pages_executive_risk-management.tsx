import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import {
  Shield, AlertTriangle, AlertCircle, Target, TrendingUp, TrendingDown,
  BarChart3, Plus, RefreshCw, CheckCircle, XCircle, Clock, Eye,
  ChevronDown, Flame, Zap, ArrowRight, FileText, DollarSign,
  Activity, Users, Lock, Globe, Star, Building2
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis
} from "recharts";

interface Risk {
  id: number; risk_code: string; title: string; description: string; category: string;
  probability: number; impact: number; risk_score: number; velocity: string;
  owner: string; department: string; status: string; mitigation_plan: string;
  residual_score: number; response_strategy: string; target_date: string; open_mitigations: number; incident_count: number;
}
interface Mitigation { id: number; risk_id: number; risk_title: string; risk_code: string; category: string; action: string; responsible: string; due_date: string; status: string; effectiveness: string; }
interface Incident { id: number; risk_id: number; risk_title: string; risk_code: string; incident_code: string; title: string; severity: string; financial_impact: number; status: string; incident_date: string; }
interface Heatmap { matrix: any[][]; }
interface Dashboard { stats: any; byCategory: any[]; byStatus: any[]; mitigations: any; incidents: any; }

const CATEGORY_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  financial: { icon: DollarSign, color: "text-red-400", label: "פיננסי" },
  operational: { icon: Activity, color: "text-orange-400", label: "תפעולי" },
  supply_chain: { icon: Globe, color: "text-yellow-400", label: "שרשרת אספקה" },
  quality: { icon: Star, color: "text-purple-400", label: "איכות" },
  compliance: { icon: FileText, color: "text-blue-400", label: "ציות" },
  cyber: { icon: Lock, color: "text-pink-400", label: "סייבר" },
  reputational: { icon: Users, color: "text-indigo-400", label: "מוניטין" },
  strategic: { icon: Target, color: "text-teal-400", label: "אסטרטגי" },
};

const SEVERITY_COLORS: Record<string, string> = { minor: "bg-gray-500/20 text-gray-400", moderate: "bg-yellow-500/20 text-yellow-400", major: "bg-orange-500/20 text-orange-400", critical: "bg-red-500/20 text-red-400", catastrophic: "bg-red-700/20 text-red-500" };

function formatDate(d: string) { return d ? new Date(d).toLocaleDateString("he-IL") : "-"; }
function formatCurrency(v: number) { return `${(v || 0).toLocaleString()} ILS`; }

// Risk heatmap cell color
function heatColor(p: number, i: number): string {
  const score = p * i;
  if (score >= 20) return "bg-red-600";
  if (score >= 15) return "bg-red-500/80";
  if (score >= 10) return "bg-orange-500/70";
  if (score >= 5) return "bg-yellow-500/60";
  return "bg-green-500/40";
}

export default function RiskManagementPage() {
  const [tab, setTab] = useState<"dashboard" | "register" | "heatmap" | "mitigations" | "incidents">("dashboard");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [heatmap, setHeatmap] = useState<Heatmap | null>(null);
  const [mitigations, setMitigations] = useState<Mitigation[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddRisk, setShowAddRisk] = useState(false);
  const [newRisk, setNewRisk] = useState({ title: "", description: "", category: "operational", probability: 3, impact: 3, owner: "", department: "", response_strategy: "mitigate" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, riskRes, hmRes, mitRes, incRes] = await Promise.all([
        authFetch("/api/risk/dashboard"), authFetch("/api/risk/top-risks?limit=20"),
        authFetch("/api/risk/heatmap"), authFetch("/api/risk/mitigations"),
        authFetch("/api/risk/incidents")
      ]);
      setDashboard(await dashRes.json()); setRisks(await riskRes.json());
      setHeatmap(await hmRes.json()); setMitigations(await mitRes.json());
      setIncidents(await incRes.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addRisk = async () => {
    await authFetch("/api/risk/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newRisk) });
    setShowAddRisk(false); setNewRisk({ title: "", description: "", category: "operational", probability: 3, impact: 3, owner: "", department: "", response_strategy: "mitigate" }); load();
  };

  const d = dashboard;
  const impactLabels = ["זניח", "נמוך", "בינוני", "גבוה", "קריטי"];
  const probLabels = ["נדיר", "נמוך", "בינוני", "סביר", "כמעט ודאי"];

  return (
    <div className="min-h-screen bg-background text-foreground p-4 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">מרכז ניהול סיכונים</h1>
            <p className="text-sm text-muted-foreground">Advanced Risk Management Center</p>
          </div>
        </div>
        <button onClick={load} className="p-2 rounded-lg bg-card hover:bg-accent transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-card rounded-lg p-1 overflow-x-auto">
        {([["dashboard", "דשבורד", BarChart3], ["register", "מרשם סיכונים", FileText], ["heatmap", "מפת חום", Flame], ["mitigations", "הפחתות", Target], ["incidents", "אירועים", AlertCircle]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key as any)} className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm whitespace-nowrap transition-colors ${tab === key ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* DASHBOARD */}
      {tab === "dashboard" && d && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {[
              { label: 'סה"כ סיכונים', value: d.stats?.total_risks || 0, icon: Shield, color: "from-blue-500/20" },
              { label: "קריטיים (15+)", value: d.stats?.critical_risks || 0, icon: Flame, color: "from-red-500/20" },
              { label: "גבוהים (10-14)", value: d.stats?.high_risks || 0, icon: AlertTriangle, color: "from-orange-500/20" },
              { label: "הפחתות פתוחות", value: d.mitigations?.in_progress || 0, icon: Target, color: "from-purple-500/20" },
              { label: "אירועים (30 יום)", value: d.incidents?.last_30_days || 0, icon: AlertCircle, color: "from-yellow-500/20" },
            ].map((kpi, i) => (
              <div key={i} className={`bg-gradient-to-br ${kpi.color} to-transparent border border-border/50 rounded-xl p-3`}>
                <div className="flex items-center gap-2 mb-1"><kpi.icon className="w-4 h-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">{kpi.label}</span></div>
                <div className="text-2xl font-bold">{Number(kpi.value).toLocaleString()}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* By Category */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3">סיכונים לפי קטגוריה</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={(d.byCategory || []).map(c => ({ name: CATEGORY_CONFIG[c.category]?.label || c.category, count: Number(c.count), avg: Number(c.avg_score || 0) }))} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} width={80} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#EF4444" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Incidents summary */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3">סיכום אירועים</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-background rounded-lg p-3 text-center"><div className="text-2xl font-bold">{d.incidents?.total_incidents || 0}</div><div className="text-xs text-muted-foreground">סה"כ</div></div>
                <div className="bg-background rounded-lg p-3 text-center"><div className="text-2xl font-bold text-yellow-400">{d.incidents?.active || 0}</div><div className="text-xs text-muted-foreground">פתוחים</div></div>
                <div className="bg-background rounded-lg p-3 text-center"><div className="text-2xl font-bold text-red-400">{d.incidents?.severe || 0}</div><div className="text-xs text-muted-foreground">חמורים</div></div>
                <div className="bg-background rounded-lg p-3 text-center"><div className="text-lg font-bold text-orange-400">{formatCurrency(Number(d.incidents?.total_financial_impact || 0))}</div><div className="text-xs text-muted-foreground">השפעה כספית</div></div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="bg-background rounded-lg p-3 text-center"><div className="text-2xl font-bold">{d.mitigations?.total_mitigations || 0}</div><div className="text-xs text-muted-foreground">הפחתות</div></div>
                <div className="bg-background rounded-lg p-3 text-center"><div className="text-2xl font-bold text-emerald-400">{d.mitigations?.completed || 0}</div><div className="text-xs text-muted-foreground">הושלמו</div></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REGISTER TAB */}
      {tab === "register" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">Top סיכונים ({risks.length})</h3>
            <button onClick={() => setShowAddRisk(true)} className="flex items-center gap-1 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm"><Plus className="w-4 h-4" />סיכון חדש</button>
          </div>

          {showAddRisk && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h4 className="font-semibold text-sm">סיכון חדש</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <input placeholder="כותרת" className="bg-background border border-border rounded-lg px-3 py-2 text-sm col-span-2" value={newRisk.title} onChange={e => setNewRisk({ ...newRisk, title: e.target.value })} />
                <select className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={newRisk.category} onChange={e => setNewRisk({ ...newRisk, category: e.target.value })}>
                  {Object.entries(CATEGORY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={newRisk.response_strategy} onChange={e => setNewRisk({ ...newRisk, response_strategy: e.target.value })}>
                  {["avoid", "mitigate", "transfer", "accept", "share"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">הסתברות:</span><input type="range" min={1} max={5} value={newRisk.probability} onChange={e => setNewRisk({ ...newRisk, probability: Number(e.target.value) })} className="flex-1" /><span className="font-mono text-sm w-4">{newRisk.probability}</span></div>
                <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">השפעה:</span><input type="range" min={1} max={5} value={newRisk.impact} onChange={e => setNewRisk({ ...newRisk, impact: Number(e.target.value) })} className="flex-1" /><span className="font-mono text-sm w-4">{newRisk.impact}</span></div>
                <input placeholder="אחראי" className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={newRisk.owner} onChange={e => setNewRisk({ ...newRisk, owner: e.target.value })} />
                <input placeholder="מחלקה" className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={newRisk.department} onChange={e => setNewRisk({ ...newRisk, department: e.target.value })} />
              </div>
              <textarea placeholder="תיאור" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" rows={2} value={newRisk.description} onChange={e => setNewRisk({ ...newRisk, description: e.target.value })} />
              <div className="flex gap-2">
                <button onClick={addRisk} className="bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-sm">שמור</button>
                <button onClick={() => setShowAddRisk(false)} className="bg-accent px-4 py-1.5 rounded-lg text-sm">ביטול</button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {risks.map(r => {
              const cat = CATEGORY_CONFIG[r.category] || CATEGORY_CONFIG.operational;
              return (
                <div key={r.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg ${r.risk_score >= 15 ? "bg-red-500/20" : r.risk_score >= 10 ? "bg-orange-500/20" : r.risk_score >= 5 ? "bg-yellow-500/20" : "bg-green-500/20"} flex items-center justify-center`}>
                        <span className="text-lg font-bold">{r.risk_score}</span>
                      </div>
                      <div>
                        <div className="font-medium flex items-center gap-2">{r.title}<span className="text-xs font-mono text-muted-foreground">{r.risk_code}</span></div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className={`flex items-center gap-1 ${cat.color}`}><cat.icon className="w-3 h-3" />{cat.label}</span>
                          <span>P:{r.probability} I:{r.impact}</span>
                          <span>{r.status}</span>
                          <span>{r.response_strategy}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {r.open_mitigations > 0 && <span className="bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">{r.open_mitigations} הפחתות</span>}
                      {r.incident_count > 0 && <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded">{r.incident_count} אירועים</span>}
                    </div>
                  </div>
                  {r.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.description}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* HEATMAP TAB */}
      {tab === "heatmap" && heatmap && (
        <div className="space-y-4">
          <h3 className="font-semibold">מפת חום סיכונים (5x5)</h3>
          <div className="bg-card border border-border rounded-xl p-6 overflow-x-auto">
            <div className="flex items-end gap-2">
              <div className="flex flex-col items-center gap-1 mr-2">
                <span className="text-xs text-muted-foreground mb-1 -rotate-90 origin-center whitespace-nowrap">הסתברות</span>
              </div>
              <div>
                <div className="grid grid-cols-5 gap-1 mb-1">
                  {impactLabels.map((l, i) => <div key={i} className="text-center text-[10px] text-muted-foreground w-20">{l}</div>)}
                </div>
                {[...Array(5)].map((_, pIdx) => {
                  const p = 5 - pIdx; // rows from 5 to 1
                  return (
                    <div key={p} className="flex items-center gap-1 mb-1">
                      {[...Array(5)].map((_, iIdx) => {
                        const impact = iIdx + 1;
                        const cell = heatmap.matrix?.[p - 1]?.[iIdx] || { count: 0, risks: [] };
                        return (
                          <div key={iIdx} className={`w-20 h-16 rounded-lg ${heatColor(p, impact)} flex flex-col items-center justify-center text-xs relative group cursor-pointer border border-white/10`}>
                            <span className="font-bold text-white text-lg">{cell.count}</span>
                            <span className="text-[9px] text-white/60">{p}x{impact}={p * impact}</span>
                            {cell.count > 0 && (
                              <div className="absolute z-10 hidden group-hover:block bg-card border border-border rounded-lg p-2 shadow-xl w-56 top-full mt-1 right-0">
                                {cell.risks.slice(0, 5).map((r: any, i: number) => (
                                  <div key={i} className="text-xs py-0.5 truncate">{r.risk_code}: {r.title}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <span className="text-[10px] text-muted-foreground w-16 text-center">{probLabels[p - 1]}</span>
                    </div>
                  );
                })}
                <div className="text-center text-xs text-muted-foreground mt-2">השפעה &rarr;</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MITIGATIONS TAB */}
      {tab === "mitigations" && (
        <div className="space-y-3">
          <h3 className="font-semibold">הפחתות ({mitigations.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-right">
                  <th className="px-3 py-2">סיכון</th><th className="px-3 py-2">פעולה</th><th className="px-3 py-2">אחראי</th>
                  <th className="px-3 py-2">תאריך יעד</th><th className="px-3 py-2">סטטוס</th><th className="px-3 py-2">אפקטיביות</th>
                </tr>
              </thead>
              <tbody>
                {mitigations.map(m => (
                  <tr key={m.id} className="border-b border-border/50 hover:bg-accent/50">
                    <td className="px-3 py-2"><span className="text-xs font-mono">{m.risk_code}</span> {m.risk_title?.slice(0, 40)}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate">{m.action}</td>
                    <td className="px-3 py-2">{m.responsible || "-"}</td>
                    <td className="px-3 py-2 text-xs">{formatDate(m.due_date)}</td>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs ${m.status === "completed" ? "bg-emerald-500/20 text-emerald-400" : m.status === "in_progress" ? "bg-blue-500/20 text-blue-400" : m.status === "overdue" ? "bg-red-500/20 text-red-400" : "bg-gray-500/20 text-gray-400"}`}>{m.status}</span></td>
                    <td className="px-3 py-2">{m.effectiveness ? <span className={`text-xs ${m.effectiveness === "effective" ? "text-emerald-400" : m.effectiveness === "partially" ? "text-yellow-400" : "text-red-400"}`}>{m.effectiveness}</span> : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* INCIDENTS TAB */}
      {tab === "incidents" && (
        <div className="space-y-3">
          <h3 className="font-semibold">אירועי סיכון ({incidents.length})</h3>
          <div className="space-y-2">
            {incidents.map(inc => (
              <div key={inc.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <AlertCircle className={`w-5 h-5 ${inc.severity === "catastrophic" || inc.severity === "critical" ? "text-red-400" : inc.severity === "major" ? "text-orange-400" : "text-yellow-400"}`} />
                    <span className="font-medium">{inc.title}</span>
                    <span className="text-xs font-mono text-muted-foreground">{inc.incident_code}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs ${SEVERITY_COLORS[inc.severity] || "bg-gray-500/20 text-gray-400"}`}>{inc.severity}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {inc.risk_code && <span>סיכון: {inc.risk_code}</span>}
                  <span>תאריך: {formatDate(inc.incident_date)}</span>
                  {inc.financial_impact > 0 && <span className="text-red-400">{formatCurrency(inc.financial_impact)}</span>}
                  <span className={`${inc.status === "open" ? "text-yellow-400" : inc.status === "resolved" ? "text-emerald-400" : "text-muted-foreground"}`}>{inc.status}</span>
                </div>
              </div>
            ))}
            {incidents.length === 0 && <p className="text-center text-muted-foreground py-8">אין אירועים מתועדים</p>}
          </div>
        </div>
      )}
    </div>
  );
}
