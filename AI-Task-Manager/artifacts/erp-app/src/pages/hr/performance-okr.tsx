import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Target, Users, Star, TrendingUp, ChevronDown, ChevronLeft,
  RefreshCw, Plus, Award, Brain, BarChart3, CheckCircle2, Clock,
  AlertTriangle, Layers, FileText
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  PieChart, Pie, Cell, Legend
} from "recharts";

const API = "/api";
const headers = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("erp_token") || ""}`
});

const COLORS = ["#6366f1","#f59e0b","#ef4444","#10b981","#8b5cf6","#ec4899"];

function ProgressBar({ value, max = 100, color = "indigo" }: { value: number; max?: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const colors: Record<string,string> = { indigo: 'bg-indigo-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500' };
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted/20 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colors[color] || colors.indigo}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium w-10 text-left">{Math.round(pct)}%</span>
    </div>
  );
}

export default function PerformanceOkrPage() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [okrTree, setOkrTree] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [progressReport, setProgressReport] = useState<any>(null);
  const [tab, setTab] = useState<"overview"|"okr"|"reviews"|"competencies">("overview");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showAddObj, setShowAddObj] = useState(false);
  const [newObj, setNewObj] = useState({ title: '', description: '', department: '', level: 'team', period: `Q${Math.ceil((new Date().getMonth()+1)/3)}-${new Date().getFullYear()}` });

  const load = async () => {
    setLoading(true);
    try {
      const [dRes, tRes, rRes, pRes] = await Promise.all([
        authFetch(`${API}/performance/dashboard`, { headers: headers() }),
        authFetch(`${API}/okr/tree`, { headers: headers() }),
        authFetch(`${API}/performance/reviews`, { headers: headers() }),
        authFetch(`${API}/okr/progress-report`, { headers: headers() })
      ]);
      setDashboard(await dRes.json());
      setOkrTree(await tRes.json());
      setReviews(await rRes.json());
      setProgressReport(await pRes.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addObjective = async () => {
    await authFetch(`${API}/okr/objectives`, { method: "POST", headers: headers(), body: JSON.stringify(newObj) });
    setShowAddObj(false);
    setNewObj({ title: '', description: '', department: '', level: 'team', period: newObj.period });
    load();
  };

  const toggleExpand = (id: number) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  };

  const levelLabels: Record<string,string> = { company: 'חברה', department: 'מחלקה', team: 'צוות', individual: 'אישי' };
  const levelColors: Record<string,string> = { company: 'bg-purple-500/20 text-purple-300', department: 'bg-indigo-500/20 text-indigo-300', team: 'bg-teal-500/20 text-teal-300', individual: 'bg-amber-500/20 text-amber-300' };
  const statusLabels: Record<string,string> = { active: 'פעיל', completed: 'הושלם', cancelled: 'בוטל', on_hold: 'מושהה', at_risk: 'בסיכון', behind: 'מאחור' };

  const tabs = [
    { key: "overview", label: "סקירה", icon: BarChart3 },
    { key: "okr", label: "OKR עץ", icon: Target },
    { key: "reviews", label: "סקירות ביצוע", icon: Star },
    { key: "competencies", label: "כשירויות", icon: Brain }
  ] as const;

  if (loading) return <div className="flex items-center justify-center h-96"><RefreshCw className="w-8 h-8 animate-spin text-indigo-400" /></div>;

  const renderOkrNode = (node: any, depth: number = 0) => {
    const isExpanded = expanded.has(node.id);
    const hasChildren = (node.children?.length || 0) > 0 || (node.key_results?.length || 0) > 0;
    const progressColor = node.progress >= 70 ? 'emerald' : node.progress >= 40 ? 'amber' : 'red';

    return (
      <div key={node.id} style={{ marginRight: depth * 24 }}>
        <div className={`p-3 rounded-xl border ${depth === 0 ? 'border-indigo-500/20 bg-indigo-500/5' : 'border-white/5 bg-white/[0.02]'} mb-2`}>
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => toggleExpand(node.id)}>
            {hasChildren && (isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronLeft className="w-4 h-4 text-muted-foreground" />)}
            <span className={`text-xs px-2 py-0.5 rounded ${levelColors[node.level] || ''}`}>{levelLabels[node.level]}</span>
            <span className="font-medium text-sm flex-1">{node.title}</span>
            <span className="text-xs text-muted-foreground">{node.department}</span>
          </div>
          <div className="mt-2"><ProgressBar value={node.progress} color={progressColor} /></div>
        </div>

        {isExpanded && (
          <div className="space-y-1 mb-3" style={{ marginRight: 16 }}>
            {(node.key_results || []).map((kr: any) => (
              <div key={kr.id} className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.02] border border-white/5 text-sm">
                <Target className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                <span className="flex-1">{kr.title}</span>
                <span className="text-xs text-muted-foreground">{Number(kr.current_value)}/{Number(kr.target_value)}</span>
                <div className="w-24"><ProgressBar value={kr.progress} /></div>
              </div>
            ))}
            {(node.children || []).map((child: any) => renderOkrNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-l from-amber-400 to-orange-400 bg-clip-text text-transparent">
            ביצועים ו-OKR
          </h1>
          <p className="text-muted-foreground mt-1">ניהול יעדים, סקירות ביצוע והערכת כשירויות</p>
        </div>
        <button onClick={() => setShowAddObj(true)} className="flex items-center gap-1 px-3 py-2 bg-amber-500/20 text-amber-300 rounded-lg text-sm hover:bg-amber-500/30">
          <Plus className="w-4 h-4" />יעד חדש
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Target, label: 'יעדים', value: progressReport?.total || 0, sub: `${progressReport?.completed || 0} הושלמו`, color: 'from-indigo-500/20 to-indigo-600/5', ic: 'text-indigo-400' },
          { icon: TrendingUp, label: 'התקדמות ממוצעת', value: `${progressReport?.avgProgress || 0}%`, sub: '', color: 'from-emerald-500/20 to-emerald-600/5', ic: 'text-emerald-400' },
          { icon: Star, label: 'סקירות ביצוע', value: reviews.length, sub: '', color: 'from-amber-500/20 to-amber-600/5', ic: 'text-amber-400' },
          { icon: Brain, label: 'כשירויות', value: dashboard?.competencyOverview?.length || 0, sub: '', color: 'from-purple-500/20 to-purple-600/5', ic: 'text-purple-400' }
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity:0,y:10 }} animate={{ opacity:1,y:0 }} transition={{ delay:i*0.1 }}
            className={`bg-gradient-to-br ${s.color} border border-white/10 rounded-2xl p-5`}>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2"><s.icon className={`w-4 h-4 ${s.ic}`} />{s.label}</div>
            <div className="text-2xl font-bold">{s.value}</div>
            {s.sub && <div className="text-xs text-muted-foreground mt-1">{s.sub}</div>}
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition ${
              tab === t.key ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-muted-foreground hover:bg-white/5'
            }`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Progress by Level */}
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="bg-card border border-white/10 rounded-2xl p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><Layers className="w-4 h-4 text-indigo-400" />התקדמות לפי רמה</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={(progressReport?.byLevel || []).map((l: any) => ({ level: levelLabels[l.level] || l.level, progress: Math.round(Number(l.avg_progress)), count: Number(l.count) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="level" stroke="#666" />
                <YAxis stroke="#666" />
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333' }} />
                <Bar dataKey="progress" name="התקדמות %" fill="#6366f1" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Progress by Dept */}
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="bg-card border border-white/10 rounded-2xl p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><Users className="w-4 h-4 text-teal-400" />התקדמות לפי מחלקה</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={(progressReport?.byDepartment || []).filter((d: any) => d.department).map((d: any) => ({ dept: d.department, progress: Math.round(Number(d.avg_progress)), count: Number(d.count) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="dept" stroke="#666" tick={{ fontSize: 10 }} />
                <YAxis stroke="#666" />
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333' }} />
                <Bar dataKey="progress" name="התקדמות %" fill="#14b8a6" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Review Rating Distribution */}
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="bg-card border border-white/10 rounded-2xl p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><Star className="w-4 h-4 text-amber-400" />התפלגות דירוגים</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={(dashboard?.reviewStats || []).map((r: any) => ({ name: statusLabels[r.status] || r.status, value: Number(r.count) }))}
                  dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {(dashboard?.reviewStats || []).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Top Performers */}
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="bg-card border border-white/10 rounded-2xl p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><Award className="w-4 h-4 text-amber-400" />מצטיינים</h3>
            <div className="space-y-2">
              {(dashboard?.topPerformers || []).slice(0, 8).map((p: any, i: number) => (
                <div key={p.employee_id} className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.02]">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i < 3 ? 'bg-amber-500/30 text-amber-300' : 'bg-white/10 text-muted-foreground'}`}>{i+1}</span>
                  <span className="flex-1 text-sm">עובד #{p.employee_id}</span>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.round(Number(p.avg_rating)) }, (_, j) => (
                      <Star key={j} className="w-3 h-3 text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">{Number(p.avg_rating).toFixed(1)}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* OKR Tree */}
      {tab === "okr" && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="space-y-2">
          {okrTree.map(node => renderOkrNode(node))}
          {okrTree.length === 0 && <p className="text-center text-muted-foreground py-12">אין יעדים עדיין - צור יעד ראשון</p>}
        </motion.div>
      )}

      {/* Reviews */}
      {tab === "reviews" && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="space-y-3">
          {reviews.map(r => (
            <div key={r.id} className="bg-card border border-white/10 rounded-xl p-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">עובד #{r.employee_id}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">{r.period}</span>
                    <span className="text-xs text-muted-foreground">{statusLabels[r.status] || r.status}</span>
                  </div>
                  {r.overall_rating && (
                    <div className="flex items-center gap-1 mb-1">
                      {Array.from({ length: r.overall_rating }, (_, i) => <Star key={i} className="w-3 h-3 text-amber-400 fill-amber-400" />)}
                      {Array.from({ length: 5 - r.overall_rating }, (_, i) => <Star key={i} className="w-3 h-3 text-muted-foreground" />)}
                    </div>
                  )}
                  {r.strengths && <p className="text-xs text-emerald-400 mt-1">חוזקות: {r.strengths}</p>}
                  {r.improvements && <p className="text-xs text-amber-400 mt-1">לשיפור: {r.improvements}</p>}
                </div>
                <FileText className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          ))}
          {reviews.length === 0 && <p className="text-center text-muted-foreground py-12">אין סקירות ביצוע עדיין</p>}
        </motion.div>
      )}

      {/* Competencies */}
      {tab === "competencies" && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="space-y-6">
          <div className="bg-card border border-white/10 rounded-2xl p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><Brain className="w-4 h-4 text-purple-400" />תרשים כשירויות - עכביש</h3>
            <ResponsiveContainer width="100%" height={350}>
              <RadarChart data={(dashboard?.competencyOverview || []).map((c: any) => ({
                competency: c.competency,
                manager: Number(c.avg_manager || 0).toFixed(1),
                self: Number(c.avg_self || 0).toFixed(1),
                peer: Number(c.avg_peer || 0).toFixed(1)
              }))}>
                <PolarGrid stroke="#333" />
                <PolarAngleAxis dataKey="competency" stroke="#666" tick={{ fontSize: 10 }} />
                <PolarRadiusAxis stroke="#444" domain={[0, 5]} />
                <Radar name="מנהל" dataKey="manager" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} />
                <Radar name="עצמי" dataKey="self" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} />
                <Radar name="עמיתים" dataKey="peer" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
                <Legend />
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333' }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {(dashboard?.competencyOverview || []).map((c: any) => (
              <div key={c.competency} className="bg-card border border-white/10 rounded-xl p-4">
                <h4 className="text-sm font-medium mb-2">{c.competency}</h4>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">מנהל</span><span className="text-indigo-400">{Number(c.avg_manager).toFixed(1)}/5</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">עצמי</span><span className="text-amber-400">{Number(c.avg_self).toFixed(1)}/5</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">עמיתים</span><span className="text-emerald-400">{Number(c.avg_peer).toFixed(1)}/5</span></div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Add Objective Modal */}
      {showAddObj && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddObj(false)}>
          <div className="bg-card border border-white/10 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-4">יעד חדש (OKR)</h3>
            <div className="space-y-3">
              <input placeholder="כותרת היעד" value={newObj.title} onChange={e => setNewObj(p => ({...p, title: e.target.value}))}
                className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm" />
              <textarea placeholder="תיאור" value={newObj.description} onChange={e => setNewObj(p => ({...p, description: e.target.value}))}
                className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm" rows={3} />
              <input placeholder="מחלקה" value={newObj.department} onChange={e => setNewObj(p => ({...p, department: e.target.value}))}
                className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm" />
              <select value={newObj.level} onChange={e => setNewObj(p => ({...p, level: e.target.value}))}
                className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm">
                {Object.entries(levelLabels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input placeholder="תקופה (Q1-2026)" value={newObj.period} onChange={e => setNewObj(p => ({...p, period: e.target.value}))}
                className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm" />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAddObj(false)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-white/5 rounded-lg">ביטול</button>
                <button onClick={addObjective} className="px-4 py-2 text-sm bg-amber-500/20 text-amber-300 rounded-lg hover:bg-amber-500/30">שמור</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
