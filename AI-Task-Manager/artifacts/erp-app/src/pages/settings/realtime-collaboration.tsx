import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Users, Lock, MessageSquare, Eye, Wifi, WifiOff, Clock, Shield,
  RefreshCw, Unlock, CheckCircle2, XCircle, Send, UserCircle,
  Activity, AlertTriangle, ChevronDown
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || document.cookie.match(/token=([^;]+)/)?.[1] || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

const STATUS_MAP: Record<string, { label: string; color: string; icon: typeof Wifi }> = {
  active: { label: "פעיל", color: "text-emerald-400", icon: Wifi },
  idle: { label: "לא פעיל", color: "text-amber-400", icon: Clock },
  disconnected: { label: "מנותק", color: "text-red-400", icon: WifiOff },
};

const LOCK_TYPE_MAP: Record<string, { label: string; color: string }> = {
  edit: { label: "עריכה", color: "bg-blue-500/20 text-blue-300" },
  approval: { label: "אישור", color: "bg-purple-500/20 text-purple-300" },
  processing: { label: "עיבוד", color: "bg-orange-500/20 text-orange-300" },
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

export default function RealtimeCollaboration() {
  const [tab, setTab] = useState<"dashboard" | "sessions" | "locks" | "comments">("dashboard");
  const [dashboard, setDashboard] = useState<any>(null);
  const [locks, setLocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewLock, setShowNewLock] = useState(false);
  const [newLock, setNewLock] = useState({ entity_type: "", entity_id: "", lock_type: "edit", reason: "", expires_minutes: "30" });
  const [newComment, setNewComment] = useState({ entity_type: "", entity_id: "", comment: "" });
  const [showNewComment, setShowNewComment] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [dashRes, locksRes] = await Promise.all([
        authFetch(`${API}/collaboration/dashboard`, { headers: headers() }).then(r => r.json()).catch(() => null),
        authFetch(`${API}/collaboration/locks`, { headers: headers() }).then(r => r.json()).catch(() => []),
      ]);
      setDashboard(dashRes);
      setLocks(locksRes);
    } catch { }
    setLoading(false);
  }

  async function releaseLock(id: number) {
    await authFetch(`${API}/collaboration/lock/${id}`, { method: "DELETE", headers: headers() });
    await loadAll();
  }

  async function createLock() {
    await authFetch(`${API}/collaboration/lock`, {
      method: "POST", headers: headers(),
      body: JSON.stringify({ ...newLock, locked_by: "current_user", locked_by_name: "משתמש נוכחי" })
    });
    setShowNewLock(false);
    setNewLock({ entity_type: "", entity_id: "", lock_type: "edit", reason: "", expires_minutes: "30" });
    await loadAll();
  }

  async function addComment() {
    if (!newComment.comment.trim()) return;
    await authFetch(`${API}/collaboration/comments`, {
      method: "POST", headers: headers(),
      body: JSON.stringify({ ...newComment, user_id: "current_user", user_name: "משתמש נוכחי" })
    });
    setShowNewComment(false);
    setNewComment({ entity_type: "", entity_id: "", comment: "" });
    await loadAll();
  }

  async function resolveComment(id: number) {
    await authFetch(`${API}/collaboration/comments/${id}/resolve`, {
      method: "POST", headers: headers(), body: JSON.stringify({ resolved_by: "current_user" })
    });
    await loadAll();
  }

  const d = dashboard;

  const TABS = [
    { key: "dashboard", label: "דשבורד", icon: Activity },
    { key: "sessions", label: "מפגשים פעילים", icon: Users },
    { key: "locks", label: "נעילות", icon: Lock },
    { key: "comments", label: "הערות", icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white p-6" dir="rtl">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-green-600/20 to-blue-600/20 border border-green-500/30">
              <Users size={28} className="text-green-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">שיתוף פעולה בזמן אמת</h1>
              <p className="text-sm text-muted-foreground">Real-Time Collaboration Engine - מפגשים, נעילות, הערות</p>
            </div>
          </div>
          <button onClick={loadAll} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm">
            <RefreshCw size={14} /> רענון
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${
                tab === t.key ? "bg-green-600/20 border border-green-500/40 text-green-300" : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10"
              }`}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        {loading && <div className="text-center py-20 text-muted-foreground">טוען...</div>}

        {/* Dashboard */}
        {!loading && tab === "dashboard" && d && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={Users} label="משתמשים פעילים" value={d.sessions?.unique_users || 0} sub={`${d.sessions?.total_active || 0} מפגשים`} color="text-green-400" />
              <StatCard icon={Eye} label="ישויות בשימוש" value={d.sessions?.entities_in_use || 0} color="text-blue-400" />
              <StatCard icon={Lock} label="נעילות פעילות" value={d.locks?.total_locks || 0} color="text-orange-400" />
              <StatCard icon={MessageSquare} label="הערות לא פתורות" value={d.comments?.unresolved || 0} sub={`היום: ${d.comments?.today || 0}`} color="text-purple-400" />
            </div>

            {/* Active Entities */}
            {d.active_entities?.length > 0 && (
              <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
                <h3 className="text-lg font-bold mb-4">ישויות עם פעילות</h3>
                <div className="space-y-3">
                  {d.active_entities.map((e: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                      <div>
                        <span className="font-medium">{e.entity_type}</span>
                        <span className="text-muted-foreground mx-2">#{e.entity_id}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {e.users?.map((u: any, j: number) => (
                          <div key={j} className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${u.status === "active" ? "bg-emerald-400" : "bg-amber-400"}`} />
                            <span className="text-xs">{u.user_name}</span>
                          </div>
                        ))}
                        <span className="text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded">{e.user_count} משתמשים</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Comments */}
            {d.recent_comments?.length > 0 && (
              <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
                <h3 className="text-lg font-bold mb-4">הערות אחרונות</h3>
                <div className="space-y-2">
                  {d.recent_comments.slice(0, 10).map((c: any) => (
                    <div key={c.id} className={`p-3 rounded-lg border ${c.resolved ? "bg-white/5 border-white/5" : "bg-purple-500/5 border-purple-500/20"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <UserCircle size={14} className="text-muted-foreground" />
                          <span className="text-sm font-medium">{c.user_name || "משתמש"}</span>
                          <span className="text-xs text-muted-foreground">{c.entity_type} #{c.entity_id}</span>
                          {c.field_name && <span className="text-xs bg-white/10 px-1.5 py-0.5 rounded">{c.field_name}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          {c.resolved ? (
                            <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12} /> נפתר</span>
                          ) : (
                            <button onClick={() => resolveComment(c.id)} className="text-xs px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded hover:bg-emerald-500/30">סמן נפתר</button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">{c.comment}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sessions Tab */}
        {!loading && tab === "sessions" && d && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold">מפגשים פעילים ({d.sessions?.total_active || 0})</h3>
            {d.active_entities?.length > 0 ? d.active_entities.map((e: any, i: number) => (
              <div key={i} className="bg-[#1a1d23] border border-white/10 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Activity size={16} className="text-green-400" />
                  <span className="font-medium">{e.entity_type} #{e.entity_id}</span>
                  <span className="text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded">{e.user_count} משתמשים</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {e.users?.map((u: any, j: number) => {
                    const st = STATUS_MAP[u.status] || STATUS_MAP.active;
                    return (
                      <div key={j} className="flex items-center gap-2 p-2 bg-white/5 rounded-lg">
                        <div className={`w-2 h-2 rounded-full ${u.status === "active" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                        <span className="text-sm">{u.user_name}</span>
                        <span className={`text-xs ${st.color}`}>{st.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )) : <div className="text-center py-12 text-muted-foreground">אין מפגשים פעילים כרגע</div>}
          </div>
        )}

        {/* Locks Tab */}
        {!loading && tab === "locks" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">נעילות פעילות ({locks.length})</h3>
              <button onClick={() => setShowNewLock(!showNewLock)}
                className="px-4 py-2 rounded-lg bg-orange-600/20 border border-orange-500/40 text-orange-300 text-sm hover:bg-orange-600/30">
                + נעילה חדשה
              </button>
            </div>

            {showNewLock && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="bg-[#1a1d23] border border-orange-500/30 rounded-xl p-5">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <input value={newLock.entity_type} onChange={e => setNewLock({ ...newLock, entity_type: e.target.value })}
                    placeholder="סוג ישות" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                  <input value={newLock.entity_id} onChange={e => setNewLock({ ...newLock, entity_id: e.target.value })}
                    placeholder="מזהה" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                  <select value={newLock.lock_type} onChange={e => setNewLock({ ...newLock, lock_type: e.target.value })}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm">
                    <option value="edit">עריכה</option>
                    <option value="approval">אישור</option>
                    <option value="processing">עיבוד</option>
                  </select>
                  <input value={newLock.reason} onChange={e => setNewLock({ ...newLock, reason: e.target.value })}
                    placeholder="סיבה" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                  <button onClick={createLock} className="bg-orange-600 rounded-lg text-sm hover:bg-orange-700">נעל</button>
                </div>
              </motion.div>
            )}

            <div className="space-y-3">
              {locks.map(l => {
                const lt = LOCK_TYPE_MAP[l.lock_type] || LOCK_TYPE_MAP.edit;
                return (
                  <div key={l.id} className="bg-[#1a1d23] border border-white/10 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Lock size={16} className="text-orange-400" />
                      <div>
                        <div className="font-medium">{l.entity_type} #{l.entity_id}</div>
                        <div className="text-xs text-muted-foreground">נעול ע״י {l.locked_by_name || l.locked_by} {l.reason && `- ${l.reason}`}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${lt.color}`}>{lt.label}</span>
                      {l.expires_at && <span className="text-xs text-muted-foreground">פג: {new Date(l.expires_at).toLocaleString("he-IL")}</span>}
                      <button onClick={() => releaseLock(l.id)} className="p-1.5 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30"><Unlock size={14} /></button>
                    </div>
                  </div>
                );
              })}
              {locks.length === 0 && <div className="text-center py-12 text-muted-foreground">אין נעילות פעילות</div>}
            </div>
          </div>
        )}

        {/* Comments Tab */}
        {!loading && tab === "comments" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">הערות ({d?.comments?.total || 0})</h3>
              <button onClick={() => setShowNewComment(!showNewComment)}
                className="px-4 py-2 rounded-lg bg-purple-600/20 border border-purple-500/40 text-purple-300 text-sm hover:bg-purple-600/30">
                + הערה חדשה
              </button>
            </div>

            {showNewComment && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="bg-[#1a1d23] border border-purple-500/30 rounded-xl p-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  <input value={newComment.entity_type} onChange={e => setNewComment({ ...newComment, entity_type: e.target.value })}
                    placeholder="סוג ישות" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                  <input value={newComment.entity_id} onChange={e => setNewComment({ ...newComment, entity_id: e.target.value })}
                    placeholder="מזהה" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                  <button onClick={addComment} className="bg-purple-600 rounded-lg text-sm hover:bg-purple-700 flex items-center justify-center gap-2"><Send size={14} /> שלח</button>
                </div>
                <textarea value={newComment.comment} onChange={e => setNewComment({ ...newComment, comment: e.target.value })}
                  placeholder="תוכן ההערה..." rows={2} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm resize-none" />
              </motion.div>
            )}

            <div className="space-y-2">
              {d?.recent_comments?.map((c: any) => (
                <div key={c.id} className={`p-4 rounded-xl border ${c.resolved ? "bg-[#1a1d23] border-white/5" : "bg-[#1a1d23] border-purple-500/20"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <UserCircle size={16} className="text-muted-foreground" />
                      <span className="font-medium text-sm">{c.user_name || "משתמש"}</span>
                      <span className="text-xs text-muted-foreground">{c.entity_type} #{c.entity_id}</span>
                      {c.field_name && <span className="text-xs bg-white/10 px-2 py-0.5 rounded">{c.field_name}</span>}
                      <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString("he-IL")}</span>
                    </div>
                    {!c.resolved && (
                      <button onClick={() => resolveComment(c.id)} className="text-xs px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-lg hover:bg-emerald-500/30 flex items-center gap-1">
                        <CheckCircle2 size={12} /> פתור
                      </button>
                    )}
                    {c.resolved && <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12} /> נפתר</span>}
                  </div>
                  <p className="text-sm">{c.comment}</p>
                </div>
              ))}
              {(!d?.recent_comments || d.recent_comments.length === 0) && <div className="text-center py-12 text-muted-foreground">אין הערות</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
