import { useState, useEffect, useMemo, useCallback } from "react";
import { CalendarDays, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2, Clock, AlertTriangle, ArrowUpDown, Users, Sun, Moon, Sunset, Eye, Copy, RefreshCw, Shuffle } from "lucide-react";
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

interface ShiftAssignment { id: number; assignment_number: string; employee_name: string; employee_id_ref: number; shift_date: string; shift_type: string; start_time: string; end_time: string; actual_start: string; actual_end: string; department: string; location: string; position: string; status: string; break_minutes: number; is_holiday: boolean; is_overtime: boolean; swap_with: string; swap_status: string; approved_by: string; notes: string; }

const shiftTypeMap: Record<string, { label: string; color: string }> = { morning: { label: "בוקר", color: "bg-yellow-500/20 text-yellow-400" }, afternoon: { label: "צהריים", color: "bg-orange-500/20 text-orange-400" }, evening: { label: "ערב", color: "bg-indigo-500/20 text-indigo-400" }, night: { label: "לילה", color: "bg-muted/20 text-muted-foreground" }, full_day: { label: "יום מלא", color: "bg-blue-500/20 text-blue-400" } };
const statusMap: Record<string, { label: string; color: string }> = { scheduled: { label: "מתוכנן", color: "bg-blue-500/20 text-blue-400" }, confirmed: { label: "מאושר", color: "bg-green-500/20 text-green-400" }, completed: { label: "הושלם", color: "bg-emerald-500/20 text-emerald-400" }, cancelled: { label: "בוטל", color: "bg-red-500/20 text-red-400" }, no_show: { label: "לא הגיע", color: "bg-red-500/20 text-red-400" }, swap_pending: { label: "ממתין להחלפה", color: "bg-orange-500/20 text-orange-400" } };

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return <div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>;
}

// ─── Shift Templates Panel ─────────────────────────────────────────────────
function ShiftTemplatesPanel({ onScheduleGenerated }: { onScheduleGenerated: () => void }) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showGenerate, setShowGenerate] = useState<any>(null);
  const [genEmployees, setGenEmployees] = useState("");
  const [genWeek, setGenWeek] = useState(() => new Date().toISOString().slice(0, 10));
  const [form, setForm] = useState<any>({ name: "", shift_type: "morning", start_time: "08:00", end_time: "16:00", break_minutes: 30 });
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authFetch(`${API}/shift-templates`, { headers });
      const d = await r.json();
      setTemplates(Array.isArray(d) ? d : []);
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const createTemplate = async () => {
    try { await authFetch(`${API}/shift-templates`, { method: "POST", headers, body: JSON.stringify(form) }); setShowCreate(false); setForm({ name: "", shift_type: "morning", start_time: "08:00", end_time: "16:00", break_minutes: 30 }); await load(); } catch {}
  };

  const generateSchedule = async (templateId: number) => {
    const employees = genEmployees.split(/[,\n]/).map(e => e.trim()).filter(Boolean);
    if (!employees.length) { alert("הזן שמות עובדים"); return; }
    try {
      await authFetch(`${API}/shift-templates/${templateId}/generate-schedule`, { method: "POST", headers, body: JSON.stringify({ employees, week_start: genWeek }) });
      setShowGenerate(null); onScheduleGenerated();
    } catch {}
  };

  const shiftColors: Record<string, string> = { morning: "text-yellow-400 bg-yellow-500/10", afternoon: "text-orange-400 bg-orange-500/10", evening: "text-indigo-400 bg-indigo-500/10", night: "text-blue-400 bg-blue-500/10", full_day: "text-green-400 bg-green-500/10" };
  const shiftLabels: Record<string, string> = { morning: "בוקר", afternoon: "צהריים", evening: "ערב", night: "לילה", full_day: "יום מלא" };

  return (
    <div className="bg-card border border-border/50 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-foreground flex items-center gap-2"><Copy className="text-purple-400" size={16} /> תבניות משמרת</h3>
        <button onClick={() => setShowCreate(!showCreate)} className="text-xs text-purple-400 border border-purple-500/30 px-2 py-1 rounded-lg hover:bg-purple-500/10 flex items-center gap-1">
          <Plus size={12} /> תבנית חדשה
        </button>
      </div>

      {showCreate && (
        <div className="bg-muted/20 rounded-xl p-3 space-y-2 border border-border/40">
          <div className="grid grid-cols-2 gap-2">
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="שם תבנית" className="col-span-2 bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <select value={form.shift_type} onChange={e => setForm({ ...form, shift_type: e.target.value })} className="bg-background border border-border rounded-lg px-3 py-2 text-sm">
              {Object.entries(shiftLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input type="number" value={form.break_minutes} onChange={e => setForm({ ...form, break_minutes: parseInt(e.target.value) })} placeholder="הפסקה דק'" className="bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} className="bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} className="bg-background border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={createTemplate} className="px-3 py-1.5 bg-purple-600 text-foreground rounded-lg text-xs hover:bg-purple-700">שמור</button>
            <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 bg-muted text-muted-foreground rounded-lg text-xs">ביטול</button>
          </div>
        </div>
      )}

      {loading ? <div className="animate-pulse h-16 bg-muted/20 rounded-xl" /> : templates.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">אין תבניות משמרת. צור תבנית ראשונה.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {templates.map(t => (
            <div key={t.id} className="border border-border/30 rounded-xl p-3 flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-foreground">{t.name}</div>
                <div className={`text-[10px] px-1.5 rounded mt-0.5 w-fit ${shiftColors[t.shift_type] || "text-muted-foreground bg-muted/20"}`}>{shiftLabels[t.shift_type] || t.shift_type}</div>
                {t.start_time && <div className="text-[10px] text-muted-foreground">{t.start_time}–{t.end_time} | {t.break_minutes}ד' הפסקה</div>}
              </div>
              <button onClick={() => setShowGenerate(t)} className="text-[10px] text-purple-400 border border-purple-500/30 px-2 py-1 rounded-lg hover:bg-purple-500/10 whitespace-nowrap">
                <RefreshCw size={10} className="inline ml-1" /> יצור לוח
              </button>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showGenerate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-foreground">יצירת לוח ממשמרת: {showGenerate.name}</h3>
                <button onClick={() => setShowGenerate(null)}><X size={18} /></button>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">תאריך תחילת שבוע</label>
                <input type="date" value={genWeek} onChange={e => setGenWeek(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">שמות עובדים (שורה / פסיק)</label>
                <textarea value={genEmployees} onChange={e => setGenEmployees(e.target.value)} rows={3} placeholder="ישראל ישראלי&#10;יוסי כהן" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => generateSchedule(showGenerate.id)} className="flex-1 py-2 bg-purple-600 text-foreground rounded-lg text-sm hover:bg-purple-700">יצור שיבוצים</button>
                <button onClick={() => setShowGenerate(null)} className="px-3 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Swap Requests Panel ──────────────────────────────────────────────────────
function SwapRequestsPanel({ onSwapApproved }: { onSwapApproved: () => void }) {
  const [swaps, setSwaps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<any>({ requester_name: "", requester_shift_id: "", target_name: "", target_shift_id: "", swap_date: new Date().toISOString().slice(0, 10), reason: "" });
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const loadSwaps = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authFetch(`${API}/shift-swap-requests`, { headers });
      const d = await r.json();
      setSwaps(Array.isArray(d) ? d : []);
    } catch {
      setSwaps([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadSwaps(); }, [loadSwaps]);

  const createSwap = async () => {
    try { await authFetch(`${API}/shift-swap-requests`, { method: "POST", headers, body: JSON.stringify(form) }); setShowCreate(false); await loadSwaps(); } catch {}
  };

  const approveSwap = async (id: number, approved: boolean) => {
    try {
      await authFetch(`${API}/shift-swap-requests/${id}/approve`, { method: "PUT", headers, body: JSON.stringify({ approved }) });
      await loadSwaps(); onSwapApproved();
    } catch {}
  };

  const pendingSwaps = swaps.filter(s => s.status === "pending");
  const recentSwaps = swaps.filter(s => s.status !== "pending").slice(0, 5);
  const statusColors: Record<string, string> = { pending: "text-yellow-400", approved: "text-green-400", rejected: "text-red-400" };

  return (
    <div className="bg-card border border-border/50 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-foreground flex items-center gap-2"><Shuffle className="text-blue-400" size={16} /> בקשות החלפת משמרת</h3>
        <button onClick={() => setShowCreate(!showCreate)} className="text-xs text-blue-400 border border-blue-500/30 px-2 py-1 rounded-lg hover:bg-blue-500/10 flex items-center gap-1">
          <Plus size={12} /> בקשה חדשה
        </button>
      </div>

      {showCreate && (
        <div className="bg-muted/20 rounded-xl p-3 space-y-2 border border-border/40">
          <div className="grid grid-cols-2 gap-2">
            <input value={form.requester_name} onChange={e => setForm({ ...form, requester_name: e.target.value })} placeholder="מבקש החלפה (שם)" className="bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <input value={form.target_name} onChange={e => setForm({ ...form, target_name: e.target.value })} placeholder="יעד ההחלפה (שם)" className="bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <input type="number" value={form.requester_shift_id} onChange={e => setForm({ ...form, requester_shift_id: e.target.value ? parseInt(e.target.value) : "" })} placeholder="מזהה משמרת מבקש (ID)" className="bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <input type="number" value={form.target_shift_id} onChange={e => setForm({ ...form, target_shift_id: e.target.value ? parseInt(e.target.value) : "" })} placeholder="מזהה משמרת יעד (ID)" className="bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <input type="date" value={form.swap_date} onChange={e => setForm({ ...form, swap_date: e.target.value })} className="bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="סיבה" className="bg-background border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <p className="text-[10px] text-muted-foreground">ניתן למצוא את מזהה המשמרת בטבלת המשמרות</p>
          <div className="flex gap-2">
            <button onClick={createSwap} className="px-3 py-1.5 bg-blue-600 text-foreground rounded-lg text-xs hover:bg-blue-700">שמור</button>
            <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 bg-muted text-muted-foreground rounded-lg text-xs">ביטול</button>
          </div>
        </div>
      )}

      {loading ? <div className="animate-pulse h-12 bg-muted/20 rounded-xl" /> : (
        <>
          {pendingSwaps.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">ממתינות לאישור ({pendingSwaps.length})</p>
              <div className="space-y-2">
                {pendingSwaps.map(s => (
                  <div key={s.id} className="flex items-center justify-between bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-3 py-2">
                    <div>
                      <div className="text-xs font-medium text-foreground">{s.requester_name} ↔ {s.target_name || "—"}</div>
                      <div className="text-[10px] text-muted-foreground">{s.swap_date?.slice(0, 10)} {s.reason && `• ${s.reason}`}</div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => approveSwap(s.id, true)} className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-[10px] hover:bg-green-500/30">אשר</button>
                      <button onClick={() => approveSwap(s.id, false)} className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-[10px] hover:bg-red-500/30">דחה</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {recentSwaps.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">אחרונות</p>
              <div className="space-y-1">
                {recentSwaps.map(s => (
                  <div key={s.id} className="flex items-center justify-between text-xs px-2 py-1">
                    <span className="text-muted-foreground">{s.requester_name} ↔ {s.target_name || "—"} <span className="text-muted-foreground/50">{s.swap_date?.slice(0, 10)}</span></span>
                    <span className={statusColors[s.status] || "text-muted-foreground"}>{s.status === "approved" ? "✓ אושר" : s.status === "rejected" ? "✗ נדחה" : s.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {pendingSwaps.length === 0 && recentSwaps.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">אין בקשות החלפה</p>
          )}
        </>
      )}
    </div>
  );
}

// ─── Weekly Calendar View ──────────────────────────────────────────────────
function WeeklyCalendarView({ items, onShiftClick, onAddShift }: {
  items: ShiftAssignment[];
  onShiftClick: (s: ShiftAssignment) => void;
  onAddShift: (date: string) => void;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const today = new Date();

  const weekStart = useMemo(() => {
    const d = new Date(today);
    d.setDate(today.getDate() - today.getDay() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const dates = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    }), [weekStart]);

  const employees = useMemo(() =>
    [...new Set(items.map(s => s.employee_name).filter(Boolean))].sort(),
    [items]);

  // Build lookup: employee → date → shifts[]
  const byEmpDate = useMemo(() => {
    const map: Record<string, Record<string, ShiftAssignment[]>> = {};
    for (const emp of employees) {
      map[emp] = {};
      for (const d of dates) map[emp][d.toISOString().slice(0, 10)] = [];
    }
    const rangeStart = dates[0].toISOString().slice(0, 10);
    const rangeEnd = dates[6].toISOString().slice(0, 10);
    for (const s of items) {
      const ds = s.shift_date?.slice(0, 10);
      if (!ds || ds < rangeStart || ds > rangeEnd) continue;
      if (!s.employee_name) continue;
      if (!map[s.employee_name]) map[s.employee_name] = {};
      if (!map[s.employee_name][ds]) map[s.employee_name][ds] = [];
      map[s.employee_name][ds].push(s);
    }
    return map;
  }, [items, dates, employees]);

  const dayNames = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];
  const shiftColors: Record<string, string> = {
    morning: "bg-yellow-500/20 border-yellow-500/40 text-yellow-300",
    afternoon: "bg-orange-500/20 border-orange-500/40 text-orange-300",
    evening: "bg-indigo-500/20 border-indigo-500/40 text-indigo-300",
    night: "bg-blue-900/40 border-blue-700/40 text-blue-300",
    full_day: "bg-green-500/20 border-green-500/40 text-green-300",
  };
  const shiftLabels: Record<string, string> = { morning: "בוקר", afternoon: "צהריים", evening: "ערב", night: "לילה", full_day: "יום" };

  return (
    <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setWeekOffset(o => o - 1)} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
          </button>
          <span className="text-sm font-medium text-foreground">
            {dates[0].toLocaleDateString("he-IL", { day: "numeric", month: "long" })} — {dates[6].toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}
          </span>
          <button onClick={() => setWeekOffset(o => o + 1)} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
          </button>
          <button onClick={() => setWeekOffset(0)} className="text-xs text-muted-foreground hover:text-foreground border border-border/50 rounded px-2 py-0.5">היום</button>
        </div>
        <span className="text-xs text-muted-foreground">{employees.length} עובדים</span>
      </div>
      <div className="overflow-auto max-h-[600px]">
        <table className="w-full text-xs border-collapse min-w-[700px]">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
            <tr>
              <th className="px-3 py-2 text-right text-muted-foreground font-medium border-b border-border/50 w-28">עובד</th>
              {dates.map((d, i) => {
                const isToday = d.toISOString().slice(0, 10) === today.toISOString().slice(0, 10);
                const isFriday = d.getDay() === 5;
                const isSat = d.getDay() === 6;
                return (
                  <th key={i} className={`px-2 py-2 text-center font-medium border-b border-r border-border/30 ${isToday ? "text-teal-400" : isSat || isFriday ? "text-orange-400/70" : "text-muted-foreground"}`}>
                    <div>{dayNames[d.getDay()]}</div>
                    <div className={`text-sm font-bold ${isToday ? "text-teal-300" : "text-foreground"}`}>{d.getDate()}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">אין משמרות לשבוע זה</td></tr>
            )}
            {employees.map(emp => (
              <tr key={emp} className="border-b border-border/20 hover:bg-muted/10">
                <td className="px-3 py-2 font-medium text-foreground border-r border-border/30 sticky right-0 bg-card text-xs">{emp}</td>
                {dates.map((d, i) => {
                  const ds = d.toISOString().slice(0, 10);
                  const shifts = byEmpDate[emp]?.[ds] || [];
                  const isSat = d.getDay() === 6;
                  const isFriday = d.getDay() === 5;
                  return (
                    <td key={i} className={`px-1 py-1 border-r border-border/20 align-top min-w-[90px] cursor-pointer hover:bg-muted/20 ${isSat || isFriday ? "bg-orange-500/3" : ""}`}
                      onClick={() => shifts.length === 0 && onAddShift(ds)}>
                      {shifts.length > 0 ? (
                        <div className="space-y-1">
                          {shifts.map(s => (
                            <div key={s.id} onClick={e => { e.stopPropagation(); onShiftClick(s); }}
                              className={`border rounded px-1.5 py-1 cursor-pointer hover:opacity-80 transition-opacity ${shiftColors[s.shift_type] || "bg-muted/20 border-border text-muted-foreground"}`}>
                              <div className="font-medium">{shiftLabels[s.shift_type] || s.shift_type}</div>
                              {s.start_time && <div className="opacity-70">{s.start_time.slice(0,5)}-{s.end_time?.slice(0,5)}</div>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center text-muted-foreground/30 text-lg py-2 hover:text-muted-foreground/60">+</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ShiftsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<ShiftAssignment[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "calendar">("calendar");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterShift, setFilterShift] = useState("all");
  const [sortField, setSortField] = useState("shift_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ShiftAssignment | null>(null);
  const [viewDetail, setViewDetail] = useState<ShiftAssignment | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const bulk = useBulkSelection();
  const formValidation = useFormValidation({
    employee_name: [{ type: "required", message: "שם עובד נדרש" }],
    shift_date: [{ type: "required", message: "תאריך משמרת נדרש" }],
    shift_type: [{ type: "required", message: "סוג משמרת נדרש" }],
  });
  const pagination = useSmartPagination(25);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [itemsRes, statsRes] = await Promise.all([
        authFetch(`${API}/shift-assignments`), authFetch(`${API}/shift-assignments/stats`),
      ]);
      if (itemsRes.ok) setItems(safeArray(await itemsRes.json()));
      if (statsRes.ok) setStats((await statsRes.json()) || {});
    } catch (e: any) { setError(e.message || "שגיאה"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (filterShift === "all" || i.shift_type === filterShift) &&
      (!search || [i.assignment_number, i.employee_name, i.department, i.position].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => { const va = a[sortField] ?? ""; const vb = b[sortField] ?? ""; const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he"); return sortDir === "asc" ? cmp : -cmp; });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, filterShift, sortField, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ shiftDate: new Date().toISOString().slice(0, 10), shiftType: "morning", status: "scheduled", startTime: "08:00", endTime: "16:00", breakMinutes: 30 }); setShowForm(true); };
  const openEdit = (r: ShiftAssignment) => { setEditing(r); setForm({ employeeName: r.employee_name, shiftDate: r.shift_date?.slice(0, 10), shiftType: r.shift_type, startTime: r.start_time?.slice(0, 5), endTime: r.end_time?.slice(0, 5), actualStart: r.actual_start?.slice(0, 5), actualEnd: r.actual_end?.slice(0, 5), department: r.department, location: r.location, position: r.position, status: r.status, breakMinutes: r.break_minutes, isHoliday: r.is_holiday, isOvertime: r.is_overtime, swapWith: r.swap_with, approvedBy: r.approved_by, notes: r.notes }); setShowForm(true); };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/shift-assignments/${editing.id}` : `${API}/shift-assignments`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
    } catch {} setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק שיבוץ זה?")) { await authFetch(`${API}/shift-assignments/${id}`, { method: "DELETE" }); load(); }
  };

  const kpis = [
    { label: "סה\"כ משמרות", value: fmt(stats.total || items.length), icon: CalendarDays, color: "text-blue-400" },
    { label: "מתוכננות", value: fmt(stats.scheduled || 0), icon: Clock, color: "text-blue-400" },
    { label: "מאושרות", value: fmt(stats.confirmed || 0), icon: CheckCircle2, color: "text-green-400" },
    { label: "הושלמו", value: fmt(stats.completed || 0), icon: CheckCircle2, color: "text-emerald-400" },
    { label: "היום", value: fmt(stats.today || 0), icon: Sun, color: "text-yellow-400" },
    { label: "לא הגיעו", value: fmt(stats.no_show || 0), icon: AlertTriangle, color: "text-red-400" },
  ];

  const columns = [
    { key: "id", label: "ID" }, { key: "assignment_number", label: "מספר" }, { key: "employee_name", label: "עובד" }, { key: "shift_date", label: "תאריך" },
    { key: "shift_type", label: "סוג" }, { key: "start_time", label: "התחלה" }, { key: "end_time", label: "סיום" },
    { key: "department", label: "מחלקה" }, { key: "status", label: "סטטוס" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><CalendarDays className="text-purple-400 w-6 h-6" /> ניהול משמרות</h1>
          <p className="text-sm text-muted-foreground mt-1">שיבוץ עובדים, סוגי משמרות, החלפות, מעקב נוכחות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex border border-border rounded-xl overflow-hidden text-sm">
            <button onClick={() => setViewMode("calendar")} className={`px-3 py-2 flex items-center gap-1 ${viewMode === "calendar" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}>
              <CalendarDays className="w-3.5 h-3.5" /> לוח שבועי
            </button>
            <button onClick={() => setViewMode("table")} className={`px-3 py-2 flex items-center gap-1 ${viewMode === "table" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}>
              <ArrowUpDown className="w-3.5 h-3.5" /> טבלה
            </button>
          </div>
          <ExportDropdown data={filtered} headers={{ assignment_number: "מספר", employee_name: "עובד", shift_date: "תאריך", shift_type: "סוג", start_time: "התחלה", end_time: "סיום", department: "מחלקה", status: "סטטוס" }} filename="shifts" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> שיבוץ חדש</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} /><div className="text-xl font-bold text-foreground">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Templates & Swap Requests panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ShiftTemplatesPanel onScheduleGenerated={load} />
        <SwapRequestsPanel onSwapApproved={load} />
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש עובד, מחלקה..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select value={filterShift} onChange={e => setFilterShift(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסוגים</option>{Object.entries(shiftTypeMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      <BulkActions selectedIds={bulk.selectedIds} onClear={bulk.clearAll} entityName="משמרות" actions={defaultBulkActions} />

      {viewMode === "calendar" ? (
        loading ? (
          <div className="h-64 bg-card border border-border/50 rounded-2xl animate-pulse" />
        ) : (
          <WeeklyCalendarView
            items={items}
            onShiftClick={s => { setViewDetail(s); setDetailTab("details"); }}
            onAddShift={date => { openCreate(); setForm((f: any) => ({ ...f, shift_date: date })); }}
          />
        )
      ) : loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין שיבוצי משמרות</p></div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50"><tr>
              <th className="px-2 py-3 w-10"><BulkCheckbox checked={bulk.isAllSelected(filtered)} indeterminate={bulk.isSomeSelected(filtered)} onChange={() => bulk.toggleAll(filtered)} /></th>
              {columns.map(col => (<th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div></th>))}
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
            </tr></thead>
            <tbody>
              {pagination.paginate(filtered).map(r => (
                <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                  <td className="px-2 py-3"><BulkCheckbox checked={bulk.isSelected(r.id)} onChange={() => bulk.toggle(r.id)} /></td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground/70">#{r.id}</td>
                  <td className="px-4 py-3 font-mono text-xs text-purple-400 font-bold">{r.assignment_number}</td>
                  <td className="px-4 py-3 text-foreground font-medium">{r.employee_name}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{r.shift_date?.slice(0, 10)}</td>
                  <td className="px-4 py-3"><Badge className={`text-[10px] ${shiftTypeMap[r.shift_type]?.color || "bg-muted/20 text-muted-foreground"}`}>{shiftTypeMap[r.shift_type]?.label || r.shift_type}</Badge></td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{r.start_time?.slice(0, 5) || "—"}</td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{r.end_time?.slice(0, 5) || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.department || "—"}</td>
                  <td className="px-4 py-3"><Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>{statusMap[r.status]?.label || r.status}</Badge></td>
                  <td className="px-4 py-3"><div className="flex gap-1">
                    <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                    {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.employee_name || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
        <SmartPagination pagination={pagination} />
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><CalendarDays className="w-5 h-5 text-purple-400" /> משמרת {viewDetail.assignment_number}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="מספר שיבוץ" value={viewDetail.assignment_number} />
                <DetailField label="עובד" value={viewDetail.employee_name} />
                <DetailField label="תאריך" value={viewDetail.shift_date?.slice(0, 10)} />
                <DetailField label="סוג משמרת"><Badge className={shiftTypeMap[viewDetail.shift_type]?.color}>{shiftTypeMap[viewDetail.shift_type]?.label}</Badge></DetailField>
                <DetailField label="שעת התחלה" value={viewDetail.start_time?.slice(0, 5)} />
                <DetailField label="שעת סיום" value={viewDetail.end_time?.slice(0, 5)} />
                <DetailField label="כניסה בפועל" value={viewDetail.actual_start?.slice(0, 5)} />
                <DetailField label="יציאה בפועל" value={viewDetail.actual_end?.slice(0, 5)} />
                <DetailField label="מחלקה" value={viewDetail.department} />
                <DetailField label="מיקום" value={viewDetail.location} />
                <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label}</Badge></DetailField>
                <DetailField label="הפסקה (דקות)" value={String(viewDetail.break_minutes || 0)} />
                <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
              </div>}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="shift-assignments" entityId={viewDetail.id} relations={[{key:"employees",label:"עובדים",icon:"Users"},{key:"departments",label:"מחלקות",icon:"Building2"}]} /></div>}
              {detailTab === "docs" && <div className="p-5"><AttachmentsSection entityType="shift-assignments" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="shift-assignments" entityId={viewDetail.id} /></div>}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30"><Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה</button>
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת שיבוץ" : "שיבוץ משמרת חדש"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4"><div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">שם עובד *</label><input value={form.employeeName || ""} onChange={e => setForm({ ...form, employeeName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך *</label><input type="date" value={form.shiftDate || ""} onChange={e => setForm({ ...form, shiftDate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג משמרת</label><select value={form.shiftType || "morning"} onChange={e => setForm({ ...form, shiftType: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(shiftTypeMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">שעת התחלה</label><input type="time" value={form.startTime || ""} onChange={e => setForm({ ...form, startTime: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">שעת סיום</label><input type="time" value={form.endTime || ""} onChange={e => setForm({ ...form, endTime: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מחלקה</label><input value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label><select value={form.status || "scheduled"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              </div></div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving} className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50"><Save className="w-3.5 h-3.5 inline ml-1" /> {editing ? "עדכון" : "שמירה"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
