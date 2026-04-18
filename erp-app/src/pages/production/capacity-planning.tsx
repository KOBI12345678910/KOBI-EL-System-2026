import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Server, Calendar, AlertTriangle, TrendingUp, Gauge, Plus,
  RefreshCw, Layers, Zap, Clock, Check, X, BarChart3, Settings
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend, RadialBarChart, RadialBar
} from "recharts";

const API = "/api";
const headers = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("erp_token") || ""}`
});

const COLORS = ["#6366f1","#f59e0b","#ef4444","#10b981","#8b5cf6","#ec4899"];

function UtilGauge({ value, label }: { value: number; label: string }) {
  const color = value >= 90 ? "#ef4444" : value >= 70 ? "#f59e0b" : "#10b981";
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-20 h-20">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none" stroke="#333" strokeWidth="3" />
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none" stroke={color} strokeWidth="3" strokeDasharray={`${value}, 100`} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color }}>{Math.round(value)}%</span>
      </div>
      <span className="text-xs text-muted-foreground mt-1 text-center">{label}</span>
    </div>
  );
}

export default function CapacityPlanningPage() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [pools, setPools] = useState<any[]>([]);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [utilization, setUtilization] = useState<any[]>([]);
  const [calendar, setCalendar] = useState<any[]>([]);
  const [selectedPool, setSelectedPool] = useState<number | null>(null);
  const [tab, setTab] = useState<"dashboard"|"calendar"|"conflicts"|"scenarios">("dashboard");
  const [loading, setLoading] = useState(true);
  const [showAddPool, setShowAddPool] = useState(false);
  const [newPool, setNewPool] = useState({ pool_name: '', resource_type: 'machine', total_capacity: 8, unit: 'hours', location: '' });

  const load = async () => {
    setLoading(true);
    try {
      const [dRes, pRes, cRes, uRes] = await Promise.all([
        authFetch(`${API}/capacity/dashboard`, { headers: headers() }),
        authFetch(`${API}/capacity/pools`, { headers: headers() }),
        authFetch(`${API}/capacity/conflicts`, { headers: headers() }),
        authFetch(`${API}/capacity/utilization-report`, { headers: headers() })
      ]);
      setDashboard(await dRes.json());
      const pl = await pRes.json();
      setPools(pl);
      setConflicts(await cRes.json());
      setUtilization(await uRes.json());
      if (pl.length > 0 && !selectedPool) setSelectedPool(pl[0].id);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selectedPool) return;
    authFetch(`${API}/capacity/calendar/${selectedPool}?from=${new Date().toISOString().slice(0,10)}&to=${new Date(Date.now()+30*86400000).toISOString().slice(0,10)}`, { headers: headers() })
      .then(r => r.json()).then(setCalendar).catch(() => setCalendar([]));
  }, [selectedPool]);

  const addPool = async () => {
    await authFetch(`${API}/capacity/pools`, { method: "POST", headers: headers(), body: JSON.stringify(newPool) });
    setShowAddPool(false);
    setNewPool({ pool_name: '', resource_type: 'machine', total_capacity: 8, unit: 'hours', location: '' });
    load();
  };

  const allocate = async () => {
    if (!selectedPool) return;
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    await authFetch(`${API}/capacity/allocate`, { method: "POST", headers: headers(), body: JSON.stringify({ pool_id: selectedPool, from_date: from, to_date: to }) });
    load();
  };

  const resolveConflict = async (id: number) => {
    await authFetch(`${API}/capacity/conflicts/${id}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ resolution_status: 'resolved', resolution: 'נפתר ידנית' }) });
    load();
  };

  const typeLabels: Record<string,string> = { machine: 'מכונה', labor: 'כ"א', crew: 'צוות', vehicle: 'רכב', tool: 'כלי' };
  const tabs = [
    { key: "dashboard", label: "דשבורד", icon: BarChart3 },
    { key: "calendar", label: "לוח שנה", icon: Calendar },
    { key: "conflicts", label: "קונפליקטים", icon: AlertTriangle },
    { key: "scenarios", label: "תרחישים", icon: Layers }
  ] as const;

  if (loading) return <div className="flex items-center justify-center h-96"><RefreshCw className="w-8 h-8 animate-spin text-indigo-400" /></div>;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-l from-emerald-400 to-teal-400 bg-clip-text text-transparent">
            תכנון קיבולת ומשאבים
          </h1>
          <p className="text-muted-foreground mt-1">ניהול, הקצאה וסימולציית משאבים מתקדמת</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAddPool(true)} className="flex items-center gap-1 px-3 py-2 bg-emerald-500/20 text-emerald-300 rounded-lg text-sm hover:bg-emerald-500/30">
            <Plus className="w-4 h-4" />מאגר חדש
          </button>
          <button onClick={allocate} className="flex items-center gap-1 px-3 py-2 bg-indigo-500/20 text-indigo-300 rounded-lg text-sm hover:bg-indigo-500/30">
            <Zap className="w-4 h-4" />הקצאה אוטומטית
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div initial={{ opacity:0,y:10 }} animate={{ opacity:1,y:0 }} className="bg-gradient-to-br from-emerald-500/20 to-emerald-600/5 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2"><Server className="w-4 h-4 text-emerald-400" />מאגרי משאבים</div>
          <div className="text-2xl font-bold">{dashboard?.totalPools || 0}</div>
        </motion.div>
        <motion.div initial={{ opacity:0,y:10 }} animate={{ opacity:1,y:0 }} transition={{ delay:0.1 }} className="bg-gradient-to-br from-red-500/20 to-red-600/5 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2"><AlertTriangle className="w-4 h-4 text-red-400" />קונפליקטים פתוחים</div>
          <div className="text-2xl font-bold text-red-400">{dashboard?.openConflicts || 0}</div>
        </motion.div>
        <motion.div initial={{ opacity:0,y:10 }} animate={{ opacity:1,y:0 }} transition={{ delay:0.2 }} className="bg-gradient-to-br from-amber-500/20 to-amber-600/5 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2"><Layers className="w-4 h-4 text-amber-400" />תרחישים</div>
          <div className="text-2xl font-bold">{dashboard?.recentScenarios?.length || 0}</div>
        </motion.div>
        <motion.div initial={{ opacity:0,y:10 }} animate={{ opacity:1,y:0 }} transition={{ delay:0.3 }} className="bg-gradient-to-br from-indigo-500/20 to-indigo-600/5 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2"><TrendingUp className="w-4 h-4 text-indigo-400" />ביקוש פעיל</div>
          <div className="text-2xl font-bold">{dashboard?.demandBreakdown?.reduce((s: number, d: any) => s + Number(d.count), 0) || 0}</div>
        </motion.div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition ${
              tab === t.key ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-muted-foreground hover:bg-white/5'
            }`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {/* Dashboard Tab */}
      {tab === "dashboard" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Utilization Gauges */}
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="bg-card border border-white/10 rounded-2xl p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><Gauge className="w-4 h-4 text-emerald-400" />ניצולת שבועית</h3>
            <div className="flex flex-wrap gap-4 justify-center">
              {(dashboard?.weeklyUtilization || []).slice(0, 8).map((u: any) => (
                <UtilGauge key={u.id} value={Number(u.avg_util)} label={u.pool_name} />
              ))}
            </div>
          </motion.div>

          {/* Demand Breakdown */}
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="bg-card border border-white/10 rounded-2xl p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-indigo-400" />פילוח ביקוש</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={(dashboard?.demandBreakdown || []).map((d: any) => ({ name: d.source_type, value: Number(d.count) }))}
                  dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {(dashboard?.demandBreakdown || []).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Utilization Report */}
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="bg-card border border-white/10 rounded-2xl p-5 lg:col-span-2">
            <h3 className="font-semibold mb-4">דוח ניצולת - 30 יום אחרונים</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={utilization.slice(0, 15)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="pool_name" stroke="#666" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={70} />
                <YAxis stroke="#666" />
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333' }} />
                <Bar dataKey="avg_utilization" name="ניצולת ממוצעת" fill="#10b981" radius={[4,4,0,0]} />
                <Bar dataKey="peak_utilization" name="שיא" fill="#f59e0b" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        </div>
      )}

      {/* Calendar Tab */}
      {tab === "calendar" && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="space-y-4">
          <div className="flex gap-2 mb-4">
            <select value={selectedPool || ''} onChange={e => setSelectedPool(Number(e.target.value))}
              className="bg-background border border-white/10 rounded-lg px-3 py-2 text-sm">
              {pools.map(p => <option key={p.id} value={p.id}>{p.pool_name} ({typeLabels[p.resource_type] || p.resource_type})</option>)}
            </select>
          </div>
          <div className="bg-card border border-white/10 rounded-2xl p-5">
            <h3 className="font-semibold mb-4">מפת חום - קיבולת יומית</h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={calendar.map(c => ({ ...c, date: c.date?.slice(5, 10) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="date" stroke="#666" />
                <YAxis stroke="#666" />
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333' }} />
                <Area type="monotone" dataKey="available_capacity" name="זמין" stackId="1" fill="#10b981" fillOpacity={0.3} stroke="#10b981" />
                <Area type="monotone" dataKey="allocated_capacity" name="מוקצה" stackId="2" fill="#6366f1" fillOpacity={0.5} stroke="#6366f1" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendar.map((c, i) => {
              const util = Number(c.utilization_pct);
              const bg = util >= 100 ? 'bg-red-500/40' : util >= 80 ? 'bg-amber-500/30' : util >= 50 ? 'bg-emerald-500/20' : 'bg-white/5';
              return (
                <div key={i} className={`${bg} rounded-lg p-2 text-center text-xs`}>
                  <div className="font-medium">{c.date?.slice(8, 10)}</div>
                  <div className="text-muted-foreground">{Math.round(util)}%</div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Conflicts Tab */}
      {tab === "conflicts" && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="space-y-3">
          {conflicts.map(c => (
            <div key={c.id} className="bg-card border border-red-500/20 rounded-xl p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-medium flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    {c.pool_name} - {c.date?.slice(0, 10)}
                  </h4>
                  <p className="text-sm text-muted-foreground mt-1">עומס יתר: {Number(c.overload_amount).toFixed(1)} יחידות</p>
                </div>
                <button onClick={() => resolveConflict(c.id)}
                  className="text-xs px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded hover:bg-emerald-500/30">פתור</button>
              </div>
            </div>
          ))}
          {conflicts.length === 0 && <p className="text-center text-muted-foreground py-12">אין קונפליקטים פתוחים</p>}
        </motion.div>
      )}

      {/* Scenarios Tab */}
      {tab === "scenarios" && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="space-y-4">
          {(dashboard?.recentScenarios || []).map((s: any) => (
            <div key={s.id} className="bg-card border border-white/10 rounded-xl p-5">
              <h4 className="font-semibold">{s.scenario_name}</h4>
              <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                <span>ניצולת מרבית: {Number(s.best_utilization).toFixed(0)}%</span>
                <span>צוואר בקבוק: {s.worst_bottleneck || 'ללא'}</span>
              </div>
            </div>
          ))}
          {(dashboard?.recentScenarios || []).length === 0 && <p className="text-center text-muted-foreground py-12">אין תרחישים עדיין - הרץ סימולציה ראשונה</p>}
        </motion.div>
      )}

      {/* Add Pool Modal */}
      {showAddPool && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddPool(false)}>
          <div className="bg-card border border-white/10 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-4">מאגר משאבים חדש</h3>
            <div className="space-y-3">
              <input placeholder="שם המאגר" value={newPool.pool_name} onChange={e => setNewPool(p => ({...p, pool_name: e.target.value}))}
                className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm" />
              <select value={newPool.resource_type} onChange={e => setNewPool(p => ({...p, resource_type: e.target.value}))}
                className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm">
                {Object.entries(typeLabels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <div className="flex gap-2">
                <input type="number" placeholder="קיבולת" value={newPool.total_capacity} onChange={e => setNewPool(p => ({...p, total_capacity: Number(e.target.value)}))}
                  className="flex-1 bg-background border border-white/10 rounded-lg px-3 py-2 text-sm" />
                <input placeholder="יחידה" value={newPool.unit} onChange={e => setNewPool(p => ({...p, unit: e.target.value}))}
                  className="w-24 bg-background border border-white/10 rounded-lg px-3 py-2 text-sm" />
              </div>
              <input placeholder="מיקום" value={newPool.location} onChange={e => setNewPool(p => ({...p, location: e.target.value}))}
                className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm" />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAddPool(false)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-white/5 rounded-lg">ביטול</button>
                <button onClick={addPool} className="px-4 py-2 text-sm bg-emerald-500/20 text-emerald-300 rounded-lg hover:bg-emerald-500/30">שמור</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
