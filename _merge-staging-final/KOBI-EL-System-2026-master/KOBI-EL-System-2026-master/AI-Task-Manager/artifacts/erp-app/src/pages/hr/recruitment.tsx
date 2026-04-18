import { useState, useEffect, useMemo } from "react";
import { Briefcase, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2, AlertTriangle, ArrowUpDown, Users, Target, TrendingUp, LayoutGrid, List, ChevronLeft, Eye, Star, Phone, Mail, UserCheck, UserX, FileText , Copy } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import StatusTransition from "@/components/status-transition";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtCur = (v: any) => `₪${fmt(v)}`;

interface Candidate {
  id: number; candidate_number: string; full_name: string; email: string; phone: string;
  position_applied: string; recruitment_id: number; department: string; source: string;
  stage: string; experience_years: number; education_level: string; cv_url: string;
  rating: number; salary_expectation: number; notes: string; rejection_reason: string;
  interviewer_name: string; interview_date: string; interview_notes: string;
  offer_amount: number; offer_date: string; hire_date: string; created_at: string;
}

interface RecruitmentRecord {
  id: number; job_number: string; position_title: string; department: string;
  employment_type: string; location: string; salary_range_min: number; salary_range_max: number;
  hiring_manager: string; recruiter_name: string; publish_date: string; deadline_date: string;
  candidates_count: number; interviews_scheduled: number; offers_made: number;
  positions_filled: number; total_positions: number; priority: string; status: string; notes: string;
}

const CANDIDATE_STAGES = [
  { key: "applied",    label: "הגיש מועמדות", color: "border-slate-500",   bg: "bg-slate-500/10",   dot: "bg-slate-400",   text: "text-slate-300" },
  { key: "screening",  label: "סינון ראשוני",  color: "border-blue-500",    bg: "bg-blue-500/10",    dot: "bg-blue-400",    text: "text-blue-400" },
  { key: "interview",  label: "ראיון",         color: "border-indigo-500",  bg: "bg-indigo-500/10",  dot: "bg-indigo-400",  text: "text-indigo-400" },
  { key: "offer",      label: "הצעת עבודה",   color: "border-purple-500",  bg: "bg-purple-500/10",  dot: "bg-purple-400",  text: "text-purple-400" },
  { key: "hired",      label: "התקבל",         color: "border-emerald-500", bg: "bg-emerald-500/10", dot: "bg-emerald-400", text: "text-emerald-400" },
  { key: "rejected",   label: "נדחה",          color: "border-red-500",     bg: "bg-red-500/10",     dot: "bg-red-400",     text: "text-red-400" },
];
const CSTAGE = Object.fromEntries(CANDIDATE_STAGES.map(s => [s.key, s]));

const NEXT_STAGES: Record<string, string[]> = {
  applied:   ["screening", "rejected"],
  screening: ["interview", "rejected"],
  interview: ["offer", "rejected"],
  offer:     ["hired", "rejected"],
};

const SOURCE_MAP: Record<string, string> = { linkedin: "LinkedIn", referral: "המלצה", website: "אתר", agency: "סוכנות", other: "אחר", direct: "פנייה ישירה" };
const EDU_MAP: Record<string, string> = { high_school: "תיכון", bachelor: "תואר ראשון", master: "תואר שני", phd: "דוקטורט", other: "אחר" };

const POSITION_STAGES = [
  { key: "draft",        label: "טיוטה",   bg: "bg-slate-500/10",   text: "text-slate-400",   dot: "bg-slate-400" },
  { key: "open",         label: "פתוח",    bg: "bg-green-500/10",   text: "text-green-400",   dot: "bg-green-400" },
  { key: "screening",    label: "סינון",   bg: "bg-blue-500/10",    text: "text-blue-400",    dot: "bg-blue-400" },
  { key: "interviewing", label: "ראיונות", bg: "bg-indigo-500/10",  text: "text-indigo-400",  dot: "bg-indigo-400" },
  { key: "offer",        label: "הצעה",   bg: "bg-purple-500/10",  text: "text-purple-400",  dot: "bg-purple-400" },
  { key: "filled",       label: "אויש",   bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-400" },
  { key: "on_hold",      label: "מוקפא",  bg: "bg-yellow-500/10",  text: "text-yellow-400",  dot: "bg-yellow-400" },
  { key: "cancelled",    label: "בוטל",   bg: "bg-red-500/10",     text: "text-red-400",     dot: "bg-red-400" },
];
const PSTAGE = Object.fromEntries(POSITION_STAGES.map(s => [s.key, s]));

const priorityMap: Record<string, { label: string; color: string }> = {
  low:    { label: "נמוכה",  color: "bg-muted/20 text-muted-foreground" },
  normal: { label: "רגילה",  color: "bg-blue-500/20 text-blue-400" },
  high:   { label: "גבוהה",  color: "bg-orange-500/20 text-orange-400" },
  urgent: { label: "דחופה", color: "bg-red-500/20 text-red-400" },
};
const typeMap: Record<string, string> = { full_time: "משרה מלאה", part_time: "חלקית", contract: "חוזה", temporary: "זמנית", internship: "התמחות" };

function CandidateKanban({ candidates, positions, onStageChange, onView, onEdit }: {
  candidates: Candidate[];
  positions: RecruitmentRecord[];
  onStageChange: (id: number, stage: string) => void;
  onView: (c: Candidate) => void;
  onEdit: (c: Candidate) => void;
}) {
  const [filterPosition, setFilterPosition] = useState("all");

  const filtered = useMemo(() => {
    if (filterPosition === "all") return candidates;
    return candidates.filter(c => c.position_applied === filterPosition || String(c.recruitment_id) === filterPosition);
  }, [candidates, filterPosition]);

  const byStage = useMemo(() => {
    const map: Record<string, Candidate[]> = {};
    CANDIDATE_STAGES.forEach(s => { map[s.key] = []; });
    filtered.forEach(c => { if (map[c.stage]) map[c.stage].push(c); else map["applied"].push(c); });
    return map;
  }, [filtered]);

  const positionOptions = useMemo(() => {
    const posSet = new Set<string>();
    candidates.forEach(c => { if (c.position_applied) posSet.add(c.position_applied); });
    return Array.from(posSet).sort();
  }, [candidates]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <select value={filterPosition} onChange={e => setFilterPosition(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2 text-sm">
          <option value="all">כל המשרות</option>
          {positionOptions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} מועמדים</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-3">
        {CANDIDATE_STAGES.map(stage => (
          <div key={stage.key} className={`flex-shrink-0 w-60 rounded-2xl border ${stage.color} bg-card/50`}>
            <div className={`flex items-center gap-2 px-3 py-2.5 border-b ${stage.color} rounded-t-2xl ${stage.bg}`}>
              <span className={`w-2 h-2 rounded-full ${stage.dot}`} />
              <span className={`text-sm font-semibold ${stage.text}`}>{stage.label}</span>
              <span className="mr-auto bg-card border rounded-full text-[10px] px-1.5 py-0.5 text-muted-foreground font-mono">{byStage[stage.key]?.length || 0}</span>
            </div>
            <div className="p-2 space-y-2 min-h-[200px] max-h-[580px] overflow-y-auto">
              {(byStage[stage.key] || []).map(c => (
                <motion.div key={c.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="bg-card border border-border/50 rounded-xl p-3 hover:border-border cursor-pointer group transition-colors"
                  onClick={() => onView(c)}>
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className="text-sm font-bold text-foreground leading-tight">{c.full_name}</span>
                    {c.rating > 0 && (
                      <div className="flex gap-0.5 flex-shrink-0">
                        {Array.from({length: c.rating}).map((_, i) => <Star key={i} className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />)}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mb-1.5">{c.position_applied}</div>
                  {c.department && <div className="text-xs text-muted-foreground/70 mb-1.5">{c.department}</div>}
                  <div className="flex gap-2 text-xs text-muted-foreground mb-2">
                    {c.experience_years > 0 && <span>{c.experience_years}y ניסיון</span>}
                    {c.source && <span className="border-r pr-2">{SOURCE_MAP[c.source] || c.source}</span>}
                  </div>
                  {c.interview_date && stage.key === "interview" && (
                    <div className="text-xs text-indigo-400 mb-1.5">ראיון: {c.interview_date?.slice(0,10)}</div>
                  )}
                  {c.salary_expectation > 0 && stage.key === "offer" && (
                    <div className="text-xs text-purple-400 mb-1.5">ציפייה: {fmtCur(c.salary_expectation)}</div>
                  )}
                  {/* Stage transition buttons */}
                  <div className="flex gap-1 mt-2">
                    {NEXT_STAGES[c.stage]?.filter(s => s !== "rejected").slice(0,1).map(next => {
                      const ns = CSTAGE[next];
                      return (
                        <button key={next} onClick={e => { e.stopPropagation(); onStageChange(c.id, next); }}
                          className={`flex-1 text-[10px] py-1 rounded-lg border ${ns.color} ${ns.bg} ${ns.text} hover:opacity-80 flex items-center justify-center gap-0.5`}>
                          <ChevronLeft className="w-2.5 h-2.5" /> {ns.label}
                        </button>
                      );
                    })}
                    {NEXT_STAGES[c.stage]?.includes("rejected") && (
                      <button onClick={e => { e.stopPropagation(); onStageChange(c.id, "rejected"); }}
                        className="flex-none p-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">
                        <UserX className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
              {(byStage[stage.key] || []).length === 0 && (
                <div className="text-center text-muted-foreground/20 text-xs py-10">ריק</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CandidateDetail({ candidate, onClose, onStageChange, onEdit }: {
  candidate: Candidate;
  onClose: () => void;
  onStageChange: (id: number, stage: string) => void;
  onEdit: (c: Candidate) => void;
}) {
  const stage = CSTAGE[candidate.stage];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-border flex justify-between items-center">
          <h2 className="text-lg font-bold text-foreground">{candidate.full_name}</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        {/* Stage strip */}
        <div className="px-5 py-3 border-b border-border/50 bg-muted/10">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">שלב:</span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${stage?.bg} ${stage?.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${stage?.dot}`} />{stage?.label}
            </span>
            {NEXT_STAGES[candidate.stage]?.map(next => {
              const ns = CSTAGE[next];
              const isReject = next === "rejected";
              return (
                <button key={next} onClick={() => { onStageChange(candidate.id, next); }}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${isReject ? "border-red-500/40 bg-red-500/10 text-red-400" : `${ns.color} ${ns.bg} ${ns.text}`} hover:opacity-80`}>
                  {isReject ? <UserX className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />} {ns?.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-xs text-muted-foreground">מספר</div><div className="font-mono text-blue-400">{candidate.candidate_number}</div></div>
            <div><div className="text-xs text-muted-foreground">משרה</div><div className="font-medium text-foreground">{candidate.position_applied || "—"}</div></div>
            <div><div className="text-xs text-muted-foreground">מחלקה</div><div className="text-foreground">{candidate.department || "—"}</div></div>
            <div><div className="text-xs text-muted-foreground">מקור</div><div>{SOURCE_MAP[candidate.source] || candidate.source || "—"}</div></div>
            {candidate.email && <div><div className="text-xs text-muted-foreground">אימייל</div>
              <a href={`mailto:${candidate.email}`} className="text-blue-400 text-xs flex items-center gap-1"><Mail className="w-3 h-3" /> {candidate.email}</a></div>}
            {candidate.phone && <div><div className="text-xs text-muted-foreground">טלפון</div>
              <a href={`tel:${candidate.phone}`} className="text-green-400 text-xs flex items-center gap-1"><Phone className="w-3 h-3" /> {candidate.phone}</a></div>}
            {candidate.experience_years > 0 && <div><div className="text-xs text-muted-foreground">ניסיון</div><div>{candidate.experience_years} שנים</div></div>}
            {candidate.education_level && <div><div className="text-xs text-muted-foreground">השכלה</div><div>{EDU_MAP[candidate.education_level] || candidate.education_level}</div></div>}
            {candidate.rating > 0 && <div><div className="text-xs text-muted-foreground">דירוג</div>
              <div className="flex gap-0.5">{Array.from({length:5}).map((_,i)=><Star key={i} className={`w-3.5 h-3.5 ${i<candidate.rating?"text-amber-400 fill-amber-400":"text-muted-foreground"}`} />)}</div></div>}
            {candidate.salary_expectation > 0 && <div><div className="text-xs text-muted-foreground">ציפיית שכר</div><div className="text-purple-400">{fmtCur(candidate.salary_expectation)}</div></div>}
          </div>
          {/* Interview section */}
          {(candidate.interviewer_name || candidate.interview_date) && (
            <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3">
              <div className="text-xs font-bold text-indigo-400 mb-2">ראיון</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {candidate.interviewer_name && <div><div className="text-xs text-muted-foreground">מראיין</div><div>{candidate.interviewer_name}</div></div>}
                {candidate.interview_date && <div><div className="text-xs text-muted-foreground">תאריך</div><div>{candidate.interview_date?.slice(0,10)}</div></div>}
                {candidate.interview_notes && <div className="col-span-2"><div className="text-xs text-muted-foreground">הערות ראיון</div><div className="text-sm">{candidate.interview_notes}</div></div>}
              </div>
            </div>
          )}
          {/* Offer section */}
          {(candidate.offer_amount > 0 || candidate.offer_date) && (
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-3">
              <div className="text-xs font-bold text-purple-400 mb-2">הצעת עבודה</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {candidate.offer_amount > 0 && <div><div className="text-xs text-muted-foreground">שכר מוצע</div><div className="text-purple-400 font-bold">{fmtCur(candidate.offer_amount)}</div></div>}
                {candidate.offer_date && <div><div className="text-xs text-muted-foreground">תאריך הצעה</div><div>{candidate.offer_date?.slice(0,10)}</div></div>}
              </div>
            </div>
          )}
          {candidate.hire_date && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-emerald-400" />
              <div><div className="text-xs text-muted-foreground">התחלת עבודה</div><div className="font-bold text-emerald-400">{candidate.hire_date?.slice(0,10)}</div></div>
            </div>
          )}
          {candidate.rejection_reason && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
              <div className="text-xs font-bold text-red-400 mb-1">סיבת דחייה</div>
              <div className="text-sm">{candidate.rejection_reason}</div>
            </div>
          )}
          {candidate.notes && <div><div className="text-xs text-muted-foreground mb-1">הערות</div><div className="text-sm bg-muted/20 rounded-xl p-3">{candidate.notes}</div></div>}
        </div>
        <div className="p-5 border-t border-border flex justify-end gap-2">
          <button onClick={() => { onClose(); onEdit(candidate); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30"><Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה</button>
          <button onClick={onClose} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
        </div>
      </motion.div>
    </motion.div>
  );
}


const load: any[] = [];
export default function RecruitmentPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [mainTab, setMainTab] = useState<"candidates" | "positions">("candidates");

  // Candidates state
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [cStats, setCStats] = useState<any>({});
  const [cLoading, setCLoading] = useState(true);
  const [cSearch, setCSearch] = useState("");
  const [cFilterStage, setCFilterStage] = useState("all");
  const [cFilterDept, setCFilterDept] = useState("all");
  const [cViewMode, setCViewMode] = useState<"kanban" | "list">("kanban");
  const [viewCandidate, setViewCandidate] = useState<Candidate | null>(null);
  const [editCandidate, setEditCandidate] = useState<Candidate | null>(null);
  const [showCForm, setShowCForm] = useState(false);
  const [cForm, setCForm] = useState<any>({});

  // Positions state
  const [positions, setPositions] = useState<RecruitmentRecord[]>([]);
  const [pStats, setPStats] = useState<any>({});
  const [pLoading, setPLoading] = useState(true);
  const [pSearch, setPSearch] = useState("");
  const [pFilterStatus, setPFilterStatus] = useState("all");
  const [pFilterDept, setPFilterDept] = useState("all");
  const [pSortField, setPSortField] = useState("created_at");
  const [pSortDir, setPSortDir] = useState<"asc"|"desc">("desc");
  const [editPosition, setEditPosition] = useState<RecruitmentRecord | null>(null);
  const [showPForm, setShowPForm] = useState(false);
  const [pForm, setPForm] = useState<any>({});
  const [viewPosition, setViewPosition] = useState<RecruitmentRecord | null>(null);

  const bulk = useBulkSelection();
  const pagination = useSmartPagination(25);

  const loadCandidates = async () => {
    setCLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        authFetch(`${API}/candidates`),
        authFetch(`${API}/candidates/stats`),
      ]);
      if (r1.ok) setCandidates(safeArray(await r1.json()));
      if (r2.ok) setCStats((await r2.json()) || {});
    } catch {}
    setCLoading(false);
  };

  const loadPositions = async () => {
    setPLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        authFetch(`${API}/recruitment`),
        authFetch(`${API}/recruitment/stats`),
      ]);
      if (r1.ok) setPositions(safeArray(await r1.json()));
      if (r2.ok) setPStats((await r2.json()) || {});
    } catch {}
    setPLoading(false);
  };

  useEffect(() => { loadCandidates(); loadPositions(); }, []);

  // Filtered candidates for list view
  const filteredCandidates = useMemo(() => {
    return candidates.filter(c =>
      (cFilterStage === "all" || c.stage === cFilterStage) &&
      (cFilterDept === "all" || c.department === cFilterDept) &&
      (!cSearch || [c.full_name, c.email, c.position_applied, c.department].some(f => f?.toLowerCase().includes(cSearch.toLowerCase())))
    );
  }, [candidates, cFilterStage, cFilterDept, cSearch]);

  // Reset to page 1 when filters or candidates change
  useEffect(() => { pagination.setPage(1); pagination.setTotalItems(filteredCandidates.length); }, [filteredCandidates.length]);

  const candidateDepts = useMemo(() => {
    const s = new Set<string>(); candidates.forEach(c => { if (c.department) s.add(c.department); }); return Array.from(s).sort();
  }, [candidates]);

  const positionDepts = useMemo(() => {
    const s = new Set<string>(); positions.forEach(p => { if (p.department) s.add(p.department); }); return Array.from(s).sort();
  }, [positions]);

  const filteredPositions = useMemo(() => {
    let data = positions.filter(p =>
      (pFilterStatus === "all" || p.status === pFilterStatus) &&
      (pFilterDept === "all" || p.department === pFilterDept) &&
      (!pSearch || [p.job_number, p.position_title, p.department, p.hiring_manager].some(f => f?.toLowerCase().includes(pSearch.toLowerCase())))
    );
    data.sort((a: any, b: any) => { const va = a[pSortField] ?? ""; const vb = b[pSortField] ?? ""; const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he"); return pSortDir === "asc" ? cmp : -cmp; });
    return data;
  }, [positions, pSearch, pFilterStatus, pFilterDept, pSortField, pSortDir]);

  const changeCandidateStage = async (id: number, stage: string) => {
    await authFetch(`${API}/candidates/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }) });
    loadCandidates();
    if (viewCandidate?.id === id) setViewCandidate(prev => prev ? { ...prev, stage } : null);
  };

  const changePositionStatus = async (id: number, status: string) => {
    await authFetch(`${API}/recruitment/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    loadPositions();
  };

  const [cFormErrors, setCFormErrors] = useState<Record<string,string>>({});

  const openCCreate = () => { setEditCandidate(null); setCForm({ stage: "applied", source: "linkedin", rating: 0 }); setCFormErrors({}); setShowCForm(true); };
  const openCEdit = (c: Candidate) => { setEditCandidate(c); setCForm({ fullName: c.full_name, email: c.email, phone: c.phone, positionApplied: c.position_applied, recruitmentId: c.recruitment_id, department: c.department, source: c.source, stage: c.stage, experienceYears: c.experience_years, educationLevel: c.education_level, rating: c.rating, salaryExpectation: c.salary_expectation, notes: c.notes, interviewerName: c.interviewer_name, interviewDate: c.interview_date?.slice(0,10), interviewNotes: c.interview_notes, offerAmount: c.offer_amount, offerDate: c.offer_date?.slice(0,10), hireDate: c.hire_date?.slice(0,10), rejectionReason: c.rejection_reason }); setCFormErrors({}); setShowCForm(true); };
  const saveCandidate = async () => {
    const errors: Record<string,string> = {};
    if (!cForm.fullName?.trim()) errors.fullName = "שם מלא נדרש";
    if (!cForm.positionApplied?.trim() && !cForm.recruitmentId) errors.positionApplied = "משרה נדרשת";
    if (Object.keys(errors).length > 0) { setCFormErrors(errors); return; }
    const url = editCandidate ? `${API}/candidates/${editCandidate.id}` : `${API}/candidates`;
    await authFetch(url, { method: editCandidate ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cForm) });
    setShowCForm(false); loadCandidates();
  };
  const deleteCandidate = async (id: number) => { if (await globalConfirm("למחוק מועמד זה?")) { await authFetch(`${API}/candidates/${id}`, { method: "DELETE" }); loadCandidates(); } };

  const openPCreate = () => { setEditPosition(null); setPForm({ employmentType: "full_time", priority: "normal", status: "draft", totalPositions: 1 }); setShowPForm(true); };
  const openPEdit = (r: RecruitmentRecord) => { setEditPosition(r); setPForm({ positionTitle: r.position_title, department: r.department, employmentType: r.employment_type, location: r.location, salaryRangeMin: r.salary_range_min, salaryRangeMax: r.salary_range_max, hiringManager: r.hiring_manager, recruiterName: r.recruiter_name, deadlineDate: r.deadline_date?.slice(0,10), totalPositions: r.total_positions, priority: r.priority, status: r.status, notes: r.notes }); setShowPForm(true); };
  const savePosition = async () => { const url = editPosition ? `${API}/recruitment/${editPosition.id}` : `${API}/recruitment`; await authFetch(url, { method: editPosition ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pForm) }); setShowPForm(false); loadPositions(); };

  const kpis = mainTab === "candidates" ? [
    { label: "מועמדים", value: fmt(candidates.length), icon: Users, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "הגישו מועמדות", value: fmt(cStats.applied || 0), icon: Target, color: "text-slate-400", bg: "bg-slate-500/10" },
    { label: "בסינון", value: fmt(cStats.screening || 0), icon: Search, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "בראיון", value: fmt(cStats.interview || 0), icon: Users, color: "text-indigo-400", bg: "bg-indigo-500/10" },
    { label: "בהצעה", value: fmt(cStats.offer || 0), icon: TrendingUp, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "התקבלו", value: fmt(cStats.hired || 0), icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "נדחו", value: fmt(cStats.rejected || 0), icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
    { label: "שיעור קבלה", value: candidates.length ? `${Math.round(((cStats.hired||0)/candidates.length)*100)}%` : "—", icon: TrendingUp, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  ] : [
    { label: "משרות פתוחות", value: fmt(pStats.open || 0), icon: Briefcase, color: "text-green-400", bg: "bg-green-500/10" },
    { label: "בסינון", value: fmt(pStats.screening || 0), icon: Search, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "בראיונות", value: fmt(pStats.interviewing || 0), icon: Users, color: "text-indigo-400", bg: "bg-indigo-500/10" },
    { label: "בהצעה", value: fmt(pStats.offer_stage || 0), icon: TrendingUp, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "אוישו", value: fmt(pStats.filled || 0), icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "כלל מועמדים", value: fmt(pStats.total_candidates || 0), icon: Users, color: "text-orange-400", bg: "bg-orange-500/10" },
    { label: "דחופות", value: fmt(pStats.urgent || 0), icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
    { label: "סה\"כ משרות", value: fmt(positions.length), icon: Briefcase, color: "text-blue-400", bg: "bg-blue-500/10" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Briefcase className="text-blue-400 w-6 h-6" /> גיוס עובדים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מועמדים, קנבן, ראיונות, הצעות ומשרות פתוחות</p>
        </div>
        <div className="flex gap-2">
          {mainTab === "candidates" ? (
            <>
              <ExportDropdown data={filteredCandidates} headers={{ candidate_number: "מספר", full_name: "שם", position_applied: "משרה", stage: "שלב", department: "מחלקה" }} filename="candidates" />
              <button onClick={openCCreate} className="flex items-center gap-2 bg-blue-600 text-foreground px-4 py-2.5 rounded-xl hover:bg-blue-700 shadow-lg text-sm font-medium">
                <Plus className="w-4 h-4" /> מועמד חדש
              </button>
            </>
          ) : (
            <>
              <ExportDropdown data={filteredPositions} headers={{ job_number: "מספר", position_title: "משרה", department: "מחלקה", status: "סטטוס" }} filename="recruitment" />
              <button onClick={openPCreate} className="flex items-center gap-2 bg-blue-600 text-foreground px-4 py-2.5 rounded-xl hover:bg-blue-700 shadow-lg text-sm font-medium">
                <Plus className="w-4 h-4" /> משרה חדשה
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Tab Toggle */}
      <div className="flex gap-1 bg-card border border-border/50 rounded-2xl p-1 w-fit">
        <button onClick={() => setMainTab("candidates")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${mainTab === "candidates" ? "bg-blue-600 text-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}>
          <Users className="w-4 h-4" /> מועמדים
        </button>
        <button onClick={() => setMainTab("positions")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${mainTab === "positions" ? "bg-blue-600 text-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}>
          <Briefcase className="w-4 h-4" /> משרות
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className={`border border-border/50 rounded-2xl p-3 ${kpi.bg}`}>
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-1.5`} />
            <div className="text-xl font-bold text-foreground">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      {/* CANDIDATES TAB */}
      {mainTab === "candidates" && (
        <>
          <div className="flex gap-3 flex-wrap items-center">
            <div className="flex gap-1 bg-card border border-border/50 rounded-xl p-1">
              <button onClick={() => setCViewMode("kanban")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${cViewMode === "kanban" ? "bg-blue-600 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <LayoutGrid className="w-3.5 h-3.5" /> קנבן
              </button>
              <button onClick={() => setCViewMode("list")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${cViewMode === "list" ? "bg-blue-600 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <List className="w-3.5 h-3.5" /> רשימה
              </button>
            </div>
            <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-sm">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={cSearch} onChange={e => setCSearch(e.target.value)} placeholder="חיפוש מועמד..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm" />
            </div>
            <select value={cFilterStage} onChange={e => setCFilterStage(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
              <option value="all">כל השלבים</option>{CANDIDATE_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <select value={cFilterDept} onChange={e => setCFilterDept(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
              <option value="all">כל המחלקות</option>{candidateDepts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {cLoading ? (
            <div className="space-y-2">{Array.from({length:6}).map((_,i) => <div key={i} className="h-12 bg-muted/20 rounded-xl animate-pulse" />)}</div>
          ) : cViewMode === "kanban" ? (
            <CandidateKanban
              candidates={filteredCandidates}
              positions={positions}
              onStageChange={changeCandidateStage}
              onView={c => setViewCandidate(c)}
              onEdit={openCEdit}
            />
          ) : (
            <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b border-border/50"><tr>
                    <th className="px-2 py-3 w-10"><BulkCheckbox checked={bulk.isAllSelected(filteredCandidates)} indeterminate={bulk.isSomeSelected(filteredCandidates)} onChange={() => bulk.toggleAll(filteredCandidates)} /></th>
                    {["candidate_number","full_name","position_applied","department","source","experience_years","rating","stage"].map(col => (
                      <th key={col} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground whitespace-nowrap">{
                        { candidate_number:"מספר", full_name:"שם", position_applied:"משרה", department:"מחלקה", source:"מקור", experience_years:"ניסיון", rating:"דירוג", stage:"שלב" }[col]
                      }</th>
                    ))}
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                  </tr></thead>
                  <tbody>
                    {pagination.paginate(filteredCandidates).map(c => {
                      const st = CSTAGE[c.stage];
                      return (
                        <tr key={c.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                          <td className="px-2 py-3"><BulkCheckbox checked={bulk.isSelected(c.id)} onChange={() => bulk.toggle(c.id)} /></td>
                          <td className="px-4 py-3 font-mono text-xs text-blue-400 font-bold">{c.candidate_number}</td>
                          <td className="px-4 py-3 text-foreground font-medium">{c.full_name}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{c.position_applied || "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{c.department || "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{SOURCE_MAP[c.source] || c.source || "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{c.experience_years || 0}y</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-0.5">{Array.from({length:5}).map((_,i) => <Star key={i} className={`w-3 h-3 ${i<c.rating?"text-amber-400 fill-amber-400":"text-muted-foreground"}`} />)}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${st?.bg} ${st?.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${st?.dot}`} />{st?.label}
                            </span>
                          </td>
                          <td className="px-4 py-3"><div className="flex gap-1">
                            <button onClick={() => setViewCandidate(c)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                            <button onClick={() => openCEdit(c)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button><button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/candidates`, c.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                            <button onClick={() => deleteCandidate(c.id)} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                          </div></td>
                        </tr>
                      );
                    })}
                    {filteredCandidates.length === 0 && <tr><td colSpan={10} className="text-center py-12 text-muted-foreground">אין מועמדים</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {cViewMode === "list" && <SmartPagination pagination={pagination} />}
        </>
      )}

      {/* POSITIONS TAB */}
      {mainTab === "positions" && (
        <>
          <div className="flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-sm">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={pSearch} onChange={e => setPSearch(e.target.value)} placeholder="חיפוש משרה..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm" />
            </div>
            <select value={pFilterStatus} onChange={e => setPFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
              <option value="all">כל הסטטוסים</option>{POSITION_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <select value={pFilterDept} onChange={e => setPFilterDept(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
              <option value="all">כל המחלקות</option>{positionDepts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <span className="text-sm text-muted-foreground">{filteredPositions.length} משרות</span>
          </div>

          {pLoading ? (
            <div className="space-y-2">{Array.from({length:6}).map((_,i) => <div key={i} className="h-12 bg-muted/20 rounded-xl animate-pulse" />)}</div>
          ) : (
            <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b border-border/50"><tr>
                    {[
                      { key: "job_number", label: "מספר" }, { key: "position_title", label: "משרה" },
                      { key: "department", label: "מחלקה" }, { key: "employment_type", label: "סוג" },
                      { key: "hiring_manager", label: "מגייס" }, { key: "candidates_count", label: "מועמדים" },
                      { key: "interviews_scheduled", label: "ראיונות" }, { key: "offers_made", label: "הצעות" },
                      { key: "deadline_date", label: "דדליין" }, { key: "priority", label: "עדיפות" },
                      { key: "status", label: "סטטוס" },
                    ].map(col => (
                      <th key={col.key} onClick={() => { if (pSortField === col.key) setPSortDir(d => d === "asc" ? "desc" : "asc"); else { setPSortField(col.key); setPSortDir("desc"); } }}
                        className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground whitespace-nowrap">
                        <div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                  </tr></thead>
                  <tbody>
                    {filteredPositions.length === 0 ? <tr><td colSpan={12} className="text-center py-12 text-muted-foreground">אין משרות</td></tr>
                    : filteredPositions.map(r => {
                      const isOverdue = r.deadline_date && new Date(r.deadline_date) < new Date() && !["filled","cancelled"].includes(r.status);
                      const pst = PSTAGE[r.status];
                      return (
                        <tr key={r.id} className={`border-b border-border/20 hover:bg-muted/20 transition-colors ${isOverdue ? "bg-red-500/5" : ""}`}>
                          <td className="px-4 py-3 font-mono text-xs text-blue-400 font-bold">{r.job_number}</td>
                          <td className="px-4 py-3 text-foreground font-medium whitespace-nowrap">{r.position_title}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{r.department || "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{typeMap[r.employment_type] || r.employment_type}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{r.hiring_manager || "—"}</td>
                          <td className="px-4 py-3 font-bold text-foreground">{r.candidates_count || 0}</td>
                          <td className="px-4 py-3 text-muted-foreground">{r.interviews_scheduled || 0}</td>
                          <td className="px-4 py-3 text-muted-foreground">{r.offers_made || 0}</td>
                          <td className={`px-4 py-3 text-xs ${isOverdue ? "text-red-400 font-bold" : "text-muted-foreground"}`}>
                            {r.deadline_date?.slice(0,10) || "—"}{isOverdue && " ⚠"}
                          </td>
                          <td className="px-4 py-3"><Badge className={`text-[10px] ${priorityMap[r.priority]?.color || "bg-muted/20"}`}>{priorityMap[r.priority]?.label || r.priority}</Badge></td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${pst?.bg} ${pst?.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${pst?.dot}`} />{pst?.label || r.status}
                            </span>
                          </td>
                          <td className="px-4 py-3"><div className="flex gap-1">
                            <button onClick={() => setViewPosition(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                            <button onClick={() => openPEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button><button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/recruitment`, r.id); if (res.ok) { loadPositions(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                            {isSuperAdmin && <button onClick={async () => { if (await globalConfirm(`למחוק '${r.position_title}'?`)) { await authFetch(`${API}/recruitment/${r.id}`, { method: "DELETE" }); loadPositions(); } }} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                          </div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Candidate Detail Modal */}
      <AnimatePresence>
        {viewCandidate && (
          <CandidateDetail
            candidate={viewCandidate}
            onClose={() => setViewCandidate(null)}
            onStageChange={changeCandidateStage}
            onEdit={openCEdit}
          />
        )}
      </AnimatePresence>

      {/* Candidate Form Modal */}
      <AnimatePresence>
        {showCForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowCForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editCandidate ? "עריכת מועמד" : "מועמד חדש"}</h2>
                <button onClick={() => setShowCForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">שם מלא *</label>
                    <input value={cForm.fullName || ""} onChange={e => { setCForm({...cForm, fullName: e.target.value}); if (cFormErrors.fullName) setCFormErrors(prev => ({...prev, fullName: ""})); }} className={`w-full bg-background border rounded-xl px-3 py-2.5 text-sm ${cFormErrors.fullName ? "border-red-500" : "border-border"}`} />
                    {cFormErrors.fullName && <p className="text-red-400 text-xs mt-1">{cFormErrors.fullName}</p>}
                  </div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">אימייל</label><input type="email" value={cForm.email || ""} onChange={e => setCForm({...cForm, email: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">טלפון</label><input value={cForm.phone || ""} onChange={e => setCForm({...cForm, phone: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">משרה מבוקשת *</label>
                    <select value={cForm.recruitmentId || ""} onChange={e => { const pos = positions.find(p => String(p.id) === e.target.value); setCForm({...cForm, recruitmentId: e.target.value, positionApplied: pos?.position_title || "", department: pos?.department || ""}); if (cFormErrors.positionApplied) setCFormErrors(prev => ({...prev, positionApplied: ""})); }} className={`w-full bg-background border rounded-xl px-3 py-2.5 text-sm ${cFormErrors.positionApplied ? "border-red-500" : "border-border"}`}>
                      <option value="">-- בחר משרה --</option>
                      {positions.filter(p => ["open","screening","interviewing"].includes(p.status)).map(p => <option key={p.id} value={p.id}>{p.position_title} ({p.department})</option>)}
                    </select>
                    {cFormErrors.positionApplied && <p className="text-red-400 text-xs mt-1">{cFormErrors.positionApplied}</p>}
                  </div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מחלקה</label><input value={cForm.department || ""} onChange={e => setCForm({...cForm, department: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">שלב</label>
                    <select value={cForm.stage || "applied"} onChange={e => setCForm({...cForm, stage: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {CANDIDATE_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מקור</label>
                    <select value={cForm.source || "linkedin"} onChange={e => setCForm({...cForm, source: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(SOURCE_MAP).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">ניסיון (שנים)</label><input type="number" step="0.5" value={cForm.experienceYears || ""} onChange={e => setCForm({...cForm, experienceYears: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">השכלה</label>
                    <select value={cForm.educationLevel || ""} onChange={e => setCForm({...cForm, educationLevel: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      <option value="">—</option>{Object.entries(EDU_MAP).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">דירוג (1-5)</label><input type="number" min="0" max="5" value={cForm.rating || ""} onChange={e => setCForm({...cForm, rating: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">ציפיית שכר</label><input type="number" value={cForm.salaryExpectation || ""} onChange={e => setCForm({...cForm, salaryExpectation: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  {(cForm.stage === "interview" || cForm.stage === "offer" || cForm.stage === "hired") && (<>
                    <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מראיין</label><input value={cForm.interviewerName || ""} onChange={e => setCForm({...cForm, interviewerName: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                    <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך ראיון</label><input type="date" value={cForm.interviewDate || ""} onChange={e => setCForm({...cForm, interviewDate: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                    <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות ראיון</label><textarea value={cForm.interviewNotes || ""} onChange={e => setCForm({...cForm, interviewNotes: e.target.value})} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  </>)}
                  {(cForm.stage === "offer" || cForm.stage === "hired") && (<>
                    <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">שכר מוצע</label><input type="number" value={cForm.offerAmount || ""} onChange={e => setCForm({...cForm, offerAmount: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                    <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך הצעה</label><input type="date" value={cForm.offerDate || ""} onChange={e => setCForm({...cForm, offerDate: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  </>)}
                  {cForm.stage === "hired" && (
                    <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך התחלה</label><input type="date" value={cForm.hireDate || ""} onChange={e => setCForm({...cForm, hireDate: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  )}
                  {cForm.stage === "rejected" && (
                    <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">סיבת דחייה</label><textarea value={cForm.rejectionReason || ""} onChange={e => setCForm({...cForm, rejectionReason: e.target.value})} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  )}
                  <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label><textarea value={cForm.notes || ""} onChange={e => setCForm({...cForm, notes: e.target.value})} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowCForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={saveCandidate} className="px-6 py-2 bg-blue-600 text-foreground rounded-lg text-sm hover:bg-blue-700"><Save className="w-3.5 h-3.5 inline ml-1" /> {editCandidate ? "עדכון" : "שמירה"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Position Form Modal */}
      <AnimatePresence>
        {showPForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowPForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editPosition ? "עריכת משרה" : "משרה חדשה"}</h2>
                <button onClick={() => setShowPForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">כותרת המשרה *</label><input value={pForm.positionTitle || ""} onChange={e => setPForm({...pForm, positionTitle: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מחלקה</label><input value={pForm.department || ""} onChange={e => setPForm({...pForm, department: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג משרה</label>
                    <select value={pForm.employmentType || "full_time"} onChange={e => setPForm({...pForm, employmentType: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(typeMap).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select>
                  </div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מנהל מגייס</label><input value={pForm.hiringManager || ""} onChange={e => setPForm({...pForm, hiringManager: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">דדליין</label><input type="date" value={pForm.deadlineDate || ""} onChange={e => setPForm({...pForm, deadlineDate: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">עדיפות</label>
                    <select value={pForm.priority || "normal"} onChange={e => setPForm({...pForm, priority: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(priorityMap).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select>
                  </div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                    <select value={pForm.status || "draft"} onChange={e => setPForm({...pForm, status: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{POSITION_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
                  </div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">שכר מינימום</label><input type="number" value={pForm.salaryRangeMin || ""} onChange={e => setPForm({...pForm, salaryRangeMin: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">שכר מקסימום</label><input type="number" value={pForm.salaryRangeMax || ""} onChange={e => setPForm({...pForm, salaryRangeMax: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label><textarea value={pForm.notes || ""} onChange={e => setPForm({...pForm, notes: e.target.value})} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowPForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={savePosition} className="px-6 py-2 bg-blue-600 text-foreground rounded-lg text-sm hover:bg-blue-700"><Save className="w-3.5 h-3.5 inline ml-1" /> {editPosition ? "עדכון" : "שמירה"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
