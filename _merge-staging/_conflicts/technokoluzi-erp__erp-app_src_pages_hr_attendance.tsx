import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Clock, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2, AlertTriangle, ArrowUpDown, UserCheck, UserX, Timer, Sun, Moon, Sunset, Coffee, LogIn, LogOut, LayoutList, Calendar, ChevronLeft, ChevronRight, BarChart2, TrendingUp, Download, Printer, Send, List, Maximize2, Minimize2, Users, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { globalConfirm } from "@/components/confirm-dialog";
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
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || d?.rows || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

interface AttendanceRecord { id: number; record_number: string; employee_name: string; employee_id_ref: number; attendance_date: string; check_in: string; check_out: string; total_hours: number; overtime_hours: number; break_minutes: number; status: string; shift_type: string; location: string; department: string; late_minutes: number; early_leave_minutes: number; approved_by: string; approval_status: string; notes: string; }

const statusMap: Record<string, { label: string; color: string; dot: string }> = {
  present: { label: "נוכח", color: "bg-green-100 text-green-700", dot: "bg-green-500" },
  absent: { label: "נעדר", color: "bg-red-100 text-red-700", dot: "bg-red-500" },
  late: { label: "איחור", color: "bg-yellow-100 text-yellow-700", dot: "bg-yellow-500" },
  half_day: { label: "חצי יום", color: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  sick: { label: "מחלה", color: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
  vacation: { label: "חופשה", color: "bg-blue-100 text-blue-700", dot: "bg-blue-400" },
  holiday: { label: "חג", color: "bg-cyan-100 text-cyan-700", dot: "bg-cyan-500" },
  remote: { label: "מרחוק", color: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-500" },
};
const shiftMap: Record<string, { label: string }> = {
  morning: { label: "בוקר" },
  afternoon: { label: "צהריים" },
  evening: { label: "ערב" },
  night: { label: "לילה" },
  full_day: { label: "יום מלא" },
};
const approvalMap: Record<string, { label: string; color: string }> = {
  pending: { label: "ממתין", color: "bg-yellow-100 text-yellow-700" },
  approved: { label: "מאושר", color: "bg-green-100 text-green-700" },
  rejected: { label: "נדחה", color: "bg-red-100 text-red-700" },
};

const HEBREW_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const HEBREW_DAYS = ["א","ב","ג","ד","ה","ו","ש"];

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function AttendanceDetailTabs({ record, detailTab, setDetailTab }: { record: any; detailTab: string; setDetailTab: (t: string) => void }) {
  return (
    <>
      <div className="flex border-b border-border/50">
        {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
          <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-white"}`}>{t.label}</button>
        ))}
      </div>
      {detailTab === "related" && <div className="p-4"><RelatedRecords entityType="attendance" entityId={record.id} relations={[{key:"employees",label:"עובדים",icon:"Users"},{key:"shifts",label:"משמרות",icon:"Clock"}]} /></div>}
      {detailTab === "docs" && <div className="p-4"><AttachmentsSection entityType="attendance" entityId={record.id} /></div>}
      {detailTab === "history" && <div className="p-4"><ActivityLog entityType="attendance" entityId={record.id} /></div>}
    </>
  );
}

function pad2(n: number) { return String(n).padStart(2, "0"); }
function formatTime(date: Date) { return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`; }
function formatElapsed(fromStr: string) {
  if (!fromStr) return "00:00:00";
  const [h, m] = fromStr.split(":").map(Number);
  const start = new Date();
  start.setHours(h, m, 0, 0);
  const now = new Date();
  const diff = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
  const hh = Math.floor(diff / 3600);
  const mm = Math.floor((diff % 3600) / 60);
  const ss = diff % 60;
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}

// ─── Check-in Widget ────────────────────────────────────────────
function CheckInWidget({ employeeName, onStatusChange }: { employeeName: string; onStatusChange?: () => void }) {
  const now = useNow();
  const [status, setStatus] = useState<{ checkedIn: boolean; checkInTime?: string; record?: any } | null>(null);
  const [loading, setLoading] = useState(false);
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const loadStatus = useCallback(async () => {
    try {
      const r = await authFetch(`${API}/attendance/current-status`, { headers });
      const d = await r.json();
      setStatus(d);
    } catch { setStatus({ checkedIn: false }); }
  }, [token]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const clockIn = async () => {
    setLoading(true);
    try {
      const r = await authFetch(`${API}/attendance/clock-in`, { method: "POST", headers, body: JSON.stringify({ kiosk: false }) });
      const d = await r.json();
      if (d.success) { loadStatus(); onStatusChange?.(); }
      else alert(d.error || "שגיאה בכניסה");
    } finally { setLoading(false); }
  };

  const clockOut = async () => {
    setLoading(true);
    try {
      const r = await authFetch(`${API}/attendance/clock-out`, { method: "POST", headers, body: JSON.stringify({ kiosk: false }) });
      const d = await r.json();
      if (d.success) { loadStatus(); onStatusChange?.(); }
      else alert(d.error || "שגיאה ביציאה");
    } finally { setLoading(false); }
  };

  return (
    <div className={`rounded-2xl border shadow-sm p-6 text-center transition-colors ${status?.checkedIn ? "bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200" : "bg-gradient-to-br from-green-50 to-emerald-50 border-green-200"}`}>
      <div className="text-4xl font-bold font-mono tracking-widest text-foreground mb-1">{formatTime(now)}</div>
      <div className="text-sm text-muted-foreground mb-4">{now.toLocaleDateString("he-IL", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
      {status?.checkedIn ? (
        <>
          <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-700 px-3 py-1.5 rounded-full text-sm font-medium mb-3">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            מחויב כניסה מאז {status.checkInTime?.slice(0,5)}
          </div>
          <div className="text-2xl font-mono font-bold text-amber-600 mb-4">{formatElapsed(status.checkInTime || "")}</div>
          <button onClick={clockOut} disabled={loading} className="flex items-center gap-2 mx-auto bg-amber-500 hover:bg-amber-600 text-white font-bold px-8 py-3 rounded-xl shadow-lg transition-all text-lg disabled:opacity-50">
            <LogOut size={20} /> יציאה
          </button>
        </>
      ) : (
        <>
          <div className="inline-flex items-center gap-2 bg-muted/50 text-muted-foreground px-3 py-1.5 rounded-full text-sm font-medium mb-4">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            לא מחויב כניסה
          </div>
          {employeeName && <p className="text-muted-foreground font-medium mb-4">{employeeName}</p>}
          <button onClick={clockIn} disabled={loading} className="flex items-center gap-2 mx-auto bg-green-500 hover:bg-green-600 text-white font-bold px-8 py-3 rounded-xl shadow-lg transition-all text-lg disabled:opacity-50">
            <LogIn size={20} /> כניסה
          </button>
        </>
      )}
    </div>
  );
}

// ─── Monthly Calendar Strip ──────────────────────────────────────
function CalendarStrip({ year, month, records, onDayClick, selectedDay }: {
  year: number; month: number; records: AttendanceRecord[]; onDayClick: (d: number) => void; selectedDay: number | null;
}) {
  const today = new Date();
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const recordsByDay = useMemo(() => {
    const map: Record<number, { status: string; present: boolean }> = {};
    records.forEach(r => {
      const d = new Date(r.attendance_date);
      if (d.getFullYear() === year && d.getMonth() + 1 === month) {
        const day = d.getDate();
        map[day] = { status: r.status, present: r.status === "present" || r.status === "late" || r.status === "remote" };
      }
    });
    return map;
  }, [records, year, month]);

  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (stripRef.current) {
      const todayEl = stripRef.current.querySelector('[data-today="true"]');
      todayEl?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [year, month]);

  return (
    <div className="bg-card rounded-2xl border shadow-sm p-4">
      <div className="overflow-x-auto" ref={stripRef}>
        <div className="flex gap-1.5 min-w-max pb-1">
          {days.map(d => {
            const date = new Date(year, month - 1, d);
            const dow = date.getDay();
            const isWeekend = dow === 5 || dow === 6;
            const isToday = today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === d;
            const rec = recordsByDay[d];
            const isFuture = new Date(year, month - 1, d) > today;
            return (
              <button
                key={d}
                data-today={isToday}
                onClick={() => onDayClick(d)}
                className={`flex flex-col items-center w-10 py-2 px-1 rounded-xl transition-all cursor-pointer select-none
                  ${isToday ? "ring-2 ring-amber-500 bg-amber-50" : ""}
                  ${selectedDay === d ? "bg-amber-100" : "hover:bg-muted/30"}
                  ${isWeekend ? "opacity-50" : ""}
                `}
              >
                <span className="text-[10px] text-muted-foreground mb-1">{HEBREW_DAYS[dow]}</span>
                <span className={`text-sm font-bold ${isToday ? "text-amber-600" : "text-foreground"}`}>{d}</span>
                <span className={`w-2 h-2 rounded-full mt-1.5 ${
                  isFuture ? "bg-muted/50" :
                  isWeekend ? "bg-muted" :
                  rec ? (rec.present ? "bg-green-500" : "bg-red-400") : "bg-muted"
                }`} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Calendar Month View ─────────────────────────────────────────
function CalendarView({ year, month, records }: { year: number; month: number; records: AttendanceRecord[] }) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();
  const recordsByDay = useMemo(() => {
    const map: Record<number, AttendanceRecord[]> = {};
    records.forEach(r => {
      const d = new Date(r.attendance_date);
      if (d.getFullYear() === year && d.getMonth() + 1 === month) {
        const day = d.getDate();
        if (!map[day]) map[day] = [];
        map[day].push(r);
      }
    });
    return map;
  }, [records, year, month]);

  const today = new Date();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
      <div className="grid grid-cols-7 border-b">
        {["א","ב","ג","ד","ה","ו","ש"].map(d => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} className="border-b border-l min-h-[70px]" />;
          const isToday = today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === d;
          const recs = recordsByDay[d] || [];
          const dow = new Date(year, month - 1, d).getDay();
          const isWeekend = dow === 5 || dow === 6;
          return (
            <div key={d} className={`border-b border-l min-h-[70px] p-1 text-sm ${isWeekend ? "bg-muted/30" : ""}`}>
              <div className={`w-6 h-6 flex items-center justify-center rounded-full mb-1 text-xs font-bold ${isToday ? "bg-amber-500 text-white" : "text-muted-foreground"}`}>{d}</div>
              {recs.slice(0, 2).map(r => (
                <div key={r.id} className={`text-[10px] px-1 rounded mb-0.5 truncate ${statusMap[r.status]?.color || "bg-muted/50"}`}>
                  {r.employee_name?.split(" ")[0]} {r.check_in?.slice(0,5)}
                </div>
              ))}
              {recs.length > 2 && <div className="text-[10px] text-muted-foreground">+{recs.length - 2}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Kiosk Mode ──────────────────────────────────────────────────
function KioskMode({ onClose, employees }: { onClose: () => void; employees: string[] }) {
  const now = useNow();
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<{ checkedIn: boolean; checkInTime?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const filteredEmps = useMemo(() => {
    return employees.filter(e => !search || e.toLowerCase().includes(search.toLowerCase())).slice(0, 8);
  }, [employees, search]);

  const loadStatus = async (name: string) => {
    if (!name) return;
    try {
      const r = await authFetch(`${API}/attendance/current-status?kiosk=1&employee=${encodeURIComponent(name)}`, { headers });
      setStatus(await r.json());
    } catch { setStatus(null); }
  };

  const selectEmployee = (name: string) => {
    setSelectedEmployee(name);
    setSearch("");
    loadStatus(name);
  };

  const doAction = async () => {
    if (!selectedEmployee) return;
    setLoading(true);
    setMessage(null);
    try {
      const url = status?.checkedIn ? `${API}/attendance/clock-out` : `${API}/attendance/clock-in`;
      const r = await authFetch(url, { method: "POST", headers, body: JSON.stringify({ employeeName: selectedEmployee, kiosk: true }) });
      const d = await r.json();
      if (d.success) {
        setMessage({ type: "success", text: status?.checkedIn ? `יציאה נרשמה ב-${d.checkOutTime}` : `כניסה נרשמה ב-${d.checkInTime}` });
        await loadStatus(selectedEmployee);
        setTimeout(() => { setSelectedEmployee(""); setStatus(null); setMessage(null); }, 3000);
      } else {
        setMessage({ type: "error", text: d.error || "שגיאה" });
      }
    } finally { setLoading(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-slate-900 flex flex-col items-center justify-center" dir="rtl"
    >
      <button onClick={onClose} className="absolute top-6 left-6 text-muted-foreground hover:text-white p-2 rounded-lg hover:bg-slate-800">
        <Minimize2 size={24} />
      </button>
      <div className="text-6xl font-bold font-mono text-white mb-2">{formatTime(now)}</div>
      <div className="text-muted-foreground text-lg mb-10">{now.toLocaleDateString("he-IL", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>

      <div className="w-full max-w-md">
        <AnimatePresence>
          {message && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={`text-center py-4 rounded-xl text-lg font-bold mb-6 ${message.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
              {message.text}
            </motion.div>
          )}
        </AnimatePresence>

        {!selectedEmployee ? (
          <div className="bg-slate-800 rounded-2xl p-6">
            <h2 className="text-white text-xl font-bold text-center mb-4">בחר עובד</h2>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש עובד..."
              className="w-full bg-slate-700 text-white placeholder-slate-400 border border-slate-600 rounded-xl px-4 py-3 mb-4 text-lg"
            />
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filteredEmps.map(emp => (
                <button key={emp} onClick={() => selectEmployee(emp)}
                  className="w-full text-right bg-slate-700 hover:bg-amber-600 text-white px-4 py-3 rounded-xl transition-colors font-medium">
                  {emp}
                </button>
              ))}
              {filteredEmps.length === 0 && <p className="text-muted-foreground text-center py-4">לא נמצאו עובדים</p>}
            </div>
          </div>
        ) : (
          <div className="bg-slate-800 rounded-2xl p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-amber-500 flex items-center justify-center mx-auto mb-4">
              <span className="text-xl sm:text-3xl font-bold text-white">{selectedEmployee[0]}</span>
            </div>
            <h2 className="text-white text-lg sm:text-2xl font-bold mb-1">{selectedEmployee}</h2>
            {status?.checkedIn && (
              <p className="text-amber-400 mb-6">מחויב כניסה מאז {status.checkInTime?.slice(0,5)}</p>
            )}
            {!status?.checkedIn && <p className="text-muted-foreground mb-6">לא מחויב כניסה</p>}
            <button onClick={doAction} disabled={loading}
              className={`w-full py-4 rounded-xl text-white text-xl font-bold transition-all shadow-lg mb-3 disabled:opacity-50 ${status?.checkedIn ? "bg-amber-500 hover:bg-amber-600" : "bg-green-500 hover:bg-green-600"}`}>
              {loading ? "..." : status?.checkedIn ? "⬛ יציאה" : "✅ כניסה"}
            </button>
            <button onClick={() => { setSelectedEmployee(""); setStatus(null); }} className="text-muted-foreground hover:text-white text-sm">בחר עובד אחר</button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Reports Panel ───────────────────────────────────────────────
function ReportsPanel({ items }: { items: AttendanceRecord[] }) {
  const byEmployee = useMemo(() => {
    const map: Record<string, { name: string; total: number; present: number; absent: number; late: number; hours: number; overtime: number }> = {};
    items.forEach(r => {
      if (!map[r.employee_name]) map[r.employee_name] = { name: r.employee_name, total: 0, present: 0, absent: 0, late: 0, hours: 0, overtime: 0 };
      map[r.employee_name].total++;
      if (r.status === "present" || r.status === "remote") map[r.employee_name].present++;
      if (r.status === "absent") map[r.employee_name].absent++;
      if (r.status === "late") map[r.employee_name].late++;
      map[r.employee_name].hours += Number(r.total_hours || 0);
      map[r.employee_name].overtime += Number(r.overtime_hours || 0);
    });
    return Object.values(map).sort((a, b) => b.hours - a.hours).slice(0, 10);
  }, [items]);

  const byDept = useMemo(() => {
    const map: Record<string, { name: string; count: number; hours: number; present: number }> = {};
    items.forEach(r => {
      const d = r.department || "לא מוגדר";
      if (!map[d]) map[d] = { name: d, count: 0, hours: 0, present: 0 };
      map[d].count++;
      map[d].hours += Number(r.total_hours || 0);
      if (r.status === "present" || r.status === "remote" || r.status === "late") map[d].present++;
    });
    return Object.values(map).sort((a, b) => b.hours - a.hours).slice(0, 6);
  }, [items]);

  const stats = useMemo(() => ({
    totalHours: items.reduce((s, r) => s + Number(r.total_hours || 0), 0),
    totalOvertime: items.reduce((s, r) => s + Number(r.overtime_hours || 0), 0),
    totalLate: items.reduce((s, r) => s + Number(r.late_minutes || 0), 0),
    presentRate: items.length ? Math.round(items.filter(r => r.status === "present" || r.status === "late" || r.status === "remote").length / items.length * 100) : 0,
  }), [items]);

  const reportCards = [
    { label: "סיכום שעות חודשי", desc: "שעות עבודה לפי עובד ומחלקה", icon: Timer, color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
    { label: "דוח איחורים", desc: "ניתוח ממוצע ואחוז האיחורים", icon: AlertTriangle, color: "text-red-500", bg: "bg-red-50 border-red-200" },
    { label: "שעות נוספות", desc: "ריכוז שעות נוספות לפי עובד", icon: TrendingUp, color: "text-orange-600", bg: "bg-orange-50 border-orange-200" },
    { label: "סיכום לפי מחלקה", desc: "נוכחות ועמידה ביעדים", icon: Users, color: "text-purple-600", bg: "bg-purple-50 border-purple-200" },
  ];

  return (
    <div className="bg-card rounded-2xl border shadow-sm p-6 space-y-6">
      <h2 className="text-lg font-bold flex items-center gap-2"><BarChart2 className="text-amber-500" size={20} /> דוחות ונתונים</h2>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "סה\"כ שעות", value: stats.totalHours.toFixed(1), icon: Timer, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "שעות נוספות", value: stats.totalOvertime.toFixed(1), icon: TrendingUp, color: "text-orange-600", bg: "bg-orange-50" },
          { label: "דק' איחור", value: fmt(stats.totalLate), icon: AlertTriangle, color: "text-red-500", bg: "bg-red-50" },
          { label: "אחוז נוכחות", value: `${stats.presentRate}%`, icon: UserCheck, color: "text-green-600", bg: "bg-green-50" },
        ].map((s, i) => (
          <div key={i} className={`rounded-xl p-4 ${s.bg}`}>
            <s.icon className={s.color} size={18} />
            <div className="text-xl font-bold mt-1">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Report access cards */}
      <div>
        <h3 className="font-semibold text-foreground mb-3 text-sm">גישה לדוחות</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {reportCards.map((r, i) => (
            <div key={i} className={`rounded-xl p-4 border cursor-pointer hover:shadow-md transition-shadow ${r.bg}`}>
              <r.icon className={r.color} size={20} />
              <div className="font-semibold text-foreground text-sm mt-2">{r.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{r.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Hours by employee chart */}
      {byEmployee.length > 0 && (
        <div>
          <h3 className="font-semibold text-foreground mb-3 text-sm">שעות לפי עובד</h3>
          <div className="space-y-2">
            {byEmployee.map(emp => (
              <div key={emp.name} className="flex items-center gap-3">
                <div className="w-28 text-sm text-muted-foreground truncate text-right">{emp.name}</div>
                <div className="flex-1 bg-muted/50 rounded-full h-2 overflow-hidden">
                  <div className="bg-amber-500 h-full rounded-full transition-all" style={{ width: `${Math.min(100, (emp.hours / Math.max(...byEmployee.map(e => e.hours), 1)) * 100)}%` }} />
                </div>
                <div className="w-14 text-sm font-mono text-right text-foreground">{emp.hours.toFixed(1)}h</div>
                {emp.late > 0 && <div className="text-xs text-red-500 whitespace-nowrap">{emp.late} איחורים</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By department summary */}
      {byDept.length > 0 && (
        <div>
          <h3 className="font-semibold text-foreground mb-3 text-sm">סיכום לפי מחלקה</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {byDept.map(d => (
              <div key={d.name} className="bg-muted/30 border rounded-xl p-3">
                <div className="font-medium text-foreground text-sm truncate">{d.name}</div>
                <div className="text-xs text-muted-foreground mt-1">{d.count} רשומות · {d.hours.toFixed(1)}h</div>
                <div className="text-xs text-green-600 mt-0.5">{d.count ? Math.round(d.present / d.count * 100) : 0}% נוכחות</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────
export default function AttendancePage() {
  const [items, setItems] = useState<AttendanceRecord[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterShift, setFilterShift] = useState("all");
  const [filterEmployee, setFilterEmployee] = useState("all");
  const [filterDept, setFilterDept] = useState("all");
  const [sortField, setSortField] = useState("attendance_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);
  const [form, setForm] = useState<any>({});
  const [view, setView] = useState<"list" | "calendar">("list");
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth() + 1);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [kioskMode, setKioskMode] = useState(false);
  const [employeeName, setEmployeeName] = useState(() => localStorage.getItem("attendance_employee") || "");
  const [employees, setEmployees] = useState<string[]>([]);
  const bulk = useBulkSelection();
  const [showKpis, setShowKpis] = useState(true);
  const [tableLoading, setTableLoading] = useState(true);
  const pagination = useSmartPagination(25);
  const { executeSave, executeDelete, execute, loading: actionLoading } = useApiAction();

  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = () => {
    setTableLoading(true);
    Promise.all([
      authFetch(`${API}/attendance-records`, { headers }).then(r => r.json()).then(d => setItems(safeArray(d))).catch(() => setItems([])),
      authFetch(`${API}/attendance-records/stats`, { headers }).then(r => r.json()).then(d => setStats(d || {})).catch(() => setStats({})),
      authFetch(`${API}/attendance/employees-list`, { headers }).then(r => r.json()).then(d => setEmployees(safeArray(d).map((e: any) => e.employee_name).filter(Boolean))).catch(() => {})
    ]).finally(() => setTableLoading(false));
  };
  useEffect(load, []);

  const saveEmployee = (name: string) => {
    setEmployeeName(name);
    localStorage.setItem("attendance_employee", name);
  };

  const departments = useMemo(() => {
    const set = new Set<string>();
    items.forEach(r => { if (r.department) set.add(r.department); });
    return Array.from(set).sort();
  }, [items]);

  // Monthly filter for strip
  const monthlyRecords = useMemo(() => {
    return items.filter(r => {
      const d = new Date(r.attendance_date);
      return d.getFullYear() === viewYear && d.getMonth() + 1 === viewMonth;
    });
  }, [items, viewMonth, viewYear]);

  // Day filter
  const dayRecords = useMemo(() => {
    if (!selectedDay) return monthlyRecords;
    return monthlyRecords.filter(r => {
      const d = new Date(r.attendance_date);
      return d.getDate() === selectedDay;
    });
  }, [monthlyRecords, selectedDay]);

  const filtered = useMemo(() => {
    let f = (selectedDay ? dayRecords : monthlyRecords).filter(r =>
      (filterStatus === "all" || r.status === filterStatus) &&
      (filterShift === "all" || r.shift_type === filterShift) &&
      (filterEmployee === "all" || r.employee_name === filterEmployee) &&
      (filterDept === "all" || r.department === filterDept) &&
      (!search || r.record_number?.toLowerCase().includes(search.toLowerCase()) || r.employee_name?.toLowerCase().includes(search.toLowerCase()) || r.department?.toLowerCase().includes(search.toLowerCase()) || r.location?.toLowerCase().includes(search.toLowerCase()))
    );
    f.sort((a: any, b: any) => {
      const av = a[sortField], bv = b[sortField];
      const cmp = typeof av === "number" ? av - bv : String(av || "").localeCompare(String(bv || ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return f;
  }, [monthlyRecords, dayRecords, selectedDay, search, filterStatus, filterShift, filterEmployee, filterDept, sortField, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ attendanceDate: new Date().toISOString().slice(0, 10), status: "present", shiftType: "morning", approvalStatus: "pending", checkIn: "08:00", checkOut: "17:00", breakMinutes: 30 }); setShowForm(true); };
  const openEdit = (r: AttendanceRecord) => { setEditing(r); setForm({ employeeName: r.employee_name, attendanceDate: r.attendance_date?.slice(0, 10), checkIn: r.check_in?.slice(0, 5), checkOut: r.check_out?.slice(0, 5), totalHours: r.total_hours, overtimeHours: r.overtime_hours, breakMinutes: r.break_minutes, status: r.status, shiftType: r.shift_type, location: r.location, department: r.department, lateMinutes: r.late_minutes, earlyLeaveMinutes: r.early_leave_minutes, approvedBy: r.approved_by, approvalStatus: r.approval_status, notes: r.notes }); setShowForm(true); };
  const save = async () => { const url = editing ? `${API}/attendance-records/${editing.id}` : `${API}/attendance-records`; await executeSave(url, editing ? "PUT" : "POST", form, editing ? "עודכן בהצלחה" : "נוצר בהצלחה", () => { setShowForm(false); load(); }); };
  const remove = async (id: number) => { await executeDelete(`${API}/attendance-records/${id}`, "למחוק רשומת נוכחות?", () => { load(); }); };
  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const prevMonth = () => {
    if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
    setSelectedDay(null);
  };
  const goToday = () => { setViewMonth(new Date().getMonth() + 1); setViewYear(new Date().getFullYear()); setSelectedDay(new Date().getDate()); };

  const kpis = [
    { label: "סה\"כ רשומות", value: fmt(stats.total || 0), icon: Clock, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "נוכחים", value: fmt(stats.present || 0), icon: UserCheck, color: "text-green-600", bg: "bg-green-50" },
    { label: "נעדרים", value: fmt(stats.absent || 0), icon: UserX, color: "text-red-600", bg: "bg-red-50" },
    { label: "איחורים", value: fmt(stats.late || 0), icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-50" },
    { label: "מחלה", value: fmt(stats.sick || 0), icon: Coffee, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "חופשה", value: fmt(stats.vacation || 0), icon: Sun, color: "text-cyan-600", bg: "bg-cyan-50" },
    { label: "ממוצע שעות", value: Number(stats.avg_hours || 0).toFixed(1), icon: Timer, color: "text-indigo-600", bg: "bg-indigo-50" },
    { label: "שעות נוספות", value: fmt(stats.total_overtime || 0), icon: CheckCircle2, color: "text-orange-600", bg: "bg-orange-50" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      {/* Kiosk Mode */}
      <AnimatePresence>
        {kioskMode && <KioskMode onClose={() => setKioskMode(false)} employees={employees} />}
      </AnimatePresence>

      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><Clock className="text-amber-500" size={24} /> נוכחות</h1>
          <p className="text-muted-foreground mt-1 text-sm">מעקב כניסות, יציאות ושעות עבודה</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setKioskMode(true)} className="flex items-center gap-1.5 bg-amber-600 text-white px-3 py-2 rounded-lg hover:bg-amber-700 text-sm font-medium shadow">
            <Maximize2 size={15} /> מצב קיוסק
          </button>
          <ExportDropdown data={items} headers={{ record_number: "מספר", employee_name: "עובד", attendance_date: "תאריך", check_in: "כניסה", check_out: "יציאה", total_hours: "שעות", status: "סטטוס" }} filename={"attendance"} />
          <button onClick={() => printPage("נוכחות")} className="flex items-center gap-1.5 bg-muted text-white px-3 py-2 rounded-lg hover:bg-slate-600 text-sm">
            <Printer size={15} /> הדפסה
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-amber-500 text-white px-3 py-2 rounded-lg hover:bg-amber-600 shadow text-sm font-medium">
            <Plus size={15} /> רשומה חדשה
          </button>
        </div>
      </div>

      {/* Check-in Widget + Employee Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <CheckInWidget employeeName={employeeName} onStatusChange={load} />
        </div>
        <div className="bg-card rounded-2xl border shadow-sm p-4">
          <label className="block text-sm font-medium text-muted-foreground mb-1">שם תצוגה (אופציונלי)</label>
          <p className="text-xs text-muted-foreground mb-2">שעון הנוכחות משתמש בחשבון המחובר. שם זה מוצג בלבד.</p>
          <input
            value={employeeName}
            onChange={e => saveEmployee(e.target.value)}
            list="employees-list"
            placeholder="הקלד שם לתצוגה..."
            className="w-full border rounded-xl px-3 py-2 text-sm mb-3"
          />
          <datalist id="employees-list">
            {employees.map(e => <option key={e} value={e} />)}
          </datalist>
          <div className="text-xs text-muted-foreground text-center mb-1">למסך משרד עם בחירת עובד:</div>
          <button onClick={() => setKioskMode(true)} className="w-full text-center text-sm font-medium text-amber-600 hover:underline flex items-center justify-center gap-1">
            <Maximize2 size={13} /> פתח מצב קיוסק
          </button>
        </div>
      </div>

      {/* Month Navigation + Calendar Strip */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-muted/50 border"><ChevronRight size={18} /></button>
          <h2 className="text-lg font-bold min-w-[160px] text-center">{HEBREW_MONTHS[viewMonth - 1]} {viewYear}</h2>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-muted/50 border"><ChevronLeft size={18} /></button>
          <button onClick={goToday} className="px-3 py-1.5 text-sm bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 font-medium">היום</button>
          {selectedDay && (
            <button onClick={() => setSelectedDay(null)} className="px-3 py-1.5 text-sm bg-muted/50 text-muted-foreground rounded-lg hover:bg-muted">
              <X size={14} className="inline ml-1" />נקה סינון
            </button>
          )}
          <div className="mr-auto flex gap-1">
            <button onClick={() => setView("list")} className={`p-2 rounded-lg border transition-colors ${view === "list" ? "bg-amber-500 text-white border-amber-500" : "hover:bg-muted/30"}`}><List size={16} /></button>
            <button onClick={() => setView("calendar")} className={`p-2 rounded-lg border transition-colors ${view === "calendar" ? "bg-amber-500 text-white border-amber-500" : "hover:bg-muted/30"}`}><Calendar size={16} /></button>
          </div>
        </div>
        <CalendarStrip year={viewYear} month={viewMonth} records={items} onDayClick={d => setSelectedDay(prev => prev === d ? null : d)} selectedDay={selectedDay} />
      </div>

      {/* KPI Cards */}
      <div>
        <button onClick={() => setShowKpis(v => !v)} className="text-sm text-muted-foreground hover:text-amber-600 mb-2 flex items-center gap-1">
          {showKpis ? "הסתר" : "הצג"} נתוני סיכום
        </button>
        {showKpis && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            {kpis.map((kpi, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                className={`rounded-xl shadow-sm border p-3 ${kpi.bg}`}>
                <kpi.icon className={`${kpi.color} mb-1`} size={18} />
                <div className="text-lg font-bold">{kpi.value}</div>
                <div className="text-xs text-muted-foreground">{kpi.label}</div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Filters Toolbar */}
      <div className="bg-card rounded-xl border shadow-sm p-3">
        <div className="flex gap-3 flex-wrap items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute right-3 top-2.5 text-muted-foreground" size={16} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש עובד, מחלקה..." className="w-full pr-9 pl-4 py-2 border rounded-lg text-sm" />
          </div>
          <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[140px]">
            <option value="all">כל העובדים</option>
            {employees.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[130px]">
            <option value="all">כל המחלקות</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="all">כל הסטטוסים</option>
            {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filterShift} onChange={e => setFilterShift(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="all">כל המשמרות</option>
            {Object.entries(shiftMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {(filterEmployee !== "all" || filterDept !== "all" || filterStatus !== "all" || filterShift !== "all" || search) && (
            <button onClick={() => { setSearch(""); setFilterEmployee("all"); setFilterDept("all"); setFilterStatus("all"); setFilterShift("all"); }}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 border border-red-200 px-2 py-1.5 rounded-lg hover:bg-red-50">
              <X size={12} /> נקה פילטרים
            </button>
          )}
        </div>
      </div>

      <BulkActions selectedIds={bulk.selectedIds} onClear={bulk.clearAll} entityName="רשומות נוכחות" actions={defaultBulkActions} />

      {/* View: List or Calendar */}
      {view === "list" ? (
        <>
        <div className="bg-card rounded-2xl shadow-sm border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b">
              <tr>
                <th className="px-2 py-3 w-10"><BulkCheckbox checked={bulk.isAllSelected(filtered)} indeterminate={bulk.isSomeSelected(filtered)} onChange={() => bulk.toggleAll(filtered)} /></th>
                {[{ key: "record_number", label: "מספר" }, { key: "employee_name", label: "עובד" }, { key: "attendance_date", label: "תאריך" }, { key: "check_in", label: "כניסה" }, { key: "check_out", label: "יציאה" }, { key: "total_hours", label: "שעות" }, { key: "overtime_hours", label: "נוספות" }, { key: "shift_type", label: "משמרת" }, { key: "late_minutes", label: "איחור" }, { key: "status", label: "סטטוס" }].map(col => (
                  <th key={col.key} className="px-3 py-3 text-right cursor-pointer hover:bg-muted/50 whitespace-nowrap" onClick={() => toggleSort(col.key)}>
                    <div className="flex items-center gap-1">{col.label} <ArrowUpDown size={11} /></div>
                  </th>
                ))}
                <th className="px-3 py-3 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={12} className="text-center py-10 text-muted-foreground">אין רשומות נוכחות</td></tr>
                : pagination.paginate(filtered).map(r => (
                  <tr key={r.id} className="border-b hover:bg-amber-50/30">
                    <td className="px-2 py-2"><BulkCheckbox checked={bulk.isSelected(r.id)} onChange={() => bulk.toggle(r.id)} /></td>
                    <td className="px-3 py-2 font-mono text-amber-600 font-bold text-xs">{r.record_number}</td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{r.employee_name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.attendance_date?.slice(0, 10)}</td>
                    <td className="px-3 py-2 font-mono">{r.check_in?.slice(0, 5) || "-"}</td>
                    <td className="px-3 py-2 font-mono">{r.check_out?.slice(0, 5) || <span className="inline-flex items-center gap-1 text-green-600 text-xs"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />פעיל</span>}</td>
                    <td className="px-3 py-2 font-bold">{Number(r.total_hours || 0).toFixed(1)}</td>
                    <td className="px-3 py-2">{Number(r.overtime_hours || 0) > 0 ? <span className="text-orange-600 font-bold">{Number(r.overtime_hours).toFixed(1)}</span> : "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{shiftMap[r.shift_type]?.label || r.shift_type}</td>
                    <td className="px-3 py-2">{Number(r.late_minutes || 0) > 0 ? <span className="text-red-600 font-bold">{r.late_minutes} דק'</span> : "-"}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs flex items-center gap-1 w-fit ${statusMap[r.status]?.color || "bg-muted/50"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusMap[r.status]?.dot}`} />
                        {statusMap[r.status]?.label || r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(r)} className="p-1 hover:bg-blue-500/10 rounded"><Edit2 size={13} /></button>
                        <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.employee_name || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1 hover:bg-red-500/10 rounded text-red-500"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
          <div className="px-4 py-2 text-xs text-muted-foreground border-t">סה"כ: {filtered.length} רשומות {selectedDay ? `(יום ${selectedDay} ב${HEBREW_MONTHS[viewMonth - 1]})` : ""}</div>
        </div>
        <SmartPagination pagination={pagination} />
        </>
      ) : (
        <CalendarView year={viewYear} month={viewMonth} records={items} />
      )}

      {/* Reports Panel */}
      <ReportsPanel items={items} />

      {/* Add/Edit Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-xl font-bold">{editing ? "עריכת נוכחות" : "רישום נוכחות"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted/50 rounded-lg"><X size={20} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium mb-1">שם עובד *</label><input value={form.employeeName || ""} onChange={e => setForm({ ...form, employeeName: e.target.value })} list="employees-list" className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">תאריך *</label><input type="date" value={form.attendanceDate || ""} onChange={e => setForm({ ...form, attendanceDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">סטטוס</label><select value={form.status || "present"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full border rounded-lg px-3 py-2">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">שעת כניסה</label><input type="time" value={form.checkIn || ""} onChange={e => setForm({ ...form, checkIn: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">שעת יציאה</label><input type="time" value={form.checkOut || ""} onChange={e => setForm({ ...form, checkOut: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">סוג משמרת</label><select value={form.shiftType || "morning"} onChange={e => setForm({ ...form, shiftType: e.target.value })} className="w-full border rounded-lg px-3 py-2">{Object.entries(shiftMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">מחלקה</label><input value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מיקום</label><input value={form.location || ""} onChange={e => setForm({ ...form, location: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">סה"כ שעות</label><input type="number" step="0.5" value={form.totalHours || ""} onChange={e => setForm({ ...form, totalHours: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">שעות נוספות</label><input type="number" step="0.5" value={form.overtimeHours || ""} onChange={e => setForm({ ...form, overtimeHours: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">הפסקה (דקות)</label><input type="number" value={form.breakMinutes || ""} onChange={e => setForm({ ...form, breakMinutes: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">דקות איחור</label><input type="number" value={form.lateMinutes || ""} onChange={e => setForm({ ...form, lateMinutes: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">אישור</label><select value={form.approvalStatus || "pending"} onChange={e => setForm({ ...form, approvalStatus: e.target.value })} className="w-full border rounded-lg px-3 py-2">{Object.entries(approvalMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">מאשר</label><input value={form.approvedBy || ""} onChange={e => setForm({ ...form, approvedBy: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium mb-1">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2" /></div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={save} className="flex items-center gap-2 bg-amber-500 text-white px-6 py-2 rounded-lg hover:bg-amber-600 font-medium"><Save size={16} /> {editing ? "עדכון" : "שמירה"}</button>
                <button onClick={() => setShowForm(false)} className="px-6 py-2 border rounded-lg hover:bg-muted/30">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
