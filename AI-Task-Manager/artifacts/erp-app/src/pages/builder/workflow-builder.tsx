import { useState, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { usePlatformModules } from "@/hooks/usePlatformModules";
import {
  Plus, Trash2, Settings, GitBranch, Play, Pause, ChevronLeft,
  ArrowRight, ArrowDown, CheckCircle, Clock,
  Bell, FileEdit, Filter, Zap, Search,
  ChevronDown, ChevronUp, X, Mail, UserCheck, Timer,
  GitMerge, History, AlertCircle, Check, XCircle,
  Eye, Activity, MoreVertical, Circle, ArrowLeftRight, Layout
} from "lucide-react";

const VisualWorkflowDesigner = lazy(() => import("./visual-workflow-designer"));
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

interface Workflow {
  id: number;
  moduleId: number;
  name: string;
  slug: string;
  description: string | null;
  triggerType: string;
  triggerConfig: any;
  actions: any[];
  conditions: any[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowStep {
  id: number;
  workflowId: number;
  name: string;
  slug: string;
  stepType: string;
  description: string | null;
  config: any;
  sortOrder: number;
  isStart: boolean;
  isEnd: boolean;
  requiredRole: string | null;
  assigneeField: string | null;
  timeoutMinutes: number | null;
}

interface WorkflowTransition {
  id: number;
  workflowId: number;
  fromStepId: number;
  toStepId: number;
  name: string | null;
  conditions: any[];
  actionLabel: string | null;
  sortOrder: number;
}

interface WorkflowInstance {
  id: number;
  workflowId: number;
  workflowName?: string;
  entityId: number | null;
  recordId: number | null;
  currentStepId: number | null;
  status: string;
  startedBy: string | null;
  context: any;
  startedAt: string;
  completedAt: string | null;
}

interface StepLog {
  id: number;
  instanceId: number;
  stepId: number;
  stepName: string;
  stepType: string;
  action: string;
  performedBy: string | null;
  status: string;
  comments: string | null;
  data: any;
  createdAt: string;
}

interface PlatformModule {
  id: number;
  name: string;
  slug: string;
}

const TRIGGER_TYPES = [
  { type: "on_create", label: "יצירת רשומה", icon: Plus, color: "green" },
  { type: "on_update", label: "עדכון רשומה", icon: FileEdit, color: "blue" },
  { type: "on_status_change", label: "שינוי סטטוס", icon: ArrowRight, color: "purple" },
  { type: "on_delete", label: "מחיקת רשומה", icon: Trash2, color: "red" },
  { type: "manual", label: "הפעלה ידנית", icon: Play, color: "orange" },
  { type: "scheduled", label: "מתוזמן", icon: Clock, color: "cyan" },
];

const ACTION_TYPES = [
  { type: "update_field", label: "עדכן שדה", icon: FileEdit, color: "blue" },
  { type: "set_status", label: "שנה סטטוס", icon: ArrowRight, color: "purple" },
  { type: "send_notification", label: "שלח התראה", icon: Bell, color: "yellow" },
  { type: "send_email", label: "שלח אימייל", icon: Mail, color: "sky" },
  { type: "create_record", label: "צור רשומה", icon: Plus, color: "green" },
  { type: "call_webhook", label: "Webhook", icon: Zap, color: "indigo" },
  { type: "wait_delay", label: "המתנה", icon: Timer, color: "gray" },
  { type: "condition_check", label: "הסתעפות תנאי", icon: GitMerge, color: "orange" },
  { type: "approval", label: "אישור", icon: UserCheck, color: "emerald" },
];

const STEP_TYPES = [
  { type: "action", label: "פעולה", icon: Zap, color: "blue" },
  { type: "approval", label: "אישור", icon: UserCheck, color: "emerald" },
  { type: "review", label: "סקירה", icon: Eye, color: "purple" },
  { type: "notification", label: "התראה", icon: Bell, color: "yellow" },
  { type: "condition", label: "תנאי", icon: GitMerge, color: "orange" },
  { type: "wait", label: "המתנה", icon: Timer, color: "gray" },
];

export default function WorkflowBuilder() {
  const queryClient = useQueryClient();
  const [selectedModule, setSelectedModule] = useState<number | null>(null);
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [activeMainTab, setActiveMainTab] = useState<"workflows" | "monitoring">("workflows");

  const { modules } = usePlatformModules();

  const { data: workflows = [], isLoading } = useQuery<Workflow[]>({
    queryKey: ["workflows", selectedModule],
    queryFn: async () => {
      if (!selectedModule) return [];
      const r = await authFetch(`${API}/platform/modules/${selectedModule}/workflows`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!selectedModule,
  });

  const createWorkflowMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/modules/${selectedModule}/workflows`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create workflow");
      return r.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["workflows", selectedModule] });
      setShowCreate(false);
      setEditingWorkflow(data);
    },
  });

  const updateWorkflowMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const r = await authFetch(`${API}/platform/workflows/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update workflow");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows", selectedModule] });
    },
  });

  const deleteWorkflowMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/platform/workflows/${id}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflows", selectedModule] }),
  });

  if (editingWorkflow) {
    return (
      <WorkflowDesigner
        workflow={editingWorkflow}
        onBack={() => { setEditingWorkflow(null); queryClient.invalidateQueries({ queryKey: ["workflows", selectedModule] }); }}
        onSave={(data) => updateWorkflowMutation.mutate({ id: editingWorkflow.id, ...data })}
        isSaving={updateWorkflowMutation.isPending}
      />
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold">בונה תהליכים</h1>
          <p className="text-muted-foreground mt-1">צור תהליכים עם שלבים, מעברים, אישורים ומעקב instances</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-muted rounded-xl p-0.5">
            <button onClick={() => setActiveMainTab("workflows")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeMainTab === "workflows" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              <GitBranch className="w-4 h-4 inline-block ml-1" />
              תהליכים
            </button>
            <button onClick={() => setActiveMainTab("monitoring")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeMainTab === "monitoring" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              <Activity className="w-4 h-4 inline-block ml-1" />
              מעקב
            </button>
          </div>
          {selectedModule && activeMainTab === "workflows" && (
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
              <Plus className="w-5 h-5" />
              תהליך חדש
            </button>
          )}
        </div>
      </div>

      {activeMainTab === "monitoring" ? (
        <InstanceMonitoring />
      ) : !selectedModule ? (
        <div>
          <h2 className="text-lg font-semibold mb-3">בחר מודול</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {modules.map((mod, i) => (
              <motion.button key={mod.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                onClick={() => setSelectedModule(mod.id)}
                className="bg-card border border-border rounded-2xl p-5 text-right hover:border-primary/30 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <GitBranch className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{mod.name}</h3>
                    <p className="text-xs text-muted-foreground">{mod.slug}</p>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedModule(null)} className="p-2 hover:bg-muted rounded-lg transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-muted-foreground">{modules.find(m => m.id === selectedModule)?.name}</span>
            <div className="relative flex-1 max-w-md mr-auto">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש תהליכים..."
                className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : workflows.filter(w => !search || w.name.includes(search)).length === 0 ? (
            <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
              <GitBranch className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">אין תהליכים במודול זה</h3>
              <p className="text-muted-foreground mb-6">צור תהליך ראשון עם שלבים ומעברים</p>
              <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium">
                <Plus className="w-5 h-5" />
                צור תהליך ראשון
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {workflows.filter(w => !search || w.name.includes(search)).map((wf, i) => {
                const trigger = TRIGGER_TYPES.find(t => t.type === wf.triggerType) || TRIGGER_TYPES[0];
                const TriggerIcon = trigger.icon;
                return (
                  <motion.div key={wf.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                    className="bg-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${trigger.color === "green" ? "bg-green-500/10" : trigger.color === "blue" ? "bg-blue-500/10" : trigger.color === "purple" ? "bg-purple-500/10" : trigger.color === "red" ? "bg-red-500/10" : trigger.color === "orange" ? "bg-orange-500/10" : "bg-cyan-500/10"}`}>
                          <TriggerIcon className={`w-5 h-5 ${trigger.color === "green" ? "text-green-400" : trigger.color === "blue" ? "text-blue-400" : trigger.color === "purple" ? "text-purple-400" : trigger.color === "red" ? "text-red-400" : trigger.color === "orange" ? "text-orange-400" : "text-cyan-400"}`} />
                        </div>
                        <div>
                          <h3 className="font-semibold">{wf.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">{trigger.label}</span>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground">{(wf.actions as any[]).length} פעולות</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateWorkflowMutation.mutate({ id: wf.id, isActive: !wf.isActive })}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${wf.isActive ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground"}`}>
                          {wf.isActive ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                          {wf.isActive ? "פעיל" : "מושהה"}
                        </button>
                        <button onClick={() => setEditingWorkflow(wf)} className="p-2 hover:bg-muted rounded-lg transition-colors">
                          <Settings className="w-4 h-4 text-muted-foreground" />
                        </button>
                        {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק תהליך?"); if (ok) deleteWorkflowMutation.mutate(wf.id); }}
                          className="p-2 hover:bg-destructive/10 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </button>}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {showCreate && (
          <CreateWorkflowModal
            onClose={() => setShowCreate(false)}
            onSubmit={(data) => createWorkflowMutation.mutate(data)}
            isLoading={createWorkflowMutation.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function CreateWorkflowModal({ onClose, onSubmit, isLoading }: {
  onClose: () => void;
  onSubmit: (data: any) => void;
  isLoading: boolean;
}) {
  const [form, setForm] = useState({ name: "", slug: "", description: "", triggerType: "on_create", triggerConfig: {} as any });
  const autoSlug = (name: string) => name.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">תהליך חדש</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">שם התהליך</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: autoSlug(e.target.value) }))}
              placeholder="למשל: אישור הזמנה" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">תיאור</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="תיאור קצר..." className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">טריגר</label>
            <div className="grid grid-cols-2 gap-2">
              {TRIGGER_TYPES.map(t => {
                const Icon = t.icon;
                return (
                  <button key={t.type} type="button" onClick={() => setForm(f => ({ ...f, triggerType: t.type, triggerConfig: {} }))}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-sm transition-all ${form.triggerType === t.type ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/30"}`}>
                    <Icon className="w-4 h-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={() => onSubmit(form)} disabled={!form.name || !form.slug || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50">
            {isLoading ? "יוצר..." : "צור והמשך לעורך"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function WorkflowDesigner({ workflow, onBack, onSave, isSaving }: {
  workflow: Workflow;
  onBack: () => void;
  onSave: (data: any) => void;
  isSaving: boolean;
}) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"canvas" | "steps" | "actions" | "instances" | "history">("canvas");
  const [conditions, setConditions] = useState<any[]>(Array.isArray(workflow.conditions) ? workflow.conditions : []);
  const [actions, setActions] = useState<any[]>(Array.isArray(workflow.actions) ? workflow.actions : []);
  const [showAddStep, setShowAddStep] = useState(false);
  const [showAddTransition, setShowAddTransition] = useState(false);
  const [showAddAction, setShowAddAction] = useState(false);

  const trigger = TRIGGER_TYPES.find(t => t.type === workflow.triggerType) || TRIGGER_TYPES[0];
  const TriggerIcon = trigger.icon;

  const { data: steps = [], refetch: refetchSteps } = useQuery<WorkflowStep[]>({
    queryKey: ["workflow-steps", workflow.id],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/workflows/${workflow.id}/steps`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: transitions = [], refetch: refetchTransitions } = useQuery<WorkflowTransition[]>({
    queryKey: ["workflow-transitions", workflow.id],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/workflows/${workflow.id}/transitions`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const createStepMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/workflows/${workflow.id}/steps`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => { refetchSteps(); setShowAddStep(false); },
  });

  const deleteStepMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/platform/workflow-steps/${id}`, { method: "DELETE" });
    },
    onSuccess: () => { refetchSteps(); refetchTransitions(); },
  });

  const updateStepMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const r = await authFetch(`${API}/platform/workflow-steps/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => refetchSteps(),
  });

  const createTransitionMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/workflows/${workflow.id}/transitions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => { refetchTransitions(); setShowAddTransition(false); },
  });

  const deleteTransitionMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/platform/workflow-transitions/${id}`, { method: "DELETE" });
    },
    onSuccess: () => refetchTransitions(),
  });

  const addAction = (actionType: string) => {
    const actionDef = ACTION_TYPES.find(a => a.type === actionType);
    const defaultConfig: Record<string, any> = {};
    if (actionType === "condition_check") {
      defaultConfig.conditions = [{ field: "", operator: "equals", value: "" }];
      defaultConfig.ifActions = [];
      defaultConfig.elseActions = [];
    }
    if (actionType === "wait_delay") {
      defaultConfig.duration = 5;
      defaultConfig.unit = "minutes";
    }
    if (actionType === "approval") {
      defaultConfig.approver = "";
      defaultConfig.onApprove = [];
      defaultConfig.onReject = [];
    }
    setActions([...actions, {
      id: `step-${Date.now()}`,
      type: actionType,
      label: actionDef?.label || actionType,
      config: defaultConfig,
    }]);
    setShowAddAction(false);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold">{workflow.name}</h1>
            <p className="text-sm text-muted-foreground">עורך תהליך — שלבים, מעברים, אישורים ומעקב</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-muted rounded-xl p-0.5">
            <button onClick={() => setActiveTab("canvas")}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "canvas" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              <Layout className="w-4 h-4 inline-block ml-1" />
              קנבס
            </button>
            <button onClick={() => setActiveTab("steps")}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "steps" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              <GitBranch className="w-4 h-4 inline-block ml-1" />
              שלבים
            </button>
            <button onClick={() => setActiveTab("actions")}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "actions" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              <Zap className="w-4 h-4 inline-block ml-1" />
              פעולות
            </button>
            <button onClick={() => setActiveTab("instances")}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "instances" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              <Activity className="w-4 h-4 inline-block ml-1" />
              ריצות
            </button>
            <button onClick={() => setActiveTab("history")}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "history" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              <History className="w-4 h-4 inline-block ml-1" />
              היסטוריה
            </button>
          </div>
          {(activeTab === "actions") && (
            <button onClick={() => onSave({ actions, conditions })} disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50">
              {isSaving ? "שומר..." : "שמור"}
            </button>
          )}
        </div>
      </div>

      <div className="bg-card border-2 border-green-500/30 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
            <TriggerIcon className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <p className="text-xs text-green-400 font-medium">טריגר</p>
            <h3 className="font-semibold">{trigger.label}</h3>
          </div>
          <div className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span>{steps.length} שלבים</span>
            <span>·</span>
            <span>{transitions.length} מעברים</span>
            <span>·</span>
            <span>{(actions).length} פעולות</span>
          </div>
        </div>
      </div>

      {activeTab === "canvas" && (
        <div className="h-[75vh] rounded-2xl overflow-hidden border border-border">
          <Suspense fallback={
            <div className="flex items-center justify-center h-full bg-card">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          }>
            <VisualWorkflowDesigner workflowId={workflow.id} workflowName={workflow.name} />
          </Suspense>
        </div>
      )}

      {activeTab === "steps" && (
        <StepsDesigner
          steps={steps}
          transitions={transitions}
          showAddStep={showAddStep}
          setShowAddStep={setShowAddStep}
          showAddTransition={showAddTransition}
          setShowAddTransition={setShowAddTransition}
          onCreateStep={(data) => createStepMutation.mutate(data)}
          onDeleteStep={async (id) => { if (await globalConfirm("למחוק שלב?")) deleteStepMutation.mutate(id); }}
          onUpdateStep={(data) => updateStepMutation.mutate(data)}
          onCreateTransition={(data) => createTransitionMutation.mutate(data)}
          onDeleteTransition={(id) => deleteTransitionMutation.mutate(id)}
          isCreatingStep={createStepMutation.isPending}
        />
      )}

      {activeTab === "actions" && (
        <ActionsEditor
          actions={actions}
          setActions={setActions}
          conditions={conditions}
          setConditions={setConditions}
          showAddAction={showAddAction}
          setShowAddAction={setShowAddAction}
          addAction={addAction}
        />
      )}

      {activeTab === "instances" && (
        <WorkflowInstances workflowId={workflow.id} steps={steps} />
      )}

      {activeTab === "history" && (
        <WorkflowExecutionHistory workflowId={workflow.id} />
      )}
    </div>
  );
}

function StepsDesigner({ steps, transitions, showAddStep, setShowAddStep, showAddTransition, setShowAddTransition,
  onCreateStep, onDeleteStep, onUpdateStep, onCreateTransition, onDeleteTransition, isCreatingStep }: {
  steps: WorkflowStep[];
  transitions: WorkflowTransition[];
  showAddStep: boolean;
  setShowAddStep: (v: boolean) => void;
  showAddTransition: boolean;
  setShowAddTransition: (v: boolean) => void;
  onCreateStep: (data: any) => void;
  onDeleteStep: (id: number) => void;
  onUpdateStep: (data: any) => void;
  onCreateTransition: (data: any) => void;
  onDeleteTransition: (id: number) => void;
  isCreatingStep: boolean;
}) {
  const [newStep, setNewStep] = useState({ name: "", slug: "", stepType: "action", description: "", isStart: false, isEnd: false });
  const [newTransition, setNewTransition] = useState({ fromStepId: "", toStepId: "", name: "", actionLabel: "" });
  const autoSlug = (name: string) => name.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">שלבי התהליך</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowAddTransition(true)} className="flex items-center gap-2 px-3 py-2 bg-purple-500/10 text-purple-400 rounded-xl text-sm font-medium hover:bg-purple-500/20">
            <ArrowLeftRight className="w-4 h-4" />
            מעבר חדש
          </button>
          <button onClick={() => setShowAddStep(true)} className="flex items-center gap-2 px-3 py-2 bg-primary/10 text-primary rounded-xl text-sm font-medium hover:bg-primary/20">
            <Plus className="w-4 h-4" />
            שלב חדש
          </button>
        </div>
      </div>

      {steps.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
          <Circle className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">אין שלבים עדיין. הוסף שלב ראשון לתהליך.</p>
          <button onClick={() => setShowAddStep(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
            <Plus className="w-4 h-4" />
            הוסף שלב ראשון
          </button>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto space-y-0">
          {steps.map((step, i) => {
            const stepDef = STEP_TYPES.find(s => s.type === step.stepType) || STEP_TYPES[0];
            const StepIcon = stepDef.icon;
            const outTransitions = transitions.filter(t => t.fromStepId === step.id);

            return (
              <div key={step.id}>
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className={`bg-card border-2 rounded-2xl p-4 relative ${step.isStart ? "border-green-500/40" : step.isEnd ? "border-red-500/40" : "border-border"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-${stepDef.color}-500/10`}>
                        <StepIcon className={`w-4 h-4 text-${stepDef.color}-400`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground font-mono">#{i + 1}</span>
                          <h3 className="font-semibold text-sm">{step.name}</h3>
                          {step.isStart && <span className="px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded text-[10px] font-medium">התחלה</span>}
                          {step.isEnd && <span className="px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded text-[10px] font-medium">סיום</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">{stepDef.label}</span>
                          {step.requiredRole && <span className="text-xs text-yellow-400">תפקיד: {step.requiredRole}</span>}
                          {step.timeoutMinutes && <span className="text-xs text-orange-400">timeout: {step.timeoutMinutes}ד׳</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {!step.isStart && (
                        <button onClick={() => onUpdateStep({ id: step.id, isStart: true })}
                          className="p-1.5 hover:bg-green-500/10 rounded-lg text-muted-foreground hover:text-green-400 transition-colors" title="סמן כהתחלה">
                          <Circle className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => onDeleteStep(step.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg transition-colors">
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </button>
                    </div>
                  </div>
                  {step.description && <p className="text-xs text-muted-foreground mt-2 mr-11">{step.description}</p>}
                </motion.div>

                {outTransitions.length > 0 && (
                  <div className="flex flex-col items-center py-1">
                    {outTransitions.map(t => {
                      const toStep = steps.find(s => s.id === t.toStepId);
                      return (
                        <div key={t.id} className="flex items-center gap-2 py-1 group">
                          <ArrowDown className="w-4 h-4 text-purple-400" />
                          <span className="text-xs text-purple-400">{t.actionLabel || t.name || "מעבר"}</span>
                          <span className="text-xs text-muted-foreground">→ {toStep?.name || `#${t.toStepId}`}</span>
                          <button onClick={() => onDeleteTransition(t.id)} className="p-0.5 hover:bg-destructive/10 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                            <X className="w-3 h-3 text-destructive" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {i < steps.length - 1 && outTransitions.length === 0 && (
                  <div className="flex justify-center py-2">
                    <ArrowDown className="w-4 h-4 text-border" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {transitions.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold mb-3 text-purple-400">כל המעברים</h3>
          <div className="space-y-2">
            {transitions.map(t => {
              const from = steps.find(s => s.id === t.fromStepId);
              const to = steps.find(s => s.id === t.toStepId);
              return (
                <div key={t.id} className="flex items-center gap-3 bg-card border border-border rounded-xl p-3 text-sm group">
                  <ArrowLeftRight className="w-4 h-4 text-purple-400 flex-shrink-0" />
                  <span className="font-medium">{from?.name || "?"}</span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium">{to?.name || "?"}</span>
                  {t.actionLabel && <span className="text-xs text-muted-foreground mr-2">({t.actionLabel})</span>}
                  <button onClick={() => onDeleteTransition(t.id)} className="mr-auto p-1 hover:bg-destructive/10 rounded opacity-0 group-hover:opacity-100">
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <AnimatePresence>
        {showAddStep && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddStep(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-bold mb-4">שלב חדש</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">שם השלב</label>
                  <input value={newStep.name} onChange={e => setNewStep(f => ({ ...f, name: e.target.value, slug: autoSlug(e.target.value) }))}
                    placeholder="למשל: בדיקת מנהל" className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">סוג שלב</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {STEP_TYPES.map(st => {
                      const Icon = st.icon;
                      return (
                        <button key={st.type} onClick={() => setNewStep(f => ({ ...f, stepType: st.type }))}
                          className={`flex items-center gap-1.5 p-2 rounded-lg border text-xs transition-all ${newStep.stepType === st.type ? "border-primary bg-primary/10" : "border-border"}`}>
                          <Icon className="w-3.5 h-3.5" />
                          {st.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">תיאור</label>
                  <input value={newStep.description} onChange={e => setNewStep(f => ({ ...f, description: e.target.value }))}
                    placeholder="תיאור אופציונלי" className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm" />
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={newStep.isStart} onChange={e => setNewStep(f => ({ ...f, isStart: e.target.checked }))} className="rounded" />
                    שלב התחלה
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={newStep.isEnd} onChange={e => setNewStep(f => ({ ...f, isEnd: e.target.checked }))} className="rounded" />
                    שלב סיום
                  </label>
                </div>
              </div>
              <div className="flex gap-3 mt-5 pt-4 border-t border-border">
                <button onClick={() => { onCreateStep({ ...newStep, sortOrder: steps.length }); setNewStep({ name: "", slug: "", stepType: "action", description: "", isStart: false, isEnd: false }); }}
                  disabled={!newStep.name || isCreatingStep} className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium disabled:opacity-50">
                  {isCreatingStep ? "יוצר..." : "הוסף שלב"}
                </button>
                <button onClick={() => setShowAddStep(false)} className="px-4 py-2 bg-muted rounded-xl text-sm">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showAddTransition && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddTransition(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-bold mb-4">מעבר חדש</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">משלב</label>
                  <select value={newTransition.fromStepId} onChange={e => setNewTransition(f => ({ ...f, fromStepId: e.target.value }))}
                    className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm">
                    <option value="">בחר שלב מקור</option>
                    {steps.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">לשלב</label>
                  <select value={newTransition.toStepId} onChange={e => setNewTransition(f => ({ ...f, toStepId: e.target.value }))}
                    className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm">
                    <option value="">בחר שלב יעד</option>
                    {steps.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">שם המעבר</label>
                  <input value={newTransition.name} onChange={e => setNewTransition(f => ({ ...f, name: e.target.value }))}
                    placeholder="למשל: אשר" className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">תווית כפתור</label>
                  <input value={newTransition.actionLabel} onChange={e => setNewTransition(f => ({ ...f, actionLabel: e.target.value }))}
                    placeholder="למשל: המשך" className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm" />
                </div>
              </div>
              <div className="flex gap-3 mt-5 pt-4 border-t border-border">
                <button onClick={() => {
                  onCreateTransition({ fromStepId: Number(newTransition.fromStepId), toStepId: Number(newTransition.toStepId), name: newTransition.name, actionLabel: newTransition.actionLabel });
                  setNewTransition({ fromStepId: "", toStepId: "", name: "", actionLabel: "" });
                }} disabled={!newTransition.fromStepId || !newTransition.toStepId}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium disabled:opacity-50">
                  הוסף מעבר
                </button>
                <button onClick={() => setShowAddTransition(false)} className="px-4 py-2 bg-muted rounded-xl text-sm">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActionsEditor({ actions, setActions, conditions, setConditions, showAddAction, setShowAddAction, addAction }: {
  actions: any[];
  setActions: (a: any[]) => void;
  conditions: any[];
  setConditions: (c: any[]) => void;
  showAddAction: boolean;
  setShowAddAction: (v: boolean) => void;
  addAction: (type: string) => void;
}) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  const removeAction = (index: number) => setActions(actions.filter((_, i) => i !== index));
  const updateActionConfig = (index: number, config: any) => setActions(actions.map((a, i) => i === index ? { ...a, config } : a));
  const moveAction = (index: number, direction: "up" | "down") => {
    const newActions = [...actions];
    const swapIdx = direction === "up" ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= newActions.length) return;
    [newActions[index], newActions[swapIdx]] = [newActions[swapIdx], newActions[index]];
    setActions(newActions);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {conditions.length > 0 && (
        <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-orange-400 mb-3">תנאים לביצוע</h3>
          {conditions.map((cond, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <input value={cond.field || ""} onChange={e => { const c = [...conditions]; c[i] = { ...c[i], field: e.target.value }; setConditions(c); }}
                placeholder="שדה" className="flex-1 px-2 py-1.5 bg-background border border-border rounded-lg text-xs" />
              <select value={cond.operator || "equals"} onChange={e => { const c = [...conditions]; c[i] = { ...c[i], operator: e.target.value }; setConditions(c); }}
                className="px-2 py-1.5 bg-background border border-border rounded-lg text-xs">
                <option value="equals">שווה</option>
                <option value="not_equals">לא שווה</option>
                <option value="contains">מכיל</option>
                <option value="gt">גדול מ</option>
                <option value="lt">קטן מ</option>
              </select>
              <input value={cond.value || ""} onChange={e => { const c = [...conditions]; c[i] = { ...c[i], value: e.target.value }; setConditions(c); }}
                placeholder="ערך" className="flex-1 px-2 py-1.5 bg-background border border-border rounded-lg text-xs" />
              <button onClick={() => setConditions(conditions.filter((_, idx) => idx !== i))} className="p-1 hover:bg-destructive/10 rounded">
                <X className="w-3 h-3 text-destructive" />
              </button>
            </div>
          ))}
          <button onClick={() => setConditions([...conditions, { field: "", operator: "equals", value: "" }])}
            className="text-xs text-orange-400 hover:text-orange-300 mt-1">+ הוסף תנאי</button>
        </div>
      )}

      {actions.map((action, i) => {
        const actionDef = ACTION_TYPES.find(a => a.type === action.type);
        const Icon = actionDef?.icon || Zap;
        const isExpanded = expandedStep === i;
        return (
          <div key={action.id || i}>
            {i > 0 && (
              <div className="flex justify-center py-1">
                <ArrowDown className="w-4 h-4 text-muted-foreground/50" />
              </div>
            )}
            <motion.div className="bg-card border border-border rounded-2xl overflow-hidden" layout>
              <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setExpandedStep(isExpanded ? null : i)}>
                <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center text-xs font-bold text-blue-400">{i + 1}</div>
                <Icon className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium text-sm flex-1">{action.label || actionDef?.label || action.type}</span>
                <div className="flex items-center gap-1">
                  <button onClick={e => { e.stopPropagation(); moveAction(i, "up"); }} disabled={i === 0} className="p-1 hover:bg-muted rounded disabled:opacity-30">
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={e => { e.stopPropagation(); moveAction(i, "down"); }} disabled={i === actions.length - 1} className="p-1 hover:bg-muted rounded disabled:opacity-30">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={e => { e.stopPropagation(); removeAction(i); }} className="p-1 hover:bg-destructive/10 rounded">
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="border-t border-border p-4">
                  <ActionConfigEditor action={action} onChange={(config) => updateActionConfig(i, config)} />
                </div>
              )}
            </motion.div>
          </div>
        );
      })}

      <button onClick={() => setShowAddAction(true)} className="w-full border-2 border-dashed border-border rounded-2xl p-4 text-center text-muted-foreground hover:border-primary/30 hover:text-primary transition-all">
        <Plus className="w-5 h-5 mx-auto mb-1" />
        <span className="text-sm">הוסף פעולה</span>
      </button>

      <AnimatePresence>
        {showAddAction && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddAction(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold mb-4">בחר סוג פעולה</h3>
              <div className="grid grid-cols-2 gap-2">
                {ACTION_TYPES.map(at => {
                  const Icon = at.icon;
                  return (
                    <button key={at.type} onClick={() => addAction(at.type)}
                      className="flex items-center gap-2 p-3 rounded-xl border border-border hover:border-primary/30 transition-all text-sm">
                      <Icon className="w-4 h-4" />
                      {at.label}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActionConfigEditor({ action, onChange }: { action: any; onChange: (config: any) => void }) {
  const config = action.config || {};

  switch (action.type) {
    case "update_field":
      return (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">שם שדה (slug)</label>
            <input value={config.fieldSlug || ""} onChange={e => onChange({ ...config, fieldSlug: e.target.value })}
              placeholder="field_slug" className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">ערך חדש</label>
            <input value={config.value || ""} onChange={e => onChange({ ...config, value: e.target.value })}
              placeholder="value" className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
          </div>
        </div>
      );
    case "set_status":
    case "change_status":
      return (
        <div>
          <label className="block text-xs font-medium mb-1">סטטוס חדש</label>
          <input value={config.status || ""} onChange={e => onChange({ ...config, status: e.target.value })}
            placeholder="active / completed / approved" className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
        </div>
      );
    case "send_notification":
      return (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">כותרת</label>
            <input value={config.title || ""} onChange={e => onChange({ ...config, title: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">הודעה</label>
            <textarea value={config.message || ""} onChange={e => onChange({ ...config, message: e.target.value })} rows={2}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm resize-none" />
          </div>
        </div>
      );
    case "send_email":
      return (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">אימייל נמען</label>
            <input value={config.to || ""} onChange={e => onChange({ ...config, to: e.target.value })}
              placeholder="email@example.com" className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">נושא</label>
            <input value={config.subject || ""} onChange={e => onChange({ ...config, subject: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">תוכן</label>
            <textarea value={config.body || ""} onChange={e => onChange({ ...config, body: e.target.value })} rows={3}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm resize-none" />
          </div>
        </div>
      );
    case "create_record":
      return (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">מזהה ישות</label>
            <input type="number" value={config.entityId || ""} onChange={e => onChange({ ...config, entityId: Number(e.target.value) })}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">נתונים (JSON)</label>
            <textarea value={typeof config.data === "object" ? JSON.stringify(config.data, null, 2) : (config.data || "")}
              onChange={e => { try { onChange({ ...config, data: JSON.parse(e.target.value) }); } catch { } }} rows={3}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono resize-none" />
          </div>
        </div>
      );
    case "wait_delay":
    case "delay":
      return (
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium mb-1">משך</label>
            <input type="number" min={1} value={config.duration || ""} onChange={e => onChange({ ...config, duration: Number(e.target.value) })}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium mb-1">יחידה</label>
            <select value={config.unit || "minutes"} onChange={e => onChange({ ...config, unit: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm">
              <option value="seconds">שניות</option>
              <option value="minutes">דקות</option>
              <option value="hours">שעות</option>
            </select>
          </div>
        </div>
      );
    default:
      return (
        <div>
          <label className="block text-xs font-medium mb-1">הגדרות (JSON)</label>
          <textarea value={JSON.stringify(config, null, 2)} onChange={e => { try { onChange(JSON.parse(e.target.value)); } catch { } }} rows={4}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono resize-none" />
        </div>
      );
  }
}

function WorkflowInstances({ workflowId, steps }: { workflowId: number; steps: WorkflowStep[] }) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedInstance, setSelectedInstance] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{ instances: WorkflowInstance[]; total: number }>({
    queryKey: ["workflow-instances", workflowId, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const r = await authFetch(`${API}/platform/workflows/${workflowId}/instances?${params}`);
      if (!r.ok) return { instances: [], total: 0 };
      return r.json();
    },
  });

  const createInstanceMutation = useMutation({
    mutationFn: async () => {
      const r = await authFetch(`${API}/platform/workflows/${workflowId}/instances`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflow-instances", workflowId] }),
  });

  if (selectedInstance) {
    return <InstanceDetail instanceId={selectedInstance} steps={steps} onBack={() => setSelectedInstance(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">ריצות פעילות</h2>
        <div className="flex items-center gap-3">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-card border border-border rounded-xl text-sm">
            <option value="">כל הסטטוסים</option>
            <option value="active">פעיל</option>
            <option value="completed">הושלם</option>
            <option value="rejected">נדחה</option>
            <option value="cancelled">בוטל</option>
          </select>
          <button onClick={() => createInstanceMutation.mutate()} disabled={createInstanceMutation.isPending}
            className="flex items-center gap-2 px-3 py-2 bg-primary/10 text-primary rounded-xl text-sm font-medium hover:bg-primary/20">
            <Play className="w-4 h-4" />
            הפעל ריצה חדשה
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data?.instances.length ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center text-muted-foreground">
          <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>אין ריצות בתהליך זה</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(data?.instances || []).map(inst => {
            const currentStep = steps.find(s => s.id === inst.currentStepId);
            return (
              <div key={inst.id} onClick={() => setSelectedInstance(inst.id)}
                className="bg-card border border-border rounded-xl p-4 cursor-pointer hover:border-primary/30 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${inst.status === "active" ? "bg-green-400 animate-pulse" : inst.status === "completed" ? "bg-blue-400" : inst.status === "rejected" ? "bg-red-400" : "bg-gray-400"}`} />
                    <div>
                      <span className="font-medium text-sm">ריצה #{inst.id}</span>
                      {inst.recordId && <span className="text-xs text-muted-foreground mr-2">רשומה #{inst.recordId}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {currentStep && <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded-lg">{currentStep.name}</span>}
                    <span className={`px-2 py-1 rounded-lg ${inst.status === "active" ? "bg-green-500/10 text-green-400" : inst.status === "completed" ? "bg-blue-500/10 text-blue-400" : inst.status === "rejected" ? "bg-red-500/10 text-red-400" : "bg-muted"}`}>
                      {inst.status === "active" ? "פעיל" : inst.status === "completed" ? "הושלם" : inst.status === "rejected" ? "נדחה" : inst.status}
                    </span>
                    <span>{new Date(inst.startedAt).toLocaleString("he-IL")}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InstanceDetail({ instanceId, steps: parentSteps, onBack }: { instanceId: number; steps: WorkflowStep[]; onBack: () => void }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{
    instance: WorkflowInstance;
    steps: WorkflowStep[];
    transitions: WorkflowTransition[];
    logs: StepLog[];
    workflow: Workflow;
  }>({
    queryKey: ["workflow-instance-detail", instanceId],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/workflow-instances/${instanceId}`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const advanceMutation = useMutation({
    mutationFn: async (body: any) => {
      const r = await authFetch(`${API}/platform/workflow-instances/${instanceId}/advance`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) { const err = await r.json(); throw new Error(err.message); }
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflow-instance-detail", instanceId] }),
  });

  const approveMutation = useMutation({
    mutationFn: async (body: any) => {
      const r = await authFetch(`${API}/platform/workflow-instances/${instanceId}/approve`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) { const err = await r.json(); throw new Error(err.message); }
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflow-instance-detail", instanceId] }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (body: any) => {
      const r = await authFetch(`${API}/platform/workflow-instances/${instanceId}/reject`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflow-instance-detail", instanceId] }),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const r = await authFetch(`${API}/platform/workflow-instances/${instanceId}/cancel`, { method: "POST" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflow-instance-detail", instanceId] }),
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const { instance, steps, transitions, logs } = data;
  const currentStep = steps.find(s => s.id === instance.currentStepId);
  const availableTransitions = instance.currentStepId
    ? transitions.filter(t => t.fromStepId === instance.currentStepId)
    : [];
  const isApprovalStep = currentStep?.stepType === "approval" || currentStep?.stepType === "review";

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-muted rounded-lg">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-xl font-bold">ריצה #{instance.id}</h2>
          <p className="text-sm text-muted-foreground">{data.workflow?.name}</p>
        </div>
        <div className="mr-auto flex items-center gap-2">
          <span className={`px-3 py-1.5 rounded-xl text-sm font-medium ${instance.status === "active" ? "bg-green-500/10 text-green-400" : instance.status === "completed" ? "bg-blue-500/10 text-blue-400" : instance.status === "rejected" ? "bg-red-500/10 text-red-400" : "bg-muted"}`}>
            {instance.status === "active" ? "פעיל" : instance.status === "completed" ? "הושלם" : instance.status === "rejected" ? "נדחה" : instance.status}
          </span>
          {instance.status === "active" && (
            <button onClick={() => cancelMutation.mutate()} className="px-3 py-1.5 bg-destructive/10 text-destructive rounded-xl text-sm font-medium hover:bg-destructive/20">
              ביטול ריצה
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">שלבי התהליך</h3>
          <div className="space-y-0">
            {steps.map((step, i) => {
              const isCurrent = step.id === instance.currentStepId;
              const stepLogs = logs.filter(l => l.stepId === step.id);
              const isCompleted = stepLogs.some(l => l.action === "completed" || l.action === "approved");
              const isRejected = stepLogs.some(l => l.action === "rejected");
              const stepDef = STEP_TYPES.find(s => s.type === step.stepType) || STEP_TYPES[0];

              return (
                <div key={step.id}>
                  <div className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${isCurrent ? "border-primary bg-primary/5" : isCompleted ? "border-green-500/30 bg-green-500/5" : isRejected ? "border-red-500/30 bg-red-500/5" : "border-transparent"}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isCompleted ? "bg-green-500/20" : isRejected ? "bg-red-500/20" : isCurrent ? "bg-primary/20 animate-pulse" : "bg-muted"}`}>
                      {isCompleted ? <Check className="w-4 h-4 text-green-400" /> :
                       isRejected ? <XCircle className="w-4 h-4 text-red-400" /> :
                       isCurrent ? <Circle className="w-4 h-4 text-primary" /> :
                       <Circle className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{step.name}</p>
                      <p className="text-xs text-muted-foreground">{stepDef.label}</p>
                    </div>
                    {isCurrent && <span className="text-xs text-primary font-medium">נוכחי</span>}
                  </div>
                  {i < steps.length - 1 && (
                    <div className="flex justify-center py-0.5">
                      <div className={`w-0.5 h-4 ${isCompleted ? "bg-green-500/30" : "bg-border"}`} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {instance.status === "active" && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-semibold">פעולות זמינות</h4>
              {isApprovalStep && (
                <div className="flex gap-2">
                  <button onClick={() => approveMutation.mutate({})} disabled={approveMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500/10 text-green-400 rounded-xl text-sm font-medium hover:bg-green-500/20 disabled:opacity-50">
                    <Check className="w-4 h-4" />
                    אשר
                  </button>
                  <button onClick={() => rejectMutation.mutate({})} disabled={rejectMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/10 text-red-400 rounded-xl text-sm font-medium hover:bg-red-500/20 disabled:opacity-50">
                    <XCircle className="w-4 h-4" />
                    דחה
                  </button>
                </div>
              )}
              {availableTransitions.length > 0 && (
                <div className="space-y-2">
                  {availableTransitions.map(t => {
                    const toStep = steps.find(s => s.id === t.toStepId);
                    return (
                      <button key={t.id} onClick={() => advanceMutation.mutate({ transitionId: t.id })}
                        disabled={advanceMutation.isPending}
                        className="w-full flex items-center gap-2 px-4 py-2.5 bg-primary/10 text-primary rounded-xl text-sm font-medium hover:bg-primary/20 disabled:opacity-50">
                        <ArrowRight className="w-4 h-4" />
                        {t.actionLabel || t.name || `המשך ל: ${toStep?.name}`}
                      </button>
                    );
                  })}
                </div>
              )}
              {!isApprovalStep && availableTransitions.length === 0 && (
                <p className="text-xs text-muted-foreground">אין מעברים מוגדרים מהשלב הנוכחי</p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">לוג פעולות</h3>
          {logs.length === 0 ? (
            <div className="bg-card border border-dashed border-border rounded-xl p-6 text-center text-muted-foreground text-sm">
              אין רשומות עדיין
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map(log => (
                <div key={log.id} className="bg-card border border-border rounded-xl p-3">
                  <div className="flex items-center gap-2 justify-between">
                    <div className="flex items-center gap-2">
                      {log.action === "approved" ? <Check className="w-4 h-4 text-green-400" /> :
                       log.action === "rejected" ? <XCircle className="w-4 h-4 text-red-400" /> :
                       log.action === "completed" ? <CheckCircle className="w-4 h-4 text-blue-400" /> :
                       <Circle className="w-4 h-4 text-muted-foreground" />}
                      <span className="text-sm font-medium">{log.stepName || `שלב #${log.stepId}`}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${log.action === "approved" ? "bg-green-500/10 text-green-400" : log.action === "rejected" ? "bg-red-500/10 text-red-400" : log.action === "completed" ? "bg-blue-500/10 text-blue-400" : "bg-muted text-muted-foreground"}`}>
                        {log.action === "entered" ? "נכנס" : log.action === "completed" ? "הושלם" : log.action === "approved" ? "אושר" : log.action === "rejected" ? "נדחה" : log.action}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString("he-IL")}</span>
                  </div>
                  {log.comments && <p className="text-xs text-muted-foreground mt-1 mr-6">{log.comments}</p>}
                  {log.performedBy && <p className="text-xs text-muted-foreground mt-0.5 mr-6">ע״י: {log.performedBy}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InstanceMonitoring() {
  const [statusFilter, setStatusFilter] = useState("active");

  const { data, isLoading } = useQuery<{ instances: (WorkflowInstance & { workflowName: string })[]; total: number }>({
    queryKey: ["all-workflow-instances", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", "100");
      const r = await authFetch(`${API}/platform/workflow-instances?${params}`);
      if (!r.ok) return { instances: [], total: 0 };
      return r.json();
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">מעקב ריצות</h2>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-card border border-border rounded-xl text-sm">
          <option value="">הכל</option>
          <option value="active">פעיל</option>
          <option value="completed">הושלם</option>
          <option value="rejected">נדחה</option>
          <option value="cancelled">בוטל</option>
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-lg sm:text-2xl font-bold text-green-400">{data?.instances.filter(i => i.status === "active").length || 0}</p>
          <p className="text-xs text-muted-foreground">פעילות</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-lg sm:text-2xl font-bold text-blue-400">{data?.instances.filter(i => i.status === "completed").length || 0}</p>
          <p className="text-xs text-muted-foreground">הושלמו</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-lg sm:text-2xl font-bold text-red-400">{data?.instances.filter(i => i.status === "rejected").length || 0}</p>
          <p className="text-xs text-muted-foreground">נדחו</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-lg sm:text-2xl font-bold">{data?.total || 0}</p>
          <p className="text-xs text-muted-foreground">סה״כ</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data?.instances.length ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center text-muted-foreground">
          <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>אין ריצות פעילות</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(data?.instances || []).map(inst => (
            <div key={inst.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${inst.status === "active" ? "bg-green-400 animate-pulse" : inst.status === "completed" ? "bg-blue-400" : inst.status === "rejected" ? "bg-red-400" : "bg-gray-400"}`} />
                  <div>
                    <span className="font-medium text-sm">#{inst.id} — {inst.workflowName || "תהליך"}</span>
                    {inst.recordId && <span className="text-xs text-muted-foreground mr-2">רשומה #{inst.recordId}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className={`px-2 py-1 rounded-lg ${inst.status === "active" ? "bg-green-500/10 text-green-400" : inst.status === "completed" ? "bg-blue-500/10 text-blue-400" : inst.status === "rejected" ? "bg-red-500/10 text-red-400" : "bg-muted"}`}>
                    {inst.status === "active" ? "פעיל" : inst.status === "completed" ? "הושלם" : inst.status === "rejected" ? "נדחה" : inst.status}
                  </span>
                  <span>{new Date(inst.startedAt).toLocaleString("he-IL")}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkflowExecutionHistory({ workflowId }: { workflowId: number }) {
  const { data: logs = [], isLoading } = useQuery<any[]>({
    queryKey: ["execution-logs", "workflow", workflowId],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/execution-logs?workflowId=${workflowId}&type=workflow&limit=50`);
      if (!r.ok) return [];
      const data = await r.json();
      return data.logs || [];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center text-muted-foreground">
        <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>אין היסטוריית הרצות</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((log: any) => (
        <div key={log.id} className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {log.status === "completed" ? <CheckCircle className="w-5 h-5 text-green-400" /> :
               log.status === "failed" ? <XCircle className="w-5 h-5 text-red-400" /> :
               log.status === "paused" ? <Pause className="w-5 h-5 text-yellow-400" /> :
               <Clock className="w-5 h-5 text-blue-400 animate-spin" />}
              <div>
                <span className="font-medium text-sm">הרצה #{log.id}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{log.triggerEvent}</span>
                  {log.triggerRecordId && <span className="text-xs text-muted-foreground">רשומה #{log.triggerRecordId}</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={`px-2 py-1 rounded-lg ${log.status === "completed" ? "bg-green-500/10 text-green-400" : log.status === "failed" ? "bg-red-500/10 text-red-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                {log.status === "completed" ? "הושלם" : log.status === "failed" ? "נכשל" : log.status === "paused" ? "מושהה" : log.status}
              </span>
              <span>{new Date(log.startedAt).toLocaleString("he-IL")}</span>
            </div>
          </div>
          {log.errorMessage && <p className="text-xs text-red-400 mt-2 mr-8">{log.errorMessage}</p>}
        </div>
      ))}

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
      <ActivityLog entityType="workflows" />
      <RelatedRecords entityType="workflows" />
    </div>
    </div>
  );
}
