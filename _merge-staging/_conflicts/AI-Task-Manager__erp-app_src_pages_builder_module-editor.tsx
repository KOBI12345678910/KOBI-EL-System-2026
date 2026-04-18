import { useState, useEffect } from "react";
import { useBreadcrumbLabel } from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import {
  ChevronLeft, Plus, Database, FileText, Settings, Trash2, Edit2,
  Layers, Activity, Archive, Eye, CheckCircle, Box, Zap,
  ToggleRight, Copy, ChevronUp, ChevronDown, GitBranch, Upload, Clock
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { ENTITY_TYPES } from "./field-type-registry";
import { LoadingSkeleton } from "@/components/ui/unified-states";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

export default function ModuleEditor() {
  const { id } = useParams<{ id: string }>();
  const moduleId = Number(id);
  const queryClient = useQueryClient();
  const [showCreateEntity, setShowCreateEntity] = useState(false);
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [editingEntity, setEditingEntity] = useState<any>(null);
  const { setLabel } = useBreadcrumbLabel();

  const { data: mod, isLoading } = useQuery({
    queryKey: ["platform-module", moduleId],
    queryFn: () => authFetch(`${API}/platform/modules/${moduleId}`).then(r => r.json()),
  });

  useEffect(() => {
    if (mod?.name || mod?.label) {
      setLabel(mod.label || mod.name);
    }
  }, [mod, setLabel]);

  const createEntityMutation = useMutation({
    mutationFn: (data: any) => authFetch(`${API}/platform/modules/${moduleId}/entities`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }).then(r => { if (!r.ok) return r.json().then(e => Promise.reject(e)); return r.json(); }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["platform-module", moduleId] }); setShowCreateEntity(false); },
  });

  const updateEntityMutation = useMutation({
    mutationFn: ({ id: entityId, ...data }: any) => authFetch(`${API}/platform/entities/${entityId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }).then(r => { if (!r.ok) return r.json().then(e => Promise.reject(e)); return r.json(); }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["platform-module", moduleId] }); setEditingEntity(null); },
  });

  const deleteEntityMutation = useMutation({
    mutationFn: (entityId: number) => authFetch(`${API}/platform/entities/${entityId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platform-module", moduleId] }),
  });

  const cloneEntityMutation = useMutation({
    mutationFn: (entityId: number) => authFetch(`${API}/platform/entities/${entityId}/clone`, { method: "POST" }).then(r => {
      if (!r.ok) return r.json().then(e => Promise.reject(e));
      return r.json();
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platform-module", moduleId] }),
  });

  const reorderEntitiesMutation = useMutation({
    mutationFn: (items: { id: number; sortOrder: number }[]) => authFetch(`${API}/platform/entities/reorder`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items, moduleId }),
    }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platform-module", moduleId] }),
  });

  const moveEntity = (idx: number, dir: -1 | 1) => {
    const entities = [...(mod?.entities || [])];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= entities.length) return;
    const items = entities.map((e: any, i: number) => {
      if (i === idx) return { id: e.id, sortOrder: swapIdx };
      if (i === swapIdx) return { id: e.id, sortOrder: idx };
      return { id: e.id, sortOrder: i };
    });
    reorderEntitiesMutation.mutate(items);
  };

  const [, navigate] = useLocation();
  const [showPublishModal, setShowPublishModal] = useState(false);

  const { data: moduleVersions = [] } = useQuery({
    queryKey: ["module-versions", moduleId],
    queryFn: () => authFetch(`${API}/platform/modules/${moduleId}/versions`).then(r => r.json()),
  });

  const publishVersionMutation = useMutation({
    mutationFn: async (data: { notes?: string }) => {
      const r = await authFetch(`${API}/platform/modules/${moduleId}/publish-version`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, publishedBy: "user" }),
      });
      if (!r.ok) throw new Error("Failed to publish version");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-module", moduleId] });
      queryClient.invalidateQueries({ queryKey: ["module-versions", moduleId] });
      setShowPublishModal(false);
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const r = await authFetch(`${API}/platform/modules/${moduleId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "published" }),
      });
      if (!r.ok) throw new Error("Failed to publish module");
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platform-module", moduleId] }),
  });

  if (isLoading) return <LoadingSkeleton variant="page" />;
  if (!mod) return <div className="text-center py-20 text-muted-foreground">מודול לא נמצא</div>;

  const statusLabel: Record<string, string> = { draft: "טיוטה", published: "פורסם", archived: "בארכיון" };
  const statusColor: Record<string, string> = { draft: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", published: "bg-green-500/10 text-green-400 border-green-500/20", archived: "bg-muted/10 text-muted-foreground border-gray-500/20" };

  const FEATURE_FLAGS = [
    { key: "hasStatus", label: "סטטוסים" },
    { key: "hasCategories", label: "קטגוריות" },
    { key: "hasAttachments", label: "צרופות" },
    { key: "hasNotes", label: "הערות" },
    { key: "hasOwner", label: "בעלות" },
    { key: "hasNumbering", label: "מספור" },
    { key: "hasCreatedUpdated", label: "תאריכי יצירה/עדכון" },
    { key: "hasSoftDelete", label: "מחיקה רכה" },
    { key: "hasAudit", label: "יומן שינויים" },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/builder" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
          בונה הפלטפורמה
        </Link>
        <span>/</span>
        <span className="text-foreground">{mod.nameHe || mod.name}</span>
      </div>

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Box className="w-7 h-7 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-3xl font-bold">{mod.nameHe || mod.name}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusColor[mod.status]}`}>{statusLabel[mod.status]}</span>
            </div>
            <p className="text-muted-foreground mt-1">
              {mod.nameEn && <span className="ml-2">{mod.nameEn}</span>}
              {mod.description || `slug: ${mod.slug}`}
              {mod.moduleKey && <span className="mr-2 text-xs"> · key: {mod.moduleKey}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(`/builder/module/${moduleId}/versions`)} className="flex items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground border border-border rounded-xl text-sm font-medium hover:bg-muted transition-colors">
            <Clock className="w-4 h-4" />
            היסטוריה ({Array.isArray(moduleVersions) ? moduleVersions.length : 0})
          </button>
          <button onClick={() => setShowPublishModal(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-foreground rounded-xl text-sm font-medium hover:bg-green-700 transition-colors">
            <Upload className="w-4 h-4" />
            פרסם גרסה
          </button>
          <button onClick={() => setShowCreateEntity(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
            <Plus className="w-5 h-5" />
            ישות חדשה
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <InfoCard icon={Layers} label="ישויות" value={mod.entities?.length || 0} />
        <InfoCard icon={Database} label="קטגוריה" value={mod.category} />
        <InfoCard icon={Activity} label="גרסה" value={`v${mod.version}`} />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">ישויות במודול</h2>
        {(!mod.entities || mod.entities.length === 0) ? (
          <div className="bg-card border border-border/50 rounded-2xl p-8 text-center">
            <Database className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="font-medium mb-1">אין ישויות עדיין</h3>
            <p className="text-sm text-muted-foreground mb-4">הוסף ישות ראשונה — לקוח, הזמנה, פריט...</p>
            <button onClick={() => setShowCreateEntity(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
              <Plus className="w-4 h-4" />
              ישות חדשה
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mod.entities.map((entity: any, i: number) => {
              const entityTypeDef = ENTITY_TYPES.find(t => t.key === entity.entityType);
              const activeFlags = FEATURE_FLAGS.filter(f => entity[f.key]);
              return (
                <motion.div key={entity.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="bg-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-all">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-0.5 mr-1">
                        <button onClick={() => moveEntity(i, -1)} disabled={i === 0} className="p-0.5 hover:bg-muted rounded disabled:opacity-20" title="הזז למעלה"><ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        <button onClick={() => moveEntity(i, 1)} disabled={i === mod.entities.length - 1} className="p-0.5 hover:bg-muted rounded disabled:opacity-20" title="הזז למטה"><ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      </div>
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{entity.nameHe || entity.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {entity.namePlural} · {entity.entityKey || entity.slug}
                          {entity.tableName && <span> · {entity.tableName}</span>}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-0.5 bg-muted rounded-md">{entityTypeDef?.label || entity.entityType}</span>
                  </div>
                  {entity.description && <p className="text-sm text-muted-foreground mb-2">{entity.description}</p>}
                  {activeFlags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {activeFlags.map(f => (
                        <span key={f.key} className="px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded-md text-xs">{f.label}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-3 border-t border-border/50">
                    <Link href={`/builder/entity/${entity.id}`} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary/10 text-primary rounded-lg text-sm font-medium hover:bg-primary/20 transition-colors">
                      <Settings className="w-4 h-4" />
                      הגדרות
                    </Link>
                    <Link href={`/builder/data/${entity.id}`} className="flex items-center gap-1.5 px-3 py-2 bg-green-500/10 text-green-400 rounded-lg text-sm font-medium hover:bg-green-500/20 transition-colors">
                      <Eye className="w-4 h-4" />
                      נתונים
                    </Link>
                    <button onClick={() => setEditingEntity(entity)} className="p-2 hover:bg-muted rounded-lg transition-colors" title="ערוך"><Edit2 className="w-4 h-4 text-muted-foreground" /></button>
                    <button onClick={async () => { const ok = await globalConfirm("לשכפל את הישות?", { title: "אישור שכפול", confirmText: "שכפל", variant: "warning", requireTypedConfirm: false }); if (ok) cloneEntityMutation.mutate(entity.id); }} className="p-2 hover:bg-blue-500/10 rounded-lg transition-colors" title="שכפל ישות" disabled={cloneEntityMutation.isPending}><Copy className="w-4 h-4 text-blue-400" /></button>
                    {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק את הישות?"); if (ok) deleteEntityMutation.mutate(entity.id); }}
                      className="p-2 hover:bg-destructive/10 rounded-lg transition-colors" title="מחק">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </button>}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showPublishModal && (
          <PublishVersionModal
            moduleName={mod.nameHe || mod.name}
            currentVersion={mod.version}
            onClose={() => setShowPublishModal(false)}
            onPublish={(notes) => publishVersionMutation.mutate({ notes })}
            isLoading={publishVersionMutation.isPending}
          />
        )}
        {showCreateEntity && (
          <EntityFormModal
            onClose={() => setShowCreateEntity(false)}
            onSubmit={(data) => createEntityMutation.mutate(data)}
            isLoading={createEntityMutation.isPending}
            error={(createEntityMutation.error as any)?.message || null}
          />
        )}
        {editingEntity && (
          <EntityFormModal
            entity={editingEntity}
            onClose={() => setEditingEntity(null)}
            onSubmit={(data) => updateEntityMutation.mutate({ id: editingEntity.id, ...data })}
            isLoading={updateEntityMutation.isPending}
            error={(updateEntityMutation.error as any)?.message || null}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
      <Icon className="w-5 h-5 text-muted-foreground" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-semibold">{value}</p>
      </div>
    </div>
  );
}

function EntityFormModal({ entity, onClose, onSubmit, isLoading, error }: { entity?: any; onClose: () => void; onSubmit: (data: any) => void; isLoading: boolean; error: string | null }) {
  const { data: entityDetail } = useQuery({
    queryKey: ["platform-entity-for-form", entity?.id],
    queryFn: () => authFetch(`${API}/platform/entities/${entity.id}`).then(r => r.json()),
    enabled: !!entity?.id,
  });
  const entityWithFields = entityDetail || entity;
  const [form, setForm] = useState({
    name: entity?.name || "",
    nameHe: entity?.nameHe || "",
    nameEn: entity?.nameEn || "",
    namePlural: entity?.namePlural || "",
    slug: entity?.slug || "",
    entityKey: entity?.entityKey || "",
    tableName: entity?.tableName || "",
    description: entity?.description || "",
    icon: entity?.icon || "FileText",
    entityType: entity?.entityType || "master",
    primaryDisplayField: entity?.primaryDisplayField || "",
    namingPattern: entity?.settings?.namingPattern || "",
    hasStatus: entity?.hasStatus ?? false,
    hasCategories: entity?.hasCategories ?? false,
    hasAttachments: entity?.hasAttachments ?? false,
    hasNotes: entity?.hasNotes ?? false,
    hasOwner: entity?.hasOwner ?? false,
    hasNumbering: entity?.hasNumbering ?? false,
    hasCreatedUpdated: entity?.hasCreatedUpdated ?? true,
    hasSoftDelete: entity?.hasSoftDelete ?? false,
    hasAudit: entity?.hasAudit ?? false,
  });
  const autoSlug = (name: string) => name.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");

  const FEATURE_FLAGS = [
    { key: "hasStatus", label: "סטטוסים", desc: "הוספת מערכת סטטוסים" },
    { key: "hasCategories", label: "קטגוריות", desc: "סיווג רשומות" },
    { key: "hasAttachments", label: "צרופות", desc: "קבצים מצורפים" },
    { key: "hasNotes", label: "הערות", desc: "הערות טקסט חופשי" },
    { key: "hasOwner", label: "בעלות", desc: "שיוך משתמש אחראי" },
    { key: "hasNumbering", label: "מספור אוטומטי", desc: "מספור רשומות" },
    { key: "hasCreatedUpdated", label: "תאריכי יצירה/עדכון", desc: "מעקב אוטומטי" },
    { key: "hasSoftDelete", label: "מחיקה רכה", desc: "סימון במקום מחיקה" },
    { key: "hasAudit", label: "יומן שינויים", desc: "מעקב אחר שינויים" },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">{entity ? "עריכת ישות" : "ישות חדשה"}</h2>

        {error && <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-xl text-sm">{error}</div>}

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">שם הישות (יחיד) *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, nameHe: e.target.value, ...(!entity ? { slug: autoSlug(e.target.value), entityKey: autoSlug(e.target.value), tableName: autoSlug(e.target.value).replace(/-/g, "_") } : {}) }))}
                placeholder="למשל: לקוח" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">שם הישות (רבים) *</label>
              <input value={form.namePlural} onChange={e => setForm(f => ({ ...f, namePlural: e.target.value }))}
                placeholder="למשל: לקוחות" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">שם באנגלית</label>
            <input value={form.nameEn} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))} dir="ltr"
              placeholder="Customer" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Slug *</label>
              <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} dir="ltr"
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Entity Key</label>
              <input value={form.entityKey} onChange={e => setForm(f => ({ ...f, entityKey: e.target.value }))} dir="ltr"
                placeholder="customer" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Table Name</label>
              <input value={form.tableName} onChange={e => setForm(f => ({ ...f, tableName: e.target.value }))} dir="ltr"
                placeholder="customers" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">שדה תצוגה ראשי</label>
            {entityWithFields?.fields && entityWithFields.fields.length > 0 ? (
              <select value={form.primaryDisplayField} onChange={e => setForm(f => ({ ...f, primaryDisplayField: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">בחר שדה...</option>
                {entityWithFields.fields.filter((f: any) => ["text", "number", "email", "phone", "auto_number"].includes(f.fieldType)).map((f: any) => (
                  <option key={f.slug} value={f.slug}>{f.name} ({f.slug})</option>
                ))}
              </select>
            ) : (
              <input value={form.primaryDisplayField} onChange={e => setForm(f => ({ ...f, primaryDisplayField: e.target.value }))} dir="ltr"
                placeholder="name" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">תבנית שמות (Naming Pattern)</label>
            <input value={form.namingPattern} onChange={e => setForm(f => ({ ...f, namingPattern: e.target.value }))} dir="ltr"
              placeholder="{{first_name}} {{last_name}} - {{id}}" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono" />
            <p className="text-xs text-muted-foreground mt-1">השתמש ב-{`{{field_slug}}`} להכנסת ערכי שדות. לדוגמה: {`{{first_name}} {{last_name}}`}</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">סוג ישות</label>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {ENTITY_TYPES.map(et => (
                <label key={et.key} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${form.entityType === et.key ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                  <input type="radio" name="entityType" value={et.key} checked={form.entityType === et.key} onChange={e => setForm(f => ({ ...f, entityType: e.target.value }))} className="sr-only" />
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${form.entityType === et.key ? "border-primary" : "border-muted-foreground"}`}>
                    {form.entityType === et.key && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{et.label}</p>
                    <p className="text-xs text-muted-foreground">{et.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">תיאור</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">תכונות (Feature Flags)</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {FEATURE_FLAGS.map(ff => (
                <label key={ff.key} className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${(form as any)[ff.key] ? "border-green-500/50 bg-green-500/5" : "border-border hover:border-primary/30"}`}>
                  <input type="checkbox" checked={(form as any)[ff.key]} onChange={e => setForm(f => ({ ...f, [ff.key]: e.target.checked }))}
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                  <div>
                    <p className="text-xs font-medium">{ff.label}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
        {entity && entityWithFields?.fields?.length === 0 && (
          <div className="mt-4 flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/30 rounded-xl">
            <span className="text-destructive text-sm font-medium">⚠ יש להגדיר לפחות שדה אחד לפני שמירת הישות</span>
          </div>
        )}
        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={() => {
              const { namingPattern, ...rest } = form;
              const submitData = { ...rest, settings: { ...(entity?.settings || {}), ...(namingPattern ? { namingPattern } : {}) } };
              onSubmit(submitData);
            }} disabled={!form.name || !form.namePlural || !form.slug || isLoading || (!!entity && entityWithFields?.fields?.length === 0)}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : entity ? "עדכן ישות" : "צור ישות"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function PublishVersionModal({ moduleName, currentVersion, onClose, onPublish, isLoading }: {
  moduleName: string; currentVersion: number; onClose: () => void; onPublish: (notes: string) => void; isLoading: boolean;
}) {
  const [notes, setNotes] = useState("");
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
            <Upload className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold">פרסום גרסה חדשה</h2>
            <p className="text-sm text-muted-foreground">{moduleName} — v{currentVersion} → v{currentVersion + 1}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          פרסום גרסה יוצר snapshot מלא של כל המטא-דאטה של המודול: ישויות, שדות, טפסים, תצוגות, סטטוסים, קשרים ופעולות.
        </p>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1.5">הערות לגרסה (אופציונלי)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="תאר את השינויים בגרסה זו..."
            className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => onPublish(notes)} disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-foreground rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50">
            {isLoading ? "מפרסם..." : "פרסם גרסה"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="module-editor" />
        <RelatedRecords entityType="module-editor" />
      </div>
      </motion.div>
    </motion.div>
  );
}
