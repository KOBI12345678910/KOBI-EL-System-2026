import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Plus, Trash2, Edit2, Table2, X, Calculator, ChevronDown } from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import { usePlatformModules } from "@/hooks/usePlatformModules";

const API = "/api";

const AGG_FUNCTIONS = [
  { key: "SUM", label: "סכום (SUM)" },
  { key: "COUNT", label: "ספירה (COUNT)" },
  { key: "AVG", label: "ממוצע (AVG)" },
  { key: "MIN", label: "מינימום (MIN)" },
  { key: "MAX", label: "מקסימום (MAX)" },
];

export function SubTablesTab({ entityId }: { entityId: number }) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [editingRelation, setEditingRelation] = useState<any>(null);

  const { data: relations = [] } = useQuery({
    queryKey: ["entity-relations", entityId],
    queryFn: () => authFetch(`${API}/platform/entities/${entityId}/relations`).then(r => r.json()),
  });

  const { modules: _subModules } = usePlatformModules();

  const { data: allEntities = [] } = useQuery({
    queryKey: ["all-entities-for-relations", _subModules.map((m: any) => m.id)],
    queryFn: async () => {
      const allEnts: any[] = [];
      for (const mod of _subModules) {
        const ents = await authFetch(`${API}/platform/modules/${mod.id}/entities`).then(r => r.json());
        allEnts.push(...ents.map((e: any) => ({ ...e, moduleName: mod.name })));
      }
      return allEnts;
    },
    enabled: _subModules.length > 0,
  });

  const inlineChildRelations = useMemo(() =>
    relations.filter((r: any) => r.relationType === "inline_child" && r.sourceEntityId === entityId),
    [relations, entityId]
  );

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/entities/${entityId}/relations`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error(err.message || "Failed"); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["entity-relations", entityId] }); setShowAdd(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => authFetch(`${API}/platform/relations/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["entity-relations", entityId] }); setEditingRelation(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (relId: number) => {
      const r = await authFetch(`${API}/platform/relations/${relId}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entity-relations", entityId] }),
  });

  const getEntityName = (id: number) => allEntities.find((e: any) => e.id === id)?.name || `ישות #${id}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">תת-טבלאות ({inlineChildRelations.length})</h2>
          <p className="text-xs text-muted-foreground mt-0.5">הגדר ישויות ילד שמוצגות כטבלה בתוך טופס ההורה</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" />
          תת-טבלה חדשה
        </button>
      </div>

      {inlineChildRelations.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-8 text-center">
          <Table2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground mb-2">אין תת-טבלאות</p>
          <p className="text-xs text-muted-foreground mb-4">תת-טבלאות מאפשרות להציג רשומות ילד כגריד בתוך טופס ההורה, עם עריכה ישירה וחישובי סיכום</p>
          <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
            <Plus className="w-4 h-4" />
            הוסף תת-טבלה
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {inlineChildRelations.map((rel: any) => {
            const settings = rel.settings || {};
            const aggCount = (settings.aggregations || []).length;
            const colCount = (settings.displayColumns || []).length;
            return (
              <div key={rel.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <Table2 className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{rel.label}</p>
                      <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground mt-0.5">
                        <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded-md">תת-טבלה</span>
                        <span>ישות ילד: {getEntityName(rel.targetEntityId)}</span>
                        {colCount > 0 && <span>· {colCount} עמודות</span>}
                        {aggCount > 0 && <span>· {aggCount} חישובים</span>}
                        {rel.cascadeDelete && <span className="text-red-400">· מחיקה מדורגת</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditingRelation(rel)} className="p-1.5 hover:bg-muted rounded-lg">
                      <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק את תת-הטבלה?"); if (ok) deleteMutation.mutate(rel.id); }}
                      className="p-1.5 hover:bg-destructive/10 rounded-lg">
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </button>}
                  </div>
                </div>

                {aggCount > 0 && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Calculator className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">חישובי סיכום:</span>
                      {settings.aggregations.map((agg: any, i: number) => (
                        <span key={i} className="text-xs px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded-md">
                          {agg.function}({agg.sourceField}) → {agg.targetField}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {(showAdd || editingRelation) && (
        <SubTableFormModal
          entityId={entityId}
          allEntities={allEntities}
          relation={editingRelation}
          onClose={() => { setShowAdd(false); setEditingRelation(null); }}
          onSubmit={(data) => {
            if (editingRelation) {
              updateMutation.mutate({ id: editingRelation.id, ...data });
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

function SubTableFormModal({ entityId, allEntities, relation, onClose, onSubmit, isLoading }: {
  entityId: number; allEntities: any[]; relation?: any;
  onClose: () => void; onSubmit: (data: any) => void; isLoading: boolean;
}) {
  const existingSettings = relation?.settings || {};
  const [form, setForm] = useState({
    targetEntityId: relation?.targetEntityId || 0,
    label: relation?.label || "",
    reverseLabel: relation?.reverseLabel || "",
    cascadeDelete: relation?.cascadeDelete ?? true,
    targetFieldSlug: relation?.targetFieldSlug || "_parent_id",
    displayColumns: existingSettings.displayColumns || [],
    aggregations: existingSettings.aggregations || [],
  });

  const [newAgg, setNewAgg] = useState({ function: "SUM", sourceField: "", targetField: "" });

  const { data: parentEntity } = useQuery({
    queryKey: ["platform-entity", entityId],
    queryFn: () => authFetch(`${API}/platform/entities/${entityId}`).then(r => r.json()),
  });

  const { data: childEntity } = useQuery({
    queryKey: ["platform-entity", form.targetEntityId],
    queryFn: () => authFetch(`${API}/platform/entities/${form.targetEntityId}`).then(r => r.json()),
    enabled: form.targetEntityId > 0,
  });

  const childFields = childEntity?.fields || [];
  const parentFields = parentEntity?.fields || [];
  const numericChildFields = childFields.filter((f: any) =>
    ["number", "decimal", "currency", "percent"].includes(f.fieldType)
  );

  const addAggregation = () => {
    if (!newAgg.sourceField || !newAgg.targetField) return;
    setForm(f => ({ ...f, aggregations: [...f.aggregations, { ...newAgg }] }));
    setNewAgg({ function: "SUM", sourceField: "", targetField: "" });
  };

  const removeAggregation = (idx: number) => {
    setForm(f => ({ ...f, aggregations: f.aggregations.filter((_: any, i: number) => i !== idx) }));
  };

  const toggleColumn = (slug: string) => {
    setForm(f => ({
      ...f,
      displayColumns: f.displayColumns.includes(slug)
        ? f.displayColumns.filter((s: string) => s !== slug)
        : [...f.displayColumns, slug],
    }));
  };

  const handleSubmit = () => {
    const data = {
      sourceEntityId: entityId,
      targetEntityId: form.targetEntityId,
      relationType: "inline_child" as const,
      label: form.label,
      reverseLabel: form.reverseLabel,
      cascadeDelete: form.cascadeDelete,
      targetFieldSlug: form.targetFieldSlug,
      settings: {
        displayColumns: form.displayColumns,
        aggregations: form.aggregations,
      },
    };
    onSubmit(data);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">{relation ? "עריכת תת-טבלה" : "תת-טבלה חדשה"}</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">שם התת-טבלה *</label>
            <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              placeholder="למשל: שורות הזמנה"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">ישות ילד *</label>
            <select value={form.targetEntityId} onChange={e => setForm(f => ({ ...f, targetEntityId: Number(e.target.value), displayColumns: [] }))}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              disabled={!!relation}>
              <option value={0}>בחר ישות ילד...</option>
              {allEntities.filter(e => e.id !== entityId).map(ent => (
                <option key={ent.id} value={ent.id}>{ent.name} ({ent.moduleName})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">שם הפוך</label>
            <input value={form.reverseLabel} onChange={e => setForm(f => ({ ...f, reverseLabel: e.target.value }))}
              placeholder="למשל: הזמנה של שורה"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">שדה קישור בילד</label>
            <input value={form.targetFieldSlug} onChange={e => setForm(f => ({ ...f, targetFieldSlug: e.target.value }))} dir="ltr"
              placeholder="_parent_id"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            <p className="text-xs text-muted-foreground mt-1">שדה בישות הילד שמקשר לרשומת ההורה</p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.cascadeDelete} onChange={e => setForm(f => ({ ...f, cascadeDelete: e.target.checked }))}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
            <span className="text-sm">מחיקה מדורגת (מחיקת שורות ילד עם רשומת ההורה)</span>
          </label>

          {childFields.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1.5">עמודות לתצוגה</label>
              <div className="flex flex-wrap gap-2">
                {childFields.filter((f: any) => f.slug !== "_parent_id" && f.slug !== form.targetFieldSlug).map((f: any) => (
                  <button key={f.slug} type="button" onClick={() => toggleColumn(f.slug)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${form.displayColumns.includes(f.slug) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                    {f.name}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">בחר אילו עמודות להציג בגריד. ריק = כל העמודות ברשימה</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">
              <span className="flex items-center gap-1.5">
                <Calculator className="w-4 h-4" />
                חישובי סיכום
              </span>
            </label>

            {form.aggregations.length > 0 && (
              <div className="space-y-2 mb-3">
                {form.aggregations.map((agg: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 bg-muted/30 border border-border/50 rounded-lg">
                    <span className="text-xs font-medium px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded">{agg.function}</span>
                    <span className="text-xs text-muted-foreground">({agg.sourceField})</span>
                    <span className="text-xs text-muted-foreground">→</span>
                    <span className="text-xs font-medium">{agg.targetField}</span>
                    <button type="button" onClick={() => removeAggregation(i)} className="mr-auto p-0.5 hover:bg-destructive/10 rounded">
                      <X className="w-3 h-3 text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="p-3 bg-background border border-dashed border-border rounded-xl space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select value={newAgg.function} onChange={e => setNewAgg(a => ({ ...a, function: e.target.value }))}
                  className="px-2 py-1.5 bg-background border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary/50">
                  {AGG_FUNCTIONS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
                <select value={newAgg.sourceField} onChange={e => setNewAgg(a => ({ ...a, sourceField: e.target.value }))}
                  className="px-2 py-1.5 bg-background border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary/50">
                  <option value="">שדה מקור (ילד)...</option>
                  {numericChildFields.map((f: any) => <option key={f.slug} value={f.slug}>{f.name}</option>)}
                </select>
                <select value={newAgg.targetField} onChange={e => setNewAgg(a => ({ ...a, targetField: e.target.value }))}
                  className="px-2 py-1.5 bg-background border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary/50">
                  <option value="">שדה יעד (הורה)...</option>
                  {parentFields.map((f: any) => <option key={f.slug} value={f.slug}>{f.name}</option>)}
                </select>
              </div>
              <button type="button" onClick={addAggregation} disabled={!newAgg.sourceField || !newAgg.targetField}
                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 disabled:opacity-50">
                <Plus className="w-3 h-3" />
                הוסף חישוב
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">הגדר חישובי סיכום שמזינים שדות בישות ההורה (למשל SUM של מחיר שורה → סה"כ הזמנה)</p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={handleSubmit} disabled={!form.label || !form.targetEntityId || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : relation ? "עדכן תת-טבלה" : "הוסף תת-טבלה"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="sub-tables" />
        <RelatedRecords entityType="sub-tables" />
      </div>
      </motion.div>
    </motion.div>
  );
}
