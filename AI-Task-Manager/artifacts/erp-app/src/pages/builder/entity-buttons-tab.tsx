import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { authFetch } from "@/lib/utils";
import {
  Plus, Trash2, Edit2, MousePointerClick, Play, X, Copy, GripVertical
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { STATUS_COLORS } from "./field-type-registry";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

interface ButtonDef {
  id: number;
  entityId: number;
  name: string;
  slug: string;
  placement: string;
  style: string | null;
  icon: string | null;
  color: string | null;
  actionId: number | null;
  actionType: string | null;
  actionConfig: any;
  conditions: any;
  sortOrder: number;
  isActive: boolean;
}

const BUTTON_PLACEMENT_LABELS: Record<string, string> = {
  toolbar: "סרגל כלים",
  row: "שורה בטבלה",
  detail: "דף פרטים",
  bulk: "פעולה מרובה",
  header: "כותרת",
};

const BUTTON_STYLE_OPTIONS: Record<string, string> = {
  primary: "ראשי",
  secondary: "משני",
  outline: "מתאר",
  ghost: "שקוף",
  danger: "מחיקה",
  link: "קישור",
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  status_change: "שנה סטטוס",
  open_form: "פתח טופס",
  navigate: "נווט לעמוד",
  run_action: "הפעל פעולה",
  run_workflow: "הפעל תהליך",
  export: "ייצוא",
  print: "הדפסה",
  custom: "מותאם אישית",
};

export function EntityButtonsTab({ entityId }: { entityId: number }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingButton, setEditingButton] = useState<ButtonDef | null>(null);
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;

  const { data: buttons = [] } = useQuery<ButtonDef[]>({
    queryKey: ["entity-button-definitions", entityId],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/entities/${entityId}/button-definitions`);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: actions = [] } = useQuery<any[]>({
    queryKey: ["entity-actions", entityId],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/entities/${entityId}/actions`);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/entities/${entityId}/button-definitions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create button definition");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["entity-button-definitions", entityId] }); setShowForm(false); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const r = await authFetch(`${API}/platform/button-definitions/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update button definition");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["entity-button-definitions", entityId] }); setEditingButton(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/platform/button-definitions/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entity-button-definitions", entityId] }),
  });

  const groupedByPlacement = Object.entries(BUTTON_PLACEMENT_LABELS).map(([key, label]) => ({
    key,
    label,
    buttons: buttons.filter(b => b.placement === key),
  })).filter(g => g.buttons.length > 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">כפתורים ({buttons.length})</h2>
        <button onClick={() => { setEditingButton(null); setShowForm(true); }}
          className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" />
          כפתור חדש
        </button>
      </div>

      {buttons.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-8 text-center">
          <MousePointerClick className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">אין כפתורים — הגדר כפתורים מותאמים למיקומים שונים</p>
          <button onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
            <Plus className="w-4 h-4" />כפתור חדש
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByPlacement.map(group => (
            <div key={group.key} className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/40 border-b border-border">
                <MousePointerClick className="w-4 h-4 text-indigo-400" />
                <span className="font-semibold text-sm">{group.label}</span>
                <span className="px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 rounded text-xs">{group.buttons.length}</span>
              </div>
              <div className="divide-y divide-border/50">
                {group.buttons.map(btn => {
                  const colorDef = STATUS_COLORS.find(c => c.key === btn.color);
                  return (
                    <div key={btn.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors group ${!btn.isActive ? "opacity-50" : ""}`}>
                      <GripVertical className="w-4 h-4 text-muted-foreground/30" />
                      <div className="flex items-center gap-2">
                        <div className="px-3 py-1.5 rounded-lg text-sm font-medium border flex items-center gap-2"
                          style={{ borderColor: colorDef?.hex || "#6b7280", backgroundColor: `${colorDef?.hex || "#6b7280"}15`, color: colorDef?.hex || "#6b7280" }}>
                          <Play className="w-3 h-3" />
                          {btn.name}
                        </div>
                      </div>
                      <div className="flex-1 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{btn.slug}</span>
                        {btn.actionType && (
                          <span className="px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded-md text-xs">
                            {ACTION_TYPE_LABELS[btn.actionType] || btn.actionType}
                          </span>
                        )}
                        {!btn.isActive && <span className="px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded-md text-xs">לא פעיל</span>}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditingButton(btn)} className="p-1 hover:bg-muted rounded"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        {isSuperAdmin && (
                          <button onClick={async () => { const ok = await globalConfirm("מחיקת כפתור", { itemName: btn.name, entityType: "כפתור" }); if (ok) deleteMutation.mutate(btn.id); }} className="p-1 hover:bg-destructive/10 rounded"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {buttons.filter(b => !BUTTON_PLACEMENT_LABELS[b.placement]).length > 0 && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/40 border-b border-border">
                <span className="font-semibold text-sm">אחר</span>
              </div>
              <div className="divide-y divide-border/50">
                {buttons.filter(b => !BUTTON_PLACEMENT_LABELS[b.placement]).map(btn => (
                  <div key={btn.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors group">
                    <span className="text-sm font-medium">{btn.name}</span>
                    <span className="text-xs text-muted-foreground">{btn.placement}</span>
                    <div className="flex-1" />
                    <button onClick={() => setEditingButton(btn)} className="p-1 hover:bg-muted rounded opacity-0 group-hover:opacity-100"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    {isSuperAdmin && (
                      <button onClick={async () => { const ok = await globalConfirm("מחיקת כפתור", { itemName: btn.name, entityType: "כפתור" }); if (ok) deleteMutation.mutate(btn.id); }} className="p-1 hover:bg-destructive/10 rounded opacity-0 group-hover:opacity-100"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {(showForm || editingButton) && (
        <ButtonFormModal
          button={editingButton}
          actions={actions}
          onClose={() => { setShowForm(false); setEditingButton(null); }}
          onSubmit={(data) => {
            if (editingButton) updateMutation.mutate({ id: editingButton.id, ...data });
            else createMutation.mutate(data);
          }}
          isLoading={createMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  );
}

function ButtonFormModal({ button, actions, onClose, onSubmit, isLoading }: {
  button: ButtonDef | null; actions: any[]; onClose: () => void; onSubmit: (data: any) => void; isLoading: boolean;
}) {
  const [form, setForm] = useState({
    name: button?.name || "",
    slug: button?.slug || "",
    placement: button?.placement || "toolbar",
    style: button?.style || "primary",
    icon: button?.icon || "",
    color: button?.color || "blue",
    actionId: button?.actionId || null,
    actionType: button?.actionType || "custom",
    actionConfig: button?.actionConfig || {},
    conditions: button?.conditions || {},
    sortOrder: button?.sortOrder || 0,
    isActive: button?.isActive ?? true,
  });

  const autoSlug = (n: string) => n.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">{button ? "עריכת כפתור" : "כפתור חדש"}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">שם הכפתור *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, ...(!button ? { slug: autoSlug(e.target.value) } : {}) }))}
                placeholder="למשל: אשר הזמנה"
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Slug *</label>
              <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} dir="ltr"
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">מיקום (Placement)</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {Object.entries(BUTTON_PLACEMENT_LABELS).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setForm(f => ({ ...f, placement: key }))}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${form.placement === key ? "bg-primary text-primary-foreground" : "bg-background border border-border hover:border-primary/30"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">סגנון כפתור (Style)</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {Object.entries(BUTTON_STYLE_OPTIONS).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setForm(f => ({ ...f, style: key }))}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${form.style === key ? "bg-primary text-primary-foreground" : "bg-background border border-border hover:border-primary/30"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">סוג פעולה</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(ACTION_TYPE_LABELS).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setForm(f => ({ ...f, actionType: key }))}
                  className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors ${form.actionType === key ? "bg-primary text-primary-foreground" : "bg-background border border-border hover:border-primary/30"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {form.actionType === "run_action" && actions.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1.5">קישור לפעולה (Action ID)</label>
              <select value={form.actionId || ""} onChange={e => setForm(f => ({ ...f, actionId: e.target.value ? Number(e.target.value) : null }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">בחר פעולה...</option>
                {actions.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1.5">סגנון (Style)</label>
            <div className="flex gap-2 flex-wrap">
              {STATUS_COLORS.map(c => (
                <button key={c.key} type="button" onClick={() => setForm(f => ({ ...f, color: c.key }))}
                  className={`w-8 h-8 rounded-lg border-2 transition-all ${form.color === c.key ? "border-white scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c.hex }} title={c.label} />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">סדר מיון</label>
            <input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))}
              className="w-24 px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
            <span className="text-sm">פעיל</span>
          </label>
        </div>

        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={() => onSubmit(form)} disabled={!form.name || !form.slug || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : button ? "עדכן" : "צור כפתור"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="entity-buttons" />
        <RelatedRecords entityType="entity-buttons" />
      </div>
      </motion.div>
    </motion.div>
  );
}
