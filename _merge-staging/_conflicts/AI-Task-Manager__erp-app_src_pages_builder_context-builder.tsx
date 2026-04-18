import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { usePlatformModules } from "@/hooks/usePlatformModules";
import {
  Plus, Trash2, Settings, Eye, Search, ChevronDown, ChevronUp,
  CheckCircle, XCircle, X, Power, List, Play, Filter,
  Layers, Shield, CircleDot, Box, Puzzle, RefreshCw,
  EyeOff, ToggleLeft, Menu, Zap
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

interface PlatformContext {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  contextType: string;
  conditions: any[];
  effects: any;
  entityId: number | null;
  moduleId: number | null;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface EvaluationLog {
  id: number;
  contextId: number;
  userId: number | null;
  entityId: number | null;
  recordId: number | null;
  conditionsSnapshot: any;
  effectsApplied: any;
  matched: boolean;
  evaluationTimeMs: number | null;
  evaluatedAt: string;
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

const CONTEXT_TYPES = [
  { type: "role_based", label: "מבוסס תפקיד", icon: Shield, color: "blue" },
  { type: "status_based", label: "מבוסס סטטוס", icon: CircleDot, color: "green" },
  { type: "entity_based", label: "מבוסס ישות", icon: Box, color: "purple" },
  { type: "conditional", label: "תנאי מותאם", icon: Filter, color: "orange" },
  { type: "composite", label: "מורכב", icon: Puzzle, color: "pink" },
];

const CONDITION_TYPES = [
  { type: "role", label: "תפקיד משתמש" },
  { type: "status", label: "סטטוס רשומה" },
  { type: "entity", label: "סוג ישות" },
  { type: "module", label: "מודול פעיל" },
  { type: "field", label: "ערך שדה" },
];

const CONDITION_OPERATORS = [
  { value: "equals", label: "שווה ל" },
  { value: "not_equals", label: "לא שווה ל" },
  { value: "contains", label: "מכיל" },
  { value: "is_empty", label: "ריק" },
  { value: "is_not_empty", label: "לא ריק" },
];

const EFFECT_TYPES = [
  { key: "hide_fields", label: "הסתר שדות", icon: EyeOff, color: "red" },
  { key: "show_fields", label: "הצג שדות", icon: Eye, color: "green" },
  { key: "disable_buttons", label: "השבת כפתורים", icon: ToggleLeft, color: "orange" },
  { key: "filter_statuses", label: "סנן סטטוסים", icon: Filter, color: "purple" },
  { key: "modify_menu", label: "שנה תפריט", icon: Menu, color: "blue" },
];

export default function ContextBuilder() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingContext, setEditingContext] = useState<PlatformContext | null>(null);
  const [viewingLogs, setViewingLogs] = useState<number | null>(null);
  const [previewContext, setPreviewContext] = useState<PlatformContext | null>(null);
  const [search, setSearch] = useState("");
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;

  const { data: contexts = [], isLoading } = useQuery<PlatformContext[]>({
    queryKey: ["platform-contexts"],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/contexts`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { modules } = usePlatformModules();

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/contexts`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create context");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-contexts"] });
      setShowCreate(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const r = await authFetch(`${API}/platform/contexts/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update context");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-contexts"] });
      setEditingContext(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/platform/contexts/${id}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platform-contexts"] }),
  });

  if (viewingLogs !== null) {
    return (
      <ContextLogView
        contextId={viewingLogs}
        contextName={contexts.find(c => c.id === viewingLogs)?.name || ""}
        onBack={() => setViewingLogs(null)}
      />
    );
  }

  if (editingContext) {
    return (
      <ContextEditor
        context={editingContext}
        modules={modules}
        onBack={() => setEditingContext(null)}
        onSave={(data) => updateMutation.mutate({ id: editingContext.id, ...data })}
        isSaving={updateMutation.isPending}
      />
    );
  }

  const filtered = contexts.filter(c => !search || c.name.includes(search) || c.slug.includes(search));

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold">בונה הקשרים</h1>
          <p className="text-muted-foreground mt-1">הגדר כללי הקשר דינמיים — מה מוצג ומתי, בהתאם לתפקיד, סטטוס, ישות או תנאי מותאם</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-5 h-5" />
          הקשר חדש
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <p className="text-lg sm:text-2xl font-bold">{contexts.length}</p>
              <p className="text-xs text-muted-foreground">סה״כ הקשרים</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-400">
              <Power className="w-5 h-5" />
            </div>
            <div>
              <p className="text-lg sm:text-2xl font-bold">{contexts.filter(c => c.isActive).length}</p>
              <p className="text-xs text-muted-foreground">פעילים</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
              <Puzzle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-lg sm:text-2xl font-bold">{new Set(contexts.map(c => c.contextType)).size}</p>
              <p className="text-xs text-muted-foreground">סוגי הקשר</p>
            </div>
          </div>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש הקשרים..."
          className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
          <Layers className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">אין הקשרים</h3>
          <p className="text-muted-foreground mb-6">צור הקשר ראשון — למשל: ״כשהמשתמש מנהל — הצג כפתורי ניהול״</p>
          <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium">
            <Plus className="w-5 h-5" />
            צור הקשר ראשון
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((ctx, i) => {
            const ctxType = CONTEXT_TYPES.find(t => t.type === ctx.contextType) || CONTEXT_TYPES[3];
            const TypeIcon = ctxType.icon;
            const conditions = Array.isArray(ctx.conditions) ? ctx.conditions : [];
            const effects = ctx.effects || {};
            const effectCount = Object.keys(effects).filter(k => {
              const v = effects[k];
              return Array.isArray(v) ? v.length > 0 : !!v;
            }).length;

            return (
              <motion.div key={ctx.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="bg-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-${ctxType.color}-500/10`}>
                      <TypeIcon className={`w-5 h-5 text-${ctxType.color}-400`} />
                    </div>
                    <div>
                      <h3 className="font-semibold">{ctx.name}</h3>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{ctxType.label}</span>
                        <span>•</span>
                        <span>עדיפות: {ctx.priority}</span>
                        <span>•</span>
                        <span>{conditions.length} תנאים</span>
                        <span>•</span>
                        <span>{effectCount} אפקטים</span>
                      </div>
                      {ctx.description && <p className="text-xs text-muted-foreground mt-1">{ctx.description}</p>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  {conditions.map((cond: any, ci: number) => (
                    <span key={ci} className="px-2 py-1 bg-orange-500/10 text-orange-400 rounded-lg text-xs font-medium">
                      {CONDITION_TYPES.find(t => t.type === cond.type)?.label || cond.type}: {cond.value || cond.field || "—"}
                    </span>
                  ))}
                  {Object.entries(effects).map(([key, val]: [string, any]) => {
                    if (Array.isArray(val) && val.length === 0) return null;
                    if (!val) return null;
                    const eff = EFFECT_TYPES.find(e => e.key === key);
                    return (
                      <span key={key} className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded-lg text-xs font-medium">
                        {eff?.label || key}: {Array.isArray(val) ? val.length : "✓"}
                      </span>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-border/50">
                  <button onClick={() => updateMutation.mutate({ id: ctx.id, isActive: !ctx.isActive })}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${ctx.isActive ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground"}`}>
                    {ctx.isActive ? <Play className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                    {ctx.isActive ? "פעיל" : "מושהה"}
                  </button>
                  <button onClick={() => setPreviewContext(ctx)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors">
                    <Eye className="w-3.5 h-3.5" />
                    תצוגה מקדימה
                  </button>
                  <button onClick={() => setViewingLogs(ctx.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-muted text-muted-foreground rounded-lg text-xs font-medium hover:text-foreground transition-colors">
                    <List className="w-3.5 h-3.5" />
                    לוג
                  </button>
                  <div className="mr-auto flex items-center gap-1">
                    <button onClick={() => setEditingContext(ctx)} className="p-2 hover:bg-muted rounded-lg transition-colors">
                      <Settings className="w-4 h-4 text-muted-foreground" />
                    </button>
                    {isSuperAdmin && (
                      <button onClick={async () => { const ok = await globalConfirm("מחיקת הקשר", { itemName: ctx.name, entityType: "הקשר" }); if (ok) deleteMutation.mutate(ctx.id); }}
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

      <AnimatePresence>
        {showCreate && (
          <CreateContextModal
            modules={modules}
            onClose={() => setShowCreate(false)}
            onSubmit={(data) => createMutation.mutate(data)}
            isLoading={createMutation.isPending}
          />
        )}
        {previewContext && (
          <ContextPreviewModal
            context={previewContext}
            onClose={() => setPreviewContext(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function CreateContextModal({ modules, onClose, onSubmit, isLoading }: {
  modules: PlatformModule[];
  onClose: () => void;
  onSubmit: (data: any) => void;
  isLoading: boolean;
}) {
  const [form, setForm] = useState({
    name: "", slug: "", description: "",
    contextType: "conditional" as string,
    conditions: [] as any[],
    effects: {} as Record<string, any>,
    moduleId: "" as string,
    entityId: "" as string,
    priority: 0,
  });

  const { data: entities = [] } = useQuery<ModuleEntity[]>({
    queryKey: ["module-entities-for-context", form.moduleId],
    queryFn: async () => {
      if (!form.moduleId) return [];
      const r = await authFetch(`${API}/platform/modules/${form.moduleId}/entities`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!form.moduleId,
  });

  const autoSlug = (name: string) => name.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");

  const addCondition = () => {
    setForm(f => ({ ...f, conditions: [...f.conditions, { type: "role", value: "", operator: "equals", field: "" }] }));
  };

  const updateCondition = (index: number, updates: any) => {
    setForm(f => ({
      ...f,
      conditions: f.conditions.map((c, i) => i === index ? { ...c, ...updates } : c),
    }));
  };

  const removeCondition = (index: number) => {
    setForm(f => ({ ...f, conditions: f.conditions.filter((_, i) => i !== index) }));
  };

  const toggleEffect = (key: string) => {
    setForm(f => {
      const effects = { ...f.effects };
      if (effects[key]) {
        delete effects[key];
      } else {
        effects[key] = [];
      }
      return { ...f, effects };
    });
  };

  const updateEffectValues = (key: string, value: string) => {
    setForm(f => ({
      ...f,
      effects: { ...f.effects, [key]: value.split(",").map(v => v.trim()).filter(Boolean) },
    }));
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">הקשר חדש</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">שם</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: autoSlug(e.target.value) }))}
                placeholder="למשל: מנהל — הצג כפתורי ניהול"
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">עדיפות</label>
              <input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">תיאור</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="מה ההקשר הזה עושה?"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">סוג הקשר</label>
            <div className="grid grid-cols-5 gap-2">
              {CONTEXT_TYPES.map(ct => {
                const Icon = ct.icon;
                return (
                  <button key={ct.type} type="button" onClick={() => setForm(f => ({ ...f, contextType: ct.type }))}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs transition-all ${form.contextType === ct.type ? `border-${ct.color}-500 bg-${ct.color}-500/10` : "border-border hover:border-primary/30"}`}>
                    <Icon className="w-4 h-4" />
                    {ct.label}
                  </button>
                );
              })}
            </div>
          </div>

          {modules.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1.5">מודול (אופציונלי)</label>
              <select value={form.moduleId} onChange={e => setForm(f => ({ ...f, moduleId: e.target.value }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">כל המודולים</option>
                {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}

          {form.moduleId && entities.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1.5">ישות (אופציונלי)</label>
              <select value={form.entityId} onChange={e => setForm(f => ({ ...f, entityId: e.target.value }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">כל הישויות</option>
                {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          )}

          <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-orange-400">תנאים (Conditions)</h3>
              <button onClick={addCondition} className="flex items-center gap-1 px-2 py-1 bg-orange-500/10 text-orange-400 rounded-lg text-xs font-medium hover:bg-orange-500/20">
                <Plus className="w-3.5 h-3.5" />
                הוסף תנאי
              </button>
            </div>
            {form.conditions.length === 0 ? (
              <p className="text-xs text-muted-foreground">אין תנאים — ההקשר יתקיים תמיד</p>
            ) : (
              <div className="space-y-2">
                {form.conditions.map((cond, i) => (
                  <div key={i} className="flex items-center gap-2 bg-muted/30 rounded-lg p-2">
                    <select value={cond.type} onChange={e => updateCondition(i, { type: e.target.value })}
                      className="px-2 py-1.5 bg-background border border-border rounded-lg text-xs flex-shrink-0">
                      {CONDITION_TYPES.map(ct => <option key={ct.type} value={ct.type}>{ct.label}</option>)}
                    </select>
                    {cond.type === "field" && (
                      <>
                        <input value={cond.field || ""} onChange={e => updateCondition(i, { field: e.target.value })}
                          placeholder="שם שדה" className="px-2 py-1.5 bg-background border border-border rounded-lg text-xs w-24" />
                        <select value={cond.operator || "equals"} onChange={e => updateCondition(i, { operator: e.target.value })}
                          className="px-2 py-1.5 bg-background border border-border rounded-lg text-xs">
                          {CONDITION_OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                        </select>
                      </>
                    )}
                    {!["is_empty", "is_not_empty"].includes(cond.operator || "") && (
                      <input value={cond.value || ""} onChange={e => updateCondition(i, { value: e.target.value })}
                        placeholder="ערך" className="flex-1 px-2 py-1.5 bg-background border border-border rounded-lg text-xs" />
                    )}
                    <button onClick={() => removeCondition(i)} className="p-1 hover:bg-destructive/10 rounded">
                      <X className="w-3.5 h-3.5 text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-blue-400 mb-3">אפקטים (Effects)</h3>
            <div className="space-y-3">
              {EFFECT_TYPES.map(eff => {
                const Icon = eff.icon;
                const isActive = form.effects[eff.key] !== undefined;
                return (
                  <div key={eff.key} className="space-y-1.5">
                    <button type="button" onClick={() => toggleEffect(eff.key)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs w-full transition-all ${isActive ? `border-${eff.color}-500 bg-${eff.color}-500/10` : "border-border hover:border-primary/30"}`}>
                      <Icon className="w-3.5 h-3.5" />
                      <span className="font-medium">{eff.label}</span>
                      {isActive && <CheckCircle className="w-3.5 h-3.5 mr-auto text-green-400" />}
                    </button>
                    {isActive && (
                      <input
                        value={Array.isArray(form.effects[eff.key]) ? form.effects[eff.key].join(", ") : ""}
                        onChange={e => updateEffectValues(eff.key, e.target.value)}
                        placeholder="ערכים מופרדים בפסיק — למשל: field1, field2, field3"
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={() => onSubmit({
            ...form,
            moduleId: form.moduleId ? Number(form.moduleId) : null,
            entityId: form.entityId ? Number(form.entityId) : null,
          })} disabled={!form.name || !form.slug || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50">
            {isLoading ? "יוצר..." : "צור הקשר"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ContextEditor({ context, modules, onBack, onSave, isSaving }: {
  context: PlatformContext;
  modules: PlatformModule[];
  onBack: () => void;
  onSave: (data: any) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState({
    name: context.name,
    description: context.description || "",
    contextType: context.contextType,
    conditions: Array.isArray(context.conditions) ? context.conditions : [],
    effects: context.effects || {},
    moduleId: context.moduleId?.toString() || "",
    entityId: context.entityId?.toString() || "",
    priority: context.priority,
    isActive: context.isActive,
  });

  const { data: entities = [] } = useQuery<ModuleEntity[]>({
    queryKey: ["module-entities-for-context-edit", form.moduleId],
    queryFn: async () => {
      if (!form.moduleId) return [];
      const r = await authFetch(`${API}/platform/modules/${form.moduleId}/entities`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!form.moduleId,
  });

  const addCondition = () => {
    setForm(f => ({ ...f, conditions: [...f.conditions, { type: "role", value: "", operator: "equals", field: "" }] }));
  };

  const updateCondition = (index: number, updates: any) => {
    setForm(f => ({
      ...f,
      conditions: f.conditions.map((c, i) => i === index ? { ...c, ...updates } : c),
    }));
  };

  const removeCondition = (index: number) => {
    setForm(f => ({ ...f, conditions: f.conditions.filter((_, i) => i !== index) }));
  };

  const toggleEffect = (key: string) => {
    setForm(f => {
      const effects = { ...f.effects };
      if (effects[key]) {
        delete effects[key];
      } else {
        effects[key] = [];
      }
      return { ...f, effects };
    });
  };

  const updateEffectValues = (key: string, value: string) => {
    setForm(f => ({
      ...f,
      effects: { ...f.effects, [key]: value.split(",").map(v => v.trim()).filter(Boolean) },
    }));
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-muted rounded-lg transition-colors">
          <ChevronDown className="w-5 h-5 rotate-90" />
        </button>
        <div>
          <h1 className="text-lg sm:text-2xl font-bold">עריכת הקשר: {context.name}</h1>
          <p className="text-sm text-muted-foreground">{context.slug}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">שם</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">עדיפות</label>
            <input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">תיאור</label>
          <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">סוג הקשר</label>
          <div className="grid grid-cols-5 gap-2">
            {CONTEXT_TYPES.map(ct => {
              const Icon = ct.icon;
              return (
                <button key={ct.type} type="button" onClick={() => setForm(f => ({ ...f, contextType: ct.type }))}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs transition-all ${form.contextType === ct.type ? `border-${ct.color}-500 bg-${ct.color}-500/10` : "border-border hover:border-primary/30"}`}>
                  <Icon className="w-4 h-4" />
                  {ct.label}
                </button>
              );
            })}
          </div>
        </div>

        {modules.length > 0 && (
          <div>
            <label className="block text-sm font-medium mb-1.5">מודול</label>
            <select value={form.moduleId} onChange={e => setForm(f => ({ ...f, moduleId: e.target.value }))}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              <option value="">כל המודולים</option>
              {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        )}

        {form.moduleId && entities.length > 0 && (
          <div>
            <label className="block text-sm font-medium mb-1.5">ישות</label>
            <select value={form.entityId} onChange={e => setForm(f => ({ ...f, entityId: e.target.value }))}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              <option value="">כל הישויות</option>
              {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
        )}

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
            className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
          <span className="text-sm">פעיל</span>
        </label>
      </div>

      <div className="bg-card border border-orange-500/20 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-orange-400">תנאים</h2>
          <button onClick={addCondition} className="flex items-center gap-1 px-3 py-1.5 bg-orange-500/10 text-orange-400 rounded-lg text-xs font-medium hover:bg-orange-500/20">
            <Plus className="w-3.5 h-3.5" />
            הוסף תנאי
          </button>
        </div>
        {form.conditions.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין תנאים — ההקשר יתקיים תמיד</p>
        ) : (
          <div className="space-y-2">
            {form.conditions.map((cond, i) => (
              <div key={i} className="flex items-center gap-2 bg-muted/30 rounded-lg p-3">
                <select value={cond.type} onChange={e => updateCondition(i, { type: e.target.value })}
                  className="px-2 py-1.5 bg-background border border-border rounded-lg text-sm flex-shrink-0">
                  {CONDITION_TYPES.map(ct => <option key={ct.type} value={ct.type}>{ct.label}</option>)}
                </select>
                {cond.type === "field" && (
                  <>
                    <input value={cond.field || ""} onChange={e => updateCondition(i, { field: e.target.value })}
                      placeholder="שם שדה" className="px-2 py-1.5 bg-background border border-border rounded-lg text-sm w-28" />
                    <select value={cond.operator || "equals"} onChange={e => updateCondition(i, { operator: e.target.value })}
                      className="px-2 py-1.5 bg-background border border-border rounded-lg text-sm">
                      {CONDITION_OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                    </select>
                  </>
                )}
                {!["is_empty", "is_not_empty"].includes(cond.operator || "") && (
                  <input value={cond.value || ""} onChange={e => updateCondition(i, { value: e.target.value })}
                    placeholder="ערך" className="flex-1 px-2 py-1.5 bg-background border border-border rounded-lg text-sm" />
                )}
                <button onClick={() => removeCondition(i)} className="p-1.5 hover:bg-destructive/10 rounded">
                  <X className="w-4 h-4 text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-card border border-blue-500/20 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-blue-400 mb-4">אפקטים</h2>
        <div className="space-y-3">
          {EFFECT_TYPES.map(eff => {
            const Icon = eff.icon;
            const isActive = form.effects[eff.key] !== undefined;
            return (
              <div key={eff.key} className="space-y-2">
                <button type="button" onClick={() => toggleEffect(eff.key)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm w-full transition-all ${isActive ? `border-${eff.color}-500 bg-${eff.color}-500/10` : "border-border hover:border-primary/30"}`}>
                  <Icon className="w-4 h-4" />
                  <span className="font-medium">{eff.label}</span>
                  {isActive && <CheckCircle className="w-4 h-4 mr-auto text-green-400" />}
                </button>
                {isActive && (
                  <input
                    value={Array.isArray(form.effects[eff.key]) ? form.effects[eff.key].join(", ") : ""}
                    onChange={e => updateEffectValues(eff.key, e.target.value)}
                    placeholder="ערכים מופרדים בפסיק — למשל: field1, field2, field3"
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={() => onSave({
          ...form,
          moduleId: form.moduleId ? Number(form.moduleId) : null,
          entityId: form.entityId ? Number(form.entityId) : null,
        })} disabled={!form.name || isSaving}
          className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors">
          {isSaving ? "שומר..." : "שמור שינויים"}
        </button>
        <button onClick={onBack} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
      </div>
    </div>
  );
}

function ContextLogView({ contextId, contextName, onBack }: {
  contextId: number;
  contextName: string;
  onBack: () => void;
}) {
  const { data: logs = [], isLoading } = useQuery<EvaluationLog[]>({
    queryKey: ["context-logs", contextId],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/contexts/${contextId}/logs`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-muted rounded-lg transition-colors">
          <ChevronDown className="w-5 h-5 rotate-90" />
        </button>
        <div>
          <h1 className="text-lg sm:text-2xl font-bold">לוג הערכת הקשר</h1>
          <p className="text-sm text-muted-foreground">{contextName}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
          <List className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">אין לוגים</h3>
          <p className="text-muted-foreground">הלוגים יופיעו כאן לאחר הערכת ההקשר</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log, i) => (
            <motion.div key={log.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
              className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  {log.matched ? (
                    <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                      <XCircle className="w-4 h-4 text-red-400" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium">{log.matched ? "תנאים התקיימו" : "תנאים לא התקיימו"}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(log.evaluatedAt).toLocaleString("he-IL")}
                      {log.evaluationTimeMs !== null && ` • ${log.evaluationTimeMs}ms`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {log.userId && <span>משתמש: {log.userId}</span>}
                  {log.recordId && <span>רשומה: {log.recordId}</span>}
                </div>
              </div>
              {log.matched && log.effectsApplied && Object.keys(log.effectsApplied).length > 0 && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50 flex-wrap">
                  {Object.entries(log.effectsApplied).map(([key, val]: [string, any]) => (
                    <span key={key} className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded-lg text-xs">
                      {EFFECT_TYPES.find(e => e.key === key)?.label || key}: {Array.isArray(val) ? val.join(", ") : String(val)}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContextPreviewModal({ context, onClose }: {
  context: PlatformContext;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [testInput, setTestInput] = useState({
    userRole: "",
    recordStatus: "",
    entityId: "",
    recordId: "",
    moduleId: "",
    recordData: {} as Record<string, string>,
    fieldKey: "",
    fieldValue: "",
  });
  const [result, setResult] = useState<any>(null);

  const evaluateMutation = useMutation({
    mutationFn: async () => {
      const body: any = {};
      if (testInput.userRole) body.userRole = testInput.userRole;
      if (testInput.recordStatus) body.recordStatus = testInput.recordStatus;
      if (testInput.entityId) body.entityId = Number(testInput.entityId);
      if (testInput.recordId) body.recordId = Number(testInput.recordId);
      if (testInput.moduleId) body.moduleId = Number(testInput.moduleId);
      if (Object.keys(testInput.recordData).length > 0) body.recordData = testInput.recordData;

      const r = await authFetch(`${API}/platform/contexts/${context.id}/evaluate`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Failed to evaluate");
      return r.json();
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["context-logs", context.id] });
    },
  });

  const addField = () => {
    if (!testInput.fieldKey) return;
    setTestInput(t => ({
      ...t,
      recordData: { ...t.recordData, [t.fieldKey]: t.fieldValue },
      fieldKey: "",
      fieldValue: "",
    }));
  };

  const conditions = Array.isArray(context.conditions) ? context.conditions : [];
  const effects = context.effects || {};
  const ctxType = CONTEXT_TYPES.find(t => t.type === context.contextType) || CONTEXT_TYPES[3];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">תצוגה מקדימה: {context.name}</h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-muted/30 rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-2">תנאים ({conditions.length})</h3>
            {conditions.length === 0 ? (
              <p className="text-xs text-muted-foreground">אין תנאים</p>
            ) : (
              <div className="space-y-1">
                {conditions.map((c: any, i: number) => (
                  <div key={i} className="text-xs px-2 py-1 bg-orange-500/10 text-orange-400 rounded-lg">
                    {CONDITION_TYPES.find(t => t.type === c.type)?.label}: {c.value || c.field || "—"}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-muted/30 rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-2">אפקטים</h3>
            {Object.keys(effects).length === 0 ? (
              <p className="text-xs text-muted-foreground">אין אפקטים</p>
            ) : (
              <div className="space-y-1">
                {Object.entries(effects).map(([key, val]: [string, any]) => (
                  <div key={key} className="text-xs px-2 py-1 bg-blue-500/10 text-blue-400 rounded-lg">
                    {EFFECT_TYPES.find(e => e.key === key)?.label}: {Array.isArray(val) ? val.join(", ") : String(val)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-4">
          <h3 className="text-sm font-semibold text-primary mb-3">בדיקת הקשר (Evaluate)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <input value={testInput.userRole} onChange={e => setTestInput(t => ({ ...t, userRole: e.target.value }))}
              placeholder="תפקיד משתמש (role)" className="px-3 py-2 bg-background border border-border rounded-lg text-sm" />
            <input value={testInput.recordStatus} onChange={e => setTestInput(t => ({ ...t, recordStatus: e.target.value }))}
              placeholder="סטטוס רשומה" className="px-3 py-2 bg-background border border-border rounded-lg text-sm" />
            <input value={testInput.moduleId} onChange={e => setTestInput(t => ({ ...t, moduleId: e.target.value }))}
              placeholder="מזהה מודול" className="px-3 py-2 bg-background border border-border rounded-lg text-sm" />
            <input value={testInput.entityId} onChange={e => setTestInput(t => ({ ...t, entityId: e.target.value }))}
              placeholder="מזהה ישות" className="px-3 py-2 bg-background border border-border rounded-lg text-sm" />
            <input value={testInput.recordId} onChange={e => setTestInput(t => ({ ...t, recordId: e.target.value }))}
              placeholder="מזהה רשומה" className="px-3 py-2 bg-background border border-border rounded-lg text-sm" />
          </div>
          <div className="flex gap-2 mb-3">
            <input value={testInput.fieldKey} onChange={e => setTestInput(t => ({ ...t, fieldKey: e.target.value }))}
              placeholder="שם שדה" className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm" />
            <input value={testInput.fieldValue} onChange={e => setTestInput(t => ({ ...t, fieldValue: e.target.value }))}
              placeholder="ערך" className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm" />
            <button onClick={addField} disabled={!testInput.fieldKey}
              className="px-3 py-2 bg-muted rounded-lg text-sm font-medium disabled:opacity-50">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {Object.keys(testInput.recordData).length > 0 && (
            <div className="flex gap-2 flex-wrap mb-3">
              {Object.entries(testInput.recordData).map(([k, v]) => (
                <span key={k} className="px-2 py-1 bg-muted rounded-lg text-xs">
                  {k}={v}
                  <button onClick={() => setTestInput(t => {
                    const rd = { ...t.recordData };
                    delete rd[k];
                    return { ...t, recordData: rd };
                  })} className="mr-1 text-destructive">×</button>
                </span>
              ))}
            </div>
          )}
          <button onClick={() => evaluateMutation.mutate()} disabled={evaluateMutation.isPending}
            className="w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors">
            {evaluateMutation.isPending ? "בודק..." : "הרץ בדיקה"}
          </button>
        </div>

        {result && (
          <div className={`rounded-xl p-4 border ${result.matched ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"}`}>
            <div className="flex items-center gap-2 mb-3">
              {result.matched ? (
                <>
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  <span className="font-semibold text-green-400">תנאים התקיימו — אפקטים יוחלו</span>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-red-400" />
                  <span className="font-semibold text-red-400">תנאים לא התקיימו — אין אפקטים</span>
                </>
              )}
            </div>
            {result.matched && result.effects && Object.keys(result.effects).length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">אפקטים שיוחלו:</p>
                {Object.entries(result.effects).map(([key, val]: [string, any]) => (
                  <div key={key} className="flex items-center gap-2 bg-muted/30 rounded-lg p-2">
                    <span className="text-sm font-medium">{EFFECT_TYPES.find(e => e.key === key)?.label || key}:</span>
                    <span className="text-sm text-muted-foreground">{Array.isArray(val) ? val.join(", ") : String(val)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="context" />
        <RelatedRecords entityType="context" />
      </div>
      </motion.div>
    </motion.div>
  );
}
