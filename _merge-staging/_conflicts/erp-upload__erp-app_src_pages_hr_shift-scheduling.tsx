import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Search, Plus, Edit2, X, RefreshCw, AlertTriangle, CheckCircle, Clock,
  Calendar, Activity, Loader2, Save, Users, Timer, Coffee, Moon, Sun,
  Sunrise, UserCheck, UserX, BarChart3, FileText
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api/shifts";
const safeArr = (d: any) => (Array.isArray(d) ? d : d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const statusColors: Record<string, { label: string; color: string }> = {
  scheduled: { label: "מתוכנן", color: "bg-gray-500/20 text-gray-400" },
  confirmed: { label: "אושר", color: "bg-blue-500/20 text-blue-400" },
  started: { label: "התחיל", color: "bg-green-500/20 text-green-400" },
  completed: { label: "הושלם", color: "bg-emerald-500/20 text-emerald-400" },
  absent: { label: "נעדר", color: "bg-red-500/20 text-red-400" },
  late: { label: "איחור", color: "bg-orange-500/20 text-orange-400" },
  early_leave: { label: "יצא מוקדם", color: "bg-yellow-500/20 text-yellow-400" },
};

const attStatusColors: Record<string, { label: string; color: string }> = {
  present: { label: "נוכח", color: "bg-green-500/20 text-green-400" },
  late: { label: "איחור", color: "bg-orange-500/20 text-orange-400" },
  absent: { label: "חיסור", color: "bg-red-500/20 text-red-400" },
  holiday: { label: "חג", color: "bg-purple-500/20 text-purple-400" },
  sick: { label: "מחלה", color: "bg-pink-500/20 text-pink-400" },
  vacation: { label: "חופשה", color: "bg-blue-500/20 text-blue-400" },
};

const otStatusColors: Record<string, { label: string; color: string }> = {
  pending: { label: "ממתין", color: "bg-yellow-500/20 text-yellow-400" },
  approved: { label: "אושר", color: "bg-green-500/20 text-green-400" },
  rejected: { label: "נדחה", color: "bg-red-500/20 text-red-400" },
};

const dayNames = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const tabs = [
  { id: "dashboard", label: "לוח בקרה", icon: BarChart3 },
  { id: "schedule", label: "לוח משמרות", icon: Calendar },
  { id: "attendance", label: "נוכחות", icon: UserCheck },
  { id: "overtime", label: "שעות נוספות", icon: Timer },
  { id: "leave", label: "חופשות ומחלה", icon: Coffee },
  { id: "templates", label: "תבניות", icon: FileText },
];

export default function ShiftSchedulingPage() {
  const [tab, setTab] = useState("dashboard");
  const [dashboard, setDashboard] = useState<any>({});
  const [templates, setTemplates] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [daily, setDaily] = useState<any>({});
  const [lateReport, setLateReport] = useState<any[]>([]);
  const [overtime, setOvertime] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [showClockIn, setShowClockIn] = useState(false);
  const [showOTForm, setShowOTForm] = useState(false);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [selDate, setSelDate] = useState(new Date().toISOString().split("T")[0]);
  const [selDept, setSelDept] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const month = today.slice(0, 7);
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const ws = weekStart.toISOString().split("T")[0];

      const [dash, tmpl, sched, dailyR, lateR, otR] = await Promise.all([
        authFetch(`${API}/dashboard`).then(r => r.json()),
        authFetch(`${API}/templates`).then(r => r.json()),
        authFetch(`${API}/schedules?date_from=${ws}&date_to=${today}`).then(r => r.json()),
        authFetch(`${API}/daily-report?date=${today}`).then(r => r.json()),
        authFetch(`${API}/late-report?month=${month}`).then(r => r.json()),
        authFetch(`${API}/overtime?status=pending`).then(r => r.json()),
      ]);
      setDashboard(dash); setTemplates(safeArr(tmpl)); setSchedules(safeArr(sched));
      setDaily(dailyR); setLateReport(safeArr(lateR)); setOvertime(safeArr(otR));
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const saveTemplate = async () => {
    const method = editing?.id ? "PUT" : "POST";
    const url = editing?.id ? `${API}/templates/${editing.id}` : `${API}/templates`;
    await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowForm(false); setEditing(null); setForm({}); load();
  };

  const saveSchedule = async () => {
    await authFetch(`${API}/schedules`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowScheduleForm(false); setForm({}); load();
  };

  const clockIn = async () => {
    await authFetch(`${API}/clock-in`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowClockIn(false); setForm({}); load();
  };

  const clockOut = async (employeeId: number) => {
    await authFetch(`${API}/clock-out`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employee_id: employeeId }) });
    load();
  };

  const submitOT = async () => {
    await authFetch(`${API}/overtime`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowOTForm(false); setForm({}); load();
  };

  const approveOT = async (id: number, status: string) => {
    await authFetch(`${API}/overtime/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, approved_by: "מנהל" }) });
    load();
  };

  const submitLeave = async () => {
    await authFetch(`${API}/request-leave`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowLeaveForm(false); setForm({}); load();
  };

  const d = dashboard;

  return (
    <div dir="rtl" className="p-6 space-y-6 bg-gradient-to-br from-[#0a0a1a] to-[#1a1a3a] min-h-screen text-white">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-l from-amber-400 to-orange-400 bg-clip-text text-transparent">
            משמרות ונוכחות
          </h1>
          <p className="text-gray-400 mt-1">ניהול משמרות, נוכחות, שעות נוספות וחופשות</p>
        </div>
        <Button onClick={load} variant="outline" size="sm" className="border-gray-700">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          <span className="mr-2">רענון</span>
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {tabs.map(t => (
          <Button key={t.id} variant={tab === t.id ? "default" : "outline"} size="sm"
            className={tab === t.id ? "bg-amber-600" : "border-gray-700 text-gray-300"}
            onClick={() => setTab(t.id)}>
            <t.icon className="w-4 h-4 ml-1" /> {t.label}
          </Button>
        ))}
      </div>

      {/* ═══ DASHBOARD ═══ */}
      {tab === "dashboard" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            {[
              { label: "משובצים היום", val: d.today_scheduled, color: "text-white", icon: Calendar },
              { label: "נוכחים", val: d.today_present, color: "text-green-400", icon: UserCheck },
              { label: "איחורים", val: d.today_late, color: "text-orange-400", icon: Clock },
              { label: "נעדרים", val: d.today_absent, color: "text-red-400", icon: UserX },
              { label: "עדיין בפנים", val: d.still_clocked_in, color: "text-blue-400", icon: Activity },
              { label: "ש\"נ ממתינות", val: d.pending_overtime, color: "text-yellow-400", icon: Timer },
              { label: "סה\"כ שעות חודש", val: Number(d.month_total_hours || 0).toFixed(0), color: "text-cyan-400", icon: BarChart3 },
              { label: "ש\"נ חודשי", val: Number(d.month_overtime_hours || 0).toFixed(0), color: "text-purple-400", icon: Sunrise },
            ].map((c, i) => (
              <Card key={i} className="bg-white/5 border-white/10">
                <CardContent className="p-3 text-center">
                  <c.icon className={`w-5 h-5 mx-auto mb-1 ${c.color}`} />
                  <div className={`text-2xl font-bold ${c.color}`}>{c.val ?? 0}</div>
                  <div className="text-xs text-gray-400">{c.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Departments */}
          {safeArr(d.departments).length > 0 && (
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-4">
                <h3 className="font-semibold text-lg mb-3">נוכחות לפי מחלקה</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {safeArr(d.departments).map((dept: any, i: number) => (
                    <div key={i} className="bg-white/5 rounded p-3">
                      <div className="font-semibold">{dept.department || "לא מוגדר"}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="text-sm text-green-400">{dept.present} נוכחים</div>
                        <div className="text-sm text-gray-400">/ {dept.scheduled} משובצים</div>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-2 mt-1">
                        <div className="bg-green-500 rounded-full h-2" style={{ width: `${dept.scheduled > 0 ? (dept.present / dept.scheduled) * 100 : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Late report */}
          {lateReport.length > 0 && (
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-4">
                <h3 className="font-semibold text-lg mb-3 text-orange-400 flex items-center gap-2"><Clock className="w-5 h-5" /> דוח איחורים חודשי</h3>
                <div className="space-y-2">
                  {lateReport.map((r: any, i: number) => (
                    <div key={i} className="flex justify-between items-center bg-white/5 rounded p-2 text-sm">
                      <span>{r.employee_name}</span>
                      <div className="flex gap-4 text-gray-400">
                        <span>{r.late_count} ימים</span>
                        <span>{r.total_late_minutes} דק' סה"כ</span>
                        <span>ממוצע: {r.avg_late_minutes} דק'</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick actions */}
          <div className="flex gap-3 flex-wrap">
            <Button onClick={() => { setForm({}); setShowClockIn(true); }} className="bg-green-600 hover:bg-green-700">
              <UserCheck className="w-4 h-4 ml-1" /> כניסה
            </Button>
            <Button onClick={() => { setForm({}); setShowScheduleForm(true); }} className="bg-blue-600 hover:bg-blue-700">
              <Calendar className="w-4 h-4 ml-1" /> שיבוץ חדש
            </Button>
            <Button onClick={() => { setForm({}); setShowOTForm(true); }} className="bg-yellow-600 hover:bg-yellow-700">
              <Timer className="w-4 h-4 ml-1" /> בקשת ש"נ
            </Button>
            <Button onClick={() => { setForm({}); setShowLeaveForm(true); }} className="bg-purple-600 hover:bg-purple-700">
              <Coffee className="w-4 h-4 ml-1" /> בקשת חופשה
            </Button>
          </div>
        </div>
      )}

      {/* ═══ SCHEDULE ═══ */}
      {tab === "schedule" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold flex items-center gap-2"><Calendar className="w-5 h-5 text-blue-400" /> לוח משמרות</h2>
            <Button onClick={() => { setForm({}); setShowScheduleForm(true); }} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 ml-1" /> שיבוץ חדש
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-right p-2 text-gray-400">עובד</th>
                  <th className="text-right p-2 text-gray-400">מחלקה</th>
                  <th className="text-right p-2 text-gray-400">תאריך</th>
                  <th className="text-right p-2 text-gray-400">משמרת</th>
                  <th className="text-right p-2 text-gray-400">שעות</th>
                  <th className="text-right p-2 text-gray-400">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s: any) => (
                  <tr key={s.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-2">{s.employee_name}</td>
                    <td className="p-2 text-gray-400">{s.department}</td>
                    <td className="p-2">{s.date} <span className="text-gray-500">({dayNames[new Date(s.date).getDay()]})</span></td>
                    <td className="p-2">
                      {s.template_name && (
                        <span className="px-2 py-0.5 rounded text-xs" style={{ backgroundColor: `${s.color}20`, color: s.color }}>{s.template_name}</span>
                      )}
                      {s.start_time && <span className="text-gray-400 mr-2">{s.start_time?.slice(0,5)}-{s.end_time?.slice(0,5)}</span>}
                    </td>
                    <td className="p-2 text-gray-400">{s.start_time?.slice(0,5)} - {s.end_time?.slice(0,5)}</td>
                    <td className="p-2">
                      <Badge className={statusColors[s.status]?.color || "bg-gray-500/20"}>
                        {statusColors[s.status]?.label || s.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {schedules.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-gray-500 py-8">אין שיבוצים לתקופה זו</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ ATTENDANCE ═══ */}
      {tab === "attendance" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold flex items-center gap-2"><UserCheck className="w-5 h-5 text-green-400" /> נוכחות יומית</h2>
            <Button onClick={() => { setForm({}); setShowClockIn(true); }} className="bg-green-600 hover:bg-green-700">
              <UserCheck className="w-4 h-4 ml-1" /> כניסה
            </Button>
          </div>

          {/* Present */}
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4">
              <h3 className="font-semibold mb-3">נוכחים היום ({safeArr(daily.attendance).length})</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-right p-2 text-gray-400">עובד</th>
                      <th className="text-right p-2 text-gray-400">כניסה</th>
                      <th className="text-right p-2 text-gray-400">יציאה</th>
                      <th className="text-right p-2 text-gray-400">שעות</th>
                      <th className="text-right p-2 text-gray-400">ש"נ</th>
                      <th className="text-right p-2 text-gray-400">סטטוס</th>
                      <th className="text-right p-2 text-gray-400">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {safeArr(daily.attendance).map((a: any) => (
                      <tr key={a.id} className="border-b border-white/5">
                        <td className="p-2">{a.employee_name}</td>
                        <td className="p-2 text-green-400">{a.clock_in?.split("T")[1]?.slice(0, 5) || "-"}</td>
                        <td className="p-2 text-red-400">{a.clock_out?.split("T")[1]?.slice(0, 5) || "-"}</td>
                        <td className="p-2">{Number(a.total_hours || 0).toFixed(1)}</td>
                        <td className="p-2 text-yellow-400">{Number(a.overtime_hours || 0).toFixed(1)}</td>
                        <td className="p-2">
                          <Badge className={attStatusColors[a.status]?.color || "bg-gray-500/20"}>
                            {attStatusColors[a.status]?.label || a.status}
                          </Badge>
                          {a.late_minutes > 0 && <span className="text-orange-400 text-xs mr-1">({a.late_minutes} דק')</span>}
                        </td>
                        <td className="p-2">
                          {!a.clock_out && (
                            <Button size="sm" variant="outline" className="border-red-500/30 text-red-400 text-xs" onClick={() => clockOut(a.employee_id)}>
                              יציאה
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Absent */}
          {safeArr(daily.absent).length > 0 && (
            <Card className="bg-red-500/5 border-red-500/20">
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3 text-red-400">נעדרים ({safeArr(daily.absent).length})</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {safeArr(daily.absent).map((a: any, i: number) => (
                    <div key={i} className="bg-white/5 rounded p-2 text-sm">
                      <div className="font-semibold">{a.employee_name}</div>
                      <div className="text-gray-400">{a.department} | {a.shift_name || "-"}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ═══ OVERTIME ═══ */}
      {tab === "overtime" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold flex items-center gap-2"><Timer className="w-5 h-5 text-yellow-400" /> בקשות שעות נוספות</h2>
            <Button onClick={() => { setForm({}); setShowOTForm(true); }} className="bg-yellow-600 hover:bg-yellow-700">
              <Plus className="w-4 h-4 ml-1" /> בקשה חדשה
            </Button>
          </div>
          <div className="grid gap-3">
            {overtime.map((ot: any) => (
              <Card key={ot.id} className="bg-white/5 border-white/10">
                <CardContent className="p-4 flex justify-between items-center">
                  <div>
                    <div className="font-semibold">{ot.employee_name}</div>
                    <div className="text-sm text-gray-400">תאריך: {ot.date} | {ot.hours} שעות | {ot.reason}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={otStatusColors[ot.status]?.color}>{otStatusColors[ot.status]?.label}</Badge>
                    {ot.status === "pending" && (
                      <>
                        <Button size="sm" className="bg-green-600 text-xs" onClick={() => approveOT(ot.id, "approved")}>אישור</Button>
                        <Button size="sm" variant="outline" className="border-red-500/30 text-red-400 text-xs" onClick={() => approveOT(ot.id, "rejected")}>דחייה</Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {overtime.length === 0 && <div className="text-center text-gray-500 py-8">אין בקשות ממתינות</div>}
          </div>
        </div>
      )}

      {/* ═══ LEAVE ═══ */}
      {tab === "leave" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold flex items-center gap-2"><Coffee className="w-5 h-5 text-purple-400" /> חופשות ומחלה</h2>
            <Button onClick={() => { setForm({}); setShowLeaveForm(true); }} className="bg-purple-600 hover:bg-purple-700">
              <Plus className="w-4 h-4 ml-1" /> בקשת חופשה
            </Button>
          </div>
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4">
              <p className="text-gray-400 text-center py-8">הזן מס' עובד בטופס כדי לבדוק יתרות חופשה</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══ TEMPLATES ═══ */}
      {tab === "templates" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold flex items-center gap-2"><FileText className="w-5 h-5 text-blue-400" /> תבניות משמרות</h2>
            <Button onClick={() => { setEditing(null); setForm({}); setShowForm(true); }} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 ml-1" /> תבנית חדשה
            </Button>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {templates.map((t: any) => (
              <Card key={t.id} className="bg-white/5 border-white/10">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                      <span className="font-bold text-lg">{t.name}</span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(t); setForm(t); setShowForm(true); }}>
                      <Edit2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <div className="text-sm text-gray-400 space-y-1">
                    <div>שעות: {t.start_time?.slice(0,5)} - {t.end_time?.slice(0,5)}</div>
                    <div>סה"כ: {t.total_hours} שעות | הפסקה: {t.break_duration_min} דק'</div>
                    {t.department && <div>מחלקה: {t.department}</div>}
                    {t.is_default && <Badge className="bg-green-500/20 text-green-400">ברירת מחדל</Badge>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ═══ MODALS ═══ */}

      {/* Template form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#1a1a3a] border-white/10 w-full max-w-md">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between"><h3 className="text-xl font-bold">{editing?.id ? "עריכת תבנית" : "תבנית חדשה"}</h3><Button size="sm" variant="ghost" onClick={() => setShowForm(false)}><X className="w-4 h-4" /></Button></div>
              <div><Label>שם</Label><Input className="bg-white/5 border-white/10" value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>שעת התחלה</Label><Input type="time" className="bg-white/5 border-white/10" value={form.start_time || ""} onChange={e => setForm({ ...form, start_time: e.target.value })} /></div>
                <div><Label>שעת סיום</Label><Input type="time" className="bg-white/5 border-white/10" value={form.end_time || ""} onChange={e => setForm({ ...form, end_time: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>הפסקה (דק')</Label><Input type="number" className="bg-white/5 border-white/10" value={form.break_duration_min || ""} onChange={e => setForm({ ...form, break_duration_min: e.target.value })} /></div>
                <div><Label>סה"כ שעות</Label><Input type="number" step="0.5" className="bg-white/5 border-white/10" value={form.total_hours || ""} onChange={e => setForm({ ...form, total_hours: e.target.value })} /></div>
              </div>
              <div><Label>צבע</Label><Input type="color" className="bg-white/5 border-white/10 h-10" value={form.color || "#3b82f6"} onChange={e => setForm({ ...form, color: e.target.value })} /></div>
              <Button onClick={saveTemplate} className="w-full bg-blue-600 hover:bg-blue-700"><Save className="w-4 h-4 ml-1" /> שמירה</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Schedule form */}
      {showScheduleForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#1a1a3a] border-white/10 w-full max-w-md">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between"><h3 className="text-xl font-bold">שיבוץ חדש</h3><Button size="sm" variant="ghost" onClick={() => setShowScheduleForm(false)}><X className="w-4 h-4" /></Button></div>
              <div><Label>שם עובד</Label><Input className="bg-white/5 border-white/10" value={form.employee_name || ""} onChange={e => setForm({ ...form, employee_name: e.target.value })} /></div>
              <div><Label>מס' עובד</Label><Input type="number" className="bg-white/5 border-white/10" value={form.employee_id || ""} onChange={e => setForm({ ...form, employee_id: e.target.value })} /></div>
              <div><Label>מחלקה</Label><Input className="bg-white/5 border-white/10" value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} /></div>
              <div><Label>תאריך</Label><Input type="date" className="bg-white/5 border-white/10" value={form.date || ""} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
              <div><Label>תבנית משמרת</Label>
                <select className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" value={form.shift_template_id || ""} onChange={e => {
                  const tmpl = templates.find(t => t.id === Number(e.target.value));
                  setForm({ ...form, shift_template_id: e.target.value, start_time: tmpl?.start_time, end_time: tmpl?.end_time });
                }}>
                  <option value="">בחר תבנית</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.start_time?.slice(0,5)}-{t.end_time?.slice(0,5)})</option>)}
                </select>
              </div>
              <Button onClick={saveSchedule} className="w-full bg-blue-600 hover:bg-blue-700"><Save className="w-4 h-4 ml-1" /> שיבוץ</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Clock-in form */}
      {showClockIn && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#1a1a3a] border-white/10 w-full max-w-md">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between"><h3 className="text-xl font-bold">כניסה למשמרת</h3><Button size="sm" variant="ghost" onClick={() => setShowClockIn(false)}><X className="w-4 h-4" /></Button></div>
              <div><Label>מס' עובד</Label><Input type="number" className="bg-white/5 border-white/10" value={form.employee_id || ""} onChange={e => setForm({ ...form, employee_id: e.target.value })} /></div>
              <div><Label>שם עובד</Label><Input className="bg-white/5 border-white/10" value={form.employee_name || ""} onChange={e => setForm({ ...form, employee_name: e.target.value })} /></div>
              <Button onClick={clockIn} className="w-full bg-green-600 hover:bg-green-700"><UserCheck className="w-4 h-4 ml-1" /> כניסה</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Overtime form */}
      {showOTForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#1a1a3a] border-white/10 w-full max-w-md">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between"><h3 className="text-xl font-bold">בקשת שעות נוספות</h3><Button size="sm" variant="ghost" onClick={() => setShowOTForm(false)}><X className="w-4 h-4" /></Button></div>
              <div><Label>מס' עובד</Label><Input type="number" className="bg-white/5 border-white/10" value={form.employee_id || ""} onChange={e => setForm({ ...form, employee_id: e.target.value })} /></div>
              <div><Label>שם עובד</Label><Input className="bg-white/5 border-white/10" value={form.employee_name || ""} onChange={e => setForm({ ...form, employee_name: e.target.value })} /></div>
              <div><Label>תאריך</Label><Input type="date" className="bg-white/5 border-white/10" value={form.date || ""} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
              <div><Label>שעות</Label><Input type="number" step="0.5" className="bg-white/5 border-white/10" value={form.hours || ""} onChange={e => setForm({ ...form, hours: e.target.value })} /></div>
              <div><Label>סיבה</Label><Input className="bg-white/5 border-white/10" value={form.reason || ""} onChange={e => setForm({ ...form, reason: e.target.value })} /></div>
              <Button onClick={submitOT} className="w-full bg-yellow-600 hover:bg-yellow-700"><Save className="w-4 h-4 ml-1" /> שליחה</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Leave form */}
      {showLeaveForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#1a1a3a] border-white/10 w-full max-w-md">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between"><h3 className="text-xl font-bold">בקשת חופשה</h3><Button size="sm" variant="ghost" onClick={() => setShowLeaveForm(false)}><X className="w-4 h-4" /></Button></div>
              <div><Label>מס' עובד</Label><Input type="number" className="bg-white/5 border-white/10" value={form.employee_id || ""} onChange={e => setForm({ ...form, employee_id: e.target.value })} /></div>
              <div><Label>שם עובד</Label><Input className="bg-white/5 border-white/10" value={form.employee_name || ""} onChange={e => setForm({ ...form, employee_name: e.target.value })} /></div>
              <div><Label>סוג</Label>
                <select className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" value={form.leave_type || "vacation"} onChange={e => setForm({ ...form, leave_type: e.target.value })}>
                  <option value="vacation">חופשה</option>
                  <option value="sick">מחלה</option>
                  <option value="personal">אישי</option>
                </select>
              </div>
              <div><Label>מתאריך</Label><Input type="date" className="bg-white/5 border-white/10" value={form.date || ""} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
              <div><Label>מספר ימים</Label><Input type="number" className="bg-white/5 border-white/10" value={form.days || 1} onChange={e => setForm({ ...form, days: e.target.value })} /></div>
              <Button onClick={submitLeave} className="w-full bg-purple-600 hover:bg-purple-700"><Save className="w-4 h-4 ml-1" /> שליחה</Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
