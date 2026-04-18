import { useState, useEffect, useMemo } from "react";
import { CalendarDays, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2, Clock, AlertTriangle, ArrowUpDown, Users, Sun, Moon, Sunset, Eye } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
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
  return <div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-white font-medium">{value || "—"}</div>}</div>;
}

export default function ShiftsPage() {
  const [items, setItems] = useState<ShiftAssignment[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
    { key: "assignment_number", label: "מספר" }, { key: "employee_name", label: "עובד" }, { key: "shift_date", label: "תאריך" },
    { key: "shift_type", label: "סוג" }, { key: "start_time", label: "התחלה" }, { key: "end_time", label: "סיום" },
    { key: "department", label: "מחלקה" }, { key: "status", label: "סטטוס" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-white flex items-center gap-2"><CalendarDays className="text-purple-400 w-6 h-6" /> ניהול משמרות</h1>
          <p className="text-sm text-muted-foreground mt-1">שיבוץ עובדים, סוגי משמרות, החלפות, מעקב נוכחות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ assignment_number: "מספר", employee_name: "עובד", shift_date: "תאריך", shift_type: "סוג", start_time: "התחלה", end_time: "סיום", department: "מחלקה", status: "סטטוס" }} filename="shifts" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> שיבוץ חדש</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} /><div className="text-xl font-bold text-white">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש עובד, מחלקה..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select value={filterShift} onChange={e => setFilterShift(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסוגים</option>{Object.entries(shiftTypeMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      <BulkActions selectedIds={bulk.selectedIds} onClear={bulk.clearAll} entityName="משמרות" actions={defaultBulkActions} />

      {loading ? (
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
                  <td className="px-4 py-3 font-mono text-xs text-purple-400 font-bold">{r.assignment_number}</td>
                  <td className="px-4 py-3 text-white font-medium">{r.employee_name}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{r.shift_date?.slice(0, 10)}</td>
                  <td className="px-4 py-3"><Badge className={`text-[10px] ${shiftTypeMap[r.shift_type]?.color || "bg-muted/20 text-muted-foreground"}`}>{shiftTypeMap[r.shift_type]?.label || r.shift_type}</Badge></td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{r.start_time?.slice(0, 5) || "—"}</td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{r.end_time?.slice(0, 5) || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.department || "—"}</td>
                  <td className="px-4 py-3"><Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>{statusMap[r.status]?.label || r.status}</Badge></td>
                  <td className="px-4 py-3"><div className="flex gap-1">
                    <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                    <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.employee_name || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
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
                <h2 className="text-lg font-bold text-white flex items-center gap-2"><CalendarDays className="w-5 h-5 text-purple-400" /> משמרת {viewDetail.assignment_number}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-white"}`}>{t.label}</button>
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
                <h2 className="text-lg font-bold text-white">{editing ? "עריכת שיבוץ" : "שיבוץ משמרת חדש"}</h2>
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
