import { useState, useEffect, useMemo } from "react";
import { Award, Search, Plus, Edit2, Trash2, X, Save, Hash, CheckCircle2, Clock, AlertTriangle, ArrowUpDown, Users, Star, TrendingUp, Target , Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Printer, Send } from "lucide-react";
import ExportDropdown from "@/components/export-dropdown";
import { printPage, sendByEmail, generateEmailBody } from "@/lib/print-utils";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { useApiAction } from "@/hooks/use-api-action";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import StatusTransition from "@/components/status-transition";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

interface PerformanceReview { id: number; review_number: string; employee_name: string; department: string; job_title: string; reviewer_name: string; review_period: string; review_date: string; period_start: string; period_end: string; overall_score: number; goals_score: number; skills_score: number; teamwork_score: number; communication_score: number; initiative_score: number; attendance_score: number; strengths: string; improvements: string; goals_next_period: string; training_recommendations: string; salary_recommendation: string; promotion_recommendation: boolean; employee_comments: string; reviewer_comments: string; status: string; approved_by_name: string; notes: string; }

const statusMap: Record<string, { label: string; color: string }> = { draft: { label: "טיוטה", color: "bg-muted/50 text-foreground" }, in_progress: { label: "בתהליך", color: "bg-blue-100 text-blue-700" }, submitted: { label: "הוגש", color: "bg-indigo-100 text-indigo-700" }, approved: { label: "מאושר", color: "bg-green-100 text-green-700" }, disputed: { label: "בערעור", color: "bg-red-100 text-red-700" }, final: { label: "סופי", color: "bg-emerald-100 text-emerald-700" } };
const periodMap: Record<string, string> = { monthly: "חודשי", quarterly: "רבעוני", semi_annual: "חצי שנתי", annual: "שנתי", probation: "ניסיון", special: "מיוחד" };
const scoreLabel = (s: number) => s >= 4.5 ? "מצוין" : s >= 3.5 ? "טוב מאוד" : s >= 2.5 ? "טוב" : s >= 1.5 ? "דרוש שיפור" : "חלש";
const scoreColor = (s: number) => s >= 4 ? "text-emerald-600" : s >= 3 ? "text-blue-600" : s >= 2 ? "text-yellow-600" : "text-red-600";

export default function PerformanceReviewsPage() {
  const [items, setItems] = useState<PerformanceReview[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState(""); const [filterStatus, setFilterStatus] = useState("all"); const [filterPeriod, setFilterPeriod] = useState("all");
  const [sortField, setSortField] = useState("review_date"); const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [showForm, setShowForm] = useState(false); const [editing, setEditing] = useState<PerformanceReview | null>(null); const [form, setForm] = useState<any>({});
  const [expanded, setExpanded] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState("details");
  const bulk = useBulkSelection();
  const formValidation = useFormValidation({
    employeeName: [{ type: "required", message: "שם עובד נדרש" }],
    reviewerName: [{ type: "required", message: "שם מעריך נדרש" }],
    reviewDate: [{ type: "required", message: "תאריך הערכה נדרש" }],
  });
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const [tableLoading, setTableLoading] = useState(true);
  const pagination = useSmartPagination(25);
  const { executeSave, executeDelete, execute, loading: actionLoading } = useApiAction();

  const load = () => {
    setTableLoading(true);
    Promise.all([
      authFetch(`${API}/performance-reviews`, { headers }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(d => setItems(d)),
      authFetch(`${API}/performance-reviews/stats`, { headers }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(d => setStats(d))
    ]).finally(() => setTableLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    let f = items.filter(i => (filterStatus === "all" || i.status === filterStatus) && (filterPeriod === "all" || i.review_period === filterPeriod) && (!search || i.review_number?.toLowerCase().includes(search.toLowerCase()) || i.employee_name?.toLowerCase().includes(search.toLowerCase()) || i.department?.toLowerCase().includes(search.toLowerCase()) || i.reviewer_name?.toLowerCase().includes(search.toLowerCase())));
    f.sort((a: any, b: any) => { const av = a[sortField], bv = b[sortField]; const cmp = typeof av === "number" ? av - bv : String(av||"").localeCompare(String(bv||"")); return sortDir === "asc" ? cmp : -cmp; });
    return f;
  }, [items, search, filterStatus, filterPeriod, sortField, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ reviewPeriod: "annual", status: "draft", reviewDate: new Date().toISOString().slice(0,10) }); setShowForm(true); };
  const openEdit = (r: PerformanceReview) => { setEditing(r); setForm({ employeeName: r.employee_name, department: r.department, jobTitle: r.job_title, reviewerName: r.reviewer_name, reviewPeriod: r.review_period, reviewDate: r.review_date?.slice(0,10), periodStart: r.period_start?.slice(0,10), periodEnd: r.period_end?.slice(0,10), overallScore: r.overall_score, goalsScore: r.goals_score, skillsScore: r.skills_score, teamworkScore: r.teamwork_score, communicationScore: r.communication_score, initiativeScore: r.initiative_score, attendanceScore: r.attendance_score, strengths: r.strengths, improvements: r.improvements, goalsNextPeriod: r.goals_next_period, trainingRecommendations: r.training_recommendations, salaryRecommendation: r.salary_recommendation, promotionRecommendation: r.promotion_recommendation, employeeComments: r.employee_comments, reviewerComments: r.reviewer_comments, status: r.status, notes: r.notes }); setShowForm(true); };
  const save = async () => { const url = editing ? `${API}/performance-reviews/${editing.id}` : `${API}/performance-reviews`; await authFetch(url, { method: editing ? "PUT" : "POST", headers, body: JSON.stringify(form) }); setShowForm(false); load(); };
  const remove = async (id: number) => { await executeDelete(`${API}/performance-reviews/${id}`, "למחוק רשומה?", () => { load(); }); };
  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const avgOverall = Number(stats.avg_overall || 0);
  const kpis = [
    { label: "סה\"כ הערכות", value: fmt(stats.total || 0), icon: Award, color: "text-purple-600" },
    { label: "בתהליך", value: fmt(stats.in_progress || 0), icon: Clock, color: "text-blue-600" },
    { label: "הוגשו", value: fmt(stats.submitted || 0), icon: Hash, color: "text-indigo-600" },
    { label: "מאושרות", value: fmt(stats.approved || 0), icon: CheckCircle2, color: "text-green-600" },
    { label: "ציון ממוצע", value: avgOverall.toFixed(1), icon: Star, color: scoreColor(avgOverall) },
    { label: "עובדים שהוערכו", value: fmt(stats.employees_reviewed || 0), icon: Users, color: "text-cyan-600" },
    { label: "מועמדים לקידום", value: fmt(stats.promotion_candidates || 0), icon: TrendingUp, color: "text-amber-600" },
    { label: "מצוינים", value: fmt(stats.excellent || 0), icon: Target, color: "text-emerald-600" },
  ];

  const scoreDist = [
    { label: "מצוין (4-5)", count: Number(stats.excellent || 0), color: "bg-emerald-500" },
    { label: "טוב (3-4)", count: Number(stats.good || 0), color: "bg-blue-500" },
    { label: "לשיפור (2-3)", count: Number(stats.needs_improvement || 0), color: "bg-yellow-500" },
    { label: "חלש (<2)", count: Number(stats.poor || 0), color: "bg-red-500" },
  ];
  const maxDist = Math.max(...scoreDist.map(s => s.count), 1);

  const scoreFields = [
    { key: "goalsScore", label: "יעדים" }, { key: "skillsScore", label: "מיומנויות" },
    { key: "teamworkScore", label: "עבודת צוות" }, { key: "communicationScore", label: "תקשורת" },
    { key: "initiativeScore", label: "יוזמה" }, { key: "attendanceScore", label: "נוכחות" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><Award className="text-purple-600" /> הערכות ביצועים</h1>
          <p className="text-muted-foreground mt-1">ניהול הערכות עובדים, ציונים, משוב וקידום</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={items} headers={{ review_number: "מספר", employee_name: "עובד", department: "מחלקה", review_period: "תקופה", review_date: "תאריך", overall_score: "ציון כללי", status: "סטטוס" }} filename={"performance_reviews"} />
          <button onClick={() => printPage("הערכות ביצועים")} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm"><Printer size={16} /> הדפסה</button>
          <button onClick={() => sendByEmail("הערכות ביצועים - טכנו-כל עוזי", generateEmailBody("הערכות", items, { review_number: "מספר", employee_name: "עובד", overall_score: "ציון", status: "סטטוס" }))} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm"><Send size={16} /> שליחה</button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-purple-600 text-foreground px-3 py-2 rounded-lg hover:bg-purple-700 shadow-lg text-sm"><Plus size={16} /> הערכה חדשה</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpis.map((kpi, i) => (<motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card rounded-xl shadow-sm border p-3"><kpi.icon className={`${kpi.color} mb-1`} size={20} /><div className="text-lg font-bold">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div></motion.div>))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl shadow-sm border p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Star size={16} className="text-amber-500" /> התפלגות ציונים</h3>
          <div className="space-y-3">
            {scoreDist.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-24">{s.label}</span>
                <div className="flex-1 bg-muted/50 rounded-full h-5 overflow-hidden">
                  <div className={`${s.color} h-full rounded-full flex items-center justify-end pr-2`} style={{ width: `${Math.max((s.count / maxDist) * 100, 5)}%` }}>
                    <span className="text-xs text-foreground font-bold">{s.count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-card rounded-xl shadow-sm border p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><TrendingUp size={16} className="text-blue-600" /> ממוצע לפי קטגוריה</h3>
          <div className="space-y-3">
            {[{ label: "יעדים", val: stats.avg_goals }, { label: "מיומנויות", val: stats.avg_skills }, { label: "עבודת צוות", val: stats.avg_teamwork }, { label: "ציון כללי", val: stats.avg_overall }].map((cat, i) => {
              const v = Number(cat.val || 0);
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-24">{cat.label}</span>
                  <div className="flex-1 bg-muted/50 rounded-full h-5 overflow-hidden">
                    <div className={`h-full rounded-full ${v >= 4 ? "bg-emerald-500" : v >= 3 ? "bg-blue-500" : v >= 2 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${(v / 5) * 100}%` }} />
                  </div>
                  <span className={`text-sm font-bold w-10 text-right ${scoreColor(v)}`}>{v.toFixed(1)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px]"><Search className="absolute right-3 top-2.5 text-muted-foreground" size={18} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש עובד, מחלקה..." className="w-full pr-10 pl-4 py-2 border rounded-lg" /></div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2"><option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)} className="border rounded-lg px-3 py-2"><option value="all">כל התקופות</option>{Object.entries(periodMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>

      <BulkActions selectedIds={bulk.selectedIds} onClear={bulk.clearAll} entityName="הערכות" actions={defaultBulkActions} />

      <div className="bg-card rounded-xl shadow-sm border overflow-x-auto relative">
        {tableLoading && (
          <div className="absolute inset-0 bg-card/60 backdrop-blur-[1px] flex items-center justify-center z-10">
            <div className="flex items-center gap-2 bg-card border rounded-lg px-4 py-2 shadow-lg"><Loader2 className="w-4 h-4 animate-spin text-amber-600" /><span className="text-sm">טוען נתונים...</span></div>
          </div>
        )}
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b"><tr>
            <th className="px-2 py-3 w-10"><BulkCheckbox checked={bulk.isAllSelected(filtered)} indeterminate={bulk.isSomeSelected(filtered)} onChange={() => bulk.toggleAll(filtered)} /></th>
            {[{ key: "review_number", label: "מספר" }, { key: "employee_name", label: "עובד" }, { key: "department", label: "מחלקה" }, { key: "reviewer_name", label: "מעריך" }, { key: "review_period", label: "תקופה" }, { key: "review_date", label: "תאריך" }, { key: "overall_score", label: "ציון" }, { key: "status", label: "סטטוס" }].map(col => (
              <th key={col.key} className="px-3 py-3 text-right cursor-pointer hover:bg-muted/50" onClick={() => toggleSort(col.key)}><div className="flex items-center gap-1">{col.label} <ArrowUpDown size={12} /></div></th>
            ))}
            <th className="px-3 py-3 text-right">פעולות</th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">אין הערכות</td></tr> :
            filtered.map(r => (
              <>
                <tr key={r.id} className="border-b hover:bg-purple-50/30 cursor-pointer" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                  <td className="px-2 py-2" onClick={e => e.stopPropagation()}><BulkCheckbox checked={bulk.isSelected(r.id)} onChange={() => bulk.toggle(r.id)} /></td>
                  <td className="px-3 py-2 font-mono text-purple-600 font-bold">{r.review_number}</td>
                  <td className="px-3 py-2 font-medium">{r.employee_name}</td>
                  <td className="px-3 py-2">{r.department || "-"}</td>
                  <td className="px-3 py-2">{r.reviewer_name || "-"}</td>
                  <td className="px-3 py-2">{periodMap[r.review_period] || r.review_period}</td>
                  <td className="px-3 py-2">{r.review_date?.slice(0, 10)}</td>
                  <td className="px-3 py-2"><span className={`font-bold ${scoreColor(Number(r.overall_score || 0))}`}>{r.overall_score ? `${Number(r.overall_score).toFixed(1)} - ${scoreLabel(Number(r.overall_score))}` : "-"}</span></td>
                  <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${statusMap[r.status]?.color || "bg-muted/50"}`}>{statusMap[r.status]?.label || r.status}</span></td>
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}><div className="flex gap-1"><button onClick={() => openEdit(r)} className="p-1 hover:bg-blue-500/10 rounded"><Edit2 size={14} /></button><button onClick={() => remove(r.id)} className="p-1 hover:bg-red-500/10 rounded text-red-500"><Trash2 size={14} /></button></div></td>
                </tr>
                {expanded === r.id && (
                  <tr key={`exp-${r.id}`}><td colSpan={10} className="bg-purple-50/20 px-4 py-3">
                    <div className="flex border-b border-border/50 mb-3">
                      {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                        <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                      ))}
                    </div>
                    {detailTab === "details" && <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <div><span className="text-muted-foreground">תפקיד:</span> <span className="font-medium">{r.job_title || "-"}</span></div>
                      <div><span className="text-muted-foreground">תקופה:</span> <span className="font-medium">{r.period_start?.slice(0,10)} - {r.period_end?.slice(0,10)}</span></div>
                      <div><span className="text-muted-foreground">קידום:</span> <span className={`font-bold ${r.promotion_recommendation ? "text-green-600" : "text-muted-foreground"}`}>{r.promotion_recommendation ? "מומלץ" : "לא"}</span></div>
                      <div><span className="text-muted-foreground">סטטוס:</span> <StatusTransition currentStatus={r.status} statusMap={{"draft":"טיוטה","in_progress":"בתהליך","submitted":"הוגש","approved":"מאושר","disputed":"בערעור","final":"סופי"}} transitions={{"draft":["in_progress"],"in_progress":["submitted"],"submitted":["approved","disputed"],"disputed":["in_progress"],"approved":["final"]}} onTransition={async (s) => { await authFetch(`${API}/performance-reviews/${r.id}`, { method: "PUT", headers, body: JSON.stringify({status: s}) }); load(); }} /></div>
                      {r.goals_score && <div><span className="text-muted-foreground">יעדים:</span> <span className={`font-bold ${scoreColor(Number(r.goals_score))}`}>{Number(r.goals_score).toFixed(1)}</span></div>}
                      {r.skills_score && <div><span className="text-muted-foreground">מיומנויות:</span> <span className={`font-bold ${scoreColor(Number(r.skills_score))}`}>{Number(r.skills_score).toFixed(1)}</span></div>}
                      {r.teamwork_score && <div><span className="text-muted-foreground">עבודת צוות:</span> <span className={`font-bold ${scoreColor(Number(r.teamwork_score))}`}>{Number(r.teamwork_score).toFixed(1)}</span></div>}
                      {r.strengths && <div className="col-span-full"><span className="text-muted-foreground">חוזקות:</span> <span className="font-medium">{r.strengths}</span></div>}
                      {r.improvements && <div className="col-span-full"><span className="text-muted-foreground">לשיפור:</span> <span className="font-medium">{r.improvements}</span></div>}
                      {r.reviewer_comments && <div className="col-span-full"><span className="text-muted-foreground">הערות מעריך:</span> <span className="font-medium">{r.reviewer_comments}</span></div>}
                    </div>}
                    {detailTab === "related" && <RelatedRecords entityType="performance-reviews" entityId={r.id} relations={[{key:"employees",label:"עובדים",icon:"Users"},{key:"goals",label:"יעדים",icon:"Target"}]} />}
                    {detailTab === "docs" && <AttachmentsSection entityType="performance-reviews" entityId={r.id} />}
                    {detailTab === "history" && <ActivityLog entityType="performance-reviews" entityId={r.id} />}
                  </td></tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
      <SmartPagination pagination={pagination} />
      <div className="text-sm text-muted-foreground">סה"כ: {filtered.length} הערכות</div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">{editing ? "עריכת הערכה" : "הערכה חדשה"}</h2><button onClick={() => setShowForm(false)}><X size={20} /></button></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium mb-1">שם עובד *</label><input value={form.employeeName || ""} onChange={e => setForm({ ...form, employeeName: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מחלקה</label><input value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">תפקיד</label><input value={form.jobTitle || ""} onChange={e => setForm({ ...form, jobTitle: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מעריך</label><input value={form.reviewerName || ""} onChange={e => setForm({ ...form, reviewerName: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">סוג הערכה</label><select value={form.reviewPeriod || "annual"} onChange={e => setForm({ ...form, reviewPeriod: e.target.value })} className="w-full border rounded-lg px-3 py-2">{Object.entries(periodMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">תאריך הערכה *</label><input type="date" value={form.reviewDate || ""} onChange={e => setForm({ ...form, reviewDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">תחילת תקופה</label><input type="date" value={form.periodStart || ""} onChange={e => setForm({ ...form, periodStart: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">סוף תקופה</label><input type="date" value={form.periodEnd || ""} onChange={e => setForm({ ...form, periodEnd: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>

                <div className="col-span-2 border-t pt-3 mt-2">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Star size={14} className="text-amber-500" /> ציונים (1-5)</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div><label className="block text-xs font-medium mb-1">ציון כללי</label><input type="number" step="0.1" min="0" max="5" value={form.overallScore || ""} onChange={e => setForm({ ...form, overallScore: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                    {scoreFields.map(sf => (
                      <div key={sf.key}><label className="block text-xs font-medium mb-1">{sf.label}</label><input type="number" step="0.1" min="0" max="5" value={form[sf.key] || ""} onChange={e => setForm({ ...form, [sf.key]: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                    ))}
                  </div>
                </div>

                <div className="col-span-2"><label className="block text-sm font-medium mb-1">חוזקות</label><textarea value={form.strengths || ""} onChange={e => setForm({ ...form, strengths: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium mb-1">נקודות לשיפור</label><textarea value={form.improvements || ""} onChange={e => setForm({ ...form, improvements: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium mb-1">יעדים לתקופה הבאה</label><textarea value={form.goalsNextPeriod || ""} onChange={e => setForm({ ...form, goalsNextPeriod: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium mb-1">הערות מעריך</label><textarea value={form.reviewerComments || ""} onChange={e => setForm({ ...form, reviewerComments: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2" /></div>

                <div><label className="block text-sm font-medium mb-1">המלצת שכר</label><input value={form.salaryRecommendation || ""} onChange={e => setForm({ ...form, salaryRecommendation: e.target.value })} className="w-full border rounded-lg px-3 py-2" placeholder="אחוז העלאה, סכום..." /></div>
                <div><label className="block text-sm font-medium mb-1">סטטוס</label><select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full border rounded-lg px-3 py-2">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div className="col-span-2 flex items-center gap-4">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={form.promotionRecommendation || false} onChange={e => setForm({ ...form, promotionRecommendation: e.target.checked })} /> המלצה לקידום</label>
                </div>
                <div className="col-span-2"><label className="block text-sm font-medium mb-1">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2" /></div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={save} className="flex items-center gap-2 bg-purple-600 text-foreground px-6 py-2 rounded-lg hover:bg-purple-700"><Save size={16} /> {editing ? "עדכון" : "שמירה"}</button>
                <button onClick={() => setShowForm(false)} className="px-6 py-2 border rounded-lg hover:bg-muted/30">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
