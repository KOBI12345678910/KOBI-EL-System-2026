import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Cpu, Zap, Play, BarChart3, TrendingUp, Clock, Target, RefreshCw,
  Settings2, Award, Activity, ArrowUp, CheckCircle2, XCircle, Plus,
  Gauge, GitBranch, Layers, ChevronDown, Eye
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend
} from "recharts";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || document.cookie.match(/token=([^;]+)/)?.[1] || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });
const fmtN = (n: number) => new Intl.NumberFormat("he-IL").format(Math.round(n));

const PROBLEM_TYPE_LABELS: Record<string, string> = {
  production_scheduling: "תזמון ייצור",
  crew_routing: "ניתוב צוותים",
  inventory_allocation: "הקצאת מלאי",
  cut_optimization: "אופטימיזציית חיתוך",
  price_optimization: "אופטימיזציית מחירים",
  delivery_routing: "ניתוב משלוחים",
  resource_leveling: "איזון משאבים",
  bin_packing: "אריזה אופטימלית",
  job_shop: "Job Shop Scheduling",
  knapsack: "בעיית הגב",
};

const OBJECTIVE_LABELS: Record<string, string> = {
  minimize_cost: "מינימום עלות",
  maximize_throughput: "מקסימום תפוקה",
  minimize_lateness: "מינימום איחורים",
  maximize_utilization: "מקסימום ניצולת",
  minimize_waste: "מינימום פחת",
  maximize_profit: "מקסימום רווח",
  minimize_distance: "מינימום מרחק",
  balance_load: "איזון עומסים",
};

const ALGORITHM_LABELS: Record<string, { label: string; color: string }> = {
  greedy: { label: "Greedy", color: "#10b981" },
  genetic: { label: "Genetic Algorithm", color: "#8b5cf6" },
  simulated_annealing: { label: "Simulated Annealing", color: "#f59e0b" },
  linear_programming: { label: "Linear Programming", color: "#3b82f6" },
  constraint_satisfaction: { label: "Constraint Satisfaction", color: "#ec4899" },
  tabu_search: { label: "Tabu Search", color: "#06b6d4" },
  particle_swarm: { label: "Particle Swarm", color: "#ef4444" },
  ant_colony: { label: "Ant Colony", color: "#84cc16" },
  branch_and_bound: { label: "Branch & Bound", color: "#f97316" },
  random: { label: "Random", color: "#6b7280" },
};

function StatCard({ icon: Icon, label, value, sub, color = "text-blue-400" }: any) {
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

export default function OptimizationLab() {
  const [tab, setTab] = useState<"dashboard" | "problems" | "run" | "compare">("dashboard");
  const [dashboard, setDashboard] = useState<any>(null);
  const [problems, setProblems] = useState<any[]>([]);
  const [selectedProblem, setSelectedProblem] = useState<any>(null);
  const [runResult, setRunResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [showNewProblem, setShowNewProblem] = useState(false);
  const [newProblem, setNewProblem] = useState({ name: "", problem_type: "production_scheduling", objective: "minimize_cost" });
  const [selectedAlgorithm, setSelectedAlgorithm] = useState("genetic");
  const [compareRuns, setCompareRuns] = useState<any>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [dashRes, probsRes] = await Promise.all([
        authFetch(`${API}/optimization/dashboard`, { headers: headers() }).then(r => r.json()).catch(() => null),
        authFetch(`${API}/optimization/problems`, { headers: headers() }).then(r => r.json()).catch(() => []),
      ]);
      setDashboard(dashRes);
      setProblems(probsRes);
    } catch { }
    setLoading(false);
  }

  async function createProblem() {
    await authFetch(`${API}/optimization/problems`, {
      method: "POST", headers: headers(), body: JSON.stringify(newProblem)
    });
    setShowNewProblem(false);
    setNewProblem({ name: "", problem_type: "production_scheduling", objective: "minimize_cost" });
    await loadAll();
  }

  async function viewProblem(id: number) {
    const res = await authFetch(`${API}/optimization/problems/${id}`, { headers: headers() }).then(r => r.json());
    setSelectedProblem(res);
    setRunResult(null);
  }

  async function runOptimization(problemId: number) {
    setRunning(true);
    try {
      const res = await authFetch(`${API}/optimization/run/${problemId}`, {
        method: "POST", headers: headers(),
        body: JSON.stringify({ algorithm: selectedAlgorithm, config: { max_iterations: 500 } })
      }).then(r => r.json());
      setRunResult(res);
      await viewProblem(problemId);
      await loadAll();
    } catch { }
    setRunning(false);
  }

  async function compareSelectedRuns(runIds: number[]) {
    try {
      const res = await authFetch(`${API}/optimization/compare`, {
        method: "POST", headers: headers(), body: JSON.stringify({ run_ids: runIds })
      }).then(r => r.json());
      setCompareRuns(res);
    } catch { }
  }

  const d = dashboard;
  const TABS = [
    { key: "dashboard", label: "דשבורד", icon: BarChart3 },
    { key: "problems", label: "בעיות", icon: Cpu },
    { key: "run", label: "הרצה", icon: Play },
    { key: "compare", label: "השוואה", icon: GitBranch },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white p-6" dir="rtl">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-orange-600/20 to-red-600/20 border border-orange-500/30">
              <Cpu size={28} className="text-orange-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">מעבדת אופטימיזציה</h1>
              <p className="text-sm text-muted-foreground">Advanced Optimization Laboratory - אלגוריתמים, פתרונות, השוואות</p>
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
                tab === t.key ? "bg-orange-600/20 border border-orange-500/40 text-orange-300" : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10"
              }`}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        {loading && <div className="text-center py-20 text-muted-foreground">טוען...</div>}

        {/* Dashboard */}
        {!loading && tab === "dashboard" && d && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={Cpu} label="בעיות" value={d.problems?.total || 0} sub={`הושלמו: ${d.problems?.completed || 0}`} color="text-orange-400" />
              <StatCard icon={Play} label="הרצות" value={d.runs?.total || 0} sub={`הושלמו: ${d.runs?.completed || 0}`} color="text-blue-400" />
              <StatCard icon={TrendingUp} label="שיפור ממוצע" value={`${Math.round(parseFloat(d.runs?.avg_improvement || 0) * 10) / 10}%`} color="text-emerald-400" />
              <StatCard icon={Award} label="שיפור שיא" value={`${Math.round(parseFloat(d.runs?.best_improvement || 0) * 10) / 10}%`} color="text-purple-400" />
            </div>

            {/* By Algorithm */}
            {d.by_algorithm?.length > 0 && (
              <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
                <h3 className="font-bold mb-4">ביצועים לפי אלגוריתם</h3>
                <div style={{ height: 300 }}>
                  <ResponsiveContainer>
                    <BarChart data={d.by_algorithm.map((a: any) => ({
                      name: ALGORITHM_LABELS[a.algorithm]?.label || a.algorithm,
                      improvement: Math.round(parseFloat(a.avg_improvement || 0) * 10) / 10,
                      runs: parseInt(a.runs),
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="name" stroke="#888" fontSize={11} />
                      <YAxis stroke="#888" />
                      <Tooltip contentStyle={{ background: "#1a1d23", border: "1px solid #333", borderRadius: 8 }} />
                      <Bar dataKey="improvement" fill="#f97316" radius={[4, 4, 0, 0]} name="שיפור (%)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* By Problem Type */}
            {d.by_type?.length > 0 && (
              <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
                <h3 className="font-bold mb-4">בעיות לפי סוג</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {d.by_type.map((t: any) => (
                    <div key={t.problem_type} className="p-3 bg-white/5 rounded-lg text-center">
                      <div className="text-lg font-bold">{t.count}</div>
                      <div className="text-xs text-muted-foreground">{PROBLEM_TYPE_LABELS[t.problem_type] || t.problem_type}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Runs */}
            {d.recent_runs?.length > 0 && (
              <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
                <h3 className="font-bold mb-4">הרצות אחרונות</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-white/10 text-muted-foreground">
                      <th className="text-right py-2 px-3">בעיה</th>
                      <th className="text-right py-2 px-3">סוג</th>
                      <th className="text-right py-2 px-3">אלגוריתם</th>
                      <th className="text-right py-2 px-3">ניקוד</th>
                      <th className="text-right py-2 px-3">שיפור</th>
                      <th className="text-right py-2 px-3">זמן ריצה</th>
                      <th className="text-right py-2 px-3">סטטוס</th>
                    </tr></thead>
                    <tbody>
                      {d.recent_runs.map((r: any) => (
                        <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                          <td className="py-2 px-3 font-medium">{r.problem_name}</td>
                          <td className="py-2 px-3 text-xs">{PROBLEM_TYPE_LABELS[r.problem_type] || r.problem_type}</td>
                          <td className="py-2 px-3"><span className="text-xs px-2 py-0.5 rounded" style={{ background: (ALGORITHM_LABELS[r.algorithm]?.color || "#666") + "30", color: ALGORITHM_LABELS[r.algorithm]?.color || "#aaa" }}>{ALGORITHM_LABELS[r.algorithm]?.label || r.algorithm}</span></td>
                          <td className="py-2 px-3">{fmtN(parseFloat(r.best_score || 0))}</td>
                          <td className="py-2 px-3">
                            <span className={`flex items-center gap-1 ${r.improvement_pct > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                              {r.improvement_pct > 0 && <ArrowUp size={12} />}{Math.round(r.improvement_pct * 10) / 10}%
                            </span>
                          </td>
                          <td className="py-2 px-3">{r.runtime_ms}ms</td>
                          <td className="py-2 px-3">
                            <span className={`text-xs px-2 py-0.5 rounded ${r.status === "completed" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
                              {r.status === "completed" ? "הושלם" : r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Problems Tab */}
        {!loading && tab === "problems" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold">בעיות אופטימיזציה ({problems.length})</h3>
              <button onClick={() => setShowNewProblem(!showNewProblem)}
                className="px-4 py-2 rounded-lg bg-orange-600/20 border border-orange-500/40 text-orange-300 text-sm">+ בעיה חדשה</button>
            </div>
            {showNewProblem && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="bg-[#1a1d23] border border-orange-500/30 rounded-xl p-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input value={newProblem.name} onChange={e => setNewProblem({ ...newProblem, name: e.target.value })}
                    placeholder="שם הבעיה" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                  <select value={newProblem.problem_type} onChange={e => setNewProblem({ ...newProblem, problem_type: e.target.value })}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm">
                    {Object.entries(PROBLEM_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <select value={newProblem.objective} onChange={e => setNewProblem({ ...newProblem, objective: e.target.value })}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm">
                    {Object.entries(OBJECTIVE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <button onClick={createProblem} className="mt-3 px-4 py-2 bg-orange-600 rounded-lg text-sm hover:bg-orange-700">צור בעיה</button>
              </motion.div>
            )}
            <div className="space-y-3">
              {problems.map(p => (
                <div key={p.id} className="bg-[#1a1d23] border border-white/10 rounded-xl p-4 flex items-center justify-between hover:border-orange-500/30 transition-all cursor-pointer"
                  onClick={() => { viewProblem(p.id); setTab("run"); }}>
                  <div>
                    <div className="font-medium">{p.name || p.problem_number}</div>
                    <div className="text-xs text-muted-foreground">{PROBLEM_TYPE_LABELS[p.problem_type]} | {OBJECTIVE_LABELS[p.objective]} | {p.total_runs || 0} הרצות</div>
                  </div>
                  <div className="flex items-center gap-3">
                    {p.best_score && <span className="text-sm font-bold text-emerald-400">ניקוד: {fmtN(parseFloat(p.best_score))}</span>}
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      p.status === "completed" ? "bg-emerald-500/20 text-emerald-300" :
                      p.status === "running" ? "bg-blue-500/20 text-blue-300" :
                      "bg-gray-500/20 text-gray-300"
                    }`}>{p.status === "completed" ? "הושלם" : p.status === "running" ? "רץ" : "טיוטה"}</span>
                  </div>
                </div>
              ))}
              {problems.length === 0 && <div className="text-center py-12 text-muted-foreground">אין בעיות. צור בעיית אופטימיזציה ראשונה.</div>}
            </div>
          </div>
        )}

        {/* Run Tab */}
        {!loading && tab === "run" && (
          <div className="space-y-6">
            {!selectedProblem && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold">בחר בעיה להרצה</h3>
                {problems.map(p => (
                  <div key={p.id} className="bg-[#1a1d23] border border-white/10 rounded-xl p-4 cursor-pointer hover:border-orange-500/30 transition-all"
                    onClick={() => viewProblem(p.id)}>
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground mr-3">{PROBLEM_TYPE_LABELS[p.problem_type]}</span>
                  </div>
                ))}
              </div>
            )}

            {selectedProblem && (
              <>
                <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
                  <h3 className="font-bold mb-3">{selectedProblem.name}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div><span className="text-muted-foreground">סוג:</span> {PROBLEM_TYPE_LABELS[selectedProblem.problem_type]}</div>
                    <div><span className="text-muted-foreground">יעד:</span> {OBJECTIVE_LABELS[selectedProblem.objective]}</div>
                    <div><span className="text-muted-foreground">הרצות:</span> {selectedProblem.runs?.length || 0}</div>
                    <div><span className="text-muted-foreground">ניקוד הטוב ביותר:</span> {selectedProblem.best_score ? fmtN(parseFloat(selectedProblem.best_score)) : "N/A"}</div>
                  </div>
                </div>

                {/* Run Controls */}
                <div className="bg-[#1a1d23] border border-orange-500/20 rounded-xl p-5">
                  <h3 className="font-bold mb-4">הרצת אופטימיזציה</h3>
                  <div className="flex items-center gap-4">
                    <select value={selectedAlgorithm} onChange={e => setSelectedAlgorithm(e.target.value)}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm flex-1">
                      {Object.entries(ALGORITHM_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <button onClick={() => runOptimization(selectedProblem.id)} disabled={running}
                      className="px-6 py-2 bg-orange-600 rounded-lg text-sm hover:bg-orange-700 flex items-center gap-2 disabled:opacity-50">
                      {running ? <><RefreshCw size={14} className="animate-spin" /> מחשב...</> : <><Play size={14} /> הרץ</>}
                    </button>
                  </div>
                </div>

                {/* Run Result */}
                {runResult && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <StatCard icon={Target} label="ניקוד" value={fmtN(parseFloat(runResult.run?.best_score || 0))} color="text-orange-400" />
                      <StatCard icon={TrendingUp} label="שיפור" value={`${runResult.run?.improvement_pct || 0}%`} color="text-emerald-400" />
                      <StatCard icon={Clock} label="זמן ריצה" value={`${runResult.run?.runtime_ms || 0}ms`} color="text-blue-400" />
                      <StatCard icon={checkFeasible(runResult.result?.feasible)} label="כשירות" value={runResult.result?.feasible ? "כשיר" : "לא כשיר"} color={runResult.result?.feasible ? "text-emerald-400" : "text-red-400"} />
                    </div>

                    {/* Convergence Chart */}
                    {runResult.run?.convergence_history?.length > 0 && (
                      <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
                        <h3 className="font-bold mb-4">גרף התכנסות</h3>
                        <div style={{ height: 300 }}>
                          <ResponsiveContainer>
                            <LineChart data={runResult.run.convergence_history}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                              <XAxis dataKey="iteration" stroke="#888" fontSize={12} />
                              <YAxis stroke="#888" />
                              <Tooltip contentStyle={{ background: "#1a1d23", border: "1px solid #333", borderRadius: 8 }} />
                              <Line type="monotone" dataKey="score" stroke="#f97316" strokeWidth={2} dot={false} name="ניקוד" />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Previous Runs */}
                {selectedProblem.runs?.length > 0 && (
                  <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold">הרצות קודמות ({selectedProblem.runs.length})</h3>
                      {selectedProblem.runs.length >= 2 && (
                        <button onClick={() => { compareSelectedRuns(selectedProblem.runs.slice(0, 5).map((r: any) => r.id)); setTab("compare"); }}
                          className="px-3 py-1.5 rounded-lg bg-blue-600/20 text-blue-300 text-xs hover:bg-blue-600/30 flex items-center gap-1">
                          <GitBranch size={12} /> השווה
                        </button>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b border-white/10 text-muted-foreground">
                          <th className="text-right py-2 px-3">אלגוריתם</th>
                          <th className="text-right py-2 px-3">ניקוד</th>
                          <th className="text-right py-2 px-3">שיפור</th>
                          <th className="text-right py-2 px-3">איטרציות</th>
                          <th className="text-right py-2 px-3">זמן</th>
                        </tr></thead>
                        <tbody>
                          {selectedProblem.runs.map((r: any) => (
                            <tr key={r.id} className="border-b border-white/5">
                              <td className="py-2 px-3"><span className="text-xs px-2 py-0.5 rounded" style={{ background: (ALGORITHM_LABELS[r.algorithm]?.color || "#666") + "30", color: ALGORITHM_LABELS[r.algorithm]?.color || "#aaa" }}>{ALGORITHM_LABELS[r.algorithm]?.label || r.algorithm}</span></td>
                              <td className="py-2 px-3 font-medium">{fmtN(parseFloat(r.best_score || 0))}</td>
                              <td className="py-2 px-3 text-emerald-400">{Math.round(r.improvement_pct * 10) / 10}%</td>
                              <td className="py-2 px-3">{r.iterations}</td>
                              <td className="py-2 px-3">{r.runtime_ms}ms</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Compare Tab */}
        {!loading && tab === "compare" && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold">השוואת הרצות</h3>
            {compareRuns ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <StatCard icon={Award} label="הרצה מנצחת" value={ALGORITHM_LABELS[compareRuns.best?.algorithm]?.label || compareRuns.best?.algorithm} sub={`ניקוד: ${fmtN(parseFloat(compareRuns.best?.score || 0))}`} color="text-emerald-400" />
                  <StatCard icon={Activity} label="פער ניקודים" value={fmtN(compareRuns.spread || 0)} color="text-orange-400" />
                  <StatCard icon={Clock} label="זמן ריצה ממוצע" value={`${Math.round(compareRuns.avg_runtime || 0)}ms`} color="text-blue-400" />
                </div>
                <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
                  <h3 className="font-bold mb-4">השוואה</h3>
                  <div style={{ height: 300 }}>
                    <ResponsiveContainer>
                      <BarChart data={compareRuns.runs?.map((r: any) => ({
                        name: ALGORITHM_LABELS[r.algorithm]?.label || r.algorithm,
                        score: parseFloat(r.best_score || 0),
                        improvement: r.improvement_pct,
                        runtime: r.runtime_ms,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="name" stroke="#888" fontSize={11} />
                        <YAxis stroke="#888" />
                        <Tooltip contentStyle={{ background: "#1a1d23", border: "1px solid #333", borderRadius: 8 }} />
                        <Bar dataKey="improvement" name="שיפור (%)" radius={[4, 4, 0, 0]}>
                          {compareRuns.runs?.map((_: any, i: number) => (
                            <Cell key={i} fill={Object.values(ALGORITHM_LABELS)[i % Object.values(ALGORITHM_LABELS).length].color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
                  <h3 className="font-bold mb-4">פירוט</h3>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-white/10 text-muted-foreground">
                      <th className="text-right py-2 px-3">אלגוריתם</th>
                      <th className="text-right py-2 px-3">ניקוד התחלתי</th>
                      <th className="text-right py-2 px-3">ניקוד סופי</th>
                      <th className="text-right py-2 px-3">שיפור</th>
                      <th className="text-right py-2 px-3">זמן ריצה</th>
                      <th className="text-right py-2 px-3">איטרציות</th>
                    </tr></thead>
                    <tbody>
                      {compareRuns.runs?.map((r: any) => (
                        <tr key={r.run_id} className="border-b border-white/5">
                          <td className="py-2 px-3"><span className="text-xs px-2 py-0.5 rounded" style={{ background: (ALGORITHM_LABELS[r.algorithm]?.color || "#666") + "30", color: ALGORITHM_LABELS[r.algorithm]?.color || "#aaa" }}>{ALGORITHM_LABELS[r.algorithm]?.label || r.algorithm}</span></td>
                          <td className="py-2 px-3">{fmtN(parseFloat(r.initial_score || 0))}</td>
                          <td className="py-2 px-3 font-bold">{fmtN(parseFloat(r.best_score || 0))}</td>
                          <td className="py-2 px-3 text-emerald-400">{Math.round(r.improvement_pct * 10) / 10}%</td>
                          <td className="py-2 px-3">{r.runtime_ms}ms</td>
                          <td className="py-2 px-3">{r.iterations}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                בחר בעיה מלשונית "הרצה", הרץ מספר אלגוריתמים ולחץ "השווה"
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function checkFeasible(f: boolean) { return f ? CheckCircle2 : XCircle; }
