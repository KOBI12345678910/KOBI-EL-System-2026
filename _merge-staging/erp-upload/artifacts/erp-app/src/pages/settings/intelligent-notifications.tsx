import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import {
  Bell, BellRing, BellOff, Mail, Phone, MessageCircle, Smartphone,
  Globe, Hash, Send, Settings, Plus, RefreshCw, CheckCircle, XCircle,
  Clock, BarChart3, AlertTriangle, Eye, ChevronDown, Zap, ArrowRight,
  Shield, Users, Layers, Filter, Volume2, VolumeX, Timer, Link2
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";

interface Dashboard { queue: any; channels: any[]; preferences: any; escalations: any; digests: any; }
interface NotifQueue { id: number; recipient_id: string; recipient_name: string; channel: string; module: string; event_type: string; subject: string; body: string; priority: string; status: string; created_at: string; sent_at: string; read_at: string; }
interface Preference { id: number; user_id: string; user_name: string; module: string; event_type: string; channels: string[]; frequency: string; muted_until: string; }
interface EscalationChain { id: number; name: string; description: string; module: string; trigger_event: string; levels: any[]; active: boolean; escalation_count: number; }
interface Channel { id: number; channel_type: string; name: string; status: string; priority: number; daily_quota: number; sent_today: number; }

const CHANNEL_ICONS: Record<string, any> = { in_app: Bell, email: Mail, whatsapp: MessageCircle, sms: Phone, push: Smartphone, teams: Users, slack: Hash, webhook: Link2 };
const CHANNEL_COLORS: Record<string, string> = { in_app: "#3B82F6", email: "#10B981", whatsapp: "#22C55E", sms: "#EAB308", push: "#8B5CF6", teams: "#6366F1", slack: "#EC4899", webhook: "#F97316" };
const PRIORITY_COLORS: Record<string, string> = { urgent: "bg-red-500/20 text-red-400", high: "bg-orange-500/20 text-orange-400", normal: "bg-blue-500/20 text-blue-400", low: "bg-gray-500/20 text-gray-400" };
const STATUS_COLORS: Record<string, string> = { queued: "text-yellow-400", sent: "text-blue-400", delivered: "text-emerald-400", failed: "text-red-400", read: "text-green-400", cancelled: "text-gray-400" };
const FREQ_LABELS: Record<string, string> = { realtime: "מיידי", hourly_digest: "עדכון שעתי", daily_digest: "עדכון יומי", weekly_digest: "עדכון שבועי", never: "כבוי" };

const MODULES = ["sales", "production", "procurement", "finance", "hr", "quality", "projects", "inventory", "system"];
const EVENT_TYPES = ["created", "updated", "approved", "rejected", "overdue", "alert", "completed", "escalated"];

function formatDate(d: string) { return d ? new Date(d).toLocaleString("he-IL") : "-"; }

export default function IntelligentNotificationsPage() {
  const [tab, setTab] = useState<"dashboard" | "queue" | "preferences" | "escalations" | "channels">("dashboard");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [queue, setQueue] = useState<NotifQueue[]>([]);
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [escalations, setEscalations] = useState<EscalationChain[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddEscalation, setShowAddEscalation] = useState(false);
  const [newEscalation, setNewEscalation] = useState({ name: "", module: "system", trigger_event: "overdue", levels: [{ delay_minutes: 30, notify_role: "manager", channel: "in_app" }] });

  // Preference editor
  const [editPref, setEditPref] = useState<{ user_id: string; module: string; event_type: string; channels: string[]; frequency: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, queueRes, escRes, chRes] = await Promise.all([
        authFetch("/api/smart-notifications/dashboard"),
        authFetch("/api/smart-notifications/queue"),
        authFetch("/api/smart-notifications/escalation-chains"),
        authFetch("/api/smart-notifications/channels")
      ]);
      setDashboard(await dashRes.json()); setQueue(await queueRes.json());
      setEscalations(await escRes.json()); setChannels(await chRes.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadPreferences = async (userId: string) => {
    try {
      const res = await authFetch(`/api/smart-notifications/preferences/${userId}`);
      setPreferences(await res.json());
    } catch (e) { console.error(e); }
  };

  const savePreference = async () => {
    if (!editPref) return;
    await authFetch("/api/smart-notifications/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editPref) });
    setEditPref(null);
    if (editPref.user_id) loadPreferences(editPref.user_id);
  };

  const addEscalation = async () => {
    await authFetch("/api/smart-notifications/escalation-chains", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newEscalation) });
    setShowAddEscalation(false);
    setNewEscalation({ name: "", module: "system", trigger_event: "overdue", levels: [{ delay_minutes: 30, notify_role: "manager", channel: "in_app" }] });
    load();
  };

  const markRead = async (ids: number[]) => {
    await authFetch("/api/smart-notifications/mark-read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
    load();
  };

  const d = dashboard;

  const channelDistData = (d?.channels || []).map(c => ({
    name: c.channel,
    value: Number(c.count),
    color: CHANNEL_COLORS[c.channel] || "#6B7280"
  }));

  return (
    <div className="min-h-screen bg-background text-foreground p-4 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <BellRing className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">מרכז התראות חכם</h1>
            <p className="text-sm text-muted-foreground">Intelligent Notification & Communication Hub</p>
          </div>
        </div>
        <button onClick={load} className="p-2 rounded-lg bg-card hover:bg-accent transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-card rounded-lg p-1 overflow-x-auto">
        {([["dashboard", "דשבורד", BarChart3], ["queue", "תור הודעות", Send], ["preferences", "העדפות", Settings], ["escalations", "שרשראות הסלמה", ArrowRight], ["channels", "ערוצים", Layers]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key as any)} className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm whitespace-nowrap transition-colors ${tab === key ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* DASHBOARD */}
      {tab === "dashboard" && d && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "סה\"כ התראות", value: d.queue?.total_notifications || 0, icon: Bell, color: "from-blue-500/20" },
              { label: "בתור", value: d.queue?.queued || 0, icon: Clock, color: "from-yellow-500/20" },
              { label: "נשלחו", value: d.queue?.sent || 0, icon: Send, color: "from-emerald-500/20" },
              { label: "נכשלו", value: d.queue?.failed || 0, icon: XCircle, color: "from-red-500/20" },
              { label: "נקראו", value: d.queue?.read_count || 0, icon: Eye, color: "from-purple-500/20" },
            ].map((kpi, i) => (
              <div key={i} className={`bg-gradient-to-br ${kpi.color} to-transparent border border-border/50 rounded-xl p-3`}>
                <div className="flex items-center gap-2 mb-1"><kpi.icon className="w-4 h-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">{kpi.label}</span></div>
                <div className="text-2xl font-bold">{Number(kpi.value).toLocaleString()}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Channel distribution */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3">התפלגות לפי ערוץ</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={channelDistData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                    {channelDistData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 justify-center mt-1">
                {channelDistData.map((e, i) => (
                  <span key={i} className="flex items-center gap-1 text-xs"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: e.color }} />{e.name}: {e.value}</span>
                ))}
              </div>
            </div>

            {/* Summary cards */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold mb-2">סיכום מערכת</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-background rounded-lg p-3"><div className="text-sm text-muted-foreground">משתמשים עם העדפות</div><div className="text-xl font-bold">{d.preferences?.users_with_prefs || 0}</div></div>
                <div className="bg-background rounded-lg p-3"><div className="text-sm text-muted-foreground">כללי התראה</div><div className="text-xl font-bold">{d.preferences?.total_rules || 0}</div></div>
                <div className="bg-background rounded-lg p-3"><div className="text-sm text-muted-foreground">שרשראות הסלמה</div><div className="text-xl font-bold">{d.escalations?.active_chains || 0}</div></div>
                <div className="bg-background rounded-lg p-3"><div className="text-sm text-muted-foreground">דיגסטים (שבוע)</div><div className="text-xl font-bold">{d.digests?.sent_digests || 0}</div></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-background rounded-lg p-3"><div className="text-sm text-muted-foreground">דחופות</div><div className="text-xl font-bold text-red-400">{d.queue?.urgent || 0}</div></div>
                <div className="bg-background rounded-lg p-3"><div className="text-sm text-muted-foreground">שעה אחרונה</div><div className="text-xl font-bold text-cyan-400">{d.queue?.last_hour || 0}</div></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QUEUE TAB */}
      {tab === "queue" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">תור הודעות ({queue.length})</h3>
            {queue.filter(n => n.status === "sent").length > 0 && (
              <button onClick={() => markRead(queue.filter(n => n.status === "sent").map(n => n.id))} className="text-xs bg-primary/20 text-primary px-3 py-1 rounded-lg">
                סמן הכל כנקרא
              </button>
            )}
          </div>
          <div className="space-y-2">
            {queue.map(n => {
              const ChannelIcon = CHANNEL_ICONS[n.channel] || Bell;
              return (
                <div key={n.id} className={`bg-card border rounded-xl p-3 ${n.status === "read" ? "border-border opacity-60" : "border-border"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-3">
                      <ChannelIcon className="w-4 h-4" style={{ color: CHANNEL_COLORS[n.channel] || "#6B7280" }} />
                      <div>
                        <div className="text-sm font-medium">{n.subject}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span>{n.recipient_name || n.recipient_id}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${PRIORITY_COLORS[n.priority]}`}>{n.priority}</span>
                          <span className={STATUS_COLORS[n.status]}>{n.status}</span>
                          <span>{n.module}/{n.event_type}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">{formatDate(n.created_at)}</div>
                  </div>
                  {n.body && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.body}</p>}
                </div>
              );
            })}
            {queue.length === 0 && <p className="text-center text-muted-foreground py-8">התור ריק</p>}
          </div>
        </div>
      )}

      {/* PREFERENCES TAB */}
      {tab === "preferences" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold">מטריצת העדפות</h3>
            <div className="flex items-center gap-2">
              <input placeholder="מזהה משתמש..." className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm" onKeyDown={e => { if (e.key === "Enter") loadPreferences((e.target as HTMLInputElement).value); }} />
            </div>
          </div>

          {/* Preference Matrix */}
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-sm text-muted-foreground mb-3">הזן מזהה משתמש לצפייה וערכית העדפות התראה</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-right">
                    <th className="px-3 py-2">מודול</th><th className="px-3 py-2">אירוע</th><th className="px-3 py-2">ערוצים</th>
                    <th className="px-3 py-2">תדירות</th><th className="px-3 py-2">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {preferences.length > 0 ? preferences.map(p => (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-accent/50">
                      <td className="px-3 py-2">{p.module}</td>
                      <td className="px-3 py-2">{p.event_type}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          {(Array.isArray(p.channels) ? p.channels : []).map((ch, i) => {
                            const Icon = CHANNEL_ICONS[ch] || Bell;
                            return <Icon key={i} className="w-3.5 h-3.5" style={{ color: CHANNEL_COLORS[ch] }} />;
                          })}
                        </div>
                      </td>
                      <td className="px-3 py-2"><span className="px-2 py-0.5 bg-accent rounded text-xs">{FREQ_LABELS[p.frequency] || p.frequency}</span></td>
                      <td className="px-3 py-2">
                        <button onClick={() => setEditPref({ user_id: p.user_id, module: p.module, event_type: p.event_type, channels: p.channels, frequency: p.frequency })} className="p-1 rounded hover:bg-accent"><Settings className="w-3.5 h-3.5" /></button>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5} className="text-center text-muted-foreground py-4">אין העדפות - הזן מזהה משתמש</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Edit Preference Modal */}
          {editPref && (
            <div className="bg-card border border-primary/30 rounded-xl p-4 space-y-3">
              <h4 className="font-semibold text-sm">ערוך העדפה - {editPref.module}/{editPref.event_type}</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">ערוצים</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {Object.keys(CHANNEL_ICONS).map(ch => {
                      const Icon = CHANNEL_ICONS[ch];
                      const active = editPref.channels.includes(ch);
                      return (
                        <button key={ch} onClick={() => setEditPref({ ...editPref, channels: active ? editPref.channels.filter(c => c !== ch) : [...editPref.channels, ch] })}
                          className={`flex items-center gap-1 px-2 py-1 rounded text-xs border ${active ? "border-primary bg-primary/20" : "border-border"}`}>
                          <Icon className="w-3 h-3" /> {ch}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">תדירות</label>
                  <select className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm mt-1" value={editPref.frequency} onChange={e => setEditPref({ ...editPref, frequency: e.target.value })}>
                    {Object.entries(FREQ_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={savePreference} className="bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-sm">שמור</button>
                <button onClick={() => setEditPref(null)} className="bg-accent px-4 py-1.5 rounded-lg text-sm">ביטול</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ESCALATIONS TAB */}
      {tab === "escalations" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">שרשראות הסלמה ({escalations.length})</h3>
            <button onClick={() => setShowAddEscalation(true)} className="flex items-center gap-1 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm"><Plus className="w-4 h-4" />חדש</button>
          </div>

          {showAddEscalation && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h4 className="font-semibold text-sm">שרשרת הסלמה חדשה</h4>
              <div className="grid grid-cols-3 gap-3">
                <input placeholder="שם" className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={newEscalation.name} onChange={e => setNewEscalation({ ...newEscalation, name: e.target.value })} />
                <select className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={newEscalation.module} onChange={e => setNewEscalation({ ...newEscalation, module: e.target.value })}>
                  {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={newEscalation.trigger_event} onChange={e => setNewEscalation({ ...newEscalation, trigger_event: e.target.value })}>
                  {EVENT_TYPES.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">רמות הסלמה</label>
                {newEscalation.levels.map((level, i) => (
                  <div key={i} className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground w-16">רמה {i + 1}:</span>
                    <input type="number" placeholder="דקות" className="bg-background border border-border rounded px-2 py-1 text-sm w-20" value={level.delay_minutes} onChange={e => { const l = [...newEscalation.levels]; l[i] = { ...l[i], delay_minutes: Number(e.target.value) }; setNewEscalation({ ...newEscalation, levels: l }); }} />
                    <input placeholder="תפקיד" className="bg-background border border-border rounded px-2 py-1 text-sm flex-1" value={level.notify_role} onChange={e => { const l = [...newEscalation.levels]; l[i] = { ...l[i], notify_role: e.target.value }; setNewEscalation({ ...newEscalation, levels: l }); }} />
                    <select className="bg-background border border-border rounded px-2 py-1 text-sm" value={level.channel} onChange={e => { const l = [...newEscalation.levels]; l[i] = { ...l[i], channel: e.target.value }; setNewEscalation({ ...newEscalation, levels: l }); }}>
                      {Object.keys(CHANNEL_ICONS).map(ch => <option key={ch} value={ch}>{ch}</option>)}
                    </select>
                  </div>
                ))}
                <button onClick={() => setNewEscalation({ ...newEscalation, levels: [...newEscalation.levels, { delay_minutes: 60, notify_role: "", channel: "email" }] })} className="text-xs text-primary mt-1">+ הוסף רמה</button>
              </div>
              <div className="flex gap-2">
                <button onClick={addEscalation} className="bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-sm">שמור</button>
                <button onClick={() => setShowAddEscalation(false)} className="bg-accent px-4 py-1.5 rounded-lg text-sm">ביטול</button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {escalations.map(esc => (
              <div key={esc.id} className={`bg-card border rounded-xl p-4 ${esc.active ? "border-border" : "border-border/30 opacity-60"}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <ArrowRight className="w-5 h-5 text-amber-400" />
                    <div>
                      <div className="font-medium">{esc.name}</div>
                      <div className="text-xs text-muted-foreground">{esc.module} / {esc.trigger_event}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {esc.escalation_count > 0 && <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">{esc.escalation_count} הסלמות</span>}
                    {esc.active ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                  </div>
                </div>
                {/* Escalation levels visualization */}
                <div className="flex items-center gap-1 mt-2">
                  {(Array.isArray(esc.levels) ? esc.levels : []).map((level: any, i: number) => {
                    const Icon = CHANNEL_ICONS[level.channel] || Bell;
                    return (
                      <div key={i} className="flex items-center gap-1">
                        {i > 0 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
                        <div className="flex items-center gap-1 px-2 py-1 bg-background rounded text-xs">
                          <Timer className="w-3 h-3 text-muted-foreground" />
                          <span>{level.delay_minutes}d</span>
                          <ArrowRight className="w-2 h-2" />
                          <Icon className="w-3 h-3" style={{ color: CHANNEL_COLORS[level.channel] }} />
                          <span>{level.notify_role}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {esc.description && <p className="text-xs text-muted-foreground mt-2">{esc.description}</p>}
              </div>
            ))}
            {escalations.length === 0 && <p className="text-center text-muted-foreground py-8">אין שרשראות הסלמה</p>}
          </div>
        </div>
      )}

      {/* CHANNELS TAB */}
      {tab === "channels" && (
        <div className="space-y-4">
          <h3 className="font-semibold">ערוצי תקשורת ({channels.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {channels.map(ch => {
              const Icon = CHANNEL_ICONS[ch.channel_type] || Bell;
              const quotaPercent = ch.daily_quota > 0 ? Math.round((ch.sent_today / ch.daily_quota) * 100) : 0;
              return (
                <div key={ch.id} className={`bg-card border rounded-xl p-4 ${ch.status === "active" ? "border-border" : "border-red-500/30"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Icon className="w-5 h-5" style={{ color: CHANNEL_COLORS[ch.channel_type] }} />
                      <span className="font-medium">{ch.name}</span>
                    </div>
                    {ch.status === "active" ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                  </div>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex justify-between"><span>סוג</span><span className="font-mono">{ch.channel_type}</span></div>
                    <div className="flex justify-between"><span>עדיפות</span><span>{ch.priority}</span></div>
                    <div>
                      <div className="flex justify-between mb-1"><span>מכסה יומית</span><span>{ch.sent_today}/{ch.daily_quota}</span></div>
                      <div className="w-full h-1.5 bg-background rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${quotaPercent > 90 ? "bg-red-500" : quotaPercent > 70 ? "bg-yellow-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(quotaPercent, 100)}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {channels.length === 0 && <p className="text-muted-foreground text-center py-8 col-span-full">אין ערוצים מוגדרים</p>}
          </div>
        </div>
      )}
    </div>
  );
}
