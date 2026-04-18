import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import {
  Clock, Plus, Trash2, Play, Settings, CheckCircle, XCircle,
  RefreshCw, Pause, Power, AlertTriangle, ChevronDown, Calendar,
  Timer, X, Activity, History
} from "lucide-react";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

const FREQUENCY_OPTIONS = [
  { value: "hourly", label: "כל שעה" },
  { value: "daily", label: "יומי" },
  { value: "weekly", label: "שבועי" },
  { value: "monthly", label: "חודשי" },
];

const DAYS_OF_WEEK = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<any> }> = {
  success: { label: "הצלחה", color: "text-green-400", icon: CheckCircle },
  failed: { label: "נכשל", color: "text-red-400", icon: XCircle },
  running: { label: "רץ", color: "text-blue-400", icon: RefreshCw },
};

interface ScheduledTask {
  id: number;
  name: string;
  description: string | null;
  taskType: string;
  scheduleFrequency: string;
  scheduleTime: string;
  cronExpression: string | null;
  parameters: Record<string, any>;
  isActive: boolean;
  lastRunAt: string | null;
  runCount: number;
  createdAt: string;
}

interface TaskType {
  type: string;
  label: string;
}

interface ExecutionLog {
  id: number;
  status: string;
  output: string | null;
  errorMessage: string | null;
  duration: number | null;
  startedAt: string;
  completedAt: string | null;
}

export default function ScheduledTasks() {
  const [showCreate, setShowCreate] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const [viewingLogs, setViewingLogs] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;

  const { data: tasks = [], isLoading } = useQuery<ScheduledTask[]>({
    queryKey: ["scheduled-tasks"],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/scheduled-tasks`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: taskTypes = [] } = useQuery<TaskType[]>({
    queryKey: ["scheduled-task-types"],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/scheduled-tasks/types`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: executionLogs = [] } = useQuery<ExecutionLog[]>({
    queryKey: ["scheduled-task-logs", viewingLogs],
    queryFn: async () => {
      if (!viewingLogs) return [];
      const r = await authFetch(`${API}/platform/scheduled-tasks/${viewingLogs}/logs?limit=20`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!viewingLogs,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/platform/scheduled-tasks/${id}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scheduled-tasks"] }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      await authFetch(`${API}/platform/scheduled-tasks/${id}`, { method: "PUT", body: JSON.stringify({ isActive: !isActive }) });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scheduled-tasks"] }),
  });

  const runMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/platform/scheduled-tasks/${id}/run`, { method: "POST" });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-tasks"] });
      if (viewingLogs) queryClient.invalidateQueries({ queryKey: ["scheduled-task-logs", viewingLogs] });
    },
  });

  const activeTasks = tasks.filter(t => t.isActive);
  const inactiveTasks = tasks.filter(t => !t.isActive);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <Clock className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">משימות מתוזמנות</h1>
            <p className="text-sm text-muted-foreground">ניהול משימות cron ותיזמון אוטומטי</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" />
          משימה חדשה
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "סה״כ משימות", value: tasks.length, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "פעילות", value: activeTasks.length, color: "text-green-400", bg: "bg-green-500/10" },
          { label: "כבויות", value: inactiveTasks.length, color: "text-muted-foreground", bg: "bg-muted/10" },
          { label: "הרצות", value: tasks.reduce((s, t) => s + t.runCount, 0), color: "text-purple-400", bg: "bg-purple-500/10" },
        ].map((s, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
          <Clock className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">אין משימות מתוזמנות</h3>
          <p className="text-muted-foreground mb-4">הוסף משימות לתיזמון אוטומטי של בדיקות ודוחות</p>
          <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium">
            <Plus className="w-4 h-4" />
            משימה חדשה
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const taskTypeLabel = taskTypes.find(t => t.type === task.taskType)?.label || task.taskType;
            const freqLabel = FREQUENCY_OPTIONS.find(f => f.value === task.scheduleFrequency)?.label || task.scheduleFrequency;
            const isViewingLogs = viewingLogs === task.id;

            return (
              <motion.div key={task.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${task.isActive ? "bg-green-400 animate-pulse" : "bg-muted-foreground"}`} />
                      <div>
                        <h3 className="font-semibold">{task.name}</h3>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                          <span>{taskTypeLabel}</span>
                          <span>·</span>
                          <span>{freqLabel}</span>
                          {task.scheduleFrequency !== "hourly" && <span>בשעה {task.scheduleTime}</span>}
                          <span>·</span>
                          <span>{task.runCount} הרצות</span>
                        </div>
                        {task.lastRunAt && (
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                            הרצה אחרונה: {new Date(task.lastRunAt).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => runMutation.mutate(task.id)}
                        disabled={runMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs hover:bg-primary/20 transition-colors disabled:opacity-50"
                      >
                        <Play className="w-3.5 h-3.5" />
                        הרץ עכשיו
                      </button>
                      <button
                        onClick={() => setViewingLogs(isViewingLogs ? null : task.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${isViewingLogs ? "bg-blue-500/10 text-blue-400" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                      >
                        <History className="w-3.5 h-3.5" />
                        לוג
                      </button>
                      <button
                        onClick={() => toggleMutation.mutate({ id: task.id, isActive: task.isActive })}
                        className={`text-xs px-2 py-1 rounded-lg transition-colors ${task.isActive ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground"}`}
                      >
                        {task.isActive ? "פעיל" : "כבוי"}
                      </button>
                      <button onClick={() => setEditingTask(task)} className="p-1.5 hover:bg-muted rounded-lg">
                        <Settings className="w-4 h-4 text-muted-foreground" />
                      </button>
                      {isSuperAdmin && (
                        <button
                          onClick={async () => { const ok = await globalConfirm("מחיקת משימה", { itemName: task.name, entityType: "משימה מתוזמנת" }); if (ok) deleteMutation.mutate(task.id); }}
                          className="p-1.5 hover:bg-destructive/10 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {isViewingLogs && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-border/30 overflow-hidden">
                      <div className="p-4">
                        <h4 className="text-xs font-medium text-muted-foreground mb-2">היסטוריית הרצות</h4>
                        {executionLogs.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-4 text-center">אין הרצות עדיין</p>
                        ) : (
                          <div className="space-y-1.5">
                            {executionLogs.map((log) => {
                              const statusCfg = STATUS_CONFIG[log.status] || STATUS_CONFIG.success;
                              const StatusIcon = statusCfg.icon;
                              return (
                                <div key={log.id} className="flex items-start gap-3 text-xs p-2 rounded-lg bg-muted/20">
                                  <StatusIcon className={`w-3.5 h-3.5 ${statusCfg.color} flex-shrink-0 mt-0.5 ${log.status === "running" ? "animate-spin" : ""}`} />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className={statusCfg.color}>{statusCfg.label}</span>
                                      {log.duration && <span className="text-muted-foreground">{log.duration}ms</span>}
                                      <span className="text-muted-foreground mr-auto">{new Date(log.startedAt).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                                    </div>
                                    {log.output && <p className="text-muted-foreground mt-0.5 truncate">{log.output}</p>}
                                    {log.errorMessage && <p className="text-red-400 mt-0.5 truncate">{log.errorMessage}</p>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {(showCreate || editingTask) && (
          <TaskFormModal
            task={editingTask}
            taskTypes={taskTypes}
            onClose={() => { setShowCreate(false); setEditingTask(null); }}
            onSuccess={() => { setShowCreate(false); setEditingTask(null); queryClient.invalidateQueries({ queryKey: ["scheduled-tasks"] }); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function TaskFormModal({ task, taskTypes, onClose, onSuccess }: {
  task: ScheduledTask | null;
  taskTypes: TaskType[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    name: task?.name || "",
    description: task?.description || "",
    taskType: task?.taskType || taskTypes[0]?.type || "notification_check",
    scheduleFrequency: task?.scheduleFrequency || "daily",
    scheduleTime: task?.scheduleTime || "08:00",
    cronExpression: task?.cronExpression || "",
    isActive: task?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.name || !form.taskType) return;
    setSaving(true);
    try {
      const url = task ? `${API}/platform/scheduled-tasks/${task.id}` : `${API}/platform/scheduled-tasks`;
      const method = task ? "PUT" : "POST";
      await authFetch(url, { method, body: JSON.stringify({ ...form, cronExpression: form.cronExpression || null }) });
      onSuccess();
    } catch {}
    setSaving(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">{task ? "עריכת משימה" : "משימה מתוזמנת חדשה"}</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">שם *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">תיאור</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">סוג משימה *</label>
            <select value={form.taskType} onChange={e => setForm(f => ({ ...f, taskType: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm">
              {taskTypes.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">תדירות</label>
            <select value={form.scheduleFrequency} onChange={e => setForm(f => ({ ...f, scheduleFrequency: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm">
              {FREQUENCY_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          {form.scheduleFrequency !== "hourly" && (
            <div>
              <label className="block text-sm font-medium mb-1.5">שעת הרצה</label>
              <input type="time" value={form.scheduleTime} onChange={e => setForm(f => ({ ...f, scheduleTime: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1.5">ביטוי Cron (אופציונלי)</label>
            <input value={form.cronExpression} onChange={e => setForm(f => ({ ...f, cronExpression: e.target.value }))} placeholder="0 8 * * *" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
            <p className="text-[10px] text-muted-foreground mt-1">אם מוגדר, יגבר על תדירות וזמן. פורמט: דקה שעה יום חודש יום_בשבוע</p>
          </div>
          {task && (
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium">סטטוס</label>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${form.isActive ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground"}`}
              >
                {form.isActive ? "פעיל" : "כבוי"}
              </button>
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={submit} disabled={!form.name || !form.taskType || saving} className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50">
            {saving ? "שומר..." : task ? "עדכן משימה" : "צור משימה"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
