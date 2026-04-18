import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Activity, Zap, AlertTriangle, Clock, GitBranch, Target,
  TrendingUp, CheckCircle2, XCircle, Play, BarChart3, ArrowRight,
  Layers, RefreshCw, Settings, Search
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, Treemap, AreaChart, Area
} from "recharts";

const API = "/api";
const headers = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("erp_token") || ""}`
});

const COLORS = ["#6366f1","#f59e0b","#ef4444","#10b981","#8b5cf6","#ec4899","#14b8a6","#f97316"];

function StatCard({ icon: Icon, label, value, sub, color = "indigo" }: any) {
  const bg: Record<string,string> = { indigo: "from-indigo-500/20 to-indigo-600/5", amber: "from-amber-500/20 to-amber-600/5", red: "from-red-500/20 to-red-600/5", emerald: "from-emerald-500/20 to-emerald-600/5" };
  const ic: Record<string,string> = { indigo: "text-indigo-400", amber: "text-amber-400", red: "text-red-400", emerald: "text-emerald-400" };
  return (
    <motion.div initial={{ opacity:0,y:10 }} animate={{ opacity:1,y:0 }} className={`bg-gradient-to-br ${bg[color]} border border-white/10 rounded-2xl p-5`}>
      <div className="flex items-center gap-3 mb-2"><Icon className={`w-5 h-5 ${ic[color]}`} /><span className="text-xs text-muted-foreground">{label}</span></div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </motion.div>
  );
}

export default function ProcessMiningPage() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [flows, setFlows] = useState<any[]>([]);
  const [selectedFlow, setSelectedFlow] = useState<number | null>(null);
  const [bottlenecks, setBottlenecks] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [optimizations, setOptimizations] = useState<any[]>([]);
  const [tab, setTab] = useState<"overview"|"bottlenecks"|"variants"|"optimizations">("overview");
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [dRes, fRes, oRes] = await Promise.all([
        authFetch(`${API}/process-mining/dashboard`, { headers: headers() }),
        authFetch(`${API}/process-mining/flows`, { headers: headers() }),
        authFetch(`${API}/process-mining/optimizations`, { headers: headers() })
      ]);
      setDashboard(await dRes.json());
      const fl = await fRes.json();
      setFlows(fl);
      setOptimizations(await oRes.json());
      if (fl.length > 0 && !selectedFlow) setSelectedFlow(fl[0].id);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selectedFlow) return;
    Promise.all([
      authFetch(`${API}/process-mining/${selectedFlow}/bottlenecks`, { headers: headers() }).then(r => r.json()),
      authFetch(`${API}/process-mining/${selectedFlow}/variants`, { headers: headers() }).then(r => r.json())
    ]).then(([b, v]) => { setBottlenecks(b); setVariants(v); }).catch(() => {});
  }, [selectedFlow]);

  const analyzeFlow = async (name: string) => {
    setAnalyzing(true);
    try {
      await authFetch(`${API}/process-mining/analyze/${encodeURIComponent(name)}`, { method: "POST", headers: headers(), body: JSON.stringify({}) });
      await load();
    } catch {}
    setAnalyzing(false);
  };

  const updateOptimization = async (id: number, status: string) => {
    await authFetch(`${API}/process-mining/optimizations/${id}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ status }) });
    load();
  };

  const tabs = [
    { key: "overview", label: "סקירה כללית", icon: BarChart3 },
    { key: "bottlenecks", label: "צווארי בקבוק", icon: AlertTriangle },
    { key: "variants", label: "וריאנטים", icon: GitBranch },
    { key: "optimizations", label: "אופטימיזציות", icon: Zap }
  ] as const;

  const totalSavings = optimizations.filter(o => o.status === 'implemented').reduce((s, o) => s + Number(o.estimated_savings_hours || 0), 0);
  const pendingOpts = optimizations.filter(o => o.status === 'suggested').length;

  if (loading) return <div className="flex items-center justify-center h-96"><RefreshCw className="w-8 h-8 animate-spin text-indigo-400" /></div>;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-l from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            כריית תהליכים אוטונומית
          </h1>
          <p className="text-muted-foreground mt-1">ניתוח, זיהוי צווארי בקבוק והמלצות אופטימיזציה</p>
        </div>
        <div className="flex gap-2">
          {flows.length > 0 && (
            <select value={selectedFlow || ''} onChange={e => setSelectedFlow(Number(e.target.value))}
              className="bg-background border border-white/10 rounded-lg px-3 py-2 text-sm">
              {flows.map(f => <option key={f.id} value={f.id}>{f.process_name}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Activity} label="תהליכים" value={dashboard?.totalFlows || 0} color="indigo" />
        <StatCard icon={AlertTriangle} label="צווארי בקבוק" value={dashboard?.topBottlenecks?.length || 0} color="red" />
        <StatCard icon={Zap} label="אופטימיזציות ממתינות" value={pendingOpts} color="amber" />
        <StatCard icon={TrendingUp} label="שעות נחסכו" value={totalSavings.toFixed(1)} color="emerald" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition ${
              tab === t.key ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'text-muted-foreground hover:bg-white/5'
            }`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Flows Table */}
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="bg-card border border-white/10 rounded-2xl p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><Layers className="w-4 h-4 text-indigo-400" />תהליכים מנותחים</h3>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {flows.map(f => (
                <div key={f.id} onClick={() => setSelectedFlow(f.id)}
                  className={`p-3 rounded-lg border cursor-pointer transition ${selectedFlow === f.id ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-white/5 hover:bg-white/5'}`}>
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{f.process_name}</span>
                    <button onClick={e => { e.stopPropagation(); analyzeFlow(f.process_name); }}
                      className="text-xs px-2 py-1 bg-indigo-500/20 rounded hover:bg-indigo-500/30">
                      {analyzing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                    </button>
                  </div>
                  <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                    <span>ביצועים: {f.total_executions}</span>
                    <span>ממוצע: {Number(f.avg_duration_hours).toFixed(1)} שעות</span>
                    <span>וריאנטים: {f.variant_count}</span>
                  </div>
                </div>
              ))}
              {flows.length === 0 && <p className="text-muted-foreground text-center py-8">אין תהליכים עדיין</p>}
            </div>
          </motion.div>

          {/* Top Activities Chart */}
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="bg-card border border-white/10 rounded-2xl p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-amber-400" />פעילויות מובילות</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={(dashboard?.topActivities || []).slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis type="number" stroke="#666" />
                <YAxis dataKey="activity" type="category" stroke="#666" width={120} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333' }} />
                <Bar dataKey="executions" fill="#6366f1" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Optimization Status Pie */}
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="bg-card border border-white/10 rounded-2xl p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><Target className="w-4 h-4 text-emerald-400" />סטטוס אופטימיזציות</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={dashboard?.optimizationStats || []} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={80} label={({ status, count }: any) => `${status}: ${count}`}>
                  {(dashboard?.optimizationStats || []).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333' }} />
              </PieChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Potential Savings */}
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="bg-card border border-white/10 rounded-2xl p-5 flex flex-col items-center justify-center">
            <Zap className="w-12 h-12 text-amber-400 mb-3" />
            <h3 className="text-lg font-semibold">פוטנציאל חיסכון כולל</h3>
            <div className="text-4xl font-bold text-amber-400 mt-2">{(dashboard?.potentialSavings || 0).toFixed(1)}</div>
            <div className="text-muted-foreground">שעות</div>
          </motion.div>
        </div>
      )}

      {/* Bottlenecks Tab */}
      {tab === "bottlenecks" && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="space-y-4">
          <div className="bg-card border border-white/10 rounded-2xl p-5">
            <h3 className="font-semibold mb-4">מפת חום - צווארי בקבוק</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={bottlenecks.slice(0, 12)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="activity" stroke="#666" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
                <YAxis stroke="#666" />
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333' }} />
                <Bar dataKey="impact_score" name="ציון השפעה" fill="#ef4444" radius={[4,4,0,0]}>
                  {bottlenecks.map((_, i) => <Cell key={i} fill={i < 3 ? '#ef4444' : i < 6 ? '#f59e0b' : '#6366f1'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid gap-3">
            {bottlenecks.map((bn, i) => (
              <div key={bn.id} className={`p-4 rounded-xl border ${i < 3 ? 'border-red-500/30 bg-red-500/5' : 'border-white/10 bg-card'}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium flex items-center gap-2">
                      {i < 3 && <AlertTriangle className="w-4 h-4 text-red-400" />}
                      {bn.activity}
                    </h4>
                    <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                      <span>זמן המתנה: {Number(bn.avg_wait_time_hours).toFixed(1)} שעות</span>
                      <span>תדירות: {bn.frequency}</span>
                      <span>ציון: {Number(bn.impact_score).toFixed(1)}</span>
                    </div>
                  </div>
                  {bn.suggested_action && (
                    <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-1 rounded">{bn.suggested_action}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Variants Tab */}
      {tab === "variants" && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="space-y-4">
          {variants.map((v, i) => (
            <div key={i} className="bg-card border border-white/10 rounded-2xl p-5">
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-semibold">וריאנט #{i + 1}</h4>
                <div className="flex gap-3 text-sm text-muted-foreground">
                  <span>{v.count} מקרים</span>
                  <span>ממוצע: {(v.avgMs / 3600000).toFixed(1)} שעות</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {(v.path || []).map((step: string, si: number) => (
                  <div key={si} className="flex items-center gap-1">
                    <span className="bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-full text-xs">{step}</span>
                    {si < v.path.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
                  </div>
                ))}
              </div>
              {/* Frequency bar */}
              <div className="mt-3">
                <div className="h-2 bg-muted/20 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min((v.count / Math.max(variants[0]?.count || 1, 1)) * 100, 100)}%` }} />
                </div>
              </div>
            </div>
          ))}
          {variants.length === 0 && <p className="text-center text-muted-foreground py-12">אין וריאנטים לתהליך הנבחר</p>}
        </motion.div>
      )}

      {/* Optimizations Tab */}
      {tab === "optimizations" && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="space-y-3">
          {optimizations.map(opt => {
            const typeLabels: Record<string,string> = { eliminate: 'ביטול', automate: 'אוטומציה', parallelize: 'הקבלה', reassign: 'הקצאה מחדש' };
            const typeColors: Record<string,string> = { eliminate: 'bg-red-500/20 text-red-300', automate: 'bg-indigo-500/20 text-indigo-300', parallelize: 'bg-amber-500/20 text-amber-300', reassign: 'bg-emerald-500/20 text-emerald-300' };
            const statusIcons: Record<string,any> = { suggested: Clock, approved: CheckCircle2, implemented: Zap, rejected: XCircle };
            const StatusIcon = statusIcons[opt.status] || Clock;
            return (
              <div key={opt.id} className="bg-card border border-white/10 rounded-xl p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded ${typeColors[opt.optimization_type] || ''}`}>
                        {typeLabels[opt.optimization_type] || opt.optimization_type}
                      </span>
                      <StatusIcon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{opt.process_name}</span>
                    </div>
                    <p className="text-sm">{opt.description}</p>
                    <span className="text-xs text-emerald-400 mt-1 inline-block">חיסכון: {Number(opt.estimated_savings_hours).toFixed(1)} שעות</span>
                  </div>
                  {opt.status === 'suggested' && (
                    <div className="flex gap-1 mr-4">
                      <button onClick={() => updateOptimization(opt.id, 'approved')}
                        className="text-xs px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded hover:bg-emerald-500/30">אשר</button>
                      <button onClick={() => updateOptimization(opt.id, 'rejected')}
                        className="text-xs px-2 py-1 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30">דחה</button>
                    </div>
                  )}
                  {opt.status === 'approved' && (
                    <button onClick={() => updateOptimization(opt.id, 'implemented')}
                      className="text-xs px-2 py-1 bg-indigo-500/20 text-indigo-300 rounded hover:bg-indigo-500/30 mr-4">סמן כמיושם</button>
                  )}
                </div>
              </div>
            );
          })}
          {optimizations.length === 0 && <p className="text-center text-muted-foreground py-12">אין המלצות אופטימיזציה עדיין</p>}
        </motion.div>
      )}
    </div>
  );
}
