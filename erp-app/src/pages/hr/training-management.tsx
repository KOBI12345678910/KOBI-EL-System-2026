import { useState, useEffect, useMemo } from "react";
import { GraduationCap, Plus, Edit2, Trash2, X, Search, BookOpen, Users, CheckCircle2, AlertCircle, BarChart2, Star } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmtCur = (v: any) => `₪${Number(v || 0).toLocaleString("he-IL")}`;

const COURSE_STATUS: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-emerald-500/20 text-emerald-400" },
  inactive: { label: "לא פעיל", color: "bg-muted/30 text-muted-foreground" },
  draft: { label: "טיוטה", color: "bg-blue-500/20 text-blue-400" },
};

const ENROLL_STATUS: Record<string, { label: string; color: string }> = {
  enrolled: { label: "רשום", color: "bg-blue-500/20 text-blue-400" },
  completed: { label: "הושלם", color: "bg-emerald-500/20 text-emerald-400" },
  cancelled: { label: "בוטל", color: "bg-red-500/20 text-red-400" },
  waitlist: { label: "רשימת המתנה", color: "bg-yellow-500/20 text-yellow-400" },
};

const CATEGORIES = ["מנהיגות", "טכנולוגיה", "בטיחות", "תפעול", "שירות לקוחות", "מכירות", "כספים", "HR", "אחר"];

function SkillGapRadar({ data }: { data: any[] }) {
  const top = data.slice(0, 8);
  const maxR = 80;
  const cx = 120, cy = 120;
  if (top.length === 0) return <div className="text-center text-muted-foreground py-8 text-sm">אין נתוני פערי מיומנויות</div>;
  const pts = top.map((d, i) => {
    const angle = (2 * Math.PI * i) / top.length - Math.PI / 2;
    const r = (d.match_pct / 100) * maxR;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), label: d.employee_name?.split(" ")[0] || "", pct: d.match_pct };
  });
  const polyPts = pts.map(p => `${p.x},${p.y}`).join(" ");
  return (
    <svg viewBox="0 0 240 240" className="w-full max-w-[200px] mx-auto">
      {[20, 40, 60, 80].map(r => <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke="#333" strokeWidth="0.5" />)}
      <polygon points={polyPts} fill="rgba(99,102,241,0.2)" stroke="#6366f1" strokeWidth="1.5" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3" fill="#6366f1" />
          <text x={cx + (maxR + 15) * Math.cos((2 * Math.PI * i / top.length) - Math.PI / 2)} y={cy + (maxR + 15) * Math.sin((2 * Math.PI * i / top.length) - Math.PI / 2)} textAnchor="middle" dominantBaseline="middle" fontSize="7" fill="#888">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

export default function TrainingManagementPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [activeTab, setActiveTab] = useState<"catalog" | "enrollments" | "skillgap" | "certifications">("catalog");

  // Course catalog state
  const [courses, setCourses] = useState<any[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [editingCourse, setEditingCourse] = useState<any>(null);
  const [courseForm, setCourseForm] = useState<any>({});
  const [searchCourse, setSearchCourse] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");

  // Enrollments state
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loadingEnroll, setLoadingEnroll] = useState(true);
  const [showEnrollForm, setShowEnrollForm] = useState(false);
  const [enrollForm, setEnrollForm] = useState<any>({});
  const [searchEnroll, setSearchEnroll] = useState("");

  // Skill gap state
  const [skillGap, setSkillGap] = useState<any[]>([]);
  const [loadingGap, setLoadingGap] = useState(true);
  const [searchGap, setSearchGap] = useState("");

  // Certification expiry state
  const [certAlerts, setCertAlerts] = useState<any[]>([]);
  const [loadingCerts, setLoadingCerts] = useState(false);

  const loadCourses = async () => {
    setLoadingCourses(true);
    const r = await authFetch(`${API}/course-catalog`);
    if (r.ok) setCourses(safeArray(await r.json()));
    setLoadingCourses(false);
  };

  const loadEnrollments = async () => {
    setLoadingEnroll(true);
    const r = await authFetch(`${API}/course-enrollments`);
    if (r.ok) setEnrollments(safeArray(await r.json()));
    setLoadingEnroll(false);
  };

  const loadSkillGap = async () => {
    setLoadingGap(true);
    const r = await authFetch(`${API}/skill-gap-analysis`);
    if (r.ok) setSkillGap(safeArray(await r.json()));
    setLoadingGap(false);
  };

  const loadCertAlerts = async () => {
    setLoadingCerts(true);
    const r = await authFetch(`${API}/certification-expiry-alerts`);
    if (r.ok) setCertAlerts(safeArray(await r.json()));
    setLoadingCerts(false);
  };

  useEffect(() => { loadCourses(); loadEnrollments(); loadSkillGap(); }, []);
  useEffect(() => { if (activeTab === "certifications") loadCertAlerts(); }, [activeTab]);

  const saveCourse = async () => {
    const url = editingCourse ? `${API}/course-catalog/${editingCourse.id}` : `${API}/course-catalog`;
    await authFetch(url, { method: editingCourse ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(courseForm) });
    setShowCourseForm(false); loadCourses();
  };

  const deleteCourse = async (id: number) => {
    if (await globalConfirm("למחוק קורס זה?")) { await authFetch(`${API}/course-catalog/${id}`, { method: "DELETE" }); loadCourses(); }
  };

  const saveEnrollment = async () => {
    await authFetch(`${API}/course-enrollments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(enrollForm) });
    setShowEnrollForm(false); loadEnrollments();
  };

  const updateEnrollmentStatus = async (id: number, status: string, extra: any = {}) => {
    await authFetch(`${API}/course-enrollments/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, ...extra }) });
    loadEnrollments();
  };

  const filteredCourses = useMemo(() => courses.filter(c =>
    (filterCategory === "all" || c.category === filterCategory) &&
    (!searchCourse || c.title?.toLowerCase().includes(searchCourse.toLowerCase()) || c.instructor?.toLowerCase().includes(searchCourse.toLowerCase()))
  ), [courses, filterCategory, searchCourse]);

  const filteredEnrollments = useMemo(() => enrollments.filter(e =>
    !searchEnroll || e.employee_name?.toLowerCase().includes(searchEnroll.toLowerCase()) || e.course_title?.toLowerCase().includes(searchEnroll.toLowerCase())
  ), [enrollments, searchEnroll]);

  const filteredGap = useMemo(() => skillGap.filter(g =>
    !searchGap || g.employee_name?.toLowerCase().includes(searchGap.toLowerCase()) || g.department?.toLowerCase().includes(searchGap.toLowerCase())
  ), [skillGap, searchGap]);

  const completedCount = enrollments.filter(e => e.status === "completed").length;
  const enrolledCount = enrollments.filter(e => e.status === "enrolled").length;
  const avgGap = skillGap.length > 0 ? skillGap.reduce((a, g) => a + Number(g.match_pct || 0), 0) / skillGap.length : 0;

  const tabs = [
    { key: "catalog", label: "קטלוג קורסים", icon: BookOpen },
    { key: "enrollments", label: "רשומות", icon: Users },
    { key: "skillgap", label: "ניתוח פערי מיומנויות", icon: BarChart2 },
    { key: "certifications", label: "תעודות ותפוגה", icon: AlertCircle },
  ];

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-foreground"><GraduationCap className="text-violet-400" /> ניהול הכשרות</h1>
          <p className="text-muted-foreground mt-1 text-sm">קטלוג קורסים, רשומות, תעודות וניתוח פערי מיומנויות</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "קורסים בקטלוג", value: courses.length, color: "text-violet-400", icon: BookOpen },
          { label: "רשומים", value: enrolledCount, color: "text-blue-400", icon: Users },
          { label: "הושלמו", value: completedCount, color: "text-emerald-400", icon: CheckCircle2 },
          { label: "ממוצע התאמה", value: `${Math.round(avgGap)}%`, color: skillGap.length > 0 ? (avgGap >= 70 ? "text-emerald-400" : avgGap >= 40 ? "text-yellow-400" : "text-red-400") : "text-muted-foreground", icon: BarChart2 },
        ].map((kpi, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4">
            <kpi.icon className={`${kpi.color} mb-2 w-5 h-5`} />
            <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-border/50">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as any)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === t.key ? "border-violet-500 text-violet-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* COURSE CATALOG TAB */}
      {activeTab === "catalog" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <input value={searchCourse} onChange={e => setSearchCourse(e.target.value)} placeholder="חיפוש קורסים..." className="w-full pr-9 pl-4 py-2 bg-card border border-border rounded-xl text-sm" />
            </div>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2 text-sm">
              <option value="all">כל הקטגוריות</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={() => { setEditingCourse(null); setCourseForm({ status: "active", capacity: 20, currency: "ILS" }); setShowCourseForm(true); }}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-foreground px-4 py-2 rounded-xl text-sm">
              <Plus className="w-4 h-4" /> קורס חדש
            </button>
          </div>

          {loadingCourses ? <div className="text-center py-12 text-muted-foreground">טוען...</div> : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredCourses.length === 0 && <div className="col-span-full text-center py-12 text-muted-foreground">אין קורסים. לחץ "קורס חדש" להתחלה.</div>}
              {filteredCourses.map(course => {
                const st = COURSE_STATUS[course.status] || COURSE_STATUS.active;
                const fill = course.capacity > 0 ? Math.min(100, Math.round((Number(course.enrolled_count || 0) / Number(course.capacity)) * 100)) : 0;
                return (
                  <div key={course.id} className="bg-card border border-border rounded-2xl p-4 hover:border-border/80 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                        {course.category && <span className="text-xs text-muted-foreground mr-2">{course.category}</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setEditingCourse(course); setCourseForm({ title: course.title, category: course.category, description: course.description, prerequisites: course.prerequisites, capacity: course.capacity, durationHours: course.duration_hours, instructor: course.instructor, location: course.location, isOnline: course.is_online, costPerPerson: course.cost_per_person, status: course.status }); setShowCourseForm(true); }}
                          className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteCourse(course.id)} className="p-1.5 hover:bg-red-500/10 rounded-lg text-muted-foreground hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    <h3 className="font-bold text-foreground mb-1">{course.title}</h3>
                    {course.instructor && <div className="text-xs text-muted-foreground mb-2">מדריך: {course.instructor}</div>}
                    {course.description && <div className="text-xs text-foreground/60 line-clamp-2 mb-2">{course.description}</div>}
                    <div className="flex gap-3 text-xs text-muted-foreground mb-3">
                      {course.duration_hours > 0 && <span>{Number(course.duration_hours)}ש'</span>}
                      {course.cost_per_person > 0 && <span>{fmtCur(course.cost_per_person)}</span>}
                      {course.is_online && <span className="text-blue-400">מקוון</span>}
                    </div>
                    {/* Capacity bar */}
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{Number(course.enrolled_count || 0)} / {course.capacity} נרשמים</span>
                        <span>{fill}%</span>
                      </div>
                      <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${fill >= 100 ? "bg-red-500" : fill >= 80 ? "bg-yellow-500" : "bg-emerald-500"}`} style={{ width: `${fill}%` }} />
                      </div>
                    </div>
                    {course.capacity > 0 && Number(course.enrolled_count || 0) < Number(course.capacity) && (
                      <button onClick={() => { setEnrollForm({ courseId: course.id, courseTitle: course.title, status: "enrolled" }); setShowEnrollForm(true); }}
                        className="mt-3 w-full py-1.5 bg-violet-600/20 hover:bg-violet-600/30 text-violet-400 text-xs rounded-lg border border-violet-500/30">
                        + הוסף רשמה
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ENROLLMENTS TAB */}
      {activeTab === "enrollments" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <input value={searchEnroll} onChange={e => setSearchEnroll(e.target.value)} placeholder="חיפוש לפי עובד או קורס..." className="w-full pr-9 pl-4 py-2 bg-card border border-border rounded-xl text-sm" />
            </div>
            <button onClick={() => { setEnrollForm({ status: "enrolled" }); setShowEnrollForm(true); }}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-foreground px-4 py-2 rounded-xl text-sm">
              <Plus className="w-4 h-4" /> רשמה חדשה
            </button>
          </div>

          {loadingEnroll ? <div className="text-center py-12 text-muted-foreground">טוען...</div> : (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/10">
                  <tr>
                    {["עובד", "מחלקה", "קורס", "סטטוס", "תאריך רשמה", "תאריך השלמה", "פעולות"].map(h => (
                      <th key={h} className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredEnrollments.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">אין רשמות</td></tr>}
                  {filteredEnrollments.map(e => {
                    const st = ENROLL_STATUS[e.status] || ENROLL_STATUS.enrolled;
                    return (
                      <tr key={e.id} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground">{e.employee_name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{e.department || "—"}</td>
                        <td className="px-4 py-3 text-foreground/80">{e.course_title}</td>
                        <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span></td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{e.enrolled_at?.slice(0,10)}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{e.completion_date || "—"}</td>
                        <td className="px-4 py-3">
                          {e.status === "enrolled" && (
                            <button onClick={() => updateEnrollmentStatus(e.id, "completed", { completionDate: new Date().toISOString().slice(0,10) })}
                              className="text-xs px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30">
                              סמן הושלם
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SKILL GAP TAB */}
      {activeTab === "skillgap" && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <input value={searchGap} onChange={e => setSearchGap(e.target.value)} placeholder="חיפוש לפי עובד או מחלקה..." className="w-full pr-9 pl-4 py-2 bg-card border border-border rounded-xl text-sm" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Radar Chart */}
            <div className="bg-card border border-border rounded-2xl p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-foreground"><BarChart2 className="w-4 h-4 text-violet-400" /> מפת מיומנויות</h3>
              <SkillGapRadar data={filteredGap.slice(0,8)} />
              <div className="text-xs text-center text-muted-foreground mt-2">אחוז התאמה מיומנויות</div>
            </div>

            {/* Table */}
            <div className="lg:col-span-2 bg-card border border-border rounded-2xl overflow-hidden">
              {loadingGap ? <div className="text-center py-12 text-muted-foreground">טוען...</div> : (
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/10">
                    <tr>
                      {["עובד", "מחלקה", "תפקיד", "נדרש", "קיים", "התאמה", "חסרים"].map(h => (
                        <th key={h} className="px-3 py-3 text-right text-xs text-muted-foreground font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGap.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">אין נתונים. הגדר דרישות מיומנויות לתפקידים תחת "דרישות מיומנויות".</td></tr>}
                    {filteredGap.map((g, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                        <td className="px-3 py-2 font-medium text-foreground">{g.employee_name}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{g.department}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{g.position || "—"}</td>
                        <td className="px-3 py-2 text-center text-muted-foreground">{g.required_count}</td>
                        <td className="px-3 py-2 text-center text-muted-foreground">{g.matched_count}</td>
                        <td className="px-3 py-2">
                          <span className={`font-bold text-xs ${g.match_pct >= 80 ? "text-emerald-400" : g.match_pct >= 50 ? "text-yellow-400" : "text-red-400"}`}>{g.match_pct}%</span>
                        </td>
                        <td className="px-3 py-2">
                          {(g.missing_skills || []).slice(0,3).map((s: string, j: number) => (
                            <span key={j} className="inline-block text-xs bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded mr-1 mb-1">{s}</span>
                          ))}
                          {(g.missing_skills || []).length > 3 && <span className="text-xs text-muted-foreground">+{g.missing_skills.length - 3}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CERTIFICATIONS TAB */}
      {activeTab === "certifications" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">תעודות בפג תוקף</h2>
              <p className="text-sm text-muted-foreground">עובדים עם תעודות שפג תוקפן או עומדות לפוג ב-90 יום הקרובים</p>
            </div>
            <button onClick={loadCertAlerts} className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 border border-border rounded-xl">רענן</button>
          </div>
          {loadingCerts ? (
            <div className="text-center text-muted-foreground py-8">טוען נתוני תעודות...</div>
          ) : certAlerts.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-30 text-emerald-400" />
              <div className="text-sm">לא נמצאו תעודות שעומדות לפוג. כל התעודות בתוקף!</div>
            </div>
          ) : (
            <div className="space-y-2">
              {certAlerts.map((cert: any, i: number) => {
                const expDate = cert.expiry_date ? new Date(cert.expiry_date) : null;
                const daysLeft = expDate ? Math.round((expDate.getTime() - Date.now()) / 86400000) : null;
                const isExpired = daysLeft !== null && daysLeft < 0;
                const isUrgent = daysLeft !== null && daysLeft >= 0 && daysLeft < 30;
                return (
                  <div key={i} className={`bg-card border rounded-2xl p-4 ${isExpired ? "border-red-500/30" : isUrgent ? "border-orange-500/30" : "border-border"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-foreground">{cert.employee_name}</span>
                          <span className="text-xs text-muted-foreground">{cert.certification_name || cert.course_title}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          {cert.department && <span>{cert.department}</span>}
                          {expDate && <span>תפוגה: {expDate.toLocaleDateString("he-IL")}</span>}
                        </div>
                        {cert.renewal_recommendation && (
                          <div className="mt-1.5 text-xs text-blue-400">המלצה: {cert.renewal_recommendation}</div>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-center">
                        {isExpired ? (
                          <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded-full">פג תוקף</span>
                        ) : (
                          <div>
                            <div className={`text-xl font-bold ${isUrgent ? "text-orange-400" : "text-yellow-400"}`}>{daysLeft}</div>
                            <div className="text-xs text-muted-foreground">ימים</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* COURSE FORM */}
      <AnimatePresence>
        {showCourseForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowCourseForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editingCourse ? "עריכת קורס" : "קורס חדש"}</h2>
                <button onClick={() => setShowCourseForm(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div><label className="text-xs text-muted-foreground mb-1 block">שם הקורס *</label>
                  <input value={courseForm.title || ""} onChange={e => setCourseForm({ ...courseForm, title: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-muted-foreground mb-1 block">קטגוריה</label>
                    <select value={courseForm.category || ""} onChange={e => setCourseForm({ ...courseForm, category: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm">
                      <option value="">בחר...</option>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">מדריך</label>
                    <input value={courseForm.instructor || ""} onChange={e => setCourseForm({ ...courseForm, instructor: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">קיבולת</label>
                    <input type="number" value={courseForm.capacity || 20} onChange={e => setCourseForm({ ...courseForm, capacity: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">שעות</label>
                    <input type="number" step="0.5" value={courseForm.durationHours || ""} onChange={e => setCourseForm({ ...courseForm, durationHours: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">עלות לאדם (₪)</label>
                    <input type="number" value={courseForm.costPerPerson || 0} onChange={e => setCourseForm({ ...courseForm, costPerPerson: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">סטטוס</label>
                    <select value={courseForm.status || "active"} onChange={e => setCourseForm({ ...courseForm, status: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm">
                      {Object.entries(COURSE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select></div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="isOnline" checked={!!courseForm.isOnline} onChange={e => setCourseForm({ ...courseForm, isOnline: e.target.checked })} />
                  <label htmlFor="isOnline" className="text-sm text-muted-foreground">קורס מקוון</label>
                </div>
                <div><label className="text-xs text-muted-foreground mb-1 block">תיאור</label>
                  <textarea value={courseForm.description || ""} onChange={e => setCourseForm({ ...courseForm, description: e.target.value })} rows={2} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm resize-none" /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">דרישות קדם</label>
                  <input value={courseForm.prerequisites || ""} onChange={e => setCourseForm({ ...courseForm, prerequisites: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowCourseForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
                <button onClick={saveCourse} className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-foreground rounded-xl text-sm">שמור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ENROLLMENT FORM */}
      <AnimatePresence>
        {showEnrollForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowEnrollForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">רשמה חדשה</h2>
                <button onClick={() => setShowEnrollForm(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div><label className="text-xs text-muted-foreground mb-1 block">קורס *</label>
                  <select value={enrollForm.courseId || ""} onChange={e => { const c = courses.find(c => c.id === Number(e.target.value)); setEnrollForm({ ...enrollForm, courseId: Number(e.target.value), courseTitle: c?.title }); }} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm">
                    <option value="">בחר קורס...</option>
                    {courses.filter(c => c.status === "active").map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">שם עובד *</label>
                  <input value={enrollForm.employeeName || ""} onChange={e => setEnrollForm({ ...enrollForm, employeeName: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">מחלקה</label>
                  <input value={enrollForm.department || ""} onChange={e => setEnrollForm({ ...enrollForm, department: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowEnrollForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
                <button onClick={saveEnrollment} className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-foreground rounded-xl text-sm">רשום</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
