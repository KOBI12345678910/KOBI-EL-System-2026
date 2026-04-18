import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Users, TrendingUp, Phone, PhoneOff, PhoneMissed, PhoneForwarded,
  Target, Award, AlertTriangle, AlertCircle, Info, CheckCircle, BarChart3,
  ArrowUpDown, Eye, Loader2, RefreshCw, Bell, Clock, DollarSign, Percent,
  Activity, Zap, Filter, Calendar
} from "lucide-react";

const API = "/api";
const getHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("erp_token") || ""}` });
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);
const pct = (n: number) => `${Number(n).toFixed(1)}%`;

type Agent = {
  agent_id: number; agent_name: string; total_deals: number; total_revenue: number;
  total_commission: number; total_leads: number; total_meetings: number; total_quotes: number;
  avg_response: number; close_rate: number; total_calls: number; total_missed: number;
};
type Alert = {
  id: number; agent_id: number; alert_type: string; severity: string; message: string;
  acknowledged: boolean; created_at: string;
};
type Filter = {
  agent_id: number; period: string; leads_total: number;
  leads_to_contact_pct: number; contact_to_meeting_pct: number;
  meeting_to_quote_pct: number; quote_to_close_pct: number;
  overall_conversion_pct: number; avg_deal_size: number; pipeline_value: number;
};
type Dashboard = {
  kpi: Record<string, number>; topAgents: any[]; funnels: Filter[]; alerts: Alert[];
};

const SEVERITY_MAP: Record<string, { label: string; color: string; icon: any }> = {
  critical: { label: "קריטי", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: AlertCircle },
  warning: { label: "אזהרה", color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: AlertTriangle },
  info: { label: "מידע", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Info },
};

const ALERT_TYPE_MAP: Record<string, string> = {
  no_followup: "חוסר מעקב",
  missed_calls: "שיחות שלא נענו",
  low_conversion: "המרה נמוכה",
  high_discount: "הנחה גבוהה",
  location_mismatch: "מיקום לא תקין",
  inactive: "חוסר פעילות",
};

export default function AgentPerformancePage() {
  const [tab, setTab] = useState<"dashboard" | "rankings" | "comparison" | "alerts">("dashboard");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [rankings, setRankings] = useState<Agent[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [comparison, setComparison] = useState<Agent[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>("total_revenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const fetchDashboard = useCallback(async () => {
    try {
      const r = await fetch(`${API}/agent-performance/dashboard`, { headers: getHeaders() });
      const d = await r.json();
      setDashboard(d);
    } catch {}
  }, []);

  const fetchRankings = useCallback(async () => {
    try {
      const r = await fetch(`${API}/agent-performance/rankings`, { headers: getHeaders() });
      const d = await r.json();
      setRankings(d.data || []);
    } catch {}
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const r = await fetch(`${API}/agent-performance/alerts`, { headers: getHeaders() });
      const d = await r.json();
      setAlerts(d.data || []);
    } catch {}
  }, []);

  const fetchComparison = useCallback(async () => {
    if (selectedAgents.length < 2) return;
    try {
      const r = await fetch(`${API}/agent-performance/comparison?agents=${selectedAgents.join(",")}`, { headers: getHeaders() });
      const d = await r.json();
      setComparison(d.data || []);
    } catch {}
  }, [selectedAgents]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchDashboard(), fetchRankings(), fetchAlerts()]);
      setLoading(false);
    })();
  }, [fetchDashboard, fetchRankings, fetchAlerts]);

  useEffect(() => { if (tab === "comparison") fetchComparison(); }, [tab, fetchComparison]);

  const acknowledgeAlert = async (id: number) => {
    await fetch(`${API}/agent-performance/alerts/${id}/acknowledge`, { method: "POST", headers: getHeaders() });
    setAlerts(prev => prev.filter(a => a.id !== id));
    if (dashboard) setDashboard({ ...dashboard, alerts: dashboard.alerts.filter(a => a.id !== id) });
  };

  const toggleAgent = (id: number) => {
    setSelectedAgents(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const sortedRankings = useMemo(() => {
    return [...rankings].sort((a: any, b: any) => {
      const va = Number(a[sortKey]) || 0;
      const vb = Number(b[sortKey]) || 0;
      return sortDir === "desc" ? vb - va : va - vb;
    });
  }, [rankings, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        <span className="text-white/60 mr-3">טוען נתוני ביצועים...</span>
      </div>
    );
  }

  const kpi = dashboard?.kpi;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-7 h-7 text-blue-400" />
            ניתוח ביצועי סוכנים
          </h1>
          <p className="text-white/50 text-sm mt-1">מעקב ביצועים, המרות, שיחות והתראות בזמן אמת</p>
        </div>
        <button onClick={() => { fetchDashboard(); fetchRankings(); fetchAlerts(); }}
          className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 flex items-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4" /> רענון
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {([
          { key: "dashboard", label: "דשבורד", icon: BarChart3 },
          { key: "rankings", label: "דירוג סוכנים", icon: Award },
          { key: "comparison", label: "השוואה", icon: ArrowUpDown },
          { key: "alerts", label: `התראות (${alerts.length})`, icon: Bell },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-all ${
              tab === t.key ? "bg-blue-600 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* ─── DASHBOARD TAB ─── */}
      {tab === "dashboard" && kpi && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {[
              { label: "הכנסות", value: fmtC(Number(kpi.total_revenue) || 0), icon: DollarSign, color: "text-green-400" },
              { label: "עסקאות", value: fmt(Number(kpi.total_deals) || 0), icon: Target, color: "text-blue-400" },
              { label: "לידים", value: fmt(Number(kpi.total_leads) || 0), icon: Users, color: "text-purple-400" },
              { label: "פגישות", value: fmt(Number(kpi.total_meetings) || 0), icon: Calendar, color: "text-cyan-400" },
              { label: "שיחות", value: fmt(Number(kpi.total_calls) || 0), icon: Phone, color: "text-amber-400" },
              { label: "זמן תגובה", value: `${kpi.avg_response || 0} דק'`, icon: Clock, color: "text-red-400" },
            ].map((c, i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <c.icon className={`w-4 h-4 ${c.color}`} />
                  <span className="text-white/50 text-xs">{c.label}</span>
                </div>
                <div className="text-xl font-bold">{c.value}</div>
              </div>
            ))}
          </div>

          {/* Top Agents + Filter */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Agents */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" /> סוכנים מובילים
              </h3>
              <div className="space-y-3">
                {(dashboard?.topAgents || []).map((a: any, idx: number) => (
                  <div key={a.agent_id} className="flex items-center gap-3 bg-white/5 rounded-lg p-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      idx === 0 ? "bg-amber-500/30 text-amber-300" :
                      idx === 1 ? "bg-gray-400/30 text-gray-300" :
                      idx === 2 ? "bg-orange-600/30 text-orange-300" : "bg-white/10 text-white/50"
                    }`}>{idx + 1}</div>
                    <div className="flex-1">
                      <div className="font-medium">{a.agent_name}</div>
                      <div className="text-xs text-white/40">{fmt(Number(a.deals))} עסקאות</div>
                    </div>
                    <div className="text-green-400 font-bold">{fmtC(Number(a.revenue))}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Conversion Funnels */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Filter className="w-5 h-5 text-purple-400" /> משפכי המרה
              </h3>
              <div className="space-y-3">
                {(dashboard?.funnels || []).slice(0, 5).map((f: Filter) => {
                  const agent = rankings.find(r => r.agent_id === f.agent_id);
                  return (
                    <div key={f.agent_id} className="bg-white/5 rounded-lg p-3">
                      <div className="font-medium text-sm mb-2">{agent?.agent_name || `סוכן ${f.agent_id}`}</div>
                      <div className="flex gap-1 items-center">
                        {[
                          { label: "ליד→קשר", val: f.leads_to_contact_pct },
                          { label: "קשר→פגישה", val: f.contact_to_meeting_pct },
                          { label: "פגישה→הצעה", val: f.meeting_to_quote_pct },
                          { label: "הצעה→סגירה", val: f.quote_to_close_pct },
                        ].map((step, si) => (
                          <div key={si} className="flex-1 text-center">
                            <div className="text-[10px] text-white/40 mb-1">{step.label}</div>
                            <div className="h-6 rounded-full overflow-hidden bg-white/10 relative">
                              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold z-10">{pct(step.val)}</div>
                              <div className="h-full bg-gradient-to-r from-blue-500/60 to-purple-500/60 rounded-full"
                                style={{ width: `${Math.min(step.val, 100)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between mt-2 text-xs text-white/40">
                        <span>המרה כוללת: <span className="text-green-400 font-bold">{pct(f.overall_conversion_pct)}</span></span>
                        <span>עסקה ממוצעת: <span className="text-blue-400">{fmtC(Number(f.avg_deal_size))}</span></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Recent Alerts */}
          {(dashboard?.alerts || []).length > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Bell className="w-5 h-5 text-red-400" /> התראות פעילות
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(dashboard?.alerts || []).slice(0, 6).map((a: Alert) => {
                  const sev = SEVERITY_MAP[a.severity] || SEVERITY_MAP.info;
                  return (
                    <div key={a.id} className={`flex items-start gap-3 p-3 rounded-lg border ${sev.color}`}>
                      <sev.icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{a.message}</div>
                        <div className="text-xs mt-1 opacity-60">{ALERT_TYPE_MAP[a.alert_type] || a.alert_type}</div>
                      </div>
                      <button onClick={() => acknowledgeAlert(a.id)} className="text-xs bg-white/10 px-2 py-1 rounded hover:bg-white/20">
                        <CheckCircle className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── RANKINGS TAB ─── */}
      {tab === "rankings" && (
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/5 text-white/60">
                  {[
                    { key: "agent_name", label: "סוכן" },
                    { key: "total_revenue", label: "הכנסות" },
                    { key: "total_deals", label: "עסקאות" },
                    { key: "total_leads", label: "לידים" },
                    { key: "total_meetings", label: "פגישות" },
                    { key: "total_quotes", label: "הצעות" },
                    { key: "close_rate", label: "% סגירה" },
                    { key: "total_commission", label: "עמלה" },
                    { key: "total_calls", label: "שיחות" },
                    { key: "total_missed", label: "שלא נענו" },
                    { key: "avg_response", label: "תגובה (דק')" },
                  ].map(col => (
                    <th key={col.key} className="px-3 py-3 text-right cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort(col.key)}>
                      <span className="flex items-center gap-1">
                        {col.label}
                        {sortKey === col.key && <ArrowUpDown className="w-3 h-3" />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRankings.map((a, idx) => (
                  <tr key={a.agent_id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          idx === 0 ? "bg-amber-500/30 text-amber-300" : idx === 1 ? "bg-gray-400/30 text-gray-300" :
                          idx === 2 ? "bg-orange-600/30 text-orange-300" : "bg-white/10 text-white/40"
                        }`}>{idx + 1}</span>
                        <span className="font-medium">{a.agent_name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-green-400 font-bold">{fmtC(Number(a.total_revenue))}</td>
                    <td className="px-3 py-3">{fmt(Number(a.total_deals))}</td>
                    <td className="px-3 py-3">{fmt(Number(a.total_leads))}</td>
                    <td className="px-3 py-3">{fmt(Number(a.total_meetings))}</td>
                    <td className="px-3 py-3">{fmt(Number(a.total_quotes))}</td>
                    <td className="px-3 py-3">
                      <span className={`${Number(a.close_rate) > 30 ? "text-green-400" : Number(a.close_rate) > 15 ? "text-amber-400" : "text-red-400"}`}>
                        {pct(Number(a.close_rate))}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-blue-400">{fmtC(Number(a.total_commission))}</td>
                    <td className="px-3 py-3">{fmt(Number(a.total_calls))}</td>
                    <td className="px-3 py-3">
                      <span className={Number(a.total_missed) > 10 ? "text-red-400" : "text-white/60"}>{fmt(Number(a.total_missed))}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={Number(a.avg_response) > 30 ? "text-red-400" : Number(a.avg_response) > 15 ? "text-amber-400" : "text-green-400"}>
                        {a.avg_response}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── COMPARISON TAB ─── */}
      {tab === "comparison" && (
        <div className="space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <h3 className="text-lg font-semibold mb-4">בחר סוכנים להשוואה</h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {rankings.map(a => (
                <button key={a.agent_id} onClick={() => toggleAgent(a.agent_id)}
                  className={`px-3 py-2 rounded-lg text-sm border transition-all ${
                    selectedAgents.includes(a.agent_id)
                      ? "bg-blue-600 border-blue-500 text-white"
                      : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"}`}>
                  {a.agent_name}
                </button>
              ))}
            </div>
            {selectedAgents.length >= 2 && (
              <button onClick={fetchComparison} className="px-4 py-2 bg-blue-600 rounded-lg text-sm hover:bg-blue-700">
                השווה ({selectedAgents.length} סוכנים)
              </button>
            )}
          </div>

          {comparison.length >= 2 && (
            <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 text-white/60">
                    <th className="px-4 py-3 text-right">מדד</th>
                    {comparison.map(a => (
                      <th key={a.agent_id} className="px-4 py-3 text-center">{a.agent_name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "הכנסות", key: "total_revenue", format: (v: number) => fmtC(Number(v)) },
                    { label: "עסקאות", key: "total_deals", format: (v: number) => fmt(Number(v)) },
                    { label: "לידים", key: "total_leads", format: (v: number) => fmt(Number(v)) },
                    { label: "פגישות", key: "total_meetings", format: (v: number) => fmt(Number(v)) },
                    { label: "הצעות מחיר", key: "total_quotes", format: (v: number) => fmt(Number(v)) },
                    { label: "% סגירה", key: "close_rate", format: (v: number) => pct(Number(v)) },
                    { label: "עמלה", key: "total_commission", format: (v: number) => fmtC(Number(v)) },
                    { label: "תגובה (דק')", key: "avg_response", format: (v: number) => String(v) },
                    { label: "הנחה ממוצעת", key: "avg_discount", format: (v: number) => pct(Number(v)) },
                  ].map(row => {
                    const vals = comparison.map((a: any) => Number(a[row.key]) || 0);
                    const maxVal = Math.max(...vals);
                    return (
                      <tr key={row.key} className="border-t border-white/5">
                        <td className="px-4 py-3 font-medium text-white/70">{row.label}</td>
                        {comparison.map((a: any, i) => {
                          const v = Number(a[row.key]) || 0;
                          const isMax = v === maxVal && maxVal > 0;
                          return (
                            <td key={a.agent_id} className={`px-4 py-3 text-center ${isMax ? "text-green-400 font-bold" : ""}`}>
                              {row.format(v)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── ALERTS TAB ─── */}
      {tab === "alerts" && (
        <div className="space-y-3">
          {alerts.length === 0 ? (
            <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <div className="text-lg font-medium">אין התראות פעילות</div>
              <div className="text-white/40 text-sm mt-1">כל הסוכנים פועלים כמצופה</div>
            </div>
          ) : (
            alerts.map(a => {
              const sev = SEVERITY_MAP[a.severity] || SEVERITY_MAP.info;
              const agent = rankings.find(r => r.agent_id === a.agent_id);
              return (
                <div key={a.id} className={`flex items-start gap-4 p-4 rounded-xl border ${sev.color}`}>
                  <sev.icon className="w-6 h-6 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold">{agent?.agent_name || `סוכן ${a.agent_id}`}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${sev.color}`}>{sev.label}</span>
                      <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full">{ALERT_TYPE_MAP[a.alert_type] || a.alert_type}</span>
                    </div>
                    <div className="text-sm">{a.message}</div>
                    <div className="text-xs opacity-50 mt-1">{new Date(a.created_at).toLocaleString("he-IL")}</div>
                  </div>
                  <button onClick={() => acknowledgeAlert(a.id)}
                    className="px-3 py-2 bg-white/10 rounded-lg text-xs hover:bg-white/20 flex items-center gap-1 flex-shrink-0">
                    <CheckCircle className="w-3 h-3" /> אישור
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
