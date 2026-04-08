import { useState } from "react";
import { usePermissions } from "@/hooks/use-permissions";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { usePlatformModules } from "@/hooks/usePlatformModules";
import {
  Plus, Trash2, Settings, Shield, ShieldAlert, ShieldX,
  Search, ChevronDown, ChevronUp, X, CheckCircle, XCircle,
  AlertTriangle, Eye, Toggle, ArrowUpDown, Activity, Filter,
  Clock, RefreshCw, ToggleLeft, ToggleRight, Info
} from "lucide-react";
import ConditionBuilder, { createEmptyGroup, type ConditionGroup } from "@/components/condition-builder";
import { globalConfirm } from "@/components/confirm-dialog";

const API = "/api";

interface BusinessRule {
  id: number;
  name: string;
  description: string | null;
  moduleId: number | null;
  entityId: number | null;
  scope: string;
  triggerEvents: string[];
  conditions: any;
  enforcementAction: string;
  enforcementConfig: any;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AuditLogEntry {
  id: number;
  ruleId: number | null;
  entityId: number | null;
  recordId: number | null;
  triggerEvent: string;
  result: string;
  details: any;
  evaluatedAt: string;
}

interface PlatformModule {
  id: number;
  name: string;
  slug: string;
}

const TRIGGER_EVENT_OPTIONS = [
  { value: "on_create", label: "יצירת רשומה" },
  { value: "on_update", label: "עדכון רשומה" },
  { value: "on_delete", label: "מחיקת רשומה" },
  { value: "on_status_change", label: "שינוי סטטוס" },
];

const ENFORCEMENT_ACTIONS = [
  { value: "block", label: "חסום", icon: ShieldX, color: "red", description: "מנע את הפעולה" },
  { value: "warn", label: "אזהרה", icon: ShieldAlert, color: "yellow", description: "הצג אזהרה אך אפשר המשך" },
  { value: "require_approval", label: "דרוש אישור", icon: Shield, color: "blue", description: "שלח לאישור" },
];

const RESULT_COLORS: Record<string, string> = {
  triggered: "text-red-400 bg-red-500/10",
  passed: "text-green-400 bg-green-500/10",
};

const RESULT_LABELS: Record<string, string> = {
  triggered: "הופעל",
  passed: "עבר",
};

export default function BusinessRulesBuilder() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"rules" | "audit">("rules");
  const [showCreate, setShowCreate] = useState(false);
  const [editingRule, setEditingRule] = useState<BusinessRule | null>(null);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState<number | null>(null);

  const { modules } = usePlatformModules();

  const { data: rules = [], isLoading } = useQuery<BusinessRule[]>({
    queryKey: ["business-rules", moduleFilter],
    queryFn: async () => {
      const params = moduleFilter ? `?moduleId=${moduleFilter}` : "";
      const r = await authFetch(`${API}/platform/business-rules${params}`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: auditData } = useQuery<{ logs: AuditLogEntry[]; total: number }>({
    queryKey: ["business-rules-audit"],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/business-rules-audit?limit=50`);
      if (!r.ok) return { logs: [], total: 0 };
      return r.json();
    },
    enabled: activeTab === "audit",
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/business-rules`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create rule");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-rules"] });
      setShowCreate(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const r = await authFetch(`${API}/platform/business-rules/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update rule");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-rules"] });
      setEditingRule(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/platform/business-rules/${id}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["business-rules"] }),
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/platform/business-rules/${id}/toggle`, { method: "POST" });
      if (!r.ok) throw new Error("Failed to toggle rule");
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["business-rules"] }),
  });

  const filteredRules = rules.filter(r =>
    !search || r.name.includes(search) || (r.description && r.description.includes(search))
  );

  if (editingRule) {
    return (
      <RuleEditor
        rule={editingRule}
        modules={modules}
        onBack={() => setEditingRule(null)}
        onSave={(data) => updateMutation.mutate({ id: editingRule.id, ...data })}
        isSaving={updateMutation.isPending}
      />
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold">חוקי עסק</h1>
          <p className="text-muted-foreground mt-1">מנוע חוקי עסק — הגדרות מדיניות חוצות-מודולים, אוכפות אוטומטית</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-muted rounded-xl p-0.5">
            <button onClick={() => setActiveTab("rules")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "rules" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              <Shield className="w-4 h-4" />
              חוקים
            </button>
            <button onClick={() => setActiveTab("audit")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "audit" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              <Activity className="w-4 h-4" />
              יומן הפעלות
            </button>
          </div>
          {activeTab === "rules" && (
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
              <Plus className="w-5 h-5" />
              חוק חדש
            </button>
          )}
        </div>
      </div>

      {activeTab === "rules" && (
        <>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש חוקים..."
                className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <select value={moduleFilter ?? ""} onChange={e => setModuleFilter(e.target.value ? Number(e.target.value) : null)}
              className="px-3 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              <option value="">כל המודולים</option>
              {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "סה״כ חוקים", value: rules.length, icon: Shield, color: "text-blue-400", bg: "bg-blue-500/10" },
              { label: "פעילים", value: rules.filter(r => r.isActive).length, icon: CheckCircle, color: "text-green-400", bg: "bg-green-500/10" },
              { label: "חוסמים", value: rules.filter(r => r.enforcementAction === "block").length, icon: ShieldX, color: "text-red-400", bg: "bg-red-500/10" },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="bg-card border border-border rounded-2xl p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${card.color}`} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{card.value}</p>
                      <p className="text-xs text-muted-foreground">{card.label}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredRules.length === 0 ? (
            <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
              <Shield className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">אין חוקי עסק</h3>
              <p className="text-muted-foreground mb-6">
                הגדר מדיניות כמו "הזמנות מעל ₪50,000 דורשות אישור VP" או "חשבוניות ללא חוזה — חסומות"
              </p>
              <button onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium">
                <Plus className="w-5 h-5" />
                הגדר חוק ראשון
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRules.map((rule, i) => {
                const enforcement = ENFORCEMENT_ACTIONS.find(e => e.value === rule.enforcementAction) || ENFORCEMENT_ACTIONS[0];
                const EnfIcon = enforcement.icon;
                return (
                  <motion.div key={rule.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                    className={`bg-card border rounded-2xl p-5 transition-all ${rule.isActive ? "border-border hover:border-primary/30" : "border-border/40 opacity-60"}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-${enforcement.color}-500/10`}>
                          <EnfIcon className={`w-5 h-5 text-${enforcement.color}-400`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{rule.name}</h3>
                            <span className={`text-xs px-2 py-0.5 rounded-lg bg-${enforcement.color}-500/10 text-${enforcement.color}-400 font-medium`}>
                              {enforcement.label}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-lg bg-muted text-muted-foreground">
                              עדיפות: {rule.priority}
                            </span>
                          </div>
                          {rule.description && (
                            <p className="text-sm text-muted-foreground mt-0.5">{rule.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleMutation.mutate(rule.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${rule.isActive ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground"}`}>
                          {rule.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                          {rule.isActive ? "פעיל" : "כבוי"}
                        </button>
                        <button onClick={() => setEditingRule(rule)} className="p-2 hover:bg-muted rounded-lg transition-colors">
                          <Settings className="w-4 h-4 text-muted-foreground" />
                        </button>
                        {isSuperAdmin && <button onClick={async () => { if (await globalConfirm("למחוק חוק?")) deleteMutation.mutate(rule.id); }}
                          className="p-2 hover:bg-destructive/10 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </button>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                      {rule.triggerEvents.map(ev => {
                        const label = TRIGGER_EVENT_OPTIONS.find(t => t.value === ev)?.label || ev;
                        return (
                          <span key={ev} className="px-2 py-0.5 bg-muted rounded-md">{label}</span>
                        );
                      })}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeTab === "audit" && (
        <AuditLogView logs={auditData?.logs || []} total={auditData?.total || 0} />
      )}

      <AnimatePresence>
        {showCreate && (
          <CreateRuleModal
            modules={modules}
            onClose={() => setShowCreate(false)}
            onSubmit={(data) => createMutation.mutate(data)}
            isLoading={createMutation.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function AuditLogView({ logs, total }: { logs: AuditLogEntry[]; total: number }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{total} רשומות</p>
      </div>
      {logs.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
          <Activity className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground">אין הפעלות עדיין</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="bg-card border border-border rounded-xl p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${RESULT_COLORS[log.result] || "bg-muted"}`}>
                    {log.result === "triggered" ? <ShieldX className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="text-sm font-medium">
                      חוק #{log.ruleId} — {RESULT_LABELS[log.result] || log.result}
                    </div>
                    <div className="text-xs text-muted-foreground flex gap-2">
                      <span>{TRIGGER_EVENT_OPTIONS.find(t => t.value === log.triggerEvent)?.label || log.triggerEvent}</span>
                      {log.entityId && <span>· ישות #{log.entityId}</span>}
                      {log.recordId && <span>· רשומה #{log.recordId}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${RESULT_COLORS[log.result]}`}>
                    {RESULT_LABELS[log.result] || log.result}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(log.evaluatedAt).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RuleEditor({
  rule,
  modules,
  onBack,
  onSave,
  isSaving,
}: {
  rule: BusinessRule;
  modules: PlatformModule[];
  onBack: () => void;
  onSave: (data: any) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState({
    name: rule.name,
    description: rule.description || "",
    moduleId: rule.moduleId ? String(rule.moduleId) : "",
    triggerEvents: rule.triggerEvents,
    enforcementAction: rule.enforcementAction,
    priority: rule.priority,
    conditions: (rule.conditions && typeof rule.conditions === "object" && !Array.isArray(rule.conditions))
      ? rule.conditions as ConditionGroup
      : createEmptyGroup(),
    enforcementConfig: rule.enforcementConfig as Record<string, any> || {},
  });

  const toggleEvent = (ev: string) => {
    setForm(f => ({
      ...f,
      triggerEvents: f.triggerEvents.includes(ev)
        ? f.triggerEvents.filter(e => e !== ev)
        : [...f.triggerEvents, ev],
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <ChevronDown className="w-5 h-5 rotate-90" />
          </button>
          <div>
            <h2 className="text-xl font-bold">{rule.name}</h2>
            <p className="text-sm text-muted-foreground">עורך חוק עסק</p>
          </div>
        </div>
        <button onClick={() => onSave(form)} disabled={!form.name || isSaving}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50">
          {isSaving ? "שומר..." : "שמור שינויים"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-5">
            <h3 className="font-semibold mb-4">פרטי החוק</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">שם החוק</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">תיאור</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">מודול</label>
                <select value={form.moduleId} onChange={e => setForm(f => ({ ...f, moduleId: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm">
                  <option value="">כל המודולים</option>
                  {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">עדיפות (1=גבוהה)</label>
                <input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
                  min={1} max={1000} className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm" />
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5">
            <h3 className="font-semibold mb-4">אירועי הפעלה</h3>
            <div className="grid grid-cols-2 gap-2">
              {TRIGGER_EVENT_OPTIONS.map(ev => (
                <button key={ev.value} onClick={() => toggleEvent(ev.value)}
                  className={`flex items-center gap-2 p-3 rounded-xl border text-sm transition-all text-right ${form.triggerEvents.includes(ev.value) ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/30"}`}>
                  {form.triggerEvents.includes(ev.value) ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <div className="w-4 h-4 rounded-full border border-border flex-shrink-0" />}
                  {ev.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5">
            <h3 className="font-semibold mb-4">פעולת אכיפה</h3>
            <div className="space-y-2">
              {ENFORCEMENT_ACTIONS.map(action => {
                const Icon = action.icon;
                return (
                  <button key={action.value} onClick={() => setForm(f => ({ ...f, enforcementAction: action.value }))}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-sm transition-all text-right ${form.enforcementAction === action.value ? `border-${action.color}-500/50 bg-${action.color}-500/10` : "border-border hover:border-primary/30"}`}>
                    <div className={`w-8 h-8 rounded-lg bg-${action.color}-500/10 flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-4 h-4 text-${action.color}-400`} />
                    </div>
                    <div>
                      <div className="font-medium">{action.label}</div>
                      <div className="text-xs text-muted-foreground">{action.description}</div>
                    </div>
                    {form.enforcementAction === action.value && <CheckCircle className={`w-4 h-4 text-${action.color}-400 mr-auto`} />}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-border">
              <label className="block text-sm font-medium mb-1.5">הודעת שגיאה</label>
              <input
                value={(form.enforcementConfig as any).message || ""}
                onChange={e => setForm(f => ({ ...f, enforcementConfig: { ...f.enforcementConfig, message: e.target.value } }))}
                placeholder="הודעה שתוצג למשתמש"
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm"
              />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-semibold mb-2">תנאי הפעלה</h3>
          <p className="text-xs text-muted-foreground mb-4">החוק יופעל כשהתנאים מתקיימים</p>
          <ConditionBuilder
            value={form.conditions}
            onChange={(g) => setForm(f => ({ ...f, conditions: g }))}
            fieldSuggestions={["status", "amount", "total", "quantity", "priority", "type", "category"]}
          />
        </div>
      </div>
    </div>
  );
}

function CreateRuleModal({
  modules,
  onClose,
  onSubmit,
  isLoading,
}: {
  modules: PlatformModule[];
  onClose: () => void;
  onSubmit: (data: any) => void;
  isLoading: boolean;
}) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    moduleId: "",
    triggerEvents: ["on_create", "on_update"] as string[],
    enforcementAction: "block" as "block" | "warn" | "require_approval",
    priority: 100,
    conditions: createEmptyGroup(),
    enforcementConfig: { message: "" },
  });

  const toggleEvent = (ev: string) => {
    setForm(f => ({
      ...f,
      triggerEvents: f.triggerEvents.includes(ev)
        ? f.triggerEvents.filter(e => e !== ev)
        : [...f.triggerEvents, ev],
    }));
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">חוק עסק חדש</h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">שם החוק *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="למשל: הזמנות מעל ₪50,000 דורשות אישור VP"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">תיאור</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="תיאור קצר של החוק"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">מודול</label>
              <select value={form.moduleId} onChange={e => setForm(f => ({ ...f, moduleId: e.target.value }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm">
                <option value="">כל המודולים</option>
                {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">עדיפות</label>
              <input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
                min={1} max={1000} className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">אירועי הפעלה</label>
            <div className="grid grid-cols-2 gap-2">
              {TRIGGER_EVENT_OPTIONS.map(ev => (
                <button key={ev.value} onClick={() => toggleEvent(ev.value)}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs transition-all text-right ${form.triggerEvents.includes(ev.value) ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/30"}`}>
                  {ev.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">פעולת אכיפה</label>
            <div className="grid grid-cols-3 gap-2">
              {ENFORCEMENT_ACTIONS.map(action => {
                const Icon = action.icon;
                return (
                  <button key={action.value} onClick={() => setForm(f => ({ ...f, enforcementAction: action.value as any }))}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs transition-all ${form.enforcementAction === action.value ? `border-${action.color}-500/50 bg-${action.color}-500/10` : "border-border hover:border-primary/30"}`}>
                    <Icon className={`w-5 h-5 text-${action.color}-400`} />
                    <span className="font-medium">{action.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">תנאים</label>
            <ConditionBuilder
              value={form.conditions}
              onChange={(g) => setForm(f => ({ ...f, conditions: g }))}
              fieldSuggestions={["status", "amount", "total", "quantity", "priority", "type"]}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">הודעת שגיאה</label>
            <input value={form.enforcementConfig.message} onChange={e => setForm(f => ({ ...f, enforcementConfig: { message: e.target.value } }))}
              placeholder="הודעה שתוצג כשהחוק מופעל"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm" />
          </div>
        </div>

        <div className="flex gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={() => onSubmit({
            ...form,
            moduleId: form.moduleId ? Number(form.moduleId) : null,
          })} disabled={!form.name || form.triggerEvents.length === 0 || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50">
            {isLoading ? "יוצר..." : "צור חוק"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
