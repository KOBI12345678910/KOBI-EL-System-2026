import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";
import {
  Users, UserCheck, MapPin, Phone, Star, Search, TrendingUp, Target,
  Award, AlertTriangle, Clock, Calendar, Activity, Eye, RefreshCw,
  MessageSquare, Navigation, Wifi, WifiOff, ThermometerSun, ArrowUpDown,
  Trophy, BarChart3, ChevronDown, ChevronUp, Bell, Shield, Zap,
  PhoneCall, CheckCircle2, XCircle, Timer, Coffee, Car, Building2
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);
const fmtP = (n: number) => `${Math.round(n)}%`;

const AGENT_STATUS: Record<string, { label: string; color: string; icon: any }> = {
  available: { label: "זמין", color: "bg-green-500/20 text-green-400 border-green-500/30", icon: CheckCircle2 },
  busy: { label: "עסוק", color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: Phone },
  meeting: { label: "בפגישה", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Building2 },
  driving: { label: "בנסיעה", color: "bg-purple-500/20 text-purple-400 border-purple-500/30", icon: Car },
  break: { label: "הפסקה", color: "bg-orange-500/20 text-orange-400 border-orange-500/30", icon: Coffee },
  off: { label: "לא פעיל", color: "bg-muted/20 text-muted-foreground border-muted/30", icon: XCircle },
  sick: { label: "חולה", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: ThermometerSun },
};

const ALERT_TYPES: Record<string, { label: string; color: string; icon: any }> = {
  not_responding: { label: "לא מגיב", color: "text-red-400", icon: WifiOff },
  lead_burning: { label: "ליד שורף", color: "text-orange-400", icon: Zap },
  sla_breach: { label: "חריגת SLA", color: "text-amber-400", icon: Timer },
  low_activity: { label: "פעילות נמוכה", color: "text-yellow-400", icon: Activity },
};

const mockAgents: any[] = [
  { id: 1, name: "יוסי כהן", status: "available", phone: "050-1234567", region: "מרכז", lat: 32.07, lng: 34.78, leadsCount: 24, todayMeetings: 3, completedMeetings: 1, conversionRate: 32, riskScore: 12, qualityScore: 88, lastActivity: "לפני 5 דק'", currentLocation: "תל אביב, רח' הרצל 45", photo: "", totalSales: 142000, monthTarget: 200000 },
  { id: 2, name: "דנה לוי", status: "meeting", phone: "052-9876543", region: "צפון", lat: 32.79, lng: 34.98, leadsCount: 18, todayMeetings: 4, completedMeetings: 3, conversionRate: 41, riskScore: 5, qualityScore: 94, lastActivity: "לפני 12 דק'", currentLocation: "חיפה, שד' הנשיא 12", photo: "", totalSales: 198000, monthTarget: 200000 },
  { id: 3, name: "אבי מזרחי", status: "driving", phone: "054-5551234", region: "דרום", lat: 31.25, lng: 34.79, leadsCount: 15, todayMeetings: 2, completedMeetings: 0, conversionRate: 28, riskScore: 25, qualityScore: 72, lastActivity: "לפני 30 דק'", currentLocation: "באר שבע, דרך שמחוני", photo: "", totalSales: 89000, monthTarget: 180000 },
  { id: 4, name: "מיכל שרון", status: "busy", phone: "050-7778899", region: "שרון", lat: 32.33, lng: 34.86, leadsCount: 31, todayMeetings: 5, completedMeetings: 4, conversionRate: 38, riskScore: 8, qualityScore: 91, lastActivity: "לפני 2 דק'", currentLocation: "נתניה, רח' הרצוג 3", photo: "", totalSales: 215000, monthTarget: 220000 },
  { id: 5, name: "רון אברהם", status: "off", phone: "053-1112233", region: "ירושלים", lat: 31.78, lng: 35.22, leadsCount: 12, todayMeetings: 0, completedMeetings: 0, conversionRate: 35, riskScore: 0, qualityScore: 85, lastActivity: "אתמול 18:30", currentLocation: "—", photo: "", totalSales: 156000, monthTarget: 200000 },
  { id: 6, name: "שירה גולד", status: "available", phone: "058-4445566", region: "גוש דן", lat: 32.09, lng: 34.82, leadsCount: 22, todayMeetings: 3, completedMeetings: 2, conversionRate: 45, riskScore: 3, qualityScore: 96, lastActivity: "לפני 1 דק'", currentLocation: "רמת גן, שד' ירושלים 10", photo: "", totalSales: 245000, monthTarget: 250000 },
  { id: 7, name: "עמית ברק", status: "sick", phone: "050-6667788", region: "מרכז", lat: 0, lng: 0, leadsCount: 19, todayMeetings: 0, completedMeetings: 0, conversionRate: 30, riskScore: 0, qualityScore: 80, lastActivity: "אתמול 14:00", currentLocation: "—", photo: "", totalSales: 110000, monthTarget: 190000 },
  { id: 8, name: "נועם פרידמן", status: "break", phone: "052-3334455", region: "שפלה", lat: 31.82, lng: 34.66, leadsCount: 27, todayMeetings: 4, completedMeetings: 2, conversionRate: 36, riskScore: 15, qualityScore: 83, lastActivity: "לפני 18 דק'", currentLocation: "רחובות, רח' הרצל 22", photo: "", totalSales: 172000, monthTarget: 210000 },
];

const mockAlerts: any[] = [
  { id: 1, type: "not_responding", agentName: "אבי מזרחי", message: "לא מגיב מזה 30 דקות", time: "10:32", urgent: true },
  { id: 2, type: "lead_burning", agentName: "נועם פרידמן", message: "ליד #4521 ממתין מעל 24 שעות", time: "10:15", urgent: true },
  { id: 3, type: "sla_breach", agentName: "יוסי כהן", message: "חריגה מ-SLA זמן תגובה ראשונית", time: "09:45", urgent: false },
  { id: 4, type: "low_activity", agentName: "עמית ברק", message: "0 פעולות היום (חולה?)", time: "09:00", urgent: false },
];

function KPICard({ icon: Icon, label, value, sub, color }: any) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl p-4 border border-white/10">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`w-4 h-4 ${color || "text-blue-400"}`} />
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </motion.div>
  );
}

function ScoreBadge({ score, label }: { score: number; label?: string }) {
  const color = score >= 80 ? "text-green-400" : score >= 60 ? "text-amber-400" : "text-red-400";
  const bg = score >= 80 ? "bg-green-500/10" : score >= 60 ? "bg-amber-500/10" : "bg-red-500/10";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${bg} ${color}`}>
      {label && <span>{label}:</span>} {score}
    </span>
  );
}

export default function AgentControlTowerPage() {
  const [agents, setAgents] = useState<any[]>(mockAgents);
  const [alerts, setAlerts] = useState<any[]>(mockAlerts);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterRegion, setFilterRegion] = useState("all");
  const [sortField, setSortField] = useState("qualityScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [showMap, setShowMap] = useState(false);
  const [showAlerts, setShowAlerts] = useState(true);
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [availabilityForm, setAvailabilityForm] = useState({ agentId: 0, status: "off", reason: "", returnDate: "" });
  const [showComparison, setShowComparison] = useState(false);
  const [compareAgents, setCompareAgents] = useState<number[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        authFetch(`${API}/crm-ultimate/agents`),
        authFetch(`${API}/crm-ultimate/agents/alerts`)
      ]);
      if (r1.ok) { const d = await r1.json(); if (safeArray(d).length) setAgents(safeArray(d)); }
      if (r2.ok) { const d = await r2.json(); if (safeArray(d).length) setAlerts(safeArray(d)); }
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let f = [...agents];
    if (search) {
      const s = search.toLowerCase();
      f = f.filter(a => a.name?.toLowerCase().includes(s) || a.phone?.includes(s) || a.region?.includes(s));
    }
    if (filterStatus !== "all") f = f.filter(a => a.status === filterStatus);
    if (filterRegion !== "all") f = f.filter(a => a.region === filterRegion);
    f.sort((a, b) => {
      const av = a[sortField] ?? 0, bv = b[sortField] ?? 0;
      return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    return f;
  }, [agents, search, filterStatus, filterRegion, sortField, sortDir]);

  const leaderboard = useMemo(() => {
    return [...agents].sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
  }, [agents]);

  const kpis = useMemo(() => ({
    total: agents.length,
    active: agents.filter(a => ["available", "busy", "meeting", "driving", "break"].includes(a.status)).length,
    inMeeting: agents.filter(a => a.status === "meeting").length,
    offToday: agents.filter(a => ["off", "sick"].includes(a.status)).length,
    avgConversion: agents.length ? Math.round(agents.reduce((s, a) => s + (a.conversionRate || 0), 0) / agents.length) : 0,
    totalLeads: agents.reduce((s, a) => s + (a.leadsCount || 0), 0),
    todayMeetingsTotal: agents.reduce((s, a) => s + (a.todayMeetings || 0), 0),
    urgentAlerts: alerts.filter(a => a.urgent).length,
  }), [agents, alerts]);

  const regions = useMemo(() => Array.from(new Set(agents.map(a => a.region).filter(Boolean))), [agents]);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const handleAvailabilityUpdate = async () => {
    try {
      await authFetch(`${API}/crm-ultimate/agents/${availabilityForm.agentId}/availability`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(availabilityForm),
      });
      setShowAvailabilityModal(false);
      load();
    } catch {}
  };

  const dismissAlert = (id: number) => setAlerts(p => p.filter(a => a.id !== id));

  return (
    <div dir="rtl" className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Shield className="w-6 h-6 text-blue-400" /> מגדל בקרה - סוכנים</h1>
          <p className="text-sm text-muted-foreground mt-1">מעקב בזמן אמת אחרי כל הסוכנים, ביצועים והתראות</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-lg bg-card border border-white/10 text-muted-foreground hover:text-foreground"><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /></button>
          <ExportDropdown data={agents} filename="agent-control-tower" />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <KPICard icon={Users} label="סה״כ סוכנים" value={kpis.total} color="text-blue-400" />
        <KPICard icon={UserCheck} label="פעילים כרגע" value={kpis.active} color="text-green-400" sub={`${fmtP(kpis.active / kpis.total * 100)} מהצוות`} />
        <KPICard icon={Building2} label="בפגישות" value={kpis.inMeeting} color="text-purple-400" />
        <KPICard icon={XCircle} label="לא פעילים" value={kpis.offToday} color="text-muted-foreground" />
        <KPICard icon={TrendingUp} label="% המרה ממוצע" value={fmtP(kpis.avgConversion)} color="text-cyan-400" />
        <KPICard icon={Target} label="סה״כ לידים" value={fmt(kpis.totalLeads)} color="text-amber-400" />
        <KPICard icon={Calendar} label="פגישות היום" value={kpis.todayMeetingsTotal} color="text-indigo-400" />
        <KPICard icon={AlertTriangle} label="התראות דחופות" value={kpis.urgentAlerts} color="text-red-400" />
      </div>

      {/* Alerts Section */}
      {showAlerts && alerts.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2"><Bell className="w-4 h-4" /> התראות בזמן אמת ({alerts.length})</h3>
            <button onClick={() => setShowAlerts(false)} className="text-xs text-muted-foreground hover:text-foreground">הסתר</button>
          </div>
          <div className="space-y-2">
            {alerts.map(alert => {
              const at = ALERT_TYPES[alert.type] || ALERT_TYPES.low_activity;
              const Icon = at.icon;
              return (
                <div key={alert.id} className={`flex items-center justify-between p-2 rounded-lg bg-card/50 border ${alert.urgent ? "border-red-500/30" : "border-white/5"}`}>
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${at.color}`} />
                    <span className="text-sm text-foreground font-medium">{alert.agentName}</span>
                    <span className="text-xs text-muted-foreground">{alert.message}</span>
                    {alert.urgent && <Badge className="bg-red-500/20 text-red-400 text-[10px]">דחוף</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{alert.time}</span>
                    <button onClick={() => dismissAlert(alert.id)} className="text-xs text-muted-foreground hover:text-foreground">X</button>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Filters & Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש סוכן..." className="w-full bg-card border border-white/10 rounded-lg pr-10 pl-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(AGENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)} className="bg-card border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground">
          <option value="all">כל האזורים</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <div className="flex items-center gap-1 bg-card border border-white/10 rounded-lg p-0.5">
          <button onClick={() => setViewMode("cards")} className={`px-3 py-1.5 rounded text-xs ${viewMode === "cards" ? "bg-blue-600 text-foreground" : "text-muted-foreground"}`}>כרטיסים</button>
          <button onClick={() => setViewMode("table")} className={`px-3 py-1.5 rounded text-xs ${viewMode === "table" ? "bg-blue-600 text-foreground" : "text-muted-foreground"}`}>טבלה</button>
        </div>
        <button onClick={() => setShowMap(!showMap)} className={`px-3 py-2 rounded-lg text-xs border ${showMap ? "bg-blue-600 text-foreground border-blue-500" : "bg-card border-white/10 text-muted-foreground"}`}>
          <MapPin className="w-3 h-3 inline ml-1" /> מפה
        </button>
        <button onClick={() => setShowComparison(!showComparison)} className={`px-3 py-2 rounded-lg text-xs border ${showComparison ? "bg-blue-600 text-foreground border-blue-500" : "bg-card border-white/10 text-muted-foreground"}`}>
          <BarChart3 className="w-3 h-3 inline ml-1" /> השוואה
        </button>
        <button onClick={() => { setShowAvailabilityModal(true); setAvailabilityForm({ agentId: 0, status: "off", reason: "", returnDate: "" }); }} className="px-3 py-2 rounded-lg text-xs bg-amber-600 text-foreground hover:bg-amber-700">
          עדכון זמינות
        </button>
      </div>

      {/* GPS Map Placeholder */}
      <AnimatePresence>
        {showMap && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="bg-card rounded-xl border border-white/10 overflow-hidden">
            <div className="p-4 border-b border-white/10">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Navigation className="w-4 h-4 text-blue-400" /> מפת סוכנים - GPS</h3>
            </div>
            <div className="p-4 bg-[#0f1729] min-h-[300px] relative">
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
                <div className="text-center">
                  <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>כאן תוצג מפה אינטראקטיבית (Google Maps / Leaflet)</p>
                </div>
              </div>
              <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 p-2">
                {agents.filter(a => a.lat && a.lng && !["off","sick"].includes(a.status)).map(a => {
                  const st = AGENT_STATUS[a.status] || AGENT_STATUS.available;
                  return (
                    <div key={a.id} className="bg-card/80 backdrop-blur rounded-lg p-3 border border-white/10">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2 h-2 rounded-full ${a.status === "available" ? "bg-green-400" : a.status === "meeting" ? "bg-blue-400" : "bg-amber-400"}`} />
                        <span className="text-sm font-medium text-foreground">{a.name}</span>
                        <Badge className={`text-[10px] ${st.color}`}>{st.label}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{a.currentLocation}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">קואורדינטות: {a.lat}, {a.lng}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Agent Cards View */}
      {viewMode === "cards" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((agent, i) => {
            const st = AGENT_STATUS[agent.status] || AGENT_STATUS.available;
            const StIcon = st.icon;
            return (
              <motion.div key={agent.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="bg-card rounded-xl border border-white/10 p-4 hover:border-blue-500/30 transition-colors cursor-pointer"
                onClick={() => setSelectedAgent(agent)}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400 font-bold text-sm">
                      {agent.name?.split(" ").map((w: string) => w[0]).join("").slice(0, 2)}
                    </div>
                    <div>
                      <div className="font-semibold text-foreground text-sm">{agent.name}</div>
                      <div className="text-xs text-muted-foreground">{agent.phone}</div>
                    </div>
                  </div>
                  <Badge className={`text-[10px] ${st.color} flex items-center gap-1`}><StIcon className="w-3 h-3" />{st.label}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  <div className="bg-background rounded-lg p-2">
                    <div className="text-xs text-muted-foreground">לידים</div>
                    <div className="text-sm font-bold text-foreground">{agent.leadsCount}</div>
                  </div>
                  <div className="bg-background rounded-lg p-2">
                    <div className="text-xs text-muted-foreground">פגישות</div>
                    <div className="text-sm font-bold text-foreground">{agent.completedMeetings}/{agent.todayMeetings}</div>
                  </div>
                  <div className="bg-background rounded-lg p-2">
                    <div className="text-xs text-muted-foreground">המרה</div>
                    <div className="text-sm font-bold text-cyan-400">{fmtP(agent.conversionRate)}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <ScoreBadge score={agent.qualityScore} label="איכות" />
                    {agent.riskScore > 15 && <span className="text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />סיכון: {agent.riskScore}</span>}
                  </div>
                  <span className="text-muted-foreground">{agent.lastActivity}</span>
                </div>
                {agent.currentLocation && agent.currentLocation !== "—" && (
                  <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground"><MapPin className="w-3 h-3" />{agent.currentLocation}</div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Agent Table View */}
      {viewMode === "table" && (
        <div className="bg-card rounded-xl border border-white/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-muted-foreground">
                {[
                  { key: "name", label: "סוכן" }, { key: "status", label: "סטטוס" }, { key: "currentLocation", label: "מיקום" },
                  { key: "leadsCount", label: "לידים" }, { key: "todayMeetings", label: "פגישות היום" }, { key: "conversionRate", label: "% המרה" },
                  { key: "riskScore", label: "סיכון" }, { key: "qualityScore", label: "איכות" }, { key: "lastActivity", label: "פעילות אחרונה" }
                ].map(col => (
                  <th key={col.key} onClick={() => toggleSort(col.key)} className="p-3 text-right cursor-pointer hover:text-foreground whitespace-nowrap">
                    <span className="flex items-center gap-1">{col.label} <ArrowUpDown className="w-3 h-3" /></span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(agent => {
                const st = AGENT_STATUS[agent.status] || AGENT_STATUS.available;
                const StIcon = st.icon;
                return (
                  <tr key={agent.id} className="border-b border-white/5 hover:bg-white/5 cursor-pointer" onClick={() => setSelectedAgent(agent)}>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400 font-bold text-xs">
                          {agent.name?.split(" ").map((w: string) => w[0]).join("").slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{agent.name}</div>
                          <div className="text-xs text-muted-foreground">{agent.phone}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3"><Badge className={`text-[10px] ${st.color} flex items-center gap-1 w-fit`}><StIcon className="w-3 h-3" />{st.label}</Badge></td>
                    <td className="p-3 text-xs text-muted-foreground">{agent.currentLocation || "—"}</td>
                    <td className="p-3 text-foreground font-medium">{agent.leadsCount}</td>
                    <td className="p-3 text-foreground">{agent.completedMeetings}/{agent.todayMeetings}</td>
                    <td className="p-3 text-cyan-400 font-medium">{fmtP(agent.conversionRate)}</td>
                    <td className="p-3">{agent.riskScore > 15 ? <span className="text-red-400 font-medium">{agent.riskScore}</span> : <span className="text-green-400">{agent.riskScore}</span>}</td>
                    <td className="p-3"><ScoreBadge score={agent.qualityScore} /></td>
                    <td className="p-3 text-xs text-muted-foreground">{agent.lastActivity}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl border border-white/10 p-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4"><Trophy className="w-4 h-4 text-amber-400" /> טבלת מובילים</h3>
          <div className="space-y-2">
            {leaderboard.slice(0, 8).map((agent, i) => {
              const medal = i === 0 ? "text-amber-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-orange-400" : "text-muted-foreground";
              return (
                <div key={agent.id} className="flex items-center justify-between p-2 rounded-lg bg-background/50 hover:bg-white/5">
                  <div className="flex items-center gap-3">
                    <span className={`w-6 text-center font-bold ${medal}`}>{i + 1}</span>
                    <div className="w-7 h-7 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400 font-bold text-xs">
                      {agent.name?.split(" ").map((w: string) => w[0]).join("").slice(0, 2)}
                    </div>
                    <span className="text-sm text-foreground">{agent.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-muted-foreground">המרה: <span className="text-cyan-400">{fmtP(agent.conversionRate)}</span></span>
                    <ScoreBadge score={agent.qualityScore} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Agent Comparison */}
        <div className="bg-card rounded-xl border border-white/10 p-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4"><BarChart3 className="w-4 h-4 text-blue-400" /> השוואת סוכנים</h3>
          {showComparison && compareAgents.length >= 2 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="p-2 text-right text-muted-foreground">מדד</th>
                    {compareAgents.map(id => {
                      const ag = agents.find(a => a.id === id);
                      return <th key={id} className="p-2 text-center text-foreground">{ag?.name}</th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { key: "leadsCount", label: "לידים" }, { key: "conversionRate", label: "% המרה" },
                    { key: "qualityScore", label: "ציון איכות" }, { key: "todayMeetings", label: "פגישות היום" },
                    { key: "riskScore", label: "סיכון" }, { key: "totalSales", label: "מכירות" },
                  ].map(m => (
                    <tr key={m.key} className="border-b border-white/5">
                      <td className="p-2 text-muted-foreground">{m.label}</td>
                      {compareAgents.map(id => {
                        const ag = agents.find(a => a.id === id);
                        return <td key={id} className="p-2 text-center text-foreground font-medium">{m.key === "totalSales" ? fmt(ag?.[m.key] || 0) : ag?.[m.key] ?? "—"}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-3">בחר 2 סוכנים או יותר להשוואה:</p>
              <div className="grid grid-cols-2 gap-2">
                {agents.map(a => (
                  <label key={a.id} className="flex items-center gap-2 p-2 rounded-lg bg-background/50 cursor-pointer hover:bg-white/5">
                    <input type="checkbox" checked={compareAgents.includes(a.id)} onChange={e => {
                      if (e.target.checked) setCompareAgents(p => [...p, a.id]);
                      else setCompareAgents(p => p.filter(x => x !== a.id));
                    }} className="rounded" />
                    <span className="text-sm text-foreground">{a.name}</span>
                  </label>
                ))}
              </div>
              {compareAgents.length >= 2 && (
                <button onClick={() => setShowComparison(true)} className="w-full mt-2 py-2 bg-blue-600 text-foreground rounded-lg text-sm hover:bg-blue-700">השווה ({compareAgents.length})</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Availability Modal */}
      <AnimatePresence>
        {showAvailabilityModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowAvailabilityModal(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={e => e.stopPropagation()} className="bg-card rounded-xl border border-white/10 p-6 w-full max-w-md">
              <h3 className="text-lg font-bold text-foreground mb-4">עדכון זמינות סוכן</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">סוכן</label>
                  <select value={availabilityForm.agentId} onChange={e => setAvailabilityForm(f => ({ ...f, agentId: +e.target.value }))} className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground">
                    <option value={0}>בחר סוכן</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">סטטוס חדש</label>
                  <select value={availabilityForm.status} onChange={e => setAvailabilityForm(f => ({ ...f, status: e.target.value }))} className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground">
                    <option value="off">לא פעיל</option>
                    <option value="sick">חולה</option>
                    <option value="available">זמין</option>
                    <option value="break">הפסקה</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">סיבה</label>
                  <input value={availabilityForm.reason} onChange={e => setAvailabilityForm(f => ({ ...f, reason: e.target.value }))} className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground" placeholder="סיבה..." />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">תאריך חזרה</label>
                  <input type="date" value={availabilityForm.returnDate} onChange={e => setAvailabilityForm(f => ({ ...f, returnDate: e.target.value }))} className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground" />
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <button onClick={handleAvailabilityUpdate} className="flex-1 py-2 bg-blue-600 text-foreground rounded-lg text-sm hover:bg-blue-700">עדכן</button>
                <button onClick={() => setShowAvailabilityModal(false)} className="flex-1 py-2 bg-background text-foreground rounded-lg text-sm border border-white/10">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selected Agent Detail Modal */}
      <AnimatePresence>
        {selectedAgent && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setSelectedAgent(null)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} onClick={e => e.stopPropagation()} className="bg-card rounded-xl border border-white/10 p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400 font-bold">
                    {selectedAgent.name?.split(" ").map((w: string) => w[0]).join("").slice(0, 2)}
                  </div>
                  <div>
                    <div className="text-lg font-bold text-foreground">{selectedAgent.name}</div>
                    <div className="text-sm text-muted-foreground">{selectedAgent.phone} | {selectedAgent.region}</div>
                  </div>
                </div>
                <Badge className={`${(AGENT_STATUS[selectedAgent.status] || AGENT_STATUS.available).color}`}>
                  {(AGENT_STATUS[selectedAgent.status] || AGENT_STATUS.available).label}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { label: "לידים", value: selectedAgent.leadsCount },
                  { label: "פגישות היום", value: `${selectedAgent.completedMeetings}/${selectedAgent.todayMeetings}` },
                  { label: "אחוז המרה", value: fmtP(selectedAgent.conversionRate) },
                  { label: "ציון איכות", value: selectedAgent.qualityScore },
                  { label: "ציון סיכון", value: selectedAgent.riskScore },
                  { label: "מכירות חודשיות", value: fmt(selectedAgent.totalSales || 0) },
                  { label: "יעד חודשי", value: fmt(selectedAgent.monthTarget || 0) },
                  { label: "פעילות אחרונה", value: selectedAgent.lastActivity },
                ].map(f => (
                  <div key={f.label} className="bg-background rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">{f.label}</div>
                    <div className="text-sm font-bold text-foreground">{f.value}</div>
                  </div>
                ))}
              </div>
              {selectedAgent.currentLocation && selectedAgent.currentLocation !== "—" && (
                <div className="bg-background rounded-lg p-3 flex items-center gap-2 text-sm text-muted-foreground mb-4">
                  <MapPin className="w-4 h-4 text-blue-400" /> {selectedAgent.currentLocation}
                </div>
              )}
              <div className="flex gap-2">
                <button className="flex-1 py-2 bg-green-600 text-foreground rounded-lg text-sm hover:bg-green-700 flex items-center justify-center gap-1"><Phone className="w-3 h-3" /> התקשר</button>
                <button className="flex-1 py-2 bg-blue-600 text-foreground rounded-lg text-sm hover:bg-blue-700 flex items-center justify-center gap-1"><MessageSquare className="w-3 h-3" /> הודעה</button>
                <button onClick={() => setSelectedAgent(null)} className="flex-1 py-2 bg-background text-foreground rounded-lg text-sm border border-white/10">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading && <div className="text-center py-8 text-muted-foreground">טוען נתונים...</div>}
      {!loading && filtered.length === 0 && <div className="text-center py-8 text-muted-foreground">לא נמצאו סוכנים</div>}
    </div>
  );
}
