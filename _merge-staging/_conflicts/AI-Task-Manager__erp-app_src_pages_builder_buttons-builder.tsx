import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { usePlatformModules } from "@/hooks/usePlatformModules";
import {
  Plus, Trash2, Edit2, MousePointerClick, ChevronLeft, X,
  Play, Zap, ArrowRight, Settings, Eye
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
  buttonType: string;
  icon: string | null;
  color: string | null;
  actionType: string | null;
  actionConfig: any;
  conditions: any;
  sortOrder: number;
  isActive: boolean;
}

const BUTTON_TYPE_LABELS: Record<string, string> = {
  toolbar: "סרגל כלים",
  row: "שורה",
  detail: "דף פרטים",
  bulk: "פעולה מרובה",
  header: "כותרת",
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

export default function ButtonsBuilderPage() {
  const queryClient = useQueryClient();
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingButton, setEditingButton] = useState<ButtonDef | null>(null);
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;

  const { modules } = usePlatformModules();

  const allEntities = modules.flatMap((m: any) => (m.entities || []).map((e: any) => ({ ...e, moduleName: m.name })));

  const { data: buttons = [] } = useQuery<ButtonDef[]>({
    queryKey: ["all-buttons", selectedEntityId],
    queryFn: async () => {
      const endpoint = selectedEntityId
        ? `${API}/platform/entities/${selectedEntityId}/buttons`
        : `${API}/platform/buttons`;
      const r = await authFetch(endpoint);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/entities/${data.entityId}/buttons`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create button");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["all-buttons"] }); setShowCreate(false); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const r = await authFetch(`${API}/platform/buttons/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update button");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["all-buttons"] }); setEditingButton(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/platform/buttons/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all-buttons"] }),
  });

  const getEntityName = (entityId: number) => allEntities.find((e: any) => e.id === entityId)?.nameHe || allEntities.find((e: any) => e.id === entityId)?.name || `#${entityId}`;

  const groupedByType = Object.entries(BUTTON_TYPE_LABELS).map(([type, label]) => ({
    type,
    label,
    buttons: buttons.filter(b => b.buttonType === type),
  })).filter(g => g.buttons.length > 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/builder" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />בונה הפלטפורמה
        </Link>
        <span>/</span><span className="text-foreground">בונה כפתורים</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-3">
            <MousePointerClick className="w-8 h-8 text-indigo-400" />בונה כפתורים
          </h1>
          <p className="text-muted-foreground mt-1">כפתורים מותאמים — מיקום, תנאי הצגה, קישור לפעולות</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-5 h-5" />כפתור חדש
        </button>
      </div>

      <div className="flex items-center gap-3">
        <select value={selectedEntityId ?? ""} onChange={e => setSelectedEntityId(e.target.value ? Number(e.target.value) : null)}
          className="px-3 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
          <option value="">כל הישויות</option>
          {allEntities.map((e: any) => <option key={e.id} value={e.id}>{e.nameHe || e.name}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{buttons.length} כפתורים</span>
      </div>

      {buttons.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
          <MousePointerClick className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">אין כפתורים</h3>
          <p className="text-muted-foreground mb-4">הגדר כפתורים מותאמים למיקומים שונים — סרגל כלים, שורות, דפי פרטים</p>
          <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
            <Plus className="w-4 h-4" />כפתור חדש
          </button>
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {groupedByType.map(group => (
            <div key={group.type}>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">{group.label} ({group.buttons.length})</h3>
              <div className="flex flex-wrap gap-3 p-4 bg-card border border-border rounded-xl min-h-[60px]">
                {group.buttons.map(btn => {
                  const colorDef = STATUS_COLORS.find(c => c.key === btn.color);
                  return (
                    <div key={btn.id} className="flex items-center gap-2 group">
                      <button className={`px-3 py-2 rounded-xl text-sm font-medium border flex items-center gap-2 ${!btn.isActive ? "opacity-40" : ""}`}
                        style={{ borderColor: colorDef?.hex || "#6b7280", backgroundColor: `${colorDef?.hex || "#6b7280"}15`, color: colorDef?.hex || "#6b7280" }}>
                        <Play className="w-3.5 h-3.5" />
                        {btn.name}
                      </button>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-xs text-muted-foreground mr-1">{getEntityName(btn.entityId)}</span>
                        <button onClick={() => setEditingButton(btn)} className="p-1 hover:bg-muted rounded"><Edit2 className="w-3 h-3 text-muted-foreground" /></button>
                        {isSuperAdmin && (
                          <button onClick={async () => { const ok = await globalConfirm("מחיקת כפתור", { itemName: btn.name, entityType: "כפתור" }); if (ok) deleteMutation.mutate(btn.id); }} className="p-1 hover:bg-destructive/10 rounded"><Trash2 className="w-3 h-3 text-destructive" /></button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">כל הכפתורים</h3>
            <div className="space-y-2">
              {buttons.map(btn => (
                <div key={btn.id} className={`flex items-center gap-3 px-4 py-3 bg-card border rounded-xl transition-colors ${btn.isActive ? "border-border" : "border-border/50 opacity-60"}`}>
                  <MousePointerClick className="w-4 h-4 text-indigo-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{btn.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span className="px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 rounded-md">{BUTTON_TYPE_LABELS[btn.buttonType] || btn.buttonType}</span>
                      {btn.actionType && <span className="px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded-md">{ACTION_TYPE_LABELS[btn.actionType] || btn.actionType}</span>}
                      <span>{getEntityName(btn.entityId)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditingButton(btn)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    {isSuperAdmin && (
                      <button onClick={async () => { const ok = await globalConfirm("מחיקת כפתור", { itemName: btn.name, entityType: "כפתור" }); if (ok) deleteMutation.mutate(btn.id); }} className="p-1.5 hover:bg-destructive/10 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {(showCreate || editingButton) && (
          <ButtonFormModal
            button={editingButton}
            entities={allEntities}
            onClose={() => { setShowCreate(false); setEditingButton(null); }}
            onSubmit={(data) => {
              if (editingButton) updateMutation.mutate({ id: editingButton.id, ...data });
              else createMutation.mutate(data);
            }}
            isLoading={createMutation.isPending || updateMutation.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ButtonFormModal({ button, entities, onClose, onSubmit, isLoading }: {
  button: ButtonDef | null; entities: any[]; onClose: () => void; onSubmit: (data: any) => void; isLoading: boolean;
}) {
  const [form, setForm] = useState({
    entityId: button?.entityId || "",
    name: button?.name || "",
    slug: button?.slug || "",
    buttonType: button?.buttonType || "toolbar",
    icon: button?.icon || "",
    color: button?.color || "blue",
    actionType: button?.actionType || "custom",
    actionConfig: button?.actionConfig || {},
    isActive: button?.isActive ?? true,
  });
  const autoSlug = (n: string) => n.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">{button ? "עריכת כפתור" : "כפתור חדש"}</h2>
        <div className="space-y-4">
          {!button && (
            <div>
              <label className="block text-sm font-medium mb-1.5">ישות *</label>
              <select value={form.entityId} onChange={e => setForm(f => ({ ...f, entityId: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">בחר ישות...</option>
                {entities.map((e: any) => <option key={e.id} value={e.id}>{e.nameHe || e.name}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">שם הכפתור *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, ...(!button ? { slug: autoSlug(e.target.value) } : {}) }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Slug</label>
              <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} dir="ltr"
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">מיקום כפתור</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {Object.entries(BUTTON_TYPE_LABELS).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setForm(f => ({ ...f, buttonType: key }))}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${form.buttonType === key ? "bg-primary text-primary-foreground" : "bg-background border border-border hover:border-primary/30"}`}>
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
        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={() => onSubmit(form)} disabled={!form.name || !form.slug || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : button ? "עדכן" : "צור כפתור"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="buttons" />
        <RelatedRecords entityType="buttons" />
      </div>
      </motion.div>
    </motion.div>
  );
}
