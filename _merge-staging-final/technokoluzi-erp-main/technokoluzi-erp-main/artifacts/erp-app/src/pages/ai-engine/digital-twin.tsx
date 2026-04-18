import { useState, useEffect } from "react";
import {
  Box, Activity, Play, Pause, Camera, FlaskConical, History,
  RefreshCw, Plus, BarChart3, Clock, CheckCircle2, XCircle,
  Factory, Wallet, Package, Users, FolderKanban, Trash2
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { authFetch } from "@/lib/utils";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || document.cookie.match(/token=([^;]+)/)?.[1] || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

interface Twin {
  id: number;
  twin_type: string;
  name: string;
  status: string;
  config: Record<string, any>;
  last_sync: string;
  snapshot_count: number;
  simulation_count: number;
  created_at: string;
}

interface Simulation {
  id: number;
  twin_id: number;
  twin_name?: string;
  twin_type?: string;
  scenario_name: string;
  assumptions: Record<string, any>;
  results: Record<string, any>;
  status: string;
  created_at: string;
}

interface DashboardData {
  total_twins: number;
  by_type: { twin_type: string; count: number }[];
  by_status: { status: string; count: number }[];
  active_simulations: number;
  recent_simulations: Simulation[];
  recent_snapshots: any[];
}

const TYPE_ICONS: Record<string, any> = {
  factory: Factory,
  project: FolderKanban,
  cashflow: Wallet,
  inventory: Package,
  crew: Users,
};

const TYPE_LABELS: Record<string, string> = {
  factory: "מפעל",
  project: "פרויקט",
  cashflow: "תזרים מזומנים",
  inventory: "מלאי",
  crew: "צוות",
};

const TYPE_COLORS: Record<string, string> = {
  factory: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  project: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  cashflow: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  inventory: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  crew: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
};

export default function DigitalTwinPage() {
  const [tab, setTab] = useState<"dashboard" | "twins" | "simulate">("dashboard");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [twins, setTwins] = useState<Twin[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTwin, setSelectedTwin] = useState<Twin | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTwin, setNewTwin] = useState({ name: "", twin_type: "factory" });
  const [simScenario, setSimScenario] = useState("");
  const [simAssumptions, setSimAssumptions] = useState<Record<string, string>>({});
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState<any>(null);
  const [snapshotLoading, setSnapshotLoading] = useState<number | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [dashR, twinsR] = await Promise.all([
        authFetch(`${API}/digital-twin/dashboard`, { headers: headers() }).then(r => r.json()),
        authFetch(`${API}/digital-twin`, { headers: headers() }).then(r => r.json()),
      ]);
      setDashboard(dashR);
      setTwins(twinsR.twins || []);
    } catch { setDashboard(null); setTwins([]); }
    setLoading(false);
  }

  async function createTwin() {
    if (!newTwin.name) return;
    try {
      await authFetch(`${API}/digital-twin`, {
        method: "POST", headers: headers(),
        body: JSON.stringify(newTwin),
      });
      setShowCreate(false);
      setNewTwin({ name: "", twin_type: "factory" });
      loadAll();
    } catch {}
  }

  async function takeSnapshot(twinId: number) {
    setSnapshotLoading(twinId);
    try {
      await authFetch(`${API}/digital-twin/${twinId}/snapshot`, { method: "POST", headers: headers() });
      loadAll();
    } catch {}
    setSnapshotLoading(null);
  }

  async function toggleStatus(twin: Twin) {
    const newStatus = twin.status === "active" ? "paused" : "active";
    try {
      await authFetch(`${API}/digital-twin/${twin.id}`, {
        method: "PUT", headers: headers(),
        body: JSON.stringify({ status: newStatus }),
      });
      loadAll();
    } catch {}
  }

  async function runSimulation() {
    if (!selectedTwin || !simScenario) return;
    setSimLoading(true);
    try {
      const r = await authFetch(`${API}/digital-twin/${selectedTwin.id}/simulate`, {
        method: "POST", headers: headers(),
        body: JSON.stringify({ scenario_name: simScenario, assumptions: simAssumptions }),
      });
      const d = await r.json();
      setSimResult(d);
      loadAll();
    } catch { setSimResult({ error: "שגיאה בהרצת הסימולציה" }); }
    setSimLoading(false);
  }

  const TABS = [
    { key: "dashboard", label: "לוח בקרה", icon: BarChart3 },
    { key: "twins", label: "תאומים דיגיטליים", icon: Box },
    { key: "simulate", label: "סימולציה", icon: FlaskConical },
  ] as const;

  return (
    <div className="min-h-screen bg-background text-foreground p-6" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Box className="w-7 h-7 text-primary" />
              מרכז תאומים דיגיטליים
            </h1>
            <p className="text-muted-foreground text-sm mt-1">סימולציה ומעקב בזמן אמת של תהליכים עסקיים</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition">
              <Plus className="w-4 h-4" /> תאום חדש
            </button>
            <button onClick={loadAll} className="p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition">
              <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border/50 pb-2">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition
                ${tab === t.key ? "bg-primary/10 text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/20"}`}>
              <t.icon className="w-4 h-4" />{t.label}
            </button>
          ))}
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="bg-card/80 backdrop-blur border border-border/30 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold">יצירת תאום דיגיטלי חדש</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">שם</label>
                <input value={newTwin.name} onChange={e => setNewTwin({ ...newTwin, name: e.target.value })}
                  placeholder="שם התאום..." className="w-full px-4 py-2.5 rounded-xl bg-muted/20 border border-border/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">סוג</label>
                <select value={newTwin.twin_type} onChange={e => setNewTwin({ ...newTwin, twin_type: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted/20 border border-border/30 text-sm focus:outline-none">
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={createTwin} className="px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition">צור</button>
              <button onClick={() => setShowCreate(false)} className="px-6 py-2 rounded-lg bg-muted/30 text-sm hover:bg-muted/50 transition">ביטול</button>
            </div>
          </div>
        )}

        {/* Dashboard Tab */}
        {tab === "dashboard" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                { label: "תאומים פעילים", value: dashboard?.total_twins || 0, icon: Box, color: "text-blue-400" },
                { label: "סימולציות פעילות", value: dashboard?.active_simulations || 0, icon: FlaskConical, color: "text-emerald-400" },
                { label: "סוגי תאומים", value: dashboard?.by_type?.length || 0, icon: Wallet, color: "text-purple-400" },
                { label: "סנאפשוטים אחרונים", value: dashboard?.recent_snapshots?.length || 0, icon: Camera, color: "text-amber-400" },
              ].map((kpi, i) => (
                <div key={i} className="bg-card/60 backdrop-blur border border-border/30 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-muted-foreground text-sm">{kpi.label}</span>
                    <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                  </div>
                  <div className="text-3xl font-bold">{kpi.value}</div>
                </div>
              ))}
            </div>

            {/* Recent Simulations */}
            <div className="bg-card/60 backdrop-blur border border-border/30 rounded-xl p-5">
              <h3 className="font-semibold mb-3 flex items-center gap-2"><History className="w-4 h-4 text-primary" /> סימולציות אחרונות</h3>
              {(dashboard?.recent_simulations || []).length === 0 ? (
                <p className="text-muted-foreground text-sm">לא בוצעו סימולציות עדיין</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-muted-foreground border-b border-border/30">
                      <th className="text-right p-2">תאום</th><th className="text-right p-2">תרחיש</th>
                      <th className="text-right p-2">סטטוס</th><th className="text-right p-2">תאריך</th>
                    </tr></thead>
                    <tbody>
                      {dashboard!.recent_simulations.map(s => (
                        <tr key={s.id} className="border-b border-border/10 hover:bg-muted/10">
                          <td className="p-2">{s.twin_name}</td>
                          <td className="p-2">{s.scenario_name}</td>
                          <td className="p-2">
                            <span className={`px-2 py-0.5 rounded text-xs ${s.status === "completed" ? "bg-emerald-500/20 text-emerald-400" : s.status === "running" ? "bg-blue-500/20 text-blue-400" : "bg-red-500/20 text-red-400"}`}>
                              {s.status === "completed" ? "הושלם" : s.status === "running" ? "רץ" : "נכשל"}
                            </span>
                          </td>
                          <td className="p-2 text-muted-foreground">{new Date(s.created_at).toLocaleDateString("he-IL")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Twins Tab */}
        {tab === "twins" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {twins.length === 0 ? (
              <div className="col-span-full text-center text-muted-foreground py-12">
                <Box className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>לא נמצאו תאומים דיגיטליים</p>
              </div>
            ) : twins.map(twin => {
              const Icon = TYPE_ICONS[twin.twin_type] || Box;
              const color = TYPE_COLORS[twin.twin_type] || "bg-muted/20 text-muted-foreground border-border/30";
              return (
                <div key={twin.id} className="bg-card/60 backdrop-blur border border-border/30 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-lg ${color}`}><Icon className="w-5 h-5" /></div>
                      <div>
                        <div className="font-semibold">{twin.name}</div>
                        <div className="text-xs text-muted-foreground">{TYPE_LABELS[twin.twin_type]}</div>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs ${twin.status === "active" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
                      {twin.status === "active" ? "פעיל" : "מושהה"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-muted/20 rounded-lg p-2 text-center">
                      <div className="text-lg font-bold">{twin.snapshot_count}</div>
                      <div className="text-xs text-muted-foreground">סנאפשוטים</div>
                    </div>
                    <div className="bg-muted/20 rounded-lg p-2 text-center">
                      <div className="text-lg font-bold">{twin.simulation_count}</div>
                      <div className="text-xs text-muted-foreground">סימולציות</div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    סנכרון אחרון: {new Date(twin.last_sync).toLocaleString("he-IL")}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => takeSnapshot(twin.id)} disabled={snapshotLoading === twin.id}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 text-xs hover:bg-blue-500/20 transition">
                      <Camera className="w-3 h-3" /> {snapshotLoading === twin.id ? "שומר..." : "סנאפשוט"}
                    </button>
                    <button onClick={() => toggleStatus(twin)}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-muted/20 text-xs hover:bg-muted/30 transition">
                      {twin.status === "active" ? <><Pause className="w-3 h-3" /> השהה</> : <><Play className="w-3 h-3" /> הפעל</>}
                    </button>
                    <button onClick={() => { setSelectedTwin(twin); setTab("simulate"); }}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs hover:bg-emerald-500/20 transition">
                      <FlaskConical className="w-3 h-3" /> סמלצ
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Simulate Tab */}
        {tab === "simulate" && (
          <div className="space-y-4">
            <div className="bg-card/60 backdrop-blur border border-border/30 rounded-xl p-5 space-y-4">
              <h3 className="font-semibold flex items-center gap-2"><FlaskConical className="w-4 h-4 text-emerald-400" /> הרצת סימולציה</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">בחר תאום</label>
                  <select value={selectedTwin?.id || ""} onChange={e => setSelectedTwin(twins.find(t => t.id === Number(e.target.value)) || null)}
                    className="w-full px-4 py-2.5 rounded-xl bg-muted/20 border border-border/30 text-sm focus:outline-none">
                    <option value="">בחר תאום...</option>
                    {twins.map(t => <option key={t.id} value={t.id}>{t.name} ({TYPE_LABELS[t.twin_type]})</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">שם תרחיש</label>
                  <input value={simScenario} onChange={e => setSimScenario(e.target.value)}
                    placeholder="תרחיש אופטימי..." className="w-full px-4 py-2.5 rounded-xl bg-muted/20 border border-border/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>

              {selectedTwin?.twin_type === "cashflow" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">צמיחת הכנסות (%)</label>
                    <input type="number" value={simAssumptions.revenue_growth_pct || ""} onChange={e => setSimAssumptions({ ...simAssumptions, revenue_growth_pct: e.target.value })}
                      placeholder="5" className="w-full px-4 py-2.5 rounded-xl bg-muted/20 border border-border/30 text-sm focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">שינוי עלויות (%)</label>
                    <input type="number" value={simAssumptions.cost_change_pct || ""} onChange={e => setSimAssumptions({ ...simAssumptions, cost_change_pct: e.target.value })}
                      placeholder="3" className="w-full px-4 py-2.5 rounded-xl bg-muted/20 border border-border/30 text-sm focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">חודשי תחזית</label>
                    <input type="number" value={simAssumptions.forecast_months || ""} onChange={e => setSimAssumptions({ ...simAssumptions, forecast_months: e.target.value })}
                      placeholder="6" className="w-full px-4 py-2.5 rounded-xl bg-muted/20 border border-border/30 text-sm focus:outline-none" />
                  </div>
                </div>
              )}

              {selectedTwin?.twin_type === "factory" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">יעילות יעד (%)</label>
                    <input type="number" value={simAssumptions.target_efficiency_pct || ""} onChange={e => setSimAssumptions({ ...simAssumptions, target_efficiency_pct: e.target.value })}
                      placeholder="85" className="w-full px-4 py-2.5 rounded-xl bg-muted/20 border border-border/30 text-sm focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">הגדלת קיבולת (%)</label>
                    <input type="number" value={simAssumptions.capacity_increase_pct || ""} onChange={e => setSimAssumptions({ ...simAssumptions, capacity_increase_pct: e.target.value })}
                      placeholder="10" className="w-full px-4 py-2.5 rounded-xl bg-muted/20 border border-border/30 text-sm focus:outline-none" />
                  </div>
                </div>
              )}

              <button onClick={runSimulation} disabled={simLoading || !selectedTwin || !simScenario}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-500 transition disabled:opacity-50">
                {simLoading ? "מריץ סימולציה..." : "הרץ סימולציה"}
              </button>
            </div>

            {simResult && !simResult.error && (
              <div className="bg-card/60 backdrop-blur border border-border/30 rounded-xl p-5 space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> תוצאות - {simResult.scenario_name}
                </h3>
                <pre className="bg-muted/20 rounded-lg p-4 text-xs overflow-x-auto max-h-64" dir="ltr">
                  {JSON.stringify(simResult.results, null, 2)}
                </pre>
              </div>
            )}
            {simResult?.error && (
              <div className="bg-red-500/10 text-red-400 p-4 rounded-lg text-sm">{simResult.error}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
