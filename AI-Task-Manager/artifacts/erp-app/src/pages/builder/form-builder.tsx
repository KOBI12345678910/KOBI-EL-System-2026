import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { usePlatformModules } from "@/hooks/usePlatformModules";
import {
  Plus, Trash2, Edit2, FormInput, ChevronLeft, X, Eye,
  GripVertical, Columns, LayoutList, Settings, Copy, CheckCircle, Search
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

interface FormDef {
  id: number;
  entityId: number;
  name: string;
  slug: string;
  formType: string;
  sections: any[];
  settings: any;
  isDefault: boolean;
}

interface EntityInfo {
  id: number;
  name: string;
  nameHe: string;
  slug: string;
  fields?: any[];
}

const FORM_TYPE_LABELS: Record<string, string> = {
  create: "יצירה",
  edit: "עריכה",
  quick_create: "יצירה מהירה",
  wizard: "אשף",
};

export default function FormBuilderPage() {
  const queryClient = useQueryClient();
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [showCreate, setShowCreate] = useState(false);
  const [editingForm, setEditingForm] = useState<FormDef | null>(null);
  const [previewForm, setPreviewForm] = useState<FormDef | null>(null);
  const [editingSections, setEditingSections] = useState<FormDef | null>(null);
  const [search, setSearch] = useState("");

  const { modules } = usePlatformModules();

  const allEntities: EntityInfo[] = modules.flatMap((m: any) => (m.entities || []).map((e: any) => ({ ...e, moduleName: m.name })));

  const { data: forms = [] } = useQuery<FormDef[]>({
    queryKey: ["all-forms", selectedEntityId],
    queryFn: async () => {
      if (!selectedEntityId) {
        const results = await Promise.allSettled(
          allEntities.map(ent => authFetch(`${API}/platform/entities/${ent.id}/forms`).then(r => r.ok ? r.json() : []))
        );
        return results.flatMap(r => (r.status === "fulfilled" && Array.isArray(r.value) ? r.value : [])) as FormDef[];
      }
      const r = await authFetch(`${API}/platform/entities/${selectedEntityId}/forms`);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: allEntities.length > 0 || !!selectedEntityId,
  });

  const { data: entityFields = [] } = useQuery({
    queryKey: ["entity-fields-for-form", editingSections?.entityId],
    queryFn: () => authFetch(`${API}/platform/entities/${editingSections!.entityId}`).then(r => r.json()).then(d => d.fields || []),
    enabled: !!editingSections,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/entities/${data.entityId}/forms`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create form");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["all-forms"] }); setShowCreate(false); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const r = await authFetch(`${API}/platform/forms/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update form");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-forms"] });
      setEditingForm(null);
      setEditingSections(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/platform/forms/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all-forms"] }),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/platform/forms/${id}/duplicate`, { method: "POST" });
      if (!r.ok) throw new Error("Failed to duplicate");
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all-forms"] }),
  });

  const getEntityName = (entityId: number) => allEntities.find(e => e.id === entityId)?.nameHe || allEntities.find(e => e.id === entityId)?.name || `#${entityId}`;

  const filteredForms = forms.filter(f => {
    if (search && !f.name.toLowerCase().includes(search.toLowerCase()) && !f.slug.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/builder" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />בונה הפלטפורמה
        </Link>
        <span>/</span>
        <span className="text-foreground">בונה טפסים</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-3">
            <FormInput className="w-8 h-8 text-green-400" />בונה טפסים
          </h1>
          <p className="text-muted-foreground mt-1">עורך sections ויזואלי, סוגי טפסים, תצוגה מקדימה, default form אוטומטי</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-5 h-5" />טופס חדש
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש טפסים..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={selectedEntityId ?? ""} onChange={e => setSelectedEntityId(e.target.value ? Number(e.target.value) : null)}
          className="px-3 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
          <option value="">כל הישויות</option>
          {allEntities.map(e => <option key={e.id} value={e.id}>{e.nameHe || e.name}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filteredForms.length} טפסים</span>
      </div>

      {filteredForms.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
          <FormInput className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">אין טפסים</h3>
          <p className="text-muted-foreground mb-4">צור טפסים דינמיים עם sections וסדר שדות מותאם</p>
          <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
            <Plus className="w-4 h-4" />טופס חדש
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredForms.map((form, i) => (
            <motion.div key={form.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className="bg-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                    <FormInput className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{form.name}</h3>
                    <p className="text-xs text-muted-foreground">{getEntityName(form.entityId)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {form.isDefault && <span className="text-xs px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded-md">ברירת מחדל</span>}
                  <span className="text-xs px-2 py-0.5 bg-muted rounded-md">{FORM_TYPE_LABELS[form.formType] || form.formType}</span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground mb-3">
                {(form.sections || []).length} סקשנים · slug: {form.slug}
              </div>
              <div className="flex items-center gap-2 pt-3 border-t border-border/50">
                <button onClick={() => setEditingSections(form)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary/10 text-primary rounded-lg text-sm font-medium hover:bg-primary/20 transition-colors">
                  <Columns className="w-4 h-4" />עורך Sections
                </button>
                <button onClick={() => setPreviewForm(form)} className="p-2 hover:bg-muted rounded-lg transition-colors" title="תצוגה מקדימה"><Eye className="w-4 h-4 text-muted-foreground" /></button>
                <button onClick={() => duplicateMutation.mutate(form.id)} className="p-2 hover:bg-muted rounded-lg transition-colors" title="שכפול"><Copy className="w-4 h-4 text-muted-foreground" /></button>
                <button onClick={() => setEditingForm(form)} className="p-2 hover:bg-muted rounded-lg transition-colors"><Edit2 className="w-4 h-4 text-muted-foreground" /></button>
                {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק את הטופס?", { itemName: form.name, entityType: "טופס" }); if (ok) deleteMutation.mutate(form.id); }} className="p-2 hover:bg-destructive/10 rounded-lg transition-colors"><Trash2 className="w-4 h-4 text-destructive" /></button>}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {(showCreate || editingForm) && (
          <FormCreateModal
            form={editingForm}
            entities={allEntities}
            onClose={() => { setShowCreate(false); setEditingForm(null); }}
            onSubmit={(data) => {
              if (editingForm) updateMutation.mutate({ id: editingForm.id, ...data });
              else createMutation.mutate(data);
            }}
            isLoading={createMutation.isPending || updateMutation.isPending}
          />
        )}
        {editingSections && (
          <SectionEditorModal
            form={editingSections}
            fields={entityFields}
            onClose={() => setEditingSections(null)}
            onSave={(sections) => updateMutation.mutate({ id: editingSections.id, sections })}
            isLoading={updateMutation.isPending}
          />
        )}
        {previewForm && (
          <FormPreviewModal form={previewForm} fields={entityFields} onClose={() => setPreviewForm(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function FormCreateModal({ form, entities, onClose, onSubmit, isLoading }: {
  form: FormDef | null; entities: EntityInfo[]; onClose: () => void; onSubmit: (data: any) => void; isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    entityId: form?.entityId || "",
    name: form?.name || "",
    slug: form?.slug || "",
    formType: form?.formType || "create",
    isDefault: form?.isDefault ?? false,
  });
  const autoSlug = (n: string) => n.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-card border border-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">{form ? "עריכת טופס" : "טופס חדש"}</h2>
        <div className="space-y-4">
          {!form && (
            <div>
              <label className="block text-sm font-medium mb-1.5">ישות *</label>
              <select value={formData.entityId} onChange={e => setFormData(f => ({ ...f, entityId: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">בחר ישות...</option>
                {entities.map(e => <option key={e.id} value={e.id}>{e.nameHe || e.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1.5">שם הטופס *</label>
            <input value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value, ...(!form ? { slug: autoSlug(e.target.value) } : {}) }))}
              placeholder="טופס יצירה ראשי" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Slug *</label>
            <input value={formData.slug} onChange={e => setFormData(f => ({ ...f, slug: e.target.value }))} dir="ltr"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">סוג טופס</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(FORM_TYPE_LABELS).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setFormData(f => ({ ...f, formType: key }))}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${formData.formType === key ? "bg-primary text-primary-foreground" : "bg-background border border-border hover:border-primary/30"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={formData.isDefault} onChange={e => setFormData(f => ({ ...f, isDefault: e.target.checked }))}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
            <span className="text-sm">טופס ברירת מחדל</span>
          </label>
        </div>
        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={() => onSubmit(formData)} disabled={!formData.name || !formData.slug || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : form ? "עדכן" : "צור טופס"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SectionEditorModal({ form, fields, onClose, onSave, isLoading }: {
  form: FormDef; fields: any[]; onClose: () => void; onSave: (sections: any[]) => void; isLoading: boolean;
}) {
  const [sections, setSections] = useState<any[]>(form.sections || [{ name: "כללי", slug: "general", fields: fields.map((f: any) => f.slug || f.fieldKey), sortOrder: 0 }]);

  const addSection = () => {
    setSections(prev => [...prev, { name: `סקשן ${prev.length + 1}`, slug: `section-${prev.length + 1}`, fields: [], sortOrder: prev.length }]);
  };

  const removeSection = (idx: number) => setSections(prev => prev.filter((_, i) => i !== idx));

  const updateSection = (idx: number, updates: any) => {
    setSections(prev => prev.map((s, i) => i === idx ? { ...s, ...updates } : s));
  };

  const assignedFields = new Set(sections.flatMap(s => s.fields || []));
  const unassignedFields = fields.filter((f: any) => !assignedFields.has(f.slug) && !assignedFields.has(f.fieldKey));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
        className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold">עורך Sections — {form.name}</h2>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {sections.map((section, idx) => (
            <div key={idx} className="bg-background border border-border rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                <input value={section.name} onChange={e => updateSection(idx, { name: e.target.value })}
                  className="flex-1 px-2 py-1 bg-transparent border-b border-border text-sm font-medium focus:outline-none focus:border-primary" />
                <button onClick={() => removeSection(idx)} className="p-1 hover:bg-destructive/10 rounded"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
              </div>
              <div className="space-y-1.5">
                {(section.fields || []).map((fieldSlug: string, fi: number) => {
                  const field = fields.find((f: any) => f.slug === fieldSlug || f.fieldKey === fieldSlug);
                  return (
                    <div key={fi} className="flex items-center gap-2 px-3 py-2 bg-card border border-border/50 rounded-lg text-sm">
                      <GripVertical className="w-3.5 h-3.5 text-muted-foreground cursor-grab" />
                      <span className="flex-1">{field?.name || field?.nameHe || fieldSlug}</span>
                      <span className="text-xs text-muted-foreground">{field?.fieldType}</span>
                      <button onClick={() => updateSection(idx, { fields: section.fields.filter((_: any, i: number) => i !== fi) })}
                        className="p-0.5 hover:bg-destructive/10 rounded"><X className="w-3 h-3 text-destructive" /></button>
                    </div>
                  );
                })}
                {unassignedFields.length > 0 && (
                  <select onChange={e => {
                    if (e.target.value) {
                      updateSection(idx, { fields: [...(section.fields || []), e.target.value] });
                      e.target.value = "";
                    }
                  }} className="w-full px-3 py-2 bg-card border border-dashed border-border rounded-lg text-sm text-muted-foreground">
                    <option value="">+ הוסף שדה...</option>
                    {unassignedFields.map((f: any) => <option key={f.slug || f.fieldKey} value={f.slug || f.fieldKey}>{f.name || f.nameHe} ({f.fieldType})</option>)}
                  </select>
                )}
              </div>
            </div>
          ))}
          <button onClick={addSection} className="w-full py-3 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors">
            <Plus className="w-4 h-4 inline mr-1" />הוסף סקשן
          </button>
        </div>
        <div className="flex items-center gap-3 p-6 border-t border-border">
          <button onClick={() => onSave(sections)} disabled={isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : "שמור Sections"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function FormPreviewModal({ form, fields, onClose }: { form: FormDef; fields: any[]; onClose: () => void }) {
  const sections = form.sections || [{ name: "כללי", fields: fields.map((f: any) => f.slug || f.fieldKey) }];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
        className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold flex items-center gap-2"><Eye className="w-5 h-5 text-primary" />תצוגה מקדימה — {form.name}</h2>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-6">
          {sections.map((section: any, si: number) => (
            <div key={si}>
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground border-b border-border pb-2">{section.name}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(section.fields || []).map((fieldSlug: string, fi: number) => {
                  const field = fields.find((f: any) => f.slug === fieldSlug || f.fieldKey === fieldSlug);
                  return (
                    <div key={fi} className={field?.fieldWidth === "full" ? "col-span-2" : ""}>
                      <label className="block text-sm font-medium mb-1">{field?.name || field?.nameHe || fieldSlug}</label>
                      <div className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-muted-foreground">{field?.placeholder || "..."}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="forms" />
        <RelatedRecords entityType="forms" />
      </div>
      </motion.div>
    </motion.div>
  );
}
