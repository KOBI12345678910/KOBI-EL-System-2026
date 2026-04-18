import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, ArrowRight, CheckCircle2, AlertTriangle, Clock, Bell,
  RefreshCw, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, Eye,
  Play, Pause, XCircle, TrendingUp, BarChart3, Filter, Search
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api/supply-chain";

const STEP_NAMES: Record<number, string> = {
  1: "סגירת עסקה",
  2: "קביעת מדידה",
  3: "ביצוע מדידה",
  4: "השוואת מדידות",
  5: "אישור מדידה",
  6: "שרטוט הנדסי",
  7: "אישור שרטוט",
  8: "בחירת יצרן",
  9: "התחלת ייצור",
  10: "ייצור - אמצע",
  11: "ייצור - סיום",
  12: "בדיקת איכות",
  13: "צביעה",
  14: "בדיקה אחרי צביעה",
  15: "תיאום התקנה",
  16: "ביצוע התקנה",
  17: "אישור לקוח",
  18: "משוב וסגירה",
};

interface Project {
  id: number;
  project_number: string;
  customer_name: string;
  agent_name: string;
  deal_amount: string;
  current_step: number;
  status: string;
  completed_steps?: string;
  blocked_steps?: string;
  created_at: string;
}

interface Step {
  id: number;
  step_number: number;
  step_name: string;
  step_status: string;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  requires_approval: boolean;
  approved_by: number | null;
}

interface DashboardData {
  activeByStep: Array<{ current_step: number; count: string }>;
  blockedProjects: Array<any>;
  remindersDue: Array<any>;
  stats: { active_count: string; completed_count: string; avg_days_to_complete: string; completion_rate: string };
}

export default function SupplyChainWorkflow() {
  const [tab, setTab] = useState<"pipeline" | "list" | "dashboard">("dashboard");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState({ status: "active", search: "" });
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<any>({});
  const [timeline, setTimeline] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filter.status) qs.set("status", filter.status);
      if (filter.search) qs.set("search", filter.search);
      const r = await authFetch(`${API}/projects?${qs}`);
      const d = await r.json();
      setProjects(d.projects || []);
    } catch { /* */ }
    setLoading(false);
  }, [filter]);

  const loadDashboard = useCallback(async () => {
    try {
      const r = await authFetch(`${API}/dashboard`);
      const d = await r.json();
      setDashboard(d);
    } catch { /* */ }
  }, []);

  useEffect(() => { load(); loadDashboard(); }, [load, loadDashboard]);

  const selectProject = async (id: number) => {
    try {
      const r = await authFetch(`${API}/projects/${id}`);
      const d = await r.json();
      setSelectedProject(d.project);
      setSteps(d.steps || []);
      // Load timeline
      const tr = await authFetch(`${API}/timeline/${id}`);
      const td = await tr.json();
      setTimeline(td.timeline || []);
    } catch { /* */ }
  };

  const advanceStep = async (projectId: number) => {
    try {
      await authFetch(`${API}/projects/${projectId}/advance-step`, { method: "POST" });
      await selectProject(projectId);
      load();
      loadDashboard();
    } catch { /* */ }
  };

  const approveStep = async (projectId: number, stepNumber: number) => {
    try {
      await authFetch(`${API}/projects/${projectId}/approve/${stepNumber}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved_by: 1, approval_type: "measurement" }),
      });
      await selectProject(projectId);
    } catch { /* */ }
  };

  const blockStep = async (projectId: number, stepNumber: number) => {
    const notes = prompt("תאר את הבעיה:");
    if (!notes) return;
    try {
      await authFetch(`${API}/projects/${projectId}/block/${stepNumber}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      await selectProject(projectId);
    } catch { /* */ }
  };

  const createProject = async () => {
    try {
      await authFetch(`${API}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      setShowCreate(false);
      setCreateForm({});
      load();
      loadDashboard();
    } catch { /* */ }
  };

  const stepColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-green-100 border-green-500 text-green-800";
      case "in_progress": return "bg-blue-100 border-blue-500 text-blue-800";
      case "blocked": return "bg-red-100 border-red-500 text-red-800";
      default: return "bg-gray-50 border-gray-300 text-gray-500";
    }
  };

  const stepIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case "in_progress": return <Play className="w-4 h-4 text-blue-600" />;
      case "blocked": return <AlertTriangle className="w-4 h-4 text-red-600" />;
      default: return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const fmt = (n: any) => Number(n || 0).toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });

  return (
    <div dir="rtl" className="p-4 space-y-4 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">שרשרת אספקה - 18 שלבים</h1>
          <p className="text-sm text-gray-500">ניהול מלא של תהליך הייצור מעסקה ועד התקנה</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
            + פרויקט חדש
          </button>
          <button onClick={() => { load(); loadDashboard(); }} className="p-2 border rounded-lg hover:bg-gray-100">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-lg p-1 border shadow-sm w-fit">
        {[
          { key: "dashboard", label: "דשבורד", icon: <BarChart3 className="w-4 h-4" /> },
          { key: "pipeline", label: "צפייה בצינור", icon: <TrendingUp className="w-4 h-4" /> },
          { key: "list", label: "רשימת פרויקטים", icon: <Filter className="w-4 h-4" /> },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${tab === t.key ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Dashboard Tab */}
      {tab === "dashboard" && dashboard && (
        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "פרויקטים פעילים", value: dashboard.stats.active_count, color: "blue", icon: <Play className="w-5 h-5" /> },
              { label: "הושלמו", value: dashboard.stats.completed_count, color: "green", icon: <CheckCircle2 className="w-5 h-5" /> },
              { label: "ממוצע ימים", value: `${dashboard.stats.avg_days_to_complete || "—"} ימים`, color: "purple", icon: <Clock className="w-5 h-5" /> },
              { label: "אחוז השלמה", value: `${dashboard.stats.completion_rate || 0}%`, color: "amber", icon: <TrendingUp className="w-5 h-5" /> },
            ].map((kpi, i) => (
              <div key={i} className={`bg-white rounded-xl border p-4 shadow-sm`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">{kpi.label}</span>
                  <div className={`text-${kpi.color}-600`}>{kpi.icon}</div>
                </div>
                <div className="text-2xl font-bold text-gray-800">{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* Active projects by step */}
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <h3 className="font-semibold mb-3">פרויקטים פעילים לפי שלב</h3>
            <div className="grid grid-cols-9 gap-1">
              {Array.from({ length: 18 }, (_, i) => {
                const stepData = dashboard.activeByStep.find((s) => Number(s.current_step) === i + 1);
                const count = Number(stepData?.count || 0);
                return (
                  <div key={i} className={`text-center p-2 rounded-lg border text-xs ${count > 0 ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"}`}>
                    <div className="font-bold text-lg">{count}</div>
                    <div className="text-[10px] text-gray-500 leading-tight">{STEP_NAMES[i + 1]}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Blocked projects */}
          {dashboard.blockedProjects.length > 0 && (
            <div className="bg-red-50 rounded-xl border border-red-200 p-4">
              <h3 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> פרויקטים חסומים ({dashboard.blockedProjects.length})
              </h3>
              <div className="space-y-2">
                {dashboard.blockedProjects.map((bp: any, i: number) => (
                  <div key={i} className="flex items-center justify-between bg-white rounded-lg p-2 border text-sm">
                    <span className="font-medium">{bp.project_number} - {bp.customer_name}</span>
                    <span className="text-red-600">שלב {bp.step_number}: {bp.step_name}</span>
                    <button onClick={() => selectProject(bp.id)} className="text-blue-600 hover:underline text-xs">פרטים</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reminders due */}
          {dashboard.remindersDue.length > 0 && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
              <h3 className="font-semibold text-amber-800 mb-2 flex items-center gap-2">
                <Bell className="w-4 h-4" /> תזכורות ממתינות ({dashboard.remindersDue.length})
              </h3>
              <div className="space-y-1">
                {dashboard.remindersDue.slice(0, 5).map((r: any, i: number) => (
                  <div key={i} className="flex items-center justify-between bg-white rounded-lg p-2 border text-sm">
                    <span>{r.project_number} - {r.customer_name}</span>
                    <span className="text-gray-600">{r.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pipeline Tab */}
      {tab === "pipeline" && (
        <div className="overflow-x-auto">
          <div className="flex gap-2 min-w-[2400px] pb-4">
            {Array.from({ length: 18 }, (_, i) => {
              const stepNum = i + 1;
              const projectsInStep = projects.filter((p) => p.current_step === stepNum && p.status === "active");
              return (
                <div key={stepNum} className="w-[140px] flex-shrink-0">
                  <div className="bg-white rounded-t-lg border-b-2 border-blue-500 px-2 py-1.5 text-center">
                    <div className="text-xs font-bold text-blue-600">שלב {stepNum}</div>
                    <div className="text-[10px] text-gray-500 leading-tight">{STEP_NAMES[stepNum]}</div>
                    <div className="mt-1 text-xs bg-blue-100 rounded-full px-2 py-0.5 inline-block">{projectsInStep.length}</div>
                  </div>
                  <div className="space-y-1 mt-1 max-h-[400px] overflow-y-auto">
                    {projectsInStep.map((p) => (
                      <div key={p.id} onClick={() => selectProject(p.id)}
                        className="bg-white rounded-lg border p-2 text-xs cursor-pointer hover:shadow-md transition">
                        <div className="font-medium text-gray-800 truncate">{p.project_number}</div>
                        <div className="text-gray-500 truncate">{p.customer_name}</div>
                        <div className="text-blue-600 font-medium mt-1">{fmt(p.deal_amount)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* List Tab */}
      {tab === "list" && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-4 h-4 absolute right-3 top-2.5 text-gray-400" />
              <input value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                placeholder="חיפוש..." className="pr-9 pl-3 py-2 border rounded-lg text-sm w-60" />
            </div>
            <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}
              className="border rounded-lg px-3 py-2 text-sm">
              <option value="active">פעיל</option>
              <option value="completed">הושלם</option>
              <option value="paused">מושהה</option>
              <option value="cancelled">בוטל</option>
              <option value="">הכל</option>
            </select>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">מספר פרויקט</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">לקוח</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">סוכן</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">סכום</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">שלב נוכחי</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">התקדמות</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">סטטוס</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => {
                  const pct = Math.round(((Number(p.completed_steps) || (p.current_step - 1)) / 18) * 100);
                  return (
                    <tr key={p.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => selectProject(p.id)}>
                      <td className="px-4 py-3 font-medium">{p.project_number}</td>
                      <td className="px-4 py-3">{p.customer_name}</td>
                      <td className="px-4 py-3">{p.agent_name}</td>
                      <td className="px-4 py-3 font-medium">{fmt(p.deal_amount)}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                          {p.current_step}/18 - {STEP_NAMES[p.current_step]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-gray-200 rounded-full h-2">
                            <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-500">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          p.status === "active" ? "bg-green-100 text-green-700" :
                          p.status === "completed" ? "bg-blue-100 text-blue-700" :
                          p.status === "paused" ? "bg-yellow-100 text-yellow-700" :
                          "bg-red-100 text-red-700"
                        }`}>{p.status === "active" ? "פעיל" : p.status === "completed" ? "הושלם" : p.status === "paused" ? "מושהה" : "בוטל"}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={(e) => { e.stopPropagation(); selectProject(p.id); }}
                          className="text-blue-600 hover:text-blue-800">
                          <Eye className="w-4 h-4 inline" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {projects.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-gray-400">לא נמצאו פרויקטים</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Project Detail Modal */}
      {selectedProject && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelectedProject(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between rounded-t-2xl">
              <div>
                <h2 className="text-lg font-bold">{selectedProject.project_number} - {selectedProject.customer_name}</h2>
                <p className="text-sm text-gray-500">סוכן: {selectedProject.agent_name} | סכום: {fmt(selectedProject.deal_amount)}</p>
              </div>
              <button onClick={() => setSelectedProject(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Steps pipeline */}
              <div className="overflow-x-auto">
                <div className="flex gap-1 min-w-[1200px]">
                  {steps.map((s) => (
                    <div key={s.id} className={`flex-1 p-2 rounded-lg border-2 text-center text-xs transition ${stepColor(s.step_status)}`}>
                      <div className="flex items-center justify-center mb-1">{stepIcon(s.step_status)}</div>
                      <div className="font-bold">{s.step_number}</div>
                      <div className="text-[10px] leading-tight mt-0.5">{STEP_NAMES[s.step_number]}</div>
                      {s.step_status === "in_progress" && (
                        <div className="mt-1 flex gap-1 justify-center">
                          <button onClick={() => advanceStep(selectedProject.id)}
                            className="bg-green-600 text-white px-1.5 py-0.5 rounded text-[9px] hover:bg-green-700">
                            קדם
                          </button>
                          {s.requires_approval && !s.approved_by && (
                            <button onClick={() => approveStep(selectedProject.id, s.step_number)}
                              className="bg-blue-600 text-white px-1.5 py-0.5 rounded text-[9px] hover:bg-blue-700">
                              אשר
                            </button>
                          )}
                          <button onClick={() => blockStep(selectedProject.id, s.step_number)}
                            className="bg-red-600 text-white px-1.5 py-0.5 rounded text-[9px] hover:bg-red-700">
                            חסום
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Timeline */}
              {timeline.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <h3 className="font-semibold mb-3">ציר זמן</h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {timeline.map((ev, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm">
                        <div className="text-xs text-gray-400 w-32 flex-shrink-0">
                          {new Date(ev.time).toLocaleString("he-IL")}
                        </div>
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          ev.type === "complete" ? "bg-green-500" :
                          ev.type === "start" ? "bg-blue-500" :
                          "bg-purple-500"
                        }`} />
                        <div className="text-gray-700">{ev.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">פרויקט שרשרת אספקה חדש</h2>
            {[
              { key: "customer_name", label: "שם לקוח", type: "text" },
              { key: "customer_phone", label: "טלפון", type: "text" },
              { key: "customer_address", label: "כתובת", type: "text" },
              { key: "agent_name", label: "שם סוכן", type: "text" },
              { key: "deal_amount", label: "סכום עסקה (לפני מע\"מ)", type: "number" },
              { key: "product_type", label: "סוג מוצר", type: "text" },
            ].map((f) => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                <input type={f.type} value={createForm[f.key] || ""}
                  onChange={(e) => setCreateForm({ ...createForm, [f.key]: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">סוג ייצור</label>
              <select value={createForm.production_type || ""} onChange={(e) => setCreateForm({ ...createForm, production_type: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">בחר...</option>
                <option value="internal">ייצור פנימי</option>
                <option value="outsource">קבלן משנה</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">סוג צביעה</label>
              <select value={createForm.paint_type || ""} onChange={(e) => setCreateForm({ ...createForm, paint_type: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">בחר...</option>
                <option value="oven">תנור</option>
                <option value="spray">ריסוס</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 border rounded-lg text-sm">ביטול</button>
              <button onClick={createProject} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">צור פרויקט</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
