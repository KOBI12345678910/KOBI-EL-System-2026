import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Brain, TrendingUp, AlertTriangle, Target, BarChart3, Activity,
  Zap, Clock, CheckCircle2, XCircle, Play, RefreshCw, ThumbsUp,
  ThumbsDown, DollarSign, Users, Package, Truck, ArrowUp, ArrowDown,
  Gauge, Eye, ChevronDown, ChevronRight
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend
} from "recharts";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || document.cookie.match(/token=([^;]+)/)?.[1] || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });
const fmtN = (n: number) => new Intl.NumberFormat("he-IL").format(Math.round(n));
const fmtP = (n: number) => `${Math.round(n * 10) / 10}%`;

const MODEL_TYPE_LABELS: Record<string, { label: string; icon: typeof Brain; color: string }> = {
  demand_forecast: { label: "חיזוי ביקוש", icon: Package, color: "text-blue-400" },
  churn_risk: { label: "סיכון נטישה", icon: Users, color: "text-red-400" },
  price_optimization: { label: "אופטימיזציית מחירים", icon: DollarSign, color: "text-emerald-400" },
  delivery_delay: { label: "עיכוב משלוחים", icon: Truck, color: "text-orange-400" },
  quality_defect: { label: "ליקויי איכות", icon: AlertTriangle, color: "text-yellow-400" },
  cashflow_forecast: { label: "חיזוי תזרים", icon: TrendingUp, color: "text-cyan-400" },
  lead_scoring: { label: "ניקוד לידים", icon: Target, color: "text-purple-400" },
  supplier_risk: { label: "סיכון ספקים", icon: Zap, color: "text-pink-400" },
};

function AccuracyGauge({ value }: { value: number }) {
  const color = value >= 85 ? "text-emerald-400" : value >= 70 ? "text-amber-400" : "text-red-400";
  const bg = value >= 85 ? "bg-emerald-500" : value >= 70 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-muted/30 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${bg}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className={`text-sm font-bold ${color}`}>{fmtP(value)}</span>
    </div>
  );
}

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

export default function PredictiveAnalyticsEngine() {
  const [tab, setTab] = useState<"dashboard" | "models" | "demand" | "churn" | "cashflow">("dashboard");
  const [dashboard, setDashboard] = useState<any>(null);
  const [models, setModels] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [accuracyReport, setAccuracyReport] = useState<any[]>([]);
  const [demandForecast, setDemandForecast] = useState<any>(null);
  const [churnResult, setChurnResult] = useState<any>(null);
  const [cashflowResult, setCashflowResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [runningModel, setRunningModel] = useState<number | null>(null);
  const [showNewModel, setShowNewModel] = useState(false);
  const [newModel, setNewModel] = useState({ name: "", model_type: "demand_forecast", target_entity: "" });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [dashRes, modelsRes, resultsRes, accuracyRes] = await Promise.all([
        authFetch(`${API}/predictions/dashboard`, { headers: headers() }).then(r => r.json()).catch(() => null),
        authFetch(`${API}/predictions/models`, { headers: headers() }).then(r => r.json()).catch(() => []),
        authFetch(`${API}/predictions/results`, { headers: headers() }).then(r => r.json()).catch(() => []),
        authFetch(`${API}/predictions/accuracy-report`, { headers: headers() }).then(r => r.json()).catch(() => []),
      ]);
      setDashboard(dashRes);
      setModels(modelsRes);
      setResults(resultsRes);
      setAccuracyReport(accuracyRes);
    } catch { }
    setLoading(false);
  }

  async function runModel(modelId: number) {
    setRunningModel(modelId);
    try {
      await authFetch(`${API}/predictions/run/${modelId}`, {
        method: "POST", headers: headers(), body: JSON.stringify({ entity_count: 10 })
      });
      await loadAll();
    } catch { }
    setRunningModel(null);
  }

  async function createModel() {
    try {
      await authFetch(`${API}/predictions/models`, {
        method: "POST", headers: headers(), body: JSON.stringify(newModel)
      });
      setShowNewModel(false);
      setNewModel({ name: "", model_type: "demand_forecast", target_entity: "" });
      await loadAll();
    } catch { }
  }

  async function sendFeedback(predId: number, status: string) {
    try {
      await authFetch(`${API}/predictions/${predId}/feedback`, {
        method: "POST", headers: headers(), body: JSON.stringify({ feedback_status: status })
      });
      await loadAll();
    } catch { }
  }

  async function runDemandForecast() {
    try {
      const res = await authFetch(`${API}/predictions/demand-forecast`, {
        method: "POST", headers: headers(), body: JSON.stringify({ horizon_days: 30 })
      }).then(r => r.json());
      setDemandForecast(res);
    } catch { }
  }

  async function runChurnRisk() {
    try {
      const res = await authFetch(`${API}/predictions/churn-risk`, {
        method: "POST", headers: headers(), body: JSON.stringify({})
      }).then(r => r.json());
      setChurnResult(res);
    } catch { }
  }

  async function runCashflow() {
    try {
      const res = await authFetch(`${API}/predictions/cashflow-forecast`, {
        method: "POST", headers: headers(), body: JSON.stringify({ days_ahead: 60 })
      }).then(r => r.json());
      setCashflowResult(res);
    } catch { }
  }

  const TABS = [
    { key: "dashboard", label: "דשבורד", icon: BarChart3 },
    { key: "models", label: "מודלים", icon: Brain },
    { key: "demand", label: "חיזוי ביקוש", icon: Package },
    { key: "churn", label: "סיכון נטישה", icon: Users },
    { key: "cashflow", label: "תזרים מזומנים", icon: DollarSign },
  ];

  const d = dashboard;

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white p-6" dir="rtl">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-purple-600/20 to-blue-600/20 border border-purple-500/30">
              <Brain size={28} className="text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">מנוע אנליטיקה חזויה</h1>
              <p className="text-sm text-muted-foreground">Predictive Analytics Engine - AI/ML מתקדם</p>
            </div>
          </div>
          <button onClick={loadAll} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm">
            <RefreshCw size={14} /> רענון
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-all ${
                tab === t.key ? "bg-purple-600/20 border border-purple-500/40 text-purple-300" : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10"
              }`}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        {loading && <div className="text-center py-20 text-muted-foreground">טוען נתוני אנליטיקה...</div>}

        {!loading && tab === "dashboard" && d && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={Brain} label="מודלים פעילים" value={d.models?.active || 0} sub={`מתוך ${d.models?.total || 0}`} color="text-purple-400" />
              <StatCard icon={Gauge} label="דיוק ממוצע" value={fmtP(parseFloat(d.models?.avg_accuracy || 0))} color="text-emerald-400" />
              <StatCard icon={Activity} label="חיזויים היום" value={d.results?.today || 0} sub={`סה״כ ${fmtN(parseInt(d.results?.total || 0))}`} color="text-blue-400" />
              <StatCard icon={CheckCircle2} label="חיזויים מאומתים" value={d.results?.confirmed || 0} sub={`שגויים: ${d.results?.incorrect || 0}`} color="text-cyan-400" />
            </div>

            {/* By Model Type */}
            {d.by_type?.length > 0 && (
              <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
                <h3 className="text-lg font-bold mb-4">חיזויים לפי סוג מודל</h3>
                <div style={{ height: 300 }}>
                  <ResponsiveContainer>
                    <BarChart data={d.by_type.map((t: any) => ({
                      name: MODEL_TYPE_LABELS[t.model_type]?.label || t.model_type,
                      predictions: parseInt(t.predictions || 0),
                      confidence: Math.round(parseFloat(t.avg_confidence || 0) * 10) / 10,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="name" stroke="#888" fontSize={12} />
                      <YAxis stroke="#888" />
                      <Tooltip contentStyle={{ background: "#1a1d23", border: "1px solid #333", borderRadius: 8 }} />
                      <Bar dataKey="predictions" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="חיזויים" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Recent Results */}
            {d.recent?.length > 0 && (
              <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
                <h3 className="text-lg font-bold mb-4">חיזויים אחרונים</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-white/10 text-muted-foreground">
                      <th className="text-right py-2 px-3">מודל</th>
                      <th className="text-right py-2 px-3">סוג</th>
                      <th className="text-right py-2 px-3">ערך חזוי</th>
                      <th className="text-right py-2 px-3">ביטחון</th>
                      <th className="text-right py-2 px-3">סטטוס</th>
                    </tr></thead>
                    <tbody>
                      {d.recent.map((r: any) => (
                        <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                          <td className="py-2 px-3 font-medium">{r.model_name}</td>
                          <td className="py-2 px-3">{MODEL_TYPE_LABELS[r.model_type]?.label || r.model_type}</td>
                          <td className="py-2 px-3">{fmtN(parseFloat(r.predicted_value || 0))}</td>
                          <td className="py-2 px-3"><AccuracyGauge value={r.confidence || 0} /></td>
                          <td className="py-2 px-3">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              r.feedback_status === "confirmed" ? "bg-emerald-500/20 text-emerald-300" :
                              r.feedback_status === "incorrect" ? "bg-red-500/20 text-red-300" :
                              "bg-amber-500/20 text-amber-300"
                            }`}>{r.feedback_status === "confirmed" ? "מאומת" : r.feedback_status === "incorrect" ? "שגוי" : "ממתין"}</span>
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

        {/* Models Tab */}
        {!loading && tab === "models" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold">מודלי חיזוי ({models.length})</h3>
              <button onClick={() => setShowNewModel(!showNewModel)}
                className="px-4 py-2 rounded-lg bg-purple-600/20 border border-purple-500/40 text-purple-300 text-sm hover:bg-purple-600/30">
                + מודל חדש
              </button>
            </div>

            {showNewModel && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                className="bg-[#1a1d23] border border-purple-500/30 rounded-xl p-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input value={newModel.name} onChange={e => setNewModel({ ...newModel, name: e.target.value })}
                    placeholder="שם המודל" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                  <select value={newModel.model_type} onChange={e => setNewModel({ ...newModel, model_type: e.target.value })}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm">
                    {Object.entries(MODEL_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <input value={newModel.target_entity} onChange={e => setNewModel({ ...newModel, target_entity: e.target.value })}
                    placeholder="ישות יעד" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                </div>
                <button onClick={createModel} className="mt-3 px-4 py-2 bg-purple-600 rounded-lg text-sm hover:bg-purple-700">צור מודל</button>
              </motion.div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {models.map((m: any) => {
                const cfg = MODEL_TYPE_LABELS[m.model_type] || { label: m.model_type, icon: Brain, color: "text-gray-400" };
                const Icon = cfg.icon;
                return (
                  <motion.div key={m.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="bg-[#1a1d23] border border-white/10 rounded-xl p-5 hover:border-white/20 transition-all">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Icon size={18} className={cfg.color} />
                        <span className="font-medium">{m.name}</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        m.status === "active" ? "bg-emerald-500/20 text-emerald-300" :
                        m.status === "training" ? "bg-amber-500/20 text-amber-300" :
                        "bg-gray-500/20 text-gray-300"
                      }`}>{m.status === "active" ? "פעיל" : m.status === "training" ? "באימון" : "מוצא משימוש"}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mb-2">{cfg.label}</div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-muted-foreground">דיוק:</span>
                      <AccuracyGauge value={m.accuracy_score || 0} />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                      <span>חיזויים: {m.total_predictions || 0}</span>
                      <span>מאומתים: {m.confirmed_predictions || 0}</span>
                    </div>
                    <button onClick={() => runModel(m.id)} disabled={runningModel === m.id}
                      className="w-full py-2 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-300 text-sm hover:bg-purple-600/30 flex items-center justify-center gap-2 disabled:opacity-50">
                      {runningModel === m.id ? <><RefreshCw size={14} className="animate-spin" /> מריץ...</> : <><Play size={14} /> הרץ חיזוי</>}
                    </button>
                  </motion.div>
                );
              })}
            </div>

            {/* Accuracy Report */}
            {accuracyReport.length > 0 && (
              <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
                <h3 className="text-lg font-bold mb-4">דוח דיוק מודלים</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-white/10 text-muted-foreground">
                      <th className="text-right py-2 px-3">מודל</th>
                      <th className="text-right py-2 px-3">סוג</th>
                      <th className="text-right py-2 px-3">דיוק ML</th>
                      <th className="text-right py-2 px-3">דיוק מאומת</th>
                      <th className="text-right py-2 px-3">ביטחון ממוצע</th>
                      <th className="text-right py-2 px-3">סה״כ</th>
                      <th className="text-right py-2 px-3">מאומת</th>
                      <th className="text-right py-2 px-3">שגוי</th>
                    </tr></thead>
                    <tbody>
                      {accuracyReport.map((r: any) => (
                        <tr key={r.id} className="border-b border-white/5">
                          <td className="py-2 px-3 font-medium">{r.name}</td>
                          <td className="py-2 px-3">{MODEL_TYPE_LABELS[r.model_type]?.label || r.model_type}</td>
                          <td className="py-2 px-3"><AccuracyGauge value={r.accuracy_score || 0} /></td>
                          <td className="py-2 px-3"><AccuracyGauge value={parseFloat(r.verified_accuracy || 0)} /></td>
                          <td className="py-2 px-3">{fmtP(parseFloat(r.avg_confidence || 0))}</td>
                          <td className="py-2 px-3">{r.total_predictions}</td>
                          <td className="py-2 px-3 text-emerald-400">{r.confirmed}</td>
                          <td className="py-2 px-3 text-red-400">{r.incorrect}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Results with Feedback */}
            {results.length > 0 && (
              <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
                <h3 className="text-lg font-bold mb-4">תוצאות חיזוי אחרונות</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {results.slice(0, 20).map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{r.model_name} - {r.entity_id}</div>
                        <div className="text-xs text-muted-foreground">ערך: {fmtN(parseFloat(r.predicted_value || 0))} | ביטחון: {fmtP(r.confidence || 0)}</div>
                      </div>
                      {r.feedback_status === "pending" && (
                        <div className="flex gap-2">
                          <button onClick={() => sendFeedback(r.id, "confirmed")} className="p-1.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"><ThumbsUp size={14} /></button>
                          <button onClick={() => sendFeedback(r.id, "incorrect")} className="p-1.5 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30"><ThumbsDown size={14} /></button>
                        </div>
                      )}
                      {r.feedback_status !== "pending" && (
                        <span className={`text-xs px-2 py-1 rounded ${r.feedback_status === "confirmed" ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
                          {r.feedback_status === "confirmed" ? "מאומת" : "שגוי"}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Demand Forecast Tab */}
        {!loading && tab === "demand" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">חיזוי ביקוש - 30 יום קדימה</h3>
              <button onClick={runDemandForecast}
                className="px-4 py-2 rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-300 text-sm hover:bg-blue-600/30 flex items-center gap-2">
                <Play size={14} /> הרץ חיזוי
              </button>
            </div>
            {demandForecast && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <StatCard icon={Package} label="ביקוש יומי ממוצע" value={fmtN(demandForecast.summary.avg_daily_demand)} color="text-blue-400" />
                  <StatCard icon={TrendingUp} label="ביקוש כולל" value={fmtN(demandForecast.summary.total_demand)} color="text-emerald-400" />
                  <StatCard icon={ArrowUp} label="יום שיא" value={demandForecast.summary.peak_day?.date} sub={`ביקוש: ${fmtN(demandForecast.summary.peak_day?.predicted_demand)}`} color="text-purple-400" />
                  <StatCard icon={Gauge} label="ביטחון ממוצע" value={fmtP(demandForecast.summary.avg_confidence)} color="text-cyan-400" />
                </div>
                <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
                  <h3 className="font-bold mb-4">גרף חיזוי ביקוש</h3>
                  <div style={{ height: 350 }}>
                    <ResponsiveContainer>
                      <AreaChart data={demandForecast.forecasts}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="date" stroke="#888" fontSize={10} tickFormatter={(v: string) => v.slice(5)} />
                        <YAxis stroke="#888" />
                        <Tooltip contentStyle={{ background: "#1a1d23", border: "1px solid #333", borderRadius: 8 }} />
                        <Area type="monotone" dataKey="upper_bound" stroke="transparent" fill="#3b82f620" name="גבול עליון" />
                        <Area type="monotone" dataKey="predicted_demand" stroke="#3b82f6" fill="#3b82f640" strokeWidth={2} name="ביקוש חזוי" />
                        <Area type="monotone" dataKey="lower_bound" stroke="transparent" fill="#3b82f610" name="גבול תחתון" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}
            {!demandForecast && <div className="text-center py-20 text-muted-foreground">לחץ "הרץ חיזוי" ליצירת תחזית ביקוש</div>}
          </div>
        )}

        {/* Churn Risk Tab */}
        {!loading && tab === "churn" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">ניתוח סיכון נטישה</h3>
              <button onClick={runChurnRisk}
                className="px-4 py-2 rounded-lg bg-red-600/20 border border-red-500/40 text-red-300 text-sm hover:bg-red-600/30 flex items-center gap-2">
                <Play size={14} /> בדוק סיכון
              </button>
            </div>
            {churnResult && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <StatCard icon={AlertTriangle} label="הסתברות נטישה"
                    value={fmtP(churnResult.churn_probability)}
                    sub={`רמת סיכון: ${churnResult.risk_level}`}
                    color={churnResult.churn_probability >= 60 ? "text-red-400" : "text-amber-400"} />
                  <StatCard icon={DollarSign} label="הכנסה בסיכון" value={`${fmtN(churnResult.estimated_revenue_at_risk)} ILS`} color="text-orange-400" />
                  <StatCard icon={Target} label="עלות שימור משוערת" value={`${fmtN(churnResult.retention_cost_estimate)} ILS`} color="text-cyan-400" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
                    <h3 className="font-bold mb-4">גורמי סיכון</h3>
                    <div className="space-y-3">
                      {churnResult.factors?.map((f: any, i: number) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-sm">{f.factor}</span>
                          <div className="flex items-center gap-2 w-32">
                            <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                              <div className="h-full bg-red-500 rounded-full" style={{ width: `${f.impact}%` }} />
                            </div>
                            <span className="text-xs text-red-400 w-8 text-left">{f.impact}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
                    <h3 className="font-bold mb-4">המלצות שימור</h3>
                    <div className="space-y-2">
                      {churnResult.recommendations?.map((r: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 p-2 bg-white/5 rounded-lg">
                          <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                          <span className="text-sm">{r}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
            {!churnResult && <div className="text-center py-20 text-muted-foreground">לחץ "בדוק סיכון" לניתוח נטישה</div>}
          </div>
        )}

        {/* Cashflow Tab */}
        {!loading && tab === "cashflow" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">חיזוי תזרים מזומנים - 60 יום</h3>
              <button onClick={runCashflow}
                className="px-4 py-2 rounded-lg bg-cyan-600/20 border border-cyan-500/40 text-cyan-300 text-sm hover:bg-cyan-600/30 flex items-center gap-2">
                <Play size={14} /> הרץ תחזית
              </button>
            </div>
            {cashflowResult && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <StatCard icon={DollarSign} label="יתרה התחלתית" value={`${fmtN(cashflowResult.starting_balance)} ILS`} color="text-blue-400" />
                  <StatCard icon={TrendingUp} label="יתרה סופית" value={`${fmtN(cashflowResult.ending_balance)} ILS`} color="text-emerald-400" />
                  <StatCard icon={ArrowDown} label="נקודת מינימום" value={`${fmtN(cashflowResult.min_balance?.balance)} ILS`} sub={cashflowResult.min_balance?.date} color="text-red-400" />
                  <StatCard icon={AlertTriangle} label="ימי סיכון" value={cashflowResult.risk_days} sub="יתרה מתחת ל-50K" color="text-orange-400" />
                </div>
                <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
                  <h3 className="font-bold mb-4">תחזית תזרים</h3>
                  <div style={{ height: 350 }}>
                    <ResponsiveContainer>
                      <AreaChart data={cashflowResult.forecasts?.filter((_: any, i: number) => i % 2 === 0)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="date" stroke="#888" fontSize={10} tickFormatter={(v: string) => v.slice(5)} />
                        <YAxis stroke="#888" tickFormatter={(v: number) => `${Math.round(v / 1000)}K`} />
                        <Tooltip contentStyle={{ background: "#1a1d23", border: "1px solid #333", borderRadius: 8 }} />
                        <Area type="monotone" dataKey="balance" stroke="#06b6d4" fill="#06b6d440" strokeWidth={2} name="יתרה" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
                  <h3 className="font-bold mb-4">הכנסות מול הוצאות</h3>
                  <div style={{ height: 300 }}>
                    <ResponsiveContainer>
                      <BarChart data={cashflowResult.forecasts?.filter((_: any, i: number) => i % 5 === 0)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="date" stroke="#888" fontSize={10} tickFormatter={(v: string) => v.slice(5)} />
                        <YAxis stroke="#888" tickFormatter={(v: number) => `${Math.round(v / 1000)}K`} />
                        <Tooltip contentStyle={{ background: "#1a1d23", border: "1px solid #333", borderRadius: 8 }} />
                        <Bar dataKey="inflow" fill="#10b981" name="הכנסות" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="outflow" fill="#ef4444" name="הוצאות" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}
            {!cashflowResult && <div className="text-center py-20 text-muted-foreground">לחץ "הרץ תחזית" לחיזוי תזרים מזומנים</div>}
          </div>
        )}
      </div>
    </div>
  );
}
