import { useState, useEffect } from "react";
import {
  Shield, AlertTriangle, Search, Plus, Edit2, Trash2, X, Save, Eye, Play,
  CheckCircle2, XCircle, Clock, UserCheck, Zap, FileWarning, BarChart3, TrendingUp
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : [];
const fmtCurrency = (v: any) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(Number(v || 0));

const severityMap: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: "קריטי", color: "text-red-400", bg: "bg-red-500/20 text-red-400 border-red-500/30" },
  high: { label: "גבוה", color: "text-orange-400", bg: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  medium: { label: "בינוני", color: "text-yellow-400", bg: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  low: { label: "נמוך", color: "text-green-400", bg: "bg-green-500/20 text-green-400 border-green-500/30" },
};

const statusMap: Record<string, { label: string; color: string; icon: any }> = {
  open: { label: "פתוח", color: "bg-blue-500/20 text-blue-400", icon: Clock },
  investigating: { label: "בחקירה", color: "bg-yellow-500/20 text-yellow-400", icon: Search },
  confirmed: { label: "מאושר", color: "bg-red-500/20 text-red-400", icon: AlertTriangle },
  dismissed: { label: "נדחה", color: "bg-gray-500/20 text-gray-400", icon: XCircle },
};

const ruleTypeMap: Record<string, string> = {
  discount_abuse: "ניצול הנחות",
  price_manipulation: "מניפולציית מחיר",
  measurement_mismatch: "אי-התאמת מדידה",
  expense_anomaly: "חריגת הוצאות",
  ghost_employee: "עובד רפאים",
  duplicate_invoice: "חשבונית כפולה",
  unusual_hours: "שעות חריגות",
  location_fraud: "הונאת מיקום",
};

const conclusionMap: Record<string, { label: string; color: string }> = {
  fraud_confirmed: { label: "הונאה מאושרת", color: "text-red-400" },
  false_positive: { label: "התראת שווא", color: "text-green-400" },
  inconclusive: { label: "לא חד-משמעי", color: "text-yellow-400" },
};

export default function FraudDetectionPage() {
  const [tab, setTab] = useState<"dashboard" | "alerts" | "rules" | "investigations">("dashboard");
  const [dashboard, setDashboard] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [investigations, setInvestigations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [search, setSearch] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"rule" | "investigation">("rule");
  const [form, setForm] = useState<any>({});
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [viewAlert, setViewAlert] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [dash, al, ru, inv] = await Promise.all([
        authFetch(`${API}/fraud/dashboard`).then(r => r.json()).catch(() => null),
        authFetch(`${API}/fraud/alerts`).then(r => r.json()).catch(() => []),
        authFetch(`${API}/fraud/rules`).then(r => r.json()).catch(() => []),
        authFetch(`${API}/fraud/investigations`).then(r => r.json()).catch(() => []),
      ]);
      setDashboard(dash); setAlerts(safeArray(al)); setRules(safeArray(ru)); setInvestigations(safeArray(inv));
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runScan = async () => {
    setScanning(true);
    try {
      await authFetch(`${API}/fraud/scan`, { method: "POST" });
      load();
    } catch {}
    setScanning(false);
  };

  const investigate = async (alertId: number) => {
    await authFetch(`${API}/fraud/alerts/${alertId}/investigate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assigned_to: "admin" }) });
    load();
  };

  const dismiss = async (alertId: number) => {
    await authFetch(`${API}/fraud/alerts/${alertId}/dismiss`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "נדחה ידנית" }) });
    load();
  };

  const openForm = (type: "rule" | "investigation", item?: any) => {
    setFormType(type); setForm(item ? { ...item } : {}); setEditing(item || null); setShowForm(true);
  };

  const saveForm = async () => {
    setSaving(true);
    try {
      const endpoints: Record<string, string> = { rule: "fraud/rules", investigation: "fraud/investigations" };
      const url = `${API}/${endpoints[formType]}${editing ? `/${editing.id}` : ""}`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); setForm({}); setEditing(null); load();
    } catch {}
    setSaving(false);
  };

  const delRule = async (id: number) => {
    await authFetch(`${API}/fraud/rules/${id}`, { method: "DELETE" });
    load();
  };

  const filteredAlerts = alerts.filter(a => {
    if (filterSeverity !== "all" && a.severity !== filterSeverity) return false;
    if (filterStatus !== "all" && a.status !== filterStatus) return false;
    if (search && !JSON.stringify(a).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const tabs = [
    { key: "dashboard", label: "דשבורד", icon: BarChart3 },
    { key: "alerts", label: "התראות", icon: AlertTriangle },
    { key: "rules", label: "כללים", icon: Shield },
    { key: "investigations", label: "חקירות", icon: Search },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Shield className="w-7 h-7 text-red-400" /> זיהוי הונאות וחריגות</h1>
          <p className="text-sm text-muted-foreground mt-1">מנוע זיהוי אנומליות, ניהול התראות וחקירות</p>
        </div>
        <div className="flex gap-2">
          <button onClick={runScan} disabled={scanning} className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm">
            <Zap className="w-4 h-4" />{scanning ? "סורק..." : "הפעל סריקה"}
          </button>
        </div>
      </div>

      <div className="flex gap-1 bg-[#1a1a2e] rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? "bg-red-500/20 text-red-400" : "text-gray-400 hover:text-white"}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-20 text-gray-400">טוען נתונים...</div>}

      {/* DASHBOARD */}
      {!loading && tab === "dashboard" && dashboard && (
        <div className="space-y-6">
          {/* Severity Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "קריטי", value: dashboard.critical_count, color: "text-red-400", border: "border-red-500/30", icon: AlertTriangle },
              { label: "גבוה", value: dashboard.high_count, color: "text-orange-400", border: "border-orange-500/30", icon: FileWarning },
              { label: "בינוני", value: dashboard.medium_count, color: "text-yellow-400", border: "border-yellow-500/30", icon: Clock },
              { label: "נמוך", value: dashboard.low_count, color: "text-green-400", border: "border-green-500/30", icon: CheckCircle2 },
            ].map((s, i) => (
              <Card key={i} className={`bg-[#1a1a2e] ${s.border} border`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2"><span className="text-xs text-muted-foreground">{s.label}</span><s.icon className={`w-5 h-5 ${s.color}`} /></div>
                  <div className={`text-3xl font-bold ${s.color}`}>{Number(s.value || 0)}</div>
                  <p className="text-xs text-gray-500 mt-1">התראות פתוחות</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "כללים פעילים", value: dashboard.active_rules, icon: Shield, color: "text-cyan-400" },
              { label: "בחקירה", value: dashboard.investigating_alerts, icon: Search, color: "text-yellow-400" },
              { label: "הונאות מאושרות", value: dashboard.confirmed_alerts, icon: AlertTriangle, color: "text-red-400" },
              { label: "השפעה כספית", value: fmtCurrency(dashboard.total_fraud_impact), icon: TrendingUp, color: "text-red-400" },
            ].map((s, i) => (
              <Card key={i} className="bg-[#1a1a2e] border-white/10">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2"><span className="text-xs text-muted-foreground">{s.label}</span><s.icon className={`w-5 h-5 ${s.color}`} /></div>
                  <div className="text-xl font-bold text-white">{s.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Recent Alerts */}
          <Card className="bg-[#1a1a2e] border-white/10">
            <CardHeader><CardTitle className="text-white text-lg">התראות אחרונות</CardTitle></CardHeader>
            <CardContent>
              {safeArray(dashboard.recentAlerts).length === 0 ? <p className="text-gray-500 text-sm">אין התראות פתוחות</p> : (
                <div className="space-y-2">
                  {safeArray(dashboard.recentAlerts).slice(0, 8).map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between bg-[#0d0d1a] rounded-lg p-3 hover:bg-white/5 cursor-pointer" onClick={() => setViewAlert(a)}>
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-8 rounded-full ${a.severity === 'critical' ? 'bg-red-500' : a.severity === 'high' ? 'bg-orange-500' : a.severity === 'medium' ? 'bg-yellow-500' : 'bg-green-500'}`} />
                        <div>
                          <p className="text-sm text-white">{a.description}</p>
                          <p className="text-xs text-gray-500">{a.rule_name} | {a.entity_name || "—"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={severityMap[a.severity]?.bg || ""}>{severityMap[a.severity]?.label || a.severity}</Badge>
                        <Badge className={statusMap[a.status]?.color || ""}>{statusMap[a.status]?.label || a.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rule Stats */}
          <Card className="bg-[#1a1a2e] border-white/10">
            <CardHeader><CardTitle className="text-white text-lg">סטטיסטיקות לפי כלל</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {safeArray(dashboard.ruleStats).map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between bg-[#0d0d1a] rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <Shield className={`w-4 h-4 ${r.enabled ? severityMap[r.severity]?.color : 'text-gray-600'}`} />
                      <div>
                        <p className="text-sm text-white">{r.rule_name}</p>
                        <p className="text-xs text-gray-500">{ruleTypeMap[r.rule_type] || r.rule_type}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-gray-400">{r.alert_count} התראות</span>
                      {Number(r.confirmed_count) > 0 && <Badge className="bg-red-500/20 text-red-400">{r.confirmed_count} מאושרות</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ALERTS TAB */}
      {!loading && tab === "alerts" && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input className="bg-[#1a1a2e] border border-white/10 rounded-lg pr-9 pl-3 py-2 text-sm text-white w-64" placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}>
              <option value="all">כל החומרות</option><option value="critical">קריטי</option><option value="high">גבוה</option><option value="medium">בינוני</option><option value="low">נמוך</option>
            </select>
            <select className="bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">כל הסטטוסים</option><option value="open">פתוח</option><option value="investigating">בחקירה</option><option value="confirmed">מאושר</option><option value="dismissed">נדחה</option>
            </select>
          </div>

          <Card className="bg-[#1a1a2e] border-white/10">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/10 text-gray-400">
                  <th className="p-3 text-right w-8"></th><th className="p-3 text-right">תיאור</th><th className="p-3 text-right">כלל</th><th className="p-3 text-right">ישות</th><th className="p-3 text-right">חומרה</th><th className="p-3 text-right">סטטוס</th><th className="p-3 text-right">תאריך</th><th className="p-3"></th>
                </tr></thead>
                <tbody>
                  {filteredAlerts.map(a => (
                    <tr key={a.id} className="border-b border-white/5 hover:bg-white/5 cursor-pointer" onClick={() => setViewAlert(a)}>
                      <td className="p-3"><div className={`w-2 h-6 rounded-full ${a.severity === 'critical' ? 'bg-red-500' : a.severity === 'high' ? 'bg-orange-500' : a.severity === 'medium' ? 'bg-yellow-500' : 'bg-green-500'}`} /></td>
                      <td className="p-3 text-white max-w-xs truncate">{a.description}</td>
                      <td className="p-3 text-gray-400 text-xs">{a.rule_name}</td>
                      <td className="p-3 text-gray-400">{a.entity_name || "—"}</td>
                      <td className="p-3"><Badge className={severityMap[a.severity]?.bg || ""}>{severityMap[a.severity]?.label}</Badge></td>
                      <td className="p-3"><Badge className={statusMap[a.status]?.color || ""}>{statusMap[a.status]?.label}</Badge></td>
                      <td className="p-3 text-gray-400 text-xs">{a.created_at ? new Date(a.created_at).toLocaleDateString("he-IL") : "—"}</td>
                      <td className="p-3" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1">
                          {a.status === "open" && (
                            <>
                              <button onClick={() => investigate(a.id)} className="text-xs bg-yellow-600/20 text-yellow-400 px-2 py-1 rounded hover:bg-yellow-600/30">חקור</button>
                              <button onClick={() => dismiss(a.id)} className="text-xs bg-gray-600/20 text-gray-400 px-2 py-1 rounded hover:bg-gray-600/30">דחה</button>
                            </>
                          )}
                          {a.status === "investigating" && (
                            <button onClick={() => { openForm("investigation"); setForm({ alert_id: a.id }); }} className="text-xs bg-blue-600/20 text-blue-400 px-2 py-1 rounded hover:bg-blue-600/30">סיים חקירה</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredAlerts.length === 0 && <p className="text-center text-gray-500 py-8">אין התראות</p>}
            </CardContent>
          </Card>
        </div>
      )}

      {/* RULES TAB */}
      {!loading && tab === "rules" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => openForm("rule")} className="flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm"><Plus className="w-4 h-4" />הוסף כלל</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rules.map(r => (
              <Card key={r.id} className={`bg-[#1a1a2e] border ${r.enabled ? 'border-white/10' : 'border-white/5 opacity-60'}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-white font-semibold">{r.rule_name}</h3>
                      <p className="text-xs text-gray-500">{ruleTypeMap[r.rule_type] || r.rule_type}</p>
                    </div>
                    <div className="flex gap-1">
                      <Badge className={severityMap[r.severity]?.bg || ""}>{severityMap[r.severity]?.label}</Badge>
                      <button onClick={() => openForm("rule", r)} className="p-1 text-gray-400 hover:text-cyan-400"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => delRule(r.id)} className="p-1 text-gray-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={r.enabled ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}>{r.enabled ? "פעיל" : "מושבת"}</Badge>
                    {r.condition && <span className="text-xs text-gray-500">תנאים: {JSON.stringify(r.condition)}</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* INVESTIGATIONS TAB */}
      {!loading && tab === "investigations" && (
        <div className="space-y-4">
          <Card className="bg-[#1a1a2e] border-white/10">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/10 text-gray-400">
                  <th className="p-3 text-right">התראה</th><th className="p-3 text-right">ישות</th><th className="p-3 text-right">ממצאים</th><th className="p-3 text-right">מסקנה</th><th className="p-3 text-right">פעולה</th><th className="p-3 text-right">השפעה כספית</th><th className="p-3 text-right">תאריך</th>
                </tr></thead>
                <tbody>
                  {investigations.map(inv => (
                    <tr key={inv.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="p-3 text-white max-w-xs truncate">{inv.alert_description || `#${inv.alert_id}`}</td>
                      <td className="p-3 text-gray-400">{inv.entity_name || "—"}</td>
                      <td className="p-3 text-gray-400 max-w-xs truncate">{inv.findings || "—"}</td>
                      <td className="p-3">{inv.conclusion ? <span className={conclusionMap[inv.conclusion]?.color || ""}>{conclusionMap[inv.conclusion]?.label || inv.conclusion}</span> : "—"}</td>
                      <td className="p-3 text-gray-400 max-w-xs truncate">{inv.action_taken || "—"}</td>
                      <td className="p-3 text-white font-mono">{Number(inv.financial_impact) > 0 ? fmtCurrency(inv.financial_impact) : "—"}</td>
                      <td className="p-3 text-gray-400 text-xs">{inv.created_at ? new Date(inv.created_at).toLocaleDateString("he-IL") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {investigations.length === 0 && <p className="text-center text-gray-500 py-8">אין חקירות</p>}
            </CardContent>
          </Card>
        </div>
      )}

      {/* VIEW ALERT MODAL */}
      {viewAlert && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setViewAlert(null)}>
          <div className="bg-[#1a1a2e] rounded-2xl border border-white/10 w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <AlertTriangle className={`w-5 h-5 ${severityMap[viewAlert.severity]?.color}`} /> פרטי התראה
              </h2>
              <button onClick={() => setViewAlert(null)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="flex gap-2"><Badge className={severityMap[viewAlert.severity]?.bg || ""}>{severityMap[viewAlert.severity]?.label}</Badge><Badge className={statusMap[viewAlert.status]?.color || ""}>{statusMap[viewAlert.status]?.label}</Badge></div>
              <div><span className="text-gray-400 text-xs block">תיאור:</span><p className="text-sm text-white">{viewAlert.description}</p></div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-400 block text-xs">כלל:</span><span className="text-white">{viewAlert.rule_name || "—"}</span></div>
                <div><span className="text-gray-400 block text-xs">סוג:</span><span className="text-white">{ruleTypeMap[viewAlert.rule_type] || viewAlert.rule_type || "—"}</span></div>
                <div><span className="text-gray-400 block text-xs">ישות:</span><span className="text-white">{viewAlert.entity_name || "—"}</span></div>
                <div><span className="text-gray-400 block text-xs">מוקצה ל:</span><span className="text-white">{viewAlert.assigned_to || "—"}</span></div>
              </div>
              {viewAlert.evidence && Object.keys(viewAlert.evidence).length > 0 && (
                <div><span className="text-gray-400 text-xs block">ראיות:</span><pre className="text-xs text-cyan-400 bg-[#0d0d1a] p-2 rounded-lg overflow-x-auto">{JSON.stringify(viewAlert.evidence, null, 2)}</pre></div>
              )}
              <div className="flex gap-2 pt-2">
                {viewAlert.status === "open" && (
                  <>
                    <button onClick={() => { investigate(viewAlert.id); setViewAlert(null); }} className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white py-2 rounded-lg text-sm flex items-center justify-center gap-1"><Search className="w-4 h-4" />חקור</button>
                    <button onClick={() => { dismiss(viewAlert.id); setViewAlert(null); }} className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg text-sm flex items-center justify-center gap-1"><XCircle className="w-4 h-4" />דחה</button>
                  </>
                )}
                {viewAlert.status === "investigating" && (
                  <button onClick={() => { openForm("investigation"); setForm({ alert_id: viewAlert.id }); setViewAlert(null); }} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm flex items-center justify-center gap-1"><CheckCircle2 className="w-4 h-4" />סיים חקירה</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FORM MODAL */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-[#1a1a2e] rounded-2xl border border-white/10 w-full max-w-lg p-6 space-y-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-white">{formType === "rule" ? (editing ? "עריכת כלל" : "הוספת כלל") : "סיום חקירה"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            {formType === "rule" && (
              <div className="space-y-3">
                <div><label className="text-xs text-gray-400">שם כלל</label><input className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.rule_name || ""} onChange={e => setForm({ ...form, rule_name: e.target.value })} /></div>
                <div><label className="text-xs text-gray-400">סוג</label><select className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.rule_type || ""} onChange={e => setForm({ ...form, rule_type: e.target.value })}><option value="">בחר...</option>{Object.entries(ruleTypeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="text-xs text-gray-400">חומרה</label><select className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.severity || "medium"} onChange={e => setForm({ ...form, severity: e.target.value })}><option value="low">נמוך</option><option value="medium">בינוני</option><option value="high">גבוה</option><option value="critical">קריטי</option></select></div>
                <div className="flex items-center gap-2"><input type="checkbox" checked={form.enabled !== false} onChange={e => setForm({ ...form, enabled: e.target.checked })} /><span className="text-sm text-gray-400">פעיל</span></div>
              </div>
            )}

            {formType === "investigation" && (
              <div className="space-y-3">
                <div><label className="text-xs text-gray-400">ממצאים</label><textarea className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" rows={3} value={form.findings || ""} onChange={e => setForm({ ...form, findings: e.target.value })} /></div>
                <div><label className="text-xs text-gray-400">מסקנה</label><select className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.conclusion || ""} onChange={e => setForm({ ...form, conclusion: e.target.value })}><option value="">בחר...</option><option value="fraud_confirmed">הונאה מאושרת</option><option value="false_positive">התראת שווא</option><option value="inconclusive">לא חד-משמעי</option></select></div>
                <div><label className="text-xs text-gray-400">פעולה שננקטה</label><textarea className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" rows={2} value={form.action_taken || ""} onChange={e => setForm({ ...form, action_taken: e.target.value })} /></div>
                <div><label className="text-xs text-gray-400">השפעה כספית</label><input type="number" className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.financial_impact || ""} onChange={e => setForm({ ...form, financial_impact: Number(e.target.value) })} /></div>
              </div>
            )}

            <button onClick={saveForm} disabled={saving} className="w-full bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
              <Save className="w-4 h-4" />{saving ? "שומר..." : "שמור"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
