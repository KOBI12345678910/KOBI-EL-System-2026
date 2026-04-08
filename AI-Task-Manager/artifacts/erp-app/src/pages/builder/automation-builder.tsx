import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { usePlatformModules } from "@/hooks/usePlatformModules";
import {
  Plus, Trash2, Settings, Bot, Play, Pause, ChevronLeft,
  ArrowRight, Bell, FileEdit, Filter, Zap, Search, Clock,
  CheckCircle, XCircle, AlertTriangle, List, Eye, Power,
  ChevronDown, ChevronUp, RefreshCw, X, ArrowDown, Mail,
  GitMerge, Activity, UserCheck, Timer, MessageSquare
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

interface Automation {
  id: number;
  moduleId: number;
  name: string;
  slug: string;
  description: string | null;
  triggerType: string;
  triggerEntityId: number | null;
  triggerConfig: any;
  conditions: any[];
  actions: any[];
  isActive: boolean;
  lastRunAt: string | null;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ExecutionLog {
  id: number;
  automationId: number;
  executionType: string;
  entityId: number | null;
  triggerEvent: string;
  triggerRecordId: number | null;
  status: string;
  stepsExecuted: any[];
  result: any;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface PlatformModule {
  id: number;
  name: string;
  slug: string;
}

interface ModuleEntity {
  id: number;
  name: string;
  slug: string;
  moduleId: number;
}

const TRIGGER_TYPES = [
  { type: "on_create", label: "רשומה נוצרה", icon: Plus, color: "green" },
  { type: "on_update", label: "רשומה עודכנה", icon: FileEdit, color: "blue" },
  { type: "on_status_change", label: "סטטוס השתנה", icon: ArrowRight, color: "purple" },
  { type: "on_delete", label: "רשומה נמחקה", icon: Trash2, color: "red" },
  { type: "on_field_change", label: "שדה השתנה", icon: Zap, color: "orange" },
  { type: "on_schedule", label: "לפי לוח זמנים", icon: Timer, color: "sky" },
];

const ACTION_TYPES = [
  { type: "update_field", label: "עדכן שדה", icon: FileEdit, color: "blue" },
  { type: "set_status", label: "שנה סטטוס", icon: ArrowRight, color: "purple" },
  { type: "send_notification", label: "שלח התראה", icon: Bell, color: "yellow" },
  { type: "send_email", label: "שלח אימייל", icon: Mail, color: "sky" },
  { type: "send_channel_message", label: "שלח הודעה (WhatsApp/SMS/Telegram)", icon: MessageSquare, color: "teal" },
  { type: "create_record", label: "צור רשומה", icon: Plus, color: "green" },
  { type: "call_webhook", label: "Webhook", icon: Zap, color: "indigo" },
  { type: "change_status", label: "שנה סטטוס", icon: ArrowRight, color: "purple" },
  { type: "condition_check", label: "הסתעפות תנאי", icon: GitMerge, color: "orange" },
];

const CONDITION_OPERATORS = [
  { value: "equals", label: "שווה" },
  { value: "not_equals", label: "לא שווה" },
  { value: "contains", label: "מכיל" },
  { value: "not_contains", label: "לא מכיל" },
  { value: "gt", label: "גדול מ" },
  { value: "lt", label: "קטן מ" },
  { value: "gte", label: "גדול או שווה" },
  { value: "lte", label: "קטן או שווה" },
  { value: "is_empty", label: "ריק" },
  { value: "is_not_empty", label: "לא ריק" },
  { value: "is_true", label: "אמת" },
  { value: "is_false", label: "שקר" },
];

export default function AutomationBuilder() {
  const queryClient = useQueryClient();
  const [selectedModule, setSelectedModule] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);
  const [viewingLogs, setViewingLogs] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [activeMainTab, setActiveMainTab] = useState<"automations" | "logs">("automations");
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;

  const { modules } = usePlatformModules();

  const { data: automations = [], isLoading } = useQuery<Automation[]>({
    queryKey: ["automations", selectedModule],
    queryFn: async () => {
      if (!selectedModule) return [];
      const r = await authFetch(`${API}/platform/modules/${selectedModule}/automations`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!selectedModule,
  });

  const { data: entities = [] } = useQuery<ModuleEntity[]>({
    queryKey: ["module-entities", selectedModule],
    queryFn: async () => {
      if (!selectedModule) return [];
      const r = await authFetch(`${API}/platform/modules/${selectedModule}/entities`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!selectedModule,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/modules/${selectedModule}/automations`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create automation");
      return r.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["automations", selectedModule] });
      setShowCreate(false);
      setEditingAutomation(data);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const r = await authFetch(`${API}/platform/automations/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update automation");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations", selectedModule] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/platform/automations/${id}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automations", selectedModule] }),
  });

  const executeMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/platform/automations/${id}/execute`, { method: "POST" });
      if (!r.ok) throw new Error("Failed to execute automation");
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automations", selectedModule] }),
  });

  if (viewingLogs !== null) {
    return (
      <ExecutionLogView
        automationId={viewingLogs}
        automationName={automations.find(a => a.id === viewingLogs)?.name || ""}
        onBack={() => setViewingLogs(null)}
      />
    );
  }

  if (editingAutomation) {
    return (
      <AutomationEditor
        automation={editingAutomation}
        entities={entities}
        onBack={() => { setEditingAutomation(null); queryClient.invalidateQueries({ queryKey: ["automations", selectedModule] }); }}
        onSave={(data) => updateMutation.mutate({ id: editingAutomation.id, ...data })}
        isSaving={updateMutation.isPending}
      />
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold">אוטומציות</h1>
          <p className="text-muted-foreground mt-1">כלי אוטומציה פנימי — כש + אם + אז — מופעל אוטומטית על אירועים</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-muted rounded-xl p-0.5">
            <button onClick={() => setActiveMainTab("automations")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeMainTab === "automations" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              <Bot className="w-4 h-4 inline-block ml-1" />
              אוטומציות
            </button>
            <button onClick={() => setActiveMainTab("logs")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeMainTab === "logs" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              <Activity className="w-4 h-4 inline-block ml-1" />
              לוג הרצות
            </button>
          </div>
          {selectedModule && activeMainTab === "automations" && (
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
              <Plus className="w-5 h-5" />
              אוטומציה חדשה
            </button>
          )}
        </div>
      </div>

      {activeMainTab === "logs" ? (
        <GlobalExecutionLog />
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
                    <Bot className="w-5 h-5 text-primary" />
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
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש אוטומציות..."
                className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-lg sm:text-2xl font-bold">{automations.length}</p>
                  <p className="text-xs text-muted-foreground">סה״כ אוטומציות</p>
                </div>
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-400">
                  <Power className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-lg sm:text-2xl font-bold">{automations.filter(a => a.isActive).length}</p>
                  <p className="text-xs text-muted-foreground">פעילות</p>
                </div>
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-lg sm:text-2xl font-bold">{automations.reduce((sum, a) => sum + a.runCount, 0)}</p>
                  <p className="text-xs text-muted-foreground">הרצות</p>
                </div>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : automations.filter(a => !search || a.name.includes(search)).length === 0 ? (
            <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
              <Bot className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">אין אוטומציות</h3>
              <p className="text-muted-foreground mb-6">צור אוטומציה — למשל: ״כשעסקה נסגרת, שלח התראה לצוות״</p>
              <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium">
                <Plus className="w-5 h-5" />
                צור אוטומציה ראשונה
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {automations.filter(a => !search || a.name.includes(search)).map((auto, i) => {
                const trigger = TRIGGER_TYPES.find(t => t.type === auto.triggerType) || TRIGGER_TYPES[0];
                const TriggerIcon = trigger.icon;
                const entity = entities.find(e => e.id === auto.triggerEntityId);
                return (
                  <motion.div key={auto.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                    className="bg-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-all">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${trigger.color === "green" ? "bg-green-500/10" : trigger.color === "blue" ? "bg-blue-500/10" : trigger.color === "purple" ? "bg-purple-500/10" : trigger.color === "red" ? "bg-red-500/10" : "bg-orange-500/10"}`}>
                          <TriggerIcon className={`w-5 h-5 ${trigger.color === "green" ? "text-green-400" : trigger.color === "blue" ? "text-blue-400" : trigger.color === "purple" ? "text-purple-400" : trigger.color === "red" ? "text-red-400" : "text-orange-400"}`} />
                        </div>
                        <div>
                          <h3 className="font-semibold">{auto.name}</h3>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>{trigger.label}</span>
                            {entity && <><span>·</span><span>{entity.name}</span></>}
                            <span>·</span>
                            <span>{(auto.actions as any[]).length} פעולות</span>
                            <span>·</span>
                            <span>{auto.runCount} הרצות</span>
                          </div>
                          {auto.description && <p className="text-xs text-muted-foreground mt-1">{auto.description}</p>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <span className="px-2 py-1 bg-green-500/10 text-green-400 rounded-lg text-xs font-medium">
                        כש: {trigger.label}
                      </span>
                      {(auto.conditions as any[]).length > 0 && (
                        <span className="px-2 py-1 bg-orange-500/10 text-orange-400 rounded-lg text-xs font-medium">
                          אם: {(auto.conditions as any[]).length} תנאים
                        </span>
                      )}
                      {(auto.actions as any[]).map((action: any, ai: number) => (
                        <span key={ai} className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded-lg text-xs font-medium">
                          אז: {ACTION_TYPES.find(a => a.type === action.type)?.label || action.type}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 pt-3 border-t border-border/50">
                      <button onClick={() => updateMutation.mutate({ id: auto.id, isActive: !auto.isActive })}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${auto.isActive ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground"}`}>
                        {auto.isActive ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                        {auto.isActive ? "פעיל" : "מושהה"}
                      </button>
                      <button onClick={() => executeMutation.mutate(auto.id)} disabled={executeMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors">
                        <Play className="w-3.5 h-3.5" />
                        הרץ עכשיו
                      </button>
                      <button onClick={() => setViewingLogs(auto.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-muted text-muted-foreground rounded-lg text-xs font-medium hover:text-foreground transition-colors">
                        <List className="w-3.5 h-3.5" />
                        לוג
                      </button>
                      <div className="mr-auto flex items-center gap-1">
                        <button onClick={() => setEditingAutomation(auto)} className="p-2 hover:bg-muted rounded-lg transition-colors">
                          <Settings className="w-4 h-4 text-muted-foreground" />
                        </button>
                        {isSuperAdmin && (
                          <button onClick={async () => { const ok = await globalConfirm("מחיקת אוטומציה", { itemName: auto.name, entityType: "אוטומציה" }); if (ok) deleteMutation.mutate(auto.id); }}
                            className="p-2 hover:bg-destructive/10 rounded-lg transition-colors">
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </button>
                        )}
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
          <CreateAutomationModal
            entities={entities}
            onClose={() => setShowCreate(false)}
            onSubmit={(data) => createMutation.mutate(data)}
            isLoading={createMutation.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function CreateAutomationModal({ entities, onClose, onSubmit, isLoading }: {
  entities: ModuleEntity[];
  onClose: () => void;
  onSubmit: (data: any) => void;
  isLoading: boolean;
}) {
  const [form, setForm] = useState({
    name: "", slug: "", description: "",
    triggerType: "on_create", triggerEntityId: "",
  });
  const autoSlug = (name: string) => name.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">אוטומציה חדשה</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">שם</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: autoSlug(e.target.value) }))}
              placeholder="למשל: כשעסקה נסגרת — שלח התראה" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">תיאור</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="מה האוטומציה עושה?" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>

          <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-green-400 mb-3">כש... (טריגר)</h3>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {TRIGGER_TYPES.map(t => {
                const Icon = t.icon;
                return (
                  <button key={t.type} type="button" onClick={() => setForm(f => ({ ...f, triggerType: t.type }))}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-xs transition-all ${form.triggerType === t.type ? "border-green-500 bg-green-500/10" : "border-border hover:border-green-500/30"}`}>
                    <Icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>
            {entities.length > 0 && (
              <select value={form.triggerEntityId} onChange={e => setForm(f => ({ ...f, triggerEntityId: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm">
                <option value="">כל הישויות</option>
                {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={() => onSubmit({
            ...form,
            triggerEntityId: form.triggerEntityId ? Number(form.triggerEntityId) : undefined,
            conditions: [],
            actions: [],
          })} disabled={!form.name || !form.slug || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50">
            {isLoading ? "יוצר..." : "צור והמשך לעורך"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function AutomationEditor({ automation, entities, onBack, onSave, isSaving }: {
  automation: Automation;
  entities: ModuleEntity[];
  onBack: () => void;
  onSave: (data: any) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState({
    name: automation.name,
    description: automation.description || "",
    triggerType: automation.triggerType,
    triggerEntityId: automation.triggerEntityId?.toString() || "",
    triggerConfig: automation.triggerConfig || {},
    conditions: Array.isArray(automation.conditions) ? automation.conditions : [],
    actions: Array.isArray(automation.actions) ? automation.actions : [],
    isActive: automation.isActive,
  });
  const [expandedAction, setExpandedAction] = useState<number | null>(null);

  const addCondition = () => {
    setForm(f => ({ ...f, conditions: [...f.conditions, { field: "", operator: "equals", value: "" }] }));
  };

  const removeCondition = (index: number) => {
    setForm(f => ({ ...f, conditions: f.conditions.filter((_, i) => i !== index) }));
  };

  const updateCondition = (index: number, updates: any) => {
    setForm(f => ({
      ...f,
      conditions: f.conditions.map((c, i) => i === index ? { ...c, ...updates } : c),
    }));
  };

  const addAction = (type: string) => {
    const actionDef = ACTION_TYPES.find(a => a.type === type);
    const defaultConfig: Record<string, any> = {};
    if (type === "update_field") { defaultConfig.fieldSlug = ""; defaultConfig.value = ""; }
    if (type === "set_status" || type === "change_status") { defaultConfig.status = ""; }
    if (type === "send_notification") { defaultConfig.title = ""; defaultConfig.message = ""; }
    if (type === "send_email") { defaultConfig.to = ""; defaultConfig.subject = ""; defaultConfig.body = ""; }
    if (type === "send_channel_message") { defaultConfig.channel = "whatsapp"; defaultConfig.recipient = ""; defaultConfig.templateId = ""; defaultConfig.message = ""; defaultConfig.connectionId = ""; }
    if (type === "create_record") { defaultConfig.entityId = ""; defaultConfig.data = {}; }
    if (type === "call_webhook") { defaultConfig.url = ""; defaultConfig.method = "POST"; }
    setForm(f => ({ ...f, actions: [...f.actions, { type, label: actionDef?.label || type, config: defaultConfig }] }));
  };

  const removeAction = (index: number) => {
    setForm(f => ({ ...f, actions: f.actions.filter((_, i) => i !== index) }));
  };

  const updateActionConfig = (index: number, config: any) => {
    setForm(f => ({
      ...f,
      actions: f.actions.map((a, i) => i === index ? { ...a, config } : a),
    }));
  };

  const moveAction = (index: number, direction: "up" | "down") => {
    const newActions = [...form.actions];
    const swapIdx = direction === "up" ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= newActions.length) return;
    [newActions[index], newActions[swapIdx]] = [newActions[swapIdx], newActions[index]];
    setForm(f => ({ ...f, actions: newActions }));
  };

  const handleSave = () => {
    onSave({
      name: form.name,
      description: form.description,
      triggerType: form.triggerType,
      triggerEntityId: form.triggerEntityId ? Number(form.triggerEntityId) : null,
      triggerConfig: form.triggerConfig,
      conditions: form.conditions,
      actions: form.actions,
      isActive: form.isActive,
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold">{form.name}</h1>
            <p className="text-sm text-muted-foreground">עורך אוטומציה — טריגר → תנאי → פעולה</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-muted-foreground">{form.isActive ? "פעיל" : "מושהה"}</span>
            <button onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
              className={`relative w-10 h-5 rounded-full transition-colors ${form.isActive ? "bg-green-500" : "bg-muted"}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-card transition-transform ${form.isActive ? "left-5" : "left-0.5"}`} />
            </button>
          </label>
          <button onClick={handleSave} disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50">
            {isSaving ? "שומר..." : "שמור"}
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">שם האוטומציה</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">תיאור</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm" />
          </div>
        </div>

        <div className="bg-green-500/5 border-2 border-green-500/30 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-green-400" />
            <h3 className="font-semibold text-green-400">כש... (טריגר)</h3>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {TRIGGER_TYPES.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.type} onClick={() => setForm(f => ({ ...f, triggerType: t.type }))}
                  className={`flex items-center gap-2 p-3 rounded-xl border text-sm transition-all ${form.triggerType === t.type ? "border-green-500 bg-green-500/10 text-green-400" : "border-border hover:border-green-500/30"}`}>
                  <Icon className="w-4 h-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
          {entities.length > 0 && (
            <div>
              <label className="block text-xs font-medium mb-1 text-green-400">ישות ספציפית</label>
              <select value={form.triggerEntityId} onChange={e => setForm(f => ({ ...f, triggerEntityId: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm">
                <option value="">כל הישויות במודול</option>
                {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          )}
          {form.triggerType === "on_status_change" && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">מסטטוס</label>
                <input value={form.triggerConfig.fromStatus || ""} onChange={e => setForm(f => ({ ...f, triggerConfig: { ...f.triggerConfig, fromStatus: e.target.value } }))}
                  placeholder="כלשהו" className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">לסטטוס</label>
                <input value={form.triggerConfig.toStatus || ""} onChange={e => setForm(f => ({ ...f, triggerConfig: { ...f.triggerConfig, toStatus: e.target.value } }))}
                  placeholder="כלשהו" className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
              </div>
            </div>
          )}
          {form.triggerType === "on_schedule" && (
            <div className="mt-3 space-y-3 bg-sky-500/5 border border-sky-500/20 rounded-xl p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1 text-sky-400">תדירות</label>
                  <select value={form.triggerConfig.scheduleFrequency || "daily"}
                    onChange={e => setForm(f => ({ ...f, triggerConfig: { ...f.triggerConfig, scheduleFrequency: e.target.value } }))}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm">
                    <option value="hourly">כל שעה</option>
                    <option value="daily">יומי</option>
                    <option value="weekly">שבועי</option>
                    <option value="monthly">חודשי</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-sky-400">שעת הרצה</label>
                  <input type="time" value={form.triggerConfig.scheduleTime || "08:00"}
                    onChange={e => setForm(f => ({ ...f, triggerConfig: { ...f.triggerConfig, scheduleTime: e.target.value } }))}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">האוטומציה תופעל על ידי מנוע ה-Workflow לפי הלוח זמנים שהוגדר</p>
            </div>
          )}
        </div>

        <div className="flex justify-center">
          <ArrowDown className="w-5 h-5 text-muted-foreground" />
        </div>

        <div className="bg-orange-500/5 border-2 border-orange-500/30 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-orange-400" />
              <h3 className="font-semibold text-orange-400">אם... (תנאים)</h3>
            </div>
            <button onClick={addCondition} className="flex items-center gap-1 px-3 py-1.5 bg-orange-500/10 text-orange-400 rounded-lg text-xs font-medium hover:bg-orange-500/20">
              <Plus className="w-3.5 h-3.5" />
              הוסף תנאי
            </button>
          </div>

          {form.conditions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">ללא תנאים — האוטומציה תרוץ תמיד כשהטריגר מתקיים</p>
          ) : (
            <div className="space-y-2">
              {form.conditions.map((cond, i) => (
                <div key={i} className="flex items-center gap-2 bg-background rounded-xl p-3">
                  {i > 0 && <span className="text-xs text-orange-400 font-medium flex-shrink-0">וגם</span>}
                  <input value={cond.field || ""} onChange={e => updateCondition(i, { field: e.target.value })}
                    placeholder="שם שדה" className="flex-1 min-w-0 px-2 py-1.5 bg-card border border-border rounded-lg text-sm" />
                  <select value={cond.operator || "equals"} onChange={e => updateCondition(i, { operator: e.target.value })}
                    className="px-2 py-1.5 bg-card border border-border rounded-lg text-sm min-w-[100px]">
                    {CONDITION_OPERATORS.map(op => (
                      <option key={op.value} value={op.value}>{op.label}</option>
                    ))}
                  </select>
                  {!["is_empty", "is_not_empty", "is_true", "is_false"].includes(cond.operator) && (
                    <input value={cond.value || ""} onChange={e => updateCondition(i, { value: e.target.value })}
                      placeholder="ערך" className="flex-1 min-w-0 px-2 py-1.5 bg-card border border-border rounded-lg text-sm" />
                  )}
                  <button onClick={() => removeCondition(i)} className="p-1.5 hover:bg-destructive/10 rounded-lg flex-shrink-0">
                    <X className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-center">
          <ArrowDown className="w-5 h-5 text-muted-foreground" />
        </div>

        <div className="bg-blue-500/5 border-2 border-blue-500/30 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-blue-400">אז... (פעולות)</h3>
          </div>

          {form.actions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">אין פעולות — הוסף לפחות פעולה אחת</p>
          ) : (
            <div className="space-y-0">
              {form.actions.map((action, i) => {
                const actionDef = ACTION_TYPES.find(a => a.type === action.type);
                const Icon = actionDef?.icon || Zap;
                const isExpanded = expandedAction === i;
                return (
                  <div key={i}>
                    {i > 0 && <div className="flex justify-center py-1"><ArrowDown className="w-3 h-3 text-blue-400/50" /></div>}
                    <div className="bg-background rounded-xl overflow-hidden border border-border/50">
                      <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => setExpandedAction(isExpanded ? null : i)}>
                        <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center text-xs font-bold text-blue-400">{i + 1}</div>
                        <Icon className="w-4 h-4 text-blue-400" />
                        <span className="font-medium text-sm flex-1">{action.label || actionDef?.label}</span>
                        <div className="flex items-center gap-1">
                          <button onClick={e => { e.stopPropagation(); moveAction(i, "up"); }} disabled={i === 0} className="p-1 hover:bg-muted rounded disabled:opacity-30">
                            <ChevronUp className="w-3 h-3" />
                          </button>
                          <button onClick={e => { e.stopPropagation(); moveAction(i, "down"); }} disabled={i === form.actions.length - 1} className="p-1 hover:bg-muted rounded disabled:opacity-30">
                            <ChevronDown className="w-3 h-3" />
                          </button>
                          <button onClick={e => { e.stopPropagation(); removeAction(i); }} className="p-1 hover:bg-destructive/10 rounded">
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </button>
                          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="border-t border-border p-3">
                          <ActionConfigEditor action={action} onChange={(config) => updateActionConfig(i, config)} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4">
            <p className="text-xs text-muted-foreground mb-2">הוסף פעולה:</p>
            <div className="grid grid-cols-2 gap-2">
              {ACTION_TYPES.filter(a => a.type !== "change_status").map(at => {
                const Icon = at.icon;
                return (
                  <button key={at.type} onClick={() => addAction(at.type)}
                    className="flex items-center gap-2 p-2 rounded-lg border border-border hover:border-blue-500/30 transition-all text-xs">
                    <Icon className="w-3.5 h-3.5" />
                    {at.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
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
              placeholder="field_slug" className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">ערך חדש</label>
            <input value={config.value || ""} onChange={e => onChange({ ...config, value: e.target.value })}
              placeholder="ערך" className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm" />
          </div>
        </div>
      );
    case "set_status":
    case "change_status":
      return (
        <div>
          <label className="block text-xs font-medium mb-1">סטטוס חדש</label>
          <input value={config.status || ""} onChange={e => onChange({ ...config, status: e.target.value })}
            placeholder="active / completed / approved" className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm" />
        </div>
      );
    case "send_notification":
      return (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">כותרת</label>
            <input value={config.title || ""} onChange={e => onChange({ ...config, title: e.target.value })}
              placeholder="כותרת ההתראה" className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">הודעה</label>
            <textarea value={config.message || ""} onChange={e => onChange({ ...config, message: e.target.value })} rows={2}
              placeholder="תוכן ההתראה" className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm resize-none" />
          </div>
        </div>
      );
    case "send_email":
      return (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">אימייל נמען</label>
            <input value={config.to || ""} onChange={e => onChange({ ...config, to: e.target.value })}
              placeholder="email@example.com" className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">נושא</label>
            <input value={config.subject || ""} onChange={e => onChange({ ...config, subject: e.target.value })}
              placeholder="נושא האימייל" className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">תוכן</label>
            <textarea value={config.body || ""} onChange={e => onChange({ ...config, body: e.target.value })} rows={3}
              placeholder="תוכן האימייל" className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm resize-none" />
          </div>
        </div>
      );
    case "send_channel_message":
      return (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">ערוץ שליחה</label>
            <select value={config.channel || "whatsapp"} onChange={e => onChange({ ...config, channel: e.target.value })}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm">
              <option value="whatsapp">WhatsApp</option>
              <option value="telegram">Telegram</option>
              <option value="sms">SMS</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">לשליחת אימייל, השתמש בפעולת &quot;שלח אימייל&quot;</p>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">נמען (מספר טלפון / Telegram Chat ID)</label>
            <input value={config.recipient || ""} onChange={e => onChange({ ...config, recipient: e.target.value })}
              placeholder="WhatsApp: +972501234567 | Telegram: 123456789"
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">מזהה תבנית הודעה (אופציונלי)</label>
            <input value={config.templateId || ""} onChange={e => onChange({ ...config, templateId: e.target.value })}
              placeholder="template-slug"
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">תוכן הודעה (אם אין תבנית)</label>
            <textarea value={config.message || ""} onChange={e => onChange({ ...config, message: e.target.value })} rows={2}
              placeholder="{{record.name}} - הזמנה מס' {{record.id}} מוכנה לאיסוף"
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Connection ID (אופציונלי - ברירת מחדל: חיבור פעיל)</label>
            <input type="number" value={config.connectionId || ""} onChange={e => onChange({ ...config, connectionId: e.target.value })}
              placeholder="השאר ריק לבחירה אוטומטית"
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm" />
          </div>
        </div>
      );
    case "create_record":
      return (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">מזהה ישות</label>
            <input type="number" value={config.entityId || ""} onChange={e => onChange({ ...config, entityId: Number(e.target.value) })}
              placeholder="Entity ID" className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">נתונים (JSON)</label>
            <textarea value={typeof config.data === "object" ? JSON.stringify(config.data, null, 2) : (config.data || "")}
              onChange={e => { try { onChange({ ...config, data: JSON.parse(e.target.value) }); } catch { } }} rows={3}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm font-mono resize-none" />
          </div>
        </div>
      );
    case "call_webhook":
      return (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">URL</label>
            <input value={config.url || ""} onChange={e => onChange({ ...config, url: e.target.value })}
              placeholder="https://..." className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm" dir="ltr" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Method</label>
            <select value={config.method || "POST"} onChange={e => onChange({ ...config, method: e.target.value })}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm">
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
            </select>
          </div>
        </div>
      );
    case "condition_check":
      return (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">הגדרת תנאי הסתעפות — אם התנאי מתקיים, ירוצו פעולות ה-if, אחרת ה-else</p>
          <div>
            <label className="block text-xs font-medium mb-1">הגדרות (JSON)</label>
            <textarea value={JSON.stringify(config, null, 2)} onChange={e => { try { onChange(JSON.parse(e.target.value)); } catch { } }} rows={4}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm font-mono resize-none" />
          </div>
        </div>
      );
    default:
      return (
        <div>
          <label className="block text-xs font-medium mb-1">הגדרות (JSON)</label>
          <textarea value={JSON.stringify(config, null, 2)} onChange={e => { try { onChange(JSON.parse(e.target.value)); } catch { } }} rows={4}
            className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm font-mono resize-none" />
        </div>
      );
  }
}

function ExecutionLogView({ automationId, automationName, onBack }: {
  automationId: number;
  automationName: string;
  onBack: () => void;
}) {
  const { data: logs = [], isLoading } = useQuery<ExecutionLog[]>({
    queryKey: ["automation-logs", automationId],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/automations/${automationId}/logs`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const [expandedLog, setExpandedLog] = useState<number | null>(null);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-muted rounded-lg transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg sm:text-2xl font-bold">לוג הרצות — {automationName}</h1>
          <p className="text-sm text-muted-foreground">{logs.length} הרצות</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-12 text-center">
          <Activity className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">אין הרצות עדיין</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => (
            <div key={log.id} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}>
                <div className="flex items-center gap-3">
                  {log.status === "completed" ? <CheckCircle className="w-5 h-5 text-green-400" /> :
                   log.status === "failed" ? <XCircle className="w-5 h-5 text-red-400" /> :
                   log.status === "running" ? <Clock className="w-5 h-5 text-blue-400 animate-spin" /> :
                   <AlertTriangle className="w-5 h-5 text-yellow-400" />}
                  <div>
                    <span className="font-medium text-sm">הרצה #{log.id}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{log.triggerEvent}</span>
                      {log.triggerRecordId && <span className="text-xs text-muted-foreground">רשומה #{log.triggerRecordId}</span>}
                      <span className="text-xs text-muted-foreground">{(log.stepsExecuted as any[]).length} צעדים</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className={`px-2 py-1 rounded-lg ${log.status === "completed" ? "bg-green-500/10 text-green-400" : log.status === "failed" ? "bg-red-500/10 text-red-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                    {log.status === "completed" ? "הושלם" : log.status === "failed" ? "נכשל" : log.status === "running" ? "רץ" : log.status}
                  </span>
                  <span>{new Date(log.startedAt).toLocaleString("he-IL")}</span>
                  {log.completedAt && (
                    <span className="text-muted-foreground">
                      ({Math.round((new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime()) / 1000)}ש׳)
                    </span>
                  )}
                  <ChevronDown className={`w-4 h-4 transition-transform ${expandedLog === log.id ? "rotate-180" : ""}`} />
                </div>
              </div>

              {expandedLog === log.id && (
                <div className="border-t border-border p-4 space-y-3">
                  {log.errorMessage && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">
                      {log.errorMessage}
                    </div>
                  )}
                  {(log.stepsExecuted as any[]).length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2">צעדים שבוצעו:</h4>
                      <div className="space-y-1.5">
                        {(log.stepsExecuted as any[]).map((step: any, si: number) => (
                          <div key={si} className="flex items-center gap-2 text-sm bg-background rounded-lg p-2">
                            {step.success ? <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                            <span className="text-xs font-mono text-muted-foreground">#{si + 1}</span>
                            <span className="flex-1">{step.action || step.type || "פעולה"}</span>
                            {step.error && <span className="text-xs text-red-400">{step.error}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {log.result && Object.keys(log.result).length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-1">תוצאה:</h4>
                      <pre className="text-xs font-mono bg-background rounded-lg p-2 overflow-x-auto">
                        {JSON.stringify(log.result, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GlobalExecutionLog() {
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const { data, isLoading } = useQuery<{ logs: ExecutionLog[]; total: number }>({
    queryKey: ["all-execution-logs", statusFilter, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("type", typeFilter);
      params.set("limit", "100");
      const r = await authFetch(`${API}/platform/execution-logs?${params}`);
      if (!r.ok) return { logs: [], total: 0 };
      return r.json();
    },
  });

  const [expandedLog, setExpandedLog] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">לוג הרצות גלובלי</h2>
        <div className="flex gap-2">
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-2 bg-card border border-border rounded-xl text-sm">
            <option value="">כל הסוגים</option>
            <option value="automation">אוטומציה</option>
            <option value="workflow">תהליך</option>
            <option value="scheduled">מתוזמן</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-card border border-border rounded-xl text-sm">
            <option value="">כל הסטטוסים</option>
            <option value="completed">הושלם</option>
            <option value="failed">נכשל</option>
            <option value="running">רץ</option>
            <option value="paused">מושהה</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-lg sm:text-2xl font-bold">{data?.total || 0}</p>
          <p className="text-xs text-muted-foreground">סה״כ הרצות</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-lg sm:text-2xl font-bold text-green-400">{data?.logs.filter(l => l.status === "completed").length || 0}</p>
          <p className="text-xs text-muted-foreground">הושלמו</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-lg sm:text-2xl font-bold text-red-400">{data?.logs.filter(l => l.status === "failed").length || 0}</p>
          <p className="text-xs text-muted-foreground">נכשלו</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-lg sm:text-2xl font-bold text-blue-400">{data?.logs.filter(l => l.status === "running").length || 0}</p>
          <p className="text-xs text-muted-foreground">רצות</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data?.logs.length ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center text-muted-foreground">
          <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>אין הרצות</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(data?.logs || []).map(log => (
            <div key={log.id} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}>
                <div className="flex items-center gap-3">
                  {log.status === "completed" ? <CheckCircle className="w-5 h-5 text-green-400" /> :
                   log.status === "failed" ? <XCircle className="w-5 h-5 text-red-400" /> :
                   log.status === "running" ? <Clock className="w-5 h-5 text-blue-400 animate-spin" /> :
                   <AlertTriangle className="w-5 h-5 text-yellow-400" />}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">#{log.id}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${log.executionType === "automation" ? "bg-purple-500/10 text-purple-400" : log.executionType === "workflow" ? "bg-blue-500/10 text-blue-400" : "bg-cyan-500/10 text-cyan-400"}`}>
                        {log.executionType === "automation" ? "אוטומציה" : log.executionType === "workflow" ? "תהליך" : "מתוזמן"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <span>{log.triggerEvent}</span>
                      {log.triggerRecordId && <span>רשומה #{log.triggerRecordId}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={`px-2 py-1 rounded-lg ${log.status === "completed" ? "bg-green-500/10 text-green-400" : log.status === "failed" ? "bg-red-500/10 text-red-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                    {log.status === "completed" ? "הושלם" : log.status === "failed" ? "נכשל" : log.status}
                  </span>
                  <span>{new Date(log.startedAt).toLocaleString("he-IL")}</span>
                </div>
              </div>
              {expandedLog === log.id && (
                <div className="border-t border-border p-4 space-y-2">
                  {log.errorMessage && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">{log.errorMessage}</div>
                  )}
                  {(log.stepsExecuted as any[]).length > 0 && (
                    <div className="space-y-1">
                      {(log.stepsExecuted as any[]).map((step: any, si: number) => (
                        <div key={si} className="flex items-center gap-2 text-sm bg-background rounded-lg p-2">
                          {step.success ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                          <span className="text-xs font-mono">#{si + 1}</span>
                          <span className="flex-1">{step.action || "פעולה"}</span>
                          {step.error && <span className="text-xs text-red-400">{step.error}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
      <ActivityLog entityType="automation-builder" />
      <RelatedRecords entityType="automation-builder" />
    </div>
    </div>
  );
}
