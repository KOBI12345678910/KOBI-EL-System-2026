import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Link2, ShieldCheck, FileText, Package, Truck, CheckCircle2, XCircle,
  RefreshCw, Plus, Eye, AlertTriangle, Globe, Factory, MapPin, Clock,
  ArrowDown, User, Award, Search, ChevronRight
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || document.cookie.match(/token=([^;]+)/)?.[1] || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });
const fmtN = (n: number) => new Intl.NumberFormat("he-IL").format(n);

const EVENT_TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof Package }> = {
  sourced: { label: "מקור", color: "bg-blue-500", icon: Globe },
  received: { label: "התקבל", color: "bg-cyan-500", icon: Package },
  processed: { label: "עובד", color: "bg-purple-500", icon: Factory },
  tested: { label: "נבדק", color: "bg-amber-500", icon: ShieldCheck },
  shipped: { label: "נשלח", color: "bg-orange-500", icon: Truck },
  delivered: { label: "נמסר", color: "bg-emerald-500", icon: CheckCircle2 },
  installed: { label: "הותקן", color: "bg-green-500", icon: CheckCircle2 },
  inspected: { label: "נבדק", color: "bg-yellow-500", icon: Eye },
  certified: { label: "מוסמך", color: "bg-indigo-500", icon: Award },
  recalled: { label: "הוחזר", color: "bg-red-500", icon: AlertTriangle },
};

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

export default function SupplyChainTraceability() {
  const [tab, setTab] = useState<"dashboard" | "chains" | "verify" | "certificates">("dashboard");
  const [dashboard, setDashboard] = useState<any>(null);
  const [chains, setChains] = useState<any[]>([]);
  const [selectedChain, setSelectedChain] = useState<any>(null);
  const [chainDetail, setChainDetail] = useState<any>(null);
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showNewChain, setShowNewChain] = useState(false);
  const [newChain, setNewChain] = useState({ product_name: "", serial_number: "", origin_supplier: "", origin_country: "" });
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({ event_type: "sourced", location: "", actor: "" });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [dashRes, chainsRes] = await Promise.all([
        authFetch(`${API}/traceability/dashboard`, { headers: headers() }).then(r => r.json()).catch(() => null),
        authFetch(`${API}/traceability/chains`, { headers: headers() }).then(r => r.json()).catch(() => []),
      ]);
      setDashboard(dashRes);
      setChains(chainsRes);
    } catch { }
    setLoading(false);
  }

  async function createChain() {
    await authFetch(`${API}/traceability/chains`, {
      method: "POST", headers: headers(), body: JSON.stringify(newChain)
    });
    setShowNewChain(false);
    setNewChain({ product_name: "", serial_number: "", origin_supplier: "", origin_country: "" });
    await loadAll();
  }

  async function viewChain(chainId: number) {
    const res = await authFetch(`${API}/traceability/chain/${chainId}`, { headers: headers() }).then(r => r.json());
    setChainDetail(res);
    setSelectedChain(chainId);
    setVerifyResult(null);
  }

  async function verifyChain(chainId: number) {
    const res = await authFetch(`${API}/traceability/verify/${chainId}`, {
      method: "POST", headers: headers()
    }).then(r => r.json());
    setVerifyResult(res);
  }

  async function addEvent(chainId: number) {
    await authFetch(`${API}/traceability/events`, {
      method: "POST", headers: headers(),
      body: JSON.stringify({ chain_id: chainId, ...newEvent })
    });
    setShowNewEvent(false);
    setNewEvent({ event_type: "sourced", location: "", actor: "" });
    await viewChain(chainId);
    await loadAll();
  }

  const d = dashboard;
  const TABS = [
    { key: "dashboard", label: "דשבורד", icon: Link2 },
    { key: "chains", label: "שרשראות", icon: Package },
    { key: "verify", label: "אימות תקינות", icon: ShieldCheck },
    { key: "certificates", label: "תעודות", icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white p-6" dir="rtl">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-600/20 to-blue-600/20 border border-indigo-500/30">
              <Link2 size={28} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">מעקב שרשרת אספקה</h1>
              <p className="text-sm text-muted-foreground">Blockchain Supply Chain Traceability - אימות, תעודות, היסטוריה</p>
            </div>
          </div>
          <button onClick={loadAll} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm">
            <RefreshCw size={14} /> רענון
          </button>
        </div>

        <div className="flex gap-2 mb-6">
          {TABS.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key as any); setSelectedChain(null); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${
                tab === t.key ? "bg-indigo-600/20 border border-indigo-500/40 text-indigo-300" : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10"
              }`}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        {loading && <div className="text-center py-20 text-muted-foreground">טוען...</div>}

        {/* Dashboard */}
        {!loading && tab === "dashboard" && d && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <StatCard icon={Link2} label="שרשראות פעילות" value={d.chains?.active || 0} sub={`סה"כ ${d.chains?.total || 0}`} color="text-indigo-400" />
              <StatCard icon={CheckCircle2} label="הושלמו" value={d.chains?.complete || 0} color="text-emerald-400" />
              <StatCard icon={AlertTriangle} label="בעיות תקינות" value={d.chains?.integrity_issues || 0} color="text-red-400" />
              <StatCard icon={FileText} label="תעודות" value={`${d.certificates?.verified || 0}/${d.certificates?.total || 0}`} sub={`פגו: ${d.certificates?.expired || 0}`} color="text-blue-400" />
              <StatCard icon={Clock} label="אירועים היום" value={d.events?.today || 0} sub={`סה"כ ${d.events?.total || 0}`} color="text-cyan-400" />
            </div>

            {d.events_by_type?.length > 0 && (
              <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
                <h3 className="font-bold mb-4">אירועים לפי סוג</h3>
                <div style={{ height: 280 }}>
                  <ResponsiveContainer>
                    <BarChart data={d.events_by_type.map((e: any) => ({
                      name: EVENT_TYPE_CONFIG[e.event_type]?.label || e.event_type,
                      count: parseInt(e.count),
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="name" stroke="#888" fontSize={12} />
                      <YAxis stroke="#888" />
                      <Tooltip contentStyle={{ background: "#1a1d23", border: "1px solid #333", borderRadius: 8 }} />
                      <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} name="אירועים" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {d.recent_events?.length > 0 && (
              <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
                <h3 className="font-bold mb-4">אירועים אחרונים</h3>
                <div className="space-y-2">
                  {d.recent_events.slice(0, 10).map((e: any) => {
                    const cfg = EVENT_TYPE_CONFIG[e.event_type] || { label: e.event_type, color: "bg-gray-500", icon: Package };
                    const Icon = cfg.icon;
                    return (
                      <div key={e.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                        <div className={`p-1.5 rounded ${cfg.color}/20`}><Icon size={14} className="text-white" /></div>
                        <div className="flex-1">
                          <div className="text-sm font-medium">{cfg.label} - {e.product_name || e.chain_number}</div>
                          <div className="text-xs text-muted-foreground">{e.location && `${e.location} | `}{e.actor && `${e.actor} | `}{new Date(e.timestamp).toLocaleString("he-IL")}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Chains Tab */}
        {!loading && tab === "chains" && !selectedChain && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold">שרשראות מעקב ({chains.length})</h3>
              <button onClick={() => setShowNewChain(!showNewChain)}
                className="px-4 py-2 rounded-lg bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 text-sm">+ שרשרת חדשה</button>
            </div>
            {showNewChain && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="bg-[#1a1d23] border border-indigo-500/30 rounded-xl p-5">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input value={newChain.product_name} onChange={e => setNewChain({ ...newChain, product_name: e.target.value })}
                    placeholder="שם מוצר" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                  <input value={newChain.serial_number} onChange={e => setNewChain({ ...newChain, serial_number: e.target.value })}
                    placeholder="מספר סריאלי" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                  <input value={newChain.origin_supplier} onChange={e => setNewChain({ ...newChain, origin_supplier: e.target.value })}
                    placeholder="ספק מקור" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                  <input value={newChain.origin_country} onChange={e => setNewChain({ ...newChain, origin_country: e.target.value })}
                    placeholder="ארץ מקור" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                </div>
                <button onClick={createChain} className="mt-3 px-4 py-2 bg-indigo-600 rounded-lg text-sm hover:bg-indigo-700">צור שרשרת</button>
              </motion.div>
            )}
            <div className="space-y-3">
              {chains.map((c: any) => (
                <div key={c.id} className="bg-[#1a1d23] border border-white/10 rounded-xl p-4 flex items-center justify-between cursor-pointer hover:border-indigo-500/30 transition-all"
                  onClick={() => viewChain(c.id)}>
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${c.integrity_verified === false ? "bg-red-500/20" : "bg-indigo-500/20"}`}>
                      {c.integrity_verified === false ? <AlertTriangle size={18} className="text-red-400" /> : <Link2 size={18} className="text-indigo-400" />}
                    </div>
                    <div>
                      <div className="font-medium">{c.product_name || c.chain_number}</div>
                      <div className="text-xs text-muted-foreground">{c.chain_number} | {c.origin_supplier} | {c.origin_country}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground">{c.event_count || 0} אירועים</span>
                    <span className="text-xs text-muted-foreground">{c.cert_count || 0} תעודות</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      c.chain_status === "active" ? "bg-blue-500/20 text-blue-300" :
                      c.chain_status === "complete" ? "bg-emerald-500/20 text-emerald-300" :
                      "bg-red-500/20 text-red-300"
                    }`}>{c.chain_status === "active" ? "פעיל" : c.chain_status === "complete" ? "הושלם" : c.chain_status}</span>
                    <ChevronRight size={16} className="text-muted-foreground" />
                  </div>
                </div>
              ))}
              {chains.length === 0 && <div className="text-center py-12 text-muted-foreground">אין שרשראות. צור שרשרת מעקב ראשונה.</div>}
            </div>
          </div>
        )}

        {/* Chain Detail with Timeline */}
        {!loading && tab === "chains" && selectedChain && chainDetail && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <button onClick={() => setSelectedChain(null)} className="text-sm text-muted-foreground hover:text-white">חזרה לרשימה</button>
              <ChevronRight size={14} className="text-muted-foreground rotate-180" />
              <span className="font-bold">{chainDetail.chain?.product_name || chainDetail.chain?.chain_number}</span>
            </div>

            {/* Chain Info */}
            <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><span className="text-xs text-muted-foreground">מספר שרשרת</span><div className="font-medium">{chainDetail.chain?.chain_number}</div></div>
                <div><span className="text-xs text-muted-foreground">מספר סריאלי</span><div className="font-medium">{chainDetail.chain?.serial_number || "-"}</div></div>
                <div><span className="text-xs text-muted-foreground">ספק מקור</span><div className="font-medium">{chainDetail.chain?.origin_supplier || "-"}</div></div>
                <div><span className="text-xs text-muted-foreground">ארץ מקור</span><div className="font-medium">{chainDetail.chain?.origin_country || "-"}</div></div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={() => verifyChain(selectedChain)}
                className="px-4 py-2 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-sm flex items-center gap-2">
                <ShieldCheck size={14} /> אימות תקינות
              </button>
              <button onClick={() => setShowNewEvent(!showNewEvent)}
                className="px-4 py-2 rounded-lg bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 text-sm flex items-center gap-2">
                <Plus size={14} /> הוסף אירוע
              </button>
            </div>

            {/* Verify Result */}
            {verifyResult && (
              <div className={`p-4 rounded-xl border ${verifyResult.valid ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30"}`}>
                <div className="flex items-center gap-2 mb-2">
                  {verifyResult.valid ? <CheckCircle2 size={18} className="text-emerald-400" /> : <XCircle size={18} className="text-red-400" />}
                  <span className="font-bold">{verifyResult.valid ? "השרשרת תקינה - אין חשד לזיוף" : "נמצאו בעיות תקינות!"}</span>
                </div>
                <div className="text-sm text-muted-foreground">נבדקו {verifyResult.events_checked} אירועים</div>
                {verifyResult.issues?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {verifyResult.issues.map((iss: any, i: number) => (
                      <div key={i} className="text-xs text-red-300 bg-red-500/10 p-2 rounded">#{iss.sequence}: {iss.issue}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* New Event Form */}
            {showNewEvent && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="bg-[#1a1d23] border border-indigo-500/30 rounded-xl p-5">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <select value={newEvent.event_type} onChange={e => setNewEvent({ ...newEvent, event_type: e.target.value })}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm">
                    {Object.entries(EVENT_TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <input value={newEvent.location} onChange={e => setNewEvent({ ...newEvent, location: e.target.value })}
                    placeholder="מיקום" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                  <input value={newEvent.actor} onChange={e => setNewEvent({ ...newEvent, actor: e.target.value })}
                    placeholder="גורם מבצע" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                  <button onClick={() => addEvent(selectedChain)} className="bg-indigo-600 rounded-lg text-sm hover:bg-indigo-700">הוסף</button>
                </div>
              </motion.div>
            )}

            {/* Timeline */}
            <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
              <h3 className="font-bold mb-6">ציר זמן - היסטוריית שרשרת</h3>
              <div className="relative">
                {chainDetail.events?.length > 0 ? (
                  <div className="space-y-1">
                    {chainDetail.events.map((e: any, i: number) => {
                      const cfg = EVENT_TYPE_CONFIG[e.event_type] || { label: e.event_type, color: "bg-gray-500", icon: Package };
                      const Icon = cfg.icon;
                      const isLast = i === chainDetail.events.length - 1;
                      return (
                        <div key={e.id} className="flex gap-4">
                          <div className="flex flex-col items-center">
                            <div className={`w-8 h-8 rounded-full ${cfg.color} flex items-center justify-center shrink-0`}>
                              <Icon size={14} className="text-white" />
                            </div>
                            {!isLast && <div className="w-0.5 h-12 bg-white/10 my-1" />}
                          </div>
                          <div className="flex-1 pb-4">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{cfg.label}</span>
                              <span className="text-xs text-muted-foreground">{new Date(e.timestamp).toLocaleString("he-IL")}</span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {e.location && <span className="flex items-center gap-1"><MapPin size={10} /> {e.location}</span>}
                              {e.actor && <span className="flex items-center gap-1 mt-0.5"><User size={10} /> {e.actor}</span>}
                            </div>
                            <div className="text-[10px] text-muted-foreground/50 mt-1 font-mono truncate">Hash: {e.hash?.slice(0, 16)}...</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : <div className="text-center py-8 text-muted-foreground">אין אירועים בשרשרת</div>}
              </div>
            </div>

            {/* Certificates */}
            {chainDetail.certificates?.length > 0 && (
              <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
                <h3 className="font-bold mb-4">תעודות ({chainDetail.certificates.length})</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {chainDetail.certificates.map((c: any) => (
                    <div key={c.id} className="p-3 bg-white/5 rounded-lg border border-white/5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">{c.cert_type} - {c.cert_number}</span>
                        {c.verified ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Clock size={14} className="text-amber-400" />}
                      </div>
                      <div className="text-xs text-muted-foreground">מנפיק: {c.issuer} | בתוקף עד: {c.valid_until || "ללא הגבלה"}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Verify Tab */}
        {!loading && tab === "verify" && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold">אימות תקינות שרשראות</h3>
            <div className="space-y-3">
              {chains.map(c => (
                <div key={c.id} className="bg-[#1a1d23] border border-white/10 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{c.product_name || c.chain_number}</div>
                    <div className="text-xs text-muted-foreground">{c.event_count || 0} אירועים | {c.origin_supplier}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`flex items-center gap-1 text-xs ${c.integrity_verified === false ? "text-red-400" : "text-emerald-400"}`}>
                      {c.integrity_verified === false ? <><XCircle size={12} /> לא תקין</> : <><CheckCircle2 size={12} /> תקין</>}
                    </span>
                    <button onClick={() => { viewChain(c.id); verifyChain(c.id); setTab("chains"); }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 text-xs hover:bg-emerald-600/30 flex items-center gap-1">
                      <ShieldCheck size={12} /> בדוק
                    </button>
                  </div>
                </div>
              ))}
              {chains.length === 0 && <div className="text-center py-12 text-muted-foreground">אין שרשראות לאימות</div>}
            </div>
          </div>
        )}

        {/* Certificates Tab */}
        {!loading && tab === "certificates" && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold">תעודות חומרים</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard icon={FileText} label="סה״כ תעודות" value={d?.certificates?.total || 0} color="text-blue-400" />
              <StatCard icon={CheckCircle2} label="מאומתות" value={d?.certificates?.verified || 0} color="text-emerald-400" />
              <StatCard icon={AlertTriangle} label="פגות / עומדות לפוג" value={`${d?.certificates?.expired || 0} / ${d?.certificates?.expiring_soon || 0}`} color="text-orange-400" />
            </div>
            <div className="text-center py-8 text-muted-foreground">בחר שרשרת מלשונית "שרשראות" לצפייה בתעודות</div>
          </div>
        )}
      </div>
    </div>
  );
}
