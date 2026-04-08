import { useState, useEffect, useMemo } from "react";
import { Briefcase, Plus, X, ChevronDown, Users, Target, TrendingUp, Search, Clock, Mail, Phone, Star, UserCheck, ArrowRight, FileText, Calendar, BarChart2, CheckCircle2, Edit2, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString("he-IL") : "—";
const fmtCur = (v: any) => v ? `₪${Number(v).toLocaleString("he-IL")}` : "—";

const STAGES: { key: string; label: string; color: string; bg: string }[] = [
  { key: "applied",      label: "הגשה",           color: "text-gray-400",    bg: "bg-gray-500/10 border-gray-500/30" },
  { key: "screening",    label: "סינון",           color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/30" },
  { key: "phone_screen", label: "שיחת טלפון",    color: "text-cyan-400",    bg: "bg-cyan-500/10 border-cyan-500/30" },
  { key: "interview",    label: "ראיון",           color: "text-purple-400",  bg: "bg-purple-500/10 border-purple-500/30" },
  { key: "technical",    label: "ראיון טכני",     color: "text-indigo-400",  bg: "bg-indigo-500/10 border-indigo-500/30" },
  { key: "culture_fit",  label: "התאמה תרבותית",  color: "text-pink-400",    bg: "bg-pink-500/10 border-pink-500/30" },
  { key: "offer",        label: "הצעה",            color: "text-yellow-400",  bg: "bg-yellow-500/10 border-yellow-500/30" },
  { key: "hired",        label: "התקבל",          color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
  { key: "rejected",     label: "נדחה",            color: "text-red-400",     bg: "bg-red-500/10 border-red-500/30" },
];

const SOURCE_MAP: Record<string, string> = {
  linkedin: "LinkedIn", referral: "המלצה", website: "אתר", agency: "סוכנות", direct: "ישיר", other: "אחר",
};

const JOB_STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft:    { label: "טיוטה",    color: "bg-muted/30 text-muted-foreground" },
  active:   { label: "פעיל",     color: "bg-emerald-500/20 text-emerald-400" },
  paused:   { label: "מושהה",   color: "bg-yellow-500/20 text-yellow-400" },
  closed:   { label: "סגור",     color: "bg-red-500/20 text-red-400" },
  filled:   { label: "אוּיֵּשׁ",   color: "bg-blue-500/20 text-blue-400" },
};

const INTERVIEW_TYPE_MAP: Record<string, string> = {
  in_person: "פנים אל פנים", phone: "טלפון", video: "וידאו", technical: "טכני", panel: "פאנל",
};

function StatCard({ title, value, sub, color }: { title: string; value: any; sub?: string; color: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="text-xs text-muted-foreground mb-1">{title}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export default function ATSRecruitmentPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [view, setView] = useState<"kanban" | "jobs" | "interviews" | "offers" | "analytics">("kanban");
  const [candidates, setCandidates] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [interviews, setInterviews] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("");

  const [showCandidateForm, setShowCandidateForm] = useState(false);
  const [showJobForm, setShowJobForm] = useState(false);
  const [showInterviewForm, setShowInterviewForm] = useState(false);
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [editCandidate, setEditCandidate] = useState<any>(null);
  const [editJob, setEditJob] = useState<any>(null);
  const [editOffer, setEditOffer] = useState<any>(null);
  const [candidateForm, setCandidateForm] = useState<any>({ stage: "applied", source: "website" });
  const [jobForm, setJobForm] = useState<any>({ status: "draft", employmentType: "full_time" });
  const [interviewForm, setInterviewForm] = useState<any>({ interviewType: "in_person", status: "scheduled", durationMinutes: 60 });
  const [offerForm, setOfferForm] = useState<any>({ status: "draft", currency: "ILS" });
  const [saving, setSaving] = useState(false);
  const [recruitmentAnalytics, setRecruitmentAnalytics] = useState<any>(null);

  const loadAll = async () => {
    setLoading(true);
    const [cRes, jRes, iRes, oRes, sRes, aRes] = await Promise.all([
      authFetch(`${API}/candidates`),
      authFetch(`${API}/job-postings`),
      authFetch(`${API}/interview-schedules`),
      authFetch(`${API}/offer-letters`),
      authFetch(`${API}/candidates/stats`),
      authFetch(`${API}/recruitment-analytics`),
    ]);
    if (cRes.ok) setCandidates(safeArray(await cRes.json()));
    if (jRes.ok) setJobs(safeArray(await jRes.json()));
    if (iRes.ok) setInterviews(safeArray(await iRes.json()));
    if (oRes.ok) setOffers(safeArray(await oRes.json()));
    if (sRes.ok) setStats(await sRes.json());
    if (aRes.ok) setRecruitmentAnalytics(await aRes.json());
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const departments = useMemo(() => [...new Set([...candidates.map((c: any) => c.department), ...jobs.map((j: any) => j.department)].filter(Boolean))], [candidates, jobs]);

  const filtered = useMemo(() => candidates.filter((c: any) => {
    if (search && !`${c.full_name} ${c.position_applied} ${c.department}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterDept && c.department !== filterDept) return false;
    return true;
  }), [candidates, search, filterDept]);

  const byStage = useMemo(() => {
    const m: Record<string, any[]> = {};
    STAGES.forEach(s => { m[s.key] = []; });
    filtered.forEach((c: any) => { if (m[c.stage]) m[c.stage].push(c); else m["applied"].push(c); });
    return m;
  }, [filtered]);

  const saveCandidate = async () => {
    setSaving(true);
    const url = editCandidate ? `${API}/candidates/${editCandidate.id}` : `${API}/candidates`;
    const method = editCandidate ? "PUT" : "POST";
    const r = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(candidateForm) });
    if (r.ok) { setShowCandidateForm(false); setEditCandidate(null); setCandidateForm({ stage: "applied", source: "website" }); loadAll(); }
    setSaving(false);
  };

  const saveJob = async () => {
    setSaving(true);
    const url = editJob ? `${API}/job-postings/${editJob.id}` : `${API}/job-postings`;
    const method = editJob ? "PUT" : "POST";
    const r = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(jobForm) });
    if (r.ok) { setShowJobForm(false); setEditJob(null); setJobForm({ status: "draft", employmentType: "full_time" }); loadAll(); }
    setSaving(false);
  };

  const saveInterview = async () => {
    setSaving(true);
    const r = await authFetch(`${API}/interview-schedules`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(interviewForm) });
    if (r.ok) { setShowInterviewForm(false); setInterviewForm({ interviewType: "in_person", status: "scheduled", durationMinutes: 60 }); loadAll(); }
    setSaving(false);
  };

  const saveOffer = async () => {
    setSaving(true);
    const url = editOffer ? `${API}/offer-letters/${editOffer.id}` : `${API}/offer-letters`;
    const method = editOffer ? "PUT" : "POST";
    const r = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(offerForm) });
    if (r.ok) { setShowOfferForm(false); setEditOffer(null); setOfferForm({ status: "draft", currency: "ILS" }); loadAll(); }
    setSaving(false);
  };

  const deleteOffer = async (id: number) => {
    if (!await globalConfirm("האם למחוק הצעת עבודה זו?")) return;
    await authFetch(`${API}/offer-letters/${id}`, { method: "DELETE" });
    loadAll();
  };

  const moveStage = async (candidate: any, newStage: string) => {
    await authFetch(`${API}/candidates/${candidate.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: newStage }) });
    loadAll();
  };

  const deleteCandidate = async (id: number) => {
    if (!await globalConfirm("האם למחוק מועמד זה?")) return;
    await authFetch(`${API}/candidates/${id}`, { method: "DELETE" });
    loadAll();
  };

  const deleteJob = async (id: number) => {
    if (!await globalConfirm("האם למחוק משרה זו?")) return;
    await authFetch(`${API}/job-postings/${id}`, { method: "DELETE" });
    loadAll();
  };

  if (loading) return <div className="flex items-center justify-center h-64" dir="rtl"><div className="text-muted-foreground">טוען...</div></div>;

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">מערכת גיוס (ATS)</h1>
          <p className="text-sm text-muted-foreground mt-0.5">צינור מועמדים, משרות, ראיונות והצעות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => { setEditCandidate(null); setCandidateForm({ stage: "applied", source: "website" }); setShowCandidateForm(true); }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-foreground px-4 py-2 rounded-xl text-sm font-medium">
            <Plus className="w-4 h-4" /> מועמד חדש
          </button>
          <button onClick={() => { setEditJob(null); setJobForm({ status: "draft", employmentType: "full_time" }); setShowJobForm(true); }}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-foreground px-4 py-2 rounded-xl text-sm font-medium">
            <Briefcase className="w-4 h-4" /> משרה חדשה
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard title="סה״כ מועמדים" value={stats.total || 0} color="text-foreground" />
        <StatCard title="בהגשה" value={stats.applied || 0} color="text-gray-400" />
        <StatCard title="בסינון" value={stats.screening || 0} color="text-blue-400" />
        <StatCard title="בראיון" value={stats.interview || 0} color="text-purple-400" />
        <StatCard title="הצעה" value={stats.offer || 0} color="text-yellow-400" />
        <StatCard title="התקבלו" value={stats.hired || 0} color="text-emerald-400" />
        <StatCard title="משרות פתוחות" value={jobs.filter((j: any) => j.status === "active").length} color="text-cyan-400" />
      </div>

      {/* View Tabs */}
      <div className="flex gap-1 border-b border-border/50 flex-wrap">
        {[
          { key: "kanban", label: "לוח קנבן", icon: BarChart2 },
          { key: "jobs", label: "משרות", icon: Briefcase },
          { key: "interviews", label: "ראיונות", icon: Calendar },
          { key: "offers", label: "הצעות עבודה", icon: FileText },
          { key: "analytics", label: "אנליטיקס", icon: TrendingUp },
        ].map(t => (
          <button key={t.key} onClick={() => setView(t.key as any)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${view === t.key ? "border-blue-500 text-blue-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      {(view === "kanban") && (
        <div className="flex gap-3 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input placeholder="חיפוש מועמד..." value={search} onChange={e => setSearch(e.target.value)}
              className="bg-muted/20 border border-border rounded-xl pr-9 pl-3 py-2 text-sm w-56" />
          </div>
          <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
            className="bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm">
            <option value="">כל המחלקות</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      )}

      {/* KANBAN VIEW */}
      {view === "kanban" && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map(stage => (
            <div key={stage.key} className={`flex-shrink-0 w-72 rounded-2xl border ${stage.bg} flex flex-col`}>
              <div className="px-4 py-3 flex items-center justify-between border-b border-border/30">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${stage.color}`}>{stage.label}</span>
                  <span className="text-xs bg-muted/30 rounded-full px-1.5 py-0.5 text-muted-foreground">{byStage[stage.key]?.length || 0}</span>
                </div>
                <button onClick={() => { setCandidateForm({ stage: stage.key, source: "website" }); setShowCandidateForm(true); }}
                  className="w-6 h-6 rounded-full bg-muted/30 hover:bg-muted/50 flex items-center justify-center">
                  <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
              <div className="p-3 flex flex-col gap-2 flex-1 max-h-[580px] overflow-y-auto">
                {(byStage[stage.key] || []).map((c: any) => (
                  <div key={c.id} className="bg-card border border-border rounded-xl p-3 shadow-sm hover:border-border/80 transition-colors">
                    <div className="flex items-start justify-between gap-1 mb-2">
                      <div className="font-medium text-sm text-foreground leading-tight">{c.full_name}</div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => { setEditCandidate(c); setCandidateForm({ ...c, stage: c.stage, source: c.source }); setShowCandidateForm(true); }}
                          className="w-6 h-6 rounded-md bg-muted/20 hover:bg-blue-500/20 flex items-center justify-center">
                          <Edit2 className="w-3 h-3 text-muted-foreground" />
                        </button>
                        <button onClick={() => deleteCandidate(c.id)} className="w-6 h-6 rounded-md bg-muted/20 hover:bg-red-500/20 flex items-center justify-center">
                          <Trash2 className="w-3 h-3 text-muted-foreground" />
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">{c.position_applied}</div>
                    {c.department && <div className="text-xs text-muted-foreground">{c.department}</div>}
                    <div className="flex items-center gap-2 mt-2">
                      {c.source && <span className="text-xs bg-muted/20 rounded px-1.5 py-0.5">{SOURCE_MAP[c.source] || c.source}</span>}
                      {c.rating > 0 && <span className="flex items-center gap-0.5 text-xs text-yellow-400"><Star className="w-3 h-3" />{c.rating}</span>}
                    </div>
                    {/* Move to next stage */}
                    {stage.key !== "hired" && stage.key !== "rejected" && (
                      <div className="mt-2 flex gap-1 flex-wrap">
                        {STAGES.filter(s => s.key !== stage.key && s.key !== "applied").map(s => (
                          <button key={s.key} onClick={() => moveStage(c, s.key)}
                            className={`text-xs px-2 py-0.5 rounded-full ${s.bg} ${s.color} hover:opacity-80 transition-opacity`}>
                            → {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {c.email && (
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                        <Mail className="w-3 h-3" /> <span className="truncate">{c.email}</span>
                      </div>
                    )}
                  </div>
                ))}
                {(byStage[stage.key] || []).length === 0 && (
                  <div className="text-center text-xs text-muted-foreground py-6 opacity-50">אין מועמדים</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* JOB POSTINGS VIEW */}
      {view === "jobs" && (
        <div className="space-y-3">
          {jobs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">אין משרות. צרו משרה חדשה.</div>
          ) : jobs.map((job: any) => {
            const st = JOB_STATUS_MAP[job.status] || JOB_STATUS_MAP.draft;
            return (
              <div key={job.id} className="bg-card border border-border rounded-2xl p-4 hover:border-border/80 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <div className="text-base font-semibold text-foreground">{job.title}</div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">{job.department} {job.location ? `• ${job.location}` : ""}</div>
                    {(job.salary_min > 0 || job.salary_max > 0) && (
                      <div className="text-sm text-emerald-400 mt-1">{fmtCur(job.salary_min)} — {fmtCur(job.salary_max)}</div>
                    )}
                    {job.description && <div className="text-xs text-muted-foreground mt-2 line-clamp-2">{job.description}</div>}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                      {job.posted_date && <span>פורסם: {fmtDate(job.posted_date)}</span>}
                      {job.closing_date && <span>סגירה: {fmtDate(job.closing_date)}</span>}
                      {job.hiring_manager && <span>מנהל: {job.hiring_manager}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => { setEditJob(job); setJobForm({ ...job }); setShowJobForm(true); }}
                      className="w-8 h-8 rounded-xl bg-muted/20 hover:bg-blue-500/20 flex items-center justify-center">
                      <Edit2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button onClick={() => deleteJob(job.id)} className="w-8 h-8 rounded-xl bg-muted/20 hover:bg-red-500/20 flex items-center justify-center">
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* INTERVIEWS VIEW */}
      {view === "interviews" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => setShowInterviewForm(true)}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-foreground px-4 py-2 rounded-xl text-sm">
              <Plus className="w-4 h-4" /> תזמן ראיון
            </button>
          </div>
          {interviews.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">אין ראיונות מתוזמנים.</div>
          ) : interviews.map((iv: any) => (
            <div key={iv.id} className="bg-card border border-border rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-foreground">{iv.candidate_name}</div>
                  <div className="text-sm text-muted-foreground">{iv.position} {iv.department ? `• ${iv.department}` : ""}</div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{new Date(iv.scheduled_at).toLocaleString("he-IL")}</span>
                    <span>{INTERVIEW_TYPE_MAP[iv.interview_type] || iv.interview_type}</span>
                    {iv.interviewer_name && <span>מנהל: {iv.interviewer_name}</span>}
                    {iv.location && <span>{iv.location}</span>}
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${iv.status === "completed" ? "bg-emerald-500/20 text-emerald-400" : iv.status === "cancelled" ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"}`}>
                  {iv.status === "scheduled" ? "מתוזמן" : iv.status === "completed" ? "הושלם" : iv.status === "cancelled" ? "בוטל" : iv.status}
                </span>
              </div>
              {iv.feedback && <div className="mt-2 text-xs text-muted-foreground bg-muted/10 rounded-lg p-2">{iv.feedback}</div>}
            </div>
          ))}
        </div>
      )}

      {/* OFFERS VIEW */}
      {view === "offers" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => { setEditOffer(null); setOfferForm({ status: "draft", currency: "ILS" }); setShowOfferForm(true); }}
              className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-700 text-foreground px-4 py-2 rounded-xl text-sm">
              <Plus className="w-4 h-4" /> הצעת עבודה חדשה
            </button>
          </div>
          {offers.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">אין הצעות עבודה. לחץ "הצעת עבודה חדשה" להתחלה.</div>
          ) : offers.map((o: any) => (
            <div key={o.id} className="bg-card border border-border rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-base font-semibold text-foreground">{o.candidate_name}</div>
                    <span className="text-xs text-muted-foreground">{o.offer_number}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">{o.position_applied || o.position} {o.department ? `• ${o.department}` : ""}</div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                    {o.salary > 0 && <span className="text-emerald-400 font-medium">{fmtCur(o.salary)} {o.currency || "ILS"}</span>}
                    {o.start_date && <span>תחילת עבודה: {fmtDate(o.start_date)}</span>}
                    {o.expiry_date && <span>תוקף עד: {fmtDate(o.expiry_date)}</span>}
                  </div>
                  {o.benefits && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{o.benefits}</div>}
                  {o.notes && <div className="text-xs text-muted-foreground/70 mt-1 line-clamp-1">{o.notes}</div>}
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${o.status === "accepted" ? "bg-emerald-500/20 text-emerald-400" : o.status === "rejected" ? "bg-red-500/20 text-red-400" : o.status === "sent" ? "bg-blue-500/20 text-blue-400" : "bg-muted/30 text-muted-foreground"}`}>
                    {o.status === "draft" ? "טיוטה" : o.status === "sent" ? "נשלח" : o.status === "accepted" ? "התקבל" : o.status === "rejected" ? "נדחה" : o.status}
                  </span>
                  <div className="flex gap-1 flex-wrap justify-end">
                    <button onClick={() => { setEditOffer(o); setOfferForm({ candidateName: o.candidate_name, position: o.position_applied || o.position, department: o.department, salary: o.salary, currency: o.currency || "ILS", benefits: o.benefits_json || o.benefits, startDate: o.start_date?.slice(0,10), expiryDate: o.expiry_date?.slice(0,10), status: o.status, notes: o.notes }); setShowOfferForm(true); }}
                      className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => deleteOffer(o.id)} className="p-1.5 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                    {o.status === "draft" && (
                      <button onClick={async () => { await authFetch(`${API}/offer-letters/${o.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "sent" }) }); loadAll(); }}
                        className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg">שלח</button>
                    )}
                    {o.status === "sent" && (
                      <>
                        <button onClick={async () => { await authFetch(`${API}/offer-letters/${o.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "accepted" }) }); loadAll(); }}
                          className="text-xs px-2 py-0.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-lg">אשר</button>
                        <button onClick={async () => { await authFetch(`${API}/offer-letters/${o.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "rejected" }) }); loadAll(); }}
                          className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg">דחה</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ANALYTICS VIEW */}
      {view === "analytics" && (() => {
        const totalCandidates = candidates.length;
        const hired = candidates.filter((c: any) => c.stage === "hired").length;
        const rejected = candidates.filter((c: any) => c.stage === "rejected").length;
        const conversionRate = totalCandidates > 0 ? ((hired / totalCandidates) * 100).toFixed(1) : "0";
        const offerAccepted = offers.filter((o: any) => o.status === "accepted").length;
        const offerTotal = offers.length;
        const offerAcceptRate = offerTotal > 0 ? ((offerAccepted / offerTotal) * 100).toFixed(1) : "0";
        const bySource = Object.entries(SOURCE_MAP).map(([key, label]) => ({
          label,
          count: candidates.filter((c: any) => c.source === key).length,
        })).filter(s => s.count > 0).sort((a, b) => b.count - a.count);
        const byDept = [...new Set(candidates.map((c: any) => c.department).filter(Boolean))].map(dept => ({
          dept,
          total: candidates.filter((c: any) => c.department === dept).length,
          hired: candidates.filter((c: any) => c.department === dept && c.stage === "hired").length,
        })).sort((a, b) => b.total - a.total);
        const activeJobs = jobs.filter((j: any) => j.status === "active").length;
        const avgRating = candidates.filter((c: any) => c.rating > 0).length > 0
          ? (candidates.filter((c: any) => c.rating > 0).reduce((a: number, c: any) => a + Number(c.rating), 0) / candidates.filter((c: any) => c.rating > 0).length).toFixed(1)
          : "0";
        return (
          <div className="space-y-5">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="text-xs text-muted-foreground mb-1">שיעור המרה</div>
                <div className="text-3xl font-bold text-emerald-400">{conversionRate}%</div>
                <div className="text-xs text-muted-foreground mt-0.5">מועמדים שהתקבלו</div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="text-xs text-muted-foreground mb-1">קבלת הצעות</div>
                <div className="text-3xl font-bold text-blue-400">{offerAcceptRate}%</div>
                <div className="text-xs text-muted-foreground mt-0.5">{offerAccepted}/{offerTotal} הצעות</div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="text-xs text-muted-foreground mb-1">ממוצע ציון</div>
                <div className="text-3xl font-bold text-yellow-400">{avgRating}</div>
                <div className="text-xs text-muted-foreground mt-0.5">מתוך 5</div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="text-xs text-muted-foreground mb-1">משרות פעילות</div>
                <div className="text-3xl font-bold text-cyan-400">{activeJobs}</div>
                <div className="text-xs text-muted-foreground mt-0.5">מתוך {jobs.length} משרות</div>
              </div>
            </div>

            {/* Time-to-Hire Metrics */}
            {recruitmentAnalytics && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-card border border-emerald-500/20 rounded-2xl p-4">
                  <div className="text-xs text-muted-foreground mb-1">זמן גיוס ממוצע</div>
                  <div className="text-3xl font-bold text-emerald-400">
                    {recruitmentAnalytics.avg_time_to_hire_days !== null ? `${recruitmentAnalytics.avg_time_to_hire_days}` : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">ימים בממוצע</div>
                </div>
                <div className="bg-card border border-blue-500/20 rounded-2xl p-4">
                  <div className="text-xs text-muted-foreground mb-1">זמן גיוס חציוני</div>
                  <div className="text-3xl font-bold text-blue-400">
                    {recruitmentAnalytics.median_time_to_hire_days !== null ? `${recruitmentAnalytics.median_time_to_hire_days}` : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">ימים (חציון)</div>
                </div>
                <div className="bg-card border border-purple-500/20 rounded-2xl p-4">
                  <div className="text-xs text-muted-foreground mb-1">שיעור המרה (מסד)</div>
                  <div className="text-3xl font-bold text-purple-400">
                    {recruitmentAnalytics.conversion_rate_pct}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{recruitmentAnalytics.hired}/{recruitmentAnalytics.total_candidates} סה"כ</div>
                </div>
                <div className="bg-card border border-orange-500/20 rounded-2xl p-4">
                  <div className="text-xs text-muted-foreground mb-1">ממוצע ציון מועמדים</div>
                  <div className="text-3xl font-bold text-yellow-400">{avgRating}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">מתוך 5 כוכבים</div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Pipeline Funnel */}
              <div className="bg-card border border-border rounded-2xl p-4">
                <h3 className="font-semibold text-foreground mb-3">משפך גיוס</h3>
                <div className="space-y-2">
                  {STAGES.filter(s => s.key !== "rejected").map(stage => {
                    const cnt = candidates.filter((c: any) => c.stage === stage.key).length;
                    const pct = totalCandidates > 0 ? (cnt / totalCandidates) * 100 : 0;
                    return (
                      <div key={stage.key} className="flex items-center gap-3">
                        <div className={`text-xs w-28 text-right flex-shrink-0 ${stage.color}`}>{stage.label}</div>
                        <div className="flex-1 bg-muted/20 rounded-full h-4 overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${stage.key === "hired" ? "bg-emerald-500" : "bg-blue-500/50"}`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="text-xs font-mono text-muted-foreground w-8 text-left">{cnt}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Source Distribution */}
              <div className="bg-card border border-border rounded-2xl p-4">
                <h3 className="font-semibold text-foreground mb-3">מקורות גיוס</h3>
                {bySource.length === 0 ? (
                  <div className="text-center text-muted-foreground text-sm py-4">אין נתונים</div>
                ) : (
                  <div className="space-y-2">
                    {bySource.map(s => {
                      const pct = totalCandidates > 0 ? (s.count / totalCandidates) * 100 : 0;
                      return (
                        <div key={s.label} className="flex items-center gap-3">
                          <div className="text-xs w-20 text-right flex-shrink-0 text-muted-foreground">{s.label}</div>
                          <div className="flex-1 bg-muted/20 rounded-full h-3 overflow-hidden">
                            <div className="h-full bg-purple-500/60 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="text-xs text-muted-foreground w-6 text-left">{s.count}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Department Breakdown */}
              {byDept.length > 0 && (
                <div className="bg-card border border-border rounded-2xl p-4 md:col-span-2">
                  <h3 className="font-semibold text-foreground mb-3">גיוס לפי מחלקה</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-muted-foreground text-xs border-b border-border/50">
                          <th className="text-right py-2 pr-3">מחלקה</th>
                          <th className="text-right py-2">סה"כ מועמדים</th>
                          <th className="text-right py-2">התקבלו</th>
                          <th className="text-right py-2">המרה</th>
                        </tr>
                      </thead>
                      <tbody>
                        {byDept.map((d, i) => (
                          <tr key={i} className="border-b border-border/20 hover:bg-muted/5">
                            <td className="py-2 pr-3 font-medium text-foreground">{d.dept}</td>
                            <td className="py-2 text-muted-foreground">{d.total}</td>
                            <td className="py-2 text-emerald-400">{d.hired}</td>
                            <td className="py-2 text-blue-400">{d.total > 0 ? ((d.hired / d.total) * 100).toFixed(0) : 0}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* CANDIDATE FORM MODAL */}
      <AnimatePresence>
        {showCandidateForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowCandidateForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center sticky top-0 bg-card z-10">
                <h2 className="text-lg font-bold text-foreground">{editCandidate ? "עריכת מועמד" : "מועמד חדש"}</h2>
                <button onClick={() => { setShowCandidateForm(false); setEditCandidate(null); }}><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><label className="text-xs text-muted-foreground mb-1 block">שם מלא *</label>
                    <input value={candidateForm.fullName || candidateForm.full_name || ""} onChange={e => setCandidateForm({ ...candidateForm, fullName: e.target.value, full_name: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">אימייל</label>
                    <input type="email" value={candidateForm.email || ""} onChange={e => setCandidateForm({ ...candidateForm, email: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">טלפון</label>
                    <input value={candidateForm.phone || ""} onChange={e => setCandidateForm({ ...candidateForm, phone: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">תפקיד מבוקש</label>
                    <input value={candidateForm.positionApplied || candidateForm.position_applied || ""} onChange={e => setCandidateForm({ ...candidateForm, positionApplied: e.target.value, position_applied: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">מחלקה</label>
                    <input value={candidateForm.department || ""} onChange={e => setCandidateForm({ ...candidateForm, department: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">שלב</label>
                    <select value={candidateForm.stage || "applied"} onChange={e => setCandidateForm({ ...candidateForm, stage: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm">
                      {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">מקור</label>
                    <select value={candidateForm.source || "website"} onChange={e => setCandidateForm({ ...candidateForm, source: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm">
                      {Object.entries(SOURCE_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">ניסיון (שנים)</label>
                    <input type="number" min={0} value={candidateForm.experienceYears || candidateForm.experience_years || ""} onChange={e => setCandidateForm({ ...candidateForm, experienceYears: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">ציון (1-5)</label>
                    <input type="number" min={1} max={5} value={candidateForm.rating || ""} onChange={e => setCandidateForm({ ...candidateForm, rating: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div className="col-span-2"><label className="text-xs text-muted-foreground mb-1 block">הערות</label>
                    <textarea rows={2} value={candidateForm.notes || ""} onChange={e => setCandidateForm({ ...candidateForm, notes: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm resize-none" /></div>
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2 sticky bottom-0 bg-card">
                <button onClick={() => { setShowCandidateForm(false); setEditCandidate(null); }} className="px-4 py-2 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
                <button onClick={saveCandidate} disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-foreground rounded-xl text-sm disabled:opacity-50">
                  {saving ? "שומר..." : editCandidate ? "עדכן" : "הוסף"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* JOB FORM MODAL */}
      <AnimatePresence>
        {showJobForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowJobForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center sticky top-0 bg-card z-10">
                <h2 className="text-lg font-bold text-foreground">{editJob ? "עריכת משרה" : "משרה חדשה"}</h2>
                <button onClick={() => { setShowJobForm(false); setEditJob(null); }}><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><label className="text-xs text-muted-foreground mb-1 block">כותרת המשרה *</label>
                    <input value={jobForm.title || ""} onChange={e => setJobForm({ ...jobForm, title: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">מחלקה</label>
                    <input value={jobForm.department || ""} onChange={e => setJobForm({ ...jobForm, department: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">מיקום</label>
                    <input value={jobForm.location || ""} onChange={e => setJobForm({ ...jobForm, location: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">שכר מינ׳ (₪)</label>
                    <input type="number" value={jobForm.salaryMin || ""} onChange={e => setJobForm({ ...jobForm, salaryMin: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">שכר מקס׳ (₪)</label>
                    <input type="number" value={jobForm.salaryMax || ""} onChange={e => setJobForm({ ...jobForm, salaryMax: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">סטטוס</label>
                    <select value={jobForm.status || "draft"} onChange={e => setJobForm({ ...jobForm, status: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm">
                      {Object.entries(JOB_STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">סוג העסקה</label>
                    <select value={jobForm.employmentType || "full_time"} onChange={e => setJobForm({ ...jobForm, employmentType: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm">
                      <option value="full_time">משרה מלאה</option>
                      <option value="part_time">משרה חלקית</option>
                      <option value="contract">קבלן</option>
                      <option value="internship">התמחות</option>
                    </select></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">תאריך פרסום</label>
                    <input type="date" value={jobForm.postedDate || ""} onChange={e => setJobForm({ ...jobForm, postedDate: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">תאריך סגירה</label>
                    <input type="date" value={jobForm.closingDate || ""} onChange={e => setJobForm({ ...jobForm, closingDate: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">מנהל גיוס</label>
                    <input value={jobForm.hiringManager || ""} onChange={e => setJobForm({ ...jobForm, hiringManager: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div className="col-span-2"><label className="text-xs text-muted-foreground mb-1 block">תיאור המשרה</label>
                    <textarea rows={3} value={jobForm.description || ""} onChange={e => setJobForm({ ...jobForm, description: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm resize-none" /></div>
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2 sticky bottom-0 bg-card">
                <button onClick={() => { setShowJobForm(false); setEditJob(null); }} className="px-4 py-2 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
                <button onClick={saveJob} disabled={saving || !jobForm.title} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-foreground rounded-xl text-sm disabled:opacity-50">
                  {saving ? "שומר..." : editJob ? "עדכן משרה" : "צור משרה"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* INTERVIEW FORM MODAL */}
      <AnimatePresence>
        {showInterviewForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowInterviewForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">תזמן ראיון</h2>
                <button onClick={() => setShowInterviewForm(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-3">
                <div><label className="text-xs text-muted-foreground mb-1 block">שם מועמד</label>
                  <input value={interviewForm.candidateName || ""} onChange={e => setInterviewForm({ ...interviewForm, candidateName: e.target.value })}
                    className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">תפקיד</label>
                  <input value={interviewForm.position || ""} onChange={e => setInterviewForm({ ...interviewForm, position: e.target.value })}
                    className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">שם מראיין</label>
                  <input value={interviewForm.interviewerName || ""} onChange={e => setInterviewForm({ ...interviewForm, interviewerName: e.target.value })}
                    className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-muted-foreground mb-1 block">תאריך ושעה</label>
                    <input type="datetime-local" value={interviewForm.scheduledAt || ""} onChange={e => setInterviewForm({ ...interviewForm, scheduledAt: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">משך (דקות)</label>
                    <input type="number" value={interviewForm.durationMinutes || 60} onChange={e => setInterviewForm({ ...interviewForm, durationMinutes: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-muted-foreground mb-1 block">סוג ראיון</label>
                    <select value={interviewForm.interviewType || "in_person"} onChange={e => setInterviewForm({ ...interviewForm, interviewType: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm">
                      {Object.entries(INTERVIEW_TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">מיקום</label>
                    <input value={interviewForm.location || ""} onChange={e => setInterviewForm({ ...interviewForm, location: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowInterviewForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
                <button onClick={saveInterview} disabled={saving} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-foreground rounded-xl text-sm disabled:opacity-50">
                  {saving ? "שומר..." : "תזמן ראיון"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* OFFER FORM MODAL */}
      <AnimatePresence>
        {showOfferForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowOfferForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editOffer ? "עריכת הצעת עבודה" : "הצעת עבודה חדשה"}</h2>
                <button onClick={() => { setShowOfferForm(false); setEditOffer(null); }}><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><label className="text-xs text-muted-foreground mb-1 block">שם המועמד *</label>
                    <input value={offerForm.candidateName || ""} onChange={e => setOfferForm({ ...offerForm, candidateName: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" placeholder="שם מלא של המועמד" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">תפקיד *</label>
                    <input value={offerForm.position || ""} onChange={e => setOfferForm({ ...offerForm, position: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">מחלקה</label>
                    <input value={offerForm.department || ""} onChange={e => setOfferForm({ ...offerForm, department: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">שכר חודשי (ברוטו)</label>
                    <input type="number" value={offerForm.salary || ""} onChange={e => setOfferForm({ ...offerForm, salary: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" placeholder="0" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">מטבע</label>
                    <select value={offerForm.currency || "ILS"} onChange={e => setOfferForm({ ...offerForm, currency: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm">
                      <option value="ILS">₪ ILS</option>
                      <option value="USD">$ USD</option>
                      <option value="EUR">€ EUR</option>
                    </select></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">תאריך תחילת עבודה</label>
                    <input type="date" value={offerForm.startDate || ""} onChange={e => setOfferForm({ ...offerForm, startDate: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">תוקף ההצעה עד</label>
                    <input type="date" value={offerForm.expiryDate || ""} onChange={e => setOfferForm({ ...offerForm, expiryDate: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">סטטוס</label>
                    <select value={offerForm.status || "draft"} onChange={e => setOfferForm({ ...offerForm, status: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm">
                      <option value="draft">טיוטה</option>
                      <option value="sent">נשלח</option>
                      <option value="accepted">התקבל</option>
                      <option value="rejected">נדחה</option>
                    </select></div>
                </div>
                <div><label className="text-xs text-muted-foreground mb-1 block">הטבות (רשימה חופשית)</label>
                  <textarea value={offerForm.benefits || ""} onChange={e => setOfferForm({ ...offerForm, benefits: e.target.value })}
                    rows={3} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm resize-none"
                    placeholder="ביטוח בריאות, קרן פנסיה, קרן השתלמות, רכב חברה..." /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">הערות</label>
                  <textarea value={offerForm.notes || ""} onChange={e => setOfferForm({ ...offerForm, notes: e.target.value })}
                    rows={2} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm resize-none" /></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setShowOfferForm(false); setEditOffer(null); }} className="px-4 py-2 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
                <button onClick={saveOffer} disabled={saving || !offerForm.candidateName || !offerForm.position}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-foreground rounded-xl text-sm">
                  {saving ? "שומר..." : editOffer ? "עדכן הצעה" : "צור הצעה"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
