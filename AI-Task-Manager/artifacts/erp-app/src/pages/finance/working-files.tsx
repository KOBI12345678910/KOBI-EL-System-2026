import { useState, useEffect, useMemo } from "react";
import {
  FolderOpen, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2,
  Clock, AlertTriangle, ArrowUpDown, Eye, Hash, FileText
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { authFetch } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

interface WorkingFile {
  id: number; file_number: string; file_name: string; file_type: string;
  fiscal_year: string; accountant: string; reviewer: string; status: string;
  priority: string; due_date: string; description: string; notes: string;
  created_at?: string;
}

const statusMap: Record<string, { label: string; color: string }> = {
  completed: { label: "הושלם", color: "bg-green-500/20 text-green-400" },
  in_progress: { label: "בביצוע", color: "bg-blue-500/20 text-blue-400" },
  pending: { label: "ממתין", color: "bg-yellow-500/20 text-yellow-400" },
  review: { label: "בבדיקה", color: "bg-purple-500/20 text-purple-400" },
};
const priorityMap: Record<string, { label: string; color: string }> = {
  low: { label: "נמוך", color: "bg-muted/20 text-muted-foreground" },
  normal: { label: "רגיל", color: "bg-blue-500/20 text-blue-400" },
  high: { label: "גבוה", color: "bg-orange-500/20 text-orange-400" },
  urgent: { label: "דחוף", color: "bg-red-500/20 text-red-400" },
};
const fileTypeMap: Record<string, string> = {
  working_paper: "נייר עבודה", audit_file: "קובץ ביקורת",
  tax_file: "קובץ מס", report: "דוח",
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

export default function WorkingFilesPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<WorkingFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<WorkingFile | null>(null);
  const [viewDetail, setViewDetail] = useState<WorkingFile | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const [detailTab, setDetailTab] = useState("details");

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`${API}/working-files`);
      if (res.ok) setItems(safeArray(await res.json()));
      else setError("שגיאה בטעינת נתונים");
    } catch (e: any) { setError(e.message || "שגיאה"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (filterPriority === "all" || i.priority === filterPriority) &&
      (!search || [i.file_number, i.file_name, i.accountant]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "", vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [items, search, filterStatus, filterPriority, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ fileType: "working_paper", fiscalYear: String(new Date().getFullYear()), status: "in_progress", priority: "normal" });
    setShowForm(true);
  };
  const openEdit = (r: WorkingFile) => {
    setEditing(r);
    setForm({ fileName: r.file_name, fileType: r.file_type, fiscalYear: r.fiscal_year, accountant: r.accountant, reviewer: r.reviewer, status: r.status, priority: r.priority, dueDate: r.due_date?.slice(0, 10), description: r.description, notes: r.notes });
    setShowForm(true);
  };
  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/working-files/${editing.id}` : `${API}/working-files`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
    } catch {}
    setSaving(false);
  };
  const remove = async (id: number) => {
    if (await globalConfirm("למחוק קובץ עבודה?")) {
      await authFetch(`${API}/working-files/${id}`, { method: "DELETE" }); load();
    }
  };

  const kpis = [
    { label: "סה\"כ קבצים", value: fmt(items.length), icon: Hash, color: "text-teal-400" },
    { label: "בביצוע", value: fmt(items.filter(i => i.status === "in_progress").length), icon: Clock, color: "text-blue-400" },
    { label: "ממתינים", value: fmt(items.filter(i => i.status === "pending").length), icon: AlertTriangle, color: "text-yellow-400" },
    { label: "בבדיקה", value: fmt(items.filter(i => i.status === "review").length), icon: FileText, color: "text-purple-400" },
    { label: "הושלמו", value: fmt(items.filter(i => i.status === "completed").length), icon: CheckCircle2, color: "text-green-400" },
    { label: "דחופים", value: fmt(items.filter(i => i.priority === "urgent").length), icon: AlertTriangle, color: "text-red-400" },
  ];

  const columns = [
    { key: "file_number", label: "מספר" }, { key: "file_name", label: "שם הקובץ" },
    { key: "fiscal_year", label: "שנה" }, { key: "accountant", label: "רואה חשבון" },
    { key: "due_date", label: "תאריך יעד" }, { key: "priority", label: "עדיפות" },
    { key: "status", label: "סטטוס" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><FolderOpen className="text-teal-400 w-6 h-6" /> ניירות עבודה</h1>
          <p className="text-sm text-muted-foreground mt-1">Working Files — ניהול ניירות עבודה חשבונאיים</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ file_number: "מספר", file_name: "שם", fiscal_year: "שנה", accountant: "רו\"ח", due_date: "יעד", priority: "עדיפות", status: "סטטוס" }} filename="working_files" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> קובץ חדש</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi, i) => (<motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4"><kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} /><div className="text-xl font-bold text-foreground">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div></motion.div>))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל העדיפויות</option>{Object.entries(priorityMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {loading ? (<div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (<div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (<div className="text-center py-16 text-muted-foreground"><FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>אין ניירות עבודה</p></div>
      ) : (<>
        <BulkActions selectedIds={selectedIds} onClear={clear} entityName="items" actions={defaultBulkActions(selectedIds, clear, load, `${API}/working-files`)} />
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border/50"><tr><th className="px-4 py-3 w-10"><BulkCheckbox checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered.map(r => r.id))} /></th>
                  {columns.map(col => (<th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div></th>))}<th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th></tr></thead>
          <tbody>{pagination.paginate(filtered).map(r => (
            <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
              <td className="px-4 py-3 w-10"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
              <td className="px-4 py-3 font-mono text-xs text-teal-400">{r.file_number}</td>
              <td className="px-4 py-3 text-foreground font-medium">{r.file_name}</td>
              <td className="px-4 py-3 text-muted-foreground">{r.fiscal_year}</td>
              <td className="px-4 py-3 text-muted-foreground">{r.accountant || "—"}</td>
              <td className="px-4 py-3 text-muted-foreground text-xs">{r.due_date ? r.due_date.slice(0, 10) : "—"}</td>
              <td className="px-4 py-3"><Badge className={`text-[10px] ${priorityMap[r.priority]?.color || "bg-muted/20 text-muted-foreground"}`}>{priorityMap[r.priority]?.label || r.priority}</Badge></td>
              <td className="px-4 py-3"><Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>{statusMap[r.status]?.label || r.status}</Badge></td>
              <td className="px-4 py-3"><div className="flex gap-1">
                <button onClick={() => { setDetailTab("details"); setViewDetail(r); }} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.file_name || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
              </div></td>
            </tr>
          ))}</tbody></table></div></div>
        <SmartPagination pagination={pagination} />
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground flex items-center gap-2"><FolderOpen className="w-5 h-5 text-teal-400" /> {viewDetail.file_name}</h2><button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>

                <div className="flex gap-1 p-3 border-b border-border bg-muted/20">
                  {[
                    { id: "details", label: "פרטים" },
                    { id: "related", label: "רשומות קשורות" },
                    { id: "attachments", label: "מסמכים" },
                    { id: "activity", label: "היסטוריה" },
                  ].map(tab => (
                    <button key={tab.id} onClick={() => setDetailTab(tab.id)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${detailTab === tab.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>
                  ))}
                </div>
              {detailTab === "details" ? (
                            <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="מספר" value={viewDetail.file_number} /><DetailField label="שם" value={viewDetail.file_name} />
                <DetailField label="סוג" value={fileTypeMap[viewDetail.file_type] || viewDetail.file_type} /><DetailField label="שנת כספים" value={viewDetail.fiscal_year} />
                <DetailField label="רואה חשבון" value={viewDetail.accountant} /><DetailField label="מבקר" value={viewDetail.reviewer} />
                <DetailField label="תאריך יעד" value={viewDetail.due_date?.slice(0, 10)} />
                <DetailField label="עדיפות"><Badge className={priorityMap[viewDetail.priority]?.color}>{priorityMap[viewDetail.priority]?.label || viewDetail.priority}</Badge></DetailField>
                <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge></DetailField>
                <div className="col-span-2"><DetailField label="תיאור" value={viewDetail.description} /></div>
                <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
              </div>
                            ) : detailTab === "related" ? (
                <div className="p-5"><RelatedRecords entityType="working-files" entityId={viewDetail?.id} /></div>
                ) : detailTab === "attachments" ? (
                <div className="p-5"><AttachmentsSection entityType="working-files" entityId={viewDetail?.id} /></div>
                ) : (
                <div className="p-5"><ActivityLog entityType="working-files" entityId={viewDetail?.id} /></div>
                )}
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
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת קובץ עבודה" : "קובץ עבודה חדש"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 space-y-4"><div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">שם הקובץ *</label><input value={form.fileName || ""} onChange={e => setForm({ ...form, fileName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג</label><select value={form.fileType || "working_paper"} onChange={e => setForm({ ...form, fileType: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(fileTypeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">שנת כספים</label><input type="number" value={form.fiscalYear || ""} onChange={e => setForm({ ...form, fiscalYear: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">רואה חשבון</label><input value={form.accountant || ""} onChange={e => setForm({ ...form, accountant: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מבקר</label><input value={form.reviewer || ""} onChange={e => setForm({ ...form, reviewer: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label><select value={form.status || "in_progress"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">עדיפות</label><select value={form.priority || "normal"} onChange={e => setForm({ ...form, priority: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(priorityMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך יעד</label><input type="date" value={form.dueDate || ""} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              </div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור</label><textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              </div>
              <div className="p-5 border-t border-border flex gap-3">
                <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl hover:bg-primary/90 text-sm font-medium disabled:opacity-50"><Save className="w-4 h-4" /> {saving ? "שומר..." : editing ? "עדכון" : "שמירה"}</button>
                <button onClick={() => setShowForm(false)} className="px-6 py-2.5 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
