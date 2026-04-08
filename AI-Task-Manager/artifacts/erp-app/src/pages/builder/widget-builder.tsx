import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { usePlatformModules } from "@/hooks/usePlatformModules";
import {
  Plus, Trash2, Edit2, LayoutGrid, ChevronLeft, X, Eye, Copy,
  Search, BarChart3, Hash, List, PieChart, TrendingUp, Activity
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

interface Widget {
  id: number;
  moduleId: number;
  name: string;
  slug: string;
  widgetType: string;
  entityId: number | null;
  config: any;
  position: number;
  isActive: boolean;
}

const WIDGET_TYPES: Record<string, { label: string; icon: any; color: string }> = {
  count: { label: "ספירה", icon: Hash, color: "bg-blue-500/10 text-blue-400" },
  chart: { label: "גרף", icon: BarChart3, color: "bg-purple-500/10 text-purple-400" },
  list: { label: "רשימה", icon: List, color: "bg-green-500/10 text-green-400" },
  pie: { label: "עוגה", icon: PieChart, color: "bg-amber-500/10 text-amber-400" },
  trend: { label: "מגמה", icon: TrendingUp, color: "bg-pink-500/10 text-pink-400" },
  kpi: { label: "KPI", icon: Activity, color: "bg-cyan-500/10 text-cyan-400" },
  summary: { label: "סיכום", icon: LayoutGrid, color: "bg-orange-500/10 text-orange-400" },
};

export default function WidgetBuilderPage() {
  const queryClient = useQueryClient();
  const [selectedModuleId, setSelectedModuleId] = useState<number | null>(null);
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [showCreate, setShowCreate] = useState(false);
  const [editingWidget, setEditingWidget] = useState<Widget | null>(null);
  const [previewWidget, setPreviewWidget] = useState<Widget | null>(null);
  const [search, setSearch] = useState("");

  const { modules } = usePlatformModules();

  const { data: widgets = [] } = useQuery<Widget[]>({
    queryKey: ["all-widgets", selectedModuleId],
    queryFn: async () => {
      if (!selectedModuleId) {
        const allWidgets: Widget[] = [];
        for (const mod of modules) {
          const r = await authFetch(`${API}/platform/modules/${mod.id}/widgets`);
          if (r.ok) { const data = await r.json(); if (Array.isArray(data)) allWidgets.push(...data); }
        }
        return allWidgets;
      }
      const r = await authFetch(`${API}/platform/modules/${selectedModuleId}/widgets`);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: modules.length > 0 || !!selectedModuleId,
  });

  const allEntities = modules.flatMap((m: any) => (m.entities || []).map((e: any) => ({ ...e, moduleName: m.name })));

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/modules/${data.moduleId}/widgets`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create widget");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["all-widgets"] }); setShowCreate(false); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const r = await authFetch(`${API}/platform/widgets/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update widget");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["all-widgets"] }); setEditingWidget(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/platform/widgets/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all-widgets"] }),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/platform/widgets/${id}/duplicate`, { method: "POST" });
      if (!r.ok) throw new Error("Failed to duplicate");
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all-widgets"] }),
  });

  const getModuleName = (moduleId: number) => modules.find((m: any) => m.id === moduleId)?.name || `#${moduleId}`;
  const getEntityName = (entityId: number | null) => {
    if (!entityId) return null;
    const ent = allEntities.find((e: any) => e.id === entityId);
    return ent?.nameHe || ent?.name || null;
  };

  const filteredWidgets = widgets.filter(w => {
    if (search && !w.name.toLowerCase().includes(search.toLowerCase()) && !w.slug.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/builder" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />בונה הפלטפורמה
        </Link>
        <span>/</span>
        <span className="text-foreground">בונה Widgets</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-3">
            <LayoutGrid className="w-8 h-8 text-cyan-400" />בונה Widgets
          </h1>
          <p className="text-muted-foreground mt-1">יצירת רכיבי תצוגה — count, chart, list, KPI, pie, trend</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-5 h-5" />Widget חדש
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש widgets..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={selectedModuleId ?? ""} onChange={e => setSelectedModuleId(e.target.value ? Number(e.target.value) : null)}
          className="px-3 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
          <option value="">כל המודולים</option>
          {modules.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filteredWidgets.length} widgets</span>
      </div>

      {filteredWidgets.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
          <LayoutGrid className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">אין Widgets</h3>
          <p className="text-muted-foreground mb-4">צור רכיבי תצוגה לדאשבורדים — ספירות, גרפים, רשימות ועוד</p>
          <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
            <Plus className="w-4 h-4" />Widget חדש
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredWidgets.map((widget, i) => {
            const wtConfig = WIDGET_TYPES[widget.widgetType] || WIDGET_TYPES.count;
            const WtIcon = wtConfig.icon;
            const entityName = getEntityName(widget.entityId);
            return (
              <motion.div key={widget.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="bg-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${wtConfig.color}`}>
                      <WtIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{widget.name}</h3>
                      <p className="text-xs text-muted-foreground">{getModuleName(widget.moduleId)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!widget.isActive && <span className="text-xs px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded-md">לא פעיל</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                  <span className={`px-2 py-0.5 rounded-md ${wtConfig.color}`}>{wtConfig.label}</span>
                  {entityName && <span>ישות: {entityName}</span>}
                  <span>מיקום: {widget.position}</span>
                </div>
                <div className="flex items-center gap-2 pt-3 border-t border-border/50">
                  <button onClick={() => setPreviewWidget(widget)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary/10 text-primary rounded-lg text-sm font-medium hover:bg-primary/20 transition-colors">
                    <Eye className="w-4 h-4" />תצוגה מקדימה
                  </button>
                  <button onClick={() => duplicateMutation.mutate(widget.id)} className="p-2 hover:bg-muted rounded-lg transition-colors" title="שכפול"><Copy className="w-4 h-4 text-muted-foreground" /></button>
                  <button onClick={() => setEditingWidget(widget)} className="p-2 hover:bg-muted rounded-lg transition-colors"><Edit2 className="w-4 h-4 text-muted-foreground" /></button>
                  {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק את הווידג׳ט?", { itemName: widget.name, entityType: "ווידג׳ט" }); if (ok) deleteMutation.mutate(widget.id); }} className="p-2 hover:bg-destructive/10 rounded-lg transition-colors"><Trash2 className="w-4 h-4 text-destructive" /></button>}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {(showCreate || editingWidget) && (
          <WidgetCreateModal
            widget={editingWidget}
            modules={modules}
            entities={allEntities}
            onClose={() => { setShowCreate(false); setEditingWidget(null); }}
            onSubmit={(data) => {
              if (editingWidget) updateMutation.mutate({ id: editingWidget.id, ...data });
              else createMutation.mutate(data);
            }}
            isLoading={createMutation.isPending || updateMutation.isPending}
          />
        )}
        {previewWidget && (
          <WidgetPreviewModal widget={previewWidget} onClose={() => setPreviewWidget(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

const AGGREGATION_TYPES: Record<string, string> = {
  count: "ספירה",
  sum: "סכום",
  avg: "ממוצע",
  min: "מינימום",
  max: "מקסימום",
  count_distinct: "ספירת ייחודיים",
};

function WidgetCreateModal({ widget, modules, entities, onClose, onSubmit, isLoading }: {
  widget: Widget | null; modules: any[]; entities: any[]; onClose: () => void; onSubmit: (data: any) => void; isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    moduleId: widget?.moduleId || "",
    name: widget?.name || "",
    slug: widget?.slug || "",
    widgetType: widget?.widgetType || "count",
    entityId: widget?.entityId || "",
    position: widget?.position ?? 0,
    isActive: widget?.isActive ?? true,
    config: widget?.config || {},
  });
  const [activeSection, setActiveSection] = useState<"basic" | "datasource">("basic");
  const autoSlug = (n: string) => n.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");

  const { data: entityFields = [] } = useQuery({
    queryKey: ["entity-fields-for-widget", formData.entityId],
    queryFn: () => authFetch(`${API}/platform/entities/${formData.entityId}`).then(r => r.json()).then(d => d.fields || []),
    enabled: !!formData.entityId,
  });

  const updateConfig = (key: string, value: any) => {
    setFormData(f => ({ ...f, config: { ...f.config, [key]: value } }));
  };

  const configFilters: any[] = Array.isArray(formData.config.filters) ? formData.config.filters : [];

  const addConfigFilter = () => {
    updateConfig("filters", [...configFilters, { field: "", operator: "equals", value: "" }]);
  };

  const updateConfigFilter = (idx: number, updates: any) => {
    updateConfig("filters", configFilters.map((f, i) => i === idx ? { ...f, ...updates } : f));
  };

  const removeConfigFilter = (idx: number) => {
    updateConfig("filters", configFilters.filter((_, i) => i !== idx));
  };

  const sectionTabs = [
    { key: "basic" as const, label: "הגדרות בסיסיות" },
    { key: "datasource" as const, label: "מקור נתונים" },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">{widget ? "עריכת Widget" : "Widget חדש"}</h2>

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
            {!widget && (
              <div>
                <label className="block text-sm font-medium mb-1.5">מודול *</label>
                <select value={formData.moduleId} onChange={e => setFormData(f => ({ ...f, moduleId: Number(e.target.value) }))}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">בחר מודול...</option>
                  {modules.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">שם *</label>
                <input value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value, ...(!widget ? { slug: autoSlug(e.target.value) } : {}) }))}
                  placeholder="למשל: סך לקוחות פעילים" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Slug *</label>
                <input value={formData.slug} onChange={e => setFormData(f => ({ ...f, slug: e.target.value }))} dir="ltr"
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">סוג Widget</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Object.entries(WIDGET_TYPES).map(([key, cfg]) => {
                  const Icon = cfg.icon;
                  return (
                    <button key={key} type="button" onClick={() => setFormData(f => ({ ...f, widgetType: key }))}
                      className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl text-xs font-medium transition-all ${formData.widgetType === key ? "bg-primary text-primary-foreground ring-2 ring-primary/30" : "bg-background border border-border hover:border-primary/30"}`}>
                      <Icon className="w-4 h-4" />{cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">מיקום</label>
                <input type="number" value={formData.position} onChange={e => setFormData(f => ({ ...f, position: Number(e.target.value) }))}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer self-end pb-2.5">
                <input type="checkbox" checked={formData.isActive} onChange={e => setFormData(f => ({ ...f, isActive: e.target.checked }))}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                <span className="text-sm">פעיל</span>
              </label>
            </div>
          </div>
        )}

        {activeSection === "datasource" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">ישות מקור</label>
              <select value={formData.entityId} onChange={e => setFormData(f => ({ ...f, entityId: e.target.value ? Number(e.target.value) : "" }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">ללא ישות ספציפית</option>
                {entities.map((e: any) => <option key={e.id} value={e.id}>{e.nameHe || e.name}</option>)}
              </select>
            </div>

            {formData.entityId && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1.5">סוג אגרגציה</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {Object.entries(AGGREGATION_TYPES).map(([key, label]) => (
                      <button key={key} type="button" onClick={() => updateConfig("aggregation", key)}
                        className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors ${(formData.config.aggregation || "count") === key ? "bg-primary text-primary-foreground" : "bg-background border border-border hover:border-primary/30"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {formData.config.aggregation && formData.config.aggregation !== "count" && formData.config.aggregation !== "count_distinct" && (
                  <div>
                    <label className="block text-sm font-medium mb-1.5">שדה לחישוב</label>
                    <select value={formData.config.aggregationField || ""} onChange={e => updateConfig("aggregationField", e.target.value)}
                      className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                      <option value="">בחר שדה...</option>
                      {entityFields.filter((f: any) => ["number", "decimal", "currency", "percent"].includes(f.fieldType)).map((f: any) => (
                        <option key={f.slug} value={f.slug}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {(formData.widgetType === "chart" || formData.widgetType === "pie") && (
                  <div>
                    <label className="block text-sm font-medium mb-1.5">שדה קיבוץ (ציר X / פרוסות)</label>
                    <select value={formData.config.groupByField || ""} onChange={e => updateConfig("groupByField", e.target.value)}
                      className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                      <option value="">בחר שדה...</option>
                      {entityFields.map((f: any) => <option key={f.slug} value={f.slug}>{f.name}</option>)}
                    </select>
                  </div>
                )}

                {formData.widgetType === "trend" && (
                  <div>
                    <label className="block text-sm font-medium mb-1.5">שדה תאריך (ציר זמן)</label>
                    <select value={formData.config.dateField || ""} onChange={e => updateConfig("dateField", e.target.value)}
                      className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                      <option value="">בחר שדה...</option>
                      {entityFields.filter((f: any) => ["date", "datetime"].includes(f.fieldType)).map((f: any) => (
                        <option key={f.slug} value={f.slug}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {formData.widgetType === "list" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">שדה תצוגה</label>
                      <select value={formData.config.displayField || ""} onChange={e => updateConfig("displayField", e.target.value)}
                        className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                        <option value="">אוטומטי</option>
                        {entityFields.map((f: any) => <option key={f.slug} value={f.slug}>{f.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">מקסימום שורות</label>
                      <input type="number" value={formData.config.maxRows || 5} onChange={e => updateConfig("maxRows", Number(e.target.value))}
                        min={1} max={50} className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                    </div>
                  </div>
                )}

                {formData.widgetType === "kpi" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">ערך יעד</label>
                      <input type="number" value={formData.config.targetValue || ""} onChange={e => updateConfig("targetValue", Number(e.target.value))}
                        placeholder="100" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">יחידה</label>
                      <input value={formData.config.unit || ""} onChange={e => updateConfig("unit", e.target.value)}
                        placeholder="%, ₪, יח'" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1.5">סינון נתונים</label>
                  {configFilters.map((filter, idx) => (
                    <div key={idx} className="flex items-center gap-2 mb-2 p-2 bg-background border border-border/50 rounded-lg">
                      <select value={filter.field || ""} onChange={e => updateConfigFilter(idx, { field: e.target.value })}
                        className="flex-1 px-2 py-1.5 bg-card border border-border rounded-lg text-xs">
                        <option value="">שדה...</option>
                        {entityFields.map((f: any) => <option key={f.slug} value={f.slug}>{f.name}</option>)}
                      </select>
                      <select value={filter.operator || "equals"} onChange={e => updateConfigFilter(idx, { operator: e.target.value })}
                        className="px-2 py-1.5 bg-card border border-border rounded-lg text-xs">
                        <option value="equals">שווה</option>
                        <option value="not_equals">שונה</option>
                        <option value="contains">מכיל</option>
                        <option value="gt">גדול מ</option>
                        <option value="lt">קטן מ</option>
                        <option value="is_empty">ריק</option>
                        <option value="is_not_empty">לא ריק</option>
                      </select>
                      {!["is_empty", "is_not_empty"].includes(filter.operator) && (
                        <input value={filter.value || ""} onChange={e => updateConfigFilter(idx, { value: e.target.value })}
                          placeholder="ערך..." className="flex-1 px-2 py-1.5 bg-card border border-border rounded-lg text-xs" />
                      )}
                      <button onClick={() => removeConfigFilter(idx)} className="p-1 hover:bg-destructive/10 rounded">
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </button>
                    </div>
                  ))}
                  <button onClick={addConfigFilter} className="w-full px-3 py-2 bg-background border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors">
                    + הוסף סינון
                  </button>
                </div>
              </>
            )}

            {!formData.entityId && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                בחר ישות מקור כדי להגדיר את מקור הנתונים
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={() => {
            const payload = { ...formData, entityId: formData.entityId || undefined };
            onSubmit(payload);
          }} disabled={!formData.name || !formData.slug || (!widget && !formData.moduleId) || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : widget ? "עדכן" : "צור Widget"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function WidgetPreviewModal({ widget, onClose }: { widget: Widget; onClose: () => void }) {
  const wtConfig = WIDGET_TYPES[widget.widgetType] || WIDGET_TYPES.count;
  const WtIcon = wtConfig.icon;

  const renderPreview = () => {
    switch (widget.widgetType) {
      case "count":
        return (
          <div className="text-center py-8">
            <div className="text-5xl font-bold text-primary mb-2">247</div>
            <div className="text-sm text-muted-foreground">{widget.name}</div>
          </div>
        );
      case "chart":
        return (
          <div className="py-6 px-4">
            <div className="flex items-end gap-2 h-32 justify-center">
              {[40, 65, 45, 80, 55, 70, 90, 60].map((h, i) => (
                <div key={i} className="bg-primary/60 rounded-t-md w-8 transition-all hover:bg-primary" style={{ height: `${h}%` }} />
              ))}
            </div>
            <div className="text-xs text-muted-foreground text-center mt-3">{widget.name}</div>
          </div>
        );
      case "pie":
        return (
          <div className="py-6 flex flex-col items-center">
            <div className="w-28 h-28 rounded-full border-8 border-primary/30 relative mb-3"
              style={{ background: "conic-gradient(hsl(var(--primary)) 0% 35%, hsl(var(--primary) / 0.5) 35% 65%, hsl(var(--primary) / 0.2) 65% 100%)" }} />
            <div className="text-xs text-muted-foreground">{widget.name}</div>
          </div>
        );
      case "trend":
        return (
          <div className="py-6 px-4 text-center">
            <div className="text-xl sm:text-3xl font-bold text-green-400 mb-1">+12.5%</div>
            <TrendingUp className="w-6 h-6 text-green-400 mx-auto mb-2" />
            <div className="text-xs text-muted-foreground">{widget.name}</div>
          </div>
        );
      case "kpi":
        return (
          <div className="py-6 text-center">
            <div className="text-4xl font-bold text-primary mb-1">98.2%</div>
            <div className="w-full bg-muted rounded-full h-2 mx-auto max-w-[200px] mb-2">
              <div className="bg-primary rounded-full h-2" style={{ width: "98.2%" }} />
            </div>
            <div className="text-xs text-muted-foreground">{widget.name}</div>
          </div>
        );
      case "list":
        return (
          <div className="py-4 px-4 space-y-2">
            {["פריט ראשון", "פריט שני", "פריט שלישי", "פריט רביעי"].map((item, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg text-sm">
                <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-xs text-primary">{i + 1}</span>
                {item}
              </div>
            ))}
            <div className="text-xs text-muted-foreground text-center mt-2">{widget.name}</div>
          </div>
        );
      default:
        return (
          <div className="py-8 text-center">
            <WtIcon className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <div className="text-sm text-muted-foreground">{widget.name}</div>
          </div>
        );
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
        className="bg-card border border-border rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-bold flex items-center gap-2"><Eye className="w-5 h-5 text-primary" />תצוגה מקדימה</h2>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5">
          <div className="bg-background border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${wtConfig.color}`}>
                <WtIcon className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm font-medium">{widget.name}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-md mr-2 ${wtConfig.color}`}>{wtConfig.label}</span>
              </div>
            </div>
            {renderPreview()}
          </div>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="widgets" />
        <RelatedRecords entityType="widgets" />
      </div>
      </motion.div>
    </motion.div>
  );
}
