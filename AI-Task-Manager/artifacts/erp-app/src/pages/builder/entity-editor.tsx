import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { usePlatformModules } from "@/hooks/usePlatformModules";
import {
  ChevronLeft, Plus, Database, FileText, Settings, Trash2, Edit2,
  Layers, Activity, Eye, GripVertical, Hash, Type, Calendar,
  List, ToggleRight, Link as LinkIcon, Paperclip, Mail, Globe,
  CheckSquare, ArrowLeftRight, Palette, AlertCircle, X,
  ClipboardList, Star, ChevronDown, ChevronUp, Move, Filter,
  SlidersHorizontal, ArrowUpDown, LayoutDashboard, Table2,
  FolderTree, Zap, ShieldCheck, MousePointerClick, Copy
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { FIELD_TYPES, FIELD_TYPE_CATEGORIES, FIELD_TYPE_MAP, STATUS_COLORS } from "./field-type-registry";
import { CategoriesTab } from "./categories-builder";
import { EnhancedStatusesTab } from "./status-builder";
import { ActionsTab } from "./actions-builder";
import { ValidationTab } from "./validation-builder";
import { SubTablesTab } from "./sub-tables-builder";
import { EntityButtonsTab } from "./entity-buttons-tab";
import { LoadingSkeleton } from "@/components/ui/unified-states";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

export default function EntityEditor() {
  const { id } = useParams<{ id: string }>();
  const entityId = Number(id);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"fields" | "statuses" | "categories" | "actions" | "validations" | "relations" | "sub_tables" | "forms" | "views" | "details" | "buttons">("fields");
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [showAddField, setShowAddField] = useState(false);
  const [showAddStatus, setShowAddStatus] = useState(false);
  const [showAddRelation, setShowAddRelation] = useState(false);
  const [editingField, setEditingField] = useState<any>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingForm, setEditingForm] = useState<any>(null);
  const [editingSections, setEditingSections] = useState<any>(null);
  const [editingRelation, setEditingRelation] = useState<any>(null);
  const [showAddView, setShowAddView] = useState(false);
  const [editingView, setEditingView] = useState<any>(null);
  const [editingViewColumns, setEditingViewColumns] = useState<any>(null);
  const [showAddDetail, setShowAddDetail] = useState(false);
  const [editingDetail, setEditingDetail] = useState<any>(null);
  const [editingDetailSections, setEditingDetailSections] = useState<any>(null);

  const { data: entity, isLoading } = useQuery({
    queryKey: ["platform-entity", entityId],
    queryFn: () => authFetch(`${API}/platform/entities/${entityId}`).then(r => r.json()),
  });

  const { data: relations = [] } = useQuery({
    queryKey: ["entity-relations", entityId],
    queryFn: () => authFetch(`${API}/platform/entities/${entityId}/relations`).then(r => r.json()),
  });

  const { data: forms = [] } = useQuery({
    queryKey: ["entity-forms", entityId],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/entities/${entityId}/forms`);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: views = [] } = useQuery({
    queryKey: ["entity-views", entityId],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/entities/${entityId}/views`);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: detailDefs = [] } = useQuery({
    queryKey: ["entity-detail-page-definitions", entityId],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/entities/${entityId}/detail-page-definitions`);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: entityButtons = [] } = useQuery({
    queryKey: ["entity-button-definitions", entityId],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/entities/${entityId}/button-definitions`);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { modules: _editorModules } = usePlatformModules();

  const { data: allEntities = [] } = useQuery({
    queryKey: ["all-entities-for-relations", _editorModules.map((m: any) => m.id)],
    queryFn: async () => {
      const allEnts: any[] = [];
      for (const mod of _editorModules) {
        const ents = await authFetch(`${API}/platform/modules/${mod.id}/entities`).then(r => r.json());
        allEnts.push(...ents.map((e: any) => ({ ...e, moduleName: mod.name })));
      }
      return allEnts;
    },
    enabled: _editorModules.length > 0,
  });

  const createFieldMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/entities/${entityId}/fields`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error(err.message || "Failed to create field"); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["platform-entity", entityId] }); setShowAddField(false); },
  });

  const updateFieldMutation = useMutation({
    mutationFn: async ({ id: fieldId, ...data }: any) => {
      const r = await authFetch(`${API}/platform/fields/${fieldId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error(err.message || "Failed to update field"); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["platform-entity", entityId] }); setEditingField(null); },
  });

  const deleteFieldMutation = useMutation({
    mutationFn: async (fieldId: number) => {
      const r = await authFetch(`${API}/platform/fields/${fieldId}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to delete field");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platform-entity", entityId] }),
  });

  const cloneFieldMutation = useMutation({
    mutationFn: (fieldId: number) => authFetch(`${API}/platform/fields/${fieldId}/clone`, { method: "POST" }).then(r => {
      if (!r.ok) return r.json().then(e => Promise.reject(e));
      return r.json();
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platform-entity", entityId] }),
  });

  const reorderFieldsMutation = useMutation({
    mutationFn: (items: { id: number; sortOrder: number }[]) => authFetch(`${API}/platform/fields/reorder`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items, entityId }),
    }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platform-entity", entityId] }),
  });

  const createStatusMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/entities/${entityId}/statuses`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error(err.message || "Failed to create status"); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["platform-entity", entityId] }); setShowAddStatus(false); },
  });

  const deleteStatusMutation = useMutation({
    mutationFn: async (statusId: number) => {
      const r = await authFetch(`${API}/platform/statuses/${statusId}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to delete status");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platform-entity", entityId] }),
  });

  const createRelationMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/entities/${entityId}/relations`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error(err.message || "Failed to create relation"); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["entity-relations", entityId] }); setShowAddRelation(false); },
  });

  const updateRelationMutation = useMutation({
    mutationFn: ({ id: relId, ...data }: any) => authFetch(`${API}/platform/relations/${relId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["entity-relations", entityId] }); setEditingRelation(null); },
  });

  const deleteRelationMutation = useMutation({
    mutationFn: async (relId: number) => {
      const r = await authFetch(`${API}/platform/relations/${relId}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to delete relation");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entity-relations", entityId] }),
  });

  const createFormMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/entities/${entityId}/forms`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create form");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["entity-forms", entityId] }); setShowAddForm(false); },
  });

  const updateFormMutation = useMutation({
    mutationFn: async ({ id: formId, ...data }: any) => {
      const r = await authFetch(`${API}/platform/forms/${formId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update form");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["entity-forms", entityId] }); setEditingForm(null); setEditingSections(null); },
  });

  const deleteFormMutation = useMutation({
    mutationFn: (formId: number) => authFetch(`${API}/platform/forms/${formId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entity-forms", entityId] }),
  });

  const createViewMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/entities/${entityId}/views`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create view");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["entity-views", entityId] }); setShowAddView(false); },
  });

  const updateViewMutation = useMutation({
    mutationFn: async ({ id: viewId, ...data }: any) => {
      const r = await authFetch(`${API}/platform/views/${viewId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update view");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["entity-views", entityId] }); setEditingView(null); setEditingViewColumns(null); },
  });

  const deleteViewMutation = useMutation({
    mutationFn: (viewId: number) => authFetch(`${API}/platform/views/${viewId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entity-views", entityId] }),
  });

  const createDetailMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/entities/${entityId}/detail-page-definitions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create detail page definition");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["entity-detail-page-definitions", entityId] }); setShowAddDetail(false); },
  });

  const updateDetailMutation = useMutation({
    mutationFn: async ({ id: detailId, ...data }: any) => {
      const r = await authFetch(`${API}/platform/detail-page-definitions/${detailId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update detail page definition");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["entity-detail-page-definitions", entityId] }); setEditingDetail(null); setEditingDetailSections(null); },
  });

  const deleteDetailMutation = useMutation({
    mutationFn: (detailId: number) => authFetch(`${API}/platform/detail-page-definitions/${detailId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entity-detail-page-definitions", entityId] }),
  });

  if (isLoading) return <LoadingSkeleton variant="page" />;
  if (!entity) return <div className="text-center py-20 text-muted-foreground">ישות לא נמצאה</div>;

  const tabs = [
    { key: "fields" as const, label: "שדות", icon: Database, count: entity.fields?.length || 0 },
    { key: "statuses" as const, label: "סטטוסים", icon: Activity, count: entity.statuses?.length || 0 },
    { key: "categories" as const, label: "קטגוריות", icon: FolderTree, count: 0 },
    { key: "actions" as const, label: "פעולות", icon: Zap, count: 0 },
    { key: "validations" as const, label: "ולידציה", icon: ShieldCheck, count: 0 },
    { key: "relations" as const, label: "קשרים", icon: ArrowLeftRight, count: relations.length },
    { key: "sub_tables" as const, label: "תת-טבלאות", icon: Table2, count: relations.filter((r: any) => r.relationType === "inline_child" && r.sourceEntityId === entityId).length },
    { key: "forms" as const, label: "טפסים", icon: ClipboardList, count: forms.length },
    { key: "views" as const, label: "תצוגות", icon: Table2, count: views.length },
    { key: "details" as const, label: "דפי פרטים", icon: LayoutDashboard, count: detailDefs.length },
    { key: "buttons" as const, label: "כפתורים", icon: MousePointerClick, count: entityButtons.length },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/builder" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
          בונה הפלטפורמה
        </Link>
        <span>/</span>
        <Link href={`/builder/module/${entity.moduleId}`} className="hover:text-foreground transition-colors">מודול</Link>
        <span>/</span>
        <span className="text-foreground">{entity.name}</span>
      </div>

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center">
            <FileText className="w-7 h-7 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl sm:text-3xl font-bold">{entity.name}</h1>
            <p className="text-muted-foreground mt-1">{entity.namePlural} · {entity.slug} · {entity.entityType}</p>
          </div>
        </div>
        <Link href={`/builder/data/${entityId}`} className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-foreground rounded-xl font-medium hover:bg-green-700 transition-colors">
          <Eye className="w-5 h-5" />
          צפה בנתונים
        </Link>
      </div>

      <div className="flex items-center gap-1 p-1 bg-card border border-border rounded-xl overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0 justify-center ${activeTab === tab.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
            <tab.icon className="w-4 h-4" />
            {tab.label}
            <span className={`px-1.5 py-0.5 rounded-md text-xs ${activeTab === tab.key ? "bg-primary-foreground/20" : "bg-muted"}`}>{tab.count}</span>
          </button>
        ))}
      </div>

      {activeTab === "fields" && (
        <FieldsTab fields={entity.fields || []} onAdd={() => setShowAddField(true)} onEdit={setEditingField} onDelete={isSuperAdmin ? async (id) => { if (await globalConfirm("למחוק את השדה?")) deleteFieldMutation.mutate(id); } : undefined} onClone={async (id) => { if (await globalConfirm("לשכפל את השדה?")) cloneFieldMutation.mutate(id); }} onReorder={(items) => reorderFieldsMutation.mutate(items)} />
      )}
      {activeTab === "statuses" && (
        <EnhancedStatusesTab entityId={entityId} statuses={entity.statuses || []} />
      )}
      {activeTab === "categories" && (
        <CategoriesTab entityId={entityId} />
      )}
      {activeTab === "actions" && (
        <ActionsTab entityId={entityId} />
      )}
      {activeTab === "validations" && (
        <ValidationTab entityId={entityId} fields={entity.fields || []} />
      )}
      {activeTab === "relations" && (
        <RelationsTab relations={relations} entityId={entityId} allEntities={allEntities} onAdd={() => setShowAddRelation(true)} onEdit={setEditingRelation} onDelete={isSuperAdmin ? async (id) => { if (await globalConfirm("למחוק את הקשר?")) deleteRelationMutation.mutate(id); } : undefined} />
      )}
      {activeTab === "sub_tables" && (
        <SubTablesTab entityId={entityId} />
      )}
      {activeTab === "forms" && (
        <FormsTab forms={forms} onAdd={() => setShowAddForm(true)} onEdit={setEditingForm} onDelete={isSuperAdmin ? async (id) => { if (await globalConfirm("למחוק את הטופס?")) deleteFormMutation.mutate(id); } : undefined} onEditSections={(form) => setEditingSections(form)} />
      )}
      {activeTab === "views" && (
        <ViewsTab views={views} onAdd={() => setShowAddView(true)} onEdit={setEditingView} onDelete={isSuperAdmin ? async (id) => { if (await globalConfirm("למחוק את התצוגה?")) deleteViewMutation.mutate(id); } : undefined} onEditColumns={(view) => setEditingViewColumns(view)} />
      )}
      {activeTab === "details" && (
        <DetailsTab details={detailDefs} onAdd={() => setShowAddDetail(true)} onEdit={setEditingDetail} onDelete={isSuperAdmin ? async (id) => { if (await globalConfirm("למחוק את הגדרת דף הפרטים?")) deleteDetailMutation.mutate(id); } : undefined} onEditSections={(detail) => setEditingDetailSections(detail)} />
      )}
      {activeTab === "buttons" && (
        <EntityButtonsTab entityId={entityId} />
      )}

      <AnimatePresence>
        {showAddField && (
          <FieldFormModal onClose={() => setShowAddField(false)} onSubmit={(data) => createFieldMutation.mutate(data)} isLoading={createFieldMutation.isPending} />
        )}
        {editingField && (
          <FieldFormModal field={editingField} onClose={() => setEditingField(null)} onSubmit={(data) => updateFieldMutation.mutate({ id: editingField.id, ...data })} isLoading={updateFieldMutation.isPending} />
        )}
        {showAddRelation && (
          <RelationFormModal entityId={entityId} allEntities={allEntities} onClose={() => setShowAddRelation(false)} onSubmit={(data) => createRelationMutation.mutate(data)} isLoading={createRelationMutation.isPending} />
        )}
        {editingRelation && (
          <RelationFormModal entityId={entityId} allEntities={allEntities} relation={editingRelation} onClose={() => setEditingRelation(null)} onSubmit={(data) => updateRelationMutation.mutate({ id: editingRelation.id, ...data })} isLoading={updateRelationMutation.isPending} />
        )}
        {showAddForm && (
          <FormDefinitionModal onClose={() => setShowAddForm(false)} onSubmit={(data) => createFormMutation.mutate(data)} isLoading={createFormMutation.isPending} />
        )}
        {editingForm && (
          <FormDefinitionModal form={editingForm} onClose={() => setEditingForm(null)} onSubmit={(data) => updateFormMutation.mutate({ id: editingForm.id, ...data })} isLoading={updateFormMutation.isPending} />
        )}
        {editingSections && (
          <SectionEditorModal form={editingSections} fields={entity.fields || []} onClose={() => setEditingSections(null)} onSave={(sections) => updateFormMutation.mutate({ id: editingSections.id, sections })} isLoading={updateFormMutation.isPending} />
        )}
        {showAddView && (
          <ViewDefinitionModal fields={entity.fields || []} onClose={() => setShowAddView(false)} onSubmit={(data) => createViewMutation.mutate(data)} isLoading={createViewMutation.isPending} />
        )}
        {editingView && (
          <ViewDefinitionModal view={editingView} fields={entity.fields || []} onClose={() => setEditingView(null)} onSubmit={(data) => updateViewMutation.mutate({ id: editingView.id, ...data })} isLoading={updateViewMutation.isPending} />
        )}
        {editingViewColumns && (
          <ViewColumnsEditor view={editingViewColumns} fields={entity.fields || []} onClose={() => setEditingViewColumns(null)} onSave={(data) => updateViewMutation.mutate({ id: editingViewColumns.id, ...data })} isLoading={updateViewMutation.isPending} />
        )}
        {showAddDetail && (
          <DetailDefinitionModal onClose={() => setShowAddDetail(false)} onSubmit={(data) => createDetailMutation.mutate(data)} isLoading={createDetailMutation.isPending} />
        )}
        {editingDetail && (
          <DetailDefinitionModal detail={editingDetail} onClose={() => setEditingDetail(null)} onSubmit={(data) => updateDetailMutation.mutate({ id: editingDetail.id, ...data })} isLoading={updateDetailMutation.isPending} />
        )}
        {editingDetailSections && (
          <DetailSectionEditorModal detail={editingDetailSections} fields={entity.fields || []} onClose={() => setEditingDetailSections(null)} onSave={(sections) => updateDetailMutation.mutate({ id: editingDetailSections.id, sections })} isLoading={updateDetailMutation.isPending} />
        )}
      </AnimatePresence>
    </div>
  );
}

function FieldsTab({ fields, onAdd, onEdit, onDelete, onClone, onReorder }: { fields: any[]; onAdd: () => void; onEdit: (f: any) => void; onDelete?: (id: number) => void; onClone: (id: number) => void; onReorder: (items: { id: number; sortOrder: number }[]) => void }) {
  const [viewMode, setViewMode] = useState<"flat" | "grouped">("flat");
  const [searchTerm, setSearchTerm] = useState("");

  const moveField = (fieldId: number, dir: -1 | 1) => {
    const currentIdx = fields.findIndex((f: any) => f.id === fieldId);
    if (currentIdx < 0) return;
    const swapIdx = currentIdx + dir;
    if (swapIdx < 0 || swapIdx >= fields.length) return;
    const items = fields.map((f: any, i: number) => {
      if (i === currentIdx) return { id: f.id, sortOrder: swapIdx };
      if (i === swapIdx) return { id: f.id, sortOrder: currentIdx };
      return { id: f.id, sortOrder: i };
    });
    onReorder(items);
  };

  const filteredFields = fields.filter(f =>
    !searchTerm || f.name?.toLowerCase().includes(searchTerm.toLowerCase()) || f.slug?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const groups = filteredFields.reduce((acc: Record<string, any[]>, f) => {
    const group = f.groupName || "כללי";
    if (!acc[group]) acc[group] = [];
    acc[group].push(f);
    return acc;
  }, {});

  const requiredCount = fields.filter(f => f.isRequired).length;
  const calculatedCount = fields.filter(f => f.isCalculated || f.fieldType === "formula" || f.fieldType === "computed").length;
  const selectionCount = fields.filter(f => ["single_select", "multi_select", "tags", "radio"].includes(f.fieldType)).length;

  const FIELD_TYPE_COLORS: Record<string, string> = {
    text: "bg-blue-500/10 text-blue-400", long_text: "bg-blue-500/10 text-blue-400", rich_text: "bg-blue-500/10 text-blue-400",
    number: "bg-green-500/10 text-green-400", decimal: "bg-green-500/10 text-green-400", currency: "bg-emerald-500/10 text-emerald-400", percent: "bg-green-500/10 text-green-400",
    date: "bg-purple-500/10 text-purple-400", datetime: "bg-purple-500/10 text-purple-400", time: "bg-purple-500/10 text-purple-400", duration: "bg-purple-500/10 text-purple-400",
    single_select: "bg-orange-500/10 text-orange-400", multi_select: "bg-orange-500/10 text-orange-400", tags: "bg-orange-500/10 text-orange-400", radio: "bg-orange-500/10 text-orange-400", status: "bg-orange-500/10 text-orange-400", category: "bg-orange-500/10 text-orange-400",
    boolean: "bg-yellow-500/10 text-yellow-400", checkbox: "bg-yellow-500/10 text-yellow-400",
    relation: "bg-cyan-500/10 text-cyan-400", relation_list: "bg-cyan-500/10 text-cyan-400", user_reference: "bg-cyan-500/10 text-cyan-400",
    formula: "bg-pink-500/10 text-pink-400", computed: "bg-pink-500/10 text-pink-400", auto_number: "bg-indigo-500/10 text-indigo-400",
    email: "bg-sky-500/10 text-sky-400", phone: "bg-sky-500/10 text-sky-400", url: "bg-sky-500/10 text-sky-400", address: "bg-sky-500/10 text-sky-400",
    file: "bg-muted/10 text-muted-foreground", image: "bg-muted/10 text-muted-foreground", signature: "bg-muted/10 text-muted-foreground",
  };

  const renderFieldRow = (field: any, idx: number) => {
    const ft = FIELD_TYPE_MAP[field.fieldType];
    const colorClass = FIELD_TYPE_COLORS[field.fieldType] || "bg-primary/10 text-primary";
    const hasOptions = Array.isArray(field.options) && field.options.length > 0;
    const isFormula = field.isCalculated || field.fieldType === "formula" || field.fieldType === "computed";
    const displayRules = field.displayRules || {};
    const hasCondition = displayRules.conditionField && displayRules.conditionValue !== undefined;
    return (
      <tr key={field.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors group">
        <td className="px-2 py-3 w-8">
          <div className="flex flex-col gap-0.5">
            <button onClick={() => moveField(field.id, -1)} disabled={fields.findIndex((f: any) => f.id === field.id) === 0} className="p-0.5 hover:bg-muted rounded disabled:opacity-20" title="הזז למעלה"><ChevronUp className="w-3 h-3 text-muted-foreground" /></button>
            <button onClick={() => moveField(field.id, 1)} disabled={fields.findIndex((f: any) => f.id === field.id) === fields.length - 1} className="p-0.5 hover:bg-muted rounded disabled:opacity-20" title="הזז למטה"><ChevronDown className="w-3 h-3 text-muted-foreground" /></button>
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">{field.name}</p>
                {field.isRequired && <span className="px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded text-[10px] font-bold">חובה</span>}
                {isFormula && <span className="px-1.5 py-0.5 bg-pink-500/10 text-pink-400 rounded text-[10px] font-bold">מחושב</span>}
                {field.isReadOnly && !isFormula && <span className="px-1.5 py-0.5 bg-muted/10 text-muted-foreground rounded text-[10px]">קריאה בלבד</span>}
                {hasCondition && <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded text-[10px]">מותנה</span>}
              </div>
              <p className="text-xs text-muted-foreground">{field.slug}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${colorClass}`}>{ft?.label || field.fieldType}</span>
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-col gap-0.5 text-xs">
            {hasOptions && <span className="text-orange-400">{field.options.length} אפשרויות</span>}
            {isFormula && field.formulaExpression && <span className="text-pink-400 font-mono text-[10px] truncate max-w-[120px]" title={field.formulaExpression}>{field.formulaExpression}</span>}
            {field.defaultValue && <span className="text-muted-foreground">ברירת מחדל: {field.defaultValue}</span>}
            {!hasOptions && !isFormula && !field.defaultValue && <span className="text-muted-foreground/50">—</span>}
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 justify-center">
            {field.showInList && <span className="w-6 h-6 rounded-md bg-green-500/10 flex items-center justify-center text-green-400 text-xs" title="ברשימה">ר</span>}
            {field.showInForm && <span className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center text-blue-400 text-xs" title="בטופס">ט</span>}
            {field.showInDetail && <span className="w-6 h-6 rounded-md bg-purple-500/10 flex items-center justify-center text-purple-400 text-xs" title="בפרטים">פ</span>}
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onEdit(field)} className="p-1.5 hover:bg-muted rounded-lg" title="ערוך שדה"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
            <button onClick={() => onClone(field.id)} className="p-1.5 hover:bg-blue-500/10 rounded-lg" title="שכפל שדה"><Copy className="w-3.5 h-3.5 text-blue-400" /></button>
            {onDelete && <button onClick={() => onDelete(field.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg" title="מחק שדה"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">שדות ({fields.length})</h2>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-1 bg-red-500/10 text-red-400 rounded-md">{requiredCount} חובה</span>
            {calculatedCount > 0 && <span className="px-2 py-1 bg-pink-500/10 text-pink-400 rounded-md">{calculatedCount} מחושבים</span>}
            {selectionCount > 0 && <span className="px-2 py-1 bg-orange-500/10 text-orange-400 rounded-md">{selectionCount} רשימות</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="חיפוש שדה..."
              className="w-48 px-3 py-2 pr-8 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            <Filter className="w-3.5 h-3.5 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2" />
          </div>
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            <button onClick={() => setViewMode("flat")} className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === "flat" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}>רשימה</button>
            <button onClick={() => setViewMode("grouped")} className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === "grouped" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}>קבוצות</button>
          </div>
          <button onClick={onAdd} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" />
            שדה חדש
          </button>
        </div>
      </div>

      {fields.length === 0 ? (
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-xl">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">יש להגדיר לפחות שדה אחד לפני שמירת הישות</p>
              <p className="text-xs text-destructive/80 mt-0.5">ישות ללא שדות אינה שמישה. הוסף לפחות שדה אחד כדי להגדיר את מבנה הנתונים.</p>
            </div>
          </div>
          <div className="bg-card border border-border/50 rounded-2xl p-8 text-center">
            <Database className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">אין שדות — הוסף שדות כדי להגדיר את מבנה הנתונים</p>
            <button onClick={onAdd} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium"><Plus className="w-4 h-4" />הוסף שדה</button>
          </div>
        </div>
      ) : viewMode === "grouped" ? (
        <div className="space-y-4">
          {(Object.entries(groups) as [string, any[]][]).map(([groupName, groupFields]) => (
            <div key={groupName} className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm">{groupName}</span>
                  <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs">{groupFields.length}</span>
                </div>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/20">
                    <th className="w-8"></th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">שדה</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">סוג</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">מידע</th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">תצוגה</th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground w-28">פעולות</th>
                  </tr>
                </thead>
                <tbody>{groupFields.map((f: any, i: number) => renderFieldRow(f, i))}</tbody>
              </table>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="w-8"></th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">שדה</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">סוג</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">מידע</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">תצוגה</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground w-28">פעולות</th>
              </tr>
            </thead>
            <tbody>{filteredFields.map((f: any, i: number) => renderFieldRow(f, i))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusesTab({ statuses, onAdd, onDelete }: { statuses: any[]; onAdd: () => void; onDelete?: (id: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">סטטוסים ({statuses.length})</h2>
        <button onClick={onAdd} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" />
          סטטוס חדש
        </button>
      </div>
      {statuses.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-8 text-center">
          <Activity className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">אין סטטוסים — הוסף סטטוסים כמו "חדש", "פעיל", "סגור"</p>
          <button onClick={onAdd} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium"><Plus className="w-4 h-4" />הוסף סטטוס</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {statuses.map(status => {
            const colorDef = STATUS_COLORS.find(c => c.key === status.color);
            return (
              <div key={status.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colorDef?.hex || "#6b7280" }} />
                  <div>
                    <p className="font-medium text-sm">{status.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {status.isDefault && <span className="text-green-400">ברירת מחדל</span>}
                      {status.isFinal && <span className="text-red-400">סופי</span>}
                    </div>
                  </div>
                </div>
                {onDelete && <button onClick={() => onDelete(status.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const RELATION_TYPE_LABELS: Record<string, string> = {
  one_to_one: "אחד לאחד",
  one_to_many: "אחד לרבים",
  many_to_many: "רבים לרבים",
  inline_child: "תת-טבלה",
};

function RelationsTab({ relations, entityId, allEntities, onAdd, onEdit, onDelete }: { relations: any[]; entityId: number; allEntities: any[]; onAdd: () => void; onEdit: (r: any) => void; onDelete?: (id: number) => void }) {
  const getEntityName = (id: number) => {
    const ent = allEntities.find(e => e.id === id);
    return ent ? `${ent.name} (${ent.moduleName})` : `ישות #${id}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">קשרים ({relations.length})</h2>
        <button onClick={onAdd} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" />
          קשר חדש
        </button>
      </div>
      {relations.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-8 text-center">
          <ArrowLeftRight className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">אין קשרים לישות זו — הוסף קשרים לישויות אחרות</p>
          <button onClick={onAdd} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium"><Plus className="w-4 h-4" />הוסף קשר</button>
        </div>
      ) : (
        <div className="space-y-3">
          {relations.map(rel => (
            <div key={rel.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <LinkIcon className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{rel.label}</p>
                    <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground mt-0.5">
                      <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded-md">{RELATION_TYPE_LABELS[rel.relationType] || rel.relationType}</span>
                      <span>{getEntityName(rel.sourceEntityId)} → {getEntityName(rel.targetEntityId)}</span>
                      {rel.reverseLabel && <span>· הפוך: {rel.reverseLabel}</span>}
                      {rel.cascadeDelete && <span className="text-red-400">· מחיקה מדורגת</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => onEdit(rel)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  {onDelete && <button onClick={() => onDelete(rel.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RelationFormModal({ entityId, allEntities, relation, onClose, onSubmit, isLoading }: { entityId: number; allEntities: any[]; relation?: any; onClose: () => void; onSubmit: (data: any) => void; isLoading: boolean }) {
  const [form, setForm] = useState({
    sourceEntityId: relation?.sourceEntityId || entityId,
    targetEntityId: relation?.targetEntityId || 0,
    relationType: relation?.relationType || "one_to_many",
    label: relation?.label || "",
    reverseLabel: relation?.reverseLabel || "",
    cascadeDelete: relation?.cascadeDelete || false,
  });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">{relation ? "עריכת קשר" : "קשר חדש"}</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">שם הקשר *</label>
            <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              placeholder="למשל: הזמנות לקוח" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">שם הפוך</label>
            <input value={form.reverseLabel} onChange={e => setForm(f => ({ ...f, reverseLabel: e.target.value }))}
              placeholder="למשל: לקוח של הזמנה" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">סוג קשר *</label>
            <select value={form.relationType} onChange={e => setForm(f => ({ ...f, relationType: e.target.value }))}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              <option value="one_to_one">אחד לאחד</option>
              <option value="one_to_many">אחד לרבים</option>
              <option value="many_to_many">רבים לרבים</option>
              <option value="inline_child">תת-טבלה (Inline Child)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">ישות מקור</label>
            <select value={form.sourceEntityId} onChange={e => setForm(f => ({ ...f, sourceEntityId: Number(e.target.value) }))}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              {allEntities.map(ent => (
                <option key={ent.id} value={ent.id}>{ent.name} ({ent.moduleName})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">ישות יעד *</label>
            <select value={form.targetEntityId} onChange={e => setForm(f => ({ ...f, targetEntityId: Number(e.target.value) }))}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              <option value={0}>בחר ישות...</option>
              {allEntities.filter(e => e.id !== form.sourceEntityId).map(ent => (
                <option key={ent.id} value={ent.id}>{ent.name} ({ent.moduleName})</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.cascadeDelete} onChange={e => setForm(f => ({ ...f, cascadeDelete: e.target.checked }))}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
            <span className="text-sm">מחיקה מדורגת (מחיקת רשומות קשורות)</span>
          </label>
        </div>
        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={() => onSubmit(form)} disabled={!form.label || !form.targetEntityId || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : relation ? "עדכן קשר" : "הוסף קשר"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function FieldFormModal({ field, onClose, onSubmit, isLoading }: { field?: any; onClose: () => void; onSubmit: (data: any) => void; isLoading: boolean }) {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [form, setForm] = useState({
    name: field?.name || "",
    nameHe: field?.nameHe || "",
    nameEn: field?.nameEn || "",
    slug: field?.slug || "",
    fieldKey: field?.fieldKey || "",
    fieldType: field?.fieldType || "text",
    groupName: field?.groupName || "",
    description: field?.description || "",
    placeholder: field?.placeholder || "",
    helpText: field?.helpText || "",
    isRequired: field?.isRequired || false,
    isUnique: field?.isUnique || false,
    isSearchable: field?.isSearchable ?? true,
    isSortable: field?.isSortable ?? true,
    isFilterable: field?.isFilterable ?? false,
    isReadOnly: field?.isReadOnly ?? false,
    isSystemField: field?.isSystemField ?? false,
    isCalculated: field?.isCalculated ?? false,
    formulaExpression: field?.formulaExpression || "",
    showInList: field?.showInList ?? true,
    showInForm: field?.showInForm ?? true,
    showInDetail: field?.showInDetail ?? true,
    defaultValue: field?.defaultValue || "",
    fieldWidth: field?.fieldWidth || "full",
    options: field?.options || [],
    sortOrder: field?.sortOrder || 0,
    minValue: field?.minValue ?? "",
    maxValue: field?.maxValue ?? "",
    maxLength: field?.maxLength ?? "",
    sectionKey: field?.sectionKey || "",
    tabKey: field?.tabKey || "",
    relationType: field?.relationType || "",
    settings: field?.settings || {},
    displayRules: field?.displayRules || {},
  });
  const [optionInput, setOptionInput] = useState("");
  const [bulkOptionsMode, setBulkOptionsMode] = useState(false);
  const [bulkOptionsText, setBulkOptionsText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(FIELD_TYPE_MAP[form.fieldType]?.category || "text");
  const [activeSection, setActiveSection] = useState<"basic" | "type" | "options" | "behavior" | "formula" | "advanced">("basic");
  const [editingOptionIndex, setEditingOptionIndex] = useState<number | null>(null);
  const [editingOptionValue, setEditingOptionValue] = useState("");

  const autoSlug = (name: string) => name.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");
  const selectedFieldType = FIELD_TYPE_MAP[form.fieldType];
  const isFormulaType = form.fieldType === "formula" || form.fieldType === "computed";
  const isAutoNumber = form.fieldType === "auto_number";
  const isSubTable = form.fieldType === "sub_table";
  const hasOptions = selectedFieldType?.hasOptions;

  const formSections = [
    { key: "basic" as const, label: "בסיסי", icon: "📝" },
    { key: "type" as const, label: "סוג שדה", icon: "🔧" },
    ...(hasOptions ? [{ key: "options" as const, label: `רשימת בחירה (${(form.options as string[]).length})`, icon: "📋" }] : []),
    { key: "behavior" as const, label: "התנהגות", icon: "⚙️" },
    ...(isFormulaType || form.isCalculated ? [{ key: "formula" as const, label: "חישובים", icon: "🔢" }] : []),
    { key: "advanced" as const, label: "מתקדם", icon: "🛠️" },
  ];

  const moveOption = (from: number, to: number) => {
    if (to < 0 || to >= (form.options as string[]).length) return;
    const newOptions = [...(form.options as string[])];
    const [moved] = newOptions.splice(from, 1);
    newOptions.splice(to, 0, moved);
    setForm(f => ({ ...f, options: newOptions }));
  };

  const submitForm = () => {
    const data: any = { ...form };
    if (data.minValue === "" || data.minValue === null) delete data.minValue;
    else data.minValue = Number(data.minValue);
    if (data.maxValue === "" || data.maxValue === null) delete data.maxValue;
    else data.maxValue = Number(data.maxValue);
    if (data.maxLength === "" || data.maxLength === null) delete data.maxLength;
    else data.maxLength = Number(data.maxLength);
    if (!data.fieldKey) delete data.fieldKey;
    if (!data.formulaExpression) delete data.formulaExpression;
    if (!data.sectionKey) delete data.sectionKey;
    if (!data.tabKey) delete data.tabKey;
    if (!data.relationType) delete data.relationType;
    if (data.settings && Object.keys(data.settings).length === 0) delete data.settings;
    if (data.displayRules && (!data.displayRules.conditionField || data.displayRules.conditionField === "")) {
      data.displayRules = {};
    }
    if (data.fieldType === "formula" || data.fieldType === "computed") {
      data.isCalculated = true;
      data.isReadOnly = true;
      data.showInForm = false;
    }
    if (data.fieldType === "auto_number") {
      data.isReadOnly = true;
      data.isUnique = true;
      data.showInForm = false;
    }
    onSubmit(data);
  };

  const FORMULA_OPERATORS = [
    { label: "+", value: " + ", desc: "חיבור" },
    { label: "-", value: " - ", desc: "חיסור" },
    { label: "×", value: " * ", desc: "כפל" },
    { label: "÷", value: " / ", desc: "חילוק" },
    { label: "(", value: "(", desc: "סוגר פתוח" },
    { label: ")", value: ")", desc: "סוגר סגור" },
  ];

  const FORMULA_FUNCTIONS = [
    { label: "sum", desc: "סיכום", template: "sum(table.field)" },
    { label: "avg", desc: "ממוצע", template: "avg(table.field)" },
    { label: "count", desc: "ספירה", template: "count(table.field)" },
    { label: "min", desc: "מינימום", template: "min(a, b)" },
    { label: "max", desc: "מקסימום", template: "max(a, b)" },
    { label: "round", desc: "עיגול", template: "round(value)" },
    { label: "ceil", desc: "עיגול למעלה", template: "ceil(value)" },
    { label: "floor", desc: "עיגול למטה", template: "floor(value)" },
    { label: "abs", desc: "ערך מוחלט", template: "abs(value)" },
    { label: "sqrt", desc: "שורש", template: "sqrt(value)" },
    { label: "IF", desc: "תנאי", template: "IF({field} > 0, {field_a}, {field_b})" },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Database className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold">{field ? "עריכת שדה" : "שדה חדש"}</h2>
              {form.name && <p className="text-xs text-muted-foreground">{form.name} · {form.slug || "..."}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex items-center gap-1 px-6 py-2 border-b border-border overflow-x-auto bg-muted/20">
          {formSections.map(sec => (
            <button key={sec.key} onClick={() => setActiveSection(sec.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${activeSection === sec.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
              <span>{sec.icon}</span> {sec.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">

          {activeSection === "basic" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">שם השדה (עברית) <span className="text-red-400">*</span></label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, nameHe: e.target.value, ...(!field ? { slug: autoSlug(e.target.value), fieldKey: autoSlug(e.target.value) } : {}) }))}
                    placeholder="למשל: שם לקוח" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">שם באנגלית</label>
                  <input value={form.nameEn} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))} dir="ltr"
                    placeholder="Customer Name" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Slug <span className="text-red-400">*</span></label>
                  <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} dir="ltr"
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">קבוצה (Group)</label>
                  <input value={form.groupName} onChange={e => setForm(f => ({ ...f, groupName: e.target.value }))}
                    placeholder="כללי, פרטים אישיים, כספים..." className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">תיאור</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
                  placeholder="תיאור השדה ומטרתו..." className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Placeholder</label>
                  <input value={form.placeholder} onChange={e => setForm(f => ({ ...f, placeholder: e.target.value }))}
                    placeholder="טקסט רמז..." className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">רוחב שדה</label>
                  <select value={form.fieldWidth} onChange={e => setForm(f => ({ ...f, fieldWidth: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="full">מלא (100%)</option>
                    <option value="half">חצי (50%)</option>
                    <option value="third">שליש (33%)</option>
                    <option value="quarter">רבע (25%)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">סדר הצגה</label>
                  <input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))}
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">טקסט עזרה</label>
                <input value={form.helpText} onChange={e => setForm(f => ({ ...f, helpText: e.target.value }))}
                  placeholder="מידע שיוצג למשתמש כאשר הוא מרחף מעל השדה" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">ערך ברירת מחדל</label>
                <input value={form.defaultValue} onChange={e => setForm(f => ({ ...f, defaultValue: e.target.value }))}
                  placeholder="ערך שייכנס אוטומטית בעת יצירת רשומה חדשה" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>
          )}

          {activeSection === "type" && (
            <div className="space-y-4">
              <label className="block text-sm font-medium mb-2">בחר סוג שדה <span className="text-red-400">*</span></label>
              <div className="flex gap-2 mb-3 flex-wrap">
                {FIELD_TYPE_CATEGORIES.map(cat => (
                  <button key={cat.key} type="button" onClick={() => setSelectedCategory(cat.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedCategory === cat.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                    {cat.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {FIELD_TYPES.filter(ft => ft.category === selectedCategory).map(ft => {
                  const isSelected = form.fieldType === ft.key;
                  return (
                    <button key={ft.key} type="button" onClick={() => setForm(f => ({ ...f, fieldType: ft.key }))}
                      className={`flex flex-col items-start gap-1 px-3 py-3 rounded-xl text-sm transition-all text-right ${isSelected ? "bg-primary text-primary-foreground ring-2 ring-primary/50 shadow-lg" : "bg-background border border-border hover:border-primary/30 hover:shadow-sm"}`}>
                      <span className="font-medium">{ft.label}</span>
                      {ft.hasOptions && <span className={`text-[10px] ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>רשימת בחירה</span>}
                      {ft.hasRelation && <span className={`text-[10px] ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>קשר לישות</span>}
                    </button>
                  );
                })}
              </div>

              {selectedFieldType?.hasRelation && (
                <div className="mt-4 p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-xl">
                  <label className="block text-sm font-medium mb-1.5 text-cyan-400">סוג קשר</label>
                  <select value={form.relationType} onChange={e => setForm(f => ({ ...f, relationType: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50">
                    <option value="">ללא</option>
                    <option value="one_to_one">אחד לאחד</option>
                    <option value="one_to_many">אחד לרבים</option>
                    <option value="many_to_many">רבים לרבים</option>
                  </select>
                </div>
              )}

              {isAutoNumber && (
                <div className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl space-y-3">
                  <h4 className="text-sm font-semibold text-indigo-400">הגדרות מספור אוטומטי</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">תחילית (Prefix)</label>
                      <input value={(form.settings as any).prefix || ""} onChange={e => setForm(f => ({ ...f, settings: { ...f.settings, prefix: e.target.value } }))} dir="ltr"
                        placeholder="INV-" className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">סיומת (Suffix)</label>
                      <input value={(form.settings as any).suffix || ""} onChange={e => setForm(f => ({ ...f, settings: { ...f.settings, suffix: e.target.value } }))} dir="ltr"
                        className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">ריפוד ספרות</label>
                      <input type="number" min={1} max={10} value={(form.settings as any).padding || 4} onChange={e => setForm(f => ({ ...f, settings: { ...f.settings, padding: Number(e.target.value) } }))}
                        className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">ערך התחלתי</label>
                      <input type="number" min={1} value={(form.settings as any).startValue || 1} onChange={e => setForm(f => ({ ...f, settings: { ...f.settings, startValue: Number(e.target.value) } }))}
                        className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">הגדלה ב-</label>
                      <input type="number" min={1} value={(form.settings as any).incrementBy || 1} onChange={e => setForm(f => ({ ...f, settings: { ...f.settings, incrementBy: Number(e.target.value) } }))}
                        className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm" />
                    </div>
                  </div>
                  <div className="p-3 bg-background rounded-lg border border-border/50 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">תצוגה מקדימה:</span>
                    <span className="font-mono text-primary font-bold">{(form.settings as any).prefix || ""}{String((form.settings as any).startValue || 1).padStart((form.settings as any).padding || 4, "0")}{(form.settings as any).suffix || ""}</span>
                  </div>
                </div>
              )}

              {isSubTable && (
                <div className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-xl space-y-3">
                  <h4 className="text-sm font-semibold text-purple-400">הגדרות תת-טבלה</h4>
                  <div>
                    <label className="block text-xs font-medium mb-1">עמודות תת-טבלה (JSON)</label>
                    <textarea value={JSON.stringify((form.settings as any).columns || [{ slug: "item", name: "פריט", type: "text" }, { slug: "quantity", name: "כמות", type: "number" }, { slug: "price", name: "מחיר", type: "currency" }], null, 2)}
                      onChange={e => { try { const cols = JSON.parse(e.target.value); setForm(f => ({ ...f, settings: { ...f.settings, columns: cols } })); } catch {} }}
                      dir="ltr" rows={6}
                      className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-mono" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">מינימום שורות</label>
                      <input type="number" min={0} value={(form.settings as any).minRows || 0} onChange={e => setForm(f => ({ ...f, settings: { ...f.settings, minRows: Number(e.target.value) } }))}
                        className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">מקסימום שורות</label>
                      <input type="number" min={1} value={(form.settings as any).maxRows || 100} onChange={e => setForm(f => ({ ...f, settings: { ...f.settings, maxRows: Number(e.target.value) } }))}
                        className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSection === "options" && hasOptions && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">בניית רשימת בחירה</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{(form.options as string[]).length} אפשרויות מוגדרות</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setBulkOptionsMode(!bulkOptionsMode)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${bulkOptionsMode ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                    {bulkOptionsMode ? "מצב בודד" : "הוספה מרובה"}
                  </button>
                </div>
              </div>

              {bulkOptionsMode ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium mb-1.5 text-muted-foreground">הכנס ערכים, כל ערך בשורה חדשה:</label>
                    <textarea value={bulkOptionsText} onChange={e => setBulkOptionsText(e.target.value)} rows={8}
                      placeholder={"אלומיניום\nברזל\nזכוכית\nנירוסטה\nפלדה"} className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
                  </div>
                  <button type="button" onClick={() => {
                    const newOpts = bulkOptionsText.split("\n").map(s => s.trim()).filter(Boolean);
                    if (newOpts.length > 0) {
                      setForm(f => ({ ...f, options: [...(f.options as string[]), ...newOpts] }));
                      setBulkOptionsText("");
                      setBulkOptionsMode(false);
                    }
                  }} className="w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
                    הוסף {bulkOptionsText.split("\n").filter(s => s.trim()).length} אפשרויות
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input value={optionInput} onChange={e => setOptionInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && optionInput.trim()) { e.preventDefault(); setForm(f => ({ ...f, options: [...(f.options as string[]), optionInput.trim()] })); setOptionInput(""); } }}
                      placeholder="הקלד אפשרות חדשה ולחץ Enter..."
                      className="flex-1 px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                    <button type="button" onClick={() => { if (optionInput.trim()) { setForm(f => ({ ...f, options: [...(f.options as string[]), optionInput.trim()] })); setOptionInput(""); } }}
                      className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium">הוסף</button>
                  </div>

                  {(form.options as string[]).length === 0 ? (
                    <div className="p-6 bg-muted/30 rounded-xl text-center border border-dashed border-border">
                      <List className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">אין אפשרויות עדיין</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">הוסף אפשרויות לרשימת הבחירה או לחץ "הוספה מרובה" להוספת רשימה שלמה</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                      {(form.options as string[]).map((opt, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-2 bg-background border border-border/50 rounded-xl group hover:border-border transition-colors">
                          <div className="flex items-center gap-1 text-muted-foreground/40">
                            <button type="button" onClick={() => moveOption(i, i - 1)} disabled={i === 0} className="p-0.5 hover:text-foreground disabled:opacity-20"><ChevronUp className="w-3 h-3" /></button>
                            <button type="button" onClick={() => moveOption(i, i + 1)} disabled={i === (form.options as string[]).length - 1} className="p-0.5 hover:text-foreground disabled:opacity-20"><ChevronDown className="w-3 h-3" /></button>
                          </div>
                          <span className="text-xs text-muted-foreground/40 w-6 text-center">{i + 1}</span>
                          {editingOptionIndex === i ? (
                            <input autoFocus value={editingOptionValue} onChange={e => setEditingOptionValue(e.target.value)}
                              onBlur={() => { const newOpts = [...(form.options as string[])]; newOpts[i] = editingOptionValue || opt; setForm(f => ({ ...f, options: newOpts })); setEditingOptionIndex(null); }}
                              onKeyDown={e => { if (e.key === "Enter") { const newOpts = [...(form.options as string[])]; newOpts[i] = editingOptionValue || opt; setForm(f => ({ ...f, options: newOpts })); setEditingOptionIndex(null); } if (e.key === "Escape") setEditingOptionIndex(null); }}
                              className="flex-1 px-2 py-1 bg-primary/5 border border-primary/30 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/50" />
                          ) : (
                            <span className="flex-1 text-sm cursor-pointer hover:text-primary transition-colors" onClick={() => { setEditingOptionIndex(i); setEditingOptionValue(opt); }}>{opt}</span>
                          )}
                          <button type="button" onClick={() => setForm(f => ({ ...f, options: (f.options as string[]).filter((_, j) => j !== i) }))}
                            className="p-1 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 rounded-lg transition-all"><X className="w-3.5 h-3.5 text-destructive" /></button>
                        </div>
                      ))}
                    </div>
                  )}

                  {(form.options as string[]).length > 0 && (
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-xs text-muted-foreground">לחץ על ערך כדי לערוך, גרור חצים לסידור</span>
                      {isSuperAdmin && <button type="button" onClick={async () => { const ok = await globalConfirm("למחוק את כל האפשרויות?"); if (ok) setForm(f => ({ ...f, options: [] })); }}
                        className="text-xs text-destructive hover:text-destructive/80 transition-colors">נקה הכל</button>}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeSection === "behavior" && (
            <div className="space-y-5">
              <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl">
                <h4 className="text-sm font-semibold text-red-400 mb-3">חובה ואימות</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-center gap-3 p-3 bg-background rounded-lg border border-border/50 cursor-pointer hover:border-red-500/30 transition-colors">
                    <input type="checkbox" checked={form.isRequired} onChange={e => setForm(f => ({ ...f, isRequired: e.target.checked }))}
                      className="w-4 h-4 rounded border-border text-red-500 focus:ring-red-500" />
                    <div>
                      <span className="text-sm font-medium">שדה חובה</span>
                      <p className="text-[10px] text-muted-foreground">חייב למלא כדי לשמור</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 bg-background rounded-lg border border-border/50 cursor-pointer hover:border-blue-500/30 transition-colors">
                    <input type="checkbox" checked={form.isUnique} onChange={e => setForm(f => ({ ...f, isUnique: e.target.checked }))}
                      className="w-4 h-4 rounded border-border text-blue-500 focus:ring-blue-500" />
                    <div>
                      <span className="text-sm font-medium">ערך ייחודי</span>
                      <p className="text-[10px] text-muted-foreground">לא ניתן לכפול</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-xl">
                <h4 className="text-sm font-semibold text-green-400 mb-3">תצוגה</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { key: "showInList", label: "ברשימה", desc: "טבלת נתונים" },
                    { key: "showInForm", label: "בטופס", desc: "יצירה/עריכה" },
                    { key: "showInDetail", label: "בפרטים", desc: "דף פרטי רשומה" },
                  ].map(opt => (
                    <label key={opt.key} className="flex items-center gap-3 p-3 bg-background rounded-lg border border-border/50 cursor-pointer hover:border-green-500/30 transition-colors">
                      <input type="checkbox" checked={(form as any)[opt.key]} onChange={e => setForm(f => ({ ...f, [opt.key]: e.target.checked }))}
                        className="w-4 h-4 rounded border-border text-green-500 focus:ring-green-500" />
                      <div>
                        <span className="text-sm font-medium">{opt.label}</span>
                        <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                <h4 className="text-sm font-semibold text-blue-400 mb-3">יכולות חיפוש וסינון</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { key: "isSearchable", label: "ניתן לחיפוש" },
                    { key: "isSortable", label: "ניתן למיון" },
                    { key: "isFilterable", label: "ניתן לסינון" },
                  ].map(opt => (
                    <label key={opt.key} className="flex items-center gap-3 p-3 bg-background rounded-lg border border-border/50 cursor-pointer hover:border-blue-500/30 transition-colors">
                      <input type="checkbox" checked={(form as any)[opt.key]} onChange={e => setForm(f => ({ ...f, [opt.key]: e.target.checked }))}
                        className="w-4 h-4 rounded border-border text-blue-500 focus:ring-blue-500" />
                      <span className="text-sm font-medium">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-muted/5 border border-gray-500/20 rounded-xl">
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">הגבלות</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-center gap-3 p-3 bg-background rounded-lg border border-border/50 cursor-pointer">
                    <input type="checkbox" checked={form.isReadOnly} onChange={e => setForm(f => ({ ...f, isReadOnly: e.target.checked }))}
                      className="w-4 h-4 rounded border-border" />
                    <div>
                      <span className="text-sm font-medium">קריאה בלבד</span>
                      <p className="text-[10px] text-muted-foreground">לא ניתן לעריכה</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 bg-background rounded-lg border border-border/50 cursor-pointer">
                    <input type="checkbox" checked={form.isSystemField} onChange={e => setForm(f => ({ ...f, isSystemField: e.target.checked }))}
                      className="w-4 h-4 rounded border-border" />
                    <div>
                      <span className="text-sm font-medium">שדה מערכת</span>
                      <p className="text-[10px] text-muted-foreground">לא ניתן למחיקה</p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeSection === "formula" && (isFormulaType || form.isCalculated) && (
            <div className="space-y-4">
              <div className="p-4 bg-pink-500/5 border border-pink-500/20 rounded-xl">
                <h4 className="text-sm font-semibold text-pink-400 mb-1">בניית חישוב / נוסחה</h4>
                <p className="text-xs text-muted-foreground mb-4">הגדר ביטוי שיחושב אוטומטית. השתמש בשמות שדות בתוך סוגריים מסולסלים.</p>

                <label className="flex items-center gap-3 p-3 bg-background rounded-lg border border-border/50 cursor-pointer mb-4">
                  <input type="checkbox" checked={form.isCalculated} onChange={e => setForm(f => ({ ...f, isCalculated: e.target.checked }))}
                    className="w-4 h-4 rounded border-border text-pink-500 focus:ring-pink-500" />
                  <div>
                    <span className="text-sm font-medium">שדה מחושב</span>
                    <p className="text-[10px] text-muted-foreground">הערך מחושב אוטומטית ולא ניתן לעריכה ידנית</p>
                  </div>
                </label>

                <div>
                  <label className="block text-sm font-medium mb-1.5">ביטוי נוסחה</label>
                  <textarea value={form.formulaExpression} onChange={e => setForm(f => ({ ...f, formulaExpression: e.target.value }))} dir="ltr" rows={3}
                    placeholder="{price} * {quantity} * (1 + {vat_rate} / 100)"
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/50 font-mono resize-none" />
                </div>

                <div className="mt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">אופרטורים:</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {FORMULA_OPERATORS.map(op => (
                      <button key={op.value} type="button" onClick={() => setForm(f => ({ ...f, formulaExpression: f.formulaExpression + op.value }))}
                        className="w-8 h-8 bg-background border border-border rounded-lg text-sm font-bold hover:border-pink-500/50 hover:text-pink-400 transition-colors" title={op.desc}>
                        {op.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">פונקציות:</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {FORMULA_FUNCTIONS.map(fn => (
                      <button key={fn.label} type="button" onClick={() => setForm(f => ({ ...f, formulaExpression: f.formulaExpression + fn.template }))}
                        className="px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs font-mono hover:border-pink-500/50 hover:text-pink-400 transition-colors" title={fn.desc}>
                        {fn.label}()
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 p-3 bg-muted/30 rounded-lg border border-border/50">
                  <p className="text-xs font-medium text-muted-foreground mb-1">דוגמאות:</p>
                  <div className="space-y-1 text-xs font-mono text-muted-foreground">
                    <p className="cursor-pointer hover:text-pink-400 transition-colors" onClick={() => setForm(f => ({ ...f, formulaExpression: "{price} * {quantity}" }))}>{"• {price} * {quantity}"} — סכום שורה</p>
                    <p className="cursor-pointer hover:text-pink-400 transition-colors" onClick={() => setForm(f => ({ ...f, formulaExpression: "{subtotal} * {vat_rate} / 100" }))}>{"• {subtotal} * {vat_rate} / 100"} — חישוב מע"מ</p>
                    <p className="cursor-pointer hover:text-pink-400 transition-colors" onClick={() => setForm(f => ({ ...f, formulaExpression: "{total_amount} - {paid_amount}" }))}>{"• {total_amount} - {paid_amount}"} — יתרה</p>
                    <p className="cursor-pointer hover:text-pink-400 transition-colors" onClick={() => setForm(f => ({ ...f, formulaExpression: "sum(items.total)" }))}>{"• sum(items.total)"} — סיכום תת-טבלה</p>
                    <p className="cursor-pointer hover:text-pink-400 transition-colors" onClick={() => setForm(f => ({ ...f, formulaExpression: "round({price} * {quantity} * 1.17)" }))}>{"• round({price} * {quantity} * 1.17)"} — סה"כ כולל מע"מ מעוגל</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === "advanced" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Field Key</label>
                  <input value={form.fieldKey} onChange={e => setForm(f => ({ ...f, fieldKey: e.target.value }))} dir="ltr"
                    placeholder="customer_name" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">מפתח סקציה (Section Key)</label>
                  <input value={form.sectionKey} onChange={e => setForm(f => ({ ...f, sectionKey: e.target.value }))} dir="ltr"
                    placeholder="general" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">מפתח טאב (Tab Key)</label>
                  <input value={form.tabKey} onChange={e => setForm(f => ({ ...f, tabKey: e.target.value }))} dir="ltr"
                    placeholder="details" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">ערך ברירת מחדל</label>
                  <input value={form.defaultValue} onChange={e => setForm(f => ({ ...f, defaultValue: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">ערך מינימלי</label>
                  <input type="number" value={form.minValue} onChange={e => setForm(f => ({ ...f, minValue: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">ערך מקסימלי</label>
                  <input type="number" value={form.maxValue} onChange={e => setForm(f => ({ ...f, maxValue: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">אורך מקסימלי</label>
                  <input type="number" value={form.maxLength} onChange={e => setForm(f => ({ ...f, maxLength: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <label className="block text-sm font-semibold mb-3">תנאי תצוגה (Conditional Visibility)</label>
                <p className="text-xs text-muted-foreground mb-3">הצג/הסתר שדה זה בהתאם לערך של שדה אחר</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">שדה מתנה</label>
                    <input value={(form.displayRules as any).conditionField || ""} onChange={e => setForm(f => ({ ...f, displayRules: { ...f.displayRules, conditionField: e.target.value } }))} dir="ltr"
                      placeholder="field_slug" className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">אופרטור</label>
                    <select value={(form.displayRules as any).conditionOperator || "equals"} onChange={e => setForm(f => ({ ...f, displayRules: { ...f.displayRules, conditionOperator: e.target.value } }))}
                      className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/50">
                      <option value="equals">שווה ל</option>
                      <option value="not_equals">לא שווה ל</option>
                      <option value="contains">מכיל</option>
                      <option value="not_empty">לא ריק</option>
                      <option value="is_empty">ריק</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">ערך</label>
                    <input value={(form.displayRules as any).conditionValue || ""} onChange={e => setForm(f => ({ ...f, displayRules: { ...f.displayRules, conditionValue: e.target.value } }))}
                      placeholder="ערך" className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  </div>
                </div>
                {(form.displayRules as any).conditionField && (
                  <button type="button" onClick={() => setForm(f => ({ ...f, displayRules: {} }))} className="mt-2 text-xs text-destructive hover:underline">
                    הסר תנאי תצוגה
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 px-6 py-4 border-t border-border">
          <button onClick={submitForm} disabled={!form.name || !form.slug || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : field ? "עדכן שדה" : "הוסף שדה"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StatusFormModal({ onClose, onSubmit, isLoading }: { onClose: () => void; onSubmit: (data: any) => void; isLoading: boolean }) {
  const [form, setForm] = useState({ name: "", slug: "", color: "gray", isDefault: false, isFinal: false });
  const autoSlug = (name: string) => name.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">סטטוס חדש</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">שם הסטטוס *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: autoSlug(e.target.value) }))}
              placeholder="למשל: פעיל" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
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
            {isLoading ? "שומר..." : "הוסף סטטוס"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

const FORM_TYPE_LABELS: Record<string, string> = {
  create: "יצירה",
  edit: "עריכה",
  quick_create: "יצירה מהירה",
  wizard: "אשף",
};

function FormsTab({ forms, onAdd, onEdit, onDelete, onEditSections }: { forms: any[]; onAdd: () => void; onEdit: (f: any) => void; onDelete?: (id: number) => void; onEditSections: (f: any) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">טפסים ({forms.length})</h2>
        <button onClick={onAdd} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" />
          טופס חדש
        </button>
      </div>
      {forms.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-8 text-center">
          <ClipboardList className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">אין טפסים — הוסף טפסים כדי להגדיר את ממשק הזנת הנתונים</p>
          <button onClick={onAdd} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium"><Plus className="w-4 h-4" />הוסף טופס</button>
        </div>
      ) : (
        <div className="space-y-3">
          {forms.map(form => {
            const sectionCount = Array.isArray(form.sections) ? form.sections.length : 0;
            const fieldCount = Array.isArray(form.sections) ? form.sections.reduce((sum: number, s: any) => sum + (Array.isArray(s.fields) ? s.fields.length : 0), 0) : 0;
            return (
              <div key={form.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                      <ClipboardList className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{form.name}</p>
                        {form.isDefault && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-yellow-500/10 text-yellow-500 rounded-md text-xs">
                            <Star className="w-3 h-3" />
                            ברירת מחדל
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>{form.slug}</span>
                        <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded-md">{FORM_TYPE_LABELS[form.formType] || form.formType}</span>
                        <span>{sectionCount} סקציות</span>
                        <span>{fieldCount} שדות</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => onEditSections(form)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכת סקציות">
                      <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    <button onClick={() => onEdit(form)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכת טופס">
                      <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    {onDelete && <button onClick={() => onDelete(form.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg" title="מחיקת טופס">
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FormDefinitionModal({ form: existingForm, onClose, onSubmit, isLoading }: { form?: any; onClose: () => void; onSubmit: (data: any) => void; isLoading: boolean }) {
  const [form, setForm] = useState({
    name: existingForm?.name || "",
    slug: existingForm?.slug || "",
    formType: existingForm?.formType || "create",
    isDefault: existingForm?.isDefault || false,
  });
  const autoSlug = (name: string) => name.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">{existingForm ? "עריכת טופס" : "טופס חדש"}</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">שם הטופס *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, ...(!existingForm ? { slug: autoSlug(e.target.value) } : {}) }))}
              placeholder="למשל: טופס יצירת לקוח" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Slug *</label>
            <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} dir="ltr"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">סוג טופס *</label>
            <select value={form.formType} onChange={e => setForm(f => ({ ...f, formType: e.target.value }))}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              <option value="create">יצירה</option>
              <option value="edit">עריכה</option>
              <option value="quick_create">יצירה מהירה</option>
              <option value="wizard">אשף</option>
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isDefault} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
            <span className="text-sm">טופס ברירת מחדל</span>
          </label>
        </div>
        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={() => onSubmit(form)} disabled={!form.name || !form.slug || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : existingForm ? "עדכן טופס" : "הוסף טופס"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

interface FormSection {
  name: string;
  fields: string[];
  collapsed?: boolean;
}

function SectionEditorModal({ form, fields, onClose, onSave, isLoading }: { form: any; fields: any[]; onClose: () => void; onSave: (sections: FormSection[]) => void; isLoading: boolean }) {
  const [sections, setSections] = useState<FormSection[]>(() => {
    const existing = Array.isArray(form.sections) ? form.sections : [];
    return existing.length > 0 ? existing.map((s: any) => ({ name: s.name || "", fields: Array.isArray(s.fields) ? s.fields : [], collapsed: false })) : [{ name: "כללי", fields: [], collapsed: false }];
  });
  const [newSectionName, setNewSectionName] = useState("");

  const assignedFieldSlugs = new Set(sections.flatMap(s => s.fields));
  const unassignedFields = fields.filter(f => !assignedFieldSlugs.has(f.slug));

  const addSection = () => {
    if (!newSectionName.trim()) return;
    setSections(s => [...s, { name: newSectionName.trim(), fields: [], collapsed: false }]);
    setNewSectionName("");
  };

  const removeSection = (idx: number) => {
    setSections(s => s.filter((_, i) => i !== idx));
  };

  const addFieldToSection = (sectionIdx: number, fieldSlug: string) => {
    setSections(s => s.map((sec, i) => i === sectionIdx ? { ...sec, fields: [...sec.fields, fieldSlug] } : sec));
  };

  const removeFieldFromSection = (sectionIdx: number, fieldSlug: string) => {
    setSections(s => s.map((sec, i) => i === sectionIdx ? { ...sec, fields: sec.fields.filter(f => f !== fieldSlug) } : sec));
  };

  const moveFieldInSection = (sectionIdx: number, fieldIdx: number, direction: -1 | 1) => {
    setSections(s => s.map((sec, i) => {
      if (i !== sectionIdx) return sec;
      const newFields = [...sec.fields];
      const targetIdx = fieldIdx + direction;
      if (targetIdx < 0 || targetIdx >= newFields.length) return sec;
      [newFields[fieldIdx], newFields[targetIdx]] = [newFields[targetIdx], newFields[fieldIdx]];
      return { ...sec, fields: newFields };
    }));
  };

  const moveSection = (idx: number, direction: -1 | 1) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= sections.length) return;
    setSections(s => {
      const newSections = [...s];
      [newSections[idx], newSections[targetIdx]] = [newSections[targetIdx], newSections[idx]];
      return newSections;
    });
  };

  const toggleCollapse = (idx: number) => {
    setSections(s => s.map((sec, i) => i === idx ? { ...sec, collapsed: !sec.collapsed } : sec));
  };

  const getFieldBySlug = (slug: string) => fields.find(f => f.slug === slug);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-2">עריכת סקציות — {form.name}</h2>
        <p className="text-sm text-muted-foreground mb-6">סדר את שדות הישות לסקציות בטופס</p>

        <div className="space-y-4">
          {sections.map((section, sIdx) => (
            <div key={sIdx} className="border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleCollapse(sIdx)} className="p-0.5 hover:bg-muted rounded">
                    {section.collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  </button>
                  <input value={section.name} onChange={e => setSections(s => s.map((sec, i) => i === sIdx ? { ...sec, name: e.target.value } : sec))}
                    className="bg-transparent font-medium text-sm focus:outline-none focus:border-b focus:border-primary" />
                  <span className="text-xs text-muted-foreground">({section.fields.length} שדות)</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => moveSection(sIdx, -1)} disabled={sIdx === 0} className="p-1 hover:bg-muted rounded disabled:opacity-30">
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => moveSection(sIdx, 1)} disabled={sIdx === sections.length - 1} className="p-1 hover:bg-muted rounded disabled:opacity-30">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  {sections.length > 1 && (
                    <button onClick={() => removeSection(sIdx)} className="p-1 hover:bg-destructive/10 rounded">
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </button>
                  )}
                </div>
              </div>

              {!section.collapsed && (
                <div className="p-3 space-y-2">
                  {section.fields.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">אין שדות בסקציה — בחר שדות מהרשימה למטה</p>
                  )}
                  {section.fields.map((fieldSlug, fIdx) => {
                    const field = getFieldBySlug(fieldSlug);
                    return (
                      <div key={fieldSlug} className="flex items-center justify-between px-3 py-2 bg-background border border-border/50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50" />
                          <span className="text-sm">{field?.name || fieldSlug}</span>
                          {field && <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">{FIELD_TYPE_MAP[field.fieldType]?.label || field.fieldType}</span>}
                        </div>
                        <div className="flex items-center gap-0.5">
                          <button onClick={() => moveFieldInSection(sIdx, fIdx, -1)} disabled={fIdx === 0} className="p-1 hover:bg-muted rounded disabled:opacity-30">
                            <ChevronUp className="w-3 h-3" />
                          </button>
                          <button onClick={() => moveFieldInSection(sIdx, fIdx, 1)} disabled={fIdx === section.fields.length - 1} className="p-1 hover:bg-muted rounded disabled:opacity-30">
                            <ChevronDown className="w-3 h-3" />
                          </button>
                          <button onClick={() => removeFieldFromSection(sIdx, fieldSlug)} className="p-1 hover:bg-destructive/10 rounded">
                            <X className="w-3 h-3 text-destructive" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {unassignedFields.length > 0 && (
                    <div className="pt-2 border-t border-border/30">
                      <select onChange={e => { if (e.target.value) { addFieldToSection(sIdx, e.target.value); e.target.value = ""; } }}
                        className="w-full px-3 py-2 bg-background border border-dashed border-border rounded-lg text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                        defaultValue="">
                        <option value="">+ הוסף שדה לסקציה...</option>
                        {unassignedFields.map(f => (
                          <option key={f.slug} value={f.slug}>{f.name} ({FIELD_TYPE_MAP[f.fieldType]?.label || f.fieldType})</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 mt-4">
          <input value={newSectionName} onChange={e => setNewSectionName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addSection(); }}
            placeholder="שם סקציה חדשה..." className="flex-1 px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          <button onClick={addSection} disabled={!newSectionName.trim()}
            className="px-3 py-2 bg-muted rounded-xl text-sm font-medium hover:bg-muted/80 transition-colors disabled:opacity-50">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {unassignedFields.length > 0 && (
          <div className="mt-4 p-3 bg-muted/30 rounded-xl">
            <p className="text-xs font-medium text-muted-foreground mb-2">שדות לא משויכים ({unassignedFields.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {unassignedFields.map(f => (
                <span key={f.slug} className="px-2 py-1 bg-background border border-border/50 rounded-lg text-xs text-muted-foreground">{f.name}</span>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={() => onSave(sections.map(({ collapsed, ...s }) => s))} disabled={isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : "שמור סקציות"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ViewsTab({ views, onAdd, onEdit, onDelete, onEditColumns }: { views: any[]; onAdd: () => void; onEdit: (v: any) => void; onDelete?: (id: number) => void; onEditColumns: (v: any) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">תצוגות ({views.length})</h2>
        <button onClick={onAdd} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" />
          תצוגה חדשה
        </button>
      </div>
      {views.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-8 text-center">
          <Table2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">אין תצוגות — הוסף תצוגות כדי להציג את הנתונים בדרכים שונות</p>
          <button onClick={onAdd} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium"><Plus className="w-4 h-4" />הוסף תצוגה</button>
        </div>
      ) : (
        <div className="space-y-3">
          {views.map(view => {
            const colCount = Array.isArray(view.columns) ? view.columns.length : 0;
            const filterCount = Array.isArray(view.filters) ? view.filters.length : 0;
            const sortCount = Array.isArray(view.sorting) ? view.sorting.length : 0;
            return (
              <div key={view.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                      <Table2 className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{view.name}</p>
                        {view.isDefault && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-yellow-500/10 text-yellow-500 rounded-md text-xs">
                            <Star className="w-3 h-3" />
                            ברירת מחדל
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>{view.slug}</span>
                        <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded-md">{view.viewType}</span>
                        <span>{colCount} עמודות</span>
                        {filterCount > 0 && <span>{filterCount} מסננים</span>}
                        {sortCount > 0 && <span>{sortCount} מיונים</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => onEditColumns(view)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכת עמודות ומסננים">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    <button onClick={() => onEdit(view)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכת תצוגה">
                      <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    {onDelete && <button onClick={() => onDelete(view.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg" title="מחיקת תצוגה">
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const VIEW_TYPE_OPTIONS = [
  { key: "table", label: "טבלה", icon: Table2, color: "bg-blue-500/10 text-blue-400" },
  { key: "cards", label: "כרטיסים", icon: LayoutDashboard, color: "bg-purple-500/10 text-purple-400" },
  { key: "kanban", label: "קנבן", icon: Layers, color: "bg-green-500/10 text-green-400" },
  { key: "calendar", label: "לוח שנה", icon: Calendar, color: "bg-amber-500/10 text-amber-400" },
  { key: "gallery", label: "גלריה", icon: Eye, color: "bg-pink-500/10 text-pink-400" },
];

function ViewDefinitionModal({ view, fields, onClose, onSubmit, isLoading }: { view?: any; fields: any[]; onClose: () => void; onSubmit: (data: any) => void; isLoading: boolean }) {
  const [form, setForm] = useState({
    name: view?.name || "",
    slug: view?.slug || "",
    viewType: view?.viewType || "table",
    isDefault: view?.isDefault || false,
    settings: view?.settings || {},
  });
  const autoSlug = (name: string) => name.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">{view ? "עריכת תצוגה" : "תצוגה חדשה"}</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">שם התצוגה *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, ...(!view ? { slug: autoSlug(e.target.value) } : {}) }))}
                placeholder="למשל: כל הלקוחות" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Slug *</label>
              <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} dir="ltr"
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">סוג תצוגה</label>
            <div className="grid grid-cols-5 gap-2">
              {VIEW_TYPE_OPTIONS.map(vt => {
                const Icon = vt.icon;
                return (
                  <button key={vt.key} type="button" onClick={() => setForm(f => ({ ...f, viewType: vt.key }))}
                    className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl text-xs font-medium transition-all ${form.viewType === vt.key ? "bg-primary text-primary-foreground ring-2 ring-primary/30" : "bg-background border border-border hover:border-primary/30"}`}>
                    <Icon className="w-5 h-5" />
                    {vt.label}
                  </button>
                );
              })}
            </div>
          </div>
          {form.viewType === "kanban" && (
            <div>
              <label className="block text-sm font-medium mb-1.5">שדה קיבוץ (קנבן)</label>
              <select value={form.settings.kanbanField || ""} onChange={e => setForm(f => ({ ...f, settings: { ...f.settings, kanbanField: e.target.value } }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">בחר שדה...</option>
                {fields.filter(f => ["single_select", "status", "category"].includes(f.fieldType)).map(f => (
                  <option key={f.slug} value={f.slug}>{f.name}</option>
                ))}
              </select>
            </div>
          )}
          {form.viewType === "calendar" && (
            <div>
              <label className="block text-sm font-medium mb-1.5">שדה תאריך (לוח שנה)</label>
              <select value={form.settings.calendarDateField || ""} onChange={e => setForm(f => ({ ...f, settings: { ...f.settings, calendarDateField: e.target.value } }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">בחר שדה תאריך...</option>
                {fields.filter(f => ["date", "datetime"].includes(f.fieldType)).map(f => (
                  <option key={f.slug} value={f.slug}>{f.name}</option>
                ))}
              </select>
            </div>
          )}
          {form.viewType === "cards" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">שדה כותרת</label>
                <select value={form.settings.cardTitleField || ""} onChange={e => setForm(f => ({ ...f, settings: { ...f.settings, cardTitleField: e.target.value } }))}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">אוטומטי</option>
                  {fields.map(f => <option key={f.slug} value={f.slug}>{f.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">שדה תמונה</label>
                <select value={form.settings.cardImageField || ""} onChange={e => setForm(f => ({ ...f, settings: { ...f.settings, cardImageField: e.target.value } }))}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">ללא</option>
                  {fields.filter(f => ["image", "file", "url"].includes(f.fieldType)).map(f => (
                    <option key={f.slug} value={f.slug}>{f.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isDefault} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
            <span className="text-sm">תצוגת ברירת מחדל</span>
          </label>
        </div>
        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={() => onSubmit(form)} disabled={!form.name || !form.slug || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : view ? "עדכן תצוגה" : "הוסף תצוגה"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

interface ViewColumnDef {
  fieldSlug: string;
  width?: string;
  visible: boolean;
}

interface ViewFilter {
  fieldSlug: string;
  operator: string;
  value: string;
}

interface ViewSort {
  fieldSlug: string;
  direction: "asc" | "desc";
}

function ViewColumnsEditor({ view, fields, onClose, onSave, isLoading }: { view: any; fields: any[]; onClose: () => void; onSave: (data: any) => void; isLoading: boolean }) {
  const [columns, setColumns] = useState<ViewColumnDef[]>(() => {
    const existing = Array.isArray(view.columns) && view.columns.length > 0
      ? view.columns
      : fields.filter(f => f.showInList).map(f => ({ fieldSlug: f.slug, visible: true }));
    return existing;
  });
  const [filters, setFilters] = useState<ViewFilter[]>(() => Array.isArray(view.filters) ? view.filters : []);
  const [sorting, setSorting] = useState<ViewSort[]>(() => Array.isArray(view.sorting) ? view.sorting : []);
  const [grouping, setGrouping] = useState<any>(() => view.grouping && typeof view.grouping === "object" ? view.grouping : {});
  const [activeSection, setActiveSection] = useState<"columns" | "filters" | "sorting" | "grouping">("columns");

  const columnSlugs = new Set(columns.map(c => c.fieldSlug));
  const availableFields = fields.filter(f => !columnSlugs.has(f.slug));

  const getFieldBySlug = (slug: string) => fields.find(f => f.slug === slug);

  const addColumn = (slug: string) => {
    setColumns(c => [...c, { fieldSlug: slug, visible: true }]);
  };

  const removeColumn = (slug: string) => {
    setColumns(c => c.filter(col => col.fieldSlug !== slug));
  };

  const toggleColumnVisibility = (idx: number) => {
    setColumns(c => c.map((col, i) => i === idx ? { ...col, visible: !col.visible } : col));
  };

  const moveColumn = (idx: number, direction: -1 | 1) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= columns.length) return;
    setColumns(c => {
      const newCols = [...c];
      [newCols[idx], newCols[targetIdx]] = [newCols[targetIdx], newCols[idx]];
      return newCols;
    });
  };

  const addFilter = () => {
    if (fields.length === 0) return;
    setFilters(f => [...f, { fieldSlug: fields[0].slug, operator: "equals", value: "" }]);
  };

  const addSort = () => {
    if (fields.length === 0) return;
    setSorting(s => [...s, { fieldSlug: fields[0].slug, direction: "asc" }]);
  };

  const sectionTabs = [
    { key: "columns" as const, label: "עמודות", count: columns.length },
    { key: "filters" as const, label: "מסננים", count: filters.length },
    { key: "sorting" as const, label: "מיון", count: sorting.length },
    { key: "grouping" as const, label: "קיבוץ", count: grouping.fieldSlug ? 1 : 0 },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-2">הגדרת תצוגה — {view.name}</h2>
        <p className="text-sm text-muted-foreground mb-4">בחר עמודות, מסננים, מיון וקיבוץ</p>

        <div className="flex gap-1 p-1 bg-muted/30 rounded-xl mb-4">
          {sectionTabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveSection(tab.key)}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${activeSection === tab.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {activeSection === "columns" && (
          <div className="space-y-2">
            {columns.map((col, idx) => {
              const field = getFieldBySlug(col.fieldSlug);
              return (
                <div key={col.fieldSlug} className="flex items-center justify-between px-3 py-2 bg-background border border-border/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50" />
                    <span className="text-sm">{field?.name || col.fieldSlug}</span>
                    {field && <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">{FIELD_TYPE_MAP[field.fieldType]?.label || field.fieldType}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => toggleColumnVisibility(idx)} className={`p-1 rounded ${col.visible ? "text-green-400" : "text-muted-foreground"}`}>
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => moveColumn(idx, -1)} disabled={idx === 0} className="p-1 hover:bg-muted rounded disabled:opacity-30">
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button onClick={() => moveColumn(idx, 1)} disabled={idx === columns.length - 1} className="p-1 hover:bg-muted rounded disabled:opacity-30">
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    <button onClick={() => removeColumn(col.fieldSlug)} className="p-1 hover:bg-destructive/10 rounded">
                      <X className="w-3 h-3 text-destructive" />
                    </button>
                  </div>
                </div>
              );
            })}
            {availableFields.length > 0 && (
              <select onChange={e => { if (e.target.value) { addColumn(e.target.value); e.target.value = ""; } }}
                className="w-full px-3 py-2 bg-background border border-dashed border-border rounded-lg text-xs text-muted-foreground" defaultValue="">
                <option value="">+ הוסף עמודה...</option>
                {availableFields.map(f => (
                  <option key={f.slug} value={f.slug}>{f.name}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {activeSection === "filters" && (
          <div className="space-y-3">
            {filters.map((filter, idx) => (
              <div key={idx} className="flex items-center gap-2 p-3 bg-background border border-border/50 rounded-lg">
                <select value={filter.fieldSlug} onChange={e => setFilters(f => f.map((fi, i) => i === idx ? { ...fi, fieldSlug: e.target.value } : fi))}
                  className="flex-1 px-2 py-1.5 bg-card border border-border rounded-lg text-xs">
                  {fields.map(f => <option key={f.slug} value={f.slug}>{f.name}</option>)}
                </select>
                <select value={filter.operator} onChange={e => setFilters(f => f.map((fi, i) => i === idx ? { ...fi, operator: e.target.value } : fi))}
                  className="px-2 py-1.5 bg-card border border-border rounded-lg text-xs">
                  <option value="equals">שווה ל</option>
                  <option value="not_equals">שונה מ</option>
                  <option value="contains">מכיל</option>
                  <option value="not_contains">לא מכיל</option>
                  <option value="starts_with">מתחיל ב</option>
                  <option value="gt">גדול מ</option>
                  <option value="lt">קטן מ</option>
                  <option value="is_empty">ריק</option>
                  <option value="is_not_empty">לא ריק</option>
                </select>
                <input value={filter.value} onChange={e => setFilters(f => f.map((fi, i) => i === idx ? { ...fi, value: e.target.value } : fi))}
                  placeholder="ערך..." className="flex-1 px-2 py-1.5 bg-card border border-border rounded-lg text-xs" />
                <button onClick={() => setFilters(f => f.filter((_, i) => i !== idx))} className="p-1 hover:bg-destructive/10 rounded">
                  <X className="w-3.5 h-3.5 text-destructive" />
                </button>
              </div>
            ))}
            <button onClick={addFilter} className="w-full px-3 py-2 bg-background border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors">
              + הוסף מסנן
            </button>
          </div>
        )}

        {activeSection === "sorting" && (
          <div className="space-y-3">
            {sorting.map((sort, idx) => (
              <div key={idx} className="flex items-center gap-2 p-3 bg-background border border-border/50 rounded-lg">
                <select value={sort.fieldSlug} onChange={e => setSorting(s => s.map((si, i) => i === idx ? { ...si, fieldSlug: e.target.value } : si))}
                  className="flex-1 px-2 py-1.5 bg-card border border-border rounded-lg text-xs">
                  {fields.map(f => <option key={f.slug} value={f.slug}>{f.name}</option>)}
                </select>
                <select value={sort.direction} onChange={e => setSorting(s => s.map((si, i) => i === idx ? { ...si, direction: e.target.value as "asc" | "desc" } : si))}
                  className="px-2 py-1.5 bg-card border border-border rounded-lg text-xs">
                  <option value="asc">עולה</option>
                  <option value="desc">יורד</option>
                </select>
                <button onClick={() => setSorting(s => s.filter((_, i) => i !== idx))} className="p-1 hover:bg-destructive/10 rounded">
                  <X className="w-3.5 h-3.5 text-destructive" />
                </button>
              </div>
            ))}
            <button onClick={addSort} className="w-full px-3 py-2 bg-background border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors">
              + הוסף מיון
            </button>
          </div>
        )}

        {activeSection === "grouping" && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">קיבוץ לפי שדה</label>
              <select value={grouping.fieldSlug || ""} onChange={e => setGrouping((g: any) => ({ ...g, fieldSlug: e.target.value || undefined }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm">
                <option value="">ללא קיבוץ</option>
                {fields.map(f => <option key={f.slug} value={f.slug}>{f.name}</option>)}
              </select>
            </div>
            {grouping.fieldSlug && (
              <div>
                <label className="block text-sm font-medium mb-1.5">כיוון קיבוץ</label>
                <select value={grouping.direction || "asc"} onChange={e => setGrouping((g: any) => ({ ...g, direction: e.target.value }))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm">
                  <option value="asc">עולה</option>
                  <option value="desc">יורד</option>
                </select>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={() => onSave({ columns, filters, sorting, grouping })} disabled={isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : "שמור תצוגה"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function DetailsTab({ details, onAdd, onEdit, onDelete, onEditSections }: { details: any[]; onAdd: () => void; onEdit: (d: any) => void; onDelete?: (id: number) => void; onEditSections: (d: any) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">דפי פרטים ({details.length})</h2>
        <button onClick={onAdd} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" />
          דף פרטים חדש
        </button>
      </div>
      {details.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-8 text-center">
          <LayoutDashboard className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">אין הגדרות דפי פרטים — הוסף הגדרה כדי לקבוע את מראה דף הפרטים של רשומה</p>
          <button onClick={onAdd} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium"><Plus className="w-4 h-4" />הוסף דף פרטים</button>
        </div>
      ) : (
        <div className="space-y-3">
          {details.map(detail => {
            const sectionCount = Array.isArray(detail.sections) ? detail.sections.length : 0;
            const fieldCount = Array.isArray(detail.sections) ? detail.sections.reduce((sum: number, s: any) => sum + (Array.isArray(s.fields) ? s.fields.length : 0), 0) : 0;
            return (
              <div key={detail.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                      <LayoutDashboard className="w-5 h-5 text-orange-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{detail.name}</p>
                        {detail.isDefault && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-yellow-500/10 text-yellow-500 rounded-md text-xs">
                            <Star className="w-3 h-3" />
                            ברירת מחדל
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>{detail.slug}</span>
                        <span>{sectionCount} סקציות</span>
                        <span>{fieldCount} שדות</span>
                        {detail.showRelatedRecords && <span className="text-green-400">מציג רשומות קשורות</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => onEditSections(detail)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכת סקציות">
                      <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    <button onClick={() => onEdit(detail)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכת הגדרה">
                      <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    {onDelete && <button onClick={() => onDelete(detail.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg" title="מחיקת הגדרה">
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetailDefinitionModal({ detail, onClose, onSubmit, isLoading }: { detail?: any; onClose: () => void; onSubmit: (data: any) => void; isLoading: boolean }) {
  const [form, setForm] = useState({
    name: detail?.name || "",
    slug: detail?.slug || "",
    isDefault: detail?.isDefault || false,
    showRelatedRecords: detail?.showRelatedRecords ?? true,
    headerFields: detail?.headerFields || [],
    tabs: detail?.tabs || [],
    relatedLists: detail?.relatedLists || [],
    actionBar: detail?.actionBar || [],
  });
  const [activeSection, setActiveSection] = useState<"basic" | "header" | "tabs" | "related" | "actions">("basic");
  const [newHeaderField, setNewHeaderField] = useState("");
  const [newTabName, setNewTabName] = useState("");
  const [newRelatedList, setNewRelatedList] = useState("");
  const [newActionButton, setNewActionButton] = useState("");
  const autoSlug = (name: string) => name.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");

  const sections = [
    { key: "basic" as const, label: "בסיסי" },
    { key: "header" as const, label: `כותרת (${form.headerFields.length})` },
    { key: "tabs" as const, label: `טאבים (${form.tabs.length})` },
    { key: "related" as const, label: `רשומות קשורות (${form.relatedLists.length})` },
    { key: "actions" as const, label: `סרגל פעולות (${form.actionBar.length})` },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-xl font-bold">{detail ? "עריכת דף פרטים" : "דף פרטים חדש"}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex items-center gap-1 px-6 py-2 border-b border-border overflow-x-auto bg-muted/20">
          {sections.map(sec => (
            <button key={sec.key} onClick={() => setActiveSection(sec.key)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${activeSection === sec.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
              {sec.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeSection === "basic" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">שם *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, ...(!detail ? { slug: autoSlug(e.target.value) } : {}) }))}
                  placeholder="למשל: דף פרטי לקוח" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Slug *</label>
                <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} dir="ltr"
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isDefault} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                <span className="text-sm">דף ברירת מחדל</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.showRelatedRecords} onChange={e => setForm(f => ({ ...f, showRelatedRecords: e.target.checked }))}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                <span className="text-sm">הצג רשומות קשורות</span>
              </label>
            </div>
          )}

          {activeSection === "header" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">שדות שיוצגו בכותרת דף הפרטים (Header Fields)</p>
              {form.headerFields.length > 0 && (
                <div className="space-y-2">
                  {form.headerFields.map((field: string, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-background border border-border/50 rounded-lg">
                      <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50" />
                      <span className="text-sm flex-1">{field}</span>
                      <div className="flex gap-0.5">
                        <button onClick={() => { if (idx > 0) { const arr = [...form.headerFields]; [arr[idx-1], arr[idx]] = [arr[idx], arr[idx-1]]; setForm(f => ({ ...f, headerFields: arr })); } }}
                          disabled={idx === 0} className="p-1 hover:bg-muted rounded disabled:opacity-30"><ChevronUp className="w-3 h-3" /></button>
                        <button onClick={() => { if (idx < form.headerFields.length - 1) { const arr = [...form.headerFields]; [arr[idx], arr[idx+1]] = [arr[idx+1], arr[idx]]; setForm(f => ({ ...f, headerFields: arr })); } }}
                          disabled={idx === form.headerFields.length - 1} className="p-1 hover:bg-muted rounded disabled:opacity-30"><ChevronDown className="w-3 h-3" /></button>
                        <button onClick={() => setForm(f => ({ ...f, headerFields: f.headerFields.filter((_: any, i: number) => i !== idx) }))}
                          className="p-1 hover:bg-destructive/10 rounded"><X className="w-3 h-3 text-destructive" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input value={newHeaderField} onChange={e => setNewHeaderField(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newHeaderField.trim()) { setForm(f => ({ ...f, headerFields: [...f.headerFields, newHeaderField.trim()] })); setNewHeaderField(""); } }}
                  placeholder="שם שדה (slug)..." className="flex-1 px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                <button onClick={() => { if (newHeaderField.trim()) { setForm(f => ({ ...f, headerFields: [...f.headerFields, newHeaderField.trim()] })); setNewHeaderField(""); } }}
                  disabled={!newHeaderField.trim()} className="px-3 py-2 bg-muted rounded-xl text-sm font-medium hover:bg-muted/80 disabled:opacity-50"><Plus className="w-4 h-4" /></button>
              </div>
            </div>
          )}

          {activeSection === "tabs" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">טאבים בדף הפרטים — כל טאב מכיל קבוצה של סקציות</p>
              {form.tabs.length > 0 && (
                <div className="space-y-2">
                  {form.tabs.map((tab: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-background border border-border/50 rounded-lg">
                      <span className="text-sm flex-1">{typeof tab === "string" ? tab : tab.name || tab.label}</span>
                      <button onClick={() => setForm(f => ({ ...f, tabs: f.tabs.filter((_: any, i: number) => i !== idx) }))}
                        className="p-1 hover:bg-destructive/10 rounded"><X className="w-3 h-3 text-destructive" /></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input value={newTabName} onChange={e => setNewTabName(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newTabName.trim()) { setForm(f => ({ ...f, tabs: [...f.tabs, { name: newTabName.trim(), slug: newTabName.trim().toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-") }] })); setNewTabName(""); } }}
                  placeholder="שם טאב..." className="flex-1 px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                <button onClick={() => { if (newTabName.trim()) { setForm(f => ({ ...f, tabs: [...f.tabs, { name: newTabName.trim(), slug: newTabName.trim().toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-") }] })); setNewTabName(""); } }}
                  disabled={!newTabName.trim()} className="px-3 py-2 bg-muted rounded-xl text-sm font-medium hover:bg-muted/80 disabled:opacity-50"><Plus className="w-4 h-4" /></button>
              </div>
            </div>
          )}

          {activeSection === "related" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">רשימות רשומות קשורות שיוצגו בדף הפרטים</p>
              {form.relatedLists.length > 0 && (
                <div className="space-y-2">
                  {form.relatedLists.map((rel: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-background border border-border/50 rounded-lg">
                      <span className="text-sm flex-1">{typeof rel === "string" ? rel : rel.label || rel.name}</span>
                      <button onClick={() => setForm(f => ({ ...f, relatedLists: f.relatedLists.filter((_: any, i: number) => i !== idx) }))}
                        className="p-1 hover:bg-destructive/10 rounded"><X className="w-3 h-3 text-destructive" /></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input value={newRelatedList} onChange={e => setNewRelatedList(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newRelatedList.trim()) { setForm(f => ({ ...f, relatedLists: [...f.relatedLists, { label: newRelatedList.trim(), slug: newRelatedList.trim().toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-") }] })); setNewRelatedList(""); } }}
                  placeholder="שם רשימה קשורה..." className="flex-1 px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                <button onClick={() => { if (newRelatedList.trim()) { setForm(f => ({ ...f, relatedLists: [...f.relatedLists, { label: newRelatedList.trim(), slug: newRelatedList.trim().toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-") }] })); setNewRelatedList(""); } }}
                  disabled={!newRelatedList.trim()} className="px-3 py-2 bg-muted rounded-xl text-sm font-medium hover:bg-muted/80 disabled:opacity-50"><Plus className="w-4 h-4" /></button>
              </div>
            </div>
          )}

          {activeSection === "actions" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">כפתורי פעולה בסרגל העליון של דף הפרטים (Action Bar)</p>
              {form.actionBar.length > 0 && (
                <div className="space-y-2">
                  {form.actionBar.map((action: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-background border border-border/50 rounded-lg">
                      <span className="text-sm flex-1">{typeof action === "string" ? action : action.label || action.name}</span>
                      <button onClick={() => setForm(f => ({ ...f, actionBar: f.actionBar.filter((_: any, i: number) => i !== idx) }))}
                        className="p-1 hover:bg-destructive/10 rounded"><X className="w-3 h-3 text-destructive" /></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input value={newActionButton} onChange={e => setNewActionButton(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newActionButton.trim()) { setForm(f => ({ ...f, actionBar: [...f.actionBar, { label: newActionButton.trim(), slug: newActionButton.trim().toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-") }] })); setNewActionButton(""); } }}
                  placeholder="שם כפתור פעולה..." className="flex-1 px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                <button onClick={() => { if (newActionButton.trim()) { setForm(f => ({ ...f, actionBar: [...f.actionBar, { label: newActionButton.trim(), slug: newActionButton.trim().toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-") }] })); setNewActionButton(""); } }}
                  disabled={!newActionButton.trim()} className="px-3 py-2 bg-muted rounded-xl text-sm font-medium hover:bg-muted/80 disabled:opacity-50"><Plus className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 px-6 py-4 border-t border-border">
          <button onClick={() => onSubmit(form)} disabled={!form.name || !form.slug || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : detail ? "עדכן" : "הוסף"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function DetailSectionEditorModal({ detail, fields, onClose, onSave, isLoading }: { detail: any; fields: any[]; onClose: () => void; onSave: (sections: FormSection[]) => void; isLoading: boolean }) {
  const [sections, setSections] = useState<FormSection[]>(() => {
    const existing = Array.isArray(detail.sections) ? detail.sections : [];
    return existing.length > 0 ? existing.map((s: any) => ({ name: s.name || "", fields: Array.isArray(s.fields) ? s.fields : [], collapsed: false })) : [{ name: "כללי", fields: [], collapsed: false }];
  });
  const [newSectionName, setNewSectionName] = useState("");

  const assignedFieldSlugs = new Set(sections.flatMap(s => s.fields));
  const unassignedFields = fields.filter(f => !assignedFieldSlugs.has(f.slug));

  const addSection = () => {
    if (!newSectionName.trim()) return;
    setSections(s => [...s, { name: newSectionName.trim(), fields: [], collapsed: false }]);
    setNewSectionName("");
  };

  const removeSection = (idx: number) => {
    setSections(s => s.filter((_, i) => i !== idx));
  };

  const addFieldToSection = (sectionIdx: number, fieldSlug: string) => {
    setSections(s => s.map((sec, i) => i === sectionIdx ? { ...sec, fields: [...sec.fields, fieldSlug] } : sec));
  };

  const removeFieldFromSection = (sectionIdx: number, fieldSlug: string) => {
    setSections(s => s.map((sec, i) => i === sectionIdx ? { ...sec, fields: sec.fields.filter(f => f !== fieldSlug) } : sec));
  };

  const moveFieldInSection = (sectionIdx: number, fieldIdx: number, direction: -1 | 1) => {
    setSections(s => s.map((sec, i) => {
      if (i !== sectionIdx) return sec;
      const newFields = [...sec.fields];
      const targetIdx = fieldIdx + direction;
      if (targetIdx < 0 || targetIdx >= newFields.length) return sec;
      [newFields[fieldIdx], newFields[targetIdx]] = [newFields[targetIdx], newFields[fieldIdx]];
      return { ...sec, fields: newFields };
    }));
  };

  const moveSection = (idx: number, direction: -1 | 1) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= sections.length) return;
    setSections(s => {
      const newSections = [...s];
      [newSections[idx], newSections[targetIdx]] = [newSections[targetIdx], newSections[idx]];
      return newSections;
    });
  };

  const toggleCollapse = (idx: number) => {
    setSections(s => s.map((sec, i) => i === idx ? { ...sec, collapsed: !sec.collapsed } : sec));
  };

  const getFieldBySlug = (slug: string) => fields.find(f => f.slug === slug);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-2">עריכת סקציות דף פרטים — {detail.name}</h2>
        <p className="text-sm text-muted-foreground mb-6">סדר את שדות הישות לסקציות בדף הפרטים</p>

        <div className="space-y-4">
          {sections.map((section, sIdx) => (
            <div key={sIdx} className="border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleCollapse(sIdx)} className="p-0.5 hover:bg-muted rounded">
                    {section.collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  </button>
                  <input value={section.name} onChange={e => setSections(s => s.map((sec, i) => i === sIdx ? { ...sec, name: e.target.value } : sec))}
                    className="bg-transparent font-medium text-sm focus:outline-none focus:border-b focus:border-primary" />
                  <span className="text-xs text-muted-foreground">({section.fields.length} שדות)</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => moveSection(sIdx, -1)} disabled={sIdx === 0} className="p-1 hover:bg-muted rounded disabled:opacity-30">
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => moveSection(sIdx, 1)} disabled={sIdx === sections.length - 1} className="p-1 hover:bg-muted rounded disabled:opacity-30">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  {sections.length > 1 && (
                    <button onClick={() => removeSection(sIdx)} className="p-1 hover:bg-destructive/10 rounded">
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </button>
                  )}
                </div>
              </div>

              {!section.collapsed && (
                <div className="p-3 space-y-2">
                  {section.fields.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">אין שדות בסקציה — בחר שדות מהרשימה למטה</p>
                  )}
                  {section.fields.map((fieldSlug, fIdx) => {
                    const field = getFieldBySlug(fieldSlug);
                    return (
                      <div key={fieldSlug} className="flex items-center justify-between px-3 py-2 bg-background border border-border/50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50" />
                          <span className="text-sm">{field?.name || fieldSlug}</span>
                          {field && <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">{FIELD_TYPE_MAP[field.fieldType]?.label || field.fieldType}</span>}
                        </div>
                        <div className="flex items-center gap-0.5">
                          <button onClick={() => moveFieldInSection(sIdx, fIdx, -1)} disabled={fIdx === 0} className="p-1 hover:bg-muted rounded disabled:opacity-30">
                            <ChevronUp className="w-3 h-3" />
                          </button>
                          <button onClick={() => moveFieldInSection(sIdx, fIdx, 1)} disabled={fIdx === section.fields.length - 1} className="p-1 hover:bg-muted rounded disabled:opacity-30">
                            <ChevronDown className="w-3 h-3" />
                          </button>
                          <button onClick={() => removeFieldFromSection(sIdx, fieldSlug)} className="p-1 hover:bg-destructive/10 rounded">
                            <X className="w-3 h-3 text-destructive" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {unassignedFields.length > 0 && (
                    <div className="pt-2 border-t border-border/30">
                      <select onChange={e => { if (e.target.value) { addFieldToSection(sIdx, e.target.value); e.target.value = ""; } }}
                        className="w-full px-3 py-2 bg-background border border-dashed border-border rounded-lg text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                        defaultValue="">
                        <option value="">+ הוסף שדה לסקציה...</option>
                        {unassignedFields.map(f => (
                          <option key={f.slug} value={f.slug}>{f.name} ({FIELD_TYPE_MAP[f.fieldType]?.label || f.fieldType})</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 mt-4">
          <input value={newSectionName} onChange={e => setNewSectionName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addSection(); }}
            placeholder="שם סקציה חדשה..." className="flex-1 px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          <button onClick={addSection} disabled={!newSectionName.trim()}
            className="px-3 py-2 bg-muted rounded-xl text-sm font-medium hover:bg-muted/80 transition-colors disabled:opacity-50">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {unassignedFields.length > 0 && (
          <div className="mt-4 p-3 bg-muted/30 rounded-xl">
            <p className="text-xs font-medium text-muted-foreground mb-2">שדות לא משויכים ({unassignedFields.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {unassignedFields.map(f => (
                <span key={f.slug} className="px-2 py-1 bg-background border border-border/50 rounded-lg text-xs text-muted-foreground">{f.name}</span>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={() => onSave(sections.map(({ collapsed, ...s }) => s))} disabled={isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : "שמור סקציות"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="entity-editor" />
        <RelatedRecords entityType="entity-editor" />
      </div>
      </motion.div>
    </motion.div>
  );
}
