import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { usePlatformModules } from "@/hooks/usePlatformModules";
import {
  Plus, Trash2, Edit2, CreditCard, ChevronLeft, X, Eye,
  Columns, LayoutList, GripVertical, FileText, Table2, Settings, Search, Copy
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

interface DetailDef {
  id: number;
  entityId: number;
  name: string;
  slug: string;
  sections: any[];
  settings: any;
  isDefault: boolean;
  showRelatedRecords: boolean;
}

const SECTION_TYPES: Record<string, string> = {
  fields: "שדות",
  related: "רשומות קשורות",
  activity: "פעילות",
  widgets: "Widgets",
  notes: "הערות",
  attachments: "צרופות",
};

export default function DetailPageBuilderPage() {
  const queryClient = useQueryClient();
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [showCreate, setShowCreate] = useState(false);
  const [editingDetail, setEditingDetail] = useState<DetailDef | null>(null);
  const [editingSections, setEditingSections] = useState<DetailDef | null>(null);
  const [search, setSearch] = useState("");

  const { modules } = usePlatformModules();

  const allEntities = modules.flatMap((m: any) => (m.entities || []).map((e: any) => ({ ...e, moduleName: m.name })));

  const { data: details = [] } = useQuery<DetailDef[]>({
    queryKey: ["all-details", selectedEntityId],
    queryFn: async () => {
      if (!selectedEntityId) {
        const all: DetailDef[] = [];
        for (const ent of allEntities) {
          const r = await authFetch(`${API}/platform/entities/${ent.id}/details`);
          if (r.ok) { const data = await r.json(); if (Array.isArray(data)) all.push(...data); }
        }
        return all;
      }
      const r = await authFetch(`${API}/platform/entities/${selectedEntityId}/details`);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: allEntities.length > 0 || !!selectedEntityId,
  });

  const { data: entityFields = [] } = useQuery({
    queryKey: ["entity-fields-for-detail", editingSections?.entityId],
    queryFn: () => authFetch(`${API}/platform/entities/${editingSections!.entityId}`).then(r => r.json()).then(d => d.fields || []),
    enabled: !!editingSections,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/entities/${data.entityId}/details`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create detail page");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["all-details"] }); setShowCreate(false); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const r = await authFetch(`${API}/platform/details/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update detail page");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-details"] });
      setEditingDetail(null);
      setEditingSections(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/platform/details/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all-details"] }),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/platform/details/${id}/duplicate`, { method: "POST" });
      if (!r.ok) throw new Error("Failed to duplicate");
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all-details"] }),
  });

  const getEntityName = (entityId: number) => allEntities.find((e: any) => e.id === entityId)?.nameHe || allEntities.find((e: any) => e.id === entityId)?.name || `#${entityId}`;

  const filteredDetails = details.filter(d => {
    if (search && !d.name.toLowerCase().includes(search.toLowerCase()) && !d.slug.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/builder" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />בונה הפלטפורמה
        </Link>
        <span>/</span><span className="text-foreground">בונה דפי פרטים</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-3">
            <CreditCard className="w-8 h-8 text-pink-400" />בונה דפי פרטים
          </h1>
          <p className="text-muted-foreground mt-1">header section, tabs, related records, widget areas, activity feed</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-5 h-5" />דף פרטים חדש
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש דפי פרטים..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={selectedEntityId ?? ""} onChange={e => setSelectedEntityId(e.target.value ? Number(e.target.value) : null)}
          className="px-3 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
          <option value="">כל הישויות</option>
          {allEntities.map((e: any) => <option key={e.id} value={e.id}>{e.nameHe || e.name}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filteredDetails.length} דפי פרטים</span>
      </div>

      {filteredDetails.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
          <CreditCard className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">אין דפי פרטים</h3>
          <p className="text-muted-foreground mb-4">צור דפי פרטים עם header, tabs, רשומות קשורות ועוד</p>
          <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
            <Plus className="w-4 h-4" />דף פרטים חדש
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDetails.map((detail, i) => (
            <motion.div key={detail.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className="bg-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-pink-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{detail.name}</h3>
                    <p className="text-xs text-muted-foreground">{getEntityName(detail.entityId)}</p>
                  </div>
                </div>
                {detail.isDefault && <span className="text-xs px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded-md">ברירת מחדל</span>}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                <span>{(detail.sections || []).length} סקשנים</span>
                {detail.showRelatedRecords && <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded-md">רשומות קשורות</span>}
              </div>
              <div className="flex items-center gap-2 pt-3 border-t border-border/50">
                <button onClick={() => setEditingSections(detail)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary/10 text-primary rounded-lg text-sm font-medium hover:bg-primary/20 transition-colors">
                  <Columns className="w-4 h-4" />עורך Sections
                </button>
                <button onClick={() => duplicateMutation.mutate(detail.id)} className="p-2 hover:bg-muted rounded-lg transition-colors" title="שכפול"><Copy className="w-4 h-4 text-muted-foreground" /></button>
                <button onClick={() => setEditingDetail(detail)} className="p-2 hover:bg-muted rounded-lg transition-colors"><Edit2 className="w-4 h-4 text-muted-foreground" /></button>
                {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק את דף הפרטים?", { itemName: detail.name, entityType: "דף פרטים" }); if (ok) deleteMutation.mutate(detail.id); }} className="p-2 hover:bg-destructive/10 rounded-lg transition-colors"><Trash2 className="w-4 h-4 text-destructive" /></button>}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {(showCreate || editingDetail) && (
          <DetailCreateModal
            detail={editingDetail}
            entities={allEntities}
            onClose={() => { setShowCreate(false); setEditingDetail(null); }}
            onSubmit={(data) => {
              if (editingDetail) updateMutation.mutate({ id: editingDetail.id, ...data });
              else createMutation.mutate(data);
            }}
            isLoading={createMutation.isPending || updateMutation.isPending}
          />
        )}
        {editingSections && (
          <DetailSectionEditor
            detail={editingSections}
            fields={entityFields}
            onClose={() => setEditingSections(null)}
            onSave={(sections) => updateMutation.mutate({ id: editingSections.id, sections })}
            isLoading={updateMutation.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function DetailCreateModal({ detail, entities, onClose, onSubmit, isLoading }: {
  detail: DetailDef | null; entities: any[]; onClose: () => void; onSubmit: (data: any) => void; isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    entityId: detail?.entityId || "",
    name: detail?.name || "",
    slug: detail?.slug || "",
    isDefault: detail?.isDefault ?? false,
    showRelatedRecords: detail?.showRelatedRecords ?? true,
  });
  const autoSlug = (n: string) => n.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-card border border-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">{detail ? "עריכת דף פרטים" : "דף פרטים חדש"}</h2>
        <div className="space-y-4">
          {!detail && (
            <div>
              <label className="block text-sm font-medium mb-1.5">ישות *</label>
              <select value={formData.entityId} onChange={e => setFormData(f => ({ ...f, entityId: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">בחר ישות...</option>
                {entities.map((e: any) => <option key={e.id} value={e.id}>{e.nameHe || e.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1.5">שם *</label>
            <input value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value, ...(!detail ? { slug: autoSlug(e.target.value) } : {}) }))}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Slug *</label>
            <input value={formData.slug} onChange={e => setFormData(f => ({ ...f, slug: e.target.value }))} dir="ltr"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 cursor-pointer p-2.5 bg-background border border-border rounded-xl">
              <input type="checkbox" checked={formData.isDefault} onChange={e => setFormData(f => ({ ...f, isDefault: e.target.checked }))}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
              <span className="text-sm">ברירת מחדל</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer p-2.5 bg-background border border-border rounded-xl">
              <input type="checkbox" checked={formData.showRelatedRecords} onChange={e => setFormData(f => ({ ...f, showRelatedRecords: e.target.checked }))}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
              <span className="text-sm">רשומות קשורות</span>
            </label>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={() => onSubmit(formData)} disabled={!formData.name || !formData.slug || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : detail ? "עדכן" : "צור דף פרטים"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function DetailSectionEditor({ detail, fields, onClose, onSave, isLoading }: {
  detail: DetailDef; fields: any[]; onClose: () => void; onSave: (sections: any[]) => void; isLoading: boolean;
}) {
  const defaultSections = [
    { name: "כותרת", slug: "header", sectionType: "fields", fields: fields.slice(0, 3).map((f: any) => f.slug || f.fieldKey), sortOrder: 0 },
    { name: "פרטים", slug: "details", sectionType: "fields", fields: fields.slice(3).map((f: any) => f.slug || f.fieldKey), sortOrder: 1 },
    { name: "רשומות קשורות", slug: "related", sectionType: "related", fields: [], sortOrder: 2 },
    { name: "פעילות", slug: "activity", sectionType: "activity", fields: [], sortOrder: 3 },
  ];
  const [sections, setSections] = useState<any[]>(detail.sections?.length ? detail.sections : defaultSections);

  const addSection = () => {
    setSections(prev => [...prev, { name: `סקשן ${prev.length + 1}`, slug: `section-${prev.length + 1}`, sectionType: "fields", fields: [], sortOrder: prev.length }]);
  };

  const removeSection = (idx: number) => setSections(prev => prev.filter((_, i) => i !== idx));
  const updateSection = (idx: number, updates: any) => setSections(prev => prev.map((s, i) => i === idx ? { ...s, ...updates } : s));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
        className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold">עורך Sections — {detail.name}</h2>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {sections.map((section, idx) => (
            <div key={idx} className="bg-background border border-border rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                <input value={section.name} onChange={e => updateSection(idx, { name: e.target.value })}
                  className="flex-1 px-2 py-1 bg-transparent border-b border-border text-sm font-medium focus:outline-none focus:border-primary" />
                <select value={section.sectionType} onChange={e => updateSection(idx, { sectionType: e.target.value })}
                  className="px-2 py-1 bg-card border border-border rounded-lg text-xs">
                  {Object.entries(SECTION_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
                <button onClick={() => removeSection(idx)} className="p-1 hover:bg-destructive/10 rounded"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
              </div>
              {section.sectionType === "fields" && (
                <div className="space-y-1.5">
                  {(section.fields || []).map((fieldSlug: string, fi: number) => {
                    const field = fields.find((f: any) => f.slug === fieldSlug || f.fieldKey === fieldSlug);
                    return (
                      <div key={fi} className="flex items-center gap-2 px-3 py-2 bg-card border border-border/50 rounded-lg text-sm">
                        <span className="flex-1">{field?.name || field?.nameHe || fieldSlug}</span>
                        <button onClick={() => updateSection(idx, { fields: section.fields.filter((_: any, i: number) => i !== fi) })}
                          className="p-0.5 hover:bg-destructive/10 rounded"><X className="w-3 h-3 text-destructive" /></button>
                      </div>
                    );
                  })}
                </div>
              )}
              {section.sectionType !== "fields" && (
                <p className="text-xs text-muted-foreground px-3 py-2">{SECTION_TYPES[section.sectionType]} — תוכן אוטומטי</p>
              )}
            </div>
          ))}
          <button onClick={addSection} className="w-full py-3 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors">
            <Plus className="w-4 h-4 inline mr-1" />הוסף סקשן
          </button>
        </div>
        <div className="flex items-center gap-3 p-6 border-t border-border">
          <button onClick={() => onSave(sections)} disabled={isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : "שמור"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="detail-pages" />
        <RelatedRecords entityType="detail-pages" />
      </div>
      </motion.div>
    </motion.div>
  );
}
