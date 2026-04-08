import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardList, Plus, Search, Download, Edit2, Trash2, X, CheckSquare, Clock, AlertCircle,
  ChevronRight, ChevronDown, Diamond, GitBranch, GanttChart, Factory, Link, Unlink, RefreshCw, Zap, Copy
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation } from "@/hooks/use-form-validation";

const WO_STATUS_COLORS: Record<string, string> = {
  planned: "bg-blue-500/20 text-blue-400",
  in_progress: "bg-amber-500/20 text-amber-400",
  completed: "bg-emerald-500/20 text-emerald-400",
  cancelled: "bg-red-500/20 text-red-400",
  on_hold: "bg-gray-500/20 text-gray-400",
};

function ProductionIntegrationTab({ taskId }: { taskId: number }) {
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [selectedWoId, setSelectedWoId] = useState<number | "">("");
  const qc = useQueryClient();

  const { data: links = [] } = useQuery<any[]>({
    queryKey: ["project-work-order-links", taskId],
    queryFn: async () => {
      const r = await authFetch(`/api/project-work-order-links?taskId=${taskId}`);
      return (await r.json()) || [];
    },
  });

  const { data: availableWOs = [] } = useQuery<any[]>({
    queryKey: ["production-work-orders-list"],
    queryFn: async () => {
      const r = await authFetch(`/api/production-work-orders-list`);
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    },
    enabled: showLinkForm,
  });

  const linkMut = useMutation({
    mutationFn: async (workOrderId: number) => {
      const r = await authFetch(`/api/project-work-order-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectTaskId: taskId, workOrderId, linkType: "linked" }),
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-work-order-links", taskId] });
      setShowLinkForm(false);
      setSelectedWoId("");
    },
  });

  const unlinkMut = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`/api/project-work-order-links/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-work-order-links", taskId] }),
  });

  const syncMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`/api/project-work-order-links/${id}/sync`, { method: "POST" });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-work-order-links", taskId] });
      qc.invalidateQueries({ queryKey: ["project-tasks"] });
    },
  });

  const createWOMut = useMutation({
    mutationFn: async () => {
      const r = await authFetch(`/api/project-tasks/${taskId}/create-work-order`, { method: "POST" });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-work-order-links", taskId] }),
  });

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Factory size={14} className="text-orange-400" />
          שיוך לפקודות עבודה
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setShowLinkForm(s => !s)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-xs"
          >
            <Link size={12} /> שייך פקודת עבודה
          </button>
          <button
            onClick={() => createWOMut.mutate()}
            disabled={createWOMut.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 rounded-lg text-xs"
          >
            <Zap size={12} /> {createWOMut.isPending ? "יוצר..." : "צור פקודה אוטומטית"}
          </button>
        </div>
      </div>

      {showLinkForm && (
        <div className="bg-muted rounded-xl p-3 flex gap-2">
          <select
            value={selectedWoId}
            onChange={e => setSelectedWoId(Number(e.target.value))}
            className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground"
          >
            <option value="">בחר פקודת עבודה...</option>
            {availableWOs.map((wo: any) => (
              <option key={wo.id} value={wo.id}>
                {wo.order_number} — {wo.product_name} ({wo.status})
              </option>
            ))}
          </select>
          <button
            onClick={() => selectedWoId && linkMut.mutate(Number(selectedWoId))}
            disabled={!selectedWoId || linkMut.isPending}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-foreground rounded-lg text-sm"
          >
            שייך
          </button>
          <button onClick={() => setShowLinkForm(false)} className="px-3 py-2 bg-muted hover:bg-muted text-gray-300 rounded-lg text-sm">
            <X size={14} />
          </button>
        </div>
      )}

      {links.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Factory size={32} className="mx-auto mb-2 opacity-30" />
          <p>אין פקודות עבודה משויכות</p>
          <p className="text-xs mt-1">שייך פקודת עבודה קיימת או צור אוטומטית</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(links as any[]).map((link: any) => {
            const completion = parseFloat(link.completion_percentage || "0");
            return (
              <div key={link.id} className="bg-muted rounded-xl p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">{link.order_number || `פקודה #${link.work_order_id}`}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{link.product_name || "—"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${WO_STATUS_COLORS[link.wo_status] || "bg-gray-500/20 text-gray-400"}`}>
                      {link.wo_status || "—"}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${link.link_type === "auto_created" ? "bg-orange-500/20 text-orange-400" : "bg-blue-500/20 text-blue-400"}`}>
                      {link.link_type === "auto_created" ? "אוטומטי" : "ידני"}
                    </span>
                  </div>
                </div>
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">השלמת ייצור</span>
                    <span className="text-foreground">{completion.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${completion >= 100 ? "bg-emerald-500" : completion > 50 ? "bg-blue-500" : "bg-amber-500"}`}
                      style={{ width: `${Math.min(completion, 100)}%` }}
                    />
                  </div>
                </div>
                {link.last_synced_at && (
                  <div className="text-[10px] text-muted-foreground mb-2">
                    סנכרון אחרון: {new Date(link.last_synced_at).toLocaleDateString("he-IL")}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => syncMut.mutate(link.id)}
                    disabled={syncMut.isPending}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg text-xs"
                  >
                    <RefreshCw size={11} className={syncMut.isPending ? "animate-spin" : ""} /> סנכרן
                  </button>
                  <button
                    onClick={async () => { if (await globalConfirm("לנתק פקודת עבודה זו?")) unlinkMut.mutate(link.id); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-xs"
                  >
                    <Unlink size={11} /> נתק
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const API = "/api";

const STATUS_COLORS: Record<string, string> = {
  todo: "bg-muted/20 text-muted-foreground border-gray-500/30",
  "in-progress": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  done: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  blocked: "bg-red-500/20 text-red-400 border-red-500/30",
};

function buildWbsTree(tasks: any[]): any[] {
  const map = new Map<number, any>();
  const roots: any[] = [];
  for (const t of tasks) {
    map.set(t.id, { ...t, children: [] });
  }
  for (const t of tasks) {
    const node = map.get(t.id)!;
    if (t.parent_task_id && map.has(t.parent_task_id)) {
      map.get(t.parent_task_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function flattenTree(nodes: any[], depth = 0, expanded: Set<number>): any[] {
  const result: any[] = [];
  for (const node of nodes) {
    result.push({ ...node, depth });
    if (node.children.length > 0 && expanded.has(node.id)) {
      result.push(...flattenTree(node.children, depth + 1, expanded));
    }
  }
  return result;
}

export default function ProjectTasksPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [viewMode, setViewMode] = useState<"wbs" | "list" | "kanban">("wbs");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [detailTab, setDetailTab] = useState("details");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [expandAll, setExpandAll] = useState(true);
  const qc = useQueryClient();
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const { errors, validate } = useFormValidation<any>({
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

  const filtered = (tasks as any[]).filter((t: any) => {
    if (search && !t.title?.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter && t.status !== statusFilter) return false;
    return true;
  });

  const wbsRoots = useMemo(() => buildWbsTree(filtered), [filtered]);

  const allIds = useMemo(() => new Set(filtered.map((t: any) => t.id)), [filtered]);

  const effectiveExpanded = expandAll ? allIds : expanded;

  const flatWbs = useMemo(() => flattenTree(wbsRoots, 0, effectiveExpanded), [wbsRoots, effectiveExpanded]);

  const toggleExpand = (id: number) => {
    if (expandAll) {
      const next = new Set(allIds);
      next.delete(id);
      setExpanded(next);
      setExpandAll(false);
    } else {
      const next = new Set(expanded);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setExpanded(next);
    }
  };

  const todoCount = (tasks as any[]).filter((t: any) => t.status === "todo").length;
  const inProgressCount = (tasks as any[]).filter((t: any) => t.status === "in-progress").length;
  const doneCount = (tasks as any[]).filter((t: any) => t.status === "done").length;
  const blockedCount = (tasks as any[]).filter((t: any) => t.status === "blocked").length;
  const criticalCount = (tasks as any[]).filter((t: any) => t.is_critical).length;

  const openForm = (item?: any, parentId?: number) => {
    if (item) { setEditing(item); setForm({ ...item }); }
    else { setEditing(null); setForm({ projectId: "", parentTaskId: parentId || "", title: "", description: "", assignee: "", milestoneId: "", status: "todo", priority: "medium", dueDate: "", estimatedHours: "", actualHours: "", tags: "", duration: 1, plannedStart: "", plannedEnd: "", isMilestone: false }); }
    setShowForm(true);
  };

  const exportCSV = () => {
    const headers = ["WBS", "Title", "Status", "Priority", "Assignee", "Planned Start", "Planned End", "Duration", "Critical"];
    const rows = flatWbs.map((t: any) => [
      t.wbs_code || "", t.title, t.status, t.priority, t.assignee,
      t.planned_start || "", t.planned_end || "", t.duration || "", t.is_critical ? "Yes" : "No"
    ].join(","));
    const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "project-tasks-wbs.csv"; a.click();
  };

  const kanbanStatuses = ["todo", "in-progress", "done", "blocked"];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="text-blue-400" size={28} />
          <h1 className="text-lg sm:text-2xl font-bold text-foreground">משימות פרויקטים — WBS</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex border border-border rounded-lg overflow-hidden text-xs">
            {[
              { key: "wbs", label: "WBS", icon: GitBranch },
              { key: "list", label: "רשימה", icon: ClipboardList },
              { key: "kanban", label: "קנבן", icon: GanttChart },
            ].map(v => (
              <button
                key={v.key}
                onClick={() => setViewMode(v.key as any)}
                className={`px-3 py-2 flex items-center gap-1.5 ${viewMode === v.key ? "bg-blue-600 text-foreground" : "bg-muted text-gray-300 hover:bg-muted"}`}
              >
                <v.icon size={12} />
                {v.label}
              </button>
            ))}
          </div>
          <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted text-foreground rounded-lg text-sm"><Download size={16} />ייצוא</button>
          <button onClick={() => openForm()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm"><Plus size={16} />משימה חדשה</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "ממתינות", value: todoCount, icon: Clock, color: "text-muted-foreground", bg: "bg-muted/10 border-gray-500/20" },
          { label: "בביצוע", value: inProgressCount, icon: ClipboardList, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
          { label: "הושלמו", value: doneCount, icon: CheckSquare, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
          { label: "חסומות", value: blockedCount, icon: AlertCircle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
          { label: "נתיב קריטי", value: criticalCount, icon: GitBranch, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש משימות..." className="w-full bg-muted border border-border rounded-lg pr-10 pl-4 py-2 text-sm text-foreground" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground">
          <option value="">כל הסטטוסים</option>
          <option value="todo">ממתין</option>
          <option value="in-progress">בביצוע</option>
          <option value="done">הושלם</option>
          <option value="blocked">חסום</option>
        </select>
        {viewMode === "wbs" && (
          <button
            onClick={() => { setExpandAll(!expandAll); setExpanded(new Set()); }}
            className="px-3 py-2 bg-muted hover:bg-muted text-gray-300 rounded-lg text-xs"
          >
            {expandAll ? "כווץ הכל" : "הרחב הכל"}
          </button>
        )}
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="משימות" actions={defaultBulkActions(selectedIds, clear, () => qc.invalidateQueries({ queryKey: ["project-tasks"] }), `${API}/project-tasks`)} />

      {viewMode === "kanban" ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {kanbanStatuses.map(status => (
            <div key={status} className="bg-background border border-border rounded-xl p-3">
              <h3 className="text-sm font-semibold text-gray-300 mb-3 capitalize">{status}</h3>
              <div className="space-y-2">
                {filtered.filter((t: any) => t.status === status).map((t: any) => (
                  <div key={t.id} className="bg-muted border border-border rounded-lg p-3 cursor-pointer hover:border-blue-500/50" onClick={() => openForm(t)}>
                    {t.wbs_code && <div className="text-[10px] text-gray-500 mb-1">{t.wbs_code}</div>}
                    <div className="text-sm text-foreground font-medium">{t.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">{t.assignee || "לא משויך"}</div>
                    {t.planned_start && <div className="text-xs text-muted-foreground mt-1">{t.planned_start}</div>}
                    {t.is_critical && <div className="text-[10px] text-red-400 mt-1 font-bold">🔴 נתיב קריטי</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : viewMode === "wbs" ? (
        <div className="bg-background border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="p-3 w-10"><BulkCheckbox checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered.map((r: any) => r.id))} /></th>
                <th className="text-right p-3 w-20">WBS</th>
                <th className="text-right p-3">כותרת</th>
                <th className="text-right p-3">סטטוס</th>
                <th className="text-right p-3">התחלה</th>
                <th className="text-right p-3">סיום</th>
                <th className="text-right p-3">משך</th>
                <th className="text-right p-3">Float</th>
                <th className="text-center p-3">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {flatWbs.map((t: any) => (
                <tr
                  key={t.id}
                  className={`border-b border-border/50 hover:bg-muted/30 ${t.is_critical ? "bg-red-950/10" : ""}`}
                >
                  <td className="p-3"><BulkCheckbox checked={isSelected(t.id)} onChange={() => toggle(t.id)} /></td>
                  <td className="p-3 text-gray-500 text-xs font-mono">{t.wbs_code || "-"}</td>
                  <td className="p-3">
                    <div
                      className="flex items-center gap-1"
                      style={{ paddingRight: `${t.depth * 20}px` }}
                    >
                      {t.children.length > 0 ? (
                        <button
                          onClick={() => toggleExpand(t.id)}
                          className="text-gray-400 hover:text-foreground flex-shrink-0"
                        >
                          {effectiveExpanded.has(t.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      ) : (
                        <span className="w-4 flex-shrink-0" />
                      )}
                      {t.is_milestone ? <Diamond size={12} className="text-amber-400 flex-shrink-0" /> : null}
                      <span
                        className={`cursor-pointer hover:text-blue-400 font-${t.depth === 0 ? "semibold" : "normal"} ${t.is_critical ? "text-red-400" : "text-foreground"}`}
                        onClick={() => { setViewDetail(t); setDetailTab("details"); }}
                      >
                        {t.title}
                      </span>
                      {t.is_critical && <span className="text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold ml-1">CP</span>}
                    </div>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-xs border ${STATUS_COLORS[t.status] || ""}`}>{t.status}</span>
                  </td>
                  <td className="p-3 text-gray-300 text-xs">{t.planned_start || t.due_date || "-"}</td>
                  <td className="p-3 text-gray-300 text-xs">{t.planned_end || "-"}</td>
                  <td className="p-3 text-gray-300 text-xs">{t.duration ? `${t.duration}d` : "-"}</td>
                  <td className="p-3 text-gray-300 text-xs">{t.total_float !== null && t.total_float !== undefined ? `${t.total_float}d` : "-"}</td>
                  <td className="p-3 text-center">
                    <div className="flex justify-center gap-1">
                      <button onClick={() => openForm(undefined, t.id)} className="p-1 hover:bg-muted rounded" title="הוסף תת-משימה"><Plus size={13} className="text-emerald-400" /></button>
                      <button onClick={() => openForm(t)} className="p-1 hover:bg-muted rounded"><Edit2 size={14} className="text-blue-400" /></button><button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/project-tasks`, t.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                      {isSuperAdmin && <button onClick={async () => { if (await globalConfirm("למחוק?")) deleteMut.mutate(t.id); }} className="p-1 hover:bg-muted rounded"><Trash2 size={14} className="text-red-400" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
              {flatWbs.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">אין משימות</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-background border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
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
                const proj = (projects as any[]).find((p: any) => p.id === t.project_id);
                return (
                  <tr key={t.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="p-3"><BulkCheckbox checked={isSelected(t.id)} onChange={() => toggle(t.id)} /></td>
                    <td className="p-3 text-foreground font-medium cursor-pointer hover:text-blue-400" onClick={() => { setViewDetail(t); setDetailTab("details"); }}>{t.title}</td>
                    <td className="p-3 text-gray-300">{proj?.name || "-"}</td>
                    <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs border ${STATUS_COLORS[t.status] || ""}`}>{t.status}</span></td>
                    <td className="p-3 text-gray-300">{t.priority}</td>
                    <td className="p-3 text-gray-300">{t.assignee || "-"}</td>
                    <td className="p-3 text-muted-foreground">{t.due_date || "-"}</td>
                    <td className="p-3 text-muted-foreground">{t.estimated_hours || 0}h / {t.actual_hours || 0}h</td>
                    <td className="p-3 text-center">
                      <div className="flex justify-center gap-1">
                        <button onClick={() => openForm(t)} className="p-1 hover:bg-muted rounded"><Edit2 size={14} className="text-blue-400" /></button><button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/project-tasks`, t.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                        {isSuperAdmin && <button onClick={async () => { if (await globalConfirm("למחוק?")) deleteMut.mutate(t.id); }} className="p-1 hover:bg-muted rounded"><Trash2 size={14} className="text-red-400" /></button>}
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
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-background border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <div className="flex items-center gap-2">
                  {viewDetail.wbs_code && <span className="text-xs text-gray-500 font-mono">{viewDetail.wbs_code}</span>}
                  <h2 className="text-lg font-bold text-foreground">{viewDetail.title}</h2>
                  {viewDetail.is_critical && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded font-bold">נתיב קריטי</span>}
                </div>
                <button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
              </div>
              <div className="flex border-b border-border overflow-x-auto">
                {[{key:"details",label:"פרטים"},{key:"production",label:"ייצור"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap ${detailTab === t.key ? "border-blue-500 text-blue-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
                <div className="p-5 grid grid-cols-2 gap-4">
                  <div><span className="text-xs text-muted-foreground">כותרת</span><div className="text-sm text-foreground mt-0.5">{viewDetail.title}</div></div>
                  <div><span className="text-xs text-muted-foreground">סטטוס</span><div className="mt-0.5"><span className={`px-2 py-1 rounded-full text-xs border ${STATUS_COLORS[viewDetail.status] || ""}`}>{viewDetail.status}</span></div></div>
                  <div><span className="text-xs text-muted-foreground">WBS</span><div className="text-sm font-mono text-gray-300 mt-0.5">{viewDetail.wbs_code || "—"}</div></div>
                  <div><span className="text-xs text-muted-foreground">משך (ימים)</span><div className="text-sm text-foreground mt-0.5">{viewDetail.duration || "—"}</div></div>
                  <div><span className="text-xs text-muted-foreground">התחלה מתוכננת</span><div className="text-sm text-foreground mt-0.5">{viewDetail.planned_start || "—"}</div></div>
                  <div><span className="text-xs text-muted-foreground">סיום מתוכנן</span><div className="text-sm text-foreground mt-0.5">{viewDetail.planned_end || "—"}</div></div>
                  <div><span className="text-xs text-muted-foreground">ES / EF</span><div className="text-sm text-foreground mt-0.5">{viewDetail.early_start ?? "—"} / {viewDetail.early_finish ?? "—"}</div></div>
                  <div><span className="text-xs text-muted-foreground">LS / LF</span><div className="text-sm text-foreground mt-0.5">{viewDetail.late_start ?? "—"} / {viewDetail.late_finish ?? "—"}</div></div>
                  <div><span className="text-xs text-muted-foreground">Total Float</span><div className="text-sm text-foreground mt-0.5">{viewDetail.total_float !== null && viewDetail.total_float !== undefined ? `${viewDetail.total_float}d` : "—"}</div></div>
                  <div><span className="text-xs text-muted-foreground">Free Float</span><div className="text-sm text-foreground mt-0.5">{viewDetail.free_float !== null && viewDetail.free_float !== undefined ? `${viewDetail.free_float}d` : "—"}</div></div>
                  <div><span className="text-xs text-muted-foreground">עדיפות</span><div className="text-sm text-foreground mt-0.5">{viewDetail.priority || "—"}</div></div>
                  <div><span className="text-xs text-muted-foreground">משויך ל</span><div className="text-sm text-foreground mt-0.5">{viewDetail.assignee || "—"}</div></div>
                  {viewDetail.baseline_start && (
                    <>
                      <div><span className="text-xs text-muted-foreground">Baseline התחלה</span><div className="text-sm text-gray-400 mt-0.5">{viewDetail.baseline_start}</div></div>
                      <div><span className="text-xs text-muted-foreground">Baseline סיום</span><div className="text-sm text-gray-400 mt-0.5">{viewDetail.baseline_end || "—"}</div></div>
                    </>
                  )}
                  <div className="col-span-2"><span className="text-xs text-muted-foreground">תיאור</span><div className="text-sm text-foreground mt-0.5">{viewDetail.description || "—"}</div></div>
                </div>
              )}
              {detailTab === "production" && <ProductionIntegrationTab taskId={viewDetail.id} />}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="project-task" entityId={viewDetail.id} /></div>}
              {detailTab === "docs" && <div className="p-5"><AttachmentsSection entityType="project-task" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="project-task" entityId={viewDetail.id} /></div>}
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
                <h2 className="text-xl font-bold text-foreground">{editing ? "עריכת משימה" : "משימה חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 space-y-1">
                  <label className="text-sm text-muted-foreground">כותרת *</label>
                  <input value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full bg-muted border border-border rounded-lg p-2.5 text-foreground text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground">פרויקט</label>
                  <select value={form.projectId || form.project_id || ""} onChange={e => setForm({ ...form, projectId: parseInt(e.target.value) || "" })} className="w-full bg-muted border border-border rounded-lg p-2.5 text-foreground text-sm">
                    <option value="">בחר פרויקט</option>
                    {(projects as any[]).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground">משימת אב (WBS)</label>
                  <select value={form.parentTaskId || form.parent_task_id || ""} onChange={e => setForm({ ...form, parentTaskId: parseInt(e.target.value) || "" })} className="w-full bg-muted border border-border rounded-lg p-2.5 text-foreground text-sm">
                    <option value="">ללא (רמה ראשית)</option>
                    {(tasks as any[]).filter((t: any) => t.id !== editing?.id).map((t: any) => <option key={t.id} value={t.id}>{t.wbs_code ? `${t.wbs_code} — ` : ""}{t.title}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground">אבן דרך</label>
                  <select value={form.milestoneId || form.milestone_id || ""} onChange={e => setForm({ ...form, milestoneId: parseInt(e.target.value) || "" })} className="w-full bg-muted border border-border rounded-lg p-2.5 text-foreground text-sm">
                    <option value="">ללא</option>
                    {(milestones as any[]).map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground">משך (ימים)</label>
                  <input type="number" min={1} value={form.duration || 1} onChange={e => setForm({ ...form, duration: parseInt(e.target.value) || 1 })} className="w-full bg-muted border border-border rounded-lg p-2.5 text-foreground text-sm" />
                </div>
                {[
                  { key: "assignee", label: "משויך ל", type: "text" },
                  { key: "status", label: "סטטוס", type: "select", options: ["todo", "in-progress", "done", "blocked"] },
                  { key: "priority", label: "עדיפות", type: "select", options: ["low", "medium", "high", "critical"] },
                  { key: "plannedStart", label: "התחלה מתוכננת", type: "date", db: "planned_start" },
                  { key: "plannedEnd", label: "סיום מתוכנן", type: "date", db: "planned_end" },
                  { key: "dueDate", label: "תאריך יעד", type: "date", db: "due_date" },
                  { key: "estimatedHours", label: "שעות מוערכות", type: "number", db: "estimated_hours" },
                  { key: "actualHours", label: "שעות בפועל", type: "number", db: "actual_hours" },
                  { key: "tags", label: "תגיות", type: "text" },
                ].map(f => (
                  <div key={f.key} className="space-y-1">
                    <label className="text-sm text-muted-foreground">{f.label}</label>
                    {f.type === "select" ? (
                      <select value={form[f.key] || (f.db ? form[f.db] : "")} onChange={e => setForm({ ...form, [f.key]: e.target.value })} className="w-full bg-muted border border-border rounded-lg p-2.5 text-foreground text-sm">
                        {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={f.type} value={form[f.key] || (f.db ? form[f.db] : "") || ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })} className="w-full bg-muted border border-border rounded-lg p-2.5 text-foreground text-sm" />
                    )}
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="isMilestone" checked={form.isMilestone || form.is_milestone || false} onChange={e => setForm({ ...form, isMilestone: e.target.checked })} className="rounded" />
                  <label htmlFor="isMilestone" className="text-sm text-muted-foreground">אבן דרך (Milestone)</label>
                </div>
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
