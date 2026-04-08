import { useState, useEffect, useMemo } from "react";
import { GraduationCap, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2, Clock, AlertTriangle, ArrowUpDown, Users, DollarSign, Star, Eye } from "lucide-react";
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

interface TrainingRecord { id: number; training_number: string; training_name: string; training_type: string; category: string; description: string; trainer_name: string; trainer_type: string; location: string; start_date: string; end_date: string; duration_hours: number; max_participants: number; current_participants: number; target_audience: string; department: string; cost_per_person: number; total_cost: number; currency: string; is_mandatory: boolean; is_certification: boolean; certification_name: string; status: string; satisfaction_score: number; pass_rate: number; notes: string; }

const typeMap: Record<string, string> = { internal: "פנימי", external: "חיצוני", online: "מקוון", workshop: "סדנה", seminar: "סמינר", certification: "הסמכה", safety: "בטיחות", onboarding: "קליטה" };
const statusMap: Record<string, { label: string; color: string }> = { planned: { label: "מתוכנן", color: "bg-blue-500/20 text-blue-400" }, registration_open: { label: "הרשמה פתוחה", color: "bg-indigo-500/20 text-indigo-400" }, in_progress: { label: "בביצוע", color: "bg-yellow-500/20 text-yellow-400" }, completed: { label: "הושלם", color: "bg-green-500/20 text-green-400" }, cancelled: { label: "בוטל", color: "bg-muted/20 text-muted-foreground" }, postponed: { label: "נדחה", color: "bg-orange-500/20 text-orange-400" } };

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return <div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>;
}

export default function TrainingPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<TrainingRecord[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortField, setSortField] = useState("start_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TrainingRecord | null>(null);
  const [viewDetail, setViewDetail] = useState<TrainingRecord | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const bulk = useBulkSelection();
  const formValidation = useFormValidation({
    training_name: [{ type: "required", message: "שם הכשרה נדרש" }],
    trainer_name: [{ type: "required", message: "שם מדריך נדרש" }],
    start_date: [{ type: "required", message: "תאריך התחלה נדרש" }],
  });
  const pagination = useSmartPagination(25);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [itemsRes, statsRes] = await Promise.all([
        authFetch(`${API}/training-records`), authFetch(`${API}/training-records/stats`),
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
      (filterType === "all" || i.training_type === filterType) &&
      (!search || [i.training_number, i.training_name, i.trainer_name].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => { const va = a[sortField] ?? ""; const vb = b[sortField] ?? ""; const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he"); return sortDir === "asc" ? cmp : -cmp; });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, filterType, sortField, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ startDate: new Date().toISOString().slice(0, 10), trainingType: "internal", status: "planned", currency: "ILS", maxParticipants: 20 }); setShowForm(true); };
  const openEdit = (r: TrainingRecord) => { setEditing(r); setForm({ trainingName: r.training_name, trainingType: r.training_type, category: r.category, description: r.description, trainerName: r.trainer_name, trainerType: r.trainer_type, location: r.location, startDate: r.start_date?.slice(0, 10), endDate: r.end_date?.slice(0, 10), durationHours: r.duration_hours, maxParticipants: r.max_participants, currentParticipants: r.current_participants, targetAudience: r.target_audience, department: r.department, costPerPerson: r.cost_per_person, totalCost: r.total_cost, isMandatory: r.is_mandatory, isCertification: r.is_certification, certificationName: r.certification_name, status: r.status, satisfactionScore: r.satisfaction_score, passRate: r.pass_rate, notes: r.notes }); setShowForm(true); };

  const save = async () => {
    if (!form.trainingName) { alert("שדה חובה: שם ההדרכה"); return; }
    setSaving(true);
    try {
      const url = editing ? `${API}/training-records/${editing.id}` : `${API}/training-records`;
      const res = await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה")); setSaving(false); return; }
      setShowForm(false); load();
    } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק הדרכה זו?")) { await authFetch(`${API}/training-records/${id}`, { method: "DELETE" }); load(); }
  };

  const kpis = [
    { label: "סה\"כ הדרכות", value: fmt(stats.total || items.length), icon: GraduationCap, color: "text-violet-400" },
    { label: "מתוכננות", value: fmt(stats.planned || 0), icon: Clock, color: "text-blue-400" },
    { label: "בביצוע", value: fmt(stats.in_progress || 0), icon: Users, color: "text-yellow-400" },
    { label: "הושלמו", value: fmt(stats.completed || 0), icon: CheckCircle2, color: "text-green-400" },
    { label: "חובה", value: fmt(stats.mandatory || 0), icon: AlertTriangle, color: "text-red-400" },
    { label: "שביעות רצון", value: `${Number(stats.avg_satisfaction || 0).toFixed(1)}/5`, icon: Star, color: "text-amber-400" },
  ];

  const columns = [
    { key: "training_number", label: "מספר" }, { key: "training_name", label: "שם הדרכה" }, { key: "training_type", label: "סוג" },
    { key: "trainer_name", label: "מדריך" }, { key: "start_date", label: "תאריך" }, { key: "duration_hours", label: "שעות" },
    { key: "current_participants", label: "משתתפים" }, { key: "total_cost", label: "עלות" }, { key: "status", label: "סטטוס" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><GraduationCap className="text-violet-400 w-6 h-6" /> הדרכות ופיתוח</h1>
          <p className="text-sm text-muted-foreground mt-1">תכנון הדרכות, הסמכות, מעקב השתתפות ושביעות רצון</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ training_number: "מספר", training_name: "שם", training_type: "סוג", trainer_name: "מדריך", start_date: "תאריך", duration_hours: "שעות", total_cost: "עלות", status: "סטטוס" }} filename="training_records" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> הדרכה חדשה</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} /><div className="text-xl font-bold text-foreground">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסוגים</option>{Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      <BulkActions selectedIds={bulk.selectedIds} onClear={bulk.clearAll} entityName="הדרכות" actions={defaultBulkActions} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין הדרכות</p></div>
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
                  <td className="px-4 py-3 font-mono text-xs text-violet-400 font-bold">{r.training_number}</td>
                  <td className="px-4 py-3 text-foreground font-medium max-w-[200px] truncate">{r.training_name}{r.is_mandatory && <span className="text-red-400 mr-1 text-xs">*חובה</span>}</td>
                  <td className="px-4 py-3 text-muted-foreground">{typeMap[r.training_type] || r.training_type}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.trainer_name || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{r.start_date?.slice(0, 10)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.duration_hours}h</td>
                  <td className="px-4 py-3 text-foreground">{r.current_participants}/{r.max_participants}</td>
                  <td className="px-4 py-3 text-muted-foreground">₪{fmt(r.total_cost)}</td>
                  <td className="px-4 py-3"><Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>{statusMap[r.status]?.label || r.status}</Badge></td>
                  <td className="px-4 py-3"><div className="flex gap-1">
                    <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                    {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.training_name || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
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
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><GraduationCap className="w-5 h-5 text-violet-400" /> {viewDetail.training_name}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="מספר" value={viewDetail.training_number} />
                <DetailField label="סוג" value={typeMap[viewDetail.training_type] || viewDetail.training_type} />
                <DetailField label="מדריך" value={viewDetail.trainer_name} />
                <DetailField label="מיקום" value={viewDetail.location} />
                <DetailField label="תאריך התחלה" value={viewDetail.start_date?.slice(0, 10)} />
                <DetailField label="תאריך סיום" value={viewDetail.end_date?.slice(0, 10)} />
                <DetailField label="שעות" value={String(viewDetail.duration_hours)} />
                <DetailField label="משתתפים" value={`${viewDetail.current_participants}/${viewDetail.max_participants}`} />
                <DetailField label="עלות כוללת" value={`₪${fmt(viewDetail.total_cost)}`} />
                <DetailField label="סטטוס"><StatusTransition currentStatus={viewDetail.status} statusMap={{"planned":"מתוכנן","registration_open":"הרשמה פתוחה","in_progress":"בביצוע","completed":"הושלם","cancelled":"בוטל","postponed":"נדחה"}} transitions={{"planned":["registration_open","cancelled"],"registration_open":["in_progress","postponed","cancelled"],"in_progress":["completed"],"postponed":["registration_open","cancelled"]}} onTransition={async (s) => { await authFetch(`${API}/training-records/${viewDetail.id}`, { method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify({status: s}) }); load(); }} /></DetailField>
                <DetailField label="שביעות רצון" value={viewDetail.satisfaction_score ? `${viewDetail.satisfaction_score}/5` : undefined} />
                <DetailField label="חובה" value={viewDetail.is_mandatory ? "כן" : "לא"} />
                <div className="col-span-2"><DetailField label="תיאור" value={viewDetail.description} /></div>
                <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
              </div>}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="training-records" entityId={viewDetail.id} relations={[{key:"employees",label:"עובדים",icon:"Users"},{key:"courses",label:"קורסים",icon:"BookOpen"}]} /></div>}
              {detailTab === "docs" && <div className="p-5"><AttachmentsSection entityType="training-records" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="training-records" entityId={viewDetail.id} /></div>}
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
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת הדרכה" : "הדרכה חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4"><div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">שם הדרכה *</label><input value={form.trainingName || ""} onChange={e => setForm({ ...form, trainingName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג</label><select value={form.trainingType || "internal"} onChange={e => setForm({ ...form, trainingType: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מדריך</label><input value={form.trainerName || ""} onChange={e => setForm({ ...form, trainerName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מיקום</label><input value={form.location || ""} onChange={e => setForm({ ...form, location: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך *</label><input type="date" value={form.startDate || ""} onChange={e => setForm({ ...form, startDate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">שעות</label><input type="number" step="0.5" value={form.durationHours || ""} onChange={e => setForm({ ...form, durationHours: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מקסימום משתתפים</label><input type="number" value={form.maxParticipants || ""} onChange={e => setForm({ ...form, maxParticipants: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">עלות כוללת (₪)</label><input type="number" step="0.01" value={form.totalCost || ""} onChange={e => setForm({ ...form, totalCost: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label><select value={form.status || "planned"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div className="flex items-center gap-4 col-span-2">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isMandatory || false} onChange={e => setForm({ ...form, isMandatory: e.target.checked })} className="rounded" /> חובה</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isCertification || false} onChange={e => setForm({ ...form, isCertification: e.target.checked })} className="rounded" /> הסמכה</label>
                </div>
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
