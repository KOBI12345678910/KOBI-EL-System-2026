import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  FileText, Shield, AlertTriangle, Calendar, BookOpen, Target,
  RefreshCw, Plus, Clock, CheckCircle2, XCircle, Eye, Zap, Scale
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar
} from "recharts";

const API = "/api";
const headers = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("erp_token") || ""}`
});

const COLORS = ["#10b981","#f59e0b","#ef4444","#6366f1","#ec4899","#8b5cf6"];
const riskColors: Record<string,string> = { low: '#10b981', medium: '#f59e0b', high: '#ef4444', critical: '#dc2626' };
const riskLabels: Record<string,string> = { low: 'נמוך', medium: 'בינוני', high: 'גבוה', critical: 'קריטי' };

export default function ContractIntelligencePage() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [obligations, setObligations] = useState<any[]>([]);
  const [risks, setRisks] = useState<any[]>([]);
  const [library, setLibrary] = useState<any[]>([]);
  const [tab, setTab] = useState<"dashboard"|"obligations"|"risks"|"library">("dashboard");
  const [loading, setLoading] = useState(true);
  const [showAddObl, setShowAddObl] = useState(false);
  const [newObl, setNewObl] = useState({ contract_id: 0, obligation_type: 'delivery', description: '', due_date: '', responsible: '' });

  const load = async () => {
    setLoading(true);
    try {
      const [dRes, oRes, rRes, lRes] = await Promise.all([
        authFetch(`${API}/contract-intel/dashboard`, { headers: headers() }),
        authFetch(`${API}/contract-intel/upcoming-obligations`, { headers: headers() }),
        authFetch(`${API}/contract-intel/risks`, { headers: headers() }),
        authFetch(`${API}/contract-intel/library`, { headers: headers() })
      ]);
      setDashboard(await dRes.json());
      setObligations(await oRes.json());
      setRisks(await rRes.json());
      setLibrary(await lRes.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addObligation = async () => {
    await authFetch(`${API}/contract-intel/obligations`, { method: "POST", headers: headers(), body: JSON.stringify(newObl) });
    setShowAddObl(false);
    load();
  };

  const updateOblStatus = async (id: number, status: string) => {
    await authFetch(`${API}/contract-intel/obligations/${id}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ status }) });
    load();
  };

  const tabs = [
    { key: "dashboard", label: "סקירה", icon: Target },
    { key: "obligations", label: "התחייבויות", icon: Calendar },
    { key: "risks", label: "סיכונים", icon: Shield },
    { key: "library", label: "ספריית סעיפים", icon: BookOpen }
  ] as const;

  const oblTypes: Record<string,string> = { delivery: 'אספקה', payment: 'תשלום', milestone: 'אבן דרך', reporting: 'דיווח', compliance: 'תאימות', renewal: 'חידוש' };

  if (loading) return <div className="flex items-center justify-center h-96"><RefreshCw className="w-8 h-8 animate-spin text-indigo-400" /></div>;

  // Build radar data from risk by clause type
  const clauseTypes = [...new Set((dashboard?.riskByClauseType || []).map((r: any) => r.clause_type))];
  const radarData = clauseTypes.map(ct => {
    const items = (dashboard?.riskByClauseType || []).filter((r: any) => r.clause_type === ct);
    const total = items.reduce((s: number, r: any) => s + Number(r.count), 0);
    const highCount = items.filter((r: any) => r.risk_level === 'high' || r.risk_level === 'critical').reduce((s: number, r: any) => s + Number(r.count), 0);
    return { clause: ct, total, risk: highCount };
  });

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-l from-violet-400 to-purple-400 bg-clip-text text-transparent">
            אינטליגנציה חוזית
          </h1>
          <p className="text-muted-foreground mt-1">ניתוח סעיפים, זיהוי סיכונים ומעקב התחייבויות</p>
        </div>
        <button onClick={() => setShowAddObl(true)} className="flex items-center gap-1 px-3 py-2 bg-violet-500/20 text-violet-300 rounded-lg text-sm hover:bg-violet-500/30">
          <Plus className="w-4 h-4" />התחייבות חדשה
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: FileText, label: 'ניתוחים', value: dashboard?.analysisStats?.reduce((s: number, a: any) => s + Number(a.count), 0) || 0, color: 'violet' },
          { icon: Shield, label: 'סיכונים פתוחים', value: risks.length, color: 'red' },
          { icon: Calendar, label: 'התחייבויות קרובות', value: obligations.length, color: 'amber' },
          { icon: BookOpen, label: 'סעיפים בספרייה', value: library.length, color: 'emerald' }
        ].map((s, i) => {
          const bg: Record<string,string> = { violet: 'from-violet-500/20 to-violet-600/5', red: 'from-red-500/20 to-red-600/5', amber: 'from-amber-500/20 to-amber-600/5', emerald: 'from-emerald-500/20 to-emerald-600/5' };
          const ic: Record<string,string> = { violet: 'text-violet-400', red: 'text-red-400', amber: 'text-amber-400', emerald: 'text-emerald-400' };
          return (
            <motion.div key={i} initial={{ opacity:0,y:10 }} animate={{ opacity:1,y:0 }} transition={{ delay: i*0.1 }}
              className={`bg-gradient-to-br ${bg[s.color]} border border-white/10 rounded-2xl p-5`}>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2"><s.icon className={`w-4 h-4 ${ic[s.color]}`} />{s.label}</div>
              <div className="text-2xl font-bold">{s.value}</div>
            </motion.div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition ${
              tab === t.key ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'text-muted-foreground hover:bg-white/5'
            }`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {/* Dashboard */}
      {tab === "dashboard" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Risk Radar */}
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="bg-card border border-white/10 rounded-2xl p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><Scale className="w-4 h-4 text-violet-400" />רדאר סיכונים לפי סעיפים</h3>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#333" />
                <PolarAngleAxis dataKey="clause" stroke="#666" tick={{ fontSize: 10 }} />
                <PolarRadiusAxis stroke="#444" />
                <Radar name="סה״כ" dataKey="total" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} />
                <Radar name="סיכון גבוה" dataKey="risk" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} />
                <Legend />
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333' }} />
              </RadarChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Obligation Status */}
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="bg-card border border-white/10 rounded-2xl p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><Calendar className="w-4 h-4 text-amber-400" />סטטוס התחייבויות</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={(dashboard?.obligationStats || []).map((o: any) => ({ name: o.status, value: Number(o.count) }))}
                  dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {(dashboard?.obligationStats || []).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Top Risks */}
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="bg-card border border-white/10 rounded-2xl p-5 lg:col-span-2">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-400" />סיכונים מובילים</h3>
            <div className="space-y-2">
              {(dashboard?.topRisks || []).slice(0, 5).map((r: any) => (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border border-white/5 bg-white/[0.02]">
                  <span className={`w-2 h-8 rounded-full`} style={{ background: riskColors[r.severity] }} />
                  <div className="flex-1">
                    <span className="text-sm font-medium">{r.risk_category}</span>
                    <p className="text-xs text-muted-foreground">{r.risk_description}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded`} style={{ background: `${riskColors[r.severity]}20`, color: riskColors[r.severity] }}>
                    {riskLabels[r.severity]}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* Obligations Tab */}
      {tab === "obligations" && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="space-y-3">
          {obligations.map(obl => {
            const daysLeft = obl.due_date ? Math.ceil((new Date(obl.due_date).getTime() - Date.now()) / 86400000) : 999;
            const urgency = daysLeft <= 3 ? 'border-red-500/30 bg-red-500/5' : daysLeft <= 7 ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/10 bg-card';
            return (
              <div key={obl.id} className={`p-4 rounded-xl border ${urgency}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded bg-violet-500/20 text-violet-300">{oblTypes[obl.obligation_type] || obl.obligation_type}</span>
                      <span className="text-xs text-muted-foreground">חוזה #{obl.contract_id}</span>
                    </div>
                    <p className="text-sm mt-1">{obl.description}</p>
                    <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{obl.due_date?.slice(0,10)}</span>
                      <span>אחראי: {obl.responsible || 'לא הוגדר'}</span>
                      {daysLeft <= 7 && <span className="text-red-400">{daysLeft} ימים</span>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => updateOblStatus(obl.id, 'met')} className="text-xs px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded hover:bg-emerald-500/30">
                      <CheckCircle2 className="w-3 h-3" />
                    </button>
                    <button onClick={() => updateOblStatus(obl.id, 'waived')} className="text-xs px-2 py-1 bg-amber-500/20 text-amber-300 rounded hover:bg-amber-500/30">
                      <XCircle className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {obligations.length === 0 && <p className="text-center text-muted-foreground py-12">אין התחייבויות קרובות</p>}
        </motion.div>
      )}

      {/* Risks Tab */}
      {tab === "risks" && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="space-y-3">
          {risks.map(r => (
            <div key={r.id} className="bg-card border border-white/10 rounded-xl p-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-3 h-3 rounded-full" style={{ background: riskColors[r.severity] }} />
                    <span className="font-medium text-sm">{r.risk_category}</span>
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: `${riskColors[r.severity]}20`, color: riskColors[r.severity] }}>
                      {riskLabels[r.severity]}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{r.risk_description}</p>
                  {r.mitigation && <p className="text-xs text-emerald-400 mt-1">המלצה: {r.mitigation}</p>}
                  {Number(r.financial_impact) > 0 && <p className="text-xs text-amber-400 mt-1">חשיפה כספית: {Number(r.financial_impact).toLocaleString()} ILS</p>}
                </div>
              </div>
            </div>
          ))}
          {risks.length === 0 && <p className="text-center text-muted-foreground py-12">אין סיכונים פתוחים</p>}
        </motion.div>
      )}

      {/* Library Tab */}
      {tab === "library" && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="space-y-3">
          {library.map(cl => (
            <div key={cl.id} className="bg-card border border-white/10 rounded-xl p-4">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">{cl.clause_type}</span>
                  <span className="text-xs text-muted-foreground">v{cl.version}</span>
                  <span className="text-xs text-muted-foreground">{cl.jurisdiction}</span>
                </div>
                {cl.approved && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              </div>
              <p className="text-sm text-muted-foreground line-clamp-3">{cl.standard_text}</p>
            </div>
          ))}
          {library.length === 0 && <p className="text-center text-muted-foreground py-12">ספריית הסעיפים ריקה - הוסף נוסחים סטנדרטיים</p>}
        </motion.div>
      )}

      {/* Add Obligation Modal */}
      {showAddObl && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddObl(false)}>
          <div className="bg-card border border-white/10 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-4">התחייבות חדשה</h3>
            <div className="space-y-3">
              <input type="number" placeholder="מזהה חוזה" value={newObl.contract_id || ''} onChange={e => setNewObl(p => ({...p, contract_id: Number(e.target.value)}))}
                className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm" />
              <select value={newObl.obligation_type} onChange={e => setNewObl(p => ({...p, obligation_type: e.target.value}))}
                className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm">
                {Object.entries(oblTypes).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <textarea placeholder="תיאור" value={newObl.description} onChange={e => setNewObl(p => ({...p, description: e.target.value}))}
                className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm" rows={3} />
              <input type="date" value={newObl.due_date} onChange={e => setNewObl(p => ({...p, due_date: e.target.value}))}
                className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm" />
              <input placeholder="אחראי" value={newObl.responsible} onChange={e => setNewObl(p => ({...p, responsible: e.target.value}))}
                className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm" />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAddObl(false)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-white/5 rounded-lg">ביטול</button>
                <button onClick={addObligation} className="px-4 py-2 text-sm bg-violet-500/20 text-violet-300 rounded-lg hover:bg-violet-500/30">שמור</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
