import { useState, useEffect, useRef } from "react";
import { useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { FolderKanban, Plus, Search, Download, Edit2, Trash2, Eye, X, TrendingUp, DollarSign, Users, Clock, Filter, Copy } from "lucide-react";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import { toast } from "@/hooks/use-toast";
import { translateStatus } from "@/lib/status-labels";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || d?.rows || []);

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "on-hold": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
  cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "text-muted-foreground",
  medium: "text-blue-400",
  high: "text-orange-400",
  critical: "text-red-400",
};

export default function ProjectsDashboard() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [detailTab, setDetailTab] = useState("details");
  const qc = useQueryClient();
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const { errors, validate, clearErrors } = useFormValidation<any>({
    name: { required: true, minLength: 2, message: "שם פרויקט חובה" },
  });
  const searchStr = useSearch();
  const deepLinkHandledId = useRef<string | null>(null);

  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["projects-module"],
    queryFn: async () => { const r = await authFetch(`${API}/projects-module`); const d = await r.json(); return safeArray(d); },
  });

  const { data: tasks = [] } = useQuery<any[]>({
    queryKey: ["project-tasks"],
    queryFn: async () => { const r = await authFetch(`${API}/project-tasks`); const d = await r.json(); return safeArray(d); },
  });

  const saveMut = useMutation({
    mutationFn: async (data: any) => {
      const url = editing ? `${API}/projects-module/${editing.id}` : `${API}/projects-module`;
      const r = await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects-module"] }); setShowForm(false); setEditing(null); setForm({}); },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => { await authFetch(`${API}/projects-module/${id}`, { method: "DELETE" }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects-module"] }),
  });

  const projectsList = Array.isArray(projects) ? projects : [];
  const tasksList = Array.isArray(tasks) ? tasks : [];

  useEffect(() => {
    if (!searchStr || projectsList.length === 0) return;
    const params = new URLSearchParams(searchStr);
    const idParam = params.get("id");
    if (!idParam || deepLinkHandledId.current === idParam) return;
    const target = projectsList.find((p: any) => String(p.id) === idParam);
    if (target) {
      deepLinkHandledId.current = idParam;
      setViewDetail(target);
      setDetailTab("details");
    }
  }, [projectsList, searchStr]);

  const filtered = projectsList.filter((p: any) => {
    if (search && !p.name?.toLowerCase().includes(search.toLowerCase()) && !p.client?.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter && p.status !== statusFilter) return false;
    return true;
  });

  const activeCount = projectsList.filter((p: any) => p.status === "active").length;
  const totalBudget = projectsList.reduce((s: number, p: any) => s + parseFloat(p.budget || "0"), 0);
  const totalSpent = projectsList.reduce((s: number, p: any) => s + parseFloat(p.spent || "0"), 0);
  const tasksDueSoon = tasksList.filter((t: any) => t.status !== "done" && t.dueDate).length;

  const openForm = (item?: any) => {
    if (item) { setEditing(item); setForm({ ...item }); }
    else { setEditing(null); setForm({ name: "", description: "", client: "", status: "planning", startDate: "", endDate: "", owner: "", budget: "", spent: "0", priority: "medium", tags: "" }); }
    setShowForm(true);
  };

  const exportCSV = () => {
    const headers = ["Name", "Client", "Status", "Priority", "Budget", "Spent", "Start Date", "End Date"];
    const rows = filtered.map((p: any) => [p.name, p.client, p.status, p.priority, p.budget, p.spent, p.startDate, p.endDate].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "projects.csv"; a.click();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FolderKanban className="text-blue-400" size={28} />
          <h1 className="text-lg sm:text-2xl font-bold text-foreground">דשבורד פרויקטים</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted text-foreground rounded-lg text-sm"><Download size={16} />ייצוא</button>
          <button onClick={() => openForm()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm"><Plus size={16} />פרויקט חדש</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "פרויקטים פעילים", value: activeCount, icon: FolderKanban, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
          { label: "משימות פתוחות", value: tasksDueSoon, icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
          { label: "תקציב כולל", value: `₪${(totalBudget / 1000).toFixed(0)}K`, icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
          { label: "הוצאה בפועל", value: `₪${(totalSpent / 1000).toFixed(0)}K`, icon: TrendingUp, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
        ].map((k, i) => (
          <div key={i} className={`${k.bg} border rounded-xl p-4 text-center`}>
            <k.icon className={`${k.color} mx-auto mb-2`} size={24} />
            <div className={`text-lg sm:text-2xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-2.5 text-muted-foreground" size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש פרויקטים..." className="w-full bg-muted border border-border rounded-lg pr-10 pl-4 py-2 text-sm text-foreground" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground">
          <option value="">כל הסטטוסים</option>
          <option value="planning">תכנון</option>
          <option value="active">פעיל</option>
          <option value="on-hold">מושהה</option>
          <option value="completed">הושלם</option>
          <option value="cancelled">בוטל</option>
        </select>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="פרויקטים" actions={defaultBulkActions(selectedIds, clear, () => qc.invalidateQueries({ queryKey: ["projects-module"] }), `${API}/projects-module`)} />

      <div className="bg-background border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="p-3 w-10"><BulkCheckbox checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered.map((r: any) => r.id))} /></th>
              <th className="text-right p-3">שם</th>
              <th className="text-right p-3">לקוח</th>
              <th className="text-right p-3">סטטוס</th>
              <th className="text-right p-3">עדיפות</th>
              <th className="text-right p-3">תקציב</th>
              <th className="text-right p-3">הוצאה</th>
              <th className="text-right p-3">תאריכים</th>
              <th className="text-center p-3">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p: any) => (
              <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="p-3"><BulkCheckbox checked={isSelected(p.id)} onChange={() => toggle(p.id)} /></td>
                <td className="p-3 text-foreground font-medium cursor-pointer hover:text-blue-400" onClick={() => { setViewDetail(p); setDetailTab("details"); }}>{p.name}</td>
                <td className="p-3 text-gray-300">{p.client || "-"}</td>
                <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs border ${STATUS_COLORS[p.status] || ""}`}>{translateStatus(p.status)}</span></td>
                <td className={`p-3 ${PRIORITY_COLORS[p.priority] || "text-muted-foreground"}`}>{p.priority}</td>
                <td className="p-3 text-gray-300">₪{parseFloat(p.budget || "0").toLocaleString()}</td>
                <td className="p-3 text-gray-300">₪{parseFloat(p.spent || "0").toLocaleString()}</td>
                <td className="p-3 text-muted-foreground text-xs">{p.startDate || "-"} → {p.endDate || "-"}</td>
                <td className="p-3 text-center">
                  <div className="flex justify-center gap-1">
                    <button onClick={() => { setViewDetail(p); setDetailTab("details"); }} className="p-1 hover:bg-muted rounded"><Eye size={14} className="text-muted-foreground" /></button>
                    <button onClick={() => openForm(p)} className="p-1 hover:bg-muted rounded"><Edit2 size={14} className="text-blue-400" /></button>
                    <button title="שכפול" onClick={async () => { const _dup = await duplicateRecord(`${API}/projects-module`, p.id, { defaultStatus: "planning" }); if (_dup.ok) { qc.invalidateQueries({ queryKey: ["projects-module"] }); toast({ title: "פרויקט שוכפל בהצלחה" }); } else { toast({ title: "שגיאה בשכפול", description: _dup.error, variant: "destructive" }); } }} className="p-1 hover:bg-muted rounded"><Copy size={14} className="text-slate-400" /></button>
                    {isSuperAdmin && <button onClick={async () => { if (await globalConfirm("למחוק?")) deleteMut.mutate(p.id); }} className="p-1 hover:bg-muted rounded"><Trash2 size={14} className="text-red-400" /></button>}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">אין פרויקטים</td></tr>}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => { setViewDetail(null); setDetailTab("details"); }}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-background border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{viewDetail.name}</h2>
                <button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
              </div>
              <div className="flex border-b border-border">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-blue-500 text-blue-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
                <div className="p-5 grid grid-cols-2 gap-4">
                  <div><span className="text-xs text-muted-foreground">שם</span><div className="text-sm text-foreground mt-0.5">{viewDetail.name}</div></div>
                  <div><span className="text-xs text-muted-foreground">לקוח</span><div className="text-sm text-foreground mt-0.5">{viewDetail.client || "—"}</div></div>
                  <div><span className="text-xs text-muted-foreground">סטטוס</span><div className="mt-0.5"><span className={`px-2 py-1 rounded-full text-xs border ${STATUS_COLORS[viewDetail.status] || ""}`}>{translateStatus(viewDetail.status)}</span></div></div>
                  <div><span className="text-xs text-muted-foreground">עדיפות</span><div className={`text-sm mt-0.5 ${PRIORITY_COLORS[viewDetail.priority] || "text-muted-foreground"}`}>{viewDetail.priority}</div></div>
                  <div><span className="text-xs text-muted-foreground">תקציב</span><div className="text-sm text-foreground mt-0.5">₪{parseFloat(viewDetail.budget || "0").toLocaleString()}</div></div>
                  <div><span className="text-xs text-muted-foreground">הוצאה</span><div className="text-sm text-foreground mt-0.5">₪{parseFloat(viewDetail.spent || "0").toLocaleString()}</div></div>
                  <div><span className="text-xs text-muted-foreground">תאריך התחלה</span><div className="text-sm text-foreground mt-0.5">{viewDetail.startDate || "—"}</div></div>
                  <div><span className="text-xs text-muted-foreground">תאריך סיום</span><div className="text-sm text-foreground mt-0.5">{viewDetail.endDate || "—"}</div></div>
                  <div className="col-span-2"><span className="text-xs text-muted-foreground">תיאור</span><div className="text-sm text-foreground mt-0.5">{viewDetail.description || "—"}</div></div>
                </div>
              )}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="project" entityId={viewDetail.id} /></div>}
              {detailTab === "docs" && <div className="p-5"><AttachmentsSection entityType="project" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="project" entityId={viewDetail.id} /></div>}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); openForm(viewDetail); }} className="px-4 py-2 bg-blue-600/20 text-blue-400 rounded-lg text-sm">עריכה</button>
                <button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="px-4 py-2 bg-muted text-gray-300 rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-background border border-border rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-foreground">{editing ? "עריכת פרויקט" : "פרויקט חדש"}</h2>
                <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: "name", label: "שם הפרויקט", type: "text" },
                  { key: "client", label: "לקוח", type: "text" },
                  { key: "owner", label: "אחראי", type: "text" },
                  { key: "priority", label: "עדיפות", type: "select", options: ["low", "medium", "high", "critical"] },
                  { key: "status", label: "סטטוס", type: "select", options: ["planning", "active", "on-hold", "completed", "cancelled"] },
                  { key: "budget", label: "תקציב", type: "number" },
                  { key: "spent", label: "הוצאה", type: "number" },
                  { key: "startDate", label: "תאריך התחלה", type: "date" },
                  { key: "endDate", label: "תאריך סיום", type: "date" },
                  { key: "tags", label: "תגיות", type: "text" },
                ].map(f => (
                  <div key={f.key} className="space-y-1">
                    <label className="text-sm text-muted-foreground">{f.label}</label>
                    {f.type === "select" ? (
                      <select value={form[f.key] || ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })} className="w-full bg-muted border border-border rounded-lg p-2.5 text-foreground text-sm">
                        {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={f.type} value={form[f.key] || ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })} className="w-full bg-muted border border-border rounded-lg p-2.5 text-foreground text-sm" />
                    )}
                  </div>
                ))}
                <div className="md:col-span-2 space-y-1">
                  <label className="text-sm text-muted-foreground">תיאור</label>
                  <textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className="w-full bg-muted border border-border rounded-lg p-2.5 text-foreground text-sm" />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted hover:bg-muted text-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={() => saveMut.mutate(form)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm">{editing ? "עדכון" : "שמירה"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
