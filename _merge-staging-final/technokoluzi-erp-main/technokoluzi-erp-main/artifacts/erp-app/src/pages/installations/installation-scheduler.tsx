import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Calendar, Truck, Users, Star, Clock, CheckCircle, XCircle, AlertTriangle,
  Loader2, RefreshCw, MapPin, Phone, DollarSign, BarChart3, Package,
  ChevronLeft, ChevronRight, Zap, ThumbsUp, MessageSquare, Eye, Wrench,
  ArrowUpDown
} from "lucide-react";

const API = "/api";
const getHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("erp_token") || ""}` });
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);

type Installation = {
  id: number; project_id: number; customer_name: string; customer_address: string;
  customer_city: string; customer_phone: string; installer_id: number; installer_name: string;
  scheduled_date: string; estimated_hours: number; actual_hours: number | null;
  project_value: number; value_category: string; status: string; notes: string;
};
type Group = {
  id: number; group_date: string; installer_id: number; total_value: number;
  installations: number[]; route_order: number[]; status: string;
};
type Dashboard = {
  stats: Record<string, any>; byCategory: any[]; upcoming: Installation[];
  groups: Group[]; feedback: Record<string, any>;
};

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  scheduled: { label: "מתוכנן", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Calendar },
  confirmed: { label: "מאושר", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30", icon: CheckCircle },
  in_progress: { label: "בביצוע", color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: Wrench },
  completed: { label: "הושלם", color: "bg-green-500/20 text-green-400 border-green-500/30", icon: CheckCircle },
  rejected: { label: "נדחה", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: XCircle },
  rescheduled: { label: "נדחה מחדש", color: "bg-purple-500/20 text-purple-400 border-purple-500/30", icon: Clock },
};

const VALUE_CAT_MAP: Record<string, { label: string; color: string }> = {
  small: { label: "קטן (<20K)", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  medium: { label: "בינוני (25-40K)", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  large: { label: "גדול (>40K)", color: "bg-red-500/20 text-red-400 border-red-500/30" },
};

const GROUP_STATUS_MAP: Record<string, { label: string; color: string }> = {
  planning: { label: "תכנון", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  confirmed: { label: "מאושר", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  in_progress: { label: "בביצוע", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  completed: { label: "הושלם", color: "bg-green-500/20 text-green-400 border-green-500/30" },
};

// Star rating component
function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`w-3 h-3 ${i <= Math.round(rating) ? "text-amber-400 fill-amber-400" : "text-white/20"}`} />
      ))}
    </div>
  );
}

export default function InstallationSchedulerPage() {
  const [tab, setTab] = useState<"dashboard" | "calendar" | "groups" | "feedback">("dashboard");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [pending, setPending] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [calMonth, setCalMonth] = useState(3); // April = 3 (0-indexed)
  const [calYear, setCalYear] = useState(2026);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showFeedbackForm, setShowFeedbackForm] = useState<number | null>(null);
  const [feedbackForm, setFeedbackForm] = useState({ process: 5, service: 5, quality: 5, agent: 5, overall: 5, recommend: true, text: "" });

  const fetchDashboard = useCallback(async () => {
    try {
      const r = await fetch(`${API}/installation-scheduler/dashboard`, { headers: getHeaders() });
      setDashboard(await r.json());
    } catch {}
  }, []);

  const fetchPending = useCallback(async () => {
    try {
      const r = await fetch(`${API}/installation-scheduler/pending`, { headers: getHeaders() });
      const d = await r.json();
      setPending(d.data || []);
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchDashboard(), fetchPending()]);
      setLoading(false);
    })();
  }, [fetchDashboard, fetchPending]);

  const confirmInstallation = async (id: number) => {
    await fetch(`${API}/installation-scheduler/confirm/${id}`, { method: "POST", headers: getHeaders() });
    fetchDashboard(); fetchPending();
  };

  const autoGroup = async () => {
    await fetch(`${API}/installation-scheduler/auto-group`, {
      method: "POST", headers: getHeaders(),
      body: JSON.stringify({ date: "2026-04-15" }),
    });
    fetchDashboard();
  };

  const submitFeedback = async (installationId: number) => {
    await fetch(`${API}/installation-scheduler/feedback/${installationId}`, {
      method: "POST", headers: getHeaders(),
      body: JSON.stringify({
        process_rating: feedbackForm.process, service_rating: feedbackForm.service,
        quality_rating: feedbackForm.quality, agent_rating: feedbackForm.agent,
        overall_rating: feedbackForm.overall, would_recommend: feedbackForm.recommend,
        feedback_text: feedbackForm.text,
      }),
    });
    setShowFeedbackForm(null);
    setFeedbackForm({ process: 5, service: 5, quality: 5, agent: 5, overall: 5, recommend: true, text: "" });
    fetchDashboard();
  };

  // Calendar data
  const calendarInstalls = useMemo(() => {
    const map: Record<string, Installation[]> = {};
    for (const inst of (dashboard?.upcoming || []).concat(pending)) {
      const d = inst.scheduled_date?.slice(0, 10);
      if (d) { if (!map[d]) map[d] = []; map[d].push(inst); }
    }
    return map;
  }, [dashboard, pending]);

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay();
  const monthName = new Date(calYear, calMonth).toLocaleDateString("he-IL", { month: "long", year: "numeric" });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        <span className="text-white/60 mr-3">טוען לוח התקנות...</span>
      </div>
    );
  }

  const stats = dashboard?.stats;
  const fb = dashboard?.feedback;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="w-7 h-7 text-amber-400" />
            מתזמן התקנות חכם
          </h1>
          <p className="text-white/50 text-sm mt-1">תזמון, קיבוץ ומעקב התקנות לפי ערך פרויקט</p>
        </div>
        <div className="flex gap-2">
          <button onClick={autoGroup}
            className="px-4 py-2 bg-amber-600 rounded-lg text-sm hover:bg-amber-700 flex items-center gap-2">
            <Zap className="w-4 h-4" /> קיבוץ אוטומטי
          </button>
          <button onClick={() => { fetchDashboard(); fetchPending(); }}
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 flex items-center gap-2 text-sm">
            <RefreshCw className="w-4 h-4" /> רענון
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {([
          { key: "dashboard", label: "דשבורד", icon: BarChart3 },
          { key: "calendar", label: "לוח שנה", icon: Calendar },
          { key: "groups", label: "קבוצות התקנה", icon: Package },
          { key: "feedback", label: "משוב לקוחות", icon: MessageSquare },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-all ${
              tab === t.key ? "bg-amber-600 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* ─── DASHBOARD ─── */}
      {tab === "dashboard" && stats && (
        <div className="space-y-6">
          {/* KPI */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {[
              { label: "סה\"כ", value: stats.total || 0, icon: Package, color: "text-blue-400" },
              { label: "מתוכננים", value: stats.scheduled || 0, icon: Calendar, color: "text-blue-400" },
              { label: "מאושרים", value: stats.confirmed || 0, icon: CheckCircle, color: "text-cyan-400" },
              { label: "בביצוע", value: stats.in_progress || 0, icon: Wrench, color: "text-amber-400" },
              { label: "הושלמו", value: stats.completed || 0, icon: CheckCircle, color: "text-green-400" },
              { label: "ערך כולל", value: fmtC(Number(stats.total_value) || 0), icon: DollarSign, color: "text-green-400" },
              { label: "שעות ממוצע", value: `${Number(stats.avg_estimated_hours || 0).toFixed(1)}`, icon: Clock, color: "text-purple-400" },
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

          {/* By Category */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <ArrowUpDown className="w-5 h-5 text-amber-400" /> חלוקה לפי ערך
              </h3>
              <div className="space-y-3">
                {(dashboard?.byCategory || []).map((c: any) => {
                  const cat = VALUE_CAT_MAP[c.value_category] || VALUE_CAT_MAP.small;
                  return (
                    <div key={c.value_category} className="flex items-center gap-4 bg-white/5 rounded-lg p-3">
                      <span className={`text-xs px-3 py-1 rounded-full border ${cat.color}`}>{cat.label}</span>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{c.cnt} התקנות</div>
                      </div>
                      <div className="text-green-400 font-bold">{fmtC(Number(c.val))}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Feedback Summary */}
            {fb && Number(fb.total_feedback) > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Star className="w-5 h-5 text-amber-400" /> סיכום משוב ({fb.total_feedback} תגובות)
                </h3>
                <div className="space-y-3">
                  {[
                    { label: "תהליך", value: Number(fb.avg_process) || 0 },
                    { label: "שירות", value: Number(fb.avg_service) || 0 },
                    { label: "איכות", value: Number(fb.avg_quality) || 0 },
                    { label: "סוכן", value: Number(fb.avg_agent) || 0 },
                    { label: "כללי", value: Number(fb.avg_overall) || 0 },
                  ].map(r => (
                    <div key={r.label} className="flex items-center gap-3">
                      <span className="text-sm text-white/60 w-16">{r.label}</span>
                      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(r.value / 5) * 100}%` }} />
                      </div>
                      <span className="text-sm font-bold w-8">{r.value.toFixed(1)}</span>
                      <Stars rating={r.value} />
                    </div>
                  ))}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/10">
                    <ThumbsUp className="w-4 h-4 text-green-400" />
                    <span className="text-sm">היו ממליצים: <span className="text-green-400 font-bold">{Number(fb.recommend_pct || 0).toFixed(0)}%</span></span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Upcoming */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <h3 className="text-lg font-semibold mb-4">התקנות קרובות</h3>
            <div className="space-y-2">
              {(dashboard?.upcoming || []).slice(0, 8).map((inst: Installation) => {
                const st = STATUS_MAP[inst.status] || STATUS_MAP.scheduled;
                const cat = VALUE_CAT_MAP[inst.value_category] || VALUE_CAT_MAP.small;
                return (
                  <div key={inst.id} className="flex items-center gap-4 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
                    <st.icon className={`w-5 h-5 flex-shrink-0 ${st.color.split(" ")[1]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{inst.customer_name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${st.color}`}>{st.label}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${cat.color}`}>{cat.label}</span>
                      </div>
                      <div className="text-xs text-white/40 mt-1 flex items-center gap-3">
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {inst.customer_city}</span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {inst.scheduled_date?.slice(0, 10)}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {inst.estimated_hours} שעות</span>
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {inst.installer_name}</span>
                      </div>
                    </div>
                    <div className="text-green-400 font-bold text-sm">{fmtC(Number(inst.project_value))}</div>
                    {inst.status === "scheduled" && (
                      <button onClick={() => confirmInstallation(inst.id)}
                        className="px-3 py-1 bg-cyan-600 rounded text-xs hover:bg-cyan-700">אשר</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── CALENDAR ─── */}
      {tab === "calendar" && (
        <div className="space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            {/* Month Navigation */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }}
                className="p-2 hover:bg-white/10 rounded-lg"><ChevronRight className="w-5 h-5" /></button>
              <h3 className="text-lg font-semibold">{monthName}</h3>
              <button onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }}
                className="p-2 hover:bg-white/10 rounded-lg"><ChevronLeft className="w-5 h-5" /></button>
            </div>

            {/* Day Headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"].map(d => (
                <div key={d} className="text-center text-xs text-white/40 py-1">{d}</div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const installs = calendarInstalls[dateStr] || [];
                const isSelected = selectedDate === dateStr;
                return (
                  <button key={day} onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                    className={`min-h-[80px] p-1 rounded-lg border text-right align-top transition-all ${
                      isSelected ? "bg-amber-600/20 border-amber-500/50" :
                      installs.length > 0 ? "bg-white/5 border-white/10 hover:bg-white/10" : "border-transparent hover:bg-white/5"
                    }`}>
                    <div className="text-xs font-medium mb-1">{day}</div>
                    {installs.slice(0, 3).map((inst, idx) => {
                      const cat = VALUE_CAT_MAP[inst.value_category] || VALUE_CAT_MAP.small;
                      return (
                        <div key={idx} className={`text-[9px] px-1 py-0.5 rounded mb-0.5 truncate ${cat.color}`}>
                          {inst.customer_name}
                        </div>
                      );
                    })}
                    {installs.length > 3 && <div className="text-[9px] text-white/30">+{installs.length - 3} עוד</div>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Date Details */}
          {selectedDate && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <h3 className="text-lg font-semibold mb-4">
                התקנות ליום {new Date(selectedDate).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}
              </h3>
              <div className="space-y-3">
                {(calendarInstalls[selectedDate] || []).map(inst => {
                  const st = STATUS_MAP[inst.status] || STATUS_MAP.scheduled;
                  return (
                    <div key={inst.id} className="flex items-center gap-4 p-4 bg-white/5 rounded-lg">
                      <st.icon className={`w-6 h-6 ${st.color.split(" ")[1]}`} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold">{inst.customer_name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${st.color}`}>{st.label}</span>
                        </div>
                        <div className="text-sm text-white/50 flex flex-wrap gap-3">
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {inst.customer_address}, {inst.customer_city}</span>
                          <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {inst.customer_phone}</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {inst.estimated_hours} שעות</span>
                          <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {inst.installer_name}</span>
                        </div>
                      </div>
                      <div className="text-green-400 font-bold">{fmtC(Number(inst.project_value))}</div>
                    </div>
                  );
                })}
                {(calendarInstalls[selectedDate] || []).length === 0 && (
                  <div className="text-center text-white/30 py-6">אין התקנות מתוכננות ליום זה</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── GROUPS ─── */}
      {tab === "groups" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">קבוצות התקנה</h3>
            <button onClick={autoGroup}
              className="px-4 py-2 bg-amber-600 rounded-lg text-sm hover:bg-amber-700 flex items-center gap-2">
              <Zap className="w-4 h-4" /> קיבוץ אוטומטי חדש
            </button>
          </div>

          {(dashboard?.groups || []).length === 0 ? (
            <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center">
              <Package className="w-12 h-12 text-white/20 mx-auto mb-3" />
              <div className="text-white/40">אין קבוצות התקנה. לחץ על "קיבוץ אוטומטי" ליצירה.</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(dashboard?.groups || []).map((g: Group) => {
                const gst = GROUP_STATUS_MAP[g.status] || GROUP_STATUS_MAP.planning;
                return (
                  <div key={g.id} className="bg-white/5 border border-white/10 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Package className="w-5 h-5 text-amber-400" />
                        <span className="font-semibold">קבוצה #{g.id}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${gst.color}`}>{gst.label}</span>
                      </div>
                      <span className="text-green-400 font-bold">{fmtC(Number(g.total_value))}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-white/50 mb-3">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {g.group_date?.slice(0, 10)}</span>
                      <span className="flex items-center gap-1"><Truck className="w-3 h-3" /> {(g.installations || []).length} התקנות</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(g.installations || []).map((id: number, i: number) => (
                        <span key={i} className="text-xs bg-white/10 px-2 py-1 rounded">#{id}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pending for grouping */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <h3 className="text-lg font-semibold mb-4">התקנות ממתינות לקיבוץ</h3>
            <div className="space-y-2">
              {pending.filter(p => p.status === "scheduled" || p.status === "rescheduled").map(inst => {
                const cat = VALUE_CAT_MAP[inst.value_category] || VALUE_CAT_MAP.small;
                return (
                  <div key={inst.id} className="flex items-center gap-4 p-3 bg-white/5 rounded-lg">
                    <span className="text-xs font-mono text-white/30">#{inst.id}</span>
                    <span className="font-medium flex-1">{inst.customer_name}</span>
                    <span className="flex items-center gap-1 text-xs text-white/40"><MapPin className="w-3 h-3" /> {inst.customer_city}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${cat.color}`}>{cat.label}</span>
                    <span className="text-green-400 font-bold text-sm">{fmtC(Number(inst.project_value))}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── FEEDBACK ─── */}
      {tab === "feedback" && (
        <div className="space-y-6">
          {/* Feedback summary */}
          {fb && Number(fb.total_feedback) > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-400" /> סיכום דירוגים ({fb.total_feedback} תגובות)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                  { label: "תהליך", value: Number(fb.avg_process) || 0 },
                  { label: "שירות", value: Number(fb.avg_service) || 0 },
                  { label: "איכות", value: Number(fb.avg_quality) || 0 },
                  { label: "סוכן", value: Number(fb.avg_agent) || 0 },
                  { label: "כללי", value: Number(fb.avg_overall) || 0 },
                ].map(r => (
                  <div key={r.label} className="bg-white/5 rounded-xl p-4 text-center">
                    <div className="text-xs text-white/50 mb-2">{r.label}</div>
                    <div className="text-2xl font-bold mb-1">{r.value.toFixed(1)}</div>
                    <Stars rating={r.value} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed installations for feedback */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <h3 className="text-lg font-semibold mb-4">התקנות שהושלמו - שלח משוב</h3>
            <div className="space-y-3">
              {(dashboard?.upcoming || []).concat(pending).filter(i => i.status === "completed").map(inst => (
                <div key={inst.id} className="bg-white/5 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-green-400" />
                      <span className="font-medium">{inst.customer_name}</span>
                      <span className="text-xs text-white/40">{inst.customer_city}</span>
                    </div>
                    <button onClick={() => setShowFeedbackForm(showFeedbackForm === inst.id ? null : inst.id)}
                      className="px-3 py-1 bg-amber-600 rounded text-xs hover:bg-amber-700 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" /> {showFeedbackForm === inst.id ? "סגור" : "הוסף משוב"}
                    </button>
                  </div>

                  {showFeedbackForm === inst.id && (
                    <div className="mt-4 pt-4 border-t border-white/10 space-y-4">
                      {[
                        { key: "process", label: "תהליך" },
                        { key: "service", label: "שירות" },
                        { key: "quality", label: "איכות" },
                        { key: "agent", label: "סוכן" },
                        { key: "overall", label: "כללי" },
                      ].map(field => (
                        <div key={field.key} className="flex items-center gap-3">
                          <span className="text-sm text-white/60 w-16">{field.label}</span>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map(v => (
                              <button key={v} onClick={() => setFeedbackForm(f => ({ ...f, [field.key]: v }))}
                                className="p-1">
                                <Star className={`w-6 h-6 transition-colors ${
                                  v <= (feedbackForm as any)[field.key] ? "text-amber-400 fill-amber-400" : "text-white/20"
                                }`} />
                              </button>
                            ))}
                          </div>
                          <span className="text-sm font-bold">{(feedbackForm as any)[field.key]}/5</span>
                        </div>
                      ))}
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-white/60 w-16">ממליץ?</span>
                        <button onClick={() => setFeedbackForm(f => ({ ...f, recommend: !f.recommend }))}
                          className={`px-3 py-1 rounded-lg text-sm border ${
                            feedbackForm.recommend ? "bg-green-500/20 text-green-400 border-green-500/30" :
                            "bg-red-500/20 text-red-400 border-red-500/30"}`}>
                          {feedbackForm.recommend ? "כן" : "לא"}
                        </button>
                      </div>
                      <textarea className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white resize-none"
                        rows={3} placeholder="הערות (אופציונלי)..."
                        value={feedbackForm.text} onChange={e => setFeedbackForm(f => ({ ...f, text: e.target.value }))} />
                      <button onClick={() => submitFeedback(inst.id)}
                        className="px-6 py-2 bg-green-600 rounded-lg text-sm hover:bg-green-700 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" /> שלח משוב
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
