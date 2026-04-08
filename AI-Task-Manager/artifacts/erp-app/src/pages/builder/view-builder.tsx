import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { usePlatformModules } from "@/hooks/usePlatformModules";
import {
  Plus, Trash2, Edit2, Table2, ChevronLeft, X, Eye,
  LayoutGrid, Calendar, Kanban, GalleryHorizontal, Filter,
  ArrowUpDown, Columns, Settings, CheckCircle, Search, Copy
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

interface ViewDef {
  id: number;
  entityId: number;
  name: string;
  slug: string;
  viewType: string;
  isDefault: boolean;
  columns: any[];
  filters: any[];
  sorting: any[];
  grouping: any;
  settings: any;
}

const VIEW_TYPE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  table: { label: "טבלה", icon: Table2, color: "bg-blue-500/10 text-blue-400" },
  cards: { label: "כרטיסים", icon: LayoutGrid, color: "bg-purple-500/10 text-purple-400" },
  kanban: { label: "קנבאן", icon: Kanban, color: "bg-green-500/10 text-green-400" },
  calendar: { label: "לוח שנה", icon: Calendar, color: "bg-amber-500/10 text-amber-400" },
  gallery: { label: "גלריה", icon: GalleryHorizontal, color: "bg-pink-500/10 text-pink-400" },
};

export default function ViewBuilderPage() {
  const queryClient = useQueryClient();
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [showCreate, setShowCreate] = useState(false);
  const [editingView, setEditingView] = useState<ViewDef | null>(null);
  const [editingColumns, setEditingColumns] = useState<ViewDef | null>(null);
  const [previewView, setPreviewView] = useState<ViewDef | null>(null);
  const [search, setSearch] = useState("");

  const { modules } = usePlatformModules();

  const allEntities = modules.flatMap((m: any) => (m.entities || []).map((e: any) => ({ ...e, moduleName: m.name })));

  const { data: views = [] } = useQuery<ViewDef[]>({
    queryKey: ["all-views", selectedEntityId],
    queryFn: async () => {
      if (!selectedEntityId) {
        const allViews: ViewDef[] = [];
        for (const ent of allEntities) {
          const r = await authFetch(`${API}/platform/entities/${ent.id}/views`);
          if (r.ok) { const data = await r.json(); if (Array.isArray(data)) allViews.push(...data); }
        }
        return allViews;
      }
      const r = await authFetch(`${API}/platform/entities/${selectedEntityId}/views`);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: allEntities.length > 0 || !!selectedEntityId,
  });

  const { data: entityFields = [] } = useQuery({
    queryKey: ["entity-fields-for-view", editingColumns?.entityId],
    queryFn: () => authFetch(`${API}/platform/entities/${editingColumns!.entityId}`).then(r => r.json()).then(d => d.fields || []),
    enabled: !!editingColumns,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/entities/${data.entityId}/views`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create view");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["all-views"] }); setShowCreate(false); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const r = await authFetch(`${API}/platform/views/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update view");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-views"] });
      setEditingView(null);
      setEditingColumns(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/platform/views/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all-views"] }),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/platform/views/${id}/duplicate`, { method: "POST" });
      if (!r.ok) throw new Error("Failed to duplicate");
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all-views"] }),
  });

  const getEntityName = (entityId: number) => allEntities.find((e: any) => e.id === entityId)?.nameHe || allEntities.find((e: any) => e.id === entityId)?.name || `#${entityId}`;

  const filteredViews = views.filter(v => {
    if (search && !v.name.toLowerCase().includes(search.toLowerCase()) && !v.slug.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/builder" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />בונה הפלטפורמה
        </Link>
        <span>/</span><span className="text-foreground">בונה תצוגות</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-3">
            <Table2 className="w-8 h-8 text-teal-400" />בונה תצוגות
          </h1>
          <p className="text-muted-foreground mt-1">table, cards, kanban, calendar — עמודות, פילטרים, מיון, קיבוץ</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-5 h-5" />תצוגה חדשה
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש תצוגות..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={selectedEntityId ?? ""} onChange={e => setSelectedEntityId(e.target.value ? Number(e.target.value) : null)}
          className="px-3 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
          <option value="">כל הישויות</option>
          {allEntities.map((e: any) => <option key={e.id} value={e.id}>{e.nameHe || e.name}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filteredViews.length} תצוגות</span>
      </div>

      {filteredViews.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
          <Table2 className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">אין תצוגות</h3>
          <p className="text-muted-foreground mb-4">צור תצוגות דינמיות — טבלאות, קנבאן, כרטיסים ולוח שנה</p>
          <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
            <Plus className="w-4 h-4" />תצוגה חדשה
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredViews.map((view, i) => {
            const vtConfig = VIEW_TYPE_CONFIG[view.viewType] || VIEW_TYPE_CONFIG.table;
            const VtIcon = vtConfig.icon;
            return (
              <motion.div key={view.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="bg-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${vtConfig.color}`}>
                      <VtIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{view.name}</h3>
                      <p className="text-xs text-muted-foreground">{getEntityName(view.entityId)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {view.isDefault && <span className="text-xs px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded-md">ברירת מחדל</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                  <span className={`px-2 py-0.5 rounded-md ${vtConfig.color}`}>{vtConfig.label}</span>
                  <span>{(view.columns || []).length} עמודות</span>
                  <span>{(view.filters || []).length} פילטרים</span>
                </div>
                <div className="flex items-center gap-2 pt-3 border-t border-border/50">
                  <button onClick={() => setEditingColumns(view)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary/10 text-primary rounded-lg text-sm font-medium hover:bg-primary/20 transition-colors">
                    <Columns className="w-4 h-4" />עורך עמודות
                  </button>
                  <button onClick={() => setPreviewView(view)} className="p-2 hover:bg-muted rounded-lg transition-colors" title="תצוגה מקדימה"><Eye className="w-4 h-4 text-muted-foreground" /></button>
                  <button onClick={() => duplicateMutation.mutate(view.id)} className="p-2 hover:bg-muted rounded-lg transition-colors" title="שכפול"><Copy className="w-4 h-4 text-muted-foreground" /></button>
                  <button onClick={() => setEditingView(view)} className="p-2 hover:bg-muted rounded-lg transition-colors"><Edit2 className="w-4 h-4 text-muted-foreground" /></button>
                  {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק את התצוגה?", { itemName: view.name, entityType: "תצוגה" }); if (ok) deleteMutation.mutate(view.id); }} className="p-2 hover:bg-destructive/10 rounded-lg transition-colors"><Trash2 className="w-4 h-4 text-destructive" /></button>}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {(showCreate || editingView) && (
          <ViewCreateModal
            view={editingView}
            entities={allEntities}
            onClose={() => { setShowCreate(false); setEditingView(null); }}
            onSubmit={(data) => {
              if (editingView) updateMutation.mutate({ id: editingView.id, ...data });
              else createMutation.mutate(data);
            }}
            isLoading={createMutation.isPending || updateMutation.isPending}
          />
        )}
        {editingColumns && (
          <ColumnEditorModal
            view={editingColumns}
            fields={entityFields}
            onClose={() => setEditingColumns(null)}
            onSave={(columns) => updateMutation.mutate({ id: editingColumns.id, columns })}
            isLoading={updateMutation.isPending}
          />
        )}
        {previewView && (
          <ViewPreviewModal view={previewView} onClose={() => setPreviewView(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function ViewCreateModal({ view, entities, onClose, onSubmit, isLoading }: {
  view: ViewDef | null; entities: any[]; onClose: () => void; onSubmit: (data: any) => void; isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    entityId: view?.entityId || "",
    name: view?.name || "",
    slug: view?.slug || "",
    viewType: view?.viewType || "table",
    isDefault: view?.isDefault ?? false,
  });
  const autoSlug = (n: string) => n.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-card border border-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">{view ? "עריכת תצוגה" : "תצוגה חדשה"}</h2>
        <div className="space-y-4">
          {!view && (
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
            <label className="block text-sm font-medium mb-1.5">שם התצוגה *</label>
            <input value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value, ...(!view ? { slug: autoSlug(e.target.value) } : {}) }))}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Slug *</label>
            <input value={formData.slug} onChange={e => setFormData(f => ({ ...f, slug: e.target.value }))} dir="ltr"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">סוג תצוגה</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {Object.entries(VIEW_TYPE_CONFIG).map(([key, cfg]) => {
                const Icon = cfg.icon;
                return (
                  <button key={key} type="button" onClick={() => setFormData(f => ({ ...f, viewType: key }))}
                    className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl text-xs font-medium transition-colors ${formData.viewType === key ? "bg-primary text-primary-foreground" : "bg-background border border-border hover:border-primary/30"}`}>
                    <Icon className="w-5 h-5" />{cfg.label}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={formData.isDefault} onChange={e => setFormData(f => ({ ...f, isDefault: e.target.checked }))}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
            <span className="text-sm">תצוגת ברירת מחדל</span>
          </label>
        </div>
        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={() => onSubmit(formData)} disabled={!formData.name || !formData.slug || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : view ? "עדכן" : "צור תצוגה"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ColumnEditorModal({ view, fields, onClose, onSave, isLoading }: {
  view: ViewDef; fields: any[]; onClose: () => void; onSave: (columns: any[]) => void; isLoading: boolean;
}) {
  const [columns, setColumns] = useState<any[]>(
    view.columns?.length > 0
      ? view.columns
      : fields.filter((f: any) => f.showInList !== false).map((f: any) => ({ fieldSlug: f.slug || f.fieldKey, width: "auto", visible: true }))
  );

  const addColumn = (fieldSlug: string) => {
    if (!columns.find(c => c.fieldSlug === fieldSlug)) {
      setColumns(prev => [...prev, { fieldSlug, width: "auto", visible: true }]);
    }
  };

  const removeColumn = (idx: number) => setColumns(prev => prev.filter((_, i) => i !== idx));
  const toggleVisible = (idx: number) => setColumns(prev => prev.map((c, i) => i === idx ? { ...c, visible: !c.visible } : c));

  const usedSlugs = new Set(columns.map(c => c.fieldSlug));
  const availableFields = fields.filter((f: any) => !usedSlugs.has(f.slug) && !usedSlugs.has(f.fieldKey));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
        className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold">עורך עמודות — {view.name}</h2>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-2">
          {columns.map((col, idx) => {
            const field = fields.find((f: any) => f.slug === col.fieldSlug || f.fieldKey === col.fieldSlug);
            return (
              <div key={idx} className={`flex items-center gap-3 px-3 py-2.5 bg-background border border-border rounded-xl ${!col.visible ? "opacity-50" : ""}`}>
                <span className="text-sm font-medium flex-1">{field?.name || field?.nameHe || col.fieldSlug}</span>
                <span className="text-xs text-muted-foreground">{field?.fieldType}</span>
                <button onClick={() => toggleVisible(idx)} className="p-1 hover:bg-muted rounded">
                  <Eye className={`w-3.5 h-3.5 ${col.visible ? "text-green-400" : "text-muted-foreground"}`} />
                </button>
                <button onClick={() => removeColumn(idx)} className="p-1 hover:bg-destructive/10 rounded">
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </button>
              </div>
            );
          })}
          {availableFields.length > 0 && (
            <select onChange={e => { if (e.target.value) { addColumn(e.target.value); e.target.value = ""; } }}
              className="w-full px-3 py-2.5 bg-card border border-dashed border-border rounded-xl text-sm text-muted-foreground">
              <option value="">+ הוסף עמודה...</option>
              {availableFields.map((f: any) => <option key={f.slug || f.fieldKey} value={f.slug || f.fieldKey}>{f.name || f.nameHe}</option>)}
            </select>
          )}
        </div>
        <div className="flex items-center gap-3 p-6 border-t border-border">
          <button onClick={() => onSave(columns)} disabled={isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : "שמור עמודות"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ViewPreviewModal({ view, onClose }: { view: ViewDef; onClose: () => void }) {
  const vtConfig = VIEW_TYPE_CONFIG[view.viewType] || VIEW_TYPE_CONFIG.table;
  const VtIcon = vtConfig.icon;
  const columns = view.columns || [];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
        className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold flex items-center gap-2"><Eye className="w-5 h-5 text-primary" />תצוגה מקדימה — {view.name}</h2>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-3 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className={`px-3 py-1 rounded-lg text-sm font-medium ${vtConfig.color}`}>
              <VtIcon className="w-4 h-4 inline mr-1" />{vtConfig.label}
            </div>
            <span className="text-sm text-muted-foreground">{columns.length} עמודות</span>
            {view.isDefault && <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-400 rounded-md">ברירת מחדל</span>}
          </div>
          {view.viewType === "table" || !view.viewType ? (
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="grid bg-muted/30 border-b border-border" style={{ gridTemplateColumns: `repeat(${Math.max(columns.length, 3)}, 1fr)` }}>
                {(columns.length > 0 ? columns : [{ fieldSlug: "שדה 1" }, { fieldSlug: "שדה 2" }, { fieldSlug: "שדה 3" }]).map((col: any, i: number) => (
                  <div key={i} className="px-4 py-3 text-xs font-semibold text-muted-foreground">{col.fieldSlug}</div>
                ))}
              </div>
              {[1, 2, 3, 4].map(row => (
                <div key={row} className="grid border-b border-border/30 last:border-0" style={{ gridTemplateColumns: `repeat(${Math.max(columns.length, 3)}, 1fr)` }}>
                  {(columns.length > 0 ? columns : [1, 2, 3]).map((_: any, i: number) => (
                    <div key={i} className="px-4 py-3 text-sm text-muted-foreground/60">נתון לדוגמה</div>
                  ))}
                </div>
              ))}
            </div>
          ) : view.viewType === "kanban" ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {["חדש", "בטיפול", "הושלם"].map(col => (
                <div key={col} className="bg-muted/20 rounded-xl p-3">
                  <h4 className="text-sm font-semibold mb-3 text-center">{col}</h4>
                  {[1, 2].map(i => (
                    <div key={i} className="bg-card border border-border rounded-lg p-3 mb-2 text-sm text-muted-foreground">כרטיס #{i}</div>
                  ))}
                </div>
              ))}
            </div>
          ) : view.viewType === "cards" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-background border border-border rounded-xl p-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 mb-3" />
                  <div className="h-3 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-2 bg-muted/50 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <VtIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>תצוגה מסוג {vtConfig.label}</p>
            </div>
          )}
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="views" />
        <RelatedRecords entityType="views" />
      </div>
      </motion.div>
    </motion.div>
  );
}
