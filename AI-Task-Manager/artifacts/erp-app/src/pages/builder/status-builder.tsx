import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { authFetch } from "@/lib/utils";
import {
  Plus, Trash2, Edit2, Activity, ArrowRight, X, ChevronDown
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { STATUS_COLORS } from "./field-type-registry";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

interface Status {
  id: number;
  entityId: number;
  name: string;
  slug: string;
  color: string;
  icon?: string;
  sortOrder: number;
  isDefault: boolean;
  isFinal: boolean;
}

interface Transition {
  id: number;
  entityId: number;
  fromStatusId: number | null;
  toStatusId: number;
  label: string;
  icon?: string;
  conditions: any;
}

export function EnhancedStatusesTab({ entityId, statuses: initialStatuses }: { entityId: number; statuses: Status[] }) {
  const queryClient = useQueryClient();
  const [showAddStatus, setShowAddStatus] = useState(false);
  const [editingStatus, setEditingStatus] = useState<Status | null>(null);
  const [showAddTransition, setShowAddTransition] = useState(false);
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;

  const { data: statuses = initialStatuses } = useQuery<Status[]>({
    queryKey: ["entity-statuses", entityId],
    queryFn: () => authFetch(`${API}/platform/entities/${entityId}/statuses`).then(r => r.json()),
    initialData: initialStatuses,
  });

  const { data: transitions = [] } = useQuery<Transition[]>({
    queryKey: ["entity-transitions", entityId],
    queryFn: () => authFetch(`${API}/platform/entities/${entityId}/transitions`).then(r => r.json()),
  });

  const createStatusMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/entities/${entityId}/statuses`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create status");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entity-statuses", entityId] });
      queryClient.invalidateQueries({ queryKey: ["platform-entity", entityId] });
      setShowAddStatus(false);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const r = await authFetch(`${API}/platform/statuses/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update status");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entity-statuses", entityId] });
      queryClient.invalidateQueries({ queryKey: ["platform-entity", entityId] });
      setEditingStatus(null);
    },
  });

  const deleteStatusMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/platform/statuses/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entity-statuses", entityId] });
      queryClient.invalidateQueries({ queryKey: ["platform-entity", entityId] });
    },
  });

  const createTransitionMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/entities/${entityId}/transitions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create transition");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entity-transitions", entityId] });
      setShowAddTransition(false);
    },
  });

  const deleteTransitionMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/platform/transitions/${id}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entity-transitions", entityId] }),
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">סטטוסים ({statuses.length})</h2>
          <button onClick={() => { setEditingStatus(null); setShowAddStatus(true); }} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" />
            סטטוס חדש
          </button>
        </div>
        {statuses.length === 0 ? (
          <div className="bg-card border border-border/50 rounded-2xl p-8 text-center">
            <Activity className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">אין סטטוסים — הוסף סטטוסים כמו "חדש", "פעיל", "סגור"</p>
            <button onClick={() => setShowAddStatus(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium"><Plus className="w-4 h-4" />הוסף סטטוס</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {statuses.map(status => {
              const colorDef = STATUS_COLORS.find(c => c.key === status.color);
              return (
                <div key={status.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: colorDef?.hex || "#6b7280" }} />
                      <div>
                        <p className="font-medium text-sm">{status.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{status.slug}</span>
                          {status.isDefault && <span className="text-green-400">ברירת מחדל</span>}
                          {status.isFinal && <span className="text-red-400">סופי</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditingStatus(status)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      {isSuperAdmin && (
                        <button onClick={async () => { const ok = await globalConfirm("מחיקת סטטוס", { itemName: status.name, entityType: "סטטוס" }); if (ok) deleteStatusMutation.mutate(status.id); }} className="p-1.5 hover:bg-destructive/10 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {statuses.length >= 2 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">מעברים ({transitions.length})</h2>
            <button onClick={() => setShowAddTransition(true)} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
              <Plus className="w-4 h-4" />
              מעבר חדש
            </button>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex flex-wrap gap-3 items-center justify-center mb-6 p-4 bg-muted/20 rounded-xl min-h-[120px]">
              {statuses.map((status, i) => {
                const colorDef = STATUS_COLORS.find(c => c.key === status.color);
                const outgoing = transitions.filter(t => t.fromStatusId === status.id);
                return (
                  <div key={status.id} className="flex items-center gap-2">
                    <div className="relative flex flex-col items-center">
                      <div className="px-4 py-2.5 rounded-xl border-2 text-sm font-medium min-w-[80px] text-center"
                        style={{ borderColor: colorDef?.hex || "#6b7280", backgroundColor: `${colorDef?.hex || "#6b7280"}15`, color: colorDef?.hex || "#6b7280" }}>
                        {status.name}
                      </div>
                      {status.isDefault && <span className="text-[10px] text-green-400 mt-0.5">ברירת מחדל</span>}
                      {status.isFinal && <span className="text-[10px] text-red-400 mt-0.5">סופי</span>}
                    </div>
                    {i < statuses.length - 1 && outgoing.length > 0 && (
                      <ArrowRight className="w-5 h-5 text-muted-foreground" />
                    )}
                    {i < statuses.length - 1 && outgoing.length === 0 && (
                      <ArrowRight className="w-5 h-5 text-border" />
                    )}
                  </div>
                );
              })}
            </div>

            {transitions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">אין מעברים מוגדרים — הוסף מעברים כדי להגדיר את זרימת העבודה</p>
            ) : (
              <div className="space-y-2">
                {transitions.map(t => {
                  const from = statuses.find(s => s.id === t.fromStatusId);
                  const to = statuses.find(s => s.id === t.toStatusId);
                  const fromColor = STATUS_COLORS.find(c => c.key === from?.color);
                  const toColor = STATUS_COLORS.find(c => c.key === to?.color);
                  return (
                    <div key={t.id} className="flex items-center gap-3 px-3 py-2 bg-muted/20 rounded-lg">
                      <span className="px-2 py-0.5 rounded-md text-xs font-medium" style={{ backgroundColor: `${fromColor?.hex || "#6b7280"}20`, color: fromColor?.hex || "#6b7280" }}>
                        {from?.name || "כל סטטוס"}
                      </span>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      <span className="px-2 py-0.5 rounded-md text-xs font-medium" style={{ backgroundColor: `${toColor?.hex || "#6b7280"}20`, color: toColor?.hex || "#6b7280" }}>
                        {to?.name || "?"}
                      </span>
                      <span className="text-xs text-muted-foreground flex-1">{t.label}</span>
                      {isSuperAdmin && (
                        <button onClick={async () => { const ok = await globalConfirm("מחיקת מעבר", { itemName: t.label || `${from?.name} → ${to?.name}`, entityType: "מעבר סטטוס" }); if (ok) deleteTransitionMutation.mutate(t.id); }} className="p-1 hover:bg-destructive/10 rounded"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {(showAddStatus || editingStatus) && (
        <StatusFormModal
          status={editingStatus}
          onClose={() => { setShowAddStatus(false); setEditingStatus(null); }}
          onSubmit={(data) => {
            if (editingStatus) {
              updateStatusMutation.mutate({ id: editingStatus.id, ...data });
            } else {
              createStatusMutation.mutate(data);
            }
          }}
          isLoading={createStatusMutation.isPending || updateStatusMutation.isPending}
        />
      )}

      {showAddTransition && (
        <TransitionFormModal
          statuses={statuses}
          onClose={() => setShowAddTransition(false)}
          onSubmit={(data) => createTransitionMutation.mutate(data)}
          isLoading={createTransitionMutation.isPending}
        />
      )}
    </div>
  );
}

function StatusFormModal({ status, onClose, onSubmit, isLoading }: {
  status: Status | null; onClose: () => void; onSubmit: (data: any) => void; isLoading: boolean;
}) {
  const [form, setForm] = useState({
    name: status?.name || "",
    slug: status?.slug || "",
    color: status?.color || "gray",
    isDefault: status?.isDefault || false,
    isFinal: status?.isFinal || false,
  });
  const autoSlug = (name: string) => name.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">{status ? "עריכת סטטוס" : "סטטוס חדש"}</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">שם הסטטוס *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, ...(!status ? { slug: autoSlug(e.target.value) } : {}) }))}
              placeholder="למשל: פעיל" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Slug</label>
            <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} dir="ltr"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
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
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isDefault} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))} className="w-4 h-4 rounded" />
              <span className="text-sm">ברירת מחדל</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isFinal} onChange={e => setForm(f => ({ ...f, isFinal: e.target.checked }))} className="w-4 h-4 rounded" />
              <span className="text-sm">סטטוס סופי</span>
            </label>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={() => onSubmit(form)} disabled={!form.name || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : status ? "עדכן" : "הוסף סטטוס"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function TransitionFormModal({ statuses, onClose, onSubmit, isLoading }: {
  statuses: Status[]; onClose: () => void; onSubmit: (data: any) => void; isLoading: boolean;
}) {
  const [form, setForm] = useState({
    fromStatusId: null as number | null,
    toStatusId: statuses[0]?.id || 0,
    label: "",
    conditions: {} as any,
  });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">מעבר חדש</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">מסטטוס</label>
            <select value={form.fromStatusId ?? ""} onChange={e => setForm(f => ({ ...f, fromStatusId: e.target.value ? Number(e.target.value) : null }))}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              <option value="">כל סטטוס (התחלתי)</option>
              {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">לסטטוס *</label>
            <select value={form.toStatusId} onChange={e => setForm(f => ({ ...f, toStatusId: Number(e.target.value) }))}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">תווית מעבר *</label>
            <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              placeholder='למשל: "אשר הזמנה"' className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={() => onSubmit(form)} disabled={!form.label || !form.toStatusId || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : "הוסף מעבר"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="statuses" />
        <RelatedRecords entityType="statuses" />
      </div>
      </motion.div>
    </motion.div>
  );
}
