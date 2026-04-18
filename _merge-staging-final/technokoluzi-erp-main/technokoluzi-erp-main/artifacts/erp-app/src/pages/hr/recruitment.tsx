import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import {
  Briefcase, Search, Plus, Edit2, Trash2, X, Save, Eye, ArrowUpDown, Users, Target,
  TrendingUp, LayoutGrid, List, ChevronLeft, Star, Phone, Mail, UserCheck, UserX,
  FileText, Calendar, Clock, CheckCircle2, AlertTriangle, MapPin, DollarSign, Columns3
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtCur = (v: any) => `\u20AA${fmt(v)}`;

// ─── Stage definitions ────────────────────────────────────────────────────────
const APP_STAGES = [
  { key: "new",                label: "חדש",          color: "border-slate-500",   bg: "bg-slate-500/10",   dot: "bg-slate-400",   text: "text-slate-300" },
  { key: "screening",          label: "סינון",         color: "border-blue-500",    bg: "bg-blue-500/10",    dot: "bg-blue-400",    text: "text-blue-400" },
  { key: "phone_interview",    label: "ראיון טלפוני",  color: "border-cyan-500",    bg: "bg-cyan-500/10",    dot: "bg-cyan-400",    text: "text-cyan-400" },
  { key: "in_person_interview",label: "ראיון אישי",    color: "border-indigo-500",  bg: "bg-indigo-500/10",  dot: "bg-indigo-400",  text: "text-indigo-400" },
  { key: "technical_test",     label: "מבחן טכני",     color: "border-purple-500",  bg: "bg-purple-500/10",  dot: "bg-purple-400",  text: "text-purple-400" },
  { key: "offer",              label: "הצעת עבודה",    color: "border-amber-500",   bg: "bg-amber-500/10",   dot: "bg-amber-400",   text: "text-amber-400" },
  { key: "hired",              label: "התקבל",          color: "border-emerald-500", bg: "bg-emerald-500/10", dot: "bg-emerald-400", text: "text-emerald-400" },
  { key: "rejected",           label: "נדחה",           color: "border-red-500",     bg: "bg-red-500/10",     dot: "bg-red-400",     text: "text-red-400" },
];
const STAGE_MAP = Object.fromEntries(APP_STAGES.map(s => [s.key, s]));
const KANBAN_STAGES = APP_STAGES.filter(s => !["hired","rejected"].includes(s.key));

const SOURCES = ["website", "whatsapp", "referral", "agency", "linkedin"];
const SOURCE_LABELS: Record<string, string> = { website: "אתר", whatsapp: "וואטסאפ", referral: "הפניה", agency: "סוכנות", linkedin: "לינקדאין" };
const EMP_TYPES = ["full_time", "part_time", "contractor"];
const EMP_TYPE_LABELS: Record<string, string> = { full_time: "משרה מלאה", part_time: "חלקית", contractor: "קבלן" };
const POS_STATUSES = ["open", "on_hold", "filled", "cancelled"];
const POS_STATUS_LABELS: Record<string, string> = { open: "פתוח", on_hold: "מוקפא", filled: "אויש", cancelled: "בוטל" };
const INTERVIEW_TYPES = ["phone", "video", "in_person", "technical"];
const INTERVIEW_TYPE_LABELS: Record<string, string> = { phone: "טלפון", video: "וידאו", in_person: "פרונטלי", technical: "טכני" };
const ONBOARDING_CATS = ["documents", "training", "equipment", "access", "introduction"];
const ONBOARDING_CAT_LABELS: Record<string, string> = { documents: "מסמכים", training: "הכשרה", equipment: "ציוד", access: "הרשאות", introduction: "היכרות" };

type Tab = "positions" | "applications" | "interviews" | "onboarding";

export default function RecruitmentPage() {
  const [activeTab, setActiveTab] = useState<Tab>("positions");
  const [dashboard, setDashboard] = useState<any>({});
  const [positions, setPositions] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [interviews, setInterviews] = useState<any[]>([]);
  const [onboarding, setOnboarding] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");

  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  // ─── Load data ────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const [dRes, pRes, aRes, iRes, oRes] = await Promise.all([
        authFetch(`${API}/recruitment/dashboard`).catch(() => null),
        authFetch(`${API}/recruitment/positions`),
        authFetch(`${API}/recruitment/applications`),
        authFetch(`${API}/recruitment/interviews`),
        authFetch(`${API}/recruitment/onboarding`),
      ]);
      if (dRes?.ok) setDashboard(await dRes.json());
      if (pRes.ok) setPositions(safeArray(await pRes.json()));
      if (aRes.ok) setApplications(safeArray(await aRes.json()));
      if (iRes.ok) setInterviews(safeArray(await iRes.json()));
      if (oRes.ok) setOnboarding(safeArray(await oRes.json()));
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // ─── CRUD helpers ─────────────────────────────────────────────────────────
  const entityPath = (tab: Tab) => {
    const map: Record<Tab, string> = {
      positions: "recruitment/positions", applications: "recruitment/applications",
      interviews: "recruitment/interviews", onboarding: "recruitment/onboarding"
    };
    return map[tab];
  };

  const openNew = () => { setEditing(null); setForm({}); setShowForm(true); };
  const openEdit = (item: any) => { setEditing(item); setForm({ ...item }); setShowForm(true); };

  const handleSave = async () => {
    setSaving(true);
    try {
      const path = entityPath(activeTab);
      const method = editing ? "PUT" : "POST";
      const url = editing ? `${API}/${path}/${editing.id}` : `${API}/${path}`;
      const r = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!r.ok) throw new Error("Save failed");
      setShowForm(false); load();
    } catch {}
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    const ok = await globalConfirm({ title: "מחיקה", message: "למחוק את הרשומה?" });
    if (!ok) return;
    await authFetch(`${API}/${entityPath(activeTab)}/${id}`, { method: "DELETE" });
    load();
  };

  const advanceStage = async (appId: number, targetStatus: string) => {
    await authFetch(`${API}/recruitment/applications/${appId}/advance-stage`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target_status: targetStatus })
    });
    load();
  };

  // ─── Filtering ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const dataMap: Record<Tab, any[]> = { positions, applications, interviews, onboarding };
    let data = dataMap[activeTab];
    if (search) {
      const s = search.toLowerCase();
      data = data.filter(i => JSON.stringify(i).toLowerCase().includes(s));
    }
    if (filterStatus !== "all") {
      data = data.filter(i => i.status === filterStatus);
    }
    return data;
  }, [activeTab, positions, applications, interviews, onboarding, search, filterStatus]);

  const paged = filtered.slice(pagination.startIndex, pagination.endIndex + 1);

  // ─── Render stars ─────────────────────────────────────────────────────────
  const Stars = ({ value }: { value: number }) => (
    <div className="flex gap-0.5">{[1,2,3,4,5].map(i => <Star key={i} size={12} className={i <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"} />)}</div>
  );

  // ─── Stats cards ──────────────────────────────────────────────────────────
  const statsCards = [
    { label: "משרות פתוחות", value: dashboard.open_positions || 0, icon: Briefcase, color: "text-blue-400" },
    { label: "סה\"כ מועמדויות", value: dashboard.total_applications || 0, icon: Users, color: "text-purple-400" },
    { label: "התקבלו החודש", value: dashboard.hired_this_month || 0, icon: UserCheck, color: "text-emerald-400" },
    { label: "ראיונות קרובים", value: dashboard.upcoming_interviews || 0, icon: Calendar, color: "text-amber-400" },
    { label: "זמן ממוצע לגיוס", value: `${dashboard.avg_time_to_hire_days || 0} ימים`, icon: Clock, color: "text-cyan-400" },
  ];

  // ─── Tabs ─────────────────────────────────────────────────────────────────
  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "positions", label: "משרות", icon: Briefcase },
    { key: "applications", label: "מועמדויות", icon: Users },
    { key: "interviews", label: "ראיונות", icon: Calendar },
    { key: "onboarding", label: "קליטה", icon: CheckCircle2 },
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Briefcase className="text-blue-400" /> גיוס ומשאבי אנוש</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול תהליך גיוס מלא - ממשרה ועד קליטה</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportDropdown data={filtered} filename={`recruitment-${activeTab}`} />
          <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition">
            <Plus size={16} /> הוסף חדש
          </button>
        </div>
      </div>

      {/* Dashboard Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {statsCards.map(c => (
          <div key={c.label} className="bg-[#1a1a2e] border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2"><c.icon size={18} className={c.color} /><span className="text-xs text-muted-foreground">{c.label}</span></div>
            <div className="text-xl font-bold text-white">{typeof c.value === 'number' ? fmt(c.value) : c.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/10 pb-0">
        {tabs.map(t => (
          <button key={t.key} onClick={() => { setActiveTab(t.key); setFilterStatus("all"); clear(); }}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition ${activeTab === t.key ? "border-blue-500 text-blue-400" : "border-transparent text-muted-foreground hover:text-white"}`}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
        <div className="flex-1" />
        {activeTab === "applications" && (
          <div className="flex items-center gap-1 mr-2">
            <button onClick={() => setViewMode("list")} className={`p-1.5 rounded ${viewMode === "list" ? "bg-white/10 text-white" : "text-muted-foreground"}`}><List size={16} /></button>
            <button onClick={() => setViewMode("kanban")} className={`p-1.5 rounded ${viewMode === "kanban" ? "bg-white/10 text-white" : "text-muted-foreground"}`}><Columns3 size={16} /></button>
          </div>
        )}
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-9 pl-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
          <option value="all">כל הסטטוסים</option>
          {activeTab === "positions" && POS_STATUSES.map(s => <option key={s} value={s}>{POS_STATUS_LABELS[s]}</option>)}
          {activeTab === "applications" && APP_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          {activeTab === "interviews" && ["scheduled","completed","cancelled","no_show"].map(s => <option key={s} value={s}>{s}</option>)}
          {activeTab === "onboarding" && ["pending","in_progress","completed"].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400" /></div>
      ) : (
        <>
          {/* ─── Applications Kanban View ─────────────────────────────────── */}
          {activeTab === "applications" && viewMode === "kanban" ? (
            <div className="flex gap-3 overflow-x-auto pb-4">
              {KANBAN_STAGES.map(stage => {
                const cards = applications.filter(a => a.status === stage.key);
                return (
                  <div key={stage.key} className={`min-w-[220px] w-[220px] flex-shrink-0 rounded-xl border ${stage.color} ${stage.bg} p-3`}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-2 h-2 rounded-full ${stage.dot}`} />
                      <span className={`text-sm font-medium ${stage.text}`}>{stage.label}</span>
                      <Badge variant="outline" className="mr-auto text-xs">{cards.length}</Badge>
                    </div>
                    <div className="space-y-2">
                      {cards.map(a => (
                        <div key={a.id} onClick={() => setViewDetail(a)} className="bg-[#0f0f23]/80 rounded-lg p-3 cursor-pointer hover:bg-[#0f0f23] transition border border-white/5">
                          <div className="text-sm text-white font-medium mb-1">{a.candidate_name}</div>
                          <div className="text-xs text-muted-foreground mb-1">{a.position_title}</div>
                          {a.rating > 0 && <Stars value={a.rating} />}
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className="text-[10px]">{SOURCE_LABELS[a.source] || a.source}</Badge>
                            {a.salary_expectation > 0 && <span className="text-[10px] text-muted-foreground">{fmtCur(a.salary_expectation)}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ─── List View ─────────────────────────────────────────────── */
            <>
              <div className="bg-[#1a1a2e] border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-muted-foreground text-xs">
                      {activeTab === "positions" && <><th className="p-3 text-right">תפקיד</th><th className="p-3 text-right">מחלקה</th><th className="p-3 text-right">סוג</th><th className="p-3 text-right">מיקום</th><th className="p-3 text-right">שכר</th><th className="p-3 text-right">מועמדויות</th><th className="p-3 text-right">סטטוס</th><th className="p-3 text-center">פעולות</th></>}
                      {activeTab === "applications" && <><th className="p-3 text-right">מועמד</th><th className="p-3 text-right">משרה</th><th className="p-3 text-right">מקור</th><th className="p-3 text-right">שלב</th><th className="p-3 text-right">דירוג</th><th className="p-3 text-right">ציפיית שכר</th><th className="p-3 text-right">תאריך</th><th className="p-3 text-center">פעולות</th></>}
                      {activeTab === "interviews" && <><th className="p-3 text-right">מועמד</th><th className="p-3 text-right">משרה</th><th className="p-3 text-right">סוג</th><th className="p-3 text-right">תאריך</th><th className="p-3 text-right">משך</th><th className="p-3 text-right">סטטוס</th><th className="p-3 text-right">דירוג</th><th className="p-3 text-center">פעולות</th></>}
                      {activeTab === "onboarding" && <><th className="p-3 text-right">משימה</th><th className="p-3 text-right">קטגוריה</th><th className="p-3 text-right">תאריך יעד</th><th className="p-3 text-right">אחראי</th><th className="p-3 text-right">סטטוס</th><th className="p-3 text-center">פעולות</th></>}
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((item: any) => (
                      <tr key={item.id} className="border-b border-white/5 hover:bg-white/5 transition cursor-pointer" onClick={() => setViewDetail(item)}>
                        {activeTab === "positions" && <>
                          <td className="p-3 text-white font-medium">{item.title}</td>
                          <td className="p-3 text-muted-foreground">{item.department}</td>
                          <td className="p-3"><Badge variant="outline">{EMP_TYPE_LABELS[item.employment_type] || item.employment_type}</Badge></td>
                          <td className="p-3 text-muted-foreground">{item.location}</td>
                          <td className="p-3 text-muted-foreground">{item.salary_range_min ? `${fmtCur(item.salary_range_min)}-${fmtCur(item.salary_range_max)}` : "---"}</td>
                          <td className="p-3 text-center text-white">{item.applications_count || 0}</td>
                          <td className="p-3"><Badge className={item.status === 'open' ? 'bg-green-500/20 text-green-400' : 'bg-muted/20 text-muted-foreground'}>{POS_STATUS_LABELS[item.status]}</Badge></td>
                        </>}
                        {activeTab === "applications" && <>
                          <td className="p-3 text-white font-medium">{item.candidate_name}</td>
                          <td className="p-3 text-muted-foreground">{item.position_title}</td>
                          <td className="p-3"><Badge variant="outline">{SOURCE_LABELS[item.source] || item.source}</Badge></td>
                          <td className="p-3"><Badge className={`${STAGE_MAP[item.status]?.bg || ""} ${STAGE_MAP[item.status]?.text || ""}`}>{STAGE_MAP[item.status]?.label || item.status}</Badge></td>
                          <td className="p-3">{item.rating > 0 ? <Stars value={item.rating} /> : "---"}</td>
                          <td className="p-3 text-muted-foreground">{item.salary_expectation ? fmtCur(item.salary_expectation) : "---"}</td>
                          <td className="p-3 text-muted-foreground text-xs">{item.applied_at ? new Date(item.applied_at).toLocaleDateString("he-IL") : ""}</td>
                        </>}
                        {activeTab === "interviews" && <>
                          <td className="p-3 text-white font-medium">{item.candidate_name}</td>
                          <td className="p-3 text-muted-foreground">{item.position_title}</td>
                          <td className="p-3"><Badge variant="outline">{INTERVIEW_TYPE_LABELS[item.interview_type] || item.interview_type}</Badge></td>
                          <td className="p-3 text-muted-foreground text-xs">{item.scheduled_at ? new Date(item.scheduled_at).toLocaleString("he-IL") : ""}</td>
                          <td className="p-3 text-muted-foreground">{item.duration_min} דק'</td>
                          <td className="p-3"><Badge className={item.status === 'completed' ? 'bg-green-500/20 text-green-400' : item.status === 'scheduled' ? 'bg-blue-500/20 text-blue-400' : 'bg-muted/20'}>{item.status}</Badge></td>
                          <td className="p-3">{item.rating > 0 ? <Stars value={item.rating} /> : "---"}</td>
                        </>}
                        {activeTab === "onboarding" && <>
                          <td className="p-3 text-white font-medium">{item.task_name}</td>
                          <td className="p-3"><Badge variant="outline">{ONBOARDING_CAT_LABELS[item.category] || item.category}</Badge></td>
                          <td className="p-3 text-muted-foreground">{item.due_date ? new Date(item.due_date).toLocaleDateString("he-IL") : "---"}</td>
                          <td className="p-3 text-muted-foreground">{item.assigned_to || "---"}</td>
                          <td className="p-3"><Badge className={item.status === 'completed' ? 'bg-green-500/20 text-green-400' : item.status === 'in_progress' ? 'bg-amber-500/20 text-amber-400' : 'bg-muted/20'}>{item.status}</Badge></td>
                        </>}
                        <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => openEdit(item)} className="p-1.5 rounded hover:bg-white/10 text-muted-foreground hover:text-white transition"><Edit2 size={14} /></button>
                            <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {paged.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">אין נתונים</td></tr>}
                  </tbody>
                </table>
              </div>
              <SmartPagination totalItems={filtered.length} {...pagination} />
            </>
          )}
        </>
      )}

      {/* ─── Detail Panel ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/60 flex justify-end" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ x: 400 }} animate={{ x: 0 }} exit={{ x: 400 }} onClick={e => e.stopPropagation()}
              className="w-full max-w-lg bg-[#12122a] h-full overflow-y-auto border-r border-white/10 p-6">
              <div className="flex items-center justify-between mb-6">
                <button onClick={() => setViewDetail(null)} className="text-muted-foreground hover:text-white"><ChevronLeft size={20} /></button>
                <h3 className="text-lg font-bold text-white">
                  {viewDetail.title || viewDetail.candidate_name || viewDetail.task_name || "פרטים"}
                </h3>
                <div className="flex gap-1">
                  <button onClick={() => { openEdit(viewDetail); setViewDetail(null); }} className="p-1.5 rounded hover:bg-white/10"><Edit2 size={14} /></button>
                </div>
              </div>

              <div className="space-y-4">
                {Object.entries(viewDetail).filter(([k]) => !["id","created_at","updated_at","applied_at"].includes(k)).map(([k, v]) => (
                  <div key={k}>
                    <div className="text-xs text-muted-foreground mb-0.5">{k}</div>
                    <div className="text-sm text-white">{v != null ? String(v) : "---"}</div>
                  </div>
                ))}
              </div>

              {/* Stage advance for applications */}
              {activeTab === "applications" && viewDetail.status && !["hired","rejected"].includes(viewDetail.status) && (
                <div className="mt-6 pt-4 border-t border-white/10">
                  <div className="text-xs text-muted-foreground mb-2">העבר שלב</div>
                  <div className="flex flex-wrap gap-2">
                    {APP_STAGES.filter(s => s.key !== viewDetail.status).map(s => (
                      <button key={s.key} onClick={() => { advanceStage(viewDetail.id, s.key); setViewDetail(null); }}
                        className={`px-3 py-1.5 rounded-lg text-xs border ${s.color} ${s.bg} ${s.text} hover:opacity-80 transition`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Form Modal ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={e => e.stopPropagation()}
              className="w-full max-w-2xl bg-[#12122a] rounded-2xl border border-white/10 p-6 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-white">{editing ? "עריכה" : "הוספה"}</h3>
                <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-white"><X size={18} /></button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {activeTab === "positions" && <>
                  <div className="col-span-2"><label className="text-xs text-muted-foreground">תפקיד *</label><input value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">מחלקה</label><input value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">סוג העסקה</label><select value={form.employment_type || "full_time"} onChange={e => setForm({ ...form, employment_type: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white">{EMP_TYPES.map(t => <option key={t} value={t}>{EMP_TYPE_LABELS[t]}</option>)}</select></div>
                  <div><label className="text-xs text-muted-foreground">מיקום</label><input value={form.location || ""} onChange={e => setForm({ ...form, location: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">סטטוס</label><select value={form.status || "open"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white">{POS_STATUSES.map(s => <option key={s} value={s}>{POS_STATUS_LABELS[s]}</option>)}</select></div>
                  <div><label className="text-xs text-muted-foreground">שכר מינ'</label><input type="number" value={form.salary_range_min || ""} onChange={e => setForm({ ...form, salary_range_min: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">שכר מקס'</label><input type="number" value={form.salary_range_max || ""} onChange={e => setForm({ ...form, salary_range_max: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div className="col-span-2"><label className="text-xs text-muted-foreground">תיאור</label><textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div className="col-span-2"><label className="text-xs text-muted-foreground">דרישות</label><textarea value={form.requirements || ""} onChange={e => setForm({ ...form, requirements: e.target.value })} rows={3} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                </>}

                {activeTab === "applications" && <>
                  <div className="col-span-2"><label className="text-xs text-muted-foreground">שם מועמד *</label><input value={form.candidate_name || ""} onChange={e => setForm({ ...form, candidate_name: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">משרה</label><select value={form.position_id || ""} onChange={e => setForm({ ...form, position_id: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white"><option value="">בחר...</option>{positions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
                  <div><label className="text-xs text-muted-foreground">מקור</label><select value={form.source || "website"} onChange={e => setForm({ ...form, source: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white">{SOURCES.map(s => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}</select></div>
                  <div><label className="text-xs text-muted-foreground">טלפון</label><input value={form.phone || ""} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">אימייל</label><input value={form.email || ""} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">דירוג (1-5)</label><input type="number" min="1" max="5" value={form.rating || ""} onChange={e => setForm({ ...form, rating: parseInt(e.target.value) })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">ציפיית שכר</label><input type="number" value={form.salary_expectation || ""} onChange={e => setForm({ ...form, salary_expectation: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div className="col-span-2"><label className="text-xs text-muted-foreground">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                </>}

                {activeTab === "interviews" && <>
                  <div><label className="text-xs text-muted-foreground">מועמדות</label><select value={form.application_id || ""} onChange={e => setForm({ ...form, application_id: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white"><option value="">בחר...</option>{applications.map(a => <option key={a.id} value={a.id}>{a.candidate_name} - {a.position_title}</option>)}</select></div>
                  <div><label className="text-xs text-muted-foreground">סוג ראיון</label><select value={form.interview_type || "phone"} onChange={e => setForm({ ...form, interview_type: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white">{INTERVIEW_TYPES.map(t => <option key={t} value={t}>{INTERVIEW_TYPE_LABELS[t]}</option>)}</select></div>
                  <div><label className="text-xs text-muted-foreground">תאריך ושעה</label><input type="datetime-local" value={form.scheduled_at?.slice(0, 16) || ""} onChange={e => setForm({ ...form, scheduled_at: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">משך (דקות)</label><input type="number" value={form.duration_min || 60} onChange={e => setForm({ ...form, duration_min: parseInt(e.target.value) })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">מיקום</label><input value={form.location || ""} onChange={e => setForm({ ...form, location: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">סטטוס</label><select value={form.status || "scheduled"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white"><option value="scheduled">מתוכנן</option><option value="completed">הושלם</option><option value="cancelled">בוטל</option><option value="no_show">לא הגיע</option></select></div>
                  <div className="col-span-2"><label className="text-xs text-muted-foreground">משוב</label><textarea value={form.feedback || ""} onChange={e => setForm({ ...form, feedback: e.target.value })} rows={3} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                </>}

                {activeTab === "onboarding" && <>
                  <div className="col-span-2"><label className="text-xs text-muted-foreground">משימה *</label><input value={form.task_name || ""} onChange={e => setForm({ ...form, task_name: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">קטגוריה</label><select value={form.category || "documents"} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white">{ONBOARDING_CATS.map(c => <option key={c} value={c}>{ONBOARDING_CAT_LABELS[c]}</option>)}</select></div>
                  <div><label className="text-xs text-muted-foreground">תאריך יעד</label><input type="date" value={form.due_date || ""} onChange={e => setForm({ ...form, due_date: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">אחראי</label><input value={form.assigned_to || ""} onChange={e => setForm({ ...form, assigned_to: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">סטטוס</label><select value={form.status || "pending"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white"><option value="pending">ממתין</option><option value="in_progress">בתהליך</option><option value="completed">הושלם</option></select></div>
                </>}
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-white transition">ביטול</button>
                <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50">
                  <Save size={15} /> {saving ? "שומר..." : "שמור"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
