import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Leaf, Globe, Users, Shield, Target, TrendingDown, TrendingUp,
  BarChart3, Droplets, Zap, Fuel, Truck, Trash2, RefreshCw,
  CheckCircle2, Plus, Award, Factory
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || document.cookie.match(/token=([^;]+)/)?.[1] || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });
const fmtN = (n: number) => new Intl.NumberFormat("he-IL").format(Math.round(n));

const CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: typeof Leaf }> = {
  environmental: { label: "סביבתי", color: "text-emerald-400", icon: Leaf },
  social: { label: "חברתי", color: "text-blue-400", icon: Users },
  governance: { label: "ממשל תאגידי", color: "text-purple-400", icon: Shield },
};

const SOURCE_ICONS: Record<string, typeof Zap> = {
  electricity: Zap, fuel: Fuel, transport: Truck, materials: Factory,
  waste: Trash2, water: Droplets, refrigerants: Globe, other: BarChart3,
};
const SOURCE_LABELS: Record<string, string> = {
  electricity: "חשמל", fuel: "דלק", transport: "תחבורה", materials: "חומרים",
  waste: "פסולת", water: "מים", refrigerants: "קרירים", other: "אחר",
};
const SCOPE_COLORS = ["#10b981", "#3b82f6", "#f59e0b"];
const PIE_COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#6b7280"];

function StatCard({ icon: Icon, label, value, sub, color = "text-emerald-400" }: any) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg bg-white/5 ${color}`}><Icon size={20} /></div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </motion.div>
  );
}

function GoalProgress({ goal }: { goal: any }) {
  const progress = goal.target_value > 0 ? Math.min((goal.current_value / goal.target_value) * 100, 100) : 0;
  const statusColor = goal.status === "achieved" ? "bg-emerald-500" : goal.status === "on_track" ? "bg-blue-500" : goal.status === "at_risk" ? "bg-amber-500" : "bg-red-500";
  const statusLabel = { on_track: "במסלול", at_risk: "בסיכון", behind: "בפיגור", achieved: "הושג", cancelled: "בוטל" }[goal.status] || goal.status;
  const cat = CATEGORY_CONFIG[goal.category] || CATEGORY_CONFIG.environmental;
  return (
    <div className="p-4 bg-white/5 rounded-xl border border-white/5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <cat.icon size={14} className={cat.color} />
          <span className="font-medium text-sm">{goal.goal_name}</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded ${statusColor}/20 ${statusColor.replace("bg-", "text-").replace("-500", "-300")}`}>{statusLabel}</span>
      </div>
      <div className="flex items-center gap-3 mb-1">
        <div className="flex-1 h-2.5 bg-muted/30 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${statusColor}`} style={{ width: `${progress}%` }} />
        </div>
        <span className="text-sm font-bold text-white w-12 text-left">{Math.round(progress)}%</span>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>נוכחי: {fmtN(goal.current_value)} {goal.unit}</span>
        <span>יעד: {fmtN(goal.target_value)} {goal.unit}</span>
      </div>
    </div>
  );
}

export default function ESGSustainability() {
  const [tab, setTab] = useState<"dashboard" | "goals" | "carbon" | "metrics">("dashboard");
  const [dashboard, setDashboard] = useState<any>(null);
  const [goals, setGoals] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [carbon, setCarbon] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewGoal, setShowNewGoal] = useState(false);
  const [newGoal, setNewGoal] = useState({ category: "environmental", goal_name: "", target_value: "", current_value: "0", unit: "", target_date: "" });
  const [showNewCarbon, setShowNewCarbon] = useState(false);
  const [newCarbon, setNewCarbon] = useState({ source: "electricity", scope: "2", co2_kg: "", period: "", facility_name: "" });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [dashRes, goalsRes, metricsRes, carbonRes] = await Promise.all([
        authFetch(`${API}/esg/dashboard`, { headers: headers() }).then(r => r.json()).catch(() => null),
        authFetch(`${API}/esg/goals`, { headers: headers() }).then(r => r.json()).catch(() => []),
        authFetch(`${API}/esg/metrics`, { headers: headers() }).then(r => r.json()).catch(() => []),
        authFetch(`${API}/esg/carbon`, { headers: headers() }).then(r => r.json()).catch(() => []),
      ]);
      setDashboard(dashRes);
      setGoals(goalsRes);
      setMetrics(metricsRes);
      setCarbon(carbonRes);
    } catch { }
    setLoading(false);
  }

  async function createGoal() {
    await authFetch(`${API}/esg/goals`, {
      method: "POST", headers: headers(),
      body: JSON.stringify({ ...newGoal, target_value: parseFloat(newGoal.target_value), current_value: parseFloat(newGoal.current_value || "0") })
    });
    setShowNewGoal(false);
    await loadAll();
  }

  async function addCarbon() {
    await authFetch(`${API}/esg/carbon`, {
      method: "POST", headers: headers(),
      body: JSON.stringify({ ...newCarbon, co2_kg: parseFloat(newCarbon.co2_kg) })
    });
    setShowNewCarbon(false);
    await loadAll();
  }

  const d = dashboard;
  const TABS = [
    { key: "dashboard", label: "דשבורד ESG", icon: Globe },
    { key: "goals", label: "יעדים", icon: Target },
    { key: "carbon", label: "טביעת פחמן", icon: Leaf },
    { key: "metrics", label: "מדדים", icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white p-6" dir="rtl">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-600/20 to-green-600/20 border border-emerald-500/30">
              <Globe size={28} className="text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">ESG וקיימות</h1>
              <p className="text-sm text-muted-foreground">ESG & Sustainability Tracker - מדדים, יעדים, טביעת פחמן</p>
            </div>
          </div>
          <button onClick={loadAll} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm">
            <RefreshCw size={14} /> רענון
          </button>
        </div>

        <div className="flex gap-2 mb-6">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${
                tab === t.key ? "bg-emerald-600/20 border border-emerald-500/40 text-emerald-300" : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10"
              }`}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        {loading && <div className="text-center py-20 text-muted-foreground">טוען נתוני ESG...</div>}

        {!loading && tab === "dashboard" && d && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <StatCard icon={Award} label="ציון קיימות" value={d.sustainability_score || 0} color="text-emerald-400" />
              <StatCard icon={Leaf} label='סה"כ CO2 (ק"ג)' value={fmtN(parseFloat(d.carbon?.total_co2 || 0))} sub={`${fmtN(parseFloat(d.carbon?.total_co2 || 0) / 1000)} טון`} color="text-green-400" />
              <StatCard icon={Target} label="יעדים" value={`${d.goals?.achieved || 0}/${d.goals?.total || 0}`} sub={`במסלול: ${d.goals?.on_track || 0}`} color="text-blue-400" />
              <StatCard icon={TrendingDown} label="התקדמות ממוצעת" value={`${d.goals?.avg_progress || 0}%`} color="text-cyan-400" />
              <StatCard icon={Factory} label="מתקנים" value={d.carbon?.facilities || 0} color="text-purple-400" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Carbon by Source Pie */}
              {d.carbon_by_source?.length > 0 && (
                <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
                  <h3 className="font-bold mb-4">פליטות CO2 לפי מקור</h3>
                  <div style={{ height: 280 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={d.carbon_by_source.map((s: any) => ({ name: SOURCE_LABELS[s.source] || s.source, value: parseFloat(s.total_co2) }))}
                          cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                          {d.carbon_by_source.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: "#1a1d23", border: "1px solid #333", borderRadius: 8 }} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Carbon by Scope */}
              <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
                <h3 className="font-bold mb-4">פליטות לפי Scope</h3>
                <div className="space-y-4">
                  {[
                    { scope: "1", label: "Scope 1 - ישירות", value: parseFloat(d.carbon?.scope1 || 0), color: "bg-emerald-500" },
                    { scope: "2", label: "Scope 2 - אנרגיה", value: parseFloat(d.carbon?.scope2 || 0), color: "bg-blue-500" },
                    { scope: "3", label: "Scope 3 - שרשרת ערך", value: parseFloat(d.carbon?.scope3 || 0), color: "bg-amber-500" },
                  ].map(s => {
                    const total = parseFloat(d.carbon?.total_co2 || 1);
                    const pct = total > 0 ? (s.value / total) * 100 : 0;
                    return (
                      <div key={s.scope}>
                        <div className="flex justify-between text-sm mb-1">
                          <span>{s.label}</span>
                          <span className="font-bold">{fmtN(s.value)} ק"ג ({Math.round(pct)}%)</span>
                        </div>
                        <div className="h-3 bg-muted/30 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${s.color}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Carbon Trend */}
            {d.carbon_trend?.length > 0 && (
              <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
                <h3 className="font-bold mb-4">מגמת פליטות חודשית</h3>
                <div style={{ height: 300 }}>
                  <ResponsiveContainer>
                    <AreaChart data={d.carbon_trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="month" stroke="#888" fontSize={12} />
                      <YAxis stroke="#888" tickFormatter={(v: number) => `${Math.round(v / 1000)}t`} />
                      <Tooltip contentStyle={{ background: "#1a1d23", border: "1px solid #333", borderRadius: 8 }} />
                      <Area type="monotone" dataKey="total_co2" stroke="#10b981" fill="#10b98140" name='CO2 (ק"ג)' />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Goals Tab */}
        {!loading && tab === "goals" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold">יעדי ESG ({goals.length})</h3>
              <button onClick={() => setShowNewGoal(!showNewGoal)}
                className="px-4 py-2 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-sm">+ יעד חדש</button>
            </div>
            {showNewGoal && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="bg-[#1a1d23] border border-emerald-500/30 rounded-xl p-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  <select value={newGoal.category} onChange={e => setNewGoal({ ...newGoal, category: e.target.value })}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm">
                    {Object.entries(CATEGORY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <input value={newGoal.goal_name} onChange={e => setNewGoal({ ...newGoal, goal_name: e.target.value })}
                    placeholder="שם היעד" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                  <input value={newGoal.unit} onChange={e => setNewGoal({ ...newGoal, unit: e.target.value })}
                    placeholder="יחידת מידה" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input value={newGoal.target_value} onChange={e => setNewGoal({ ...newGoal, target_value: e.target.value })}
                    placeholder="ערך יעד" type="number" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                  <input value={newGoal.target_date} onChange={e => setNewGoal({ ...newGoal, target_date: e.target.value })}
                    type="date" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                  <button onClick={createGoal} className="bg-emerald-600 rounded-lg text-sm hover:bg-emerald-700">צור יעד</button>
                </div>
              </motion.div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {goals.map(g => <GoalProgress key={g.id} goal={g} />)}
            </div>
            {goals.length === 0 && <div className="text-center py-12 text-muted-foreground">אין יעדים. הוסף יעד ESG ראשון.</div>}
          </div>
        )}

        {/* Carbon Tab */}
        {!loading && tab === "carbon" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold">רשומות טביעת פחמן ({carbon.length})</h3>
              <button onClick={() => setShowNewCarbon(!showNewCarbon)}
                className="px-4 py-2 rounded-lg bg-green-600/20 border border-green-500/40 text-green-300 text-sm">+ רשומה חדשה</button>
            </div>
            {showNewCarbon && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="bg-[#1a1d23] border border-green-500/30 rounded-xl p-5">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <select value={newCarbon.source} onChange={e => setNewCarbon({ ...newCarbon, source: e.target.value })}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm">
                    {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <select value={newCarbon.scope} onChange={e => setNewCarbon({ ...newCarbon, scope: e.target.value })}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm">
                    <option value="1">Scope 1</option>
                    <option value="2">Scope 2</option>
                    <option value="3">Scope 3</option>
                  </select>
                  <input value={newCarbon.co2_kg} onChange={e => setNewCarbon({ ...newCarbon, co2_kg: e.target.value })}
                    placeholder='CO2 ק"ג' type="number" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                  <input value={newCarbon.period} onChange={e => setNewCarbon({ ...newCarbon, period: e.target.value })}
                    type="date" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                  <button onClick={addCarbon} className="bg-green-600 rounded-lg text-sm hover:bg-green-700">הוסף</button>
                </div>
              </motion.div>
            )}
            <div className="overflow-x-auto bg-[#1a1d23] border border-white/10 rounded-xl p-5">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/10 text-muted-foreground">
                  <th className="text-right py-2 px-3">מקור</th>
                  <th className="text-right py-2 px-3">Scope</th>
                  <th className="text-right py-2 px-3">CO2 (ק"ג)</th>
                  <th className="text-right py-2 px-3">תקופה</th>
                  <th className="text-right py-2 px-3">מתקן</th>
                </tr></thead>
                <tbody>
                  {carbon.slice(0, 50).map((c: any) => {
                    const SrcIcon = SOURCE_ICONS[c.source] || Globe;
                    return (
                      <tr key={c.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="py-2 px-3 flex items-center gap-2"><SrcIcon size={14} className="text-emerald-400" /> {SOURCE_LABELS[c.source] || c.source}</td>
                        <td className="py-2 px-3"><span className="px-2 py-0.5 rounded text-xs" style={{ background: SCOPE_COLORS[parseInt(c.scope) - 1] + "30", color: SCOPE_COLORS[parseInt(c.scope) - 1] }}>Scope {c.scope}</span></td>
                        <td className="py-2 px-3 font-medium">{fmtN(parseFloat(c.co2_kg))}</td>
                        <td className="py-2 px-3">{c.period}</td>
                        <td className="py-2 px-3 text-muted-foreground">{c.facility_name || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {carbon.length === 0 && <div className="text-center py-8 text-muted-foreground">אין רשומות פחמן</div>}
            </div>
          </div>
        )}

        {/* Metrics Tab */}
        {!loading && tab === "metrics" && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold">מדדי ESG ({metrics.length})</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {metrics.map((m: any) => {
                const cat = CATEGORY_CONFIG[m.category] || CATEGORY_CONFIG.environmental;
                return (
                  <div key={m.id} className="bg-[#1a1d23] border border-white/10 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <cat.icon size={14} className={cat.color} />
                        <span className="font-medium text-sm">{m.metric_name}</span>
                      </div>
                      {m.verified && <CheckCircle2 size={14} className="text-emerald-400" />}
                    </div>
                    <div className="text-xl font-bold">{fmtN(parseFloat(m.value || 0))} <span className="text-sm font-normal text-muted-foreground">{m.unit}</span></div>
                    <div className="text-xs text-muted-foreground mt-1">{m.data_source || "לא צוין מקור"}</div>
                  </div>
                );
              })}
            </div>
            {metrics.length === 0 && <div className="text-center py-12 text-muted-foreground">אין מדדים. הוסף מדד ESG ראשון.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
