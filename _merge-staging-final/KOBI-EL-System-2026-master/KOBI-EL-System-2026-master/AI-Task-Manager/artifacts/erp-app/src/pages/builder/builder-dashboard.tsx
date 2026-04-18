import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { usePlatformModules, PLATFORM_MODULES_QUERY_KEY } from "@/hooks/usePlatformModules";
import {
  Plus, Search, Box, ChevronLeft, Layers, Database, Blocks,
  Edit2, Trash2, MoreVertical, Globe, CheckCircle, Archive,
  FileText, Zap, Settings, BarChart3, Eye, Sidebar, LayoutDashboard,
  FormInput, Table2, CreditCard, MenuSquare, FolderTree, CircleDot,
  MousePointerClick, ShieldCheck, GitBranch, ClipboardList,
  LayoutGrid, FileCode, Bot, Link2, Activity, Upload,
  Workflow, BellRing, FileBarChart, FileOutput, Plug, Cpu, Wrench,
  Copy, Filter, Shield
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { MODULE_ICONS, STATUS_COLORS } from "./field-type-registry";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

interface PlatformModule {
  id: number;
  name: string;
  nameHe: string | null;
  nameEn: string | null;
  slug: string;
  moduleKey: string | null;
  description: string | null;
  icon: string;
  color: string;
  category: string;
  parentModuleId: number | null;
  status: string;
  version: number;
  settings: any;
  sortOrder: number;
  isSystem: boolean;
  showInSidebar: boolean;
  showInDashboard: boolean;
  permissionsScope: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  entities?: any[];
}

interface BuilderModuleDef {
  id: string;
  name: string;
  nameEn: string;
  icon: any;
  description: string;
  path: string;
  color: string;
}

const BUILDER_LAYERS: { title: string; titleEn: string; color: string; gradient: string; modules: BuilderModuleDef[] }[] = [
  {
    title: "שכבה 1 — Core (בסיס)",
    titleEn: "Layer 1 — Core",
    color: "blue",
    gradient: "from-blue-600/20 to-cyan-600/10",
    modules: [
      { id: "core-metadata", name: "Core Metadata", nameEn: "Core Metadata Module", icon: Cpu, description: "Registry מרכזי, integrity check, metadata versioning", path: "/builder/modules", color: "blue" },
      { id: "runtime-engine", name: "מנוע Runtime", nameEn: "Runtime Engine", icon: Activity, description: "CRUD דינמי, field rendering, validation engine", path: "/builder/modules", color: "cyan" },
      { id: "module-builder", name: "בונה מודולים", nameEn: "Module Builder", icon: Blocks, description: "CRUD מודולים, publish/unpublish, היררכיה", path: "/builder/modules", color: "indigo" },
      { id: "entity-builder", name: "בונה ישויות", nameEn: "Entity Builder", icon: Database, description: "CRUD ישויות, סוגי ישויות, display field", path: "/builder/entities", color: "sky" },
      { id: "field-builder", name: "בונה שדות", nameEn: "Field Builder", icon: FileText, description: "כל סוגי שדות, validation rules, display rules", path: "/builder/fields", color: "violet" },
      { id: "relation-builder", name: "בונה קשרים", nameEn: "Relation Builder", icon: Link2, description: "1:1, 1:N, N:M, lookup field, cascadeDelete", path: "/builder/relations", color: "amber" },
    ],
  },
  {
    title: "שכבה 2 — UI & Layout",
    titleEn: "Layer 2 — UI & Layout",
    color: "green",
    gradient: "from-green-600/20 to-emerald-600/10",
    modules: [
      { id: "form-builder", name: "בונה טפסים", nameEn: "Form Builder", icon: FormInput, description: "sections, field layout, formType, default form", path: "/builder/forms", color: "green" },
      { id: "view-builder", name: "בונה תצוגות", nameEn: "View Builder", icon: Table2, description: "table/cards/kanban/calendar, columns, filters", path: "/builder/views", color: "teal" },
      { id: "detail-page-builder", name: "בונה דפי פרטים", nameEn: "Detail Page Builder", icon: CreditCard, description: "header section, tabs, related records, widgets", path: "/builder/details", color: "pink" },
      { id: "menu-builder", name: "בונה תפריטים", nameEn: "Menu Builder", icon: MenuSquare, description: "פריטי תפריט היררכיים, role-based visibility", path: "/menu-builder", color: "slate" },
    ],
  },
  {
    title: "שכבה 3 — Business Logic",
    titleEn: "Layer 3 — Business Logic",
    color: "purple",
    gradient: "from-purple-600/20 to-violet-600/10",
    modules: [
      { id: "categories-builder", name: "בונה קטגוריות", nameEn: "Categories Builder", icon: FolderTree, description: "taxonomies היררכיות, tree editor, multi-taxonomy", path: "/builder/categories", color: "lime" },
      { id: "status-builder", name: "בונה סטטוסים", nameEn: "Status Builder", icon: CircleDot, description: "state machine, transitions, conditions, trigger actions", path: "/builder/statuses", color: "sky" },
      { id: "buttons-builder", name: "בונה כפתורים", nameEn: "Buttons Builder", icon: MousePointerClick, description: "מיקומים, visibility conditions, קישור ל-action", path: "/builder/buttons", color: "indigo" },
      { id: "actions-builder", name: "בונה פעולות", nameEn: "Actions Builder", icon: Zap, description: "status_change, update_field, create_record, notification", path: "/builder/actions", color: "yellow" },
      { id: "validation-builder", name: "בונה ולידציות", nameEn: "Validation Builder", icon: ShieldCheck, description: "cross-field rules, conditional validation, custom expressions", path: "/builder/validations", color: "red" },
    ],
  },
  {
    title: "שכבה 4 — Governance",
    titleEn: "Layer 4 — Governance",
    color: "red",
    gradient: "from-red-600/20 to-orange-600/10",
    modules: [
      { id: "permissions-builder", name: "בונה הרשאות", nameEn: "Permissions Builder", icon: ShieldCheck, description: "RBAC, roles, הרשאות module/entity/field/record", path: "/builder/permissions", color: "red" },
      { id: "versioning-builder", name: "טיוטה/פרסום/גרסאות", nameEn: "Draft/Publish/Versioning", icon: GitBranch, description: "metadata draft mode, publish, version history, rollback", path: "/builder/publish", color: "green" },
      { id: "audit-layer", name: "שכבת Audit", nameEn: "Audit Layer", icon: ClipboardList, description: "record audit log, metadata audit log, timeline UI", path: "/audit-log", color: "orange" },
    ],
  },
  {
    title: "שכבה 5 — Intelligence & Automation",
    titleEn: "Layer 5 — Intelligence & Automation",
    color: "amber",
    gradient: "from-amber-600/20 to-yellow-600/10",
    modules: [
      { id: "dashboard-builder", name: "בונה דשבורדים", nameEn: "Dashboard Builder", icon: LayoutDashboard, description: "widget types, grid layout, data source config", path: "/builder/dashboards", color: "cyan" },
      { id: "template-builder", name: "בונה תבניות", nameEn: "Template Builder", icon: FileCode, description: "document/email/notification, placeholders, תצוגה מקדימה", path: "/builder/templates", color: "purple" },
      { id: "workflow-builder", name: "בונה תהליכים", nameEn: "Workflow Builder", icon: Workflow, description: "multi-step processes, conditions, branching, approvals", path: "/builder/workflows", color: "blue" },
      { id: "automation-builder", name: "בונה אוטומציות", nameEn: "Automation Builder", icon: BellRing, description: "trigger → condition → action, on/off, execution log", path: "/builder/automations", color: "amber" },
      { id: "business-rules-builder", name: "חוקי עסק", nameEn: "Business Rules Engine", icon: Shield, description: "IF/THEN/ELSE policies — block, warn, require_approval, cross-module enforcement", path: "/builder/business-rules", color: "green" },
      { id: "context-builder", name: "בונה הקשרים", nameEn: "Context Builder", icon: Layers, description: "כללי הקשר דינמיים — role/status/entity/conditional, effects על UI", path: "/builder/contexts", color: "rose" },
    ],
  },
  {
    title: "שכבה 6 — Output & Connectivity",
    titleEn: "Layer 6 — Output & Connectivity",
    color: "teal",
    gradient: "from-teal-600/20 to-emerald-600/10",
    modules: [
      { id: "report-builder", name: "בונה דוחות", nameEn: "Report Builder", icon: FileBarChart, description: "tabular reports, aggregations, filters, export", path: "/report-builder", color: "blue" },
      { id: "document-builder", name: "בונה מסמכים", nameEn: "Document Builder", icon: FileOutput, description: "document types, auto-numbering, PDF generation", path: "/document-builder", color: "green" },
      { id: "integration-builder", name: "בונה אינטגרציות", nameEn: "Integration Builder", icon: Plug, description: "external API connections, field mapping, webhooks", path: "/integration-builder", color: "violet" },
      { id: "ai-builder", name: "בונה AI", nameEn: "AI Builder", icon: Bot, description: "AI actions per entity/field, prompt templates, context config", path: "/ai-builder", color: "pink" },
      { id: "tool-builder", name: "בונה כלים", nameEn: "Tool Builder", icon: Wrench, description: "כלים מותאמים: ייבוא, ייצוא, חישובים, טרנספורמציות, כלי דיווח", path: "/builder/tools", color: "amber" },
    ],
  },
];

const LAYER_COLORS: Record<string, string> = {
  blue: "border-blue-500/30",
  green: "border-green-500/30",
  purple: "border-purple-500/30",
  red: "border-red-500/30",
  amber: "border-amber-500/30",
  teal: "border-teal-500/30",
};

const MODULE_COLOR_MAP: Record<string, string> = {
  blue: "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20",
  cyan: "bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20",
  indigo: "bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20",
  sky: "bg-sky-500/10 text-sky-400 hover:bg-sky-500/20",
  violet: "bg-violet-500/10 text-violet-400 hover:bg-violet-500/20",
  amber: "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20",
  green: "bg-green-500/10 text-green-400 hover:bg-green-500/20",
  teal: "bg-teal-500/10 text-teal-400 hover:bg-teal-500/20",
  pink: "bg-pink-500/10 text-pink-400 hover:bg-pink-500/20",
  slate: "bg-muted/10 text-muted-foreground hover:bg-muted/20",
  lime: "bg-lime-500/10 text-lime-400 hover:bg-lime-500/20",
  yellow: "bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20",
  red: "bg-red-500/10 text-red-400 hover:bg-red-500/20",
  orange: "bg-orange-500/10 text-orange-400 hover:bg-orange-500/20",
  purple: "bg-purple-500/10 text-purple-400 hover:bg-purple-500/20",
  rose: "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20",
};

export default function BuilderDashboard() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editModule, setEditModule] = useState<PlatformModule | null>(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"layers" | "modules">("layers");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;

  const { modules, isLoading } = usePlatformModules();

  const createMutation = useMutation({
    mutationFn: (data: any) => authFetch(`${API}/platform/modules`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }).then(r => { if (!r.ok) return r.json().then(e => Promise.reject(e)); return r.json(); }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: PLATFORM_MODULES_QUERY_KEY }); setShowCreate(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => authFetch(`${API}/platform/modules/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }).then(r => { if (!r.ok) return r.json().then(e => Promise.reject(e)); return r.json(); }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: PLATFORM_MODULES_QUERY_KEY }); setEditModule(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/platform/modules/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PLATFORM_MODULES_QUERY_KEY }),
  });

  const cloneMutation = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/platform/modules/${id}/clone`, { method: "POST" }).then(r => {
      if (!r.ok) return r.json().then(e => Promise.reject(e));
      return r.json();
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PLATFORM_MODULES_QUERY_KEY }),
  });

  const totalBuilderModules = BUILDER_LAYERS.reduce((sum, l) => sum + l.modules.length, 0);

  const filteredLayers = search
    ? BUILDER_LAYERS.map(layer => ({
        ...layer,
        modules: layer.modules.filter(m =>
          m.name.includes(search) || m.nameEn.toLowerCase().includes(search.toLowerCase()) || m.description.includes(search)
        ),
      })).filter(l => l.modules.length > 0)
    : BUILDER_LAYERS;

  const categories = Array.from(new Set(modules.map(m => m.category))).filter(Boolean);

  const filteredModules = modules.filter(m => {
    if (filterStatus !== "all" && m.status !== filterStatus) return false;
    if (filterCategory !== "all" && m.category !== filterCategory) return false;
    if (search && !m.name.includes(search) && !(m.nameEn || "").toLowerCase().includes(search.toLowerCase()) && !(m.slug || "").includes(search) && !(m.description || "").includes(search)) return false;
    return true;
  });

  const statusLabel: Record<string, string> = { draft: "טיוטה", published: "פורסם", archived: "בארכיון" };
  const statusColor: Record<string, string> = { draft: "text-yellow-400", published: "text-green-400", archived: "text-muted-foreground" };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold">בונה הפלטפורמה</h1>
          <p className="text-muted-foreground mt-1">
            {totalBuilderModules} מודולי בנייה ב-{BUILDER_LAYERS.length} שכבות — ארכיטקטורה מלאה מ-Metadata
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-muted rounded-xl p-0.5">
            <button onClick={() => setViewMode("layers")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${viewMode === "layers" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <Layers className="w-4 h-4 inline mr-1" />שכבות
            </button>
            <button onClick={() => setViewMode("modules")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${viewMode === "modules" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <Blocks className="w-4 h-4 inline mr-1" />מודולים
            </button>
          </div>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
            <Plus className="w-5 h-5" />
            מודול חדש
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={Blocks} label="מודולי בנייה" value={totalBuilderModules} color="blue" />
        <StatCard icon={Layers} label="שכבות" value={BUILDER_LAYERS.length} color="purple" />
        <StatCard icon={Database} label="מודולי נתונים" value={modules.length} color="green" />
        <StatCard icon={CheckCircle} label="פורסמו" value={modules.filter(m => m.status === "published").length} color="teal" />
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש מודולי בנייה..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
      </div>

      {viewMode === "modules" && (
        <div className="flex items-center gap-3 flex-wrap">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
            <option value="all">כל הסטטוסים</option>
            <option value="draft">טיוטה</option>
            <option value="published">פורסם</option>
            <option value="archived">בארכיון</option>
          </select>
          {categories.length > 1 && (
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="px-3 py-2 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              <option value="all">כל הקטגוריות</option>
              {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          )}
          {(filterStatus !== "all" || filterCategory !== "all") && (
            <button onClick={() => { setFilterStatus("all"); setFilterCategory("all"); }} className="text-xs text-primary hover:underline">
              נקה סינון
            </button>
          )}
          <span className="text-xs text-muted-foreground mr-auto">{filteredModules.length} מתוך {modules.length}</span>
        </div>
      )}

      {viewMode === "layers" ? (
        <div className="space-y-8">
          {filteredLayers.map((layer, li) => (
            <motion.div key={layer.titleEn} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: li * 0.08 }}>
              <div className={`bg-gradient-to-l ${layer.gradient} rounded-2xl border ${LAYER_COLORS[layer.color] || "border-border"} p-6`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-card/10 flex items-center justify-center">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">{layer.title}</h2>
                    <p className="text-xs text-muted-foreground">{layer.titleEn} — {layer.modules.length} מודולים</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {layer.modules.map((mod, mi) => {
                    const ModIcon = mod.icon;
                    const colorClass = MODULE_COLOR_MAP[mod.color] || MODULE_COLOR_MAP.blue;
                    return (
                      <Link key={mod.id} href={mod.path}>
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: li * 0.08 + mi * 0.04 }}
                          className={`bg-card/80 backdrop-blur border border-border rounded-xl p-4 cursor-pointer hover:border-primary/30 transition-all group`}
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorClass}`}>
                              <ModIcon className="w-4.5 h-4.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-sm truncate">{mod.name}</h3>
                              <p className="text-xs text-muted-foreground">{mod.nameEn}</p>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{mod.description}</p>
                        </motion.div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <>
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredModules.length === 0 ? (
            <EmptyState onCreateClick={() => setShowCreate(true)} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredModules.map((mod, i) => {
                const StatusIcon = mod.status === "published" ? CheckCircle : mod.status === "archived" ? Archive : Edit2;
                return (
                  <motion.div key={mod.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    className="bg-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-all group">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Box className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{mod.nameHe || mod.name}</h3>
                          {mod.nameEn && <p className="text-xs text-muted-foreground">{mod.nameEn}</p>}
                          <p className="text-xs text-muted-foreground">{mod.moduleKey || mod.slug}</p>
                        </div>
                      </div>
                      <span className={`flex items-center gap-1 text-xs ${statusColor[mod.status]}`}>
                        <StatusIcon className="w-3.5 h-3.5" />
                        {statusLabel[mod.status]}
                      </span>
                    </div>
                    {mod.description && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{mod.description}</p>}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4 flex-wrap">
                      <span className="px-2 py-0.5 bg-muted rounded-md">{mod.category}</span>
                      <span>v{mod.version}</span>
                      {mod.showInSidebar && <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded-md"><Sidebar className="w-3 h-3" />סרגל</span>}
                      {mod.showInDashboard && <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded-md"><LayoutDashboard className="w-3 h-3" />דשבורד</span>}
                      {mod.isSystem && <span className="px-1.5 py-0.5 bg-orange-500/10 text-orange-400 rounded-md">מערכת</span>}
                    </div>
                    <div className="flex items-center gap-2 pt-3 border-t border-border/50">
                      <Link href={`/builder/module/${mod.id}`} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary/10 text-primary rounded-lg text-sm font-medium hover:bg-primary/20 transition-colors">
                        <Settings className="w-4 h-4" />
                        עריכה
                      </Link>
                      <button onClick={() => setEditModule(mod)} className="p-2 hover:bg-muted rounded-lg transition-colors" title="עריכה מהירה"><Edit2 className="w-4 h-4 text-muted-foreground" /></button>
                      <button onClick={async () => { if (await globalConfirm("שכפול מודול", { itemName: mod.name, entityType: "מודול", requireTypedConfirm: false })) cloneMutation.mutate(mod.id); }} className="p-2 hover:bg-blue-500/10 rounded-lg transition-colors" title="שכפל מודול" disabled={cloneMutation.isPending}><Copy className="w-4 h-4 text-blue-400" /></button>
                      {isSuperAdmin && (
                        <button onClick={async () => { const ok = await globalConfirm("מחיקת מודול", { itemName: mod.name, entityType: "מודול" }); if (ok) deleteMutation.mutate(mod.id); }} className="p-2 hover:bg-destructive/10 rounded-lg transition-colors" title="מחק"><Trash2 className="w-4 h-4 text-destructive" /></button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {(showCreate || editModule) && (
          <ModuleFormModal
            module={editModule}
            onClose={() => { setShowCreate(false); setEditModule(null); }}
            onSubmit={(data) => {
              if (editModule) {
                updateMutation.mutate({ id: editModule.id, ...data });
              } else {
                createMutation.mutate(data);
              }
            }}
            isLoading={createMutation.isPending || updateMutation.isPending}
            error={createMutation.error instanceof Error ? createMutation.error.message : updateMutation.error instanceof Error ? updateMutation.error.message : null}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-500/10 text-blue-400",
    green: "bg-green-500/10 text-green-400",
    yellow: "bg-yellow-500/10 text-yellow-400",
    purple: "bg-purple-500/10 text-purple-400",
    teal: "bg-teal-500/10 text-teal-400",
  };
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-lg sm:text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
        <Blocks className="w-8 h-8 text-primary/50" />
      </div>
      <h3 className="text-xl font-semibold mb-2">ברוכים הבאים לבונה הפלטפורמה</h3>
      <p className="text-muted-foreground mb-6 max-w-md mx-auto">צור את המודול הראשון שלך — לקוחות, ספקים, מלאי, פרויקטים או כל דבר אחר. הכל נבנה דינמית מ-Metadata.</p>
      <button onClick={onCreateClick} className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
        <Plus className="w-5 h-5" />
        צור מודול ראשון
      </button>
    </div>
  );
}

function SlugInput({ value, onChange, currentModuleSlug, onStatusChange }: { value: string; onChange: (val: string) => void; currentModuleSlug?: string; onStatusChange?: (status: "idle" | "checking" | "available" | "taken") => void }) {
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");

  const updateStatus = (status: "idle" | "checking" | "available" | "taken") => {
    setSlugStatus(status);
    onStatusChange?.(status);
  };

  const checkSlug = async (slug: string) => {
    if (!slug || slug === currentModuleSlug) {
      updateStatus("idle");
      return;
    }
    updateStatus("checking");
    try {
      const res = await authFetch(`${API}/platform/modules/check-slug/${encodeURIComponent(slug)}`);
      const data = await res.json();
      updateStatus(data.exists ? "taken" : "available");
    } catch {
      updateStatus("idle");
    }
  };

  return (
    <div className="relative">
      <input value={value} onChange={e => { onChange(e.target.value); updateStatus("idle"); }} onBlur={() => checkSlug(value)} dir="ltr"
        placeholder="customers" className={`w-full px-3 py-2.5 bg-background border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 ${slugStatus === "taken" ? "border-destructive" : slugStatus === "available" ? "border-green-500" : "border-border"}`} />
      {slugStatus === "checking" && <span className="absolute left-2 top-3 text-xs text-muted-foreground">בודק...</span>}
      {slugStatus === "available" && <span className="absolute left-2 top-3 text-xs text-green-500">פנוי ✓</span>}
      {slugStatus === "taken" && <span className="absolute left-2 top-3 text-xs text-destructive">תפוס ✗</span>}
    </div>
  );
}

function ModuleFormModal({ module, onClose, onSubmit, isLoading, error }: {
  module: PlatformModule | null;
  onClose: () => void;
  onSubmit: (data: any) => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<{
    name: string; nameHe: string; nameEn: string; slug: string; moduleKey: string;
    description: string; icon: string; color: string; category: string; status: string;
    isSystem: boolean; showInSidebar: boolean; showInDashboard: boolean;
    permissionsScope: string; notes: string; sortOrder: number;
    landingPage: string; defaultSort: string; pageSize: number;
  }>({
    name: module?.name || "",
    nameHe: module?.nameHe || "",
    nameEn: module?.nameEn || "",
    slug: module?.slug || "",
    moduleKey: module?.moduleKey || "",
    description: module?.description || "",
    icon: module?.icon || "Box",
    color: module?.color || "blue",
    category: module?.category || "כללי",
    status: module?.status || "draft",
    isSystem: module?.isSystem ?? false,
    showInSidebar: module?.showInSidebar ?? true,
    showInDashboard: module?.showInDashboard ?? false,
    permissionsScope: module?.permissionsScope || "",
    notes: module?.notes || "",
    sortOrder: module?.sortOrder || 0,
    landingPage: module?.settings?.landingPage || "list",
    defaultSort: module?.settings?.defaultSort || "created_desc",
    pageSize: module?.settings?.pageSize || 25,
  });

  const [slugTaken, setSlugTaken] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const autoSlug = (name: string) => name.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");

  const checkSlugBeforeSubmit = async (): Promise<boolean> => {
    if (form.slug === module?.slug) return true;
    try {
      const res = await authFetch(`${API}/platform/modules/check-slug/${encodeURIComponent(form.slug)}${module?.id ? `?excludeId=${module.id}` : ""}`);
      const data = await res.json();
      if (data.exists) {
        setSlugTaken(true);
        return false;
      }
      return true;
    } catch {
      return true;
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">{module ? "עריכת מודול" : "מודול חדש"}</h2>

        {error && <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-xl text-sm">{error}</div>}

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">שם המודול (עברית) *</label>
              <input value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value, nameHe: e.target.value, ...(!module ? { slug: autoSlug(e.target.value), moduleKey: autoSlug(e.target.value) } : {}) })); }}
                placeholder="למשל: ניהול לקוחות" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">שם באנגלית</label>
              <input value={form.nameEn} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))} dir="ltr"
                placeholder="Customer Management" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Slug *</label>
              <SlugInput value={form.slug} onChange={(val: string) => setForm(f => ({ ...f, slug: val }))} currentModuleSlug={module?.slug} onStatusChange={(s) => setSlugTaken(s === "taken")} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">מפתח מודול</label>
              <input value={form.moduleKey} onChange={e => setForm(f => ({ ...f, moduleKey: e.target.value }))} dir="ltr"
                placeholder="customers" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">תיאור</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
              placeholder="תיאור קצר של המודול..." className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">קטגוריה</label>
              <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="כללי" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">סטטוס</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="draft">טיוטה</option>
                <option value="published">פורסם</option>
                <option value="archived">בארכיון</option>
              </select>
            </div>
          </div>
          <div className="p-4 bg-muted/20 border border-border rounded-xl space-y-3">
            <label className="block text-sm font-semibold">הגדרות מתקדמות</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">עמוד נחיתה</label>
                <select value={form.landingPage} onChange={e => setForm(f => ({ ...f, landingPage: e.target.value }))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="list">רשימה</option>
                  <option value="dashboard">לוח מחוונים</option>
                  <option value="kanban">קנבן</option>
                  <option value="calendar">לוח שנה</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">מיון ברירת מחדל</label>
                <select value={form.defaultSort} onChange={e => setForm(f => ({ ...f, defaultSort: e.target.value }))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="created_desc">חדש ← ישן</option>
                  <option value="created_asc">ישן ← חדש</option>
                  <option value="updated_desc">עדכון אחרון</option>
                  <option value="name_asc">א-ת (שם)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">רשומות לעמוד</label>
              <input type="number" min={5} max={200} value={form.pageSize} onChange={e => setForm(f => ({ ...f, pageSize: Number(e.target.value) }))}
                className="w-24 px-3 py-2 bg-background border border-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { key: "showInSidebar", label: "הצג בסרגל צד" },
              { key: "showInDashboard", label: "הצג בדשבורד" },
              { key: "isSystem", label: "מודול מערכת" },
            ].map(opt => (
              <label key={opt.key} className="flex items-center gap-2 cursor-pointer p-2.5 bg-background border border-border rounded-xl">
                <input type="checkbox" checked={form[opt.key as keyof typeof form] as boolean} onChange={e => setForm(f => ({ ...f, [opt.key]: e.target.checked }))}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
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
        </div>
        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={async () => {
              setSubmitting(true);
              const slugOk = await checkSlugBeforeSubmit();
              if (!slugOk) { setSubmitting(false); return; }
              const { landingPage, defaultSort, pageSize, ...rest } = form;
              const submitData = { ...rest, settings: { ...(module?.settings || {}), landingPage, defaultSort, pageSize } };
              onSubmit(submitData);
              setSubmitting(false);
            }} disabled={!form.name || form.name.length < 2 || form.name.length > 100 || !form.slug || form.slug.length < 2 || form.slug.length > 50 || slugTaken || isLoading || submitting}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : module ? "עדכן" : "צור מודול"}
          </button>
          {(form.name.length > 0 && form.name.length < 2) && <span className="text-xs text-destructive">שם חייב להיות לפחות 2 תווים</span>}
          {form.slug.length > 50 && <span className="text-xs text-destructive">Slug מקסימום 50 תווים</span>}
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="builder-dashboard" />
        <RelatedRecords entityType="builder-dashboard" />
      </div>
      </motion.div>
    </motion.div>
  );
}
