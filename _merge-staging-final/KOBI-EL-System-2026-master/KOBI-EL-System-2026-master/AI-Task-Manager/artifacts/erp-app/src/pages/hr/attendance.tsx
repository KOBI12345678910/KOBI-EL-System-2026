import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Clock, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2, AlertTriangle, ArrowUpDown, UserCheck, UserX, Timer, Sun, Moon, Sunset, Coffee, LogIn, LogOut, LayoutList, Calendar, ChevronLeft, ChevronRight, BarChart2, TrendingUp, Download, Printer, List, Maximize2, Minimize2, Users, Loader2, MapPin, Fingerprint, CreditCard, Activity, RefreshCw, Navigation , Copy } from "lucide-react";
import { EmptyState } from "@/components/ui/unified-states";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { useApiAction } from "@/hooks/use-api-action";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || d?.rows || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

interface AttendanceRecord { id: number; record_number: string; employee_name: string; employee_id_ref: number; attendance_date: string; check_in: string; check_out: string; total_hours: number; overtime_hours: number; overtime_125_hours: number; overtime_150_hours: number; regular_hours: number; break_minutes: number; status: string; shift_type: string; location: string; department: string; late_minutes: number; early_leave_minutes: number; approved_by: string; approval_status: string; clock_method: string; gps_lat: number; gps_lng: number; within_geofence: boolean; is_friday: boolean; is_saturday: boolean; notes: string; }

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
  morning: { label: "בוקר" }, afternoon: { label: "צהריים" },
  evening: { label: "ערב" }, night: { label: "לילה" }, full_day: { label: "יום מלא" },
};
const approvalMap: Record<string, { label: string; color: string }> = {
  pending: { label: "ממתין", color: "bg-yellow-100 text-yellow-700" },
  approved: { label: "מאושר", color: "bg-green-100 text-green-700" },
  rejected: { label: "נדחה", color: "bg-red-100 text-red-700" },
};
const clockMethodMap: Record<string, { label: string; icon: any; color: string }> = {
  manual: { label: "ידני", icon: Clock, color: "text-gray-400" },
  gps: { label: "GPS", icon: Navigation, color: "text-blue-400" },
  nfc: { label: "כרטיס NFC", icon: CreditCard, color: "text-purple-400" },
  biometric: { label: "ביומטרי", icon: Fingerprint, color: "text-green-400" },
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

function pad2(n: number) { return String(n).padStart(2, "0"); }
function formatTime(date: Date) { return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`; }
function formatElapsed(fromStr: string) {
  if (!fromStr) return "00:00:00";
  const [h, m] = fromStr.split(":").map(Number);
  const start = new Date(); start.setHours(h, m, 0, 0);
  const diff = Math.max(0, Math.floor((new Date().getTime() - start.getTime()) / 1000));
  return `${pad2(Math.floor(diff / 3600))}:${pad2(Math.floor((diff % 3600) / 60))}:${pad2(diff % 60)}`;
}

// ─── GPS Clock-In Widget ──────────────────────────────────────────────────
function GPSClockWidget({ onStatusChange }: { onStatusChange?: () => void }) {
  const now = useNow();
  const [status, setStatus] = useState<{ checkedIn: boolean; checkInTime?: string; record?: any } | null>(null);
  const [loading, setLoading] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<string>("");
  const [withinGeofence, setWithinGeofence] = useState<boolean | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [method, setMethod] = useState<"manual"|"gps"|"nfc"|"biometric">("manual");
  const [badgeNumber, setBadgeNumber] = useState("");
  const [showMethodPicker, setShowMethodPicker] = useState(false);
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const loadStatus = useCallback(async () => {
    try {
      const r = await authFetch(`${API}/attendance/current-status`, { headers });
      setStatus(await r.json());
    } catch { setStatus({ checkedIn: false }); }
  }, [token]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const getGpsPosition = (): Promise<GeolocationPosition> => new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("GPS לא נתמך")); return; }
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, enableHighAccuracy: true });
  });

  const clockAction = async (action: "in" | "out") => {
    setLoading(true);
    try {
      let body: any = { kiosk: false, method };
      if (badgeNumber) body.badge_number = badgeNumber;

      if (method === "gps") {
        setGpsStatus("מאתר מיקום...");
        try {
          const pos = await getGpsPosition();
          body.lat = pos.coords.latitude;
          body.lng = pos.coords.longitude;
          body.accuracy = pos.coords.accuracy;
          setGpsStatus(`מיקום נאתר (דיוק ${Math.round(pos.coords.accuracy)}מ')`);
        } catch (e: any) {
          setGpsStatus(`שגיאת GPS: ${e.message}`);
        }
      }

      const url = action === "in" ? `${API}/attendance/clock-in-gps` : `${API}/attendance/clock-out-overtime`;
      const r = await authFetch(url, { method: "POST", headers, body: JSON.stringify(body) });
      const d = await r.json();

      if (d.success) {
        if (d.withinGeofence !== undefined) setWithinGeofence(d.withinGeofence);
        if (d.distanceMeters !== null) setDistance(d.distanceMeters);
        await loadStatus();
        onStatusChange?.();
        setShowMethodPicker(false);
      } else if (d.requiresOverride || d.requiresPrivilegedOverride) {
        // GPS geofence rejection: show clear error — override requires manager/HR role.
        // The backend enforces the privilege check server-side; only privileged users
        // can supply override_geofence:true. Regular employees see an informational message.
        const dist = d.distanceMeters ? ` (${d.distanceMeters}מ' מאתר העבודה)` : "";
        alert(`${d.message || "מחוץ לאתר העבודה"}${dist}\n\nלאישור חריגה נדרשת הרשאת מנהל או HR.`);
      } else {
        // Other failure: do NOT fall back to legacy clock-in; surface the error
        alert(d.error || "שגיאה בשעון נוכחות");
      }
    } catch (e: any) { alert(e.message || "שגיאה"); }
    setLoading(false);
    setGpsStatus("");
  };

  const isIn = status?.checkedIn;

  return (
    <div className={`rounded-2xl border shadow-sm p-5 transition-colors ${isIn ? "bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200" : "bg-gradient-to-br from-green-50 to-emerald-50 border-green-200"}`}>
      <div className="text-3xl font-bold font-mono tracking-widest text-foreground mb-0.5 text-center">{formatTime(now)}</div>
      <div className="text-xs text-muted-foreground mb-3 text-center">{now.toLocaleDateString("he-IL", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>

      {isIn ? (
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-medium mb-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            מחויב כניסה מאז {status?.checkInTime?.slice(0,5)}
          </div>
          <div className="text-xl font-mono font-bold text-amber-600 mb-3">{formatElapsed(status?.checkInTime || "")}</div>
          <button onClick={() => clockAction("out")} disabled={loading}
            className="flex items-center gap-2 mx-auto bg-amber-500 hover:bg-amber-600 text-foreground font-bold px-6 py-2.5 rounded-xl shadow-lg transition-all disabled:opacity-50">
            {loading ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />} יציאה
          </button>
        </div>
      ) : (
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-muted/50 text-muted-foreground px-3 py-1 rounded-full text-xs font-medium mb-3">
            <span className="w-2 h-2 rounded-full bg-slate-400" /> לא מחויב כניסה
          </div>

          {showMethodPicker ? (
            <div className="space-y-2 mb-3">
              <p className="text-xs text-muted-foreground">בחר שיטת כניסה:</p>
              <div className="grid grid-cols-2 gap-2">
                {(["manual","gps","nfc","biometric"] as const).map(m => {
                  const cm = clockMethodMap[m];
                  return (
                    <button key={m} onClick={() => setMethod(m)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${method === m ? "bg-green-500 text-foreground border-green-500" : "bg-card border-border/50 hover:bg-muted/30"}`}>
                      <cm.icon size={14} className={method === m ? "text-foreground" : cm.color} />
                      {cm.label}
                    </button>
                  );
                })}
              </div>
              {method === "nfc" && (
                <input value={badgeNumber} onChange={e => setBadgeNumber(e.target.value)} placeholder="מספר כרטיס NFC"
                  className="w-full border rounded-lg px-3 py-2 text-xs bg-background" />
              )}
            </div>
          ) : (
            <button onClick={() => setShowMethodPicker(true)} className="text-xs text-muted-foreground hover:text-foreground mb-2 underline">
              שיטה: {clockMethodMap[method]?.label}
            </button>
          )}

          <button onClick={() => clockAction("in")} disabled={loading}
            className="flex items-center gap-2 mx-auto bg-green-500 hover:bg-green-600 text-foreground font-bold px-6 py-2.5 rounded-xl shadow-lg transition-all disabled:opacity-50">
            {loading ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />} כניסה
          </button>
        </div>
      )}

      {gpsStatus && <p className="text-xs text-center text-muted-foreground mt-2">{gpsStatus}</p>}
      {withinGeofence !== null && (
        <div className={`text-xs text-center mt-2 ${withinGeofence ? "text-green-600" : "text-orange-500"}`}>
          <MapPin size={12} className="inline ml-1" />
          {withinGeofence ? "בתחום אתר העבודה" : `מחוץ לאתר (${distance ? `${Math.round(distance)}מ'` : ""})`}
        </div>
      )}
    </div>
  );
}

// ─── Realtime Dashboard Panel ─────────────────────────────────────────────
function RealtimeDashboard({ onRefresh }: { onRefresh: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem("erp_token") || "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authFetch(`${API}/attendance/realtime-dashboard`, { headers: { Authorization: `Bearer ${token}` } });
      setData(await r.json());
    } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  if (loading && !data) return <div className="bg-card rounded-2xl border p-4 animate-pulse h-32" />;

  const stats = data?.today_stats || {};
  const liveCheckins = safeArray(data?.live_checkins);
  const recentCheckouts = safeArray(data?.recent_checkouts);

  return (
    <div className="bg-card rounded-2xl border shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold flex items-center gap-2"><Activity className="text-green-500" size={16} /> לוח נוכחות בזמן אמת</h3>
        <button onClick={() => { load(); onRefresh(); }} className="p-1.5 hover:bg-muted/50 rounded-lg text-muted-foreground">
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "כרגע בעבודה", value: stats.checked_in || 0, color: "text-green-500", bg: "bg-green-500/10" },
          { label: "יצאו היום", value: stats.checked_out || 0, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "איחורים", value: stats.late_count || 0, color: "text-yellow-400", bg: "bg-yellow-500/10" },
          { label: "ש. נוספות היום", value: parseFloat(stats.total_overtime_hours || 0).toFixed(1), color: "text-orange-400", bg: "bg-orange-500/10" },
        ].map((s, i) => (
          <div key={i} className={`rounded-xl p-3 ${s.bg}`}>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {liveCheckins.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">כרגע בעבודה ({liveCheckins.length})</p>
          <div className="flex flex-wrap gap-2">
            {liveCheckins.slice(0, 12).map((r: any, i: number) => (
              <div key={i} className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-lg px-2.5 py-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-medium text-green-300">{r.employee_name?.split(" ")[0]}</span>
                <span className="text-[10px] text-muted-foreground">{r.check_in?.slice(0,5)}</span>
                {r.last_method && r.last_method !== "manual" && (
                  <span className="text-[10px]">{clockMethodMap[r.last_method]?.label}</span>
                )}
              </div>
            ))}
            {liveCheckins.length > 12 && <span className="text-xs text-muted-foreground self-center">+{liveCheckins.length - 12} נוספים</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Overtime Summary Panel ───────────────────────────────────────────────
function OvertimeSummaryPanel() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem("erp_token") || "";

  useEffect(() => {
    const week = new Date().toISOString().slice(0, 10);
    authFetch(`${API}/attendance/overtime-summary?week=${week}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse h-24 bg-card rounded-2xl border" />;
  if (!data?.employees?.length) return null;

  return (
    <div className="bg-card rounded-2xl border shadow-sm p-4">
      <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
        <TrendingUp className="text-orange-400" size={16} />
        שעות נוספות שבועיות (חוק עבודה ישראלי)
        <span className="text-xs text-muted-foreground font-normal">שבוע {data.week_start} – {data.week_end}</span>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b border-border/50">
              <th className="text-right py-1.5 px-2">עובד</th>
              <th className="text-center py-1.5 px-2">שעות רגילות</th>
              <th className="text-center py-1.5 px-2">125% (2 ש' ראשונות)</th>
              <th className="text-center py-1.5 px-2">150% (מעבר ל-2)</th>
              <th className="text-center py-1.5 px-2">סה"כ שעות</th>
            </tr>
          </thead>
          <tbody>
            {data.employees.slice(0, 8).map((emp: any, i: number) => (
              <tr key={i} className="border-b border-border/20 hover:bg-muted/10">
                <td className="py-1.5 px-2 font-medium text-foreground">{emp.employee_name}</td>
                <td className="py-1.5 px-2 text-center">{emp.regular_hours}h</td>
                <td className="py-1.5 px-2 text-center">
                  {parseFloat(emp.ot125) > 0 ? <span className="text-yellow-400 font-bold">{emp.ot125}h</span> : "—"}
                </td>
                <td className="py-1.5 px-2 text-center">
                  {parseFloat(emp.ot150) > 0 ? <span className="text-orange-400 font-bold">{emp.ot150}h</span> : "—"}
                </td>
                <td className="py-1.5 px-2 text-center font-bold text-foreground">{emp.total_hours}h</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">* חישוב לפי חוק עבודה ישראלי: עד 8.6 שעות/יום רגיל, 2 שעות נוספות ראשונות ב-125%, מעבר לכך ב-150%. שישי/שבת ב-150%.</p>
    </div>
  );
}

// ─── Calendar Strip ───────────────────────────────────────────────────────
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
    const todayEl = stripRef.current?.querySelector('[data-today="true"]');
    todayEl?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
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
            const isFuture = date > today;
            return (
              <button key={d} data-today={isToday} onClick={() => onDayClick(d)}
                className={`flex flex-col items-center w-10 py-2 px-1 rounded-xl transition-all cursor-pointer select-none
                  ${isToday ? "ring-2 ring-amber-500 bg-amber-50" : ""}
                  ${selectedDay === d ? "bg-amber-100" : "hover:bg-muted/30"}
                  ${isWeekend ? "opacity-50" : ""}`}>
                <span className="text-[10px] text-muted-foreground mb-1">{HEBREW_DAYS[dow]}</span>
                <span className={`text-sm font-bold ${isToday ? "text-amber-600" : "text-foreground"}`}>{d}</span>
                <span className={`w-2 h-2 rounded-full mt-1.5 ${
                  isFuture ? "bg-muted/50" : isWeekend ? "bg-muted" :
                  rec ? (rec.present ? "bg-green-500" : "bg-red-400") : "bg-muted"}`} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Calendar Month View ──────────────────────────────────────────────────
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
        {["א","ב","ג","ד","ה","ו","ש"].map(d => <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>)}
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
              <div className={`w-6 h-6 flex items-center justify-center rounded-full mb-1 text-xs font-bold ${isToday ? "bg-amber-500 text-foreground" : "text-muted-foreground"}`}>{d}</div>
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

// ─── Kiosk Mode ───────────────────────────────────────────────────────────
function KioskMode({ onClose, employees }: { onClose: () => void; employees: string[] }) {
  const now = useNow();
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const filteredEmps = useMemo(() => employees.filter(e => !search || e.toLowerCase().includes(search.toLowerCase())).slice(0, 8), [employees, search]);

  const loadStatus = async (name: string) => {
    if (!name) return;
    try { const r = await authFetch(`${API}/attendance/current-status?kiosk=1&employee=${encodeURIComponent(name)}`, { headers }); setStatus(await r.json()); }
    catch { setStatus(null); }
  };

  const selectEmployee = (name: string) => { setSelectedEmployee(name); setSearch(""); loadStatus(name); };

  const doAction = async () => {
    if (!selectedEmployee) return;
    setLoading(true); setMessage(null);
    try {
      const isIn = status?.checkedIn;
      const url = isIn ? `${API}/attendance/clock-out` : `${API}/attendance/clock-in`;
      const r = await authFetch(url, { method: "POST", headers, body: JSON.stringify({ employeeName: selectedEmployee, kiosk: true }) });
      const d = await r.json();
      if (d.success) {
        setMessage({ type: "success", text: isIn ? `יציאה נרשמה ב-${d.checkOutTime}` : `כניסה נרשמה ב-${d.checkInTime}` });
        await loadStatus(selectedEmployee);
        setTimeout(() => { setSelectedEmployee(""); setStatus(null); setMessage(null); }, 3000);
      } else setMessage({ type: "error", text: d.error || "שגיאה" });
    } finally { setLoading(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-slate-900 flex flex-col items-center justify-center" dir="rtl">
      <button onClick={onClose} className="absolute top-6 left-6 text-muted-foreground hover:text-foreground p-2 rounded-lg hover:bg-slate-800"><Minimize2 size={24} /></button>
      <div className="text-6xl font-bold font-mono text-foreground mb-2">{formatTime(now)}</div>
      <div className="text-muted-foreground text-lg mb-10">{now.toLocaleDateString("he-IL", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
      <div className="w-full max-w-md">
        <AnimatePresence>
          {message && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={`text-center py-4 rounded-xl text-lg font-bold mb-6 ${message.type === "success" ? "bg-green-600 text-foreground" : "bg-red-600 text-foreground"}`}>
              {message.text}
            </motion.div>
          )}
        </AnimatePresence>
        {!selectedEmployee ? (
          <div className="bg-slate-800 rounded-2xl p-6">
            <h2 className="text-foreground text-xl font-bold text-center mb-4">בחר עובד</h2>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש עובד..."
              className="w-full bg-slate-700 text-foreground placeholder-slate-400 border border-slate-600 rounded-xl px-4 py-3 mb-4 text-lg" />
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filteredEmps.map(emp => (
                <button key={emp} onClick={() => selectEmployee(emp)}
                  className="w-full text-right bg-slate-700 hover:bg-amber-600 text-foreground px-4 py-3 rounded-xl transition-colors font-medium">{emp}</button>
              ))}
              {filteredEmps.length === 0 && <p className="text-muted-foreground text-center py-4">לא נמצאו עובדים</p>}
            </div>
          </div>
        ) : (
          <div className="bg-slate-800 rounded-2xl p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-amber-500 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl font-bold text-foreground">{selectedEmployee[0]}</span>
            </div>
            <h2 className="text-foreground text-2xl font-bold mb-1">{selectedEmployee}</h2>
            {status?.checkedIn && <p className="text-amber-400 mb-6">מחויב כניסה מאז {status.checkInTime?.slice(0,5)}</p>}
            {!status?.checkedIn && <p className="text-muted-foreground mb-6">לא מחויב כניסה</p>}
            <button onClick={doAction} disabled={loading}
              className={`w-full py-4 rounded-xl text-foreground text-xl font-bold transition-all shadow-lg mb-3 disabled:opacity-50 ${status?.checkedIn ? "bg-amber-500 hover:bg-amber-600" : "bg-green-500 hover:bg-green-600"}`}>
              {loading ? "..." : status?.checkedIn ? "⬛ יציאה" : "✅ כניסה"}
            </button>
            <button onClick={() => { setSelectedEmployee(""); setStatus(null); }} className="text-muted-foreground hover:text-foreground text-sm">בחר עובד אחר</button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Reports Panel ────────────────────────────────────────────────────────
function ReportsPanel({ items }: { items: AttendanceRecord[] }) {
  const byEmployee = useMemo(() => {
    const map: Record<string, { name: string; total: number; present: number; absent: number; late: number; hours: number; overtime: number; ot125: number; ot150: number }> = {};
    items.forEach(r => {
      if (!map[r.employee_name]) map[r.employee_name] = { name: r.employee_name, total: 0, present: 0, absent: 0, late: 0, hours: 0, overtime: 0, ot125: 0, ot150: 0 };
      map[r.employee_name].total++;
      if (r.status === "present" || r.status === "remote") map[r.employee_name].present++;
      if (r.status === "absent") map[r.employee_name].absent++;
      if (r.status === "late") map[r.employee_name].late++;
      map[r.employee_name].hours += Number(r.total_hours || 0);
      map[r.employee_name].overtime += Number(r.overtime_hours || 0);
      map[r.employee_name].ot125 += Number(r.overtime_125_hours || 0);
      map[r.employee_name].ot150 += Number(r.overtime_150_hours || 0);
    });
    return Object.values(map).sort((a, b) => b.hours - a.hours).slice(0, 10);
  }, [items]);

  const stats = useMemo(() => ({
    totalHours: items.reduce((s, r) => s + Number(r.total_hours || 0), 0),
    totalOvertime: items.reduce((s, r) => s + Number(r.overtime_hours || 0), 0),
    totalOt125: items.reduce((s, r) => s + Number(r.overtime_125_hours || 0), 0),
    totalOt150: items.reduce((s, r) => s + Number(r.overtime_150_hours || 0), 0),
    totalLate: items.reduce((s, r) => s + Number(r.late_minutes || 0), 0),
    presentRate: items.length ? Math.round(items.filter(r => r.status === "present" || r.status === "late" || r.status === "remote").length / items.length * 100) : 0,
    gpsCheckins: items.filter(r => (r as any).clock_method === "gps").length,
  }), [items]);

  return (
    <div className="bg-card rounded-2xl border shadow-sm p-5 space-y-5">
      <h2 className="text-base font-bold flex items-center gap-2"><BarChart2 className="text-amber-500" size={18} /> דוחות נוכחות</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "סה\"כ שעות", value: stats.totalHours.toFixed(1), color: "text-blue-600", bg: "bg-blue-50" },
          { label: "שעות נוספות", value: stats.totalOvertime.toFixed(1), color: "text-orange-600", bg: "bg-orange-50" },
          { label: "125% (2 ש')", value: stats.totalOt125.toFixed(1), color: "text-yellow-600", bg: "bg-yellow-50" },
          { label: "150% (מעבר)", value: stats.totalOt150.toFixed(1), color: "text-red-600", bg: "bg-red-50" },
        ].map((s, i) => (
          <div key={i} className={`rounded-xl p-3 ${s.bg}`}>
            <div className={`text-xl font-bold ${s.color}`}>{s.value}h</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
      {byEmployee.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border/50">
          <table className="w-full text-xs">
            <thead className="bg-muted/30 border-b border-border/50">
              <tr>
                <th className="text-right px-3 py-2 text-muted-foreground">עובד</th>
                <th className="text-center px-3 py-2 text-muted-foreground">נוכחות</th>
                <th className="text-center px-3 py-2 text-muted-foreground">שעות</th>
                <th className="text-center px-3 py-2 text-muted-foreground">125%</th>
                <th className="text-center px-3 py-2 text-muted-foreground">150%</th>
              </tr>
            </thead>
            <tbody>
              {byEmployee.map((e, i) => (
                <tr key={i} className="border-b border-border/20 hover:bg-muted/10">
                  <td className="px-3 py-2 font-medium text-foreground">{e.name}</td>
                  <td className="px-3 py-2 text-center">{e.present}/{e.total}</td>
                  <td className="px-3 py-2 text-center font-bold">{e.hours.toFixed(1)}</td>
                  <td className="px-3 py-2 text-center text-yellow-400">{e.ot125 > 0 ? e.ot125.toFixed(1) : "—"}</td>
                  <td className="px-3 py-2 text-center text-orange-400">{e.ot150 > 0 ? e.ot150.toFixed(1) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">* חישוב שעות נוספות לפי חוק עבודה ישראלי: 8.6 שעות/יום, 125% לשעתיים הראשונות, 150% מעבר לכך, 150% בשישי ובשבת.</p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────
export default function AttendancePage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
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
  const [view, setView] = useState<"list" | "calendar" | "reports">("list");
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth() + 1);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [kioskMode, setKioskMode] = useState(false);
  const [employees, setEmployees] = useState<string[]>([]);
  const bulk = useBulkSelection();
  const [tableLoading, setTableLoading] = useState(true);
  const pagination = useSmartPagination(25);
  const { executeSave, executeDelete } = useApiAction();
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = useCallback(() => {
    setTableLoading(true);
    Promise.all([
      authFetch(`${API}/attendance-records`, { headers }).then(r => r.json()).then(d => setItems(safeArray(d))).catch(() => setItems([])),
      authFetch(`${API}/attendance-records/stats`, { headers }).then(r => r.json()).then(d => setStats(d || {})).catch(() => setStats({})),
      authFetch(`${API}/attendance/employees-list`, { headers }).then(r => r.json()).then(d => setEmployees(safeArray(d).map((e: any) => e.employee_name).filter(Boolean))).catch(() => {}),
    ]).finally(() => setTableLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    items.forEach(r => { if (r.department) set.add(r.department); });
    return Array.from(set).sort();
  }, [items]);

  const monthlyRecords = useMemo(() => items.filter(r => { const d = new Date(r.attendance_date); return d.getFullYear() === viewYear && d.getMonth() + 1 === viewMonth; }), [items, viewMonth, viewYear]);

  const filtered = useMemo(() => {
    let f = monthlyRecords.filter(r =>
      (filterStatus === "all" || r.status === filterStatus) &&
      (filterShift === "all" || r.shift_type === filterShift) &&
      (filterEmployee === "all" || r.employee_name === filterEmployee) &&
      (filterDept === "all" || r.department === filterDept) &&
      (!selectedDay || new Date(r.attendance_date).getDate() === selectedDay) &&
      (!search || r.record_number?.toLowerCase().includes(search.toLowerCase()) || r.employee_name?.toLowerCase().includes(search.toLowerCase()))
    );
    f.sort((a: any, b: any) => { const cmp = typeof a[sortField] === "number" ? a[sortField] - b[sortField] : String(a[sortField] || "").localeCompare(String(b[sortField] || "")); return sortDir === "asc" ? cmp : -cmp; });
    pagination.setTotalItems(f.length);
    return f;
  }, [monthlyRecords, search, filterStatus, filterShift, filterEmployee, filterDept, selectedDay, sortField, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ attendanceDate: new Date().toISOString().slice(0, 10), status: "present", shiftType: "morning", approvalStatus: "pending", checkIn: "08:00", checkOut: "17:00", breakMinutes: 30 }); setShowForm(true); };
  const openEdit = (r: AttendanceRecord) => { setEditing(r); setForm({ employeeName: r.employee_name, attendanceDate: r.attendance_date?.slice(0, 10), checkIn: r.check_in?.slice(0, 5), checkOut: r.check_out?.slice(0, 5), totalHours: r.total_hours, overtimeHours: r.overtime_hours, breakMinutes: r.break_minutes, status: r.status, shiftType: r.shift_type, location: r.location, department: r.department, lateMinutes: r.late_minutes, approvedBy: r.approved_by, approvalStatus: r.approval_status, notes: r.notes }); setShowForm(true); };
  const save = async () => { const url = editing ? `${API}/attendance-records/${editing.id}` : `${API}/attendance-records`; await executeSave(url, editing ? "PUT" : "POST", form, editing ? "עודכן" : "נוצר", () => { setShowForm(false); load(); }); };
  const remove = async (id: number) => { await executeDelete(`${API}/attendance-records/${id}`, "למחוק רשומת נוכחות?", () => load()); };
  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };
  const prevMonth = () => { if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); setSelectedDay(null); };
  const nextMonth = () => { if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); setSelectedDay(null); };

  const kpis = [
    { label: "נוכחים", value: fmt(stats.present || 0), icon: UserCheck, color: "text-green-600", bg: "bg-green-50" },
    { label: "נעדרים", value: fmt(stats.absent || 0), icon: UserX, color: "text-red-600", bg: "bg-red-50" },
    { label: "איחורים", value: fmt(stats.late || 0), icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-50" },
    { label: "מחלה", value: fmt(stats.sick || 0), icon: Coffee, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "חופשה", value: fmt(stats.vacation || 0), icon: Sun, color: "text-cyan-600", bg: "bg-cyan-50" },
    { label: "ממוצע שעות", value: Number(stats.avg_hours || 0).toFixed(1), icon: Timer, color: "text-indigo-600", bg: "bg-indigo-50" },
    { label: "שעות נוספות", value: fmt(stats.total_overtime || 0), icon: TrendingUp, color: "text-orange-600", bg: "bg-orange-50" },
    { label: "סה\"כ רשומות", value: fmt(stats.total || 0), icon: Clock, color: "text-blue-600", bg: "bg-blue-50" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4" dir="rtl">
      <AnimatePresence>{kioskMode && <KioskMode onClose={() => setKioskMode(false)} employees={employees} />}</AnimatePresence>

      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><Clock className="text-amber-500" size={24} /> נוכחות</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">מעקב כניסות, יציאות ושעות עבודה — דין ישראלי</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setKioskMode(true)} className="flex items-center gap-1.5 bg-amber-600 text-foreground px-3 py-2 rounded-lg hover:bg-amber-700 text-sm font-medium shadow">
            <Maximize2 size={15} /> קיוסק
          </button>
          <ExportDropdown data={filtered} headers={{ record_number: "מספר", employee_name: "עובד", attendance_date: "תאריך", check_in: "כניסה", check_out: "יציאה", total_hours: "שעות", overtime_hours: "שעות נוספות", status: "סטטוס" }} filename="attendance" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-amber-500 text-foreground px-3 py-2 rounded-lg hover:bg-amber-600 shadow text-sm font-medium">
            <Plus size={15} /> רשומה חדשה
          </button>
        </div>
      </div>

      {/* Realtime Dashboard + GPS Clock Widget */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <RealtimeDashboard onRefresh={load} />
        </div>
        <div>
          <GPSClockWidget onStatusChange={load} />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
            className={`rounded-xl shadow-sm border p-3 ${kpi.bg}`}>
            <kpi.icon className={`${kpi.color} mb-1`} size={16} />
            <div className="text-lg font-bold">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Month Navigation + Strip */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-muted/50 border"><ChevronRight size={18} /></button>
          <h2 className="text-base font-bold min-w-[160px] text-center">{HEBREW_MONTHS[viewMonth - 1]} {viewYear}</h2>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-muted/50 border"><ChevronLeft size={18} /></button>
          <button onClick={() => { setViewMonth(new Date().getMonth() + 1); setViewYear(new Date().getFullYear()); setSelectedDay(new Date().getDate()); }} className="px-3 py-1.5 text-sm bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 font-medium">היום</button>
          {selectedDay && <button onClick={() => setSelectedDay(null)} className="px-3 py-1.5 text-sm bg-muted/50 text-muted-foreground rounded-lg hover:bg-muted"><X size={14} className="inline ml-1" />נקה</button>}
          <div className="mr-auto flex gap-1">
            {[{ v: "list", icon: List, label: "רשימה" }, { v: "calendar", icon: Calendar, label: "לוח" }, { v: "reports", icon: BarChart2, label: "דוחות" }].map(tab => (
              <button key={tab.v} onClick={() => setView(tab.v as any)}
                className={`flex items-center gap-1 px-3 py-2 rounded-lg border transition-colors text-xs ${view === tab.v ? "bg-amber-500 text-foreground border-amber-500" : "hover:bg-muted/30"}`}>
                <tab.icon size={14} /> {tab.label}
              </button>
            ))}
          </div>
        </div>
        <CalendarStrip year={viewYear} month={viewMonth} records={items} onDayClick={d => setSelectedDay(prev => prev === d ? null : d)} selectedDay={selectedDay} />
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute right-3 top-2.5 text-muted-foreground" size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-9 pl-4 py-2 border rounded-lg text-sm bg-card" />
        </div>
        <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-card">
          <option value="all">כל העובדים</option>
          {employees.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-card">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterShift} onChange={e => setFilterShift(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-card">
          <option value="all">כל המשמרות</option>
          {Object.entries(shiftMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {(filterEmployee !== "all" || filterStatus !== "all" || filterShift !== "all" || search) && (
          <button onClick={() => { setSearch(""); setFilterEmployee("all"); setFilterStatus("all"); setFilterShift("all"); }} className="text-xs text-red-500 border border-red-200 px-2 py-1.5 rounded-lg hover:bg-red-50 flex items-center gap-1">
            <X size={12} /> נקה
          </button>
        )}
        <span className="text-xs text-muted-foreground">{filtered.length} רשומות</span>
      </div>

      <BulkActions selectedIds={bulk.selectedIds} onClear={bulk.clearAll} entityName="רשומות נוכחות" actions={defaultBulkActions} />

      {/* Content */}
      {view === "list" && (
        <>
          <div className="bg-card rounded-2xl shadow-sm border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr>
                  <th className="px-2 py-3 w-10"><BulkCheckbox checked={bulk.isAllSelected(filtered)} indeterminate={bulk.isSomeSelected(filtered)} onChange={() => bulk.toggleAll(filtered)} /></th>
                  {[{ key: "record_number", label: "מספר" }, { key: "employee_name", label: "עובד" }, { key: "attendance_date", label: "תאריך" }, { key: "check_in", label: "כניסה" }, { key: "check_out", label: "יציאה" }, { key: "total_hours", label: "שעות" }, { key: "overtime_hours", label: "נוספות" }, { key: "shift_type", label: "משמרת" }, { key: "late_minutes", label: "איחור" }, { key: "status", label: "סטטוס" }].map(col => (
                    <th key={col.key} className="px-3 py-3 text-right cursor-pointer hover:bg-muted/50 whitespace-nowrap text-xs font-medium text-muted-foreground" onClick={() => toggleSort(col.key)}>
                      <div className="flex items-center gap-1">{col.label} <ArrowUpDown size={10} /></div>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {tableLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      <td colSpan={12} className="px-3 py-3"><div className="h-4 bg-muted/30 rounded animate-pulse" /></td>
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={12}>
                      <EmptyState
                        variant="default"
                        title="אין רשומות נוכחות"
                        description="לא נמצאו רשומות נוכחות לחודש ולסינון הנוכחיים."
                        action={{ label: "רשומה חדשה", onClick: openCreate }}
                        className="py-12"
                      />
                    </td>
                  </tr>
                ) : pagination.paginate(filtered).map(r => (
                  <tr key={r.id} className="border-b hover:bg-amber-50/20 transition-colors">
                    <td className="px-2 py-2.5"><BulkCheckbox checked={bulk.isSelected(r.id)} onChange={() => bulk.toggle(r.id)} /></td>
                    <td className="px-3 py-2.5 font-mono text-amber-500 font-bold text-xs">{r.record_number}</td>
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {r.employee_name}
                        {(r as any).clock_method && r.clock_method !== "manual" && (
                          <span className="text-[10px] text-muted-foreground">{clockMethodMap[r.clock_method]?.label || r.clock_method}</span>
                        )}
                        {r.within_geofence === false && <MapPin size={10} className="text-orange-400" title="מחוץ לאתר" />}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{r.attendance_date?.slice(0, 10)}</td>
                    <td className="px-3 py-2.5 font-mono text-sm">{r.check_in?.slice(0, 5) || "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-sm">{r.check_out?.slice(0, 5) || <span className="text-xs text-green-500 flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />פעיל</span>}</td>
                    <td className="px-3 py-2.5 font-bold text-sm">{Number(r.total_hours || 0).toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-sm">
                      {Number(r.overtime_hours || 0) > 0 ? (
                        <span className="text-orange-500 font-bold">{Number(r.overtime_hours).toFixed(1)}</span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs">{shiftMap[r.shift_type]?.label || r.shift_type}</td>
                    <td className="px-3 py-2.5 text-xs">{Number(r.late_minutes || 0) > 0 ? <span className="text-red-500 font-bold">{r.late_minutes}ד'</span> : "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] flex items-center gap-1 w-fit ${statusMap[r.status]?.color || "bg-muted/50"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusMap[r.status]?.dot}`} />
                        {statusMap[r.status]?.label || r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(r)} className="p-1 hover:bg-blue-500/10 rounded"><Edit2 size={12} /></button><button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/attendance-records`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                        {isSuperAdmin && <button onClick={async () => { if (await globalConfirm(`למחוק? פעולה זו אינה ניתנת לביטול.`)) remove(r.id); }} className="p-1 hover:bg-red-500/10 rounded text-red-500"><Trash2 size={12} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 text-xs text-muted-foreground border-t">{filtered.length} רשומות {selectedDay ? `• יום ${selectedDay}` : ""}</div>
          </div>
          <SmartPagination pagination={pagination} />
        </>
      )}

      {view === "calendar" && <CalendarView year={viewYear} month={viewMonth} records={items} />}
      {view === "reports" && (
        <div className="space-y-4">
          <ReportsPanel items={items} />
          <OvertimeSummaryPanel />
        </div>
      )}

      {/* Add/Edit Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-xl font-bold">{editing ? "עריכת נוכחות" : "רישום נוכחות"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted/50 rounded-lg"><X size={20} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium mb-1">שם עובד *</label><input value={form.employeeName || ""} onChange={e => setForm({ ...form, employeeName: e.target.value })} list="employees-list-form" className="w-full border rounded-lg px-3 py-2 bg-background" /><datalist id="employees-list-form">{employees.map(e => <option key={e} value={e} />)}</datalist></div>
                <div><label className="block text-sm font-medium mb-1">תאריך *</label><input type="date" value={form.attendanceDate || ""} onChange={e => setForm({ ...form, attendanceDate: e.target.value })} className="w-full border rounded-lg px-3 py-2 bg-background" /></div>
                <div><label className="block text-sm font-medium mb-1">סטטוס</label><select value={form.status || "present"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full border rounded-lg px-3 py-2 bg-background">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">שעת כניסה</label><input type="time" value={form.checkIn || ""} onChange={e => setForm({ ...form, checkIn: e.target.value })} className="w-full border rounded-lg px-3 py-2 bg-background" /></div>
                <div><label className="block text-sm font-medium mb-1">שעת יציאה</label><input type="time" value={form.checkOut || ""} onChange={e => setForm({ ...form, checkOut: e.target.value })} className="w-full border rounded-lg px-3 py-2 bg-background" /></div>
                <div><label className="block text-sm font-medium mb-1">סוג משמרת</label><select value={form.shiftType || "morning"} onChange={e => setForm({ ...form, shiftType: e.target.value })} className="w-full border rounded-lg px-3 py-2 bg-background">{Object.entries(shiftMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">מחלקה</label><input value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full border rounded-lg px-3 py-2 bg-background" /></div>
                <div><label className="block text-sm font-medium mb-1">הפסקה (דקות)</label><input type="number" value={form.breakMinutes || ""} onChange={e => setForm({ ...form, breakMinutes: e.target.value })} className="w-full border rounded-lg px-3 py-2 bg-background" /></div>
                <div><label className="block text-sm font-medium mb-1">דקות איחור</label><input type="number" value={form.lateMinutes || ""} onChange={e => setForm({ ...form, lateMinutes: e.target.value })} className="w-full border rounded-lg px-3 py-2 bg-background" /></div>
                <div><label className="block text-sm font-medium mb-1">אישור</label><select value={form.approvalStatus || "pending"} onChange={e => setForm({ ...form, approvalStatus: e.target.value })} className="w-full border rounded-lg px-3 py-2 bg-background">{Object.entries(approvalMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div className="col-span-2"><label className="block text-sm font-medium mb-1">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2 bg-background" /></div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} className="px-5 py-2 bg-amber-500 text-foreground rounded-lg text-sm hover:bg-amber-600 font-medium">
                  <Save size={14} className="inline ml-1" />{editing ? "עדכון" : "שמירה"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
