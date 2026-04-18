import { useState, useEffect } from "react";
import { User, FileText, Calendar, Clock, Target, GraduationCap, Plus, X, CheckCircle2, Save, CalendarDays, Layers } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmtCur = (v: any) => `₪${Number(v || 0).toLocaleString("he-IL")}`;
const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString("he-IL") : "—";
const fmtDateTime = (d: any) => d ? new Date(d).toLocaleString("he-IL") : "—";

const LEAVE_TYPES: Record<string, string> = {
  vacation: "חופשה שנתית",
  sick: "מחלה",
  personal: "אישי",
  maternity: "לידה",
  bereavement: "אבל",
  military: "מילואים",
  unpaid: "ללא תשלום",
  other: "אחר",
};

const LEAVE_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "ממתין", color: "bg-yellow-500/20 text-yellow-400" },
  approved: { label: "מאושר", color: "bg-emerald-500/20 text-emerald-400" },
  rejected: { label: "נדחה", color: "bg-red-500/20 text-red-400" },
  cancelled: { label: "בוטל", color: "bg-muted/30 text-muted-foreground" },
  in_progress: { label: "בתהליך", color: "bg-blue-500/20 text-blue-400" },
  completed: { label: "הושלם", color: "bg-emerald-500/20 text-emerald-400" },
};

const INTERVIEW_TYPE: Record<string, string> = {
  in_person: "פנים אל פנים",
  phone: "טלפון",
  video: "וידאו",
  technical: "טכני",
  panel: "פאנל",
};

function SectionCard({ title, icon: Icon, color, children }: { title: string; icon: any; color: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border/50 flex items-center gap-2 bg-muted/5">
        <Icon className={`w-5 h-5 ${color}`} />
        <h2 className="font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function EmployeeSelfServicePage() {
  const [activeTab, setActiveTab] = useState<"profile" | "payslips" | "leave" | "goals" | "training" | "schedule" | "shifts">("profile");
  const [myData, setMyData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState<any>({ leaveType: "vacation" });
  const [savingLeave, setSavingLeave] = useState(false);
  const [leaveSuccess, setLeaveSuccess] = useState(false);

  const [myGoals, setMyGoals] = useState<any[]>([]);
  const [loadingGoals, setLoadingGoals] = useState(true);

  const [myEnrollments, setMyEnrollments] = useState<any[]>([]);
  const [loadingTraining, setLoadingTraining] = useState(true);

  const [schedule, setSchedule] = useState<any>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  const [myShifts, setMyShifts] = useState<any[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(false);

  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState<any>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  const loadData = async () => {
    setLoading(true); setError(null);
    try {
      const r = await authFetch(`${API}/self-service/my-data`);
      if (r.ok) {
        const d = await r.json();
        setMyData(d);
        if (d.employee) {
          setProfileForm({ phone: d.employee.phone || "", email: d.employee.email || "", addressCity: d.employee.address_city || "" });
        }
      }
    } catch { setError("שגיאה בטעינת נתונים"); }
    setLoading(false);
  };

  const loadGoals = async () => {
    setLoadingGoals(true);
    const r = await authFetch(`${API}/self-service/my-goals`);
    if (r.ok) setMyGoals(safeArray(await r.json()));
    setLoadingGoals(false);
  };

  const loadTraining = async () => {
    setLoadingTraining(true);
    const r = await authFetch(`${API}/self-service/my-training`);
    if (r.ok) setMyEnrollments(safeArray(await r.json()));
    setLoadingTraining(false);
  };

  const loadSchedule = async () => {
    setLoadingSchedule(true);
    const r = await authFetch(`${API}/self-service/my-schedule`);
    if (r.ok) setSchedule(await r.json());
    setLoadingSchedule(false);
  };

  const loadShifts = async () => {
    setLoadingShifts(true);
    const r = await authFetch(`${API}/self-service/my-shifts`);
    if (r.ok) setMyShifts(safeArray(await r.json()));
    setLoadingShifts(false);
  };

  useEffect(() => { loadData(); loadGoals(); loadTraining(); }, []);
  useEffect(() => { if (activeTab === "schedule" && !schedule) loadSchedule(); }, [activeTab]);
  useEffect(() => { if (activeTab === "shifts") loadShifts(); }, [activeTab]);

  const submitLeaveRequest = async () => {
    setSavingLeave(true);
    try {
      const emp = myData?.employee;
      const payload = {
        ...leaveForm,
        employeeName: emp ? `${emp.first_name || ""} ${emp.last_name || ""}`.trim() : leaveForm.employeeName,
        employeeIdRef: emp?.id || null,
        department: emp?.department,
        totalDays: leaveForm.startDate && leaveForm.endDate
          ? Math.max(1, Math.round((new Date(leaveForm.endDate).getTime() - new Date(leaveForm.startDate).getTime()) / 86400000) + 1)
          : 1,
        status: "pending",
      };
      const r = await authFetch(`${API}/leave-requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (r.ok) { setLeaveSuccess(true); setShowLeaveForm(false); setLeaveForm({ leaveType: "vacation" }); loadData(); setTimeout(() => setLeaveSuccess(false), 3000); }
      else { const e = await r.json().catch(() => ({})); alert("שגיאה בהגשת הבקשה: " + (e.error || e.message || "שגיאה")); }
    } catch (e: any) { alert("שגיאה בהגשת הבקשה: " + (e.message || "שגיאת רשת")); }
    setSavingLeave(false);
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const r = await authFetch(`${API}/self-service/my-data`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileForm),
      });
      if (r.ok) { setProfileSaved(true); setEditingProfile(false); loadData(); setTimeout(() => setProfileSaved(false), 3000); }
      else { const e = await r.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה")); }
    } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
    setSavingProfile(false);
  };

  const emp = myData?.employee;
  const leaveRequests = myData?.leave_requests || [];
  const payslips = myData?.payslips || [];

  const tabs = [
    { key: "profile", label: "הפרופיל שלי", icon: User },
    { key: "payslips", label: "תלושי שכר", icon: FileText },
    { key: "leave", label: "חופשות", icon: Calendar },
    { key: "shifts", label: "משמרות", icon: Layers },
    { key: "goals", label: "היעדים שלי", icon: Target },
    { key: "training", label: "ההכשרות שלי", icon: GraduationCap },
    { key: "schedule", label: "לוח זמנים", icon: CalendarDays },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-64" dir="rtl">
      <div className="text-muted-foreground">טוען נתונים...</div>
    </div>
  );

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-foreground flex-shrink-0">
          {emp ? (emp.first_name?.[0] || "?") : "?"}
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {emp ? `שלום, ${emp.first_name || "עובד"}!` : "הפורטל האישי שלך"}
          </h1>
          <p className="text-muted-foreground text-sm">{emp?.position || ""} {emp?.department ? `• ${emp.department}` : ""}</p>
        </div>
      </div>

      {(leaveSuccess || profileSaved) && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-emerald-400">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">{leaveSuccess ? "בקשת חופשה נשלחה בהצלחה!" : "הפרטים עודכנו בהצלחה!"}</span>
        </motion.div>
      )}

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-border/50 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as any)}
            className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === t.key ? "border-blue-500 text-blue-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* PROFILE TAB */}
      {activeTab === "profile" && (
        <SectionCard title="פרטים אישיים" icon={User} color="text-blue-400">
          {!emp ? (
            <div className="text-muted-foreground text-sm text-center py-4">לא נמצאו פרטי עובד. פנה לצוות HR.</div>
          ) : editingProfile ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: "שם מלא", value: `${emp.first_name || ""} ${emp.last_name || ""}`.trim(), readOnly: true },
                  { label: "תפקיד", value: emp.position, readOnly: true },
                  { label: "מחלקה", value: emp.department, readOnly: true },
                  { label: "תאריך קליטה", value: fmtDate(emp.hire_date), readOnly: true },
                ].map((field, i) => (
                  <div key={i} className="bg-muted/10 rounded-xl p-3">
                    <div className="text-xs text-muted-foreground mb-1">{field.label}</div>
                    <div className="text-sm font-medium text-muted-foreground">{field.value}</div>
                  </div>
                ))}
              </div>
              <div className="border-t border-border/30 pt-4">
                <div className="text-xs text-muted-foreground mb-3">ניתן לעדכן:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">טלפון</label>
                    <input type="tel" value={profileForm.phone} onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm text-foreground" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">אימייל</label>
                    <input type="email" value={profileForm.email} onChange={e => setProfileForm({ ...profileForm, email: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm text-foreground" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">עיר מגורים</label>
                    <input type="text" value={profileForm.addressCity} onChange={e => setProfileForm({ ...profileForm, addressCity: e.target.value })}
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm text-foreground" />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditingProfile(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
                <button onClick={saveProfile} disabled={savingProfile}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-foreground rounded-xl text-sm flex items-center gap-2 disabled:opacity-50">
                  <Save className="w-4 h-4" /> {savingProfile ? "שומר..." : "שמור שינויים"}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                {[
                  { label: "שם מלא", value: `${emp.first_name || ""} ${emp.last_name || ""}`.trim() },
                  { label: "תפקיד", value: emp.position },
                  { label: "מחלקה", value: emp.department },
                  { label: "תאריך קליטה", value: fmtDate(emp.hire_date) },
                  { label: "אימייל", value: emp.email },
                  { label: "טלפון", value: emp.phone },
                  { label: "עיר מגורים", value: emp.address_city },
                ].filter(f => f.value).map((field, i) => (
                  <div key={i} className="bg-muted/10 rounded-xl p-3">
                    <div className="text-xs text-muted-foreground mb-1">{field.label}</div>
                    <div className="text-sm font-medium text-foreground">{field.value}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => setEditingProfile(true)}
                className="w-full flex items-center justify-center gap-2 border border-border text-muted-foreground hover:text-foreground hover:border-blue-500 py-2.5 rounded-xl text-sm transition-colors">
                <User className="w-4 h-4" /> עדכן פרטים אישיים
              </button>
            </div>
          )}
        </SectionCard>
      )}

      {/* PAYSLIPS TAB */}
      {activeTab === "payslips" && (
        <SectionCard title="תלושי שכר" icon={FileText} color="text-emerald-400">
          {payslips.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">אין תלושי שכר זמינים. פנה לצוות HR.</div>
          ) : (
            <div className="space-y-3">
              {payslips.map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 bg-muted/10 rounded-xl">
                  <div>
                    <div className="text-sm font-medium text-foreground">{p.payslip_number || `תלוש #${p.id}`}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(p.pay_date || p.period_end)}</div>
                  </div>
                  <div className="text-right">
                    {p.net_pay > 0 && <div className="text-sm font-bold text-emerald-400">{fmtCur(p.net_pay)}</div>}
                    <div className="text-xs text-muted-foreground">נטו</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* LEAVE TAB */}
      {activeTab === "leave" && (
        <div className="space-y-4">
          <SectionCard title="יתרת חופשות" icon={Calendar} color="text-yellow-400">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { type: "vacation", label: "חופשה שנתית", total: 14, color: "text-blue-400" },
                { type: "sick", label: "מחלה", total: 18, color: "text-red-400" },
                { type: "personal", label: "אישי", total: 3, color: "text-purple-400" },
              ].map(lv => {
                const taken = leaveRequests.filter((r: any) => r.leave_type === lv.type && ["approved", "in_progress", "completed"].includes(r.status)).reduce((a: number, r: any) => a + Number(r.total_days || 0), 0);
                const remaining = Math.max(0, lv.total - taken);
                return (
                  <div key={lv.type} className="bg-muted/10 rounded-xl p-3 text-center">
                    <div className={`text-2xl font-bold ${lv.color}`}>{remaining}</div>
                    <div className="text-xs text-muted-foreground mt-1">{lv.label}</div>
                    <div className="text-xs text-muted-foreground">מתוך {lv.total}</div>
                    <div className="mt-2 h-1 bg-muted/30 rounded-full overflow-hidden">
                      <div className={`h-full ${lv.color.replace("text-", "bg-")} rounded-full`} style={{ width: `${(remaining / lv.total) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <button onClick={() => setShowLeaveForm(true)}
            className="w-full flex items-center justify-center gap-2 bg-yellow-600 hover:bg-yellow-700 text-foreground py-3 rounded-xl font-medium">
            <Plus className="w-5 h-5" /> בקש חופשה
          </button>

          <SectionCard title="היסטוריית חופשות" icon={Clock} color="text-yellow-400">
            {leaveRequests.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-4">אין בקשות חופשה</div>
            ) : (
              <div className="space-y-2">
                {leaveRequests.map((r: any, i: number) => {
                  const st = LEAVE_STATUS[r.status] || LEAVE_STATUS.pending;
                  return (
                    <div key={i} className="flex items-center justify-between p-3 bg-muted/10 rounded-xl">
                      <div>
                        <div className="text-sm font-medium text-foreground">{LEAVE_TYPES[r.leave_type] || r.leave_type}</div>
                        <div className="text-xs text-muted-foreground">{fmtDate(r.start_date)} — {fmtDate(r.end_date)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">{r.total_days} יום</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* GOALS TAB */}
      {activeTab === "goals" && (
        <SectionCard title="היעדים שלי" icon={Target} color="text-purple-400">
          {loadingGoals ? <div className="text-center py-6 text-muted-foreground">טוען...</div> : (
            myGoals.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                אין יעדים אישיים מוגדרים. פנה למנהל שלך.
              </div>
            ) : (
              <div className="space-y-3">
                {myGoals.map((goal: any) => {
                  const krs = goal.key_results || [];
                  const avgPct = krs.length > 0 ? krs.reduce((a: number, k: any) => a + Number(k.progress_pct || 0), 0) / krs.length : Number(goal.progress_pct || 0);
                  return (
                    <div key={goal.id} className="bg-muted/10 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="text-sm font-medium text-foreground">{goal.title}</div>
                          {goal.period && <div className="text-xs text-muted-foreground mt-0.5">{goal.period}</div>}
                        </div>
                        <span className="text-sm font-bold text-blue-400">{Math.round(avgPct)}%</span>
                      </div>
                      <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${avgPct >= 100 ? "bg-emerald-500" : avgPct >= 70 ? "bg-blue-500" : avgPct >= 40 ? "bg-yellow-500" : "bg-red-500"}`}
                          style={{ width: `${Math.min(100, avgPct)}%` }} />
                      </div>
                      {krs.length > 0 && (
                        <div className="mt-3 space-y-1">
                          {krs.map((kr: any) => (
                            <div key={kr.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                              <span className="flex-1">{kr.title}</span>
                              <span>{Number(kr.current_value).toLocaleString()} / {Number(kr.target_value).toLocaleString()} {kr.unit || ""}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </SectionCard>
      )}

      {/* TRAINING TAB */}
      {activeTab === "training" && (
        <SectionCard title="ההכשרות שלי" icon={GraduationCap} color="text-violet-400">
          {loadingTraining ? <div className="text-center py-6 text-muted-foreground">טוען...</div> : (
            myEnrollments.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">אין הכשרות מוגדרות.</div>
            ) : (
              <div className="space-y-3">
                {myEnrollments.map((e: any) => (
                  <div key={e.id} className="flex items-center gap-3 p-3 bg-muted/10 rounded-xl">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${e.status === "completed" ? "bg-emerald-500/20" : e.status === "waitlist" ? "bg-yellow-500/20" : "bg-violet-500/20"}`}>
                      {e.status === "completed" ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <GraduationCap className={`w-5 h-5 ${e.status === "waitlist" ? "text-yellow-400" : "text-violet-400"}`} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{e.course_title}</div>
                      <div className="text-xs text-muted-foreground">
                        {e.status === "completed" ? `הושלם: ${fmtDate(e.completion_date)}` : e.status === "waitlist" ? "רשימת המתנה" : `נרשם: ${e.enrolled_at?.slice(0,10)}`}
                      </div>
                    </div>
                    {e.score != null && <div className="text-sm font-bold text-violet-400">{e.score}</div>}
                  </div>
                ))}
              </div>
            )
          )}
        </SectionCard>
      )}

      {/* SCHEDULE TAB */}
      {activeTab === "schedule" && (
        <div className="space-y-4">
          {loadingSchedule ? (
            <div className="text-center py-12 text-muted-foreground">טוען לוח זמנים...</div>
          ) : !schedule ? (
            <div className="text-center py-12 text-muted-foreground text-sm">לא ניתן לטעון את לוח הזמנים.</div>
          ) : (
            <>
              {/* Interviews as Interviewer */}
              <SectionCard title="ריאיונות שאני מנהל" icon={CalendarDays} color="text-blue-400">
                {(schedule.as_interviewer || []).length === 0 ? (
                  <div className="text-center text-muted-foreground text-sm py-4">אין ריאיונות קרובים</div>
                ) : (
                  <div className="space-y-3">
                    {schedule.as_interviewer.map((iv: any) => (
                      <div key={iv.id} className="p-3 bg-muted/10 rounded-xl">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium text-foreground">{iv.candidate_name || "מועמד"}</div>
                            <div className="text-xs text-muted-foreground">{iv.position} {iv.department ? `• ${iv.department}` : ""}</div>
                          </div>
                          <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full flex-shrink-0">{INTERVIEW_TYPE[iv.interview_type] || iv.interview_type}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{fmtDateTime(iv.scheduled_at)}</span>
                          {iv.duration_minutes && <span>• {iv.duration_minutes} דקות</span>}
                          {iv.location && <span>• {iv.location}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              {/* Interviews as Candidate */}
              <SectionCard title="ריאיונות שלי (כמועמד)" icon={User} color="text-purple-400">
                {(schedule.as_candidate || []).length === 0 ? (
                  <div className="text-center text-muted-foreground text-sm py-4">אין ריאיונות קרובים</div>
                ) : (
                  <div className="space-y-3">
                    {schedule.as_candidate.map((iv: any) => (
                      <div key={iv.id} className="p-3 bg-muted/10 rounded-xl">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium text-foreground">{iv.position}</div>
                            <div className="text-xs text-muted-foreground">מנהל ריאיון: {iv.interviewer_name || "—"}</div>
                          </div>
                          <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full flex-shrink-0">{INTERVIEW_TYPE[iv.interview_type] || iv.interview_type}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{fmtDateTime(iv.scheduled_at)}</span>
                          {iv.location && <span>• {iv.location}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              {/* Upcoming Leaves */}
              <SectionCard title="חופשות קרובות" icon={Calendar} color="text-yellow-400">
                {(schedule.upcoming_leaves || []).length === 0 ? (
                  <div className="text-center text-muted-foreground text-sm py-4">אין חופשות מאושרות קרובות</div>
                ) : (
                  <div className="space-y-2">
                    {schedule.upcoming_leaves.map((lv: any, i: number) => {
                      const st = LEAVE_STATUS[lv.status] || LEAVE_STATUS.pending;
                      return (
                        <div key={i} className="flex items-center justify-between p-3 bg-muted/10 rounded-xl">
                          <div>
                            <div className="text-sm font-medium text-foreground">{LEAVE_TYPES[lv.leave_type] || lv.leave_type}</div>
                            <div className="text-xs text-muted-foreground">{fmtDate(lv.start_date)} — {fmtDate(lv.end_date)}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">{lv.total_days} יום</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>
            </>
          )}
        </div>
      )}

      {/* SHIFTS TAB */}
      {activeTab === "shifts" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">המשמרות שלי</h2>
            <span className="text-sm text-muted-foreground">{myShifts.length} משמרות</span>
          </div>
          {loadingShifts ? (
            <div className="text-center text-muted-foreground py-8">טוען משמרות...</div>
          ) : myShifts.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground">
              <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <div className="text-sm">לא נמצאו משמרות עתידיות מוקצות</div>
            </div>
          ) : (
            <div className="space-y-2">
              {myShifts.map((shift: any, i: number) => {
                const start = shift.start_time ? new Date(shift.start_time) : null;
                const end = shift.end_time ? new Date(shift.end_time) : null;
                const isToday = start && start.toDateString() === new Date().toDateString();
                return (
                  <div key={i} className={`bg-card border rounded-2xl p-4 ${isToday ? "border-blue-500/50 bg-blue-500/5" : "border-border"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <div className="text-sm font-semibold text-foreground">
                            {start ? start.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" }) : "—"}
                          </div>
                          {isToday && <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">היום</span>}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            {start ? start.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "?"}
                            {" — "}
                            {end ? end.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "?"}
                          </span>
                          {shift.duration_hours > 0 && <span>({shift.duration_hours} שעות)</span>}
                        </div>
                        {shift.position && <div className="text-xs text-muted-foreground mt-1">{shift.position}</div>}
                        {shift.department && <div className="text-xs text-muted-foreground">{shift.department}</div>}
                        {shift.notes && <div className="text-xs text-muted-foreground mt-1 bg-muted/10 rounded px-2 py-1">{shift.notes}</div>}
                      </div>
                      <div className="flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${shift.status === "confirmed" ? "bg-emerald-500/20 text-emerald-400" : shift.status === "pending" ? "bg-yellow-500/20 text-yellow-400" : "bg-muted/30 text-muted-foreground"}`}>
                          {shift.status === "confirmed" ? "מאושר" : shift.status === "pending" ? "ממתין" : shift.status || "מתוכנן"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* LEAVE REQUEST FORM */}
      <AnimatePresence>
        {showLeaveForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowLeaveForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">בקשת חופשה</h2>
                <button onClick={() => setShowLeaveForm(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div><label className="text-xs text-muted-foreground mb-1 block">סוג חופשה</label>
                  <select value={leaveForm.leaveType || "vacation"} onChange={e => setLeaveForm({ ...leaveForm, leaveType: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm">
                    {Object.entries(LEAVE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-muted-foreground mb-1 block">מתאריך</label>
                    <input type="date" value={leaveForm.startDate || ""} onChange={e => setLeaveForm({ ...leaveForm, startDate: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">עד תאריך</label>
                    <input type="date" value={leaveForm.endDate || ""} onChange={e => setLeaveForm({ ...leaveForm, endDate: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                </div>
                {leaveForm.startDate && leaveForm.endDate && (
                  <div className="text-sm text-blue-400 font-medium">
                    סה"כ: {Math.max(1, Math.round((new Date(leaveForm.endDate).getTime() - new Date(leaveForm.startDate).getTime()) / 86400000) + 1)} ימים
                  </div>
                )}
                <div><label className="text-xs text-muted-foreground mb-1 block">סיבה</label>
                  <textarea value={leaveForm.reason || ""} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} rows={2} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm resize-none" /></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowLeaveForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
                <button onClick={submitLeaveRequest} disabled={savingLeave || !leaveForm.startDate || !leaveForm.endDate}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-foreground rounded-xl text-sm disabled:opacity-50">
                  {savingLeave ? "שולח..." : "שלח בקשה"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
