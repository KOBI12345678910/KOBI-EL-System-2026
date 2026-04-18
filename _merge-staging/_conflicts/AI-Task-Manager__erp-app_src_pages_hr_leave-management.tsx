import { useState, useEffect, useMemo, useCallback } from "react";
import { Calendar, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2, Clock, AlertTriangle, ArrowUpDown, Ban, Users, Eye, ChevronLeft, ChevronRight, BarChart3, Shield, RefreshCw, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
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

interface LeaveRequest {
  id: number; request_number: string; employee_name: string; department: string;
  leave_type: string; start_date: string; end_date: string; total_days: number;
  is_half_day: boolean; reason: string; status: string; approved_by_name: string;
  approved_at: string; rejection_reason: string; substitute_name: string;
  remaining_balance: number; is_paid: boolean; notes: string;
}

const leaveTypeMap: Record<string, { label: string; color: string; bg: string }> = {
  vacation:    { label: "חופשה שנתית", color: "text-blue-400",    bg: "bg-blue-500/20" },
  sick:        { label: "מחלה",         color: "text-red-400",     bg: "bg-red-500/20" },
  personal:    { label: "אישי",          color: "text-purple-400",  bg: "bg-purple-500/20" },
  maternity:   { label: "לידה",          color: "text-pink-400",    bg: "bg-pink-500/20" },
  paternity:   { label: "אבהות",         color: "text-cyan-400",    bg: "bg-cyan-500/20" },
  military:    { label: "מילואים",       color: "text-orange-400",  bg: "bg-orange-500/20" },
  bereavement: { label: "אבל",           color: "text-slate-400",   bg: "bg-slate-500/20" },
  study:       { label: "לימודים",       color: "text-indigo-400",  bg: "bg-indigo-500/20" },
  unpaid:      { label: "ללא תשלום",     color: "text-yellow-400",  bg: "bg-yellow-500/20" },
  other:       { label: "אחר",           color: "text-muted-foreground", bg: "bg-muted/20" },
};

const statusMap: Record<string, { label: string; color: string }> = {
  pending:     { label: "ממתין",  color: "bg-yellow-500/20 text-yellow-400" },
  approved:    { label: "מאושר", color: "bg-green-500/20 text-green-400" },
  rejected:    { label: "נדחה",  color: "bg-red-500/20 text-red-400" },
  cancelled:   { label: "בוטל",  color: "bg-muted/20 text-muted-foreground" },
  in_progress: { label: "בביצוע", color: "bg-blue-500/20 text-blue-400" },
  completed:   { label: "הושלם", color: "bg-emerald-500/20 text-emerald-400" },
};

const HEBREW_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const HEBREW_DAYS = ["א'","ב'","ג'","ד'","ה'","ו'","ש'"];

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return <div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>;
}

// ─── Advanced Balance Panel (using new leave_balances table) ─────────────────
function AdvancedLeaveBalancePanel({ employee }: { employee?: string }) {
  const [balances, setBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [accruing, setAccruing] = useState(false);
  const year = new Date().getFullYear();
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: String(year) });
      if (employee) params.set("employee", employee);
      const r = await authFetch(`${API}/leave-balances-advanced?${params}`, { headers });
      const d = await r.json();
      setBalances(Array.isArray(d) ? d : []);
    } catch {}
    setLoading(false);
  }, [employee, year]);

  const accrue = async (empName: string) => {
    setAccruing(true);
    try {
      await authFetch(`${API}/leave-balances/accrue`, { method: "POST", headers, body: JSON.stringify({ employee_name: empName, year }) });
      await load();
    } catch {}
    setAccruing(false);
  };

  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    balances.forEach(b => {
      if (!map[b.employee_name]) map[b.employee_name] = [];
      map[b.employee_name].push(b);
    });
    return Object.entries(map).slice(0, 10);
  }, [balances]);

  const israeliLeaveTypes = ["vacation", "sick", "military", "personal", "maternity", "paternity", "bereavement"];
  const leaveTypeLabels: Record<string, string> = {
    vacation: "חופשה שנתית", sick: "מחלה", military: "מילואים",
    personal: "אישי", maternity: "לידה", paternity: "אבהות",
    bereavement: "אבל", study: "לימודים", unpaid: "ללא תשלום",
  };
  const leaveTypeColors: Record<string, string> = {
    vacation: "text-blue-400", sick: "text-red-400", military: "text-yellow-400",
    personal: "text-purple-400", maternity: "text-pink-400", paternity: "text-cyan-400",
    bereavement: "text-slate-400", study: "text-indigo-400", unpaid: "text-gray-400",
  };

  if (loading) return <div className="animate-pulse h-32 bg-muted/20 rounded-xl" />;
  if (grouped.length === 0) return (
    <div className="text-center py-8 text-muted-foreground text-sm">
      <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-30" />
      <p>לא נמצאו יתרות חופשה</p>
      <p className="text-xs mt-1">לחץ "צבור" כדי לחשב יתרות עובד</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Shield className="w-4 h-4 text-teal-400" />
        יתרות לפי חוק עבודה ישראלי — שנת {year}
      </div>
      {grouped.map(([empName, empBalances]) => {
        const shownTypes = empBalances.filter(b => israeliLeaveTypes.includes(b.leave_type_code) || b.accrued > 0);
        return (
          <div key={empName} className="bg-card/50 border border-border/40 rounded-xl p-4">
            <div className="flex justify-between items-center mb-3">
              <span className="font-bold text-foreground text-sm">{empName}</span>
              <button onClick={() => accrue(empName)} disabled={accruing}
                className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1 border border-teal-500/30 px-2 py-1 rounded-lg">
                {accruing ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />} צבור
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {shownTypes.map((b: any) => {
                const avail = Math.max(0, parseFloat(b.accrued || 0) + parseFloat(b.carried_over || 0) - parseFloat(b.used || 0) - parseFloat(b.pending || 0));
                const max = parseFloat(b.max_days_per_year || 0);
                const usedPct = max > 0 ? Math.min(100, (parseFloat(b.used || 0) / max) * 100) : 0;
                const isLow = avail <= 2 && max > 0;
                const label = b.leave_type_name || leaveTypeLabels[b.leave_type_code] || b.leave_type_code;
                const color = leaveTypeColors[b.leave_type_code] || "text-muted-foreground";
                return (
                  <div key={b.id || b.leave_type_code} className="bg-muted/20 rounded-xl p-3">
                    <div className={`text-xs font-medium mb-1 ${color}`}>{label}</div>
                    <div className={`text-lg font-bold ${isLow ? "text-red-400" : "text-foreground"}`}>{avail.toFixed(1)}</div>
                    <div className="text-[10px] text-muted-foreground">מתוך {parseFloat(b.accrued || 0).toFixed(0)} ימים</div>
                    {parseFloat(b.pending || 0) > 0 && <div className="text-[10px] text-yellow-400">{parseFloat(b.pending).toFixed(1)} ממתין</div>}
                    {max > 0 && (
                      <div className="w-full h-1 bg-black/30 rounded mt-1.5">
                        <div className={`h-1 rounded ${isLow ? "bg-red-500" : "bg-teal-500"}`} style={{ width: `${usedPct}%` }} />
                      </div>
                    )}
                    {b.is_statutory && <div className="text-[9px] text-teal-500 mt-1">חוקי</div>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="text-[10px] text-muted-foreground">* מבוסס על חוק עבודה ישראלי: חופשה שנתית — לפי ותק, מחלה — 1.5 יום/חודש, מילואים — ללא הגבלה, לידה 26 שבועות.</p>
    </div>
  );
}

// ─── Approval Workflow Panel ──────────────────────────────────────────────────
function ApprovalWorkflowPanel({ requestId, onApprove }: { requestId: number; onApprove: () => void }) {
  const [flow, setFlow] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  useEffect(() => {
    authFetch(`${API}/leave-requests/${requestId}/approval-flow`, { headers })
      .then(r => r.json()).then(d => setFlow(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false));
  }, [requestId]);

  const decide = async (level: number, approved: boolean) => {
    setApproving(true);
    try {
      const res = await authFetch(`${API}/leave-requests/${requestId}/approve`, { method: "POST", headers, body: JSON.stringify({ level, approved }) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert("שגיאה: " + (e.error || e.message || "שגיאת עיבוד")); setApproving(false); return; }
      onApprove();
      const r = await authFetch(`${API}/leave-requests/${requestId}/approval-flow`, { headers });
      setFlow(await r.json());
    } catch (e: any) { alert("שגיאה: " + (e.message || "שגיאת רשת")); }
    setApproving(false);
  };

  if (loading) return <div className="animate-pulse h-16 bg-muted/20 rounded-xl" />;
  if (!flow.length) return <p className="text-xs text-muted-foreground">אין נתוני זרימת אישורים</p>;

  const statusColors: Record<string, string> = { pending: "text-yellow-400", approved: "text-green-400", rejected: "text-red-400" };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">זרימת אישורים ({flow.length} שלבים)</p>
      {flow.map((step, i) => (
        <div key={i} className="flex items-center justify-between bg-muted/20 rounded-xl px-3 py-2">
          <div>
            <div className="text-xs font-medium text-foreground">שלב {step.approval_level} — {step.approver_role}</div>
            {step.approver_name && <div className="text-[10px] text-muted-foreground">מאשר: {step.approver_name}</div>}
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold ${statusColors[step.status] || "text-muted-foreground"}`}>
              {step.status === "pending" ? "ממתין" : step.status === "approved" ? "✓ אושר" : "✗ נדחה"}
            </span>
            {step.status === "pending" && (
              <div className="flex gap-1">
                <button onClick={() => decide(step.approval_level, true)} disabled={approving} className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-[10px] hover:bg-green-500/30">אשר</button>
                <button onClick={() => decide(step.approval_level, false)} disabled={approving} className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-[10px] hover:bg-red-500/30">דחה</button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function LeaveBalancePanel() {
  const [balanceData, setBalanceData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"remaining"|"taken">("remaining");

  useEffect(() => {
    authFetch(`${API}/leave-requests/balance`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { setBalanceData(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Group by employee
  const employees = useMemo(() => {
    const empMap: Record<string, Record<string, { taken: number; remaining: number; entitlement: number; pending: number }>> = {};
    balanceData.forEach((r: any) => {
      if (!empMap[r.employee_name]) empMap[r.employee_name] = {};
      empMap[r.employee_name][r.leave_type] = {
        taken: Number(r.taken_days || 0),
        remaining: Number(r.remaining_days || 0),
        entitlement: Number(r.entitlement_days || 0),
        pending: Number(r.pending_days || 0),
      };
    });
    return Object.entries(empMap).map(([emp, types]) => {
      const totalTaken = Object.values(types).reduce((s, v) => s + v.taken, 0);
      const totalRemaining = Object.values(types).reduce((s, v) => s + v.remaining, 0);
      return { emp, types, totalTaken, totalRemaining };
    }).sort((a, b) => b.totalTaken - a.totalTaken);
  }, [balanceData]);

  const shownLeaveTypes = useMemo(() => {
    const set = new Set<string>();
    balanceData.forEach((r: any) => { if (r.leave_type && leaveTypeMap[r.leave_type]) set.add(r.leave_type); });
    return Array.from(set).sort();
  }, [balanceData]);

  if (loading) return <div className="text-center py-12 text-muted-foreground">טוען...</div>;
  if (employees.length === 0) return (
    <div className="text-center py-10 text-muted-foreground text-sm">
      <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-30" />אין נתוני חופשות לשנה הנוכחית
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1 bg-card border border-border/50 rounded-xl p-1">
          <button onClick={() => setViewMode("remaining")}
            className={`px-3 py-1.5 rounded-lg text-sm ${viewMode === "remaining" ? "bg-emerald-600 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            יתרה
          </button>
          <button onClick={() => setViewMode("taken")}
            className={`px-3 py-1.5 rounded-lg text-sm ${viewMode === "taken" ? "bg-blue-600 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            נוצלו
          </button>
        </div>
        <span className="text-xs text-muted-foreground">{viewMode === "remaining" ? "יתרת ימי חופשה לניצול השנה" : "ימי חופשה שנוצלו השנה"}</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/50">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border/50">
            <tr>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground sticky right-0 bg-muted/30">עובד</th>
              {shownLeaveTypes.map(t => (
                <th key={t} className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground whitespace-nowrap">
                  <div>{leaveTypeMap[t]?.label || t}</div>
                  <div className="text-[9px] opacity-60">זכאות / {viewMode === "remaining" ? "נותר" : "נוצל"}</div>
                </th>
              ))}
              <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground">{viewMode === "remaining" ? "סה\"כ יתרה" : "סה\"כ נוצל"}</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(({ emp, types, totalTaken, totalRemaining }) => (
              <tr key={emp} className="border-b border-border/20 hover:bg-muted/10">
                <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap sticky right-0 bg-card">{emp}</td>
                {shownLeaveTypes.map(t => {
                  const d = types[t];
                  const lt = leaveTypeMap[t];
                  if (!d) return <td key={t} className="px-3 py-2.5 text-center"><span className="text-muted-foreground/30 text-xs">—</span></td>;
                  const displayVal = viewMode === "remaining" ? d.remaining : d.taken;
                  const isLow = viewMode === "remaining" && d.entitlement > 0 && d.remaining <= 2;
                  return (
                    <td key={t} className="px-3 py-2.5 text-center">
                      <div className={`inline-flex flex-col items-center rounded-lg px-2 py-1 ${lt?.bg || "bg-muted/20"}`}>
                        <span className={`text-xs font-bold ${isLow ? "text-red-400" : (lt?.color || "text-foreground")}`}>
                          {displayVal}
                        </span>
                        <span className="text-[9px] text-muted-foreground">מתוך {d.entitlement}</span>
                        {/* Progress bar */}
                        {d.entitlement > 0 && (
                          <div className="w-12 h-1 bg-black/20 rounded mt-0.5">
                            <div
                              className={`h-1 rounded ${viewMode === "remaining" ? (isLow ? "bg-red-500" : "bg-emerald-500") : "bg-blue-500"}`}
                              style={{ width: `${Math.min(100, (displayVal / d.entitlement) * 100)}%` }}
                            />
                          </div>
                        )}
                        {d.pending > 0 && <span className="text-[9px] text-yellow-400 mt-0.5">{d.pending} ממתין</span>}
                      </div>
                    </td>
                  );
                })}
                <td className="px-4 py-2.5 text-center">
                  <span className={`font-bold text-sm ${viewMode === "remaining" ? "text-emerald-400" : "text-blue-400"}`}>
                    {viewMode === "remaining" ? totalRemaining : totalTaken}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" />
        זכאויות מחושבות לפי תקן ישראלי (חופשה שנתית 14 ימים, מחלה 18, אישי 3). ניתן להתאים בהגדרות.
      </div>
    </div>
  );
}

function TeamCalendar({ items }: { items: LeaveRequest[] }) {
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDay = new Date(calYear, calMonth, 1).getDay();

  const approvedInMonth = useMemo(() => {
    return items.filter(r => {
      if (!["approved","in_progress","completed"].includes(r.status)) return false;
      const start = new Date(r.start_date);
      const end = new Date(r.end_date);
      const monthStart = new Date(calYear, calMonth, 1);
      const monthEnd = new Date(calYear, calMonth + 1, 0);
      return start <= monthEnd && end >= monthStart;
    });
  }, [items, calYear, calMonth]);

  const dayLeaves = useMemo(() => {
    const map: Record<number, LeaveRequest[]> = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(calYear, calMonth, d);
      map[d] = approvedInMonth.filter(r => {
        const s = new Date(r.start_date);
        const e = new Date(r.end_date);
        return date >= s && date <= e;
      });
    }
    return map;
  }, [approvedInMonth, daysInMonth, calYear, calMonth]);

  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-muted/50 border border-border/50"><ChevronRight size={16} /></button>
        <span className="font-bold text-foreground text-sm min-w-[140px] text-center">{HEBREW_MONTHS[calMonth]} {calYear}</span>
        <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-muted/50 border border-border/50"><ChevronLeft size={16} /></button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {HEBREW_DAYS.map(d => (
          <div key={d} className="text-center text-xs text-muted-foreground py-1 font-medium">{d}</div>
        ))}
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const leaves = dayLeaves[day] || [];
          const isToday = day === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
          return (
            <div key={day} className={`min-h-[56px] rounded-lg border p-1 text-xs ${isToday ? "border-teal-500/60 bg-teal-500/10" : "border-border/30 bg-card/30"}`}>
              <div className={`font-bold mb-0.5 ${isToday ? "text-teal-400" : "text-muted-foreground"}`}>{day}</div>
              <div className="space-y-0.5">
                {leaves.slice(0, 3).map((r, ri) => {
                  const lt = leaveTypeMap[r.leave_type];
                  return (
                    <div key={ri} className={`truncate rounded px-1 text-[10px] font-medium ${lt?.bg || "bg-muted/20"} ${lt?.color || "text-foreground"}`}>
                      {r.employee_name?.split(" ")[0]}
                    </div>
                  );
                })}
                {leaves.length > 3 && <div className="text-muted-foreground text-[10px]">+{leaves.length - 3}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {approvedInMonth.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {Object.entries(leaveTypeMap).filter(([t]) => approvedInMonth.some(r => r.leave_type === t)).map(([t, lt]) => (
            <span key={t} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${lt.bg} ${lt.color}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />{lt.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LeaveManagementPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<LeaveRequest[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterDept, setFilterDept] = useState("all");
  const [sortField, setSortField] = useState("start_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LeaveRequest | null>(null);
  const [viewDetail, setViewDetail] = useState<LeaveRequest | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const [mainTab, setMainTab] = useState<"list" | "calendar" | "balance">("list");
  const bulk = useBulkSelection();
  const formValidation = useFormValidation({
    employee_name: [{ type: "required", message: "שם עובד נדרש" }],
    leave_type: [{ type: "required", message: "סוג חופשה נדרש" }],
    start_date: [{ type: "required", message: "תאריך התחלה נדרש" }],
    end_date: [{ type: "required", message: "תאריך סיום נדרש" }],
  });
  const pagination = useSmartPagination(25);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [itemsRes, statsRes] = await Promise.all([
        authFetch(`${API}/leave-requests`),
        authFetch(`${API}/leave-requests/stats`),
      ]);
      if (itemsRes.ok) setItems(safeArray(await itemsRes.json()));
      if (statsRes.ok) setStats((await statsRes.json()) || {});
    } catch (e: any) { setError(e.message || "שגיאה בטעינת נתונים"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const departments = useMemo(() => {
    const set = new Set<string>();
    items.forEach(r => { if (r.department) set.add(r.department); });
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (filterType === "all" || i.leave_type === filterType) &&
      (filterDept === "all" || i.department === filterDept) &&
      (!search || [i.request_number, i.employee_name, i.department].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => { const va = a[sortField] ?? ""; const vb = b[sortField] ?? ""; const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he"); return sortDir === "asc" ? cmp : -cmp; });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, filterType, filterDept, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    const today = new Date().toISOString().slice(0, 10);
    setForm({ startDate: today, endDate: today, leaveType: "vacation", status: "pending", totalDays: 1, isPaid: true });
    setShowForm(true);
  };
  const openEdit = (r: LeaveRequest) => {
    setEditing(r);
    setForm({ employeeName: r.employee_name, department: r.department, leaveType: r.leave_type, startDate: r.start_date?.slice(0, 10), endDate: r.end_date?.slice(0, 10), totalDays: r.total_days, isHalfDay: r.is_half_day, reason: r.reason, status: r.status, substituteName: r.substitute_name, remainingBalance: r.remaining_balance, isPaid: r.is_paid, notes: r.notes });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editing) {
        await authFetch(`${API}/leave-requests/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      } else {
        // Route new requests through advanced endpoint to create approval flow automatically
        await authFetch(`${API}/leave-requests-advanced`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      }
      setShowForm(false); load();
    } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק בקשת חופשה? פעולה זו אינה ניתנת לביטול.")) {
      await authFetch(`${API}/leave-requests/${id}`, { method: "DELETE" }); load();
    }
  };

  const quickApprove = async (r: LeaveRequest) => {
    // Route through the workflow approval endpoint (level 1) instead of bypassing it
    const headers = { Authorization: `Bearer ${localStorage.getItem("erp_token") || ""}`, "Content-Type": "application/json" };
    await authFetch(`${API}/leave-requests/${r.id}/approve`, { method: "POST", headers, body: JSON.stringify({ level: 1, approved: true }) });
    load();
  };

  const kpis = [
    { label: "סה\"כ בקשות", value: fmt(stats.total || items.length), icon: Calendar, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "ממתינות לאישור", value: fmt(stats.pending || 0), icon: Clock, color: "text-yellow-400", bg: "bg-yellow-500/10" },
    { label: "מאושרות", value: fmt(stats.approved || 0), icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10" },
    { label: "נדחו", value: fmt(stats.rejected || 0), icon: Ban, color: "text-red-400", bg: "bg-red-500/10" },
    { label: "בביצוע", value: fmt(stats.in_progress || 0), icon: Calendar, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "ימים שנוצלו", value: fmt(stats.total_days_taken || 0), icon: Calendar, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "עובדים", value: fmt(stats.employees_count || 0), icon: Users, color: "text-teal-400", bg: "bg-teal-500/10" },
    { label: "הושלמו", value: fmt(stats.completed || 0), icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  ];

  const columns = [
    { key: "request_number", label: "מספר" }, { key: "employee_name", label: "עובד" },
    { key: "department", label: "מחלקה" }, { key: "leave_type", label: "סוג" },
    { key: "start_date", label: "מתאריך" }, { key: "end_date", label: "עד" },
    { key: "total_days", label: "ימים" }, { key: "substitute_name", label: "מחליף" },
    { key: "is_paid", label: "בתשלום" }, { key: "status", label: "סטטוס" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Calendar className="text-teal-400 w-6 h-6" /> ניהול חופשות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">בקשות חופשה, מחלה, מילואים, אישורים ומעקב יתרות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ request_number: "מספר", employee_name: "עובד", department: "מחלקה", leave_type: "סוג", start_date: "מתאריך", end_date: "עד", total_days: "ימים", status: "סטטוס" }} filename="leave_requests" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-teal-600 text-foreground px-4 py-2.5 rounded-xl hover:bg-teal-700 shadow-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> בקשת חופשה
          </button>
        </div>
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

      {/* Pending approvals quick bar */}
      {items.filter(r => r.status === "pending").length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="text-yellow-400 w-4 h-4" />
            <span className="text-sm font-semibold text-yellow-400">{items.filter(r => r.status === "pending").length} בקשות ממתינות לאישור</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {items.filter(r => r.status === "pending").slice(0, 5).map(r => (
              <div key={r.id} className="flex items-center gap-2 bg-card border border-border/50 rounded-lg px-3 py-1.5">
                <span className="text-sm text-foreground">{r.employee_name}</span>
                <span className="text-xs text-muted-foreground">{leaveTypeMap[r.leave_type]?.label} • {r.total_days} ימים</span>
                <button onClick={() => quickApprove(r)} className="text-xs text-green-400 hover:text-green-300 font-medium px-1.5 py-0.5 rounded bg-green-500/10 hover:bg-green-500/20">
                  אשר
                </button>
                <button onClick={() => setViewDetail(r)} className="text-xs text-blue-400 hover:text-blue-300">
                  <Eye className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 bg-card border border-border/50 rounded-xl p-1 w-fit">
        {[
          { key: "list",     label: "רשימה",    icon: ArrowUpDown },
          { key: "calendar", label: "לוח שנה",  icon: Calendar },
          { key: "balance",  label: "יתרות",    icon: BarChart3 },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setMainTab(key as any)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mainTab === key ? "bg-teal-600 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסוגים</option>{Object.entries(leaveTypeMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל המחלקות</option>{departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      <BulkActions selectedIds={bulk.selectedIds} onClear={bulk.clearAll} entityName="בקשות חופשה" actions={defaultBulkActions} />

      {/* Main content */}
      {mainTab === "calendar" ? (
        <div className="bg-card border border-border/50 rounded-2xl p-4">
          <TeamCalendar items={items} />
        </div>
      ) : mainTab === "balance" ? (
        <div className="space-y-4">
          <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2">
              <Shield className="text-teal-400 w-4 h-4" />
              <span className="font-semibold text-foreground text-sm">יתרות חופשה — חוק עבודה ישראלי</span>
            </div>
            <div className="p-4"><AdvancedLeaveBalancePanel /></div>
          </div>
          <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2">
              <BarChart3 className="text-teal-400 w-4 h-4" />
              <span className="font-semibold text-foreground text-sm">יתרות לפי ניצול (כללי)</span>
            </div>
            <LeaveBalancePanel />
          </div>
        </div>
      ) : loading ? (
        <div className="space-y-2">{Array.from({length:8}).map((_,i)=><div key={i} className="h-12 bg-muted/20 rounded-xl animate-pulse" />)}</div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין בקשות חופשה</p></div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50"><tr>
                <th className="px-2 py-3 w-10"><BulkCheckbox checked={bulk.isAllSelected(filtered)} indeterminate={bulk.isSomeSelected(filtered)} onChange={() => bulk.toggleAll(filtered)} /></th>
                {columns.map(col => (<th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground whitespace-nowrap"><div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div></th>))}
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
              </tr></thead>
              <tbody>
                {pagination.paginate(filtered).map(r => (
                  <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="px-2 py-3"><BulkCheckbox checked={bulk.isSelected(r.id)} onChange={() => bulk.toggle(r.id)} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-teal-400 font-bold">{r.request_number}</td>
                    <td className="px-4 py-3 text-foreground font-medium whitespace-nowrap">{r.employee_name}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{r.department || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${leaveTypeMap[r.leave_type]?.bg} ${leaveTypeMap[r.leave_type]?.color}`}>
                        {leaveTypeMap[r.leave_type]?.label || r.leave_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{r.start_date?.slice(0, 10)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{r.end_date?.slice(0, 10)}</td>
                    <td className="px-4 py-3 font-bold text-foreground">{r.total_days}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.substitute_name || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground">{r.is_paid ? "✓" : "✗"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>{statusMap[r.status]?.label || r.status}</Badge>
                    </td>
                    <td className="px-4 py-3"><div className="flex gap-1">
                      <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                      {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.employee_name || r.id}'?`)) remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <SmartPagination pagination={pagination} />
      </>)}

      {/* Detail Modal */}
      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Calendar className="w-5 h-5 text-teal-400" /> בקשה {viewDetail.request_number}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50 overflow-x-auto">
                {[{key:"details",label:"פרטים"},{key:"approval",label:"אישורים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap ${detailTab === t.key ? "border-teal-500 text-teal-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="מספר בקשה" value={viewDetail.request_number} />
                <DetailField label="עובד" value={viewDetail.employee_name} />
                <DetailField label="מחלקה" value={viewDetail.department} />
                <DetailField label="סוג חופשה">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${leaveTypeMap[viewDetail.leave_type]?.bg} ${leaveTypeMap[viewDetail.leave_type]?.color}`}>
                    {leaveTypeMap[viewDetail.leave_type]?.label || viewDetail.leave_type}
                  </span>
                </DetailField>
                <DetailField label="מתאריך" value={viewDetail.start_date?.slice(0, 10)} />
                <DetailField label="עד תאריך" value={viewDetail.end_date?.slice(0, 10)} />
                <DetailField label="ימים" value={String(viewDetail.total_days)} />
                <DetailField label="בתשלום" value={viewDetail.is_paid ? "כן" : "לא"} />
                <DetailField label="מחליף" value={viewDetail.substitute_name} />
                <DetailField label="מאשר" value={viewDetail.approved_by_name} />
                <DetailField label="סטטוס">
                  <StatusTransition
                    currentStatus={viewDetail.status}
                    statusMap={{"pending":"ממתין","approved":"מאושר","rejected":"נדחה","cancelled":"בוטל","in_progress":"בביצוע","completed":"הושלם"}}
                    transitions={{"pending":["approved","rejected"],"approved":["in_progress","cancelled"],"in_progress":["completed"]}}
                    onTransition={async (newStatus) => {
                      await authFetch(`${API}/leave-requests/${viewDetail.id}`, { method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify({status: newStatus}) });
                      load();
                    }}
                  />
                </DetailField>
                <div className="col-span-2"><DetailField label="סיבה" value={viewDetail.reason} /></div>
                <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
              </div>}
              {detailTab === "approval" && <div className="p-5"><ApprovalWorkflowPanel requestId={viewDetail.id} onApprove={load} /></div>}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="leave-requests" entityId={viewDetail.id} relations={[{key:"employees",label:"עובדים",icon:"Users"}]} /></div>}
              {detailTab === "docs" && <div className="p-5"><AttachmentsSection entityType="leave-requests" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="leave-requests" entityId={viewDetail.id} /></div>}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30"><Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה</button>
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת בקשה" : "בקשת חופשה חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">שם עובד <RequiredMark /></label>
                    <input value={form.employeeName || ""} onChange={e => setForm({ ...form, employeeName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                    <FormFieldError errors={formValidation.errors} field="employee_name" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">מחלקה</label>
                    <input value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג חופשה <RequiredMark /></label>
                    <select value={form.leaveType || "vacation"} onChange={e => setForm({ ...form, leaveType: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(leaveTypeMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                    <select value={form.status || "pending"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">מתאריך <RequiredMark /></label>
                    <input type="date" value={form.startDate || ""} onChange={e => setForm({ ...form, startDate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">עד תאריך <RequiredMark /></label>
                    <input type="date" value={form.endDate || ""} onChange={e => setForm({ ...form, endDate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">מספר ימים</label>
                    <input type="number" step="0.5" value={form.totalDays || ""} onChange={e => setForm({ ...form, totalDays: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">מחליף</label>
                    <input value={form.substituteName || ""} onChange={e => setForm({ ...form, substituteName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <input type="checkbox" id="isPaid" checked={!!form.isPaid} onChange={e => setForm({ ...form, isPaid: e.target.checked })} className="rounded" />
                    <label htmlFor="isPaid" className="text-sm text-muted-foreground">חופשה בתשלום</label>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">סיבה</label>
                    <textarea value={form.reason || ""} onChange={e => setForm({ ...form, reason: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label>
                    <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving} className="px-6 py-2 bg-teal-600 text-foreground rounded-lg text-sm hover:bg-teal-700 disabled:opacity-50">
                  <Save className="w-3.5 h-3.5 inline ml-1" /> {editing ? "עדכון" : "שמירה"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
