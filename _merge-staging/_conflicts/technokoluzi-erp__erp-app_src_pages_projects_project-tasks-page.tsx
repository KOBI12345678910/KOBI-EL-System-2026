import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ClipboardList, Plus, Search, Download, Edit2, Trash2, X, CheckSquare, Clock, AlertCircle } from "lucide-react";
import { authFetch } from "@/lib/utils";
import { globalConfirm } from "@/components/confirm-dialog";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";

const STATUS_COLORS: Record<string, string> = {
  todo: "bg-muted/20 text-muted-foreground border-gray-500/30",
  "in-progress": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  done: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  blocked: "bg-red-500/20 text-red-400 border-red-500/30",
};

export default function ProjectTasksPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [detailTab, setDetailTab] = useState("details");
  const qc = useQueryClient();
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const { errors, validate, clearErrors } = useFormValidation<any>({
    title: { required: true, minLength: 2, message: "כותרת משימה חובה" },
  });

  const { data: tasks = [] } = useQuery<any[]>({
    queryKey: ["project-tasks"],
    queryFn: async () => { const r = await authFetch(`${API}/project-tasks`); return r.json(); },
  });

  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["projects-module"],
    queryFn: async () => { const r = await authFetch(`${API}/projects-module`); return r.json(); },
  });

  const { data: milestones = [] } = useQuery<any[]>({
    queryKey: ["project-milestones"],
    queryFn: async () => { const r = await authFetch(`${API}/project-milestones`); return r.json(); },
  });

  const saveMut = useMutation({
    mutationFn: async (data: any) => {
      const url = editing ? `${API}/project-tasks/${editing.id}` : `${API}/project-tasks`;
      return (await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })).json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["project-tasks"] }); setShowForm(false); setEditing(null); },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => { await authFetch(`${API}/project-tasks/${id}`, { method: "DELETE" }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-tasks"] }),
  });

  const filtered = tasks.filter((t: any) => {
    if (search && !t.title?.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter && t.status !== statusFilter) return false;
    return true;
  });

  const todoCount = tasks.filter((t: any) => t.status === "todo").length;
  const inProgressCount = tasks.filter((t: any) => t.status === "in-progress").length;
  const doneCount = tasks.filter((t: any) => t.status === "done").length;
  const blockedCount = tasks.filter((t: any) => t.status === "blocked").length;

  const openForm = (item?: any) => {
    if (item) { setEditing(item); setForm({ ...item }); }
    else { setEditing(null); setForm({ projectId: "", title: "", description: "", assignee: "", milestoneId: "", status: "todo", priority: "medium", dueDate: "", estimatedHours: "", actualHours: "", tags: "" }); }
    setShowForm(true);
  };

  const exportCSV = () => {
    const headers = ["Title", "Status", "Priority", "Assignee", "Due Date", "Est Hours", "Actual Hours"];
    const rows = filtered.map((t: any) => [t.title, t.status, t.priority, t.assignee, t.dueDate, t.estimatedHours, t.actualHours].join(","));
    const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "project-tasks.csv"; a.click();
  };

  const kanbanStatuses = ["todo", "in-progress", "done", "blocked"];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="text-blue-400" size={28} />
          <h1 className="text-lg sm:text-2xl font-bold text-white">משימות פרויקטים</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setViewMode(viewMode === "list" ? "kanban" : "list")} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">{viewMode === "list" ? "קנבן" : "רשימה"}</button>
          <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"><Download size={16} />ייצוא</button>
          <button onClick={() => openForm()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"><Plus size={16} />משימה חדשה</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "ממתינות", value: todoCount, icon: Clock, color: "text-muted-foreground", bg: "bg-muted/10 border-gray-500/20" },
          { label: "בביצוע", value: inProgressCount, icon: ClipboardList, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
          { label: "הושלמו", value: doneCount, icon: CheckSquare, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
          { label: "חסומות", value: blockedCount, icon: AlertCircle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש משימות..." className="w-full bg-gray-800 border border-gray-700 rounded-lg pr-10 pl-4 py-2 text-sm text-white" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
          <option value="">כל הסטטוסים</option>
          <option value="todo">ממתין</option>
          <option value="in-progress">בביצוע</option>
          <option value="done">הושלם</option>
          <option value="blocked">חסום</option>
        </select>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="משימות" actions={defaultBulkActions(selectedIds, clear, () => qc.invalidateQueries({ queryKey: ["project-tasks"] }), `${API}/project-tasks`)} />

      {viewMode === "kanban" ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {kanbanStatuses.map(status => (
            <div key={status} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <h3 className="text-sm font-semibold text-gray-300 mb-3 capitalize">{status}</h3>
              <div className="space-y-2">
                {filtered.filter((t: any) => t.status === status).map((t: any) => (
                  <div key={t.id} className="bg-gray-800 border border-gray-700 rounded-lg p-3 cursor-pointer hover:border-blue-500/50" onClick={() => openForm(t)}>
                    <div className="text-sm text-white font-medium">{t.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">{t.assignee || "לא משויך"}</div>
                    {t.dueDate && <div className="text-xs text-muted-foreground mt-1">{t.dueDate}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-muted-foreground">
                <th className="p-3 w-10"><BulkCheckbox checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered.map((r: any) => r.id))} /></th>
                <th className="text-right p-3">כותרת</th>
                <th className="text-right p-3">פרויקט</th>
                <th className="text-right p-3">סטטוס</th>
                <th className="text-right p-3">עדיפות</th>
                <th className="text-right p-3">משויך</th>
                <th className="text-right p-3">תאריך יעד</th>
                <th className="text-right p-3">שעות</th>
                <th className="text-center p-3">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t: any) => {
                const proj = projects.find((p: any) => p.id === t.projectId);
                return (
                  <tr key={t.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="p-3"><BulkCheckbox checked={isSelected(t.id)} onChange={() => toggle(t.id)} /></td>
                    <td className="p-3 text-white font-medium cursor-pointer hover:text-blue-400" onClick={() => { setViewDetail(t); setDetailTab("details"); }}>{t.title}</td>
                    <td className="p-3 text-gray-300">{proj?.name || "-"}</td>
                    <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs border ${STATUS_COLORS[t.status] || ""}`}>{t.status}</span></td>
                    <td className="p-3 text-gray-300">{t.priority}</td>
                    <td className="p-3 text-gray-300">{t.assignee || "-"}</td>
                    <td className="p-3 text-muted-foreground">{t.dueDate || "-"}</td>
                    <td className="p-3 text-muted-foreground">{t.estimatedHours || 0}h / {t.actualHours || 0}h</td>
                    <td className="p-3 text-center">
                      <div className="flex justify-center gap-1">
                        <button onClick={() => openForm(t)} className="p-1 hover:bg-gray-700 rounded"><Edit2 size={14} className="text-blue-400" /></button>
                        <button onClick={async () => { if (globalConfirm("למחוק?")) deleteMut.mutate(t.id); }} className="p-1 hover:bg-gray-700 rounded"><Trash2 size={14} className="text-red-400" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">אין משימות</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => { setViewDetail(null); setDetailTab("details"); }}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-gray-800 flex justify-between items-center">
                <h2 className="text-lg font-bold text-white">{viewDetail.title}</h2>
                <button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="text-muted-foreground hover:text-white"><X size={20} /></button>
              </div>
              <div className="flex border-b border-gray-800">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-blue-500 text-blue-400" : "border-transparent text-muted-foreground hover:text-white"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
                <div className="p-5 grid grid-cols-2 gap-4">
                  <div><span className="text-xs text-muted-foreground">כותרת</span><div className="text-sm text-white mt-0.5">{viewDetail.title}</div></div>
                  <div><span className="text-xs text-muted-foreground">סטטוס</span><div className="mt-0.5"><span className={`px-2 py-1 rounded-full text-xs border ${STATUS_COLORS[viewDetail.status] || ""}`}>{viewDetail.status}</span></div></div>
                  <div><span className="text-xs text-muted-foreground">עדיפות</span><div className="text-sm text-white mt-0.5">{viewDetail.priority || "—"}</div></div>
                  <div><span className="text-xs text-muted-foreground">משויך ל</span><div className="text-sm text-white mt-0.5">{viewDetail.assignee || "—"}</div></div>
                  <div><span className="text-xs text-muted-foreground">תאריך יעד</span><div className="text-sm text-white mt-0.5">{viewDetail.dueDate || "—"}</div></div>
                  <div><span className="text-xs text-muted-foreground">שעות</span><div className="text-sm text-white mt-0.5">{viewDetail.estimatedHours || 0}h / {viewDetail.actualHours || 0}h</div></div>
                  <div className="col-span-2"><span className="text-xs text-muted-foreground">תיאור</span><div className="text-sm text-white mt-0.5">{viewDetail.description || "—"}</div></div>
                </div>
              )}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="project-task" entityId={viewDetail.id} /></div>}
              {detailTab === "docs" && <div className="p-5"><AttachmentsSection entityType="project-task" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="project-task" entityId={viewDetail.id} /></div>}
              <div className="p-5 border-t border-gray-800 flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); openForm(viewDetail); }} className="px-4 py-2 bg-blue-600/20 text-blue-400 rounded-lg text-sm">עריכה</button>
                <button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white">{editing ? "עריכת משימה" : "משימה חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-white"><X size={20} /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 space-y-1">
                  <label className="text-sm text-muted-foreground">כותרת</label>
                  <input value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground">פרויקט</label>
                  <select value={form.projectId || ""} onChange={e => setForm({ ...form, projectId: parseInt(e.target.value) || "" })} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white text-sm">
                    <option value="">בחר פרויקט</option>
                    {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground">אבן דרך</label>
                  <select value={form.milestoneId || ""} onChange={e => setForm({ ...form, milestoneId: parseInt(e.target.value) || "" })} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white text-sm">
                    <option value="">ללא</option>
                    {milestones.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                {[
                  { key: "assignee", label: "משויך ל", type: "text" },
                  { key: "status", label: "סטטוס", type: "select", options: ["todo", "in-progress", "done", "blocked"] },
                  { key: "priority", label: "עדיפות", type: "select", options: ["low", "medium", "high", "critical"] },
                  { key: "dueDate", label: "תאריך יעד", type: "date" },
                  { key: "estimatedHours", label: "שעות מוערכות", type: "number" },
                  { key: "actualHours", label: "שעות בפועל", type: "number" },
                  { key: "tags", label: "תגיות", type: "text" },
                ].map(f => (
                  <div key={f.key} className="space-y-1">
                    <label className="text-sm text-muted-foreground">{f.label}</label>
                    {f.type === "select" ? (
                      <select value={form[f.key] || ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white text-sm">
                        {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={f.type} value={form[f.key] || ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white text-sm" />
                    )}
                  </div>
                ))}
                <div className="md:col-span-2 space-y-1">
                  <label className="text-sm text-muted-foreground">תיאור</label>
                  <textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white text-sm" />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">ביטול</button>
                <button onClick={() => saveMut.mutate(form)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm">{editing ? "עדכון" : "שמירה"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
