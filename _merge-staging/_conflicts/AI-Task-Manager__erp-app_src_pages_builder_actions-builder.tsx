import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { authFetch } from "@/lib/utils";
import {
  Plus, Trash2, Edit2, Zap, MousePointerClick, X, Play,
  Copy, ArrowRight, ExternalLink, LayoutGrid, Settings
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { STATUS_COLORS } from "./field-type-registry";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

const ACTION_TYPE_LABELS: Record<string, string> = {
  page: "כפתור עמוד",
  row: "פעולת שורה",
  bulk: "פעולה מרובה",
  header: "כותרת",
  contextual: "הקשרי",
};

const HANDLER_TYPE_LABELS: Record<string, string> = {
  create: "צור רשומה",
  update: "עדכן רשומה",
  delete: "מחק רשומה",
  duplicate: "שכפל רשומה",
  status_change: "שנה סטטוס",
  workflow: "הפעל תהליך",
  modal: "פתח חלון",
  navigate: "נווט לעמוד",
  export: "ייצוא",
  import: "ייבוא",
  print: "הדפסה",
  custom: "מותאם אישית",
};

const HANDLER_TYPE_ICONS: Record<string, any> = {
  create: Plus,
  duplicate: Copy,
  status_change: ArrowRight,
  navigate: ExternalLink,
  modal: LayoutGrid,
  delete: Trash2,
  custom: Settings,
};

interface ActionDef {
  id: number;
  entityId: number;
  name: string;
  slug: string;
  actionType: string;
  handlerType: string;
  icon?: string;
  color?: string;
  conditions: any;
  handlerConfig: any;
  sortOrder: number;
  isActive: boolean;
}

export function ActionsTab({ entityId }: { entityId: number }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingAction, setEditingAction] = useState<ActionDef | null>(null);
  const [viewMode, setViewMode] = useState<"buttons" | "actions">("buttons");
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;

  const { data: actions = [] } = useQuery<ActionDef[]>({
    queryKey: ["entity-actions", entityId],
    queryFn: () => authFetch(`${API}/platform/entities/${entityId}/actions`).then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/entities/${entityId}/actions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create action");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["entity-actions", entityId] }); setShowForm(false); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const r = await authFetch(`${API}/platform/actions/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update action");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["entity-actions", entityId] }); setEditingAction(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/platform/actions/${id}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entity-actions", entityId] }),
  });

  const buttonActions = actions.filter(a => ["page", "header", "bulk"].includes(a.actionType));
  const rowActions = actions.filter(a => ["row", "contextual"].includes(a.actionType));

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => setViewMode("buttons")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${viewMode === "buttons" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
            <MousePointerClick className="w-4 h-4 inline mr-1" />
            כפתורים
          </button>
          <button onClick={() => setViewMode("actions")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${viewMode === "actions" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
            <Zap className="w-4 h-4 inline mr-1" />
            פעולות
          </button>
        </div>
        <button onClick={() => { setEditingAction(null); setShowForm(true); }} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" />
          {viewMode === "buttons" ? "כפתור חדש" : "פעולה חדשה"}
        </button>
      </div>

      {actions.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-8 text-center">
          <Zap className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">אין פעולות — הגדר כפתורים ופעולות להפעלת לוגיקה עסקית</p>
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium"><Plus className="w-4 h-4" />הוסף פעולה</button>
        </div>
      ) : (
        <div className="space-y-4">
          {viewMode === "buttons" && (
            <>
              <h3 className="text-sm font-medium text-muted-foreground">כפתורי עמוד וכותרת ({buttonActions.length})</h3>
              <div className="flex flex-wrap gap-3 mb-4 p-4 bg-card border border-border rounded-xl min-h-[60px]">
                {buttonActions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">אין כפתורי עמוד</p>
                ) : buttonActions.map(action => {
                  const colorDef = STATUS_COLORS.find(c => c.key === action.color);
                  return (
                    <div key={action.id} className="flex items-center gap-2 group">
                      <button className="px-3 py-2 rounded-xl text-sm font-medium border flex items-center gap-2"
                        style={{ borderColor: colorDef?.hex || "#6b7280", backgroundColor: `${colorDef?.hex || "#6b7280"}15`, color: colorDef?.hex || "#6b7280" }}>
                        <Play className="w-3.5 h-3.5" />
                        {action.name}
                      </button>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditingAction(action)} className="p-1 hover:bg-muted rounded"><Edit2 className="w-3 h-3 text-muted-foreground" /></button>
                        {isSuperAdmin && (
                          <button onClick={async () => { const ok = await globalConfirm("מחיקת פעולה", { itemName: action.name, entityType: "פעולה" }); if (ok) deleteMutation.mutate(action.id); }} className="p-1 hover:bg-destructive/10 rounded"><Trash2 className="w-3 h-3 text-destructive" /></button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <h3 className="text-sm font-medium text-muted-foreground">פעולות שורה ({rowActions.length})</h3>
              <div className="space-y-2">
                {rowActions.map(action => (
                  <div key={action.id} className="flex items-center gap-3 px-3 py-2.5 bg-card border border-border rounded-xl">
                    <Zap className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium flex-1">{action.name}</span>
                    <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded-md">{HANDLER_TYPE_LABELS[action.handlerType] || action.handlerType}</span>
                    <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded-md">{ACTION_TYPE_LABELS[action.actionType] || action.actionType}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditingAction(action)} className="p-1 hover:bg-muted rounded"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      {isSuperAdmin && (
                        <button onClick={async () => { const ok = await globalConfirm("מחיקת פעולה", { itemName: action.name, entityType: "פעולה" }); if (ok) deleteMutation.mutate(action.id); }} className="p-1 hover:bg-destructive/10 rounded"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {viewMode === "actions" && (
            <div className="space-y-2">
              {actions.map(action => (
                <div key={action.id} className={`flex items-center gap-3 px-4 py-3 bg-card border rounded-xl transition-colors ${action.isActive ? "border-border" : "border-border/50 opacity-60"}`}>
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{action.name}</p>
                      {!action.isActive && <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">מושבת</span>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded-md">{ACTION_TYPE_LABELS[action.actionType]}</span>
                      <span className="px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded-md">{HANDLER_TYPE_LABELS[action.handlerType]}</span>
                      <span>{action.slug}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditingAction(action)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    {isSuperAdmin && (
                      <button onClick={async () => { const ok = await globalConfirm("מחיקת פעולה", { itemName: action.name, entityType: "פעולה" }); if (ok) deleteMutation.mutate(action.id); }} className="p-1.5 hover:bg-destructive/10 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(showForm || editingAction) && (
        <ActionFormModal
          action={editingAction}
          entityId={entityId}
          onClose={() => { setShowForm(false); setEditingAction(null); }}
          onSubmit={(data) => {
            if (editingAction) {
              updateMutation.mutate({ id: editingAction.id, ...data });
            } else {
              createMutation.mutate(data);
            }
          }}
          isLoading={createMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  );
}

const CONDITION_OPERATORS: Record<string, string> = {
  equals: "שווה ל",
  not_equals: "שונה מ",
  contains: "מכיל",
  gt: "גדול מ",
  lt: "קטן מ",
  is_empty: "ריק",
  is_not_empty: "לא ריק",
  in_list: "ברשימה",
};

function ActionFormModal({ action, entityId, onClose, onSubmit, isLoading }: {
  action: ActionDef | null; entityId: number; onClose: () => void; onSubmit: (data: any) => void; isLoading: boolean;
}) {
  const [form, setForm] = useState({
    name: action?.name || "",
    slug: action?.slug || "",
    actionType: action?.actionType || "row",
    handlerType: action?.handlerType || "custom",
    icon: action?.icon || "",
    color: action?.color || "blue",
    isActive: action?.isActive ?? true,
    handlerConfig: action?.handlerConfig || {},
    conditions: action?.conditions || {},
  });

  const [activeSection, setActiveSection] = useState<"basic" | "handler" | "conditions">("basic");

  const autoSlug = (name: string) => name.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");

  const { data: entityData } = useQuery({
    queryKey: ["entity-for-action-form", entityId],
    queryFn: () => authFetch(`${API}/platform/entities/${entityId}`).then(r => r.json()),
  });

  const fields = entityData?.fields || [];
  const statuses = entityData?.statuses || [];

  const conditionRules: any[] = (() => {
    const c = form.conditions as any;
    if (Array.isArray(c)) return c;
    if (c?.rules && Array.isArray(c.rules)) return c.rules;
    return [];
  })();

  const setConditionRules = (rules: any[]) => {
    setForm(f => ({ ...f, conditions: { rules, combinator: ((f.conditions as any)?.combinator) || "and" } }));
  };

  const addConditionRule = () => {
    setConditionRules([...conditionRules, { field: "", operator: "equals", value: "" }]);
  };

  const updateConditionRule = (idx: number, updates: any) => {
    setConditionRules(conditionRules.map((r, i) => i === idx ? { ...r, ...updates } : r));
  };

  const removeConditionRule = (idx: number) => {
    setConditionRules(conditionRules.filter((_, i) => i !== idx));
  };

  const sectionTabs = [
    { key: "basic" as const, label: "הגדרות בסיסיות" },
    { key: "handler" as const, label: "הגדרות פעולה" },
    { key: "conditions" as const, label: `תנאים (${conditionRules.length})` },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">{action ? "עריכת פעולה" : "פעולה חדשה"}</h2>

        <div className="flex gap-1 p-1 bg-muted/30 rounded-xl mb-4">
          {sectionTabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveSection(tab.key)}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${activeSection === tab.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {activeSection === "basic" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">שם הפעולה *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, ...(!action ? { slug: autoSlug(e.target.value) } : {}) }))}
                  placeholder="למשל: אשר הזמנה" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Slug</label>
                <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} dir="ltr"
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">מיקום כפתור *</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {Object.entries(ACTION_TYPE_LABELS).map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setForm(f => ({ ...f, actionType: key }))}
                    className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${form.actionType === key ? "bg-primary text-primary-foreground" : "bg-background border border-border hover:border-primary/30"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">סוג פעולה *</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-h-[200px] overflow-y-auto">
                {Object.entries(HANDLER_TYPE_LABELS).map(([key, label]) => {
                  const Icon = HANDLER_TYPE_ICONS[key] || Zap;
                  return (
                    <button key={key} type="button" onClick={() => setForm(f => ({ ...f, handlerType: key }))}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${form.handlerType === key ? "bg-primary text-primary-foreground" : "bg-background border border-border hover:border-primary/30"}`}>
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">צבע</label>
              <div className="flex gap-2 flex-wrap">
                {STATUS_COLORS.map(c => (
                  <button key={c.key} type="button" onClick={() => setForm(f => ({ ...f, color: c.key }))}
                    className={`w-8 h-8 rounded-lg border-2 transition-all ${form.color === c.key ? "border-white scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c.hex }} title={c.label} />
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
              <span className="text-sm">פעיל</span>
            </label>
          </div>
        )}

        {activeSection === "handler" && (
          <div className="space-y-4">
            <div className="px-3 py-2 bg-muted/30 rounded-xl text-xs text-muted-foreground">
              סוג פעולה: <span className="font-medium text-foreground">{HANDLER_TYPE_LABELS[form.handlerType] || form.handlerType}</span>
            </div>

            {form.handlerType === "status_change" && (
              <div>
                <label className="block text-sm font-medium mb-1.5">סטטוס יעד</label>
                <select value={(form.handlerConfig as any).targetStatus || ""} onChange={e => setForm(f => ({ ...f, handlerConfig: { ...f.handlerConfig, targetStatus: e.target.value } }))}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">בחר סטטוס...</option>
                  {statuses.map((s: any) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                </select>
              </div>
            )}

            {form.handlerType === "navigate" && (
              <div>
                <label className="block text-sm font-medium mb-1.5">כתובת יעד</label>
                <input value={(form.handlerConfig as any).url || ""} onChange={e => setForm(f => ({ ...f, handlerConfig: { ...f.handlerConfig, url: e.target.value } }))}
                  placeholder="/path/to/page" dir="ltr" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            )}

            {form.handlerType === "update" && (
              <div className="space-y-3">
                <label className="block text-sm font-medium">שדות לעדכון</label>
                {Object.entries((form.handlerConfig as any).fields || {}).map(([fieldSlug, value]: [string, any], idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-background border border-border/50 rounded-lg">
                    <select value={fieldSlug} onChange={e => {
                      const oldFields = { ...(form.handlerConfig as any).fields };
                      const val = oldFields[fieldSlug];
                      delete oldFields[fieldSlug];
                      oldFields[e.target.value] = val;
                      setForm(f => ({ ...f, handlerConfig: { ...f.handlerConfig, fields: oldFields } }));
                    }} className="flex-1 px-2 py-1.5 bg-card border border-border rounded-lg text-xs">
                      <option value="">בחר שדה...</option>
                      {fields.map((f: any) => <option key={f.slug} value={f.slug}>{f.name}</option>)}
                    </select>
                    <input value={String(value || "")} onChange={e => {
                      const newFields = { ...(form.handlerConfig as any).fields, [fieldSlug]: e.target.value };
                      setForm(f => ({ ...f, handlerConfig: { ...f.handlerConfig, fields: newFields } }));
                    }} placeholder="ערך..." className="flex-1 px-2 py-1.5 bg-card border border-border rounded-lg text-xs" />
                    <button onClick={() => {
                      const newFields = { ...(form.handlerConfig as any).fields };
                      delete newFields[fieldSlug];
                      setForm(f => ({ ...f, handlerConfig: { ...f.handlerConfig, fields: newFields } }));
                    }} className="p-1 hover:bg-destructive/10 rounded"><X className="w-3.5 h-3.5 text-destructive" /></button>
                  </div>
                ))}
                <button onClick={() => {
                  const currentFields = (form.handlerConfig as any).fields || {};
                  setForm(f => ({ ...f, handlerConfig: { ...f.handlerConfig, fields: { ...currentFields, "": "" } } }));
                }} className="w-full px-3 py-2 bg-background border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors">
                  + הוסף שדה לעדכון
                </button>
              </div>
            )}

            {form.handlerType === "modal" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">כותרת חלון</label>
                  <input value={(form.handlerConfig as any).modalTitle || ""} onChange={e => setForm(f => ({ ...f, handlerConfig: { ...f.handlerConfig, modalTitle: e.target.value } }))}
                    placeholder="כותרת..." className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">תוכן חלון</label>
                  <textarea value={(form.handlerConfig as any).modalContent || ""} onChange={e => setForm(f => ({ ...f, handlerConfig: { ...f.handlerConfig, modalContent: e.target.value } }))}
                    placeholder="תוכן הודעה..." rows={3} className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
                </div>
              </div>
            )}

            {form.handlerType === "workflow" && (
              <div className="space-y-3">
                <label className="block text-sm font-medium">שלבי תהליך</label>
                <p className="text-xs text-muted-foreground">הגדר שרשרת פעולות שירוצו ברצף</p>
                {((form.handlerConfig as any).actions || []).map((wfAction: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-background border border-border/50 rounded-lg">
                    <span className="text-xs font-medium text-muted-foreground w-5">{idx + 1}.</span>
                    <select value={wfAction.type || ""} onChange={e => {
                      const newActions = [...((form.handlerConfig as any).actions || [])];
                      newActions[idx] = { ...newActions[idx], type: e.target.value };
                      setForm(f => ({ ...f, handlerConfig: { ...f.handlerConfig, actions: newActions } }));
                    }} className="flex-1 px-2 py-1.5 bg-card border border-border rounded-lg text-xs">
                      <option value="">בחר פעולה...</option>
                      <option value="set_status">שנה סטטוס</option>
                      <option value="update_field">עדכן שדה</option>
                      <option value="create_record">צור רשומה</option>
                      <option value="send_notification">שלח התראה</option>
                    </select>
                    <button onClick={() => {
                      const newActions = ((form.handlerConfig as any).actions || []).filter((_: any, i: number) => i !== idx);
                      setForm(f => ({ ...f, handlerConfig: { ...f.handlerConfig, actions: newActions } }));
                    }} className="p-1 hover:bg-destructive/10 rounded"><X className="w-3.5 h-3.5 text-destructive" /></button>
                  </div>
                ))}
                <button onClick={() => {
                  const currentActions = (form.handlerConfig as any).actions || [];
                  setForm(f => ({ ...f, handlerConfig: { ...f.handlerConfig, actions: [...currentActions, { type: "", config: {} }] } }));
                }} className="w-full px-3 py-2 bg-background border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors">
                  + הוסף שלב
                </button>
              </div>
            )}

            {!["status_change", "navigate", "update", "modal", "workflow", "create", "delete", "duplicate"].includes(form.handlerType) && (
              <div className="text-center py-4 text-muted-foreground text-sm">
                אין הגדרות נוספות לסוג פעולה זה
              </div>
            )}
          </div>
        )}

        {activeSection === "conditions" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">הגדר תנאים שיקבעו מתי הפעולה זמינה. הפעולה תופיע רק כאשר כל התנאים מתקיימים.</p>
            {conditionRules.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">שלב:</span>
                <button onClick={() => setForm(f => ({ ...f, conditions: { ...f.conditions as any, combinator: "and" } }))}
                  className={`px-2 py-1 rounded-lg text-xs font-medium ${((form.conditions as any)?.combinator || "and") === "and" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  וגם (AND)
                </button>
                <button onClick={() => setForm(f => ({ ...f, conditions: { ...f.conditions as any, combinator: "or" } }))}
                  className={`px-2 py-1 rounded-lg text-xs font-medium ${((form.conditions as any)?.combinator) === "or" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  או (OR)
                </button>
              </div>
            )}
            {conditionRules.map((rule, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2.5 bg-background border border-border/50 rounded-lg">
                <select value={rule.field || ""} onChange={e => updateConditionRule(idx, { field: e.target.value })}
                  className="flex-1 px-2 py-1.5 bg-card border border-border rounded-lg text-xs">
                  <option value="">בחר שדה...</option>
                  <option value="__status">סטטוס</option>
                  {fields.map((f: any) => <option key={f.slug} value={f.slug}>{f.name}</option>)}
                </select>
                <select value={rule.operator || "equals"} onChange={e => updateConditionRule(idx, { operator: e.target.value })}
                  className="px-2 py-1.5 bg-card border border-border rounded-lg text-xs">
                  {Object.entries(CONDITION_OPERATORS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                {!["is_empty", "is_not_empty"].includes(rule.operator) && (
                  <input value={rule.value || ""} onChange={e => updateConditionRule(idx, { value: e.target.value })}
                    placeholder="ערך..." className="flex-1 px-2 py-1.5 bg-card border border-border rounded-lg text-xs" />
                )}
                <button onClick={() => removeConditionRule(idx)} className="p-1 hover:bg-destructive/10 rounded">
                  <X className="w-3.5 h-3.5 text-destructive" />
                </button>
              </div>
            ))}
            <button onClick={addConditionRule} className="w-full px-3 py-2 bg-background border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors">
              + הוסף תנאי
            </button>
          </div>
        )}

        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={() => {
            const cleanConditions = conditionRules.length > 0
              ? { rules: conditionRules.filter(r => r.field), combinator: ((form.conditions as any)?.combinator) || "and" }
              : {};
            const cleanHandlerConfig = { ...form.handlerConfig };
            if (form.handlerType === "update" && cleanHandlerConfig.fields) {
              const filtered: Record<string, any> = {};
              for (const [k, v] of Object.entries(cleanHandlerConfig.fields)) {
                if (k) filtered[k] = v;
              }
              cleanHandlerConfig.fields = filtered;
            }
            onSubmit({ ...form, conditions: cleanConditions, handlerConfig: cleanHandlerConfig });
          }} disabled={!form.name || !form.slug || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : action ? "עדכן" : "הוסף פעולה"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="actions" />
        <RelatedRecords entityType="actions" />
      </div>
      </motion.div>
    </motion.div>
  );
}
