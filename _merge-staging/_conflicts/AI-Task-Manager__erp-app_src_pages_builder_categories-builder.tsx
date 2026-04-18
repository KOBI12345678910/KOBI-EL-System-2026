import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { authFetch } from "@/lib/utils";
import {
  Plus, Trash2, Edit2, FolderTree, ChevronRight, ChevronDown, X, Copy, Search,
  Settings, Tag
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { STATUS_COLORS } from "./field-type-registry";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

interface CategoryDefinition {
  id: number;
  entityId: number;
  name: string;
  slug: string;
  description?: string;
  allowMultiple: boolean;
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
}

interface Category {
  id: number;
  entityId: number;
  parentId: number | null;
  name: string;
  slug: string;
  icon?: string;
  color?: string;
  sortOrder: number;
  isActive: boolean;
}

function buildTree(categories: any): (Category & { children: Category[] })[] {
  const map = new Map<number, Category & { children: Category[] }>();
  const items = Array.isArray(categories) ? categories : [];
  items.forEach(c => map.set(c.id, { ...c, children: [] }));
  const roots: (Category & { children: Category[] })[] = [];
  map.forEach(cat => {
    if (cat.parentId && map.has(cat.parentId)) {
      map.get(cat.parentId)!.children.push(cat);
    } else {
      roots.push(cat);
    }
  });
  return roots;
}

export function CategoriesTab({ entityId }: { entityId: number }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [showDefForm, setShowDefForm] = useState(false);
  const [editingDef, setEditingDef] = useState<CategoryDefinition | null>(null);
  const [activeView, setActiveView] = useState<"items" | "definitions">("items");
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["entity-category-items", entityId],
    queryFn: () => authFetch(`${API}/platform/entities/${entityId}/category-items`).then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/entities/${entityId}/category-items`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create category item");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["entity-category-items", entityId] }); setShowForm(false); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const r = await authFetch(`${API}/platform/category-items/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update category item");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["entity-category-items", entityId] }); setEditingCategory(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/platform/category-items/${id}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entity-category-items", entityId] }),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/platform/category-items/${id}/duplicate`, { method: "POST" });
      if (!r.ok) throw new Error("Failed to duplicate");
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entity-category-items", entityId] }),
  });

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const { data: categoryDefs = [] } = useQuery<CategoryDefinition[]>({
    queryKey: ["category-definitions", entityId],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/entities/${entityId}/category-definitions`);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const createDefMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/entities/${entityId}/category-definitions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create category definition");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["category-definitions", entityId] }); setShowDefForm(false); },
  });

  const updateDefMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const r = await authFetch(`${API}/platform/category-definitions/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update category definition");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["category-definitions", entityId] }); setEditingDef(null); },
  });

  const deleteDefMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/platform/category-definitions/${id}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["category-definitions", entityId] }),
  });

  const filteredCategories = search
    ? categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.slug.toLowerCase().includes(search.toLowerCase()))
    : categories;
  const tree = buildTree(filteredCategories);

  const renderNode = (node: Category & { children: Category[] }, depth: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const colorDef = STATUS_COLORS.find(c => c.key === node.color);

    return (
      <div key={node.id}>
        <div className={`flex items-center gap-2 px-3 py-2 hover:bg-muted/30 rounded-lg transition-colors group`} style={{ paddingRight: `${depth * 20 + 12}px` }}>
          {hasChildren ? (
            <button onClick={() => toggleExpand(node.id)} className="p-0.5">
              {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </button>
          ) : (
            <span className="w-5" />
          )}
          {colorDef && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorDef.hex }} />}
          <FolderTree className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium flex-1">{node.name}</span>
          <span className="text-xs text-muted-foreground">{node.slug}</span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => duplicateMutation.mutate(node.id)} className="p-1 hover:bg-muted rounded" title="שכפול"><Copy className="w-3.5 h-3.5 text-muted-foreground" /></button>
            <button onClick={() => { setEditingCategory(node); }} className="p-1 hover:bg-muted rounded"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
            <button onClick={() => { setShowForm(true); setEditingCategory({ ...node, id: -1, parentId: node.id, name: "", slug: "" } as any); }} className="p-1 hover:bg-muted rounded" title="הוסף תת-קטגוריה"><Plus className="w-3.5 h-3.5 text-muted-foreground" /></button>
            {isSuperAdmin && (
              <button onClick={async () => { const ok = await globalConfirm("מחיקת קטגוריה", { itemName: node.name, entityType: "קטגוריה" }); if (ok) deleteMutation.mutate(node.id); }} className="p-1 hover:bg-destructive/10 rounded"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
            )}
          </div>
        </div>
        {hasChildren && isExpanded && node.children.map(child => renderNode(child as any, depth + 1))}
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl">
          <button onClick={() => setActiveView("items")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeView === "items" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <FolderTree className="w-3.5 h-3.5" />פריטים ({categories.length})
          </button>
          <button onClick={() => setActiveView("definitions")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeView === "definitions" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <Tag className="w-3.5 h-3.5" />הגדרות ({categoryDefs.length})
          </button>
        </div>
        <div className="flex-1" />
        {activeView === "items" && (
          <>
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש קטגוריות..."
                className="w-full pr-10 pl-4 py-2 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <button onClick={() => { setEditingCategory(null); setShowForm(true); }} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
              <Plus className="w-4 h-4" />קטגוריה חדשה
            </button>
          </>
        )}
        {activeView === "definitions" && (
          <button onClick={() => { setEditingDef(null); setShowDefForm(true); }} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" />הגדרת קטגוריה
          </button>
        )}
      </div>

      {activeView === "items" && (
        <>
          {categories.length === 0 ? (
            <div className="bg-card border border-border/50 rounded-2xl p-8 text-center">
              <FolderTree className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground mb-4">אין קטגוריות — הוסף קטגוריות לסיווג רשומות</p>
              <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium"><Plus className="w-4 h-4" />הוסף קטגוריה</button>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl p-2">
              {tree.map(node => renderNode(node))}
            </div>
          )}
        </>
      )}

      {activeView === "definitions" && (
        <>
          {categoryDefs.length === 0 ? (
            <div className="bg-card border border-border/50 rounded-2xl p-8 text-center">
              <Tag className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground mb-4">אין הגדרות קטגוריה — הוסף הגדרה לקבוצת קטגוריות</p>
              <button onClick={() => setShowDefForm(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium"><Plus className="w-4 h-4" />הגדרת קטגוריה</button>
            </div>
          ) : (
            <div className="space-y-3">
              {categoryDefs.map(def => (
                <div key={def.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center">
                        <Tag className="w-5 h-5 text-teal-400" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{def.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>{def.slug}</span>
                          {def.allowMultiple && <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded-md">מרובה</span>}
                          {def.isRequired && <span className="px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded-md">חובה</span>}
                          {!def.isActive && <span className="px-1.5 py-0.5 bg-muted/10 text-muted-foreground rounded-md">לא פעיל</span>}
                          {def.description && <span>· {def.description}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditingDef(def)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      {isSuperAdmin && (
                        <button onClick={async () => { const ok = await globalConfirm("מחיקת הגדרת קטגוריה", { itemName: def.name, entityType: "הגדרת קטגוריה" }); if (ok) deleteDefMutation.mutate(def.id); }} className="p-1.5 hover:bg-destructive/10 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {(showForm || editingCategory) && (
        <CategoryFormModal
          category={editingCategory?.id !== -1 ? editingCategory : null}
          parentId={editingCategory?.id === -1 ? editingCategory.parentId : null}
          categories={categories}
          onClose={() => { setShowForm(false); setEditingCategory(null); }}
          onSubmit={(data) => {
            if (editingCategory && editingCategory.id !== -1) {
              updateMutation.mutate({ id: editingCategory.id, ...data });
            } else {
              createMutation.mutate(data);
            }
          }}
          isLoading={createMutation.isPending || updateMutation.isPending}
        />
      )}

      {(showDefForm || editingDef) && (
        <CategoryDefFormModal
          definition={editingDef}
          onClose={() => { setShowDefForm(false); setEditingDef(null); }}
          onSubmit={(data) => {
            if (editingDef) updateDefMutation.mutate({ id: editingDef.id, ...data });
            else createDefMutation.mutate(data);
          }}
          isLoading={createDefMutation.isPending || updateDefMutation.isPending}
        />
      )}
    </div>
  );
}

function CategoryFormModal({ category, parentId, categories, onClose, onSubmit, isLoading }: {
  category: Category | null; parentId: number | null; categories: Category[];
  onClose: () => void; onSubmit: (data: any) => void; isLoading: boolean;
}) {
  const [form, setForm] = useState({
    name: category?.name || "",
    slug: category?.slug || "",
    parentId: category?.parentId ?? parentId ?? null,
    color: category?.color || "",
    icon: category?.icon || "",
    isActive: category?.isActive ?? true,
  });

  const autoSlug = (name: string) => name.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">{category ? "עריכת קטגוריה" : "קטגוריה חדשה"}</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">שם הקטגוריה *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, ...(!category ? { slug: autoSlug(e.target.value) } : {}) }))}
              placeholder="למשל: אלקטרוניקה" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Slug *</label>
            <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} dir="ltr"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">קטגוריית אב</label>
            <select value={form.parentId ?? ""} onChange={e => setForm(f => ({ ...f, parentId: e.target.value ? Number(e.target.value) : null }))}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              <option value="">ללא (שורש)</option>
              {categories.filter(c => c.id !== category?.id).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">צבע</label>
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={() => setForm(f => ({ ...f, color: "" }))}
                className={`w-8 h-8 rounded-lg border-2 transition-all bg-muted ${!form.color ? "border-white scale-110" : "border-transparent"}`} title="ללא" />
              {STATUS_COLORS.map(c => (
                <button key={c.key} type="button" onClick={() => setForm(f => ({ ...f, color: c.key }))}
                  className={`w-8 h-8 rounded-lg border-2 transition-all ${form.color === c.key ? "border-white scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c.hex }} title={c.label} />
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={() => onSubmit(form)} disabled={!form.name || !form.slug || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : category ? "עדכן" : "הוסף קטגוריה"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function CategoryDefFormModal({ definition, onClose, onSubmit, isLoading }: {
  definition: CategoryDefinition | null; onClose: () => void; onSubmit: (data: any) => void; isLoading: boolean;
}) {
  const [form, setForm] = useState({
    name: definition?.name || "",
    slug: definition?.slug || "",
    description: definition?.description || "",
    allowMultiple: definition?.allowMultiple ?? false,
    isRequired: definition?.isRequired ?? false,
    isActive: definition?.isActive ?? true,
    sortOrder: definition?.sortOrder ?? 0,
  });
  const autoSlug = (name: string) => name.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">{definition ? "עריכת הגדרת קטגוריה" : "הגדרת קטגוריה חדשה"}</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">שם *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, ...(!definition ? { slug: autoSlug(e.target.value) } : {}) }))}
              placeholder="למשל: סוג מוצר" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Slug *</label>
            <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} dir="ltr"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">תיאור</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
              placeholder="תיאור קבוצת הקטגוריות..." className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.allowMultiple} onChange={e => setForm(f => ({ ...f, allowMultiple: e.target.checked }))}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
            <span className="text-sm">אפשר בחירת מספר קטגוריות</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isRequired} onChange={e => setForm(f => ({ ...f, isRequired: e.target.checked }))}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
            <span className="text-sm">שדה חובה</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
            <span className="text-sm">פעיל</span>
          </label>
        </div>
        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={() => onSubmit(form)} disabled={!form.name || !form.slug || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : definition ? "עדכן" : "הוסף הגדרה"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="categories" />
        <RelatedRecords entityType="categories" />
      </div>
      </motion.div>
    </motion.div>
  );
}
