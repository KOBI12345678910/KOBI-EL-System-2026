import { useState, useEffect } from "react";
import { translateStatus } from "@/lib/status-labels";
import { UserPlus, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2, Clock, AlertTriangle, Users, Calendar, Star , Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { Download, Printer } from "lucide-react";
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
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

function safeArray(d: any) { return Array.isArray(d) ? d : []; }

const CATEGORIES = ["מסמכים", "הדרכה", "ציוד", "מערכות IT", "הרשאות", "בטיחות", "היכרות", "חניכה", "רגולציה", "אחר"];
const STATUSES = ["ממתין", "בתהליך", "הושלם", "בוטל"];
const PRIORITIES = ["נמוך", "רגיל", "גבוה", "דחוף"];

export default function OnboardingPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [detailTab, setDetailTab] = useState("details");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const bulk = useBulkSelection();
  const formValidation = useFormValidation({
    employee_name: [{ type: "required", message: "שם עובד נדרש" }],
    task_name: [{ type: "required", message: "שם משימה נדרש" }],
    task_category: [{ type: "required", message: "קטגוריה נדרשת" }],
  });
  const token = localStorage.getItem("erp_token") || "";
  const headers: any = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const [tableLoading, setTableLoading] = useState(true);
  const pagination = useSmartPagination(25);
  const { executeSave, executeDelete, execute, loading: actionLoading } = useApiAction();

  const load = () => {
    setTableLoading(true);
    Promise.all([
      authFetch(`${API}/onboarding-tasks`, { headers }).then(r => r.json()).then(d => setItems(safeArray(d))).catch(() => {}),
      authFetch(`${API}/onboarding-tasks/stats`, { headers }).then(r => r.json()).then(d => setStats(d || {})).catch(() => {})
    ]).finally(() => setTableLoading(false));
  };
  useEffect(load, []);

  const save = async () => { const url = editing ? `${API}/onboarding-tasks/${editing.id}` : `${API}/onboarding-tasks`; await executeSave(url, editing ? "PUT" : "POST", form, editing ? "עודכן בהצלחה" : "נוצר בהצלחה", () => { setShowForm(false); setEditing(null); setForm({}); load(); }); };

  const remove = async (id: number) => { await executeDelete(`${API}/onboarding-tasks/${id}`, "למחוק משימת קליטה?", () => { load(); }); };

  const openEdit = (item: any) => { setEditing(item); setForm({ ...item }); setShowForm(true); };
  const openNew = () => { setEditing(null); setForm({ status: "ממתין", task_category: "הדרכה", priority: "רגיל" }); setShowForm(true); };

  const filtered = items.filter(i => {
    if (search && !JSON.stringify(i).includes(search)) return false;
    if (filterStatus && i.status !== filterStatus) return false;
    if (filterCategory && i.task_category !== filterCategory) return false;
    return true;
  });

  const statusColor = (s: string) => {
    if (s === "הושלם") return "bg-green-500/20 text-green-400";
    if (s === "בתהליך") return "bg-blue-500/20 text-blue-400";
    if (s === "ממתין") return "bg-yellow-500/20 text-yellow-400";
    return "bg-muted/20 text-muted-foreground";
  };

  const priorityColor = (p: string) => {
    if (p === "דחוף") return "bg-red-500/20 text-red-400";
    if (p === "גבוה") return "bg-orange-500/20 text-orange-400";
    return "";
  };

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><UserPlus className="text-primary" /> קליטת עובדים</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול משימות קליטה והכשרה של עובדים חדשים</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{}} filename="onboarding-tasks" buttonClassName="btn-ghost text-xs flex items-center gap-1" compact />
          <button onClick={() => window.print()} className="btn-ghost text-xs flex items-center gap-1"><Printer size={14} /> הדפסה</button>
          <button onClick={openNew} className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg text-sm flex items-center gap-2"><Plus size={16} /> משימת קליטה חדשה</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "סה\"כ", value: stats.total || 0, icon: Users, color: "text-blue-400" },
          { label: "הושלמו", value: stats.completed || 0, icon: CheckCircle2, color: "text-green-400" },
          { label: "בתהליך", value: stats.in_progress || 0, icon: Clock, color: "text-yellow-400" },
          { label: "ממתינות", value: stats.pending || 0, icon: Calendar, color: "text-orange-400" },
          { label: "באיחור", value: stats.overdue || 0, icon: AlertTriangle, color: "text-red-400" },
        ].map((s, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 text-center">
            <s.icon className={`mx-auto mb-1 ${s.color}`} size={20} />
            <div className="text-lg sm:text-2xl font-bold">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-10 pl-4 py-2 bg-card border border-border rounded-lg text-sm" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-lg px-3 py-2 text-sm">
          <option value="">כל הסטטוסים</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="bg-card border border-border rounded-lg px-3 py-2 text-sm">
          <option value="">כל הקטגוריות</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <BulkActions selectedIds={bulk.selectedIds} onClear={bulk.clearAll} entityName="משימות קליטה" actions={defaultBulkActions} />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-right p-3 w-10"><BulkCheckbox checked={bulk.isAllSelected(filtered)} indeterminate={bulk.isSomeSelected(filtered)} onChange={() => bulk.toggleAll(filtered)} /></th>
              <th className="text-right p-3">עובד</th>
              <th className="text-right p-3">מחלקה</th>
              <th className="text-right p-3">משימה</th>
              <th className="text-right p-3">קטגוריה</th>
              <th className="text-right p-3">עדיפות</th>
              <th className="text-right p-3">אחראי</th>
              <th className="text-right p-3">חונך</th>
              <th className="text-right p-3">תאריך יעד</th>
              <th className="text-right p-3">שעות</th>
              <th className="text-right p-3">סטטוס</th>
              <th className="text-right p-3">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {pagination.paginate(filtered).map(item => (
              <tr key={item.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="p-3"><BulkCheckbox checked={bulk.isSelected(item.id)} onChange={() => bulk.toggle(item.id)} /></td>
                <td className="p-3 font-medium">{item.employee_name}</td>
                <td className="p-3 text-xs">{item.department || "-"}</td>
                <td className="p-3">{item.task_title}</td>
                <td className="p-3 text-xs">{item.task_category}</td>
                <td className="p-3">{item.priority ? <span className={`px-2 py-0.5 rounded-full text-xs ${priorityColor(item.priority)}`}>{item.priority}</span> : "-"}</td>
                <td className="p-3">{item.assigned_to}</td>
                <td className="p-3 text-xs">{item.mentor_name || "-"}</td>
                <td className="p-3 text-xs">{item.due_date ? new Date(item.due_date).toLocaleDateString("he-IL") : "-"}</td>
                <td className="p-3 text-xs">{item.estimated_hours ? `${item.estimated_hours}ש` : "-"}</td>
                <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs ${statusColor(item.status)}`}>{translateStatus(item.status)}</span></td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(item)} className="p-1.5 hover:bg-muted rounded"><Edit2 size={14} /></button>
                    {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${item.employee_name || item.id}'? פעולה זו אינה ניתנת לביטול.`))remove(item.id)}} className="p-1.5 hover:bg-red-500/20 rounded text-red-400"><Trash2 size={14} /></button>}
                    <button onClick={() => setViewDetail(item)} className="p-1.5 hover:bg-muted rounded text-muted-foreground"><CheckCircle2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={12} className="text-center p-8 text-muted-foreground">אין משימות קליטה</td></tr>}
          </tbody>
        </table>
      </div>
      <SmartPagination pagination={pagination} />

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold flex items-center gap-2"><UserPlus className="text-primary w-5 h-5" /> {viewDetail.task_title}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X size={20} /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && <div className="p-5 grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">עובד:</span> <span className="font-medium">{viewDetail.employee_name}</span></div>
                <div><span className="text-muted-foreground">מחלקה:</span> <span className="font-medium">{viewDetail.department || "-"}</span></div>
                <div><span className="text-muted-foreground">משימה:</span> <span className="font-medium">{viewDetail.task_title}</span></div>
                <div><span className="text-muted-foreground">קטגוריה:</span> <span className="font-medium">{viewDetail.task_category}</span></div>
                <div><span className="text-muted-foreground">אחראי:</span> <span className="font-medium">{viewDetail.assigned_to || "-"}</span></div>
                <div><span className="text-muted-foreground">חונך:</span> <span className="font-medium">{viewDetail.mentor_name || "-"}</span></div>
                <div><span className="text-muted-foreground">תאריך יעד:</span> <span className="font-medium">{viewDetail.due_date ? new Date(viewDetail.due_date).toLocaleDateString("he-IL") : "-"}</span></div>
                <div><span className="text-muted-foreground">סטטוס:</span> <StatusTransition currentStatus={viewDetail.status} statusMap={{"ממתין":"ממתין","בתהליך":"בתהליך","הושלם":"הושלם","בוטל":"בוטל"}} transitions={{"ממתין":["בתהליך","בוטל"],"בתהליך":["הושלם","בוטל"]}} onTransition={async (s) => { await authFetch(`${API}/onboarding-tasks/${viewDetail.id}`, { method: "PUT", headers, body: JSON.stringify({status: s}) }); load(); }} /></div>
                {viewDetail.description && <div className="col-span-2"><span className="text-muted-foreground">תיאור:</span> <span className="font-medium">{viewDetail.description}</span></div>}
                {viewDetail.notes && <div className="col-span-2"><span className="text-muted-foreground">הערות:</span> <span className="font-medium">{viewDetail.notes}</span></div>}
              </div>}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="onboarding-tasks" entityId={viewDetail.id} relations={[{key:"tasks",label:"משימות",icon:"CheckCircle2"},{key:"documents",label:"מסמכים",icon:"FileText"}]} /></div>}
              {detailTab === "docs" && <div className="p-5"><AttachmentsSection entityType="onboarding-tasks" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="onboarding-tasks" entityId={viewDetail.id} /></div>}
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">{editing ? "עריכת משימת קליטה" : "משימת קליטה חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded"><X size={20} /></button>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="text-xs text-muted-foreground">שם עובד</label><input value={form.employee_name || ""} onChange={e => setForm({ ...form, employee_name: e.target.value })} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground">מחלקה</label><input value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="text-xs text-muted-foreground">תפקיד</label><input value={form.position || ""} onChange={e => setForm({ ...form, position: e.target.value })} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground">כותרת משימה</label><input value={form.task_title || ""} onChange={e => setForm({ ...form, task_title: e.target.value })} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div><label className="text-xs text-muted-foreground">קטגוריה</label><select value={form.task_category || ""} onChange={e => setForm({ ...form, task_category: e.target.value })} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm">{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                  <div><label className="text-xs text-muted-foreground">עדיפות</label><select value={form.priority || "רגיל"} onChange={e => setForm({ ...form, priority: e.target.value })} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm">{PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                  <div><label className="text-xs text-muted-foreground">סטטוס</label><select value={form.status || "ממתין"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm">{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div><label className="text-xs text-muted-foreground">אחראי</label><input value={form.assigned_to || ""} onChange={e => setForm({ ...form, assigned_to: e.target.value })} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground">חונך</label><input value={form.mentor_name || ""} onChange={e => setForm({ ...form, mentor_name: e.target.value })} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground">תאריך יעד</label><input type="date" value={form.due_date || ""} onChange={e => setForm({ ...form, due_date: e.target.value })} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div><label className="text-xs text-muted-foreground">שעות מוערכות</label><input type="number" step="0.5" value={form.estimated_hours || ""} onChange={e => setForm({ ...form, estimated_hours: e.target.value })} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground">שעות בפועל</label><input type="number" step="0.5" value={form.actual_hours || ""} onChange={e => setForm({ ...form, actual_hours: e.target.value })} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" /></div>
                  <div className="flex items-end gap-2 pb-1"><label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={form.requires_signature || false} onChange={e => setForm({ ...form, requires_signature: e.target.checked })} className="rounded" /> דורש חתימה</label></div>
                </div>
                <div><label className="text-xs text-muted-foreground">תיאור</label><textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="text-xs text-muted-foreground">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div className="flex gap-2 mt-6">
                <button onClick={save} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg py-2 flex items-center justify-center gap-2"><Save size={16} /> שמירה</button>
                <button onClick={() => setShowForm(false)} className="px-6 py-2 border border-border rounded-lg hover:bg-muted">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}