import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import {
  Cpu, Wifi, WifiOff, AlertTriangle, AlertCircle, Activity, Thermometer,
  Droplets, Gauge, Zap, Weight, Wind, BarChart3, Plus, RefreshCw,
  CheckCircle, XCircle, Bell, Settings, Eye, ChevronDown, Clock,
  Signal, Radio, Power
} from "lucide-react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";

interface Device {
  id: number; device_id: string; name: string; device_type: string;
  location: string; machine_id: string; status: string;
  last_reading: string; config: any; battery_level: number;
}
interface Reading { id: number; device_id: string; value: number; unit: string; timestamp: string; quality: string; }
interface Alert { id: number; device_id: string; device_name: string; rule_id: number; alert_type: string; severity: string; message: string; acknowledged: boolean; acknowledged_by: string; created_at: string; value: number; threshold: number; }
interface Rule { id: number; device_id: string; device_name: string; rule_name: string; condition_type: string; threshold_value: number; threshold_high: number; action: string; enabled: boolean; trigger_count: number; }
interface Dashboard { devices: any; alerts: any; readings: any; rules: any; byType: any[]; topAlerting: any[]; }

const DEVICE_ICONS: Record<string, any> = {
  temperature: Thermometer, humidity: Droplets, vibration: Activity,
  pressure: Gauge, energy: Zap, weight: Weight, flow: Wind, gas: Wind, light: Zap, proximity: Radio
};
const SEVERITY_COLORS: Record<string, string> = { info: "text-blue-400", warning: "text-yellow-400", critical: "text-orange-400", emergency: "text-red-500" };
const STATUS_COLORS: Record<string, string> = { online: "bg-emerald-500", offline: "bg-gray-500", error: "bg-red-500", maintenance: "bg-yellow-500" };
const PIE_COLORS = ["#10B981", "#6B7280", "#EF4444", "#EAB308"];

function formatTime(d: string) { return d ? new Date(d).toLocaleString("he-IL") : "-"; }

export default function IoTSensorHubPage() {
  const [tab, setTab] = useState<"dashboard" | "devices" | "alerts" | "rules">("dashboard");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [showAddRule, setShowAddRule] = useState(false);
  const [newDevice, setNewDevice] = useState({ device_id: "", name: "", device_type: "temperature", location: "", machine_id: "" });
  const [newRule, setNewRule] = useState({ device_id: "", rule_name: "", condition_type: "above", threshold_value: 0, threshold_high: 0, action: "alert" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, devRes, alertRes, ruleRes] = await Promise.all([
        authFetch("/api/iot/dashboard"), authFetch("/api/iot/devices"),
        authFetch("/api/iot/alerts"), authFetch("/api/iot/rules")
      ]);
      setDashboard(await dashRes.json()); setDevices(await devRes.json());
      setAlerts(await alertRes.json()); setRules(await ruleRes.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadReadings = async (deviceId: string) => {
    setSelectedDevice(deviceId);
    try {
      const res = await authFetch(`/api/iot/readings/${deviceId}?from=${new Date(Date.now() - 24 * 3600000).toISOString()}`);
      setReadings(await res.json());
    } catch (e) { console.error(e); }
  };

  const acknowledgeAlert = async (id: number) => {
    await authFetch(`/api/iot/alerts/${id}/acknowledge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acknowledged_by: "user" }) });
    load();
  };

  const addDevice = async () => {
    await authFetch("/api/iot/devices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newDevice) });
    setShowAddDevice(false); setNewDevice({ device_id: "", name: "", device_type: "temperature", location: "", machine_id: "" }); load();
  };

  const addRule = async () => {
    await authFetch("/api/iot/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newRule) });
    setShowAddRule(false); setNewRule({ device_id: "", rule_name: "", condition_type: "above", threshold_value: 0, threshold_high: 0, action: "alert" }); load();
  };

  const d = dashboard;
  const unackAlerts = alerts.filter(a => !a.acknowledged).length;

  const deviceStatusData = d ? [
    { name: "מקוון", value: Number(d.devices?.online || 0), color: "#10B981" },
    { name: "לא מקוון", value: Number(d.devices?.offline || 0), color: "#6B7280" },
    { name: "שגיאה", value: Number(d.devices?.error_count || 0), color: "#EF4444" },
    { name: "תחזוקה", value: Number(d.devices?.maintenance || 0), color: "#EAB308" },
  ].filter(x => x.value > 0) : [];

  const chartData = readings.map(r => ({
    time: new Date(r.timestamp).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
    value: r.value, quality: r.quality
  })).reverse();

  return (
    <div className="min-h-screen bg-background text-foreground p-4 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">IoT & Sensor Hub</h1>
            <p className="text-sm text-muted-foreground">ניהול חיישנים ומכשירי IoT בזמן אמת</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {unackAlerts > 0 && (
            <span className="bg-red-500/20 text-red-400 text-xs px-2 py-1 rounded-full flex items-center gap-1">
              <Bell className="w-3 h-3" /> {unackAlerts} התראות פעילות
            </span>
          )}
          <button onClick={load} className="p-2 rounded-lg bg-card hover:bg-accent transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-card rounded-lg p-1">
        {([["dashboard", "דשבורד", BarChart3], ["devices", "מכשירים", Cpu], ["alerts", "התראות", AlertTriangle], ["rules", "חוקים", Settings]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key as any)} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${tab === key ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* DASHBOARD TAB */}
      {tab === "dashboard" && d && (
        <div className="space-y-4">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              { label: "מכשירים", value: d.devices?.total_devices || 0, icon: Cpu, color: "from-blue-500/20" },
              { label: "מקוונים", value: d.devices?.online || 0, icon: Wifi, color: "from-emerald-500/20" },
              { label: "לא מקוונים", value: d.devices?.offline || 0, icon: WifiOff, color: "from-gray-500/20" },
              { label: "התראות פעילות", value: d.alerts?.unacknowledged || 0, icon: AlertTriangle, color: "from-yellow-500/20" },
              { label: "קריטיות", value: Number(d.alerts?.critical || 0) + Number(d.alerts?.emergencies || 0), icon: AlertCircle, color: "from-red-500/20" },
              { label: "קריאות (שעה)", value: d.readings?.last_hour || 0, icon: Activity, color: "from-cyan-500/20" },
            ].map((kpi, i) => (
              <div key={i} className={`bg-gradient-to-br ${kpi.color} to-transparent border border-border/50 rounded-xl p-3`}>
                <div className="flex items-center gap-2 mb-1">
                  <kpi.icon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{kpi.label}</span>
                </div>
                <div className="text-2xl font-bold">{Number(kpi.value).toLocaleString()}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Device Status Pie */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3">סטטוס מכשירים</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={deviceStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                    {deviceStatusData.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 justify-center mt-2">
                {deviceStatusData.map((e, i) => (
                  <span key={i} className="flex items-center gap-1 text-xs">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: e.color }} /> {e.name}: {e.value}
                  </span>
                ))}
              </div>
            </div>

            {/* By Type */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3">קריאות לפי סוג (שעה אחרונה)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={(d.byType || []).map((t: any) => ({ name: t.device_type, count: Number(t.reading_count), avg: Number(t.avg_value || 0).toFixed(1) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#06B6D4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Top Alerting */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3">מכשירים עם הכי הרבה התראות (24 שעות)</h3>
              <div className="space-y-2">
                {(d.topAlerting || []).slice(0, 8).map((t: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-background/50">
                    <div className="flex items-center gap-2">
                      <Signal className="w-3 h-3 text-muted-foreground" />
                      <span className="text-sm">{t.name || t.device_id}</span>
                    </div>
                    <span className={`text-sm font-mono ${t.max_severity === 'emergency' || t.max_severity === 'critical' ? 'text-red-400' : 'text-yellow-400'}`}>
                      {t.alert_count}
                    </span>
                  </div>
                ))}
                {(!d.topAlerting || d.topAlerting.length === 0) && <p className="text-sm text-muted-foreground text-center py-4">אין התראות ב-24 שעות אחרונות</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DEVICES TAB */}
      {tab === "devices" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">מכשירים ({devices.length})</h3>
            <button onClick={() => setShowAddDevice(true)} className="flex items-center gap-1 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm"><Plus className="w-4 h-4" />הוסף מכשיר</button>
          </div>

          {showAddDevice && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h4 className="font-semibold text-sm">מכשיר חדש</h4>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <input placeholder="מזהה מכשיר" className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={newDevice.device_id} onChange={e => setNewDevice({ ...newDevice, device_id: e.target.value })} />
                <input placeholder="שם" className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={newDevice.name} onChange={e => setNewDevice({ ...newDevice, name: e.target.value })} />
                <select className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={newDevice.device_type} onChange={e => setNewDevice({ ...newDevice, device_type: e.target.value })}>
                  {["temperature", "humidity", "vibration", "pressure", "energy", "weight", "flow"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input placeholder="מיקום" className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={newDevice.location} onChange={e => setNewDevice({ ...newDevice, location: e.target.value })} />
                <input placeholder="מכונה" className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={newDevice.machine_id} onChange={e => setNewDevice({ ...newDevice, machine_id: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <button onClick={addDevice} className="bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-sm">שמור</button>
                <button onClick={() => setShowAddDevice(false)} className="bg-accent px-4 py-1.5 rounded-lg text-sm">ביטול</button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {devices.map(dev => {
              const Icon = DEVICE_ICONS[dev.device_type] || Cpu;
              return (
                <div key={dev.id} onClick={() => loadReadings(dev.device_id)} className={`bg-card border rounded-xl p-4 cursor-pointer hover:border-primary/50 transition-colors ${selectedDevice === dev.device_id ? "border-primary" : "border-border"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon className="w-5 h-5 text-cyan-400" />
                      <span className="font-medium text-sm">{dev.name}</span>
                    </div>
                    <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[dev.status]}`} />
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                    <span>סוג: {dev.device_type}</span>
                    <span>מיקום: {dev.location || "-"}</span>
                    <span>מכונה: {dev.machine_id || "-"}</span>
                    <span>סטטוס: {dev.status}</span>
                  </div>
                  {dev.battery_level != null && (
                    <div className="mt-2 flex items-center gap-1 text-xs">
                      <Power className="w-3 h-3" /> סוללה: {dev.battery_level}%
                    </div>
                  )}
                  <div className="mt-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3 inline mr-1" /> קריאה אחרונה: {formatTime(dev.last_reading)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Reading Chart */}
          {selectedDevice && chartData.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3">קריאות - {selectedDevice} (24 שעות)</h3>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="value" stroke="#06B6D4" fill="#06B6D4" fillOpacity={0.15} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ALERTS TAB */}
      {tab === "alerts" && (
        <div className="space-y-3">
          <h3 className="font-semibold">התראות ({alerts.length})</h3>
          <div className="space-y-2">
            {alerts.map(a => (
              <div key={a.id} className={`bg-card border rounded-xl p-3 flex items-center justify-between ${a.acknowledged ? "border-border opacity-60" : "border-yellow-500/30"}`}>
                <div className="flex items-center gap-3">
                  <AlertCircle className={`w-5 h-5 ${SEVERITY_COLORS[a.severity]}`} />
                  <div>
                    <div className="text-sm font-medium">{a.message}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>{a.device_name || a.device_id}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${a.severity === "emergency" ? "bg-red-500/20 text-red-400" : a.severity === "critical" ? "bg-orange-500/20 text-orange-400" : a.severity === "warning" ? "bg-yellow-500/20 text-yellow-400" : "bg-blue-500/20 text-blue-400"}`}>{a.severity}</span>
                      <span>{formatTime(a.created_at)}</span>
                    </div>
                  </div>
                </div>
                {!a.acknowledged && (
                  <button onClick={() => acknowledgeAlert(a.id)} className="text-xs bg-primary/20 text-primary px-3 py-1 rounded-lg hover:bg-primary/30 transition-colors">
                    <CheckCircle className="w-3 h-3 inline mr-1" /> אשר
                  </button>
                )}
              </div>
            ))}
            {alerts.length === 0 && <p className="text-center text-muted-foreground py-8">אין התראות</p>}
          </div>
        </div>
      )}

      {/* RULES TAB */}
      {tab === "rules" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">חוקי התראה ({rules.length})</h3>
            <button onClick={() => setShowAddRule(true)} className="flex items-center gap-1 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm"><Plus className="w-4 h-4" />הוסף חוק</button>
          </div>

          {showAddRule && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h4 className="font-semibold text-sm">חוק חדש</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <select className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={newRule.device_id} onChange={e => setNewRule({ ...newRule, device_id: e.target.value })}>
                  <option value="">בחר מכשיר</option>
                  {devices.map(d => <option key={d.device_id} value={d.device_id}>{d.name}</option>)}
                </select>
                <input placeholder="שם חוק" className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={newRule.rule_name} onChange={e => setNewRule({ ...newRule, rule_name: e.target.value })} />
                <select className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={newRule.condition_type} onChange={e => setNewRule({ ...newRule, condition_type: e.target.value })}>
                  {["above", "below", "range", "rate_of_change", "anomaly"].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="number" placeholder="סף" className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={newRule.threshold_value} onChange={e => setNewRule({ ...newRule, threshold_value: Number(e.target.value) })} />
                <input type="number" placeholder="סף עליון" className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={newRule.threshold_high} onChange={e => setNewRule({ ...newRule, threshold_high: Number(e.target.value) })} />
                <select className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={newRule.action} onChange={e => setNewRule({ ...newRule, action: e.target.value })}>
                  {["alert", "stop_machine", "notify", "log", "escalate"].map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={addRule} className="bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-sm">שמור</button>
                <button onClick={() => setShowAddRule(false)} className="bg-accent px-4 py-1.5 rounded-lg text-sm">ביטול</button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-right">
                  <th className="px-3 py-2">מכשיר</th><th className="px-3 py-2">שם חוק</th><th className="px-3 py-2">תנאי</th>
                  <th className="px-3 py-2">סף</th><th className="px-3 py-2">פעולה</th><th className="px-3 py-2">הפעלות</th><th className="px-3 py-2">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(r => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-accent/50">
                    <td className="px-3 py-2">{r.device_name || r.device_id}</td>
                    <td className="px-3 py-2 font-medium">{r.rule_name}</td>
                    <td className="px-3 py-2">{r.condition_type}</td>
                    <td className="px-3 py-2 font-mono">{r.threshold_value}{r.threshold_high ? ` - ${r.threshold_high}` : ""}</td>
                    <td className="px-3 py-2"><span className="px-2 py-0.5 rounded bg-accent text-xs">{r.action}</span></td>
                    <td className="px-3 py-2 font-mono">{r.trigger_count}</td>
                    <td className="px-3 py-2">{r.enabled ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
