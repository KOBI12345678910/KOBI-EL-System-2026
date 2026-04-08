import { useState, useEffect } from "react";
  import { motion } from "framer-motion";
  import { Settings, Zap, FileText, Shield, BarChart3, Loader2, RefreshCw, Play, CheckCircle2, Clock, AlertTriangle, TrendingUp, Users, Activity, Brain, Target } from "lucide-react";
  import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
  import { LoadingOverlay } from "@/components/ui/unified-states";

  const API = "/api";
  const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

  const TABS = [
    { id: "dashboard", label: "דשבורד", icon: BarChart3 },
    { id: "settings", label: "הגדרות", icon: Settings },
    { id: "triggers", label: "טריגרים", icon: Zap },
    { id: "logs", label: "יומן פעולות", icon: FileText },
    { id: "permissions", label: "הרשאות", icon: Shield },
  ];

  export default function AIQuotationAssistantPage() {
    const [tab, setTab] = useState("dashboard");
    const [settings, setSettings] = useState<any>({});
    const [triggers, setTriggers] = useState<any[]>([]);
    const [logs, setLogs] = useState<any[]>([]);
    const [permissions, setPermissions] = useState<any>({});
    const [metrics, setMetrics] = useState<any>({});
    const [linked, setLinked] = useState<any>({});
    const [moduleInfo, setModuleInfo] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const token = localStorage.getItem("erp_token") || "";
    const headers: any = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const MOD = "quotation-assistant";

    const load = async () => {
      setLoading(true);
      try {
        const [sR, tR, lR, pR, mR, liR] = await Promise.all([
          fetch(`${API}/ai-ops/modules/${MOD}/settings`, { headers }),
          fetch(`${API}/ai-ops/modules/${MOD}/triggers`, { headers }),
          fetch(`${API}/ai-ops/modules/${MOD}/action-logs`, { headers }),
          fetch(`${API}/ai-ops/modules/${MOD}/permissions`, { headers }),
          fetch(`${API}/ai-ops/modules/${MOD}/metrics`, { headers }),
          fetch(`${API}/ai-ops/modules/${MOD}/linked-entities`, { headers }),
        ]);
        const [sD, tD, lD, pD, mD, liD] = await Promise.all([sR.json(), tR.json(), lR.json(), pR.json(), mR.json(), liR.json()]);
        setSettings(sD.settings || {}); setModuleInfo(sD.module || {});
        setTriggers(Array.isArray(tD) ? tD : []); setLogs(Array.isArray(lD) ? lD : []);
        setPermissions(pD); setMetrics(mD); setLinked(liD);
      } catch {}
      setLoading(false);
    };
    useEffect(() => { load(); }, []);

    const runNow = async () => {
      setRunning(true);
      try { await fetch(`${API}/ai-ops/modules/${MOD}/run`, { method: "POST", headers, body: JSON.stringify({}) }); await load(); } catch {}
      setRunning(false);
    };

    const updateSetting = (key: string, value: any) => {
      const updated = { ...settings, [key]: value };
      setSettings(updated);
      fetch(`${API}/ai-ops/modules/${MOD}/settings`, { method: "PUT", headers, body: JSON.stringify(updated) });
    };

    const statusColor: any = { success: "text-green-400", warning: "text-amber-400", error: "text-red-400", alert: "text-orange-400" };
    const statusIcon: any = { success: CheckCircle2, warning: AlertTriangle, error: AlertTriangle, alert: AlertTriangle };

    if (loading) return <LoadingOverlay className="min-h-screen bg-gradient-to-br from-[#0a0e1a] to-[#1a1f35]" />;

    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] to-[#1a1f35] text-foreground p-6" dir="rtl">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-l from-indigo-400 to-violet-300 bg-clip-text text-transparent flex items-center gap-3">
                <FileText className="w-8 h-8 text-indigo-400" />
                עוזר הצעות מחיר AI
              </h1>
              <p className="text-muted-foreground mt-1">{moduleInfo.description || "יצירת הצעות מחיר חכמות עם תמחור דינמי"}</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={runNow} disabled={running} className="flex items-center gap-2 px-4 py-2 bg-indigo-600/20 border border-indigo-500/30 rounded-lg hover:opacity-80 transition disabled:opacity-50">
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} הרצה ידנית
              </button>
              <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 border border-blue-500/30 rounded-lg hover:bg-blue-600/30 transition">
                <RefreshCw className="w-4 h-4" /> רענון
              </button>
            </div>
          </div>

          <div className="flex gap-2 border-b border-white/10 pb-2">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition ${tab === t.id ? "bg-card/10 text-foreground border-b-2 border-purple-400" : "text-muted-foreground hover:text-foreground"}`}>
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            ))}
          </div>

          {tab === "dashboard" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "הצעות שנוצרו", value: fmt(metrics?.dailyMetrics?.reduce((s: number, d: any) => s + (d.actionsGenerated || 0), 0) || 87), icon: FileText, color: "from-indigo-500/20 to-indigo-600/10", text: "text-indigo-400" },
                { label: "שיעור אישור", value: "64%", icon: CheckCircle2, color: "from-green-500/20 to-green-600/10", text: "text-green-400" },
                { label: "סכום ממוצע", value: "₪45,200", icon: TrendingUp, color: "from-blue-500/20 to-blue-600/10", text: "text-blue-400" },
                { label: "חיסכון ממוצע", value: "8.5%", icon: Target, color: "from-amber-500/20 to-amber-600/10", text: "text-amber-400" },
                ].map((kpi, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    className={`bg-gradient-to-br ${kpi.color} border border-white/10 rounded-xl p-5`}>
                    <div className="flex items-center justify-between">
                      <div><p className="text-sm text-muted-foreground">{kpi.label}</p><p className={`text-2xl font-bold ${kpi.text} mt-1`}>{kpi.value}</p></div>
                      <kpi.icon className={`w-8 h-8 ${kpi.text} opacity-60`} />
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-card/5 border border-white/10 rounded-xl p-5">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Activity className="w-5 h-5 text-indigo-400" /> ביצועים יומיים (30 יום)</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={metrics?.dailyMetrics || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="date" tick={{ fill: "#999", fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fill: "#999" }} />
                      <Tooltip contentStyle={{ background: "#1a1f35", border: "1px solid #333", borderRadius: 8, direction: "rtl" }} />
                      <Line type="monotone" dataKey="runs" stroke="#8b5cf6" name="הרצות" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="actionsGenerated" stroke="#22c55e" name="פעולות" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="alertsTriggered" stroke="#ef4444" name="התראות" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="bg-card/5 border border-white/10 rounded-xl p-5">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-green-400" /> ישויות מקושרות</h3>
                  <div className="space-y-3">
                    {(linked?.linkedEntities || []).map((entity: string) => (
                      <div key={entity} className="flex items-center justify-between bg-card/5 rounded-lg p-3">
                        <span className="text-gray-300">{{"quotations":"הצעות מחיר","products":"מוצרים","customers":"לקוחות","price_lists":"מחירונים"}[entity] || entity}</span>
                        <span className="text-lg font-bold text-blue-400">{fmt(linked?.entityCounts?.[entity] || 0)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                    <p className="text-sm text-purple-300 font-semibold">קלטים:</p>
                    <p className="text-xs text-muted-foreground mt-1">{(linked?.inputs || []).join(" • ")}</p>
                    <p className="text-sm text-green-300 font-semibold mt-2">פלטים:</p>
                    <p className="text-xs text-muted-foreground mt-1">{(linked?.outputs || []).join(" • ")}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "settings" && (
            <div className="bg-card/5 border border-white/10 rounded-xl p-6 space-y-6">
              <h3 className="text-lg font-semibold flex items-center gap-2"><Settings className="w-5 h-5 text-blue-400" /> הגדרות מודול</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3 bg-card/5 rounded-lg">
                  <span>מודול פעיל</span>
                  <button onClick={() => updateSetting("enabled", !settings.enabled)} className={`w-12 h-6 rounded-full transition ${settings.enabled ? "bg-green-500" : "bg-muted"} relative`}>
                    <span className={`absolute top-0.5 w-5 h-5 bg-card rounded-full transition ${settings.enabled ? "right-0.5" : "left-0.5"}`} />
                  </button>
                </div>
              <div className="p-3 bg-card/5 rounded-lg">
                  <label className="text-sm text-muted-foreground">מודל AI</label>
                  <select value={settings.model || "gpt-4o"} onChange={e => updateSetting("model", e.target.value)}
                    className="w-full mt-1 bg-card/10 border border-white/20 rounded-lg px-3 py-2 text-foreground">
                    <option value="gpt-4o">gpt-4o</option>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="claude-3.5-sonnet">claude-3.5-sonnet</option>
                  </select>
                </div>
              <div className="p-3 bg-card/5 rounded-lg">
                  <label className="text-sm text-muted-foreground">מרווח ברירת מחדל (%)</label>
                  <input type="number" value={settings.defaultMargin || 0} onChange={e => updateSetting("defaultMargin", parseFloat(e.target.value))}
                    className="w-full mt-1 bg-card/10 border border-white/20 rounded-lg px-3 py-2 text-foreground" />
                </div>
              <div className="flex items-center justify-between p-3 bg-card/5 rounded-lg">
                  <span>תמחור דינמי</span>
                  <button onClick={() => updateSetting("dynamicPricing", !settings.dynamicPricing)} className={`w-12 h-6 rounded-full transition ${settings.dynamicPricing ? "bg-green-500" : "bg-muted"} relative`}>
                    <span className={`absolute top-0.5 w-5 h-5 bg-card rounded-full transition ${settings.dynamicPricing ? "right-0.5" : "left-0.5"}`} />
                  </button>
                </div>
              <div className="flex items-center justify-between p-3 bg-card/5 rounded-lg">
                  <span>הנחה אוטומטית</span>
                  <button onClick={() => updateSetting("autoDiscount", !settings.autoDiscount)} className={`w-12 h-6 rounded-full transition ${settings.autoDiscount ? "bg-green-500" : "bg-muted"} relative`}>
                    <span className={`absolute top-0.5 w-5 h-5 bg-card rounded-full transition ${settings.autoDiscount ? "right-0.5" : "left-0.5"}`} />
                  </button>
                </div>
              <div className="p-3 bg-card/5 rounded-lg">
                  <label className="text-sm text-muted-foreground">הנחה מקסימלית (%)</label>
                  <input type="number" value={settings.maxDiscount || 0} onChange={e => updateSetting("maxDiscount", parseFloat(e.target.value))}
                    className="w-full mt-1 bg-card/10 border border-white/20 rounded-lg px-3 py-2 text-foreground" />
                </div>
              <div className="flex items-center justify-between p-3 bg-card/5 rounded-lg">
                  <span>הצג חלופות</span>
                  <button onClick={() => updateSetting("includeAlternatives", !settings.includeAlternatives)} className={`w-12 h-6 rounded-full transition ${settings.includeAlternatives ? "bg-green-500" : "bg-muted"} relative`}>
                    <span className={`absolute top-0.5 w-5 h-5 bg-card rounded-full transition ${settings.includeAlternatives ? "right-0.5" : "left-0.5"}`} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === "triggers" && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2"><Zap className="w-5 h-5 text-amber-400" /> טריגרים ({triggers.length})</h3>
              {triggers.map((t: any) => (
                <motion.div key={t.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="bg-card/5 border border-white/10 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className={`w-2.5 h-2.5 rounded-full ${t.enabled ? "bg-green-400" : "bg-muted"}`} />
                      <span className="font-semibold">{t.name}</span>
                      <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">{t.event}</span>
                    </div>
                    {t.condition && <p className="text-sm text-muted-foreground mt-1 mr-5">תנאי: {t.condition}</p>}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>פעולה: {t.action}</span>
                      <span>הופעל {t.triggerCount} פעמים</span>
                      {t.lastTriggered && <span>אחרון: {new Date(t.lastTriggered).toLocaleDateString("he-IL")}</span>}
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs ${t.enabled ? "bg-green-500/20 text-green-400" : "bg-muted/20 text-muted-foreground"}`}>
                    {t.enabled ? "פעיל" : "מושבת"}
                  </span>
                </motion.div>
              ))}
            </div>
          )}

          {tab === "logs" && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2"><FileText className="w-5 h-5 text-green-400" /> יומן פעולות ({logs.length})</h3>
              <div className="bg-card/5 border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-white/10 text-muted-foreground">
                    <th className="p-3 text-right">זמן</th><th className="p-3 text-right">סוג</th><th className="p-3 text-right">תיאור</th>
                    <th className="p-3 text-right">סטטוס</th><th className="p-3 text-right">ביטחון</th><th className="p-3 text-right">משך</th>
                  </tr></thead>
                  <tbody>
                    {logs.map((log: any) => {
                      const SIcon = statusIcon[log.status] || CheckCircle2;
                      return (
                        <tr key={log.id} className="border-b border-white/5 hover:bg-card/5">
                          <td className="p-3 text-muted-foreground text-xs">{new Date(log.created_at).toLocaleString("he-IL")}</td>
                          <td className="p-3"><span className="bg-card/10 px-2 py-0.5 rounded text-xs">{log.action_type}</span></td>
                          <td className="p-3">{log.action_description}</td>
                          <td className="p-3"><SIcon className={`w-4 h-4 ${statusColor[log.status] || "text-muted-foreground"}`} /></td>
                          <td className="p-3 text-blue-400">{log.confidence ? `${log.confidence}%` : "—"}</td>
                          <td className="p-3 text-muted-foreground">{log.duration_ms ? `${log.duration_ms}ms` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "permissions" && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2"><Shield className="w-5 h-5 text-red-400" /> הרשאות גישה</h3>
              <div className="bg-card/5 border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-white/10 text-muted-foreground">
                    <th className="p-3 text-right">תפקיד</th><th className="p-3 text-center">צפייה</th><th className="p-3 text-center">הגדרה</th>
                    <th className="p-3 text-center">הרצה</th><th className="p-3 text-center">מחיקה</th>
                  </tr></thead>
                  <tbody>
                    {(permissions?.roles || []).map((r: any) => (
                      <tr key={r.role} className="border-b border-white/5">
                        <td className="p-3 font-semibold">{r.role === "admin" ? "מנהל מערכת" : r.role === "manager" ? "מנהל" : r.role === "user" ? "משתמש" : "צופה"}</td>
                        <td className="p-3 text-center">{r.canView ? <CheckCircle2 className="w-4 h-4 text-green-400 mx-auto" /> : <span className="text-muted-foreground">—</span>}</td>
                        <td className="p-3 text-center">{r.canConfigure ? <CheckCircle2 className="w-4 h-4 text-green-400 mx-auto" /> : <span className="text-muted-foreground">—</span>}</td>
                        <td className="p-3 text-center">{r.canRun ? <CheckCircle2 className="w-4 h-4 text-green-400 mx-auto" /> : <span className="text-muted-foreground">—</span>}</td>
                        <td className="p-3 text-center">{r.canDelete ? <CheckCircle2 className="w-4 h-4 text-green-400 mx-auto" /> : <span className="text-muted-foreground">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
  